// Base documental: importar conteúdo das aulas (PDF em blocos, foto/escaneado, .txt
// ou texto colado), visualizar, vincular a tópico e buscar (busca textual; semântica
// fica na v2).
//
// OCR/Visão (econômico): o texto sai SEMPRE do pdf.js (grátis, offline). A Visão do
// Gemini só entra nas PÁGINAS-LACUNA (sem camada de texto) e SOB CLIQUE — nunca
// transcreve o PDF inteiro. Offline, as páginas sem texto ficam como pendência
// registrada até a IA estar conectada.
import { bindActions, toast, header, seloBadge, vazio, confirmar, avisoIA, ligarDropZone, focarItem, pedirNumero, faixaIA, abrirJanela, iconMapa, plural } from "../ui.js";
import { esc } from "../util.js";
import { icone } from "../icones.js";
import { extrairPdfPaginas, rasterizarPaginas, arquivoParaBase64 } from "../pdf.js";
import { extrairTextoArquivo } from "../ia-provider.js";
import { abrirVisualizadorPdf } from "../pdfviewer.js";
import { filtroTopicosBotaoHTML, filtroTopicosPainelHTML, ligarFiltroTopicos, itemNoFiltro } from "./questoes-filtro.js";
import { montarMarcacao } from "../marcacao.js";
import { gerarEAbrirMapa } from "../mapa-mental.js";
import { detectarEstrutura } from "../estrutura.js";

