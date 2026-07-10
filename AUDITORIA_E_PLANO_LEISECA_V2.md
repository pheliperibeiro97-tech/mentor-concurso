# Auditoria exaustiva + Plano em fases — Tela Lei Seca (v2)

> Base: spec do dono (`REFORMULAÇÃO DA TELA LEI SECA.docx`) + `PLANO_REFORMULACAO_LEISECA.md` + leitura integral do código (`leiseca.js`, `store.js`, `pratica.js`, `planejamento.js`, `flashcards.js`, `erros.js`, `styles.css`) + varredura visual das 3 abas. **Nada foi alterado — só relatório e planejamento.** Data: 2026-07-08.

---

## 0. Resumo executivo — os 6 temas transversais

1. **Excesso de "chrome" / cara de sistema administrativo.** As três abas empilham controles/quadros demais **antes** do conteúdo. No Ler há ~18 controles em 4 barras antes da 1ª linha da lei; no Estudar ~20 alvos clicáveis + 6 tiles; em Metas 6 blocos bordados. A filosofia da spec ("a interface some durante a leitura; a lei é protagonista; o app pensa pelo aluno") está comprometida pela densidade.
2. **Redundância: a mesma informação/ação 2–3×.** "Revisões vencendo" aparece 3× no Estudar (stat + recomendação + card) e 2× em Metas (agenda + calendário). "O que mais cai" tem 3 definições concorrentes. "Refazer erros" (card) × "Caderno de erros" (seção). "Metas pendentes" contado 3×.
3. **Inconsistência de dados.** A Agenda de Metas usa `memoriasParaRevisar(tipo)` e o calendário usa `revisoesConsolidadas()` (global) → **podem mostrar números diferentes lado a lado**, parecendo bug.
4. **Emojis/ícones: quase limpo, 3 arestas.** A tela já usa Lucide. Sobram: colisão de **duas estrelas âmbar** (incidência `★` glifo × provável-questão `star` Lucide); `sparkles` significa **IA e novidade legislativa**; glifos em texto (`✓` linha 2418; `🔵🔴🟡` em tooltips de Ferramentas). As cores de grifo (🟡🔵🔴🟢🟣🟠) na **marcação** ficam — é a cor real.
5. **Buracos funcionais da spec.** Completar-artigo 4 níveis; metas estruturadas + progresso por meta; C/E "estilo banca" (incidência + texto integral pós-resposta); continuar-leitura como card; scroll-spy; histórico "14:32"; selo "Atualizado · Lei X" + gatilho 30 dias; capítulos concluídos; filtros inteligentes (10); IA proativa; artigo aleatório.
6. **Tipografia/visual incompletos.** `--fs-lei: 42px` **definido e nunca usado**; nome da lei é um `<select>` de formulário (deveria ser o herói tipográfico); `.ler-topo` é um cartão de vidro com sombra+blur; cabeçalho do artigo sobrecarregado; caixinhas por toda parte (contra "só tipografia").

---

## 1. ABA LER — achados (item · local · problema · proposta · prioridade)

### Redução de chrome
- **L1. `barra-acoes` duplica a barra do leitor** · `leiseca.js:592-616` + `2099`. Duas barras de ação no leitor (Importar/Conferir/Incidência/Novidades/Tópicos numa; Buscar/Ir/Foco/Índice/Ferramentas/Aa noutra). → No modo leitor, suprimir a `barra-acoes` e consolidar tudo na `ler-topo`; Importar/Conferir/Incidência/Novidades/Filtro vão para um overflow "⋯". **ALTA**
- **L2. Buscar + Ir para art. = mesma intenção, 2 controles gordos** · `2120-2121`. → Unificar num **campo de comando** único (número→pula ao artigo; palavra→busca). **ALTA**
- **L3. Botão "Índice" redundante com a árvore recolhível** · `2123` + `renderLeitorArvore`. → Virar ícone discreto (list-tree) ou "recolher/expandir tudo" no overflow. **MÉDIA**
- **L4. "Ferramentas" (chave-inglesa) = balaio administrativo** · `2124` → `abrirFerramentasLei`. → Renomear ("Mais"/"Ações da lei"); **mover Grifar-em-lote e Classificar-temas para o Estudar** (é preparação de estudo, não leitura); manter só lido-em-bloco/imprimir-grifos/site/vigência. **ALTA**
- **L5. `ler-stats`: 5 chips-filtro permanentes** · `2131-2138`. A informação é boa (spec pede stats no topo), mas como pills clicáveis fixos viram barra de CRM. → Rebaixar a texto/estatística sutil; função "filtrar" vai para overflow. **MÉDIA**

