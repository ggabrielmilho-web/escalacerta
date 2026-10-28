"""Administração da Escala Certa pela linha de comando (local ou dentro do container).

  python admin.py liberar <email>   libera o acesso ilimitado (cria a conta com senha temporária se não existir)
  python admin.py revogar <email>   tira o acesso (estorno ou arrependimento); a conta e a escala salva continuam
  python admin.py senha <email>     gera uma senha temporária nova (a pessoa troca em "Minha conta")
  python admin.py apagar <email>    apaga a conta a pedido da pessoa (LGPD, art. 18): e-mail, senha e escala salva

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


def apagar(email):
    """Pedido de exclusão (LGPD, art. 18). Apaga a escala salva e os códigos de recuperação e tira o e-mail
    e a senha da conta. Ficam, por obrigação legal, os pedidos (lei fiscal) e o registro de acesso (Marco Civil,
    6 meses), como diz a Política de Privacidade. A linha da conta fica sem dado pessoal, porque os pedidos apontam para ela."""
    u = _conta(email)
    if not u:
        sys.exit("Conta não encontrada.")
    with banco.conexao() as con:
        n_pedidos = con.execute("SELECT COUNT(*) AS n FROM pedidos WHERE usuario_id = %s", (u["id"],)).fetchone()["n"]
    print(f"Vai apagar a conta {u['email']} (id {u['id']}): e-mail, senha e escala salva. "
          f"Ficam {n_pedidos} pedido(s) e o registro de acesso, por obrigação legal.")
    if input("Digite APAGAR para confirmar: ").strip() != "APAGAR":
        sys.exit("Nada foi apagado.")
    banco.log(u["id"], u["email"], "admin", "conta_apagada_a_pedido")
    with banco.conexao() as con:
        con.execute("DELETE FROM escalas WHERE usuario_id = %s", (u["id"],))
        con.execute("DELETE FROM recuperacoes WHERE usuario_id = %s", (u["id"],))
        # senha nova aleatória: a sessão leva a versão da senha, então os aparelhos logados saem na hora
        con.execute("UPDATE usuarios SET email = %s, senha_hash = %s, liberado_em = NULL, tentativas_falhas = 0, "
                    "bloqueado_ate = NULL, bloqueios_seguidos = 0 WHERE id = %s",
                    (f"apagada-{u['id']}@conta.apagada", contas.generate_password_hash(secrets.token_urlsafe(32)), u["id"]))
    print(f"Conta {u['id']} apagada. O mesmo e-mail pode criar uma conta nova do zero.")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "liberar":
        liberar(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "revogar":
        revogar(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "senha":
        nova_senha(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "apagar":
        apagar(sys.argv[2])
    else:
        sys.exit(__doc__)
