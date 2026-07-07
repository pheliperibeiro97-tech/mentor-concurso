# PLANO REAL — Lei Seca / Jurisprudência (auditoria item a item)

---

## 🎯 MODELO FINAL v3 (decisões travadas — EM EXECUÇÃO 2026-07-06)

**Princípio inegociável:** o app **nunca inventa nem OCR a letra da lei**. Só usa texto que o usuário **forneceu** (colar ou busca no Planalto). No drill, o **"verde" (correto) é sempre o texto guardado**; a IA só *altera* para criar a alternativa errada. Literalidade é sagrada. → **OCR de lei: CORTADO.**

**5 abas** (des‑fundir o "Acervo" atual): **Ler · Metas · Memorizar · Treinar · Raio‑X**.
- **Ler** = base: por norma, um **link** (Planalto) + **anotações** + o **texto** (opcional; é o que habilita o treino). Marcação tricromática. Leitura na fonte (link) ou no texto.
- **Metas** = **meta crua por nome** ("Ler art. 1º–20 da CF"), **sem transcrever**, com preview para **quebrar em partes** → vira tarefa no Planejamento. **Importar NÃO cria tarefa**; a tarefa só nasce aqui.
- **Memorizar** = **promover** (não mover) pontos importantes (o artigo fica em Ler E aparece aqui); revisão espaçada; fontes = PQ da IA / suas anotações / mapa de incidência.
- **Treinar** = drill C/E‑diff · cloze · súmula‑duelo, **sobre o texto exato**.
- **Raio‑X** = acompanhamento + estatísticas.

**Importar — ASSIMETRIA (decidida):**
- **Lei** → só **texto exato**: **Buscar no Planalto** (desktop/Tauri, sem CORS) **ou colar‑com‑formatação**. Sem OCR, sem IA adivinhando. **Catálogo de leis** (num botão "Adicionar/Importar lei", não na tela) + link avulso.
- **Jurisprudência** → a **IA pode extrair teses** (paráfrase, menos crítica; validado: 7 teses do informativo).

**Revogado (achado real no HTML do CDC):** o Planalto marca revogado com **`<strike>`** (16 no CDC) e **ZERO "(Revogado)" em texto** → **colar texto puro apaga o revogado**. Logo, detectar via **`<strike>`/`<s>`/`<del>`** (busca/colar‑com‑formatação) + marcador textual como backup. No preview, cada suspeito: **Manter riscado (revogado) · Excluir · Está vigente (foi engano)**. **Revogado fica FORA do estudo** (sem opção de incluir/gerar questão — cortado).

**Planalto (desktop):** busca **1× ao adicionar** + **sob demanda** ("Conferir atualização") + **opcional a cada 30 dias**. Guarda o texto → estuda **offline**. Parser: separar por **"Art. Nº"** + detectar `<strike>`. **Degradação graciosa:** se o link quebrar depois, avisa e você fornece novo — **os treinos/cloze/memória já gerados permanecem** (app já alimentado). Base = colar sempre funciona; Planalto é conveniência sobre ela.

**Novidade legislativa (versão ESTÁVEL):** na reconsulta, **diff mecânico por hash de artigo** (determinístico: "art. 12 mudou · 15 novo · 8 revogado"); texto normalizado p/ ruído de parser não virar falso positivo; é **sugestão para revisar**, não aplicada sozinha; vira **treino** (selo "novidade"). Aviso de 30 dias no **"Mentor sugere" (Hoje)** + painel do Mentor + banner na aba Ler. → **Interpretação da mudança pela IA: CORTADA** (só o diff mecânico é confiável).

**Testabilidade:** a máquina **alcança o Planalto** (200, HTML do CDC baixado) → eu **valido o PARSER contra HTML real**. Não consigo pilotar a janela Tauri → **a busca in‑app você valida no desktop** antes de publicar.

**Cortado do escopo:** OCR de lei · novidade‑legislativa interpretada por IA. **Perf:** `vinculosDaIndicacao` O(n²) → mapa; geração/embeddings preguiçosos.

**Ordem:** (1) base estável (5 abas + Ler link/anotações + colar‑com‑formatação/revogado + metas cruas + perf) · (2) parser Planalto testado + busca Tauri (você valida no desktop) · (3) novidade por diff mecânico.

