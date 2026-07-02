// Extração de texto de PDF via pdf.js (usado na Base documental e na extração de missões).
// Importação preferencial pela IA (Gemini lê o PDF/imagem direto, com OCR), com fallback local.
import { extrairTextoArquivo, iaDisponivel } from "./ia-provider.js";
import { icone } from "./icones.js";

// File → base64 PURO (sem o prefixo "data:...;base64,").
export function arquivoParaBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf("base64,");
      resolve(i >= 0 ? s.slice(i + 7) : s);
    };
    r.onerror = () => reject(r.error || new Error("Falha ao ler o arquivo."));
    r.readAsDataURL(file);
  });
}

let _pdfjs = null;
async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  _pdfjs = pdfjs;
  return pdfjs;
}

// Aceita File, ArrayBuffer/Uint8Array ou data URL ("data:application/pdf;base64,...")
// e devolve os bytes para o pdf.js. Permite reprocessar um PDF JÁ salvo (doc.pdfData).
async function bytesDe(source) {
  if (typeof source === "string") {
    const i = source.indexOf("base64,");
    const b64 = i >= 0 ? source.slice(i + 7) : source;
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
    return arr;
  }
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (source && typeof source.arrayBuffer === "function") return new Uint8Array(await source.arrayBuffer());
  throw new Error("Fonte de PDF não suportada.");
}

async function abrirPdf(source) {
  const pdfjs = await getPdfjs();
  const data = await bytesDe(source);
  try {
    // SEM onPassword: PDF protegido por senha rejeita com PasswordException — não burlamos.
    return await pdfjs.getDocument({ data }).promise;
  } catch (e) {
    if (e && (e.name === "PasswordException" || /password|encrypt/i.test(e.message || ""))) {
      const err = new Error(
        "Este PDF é protegido por senha/DRM. O app não burla proteções — use um arquivo sem proteção ou cole o texto."
      );
      err.code = "PDF_PROTEGIDO";
      throw err;
    }
    throw e;
  }
}

// Limiar de "página sem texto": abaixo disto, tratamos como escaneada/imagem
// (candidata a OCR/Visão). Acima, o texto extraível já basta.
const LIMIAR_VAZIA = 80;

// Fração mínima da área da página que uma imagem precisa ocupar para ser tratada
// como FIGURA/TABELA relevante. Logos e banners de cabeçalho (que se repetem em
// TODA página) são pequenos e ficam abaixo disto — assim não geram falso "tem imagem".
const LIMIAR_IMG_FRAC = 0.1;

// Extração simples (texto corrido do PDF inteiro). Mantida para compatibilidade.
export async function extrairPdf(file) {
  const { paginas } = await extrairPdfPaginas(file);
  return paginas.map((p) => p.texto).join("\n\n").trim();
}

// Extração PÁGINA A PÁGINA + detecção de páginas-lacuna.
// Devolve { paginas: [{ n, texto, vazia, temImagem, ocr:false }], numPaginas }.
//  - vazia    = pouco/nenhum texto selecionável (provável escaneado) → pendente de OCR.
//  - temImagem= a página contém imagem embutida (pode ser tabela/organograma) →
//               permite sugerir Visão manual mesmo quando há algum texto.
// Reconstrói o texto de uma página PRESERVANDO as quebras de linha (o pdf.js entrega itens
// soltos; agrupo por posição Y → linhas; ordeno por X dentro da linha). Essencial para detectar
// Índice/Sumário e títulos. Usa item.hasEOL quando existe; senão, diferença de Y.
// Devolve { texto, linhas:[{texto,fontSize,bold}] } — `linhas` (com a fonte) serve à detecção de
// títulos por TAMANHO DE FONTE (fallback p/ PDFs sem Índice). `linhas` é transitório (não é salvo).
function reconstruirLinhas(items) {
  const brutas = []; // {texto, fontSize, bold}
  let curY = null, partes = [];
  const tamItem = (p) => p.height || Math.hypot(p.transform?.[2] || 0, p.transform?.[3] || 0) || 0;
  const fechar = () => {
    if (partes.length) {
      const t = partes.map((p) => p.str).join("").replace(/[ \t]+$/g, "");
      const fontSize = Math.round(Math.max(0, ...partes.map(tamItem)) * 10) / 10;
      const bold = partes.some((p) => /bold|black|heavy|semibold|extrabold/i.test(p.fontName || ""));
      brutas.push({ texto: t, fontSize, bold });
    }
    partes = []; curY = null;
  };
  for (const it of items || []) {
    const y = it.transform ? it.transform[5] : null;
    if (partes.length && curY != null && y != null && Math.abs(y - curY) > 3) fechar();
    if (!partes.length) curY = y;
    partes.push(it);
    if (it.hasEOL) fechar();
  }
  fechar();
  const linhas = brutas
    .map((l) => ({ ...l, texto: (l.texto || "").replace(/\s+/g, " ").trim() }))
    .filter((l, idx, arr) => l.texto !== "" || (idx > 0 && arr[idx - 1].texto !== "")); // colapsa vazias
  const texto = linhas.map((l) => l.texto).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { texto, linhas: linhas.filter((l) => l.texto !== "") };
}

