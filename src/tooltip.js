// Tooltip via PORTAL. Motivo: os tooltips em ::after/::before eram recortados por qualquer
// ancestral com overflow:hidden (faixa-ia, ddx-linha, nav, mm-corpo...). Aqui um único nó
// position:fixed vive no <body>, posicionado por getBoundingClientRect() com flip por viewport.
// Reusa os atributos existentes data-tip / data-tip-pos (o HTML não muda).
//
// data-tip-pos aceito: "cima" (padrão, acima centralizado), "cima-esq", "cima-dir",
// "bottom", "bottom-esq", "bottom-dir". O eixo vertical faz flip automático se faltar espaço.

let tipEl = null;
let alvoAtual = null;
let hoverTimer = null; // atraso de 300ms no hover (não pisca ao só passar o mouse)
let toqueTimer = null; // no toque, o balão some sozinho após ~2,5s

// Dispositivo de toque (sem hover fino): num tap, pointerover+click disparam quase juntos,
// então o balão pisca e some. Nesses aparelhos o clique passa a MOSTRAR o balão (ver initTooltips).
function ehToque() {
  return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(hover: none)").matches;
}

// ===== Celular: a dica NÃO ensina tecla =====
// Num aparelho de toque não existe teclado, mas o balão aparece assim mesmo — porque no toque
// é o TAP que o exibe (ver initTooltips). Resultado: tocar na seta mostrava "Anterior (←)",
// tocar numa nota mostrava "Atalho 1", no × mostrava "Sair (Esc)"… O bloco `@media (hover:none)`
// do CSS não alcança nada disso: o texto vem de data-tip e é pintado no portal .tip-portal.
// Aqui o texto é limpo ANTES de exibir; se só sobrar o atalho, o balão nem abre.
const RE_TECLA = /(?:\bEsc\b|\bEnter\b|\bTab\b|Espa[çc]o|\bShift\b|\bCtrl\b|\bCmd\b|⌘|[←→↑↓]|\bteclas?\b|\batalhos?\b)/i;

export function dicaParaToque(txt) {
  let s = String(txt || "");
  // Dica que é SÓ o nome da tecla ("Espaço", "Esc", "Enter") não sobra nada de útil no toque.
  if (/^\s*(?:Esc|Enter|Tab|Espa[çc]o|Shift|Ctrl|Cmd|⌘|[←→↑↓])\s*$/i.test(s)) return "";
  // 1) parênteses que só ensinam a tecla: "(Esc)", "(←)", "(Ctrl+P)", "(tecla 2 ou Enter)".
  //    Parênteses com conteúdo normal ("(fica aqui, sem sair da tela)") ficam intactos.
  s = s.replace(/\s*[(（][^)）]{0,32}[)）]/g, (m) => (RE_TECLA.test(m) ? "" : m));
  // 2) "Atalho 1", "Atalho: C", "Atalho 1 · …" em qualquer posição.
  s = s.replace(/(^|[\s·•|,;—-])atalhos?\s*:?\s*[A-Za-z0-9](?:\s*[–-]\s*[A-Za-z0-9])?\s*[·•|,;]?/gi, "$1");
  // 3) frases inteiras dedicadas ao teclado ("Espaço vira, 1–4 nota, Esc sai."). Só com 2+
  //    frases, para nunca esvaziar uma dica de uma frase só.
  const frases = s.split(/([.!?])\s+/).reduce((acc, p, i, arr) => {
    if (i % 2 === 0) acc.push(p + (arr[i + 1] || ""));
    return acc;
  }, []);
  if (frases.length > 1) {
    const mantidas = frases.filter((f) => !RE_TECLA.test(f));
    if (mantidas.length) s = mantidas.join(" ");
  }
  return s.replace(/\s{2,}/g, " ").replace(/^[\s·•|,;–—-]+/, "").replace(/[\s·•|]+$/, "").trim();
}

function ensureEl() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "tip-portal";
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function esconder() {
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
  if (toqueTimer) { clearTimeout(toqueTimer); toqueTimer = null; }
  alvoAtual = null;
  if (tipEl) tipEl.classList.remove("tip-on");
}

// Exportada para o render global (main.js): quando a tela re-renderiza ou navega, a
// âncora do tooltip é destruída mas o portal (position:fixed no <body>) continuaria
// visível, "preso" no ar. O main.js chama isto no início de cada render.
export function esconderTooltip() {
  esconder();
}

