// Bootstrap: inicializa o store, monta o shell (navegação) e roteia as telas.
// Fontes da marca (bundladas localmente via @fontsource — offline-first p/ Tauri):
// Inter (texto) + JetBrains Mono (números: cronômetro e KPIs). Só o eixo de peso.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { store } from "./store.js";
import { backendName } from "./persistence.js";
import { toast, plural } from "./ui.js";
import { esc, fmtMMSS } from "./util.js";
import { montarChat, atualizarChatVisibilidade } from "./chat.js";
import { abrirPaleta } from "./paleta.js";
import { ligarFaixasIA, ativarReveal, ativarCountUp } from "./ui.js";
import { montarCronometro, setEstiloAlarme, montarCronoMini, setAoPedirRegistro, snapshot as cronoSnapshot, setModoTela as cronoFoco, onTick as cronoOnTick } from "./cronometro.js";
import { abrirRegistroSessao } from "./registro-sessao.js";
import { iniciarCapturaErros } from "./erro-log.js";
import { dispararNotificacoesDevidas, iniciarAgendadorDiario } from "./notificacoes.js";
import { checarLicenca } from "./licenca.js";
import { verificarAtualizacao } from "./updater.js";
import { sincronizarAgora as syncAgora, sincronizarAoFechar, estadoSync } from "./sync.js";
import { icone } from "./icones.js";
import { temNovidade, abrirNovidades } from "./novidades.js";
import { montarLembretesFab } from "./lembretes.js";
import { initTooltips } from "./tooltip.js";
import { montarOrbs } from "./orb.js";

iniciarCapturaErros(); // captura erros não tratados desde o início (para o relatório de diagnóstico)

import renderOnboarding from "./screens/onboarding.js";
import renderEdital from "./screens/edital.js";
import renderHoje from "./screens/hoje.js";
import renderPratica, { renderPraticaCE } from "./screens/pratica.js";
import renderErros from "./screens/erros.js";
import renderFlashcards from "./screens/flashcards.js";
import renderCentralRevisoes from "./screens/central-revisoes.js";
import renderSimulados from "./screens/simulados.js";
import renderResumos from "./screens/resumos.js";
import renderDocumentos from "./screens/documentos.js";
import { renderLeiSeca, renderJurisprudencia } from "./screens/leiseca.js";
import renderCorrecao from "./screens/correcao.js";
import renderPlanejamento from "./screens/planejamento.js";
import renderDiagnostico from "./screens/diagnostico.js";
import renderMentor from "./screens/mentor.js";
import renderRevTopico from "./screens/revtopico.js";
import renderMapas from "./screens/mapas.js";
import renderConfig from "./screens/config.js";
import renderAjuda from "./screens/ajuda.js";
import renderComecar from "./screens/comecar.js";

