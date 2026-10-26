"""Administração da Escala Certa pela linha de comando (local ou dentro do container).

  python admin.py liberar <email>   libera o acesso ilimitado (cria a conta com senha temporária se não existir)
  python admin.py revogar <email>   tira o acesso (estorno ou arrependimento); a conta e a escala salva continuam
  python admin.py senha <email>     gera uma senha temporária nova (a pessoa troca em "Minha conta")

A senha temporária aparece só aqui, uma vez; não fica em log.
"""
import secrets
import sys

import banco
import contas


def _conta(email):
    with banco.conexao() as con:
        return con.execute("SELECT * FROM usuarios WHERE email = %s", (contas.normalizar_email(email),)).fetchone()


def liberar(email):
    banco.criar_tabelas()
    u = _conta(email)
    if not u:
        temporaria = secrets.token_urlsafe(9)
        u = contas.criar(email, temporaria, "admin")
        print(f"Conta criada: {u['email']}  senha temporária: {temporaria}")
    contas.liberar_acesso(u["id"])
    banco.log(u["id"], u["email"], "admin", "cortesia")
    print(f"Acesso ilimitado liberado para {u['email']}")


def revogar(email):
    u = _conta(email)
    if not u:
        sys.exit("Conta não encontrada.")
    contas.revogar_acesso(u["id"])
    banco.log(u["id"], u["email"], "admin", "acesso_revogado")
    print(f"Acesso de {u['email']} revogado")


def nova_senha(email):
    u = _conta(email)
    if not u:
        sys.exit("Conta não encontrada.")
    temporaria = secrets.token_urlsafe(9)
    with banco.conexao() as con:
        con.execute("UPDATE usuarios SET senha_hash = %s, tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = %s",
                    (contas.generate_password_hash(temporaria), u["id"]))
    banco.log(u["id"], u["email"], "admin", "senha_temporaria")
    print(f"Senha temporária de {u['email']}: {temporaria}")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "liberar":
        liberar(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "revogar":
        revogar(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "senha":
        nova_senha(sys.argv[2])
    else:
        sys.exit(__doc__)