export async function extrairPdfPaginas(source) {
  const pdfjs = await getPdfjs();
  const pdf = await abrirPdf(source);
  const ehImg = (fn) =>
    fn === pdfjs.OPS.paintImageXObject ||
    fn === pdfjs.OPS.paintInlineImageXObject ||
    fn === pdfjs.OPS.paintImageMaskXObject ||
    fn === pdfjs.OPS.paintJpegXObject;
  const paginas = [];
  const linhasPorPagina = []; // transitório: {n, linhas:[{texto,fontSize,bold}]} p/ detecção por fonte
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const { texto, linhas } = reconstruirLinhas(content.items);
    linhasPorPagina.push({ n: i, linhas });
    // "tem figura" = existe alguma imagem que ocupa fração relevante da página.
    // Rastreia a matriz de transformação (apenas o determinante = área) pela lista
    // de operadores; assim distingue uma FIGURA/TABELA grande de um logo pequeno.
    let temImagem = false;
    try {
      const view = page.view; // [x0,y0,x1,y1] em unidades do PDF
      const areaPagina = Math.abs((view[2] - view[0]) * (view[3] - view[1])) || 1;
      const ops = await page.getOperatorList();
      let det = 1;
      const pilha = [];
      let maxFrac = 0;
      for (let k = 0; k < ops.fnArray.length; k++) {
        const fn = ops.fnArray[k];
        if (fn === pdfjs.OPS.save) pilha.push(det);
        else if (fn === pdfjs.OPS.restore) det = pilha.length ? pilha.pop() : det;
        else if (fn === pdfjs.OPS.transform) {
          const m = ops.argsArray[k]; // [a,b,c,d,e,f]
          det *= m[0] * m[3] - m[1] * m[2];
        } else if (ehImg(fn)) {
          maxFrac = Math.max(maxFrac, Math.abs(det) / areaPagina);
        }
      }
      temImagem = maxFrac >= LIMIAR_IMG_FRAC;
    } catch (_) {}
    paginas.push({ n: i, texto, vazia: texto.length < LIMIAR_VAZIA, temImagem, ocr: false });
  }
  const outline = await lerOutline(pdf);
  return { paginas, numPaginas: pdf.numPages, outline, linhasPorPagina };
}

// Lê os MARCADORES embutidos do PDF (outline/bookmarks) já resolvidos em página: [{titulo, pagina, nivel}].
// Sinal forte para a estrutura quando a apostila tem sumário navegável. Falha silenciosa = [].
async function lerOutline(pdf) {
  let raiz;
  try { raiz = await pdf.getOutline(); } catch (_) { return []; }
  if (!Array.isArray(raiz) || !raiz.length) return [];
  const out = [];
  const paginaDoDest = async (dest) => {
    try {
      let d = dest;
      if (typeof d === "string") d = await pdf.getDestination(d);
      if (Array.isArray(d) && d[0]) return (await pdf.getPageIndex(d[0])) + 1;
    } catch (_) {}
    return null;
  };
  const andar = async (itens, nivel) => {
    for (const it of itens || []) {
      out.push({ titulo: String(it.title || "").trim(), pagina: await paginaDoDest(it.dest), nivel });
      if (it.items && it.items.length) await andar(it.items, nivel + 1);
    }
  };
  await andar(raiz, 1);
  return out.filter((o) => o.titulo);
}

// Rasteriza páginas específicas para JPEG (data URL), para enviar à Visão.
// listaN: array de números de página (1-based). escala 2 ≈ boa nitidez p/ OCR.
export async function rasterizarPaginas(source, listaN, escala = 2) {
  const pdf = await abrirPdf(source);
  const out = [];
  for (const n of listaN) {
    if (n < 1 || n > pdf.numPages) continue;
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: escala });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push({ n, dataUrl: canvas.toDataURL("image/jpeg", 0.82) });
  }
  return out;
}

