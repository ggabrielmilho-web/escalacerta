"""Contas da Escala Certa: cadastro, login e recuperação de senha por e-mail.

Segue o padrão do login do Multpel:
  • senha com hash forte (werkzeug/scrypt), nunca guardada nem registrada em log;
  • resposta genérica ("e-mail ou senha inválidos") e mesmo tempo de resposta exista ou não a conta;
  • trava por CONTA com castigo crescente (15 min → 1 h → 4 h), temporária para não virar
    arma de quem quer travar a conta dos outros;
  • trava por IP só de volume, em memória, que se desfaz sozinha.
"""
import hashlib
import hmac
import re
import secrets
import threading
import time
from datetime import timedelta

from psycopg.errors import UniqueViolation
from werkzeug.security import check_password_hash, generate_password_hash

import banco
from config import config

MAX_TENTATIVAS = 5
BLOQUEIO_MIN = 15
MAX_FALHAS_IP = 50
SENHA_MIN = 8
CODIGO_VALIDADE_MIN = 15
CODIGO_MAX_TENTATIVAS = 5
CODIGOS_POR_HORA = 3

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# hash descartável: no caminho "e-mail não existe" gasta o mesmo tempo de um hash real
_HASH_ISCA = generate_password_hash(secrets.token_urlsafe(16))


class Erro(Exception):
    def __init__(self, mensagem, status=400):
        super().__init__(mensagem)
        self.mensagem, self.status = mensagem, status


def normalizar_email(email):
    return (email or "").strip().lower()


def validar_senha(senha):
    if len(senha or "") < SENHA_MIN:
        raise Erro(f"A senha precisa ter pelo menos {SENHA_MIN} caracteres.")
    if len(senha) > 200:
        raise Erro("Senha longa demais.")


def publico(u):
    """O que a página pode saber da conta. O acesso pago é ilimitado: não tem data de fim."""
    return {"email": u["email"], "ativo": u["liberado_em"] is not None}


def buscar(usuario_id):
    with banco.conexao() as con:
        return con.execute("SELECT * FROM usuarios WHERE id = %s", (usuario_id,)).fetchone()


# ---------------- cadastro ----------------
def criar(email, senha, ip):
    email = normalizar_email(email)
    if not EMAIL.match(email) or len(email) > 200:
        raise Erro("E-mail inválido.")
    validar_senha(senha)
    try:
        with banco.conexao() as con:
            uid = con.execute("INSERT INTO usuarios (email, senha_hash, criado) VALUES (%s, %s, %s) RETURNING id",
                              (email, generate_password_hash(senha), banco.agora())).fetchone()["id"]
    except UniqueViolation:
        raise Erro("Já existe conta com esse e-mail. Entre com a sua senha.", 409)
    banco.log(uid, email, ip, "cadastro")
    return buscar(uid)


# ---------------- trava por IP (volume, em memória) ----------------
_ip_falhas = {}
_ip_lock = threading.Lock()


def _ip_excedido(ip):
    with _ip_lock:
        n, expira = _ip_falhas.get(ip, (0, 0))
        if expira < time.time():
            _ip_falhas.pop(ip, None)
            return False
        return n >= MAX_FALHAS_IP


def _ip_falha(ip):
    with _ip_lock:
        n, expira = _ip_falhas.get(ip, (0, 0))
        if expira < time.time():
            n, expira = 0, time.time() + BLOQUEIO_MIN * 60
        _ip_falhas[ip] = (n + 1, expira)


def _ip_ok(ip):
    with _ip_lock:
        _ip_falhas.pop(ip, None)


def _msg_bloqueio(segundos):
    minutos = max(1, round(segundos / 60))
    quando = f"{minutos} minuto(s)" if minutos < 60 else f"{round(minutos / 60, 1)} hora(s)"
    return f"Muitas tentativas. Tente de novo em {quando}."


# ---------------- login ----------------
def entrar(email, senha, ip):
    email = normalizar_email(email)
    if not email or not senha:
        raise Erro("Preencha e-mail e senha.")
    if _ip_excedido(ip):
        banco.log(None, email, ip, "ip_bloqueado")
        raise Erro(_msg_bloqueio(BLOQUEIO_MIN * 60), 429)
    with banco.conexao() as con:
        u = con.execute("SELECT * FROM usuarios WHERE email = %s", (email,)).fetchone()
    if not u:
        check_password_hash(_HASH_ISCA, senha)
        _ip_falha(ip)
        banco.log(None, email, ip, "email_inexistente")
        raise Erro("E-mail ou senha inválidos.", 401)
    # durante o bloqueio nem a senha certa entra: é o que impede continuar adivinhando
    if u["bloqueado_ate"]:
        restante = (u["bloqueado_ate"] - banco.agora()).total_seconds()
        if restante > 0:
            banco.log(u["id"], email, ip, "tentativa_durante_bloqueio")
            raise Erro(_msg_bloqueio(restante), 429)
    if not check_password_hash(u["senha_hash"], senha):
        _ip_falha(ip)
        segundos = _registrar_falha(u["id"], email, ip)
        raise Erro(_msg_bloqueio(segundos), 429) if segundos else Erro("E-mail ou senha inválidos.", 401)
    with banco.conexao() as con:
        con.execute("UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL, bloqueios_seguidos = 0 WHERE id = %s", (u["id"],))
    _ip_ok(ip)
    banco.log(u["id"], email, ip, "login")
    return buscar(u["id"])