---

> Status: **APROVADO** · reescrito depois de auditar o código de verdade (2ª rodada, mais honesta).
> Ideias: app https://app.decorandoaleiseca.app/ (auditado logado). Código: `leiseca.js`, `store.js`, `ia-provider.js`, `pratica.js`.
> Regra de ouro: **não mantemos banco curado. O usuário fornece a fonte; a IA gera sob demanda.**
> Finalidade deste plano: **melhorar o que existe** e **criar o que não existe** — não reconstruir.

---

## 0. Retrato do módulo atual (o que existe hoje)

Módulo `src/screens/leiseca.js` (`renderLeiSeca`/`renderJurisprudencia`), rotas `leiseca`/`jurisprudencia`, modelo `state.indicacoes`. Duas abas: **Metas** (ler/cumprir → vira missão) e **Memorizar** (recall espaçado auto-avaliado).

`indicacao = { id, tipo:'lei'|'juris', modo:'meta'|'memoria', referencia, texto, observacao, disciplinaId, topicoId, tribunal, categoria, lido, pq, pqIncidencia, revisao, criadoEm }`. **Guarda só texto (nunca PDF).**

---

## 0.5. Decisão de arquitetura — onde mora a importação/texto?

**Pergunta:** o texto importado (lei/súmula/tese) fica em **Materiais** (`documentos`) ou na própria **Lei Seca/Jurisprudência** (`indicacoes`)?

**Opinião (recomendação): mora na Lei Seca/Jurisprudência, fatiado em unidades (`indicacoes`).** Princípio:
- **Materiais** = o que você **lê como documento** (apostila, PDF de teoria).
- **Lei Seca/Jurisprudência** = o que você **decora/treina em unidades discretas** (artigo, súmula, tese).

Uma lei você **treina artigo por artigo**, não lê linearmente como apostila → o lugar natural é Lei Seca. Motivos:
1. **Tudo downstream já vive lá:** metas, memória, PQ/incidência, revisão, flashcards, questões e o novo **Treinar** operam sobre `indicacoes`, não sobre `documentos`.
2. **Leve:** indicação é **texto-only** (nunca PDF); pôr a lei em Materiais + fatiada em indicações = **texto em dobro** e volta o "peso" que decidimos evitar.
3. **Unidade de estudo = a indicação** (o artigo/súmula). Sem indireção.

**Duas pontes (para não perder as forças de Materiais):**
- **Extrair de material existente:** manter o caminho `extrairIndicacoesDeDoc` — se a lei/apostila já está em Materiais, dá para extrair as indicações dela. Materiais→Lei Seca é ponte, mas a **casa canônica** da lei estudada é Lei Seca.
- **Busca/RAG:** indexar o texto das `indicacoes` nos embeddings (hoje só `documentos` são indexados) — assim Lei Seca ganha a "pesquisabilidade" de Materiais sem morar lá.

**Informativo (decidido):** fica **na Jurisprudência**, como tudo o mais — nada vai para Materiais. Lei na Lei Seca; jurisprudência (incl. informativos) na Jurisprudência. O informativo entra como `indicacoes` (a leitura corrida pode ser um item de meta de leitura; as teses são as unidades de treino).

---

## 1. AUDITORIA item a item (do plano teórico × realidade)

Legenda: ✅ existe e completo · 🟡 existe mas incompleto (melhorar) · ❌ não existe (criar).

