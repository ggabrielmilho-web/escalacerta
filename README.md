# Escala Certa

Ferramenta web que responde **quantas pessoas uma empresa precisa com a escala 5x2** e entrega a **escala de folgas pronta e conferida** para 12 meses. É um produto simples, de pagamento único (R$ 37, valor de exemplo), pensado para tráfego pago na onda da **EC 141/2026**, que acaba com a escala 6x1.

- **Grátis:** a pessoa informa a equipe e como a empresa funciona e vê o placar *Hoje · A regra pede · Faltam* e a primeira semana da escala.
- **Pago (acesso ilimitado):** escala completa de 12 meses, trocas de folga na tela com conferência na hora, escala salva na conta e planilha Excel.

---

## 1. Estado atual (24/10/2026)

| Parte | Situação |
|---|---|
| Motor da escala (`gerador/motor.js`) | Pronto e testado (`testes/testa_motor.js`) |
| Página (`gerador/index.html`) | Pronta: prévia grátis, área paga, conta, celular e modo escuro |
| Planilha Excel (`gerador/exportar.js`) | Pronta e aberta no Excel. Toda fórmula vai **com o resultado gravado** (26/10): a Exibição Protegida, a prévia do WhatsApp, o Excel do celular e o Google Drive não calculam e mostravam os quadros em branco. Conferido: cada fórmula recalculada bate com o valor gravado |
| Servidor (`servidor/`): contas, pagamento, escala salva | Pronto e testado **localmente**, com o Mercado Pago **de teste**. Banco no **Postgres** desde 26/10 (era SQLite) |
| Marca (`marca/`) | Logo A em uso no site; B disponível |
| Empacotamento (`Dockerfile`, `escala-stack.yml`) | Pronto; publicação em https://escalacerta.carvalhoia.com (seção 12) |
| Domínio | Começa em `escalacerta.carvalhoia.com`; domínio próprio só se vender (`escalacerta.app.br` estava livre em 23/10) |
| Credenciais de produção (Mercado Pago, Resend, `SECRET_KEY`) | Só nas variáveis da stack no Portainer, **nunca no repositório** |
| Termos de uso e política de privacidade | Prontos (28/10): `gerador/termos.html` e `gerador/privacidade.html`, com link no rodapé e na criação de conta. **Sem aviso de cookies por enquanto** (decisão do usuário) |
| Seções de baixo da página | Prontas (28/10): dúvidas frequentes (`#duvidas`) e rodapé com o MEI que vende (CNPJ 64.942.407/0001-10, Uberlândia/MG, gabriel@carvalhoia.com) |
| Repositório | `github.com/ggabrielmilho-web/escalacerta`, **público**: sem chaves nem dados de cliente (seção 12) |

---

## 2. Estrutura de pastas

```
Escala/
├── gerador/                 o site (é a única pasta servida ao público)
│   ├── index.html           página inteira: formulário, prévia, área paga, conta
│   ├── motor.js             monta e confere a escala (sem dependências; roda no navegador e no Node)
│   ├── exportar.js          monta a planilha Excel (ExcelJS)
│   └── img/                 logo, ícone e favicon
├── servidor/                FastAPI + Postgres
│   ├── main.py              rotas (contas, pedido, escala salva, aviso do Mercado Pago) + serve o site
│   ├── contas.py            conta sem senha: cadastro na compra (só o e-mail) e entrar por código no e-mail
│   ├── mercado_pago.py      Checkout Pro (API de Preferences) e consulta de pagamento
│   ├── correio.py           e-mail pelo Resend (NÃO renomear para email.py: esconde o pacote do Python)
│   ├── banco.py             pool de conexões (psycopg 3) e tabelas
│   ├── config.py            lê o .env
│   ├── admin.py             liberar / revogar acesso, derrubar aparelhos, apagar conta pela linha de comando
│   ├── requirements.txt
│   └── .env.example         modelo do .env (o .env real nunca vai para o repositório)
├── testes/testa_motor.js    teste do motor (node, sem dependências)
├── marca/                   logo A e B (SVG e PNG), apresentação e o gerador da logo
├── Dockerfile, .dockerignore, escala-stack.yml   empacotamento para o Swarm do servidor do DanfeZap
├── .gitignore               tira .env, banco e cache do repositório
└── Escala_*.xlsx            planilhas feitas para a RH (origem da ideia; não fazem parte do app)
```

---

## 3. Como rodar

### 3.1 Protótipo direto do arquivo
Abra `gerador/index.html` no navegador. Precisa de internet por causa das fontes e da biblioteca do Excel (CDN). Sem servidor, aparece o selo **Protótipo** e o botão "Liberar" libera sem cobrar. Serve para testar o motor e a tela.

### 3.2 Site completo, local (conta e pagamento de teste)
Precisa de um Postgres local com banco e usuário próprios (o servidor cria as tabelas sozinho ao subir):
```sql
CREATE ROLE escala_app LOGIN PASSWORD '<senha>';
CREATE DATABASE escala_certa OWNER escala_app;
```
```bash
cd servidor
python -m venv .venv
.venv\Scripts\activate            # Windows (no Linux: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env            # preencher DATABASE_URL (localhost), MP_ACCESS_TOKEN de TESTE e BASE_URL=http://localhost:8080
uvicorn main:app --port 8080
```
Abra **http://localhost:8080**.
- **Pagamento de teste:** no Mercado Pago, entre com o **comprador de teste** (criado em *Contas de teste* no painel). Em `http` local o Mercado Pago **não volta sozinho**: depois de pagar, clique em "Voltar ao site". Com `https` em produção ele volta e avisa sozinho.
- **Código para entrar** sem `RESEND_API_KEY`: o código aparece no log do servidor (só em desenvolvimento).
- **Acesso sem pagar, para testar:** `python admin.py liberar seu@email.com 365`.

