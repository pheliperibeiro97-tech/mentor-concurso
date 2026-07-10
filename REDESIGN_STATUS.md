# REDESIGN ULTRAPREMIUM — STATUS DE EXECUÇÃO (handoff)

> **Para quem for continuar (qualquer modelo/sessão):** este arquivo é a fonte de verdade
> do que JÁ FOI FEITO e do que falta, com instruções operacionais. O plano completo
> (achados, justificativas, microcopy, fases 0–8) está em
> `E:\felip\Downloads\AUDITORIA-MENTOR-2026\AUDITORIA_ULTRAPREMIUM_2026.md` — leia a
> seção 9 (Plano de Reformulação) antes de qualquer fase nova.

**Branch de trabalho:** `feat/fase0-tokens` (a partir de `main` @ commit "wip(0.6.2): fotografia").
**Última atualização:** 2026-07-10.

## Protocolo obrigatório (não pule)

1. **Toda mudança visual é verificada com screenshot nos DOIS temas** (claro e escuro)
   antes de ser declarada pronta. O app roda em `http://localhost:1420` (vite já ativo
   na máquina do usuário; se a porta estiver livre: `npm run dev`). Tema alterna pelo
   botão de lua/sol na topbar.
2. **JS**: `node --check <arquivo>` após cada edição. **CSS**: `npm run lint:css`
   (warnings são o radar; não introduza NOVOS).
3. Commits pequenos e temáticos, mensagem em pt-BR, prefixo `feat(faseN):` /
   `refactor(faseN):`, rodapé `Co-Authored-By: Claude ...`.
4. Regras de produto: o Mentor PROPÕE e o usuário aprova; não recriar o que existe —
   integrar; não usar emoji em UI (Lucide via `icone()` de `src/icones.js`).
5. Código novo: **zero `style=` de layout** (usar utilitárias `.u-*`), **zero hex**
   (usar tokens `var(--*)`), **zero glifo de texto** (▸ ✓ etc. → Lucide).

## FASE 0 — Design System (QUASE COMPLETA)

### Feito (commits na branch, em ordem)
1. **Tokens v3** no `src/styles.css` (`:root` + bloco `[data-tema="escuro"]`):
   tints por matiz (`--tint-{amber,violet,rose,sky,green}-{bg,ink}`), `--amber` único,
   rampa heatmap `--heat-1..4`, `--tooltip-bg/-ink`, `--toast-bg/-ink/-danger`,
   pesos `--fw-{regular:450,medium:550,semibold:640,bold:720,black:800}`,
   `--fs-display-1/2/3` (clamp), `--radius-lg:16px`,
   camadas `--z-{nav:100,fab:300,overlay:500,modal:700,toast:800,tooltip:900}`.
2. **Migração mecânica**: 516 font-weight→tokens; 361 border-radius→escala
   {6,8,12,16,pill}; 37 media queries→breakpoints {560,900,1200} (min-901 e min-1700
   preservados); 39 z-index→camadas (toast SEMPRE acima de FAB; FAB abaixo de modal;
   FABs sobre o Modo Foco via `calc(var(--z-overlay) + 55/56)`); 28+43 hexes→tokens
   (só troca por valor idêntico, com contexto claro/escuro).
3. **CSS morto removido**: sistema de tooltip por pseudo-elemento (era 100% anulado
   pelo portal `tooltip.js`), 9 pares de carets de texto "▸/▾" legados + unificador
   consolidado (buscas/cfg-acordeao ficam sem caret).
4. **Toast**: reposicionado para baixo-centro (`#toasts`), tokenizado.
5. **`fecharAnimado()`** em `src/ui.js` + CSS `.closing`: saída animada de
   confirmar/escolher/abrirJanela/pedirNumero/pedirTexto/opcoesImpressao/aviso-IA/paleta.
6. **Glifos→Lucide**: chevrons e « da sidebar, ☰ mobile, ponto de selo da nav (CSS puro),
   ＋ do editor de mapa, −＋↔ do pdfviewer, impressora única (`iconImprimir = icone("printer")`),
   `vazio()` default = inbox, paleta sem fallback emoji, 📚 licença → graduation-cap,
   emojis da impressão de grifos → `pontoCor()`. Ícones novos registrados em `icones.js`:
   chevrons-left, menu, inbox, zoom-in, zoom-out, move-horizontal.
