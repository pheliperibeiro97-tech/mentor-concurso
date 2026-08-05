# Notas de uso real — montagem do edital do 192º TJSP (2026-08-03)

Observações colhidas **usando o app desktop v0.7.1** (WebView2 pilotado por CDP) para
zerar os dados e cadastrar o conteúdo programático do 192º Concurso de Provas e Títulos
para Ingresso na Magistratura do Estado de São Paulo.

> **Estado deste documento (2026-08-04):** levantamento fechado e os itens **✅ ACEITO** já
> foram **IMPLEMENTADOS e testados no navegador** (`npm run dev`). Ver o resumo em
> "§5. O que foi implementado" no fim do arquivo. O plano está em
> `~/.claude/plans/encapsulated-wiggling-narwhal.md`; o que não está marcado segue como
> backlog aberto.
>
> ✅ **PUBLICADO como v0.8.0** em 2026-08-04 — release no GitHub (instalador NSIS +
> `latest.json` assinado, updater conferido devolvendo 0.8.0) e Cloudflare Pages no ar
> (cofre respondendo 404 em id inexistente, bundle com a versão nova).
>
> ⚠️ **Antes de voltar a sincronizar, atualizar os TRÊS aparelhos.** O envelope do cofre
> agora é gravado em `v: 2` e a versão antiga não o lê. Navegador e celular se resolvem
> sozinhos na mesma URL; o desktop, pelo updater.

---

## 0. 🐞 BUG — o hovercard do tópico fica grudado na tela para sempre  ✅ ACEITO

**Reproduzido de forma isolada.** No Edital, o cartão de resumo do tópico
(`div.ed-hovercard`, filho direto do `<body>`, `position: fixed`, `z-index: 900`) **nunca
mais é fechado depois que se clica no tópico**.

Sequência medida (estado do elemento a cada passo):

| Passo | Estado do `.ed-hovercard` |
|---|---|
| 0. antes de tudo | ausente |
| 1. mouse sobre o tópico | `ed-hovercard on` · opacidade **1** ✅ |
| 2. mouse sai de cima | `ed-hovercard` · opacidade **0** ✅ |
| 3. **clique no tópico** (navega para o dossiê do tópico) | `ed-hovercard on` · opacidade **1** |
| 4. mouse bem longe | `on`, opacidade 1 — **não fecha** |
| 5. troca para a tela Hoje | `on`, opacidade 1 — **não fecha** |
| 6. tecla Esc | `on`, opacidade 1 — **não fecha** |
| 7. clique em qualquer outro lugar | `on`, opacidade 1 — **não fecha** |

Só some recarregando o app.

**Causa provável:** o clique troca de rota e o `#content` é reescrito. A linha do tópico que
servia de âncora sai do DOM, então o `mouseleave`/`mouseout` que tiraria a classe `on`
nunca dispara. Como o hovercard mora **fora** do `#content`, o re-render não o alcança —
ele fica órfão, ligado e por cima de todas as telas seguintes.

**Efeito colateral visível:** quando a âncora some, o posicionamento perde a referência e o
cartão às vezes gruda no canto superior esquerdo (medido em `8,8`), tapando o menu; outras
vezes fica na última posição do mouse (medido em `374,391`).

**Caminhos de correção (a decidir):**
- Fechar o hovercard no próprio handler de clique, antes de navegar.
- Ou fechá-lo no render global (`store.subscribe`) — ele vive fora do `#content`, então
  precisa ser limpo explicitamente; hoje nada o limpa.
- Rede de segurança: `Escape` e `pointerdown` fora deveriam fechá-lo, e vale checar
  `ancora.isConnected` antes de reposicionar (se a âncora saiu do DOM, fecha).
- Vale conferir se o `div.tip-portal` (que também mora solto no `body`) sofre do mesmo.

---

## 0b. 🐞 BUG — o nome do concurso vive em dois campos que não conversam  ✅ ACEITO

A topbar mostrava **"Juiz Substituto · TJSP (192º Concurso)"** e o seletor de concursos,
logo ao lado, mostrava **"Meu concurso"**. São dois campos distintos:

- `perfil.concurso.cargo` — preenchido pelo onboarding ("Qual concurso você vai prestar?")
  e exibido na topbar;
- `perfil.nome` — usado no seletor e no menu "Renomear este", que nasce com o padrão
  **"Meu concurso"** e **não recebe** o que foi digitado no onboarding.

Quem passa pelo onboarding acaba com os dois nomes diferentes sem ter feito nada errado, e
não há pista de que existem dois campos. Corrigido à mão aqui: renomeado nos dois lugares
para "Magistratura Estadual TJSP".

**Ideia:** o onboarding deveria semear `perfil.nome` com o mesmo texto do cargo; e renomear
em um lugar deveria oferecer atualizar o outro (ou o seletor deveria exibir o cargo quando
o perfil ainda estiver com o nome padrão).

---

## 1. Separador do "Adicionar ao edital" (`screens/edital.js`, ação `separar`)  ✅ ACEITO

A ajuda embutida ("Como o app separa") diz:

> Uma disciplina por linha (em MAIÚSCULAS ou terminada em ":") e os tópicos nas linhas
> seguintes ou **separados por ";"**.

O comportamento real é mais agressivo do que a ajuda descreve. Testado com sonda:

| Entrada | Saída | Comentário |
|---|---|---|
| `1. Alfa. Beta gama` | `Alfa` + `Beta gama` | corta em `". "` — **não documentado** |
| `2) Delta. Epsilon` | `Delta` + `Epsilon` | numeração `N)` também é removida |
| `3 - Zeta. Eta` | `Zeta` + `Eta` | numeração `N -` também é removida |
| `Theta (arts. 1º a 12). Iota` | `Theta (arts. 1º a 12)` + `Iota` | ✅ respeita abreviação e parênteses |
| `Nu; Xi` | `Nu; Xi` | **não** cortou aqui… |
| `…1974; LC 64, de 18 de maio…` | cortou em dois | …mas cortou aqui, **dentro de parênteses** |
| `(39) Alfa` / `[39] Alfa` / `39º Alfa` / `Item 39 · Alfa` | preservados | formas de numeração que sobrevivem |
| `39. Alfa` / `39) Alfa` / `39 - Alfa` / `39.0) Alfa` / `9.2.I) Alfa` | numeração comida | |
| `II.1.a) Omicron` | preservado | prefixo que começa por letra escapa |

**Efeito prático:** colar o Anexo I do edital (401 itens numerados) produziu **1.612
tópicos** — cada frase do item virou um tópico solto (`Ausência`, `Validade`, `Eficácia`,
`Disposições gerais` repetido em várias disciplinas), e a numeração oficial do edital se
perdeu. Para um concurso de magistratura isso importa: os itens numerados são os
**pontos** sorteados na prova oral (art. 65 da Res. CNJ 75/2009, citado no próprio edital).

Para obter 1 tópico por item do edital foi preciso pré-processar o texto fora do app:
trocar o ponto final de frase por `·`, trocar `;` por `·`/`,` e envolver a numeração em
parênteses — `(39) Propriedade · Função social · …`.

### Ideias (não implementadas)
- **Opção de granularidade no próprio preview**: um par de botões "por item" × "por frase"
  (ou um controle "quebrar frases: sim/não"), já que o preview é revisável antes de aplicar.
- **Preservar a numeração de origem** num campo próprio do tópico (ex.: `ordemEdital`),
  em vez de descartá-la. Serviria para ordenar, para citar o ponto e para o sorteio da oral.
- **Alinhar a ajuda ao comportamento**: hoje ela não menciona a quebra por `". "`, que é a
  regra que mais afeta o resultado; e menciona `";"` de um jeito que não corresponde ao
  observado (não cortou `Nu; Xi`, cortou dentro de parênteses).
- **Não cortar dentro de parênteses** também para `;` — a regra de abreviação/parênteses
  já existe e funciona bem para `.`; o `;` não recebeu o mesmo cuidado.
- **Hierarquia**: o edital tem 3 níveis (`II` → `1 Parte Geral` → `a) Da aplicação da lei
  penal`). Hoje tudo é achatado em tópico. Subtópico resolveria os dois mundos (item como
  tópico, frase como subtópico) sem escolher um dos dois.

---

## 2. Reset ("Apagar tudo e recomeçar", Configurações › Dados)  ✅ ACEITO

- Apaga também a **configuração da IA** (provedor, chave e chave-reserva). Depois do
  reset o passo 3 do onboarding mostra "Status: Offline". Como a chave é digitada uma
  vez e esquecida, quem apaga os dados de estudo provavelmente não espera perder a
  credencial junto. **Ideia:** perguntar ("manter a conexão com a IA?") ou preservar
  `iaKey`/`iaProvider` por padrão, já que não são "dados de estudo".
- O aviso da zona de risco enumera "concurso, tópicos, questões, flashcards e materiais" —
  não avisa que a chave da IA e as preferências de sincronização vão junto.
- Com a sincronização **conectada**, o reset zera o aparelho e o estado zerado tende a
  subir para o cofre. Não há aviso disso na confirmação. **Ideia:** quando `syncNuvem`
  estiver ativo, dizer na confirmação que os outros aparelhos também serão afetados.

---

## 2b. O que mais o reset levou junto

Além da chave da IA (acima), o reset devolveu o **tema para "claro"**. O usuário estava no
escuro; foi preciso reconfigurar em Configurações › Aparência. Tema é preferência de
interface, não dado de estudo — vale a mesma ideia de preservar.

---

## 3. Onboarding

- O passo 4 ("Montar plano") oferece **"Importar edital (PDF)"**, mas clicar leva direto
  para a tela Edital vazia, sem abrir o seletor de arquivo nem a janela "Adicionar ao
  edital". Fica um passo extra e silencioso — o usuário que escolheu "importar PDF"
  aterrissa numa tela que diz "Monte seu edital" e precisa achar o botão sozinho.
- O campo "Qual concurso você vai prestar?" usa como exemplo `Escrevente Técnico
  Judiciário · TJSP`; o mesmo campo alimenta o nome do perfil no seletor de concursos.

---

## 3b. Materiais

- ✅ **ACEITO — Janelas empilháveis:** clicar "Adicionar material" com a janela já aberta cria um
  segundo `.mm-overlay`. O antigo fica invisível mas continua interceptando cliques, e o
  botão "Salvar na base" do formulário visível não recebe o clique. Sugestão: fechar/
  reaproveitar a janela existente em vez de empilhar.
- **Confirmação de direitos autorais:** o aviso "Importe apenas material que você tem
  direito de usar" usa `.modal-overlay` (classe diferente do `.mm-overlay` das outras
  janelas). Nada de errado, mas convém unificar — de fora parecem dois sistemas de modal.