// Botões agrupados por função, cada grupo com uma família de cor (menos poluição):
// Rotina (azul) → Estudo (roxo) → Prática (verde) → Revisão (âmbar) → Sistema (neutro).
const ROTAS = [
  { id: "hoje", label: "Hoje", icone: "clock-3", cor: "#2563eb", grupo: "Rotina", render: renderHoje },
  { id: "planejamento", label: "Planejamento", icone: "calendar-days", cor: "#3b82f6", grupo: "Rotina", render: renderPlanejamento },
  { id: "diagnostico", label: "Acompanhamento", icone: "trending-up", cor: "#60a5fa", grupo: "Rotina", render: renderDiagnostico },
  { id: "mentor", label: "Mentor IA", icone: "compass", cor: "#4f9bf5", grupo: "Rotina", render: renderMentor },

  { id: "edital", label: "Edital", icone: "list-checks", cor: "#6d28d9", grupo: "Estudo", render: renderEdital },
  { id: "documentos", label: "Materiais", icone: "library", cor: "#7c3aed", grupo: "Estudo", render: renderDocumentos },
  { id: "leiseca", label: "Lei Seca", icone: "scroll-text", cor: "#8b5cf6", grupo: "Estudo", render: renderLeiSeca },
  { id: "jurisprudencia", label: "Jurisprudência", icone: "scale", cor: "#a855f7", grupo: "Estudo", render: renderJurisprudencia },

  { id: "pratica", label: "Questões", icone: "pencil-line", cor: "#059669", grupo: "Prática", render: renderPratica },
  { id: "pratica-ce", label: "Questões C/E", icone: "check-check", cor: "#0d9488", grupo: "Prática", render: renderPraticaCE },
  { id: "correcao", label: "Discursiva e redação", icone: "square-pen", cor: "#10b981", grupo: "Prática", render: renderCorrecao },
  { id: "simulados", label: "Simulados", icone: "clipboard-list", cor: "#047857", grupo: "Prática", render: renderSimulados },

  { id: "revisoes", label: "Central de Revisões", icone: "calendar-check", cor: "#f59e0b", grupo: "Revisão", render: renderCentralRevisoes },
  { id: "flashcards", label: "Flashcards", icone: "layers", cor: "#fbbf24", grupo: "Revisão", render: renderFlashcards },
  { id: "revtopico", label: "Revisão de Tópicos", icone: "repeat-2", cor: "#f59e0b", grupo: "Revisão", render: renderRevTopico },
  { id: "erros", label: "Caderno de Erros", icone: "flag", cor: "#f59e0b", grupo: "Revisão", render: renderErros },
  { id: "resumos", label: "Resumos", icone: "file-text", cor: "#d97706", grupo: "Revisão", render: renderResumos },
  { id: "mapas", label: "Mapas mentais", icone: "network", cor: "#d97706", grupo: "Revisão", render: renderMapas },

  { id: "config", label: "Configurações", icone: "settings", cor: "#64748b", grupo: "Sistema", render: renderConfig },
  // Guia: navegável (via botão em Configurações), mas FORA da barra lateral (semNav).
  { id: "ajuda", label: "Guia do sistema", icone: "circle-help", cor: "#64748b", grupo: "Sistema", semNav: true, render: renderAjuda },
  { id: "comecar", label: "Por onde começar", icone: "rocket", cor: "#64748b", grupo: "Sistema", semNav: true, render: renderComecar },
];

// Metadados leves das telas que aparecem na BARRA (exclui as semNav, como o Guia).
export const NAV_ITENS = ROTAS.filter((r) => !r.semNav).map(({ id, label, grupo, icone }) => ({ id, label, grupo, icone }));
// Telas que NUNCA podem ser ocultadas (a rotina e o próprio painel de ajustes).
export const NAV_FIXOS = ["hoje", "config"];

// Ordem efetiva dos botões do MEIO (exclui hoje/config): respeita a ordem salva e
// acrescenta no fim qualquer botão ainda não ordenado. Usada na barra e em Configurações.
export function ordemNavEfetiva(ordemSalva) {
  const meio = NAV_ITENS.filter((it) => !NAV_FIXOS.includes(it.id)).map((it) => it.id);
  const salva = (ordemSalva || []).filter((id) => meio.includes(id));
  return [...salva, ...meio.filter((id) => !salva.includes(id))];
}

// Ordem fixa dos GRUPOS na barra (os grupos não se movem; os itens reordenam dentro).
export const GRUPOS_NAV = ["Rotina", "Estudo", "Prática", "Revisão", "Sistema"];

// Itens da barra agrupados e já ordenados dentro de cada grupo (fixos primeiro:
// HOJE encabeça a Rotina; Configurações é o único do Sistema, último).
export function gruposNav(cfg) {
  const ordem = ordemNavEfetiva(cfg.ordemNav);
  const idx = (id) => {
    const i = ordem.indexOf(id);
    return i < 0 ? 999 : i;
  };
  return GRUPOS_NAV.map((grupo) => {
    const itens = NAV_ITENS.filter((it) => it.grupo === grupo).sort((a, b) => {
      const af = NAV_FIXOS.includes(a.id);
      const bf = NAV_FIXOS.includes(b.id);
      if (af !== bf) return af ? -1 : 1; // fixo encabeça o grupo
      return idx(a.id) - idx(b.id);
    });
    return { grupo, itens };
  }).filter((g) => g.itens.length);
}

