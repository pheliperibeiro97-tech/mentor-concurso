# Plano — Multi-perfil (multi-concurso)

> **Status:** ✅ **IMPLEMENTADO em 2026-08-03** na branch `feat/multi-perfil` — fases 0a, 0b, 1 e 2.
> Falta só validar no desktop e o teste de sync entre dois aparelhos antes de publicar (seção M).
> O histórico abaixo é mantido: as seções A–G são o plano original, H–M o que a execução mostrou.
>
> ~~APROVADO, adiado para uma versão futura (a pedido do usuário em 2026-07-06).~~
> **REVISADO 2026-07-13** para o contexto atual (sync por senha, web/PWA, Access, restaurar
> da nuvem): ver seção "ATUALIZAÇÃO 2026-07-13" no fim. Decisão-chave travada: **sync POR PERFIL**
> (cada perfil = seu cofre/senha). Sequenciamento atualizado logo abaixo.

## Objetivo e terminologia

Permitir **vários perfis** (concurso + cargo + banca), cada um com seu edital, estudo,
histórico, plano e metas; trocar por um seletor no topo (igual MEI/Estudei).

- **"Perfil" = "concurso"** no nosso app: o `state.concurso` já embute `{cargo, banca}`.
  Então "multi-perfil" e "multi-concurso" são a **mesma feature** — só o nome muda.
  "Perfil" é o rótulo escolhido (mais preciso: cobre o caso raro de mesmo órgão, cargos
  diferentes; e casa com o seletor duplo concurso·cargo do MEI/Estudei).
- Um **perfil** = um concurso (cargo+banca) **+ todo o pacote de estudo daquele concurso**.

## Sequenciamento aprovado (mais seguro)

Fazer a **Fase 0 em duas sub-etapas** para isolar a parte perigosa (o `config`):

- **0a — perfis guardam os dados de estudo do TOPO** (edital, tópicos, questões,
  tentativas, sessões, flashcards, resumos, mapas, missões, simulados, revisoesFeitas,
  embeddings, aulas, provas, editalOficial, marcações, rotinas, redações, errosManuais,
  revisoesTopico, concurso). O **`config` fica GLOBAL por enquanto** (metas, dataProva,
  tema, mentorPlano compartilhados temporariamente). **Sem tocar no `setConfig` → risco baixo.**
- **0b — dividir o `config`**: metas, dataProva, níveis do diagnóstico (niveisDisciplina),
  disciplinasAdiadas, atencaoAdiada, atalhos, bancasPreferidas, baseEstudo, retaFinal,
  mentorPlano, mentorUltimaAnalise, metaDiariaMin/Semanal/Mensal viram **por-perfil**.
  Aqui SIM mexe no `setConfig` (ver aresta 1) com cuidado e teste.
- **Fase 1 — Seletor + troca de perfil** (UI).
- **Fase 2 — Ajustes finos** (prova/metas/sync/busca por perfil).

## Divisão global × por-perfil (decisão aprovada)

| GLOBAL (segue em todo perfil) | POR-PERFIL (é do concurso) |
|---|---|
| Tema, IA (chaves/provedor/modelo), notificações, semáforo (perfRuim/perfBom), paleta de marcação, sidebar, avisos aceitos, pomodoro/som, histPeriodo, materialAgrupamento, dossieOrdem/Ocultas, botoesOcultos, ordemNav, descartarPdf, materialAviso, checkinVisto, revisaoTopicoAuto, novidadesVistas, **dispDiariaMin, diasFolga** (disponibilidade de vida) | Edital + todo o estudo; **metas** (diária/semanal/mensal), **dataProva**, base (edital/cursinho), niveisDisciplina, disciplinasAdiadas, bancasPreferidas, atencaoAdiada, atalhos, retaFinal, **mentorPlano/mentorUltimaAnalise** |

**Casos de fronteira (aprovados):** Lembretes → **global** · Bancas cadastradas → **global**
(FGV serve vários concursos) · Provas importadas → **por perfil**. Indicações → global.

## Técnica de implementação (definida)

- **Formato persistido:** `{ meta, config(global), bancas, lembretes, indicacoes,
  modificadoEm, perfis: [{ id, nome, config:{concurso-config}, ...dados de estudo }],
  perfilAtivo }`.
- **Getters/setters NÃO-enumeráveis** nas chaves por-perfil do `state` (e, na 0b, no
  `state.config`), roteando pro perfil ativo. Assim os ~centenas de `state.disciplinas`
  continuam funcionando **sem reescrever**. E `saveState` faz `JSON.stringify(state)` —
  os não-enumeráveis **somem da serialização**, então o arquivo sai no formato novo, limpo.
  (Confirmado em `persistence.js`: `saveState` = `JSON.stringify(state)`; `exportar` =
  `JSON.parse(JSON.stringify(state))` — ambos compatíveis.)
- **Migração por REGRA (não por lista):** "tudo que não é global vira do perfil".
  `GLOBAL_TOP = {meta, config, bancas, lembretes, indicacoes, modificadoEm, perfis, perfilAtivo}`;
  o resto do topo → perfil. Isso captura chaves **dinâmicas não declaradas** (ver aresta 2).
  Idempotente: se já tem `perfis`, não re-migra. Roda também no estado vindo da nuvem/backup.
