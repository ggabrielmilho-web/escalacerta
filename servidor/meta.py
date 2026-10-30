"""Compra confirmada para a Meta pela API de Conversões, direto do servidor.

O Pixel só registra a compra quando a pessoa volta ao site depois de pagar. No celular o anúncio abre dentro
do Instagram e a volta do Mercado Pago cai no Chrome: outro navegador, sem o cookie do anúncio, e muitas vezes
a pessoa nem volta. Aqui a compra sai quando o pagamento é aprovado, com o identificador do clique guardado
no pedido. O event_id é o mesmo da página (compra-<pedido>): se os dois chegam, a Meta conta uma vez só.

Chamada HTTP direta, sem SDK (como o correio.py). Sem META_CAPI_TOKEN, só registra no log.
"""
import hashlib
import json
import logging
import threading
import urllib.error
import urllib.request
from datetime import timedelta

import banco
from config import config

logger = logging.getLogger(__name__)
VERSAO = "v23.0"
PRODUTO = "escala-certa-ilimitado"
GUARDA_DIAS = 2                     # o Pix vale 23 h: passado isso, o rastreio do pedido não pago some


def _hash(valor):
    # a Meta só aceita o e-mail embaralhado (SHA-256 do e-mail em minúsculas, sem espaços)
    return hashlib.sha256(valor.strip().lower().encode()).hexdigest()


def rastreio_do_pedido(request, ip):
    """O que liga a compra ao anúncio: os cookies do Pixel (_fbp do navegador, _fbc do clique), o IP e o navegador."""
    r = {"fbp": request.cookies.get("_fbp", ""), "fbc": request.cookies.get("_fbc", ""), "ip": ip,
         "ua": request.headers.get("user-agent", "")}
    return json.dumps({k: v[:500] for k, v in r.items() if v})


def limpar_antigos():
    with banco.conexao() as con:
        con.execute("UPDATE pedidos SET rastreio = NULL WHERE rastreio IS NOT NULL AND criado < %s",
                    (banco.agora() - timedelta(days=GUARDA_DIAS),))


def evento_compra(pid, email, valor, quando, rastreio, ip_reserva=None):
    r = json.loads(rastreio) if rastreio else {}
    ud = {"em": [_hash(email)]}
    for chave, campo in (("fbp", "fbp"), ("fbc", "fbc"), ("ip", "client_ip_address"), ("ua", "client_user_agent")):
        if r.get(chave):
            ud[campo] = r[chave]
    if "client_ip_address" not in ud and ip_reserva:
        ud["client_ip_address"] = ip_reserva
    return {
        "event_name": "Purchase",
        "event_time": int(quando.timestamp()),
        "event_id": f"compra-{pid}",
        # sem o navegador (pedido de antes desta versão) a Meta não aceita o evento como do site
        "action_source": "website" if "client_user_agent" in ud else "system_generated",
        "event_source_url": f"{config.BASE_URL}/?pedido={pid}",
        "user_data": ud,
        "custom_data": {"currency": "BRL", "value": float(valor), "content_ids": [PRODUTO],
                        "content_type": "product", "order_id": pid},
    }


def enviar(evento):
    """Manda o evento. True se a Meta recebeu. O token vai no corpo, nunca na URL nem no log."""
    if not config.META_CAPI_TOKEN:
        logger.info("Sem META_CAPI_TOKEN: a compra %s não foi para a Meta", evento["event_id"])
        return False
    corpo = {"data": [evento], "access_token": config.META_CAPI_TOKEN}
    if config.META_TEST_CODE:
        corpo["test_event_code"] = config.META_TEST_CODE
    req = urllib.request.Request(f"https://graph.facebook.com/{VERSAO}/{config.META_PIXEL_ID}/events",
                                 data=json.dumps(corpo).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "User-Agent": "EscalaCerta/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            r = json.loads(resp.read() or b"{}")
        logger.info("Compra %s enviada à Meta (events_received=%s)", evento["event_id"], r.get("events_received"))
        return bool(r.get("events_received"))
    except urllib.error.HTTPError as e:
        logger.error("A Meta recusou a compra %s: HTTP %s %s", evento["event_id"], e.code, e.read()[:500])
    except Exception:
        logger.exception("Falha ao mandar a compra %s para a Meta", evento["event_id"])
    return False


def avisar_compra(pid):
    """Manda a compra do pedido aprovado e apaga o rastreio dele. Nunca levanta erro: a venda já está feita."""
    try:
        with banco.conexao() as con:
            p = con.execute("SELECT p.id, p.usuario_id, p.valor, p.aprovado, p.rastreio, u.email FROM pedidos p "
                            "JOIN usuarios u ON u.id = p.usuario_id WHERE p.id = %s AND p.status = 'aprovado'",
                            (pid,)).fetchone()
            if not p:
                return False
            # pedido de antes do rastreio: o IP de quando pediu ainda está no registro de acesso
            log = con.execute("SELECT ip FROM log_acesso WHERE evento = %s AND ip IS NOT NULL ORDER BY id LIMIT 1",
                              (f"pedido:{pid}",)).fetchone()
        ok = enviar(evento_compra(pid, p["email"], p["valor"], p["aprovado"], p["rastreio"], log and log["ip"]))
        with banco.conexao() as con:
            con.execute("UPDATE pedidos SET rastreio = NULL WHERE id = %s", (pid,))
        banco.log(p["usuario_id"], None, None, f"meta:{pid}:{'ok' if ok else 'nao_enviado'}")
        return ok
    except Exception:
        logger.exception("Erro ao avisar a Meta da compra %s", pid)
        return False


def avisar_compra_depois(pid):
    # em segundo plano: a resposta ao Mercado Pago e à página não espera a Meta
    threading.Thread(target=avisar_compra, args=(pid,), daemon=True).start()