- **Autovínculo do PDF ao edital gerou falso positivo:** ao importar o próprio edital
  (79 páginas), o app o classificou como *Direito Processual Civil · (17) Recursos em
  espécie… págs. 77–79*. O casamento por palavra-chave pegou as ocorrências de "apelação",
  "agravo" e "embargos" nas páginas de anexos. Sugestão: exigir densidade mínima ou
  ignorar trechos que são só listas de leis/anexos; ou, ao menos, marcar o vínculo como
  "sugerido" até a confirmação do usuário.
- **"Vincular ao edital"** com 401 tópicos vira uma lista muito longa de caixas, sem busca
  nem filtro por disciplina. Com o edital inteiro cadastrado, achar um tópico ali é penoso.

---

## 3c. Checklist da banca ("Comparar com o edital oficial") — funcionou muito bem

Alimentando o checklist com o mesmo texto usado na importação, deu **100% de cobertura,
401 cobertos, 0 lacunas, 0 extras**. É um jeito rápido e confiável de conferir uma
importação grande. Nenhuma ressalva.

---

## 3d. Plano do cursinho ("Trazer a divisão do cursinho")

Lançadas 33 aulas do curso "Direito Ambiental — Magistratura Estadual". Funcionou, mas
com atritos:

- **A ajuda descreve `";"` como separador de assuntos, mas o `"·"` também separa.** Colar
  o nome completo de um tópico como assunto (que aqui usa `·`) explodiu **um** assunto em
  **catorze**. Quem tenta casar aula↔tópico colando o nome do tópico cai direto nessa.
- **O nome da aula recebe os assuntos colados no fim**: "Aula 01 - Apresentação do Curso -
  Apresentação do curso". Fica redundante e alonga a lista. Talvez o nome devesse ficar só
  com o que veio antes do `":"`.
- ~~**A disciplina da aula é inferida só pelos tópicos vinculados.**~~ **Erro meu, não do
  app.** O importador aceita um cabeçalho `DISCIPLINA: Nome` (`edital.js`, usado em
  `store.js: importarAulasCursinho`), que é exatamente a saída para quando nenhum assunto
  casa com tópico. As 8 aulas que foram para "Sem disciplina" foram culpa de eu ter posto a
  disciplina no *nome* da aula em vez de usar o cabeçalho. **Resolvido na v0.8.1:** ao ler a
  apostila, a disciplina vem do nome do arquivo (`10. Direito Ambiental.pdf`) e aparece num
  campo editável no topo do preview, valendo para o lote inteiro.
- **Casamento por nome é literal demais.** "Política Nacional de Segurança de Barragens",
  "Mineração e Meio Ambiente", "Energia e Meio Ambiente", "Mudanças Climáticas" não
  casaram — mas nesses casos o certo *é* não casar, porque não estão no Anexo I do 192º.
  Já "Política Nacional de Resíduos Sólidos" casou com o tópico (12) *Instrumentos
  processuais da tutela ambiental*, que é um falso positivo.
- O botão **"casar com IA"** por aula e o **"Compatibilizar com IA"** global existem para
  isso; valeria deixar mais claro no preview que dá para resolver as lacunas ali, antes de
  montar o plano.

### Rodada grande: 354 aulas de 17 disciplinas (o cursinho "Direto ao Ponto")

- **O casamento por nome praticamente não funciona nessa escala:** das 354 aulas, **224
  ficaram sem vínculo** (63%). É esperado — título de capítulo de cursinho ("Da Jurisdição",
  "Considerações Iniciais") raramente é igual ao nome de um tópico do edital. Na prática,
  **"Compatibilizar com IA" não é opcional**, é a etapa que faz o recurso funcionar; talvez
  devesse ser oferecido logo depois de montar o plano, e não como um botão a mais na barra.
- **O "Compatibilizar com IA" é excelente:** 1ª passada resolveu 207/220 assuntos (224 → 19
  aulas órfãs) em ~30 s; a 2ª levou a 10. As 10 que sobraram são abertura e encerramento de
  curso ("Considerações Iniciais", "Apresentação", "Considerações Finais") — que **devem**
  mesmo ficar sem tópico. Ou seja: convergiu no lugar certo.
- **Não há barra de progresso**: durante os ~30 s de processamento a tela fica parada, sem
  indicação de que algo está rodando; só aparece o aviso final "Compatibilizado: 207/220".
  Com 354 aulas dá para achar que travou.
- **Uma passada não basta** e nada diz isso. Depois da primeira, o botão continua igual;
  foi por tentativa que se descobriu que rodar de novo melhora (19 → 10). Valeria repetir
  automaticamente até estabilizar, ou informar "sobraram N; rodar de novo?".

---

## 3e. Sincronização — reconexão depois do reset (funcionou)

Reconectado com a mesma senha, com o cofre ainda guardando o estado **antigo** (de antes do
"apagar tudo") e o desktop com o estado **novo**. Resultado: o estado novo prevaleceu, nada
antigo voltou, e a sincronização seguinte reportou `ultimoResultado: "igual"` (cofre ==
local). Contagens intactas antes e depois: 14 disciplinas · 401 tópicos · 33 aulas ·
2 materiais.

Duas coisas a melhorar mesmo assim:

- **O reset desconecta em vez de propagar.** Quem apaga tudo com a sincronização ligada
  espera que o "zero" chegue aos outros aparelhos; o que acontece é o aparelho sair da
  sincronização e o cofre ficar intacto com os dados velhos. Nenhuma tela diz isso. É
  preciso reconectar de propósito para o estado novo subir — e, nesse intervalo, um segundo
  aparelho que sincronize primeiro sobrescreve o cofre com o estado antigo.
- **Não há como conferir o cofre de fora.** `GET /v1/cofre/<config.syncNuvem.cofre>`
  devolve `400 {"erro":"id inválido"}` — o id guardado no estado (8 caracteres) não é o id
  que o endpoint aceita. Para depurar sincronização é útil ter um jeito de perguntar ao
  cofre "qual é o carimbo de tempo do que está aí?" sem precisar decifrar nada.

---

## 3f. ⛔ Teto de armazenamento — a biblioteca de materiais não cabe no modelo atual

Medido, não estimado. **O estado inteiro do app é UMA string JSON** numa única linha do
SQLite (`kv.state`), reescrita a cada gravação e enviada inteira ao cofre.

Custo real de um material, medido no edital do 192º (79 páginas, PDF de 681 KB):

| Campo | Peso | Por página |
|---|---|---|
| `pdfData` (base64 do PDF) | 887 KB | 11 KB |
| `paginas` | 161 KB | 2 KB |
| `texto` | 157 KB | 2 KB |
| **total** | **1,18 MB** | **~15 KB** (≈ 4 KB sem o PDF) |

O estado hoje tem **1,52 MB** — e 1,18 MB disso é esse único PDF.

**O que sobe e o que não sobe** (`montarSnapshotSync`, `sync.js:108-119`): o snapshot zera
`pdfData` e `imgData` de cada documento, em todos os perfis — **o binário do PDF nunca sai
da máquina**. Mas `texto` e `paginas` **vão junto**. Ou seja:

| | por página | fica local | sobe ao cofre |
|---|---|---|---|
| `pdfData` | 11 KB | ✅ | ❌ |
| `texto` + `paginas` | 4 KB | ✅ | ✅ |

Projeção para as 17 disciplinas do cursinho (**9.026 páginas**):

- **local**: ~135 MB com os PDFs, ~36 MB se descartá-los
- **cofre**: **~36 MB sempre** — descartar o PDF não muda nada aqui

**É o texto que estoura o teto.** `functions/v1/cofre/[id].js:12` define
`LIMITE_BYTES = 24 * 1024 * 1024` e devolve **413** com a mensagem *"cofre grande demais
para o KV; migre para R2"*. O corpo é base64 do texto cifrado (`btoa` em
`sync-nuvem.js:55`), que infla ~33% — o teto prático em texto puro fica perto de **18 MB**,
cerca de **4.500 páginas**. Metade da biblioteca, e sem folga nenhuma.

Antes disso já dói: com 18 MB de estado, **toda** gravação faz `JSON.stringify` de 18 MB na
thread da interface, e toda sincronização cifra e sobe os 18 MB inteiros, mesmo que só um
flashcard tenha mudado.

**O gargalo não é a quantidade de materiais nem o peso dos PDFs — é o TEXTO deles morar
dentro do estado sincronizado.** Dividir o PDF por aula não tira um byte; descartar o PDF
alivia só o disco local. Enquanto o texto for parte do snapshot, a biblioteca de um
cursinho inteiro não entra.

⚠️ Os 4 KB/página vêm de **uma** amostra (o edital, texto denso e limpo). Material de
cursinho tem tabelas, imagens e "smart arts" — a densidade pode ser bem diferente para mais
ou para menos. Calibrar com um piloto de uma disciplina antes de projetar o resto.

### 3f.0 — 🔴 O maior peso do snapshot é o índice semântico, e ele sobe inteiro

`montarSnapshotSync` zera só `pdfData` e `imgData`. **`state.embeddings` vai inteiro para o
cofre.** Cada item do índice (`store.js:2339`) guarda:

```js
{ id, fonteId, tipo, titulo, pagina, texto: <o trecho>, vetor: <768 floats> }
```

**MEDIDO** (índice real construído no app, `gemini-embedding-001`, 768 dimensões):

| | peso real | (minha estimativa anterior) |
|---|---|---|
| item completo | **6,4 KB** | ~~10,4 KB~~ |
| só o `vetor` | **5,5 KB** | ~~9,3 KB~~ |
| só o `texto` do chunk | 0,4 KB | 1,0 KB |
| gzip do índice | 3,4x | 2,7x |

A estimativa estava **1,6x inflada**: o Gemini devolve valores curtos (`-0.0016`, `0.023`),
não floats de 18 casas como eu simulei.

Projeção corrigida para as 9.026 páginas (~2,5 chunks/página, porque `chunksDaFonte`
fatia **página a página**, não o texto corrido): ~22.500 chunks ≈ **144 MB**, ou ~42 MB
comprimido. Continua muito acima do teto de 24 MB — a conclusão não muda, o número sim.

### 🔴 Mas o bloqueio real é outro: a cota da API não deixa nem construir o índice

Tentando indexar **um único PDF de 79 páginas** com a chave gratuita do Gemini:

```
HTTP 429 — "You exceeded your current quota"
generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embed
```

O material pequeno (5.898 caracteres, 9 chunks) indexou. O edital **não passou**. Ou seja:
na cota gratuita, a busca semântica não escala nem para um documento médio, muito menos
para os 9.026 páginas do cursinho. Discutir o peso do índice no cofre é, hoje, um problema
teórico — o índice não chega a existir.

