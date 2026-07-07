// Tooltip dinâmico compartilhado para os gráficos SVG (vanilla, sem dependência).
// Dá aos nossos gráficos o mesmo "toque" dos apps que usam Recharts/Chart.js:
//   • cartão flutuante temado que segue o cursor (instantâneo, não o balão lento do <title>);
//   • captura ampla nos gráficos de LINHA (passa o mouse em qualquer ponto da área → acha o
//     ponto mais próximo no eixo X, realça-o e desenha uma guia vertical);
//   • realce + cartão nas BARRAS e nas fatias da ROSCA.
// As funções de gráfico marcam os elementos com data-t-nome / data-t-val / data-t-cor e o
// <svg> com data-gtip="linha|barras|rosca" (+ bounds da área de plotagem nos de linha).
import { esc } from "./util.js";

const NS = "http://www.w3.org/2000/svg";
let tipEl = null;

// Monta os atributos de tooltip de um elemento (usado dentro das funções de gráfico).
export function tipAttrs(nome, val, cor) {
  const c = cor ? ` data-t-cor="${esc(cor)}"` : "";
  return ` data-t-nome="${esc(nome)}" data-t-val="${esc(val)}"${c}`;
}

function garantirTip() {
  if (tipEl && document.body.contains(tipEl)) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = "gtip";
  tipEl.setAttribute("role", "tooltip");
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  return tipEl;
}

function mostrarDoEl(el, clientX, clientY) {
  const nome = el.getAttribute("data-t-nome") || "";
  const val = el.getAttribute("data-t-val") || "";
  const cor = el.getAttribute("data-t-cor") || "";
  const swatch = cor ? `<span class="gtip-cor" style="background:${cor}"></span>` : "";
  mostrarTip(`<span class="gtip-nome">${swatch}${esc(nome)}</span><span class="gtip-val">${esc(val)}</span>`, clientX, clientY);
}

function mostrarTip(html, clientX, clientY) {
  const el = garantirTip();
  el.innerHTML = html;
  el.hidden = false;
  // Posiciona acima-à-direita do cursor; vira de lado/baixo quando encosta na borda.
  const pad = 10;
  const r = el.getBoundingClientRect();
  let x = clientX + 14;
  let y = clientY - r.height - 12;
  if (x + r.width + pad > window.innerWidth) x = clientX - r.width - 14;
  if (x < pad) x = pad;
  if (y < pad) y = clientY + 18;
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function esconderTip() {
  if (tipEl) tipEl.hidden = true;
}

// Barras e rosca: cada elemento com data-t-* vira alvo próprio.
function ligarSimples(svg) {
  svg.querySelectorAll("[data-t-nome]").forEach((el) => {
    el.addEventListener("pointerenter", () => el.classList.add("g-hover"));
    el.addEventListener("pointermove", (e) => mostrarDoEl(el, e.clientX, e.clientY));
    el.addEventListener("pointerleave", () => { el.classList.remove("g-hover"); esconderTip(); });
  });
}

// Gráficos de linha: captura ampla + ponto mais próximo + guia vertical.
function ligarLinha(svg) {
  const pts = [...svg.querySelectorAll(".g-ponto[data-t-nome]")];
  if (!pts.length) return;
  const top = parseFloat(svg.getAttribute("data-plot-top")) || 0;
  const bot = parseFloat(svg.getAttribute("data-plot-bot")) || 0;
  const left = parseFloat(svg.getAttribute("data-plot-left")) || 0;
  const right = parseFloat(svg.getAttribute("data-plot-right")) || 0;

  // Guia vertical (fica atrás dos pontos).
  const guia = document.createElementNS(NS, "line");
  guia.setAttribute("class", "g-guia");
  guia.setAttribute("y1", top);
  guia.setAttribute("y2", bot);
  guia.style.opacity = "0";
  svg.insertBefore(guia, pts[0]);

  // Retângulo transparente cobrindo a área de plotagem: garante mousemove em qualquer ponto.
  const ov = document.createElementNS(NS, "rect");
  ov.setAttribute("x", left);
  ov.setAttribute("y", top);
  ov.setAttribute("width", Math.max(0, right - left));
  ov.setAttribute("height", Math.max(0, bot - top));
  ov.setAttribute("fill", "transparent");
  ov.style.cursor = "crosshair";
  svg.appendChild(ov);

  let ativo = null;
  const limpar = () => {
    if (ativo) ativo.classList.remove("g-ponto-on");
    ativo = null;
    guia.style.opacity = "0";
    esconderTip();
  };
  ov.addEventListener("pointermove", (e) => {
    let best = null, bd = Infinity;
    for (const p of pts) {
      const r = p.getBoundingClientRect();
      const sx = r.left + r.width / 2;
      const d = Math.abs(e.clientX - sx);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    if (ativo && ativo !== best) ativo.classList.remove("g-ponto-on");
    ativo = best;
    best.classList.add("g-ponto-on");
    const cx = best.getAttribute("cx");
    guia.setAttribute("x1", cx);
    guia.setAttribute("x2", cx);
    guia.style.opacity = "1";
    mostrarDoEl(best, e.clientX, e.clientY);
  });
  ov.addEventListener("pointerleave", limpar);
}

// Liga os tooltips em todos os gráficos presentes em `root`. Idempotente por render
// (marca o <svg> para não religar caso seja chamado de novo sobre o mesmo nó).
export function ligarTooltipsGraficos(root) {
  if (!root) return;
  root.querySelectorAll("svg[data-gtip]").forEach((svg) => {
    if (svg.dataset.gtipLigado === "1") return;
    svg.dataset.gtipLigado = "1";
    const tipo = svg.getAttribute("data-gtip");
    if (tipo === "linha") ligarLinha(svg);
    else ligarSimples(svg);
  });
}