| # | Item planejado | Status | Veredito honesto |
|---|---|---|---|
| A | Tela Lei Seca/Jurisprudência, filtros, impressão, tribunal/categoria, marcação | ✅ | Completo. Não mexer. |
| B | Metas (ler → missão) | ✅ | Completo para "ler". |
| C | **Importar a LEI INTEIRA** (colar/PDF de uma lei → 1 artigo por unidade com texto) | ❌ | **Não funciona.** `prepararIndicacoes` é para **listas** de referências; lei em texto corrido vira lixo (a linha inteira vira "referência") e o fallback IA (`estruturarLeiSeca`) **só dispara se o parser devolve zero** — não dispara. **É pré-requisito do drill** (drill precisa do texto do artigo). |
| C-juris | **Importar JURISPRUDÊNCIA em massa** (informativo inteiro, "todas as súmulas de um tribunal", resumo de teses → 1 unidade por súmula/tese com texto) | ❌ | **Mesmo furo, e eu tinha esquecido.** O parser de juris também é **lista-only** (Súmula/Tema por linha). Colar um informativo corrido ou uma coletânea não vira teses/súmulas fatiadas com texto. **Pré-requisito do drill/cloze de jurisprudência.** |
| D | **Drill C/E com diff colorido** (a banca troca 1 palavra; verde=real, vermelho=trocado) | ❌ | **O diferencial.** Meta/Memorizar **não** cumprem esse papel (uma é ler, a outra é recall auto-avaliado do trecho inteiro — nenhuma testa a **letra** e a pegadinha). |
| E | Memorizar (recall espaçado) | 🟡 | Existe, mas é **auto-avaliado** (esqueci/lembrei/fácil) sobre o trecho todo. Melhoria: oferecer modo que testa a **letra** (lacuna/cloze) em vez de só "você lembra?". |
| F | **Cloze** (lacuna na letra da lei) | ❌ | Não existe. Flashcard simples de indicação existe (frente=ref, verso=texto), mas não cloze. |
| G | Provável questão a partir do item | 🟡 | Existe (`gerarQuestoesDeIndicacao` → questões **MC** no banco). Melhoria: modo **"estilo banca / provável cobrança"** e opção **C/E**, não só MC genérica. |
| H | Flashcard a partir do item | ✅ | Completo (offline). |
| I | **Incidência / PQ** (IA sugere + importar estatística + `pqIncidencia` + "PQ no topo") | 🟡 | **Dado e lógica completos.** Falta o **Raio-X visual** (heatmap/ranking) e **usar a incidência como peso** (priorizar geração/revisão/ordem pelos de alta incidência) e **descer a relevância ao nível de artigo/súmula**. |
| J | Incidência vale p/ **jurisprudência** também | 🟡 | Sim, mesma mecânica (`pqIncidencia` é agnóstico). Refino: dentro da juris, **as que caem mais vêm do dado**, não peso chapado para "repetitiva". |
| K | **Meta de leitura de informativo** (quebrar em teses; fila de releitura) | 🟡 | Meta genérica vira missão "Ler…", mas **não quebra o informativo em teses** nem vira **fila de releitura** perto da prova. |
| L | Súmula-duelo (nº/tribunal trocado) | ❌ | Variante do drill (D) para jurisprudência. |
| M | **Integração com o Mentor** | 🟡 | Parcial: `snapshotMentor` vê **revisão de lei/juris vencida** (`vencidasPorTipo`). **Não** vê "**PQ de alta incidência sem treinar**" nem "**artigos fracos no drill**". Falta esses sinais + pontos de atenção. |
| N | Sincronização (Volume, Central de Revisões, dossiê, sessão) | ✅/🟡 | Indicações já geram flashcard/questão, viram missão, entram na Central e no dossiê. **Falta** ligar o **drill** (tentativas→Caderno de Erros/acurácia + tempo→sessão) e o **Raio-X** (ler tentativas com `fonte` lei/juris). |
| O | Update com diff/changelog + descarte de PDF | 🟡 | Descarte de PDF **já é o padrão** (indicação é texto). Changelog/versionamento **não existe** — e como o "peso" caiu, vira **opcional**; entregar só "atualizado em" + **lembrete de vigência**. Crawler **descartado**. |
| P | Brainstorm: caça-erro cronometrado, diff reverso (produção), comparador de redação, "artigos-fantasma", TTS | ❌ | Extensões pós-núcleo (dependem do drill/importação). |

---

## 2. O que CRIAR (não existe)

> **Simetria lei ↔ jurisprudência + grau de literalidade (precisado com o usuário):**
> - **Literal/verbatim** → diff da **palavra trocada**, igual à lei: **artigo de lei**, **Súmula**, **tese de Tema repetitivo/repercussão geral** (todos têm redação oficial única).
> - **Paráfrase (não literal)** → **o informativo em si** (o resumo do julgado): não há redação oficial única, então o drill troca o **termo/resultado-chave** (é possível↔é vedado, competência, prazo, sujeito), e a UI **não chama de "letra"**.
> - Regra prática: o "verde/correto" é sempre **o texto salvo no item** (`ind.texto`); a literalidade só muda o rótulo e o tipo de alteração.