7. **Utilitárias** `.u-*` (styles.css, bloco "Fase 0 — utilitários"): u-m-0 (ANTES das
   margens, para compor), u-mt/mb-{4,8,12,16}, u-ml-auto, u-flex/-6/-12, u-col/-6,
   u-row (sem align-center), u-wrap, u-center, u-between, u-items-end, u-grow/-2,
   u-w-{64,90,120}, u-block, u-nowrap, u-fw-regular + regra `label.inline > select`.
8. **~206 style= inline migrados** para utilitárias (4+1 agentes, 20 arquivos).
   Restantes são: dinâmicos (`${...}`/custom props), HTML de impressão, ou sem
   utilitária equivalente (lista nos relatórios dos commits).
9. **Tints aplicados**: trio azul (#eff6ff/#bfdbfe/#1d4ed8) → tokens em 8 regras;
   categorias escuras (missao-cat/item) → tints; heatmap tokenizado nos 2 temas.
10. **Tipografia**: títulos de tela em `--fs-display-2` (page-head h1) e `-3` (ddx);
    piso de 11px (16 tamanhos 9–10.6px elevados).
11. **Fixes**: anel de progresso não quebra "0%" em 2 linhas (`.pring-num`);
    chat sem `text-align: justify`.
12. **Stylelint**: `.stylelintrc.json` (color-no-hex + no-duplicate-selectors como
    warnings) + `npm run lint:css`. Baseline: ~700 warnings.
13. **Tabs unificados em `.seg`** (leiseca, edital, simulados, config, planejamento;
    CSS de .ls-segmented/.cur-seg/.subtabs apagado; modificadores novos .seg-badge/
    .seg-badge-due/.seg-txt). **Seg MC × C/E no header de Questões** (alterna as rotas
    pratica/pratica-ce). **Botões 18→14 variantes** (mortas removidas: btn-success,
    btn-dossie, btn-zerar, btn-ico). Verificado nos 2 temas, 0 erros de console.

### Falta da Fase 0 (backlog fino)
- [x] Transitions → `var(--dur-*)`: 217 migradas; 0 restantes nas faixas mapeadas.
- [x] `--muted-2` (#94a3b8) criado nos 2 temas; 16 usos migrados.
- [x] Blocos escuros: 133 → 122; TODAS as redundâncias comprovadas removidas (11 blocos
      + 25 declarações). Fix: heatmaps voltaram a exibir --heat-* no escuro (verificado).
- [x] Blocos escuros 127 → 114 via 7 tokens ink/bg novos (--ink-vermelho/-suave,
      --ink-verde, --ink-esmeralda, --ink-ambar, --bg-amarelo, --bg-verde); 23 regras
      migradas com par claro/escuro EXATO; 64 sondas de getComputedStyle byte-idênticas
      nos 2 temas. Os 114 restantes são intencionais (gradientes do Modo Foco, leitor
      Kindle, mk-*/paletas, pares var→var da paleta primária, pares literais ≤2×).
- [x] Seletores duplicados: 28/28 grupos consolidados (no-duplicate-selectors ZERADO;
      merge preservando o computado — base tardia + propriedades não sobrescritas).
- [x] Grade de 4px: 376 tokens em 340 declarações (5→4, 7→8, 9→8, 11→12, 13→12);
      excluídos 1/2/3px, em/rem/%, posicionamento e os 2 paddings de baseline do
      registro de sessão. Warnings lint: 700 → 578 ao longo da faxina toda.
- [x] Faxina de CSS órfão CONCLUÍDA (2 rodadas, −422 linhas: 5978 → 5529 antes da
      grade): checkin-*, raiox-*, plan-dash antigo, mentor-hoje, onboarding antigo,
      sidebar-colapsada (modo morto) e ~190 seletores comprovados por grep + prefixos
      dinâmicos. Vivos de revtopico.js/nav-rail preservados.
- [ ] ~540 hexes restantes fora dos blocos escuros = intencionais (não batem com token;
      trocar MUDARIA o visual — só mexer com decisão de design explícita).

## FASE 1 — Navegação (PARCIALMENTE FEITA)

### Feito
- 19 → 16 itens: Resumos e Mapas → grupo Estudar; "Questões C/E" e "Revisão de
  Tópicos" com `semNav: true` em `main.js` (rotas vivas; paleta Ctrl+K ganhou as duas
  em EXTRAS de `paleta.js`); Central renomeada "Revisões" na barra; 1 cor por grupo.
- Seg MC × C/E dentro de Questões (agente da sessão anterior — VERIFICAR).

### Falta da Fase 1
- [x] Baixa GRADUADA na Central (card + foco, teclas 1/2/3; `concluirRevisao` aceita
      grau e propaga; log grava o grau). Verificado ao vivo: escada reagiu 1/7/15.
- [x] Encadeamento: conclusão da sessão da Central oferece "Continuar com N flashcards"
      → abre o foco de Flashcards direto (`params.iniciarFoco`).
- [x] Só a Central lista vencimentos: revtopico virou banner→Central + abre o fluxo
      via `params.topicoId`; mapas trocou a lista por banner; hub do Hoje re-roteado.
- [ ] Decidir "Por onde começar" → checklist de 1ª semana no Hoje (Fase 3 do plano).
- [ ] Avaliar fundir Resumos/Mapas dentro de Materiais (reduziria p/ ~14 itens).

## FASE 2 — Persona única + chat de verdade (CONCLUÍDA no essencial)

### Feito (verificado ao vivo: streaming ~2,8s até o 1º parcial, multi-turno correto,
### rehidratação pós-reload, 0 erros de console)
- Persona única "Mentor": FAB/painel renomeados, selo amarelo = "Criado pelo Mentor ·
  confira", nota da tela Mentor reescrita, `PERSONA_MENTOR` (ia-provider) nos prompts
  do chat e da análise.
- Memória: `store.chatHistorico` (cap 30, corta 4k chars, persiste+sincroniza; migração
  na carga); rehidratação ao montar; multi-turno (últimas 6 trocas viram `contents`).
- Streaming REAL: `geminiStreamRaw` (SSE `streamGenerateContent?alt=sse`) +
  `responderChatStream` exportado; markdown formatado desde o 1º chunk (md() no
  onChunk cumulativo — retry de modelo/chave só "reinicia" o balão); botão Parar
  (AbortController) preserva o parcial; fallback sem stream p/ claude-cli.
- `humanizarErroIA` (util.js) em comOcupado/chat (com "Tentar de novo")/seletor-escopo/
  mentor (que também restaura o ícone do botão no erro).
- Orb com estados: `setOrbsOffline` (main render) → .orb--off cinza+tooltip; .is-thinking
  morfa acelerado; velocidade lida por frame do classList do pai.
- Chips do chat CONTEXTUAIS por tela (`app.rotaAtual`, novo getter em main.js).
- `analisar_progresso` do chat EXECUTA (navigate mentor {autoAnalisar:true}).
- Insight do Hoje entra com fade (fim do falso "digitando" sobre conteúdo local).
- Tela Mentor: botão "Perguntar sobre o plano" → chat com o plano no contexto;
  análise recebe `planoAnterior` e o prompt pede 1 frase de CONTINUIDADE.

### Adiado (decisão consciente, retomar depois)
- [ ] Fundir roteador (interpretarComando) + resposta numa chamada só: mantive as 2
      para preservar o contrato das 13 ações do chat-executor; com o streaming, a
      latência percebida já caiu. Retomar medindo o custo real.
- [ ] `contextoAlunoCurto()` em comentarQuestao/comentarErro (exige tocar os callers).
- [ ] PERSONA_MENTOR nos demais prompts (professor de cursinho, examinador da
      discursiva…) — o examinador RIGOROSO é proposital; decidir caso a caso.

## FASE 3 — IA proativa (CONCLUÍDA no essencial)

### Feito (verificado ao vivo; 0 erros de console)
- **Auto-análise VISÍVEL**: `mentorPlanoNaoVisto()/marcarPlanoVisto()` no store; card
  do Mentor no Hoje prioriza o plano novo (1ª frase + "Ver o plano completo (N)");
  selo "plano novo" na barra; toast pós-boot com ação "Ver plano" quando a
  auto-análise roda; abrir a tela Mentor marca como visto.
- **Pós-simulado**: `comentarSimulado` (provider) + card auto-carregado "O que este
  simulado diz sobre você" (skeleton → md; cache `ss.sim.comentIA`; falha = some em
  silêncio) + CTA primário "Refazer as N erradas" → Modo Foco (`focoErrosIds`).
