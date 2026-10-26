"""Configuração da Escala Certa, lida do ambiente (.env)."""
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))


class Config:
    MP_ACCESS_TOKEN = os.getenv("MP_ACCESS_TOKEN", "")
    # endereço público do site: volta do Mercado Pago e aviso de pagamento
    BASE_URL = os.getenv("BASE_URL", "http://localhost:8080").rstrip("/")
    EM_PRODUCAO = BASE_URL.startswith("https://")
    PRECO = float(os.getenv("PRECO", "37.00"))
    # Postgres: banco e usuário próprios da Escala Certa (nunca o superusuário nem o banco do DanfeZap)
    DATABASE_URL = os.getenv("DATABASE_URL", "")
    DB_POOL_MAX = int(os.getenv("DB_POOL_MAX", "8"))
    # pasta do site estático; só ela é servida (nunca a raiz do projeto, onde fica o .env)
    SITE = os.getenv("SITE", str(Path(__file__).resolve().parent.parent / "gerador"))
    NOME_FATURA = os.getenv("NOME_FATURA", "ESCALACERTA")
    # assina o cookie de sessão. Em produção é obrigatória: com chave conhecida, qualquer um
    # forjaria a sessão de outra pessoa (mesmo cuidado do Multpel).
    SECRET_KEY = os.getenv("SECRET_KEY", "")
    # e-mail pelo Resend da CarvalhoIA (recuperação de senha); domínio carvalhoia.com já verificado
    RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
    EMAIL_REMETENTE = os.getenv("EMAIL_REMETENTE", "Escala Certa <nao-responda@carvalhoia.com>")
    EMAIL_RESPOSTA = os.getenv("EMAIL_RESPOSTA", "")


config = Config()
if not config.DATABASE_URL:
    raise RuntimeError("DATABASE_URL não definida (modelo em .env.example).")
if not config.SECRET_KEY:
    if config.EM_PRODUCAO:
        raise RuntimeError("SECRET_KEY não definida. Em produção ela é obrigatória.")
    config.SECRET_KEY = secrets.token_hex(32)       # desenvolvimento: muda a cada reinício
