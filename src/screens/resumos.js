// Resumos: anotações em texto rico (negrito, itálico, sublinhado, marcador, cores,
// listas), vinculadas a uma disciplina e (opcional) a um tópico. Importa de PDF/texto,
// permite editar e imprimir.
import { bindActions, toast, toastCarregando, header, vazio, confirmar, imprimir, botaoImprimir, avisoIA, ligarDropZone, escolher, focarItem, iconImprimir, pedirNumero, abrirJanela, iconMapa , plural, skeletonDoc } from "../ui.js";
import { ligarImportArquivo } from "../pdf.js";
import { gerarEAbrirMapa } from "../mapa-mental.js";
import { esc, fmtData, todayISO } from "../util.js";
import { icone } from "../icones.js";
import { lerArquivoTexto } from "../pdf.js";
import { filtroTopicosBotaoHTML, filtroTopicosPainelHTML, ligarFiltroTopicos, itemNoFiltro } from "./questoes-filtro.js";
import { abrirSeletorEscopo } from "./seletor-escopo.js";
import { montarMarcacao } from "../marcacao.js";

let marcarAberto = new Set(); // ids de resumos com a marcação tricromática aberta
const filtroTop = { sel: [], aberto: false }; // multi-tópico (disciplinas/tópicos)
let busca = "";
let revModo = {}; // resumoId -> "reler" | "recordar" (modo da revisão vencida)
let revRevelado = new Set(); // ids revelados no modo "recordar" (active recall)

// Cores de TEXTO legíveis nos DOIS temas (antes havia "preto" #111827, que sumia no tema
// escuro). Sem preto: o texto sem cor já usa var(--text), que acompanha o tema.
const CORES_TEXTO = [
  ["#ef4444", "vermelho"],
  ["#3b82f6", "azul"],
  ["#16a34a", "verde"],
  ["#a855f7", "roxo"],
];
const CORES_MARCA = [
  ["#fff3a0", "amarelo"],
  ["#bbf7d0", "verde"],
  ["#bfdbfe", "azul"],
  ["#fbcfe8", "rosa"],
];

