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
- [ ] 122 blocos escuros restantes = DECISÃO DE DESIGN (não mecânico). Mapa por tela:
      Hoje/Mentor 40 · Global 26 · Materiais/Resumos 21 · Foco/LeiSeca 18 · Questões 16 ·
      Acompanhamento 15 · Edital 7 · Chat 4. Padrão dominante: inks 300-shade
      (#93c5fd ×5, #fca5a5 ×4, #86efac ×3) — criar tokens "ink-on-soft" por matiz OU
      aceitar mudança sutil no claro. Gradientes do Modo Foco e leitor Kindle escuro
      são intencionais (deixar).
- [ ] ~540 hexes restantes fora dos blocos escuros → exigem decisão caso a caso
      (valores que NÃO batem com token; trocar mudaria o visual).
- [ ] ~55 grupos de seletores duplicados (mesmo seletor, corpos DIFERENTES — camadas
      de eras; ex.: bloco fq-* definido 2×). Consolidar manualmente um a um.
- [ ] Espaçamentos gap/padding com valores ímpares (5/7/9/11/13px) → grade de 4px.

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

## PRÓXIMAS FASES (3–8)

Seguir o plano-mestre (§9 do relatório da auditoria), na ordem: Fase 3 (IA proativa),
Fase 4 (teatro de progresso no import de PDF), Fase 5 (dieta de densidade tela a tela),
Fase 6 (microcopy/glossário §8 do relatório), Fase 7 (27 bugs com arquivo:linha),
Fase 8 (responsivo/a11y). Cada fase tem instruções por arquivo no relatório.

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
