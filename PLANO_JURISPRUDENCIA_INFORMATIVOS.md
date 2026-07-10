# Plano — Paridade da Jurisprudência (C) + Extração de Informativos (D)

> Status: **PLANEJAMENTO** (nada implementado). Base: auditoria do código (leiseca.js, store.js, ia-provider.js).

## 0. Descoberta que muda o enquadramento

**Lei Seca e Jurisprudência são a MESMA tela** (`src/screens/leiseca.js`, 3590 linhas), parametrizada por `tipo` (`"lei"` | `"juris"`): `renderLeiSeca` (:738) e `renderJurisprudencia` (:741) chamam o mesmo `renderIndicacoes(tipo)`. Os dados vivem em `state.indicacoes` (cada item tem `tipo`). Consequência: **a maior parte da "paridade" já existe** — a tarefa C é, na prática, **desbloquear** o que ficou preso em `tipo === "lei"` e **adaptar** o que é hierárquico (artigos) ao domínio de súmulas/teses. E a tarefa D já tem um **extrator de informativo implementado e ligado** — falta enriquecer.

---

## PARTE C — Paridade da Jurisprudência

### C.1 Já compartilhado (só verificar/polir — NÃO reimplementar)
C/E estilo banca com diff (`gerarLeiSecaCE`), completar/cloze (`gerarClozeDeIndicacao`), revisão espaçada (`memoriasParaRevisar`), incidência/PQ (`abrirMarcarPQ`), gerar flashcards/questões do escopo, importar (colar/PDF/extrair de material) com **preview editável** (`abrirAdicionarIndicacao` + `indPreviewHTML`), meta de leitura, leitura em foco/grifo/nota/perguntar-IA, refazer erros/caderno, **súmula-duelo** (já juris-only), vínculo súmula↔artigo (`vinculosDaIndicacao`).
→ Ação: passada rápida de QA no ramo `juris` de cada um, corrigir arestas. Sem construir nada novo.

### C.2 A DESBLOQUEAR (hoje lei-only, faz sentido em juris) — o núcleo do trabalho
1. **Estatísticas do módulo** (`statsHTML`, guardado por `tipo==="lei"`): "% dominado / a revisar / desempenho por tema / evolução 14 dias" — vale igual para súmulas. Trocar a trava por um cálculo agnóstico de `tipo`.
2. **"O Mentor sugere"** (`sugereHTML`) e **Memorizar por tema** (`temaChipsHTML`): o motor de temas (`ind.temas`) já popula em juris; só liberar a UI.
3. **Revisar grifos** (`estudar-grifos`): grifo já funciona em juris (`lf-grifar`); a trava é só a checagem lei-only.
4. **Escopo de estudo adaptado**: hoje o escopo é lei/seção/artigo/tema. Em juris, trocar "seção/intervalo de artigos" por **tribunal / categoria / ano / tema**. (Reusar `chaveGrupo`/`corpoAgrupado` que já agrupam por tribunal-categoria.)
5. *(Opcional)* **Conferir vigência da súmula** (análogo a `abrirConferirAtualizacao` da lei): marcar cancelada/superada/tese revista. O dado (`revogado`/`ano`) já existe; faltaria a UI. Sem fonte oficial raspável, seria **semi-manual** (o usuário confirma).

### C.3 NÃO portar (domínio incompatível)
Árvore/índice hierárquico de artigos (`renderLeitorArvore`, `garantirScrollSpy`), importador do Planalto + detecção `<strike>` de revogado, intervalo de artigos (`parseIntervaloArt`). O análogo correto em juris **já existe**: agrupar por **tribunal/categoria** (`corpoAgrupado`).

### C.4 Índice de indexação (a dúvida do usuário)
Hoje o seletor "quais materiais indexar na busca por significado" (tela Materiais) lista Lei Seca/Jurisprudência **artigo por artigo** (já agrupado em blocos recolhíveis — feito). Proposta de paridade: **cada módulo dono do seu índice** — Lei Seca e Jurisprudência ganham um botão "incluir na busca por significado (IA)" opt-in, com aviso de custo (1 trecho = 1 requisição); "Materiais" fica só com materiais/resumos. (decisão §Decisões-3)

---