- **Instalar acessores** dinamicamente a partir das chaves do perfil ativo (cobre simulados/
  revisoesFeitas sem listar). Reinstalar ao trocar de perfil / carregar / migrar.

## Arestas críticas encontradas (NÃO esquecer)

1. **`setConfig` reatribui o config por spread** — `store.js:5797`
   `setConfig(patch){ state.config = { ...state.config, ...patch }; }` e o `init`
   (`store.js:384`) `state.config = { ...base.config, ...state.config }`. Um spread copia
   só campos **enumeráveis** → **destruiria os getters não-enumeráveis** do config e
   **descartaria silenciosamente** metas/dataProva/mentorPlano. **Na 0b, trocar esses
   pontos por `Object.assign(state.config, patch)` (mutação) ou dividir config em objeto
   próprio por-perfil.** Por isso 0a mantém config global (evita essa aresta).
2. **Chaves dinâmicas não declaradas** no estado real: `simulados`, `revisoesFeitas` (topo)
   e `mentorPlano`, `mentorUltimaAnalise`, `tema`, `pomoAutoAvanca` (config). Não estão no
   `defaultState`. Por isso a migração é por REGRA (whitelist do global), não por lista.

## Arquivos/funções a tocar

- `src/store.js`: `defaultState()` (+ novo `defaultPerfil()`), `init()` (ordem: merge/backfills
  → migrar → instalar acessores), `setConfig` (só na 0b), `exportar` (~5859), `importarBackup`
  (~5881), reset (`state = defaultState()` ~5904), `commit()` (carimba `modificadoEm` no topo — ok).
  Backfills hoje rodam sobre o estado plano; na 0a rodam antes de embrulhar em perfil (1 perfil
  = o ativo). Ao criar 2º perfil (Fase 1) ele nasce de `defaultPerfil()` (não precisa backfill).
- `src/persistence.js`: sem mudança (JSON.stringify já compatível).
- `src/sync.js`: conferir se faz spread do state (não pode derrubar não-enumeráveis) — a
  serialização de sync deve usar `JSON.stringify`/`exportar`.
- **UI (Fase 1):** seletor no topbar (concurso · cargo) → dropdown: trocar · + Novo perfil
  (reusa onboarding) · Editar · Remover. Trocar = `perfilAtivo = id` + reinstalar acessores +
  refresh. Guarda: cronômetro rodando ao trocar → aviso.

## Verificação da migração (obrigatória)

Comparar contagens **antes e depois**. O baseline vigente é o de **2026-08-03**
(`dev/baseline-multi-perfil.json`, ferramenta `dev/baseline-estado.py` — ver seção H).
Qualquer divergência = abortar e corrigir.

~~Baseline de 2026-07-06: 2 disciplinas · 6 tópicos · 15 questões · 50 tentativas · 8 sessões ·
20 flashcards · 2 missões · 2 mapas · 0 documentos · 6 lembretes~~ — **obsoleto**, o estado mudou.

## Riscos & mitigação

- Maior risco = acessos diretos a `state.X` e spreads → mitigado por getters/setters +
  fazer 0a sem tocar config. **Backup automático antes** de migrar; migração idempotente;
  comparar contagens. Manter o formato antigo carregável (migração no load).

---

## ATUALIZAÇÃO 2026-07-13 — adaptar ao contexto novo do Mentor

Desde 2026-07-06 entraram: **sincronização por senha (`src/sync-nuvem.js` = cofre cifrado
no Cloudflare)**, **web/PWA** (roda no navegador/celular, deploy Pages), **Cloudflare Access**
(portão por e-mail), e o **"Restaurar da nuvem" no onboarding** (`restaurarDaNuvem`). O núcleo
do plano continua válido (perfil=concurso, getters não-enumeráveis, migração por REGRA,
sequenciamento 0a/0b, **aresta 1 do `setConfig` spread ainda é a mais perigosa**). O que
FALTA/precisa adaptar:

### A) O GRANDE gap: sincronização × multi-perfil — DECIDIDO (2026-07-13): SYNC POR PERFIL
O plano é anterior ao sync por senha. O motor de sync (`sync.js`/`sync-nuvem.js`) opera sobre
as coleções **no TOPO** do estado (`peso()`, `montarSnapshotSync`, `aplicarRemoto`, `decidir`).
Com multi-perfil as coleções passam para **dentro de `perfis[]`** → o motor quebraria se
sincronizasse o blob inteiro sem adaptação. Duas opções:
- **Sync POR PERFIL (recomendado):** cada perfil tem seu **próprio cofre/senha**. O snapshot de
  um perfil é PLANO (igual ao estado antigo) → o **motor de sync continua quase sem mudança**.
  Casa com o modelo mental ("cada conta = um perfil, seu cofre") e permite ter o perfil de
  outra pessoa só numa máquina. Custo: gerenciar N conexões (boot sincroniza cada perfil
  conectado; UI de sync fica dentro do perfil).