- **C1 — Importar a lei inteira → artigos.** Detectar "lei corrida" e **fatiar em artigos** `{referencia:"art. Nº", texto:"corpo com §/incisos/alíneas"}`. Vias: (a) **parser jurídico determinístico** (regex `Art. Nº`/`§`/incisos/alíneas quebrando o **corpo**, não a linha); (b) **IA** (`estruturarLeiSeca`, hoje subutilizada — chamar quando o texto for lei corrida, não só quando o parser zera). **Preview editável**. Pré-requisito do drill.
- **C2 — Importar jurisprudência em massa → teses/súmulas.** Simétrico: informativo inteiro / coletânea de súmulas / resumo de teses → **1 unidade por tese/súmula** `{referencia, texto, tribunal, categoria}`. Parser (nº de súmula/tema + corpo da tese) + IA + preview. Pré-requisito do drill/cloze de juris.
- **D1 — Drill C/E com diff (lei e juris).** `gerarLeiSecaCE(cfg,{texto,referencia,tipo,n,dificuldade})` → `{afirmacao, certo, trechoOriginal, trechoAlterado, justificativa}`; renderizador de diff (verde do texto guardado, vermelho no que a IA trocou); botão **"Treinar"** no item → Modo Foco C/E (`focoShellHTML`) com `registrarTentativa` + "Registrar tempo". Cache em `ind.leiSecaCE`; blindagem (`trechoOriginal ⊂ texto` e `≠ trechoAlterado`).
- **F1 — Cloze (lei e juris).** Apaga palavras-chave (numerais, prazos, verbos de comando, quóruns, "vedado/permitido"; na juris: termo/resultado-chave) → card cloze (`addFlashcard`, SM-2/Central), com preview.
- **I1 — Raio-X visual (lei e juris).** Ranqueia por `pqIncidencia` (dado pronto) — heatmap/barras por artigo/súmula, "top 20%", cruzando com acurácia (`tentativas.fonte`). Só UI.
- **L1 — Súmula-duelo.** Variante do drill **específica de juris**: nº/tribunal **trocado** (pegadinha clássica) — além do D1 sobre o conteúdo da tese.
- **T1 — Aba "Treinar" + agrupar por norma.** 3ª aba na tela (Metas / Memorizar / **Treinar**). Como importar uma lei gera muitos artigos, a lista **agrupa/recolhe por norma** (Lei 8.112 = grupo colapsável) — vale nas 3 abas. Consequência direta de C1/C2.

## 3. O que MELHORAR (existe, incompleto)

- **E→ Memorizar:** oferecer, além do "você lembra?", o modo que testa a **letra** (lacuna/cloze), ligando com F1.
- **G→ Provável questão:** direcionar o prompt para **"estilo banca / provável cobrança"** e permitir **C/E** (hoje só MC).
- **I→ Incidência como PESO:** usar `pqIncidencia` para **priorizar** — ordem da fila, cota de itens gerados e **espaçamento da revisão** (alta incidência revisita mais). Descer a relevância ao nível de **artigo/súmula**.
- **K→ Meta de leitura de informativo:** quebrar o informativo em **teses** e oferecer **fila de releitura** espaçada perto da prova.
- **M→ Mentor (passivo→ATIVO):** enriquecer `snapshotMentor` com **`pqNaoTreinada`** (PQ de alta incidência sem drill/questão) e **`artigosFracos`** (baixa acurácia no drill); novos **pontos de atenção**. Mais que ver: o Mentor **sugere** ("importe a Lei X do seu edital", "treine os 5 artigos de maior incidência", "informativo 812 parado há 10 dias") — proativo, `[[mentor_sugere_nao_executa]]`.
- **O→ Vigência (lei E juris):** campo "atualizado em" + **lembrete de vigência**. Vale para os dois: lei muda de redação; **súmula é cancelada/superada, tese é revista**. Versionamento/changelog fica adiado (opcional).
- **Gancho no plano/Hoje:** o drill precisa de **entrada na rotina** — o Mentor/Central sugere "Treinar letra da lei (art. X)" como tarefa, não só um botão escondido no item. Hoje só a **meta** (ler) e a **memória vencida** chegam ao Hoje.
- **Busca/RAG:** o texto de lei/juris importado deve ser **indexado nos embeddings** para o chat encontrar (`[[mentor_busca_semantica_antes_enlatar]]`); reindexar só o que muda no update. Hoje embeddings cobrem `documentos`, não `indicacoes`.
- **Vínculo súmula ↔ artigo:** a tese interpreta um artigo → linkar (estudar o artigo mostra a súmula, e vice-versa).
- **Chat-executor:** ações novas ("importar a Lei X", "treinar art. Y", "o que mais cai em Z") — `[[mentor_chat_executor]]`.