### Cabeçalho do artigo e status
- **L6. Status comunicado 3×** · `ler-flags` (2653) + opacidade/barra-azul (CSS) + toggles no hover (2659). → Manter o sutil (opacidade 70% + check verde; barra azul p/ favorito) e **remover o cluster `ler-flags`**. **ALTA**
- **L7. Cabeçalho do artigo sobrecarregado** · `ler-art-head` 2652-2660: flags + Art.Nº + nomeJuridico(pill) + ★ incidência + badges + até 3 chips de tema + 4 ações. Spec quer só "Art. Nº". → Cabeçalho = Art.Nº (+ nome jurídico em texto simples cinza/itálico); incidência ★ discreta à direita; badges sutis; **remover chips de tema do modo Ler**. **ALTA**
- **L8. Chips de tema poluem a leitura** · `2657` (`ler-temas`). São metadados de estudo. → Ocultar no Ler (aparecem no Estudar/escopo). **MÉDIA**
- **L9. `nomeJuridico` como pill azul** · CSS `.ler-art-nome`. → Texto simples ao lado do Art.Nº, sem fundo. **BAIXA**

### Emojis/ícones (Ler)
- **L10. Duas estrelas âmbar colidem** · `★` glifo incidência (2642) × `star` Lucide "provável questão" — ambos âmbar, mesma linha. → Diferenciar (provável-questão vira `flag`/outra cor) **ou** fundir "provável questão" no conceito de incidência (quase a mesma ideia). **ALTA**
- **L11. `sparkles` = IA e novidade legislativa** · IA (2419/283/112) × novidade (599/2640/2677). → Reservar `sparkles` p/ IA; novidade vira selo "Atualizado" ou `file-clock`. **MÉDIA**
- **L12. `🔵🔴🟡` em tooltips de Ferramentas** · 2028-2029. → Trocar por mini-swatches CSS ou pelos nomes. **BAIXA**

### Visual/tipografia
- **L13. Nome da lei é `<select>` de formulário** · 2116 `ler-norma-sel`. Spec: título 42px/700. `--fs-lei` existe e **não é usado**. → Nome como **título grande**; troca de lei = clique no título abre dropdown leve. **ALTA**
- **L14. `.ler-topo` = cartão de vidro pesado** · CSS 2311 (border+radius+shadow+blur, 3 linhas). Spec: "sem caixas, sombra ≤ 0 1px 2px". → Emagrecer p/ 1 linha, fundo sólido/transparente, hairline no scroll. **ALTA**
- **L15. `ls-estr-num` é pill com fundo** na estrutura · CSS 2303. Spec: "só tipografia". → Número em texto sutil sem fundo. **BAIXA**
- **L16. Accordion "Como funciona a Lei Seca?" permanente** · 575-583. → Virar onboarding único (1ª visita) ou "?" discreto no header. **MÉDIA**
- **L17. Botão Imprimir no header** · 573. → Mover p/ overflow. **BAIXA**

### Labels/textos (Ler)
- **L18. "Conferi a vigência"** (1ª pessoa, passado) · 2046/2698 → **"Conferir vigência"** (imperativo). **MÉDIA**
- **L19. Tooltip em CAIXA ALTA + "diff mecânico" (jargão)** · 594 → reescrever em minúsculas, sem jargão. **BAIXA**
- **L20. "Marcar incidência" ambíguo no leitor** · 595 → rótulo "O que mais cai" e mover p/ Estudar/overflow. **MÉDIA**
- **L21. "Ferramentas" tooltip enumera o modal** · 2124 → "Ações sobre a lei toda." **BAIXA**

### Menu ⋯ do artigo e suavidade
- **L22. Menu ⋯ mistura ler/estudar/gerenciar** · `menuArtigoHTML` 2608-2621. → Agrupar com divisórias (Ler · Estudar · Gerenciar) ou tirar as de estudo. **MÉDIA**
- **L23. Toggles disparam `app.refresh()` (re-render total → pisca)** · ações lido/fav/dif. Spec pede check 200ms/estrela 150ms/fade 250ms — existe no Foco, não na lista. → Update in-place do artigo + transições. **MÉDIA**
- **L24. "Anotar" no Foco é um toast pedindo "escolha a cor Comentário"** · 429. → Abrir direto o campo de nota. **MÉDIA**