- **Registro pré-preenchido**: `store.atividadeDoDia()` (questões+acertos de hoje via
  tentativas; flashcards via sm2.lastReview) + faixa "Detectei hoje no app: …" com
  "usar no registro" de 1 toque (testado: abre cards e preenche). Barra de progresso
  conta os 8 tipos de material; modo manual default 0 min.
- **Pós-sessão**: <60% com 5+ questões → toast "Reforçar agora" (pede 5 questões
  fáceis do tópico via chat); senão vale o nudge de replano existente.
- **"Explicar minha semana"** no Acompanhamento (números da semana → chat do Mentor).
- Lembrete diário com DADO REAL (só o item mais urgente); updater com toast
  persistente e % de download.

### Adiado da Fase 3 (retomar depois)
- [ ] Replano PREPARADO (nudge chega com a redistribuição pronta via refinarPlano) —
      hoje o nudge leva 1 clique ao autoAnalisar; a versão "pronta" exige integrar a
      UI de aplicar-refino do Planejamento.
- [ ] Checklist de 1ª semana no Hoje (substituir a tela "Por onde começar") — é
      design de onboarding contínuo; especificar antes (plano §Fase 3 item 8).
- [ ] Briefing pré-foco e demais oportunidades do relatório (§5.6).

## FASE 4 — Teatro de progresso e estados (CONCLUÍDA)