let rotaAtual = "hoje";
let rotaRenderizada = null; // última rota efetivamente montada (p/ animar só na TROCA de tela)
let params = {};
let cleanupAtual = null;
// Sidebar de 2 níveis: quais grupos colapsáveis (Estudar/Praticar/Revisar) estão abertos.
// O grupo que contém a rota ativa é sempre mantido aberto.
let gruposNavAbertos = null;

const app = {
  store,
  navigate(id, p = {}) {
    rotaAtual = id;
    params = p;
    render(false); // navegar volta ao topo
  },
  toast,
  refresh: () => render(),
  get params() {
    return params;
  },
};

function renderOnboardingFull(root) {
  root.innerHTML = `<div class="onboarding-wrap"></div>`;
  const cont = root.querySelector(".onboarding-wrap");
  return renderOnboarding(cont, app);
}

// Navegação de um atalho conforme seu tipo (tela / disciplina / tópico / simulado).
function navegarAtalho(a) {
  if (!a) return;
  if (a.tipo === "disciplina") app.navigate("edital", { focoDisciplinaId: a.alvo });
  else if (a.tipo === "topico") app.navigate("edital", { dossieTopicoId: a.alvo });
  // Atalho de Questões: abre a tela de Questões já filtrada pelo tópico escolhido.
  else if (a.tipo === "questoes") app.navigate("pratica", { topicoId: a.alvo });
  // Atalho de Simulado (legado): abre a tela de Simulados.
  else if (a.tipo === "simulado") app.navigate("simulados");
  else app.navigate(a.alvo);
}

