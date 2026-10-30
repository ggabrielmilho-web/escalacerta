"""Contas da Escala Certa: sem senha. Quem compra cria a conta só com o e-mail; para entrar de novo, código por e-mail.

  • na compra, o e-mail cria a conta e já entra naquele aparelho (pedir código antes de pagar tirava a pessoa do
    navegador do Instagram para o e-mail, e 4 de 4 que clicaram em Liberar desistiram na tela de e-mail e senha);
  • e-mail que já tem conta não entra sem o código: sem isso, digitar o e-mail de quem pagou daria o acesso dele;
  • código de 6 números, guardado só como HMAC, vale 15 minutos, 5 tentativas, 5 códigos por hora por conta;
  • pedir código responde sempre igual, exista ou não a conta (não revela quem tem conta);
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

import banco
from config import config

BLOQUEIO_MIN = 15
MAX_FALHAS_IP = 50
CODIGO_VALIDADE_MIN = 15
CODIGO_MAX_TENTATIVAS = 5
CODIGOS_POR_HORA = 5

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Erro(Exception):
    def __init__(self, mensagem, status=400):
        super().__init__(mensagem)
        self.mensagem, self.status = mensagem, status


def normalizar_email(email):
    return (email or "").strip().lower()


def nova_chave_sessao():
    # a coluna ainda se chama senha_hash, mas sem senha ela é só o segredo da sessão:
    # trocar este valor derruba todos os aparelhos logados na conta
    return "sessao:" + secrets.token_urlsafe(24)


def publico(u):
    """O que a página pode saber da conta. O acesso pago é ilimitado: não tem data de fim."""
    return {"email": u["email"], "ativo": u["liberado_em"] is not None}


def buscar(usuario_id):
    with banco.conexao() as con:
        return con.execute("SELECT * FROM usuarios WHERE id = %s", (usuario_id,)).fetchone()


# ---------------- cadastro (na compra) ----------------
def criar(email, ip):
    email = normalizar_email(email)
    if not EMAIL.match(email) or len(email) > 200:
        raise Erro("E-mail inválido.")
    try:
        with banco.conexao() as con:
            uid = con.execute("INSERT INTO usuarios (email, senha_hash, criado) VALUES (%s, %s, %s) RETURNING id",
                              (email, nova_chave_sessao(), banco.agora())).fetchone()["id"]
    except UniqueViolation:
        raise Erro("Esse e-mail já tem conta. Mandamos um código para ele: digite aqui para entrar.", 409)
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


# ---------------- entrar com código por e-mail ----------------
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
            banco.log(None, email, ip, "codigo_email_inexistente")
            return
        uma_hora = banco.agora() - timedelta(hours=1)
        recentes = con.execute("SELECT COUNT(*) AS n FROM recuperacoes WHERE usuario_id = %s AND criado > %s", (u["id"], uma_hora)).fetchone()["n"]
        if recentes >= CODIGOS_POR_HORA:
            banco.log(u["id"], email, ip, "codigo_limite")
            raise Erro("Já mandamos códigos demais. Espere uma hora e tente de novo.", 429)
        codigo = f"{secrets.randbelow(10**6):06d}"
        rec_id = con.execute("INSERT INTO recuperacoes (usuario_id, codigo_hash, expira, criado) VALUES (%s, '', %s, %s) RETURNING id",
                             (u["id"], banco.agora() + timedelta(minutes=CODIGO_VALIDADE_MIN), banco.agora())).fetchone()["id"]
        con.execute("UPDATE recuperacoes SET codigo_hash = %s WHERE id = %s", (_hash_codigo(rec_id, codigo), rec_id))
    # o código vem primeiro no assunto: aparece já na notificação do celular
    enviar(u["email"], f"{codigo} é o seu código da Escala Certa",
           f"Olá!\nSeu código para entrar na Escala Certa é: {codigo}\n"
           f"Ele vale por {CODIGO_VALIDADE_MIN} minutos.\n"
           "Se não foi você que pediu, ignore este e-mail: ninguém entra na sua conta sem este código.",
           codigo=codigo, minutos=CODIGO_VALIDADE_MIN)
    banco.log(u["id"], email, ip, "codigo_enviado")


def entrar(email, codigo, ip):
    email = normalizar_email(email)
    codigo = "".join(c for c in (codigo or "") if c.isdigit())
    if _ip_excedido(ip):
        banco.log(None, email, ip, "ip_bloqueado")
        raise Erro(_msg_bloqueio(BLOQUEIO_MIN * 60), 429)
    with banco.conexao() as con:
        u = con.execute("SELECT * FROM usuarios WHERE email = %s", (email,)).fetchone()
        # qualquer código ainda válido serve, não só o último: quem pede outro porque o e-mail demorou acaba
        # digitando o que chegou primeiro (30/10: o primeiro comprador errou 3 vezes assim). No máximo 5 códigos
        # por hora e 5 tentativas cada, e o bloqueio por IP continua: adivinhar segue impraticável.
        recs = con.execute("SELECT * FROM recuperacoes WHERE usuario_id = %s AND NOT usado AND expira > %s AND tentativas < %s "
                           "ORDER BY id DESC", (u["id"], banco.agora(), CODIGO_MAX_TENTATIVAS)).fetchall() if u else []
        if not recs:
            _ip_falha(ip)
            raise Erro("Código inválido ou vencido. Peça um novo.", 400)
        certo = any(hmac.compare_digest(r["codigo_hash"], _hash_codigo(r["id"], codigo)) for r in recs)
        if certo:
            # código usado não serve de novo; os outros também caem
            con.execute("UPDATE recuperacoes SET usado = TRUE WHERE usuario_id = %s", (u["id"],))
        else:
            con.execute("UPDATE recuperacoes SET tentativas = tentativas + 1 WHERE id = ANY(%s)", ([r["id"] for r in recs],))
    # o erro sai DEPOIS do commit: levantado dentro do `with`, o rollback desfazia a contagem e o limite de 5 nunca valia
    if not certo:
        _ip_falha(ip)
        banco.log(u["id"], email, ip, "codigo_errado")
        raise Erro("Código incorreto. Confira o código no e-mail da Escala Certa.", 400)
    _ip_ok(ip)
    banco.log(u["id"], email, ip, "login")
    return buscar(u["id"])


# ---------------- acesso pago ----------------
def liberar_acesso(uid):
    """Libera o acesso ilimitado. Liberar de novo não muda nada (guarda a data da primeira vez)."""
    with banco.conexao() as con:
        con.execute("UPDATE usuarios SET liberado_em = COALESCE(liberado_em, now()) WHERE id = %s", (uid,))


def revogar_acesso(uid):
    """Tira o acesso (estorno ou arrependimento). A conta e a escala salva continuam."""
    with banco.conexao() as con:
        con.execute("UPDATE usuarios SET liberado_em = NULL WHERE id = %s", (uid,))