**Dois defeitos de UX apareceram no caminho:**
- **1ª tentativa: falha silenciosa.** Rodou ~7 minutos, mostrou "Atualizando índice… 1/2" e
  parou sem toast, sem erro, sem mudar o status. O botão continuou "Atualizar índice (1)"
  sem explicar por quê.
- **2ª tentativa: mensagem que esconde a causa.** "Não consegui atualizar o índice agora.
  Tente de novo em instantes." — mas era **cota estourada**, que não resolve "em instantes".
  O 429 é distinguível dos demais erros; valeria dizer "a cota da IA acabou" e sugerir
  quando voltar, ou indexar menos por vez.

Pior: com o índice ligado, **o mesmo conteúdo fica três vezes no estado** —
`documento.paginas[].texto`, `documento.texto` e `embeddings.itens[].texto`.

**O índice é cache derivável e específico do aparelho** (regenerável com uma chamada de API
a partir da fonte). O próprio app já o descarta no backup compartilhável
(`limparMaterialDaFatia`, `store.js:852`) — a intenção de projeto de que ele não é "dado do
usuário" já existe; falta aplicá-la ao snapshot de sincronização.

*Consequência de não sincronizar:* cada aparelho reindexa uma vez (custo de cota do Gemini e
tempo). Já é assim que funciona hoje na primeira ativação, e a indexação é incremental
(`idx.fontes[f.id] !== f.sig`), então só reprocessa o que mudou. *Se um dia for preciso
sincronizar o índice*, quantizar para int8 + base64 derruba o vetor de **5,5 KB para ~1 KB
(5,5x)** com perda de recall desprezível — bem melhor que gzip (3,4x) para esse tipo de dado.

### 3f.1 — Metade do que sobe é conteúdo duplicado

`documento.texto` e `documento.paginas` guardam **o mesmo conteúdo**. Medido no edital:
`texto` = 158.098 caracteres; as `paginas` concatenadas = 158.020 caracteres, e o texto
bate caractere a caractere. São 318 KB no estado onde 159 KB dariam conta.

**Por que os dois existem** (checado no código, não suposto):

- **`paginas` não é "o texto fatiado".** Cada página é `{n, texto, vazia, temImagem, ocr}` e
  esse estado por página sustenta coisas que não têm substituto: as páginas com OCR
  pendente (`paginasPendentes`), o "Reprocessar página (Visão)", a descrição de figuras
  (`p.temImagem`, `store.js:2071`), o vínculo tópico ↔ faixa de páginas
  (`vincularTopicosComPaginas`), o recorte de contexto por faixa (`ctxDeDoc`,
  `documentos.js:275`), a detecção de sumário (`estrutura.js`) e a citação "pág. N" nas
  respostas da IA. **Não dá para eliminar.**
- **`texto` é cache derivado, e o código já assume isso.** `recomputarTextoDoc`
  (`store.js:137-141`) faz literalmente `paginas.map(p => p.texto).join("\n\n")`, e é
  chamado em todo ponto que mexe nas páginas (`store.js:2060, 2097, 2219, 2231, 2742`).
  Ele existe por dois motivos legítimos: (a) material colado ou de imagem **não tem**
  `paginas`, e aí `texto` é o campo primário; (b) vários consumidores querem uma string
  única — busca por palavra (`ia.js:331`), grifo/marcação (`documentos.js:499`), contexto do
  chat (`chat-acoes.js:54`) e o fallback do `ctxDeDoc` (`documentos.js:279`).

**Dá para não persistir `texto` quando houver `paginas`**, derivando na leitura com um
helper. Corta 50% do custo de sincronização de todo material em PDF.

*Consequência real a tratar:* o join de um material de 1.289 páginas monta uma string de
~5 MB **a cada chamada**. Precisa de memoização em memória (não persistida), invalidada por
`doc.id` + assinatura das páginas. É trocar espaço por CPU — com o cache, a troca compensa.

**Sobre o risco dos grifos — eu errei na primeira análise e corrijo aqui.** Cheguei a
afirmar que derivar `texto` ameaçava os grifos, porque `addMarca` grava `{inicio, fim}` como
deslocamento absoluto (`marcacao.js:240-247`). Fui verificar em `documentos.js:494-501` e o
quadro é outro: material com **mais de uma página** ancora a marcação na **página**
(`alvoId: "<id>#<n>"`, `texto: pg.texto`); `d.texto` só é âncora quando **não há páginas** —
exatamente o caso em que `texto` continua sendo o campo primário e não será derivado.

Ou seja: **derivar é seguro por si só**. Isso muda a justificativa de tirar o grifo de
Materiais (§3f.7), que deixa de ser pré-requisito técnico e passa a ser decisão de produto.

Ainda assim, a migração deve **comparar antes de descartar**: só apagar `texto` quando for
idêntico ao join, mantendo o campo se houver qualquer diferença. Isso cobre material gravado
por versões anteriores. Conferido que hoje eles batem: o import limpa cabeçalho/rodapé
**antes** de gravar as páginas (`limparRuidoDePaginas`, `documentos.js:1266`) e as descrições
de figura são anexadas **à página de origem** justamente para sobreviver ao
`recomputarTextoDoc` (`store.js:2089`).

### 3f.2 — O snapshot não é comprimido, e comprime muito bem

O envelope vai como base64 do AES-GCM cru (`sync-nuvem.js:86-95`), sem nenhuma compressão.
Texto jurídico é altamente redundante: gzip nos 318 KB do edital devolve **96 KB (3,3x)**.

Somando as duas coisas, o custo por página no cofre cai de **4 KB** para **~0,6 KB** — e a
projeção das 9.026 páginas do cursinho sai de **36 MB (estoura)** para **~5,5 MB (cabe com
folga)**.

`CompressionStream("gzip")` é nativo no Chromium/WebView2 e nos Workers, então dá para
comprimir antes de cifrar e descomprimir depois de decifrar. O envelope já tem campo de
versão (`v`), que serve para os aparelhos antigos não engasgarem com o formato novo.

### 3f.3 — Ordem sugerida para resolver a quota

Tudo abaixo **preserva a sincronização completa** do que é dado do usuário. O que sai do
snapshot é só o que é binário, cache ou derivável.

Ordem **revisada depois da medição** — o índice deixou de ser a prioridade nº 1, porque a
cota da API impede que ele cresça:

Medido no snapshot real de hoje: **725 KB cru → 180 KB com gzip (4,0x)**.

| # | Mudança | Ganho no cofre | Custo / risco |
|---|---|---|---|
| 1 | ✅ **ACEITO** — **Comprimir o snapshot** antes de cifrar (`CompressionStream("gzip")`) | **−4,0x em tudo** | Versionar o envelope; atualizar os aparelhos antes |
| 2 | ✅ **ACEITO** — **Não persistir `texto` quando há `paginas`** (derivar na leitura) | −50% do material | Memoizar o join; migração comparando antes de descartar |
| 3 | ✅ **ACEITO** — **Não sincronizar `embeddings`** (mesmo tratamento do `pdfData`) | tira do cofre um cache derivável | Aparelho novo mostra "busca inteligente não ativada" e reindexa se quiser |
| 3b | ✅ **ACEITO** — **Não sincronizar `editalOficial`** (§3f.8) | −105 KB hoje | É conferência, não dado de estudo |
| 3c | ✅ **ACEITO** — **Config de IA por aparelho** (§3f.5) | tira a chave de API do cofre | A chave passa a ser digitada uma vez por aparelho |
| 4 | **Mostrar a quota** em Configurações › Dados | — | Hoje só se descobre o teto no 413, com a mensagem crua do KV |
| 5 | **Tirar o conteúdo dos materiais do snapshot** (KV por documento ou R2) | snapshot pequeno e previsível | Mudança de arquitetura de sincronização |
| 6 | **Sync por delta**, em vez de reenviar o estado inteiro | — | Idem |

⚠️ **Ao tirar coisas do snapshot, `aplicarRemoto` (`sync.js:138+`) precisa do mesmo cuidado
que já toma com os binários:** o que vem do cofre agora vem vazio e **não pode apagar** o
índice, a config de IA nem o checklist do aparelho que os tem.

Com **1 + 2**, os ~36 MB de texto das 9.026 páginas caem para **~5,5 MB** — dentro do teto,
com folga. O item 3 deixa de ser urgente, mas continua certo: é cache, não dado do usuário.

**Se um dia a cota deixar de ser o limite** e o índice precisar sincronizar, quantizar os
vetores para int8 + base64 derruba de 5,5 KB para ~1 KB por item (5,5x), bem melhor que
gzip (3,4x) para esse tipo de dado.

### 3f.4 — Verificado: a busca semântica NÃO engana o usuário

Preocupação legítima: se o índice não sincroniza, o segundo aparelho faria busca por palavra
fingindo ser semântica? **Não.** Conferido:

- **Materiais:** o botão "Buscar por significado (IA)" **bloqueia** sem índice
  (`documentos.js:975` → "Ative a busca inteligente primeiro"), e a barra de status diz
  explicitamente "Busca inteligente: ainda não ativada" ou "ativa em N de M materiais"
  (`documentos.js:1096-1100`).
- **Chat:** `recuperarTrechos` é declaradamente híbrido e, sem índice, usa a busca textual —
  mas **sempre cita a origem de cada trecho** ("Material: X (pág. N)"), sem prometer
  semântica.

Não sincronizar o índice degrada a *capacidade* no segundo aparelho, mas de forma **visível
e reversível pelo próprio usuário** (um botão). É diferente de mentir sobre o método.

### 3f.5 — A configuração de IA é ÚNICA e sincroniza: não dá para ter provedor por aparelho

Cenário que o usuário quer: **Claude Code no desktop** (assinatura que ele já paga) e
**Gemini no celular e no navegador** (onde o Claude Code local não existe). Hoje isso é
impossível, e a razão é de arquitetura:

- `montarSnapshotSync` remove do snapshot apenas `config.sync` e `config.syncNuvem`
  (`sync.js:122-126`). **`iaProvider`, `iaKey` e `iaModelo` sobem** e são aplicados em todos
  os aparelhos.
- `iaDisponivel` devolve `ehTauri()` para `claude-cli` (`ia-provider.js:38`): fora do
  desktop esse provedor simplesmente **não funciona**.

Resultado prático: escolher "Claude Code local" no desktop propaga `claude-cli` para o
celular, que fica **sem IA nenhuma**; corrigir no celular propaga "gemini" de volta para o
desktop. Fica um pinga-pongue, e nada na tela explica isso.

