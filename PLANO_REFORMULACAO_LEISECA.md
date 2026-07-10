# Reformulação da tela Lei Seca — Plano de implementação (v2, revisado e auto-auditado)

> Base: documento "REFORMULAÇÃO DA TELA LEI SECA.docx" + mapeamento real do código (4 auditorias: Ler, Estudar, Metas, design/serviços). v2 = releitura integral do doc + auditoria crítica do próprio plano v1 + trilha visual elevada a 1ª classe. Atualizado: 2026-07-07.

## 0. Princípios-guia (o que não pode ser esquecido em nenhuma fase)

1. **Visual ultra-premium é requisito, não acabamento.** O doc dedica seções inteiras a tipografia, paleta, microinterações e "a interface deve desaparecer, deixando a lei protagonista". Toda fase entrega valor **e** visual; nada de "polir no fim". → **Trilha Visual dedicada (§4)**, que corre em paralelo e tem specs concretos.
2. **Preservar 100% das funcionalidades** (doc l.3, l.13). Trocar o card pelo leitor **não pode perder** nenhuma ação atual (grifo, nota, incidência, revogado, promover revisão, editar, remover, badges). → **Checklist de paridade (§8)**.
3. **~70% já existe** no Mentor: integrar > recriar. (grifos=`marcacao.js`, revisão espaçada, geradores, incidência, cronômetro vinculável, busca semântica, `gerarPlanoSemana`, `viz.js`).
4. **5 perfis de usuário** (doc l.311-316) devem todos ser servidos: leitura corrida · estudo direcionado · revisão rápida · consulta profissional · preparação intensiva. → **Mapa perfil→feature (§9)**.
5. **Ciclo contínuo**: cada aba alimenta as outras sem configuração manual; o app sempre sabe "o próximo passo".

## 1. Auditoria crítica do plano v1 — erros e simplificações que corrigi

Relendo o doc contra o plano v1, encontrei o seguinte (sendo chato comigo mesmo, como pedido):

| # | Onde eu errei/simplifiquei no v1 | Realidade | Correção no v2 |
|---|---|---|---|
| E1 | Tratei o **visual como "polish" tardio** | O doc trata visual como núcleo; usuário reforçou "ultrapremium é relevante" | **Trilha Visual dedicada (§4)** com type scale, paleta, motion, elevação, sépia — entra em toda fase de UI |
| E2 | "Cloze multinível = varia `max` de lacunas" | Doc pede **médio = remover expressões, difícil = remover frases, extremo = digitação livre**. O `selecionarLacunas` atual é por palavra-chave. Blanking de expressão/frase e input livre são **lógica nova**, não um parâmetro | Fase 5 detalha 4 modos reais (palavra/expressão/frase/digitação) |
| E3 | Reusar `comDivisoriasEstrutura` (breadcrumb compacto) **no leitor** | O breadcrumb compacto foi feito p/ a lista antiga. O leitor quer **hierarquia tipográfica elegante** (Título Lei 42px, Capítulo 22px). São renders diferentes | Fase 1 cria render de estrutura **específico do leitor** (heading elegante), separado do breadcrumb da lista |
| E4 | "Questões: tempo estimado = NOVO" | O doc só quer **exibir** o tempo estimado (trivial), não limitar por tempo | Reclassificado como trivial |
| E5 | "Tempo por capítulo" como reuso de `cronometro.vincular` | O cronômetro vincula por **tópico/lei**, não por capítulo. Atribuir tempo por capítulo exige rastrear qual capítulo estava visível na leitura | Fase 5 marca como **novo** (atribuição por capítulo via scroll do leitor) — ou adiado |
| E6 | "Inteligência" (sempre erra 'competência') como só "sugestão IA" | Detectar "sempre erra artigos de competência" exige **classificar artigos por tema** (competência/prazo/quórum…). Essa dimensão **não existe** | §6 adia com motivo: precisa de camada de tag temática (proposta como sub-projeto IA) |
| E7 | Não explicitei o **scroll-spy** da barra superior | Doc l.140-146: a barra mostra "Art. 156 / 145/416 / 35%" **conforme rola** (artigo/capítulo atual) | Fase 1a inclui scroll-spy do artigo/capítulo corrente |
| E8 | Sépia tratado como "3º tema fácil" | Um 3º tema afeta **todo** o CSS (grifos, badges, botões, gráficos), não só o leitor | §4 trata sépia como trabalho de design-system completo |
| E9 | Não garanti **paridade de funcionalidades** ao trocar o card | Doc exige preservar tudo | §8 checklist de paridade |
| E10 | `lidoEm` como "data" | Doc quer histórico "Hoje 14:32" (l.230) → precisa **datetime**, não date | Modelo usa ISO com hora |

