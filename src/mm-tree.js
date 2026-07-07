// ===== Mapa mental — renderizador tidy-tree próprio (SVG) =====
// Layout horizontal estilo NotebookLM, sem dependências externas:
//  · raiz à esquerda → ramos crescem para a direita (colunas por nível);
//  · nós em PÍLULA arredondada com fill PASTEL POR NÍVEL (raiz forte → lilás→azul→verde…);
//  · conectores CURVOS (bézier) coloridos pelo nível do filho;
//  · CHEVRON FORA da pílula (nunca cobre o texto) para recolher/expandir a subárvore;
//  · animação de verdade: ao expandir/recolher, os nós DESLIZAM (tween) e os ramos novos
//    "brotam" do pai; ao recolher, retraem para o pai. Zoom/ajustar com transição suave;
//  · zoom (roda + botões), pan (arrastar), ajustar à tela (contém TUDO, nada fora do quadro),
//    expandir/recolher tudo, hover que destaca o nó e seus ramos.
// Funciona nos 2 temas: cores em PALETTE[tema] (claro/escuro).

const SVGNS = "http://www.w3.org/2000/svg";

// Paleta pastel por nível (índice 0 = raiz). Cicla se a árvore for mais funda.
const PALETTE = {
  claro: {
    link: "#c3cede",
    levels: [
      { fill: "#1d4ed8", stroke: "#1e40af", text: "#ffffff", grad: ["#4f8bf7", "#1d4ed8"], accent: "#1d4ed8" },
      { fill: "#efeafe", stroke: "#c4b5fd", text: "#4c1d95", accent: "#8b5cf6" },
      { fill: "#e2edff", stroke: "#93c5fd", text: "#1e3a8a", accent: "#3b82f6" },
      { fill: "#d6f7e8", stroke: "#6ee7b7", text: "#065f46", accent: "#10b981" },
      { fill: "#fdf0cf", stroke: "#fbbf24", text: "#92400e", accent: "#f59e0b" },
      { fill: "#fde4ef", stroke: "#f9a8d4", text: "#9d174d", accent: "#ec4899" },
      { fill: "#e2f4fd", stroke: "#7dd3fc", text: "#075985", accent: "#0ea5e9" },
    ],
  },
  escuro: {
    link: "#3a4660",
    levels: [
      { fill: "#2563eb", stroke: "#60a5fa", text: "#ffffff", grad: ["#3b82f6", "#1d4ed8"], accent: "#60a5fa" },
      { fill: "rgba(139,92,246,0.24)", stroke: "rgba(139,92,246,0.62)", text: "#e6deff", accent: "#a78bfa" },
      { fill: "rgba(59,130,246,0.24)", stroke: "rgba(59,130,246,0.62)", text: "#cfe0ff", accent: "#60a5fa" },
      { fill: "rgba(16,185,129,0.22)", stroke: "rgba(16,185,129,0.62)", text: "#b8f5da", accent: "#34d399" },
      { fill: "rgba(245,158,11,0.22)", stroke: "rgba(245,158,11,0.62)", text: "#ffe9ad", accent: "#fbbf24" },
      { fill: "rgba(236,72,153,0.22)", stroke: "rgba(236,72,153,0.62)", text: "#ffd4ea", accent: "#f472b6" },
      { fill: "rgba(14,165,233,0.22)", stroke: "rgba(14,165,233,0.62)", text: "#c7ecff", accent: "#38bdf8" },
    ],
  },
};
const lvl = (pal, d) => pal.levels[Math.min(d, pal.levels.length - 1)];

// Geometria.
const PAD_X = 16, PAD_Y = 10;
const MIN_W = 52, MAX_TEXT_W = 200, MAX_LINES = 4;
const COL_GAP = 34;   // respiro entre a "zona do chevron" de uma coluna e a próxima coluna
const V_GAP = 15;     // espaço vertical entre caixas irmãs
const CHEV_R = 8;     // raio do botão chevron
const CHEV_GAP = 8;   // espaço entre a borda da pílula e o chevron
const CHEV_SPACE = CHEV_GAP + CHEV_R * 2 + 4; // largura reservada à direita de cada coluna
const DUR = 420;      // duração das animações de layout (ms)

