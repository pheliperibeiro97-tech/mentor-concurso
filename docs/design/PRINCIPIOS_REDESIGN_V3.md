# Princípios do Redesign v3 — base para generalizar às demais telas (Fase 4)

> Destilado da construção da tela **Hoje** (a tela-modelo). Toda tela nova da Fase 4 deve
> ser conferida, item a item, contra esta lista, mantendo **sincronia visual com o Hoje**.
> Referência do "como fazer" e, sobretudo, do "como o usuário quer" (feedback real).

---

## 0. Regra de ouro (meta-princípio)
**Redesign REAL, não reskin.** Mover/redispor a informação, nunca perdê-la. Preservar
TODAS as funções e a **sincronização** entre módulos. Cada tela mantém seu papel; muda a
disposição e a exibição, não o que ela faz. Antes de declarar pronto: comparar **elemento a
elemento** com o objetivo e ser **crítico** (o usuário pediu isso repetidamente).

---

## 1. Linguagem visual (identidade)
- **Dois temas SEMPRE** (claro/escuro). Print crítico nos DOIS antes de dar como pronto.
- **Ícones Lucide, ZERO emojis.** Usar `icone("nome")`; se faltar, importar em `src/icones.js`
  (ex.: adicionamos `rotate-ccw`). Nada de glifos/emoji como ícone (o `＋` foi removido).
- **Números em mono** (`font-variant-numeric: tabular-nums`, `var(--font-mono)`) para KPIs,
  tempos, contagens, percentuais.
- **Orb = a voz da IA.** Esfera de plasma animada em canvas (`src/orb.js`), montada a cada
  render por `montarOrbs()`; o loop se encerra sozinho quando o `.orb` sai do DOM (sem
  vazamento); respeita `prefers-reduced-motion`. Aparece onde a IA "fala" (Mentor, eyebrow do
  foco, selos de geração).
- **Movimento calibrado, 1x por sessão:** count-up de números (`ativarCountUp`), reveal de
  seções (`ativarReveal`/`[data-reveal]`), digitação/stream do texto do Mentor
  (`revelarTexto`). Guardas de módulo evitam re-animar a cada re-render. Tudo respeita
  reduced-motion.
- **Cards + respiro.** Superfícies calmas; conteúdo com ar (ver §3).

## 2. Regra de acento (cor) — CRAVADA, com nuance
- **AZUL cobalto = você / o app** (CTAs primários, logo, links de navegação, "você escolheu").
- **CIANO→índigo = só quando a IA fala** (orb, Mentor IA, ✦, "gerar", "sugerido pelo Mentor").
- **Nuance aprendida (CTA da fase):** quando um card tem tema de **fase** (Estudo=azul,
  Prática=verde, Revisão=âmbar), o CTA principal daquele card pode adotar a **cor da fase**
  (`var(--cor)`) para integrar — levemente escurecida p/ o texto branco ficar legível em
  fases claras, e com **glow suave na mesma cor** (nunca um glow forte fixo que destoa).
- **Cor semântica** (verde/âmbar/vermelho) é separada do acento e vale para desempenho/estado.
  Constância NUNCA pune (dia sem estudo é neutro, nunca vermelho).
- Links de "ver mais/abrir" = azul (`.lnk` / `--primary`), não cinza.

## 3. Espaçamento e composição
- **Nada "grudadinho".** Hierarquia com ar de verdade entre rótulo → título → meta → ações
  (o pior caso que corrigimos: gap tópico↔meta de 2px → ~20px). Sem exagero.
- **Seções não colam.** Respiro claro entre blocos (ex.: "Revisões de hoje" vazio ganhou
  margem até "Plano de hoje").
- **Hero-first:** o item mais importante da tela é o herói no topo.
- **Alinhamento de colunas:** topos alinhados. NÃO deixar um controle secundário empurrar uma
  coluna para baixo (movemos "Registrar sessão" para a linha do título para os topos de foco
  e anéis baterem). Bordas inferiores alinhadas via grid `align-items: stretch` + coluna
  lateral `align-self: start` + card em `flex-column` com as ações no rodapé (`margin-top:auto`).
- **Cabeçalho de seção padrão** (`.plano-h`): `h2` + chip de contagem (mono) + espaçador +
  link azul à direita. Reusar em toda seção listável.
- **Sem card onde o protótipo usa seção plana:** listas de chips (ex.: Revisões) = cabeçalho +
  faixa de chips direto na página, sem fundo de card. Faixas slim no lugar de `<details>` pesados.