export default function renderResumos(root, app) {
  const { store } = app;
  const st = store.get();
  // Foco num resumo específico (Dossiê): limpa busca/filtro e rola até ele.
  let focoRes = null;
  if (app.params && app.params.focoResumoId) {
    focoRes = app.params.focoResumoId;
    app.params.focoResumoId = null;
    busca = "";
    filtroTop.sel = [];
  }
  // Escopo vindo do "Hoje" (Revisar → deste tópico): pré-filtra pelo tópico.
  if (app.params && app.params.topicoId) {
    filtroTop.sel = [app.params.topicoId];
    app.params.topicoId = null;
  }
  // Abrir a marcação direto (vindo do dossiê de marcações).
  if (app.params && app.params.marcarId) {
    marcarAberto.add(app.params.marcarId);
    app.params.marcarId = null;
  }
  // Abertura externa (ex.: Revisão de Tópicos) já com a JANELA de novo resumo pré-vinculada
  // a um tópico — aberta ao final do render.
  let abrirNovoTopico = null;
  if (app.params && app.params.novoResumoTopico) {
    abrirNovoTopico = app.params.novoResumoTopico;
    app.params.novoResumoTopico = null;
  }

  const lista = resumosFiltrados(st);

  root.innerHTML = `
    ${header("Resumos", "Suas anotações com formatação, por disciplina e tópico", botaoImprimir())}

    <div class="barra-acoes">
      <input id="res-busca" type="search" class="busca-input" placeholder="Buscar nos resumos..." value="${esc(busca)}" title="Busca por texto no título e no conteúdo dos seus resumos (correspondência literal, não semântica)." />
      ${filtroTopicosBotaoHTML(st, filtroTop.sel, filtroTop.aberto)}
      <span class="spacer"></span>
      <button class="btn btn-add btn-sm" data-action="toggle-gerar" data-tip="Compila do seu material/flashcards/erros/lei/juris, ou a IA sintetiza por tópico, aula e subtópico.">${icone("plus")} Gerar resumo de…</button>
      <button class="btn btn-add btn-sm" data-action="novo">Novo resumo</button>
    </div>
    ${filtroTopicosPainelHTML(st, filtroTop.sel, filtroTop.aberto)}

    <div class="plano-h"><h2>Resumos</h2>${st.resumos.length ? `<span class="cnt">${st.resumos.length}</span>` : ""}</div>
    <div class="lista-resumos">
      ${
        lista.length
          ? lista.map((r) => resumoHTML(st, r)).join("")
          : st.resumos.length
            ? vazio("Nenhum resumo com esse filtro\nAjuste a busca ou os tópicos selecionados para ver seus resumos.", "", icone("search"))
            : vazio(
                "Comece o seu primeiro resumo\nAnote o essencial de cada tópico para revisar e gerar flashcards depois.",
                `<button class="btn btn-add btn-sm" data-action="novo">Novo resumo</button>`,
                icone("notebook-pen")
              )
      }
    </div>`;

  // busca incremental
  root.querySelector("#res-busca")?.addEventListener("input", (e) => {
    busca = e.target.value;
    const cont = root.querySelector(".lista-resumos");
    const l = resumosFiltrados(st);
    cont.innerHTML = l.length
      ? l.map((r) => resumoHTML(st, r)).join("")
      : vazio("Nenhum resumo com esse filtro\nAjuste a busca ou os tópicos selecionados para ver seus resumos.", "", icone("search"));
  });
  ligarFiltroTopicos(root, app, filtroTop);
  focarItem(root, focoRes);

  // Monta a marcação tricromática nos resumos com o painel aberto (sobre o texto extraído).
  root.querySelectorAll("[data-mk-host]").forEach((host) => {
    const id = host.getAttribute("data-mk-host");
    const r = st.resumos.find((x) => x.id === id);
    const texto = r ? textoPuro(r.conteudoHTML) : "";
    if (texto.trim()) montarMarcacao(host, { store, alvoTipo: "resumo", alvoId: id, texto, topicoId: r.topicoId, tituloFonte: r.titulo });
  });

  bindActions(root, {
    novo: () => abrirEditarResumo(app),
    // Clicar no título abre/fecha a leitura do resumo (o mesmo que "Ler resumo").
    "ler-resumo": (el) => {
      const card = el.closest(".resumo-item");
      const det = card && card.querySelector(".resumo-leia");
      if (det) det.open = !det.open;
    },
    "toggle-marcar": (el) => {
      const id = el.getAttribute("data-id");
      if (marcarAberto.has(id)) marcarAberto.delete(id);
      else marcarAberto.add(id);
      app.refresh();
    },
    "toggle-gerar": () => abrirGerarResumo(app),
    editar: (el) => {
      const r = store.get().resumos.find((x) => x.id === el.getAttribute("data-id"));
      if (r) abrirEditarResumo(app, { resumo: r });
    },
    remover: async (el) => {
      if (await confirmar("Remover este resumo?")) {
        store.removerResumo(el.getAttribute("data-id"));
        toast("Resumo removido.");
      }
    },
    imprimir: (el) => {
      const id = el.getAttribute("data-id");
      if (id) {
        const r = st.resumos.find((x) => x.id === id);
        if (r) imprimir(`Resumo — ${r.titulo}`, `<div class="print-meta">${esc(vinculoNome(st, r))}</div><div class="resumo-corpo">${sanitize(r.conteudoHTML || "")}</div>`);
        return;
      }
      // Botão do topo: imprime os resumos do filtro/busca atuais.
      const l = resumosFiltrados(st);
      if (!l.length) return toast("Nenhum resumo para imprimir com esse filtro.", "erro");
      imprimir("Resumos — Mentor Concurso", printResumos(st, l));
    },
    "mapa-mental": (el) => gerarEAbrirMapa(store, app, () => store.gerarMapaMentalDeResumo(el.getAttribute("data-id"))),
    "ger-flashcards": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar flashcards do resumo");
      const r = await pedirNumero("Quantos flashcards a IA deve gerar deste resumo?", { padrao: 6, min: 1, max: 30, nivel: true });
      if (!r) return;
      const { n, dificuldade } = r;
      el.classList.add("lnk-disabled");
      try {
        const cards = await store.gerarFlashcardsDeResumo(el.getAttribute("data-id"), n, dificuldade);
        toast(cards.length ? `${plural(cards.length, "flashcard gerado", "flashcards gerados")} do resumo.` : "A IA não retornou flashcards.", cards.length ? "ok" : "erro");
      } catch (e) {
        toast("Não consegui gerar os flashcards agora. Tente de novo em instantes.", "erro");
      }
    },
    "ger-questoes": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar questões do resumo");
      const r = await pedirNumero("Quantas questões a IA deve gerar deste resumo?", { padrao: 5, min: 1, max: 30, nivel: true });
      if (!r) return;
      const { n, dificuldade } = r;
      el.classList.add("lnk-disabled");
      try {
        const qs = await store.gerarQuestoesDeResumo(el.getAttribute("data-id"), n, dificuldade);
        toast(qs.length ? `${plural(qs.length, "questão de múltipla escolha gerada", "questões de múltipla escolha geradas")} do resumo.` : "A IA não retornou questões.", qs.length ? "ok" : "erro");
      } catch (e) {
        toast("Não consegui gerar as questões agora. Tente de novo em instantes.", "erro");
      }
    },
    "ger-questoes-ce": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar questões Certo/Errado do resumo");
      const r = await pedirNumero("Quantas afirmações Certo/Errado a IA deve gerar deste resumo?", { padrao: 6, min: 1, max: 30, nivel: true });
      if (!r) return;
      const { n, dificuldade } = r;
      el.classList.add("lnk-disabled");
      try {
        const qs = await store.gerarQuestoesCEDeResumo(el.getAttribute("data-id"), n, dificuldade);
        toast(qs.length ? `${plural(qs.length, "afirmação Certo/Errado gerada", "afirmações Certo/Errado geradas")} do resumo.` : "A IA não retornou itens.", qs.length ? "ok" : "erro");
      } catch (e) {
        toast("Não consegui gerar agora. Tente de novo em instantes.", "erro");
      }
    },
    "ir-dossie": (el) => app.navigate("edital", { dossieTopicoId: el.getAttribute("data-top") }),
    // ---- revisão espaçada do resumo ----
    "prog-rev-resumo": async (el) => {
      const id = el.getAttribute("data-id");
      const dias = await escolher("Quando revisar este resumo pela primeira vez? Depois o intervalo cresce sozinho conforme você lembra.", [
        { label: "Em 24h", value: "1", cls: "btn-primary" },
        { label: "Em 7 dias", value: "7" },
        { label: "Em 15 dias", value: "15" },
        { label: "Em 30 dias", value: "30" },
      ]);
      if (dias) {
        store.agendarRevisaoResumo(id, parseInt(dias, 10));
        toast(`Combinado — aviso você em ${plural(dias, "dia", "dias")}.`);
      }
    },
    "rev-modo-resumo": (el) => {
      const id = el.getAttribute("data-id");
      revModo[id] = el.getAttribute("data-modo");
      revRevelado.delete(id);
      app.refresh();
    },
    "rev-revelar-resumo": (el) => {
      revRevelado.add(el.getAttribute("data-id"));
      app.refresh();
    },
    "rev-resumo": (el) => {
      const id = el.getAttribute("data-id");
      const dias = store.revisarResumo(id, el.getAttribute("data-res"));
      revRevelado.delete(id);
      delete revModo[id];
      toast(dias === 1 ? "Sem problema. Volta amanhã." : `Boa! Próxima revisão em ${plural(dias, "dia", "dias")}.`);
    },
    "cancelar-rev-resumo": (el) => {
      store.cancelarRevisaoResumo(el.getAttribute("data-id"));
      toast("Revisão cancelada.");
    },
  });

  // Abertura externa pré-vinculada a um tópico (ex.: Revisão de Tópicos → "novo resumo").
  if (abrirNovoTopico) abrirEditarResumo(app, { prefill: { topicoId: abrirNovoTopico } });
}