// Medição de texto via canvas (sem tocar no DOM).
let _mctx;
function mctx() {
  if (!_mctx) _mctx = document.createElement("canvas").getContext("2d");
  return _mctx;
}
function wrapText(text, font, maxW, maxLines) {
  const ctx = mctx();
  ctx.font = font;
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  let out = lines.length ? lines : [""];
  if (out.length > maxLines) {
    out = out.slice(0, maxLines);
    let last = out[maxLines - 1];
    while (last && ctx.measureText(last + "…").width > maxW && last.includes(" "))
      last = last.slice(0, last.lastIndexOf(" "));
    out[maxLines - 1] = last + "…";
  }
  let width = 0;
  for (const l of out) width = Math.max(width, ctx.measureText(l).width);
  return { lines: out, width };
}

// Árvore interna com ids estáveis ("root", "0", "0.1", …).
function buildTree(arv) {
  const make = (raw, depth, path) => ({
    id: path,
    depth,
    titulo: raw && raw.titulo != null ? String(raw.titulo) : depth === 0 ? "Mapa mental" : "",
    children: ((raw && raw.ramos) || []).map((r, i) => make(r, depth + 1, path === "root" ? String(i) : path + "." + i)),
  });
  return make({ titulo: arv && arv.titulo, ramos: (arv && arv.ramos) || [] }, 0, "root");
}
const parentIdOf = (id) => (id === "root" ? null : id.includes(".") ? id.slice(0, id.lastIndexOf(".")) : "root");

// Layout tidy horizontal. Colunas por nível (x fixo por nível), y por empacotamento de folhas
// (pai = média do 1º e último filho). Chevron fica FORA da pílula, então a coluna reserva
// CHEV_SPACE à direita — o texto nunca é coberto e as colunas ficam alinhadas.
function layout(root, collapsed) {
  const measure = (n) => {
    const isRoot = n.depth === 0;
    n.font = isRoot ? "700 15px Inter, system-ui, sans-serif" : "600 13.5px Inter, system-ui, sans-serif";
    n.lineH = isRoot ? 21 : 18.5;
    const { lines, width } = wrapText(n.titulo, n.font, MAX_TEXT_W, MAX_LINES);
    n.lines = lines;
    n.w = Math.round(Math.max(MIN_W, Math.min(MAX_TEXT_W, width) + PAD_X * 2));
    n.h = Math.round(lines.length * n.lineH + PAD_Y * 2);
    n.hasChildren = n.children.length > 0;
    n.collapsed = n.hasChildren && collapsed.has(n.id);
    n.children.forEach(measure);
  };
  measure(root);

  const colW = [];
  const widthPass = (n) => {
    colW[n.depth] = Math.max(colW[n.depth] || 0, n.w);
    if (!n.collapsed) n.children.forEach(widthPass);
  };
  widthPass(root);
  const colX = [];
  let acc = 0;
  for (let d = 0; d < colW.length; d++) { colX[d] = acc; acc += colW[d] + CHEV_SPACE + COL_GAP; }

  let cursor = 0;
  const place = (n) => {
    n.x = colX[n.depth];
    if (n.collapsed || !n.children.length) {
      n.cy = cursor + n.h / 2;
      cursor += n.h + V_GAP;
    } else {
      n.children.forEach(place);
      const a = n.children[0], b = n.children[n.children.length - 1];
      n.cy = (a.cy + b.cy) / 2;
    }
  };
  place(root);

  const nodes = [], links = [];
  const gather = (n, parent) => {
    n.top = n.cy - n.h / 2;
    nodes.push(n);
    if (parent) links.push({ parentId: parent.id, childId: n.id });
    if (!n.collapsed) n.children.forEach((c) => gather(c, n));
  };
  gather(root, null);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const right = n.x + n.w + (n.hasChildren ? CHEV_GAP + CHEV_R * 2 : 0);
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.top);
    maxX = Math.max(maxX, right); maxY = Math.max(maxY, n.top + n.h);
  }
  return { nodes, byId: new Map(nodes.map((n) => [n.id, n])), links, bounds: { minX, minY, maxX, maxY } };
}