## 2. Decisões de arquitetura (travadas)

| # | Decisão | Status |
|---|---|---|
| A1 | Leitor = **uma lei por vez + hub** (lista de leis + continuar leitura) | ✅ confirmado pelo usuário |
| A2 | Metas **DELEGA** ao Planejamento global (`gerarPlanoSemana`, `redistribuirAtrasadas`, `config.*`); não duplica | ✅ confirmado |
| A3 | Campos novos via **métodos próprios** (não `editarIndicacao`, que tem whitelist) | ✅ |
| A4 | **Não mutar `texto`** ao renderizar (offsets dos grifos) | ✅ |
| A5 | **Reaproveitar** infra existente | ✅ |
| A6 | **Trilha Visual** corre em paralelo e é gate de qualidade de cada fase de UI | ✅ (novo no v2) |
| A7 | **Escada de revisão**: reaproveitar a existente **inserindo só o dia 3** → `[1, 3, 7, 15, 30, 60, 120]` (não criar escada nova) | ✅ confirmado pelo usuário |
| A8 | **Feature-parity obrigatória** ao substituir o card | ✅ (novo no v2) |

## 3. Modelo de dados — mudanças

**Novos campos `indicacao` (lei):** `favorito` (bool), `dificil` (bool; ao ligar agenda escada `[1,3,7,15,30,60,120]`), `lidoEm` (**ISO datetime**).
**Novos campos `config`:** `leitura {fonte:"inter"|"serif"|"mono", tamanho:"pequena"|"media"|"grande", espacamento:"normal"|"confortavel"|"muito", tema:"claro"|"escuro"|"sepia"}`; `ultimaLeitura {[norma]:{indicacaoId, pct, em}}`; `diasFeriado[]` (ISO).
**Novos métodos store:** `toggleFavorito`, `toggleDificil` (agenda escada), `marcarLidoComData`, `selecionarPorEstrutura(norma,{nivel,rotulo})`, `errosPorArtigo(tipo)`, `resumoLeituraHoje(norma?)`, `estrelasIncidencia(0-100)→1-5`.
**Assets novos:** `@fontsource` serif + `--font-serif`; 3º tema `:root[data-tema="sepia"]` (design-system).
**Dimensão adiada (E6):** tag temática por artigo (competência/prazo/quórum) — habilita "inteligência" e o grupo Memorizar; proposta como sub-projeto de classificação IA (§6).
**Bug latente a corrigir:** `memoriasParaRevisar` conta `promovido||modo==="memoria"`, mas a Central de Revisões só inclui `modo==="memoria"` → promovidos somem da Central. Reconciliar na Fase 5.

## 4. TRILHA VISUAL ultra-premium (paralela; specs concretas)

Objetivo: "a interface desaparece, a lei é protagonista" (doc l.317). Corre junto de cada fase de UI e é critério de aceite.