- ~~**Sync do BLOB inteiro** (todos os perfis num cofre, uma senha)~~ — DESCARTADO: exigiria
  reescrever `peso()`/`montarSnapshotSync`/`aplicarRemoto` para o formato aninhado e acoplaria
  todos os perfis (não dá para separar/compartilhar um).

**Como fica o sync por perfil (o desenho):**
- Cada perfil guarda o seu `syncNuvem` (senha/cofre/status) — por-perfil (ver B).
- `montarSnapshotSync(state, disp)` passa a receber (ou derivar) o **perfil ativo/alvo** e
  monta o snapshot da **fatia plana daquele perfil** (mesmas coleções de hoje: disciplinas,
  topicos, questoes, sessoes, flashcards, resumos, mapas, indicacoes-do-perfil… + o `concurso`
  e o config-de-perfil), removendo binários e o `syncNuvem` daquele perfil. Assim `peso()`,
  `decidir()` e `aplicarRemoto()` seguem operando sobre um objeto PLANO — **quase sem mudança**.
- `aplicarRemoto` aplica o remoto **DENTRO do perfil correspondente** (não substitui o estado
  todo): encontra o perfil pela id/cofre e troca só a fatia dele (preservando binários locais
  e o `syncNuvem` local daquele perfil).
- **Boot/fechar:** o main percorre `perfis[]` e sincroniza cada perfil **conectado** (tem senha).
  Normalmente só o ativo muda, mas manter todos em dia é barato.
- **UI de sync:** o card de Sincronização em Configurações passa a ser **do perfil ativo**
  (conectar/desconectar aquele perfil ao seu cofre).

### B) `config.sync` / `config.syncNuvem` (metadados locais de sync, INCL. a senha)
São chaves de config novas, locais por máquina. `montarSnapshotSync` já as REMOVE do upload
(manter). Classificação na 0b: se sync por-perfil, **`syncNuvem` vira POR-PERFIL** (cada perfil
guarda sua senha/status/cofre); `config.sync` (backup por arquivo, desktop) pode ficar global.

### C) `restaurarDaNuvem` deve CRIAR um perfil (não substituir o estado)
Hoje `restaurarDaNuvem`/`importarBackup` **substituem** todo o estado. Com multi-perfil, "trazer
outra conta" deve **criar um NOVO perfil** a partir do cofre e trocar para ele — sem apagar os
demais. É o fluxo elegante de "entrar com outra conta sem perder dados" que o usuário pediu.
O "Novo perfil" do seletor (Fase 1) ganha duas portas: **do zero (onboarding)** ou **restaurar
da nuvem (senha)**.

### D) `peso()`/`montarSnapshotSync`/`aplicarRemoto` operam por SLICE do perfil
Consequência de (A): o sync por-perfil resolve naturalmente (snapshot = fatia plana do perfil).
Se um dia for blob inteiro, esses três precisam somar/tratar através de `perfis[]`.

### E) Novas chaves de config a classificar na 0b (além das já listadas)
`leitura` (fonte/tam/tema de leitura) → **global**; `paletaMarcacao` → **global**; `navFixa`,
`sidebarColapsada` → **global**; `sync`/`syncNuvem` → conforme (A/B); demais chaves do redesign
→ a regra por-whitelist já captura (aresta 2), só confirmar o lado.

### F) Baseline de verificação DESATUALIZADO — ✅ REFEITO em 2026-08-03 (ver seção H)
Os números do plano (2 disc · 6 tóp · 15 questões…) eram do estado de 2026-07-06.

### G) Sem impacto (só registrar)
- **Access** (portão): é por **e-mail**, no nível da URL — não enxerga perfis. Multi-perfil não
  altera nada nele (nem no limite de 50 usuários). 
- **PWA/service worker**: client-side por origem; indiferente a perfis.
- **Limite de nuvem**: sync por-perfil = mais cofres no KV (chaves a mais) — desprezível no grátis.

### SEQUENCIAMENTO ATUALIZADO (2026-07-13) — o que executar, em ordem
1. **Baseline real AGORA** (contar disciplinas/tópicos/questões/tentativas/sessões/flashcards/
   missões/mapas/documentos/lembretes/lei-juris do estado atual) + **backup automático**.
2. **Fase 0a — dados de estudo por perfil, `config` GLOBAL.** Embrulha as coleções do topo em
   `perfis[0]` (o ativo); instala getters não-enumeráveis; migração idempotente por REGRA; roda
   também no estado vindo de backup/nuvem. NÃO toca `setConfig`. Verificar contagens = baseline.
3. **Fase 0b — dividir o `config`.** metas/dataProva/niveisDisciplina/atalhos/retaFinal/
   mentorPlano/… → por-perfil; **`syncNuvem` → por-perfil**; leitura/tema/paleta/nav/notif/IA/
   `sync`(arquivo)/lembretes/bancas → global. Trocar `setConfig` spread por `Object.assign`
   (aresta 1). Getters não-enumeráveis também no config-de-perfil.
4. **Fase 1 — Seletor + troca de perfil (UI).** Topbar concurso·cargo → menu: Trocar · **Novo
   perfil** · Editar · Remover. "Novo perfil" tem **duas portas**: (a) do zero (reusa onboarding);
   (b) **Restaurar da nuvem (senha)** → cria um perfil NOVO a partir do cofre (não substitui os
   outros). Guarda: cronômetro rodando ao trocar → aviso.
