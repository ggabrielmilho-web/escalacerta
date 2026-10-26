"""Banco Postgres só da Escala Certa (separado do DanfeZap): contas, pedidos, escalas salvas e recuperação de senha.

Fica no Postgres que já roda no servidor: o backup diário faz pg_dump de todo banco de lá, sem configuração à parte.
"""
import atexit
from contextlib import contextmanager
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from config import config

_pool = None


def pool():
    # check: o Postgres compartilhado fecha conexão ociosa; sem testar antes de emprestar,
    # o primeiro clique depois de um tempo parado dá erro (mesmo cuidado do Arado)
    global _pool
    if _pool is None:
        _pool = ConnectionPool(config.DATABASE_URL, min_size=1, max_size=config.DB_POOL_MAX,
                               check=ConnectionPool.check_connection,
                               kwargs={"row_factory": dict_row}, open=True)
        atexit.register(_pool.close)        # sem isso, o admin.py fica segundos preso esperando as threads do pool
    return _pool


@contextmanager
def conexao():
    """Uma transação: commit no fim, rollback se der erro."""
    with pool().connection() as con:
        yield con


def agora():
    return datetime.now(timezone.utc)


def iso(dt):
    """Data do banco para a página, sempre em UTC (o fuso da sessão do Postgres não muda a resposta)."""
    return dt.astimezone(timezone.utc).isoformat() if dt else None


def criar_tabelas():
    # roda uma vez por processo; lock_timeout para nunca ficar na fila de um lock e segurar conexões
    with conexao() as con:
        con.execute("""
            SET LOCAL lock_timeout = '5s';
            CREATE TABLE IF NOT EXISTS usuarios (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                senha_hash TEXT NOT NULL,
                liberado_em TIMESTAMPTZ,             -- quando o acesso ilimitado foi liberado; NULL = sem acesso
                tentativas_falhas INTEGER NOT NULL DEFAULT 0,
                bloqueado_ate TIMESTAMPTZ,
                bloqueios_seguidos INTEGER NOT NULL DEFAULT 0,
                criado TIMESTAMPTZ NOT NULL
            );
            CREATE TABLE IF NOT EXISTS pedidos (
                id TEXT PRIMARY KEY,
                usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
                valor NUMERIC(10, 2) NOT NULL,
                status TEXT NOT NULL DEFAULT 'aguardando',
                preference_id TEXT,
                payment_id TEXT,
                criado TIMESTAMPTZ NOT NULL,
                aprovado TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS pedidos_usuario ON pedidos (usuario_id);
            CREATE TABLE IF NOT EXISTS escalas (
                usuario_id BIGINT PRIMARY KEY REFERENCES usuarios(id),
                dados TEXT NOT NULL,                 -- o JSON da página, guardado como veio
                atualizado TIMESTAMPTZ NOT NULL
            );
            CREATE TABLE IF NOT EXISTS recuperacoes (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
                codigo_hash TEXT NOT NULL,
                expira TIMESTAMPTZ NOT NULL,
                tentativas INTEGER NOT NULL DEFAULT 0,
                usado BOOLEAN NOT NULL DEFAULT FALSE,
                criado TIMESTAMPTZ NOT NULL
            );
            CREATE INDEX IF NOT EXISTS recuperacoes_usuario ON recuperacoes (usuario_id, criado);
            CREATE TABLE IF NOT EXISTS log_acesso (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                usuario_id BIGINT,
                email TEXT,
                ip TEXT,
                evento TEXT NOT NULL,
                quando TIMESTAMPTZ NOT NULL
            );
        """)


def log(usuario_id, email, ip, evento):
    """Rastro de login, recuperação e pagamento. Nunca derruba a operação se falhar."""
    try:
        with conexao() as con:
            con.execute("INSERT INTO log_acesso (usuario_id, email, ip, evento, quando) VALUES (%s, %s, %s, %s, %s)",
                        (usuario_id, email, ip, evento, agora()))
    except Exception:
        pass