def _registrar_falha(uid, email, ip):
    with banco.conexao() as con:
        con.execute("UPDATE usuarios SET tentativas_falhas = tentativas_falhas + 1 WHERE id = %s", (uid,))
        u = con.execute("SELECT tentativas_falhas, bloqueios_seguidos FROM usuarios WHERE id = %s", (uid,)).fetchone()
        if u["tentativas_falhas"] >= MAX_TENTATIVAS:
            minutos = BLOQUEIO_MIN * (4 ** min(u["bloqueios_seguidos"], 2))     # 15 min → 1 h → 4 h
            con.execute("UPDATE usuarios SET bloqueado_ate = %s, tentativas_falhas = 0, bloqueios_seguidos = bloqueios_seguidos + 1 WHERE id = %s",
                        (banco.agora() + timedelta(minutes=minutos), uid))
            banco.log(uid, email, ip, f"bloqueado:{minutos}min")
            return minutos * 60
    banco.log(uid, email, ip, "senha_incorreta")
    return 0


# ---------------- recuperação de senha por e-mail ----------------
def _hash_codigo(rec_id, codigo):
    return hmac.new(config.SECRET_KEY.encode(), f"{rec_id}:{codigo}".encode(), hashlib.sha256).hexdigest()


def pedir_codigo(email, ip, enviar):
    """Gera e manda o código. Resposta sempre igual, exista ou não a conta (não revela quem tem conta)."""
    email = normalizar_email(email)
    if _ip_excedido(ip):
        raise Erro(_msg_bloqueio(BLOQUEIO_MIN * 60), 429)
    with banco.conexao() as con:
        u = con.execute("SELECT * FROM usuarios WHERE email = %s", (email,)).fetchone()
        if not u:
            _ip_falha(ip)
            banco.log(None, email, ip, "recuperacao_email_inexistente")
            return
        uma_hora = banco.agora() - timedelta(hours=1)
        recentes = con.execute("SELECT COUNT(*) AS n FROM recuperacoes WHERE usuario_id = %s AND criado > %s", (u["id"], uma_hora)).fetchone()["n"]
        if recentes >= CODIGOS_POR_HORA:
            banco.log(u["id"], email, ip, "recuperacao_limite")
            raise Erro("Já mandamos códigos demais. Espere uma hora e tente de novo.", 429)
        codigo = f"{secrets.randbelow(10**6):06d}"
        rec_id = con.execute("INSERT INTO recuperacoes (usuario_id, codigo_hash, expira, criado) VALUES (%s, '', %s, %s) RETURNING id",
                             (u["id"], banco.agora() + timedelta(minutes=CODIGO_VALIDADE_MIN), banco.agora())).fetchone()["id"]
        con.execute("UPDATE recuperacoes SET codigo_hash = %s WHERE id = %s", (_hash_codigo(rec_id, codigo), rec_id))
    enviar(u["email"], f"Seu código para criar uma nova senha: {codigo}",
           f"Olá!\nSeu código para criar uma nova senha na Escala Certa é: {codigo}\n"
           f"Ele vale por {CODIGO_VALIDADE_MIN} minutos.\n"
           "Se não foi você que pediu, ignore este e-mail: a sua senha continua a mesma.")
    banco.log(u["id"], email, ip, "recuperacao_codigo_enviado")


def redefinir(email, codigo, nova, ip):
    email = normalizar_email(email)
    validar_senha(nova)
    codigo = "".join(c for c in (codigo or "") if c.isdigit())
    with banco.conexao() as con:
        u = con.execute("SELECT * FROM usuarios WHERE email = %s", (email,)).fetchone()
        rec = con.execute("SELECT * FROM recuperacoes WHERE usuario_id = %s AND NOT usado ORDER BY id DESC LIMIT 1",
                          (u["id"],)).fetchone() if u else None
        if not rec or rec["expira"] < banco.agora() or rec["tentativas"] >= CODIGO_MAX_TENTATIVAS:
            _ip_falha(ip)
            raise Erro("Código inválido ou vencido. Peça um novo.", 400)
        if not hmac.compare_digest(rec["codigo_hash"], _hash_codigo(rec["id"], codigo)):
            con.execute("UPDATE recuperacoes SET tentativas = tentativas + 1 WHERE id = %s", (rec["id"],))
            _ip_falha(ip)
            banco.log(u["id"], email, ip, "recuperacao_codigo_errado")
            raise Erro("Código incorreto.", 400)
        # nova senha também destrava a conta: quem prova ter o e-mail é o dono
        con.execute("UPDATE usuarios SET senha_hash = %s, tentativas_falhas = 0, bloqueado_ate = NULL, bloqueios_seguidos = 0 WHERE id = %s",
                    (generate_password_hash(nova), u["id"]))
        con.execute("UPDATE recuperacoes SET usado = TRUE WHERE usuario_id = %s", (u["id"],))
    banco.log(u["id"], email, ip, "senha_redefinida")
    return buscar(u["id"])


def trocar_senha(uid, atual, nova, ip):
    u = buscar(uid)
    if not u or not check_password_hash(u["senha_hash"], atual or ""):
        raise Erro("Senha atual incorreta.", 401)
    validar_senha(nova)
    with banco.conexao() as con:
        con.execute("UPDATE usuarios SET senha_hash = %s WHERE id = %s", (generate_password_hash(nova), uid))
    banco.log(uid, u["email"], ip, "senha_trocada")


# ---------------- acesso pago ----------------
def liberar_acesso(uid):
    """Libera o acesso ilimitado. Liberar de novo não muda nada (guarda a data da primeira vez)."""
    with banco.conexao() as con:
        con.execute("UPDATE usuarios SET liberado_em = COALESCE(liberado_em, now()) WHERE id = %s", (uid,))


def revogar_acesso(uid):
    """Tira o acesso (estorno ou arrependimento). A conta e a escala salva continuam."""
    with banco.conexao() as con:
        con.execute("UPDATE usuarios SET liberado_em = NULL WHERE id = %s", (uid,))
