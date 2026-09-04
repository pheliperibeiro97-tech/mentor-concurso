// Abertura de PDF do app. Dois caminhos:
//
//  1. LEITOR NATIVO (padrão no computador): o WebView2/Chrome já traz um leitor completo e
//     familiar — seleção, busca, zoom com Ctrl+roda, página inteira, girar, miniaturas,
//     imprimir e baixar. O app só põe a moldura (título, tela cheia, fechar).
//  2. LEITOR PRÓPRIO (pdf.js), de reserva: onde não há leitor nativo — o Chrome no Android
//     BAIXA o PDF em vez de exibir. Rolagem contínua com renderização preguiçosa, camada de
//     texto para seleção, busca, impressão e zoom.
//
// O que NÃO tem, de propósito: marcação/anotação no PDF. O grifo saiu de Materiais quando o
// binário passou a ser descartável, e a decisão continua — o estudo se marca no texto
// extraído, não numa cópia do arquivo.
import { esc } from "./util.js";
import { baixarArquivo, toast, toastCarregando } from "./ui.js";
import { icone } from "./icones.js";

function dataUrlToUint8(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// Comparação "como gente busca": sem acento e sem caixa.
const normalizar = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ---- leitor NATIVO -------------------------------------------------------------------------
// O WebView2 (e o Chrome/Edge no computador) traz um leitor de PDF completo: seleção nos dois
// temas, busca, zoom com Ctrl+roda, "página inteira" que alinha de verdade, girar, miniaturas,
// imprimir e baixar — tudo aquilo que este arquivo tentava reimplementar, com os defeitos que
// vieram junto. Quando ele existe, é ele que abre; o leitor caseiro abaixo fica de reserva
// para onde não existe (Chrome no Android, por exemplo, BAIXA o PDF em vez de exibir).
const temLeitorNativo = () =>
  typeof navigator !== "undefined" &&
  (navigator.pdfViewerEnabled === true || !!(navigator.mimeTypes && navigator.mimeTypes["application/pdf"]));

// Nome de arquivo a partir do título do material: é o que o "salvar" do leitor sugere, e o que
// aparece no cabeçalho da impressão. Sem isto o navegador propunha o UUID do blob.
function nomeDeArquivo(titulo) {
  const limpo = String(titulo || "PDF")
    .replace(/[\\/:*?"<>|]+/g, "-") // proibidos no Windows
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
  return (limpo || "documento") + ".pdf";
}

function abrirPdfNativo(dataUrl, titulo, paginaInicial) {
  const nome = nomeDeArquivo(titulo);
  const bytes = dataUrlToUint8(dataUrl);
  // `File` em vez de `Blob` porque ele carrega um nome — mas MEDIDO: o nome NÃO chega à URL
  // `blob:` (a resposta não traz Content-Disposition), então o "salvar" do leitor nativo continua
  // propondo o UUID. É por isso que existe o botão "Baixar" na barra do app abaixo: ele usa a
  // caixa de salvar do sistema já com o nome do material. Trocar isso exigiria servir o PDF por
  // uma URL cujo CAMINHO termine no nome — service worker ou protocolo de arquivo do Tauri.
  const url = URL.createObjectURL(new File([bytes], nome, { type: "application/pdf" }));
  const overlay = document.createElement("div");
  overlay.className = "pdf-overlay pdf-nativo";
  overlay.innerHTML = `
    <div class="pdf-viewer">
      <div class="pdf-bar">
        <b class="pdf-titulo">${esc(titulo || "PDF")}</b>
        <span class="spacer"></span>
        <button class="pdf-btn" data-p="baixar" title="Baixar como “${esc(nome)}”">${icone("download")}</button>
        <button class="pdf-btn" data-p="fullscreen" title="Tela cheia (F11)">${icone("maximize-2")}</button>
        <button class="pdf-btn pdf-close" data-p="close" title="Fechar (Esc)">${icone("x")}</button>
      </div>
      <iframe class="pdf-quadro" title="${esc(titulo || "PDF")}" src="${url}#page=${Math.max(1, paginaInicial || 1)}"></iframe>
    </div>`;
  document.body.appendChild(overlay);
  const fechar = () => {
    document.removeEventListener("keydown", onKey);
    URL.revokeObjectURL(url);
    overlay.remove();
  };
  // Tela cheia: o botão e o F11, que é o atalho que todo mundo usa em leitor de PDF.
  // (Dentro do iframe o F11 não chega até aqui, então o botão é o caminho garantido.)
  const alternarCheia = () => {
    const btn = overlay.querySelector('[data-p="fullscreen"]');
    if (document.fullscreenElement === overlay) document.exitFullscreen().catch(() => {});
    else overlay.requestFullscreen().catch(() => {});
    setTimeout(() => {
      const cheio = document.fullscreenElement === overlay;
      if (btn) {
        btn.innerHTML = icone(cheio ? "minimize-2" : "maximize-2");
        btn.title = cheio ? "Sair da tela cheia (F11)" : "Tela cheia (F11)";
      }
    }, 120);
  };
  const onKey = (e) => {
    if (e.key === "Escape" && document.fullscreenElement !== overlay) fechar();
    else if (e.key === "F11") { e.preventDefault(); alternarCheia(); }
  };
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("click", async (e) => {
    if (e.target.closest('[data-p="fullscreen"]')) return alternarCheia();
    if (e.target.closest('[data-p="baixar"]')) {
      // Caixa de salvar do SISTEMA, já com o nome do material. O "salvar" do leitor nativo
      // propõe o UUID do blob e não há como mudar isso de fora.
      const ok = await baixarArquivo(nome, bytes, "application/pdf");
      if (ok) toast(`Salvo como “${nome}”.`, "ok");
      return;
    }
    if (e.target.closest('[data-p="close"]') || e.target === overlay) fechar();
  });
}

export async function abrirVisualizadorPdf(dataUrl, titulo, paginaInicial) {
  if (temLeitorNativo()) return abrirPdfNativo(dataUrl, titulo, paginaInicial);
  return abrirVisualizadorProprio(dataUrl, titulo, paginaInicial);
}

// Leitor próprio (pdf.js) — reserva para quando não há leitor nativo.
async function abrirVisualizadorProprio(dataUrl, titulo, paginaInicial) {
  const overlay = document.createElement("div");
  overlay.className = "pdf-overlay";
  overlay.innerHTML = `
    <div class="pdf-viewer">
      <div class="pdf-bar">
        <b class="pdf-titulo">${esc(titulo || "PDF")}</b>
        <span class="spacer"></span>
        <label class="pdf-goto"><span class="pdf-goto-rot">Pág.</span>
          <input id="pdf-num" type="number" min="1" value="1" /> <span class="pdf-goto-total">/ <span id="pdf-total">…</span></span>
        </label>
        <span class="pdf-sep"></span>
        <button class="pdf-btn" data-p="buscar" title="Buscar no documento (Ctrl+F)">${icone("search")}</button>
        <button class="pdf-btn" data-p="zoomout" title="Diminuir">${icone("zoom-out")}</button>
        <button class="pdf-btn" data-p="zoomin" title="Aumentar">${icone("zoom-in")}</button>
        <button class="pdf-btn" data-p="fit" title="Ajustar à largura">${icone("move-horizontal")}</button>
        <button class="pdf-btn" data-p="fit-pagina" title="Página inteira">${icone("expand")}</button>
        <span class="pdf-sep"></span>
        <button class="pdf-btn" data-p="imprimir" title="Imprimir">${icone("printer")}</button>
        <button class="pdf-btn" data-p="download" title="Baixar PDF">${icone("download")}</button>
        <button class="pdf-btn" data-p="fullscreen" title="Tela cheia">${icone("maximize-2")}</button>
        <button class="pdf-btn pdf-close" data-p="close" title="Fechar (Esc)">${icone("x")}</button>
      </div>
      <div class="pdf-achar oculto" id="pdf-achar">
        <input id="pdf-q" type="search" placeholder="Buscar no documento…" autocomplete="off" />
        <span class="pdf-achar-status muted small" id="pdf-status"></span>
        <button class="pdf-btn" data-p="antes" title="Anterior (Shift+Enter)">${icone("chevron-up")}</button>
        <button class="pdf-btn" data-p="depois" title="Próxima (Enter)">${icone("chevron-down")}</button>
        <button class="pdf-btn" data-p="fechar-busca" title="Fechar busca (Esc)">${icone("x")}</button>
      </div>
      <div class="pdf-scroll" id="pdf-scroll"><div class="pdf-load"><div class="pdf-skel-pag skel"></div><div class="muted small">Carregando o PDF…</div></div></div>
    </div>`;
  document.body.appendChild(overlay);
  const scroll = overlay.querySelector("#pdf-scroll");
  const numInput = overlay.querySelector("#pdf-num");
  const totalEl = overlay.querySelector("#pdf-total");
  const barraBusca = overlay.querySelector("#pdf-achar");
  const campoBusca = overlay.querySelector("#pdf-q");
  const statusBusca = overlay.querySelector("#pdf-status");

  let pdfjs = null;
  let pdf = null;
  let escala = 1.4;
  let baseW = 800; // largura natural da página 1 (escala 1) — p/ "ajustar à largura"
  let baseH = 1040; // altura natural — p/ "página inteira"
  const wrappers = []; // 1 div por página
  const renderizada = new Set();
  let io = null;
  // Busca
  const textoDaPagina = new Map(); // n -> texto normalizado (cache; getTextContent é caro)
  let consulta = "";
  let ocorrencias = []; // [{pagina, indice}] das páginas já varridas
  let atual = -1;

  try {
    pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    pdf = await pdfjs.getDocument({ data: dataUrlToUint8(dataUrl) }).promise;
    const p1 = await pdf.getPage(1);
    const vp1 = p1.getViewport({ scale: 1 });
    baseW = vp1.width;
    baseH = vp1.height;
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
      const camada = document.createElement("div");
      camada.className = "textLayer"; // nome que o CSS do pdf.js espera
      w.append(canvas, camada);
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
      // A camada de texto do pdf.js v4 posiciona os spans a partir desta variável.
      wrap.style.setProperty("--scale-factor", String(escala));
      if (!renderizada.has(parseInt(wrap.dataset.pagina, 10))) wrap.style.minHeight = Math.round(w * 1.3) + "px";
    }
  }

  async function renderPagina(n) {
    if (renderizada.has(n)) return;
    renderizada.add(n);
    const wrap = wrappers[n - 1];
    const canvas = wrap.querySelector("canvas");
    const camada = wrap.querySelector(".textLayer");
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: escala });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    wrap.style.minHeight = "";
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    // Camada de TEXTO por cima: é o que permite selecionar e copiar (o canvas é só pixels).
    try {
      camada.innerHTML = "";
      const tl = new pdfjs.TextLayer({ textContentSource: await page.getTextContent(), container: camada, viewport });
      await tl.render();
      if (consulta) realcarNaPagina(n);
    } catch (_) { /* sem camada de texto a página continua legível, só não selecionável */ }
  }

  function irPara(n) {
    n = Math.max(1, Math.min(pdf.numPages, n || 1));
    const wrap = wrappers[n - 1];
    if (wrap) scroll.scrollTo({ top: wrap.offsetTop - 8, behavior: "smooth" });
  }

  function paginaAtual() {
    const meio = scroll.scrollTop + scroll.clientHeight / 3;
    let n = 1;
    for (const w of wrappers) {
      if (w.offsetTop <= meio) n = parseInt(w.dataset.pagina, 10);
      else break;
    }
    return n;
  }

  function zoom(delta) {
    escala = Math.min(3, Math.max(0.4, escala + delta));
    aplicarZoom();
  }
  // "Ajustar à largura" enche a largura útil; "Página inteira" faz a página caber na altura
  // também — é o que o leitor do navegador chama de "ajustar à página".
  function ajustar(modo) {
    const margem = 40;
    const larg = (scroll.clientWidth - margem) / baseW;
    if (modo === "largura") escala = Math.min(3, Math.max(0.4, larg));
    else {
      const alt = (scroll.clientHeight - margem) / (baseH || baseW * 1.3);
      escala = Math.min(3, Math.max(0.4, Math.min(larg, alt)));
    }
    aplicarZoom();
  }

  function aplicarZoom() {
    dimensionar();
    renderizada.clear();
    io.disconnect();
    wrappers.forEach((w) => io.observe(w));
  }

  // ---- BUSCA ------------------------------------------------------------------
  // Varre página a página, sob demanda, a partir da atual: pré-varrer 1.289 páginas levaria
  // minutos (é o mesmo custo da extração no import). O status mostra o progresso.
  async function textoDe(n) {
    if (textoDaPagina.has(n)) return textoDaPagina.get(n);
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    const t = normalizar(tc.items.map((i) => i.str).join(" "));
    textoDaPagina.set(n, t);
    return t;
  }

  // Varre o documento INTEIRO em segundo plano, começando pela página em que o usuário está.
  // Parar na primeira página com resultado (como fazia antes) deixava "próxima" dando a volta
  // em duas ocorrências enquanto o resto do PDF nunca era olhado. A varredura roda em pedaços
  // para não travar a tela, e a navegação já funciona com o que foi achado até agora.
  let varrendo = false;
  let completa = false;
  async function varrerTudo(q) {
    varrendo = true;
    completa = false;
    const total = pdf.numPages;
    const inicio = paginaAtual();
    for (let k = 0; k < total; k++) {
      if (q !== consulta) { varrendo = false; return; } // a busca mudou no meio
      const n = ((inicio - 1 + k + total) % total) + 1;
      const t = await textoDe(n);
      let i = t.indexOf(q);
      const antes = ocorrencias.length;
      while (i >= 0) { ocorrencias.push({ pagina: n, indice: i }); i = t.indexOf(q, i + q.length); }
      // Achou as primeiras? já leva o usuário até lá, sem esperar o resto da varredura.
      if (!antes && ocorrencias.length) { atual = 0; mostrarOcorrencia(); }
      if (k % 8 === 0) {
        atualizarStatus(k + 1, total);
        await new Promise((r) => setTimeout(r, 0)); // devolve a vez à tela
      }
    }
    varrendo = false;
    completa = true;
    atualizarStatus();
  }

  function atualizarStatus(varridas, total) {
    if (!consulta) return (statusBusca.textContent = "");
    const n = ocorrencias.length;
    const pos = atual >= 0 && n ? `${atual + 1} de ${n}` : n ? `${n} ${n === 1 ? "ocorrência" : "ocorrências"}` : "";
    const progresso = varridas && !completa ? ` · procurando ${Math.round((varridas / total) * 100)}%` : "";
    statusBusca.textContent = n ? pos + progresso : completa ? "nada encontrado" : `procurando${progresso ? progresso.replace(" · procurando", "") : "…"}`;
  }

  async function buscar(direcao) {
    const q = normalizar(campoBusca.value.trim());
    if (!q) { limparRealce(); consulta = ""; ocorrencias = []; atual = -1; statusBusca.textContent = ""; return; }
    if (q !== consulta) {
      consulta = q;
      ocorrencias = [];
      atual = -1;
      limparRealce();
      return varrerTudo(q); // a 1ª ocorrência já é mostrada de dentro da varredura
    }
    if (!ocorrencias.length) return; // ainda procurando (ou nada encontrado)
    atual = (atual + (direcao < 0 ? -1 : 1) + ocorrencias.length) % ocorrencias.length;
    mostrarOcorrencia();
  }

  function mostrarOcorrencia() {
    const oc = ocorrencias[atual];
    if (!oc) return;
    atualizarStatus();
    irPara(oc.pagina);
    setTimeout(() => realcarNaPagina(oc.pagina), 250);
  }

  // Realce dentro da camada de texto: envolve as ocorrências em <mark>. Feito por span, o
  // posicionamento absoluto do pdf.js continua valendo (o <mark> é inline dentro do span).
  function realcarNaPagina(n) {
    const wrap = wrappers[n - 1];
    if (!wrap || !consulta) return;
    for (const span of wrap.querySelectorAll(".textLayer span")) {
      const txt = span.textContent;
      if (!txt || !normalizar(txt).includes(consulta)) continue;
      const norm = normalizar(txt);
      let out = "";
      let i = 0;
      let p = norm.indexOf(consulta);
      while (p >= 0) {
        out += esc(txt.slice(i, p)) + `<mark class="pdf-hit">${esc(txt.slice(p, p + consulta.length))}</mark>`;
        i = p + consulta.length;
        p = norm.indexOf(consulta, i);
      }
      out += esc(txt.slice(i));
      span.innerHTML = out;
    }
  }

  function limparRealce() {
    for (const m of overlay.querySelectorAll("mark.pdf-hit")) {
      const pai = m.parentElement;
      m.replaceWith(document.createTextNode(m.textContent));
      pai.normalize();
    }
  }

  function abrirBusca(abrir) {
    barraBusca.classList.toggle("oculto", !abrir);
    if (abrir) { campoBusca.focus(); campoBusca.select(); }
    else { limparRealce(); consulta = ""; ocorrencias = []; statusBusca.textContent = ""; }
  }

  // ---- IMPRESSÃO --------------------------------------------------------------
  // Entrega o PRÓPRIO PDF à impressão do sistema, num iframe: a caixa de impressão do
  // Windows/navegador já traz seletor de intervalo, prévia e opções — não faz sentido pedir o
  // intervalo antes, numa segunda tela, e a impressão sai com a qualidade do vetor.
  // (A primeira versão rasterizava as páginas escolhidas em imagem: pesado, pior e com uma
  // etapa a mais para o usuário.)
  async function imprimir(botao) {
    const url = URL.createObjectURL(new Blob([dataUrlToUint8(dataUrl)], { type: "application/pdf" }));
    const quadro = document.createElement("iframe");
    quadro.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    quadro.src = url;
    if (botao) botao.disabled = true;
    const fim = toastCarregando("Preparando a impressão…");
    quadro.addEventListener("load", () => {
      fim();
      if (botao) botao.disabled = false;
      try {
        quadro.contentWindow.focus();
        quadro.contentWindow.print();
      } catch (err) {
        console.error("[pdf] imprimir", err);
        toast("Não consegui abrir a impressão. Use “Baixar PDF” e imprima pelo leitor do sistema.", "erro");
      }
      // O diálogo é modal; só depois de fechado é seguro soltar o iframe e a URL.
      setTimeout(() => { quadro.remove(); URL.revokeObjectURL(url); }, 120000);
    });
    document.body.appendChild(quadro);
  }

  // Atualiza o número da página conforme a rolagem (página cujo topo passou do meio).
  scroll.addEventListener("scroll", () => {
    if (document.activeElement !== numInput) numInput.value = paginaAtual();
  });

  numInput.addEventListener("change", () => irPara(parseInt(numInput.value, 10)));
  campoBusca.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); buscar(e.shiftKey ? -1 : 1); }
    if (e.key === "Escape") { e.preventDefault(); abrirBusca(false); }
  });

  function fechar() {
    document.removeEventListener("keydown", onKey);
    if (io) io.disconnect();
    if (document.fullscreenElement === overlay) document.exitFullscreen().catch(() => {});
    // Zera os canvas ANTES de tirar o overlay do DOM: remover o elemento não devolve o bitmap,
    // e são páginas inteiras renderizadas em escala. Depois fecha o documento e o worker, que
    // ficavam vivos a cada apostila aberta — numa sessão de estudo isso empilha rápido.
    overlay.querySelectorAll("canvas").forEach((c) => { c.width = 0; c.height = 0; });
    overlay.remove();
    if (pdf) { try { pdf.destroy(); } catch (_) {} pdf = null; }
  }
  function onKey(e) {
    if (e.key === "Escape" && barraBusca.classList.contains("oculto")) fechar();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); abrirBusca(true); }
    else if (e.key === "PageDown") { e.preventDefault(); irPara(paginaAtual() + 1); }
    else if (e.key === "PageUp") { e.preventDefault(); irPara(paginaAtual() - 1); }
    // Zoom pelo teclado, como no leitor do navegador. "+" chega como "+", "=" ou "Add"
    // conforme o layout do teclado — daí a lista.
    else if ((e.ctrlKey || e.metaKey) && ["+", "=", "Add"].includes(e.key)) { e.preventDefault(); zoom(+0.2); }
    else if ((e.ctrlKey || e.metaKey) && ["-", "_", "Subtract"].includes(e.key)) { e.preventDefault(); zoom(-0.2); }
    else if ((e.ctrlKey || e.metaKey) && e.key === "0") { e.preventDefault(); escala = 1.4; aplicarZoom(); }
  }
  document.addEventListener("keydown", onKey);

  overlay.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-p]");
    if (!b) {
      // Clicar no fundo fecha — mas não quando o clique é o fim de uma SELEÇÃO de texto
      // arrastada até fora da página (senão copiar um trecho fechava o leitor).
      if (e.target === overlay && !String(window.getSelection() || "").trim()) fechar();
      return;
    }
    const p = b.getAttribute("data-p");
    if (p === "close") fechar();
    else if (p === "zoomin") zoom(+0.2);
    else if (p === "zoomout") zoom(-0.2);
    else if (p === "fit") ajustar("largura");
    else if (p === "fit-pagina") ajustar("pagina");
    else if (p === "buscar") abrirBusca(barraBusca.classList.contains("oculto"));
    else if (p === "fechar-busca") abrirBusca(false);
    else if (p === "antes") buscar(-1);
    else if (p === "depois") buscar(1);
    else if (p === "imprimir") imprimir(b);
    else if (p === "fullscreen") {
      if (document.fullscreenElement === overlay) document.exitFullscreen().catch(() => {});
      else overlay.requestFullscreen().catch(() => {});
    } else if (p === "download") {
      // Antes era um <a download> solto: no webview do desktop ele podia não abrir diálogo
      // nenhum e o usuário ficava sem saber se salvou, onde salvou ou se falhou.
      // `baixarArquivo` usa a caixa de salvar NATIVA no desktop (e o download normal no
      // navegador), e aqui o resultado vira aviso na tela.
      b.disabled = true;
      try {
        const nome = (titulo || "documento").replace(/[^\w.-]+/g, "_") + ".pdf";
        const salvo = await baixarArquivo(nome, dataUrlToUint8(dataUrl), "application/pdf");
        toast(salvo ? `PDF salvo: ${nome}` : "Download cancelado.", salvo ? "ok" : "erro");
      } catch (err) {
        console.error("[pdf] download", err);
        toast("Não consegui salvar o PDF.", "erro");
      } finally { b.disabled = false; }
    }
  });
}