## PARTE D — Extração automatizada de Informativos (STF/STJ)

### D.1 O que JÁ existe e está ligado (caminho feliz)
- `extrairTesesInformativo(cfg,{texto,n})` — **ia-provider.js:1096**. De um informativo em PROSA, devolve `{itens:[{referencia, texto, tribunal, categoria}]}` (tese fiel 1–2 frases por julgado).
- Plugado em `store._estruturarProsa` (store.js:4106) → acionado pelo fluxo **Importar** da Jurisprudência (`abrirAdicionarIndicacao`, leiseca.js:2062) quando o texto é prosa.
- Também `store.quebrarEmTeses(id)` (store.js:4490): um informativo salvo como "meta de leitura" vira N teses individuais (`quebrar-teses`, leiseca.js:3434).
- Entrada por **PDF/imagem**: `extrairTextoArquivo` (ia-provider.js:1535, Gemini Vision) via `ligarImportArquivo` (pdf.js:279) + arrastar/anexar. Preview editável genérico (`indPreviewHTML`) + `aceitarIndicacoes`.
→ Ou seja: **colar/anexar um informativo → extrai os julgados → preview → salva na Jurisprudência JÁ FUNCIONA.**

### D.2 O que falta (melhorias) — o trabalho real do D
1. **Campos ausentes** no modelo e no prompt:
   - `ramo` do direito (Penal/Administrativo/…) — hoje cai em `temas`/`categoria`. Adicionar ao prompt de `extrairTesesInformativo` e ao item (`addIndicacao`, store.js:3131).
   - `dataJulgamento` / número do processo (recurso) — hoje embutido em `referencia`/`texto`.
   - Número do **informativo** (ex.: "Informativo 812 STF") — agrupador do lote.
2. **Agrupador `infoId`**: ligar as teses filhas ao "Informativo 812" (hoje `quebrarEmTeses` mantém o pai como meta, mas sem vínculo estruturado). Permite filtrar/estudar "por informativo".
3. **Preview específico de informativo**: mostrar ramo/tribunal por julgado, **deduplicar**, marcar "isto não é tese/é ruído", escolher quais salvar. Hoje reusa o preview genérico (já tem Tribunal/Categoria; falta ramo/data).
4. **Escolha de escopo na extração**: nº de teses, só um tribunal, só um ramo.

### D.3 TESTE DE VIABILIDADE (feito 2026-07-09) — o que significa "automatizada"

**Testei as fontes reais (arquivos do usuário + os sites).** Resultado:

| Fonte | Extração do arquivo (a) | Busca automática do site (b) |
|---|---|---|
| **STJ** | ✅ **PROVADO** — `extrairTesesInformativo` já extraiu as 3 teses do Tema 1357 (ref./tese/tribunal/categoria) do informativo real. Fonte é quase um formulário (PROCESSO/RAMO DO DIREITO/TEMA/DESTAQUE rotulados) → dá até p/ parser determinístico. | ✅ **VIÁVEL** — feed **Atom público** `processo.stj.jus.br/jurisprudencia/externo/InformativoFeed` retorna 200/344KB com `<entry>` por informativo (nº, data, link INFJ0894…). Legítimo (feed público). Novos via feed; antigos idem. Export HTML/PDF/RTF por informativo + lote. |
| **STF** | ✅ estruturado (SUMÁRIO→órgão→ramo→título→processo; "Resumo:" = tese). IA extrai bem. | ⚠️ **PARCIAL** — o site retorna 403 a cliente sem User-Agent de navegador; **com UA vira 200** (72KB), MAS o conteúdo do julgado vem paginado por `verTexto.asp?...&pagina=` (site IE10-era, dinâmico). Dá p/ chegar, mas é frágil. Fallback confiável: **export HTML manual** (o usuário gera). |
| **DOD** (Buscador Dizer o Direito) | ✅ dos ARQUIVOS que o usuário baixa (versão "em revisão" e "em tabela": RAMO / tese / caso / fundamentos). | ❌ **NÃO** — produto pago com login; raspar = violar ToS (mesma regra do Qconcursos). Só a partir dos arquivos do usuário. |

