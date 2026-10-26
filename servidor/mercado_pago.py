"""Checkout Pro do Mercado Pago (API de Preferences): Pix e cartão numa página do Mercado Pago.

O aviso de pagamento nunca é aceito como prova: o pagamento é sempre consultado de novo
no Mercado Pago antes de liberar (mesmo cuidado do DanfeZap).
"""
import logging

import mercadopago

from config import config

logger = logging.getLogger(__name__)
REF = "escala-"                      # prefixo das vendas da Escala Certa na conta do Mercado Pago

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


def consultar_pagamento(payment_id):
    """Dados de um pagamento pelo id (usado pelo aviso do Mercado Pago)."""
    r = sdk.payment().get(payment_id)
    if r.get("status") != 200:
        return None
    return r["response"]