// Limpa RUÍDO de um PDF com texto selecionável (sem IA), POR PÁGINA: remove cabeçalhos/rodapés
// que se repetem em várias páginas, números de página soltos e "Página X / X de Y". PRESERVA a
// ESTRUTURA de páginas (mesma quantidade e ordem) — só altera o texto de cada página — para não
// afetar o vínculo tópico↔página ("págs. 5–8" usa a posição da página, não o número impresso).
// Determinístico (não usa IA, não inventa). Devolve um NOVO array de páginas.
function limparRuidoDePaginas(paginas) {
  const arr = paginas || [];
  if (arr.length < 2) return arr;
  const norm = (l) => l.trim().toLowerCase().replace(/\s+/g, " ").replace(/\d+/g, "#"); // ignora números (variam por página)
  const freq = {};
  for (const p of arr) {
    const unicas = new Set((p.texto || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 3).map(norm));
    for (const k of unicas) freq[k] = (freq[k] || 0) + 1;
  }
  const corte = Math.max(2, Math.ceil(arr.length * 0.6)); // repete em ≥60% das páginas = cabeçalho/rodapé
  const ehRuido = (linha) => {
    const t = linha.trim();
    if (!t) return false;
    if (/^p[áa]g(\.|ina)?\s*\d+(\s*(de|\/)\s*\d+)?$/i.test(t)) return true; // "Página 3", "pág. 3/28"
    if (/^\d{1,4}$/.test(t)) return true; // número de página solto
    if (/^\d{1,4}\s*\/\s*\d{1,4}$/.test(t)) return true; // "3/28"
    return arr.length >= 3 && t.length <= 80 && (freq[norm(t)] || 0) >= corte;
  };
  return arr.map((p) => ({
    ...p,
    texto: (p.texto || "").split(/\r?\n/).filter((l) => !ehRuido(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  }));
}

let busca = "";
const filtroTop = { sel: [], aberto: false }; // filtro multi-tópico da lista de materiais
let abertoId = null;
let marcarAberto = new Set(); // ids de materiais com a marcação tricromática aberta
let marcarPagina = {}; // docId -> nº da página selecionada na marcação (quando há páginas)
let detectDoc = null; // docId com o painel de "detectar tópicos" aberto
let detectResultado = null; // [{topico, paginas}] detectados
let detectando = false;
let topicosDocAberto = null; // docId com o editor de "tópicos que este material cobre" aberto
let pendingPdf = null; // data URL do PDF escolhido, p/ salvar junto ao documento
let pendingImg = null; // data URL da imagem (foto/escaneado) escolhida
let pendingPaginas = null; // [{n,texto,vazia,temImagem,ocr}] da extração por página
let pendingEstrutura = null; // estrutura detectada (blocos) do PDF importado, p/ salvar junto
let estruturaEditando = new Set(); // docIds com o painel de estrutura em modo EDIÇÃO (F3)
let textoBrutoAberto = new Set(); // docIds mostrando o texto bruto em vez do sumário navegável
let ocrEmCurso = false;
let semQuery = ""; // busca semântica
let semResultados = null; // null = ainda não buscou; [] = buscou e nada
let semBuscando = false;
let semSelMostrar = false; // lista de seleção de fontes p/ indexar (oculta até clicar)
let semSel = null; // Set de ids selecionados; null = ainda não inicializado

// Realça (em <mark>) as ocorrências de um termo num texto (após escapar HTML).
function realcar(textoEsc, termo) {
  const t = (termo || "").trim();
  if (t.length < 2) return textoEsc;
  const re = new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
  return textoEsc.replace(re, "<mark>$1</mark>");
}
// Realça cada palavra relevante (>=4 letras) de uma consulta.
function realcarTermos(texto, consulta) {
  let h = esc(texto);
  const palavras = [...new Set((consulta || "").toLowerCase().split(/\s+/).filter((w) => w.length >= 4))];
  for (const p of palavras) h = realcar(h, p);
  return h;
}
// Trecho do material em volta da 1ª ocorrência do termo (para mostrar no resultado textual).
function trechoBusca(texto, termo) {
  const low = (texto || "").toLowerCase();
  const i = low.indexOf((termo || "").toLowerCase());
  if (i < 0) return "";
  const ini = Math.max(0, i - 70);
  const fim = Math.min(texto.length, i + termo.length + 110);
  return (ini > 0 ? "…" : "") + texto.slice(ini, fim).trim() + (fim < texto.length ? "…" : "");
}

function abToDataUrl(ab) {
  let binary = "";
  const bytes = new Uint8Array(ab);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return "data:application/pdf;base64," + btoa(binary);
}

function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function ehImagem(f) {
  return /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);
}

function resetPendentes() {
  pendingPdf = null;
  pendingImg = null;
  pendingPaginas = null;
  pendingEstrutura = null;
}

// Painel EDITÁVEL da ESTRUTURA (F3): por bloco, edita título, tópico do edital, faixa de páginas,
// remove e vê a miniatura da página. Usado no import (docId vazio → pendingEstrutura) e no card
// do material salvo (docId → d.estrutura). `store` permite o select de tópicos e o "Aplicar".
function estruturaResumoHTML(est, store, docId) {
  if (!est || !Array.isArray(est.blocos) || !est.blocos.length) return "";
  const st = store ? store.get() : null;
  const topOpts = (sel) =>
    `<option value="">— sem tópico —</option>` +
    (st ? st.topicos.map((t) => `<option value="${t.id}" ${sel === t.id ? "selected" : ""}>${esc(nomeTopico(st, t))}</option>`).join("") : "");
  const comTopico = est.blocos.filter((b) => b.topicoId).length;
  const dAttr = docId ? ` data-doc="${docId}"` : "";
  const linhas = est.blocos
    .map((b, i) => {
      const ind = "margin-left:" + ((b.nivel || 1) - 1) * 12 + "px";
      const tipoTag = b.tipo !== "teoria" ? `<span class="mini-tag">${esc(b.tipo)}${b.banca ? " " + esc(b.banca) : ""}</span>` : "";
      const aviso = (b.confianca || 1) < 0.6 ? `<span class="estr-aviso" data-tip="Baixa confiança — confira o título e as páginas.">${icone("triangle-alert")}</span>` : "";
      return `<li class="estr-edit" style="${ind}" data-i="${i}">
        <div class="estr-edit-l1">
          <span class="estr-num">${esc(b.numero || "")}</span>${aviso}
          <input class="prev-inp estr-titulo" data-i="${i}" value="${esc(b.titulo)}" />
          <button class="prev-remover" data-action="estr-remover" data-i="${i}"${dAttr} data-tip="Remover este bloco">${icone("x")}</button>
        </div>
        <div class="estr-edit-l2">
          <label class="inline small">Tópico <select class="estr-topico" data-i="${i}"${dAttr}>${topOpts(b.topicoId)}</select></label>
          <label class="inline small">págs <input type="number" min="1" class="estr-pini" data-i="${i}"${dAttr} value="${b.pIni || ""}" />–<input type="number" min="1" class="estr-pfim" data-i="${i}"${dAttr} value="${b.pFim || ""}" /></label>
          ${tipoTag}
          <button class="lnk" data-action="estr-thumb" data-i="${i}" data-pag="${b.pIni}"${dAttr} data-tip="Ver a página inicial deste bloco">${icone("eye")} pág. ${b.pIni}</button>
        </div>
        <div class="estr-thumb-host" data-i="${i}"></div>
      </li>`;
    })
    .join("");
  const aula = est.aulaNome ? ` · aula do cursinho: <b>${esc(est.aulaNome)}</b>` : (est.aulaTitulo ? ` · ${esc(est.aulaTitulo)}` : "");
  const baixaConf = est.blocos.filter((b) => (b.confianca || 1) < 0.6).length;
  const avisoConf = baixaConf ? ` · <span class="estr-aviso">${icone("triangle-alert")} ${baixaConf} a conferir</span>` : "";
  const refino = store && store.iaDisponivel()
    ? `<button class="btn btn-ghost btn-sm" data-action="refinar-estrutura-ia"${dAttr} data-tip="A IA casa cada título com o tópico do edital (manda só os títulos).">${icone("sparkles")} Refinar vínculos (IA)</button>`
    : "";
  const aplicar = docId
    ? `<button class="btn btn-primary btn-sm" data-action="aplicar-estrutura" data-doc="${docId}" data-tip="Vincula o material aos tópicos dos blocos (com as faixas de página).">${icone("check")} Aplicar tópicos ao material</button>`
    : `<span class="muted small">Os tópicos são aplicados ao salvar o material.</span>`;
  return `<details class="estr-card" open>
    <summary>${icone("files")} Estrutura — <b>${est.blocos.length}</b> ${est.blocos.length === 1 ? "bloco" : "blocos"} · ${comTopico}/${est.blocos.length} com tópico${aula}${avisoConf} <span class="muted small">(${esc(rotuloOrigem(est.origem))})</span></summary>
    <p class="muted small" style="margin:6px 0">Revise: ajuste título, tópico e páginas, remova o que não quiser. Clique ${icone("eye")} para conferir a página.</p>
    <ul class="estr-lista">${linhas}</ul>
    <div class="estr-acoes" style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap; align-items:center">${refino}${aplicar}</div>
  </details>`;
}

// Rótulo amigável de como a estrutura foi detectada.
function rotuloOrigem(o) {
  return { indice: "Índice/Sumário", outline: "marcadores do PDF", numeracao: "numeração das seções", fonte: "tamanho de fonte" }[o] || o || "";
}

// Trecho de texto de um bloco = recortado das páginas (modelo "faixa de páginas"); usa override
// manual se houver; cai no texto inteiro quando não há páginas.
function textoDoBloco(d, b) {
  if (b && b.textoOverride) return b.textoOverride;
  if (Array.isArray(d.paginas) && d.paginas.length && b) {
    const t = d.paginas.filter((p) => p.n >= b.pIni && p.n <= b.pFim).map((p) => p.texto || "").join("\n\n").trim();
    if (t) return t;
  }
  return (d.texto || "").trim();
}

// F4: "ver texto extraído" como SUMÁRIO NAVEGÁVEL — cada bloco abre e mostra o trecho daquelas
// páginas, com a faixa, o tipo e o tópico vinculado. Botão "abrir pág." leva ao PDF na página.
function sumarioNavegavelHTML(d, store) {
  const st = store.get();
  const nomeTop = (id) => { if (!id) return null; const t = st.topicos.find((x) => x.id === id); return t ? nomeTopico(st, t) : null; };
  const temIA = store.iaDisponivel();
  const itens = (d.estrutura.blocos || [])
    .map((b, i) => {
      const ind = "margin-left:" + ((b.nivel || 1) - 1) * 12 + "px";
      const tn = nomeTop(b.topicoId);
      const tipoTag = b.tipo !== "teoria" ? `<span class="mini-tag">${esc(b.tipo)}${b.banca ? " " + esc(b.banca) : ""}</span>` : "";
      const verPdf = d.pdfData ? `<button class="lnk" data-action="ler-pdf-pag" data-id="${d.id}" data-pag="${b.pIni}" data-tip="Abrir esta página no PDF">${icone("file-text")} abrir pág. ${b.pIni}</button>` : "";
      const ehQuestoes = b.tipo === "questoes" || b.tipo === "lista";
      // F5: gerar/extrair DESTE bloco (herda tópico + páginas + banca). As opções ficam num
      // menu "Gerar ▾" (antes eram 5 links soltos repetidos em cada bloco = poluição visual).
      const gerar = temIA
        ? `<details class="doc-mais sum-gerar-menu">
             <summary class="lnk" data-tip="Gera a partir DESTE conteúdo (págs. ${b.pIni}–${b.pFim}).">${icone("sparkles")} Gerar deste bloco ${icone("chevron-down")}</summary>
             <div class="doc-mais-pop" role="menu">
               <button class="menu-item" data-action="bloco-flashcards" data-id="${d.id}" data-bi="${i}">${icone("layers")} Flashcards</button>
               <button class="menu-item" data-action="bloco-questoes" data-id="${d.id}" data-bi="${i}">${icone("notebook-pen")} Questões</button>
               <button class="menu-item" data-action="bloco-questoes-ce" data-id="${d.id}" data-bi="${i}">${icone("check")} Questões C/E</button>
               <button class="menu-item" data-action="bloco-mapa" data-id="${d.id}" data-bi="${i}">${iconMapa} Mapa mental</button>
               ${ehQuestoes ? `<button class="menu-item" data-action="bloco-extrair" data-id="${d.id}" data-bi="${i}" data-tip="Extrai as questões já prontas deste bloco (não inventa).">${icone("clipboard-list")} Extrair questões prontas</button>` : ""}
             </div>
           </details>`
        : "";
      const aviso = (b.confianca || 1) < 0.6 ? `<span class="estr-aviso" data-tip="Baixa confiança — confira em ✎ revisar estrutura.">${icone("triangle-alert")}</span> ` : "";
      return `<details class="sum-bloco" style="${ind}">
        <summary><span class="estr-num">${esc(b.numero || "")}</span> ${aviso}${esc(b.titulo)} <span class="muted small">p.${b.pIni}–${b.pFim}</span> ${tipoTag} ${tn ? `<span class="estr-top">→ ${esc(tn)}</span>` : ""}</summary>
        <div class="sum-corpo">
          <div class="sum-corpo-acoes">${verPdf}${gerar}</div>
          <div class="doc-corpo">${esc(textoDoBloco(d, b)) || "<i>vazio</i>"}</div>
        </div>
      </details>`;
    })
    .join("");
  return `<div class="sum-nav">
    <div class="muted small" style="margin-bottom:6px">${icone("files")} Sumário — clique num tópico para ler o trecho daquelas páginas.</div>
    ${itens}
  </div>`;
}

// Lê as edições do painel de estrutura de volta do DOM para os blocos (sem perder o foco).
function lerEstruturaDoDOM(root, est) {
  if (!est || !est.blocos) return est;
  for (let i = 0; i < est.blocos.length; i++) {
    const tit = root.querySelector(`.estr-titulo[data-i="${i}"]`);
    const top = root.querySelector(`.estr-topico[data-i="${i}"]`);
    const pi = root.querySelector(`.estr-pini[data-i="${i}"]`);
    const pf = root.querySelector(`.estr-pfim[data-i="${i}"]`);
    if (tit) est.blocos[i].titulo = tit.value.trim();
    if (top) est.blocos[i].topicoId = top.value || null;
    if (pi && pi.value) est.blocos[i].pIni = Math.max(1, parseInt(pi.value, 10) || est.blocos[i].pIni);
    if (pf && pf.value) est.blocos[i].pFim = Math.max(est.blocos[i].pIni, parseInt(pf.value, 10) || est.blocos[i].pFim);
  }
  return est;
}

export default function renderDocumentos(root, app) {
  const { store } = app;
  const st = store.get();
  // Foco num material específico (Dossiê): limpa a busca, expande o texto e rola até ele.
  let focoDoc = null;
  if (app.params && app.params.focoDocId) {
    focoDoc = app.params.focoDocId;
    app.params.focoDocId = null;
    busca = "";
    abertoId = focoDoc;
  }
  // Abrir a marcação direto (vindo do dossiê de marcações).
  if (app.params && app.params.marcarId) {
    marcarAberto.add(app.params.marcarId);
    app.params.marcarId = null;
  }
  const docs = docsFiltrados(store, st);

  const opcoesTopico = st.topicos
    .map((t) => `<option value="${t.id}">${esc(nomeTopico(st, t))}</option>`)
    .join("");

  const agrup = st.config.materialAgrupamento || "disciplina";

  root.innerHTML = `
    ${header("Materiais", "Importe o conteúdo das aulas (PDF, imagem ou texto) e pesquise por dentro dele.")}

    ${
      docs.length
        ? faixaIA({
            texto: "Cada material vira <b>flashcards</b> e <b>questões</b> com a IA, pelo menu <b>Mais</b> da aula.",
            key: "materiais-gerar",
          })
        : ""
    }

    <details class="card buscas-card buscas-recolhida"${busca || semResultados !== null ? " open" : ""}>
      <summary class="buscas-summary">${icone("search")} Buscar nos materiais</summary>
      <div class="buscas-corpo">
        <div class="field"><span class="field-ico">${icone("search")}</span><input id="busca" type="search" placeholder="Busque por palavra exata, ou por significado (IA) no botão abaixo…" value="${esc(busca)}" class="busca-input has-ico" /></div>
        <p class="muted small" style="margin:6px 0 8px">Filtra os materiais conforme você digita (palavra em destaque). Para buscar por <b>significado</b>, use o botão abaixo.</p>
        ${buscaSemanticaHTML(store)}
      </div>
    </details>

    <div class="barra-acoes">
      <button class="btn btn-add btn-sm" data-action="toggle-form" data-tip-pos="cima-esq" data-tip="Adicionar uma aula ou conteúdo à sua base de estudo.">Adicionar material</button>
      <span class="spacer"></span>
      ${filtroTopicosBotaoHTML(st, filtroTop.sel, filtroTop.aberto)}
      <label class="inline small" style="white-space:nowrap">Agrupar por
        <select id="doc-group">
          <option value="disciplina" ${agrup === "disciplina" ? "selected" : ""}>Disciplina</option>
          <option value="topico" ${agrup === "topico" ? "selected" : ""}>Tópico</option>
          <option value="nenhum" ${agrup === "nenhum" ? "selected" : ""}>Sem agrupar</option>
        </select>
      </label>
    </div>
    ${filtroTopicosPainelHTML(st, filtroTop.sel, filtroTop.aberto)}

    <div class="lista-docs">
      ${listaDocsHTML(store, st, docs, agrup, busca)}
    </div>`;


  const buscaEl = root.querySelector("#busca");
  buscaEl?.addEventListener("input", (e) => {
    busca = e.target.value;
    const lista = root.querySelector(".lista-docs");
    lista.innerHTML = listaDocsHTML(store, st, docsFiltrados(store, st), st.config.materialAgrupamento || "disciplina", busca);
  });
  ligarFiltroTopicos(root, app, filtroTop);

  root.querySelector("#doc-group")?.addEventListener("change", (e) => {
    store.setConfig({ materialAgrupamento: e.target.value });
    app.refresh();
  });

  // Checkboxes de seleção de fontes para indexar (não via bindActions: o preventDefault
  // do clique impediria o checkbox de marcar).
  root.querySelectorAll(".sem-fonte-chk").forEach((chk) => {
    chk.addEventListener("change", () => {
      const id = chk.getAttribute("data-id");
      if (semSel === null) semSel = new Set();
      if (chk.checked) semSel.add(id);
      else semSel.delete(id);
      const btn = root.querySelector('[data-action="aplicar-sel"]');
      if (btn) btn.textContent = `Separar selecionados (${semSel.size})`;
    });
  });

  // Editor de tópicos do material (muitos‑para‑muitos): aplica na hora ao marcar/desmarcar.
  root.querySelectorAll(".doc-top-chk").forEach((chk) => {
    chk.addEventListener("change", () => {
      const docId = chk.getAttribute("data-doc");
      const ids = [...root.querySelectorAll(`.doc-top-chk[data-doc="${docId}"]:checked`)].map((c) => c.value);
      store.setDocumentoTopicos(docId, ids);
    });
  });
  // Fase 6: faixa de páginas por tópico (salva ao sair do campo).
  root.querySelectorAll(".doc-pag").forEach((inp) => {
    inp.addEventListener("change", () => {
      const docId = inp.getAttribute("data-doc");
      const tid = inp.getAttribute("data-topico");
      const ini = root.querySelector(`.doc-pag[data-doc="${docId}"][data-topico="${tid}"][data-end="ini"]`)?.value;
      const fim = root.querySelector(`.doc-pag[data-doc="${docId}"][data-topico="${tid}"][data-end="fim"]`)?.value;
      store.setDocumentoTopicoPaginas(docId, tid, [ini, fim]);
    });
  });

  focarItem(root, focoDoc);

  // Monta a marcação tricromática nos materiais com o painel aberto (texto inteiro OU por página).
  root.querySelectorAll("[data-mk-host]").forEach((host) => {
    const id = host.getAttribute("data-mk-host");
    const d = st.documentos.find((x) => x.id === id);
    if (!d) return;
    const pgs = (d.paginas || []).filter((p) => (p.texto || "").trim());
    if (pgs.length > 1) {
      const n = marcarPagina[id] || pgs[0].n;
      const pg = pgs.find((p) => String(p.n) === String(n)) || pgs[0];
      montarMarcacao(host, { store, alvoTipo: "documento", alvoId: `${id}#${pg.n}`, texto: pg.texto, topicoId: d.topicoId, tituloFonte: `${d.titulo} (pág. ${pg.n})` });
    } else if ((d.texto || "").trim()) {
      montarMarcacao(host, { store, alvoTipo: "documento", alvoId: id, texto: d.texto, topicoId: d.topicoId, tituloFonte: d.titulo });
    }
  });
  // Trocar de página na marcação.
  root.querySelectorAll(".mk-pagina-sel").forEach((sel) =>
    sel.addEventListener("change", () => {
      marcarPagina[sel.getAttribute("data-id")] = sel.value;
      app.refresh();
    })
  );

  // F5: gera/extrai a partir de UM bloco do sumário (herda tópico + páginas + banca).
  async function gerarDoBloco(el, tipo) {
    if (!store.iaDisponivel()) return avisoIA(app, "Gerar deste bloco");
    const id = el.getAttribute("data-id");
    const bi = parseInt(el.getAttribute("data-bi"), 10);
    const d = store.get().documentos.find((x) => x.id === id);
    const bloco = d && d.estrutura && d.estrutura.blocos[bi];
    if (!bloco) return;
    const rotulo = `${bloco.numero || ""} ${bloco.titulo}`.trim();
    if (tipo === "mapa") return gerarEAbrirMapa(store, app, () => store.gerarMapaMentalDeMaterial(id, bloco));
    if (tipo === "extrair") {
      el.classList.add("ocupado");
      toast(`Extraindo questões de "${rotulo}"…`);
      try {
        const qs = await store.extrairQuestoesDeDoc(id, bloco);
        toast(qs.length ? `${plural(qs.length, "questão extraída", "questões extraídas")} de "${rotulo}".` : "Não encontrei questões prontas neste bloco.", qs.length ? "ok" : "erro");
      } catch (e) { console.error(e); toast("A IA não conseguiu agora. Tente de novo em instantes.", "erro"); }
      el.classList.remove("ocupado");
      return;
    }
    const perguntas = {
      flashcards: ["Quantos flashcards a IA deve gerar deste bloco?", 6],
      questoes: ["Quantas questões a IA deve gerar deste bloco?", 5],
      ce: ["Quantos itens Certo/Errado a IA deve gerar deste bloco?", 6],
    }[tipo];
    const r = await pedirNumero(perguntas[0], { padrao: perguntas[1], min: 1, max: 30, nivel: true });
    if (!r) return;
    const { n, dificuldade } = r;
    el.classList.add("ocupado");
    toast(`Gerando de "${rotulo}"…`);
    try {
      let res = [];
      if (tipo === "flashcards") res = await store.gerarFlashcardsDeDoc(id, n, dificuldade, bloco);
      else if (tipo === "questoes") res = await store.gerarQuestoesDeDoc(id, n, dificuldade, bloco);
      else if (tipo === "ce") res = await store.gerarQuestoesCEDeDoc(id, n, dificuldade, bloco);
      toast(res.length ? `${plural(res.length, "item criado", "itens criados")} de "${rotulo}".` : "Nada gerado.", res.length ? "ok" : "erro");
    } catch (e) { console.error(e); toast("A IA não conseguiu agora. Tente de novo em instantes.", "erro"); }
    el.classList.remove("ocupado");
  }

  // Q7: se o material foi extraído em BLOCOS (sumário), pergunta de qual PARTE gerar —
  // todo o material ou um subtópico específico. Retorna { bloco } (null = tudo) ou null (cancelou).
  async function escolherEscopoGeracao(id) {
    const d = store.get().documentos.find((x) => x.id === id);
    const blocos = (d && d.estrutura && d.estrutura.blocos) || [];
    if (blocos.length < 2) return { bloco: null }; // sem estrutura (ou bloco único) → material inteiro
    const opcoes = [
      { label: "Todo o material", value: "-1", cls: "btn-soft" },
      ...blocos.map((b, i) => ({ label: `${b.numero || ""} ${b.titulo}`.trim() || `Bloco ${i + 1}`, value: String(i) })),
    ];
    const v = await escolher("Gerar a partir de qual parte do material?", opcoes, { lista: true });
    if (v === null || v === undefined) return null;
    const idx = parseInt(v, 10);
    return { bloco: idx >= 0 ? blocos[idx] : null };
  }

  bindActions(root, {
    "toggle-form": () => abrirImportarMaterial(app),
    abrir: (el) => {
      const id = el.getAttribute("data-id");
      abertoId = abertoId === id ? null : id;
      app.refresh();
    },
    "toggle-marcar": (el) => {
      const id = el.getAttribute("data-id");
      if (marcarAberto.has(id)) marcarAberto.delete(id);
      else marcarAberto.add(id);
      app.refresh();
    },
    // F2: refina o casamento bloco→tópico com IA (manda só os títulos). data-id = material salvo;
    // sem data-id = estrutura ainda no formulário de importação (pendingEstrutura).
    "refinar-estrutura-ia": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Refinar vínculos com IA");
      const id = el.getAttribute("data-id");
      el.disabled = true;
      el.textContent = "Refinando…";
      try {
        if (id) {
          await store.refinarEstruturaDocIA(id);
          toast("Vínculos refinados pela IA (confira).", "ok");
          app.refresh();
        } else if (pendingEstrutura) {
          lerEstruturaDoDOM(root, pendingEstrutura); // preserva edições de título/páginas
          await store.casarEstruturaComEditalIA(pendingEstrutura);
          const cont = root.querySelector("#doc-estrutura");
          if (cont) cont.innerHTML = estruturaResumoHTML(pendingEstrutura, store);
          toast("Vínculos refinados pela IA (confira).", "ok");
        }
      } catch (e) {
        console.error(e);
        toast("A IA não conseguiu refinar agora. Tente de novo em instantes.", "erro");
        el.disabled = false;
        el.textContent = "Refinar vínculos (IA)";
      }
    },
    // F3: remove um bloco da estrutura (import = pendingEstrutura; salvo = d.estrutura + commit).
    "estr-remover": (el) => {
      const i = parseInt(el.getAttribute("data-i"), 10);
      const id = el.getAttribute("data-doc");
      const est = id ? (store.get().documentos.find((x) => x.id === id) || {}).estrutura : pendingEstrutura;
      if (!est) return;
      lerEstruturaDoDOM(root, est);
      est.blocos.splice(i, 1);
      if (id) { store.aplicarEstruturaAoMaterial(id, est); app.refresh(); }
      else { const cont = root.querySelector("#doc-estrutura"); if (cont) cont.innerHTML = estruturaResumoHTML(pendingEstrutura, store); }
    },
    // F3: miniatura da página inicial de um bloco (rasteriza sob demanda).
    "estr-thumb": async (el) => {
      const i = el.getAttribute("data-i");
      const pag = parseInt(el.getAttribute("data-pag"), 10);
      const id = el.getAttribute("data-doc");
      const fonte = id ? (store.get().documentos.find((x) => x.id === id) || {}).pdfData : pendingPdf;
      const host = root.querySelector(`.estr-thumb-host[data-i="${i}"]`);
      if (!host) return;
      if (host.dataset.aberto === "1") { host.innerHTML = ""; host.dataset.aberto = "0"; return; }
      if (!fonte) { host.innerHTML = `<span class="muted small">PDF não guardado (não dá para pré-visualizar).</span>`; return; }
      host.innerHTML = `<span class="muted small">carregando página ${pag}…</span>`;
      host.dataset.aberto = "1";
      try {
        const [img] = await rasterizarPaginas(fonte, [pag], 1.4);
        host.innerHTML = img ? `<img class="estr-thumb-img" src="${img.dataUrl}" alt="página ${pag}" />` : `<span class="muted small">página ${pag} indisponível.</span>`;
      } catch (_) { host.innerHTML = `<span class="muted small">não consegui renderizar a página.</span>`; }
    },
    // F3: aplica os tópicos da estrutura (com faixas de página) ao material salvo.
    "aplicar-estrutura": (el) => {
      const id = el.getAttribute("data-doc");
      const d = store.get().documentos.find((x) => x.id === id);
      if (!d || !d.estrutura) return;
      lerEstruturaDoDOM(root, d.estrutura);
      const n = store.aplicarEstruturaAoMaterial(id, d.estrutura);
      toast(`Material vinculado a ${plural(n, "tópico", "tópicos")} (com as páginas).`, "ok");
      app.refresh();
    },
    "detectar-topicos": async (el) => {
      const id = el.getAttribute("data-id");
      detectDoc = id;
      detectResultado = null;
      detectando = true;
      app.refresh();
      try {
        detectResultado = await store.detectarTopicosDoMaterial(id);
      } catch (e) {
        console.error(e);
        toast("Não consegui detectar os tópicos agora. Tente de novo em instantes.", "erro");
      }
      detectando = false;
      app.refresh();
    },
    "detect-fechar": () => {
      detectDoc = null;
      detectResultado = null;
      app.refresh();
    },
    "detect-agendar": () => {
      const sel = [...root.querySelectorAll(".detect-cb:checked")].map((cb) => detectResultado[parseInt(cb.getAttribute("data-i"), 10)]).filter(Boolean);
      if (!sel.length) return toast("Marque ao menos um tópico.", "erro");
      sel.forEach((x) => store.agendarRevisaoTopico(x.topico.id));
      detectDoc = null;
      detectResultado = null;
      toast(`${plural(sel.length, "tópico", "tópicos")} na curva de revisão (24h).`);
    },
    "detect-vincular": () => {
      const sel = [...root.querySelectorAll(".detect-cb:checked")].map((cb) => detectResultado[parseInt(cb.getAttribute("data-i"), 10)]).filter(Boolean);
      if (!sel.length) return toast("Marque ao menos um tópico.", "erro");
      // Fase 6: já leva as PÁGINAS detectadas por tópico (precisão por página).
      store.vincularTopicosComPaginas(detectDoc, sel.map((x) => ({ topicoId: x.topico.id, paginas: x.paginas })));
      const comPag = sel.filter((x) => (x.paginas || []).length).length;
      detectDoc = null;
      detectResultado = null;
      toast(`${plural(sel.length, "tópico vinculado", "tópicos vinculados")}${comPag ? ` (${comPag} com faixa de páginas)` : ""}.`);
    },
    "editar-topicos": (el) => {
      const id = el.getAttribute("data-id");
      topicosDocAberto = topicosDocAberto === id ? null : id;
      app.refresh();
    },
    "ler-pdf": (el) => {
      const d = store.get().documentos.find((x) => x.id === el.getAttribute("data-id"));
      if (d && d.pdfData) abrirVisualizadorPdf(d.pdfData, d.titulo);
    },
    // F4: abre o PDF já na página inicial do bloco.
    "ler-pdf-pag": (el) => {
      const d = store.get().documentos.find((x) => x.id === el.getAttribute("data-id"));
      const pag = parseInt(el.getAttribute("data-pag"), 10) || 1;
      if (d && d.pdfData) abrirVisualizadorPdf(d.pdfData, d.titulo, pag);
      else toast("O PDF deste material foi descartado; não dá para abrir a página.", "erro");
    },
    // F4: alterna o painel de estrutura entre LEITURA (sumário) e EDIÇÃO (F3).
    "estr-edit-toggle": (el) => {
      const id = el.getAttribute("data-id");
      if (estruturaEditando.has(id)) estruturaEditando.delete(id);
      else { estruturaEditando.add(id); textoBrutoAberto.delete(id); }
      app.refresh();
    },
    // Opcional 2: re-detecta a estrutura a partir do texto atual das páginas (ex.: após OCR).
    "redetectar-estrutura": (el) => {
      const id = el.getAttribute("data-id");
      const est = store.redetectarEstruturaDoc(id);
      if (est) { textoBrutoAberto.delete(id); estruturaEditando.delete(id); toast(`Estrutura re-detectada: ${plural(est.blocos.length, "bloco", "blocos")}.`, "ok"); }
      else toast("Não consegui detectar uma estrutura no texto atual (sem Índice/numeração).", "erro");
      app.refresh();
    },
    // F4: alterna entre o sumário navegável e o texto bruto completo.
    "texto-bruto-toggle": (el) => {
      const id = el.getAttribute("data-id");
      if (textoBrutoAberto.has(id)) textoBrutoAberto.delete(id);
      else textoBrutoAberto.add(id);
      app.refresh();
    },
    "abrir-pdf": (el) => {
      const d = store.get().documentos.find((x) => x.id === el.getAttribute("data-id"));
      if (d && d.pdfData) {
        const w = window.open("", "_blank");
        if (w) w.document.write(`<iframe src="${d.pdfData}" style="border:0;width:100%;height:100%"></iframe>`);
        else toast("Permita pop-ups para abrir o arquivo.", "erro");
      }
    },
    "del-doc": async (el) => {
      if (await confirmar("Remover este material da base?")) {
        store.removerDocumento(el.getAttribute("data-id"));
        toast("Material removido.");
      }
    },
    "descartar-pdf": async (el) => {
      if (await confirmar("Descartar o PDF original deste material? O texto extraído é mantido, mas você perde o visualizador de PDF e o OCR por página.")) {
        store.descartarBinarioDoc(el.getAttribute("data-id"));
        toast("PDF original descartado (texto mantido).");
      }
    },
    "ir-pratica": (el) => app.navigate("pratica", { topicoId: el.getAttribute("data-top") }),

    // Gerar a partir do material inteiro (mesmas funções usadas nas telas Questões/Flashcards).
    "doc-mapa": (el) => gerarEAbrirMapa(store, app, () => store.gerarMapaMentalDeMaterial(el.getAttribute("data-id"))),
    "doc-flashcards": async (el) => {
      el.closest("details")?.removeAttribute("open");
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar flashcards");
      const id = el.getAttribute("data-id");
      const escopo = await escolherEscopoGeracao(id);
      if (!escopo) return;
      const r = await pedirNumero("Quantos flashcards a IA deve gerar?", { padrao: 6, min: 1, max: 30, nivel: true });
      if (!r) return;
      const { n, dificuldade } = r;
      el.disabled = true;
      toast("Gerando flashcards…");
      try {
        const cards = await store.gerarFlashcardsDeDoc(id, n, dificuldade, escopo.bloco);
        toast(cards.length ? `${plural(cards.length, "flashcard criado", "flashcards criados")} (veja em Flashcards).` : "Nada gerado.", cards.length ? "ok" : "erro");
      } catch (e) {
        console.error(e);
        toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro");
      }
      el.disabled = false;
    },
    "doc-questoes": async (el) => {
      el.closest("details")?.removeAttribute("open");
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar questões");
      const id = el.getAttribute("data-id");
      const escopo = await escolherEscopoGeracao(id);
      if (!escopo) return;
      const r = await pedirNumero("Quantas questões a IA deve gerar?", { padrao: 5, min: 1, max: 30, nivel: true });
      if (!r) return;
      const { n, dificuldade } = r;
      el.disabled = true;
      toast("Gerando questões…");
      try {
        const qs = await store.gerarQuestoesDeDoc(id, n, dificuldade, escopo.bloco);
        toast(qs.length ? `${plural(qs.length, "questão criada", "questões criadas")} (veja em Questões).` : "Nada gerado.", qs.length ? "ok" : "erro");
      } catch (e) {
        console.error(e);
        toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro");
      }
      el.disabled = false;
    },
    "doc-questoes-ce": async (el) => {
      el.closest("details")?.removeAttribute("open");
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar itens Certo/Errado");
      const id = el.getAttribute("data-id");
      const escopo = await escolherEscopoGeracao(id);
      if (!escopo) return;
      const r = await pedirNumero("Quantos itens Certo/Errado a IA deve gerar?", { padrao: 6, min: 1, max: 30, nivel: true });
      if (!r) return;
      const { n, dificuldade } = r;
      el.disabled = true;
      toast("Gerando itens Certo/Errado…");
      try {
        const itens = await store.gerarQuestoesCEDeDoc(id, n, dificuldade, escopo.bloco);
        toast(itens.length ? `${plural(itens.length, "item C/E criado", "itens C/E criados")} (veja em Questões C/E).` : "Nada gerado.", itens.length ? "ok" : "erro");
      } catch (e) {
        console.error(e);
        toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro");
      }
      el.disabled = false;
    },
    "doc-extrair": async (el) => {
      el.closest("details")?.removeAttribute("open");
      if (!store.iaDisponivel()) return avisoIA(app, "Extrair questões do material");
      const id = el.getAttribute("data-id");
      el.disabled = true;
      toast("Extraindo do material…");
      try {
        const qs = await store.extrairQuestoesDeDoc(id);
        toast(qs.length ? `${plural(qs.length, "questão extraída", "questões extraídas")} (quando o gabarito estava no material; veja em Questões).` : "Não encontrei questões prontas neste material.", qs.length ? "ok" : "erro");
      } catch (e) {
        console.error(e);
        toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro");
      }
      el.disabled = false;
    },

    // ---- F5: geração/extração POR BLOCO (a partir do sumário navegável) ----
    "bloco-flashcards": (el) => gerarDoBloco(el, "flashcards"),
    "bloco-questoes": (el) => gerarDoBloco(el, "questoes"),
    "bloco-questoes-ce": (el) => gerarDoBloco(el, "ce"),
    "bloco-mapa": (el) => gerarDoBloco(el, "mapa"),
    "bloco-extrair": (el) => gerarDoBloco(el, "extrair"),

    // ---- OCR / Visão ----
    "detectar-paginas": async (el) => {
      const d = store.get().documentos.find((x) => x.id === el.getAttribute("data-id"));
      if (!d || !d.pdfData) return toast("Sem PDF salvo para reanalisar.", "erro");
      el.disabled = true;
      toast("Analisando páginas…");
      try {
        const { paginas } = await extrairPdfPaginas(d.pdfData);
        store.setPaginasDocumento(d.id, paginas);
        const pend = paginas.filter((p) => p.vazia).length;
        toast(pend ? `${plural(pend, "página sem texto encontrada", "páginas sem texto encontradas")}.` : "Todas as páginas têm texto.", "ok");
      } catch (e) {
        console.error(e);
        toast("Não consegui analisar as páginas agora. Tente de novo em instantes.", "erro");
        el.disabled = false;
      }
    },
    "ocr-doc": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Reconhecer texto por Visão (OCR)");
      const d = store.get().documentos.find((x) => x.id === el.getAttribute("data-id"));
      if (!d) return;
      const ns = store.paginasPendentes(d).map((p) => p.n);
      await processarOcr(app, store, d, ns);
    },
    "ocr-pagina-sel": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Reconhecer texto por Visão (OCR)");
      const id = el.getAttribute("data-id");
      const d = store.get().documentos.find((x) => x.id === id);
      if (!d) return;
      const sel = root.querySelector(`.ocr-pag-sel[data-id="${id}"]`);
      const n = sel ? parseInt(sel.value, 10) : NaN;
      if (!n) return toast("Escolha uma página.", "erro");
      await processarOcr(app, store, d, [n]);
    },

    // ---- busca semântica ----
    "toggle-sel-index": () => {
      if (!store.iaDisponivel()) return avisoIA(app, "Busca semântica");
      semSelMostrar = !semSelMostrar;
      // Seleção reflete o que JÁ está no índice (marcado = está; desmarcar = sai).
      if (semSelMostrar) {
        semSel = new Set(store.fontesIndice().filter((f) => f.emIndice).map((f) => f.id));
      }
      app.refresh();
    },
    "sel-todos": () => {
      semSel = new Set(store.fontesIndice().map((f) => f.id));
      app.refresh();
    },
    "sel-nenhum": () => {
      semSel = new Set();
      app.refresh();
    },
    "aplicar-sel": async () => {
      if (!store.iaDisponivel()) return avisoIA(app, "Busca semântica");
      const ids = [...(semSel || [])];
      toast(ids.length ? "Aplicando seleção…" : "Removendo do índice…");
      try {
        const r = await store.sincronizarIndice(ids, (feito, total, titulo) =>
          toast(`Indexando ${feito}/${total}: ${titulo}`)
        );
        toast(`Índice: ${plural(r.chunks, "trecho", "trechos")}.`, "ok");
        semSelMostrar = false;
      } catch (e) {
        console.error(e);
        toast("Não consegui separar os materiais agora. Tente de novo em instantes.", "erro");
      }
      app.refresh();
    },
    "result-flashcards": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar flashcards");
      const r = semResultados && semResultados[+el.getAttribute("data-idx")];
      if (!r) return;
      const pg = await pedirNumero("Quantos flashcards a IA deve gerar deste trecho?", { padrao: 5, min: 1, max: 30, nivel: true });
      if (!pg) return;
      const { n, dificuldade } = pg;
      el.disabled = true;
      toast("Gerando flashcards…");
      try {
        const cards = await store.gerarFlashcardsDeTrecho({ texto: r.trecho, contexto: r.titulo, fonteId: r.fonteId, tipo: r.tipo, n, dificuldade });
        toast(`${plural(cards.length, "flashcard criado", "flashcards criados")} (veja em Flashcards).`, "ok");
      } catch (e) {
        console.error(e);
        toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro");
      }
      el.disabled = false;
    },
    "result-questoes": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar questões");
      const r = semResultados && semResultados[+el.getAttribute("data-idx")];
      if (!r) return;
      const pg = await pedirNumero("Quantas questões a IA deve gerar deste trecho?", { padrao: 3, min: 1, max: 30, nivel: true });
      if (!pg) return;
      const { n, dificuldade } = pg;
      el.disabled = true;
      toast("Gerando questões…");
      try {
        const qs = await store.gerarQuestoesDeTrecho({ texto: r.trecho, contexto: r.titulo, fonteId: r.fonteId, tipo: r.tipo, n, dificuldade });
        toast(`${plural(qs.length, "questão criada", "questões criadas")} (veja em Questões).`, "ok");
      } catch (e) {
        console.error(e);
        toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro");
      }
      el.disabled = false;
    },
    "buscar-sem": async () => {
      const q = (root.querySelector("#busca")?.value || "").trim();
      semQuery = q;
      if (!q) return toast("Digite o que procurar.", "erro");
      if (!store.iaDisponivel()) return avisoIA(app, "Busca semântica");
      if (!store.statusIndice().temIndice) return toast("Indexe o material primeiro.", "erro");
      semBuscando = true;
      app.refresh();
      try {
        semResultados = await store.buscaSemantica(q, { k: 8 });
      } catch (e) {
        console.error(e);
        toast("A busca por significado falhou agora. Tente de novo em instantes.", "erro");
        semResultados = [];
      }
      semBuscando = false;
      app.refresh();
    },
  });
}