**Conclusão / arquitetura recomendada (HÍBRIDA):**
- **Núcleo = extração assistida (a)**: o usuário fornece o informativo (cola texto, anexa PDF, ou o HTML exportado do STF/STJ), e a IA extrai tudo, rico e em lote. Já 80% pronto + enriquecer campos (D.2). Funciona p/ STF/STJ/DOD, zero ToS. **É o caminho principal.**
- **Bônus = auto-fetch do STJ via feed Atom (b)**: o app lê o feed público do STJ, mostra os informativos novos e importa com 1 clique → extrai. Legítimo e limpo. (Opcional, fase posterior.)
- **STF auto-fetch**: só best-effort (com UA); na prática, o usuário exporta o HTML e o app extrai. **DOD**: nunca raspar; só arquivos do usuário.
- Assim atende seu pedido: "novos → automático" (STJ via feed; STF/DOD via export que você gera) e "antigos → eu indico" (arquivo/HTML), sem risco jurídico.

### D.4 Auditoria do Buscador Dizer o Direito (referência de UX para a Jurisprudência)
9.600+ julgados; **18 ramos** do direito → subcategoria → assunto. Busca: texto, booleana (E/Ou), frase exata, **por Lei/Artigo** (40+ leis). Filtros: categoria/subcategoria/assunto, lei+artigo, tribunal (STF/STJ/ambos), ano, "novo entendimento", vinculados-a-informativo × toda-base, favoritos, lidos/não-lidos, ordenação (recente/relevância). Por item: **marcar lido, favoritar, adicionar aos cadernos, ver julgado**. Estudo: podcast, enciclopédia, simulados, IA, "Meus Cadernos". SEM flashcards/questões gamificados. → **Nosso diferencial possível**: o Mentor já tem flashcards/C-E/cloze/revisão espaçada/simulado; a paridade da Jurisprudência (Parte C) + filtros por ramo/tribunal/ano deixaria o módulo à altura do DOD, com o plus de gerar estudo ativo.

---

### D.5 Refinamentos (feedback do usuário, 2026-07-09)

**a) MÚLTIPLAS ENTRADAS — PDF continua sendo primeira classe (DOD é sempre PDF):** as facilidades novas NÃO tiram o envio de arquivo. Formas de entrada, todas caindo no mesmo extrator híbrido:
  1. **PDF / imagem** (upload ou arrastar) — **entrada principal do DOD** (versões "em revisão" e "em tabela") e também serve p/ STF/STJ em PDF. Reusa `extrairTextoArquivo` (Vision) / pdf.js.
  2. **Link HTML** — STF `www.stf.jus.br/arquivo/informativo/documento/informativoNNNN.htm` (testado ✅ 200/183KB com User-Agent; melhor que imprimir PDF, pois preserva a estrutura); STJ export HTML.
  3. **Colar texto** (já existe).
  4. **Feed Atom do STJ** (auto, bônus).
  **Ressalva técnica DOD "em tabela":** é uma TABELA em colunas (RAMO | tese | caso | fundamentos) em 37 páginas — o texto do pdf.js EMBARALHA colunas (mesmo problema das 2 colunas que já resolvemos em Materiais). Para o DOD tabela, extrair via **Visão** (`extrairTextoArquivo`, que lê a página como imagem e respeita a tabela) OU aplicar leitura por coluna. O DOD "em revisão" é linear (1 julgado por vez) → pdf.js basta. **Regra: para o link `.htm` do STF, limpar o lixo `mso`/Word antes de extrair.**

**b) Extração = HÍBRIDA (determinístico + IA), NÃO só IA:** primeiro um **parser determinístico** (grátis, sem cota): STJ tem campos rotulados (PROCESSO/RAMO/TEMA/DESTAQUE) e STF tem marcadores fixos ("Resumo:", ramo em CAPS, ADI/ADPF nº) → extrai a maior parte sem IA. A **IA entra só como reforço**: redigir a tese limpa quando o texto é prosa (STF/DOD), resolver ambiguidade, classificar ramo se faltar. Economiza cota (import é raro, mas assim nem gasta à toa) e fica robusto offline no caso STJ.