**4.1 Type scale (doc l.287-301) → tokens novos:**
| Papel | Tamanho / peso | Token |
|---|---|---|
| Título da lei | 42px / 700 | `--fs-lei` |
| Capítulo/Título estrutura | 22px / 600 | `--fs-cap` |
| Cabeçalho de artigo ("Art. 1º") | 20px / 600 (doc l.294) — mas **menor** no corpo (l.62-65 "fonte menor, cinza escuro, 600") | `--fs-art` |
| Texto do dispositivo | 18px / 400, line-height 34px | `--fs-corpo` / `--lh-corpo` |
| Notas | 15px | `--fs-nota` |
> ⚠️ Conflito interno do doc: l.294 diz artigo 20px/600; l.62-65 pede "Art. 1º" em fonte **menor**. Interpretação: o **texto** é 18px; o **rótulo** "Art. 1º" é destaque discreto (~14-15px, 600, cinza escuro), não 20px. Decidir na Fase 1d.

**4.2 Paleta (doc l.271-286) × tokens atuais — reconciliação:**
| Papel | Doc | Token atual | Ação |
|---|---|---|---|
| Azul ação | `#3B82F6` | `--primary-l` (claro) = `#3b82f6` ✅ | usar `--primary-l` no leitor |
| Verde | `#22C55E` | `--success` = `#0d9b6c` (teal) ✗ | **decidir**: token novo `--verde-leitura:#22C55E` ou aceitar o teal atual |
| Cinza texto | `#374151` | `--text`≈`#1e293b` (próximo) | usar `--text` |
| Cinza claro / separador | `#E5E7EB` / `#ECECEC` | `--border`≈`#e2e8f1` | separador de artigo = tom dedicado |
| Fundo | `#F8FAFC` | `--surface-2`≈`#f4f7fc` | ok |
| Sombra máx | `0 1px 2px rgba(0,0,0,.05)` | vários `--elev-*` | leitor usa **elevação mínima** (sem sombra forte) |

**4.3 Espaço & coluna:** coluna de leitura **máx 850px**, centralizada, margens **48/24/18px** (desktop/tablet/mobile); "nunca ocupar a tela inteira" (l.83).

**4.4 Motion (doc l.260-270) — timings exatos:** lido = check "desenha" 200ms; favorito = preenche 150ms; troca de artigo = fade 250ms; "nunca exagerado" (usar `prefers-reduced-motion`).

**4.5 Sépia (3º tema):** bloco `:root[data-tema="sepia"]` cobrindo TODOS os tokens (texto, fundo creme, grifos legíveis no creme, badges, gráficos). Trabalho de design-system, não só do leitor.

**4.6 Densidade "e-book":** separadores só tipográficos (linha 1px `#ECECEC`), sem cards/sombras/bordas pesadas; estrutura em hierarquia tipográfica elegante (não caixas).

## 5. Ledger de prestação de contas — cada ideia do doc e sua disposição

Legenda: **PLANO** = no plano/fase X · **CORRIGIDO** = estava raso/errado, ajustado no v2 · **ADIADO(motivo)** = fora do escopo inicial, com razão honesta.

