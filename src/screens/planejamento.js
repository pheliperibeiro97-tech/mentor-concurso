// Planejamento: ciclo de aprendizado + tarefas/trilhas + próximas revisões.
import { bindActions, toast, header, vazio, confirmar, imprimir, botaoImprimir, ligarDropZone, focarItem, iconImprimir, abrirJanelaFluxo, plural, skeletonDoc } from "../ui.js";
import { esc, fmtData, fmtMin, todayISO, daysBetween, addDays, weekdayISO, DIAS_SEMANA, DIAS_SEMANA_CURTO } from "../util.js";
import { icone } from "../icones.js";
import { FASES, ORDEM_FASES } from "../ciclo.js";
import { lerArquivoTexto, ligarImportArquivo } from "../pdf.js";

let mostrarConcluidas = false;
let mostrarReplan = false;
let missSort = "custom";
let missComent = new Set(); // ids de tarefas com o editor de nota aberto
let missEdit = new Set(); // ids de tarefas com o título em edição
let tarefasView = "semana"; // "semana" (grade Seg→Dom) | "soltas" (lista livre)
let addDiaForm = null; // data ISO do dia com o formulário "+ tarefa" aberto
let mostrarRotina = false; // painel de gerenciar a rotina semanal aberto
let planoPreview = null; // proposta de plano gerada (aguardando aprovação)
let planoDescartados = new Set(); // índices de itens do preview que o usuário desmarcou
let mostrarDiag = false; // formulário de diagnóstico do plano aberto
let planoRefino = null; // texto da explicação/refino da IA sobre o plano
let refinandoPlano = false;
let mostrarImport = false; // painel de importar cronograma externo
let importPreview = null; // tarefas estruturadas (aguardando aprovação)
let importDescartados = new Set();
let importando = false;
let importTextoSalvo = ""; // texto colado preservado para "Voltar para editar"
export default function renderPlanejamento(root, app) {
  const { store } = app;
  const st = store.get();
  const plano = store.planoHoje();
  // Foco numa tarefa específica (Dossiê): mostra todas e rola até ela.
  let focoMiss = null;
  if (app.params && app.params.focoMissaoId) {
    focoMiss = app.params.focoMissaoId;
    app.params.focoMissaoId = null;
    missSort = "custom";
  }

  const missoes = st.missoes;
  const pendentes = missoes.filter((m) => !m.concluida);
  const vencidos = store.flashcardsVencidos().length;
  const errosTotal = st.tentativas.filter((t) => !t.acertou).length;
  const observacoes = store.observacoesRecentes(5);
  const opcoesTopico = st.topicos
    .map((t) => `<option value="${t.id}">${esc(nomeTopico(st, t))}</option>`)
    .join("");

  // Próximas revisões agrupadas por data: flashcards + revisões de tópico + revisões de resumo.
  const porData = {};
  const slot = (d) => (porData[d] = porData[d] || { flashcards: 0, topicos: [], resumos: [] });
  for (const f of st.flashcards) slot(f.sm2.dueDate).flashcards++;
  for (const { rev, topico } of [...store.revisoesTopicoVencidas(), ...store.proximasRevisoesTopico(30)]) {
    slot(rev.proxima).topicos.push(topico.nome);
  }
  for (const r of st.resumos) {
    if (r.revisao && r.revisao.proxima) slot(r.revisao.proxima).resumos.push(r.titulo || "resumo");
  }
  const datasRevisao = Object.keys(porData).sort().slice(0, 7);

  root.innerHTML = `
    ${header("Planejamento", "Sua semana de estudos", botaoImprimir())}

    <div class="plano-resumo">
      <span class="plano-resumo-rec">Agora: <b style="color:${plano.faseInfo.cor}">${plano.faseInfo.nome}</b>${plano.topico ? ` em <b>${esc(plano.topico.nome)}</b>` : ""}</span>
      <button class="lnk" data-action="ir-hoje">Ir para Hoje →</button>
      <span class="spacer"></span>
      <details class="plano-ciclo-det">
        <summary data-tip-pos="cima-dir" data-tip="Cada fase prepara a próxima. Clique para ver todas.">Ciclo de aprendizado</summary>
        <div class="ciclo-explica">
          ${[...ORDEM_FASES, "Pl"].map((f) => {
            const info = FASES[f];
            return `<div class="ciclo-card ${f === "Pl" ? "ciclo-card-extra" : ""}" style="--cor:${info.cor}">
              <div class="ciclo-card-letra">${info.codigo}</div>
              <div><b>${info.nome}</b><div class="muted small">${info.desc}</div></div>
            </div>`;
          }).join("")}
        </div>
      </details>
    </div>

    ${cronogramaCardHTML(st, store, opcoesTopico)}

    ${atrasadasHTML(st, store)}

    <section class="card">
      <div class="plano-h"><h2>Próximas revisões</h2>${datasRevisao.length ? `<span class="cnt">${datasRevisao.length}</span>` : ""}<span class="sp"></span><span class="muted small" data-tip="Flashcards, tópicos e resumos com revisão agendada." data-tip-pos="cima-dir">${icone("info")}</span></div>
      ${
        datasRevisao.length
          ? `<ul class="lista-simples">${datasRevisao
              .map((d) => {
                const dif = daysBetween(todayISO(), d);
                const quando = dif <= 0 ? "hoje" : dif === 1 ? "amanhã" : `em ${dif} dias`;
                const info = porData[d];
                const partes = [];
                if (info.flashcards) partes.push(`${icone("layers")} ${plural(info.flashcards, "flashcard", "flashcards")}`);
                if (info.topicos.length)
                  partes.push(`${icone("repeat-2")} ${plural(info.topicos.length, "tópico", "tópicos")}${info.topicos.length <= 3 ? ` (${esc(info.topicos.join(", "))})` : ""}`);
                if (info.resumos.length)
                  partes.push(`${icone("file-text")} ${plural(info.resumos.length, "resumo", "resumos")}${info.resumos.length <= 3 ? ` (${esc(info.resumos.join(", "))})` : ""}`);
                return `<li>${fmtData(d)} <span class="muted">(${quando})</span> · ${partes.join(" · ")}</li>`;
              })
              .join("")}</ul>`
          : `<p class="muted">Nenhuma revisão agendada.</p>`
      }
    </section>

    <section class="card reta-final-card">
      <div class="plano-h">
        <h2>Modo Reta Final</h2>
        <span class="muted small" data-tip="Faltando pouco para a prova? Prioriza revisão (flashcards vencidos e caderno de erros) em vez de conteúdo novo." data-tip-pos="bottom">${icone("info")}</span>
        <span class="sp"></span>
        ${
          st.config.retaFinal
            ? `<button class="btn btn-primary" data-action="reta-ir" data-tip="Abrir o Hoje já com a fase de Revisão selecionada.">Ir para o foco em revisão →</button>`
            : `<button class="btn btn-primary" data-action="reta-ativar" data-tip="Prioriza a revisão (flashcards vencidos e caderno de erros) em vez de conteúdo novo.">Ativar Reta Final</button>`
        }
      </div>
      ${
        st.config.retaFinal
          ? `<div class="reta-final-stats muted small">${plural(vencidos, "flashcard vencido", "flashcards vencidos")} · ${plural(errosTotal, "erro", "erros")} para revisar
              <button class="lnk" data-action="reta-desativar" style="margin-left:10px" data-tip="Sair do modo Reta Final.">desativar</button></div>`
          : ""
      }
    </section>

    ${
      observacoes.length
        ? `<section class="card obs-card">
            <div class="plano-h"><h2>Observações recentes</h2>${observacoes.length ? `<span class="cnt">${observacoes.length}</span>` : ""}<span class="sp"></span><span class="muted small" data-tip="O que você anotou ao estudar. Leve em conta ao planejar." data-tip-pos="cima-dir">${icone("info")}</span></div>
            <ul class="obs-lista">
              ${observacoes
                .map(
                  (o) => `<li class="obs-item">
                    <span class="obs-meta muted small">${fmtData(o.data)}${o.topicoNome ? " · " + esc(o.topicoNome) : o.disciplinaNome ? " · " + esc(o.disciplinaNome) : ""}</span>
                    <span class="obs-texto">${esc(o.comentario)}</span>
                  </li>`
                )
                .join("")}
            </ul>
          </section>`
        : ""
    }

    `;

  // "Adicionar tarefas": carregar texto de um arquivo (PDF/txt) para o campo correspondente.
  // Vale para as duas abas: #extrair-file→#extrair-texto (avulsas) e #import-file→#import-texto (semana).
  const ligarArquivo = (inputId, textareaId, okMsg, contexto) => {
    const el = root.querySelector(inputId);
    if (!el) return;
    ligarDropZone(el);
    ligarImportArquivo(el, {
      getCfg: () => store.get().config,
      contexto,
      onTexto: (texto) => { const ta = root.querySelector(textareaId); if (ta) ta.value = texto; if (texto.trim()) toast(okMsg); },
    });
  };
  ligarArquivo("#import-file", "#import-texto", "Cronograma carregado. Revise e clique em Estruturar.", "um cronograma ou plano de estudos organizado por dias/semanas: extraia as datas/dias, as disciplinas e os assuntos de cada período, preservando a estrutura temporal");

  focarItem(root, focoMiss);

  bindActions(root, {
    imprimir: () => imprimir("Planejamento — Mentor Concurso", printPlanejamento(st, plano, datasRevisao, porData)),
    "reta-ativar": () => {
      store.setConfig({ retaFinal: true });
      toast("Reta Final ativada: foco em revisão.");
    },
    "reta-desativar": () => {
      store.setConfig({ retaFinal: false });
      toast("Reta Final desativada.");
    },
    "reta-ir": () => app.navigate("hoje", { reta: true }),
    "ir-hoje": () => app.navigate("hoje"),
    "edit-coment": (el) => {
      missComent.add(el.getAttribute("data-id"));
      app.refresh();
    },
    "cancelar-coment": (el) => {
      missComent.delete(el.getAttribute("data-id"));
      app.refresh();
    },
    "salvar-coment": (el) => {
      const id = el.getAttribute("data-id");
      const ta = root.querySelector(`.miss-coment-input[data-id="${id}"]`);
      store.setMissaoComentario(id, ta ? ta.value : "");
      missComent.delete(id);
      toast("Nota salva.");
    },
    "edit-titulo": (el) => {
      missEdit.add(el.getAttribute("data-id"));
      app.refresh();
    },
    "cancelar-edit": (el) => {
      missEdit.delete(el.getAttribute("data-id"));
      app.refresh();
    },
    "salvar-edit": (el) => {
      const id = el.getAttribute("data-id");
      const titulo = (root.querySelector(`.miss-titulo-input[data-id="${id}"]`)?.value || "").trim();
      if (!titulo) return toast("O título não pode ficar vazio.", "erro");
      const top = root.querySelector(`.miss-top-input[data-id="${id}"]`)?.value || null;
      const cat = root.querySelector(`.miss-cat-input[data-id="${id}"]`)?.value;
      const estim = root.querySelector(`.miss-estim-input[data-id="${id}"]`)?.value;
      store.setMissaoTitulo(id, titulo);
      store.setMissaoTopico(id, top);
      if (cat) store.setMissaoCategoria(id, cat);
      store.setMissaoEstim(id, estim);
      missEdit.delete(id);
      toast("Tarefa atualizada.");
    },
    "toggle-replan": () => {
      mostrarReplan = !mostrarReplan;
      app.refresh();
    },
    "cancelar-replan": () => {
      mostrarReplan = false;
      app.refresh();
    },
    "aplicar-replan": () => {
      let n = 0;
      root.querySelectorAll(".replan-cb").forEach((cb) => {
        if (!cb.checked) return;
        const i = cb.getAttribute("data-i");
        const titulo = root.querySelector(`.replan-txt[data-i="${i}"]`).value.trim();
        const cat = root.querySelector(`.replan-cat[data-i="${i}"]`).value;
        const top = root.querySelector(`.replan-top[data-i="${i}"]`).value || null;
        if (titulo) {
          store.addMissao({ titulo, categoria: cat, topicoId: top, origem: "replan" });
          n++;
        }
      });
      mostrarReplan = false;
      toast(n ? `${plural(n, "tarefa adicionada", "tarefas adicionadas")} ao plano.` : "Nenhuma selecionada.", n ? "ok" : "erro");
    },
    "toggle-extrair": () => abrirAdicionarTarefas(app),
    "del-miss": async (el) => {
      const m = store.get().missoes.find((x) => x.id === el.getAttribute("data-id"));
      const msg = m && m.indicacaoId
        ? "Esta tarefa está vinculada a uma meta de leitura (Lei Seca / Jurisprudência). Remover apaga também a meta na aba correspondente. Continuar?"
        : "Remover esta tarefa?";
      if (await confirmar(msg)) store.removerMissao(el.getAttribute("data-id"));
    },
    mover: (el) => {
      store.moverMissao(el.getAttribute("data-id"), parseInt(el.getAttribute("data-dir"), 10));
    },
    "toggle-concluidas": () => {
      mostrarConcluidas = !mostrarConcluidas;
      app.refresh();
    },
    "pedir-plano": () => {
      if (store.planoTemDiagnostico()) {
        planoPreview = store.gerarPlanoSemana();
        planoDescartados = new Set();
        planoRefino = null;
        mostrarDiag = false;
      } else {
        mostrarDiag = true;
      }
      app.refresh();
    },
    "cancelar-plano": () => {
      mostrarDiag = false;
      app.refresh();
    },
    "salvar-diag-gerar": () => {
      const disp = parseInt(root.querySelector("#diag-disp")?.value, 10);
      if (!disp || disp <= 0) return toast("Informe quanto tempo consegue estudar por dia.", "erro");
      store.setConfig({ dispDiariaMin: disp });
      root.querySelectorAll(".diag-nivel").forEach((sel) => {
        if (sel.value) store.setNivelDisciplina(sel.getAttribute("data-disc"), sel.value);
      });
      const adiadas = [...root.querySelectorAll(".diag-adiar:checked")].map((c) => c.getAttribute("data-disc"));
      store.setConfig({ disciplinasAdiadas: adiadas });
      mostrarDiag = false;
      planoPreview = store.gerarPlanoSemana();
      planoDescartados = new Set();
      app.refresh();
    },
    "refazer-diag": () => {
      mostrarDiag = true;
      planoPreview = null;
      app.refresh();
    },
    "refinar-plano": async () => {
      if (!planoPreview) return;
      if (!store.iaDisponivel()) return toast("Conecte a IA nas Configurações para refinar.", "erro");
      const kept = planoPreview.itens.filter((_, i) => !planoDescartados.has(i));
      refinandoPlano = true;
      app.refresh();
      try {
        planoRefino = await store.refinarPlanoIA(kept);
      } catch (e) {
        toast("Não consegui refinar o plano agora. Verifique a conexão e tente de novo em instantes.", "erro");
      }
      refinandoPlano = false;
      app.refresh();
    },
    "aplicar-refino": () => {
      if (!planoRefino || !planoPreview) return;
      const marcados = [...root.querySelectorAll(".rf-cb:checked")].map((cb) => planoRefino.ajustes[parseInt(cb.getAttribute("data-i"), 10)]).filter(Boolean);
      if (!marcados.length) return toast("Marque ao menos um ajuste (ou descarte o refino).", "erro");
      const semana = store.semanaAtual();
      const hoje = todayISO();
      const dataDoDia = (dia) => {
        if (dia == null || dia < 0 || dia > 6) return null;
        const d = semana.find((x) => weekdayISO(x) === Number(dia));
        return d && d >= hoje ? d : d ? addDays(d, 7) : null;
      };
      const igual = (a, b) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
      let n = 0;
      for (const a of marcados) {
        if (a.acao === "remover") {
          const antes = planoPreview.itens.length;
          planoPreview.itens = planoPreview.itens.filter((it) => !igual(it.titulo, a.titulo));
          if (planoPreview.itens.length < antes) n++;
        } else if (a.acao === "mover") {
          const it = planoPreview.itens.find((x) => igual(x.titulo, a.titulo));
          if (it) {
            it.data = dataDoDia(a.dia) || it.data;
            n++;
          }
        } else if (a.acao === "adicionar") {
          planoPreview.itens.push({ titulo: (a.titulo || "").trim(), categoria: a.categoria || "Não definida", topicoId: null, data: dataDoDia(a.dia), estimMin: 40 });
          n++;
        }
      }
      // reordena por data (datadas primeiro, na ordem) para o preview ficar coerente
      planoPreview.itens.sort((x, y) => (x.data || "9999").localeCompare(y.data || "9999"));
      planoDescartados = new Set();
      planoRefino = null;
      toast(`${plural(n, "ajuste aplicado", "ajustes aplicados")} ao plano.`);
      app.refresh();
    },
    "abrir-import": () => {
      mostrarImport = true;
      importPreview = null;
      app.refresh();
    },
    "cancelar-import": () => {
      mostrarImport = false;
      importTextoSalvo = "";
      app.refresh();
    },
    "estruturar-import": async () => {
      const texto = root.querySelector("#import-texto")?.value || "";
      if (!texto.trim()) return toast("Cole o cronograma.", "erro");
      importTextoSalvo = texto; // preserva para "Voltar para editar"
      importando = true;
      app.refresh();
      try {
        importPreview = await store.importarCronograma(texto);
        importDescartados = new Set();
        mostrarImport = false;
      } catch (e) {
        toast("Não consegui estruturar o cronograma agora. Verifique a conexão e tente de novo em instantes.", "erro");
      }
      importando = false;
      app.refresh();
    },
    "adaptar-import": async () => {
      const texto = root.querySelector("#import-texto")?.value || "";
      if (!texto.trim()) return toast("Cole o cronograma.", "erro");
      if (!store.iaDisponivel()) return toast("Conecte a IA (Gemini) para adaptar o cronograma.", "erro");
      importTextoSalvo = texto; // preserva para "Voltar para editar"
      importando = true;
      app.refresh();
      try {
        importPreview = await store.adaptarCronograma(texto);
        importDescartados = new Set();
        mostrarImport = false;
      } catch (e) {
        toast("Não consegui adaptar o cronograma agora. Verifique a conexão e tente de novo em instantes.", "erro");
      }
      importando = false;
      app.refresh();
    },
    // Volta do preview para o painel, preservando o texto colado para corrigir e reestruturar.
    "voltar-import": () => {
      importPreview = null;
      importDescartados = new Set();
      mostrarImport = true;
      app.refresh();
    },
    "descartar-import": () => {
      importPreview = null;
      importDescartados = new Set();
      importTextoSalvo = "";
      app.refresh();
    },
    // Remove uma tarefa do preview da semana (✕) — some da proposta antes de aceitar.
    "remover-import": (el) => {
      const i = parseInt(el.getAttribute("data-i"), 10);
      if (importPreview) importPreview.splice(i, 1);
      if (importPreview && !importPreview.length) { importPreview = null; mostrarImport = true; }
      app.refresh();
    },
    "aceitar-import": () => {
      const itens = (importPreview || []).filter((t) => (t.titulo || "").trim());
      if (!itens.length) return toast("Nenhuma tarefa para importar.", "erro");
      const n = store.aceitarPlanoSemana(itens);
      importPreview = null;
      importDescartados = new Set();
      importTextoSalvo = "";
      tarefasView = "semana";
      toast(`${plural(n, "tarefa importada", "tarefas importadas")}.`);
    },
    "descartar-plano": () => {
      planoPreview = null;
      planoDescartados = new Set();
      planoRefino = null;
      app.refresh();
    },
    "aceitar-plano": () => {
      if (!planoPreview) return;
      const mantidos = planoPreview.itens.filter((_, i) => !planoDescartados.has(i));
      if (!mantidos.length) return toast("Nenhuma tarefa selecionada.", "erro");
      const n = store.aceitarPlanoSemana(mantidos);
      planoPreview = null;
      planoDescartados = new Set();
      planoRefino = null;
      tarefasView = "semana";
      toast(`${plural(n, "tarefa", "tarefas")} do plano ${n === 1 ? "adicionada" : "adicionadas"} à semana.`);
    },
    "exp-crono-ics": (el) => exportarCronograma(st, "ics", el.getAttribute("data-escopo") || "semana"),
    "exp-crono-csv": (el) => exportarCronograma(st, "csv", el.getAttribute("data-escopo") || "semana"),
    "exp-crono-json": (el) => exportarCronograma(st, "json", el.getAttribute("data-escopo") || "semana"),
    "exp-crono-print": (el) => exportarCronograma(st, "print", el.getAttribute("data-escopo") || "semana"),
    "atrasada-hoje": (el) => {
      store.setMissaoData(el.getAttribute("data-id"), todayISO());
      toast("Tarefa trazida para hoje.");
    },
    "atrasada-remover": async (el) => {
      if (await confirmar("Remover esta tarefa atrasada?")) store.removerMissao(el.getAttribute("data-id"));
    },
    "ver-soltas": () => {
      tarefasView = "soltas";
      app.refresh();
    },
    "ver-semana": () => {
      tarefasView = "semana";
      app.refresh();
    },
    "toggle-rotina-painel": () => {
      mostrarRotina = !mostrarRotina;
      app.refresh();
    },
    "abrir-add-dia": (el) => {
      addDiaForm = addDiaForm === el.getAttribute("data-data") ? null : el.getAttribute("data-data");
      app.refresh();
    },
    "cancelar-add-dia": () => {
      addDiaForm = null;
      app.refresh();
    },
    "add-dia": (el) => {
      const data = el.getAttribute("data-data");
      const inp = root.querySelector(`.add-dia-input[data-data="${data}"]`);
      const titulo = (inp?.value || "").trim();
      if (!titulo) return toast("Escreva a tarefa.", "erro");
      const estim = root.querySelector(`.add-dia-estim[data-data="${data}"]`)?.value;
      const top = root.querySelector(`.add-dia-top[data-data="${data}"]`)?.value || null;
      store.addMissao({ titulo, data, origem: "manual", estimMin: estim, topicoId: top });
      addDiaForm = null;
      toast("Tarefa adicionada ao dia.");
    },
    "del-dia-miss": async (el) => {
      if (await confirmar("Remover esta tarefa do dia?")) store.removerMissao(el.getAttribute("data-id"));
    },
    "toggle-folga": (el) => {
      const dia = el.getAttribute("data-dia");
      store.toggleDiaFolga(dia);
      addDiaForm = null;
      app.refresh();
    },
    "add-rotina": () => {
      const titulo = (root.querySelector("#rot-titulo")?.value || "").trim();
      if (!titulo) return toast("Escreva a tarefa da rotina.", "erro");
      const dia = root.querySelector("#rot-dia")?.value ?? "1";
      const cat = root.querySelector("#rot-cat")?.value || "Não definida";
      const top = root.querySelector("#rot-top")?.value || null;
      const estim = root.querySelector("#rot-estim")?.value || null;
      store.addRotina({ titulo, dia, categoria: cat, topicoId: top, estimMin: estim });
      toast("Rotina adicionada.");
    },
    "del-rotina": async (el) => {
      if (await confirmar("Remover este item da rotina semanal? (some de todas as semanas)")) store.removerRotina(el.getAttribute("data-id"));
    },
    "limpar-concluidas": async () => {
      if (await confirmar("Limpar as tarefas concluídas? (indicações de leitura permanecem nas abas Lei Seca/Jurisprudência)")) {
        const n = store.limparMissoesConcluidas();
        toast(`${plural(n, "tarefa concluída removida", "tarefas concluídas removidas")}.`);
      }
    },
    "limpar-semana": async () => {
      const n = store.get().missoes.filter((m) => m.data && store.semanaAtual().includes(m.data)).length;
      if (!n) return toast("Nenhuma tarefa datada nesta semana.", "erro");
      if (await confirmar(`Limpar as ${plural(n, "tarefa datada", "tarefas datadas")} desta semana (Seg→Dom)? A rotina recorrente e as tarefas avulsas permanecem.`)) {
        const r = store.limparMissoesSemana();
        toast(`${plural(r, "tarefa da semana removida", "tarefas da semana removidas")}.`);
      }
    },
    "limpar-avulsas": async () => {
      const n = store.get().missoes.filter((m) => !m.data).length;
      if (!n) return toast("Nenhuma tarefa avulsa.", "erro");
      if (await confirmar(`Limpar todas as ${plural(n, "tarefa avulsa", "tarefas avulsas")} (sem dia)? As tarefas datadas da semana permanecem.`)) {
        const r = store.limparMissoesAvulsas();
        toast(`${plural(r, "tarefa avulsa removida", "tarefas avulsas removidas")}.`);
      }
    },
  });

  root.querySelectorAll('[data-action="toggle-miss"]').forEach((el) =>
    el.addEventListener("change", () => store.toggleMissao(el.getAttribute("data-id")))
  );
  // Checkboxes da grade da semana: tarefa datada (missao) ou ocorrência de rotina.
  root.querySelectorAll('[data-action="toggle-dia-item"]').forEach((el) =>
    el.addEventListener("change", () => {
      const id = el.getAttribute("data-id");
      if (el.getAttribute("data-tipo") === "rotina") store.toggleRotinaFeita(id, el.getAttribute("data-data"));
      else store.toggleMissao(id);
    })
  );

  // ---- Preview EDITÁVEL da semana (campos por tarefa, sem re-render p/ não perder foco) ----
  const liveImport = (sel, set) =>
    root.querySelectorAll(sel).forEach((el) =>
      el.addEventListener("input", () => {
        const i = parseInt(el.getAttribute("data-i"), 10);
        if (importPreview && importPreview[i]) set(importPreview[i], el.value);
      })
    );
  liveImport(".import-titulo-edit", (it, v) => (it.titulo = v));
  liveImport(".import-obs-edit", (it, v) => (it.observacao = v));
  liveImport(".import-estim", (it, v) => (it.estimMin = v === "" ? null : Math.max(0, parseInt(v, 10) || 0)));
  root.querySelectorAll(".import-cat").forEach((el) =>
    el.addEventListener("change", () => {
      const i = parseInt(el.getAttribute("data-i"), 10);
      if (importPreview && importPreview[i]) { importPreview[i].categoria = el.value; app.refresh(); }
    })
  );
  root.querySelectorAll(".import-dia").forEach((el) =>
    el.addEventListener("change", () => {
      const i = parseInt(el.getAttribute("data-i"), 10);
      if (importPreview && importPreview[i]) importPreview[i].data = el.value || null;
    })
  );
  // Checkboxes do preview do plano: marcar/desmarcar item antes de aceitar.
  root.querySelectorAll(".plano-cb").forEach((el) =>
    el.addEventListener("change", () => {
      const i = parseInt(el.getAttribute("data-i"), 10);
      if (el.checked) planoDescartados.delete(i);
      else planoDescartados.add(i);
      const card = el.closest(".plano-item");
      if (card) card.classList.toggle("plano-off", !el.checked);
      const btn = root.querySelector('[data-action="aceitar-plano"]');
      if (btn) {
        const n = planoPreview ? planoPreview.itens.length - planoDescartados.size : 0;
        btn.textContent = `Aceitar plano (${n})`;
        btn.disabled = !n;
      }
    })
  );

  // Arrastar tarefas datadas entre dias (mostra o dinamismo do cronograma).
  let dragId = null;
  root.querySelectorAll(".dia-item.arrastavel").forEach((el) => {
    el.addEventListener("dragstart", (e) => {
      dragId = el.getAttribute("data-id");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragId);
      el.classList.add("arrastando");
    });
    el.addEventListener("dragend", () => {
      dragId = null;
      el.classList.remove("arrastando");
      root.querySelectorAll(".drop-alvo").forEach((z) => z.classList.remove("drop-alvo"));
    });
  });
  root.querySelectorAll(".dia-linha[data-dia-data]").forEach((zona) => {
    zona.addEventListener("dragover", (e) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      zona.classList.add("drop-alvo");
    });
    zona.addEventListener("dragleave", (e) => {
      if (!zona.contains(e.relatedTarget)) zona.classList.remove("drop-alvo");
    });
    zona.addEventListener("drop", (e) => {
      e.preventDefault();
      zona.classList.remove("drop-alvo");
      const id = dragId || e.dataTransfer.getData("text/plain");
      const novaData = zona.getAttribute("data-dia-data");
      if (!id) return;
      const m = store.get().missoes.find((x) => x.id === id);
      if (m && m.data !== novaData) {
        store.setMissaoData(id, novaData);
        toast("Tarefa movida de dia.");
      }
      dragId = null;
    });
  });
  // Arrastar para reordenar as TAREFAS AVULSAS (modo "Minha ordem"): solta antes do alvo.
  let dragMissId = null;
  root.querySelectorAll(".missao-item.arrastavel").forEach((el) => {
    el.addEventListener("dragstart", (e) => {
      dragMissId = el.getAttribute("data-id");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragMissId);
      el.classList.add("arrastando");
    });
    el.addEventListener("dragend", () => {
      dragMissId = null;
      el.classList.remove("arrastando");
      root.querySelectorAll(".drop-antes").forEach((z) => z.classList.remove("drop-antes"));
    });
    el.addEventListener("dragover", (e) => {
      if (!dragMissId || el.getAttribute("data-id") === dragMissId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.classList.add("drop-antes");
    });
    el.addEventListener("dragleave", (e) => {
      if (!el.contains(e.relatedTarget)) el.classList.remove("drop-antes");
    });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("drop-antes");
      const alvoId = el.getAttribute("data-id");
      const id = dragMissId || e.dataTransfer.getData("text/plain");
      if (id && alvoId && id !== alvoId) {
        store.reordenarMissao(id, alvoId);
        toast("Tarefa reordenada.");
      }
      dragMissId = null;
    });
  });
  root.querySelector("#miss-sort")?.addEventListener("change", (e) => {
    missSort = e.target.value;
    app.refresh();
  });
  // "Adiar" disciplina no diagnóstico: desabilita o seletor de nível ao vivo.
  root.querySelectorAll(".diag-adiar").forEach((cb) =>
    cb.addEventListener("change", () => {
      const sel = root.querySelector(`.diag-nivel[data-disc="${cb.getAttribute("data-disc")}"]`);
      if (sel) sel.disabled = cb.checked;
      cb.closest(".diag-disc-linha")?.classList.toggle("diag-adiada", cb.checked);
    })
  );
  // Mover tarefa atrasada para a data escolhida.
  root.querySelectorAll(".atrasada-data").forEach((el) =>
    el.addEventListener("change", () => {
      if (el.value) {
        store.setMissaoData(el.getAttribute("data-id"), el.value);
        toast("Tarefa movida.");
      }
    })
  );
}