### Resquícios de sistema antigo (Ler)
- **L25. CSS órfão `.ler-continuar`** (2321) — botão "Continuar" foi fundido no Foco; a função sumiu da UI. **MÉDIA**
- **L26. `itemHTML`/`.ls-item` (cartão antigo) ainda ativo** p/ juris e fallback — o "card branco por item" que a spec condena. Alinhar juris no futuro. **BAIXA**
- **L27. Colisão de namespace `.lf-*`** (FAB cronômetro × leitura em foco). → Renomear foco p/ `.lfoco-*`. **BAIXA**

---

## 2. ABA ESTUDAR — achados

### Redundâncias
- **E1. Recomendação ≡ um card abaixo** · `rec` (2201-2206) sempre aponta p/ uma ação que já é card. → Manter só o banner-hero E remover do grid o card idêntico ao recomendado (ou o card ganha selo "Recomendado" e o banner some). **ALTA**
- **E2. "Revisar o que vence" 3×** (stat + recomendação + card), 2 deles só navegam p/ a Central. → Stat "revisões vencendo" vira clicável (único lugar); **remover o card** do grupo. **ALTA**
- **E3. 3 definições concorrentes de "o que mais cai"** · chip incidência (top 20% por `pqIncidencia`) × `estudar-foco` (`pq+fracos`) × recomendação × `foco-chips`. Critérios diferentes, mesma linguagem. → Unificar num só conceito (manter o chip "O que mais cai"); apagar `estudar-foco`/rec-foco/`foco-chips`. **ALTA**
- **E4. `foco-chips` = navegação disfarçada de estudo** · 2224, 6 chips `ir-artigo` + número cru `pqIncidencia`. → Remover a faixa. **MÉDIA-ALTA**
- **E5. "Refazer meus erros" (card) × "Caderno de erros" (seção)** · 2321 × 2335. → Fundir num bloco (card com link "ver caderno completo"). **MÉDIA**

### Seletor de escopo (o mais "administrativo")
- **E6. 4 controles de escopo + 2 chips + contador numa linha** · `.estudar-escopo` 2249-2267. → **Colapsar num botão "Escopo"** com resumo textual clicável: `Estudando: CF · Título II · art. 5–17 · 41 artigos ▾`; default nem mostra controles. Chips Todos/O-que-mais-cai viram toggle "Priorizar por incidência" dentro do popover. **ALTA**

### Grupos e cards
- **E7. Grupo "Memorizar" não memoriza — gera material** · flashcards+questões (subtítulo "gere material"). Contradiz a spec (Memorizar = incisos/prazos/competências…). → Renomear p/ **"Gerar ▾"** (menu Flashcards/Questões, padrão já usado em Materiais); memorização temática real vem via seletor de tema. **ALTA (rótulo)**
- **E8. Portais (Revisar/Grifos/Gerar) com o mesmo peso de exercícios in-loco** · → 2 níveis visuais: exercícios (C/E, Completar) = card grande; portais = linha compacta de botões-texto. **MÉDIA**
- **E9. Dashboard com 6 tiles** · `estudar-hoje` (um tile empilha 2 métricas: "questões · %"). → Reduzir p/ 3–4 essenciais (revisões vencendo, lidos hoje, ofensiva); resto vai p/ estatísticas; recolher o dashboard numa tira fina. **ALTA**

### Labels/jargão (Estudar)
- **E10. Reescrever textos** · "diff colorido"→"ache o erro"; "Recall por lacunas… Vira flashcard"→"Complete a letra de memória"; "Só as marcas/Recordar" (nomes internos)→"Reveja só os trechos que você grifou"; subtítulos de grupo minúsculos ("o que você já viu") → remover; **"dispositivo(s)" → "artigo(s)"** em contador/rec/toasts; tooltip de seção verboso → "Estude só um trecho da lei". **MÉDIA**