// Rasteriza e transcreve uma lista de páginas, uma a uma (1 página = 1 requisição).
// Mostra progresso e PARA sem perder o já feito se a cota/IA falhar.
async function processarOcr(app, store, doc, listaN) {
  if (ocrEmCurso) return toast("Já há um OCR em andamento.", "erro");
  if (!listaN || !listaN.length) return toast("Nenhuma página pendente.", "erro");
  ocrEmCurso = true;
  try {
    let imagens;
    if (doc.imgData && (!doc.pdfData)) {
      imagens = listaN.includes(1) ? [{ n: 1, dataUrl: doc.imgData }] : [];
    } else if (doc.pdfData) {
      toast(`Preparando ${plural(listaN.length, "página", "páginas")}…`);
      imagens = await rasterizarPaginas(doc.pdfData, listaN);
    } else {
      return toast("Sem PDF/imagem salvos para processar (arquivo grande não foi guardado).", "erro");
    }
    let ok = 0;
    for (const img of imagens) {
      toast(`Visão: transcrevendo página ${img.n} (${ok + 1}/${imagens.length})…`);
      try {
        await store.ocrPagina(doc.id, img.n, img.dataUrl);
        ok++;
      } catch (e) {
        console.error(e);
        toast(`A Visão parou na página ${img.n}. O que já foi transcrito está salvo; tente as restantes em instantes.`, "erro");
        break;
      }
    }
    if (ok) toast(`${plural(ok, "página transcrita", "páginas transcritas")} por Visão (confira o texto).`, "ok");
    app.refresh();
  } finally {
    ocrEmCurso = false;
  }
}