function printPlanejamento(st, plano, datasRevisao, porData) {
  const ciclo = ORDEM_FASES.map((f) => `${FASES[f].nome} (${FASES[f].desc})`).join(" → ");
  const rev = datasRevisao.length
    ? `<ul>${datasRevisao
        .map((d) => {
          const info = porData[d];
          const partes = [];
          if (info.flashcards) partes.push(plural(info.flashcards, "flashcard", "flashcards"));
          if (info.topicos.length) partes.push(plural(info.topicos.length, "tópico", "tópicos"));
          if (info.resumos.length) partes.push(plural(info.resumos.length, "resumo", "resumos"));
          return `<li>${fmtData(d)} · ${partes.join(" · ")}</li>`;
        })
        .join("")}</ul>`
    : "<p>Nenhuma revisão agendada.</p>";
  const miss = st.missoes.length
    ? st.missoes
        .map((m) => `<div class="print-item">[${m.concluida ? "x" : " "}] ${esc(m.titulo)}${m.topicoId ? ` <span class="print-meta">(${esc(nomeTopicoCurto(st, m.topicoId))})</span>` : ""}</div>`)
        .join("")
    : "<p>Nenhuma tarefa.</p>";
  return `
    <h2>Ciclo de aprendizado</h2><p>${esc(ciclo)}</p>
    <p>Recomendação atual: <b>${esc(plano.faseInfo.nome)}</b>${plano.topico ? ` em ${esc(plano.topico.nome)}` : ""}.</p>
    <h2>Próximas revisões (flashcards e tópicos)</h2>${rev}
    <h2>Agenda de estudos</h2>${miss}`;
}