### Densidade
- **E11. 9 blocos verticais, 3 densos, antes dos exercícios** · → subir exercícios; recolher dashboard/estatística/escopo; padronizar respiros (hoje 46px díspares). **ALTA**
- **E12. `.estat-lei` é relatório, não centro de revisão** · → manter só ring + "N a revisar" inline; gráfico/desempenho por tema vira link "Ver estatísticas → Acompanhamento". **MÉDIA**

---

## 3. ABA METAS — achados

- **M1. 6 blocos empilhados = painel administrativo** · `metasCorpoHTML` 2499. → Colapsar p/ **3 blocos**: herói (progresso+ritmo+previsão) · **"Hoje"** unificado (funde "Metas diárias"+"Agenda de hoje") · lista de metas. **ALTA**
- **M2. "Revisões vencendo" contado 3× com fontes divergentes** · agenda `memoriasParaRevisar(tipo)` × calendário `revisoesConsolidadas()` × badge da aba. → **Uma fonte só**, um lugar só (dentro de "Hoje"). **ALTA**
- **M3. "Metas pendentes" contado 3×** (agenda + lista + badge) · → remover a linha da agenda; resumo só no cabeçalho da lista. **MÉDIA**
- **M4. Calendário "Esta semana" só mostra revisões — não é cronograma** · spec pede artigos/tempo/revisões/questões/flashcards por dia; e colide com "Abrir Planejamento da semana". → **Delegar cronograma ao Planejamento global**; aqui, trocar a grade de 7 caixas por **linha do tempo horizontal** (Hoje·Amanhã·Semana·Até a prova) leve. **ALTA**
- **M5. Metas cruas = cadastro binário** · checkbox + data de criação no rodapé. Spec quer progresso por meta. → Mini-barra de progresso ("art. 1–20 · 12/20 · 60%") quando parseável; remover `criadoEm`. **ALTA**
- **M6. Ícone da aba Metas usa `target` (que é o de Estudar)** · CTA/cabeçalhos de Metas em `target`. → Padronizar Metas em `calendar-check`; reservar `target` p/ Estudar. **MÉDIA**
- **M7. Ajuda "Como funciona" desatualizada** · descreve Metas como era antes (só lista), ignora dashboard/ritmo/calendário. → Reescrever. **MÉDIA**
- **M8. `✓` literal em `pm-nums`** · 2418. → Estado visual `.plan-meta.ok` já sinaliza; remover o glifo ou usar `icone("check")`. **MÉDIA**
- **M9. Tamanhos**: `pd-big 1.9rem` assimétrico; calendário 7 caixas `min-height:78px`; 3+ estilos de "caixa bordada" seguidos. → Harmonizar números; matar caixas; separar por espaço, não borda. **MÉDIA/ALTA**
- **M10. "Metas diárias — seu ritmo mínimo do dia"** e "Metas de leitura — por nome, viram tarefa…" — sub-labels repetem o título. → Cortar. **MÉDIA**

---

## 4. COERÊNCIA GLOBAL

- **G1. "Revisar" mora em 2 abas com nomes/ganchos diferentes** (Metas→Central; Estudar→motor interno; Central externa). → Vocabulário único "Revisar"; papéis claros (Metas aponta · Estudar executa · Central consolida). **MÉDIA**
- **G2. Badge de Metas conta o backlog inteiro** (metas futuras) — "grita" sem urgência. → Contar só hoje/atrasado. **BAIXA**
- **G3. `revN` no subtítulo do header E no badge** — leve redundância. → Opcional tirar do subtítulo. **BAIXA**
- **G4. `--fs-lei` (42px) definido e não usado; escada 42/22/20/18 incompleta** → aplicar a escala tipográfica. **MÉDIA**

---

## 5. GAPS DA SPEC (funcionalidades não feitas) — tabela consolidada

