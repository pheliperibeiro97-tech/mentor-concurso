// Orb "vivo" do Mentor IA — a esfera de plasma orgânica que se mexe (assinatura da voz da
// IA), portada do protótipo v3 aprovado. Desenha 3 blobs sobrepostos com gradiente radial
// ciano→índigo, morfando no tempo, + um núcleo claro. Cada elemento .orb ganha um <canvas>.
//
// Robustez p/ SPA que re-renderiza (store.subscribe → render): o loop de cada orb se
// ENCERRA sozinho quando o canvas sai do DOM (isConnected=false), evitando loops órfãos.
// Chame montarOrbs() após cada render — ele ignora orbs já montados (data-orb-on).
const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Fase 2 — ESTADOS do orb (a assinatura visual passa a INFORMAR, não só decorar):
//   normal      = pulso lento (IA conectada, ociosa)
//   .is-thinking = morph acelerado (gerando — o chat já usa esta classe)
//   .orb--off    = apagado/cinza + tooltip (IA desconectada: a promessa não se cumpre,
//                  então o orb não deve "fingir vida")
let _offline = false;
export function setOrbsOffline(v) {
  _offline = !!v;
}

export function montarOrbs(root = document) {
  const alvo = root && root.querySelectorAll ? root : document;
  // Estado offline: aplica/remove em TODOS os orbs (inclusive os já montados — o chat não re-renderiza).
  alvo.querySelectorAll(".orb").forEach((el) => {
    el.classList.toggle("orb--off", _offline);
    if (_offline && !el.getAttribute("data-tip")) el.setAttribute("data-tip", "O Mentor está desligado — conecte uma IA em Configurações.");
  });
  alvo.querySelectorAll(".orb:not([data-orb-on])").forEach((el) => {
    el.setAttribute("data-orb-on", "1");
    el.classList.add("orb--canvas");
    const cv = document.createElement("canvas");
    cv.className = "orb-cv";
    cv.setAttribute("aria-hidden", "true");
    el.appendChild(cv);
    iniciarOrb(cv);
  });
}

function iniciarOrb(cv) {
  const c = cv.getContext("2d");
  if (!c) return;
  const D = Math.min(window.devicePixelRatio || 1, 2);
  let wCss = 0;
  function medir() {
    wCss = cv.clientWidth || cv.parentElement?.clientWidth || 24;
    cv.width = cv.height = Math.max(1, Math.round(wCss * D));
    c.setTransform(D, 0, 0, D, 0, 0);
  }
  medir();
  let t = 0;
  function frame() {
    // Re-render trocou o DOM: este canvas sumiu → encerra o loop (sem vazamento).
    if (!cv.isConnected) return;
    // Reajusta se o tamanho mudou (tema/zoom/responsivo).
    if (cv.clientWidth && Math.round(cv.clientWidth * D) !== cv.width) medir();
    // Velocidade por ESTADO: gerando (is-thinking) morfa rápido; offline quase para.
    const pai = cv.parentElement;
    const vel = pai && pai.classList.contains("orb--off") ? 0.005 : pai && pai.classList.contains("is-thinking") ? 0.055 : 0.02;
    t += reduce ? 0 : vel;
    const w = wCss;
    const cx = w / 2,
      cy = w / 2,
      R = w / 2 - 1;
    c.clearRect(0, 0, w, w);
    const g = c.createRadialGradient(cx, cy, 1, cx, cy, R);
    g.addColorStop(0, "rgba(34,211,238,.95)");
    g.addColorStop(1, "rgba(129,140,248,.55)");
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.25) {
        const r = R * (0.72 + 0.16 * Math.sin(a * 3 + t * (1 + i * 0.5) + i * 2));
        const x = cx + Math.cos(a) * r,
          y = cy + Math.sin(a) * r;
        a ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.closePath();
      c.fillStyle = g;
      c.globalAlpha = 0.34 - i * 0.08;
      c.fill();
    }
    c.globalAlpha = 1;
    c.beginPath();
    c.arc(cx, cy, R * 0.34, 0, 7);
    c.fillStyle = "#eafcff";
    c.fill();
    if (!reduce) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