### 3.3 Testes
```bash
node testes/testa_motor.js        # da pasta Escala; ~4 s
```
O teste confere:
- 600 configurações aleatórias, de 3 a 100 pessoas: toda escala montada passa na conferência, sem aviso, e o calendário bate com a escala fixa;
- as respostas conhecidas: na loja do exemplo falta 1 pessoa se contratar homens e 2 se contratar mulheres; na "operação de hoje" faltam 2 com 10 pessoas, 10 com 50 e 20 com 100;
- a data da Sexta-feira Santa.

Rode o teste sempre que mexer no `motor.js`.

---

## 4. Como o cliente usa

1. **Sua equipe hoje:** a quantidade de pessoas, com nomes opcionais, "+ Adicionar pessoa" ou "Colar lista de nomes".
   - **"A equipe trabalha em turnos?"** (vem "Não"). Com "Sim", a equipe vira **turnos fixos**: de 2 a 5 blocos (começa com Manhã, Intermediário e Noite), cada um com nome editável, quantidade, nomes e "Colar lista de nomes" do turno. Sem nome, a pessoa vira "Manhã 1, Manhã 2…", como na planilha da RH.
   - **Exemplo de turnos** (29/10, decisão do usuário): quem marca "Sim" sem ter mexido no exemplo recebe **3 turnos de 3 pessoas sem nome**, com mínimo **2 de segunda a quinta e no domingo, 3 na sexta e no sábado** (o pico, turno inteiro). No 6x1 fecha; no 5x2 **falta 1 em cada turno** (Hoje 9 · A regra pede 12). Com 3 pessoas a operação de hoje (2 por dia) não faltaria ninguém. Ao mudar a equipe (quantidade, tirar, colar, novo turno), o exemplo acaba e o mínimo de todos os turnos passa a ser a operação de hoje. Voltar para "Não" sem mexer devolve o exemplo de 5. Quem já tinha digitado a equipe tem a equipe dividida em 3 turnos.
2. **Funcionamento:** os dias em que abre, o **mínimo de pessoas trabalhando** por dia e os dias em que pode haver folga. Com turnos, o mínimo tem **uma coluna por turno** (no celular, os dias ficam abreviados para caber); dias abertos e "pode folgar" valem para todos.
   - O mínimo **começa com a operação de hoje no 6x1**: cada pessoa trabalha 6 dias e, com o domingo aberto, a regra do domingo tira parte da equipe. Sem mexer em nada, a resposta é *"para manter a sua operação de hoje no 5x2, faltam X"* (cerca de 20%).
   - Enquanto a pessoa não edita o mínimo, ele acompanha o tamanho da equipe, os dias abertos e o ramo. Depois de editado, os números dela ficam, inclusive na escala salva. O link "Voltar para a operação de hoje" desfaz a edição.
3. **Regras:** o ramo (comércio, ou indústria/transporte/serviços) e se a empresa **se enquadra no art. 386 da CLT**. Se marcar Sim, informa o sexo de cada pessoa.
4. **Início:** a data em que a escala começa. O padrão é 14/12/2026 ou a próxima segunda-feira.
5. Botão **"Descobrir quantas pessoas eu preciso"**, que depois passa a se chamar **"Atualizar escala"**.

**O resultado grátis:**
- **Placar:** Hoje · A regra pede · Faltam (ou "Dá conta" / "Sobra"). Com art. 386, mostra os dois cenários: "falta 1 se contratar homens; 2 se mulheres". Quando falta gente, a escala já sai montada com "Contratação 1, 2…". Com turnos, o placar é o total e embaixo vem **uma linha por turno** (Hoje · A regra pede · Dá conta / Falta N), porque é por turno que o líder contrata; as contratações entram no fim do turno delas, numeradas em sequência.
- **Card "Sua próxima etapa":** o título é "Contratar é só o começo. Escalar corretamente é o desafio." (ou "Sua equipe dá conta. Agora, organize as folgas do ano todo."). Mostra a **primeira semana** em formato de calendário, com os controles de mês e de formato; o resto aparece borrado. Traz a lista do que vem na versão completa (folgas de 12 meses, conferida, **imagem do mês para o WhatsApp**, Excel que fica vermelho se errar), o preço e o botão **"Liberar minha escala completa"**.

**A área paga:**
- calendário de 12 meses, mês a mês, com os feriados;
- visão "uma linha por dia" (padrão até 6 pessoas) ou "uma linha por pessoa";
- **trocas de um dia**: clicar troca folga ↔ trabalho, a conferência refaz na hora, e há "desfazer a última" e "voltar à escala original";
- a escala fixa (o rodízio de cada pessoa), com a escolha **"Folgas emendadas / Separadas"** ao lado de "Ver outra opção de rodízio" (a mesma escolha está na prévia grátis). É gosto da empresa, não regra: emendadas (2 dias seguidos) é o padrão; a escolha vai na escala salva e na aba Regras do Excel. Fica na escala, e não no formulário, para não alongar o começo;
- com turnos, **tudo sai agrupado por turno**: no calendário "uma linha por pessoa", uma faixa com o nome do turno abre o bloco e a linha **Trabalhando** de cada turno fecha; em "uma linha por dia", cada turno é um bloco de colunas com o próprio Trabalhando; a escala fixa e o resumo têm a faixa do turno. A troca de um dia é conferida contra o mínimo **do turno**;
- resumo por pessoa;
- Excel;
- **"Imagem do mês p/ WhatsApp"**: um PNG do mês que está na tela, da **equipe toda** (nomes × dias, só as folgas marcadas; com turnos, uma faixa por turno), de **um turno só** (para o grupo do turno) ou de **uma pessoa** (calendário dela com as folgas e o total de domingos de folga). No celular abre o "Compartilhar"; no computador baixa o arquivo para anexar no WhatsApp Web. **Não dispara mensagem**;
- "Copiar texto", a versão em texto da mesma coisa.

