// Data-viz v2 (FASE 0/Item 4): visualizações próprias em SVG/CSS — sem biblioteca,
// offline e com a cara da marca. Regra de ouro (lição da auditoria): a constância
// NUNCA pune — dia sem estudo é neutro (cinza), nunca vermelho.
import { esc, todayISO, fmtTempoCurto } from "./util.js";

// ---- utilidades de data locais (sem UTC, para o dia "virar" no fuso do usuário) ----
function isoLocal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDias(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d + n);
  return isoLocal(dt);
}
const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Heatmap de constância (estilo GitHub): colunas = semanas, linhas = Dom→Sáb.
// `sessoes` = state.sessoes (usa s.data e s.tempoSeg). Intensidade em 4 níveis por
// limiares de tempo do próprio usuário (quartis simples). Hoje ganha um anel.

// Anel de progresso (0–100%) em SVG — generaliza o donut para KPIs/cards.
// A cor é passada por quem chama (semáforo). O trilho vem do CSS (.pring-bg).
// Anel de progresso 0–100% em SVG. `grad:true` pinta o arco com o gradiente de marca
// (azul→ciano, via classes CSS que respeitam o tema) — ideal p/ métrica de PROGRESSO
// (cobertura). Para métrica de DESEMPENHO use `cor` semântica (verde/âmbar/vermelho),
// não gradiente. O trilho de fundo (.pring-bg) SEMPRE aparece — a 0% mostra o anel
// vazio COM contexto (o "0%" no centro), nunca um círculo quebrado.
let _pringSeq = 0;
export function progressRing(pct, { size = 66, stroke = 7, cor = "var(--primary)", sub = "", grad = false, count = false } = {}) {
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - p / 100);
  const cx = size / 2;
  const gid = grad ? `prg${++_pringSeq}` : null;
  const defs = gid
    ? `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop class="pring-g0" offset="0"/><stop class="pring-g1" offset="1"/></linearGradient></defs>`
    : "";
  const traco = gid ? `url(#${gid})` : cor;
  // count=true: o número usa data-count/data-suf p/ o count-up (ui.ativarCountUp anima 0→p).
  const txt = count
    ? `<span class="pring-txt" style="font-size:${Math.round(size * 0.27)}px" data-count="${p}" data-suf="%">${p}%</span>`
    : `<span class="pring-txt" style="font-size:${Math.round(size * 0.27)}px">${p}<i>%</i>${sub ? `<small>${sub}</small>` : ""}</span>`;
  return `<div class="pring" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      ${defs}
      <circle class="pring-bg" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke-width="${stroke}"></circle>
      <circle class="pring-val" cx="${cx}" cy="${cx}" r="${r}" fill="none" style="stroke:${traco}" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
        transform="rotate(-90 ${cx} ${cx})"></circle>
    </svg>
    ${txt}
  </div>`;
}