const FONTES_RESUMO = [
  ["material", "Materiais"],
  ["flashcards", "Flashcards"],
  ["erros", "Caderno de erros"],
  ["lei", "Lei Seca"],
  ["juris", "Jurisprudência"],
];
// Janela modal "Gerar resumo de..." — painel de fontes + escopo → Compilar (offline) ou
// Sintetizar (IA). Passo único: aplica e fecha (abrirJanela). No modal não há o "tremido"
// de layout que motivava o toggle por `hidden` na versão inline.
function abrirGerarResumo(app) {
  const { store } = app;
  abrirJanela({
    titulo: "Gerar resumo do seu conteúdo",
    corpoHTML: gerarPanelHTML(store.get(), true),
    aoMontar: (overlay, fechar) => {
      const corpo = overlay.querySelector(".mm-corpo");
      bindActions(corpo, {
        // Síntese por ESCOPO (tópico → aula → subtópico, ou material): fecha este modal e
        // abre o seletor de escopo unificado (mesmo das outras telas).
        "gerar-escopo": () => { fechar(); abrirSeletorEscopo(app, { tipo: "resumo", titulo: "Sintetizar resumo" }); },
        gerar: () => {
          const fontes = [...corpo.querySelectorAll(".ger-fonte:checked")].map((c) => c.value);
          if (!fontes.length) return toast("Marque pelo menos uma fonte.", "erro");
          const escopo = corpo.querySelector("#ger-escopo-top").value;
          const r = store.gerarResumoMulti(fontes, escopo);
          if (r) { toast("Resumo compilado. Edite se quiser."); fechar(); app.refresh(); }
          else toast("Sem conteúdo nessas fontes/escopo.", "erro");
        },
        "sintetizar-ia": async (el) => {
          if (!store.iaDisponivel()) return avisoIA(app, "Sintetizar resumo com IA");
          const fontes = [...corpo.querySelectorAll(".ger-fonte:checked")].map((c) => c.value);
          if (!fontes.length) return toast("Marque pelo menos uma fonte.", "erro");
          const escopo = corpo.querySelector("#ger-escopo-top").value;
          el.classList.add("lnk-disabled");
          el.setAttribute("disabled", "");
          const skel = document.createElement("div");
          skel.innerHTML = `<div class="ai-frame u-mt-12">${skeletonDoc(4)}</div>`;
          corpo.appendChild(skel);
          const fim = toastCarregando("Sintetizando com a IA…");
          try {
            const r = await store.gerarResumoSinteseIA(fontes, escopo);
            if (r) { toast("Resumo sintetizado pela IA. Confira e edite se quiser."); fechar(); app.refresh(); }
            else { toast("Sem conteúdo nessas fontes/escopo.", "erro"); skel.remove(); el.classList.remove("lnk-disabled"); el.removeAttribute("disabled"); }
          } catch (e) {
            toast("Não consegui sintetizar o resumo agora. Tente de novo em instantes.", "erro");
            skel.remove();
            el.classList.remove("lnk-disabled");
            el.removeAttribute("disabled");
          } finally { fim(); }
        },
      });
    },
  });
}