**A conta (sem senha, desde 29/10/2026):**
- criada no "Liberar" **só com o e-mail**, e a pessoa segue direto para o pagamento já conectada naquele aparelho. Erro de digitação comum (`gmial.com`, `hotmal.com`…) ganha um "Você quis dizer…?";
- para entrar em **outro aparelho** (ou depois de limpar o navegador): e-mail → **código de 6 números no e-mail** → entra;
- e-mail que **já tem conta** não entra sem o código, nem pelo "Liberar" (senão digitar o e-mail de quem pagou daria o acesso dele): o servidor responde 409 e já manda o código;
- depois do pagamento sai um e-mail de **"Compra confirmada"**, que também ensina a entrar em outro aparelho;
- o topo mostra "Entrar" ou "Minha conta" (garantia de 7 dias, sair);
- **a escala é salva na conta** sozinha e volta em qualquer aparelho. **Desde 30/10, a partir do e-mail, antes de pagar:** a cada cálculo e de novo na hora de ir para o Mercado Pago. Depois de pagar, em qualquer navegador em que a pessoa entrar (pela volta do pagamento ou pelo link do e-mail), a escala dela aparece pronta.
- **Por quê (30/10, primeira venda):** o comprador pagou pelo app do Mercado Pago e voltou ao site **em outro navegador** (o do Instagram não é o do celular). Sem sessão, entrou por código; sem a cópia local, caiu em "Pagamento confirmado" com o formulário vazio do exemplo e **sem a escala dele**. Também pediu 4 códigos e errou 3 vezes: digitava o que chegava primeiro, e cada código novo cancelava o anterior.
- **Por quê:** em 27–28/10, 4 de 4 pessoas que clicaram em "Liberar" fecharam a janela de e-mail e senha sem enviar (nenhum `POST /api/conta` no registro). O código não é pedido antes de pagar porque tiraria a pessoa do navegador do Instagram para buscar o e-mail.

---

## 5. Regras de negócio e base legal

| Regra | No app | Base |
|---|---|---|
| 2 folgas por semana (segunda a domingo) | Obrigatório em toda semana inteira | EC 141/2026 (promulgada 16/10/2026): 2 dias de descanso remunerado a partir de **16/12/2026**; 42 h/semana a partir de 16/12/2026 e 40 h a partir de 16/12/2027 |
| Dias seguidos de trabalho | Até 5 (padrão). Se não fechar, oferece até 6 | OJ 410 do TST: folga depois do 7º dia seguido é irregular |
| Domingo, comércio | Folga pelo menos 1 a cada **3 semanas** | Lei 10.101/2000, art. 6º, parágrafo único |
| Domingo, indústria, transporte e serviços | Pelo menos 1 a cada **7 semanas** | Portaria MTP 671/2021, art. 58, § 1º |
| Domingo, mulheres (se a empresa se enquadra) | **Domingos alternados**, só para quem é mulher; "contratação a definir" conta como mulher, para valer para qualquer contratação | CLT, art. 386; a SDI-1 do TST aplica e prevalece sobre a regra do comércio (há divergência na 2ª Turma) |
| Feriados | Marcados no calendário e no Excel: nacionais e Sexta-feira Santa (pela Páscoa). Se abrir: pagar em dobro ou dar folga | Lei 605/1949; no comércio, abrir em feriado depende de convenção coletiva |
| Folga a mais na semana | **Aviso amarelo**, não bloqueia (pode ser férias, atestado, compensação) | A lei exige no mínimo 2 |
| Folgas emendadas ou separadas | Escolha na escala; o padrão é emendadas. Nos dois, evita 3 folgas seguidas e "folga, trabalha 1 dia, folga" sempre que a escala fecha sem isso | Gosto da empresa: a lei não pede nenhum dos dois |
| Turnos fixos | Cada pessoa sempre no mesmo turno; cada turno é conferido contra o próprio mínimo por dia | Revezamento de turno (a pessoa muda de turno), 12x36 e plantões ficam fora |
| Motorista em viagem | Fora do escopo (avisado no "?") | Lei 13.103/2015 |

Estaduais e municipais **não** entram nos feriados. A página e o Excel avisam que a escala é ferramenta de apoio e que **a convenção coletiva** pode ter regras próprias.

---

## 6. Como o motor funciona (`gerador/motor.js`)

As datas viram dias inteiros em UTC, sem fuso. O período vai até 1 ano. A ideia central: cada pessoa segue um **rodízio de padrões semanais** ("folga seg+dom", "ter+qua"…). Num ciclo de *T* padrões, cada pessoa anda **uma posição por semana**, então **toda semana tem a mesma cobertura** e só as viradas entre semanas precisam ser conferidas.

