// Base documental: importar conteúdo das aulas (PDF em blocos, foto/escaneado, .txt
// ou texto colado), visualizar, vincular a tópico e buscar (busca textual; semântica
// fica na v2).
//
// OCR/Visão (econômico): o texto sai SEMPRE do pdf.js (grátis, offline). A Visão do
// Gemini só entra nas PÁGINAS-LACUNA (sem camada de texto) e SOB CLIQUE — nunca
// transcreve o PDF inteiro. Offline, as páginas sem texto ficam como pendência
// registrada até a IA estar conectada.
import { bindActions, toast, toastCarregando, header, seloBadge, vazio, confirmar, escolher, escolherVarios, avisoIA, ligarDropZone, focarItem, pedirNumero, pedirTexto, faixaIA, abrirJanela, iconMapa, plural, comOcupado } from "../ui.js";
import { esc, fmtData } from "../util.js";
import { icone } from "../icones.js";
import { extrairPdfPaginas, rasterizarPaginas, rasterizarPaginasStream, arquivoParaBase64 } from "../pdf.js";
import { extrairTextoArquivo } from "../ia-provider.js";
import { abrirVisualizadorPdf } from "../pdfviewer.js";
import { gerarEAbrirMapa } from "../mapa-mental.js";
import { detectarEstrutura, limparRuidoDePaginas, ehEstruturaForte, disciplinaDoDocumento, tituloCurtoDoc, ordenarDocumentos, cursosConhecidos, GRUPO_AVULSOS } from "../estrutura.js";

// Grupos (disciplina/tópico) RECOLHIDOS na lista de materiais. Vive na sessão, como o
// equivalente do Plano do cursinho: com uma aula por PDF, uma disciplina sozinha ocupa dezenas
// de cartões e chegar à seguinte é rolagem pura.
const gruposRecolhidos = new Set();

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
let abertoId = null;
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

// Converte o PDF para data URL SEM montar a string gigante byte a byte na thread principal.
// A versão antiga fazia `binary += String.fromCharCode(byte)` num laço: uma apostila de 30 MB
// virava ~60 MB de string UTF-16 + ~40 MB de base64, tudo de uma vez e travando a interface
// (no celular, a aba costuma ser encerrada por falta de memória). O FileReader faz o mesmo
// trabalho em código nativo, fora da thread de layout.
function abToDataUrl(ab) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(new Blob([ab], { type: "application/pdf" }));
  });
}