function replanHTML(store) {
  const sugs = store.sugerirPlano();
  return `
    <div class="card replan-panel">
      <h3>Sugestão de plano <span class="muted small">(você aprova e ajusta; nada é aplicado sozinho)</span></h3>
      <p class="muted small">Baseado em desempenho, cobertura, flashcards vencidos, erros e dias até a prova. Marque o que quiser e edite o texto.</p>
      <ul class="replan-lista">
        ${sugs
          .map(
            (s, i) => `<li class="replan-item">
          <input type="checkbox" class="replan-cb" data-i="${i}" checked />
          <input type="text" class="replan-txt" data-i="${i}" value="${esc(s.titulo)}" />
          <span class="mini-tag">${esc(s.categoria)}</span>
          <input type="hidden" class="replan-top" data-i="${i}" value="${s.topicoId || ""}" />
          <input type="hidden" class="replan-cat" data-i="${i}" value="${esc(s.categoria)}" />
        </li>`
          )
          .join("")}
      </ul>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="cancelar-replan">Cancelar</button>
        <button class="btn btn-primary" data-action="aplicar-replan">Adicionar selecionadas</button>
      </div>
    </div>`;
}

// Categorias de tarefa (etiqueta vinculada ao item) e a cor/classe de cada uma.
const CATEGORIAS = ["Materiais", "Lei Seca", "Jurisprudência", "Prática", "Revisão", "Não definida"];
const CAT_CLASSE = {
  Materiais: "material",
  "Lei Seca": "leiseca",
  Jurisprudência: "juris",
  Prática: "pratica",
  Revisão: "revisao",
  "Não definida": "geral",
};
const ORDEM_CAT = Object.fromEntries(CATEGORIAS.map((c, i) => [c, i]));

