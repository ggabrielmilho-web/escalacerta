"""Envio de e-mail (código de recuperação de senha) pelo Resend da CarvalhoIA.

Mesmo serviço do DanfeZap, com o domínio carvalhoia.com já verificado. Chamada HTTP direta,
sem SDK. Sem RESEND_API_KEY (desenvolvimento), o texto só aparece no log do servidor.
"""
import html
import json
import logging
import urllib.error
import urllib.request

from config import config

logger = logging.getLogger(__name__)


def enviar(para, assunto, texto):
    if not config.RESEND_API_KEY:
        if config.EM_PRODUCAO:
            # nunca escrever o código no log de produção: quem lê o log tomaria a conta
            logger.error("Resend não configurado: e-mail '%s' não foi enviado", assunto)
        else:
            logger.warning("Resend não configurado (desenvolvimento): para %s: %s", para, texto)
        return
    corpo_html = (
        '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#17231e">'
        + "".join(f"<p>{html.escape(linha)}</p>" for linha in texto.split("\n") if linha.strip())
        + '<p style="color:#56655e;font-size:13px">Escala Certa · escala de folgas 5x2</p></div>'
    )
    dados = {"from": config.EMAIL_REMETENTE, "to": [para], "subject": assunto, "text": texto, "html": corpo_html}
    if config.EMAIL_RESPOSTA:
        dados["reply_to"] = config.EMAIL_RESPOSTA
    req = urllib.request.Request("https://api.resend.com/emails", data=json.dumps(dados).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {config.RESEND_API_KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            if r.status not in (200, 201):
                logger.error("Resend respondeu %s ao mandar '%s'", r.status, assunto)
    except urllib.error.HTTPError as e:
        logger.error("Resend recusou '%s': HTTP %s %s", assunto, e.code, e.read()[:300])
    except Exception:
        # não conta ao visitante (a resposta da recuperação é sempre igual), mas fica no log
        logger.exception("Falha ao mandar e-mail '%s'", assunto)