### Feito (verificado ao vivo com IA real; 0 erros de console)
- **Painel de ETAPAS no import de PDF** (`criarPainelEtapas` em documentos.js + CSS
  `.import-etapas`): "Lendo o PDF ✓ N páginas · Montando o sumário com IA ✓ N tópicos ·
  M vinculados ao edital · Preparando o texto ✓" — no lugar de até 6 toasts; erro marca
  a etapa ativa; testado com PDF real (a IA leu o sumário e vinculou ao edital).
- **OCR em lote**: um `toastCarregando` com progresso "i/N (pág. X)" + **Cancelar**
  (novo `opts.aoCancelar` no toastCarregando de ui.js — reutilizável).
- **Lei Seca narrada**: 4 fluxos de geração em série com "Gerando… i/total" e aviso
  do corte de 12 ANTES (iniciarCE, flashcards, questões, grifar-IA).
- **Celebrações**: confetti na conclusão da sessão da Central (guard 1x/sessão);
  "Amanhã voltam N cartões; nos próximos 7 dias, mais M" no fim da fila de flashcards;
  count-up da nota re-anima a cada novo simulado; "digitando" da discursiva idem.
- **Estados**: skeleton de página no pdfviewer; CTA "Limpar filtros" no vazio-de-filtro
  de Questões; CTA "Criar tema com IA" no vazio da Discursiva (reusa gerar-pergunta;
  toggle preserva o ícone via innerHTML).

### Notas
- Riscos visuais menores apontados pelos agentes (espaçamento da linha nova nos
  flashcards; contraste do btn-ghost no vazio) — conferir na próxima passada visual.

## FASE 5 — Dieta de densidade (7 TELAS FEITAS; falta o estrutural da Lei Seca)

### Feito (6 agentes em paralelo + CSS central; verificado ao vivo, 0 erros)
- **Hoje**: duplicação foco×plano morta (P-05); "DOMÍNIO —" órfão removido; juramentos 1×.
- **Acompanhamento**: 11→9 blocos; "Por período"→presets do Histórico; Metas em 1 linha;
  tabela 9→4 colunas (resto na expansão); 4 funções mortas apagadas; "Por banca" RELIGADO.
- **Edital**: 7→5 colunas ("Estudo"=3×·há5d; aproveitamento=pílula+tooltip); links →
  dossiê (card "Links anexados"); summary da disciplina com menu ···; details-manual
  morto→tooltips; relevância nomeada única; anexar link 1 modal.