// ---- EXPORTAR CRONOGRAMA (dir.1): as tarefas DATADAS nos 4 formatos ----
function baixarArquivo(nome, conteudo, mime) {
  const blob = new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
// Exporta as tarefas no formato escolhido. escopo "semana" = tarefas DATADAS (cronograma);
// escopo "avulsas" = tarefas SEM data. .ics só se aplica ao cronograma datado.
function exportarCronograma(st, formato, escopo = "semana") {
  const avulsas = escopo === "avulsas";
  const fonte = st.missoes
    .filter((m) => (avulsas ? !m.data : !!m.data))
    .sort((a, b) => (avulsas ? (a.ordem ?? 0) - (b.ordem ?? 0) : a.data.localeCompare(b.data)))
    .map((m) => {
      const t = m.topicoId ? st.topicos.find((x) => x.id === m.topicoId) : null;
      return { data: m.data || "", titulo: m.titulo, categoria: m.categoria || "", topico: t ? nomeTopico(st, t) : "", feita: !!m.concluida };
    });
  if (!fonte.length) return toast(avulsas ? "Nenhuma tarefa avulsa para exportar." : "Nenhuma tarefa datada para exportar.", "erro");
  const arq = avulsas ? "tarefas-avulsas" : "cronograma";
  const rotulo = avulsas ? "Tarefas avulsas" : "Cronograma";

  if (formato === "json") {
    baixarArquivo(`${arq}.json`, JSON.stringify(fonte, null, 2), "application/json");
    return toast(`${rotulo} exportado (.json).`);
  }
  if (formato === "csv") {
    const esc2 = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const cabec = avulsas ? ["titulo", "categoria", "topico", "concluida"] : ["data", "titulo", "categoria", "topico", "concluida"];
    const linhas = [cabec.join(",")];
    fonte.forEach((d) => {
      const cols = avulsas
        ? [esc2(d.titulo), esc2(d.categoria), esc2(d.topico), d.feita ? "sim" : "nao"]
        : [d.data, esc2(d.titulo), esc2(d.categoria), esc2(d.topico), d.feita ? "sim" : "nao"];
      linhas.push(cols.join(","));
    });
    baixarArquivo(`${arq}.csv`, "﻿" + linhas.join("\r\n"), "text/csv;charset=utf-8");
    return toast(`${rotulo} exportado (.csv).`);
  }
  if (formato === "ics") {
    if (avulsas) return toast("Tarefas avulsas não têm data — exporte em .csv, .json ou imprima.", "erro");
    const dtstamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mentor Concurso//PT-BR", "CALSCALE:GREGORIAN"];
    fonte.forEach((d, i) => {
      const dia = d.data.replace(/-/g, "");
      const fim = addDays(d.data, 1).replace(/-/g, "");
      linhas.push(
        "BEGIN:VEVENT",
        `UID:crono-${i}-${dia}@mentorconcurso`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${dia}`,
        `DTEND;VALUE=DATE:${fim}`,
        `SUMMARY:${icsEsc((d.feita ? "✓ " : "") + d.titulo)}`,
        `DESCRIPTION:${icsEsc([d.categoria, d.topico].filter(Boolean).join(" · "))}`,
        "END:VEVENT"
      );
    });
    linhas.push("END:VCALENDAR");
    baixarArquivo("cronograma.ics", linhas.join("\r\n"), "text/calendar;charset=utf-8");
    return toast("Cronograma exportado (.ics) — importe no seu calendário.");
  }
  if (formato === "print") {
    if (avulsas) {
      const html = `<ul style="margin:0">${fonte.map((d) => `<li>${d.feita ? "[x] " : ""}${esc(d.titulo)}${d.categoria ? ` <i>(${esc(d.categoria)})</i>` : ""}</li>`).join("")}</ul>`;
      return imprimir("Tarefas avulsas — Mentor Concurso", html);
    }
    const porData = {};
    fonte.forEach((d) => (porData[d.data] = porData[d.data] || []).push(d));
    const html = Object.keys(porData)
      .sort()
      .map((dt) => `<h3 style="margin:10px 0 2px">${fmtData(dt)}</h3><ul style="margin:0">${porData[dt].map((d) => `<li>${d.feita ? "[x] " : ""}${esc(d.titulo)}${d.categoria ? ` <i>(${esc(d.categoria)})</i>` : ""}</li>`).join("")}</ul>`)
      .join("");
    imprimir("Cronograma — Mentor Concurso", html);
  }
}

// Barra de exportação reutilizável (semana = ics/csv/json/print · avulsas = csv/json/print).
// Recolhida em <details> para não competir com o cronograma (protagonista da tela).
function exportBarHTML(escopo) {
  const ics =
    escopo === "avulsas"
      ? ""
      : `<button class="menu-item" data-action="exp-crono-ics" data-escopo="${escopo}" data-tip="Arquivo .ics para o Google Agenda / celular.">${icone("calendar")} Calendário (.ics)</button>`;
  return `<details class="doc-mais exportar-menu">
    <summary data-tip="Exportar a agenda (.ics/.csv/.json) ou imprimir." data-tip-pos="cima-dir">${icone("download")} Exportar</summary>
    <div class="doc-mais-pop">
      ${ics}
      <button class="menu-item" data-action="exp-crono-csv" data-escopo="${escopo}">${icone("table")} Planilha (.csv)</button>
      <button class="menu-item" data-action="exp-crono-json" data-escopo="${escopo}">${icone("file-text")} Dados (.json)</button>
      <button class="menu-item" data-action="exp-crono-print" data-escopo="${escopo}">${iconImprimir} Imprimir / PDF</button>
    </div>
  </details>`;
}
function icsEsc(s) {
  return String(s).replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
}

// ---- CORREÇÃO DE ROTA (dir.1): tarefas DATADAS no passado e não concluídas ----
// Decisão do usuário: PERGUNTA POR TAREFA (manter hoje / mover / remover); nada em bloco.
function atrasadasHTML(st, store) {
  const hoje = todayISO();
  const atrasadas = st.missoes
    .filter((m) => m.data && m.data < hoje && !m.concluida)
    .sort((a, b) => a.data.localeCompare(b.data));
  if (!atrasadas.length) return "";
  return `<section class="card atrasadas-card">
    <div class="plano-h"><h2>Tarefas atrasadas</h2><span class="cnt">${atrasadas.length}</span></div>
    <p class="muted small" style="margin:0 0 10px">O Mentor não remarca sozinho. Decida tarefa por tarefa:</p>
    <ul class="atrasadas-lista">
      ${atrasadas
        .map((m) => {
          const cls = CAT_CLASSE[m.categoria] || "geral";
          const t = m.topicoId ? st.topicos.find((x) => x.id === m.topicoId) : null;
          return `<li class="atrasada-item m-${cls}">
            <div class="atrasada-corpo">
              <span class="atrasada-titulo">${esc(m.titulo)}</span>
              <span class="muted small">era ${fmtData(m.data)}${t ? " · " + esc(t.nome) : ""}</span>
            </div>
            <div class="atrasada-acoes">
              <button class="lnk" data-action="atrasada-hoje" data-id="${m.id}" data-tip-pos="cima-dir" data-tip="Trazer para hoje.">→ hoje</button>
              <input type="date" class="atrasada-data" data-id="${m.id}" value="${hoje}" data-tip-pos="cima-dir" data-tip="Mover para outra data." />
              <button class="lnk lnk-danger" data-action="atrasada-remover" data-id="${m.id}" data-tip-pos="cima-dir" data-tip="Remover a tarefa.">remover</button>
            </div>
          </li>`;
        })
        .join("")}
    </ul>
  </section>`;
}

// ---- CRONOGRAMA DA SEMANA (dir. 1): um só cartão. Primeiro o usuário escolhe o DESTINO
// (aba Semana = com dia · aba Tarefas avulsas = sem dia); dentro de cada aba há 2 botões —
// Mentor IA + Adicionar (digitar/colar/importar) — adaptados ao contexto da aba. ----
function cronogramaCardHTML(st, store, opcoesTopico) {
  return `<section class="card cronograma-card cronograma-protag">
    <div class="plano-h">
      <h2>Agenda de estudos</h2>
      <span class="sp"></span>
      <span class="muted small" data-tip="Escolha o destino (Semana = com dia · Tarefas avulsas = sem dia) e adicione como preferir. Nada é criado sem a sua aprovação." data-tip-pos="cima-dir">${icone("info")}</span>
    </div>

    <div class="subtabs" style="margin:0 0 14px">
      <button class="subtab ${tarefasView === "semana" ? "on" : ""}" data-action="ver-semana" data-tip="Tarefas organizadas por dia da semana + sua rotina recorrente.">${icone("calendar-days")} Semana</button>
      <button class="subtab ${tarefasView === "soltas" ? "on" : ""}" data-action="ver-soltas" data-tip="Tarefas sem dia marcado (lista livre).">${icone("clipboard-list")} Tarefas avulsas</button>
    </div>

    ${tarefasView === "soltas" ? blocoAvulsasHTML(st, store, opcoesTopico) : blocoSemanaHTML(st, store)}
  </section>`;
}

// Aba "Semana": tudo entra COM dia. IA = montar a semana inteira; Adicionar = digitar/colar/
// importar (a IA detecta os dias e data as tarefas).
function blocoSemanaHTML(st, store) {
  const fluxoAberto = mostrarDiag || planoPreview || mostrarImport || importPreview || importando;
  return `
    ${
      fluxoAberto
        ? ""
        : `<div class="add-toolbar">
            <button class="btn btn-add btn-sm" data-action="abrir-import" data-tip="Digite, cole (uma por linha) ou importe um arquivo. A IA detecta os dias e data as tarefas.">${icone("square-pen")} Adicionar tarefas</button>
            <button class="btn btn-ia btn-sm" data-action="pedir-plano" data-tip="O Mentor monta a semana inteira (tarefas datadas por dia), respeitando seu tempo e folgas.">${icone("bot")} Montar com o Mentor</button>
          </div>`
    }
    ${importando ? `<section class="card"><div class="ai-frame">${skeletonDoc(5)}</div></section>` : mostrarDiag ? diagHTML(st) : planoPreview ? previewHTML(st) : mostrarImport ? importPanelHTML(st, store) : importPreview ? importPreviewHTML(st, store) : ""}
    ${semanaViewHTML(st, store)}`;
}

// Aba "Tarefas avulsas": tudo entra SEM dia. IA = sugestões rápidas; Adicionar = digitar/colar/
// importar (entram sem dia, opcionalmente vinculadas a um tópico).
function blocoAvulsasHTML(st, store, opcoesTopico) {
  const fluxoAberto = mostrarReplan;
  const iaOn = store.iaDisponivel();
  // Sem IA, "Adicionar tarefas" (offline) é a ação principal; "Sugestões do Mentor IA"
  // (que exige IA) fica de apoio com a nota — assim não parece que sem IA não dá para adicionar.
  return `
    ${
      fluxoAberto
        ? ""
        : `<div class="add-toolbar">
            <button class="btn btn-add btn-sm" data-action="toggle-extrair" data-tip="Digite, cole (uma por linha) ou importe um arquivo. Entram sem dia; opcionalmente vincule a um tópico.">${icone("square-pen")} Adicionar tarefas</button>
            <button class="btn ${iaOn ? "btn-ia" : "btn-ghost"} btn-sm" data-action="toggle-replan" data-tip="O Mentor sugere tarefas (sem dia) com base no seu desempenho, na cobertura do edital e nos dias até a prova.${iaOn ? "" : " Requer IA conectada."}">${icone("zap")} Sugestões do Mentor</button>
          </div>`
    }
    ${mostrarReplan ? replanHTML(store) : ""}
    ${soltasViewHTML(st)}`;
}

// Janela modal "Adicionar tarefas" (avulsas) — fluxo stateful (digitar/colar/importar →
// preview editável → adicionar) com render-loop próprio (abrirJanelaFluxo).
function abrirAdicionarTarefas(app) {
  const { store } = app;
  const opcoesTopico = store.get().topicos.map((t) => `<option value="${t.id}">${esc(nomeTopico(store.get(), t))}</option>`).join("");
  const estado = { preview: null, texto: "", top: "", estim: "", extraindo: false };
  abrirJanelaFluxo({
    titulo: "Adicionar tarefas",
    render: (corpo, { rerender }) => {
      const st = store.get();
      if (estado.preview) {
        corpo.innerHTML = extrairPreviewHTML(st, estado.preview);
        corpo.querySelectorAll(".extrair-titulo-edit").forEach((el) =>
          el.addEventListener("input", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) estado.preview[i].titulo = el.value; }));
        corpo.querySelectorAll(".extrair-obs-edit").forEach((el) =>
          el.addEventListener("input", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) estado.preview[i].observacao = el.value; }));
        corpo.querySelectorAll(".extrair-estim").forEach((el) =>
          el.addEventListener("input", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) estado.preview[i].estimMin = el.value === "" ? null : Math.max(0, parseInt(el.value, 10) || 0); }));
        return;
      }
      corpo.innerHTML = extrairBoxHTML(opcoesTopico, store, estado.texto, estado.top, estado.estim, estado.extraindo);
      const fileEl = corpo.querySelector("#extrair-file");
      if (fileEl) {
        ligarDropZone(fileEl);
        ligarImportArquivo(fileEl, {
          getCfg: () => store.get().config,
          contexto: "uma lista de tarefas/atividades de estudo a fazer: extraia cada tarefa, com a disciplina/assunto e a duração ou prazo quando houver",
          onTexto: (texto) => { const ta = corpo.querySelector("#extrair-texto"); if (ta) ta.value = texto; if (texto.trim()) toast("Texto carregado. Revise e adicione as tarefas."); },
        });
      }
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "cancelar-extrair": () => fechar(),
      extrair: async () => {
        const texto = corpo.querySelector("#extrair-texto").value;
        const top = corpo.querySelector("#extrair-top").value || "";
        const estim = corpo.querySelector("#extrair-estim")?.value || "";
        if (!texto.trim()) return toast("Cole o texto da trilha.", "erro");
        estado.texto = texto; estado.top = top; estado.estim = estim;
        estado.extraindo = true;
        rerender();
        try {
          estado.preview = await store.prepararExtracaoTarefas(texto, top || null, estim || null);
        } catch (e) {
          estado.extraindo = false;
          rerender();
          return toast("Não consegui extrair as tarefas agora. Verifique a conexão e tente de novo em instantes.", "erro");
        }
        estado.extraindo = false;
        rerender();
      },
      "voltar-extrair": () => { estado.preview = null; rerender(); },
      "descartar-extrair": () => fechar(),
      "remover-extrair": (el) => {
        const i = parseInt(el.getAttribute("data-i"), 10);
        if (estado.preview) estado.preview.splice(i, 1);
        if (estado.preview && !estado.preview.length) estado.preview = null;
        rerender();
      },
      "aceitar-extrair": () => {
        const itens = (estado.preview || []).filter((t) => (t.titulo || "").trim());
        if (!itens.length) return toast("Nenhuma tarefa para adicionar.", "erro");
        const n = store.aceitarExtracaoTarefas(itens, estado.top || null);
        tarefasView = "soltas";
        toast(`${plural(n, "tarefa adicionada", "tarefas adicionadas")}.`);
        fechar();
        app.refresh();
      },
    }),
  });
}

// "Adicionar tarefas" da aba AVULSAS: digitar/colar (uma por linha) ou importar arquivo;
// as tarefas entram SEM dia e podem ser vinculadas a um tópico.
function extrairBoxHTML(opcoesTopico, store, texto = "", top = "", estim = "", extraindo = false) {
  const iaOn = store && store.iaDisponivel();
  // Reaplica o tópico escolhido (preserva entre "Voltar para editar").
  const opTop = `<option value="">— nenhum —</option>${opcoesTopico}`.replace(
    `value="${esc(top)}"`,
    `value="${esc(top)}" selected`
  );
  return `<div class="extrair-box">
    <div class="muted small" style="margin-bottom:8px">Tarefas <b>avulsas</b> (sem dia): uma por linha. <b>Tempo</b> opcional no fim, ex.: <code>(45 min)</code>, <code>(1h)</code>. <b>Observação</b> opcional após <code>//</code> (ex.: <code>Ler Lei 8.112 // focar arts. 116/117</code>). <span class="muted" data-tip="Com IA conectada, além do “//”, a observação também é separada automaticamente da frase. Sem IA, use o “//” para separar a observação.">${icone("info")}</span>${iaOn ? "" : ' <i>(sem IA: cada linha vira uma tarefa; use “//” para a observação)</i>'}</div>
    <label>Tarefas
      <textarea id="extrair-texto" rows="4" placeholder="Ex.: Ler a Lei 8.112 // atenção aos arts. 116 e 117 (45 min)&#10;Resolver 20 questões de licitações // focar na Lei 14.133 (30 min)">${esc(texto)}</textarea>
    </label>
    <div class="form-row" style="align-items:flex-end; flex-wrap:wrap; gap:10px">
      <label class="btn btn-ghost btn-sm btn-file" style="margin:0" data-tip="Importar de um PDF ou .txt. Você também pode arrastar o arquivo aqui.">${icone("paperclip")} Importar de arquivo
        <input id="extrair-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden />
      </label>
      <label class="inline" style="margin:0">Vincular ao tópico: <select id="extrair-top">${opTop}</select></label>
      <label class="inline" style="margin:0" data-tip="Aplica este tempo a cada tarefa, A MENOS que a linha já traga um tempo, ex.: (50 min). Opcional; nunca interrompe nada.">Tempo p/ cada (min): <input id="extrair-estim" type="number" min="0" max="1440" placeholder="opcional" style="width:84px" value="${esc(estim)}" /></label>
    </div>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="cancelar-extrair">Cancelar</button>
      <button class="btn btn-primary" data-action="extrair" ${extraindo ? "disabled" : ""}>${extraindo ? "Processando…" : "Revisar tarefas"}</button>
    </div>
  </div>`;
}

// Preview das tarefas avulsas extraídas: editar campos, remover, voltar a editar e então criar.
function extrairPreviewHTML(st, itens) {
  return `<div class="plano-preview">
    <div class="plano-macro"><span>${icone("download")} ${plural(itens.length, "tarefa avulsa", "tarefas avulsas")}. Edite, remova (✕) o que não quiser — depois "Adicionar".</span></div>
    <ul class="prev-editavel">
      ${itens
        .map((it, i) => {
          return `<li class="prev-card m-geral">
            <div class="prev-card-l1">
              <input class="prev-inp extrair-titulo-edit" data-i="${i}" value="${esc(it.titulo)}" placeholder="Tarefa" />
              <button class="prev-remover" data-action="remover-extrair" data-i="${i}" data-tip-pos="cima-dir" data-tip="Remover esta tarefa">${icone("x")}</button>
            </div>
            <input class="prev-inp prev-obs extrair-obs-edit" data-i="${i}" value="${esc(it.observacao || "")}" placeholder="observação (opcional) — lembretes, ressalvas" />
            <div class="prev-card-campos">
              <input type="number" min="0" max="1440" class="extrair-estim" data-i="${i}" value="${it.estimMin || ""}" placeholder="min" data-tip="Tempo sugerido (min), opcional" />
            </div>
          </li>`;
        })
        .join("")}
    </ul>
    <div class="form-acoes plano-acoes">
      <button class="btn btn-ghost" data-action="voltar-extrair" data-tip-pos="cima-esq" data-tip="Volta ao texto colado para corrigir e extrair de novo.">${icone("arrow-left")} Voltar para editar</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-action="descartar-extrair">Descartar</button>
      <button class="btn btn-primary" data-action="aceitar-extrair" ${itens.length ? "" : "disabled"}>Adicionar (${itens.length})</button>
    </div>
  </div>`;
}

// "Adicionar tarefas" da aba SEMANA: digitar/colar (uma por linha) ou importar arquivo;
// a IA estrutura em tarefas DATADAS (detecta os dias da semana). Preview antes de aceitar.
function importPanelHTML(st, store) {
  const iaOn = store.iaDisponivel();
  return `<div class="diag-box">
    <label class="diag-disp-label"><span class="lbl-info-linha">Adicionar à semana <span class="muted small" style="font-weight:400" data-tip="Dia numa linha (Segunda ou Segunda-feira — tanto faz). Abaixo, UMA tarefa por linha (não precisa de “•”). Tempo opcional no fim entre parênteses: (50 min), (1h), (1h30). Observação opcional após “//”.">${icone("info")}</span></span>
      <span class="muted small" style="display:block; font-weight:400; margin:2px 0 6px">
        <b>Dia:</b> uma linha só com o dia (“Segunda” ou “Segunda-feira”, tanto faz).
        <b>Tarefas:</b> uma por linha abaixo do dia (sem precisar de “•”).
        <b>Tempo:</b> opcional no fim entre parênteses, ex.: <code>(50 min)</code>, <code>(1h)</code>, <code>(1h30)</code>.
        <b>Observação:</b> opcional, depois de <code>//</code> (ex.: <code>Ler Lei 8.112 // focar arts. 116 e 117</code>).
      </span>
      <textarea id="import-texto" rows="7" placeholder="Ex.:&#10;Segunda&#10;Direito Constitucional — princípios (50 min)&#10;20 questões de Administrativo (40 min)&#10;Revisar Lei 8.112 // atenção aos arts. 116/117&#10;Terça&#10;Resolver 15 questões de Português (30 min)&#10;Ler súmulas do STJ (1h)">${esc(importTextoSalvo)}</textarea>
    </label>
    <div class="form-row" style="align-items:flex-end; flex-wrap:wrap; gap:10px; margin-bottom:8px">
      <label class="btn btn-ghost btn-sm btn-file" style="margin:0" data-tip="Carregar de um PDF ou .txt. Você também pode arrastar o arquivo aqui.">${icone("paperclip")} Importar de arquivo
        <input id="import-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden />
      </label>
    </div>
    <div class="import-modos muted small">
      <p style="margin:0 0 4px"><b>Estruturar (fiel):</b> transforma o que você colou em tarefas exatamente como está, detectando os dias da semana. Não muda a carga nem a ordem.${iaOn ? "" : " Sem IA, cada linha vira uma tarefa solta."}</p>
      <p style="margin:0"><b>${icone("sparkles")} Adaptar à minha realidade:</b> a IA usa o cronograma como base, mas redistribui a carga ao seu tempo por dia, às suas folgas e aos dias até a prova, priorizando suas lacunas de desempenho.${iaOn ? "" : " <i>(Requer IA conectada.)</i>"}</p>
    </div>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="cancelar-import">Cancelar</button>
      <span class="spacer"></span>
      <button class="btn ${iaOn ? "btn-ghost" : "btn-primary"}" data-action="estruturar-import" ${importando ? "disabled" : ""} data-tip-pos="cima-dir" data-tip="Fiel ao texto: vira tarefas como você colou. Funciona sem IA.">${importando ? "Processando…" : "Estruturar (fiel)"}</button>
      <button class="btn ${iaOn ? "btn-primary" : "btn-ghost"}" data-action="adaptar-import" ${importando || !iaOn ? "disabled" : ""} data-tip-pos="cima-dir" data-tip="A IA ajusta o cronograma ao seu tempo, folgas e desempenho.">${importando ? "Processando…" : "Adaptar à minha realidade"}</button>
    </div>
  </div>`;
}

function importPreviewHTML(st, store) {
  const itens = importPreview;
  // Opções de dia: as 7 datas desta semana + "sem dia". Permite remanejar/dividir a tarefa.
  const semana = store.semanaAtual();
  const diaOpcoes = (sel) =>
    `<option value="" ${!sel ? "selected" : ""}>— sem dia —</option>` +
    semana
      .map((d) => `<option value="${d}" ${sel === d ? "selected" : ""}>${DIAS_SEMANA_CURTO[weekdayISO(d)]} ${fmtData(d).slice(0, 5)}</option>`)
      .join("");
  const catOpcoes = (sel) => CATEGORIAS.map((c) => `<option value="${c}" ${sel === c ? "selected" : ""}>${c}</option>`).join("");
  return `<div class="plano-preview">
    <div class="plano-macro"><span>${icone("download")} ${plural(itens.length, "tarefa", "tarefas")}. Edite os campos, remova (✕) o que não quiser e ajuste o dia — depois "Aceitar".</span></div>
    <ul class="prev-editavel">
      ${itens
        .map((it, i) => {
          const cls = CAT_CLASSE[it.categoria] || "geral";
          return `<li class="prev-card m-${cls}">
            <div class="prev-card-l1">
              <input class="prev-inp import-titulo-edit" data-i="${i}" value="${esc(it.titulo)}" placeholder="Tarefa" />
              <button class="prev-remover" data-action="remover-import" data-i="${i}" data-tip-pos="cima-dir" data-tip="Remover esta tarefa">${icone("x")}</button>
            </div>
            <input class="prev-inp prev-obs import-obs-edit" data-i="${i}" value="${esc(it.observacao || "")}" placeholder="observação (opcional) — lembretes, ressalvas" />
            <div class="prev-card-campos">
              <select class="import-cat" data-i="${i}" data-tip="Categoria">${catOpcoes(it.categoria)}</select>
              <select class="import-dia" data-i="${i}" data-tip="Dia desta tarefa (ou divida em outro dia)">${diaOpcoes(it.data || "")}</select>
              <input type="number" min="0" max="1440" class="import-estim" data-i="${i}" value="${it.estimMin || ""}" placeholder="min" data-tip="Tempo sugerido (min), opcional" />
            </div>
          </li>`;
        })
        .join("")}
    </ul>
    <div class="form-acoes plano-acoes">
      <button class="btn btn-ghost" data-action="voltar-import" data-tip-pos="cima-esq" data-tip="Volta ao texto colado para corrigir e estruturar de novo.">${icone("arrow-left")} Voltar para editar</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-action="descartar-import">Descartar</button>
      <button class="btn btn-primary" data-action="aceitar-import" ${itens.length ? "" : "disabled"}>Aceitar (${itens.length})</button>
    </div>
  </div>`;
}

function diagHTML(st) {
  const niveis = st.config.niveisDisciplina || {};
  const opt = (v, atual, txt) => `<option value="${v}" ${atual === v ? "selected" : ""}>${txt}</option>`;
  return `<div class="diag-box">
    <label class="diag-disp-label">Quanto tempo, em média, você consegue estudar por dia?
      <span class="diag-disp-campo"><input id="diag-disp" type="number" min="0" step="15" value="${st.config.dispDiariaMin || ""}" placeholder="ex.: 120" /> min</span>
    </label>
    <p class="diag-niveis-titulo">Seu nível em cada disciplina <span class="muted small">(define quanto de estudo novo × prática o plano sugere)</span>:</p>
    <div class="diag-niveis">
      ${
        st.disciplinas.length
          ? st.disciplinas
              .map((d) => {
                const adiada = (st.config.disciplinasAdiadas || []).includes(d.id);
                return `<div class="diag-disc-linha ${adiada ? "diag-adiada" : ""}">
                  <span class="diag-disc-nome">${esc(d.nome)}</span>
                  <select class="diag-nivel" data-disc="${d.id}" ${adiada ? "disabled" : ""}>
                    ${opt("", niveis[d.id] || "", "—")}
                    ${opt("nunca", niveis[d.id], "Nunca vi")}
                    ${opt("pouco", niveis[d.id], "Vi pouco")}
                    ${opt("domino", niveis[d.id], "Domino")}
                  </select>
                  <label class="inline small diag-adiar-lbl" data-tip-pos="cima-dir" data-tip="Fixar ajuste do macro: o plano NÃO inclui esta disciplina agora (ex.: 'deixar para outubro').">
                    <input type="checkbox" class="diag-adiar" data-disc="${d.id}" ${adiada ? "checked" : ""} /> adiar
                  </label>
                </div>`;
              })
              .join("")
          : `<p class="muted small">Cadastre disciplinas no Edital primeiro.</p>`
      }
    </div>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="cancelar-plano">Cancelar</button>
      <button class="btn btn-primary" data-action="salvar-diag-gerar">Salvar e gerar plano</button>
    </div>
  </div>`;
}

function mdLevePlano(txt) {
  return esc(txt).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
}

// Painel do refino da IA: comentário + ajustes ACIONÁVEIS (aceita um a um = parcial).
function refinoHTML(refino) {
  const ajustes = refino.ajustes || [];
  const descr = (a) => {
    const dia = a.dia != null && a.dia >= 0 && a.dia <= 6 ? DIAS_SEMANA_CURTO[a.dia] : null;
    if (a.acao === "remover") return `<span class="rf-acao rf-rem">${icone("minus")} Remover</span> “${esc(a.titulo)}”`;
    if (a.acao === "adicionar") return `<span class="rf-acao rf-add">${icone("plus")} Adicionar</span> “${esc(a.titulo)}”${a.categoria ? ` <span class="mini-tag">${esc(a.categoria)}</span>` : ""}${dia ? ` <span class="muted small">(${dia})</span>` : ""}`;
    if (a.acao === "mover") return `<span class="rf-acao rf-mov">${icone("corner-down-right")} Mover</span> “${esc(a.titulo)}”${dia ? ` <span class="muted small">→ ${dia}</span>` : ""}`;
    return esc(a.acao || "");
  };
  return `<div class="revtop-feedback plano-refino">
    <div class="revtop-feedback-titulo"><span class="orb orb-sm" aria-hidden="true"></span> Refino do Mentor IA <span class="selo selo-amarelo">${icone("bot")} confira</span></div>
    ${refino.comentario ? `<div class="revtop-feedback-corpo">${mdLevePlano(refino.comentario)}</div>` : ""}
    ${
      ajustes.length
        ? `<div class="rf-ajustes">
            <div class="muted small" style="margin:8px 0 4px">Ajustes sugeridos (marque os que quiser aplicar — você pode aceitar só alguns):</div>
            <ul class="rf-lista">
              ${ajustes.map((a, i) => `<li class="rf-item"><input type="checkbox" class="rf-cb" data-i="${i}" /><span class="rf-txt">${descr(a)}</span>${a.motivo ? `<span class="rf-motivo muted small">${esc(a.motivo)}</span>` : ""}</li>`).join("")}
            </ul>
            <button class="btn btn-primary btn-sm" data-action="aplicar-refino" data-tip-pos="cima-esq" data-tip="Aplica só os ajustes marcados ao plano (recusar = não marcar nada).">Aplicar ajustes selecionados</button>
          </div>`
        : `<p class="muted small" style="margin-top:6px">A IA não sugeriu mudanças — o plano já está equilibrado.</p>`
    }
  </div>`;
}

function previewHTML(st) {
  const p = planoPreview;
  const macro = p.macro;
  const porDia = {};
  p.itens.forEach((it, i) => {
    const k = it.data || "_semdia";
    (porDia[k] = porDia[k] || []).push({ it, i });
  });
  // Renderiza por TODAS as datas presentes (não só a semana), + grupo "sem dia" ao final.
  const chavesData = Object.keys(porDia).filter((k) => k !== "_semdia").sort();
  if (porDia["_semdia"]) chavesData.push("_semdia");
  const mantidos = p.itens.length - planoDescartados.size;
  const semanasRestantes = macro.diasProva && macro.diasProva > 0 ? Math.ceil(macro.diasProva / 7) : null;
  const macroTxt = macro.dataProva
    ? `Faltam <b>${macro.diasProva} ${macro.diasProva === 1 ? "dia" : "dias"}</b> (~${plural(semanasRestantes, "semana", "semanas")}) para a prova (${fmtData(macro.dataProva)})`
    : `Sem data de prova (plano por rotina semanal)`;
  const pct = macro.coberturaPct || 0;
  return `<div class="plano-preview">
    <div class="plano-macro-visual">
      <div class="plano-macro-cobertura">
        <div class="pmc-rotulo"><span>${icone("library")} Cobertura do edital</span><b class="num">${pct}%</b></div>
        <div class="pmc-barra"><div class="pmc-fill" style="width:${pct}%"></div></div>
        <span class="muted small"><span class="num">${macro.cobertos}/${macro.totalTopicos}</span> tópicos</span>
      </div>
      <div class="plano-macro-info">
        <span>${icone("calendar")} ${macroTxt}</span>
        <span>${icone("calendar-days")} ${plural(macro.diasEstudo, "dia", "dias")} de estudo esta semana · ~${fmtMin(macro.capDiaMin)}/dia</span>
        ${macro.sobra > 0 ? `<span>${icone("corner-down-right")} ${plural(macro.sobra, "tarefa", "tarefas")} ${macro.sobra === 1 ? "fica" : "ficam"} para as próximas semanas</span>` : ""}
        ${macro.adiadas && macro.adiadas.length ? `<span>${icone("pause")} Adiadas (fora do plano): ${esc(macro.adiadas.join(", "))}</span>` : ""}
      </div>
    </div>
    ${
      p.itens.length
        ? chavesData
            .map((d) => {
              const grupo = porDia[d] || [];
              if (!grupo.length) return "";
              const semDia = d === "_semdia";
              const wd = semDia ? null : weekdayISO(d);
              const rotulo = semDia
                ? `<div class="plano-dia-rotulo dr-0"><b>Sem dia</b></div>`
                : `<div class="plano-dia-rotulo dr-${wd}"><b>${DIAS_SEMANA_CURTO[wd]}</b> <span class="muted small">${d.split("-")[2]}/${d.split("-")[1]}</span></div>`;
              return `<div class="plano-dia">
                ${rotulo}
                <ul class="plano-itens">
                  ${grupo
                    .map(({ it, i }) => {
                      const cls = CAT_CLASSE[it.categoria] || "geral";
                      const off = planoDescartados.has(i);
                      return `<li class="plano-item m-${cls} ${off ? "plano-off" : ""}">
                        <input type="checkbox" class="plano-cb" data-i="${i}" ${off ? "" : "checked"} />
                        <span class="plano-item-txt">${esc(it.titulo)}</span>
                        <span class="mini-tag">${esc(it.categoria)}</span>
                        <span class="muted small plano-estim">${fmtMin(it.estimMin)}</span>
                      </li>`;
                    })
                    .join("")}
                </ul>
              </div>`;
            })
            .join("")
        : `<p class="muted" style="padding:10px 0">Sem tarefas a sugerir agora (tudo coberto/dominado, ou faltam tópicos/relevância no Edital). Cadastre tópicos e marque os "que mais caem" no Edital.</p>`
    }
    ${planoRefino ? refinoHTML(planoRefino) : ""}
    <div class="form-acoes plano-acoes">
      <button class="btn btn-ghost btn-sm" data-action="refazer-diag" data-tip-pos="cima-esq" data-tip="Reabrir tempo/dia e níveis por disciplina.">Refazer diagnóstico</button>
      <button class="btn btn-ghost btn-sm" data-action="refinar-plano" ${refinandoPlano ? "disabled" : ""} data-tip-pos="cima-esq" data-tip="A IA comenta o equilíbrio do plano e sugere ajustes.">${refinandoPlano ? "Analisando…" : "Refinar com IA"}</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-action="descartar-plano">Descartar</button>
      <button class="btn btn-primary" data-action="aceitar-plano" ${mantidos ? "" : "disabled"}>Aceitar plano (${mantidos})</button>
    </div>
  </div>`;
}

// ---- Visão "Soltas": a lista livre de sempre, restrita às tarefas sem dia. ----
function soltasViewHTML(st) {
  const soltas = st.missoes.filter((m) => !m.data);
  const pendentes = soltas.filter((m) => !m.concluida);
  const concluidas = soltas.filter((m) => m.concluida);
  return `
    <div class="missoes-barra">
      <span class="missoes-stats muted">${plural(pendentes.length, "pendente", "pendentes")} · ${plural(concluidas.length, "concluída", "concluídas")}</span>
      <span class="spacer"></span>
      <label class="inline">Ordenar por:
        <select id="miss-sort" style="width:150px;padding:5px 10px;font-size:0.82rem">
          <option value="custom" ${missSort === "custom" ? "selected" : ""}>Minha ordem</option>
          <option value="categoria" ${missSort === "categoria" ? "selected" : ""}>Categoria</option>
          <option value="disciplina" ${missSort === "disciplina" ? "selected" : ""}>Disciplina</option>
          <option value="alfabetica" ${missSort === "alfabetica" ? "selected" : ""}>Alfabética</option>
        </select>
      </label>
    </div>
    <div class="cat-legenda">
      <span class="muted small">Categoria (cor da borda):</span>
      ${CATEGORIAS.map((c) => `<span class="cat-leg"><i class="cat-dot cd-${CAT_CLASSE[c]}"></i>${c}</span>`).join("")}
      <span class="spacer"></span>
      ${soltas.length ? `<button class="btn btn-ghost btn-sm" data-action="limpar-avulsas" data-tip-pos="cima-dir" data-tip="Remove todas as tarefas avulsas (sem dia). Não mexe nas tarefas datadas da semana.">${icone("trash-2")} Limpar avulsas</button>` : ""}
      ${exportBarHTML("avulsas")}
    </div>
    ${
      soltas.length
        ? pendentes.length
          ? missoesHTML(st, pendentes, missSort)
          : `<p class="muted" style="padding:10px 0">Nenhuma tarefa avulsa pendente.</p>`
        : vazio(
            "Sua semana está livre\nAdicione tarefas ou monte um cronograma com o Mentor.",
            `<button class="btn btn-add" data-action="toggle-extrair">${icone("square-pen")} Adicionar tarefas</button>
             <button class="btn btn-ia" data-action="toggle-replan">${icone("zap")} Sugestões do Mentor</button>`,
            ""
          )
    }
    ${
      concluidas.length
        ? `<div class="concluidas-head">
            <button class="lnk" data-action="toggle-concluidas">${mostrarConcluidas ? icone("chevron-down") : icone("chevron-right")} ${icone("check")} Concluídas (${concluidas.length})</button>
            <span class="spacer"></span>
            <button class="btn btn-ghost btn-sm" data-action="limpar-concluidas">${icone("trash-2")} Limpar concluídas</button>
          </div>
          ${mostrarConcluidas ? missoesHTML(st, concluidas, missSort) : ""}`
        : ""
    }`;
}

// ---- Visão "Semana": grade Seg→Dom da semana corrente + rotina recorrente. ----
function semanaViewHTML(st, store) {
  const semana = store.semanaAtual();
  const hoje = todayISO();
  const grid = semana
    .map((d) => {
      const wd = weekdayISO(d);
      const [, mm, dd] = d.split("-");
      const ehHoje = d === hoje;
      const folga = store.diaEhFolga(wd);

      // Dia de folga: faixa enxuta, sem tarefas, com link para reativar (na própria linha).
      if (folga) {
        return `<div class="dia-linha dia-folga ${ehHoje ? "dia-hoje" : ""}">
          <div class="dia-rotulo dr-${wd}">
            <div class="dia-rot-top"><b>${DIAS_SEMANA_CURTO[wd]}</b> <span class="muted small">${dd}/${mm}</span></div>
            ${ehHoje ? `<span class="dia-tag">hoje</span>` : ""}
            <button class="lnk dia-folga-btn" data-action="toggle-folga" data-dia="${wd}" data-tip-pos="cima-esq" data-tip="Desmarcar a folga: volta a ser dia de estudo e reaparece na agenda.">estudar neste dia</button>
          </div>
          <div class="dia-conteudo">
            <span class="folga-rotulo">${icone("moon")} Dia de folga <span class="muted small">(sem estudo)</span></span>
          </div>
        </div>`;
      }

      const itens = store.tarefasDoDia(d);
      const totDia = itens.filter((it) => !it.concluida).reduce((a, it) => a + (it.estimMin || 0), 0);
      // Rótulo do dia (esquerda): dia, data, [hoje], tempo sugerido, + tarefa, folga — empilhados.
      const rotulo = `<div class="dia-rotulo dr-${wd}">
          <div class="dia-rot-top"><b>${DIAS_SEMANA_CURTO[wd]}</b> <span class="muted small">${dd}/${mm}</span></div>
          ${ehHoje ? `<span class="dia-tag">hoje</span>` : ""}
          ${totDia > 0 ? `<span class="dia-tempo muted small" data-tip="Tempo sugerido para o dia (estimativa, não é cobrança).">≈ ${fmtMin(totDia)}</span>` : ""}
          <button class="lnk dia-add" data-action="abrir-add-dia" data-data="${d}">+ tarefa</button>
          <button class="lnk dia-folga-set" data-action="toggle-folga" data-dia="${wd}" data-tip-pos="cima-esq" data-tip="Marcar ${DIAS_SEMANA[wd]} como dia de folga (some da agenda). Para desmarcar depois, clique em 'estudar neste dia' no próprio dia.">${icone("moon")} folga</button>
        </div>`;
      return `<div class="dia-linha ${ehHoje ? "dia-hoje" : ""}" data-dia-data="${d}">
        ${rotulo}
        <div class="dia-conteudo">
          ${
            addDiaForm === d
              ? `<div class="add-dia-box">
                  <input class="add-dia-input" data-data="${d}" placeholder="Tarefa neste dia" />
                  <input type="number" min="0" max="1440" class="add-dia-estim" data-data="${d}" placeholder="min" title="Tempo sugerido (opcional); nunca interrompe nada." style="width:64px" />
                  <select class="add-dia-top" data-data="${d}" title="Vincular a um tópico (opcional)"><option value="">— sem tópico —</option>${st.topicos.map((t) => { const dd = st.disciplinas.find((x) => x.id === t.disciplinaId); return `<option value="${t.id}">${esc((dd ? dd.nome + " · " : "") + t.nome)}</option>`; }).join("")}</select>
                  <button class="lnk" data-action="add-dia" data-data="${d}">adicionar</button>
                  <button class="lnk" data-action="cancelar-add-dia">cancelar</button>
                </div>`
              : ""
          }
          ${
            itens.length
              ? `<ul class="dia-itens">${itens.map((it) => diaItemHTML(st, it)).join("")}</ul>`
              : addDiaForm === d
                ? ""
                : `<button class="dia-vazio-add" data-action="abrir-add-dia" data-data="${d}" data-tip="Adicionar uma tarefa neste dia.">${icone("plus")} Nada planejado — adicionar</button>`
          }
        </div>
      </div>`;
    })
    .join("");
  const nRot = st.rotinas.filter((r) => r.ativa !== false).length;
  return `
    <div class="cat-legenda">
      <span class="muted small">Categoria (cor da borda):</span>
      ${CATEGORIAS.map((c) => `<span class="cat-leg"><i class="cat-dot cd-${CAT_CLASSE[c]}"></i>${c}</span>`).join("")}
      <span class="spacer"></span>
      <span class="muted small nota-folga" data-tip-pos="cima-dir" data-tip="Marque um dia como folga no próprio dia, ou defina todos de uma vez em Configurações ▸ Dias de estudo. As duas telas usam a mesma configuração.">${icone("moon")} sobre folgas</span>
      <button class="btn btn-ghost btn-sm" data-action="limpar-semana" data-tip-pos="cima-dir" data-tip="Remove as tarefas datadas desta semana (Seg→Dom). Não mexe na rotina recorrente nem nas avulsas.">${icone("trash-2")} Limpar semana</button>
      ${exportBarHTML("semana")}
    </div>
    <div class="semana-lista">${grid}</div>
    <div class="rotina-head">
      <button class="lnk" data-action="toggle-rotina-painel">${mostrarRotina ? icone("chevron-down") : icone("chevron-right")} Rotina semanal recorrente (${nRot})</button>
      <span class="muted small">tarefas que se repetem toda semana no mesmo dia</span>
    </div>
    ${mostrarRotina ? rotinaPainelHTML(st) : ""}`;
}

function diaItemHTML(st, it) {
  const cls = CAT_CLASSE[it.categoria] || "geral";
  // Edição inline (só tarefas datadas, tipo "missao"): título + tópico + categoria.
  if (it.tipo === "missao" && missEdit.has(it.id)) {
    const catOpts = CATEGORIAS.map((c) => `<option value="${c}" ${c === it.categoria ? "selected" : ""}>${c}</option>`).join("");
    const topOpts =
      `<option value="">— sem tópico —</option>` +
      st.topicos.map((tt) => `<option value="${tt.id}" ${tt.id === it.topicoId ? "selected" : ""}>${esc(nomeTopico(st, tt))}</option>`).join("");
    return `<li class="dia-item m-${cls} dia-item-editando" data-id="${it.id}">
      <div class="dia-item-edit">
        <input class="miss-titulo-input" data-id="${it.id}" value="${esc(it.titulo)}" placeholder="Título da tarefa" />
        <div class="dia-item-edit-campos">
          <select class="miss-top-input" data-id="${it.id}" title="Tópico">${topOpts}</select>
          <select class="miss-cat-input" data-id="${it.id}" title="Categoria">${catOpts}</select>
          <input type="number" min="0" max="1440" class="miss-estim-input" data-id="${it.id}" value="${it.estimMin || ""}" placeholder="min" title="Tempo sugerido (opcional); nunca interrompe nada." style="width:74px" />
        </div>
        <div class="dia-item-edit-acoes">
          <button class="lnk" data-action="salvar-edit" data-id="${it.id}">salvar</button>
          <button class="lnk" data-action="cancelar-edit" data-id="${it.id}">cancelar</button>
        </div>
      </div>
    </li>`;
  }
  // Só tarefas datadas (missao) são arrastáveis entre dias; ocorrências de rotina ficam fixas.
  const arrastavel = it.tipo === "missao";
  return `<li class="dia-item m-${cls} ${it.concluida ? "feito" : ""} ${arrastavel ? "arrastavel" : ""}" data-id="${it.id}" ${arrastavel ? `draggable="true"` : ""}>
    ${arrastavel ? `<span class="dia-grip" data-tip="Arraste para outro dia">${icone("grip-vertical")}</span>` : ""}
    <input type="checkbox" class="missao-check" data-action="toggle-dia-item" data-tipo="${it.tipo}" data-id="${it.id}" data-data="${it.data}" ${it.concluida ? "checked" : ""} />
    <span class="dia-item-txt">${esc(it.titulo)}</span>
    ${it.estimMin ? `<span class="tarefa-tempo muted small" data-tip="Tempo só sugerido.">≈ ${fmtMin(it.estimMin)}</span>` : ""}
    ${
      it.tipo === "rotina"
        ? `<span class="rot-badge" data-tip="Tarefa da sua rotina semanal (gerencie abaixo)">${icone("repeat-2")}</span>`
        : `<button class="mover-btn dia-edit" data-action="edit-titulo" data-id="${it.id}" data-tip="Editar a tarefa">${icone("square-pen")}</button>
           <button class="mover-btn mover-del dia-del" data-action="del-dia-miss" data-id="${it.id}" data-tip="Remover tarefa">${icone("x")}</button>`
    }
  </li>`;
}

function rotinaPainelHTML(st) {
  const opcoesTopico = st.topicos.map((t) => `<option value="${t.id}">${esc(nomeTopico(st, t))}</option>`).join("");
  const catOpts = CATEGORIAS.map((c) => `<option value="${c}">${c}</option>`).join("");
  // Não oferecer dias marcados como folga (a rotina não cai em dia de folga).
  const folga = st.config.diasFolga || [];
  const diasDisp = [1, 2, 3, 4, 5, 6, 0].filter((d) => !folga.includes(d));
  const diaOpts = diasDisp.map((d, i) => `<option value="${d}" ${i === 0 ? "selected" : ""}>${DIAS_SEMANA[d]}</option>`).join("");
  const semDias = diasDisp.length === 0;
  const ativas = st.rotinas
    .filter((r) => r.ativa !== false)
    .slice()
    .sort((a, b) => ((a.dia + 6) % 7) - ((b.dia + 6) % 7) || (a.criadoEm || "").localeCompare(b.criadoEm || ""));
  return `<div class="card rotina-painel">
    ${
      ativas.length
        ? `<ul class="rotina-lista">${ativas
            .map((r) => {
              const cls = CAT_CLASSE[r.categoria] || "geral";
              return `<li class="rotina-item m-${cls}">
                <span class="rot-dia">${DIAS_SEMANA_CURTO[r.dia]}</span>
                <span class="rotina-titulo">${esc(r.titulo)}</span>
                ${r.estimMin ? `<span class="tarefa-tempo muted small" data-tip="Tempo só sugerido.">≈ ${fmtMin(r.estimMin)}</span>` : ""}
                <span class="mini-tag">${esc(r.categoria)}</span>
                <button class="mover-btn mover-del" data-action="del-rotina" data-id="${r.id}" data-tip="Remover da rotina">${icone("x")}</button>
              </li>`;
            })
            .join("")}</ul>`
        : `<p class="muted small">Nenhuma tarefa na rotina ainda. Adicione abaixo o que você faz toda semana no mesmo dia.</p>`
    }
    ${
      semDias
        ? `<p class="muted small">Todos os dias estão marcados como folga. Reative ao menos um dia (na agenda ou em Configurações ▸ Dias de estudo) para criar uma rotina.</p>`
        : `<div class="rotina-form">
            <input id="rot-titulo" placeholder="Ex.: Revisar flashcards do dia" />
            <select id="rot-dia" title="Dia da semana em que se repete">${diaOpts}</select>
            <select id="rot-cat" title="Categoria (cor)">${catOpts}</select>
            <select id="rot-top" title="Tópico (opcional)"><option value="">— sem tópico —</option>${opcoesTopico}</select>
            <input id="rot-estim" type="number" min="0" max="1440" placeholder="min" title="Tempo sugerido (opcional); nunca interrompe nada." style="width:64px" />
            <button class="btn btn-add btn-sm" data-action="add-rotina">Adicionar à rotina</button>
          </div>`
    }
  </div>`;
}

// Lista ÚNICA de tarefas (ordem livre); a categoria é uma etiqueta no item.
// sortMode: "custom" (minha ordem, com ↑/↓) | "categoria" | "alfabetica" | "disciplina".
function missoesHTML(st, missoes, sortMode) {
  const lista = [...missoes];
  if (sortMode === "categoria") {
    lista.sort((a, b) => (ORDEM_CAT[a.categoria] ?? 9) - (ORDEM_CAT[b.categoria] ?? 9) || (a.ordem ?? 0) - (b.ordem ?? 0));
  } else if (sortMode === "alfabetica") {
    lista.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  } else if (sortMode === "disciplina") {
    const disc = (m) => {
      const t = m.topicoId ? st.topicos.find((x) => x.id === m.topicoId) : null;
      const d = t ? st.disciplinas.find((x) => x.id === t.disciplinaId) : null;
      return d ? d.nome : "zzz";
    };
    lista.sort((a, b) => disc(a).localeCompare(disc(b), "pt-BR") || (a.ordem ?? 0) - (b.ordem ?? 0));
  } else {
    lista.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  }

  const podeReordenar = sortMode === "custom";
  const itensHTML = lista
    .map((m, i) => {
      const cls = CAT_CLASSE[m.categoria] || "geral";
      const t = m.topicoId ? st.topicos.find((x) => x.id === m.topicoId) : null;
      const d = t ? st.disciplinas.find((x) => x.id === t.disciplinaId) : null;
      const vinc = t ? `${d ? d.nome + " · " : ""}${t.nome}` : null;
      const opts = CATEGORIAS.map((c) => `<option value="${c}" ${c === m.categoria ? "selected" : ""}>${c}</option>`).join("");
      const topOpts =
        `<option value="">— sem tópico —</option>` +
        st.topicos.map((tt) => `<option value="${tt.id}" ${tt.id === m.topicoId ? "selected" : ""}>${esc(nomeTopico(st, tt))}</option>`).join("");
      const arrastavel = podeReordenar && !missEdit.has(m.id);
      return `<li class="missao-item m-${cls} ${arrastavel ? "arrastavel" : ""}" data-id="${m.id}" data-foco-id="${m.id}" ${arrastavel ? `draggable="true"` : ""}>
        ${arrastavel ? `<span class="dia-grip miss-grip" data-tip="Arraste para reordenar">${icone("grip-vertical")}</span>` : ""}
        <input type="checkbox" class="missao-check" data-action="toggle-miss" data-id="${m.id}" ${m.concluida ? "checked" : ""} />
        <div class="missao-corpo">
          ${
            missEdit.has(m.id)
              ? `<div class="missao-edit">
                  <input class="miss-titulo-input" data-id="${m.id}" value="${esc(m.titulo)}" placeholder="Título da tarefa" />
                  <div class="missao-edit-campos">
                    <label class="inline">Tópico <select class="miss-top-input" data-id="${m.id}">${topOpts}</select></label>
                    <label class="inline">Categoria <select class="miss-cat-input" data-id="${m.id}">${opts}</select></label>
                    <label class="inline">Tempo (min) <input type="number" min="0" max="1440" class="miss-estim-input" data-id="${m.id}" value="${m.estimMin || ""}" placeholder="opcional" style="width:84px" data-tip="Só sugestão; nunca interrompe nada." /></label>
                  </div>
                  <div class="missao-coment-acoes">
                    <button class="lnk" data-action="salvar-edit" data-id="${m.id}">salvar</button>
                    <button class="lnk" data-action="cancelar-edit" data-id="${m.id}">cancelar</button>
                  </div>
                </div>`
              : `<div class="missao-titulo-linha">
                  <span class="missao-titulo ${m.concluida ? "feito" : ""}">${esc(m.titulo)}</span>
                  ${m.estimMin ? `<span class="tarefa-tempo muted small" data-tip="Tempo só sugerido — nunca interrompe nada.">≈ ${fmtMin(m.estimMin)}</span>` : ""}
                  ${vinc ? `<span class="tag-topico" data-tip="Tópico vinculado">${esc(vinc)}</span>` : ""}
                  ${
                    missComent.has(m.id)
                      ? ""
                      : m.comentario
                        ? `<span class="missao-coment-inline"><span class="mci-txt" data-tip="${esc(m.comentario)}">${icone("message-square")} ${esc(m.comentario)}</span> <button class="lnk" data-action="edit-coment" data-id="${m.id}" data-tip="Editar a nota">editar</button></span>`
                        : `<button class="lnk missao-add-coment" data-action="edit-coment" data-id="${m.id}" data-tip="Anotar um lembrete nesta tarefa.">${icone("message-square")} Adicionar nota</button>`
                  }
                </div>`
          }
          ${
            missComent.has(m.id)
              ? `<div class="missao-coment-edit">
                  <textarea class="miss-coment-input" data-id="${m.id}" rows="2" placeholder="Ex.: ler a Lei X — atenção ao art. tal">${esc(m.comentario || "")}</textarea>
                  <div class="missao-coment-acoes">
                    <button class="lnk" data-action="salvar-coment" data-id="${m.id}">salvar</button>
                    <button class="lnk" data-action="cancelar-coment" data-id="${m.id}">cancelar</button>
                  </div>
                </div>`
              : ""
          }
        </div>
        <div class="missao-acoes">
          <button class="mover-btn" data-action="edit-titulo" data-id="${m.id}" data-tip="Editar a tarefa">${icone("square-pen")}</button>
          <button class="mover-btn mover-del" data-action="del-miss" data-id="${m.id}" data-tip="Remover tarefa">${icone("x")}</button>
        </div>
      </li>`;
    })
    .join("");
  return `<ul class="lista-missoes">${itensHTML}</ul>`;
}

function nomeTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
function nomeTopicoCurto(st, id) {
  const t = st.topicos.find((x) => x.id === id);
  return t ? t.nome : "";
}
