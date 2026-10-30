"""Administração da Escala Certa pela linha de comando (local ou dentro do container).

  python admin.py liberar <email>   libera o acesso ilimitado (cria a conta se não existir; a pessoa entra pelo código)
  python admin.py revogar <email>   tira o acesso (estorno ou arrependimento); a conta e a escala salva continuam
  python admin.py sair <email>      derruba a conta em todos os aparelhos (no próximo, entra de novo pelo código)
  python admin.py apagar <email>    apaga a conta a pedido da pessoa (LGPD, art. 18): e-mail e escala salva
  python admin.py meta <pedido>     manda de novo à Meta a compra de um pedido aprovado (até 7 dias depois)

Não há senha: quem quer entrar recebe um código de 6 números no e-mail.
"""
import sys

import banco
import contas
import meta


def _conta(email):
    with banco.conexao() as con:
        return con.execute("SELECT * FROM usuarios WHERE email = %s", (contas.normalizar_email(email),)).fetchone()


def liberar(email):
    banco.criar_tabelas()
    u = _conta(email)
    if not u:
        u = contas.criar(email, "admin")
        print(f"Conta criada: {u['email']} (entra pelo código no e-mail)")
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


def sair(email):
    """Para quem perdeu o celular logado: troca o segredo da sessão e todos os aparelhos saem."""
    u = _conta(email)
    if not u:
        sys.exit("Conta não encontrada.")
    with banco.conexao() as con:
        con.execute("UPDATE usuarios SET senha_hash = %s WHERE id = %s", (contas.nova_chave_sessao(), u["id"]))
    banco.log(u["id"], u["email"], "admin", "sessoes_derrubadas")
    print(f"{u['email']} saiu de todos os aparelhos")


def apagar(email):
    """Pedido de exclusão (LGPD, art. 18). Apaga a escala salva e os códigos de entrar e tira o e-mail
    da conta. Ficam, por obrigação legal, os pedidos (lei fiscal) e o registro de acesso (Marco Civil,
    6 meses), como diz a Política de Privacidade. A linha da conta fica sem dado pessoal, porque os pedidos apontam para ela."""
    u = _conta(email)
    if not u:
        sys.exit("Conta não encontrada.")
    with banco.conexao() as con:
        n_pedidos = con.execute("SELECT COUNT(*) AS n FROM pedidos WHERE usuario_id = %s", (u["id"],)).fetchone()["n"]
    print(f"Vai apagar a conta {u['email']} (id {u['id']}): e-mail e escala salva. "
          f"Ficam {n_pedidos} pedido(s) e o registro de acesso, por obrigação legal.")
    if input("Digite APAGAR para confirmar: ").strip() != "APAGAR":
        sys.exit("Nada foi apagado.")
    banco.log(u["id"], u["email"], "admin", "conta_apagada_a_pedido")
    with banco.conexao() as con:
        con.execute("DELETE FROM escalas WHERE usuario_id = %s", (u["id"],))
        con.execute("DELETE FROM recuperacoes WHERE usuario_id = %s", (u["id"],))
        # segredo de sessão novo: a sessão leva a versão dele, então os aparelhos logados saem na hora
        con.execute("UPDATE usuarios SET email = %s, senha_hash = %s, liberado_em = NULL, tentativas_falhas = 0, "
                    "bloqueado_ate = NULL, bloqueios_seguidos = 0 WHERE id = %s",
                    (f"apagada-{u['id']}@conta.apagada", contas.nova_chave_sessao(), u["id"]))
    print(f"Conta {u['id']} apagada. O mesmo e-mail pode criar uma conta nova do zero.")


def avisar_meta(pid):
    """Compra que não chegou à Meta (sem token na hora, ou de antes da API de Conversões). A Meta aceita até 7 dias
    depois; o event_id é o do pedido, e a repetição dentro de 48 h é descartada por ela."""
    print("Meta recebeu a compra" if meta.avisar_compra(pid) else "Não foi: veja o log (token, pedido aprovado?)")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "liberar":
        liberar(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "revogar":
        revogar(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "sair":
        sair(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "apagar":
        apagar(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "meta":
        avisar_meta(sys.argv[2])
    else:
        sys.exit(__doc__)