## 4. O que já está OK (não tocar)
Tela/filtros/impressão/tribunal/categoria (A), Metas (B), Flashcard de indicação (H), sincronização já feita de indicação↔missão↔Central↔dossiê (parte de N).

---

## PROGRESSO (execução)

- ✅ **D1 (drill C/E com diff colorido) — FEITO e testado** (2 temas, 0 erros). `gerarLeiSecaCE` (ia-provider) + `gerarTreinoDeIndicacao`/`itensTreinoDeIndicacao`/`limparTreinoDeIndicacao` + `addQuestao` c/ `treino`+`diff` (store) + renderizador de diff (`enunTreino`/`diffTreinoHTML` em pratica.js) + **3ª aba "Treinar"** (leiseca.js) reaproveitando o Modo Foco C/E (`app.navigate("pratica-ce",{focoErrosIds})`). Itens de treino excluídos da lista normal de Questões. Tentativa → Caderno de Erros/acurácia. Dados de teste deixados (ind "art. 37, caput, CF" + 2 itens).
- ✅ **C1 (importar lei → artigos) + C2 (importar juris em massa) — FEITO e testado** (0 erros). Em `store.js`: helpers `fatiarLeiEmArtigos` (detecta "Art. Nº", compõe "Art. Nº, Lei 8.112/1990" via `detectarNomeLei`), `fatiarJurisEmUnidades` (Súmula/Tema/Enunciado → deduz tribunal+categoria; SV→STF), `pareceTextoCorrido` (roteia lista × corrido), plugados em `prepararIndicacoesAuto` (corrido→fatiar→fallback IA `estruturarLeiSeca`; senão lista). Fluxo de PDF/colar+preview reaproveitado. Testado: Lei 8.112 (4 arts) e coletânea (Súmula 473/SV13/Tema 1234) → caem no preview editável → viram itens treináveis.
- ✅ **T1 (agrupar por norma/tribunal) — FEITO e testado 2 temas** (0 erros). Em `leiseca.js`: `normaDeRef` (extrai a norma do último segmento não-posicional da referência), `chaveGrupo` (lei→norma · juris→tribunal), `corpoAgrupado` (grupos recolhíveis; flat se só "Outros"), estado `gruposFechados` + handler `toggle-grupo` + CSS `.ls-grupo*`. Aplicado nas 3 abas (Metas/Memorizar/Treinar). Testado: Metas e Treinar agrupam "CF (1)" + "Lei 8.112/1990 (4)"; recolher funciona.
- ✅ **F1 (cloze) — FEITO e testado** (0 erros). `store.gerarClozeDeIndicacao` (heurística local: apaga números/prazos, quóruns, verbos de comando pode/deve/poderá/vedado…, restritivos salvo/exceto; pula o nº do próprio dispositivo) → cria flashcards qa (frente com "______", verso = palavra, selo verde) que entram no SM-2/Central. UI: ação "Cloze" (ícone puzzle) no item + handler `ger-cloze`. Testado: Art. 4º→proibida/salvo; Súmula 473→"pode" (473 corretamente ignorado).
- ✅ **I1 + I (Raio-X visual + incidência-como-peso) — FEITO e testado 2 temas** (0 erros). 4ª aba **"Raio-X"** (`raioXCorpoHTML`/`raioXItemHTML` em leiseca.js): ranking por `pqIncidencia` com barra colorida por banda (alta≥70/média≥40/baixa), cruzado com precisão (tentativas do treino), flag **"reforçar"** (alta incidência + precisão<60%), atalho Treinar, top-20% e nota dos sem-incidência. Incidência-como-peso: Treinar e Raio-X ordenam por `porIncidencia` (pqIncidencia desc). CSS `.raiox-*`.
- ✅ **M (Mentor ativo) — FEITO e testado** (0 erros). `store._panoramaLeiSeca()` (alta incidência sem treinar + dispositivos fracos <60% c/ ≥3 tentativas) → campo `leiSeca` no `snapshotMentor` + 2 pontos de atenção em `_pontosBrutos` (ls-pq→"Abrir Raio-X" · ls-fraco→"Treinar") + prompt de `analisarProgresso` instruído a usar `leiSeca`. Navegação com **aba** (`ponto-acao` passa `data-aba`; leiseca.js lê `app.params.aba`→abre Raio-X/Treinar). Testado: ponto "1 ponto de alta incidência sem treinar: Art. 1º…" + CTA abre direto a aba Raio-X.
- ✅ **G (provável-questão estilo-banca + C/E) — FEITO e testado com IA AO VIVO** (0 erros). `gerarQuestoesDeIndicacao(id,n,dif,formato)` ganhou `formato` (mc/ce → usa `gerarQuestoesCE` mapeando p/ addQuestao ce) + contexto "PROVÁVEL COBRANÇA no estilo da banca". UI: `ger-questao` pergunta MC/CE (`escolher`) antes da quantidade. Testado: art.37 CF → 3 questões C/E reais (impessoalidade/rol de princípios/EC 19), formato ce, ref+fonte corretas, na aba Questões C/E. Confirmou que a IA do ambiente gera (vale p/ D1/cloze também).
- ✅ **L1 (súmula-duelo) — FEITO e testado** (0 erros, 100% LOCAL sem IA). `store.gerarSumulaDueloDeIndicacao(id)` (juris): 1 Certo + nº trocado (+1) + tribunal trocado (STF↔STJ), como itens de treino C/E com diff (trechoOriginal=correto, trechoAlterado=errado). `addQuestao` ganhou `duelo`; `itensDueloDeIndicacao`. UI: botão **"Duelo"** (scale) nos itens juris do Treinar + handler `duelo-item`→foco. Testado: Súmula 473 → "474 do STF" (diff 474→473) e "473 do STJ" (diff STJ→STF), cai no Caderno de Erros.
- ✅ **E (Memorizar pela letra) — FEITO e testado** (0 erros, 100% LOCAL). Refatorada a seleção de lacunas p/ `selecionarLacunas(texto,max)` (reusada por cloze) + `store.lacunasDeIndicacao(id)`. UI: ação **"Testar pela letra"** (eye) só no modo Memória → modal `testeLetraHTML` (texto com lacunas nas palavras-chave) + "Revelar" (preenche em verde). A graduação segue nos botões esqueci/lembrei/fácil do item. Testado: Art. 4º → lacunas em "proibida"/"salvo" → Revelar preenche verde. CSS `.teste-letra`/`.tl-lac`.
- ✅ **Busca/RAG (indexar indicações) — FEITO e testado com IA AO VIVO** (0 erros). `fontesIndexaveis` passou a incluir as `indicacoes` c/ texto (tipo "leiseca"/"juris", título=referência+tribunal) → entram no pipeline genérico de embeddings/busca sem mudanças; `origemDoItem` rotula "Lei Seca:"/"Jurisprudência:"; label do seletor em documentos.js atualizado. Testado: 8 indicações aparecem como fontes (5 Lei Seca + 3 Juris); indexei art.37 CF (gemini-embedding-001, vetor 768d); busca semântica "princípios da administração" retornou "Lei Seca: art. 37, caput, CF" afinidade 75%. Chat/RAG agora acha os importados.
- ✅ **Vínculo súmula↔artigo — FEITO e testado** (0 erros). `store.vinculosDaIndicacao(id)` detecta automático por referência: juris que cita "art. N" (mesma norma) ↔ indicação de lei correspondente. UI: linha `.ls-vinculos` (ícone link) no `itemHTML` ("Interpreta:" na juris · "Jurisprudência relacionada:" na lei) com chips clicáveis + handler `ir-vinculo`→navega c/ focoIndicacaoId (store passado por listaCorpoHTML→itemHTML). Testado nos 2 sentidos: art.37 CF ↔ Súmula Vinculante 43 (cita art.37,II,CF); clique navega.
- ✅ **O (vigência) — FEITO e testado** (0 erros). Campo `vigenciaEm` na indicação; `store._panoramaVigencia(6)` (normas de lei cuja conferência mais recente = `vigenciaEm||criadoEm` passou de ~6 meses, por norma via `normaDaReferencia`) → ponto de atenção `ls-vigencia` no Mentor ("Confira a vigência (faz N+ meses): Lei X"); `store.marcarVigenciaConferida(id)` marca todos os artigos da norma como conferidos hoje. UI: ação "Conferi a vigência" (alarm-clock) nos itens de lei + selo "vigência DD/MM" no rodapé. Testado loop: envelheci Lei 8.112 → Mentor avisou → "Conferi a vigência" → aviso sumiu + selo apareceu.
- ✅ **K (informativo em teses) — FEITO e testado com IA AO VIVO** (0 erros). Nova função `extrairTesesInformativo(cfg,{texto})` (ia-provider) + `store.quebrarEmTeses(id)` (juris, texto>120): a IA separa a narrativa do informativo em teses individuais → cada uma vira indicação (referência + tribunal + tese), mantendo o informativo original como meta de leitura. UI: ação "Quebrar em teses" (list-checks) em itens juris com texto>300. Meta de leitura (missão "Ler…") e releitura espaçada (modo Memória) JÁ existiam. Testado: Informativo 812 (prosa, 3 julgados) → 3 teses (REsp 1.999.999/penhora salário, REsp 1.888.888/prescrição, HC 700.000/reincidência), agrupadas por tribunal.