function posicionar(alvo) {
  // A espera de 300ms pode terminar depois de um re-render ter tirado o alvo do DOM; aí o
  // getBoundingClientRect() dá tudo zero e o balão gruda num canto (mesmo problema que o
  // hover-preview do Edital tinha).
  if (!alvo.isConnected) return esconder();
  const bruto = alvo.getAttribute("data-tip");
  if (!bruto) return esconder();
  // No toque, a dica perde a parte que ensina tecla; se não sobrar nada, nem abre o balão.
  const txt = ehToque() ? dicaParaToque(bruto) : bruto;
  if (!txt) return esconder();
  alvoAtual = alvo;
  const pos = alvo.getAttribute("data-tip-pos") || "cima";
  const el = ensureEl();
  el.textContent = txt;
  // mede com o conteúdo já aplicado (ainda invisível para o usuário)
  el.style.left = "-9999px";
  el.style.top = "0px";
  el.classList.remove("tip-below");
  const r = alvo.getBoundingClientRect();
  const tw = el.offsetWidth, th = el.offsetHeight;
  const gap = 9, vw = window.innerWidth, vh = window.innerHeight;

  let abaixo = pos.startsWith("bottom");
  if (!abaixo && r.top - th - gap < 4) abaixo = true;         // sem espaço acima → vira p/ baixo
  else if (abaixo && r.bottom + th + gap > vh - 4) abaixo = false; // sem espaço abaixo → volta p/ cima
  const top = abaixo ? r.bottom + gap : r.top - th - gap;

  let left;
  if (pos.includes("esq")) left = r.left;
  else if (pos.includes("dir")) left = r.right - tw;
  else left = r.left + r.width / 2 - tw / 2;
  left = Math.max(6, Math.min(left, vw - tw - 6));

  el.style.left = Math.round(left) + "px";
  el.style.top = Math.round(top) + "px";
  el.classList.toggle("tip-below", abaixo);
  // seta apontando para o centro do alvo (limitada às bordas do balão)
  const arrowX = Math.max(10, Math.min(r.left + r.width / 2 - left, tw - 10));
  el.style.setProperty("--tip-arrow", Math.round(arrowX) + "px");
  el.classList.add("tip-on");
}

export function initTooltips() {
  // Delegação global: qualquer [data-tip] com texto dispara o balão.
  document.addEventListener("pointerover", (e) => {
    const alvo = e.target.closest?.("[data-tip]");
    if (!alvo || !alvo.getAttribute("data-tip")) return;
    if (alvo === alvoAtual) return;
    // Atraso: só mostra se o mouse PARAR ~300ms sobre o alvo (evita "piscar" ao passar).
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => posicionar(alvo), 300);
  });
  document.addEventListener("pointerout", (e) => {
    const alvo = e.target.closest?.("[data-tip]");
    if (!alvo) return;
    // só esconde se saiu de fato do alvo (não para um filho)
    if (e.relatedTarget && alvo.contains(e.relatedTarget)) return;
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    if (alvo === alvoAtual) esconder();
  });
  // teclado (acessibilidade)
  document.addEventListener("focusin", (e) => {
    const alvo = e.target.closest?.("[data-tip]");
    if (alvo && alvo.getAttribute("data-tip")) posicionar(alvo);
  });
  document.addEventListener("focusout", () => esconder());
  // some ao rolar/redimensionar (a posição fixa ficaria defasada)
  window.addEventListener("scroll", esconder, true);
  window.addEventListener("resize", esconder);
  // Clique: no desktop (hover fino) some, evitando balão preso após a ação.
  // No toque, um tap num [data-tip] MOSTRA o balão (a ação do botão segue normalmente, pois
  // NÃO damos preventDefault) e ele some no próximo tap fora ou após ~2,5s.
  document.addEventListener("click", (e) => {
    if (ehToque()) {
      const alvo = e.target.closest?.("[data-tip]");
      if (alvo && alvo.getAttribute("data-tip")) {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
        posicionar(alvo);
        if (toqueTimer) clearTimeout(toqueTimer);
        toqueTimer = setTimeout(esconder, 2500);
        // Se o toque ABRIU um painel (cronômetro, lembretes, Mentor, janela/modal), o balão
        // ficaria flutuando POR CIMA do que acabou de abrir — explicando um botão que o
        // usuário já acionou. Nesse caso ele some na hora. Verificado no frame seguinte,
        // depois de o handler do próprio botão rodar.
        setTimeout(() => {
          if (document.querySelector(".cf-pop:not([hidden]), .lf-pop:not([hidden]), #chat-panel:not(.oculto), .mm-overlay, .modal-overlay, .paleta-overlay")) esconder();
        }, 60);
        return; // deixa a ação (clique no botão) prosseguir; mantém o balão visível
      }
      esconder(); // tap fora de qualquer [data-tip]
      return;
    }
    esconder();
  }, true);
}
