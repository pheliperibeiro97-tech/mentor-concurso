# Auditoria Visual Fase 4 — consolidado + roadmap

Auditoria exaustiva das ~22 telas contra `PRINCIPIOS_REDESIGN_V3.md` e a tela-referência
**Hoje**. Foco: **VISUAL/UX** (a funcionalidade já existe e NÃO se perde). Régua: "como
destoa do Hoje? o que não é tecnológico? o que falta para ser ultra premium?".

## Achado transversal (vale para quase TODAS as telas)
Boa notícia de honestidade: o bug clássico "sugerido pelo Mentor" (rótulo dessincronizado)
**quase não se repete** — só em `questoes-add.js:96` e no `onboarding` (provedores de IA). O
débito é de **linguagem visual**, não de veracidade. Os 7 padrões recorrentes:

1. **Cabeçalho de seção não usa `.plano-h`** (h2 + chip mono `.cnt` + link azul). Telas usam
   `<h3 style="margin:0">${icone(X)} Título <ⓘ></h3>`. — o desvio MAIS visível. (quase todas)
2. **Glifos de chrome no lugar de Lucide** (viola §1 "zero emojis/glifos"): `ⓘ ▾ ▸ ▴ ‹ › ▲ ▼
   ↑ ↓ ↪ ⠿ ✓ ✗ ⟳ ＋ ▤ ❌ ⏱ ⚠️`. Trocar por `icone("info"/"chevron-*"/"arrow-*"/"check"/"x"/…)`.
3. **Números não-mono** em contagens/KPIs/percentuais. Envolver em `<span class="num">` (nova
   classe: mono+tabular). Ex.: `simulado.sim-nota` (corrigido no CSS), subtítulos, `(N)`.
4. **A IA "fala" sem orb** — onde a IA opina/gera, falta `<span class="orb orb-sm">` + acento
   ciano. Pior caso: `mentor.js` (análise sem orb E sem stream), `revtopico` (avaliação seca),
   `correcao` (feedback com `bot` estático), Dossiê, refino do Planejamento/Edital, onboarding.
5. **Movimento ausente / mal-guardado**: telas "aparecem secas" (sem count-up/reveal). E BUG:
   em `diagnostico`/`dossie` o count-up **re-anima a cada `app.refresh()`** (falta a guarda
   `1x/sessão` que o Hoje tem em `anelAnimou`). `edital` ring sem `count:true`.
6. **`<details>` pesados** repetidos por item/seção → deveriam ser faixas slim (§3).
7. **Estilos inline como layout** (px/margens mágicas) → deveriam ser classes. Pior: `config`,
   `documentos`, `seletor-escopo`.

## Correções de HONESTIDADE (prioridade — classe do bug do Hoje)
- `questoes-add.js:96` — selo "sugerido" não ressincroniza ao trocar o tópico no preview.
- `onboarding.js:310` — provedores "Claude Code local (em breve)"/"Gemini CLI (em breve)" já
  ATIVOS no config como `claude-cli`; values divergentes (`claude` vs `claude-cli`).
- `ajuda.js:15,41` — cópia quebrada: ícone faltando ("marcados com  usam").
- `dossie.js:111` — `revLabel` ternário morto (`${venc?"":""}`); estado vencido perdeu marcador.

## Bases já aplicadas (Fase 4, commit)
- `.btn-primary` global suavizado (era glossy + glow forte). `⌘K`: "Buscar ou perguntar ao Mentor…".
- `.num` (mono+tabular), `.sim-nota` mono, `.page-head h1` text-wrap:balance.

## Método de execução
Convenções PRONTAS (não recriar): `.plano-h`/`.plano-sec`, `.num`, `.orb`/`montarOrbs` (global),
`faixaIA()` (traz orb), `progressRing(...,{count:true})`, `ativarCountUp/ativarReveal/revelarTexto`
(respeitam reduced-motion). Regra da guarda: count-up/stream **1x por sessão** via flag de módulo.
Preservar TODA a funcionalidade (data-action, ids, handlers, contagens, links). Build verde +
print crítico nos 2 temas por leva. Itens estruturais (hero-first, details→slim, inline→classe
em massa) ficam para uma 2ª leva, com cuidado — a 1ª leva é a de maior impacto/menor risco:
**glyph→Lucide · orb-onde-a-IA-fala · `.plano-h` · números mono · guardas de count-up · as 4
correções de honestidade**.
