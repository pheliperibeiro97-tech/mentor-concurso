// Base documental: importar conteúdo das aulas (PDF em blocos, foto/escaneado, .txt
// ou texto colado), visualizar, vincular a tópico e buscar (busca textual; semântica
// fica na v2).
//
// OCR/Visão (econômico): o texto sai SEMPRE do pdf.js (grátis, offline). A Visão do
// Gemini só entra nas PÁGINAS-LACUNA (sem camada de texto) e SOB CLIQUE — nunca
// transcreve o PDF inteiro. Offline, as páginas sem texto ficam como pendência
// registrada até a IA estar conectada.
import { bindActions, toast, toastCarregando, header, seloBadge, vazio, confirmar, escolher, avisoIA, ligarDropZone, focarItem, pedirNumero, faixaIA, abrirJanela, iconMapa, plural, comOcupado } from "../ui.js";
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
    // F1 — marca d'água personalizada: linha "rótulo: valor" de dado pessoal, ou dado solto.
    // Conservador (só rótulo:valor ou CPF/e-mail isolado) → não remove conteúdo em prosa.
    if (t.length <= 90 && /^(cpf|cnpj|telefone|tel|e-?mail|e_?mail|nome|matr[íi]cula|aluno|assinante|login|usu[áa]rio)\s*[:\-]/i.test(t)) return true;
    if (/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(t)) return true; // CPF solto na linha
    if (/^[\w.+-]+@[\w-]+\.[\w.-]{2,}$/.test(t)) return true; // e-mail solto na linha
    return arr.length >= 3 && t.length <= 80 && (freq[norm(t)] || 0) >= corte;
  };
  return arr.map((p) => ({
    ...p,
    texto: (p.texto || "").split(/\r?\n/).filter((l) => !ehRuido(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  }));
}

// Mini-diálogo de FAIXA DE PÁGINAS (de–até) para gerar/extrair de um trecho por número de página.
// Devolve { de, ate } (validado, 1..maxPag) ou null se cancelar.
function pedirFaixaPaginas(maxPag) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-msg">Gerar de quais páginas? (1–${maxPag})</p>
        <div class="num-linha" style="gap:8px">
          Da página <input class="fp-de num-input" type="number" min="1" max="${maxPag}" value="1" style="width:80px" />
          até <input class="fp-ate num-input" type="number" min="1" max="${maxPag}" value="${maxPag}" style="width:80px" />
        </div>
        <div class="modal-acoes">
          <button class="btn btn-ghost" data-c="cancel">Cancelar</button>
          <button class="btn btn-primary" data-c="ok">Gerar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const fechar = (v) => { ov.remove(); resolve(v); };
    const ler = () => {
      let de = parseInt(ov.querySelector(".fp-de").value, 10);
      let ate = parseInt(ov.querySelector(".fp-ate").value, 10);
      if (isNaN(de) || isNaN(ate)) return null;
      de = Math.max(1, Math.min(maxPag, de));
      ate = Math.max(de, Math.min(maxPag, ate));
      return { de, ate };
    };
    ov.addEventListener("click", (e) => {
      if (e.target === ov || e.target.closest('[data-c="cancel"]')) return fechar(null);
      if (e.target.closest('[data-c="ok"]')) return fechar(ler());
    });
    ov.querySelector(".fp-de").focus();
  });
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
let ocrAberto = new Set(); // docIds com a ferramenta manual de Visão por página aberta (via menu)
let ocrEmCurso = false;
let semQuery = ""; // busca semântica
let semResultados = null; // null = ainda não buscou; [] = buscou e nada
let semBuscando = false;
// Fase 6 — Materiais indexa só material/resumo; Lei Seca/Jurisprudência têm índice no próprio módulo.
const SEM_ESCOPO_MAT = { tipos: ["material", "resumo"] };

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
          <button class="prev-remover" data-action="estr-remover" data-i="${i}"${dAttr} data-tip="Remover este tópico do material">${icone("x")}</button>
        </div>
        <div class="estr-edit-l2">
          <label class="inline small">Tópico <select class="estr-topico" data-i="${i}"${dAttr}>${topOpts(b.topicoId)}</select></label>
          <label class="inline small">págs <input type="number" min="1" class="estr-pini" data-i="${i}"${dAttr} value="${b.pIni || ""}" />–<input type="number" min="1" class="estr-pfim" data-i="${i}"${dAttr} value="${b.pFim || ""}" /></label>
          ${tipoTag}
          <button class="lnk" data-action="estr-thumb" data-i="${i}" data-pag="${b.pIni}"${dAttr} data-tip="Ver a página inicial deste tópico">${icone("eye")} pág. ${b.pIni}</button>
        </div>
        <div class="estr-thumb-host" data-i="${i}"></div>
      </li>`;
    })
    .join("");
  // aulaTitulo às vezes é ruído (marca d'água "111", número solto) — só exibe se parecer um título real.
  const aulaTit = est.aulaTitulo && !/^[\d\s.\-–]+$/.test(est.aulaTitulo) && est.aulaTitulo.length >= 4 ? est.aulaTitulo : "";
  const aula = est.aulaNome ? ` · aula do cursinho: <b>${esc(est.aulaNome)}</b>` : (aulaTit ? ` · ${esc(aulaTit)}` : "");
  const baixaConf = est.blocos.filter((b) => (b.confianca || 1) < 0.6).length;
  const avisoConf = baixaConf ? ` · <span class="estr-aviso">${icone("triangle-alert")} ${baixaConf} a conferir</span>` : "";
  const refino = store && store.iaDisponivel()
    ? `<button class="btn btn-ghost btn-sm" data-action="refinar-estrutura-ia"${dAttr} data-tip="A IA casa cada título com o tópico do edital (manda só os títulos).">${icone("sparkles")} Refinar vínculos (IA)</button>`
    : "";
  const temPdf = docId && st && ((st.documentos || []).find((x) => x.id === docId) || {}).pdfData;
  const caprichar = temPdf && store.iaDisponivel()
    ? `<button class="btn btn-ghost btn-sm" data-action="caprichar-estrutura" data-doc="${docId}" data-tip="A IA relê a página do sumário (imagem) e reconstrói os tópicos com fidelidade.">${icone("wand-sparkles")} Refazer tópicos pelo sumário (IA)</button>`
    : "";
  const aplicar = docId
    ? `<button class="btn btn-primary btn-sm" data-action="aplicar-estrutura" data-doc="${docId}" data-tip="Vincula o material aos tópicos do sumário (com as faixas de página).">${icone("check")} Aplicar tópicos ao material</button>`
    : `<span class="muted small">Os tópicos são aplicados ao salvar o material.</span>`;
  const nB = est.blocos.length;

  // MODO "PRONTO" (import, sem docId): lista LIMPA e legível dos tópicos, com o editor técnico
  // (título/tópico/páginas/miniatura/confiança) recolhido em "Ajustar (avançado)". Reduz o ruído
  // que o usuário apontou ("tópicos feios na importação") sem perder a edição fina.
  if (!docId) {
    const listaLimpa = est.blocos
      .map((b) => {
        const ind = "margin-left:" + ((b.nivel || 1) - 1) * 14 + "px";
        const tag = b.tipo !== "teoria" ? ` <span class="mini-tag">${esc(b.tipo)}${b.banca ? " " + esc(b.banca) : ""}</span>` : "";
        const pg = b.pIni ? `<span class="estr-prev-pg">${b.pFim && b.pFim > b.pIni ? `págs ${b.pIni}–${b.pFim}` : `pág. ${b.pIni}`}</span>` : "";
        const dot = (b.confianca || 1) < 0.6 ? `<span class="estr-aviso" data-tip="Baixa confiança — confira no avançado.">${icone("triangle-alert")}</span>` : "";
        return `<li class="estr-prev-item" style="${ind}">
          <span class="estr-num">${esc(b.numero || "")}</span>
          <span class="estr-prev-t">${esc(b.titulo)}</span>${tag}${dot}${pg}
        </li>`;
      })
      .join("");
    return `<div class="estr-card estr-pronto">
      <div class="estr-pronto-head">${icone("list-tree")} Sumário: <b>${nB}</b> ${nB === 1 ? "tópico do material" : "tópicos do material"}${aula} <span class="muted small">(${esc(rotuloOrigem(est.origem))})</span>${avisoConf}</div>
      <ul class="estr-preview">${listaLimpa}</ul>
      <details class="estr-avancado">
        <summary>${icone("sliders-horizontal")} Ajustar tópicos (avançado)</summary>
        <p class="muted small u-mt-8 u-mb-8">Ajuste título, tópico do edital e faixa de páginas; remova o que não quiser. ${icone("eye")} confere a página.</p>
        <ul class="estr-lista">${linhas}</ul>
        ${refino ? `<div class="estr-acoes u-mt-8 u-flex u-wrap">${refino}</div>` : ""}
      </details>
      <p class="muted small u-mt-8">Os tópicos são aplicados ao salvar o material.</p>
    </div>`;
  }

  // MODO COMPLETO (card do material salvo): editor técnico direto, com aplicar/caprichar.
  return `<details class="estr-card" open>
    <summary>${icone("files")} Sumário — <b>${nB}</b> ${nB === 1 ? "tópico do material" : "tópicos do material"} · ${comTopico}/${nB} vinculado${comTopico === 1 ? "" : "s"} ao edital${aula}${avisoConf} <span class="muted small">(${esc(rotuloOrigem(est.origem))})</span></summary>
    <p class="muted small u-mt-8 u-mb-8">Revise: ajuste título, tópico e páginas, remova o que não quiser. Toque ${icone("eye")} para conferir a página.</p>
    <ul class="estr-lista">${linhas}</ul>
    <div class="estr-acoes u-mt-8 u-flex u-wrap">${caprichar}${refino}${aplicar}</div>
  </details>`;
}

// Rótulo amigável de como a estrutura foi detectada.
function rotuloOrigem(o) {
  return { "ia-sumario": "sumário lido pela IA", indice: "Índice/Sumário", outline: "marcadores do PDF", numeracao: "numeração das seções", marcador: "marcadores #NN", fonte: "tamanho de fonte" }[o] || o || "";
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

// Dias até uma data ISO (yyyy-mm-dd), em relação a hoje. Negativo = atrasada.
function diasAteISO(iso) {
  if (!iso) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(iso + "T00:00:00");
  return Math.round((alvo - hoje) / 86400000);
}
// Rótulo curto do estado de revisão de um tópico (ou "" se não agendado).
function rotuloRevisao(st, topicoId) {
  if (!topicoId) return "";
  const r = (st.revisoesTopico || []).find((x) => x.topicoId === topicoId);
  if (!r) return "";
  const d = diasAteISO(r.proxima);
  const txt = d == null ? "revisão agendada" : d < 0 ? "revisão atrasada" : d === 0 ? "revisar hoje" : `revisão em ${d} d`;
  return `<span class="sum-rev-badge ${d != null && d <= 0 ? "due" : ""}" data-tip="Revisão espaçada deste tópico (Central de Revisões).">${icone("repeat")} ${txt}</span>`;
}

// F4: "ver texto extraído" como SUMÁRIO NAVEGÁVEL, estilo Lei Seca — ÁRVORE recolhível aninhada por
// nível (pais contêm filhos). Cada seção: lê o trecho daquelas páginas, gera deste bloco, e ENTRA na
// REVISÃO POR TÓPICOS (revisão espaçada). Botão "abrir pág." leva ao PDF na página.
function sumarioNavegavelHTML(d, store) {
  const st = store.get();
  const nomeTop = (id) => { if (!id) return null; const t = st.topicos.find((x) => x.id === id); return t ? nomeTopico(st, t) : null; };
  const temIA = store.iaDisponivel();
  const blocos = d.estrutura.blocos || [];

  // Aninha a lista plana por `nivel`: um bloco é filho do último bloco de nível menor.
  const nodes = blocos.map((b, i) => ({ b, i, filhos: [] }));
  const raiz = [], pilha = [];
  for (const nd of nodes) {
    const niv = nd.b.nivel || 1;
    while (pilha.length && (pilha[pilha.length - 1].b.nivel || 1) >= niv) pilha.pop();
    if (pilha.length) pilha[pilha.length - 1].filhos.push(nd); else raiz.push(nd);
    pilha.push(nd);
  }

  const render = (nd) => {
    const { b, i } = nd;
    const tn = nomeTop(b.topicoId);
    const tipoTag = b.tipo !== "teoria" ? `<span class="mini-tag">${esc(b.tipo)}${b.banca ? " " + esc(b.banca) : ""}</span>` : "";
    const verPdf = d.pdfData ? `<button class="lnk" data-action="ler-pdf-pag" data-id="${d.id}" data-pag="${b.pIni}" data-tip="Abrir esta página no PDF">${icone("file-text")} abrir pág. ${b.pIni}</button>` : "";
    const ehQuestoes = b.tipo === "questoes" || b.tipo === "lista";
    const gerar = temIA
      ? `<details class="doc-mais sum-gerar-menu">
           <summary class="lnk" data-tip="Gera a partir DESTE conteúdo (págs. ${b.pIni}–${b.pFim}).">${icone("sparkles")} Gerar deste tópico ${icone("chevron-down")}</summary>
           <div class="doc-mais-pop" role="menu">
             <button class="menu-item" data-action="bloco-flashcards" data-id="${d.id}" data-bi="${i}">${icone("layers")} Flashcards</button>
             <button class="menu-item" data-action="bloco-questoes" data-id="${d.id}" data-bi="${i}">${icone("notebook-pen")} Questões</button>
             <button class="menu-item" data-action="bloco-questoes-ce" data-id="${d.id}" data-bi="${i}">${icone("check")} Questões C/E</button>
             <button class="menu-item" data-action="bloco-mapa" data-id="${d.id}" data-bi="${i}">${iconMapa} Mapa mental</button>
             ${ehQuestoes ? `<button class="menu-item" data-action="bloco-extrair" data-id="${d.id}" data-bi="${i}" data-tip="Extrai as questões já prontas deste tópico do material (não inventa).">${icone("clipboard-list")} Extrair questões prontas</button>` : ""}
           </div>
         </details>`
      : "";
    // Revisão por tópicos: só quando o bloco está vinculado a um tópico do edital.
    const revBtn = b.topicoId
      ? `<button class="lnk" data-action="sum-revisar-topico" data-top="${b.topicoId}" data-tip="Programa uma revisão espaçada deste tópico (aparece na Central de Revisões).">${icone("repeat")} Revisar este tópico</button>`
      : "";
    const aviso = (b.confianca || 1) < 0.6 ? `<span class="estr-aviso" data-tip="Baixa confiança — confira no Sumário (menu do material).">${icone("triangle-alert")}</span> ` : "";
    const filhosHTML = nd.filhos.length ? `<div class="sum-filhos">${nd.filhos.map(render).join("")}</div>` : "";
    return `<details class="sum-bloco" data-niv="${b.nivel || 1}">
      <summary>${icone("chevron-right")}<span class="estr-num">${esc(b.numero || "")}</span> ${aviso}<span class="sum-titulo">${esc(b.titulo)}</span> <span class="muted small">p.${b.pIni}–${b.pFim}</span> ${tipoTag} ${tn ? `<span class="estr-top">→ ${esc(tn)}</span>` : ""} ${rotuloRevisao(st, b.topicoId)}</summary>
      <div class="sum-corpo">
        <div class="sum-corpo-acoes">${verPdf}${revBtn}${gerar}</div>
        <div class="doc-corpo">${esc(textoDoBloco(d, b)) || "<i>vazio</i>"}</div>
        ${filhosHTML}
      </div>
    </details>`;
  };

  const temTopicos = blocos.some((b) => b.topicoId);
  const revTodos = temTopicos
    ? `<button class="btn btn-ghost btn-sm" data-action="sum-revisar-todos" data-id="${d.id}" data-tip="Programa revisão espaçada de todos os tópicos vinculados deste material.">${icone("repeat")} Programar revisão dos tópicos</button>`
    : "";
  // Estrutura de método ANTIGO (pré-Vision): oferece refazer pela IA do sumário — resolve materiais
  // importados antes, cujos "tópicos" saíram como números/ruído. Sugere, não executa sozinho.
  const estruturaAntiga = d.estrutura.origem && d.estrutura.origem !== "ia-sumario" && d.pdfData && store.iaDisponivel()
    ? `<div class="sum-nudge">
         ${icone("wand-sparkles")}
         <span>Este sumário foi montado por um método antigo (por ${esc(rotuloOrigem(d.estrutura.origem))}) e pode ter saído com números/ruído no lugar dos tópicos. Deixe a IA reler o sumário do próprio PDF.</span>
         <button class="btn btn-primary btn-sm" data-action="caprichar-estrutura" data-doc="${d.id}">${icone("wand-sparkles")} Refazer tópicos pelo sumário (IA)</button>
       </div>`
    : "";
  return `<div class="sum-nav">
    <div class="sum-nav-head">
      <span class="muted small">${icone("list-tree")} Sumário — selecione um tópico para ler o trecho e revisar por partes.</span>
      ${revTodos}
    </div>
    ${estruturaAntiga}
    ${raiz.map(render).join("")}
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
            texto: "Cada material vira <b>flashcards</b> e <b>questões</b> com a IA, pelo botão <b>Gerar com IA</b> da aula.",
            key: "materiais-gerar",
          })
        : ""
    }

    <details class="card buscas-card buscas-recolhida"${busca || semResultados !== null ? " open" : ""}>
      <summary class="buscas-summary">${icone("search")} Buscar nos materiais</summary>
      <div class="buscas-corpo">
        <div class="field"><span class="field-ico">${icone("search")}</span><input id="busca" type="search" placeholder="Busque por palavra exata, ou por significado (IA) no botão abaixo…" value="${esc(busca)}" class="busca-input has-ico" /></div>
        <p class="muted small u-mt-8 u-mb-8">Filtra os materiais conforme você digita (palavra em destaque). Para buscar por <b>significado</b>, use o botão abaixo.</p>
        ${buscaSemanticaHTML(store)}
      </div>
    </details>

    <div class="barra-acoes">
      <button class="btn btn-add btn-sm" data-action="toggle-form" data-tip-pos="cima-esq" data-tip="Adicionar uma aula ou conteúdo à sua base de estudo.">${icone("plus")} Adicionar material</button>
      <span class="spacer"></span>
      ${filtroTopicosBotaoHTML(st, filtroTop.sel, filtroTop.aberto)}
      <label class="inline small u-nowrap">Agrupar por
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
    if (!store.iaDisponivel()) return avisoIA(app, "Gerar deste tópico");
    const id = el.getAttribute("data-id");
    const bi = parseInt(el.getAttribute("data-bi"), 10);
    const d = store.get().documentos.find((x) => x.id === id);
    const bloco = d && d.estrutura && d.estrutura.blocos[bi];
    if (!bloco) return;
    const rotulo = `${bloco.numero || ""} ${bloco.titulo}`.trim();
    if (tipo === "mapa") return gerarEAbrirMapa(store, app, () => store.gerarMapaMentalDeMaterial(id, bloco));
    if (tipo === "extrair") {
      const qs = await comOcupado(() => store.extrairQuestoesDeDoc(id, bloco), { botao: el, msg: `Extraindo questões de "${rotulo}"…` });
      if (qs == null) return;
      toast(qs.length ? `${plural(qs.length, "questão extraída", "questões extraídas")} de "${rotulo}".` : "Não encontrei questões prontas neste tópico do material.", qs.length ? "ok" : "erro");
      if (qs.length) app.navigate("pratica");
      return;
    }
    const perguntas = {
      flashcards: ["Quantos flashcards a IA deve gerar deste tópico?", 6],
      questoes: ["Quantas questões a IA deve gerar deste tópico?", 5],
      ce: ["Quantos itens Certo/Errado a IA deve gerar deste tópico?", 6],
    }[tipo];
    const r = await pedirNumero(perguntas[0], { padrao: perguntas[1], min: 1, max: 30, nivel: true });
    if (!r) return;
    const { n, dificuldade } = r;
    const rotLote = `de «${rotulo}»`;
    const lote = store.iniciarLoteGeracao(rotLote);
    const res = await comOcupado(() => (
      tipo === "flashcards" ? store.gerarFlashcardsDeDoc(id, n, dificuldade, bloco)
        : tipo === "questoes" ? store.gerarQuestoesDeDoc(id, n, dificuldade, bloco)
          : store.gerarQuestoesCEDeDoc(id, n, dificuldade, bloco)
    ), { botao: el, msg: `Gerando de "${rotulo}"…` });
    store.encerrarLoteGeracao();
    if (res == null) return;
    toast(res.length ? `${plural(res.length, "item criado", "itens criados")} de "${rotulo}".` : "Nada gerado.", res.length ? "ok" : "erro");
    if (res.length) app.navigate(tipo === "flashcards" ? "flashcards" : tipo === "ce" ? "pratica-ce" : "pratica", { lote, loteRotulo: rotLote }); // abre só os recém-gerados
  }

  // Q7: se o material foi extraído em BLOCOS (sumário), pergunta de qual PARTE gerar —
  // todo o material ou um subtópico específico. Retorna { bloco } (null = tudo) ou null (cancelou).
  async function escolherEscopoGeracao(id) {
    const d = store.get().documentos.find((x) => x.id === id);
    const blocos = (d && d.estrutura && d.estrutura.blocos) || [];
    const nPag = ((d && d.paginas) || []).length;
    if (blocos.length < 2 && nPag < 2) return { bloco: null }; // nada a escolher → material inteiro
    const opcoes = [
      { label: "Todo o material", value: "-1", cls: "btn-soft" },
      ...blocos.map((b, i) => ({ label: `${b.numero || ""} ${b.titulo}`.trim() || `Tópico ${i + 1}`, value: String(i) })),
    ];
    if (nPag >= 2) opcoes.push({ label: `Escolher páginas… (1–${nPag})`, value: "pag" });
    const v = await escolher("Gerar a partir de qual parte do material?", opcoes, { lista: true });
    if (v === null || v === undefined) return null;
    if (v === "pag") {
      const faixa = await pedirFaixaPaginas(nPag);
      if (!faixa) return null;
      // Bloco SINTÉTICO por faixa de páginas: ctxDeDoc fatia doc.paginas por [pIni, pFim].
      return { bloco: { numero: "", titulo: `págs ${faixa.de}–${faixa.ate}`, pIni: faixa.de, pFim: faixa.ate, nivel: 1, topicoId: null, banca: null, tipo: "teoria" } };
    }
    const idx = parseInt(v, 10);
    return { bloco: idx >= 0 ? blocos[idx] : null };
  }
  // Rótulo do lote de geração (para o filtro "só os recém-gerados" na tela de destino).
  const rotuloDoc = (id, bloco) => { const d = store.get().documentos.find((x) => x.id === id); const t = (d && d.titulo) || "material"; return bloco ? `de «${(bloco.titulo || "").trim() || t}»` : `do material «${t}»`; };

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
    // F2: a IA relê a IMAGEM do sumário e reconstrói os tópicos com fidelidade (contorna texto
    // colado/leaders). Manda só 1-2 imagens (a página do sumário), não o documento.
    "caprichar-estrutura": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Refazer tópicos pelo sumário");
      const id = el.getAttribute("data-doc");
      if (!id) return;
      const rotulo = el.textContent;
      el.disabled = true;
      const fim = toastCarregando("A IA está relendo o sumário e refazendo os tópicos…");
      try {
        const r = await store.caprichaEstruturaDoc(id);
        fim();
        if (r && r.ok) { toast(`Tópicos refeitos pela IA: ${plural(r.blocos, "tópico", "tópicos")}.`, "ok"); app.refresh(); }
        else { toast("Não encontrei um sumário legível neste material (ou a IA não retornou tópicos). Os tópicos atuais foram mantidos.", "erro"); el.disabled = false; el.textContent = rotulo; }
      } catch (e) {
        fim(); console.error(e);
        toast("A IA não conseguiu refazer os tópicos agora. Tente de novo em instantes.", "erro");
        el.disabled = false; el.textContent = rotulo;
      }
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
    // F4 — revisão por tópicos: programa a revisão espaçada de UM tópico da seção do sumário.
    "sum-revisar-topico": (el) => {
      const topId = el.getAttribute("data-top");
      const r = store.agendarRevisaoTopico(topId);
      if (r) { toast("Revisão programada — acompanhe na Central de Revisões.", "ok"); app.refresh(); }
      else toast("Não consegui programar a revisão deste tópico.", "erro");
    },
    // F4 — programa a revisão de TODOS os tópicos vinculados do material de uma vez.
    "sum-revisar-todos": (el) => {
      const d = store.get().documentos.find((x) => x.id === el.getAttribute("data-id"));
      if (!d || !d.estrutura) return;
      const tops = [...new Set((d.estrutura.blocos || []).map((b) => b.topicoId).filter(Boolean))];
      if (!tops.length) return toast("Nenhum tópico vinculado para revisar.", "erro");
      tops.forEach((t) => store.agendarRevisaoTopico(t));
      toast(`${plural(tops.length, "tópico programado", "tópicos programados")} para revisão (Central de Revisões).`, "ok");
      app.refresh();
    },
    // F4: alterna o painel de estrutura entre LEITURA (sumário) e EDIÇÃO (F3).
    "estr-edit-toggle": (el) => {
      const id = el.getAttribute("data-id");
      if (estruturaEditando.has(id)) estruturaEditando.delete(id);
      else { estruturaEditando.add(id); textoBrutoAberto.delete(id); }
      app.refresh();
    },
    // Menu "···": abre o material e mostra o TEXTO CORRIDO (alterna com o sumário).
    "menu-texto-corrido": (el) => {
      const id = el.getAttribute("data-id");
      abertoId = id;
      if (textoBrutoAberto.has(id)) textoBrutoAberto.delete(id);
      else { textoBrutoAberto.add(id); estruturaEditando.delete(id); }
      app.refresh();
    },
    // Menu "···": abre o material direto no editor de estrutura (F3).
    "menu-revisar-estrutura": (el) => {
      const id = el.getAttribute("data-id");
      abertoId = id;
      estruturaEditando.add(id);
      textoBrutoAberto.delete(id);
      app.refresh();
    },
    // Menu "···": abre o material e expande a ferramenta de Visão por página.
    "menu-reprocessar-pagina": (el) => {
      const id = el.getAttribute("data-id");
      abertoId = id;
      if (ocrAberto.has(id)) ocrAberto.delete(id);
      else ocrAberto.add(id);
      app.refresh();
    },
    // Opcional 2: re-detecta a estrutura a partir do texto atual das páginas (ex.: após OCR).
    "redetectar-estrutura": (el) => {
      const id = el.getAttribute("data-id");
      const est = store.redetectarEstruturaDoc(id);
      if (est) { textoBrutoAberto.delete(id); estruturaEditando.delete(id); toast(`Sumário refeito: ${plural(est.blocos.length, "tópico do material", "tópicos do material")}.`, "ok"); }
      else toast("Não consegui montar um sumário do texto atual (sem Índice/numeração).", "erro");
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

    // Gerar a partir do material (pergunta o escopo: inteiro × tópico do sumário × faixa de páginas).
    "doc-mapa": async (el) => {
      el.closest("details")?.removeAttribute("open");
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar mapa mental");
      const id = el.getAttribute("data-id");
      const escopo = await escolherEscopoGeracao(id);
      if (!escopo) return;
      gerarEAbrirMapa(store, app, () => store.gerarMapaMentalDeMaterial(id, escopo.bloco));
    },
    "doc-flashcards": async (el) => {
      el.closest("details")?.removeAttribute("open");
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar flashcards");
      const id = el.getAttribute("data-id");
      const escopo = await escolherEscopoGeracao(id);
      if (!escopo) return;
      const r = await pedirNumero("Quantos flashcards a IA deve gerar?", { padrao: 6, min: 1, max: 30, nivel: true });
      if (!r) return;
      const { n, dificuldade } = r;
      const rot = rotuloDoc(id, escopo.bloco);
      const lote = store.iniciarLoteGeracao(rot);
      const cards = await comOcupado(() => store.gerarFlashcardsDeDoc(id, n, dificuldade, escopo.bloco), { botao: el, msg: "Gerando flashcards…" });
      store.encerrarLoteGeracao();
      if (cards == null) return; // erro já sinalizado
      toast(cards.length ? `${plural(cards.length, "flashcard criado", "flashcards criados")}.` : "Nada gerado — confira se este material tem texto.", cards.length ? "ok" : "erro");
      if (cards.length) app.navigate("flashcards", { lote, loteRotulo: rot }); // abre mostrando SÓ os recém-gerados
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
      const rot = rotuloDoc(id, escopo.bloco);
      const lote = store.iniciarLoteGeracao(rot);
      const qs = await comOcupado(() => store.gerarQuestoesDeDoc(id, n, dificuldade, escopo.bloco), { botao: el, msg: "Gerando questões…" });
      store.encerrarLoteGeracao();
      if (qs == null) return;
      toast(qs.length ? `${plural(qs.length, "questão criada", "questões criadas")}.` : "Nada gerado.", qs.length ? "ok" : "erro");
      if (qs.length) app.navigate("pratica", { lote, loteRotulo: rot });
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
      const rot = rotuloDoc(id, escopo.bloco);
      const lote = store.iniciarLoteGeracao(rot);
      const itens = await comOcupado(() => store.gerarQuestoesCEDeDoc(id, n, dificuldade, escopo.bloco), { botao: el, msg: "Gerando itens Certo/Errado…" });
      store.encerrarLoteGeracao();
      if (itens == null) return;
      toast(itens.length ? `${plural(itens.length, "item C/E criado", "itens C/E criados")}.` : "Nada gerado.", itens.length ? "ok" : "erro");
      if (itens.length) app.navigate("pratica-ce", { lote, loteRotulo: rot });
    },
    "doc-extrair": async (el) => {
      el.closest("details")?.removeAttribute("open");
      if (!store.iaDisponivel()) return avisoIA(app, "Extrair questões do material");
      const id = el.getAttribute("data-id");
      const escopo = await escolherEscopoGeracao(id);
      if (!escopo) return;
      const qs = await comOcupado(() => store.extrairQuestoesDeDoc(id, escopo.bloco), { botao: el, msg: "Extraindo do material…" });
      if (qs == null) return;
      toast(qs.length ? `${plural(qs.length, "questão extraída", "questões extraídas")} (quando o gabarito estava no material).` : "Não encontrei questões prontas neste material.", qs.length ? "ok" : "erro");
      if (qs.length) app.navigate("pratica");
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
      const paginas = await comOcupado(async () => {
        const r = await extrairPdfPaginas(d.pdfData);
        store.setPaginasDocumento(d.id, r.paginas);
        return r.paginas;
      }, { botao: el, msg: "Analisando páginas…" });
      if (paginas == null) return;
      const pend = paginas.filter((p) => p.vazia).length;
      toast(pend ? `${plural(pend, "página sem texto encontrada", "páginas sem texto encontradas")}.` : "Todas as páginas têm texto.", "ok");
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

    // ---- busca inteligente (semântica) ----
    // Reprocessa em LOTE os materiais pendentes/desatualizados do índice. Depois disto,
    // salvar/atualizar material mantém o índice em dia sozinho (indexarFonteAuto).
    "atualizar-indice": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Busca inteligente");
      const pend = store.fontesIndice(SEM_ESCOPO_MAT).filter((f) => !f.indexada).map((f) => f.id);
      if (!pend.length) return toast("A busca inteligente já está em dia.", "ok");
      el.disabled = true;
      const fim = toastCarregando("Preparando os materiais para a busca inteligente…");
      try {
        const r = await store.indexarSemantica((feito, total, titulo) =>
          fim(`Atualizando índice… ${feito}/${total}: ${titulo}`), { ids: pend });
        fim();
        toast(`Busca inteligente atualizada (${plural(r.feitos, "material", "materiais")}).`, "ok");
      } catch (e) {
        fim();
        console.error(e);
        toast("Não consegui atualizar o índice agora. Tente de novo em instantes.", "erro");
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
      const rot = `do trecho «${(r.titulo || "busca").slice(0, 40)}»`;
      const lote = store.iniciarLoteGeracao(rot);
      const cards = await comOcupado(() => store.gerarFlashcardsDeTrecho({ texto: r.trecho, contexto: r.titulo, fonteId: r.fonteId, tipo: r.tipo, n, dificuldade }), { botao: el, msg: "Gerando flashcards…" });
      store.encerrarLoteGeracao();
      if (cards == null) return;
      toast(cards.length ? `${plural(cards.length, "flashcard criado", "flashcards criados")}.` : "Nada gerado.", cards.length ? "ok" : "erro");
      if (cards.length) app.navigate("flashcards", { lote, loteRotulo: rot });
    },
    "result-questoes": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar questões");
      const r = semResultados && semResultados[+el.getAttribute("data-idx")];
      if (!r) return;
      const pg = await pedirNumero("Quantas questões a IA deve gerar deste trecho?", { padrao: 3, min: 1, max: 30, nivel: true });
      if (!pg) return;
      const { n, dificuldade } = pg;
      const rot = `do trecho «${(r.titulo || "busca").slice(0, 40)}»`;
      const lote = store.iniciarLoteGeracao(rot);
      const qs = await comOcupado(() => store.gerarQuestoesDeTrecho({ texto: r.trecho, contexto: r.titulo, fonteId: r.fonteId, tipo: r.tipo, n, dificuldade }), { botao: el, msg: "Gerando questões…" });
      store.encerrarLoteGeracao();
      if (qs == null) return;
      toast(qs.length ? `${plural(qs.length, "questão criada", "questões criadas")}.` : "Nada gerado.", qs.length ? "ok" : "erro");
      if (qs.length) app.navigate("pratica", { lote, loteRotulo: rot });
    },
    "buscar-sem": async () => {
      const q = (root.querySelector("#busca")?.value || "").trim();
      semQuery = q;
      if (!q) return toast("Digite o que procurar.", "erro");
      if (!store.iaDisponivel()) return avisoIA(app, "Busca semântica");
      if (!store.statusIndice().temIndice) return toast("Ative a busca inteligente primeiro (botão “Atualizar índice”).", "erro");
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

// Fase 4 — Painel de ETAPAS do import (a narrativa do processamento, no lugar de toasts
// que se atropelavam). Cada etapa: pendente (dim) → ativa (spinner) → ok (check c/ nota)
// | pulada | erro. O painel entra logo abaixo da linha de status do arquivo.
function criarPainelEtapas(depoisDe, etapas) {
  const ant = depoisDe.parentElement.querySelector(".import-etapas");
  if (ant) ant.remove(); // trocou de arquivo: recomeça a narrativa
  const el = document.createElement("div");
  el.className = "import-etapas";
  el.innerHTML = etapas
    .map((e2) => `<div class="imp-et" data-et="${e2.id}"><span class="imp-et-ico"></span><span class="imp-et-txt">${esc(e2.rotulo)}</span><span class="imp-et-nota muted small"></span></div>`)
    .join("");
  depoisDe.insertAdjacentElement("afterend", el);
  const ICO = {
    ativa: `<span class="import-spin">${icone("refresh-cw")}</span>`,
    ok: icone("check"),
    pulada: icone("minus"),
    erro: icone("x"),
  };
  const set = (id, estado, nota) => {
    const li = el.querySelector(`[data-et="${id}"]`);
    if (!li) return;
    li.className = `imp-et is-${estado}`;
    li.querySelector(".imp-et-ico").innerHTML = ICO[estado] || "";
    if (nota != null) li.querySelector(".imp-et-nota").textContent = nota;
  };
  const erroAtiva = (nota) => {
    const li = el.querySelector(".imp-et.is-ativa");
    if (li) set(li.getAttribute("data-et"), "erro", nota || "falhou aqui");
  };
  return { el, set, erroAtiva };
}

// Rasteriza e transcreve uma lista de páginas, uma a uma (1 página = 1 requisição).
// Mostra progresso e PARA sem perder o já feito se a cota/IA falhar.
async function processarOcr(app, store, doc, listaN) {
  if (ocrEmCurso) return toast("Já há uma leitura em andamento.", "erro");
  if (!listaN || !listaN.length) return toast("Nenhuma página pendente.", "erro");
  ocrEmCurso = true;
  // Fase 4: UM toast persistente com progresso real + Cancelar (antes: um toast POR página,
  // que se atropelavam; e não dava para interromper um lote grande).
  let cancelado = false;
  const fim = toastCarregando("Preparando as páginas…", { aoCancelar: () => { cancelado = true; } });
  try {
    let imagens;
    if (doc.imgData && (!doc.pdfData)) {
      imagens = listaN.includes(1) ? [{ n: 1, dataUrl: doc.imgData }] : [];
    } else if (doc.pdfData) {
      imagens = await rasterizarPaginas(doc.pdfData, listaN);
    } else {
      fim();
      return toast("Sem PDF/imagem salvos para processar (arquivo grande não foi guardado).", "erro");
    }
    let ok = 0;
    for (const img of imagens) {
      if (cancelado) break;
      fim(`Lendo páginas escaneadas… ${ok + 1}/${imagens.length} (pág. ${img.n})`);
      try {
        await store.ocrPagina(doc.id, img.n, img.dataUrl);
        ok++;
      } catch (e) {
        console.error(e);
        fim();
        toast(`A leitura parou na página ${img.n}. O que já foi transcrito está salvo; tente as restantes em instantes.`, "erro");
        app.refresh();
        return;
      }
    }
    fim();
    if (cancelado) toast(`Leitura interrompida — ${plural(ok, "página transcrita ficou salva", "páginas transcritas ficaram salvas")}.`, "ok");
    else if (ok) toast(`${plural(ok, "página transcrita", "páginas transcritas")} — confira o texto.`, "ok");
    app.refresh();
  } finally {
    ocrEmCurso = false;
  }
}

// Materiais filtrados pela busca textual E pelo filtro multi-tópico.
function docsFiltrados(store, st) {
  return store.buscarDocumentos(busca).filter((d) => itemNoFiltro(st, d, filtroTop.sel));
}

// Busca por SIGNIFICADO (semântica/IA) — sem campo próprio: usa o MESMO termo digitado no
// campo unificado (#busca). Sem aparato: 1 linha de status + "Atualizar índice" quando há
// pendências. Material salvo/atualizado entra sozinho no índice (indexarFonteAuto) depois
// que a busca foi ativada uma vez.
function buscaSemanticaHTML(store) {
  const s = store.statusIndice(SEM_ESCOPO_MAT); // status só de material/resumo (este módulo)
  const g = store.statusIndice(); // busca consulta TODO o índice (inclui Lei Seca/Jurisprudência)
  if (!s.online && !g.temIndice) {
    // Mesmo sem IA, o botão APARECE (suspenso) para não contradizer o texto "use o botão abaixo".
    return `
    <div class="busca-sem-barra">
      <button class="btn btn-ia btn-sm" data-action="buscar-sem" disabled data-tip="Conecte uma IA em Configurações para buscar por significado (não só palavra exata).">${icone("sparkles")} Buscar por significado (IA)</button>
      <span class="sem-status muted small">Conecte uma IA em Configurações para habilitar a busca por <b>significado</b>.</span>
    </div>`;
  }
  const statusTxt = !s.fontes
    ? "Busca inteligente: sem materiais ainda."
    : s.temIndice
    ? `Busca inteligente: ativa em <b>${s.indexadas}</b> de ${s.fontes} ${s.fontes === 1 ? "material" : "materiais"}.`
    : `Busca inteligente: ainda não ativada — toque em “Atualizar índice”.`;
  const btnAtualizar = s.online && s.pendentes
    ? `<button class="btn btn-ghost btn-sm" data-action="atualizar-indice" data-tip="Prepara os materiais novos ou alterados para a busca por significado. Depois, novos materiais entram sozinhos.">${icone("refresh-cw")} Atualizar índice (${s.pendentes})</button>`
    : "";
  return `
    <div class="busca-sem-barra">
      <button class="btn btn-ia btn-sm" data-action="buscar-sem" ${s.online && g.temIndice ? "" : "disabled"} data-tip="${g.temIndice ? "Busca por significado (IA) usando o que você digitou acima." : "Ative a busca inteligente (Atualizar índice) antes de buscar por significado."}">${semBuscando ? "Buscando…" : `${icone("sparkles")} Buscar por significado (IA)`}</button>
      ${btnAtualizar}
      <span class="sem-status muted small">${statusTxt}</span>
    </div>
    ${semResultados !== null ? resultadosSemHTML(semResultados) : ""}`;
}

// Lista de materiais agrupada (por disciplina/tópico) ou plana.
function listaDocsHTML(store, st, docs, modo, busca) {
  if (!docs.length) {
    if (busca) {
      return vazio("Nada encontrado para a busca\nTente outra palavra, ou limpe o campo de busca.", "", icone("search"));
    }
    return vazio(
      "Importe sua primeira aula\nPDF, foto ou texto — depois você pesquisa por dentro.",
      `<button class="btn btn-add" data-action="toggle-form">${icone("plus")} Adicionar material</button>`,
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
    return `<div class="muted small u-mt-12">Nada relevante encontrado. Tente outras palavras, ou indexe mais material.</div>`;
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
        <label class="u-grow-2">Título <input id="doc-titulo" type="text" placeholder="Ex.: Aula 3: Atos administrativos" /></label>
        <label class="u-grow">Tópico <select id="doc-top"><option value="">— sem tópico —</option>${opcoesTopico}</select></label>
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
          let painel = null;
          try {
            let texto = "";
            pend.pdf = null; pend.img = null; pend.paginas = null; pend.estrutura = null;
            if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
              // Fase 4 — PAINEL DE ETAPAS no lugar da metralhadora de toasts: o momento mais
              // "mágico" do app (PDF → sumário navegável) agora é uma cena com narrativa,
              // dentro do próprio modal. Toast só para avisos excepcionais.
              painel = criarPainelEtapas(docStatus, [
                { id: "ler", rotulo: "Lendo o PDF" },
                { id: "sumario", rotulo: iaOn ? "Montando o sumário com IA" : "Montando o sumário" },
                { id: "texto", rotulo: "Preparando o texto" },
              ]);
              painel.set("ler", "ativa");
              const ab = await f.arrayBuffer();
              if (ab.byteLength <= 50 * 1024 * 1024) pend.pdf = abToDataUrl(ab);
              else toast("PDF muito grande (>50MB): não será guardado para visualização; só o texto será mantido.", "erro");
              const { paginas: paginasBrutas, numPaginas, outline, linhasPorPagina } = await extrairPdfPaginas(new File([ab], f.name, { type: "application/pdf" }));
              const paginas = limparRuidoDePaginas(paginasBrutas);
              texto = paginas.map((p) => p.texto || "").join("\n\n").trim();
              painel.set("ler", "ok", `${plural(numPaginas || paginas.length, "página", "páginas")}${(numPaginas || 0) > 400 ? " — material grande, gerações podem demorar" : ""}`);
              painel.set("sumario", "ativa");
              try {
                let est = detectarEstrutura({ paginas: paginasBrutas, outline, numPaginas: numPaginas || paginasBrutas.length, linhasPorPagina });
                // F2: com IA + PDF, estrutura pelo SUMÁRIO (imagem) — muito mais fiel que a heurística
                // (que embaralha com marca d'água/numeração). Manda só 1-2 imagens; o determinístico é fallback.
                let viaIA = false;
                if (iaOn && pend.pdf) {
                  try {
                    const estIA = await store.estruturarPorSumarioIA({ paginas: paginasBrutas, pdfData: pend.pdf, numPaginas: numPaginas || paginasBrutas.length });
                    if (estIA && estIA.blocos.length) { est = estIA; viaIA = true; }
                  } catch (_) {}
                }
                pend.estrutura = est && est.blocos.length ? est : null;
                if (pend.estrutura) store.casarEstruturaComEdital(pend.estrutura);
                const casados = pend.estrutura ? pend.estrutura.blocos.filter((b) => b.topicoId).length : 0;
                painel.set(
                  "sumario",
                  pend.estrutura ? "ok" : "pulada",
                  pend.estrutura
                    ? `${plural(pend.estrutura.blocos.length, "tópico", "tópicos")}${viaIA ? " pela IA" : ""}${casados ? ` · ${casados} vinculados ao edital` : ""}`
                    : "sem sumário detectável — o texto corrido segue valendo"
                );
              } catch (_) { pend.estrutura = null; painel.set("sumario", "pulada", "não deu desta vez"); }
              reEstrutura();
              painel.set("texto", "ativa");
              if ((!texto || texto.length < 40) && iaOn && f.size <= 14 * 1024 * 1024) {
                painel.set("texto", "ativa", "PDF escaneado — lendo com a IA…");
                try {
                  const t = await extrairTextoArquivo(store.get().config, { dataB64: await arquivoParaBase64(f), mimeType: "application/pdf", nomeArquivo: f.name, contexto: "o conteúdo de um material de estudo (apostila, aula, artigo ou anotações): extraia o conteúdo de estudo na íntegra, na ordem de leitura" });
                  if (t && t.trim()) texto = t.trim();
                } catch (_) {}
              }
              const pendN = paginas.filter((p) => p.vazia).length;
              pend.paginas = pend.pdf ? paginas : null;
              corpo.querySelector("#doc-texto").value = texto;
              painel.set("texto", "ok", pendN ? `${plural(pendN, "página escaneada fica", "páginas escaneadas ficam")} para ler com IA depois` : "pronto para conferir e salvar");
            } else if (ehImagem(f)) {
              pend.img = await fileToDataUrl(f);
              pend.paginas = [{ n: 1, texto: "", vazia: true, temImagem: true, ocr: false }];
              corpo.querySelector("#doc-texto").value = "";
              toast(iaOn ? "Imagem carregada. Salve e toque em “Ler páginas escaneadas” para extrair o texto." : "Imagem carregada. O texto será extraído por Visão quando você conectar a IA (fica pendente).", "ok");
            } else {
              texto = await f.text();
              corpo.querySelector("#doc-texto").value = texto;
              toast("Texto carregado. Confira e salve.", "ok");
            }
            docStatus.className = "import-status ok";
            docStatus.innerHTML = `${icone("check")} ${esc(f.name)} — pronto`;
          } catch (err) {
            console.error(err);
            if (painel) painel.erroAtiva(err.code === "PDF_PROTEGIDO" ? "PDF protegido por senha" : "não consegui ler");
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
            const ok = await confirmar("Importe apenas material que você tem direito de usar. Ele fica só neste dispositivo. Continuar?");
            if (!ok) return;
            store.setConfig({ materialAvisoAceito: true });
          }
          if (pend.estrutura) lerEstruturaDoDOM(corpo, pend.estrutura);
          const existente = (pend.pdf || pend.img) ? store.acharDocPorTitulo(titulo) : null;
          if (existente) {
            const ok = await confirmar(`Já existe um material chamado "${titulo}". Atualizar ele com esta importação (mantém as questões/flashcards/marcações e os tópicos já confirmados)? Escolha Cancelar para criar um novo.`);
            if (ok) {
              store.atualizarMaterialDeImport(existente.id, { texto, paginas: pend.paginas, pdfData: pend.pdf, imgData: pend.img, estrutura: pend.estrutura });
              store.indexarFonteAuto(existente.id); // busca inteligente: reindexa em background (no-op se não ativada)
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
          // Busca inteligente: indexa o material novo em background (silencioso; no-op se a
          // busca nunca foi ativada ou a IA está desconectada).
          if (doc) store.indexarFonteAuto(doc.id);
          // F1 — descrever FIGURAS de conteúdo com a IA, automático e em BACKGROUND (não bloqueia).
          const temFig = doc && store.iaDisponivel() && Array.isArray(pend.paginas) && pend.paginas.some((p) => p.temImagem);
          if (temFig) {
            const fim = toastCarregando("Descrevendo as figuras do material com a IA…");
            store.descreverFigurasDeDoc(doc.id).then((r) => { fim(); if (r && r.descritas) toast(`${plural(r.descritas, "figura descrita", "figuras descritas")} pela IA (já entram na busca).`, "ok"); store.indexarFonteAuto(doc.id); /* o texto ganhou as descrições → reindexa */ }).catch(() => fim());
          }
          if (store.get().config.descartarPdfAposImport && doc && (doc.pdfData || doc.imgData) && store.paginasPendentes(doc).length === 0 && !temFig) {
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
          lerEstruturaDoDOM(corpo, pend.estrutura);
          const r = await comOcupado(() => store.casarEstruturaComEditalIA(pend.estrutura), { botao: el, msg: "Refinando os vínculos com a IA…" });
          if (r === null) return;
          reEstrutura();
          toast("Vínculos refinados pela IA (confira).", "ok");
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
  const tipo = d.pdfData ? { ic: "file-text", lb: "PDF" } : d.imgData ? { ic: "image", lb: "Imagem" } : { ic: "file-text", lb: "Texto" };
  const nPag = (d.paginas || []).length;
  const nTop = d.estrutura && d.estrutura.blocos ? d.estrutura.blocos.length : 0;
  const nFig = (d.figuras || []).length;
  const sub = [tipo.lb, nPag ? `${nPag} ${nPag === 1 ? "página" : "páginas"}` : "", nTop ? `${nTop} ${nTop === 1 ? "tópico" : "tópicos"}` : "", nFig ? `${nFig} ${nFig === 1 ? "figura" : "figuras"}` : ""].filter(Boolean).join(" · ");
  return `
    <div class="card doc-item" data-foco-id="${d.id}">
      <div class="doc-head">
        <div class="doc-ident">
          <span class="doc-tipo-ico" data-tip="${tipo.lb}">${icone(tipo.ic)}</span>
          <div class="doc-ident-txt">
            <span class="doc-titulo" data-action="abrir" data-id="${d.id}" role="button" tabindex="0" title="Ver/ocultar o texto extraído">${esc(d.titulo)}</span>
            <div class="doc-sub muted small">${sub}</div>
          </div>
        </div>
        <div class="doc-meta">
          ${topicosDoc.map((t) => { const pg = d.topicoPaginas && d.topicoPaginas[t.id]; return `<span class="tag-topico">${esc(nomeTopico(st, t))}${pg ? ` <span class="tag-pag">págs. ${pg[0]}–${pg[1]}</span>` : ""}</span>`; }).join("")}
          ${pend ? `<span class="tag-ocr">${icone("hourglass")} ${pend} pág. p/ OCR</span>` : ""}
          ${d.binarioDescartado ? `<span class="muted small" data-tip="O PDF original foi descartado; o texto extraído foi mantido." data-tip-pos="cima-dir">${icone("file-text")} PDF descartado</span>` : ""}
          <button class="lnk doc-acao-primaria" data-action="abrir" data-id="${d.id}">${aberto ? `${icone("chevron-down")} ocultar texto` : `${icone("chevron-right")} ver texto extraído`}</button>
          ${
            (d.texto || "").trim()
              ? `<details class="doc-mais doc-gerar-menu">
                   <summary class="lnk" data-tip-pos="cima-dir" data-tip="Criar flashcards, questões e mapa mental a partir deste material.">${icone("sparkles")} Gerar com IA ${icone("chevron-down")}</summary>
                   <div class="doc-mais-pop" role="menu">
                     <button class="menu-item" data-action="doc-flashcards" data-id="${d.id}" data-tip="A IA CRIA flashcards (frente/verso) a partir do conteúdo deste material." data-tip-pos="cima-esq"><span class="menu-ico">${icone("layers")}</span> Flashcards</button>
                     <button class="menu-item" data-action="doc-questoes" data-id="${d.id}" data-tip="A IA gera questões de múltipla escolha novas a partir do conteúdo." data-tip-pos="cima-esq"><span class="menu-ico">${icone("notebook-pen")}</span> Questões (múltipla escolha)</button>
                     <button class="menu-item" data-action="doc-questoes-ce" data-id="${d.id}" data-tip="A IA gera afirmações Certo/Errado novas a partir do conteúdo." data-tip-pos="cima-esq"><span class="menu-ico">${icone("check")}</span> Questões Certo/Errado</button>
                     <button class="menu-item" data-action="doc-extrair" data-id="${d.id}" data-tip="TRANSCREVE as questões que JÁ existem no material (ex.: 'Questões Comentadas'), com o gabarito quando está no texto. Não inventa." data-tip-pos="cima-esq"><span class="menu-ico">${icone("clipboard-list")}</span> Extrair questões prontas</button>
                     <button class="menu-item" data-action="doc-mapa" data-id="${d.id}" data-tip="A IA monta um mapa mental do conteúdo deste material." data-tip-pos="cima-esq"><span class="menu-ico">${iconMapa}</span> Mapa mental</button>
                   </div>
                 </details>`
              : ""
          }
          <details class="doc-mais">
            <summary class="lnk" data-tip-pos="cima-dir" data-tip="Mais ações para este material.">${icone("ellipsis")}</summary>
            <div class="doc-mais-pop" role="menu">
              <div class="menu-rotulo">Ler e ver</div>
              ${d.pdfData ? `<button class="menu-item" data-action="ler-pdf" data-id="${d.id}" data-tip="Abre o PDF original no leitor interno (zoom e navegação por página)." data-tip-pos="cima-esq"><span class="menu-ico">${icone("file-text")}</span> Abrir PDF</button>` : ""}
              ${(d.texto || "").trim() ? `<button class="menu-item" data-action="menu-texto-corrido" data-id="${d.id}" data-tip="Mostra o texto completo extraído, em vez do sumário. É o que alimenta a busca e a IA." data-tip-pos="cima-esq"><span class="menu-ico">${icone("file-text")}</span> ${textoBrutoAberto.has(d.id) ? "Ver sumário" : "Texto corrido"}</button>` : ""}
              ${(d.texto || "").trim() ? `<button class="menu-item" data-action="toggle-marcar" data-id="${d.id}" data-tip="Grifar o texto (palavras-chave, prazos/valores, restritivas). O grifo de palavras-chave vira a fonte da revisão do tópico." data-tip-pos="cima-esq"><span class="menu-ico">${icone("square-pen")}</span> ${marcarAberto.has(d.id) ? "Fechar marcação" : "Marcar / grifar"}</button>` : ""}
              ${(d.paginas || []).length && !d.binarioDescartado ? `<button class="menu-item" data-action="menu-reprocessar-pagina" data-id="${d.id}" data-tip="Refaz UMA página com a Visão (tabela/organograma cujo texto saiu fora de ordem, ou página escaneada)." data-tip-pos="cima-esq"><span class="menu-ico">${icone("search")}</span> Reprocessar página (Visão)</button>` : ""}
              <div class="menu-sep"></div>
              <div class="menu-rotulo">Sumário e edital</div>
              ${
                d.estrutura && d.estrutura.blocos && d.estrutura.blocos.length
                  ? `<button class="menu-item" data-action="menu-revisar-estrutura" data-id="${d.id}" data-tip="Ver e editar o sumário: títulos, tópicos do edital e faixas de páginas. Lá dentro dá para refazer com IA." data-tip-pos="cima-esq"><span class="menu-ico">${icone("list-tree")}</span> Sumário</button>`
                  : d.pdfData && store.iaDisponivel()
                    ? `<button class="menu-item" data-action="caprichar-estrutura" data-doc="${d.id}" data-tip="A IA lê a página de sumário do próprio PDF e monta os tópicos do material." data-tip-pos="cima-esq"><span class="menu-ico">${icone("wand-sparkles")}</span> Montar sumário (IA)</button>`
                    : ""
              }
              <button class="menu-item" data-action="editar-topicos" data-id="${d.id}" data-tip="Escolher quais tópicos do edital este material cobre (dentro do painel, a IA pode sugerir)." data-tip-pos="cima-esq"><span class="menu-ico">${icone("link")}</span> Vincular ao edital</button>
              <div class="menu-sep"></div>
              ${d.pdfData ? `<button class="menu-item menu-item-danger" data-action="descartar-pdf" data-id="${d.id}" data-tip="Apaga só o arquivo PDF para liberar espaço; o texto extraído e o sumário permanecem." data-tip-pos="cima-esq"><span class="menu-ico">${icone("file-text")}</span> Descartar PDF original</button>` : ""}
              <button class="menu-item menu-item-danger" data-action="del-doc" data-id="${d.id}"><span class="menu-ico">${icone("x")}</span> Remover material</button>
            </div>
          </details>
        </div>
      </div>
      ${trecho ? `<div class="doc-snippet">${realcar(esc(trecho), busca.trim())}</div>` : ""}
      ${topicosDocAberto === d.id ? topicosEditorHTML(store, st, d) : ""}
      ${detectDoc === d.id ? detectPainelHTML() : ""}
      ${
        marcarAberto.has(d.id)
          ? (() => {
              const pgs = (d.paginas || []).filter((p) => (p.texto || "").trim());
              const porPagina = pgs.length > 1;
              const pageSel = porPagina
                ? `<label class="inline small u-mb-8">${icone("file-text")} Página:
                    <select class="mk-pagina-sel" data-id="${d.id}" style="width:auto; margin-left:6px">
                      ${pgs.map((p) => `<option value="${p.n}" ${String(marcarPagina[d.id] || pgs[0].n) === String(p.n) ? "selected" : ""}>${p.n}${p.temImagem ? " (fig.)" : ""}</option>`).join("")}
                    </select>
                    <span class="muted">de ${pgs.length} · grife página por página (vira fonte da revisão)</span>
                   </label>`
                : "";
              return `<div class="doc-marcar">
                <div class="muted small u-mb-8">${icone("square-pen")} Marcação sobre o <b>texto extraído</b>. Use “Auto” (prazos/restritivas), “IA sugere” e o pincel.</div>
                ${pageSel}
                <div class="mk-host" data-mk-host="${d.id}"></div>
              </div>`;
            })()
          : aberto
            ? `${ocrAlertaHTML(store, d)}
               ${ocrAberto.has(d.id) ? ocrManualHTML(store, d) : ""}
               ${
                 d.estrutura && d.estrutura.blocos && d.estrutura.blocos.length
                   ? estruturaEditando.has(d.id)
                     ? `${estruturaResumoHTML(d.estrutura, store, d.id)}
                        <button class="btn btn-ghost btn-sm u-mt-8" data-action="estr-edit-toggle" data-id="${d.id}">${icone("check")} concluir revisão do sumário</button>`
                     : textoBrutoAberto.has(d.id)
                       ? `<div class="doc-corpo"><div class="muted small u-mb-8">${icone("file-text")} Texto corrido completo (alimenta busca e IA). <button class="lnk" data-action="menu-texto-corrido" data-id="${d.id}">voltar ao sumário</button></div>${esc(d.texto) || "<i>vazio</i>"}</div>`
                       : sumarioNavegavelHTML(d, store)
                   : `<div class="doc-corpo">
                        <div class="muted small u-mb-8">${icone("file-text")} Texto extraído do material — é o que alimenta a <b>busca</b> e a <b>IA</b> (não precisa estar bonito).</div>
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
// O "Sugerir com IA" dispara a detecção existente (detectar-topicos) — o painel de
// sugestões abre logo abaixo e o usuário confirma o que vincular.
function topicosEditorHTML(store, st, d) {
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
  const sugerirIA = (d.texto || "").trim() && store.iaDisponivel()
    ? `<button class="btn btn-ia btn-sm" data-action="detectar-topicos" data-id="${d.id}" data-tip="A IA lê o material e sugere quais tópicos do edital ele aborda (você confere e confirma).">${icone("sparkles")} Sugerir com IA</button>`
    : "";
  return `<div class="card doc-top-editor">
    <div class="muted small u-mb-8">${icone("files")} <b>Tópicos que este material cobre</b> — marque todos (uma aula pode cobrir vários). Em cada um, opcionalmente diga <b>quais páginas</b> o cobrem (deixe vazio = a aula inteira). Salva automaticamente.</div>
    ${grupos || `<p class="muted small u-m-0">Nenhum tópico cadastrado. Adicione no Edital.</p>`}
    <div class="form-acoes">${sugerirIA}<button class="btn btn-ghost btn-sm" data-action="editar-topicos" data-id="${d.id}">Fechar</button></div>
  </div>`;
}

// Painel "detectar tópicos" (precisão por página, dir.2): tópicos do edital abordados → revisão.
function detectPainelHTML() {
  if (detectando) return `<div class="card detect-painel"><p class="muted small u-m-0">${icone("search")} A IA está lendo o material e detectando os tópicos…</p></div>`;
  const res = detectResultado || [];
  return `<div class="card detect-painel">
    <h3 class="u-mb-4">${icone("sparkles")} Tópicos do edital sugeridos pela IA</h3>
    ${
      res.length
        ? `<p class="muted small u-m-0 u-mb-8">A IA identificou estes tópicos do edital. Marque os que quer colocar na <b>curva de revisão</b> (você confirma):</p>
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
        : `<p class="muted small u-m-0">Nenhum tópico do edital foi detectado neste material. <button class="lnk" data-action="detect-fechar">Fechar</button></p>`
    }
  </div>`;
}

// ALERTA de OCR: só aparece quando SOBRAM páginas escaneadas/sem texto (a extração já é automática).
function ocrAlertaHTML(store, d) {
  if (d.binarioDescartado || !Array.isArray(d.paginas)) return "";
  const iaOn = store.iaDisponivel();
  const pend = d.paginas.filter((p) => p.vazia && !p.ocr);
  if (!pend.length) return "";
  const lista = pend.map((p) => p.n).join(", ");
  return `<div class="ocr-painel ocr-alerta">
    <div class="ocr-linha">
      <span>${icone("hourglass")} <b>${pend.length}</b> ${pend.length === 1 ? "página escaneada" : "páginas escaneadas"}/sem texto (pág. ${lista})</span>
      ${
        iaOn
          ? `<button class="btn btn-primary btn-sm" data-action="ocr-doc" data-id="${d.id}">${icone("sparkles")} Ler páginas escaneadas (${pend.length})</button>`
          : `<span class="muted small">Conecte o Gemini em Configurações para processar (fica pendente até lá).</span>`
      }
    </div>
  </div>`;
}

// Ferramenta MANUAL de Visão por página — aberta sob demanda pelo menu "···" (Reprocessar página).
function ocrManualHTML(store, d) {
  const iaOn = store.iaDisponivel();
  if (d.binarioDescartado) {
    return `<div class="ocr-painel"><p class="muted small u-m-0">${icone("search")} Visualizador e Visão por página indisponíveis: o PDF original foi descartado. O texto extraído foi mantido.</p></div>`;
  }
  if (!Array.isArray(d.paginas)) {
    if (!d.pdfData) return "";
    return `<div class="ocr-painel">
      <div class="ocr-titulo">${icone("search")} Reconhecimento de imagem (Visão)</div>
      <p class="muted small">Prepare as páginas para reprocessar com Visão as que têm tabela/organograma ou estão escaneadas.</p>
      <button class="btn btn-ghost btn-sm" data-action="detectar-paginas" data-id="${d.id}">Analisar páginas (Visão)</button>
    </div>`;
  }
  const feitas = d.paginas.filter((p) => p.ocr).length;
  const feitasLinha = feitas ? `<div class="ocr-linha"><span>${icone("check")} ${plural(feitas, "página transcrita", "páginas transcritas")} por Visão ${seloBadge("amarelo")}.</span></div>` : "";
  return `<div class="ocr-painel">
    <div class="ocr-titulo">${icone("search")} Reprocessar uma página com a Visão</div>
    <div class="ocr-linha">
      <span>O texto de uma página saiu fora de ordem (tabela/organograma)? Reprocesse <b>uma</b> página:</span>
      ${
        iaOn
          ? `<select class="ocr-pag-sel" data-id="${d.id}" aria-label="Página para Visão">
               ${d.paginas.map((p) => `<option value="${p.n}">página ${p.n}${p.temImagem ? " figura" : ""}${p.ocr ? " (Visão)" : ""}</option>`).join("")}
             </select>
             <button class="btn btn-ghost btn-sm" data-action="ocr-pagina-sel" data-id="${d.id}" data-tip-pos="cima-dir" data-tip="Substitui o texto da página escolhida pela transcrição da Visão (tabelas em Markdown, organogramas descritos).">${icone("search")} Visão nesta página</button>`
          : `<span class="muted small">Conecte o Gemini em Configurações para usar a Visão.</span>`
      }
    </div>
    <div class="ocr-linha muted small">${icone("image")} marca páginas com figura/tabela grande. Logos de cabeçalho são ignorados de propósito.</div>
    ${feitasLinha}
  </div>`;
}

function nomeTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
