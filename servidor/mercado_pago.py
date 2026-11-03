"""Mercado Pago: Pix gerado direto na nossa página (API de Payments) e cartão no Checkout Pro (API de Preferences).

O aviso de pagamento nunca é aceito como prova: o pagamento é sempre consultado de novo
no Mercado Pago antes de liberar (mesmo cuidado do DanfeZap).
"""
import logging
from datetime import datetime, timedelta, timezone

import mercadopago
from mercadopago.config import RequestOptions

from config import config

logger = logging.getLogger(__name__)
REF = "escala-"                      # prefixo das vendas da Escala Certa na conta do Mercado Pago
PIX_HORAS = 23                       # validade do código Pix (a mesma do Checkout Pro)

sdk = mercadopago.SDK(config.MP_ACCESS_TOKEN)


def criar_preferencia(pedido_id, email):
    """Cria a cobrança e devolve (preference_id, url do checkout) ou levanta RuntimeError."""
    volta = f"{config.BASE_URL}/?pedido={pedido_id}"
    dados = {
        "items": [{
            "id": "escala-certa-ilimitado",
            "title": "Escala Certa: escala completa (acesso ilimitado)",
            "quantity": 1,
            "currency_id": "BRL",
            "unit_price": config.PRECO,
        }],
        "payer": {"email": email},
        "external_reference": REF + pedido_id,
        "statement_descriptor": config.NOME_FATURA,
        "back_urls": {"success": volta, "pending": volta, "failure": volta},
        "payment_methods": {
            "excluded_payment_types": [{"id": "ticket"}],    # sem boleto: a liberação tem de ser na hora
            "installments": 1,
        },
    }
    if config.BASE_URL.startswith("https://"):
        # o Mercado Pago só volta sozinho e só avisa em endereço público com https
        dados["auto_return"] = "approved"
        dados["notification_url"] = f"{config.BASE_URL}/webhook/mercadopago"
    r = sdk.preference().create(dados)
    if r.get("status") not in (200, 201):
        logger.error("Falha ao criar preferência do pedido %s: %s", pedido_id, r)
        raise RuntimeError(f"Mercado Pago recusou a cobrança (HTTP {r.get('status')})")
    pref = r["response"]
    return pref["id"], pref["init_point"]


def criar_pix(pedido_id, email):
    """Gera o Pix do pedido sem sair do site. Devolve {id, codigo, qr, expira} ou levanta RuntimeError.

    No Checkout Pro a pessoa escolhe entre pagar com a conta do Mercado Pago ou sem conta; quem toca na conta cai
    num login e desiste. Aqui não tem escolha: o código e o QR aparecem na nossa página e ela paga no app do banco.
    A chave de idempotência é o pedido: um clique repetido devolve o mesmo Pix, nunca dois.
    """
    expira = datetime.now(timezone.utc) + timedelta(hours=PIX_HORAS)
    dados = {
        "transaction_amount": config.PRECO,
        "description": "Escala Certa: escala completa (acesso ilimitado)",
        "payment_method_id": "pix",
        "payer": {"email": email},
        "external_reference": REF + pedido_id,
        "date_of_expiration": expira.isoformat(timespec="milliseconds"),
    }
    if config.BASE_URL.startswith("https://"):
        dados["notification_url"] = f"{config.BASE_URL}/webhook/mercadopago"
    opcoes = RequestOptions(custom_headers={"x-idempotency-key": f"escala-pix-{pedido_id}"})
    r = sdk.payment().create(dados, opcoes)
    if r.get("status") not in (200, 201):
        logger.error("Falha ao gerar o Pix do pedido %s: %s", pedido_id, r)
        raise RuntimeError(f"Mercado Pago recusou o Pix (HTTP {r.get('status')})")
    pag = r["response"]
    tx = (pag.get("point_of_interaction") or {}).get("transaction_data") or {}
    if not tx.get("qr_code"):
        logger.error("Pix do pedido %s veio sem código: %s", pedido_id, pag.get("status_detail"))
        raise RuntimeError("Mercado Pago não devolveu o código Pix")
    return {"id": pag.get("id"), "codigo": tx["qr_code"], "qr": tx.get("qr_code_base64") or "",
            "expira": expira.isoformat()}


def pagamento_aprovado_do_pedido(pedido_id):
    """Procura no Mercado Pago um pagamento aprovado deste pedido. Devolve (status, payment_id)."""
    r = sdk.payment().search({"external_reference": REF + pedido_id, "sort": "date_created", "criteria": "desc"})
    if r.get("status") != 200:
        logger.warning("Consulta de pagamentos do pedido %s falhou: %s", pedido_id, r.get("status"))
        return "erro", None
    resultados = r["response"].get("results", [])
    for p in resultados:
        if p.get("status") == "approved":
            return "aprovado", p.get("id")
    if any(p.get("status") in ("pending", "in_process", "authorized") for p in resultados):
        return "pendente", None
    if resultados:
        return "recusado", None
    return "aguardando", None


def reembolsar(payment_id, chave):
    """Estorno total do pagamento. Devolve True se o Mercado Pago aceitou (ou se já estava estornado).

    `chave` vai como X-Idempotency-Key: um clique repetido nunca vira dois estornos.
    Sem saldo na conta, o Mercado Pago responde 400 e o estorno não acontece.
    """
    opcoes = RequestOptions(custom_headers={"x-idempotency-key": chave})
    r = sdk.refund().create(payment_id, request_options=opcoes)
    if r.get("status") in (200, 201):
        return True
    pag = consultar_pagamento(payment_id)
    if pag and pag.get("status") == "refunded":
        return True
    logger.error("Estorno do pagamento %s recusado: %s", payment_id, r)
    return False


def consultar_pagamento(payment_id):
    """Dados de um pagamento pelo id (usado pelo aviso do Mercado Pago)."""
    r = sdk.payment().get(payment_id)
    if r.get("status") != 200:
        return None
    return r["response"]