**Agrava:** a busca semântica exige `iaProvider === "gemini"` (`ia-provider.js:2208`). Com o
Claude Code selecionado, o desktop — justamente onde os materiais grandes são importados —
**não consegue nem indexar nem buscar por significado**.

**Correção sugerida (pequena e de alto valor):** tratar `iaProvider`/`iaKey`/`iaModelo` como
**metadado local do aparelho**, exatamente como `sync` e `syncNuvem` já são — basta incluí-
los no `delete` do `montarSnapshotSync`. Efeitos colaterais, todos bons:
- cada aparelho escolhe o provedor que faz sentido nele (o cenário do usuário passa a
  funcionar);
- a **chave da API deixa de viajar no cofre**, o que é melhor em segurança;
- custo: a chave passa a ser digitada uma vez por aparelho.

### 3f.6 — Por que a cota estourou: 1 trecho = 1 requisição  ✅ ACEITO

`gerarEmbeddings` comenta que *"a API grátis não tem batch síncrono para este modelo"* e
embute **um trecho por requisição**, com concorrência 4 (`ia-provider.js:2201-2213`). O
edital de 79 páginas dá ~200 trechos, logo ~200 chamadas em rajada — o suficiente para
estourar o limite por minuto da chave gratuita e devolver 429.

Ideias: respeitar um teto de requisições por minuto (com espera), retomar de onde parou em
vez de perder o lote, e indexar em segundo plano com progresso visível.

### 3f.8 — `editalOficial` é uma QUARTA cópia do edital, e pesa 105 KB

Medido no snapshot real de hoje (725 KB): `documentos` 326 KB · `topicos` 163 KB ·
**`editalOficial` 105 KB** · `aulas` 70 KB · `embeddings` 57 KB.

Os 105 KB são o **checklist da banca**: o texto do edital oficial guardado verbatim para a
conferência de cobertura. Somando com `documento.texto`, `documento.paginas[].texto` e
`embeddings.itens[].texto`, o mesmo conteúdo chega a estar **quatro vezes** no estado.

É conferência, não dado de estudo — o resultado (100%, 0 lacunas) é o que importa, os itens
não precisam viajar entre aparelhos. Já existe `limparChecklist` (`store.js:1723`) e o botão
"Limpar checklist" na tela. **Decisão do usuário: tirar do snapshot**, mesmo tratamento dos
`embeddings`.

### 3f.7 — Grifo em material: o usuário considera dispensável  ✅ ACEITO

Decisão do usuário: marcar/grifar **material** pode sair (a tela de Materiais serve para
lançar documento, extrair texto, gerar com IA e dividir tópicos). Isso **elimina o único
risco real do item 2** — sem grifo em material, ninguém ancora por offset em `doc.texto`, e
derivar o texto passa a ser inofensivo.

Atenção ao remover: `montarMarcacao` é o mesmo módulo usado pela **Lei Seca**
(`alvoTipo: "indicacao"`), onde grifar é essencial. A remoção é só do ponto de chamada em
`documentos.js:499-500`, não do módulo.

**Outras fontes de peso que valem checar antes de crescer muito:** os **resumos
compilados** guardam `conteudoHTML` verbatim da apostila (o backup compartilhável já os
esvazia em `limparMaterialDaFatia`, mas o snapshot de sync não); e o campo `estrutura` de
cada documento, que também é derivável da detecção de sumário.

**Ideias para depois:**
- Separar o conteúdo dos materiais do estado sincronizado (o próprio código já aponta o
  caminho: R2 para o conteúdo, KV só para o índice/metadados).
- Sincronizar por delta, em vez de reenviar o estado inteiro a cada mudança.
- Enquanto isso: um aviso na tela de Materiais quando o estado passar de ~10 MB, dizendo
  quanto falta para o teto do cofre — hoje o usuário só descobre quando a sincronização
  falha com 413.

---

## 4. Miscelânea observada

- O separador aplica *title case* ao nome da disciplina: `TESTE A` → `Teste a`.
  Com nomes reais funciona bem (`DIREITO CIVIL` → `Direito Civil`,
  `NOÇÕES GERAIS DE DIREITO E FORMAÇÃO HUMANÍSTICA` → correto).
- Tópicos com ~470 caracteres (itens longos do edital, como Direito Civil item 39)
  cabem no campo, mas a tabela do Edital fica com linhas muito altas. Vale ver se o
  layout previa tópicos desse tamanho.