- **Dossiê**: retrair/remover corrigidos (ações renomeadas, "Tirar do dossiê"); só drag;
  histórico 4 colunas; ícones no lugar de "Mat./Quest./Flash."; "decorar".
- **Materiais**: menu 15→8; "Gerar com IA" visível; "(N req.)" fora; busca automática
  pós-1ª-ativação (`store.indexarFonteAuto`, silenciosa) + "Atualizar índice (N)";
  vocabulário sumário/tópico.
- **Prática/Simulados**: herói "Praticar agora"; streak (flame 3+) + melhor sequência;
  conclusão 3 faixas + "Refazer as N erradas"; "Simulado rápido" 1 clique; Esc→Pausar
  (tela Prova pausada); "Limpar (N)"→menu ··· com confirmação digitada; legenda dinâmica.
- **Config**: autosave universal (debounce + preservação de foco no re-render); IA
  mantém botão; sync 1 frase+details; EMAIL_SUPORTE; aba "Dados & concurso".
- **Lei Seca (subset seguro — VERIFICADO ao vivo)**: "O que mais cai" unificado (zero
  "PQ" na UI); copy fantasma Treinar/Raio-X; acentos do escopo; treinos com default
  1-clique + "Opções…"; duelo respeita escopo; "Ler em foco" único (overlay).
- **FIX P-04 (o bug de conceito mais urgente da auditoria)**: o Modo Foco da Lei Seca
  NÃO marca mais artigo como lido ao exibi-lo — lido = avançar ou botão. As métricas
  de progresso da lei voltam a ser verdadeiras.

### Estrutural da Lei Seca — FEITO (3 agentes sequenciais, verificado ao vivo)
- [x] LEITOR SERENO: barra auto-oculta ao rolar (volta ao subir; trilha fina de progresso
      permanece; reduced-motion ok; handler anti-vazamento em 3 camadas); estatísticas-
      filtro → dropdown "Filtrar"; barra ~13+6 → 7 controles.
- [x] 1 ação por artigo (check + ⋯; favorito/difícil/o-que-mais-cai no menu; badges de
      estado visíveis) — ~1.500 → ~600 nós numa lei de 300 artigos.
- [x] GRIFO ÚNICO: painel-pincel aposentado na Lei Seca (documentos/resumos intactos);
      gesto de seleção (menu flutuante) em leitor, Foco E cards de juris; "Revisar as
      marcas" guarda modos Texto/Só marcas/Recordar + imprimir; cores com fonte única
      (marcacao.js exporta); menu REPOSICIONA no scroll (não fecha mais).
- [x] Foco: "Anotar" abre direto o modo nota (fim do toast-instrução); "Grifar" removido.
- [x] Card de juris: 5 botões → 1 "Estudar" com menu.
- [x] ESTUDAR = lançador (Mentor sugere + escopo + Revisar + Treinar + Gerar; números/
      temas recolhidos); selo duplicado removido. METAS = resumo 1 linha + lista + link
      Planejamento (dashboard "Hoje" removido). IMPRESSÃO no modelo atual (fim do
      modo meta/memoria da v3).

- [x] **SPLIT do leiseca.js FEITO**: 4043 linhas → orquestrador de 933 + 9 módulos em
      src/screens/leiseca/ (estado.js com objeto S das 36 variáveis, grifo, foco,
      leitor, estudar, metas, importar, impressao, pickers). Movimentação mecânica
      byte-verificada; grafo de imports acíclico; smoke-test das 18 rotas OK.

## FASE 6 — Microcopy e Guia (CONCLUÍDA)
- [x] Guia reescrito: 25 seções curtas (intro + 3-6 bullets), 93 emojis→0, BUSCA por
      texto, mentiras corrigidas contra o código real (check-in, sync, autosave,
      barra pós-F1, Lei Seca pós-F5, Central graduada, persona única Mentor).
- [x] Glossário aplicado: "sequência" (fim de Ofensiva na UI), cartão/flashcard (fim
      de "card"), "itens C/E", "ponto ideal: hoje", "Em dia (últimos 30 dias)",
      header da Central reescrito.
- [x] Onboarding alinhado ao Config; confirmações do Edital sem CAPS; aviso de
      direitos autorais curto; sidebar sem assinatura do dev/backend-tag (P-41).