**c) Deduplicação entre fontes (DOD já tendo vindo do STJ):** cada julgado ganha uma **chave de identidade** = `tribunal + nº do processo/Tema` (ex.: STJ·REsp 2.072.985 ou STJ·Tema 1357; STF·ADPF 1.292). No import, se a chave já existe:
  - **Não duplica.** Oferece 3 opções no preview: **(i) pular** (já tenho), **(ii) enriquecer** o item existente (ex.: anexar o "caso concreto/fundamentos" que o DOD traz ao item que veio do STJ — fontes se somam, `fontes:[STJ,DOD]`), **(iii) substituir**.
  - Marca visualmente no preview "já no sistema (veio de STJ)" para você decidir item a item. Assim STJ + DOD do mesmo julgado viram **um item rico**, não dois.

**d) 1 informativo → N itens (um por julgado/processo), todos vinculados:** confirmado. Cada informativo vira um **agrupador `infoId`** (nº + tribunal + data), e cada julgado/processo dele é um **item separado** (`indicacao`) com `infoId` apontando para o agrupador. Se um julgado tiver várias teses (ex.: STJ Tema 1357 = 3 teses sob 5 REsps), o padrão é **1 item por julgado** com as teses juntas (numeradas) — com opção de "separar em teses" (já existe `quebrarEmTeses`). Estudar/filtrar "por informativo" fica natural (filtra por `infoId`).

**e) Campo "Último informativo no sistema" (badge de status na tela):** um cartão no topo da Jurisprudência, por tribunal. Frases propostas:
  > **Informativos no sistema** · STF: **nº 1221** (22 jun 2026) · STJ: **nº 894** (30 jun 2026)
  > _última importação: 09/07/2026_
  E, se o feed do STJ indicar edição mais nova ainda não importada: um selo discreto **"novo disponível: STJ nº 895 →"** (1 clique importa). Guardar em `state`: por tribunal, `{numero, dataDivulgacao, importadoEm}`.
  **+ Atalho "abrir site oficial ↗"** (ideia do usuário — boa): ao lado do badge, um botão por tribunal que abre a página oficial de informativos numa nova aba (STJ: `processo.stj.jus.br/jurisprudencia/externo/informativo/`; STF: `portal.stf.jus.br/textos/verTexto.asp?servico=informativoSTF`), para conferir o último lançado e a veracidade na fonte. Custo ~zero, alto valor de confiança.

**f) Visual ultrapremium (referência DOD):** OBSERVAÇÃO HONESTA — do DOD peguei a **estrutura/funcionalidades** (via texto), não o visual pixel a pixel (o WebFetch devolve markdown, não a renderização). Para "algo bonito estilo ultrapremium" proponho: **card por julgado** (chip do ramo com cor por área, tribunal + nº do informativo, tese em destaque, "caso concreto" recolhível, fundamentos), **filtros em pílulas** (ramo · tribunal · ano · categoria · lidos/favoritos), **busca com realce**, ações discretas por card (marcar lido ✓ / favoritar ♥ / caderno / gerar C-E/flashcard), e um **cabeçalho com o badge do último informativo**. Posso, se você quiser, **abrir o site do DOD e tirar prints** para auditar o visual de verdade antes de desenhar — ou já desenhar a nossa versão ultrapremium e te mostrar em protótipo nos 2 temas.

**g) Outros furos que revi:**
  - **Duas datas:** informativo tem `dataDivulgacao` (do informativo) e cada julgado tem `dataJulgamento` (do processo) — capturar as duas (hoje só existia `ano`).
  - **"Novo entendimento / supera precedente":** informativos sinalizam mudança; capturar flag (liga ao `revogado`/`supera` já existente) — é o "novo entendimento" que o DOD filtra.
  - **Vínculo com lei:** item de informativo pode citar artigo de lei → reusar `vinculosDaIndicacao` (súmula↔artigo) para informativo↔artigo.
  - **Controle de reimportação:** guardar quais informativos (tribunal+nº) já entraram → não reprocessar o informativo inteiro à toa (casa com o badge do item e).
  - **Limpeza do HTML do STF:** o `.htm` vem do Word (estilos `mso`, `v\:*`) → um sanitizador antes de extrair.

## E — AMPLIAÇÃO DE ESCOPO (feedback usuário 2026-07-09): jurisprudência não é só informativo