- Para pilotar o app desktop por fora: subir o executável com
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` e conectar com
  `chromium.connectOverCDP`. A navegação é por `[data-rota="…"]` (não por `location.hash`,
  que não faz nada). As janelas modais vivem em `.mm-overlay`.

---

## 5. O que foi implementado (2026-08-04)

Tudo verificado no **navegador de teste** (`npm run dev`, localhost:1420), com cofre em
memória e senha aleatória — nenhum dado real foi tocado.

### Bugs

| | Arquivo | Verificação |
|---|---|---|
| Hovercard grudado | `screens/edital.js` | Medido: hover `on/op=1` → sai `op=0` → **clique `op=0`** → troca de tela `op=0`. Antes ficava `on` para sempre. |
| Nome do concurso | `store.js` (`migrarParaPerfis` + backfill) | `perfil.nome` nasce vazio; o seletor deriva de `nomeDoPerfil()`. Backfill solta o "Meu concurso" congelado de quem já tem concurso. |
| Janelas empilháveis | `ui.js` (`abrirJanela`) | Abrir a mesma janela duas vezes agora foca a existente: `1 overlay`. Janela de outro título ainda pode empilhar (há fluxos que dependem disso). |

Ao investigar o hovercard apareceu de brinde um **vazamento de listener**: `ligarHoverPreview`
registrava um `scroll` novo a cada render do Edital. Agora os listeners globais entram uma
vez só. E `tooltip.js` ganhou a mesma guarda de `isConnected` — a causa-raiz era comum aos
dois (temporizador de ~300ms terminando depois de o alvo sair do DOM).

### Sincronização

- `sync.js` — `montarSnapshotSync` passou a remover: **config de IA**
  (`iaProvider`/`iaKey`/`iaKeyReserva`/`iaModelo`, agora metadado do aparelho), o **índice
  semântico**, o **checklist do edital** e o **`texto` do material quando há `paginas`**.
- `sync.js` — `aplicarRemoto` devolve todos esses do lado local (senão cada sincronização
  apagaria o índice que custou cota, o checklist e a chave de API). Testado.
- `store.js` — o `texto` do material é reconstruído no `init()`, **em todos os perfis** (o
  backfill comum só enxerga o perfil ativo).
- `sync-nuvem.js` — envelope **v2 = gzip + AES**; `decifrar` lê **v1 e v2**. Envelope de
  versão desconhecida agora diz "atualize o app neste aparelho" em vez de "formato
  desconhecido". Round-trip testado, e um envelope v1 forjado foi lido sem erro.

### Telas

- **Materiais**: grifo removido (botão, painel, seletor de página e o estado morto).
  `marcacao.js` intacto — **Lei Seca e Resumos seguem grifando**.
- **Edital**: novo par de botões **"Por frase" × "Por item do edital"**. No modo por item,
  cada item numerado vira um tópico com o número preservado — `(39) Propriedade · …` —, que
  é o que precisou ser feito à mão hoje. O `;` dentro de parênteses deixou de cortar
  (citação legal "…1965; LC 64…" fica inteira). A ajuda foi reescrita para descrever o
  comportamento real.
- **Reset**: preserva **chave/provedor de IA e tema**; a confirmação agora avisa que o
  aparelho **sai da sincronização** e que os outros ficam com os dados de agora.
  `.modal-msg` ganhou `white-space: pre-line` para o aviso caber em parágrafos.
- **Índice semântico**: ritmo de **90 req/min** (era rajada com concorrência 4, o que
  estourava a cota), **retomada** de onde parou (grava a cada 20 trechos e reaproveita o que
  já está indexado), progresso **por trecho** ("N de M trechos, X%") e mensagem própria para
  **429** ("a cota da IA acabou…") em vez de "tente de novo em instantes".

### O que ficou de fora, de propósito

O plano previa **derivar `texto` de `paginas` também no disco local**. Ao implementar ficou
claro que a economia que importa é a do **cofre** — e que dá para tê-la sem tocar em nada
gravado, apenas omitindo o campo no snapshot e reconstruindo na chegada. O disco local
continua com o texto (o usuário já havia dito que disco local é secundário), e o risco de
migração desaparece. Menos código, mesmo ganho onde dói.

---

## 6. Piloto medido com material real (2026-08-04)

Importado `10. Direito Ambiental.pdf` do cursinho "Direto ao Ponto" (**365 páginas**, PDF de
13,7 MB) no navegador de teste, já com o código novo. Extração: **15 s**, 736.604 caracteres.

### O cofre está resolvido

| | por página | projeção 9.026 páginas |
|---|---|---|
| antes (texto + páginas) | 4,06 KB | 35,8 MB — **estourava** |
| agora (só páginas) | **2,06 KB** | 18,1 MB cru |
| com gzip (3,6x medido) | | **5,1 MB** |
| já em base64 do cifrado | | **6,8 MB** — teto é 24 MB |

O corte do texto duplicado deu exatamente os 50% previstos, e a densidade do material de
cursinho (2,06 KB/página) bateu com a do edital (2 KB/página) — a amostra única não estava
enganando. **A biblioteca inteira cabe, com ~3,5x de folga.**

### 🔴 Mas o gargalo mudou de lugar: agora é o armazenamento LOCAL

| | por página | projeção 9.026 páginas | `JSON.stringify` |
|---|---|---|---|
| com o PDF guardado | **55,4 KB** | **489 MB** | 65 ms já com 20 MB |
| sem o PDF | 4,07 KB | 36 MB | ~223 ms por gravação |

489 MB numa única string JSON, reescrita a cada gravação, não é viável — o app travaria a
cada clique muito antes de encher o disco. **Descartar o PDF depois de extrair deixa de ser
otimização e vira requisito** para importar a biblioteca.

### 🔴 E a opção de descartar não se aplica justamente a esse material

`documentos.js:1374` só descarta o binário quando `!temFig` — e este material **tem figuras**
(`temImagem: true` em várias páginas), porque o cursinho é cheio de tabelas e "smart arts". A
condição existe por um bom motivo (a IA precisa do PDF para descrever as figuras), mas o
efeito é que **a opção nunca dispara no material que mais pesa**.

Caminhos: descartar **depois** de descrever as figuras (encadear as duas etapas); ou, quando
a opção estiver ligada e houver figuras, avisar que o PDF ficou e oferecer o descarte no fim.
Hoje o usuário liga a opção, importa 365 páginas e não recebe nenhum sinal de que ela não
valeu ali.

**Enquanto isso**, o caminho manual funciona: importar a disciplina, deixar a IA descrever as
figuras e usar o botão **"Descartar PDF original"** do material — foi o que a medição "sem
PDF" reproduziu.

---

## 7. Binários fora do estado (2026-08-04) — o gargalo local resolvido

O piloto mostrou que, resolvido o cofre, o gargalo tinha mudado de lugar: **o desktop**, não
o celular. O binário nunca sincroniza, então o celular só recebia os 36 MB de texto — os
489 MB ficavam na máquina que importou. E não é problema de disco: `commit()` →
`JSON.stringify(estado)` → ponte do Tauri → **reescrita da linha `kv.state` inteira** no
SQLite, a cada mudança.

**A correção:** o binário saiu do estado e passou a viver numa chave própria — tabela `kv`
com chave `blob:<id>` no SQLite (comandos novos `get_blob`/`set_blob`/`del_blob` em
`src-tauri/src/lib.rs`) e um object store `blobs` no IndexedDB (versão 2). O documento guarda
só `temPdf`/`temImg`; `store.binarioDoc(id)` carrega sob demanda, com cache em memória.

### Medido, mesmo PDF de 365 páginas

| | antes | depois |
|---|---|---|
| estado serializado | 20.229 KB | **1.487 KB** |
| por página | 55,4 KB | **4,07 KB** |
| `JSON.stringify` | 65 ms | **18 ms** |
| projeção da biblioteca (9.026 págs.) | **489 MB** | **36 MB** |
| PDF disponível (visualizador/OCR/figuras) | sim | **sim** (`pdfCarregaSobDemanda: true`) |

Nada se perde: o binário continua no aparelho, só não é mais reescrito a cada gravação.
**Descartar o PDF deixou de ser obrigatório** — voltou a ser escolha de quem não quer guardar
material protegido.

### Cuidados que a implementação tomou

- **Desktop com executável antigo:** os comandos `*_blob` não existem. `blobsDisponiveis()`
  detecta a falha e o binário volta a ficar embutido no estado — funciona como antes, sem
  perder arquivo, até o app ser atualizado.
- **Migração dos materiais já existentes:** roda no `init()`, em segundo plano e um a um.
  Travar a abertura do app para mover dezenas de MB seria pior que o problema; enquanto não
  termina, o binário segue embutido e tudo funciona. É idempotente.
- **`temPdf`/`temImg` são fato LOCAL:** o snapshot os manda desligados e `aplicarRemoto`
  devolve os do aparelho. Sem isso, o celular anunciaria "Abrir PDF" para um arquivo que
  nunca recebeu.

### O que ainda sobra (não é bloqueio)

Com a biblioteca inteira, o estado fica em ~36 MB e cada gravação custa **~455 ms** de
`JSON.stringify` na thread da interface. É perceptível, mas não impede o uso — e agora o que
resta no estado é o **texto**, que é dado do usuário de verdade. Para baixar disso seria
preciso tirar também as `paginas` do estado (mesma técnica) ou persistir por delta. Fica
registrado, não é urgente.

**Fora do escopo:** os **mapas mentais** continuam com `imgData`/`pdfData` embutidos
(`screens/mapas.js`, `ui.js`). São imagens pequenas e não apareceram na medição; se um dia
alguém importar mapas grandes, é o mesmo tratamento.

---

## 8. Mapas mentais e vínculo com o arquivo original (2026-08-04)

### Mapas mentais: mesmo tratamento, por higiene

Levantamento antes de mexer: das **cinco** formas de criar um mapa, **quatro** geram a árvore
por IA a partir de texto e não guardam binário nenhum (`origem: topico/material/resumo/tema`).
Só o import "híbrido/visual" traz `imgData`/`pdfData`, e é captura de tela de mapa — centenas
de KB, não dezenas de MB. **Não era gargalo**; foi feito para não deixar dois padrões no
código.

`addMapaMental` passou a gravar o binário fora do estado, `store.binarioMapa(id)` carrega sob
demanda e `abrirMapaMental` recebe o original já carregado (o visualizador vive em `ui.js`,
que não fala com o store). Medido com uma imagem de 200 KB: o estado ficou em **2 KB**.

Uma perda pequena e consciente: **a impressão de mapa não leva mais a imagem original**,
porque `arvoreParaHTML` monta HTML de forma síncrona e buscar o binário ali tornaria a
impressão assíncrona. Quem quer o original imprime pelo visualizador, que já o carrega.

### Vínculo com o arquivo original (só desktop)

Ideia do usuário: em vez de guardar o PDF, guardar o **caminho** e abrir o original na pasta.

**Não resolve o gargalo** — o PDF já saiu do caminho quente, e o que sobra no estado é o
texto. Mas resolve outras duas coisas reais: tira ~347 MB de cópia base64 da máquina (os
PDFs do cursinho somam 253 MB no OneDrive) e **some com a segunda cópia da apostila com
marca-d'água** de dentro do app.

Implementado como **complemento, não substituto**: o material ganha `caminhoOriginal` (só uma
string) e dois itens de menu — "Vincular arquivo original" e "Abrir original". Assim dá para
descartar o binário interno **sem perder o acesso** ao arquivo.

- Sem dependência nova: o seletor usa o `tauri-plugin-dialog` que já estava instalado
  (comando `escolher_arquivo`), e a abertura usa `std::process::Command` (`abrir_no_sistema`).
- `podeVincularArquivo()` devolve **false no navegador** — não existe caminho de arquivo lá,
  e a UI nem oferece. Verificado no teste.
- Limite conhecido: o vínculo quebra se o arquivo for movido ou renomeado. `abrir_no_sistema`
  checa a existência antes e devolve erro claro em vez de falhar em silêncio.

### Regressão completa depois de tudo

Snapshot (16 checks) ✅ · cofre v2 com ida e volta ✅ · Materiais sem grifo e Lei Seca intacta
✅ · reset preservando IA e tema ✅ · mapa com binário fora do estado ✅ · material real de 365
páginas: `pdfDataNoEstado: null`, `pdfCarregaSobDemanda: true`, **4,07 KB/página**, 17,5 ms
por gravação, projeção de **36 MB** para a biblioteca.

---

## 9. Distribuição — fazer o app funcionar sem o Claude Code (2026-08-04, v0.8.1)

O problema que faltava não era de armazenamento, era de **distribuição**: ao cadastrar o
edital do 192º e as aulas do cursinho, boa parte do trabalho aconteceu **fora do app** (eu
escrevi scripts em Python para ler os sumários e o conteúdo programático). Num computador de
terceiro não haverá ninguém fazendo isso. Testado o caminho do usuário comum — importar o PDF
pelo botão normal, sem preparo — o resultado saía errado.

Princípio adotado: **o caminho determinístico (sem IA, sem chave, sem cota, offline) tem de
dar conta sozinho; a IA é refinamento, não requisito.**

### Como isso foi medido

Novo `dev/teste-sumarios.mjs`: roda as funções puras de `estrutura.js` e `ia.js` contra os
textos extraídos das **24 apostilas reais** do cursinho e contra fixtures commitáveis
(miniaturas dos layouts, sem copiar material protegido). Sem navegador e sem IA.

```
node dev/teste-sumarios.mjs                  # fixtures (rápido, roda em CI)
node dev/teste-sumarios.mjs --reais <pasta>  # .txt extraídos das apostilas de verdade
```

⚠️ **Erro de método que quase passou:** medi primeiro contra `.txt` gerados pelo extrator de
PDF em Python que uso fora do app. Deu **24/24 correto** — e a tela do app mostrava
`Aula 01 — 3`. Os dois extratores entregam o índice de duas colunas de formas diferentes: o
pdf.js dá `10.1 3` (código e página na MESMA linha) e o pdfminer quebra em duas. O parser
tratava o `3` como título da aula. **A medição só vale contra o texto do próprio app**: os
`.txt` de referência passaram a ser gerados chamando `extrairPdfPaginas` dentro do navegador,
e o aviso está no cabeçalho do teste. A fixture `formato-c-pdfjs.txt` trava esse layout.

### O que estava quebrado, e o resultado

| # | Falha | Antes | Depois |
|---|---|---|---|
| A1 | Página de sumário só era achada pela palavra "Índice" | 16/24 apostilas | **24/24** |
| A2/A3 | Só 2 dos 4 layouts de índice eram entendidos | — | 4 de 4 |
| A4 | Índice de 2+ páginas: lia só a primeira | Proc. Civil 24 de 47 | **47 de 47** |
| A5 | Falsos positivos no fallback por numeração | 7 lixos em 19 blocos | **0** |
| A6 | Blocos devolvidos fora da ordem do documento | `10.7` antes de `6` | em ordem |
| B1 | Aulas por PDF barradas pelo teto de 14 MB | apostilas têm 13–33 MB | **sem teto** |
| B2 | Sem IA não havia caminho nenhum | — | **423 aulas, 0 chamadas de IA** |
| C | Edital em PDF sem limpeza | cabeçalho virava disciplina | limpo |
| D | Caminho por IA morria calado | mesma causa de A1 | reativado |

Medição final das 24 apostilas: **sumário encontrado 24/24 · entradas coerentes 24/24 ·
423 aulas com disciplina preenchida, sem IA**.

### As correções

- **`estrutura.js`** — sumário reconhecido pela **forma** (coluna de códigos, pontilhados,
  pares código+página, série de entradas da mesma família em ordem), não pela palavra; índice
  de várias páginas lido inteiro e sem repetir código; quatro layouts de índice, incluindo o
  `10.1 3` do pdf.js; poda de falso positivo (ano de prova, item de lista, código fora da
  família dominante); `aulasDoSumario()` e `disciplinaDoNomeDeArquivo()` novos;
  `limparRuidoDePaginas()` mudou-se para cá (era privada de Materiais) e ganhou companhia:
  `reordenarRotulosDeEdital()` e `recortarConteudoProgramatico()`.
- **`pdf.js`** — `extrairPdfPaginas(f, { ate })` para ler só as primeiras páginas (numa
  apostila de 1.289 páginas, ler 20 é instantâneo); `extrairPdf` agora limpa o ruído e
  reordena os rótulos antes de devolver o texto.
- **`edital.js`** — os dois importadores de aula tentam **primeiro** o sumário por pdf.js e só
  depois a IA; o preview ganhou o campo **"Disciplina destas aulas"** (um só, para o lote).
- **`store.js`** — `aulasDoSumarioVisao()`: reserva para apostila **escaneada**, que manda só
  a **imagem** da página do índice, nunca o PDF inteiro.
- **`ia.js`** — `separarEdital` cola o número do item ao seu texto (o PDF quebra em linhas
  soltas, nas duas formas: número sozinho e "18. Contratos em geral…") e recusa como
  disciplina uma linha terminada em ponto (era assim que `(LINDB).` virava disciplina e
  sequestrava 17 itens); algarismo romano que numera seção não vira "Iv".

### O edital inteiro × o conteúdo programático

O usuário importa o **PDF do edital inteiro** — 79 páginas de vagas, inscrição, recursos,
cronograma e modelos de declaração. Sem recortar, o 192º saía com **96 "disciplinas"**, das
quais 73 eram seções administrativas ("1. Das Vagas", "Evento Datas", "Declaração").

`recortarConteudoProgramatico` corta do primeiro anexo de conteúdo programático até o
primeiro anexo que não é de conteúdo (o cronograma). Só casa o marcador quando ele é um
**título de linha inteira** ("ANEXO II - CONTEÚDO PROGRAMÁTICO", "DO CONTEÚDO PROGRAMÁTICO"),
nunca uma menção no meio de uma cláusula. Resultado: **96 → 23 disciplinas**, que são
exatamente as do edital (13 do Anexo I + Observações Finais + as 8 humanísticas do Anexo II +
Direitos Humanos do Anexo III), com 435 itens numerados. Sem marcador (o usuário colou só o
programa), o texto passa intacto.

### O rótulo girado do edital

O caso mais difícil e o mais específico do TJSP: o nome da disciplina é impresso **de lado**
(girado 90°) na margem. O extrator não sabe da rotação e joga esses rótulos **no fim** do
bloco da página, depois dos itens que eles encabeçam. Lido de cima para baixo, os itens iam
para a disciplina errada.

`reordenarRotulosDeEdital` casa os últimos *k* rótulos com as *k* listas de itens que
recomeçam em "1." na mesma página e move cada rótulo para antes da sua lista — conserta a
**entrada**, e o separador continua o mesmo. Anexo II do 192º: de **5 disciplinas erradas**
(uma chamada `(LINDB).`) para as **8 corretas, na ordem, com a contagem de itens do edital
impresso** (5, 4, 6, 7, 8, 4, 5, 6). Verificado que não altera **nenhuma** das 191 páginas
das apostilas — só dispara no layout que o exige.

### Verificação no navegador, perfil NOVO e IA DESLIGADA

Percorrido o caminho do usuário comum de ponta a ponta (onboarding de verdade, chave de IA
vazia, nenhum preparo de arquivo por fora):

| Passo | Resultado |
|---|---|
| Edital do 192º em PDF (79 págs) → "Adicionar ao edital" | **23 disciplinas e 419 tópicos** em 6 s, com a numeração oficial `(1)`, `(2)`… preservada |
| `10. Direito Ambiental.pdf` → "Plano do cursinho" | **12 aulas** em 4 s, títulos certos, disciplina "Direito Ambiental" preenchida |
| `6. Direito Processual Civil.pdf` (33 MB, índice em 2 págs) → "Plano do cursinho" | **47 aulas** em 6 s — o caso mais difícil |
| `10. Direito Ambiental.pdf` → Materiais | **12 blocos**, todos com página, em ordem, cobrindo p.3–365 sem buraco (`origem: "indice"`) |
| `6. Direito Processual Civil.pdf` → Materiais | **47 blocos**, em ordem, p.36–1289, nenhum sem página |

Detalhe de método: **não edite os fontes com a verificação rodando** — o HMR do Vite recarrega
a página no meio e o teste trava num modal que deixou de existir. Aconteceu uma vez aqui.

### O que continua no backlog

"Vincular ao edital" sem busca com 401 tópicos; autovínculo do PDF por palavra solta; o passo
4 do onboarding que oferece "Importar edital (PDF)" e cai numa tela vazia; e a arquitetura de
sincronização (conteúdo fora do snapshot, sync por delta).

Achado novo, pequeno: no onboarding, com o campo do concurso vazio, "Pular para o fim" e
"Continuar" **avisam** ("Informe o cargo/concurso.") mas não põem o foco no campo nem o marcam
como inválido — o aviso passa despercebido em tela grande, onde o toast fica longe do campo.

---

## 10. Depuração do edital do 192º (2026-08-04, pós-v0.8.1)

Revisando as duas pendências acima, a segunda ("a numeração do Anexo I é idiossincrática") não
era idiossincrasia: eram **dois defeitos reais**, e um deles **fazia uma disciplina inteira
desaparecer do edital importado**.

**1. Citação legal lida como número de item.** A linha de continuação
`5.903/2006, 7.962/2013 e 11.150/2022).` era lida como o **item 5**. Isso reiniciava a contagem
da página, e o rótulo girado da disciplina ia parar antes do item 2 em vez do 1 — o Direito do
Consumidor começava em "(2)" e o item (1) ficava no Processual Civil. Conserto: número de item
é dígito + ponto seguido de **espaço ou fim de linha**, nunca de outro dígito (`(?!\d)`).

**2. Item em ALGARISMO ROMANO não era reconhecido.** Direito Penal e Direito Processual Penal
não numeram com `1.`: usam `I –`, `II –`, `III –`, `IV –`. Como a página não tinha nenhum
"início de lista", o rótulo não era movido e **todo o programa de Processual Penal era
absorvido pela disciplina anterior** — a disciplina simplesmente não aparecia na importação.
Conserto: `numeroDoItem()` entende arábico e romano.

**3. Granularidade das subdivisões.** Colar as linhas de continuação nos itens romanos fez o
item `II – CÓDIGO PENAL` engolir a Parte Geral, a Parte Especial e as 18 alíneas num tópico só
— impossível de acompanhar. A colagem passou a parar em qualquer **subdivisão explícita** do
edital: alínea (`a) Da aplicação da lei penal`) e subitem com travessão (`1 – Parte Geral`).
Efeito colateral bom: o Direito da Criança, cujo programa são 3 pontos com dezenas de alíneas,
saiu de 3 tópicos para 43 acompanháveis.

| | v0.8.1 | agora |
|---|---|---|
| Disciplinas | 23 | **24** (Processual Penal voltou) |
| Tópicos | 419 | **485** |
| Consumidor | começava em "(2)" | começa em (1) |
| Penal | 7 tópicos (sobras) | 23 |
| Processual Penal | **ausente** | 18 |

Travado em `dev/fixtures-edital/item-romano.txt`, que reproduz as três armadilhas em miniatura.

---

## 11. A biblioteca de verdade entrou no app (2026-08-04, sobre a v0.8.2)

Até aqui o app tinha **2 materiais** (o edital do 192º e um resumo dele). As 24 apostilas do
"Direto ao Ponto" nunca tinham sido importadas — a v0.8.0 só havia **medido** que caberiam.
Agora entraram as **17 do edital** (mesmo corte por disciplina do plano do cursinho: disciplina
fora do edital, arquivo inteiro fora), pelo caminho do usuário comum: janela "Adicionar
material" do próprio app, no desktop, uma por vez.

| | |
|---|---|
| Materiais | 2 → **19** |
| Páginas | 444 → **9.105** |
| Blocos de sumário | 4 → **358** |
| Blocos vinculados a tópicos do edital | **327** (91%) |
| Tempo | ~50 min de lote (137 s a 316 s por apostila) |
| Base local | 18 MB → **428 MB** (os PDFs ficam guardados, decisão do usuário) |
| Envelope do cofre | **5,63 MB** de 24 MB (0,63 KB/página) — sincronizado sozinho ao fim |

### O achado: com IA ligada, o app troca um sumário certo por um errado

O piloto (Ambiental) parecia perfeito — 12 blocos, p.3–365, 10 já vinculados ao edital. A
conferência bloco a bloco contra o **cabeçalho numerado no corpo** mostrou que não era.

O índice da p.2 do Ambiental é lido pelo pdf.js como `10.1 3 / 10.2 4 / 10.3 36 / 10.4 64 /
10.5 90 / …`, e os cabeçalhos estão mesmo nessas páginas ("10.3 Princípios Ambientais" abre a
p.36). O material salvo dizia **13, 32 e 39**.

Medindo os três candidatos contra o gabarito (a página em que `N.M` abre linha no corpo, fora
das páginas de índice), nas 17 apostilas, 339 blocos:

| Candidato | Acertos |
|---|---|
| O que o app gravou (IA por cima do determinístico) | 260/339 (77%) |
| `detectarEstrutura()` como está hoje | **117/339 (35%)** |
| Só o índice (`parseIndice`), com a numeração do corpo como reserva | **316/339 (93%)** |

São **dois** defeitos independentes, os dois na preferência de fonte:

1. **`screens/documentos.js:1241`** — com chave de IA configurada, `estruturarPorSumarioIA`
   sobrescreve o resultado determinístico *sempre que devolve blocos*. A regra é da F2, quando
   o leitor determinístico ainda era fraco; depois da v0.8.1 ela inverteu o sinal. A IA erra
   lendo o índice de duas colunas como imagem (36→13, 64→32, 90→39).
2. **`estrutura.js:673`** — dentro do determinístico, `tags[e.numero]` (marcador `#NN`) tem
   prioridade sobre a página declarada no índice. Nestas apostilas a tag cai dezenas de
   páginas adiante, e é isso que derruba o determinístico para 35%: o índice foi lido **certo**
   (`parseIndice` acerta 316/339) e descartado logo depois.

