// Lei Seca e Jurisprudência. Cada tela tem dois modos:
//  • META    — referência a CUMPRIR/LER (vira missão; ao concluir, sai da lista).
//  • MEMÓRIA — trecho GRAVADO para relembrar (banco de memória; não é tarefa).
// Vínculo opcional a disciplina/tópico (sem vínculo → Geral). Jurisprudência
// classifica tribunal (TJSP/STJ/STF) e categoria (súmula/tema/precedente).
// Permite importar (texto/PDF) e gerar flashcards/questões.
import { bindActions, toast, header, vazio, confirmar, imprimir, botaoImprimir, opcoesImpressao, avisoIA, ligarDropZone, escolher, focarItem, pedirNumero, abrirJanela, abrirJanelaFluxo, plural } from "../ui.js";
import { esc, fmtData, todayISO, daysBetween } from "../util.js";
import { icone } from "../icones.js";
import { lerArquivoTexto, ligarImportArquivo } from "../pdf.js";
import { montarMarcacao } from "../marcacao.js";
import { filtroTopicosBotaoHTML, filtroTopicosPainelHTML, ligarFiltroTopicos, itemNoFiltro } from "./questoes-filtro.js";

const TRIBUNAIS = ["TJSP", "TRT", "STJ", "STF"];
const CATEGORIAS_JURIS = ["Súmula", "Tema repetitivo", "Precedente obrigatório"];

let modoAtivo = { lei: "meta", juris: "meta" };
let filtroTop = { lei: { sel: [], aberto: false }, juris: { sel: [], aberto: false } }; // filtro multitópico
let ordem = { lei: "padrao", juris: "padrao" }; // "padrao" | "pq" (PQ no topo) — opt-in
let filtroTribunal = "todos"; // só jurisprudência
let filtroCategoria = "todas"; // só jurisprudência
let editandoTribunal = null; // tribunal personalizado em edição (rename) na barra de filtros
let editandoId = null;
let mostrarConcluidas = { lei: false, juris: false }; // metas concluídas recolhidas por padrão
let marcarAberto = new Set(); // ids de itens com a marcação tricromática aberta

export function renderLeiSeca(root, app) {
  return renderIndicacoes(root, app, "lei");
}
export function renderJurisprudencia(root, app) {
  return renderIndicacoes(root, app, "juris");
}

function rotulos(tipo) {
  return tipo === "juris"
    ? { titulo: "Jurisprudência", item: "súmula/precedente", itemVazio: "uma súmula ou precedente", ph: "Ex.: Súmula 473 STF · Tema 1234 STJ" }
    : { titulo: "Lei Seca", item: "artigo", itemVazio: "um artigo", ph: "Ex.: art. 37, caput, CF · art. 312, CP" };
}