### Ler
| Ideia (linha do doc) | Disposição |
|---|---|
| Sensação de livro / e-book / não-lista (10-12,40-45) | PLANO F1 |
| Estrutura elegante só-tipografia, pouca altura (29-39) | PLANO F1b + CORRIGIDO (E3: render de estrutura próprio do leitor, não o breadcrumb da lista) |
| Separador fino #ECECEC, sem cards/sombras (46-56) | PLANO F1b + Visual §4.6 |
| Cabeçalho "Art. 1º" sem repetir lei (57-67) | PLANO F1b; CORRIGIDO (E1 conflito de tamanho 20px×menor → §4.1) |
| Fonte livro (Inter/serif) 18/34, coluna 850, margens (68-83) | PLANO F1c + Visual §4.1/§4.3 |
| Indentação automática incisos/§/alíneas (84-97) | PLANO F1c (parser de linhas — **novo**, não trivial) |
| Leitura contínua por rolagem (98-102) | PLANO F1b |
| Lido: opacidade 70% + check verde, nunca esconde (103-112) | PLANO F1d + motion §4.4 |
| Favorito = barra azul à esquerda (113-121) | PLANO F0/F1d (campo novo) |
| Grifo estilo Kindle: menu Grifar/Anotar/Copiar/Perguntar-IA (122-130) | PLANO F2 |
| Notas em painel lateral / bottom-sheet, nunca modal (131-139) | PLANO F2 (helper novo em `ui.js`) |
| Barra superior: lei/artigo/145-416/progresso/% (140-150) | PLANO F1a + CORRIGIDO (E7: scroll-spy do artigo/capítulo) |
| Continuar leitura na Home da Lei (151-157) | PLANO F1a (hub) |
| Ir para artigo (digitar nº) + pesquisar palavra (158-165) | PLANO F1a (nav) / F4 (busca) |
| Estrutura recolhível Livro/Título/Capítulo (166-171) | PLANO F1b (accordion no leitor) |
| Modo foco 📖 esconde tudo, barra inferior de ações (172-207) | PLANO F3 (reusa shell `foco-quiz`) |
| Config leitura: fonte/tamanho/espaço/tema claro/escuro/**sépia**/família (208-225) | PLANO F1e + Visual §4.5 |
| Histórico "Última leitura / Hoje / 14:32" (226-230) | PLANO F1a + CORRIGIDO (E10: `lidoEm` datetime) |
| Marcador "Difícil" (usado no Estudar) (231-234) | PLANO F0/F1d (campo novo, cross-tab) |
| Selo de alteração legislativa + resumo no topo (235-241) | PLANO F1d (reusa `novidadeEm`/`limparNovidade`); resumo-topo + gatilho = liga ao "Conferir atualização" existente |
| Pesquisa na lei: textual (abre no artigo) + semântica (242-250) | PLANO F4 (reusa `buscaSemantica`; lei já indexável) |
| Estatísticas topo: lidos/favoritos/difíceis/grifos/anotações (251-259) | PLANO F1a (contagens; favoritos/difíceis dependem de F0) |
| Microinterações 200/150/250ms (260-270) | PLANO Visual §4.4 (elevado de "polish" p/ requisito) |
| Paleta/tipografia/sombra exatas (271-301) | PLANO Visual §4.1/§4.2 |
| Responsividade desktop/tablet/mobile Kindle (302-309) | PLANO Visual §4.3 (mobile = definir alcance; app é Tauri desktop-first) |
| 5 perfis de UX (310-316) | §9 (mapa perfil→feature) |