function el(name, attrs) {
  const e = document.createElementNS(SVGNS, name);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
// Bézier horizontal suave de (x1,y1) → (x2,y2).
function bez(x1, y1, x2, y2) {
  const dx = Math.max(24, (x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;

// Versão ESTÁTICA para EXPORTAR (imprimir/baixar): renderiza offscreen no tema pedido,
// remove interação/sombra, força opacidade cheia e adiciona um FUNDO. Retorna
// { svg (destacado, pronto p/ serializar), bw, bh } em unidades de usuário.
// Para impressão/PNG usamos SEMPRE tema "claro" (fundo branco + texto escuro = legível no
// papel e econômico em tinta), independentemente do tema da tela.
export function exportStaticSVG(arv, { tema = "claro", collapsed } = {}) {
  const holder = document.createElementNS(SVGNS, "svg");
  holder.setAttribute("style", "position:absolute;left:-99999px;top:0;width:1600px;height:1600px");
  document.body.appendChild(holder);
  let ctrl = null;
  try {
    ctrl = renderTidyTree(holder, arv, { tema, collapsed: collapsed ? new Set(collapsed) : new Set() });
    const g = holder.querySelector(".mm-zoom");
    const bb = g.getBBox();
    const pad = 24;
    const bw = bb.width + pad * 2, bh = bb.height + pad * 2;
    const out = holder.cloneNode(true);
    out.removeAttribute("style");
    const og = out.querySelector(".mm-zoom");
    if (og) { og.removeAttribute("transform"); og.classList.remove("mm-anim"); }
    out.querySelectorAll("[opacity]").forEach((n) => n.setAttribute("opacity", "1"));
    out.querySelectorAll("[filter]").forEach((n) => n.removeAttribute("filter")); // sombra some na impressão vetorial
    const bg = document.createElementNS(SVGNS, "rect");
    bg.setAttribute("x", bb.x - pad); bg.setAttribute("y", bb.y - pad);
    bg.setAttribute("width", bw); bg.setAttribute("height", bh);
    bg.setAttribute("rx", 16); bg.setAttribute("fill", tema === "escuro" ? "#0b1220" : "#ffffff");
    const defsEl = out.querySelector("defs");
    if (defsEl && defsEl.nextSibling) out.insertBefore(bg, defsEl.nextSibling); else out.insertBefore(bg, out.firstChild);
    out.setAttribute("viewBox", `${bb.x - pad} ${bb.y - pad} ${bw} ${bh}`);
    out.setAttribute("preserveAspectRatio", "xMidYMid meet");
    return { svg: out, bw, bh };
  } finally {
    // sempre limpa o holder offscreen, mesmo se algo acima lançar (senão vaza no DOM)
    try { if (ctrl) ctrl.destroy(); } catch (_) {}
    holder.remove();
  }
}

// Renderiza o mapa em `svg`. Retorna controlador com zoom/fit/expand/png/destroy.
// opts: { tema, collapsed(Set persistido), onZoom(k), onToggleAll(allExpanded) }
export function renderTidyTree(svg, arv, opts = {}) {
  const tema = opts.tema === "escuro" ? "escuro" : "claro";
  const pal = PALETTE[tema];
  const collapsed = opts.collapsed instanceof Set ? opts.collapsed : new Set();
  const root = buildTree(arv);

  svg.innerHTML = "";
  const defs = el("defs");
  const rl = lvl(pal, 0);
  const grad = el("linearGradient", { id: "mm-grad-root", x1: "0", y1: "0", x2: "0", y2: "1" });
  grad.appendChild(el("stop", { offset: "0", "stop-color": (rl.grad && rl.grad[0]) || rl.fill }));
  grad.appendChild(el("stop", { offset: "1", "stop-color": (rl.grad && rl.grad[1]) || rl.fill }));
  defs.appendChild(grad);
  const filt = el("filter", { id: "mm-shadow", x: "-30%", y: "-30%", width: "160%", height: "160%" });
  filt.appendChild(el("feDropShadow", { dx: "0", dy: "1.5", stdDeviation: "2.6", "flood-color": tema === "escuro" ? "#000000" : "#1e293b", "flood-opacity": tema === "escuro" ? "0.5" : "0.16" }));
  defs.appendChild(filt);
  svg.appendChild(defs);

  const gZoom = el("g", { class: "mm-zoom" });
  svg.appendChild(gZoom);
  const gLinks = el("g", { class: "mm-links" });
  const gNodes = el("g", { class: "mm-nodes" });
  gZoom.appendChild(gLinks);
  gZoom.appendChild(gNodes);

  let view = { k: 1, tx: 0, ty: 0 };
  let curBounds = null;
  let rootCy = 0;
  let userInteragiu = false;
  let raf = null;
  let finalizarPendente = null; // snapshot p/ concluir um tween interrompido por outro (anti-flicker)

  // ---- elementos por id (reutilizados entre renders para animar) ----
  const nodeEls = new Map(); // id -> { g, rect, text, chevG, sign }
  const linkEls = new Map(); // childId -> path
  let positions = new Map(); // id -> { x, top, w, h }  (estado renderizado atual)
  let curLinks = [];         // links atualmente montados (do último layout)

  function makeNodeEl(n) {
    const c = lvl(pal, n.depth);
    const g = el("g", { class: "mm-node" + (n.depth === 0 ? " mm-node-root" : ""), "data-id": n.id });
    const rx = Math.min(15, n.h / 2);
    const rect = el("rect", {
      class: "mm-pill", x: 0, y: 0, width: n.w, height: n.h, rx, ry: rx,
      fill: n.depth === 0 ? "url(#mm-grad-root)" : c.fill,
      stroke: c.stroke, "stroke-width": n.depth === 0 ? 0 : 1.25,
      filter: "url(#mm-shadow)",
    });
    g.appendChild(rect);
    const totalH = n.lines.length * n.lineH;
    const text = el("text", { x: n.w / 2, "text-anchor": "middle", fill: c.text, font: n.font });
    n.lines.forEach((ln, i) => {
      const ts = el("tspan", { x: n.w / 2, y: n.h / 2 - totalH / 2 + n.lineH * (i + 0.5) });
      ts.setAttribute("dominant-baseline", "middle");
      ts.textContent = ln;
      text.appendChild(ts);
    });
    g.appendChild(text);
    let chevG = null, sign = null;
    if (n.hasChildren) {
      chevG = el("g", { class: "mm-chevron", "data-id": n.id });
      const cx = n.w + CHEV_GAP + CHEV_R, cy = n.h / 2;
      chevG.appendChild(el("circle", {
        class: "mm-chev-bg", cx, cy, r: CHEV_R,
        fill: tema === "escuro" ? "#0e1626" : "#ffffff",
        stroke: c.accent || c.stroke, "stroke-width": 1.5,
      }));
      sign = el("path", { class: "mm-chev-sign", stroke: c.accent || c.stroke, "stroke-width": 1.8, "stroke-linecap": "round" });
      chevG.appendChild(sign);
      g.appendChild(chevG);
    }
    const rec = { g, rect, text, chevG, sign, cx: n.w + CHEV_GAP + CHEV_R, cyc: n.h / 2 };
    updateSign(rec, n.collapsed);
    // hover: destaca o nó e seus ramos (entrando/saindo)
    g.addEventListener("pointerenter", () => setHot(n.id, true));
    g.addEventListener("pointerleave", () => setHot(n.id, false));
    return rec;
  }
  function updateSign(rec, collapsed) {
    if (!rec.sign) return;
    const cx = rec.cx, cy = rec.cyc;
    rec.sign.setAttribute("d", collapsed
      ? `M ${cx - 3.4} ${cy} h 6.8 M ${cx} ${cy - 3.4} v 6.8`  // "+"
      : `M ${cx - 3.4} ${cy} h 6.8`);                            // "–"
  }
  function setHot(id, on) {
    const rec = nodeEls.get(id);
    if (rec) rec.g.classList.toggle("mm-hot", on);
    // realça os links conectados a este nó (como pai OU como filho)
    for (const l of curLinks) {
      if (l.parentId === id || l.childId === id) {
        const p = linkEls.get(l.childId);
        if (p) p.classList.toggle("mm-link-hot", on);
      }
    }
  }

  function makeLinkEl(childId, depth) {
    const c = lvl(pal, depth);
    const p = el("path", { class: "mm-link", fill: "none", stroke: c.accent || pal.link, "stroke-linecap": "round" });
    return p;
  }
  // ponto de saída do link no pai (à direita, depois do chevron) e chegada no filho (à esquerda)
  const outX = (pos) => pos.x + pos.w + CHEV_GAP + CHEV_R * 2;
  const outY = (pos) => pos.top + pos.h / 2;
  const inX = (pos) => pos.x;
  const inY = (pos) => pos.top + pos.h / 2;

  // ---- render com animação (tween unificado de nós + links) ----
  function render(animar) {
    // Se um tween anterior foi interrompido (clique rápido), CONCLUI-o antes (snap ao destino
    // + commit) para o novo partir de posições corretas — sem flicker/nós órfãos.
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (finalizarPendente) { finalizarPendente(); finalizarPendente = null; }
    const L = layout(root, collapsed);
    curBounds = L.bounds;
    rootCy = (L.byId.get("root") || {}).cy || rootCy;
    const newIds = new Set(L.nodes.map((n) => n.id));

    // garante elemento de cada nó novo/visível + atualiza sinal do chevron
    for (const n of L.nodes) {
      let rec = nodeEls.get(n.id);
      if (!rec) { rec = makeNodeEl(n); nodeEls.set(n.id, rec); gNodes.appendChild(rec.g); }
      else updateSign(rec, n.collapsed);
    }

    // posições de origem/destino p/ o tween
    const primeira = positions.size === 0;
    const involved = new Map(); // id -> { rec, fx, fy, tx, ty, fo, to }
    for (const n of L.nodes) {
      const to = { x: n.x, top: n.top };
      let from = positions.get(n.id);
      let fo = 1, tOp = 1;
      if (!from) { // nó ENTRANDO: brota da posição atual do pai
        const pPos = positions.get(parentIdOf(n.id)) || to;
        from = { x: pPos.x, top: pPos.top };
        fo = 0;
      }
      involved.set(n.id, { rec: nodeEls.get(n.id), fx: from.x, fy: from.top, tx: to.x, ty: to.top, fo, to: tOp });
    }
    // nós SAINDO: retraem para o pai (novo) e somem
    const saindo = [];
    for (const [id, rec] of nodeEls) {
      if (newIds.has(id)) continue;
      const from = positions.get(id);
      if (!from) { rec.g.remove(); nodeEls.delete(id); continue; }
      // encontra ancestral que sobrevive (destino da retração)
      let anc = parentIdOf(id);
      while (anc && !L.byId.has(anc)) anc = parentIdOf(anc);
      const sink = anc && L.byId.get(anc) ? { x: L.byId.get(anc).x, top: L.byId.get(anc).top } : from;
      involved.set(id, { rec, fx: from.x, fy: from.top, tx: sink.x, ty: sink.top, fo: 1, to: 0, remover: true });
      saindo.push(id);
    }

    // links: união dos atuais e antigos, cada um com pai/filho e opacidade alvo
    const LINK_OP = 0.55;
    const newLinkSet = new Map(L.links.map((l) => [l.childId, l]));
    const linkUnion = new Map();
    for (const l of L.links) linkUnion.set(l.childId, { parentId: l.parentId, childId: l.childId, depth: L.byId.get(l.childId).depth, toOp: LINK_OP });
    for (const [childId] of linkEls) {
      if (!newLinkSet.has(childId)) {
        const pid = parentIdOf(childId);
        linkUnion.set(childId, { parentId: pid, childId, depth: (L.byId.get(childId) || {}).depth || 1, toOp: 0, remover: true });
      }
    }
    for (const [childId, info] of linkUnion) {
      let p = linkEls.get(childId);
      const novo = !p;
      if (novo) { p = makeLinkEl(childId, info.depth); linkEls.set(childId, p); gLinks.appendChild(p); }
      info.el = p;
      info.fromOp = p.hasAttribute("stroke-opacity") ? parseFloat(p.getAttribute("stroke-opacity")) : (info.toOp > 0 ? 0 : LINK_OP);
    }
    curLinks = L.links;

    const draw = (e) => {
      // nós
      const cur = new Map();
      for (const [id, inv] of involved) {
        const x = lerp(inv.fx, inv.tx, e), top = lerp(inv.fy, inv.ty, e);
        const op = lerp(inv.fo, inv.to, e);
        inv.rec.g.setAttribute("transform", `translate(${x},${top})`);
        inv.rec.g.setAttribute("opacity", op.toFixed(3));
        const sz = nodeSize(id);
        cur.set(id, { x, top, w: sz.w, h: sz.h });
      }
      // links (a partir das posições correntes de pai e filho)
      for (const [childId, info] of linkUnion) {
        const pc = cur.get(info.parentId), cc = cur.get(childId);
        if (pc && cc) info.el.setAttribute("d", bez(outX(pc), outY(pc), inX(cc), inY(cc)));
        info.el.setAttribute("stroke-opacity", lerp(info.fromOp, info.toOp, e).toFixed(3));
      }
    };

    // tamanho de cada nó (para os pontos de conexão) — vem do layout novo ou do estado antigo
    function nodeSize(id) {
      const n = L.byId.get(id); if (n) return { w: n.w, h: n.h };
      const p = positions.get(id); return p ? { w: p.w, h: p.h } : { w: 0, h: 0 };
    }

    const commit = () => {
      for (const id of saindo) { const r = nodeEls.get(id); if (r) { r.g.remove(); nodeEls.delete(id); } }
      for (const [childId, info] of linkUnion) if (info.remover) { info.el.remove(); linkEls.delete(childId); }
      positions = new Map(L.nodes.map((n) => [n.id, { x: n.x, top: n.top, w: n.w, h: n.h }]));
    };

    if (primeira || !animar) {
      draw(1);
      // reveal suave na primeira pintura
      if (primeira) { gNodes.setAttribute("opacity", "0"); gLinks.setAttribute("opacity", "0");
        requestAnimationFrame(() => { gNodes.style.transition = gLinks.style.transition = "opacity .34s ease"; gNodes.setAttribute("opacity", "1"); gLinks.setAttribute("opacity", "1"); }); }
      commit();
      return;
    }
    finalizarPendente = () => { draw(1); commit(); };
    const t0 = performance.now();
    const step = (now) => {
      const e = easeOut(Math.min(1, (now - t0) / DUR));
      draw(e);
      if (e < 1) raf = requestAnimationFrame(step);
      else { raf = null; commit(); finalizarPendente = null; }
    };
    raf = requestAnimationFrame(step);
  }

  // ---- zoom / pan / ajustar ----
  const rect = () => svg.getBoundingClientRect();
  function vpW() { const r = rect(); return r.width || svg.clientWidth || 900; }
  function vpH() { const r = rect(); return r.height || svg.clientHeight || 460; }
  function apply() {
    gZoom.setAttribute("transform", `translate(${view.tx},${view.ty}) scale(${view.k})`);
    if (opts.onZoom) opts.onZoom(view.k);
  }
  function setAnim(on) { gZoom.classList.toggle("mm-anim", !!on); }
  function fit(animar) {
    const b = curBounds;
    if (!b || !isFinite(b.minX)) return;
    const r = rect();
    if (r.width < 40 || r.height < 40) return;
    const w = b.maxX - b.minX, h = b.maxY - b.minY;
    const pad = 40;
    const W = vpW(), H = vpH();
    // Comportamento NotebookLM: prioriza LEGIBILIDADE. Ajusta para caber, mas com PISO de
    // ~72% (nós legíveis) e teto 1.0 (não amplia). Se não couber nesse piso, o excedente
    // (quase sempre VERTICAL, pois a árvore cresce para a direita) fica navegável por pan.
    const cabe = Math.min((W - pad * 2) / Math.max(w, 1), (H - pad * 2) / Math.max(h, 1));
    const k = Math.max(0.72, Math.min(1.0, cabe));
    view.k = k;
    // Raiz ancorada à esquerda, MAS após a barra de controles (que fica à esquerda) para
    // não sobrepor o nó raiz.
    const leftInset = 78;
    view.tx = leftInset - b.minX * k;
    // Vertical: se couber, centraliza o todo; se estourar, centra na RAIZ (ramos abrem p/ cima
    // e p/ baixo a partir dela, como no NotebookLM) para o usuário rolar.
    view.ty = h * k <= H - pad * 2 ? (H - h * k) / 2 - b.minY * k : H / 2 - rootCy * k;
    setAnim(animar !== false);
    apply();
  }
  function zoomAround(cx, cy, factor, animar) {
    userInteragiu = true;
    const k2 = Math.max(0.25, Math.min(2.8, view.k * factor));
    const f = k2 / view.k;
    view.tx = cx - (cx - view.tx) * f;
    view.ty = cy - (cy - view.ty) * f;
    view.k = k2;
    setAnim(!!animar);
    apply();
  }

  // ---- seleção + destaque do caminho até a raiz ----
  let selectedId = null;
  const pathIds = (id) => { const a = []; let c = id; while (c) { a.push(c); c = parentIdOf(c); } return a; };
  function clearHighlight() {
    for (const [, rec] of nodeEls) rec.g.classList.remove("mm-sel", "mm-on-path");
    for (const [, p] of linkEls) p.classList.remove("mm-link-path");
  }
  function applyHighlight(id) {
    clearHighlight();
    selectedId = id || null;
    if (!id) return;
    const chain = pathIds(id); // [id, …, "root"]
    for (const nid of chain) { const rec = nodeEls.get(nid); if (rec) rec.g.classList.add(nid === id ? "mm-sel" : "mm-on-path"); }
    for (const nid of chain) { if (nid === "root") continue; const p = linkEls.get(nid); if (p) p.classList.add("mm-link-path"); }
  }
  function selectNode(id, expand) {
    if (!id) { applyHighlight(null); return; }
    const rec = nodeEls.get(id);
    if (expand && rec && rec.chevG && collapsed.has(id)) { collapsed.delete(id); render(true); }
    applyHighlight(id);
  }

  const onWheel = (e) => { e.preventDefault(); userInteragiu = true; const r = rect(); zoomAround(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12, false); };
  let drag = null, dragMoved = false;
  const onDown = (e) => {
    if (e.button !== 0 || e.target.closest(".mm-chevron")) return;
    userInteragiu = true; setAnim(false); dragMoved = false;
    drag = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    svg.style.cursor = "grabbing"; svg.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag) return;
    if (!dragMoved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) dragMoved = true;
    view.tx = drag.tx + (e.clientX - drag.x); view.ty = drag.ty + (e.clientY - drag.y); apply();
  };
  const onUp = (e) => { drag = null; svg.style.cursor = "grab"; try { svg.releasePointerCapture?.(e.pointerId); } catch (_) {} };
  const onSvgClick = (e) => {
    const ch = e.target.closest(".mm-chevron");
    if (ch) {
      const id = ch.getAttribute("data-id");
      if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
      render(true); // anima; mantém zoom/pan
      if (selectedId) applyHighlight(selectedId);
      return;
    }
    if (dragMoved) return; // foi arrasto (pan), não clique
    const ng = e.target.closest(".mm-node");
    if (ng) selectNode(ng.getAttribute("data-id"), true); // seleciona + destaca caminho + expande se recolhido
    else applyHighlight(null); // clique no fundo limpa a seleção
  };
  svg.addEventListener("wheel", onWheel, { passive: false });
  svg.addEventListener("pointerdown", onDown);
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerup", onUp);
  svg.addEventListener("pointerleave", onUp);
  svg.addEventListener("click", onSvgClick);
  svg.style.cursor = "grab";
  svg.style.touchAction = "none";

  // primeira pintura + ajuste quando o SVG tiver tamanho real
  render(false);
  function fitQuandoPronto(t) {
    const r = rect();
    if ((r.width > 40 && r.height > 40) || t > 12) { fit(false); return; }
    requestAnimationFrame(() => fitQuandoPronto((t || 0) + 1));
  }
  requestAnimationFrame(() => fitQuandoPronto(0));
  let ro = null;
  try { ro = new ResizeObserver(() => { if (!userInteragiu) fit(false); }); ro.observe(svg); } catch (_) {}

  function idsComFilhos() {
    const ids = [];
    const walk = (n) => { if (n.hasChildren) { ids.push(n.id); n.children.forEach(walk); } };
    root.children.forEach(walk); // não recolhe a raiz
    return ids;
  }

  return {
    fit: () => fit(true),
    zoomIn: () => zoomAround(vpW() / 2, vpH() / 2, 1.25, true),
    zoomOut: () => zoomAround(vpW() / 2, vpH() / 2, 1 / 1.25, true),
    expandAll: () => { collapsed.clear(); render(true); setTimeout(() => fit(true), DUR + 20); if (opts.onToggleAll) opts.onToggleAll(true); },
    collapseAll: () => { idsComFilhos().forEach((id) => collapsed.add(id)); render(true); setTimeout(() => fit(true), DUR + 20); if (opts.onToggleAll) opts.onToggleAll(false); },
    zoom: () => view.k,
    async toPNG(scale = 2) {
      const b = curBounds; if (!b) return null;
      const pad = 28;
      const W = (b.maxX - b.minX) + pad * 2, H = (b.maxY - b.minY) + pad * 2;
      const clone = svg.cloneNode(true);
      const gc = clone.querySelector(".mm-zoom");
      if (gc) { gc.setAttribute("transform", `translate(${pad - b.minX},${pad - b.minY})`); gc.classList.remove("mm-anim"); gc.removeAttribute("style"); }
      clone.querySelectorAll("[opacity]").forEach((n) => n.setAttribute("opacity", "1"));
      clone.setAttribute("width", W); clone.setAttribute("height", H);
      clone.setAttribute("viewBox", `0 0 ${W} ${H}`);
      clone.removeAttribute("style");
      const bg = el("rect", { x: 0, y: 0, width: W, height: H, fill: tema === "escuro" ? "#0b1220" : "#ffffff" });
      clone.insertBefore(bg, clone.firstChild.nextSibling);
      const xml = new XMLSerializer().serializeToString(clone);
      const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const cv = document.createElement("canvas");
      cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
      const ctx = cv.getContext("2d"); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      return cv.toDataURL("image/png");
    },
    destroy() {
      try { if (ro) ro.disconnect(); } catch (_) {}
      if (raf) cancelAnimationFrame(raf);
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointerleave", onUp);
      svg.removeEventListener("click", onSvgClick);
    },
  };
}
