"""Escala Certa: site estático + contas + pagamento pelo Mercado Pago.

Rotas:
  POST /api/conta                 cria a conta (e-mail e senha) e já entra
  POST /api/entrar | /api/sair    login e logout
  GET  /api/eu                    quem está logado e até quando vai o acesso
  POST /api/senha/esqueci         manda código de 6 números por e-mail (Resend da CarvalhoIA)
  POST /api/senha/redefinir       código + nova senha (já entra)
  POST /api/senha/trocar          troca a senha logado
  POST /api/pedido                cria a cobrança (Checkout Pro) para a conta logada
  GET  /api/pedido/{id}           situação do pedido; pago → acesso ilimitado
  POST /api/reembolso             o cliente cancela a compra em até 7 dias: estorno no Mercado Pago e sai o acesso
  GET|PUT /api/escala             a escala salva da conta (para voltar e usar de novo)
  POST /webhook/mercadopago       aviso do Mercado Pago (o pagamento é conferido de novo na API)
  GET  /                          o site (só a pasta do site, nunca a raiz do projeto)
"""
import hashlib
import json
import logging
import re
import secrets
from datetime import timedelta

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

import banco
import contas
import mercado_pago as mp
import correio
from config import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("escala")

app = FastAPI(title="Escala Certa", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(SessionMiddleware, secret_key=config.SECRET_KEY, session_cookie="escala_sessao",
                   max_age=90 * 24 * 3600, same_site="lax", https_only=config.EM_PRODUCAO)
banco.criar_tabelas()

PEDIDO = re.compile(r"^[0-9a-f]{16}$")
ESCALA_MAX_BYTES = 5 * 1024 * 1024
REEMBOLSO_DIAS = 7                     # direito de arrependimento (CDC, art. 49); o cliente cancela sozinho na conta


@app.exception_handler(contas.Erro)
def erro_de_conta(_request, e: contas.Erro):
    return JSONResponse({"detail": e.mensagem}, status_code=e.status)


def ip_de(request: Request):
    """IP real do visitante. Atrás do proxy (Traefik) o endereço direto é o do proxy."""
    xff = request.headers.get("x-forwarded-for", "")
    return (xff.split(",")[0].strip() if xff else (request.client.host if request.client else ""))[:45]


def _versao_senha(u):
    # vai junto na sessão: trocar a senha derruba as sessões abertas em outros aparelhos
    return hashlib.sha256(u["senha_hash"].encode()).hexdigest()[:16]


def iniciar_sessao(request: Request, u):
    request.session.clear()
    request.session.update({"uid": u["id"], "sv": _versao_senha(u)})


def usuario_logado(request: Request, obrigatorio=True):
    uid = request.session.get("uid")
    u = contas.buscar(uid) if uid else None
    if not u or request.session.get("sv") != _versao_senha(u):
        request.session.clear()
        if obrigatorio:
            raise HTTPException(401, "Entre na sua conta para continuar.")
        return None
    return u


# ---------------- contas ----------------
class NovaConta(BaseModel):
    email: str
    senha: str


class Login(BaseModel):
    email: str
    senha: str


class Esqueci(BaseModel):
    email: str


class Redefinir(BaseModel):
    email: str
    codigo: str
    nova: str


class Troca(BaseModel):
    atual: str
    nova: str


@app.post("/api/conta")
def criar_conta(dados: NovaConta, request: Request):
    u = contas.criar(dados.email, dados.senha, ip_de(request))
    iniciar_sessao(request, u)
    return contas.publico(u)


@app.post("/api/entrar")
def entrar(dados: Login, request: Request):
    u = contas.entrar(dados.email, dados.senha, ip_de(request))
    iniciar_sessao(request, u)
    return contas.publico(u)


@app.post("/api/sair")
def sair(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/api/eu")
def eu(request: Request):
    u = usuario_logado(request, obrigatorio=False)
    if not u:
        return {"logado": False}
    p = pedido_reembolsavel(u["id"])
    ate = banco.iso(p["aprovado"] + timedelta(days=REEMBOLSO_DIAS)) if p else None
    return {"logado": True, **contas.publico(u), "reembolso_ate": ate}


@app.post("/api/senha/esqueci")
def esqueci(dados: Esqueci, request: Request):
    contas.pedir_codigo(dados.email, ip_de(request), correio.enviar)
    return {"ok": True, "mensagem": "Se existir conta com esse e-mail, mandamos um código de 6 números para ele. Confira também o spam."}


@app.post("/api/senha/redefinir")
def redefinir(dados: Redefinir, request: Request):
    u = contas.redefinir(dados.email, dados.codigo, dados.nova, ip_de(request))
    iniciar_sessao(request, u)
    return contas.publico(u)


@app.post("/api/senha/trocar")
def trocar(dados: Troca, request: Request):
    u = usuario_logado(request)
    contas.trocar_senha(u["id"], dados.atual, dados.nova, ip_de(request))
    iniciar_sessao(request, contas.buscar(u["id"]))      # mantém este aparelho; os outros caem
    return {"ok": True}


# ---------------- pagamento ----------------
@app.post("/api/pedido")
def criar_pedido(request: Request):
    u = usuario_logado(request)
    if contas.publico(u)["ativo"]:
        raise HTTPException(409, "Sua conta já tem acesso ilimitado.")      # não cobrar duas vezes
    pid = secrets.token_hex(8)
    with banco.conexao() as con:
        con.execute("INSERT INTO pedidos (id, usuario_id, valor, criado) VALUES (%s, %s, %s, %s)",
                    (pid, u["id"], config.PRECO, banco.agora()))
    try:
        pref_id, url = mp.criar_preferencia(pid, u["email"])
    except Exception:
        logger.exception("Erro ao criar cobrança do pedido %s", pid)
        raise HTTPException(502, "Não consegui falar com o Mercado Pago. Tente de novo em instantes.")
    with banco.conexao() as con:
        con.execute("UPDATE pedidos SET preference_id = %s WHERE id = %s", (pref_id, pid))
    banco.log(u["id"], u["email"], ip_de(request), f"pedido:{pid}")
    return {"pedido": pid, "url": url}


def aprovar(pid, payment_id):
    """Marca o pedido como pago e libera o acesso ilimitado. Idempotente: o mesmo pagamento conta uma vez só.

    O aviso do Mercado Pago e a consulta da página podem chegar juntos (em threads diferentes):
    a troca de status é um UPDATE condicional, e só quem efetivamente trocou libera o acesso.
    """
    with banco.conexao() as con:
        # pedido estornado nunca volta a liberar, mesmo que chegue um aviso atrasado do pagamento
        cur = con.execute("UPDATE pedidos SET status = 'aprovado', payment_id = %s, aprovado = %s "
                          "WHERE id = %s AND status NOT IN ('aprovado', 'reembolsando', 'reembolsado')",
                          (str(payment_id), banco.agora(), pid))
        if cur.rowcount != 1:
            return
        p = con.execute("SELECT usuario_id FROM pedidos WHERE id = %s", (pid,)).fetchone()
    contas.liberar_acesso(p["usuario_id"])
    banco.log(p["usuario_id"], None, None, f"pago:{pid}")
    logger.info("Pedido %s aprovado", pid)


@app.get("/api/pedido/{pid}")
def ver_pedido(pid: str, request: Request):
    u = usuario_logado(request)
    with banco.conexao() as con:
        p = con.execute("SELECT * FROM pedidos WHERE id = %s", (pid,)).fetchone() if PEDIDO.match(pid) else None
    if not p or p["usuario_id"] != u["id"]:
        raise HTTPException(404, "Pedido não encontrado.")
    status = p["status"]
    if status not in ("aprovado", "reembolsando", "reembolsado"):
        # não depende só do aviso: pergunta direto ao Mercado Pago
        status, payment_id = mp.pagamento_aprovado_do_pedido(pid)
        if status == "aprovado":
            aprovar(pid, payment_id)
        elif status in ("pendente", "recusado"):
            with banco.conexao() as con:
                con.execute("UPDATE pedidos SET status = %s WHERE id = %s AND status IN ('aguardando', 'pendente', 'recusado')",
                            (status, pid))
    return {"status": status, **contas.publico(contas.buscar(u["id"]))}


def pedido_reembolsavel(uid):
    """O pedido pago que o próprio cliente ainda pode cancelar: até 7 dias depois de aprovado, e só uma vez por
    conta (quem já cancelou uma compra pede o segundo estorno por e-mail, e o direito continua garantido)."""
    with banco.conexao() as con:
        if con.execute("SELECT 1 FROM pedidos WHERE usuario_id = %s AND status IN ('reembolsando', 'reembolsado')",
                       (uid,)).fetchone():
            return None
        return con.execute("SELECT * FROM pedidos WHERE usuario_id = %s AND status = 'aprovado' AND payment_id IS NOT NULL "
                           "AND aprovado > %s ORDER BY aprovado DESC LIMIT 1",
                           (uid, banco.agora() - timedelta(days=REEMBOLSO_DIAS))).fetchone()


@app.post("/api/reembolso")
def pedir_reembolso(request: Request):
    """Cancela a compra: estorno total no Mercado Pago (volta no Pix ou no cartão) e tira o acesso pago."""
    u = usuario_logado(request)
    p = pedido_reembolsavel(u["id"])
    if not p:
        raise HTTPException(409, f"O cancelamento pela conta vale até {REEMBOLSO_DIAS} dias depois da compra. "
                                 "Escreva para gabriel@carvalhoia.com que a gente resolve.")
    with banco.conexao() as con:
        # trava o pedido: dois cliques ou duas abas juntas não pedem dois estornos
        cur = con.execute("UPDATE pedidos SET status = 'reembolsando' WHERE id = %s AND status = 'aprovado'", (p["id"],))
        if cur.rowcount != 1:
            raise HTTPException(409, "Este pedido já está sendo cancelado.")
    try:
        ok = mp.reembolsar(p["payment_id"], f"escala-reembolso-{p['id']}")
    except Exception:
        logger.exception("Erro ao estornar o pedido %s", p["id"])
        ok = False
    if not ok:
        with banco.conexao() as con:
            con.execute("UPDATE pedidos SET status = 'aprovado' WHERE id = %s AND status = 'reembolsando'", (p["id"],))
        banco.log(u["id"], u["email"], ip_de(request), f"reembolso_falhou:{p['id']}")
        raise HTTPException(502, "O Mercado Pago não fez o estorno agora. Tente de novo daqui a pouco ou escreva para "
                                 "gabriel@carvalhoia.com, que a gente devolve o dinheiro.")
    with banco.conexao() as con:
        con.execute("UPDATE pedidos SET status = 'reembolsado' WHERE id = %s", (p["id"],))
    contas.revogar_acesso(u["id"])
    banco.log(u["id"], u["email"], ip_de(request), f"reembolso:{p['id']}")
    logger.info("Pedido %s reembolsado a pedido do cliente", p["id"])
    return {"ok": True, "valor": float(p["valor"]), "pedido": p["id"], **contas.publico(contas.buscar(u["id"]))}


@app.post("/webhook/mercadopago")
async def aviso_mercado_pago(request: Request):
    """O Mercado Pago avisa pelo corpo ou pela URL (?type=payment&data.id=...). Sempre responde 200."""
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    q = request.query_params
    tipo = corpo.get("type") or corpo.get("topic") or q.get("type") or q.get("topic")
    payment_id = (corpo.get("data") or {}).get("id") or q.get("data.id") or q.get("id")
    if tipo != "payment" or not payment_id:
        return JSONResponse({"status": "ignorado"})
    pag = mp.consultar_pagamento(payment_id)
    ref = (pag or {}).get("external_reference") or ""
    if not ref.startswith(mp.REF):
        return JSONResponse({"status": "ignorado"})            # pagamento de outro produto da conta
    if pag.get("status") == "approved":
        aprovar(ref[len(mp.REF):], payment_id)
    return JSONResponse({"status": "ok"})


# ---------------- escala salva ----------------
def exige_acesso(request: Request):
    u = usuario_logado(request)
    if not contas.publico(u)["ativo"]:
        raise HTTPException(402, "Seu acesso não está ativo.")
    return u


@app.get("/api/escala")
def ler_escala(request: Request):
    u = exige_acesso(request)
    with banco.conexao() as con:
        e = con.execute("SELECT dados, atualizado FROM escalas WHERE usuario_id = %s", (u["id"],)).fetchone()
    if not e:
        return {"dados": None}
    return {"dados": json.loads(e["dados"]), "atualizado": banco.iso(e["atualizado"])}


@app.put("/api/escala")
async def salvar_escala(request: Request):
    u = exige_acesso(request)
    corpo = await request.body()
    if len(corpo) > ESCALA_MAX_BYTES:
        raise HTTPException(413, "Escala grande demais para salvar.")
    try:
        dados = json.loads(corpo)
    except ValueError:
        raise HTTPException(400, "Dados inválidos.")
    with banco.conexao() as con:
        con.execute("INSERT INTO escalas (usuario_id, dados, atualizado) VALUES (%s, %s, %s) "
                    "ON CONFLICT(usuario_id) DO UPDATE SET dados = excluded.dados, atualizado = excluded.atualizado",
                    (u["id"], json.dumps(dados, separators=(",", ":")), banco.agora()))
    return {"ok": True}


@app.get("/api/saude")
def saude():
    return {"ok": True}


# o site por último, para não engolir as rotas da API
app.mount("/", StaticFiles(directory=config.SITE, html=True), name="site")