5. **Fase 2 — Sync por perfil (o motor).** `montarSnapshotSync` monta a **fatia plana** do perfil
   alvo (remove binários + `syncNuvem` daquele perfil); `aplicarRemoto` aplica DENTRO do perfil
   correspondente (acha pela id/cofre, preserva binários/`syncNuvem` locais); `restaurarDaNuvem`
   passa a **criar perfil**; boot/fechar percorre `perfis[]` conectados; card de Sincronização =
   do perfil ativo. `peso()`/`decidir()` seguem sobre objeto plano (fatia) — sem reescrita.

**Nota de menor esforço:** a Fase 2 pode vir JUNTO da Fase 1 (o "Restaurar da nuvem → novo
perfil" já exige o sync ciente de perfil). Se quiser entregar antes só o isolamento local
(0a+0b+seletor sem sync-por-perfil), o sync fica temporariamente **desligado no multi-perfil**
até a Fase 2 — evita sincronizar o formato aninhado por engano.

---

## H) PASSO 1 EXECUTADO — backup + baseline (2026-08-03)

Branch `feat/multi-perfil`, tirada de `main` limpa. Código de antes marcado na tag
**`refugio-pre-multi-perfil`** (v0.6.5 + fases A/B/C da magistratura).

**Backup dos dados** em `../\_BACKUP_dados_pre-multi-perfil_2026-08-03/` (fora do repo, com
`LEIA-ME.md` e instruções de restauração): cópia do SQLite conferida por SHA256 com o app
fechado, mais o `state.json` extraído. Contêm `config.iaKey` em texto plano — não subir.

**Ferramenta:** `dev/baseline-estado.py` tira o retrato e depois confere. Grava só forma e
tamanho (strings viram tamanho+hash), nunca valores — por isso o retrato é commitável.
Ela **achata o formato multi-perfil de volta ao plano** antes de contar, então o retrato de
antes e o de depois são comparáveis:

```bash
python -X utf8 dev/baseline-estado.py --comparar dev/baseline-multi-perfil.json   # exit 1 se divergir
```

Já validada contra ensaios de 0a e 0b feitos sobre o estado real (ambos "OK") e contra uma
migração que come 1 flashcard de propósito (acusou `flashcards: 12 -> 11`). Isto é, a
verificação foi testada **antes** de ser necessária.

**Baseline 2026-08-03** (`dev/baseline-multi-perfil.json`) — 31 chaves no topo, 45 no config,
442 itens somados nas listas do topo:

| indicações | flashcards | documentos | questões | tentativas | resumos | mapas | revisões | lembretes | errosManuais |
|---|---|---|---|---|---|---|---|---|---|
| 416 | 12 | 3 | 3 | 2 | 2 | 1 | 1 | 1 | 1 |

Zerados: disciplinas, tópicos, sessões, simulados, missões, provas, aulas, redações, rotinas,
marcações, revisoesFeitas, revisoesTopico, chatHistorico, bancas. **O peso do estado (2,4 MB)
é material e indicações, não estudo** — a migração 0a mexe justamente onde há dados.

### Chaves reais que o plano ainda não classifica (decidir antes da 0a/0b)

A regra por whitelist manda todas para o perfil por omissão. Três delas merecem decisão
consciente, porque "por omissão" pode ser a resposta errada:

| Chave | Onde | Pela regra cai em | Observação |
|---|---|---|---|
| `infoFeed` | topo | perfil | Feed de informativos é conteúdo geral, não do concurso — candidato a **global**, junto com `indicacoes`/`bancas`. Por-perfil, cada perfil rebusca o mesmo feed. |
| `chatHistorico` | topo | perfil | Hoje vazio. Conversa com o Mentor é sobre *aquele* concurso → perfil parece certo, mas confirmar. |
| `revisoes` · `documentos` | topo | perfil | Coerente com o plano (material e revisões são do concurso). Só não estavam listados. |
| `metasLeitura` · `ultimaLeitura` | config | — | Meta e progresso de leitura → **por-perfil** na 0b (`leitura`, que é fonte/tamanho/tema, continua global). |
| `diasFeriado` | config | — | **Global**, junto com `diasFolga`/`dispDiariaMin` (disponibilidade de vida). |
| `nomesLeis` | config | — | Apelidos de leis servem qualquer concurso → **global**. |
| `mentorAutoSemanal` · `checkinVistoData` | config | — | Preferências de comportamento → **global** (`mentorPlano`/`mentorUltimaAnalise` seguem por-perfil). |

`mentorPlano` e `mentorUltimaAnalise` (aresta 2) **não existem no estado atual** — só nascem
quando o Mentor gera um plano. A migração por REGRA cobre isso; só não dá para testá-las com
este estado.

---

## I) REVISÃO PRÁTICA (2026-08-03) — plano confrontado com o código e com o app rodando

Feita antes de escrever qualquer linha da 0a: leitura do código de hoje (o plano é de julho e o
`store.js` passou de ~5.900 para **7.782 linhas**) e execução das funções reais contra o formato
novo. Três arestas novas apareceram, uma delas grave.

### I.1 O que ficou MAIS FÁCIL do que o plano supunha

O estado é bem encapsulado: dos **608** acessos diretos a `state.<coleção>`, **505 estão dentro do
próprio `store.js`**. Fora dele são só **22**, em três arquivos (`ciclo.js` 15, `ia.js` 6,
`viz.js` 1). Os getters não-enumeráveis continuam sendo a técnica certa e o raio de mudança é
pequeno — o "~centenas de `state.X` espalhados" que o plano temia não se confirmou.

### I.2 Aresta 1 confirmada, e ela tem duas irmãs

`setConfig` segue reatribuindo por spread, agora em **`store.js:7658`** (o plano cita 5797).
O plano não lista as duas vizinhas, que fazem o mesmo em sub-objetos do config:
`setSyncMeta` (**:7665**) e `setSyncNuvemMeta` (**:7673**). Como a 0b leva `syncNuvem` para
dentro do perfil, **as três mudam juntas** — não só o `setConfig`.

### I.3 ARESTA NOVA — a ordem do `init()` está invertida no plano

`store.js:691-701` faz, nesta ordem: `state = { ...defaultState(), ...carregado }` → repõe toda
chave `undefined` a partir do default → backfills sobre `state.indicacoes`, `state.topicos`,
`state.sessoes`.

No formato novo o `carregado` **não tem** as coleções no topo. Então o passo 2 as **repõe vazias**
vindas do `defaultState()`, e os backfills passam a normalizar o lugar errado (o topo vazio, não o
perfil). Pior: uma migração que rode depois disso vê `disciplinas: []` no topo e pode gravar vazio
por cima do perfil.

O plano manda "merge/backfills → migrar → instalar acessores". **A ordem correta é:**
`carregado` → **migrar** (por REGRA) → merge com o default só no TOPO → **instalar acessores** →
**só então** os backfills (que agora enxergam o perfil ativo através dos getters).

### I.4 ARESTA NOVA — `importarBackup` rejeita o formato novo, e ele é gargalo do sync

`store.js:7751` valida `Array.isArray(obj.topicos)`. No formato multi-perfil isso é `undefined` →
lança *"Arquivo inválido — não parece um backup do Mentor Concurso."* **Verificado rodando a
validação real: formato de hoje ACEITO, multi-perfil REJEITADO.**

Não é só o botão de importar: `sync-nuvem.js` chama `store.importarBackup` em **três** pontos
(:191, :234, :275) — `restaurarDaNuvem` inclusive. Ou seja, a restauração da nuvem morre com erro
assim que a 0a rodar. Falha barulhenta, o que é bom; mas é bloqueante.

### I.5 ARESTA NOVA E GRAVE — o sync passaria a subir os PDFs para a nuvem

`montarSnapshotSync` (`sync.js:137`) tira os binários com
`snap.documentos = (snap.documentos||[]).map(d => ({...d, pdfData: null, imgData: null}))` — e isso
só varre o **topo**. Com os documentos dentro de `perfis[]`, a limpeza não alcança nada.

Medido com o estado de teste e 2 PDFs de 500 KB:

| | tamanho do upload | PDFs no pacote |
|---|---|---|
| formato de hoje | **48 KB** | 0 |
| multi-perfil (0a) | **1.024 KB** | **2** |

Contraria a decisão de projeto de que **PDF não sai da máquina** e estoura o orçamento do cofre.

### I.6 A guarda anti-perda do sync desliga sozinha

`peso()` também só conta coleções do topo. Medido: **65 → 2** no formato novo (os 2 são as
indicações, que ficam globais). E `encolheria(2, 0)` devolve **false** — isto é, a proteção que
impede "máquina zerada sobrescreve máquina cheia" **para de disparar**, sem avisar. Somado a
`aplicarRemoto` (`sync.js:164`), que lê `localState.documentos` do topo para preservar os PDFs
locais e passaria a ler vazio.

### I.7 Consequência para o sequenciamento: a Fase 2 deixa de ser opcional

O plano dizia que dava para entregar 0a+0b+seletor e deixar o sync para depois. Na prática, a 0a
sozinha produz: restauração da nuvem quebrada (I.4), PDFs vazando no upload (I.5) e guarda
anti-perda desligada (I.6). Então, ou a **Fase 2 vem junto**, ou o sync precisa ser
**desligado de forma explícita e visível** enquanto o multi-perfil estiver ativo — não por
omissão.

### I.8 Verificação deixou de ser cega

O estado do desktop tinha 14 coleções zeradas: comparar "0 antes, 0 depois" não prova nada. O
app foi aberto no navegador de teste (IndexedDB próprio, **sem cofre conectado** — confirmado:
`config.sync` e `config.syncNuvem` vazios) e as 11 coleções ainda vazias foram povoadas com
lançamentos fictícios na forma exata que o `store.js` cria, com vínculos para ids reais.

O app consumiu os dados pela lógica de verdade: Acompanhamento calculou **60% de aproveitamento**
(6 acertos em 10 tentativas), a taxa de conclusão de revisões apareceu e a rotina fictícia entrou
na agenda de segunda. Baseline em **`dev/baseline-navegador-teste.json`**: **24 coleções não
vazias, 109 itens, nenhuma zerada**. Os ensaios de 0a e 0b sobre ele passam ("nada sumiu").

**É neste ambiente que a 0a deve ser exercitada primeiro** — dados reais em forma, sem risco para
o SQLite do desktop e sem nuvem conectada.

### I.9 DECISÕES TOMADAS (2026-08-03)

- **`infoFeed` → POR PERFIL.** Um perfil de magistratura acompanha informativos que um perfil de
  escrevente não precisa ver. (Contraria a sugestão de deixar global; decisão do usuário.)
- **`chatHistorico` → POR PERFIL** (a regra por whitelist já leva; a conversa é sobre aquele
  concurso). Nenhuma chave nova vai para o global.
- **Sync: DESLIGADO explicitamente enquanto o multi-perfil estiver ativo.** Entrega-se
  0a+0b+seletor primeiro; a Fase 2 vem depois. O desligamento tem de ser **visível no card de
  Sincronização em Configurações** ("indisponível durante o multi-perfil"), nunca silencioso —
  senão o usuário acha que está sincronizando e não está.

### I.10 Sequenciamento revisado

1. **0a** — migração por REGRA com a ordem do `init()` corrigida (I.3); `importarBackup` aceitando
   os dois formatos (I.4); sync travado com aviso visível (I.7). Exercitar no navegador de teste e
   conferir contra `baseline-navegador-teste.json`.
2. **0b** — as **três** funções de config (I.2), não só `setConfig`.
3. **Fase 1** — seletor. Guarda do cronômetro rodando ao trocar (o estado de teste tem um
   cronômetro ativo, dá para exercitar).
4. **Fase 2** — sync por perfil: `montarSnapshotSync` fatia o perfil (resolve I.5 e I.6 de uma
   vez), `aplicarRemoto` aplica dentro do perfil, `restaurarDaNuvem` cria perfil. Só aqui o sync
   volta a ser ligado.

---

## J) FASE 0a — IMPLEMENTADA (2026-08-03) · branch `feat/multi-perfil`

Dados de estudo dentro de `perfis[]`; **`config` segue global** (é o que mantém o risco baixo:
as três funções que fazem spread nele só entram na 0b).

### O que mudou

**`src/store.js`**
- `GLOBAL_TOP` (8 chaves) + `migrarParaPerfis()` — migração por REGRA, idempotente, também sobre
  estado vindo de backup. O perfil nasce nomeado pelo concurso ("Escrevente Técnico Judiciário ·
  Vunesp").
- `definirAcessor()` / `instalarAcessores()` — getters/setters **não-enumeráveis** para cada
  coleção do perfil ativo. É isso que mantém os 505 `state.<coleção>` do arquivo funcionando sem
  reescrita, e que faz `JSON.stringify(state)` gravar já no formato novo.
- `recolherOrfas()` — chamada pelo `commit()`. Se algo escrever numa coleção que ainda não tem
  acessor (`state.chatHistorico = []` num estado que nunca teve chat), a chave cairia no TOPO como
  propriedade comum e seria persistida fora do perfil. A função aplica a mesma regra
  continuamente, então **coleção futura vira por-perfil sozinha**, sem ninguém declarar nada.
- `init()` reordenado conforme I.3: migrar → merge só do topo → completar coleções novas no perfil
  → **instalar acessores** → backfills.
- `importarBackup()` aceita os dois formatos (I.4). `resetTudo()` reinstala os acessores.
- `snapshotExport()` — **corrigido um risco que a I.5 não tinha previsto**: o backup
  "compartilhável" limpava `clone.documentos` no topo, então no formato novo ele **deixaria passar
  as apostilas com marca-d'água/CPF**. A limpeza virou `limparMaterialDaFatia()`, aplicada a
  **todos** os perfis.

**`src/sync.js` · `src/sync-nuvem.js`** — `SYNC_PAUSADO_MULTIPERFIL` trava as **11** entradas de
sincronização (6 na nuvem, 5 no backup por arquivo), no padrão de retorno que elas já usavam
(`{ok:false, motivo}` no silencioso, erro no manual).

**`src/screens/config.js`** — a pausa é dita na tela: pill `Pausada · multi-perfil em implantação`
no card de Sincronização, com `data-tip` explicando o porquê técnico, e chip `pausado` no *summary*
do backup por arquivo (senão o aviso ficaria escondido dentro do `<details>` fechado).

### Verificação executada (navegador de teste, estado de 109 itens)

| Prova | Resultado |
|---|---|
| Formato persistido | 8 chaves globais no topo · 26 coleções no perfil |
| Contagens após migrar | **109 itens, nenhuma perda** (só `modificadoEm` muda) |
| Telas | **17 rotas, 0 quebradas, 0 erros de console** |
| Escrita (avaliar flashcard) | gravou em `perfis[0].revisoes` (4 → 5); **nada no topo** |
| Órfãs no topo | **nenhuma**, depois de todos os testes |
| Backup antigo (formato plano) importado pela UI | **aceito e migrado**; estado idêntico ao baseline |

Ciclo redondo: plano → migra → usa → escreve → exporta → importa backup antigo → migra de novo →
**bate com o baseline**, com a única diferença sendo o carimbo `modificadoEm`.

### Achados durante o teste (não são regressão da 0a)

- **`screens/correcao.js:427` não é defensivo:** `c.criterios.map(...)` quebra a tela inteira se a
  correção não tiver `criterios`. Descoberto porque o lançamento fictício de redação foi criado
  incompleto — mas uma redação corrompida ou vinda de versão antiga derruba a tela do mesmo jeito.
  Vale um `(c.criterios || [])`.
- **Copy desatualizado:** o card Concurso ainda diz *"Multi-concurso e modo fusão chegam na v3"*.

### O que falta antes de considerar a 0a fechada

- Rodar no **desktop** (SQLite). A migração acontece na primeira abertura; o backup de 2026-08-03
  é a volta. Conferir com `--comparar dev/baseline-multi-perfil.json`.

---

## K) FASE 0b — IMPLEMENTADA (2026-08-03)

O config passa a ter dois lados. **Por-perfil:** `dataProva`, as três metas + `dispDiariaMin`,
`metasLeitura`, `ultimaLeitura`, `niveisDisciplina`, `disciplinasAdiadas`, `atencaoAdiada`,
`bancasPreferidas`, `baseEstudo`, `retaFinal`, `atalhos`, `mentorPlano`, `mentorUltimaAnalise`,
`mentorPlanoVisto`, `syncNuvem`. **Global:** tema, IA, notificações, pomodoro, `leitura` (fonte e
tamanho), paleta, navegação, `diasFolga`/`diasFeriado`, `nomesLeis`, `sync` (backup por arquivo).

**A aresta 1 do plano, resolvida:** `setConfig` virou `Object.assign(state.config, patch)` — o
spread anterior copiaria só as chaves enumeráveis e destruiria os acessores, fazendo metas e data
da prova sumirem em silêncio. O backfill de config no `init()` tinha o mesmo defeito e foi
reescrito para preencher em vez de reatribuir.

Os acessores do config são instalados **pela lista**, não pelas chaves presentes: assim
`mentorPlano`, que só nasce quando o Mentor gera um plano, já nasce no perfil certo (é a resposta
à aresta 2 no nível do config).

### Três achados que só a execução revelou

1. **Um bug meu, de perda de dado.** `migrarParaPerfis` retornava cedo em estado já migrado, então
   a divisão do config nunca rodava; e `instalarAcessoresConfig` apagava o valor cru para instalar
   o acessor. Resultado: chave por-perfil que chegasse ainda no config global era **apagada** em
   vez de movida — aconteceu com `mentorPlanoVisto`. Corrigido nas duas pontas (migração de config
   sempre roda, e o valor cru é salvo no perfil antes de sair do global).
2. **`mentorPlanoVisto` tinha de ser por-perfil.** É comparado com `mentorUltimaAnalise` para dizer
   "há plano novo"; separados, o carimbo de um perfil seria comparado com o "visto" do outro.
3. **`dispDiariaMin` também.** O plano o listava como global ("disponibilidade de vida"), mas
   `screens/config.js` faz `patch.dispDiariaMin = patch.metaDiariaMin` a cada salvamento — é
   espelho da meta, que é por-perfil. Global, a disponibilidade de um perfil valeria para o outro.

### Verificação

| Prova | Resultado |
|---|---|
| Chaves de config | **44 antes, 44 depois** (27 globais + 17 no perfil), nenhuma perdida |
| Gravar data da prova pela tela | caiu em `perfis[0].config`, **não vazou** para o global |
| Globais após `Object.assign` | tema, pomodoro, provedor de IA e notificações intactos |
| Efeito na UI | topbar recalculou **"132 dias p/ prova"** a partir da data lida do perfil |
| Telas | 17 rotas, 0 erros (só `correcao`, pelo bug pré-existente dos `criterios`) |
| Visual | conferido nos dois temas: sem mudança de layout, dados corretos nos campos |

---

## M) FASE 2 — IMPLEMENTADA (2026-08-03) · sync por perfil · **PLANO CONCLUÍDO**

Cada concurso com o seu cofre e a sua senha. A trava da 0a foi removida: a sincronização
está religada.

**O que manteve isto pequeno:** o que sobe é a **fatia plana** do perfil — as coleções voltam
ao topo, no formato de antes do multi-perfil. Então `peso()`, `decidir()` e `aplicarRemoto()`
seguem operando sobre um objeto plano, **sem reescrita**, e os cofres criados por versões
anteriores continuam válidos.

- `store.fatiaSync(perfilId)` — coleções do perfil + globais + config plano (global mesclado
  com o do perfil) + `_perfil` para identificar de quem é a fatia.
- `store.aplicarFatia(fatia, perfilId)` — caminho de volta: devolve o estado completo com a
  fatia **dentro do perfil certo**, os outros intactos. Recoloca a senha local (que nunca sobe).
- Ambos reusam `GLOBAL_TOP`/`CONFIG_PERFIL` — não há uma segunda definição de "o que é global"
  para sair de sincronia com a primeira.

**As três arestas da seção I, medidas de novo com o código novo:**

| | antes (I.5/I.6) | agora |
|---|---|---|
| Upload | 1.024 KB **com 2 PDFs** | **54 KB, nenhum PDF** |
| `peso()` do snapshot | 2 (guarda desligada) | **87** (guarda ativa) |
| Binários locais no `aplicarRemoto` | não encontrados | preservados |

**`restaurarDaNuvem` deixou de substituir o app inteiro** (item C da revisão de 13/07): em
aparelho novo preenche o perfil ativo, que ainda não tem concurso; com o app em uso, **cria um
concurso** a partir do cofre e troca para ele.

**Na tela:** o card diz **qual concurso** está sendo conectado — sem isso dá para conectar o
errado sem perceber. E o card Concurso parou de prometer "Multi-concurso e modo fusão chegam na
v3": passou a apontar para o seletor.

### Verificação e limite

Roundtrip completo: uma questão nova vinda da nuvem entrou no perfil certo (28 → 29) com o
**outro concurso intacto**, config voltando dividido sem vazar para o global, sem lixo de sync no
estado. 17 telas sem erro, dois temas.

**Não exercitado:** o transporte de rede (conectar/subir/baixar contra o Worker), que depende do
endpoint. O que foi testado é o motor. Vale um teste real de dois aparelhos antes de publicar.

### O que falta para publicar

- Rodar 0a+0b no **desktop** (SQLite) — com o backup de 2026-08-03 como volta.
- Teste de sync real entre dois aparelhos.
- Só então empacotar e publicar (ver a seção acima sobre publicar apenas quando estiver inteiro).

---

## L) FASE 1 — IMPLEMENTADA (2026-08-03) · o seletor

O nome do concurso que já estava no topo virou o **seletor**: abre a lista de concursos (o
ativo com ✓ e as contagens), mais "Novo concurso", "Renomear este" e "Remover este" (só com
2+). Reusa `.doc-mais`/`.doc-mais-pop`, o menu que o app já tinha.

**No store:** `perfis()`, `perfilAtivoId()`, `trocarPerfil()`, `criarPerfil()`,
`renomearPerfil()`, `removerPerfil()`. Trocar **reinstala os acessores** — os perfis não têm
as mesmas chaves. Remover confirma e nunca deixa o app sem perfil.

**Guarda do cronômetro** (pedida no plano): trocar com ele rodando avisa antes, porque o tempo
em andamento seria contado para o concurso errado.

### Dois defeitos que só apareceram com o app aberto

1. **O usuário ficava preso no concurso novo.** Perfil recém-criado não tem `concurso`, então
   cai no onboarding — que é tela cheia, **sem topbar e sem seletor**. Não havia como voltar ao
   anterior se tivesse criado por engano. O passo 1 ganhou "Voltar para \<outro\>" e
   "Descartar", e o texto se adapta (não diz mais "Bem-vindo ao Mentor Concurso" para quem já
   usa o app).
2. **O concurso ativo parecia indisponível.** Ele é `disabled` no menu (não há para onde ir
   clicando nele) e o `:disabled` padrão o deixava a 40% de opacidade — mais apagado que os
   outros, invertendo a hierarquia. Agora é o destaque (cor primária + ✓).

Também ajustados na revisão visual: o nome do concurso era **cortado** na borda do menu (o
popover padrão tem 204px e nome de concurso é longo) e o alinhamento do popover, que nasce à
direita no padrão e precisava nascer sob o nome — os dois exigiram seletor de dupla classe,
porque as regras de `.doc-mais-pop` vêm depois no arquivo e venciam por ordem.

### Verificação

Com dois concursos reais: o novo nasce **vazio** (0 questões, 0 tópicos, sem data de prova)
enquanto o outro mantém **28 questões, 5 tópicos e a data de 13/12** — e tema, indicações e
lembretes seguem compartilhados. Voltar para o primeiro traz tudo de volta, inclusive os "132
dias p/ prova" no topo. 17 telas sem erro, seletor sobrevive a toda navegação, lint do CSS sem
aviso novo, conferido nos dois temas.

### Quando isto chega ao app que o usuário usa (decidido em 2026-08-03)

**Só depois de tudo pronto.** Não faz sentido o multi-perfil aparecer pela metade — sem seletor
não há o que trocar, e com o sync pausado o app fica pior do que estava. A migração do desktop
não é uma pendência a resolver agora; é consequência da publicação, no fim da fila.

Estado de hoje, para não haver surpresa:
- **`Mentor Concurso.exe`** é o binário Tauri de junho, com o `dist` embutido: não enxerga o
  código do branch e **não migra nada**. O updater só puxa release publicado, e não publicamos.
- ⚠️ **`Iniciar Mentor Concurso.cmd` roda `npm run dev`** na pasta do projeto — serve o código do
  branch em que o repositório estiver. Abrir o app por ele durante o trabalho no multi-perfil usa
  a versão incompleta e migra o IndexedDB daquele navegador. Enquanto a implantação não fechar:
  abrir pelo `.exe`, ou deixar o repositório na `main` ao fim da sessão.