1. **`planejar`:** valida a entrada e calcula:
   - quantas pessoas podem folgar em cada dia (equipe − mínimo, só nos dias com folga liberada);
   - quantas folgas distribuir (2 − dias fechados);
   - os grupos por regra de domingo (mulheres art. 386 = 2 semanas; os demais, a regra do ramo), com grupos de cerca de 12 acima de 24 pessoas.

   Se não fecha, devolve o erro **explicado**, com sugestões: "As folgas não cabem", "Domingos de folga não fecham", "Gente de menos no sábado"…
2. **`distribuir`:** quantas folgas cada dia recebe. O domingo leva primeiro o que a regra exige, e o resto vai para os dias com mais gente acima do mínimo.
3. **`dividir`:** reparte essas folgas entre os grupos, proporcional ao tamanho, respeitando o mínimo de domingos de cada grupo.
4. **`ordenar`:** busca com retrocesso da ordem do ciclo. Confere os dias seguidos na virada da semana e a janela de domingos.
   - **Desenho das folgas** (29/10, pedido de uma RH que montou à mão): "folgas emendadas" prefere as 2 juntas (dentro da semana ou domingo + segunda); "separadas" prefere espalhadas. Nos dois, foge de **3 folgas seguidas** e de **folga, trabalha 1 dia, folga**.
   - Primeiro tenta um ciclo **sem nenhum desses defeitos**, conferindo também a volta da última semana para a primeira (era ali que o exemplo da página caía: folga quarta e domingo, depois segunda e terça). Se não achar, a busca normal aceita o defeito: **é preferência, nunca deixa de fechar** e não muda quantas pessoas faltam (conferido em 162 cenários, antes × depois). A conta de "quantos faltam" (`rapido`) pula essa parte.
   - Resultado em 160 cenários variados: defeitos só de folga **−84%**; o exemplo da página ficou sem nenhum.
5. **`montar`:** tenta, nesta ordem:
   - (a) **ciclo curto**: uma mini-equipe de 3, 4, 2, 5 ou 6 pessoas, replicada, se o tamanho dividir a equipe; a escala se repete a cada poucas semanas e continua justa;
   - (b) com art. 386 e equipe mista, **todo mundo em domingos alternados** num rodízio só, que divide melhor os domingos;
   - (c) cada regra no seu rodízio.

   A "semente" é o botão "Ver outra opção de rodízio". Devolve a `grade` (calendário), o `rodizio` (escala fixa de cada pessoa, com o próprio período) e os `feriados`. Se não fechar, testa se fecharia com 6 dias seguidos e oferece o botão.
6. **`validar`:** confere qualquer grade, inclusive editada à mão.
   - **Problemas:** semana com menos de 2 folgas, dias seguidos acima do limite, domingos seguidos acima da regra, dia com gente abaixo do mínimo.
   - **Avisos:** folga a mais na semana.
   - Também marca as células com problema.
7. **Turnos fixos** (`cfg.turnos = [{ nome, minimo[7] }]`, `cfg.turnoDe[e]`): cada turno é uma equipe à parte com o próprio mínimo; `montar` monta um de cada vez (`doTurno`) e `juntarTurnos` junta na ordem das pessoas. `validar` confere cada turno no seu mínimo e devolve `coberturaTurno` e `faltaTurno`. Sem turnos, nada muda.
8. **`faltam` / `menorEquipe`:** a menor equipe que fecha, partindo do mínimo teórico. Usa a busca rápida e, se ela não achar encaixe, confere com a busca completa, para nunca mandar contratar sem precisar.

**Desempenho medido:** menos de 1 s na maioria dos casos. O pior caso medido foi **2 s** (100 pessoas, equipe mista, art. 386 e falta de gente), e roda no navegador, sem servidor.

**Coisas que já deram errado e não devem voltar:**
- **Dividir a equipe em grupos com padrões diferentes** para encurtar o ciclo deixou a escala **injusta** (alguém com 0 domingos trabalhados e outro com 26). O ciclo curto certo é a mini-equipe **replicada**.
- Com regras diferentes, cada pessoa tem o **próprio período**. A tabela da escala fixa mostra "↺ volta à semana 1" no fim da linha de cada pessoa.
- A **cobertura igual toda semana** é o que garante o mínimo. Por isso as trocas de um dia são conferidas, e não refeitas pelo motor.

---

## 7. A planilha Excel (`gerador/exportar.js`)

Gerada no navegador com **ExcelJS 4.4.0** (CDN jsDelivr). Abre na aba **Calendário**. Cada fórmula leva o resultado já calculado (`f(formula, result)` em `exportar.js`): quem abre sem calcular vê os números, e com a edição habilitada o Excel recalcula tudo ao abrir (`fullCalcOnLoad`). **Fórmula nova sem resultado abre em branco no celular.**

| Aba | Conteúdo |
|---|---|
| Calendário | 12 meses. "Uma linha por dia" (Data, Dia da Semana, cada pessoa com Trabalha/Folga, Trabalhando, Mínimo, Observação) ou "uma linha por pessoa" (T/F/X por dia). Lista de validação nas células editáveis. É **a única aba que se edita** |
| Quadro do mês (`Dez 26`, `Jan 27`…) | Uma aba por mês do período (13 quando a escala não começa no dia 1), pronta para imprimir e afixar: A4 deitado, cabe na largura, título e cabeçalho repetidos. Pessoas × dias com **só F e X** (em branco = trabalha), linha **Trabalhando × Mínimo** (vermelho se faltar gente) e colunas **Folgas** e **Domingos de folga**. Lê o Calendário por fórmula: mudou lá, muda aqui |
| Escala fixa | O rodízio de cada pessoa por semana, com "↺ volta à semana 1" |
| Folgas por semana | Fórmula por pessoa e semana: **vermelho** se faltar folga, **amarelo** se sobrar |
| Resumo | Folgas, domingos de folga, domingos trabalhados e sábados trabalhados (fórmulas) |
| Regras | A configuração usada (com os turnos e a escolha de folgas emendadas ou separadas), os feriados do período, a base legal e o aviso |

