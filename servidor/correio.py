"""Envio de e-mail (código para entrar, recibo da compra, aviso ao dono e o e-mail único do preço especial) pelo Resend da CarvalhoIA.

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


def _botao(rotulo, url):
    return ('<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr>'
            f'<td style="background:#0e5f52;border-radius:10px"><a href="{html.escape(url)}" style="display:inline-block;'
            f'padding:14px 22px;font:bold 16px/1.2 {FONTE};color:#ffffff;text-decoration:none">{html.escape(rotulo)}</a>'
            '</td></tr></table>')


def _destaque(titulo, de, por, rodape):
    """A caixa do preço especial: o desconto não pode se perder no meio do texto."""
    return ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;'
            'background:#e3efeb;border:2px solid #0e5f52;border-radius:12px"><tr><td style="padding:18px 16px;text-align:center">'
            f'<div style="font:bold 12px/1.3 {FONTE};letter-spacing:2px;color:#0e5f52">{html.escape(titulo)}</div>'
            f'<div style="margin:12px 0 8px;font:18px/1 {FONTE};color:#56655e"><s>{html.escape(de)}</s>&nbsp;&nbsp;'
            f'<span style="font:bold 36px/1 {FONTE};color:#17231e">{html.escape(por)}</span></div>'
            f'<div style="font:15px/1.4 {FONTE};color:#17231e">{html.escape(rodape)}</div>'
            '</td></tr></table>')


def _html(texto, codigo=None, minutos=None, botao=None, destaque=None):
    """O e-mail com a cara do site. Só tabela e estilo na linha: é o que Gmail, Outlook e celular respeitam.
    Com `codigo`, usa o modelo do código de entrar, com o número grande numa caixa, fácil de ler e de copiar;
    sem ele, cada linha do texto vira um parágrafo; a linha "[botao]" vira o botão de `botao` (rótulo, endereço) e a
    linha "[destaque]" vira a caixa de preço de `destaque` (título, preço de, preço por, rodapé)."""
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
        miolo = "".join(_botao(*botao) if botao and linha == "[botao]" else
                        _destaque(*destaque) if destaque and linha == "[destaque]" else _p(linha)
                        for linha in texto.split("\n") if linha.strip())
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


def enviar(para, assunto, texto, codigo=None, minutos=None, botao=None, destaque=None):
    if not config.RESEND_API_KEY:
        if config.EM_PRODUCAO:
            # nunca escrever o código no log de produção: quem lê o log tomaria a conta
            logger.error("Resend não configurado: e-mail '%s' não foi enviado", _sem_codigo(assunto))
        else:
            logger.warning("Resend não configurado (desenvolvimento): para %s: %s", para, texto)
        return
    corpo_html = _html(texto, codigo, minutos, botao, destaque)
    if botao:
        texto = texto.replace("[botao]", f"{botao[0]}: {botao[1]}")      # a versão só texto leva o endereço por extenso
    if destaque:
        texto = texto.replace("[destaque]", f"{destaque[0]}: de {destaque[1]} por {destaque[2]}, {destaque[3]}")
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