## ✅ REDESIGN v2 das telas Lei Seca/Jurisprudência + gaps (FEITO e testado, 0 erros):
- **3 abas** (era 4): **Acervo** (funde Metas+Memorizar com seletor *Todos·A cumprir·Memorizando*) · **Treinar** (toda a prática: C/E diff + Testar-letra + Súmula-duelo) · **Raio-X** (com **Treinar top 20%**). `acervoCorpoHTML` reusa `listaCorpoHTML`.
- **Menu "..." reagrupado** em Estudar · Gerar · Organizar (divisórias `.ls-mais-sep`).
- **Cloze unificado** em "Testar pela letra" (inline + botão "Salvar como flashcards"); botão Cloze avulso removido; Testar disponível p/ qualquer item com texto.
- **Correções:** ícone da vigência → `calendar-check` (fim da colisão com Programar revisão); rodapé com **1 carimbo**; barra por aba (Raio-X sem Adicionar/Ordenar); "Ordenar: PQ no topo" **removido** (redundante); impressão corrigida (escopo A cumprir/Memória/Ambos, sem "modo atual" errado).
- **Gaps do plano:** `guia.js` seção Lei Seca/Juris atualizada (3 abas, importar, drill/cloze/duelo, Raio-X, vigência, quebrar-teses); **chat-executor** ganhou `treinar_letra`/`raiox_letra` (ia-provider + chat-acoes). CSS `.acervo-seg`/`.seg`.
- Testado: 3 abas + seletor + menu agrupado + Testar unificado + Treinar top 20% (entrou no foco) — 0 erros, 2 temas.