- [x] Restos de "ofensiva" trocados: store (nudge), config (folga), prompt do Mentor
      (instrui dizer "sequência").
- [x] Assinatura do dev renasceu em Config → Suporte, ao lado da versão.
- [x] flashcards "Apagar todos os N flashcards?" sem CAPS.

### Faxina de CSS órfão — CONCLUÍDA (ver "Falta da Fase 0" acima; 2 rodadas, −422 linhas)

## FASE 7 — Bugs restantes (CONCLUÍDA)

Da lista de 27 do relatório, 9 já haviam caído nas fases 0-6. Fechados nesta leva:
- [x] correcao.js: RASCUNHO persistente (tema/resposta sobrevivem a refresh/sync; limpo
      após corrigir) — testado ao vivo (refresh e ida-e-volta de tela).
- [x] simulado.js: tempo por RELÓGIO DE PAREDE (iniciadoEm/pausadoMs/pausadoDesde; aba
      throttled não subconta; pausa desconta) + tempoSeg REAL por questão (marco por
      navegação/resposta; pausa não conta).
- [x] XSS: sanitize() aplicada também na LEITURA de conteudoHTML (resumos + Central;
      sync/import antigo pode não ter passado pelo save) E textoPuro/sanitize parseiam
      em <template> INERTE (div solto executava onerror de <img> hostil mesmo
      desanexado — reproduzido e validado ao vivo com payload).
- [x] ui: celebrarMeta única; tooltip some no render global (não fica preso ao navegar);
      chat fechado inert+tabIndex -1; saudação vira com o dia (check 60s cirúrgico).
- [x] erro-log: APP_VERSION via define do Vite; EMAIL_SUPORTE fonte única (licenca
      importa); ciclo.js com comentário forte na chave legada "A".
- [x] flashcards trunca em palavra; mapas com plural() + handlers mortos removidos.
- [x] dossie.js: impressão de resumos também sanitiza conteudoHTML.
- Fora por decisão: PORTEIRO_SEGREDO da licença no cliente (exigiria servidor — decisão
  de negócio do usuário).

## FASE 8 — Responsivo + a11y (CONCLUÍDA)

- [x] RESPONSIVO: varridas as 19 rotas nos 3 breakpoints (560/900/1200) — ZERO overflow
      horizontal em todas; tab bar mobile e rail colapsado ok; 0 erros de console.
- [x] FOCUS-TRAP: prenderFoco()/cicloTab() em ui.js (pilha de traps, recálculo por Tab,
      restauração de foco) em confirmar/escolher/abrirJanela/pedirNumero/pedirTexto/
      avisoIA/abrirMapaMental; trap central do shell .fc-foco (Modo Foco, 6 consumidores);
      Esc corrigido em pedirNumero/pedirTexto/avisoIA. Testado ao vivo: 25 Tabs presos,
      Esc fecha, foco volta ao gatilho.
- [x] ARIA: role=tab + aria-selected nos .seg via pós-processo central em main.js
      (MutationObserver, pula role=group); #toasts e placar do foco com aria-live=polite.
- [x] :focus-visible: 3 furos de especificidade fechados (.btn/.lnk, .seg > button,
      itens dos popovers); padrão global via --ring mantido; anel visível nos 2 temas.
- Fora por escopo: setas ←/→ nos tablists, aria-controls/tabpanel, paleta/chat (fluxo
  de foco próprio).

## Armadilhas conhecidas (não tropece)

- `.plano-h` (styles.css ~5423) vence as utilitárias por vir DEPOIS — não migrar
  margens de elementos .plano-h para `.u-mb-*` sem mover a regra.
- O guard de scripts de CSS: NUNCA substituir hex em regras que DEFINEM custom
  properties (o :root chega ao parser com o comentário grudado no seletor).
- `prefers-reduced-motion` já cobre animações; manter esse padrão nas novas.
- O dev server na porta 1420 é do usuário — não matar o processo.
- HTML de impressão (funções print*/imprimir*/impressaoHTML) usa style inline de
  propósito; não migrar.
- `--fw-regular` = 450 (não 400): trocar font-weight:400 por ele MUDA o visual — só
  onde autorizado.