No Calendário, "Trabalha"/"T" sai em cinza claro para a folga saltar aos olhos, domingos têm fundo bege e feriados, rosa (nos quadros do mês também). A formatação condicional **refaz a conferência se a pessoa editar no Excel**: dias seguidos acima do limite em vermelho e dia com gente de menos em vermelho. No formato "uma linha por dia", o domingo de semana sem 2 folgas fica laranja. Nos dois formatos, a aba "Folgas por semana" acusa falta e sobra de folga. Até 12 pessoas o padrão é "uma linha por dia" (o formato que a RH preferiu); acima disso, "uma linha por pessoa". O cliente escolhe antes de baixar.

**Com turnos**, todas as abas saem agrupadas por turno, no formato da planilha de 2 turnos que a RH aprovou: faixa com o nome do turno, as pessoas dele e as linhas **Trabalhando** e **Mínimo** do turno, com o vermelho quando falta gente **no turno**. Em "uma linha por dia", cada turno é um bloco de colunas com o próprio Trabalhando e Mínimo. Sem turnos, o Excel é célula por célula o mesmo de antes (conferido nos dois formatos), com uma linha a mais na aba Regras (folgas emendadas ou separadas).

---

## 8. Servidor (`servidor/`)

**Rotas** (`main.py`):

| Rota | Faz |
|---|---|
| `POST /api/conta` | Cria a conta **só com o e-mail** (na compra) e já entra. E-mail que já tem conta: 409 e manda o código |
| `POST /api/codigo` | Manda o código de 6 números para entrar. A resposta é sempre igual, exista ou não a conta |
| `POST /api/entrar`, `POST /api/sair` | Entra com e-mail + código; sai |
| `GET /api/eu` | Quem está logado e até quando vai o acesso |
| `POST /api/pedido` | Cria a cobrança no Checkout Pro para a conta logada (409 se a conta já tem acesso: não cobra duas vezes) |
| `GET /api/pedido/{id}` | Situação; se pago, libera o acesso ilimitado (só o dono do pedido vê) |
| `POST /api/reembolso` | **Garantia de 7 dias** (CDC art. 49): o cliente cancela em "Minha conta"; estorno total na hora pelo Mercado Pago (`X-Idempotency-Key` por pedido), pedido vira `reembolsado` e o acesso sai. Uma vez por conta; depois, por e-mail. Se o MP recusar (sem saldo), o pedido volta a `aprovado` e a mensagem manda escrever. Aviso atrasado do MP nunca relibera pedido estornado. `GET /api/eu` traz `reembolso_ate` |
| `GET`/`PUT /api/escala` | A escala salva da conta (até 5 MB). Guardar: qualquer conta, pagando ou não. Ler: só com acesso ativo |
| `POST /webhook/mercadopago` | Aviso do Mercado Pago. O pagamento é sempre **consultado de novo** na API |
| `GET /` | O site: **só a pasta `gerador`**, nunca a raiz do projeto |

**Banco** (`banco.py`): banco **`escala_certa`** no Postgres do servidor, com usuário próprio (`escala_app`), nunca o banco do DanfeZap nem o superusuário. Tabelas `usuarios`, `pedidos`, `escalas`, `recuperacoes` e `log_acesso`, criadas ao subir (`CREATE TABLE IF NOT EXISTS`, uma vez por processo, com `lock_timeout`). Datas em `TIMESTAMPTZ`, devolvidas à página sempre em UTC; a escala salva é o JSON da página guardado como texto. Pool psycopg 3 que testa a conexão antes de emprestar (o Postgres compartilhado fecha conexão ociosa), como no Arado. O acesso é a coluna `liberado_em` (quando foi liberado; vazio = sem acesso), sem data de fim.

**Segurança.** Não há senha (desde 29/10/2026):
- **código de 6 dígitos para entrar**: vale 15 min, aceita 5 tentativas, no máximo 5 por hora por conta, uso único, guardado com HMAC. **Qualquer código ainda válido serve** (desde 30/10; antes, pedir outro derrubava o anterior e o primeiro comprador errou 3 vezes digitando o que chegou primeiro); entrar derruba todos, e o erro conta tentativa em todos os válidos. **Nunca vai para o log em produção**. A tentativa errada é gravada antes de responder o erro (até 29/10 o rollback da transação desfazia a contagem e o limite de 5 não valia);
- pedir código responde **sempre igual**, exista ou não a conta. A trava por IP é só de volume, em memória;
- e-mail que já tem conta só entra com o código, inclusive pelo "Liberar";
- **sessão em cookie assinado** (`SECRET_KEY`, obrigatória em produção), `HttpOnly`, `SameSite=Lax`, `Secure` com https; o login dura 90 dias (é só a sessão: o acesso pago não vence). Leva a versão do segredo da conta (a coluna ainda se chama `senha_hash`): `admin.py sair` e `apagar` trocam esse segredo e **derrubam todos os aparelhos**. Contas antigas, criadas com senha, continuam válidas e entram pelo código;
- **aprovação de pagamento atômica**: o aviso e a consulta chegando juntos não liberam acesso em dobro (testado com 20 aprovações simultâneas);
- verificado em 24/10, todos com resultado esperado:
  - `/.env`, código, banco, `/docs` e `/openapi.json` respondem 404;
  - rotas protegidas sem login respondem 401;
  - pedido de outra conta responde 404;
  - escala sem acesso responde 402;
  - escala grande demais responde 413;
  - aviso de pagamento falso é ignorado.