function navHTML() {
  const cfg = store.get().config;
  const c = store.get().concurso;
  const ocultos = cfg.botoesOcultos || [];
  const rotaPorId = (id) => ROTAS.find((r) => r.id === id);
  // Selo de pendência no botão da barra (ponto âmbar pulsante + tooltip). Calculado uma vez.
  // Selo só para o que tem AGENDAMENTO/vencimento (ou lembrete periódico do Mentor). O
  // Caderno de Erros é uma lista sem prazo, então não recebe selo (nagaria para sempre).
  const fcVenc = store.flashcardsVencidos().length;
  const revTop = store.revisoesTopicoCount();
  const resumosRev = store.resumosParaRevisar();
  const selos = {
    mentor: store.mentorPrecisaReanalise() ? "Hora de rever seu progresso com o Mentor IA" : "",
    flashcards: fcVenc ? `${plural(fcVenc, "flashcard vencido", "flashcards vencidos")} para revisar` : "",
    revtopico: revTop ? `${plural(revTop, "revisão", "revisões")} de tópico para hoje` : "",
    resumos: resumosRev ? `${plural(resumosRev, "resumo", "resumos")} para revisar hoje` : "",
  };
  const btn = (r, extraCls = "") =>
    r
      ? `<button class="nav-item ${extraCls} ${r.id === rotaAtual ? "ativo" : ""}" data-rota="${r.id}" title="${esc(r.label)}">
          <span class="nav-ico">${icone(r.icone)}</span><span>${esc(r.label)}</span>
          ${selos[r.id] ? `<span class="nav-selo" data-tip="${esc(selos[r.id])}" data-tip-pos="cima-dir">●</span>` : ""}
        </button>`
      : "";

  // Atalhos aparecem sempre na barra lateral (única localização desde a remoção da opção "Hoje").
  const atalhosNav = (cfg.atalhos || []);
  const atalhosHTML = atalhosNav.length
    ? `<div class="nav-grupo">Atalhos</div>` +
      atalhosNav
        .map(
          (a) => `<button class="nav-item" data-atalho="${a.id}">
            <span class="nav-ico">${icone(a.icone) || icone("star")}</span><span>${esc(a.nome)}</span>
          </button>`
        )
        .join("")
    : "";

  // Itens ordenados por grupo (reaproveita a ordenação/visibilidade existentes).
  const itensPorGrupo = {};
  for (const g of gruposNav(cfg)) {
    itensPorGrupo[g.grupo] = g.itens.filter((it) => NAV_FIXOS.includes(it.id) || !ocultos.includes(it.id));
  }

  // 1) As 4 áreas conceituais no topo (espinha do produto). Mentor IA com destaque visual.
  const AREAS = ["hoje", "planejamento", "diagnostico", "mentor"];
  const areasHTML = AREAS
    .filter((id) => NAV_FIXOS.includes(id) || !ocultos.includes(id))
    .map((id) => btn(rotaPorId(id), id === "mentor" ? "nav-mentor" : "nav-area"))
    .join("");

  // 2) Grupos colapsáveis (orientados por objetivo do usuário). Mapeiam os grupos
  //    técnicos existentes. O grupo da rota ativa fica sempre aberto.
  const COLAPSAVEIS = [
    { grupo: "Estudo", label: "Estudar" },
    { grupo: "Prática", label: "Praticar" },
    { grupo: "Revisão", label: "Revisar" },
  ];
  if (!gruposNavAbertos) gruposNavAbertos = new Set();
  const grupoDaRota = (rotaPorId(rotaAtual) || {}).grupo;
  if (COLAPSAVEIS.some((c) => c.grupo === grupoDaRota)) gruposNavAbertos.add(grupoDaRota);

  const colapsaveisHTML = COLAPSAVEIS.map(({ grupo, label }) => {
    const visiveis = itensPorGrupo[grupo] || [];
    if (!visiveis.length) return "";
    const aberto = !!cfg.sidebarColapsada || gruposNavAbertos.has(grupo);
    // Selo agregado: se fechado e algum item dentro tem pendência, sinaliza no cabeçalho.
    const temSelo = !aberto && visiveis.some((it) => selos[it.id]);
    return `<div class="nav-sec ${aberto ? "aberta" : ""}">
        <button class="nav-sec-head" data-grupo="${grupo}">
          <span class="nav-sec-label">${esc(label)}</span>
          ${temSelo ? `<span class="nav-selo" data-tip="Há pendências aqui dentro" data-tip-pos="cima-dir">●</span>` : ""}
          <span class="nav-chev">${aberto ? "▾" : "▸"}</span>
        </button>
        ${aberto ? `<div class="nav-sec-itens">${visiveis.map((it) => btn(rotaPorId(it.id))).join("")}</div>` : ""}
      </div>`;
  }).join("");

  // 3) Atalhos + Configurações no rodapé da navegação.
  const configHTML = (itensPorGrupo["Sistema"] || []).map((it) => btn(rotaPorId(it.id))).join("");
  const novidadeBadge = temNovidade(store);

  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-logo"><img src="/brand-logo.png" alt="Mentor Concurso" /></div>
        <div class="brand-txt">
          <div class="brand-nome">Mentor Concurso</div>
          <div class="brand-sub">${esc(c ? c.cargo : "")}</div>
        </div>
        <button class="sidebar-toggle" data-toggle-sidebar title="Recolher / expandir o menu" aria-label="Recolher ou expandir o menu">«</button>
      </div>
      <nav class="nav">
        <div class="nav-areas">${areasHTML}</div>
        <div class="nav-secs">${colapsaveisHTML}</div>
        ${atalhosHTML ? `<div class="nav-atalhos">${atalhosHTML}</div>` : ""}
        <div class="nav-sistema">
          <button class="nav-item nav-novidades" data-novidades title="Novidades">${icone("sparkles")}<span>Novidades</span>${novidadeBadge ? '<span class="nov-badge"></span>' : ""}</button>
          ${configHTML}
        </div>
      </nav>
      <div class="sidebar-rodape">
        <div class="backend-tag" data-tip-pos="cima-esq" data-tip="Onde os dados são salvos">${icone("database")} ${esc(backendName())}</div>
        <div class="assinatura-dev">Desenvolvido por <b>Phelipe Ribeiro da Silva</b></div>
      </div>
    </aside>`;
}

// Barra de comando no topo: gatilho VISÍVEL da paleta ⌘K (navegar + perguntar à IA).
// Não recria um input próprio — clicar (ou Ctrl/⌘+K) abre a paleta, que já tem o campo real
// e reusa 100% o motor do chat (interpretar → propor → confirmar → executar).
const EH_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || "");
function topbarHTML(store) {
  const st = store.get();
  const hora = new Date().getHours();
  const saud = hora < 5 ? "Boa madrugada" : hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const dataFmt = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const cargo = st.concurso && st.concurso.cargo ? st.concurso.cargo : "";
  // Contexto persistente no topo (reusa os mesmos sinais da tela Hoje): prova + ofensiva.
  let provaChip = "";
  try {
    const m = store.metas ? store.metas() : null;
    const dias = m && typeof m.diasProva === "number" ? m.diasProva : null;
    const reta = store.retaFinal ? store.retaFinal() : { ativo: false };
    if (dias != null && dias >= 0)
      provaChip = `<div class="tb-chip${reta.ativo ? " urg" : ""}" data-tip="Contagem regressiva da prova">${icone("calendar")}<b>${dias}</b> ${dias === 1 ? "dia" : "dias"} p/ prova</div>`;
  } catch (_) {}
  let streakChip = "";
  try {
    const ofe = store.ofensiva ? store.ofensiva() : null;
    if (ofe && ofe.atual > 0)
      streakChip = `<button type="button" class="tb-chip tb-streak" data-nav="diagnostico" data-tip="Dias seguidos de estudo — ver constância">${icone("flame")}<b>${ofe.atual}</b> ${ofe.atual === 1 ? "dia" : "dias"}</button>`;
  } catch (_) {}
  // Cronômetro e lembretes saíram do topo: agora são botões FLUTUANTES (cronometro.js e
  // lembretes.js), presentes em todas as telas inclusive no foco. Aqui no topo ficam prova
  // e ofensiva.
  return `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="tb-hey">${esc(saud)} · <b>${esc(dataFmt)}</b>${cargo ? ` · <span class="tb-cargo">${esc(cargo)}</span>` : ""}</div>
        <div class="tb-sp"></div>
        ${provaChip}
        ${streakChip}
        <button class="cmdbar" data-cmdk type="button" aria-label="Abrir paleta de comando (navegar ou perguntar à IA)">
          ${icone("sparkles")}
          <span class="cmdbar-ph">Ir para… ou perguntar</span>
          <kbd class="cmdbar-kbd">${EH_MAC ? "⌘K" : "Ctrl K"}</kbd>
        </button>
        <button class="tb-tema" data-toggle-tema type="button" data-tip="Alternar tema (claro/escuro)" aria-label="Alternar tema">
          ${
            st.config.tema === "escuro"
              ? `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`
              : `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`
          }
        </button>
      </div>
    </header>`;
}

// Fundo "plexus" animado (rede neural sutil = dados/IA) atrás do conteúdo. Atmosfera do
// redesign v3. Criado UMA vez (fora do #app). Respeita reduced-motion e pausa com a aba oculta.
function montarPlexus() {
  if (document.getElementById("app-plexus")) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv = document.createElement("canvas");
  cv.id = "app-plexus";
  cv.setAttribute("aria-hidden", "true");
  document.body.appendChild(cv);
  const ctx = cv.getContext("2d");
  const D = Math.min(window.devicePixelRatio || 1, 2);
  let pts = [];
  let raf = 0;
  let rodando = true;
  function init() {
    cv.width = window.innerWidth * D;
    cv.height = window.innerHeight * D;
    ctx.setTransform(D, 0, 0, D, 0, 0);
    const n = Math.min(54, Math.floor(window.innerWidth / 34));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
    }));
  }
  function loop() {
    if (!rodando) return;
    const W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    }
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 132) {
          ctx.strokeStyle = "rgba(96,140,220," + (0.13 * (1 - d / 132)).toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    ctx.fillStyle = "rgba(110,150,225,.5)";
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.3, 0, 7);
      ctx.fill();
    }
    raf = requestAnimationFrame(loop);
  }
  init();
  window.addEventListener("resize", init);
  document.addEventListener("visibilitychange", () => {
    rodando = !document.hidden;
    if (rodando) { cancelAnimationFrame(raf); loop(); }
  });
  loop();
}

// Barra inferior do mobile: as 4 áreas conceituais + "Mais" (abre a sidebar como drawer).
// Sempre no DOM; só aparece via CSS abaixo do breakpoint.
function bottomBarHTML() {
  const AREAS = ["hoje", "planejamento", "diagnostico", "mentor"];
  const itens = AREAS.map((id) => {
    const r = ROTAS.find((x) => x.id === id);
    if (!r) return "";
    return `<button class="mbb-item ${id === rotaAtual ? "ativo" : ""}" data-rota="${id}">
      <span class="mbb-ico">${icone(r.icone)}</span><span class="mbb-lbl">${esc(r.label)}</span>
    </button>`;
  }).join("");
  return `<nav class="mobile-bottombar">
    ${itens}
    <button class="mbb-item mbb-mais" data-mbb-mais><span class="mbb-ico">☰</span><span class="mbb-lbl">Mais</span></button>
  </nav>`;
}

function render(preservarScroll = true) {
  const root = document.getElementById("app");
  // Preserva a posição de rolagem entre re-renders (ex.: expandir uma disciplina),
  // para a tela não "pular" para o topo. Ao navegar, preservarScroll=false.
  const scrollAnterior = preservarScroll ? document.getElementById("content")?.scrollTop || 0 : 0;
  if (cleanupAtual) {
    try { cleanupAtual(); } catch (_) {}
    cleanupAtual = null;
  }

  // Tema visual (claro/escuro): atributo no <html>, dirige todos os tokens de cor.
  const tema = store.get().config.tema === "escuro" ? "escuro" : "claro";
  document.documentElement.setAttribute("data-tema", tema);

  // Paleta da marcação tricromática (acessibilidade/daltonismo): classe no body.
  const paleta = store.get().config.paletaMarcacao || "padrao";
  document.body.classList.toggle("paleta-daltonismo", paleta === "daltonismo");
  document.body.classList.toggle("paleta-contraste", paleta === "contraste");

  // Rail de ícones com hover-expand por padrão (a barra abre sobre o conteúdo ao passar o
  // mouse); "navFixa" fixa a barra aberta (botão «). Não afeta o cronômetro: o pill usa
  // --sidebar-w, então acompanha a largura automaticamente.
  document.body.classList.toggle("nav-rail", !store.get().config.navFixa);

  // No onboarding não há app ainda: esconde o cronômetro flutuante (o chat já some via JS).
  document.body.classList.toggle("onboarding", !store.isOnboarded());
  atualizarChatVisibilidade(store.isOnboarded());
  if (!store.isOnboarded()) {
    cleanupAtual = renderOnboardingFull(root);
    return;
  }

  root.innerHTML = `
    <div class="shell">
      ${navHTML()}
      <div class="main-col">
        ${topbarHTML(store)}
        <main class="content" id="content"></main>
      </div>
    </div>
    <div class="nav-backdrop" id="nav-backdrop"></div>
    ${bottomBarHTML()}`;

  const fecharDrawer = () => document.body.classList.remove("nav-aberta");

  root.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      fecharDrawer(); // no mobile, navegar pela sidebar fecha o drawer
      const atl = btn.getAttribute("data-atalho");
      if (atl) {
        const a = (store.get().config.atalhos || []).find((x) => x.id === atl);
        navegarAtalho(a);
      } else {
        app.navigate(btn.getAttribute("data-rota"));
      }
    });
  });

  // Barra inferior (mobile): navegar pelas áreas + alternar o drawer "Mais".
  root.querySelectorAll(".mbb-item[data-rota]").forEach((b) => {
    b.addEventListener("click", () => { fecharDrawer(); app.navigate(b.getAttribute("data-rota")); });
  });
  root.querySelector("[data-toggle-sidebar]")?.addEventListener("click", () => {
    store.setConfig({ navFixa: !store.get().config.navFixa });
  });
  root.querySelector("[data-novidades]")?.addEventListener("click", () => {
    abrirNovidades(store);
    render(); // some o badge após ver
  });
  // Barra de comando no topo: abre a mesma paleta do atalho Ctrl/⌘+K.
  root.querySelector("[data-cmdk]")?.addEventListener("click", () => abrirPaleta(app));
  // Chips do topbar que navegam (ex.: ofensiva → constância).
  root.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => app.navigate(b.getAttribute("data-nav"))));
  // Toggle de tema no topbar (move a função que estava só em Configurações).
  root.querySelector("[data-toggle-tema]")?.addEventListener("click", () => store.setConfig({ tema: store.get().config.tema === "escuro" ? "claro" : "escuro" }));

  root.querySelector("[data-mbb-mais]")?.addEventListener("click", () => document.body.classList.toggle("nav-aberta"));
  root.querySelector("#nav-backdrop")?.addEventListener("click", fecharDrawer);

  // Abre/fecha os grupos colapsáveis (Estudar/Praticar/Revisar) sem trocar de tela.
  root.querySelectorAll(".nav-sec-head").forEach((h) => {
    h.addEventListener("click", () => {
      const g = h.getAttribute("data-grupo");
      if (!gruposNavAbertos) gruposNavAbertos = new Set();
      if (gruposNavAbertos.has(g)) gruposNavAbertos.delete(g);
      else gruposNavAbertos.add(g);
      render();
    });
  });

  const rota = ROTAS.find((r) => r.id === rotaAtual) || ROTAS[0];
  const content = root.querySelector("#content");
  // Movimento: fade suave SÓ quando a tela muda (não a cada re-render de estado), p/
  // tirar a sensação "seca" da troca instantânea sem piscar ao responder uma questão.
  if (rotaAtual !== rotaRenderizada) {
    content.classList.add("rota-enter");
    rotaRenderizada = rotaAtual;
  }
  cleanupAtual = rota.render(content, app) || null;
  ligarFaixasIA(content, app); // camada de IA contextual: ativa faixas de insight da tela
  ativarReveal(content); // FASE 0: revela seções [data-reveal] ao entrarem na viewport
  ativarCountUp(content); // FASE 0: anima números [data-count] (KPIs)
  montarOrbs(document); // orb "vivo" (plasma canvas) em todo .orb novo; ignora os já montados
  if (scrollAnterior) {
    // Reforça a restauração em vários momentos: imediato, próximos frames e um tick.
    // Evita o "pulo para o topo" quando o conteúdo recém-renderizado ainda não foi
    // medido (o navegador faz clamp para 0 antes de o layout estabilizar) — caso típico
    // ao responder uma questão, que re-renderiza a tela inteira.
    const restaurar = () => { content.scrollTop = scrollAnterior; };
    restaurar();
    requestAnimationFrame(() => { restaurar(); requestAnimationFrame(restaurar); });
    setTimeout(restaurar, 0);
  }
}

async function bootstrap() {
  // Janela flutuante do cronômetro (?crono=1): renderiza só o mini-relógio, sem
  // licença, store ou shell. Sincroniza com a janela principal via localStorage.
  // Detecta o modo "mini relógio" por HASH (#crono=1) ou query (?crono=1, legado). O hash é
  // usado porque, no app empacotado, uma query string em WebviewUrl::App quebra a resolução
  // do asset (procura "index.html?crono=1" literal) e a janela abre em branco.
  // 1) Marca SÍNCRONA injetada pelo Rust antes da página carregar (caminho mais confiável).
  let ehCrono = typeof window !== "undefined" && window.__MENTOR_CRONO__ === true;
  // 2) Por HASH (#crono=1) ou query (?crono=1, legado).
  if (!ehCrono) {
    ehCrono =
      typeof location !== "undefined" &&
      (new URLSearchParams(location.search).get("crono") === "1" || /(?:^|[#&])crono=1/.test(location.hash || ""));
  }
  // 3) Fallback: rótulo "crono" da janela Tauri (sync via metadata interna ou async pela API).
  if (!ehCrono && typeof window !== "undefined" && window.__TAURI_INTERNALS__) {
    try {
      const meta = window.__TAURI_INTERNALS__.metadata;
      const lbl = (meta && (meta.currentWindow || meta.currentWebview) || {}).label;
      if (lbl === "crono") ehCrono = true;
    } catch (_) {}
    if (!ehCrono) {
      try {
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        ehCrono = getCurrentWebviewWindow().label === "crono";
      } catch (_) {}
    }
  }
  if (ehCrono) {
    montarCronoMini();
    return;
  }
  // Portão de licença (só atua no app empacotado com porteiro configurado).
  // Se barrar, a tela de ativação assume o #app e o boot do app não prossegue.
  const liberado = await checarLicenca();
  if (!liberado) return;
  await store.init();
  montarChat(store, app); // widget flutuante persistente (fora do #app)
  // Paleta de comando ⌘K (launcher): de qualquer tela, navega rápido (offline) e repassa
  // pergunta/ação ao chat. Só liga depois do app pronto (não no onboarding/crono).
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      abrirPaleta(app);
    }
  });
  montarCronometro(app); // cronômetro flutuante global (FAB único) que acompanha entre telas
  montarLembretesFab(store); // FAB de lembretes (acima do cronômetro), presente em todas as telas
  // O botão "Registrar" do flutuante abre a janela de registro (modo cronômetro).
  setAoPedirRegistro(() => abrirRegistroSessao(store, app, { modo: "crono" }));
  montarPlexus(); // malha "plexus" animada de fundo (atmosfera); respeita reduced-motion
  initTooltips(); // tooltips via portal (imunes a overflow:hidden dos ancestrais)
  setEstiloAlarme(store.get().config.somAlarme); // aplica a preferência de som do alarme
  // Re-render em qualquer mudança de estado.
  store.subscribe(() => render());
  render();
  // Accountability (dir.3): dispara as notificações devidas (só no desktop/Tauri).
  dispararNotificacoesDevidas(store);
  // Agendador do lembrete diário (toast no app + notificação do SO no desktop).
  iniciarAgendadorDiario(store);
  // Checagem silenciosa de atualização (só no app empacotado e com updater configurado).
  verificarAtualizacao({ silencioso: true });
  // Mentor IA: auto-análise SEMANAL (1×/semana, mesmo sem clique) — silenciosa; só roda se
  // IA conectada, houver atividade, passaram ≥7 dias e o usuário não desligou em Config.
  store.autoAnalisarMentorSeDevido();
  // Sincronização: ao ABRIR, puxa o mais recente da nuvem do usuário (se conectado).
  if (estadoSync().conectado) syncAgora({ motivo: "boot", silencioso: true });
  // E garante a sincronização ao FECHAR o app.
  ligarSyncAoFechar();
}

// Ao fechar: no desktop intercepta o fechamento e só fecha depois de tentar sincronizar
// (com teto de tempo para nunca travar o fechamento); na web é best-effort ao sair.
async function ligarSyncAoFechar() {
  const ehDesktop = typeof window !== "undefined" && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);
  if (ehDesktop) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const w = getCurrentWindow();
      let fechando = false;
      await w.onCloseRequested(async (event) => {
        event.preventDefault(); // evita o fechamento parcial padrão (que deixaria o cronômetro segurando o app)
        if (fechando) return; // já estamos saindo
        fechando = true;
        try { await Promise.race([sincronizarAoFechar(), new Promise((r) => setTimeout(r, 3000))]); } catch (_) {}
        // Encerra o app INTEIRO (principal + cronômetro flutuante) de forma garantida.
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("sair_do_app");
        } catch (_) {
          try { await w.destroy(); } catch (_) { try { await w.close(); } catch (_) {} }
        }
      });
    } catch (_) {}
  } else {
    window.addEventListener("pagehide", () => { try { sincronizarAoFechar(); } catch (_) {} });
  }
}

bootstrap();