## 4. Honestidade de dados e rótulos (recorrente — leve a sério)
- **Nunca inventar dado; nunca caixa vazia falsa.** MAS mostrar **estado vazio informativo**
  quando ajuda o usuário — com frase **sempre verdadeira**. Ex.: preferir "Você está em dia com
  as revisões" (verdade se nada venceu OU se já concluiu tudo) a "nada vence hoje" (pode ser
  falso). Degradar com elegância para usuário novo/base vazia.
- **Rótulo espelha o ESTADO real, não uma suposição.** Bug recorrente: "sugerido pelo Mentor"
  aparecia mesmo após o usuário trocar tópico/fase. Regra: só é "sugerido pelo Mentor" quando
  **fase E tópico** batem com a sugestão (`plano.fase` + `plano.topico`); ao desviar em qualquer
  um → "sua escolha"/"Você escolheu" (azul = você). **Toda tela: conferir se selos/badges
  sincronizam com o estado ao vivo.**
- **Mentor propõe, não executa.** A IA sempre sugere e pede aprovação; nunca cria/altera sozinha.

## 5. Interação
- **Quem decide é o usuário:** trocar tópico = seletor disciplina→tópico (não aleatório).
- **Clicar um item do plano = vira o foco.**
- **Formulário pesado = modal** (`abrirJanela`), reusando a lógica existente (ex.: registro de
  sessão saiu dos `<details>` inline para uma janela; cronômetro no flutuante/tela cheia).
- **Atalhos onde se espera:** ESC fecha tela cheia/modais; controles do cronômetro na ordem
  natural (Zerar = ícone ao lado do play, DEPOIS dele; "Registrar sessão" como texto na tela
  cheia; ícone-only só na pill compacta).
- **Não duplicar controle** sem motivo (o usuário sinaliza redundância — ex.: dois ícones de
  cronômetro).

## 6. Estética — armadilhas que o usuário reprovou (evitar!)
- **Glow forte destoa.** Sombras coloridas fortes e fixas (o glow azul do CTA) foram reprovadas
  → suave e na cor do contexto.
- **Botão "split" (ícone colado no CTA) ficou "horrível"** → preferir controles **separados e
  rotulados** a um ícone grudado.
- **Ícone-only é ambíguo** para ação secundária → rótulo com texto é mais claro ("Cronômetro",
  não só o relógio).
- **Texto em gradiente some ao ser SELECIONADO** (`color:transparent` + `background-clip:text`)
  → sempre adicionar `::selection`/`::-moz-selection` com fill sólido.
- **Sem superlativo automático.** Não declarar "premium/lindo" sozinho; mostrar e deixar o
  usuário julgar.

## 7. Processo / QA (regras de ouro do método)
1. **Build verde** a cada passo (`npm run build`).
2. **Print CRÍTICO nos 2 temas** antes de declarar pronto (tamanho, alinhamento, ar, contraste).
3. **QA sem poluir o store:** mockar no DOM via `evaluate`; NÃO registrar sessões de teste;
   ao mexer no cronômetro em teste, zerar depois. Prints temporários em
   `C:\Users\felip\qz-*.png` (limpar ao fim).
4. **Buscar com `rg` (Bash) ou a tool Grep**, nunca `grep`/`cat` improvisados em diretório.
5. **Protótipos** servidos via `public/*.html` (untracked, não commitar).
6. **Perguntar só quando a decisão é genuinamente do usuário** (gosto visual): recomendar +
   deixar escolher (AskUserQuestion). Caso contrário, agir e narrar.
7. **Iterar em passos pequenos**, responder ao feedback rápido, ser crítico e específico.

## 8. Ferramentas/infra reaproveitáveis (já existem — usar, não recriar)
`ativarCountUp`, `ativarReveal`, `revelarTexto`, `abrirJanela`/`abrirJanelaFluxo`, `escolher`,
`pedirNumero`, `toast`, `confetti`, `plural`, `header`, `faixaIA` (ui.js); `progressRing`,
`heatmapConstancia` (viz.js); `montarOrbs` (orb.js); `icone` (icones.js); cronômetro global
(cronometro.js); `bindActions` (delegação por `data-action`, o mais interno vence).

---

## Checklist rápido por tela (Fase 4)
- [ ] Papel e TODAS as infos preservadas? Sincronização entre módulos intacta?
- [ ] Hero-first; hierarquia com ar; seções não colam; topos/bordas alinhados.
- [ ] Acento correto (azul=você / ciano=IA); CTA integra com o card; glow suave.
- [ ] Ícones Lucide; números mono; orb onde a IA fala; movimento 1x/sessão + reduced-motion.
- [ ] Estados vazios informativos e frases sempre verdadeiras; selos sincronizados ao estado.
- [ ] Formulário pesado em modal; atalhos (ESC); controles na ordem natural.
- [ ] Build verde + print crítico nos 2 temas.
