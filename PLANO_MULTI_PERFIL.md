# Plano — Multi-perfil (multi-concurso)

> **Status:** APROVADO, adiado para uma versão futura (a pedido do usuário em 2026-07-06).
> Não implementar até retomar. Groundwork de análise já feito; falta escrever o núcleo.

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