// Texto de ajuda: qual busca usar conforme o objetivo.
// Materiais filtrados pela busca textual E pelo filtro multi-tópico.
function docsFiltrados(store, st) {
  return store.buscarDocumentos(busca).filter((d) => itemNoFiltro(st, d, filtroTop.sel));
}

function ajudaBuscasHTML() {
  return `
    <details class="sem-ajuda">
      <summary>Qual busca usar?</summary>
      <div class="sem-ajuda-corpo">
        <p><b>${icone("search")} No material (palavra exata):</b> acha a palavra exata que você digita. É rápida, funciona offline (sem IA) e busca conforme você digita. Boa quando você sabe o termo certo (por exemplo "autoexecutoriedade" ou o nome de uma aula).</p>
        <p><b>${icone("puzzle")} Por significado (semântica):</b> acha trechos pelo sentido, mesmo escritos com outras palavras. Por exemplo: "casa que perde a proteção contra penhora" encontra "impenhorabilidade do bem de família". Usa IA e precisa separar os materiais antes (indexar). Boa para perguntas e conceitos quando você não lembra o termo exato.</p>
      </div>
    </details>`;
}

// Busca semântica como SUB-BLOCO do card "Buscas". Indexar é PRÉ-REQUISITO: sem índice,
// a busca por significado não tem o que consultar — por isso "1. Indexar" vem primeiro e
// o campo de busca fica desabilitado até haver índice.
// Busca por SIGNIFICADO (semântica/IA) — sem campo próprio: usa o MESMO termo digitado no
// campo unificado (#busca). Aqui ficam só as ações (separar índice + buscar) e os resultados.
function buscaSemanticaHTML(store) {
  const s = store.statusIndice();
  if (!s.online && !s.temIndice) {
    // Mesmo sem IA, o botão APARECE (suspenso) para não contradizer o texto "use o botão abaixo".
    return `
    <div class="busca-sem-barra">
      <button class="btn btn-ia btn-sm" data-action="buscar-sem" disabled data-tip="Conecte uma IA em Configurações para buscar por significado (não só palavra exata).">${icone("sparkles")} Buscar por significado (IA)</button>
      <span class="sem-status muted small">Conecte uma IA em Configurações para habilitar a busca por <b>significado</b>.</span>
    </div>`;
  }
  const statusTxt = s.temIndice
    ? `Separados para busca por significado: <b>${s.indexadas}</b> de ${s.fontes} (${plural(s.chunks, "trecho", "trechos")})${s.pendentes ? ` · <b>${s.pendentes} para separar</b>` : ""}.`
    : `Nenhum material separado ainda (${plural(s.fontes, "disponível", "disponíveis")}) — separe para habilitar a busca por significado.`;
  const labelSeparar = semSelMostrar
    ? `${icone("chevron-down")} Fechar`
    : s.temIndice
    ? s.pendentes
      ? `Separar (${plural(s.pendentes, "pendente", "pendentes")})`
      : "Separar de novo"
    : "Separar materiais";
  return `
    <div class="busca-sem-barra">
      ${s.online ? `<button class="btn btn-ghost btn-sm" data-action="toggle-sel-index" data-tip="Separa (indexa) os materiais escolhidos para a busca por significado (faça uma vez; repita ao adicionar material novo).">${labelSeparar}</button>` : ""}
      <button class="btn btn-ia btn-sm" data-action="buscar-sem" ${s.online && s.temIndice ? "" : "disabled"} data-tip="${s.temIndice ? "Busca por significado (IA) usando o que você digitou acima." : "Separe ao menos um material antes de buscar por significado."}">${semBuscando ? "Buscando…" : `${icone("sparkles")} Buscar por significado (IA)`}</button>
      <span class="sem-status muted small">${statusTxt}</span>
    </div>
    ${semSelMostrar ? selecaoFontesHTML(store) : ""}
    ${semResultados !== null ? resultadosSemHTML(semResultados) : ""}`;
}