## ✅ PLANO 100% CONCLUÍDO (todos testados, 0 erros, dados de teste preservados p/ validação do usuário):
D1 (drill diff) · C1/C2 (importar lei/juris) · T1 (agrupar) · F1 (cloze) · I1/I (Raio-X + incidência-peso) · M (Mentor ativo) · G (provável-questão banca/CE) · L1 (súmula-duelo) · E (Memorizar pela letra) · Busca/RAG · Vínculo súmula↔artigo · O (vigência) · K (informativo em teses).

## 5. Fases (reais)

1. **C1 (importar a lei → artigos)** + **D1 (drill C/E diff)** — andam juntos (o drill precisa do texto do artigo). É o núcleo e o diferencial. *(D1 ✅ feito; C1 pendente.)*
2. **F1 (cloze)** + **E** (Memorizar testa a letra) + **G** (provável questão estilo banca/C-E).
3. **I1 (Raio-X visual)** + **I** (incidência como peso) + **M** (Mentor puxa a Lei Seca).
4. **K** (informativo em teses + releitura) + **L1** (súmula-duelo).
5. **Opcional:** **O** (vigência) e brainstorm (P).

---

## 6. Sincronização — deltas reais (o resto já está costurado)

- **Drill (D1):** tentativas → Caderno de Erros + acurácia (`registrarTentativa`); tempo → sessão ("Registrar tempo"); **anti-duplicação** (não somar `qAcertos` na sessão).
- **Mentor (M):** `snapshotMentor` + `_pontosBrutos` ganham sinais de PQ/drill.
- **Raio-X (I1):** lê `tentativas.fonte` + `pqIncidencia`.
- **Central de Revisões:** cloze (F1) e Memorizar-por-letra (E) entram no motor SM-2 já existente.
- **Guia** (`src/guia.js`): seções de importar-lei e drill. **Impressão:** fundo branco. **Selos:** 🤖/📖.
- **Multi-perfil (adiado):** `leiSecaCE`/cloze nascem por-perfil quando sair.