O usuário observou que o plano estava focado em informativo. A Jurisprudência para concurso abrange VÁRIOS tipos — o app já tem o campo `categoria`, então é ampliar, não recriar:

| Tipo | Já existe? | O que fazer |
|---|---|---|
| **Informativo** (STF/STJ) | extração pronta (extrairTesesInformativo) | enriquecer (Parte D) |
| **Súmula** (comum) | categoria "Súmula" | organizar por tribunal + assunto (como o DOD "Súmulas por assunto"); importar em lote |
| **Súmula Vinculante** (STF) | categoria "Súmula Vinculante" | idem; destacar efeito vinculante |
| **Jurisprudência em Teses** (STJ) | NÃO como tipo próprio | **ADICIONAR** — produto do STJ: cada edição é um TEMA com N teses numeradas + precedentes (o DOD até cita "Jur. em Teses (Ed. 210): 9) …"). Extração igual à do informativo (teses numeradas) — mesmo fluxo colar/PDF/link → preview → salvar; `categoria: "Jurisprudência em Teses"`, agrupador por edição |
| **Tema Repetitivo / Repercussão Geral** (Tema NNNN) | categoria "Tema repetitivo"/"Precedente obrigatório" | capturar nº do Tema; ligar informativo↔tema |
| **Enunciado** (Jornadas CJF, FONAJE, súmulas de TJ/TRF) | NÃO | **ADICIONAR** categoria "Enunciado" (importável por colar/PDF) — cai em algumas provas |

→ **Conclusão:** o modelo (`indicacao` com `tipo:"juris"` + `categoria`) já suporta todos; o trabalho é (a) adicionar "Jurisprudência em Teses" e "Enunciado" ao enum de categoria, (b) um agrupador por **fonte-mãe** (informativo nº / edição de Jur. em Teses) — o mesmo `infoId` generalizado para `grupoId`, (c) filtros por categoria/tipo na UI.

## F — MODOS DE LEITURA / FOCO / APARÊNCIA na Jurisprudência (dúvida do usuário)

O usuário perguntou se o plano traz da Lei Seca os **modos foco, leitura e as opções de aparência de leitura**. Resposta:
- **Leitura em foco** (`abrirLeituraFoco`), **grifo/marcação**, **nota**, **perguntar à IA sobre trecho**, abas **Ler/Estudar/Metas** → **já funcionam** em juris (mesmo código). Especialmente úteis nos **informativos** (texto longo: Resumo + fundamentos).
- **Opções de aparência de leitura** (fonte/tema/tamanho, `configLeituraRowsHTML`) → hoje **lei-only** → **DESBLOQUEAR para juris** (entra na Fase 2/C.2). Faz sentido: informativo tem texto substancial. Súmula é curta, mas a config não atrapalha.
→ Então SIM: os modos de leitura/foco/aparência vêm para a Jurisprudência (a maioria já vem de graça; a config de aparência é 1 trava a remover).

## G — VISUAL ULTRAPREMIUM (auditoria REAL do DOD, com prints, 2026-07-09)

**O que o DOD faz (e é bom):** lista **card-based**; cada card = **badge de origem** (Origem: STJ · Informativo 878) + **título/tese em negrito** + **breadcrumb do ramo** (Ramo › Subcategoria › Assunto) + corpo (caso hipotético, correntes, referências dos acórdãos) + ações (**Ver Julgado**, **Marcar como lido**, favoritar ♥, caderno). Sidebar esquerda de **ramos**. Topo: card de busca elevado com filtros (categoria/subcat/assunto/ano/lei/artigo/tribunal/nº informativo + rádios favoritos/leitura/ordenação + toggle "novo entendimento"). Marca = vermelho; tem modo noturno.

**O que ADOTAR (extrair o que é bom):** card por julgado com badge de origem + tese em destaque + tag hierárquica de ramo; navegação por ramo; busca + filtros ricos; ações rápidas por card; marcar lido/favorito.