| # | Item (spec) | Aba | Status | Prioridade |
|---|---|---|---|---|
| 1 | Histórico de leitura "Hoje 14:32" | Ler | Faltando (dado existe) | Média |
| 2 | "Continuar leitura" como card (Art.156·35%) | Ler | Parcial (só tooltip do Foco) | Média |
| 3 | Selo "Atualizado · Lei 14.994/2024" + gatilho 30d + resumo topo | Ler | Divergente/parcial | Média |
| 4 | Nota lateral (painel/bottom-sheet) + nota livre do artigo | Ler | Parcial (só ancorada a grifo) | Média |
| 5 | Persistir recolhimento da estrutura por lei | Ler | Parcial | Baixa |
| 6 | Título da lei 42px/700 (hero) | Ler | Divergente (é select) | Média |
| 7 | Scroll-spy (artigo/capítulo corrente na barra) | Ler | Faltando | Média |
| 8 | Modo Foco "Mais": lembretes + assistente | Ler | Parcial (só cronômetro/IA) | Baixa |
| 9 | Capítulos concluídos (+ marcar capítulo) | Ler/Estudar | Faltando | Média |
| 10 | Completar-artigo 4 níveis (fácil/médio/difícil/extremo) | Estudar | Faltando | **Alta** |
| 11 | C/E banca: incidência ★ + texto integral pós-resposta + abrir artigo | Estudar | Parcial | Média/Alta |
| 12 | Questões: tempo estimado + escopos por flag | Estudar | Parcial | Média |
| 13 | Flashcards "abrir artigo completo" | Estudar | Faltando | Média |
| 14 | Ordenar por incidência (maior/menor/nunca cobrado) | Estudar | Faltando | Baixa/Média |
| 15 | Grupos: Revisar-difíceis/favoritos/alterações/anotações; artigo aleatório; Memorizar temático | Estudar | Parcial | Média |
| 16 | Recomendação multi-linha ("Hoje recomendamos" lista) | Estudar | Parcial (1 só) | Média |
| 17 | Barra de contexto (Lei·Capítulo·hoje·pendentes·sequência) | Estudar | Parcial | Baixa/Média |
| 18 | Filtros inteligentes (os 10) | Estudar/Ler | Parcial (5/10) | Média |
| 19 | Gamificação: meta semanal · % dominada · nível de revisão | Estudar | Parcial | Baixa |
| 20 | Estatísticas: tempo por lei/capítulo, esquecidos, evolução semanal | Estudar | Parcial | Baixa/Média |
| 21 | IA proativa ("marcou muitos difíceis → gerar 20q/10fc/1rev?") | Estudar | Faltando | Média |
| 22 | Metas por Livro/Título/Capítulo/intervalo/artigos/flags | Metas | Faltando | **Alta** |
| 23 | Progresso por meta (%/artigos/tempo/revisões) | Metas | Faltando | **Alta** |
| 24 | Metas inteligentes (tempo/flashcards/revisões/acertos/capítulos) | Metas | Parcial (só artigos/questões) | Média |
| 25 | Cronograma rico por dia | Metas | Parcial (só revisões) | Média |
| 26 | Wizard planejamento automático (7 perguntas) | Metas | Parcial (delegado) | Média |
| 27 | Replanejamento 1 clique | Metas | Parcial (delegado) | Baixa/Média |
| 28 | Linha do tempo (amanhã/próxima/até a prova) | Metas | Parcial (só "esta semana") | Baixa/Média |
| — | Modo concurso | Metas | **Removido (ok)** — não repropor | — |
| — | Banca mais semelhante | Estudar | **Removido (ok)** — não repropor | — |

---

## 6. GARGALOS TÉCNICOS identificados
- **Re-render total (`app.refresh`) a cada toggle no leitor** → pisca; precisa de update in-place (o Foco já faz via `atualizar()`).
- **Fonte de dados de revisões divergente** (`memoriasParaRevisar` × `revisoesConsolidadas`) → números conflitantes na mesma tela. Padronizar.
- **Metas cruas binárias** travam a cascata "concluir leitura → atualiza meta"; sem progresso por meta, o ciclo Metas↔Ler↔Estudar não fecha.
- **`--fs-lei` órfão; `.ler-continuar` órfão; `.lf-*` namespace collision; `itemHTML/ls-item` (cartão antigo) ainda vivo** (juris).
- **Jargão "dispositivo"** recorrente (usar "artigo").

## 7. O que NÃO proponho mudar (e por quê)
- **Modo concurso** e **"banca mais semelhante"** — removidos por decisão sua; não repropor.
- **Reimplementar cronograma completo / wizard / replanejamento dentro de Metas** — melhor **delegar ao Planejamento global** (não duplicar); Metas mantém só o gancho + linha do tempo leve.
- **Virtualização do leitor** — só necessária em leis 1000+ artigos (CPC/CF); CP/CDC (409/130) renderizam bem. Adiar.
- **Alinhar Jurisprudência ao tratamento de leitura** — é a tela gêmea; fora do escopo desta reformulação (registrar como futuro).
- **Cores de grifo (emoji) na marcação** — você quer manter; são a cor real.