// Lista (oculta até clicar em Indexar) onde o checkbox É a participação no índice:
// marcado = está na busca semântica; desmarcar + Aplicar = sai. Um só botão sincroniza.
function selecaoFontesHTML(store) {
  const fontes = store.fontesIndice();
  if (!fontes.length) {
    return `<div class="muted small" style="margin-top:10px">Nenhuma fonte (material/resumo) para indexar ainda.</div>`;
  }
  const sel = semSel || new Set();
  const statusFonte = (f) =>
    f.indexada ? `${icone("check")} separado (${plural(f.chunks, "trecho", "trechos")})` : f.emIndice ? `${icone("refresh-cw")} desatualizado (reprocessar)` : "ainda não separado";
  return `
    <div class="sem-sel">
      <div class="sem-sel-top">
        <span class="muted small">Marque os materiais que entram na busca por significado (separar 1 trecho = 1 requisição à IA):</span>
        <span class="spacer"></span>
        <button class="lnk" data-action="sel-todos">marcar todos</button> ·
        <button class="lnk" data-action="sel-nenhum">desmarcar todos</button>
      </div>
      <div class="sem-sel-lista">
        ${fontes
          .map(
            (f) => `
          <label class="sem-fonte">
            <input type="checkbox" class="sem-fonte-chk" data-id="${f.id}" ${sel.has(f.id) ? "checked" : ""} />
            <span class="sem-fonte-nome">${esc(f.titulo)}</span>
            <span class="mini-tag">${f.tipo === "resumo" ? "Resumo" : f.tipo === "leiseca" ? "Lei Seca" : f.tipo === "juris" ? "Jurisprudência" : "Material"}</span>
            <span class="sem-fonte-status ${f.indexada ? "ok" : f.emIndice ? "pend" : ""}">${statusFonte(f)}</span>
          </label>`
          )
          .join("")}
      </div>
      <div class="sem-sel-acoes">
        <button class="btn btn-primary btn-sm" data-action="aplicar-sel">Separar selecionados (${sel.size})</button>
        <span class="muted small">Desmarcar e aplicar remove o material da busca.</span>
      </div>
    </div>`;
}

// Lista de materiais agrupada (por disciplina/tópico) ou plana.
function listaDocsHTML(store, st, docs, modo, busca) {
  if (!docs.length) {
    if (busca) {
      return vazio("Nada encontrado para a busca\nTente outra palavra, ou limpe o campo de busca.", "", icone("search"));
    }
    return vazio(
      "Importe sua primeira aula\nPDF, foto ou texto — depois você pesquisa por dentro.",
      `<button class="btn btn-add" data-action="toggle-form">Adicionar material</button>`,
      icone("library")
    );
  }
  const grupos = agruparDocs(st, docs, modo);
  if (grupos.length === 1 && grupos[0].titulo === null) {
    return docs.map((d) => docHTML(store, st, d, busca)).join("");
  }
  return grupos
    .map(
      (g) => `
      <div class="doc-grupo">
        <div class="doc-grupo-head">${esc(g.titulo)} <span class="doc-grupo-n">${g.docs.length}</span></div>
        ${g.docs.map((d) => docHTML(store, st, d, busca)).join("")}
      </div>`
    )
    .join("");
}