**O que MELHORAR (nosso ultrapremium, sem copiar 100%):**
- DOD é **denso** (colunas de rádios, muita coisa junta) → nossos filtros em **pílulas** (ramo · tribunal · ano · categoria · lidos/favoritos), calmos, com "avançado" recolhido.
- **Chip de ramo colorido** (cor sutil por área) — leitura visual instantânea.
- **Nosso diferencial que o DOD NÃO tem:** por card, **gerar C/E · flashcard · cloze**, **revisar (espaçada)**, **estudar em foco** — o Mentor transforma jurisprudência em **estudo ativo**.
- **Badge "último informativo no sistema"** + **atalho "abrir site oficial ↗"** no cabeçalho.
- **2 temas** (claro/escuro) nativos, tipografia e "ar" premium (padrão do app).
- Card mais limpo que o do DOD: origem + tese primeiro; "caso concreto" e "fundamentos" **recolhíveis** (não despejar tudo).

→ Vou **prototipar a nossa versão** (não cópia) e mostrar nos 2 temas antes de fixar.

## H — FRENTES DE EXTRAÇÃO / CASOS-LIMITE (provocação do usuário, 2026-07-09, com arquivos reais)

A extração precisa ser robusta a várias frentes. **Camada de reconciliação SEMPRE LIGADA** (independe do botão): toda entrada passa por (1) detectar tipo, (2) extrair, (3) reconciliar com o que já existe pela **chave de identidade** (tribunal + nº do processo/Tema/Súmula). Casos:

1. **Tema/Súmula que vem DENTRO de um informativo:** o julgado cita "Tema 1357"/"Súmula X". → capturar como campos (`tema`, `sumulaRef`); se o informativo **anuncia uma súmula nova**, ela também vira um item `categoria:"Súmula"` (pela chave; se já existe, só vincula). Item do informativo ganha vínculo → tema/súmula.

2. **Mudança de entendimento** (arquivo `MUDANÇA ENTENDIMENTO.pdf`): detectar linguagem de supersessão ("supera", "cancela", "substituída por", "overruling", "não mais se aplica"). → o novo entendimento entra como item novo/atualizado com flag **"novo entendimento"**; o precedente ANTIGO (achado pela chave) é marcado `revogado/superadaPor` e **linkado** ao novo. É a "atenção à republicação" que o usuário pediu — vale mesmo que ele importe por um botão genérico.

3. **Compilação de Súmulas** (arquivo `Súmulas do STF e do STJ - DOD.pdf`): estrutura riquíssima — por **ramo** (Direito Constitucional) → **subtema** (Ministério Público) → cada súmula com **número+tribunal**, **texto integral**, **STATUS (Válida / Superada / Importante)**, comentário, datas, e **notas de substituição** ("Súmula 646 superada pela SV 49"). → 1 item por súmula, mapeando STATUS ao modelo (`Superada`→`revogado`; `Importante`→destaque/peso); substituições viram **vínculo** entre as súmulas.

4. **PDF ESCANEADO** (o `MUDANÇA ENTENDIMENTO.pdf` é imagem: 0 texto, 98 imgs/pág): o pipeline tenta pdf.js (grátis) e, se vier vazio, **cai para Visão** (`extrairTextoArquivo`, já existe no import). Regra: texto-primeiro, Visão-fallback.

5. **Botão específico por tipo (opcional):** posso oferecer botões "Importar Informativo / Súmulas / Jur. em Teses / Mudança de entendimento" que **pré-selecionam o modo** de extração; MAS o import genérico **auto-detecta** o tipo pelos marcadores (SUMÁRIO/PROCESSO/RAMO = informativo STJ; "Súmula NNN-STF: … Válida/Superada" = súmulas; "supera/cancela" = mudança). Auto-detecção + botão explícito como atalho.

6. **Status/vigência como cidadão de 1ª classe:** cada item juris carrega `status` (vigente / superado / cancelado / **importante**) — alimenta filtro "novo entendimento" (como o DOD) e o alerta de "não estude tese superada".

## I — ÍNDICE NAVEGÁVEL + IDENTIFICAÇÃO DE ASSUNTO PELA IA (dúvida do usuário, 2026-07-09)

