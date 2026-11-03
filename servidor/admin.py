"""Administração da Escala Certa pela linha de comando (local ou dentro do container).

  python admin.py liberar <email>   libera o acesso ilimitado (cria a conta se não existir; a pessoa entra pelo código)
  python admin.py revogar <email>   tira o acesso (estorno ou arrependimento); a conta e a escala salva continuam
  python admin.py sair <email>      derruba a conta em todos os aparelhos (no próximo, entra de novo pelo código)
  python admin.py apagar <email>    apaga a conta a pedido da pessoa (LGPD, art. 18): e-mail e escala salva
  python admin.py meta <pedido>     manda de novo à Meta a compra de um pedido aprovado (até 7 dias depois)
  python admin.py oferta <preço> <horas> <email> [<email> ...] [--enviar] [--teste]
                                    e-mail único com preço especial para quem montou a escala e não pagou. Sem --enviar
                                    só mostra a lista e o texto. --teste deixa mandar para conta que já recebeu ou já
                                    pediu reembolso (as nossas de teste)

Não há senha: quem quer entrar recebe um código de 6 números no e-mail.
"""
import sys
from datetime import timedelta, timezone

import banco
import contas
import correio
import meta
from config import config


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



BRT = timezone(timedelta(hours=-3))
DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def _reais(v):
    return f"{float(v):.2f}".replace(".", ",").removesuffix(",00")


def texto_oferta(valor, ate, link):
    """O e-mail: fala da escala que a própria pessoa montou (não é propaganda geral) e avisa que é o único.
    Tem cara de mensagem, não de anúncio: no teste de 03/11, "Oferta" no assunto e uma caixa grande de preço
    mandaram o e-mail para a aba Promoções do Gmail; assunto neutro e o preço em negrito no texto caem na Principal."""
    a = ate.astimezone(BRT)
    quando = f"{DIAS[a.weekday()]}, {a:%d/%m}, às {a.hour}h" + (f"{a:%M}" if a.minute else "")
    assunto = "Sua escala de folgas ficou guardada"
    texto = ("Olá!\n"
             "Você montou a escala de folgas 5x2 da sua equipe na Escala Certa, mas o pagamento não foi concluído. "
             "A escala continua guardada na sua conta.\n"
             f"Para você terminar, a escala completa sai por **R$ {_reais(valor)}**, em vez de R$ {_reais(config.PRECO)}, "
             f"até {quando}.\n"
             "[botao]\n"
             "O botão já entra na sua conta e mostra o Pix. Pagou, a escala abre completa na hora: as folgas dos próximos "
             "12 meses, a imagem do mês para o WhatsApp da equipe e o Excel. E continua valendo a garantia de 7 dias.\n"
             "Este é o único e-mail que mandamos sobre isso. Se tiver alguma dúvida, é só responder.")
    return assunto, texto, ("Abrir minha escala e pagar com Pix", link)


def oferta(valor, horas, emails, enviar=False, teste=False):
    """Preço especial por conta + o e-mail com o link que já entra e abre o Pix. Um e-mail por pessoa, uma vez só
    (é o que a Política de Privacidade promete); quem já pagou, pediu reembolso ou não tem escala salva fica de fora."""
    if not 0 < valor <= config.PRECO or not 1 <= horas <= 24 * 7:
        sys.exit(f"Preço entre 0 e {config.PRECO} e validade entre 1 e 168 horas.")
    banco.criar_tabelas()               # as colunas da oferta, se o site ainda não subiu com elas
    vao = []
    for email in emails:
        u = _conta(email)
        if not u:
            print(f"  fora  {email}: conta não encontrada"); continue
        with banco.conexao() as con:
            reemb = con.execute("SELECT 1 FROM pedidos WHERE usuario_id = %s AND status IN ('reembolsando', 'reembolsado')",
                                (u["id"],)).fetchone()
            escala = con.execute("SELECT 1 FROM escalas WHERE usuario_id = %s", (u["id"],)).fetchone()
        motivo = ("já tem acesso" if u["liberado_em"] else
                  "sem escala salva" if not escala else
                  None if teste else
                  "já recebeu este e-mail" if u["oferta_enviada"] else
                  "pediu reembolso" if reemb else None)
        if motivo:
            print(f"  fora  {u['email']}: {motivo}"); continue
        print(f"  vai   {u['email']}")
        vao.append(u)
    ate = banco.agora() + timedelta(hours=horas)
    assunto, texto, (rotulo, _) = texto_oferta(valor, ate, f"{config.BASE_URL}/oferta/...")
    print(f"\nAssunto: {assunto}\n\n" + texto.replace("[botao]", f"[ {rotulo} ]").replace("\n", "\n\n"))
    if not enviar:
        print(f"\nNada foi enviado. Para mandar a {len(vao)} conta(s), repita com --enviar.")
        return
    for u in vao:
        token, ate = contas.criar_oferta(u["id"], valor, horas)
        assunto, texto, botao = texto_oferta(valor, ate, f"{config.BASE_URL}/oferta/{token}")
        correio.enviar(u["email"], assunto, texto, botao=botao)
        with banco.conexao() as con:
            con.execute("UPDATE usuarios SET oferta_enviada = %s WHERE id = %s", (banco.agora(), u["id"]))
        banco.log(u["id"], u["email"], "admin", f"oferta:{valor}")
        print(f"Enviado: {u['email']}")


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
    elif len(sys.argv) >= 5 and sys.argv[1] == "oferta":
        args = [x for x in sys.argv[4:] if not x.startswith("--")]
        oferta(float(sys.argv[2].replace(",", ".")), int(sys.argv[3]), args,
               enviar="--enviar" in sys.argv, teste="--teste" in sys.argv)
    else:
        sys.exit(__doc__)