---

## 9. Pagamento (Mercado Pago)

- **Checkout Pro, API de Preferences:** a pessoa vai para a página do Mercado Pago (Pix ou cartão) e volta para `/?pedido=<id>`.
- **Aplicação "Escala Certa" separada, na MESMA conta do DanfeZap.** O dinheiro cai no mesmo saldo, mas as **credenciais são próprias**, e **o DanfeZap não é tocado**. Cada cobrança diz para onde mandar o aviso, e o webhook do DanfeZap ignora pagamento que não é dele (`DanfeZap/app/main.py`, "não encontrado").
- Em cada cobrança:
  - `external_reference = "escala-<id>"`, que separa as vendas nos relatórios;
  - nome **ESCALACERTA** na fatura do cartão;
  - **sem boleto**, porque a liberação tem de ser na hora;
  - **só à vista**.
- `auto_return` e `notification_url` só vão quando `BASE_URL` é https (o Mercado Pago exige endereço público).
- **Como se confirma o pagamento:** a página consulta o pedido a cada 3 s (o servidor busca no Mercado Pago pela referência), e o aviso do Mercado Pago também aprova, sempre reconsultando. O acesso é **ilimitado**: não vence e não precisa renovar.
- A credencial de teste usada até agora é de uma **conta de teste** (`TESTUSER…`, marcada `test_user`), mesmo começando com `APP_USR-`.
- Antes de a página sair para o Mercado Pago, a escala montada é guardada no navegador (`localStorage`), para mostrar **a mesma escala** na volta.

---

## 10. E-mail (Resend da CarvalhoIA)

O código para entrar e o recibo "Compra confirmada" saem pelo **Resend**, com o domínio **carvalhoia.com, que já está verificado** (o mesmo do DanfeZap). O remetente padrão é `Escala Certa <nao-responda@carvalhoia.com>`, e `EMAIL_RESPOSTA` é opcional, para onde vão as respostas. Use uma **chave nova do Resend só para a Escala Certa**, com permissão só de envio. Não há disparo de WhatsApp, por decisão do produto.

---

## 10.1 Rastreio do tráfego (Google Analytics e Pixel da Meta)

Só no site publicado (https); local e protótipo não enviam nada. GA4 `G-E0VBXV19MN` e Pixel `4114167638802615` (IDs públicos, aparecem no código de qualquer página). **Nenhum dado pessoal sai da página**: nem e-mail nem os nomes da equipe (o e-mail embaralhado só vai do servidor, na compra; abaixo).

| Passo | GA4 | Pixel da Meta |
|---|---|---|
| Abriu a página | `page_view` | `PageView` |
| Fez o cálculo (1 vez por visita) | `calculo_feito` (equipe, faltam) | `ViewContent` |
| Clicou em "Liberar" | `clique_liberar` | `AddToCart` |
| Criou a conta | `sign_up` | `CompleteRegistration` |
| Foi para o Mercado Pago | `begin_checkout` | `InitiateCheckout` |
| Pagamento confirmado na página | `purchase` (id do pedido, R$ 37) | `Purchase` (`eventID` = `compra-<pedido>`) |

A compra é contada **uma vez por pedido** (marca no navegador). Pela página, ela só é contada quando a pessoa vê a confirmação; quem paga e nunca mais abre o site não conta.

**API de Conversões (`servidor/meta.py`, desde 30/10).** No celular o anúncio abre dentro do Instagram e a volta do Mercado Pago cai no Chrome: outro navegador, sem o cookie do anúncio. As duas primeiras vendas (30/10) não chegaram à Meta. Agora:
- `POST /api/pedido` guarda na coluna `pedidos.rastreio` os cookies do Pixel (`_fbp`, `_fbc` = o clique do anúncio), o IP real e o navegador;
- quando o pedido é aprovado (aviso do Mercado Pago ou consulta da página, quem trocar o status primeiro), o servidor manda o `Purchase` em segundo plano, com o e-mail em SHA-256, valor e `event_id` = `compra-<pedido>`, o mesmo da página: se os dois chegam, a Meta conta um;
- depois de enviar, o rastreio do pedido é apagado; pedido não pago perde o rastreio em 2 dias (Política de Privacidade);
- sem `META_CAPI_TOKEN` nada é enviado (só o log). `META_TEST_CODE` manda para "Testar eventos" do Gerenciador;
- pedido de antes disso (sem rastreio): `admin.py meta <pedido>` manda como `system_generated`, com o IP do registro de acesso. A Meta aceita até 7 dias depois;
- cada envio fica no `log_acesso` como `meta:<pedido>:ok` ou `meta:<pedido>:nao_enviado`. Testado com os scripts reais e os envios interceptados (26/10). A Meta não envia eventos de navegador automatizado em localhost; a conferência real é no "Testar eventos" do Gerenciador de Eventos.

---

## 11. Administração (`servidor/admin.py`)