// Teto de tamanho do PDF guardado para visualização. No celular guardar 50 MB em IndexedDB
// (e recarregá-lo a cada abertura do material) é inviável — o TEXTO extraído continua salvo
// normalmente, só a cópia do arquivo original é dispensada.
function tetoPdfGuardado() {
  const toque = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  return (toque ? 12 : 50) * 1024 * 1024;
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
  const temPdf = docId && st && store.temPdfDoc((st.documentos || []).find((x) => x.id === docId));
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

// O corpo do cartão quando o material tem sumário: "Ver sumário" — ÁRVORE recolhível aninhada por
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
    // Mesmo tratamento do chip de "tópicos vinculados" do cartão (topicosVinculadosHTML):
    // rótulo curto + tooltip com o nome inteiro só quando truncar — senão o sumário vira
    // uma parede de texto com o nome completo do item do edital em cada linha.
    const tnCurto = tn ? rotuloCurtoTopico(tn) : null;
    const tipoTag = b.tipo !== "teoria" ? `<span class="mini-tag">${esc(b.tipo)}${b.banca ? " " + esc(b.banca) : ""}</span>` : "";
    const verPdf = store.temPdfDoc(d) ? `<button class="lnk" data-action="ler-pdf-pag" data-id="${d.id}" data-pag="${b.pIni}" data-tip="Abrir esta página no PDF">${icone("file-text")} abrir pág. ${b.pIni}</button>` : "";
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
      <summary>${icone("chevron-right")}<span class="estr-num">${esc(b.numero || "")}</span> ${aviso}<span class="sum-titulo">${esc(b.titulo)}</span> <span class="muted small">p.${b.pIni}–${b.pFim}</span> ${tipoTag} ${tn ? `<span class="estr-top"${tnCurto !== tn ? ` data-tip="${esc(tn)}" data-tip-pos="cima-esq"` : ""}>→ ${esc(tnCurto)}</span>` : ""} ${rotuloRevisao(st, b.topicoId)}</summary>
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
  // Convite para a IA reler o sumário — só quando o determinístico NÃO resolveu.
  //
  // A regra era o contrário: qualquer sumário que não viesse da IA (`origem !== "ia-sumario"`)
  // ganhava o aviso de "método antigo". Depois da v0.8.3 isso ficou de cabeça para baixo: o
  // sumário lido do ÍNDICE do próprio PDF é o mais fiel (medido: 339/339 blocos na página
  // certa, contra 260 pela IA), e o app pedia para trocá-lo justamente pelo caminho que erra.
  // Agora o convite aparece só onde a Visão ganha mesmo: estrutura fraca (fonte/marcador/
  // outline, ou blocos sem página) — tipicamente PDF escaneado ou sem índice legível.
  const fraca = !ehEstruturaForte(d.estrutura);
  const semPagina = blocos.filter((b) => b.pIni == null).length;
  const estruturaFraca = fraca && store.temPdfDoc(d) && store.iaDisponivel()
    ? `<div class="sum-nudge">
         ${icone("wand-sparkles")}
         <span>Este sumário saiu de um sinal fraco (${esc(rotuloOrigem(d.estrutura.origem) || "sem índice legível")}${semPagina ? `, ${plural(semPagina, "bloco sem página", "blocos sem página")}` : ""}). Se o PDF tiver um índice em imagem, a IA consegue lê-lo.</span>
         <button class="btn btn-primary btn-sm" data-action="caprichar-estrutura" data-doc="${d.id}">${icone("wand-sparkles")} Refazer tópicos pelo sumário (IA)</button>
       </div>`
    : "";
  return `<div class="sum-nav">
    <div class="sum-nav-head">
      <span class="muted small">${icone("list-tree")} Sumário — selecione um tópico para ler o trecho e revisar por partes.</span>
      ${revTodos}
    </div>
    ${estruturaFraca}
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
  // Material não tem mais marcação; vindo do dossiê, basta focar o item.
  if (app.params && app.params.marcarId) app.params.marcarId = null;
  const docs = docsFiltrados(store, st);

  const opcoesTopico = st.topicos
    .map((t) => `<option value="${t.id}">${esc(nomeTopico(st, t))}</option>`)
    .join("");

  // "topico" saiu do seletor (agrupava pelo tópico primário e escondia o material dos demais
  // que ele cobre). Quem tinha essa preferência gravada volta ao padrão em vez de ficar num
  // modo sem opção correspondente na tela.
  const agrup = st.config.materialAgrupamento === "nenhum" ? "nenhum" : "disciplina";

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
      ${agrup !== "nenhum" ? `<button class="btn btn-ghost btn-sm" data-action="doc-grupos-toggle" data-tip="${gruposRecolhidos.size ? "Abrir todas as disciplinas." : "Fechar todas as disciplinas e ver só os títulos dos grupos."}" data-tip-pos="cima-dir">${icone(gruposRecolhidos.size ? "chevron-down" : "chevron-up")} ${gruposRecolhidos.size ? "Expandir" : "Recolher"}</button>` : ""}
      <label class="inline small u-nowrap">Agrupar por
        <select id="doc-group">
          <option value="disciplina" ${agrup === "disciplina" ? "selected" : ""}>Disciplina</option>
          <option value="nenhum" ${agrup === "nenhum" ? "selected" : ""}>Sem agrupar</option>
        </select>
      </label>
    </div>
    ${figurasNudgeHTML(store, st)}
    ${visaoNudgeHTML(store, st)}

    <div class="lista-docs">
      ${listaDocsHTML(store, st, docs, agrup, busca)}
    </div>`;


  // Abrir/fechar um grupo à mão: guarda sem re-renderizar (re-render fecharia o que acabou de abrir).
  // Também roda depois da busca, que reescreve a lista inteira sem passar pelo render da tela.
  const ligarGrupos = () =>
    root.querySelectorAll("details.doc-grupo[data-grupo]").forEach((det) =>
      det.addEventListener("toggle", () => {
        const nome = det.getAttribute("data-grupo");
        if (det.open) gruposRecolhidos.delete(nome);
        else gruposRecolhidos.add(nome);
      })
    );
  ligarGrupos();

  const buscaEl = root.querySelector("#busca");
  buscaEl?.addEventListener("input", (e) => {
    busca = e.target.value;
    const lista = root.querySelector(".lista-docs");
    lista.innerHTML = listaDocsHTML(store, st, docsFiltrados(store, st), agrup, busca);
    ligarGrupos();
  });


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

  // Grifar material saiu daqui: esta tela é para trazer o documento, extrair o texto, gerar
  // com IA e dividir por tópico. Grifar continua onde importa — na Lei Seca, sobre o artigo
  // (`marcacao.js` segue intacto, com alvoTipo "indicacao"). As marcações de material que já
  // existiam ficam guardadas no estado; só não são mais exibidas.

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
      const rotEx = `de «${rotulo}»`;
      const loteEx = store.iniciarLoteGeracao(rotEx); // extrair também abre só o recém-criado
      const qs = await comOcupado(() => store.extrairQuestoesDeDoc(id, bloco), { botao: el, msg: `Extraindo questões de "${rotulo}"…` });
      store.encerrarLoteGeracao();
      if (qs == null) return;
      toast(qs.length ? `${plural(qs.length, "questão extraída", "questões extraídas")} de "${rotulo}".` : "Não encontrei questões prontas neste tópico do material.", qs.length ? "ok" : "erro");
      if (qs.length) app.navigate("pratica", { lote: loteEx, loteRotulo: rotEx });
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

  // Q7: se o material foi extraído em BLOCOS (sumário), pergunta de qual PARTE gerar — todo o
  // material ou um ou MAIS subtópicos específicos (marca vários — pedido do usuário: "e se eu
  // quiser dois?"). Retorna { bloco } (1 ou nenhum) ou { blocos } (2+, cada geração por-contagem
  // divide N entre eles — ver distribuirN), ou null (cancelou).
  async function escolherEscopoGeracao(id) {
    const d = store.get().documentos.find((x) => x.id === id);
    const blocos = (d && d.estrutura && d.estrutura.blocos) || [];
    const nPag = ((d && d.paginas) || []).length;
    if (blocos.length < 2 && nPag < 2) return { bloco: null }; // nada a escolher → material inteiro
    if (blocos.length < 2) {
      // Sem sumário (ou só 1 bloco): mantém o fluxo simples de antes (lista de 1 escolha).
      const opcoes = [
        { label: "Todo o material", value: "-1", cls: "btn-soft" },
        ...blocos.map((b, i) => ({ label: `${b.numero || ""} ${b.titulo}`.trim() || `Tópico ${i + 1}`, value: String(i) })),
        { label: `Escolher páginas… (1–${nPag})`, value: "pag" },
      ];
      const v = await escolher("Gerar a partir de qual parte do material?", opcoes, { lista: true });
      if (v === null || v === undefined) return null;
      if (v === "pag") {
        const faixa = await pedirFaixaPaginas(nPag);
        if (!faixa) return null;
        return { bloco: { numero: "", titulo: `págs ${faixa.de}–${faixa.ate}`, pIni: faixa.de, pFim: faixa.ate, nivel: 1, topicoId: null, banca: null, tipo: "teoria" } };
      }
      const idx = parseInt(v, 10);
      return { bloco: idx >= 0 ? blocos[idx] : null };
    }
    // 2+ blocos: pergunta o MODO primeiro, depois abre o checkbox múltiplo se for por subtópico.
    const modoOpcoes = [
      { label: "Todo o material", value: "inteiro" },
      { label: "Um ou mais subtópicos do índice", value: "sub" },
    ];
    if (nPag >= 2) modoOpcoes.push({ label: `Escolher páginas… (1–${nPag})`, value: "pag" });
    const modoV = await escolher("Gerar a partir de quê?", modoOpcoes);
    if (!modoV) return null;
    if (modoV === "inteiro") return { bloco: null };
    if (modoV === "pag") {
      const faixa = await pedirFaixaPaginas(nPag);
      if (!faixa) return null;
      return { bloco: { numero: "", titulo: `págs ${faixa.de}–${faixa.ate}`, pIni: faixa.de, pFim: faixa.ate, nivel: 1, topicoId: null, banca: null, tipo: "teoria" } };
    }
    const opcoes = blocos.map((b, i) => ({ label: `${b.numero || ""} ${b.titulo}`.trim() || `Tópico ${i + 1}`, value: String(i) }));
    const vals = await escolherVarios("De quais subtópicos? (marque um ou mais)", opcoes);
    if (!vals || !vals.length) return null;
    const idxs = vals.map((v) => parseInt(v, 10));
    if (idxs.length === 1) return { bloco: blocos[idxs[0]] };
    return { blocos: idxs.map((i) => blocos[i]).filter(Boolean) };
  }
  // Gera por-contagem (flashcards/questões/CE) considerando VÁRIOS blocos: divide N entre eles
  // (distribuirN) e chama `gerarUm` uma vez por bloco — garante que todo bloco marcado entra de
  // fato na geração (não só o primeiro), mesmo raciocínio já aplicado a tópicos/escopo.
  async function gerarPorBlocos(id, blocos, n, dificuldade, gerarUm) {
    const fatias = store.distribuirN(n, blocos.length);
    const out = [];
    for (let i = 0; i < blocos.length; i++) {
      if (!fatias[i]) continue;
      out.push(...await gerarUm(id, fatias[i], dificuldade, blocos[i]));
    }
    return out;
  }
  // Rótulo do lote de geração (para o filtro "só os recém-gerados" na tela de destino).
  const rotuloDoc = (id, bloco, blocos) => {
    const d = store.get().documentos.find((x) => x.id === id);
    const t = (d && d.titulo) || "material";
    if (blocos && blocos.length) return `de «${blocos.map((b) => (b.titulo || "").trim()).filter(Boolean).join(" + ") || t}»`;
    return bloco ? `de «${(bloco.titulo || "").trim() || t}»` : `do material «${t}»`;
  };

  bindActions(root, {
    "toggle-form": () => abrirImportarMaterial(app),
    abrir: (el) => {
      const id = el.getAttribute("data-id");
      abertoId = abertoId === id ? null : id;
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
      const fonte = id ? (await store.binarioDoc(id)).pdfData : pendingPdf;
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
    // Recolher/expandir TODOS os grupos de uma vez. O estado de cada um também é lembrado
    // quando o usuário abre ou fecha à mão (listener logo abaixo do render).
    "doc-grupos-toggle": () => {
      const titulos = [...root.querySelectorAll("details.doc-grupo")].map((d) => d.getAttribute("data-grupo"));
      if (gruposRecolhidos.size) gruposRecolhidos.clear();
      else titulos.forEach((t) => gruposRecolhidos.add(t));
      app.refresh();
    },
    "doc-disciplina": async (el) => {
      const id = el.getAttribute("data-id");
      const st0 = store.get();
      const d = st0.documentos.find((x) => x.id === id);
      if (!d) return;
      if (!st0.disciplinas.length) return toast("Cadastre as disciplinas do edital primeiro.", "erro");
      const cursos = cursosConhecidos(st0);
      const grupos = [
        { rotulo: "Disciplinas do edital", aberto: true, itens: st0.disciplinas.map((x) => ({ label: x.nome, value: x.id })) },
        ...(cursos.length ? [{ rotulo: "Cursos fora do edital", itens: cursos.map((c) => ({ label: c, value: `curso:${c}` })) }] : []),
        { rotulo: "Outros", itens: [{ label: "Outro curso (digitar o nome)…", value: "__outro" }, { label: `— ${GRUPO_AVULSOS} —`, value: "" }] },
      ];
      const escolhida = await escolher(`Disciplina de "${d.titulo}":`, [], { grupos });
      if (escolhida === null) return;
      let discId = null, curso = null;
      if (escolhida === "__outro") {
        curso = (await pedirTexto("Nome do curso (fora do edital):", { valor: (disciplinaDoDocumento(st0, d) || {}).nome || "" }) || "").trim();
        if (!curso) return;
      } else if (escolhida.startsWith("curso:")) curso = escolhida.slice(6);
      else if (escolhida) discId = escolhida;
      store.setDocumentoDisciplina(id, discId, curso);
      const n = (store.get().documentos.find((x) => x.id === id) || {}).topicoIds || [];
      toast(discId
        ? `Disciplina definida — ${plural(n.length, "tópico do edital vinculado", "tópicos do edital vinculados")} dentro dela.`
        : curso ? `Curso "${curso}" definido (os vínculos seguem livres, como convém a curso fora do edital).` : "Material marcado como avulso.");
      app.refresh();
    },
    "doc-renomear": async (el) => {
      const id = el.getAttribute("data-id");
      const d = store.get().documentos.find((x) => x.id === id);
      if (!d) return;
      const nome = await pedirTexto("Renomear material:", { valor: d.titulo });
      if (nome && nome.trim()) { store.renomearDocumento(id, nome); app.refresh(); }
    },
    "editar-topicos": (el) => {
      const id = el.getAttribute("data-id");
      topicosDocAberto = topicosDocAberto === id ? null : id;
      app.refresh();
    },
    "vincular-original": async (el) => {
      const id = el.getAttribute("data-id");
      const caminho = await store.vincularArquivoOriginal(id);
      if (caminho) { toast("Arquivo vinculado. O app guarda só o caminho.", "ok"); app.refresh(); }
    },
    "abrir-original": async (el) => {
      const r = await store.abrirArquivoOriginal(el.getAttribute("data-id"));
      if (!r.ok) toast(r.erro || "Não consegui abrir o arquivo.", "erro");
    },
    "ler-pdf": async (el) => {
      const d = store.get().documentos.find((x) => x.id === el.getAttribute("data-id"));
      if (!store.temPdfDoc(d)) return;
      const { pdfData } = await store.binarioDoc(d.id);
      if (pdfData) abrirVisualizadorPdf(pdfData, d.titulo);
    },
    // F4: abre o PDF já na página inicial do bloco.
    "ler-pdf-pag": async (el) => {
      const d = store.get().documentos.find((x) => x.id === el.getAttribute("data-id"));
      const pag = parseInt(el.getAttribute("data-pag"), 10) || 1;
      if (!store.temPdfDoc(d)) return;
      const { pdfData } = await store.binarioDoc(d.id);
      if (pdfData) abrirVisualizadorPdf(pdfData, d.titulo, pag);
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
    // Menu "···": "Atualizar material" — traz a versão nova do arquivo PARA ESTE material
    // (destino explícito, sem depender do casamento por título, que falha justamente quando o
    // cursinho renomeia o arquivo entre uma versão e outra).
    "atualizar-doc": (el) => abrirImportarMaterial(app, el.getAttribute("data-id")),
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
    // Etiqueta "N páginas escaneadas" do cartão: abre o material e rola até o aviso, que traz
    // o botão de ler as páginas. Antes a etiqueta não fazia nada — informava um problema e
    // deixava o usuário sem saída.
    "ir-ocr": (el) => {
      const id = el.getAttribute("data-id");
      abertoId = id;
      app.refresh();
      setTimeout(() => {
        const alvo = document.querySelector(`[data-foco-id="${id}"] .ocr-alerta`);
        if (alvo) {
          alvo.scrollIntoView({ behavior: "smooth", block: "center" });
          alvo.classList.add("realce-momento");
          setTimeout(() => alvo.classList.remove("realce-momento"), 1600);
        }
      }, 60);
    },
    // Descrever FIGURAS com a IA, sob demanda: UM comando descreve todas as que faltam no
    // material (uma requisição por página com figura). Deixou de ser automático na importação
    // em fila porque 17 apostilas seguidas estouravam a cota.
    "descrever-figuras": async (el) => {
      const id = el.getAttribute("data-id");
      if (!store.iaDisponivel()) return avisoIA(app, "Descrever figuras");
      const d = store.get().documentos.find((x) => x.id === id);
      const faltam = store.figurasPendentes(d).length;
      if (!faltam) return toast("As figuras deste material já estão descritas.", "ok");
      const fim = toastCarregando(`Lendo figuras… 0 de ${faltam}`, { aoCancelar: () => store.pararLeituraFiguras() });
      let r = null;
      store.iniciarLeituraFiguras();
      try {
        // `toastCarregando` devolve uma função: com texto ATUALIZA o rótulo, sem texto FECHA.
        r = await store.descreverFigurasDeDoc(id, {
          onProgresso: ({ feitas, total }) => fim(`Lendo figuras… ${feitas} de ${total}`),
        });
      } finally { fim(); }
      const restam = store.figurasPendentes(store.get().documentos.find((x) => x.id === id)).length;
      toast(mensagemFiguras(r, faltam - restam, restam), r && r.parou ? "erro" : "ok");
      store.indexarFonteAuto(id);
      app.refresh();
    },
    // Páginas escaneadas de TODOS os materiais, em sequência (mesmo caminho do botão que já
    // existe dentro do cartão, só que sem obrigar a abrir material por material).
    "ocr-todos": async () => {
      if (!store.iaDisponivel()) return avisoIA(app, "Reconhecer texto por Visão (OCR)");
      const alvos = (store.get().documentos || [])
        .map((d) => ({ d, ns: store.paginasPendentes(d).map((p) => p.n) }))
        .filter((x) => x.ns.length);
      if (!alvos.length) return toast("Não há páginas escaneadas pendentes.", "ok");
      for (const { d, ns } of alvos) {
        await processarOcr(app, store, d, ns);
        // Alguma sobrou (cota/erro/cancelamento)? Não insiste nos materiais seguintes.
        if (store.paginasPendentes(store.get().documentos.find((x) => x.id === d.id) || d).length) break;
      }
      app.refresh();
    },
    // O mesmo, para TODOS os materiais com figura pendente, em sequência.
    "figuras-todos": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Descrever figuras");
      const alvos = (store.get().documentos || [])
        .map((d) => ({ d, faltam: store.figurasPendentes(d).length }))
        .filter((x) => x.faltam);
      if (!alvos.length) return toast("Não há figuras pendentes.", "ok");
      const totalPaginas = alvos.reduce((a, x) => a + x.faltam, 0);
      store.iniciarLeituraFiguras();
      // Um orçamento para a rodada TODA (não por material): a reserva é a fonte cara.
      // `max: 0` = só Gemini (a reserva paga fica desligada). O usuário liga quando quiser
      // pagar pela leitura das páginas que o Gemini recusar.
      const orcamentoReserva = { usadas: 0, max: 0 };
      let jaFeitas = 0; // fechadas nos materiais anteriores
      let parou = false;
      let ultimo = null; // resultado do último material (traz o motivo de parar e a contagem)
      // Acompanhamento no padrão da casa: botão ocupado + toast de carregando com a contagem
      // (é o bastante para saber que está andando) e Cancelar, como na leitura de páginas
      // escaneadas. Erro e resultado saem no toast do fim.
      if (el) el.disabled = true;
      const fim = toastCarregando(`Lendo figuras… 0 de ${totalPaginas}`, { aoCancelar: () => store.pararLeituraFiguras() });
      try {
        for (const { d, faltam } of alvos) {
          const r = await store.descreverFigurasDeDoc(d.id, {
            orcamentoReserva,
            onProgresso: ({ feitas }) => fim(`Lendo figuras… ${jaFeitas + feitas} de ${totalPaginas}`),
          });
          jaFeitas += faltam - store.figurasPendentes(store.get().documentos.find((x) => x.id === d.id) || d).length;
          store.indexarFonteAuto(d.id);
          ultimo = r;
          if (r && r.parou) { parou = true; break; }
        }
      } finally {
        fim();
        if (el) el.disabled = false;
      }
      const restam = (store.get().documentos || []).reduce((a, d) => a + store.figurasPendentes(d).length, 0);
      toast(mensagemFiguras(ultimo, totalPaginas - restam, restam), parou || restam ? "erro" : "ok");
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
      if (escopo.blocos) {
        // Mapa é UMA árvore só (sem "quantidade" pra dividir): junta o conteúdo dos blocos
        // marcados num bloco SINTÉTICO (textoOverride), fatia igual por bloco no orçamento de
        // caracteres — mesmo raciocínio de gerarMapaMentalDeTopicos, pra nenhum ficar de fora.
        const cota = Math.floor(8000 / escopo.blocos.length);
        const partes = escopo.blocos.map((b) => { const t = (b.textoOverride || b.titulo || "").toString(); return t.length > cota ? t.slice(0, cota) + "\n[...]" : t; });
        const sintetico = { numero: "", titulo: escopo.blocos.map((b) => (b.titulo || "").trim()).filter(Boolean).join(" + "), textoOverride: partes.join("\n\n---\n\n"), topicoId: null, banca: null };
        gerarEAbrirMapa(store, app, () => store.gerarMapaMentalDeMaterial(id, sintetico));
        return;
      }
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
      const rot = rotuloDoc(id, escopo.bloco, escopo.blocos);
      const lote = store.iniciarLoteGeracao(rot);
      const cards = await comOcupado(
        () => escopo.blocos ? gerarPorBlocos(id, escopo.blocos, n, dificuldade, store.gerarFlashcardsDeDoc.bind(store)) : store.gerarFlashcardsDeDoc(id, n, dificuldade, escopo.bloco),
        { botao: el, msg: "Gerando flashcards…" }
      );
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
      const rot = rotuloDoc(id, escopo.bloco, escopo.blocos);
      const lote = store.iniciarLoteGeracao(rot);
      const qs = await comOcupado(
        () => escopo.blocos ? gerarPorBlocos(id, escopo.blocos, n, dificuldade, store.gerarQuestoesDeDoc.bind(store)) : store.gerarQuestoesDeDoc(id, n, dificuldade, escopo.bloco),
        { botao: el, msg: "Gerando questões…" }
      );
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
      const rot = rotuloDoc(id, escopo.bloco, escopo.blocos);
      const lote = store.iniciarLoteGeracao(rot);
      const itens = await comOcupado(
        () => escopo.blocos ? gerarPorBlocos(id, escopo.blocos, n, dificuldade, store.gerarQuestoesCEDeDoc.bind(store)) : store.gerarQuestoesCEDeDoc(id, n, dificuldade, escopo.bloco),
        { botao: el, msg: "Gerando itens Certo/Errado…" }
      );
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
      const rotEx = rotuloDoc(id, escopo.bloco, escopo.blocos);
      const loteEx = store.iniciarLoteGeracao(rotEx); // extrair também abre só o recém-criado
      // Extração não tem "quantidade" pra dividir — cada bloco marcado é varrido por inteiro.
      const qs = await comOcupado(
        () => escopo.blocos
          ? (async () => { const out = []; for (const b of escopo.blocos) out.push(...await store.extrairQuestoesDeDoc(id, b)); return out; })()
          : store.extrairQuestoesDeDoc(id, escopo.bloco),
        { botao: el, msg: "Extraindo do material…" }
      );
      store.encerrarLoteGeracao();
      if (qs == null) return;
      toast(qs.length ? `${plural(qs.length, "questão extraída", "questões extraídas")} (quando o gabarito estava no material).` : "Não encontrei questões prontas neste material.", qs.length ? "ok" : "erro");
      if (qs.length) app.navigate("pratica", { lote: loteEx, loteRotulo: rotEx });
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
      if (!d || !store.temPdfDoc(d)) return toast("Sem PDF salvo para reanalisar.", "erro");
      const paginas = await comOcupado(async () => {
        const { pdfData: pdfSalvo } = await store.binarioDoc(d.id);
        if (!pdfSalvo) return toast("Sem PDF salvo para reanalisar.", "erro");
        const r = await extrairPdfPaginas(pdfSalvo);
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
          fim(`Preparando a busca… ${feito} de ${total} trechos${total ? ` (${Math.round((feito / total) * 100)}%)` : ""} · ${titulo}`), { ids: pend });
        fim();
        toast(`Busca inteligente atualizada (${plural(r.feitos, "material", "materiais")}).`, "ok");
      } catch (e) {
        fim();
        console.error(e);
        // Cota estourada não se resolve "em instantes" — e o que já foi indexado ficou
        // gravado, então dizer isso evita a impressão de que o trabalho se perdeu.
        if (e && e.code === "COTA") toast(e.message, "erro");
        else if (e && e.code === "EMB_SEM_GEMINI") toast(e.message, "erro");
        else toast("Não consegui atualizar o índice agora. Tente de novo em instantes.", "erro");
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
    let ok = 0;
    let erroPag = null;
    // Transcreve UMA página por vez (rasterizarPaginasStream) em vez de rasterizar todas antes.
    // Antes, "Ler páginas escaneadas (40+)" gerava dezenas de canvas de página inteira e
    // guardava todas as imagens no array ao mesmo tempo — no celular isso mata a aba.
    const transcrever = async (img, i, total) => {
      if (cancelado) return false;
      fim(`Lendo páginas escaneadas… ${i + 1}/${total} (pág. ${img.n})`);
      try {
        await store.ocrPagina(doc.id, img.n, img.dataUrl);
        ok++;
        return true;
      } catch (e) {
        console.error(e);
        erroPag = img.n;
        return false; // interrompe o fluxo; o que já foi transcrito está salvo
      }
    };

    const bin = await store.binarioDoc(doc.id);
    if (bin.imgData && !bin.pdfData) {
      if (listaN.includes(1)) await transcrever({ n: 1, dataUrl: bin.imgData }, 0, 1);
    } else if (bin.pdfData) {
      await rasterizarPaginasStream(bin.pdfData, listaN, transcrever);
    } else {
      fim();
      return toast("Sem PDF/imagem salvos para processar (arquivo grande não foi guardado).", "erro");
    }

    fim();
    if (erroPag != null) {
      toast(`A leitura parou na página ${erroPag}. O que já foi transcrito está salvo; tente as restantes em instantes.`, "erro");
      app.refresh();
      return;
    }
    if (cancelado) toast(`Leitura interrompida — ${plural(ok, "página transcrita ficou salva", "páginas transcritas ficaram salvas")}.`, "ok");
    else if (ok) toast(`${plural(ok, "página transcrita", "páginas transcritas")} — confira o texto.`, "ok");
    app.refresh();
  } finally {
    ocrEmCurso = false;
  }
}

// Materiais filtrados pela busca textual E pelo filtro multi-tópico.
function docsFiltrados(store, st) {
  // Só a busca por texto: o "quais materiais cobrem o tópico X" mora no Dossiê do tópico, que
  // responde melhor (lista os materiais COM as páginas). O filtro daqui olhava só o tópico
  // primário do material — com uma aula cobrindo 30 tópicos, quase nunca achava nada.
  return store.buscarDocumentos(busca);
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
      <details class="doc-grupo" data-grupo="${esc(g.titulo)}" ${busca || !gruposRecolhidos.has(g.titulo) ? "open" : ""}>
        <summary class="doc-grupo-head"><span class="doc-grupo-seta">${icone("chevron-right")}</span>${esc(g.titulo)} <span class="doc-grupo-n">${g.docs.length}</span></summary>
        ${g.docs.map((d) => docHTML(store, st, d, busca, modo === "disciplina" ? g.titulo : "")).join("")}
      </details>`
    )
    .join("");
}

// Disciplina de um material que cobre VÁRIOS tópicos (uma apostila cobre a disciplina
// inteira): a que tem mais blocos do sumário. Antes valia só `d.topicoId` — o primeiro tópico
// vinculado —, então uma apostila de 47 blocos era arquivada pela disciplina do bloco 1, e
// bastava o primeiro capítulo ser de outra matéria para ela sumir do grupo certo.
// Rótulo curto para o "chip" de tópico do cartão. No edital do 192º, 1 tópico = 1 item
// inteiro do edital, com todas as subdivisões separadas por "·" — o item (11) de Bens
// Públicos tem 18 delas, e o cartão do material virava um parágrafo. Mostra
// "Disciplina · (11) primeiro pedaço…" e deixa o nome completo no tooltip.
function rotuloCurtoTopico(nome, max = 64) {
  const partes = String(nome || "").split(" · ");
  let curto = partes.length > 2 ? `${partes[0]} · ${partes[1]}` : String(nome || "");
  if (curto.length > max) curto = curto.slice(0, max - 1).trimEnd();
  return curto.length < String(nome || "").length ? `${curto}…` : curto;
}

function disciplinaDoDoc(st, d) {
  return disciplinaDoDocumento(st, d);
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
      const disc = disciplinaDoDoc(st, d);
      nome = disc ? disc.nome : GRUPO_AVULSOS;
    }
    if (!grupos.has(nome)) grupos.set(nome, []);
    grupos.get(nome).push(d);
  }
  // Dentro do grupo, ordem natural pelo título ("Aula 2" antes de "Aula 10") — e não a ordem
  // de importação, que espalhava os PDFs de uma mesma matéria conforme a data de cada lote.
  for (const [k, v] of grupos) grupos.set(k, ordenarDocumentos(st, v));
  return [...grupos.entries()]
    .sort((a, b) => {
      const sa = a[0] === GRUPO_AVULSOS || /^Sem /.test(a[0]);
      const sb = b[0] === GRUPO_AVULSOS || /^Sem /.test(b[0]);
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

// `alvo` = material que está sendo ATUALIZADO (veio de "Atualizar com arquivo novo"). Nesse
// modo o destino é explícito: não se procura material de mesmo título, então renomear o
// arquivo no cursinho não cria mais uma cópia solta.
function formHTML(opcoesTopico, alvo, opcoesDisciplina = "", discSelecionada = "", cursoSelecionado = "") {
  return `
    <div class="card form-doc">
      <h3>${alvo ? `Atualizar “${esc(alvo.titulo)}”` : "Adicionar material"}</h3>
      ${alvo ? `<p class="muted small u-mt-0">Traga a versão nova do arquivo. As questões, flashcards e mapas gerados daqui, os tópicos do edital já vinculados e o histórico de estudo <b>continuam valendo</b>; o texto e o sumário são substituídos pelos do arquivo novo.</p>` : ""}
      <div class="form-row">
        <label class="u-grow-2">Título <input id="doc-titulo" type="text" value="${alvo ? esc(alvo.titulo) : ""}" placeholder="Ex.: Aula 3: Atos administrativos" /></label>
        <label class="u-grow">Tópico <select id="doc-top"><option value="">— sem tópico —</option>${opcoesTopico}</select></label>
      </div>
      <div class="form-row">
        <label class="u-grow" data-tip="Vale para TODOS os arquivos desta importação. É o que agrupa a lista, organiza os seletores de «Gerar com IA» e limita a quais tópicos do edital o sumário pode se vincular." data-tip-pos="cima-esq">Disciplina
          <select id="doc-disc"><option value="">— deduzir pelo nome do arquivo —</option>${opcoesDisciplina}</select>
        </label>
        <label class="u-grow" id="doc-curso-wrap" ${discSelecionada === "__outro" ? "" : "hidden"}>Nome do curso
          <input id="doc-curso" type="text" value="${esc(cursoSelecionado)}" placeholder="Ex.: Legislação Penal Especial" />
        </label>
      </div>
      <p class="muted small u-mt-0">Curso que não é disciplina do seu edital (Legislação Penal Especial, Difusos e Coletivos) entra pelo nome dele e ganha grupo próprio. Material geral (edital, guia, resumo de véspera) pode ficar sem nenhum — vai para "Avulsos (sem disciplina)", no fim da lista e dos seletores.</p>
      <label class="btn btn-ghost btn-file" data-tip="PDF, imagem ou texto (.txt). Pode escolher VÁRIOS de uma vez (eles entram em fila) ou arrastar os arquivos para este cartão.">${icone("paperclip")} ${alvo ? "Selecionar arquivo" : "Selecionar arquivos"}
        <input id="doc-file" type="file" accept=".pdf,.txt,.md,.jpg,.jpeg,.png,.webp,application/pdf,text/plain,image/jpeg,image/png,image/webp" ${alvo ? "" : "multiple"} hidden />
      </label>
      <label>Conteúdo <textarea id="doc-texto" rows="6" placeholder="${esc("Cole aqui o conteúdo da aula (ou importe um arquivo acima).\nEx.: Atos administrativos são toda manifestação unilateral de vontade da Administração… Atributos: presunção de legitimidade, imperatividade, autoexecutoriedade…")}"></textarea></label>
      <div id="doc-estrutura"></div>
      <p class="muted small">De PDFs e imagens, o texto é extraído automaticamente. Páginas escaneadas ou com tabelas e organogramas ficam pendentes e podem ser processadas com a Visão (IA) quando você quiser (apenas nelas).</p>
      <p class="muted small">Importe apenas material que você tem direito de usar. O conteúdo fica só neste dispositivo. PDFs protegidos por senha/DRM não são abertos (o app não burla proteções).</p>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="cancelar-form">Cancelar</button>
        <button class="btn btn-primary" data-action="add-doc">${alvo ? "Atualizar material" : "Salvar na base"}</button>
      </div>
    </div>`;
}

// Janela modal "Adicionar material" — fluxo stateful (arquivo/colar → texto + estrutura
// editável → salvar). Diferente dos outros: o painel de estrutura re-renderiza
// CIRURGICAMENTE em #doc-estrutura (sem recriar o form, p/ não apagar título/texto),
// então NÃO uso o render-loop completo; uso abrirJanela + estado local `pend`.
// Os pendentes (pdf/img/paginas/estrutura) vivem em `pend` (não nos globais), p/ não
// interferir nos handlers inline de estrutura dos materiais JÁ SALVOS.
function abrirImportarMaterial(app, alvoId = null) {
  const { store } = app;
  const st0 = store.get();
  const alvo = alvoId ? st0.documentos.find((d) => d.id === alvoId) || null : null;
  const opcoesTopico = st0.topicos.map((t) => `<option value="${t.id}">${esc(nomeTopico(st0, t))}</option>`).join("");
  // Disciplina do material: a do material que está sendo atualizado, ou nada (o campo oferece
  // "deduzir pelo nome do arquivo", que é o comportamento antigo).
  const dAlvo = alvo ? disciplinaDoDocumento(st0, alvo) : null;
  const discAtual = dAlvo ? (dAlvo.tipo === "edital" ? dAlvo.id : "__outro") : "";
  const cursoAtual = dAlvo && dAlvo.tipo === "curso" ? dAlvo.nome : "";
  const cursos = cursosConhecidos(st0).filter((c) => c !== cursoAtual);
  const opcoesDisciplina =
    `<optgroup label="Disciplinas do edital">${st0.disciplinas.map((x) => `<option value="${x.id}" ${x.id === discAtual ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</optgroup>` +
    (cursos.length || cursoAtual
      ? `<optgroup label="Cursos fora do edital">${[cursoAtual, ...cursos].filter(Boolean).map((c) => `<option value="curso:${esc(c)}" ${c === cursoAtual ? "selected" : ""}>${esc(c)}</option>`).join("")}</optgroup>`
      : "") +
    `<option value="__outro">Outro curso (digitar o nome)…</option>` +
    `<option value="__nenhuma">— sem disciplina (material geral) —</option>`;
  const pend = { pdf: null, img: null, paginas: null, estrutura: null };
  abrirJanela({
    titulo: alvo ? "Atualizar material" : "Adicionar material",
    corpoHTML: formHTML(opcoesTopico, alvo, opcoesDisciplina, discAtual, cursoAtual),
    aoMontar: (overlay, fechar) => {
      const corpo = overlay.querySelector(".mm-corpo");
      const reEstrutura = () => { const c = corpo.querySelector("#doc-estrutura"); if (c) c.innerHTML = pend.estrutura ? estruturaResumoHTML(pend.estrutura, store) : ""; };

      // ---- upload de arquivo (#doc-file): mesma lógica do importador inline antigo,
      // escopada ao corpo da janela e gravando em `pend`. ----
      // Aviso de direitos: uma vez por aparelho, e ANTES de uma fila começar (não no meio).
      const confirmarAvisoDireitos = async () => {
        if (store.get().config.materialAvisoAceito) return true;
        const ok = await confirmar("Importe apenas material que você tem direito de usar. Ele fica só neste dispositivo. Continuar?");
        if (ok) store.setConfig({ materialAvisoAceito: true });
        return ok;
      };

      // Salva o que está na janela (campos + `pend`). É o mesmo caminho do botão "Salvar na
      // base" e de cada arquivo da fila — daí estar fora do handler.
      // Um só lugar traduz o seletor: "" = deduzir pelo nome (comportamento antigo),
      // id = disciplina do edital, "curso:Nome" ou "__outro" = curso fora do edital,
      // "__nenhuma" = material geral, que fica sem disciplina de propósito.
      const lerEscolhaDisciplina = () => {
        const v = corpo.querySelector("#doc-disc")?.value || "";
        if (!v) return { deduzir: true, disciplinaId: null, cursoNome: null };
        if (v === "__nenhuma") return { deduzir: false, disciplinaId: null, cursoNome: null, semDisciplina: true };
        if (v === "__outro") return { deduzir: false, disciplinaId: null, cursoNome: (corpo.querySelector("#doc-curso")?.value || "").trim() || null };
        if (v.startsWith("curso:")) return { deduzir: false, disciplinaId: null, cursoNome: v.slice(6) };
        return { deduzir: false, disciplinaId: v, cursoNome: null };
      };

      const salvarPendente = async ({ silencioso, perguntarExistente } = {}) => {
        const titulo = corpo.querySelector("#doc-titulo").value.trim();
        const texto = corpo.querySelector("#doc-texto").value.trim();
        const topicoId = corpo.querySelector("#doc-top").value;
        const esc0 = lerEscolhaDisciplina();
        if (pend.estrutura) lerEstruturaDoDOM(corpo, pend.estrutura);
        // Veio de "Atualizar com arquivo novo": o destino já é conhecido, não se pergunta
        // nem se procura por título — é justamente o caso em que o cursinho renomeia o
        // arquivo e o casamento por nome falharia, criando uma cópia solta em silêncio.
        if (alvo) {
          if (!esc0.deduzir) store.setDocumentoDisciplina(alvo.id, esc0.disciplinaId, esc0.cursoNome);
          store.atualizarMaterialDeImport(alvo.id, { titulo, texto, paginas: pend.paginas, pdfData: pend.pdf, imgData: pend.img, estrutura: pend.estrutura });
          if (!silencioso) store.indexarFonteAuto(alvo.id);
          if (!silencioso) toast("Material atualizado. Questões, flashcards e vínculos preservados.", "ok");
          await store.aguardarGravacao();
          return "atualizado";
        }
        const existente = (pend.pdf || pend.img) ? store.acharDocPorTitulo(titulo) : null;
        if (existente) {
          // Na fila, reimportar a apostila de mesmo nome SEMPRE atualiza: é o que "trouxe a
          // versão nova do cursinho" quer dizer, e ninguém quer 17 perguntas seguidas.
          const atualizar = perguntarExistente
            ? await confirmar(`Já existe um material chamado "${titulo}". Atualizar ele com esta importação (mantém as questões/flashcards/marcações e os tópicos já confirmados)? Escolha Cancelar para criar um novo.`)
            : true;
          if (atualizar) {
            if (!esc0.deduzir) store.setDocumentoDisciplina(existente.id, esc0.disciplinaId, esc0.cursoNome);
            store.atualizarMaterialDeImport(existente.id, { texto, paginas: pend.paginas, pdfData: pend.pdf, imgData: pend.img, estrutura: pend.estrutura });
            if (!silencioso) store.indexarFonteAuto(existente.id); // na fila não: estoura a cota (ver acima)
            if (!silencioso) toast("Material atualizado (mesmo id; vínculos preservados).", "ok");
            await store.aguardarGravacao();
            return "atualizado";
          }
        }
        const topsEstr = pend.estrutura ? [...new Set(pend.estrutura.blocos.map((b) => b.topicoId).filter(Boolean))] : [];
        const doc = store.addDocumento({
          titulo,
          texto,
          topicoId: topicoId || null,
          topicoIds: topsEstr.length ? topsEstr : topicoId ? [topicoId] : [],
          disciplinaId: esc0.disciplinaId,
          cursoNome: esc0.cursoNome,
          semDisciplina: !!esc0.semDisciplina,
          origem: "importado",
          pdfData: pend.pdf,
          imgData: pend.img,
          paginas: pend.paginas,
          estrutura: pend.estrutura,
        });
        if (doc && pend.estrutura) store.aplicarEstruturaAoMaterial(doc.id, pend.estrutura);
        // Busca inteligente: indexa o material novo em background (silencioso; no-op se a
        // busca nunca foi ativada ou a IA está desconectada). Na FILA não: uma apostila rende
        // ~1.300 trechos e 17 delas estouram a cota do Gemini na hora (HTTP 429 já no 2º
        // arquivo, medido). Fica para o "Indexar" de Materiais, que faz todos de uma vez.
        if (doc && !silencioso) store.indexarFonteAuto(doc.id);
        // F1 — descrever FIGURAS de conteúdo com a IA, automático e em BACKGROUND (não bloqueia).
        // Na FILA isso não roda: uma apostila tem dezenas de figuras e 17 arquivos seguidos
        // estouram a cota do Gemini (medido: HTTP 429 já no 3º arquivo, limite de 15 req/min
        // do plano grátis). Fica para o botão "Descrever figuras" de cada material.
        const temFig = !silencioso && doc && store.iaDisponivel() && Array.isArray(pend.paginas) && pend.paginas.some((p) => p.temImagem);
        if (temFig) {
          const fim = toastCarregando("Descrevendo as figuras do material com a IA…");
          store.descreverFigurasDeDoc(doc.id).then((r) => { fim(); if (r && r.descritas) toast(`${plural(r.descritas, "figura descrita", "figuras descritas")} pela IA (já entram na busca).`, "ok"); store.indexarFonteAuto(doc.id); /* o texto ganhou as descrições → reindexa */ }).catch(() => fim());
        }
        if (store.get().config.descartarPdfAposImport && doc && store.temBinario(doc) && store.paginasPendentes(doc).length === 0 && !temFig) {
          store.descartarBinarioDoc(doc.id);
        }
        if (!silencioso) toast("Material adicionado à base.");
        // Espera a gravação REAL terminar (debounce + escrita): é o que impede a próxima
        // janela de abrir enquanto o app ainda escreve dezenas de MB.
        await store.aguardarGravacao();
        return "novo";
      };

      // "Outro curso…" revela o campo de texto; qualquer outra escolha o esconde.
      const discSel = corpo.querySelector("#doc-disc");
      const cursoWrap = corpo.querySelector("#doc-curso-wrap");
      discSel?.addEventListener("change", () => {
        const outro = discSel.value === "__outro";
        if (cursoWrap) {
          cursoWrap.hidden = !outro;
          if (outro) corpo.querySelector("#doc-curso")?.focus();
        }
        // O sumário já lido foi casado com a disciplina de ANTES. Trocar a disciplina e salvar
        // sem re-casar guardaria vínculos da matéria errada — justamente o que este campo veio
        // evitar. Re-casa na hora e repinta o preview, para a correção ficar à vista.
        if (!pend.estrutura) return;
        const e = lerEscolhaDisciplina();
        store.casarEstruturaComEdital(pend.estrutura, corpo.querySelector("#doc-titulo")?.value || "", { disciplinaId: e.disciplinaId, ignorarTitulo: !e.deduzir && !e.disciplinaId, limparSemMatch: true });
        reEstrutura();
      });

      corpo.querySelector("#doc-curso")?.addEventListener("change", () => {
        if (!pend.estrutura) return;
        const e = lerEscolhaDisciplina();
        store.casarEstruturaComEdital(pend.estrutura, corpo.querySelector("#doc-titulo")?.value || "", { disciplinaId: e.disciplinaId, ignorarTitulo: true, limparSemMatch: true });
        reEstrutura();
      });

      const fileInput = corpo.querySelector("#doc-file");
      if (fileInput) {
        ligarDropZone(fileInput);
        const docStatus = document.createElement("span");
        docStatus.className = "import-status";
        (fileInput.closest("label") || fileInput).insertAdjacentElement("afterend", docStatus);
        // Linha de progresso da FILA (fica vazia quando é um arquivo só).
        const fila = document.createElement("div");
        fila.className = "muted small u-mt-8";
        docStatus.insertAdjacentElement("afterend", fila);
        let emFila = false;
        const lerArquivo = async (f) => {
          if (!f) return;
          const tituloEl = corpo.querySelector("#doc-titulo");
          if (!tituloEl.value) tituloEl.value = f.name.replace(/\.[^.]+$/, "");
          // Pré-seleciona a disciplina pelo nome do arquivo, sem passar por cima da escolha
          // feita à mão (o campo em branco é "deduzir", então preencher aqui é ganho puro).
          const discEl = corpo.querySelector("#doc-disc");
          if (discEl && !discEl.value) {
            const sug = disciplinaDoDocumento(store.get(), { titulo: f.name.replace(/\.[^.]+$/, "") }, { herdarDeVinculos: false });
            if (sug && sug.tipo === "edital") discEl.value = sug.id;
            else if (sug && sug.tipo === "curso") {
              // Curso fora do edital: usa a opção já existente, ou abre o campo de texto com
              // o nome que veio do arquivo — em nenhum caso o usuário digita de novo.
              const opt = [...discEl.options].find((o) => o.value === `curso:${sug.nome}`);
              if (opt) discEl.value = opt.value;
              else {
                discEl.value = "__outro";
                const inp = corpo.querySelector("#doc-curso");
                if (inp && !inp.value) inp.value = sug.nome;
                if (cursoWrap) cursoWrap.hidden = false;
              }
            }
          }
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
                // Rótulo neutro: só se sabe se a IA entrou depois de o determinístico rodar
                // (ela virou rede, não padrão). O detalhe da etapa diz qual caminho valeu.
                { id: "sumario", rotulo: "Montando o sumário" },
                { id: "texto", rotulo: "Preparando o texto" },
              ]);
              painel.set("ler", "ativa");
              const ab = await f.arrayBuffer();
              const teto = tetoPdfGuardado();
              if (ab.byteLength <= teto) pend.pdf = await abToDataUrl(ab);
              else toast(`PDF acima de ${Math.round(teto / 1024 / 1024)} MB: não será guardado para visualização; o texto extraído continua salvo normalmente.`, "erro");
              const { paginas: paginasBrutas, numPaginas, outline, linhasPorPagina } = await extrairPdfPaginas(
                new File([ab], f.name, { type: "application/pdf" }),
                // Progresso real: 1.289 páginas levam minutos, e a etapa ficava só "Lendo o PDF".
                { onProgresso: (feita, total) => painel.set("ler", "ativa", `página ${feita} de ${total}`) }
              );
              const paginas = limparRuidoDePaginas(paginasBrutas);
              texto = paginas.map((p) => p.texto || "").join("\n\n").trim();
              painel.set("ler", "ok", `${plural(numPaginas || paginas.length, "página", "páginas")}${(numPaginas || 0) > 400 ? " — material grande, gerações podem demorar" : ""}`);
              painel.set("sumario", "ativa");
              try {
                let est = detectarEstrutura({ paginas: paginasBrutas, outline, numPaginas: numPaginas || paginasBrutas.length, linhasPorPagina });
                // A IA é REDE, não padrão. A regra "IA por cima do determinístico" é da F2, quando o
                // leitor determinístico ainda era fraco; depois da v0.8.1 ela passou a trocar o certo
                // pelo errado. Medido nas 17 apostilas do cursinho (339 blocos, gabarito = a página em
                // que o cabeçalho "N.M" abre linha no corpo): índice 316/339, IA por cima 260/339. A IA
                // erra lendo o índice de duas colunas como imagem (no Ambiental, 36→13, 64→32, 90→39).
                // Então só chama a IA quando o determinístico NÃO resolveu: sem sumário, sumário de
                // fonte fraca (outline/fonte/marcador) ou com buraco de página — que é o caso real de
                // apostila escaneada, para o qual a Visão foi feita.
                const estForte = ehEstruturaForte(est);
                let viaIA = false;
                if (iaOn && pend.pdf && !estForte) {
                  try {
                    const estIA = await store.estruturarPorSumarioIA({ paginas: paginasBrutas, pdfData: pend.pdf, numPaginas: numPaginas || paginasBrutas.length });
                    if (estIA && estIA.blocos.length) { est = estIA; viaIA = true; }
                  } catch (_) {}
                }
                pend.estrutura = est && est.blocos.length ? est : null;
                if (pend.estrutura) store.casarEstruturaComEdital(pend.estrutura, corpo.querySelector("#doc-titulo")?.value || f.name, { disciplinaId: lerEscolhaDisciplina().disciplinaId });
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
            if (emFila) throw err; // na fila, quem trata é o laço (segue para o próximo arquivo)
            toast(err.code === "PDF_PROTEGIDO" ? err.message : "Não consegui ler este arquivo. Confira se ele não está protegido por senha e tente de novo, ou cole o texto manualmente.", "erro");
          }
        };

        // FILA: importar a biblioteca inteira de uma vez. O caminho de um arquivo só continua
        // igual (ler → conferir o sumário na tela → salvar); com vários, conferir 17 sumários
        // numa janela não faz sentido, então cada arquivo é lido e salvo em sequência e o
        // relatório vem no fim. Material de mesmo título é ATUALIZADO (mesmo id, vínculos e
        // histórico preservados), que é o que "reimportei a apostila nova" quer dizer.
        const importarFila = async (arquivos) => {
          if (!(await confirmarAvisoDireitos())) return;
          // Sem disciplina — nem escolhida, nem dedutível do nome do arquivo — o sumário casa
          // contra o edital INTEIRO, e é daí que sai vínculo em outra matéria. Avisar antes é
          // barato; descobrir depois custa uma revisão material a material.
          const escFila = lerEscolhaDisciplina();
          const semEscolha = escFila.deduzir; // "— deduzir pelo nome do arquivo —"
          if (semEscolha && !arquivos.some((f) => disciplinaDoDocumento(store.get(), { titulo: f.name.replace(/\.[^.]+$/, "") }, { herdarDeVinculos: false }))) {
            const segue = await confirmar(`Nenhuma disciplina escolhida para estes ${arquivos.length} arquivos, e o nome deles não indica uma. Os tópicos do sumário vão ser procurados em TODO o edital, o que costuma gerar vínculo na matéria errada. Importar assim mesmo?`);
            if (!segue) return;
          }
          emFila = true;
          const tituloEl = corpo.querySelector("#doc-titulo");
          const botaoSalvar = corpo.querySelector('[data-action="add-doc"]');
          if (botaoSalvar) botaoSalvar.disabled = true;
          const feitos = [], falhos = [];
          for (let i = 0; i < arquivos.length; i++) {
            const f = arquivos[i];
            fila.textContent = `Importando ${i + 1} de ${arquivos.length} — ${f.name}`;
            tituloEl.value = ""; // cada arquivo traz o próprio nome
            try {
              await lerArquivo(f);
              await salvarPendente({ silencioso: true });
              feitos.push(f.name);
            } catch (err) {
              console.error(err);
              falhos.push(f.name);
            }
          }
          emFila = false;
          if (botaoSalvar) botaoSalvar.disabled = false;
          fila.textContent = `${plural(feitos.length, "material importado", "materiais importados")}${falhos.length ? ` · ${falhos.length} falharam: ${falhos.join(", ")}` : ""}`;
          toast(
            `${plural(feitos.length, "material importado", "materiais importados")}${falhos.length ? `; ${plural(falhos.length, "arquivo falhou", "arquivos falharam")}` : ""}.` +
              (store.iaDisponivel() ? " A busca por significado e a descrição de figuras ficam para quando você pedir (evita estourar a cota da IA de uma vez)." : ""),
            falhos.length ? "erro" : "ok"
          );
          app.refresh();
          if (!falhos.length) fechar();
        };

        fileInput.addEventListener("change", async (e) => {
          const arquivos = [...(e.target.files || [])];
          if (!arquivos.length) return;
          if (arquivos.length > 1) return importarFila(arquivos);
          await lerArquivo(arquivos[0]);
        });
      }

      bindActions(corpo, {
        "cancelar-form": () => fechar(),
        "add-doc": async (el) => {
          const texto = corpo.querySelector("#doc-texto").value.trim();
          if (!texto && !pend.pdf && !pend.img) return toast("O conteúdo está vazio.", "erro");
          if (!(await confirmarAvisoDireitos())) return;
          // "Salvando…" com o botão travado: gravar uma apostila é escrever dezenas de MB no
          // disco, e antes disso a janela ficava viva mas surda — o clique seguinte se perdia.
          const r = await comOcupado(() => salvarPendente({ perguntarExistente: true }), { botao: el, msg: "Salvando o material…" });
          if (r === null) return;
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

// Mensagem do fim da leitura de figuras: diz quantas saíram de cada fonte e, se parou, por quê.
// Sem isso o usuário não sabe se o trabalho acabou ou se foi interrompido, nem quanto do caro
// (Claude Code) foi usado.
function mensagemFiguras(r, feitas, restam) {
  const via = r && r.reserva ? ` (${r.reserva} pela reserva do Claude Code)` : "";
  const puladas = r && r.puladas ? ` ${r.puladas} ${r.puladas === 1 ? "página o Gemini não conseguiu ler" : "páginas o Gemini não conseguiu ler"} (ficaram pendentes).` : "";
  if (r && r.parou === "usuario") {
    return `Parado por você em ${plural(restam, "página pendente", "páginas pendentes")}${via}. O que foi lido está salvo — clicar de novo retoma daqui.`;
  }
  if (r && r.parou === "reserva") {
    return `Parei em ${plural(restam, "página pendente", "páginas pendentes")}: o Gemini está recusando e a reserva do Claude Code chegou ao teto desta rodada${via}. O que foi descrito ficou salvo — tente de novo mais tarde, quando a cota do Gemini voltar.`;
  }
  if (r && r.parou === "cota") {
    return `Parei em ${plural(restam, "página pendente", "páginas pendentes")}: a cota da IA acabou por agora${via}. O que foi lido ficou salvo — é só clicar de novo quando a cota voltar (o app retoma de onde parou).`;
  }
  if (r && r.parou) {
    return `Parei em ${plural(restam, "página pendente", "páginas pendentes")}${via}. O que foi lido ficou salvo; é só clicar de novo mais tarde.`;
  }
  return `${plural(feitas, "página lida", "páginas lidas")}${via} — o que havia de figura e tabela entrou na busca e nas gerações.${puladas}`;
}

// Tópicos do edital que o material cobre. Uma apostila cobre a disciplina inteira: o
// Administrativo vincula 22 tópicos, e cada tópico do 192º é um item do edital com todas as
// subdivisões. Em etiquetas soltas, o cartão virava uma parede de texto e escondia o resto
// (título, ações, avisos). Vira um resumo de uma linha que ABRE sob demanda; o rótulo curto e
// o tooltip com o nome inteiro continuam valendo lá dentro.
function topicosVinculadosHTML(st, d) {
  const tops = (d.topicoIds && d.topicoIds.length ? d.topicoIds : d.topicoId ? [d.topicoId] : [])
    .map((id) => st.topicos.find((t) => t.id === id))
    .filter(Boolean);
  if (!tops.length) return "";
  const chip = (t) => {
    const pg = d.topicoPaginas && d.topicoPaginas[t.id];
    const nome = nomeTopico(st, t);
    const curto = rotuloCurtoTopico(nome);
    return `<span class="tag-topico"${curto !== nome ? ` data-tip="${esc(nome)}" data-tip-pos="cima-esq"` : ""}>${esc(curto)}${pg ? ` <span class="tag-pag">págs. ${pg[0]}–${pg[1]}</span>` : ""}</span>`;
  };
  // Um tópico só não justifica o clique a mais.
  if (tops.length === 1) return chip(tops[0]);
  const discs = [...new Set(tops.map((t) => (st.disciplinas.find((x) => x.id === t.disciplinaId) || {}).nome).filter(Boolean))];
  const resumoDiscs = discs.slice(0, 2).join(", ") + (discs.length > 2 ? ` +${discs.length - 2}` : "");
  return `<details class="doc-topicos">
    <summary class="lnk" data-tip="Ver os tópicos do edital que este material cobre, com as páginas de cada um." data-tip-pos="cima-esq">
      ${icone("list-checks")} ${plural(tops.length, "tópico do edital", "tópicos do edital")}${resumoDiscs ? ` · ${esc(resumoDiscs)}` : ""} ${icone("chevron-down")}
    </summary>
    <div class="doc-topicos-lista">${tops.map(chip).join("")}</div>
  </details>`;
}

// "Ler figuras e tabelas" de TODOS os materiais que ainda têm páginas com imagem sem
// descrição. Mora na barra da busca inteligente, junto de "Atualizar índice": as duas são a
// mesma família (preparar o material com IA para ele render busca e geração), e ali a ação
// fica discreta — ao lado de "Adicionar material" ela competia com a ação principal da tela
// e anunciava um número que ninguém pediu. A contagem vive no tooltip, não no rótulo.
function figurasPendentesGeral(store, st) {
  let paginas = 0;
  let materiais = 0;
  for (const d of st.documentos || []) {
    const n = store.figurasPendentes(d).length;
    if (n) { paginas += n; materiais++; }
  }
  return { paginas, materiais };
}

// Aparece só quando há figura por ler, e some sozinho quando acaba. É um AVISO com uma saída
// (o mesmo componente do convite do sumário), não um botão fixo competindo com "Adicionar
// material": diz por que aquilo importa e oferece a ação, sem número no rótulo.
function figurasNudgeHTML(store, st) {
  if (!store.iaDisponivel()) return "";
  const { paginas, materiais } = figurasPendentesGeral(store, st);
  if (!paginas) return "";
  const onde = materiais === 1 ? "deste material" : `de ${materiais} materiais`;
  return `<div class="sum-nudge">
    ${icone("image")}
    <span>As figuras e tabelas ${onde} ainda não foram lidas: o que está dentro delas não entra na busca nem nas gerações.</span>
    <button class="btn btn-primary btn-sm" data-action="figuras-todos" data-tip="A IA lê cada página com figura ou tabela e escreve o que ela mostra. São ${paginas} ${paginas === 1 ? "página" : "páginas"} — dá para parar no meio e retomar depois de onde parou.">${icone("image")} Ler figuras e tabelas</button>
  </div>`;
}

// Mesmo molde do aviso de figuras, para o outro conteúdo que fica invisível ao app: página
// que veio ESCANEADA (sem texto selecionável). Aparece só quando há pendência e some sozinho.
function visaoNudgeHTML(store, st) {
  if (!store.iaDisponivel()) return "";
  let paginas = 0;
  let materiais = 0;
  for (const d of st.documentos || []) {
    const n = store.paginasPendentes(d).length;
    if (n) { paginas += n; materiais++; }
  }
  if (!paginas) return "";
  const onde = materiais === 1 ? "deste material" : `de ${materiais} materiais`;
  return `<div class="sum-nudge">
    ${icone("search")}
    <span>${plural(paginas, "página", "páginas")} ${onde} ${paginas === 1 ? "veio escaneada" : "vieram escaneadas"} (sem texto): o que está nelas não entra na busca nem nas gerações.</span>
    <button class="btn btn-primary btn-sm" data-action="ocr-todos" data-tip="A IA transcreve o texto dessas páginas. Uma requisição por página — dá para parar no meio; o que for transcrito fica salvo.">${icone("search")} Ler páginas escaneadas</button>
  </div>`;
}

function docHTML(store, st, d, busca, grupoNome = "") {
  const topicosDoc = (d.topicoIds && d.topicoIds.length ? d.topicoIds : d.topicoId ? [d.topicoId] : [])
    .map((id) => st.topicos.find((t) => t.id === id))
    .filter(Boolean);
  const topico = topicosDoc[0] || null; // primário (para "Praticar este tópico")
  const aberto = abertoId === d.id;
  const pend = store.paginasPendentes(d).length;
  // Trecho com a palavra buscada em destaque (só quando o match está no conteúdo).
  const trecho = busca && busca.trim().length >= 2 ? trechoBusca(d.texto || "", busca.trim()) : "";
  const tipo = store.temPdfDoc(d) ? { ic: "file-text", lb: "PDF" } : (d.temImg || d.imgData) ? { ic: "image", lb: "Imagem" } : { ic: "file-text", lb: "Texto" };
  const nPag = (d.paginas || []).length;
  const nTop = d.estrutura && d.estrutura.blocos ? d.estrutura.blocos.length : 0;
  const nFig = (d.figuras || []).filter((f) => f.descricao).length; // as "vazias" são só marcação de página conferida
  // Data de ENTRADA do material: responde "quando trouxe isto?" e "já está velho?" meses
  // depois, sem precisar abrir nada. Reimportar o arquivo atualiza a data (e o tooltip guarda
  // a da primeira importação).
  const dEntrada = d.atualizadoEm || d.criadoEm;
  const dataTxt = dEntrada
    ? `<span class="doc-data" data-tip="${d.atualizadoEm ? `Arquivo atualizado em ${fmtData(d.atualizadoEm)}${d.criadoEm ? ` · importado pela 1ª vez em ${fmtData(d.criadoEm)}` : ""}` : `Importado em ${fmtData(d.criadoEm)}`}" data-tip-pos="cima-esq">${icone("calendar")} ${d.atualizadoEm ? "atualizado" : "importado"} em ${fmtData(dEntrada)}</span>`
    : "";
  const sub = [tipo.lb, nPag ? `${nPag} ${nPag === 1 ? "página" : "páginas"}` : "", nTop ? `${nTop} ${nTop === 1 ? "tópico" : "tópicos"}` : "", nFig ? `${nFig} ${nFig === 1 ? "figura" : "figuras"}` : "", dataTxt].filter(Boolean).join(" · ");
  return `
    <div class="card doc-item" data-foco-id="${d.id}">
      <div class="doc-head">
        <div class="doc-ident">
          <span class="doc-tipo-ico" data-tip="${tipo.lb}">${icone(tipo.ic)}</span>
          <div class="doc-ident-txt">
            <span class="doc-titulo" data-action="abrir" data-id="${d.id}" role="button" tabindex="0" data-tip="${esc(d.titulo)}">${esc(tituloCurtoDoc(d.titulo, grupoNome))}</span>
            <div class="doc-sub muted small">${sub}</div>
          </div>
        </div>
        <div class="doc-meta">
          ${topicosVinculadosHTML(st, d)}
          ${pend ? `<button class="tag-ocr" data-action="ir-ocr" data-id="${d.id}" data-tip="Abrir o material e ler estas páginas com a Visão (elas vieram escaneadas, sem texto)." data-tip-pos="cima-dir">${icone("hourglass")} ${plural(pend, "página escaneada", "páginas escaneadas")}</button>` : ""}
          ${d.binarioDescartado ? `<span class="muted small" data-tip="O PDF original foi descartado; o texto extraído foi mantido." data-tip-pos="cima-dir">${icone("file-text")} PDF descartado</span>` : ""}
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
              <button class="menu-item" data-action="abrir" data-id="${d.id}" data-tip="${nTop ? "Abre o material no cartão, no sumário navegável." : "Abre o material no cartão, no texto extraído do arquivo."}" data-tip-pos="cima-esq"><span class="menu-ico">${icone(aberto ? "chevron-down" : "chevron-right")}</span> ${aberto ? "Fechar material" : nTop ? "Ver sumário" : "Ver texto extraído"}</button>
              ${store.temPdfDoc(d) ? `<button class="menu-item" data-action="ler-pdf" data-id="${d.id}" data-tip="Abre o PDF original no leitor interno (zoom e navegação por página)." data-tip-pos="cima-esq"><span class="menu-ico">${icone("file-text")}</span> Abrir PDF</button>` : ""}
              ${nTop && (d.texto || "").trim() ? `<button class="menu-item" data-action="menu-texto-corrido" data-id="${d.id}" data-tip="Troca a visão do cartão: em vez do sumário, o texto que o app leu do arquivo — é ele que alimenta a busca e a IA." data-tip-pos="cima-esq"><span class="menu-ico">${icone("file-text")}</span> ${textoBrutoAberto.has(d.id) ? "Ver sumário" : "Ver texto extraído"}</button>` : ""}
              ${(d.paginas || []).length && !d.binarioDescartado ? `<button class="menu-item" data-action="menu-reprocessar-pagina" data-id="${d.id}" data-tip="Passa a Visão numa página específica: serve tanto para a que veio escaneada (sem texto) quanto para a que saiu fora de ordem (tabela/organograma)." data-tip-pos="cima-esq"><span class="menu-ico">${icone("search")}</span> Ler página com a Visão</button>` : ""}
              ${
                // Figuras: caminho MANUAL (na importação em fila isso não roda mais — 17
                // apostilas seguidas estouram a cota da IA).
                store.figurasPendentes(d).length && !d.binarioDescartado && store.iaDisponivel()
                  ? `<button class="menu-item" data-action="descrever-figuras" data-id="${d.id}" data-tip="A IA lê as páginas com figura/tabela deste material e escreve o que elas mostram; as descrições entram na busca e nas gerações. Um clique faz todas as que faltam." data-tip-pos="cima-esq"><span class="menu-ico">${icone("image")}</span> Descrever ${plural(store.figurasPendentes(d).length, "figura", "figuras")}</button>`
                  : ""
              }
              <div class="menu-sep"></div>
              <div class="menu-rotulo">Sumário e edital</div>
              ${
                d.estrutura && d.estrutura.blocos && d.estrutura.blocos.length
                  ? `<button class="menu-item" data-action="menu-revisar-estrutura" data-id="${d.id}" data-tip="Corrigir o sumário: títulos, tópicos do edital e faixas de páginas. Lá dentro dá para refazer com IA." data-tip-pos="cima-esq"><span class="menu-ico">${icone("list-tree")}</span> Editar sumário</button>
                     <button class="menu-item" data-action="redetectar-estrutura" data-id="${d.id}" data-tip="Monta o sumário de novo a partir do texto que já está aqui. Use depois de ler páginas com a Visão, ou quando uma versão do app melhorar a detecção — ao contrário de «Atualizar material», não relê o arquivo e não perde o que a Visão transcreveu." data-tip-pos="cima-esq"><span class="menu-ico">${icone("refresh-cw")}</span> Refazer sumário</button>`
                  : store.temPdfDoc(d) && store.iaDisponivel()
                    ? `<button class="menu-item" data-action="caprichar-estrutura" data-doc="${d.id}" data-tip="A IA lê a página de sumário do próprio PDF e monta os tópicos do material." data-tip-pos="cima-esq"><span class="menu-ico">${icone("wand-sparkles")}</span> Montar sumário (IA)</button>`
                    : ""
              }
              <button class="menu-item" data-action="editar-topicos" data-id="${d.id}" data-tip="Escolher quais tópicos do edital este material cobre (dentro do painel, a IA pode sugerir)." data-tip-pos="cima-esq"><span class="menu-ico">${icone("link")}</span> Vincular ao edital</button>
              <button class="menu-item" data-action="doc-disciplina" data-id="${d.id}" data-tip="Define a disciplina deste material. É ela que agrupa a lista, organiza os seletores de «Gerar com IA» e limita a quais tópicos o sumário pode se vincular." data-tip-pos="cima-esq"><span class="menu-ico">${icone("library")}</span> Definir disciplina</button>
              <button class="menu-item" data-action="doc-renomear" data-id="${d.id}" data-tip="Muda só o nome do material (o arquivo e os vínculos continuam os mesmos)." data-tip-pos="cima-esq"><span class="menu-ico">${icone("square-pen")}</span> Renomear</button>
              <div class="menu-sep"></div>
              <div class="menu-rotulo">Arquivo</div>
              <button class="menu-item" data-action="atualizar-doc" data-id="${d.id}" data-tip="Traga a versão nova do arquivo. Questões, flashcards, mapas, vínculos com o edital e histórico continuam valendo; o texto e o sumário são substituídos." data-tip-pos="cima-esq"><span class="menu-ico">${icone("refresh-cw")}</span> Atualizar material</button>
              ${store.podeVincularArquivo() && d.caminhoOriginal ? `<button class="menu-item" data-action="abrir-original" data-id="${d.id}" data-tip="Abre o arquivo original na pasta onde ele está, no programa padrão do sistema." data-tip-pos="cima-esq"><span class="menu-ico">${icone("external-link")}</span> Abrir original</button>` : ""}
              ${store.podeVincularArquivo() ? `<button class="menu-item" data-action="vincular-original" data-id="${d.id}" data-tip="Aponta para o arquivo onde ele já está (OneDrive, pasta do cursinho). O app guarda só o caminho, não outra cópia — dá para descartar o PDF interno sem perder o acesso." data-tip-pos="cima-esq"><span class="menu-ico">${icone("paperclip")}</span> ${d.caminhoOriginal ? "Trocar arquivo vinculado" : "Vincular arquivo original"}</button>` : ""}
              ${store.temPdfDoc(d) ? `<button class="menu-item menu-item-danger" data-action="descartar-pdf" data-id="${d.id}" data-tip="Apaga só o arquivo PDF para liberar espaço; o texto extraído e o sumário permanecem." data-tip-pos="cima-esq"><span class="menu-ico">${icone("file-text")}</span> Descartar PDF original</button>` : ""}
              <button class="menu-item menu-item-danger" data-action="del-doc" data-id="${d.id}"><span class="menu-ico">${icone("x")}</span> Remover material</button>
            </div>
          </details>
        </div>
      </div>
      ${trecho ? `<div class="doc-snippet">${realcar(esc(trecho), busca.trim())}</div>` : ""}
      ${topicosDocAberto === d.id ? topicosEditorHTML(store, st, d) : ""}
      ${detectDoc === d.id ? detectPainelHTML() : ""}
      ${
        aberto
            ? `${ocrAlertaHTML(store, d)}
               ${ocrAberto.has(d.id) ? ocrManualHTML(store, d) : ""}
               ${
                 d.estrutura && d.estrutura.blocos && d.estrutura.blocos.length
                   ? estruturaEditando.has(d.id)
                     ? `${estruturaResumoHTML(d.estrutura, store, d.id)}
                        <button class="btn btn-ghost btn-sm u-mt-8" data-action="estr-edit-toggle" data-id="${d.id}">${icone("check")} concluir revisão do sumário</button>`
                     : textoBrutoAberto.has(d.id)
                       ? `<div class="doc-corpo"><div class="muted small u-mb-8">${icone("file-text")} Texto extraído do arquivo, completo — é o que alimenta a <b>busca</b> e a <b>IA</b> (não precisa estar bonito). <button class="lnk" data-action="menu-texto-corrido" data-id="${d.id}">voltar ao sumário</button></div>${esc(d.texto) || "<i>vazio</i>"}</div>`
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
  // Disciplina = <details> recolhido, e só abre sozinha a que já tem tópico marcado. Listar os
  // 400 tópicos do edital de uma vez era o mesmo paredão que o cartão do material já resolveu.
  const grupos = st.disciplinas
    .map((disc) => {
      const tops = st.topicos.filter((t) => t.disciplinaId === disc.id);
      if (!tops.length) return "";
      const marcados = tops.filter((t) => sel.has(t.id)).length;
      return `<details class="ft-grupo" ${marcados ? "open" : ""}><summary class="ft-disc-h"><b>${esc(disc.nome)}</b>${marcados ? ` <span class="muted small">(${marcados} marcado${marcados > 1 ? "s" : ""})</span>` : ""}</summary>
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
      </details>`;
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
    if (!store.temPdfDoc(d)) return "";
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