### Estudar
| Ideia | Disposição |
|---|---|
| "Tudo nasce da leitura" / fontes (318-338) | PLANO F5 (sincronização) |
| Dashboard "Hoje" (leu/questões/%/vencidas/difíceis/tempo) (339-350) | PLANO F5 (usa `resumoLeituraHoje`+`ofensiva`+`memoriasParaRevisar`) |
| Barra superior: Lei/Capítulo atual/estudados hoje/pendentes/sequência (486-492) | PLANO F5 (strip de contexto — distinto do dashboard) |
| Prioridade Inteligente "Hoje recomendamos" (351-360) | PLANO F5 (reusa `_panoramaLeiSeca`/`snapshotMentor`) |
| 3 grupos Revisar/Treinar/Memorizar (361-386) | PLANO F5 (reorg) |
| Revisar anotações/grifos (357,370) | PLANO F5 (reusa modo "recordar" de `marcacao.js`) |
| Artigo aleatório (376) | PLANO F5 (modo novo trivial) |
| Memorizar temático: incisos/prazos/competências/quóruns/sequências/palavras (377-383) | PARCIAL: cloze cobre prazos/quóruns; **competências/sequências/palavras exigem tag temática** → ADIADO(depende de §6 tag temática) para os temáticos; incisos/prazos/quóruns via cloze na F5 |
| Sincronização grifo→completar(usa o trecho)/favorito→revisão/difícil→escada (387-404) | PLANO F5 (gatilhos; "cloze do trecho grifado" é integração específica) |
| Caderno de erros por-artigo "errou 4x" (405-417) | PLANO F5 (`errosPorArtigo` novo) |
| C/E banca: tema/artigo/dificuldade/incidência + pós-resposta texto integral/grifo da palavra (418-433) | PLANO F5 (reusa `gerarTreino`+`pratica-ce`); **"banca mais semelhante" REMOVIDO do escopo** (decisão do usuário) |
| Completar artigo 4 níveis (434-444) | CORRIGIDO (E2: médio/difícil/extremo = lógica nova de blanking/typing, não `max`) |
| Flashcards inteligentes + "abrir artigo completo" (445-453) | PLANO F5 (reusa `gerarFlashcardsIA`; botão cross-tab p/ leitor) |
| Questões: qtd/tempo estimado/dificuldade + escopos (454-465) | PLANO F5; CORRIGIDO (E4: tempo é só exibir) |
| Incidência estrelas + ordenar maior/menor/nunca (466-477) | PLANO F5 (reusa `porIncidencia`; estrelas via `estrelasIncidencia`) |
| Inteligência: "sempre erra competência → recomenda" (478-485) | ADIADO(E6: precisa tag temática por artigo — §6) |
| Filtros inteligentes (10) (493-506) | PLANO F5 (unificar com escopos) |
| Gamificação: sequência/dias/meta semanal/% dominada/nível revisão (507-516) | PLANO F5 (reusa `ofensiva`; **"% dominada"/"esquecidos" precisam definição operacional** — §6) |
| Estatísticas/gráficos: tempo por lei/capítulo, dominados/esquecidos, evolução (517-527) | PLANO F5 (reusa `viz.js`); CORRIGIDO (E5: tempo por capítulo = novo/adiado) |
| Sincronização com IA (sugere gerar 20q/10fc/1rev) (528-535) | PLANO F5 (IA proativa; "Mentor sugere, não executa") |

### Metas
| Ideia | Disposição |
|---|---|
| Vira "Planejamento Inteligente" (536-541) | PLANO F6 |
| Dashboard (meta diária artigos/concluído/faltam/tempo) (542-553) | PLANO F6 |
| Metas por Lei/Livro/Título/Capítulo/Seção/intervalo/artigos/favoritos/difíceis/alterações (554-571) | PLANO F6 (`selecionarPorEstrutura`+`selecionarArtigos`) |
| Planejamento automático (horas/prova/dias/domingo/feriados/leis prioritárias/qtd revisões) (572-583) | DELEGA(A2) ao `gerarPlanoSemana`; **feriados** = novo em `config` |
| Cronograma visual calendário por dia (584-593) | PLANO F6 (estende grade Semana do Planejamento) |
| Replanejamento "perdeu 2 dias" (594-600) | DELEGA(A2) `redistribuirAtrasadas` |
| Metas inteligentes (tempo/questões/flashcards/revisões/acertos/capítulos) (601-609) | PLANO F6 (quantitativas — parte novo) |
| Linha do tempo hoje/amanhã/semana/até prova (610-617) | PLANO F6 (reusa "Próximas revisões") |
| Progresso por meta (618-627) | PLANO F6 (novo; metas hoje são binárias) |
| Integração cascata concluir→meta→revisão→estudar→stats→calendário (628-641) | PLANO F7 (parte existe; fechar lacunas) |
| Modo concurso (Magistratura/MP… sugere leis/ordem/peso/incidência/cronograma) (642-664) | **REMOVIDO do escopo** (decisão do usuário) |
| Filosofia: ciclo contínuo / "próximo passo" / nunca "o que faço agora?" (665-672) | PLANO F7 (checklist de gatilhos; não é feature única) |

**Itens REMOVIDOS do escopo (decisão do usuário):**
- **Banca mais semelhante** (Estudar) e **Modo concurso** (Metas) — fora do escopo. Simplifica o plano e elimina a dependência de dados que não existiam (banca por questão / catálogo de concursos).