```bash
python admin.py liberar <email>   # libera o acesso ilimitado; cria a conta se não existir (a pessoa entra pelo código)
python admin.py revogar <email>   # tira o acesso (estorno ou arrependimento); a conta e a escala salva continuam
python admin.py sair <email>      # derruba a conta em todos os aparelhos (perdeu o celular logado)
python admin.py apagar <email>    # pedido de exclusão (LGPD): apaga e-mail e escala salva; pede para digitar APAGAR
python admin.py meta <pedido>     # manda à Meta a compra de um pedido aprovado que não chegou lá (até 7 dias)
```
Use para cortesia, para teste, para estorno feito fora do botão (o direito de arrependimento de 7 dias do CDC vale para compra pela internet; o `revogar` não devolve o dinheiro: estorne no painel do Mercado Pago) ou para quem perdeu o acesso ao e-mail. O `apagar` cumpre o que a Política de Privacidade promete: ficam só os pedidos (lei fiscal) e o registro de acesso (Marco Civil, 6 meses); a linha da conta fica sem e-mail, e o mesmo e-mail pode criar uma conta nova. Em produção, rode dentro do container: `docker exec -it <container> python admin.py …`. Quem perdeu o acesso ao e-mail: confira que é a pessoa, troque o e-mail da conta no banco e rode `sair`.

---

## 12. Colocar no ar (servidor do DanfeZap, Docker Swarm)

**O repositório é PÚBLICO** (decisão de 26/10): nenhuma chave, senha ou dado de cliente entra nele. O `.gitignore` tira `.env`, banco, `.venv`, logs e planilhas (as da RH têm nomes reais). As chaves de produção ficam **só nas variáveis da stack no Portainer**; o `escala-stack.yml` do repositório é um modelo com `<...>`. Antes de cada commit, confira com `git diff --cached` que não entrou chave.

Endereço: **https://escalacerta.carvalhoia.com** (domínio próprio só se vender). Comandos em uma linha (MobaXterm), como root no servidor.

1. **DNS:** no Cloudflare, um registro `escalacerta` em `carvalhoia.com` igual ao do `danfezap.carvalhoia.com` (mesmo IP e o mesmo modo de proxy).
2. **Banco e usuário** no Postgres do servidor (troque `<senha_do_banco>` pela mesma senha do `DATABASE_URL` da stack):
   ```bash
   docker exec $(docker ps -q -f name=postgres_postgres | head -1) psql -U postgres -c "CREATE ROLE escala_app LOGIN PASSWORD '<senha_do_banco>'" -c "CREATE DATABASE escala_certa OWNER escala_app" -c "REVOKE CONNECT ON DATABASE escala_certa FROM PUBLIC"
   ```
   As tabelas o próprio app cria ao subir.
3. **Código e imagem** (construída no servidor, como a do DanfeZap):
   ```bash
   cd /tmp && git clone https://github.com/ggabrielmilho-web/escalacerta.git && cd escalacerta && docker build -t ghcr.io/ggabrielmilho-web/escala-certa:latest .
   ```
4. **Stack no Portainer** com o nome `escalacerta`: o conteúdo do `escala-stack.yml` com os `<...>` preenchidos (`SECRET_KEY` = `python -c "import secrets; print(secrets.token_hex(32))"`). Rede `carvalhonet` (a do Traefik e do Postgres), uma réplica, sem volume.
5. **Conferir:** `curl -s https://escalacerta.carvalhoia.com/api/saude` deve responder `{"ok":true}`; os logs: `docker service logs escalacerta_escalacerta --tail 50`.
6. **Primeira conta com acesso:** `docker exec -it $(docker ps -q -f name=escalacerta_escalacerta | head -1) python admin.py liberar <seu_email>` (você entra pelo código no e-mail).
7. **Atualizações seguintes:**
   ```bash
   cd /tmp/escalacerta && git pull && docker build -t ghcr.io/ggabrielmilho-web/escala-certa:latest . && docker service update --force --image ghcr.io/ggabrielmilho-web/escala-certa:latest escalacerta_escalacerta
   ```
   Se o `carvalhoia.com` estiver com proxy do Cloudflare, purgue o cache depois de mexer em `gerador/` (o Cloudflare guarda JS e imagens por horas).
8. **Backup:** nada a configurar. O backup diário para o Google Drive faz `pg_dump` de todo banco do Postgres, e o `escala_certa` entra sozinho. Confira na primeira noite que ele aparece em `bancos/`.
9. Teste de ponta a ponta em produção:
   - comprar com Pix e com cartão;
   - conferir a volta automática e o aviso do Mercado Pago;
   - testar o código para entrar e o recibo com e-mail de verdade.

---

## 13. Marca (`marca/`)

- **Em uso: opção A, "Semana 5+2".** Cinco barras são os dias de trabalho, e o quadradinho com ✓ são as duas folgas certinhas. Ela também lembra uma contagem de pessoas, o que combina com o gancho "quantas pessoas".
- **Opção B, "a grade que forma o certo":** fica disponível.
- `apresentacao.html` mostra as duas em fundo claro e escuro, em vários tamanhos e aplicadas.
- **A palavra** usa Bricolage Grotesque ExtraBold (licença OFL), desenhada como contorno, então não depende de fonte instalada. "Certa" vai em `#0e5f52`.
- **Para refazer a logo:**
  1. Baixe a fonte em `https://github.com/google/fonts/raw/main/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf` e salve como `marca/fonte/bricolage.ttf`. A pasta `fonte/` fica fora do repositório.
  2. Rode `pip install fonttools uharfbuzz`.
  3. Rode `python gera_logo.py`.

  Os PNGs foram exportados pelo navegador a partir dos SVGs.
- No site: `gerador/img/` (`logo.svg`, `logo-fundo-escuro.svg`, `icone.svg`, `favicon-32.png`, `icone-512.png`).

---

## 14. Decisões de produto (e por quê)