function agruparDocs(st, docs, modo) {
  if (modo === "nenhum") return [{ titulo: null, docs }];
  const grupos = new Map();
  for (const d of docs) {
    const t = d.topicoId ? st.topicos.find((x) => x.id === d.topicoId) : null;
    let nome;
    if (modo === "topico") {
      nome = t ? nomeTopico(st, t) : "Sem tópico";
    } else {
      const disc = t ? st.disciplinas.find((x) => x.id === t.disciplinaId) : null;
      nome = disc ? disc.nome : "Sem disciplina";
    }
    if (!grupos.has(nome)) grupos.set(nome, []);
    grupos.get(nome).push(d);
  }
  return [...grupos.entries()]
    .sort((a, b) => {
      const sa = /^Sem /.test(a[0]);
      const sb = /^Sem /.test(b[0]);
      if (sa !== sb) return sa ? 1 : -1;
      return a[0].localeCompare(b[0], "pt");
    })
    .map(([titulo, docs]) => ({ titulo, docs }));
}

function resultadosSemHTML(res) {
  if (!res.length) {
    return `<div class="muted small" style="margin-top:10px">Nada relevante encontrado. Tente outras palavras, ou indexe mais material.</div>`;
  }
  return `
    <div class="sem-res">
      ${res
        .map(
          (r, i) => `
        <div class="sem-item">
          <div class="sem-item-trecho">${realcarTermos(r.trecho.length > 320 ? r.trecho.slice(0, 320) + "…" : r.trecho, semQuery)}</div>
          <div class="sem-item-meta">
            <span class="tag-topico">${esc(r.origem)}</span>
            <span class="muted small">afinidade <span class="num">${(r.score * 100).toFixed(0)}%</span></span>
            <span class="spacer"></span>
            <button class="lnk" data-action="result-flashcards" data-idx="${i}" data-tip="Criar flashcards (IA) a partir deste trecho.">${icone("layers")} Flashcards</button>
            <button class="lnk" data-action="result-questoes" data-idx="${i}" data-tip="Criar questões (IA) a partir deste trecho.">${icone("notebook-pen")} Questões</button>
          </div>
        </div>`
        )
        .join("")}
    </div>`;
}

function formHTML(opcoesTopico) {
  return `
    <div class="card form-doc">
      <h3>Adicionar material</h3>
      <div class="form-row">
        <label style="flex:2">Título <input id="doc-titulo" type="text" placeholder="Ex.: Aula 3: Atos administrativos" /></label>
        <label style="flex:1">Tópico <select id="doc-top"><option value="">— sem tópico —</option>${opcoesTopico}</select></label>
      </div>
      <label class="btn btn-ghost btn-file" data-tip="PDF, imagem ou texto (.txt). Você também pode arrastar o arquivo para este cartão.">${icone("paperclip")} Selecionar arquivo
        <input id="doc-file" type="file" accept=".pdf,.txt,.md,.jpg,.jpeg,.png,.webp,application/pdf,text/plain,image/*" hidden />
      </label>
      <label>Conteúdo <textarea id="doc-texto" rows="6" placeholder="${esc("Cole aqui o conteúdo da aula (ou importe um arquivo acima).\nEx.: Atos administrativos são toda manifestação unilateral de vontade da Administração… Atributos: presunção de legitimidade, imperatividade, autoexecutoriedade…")}"></textarea></label>
      <div id="doc-estrutura"></div>
      <p class="muted small">De PDFs e imagens, o texto é extraído automaticamente. Páginas escaneadas ou com tabelas e organogramas ficam pendentes e podem ser processadas com a Visão (IA) quando você quiser (apenas nelas).</p>
      <p class="muted small">Importe apenas material que você tem direito de usar. O conteúdo fica só neste dispositivo. PDFs protegidos por senha/DRM não são abertos (o app não burla proteções).</p>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="cancelar-form">Cancelar</button>
        <button class="btn btn-primary" data-action="add-doc">Salvar na base</button>
      </div>
    </div>`;
}

// Janela modal "Adicionar material" — fluxo stateful (arquivo/colar → texto + estrutura
// editável → salvar). Diferente dos outros: o painel de estrutura re-renderiza
// CIRURGICAMENTE em #doc-estrutura (sem recriar o form, p/ não apagar título/texto),
// então NÃO uso o render-loop completo; uso abrirJanela + estado local `pend`.
// Os pendentes (pdf/img/paginas/estrutura) vivem em `pend` (não nos globais), p/ não
// interferir nos handlers inline de estrutura dos materiais JÁ SALVOS.
function abrirImportarMaterial(app) {
  const { store } = app;
  const st0 = store.get();
  const opcoesTopico = st0.topicos.map((t) => `<option value="${t.id}">${esc(nomeTopico(st0, t))}</option>`).join("");
  const pend = { pdf: null, img: null, paginas: null, estrutura: null };
  abrirJanela({
    titulo: "Adicionar material",
    corpoHTML: formHTML(opcoesTopico),
    aoMontar: (overlay, fechar) => {
      const corpo = overlay.querySelector(".mm-corpo");
      const reEstrutura = () => { const c = corpo.querySelector("#doc-estrutura"); if (c) c.innerHTML = pend.estrutura ? estruturaResumoHTML(pend.estrutura, store) : ""; };

      // ---- upload de arquivo (#doc-file): mesma lógica do importador inline antigo,
      // escopada ao corpo da janela e gravando em `pend`. ----
      const fileInput = corpo.querySelector("#doc-file");
      if (fileInput) {
        ligarDropZone(fileInput);
        const docStatus = document.createElement("span");
        docStatus.className = "import-status";
        (fileInput.closest("label") || fileInput).insertAdjacentElement("afterend", docStatus);
        fileInput.addEventListener("change", async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          const tituloEl = corpo.querySelector("#doc-titulo");
          if (!tituloEl.value) tituloEl.value = f.name.replace(/\.[^.]+$/, "");
          const iaOn = store.iaDisponivel();
          docStatus.className = "import-status lendo";
          docStatus.innerHTML = `<span class="import-spin">${icone("refresh-cw")}</span> <span class="import-nome"></span>`;
          const ehImgDoc = (f.type || "").startsWith("image/");
          docStatus.querySelector(".import-nome").textContent = `${f.name} — lendo${ehImgDoc && iaOn ? " com a IA" : ""}…`;
          try {
            let texto = "";
            pend.pdf = null; pend.img = null; pend.paginas = null; pend.estrutura = null;
            if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
              toast("Lendo PDF…");
              const ab = await f.arrayBuffer();
              if (ab.byteLength <= 50 * 1024 * 1024) pend.pdf = abToDataUrl(ab);
              else toast("PDF muito grande (>50MB): não será guardado para visualização; só o texto será mantido.", "erro");
              const { paginas: paginasBrutas, numPaginas, outline, linhasPorPagina } = await extrairPdfPaginas(new File([ab], f.name, { type: "application/pdf" }));
              const paginas = limparRuidoDePaginas(paginasBrutas);
              texto = paginas.map((p) => p.texto || "").join("\n\n").trim();
              try {
                const est = detectarEstrutura({ paginas: paginasBrutas, outline, numPaginas: numPaginas || paginasBrutas.length, linhasPorPagina });
                pend.estrutura = est && est.blocos.length ? est : null;
                if (pend.estrutura) store.casarEstruturaComEdital(pend.estrutura);
              } catch (_) { pend.estrutura = null; }
              reEstrutura();
              if ((!texto || texto.length < 40) && iaOn && f.size <= 14 * 1024 * 1024) {
                toast("PDF sem texto selecionável: lendo com a IA…");
                try {
                  const t = await extrairTextoArquivo(store.get().config, { dataB64: await arquivoParaBase64(f), mimeType: "application/pdf", nomeArquivo: f.name, contexto: "o conteúdo de um material de estudo (apostila, aula, artigo ou anotações): extraia o conteúdo de estudo na íntegra, na ordem de leitura" });
                  if (t && t.trim()) texto = t.trim();
                } catch (_) {}
              }
              const pendN = paginas.filter((p) => p.vazia).length;
              pend.paginas = pend.pdf ? paginas : null;
              corpo.querySelector("#doc-texto").value = texto;
              if (pendN) toast(`Texto extraído. ${plural(pendN, "página", "páginas")} sem texto: ficam pendentes de OCR (rode a Visão depois${iaOn ? "" : ", quando a IA estiver conectada"}).`, "ok");
              else toast("Texto extraído. Confira e salve.", "ok");
            } else if (ehImagem(f)) {
              pend.img = await fileToDataUrl(f);
              pend.paginas = [{ n: 1, texto: "", vazia: true, temImagem: true, ocr: false }];
              corpo.querySelector("#doc-texto").value = "";
              toast(iaOn ? "Imagem carregada. Salve e clique em “Processar com Visão” para extrair o texto." : "Imagem carregada. O texto será extraído por Visão quando você conectar a IA (fica pendente).", "ok");
            } else {
              texto = await f.text();
              corpo.querySelector("#doc-texto").value = texto;
              toast("Texto carregado. Confira e salve.", "ok");
            }
            docStatus.className = "import-status ok";
            docStatus.innerHTML = `${icone("check")} ${esc(f.name)} — pronto`;
          } catch (err) {
            console.error(err);
            docStatus.className = "import-status erro";
            docStatus.innerHTML = err.code === "PDF_PROTEGIDO" ? "PDF protegido — cole o texto." : `${icone("x")} ${esc(f.name)} — não consegui ler.`;
            toast(err.code === "PDF_PROTEGIDO" ? err.message : "Não consegui ler este arquivo. Confira se ele não está protegido por senha e tente de novo, ou cole o texto manualmente.", "erro");
          }
        });
      }

      bindActions(corpo, {
        "cancelar-form": () => fechar(),
        "add-doc": async () => {
          const titulo = corpo.querySelector("#doc-titulo").value.trim();
          const texto = corpo.querySelector("#doc-texto").value.trim();
          const topicoId = corpo.querySelector("#doc-top").value;
          if (!texto && !pend.pdf && !pend.img) return toast("O conteúdo está vazio.", "erro");
          if (!store.get().config.materialAvisoAceito) {
            const ok = await confirmar('Importe apenas material que você tem direito de usar (ex.: comprado por você). O conteúdo fica só neste dispositivo e o Mentor não o compartilha. Para compartilhar um backup, use a opção "sem materiais" em Configurações ▸ Dados. Continuar?');
            if (!ok) return;
            store.setConfig({ materialAvisoAceito: true });
          }
          if (pend.estrutura) lerEstruturaDoDOM(corpo, pend.estrutura);
          const existente = (pend.pdf || pend.img) ? store.acharDocPorTitulo(titulo) : null;
          if (existente) {
            const ok = await confirmar(`Já existe um material chamado "${titulo}". Atualizar ele com esta importação (mantém as questões/flashcards/marcações e os tópicos já confirmados)? Escolha Cancelar para criar um novo.`);
            if (ok) {
              store.atualizarMaterialDeImport(existente.id, { texto, paginas: pend.paginas, pdfData: pend.pdf, imgData: pend.img, estrutura: pend.estrutura });
              toast("Material atualizado (mesmo id; vínculos preservados).", "ok");
              fechar();
              app.refresh();
              return;
            }
          }
          const topsEstr = pend.estrutura ? [...new Set(pend.estrutura.blocos.map((b) => b.topicoId).filter(Boolean))] : [];
          const doc = store.addDocumento({
            titulo,
            texto,
            topicoId: topicoId || null,
            topicoIds: topsEstr.length ? topsEstr : topicoId ? [topicoId] : [],
            origem: "importado",
            pdfData: pend.pdf,
            imgData: pend.img,
            paginas: pend.paginas,
            estrutura: pend.estrutura,
          });
          if (doc && pend.estrutura) store.aplicarEstruturaAoMaterial(doc.id, pend.estrutura);
          if (store.get().config.descartarPdfAposImport && doc && (doc.pdfData || doc.imgData) && store.paginasPendentes(doc).length === 0) {
            store.descartarBinarioDoc(doc.id);
          }
          toast("Material adicionado à base.");
          fechar();
          app.refresh();
        },
        // Estrutura no contexto de IMPORTAÇÃO (sem data-doc): opera no `pend.estrutura`
        // e re-renderiza só o #doc-estrutura da janela (preserva título/texto digitados).
        "refinar-estrutura-ia": async (el) => {
          if (!store.iaDisponivel()) return avisoIA(app, "Refinar vínculos com IA");
          if (!pend.estrutura) return;
          el.disabled = true;
          el.textContent = "Refinando…";
          try {
            lerEstruturaDoDOM(corpo, pend.estrutura);
            await store.casarEstruturaComEditalIA(pend.estrutura);
            reEstrutura();
            toast("Vínculos refinados pela IA (confira).", "ok");
          } catch (e) {
            console.error(e);
            toast("A IA não conseguiu refinar agora. Tente de novo em instantes.", "erro");
            el.disabled = false;
            el.textContent = "Refinar vínculos (IA)";
          }
        },
        "estr-remover": (el) => {
          if (!pend.estrutura) return;
          const i = parseInt(el.getAttribute("data-i"), 10);
          lerEstruturaDoDOM(corpo, pend.estrutura);
          pend.estrutura.blocos.splice(i, 1);
          reEstrutura();
        },
        "estr-thumb": async (el) => {
          const i = el.getAttribute("data-i");
          const pag = parseInt(el.getAttribute("data-pag"), 10);
          const host = corpo.querySelector(`.estr-thumb-host[data-i="${i}"]`);
          if (!host) return;
          if (host.dataset.aberto === "1") { host.innerHTML = ""; host.dataset.aberto = "0"; return; }
          if (!pend.pdf) { host.innerHTML = `<span class="muted small">PDF não guardado (não dá para pré-visualizar).</span>`; return; }
          host.innerHTML = `<span class="muted small">carregando página ${pag}…</span>`;
          host.dataset.aberto = "1";
          try {
            const [img] = await rasterizarPaginas(pend.pdf, [pag], 1.4);
            host.innerHTML = img ? `<img class="estr-thumb-img" src="${img.dataUrl}" alt="página ${pag}" />` : `<span class="muted small">página ${pag} indisponível.</span>`;
          } catch (_) { host.innerHTML = `<span class="muted small">não consegui renderizar a página.</span>`; }
        },
      });
    },
  });
}

