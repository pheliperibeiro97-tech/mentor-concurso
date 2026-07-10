// Visualizador de PDF em ROLAGEM CONTÍNUA (todas as páginas empilhadas), com:
// - campo "ir para a página N"
// - zoom (+/−) e ajuste à largura
// - download do arquivo
// - indicador da página atual atualizado conforme a rolagem
// Renderização preguiçosa (IntersectionObserver): só desenha as páginas que entram
// na viewport — aguenta PDFs grandes sem travar.
import { esc } from "./util.js";
import { icone } from "./icones.js";

function dataUrlToUint8(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export async function abrirVisualizadorPdf(dataUrl, titulo, paginaInicial) {
  const overlay = document.createElement("div");
  overlay.className = "pdf-overlay";
  overlay.innerHTML = `
    <div class="pdf-viewer">
      <div class="pdf-bar">
        <b class="pdf-titulo">${esc(titulo || "PDF")}</b>
        <span class="spacer"></span>
        <label class="pdf-goto">Pág.
          <input id="pdf-num" type="number" min="1" value="1" /> / <span id="pdf-total">…</span>
        </label>
        <button class="pdf-btn" data-p="zoomout" title="Diminuir">${icone("zoom-out")}</button>
        <button class="pdf-btn" data-p="zoomin" title="Aumentar">${icone("zoom-in")}</button>
        <button class="pdf-btn" data-p="fit" title="Ajustar à largura">${icone("move-horizontal")}</button>
        <button class="pdf-btn" data-p="download" title="Baixar PDF">${icone("download")}</button>
        <button class="pdf-btn pdf-close" data-p="close" title="Fechar (Esc)">${icone("x")}</button>
      </div>
      <div class="pdf-scroll" id="pdf-scroll"><div class="pdf-load">Carregando PDF…</div></div>
    </div>`;
  document.body.appendChild(overlay);
  const scroll = overlay.querySelector("#pdf-scroll");
  const numInput = overlay.querySelector("#pdf-num");
  const totalEl = overlay.querySelector("#pdf-total");

  let pdf = null;
  let escala = 1.4;
  let baseW = 800; // largura natural da página 1 (escala 1) — p/ "ajustar à largura"
  const wrappers = []; // 1 div por página
  const renderizada = new Set();
  let io = null;

  try {
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    pdf = await pdfjs.getDocument({ data: dataUrlToUint8(dataUrl) }).promise;
    const p1 = await pdf.getPage(1);
    baseW = p1.getViewport({ scale: 1 }).width;
    totalEl.textContent = pdf.numPages;
    numInput.max = pdf.numPages;
    montar();
    if (paginaInicial && paginaInicial > 1) { numInput.value = paginaInicial; setTimeout(() => irPara(paginaInicial), 120); }
  } catch (err) {
    scroll.innerHTML = `<div class="pdf-load">Falha ao abrir o PDF: ${esc(err.message)}</div>`;
    return;
  }

  // Monta os placeholders (1 por página) e liga o observer de renderização preguiçosa.
  function montar() {
    scroll.innerHTML = "";
    wrappers.length = 0;
    renderizada.clear();
    if (io) io.disconnect();

    for (let i = 1; i <= pdf.numPages; i++) {
      const w = document.createElement("div");
      w.className = "pdf-page";
      w.dataset.pagina = String(i);
      const canvas = document.createElement("canvas");
      w.appendChild(canvas);
      scroll.appendChild(w);
      wrappers.push(w);
    }
    dimensionar();

    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const n = parseInt(e.target.dataset.pagina, 10);
            renderPagina(n);
          }
        }
      },
      { root: scroll, rootMargin: "300px 0px" }
    );
    wrappers.forEach((w) => io.observe(w));
  }

  // Ajusta a "moldura" de cada página ao zoom atual (antes mesmo de renderizar).
  function dimensionar() {
    const w = Math.round(baseW * escala);
    for (const wrap of wrappers) {
      wrap.style.width = w + "px";
      // altura aproximada (proporção carta) até a renderização real ajustar
      if (!renderizada.has(parseInt(wrap.dataset.pagina, 10))) wrap.style.minHeight = Math.round(w * 1.3) + "px";
    }
  }

  async function renderPagina(n) {
    if (renderizada.has(n)) return;
    renderizada.add(n);
    const wrap = wrappers[n - 1];
    const canvas = wrap.querySelector("canvas");
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: escala });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    wrap.style.minHeight = "";
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  }

  function irPara(n) {
    n = Math.max(1, Math.min(pdf.numPages, n || 1));
    const wrap = wrappers[n - 1];
    if (wrap) scroll.scrollTo({ top: wrap.offsetTop - 8, behavior: "smooth" });
  }

  function aplicarZoom() {
    dimensionar();
    renderizada.clear();
    // re-observa tudo: o IntersectionObserver dispara de novo para as páginas
    // visíveis, que são re-renderizadas na nova escala.
    io.disconnect();
    wrappers.forEach((w) => io.observe(w));
  }

  // Atualiza o número da página conforme a rolagem (página cujo topo passou do meio).
  scroll.addEventListener("scroll", () => {
    const meio = scroll.scrollTop + scroll.clientHeight / 3;
    let atual = 1;
    for (const w of wrappers) {
      if (w.offsetTop <= meio) atual = parseInt(w.dataset.pagina, 10);
      else break;
    }
    if (document.activeElement !== numInput) numInput.value = atual;
  });

  numInput.addEventListener("change", () => irPara(parseInt(numInput.value, 10)));

  function fechar() {
    document.removeEventListener("keydown", onKey);
    if (io) io.disconnect();
    overlay.remove();
  }
  function onKey(e) {
    if (e.key === "Escape") fechar();
  }
  document.addEventListener("keydown", onKey);

  overlay.addEventListener("click", (e) => {
    const b = e.target.closest("[data-p]");
    if (!b) {
      if (e.target === overlay) fechar();
      return;
    }
    const p = b.getAttribute("data-p");
    if (p === "close") fechar();
    else if (p === "zoomin") { escala = Math.min(3, escala + 0.2); aplicarZoom(); }
    else if (p === "zoomout") { escala = Math.max(0.5, escala - 0.2); aplicarZoom(); }
    else if (p === "fit") { escala = Math.max(0.5, Math.min(3, (scroll.clientWidth - 40) / baseW)); aplicarZoom(); }
    else if (p === "download") {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = (titulo || "documento").replace(/[^\w.-]+/g, "_") + ".pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  });
}