**Itens ADIADOS — justificativa honesta (não "injustificável"):**
- **"Inteligência" por tema** e **grupo Memorizar temático** (competências/sequências): faltam **tags temáticas por artigo**. Proponho um sub-projeto de classificação (IA marca cada artigo com temas), que destrava os dois de uma vez.
- **Tempo por capítulo** e **"% dominada / artigos esquecidos"**: precisam de **atribuição de tempo por capítulo** e de uma **definição operacional** de dominado/esquecido. São fazíveis, mas exigem decisão de regra antes de codar (proposto na F5 como sub-itens com pergunta).

## 6. Definições que preciso fechar antes de codar os itens "inteligentes"
1. **Tag temática por artigo** (competência/prazo/quórum/…): aceito um sub-projeto onde a IA classifica cada artigo em temas? (destrava "inteligência" + Memorizar temático)
2. **"Artigo dominado"** = ? (proposta: ≥3 revisões "ok" **e** ≥80% de acerto). **"Esquecido"** = revisão vencida há > X dias. Fecha a regra?
3. **Tempo por capítulo**: aceito atribuir o tempo do cronômetro ao capítulo **visível** durante a leitura (aproximação), ou deixo só "tempo por lei"?
4. **Verde**: crio `--verde-leitura:#22C55E` (fidelidade ao doc) ou uso o `--success` teal atual?

## 7. Plano por fases (revisado)

> Ordem por dependência. **A Trilha Visual (§4) é gate de aceite de F1, F3, F5, F6.** O leitor (F1) é a prioridade nº1 do doc.

- **F0 — Fundações de dados** (campos/métodos §3; sem UI). Baixo risco.
- **F0-V — Fundações visuais**: tokens novos (`--fs-lei/cap/art/corpo`, `--font-serif`, separador, motion vars), tema **sépia** base, reconciliação de paleta (§4). Habilita todo o resto com consistência.
- **F1 — Leitor (coração do doc)**: 1a hub+barra superior(scroll-spy)+progresso+continuar+ir-para-artigo+stats-topo; 1b render contínuo anti-card + estrutura elegante recolhível; 1c tipografia livro + indentação incisos/§/alíneas; 1d estados por artigo (lido/favorito/difícil/incidência/selo) + microinterações; 1e config de leitura (fonte/tamanho/espaço/tema incl. sépia). **Gate visual §4.**
- **F2 — Grifos/Notas Kindle + Perguntar à IA**: menu flutuante de seleção; painel lateral/bottom-sheet (helper novo); render de grifos no fluxo; Q&A do trecho (reusa RAG).
- **F3 — Modo foco leitura**: reusa `foco-quiz`; barra inferior premium; cronômetro vinculado à lei.
- **F4 — Busca**: textual (abre no artigo) + semântica por norma (reusa `buscaSemantica`).
- **F5 — Estudar (Centro de Revisão)**: dashboard + strip de contexto + prioridade inteligente; 3 grupos; escopos/filtros unificados; C/E banca (cabeçalho + pós-resposta); **cloze 4 níveis reais (E2)**; flashcards + "abrir artigo"; estrelas + ordenação; caderno de erros por-artigo; sincronização (grifo→cloze do trecho / favorito→revisão / difícil→escada `[1,3,7,15,30,60,120]`); gamificação; estatísticas (`viz.js`); IA proativa; reconciliar bug promovido×Central.
- **F6 — Metas (delega — A2)**: seletor de escopo (estrutura/intervalo/flags); dashboard de artigos; metas quantitativas + progresso; feriados; linha do tempo; calendário (estende Planejamento). Delega agendamento/replanejamento ao global.
- **F7 — Ciclo contínuo**: gatilhos cruzados + "próximo passo".
- **Sub-projeto IA (paralelo, quando aprovado)**: tag temática por artigo → destrava "inteligência" + Memorizar temático.