O caso extremo é o **Consumidor**, cujo índice não traz número de página nenhum: a IA ancorou
15 dos 19 blocos na última página (p.162), enquanto a numeração do corpo acerta 17/17.

### O que foi feito nos dados (o código não foi tocado)

Correção aplicada pelo método do próprio app (`store.aplicarEstruturaAoMaterial`, que re-deriva
`topicoIds`/`topicoPaginas` e faz commit): **83 páginas iniciais corrigidas** e **6 blocos
fantasma removidos** (número repetido e sem página, no Administrativo, na Legislação Penal
Especial e no Consumidor). Reconferido: **339/339**, nenhum bloco sem página, todos em ordem,
cada material cobrindo da p.3 até a última.

Backups: `_BACKUP_db_pre-biblioteca_2026-08-04.db` (18 MB, antes de tudo) e
`_BACKUP_db_pos-import_pre-correcao_2026-08-04.db` (428 MB, antes da correção).

### Método (vale para a próxima)

- Pilotar o desktop por CDP: o `setInputFiles` do Playwright **estoura 30 s** num
  `<input type=file>` `hidden` dentro de `<label>`; entregar o arquivo por
  `DOM.setFileInputFiles` (CDP cru) resolve. E, depois de salvar uma apostila grande, o app
  ainda está gravando o binário: esperar até **120 s** pela janela seguinte abrir.
