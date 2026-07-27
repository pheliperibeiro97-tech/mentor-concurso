# Plano — Multi-perfil (multi-concurso)

> **Status:** APROVADO, adiado para uma versão futura (a pedido do usuário em 2026-07-06).
> Não implementar até retomar. Groundwork de análise já feito; falta escrever o núcleo.
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

Comparar contagens **antes e depois** (baseline do estado real em 2026-07-06):
**2 disciplinas · 6 tópicos · 15 questões · 50 tentativas · 8 sessões · 20 flashcards ·
2 missões · 2 mapas mentais · 0 documentos · 6 lembretes.** Concurso: "Analista Judiciário · TJSP"
(banca VUNESP). Qualquer divergência = abortar e corrigir.

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

### F) Baseline de verificação DESATUALIZADO
Os números do plano (2 disc · 6 tóp · 15 questões…) são do estado de 2026-07-06. **Refazer o
baseline com o estado real atual** imediatamente antes de migrar (contar e comparar depois).

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