export function heatmapConstancia(sessoes, { semanas = 13, folgaDias = [] } = {}) {
  const porDia = {};
  for (const s of sessoes || []) {
    const d = (s.data || "").slice(0, 10);
    if (!d) continue;
    porDia[d] = (porDia[d] || 0) + (s.tempoSeg || 0);
  }
  const hoje = todayISO();
  // Início: domingo de (semanas-1) semanas atrás.
  const [a, m, d] = hoje.split("-").map(Number);
  const dtHoje = new Date(a, m - 1, d);
  const domingoDesta = addDias(hoje, -dtHoje.getDay());
  const inicio = addDias(domingoDesta, -7 * (semanas - 1));

  // Limiares de intensidade a partir dos dias COM estudo (nunca punir os sem).
  const valores = Object.values(porDia).filter((v) => v > 0).sort((x, y) => x - y);
  const q = (p) => (valores.length ? valores[Math.min(valores.length - 1, Math.floor(valores.length * p))] : 0);
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75);
  const nivel = (seg) => (!seg ? 0 : seg <= t1 ? 1 : seg <= t2 ? 2 : seg <= t3 ? 3 : 4);

  let células = "";
  let rotulosMes = "";
  let mesAnterior = -1;
  for (let w = 0; w < semanas; w++) {
    const inicioSemana = addDias(inicio, w * 7);
    const mesDa = parseInt(inicioSemana.slice(5, 7), 10) - 1;
    // Rótulo do mês na 1ª semana em que ele aparece.
    rotulosMes += `<span class="hm-mes">${mesDa !== mesAnterior ? MES_CURTO[mesDa] : ""}</span>`;
    mesAnterior = mesDa;
    for (let dia = 0; dia < 7; dia++) {
      const iso = addDias(inicioSemana, dia);
      if (iso > hoje) {
        células += `<i class="hm-d hm-futuro"></i>`;
        continue;
      }
      const seg = porDia[iso] || 0;
      const n = nivel(seg);
      // Dia de folga configurado (sem estudo): marcação PRÓPRIA para não se confundir
      // com "faltei" — folga é intencional e não quebra a sequência.
      const wd = new Date(iso + "T12:00:00").getDay();
      const ehFolga = !seg && folgaDias.includes(wd);
      const dataBr = `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
      const tip = seg
        ? `${dataBr} · ${fmtTempoCurto(seg)} de estudo`
        : ehFolga
        ? `${dataBr} · folga`
        : `${dataBr} · sem registro`;
      células += `<i class="hm-d l${n} ${ehFolga ? "hm-folga" : ""} ${iso === hoje ? "hm-hoje" : ""}" data-tip="${esc(tip)}" data-tip-pos="cima-esq"></i>`;
    }
  }
  return `
    <div class="heatmap" role="img" aria-label="Constância de estudo nas últimas ${semanas} semanas">
      <div class="hm-meses" style="grid-template-columns: repeat(${semanas}, 1fr)">${rotulosMes}</div>
      <div class="hm-grid" style="grid-template-columns: repeat(${semanas}, 1fr)">${células}</div>
      <div class="hm-legenda muted small">
        <span data-tip="A cor indica quanto TEMPO você estudou no dia (mais escuro = mais tempo). Dia sem estudo fica claro e não pune.">menos</span><i class="hm-d l0"></i><i class="hm-d l1"></i><i class="hm-d l2"></i><i class="hm-d l3"></i><i class="hm-d l4"></i><span data-tip="A cor indica quanto TEMPO você estudou no dia (mais escuro = mais tempo).">mais tempo/dia</span>
        <span class="hm-leg-sep">·</span><i class="hm-d hm-folga" data-tip="Dia de folga configurado (Configurações › Dias de estudo): não conta como falta."></i><span>folga</span>
      </div>
    </div>`;
}

// Constância como LINHA do mês atual (estilo MEI/Estudei): uma célula por dia do mês,
// colorida pela intensidade de estudo, clicável (reusa a ação "dia" → filtra o Histórico
// de sessões). Mesma escala de cor do heatmap. Dias futuros ficam vazios (tracejado).
const MES_LONGO = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export function linhaConstanciaMes(sessoes, { folgaDias = [] } = {}) {
  const porDia = {};
  for (const s of sessoes || []) {
    const d = (s.data || "").slice(0, 10);
    if (!d) continue;
    porDia[d] = (porDia[d] || 0) + (s.tempoSeg || 0);
  }
  const hoje = todayISO();
  const [a, m] = hoje.split("-").map(Number);
  const diasNoMes = new Date(a, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  // Limiares a partir dos dias COM estudo (todo o histórico) — cor consistente com o ritmo.
  const valores = Object.values(porDia).filter((v) => v > 0).sort((x, y) => x - y);
  const q = (p) => (valores.length ? valores[Math.min(valores.length - 1, Math.floor(valores.length * p))] : 0);
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75);
  const nivel = (seg) => (!seg ? 0 : seg <= t1 ? 1 : seg <= t2 ? 2 : seg <= t3 ? 3 : 4);
  let cels = "";
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const dd = String(dia).padStart(2, "0");
    const iso = `${a}-${mm}-${dd}`;
    if (iso > hoje) {
      cels += `<span class="ml-d ml-futuro" aria-hidden="true"></span>`;
      continue;
    }
    const seg = porDia[iso] || 0;
    const n = nivel(seg);
    const wd = new Date(iso + "T12:00:00").getDay();
    const ehFolga = !seg && folgaDias.includes(wd);
    const dataBr = `${dd}/${mm}`;
    const tip = seg
      ? `${dataBr} · ${fmtTempoCurto(seg)} de estudo — ver sessões`
      : ehFolga
      ? `${dataBr} · folga`
      : `${dataBr} · sem registro`;
    cels += `<button class="ml-d l${n} ${ehFolga ? "ml-folga" : ""} ${iso === hoje ? "ml-hoje" : ""}" data-action="dia" data-dia="${iso}" data-tip="${esc(tip)}" data-tip-pos="cima">${dia}</button>`;
  }
  return `
    <div class="mes-linha" role="img" aria-label="Constância de ${MES_LONGO[m - 1]}">
      <div class="ml-mes muted small">${MES_LONGO[m - 1]}</div>
      <div class="ml-dias">${cels}</div>
      <div class="hm-legenda muted small">
        <span data-tip="A cor indica quanto TEMPO você estudou no dia. Clique num dia para ver as sessões.">menos</span><i class="hm-d l0"></i><i class="hm-d l1"></i><i class="hm-d l2"></i><i class="hm-d l3"></i><i class="hm-d l4"></i><span>mais tempo/dia</span>
        <span class="hm-leg-sep">·</span><i class="hm-d hm-folga"></i><span>folga</span>
      </div>
    </div>`;
}