function docHTML(store, st, d, busca) {
  const topicosDoc = (d.topicoIds && d.topicoIds.length ? d.topicoIds : d.topicoId ? [d.topicoId] : [])
    .map((id) => st.topicos.find((t) => t.id === id))
    .filter(Boolean);
  const topico = topicosDoc[0] || null; // primário (para "Praticar este tópico")
  const aberto = abertoId === d.id;
  const pend = store.paginasPendentes(d).length;
  // Trecho com a palavra buscada em destaque (só quando o match está no conteúdo).
  const trecho = busca && busca.trim().length >= 2 ? trechoBusca(d.texto || "", busca.trim()) : "";
  return `
    <div class="card doc-item" data-foco-id="${d.id}">
      <div class="doc-head">
        <span class="doc-titulo" data-action="abrir" data-id="${d.id}" role="button" tabindex="0" title="Ver/ocultar o texto extraído">${esc(d.titulo)}</span>
        <div class="doc-meta">
          ${topicosDoc.map((t) => { const pg = d.topicoPaginas && d.topicoPaginas[t.id]; return `<span class="tag-topico">${esc(nomeTopico(st, t))}${pg ? ` <span class="tag-pag">págs. ${pg[0]}–${pg[1]}</span>` : ""}</span>`; }).join("")}
          ${pend ? `<span class="tag-ocr">${icone("hourglass")} ${pend} pág. p/ OCR</span>` : ""}
          ${d.binarioDescartado ? `<span class="muted small" data-tip="O PDF original foi descartado; o texto extraído foi mantido." data-tip-pos="cima-dir">${icone("file-text")} PDF descartado</span>` : ""}
          <button class="lnk doc-acao-primaria" data-action="abrir" data-id="${d.id}">${aberto ? `${icone("chevron-down")} ocultar texto` : `${icone("chevron-right")} ver texto extraído`}</button>
          <details class="doc-mais">
            <summary class="lnk" data-tip-pos="cima-dir" data-tip="Mais ações para este material.">${icone("ellipsis")}</summary>
            <div class="doc-mais-pop" role="menu">
              <button class="menu-item" data-action="editar-topicos" data-id="${d.id}" data-tip="Escolher à mão quais tópicos do edital este material cobre." data-tip-pos="cima-esq"><span class="menu-ico">${icone("link")}</span> ${topicosDoc.length ? "Editar tópicos vinculados" : "Vincular tópicos (à mão)"}</button>
              ${(d.texto || "").trim() ? `<button class="menu-item" data-action="toggle-marcar" data-id="${d.id}" data-tip="Grifar o texto (palavras-chave, prazos/valores, restritivas). O grifo de palavras-chave vira a fonte da revisão de tópico." data-tip-pos="cima-esq">${marcarAberto.has(d.id) ? `${icone("check")} marcando` : `${icone("square-pen")} marcar`}</button>` : ""}
              ${(d.texto || "").trim() ? `<button class="menu-item" data-action="detectar-topicos" data-id="${d.id}" data-tip="A IA lê o material e sugere quais tópicos do edital ele aborda (você confere)." data-tip-pos="cima-esq">${icone("search")} Detectar tópicos (IA)</button>` : ""}
              ${(d.paginas || []).length ? `<button class="menu-item" data-action="redetectar-estrutura" data-id="${d.id}" data-tip="Refaz o sumário a partir do texto atual (útil após OCR ou se a detecção saiu ruim). Mantém os tópicos já confirmados." data-tip-pos="cima-esq">${icone("files")} Re-detectar estrutura</button>` : ""}
              ${
                (d.texto || "").trim()
                  ? `<div class="menu-sep"></div>
                     <button class="menu-item" data-action="doc-flashcards" data-id="${d.id}" data-tip="A IA CRIA flashcards (frente/verso) a partir do conteúdo deste material." data-tip-pos="cima-esq"><span class="menu-ico">${icone("layers")}</span> Flashcards</button>
                     <button class="menu-item" data-action="doc-questoes" data-id="${d.id}" data-tip="A IA gera questões de múltipla escolha novas a partir do conteúdo." data-tip-pos="cima-esq"><span class="menu-ico">${icone("notebook-pen")}</span> Questões (múltipla escolha)</button>
                     <button class="menu-item" data-action="doc-questoes-ce" data-id="${d.id}" data-tip="A IA GERA afirmações Certo/Errado novas a partir do conteúdo." data-tip-pos="cima-esq"><span class="menu-ico">${icone("check")}</span> Questões Certo/Errado</button>
                     <button class="menu-item" data-action="doc-extrair" data-id="${d.id}" data-tip="TRANSCREVE as questões que JÁ existem no material (ex.: 'Questões Comentadas'), com o gabarito quando está no texto (). Não inventa." data-tip-pos="cima-esq"><span class="menu-ico">${icone("clipboard-list")}</span> Extrair questões do material</button>
                     <button class="menu-item" data-action="doc-mapa" data-id="${d.id}" data-tip="A IA monta um mapa mental do conteúdo deste material." data-tip-pos="cima-esq"><span class="menu-ico">${iconMapa}</span> Mapa mental</button>`
                  : ""
              }
              ${d.pdfData ? `<div class="menu-sep"></div>
                <button class="menu-item" data-action="ler-pdf" data-id="${d.id}" data-tip="Abre o PDF original no leitor interno (com zoom e navegação por página)." data-tip-pos="cima-esq">ler PDF</button>
                <button class="menu-item" data-action="abrir-pdf" data-id="${d.id}" data-tip="Abre o PDF original numa nova aba do navegador." data-tip-pos="cima-esq">abrir PDF em nova aba</button>
                <button class="menu-item menu-item-danger" data-action="descartar-pdf" data-id="${d.id}" data-tip="Apaga só o arquivo PDF para liberar espaço; o texto extraído e a estrutura permanecem." data-tip-pos="cima-esq">descartar PDF original</button>` : ""}
              <div class="menu-sep"></div>
              <button class="menu-item menu-item-danger" data-action="del-doc" data-id="${d.id}">${icone("x")} Remover material</button>
            </div>
          </details>
        </div>
      </div>
      ${trecho ? `<div class="doc-snippet">${realcar(esc(trecho), busca.trim())}</div>` : ""}
      ${topicosDocAberto === d.id ? topicosEditorHTML(st, d) : ""}
      ${detectDoc === d.id ? detectPainelHTML() : ""}
      ${
        marcarAberto.has(d.id)
          ? (() => {
              const pgs = (d.paginas || []).filter((p) => (p.texto || "").trim());
              const porPagina = pgs.length > 1;
              const pageSel = porPagina
                ? `<label class="inline small" style="margin-bottom:6px">${icone("file-text")} Página:
                    <select class="mk-pagina-sel" data-id="${d.id}" style="width:auto; margin-left:6px">
                      ${pgs.map((p) => `<option value="${p.n}" ${String(marcarPagina[d.id] || pgs[0].n) === String(p.n) ? "selected" : ""}>${p.n}${p.temImagem ? " (fig.)" : ""}</option>`).join("")}
                    </select>
                    <span class="muted">de ${pgs.length} · grife página por página (vira fonte da revisão)</span>
                   </label>`
                : "";
              return `<div class="doc-marcar">
                <div class="muted small" style="margin-bottom:6px">${icone("square-pen")} Marcação sobre o <b>texto extraído</b>. Use “Auto” (prazos/restritivas), “IA sugere” e o pincel.</div>
                ${pageSel}
                <div class="mk-host" data-mk-host="${d.id}"></div>
              </div>`;
            })()
          : aberto
            ? `${ocrPainelHTML(store, d)}
               ${
                 d.estrutura && d.estrutura.blocos && d.estrutura.blocos.length
                   ? estruturaEditando.has(d.id)
                     ? `${estruturaResumoHTML(d.estrutura, store, d.id)}
                        <button class="btn btn-ghost btn-sm" data-action="estr-edit-toggle" data-id="${d.id}" style="margin-top:6px">${icone("check")} concluir revisão da estrutura</button>`
                     : `<div class="sum-toolbar" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
                          <button class="btn btn-ghost btn-sm" data-action="estr-edit-toggle" data-id="${d.id}" data-tip="Editar títulos, tópicos e páginas dos blocos.">${icone("square-pen")} revisar estrutura</button>
                          <button class="btn btn-ghost btn-sm" data-action="texto-bruto-toggle" data-id="${d.id}">${textoBrutoAberto.has(d.id) ? "ver sumário" : "ver texto bruto"}</button>
                        </div>
                        ${
                          textoBrutoAberto.has(d.id)
                            ? `<div class="doc-corpo"><div class="muted small" style="margin-bottom:6px">${icone("file-text")} Texto bruto completo (alimenta busca e IA).</div>${esc(d.texto) || "<i>vazio</i>"}</div>`
                            : sumarioNavegavelHTML(d, store)
                        }`
                   : `<div class="doc-corpo">
                        <div class="muted small" style="margin-bottom:6px">${icone("file-text")} Texto extraído do material — é o que alimenta a <b>busca</b> e a <b>IA</b> (não precisa estar bonito).</div>
                        ${esc(d.texto) || "<i>vazio</i>"}
                      </div>`
               }
               ${topico ? `<button class="btn btn-ghost btn-sm" data-action="ir-pratica" data-top="${topico.id}">Praticar este tópico →</button>` : ""}`
            : ""
      }
    </div>`;
}