function gerarPanelHTML(st, aberto) {
  const opcoesTopico = `<option value="todos">Todos os tópicos</option>` + st.topicos.map((t) => `<option value="${t.id}">${esc(nomeTopico(st, t))}</option>`).join("");
  return `
    <div class="card gerar-panel" ${aberto ? "" : "hidden"}>
      <h3><span class="orb orb-sm" aria-hidden="true" style="display:inline-block;vertical-align:middle"></span> Gerar resumo a partir do seu conteúdo</h3>
      <p class="muted small">Reúne as fontes que você marcar, no escopo escolhido. Escolha como montar: <b>Compilar</b> (offline, fiel ao texto) ou <b>${icone("sparkles")} Sintetizar com IA</b> (condensa e organiza; com selo de origem, confira).</p>
      <div class="ger-fontes">
        ${FONTES_RESUMO.map(([v, n]) => `<label class="ger-fonte-chip"><input type="checkbox" class="ger-fonte" value="${v}" ${v === "material" ? "checked" : ""} /> ${n}</label>`).join("")}
      </div>
      <div class="form-row" style="align-items:flex-end; gap:12px; margin-top:10px">
        <label class="inline">Escopo: <select id="ger-escopo-top">${opcoesTopico}</select></label>
        <button class="btn btn-primary btn-sm" data-action="gerar" data-tip="Compila um rascunho fiel (offline): apenas concatena o seu conteúdo, sem IA.">Compilar (offline)</button>
        <button class="btn btn-ghost btn-sm" data-action="sintetizar-ia" data-tip="A IA condensa e organiza o MESMO conteúdo num resumo didático (com selo de origem, confira).">${icone("sparkles")} Sintetizar com IA</button>
      </div>
      <div class="add-sep">Ou sintetizar por tópico, aula ou subtópico do índice:</div>
      <button class="btn btn-ia btn-sm" data-action="gerar-escopo" data-tip="A IA sintetiza um resumo escolhendo tópico → aula → subtópico (ou um material direto).">${icone("sparkles")} Sintetizar de tópico/aula/material</button>
    </div>`;
}