## 7. Riscos
- **Importar lei:** parser jurídico + IA + **preview editável** (rede humana); piloto com CF/CC/CPC.
- **Alucinação no drill:** verde vem do texto guardado; validar span; "Reportar erro".
- **Cota:** geração preguiçosa + cache (`ind.leiSecaCE`).

## 8. Autocrítica (me questionei depois de concluir)

- *"Cobri importar TODAS as fontes que o usuário citou (lei, jurisprudência, resumo de teses, informativo, súmulas de um tribunal)?"* → Não na 1ª conclusão (só lei). **Corrigido: C1 (lei) + C2 (juris em massa).**
- *"O drill/cloze/melhorias são simétricos lei↔juris?"* → Estavam só como "lei". **Corrigido: D1/F1/E/G valem para os dois, com a nuance de que a tese não é verbatim.**
- *"O Mentor só VÊ ou também SUGERE?"* → Só via. **Corrigido: Mentor ativo (sugere importar/treinar).**
- *"O texto importado fica pesquisável no chat?"* → Não (embeddings só de `documentos`). **Adicionado: indexar `indicacoes`.**
- *"Update/vigência vale para súmula cancelada/tese revista?"* → Faltava. **Adicionado.**
- *"O drill entra na rotina (Hoje/plano) ou é só um botão perdido?"* → Era botão perdido. **Adicionado gancho no plano/Hoje.**
**Decisões (fechadas com o usuário):**
- **Onde o drill mora:** ✅ **3ª aba "Treinar"** na tela (ao lado de Metas / Memorizar).
- **Tese de juris × diff (resolvido, não era bloqueio):** o "verde/correto" é SEMPRE **o texto que o usuário salvou** (`ind.texto`) — para lei é verbatim, para tese é a versão salva. O drill altera esse texto e destaca a mudança. Súmula tem texto oficial → funciona como lei. Tese (paráfrase) → o drill troca o **termo/resultado-chave** (é possível↔é vedado, competência, prazo, sujeito), e a UI **não chama de "letra da lei"** na juris. Sem obstáculo real.
- **Lei grande (ex.: 250 artigos):** importar vira 250 **artigos-unidade** (leve, só texto). O drill **NÃO gera tudo de uma vez** — gera **sob demanda** (só o artigo que você vai treinar) + cache, **priorizando** os do **edital** e de **maior incidência** (`pqIncidencia`). Nunca estoura cota.

**Novos achados (3ª rodada de autocrítica):**
- **Agrupar por NORMA (UX):** uma lei inteira = 250 itens numa lista plana fica impraticável. A tela precisa **agrupar/recolher por lei** (Lei 8.112 como grupo colapsável) — consequência direta do C1. **Novo item a criar.**
- **Marcação tricromática alimenta o gerador:** as palavras que o usuário grifa (prazos, termos restritivos) **são exatamente as que a banca troca** → usar as marcações como dica para a IA gerar a alteração. Sinergia que melhora a qualidade do drill.
- **Drill "refazer os errados":** o Modo Foco já tem esse padrão (`refazer`) — o drill deve reaproveitá-lo (loop nos artigos que você erra).

_Reescrito e ancorado no código em 2026-07-06 (3ª rodada — + jurisprudência, + autocrítica)._