> "Banca semelhante" e "Modo concurso" foram **removidos do escopo** (decisão do usuário) — não há mais Fase 8.

## 8. Checklist de paridade (nada pode se perder ao trocar o card — A8)
Ao migrar de `itemHTML` (card) para o leitor, garantir que sobrevivem: marcar/desmarcar lido · grifo (`toggle-marcar`/`montarMarcacao`) · incidência ★ e mini-barra · selo revogado/novidade/ano · vínculo de tópico · promover/despromover revisão · conferir vigência · "já vi novidade" · editar · revogar/reativar · remover · abrir fonte · quebrar teses (juris) · impressão. Cada um mapeado para a nova UI (inline discreto, menu ⋯ do artigo, ou barra do modo foco).

## 9. Mapa perfil → feature (garantir que os 5 perfis são servidos)
- **Leitura corrida**: leitor contínuo, continuar-leitura, modo foco, config de leitura. (F1/F3)
- **Estudo direcionado**: navegar por capítulo, grifos/notas, ir-para-artigo. (F1/F2/F4)
- **Revisão rápida**: filtros favoritos/difíceis/alterados, escopos do Estudar. (F5)
- **Consulta profissional**: busca textual/semântica, copiar trecho, selo de alteração. (F4/F2/F1)
- **Preparação intensiva**: dashboards, estatísticas, integração 3 abas, planejamento. (F5/F6/F7)

## 11. Craft visual — o que faz parecer premium DE VERDADE (3ª auditoria)

O §4 cobria tokens/paleta/motion; faltava o **craft** que separa "bonito" de "ultrapremium":
- **Coerência com o Redesign v3 do app** (já em execução: azul=app / cyan=IA, Lucide, casca topbar+rail): o leitor deve falar a MESMA língua visual, não inventar outra. **Gate: nada na Lei Seca pode destoar do v3.**
- **Micro-tipografia de livro**: medida ótima (~66ch dentro dos 850px), alinhado à esquerda (não justificado — melhor p/ texto legal), hifenização OFF, controle de viúvas/órfãs, números tabulares nas referências, `Art. 5º` sem quebrar (nbsp), aspas e travessões corretos. É isto que faz "parecer livro".
- **`::selection` custom** (seleção estilo Kindle) + contraste dos grifos verificado nos **3 temas** (claro/escuro/sépia).
- **Skeletons, não spinners**: estados de carregando (buscar lei, indexar semântica, gerar IA) como *skeleton*; **empty states** premium (lei nenhuma importada, capítulo sem grifos) com orientação, não vazio seco.
- **Transições** hub↔leitor↔foco (fade/shared-element 250ms) e **scroll-shadow** sutil na barra superior fixa (profundidade sem sombra pesada).
- **Barra de progresso premium**: fina, gradiente, preenchimento animado (não o bloco `██░░` do rascunho).
- **Navegação por teclado** (premium de leitura): j/k artigo, `/` buscar, `f` favorito, `←/→` no foco; foco-ring elegante.
- **Emojis do doc → Lucide**: o modo foco no doc usa 📖⭐🖍📝🔎; a regra do app é **glifo Lucide, sem emoji cru** — traduzir todos.
- **Índice de grifos/anotações da lei** ("My Clippings" do Kindle): uma visão que lista todos os grifos e notas — reusa o dossiê de marcações que já existe.

## 12. Funcionalidade — lacunas do 3º passo (o doc não disse, mas importa)