**a) Índice navegável (Ramo → Assunto):** painel lateral organizando os julgados por **ramo do direito → assunto/subtema**, com contadores, que (i) FILTRA a lista ao clicar e (ii) vira ponto de **estudo por tópico** (gerar C/E/flashcards ou revisar "todo o assunto X" — reusa a infra de escopo por índice já feita na Lei Seca/Materiais). Espelha a barra de ramos do DOD, mas com o plus de estudo ativo. Também dá para dobrar como **árvore de súmulas por assunto** (o arquivo de Súmulas do DOD já vem assim: ramo → subtema → súmula).

**b) Identificação de assunto pela IA (classificação):** na extração, além da tese, a IA **classifica** cada julgado em **ramo** (Direito Penal) + **assunto** (Remição pelo estudo) e **vincula ao tópico do edital** do usuário. Fontes já rotulam parte (STJ tem "RAMO DO DIREITO"; DOD tem breadcrumb), mas a IA **normaliza** na nossa taxonomia e preenche onde falta. Reusa o que já existe: `sugerirTopicoPorAssunto` (determinístico, store.js:2211, já com o fix da stopword "direito") + classificação temática por IA + vínculo ao edital. **É essa classificação que constrói o índice (a) automaticamente** e alimenta os filtros por ramo/assunto. Custo controlado: 1 classificação por julgado no lote da extração (barato) e o determinístico primeiro.

## ORDEM DEFINIDA (revisada 2026-07-09 c/ todos os refinamentos)
- **Fase 1 — Motor de extração + reconciliação:** enriquecer `extrairTesesInformativo` (ia-provider.js:1096) p/ TODOS os campos (ramo, dataDivulgacao, dataJulgamento, nºprocesso, órgão, nºinformativo, tema, status); IA classifica ramo/assunto + vincula edital (reusa `sugerirTopicoPorAssunto`); **agrupador `grupoId`** (informativo/edição); **dedup por chave** (tribunal+processo/Tema/Súmula) c/ pular/enriquecer/substituir; detectar **mudança de entendimento** (supera→marca antigo + linka); **múltiplas entradas** (PDF/imagem, link .htm STF/STJ, colar); **híbrido** determinístico(STJ/STF)+IA(prosa/DOD) + Visão p/ escaneado; **preview dedicado**. → provado, autocontido.
- **Fase 2 — Tela ultrapremium da Jurisprudência:** cards de julgado (badge origem, chip ramo colorido, status vigente/superada/importante, tese, caso recolhível), **filtros em pílulas**, **índice navegável ramo→assunto** (classificado pela IA; filtra + estudar-por-tópico), **badge "último informativo"** + atalho "abrir site oficial" + "novo disponível", ações de **estudo ativo por card** (C/E · flashcard · completar · revisar · foco). 2 temas. (protótipo já feito)
- **Fase 3 — Paridade/desbloqueio (features hoje lei-only):** liberar `statsHTML`, `sugereHTML` (Mentor sugere), `temaChipsHTML`, `estudar-grifos` e a **config de aparência de leitura** (`configLeituraRowsHTML`) p/ juris; adaptar escopo p/ tribunal/categoria/ano/tema.
- **Fase 4 — Novos tipos:** **Jurisprudência em Teses (STJ)** e **Enunciados** como categorias + mesmo fluxo de import; súmulas por tribunal+assunto.
- **Fase 5 — Auto-fetch (bônus):** STJ via **feed Atom** (`InformativoFeed`) — lista novos, importa 1-clique; STF via link `.htm`; "novo disponível" no badge. DOD nunca (só arquivo do usuário).
- **Fase 6 — Índice de busca por módulo:** tirar Lei Seca/Jurisprudência do seletor de Materiais; opt-in "incluir na busca por significado (IA)" dentro de cada módulo, c/ aviso de custo.

## Decisões (status)
1. **Automatizada** → TESTADO (§D.3): recomendo **HÍBRIDA** = assistida (núcleo) + auto-fetch STJ por feed (bônus). Confirmar se topa esse desenho.
2. **Campos novos** → ✅ usuário aceitou TODOS (ramo, data, nº processo, nº informativo, órgão, tema).
3. **Índice de busca** → ✅ usuário autorizou mover p/ os módulos e tirar de Materiais (Fase 3).
4. **Ordem** → definida acima (começa por D).

Ver [[mentor_lei_seca_plano]], [[mentor_sync_geracao_revisao]], [[mentor_qconcursos_extracao]].