// Liga um <input type="file"> com FEEDBACK VISUAL + extração (IA quando disponível).
// Mostra, ao lado do input: "arquivo.pdf — lendo com a IA…" → "✓ carregado (N linhas)" / erro.
// opts: { getCfg(): config, contexto: string, onTexto(texto, file): void, statusEl?: Element }
export function ligarImportArquivo(input, opts = {}) {
  if (!input) return;
  const { getCfg, contexto, onTexto } = opts;
  let status = opts.statusEl;
  if (!status) {
    status = document.createElement("span");
    status.className = "import-status";
    // o <input type=file> costuma ser oculto dentro de um <label>/botão: ancora o status depois dele.
    const ancora = input.closest("label") || input;
    ancora.insertAdjacentElement("afterend", status);
  }
  input.addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const cfg = getCfg ? getCfg() : null;
    // A IA só é usada para transformar ARQUIVO→texto (PDF/imagem). .txt/.md são lidos direto.
    const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
    const ehImg = (f.type || "").startsWith("image/");
    const comIA = !!(cfg && iaDisponivel(cfg) && cfg.iaProvider === "gemini" && (ehPdf || ehImg));
    status.className = "import-status lendo";
    status.innerHTML = `<span class="import-spin">${icone("refresh-cw")}</span> <span class="import-nome"></span>`;
    status.querySelector(".import-nome").textContent = `${f.name} — lendo${comIA ? " com a IA" : ""}…`;
    try {
      const texto = await lerArquivoTexto(f, cfg, contexto);
      const linhas = (texto || "").split(/\r?\n/).filter((l) => l.trim()).length;
      if (texto && texto.trim()) {
        status.className = "import-status ok";
        status.textContent = `✓ ${f.name} — carregado (${linhas} linha${linhas === 1 ? "" : "s"})`;
      } else {
        status.className = "import-status erro";
        // PDF sem texto extraível = provável escaneado (imagem). Sem a IA, o pdf.js não lê:
        // orienta a conectar o Gemini (OCR). Com a IA tentada mas vazia, é provável
        // instabilidade momentânea (ex.: 503) — sugere repetir em vez de "sem texto".
        status.textContent = comIA
          ? `${f.name} — a IA não retornou texto agora (pode ser instabilidade momentânea). Tente de novo ou cole o texto.`
          : ehPdf
          ? `${f.name} — PDF escaneado (imagem): conecte a IA (Gemini) em Configurações para extrair com OCR, ou cole o texto.`
          : `${f.name} — sem texto reconhecido. Cole manualmente.`;
      }
      if (onTexto) onTexto(texto || "", f);
    } catch (err) {
      try { console.error(err); } catch (_) {}
      status.className = "import-status erro";
      status.textContent =
        err && err.code === "PDF_PROTEGIDO"
          ? "PDF protegido por senha — cole o texto manualmente."
          : `✗ ${f.name} — não consegui ler. Cole o texto manualmente.`;
    }
  });
}

// Lê um arquivo e devolve o texto. Se a IA (Gemini) estiver conectada, a extração é feita
// PELA IA (lê PDF escaneado/sem camada de texto e imagens, com OCR nativo). Sem IA — ou se a
// IA falhar/retornar vazio — usa o método local (pdf.js para PDF de texto; .txt/.md direto).
// Passe `cfg` (store.get().config) para habilitar a IA.
export async function lerArquivoTexto(file, cfg, contexto) {
  const ehPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  const ehImg = (file.type || "").startsWith("image/");
  if (cfg && iaDisponivel(cfg) && cfg.iaProvider === "gemini" && (ehPdf || ehImg) && file.size <= 14 * 1024 * 1024) {
    try {
      const dataB64 = await arquivoParaBase64(file);
      const mimeType = ehPdf ? "application/pdf" : file.type || "application/octet-stream";
      const texto = await extrairTextoArquivo(cfg, { dataB64, mimeType, nomeArquivo: file.name, contexto });
      if (texto && texto.trim()) return texto.trim();
      // IA leu mas não achou texto: tenta o método local (pode haver texto selecionável).
    } catch (e) {
      // IA offline ou falha: cai para o método local abaixo (que pode resolver PDFs de texto).
      if (!e || e.code !== "IA_OFFLINE") {
        try { console.warn("Extração por IA falhou; tentando método local:", e); } catch (_) {}
      }
    }
  }
  if (ehPdf) return extrairPdf(file);
  return file.text();
}