- **⚠️ Tela gêmea Jurisprudência**: `leiseca.js` renderiza Lei Seca **e** Jurisprudência (`renderIndicacoes`). Juris **não tem** `estrutura`, nem faz sentido "leitor de livro". **Decisão nova (A9):** a reforma do leitor é **só Lei Seca**; a Jurisprudência mantém a lista atual (ou ganha versão enxuta). Não pode quebrar ao mexer no arquivo compartilhado.
- **⚠️ Performance/virtualização**: CPC = 1005 artigos, CF idem. Renderizar tudo num scroll contínuo + grifos pode travar. **Decisão nova (A10):** leitor com **render por capítulo/janela (virtualização leve)** ou lazy por seção; não montar 1000 nós de uma vez.
- **Capítulo concluído** (doc l.334 lista como fonte do Estudar): ação de **marcar capítulo inteiro como lido** + estado derivado "capítulo concluído". Faltava.
- **Copiar com referência**: "copiar" (l.128) deve oferecer copiar o texto **+ `Art. X, CP`** (toque jurídico premium).
- **Integração do hub com Importar/Conferir atualização**: o hub da lei deve trazer os fluxos que já consertamos (importar do Planalto, conferir atualização) como ações de primeira linha.
- **Nota livre por artigo** vs nota-ancorada-em-grifo: o doc diz "cada artigo pode ter notas" (l.132) — hoje a nota é presa a um grifo (cor comentário). Decidir se cabe uma nota **do artigo** (sem trecho).
- **Lembretes + assistente no "Mais" do foco** (l.195): integrar os recados/FAB e o assistente ao menu do modo foco.
- **"Indicar atualizações"** (l.241): além de "conferir", um caminho do usuário **sinalizar** manualmente que um artigo mudou. Esclarecer escopo.
- **Estado de recolhimento** dos capítulos deve **persistir por lei** (não resetar no reload).

## 13. Não-funcional — "outra coisa" (o que ninguém pediu mas quebra se ignorar)

- **⚠️ Migração de dados**: leis importadas ANTES do parser de estrutura **não têm `estrutura`** → no leitor apareceriam sem divisórias. Precisa de **re-parse/migração** (ou botão "recarregar estrutura da fonte oficial") na F0. Afeta usuários atuais.
- **Sync / churn**: posição de leitura e grifos mudam `modificadoEm` a cada ação → o sync newest-wins pode gerar conflito/ruído entre 2 PCs lendo ao mesmo tempo. Mitigar (debounce; talvez posição de leitura não dispare sync completo).
- **Acessibilidade (a11y)** como trilha: contraste WCAG nos 3 temas, rótulos p/ leitor de tela, foco gerenciável, `prefers-reduced-motion`, tamanho de fonte p/ baixa visão (a config já ajuda).
- **Cota IndexedDB / IA (429)**: gerar cloze/flashcards/questões + embeddings de leis grandes pode estourar cota — respeitar o teto de 12/lote e o tratamento de cota que já existe.
- **Disciplina de verificação**: cada fase entregue com **drive-test real** (CDP na janela Tauri) nos **3 temas**, não só "parece ok". Já é como estou trabalhando.
- **Rollout seguro**: refatorar uma tela compartilhada é arriscado — manter o render antigo atrás de um **flag/toggle** durante a transição, para poder voltar.
- **Auto-cronômetro de leitura**: iniciar/parar o tempo de leitura ao entrar/sair do leitor (vinculado à lei) — premium mede sozinho.

## 14. Decisões novas do 3º passo (somam às 4 da §6)
5. **Jurisprudência (A9)**: fica na lista atual (não vira leitor)? (recomendo sim)
6. **Virtualização (A10)**: aceito render por capítulo/janela p/ leis grandes? (recomendo sim)
7. **Migração**: re-parsear as leis já importadas para ganhar `estrutura` na F0? (recomendo sim)
8. **Rollout com flag** para poder reverter o leitor durante a transição? (recomendo sim)

## 10. Próximo passo
Começar por **F0 + F0-V + F1a** (fundações de dados + fundações visuais + hub/barra do leitor) — baixo risco, e já estabelece a linguagem visual premium que rege tudo. Cada fase entra como bloco aprovável (propor → aprovar → aplicar), com verificação nos 2 temas (+ sépia) antes de declarar pronto. **Gates transversais em toda fase de UI:** craft visual (§11), coerência com o Redesign v3, acessibilidade (§13) e drive-test real nos 3 temas.