// Janela modal "Novo resumo / Editar" — editor de texto rico (contenteditable + toolbar
// execCommand + importar arquivo). Passo único (sem re-render), então o conteúdo do editor
// fica preservado: uso abrirJanela. Abre em JANELA normal; o botão "⛶ Tela cheia" expande.
function abrirEditarResumo(app, { resumo = null, prefill = null } = {}) {
  const { store } = app;
  const st = store.get();
  const obj = resumo || prefill || null;
  const ehEdicao = !!(resumo && resumo.id);
  abrirJanela({
    titulo: ehEdicao ? "Editar resumo" : "Novo resumo",
    corpoHTML: formHTML(st, obj),
    aoMontar: (overlay, fechar) => {
      const corpo = overlay.querySelector(".mm-corpo");
      // cascata disciplina -> tópico
      const discEl = corpo.querySelector("#res-disc");
      const topEl = corpo.querySelector("#res-top");
      if (discEl && topEl) discEl.addEventListener("change", () => { topEl.innerHTML = topicoOptions(st, discEl.value || "", null); });
      // editor rico
      const editor = corpo.querySelector("#res-editor");
      if (editor) {
        if (obj && obj.conteudoHTML) editor.innerHTML = sanitize(obj.conteudoHTML);
        corpo.querySelectorAll(".rt-btn, .rt-swatch").forEach((b) => {
          b.addEventListener("mousedown", (ev) => {
            ev.preventDefault();
            editor.focus();
            const cmd = b.getAttribute("data-cmd");
            const val = b.getAttribute("data-val");
            if (cmd === "hilite") document.execCommand("hiliteColor", false, val);
            else if (cmd === "forecolor") document.execCommand("foreColor", false, val);
            else if (cmd === "formatBlock") document.execCommand("formatBlock", false, val);
            else document.execCommand(cmd, false, null);
          });
        });
        editor.addEventListener("keydown", (ev) => {
          if (ev.key === "Tab") { ev.preventDefault(); document.execCommand(ev.shiftKey ? "outdent" : "indent", false, null); }
        });
      }
      // importar PDF/txt para o editor
      const fileEl = corpo.querySelector("#res-file");
      if (fileEl) {
        ligarDropZone(fileEl);
        ligarImportArquivo(fileEl, {
          getCfg: () => store.get().config,
          contexto: "um material de referência para criar um resumo de estudos: extraia o conteúdo principal e a estrutura didática (títulos, tópicos, definições e pontos-chave)",
          onTexto: (texto) => {
            if (!texto.trim()) return;
            const ed = corpo.querySelector("#res-editor");
            ed.innerHTML += texto.split(/\n\s*\n/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
            toast("Conteúdo importado. Edite e salve.");
          },
        });
      }
      bindActions(corpo, {
        cancelar: () => fechar(),
        salvar: () => {
          const titulo = corpo.querySelector("#res-titulo").value.trim();
          const disciplinaId = corpo.querySelector("#res-disc").value || null;
          const topicoId = corpo.querySelector("#res-top").value || null;
          const conteudoHTML = sanitize(corpo.querySelector("#res-editor").innerHTML);
          if (!titulo) return toast("Dê um título ao resumo.", "erro");
          if (!disciplinaId && !topicoId) return toast("Vincule a uma disciplina (e, se quiser, a um tópico).", "erro");
          if (ehEdicao) { store.editarResumo(resumo.id, { titulo, disciplinaId, topicoId, conteudoHTML }); toast("Resumo atualizado."); }
          else { store.addResumo({ titulo, disciplinaId, topicoId, conteudoHTML }); toast("Resumo salvo."); }
          fechar();
          app.refresh();
        },
      });
    },
  });
}

function formHTML(st, e) {
  const sel = e || {};
  let discId = sel.disciplinaId || "";
  if (!discId && sel.topicoId) {
    const t = st.topicos.find((x) => x.id === sel.topicoId);
    discId = t ? t.disciplinaId : "";
  }
  const opcoesDisc = `<option value="">— selecione —</option>` + st.disciplinas.map((d) => `<option value="${d.id}" ${d.id === discId ? "selected" : ""}>${esc(d.nome)}</option>`).join("");
  return `
    <div class="card form-resumo">
      <h3>${e && e.id ? "Editar resumo" : "Novo resumo"}</h3>
      <div class="form-row">
        <label class="u-grow-2">Título <input id="res-titulo" type="text" value="${esc(sel.titulo || "")}" placeholder="Ex.: Atributos do ato administrativo" /></label>
        <label>Disciplina <select id="res-disc">${opcoesDisc}</select></label>
        <label>Tópico (opcional) <select id="res-top">${topicoOptions(st, discId, sel.topicoId)}</select></label>
      </div>
      <div class="rt-toolbar">
        <button type="button" class="rt-btn" data-cmd="formatBlock" data-val="h3" title="Título de seção">${icone("heading")}</button>
        <button type="button" class="rt-btn" data-cmd="bold" title="Negrito">${icone("bold")}</button>
        <button type="button" class="rt-btn" data-cmd="italic" title="Itálico">${icone("italic")}</button>
        <button type="button" class="rt-btn" data-cmd="underline" title="Sublinhado">${icone("underline")}</button>
        <button type="button" class="rt-btn" data-cmd="strikeThrough" title="Tachado">${icone("strikethrough")}</button>
        <span class="rt-sep"></span>
        <span class="rt-grupo" title="Cor do marcador">
          ${CORES_MARCA.map(([c, n]) => `<button type="button" class="rt-swatch" data-cmd="hilite" data-val="${c}" title="Marcador ${n}" style="background:${c}"></button>`).join("")}
        </span>
        <span class="rt-sep"></span>
        <span class="rt-grupo" title="Cor do texto">A
          ${CORES_TEXTO.map(([c, n]) => `<button type="button" class="rt-swatch" data-cmd="forecolor" data-val="${c}" title="Texto ${n}" style="background:${c}"></button>`).join("")}
        </span>
        <span class="rt-sep"></span>
        <button type="button" class="rt-btn" data-cmd="insertUnorderedList" title="Lista (tópicos)">${icone("list")}</button>
        <button type="button" class="rt-btn" data-cmd="insertOrderedList" title="Lista numerada">${icone("list-ordered")}</button>
        <button type="button" class="rt-btn" data-cmd="outdent" title="Subir nível (menos recuo)">${icone("indent-decrease")}</button>
        <button type="button" class="rt-btn" data-cmd="indent" title="Sub-tópico (mais recuo)">${icone("indent-increase")}</button>
        <button type="button" class="rt-btn" data-cmd="removeFormat" title="Limpar formatação">${icone("eraser")}</button>
        <span class="spacer"></span>
        <label class="btn btn-ghost btn-sm btn-file" data-tip="Importar texto de um PDF ou arquivo .txt para o editor. Você também pode arrastar o arquivo aqui.">${icone("paperclip")} Importar de arquivo
          <input id="res-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden />
        </label>
      </div>
      <div id="res-editor" class="rt-editor" contenteditable="true"></div>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="cancelar">Cancelar</button>
        <button class="btn btn-primary" data-action="salvar">${e ? "Salvar alterações" : "Salvar resumo"}</button>
      </div>
    </div>`;
}

function resumoHTML(st, r) {
  const topico = r.topicoId ? st.topicos.find((t) => t.id === r.topicoId) : null;
  const vinc = topico
    ? `<button class="tag-topico lnk" data-action="ir-dossie" data-top="${topico.id}">${esc(nomeTopico(st, topico))}</button>`
    : `<span class="tag-topico">${esc(vinculoNome(st, r))}</span>`;
  const vencida = !!(r.revisao && r.revisao.proxima <= todayISO());
  const modo = revModo[r.id] || "reler";
  const revelado = revRevelado.has(r.id);
  const ocultar = vencida && modo === "recordar" && !revelado; // active recall: esconde até revelar
  const temTexto = !!textoPuro(r.conteudoHTML).trim();
  // Prévia compacta do conteúdo (2-3 linhas via line-clamp); o texto completo abre num <details>.
  const previa = temTexto ? esc(textoPuro(r.conteudoHTML).trim()) : "";
  return `
    <div class="card resumo-item ${vencida ? "resumo-revisar" : ""}" data-foco-id="${r.id}">
      <div class="resumo-head">
        <b class="resumo-titulo" data-action="ler-resumo" data-id="${r.id}" role="button" tabindex="0" title="Abrir/fechar a leitura do resumo">${esc(r.titulo)}</b>
        ${r.origem && r.origem.tipo === "ia-sintese" ? `<span class="selo selo-amarelo">${icone("bot")} síntese IA · confira</span>` : r.origem && (r.origem.tipo === "ia" || r.origem.tipo === "compilado") ? `<span class="selo selo-amarelo">${icone("bot")} rascunho · confira</span>` : ""}
        ${vinc}
        <span class="spacer"></span>
        <span class="muted small">${fmtData(r.data)}</span>
      </div>
      <div class="resumo-acoes">
        <details class="resumo-menu">
          <summary class="lnk" title="Mais ações">${icone("ellipsis")}</summary>
          <div class="resumo-menu-pop">
            ${
              !r.revisao && temTexto
                ? `<button class="lnk" data-action="prog-rev-resumo" data-id="${r.id}" data-tip-pos="cima-dir" data-tip="Programar revisão espaçada deste resumo (curva do esquecimento: 24h/7d/15d/30d…).">${icone("alarm-clock")} Revisar (espaçada)</button>`
                : ""
            }
            <button class="lnk" data-action="ger-flashcards" data-id="${r.id}" data-tip-pos="cima-dir" data-tip="Gera flashcards com IA a partir deste resumo.">${icone("layers")} Flashcards</button>
            <button class="lnk" data-action="ger-questoes" data-id="${r.id}" data-tip-pos="cima-dir" data-tip="Gera questões de múltipla escolha (IA) a partir deste resumo.">${icone("notebook-pen")} Questões (múltipla escolha)</button>
            <button class="lnk" data-action="ger-questoes-ce" data-id="${r.id}" data-tip-pos="cima-dir" data-tip="Gera afirmações Certo/Errado (IA) a partir deste resumo.">${icone("check-check")} Questões Certo/Errado</button>
            ${
              temTexto
                ? marcarAberto.has(r.id)
                  ? `<button class="lnk" data-action="toggle-marcar" data-id="${r.id}">${icone("check")} marcando</button>`
                  : `<button class="lnk" data-action="toggle-marcar" data-id="${r.id}" data-tip-pos="cima-dir" data-tip="Grifar palavras-chave e prazos.">${icone("square-pen")} marcar</button>`
                : ""
            }
            <button class="lnk" data-action="mapa-mental" data-id="${r.id}" data-tip-pos="cima-dir" data-tip="Gerar um mapa mental deste resumo (IA).">${iconMapa} Mapa mental</button>
            <button class="lnk" data-action="imprimir" data-id="${r.id}" data-tip-pos="cima-dir" data-tip="Imprimir ou salvar em PDF.">${iconImprimir} Imprimir</button>
            <button class="lnk" data-action="editar" data-id="${r.id}" data-tip-pos="cima-dir" data-tip="Editar este resumo.">${icone("square-pen")} Editar</button>
            <button class="lnk lnk-danger" data-action="remover" data-id="${r.id}" data-tip-pos="cima-dir" data-tip="Remover este resumo.">${icone("x")} Remover</button>
          </div>
        </details>
      </div>
      ${revisaoResumoHTML(r, vencida, modo, revelado)}
      ${
        marcarAberto.has(r.id)
          ? `<div class="resumo-marcar"><p class="muted small u-m-0 u-mb-8">Marcação sobre o <b>texto extraído</b> do resumo (a formatação rica fica preservada na edição).</p><div class="mk-host" data-mk-host="${r.id}"></div></div>`
          : ocultar
            ? `<div class="resumo-conteudo resumo-oculto muted"><i>Conteúdo oculto — tente recordar o que este resumo traz e toque em “Revelar conteúdo”.</i></div>`
            : temTexto
              ? `<div class="resumo-conteudo">
                  <p class="resumo-previa">${previa}</p>
                  <details class="resumo-leia">
                    <summary class="lnk">Ler resumo</summary>
                    <div class="resumo-corpo">${sanitize(r.conteudoHTML || "")}</div>
                  </details>
                </div>`
              : `<div class="resumo-conteudo"><span class="muted">(vazio)</span></div>`
      }
    </div>`;
}

// Bloco de revisão espaçada do resumo (reusa o visual da memória de lei/juris: ls-rev*).
// Vencida → caixa âmbar com 2 modos (reler · recordar) + notas; agendada → próxima data.
function revisaoResumoHTML(r, vencida, modo, revelado) {
  if (!r.revisao) return "";
  if (!vencida) {
    return `<div class="ls-rev"><span class="muted small">${icone("bell")} Próxima revisão: <b>${fmtData(r.revisao.proxima)}</b></span>
      <button class="lnk lnk-danger" data-action="cancelar-rev-resumo" data-id="${r.id}" data-tip="Tirar do ciclo de revisão.">cancelar</button></div>`;
  }
  const trava = modo === "recordar" && !revelado;
  return `<div class="ls-rev ls-rev-due res-rev">
      <div class="res-rev-topo">
        <span class="rev-chamada">${icone("bell")} Hora de revisar — você ainda lembra deste resumo?</span>
        <span class="res-rev-modos">
          <button class="lnk ${modo === "reler" ? "on" : ""}" data-action="rev-modo-resumo" data-id="${r.id}" data-modo="reler" data-tip="Reler o resumo e se autoavaliar.">${icone("eye")} Reler</button>
          <button class="lnk ${modo === "recordar" ? "on" : ""}" data-action="rev-modo-resumo" data-id="${r.id}" data-modo="recordar" data-tip="Esconde o resumo; tente lembrar antes de revelar (recordação ativa).">${icone("brain")} Recordar</button>
        </span>
      </div>
      ${trava ? `<button class="btn btn-ghost btn-sm" data-action="rev-revelar-resumo" data-id="${r.id}">Revelar conteúdo</button>` : ""}
      <span class="rev-botoes">
        <button class="lnk" data-action="rev-resumo" data-id="${r.id}" data-res="esqueci" ${trava ? "disabled" : ""} data-tip="Reinicia o ciclo (revisa amanhã).">${icone("frown")} Esqueci</button>
        <button class="lnk" data-action="rev-resumo" data-id="${r.id}" data-res="ok" ${trava ? "disabled" : ""} data-tip="Sobe um degrau no intervalo.">${icone("smile")} Lembrei</button>
        <button class="lnk" data-action="rev-resumo" data-id="${r.id}" data-res="facil" ${trava ? "disabled" : ""} data-tip="Sobe dois degraus (consolidando).">${icone("laugh")} Fácil</button>
      </span>
    </div>`;
}

// ---------- helpers ----------
// Resumos após o filtro de disciplina + a busca atuais (fonte única para a lista e a impressão).
function resumosFiltrados(st) {
  // Recém-criados primeiro (padrão), como nos flashcards/questões.
  let l = [...st.resumos].sort((a, b) => (a.data < b.data ? 1 : -1));
  l = l.filter((r) => itemNoFiltro(st, r, filtroTop.sel));
  const q = busca.trim().toLowerCase();
  if (q) l = l.filter((r) => r.titulo.toLowerCase().includes(q) || textoPuro(r.conteudoHTML).toLowerCase().includes(q));
  return l;
}
function printResumos(st, lista) {
  if (!lista.length) return "<p>Nenhum resumo.</p>";
  return lista
    .map(
      (r) => `<div class="print-item">
        <h3 style="margin:0 0 2px">${esc(r.titulo)}</h3>
        <div class="print-meta">${esc(vinculoNome(st, r))} · ${fmtData(r.data)}</div>
        <div class="resumo-corpo">${sanitize(r.conteudoHTML || "")}</div>
      </div>`
    )
    .join("");
}
function topicoOptions(st, disciplinaId, selecionado) {
  const tops = st.topicos.filter((t) => !disciplinaId || t.disciplinaId === disciplinaId);
  return `<option value="">— sem tópico específico —</option>` + tops.map((t) => `<option value="${t.id}" ${t.id === selecionado ? "selected" : ""}>${esc(t.nome)}</option>`).join("");
}
function nomeTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
function vinculoNome(st, r) {
  const t = r.topicoId ? st.topicos.find((x) => x.id === r.topicoId) : null;
  if (t) return nomeTopico(st, t);
  const d = r.disciplinaId ? st.disciplinas.find((x) => x.id === r.disciplinaId) : null;
  return d ? d.nome : "Tópico não definido";
}
// <template> parseia em documento inerte: imagens não carregam e handlers on*
// não disparam durante a extração — um div solto executaria onerror de conteúdo hostil.
function textoPuro(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html || "";
  return tpl.content.textContent || "";
}
// Sanitização de HTML de resumo. Exportada porque precisa rodar também na LEITURA
// (aqui e na Central de Revisões): conteúdo vindo de sync/import antigo pode nunca
// ter passado pelo salvar, então sanitizar só no save não protege o render.
export function sanitize(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html || "";
  tpl.content.querySelectorAll("script,style,iframe,object,embed").forEach((n) => n.remove());
  tpl.content.querySelectorAll("*").forEach((n) => {
    [...n.attributes].forEach((a) => {
      if (/^on/i.test(a.name) || (a.name === "href" && /javascript:/i.test(a.value))) n.removeAttribute(a.name);
    });
  });
  const div = document.createElement("div");
  div.appendChild(tpl.content.cloneNode(true));
  return div.innerHTML;
}