- Conferir lendo o **SQLite direto** (`kv:state`), não a tela — não depende de instância de
  módulo nem de render.
- O gabarito de página tem de vir do **corpo do PDF**, não do índice nem da IA: procurar
  `^N.M` fora das páginas de índice (página com 3+ códigos distintos = índice).

### Fica pendente

O conserto no app (as duas preferências de fonte acima) e um teste que trave o comportamento —
sem ele, toda apostila nova volta a entrar com o sumário torto. Com o conserto, dá para refazer
os 17 com "Atualizar material" (mantém id, vínculos e histórico) em vez de corrigir dado.

---

## 12. Os gargalos da sessão da biblioteca, consertados (v0.8.3)

A importação da biblioteca (seção 11) expôs defeitos que não eram do import, e sim de decisões
antigas do app. Todos medidos antes e depois, sobre as 17 apostilas reais.

### 1. A fonte do sumário estava invertida, em dois lugares

| Candidato a página inicial de cada bloco | Acertos (339 blocos) |
|---|---|
| O que o app gravava (IA por cima do determinístico) | 260 |
| `detectarEstrutura()` como estava | 117 |
| **Depois do conserto** | **339** |

- `screens/documentos.js` — a IA virou **rede**, não padrão: só é chamada quando o
  determinístico NÃO resolveu (`ehEstruturaForte()` = origem índice/numeração e ≥80% dos blocos
  com página). A regra antiga é da F2, quando o leitor determinístico ainda era fraco.
- `estrutura.js` — a ordem passou a ser **corpo > índice > tag**. A tag (`?topic=10.5`) é um
  link da plataforma na página: marca uma página que FALA da seção, não onde ela começa.
- `parseIndice` passou a devolver **todas** as páginas do índice (`indicePags`), não só a
  última: com índice de 2-3 páginas, o título era "achado no corpo" na própria página de índice
  (era o que punha os 47 blocos do Processual Civil na p.2-3).
- `paginaDoTitulo` guarda o casamento **só pelo número** como reserva, para quando a linha do
  índice quebra e o título chega truncado (o `3.22` do Administrativo).

Travado por 4 fixtures em `dev/fixtures-estrutura/` (duas REPROVAM no código anterior — testado)
e pelo auditor `dev/auditar-sumarios.mjs`, que confere a base real contra o cabeçalho no corpo.

### 2. O estado era reescrito inteiro a cada clique

Com a biblioteca dentro, o estado tinha **42,9 MB** e cada gravação custava **558 ms** de
`JSON.stringify` — mais o IPC e a escrita. Três coisas saíram de lá:

| O que saiu | Peso | Onde mora agora |
|---|---|---|
| `texto` do material (é o join das `paginas`) | 17,4 MB | recomposto no `init()` |
| `paginas` do material | 17,4 MB | chave `pag:<doc>` |
| índice semântico (vetor de 768 dimensões por trecho) | 6,5 MB / 989 trechos | chave `emb:<perfil>` |

O índice era a bomba-relógio: indexar a biblioteca (~22.800 trechos) levaria o estado a ~190 MB,
e a indexação grava a cada 20 trechos. Medido no navegador com 3 apostilas: estado em memória
3,54 MB, **gravado 0,48 MB**.

⚠️ **A migração é o ponto perigoso** e quase passou batido: no 1º boot, páginas e índice ainda
estão DENTRO do estado. Se a assinatura deles fosse marcada como "já gravada" nesse momento, a
1ª gravação tiraria os dois do estado sem nunca os ter escrito fora — e sumiriam no boot
seguinte. Só entra em `pagsSalvas`/`embSalvos` o que veio do disco. Testado no navegador
plantando um estado no formato antigo, recarregando duas vezes e conferindo o conteúdo.

### 3. Importar era um arquivo por vez, sem sinal de vida

- `#doc-file` ganhou `multiple` e uma **fila**: "Importando 3 de 17", cada arquivo pelo mesmo
  caminho de sempre. Material de mesmo título é ATUALIZADO (mesmo id, vínculos preservados).
- `extrairPdfPaginas` aceita `onProgresso` → a etapa mostra "página 340 de 1.289".
- Salvar espera a gravação REAL (`store.aguardarGravacao()`), com o botão em "Salvando…".
- Na fila, a descrição automática de FIGURAS pela IA não roda: estourava a cota do Gemini
  (HTTP 429 já no 3º arquivo, limite de 15 req/min no plano grátis).

### 4. Espaço em disco

O binário do material era gravado como data URL base64 (`TEXT`): 288 MB de PDF viravam 383 MB.
Comandos novos `set_blob_bin`/`get_blob_bin` decodificam no Rust e guardam **bytes**; o JS
continua trabalhando com data URL, então nada mudou para o visualizador, o OCR e a Visão.
Material gravado por versão anterior continua sendo lido do caminho antigo.

### 5. A biblioteca na tela

- Agrupar por disciplina usava só `d.topicoId` (o primeiro tópico vinculado). Agora vale a
  disciplina com **mais blocos** do sumário.
- A etiqueta de tópico mostrava o item do edital inteiro (o item (11) de Bens Públicos tem 18
  subdivisões) e o cartão virava um parágrafo: agora mostra o começo, com o texto completo no
  tooltip.

### O que a IA do app é, afinal

`iaProvider: "gemini"` com `gemini-3.1-flash-lite` (padrão) e `gemini-embedding-001` para o
índice semântico. O provedor **claude-cli** (Claude Code local, só desktop) existe no código e
continua sem uso — não é ele que está ligado.

### Resultado, medido na base real depois de refazer os 17 pela fila nova

| | Antes | Depois |
|---|---|---|
| Blocos na página certa (auditor) | 260/339 | **354/354** |
| Origem do sumário | 16 por IA, 1 por índice | **17 por índice** |
| `state` (reescrito a cada clique) | 42,9 MB | **0,67 MB** |
| Binário dos materiais no banco | 338,70 MB (base64) | **253,38 MB** (bytes) |
| Arquivo `.db` | 428 MB | **280 MB** (após `VACUUM`) |
| Envelope do cofre (com as 9.105 páginas) | 5,63 MB | **5,50 MB** |
| Fila dos 17, ponta a ponta | — | **50,8 min**, sem uma chamada de IA |

O `VACUUM` foi manual: o SQLite não devolve sozinho o espaço das chaves antigas em base64.
Conferido também: leitura do binário do disco **sem cache** (358 ms para 5,6 MB) e o
visualizador de PDF abrindo e pintando as páginas pelo caminho novo; o snapshot de
sincronização continua levando as 9.105 páginas (é montado do estado em MEMÓRIA, não do
arquivo). Testes: 5/5 sumário, 2/2 edital, 4/4 estrutura, persistência ok.

---

## 13. Armadilha do build: o executável pode sair com o frontend ANTIGO

Descoberto ao conferir a v0.8.3 no desktop: a tela continuava mostrando o botão no lugar
antigo depois de instalar. Não era cache do WebView (nem service worker — o desktop não
registra nenhum): o `dist` estava certo (`main-DEAhBc2H.js`, com o texto novo), mas o
**executável instalado embutia `main-B_KjCcTI.js`**, de duas compilações antes.

Causa: o Tauri assa o `dist` DENTRO do binário Rust. Se nada do Rust mudou, o Cargo reaproveita
o binário compilado e os assets embutidos continuam sendo os da compilação anterior — o
`vite build` do `beforeBuildCommand` roda, atualiza o `dist`, e o resultado é ignorado.

**Regra para publicar:** quando a versão só muda o frontend, forçar a recompilação antes de
empacotar:

```bash
touch src-tauri/src/lib.rs     # ou: cargo clean -p mentor-concurso
npm run tauri build
```

**Como conferir depois de instalar** (30 segundos, e teria evitado publicar a versão errada):

```powershell
$exe = "$env:LOCALAPPDATA\Mentor Concurso\mentor-concurso.exe"
$txt = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($exe))
$txt.Contains("main-<hash do dist atual>")   # tem de ser True
```

Ou, com o app aberto: `document.querySelector('script[type=module][src]').src` tem de bater com
o arquivo em `dist/assets/`.

---

## 14. O vínculo bloco↔tópico estava errado em quase metade dos casos

Pergunta do usuário depois de ver os "chips" do cartão: *a vinculação de fato está correta?*
Não estava. `dev/auditar-vinculos.mjs` compara a disciplina do tópico vinculado com a
disciplina do próprio material (a do nome do arquivo):

| | Blocos na disciplina do material |
|---|---|
| Direitos Humanos | 5/13 (38%) |
| Constitucional | 10/20 (50%) |
| Tributário | 7/14 (50%) |
| Administrativo | 11/19 (58%) |
| **Total (materiais cuja disciplina está no edital)** | **173/269 (64%)** |

Exemplos: `2.8 Administração Pública` (Constitucional) → **Penal**, "crimes contra a
administração pública"; `14.5 Proteção às Pessoas com Deficiência` (Direitos Humanos) →
**Civil**, "Pessoas naturais".

**Causa, literal:** `casarEstruturaComEdital` chamava `sugerirTopicoPorAssunto(b.titulo, "")`.
A função aceita uma dica de disciplina e o chamador passava string vazia — o casamento era por
sobreposição de palavras contra o edital inteiro, e "administração", "competência" e "proteção"
aparecem em todas as matérias.

**Conserto:** `acharTopicoDoBloco()` (função pura, em `estrutura.js`) casa **primeiro dentro da
disciplina do material** (`disciplinaDoMaterial()`, tirada do nome do arquivo) e só olha o
edital inteiro se não houver nada aceitável ali — com exigência maior (0.6 contra 0.34). Sem
candidato bom, **não vincula**: vínculo errado conta como cobertura do edital e contamina
dossiê e revisões, então vazio é melhor.

Simulado sobre a base real, sem gravar (`dev/simular-vinculos.mjs`): **64% → 95%**. Mudam 119
blocos; 40 ficam sem vínculo (são os que hoje apontam para a matéria errada).

As três apostilas que **não** são disciplina do edital (Legislação Civil Especial, Legislação
Penal Especial, Difusos e Coletivos) continuam casando globalmente, que é o certo: o conteúdo
delas mora dentro de Civil, Penal e Consumidor. Elas aparecem com 0% no auditor **por
construção** — não é defeito.

Travado em `dev/teste-vinculos.mjs` (6 regras, incluindo os quatro casos reais acima).

### Re-vínculo aplicado na base real (3 passadas)

`store.revincularMateriais()` re-aplica a regra nos materiais já importados sem tocar em
páginas, texto, figuras, questões, flashcards ou histórico. Cada passada revelou um resíduo:

| Passada | Regra que entrou | Acerto (materiais cuja disciplina está no edital) |
|---|---|---|
| — | (antes) | 173/269 · **64%** |
| 1ª | casar primeiro dentro da disciplina do material | 252/263 · **96%** |
| 2ª | título com menos de 3 palavras úteis não sai da disciplina | 255/258 · **99%** |
| 3ª | herança da aula do cursinho também respeita a disciplina | 253/253 · **100%** |

O resíduo da 2ª eram títulos de uma palavra: a nota é interseção/menor conjunto, então
"Prescrição" casa 1.00 com qualquer "Prescrição e decadência" do edital. O da 3ª era o
atalho "aula de tópico único → o bloco herda", que passava por fora da regra.

Preço: 313 vínculos contra 327 antes. Os 14 que sumiram são os que apontavam para a matéria
errada e não têm equivalente na própria disciplina — vazio conta certo no "% do edital
coberto"; errado, não.

---

## 15. Ler figuras: o híbrido Gemini + Claude Code, e a armadilha do 429

O usuário pediu para usar a IA do app **pelo Claude Code** na leitura das 531 páginas com
figura. Medindo antes de soltar, o custo apareceu — e não é onde se imagina:

| Chamada ao `claude -p` | Custo relatado |
|---|---|
| "Responda apenas: OK" — **sem imagem** | US$ 0,0480 |
| a mesma coisa **com a imagem da página** | US$ 0,0573 |

A imagem custa ~US$ 0,009; **84% do custo é a invocação em si** — cada `claude -p` abre sessão
nova e recria ~22 mil tokens de contexto (prompt de sistema, ferramentas, o `CLAUDE.md` do
usuário, catálogo de skills). Para 531 páginas: ~2h15 e ~US$ 27, contra ~45 min e zero pelo
Gemini flash-lite. Claude Code é a ferramenta certa para a página difícil, não para 531
chamadinhas.

Daí o **híbrido**: Gemini na frente, Claude Code só onde o Gemini recusar.

⚠️ **A armadilha que pegou na prática:** a 1ª execução mandou 20 páginas para o Claude Code em
poucos minutos. Motivo: o Gemini devolvia **429**, e o código tratava 429 como "recusa" — ou
seja, *cota estourada virava conta cara automaticamente*, exatamente o que o híbrido queria
evitar. E o teto da reserva era por MATERIAL (40), então 14 apostilas dariam até 560 chamadas
caras. Consertado:

- **429 não é recusa, é "espere"**: espera 25 s, tenta o Gemini de novo e, se insistir, PARA a
  rodada avisando que a cota acabou (o app retoma depois de onde parou).
- Reserva paga só para **recusa de verdade** (imagem/conteúdo rejeitado), com **orçamento
  único da rodada** (25), não por material.
- Ritmo do Gemini de 4,2 s → **5 s** (12 req/min; o teto do plano grátis é 15/min).
- Página conferida **sem figura** passa a ser registrada (`{pagina, vazio:true}`): sem isso ela
  voltava como pendente e era reprocessada para sempre — pagando de novo.

Custo real da lição: ~US$ 1 (20 chamadas). As 46 páginas lidas ficaram salvas.

---

## 16. O leitor de PDF passou a ser o do próprio WebView (2026-08-05)

Depois de refazer o leitor caseiro (pdf.js) três vezes — seleção que tapava o texto no tema
escuro, "página inteira" errado, zoom com Ctrl+roda faltando —, a pergunta do usuário resolveu
o assunto: *"e se esse visualizador fosse um da própria web?"*. O WebView2 já traz o leitor do
Edge, completo e conhecido: seleção, busca, zoom com Ctrl+roda, página inteira, girar,
miniaturas, imprimir e salvar. Manter uma cópia pior disso à mão era trabalho contra.

`abrirVisualizadorPdf()` agora decide o caminho:

1. **Leitor nativo** (padrão no computador) — `navigator.pdfViewerEnabled` ligado: o app monta
   só a moldura (título, tela cheia, fechar) e um `<iframe>` com um `blob:` do PDF, com
   `#page=N` para cair na página do bloco clicado. Nada de canvas, nada de camada de texto.
2. **pdf.js**, de reserva — onde não há leitor nativo. O Chrome no **Android baixa** o PDF em
   vez de exibir, então o PWA/celular continua com o leitor próprio, que segue no código.

Detalhes que só apareceram testando no app instalado:

- **Largura**: o leitor nativo abre com a barra de miniaturas; com os 900 px do modal antigo a
  folha saía **cortada à direita**. O quadro passou a `min(1400px, 96vw)` × `94vh`.
- **Tela cheia**: dentro do iframe o F11 é do leitor nativo e não chega ao app, então o botão
  da barra é o caminho garantido (o F11 no app funciona quando o foco está fora do iframe).
  O **Escape** só fecha o visualizador quando NÃO se está em tela cheia — senão uma tecla
  faria as duas coisas de uma vez.
- Ícone: em lucide é `maximize-2`/`minimize-2`. `maximize` existe mas desenha outra coisa —
  o botão saiu invisível na primeira tentativa.

Medido no app instalado, nos dois temas: `pdf-nativo` ativo, iframe presente, nenhum canvas
próprio, 1382×865 → 1920×1080 e de volta, pelo botão e pelo F11.

### Fecho da biblioteca

- **Figuras: 922 descritas, 0 pendentes** (899 pelo Gemini, 23 pela reserva ≈ US$ 1,15).
- **Páginas escaneadas: 0 pendentes.** As 13 que sobraram foram transcritas pela Visão. Antes
  disso a etiqueta "página escaneada" mentia: 16 das 29 já tinham texto e ainda apareciam,
  porque `paginasPendentes` olhava só a marca `vazia`, gravada na importação. Agora exige
  texto realmente vazio — conserto retroativo, vale para qualquer base já importada.

---

## 17. Trilha Estratégica e cronômetro flutuante (2026-08-05)

### "Temas que mais caem" saiu de um material, sem IA

O cursinho publica um raio-x da banca (`Estudo Estratégico`, 114 páginas) com a fatia de cada
tema por disciplina. Virou uma terceira fonte de relevância no Edital, ao lado de "pelas minhas
provas" e "pesquisar na web" — e a única que **não usa IA nem internet**: os números já estão no
material que o usuário importou.

O mesmo PDF diz a mesma coisa de três jeitos, e os três precisaram de leitor próprio:

| Forma | Onde aparece |
|---|---|
| Gráfico com camada de texto | o PDF entrega a coluna de percentuais TODA JUNTA e os rótulos logo abaixo, na mesma ordem |
| Enumeração no texto | "1. Organização dos Poderes — 21,25%" |
| Tabela Markdown | é assim que a **Visão** devolve um gráfico que só existia como imagem |

Seis disciplinas tinham o gráfico impresso na imagem da página — invisíveis para a extração de
texto. A Visão do próprio app resolveu, uma página por vez. Detalhe que custou duas rodadas: **o
gráfico fica na mesma página da frase "o tema de maior incidência é…"**, não na seguinte.

**Conversão de percentual em nível.** O percentual é fatia DA disciplina, não relevância
absoluta: 21% é o tema mais cobrado de Constitucional enquanto 31% é o de Tributário. Traduzir
direto jogaria tudo para "Baixa". A conversão é pelo ACUMULADO, do jeito que o próprio material
lê os números ("quatro temas respondem por mais da metade"): primeiros 50% = 95, até 75% = 70,
até 90% = 40, resto = 15.

**Três regras de casamento que só apareceram medindo** (`dev/teste-incidencia.mjs`, contra o
edital real de 401 tópicos):

1. **Disciplina como âncora.** O `acharTopicoPorNome` do store casa por "contém" no edital
   inteiro — nunca recebeu o conserto que os materiais receberam na v0.8.3. Aqui usa-se o
   `acharTopicoDoBloco`, com a disciplina.
2. **Piso pelo tamanho do tema.** Item de edital do TJSP é enumeração longa; a nota é
   interseção/menor conjunto, então tema de 1-2 palavras tira 0,5 com UMA palavra em comum e
   passava no piso de 0,34. Foi assim que "Organização dos Poderes" caiu dentro de "Normas
   Constitucionais: Hermenêutica e Filosofia". Tema curto agora só casa contendo tudo.
3. **Citação de lei casa pelo NÚMERO.** "Lei", "nº" e pedaços de número são comuns a meio
   edital: o Estatuto do Desarmamento ia para "Pessoas naturais · Direitos da personalidade" e a
   Lei Carolina Dieckmann (12.737) para "Crimes eleitorais (Lei nº 4.737)". Não achando a mesma
   lei, não casa — e está certo, essas leis não estão no edital.

Disciplina do material que **não existe no edital** não é descartada: os temas dela são
procurados no edital inteiro. É o caso da Legislação Penal Especial, que no edital do TJSP mora
como tópicos dentro do Penal — 15 temas que iam para o lixo, 11 casaram.

Resultado medido: 13 disciplinas, **137 de 168 temas casados (82%)**, 114 tópicos com nível
proposto. O casamento não é perfeito, então a lista de revisão mostra DE ONDE veio cada
sugestão ("de 'Recursos' — 16,41% de Direito Processual Civil"): dá para reprovar uma torta de
relance, que é o ponto.

### Cronômetro flutuando por cima de outros apps

Pedido: no iPad, manter o cronômetro à vista estudando em outro aplicativo. A API que parece
óbvia — **Document Picture-in-Picture** — **não existe no Safari**, nem no iPad nem no Mac; é
Chrome/Edge/Firefox no computador, onde o app desktop já tem a janelinha nativa. O que o iPadOS
suporta desde a versão 14 é o **PiP de vídeo**: relógio num `<canvas>` → `captureStream` →
`<video>` → picture-in-picture.

Quatro defeitos que só apareceram na tela (dois deles achados pelo usuário):

- **A janelinha nascia enorme e não encolhia.** Ela mantém a proporção do vídeo e tem altura
  mínima própria: canvas largo e baixo (480x220) ⇒ largura mínima grande. 16:9 resolve.
- **Sem botões de play/pausa.** Vídeo vindo de canvas não os ganha — para o PiP, stream ao vivo
  não é algo que se pause. Quem os desenha é a **Media Session**.
- **`requestAnimationFrame` para em segundo plano** — exatamente quando esta janela serve para
  alguma coisa. Desenho por timer, com `captureStream(0)` + `requestFrame()`.
- **Abrir a janelinha iniciava o cronômetro**: o `play()` que damos para o vídeo existir era
  lido como comando do usuário.

Limite assumido: é um vídeo, não cabem botões nossos lá dentro. Zerar e trocar de modo seguem
no app.
