# Plano — Sub-projeto TAG TEMÁTICA por artigo

> Classificar cada artigo por **tema transversal** (Prazo, Competência, Quórum, Pena, Prescrição, Vedações…) para destravar: **Memorizar temático** (estudar/treinar só um tema), **inteligência** ("você erra sempre em Prazos → reforce"), **estatística por tema** e **estudo de um tema através de várias leis**.
>
> Princípio: **integrar, não recriar** — ~70% já existe no código.

---

## 1. O que JÁ existe (inventário — NÃO refazer)

**Dado**
- `indicacao.temas: string[]` — campo persistido e sincronizado (store.js:3083). Máx. 6 tags/artigo.

**Classificação**
- `classificarTemasTexto(texto)` (store.js:489) — tagger **OFFLINE/instantâneo** por regex. Taxonomia atual = 11 temas em `TEMAS_REGRAS` (store.js:476): Prazo · Competência · Quórum · Valores e multas · Pena · Prescrição e decadência · Vedações · Direitos e garantias · Requisitos e condições · Procedimento e recursos · Princípios.
- `classificarTemasLote(ids)` (store.js:3179) — roda o tagger offline em lote.
- `classificarTemasIA(ids, contexto)` (store.js:3191) + `iaProv.classificarTemas` (ia-provider.js:1258) — refino por IA (cap 40, mescla com o offline). **EXISTE mas está ÓRFÃO — não há botão que o chame.**

**Uso (Estudar)**
- Seletor de escopo **"Tema (N)"** (dropdown) → `estudarTemaSel` filtra a geração/drills por tema (`noEscopo` em leiseca.js:2821).
- `temasDisponiveis(ids)` (store.js:3209) — temas presentes no escopo, ordenados por frequência.
- `temasComErro(tipo)` (store.js:3219) — cruza erros × temas → onde o aluno mais erra.
- `temaPerf` — acerto por tema no bloco **Estatísticas da lei**.
- Recomendação **"Reforce [tema fraco]"** + ação `estudar-tema-fraco` (leiseca.js:1084) + chip no painel proativo "O Mentor sugere".
- Botão **"Classificar por tema"** no menu ⋯ do leitor (`ler-temas`, leiseca.js:2632) → roda só o tagger **OFFLINE**.

---

## 2. Gaps para virar "real"

1. **Auto-tag na importação** — hoje o artigo entra SEM tema; o usuário precisa rodar "Classificar por tema" à mão. → chamar `classificarTemasLote` ao aceitar/importar artigos com texto (offline, custo ~zero).
2. **Ligar o refino por IA** — `classificarTemasIA` está órfão. Expor **"Refinar temas com IA"** (menu ⋯ do leitor), com loading (`comOcupado`), mesclando com o offline.
3. **Memorizar temático REAL** — hoje "tema" é só um filtro de escopo. Falta um **atalho/modo dedicado**: escolher um tema e cair direto no motor (C/E · Completar · gerar) **com o tema no cabeçalho** e a fila só daquele tema. (Reusar `iniciarCE`/`abrirCompletarArtigo`/geradores com o escopo já filtrado.)
4. **Ver/editar tags do artigo** — o tagger erra; falta UI para ver as tags e **adicionar/remover manualmente**. Store novo: `setTemasArtigo(id, temas)`; UI: chips no menu ⋯ do artigo (ou no editar).
5. **Taxonomia por matéria** — `TEMAS_REGRAS` é genérico. Constitucional (controle de constitucionalidade, remédios constitucionais, organização dos poderes), Penal (tipos, dosimetria, extinção da punibilidade), Civil/Proc. (negócio jurídico, recursos) têm temas próprios. → base global + conjuntos por matéria (detecta disciplina/lei) **ou** deixar a IA cobrir o fino.
6. **Tema ATRAVÉS de leis (cross-lei)** — estudar "Prazos" juntando CPC+CPP+CP. Hoje o escopo é uma lei só. → permitir escopo-tema = todas as leis.
7. **Tag visível no leitor** — mostrar chips de tema no artigo e **filtrar o leitor por tema** (hoje só no Estudar).
8. **Curadoria da heurística** — reduzir falsos positivos (ex.: "Direitos e garantias" casa em quase tudo que tenha a palavra "direito"; "Vedações" e "Requisitos" são amplos).

---

## 3. Decisões a confirmar (§ do usuário)

1. **Taxonomia**: conjunto ÚNICO global × conjuntos POR matéria? — *recomendo: base global + IA adiciona os finos por matéria.*
2. **Auto-tag**: rodar o offline SEMPRE ao importar (barato) e oferecer o refino por IA sob demanda? — *recomendo sim.*
3. **Memorizar temático**: modo novo dedicado × atalho que pré-filtra o escopo e abre o motor existente? — *recomendo o atalho + cabeçalho do tema (reusa o motor, menos superfície).*
4. **Edição manual de tags**: no menu ⋯ do artigo (chips add/remove) — confirmar o local.
5. **Cross-lei** entra já na F2 ou fica para depois?

---

## 4. Fases

### F1 — Fechar o que já existe (rápido · alto valor)
- Auto-tag **offline** ao importar/aceitar artigos com texto (`aceitarIndicacoes`/`addIndicacao`).
- Ligar **"Refinar temas com IA"** (menu ⋯ do leitor) → `classificarTemasIA(idsDoEscopo)` com loading + toast do nº refinado.
- Feedback claro no "Classificar por tema" (quantos ganharam tema).

### F2 — Memorizar temático real
- **Atalho "Estudar o tema X"**: a partir do dropdown de tema OU de um chip do painel proativo, fixa `estudarTemaSel` e abre o motor (C/E/Completar/gerar) com **cabeçalho do tema** e fila só daquele tema.
- Opção **cross-lei** (tema em todas as leis) no seletor de tema.

### F3 — Curadoria + edição manual + tema no leitor
- `setTemasArtigo(id, temas)` + UI de chips (add/remove) no menu ⋯ do artigo.
- Revisar `TEMAS_REGRAS` (reduzir falsos positivos; regex mais específicas).
- Mostrar **chips de tema** no artigo do leitor + **filtro do leitor por tema**.

### F4 — Taxonomia por matéria + IA + estatística rica
- Conjuntos de temas por disciplina (constitucional/penal/civil/administrativo…); prompt da IA melhorado por matéria.
- Estatística por tema enriquecida: **evolução por tema**, **esquecidos por tema**, nível de domínio por tema.

---

## 5. Riscos / notas
- **Falsos positivos** da heurística → prioridade curar `TEMAS_REGRAS` na F3.
- **Cota de IA** no refino → cap 40 + sob demanda (nunca automático em massa).
- **Sync**: `temas` já é campo persistido → sem churn adicional.
- **Retrocompat**: artigos sem `temas` continuam funcionando (filtro por tema só aparece quando há temas).
