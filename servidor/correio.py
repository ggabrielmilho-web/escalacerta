"""Envio de e-mail (código para entrar e recibo da compra) pelo Resend da CarvalhoIA.

Mesmo serviço do DanfeZap, com o domínio carvalhoia.com já verificado. Chamada HTTP direta,
sem SDK. Sem RESEND_API_KEY (desenvolvimento), o texto só aparece no log do servidor.
"""
import html
import json
import logging
import re
import urllib.error
import urllib.request

from config import config

logger = logging.getLogger(__name__)


def _sem_codigo(assunto):
    # o assunto leva o código de entrar: no log ele nunca aparece (quem lê o log tomaria a conta)
    return re.sub(r"\d{4,}", "******", assunto)


FONTE = "Arial,Helvetica,sans-serif"


def _p(texto, tamanho=16, cor="#17231e", margem=14):
    return f'<p style="margin:0 0 {margem}px;font:{tamanho}px/1.5 {FONTE};color:{cor}">{html.escape(texto)}</p>'


def _html(texto, codigo=None, minutos=None):
    """O e-mail com a cara do site. Só tabela e estilo na linha: é o que Gmail, Outlook e celular respeitam.
    Com `codigo`, usa o modelo do código de entrar, com o número grande numa caixa, fácil de ler e de copiar;
    sem ele, cada linha do texto vira um parágrafo."""
    site = config.BASE_URL
    if codigo:
        miolo = (
            _p("Olá!")
            + _p("Use este código para entrar na sua conta da Escala Certa:", margem=12)
            + '<div style="margin:0 0 10px;padding:18px 0;background:#e3efeb;border-radius:10px;text-align:center;'
              f'font:bold 34px/1 \'Courier New\',monospace;letter-spacing:8px;color:#0e5f52">{html.escape(codigo)}</div>'
            + _p(f"Vale por {minutos} minutos e só pode ser usado uma vez.", 13, "#56655e", 20)
            + _p("Se não foi você que pediu, pode ignorar este e-mail: ninguém entra na sua conta sem este código.", 14, "#56655e")
        )
    else:
        miolo = "".join(_p(linha) for linha in texto.split("\n") if linha.strip())
    return (
        '<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f3f5f1">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f1">'
        '<tr><td align="center" style="padding:28px 12px">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">'
        f'<tr><td style="padding:0 4px 16px"><a href="{site}"><img src="{site}/img/logo-email.png" width="220" height="21" '
        'alt="Escala Certa" style="display:block;border:0"></a></td></tr>'
        f'<tr><td style="background:#ffffff;border:1px solid #d6ddd8;border-radius:12px;padding:28px 26px 14px">{miolo}</td></tr>'
        f'<tr><td style="padding:16px 4px 0;font:12px/1.6 {FONTE};color:#56655e">'
        f'<b style="color:#17231e">Escala Certa</b> · a escala de folgas 5x2 conferida contra a lei<br>'
        'CarvalhoIA Desenvolvimento · CNPJ 64.942.407/0001-10 · Uberlândia/MG<br>'
        f'<a href="{site}" style="color:#0e5f52">escalacerta.carvalhoia.com</a> · '
        '<a href="mailto:gabriel@carvalhoia.com" style="color:#0e5f52">gabriel@carvalhoia.com</a>'
        '</td></tr></table></td></tr></table></body></html>'
    )


def enviar(para, assunto, texto, codigo=None, minutos=None):
    if not config.RESEND_API_KEY:
        if config.EM_PRODUCAO:
            # nunca escrever o código no log de produção: quem lê o log tomaria a conta
            logger.error("Resend não configurado: e-mail '%s' não foi enviado", _sem_codigo(assunto))
        else:
            logger.warning("Resend não configurado (desenvolvimento): para %s: %s", para, texto)
        return
    corpo_html = _html(texto, codigo, minutos)
    dados = {"from": config.EMAIL_REMETENTE, "to": [para], "subject": assunto, "text": texto, "html": corpo_html}
    if config.EMAIL_RESPOSTA:
        dados["reply_to"] = config.EMAIL_RESPOSTA
    req = urllib.request.Request("https://api.resend.com/emails", data=json.dumps(dados).encode(), method="POST",
                                 # o Cloudflare do Resend barra o agente padrão "Python-urllib" (403, error code 1010)
                                 headers={"Authorization": f"Bearer {config.RESEND_API_KEY}", "Content-Type": "application/json",
                                          "User-Agent": "EscalaCerta/1.0 (+https://escalacerta.carvalhoia.com)"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            if r.status not in (200, 201):
                logger.error("Resend respondeu %s ao mandar '%s'", r.status, _sem_codigo(assunto))
    except urllib.error.HTTPError as e:
        logger.error("Resend recusou '%s': HTTP %s %s", _sem_codigo(assunto), e.code, e.read()[:300])
    except Exception:
        # não conta ao visitante (a resposta do pedido de código é sempre igual), mas fica no log
        logger.exception("Falha ao mandar e-mail '%s'", _sem_codigo(assunto))