- **A ferramenta é a própria página de entrada:** quem clica no anúncio cai direto na pergunta. Nada aparece antes do clique (só o "Como funciona"), e o preço só aparece depois de mostrar valor.
- **O produto é a escala que se repete**, e não um período: o cliente informa só "começa em", e o calendário cobre 12 meses.
- **A prévia grátis mostra só a primeira semana**, com os controles de mês e formato funcionando e o resto borrado, para provar que funciona sem entregar o produto.
- **Só 5x2 com revezamento.** 12x36 e plantões têm outra regra; ficam para depois, se vender.
- **Turnos fixos, sem horário** (29/10/2026, decisão do usuário, a pedido de um líder de loja de varejo com 3 turnos: manhã, intermediário e noite): o líder escolhe de 2 a 5 turnos, o app diz quantos contratar **por turno** e o total, e a escala sai por turno. É o mesmo motor, um turno de cada vez. Horários de entrada e saída ficaram de fora para manter simples.
- **Folgas emendadas ou separadas é uma escolha só, na escala** (29/10/2026, decisão do usuário): uma RH pediu folgas separadas; a maioria prefere emendadas. Evitar 3 folgas seguidas e "folga, 1 dia, folga" não é escolha: vale sempre.
- **"Sua empresa se enquadra no art. 386?"** em vez de "tem mulher?": o dono sabe se está enquadrado. Com Sim, a regra vale só para as mulheres. **Vem marcado "Não"** (26/10, decisão do usuário): era obrigatório responder e travava o primeiro resultado do tráfego frio; quem se enquadra muda.
- **O mínimo começa com a operação de hoje no 6x1.** Testamos três pontos de partida com 50 pessoas: "equipe inteira" exagera (faltam 25), "72% da equipe" esconde o problema (faltam 0), e "operação de hoje" responde a pergunta real (faltam 10).
- **Conta sem senha** (29/10/2026, decisão do usuário, trocando a conta com senha): compra só com o e-mail, entrar por código no e-mail pelo **Resend da CarvalhoIA**, sem WhatsApp e sem comprar domínio para isso. O código não é pedido antes de pagar.
- **Mercado Pago Checkout Pro, com Pix e cartão**, numa aplicação separada na conta do DanfeZap.
- **Folga a mais é aviso, não bloqueio:** pode ser férias ou atestado.
- **Acesso ilimitado, não 90 dias** (26/10, decisão do usuário): quem paga uma vez usa para sempre e monta de novo quantas vezes quiser. Na página, onde dizia "por 90 dias", agora aparece o selo **acesso ilimitado** ao lado do preço.
- **O Excel abre no Calendário**, uma linha por dia, que é o formato que as pessoas reconhecem. Logo depois vêm os **quadros por mês**, porque o art. 67 da CLT pede a escala de revezamento "mensalmente organizada e constando de quadro sujeito à fiscalização"; uma tabela de 365 colunas não é isso. Os quadros só leem o Calendário, para a edição e a conferência ficarem num lugar só.
- **Celular primeiro** (26/10, o tráfego pago vem do celular; testado de ponta a ponta num celular emulado): botão "Descobrir" **fixo no rodapé** enquanto o formulário está na tela (o de verdade fica quase 2 telas abaixo); quem já pagou e volta **cai direto na escala**, aberta **no mês de hoje**; tabela mais larga que a tela mostra **um círculo com seta** na borda direita (a prévia "uma linha por pessoa" escondia o domingo); a troca de folga mostra o problema **junto do calendário**; campos com letra de 16 px (no iPhone, menos que isso dá zoom ao tocar).
- **Para o WhatsApp, imagem e não texto:** a equipe olha a escala no celular, e uma grade do mês se lê de relance; o texto fica como alternativa. A imagem usa só a fonte de títulos porque o zero da fonte do texto sai cortado no canvas.

---

## 15. Limitações conhecidas e próximos passos

**Limitações:**
- A conta é feita em **pessoas por dia** (por turno, com turnos), não em horas. Também não inclui férias e atestados; a tela avisa.
- Turno pequeno sai caro: com 1 pessoa por turno, cada turno precisa de 2, e a segunda fica com dias sobrando. Um folguista que cobre vários turnos economizaria, mas o app não monta isso.
- Antes de 16/12/2026 a lei ainda permite 6x1, mas o app sempre monta 5x2.
- Os feriados são só os nacionais.
- A escala completa é gerada **no navegador**: quem souber mexer consegue extraí-la sem pagar. É aceitável no ticket baixo; se incomodar, a geração passa para o servidor.
- `POST /api/conta` diz "já existe conta com esse e-mail" (revela quem tem conta) e não tem limite de cadastros por IP.
- O pior caso de cálculo leva cerca de 2 s no clique. Se crescer, mover o cálculo para um Web Worker.
- As trocas feitas à mão somem ao "Atualizar escala" (a tela pergunta antes) e só podem ser desfeitas na sessão; depois de recarregar, sobra o "voltar à escala original".

**Próximos passos:**
1. Deploy em `escalacerta.carvalhoia.com` (seção 12).
2. Aviso de cookies do GA4 e do Pixel (orientação da ANPD), quando o volume crescer.
3. Teste de compra real (Pix e cartão) e do e-mail de recuperação (o 403 do Resend foi corrigido em 28/10: agente `Python-urllib` barrado pelo Cloudflare).
4. Pixel, GA4 e API de Conversões da Meta (seção 10.1). Conferir o `Purchase` do servidor no Gerenciador de Eventos na próxima venda.
5. Ideias anotadas: marcar **férias/afastamento** como algo diferente de folga; folguista entre turnos; horário dos turnos; 12x36.