function renderIndicacoes(root, app, tipo) {
  const { store } = app;
  const st = store.get();
  const r = rotulos(tipo);
  // Foco numa indicação específica (Dossiê): vai ao subtab certo (meta/memória),
  // limpa filtros e rola até ela.
  let focoInd = null;
  if (app.params && app.params.focoIndicacaoId) {
    const alvo = st.indicacoes.find((i) => i.id === app.params.focoIndicacaoId && i.tipo === tipo);
    app.params.focoIndicacaoId = null;
    if (alvo) {
      focoInd = alvo.id;
      modoAtivo[tipo] = alvo.modo === "memoria" ? "memoria" : "meta";
      filtroTop[tipo].sel = [];
      if (tipo === "juris") {
        filtroTribunal = "todos";
        filtroCategoria = "todas";
      }
    }
  }
  // Abrir a marcação direto (vindo do dossiê de marcações).
  if (app.params && app.params.marcarId) {
    marcarAberto.add(app.params.marcarId);
    app.params.marcarId = null;
  }
  const modo = modoAtivo[tipo];

  const todasDoTipo = st.indicacoes.filter((i) => i.tipo === tipo);
  const doModo = todasDoTipo.filter((i) => (i.modo || "meta") === modo);
  let lista = [...doModo].sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
  lista = lista.filter((i) => itemNoFiltro(st, i, filtroTop[tipo].sel));
  if (tipo === "juris" && filtroTribunal !== "todos") lista = lista.filter((i) => i.tribunal === filtroTribunal);
  if (tipo === "juris" && filtroCategoria !== "todas") lista = lista.filter((i) => i.categoria === filtroCategoria);
  // Na memória, itens a revisar (vencidos) primeiro.
  if (modo === "memoria") {
    const hoje = todayISO();
    const venc = (i) => (i.revisao && i.revisao.proxima <= hoje ? 0 : 1);
    lista.sort((a, b) => venc(a) - venc(b) || (a.criadoEm < b.criadoEm ? 1 : -1));
  }
  // Ordenador opt-in: PQ no topo (sort estável → mantém a ordem acima dentro de cada grupo).
  if (ordem[tipo] === "pq") lista.sort((a, b) => (b.pq ? 1 : 0) - (a.pq ? 1 : 0));

  const metaN = todasDoTipo.filter((i) => (i.modo || "meta") === "meta").length;
  const memN = todasDoTipo.filter((i) => i.modo === "memoria").length;
  const revN = store.memoriasParaRevisar(tipo);

  root.innerHTML = `
    ${header(r.titulo, `${plural(metaN, "meta", "metas")} · ${memN} na memória`, botaoImprimir())}

    <div class="subtabs">
      <button class="subtab ${modo === "meta" ? "on" : ""}" data-action="modo" data-modo="meta" data-tip="Referências a cumprir/ler. Cada meta vira uma tarefa no Planejamento.">${icone("pin")} Metas</button>
      <button class="subtab ${modo === "memoria" ? "on" : ""}" data-action="modo" data-modo="memoria" data-tip="Trechos gravados para relembrar, com revisão espaçada até consolidar.">${icone("brain")} Memorizar${revN ? ` <span class="sub-badge">${revN}</span>` : ""}</button>
    </div>

    <div class="barra-acoes">
      <button class="btn btn-add btn-sm" data-action="toggle-add" data-tip-pos="cima-esq" data-tip="Digite uma referência, cole várias (uma por linha) ou importe um arquivo.">${modo === "meta" ? "Adicionar meta" : "Gravar na memória"}</button>
      <button class="btn btn-ghost btn-sm" data-action="toggle-pq-import" data-tip-pos="cima-esq" data-tip="Destaque os pontos que mais caem (Provável Questão): a IA sugere ou você importa uma estatística de incidência.">${icone("star")} Marcar prováveis questões (PQ)</button>
      <span class="spacer"></span>
      ${filtroTopicosBotaoHTML(st, filtroTop[tipo].sel, filtroTop[tipo].aberto)}
      ${
        tipo === "juris"
          ? `<label class="inline">Tribunal:
              <select id="f-trib">
                <option value="todos" ${filtroTribunal === "todos" ? "selected" : ""}>Todos</option>
                ${tribunaisDe(st).map((t) => `<option value="${esc(t)}" ${filtroTribunal === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
              </select></label>${tribAdminHTML()}
             <label class="inline">Tipo:
              <select id="f-cat">
                <option value="todas" ${filtroCategoria === "todas" ? "selected" : ""}>Todos</option>
                ${CATEGORIAS_JURIS.map((c) => `<option value="${esc(c)}" ${filtroCategoria === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
              </select></label>`
          : ""
      }
      <label class="inline">Ordenar:
        <select id="f-ordem">
          <option value="padrao" ${ordem[tipo] === "padrao" ? "selected" : ""}>Como cadastrei</option>
          <option value="pq" ${ordem[tipo] === "pq" ? "selected" : ""}>PQ no topo</option>
        </select></label>
    </div>
    ${filtroTopicosPainelHTML(st, filtroTop[tipo].sel, filtroTop[tipo].aberto)}

    <div class="lista-leiseca">
      ${listaCorpoHTML(st, tipo, modo, lista, r)}
    </div>`;

  // filtros
  ligarFiltroTopicos(root, app, filtroTop[tipo]);
  root.querySelector("#f-trib")?.addEventListener("change", (e) => {
    filtroTribunal = e.target.value;
    app.refresh();
  });
  root.querySelector("#f-cat")?.addEventListener("change", (e) => {
    filtroCategoria = e.target.value;
    app.refresh();
  });
  root.querySelector("#f-ordem")?.addEventListener("change", (e) => {
    ordem[tipo] = e.target.value;
    app.refresh();
  });
  focarItem(root, focoInd);

  // Monta a marcação tricromática nos itens com o painel aberto.
  root.querySelectorAll("[data-mk-host]").forEach((host) => {
    const id = host.getAttribute("data-mk-host");
    const item = st.indicacoes.find((x) => x.id === id);
    if (item && item.texto) {
      montarMarcacao(host, { store, alvoTipo: "indicacao", alvoId: id, texto: item.texto, topicoId: item.topicoId, tituloFonte: item.referencia });
    }
  });

  // marcar lido
  root.querySelectorAll('[data-action="toggle-lido"]').forEach((el) =>
    el.addEventListener("change", () => store.toggleIndicacaoLida(el.getAttribute("data-id")))
  );

  bindActions(root, {
    imprimir: async () => {
      // Mesmos filtros da tela (tópico/tribunal/categoria), para o modo atual OU metas+memória.
      const listaDoModo = (md) => {
        let l = todasDoTipo.filter((i) => (i.modo || "meta") === md && itemNoFiltro(st, i, filtroTop[tipo].sel));
        if (tipo === "juris" && filtroTribunal !== "todos") l = l.filter((i) => i.tribunal === filtroTribunal);
        if (tipo === "juris" && filtroCategoria !== "todas") l = l.filter((i) => i.categoria === filtroCategoria);
        return l.sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
      };
      const op = await opcoesImpressao(`Imprimir ${r.titulo.toLowerCase()}`, [
        { key: "escopo", label: "O que imprimir", opcoes: [{ v: "atual", rot: `Modo atual (${modo === "meta" ? "metas" : "memória"})` }, { v: "ambos", rot: "Metas + Memória" }], def: "atual" },
        { key: "trecho", label: "Trecho/texto", opcoes: [{ v: "com", rot: "Com o trecho" }, { v: "sem", rot: "Só a referência" }], def: "com" },
      ]);
      if (!op) return;
      const ct = op.trecho === "com";
      let html;
      if (op.escopo === "ambos") {
        html = `<h2>Metas</h2>${printLista(st, listaDoModo("meta"), r, ct)}<h2 style="margin-top:18px">Memória</h2>${printLista(st, listaDoModo("memoria"), r, ct)}`;
      } else {
        html = printLista(st, lista, r, ct);
      }
      imprimir(`${r.titulo} — Mentor Concurso`, html);
    },
    modo: (el) => {
      modoAtivo[tipo] = el.getAttribute("data-modo");
      app.refresh();
    },
    "toggle-add": () => abrirAdicionarIndicacao(app, tipo, modoAtivo[tipo]),
    // Modo foco: leitura limpa do trecho em coluna estreita (~70ch), sem distração.
    "ler-foco": (el) => {
      const item = store.get().indicacoes.find((x) => x.id === el.getAttribute("data-id"));
      if (!item || !item.texto) return;
      abrirJanela({
        titulo: item.referencia || "Leitura em foco",
        corpoHTML: `<div class="leitura-foco">
          ${item.observacao ? `<p class="lf-obs">${esc(item.observacao)}</p>` : ""}
          <div class="lf-texto">${esc(item.texto)}</div>
        </div>`,
      });
    },
    "toggle-marcar": (el) => {
      const id = el.getAttribute("data-id");
      if (marcarAberto.has(id)) marcarAberto.delete(id);
      else marcarAberto.add(id);
      app.refresh();
    },
    "toggle-pq": (el) => {
      const ind = store.get().indicacoes.find((x) => x.id === el.getAttribute("data-id"));
      store.setIndicacaoPQ(el.getAttribute("data-id"), !(ind && ind.pq));
      toast(ind && ind.pq ? "PQ removida." : "Marcado como Provável Questão (PQ).");
    },
    "toggle-pq-import": () => abrirMarcarPQ(app, tipo),
    "salvar-edicao": (el) => salvar(root, store, tipo, modo, el.getAttribute("data-id")),
    editar: (el) => {
      const e = store.get().indicacoes.find((i) => i.id === el.getAttribute("data-id"));
      if (!e) return;
      abrirJanela({
        titulo: tipo === "juris" ? "Editar jurisprudência" : "Editar lei seca",
        corpoHTML: formHTML(st, tipo, modo, e),
        aoMontar: (jan, fechar) => {
          bindCascata(jan, st, "#ind-disc", "#ind-top");
          jan.querySelector('[data-action="cancelar"]').addEventListener("click", fechar);
          jan.querySelector('[data-action="salvar-edicao"]').addEventListener("click", () => {
            if (salvar(jan, store, tipo, modo, e.id)) { fechar(); app.refresh(); }
          });
        },
      });
    },
    remover: async (el) => {
      if (await confirmar("Remover este item?")) {
        store.removerIndicacao(el.getAttribute("data-id"));
        toast("Removido.");
      }
    },
    "ger-flashcard": (el) => {
      const fc = store.gerarFlashcardDeIndicacao(el.getAttribute("data-id"));
      toast(fc ? "Flashcard criado (na aba Flashcards)." : "Não foi possível.", fc ? "ok" : "erro");
    },
    "ger-questao": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar questões");
      const r = await pedirNumero("Quantas questões a IA deve gerar deste item?", { padrao: 3, min: 1, max: 30, nivel: true });
      if (!r) return;
      const { n, dificuldade } = r;
      el.classList.add("lnk-disabled");
      toast("Gerando questões com IA…");
      try {
        const qs = await store.gerarQuestoesDeIndicacao(el.getAttribute("data-id"), n, dificuldade);
        toast(qs.length ? `${plural(qs.length, "questão gerada", "questões geradas")} na aba Questões.` : "A IA não retornou questões. Adicione o trecho/texto.", qs.length ? "ok" : "erro");
      } catch (e) {
        console.error(e);
        toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro");
      }
    },
    "ir-dossie": (el) => app.navigate("edital", { dossieTopicoId: el.getAttribute("data-top") }),
    "rev-agendar": async (el) => {
      const dias = await escolher("Quando quer revisar este conteúdo pela primeira vez? Depois o intervalo cresce sozinho conforme você lembra.", [
        { value: "7", label: "Em 7 dias", cls: "btn-primary" },
        { value: "15", label: "Em 15 dias" },
        { value: "30", label: "Em 30 dias" },
      ]);
      if (!dias) return;
      store.agendarRevisaoMemoria(el.getAttribute("data-id"), parseInt(dias, 10));
      toast(`Combinado! Te lembro de revisar em ${dias} dias.`);
    },
    "rev-fazer": (el) => {
      const res = el.getAttribute("data-res");
      const dias = store.revisarMemoria(el.getAttribute("data-id"), res);
      if (dias == null) return;
      toast(res === "esqueci" ? "Sem problema, a gente revisa amanhã." : `Boa! Próxima revisão em ${dias} dia${dias === 1 ? "" : "s"}.`);
    },
    "rev-cancelar": (el) => {
      store.cancelarRevisaoMemoria(el.getAttribute("data-id"));
      toast("Tirei este item do ciclo de revisão.");
    },
    "para-memoria": (el) => {
      if (store.converterIndicacaoParaMemoria(el.getAttribute("data-id"))) {
        modoAtivo[tipo] = "memoria";
        toast("Movido para a Memória. Programe a revisão quando quiser.");
        app.refresh();
      }
    },
    "toggle-concluidas": () => {
      mostrarConcluidas[tipo] = !mostrarConcluidas[tipo];
      app.refresh();
    },
    "trib-editar": () => {
      editandoTribunal = filtroTribunal;
      app.refresh();
    },
    "trib-cancelar-edit": () => {
      editandoTribunal = null;
      app.refresh();
    },
    "trib-salvar": () => {
      const novo = (root.querySelector("#trib-novo")?.value || "").trim();
      if (!novo) return toast("Informe o nome do tribunal.", "erro");
      const c = store.renomearTribunal(filtroTribunal, novo);
      filtroTribunal = novo;
      editandoTribunal = null;
      toast(c ? `Tribunal renomeado em ${plural(c, "item", "itens")}.` : "Nada para renomear.", c ? "ok" : "erro");
      app.refresh();
    },
    "trib-remover": async () => {
      if (await confirmar(`Remover o tribunal "${filtroTribunal}"? Os itens com ele ficam sem tribunal (não são apagados).`)) {
        const c = store.removerTribunal(filtroTribunal);
        filtroTribunal = "todos";
        editandoTribunal = null;
        toast(c ? `Tribunal removido de ${plural(c, "item", "itens")}.` : "Nada alterado.", c ? "ok" : "erro");
        app.refresh();
      }
    },
    "limpar-lidas": async () => {
      if (await confirmar("Remover da lista as metas já concluídas? (não afeta a Memória nem os flashcards/questões já gerados)")) {
        const n = store.limparIndicacoesLidas(tipo);
        toast(n ? `${plural(n, "meta concluída removida", "metas concluídas removidas")}.` : "Nenhuma meta concluída.", n ? "ok" : "erro");
      }
    },
  });
}

function salvar(root, store, tipo, modo, editId) {
  const referencia = root.querySelector("#ind-ref").value.trim();
  const texto = root.querySelector("#ind-texto").value.trim();
  const observacao = (root.querySelector("#ind-obs")?.value || "").trim();
  const disciplinaId = root.querySelector("#ind-disc").value || null;
  const topicoId = root.querySelector("#ind-top").value || null;
  const tribunal = (root.querySelector("#ind-trib")?.value || "").trim() || null;
  const categoria = root.querySelector("#ind-cat")?.value || null;
  if (!referencia) { toast("Informe a referência.", "erro"); return false; }
  store.editarIndicacao(editId, { referencia, texto, observacao, disciplinaId, topicoId, tribunal, categoria });
  editandoId = null;
  toast("Item atualizado.");
  return true;
}

// Formulário de EDIÇÃO de um item (campos estruturados, um item por vez).
function formHTML(st, tipo, modo, e) {
  const sel = e || {};
  let discId = sel.disciplinaId || "";
  if (!discId && sel.topicoId) {
    const t = st.topicos.find((x) => x.id === sel.topicoId);
    discId = t ? t.disciplinaId : "";
  }
  const opcoesDisc = `<option value="">— Geral (sem vínculo) —</option>` + st.disciplinas.map((d) => `<option value="${d.id}" ${d.id === discId ? "selected" : ""}>${esc(d.nome)}</option>`).join("");
  const r = rotulos(tipo);
  return `
    <div class="card form-leiseca">
      <h3>${icone("square-pen")} Editar ${modo === "meta" ? "meta" : "item da memória"}</h3>
      <div class="form-row">
        <label style="flex:2">Referência <input id="ind-ref" type="text" value="${esc(sel.referencia || "")}" placeholder="${r.ph}" /></label>
        <label>Disciplina <select id="ind-disc">${opcoesDisc}</select></label>
        <label>Tópico (opcional) <select id="ind-top">${topicoOptions(st, discId, sel.topicoId)}</select></label>
      </div>
      ${
        tipo === "juris"
          ? `<div class="form-row">
              <label>Tribunal <input id="ind-trib" list="trib-list" autocomplete="off" placeholder="Ex.: TJSP, STJ, TRF3… (escreva)" value="${esc(sel.tribunal || "")}" />${datalistTribunais(st)}</label>
              <label>Categoria <select id="ind-cat"><option value="">—</option>${CATEGORIAS_JURIS.map((c) => `<option ${sel.categoria === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
            </div>`
          : ""
      }
      <label>Trecho / conteúdo ${modo === "memoria" ? "(o que gravar para relembrar)" : "(opcional)"}
        <textarea id="ind-texto" rows="3" placeholder="Cole o trecho importante...">${esc(sel.texto || "")}</textarea>
      </label>
      <label>Observação (opcional)
        <input id="ind-obs" type="text" value="${esc(sel.observacao || "")}" placeholder="lembrete ou ressalva (ex.: cai muito; decorar prazos)" />
      </label>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="cancelar">Cancelar</button>
        <button class="btn btn-primary" data-action="salvar-edicao" data-id="${e.id}">Salvar</button>
      </div>
    </div>`;
}

// Caixa ÚNICA de adição: digitar 1, colar várias (uma por linha) ou importar arquivo.
function addPanelHTML(st, tipo, modo, r, texto = "", processando = false) {
  const opcoesDisc = `<option value="">— Geral (sem vínculo) —</option>` + st.disciplinas.map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("");
  const exemplo = tipo === "juris"
    ? `Súmula 473, STF | A administração pode anular seus próprios atos... | cai muito em concurso
Tema 1234, STJ | Tese firmada em recurso repetitivo...`
    : `art. 37, caput, CF | A administração obedecerá aos princípios de legalidade, impessoalidade... | decorar os 5 princípios
art. 312, CP | Apropriar-se o funcionário público de dinheiro...`;
  const instrHTML = tipo === "juris"
    ? `<b>Uma por linha</b> (ex.: <i>Súmula 473 STF</i>). Para já incluir a tese e uma observação, separe com <b>|</b>: <i>referência | tese | observação</i> (opcionais). ` +
      `Ou simplesmente <b>cole sua lista/cronograma do jeito que estiver</b> (inclusive em tabela): o app separa tudo sozinho e ainda deduz o <b>tribunal</b> e a <b>categoria</b>. Você confere e edita antes de salvar.`
    : `<b>Uma por linha</b> (ex.: <i>art. 37, CF</i>). Para já incluir o trecho e uma observação, separe com <b>|</b>: <i>referência | trecho | observação</i> (opcionais). ` +
      `Ou simplesmente <b>cole sua lista/cronograma do jeito que estiver</b> (inclusive em tabela): o app separa tudo sozinho. Você confere e edita antes de salvar.`;
  return `
    <div class="card form-leiseca">
      <h3>${modo === "meta" ? "Adicionar meta de leitura" : "Gravar na memória"}</h3>
      <div class="form-row">
        <label>Disciplina <select id="add-disc">${opcoesDisc}</select></label>
        <label>Tópico (opcional) <select id="add-top"><option value="">— sem tópico —</option></select></label>
        ${
          tipo === "juris"
            ? `<label>Tribunal <input id="add-trib" list="trib-list" autocomplete="off" placeholder="Ex.: TJSP, STJ, TRF3… (escreva)" />${datalistTribunais(st)}</label>
               <label>Categoria <select id="add-cat"><option value="">—</option>${CATEGORIAS_JURIS.map((c) => `<option>${c}</option>`).join("")}</select></label>`
            : ""
        }
      </div>
      <label class="btn btn-ghost btn-file" style="margin-bottom:8px" data-tip-pos="cima-esq" data-tip="Importar de um PDF ou arquivo .txt. Você também pode arrastar o arquivo aqui.">${icone("paperclip")} Importar de arquivo
        <input id="add-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden />
      </label>
      <p class="muted small" style="margin:0 0 6px">${instrHTML}</p>
      <textarea id="add-texto" rows="4" placeholder="${esc("Ex.:\n" + exemplo)}">${esc(texto)}</textarea>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="cancelar-add">Cancelar</button>
        <button class="btn btn-primary" data-action="adicionar" ${processando ? "disabled" : ""}>${processando ? "Processando…" : "Revisar"}</button>
      </div>
      ${
        st.documentos.length
          ? `<div class="add-sep">Ou extrair de um material já cadastrado (IA):</div>
             <div class="form-row" style="align-items:flex-end; gap:10px; flex-wrap:wrap">
               <label class="inline">Material: <select id="add-doc">${st.documentos.map((d) => `<option value="${d.id}">${esc(d.titulo)}</option>`).join("")}</select></label>
               <button class="btn btn-ghost btn-sm" data-action="extrair-material" data-tip="A IA lê o material e extrai as ${tipo === "juris" ? "súmulas/temas/precedentes" : "referências de lei"} citadas (não inventa).">Extrair do material</button>
             </div>`
          : ""
      }
    </div>`;
}

// Preview EDITÁVEL das indicações (antes de gravar): referência, trecho e observação por item,
// + tribunal/categoria na jurisprudência. Editar, remover (✕), voltar para editar e então adicionar.
function indPreviewHTML(st, tipo, modo, r, itens) {
  const ehJuris = tipo === "juris";
  const catOpcoes = (sel) => `<option value="">— categoria —</option>` + CATEGORIAS_JURIS.map((c) => `<option ${sel === c ? "selected" : ""}>${c}</option>`).join("");
  return `<div class="card form-leiseca">
    <h3>${icone("download")} Revisar ${itens.length} ${itens.length === 1 ? "item" : "itens"} antes de ${modo === "meta" ? "adicionar" : "gravar"}</h3>
    <p class="muted small" style="margin:0 0 8px">Edite a referência, o trecho e a observação de cada item; remova (✕) o que não quiser. O vínculo (disciplina/tópico${ehJuris ? "/tribunal" : ""}) escolhido acima vale para todos.</p>
    <ul class="prev-editavel">
      ${itens
        .map((it, i) => {
          return `<li class="prev-card m-leiseca">
            <div class="prev-card-l1">
              <input class="prev-inp ind-ref-edit" data-i="${i}" value="${esc(it.referencia || "")}" placeholder="${r.ph}" />
              <button class="prev-remover" data-action="remover-ind" data-i="${i}" data-tip-pos="cima-dir" data-tip="Remover este item">${icone("x")}</button>
            </div>
            <input class="prev-inp ind-texto-edit" data-i="${i}" value="${esc(it.texto || "")}" placeholder="Trecho / conteúdo (opcional)" />
            <input class="prev-inp prev-obs ind-obs-edit" data-i="${i}" value="${esc(it.observacao || "")}" placeholder="observação (opcional) — lembrete, ressalva" />
            ${
              ehJuris
                ? `<div class="prev-card-campos">
                    <input class="ind-trib-edit" data-i="${i}" list="trib-list" autocomplete="off" placeholder="Tribunal" value="${esc(it.tribunal || "")}" style="width:120px" />
                    <select class="ind-cat-edit" data-i="${i}">${catOpcoes(it.categoria || "")}</select>
                  </div>${datalistTribunais(st)}`
                : ""
            }
          </li>`;
        })
        .join("")}
    </ul>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="voltar-ind" data-tip-pos="cima-esq" data-tip="Volta ao texto colado para corrigir e revisar de novo.">← Voltar para editar</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-action="descartar-ind">Descartar</button>
      <button class="btn btn-primary" data-action="aceitar-ind" ${itens.length ? "" : "disabled"}>${modo === "meta" ? "Adicionar" : "Gravar"} (${itens.length})</button>
    </div>
  </div>`;
}

// Janela modal "Adicionar meta / Gravar na memória" (lei seca/jurisprudência) — fluxo
// stateful (editar → preview → aplicar) com render-loop próprio (abrirJanelaFluxo).
function abrirAdicionarIndicacao(app, tipo, modo) {
  const { store } = app;
  const r = rotulos(tipo);
  const estado = { preview: null, texto: "", processando: false, opts: { disciplinaId: null, topicoId: null, tribunal: null, categoria: null } };
  // Lê o vínculo escolhido (disciplina/tópico/tribunal/categoria) dos campos do painel.
  const lerOpts = (corpo) => ({
    tipo,
    modo,
    disciplinaId: corpo.querySelector("#add-disc")?.value || null,
    topicoId: corpo.querySelector("#add-top")?.value || null,
    tribunal: (corpo.querySelector("#add-trib")?.value || "").trim() || null,
    categoria: corpo.querySelector("#add-cat")?.value || null,
  });
  abrirJanelaFluxo({
    titulo: modo === "meta" ? (tipo === "juris" ? "Adicionar meta (jurisprudência)" : "Adicionar meta (lei seca)") : "Gravar na memória",
    render: (corpo, { rerender }) => {
      const st = store.get();
      if (estado.preview) {
        corpo.innerHTML = indPreviewHTML(st, tipo, modo, r, estado.preview);
        const live = (sel, set) => corpo.querySelectorAll(sel).forEach((el) =>
          el.addEventListener("input", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) set(estado.preview[i], el.value); }));
        live(".ind-ref-edit", (it, v) => (it.referencia = v));
        live(".ind-texto-edit", (it, v) => (it.texto = v));
        live(".ind-obs-edit", (it, v) => (it.observacao = v));
        live(".ind-trib-edit", (it, v) => (it.tribunal = v.trim() || null));
        corpo.querySelectorAll(".ind-cat-edit").forEach((el) =>
          el.addEventListener("change", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) estado.preview[i].categoria = el.value || null; }));
        return;
      }
      corpo.innerHTML = addPanelHTML(st, tipo, modo, r, estado.texto, estado.processando);
      // Restaura o vínculo escolhido (e popula a cascata de tópicos) ao voltar do preview.
      const dEl = corpo.querySelector("#add-disc");
      const tEl = corpo.querySelector("#add-top");
      if (dEl && estado.opts.disciplinaId) { dEl.value = estado.opts.disciplinaId; if (tEl) tEl.innerHTML = topicoOptions(st, estado.opts.disciplinaId, estado.opts.topicoId); }
      if (tEl && estado.opts.topicoId) tEl.value = estado.opts.topicoId;
      const tribEl = corpo.querySelector("#add-trib");
      if (tribEl && estado.opts.tribunal) tribEl.value = estado.opts.tribunal;
      const catEl = corpo.querySelector("#add-cat");
      if (catEl && estado.opts.categoria) catEl.value = estado.opts.categoria;
      bindCascata(corpo, st, "#add-disc", "#add-top");
      const addFile = corpo.querySelector("#add-file");
      if (addFile) {
        ligarDropZone(addFile);
        ligarImportArquivo(addFile, {
          getCfg: () => store.get().config,
          contexto:
            tipo === "juris"
              ? "jurisprudência: súmulas, enunciados e precedentes judiciais, com o tribunal e a referência/número de cada um, preservando essa referência"
              : "legislação (lei seca): os artigos da norma com seus parágrafos, incisos e alíneas, preservando integralmente a numeração e o texto dos dispositivos",
          onTexto: (texto) => { const a = corpo.querySelector("#add-texto"); if (a) a.value = texto; if (texto.trim()) toast("Texto carregado. Revise e adicione."); },
        });
      }
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "cancelar-add": () => fechar(),
      adicionar: async () => {
        const texto = corpo.querySelector("#add-texto").value;
        if (!texto.trim()) return toast("Informe ao menos uma referência (ex.: art. 37, CF).", "erro");
        estado.opts = lerOpts(corpo);
        estado.texto = texto;
        estado.processando = true;
        rerender();
        let itens = [];
        try {
          itens = await store.prepararIndicacoesAuto(texto, tipo);
        } catch (e) {
          console.error(e);
          estado.processando = false;
          rerender();
          return toast(`A IA está indisponível no momento (tente de novo em instantes). Sem IA, separe cada item com "|".`, "erro");
        }
        estado.processando = false;
        if (!itens.length) { rerender(); return toast("Não consegui reconhecer referências. Confira o texto.", "erro"); }
        estado.preview = itens;
        rerender();
      },
      "remover-ind": (el) => {
        const i = parseInt(el.getAttribute("data-i"), 10);
        if (estado.preview) estado.preview.splice(i, 1);
        if (estado.preview && !estado.preview.length) estado.preview = null;
        rerender();
      },
      "voltar-ind": () => { estado.preview = null; rerender(); },
      "descartar-ind": () => fechar(),
      "aceitar-ind": () => {
        const itens = (estado.preview || []).filter((it) => (it.referencia || "").trim());
        if (!itens.length) return toast("Nenhum item para adicionar.", "erro");
        const n = store.aceitarIndicacoes(itens, estado.opts || { tipo, modo });
        toast(modo === "meta" ? `${plural(n, "meta adicionada", "metas adicionadas")}.` : `${plural(n, "item gravado", "itens gravados")} na memória.`);
        fechar();
        app.refresh();
      },
      "extrair-material": async (el) => {
        if (!store.iaDisponivel()) return avisoIA(app, "Extrair do material");
        const docId = corpo.querySelector("#add-doc").value;
        el.disabled = true;
        toast("Lendo o material e extraindo…");
        try {
          const itens = await store.prepararIndicacoesDeDoc(docId, tipo);
          if (!itens.length) { el.disabled = false; return toast("Não encontrei referências neste material.", "erro"); }
          estado.opts = lerOpts(corpo);
          estado.preview = itens;
          toast(`${plural(itens.length, "referência extraída", "referências extraídas")} (confira e ajuste).`);
          rerender();
        } catch (e) {
          console.error(e);
          toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro");
          el.disabled = false;
        }
      },
    }),
  });
}

// Janela modal "Marcar Prováveis Questões (PQ)" — IA sugere OU importa estatística →
// lista com checkboxes → aplicar. Render-loop próprio (abrirJanelaFluxo).
function abrirMarcarPQ(app, tipo) {
  const { store } = app;
  const estado = { analise: null, corte: 30, sugerindo: false };
  abrirJanelaFluxo({
    titulo: "Marcar Prováveis Questões (PQ)",
    render: (corpo, { rerender }) => {
      corpo.innerHTML = pqImportHTML(tipo, estado.corte, estado.sugerindo, estado.analise);
      corpo.querySelector("#pq-corte")?.addEventListener("change", (e) => {
        estado.corte = parseInt(e.target.value, 10) || 0;
        if (estado.analise) rerender();
      });
      // Importar estatística de ARQUIVO (.txt/.csv/.pdf) — antes só dava p/ colar.
      ligarImportArquivo(corpo.querySelector("#pq-file"), {
        getCfg: () => store.get().config,
        contexto: "estatística de incidência (PQ)",
        onTexto: (texto) => {
          if (!texto || !texto.trim()) return toast("Não consegui ler texto desse arquivo.", "erro");
          // Joga o texto extraído no quadro p/ você conferir/editar antes de "Analisar".
          const ta = corpo.querySelector("#pq-texto");
          if (ta) { ta.value = texto.trim(); ta.focus(); }
          toast("Texto importado — confira e clique em Analisar.");
        },
      });
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "pq-ia-sugere": async () => {
        if (!store.iaDisponivel()) return avisoIA(app, "Sugerir PQ com IA");
        estado.sugerindo = true; rerender();
        try {
          estado.analise = await store.sugerirPQIA(tipo);
          toast(estado.analise.length ? `${plural(estado.analise.length, "referência sugerida", "referências sugeridas")} pela IA.` : "A IA não destacou nenhuma como alta incidência.");
        } catch (e) { console.error(e); toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro"); }
        estado.sugerindo = false; rerender();
      },
      "pq-analisar": () => {
        const texto = corpo.querySelector("#pq-texto")?.value || "";
        estado.corte = parseInt(corpo.querySelector("#pq-corte")?.value, 10) || 0;
        if (!texto.trim()) return toast("Cole a estatística de incidência.", "erro");
        estado.analise = store.analisarEstatisticaPQ(texto);
        rerender();
      },
      "pq-aplicar": () => {
        const itens = [];
        corpo.querySelectorAll(".pq-cb:checked").forEach((cb) => {
          const r = estado.analise[parseInt(cb.getAttribute("data-i"), 10)];
          if (r) r.ids.forEach((id) => itens.push({ id, incidencia: r.incidencia }));
        });
        const n = store.aplicarPQ(itens);
        toast(n ? `${plural(n, "item marcado", "itens marcados")} como PQ.` : "Nenhum item selecionado.", n ? "ok" : "erro");
        if (n) { fechar(); app.refresh(); }
      },
    }),
  });
}

// Painel para marcar Prováveis Questões (PQ): dois caminhos (IA sugere OU importar
// estatística), ambos casados com as referências CADASTRADAS NESTA ABA. O usuário confirma.
function pqImportHTML(tipo, corte = 30, sugerindo = false, analise = null) {
  const ondeBase = tipo === "juris" ? "Jurisprudência" : "Lei Seca";
  return `<div class="card pq-import">
    <h3><span class="orb orb-sm" aria-hidden="true" style="display:inline-block;vertical-align:middle"></span> ${icone("star")} Marcar Prováveis Questões (PQ) <span class="muted small pq-info" data-tip-pos="bottom" data-tip="Pontos de alta incidência (o que mais cai) num tópico. A IA estima pelas suas referências de ${ondeBase}; ou importe/cole uma estatística. Você confirma antes de aplicar.">${icone("info")}</span></h3>

    <div class="pq-acoes">
      <button class="btn btn-ia btn-sm" data-action="pq-ia-sugere" ${sugerindo ? "disabled" : ""}>${icone("sparkles")} ${sugerindo ? "Analisando…" : "Sugerir com IA"}</button>
      <span class="muted small">ou importe uma estatística:</span>
      <label class="btn btn-ghost btn-sm btn-file" data-tip="Arquivo (.txt/.csv/.pdf) com 'referência ; número' por linha."><input type="file" id="pq-file" accept=".txt,.csv,.md,.pdf" hidden />${icone("paperclip")} Importar arquivo</label>
    </div>

    <div class="pq-colar">
      <p class="muted small pq-colar-dica">Uma por linha: <b>referência ; número</b> — importe um arquivo (cai aqui embaixo) ou digite/cole. Ex.: <code>art. 37, CF ; 45</code></p>
      <textarea id="pq-texto" rows="4" placeholder="art. 37, CF ; 45&#10;Súmula 473 STF ; 30"></textarea>
      <div style="margin-top:6px"><button class="btn btn-ghost btn-sm" data-action="pq-analisar">Analisar</button></div>
    </div>

    ${analise ? `<div class="pq-corte-linha"><label class="inline small">Já marcar quando a incidência ≥ <input id="pq-corte" type="number" min="0" max="100" value="${corte}" style="width:64px; margin:0 6px" /></label> <span class="muted small">(opcional · abaixo vêm desmarcadas)</span></div>` : ""}
    ${analise ? pqResultadoHTML(corte, analise) : ""}
  </div>`;
}

// Lista de sugestões de PQ (vinda da IA ou da estatística), para o usuário confirmar.
function pqResultadoHTML(corte, analise) {
  if (!analise.length) {
    return `<p class="muted small" style="margin-top:10px">Nenhuma referência foi reconhecida ou casada com seus itens. Na importação, use o formato "referência ; número"; na IA, cadastre algumas referências antes.</p>`;
  }
  const casadas = analise.filter((r) => r.ids.length).length;
  return `<div class="pq-resultado">
      <div class="muted small" style="margin:10px 0 6px">${plural(casadas, "referência casada", "referências casadas")} com seus itens. Confira e ajuste o que será marcado como PQ:</div>
      <ul class="pq-lista">
        ${analise
          .map((r, i) => {
            const casou = r.ids.length > 0;
            const acima = r.incidencia >= corte;
            return `<li class="pq-res-item ${casou ? "" : "pq-nao-casou"}">
              <input type="checkbox" class="pq-cb" data-i="${i}" ${casou && acima ? "checked" : ""} ${casou ? "" : "disabled"} />
              <span class="pq-res-ref"><b>${esc(r.ref)}</b> · incidência ${r.incidencia}</span>
              <span class="pq-res-match muted small">${casou ? "→ " + esc(r.nomes.join(", ")) : "(nenhum item correspondente)"}</span>
            </li>`;
          })
          .join("")}
      </ul>
      <button class="btn btn-primary btn-sm" data-action="pq-aplicar">Aplicar PQ aos selecionados</button>
    </div>`;
}

// Corpo da lista. Na MEMÓRIA, vencidos já vêm primeiro (ordenado antes). Nas METAS,
// pendentes em cima e concluídas separadas/recolhidas abaixo (padrão das tarefas).
function listaCorpoHTML(st, tipo, modo, lista, r) {
  const ctaAdd = (rotulo) => `<button class="btn btn-add" data-action="toggle-add">${rotulo}</button>`;
  if (modo !== "meta") {
    return lista.length
      ? lista.map((i) => itemHTML(st, tipo, i)).join("")
      : vazio(
          `Sua memória está vazia\nGrave ${r.itemVazio} importante para relembrar com revisão espaçada.`,
          ctaAdd("Gravar na memória"),
          icone("brain")
        );
  }
  const pend = lista.filter((i) => !i.lido);
  const done = lista.filter((i) => i.lido);
  let html = pend.length
    ? pend.map((i) => itemHTML(st, tipo, i)).join("")
    : vazio(
        done.length
          ? "Tudo em dia\nTodas as metas foram concluídas."
          : `Comece pelo essencial\nCadastre ${r.itemVazio} para ler ou cumprir.`,
        done.length ? "" : ctaAdd("Adicionar meta"),
        done.length ? icone("party-popper") : icone("pin")
      );
  if (done.length) {
    html += `<div class="concluidas-head">
        <button class="lnk" data-action="toggle-concluidas">${mostrarConcluidas[tipo] ? icone("chevron-down") : icone("chevron-right")} ${icone("check")} Concluídas (<span class="num">${done.length}</span>)</button>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" data-action="limpar-lidas" data-tip-pos="cima-dir" data-tip="Remove da lista as metas já concluídas.">${icone("trash-2")} Limpar concluídas</button>
      </div>
      ${mostrarConcluidas[tipo] ? done.map((i) => itemHTML(st, tipo, i)).join("") : ""}`;
  }
  return html;
}

function itemHTML(st, tipo, i) {
  const topico = i.topicoId ? st.topicos.find((t) => t.id === i.topicoId) : null;
  const disc = topico ? st.disciplinas.find((d) => d.id === topico.disciplinaId) : i.disciplinaId ? st.disciplinas.find((d) => d.id === i.disciplinaId) : null;
  const vinc = topico
    ? `<button class="tag-topico lnk" data-action="ir-dossie" data-top="${topico.id}">${esc(nomeTopico(st, topico))}</button>`
    : `<span class="tag-topico">${disc ? esc(disc.nome) : "Geral"}</span>`;
  // Badges essenciais inline (PQ e tribunal); a categoria fica discreta no rodapé do item.
  const badges =
    (i.pq ? `<span class="mini-tag pq-tag" data-tip="Provável Questão: ponto de alta incidência${i.pqIncidencia ? ` (incidência ${i.pqIncidencia})` : ""}.">${icone("star")} PQ${i.pqIncidencia ? ` ${i.pqIncidencia}` : ""}</span>` : "") +
    (i.tribunal ? `<span class="mini-tag trib-tag">${esc(i.tribunal)}</span>` : "");
  const meta = i.modo !== "memoria";
  const hoje = todayISO();
  const rev = i.revisao || null;
  const due = !meta && rev && rev.proxima <= hoje;
  // Ações: 1 principal visível (marcar, ou PQ quando não há trecho) + as demais
  // recolhidas num <details> (sem JS novo). Todos os data-action/ids preservados.
  const acaoMarcar = i.texto
    ? `<button class="lnk" data-action="toggle-marcar" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Grifar palavras-chave, prazos e termos restritivos (vira fonte da revisão de tópico).">${marcarAberto.has(i.id) ? `${icone("check")} marcando` : `${icone("square-pen")} marcar`}</button>`
    : "";
  const acaoPQ = `<button class="lnk ${i.pq ? "pq-on" : ""}" data-action="toggle-pq" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Marcar como Provável Questão (ponto que mais cai).">${i.pq ? "PQ" : `${icone("star")} PQ`}</button>`;
  const principal = acaoMarcar || acaoPQ; // 1 ação principal visível
  const secundarias = [
    i.texto ? `<button class="lnk" data-action="ler-foco" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Ler o trecho em tela limpa, sem distração (coluna estreita ~70 caracteres).">${icone("book-open")} Ler em foco</button>` : "",
    acaoMarcar ? acaoPQ : "", // se "marcar" é a principal, PQ vai para o menu
    `<button class="lnk" data-action="ger-flashcard" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Gerar um flashcard deste item (offline).">${icone("layers")} Flashcards</button>`,
    `<button class="lnk" data-action="ger-questao" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Gerar questões com IA a partir deste item.">${icone("notebook-pen")} Questões</button>`,
    !meta && !rev ? `<button class="lnk" data-action="rev-agendar" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Entrar no ciclo de revisão espaçada para fixar este conteúdo.">${icone("alarm-clock")} Programar revisão</button>` : "",
    meta ? `<button class="lnk" data-action="para-memoria" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Mover esta meta para a Memória (revisão espaçada para fixar).">${icone("brain")} Para memória</button>` : "",
    `<button class="lnk" data-action="editar" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Editar referência, vínculo e trecho.">${icone("square-pen")} Editar</button>`,
    `<button class="lnk lnk-danger" data-action="remover" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Remover este item.">${icone("x")} Remover</button>`,
  ].filter(Boolean).join("");
  return `
    <div class="card ls-item ${i.lido && meta ? "lido" : ""} ${meta ? "" : "ls-memoria"} ${due ? "ls-revisar" : ""}" data-foco-id="${i.id}">
      <div class="ls-top">
        ${meta ? `<input type="checkbox" data-action="toggle-lido" data-id="${i.id}" ${i.lido ? "checked" : ""} title="Concluir" />` : `<span class="ls-icon">${icone("brain")}</span>`}
        <span class="ls-ref">${i.lido && meta ? `<s>${esc(i.referencia)}</s>` : esc(i.referencia)}</span>
        ${badges}
        <span class="spacer"></span>
        ${vinc}
      </div>
      ${i.texto && !marcarAberto.has(i.id) ? `<div class="ls-texto">${esc(i.texto)}</div>` : ""}
      ${i.texto && marcarAberto.has(i.id) ? `<div class="mk-host" data-mk-host="${i.id}"></div>` : ""}
      ${i.observacao ? `<div class="ls-obs muted small">${icone("notebook-pen")} ${esc(i.observacao)}</div>` : ""}
      ${!meta && rev ? revisaoHTML(i, rev, due, hoje) : ""}
      <div class="ls-rodape">
        <div class="ls-acoes">
          ${principal}
          <details class="ls-mais">
            <summary data-tip="Mais ações" title="Mais ações">${icone("ellipsis")}</summary>
            <div class="ls-mais-pop">${secundarias}</div>
          </details>
        </div>
        <span class="ls-foot-meta">${i.categoria ? `<span class="mini-tag">${esc(i.categoria)}</span>` : ""}<span class="muted small">${fmtData(i.criadoEm)}</span></span>
      </div>
    </div>`;
}

// Bloco de revisão espaçada de um item da memória (só quando já há revisão agendada;
// o "Programar revisão" inicial fica nas ações, junto de PQ/Flashcards/Questões).
function revisaoHTML(i, rev, due, hoje) {
  if (due) {
    return `<div class="ls-rev ls-rev-due">
        <span class="rev-chamada">${icone("bell")} Hora de revisar — você ainda lembra?</span>
        <span class="rev-botoes">
          <button class="lnk" data-action="rev-fazer" data-id="${i.id}" data-res="esqueci" data-tip="Reinicia o ciclo (revisa amanhã).">${icone("frown")} Esqueci</button>
          <button class="lnk" data-action="rev-fazer" data-id="${i.id}" data-res="ok" data-tip="Sobe um degrau no intervalo.">${icone("smile")} Lembrei</button>
          <button class="lnk" data-action="rev-fazer" data-id="${i.id}" data-res="facil" data-tip="Sobe dois degraus (consolidando).">${icone("laugh")} Fácil</button>
          <button class="lnk lnk-danger" data-action="rev-cancelar" data-id="${i.id}" data-tip="Tirar do ciclo de revisão.">parar</button>
        </span>
      </div>`;
  }
  const dias = daysBetween(hoje, rev.proxima);
  return `<div class="ls-rev"><span class="muted small">${icone("bell")} Próxima revisão: <b>${fmtData(rev.proxima)}</b> (em ${dias} dia${dias === 1 ? "" : "s"})</span>
      <button class="lnk lnk-danger" data-action="rev-cancelar" data-id="${i.id}" data-tip="Tirar do ciclo de revisão.">cancelar</button></div>`;
}

function printLista(st, lista, r, comTrecho = true) {
  if (!lista.length) return "<p>Nenhum item.</p>";
  return lista
    .map((i) => {
      const topico = i.topicoId ? st.topicos.find((t) => t.id === i.topicoId) : null;
      const disc = topico ? st.disciplinas.find((d) => d.id === topico.disciplinaId) : i.disciplinaId ? st.disciplinas.find((d) => d.id === i.disciplinaId) : null;
      const vinc = topico ? nomeTopico(st, topico) : disc ? disc.nome : "Geral";
      const extra = [i.tribunal, i.categoria].filter(Boolean).join(" · ");
      return `<div class="print-item">[${i.lido && i.modo !== "memoria" ? "x" : " "}] <b>${esc(i.referencia)}</b>${extra ? ` <span class="print-meta">(${esc(extra)})</span>` : ""}
        ${comTrecho && i.texto ? `<div>${esc(i.texto)}</div>` : ""}
        <div class="print-meta">${esc(vinc)}</div></div>`;
    })
    .join("");
}

// ---------- helpers ----------
function topicoOptions(st, disciplinaId, selecionado) {
  const tops = st.topicos.filter((t) => !disciplinaId || t.disciplinaId === disciplinaId);
  return `<option value="">— sem tópico —</option>` + tops.map((t) => `<option value="${t.id}" ${t.id === selecionado ? "selected" : ""}>${esc(t.nome)}</option>`).join("");
}
function bindCascata(root, st, discSel, topSel) {
  const dEl = root.querySelector(discSel);
  const tEl = root.querySelector(topSel);
  if (!dEl || !tEl) return;
  dEl.addEventListener("change", () => {
    tEl.innerHTML = topicoOptions(st, dEl.value || "", null);
  });
}
function nomeTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
// Tribunais: os padrão + os que o usuário já digitou (campo livre). Alimentam o
// datalist de sugestões e as opções do filtro (o filtro "nasce" do que foi cadastrado).
function tribunaisDe(st) {
  return [...new Set([...TRIBUNAIS, ...st.indicacoes.filter((i) => i.tipo === "juris" && i.tribunal).map((i) => i.tribunal)])];
}
function datalistTribunais(st) {
  return `<datalist id="trib-list">${tribunaisDe(st).map((t) => `<option value="${esc(t)}"></option>`).join("")}</datalist>`;
}
// Editar/excluir um tribunal PERSONALIZADO (os padrão TJSP/TRT/STJ/STF não são alterados).
// Aparece só quando um tribunal personalizado está selecionado no filtro.
function tribAdminHTML() {
  if (filtroTribunal === "todos" || TRIBUNAIS.includes(filtroTribunal)) return "";
  if (editandoTribunal === filtroTribunal) {
    return `<span class="trib-admin">
        <input id="trib-novo" type="text" value="${esc(filtroTribunal)}" style="width:130px" />
        <button class="lnk" data-action="trib-salvar">salvar</button>
        <button class="lnk" data-action="trib-cancelar-edit">cancelar</button>
      </span>`;
  }
  return `<span class="trib-admin">
      <button class="lnk" data-action="trib-editar" data-tip-pos="cima-dir" data-tip="Renomear este tribunal em todos os itens.">${icone("square-pen")} editar</button>
      <button class="lnk lnk-danger" data-action="trib-remover" data-tip-pos="cima-dir" data-tip="Remover este tribunal (os itens ficam sem tribunal).">${icone("trash-2")}</button>
    </span>`;
}