---

## 8. PLANO EM FASES

> Ordenado por (impacto na sensação × baixo risco). Nada muda funcionalidade essencial; V1/V2 são majoritariamente subtração e reorganização.

### FASE V1 — "Desintupir" (visual/redução · risco baixo · impacto altíssimo)
Objetivo: devolver o ar, matar redundâncias, tirar cara de sistema administrativo. Sem novas features.
- **Ler:** L1 (fundir barras) · L6/L7 (cabeçalho minimalista, remover cluster de flags) · L8 (ocultar temas no Ler) · L5 (stats sutis) · L14 (`.ler-topo` leve) · L13 (nome da lei como título) · L16 (ajuda→onboarding) · L17 (imprimir→overflow) · L10/L11 (resolver estrelas âmbar + sparkles) · L18/L20/L21 (labels) · L15/L9 (pills→texto).
- **Estudar:** E6 (colapsar escopo num controle) · E1/E2 (matar duplicata rec↔card e tripla "vencendo") · E3/E4 (unificar "o que mais cai" + remover foco-chips) · E5 (fundir erros) · E7 (renomear "Memorizar"→"Gerar ▾") · E9/E11 (dashboard 3–4 tiles + subir exercícios) · E8 (portais viram linha) · E10 (labels/"dispositivo"→"artigo").
- **Metas:** M1 (6→3 blocos) · M2 (uma fonte de revisões) · M3 (tirar linha redundante) · M4 (calendário→timeline leve) · M8 (✓ literal) · M6 (ícone da aba) · M7 (ajuda) · M9/M10 (tamanhos/labels).
- **Global:** G1 (vocabulário "Revisar") · G4 (escada tipográfica + usar `--fs-lei`).

### FASE V2 — "Dados que já existem viram UI" (risco baixo · dados prontos)
- Continuar-leitura como **card** (#2) · histórico "Hoje 14:32" (#1) · selo "Atualizado · Lei X" + resumo no topo (#3) · scroll-spy artigo/capítulo (#7) · persistir recolhimento (#5) · **progresso por meta** (#23) · barra de contexto do Estudar (#17) · filtros inteligentes como chips (#18) · gamificação leve (% dominada/meta semanal) (#19).

### FASE F1 — "Funcionalidades da spec" (mais trabalho · valor alto)
- **Completar-artigo 4 níveis** (#10) · **metas estruturadas** por Livro/Título/Capítulo/intervalo/flags + criador com seletor (#22) · **C/E banca**: incidência ★ no cabeçalho + texto integral pós-resposta + "abrir artigo" (#11) · questões: tempo estimado + escopos por flag (#12) · flashcards "abrir artigo completo" (#13) · **capítulos concluídos** + marcar capítulo (#9) · **nota lateral** (painel/bottom-sheet) + nota livre do artigo (#4) · artigo aleatório (#15).

### FASE F2 — "Inteligência proativa + polimento" (IA + refinamento)
- Recomendação multi-linha (#16) · **IA proativa** (#21) · Memorizar temático real (drills por tema/estrutura) (#15) · estatísticas: tempo por lei/capítulo, esquecidos, evolução semanal, nível de revisão (#20/#24) · linha do tempo Metas completa (#28) · replanejamento 1 clique (delegado) (#27) · wizard de planejamento (delegado) (#26).

### Correções técnicas (encaixar em V1/V2)
- Update in-place no leitor (L23) · limpar CSS órfão (`.ler-continuar`, `--fs-lei` sem uso) · resolver `.lf-*` collision (L27) · unificar fonte de revisões (M2/gargalo).

---

### Métrica de sucesso da FASE V1
De ~18 controles (Ler) / ~20 alvos+6 tiles (Estudar) / 6 blocos (Metas) para: **Ler** = 1 barra enxuta + leitura protagonista; **Estudar** = tira de contexto fina + 1 recomendação + escopo colapsado + 4–5 cards + "Gerar ▾"; **Metas** = 3 blocos. Sensação alvo: "livro inteligente", não "sistema administrativo".