// Editor dos tópicos que um material COBRE (Fase 1: muitos‑para‑muitos). Uma aula pode
// cobrir vários assuntos — marque todos. Aplica na hora (sem botão de salvar).
function topicosEditorHTML(st, d) {
  const sel = new Set(d.topicoIds && d.topicoIds.length ? d.topicoIds : d.topicoId ? [d.topicoId] : []);
  const maxPag = (d.paginas || []).length || 9999;
  const grupos = st.disciplinas
    .map((disc) => {
      const tops = st.topicos.filter((t) => t.disciplinaId === disc.id);
      if (!tops.length) return "";
      return `<div class="ft-grupo"><div class="ft-disc"><b>${esc(disc.nome)}</b></div>
        ${tops
          .map((t) => {
            const checked = sel.has(t.id);
            const pg = d.topicoPaginas && d.topicoPaginas[t.id];
            // Fase 6: quando o tópico está marcado, dá para dizer QUAIS páginas o cobrem.
            const pagInputs = checked
              ? ` <span class="doc-pag-wrap muted small">págs <input type="number" class="doc-pag" data-doc="${d.id}" data-topico="${t.id}" data-end="ini" min="1" max="${maxPag}" value="${pg ? pg[0] : ""}" />–<input type="number" class="doc-pag" data-doc="${d.id}" data-topico="${t.id}" data-end="fim" min="1" max="${maxPag}" value="${pg ? pg[1] : ""}" /> <span class="muted">(vazio = tudo)</span></span>`
              : "";
            return `<label class="ft-top"><input type="checkbox" class="doc-top-chk" data-doc="${d.id}" value="${t.id}" ${checked ? "checked" : ""} /> ${esc(t.nome)}${pagInputs}</label>`;
          })
          .join("")}
      </div>`;
    })
    .join("");
  return `<div class="card doc-top-editor">
    <div class="muted small" style="margin:0 0 8px">${icone("files")} <b>Tópicos que este material cobre</b> — marque todos (uma aula pode cobrir vários). Em cada um, opcionalmente diga <b>quais páginas</b> o cobrem (deixe vazio = a aula inteira). Salva automaticamente.</div>
    ${grupos || `<p class="muted small" style="margin:0">Nenhum tópico cadastrado. Adicione no Edital.</p>`}
    <div class="form-acoes"><button class="btn btn-ghost btn-sm" data-action="editar-topicos" data-id="${d.id}">Fechar</button></div>
  </div>`;
}

// Painel "detectar tópicos" (precisão por página, dir.2): tópicos do edital abordados → revisão.
function detectPainelHTML() {
  if (detectando) return `<div class="card detect-painel"><p class="muted small" style="margin:0">${icone("search")} A IA está lendo o material e detectando os tópicos…</p></div>`;
  const res = detectResultado || [];
  return `<div class="card detect-painel">
    <h3 style="margin:0 0 4px">${icone("search")} Tópicos detectados no material</h3>
    ${
      res.length
        ? `<p class="muted small" style="margin:0 0 8px">A IA identificou estes tópicos do edital. Marque os que quer colocar na <b>curva de revisão</b> (você confirma):</p>
           <ul class="detect-lista">
             ${res
               .map(
                 (x, i) => `<li class="detect-item">
                   <input type="checkbox" class="detect-cb" data-i="${i}" checked />
                   <span class="detect-nome">${esc(x.topico.nome)}</span>
                   ${x.paginas.length ? `<span class="muted small">págs. ${x.paginas.join(", ")}</span>` : ""}
                 </li>`
               )
               .join("")}
           </ul>
           <div class="form-acoes">
             <button class="btn btn-ghost btn-sm" data-action="detect-fechar">Fechar</button>
             <button class="btn btn-ghost btn-sm" data-action="detect-vincular" data-tip="Vincula os tópicos marcados a este material (ele passa a cobrir todos).">${icone("link")} Vincular ao material</button>
             <button class="btn btn-primary btn-sm" data-action="detect-agendar">Agendar revisão dos selecionados</button>
           </div>`
        : `<p class="muted small" style="margin:0">Nenhum tópico do edital foi detectado neste material. <button class="lnk" data-action="detect-fechar">Fechar</button></p>`
    }
  </div>`;
}

// Painel de OCR/Visão dentro do documento aberto.
function ocrPainelHTML(store, d) {
  const iaOn = store.iaDisponivel();
  // Binário descartado: sem visualizador/OCR (o texto extraído foi mantido).
  if (d.binarioDescartado) {
    return `<div class="ocr-painel"><p class="muted small" style="margin:0">${icone("search")} Visualizador e OCR por página indisponíveis: o PDF original foi descartado. O texto extraído foi mantido.</p></div>`;
  }
  // Material antigo (sem estrutura de páginas) mas com PDF salvo: oferecer reanálise.
  if (!Array.isArray(d.paginas)) {
    if (!d.pdfData) return "";
    return `
      <div class="ocr-painel">
        <div class="ocr-titulo">${icone("search")} Reconhecimento de imagem (OCR/Visão)</div>
        <p class="muted small">Prepare as páginas para poder reprocessar com Visão as que têm tabela/organograma ou estão escaneadas.</p>
        <button class="btn btn-ghost btn-sm" data-action="detectar-paginas" data-id="${d.id}">Analisar páginas (OCR/Visão)</button>
      </div>`;
  }
  const pend = d.paginas.filter((p) => p.vazia && !p.ocr);
  const feitas = d.paginas.filter((p) => p.ocr).length;
  const lista = (arr) => arr.map((p) => p.n).join(", ");

  let blocos = "";
  // 1) Páginas escaneadas/sem texto — detecção CONFIÁVEL; processa em lote.
  if (pend.length) {
    blocos += `
      <div class="ocr-linha">
        <span>${icone("hourglass")} <b>${pend.length}</b> ${pend.length === 1 ? "página escaneada" : "páginas escaneadas"}/sem texto (pág. ${lista(pend)})</span>
        ${
          iaOn
            ? `<button class="btn btn-primary btn-sm" data-action="ocr-doc" data-id="${d.id}">${icone("search")} Processar com Visão (${pend.length} req.)</button>`
            : `<span class="muted small">Conecte o Gemini em Configurações para processar (fica pendente até lá).</span>`
        }
      </div>`;
  }
  // 2) Controle MANUAL por página — para tabela/organograma cujo texto saiu
  //    embaralhado (1 página = 1 requisição). Não roda em tudo à toa.
  blocos += `
      <div class="ocr-linha">
        <span>Tabela ou organograma com texto fora de ordem? Reprocesse <b>uma</b> página:</span>
        ${
          iaOn
            ? `<select class="ocr-pag-sel" data-id="${d.id}" aria-label="Página para Visão">
                 ${d.paginas.map((p) => `<option value="${p.n}">página ${p.n}${p.temImagem ? " figura" : ""}${p.ocr ? " (Visão)" : ""}</option>`).join("")}
               </select>
               <button class="btn btn-ghost btn-sm" data-action="ocr-pagina-sel" data-id="${d.id}" data-tip-pos="cima-dir" data-tip="Substitui o texto da página escolhida pela transcrição da Visão (tabelas em Markdown, organogramas descritos).">${icone("search")} Visão nesta página</button>`
            : `<span class="muted small">Conecte o Gemini em Configurações para usar a Visão.</span>`
        }
      </div>
      <div class="ocr-linha muted small">${icone("image")} marca páginas com figura/tabela grande. Logos de cabeçalho são ignorados de propósito.</div>`;
  if (feitas) {
    blocos += `<div class="ocr-linha"><span>${icone("check")} ${plural(feitas, "página transcrita", "páginas transcritas")} por Visão ${seloBadge("amarelo")} (confira o texto abaixo).</span></div>`;
  }

  return `
    <div class="ocr-painel">
      <div class="ocr-titulo">${icone("search")} Reconhecimento de imagem (OCR/Visão)</div>
      ${blocos}
    </div>`;
}

function nomeTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
