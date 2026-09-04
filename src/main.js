// Bootstrap: inicializa o store, monta o shell (navegação) e roteia as telas.
// Fontes da marca (bundladas localmente via @fontsource — offline-first p/ Tauri):
// Inter (texto) + JetBrains Mono (números: cronômetro e KPIs). Só o eixo de peso.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { store } from "./store.js";
import { tentarSerAbaDona, pedirArmazenamentoPersistente } from "./persistence.js";
import { toast, toastCarregando, plural, confirmar, pedirTexto } from "./ui.js";
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
import { sincronizarNuvemAoFechar, iniciarSyncNuvemAuto } from "./sync-nuvem.js";
import { icone } from "./icones.js";
import { temNovidade, abrirNovidades } from "./novidades.js";
import { montarLembretesFab } from "./lembretes.js";
import { initTooltips, esconderTooltip } from "./tooltip.js";
import { montarOrbs, setOrbsOffline } from "./orb.js";

iniciarCapturaErros(); // captura erros não tratados desde o início (para o relatório de diagnóstico)

import renderOnboarding, { iniciarFluxoNovoConcurso, onboardingEmCurso } from "./screens/onboarding.js";
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

  { id: "edital", label: "Edital", icone: "list-checks", cor: "#7c3aed", grupo: "Estudo", render: renderEdital },
  { id: "documentos", label: "Materiais", icone: "library", cor: "#7c3aed", grupo: "Estudo", render: renderDocumentos },
  { id: "leiseca", label: "Lei Seca", icone: "scroll-text", cor: "#7c3aed", grupo: "Estudo", render: renderLeiSeca },
  { id: "jurisprudencia", label: "Jurisprudência", icone: "scale", cor: "#7c3aed", grupo: "Estudo", render: renderJurisprudencia },
  // Fase 1: Resumos e Mapas são ARTEFATOS DE ESTUDO (criação); a revisão deles vive na Central.
  { id: "resumos", label: "Resumos", icone: "file-text", cor: "#7c3aed", grupo: "Estudo", render: renderResumos },
  { id: "mapas", label: "Mapas mentais", icone: "network", cor: "#7c3aed", grupo: "Estudo", render: renderMapas },

  { id: "pratica", label: "Questões", icone: "pencil-line", cor: "#059669", grupo: "Prática", render: renderPratica },
  // Fase 1: "Questões C/E" saiu da barra — vira modo dentro de Questões (rota preservada p/ deep-links).
  { id: "pratica-ce", label: "Questões C/E", icone: "check-check", cor: "#059669", grupo: "Prática", semNav: true, render: renderPraticaCE },
  { id: "correcao", label: "Escrita", icone: "square-pen", cor: "#059669", grupo: "Prática", render: renderCorrecao },
  { id: "simulados", label: "Simulados", icone: "clipboard-list", cor: "#059669", grupo: "Prática", render: renderSimulados },

  { id: "revisoes", label: "Revisões", icone: "calendar-check", cor: "#f59e0b", grupo: "Revisão", render: renderCentralRevisoes },
  { id: "flashcards", label: "Flashcards", icone: "layers", cor: "#f59e0b", grupo: "Revisão", render: renderFlashcards },
  // Fase 1: a LISTAGEM de Revisão de Tópicos é subconjunto da Central; o FLUXO continua
  // acessível (a Central e o Hoje navegam para cá) — só sai da barra lateral.
  { id: "revtopico", label: "Revisão de Tópicos", icone: "repeat-2", cor: "#f59e0b", grupo: "Revisão", semNav: true, render: renderRevTopico },
  { id: "erros", label: "Caderno de Erros", icone: "flag", cor: "#f59e0b", grupo: "Revisão", render: renderErros },

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
// Celular: a gaveta ("Mais") abre com Estudar/Praticar/Revisar já expandidos — os grupos são
// semeados uma única vez, para o usuário ainda poder recolher o que não usa.
let gavetaSemeada = false;

const app = {
  store,
  navigate(id, p = {}) {
    rotaAtual = id;
    params = p;
    // Janelas (.mm-overlay), gaveta e painel do Mentor vivem FORA do #app — o render()
    // troca só o #app e não os remove. No computador isso passava batido (são caixas no meio
    // da tela); no celular cada um deles ocupa a tela inteira, então a tela nova abria ATRÁS
    // e a sensação era de que "gerou e não aconteceu nada". Fecha pelo próprio botão de
    // fechar da janela, para soltar o focus-trap e os listeners junto.
    document.querySelectorAll(".mm-overlay").forEach((ov) => ov.querySelector(".mm-close")?.click());
    document.body.classList.remove("nav-aberta"); // gaveta do celular
    document.getElementById("chat-panel")?.classList.add("oculto");
    render(false); // navegar volta ao topo
    // A rolagem do DOCUMENTO (que aparece no celular quando a barra de endereço some/volta)
    // não é reiniciada pelo innerHTML — sem isto a tela nova abre "no meio".
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  },
  toast,
  refresh: () => render(),
  get params() {
    return params;
  },
  // Fase 2: o chat do Mentor usa a rota atual para chips/contexto por tela.
  get rotaAtual() {
    return rotaAtual;
  },
};
// Handle de depuração (inofensivo): permite navegar/testar via console — window.app.navigate("leiseca").
if (typeof window !== "undefined") window.app = app;

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
    // Fase 3: plano novo AINDA NÃO VISTO tem prioridade (a auto-análise roda no boot;
    // o selo é o que leva o aluno até ela). Sem plano novo, vale o lembrete periódico.
    mentor: store.mentorPlanoNaoVisto()
      ? "O Mentor preparou um plano novo para você"
      : store.mentorPrecisaReanalise() ? "Hora de rever seu progresso com o Mentor IA" : "",
    flashcards: fcVenc ? `${plural(fcVenc, "flashcard vencido", "flashcards vencidos")} para revisar` : "",
    // Fase 1: revtopico/resumos saíram da barra — o selo de vencimentos vive na Central.
    revisoes: revTop + resumosRev ? `${plural(revTop + resumosRev, "revisão vence", "revisões vencem")} hoje` : "",
  };
  const btn = (r, extraCls = "") =>
    r
      ? `<button class="nav-item ${extraCls} ${r.id === rotaAtual ? "ativo" : ""}" data-rota="${r.id}" title="${esc(r.label)}">
          <span class="nav-ico">${icone(r.icone)}</span><span>${esc(r.label)}</span>
          ${selos[r.id] ? `<span class="nav-selo" data-tip="${esc(selos[r.id])}" data-tip-pos="cima-dir"></span>` : ""}
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

  // No CELULAR a barra vira a gaveta do botão "Mais": ela é aberta de propósito, para
  // procurar um destino, e rola por conta própria. Abrir os 3 grupos de saída evita o toque
  // extra em cada um — no computador o rail continua abrindo só o grupo da tela atual.
  // Semeia UMA vez (não força a cada render): assim recolher um grupo continua funcionando.
  const ehGaveta = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 900px)").matches;
  if (ehGaveta && !gavetaSemeada) {
    gavetaSemeada = true;
    COLAPSAVEIS.forEach((c) => gruposNavAbertos.add(c.grupo));
  }
  const colapsaveisHTML = COLAPSAVEIS.map(({ grupo, label }) => {
    const visiveis = itensPorGrupo[grupo] || [];
    if (!visiveis.length) return "";
    const aberto = !!cfg.sidebarColapsada || gruposNavAbertos.has(grupo);
    // Selo agregado: se fechado e algum item dentro tem pendência, sinaliza no cabeçalho.
    const temSelo = !aberto && visiveis.some((it) => selos[it.id]);
    return `<div class="nav-sec ${aberto ? "aberta" : ""}">
        <button class="nav-sec-head" data-grupo="${grupo}">
          <span class="nav-sec-label">${esc(label)}</span>
          ${temSelo ? `<span class="nav-selo" data-tip="Há pendências aqui dentro" data-tip-pos="cima-dir"></span>` : ""}
          <span class="nav-chev">${icone(aberto ? "chevron-down" : "chevron-right")}</span>
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
          ${
            // No celular a topbar é reservada à barra de comando, então o seletor aparece
            // aqui — onde o cargo já era mostrado. No desktop este fica oculto (o do topo
            // vale), porque a barra lateral pode estar recolhida.
            perfilSeletorHTML(store, "lateral") || `<div class="brand-sub">${esc(c ? c.cargo : "")}</div>`
          }
        </div>
        <button class="sidebar-toggle" data-toggle-sidebar title="Recolher / expandir o menu" aria-label="Recolher ou expandir o menu">${icone("chevrons-left")}</button>
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
    </aside>`;
}

// Barra de comando no topo: gatilho VISÍVEL da paleta ⌘K (navegar + perguntar à IA).
// Não recria um input próprio — clicar (ou Ctrl/⌘+K) abre a paleta, que já tem o campo real
// e reusa 100% o motor do chat (interpretar → propor → confirmar → executar).
const EH_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || "");

// Saudação + data do topo. Extraída do topbarHTML para o watcher da virada do dia
// (setInterval no bootstrap) poder recomputar e comparar sem re-render global.
// `chave` identifica o par saudação+data corrente (vai num data-attr do chip).
function heyInfo(store) {
  const st = store.get();
  const hora = new Date().getHours();
  const saud = hora < 5 ? "Boa madrugada" : hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const dataFmt = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  // O cargo saiu daqui e virou o SELETOR DE PERFIL (perfilSeletorHTML): este bloco é
  // reescrito pelo watcher da virada do dia, o que fecharia o menu aberto e destruiria
  // os listeners dele.
  return {
    chave: `${saud}|${dataFmt}`,
    html: `${esc(saud)} · <b>${esc(dataFmt)}</b>`,
  };
}

// Seletor de perfil (= concurso) no topo. Reusa o padrão de menu do app (.doc-mais +
// .doc-mais-pop), então herda posicionamento, foco de teclado e as duas paletas.
// Com um só perfil ele continua sendo o nome do concurso — só que clicável, revelando
// "Novo concurso" quando o usuário quiser um segundo.
// `onde`: "topo" (topbar, desktop) ou "lateral" (cabeçalho da barra lateral, celular).
// Dois lugares porque nenhum sozinho serve sempre: no celular a topbar é reservada à barra
// de comando, e no desktop a barra lateral pode estar RECOLHIDA (só ícones), o que
// esconderia o seletor. Cada um aparece na largura em que funciona; os handlers são
// plurais e cobrem os dois.
function perfilSeletorHTML(store, onde = "topo") {
  const perfis = store.perfis ? store.perfis() : [];
  if (!perfis.length) return "";
  const atual = perfis.find((p) => p.ativo) || perfis[0];
  const rotulo = atual.cargo || atual.nome;
  const item = (p) => {
    const detalhe = [p.topicos ? `${p.topicos} tópicos` : "", p.questoes ? `${p.questoes} questões` : ""]
      .filter(Boolean)
      .join(" · ");
    return `<button class="menu-item" data-perfil-ir="${esc(p.id)}"${p.ativo ? " disabled" : ""}>
      <span class="menu-ico">${p.ativo ? icone("check") : ""}</span>
      <span class="tb-perfil-nome">
        <span class="tb-perfil-rot">${esc(p.nome)}</span>
        ${detalhe ? `<span class="muted small">${esc(detalhe)}</span>` : ""}
      </span>
    </button>`;
  };
  return `
    <details class="doc-mais tb-perfil tb-perfil--${onde}">
      <summary class="tb-cargo" data-tip="${perfis.length > 1 ? "Trocar de concurso" : "Seus concursos"}" aria-label="Perfil: ${esc(atual.nome)}">
        <span class="tb-perfil-atual">${esc(rotulo)}</span>${icone("chevron-down")}
      </summary>
      <div class="doc-mais-pop tb-perfil-pop">
        <div class="menu-rotulo">${perfis.length > 1 ? "Concursos" : "Concurso"}</div>
        ${perfis.map(item).join("")}
        <div class="menu-sep"></div>
        <button class="menu-item" data-perfil-novo><span class="menu-ico">${icone("plus")}</span> Novo concurso</button>
        <button class="menu-item" data-perfil-renomear><span class="menu-ico">${icone("pencil-line")}</span> Renomear este</button>
        ${
          perfis.length > 1
            ? `<button class="menu-item menu-item-danger" data-perfil-remover><span class="menu-ico">${icone("trash-2")}</span> Remover este</button>`
            : ""
        }
      </div>
    </details>`;
}

function topbarHTML(store) {
  const st = store.get();
  const hey = heyInfo(store);
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
      streakChip = `<button type="button" class="tb-chip tb-streak" data-nav="diagnostico" data-tip="Sequência de dias estudando — ver constância">${icone("flame")}<b>${ofe.atual}</b> ${ofe.atual === 1 ? "dia" : "dias"}</button>`;
  } catch (_) {}
  // Cronômetro e lembretes saíram do topo: agora são botões FLUTUANTES (cronometro.js e
  // lembretes.js), presentes em todas as telas inclusive no foco. Aqui no topo ficam prova
  // e ofensiva.
  return `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="tb-hey" data-hey="${esc(hey.chave)}">${hey.html}</div>
        ${perfilSeletorHTML(store, "topo")}
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
    <button class="mbb-item mbb-mais" data-mbb-mais><span class="mbb-ico">${icone("menu")}</span><span class="mbb-lbl">Mais</span></button>
  </nav>`;
}

// ===== Fase 8 (a11y): ARIA dos segmented (.seg) =====
// O markup dos .seg nasce em ~10 telas (todas já com role="tablist" no container, mas os
// botões sem semântica). Em vez de editar tela a tela, um pós-processo central aplica
// role="tab" + aria-selected (espelho da classe .on/.ativo). Um MutationObserver no body
// (childList + classe, debounce por frame) cobre re-renders internos das telas e segs
// dentro de modais — o custo por passada é um querySelectorAll barato.
function aplicarAriaSeg() {
  document.querySelectorAll(".seg").forEach((seg) => {
    if (!seg.hasAttribute("role")) seg.setAttribute("role", "tablist");
    if (seg.getAttribute("role") !== "tablist") return; // ex.: role="group" (não são abas)
    seg.querySelectorAll(":scope > button").forEach((b) => {
      if (b.getAttribute("role") !== "tab") b.setAttribute("role", "tab");
      const val = b.classList.contains("on") || b.classList.contains("ativo") ? "true" : "false";
      if (b.getAttribute("aria-selected") !== val) b.setAttribute("aria-selected", val);
    });
  });
}
let ariaSegObserver = null;
function iniciarAriaSeg() {
  if (ariaSegObserver) return;
  let agendado = false;
  const agendar = () => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => { agendado = false; aplicarAriaSeg(); });
  };
  ariaSegObserver = new MutationObserver(agendar);
  // Só childList/class: os setAttribute de role/aria-selected acima NÃO reentram no observer.
  ariaSegObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  agendar();
}

// ===== Celular: os 3 flutuantes (Assistente, cronômetro, lembretes) saem da frente =====
// Numa tela de ~390px os três círculos ficam permanentemente sobre a faixa de leitura. Aqui
// eles descem enquanto o dedo rola PARA BAIXO e voltam ao parar ou subir (body.fabs-ocultos
// faz o resto no CSS). Não se escondem com um popover/painel aberto — o painel some junto com
// o botão que o ancora. O listener é ligado no #content de cada render (nó novo a cada vez).
let ultimoScrollFab = 0;
function mostrarFabs() {
  document.body.classList.remove("fabs-ocultos");
}
// Enquanto se ESCREVE, os botoes saem da frente. O auto-ocultar por rolagem nao cobre este
// caso: digitar nao rola, entao numa resposta longa da Discursiva (ou no chat, ou num
// formulario) o botao fica parado POR CIMA do texto que se esta escrevendo. Mesma excecao da
// rolagem: cronometro em uso nao some, porque ali o botao e mostrador, nao atalho.
const CAMPOS_TEXTO = 'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]), [contenteditable=""], [contenteditable="true"]';
function ligarOcultarFabsAoDigitar() {
  document.addEventListener("focusin", (e) => {
    if (!e.target?.matches?.(CAMPOS_TEXTO)) return;
    if (document.querySelector("#crono-fab.ativo")) return;
    document.body.classList.add("fabs-digitando");
  });
  document.addEventListener("focusout", () => document.body.classList.remove("fabs-digitando"));
}

// O celular decide QUAL seletor abrir a partir do `accept`: havendo tipo de imagem na lista,
// iOS e varios Android abrem o seletor de MIDIA (camera/fotos/videos) e o navegador de arquivos
// — onde esta o PDF — nem aparece. Trocar "image/*" por tipos explicitos nao resolveu (testado
// no aparelho). Entao, em tela de TOQUE, tiramos o `accept` um instante antes de abrir: sem
// pista de tipo, o sistema mostra o navegador de arquivos inteiro e o PDF fica acessivel.
// Nao afrouxa validacao: quem decide o que fazer com o arquivo e o handler, pelo MIME real.
// So nos campos que aceitam DOCUMENTO — onde o campo e so de foto (a folha da discursiva),
// o seletor de midia e exatamente o certo e fica como esta.
function ligarSeletorDeArquivoNoToque() {
  if (!window.matchMedia || !matchMedia("(pointer: coarse)").matches) return;
  document.addEventListener("click", (e) => {
    const alvo = e.target;
    if (!alvo || !alvo.closest) return;
    const lbl = alvo.closest("label");
    const inp = alvo.matches && alvo.matches('input[type="file"]')
      ? alvo
      : lbl && (lbl.control && lbl.control.type === "file" ? lbl.control : lbl.querySelector('input[type="file"]'));
    if (!inp || !inp.getAttribute("accept")) return;
    if (!/pdf|text|json|csv|markdown/i.test(inp.getAttribute("accept"))) return; // campo so de imagem
    inp.dataset.acceptOriginal = inp.getAttribute("accept");
    inp.removeAttribute("accept");
  }, true);
}

function ligarAutoOcultarFabs(content) {
  if (!content) return;
  // TODO render (inclusive trocar de tela) começa com os botões à vista. Sem isto eles
  // ficavam escondidos "para sempre" depois de uma rolagem para baixo: a classe é do <body>,
  // que sobrevive à troca de tela, e a tela nova podia nem ter rolagem para revelá-los.
  mostrarFabs();
  ultimoScrollFab = content.scrollTop;
  content.addEventListener("scroll", () => {
    const y = content.scrollTop;
    const delta = y - ultimoScrollFab;
    if (Math.abs(delta) < 10) return; // ignora tremidas do dedo
    ultimoScrollFab = y;
    // Os popovers do cronômetro/lembretes usam o atributo `hidden` — sem o :not eles
    // contariam como "aberto" o tempo todo e os FABs nunca sumiriam.
    const abertoAlgum = document.querySelector("#chat-panel:not(.oculto), .cf-pop:not([hidden]), .lf-pop:not([hidden])");
    // Cronômetro RODANDO nunca some: ali o botão não é atalho, é mostrador — é onde o
    // usuário lê o tempo e pausa. Esconder o relógio em uso é perder informação.
    const cronoAtivo = !!document.querySelector("#crono-fab.ativo");
    // Some ao rolar PARA BAIXO; volta ao rolar PARA CIMA (delta < 0 zera a classe aqui
    // mesmo). Nada de voltar por tempo: rolar para baixo e parar quer dizer "estou lendo", e
    // reaparecer sozinho poria os botões de volta justamente sobre o trecho onde o usuário
    // parou. Quem decide é o gesto para cima — e a troca de tela também revela (mostrarFabs
    // no início desta função), então eles nunca ficam presos escondidos.
    document.body.classList.toggle("fabs-ocultos", delta > 0 && y > 90 && !abertoAlgum && !cronoAtivo);
  }, { passive: true });
}

function render(preservarScroll = true) {
  esconderTooltip(); // re-render/navegação destrói a âncora — sem isto o portal fica "preso" visível
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
  const noOnboarding = !store.isOnboarded() || onboardingEmCurso();
  document.body.classList.toggle("onboarding", noOnboarding);
  atualizarChatVisibilidade(!noOnboarding);
  if (noOnboarding) {
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

  // ----- Seletor de perfil (concurso) -----
  // Trocar de perfil troca TODO o estudo à vista. Se houver cronômetro rodando, o tempo
  // seria contado para o concurso errado — então avisamos antes em vez de trocar calado.
  const trocarDePerfil = async (id) => {
    if (cronoSnapshot().running) {
      const ok = await confirmar(
        "O cronômetro está rodando. Trocando de concurso agora, o tempo em andamento não será registrado neste. Trocar mesmo assim?"
      );
      if (!ok) return;
    }
    const r = store.trocarPerfil(id);
    // A geração escreve no concurso ATIVO quando a resposta chega: trocar no meio faria o lote
    // inteiro cair no concurso novo. Aqui não há "trocar mesmo assim": é esperar.
    if (r === "gerando") {
      return void toast("Há uma geração em andamento. Espere ela terminar para trocar de concurso, senão as questões entram no concurso errado.", "erro");
    }
    if (r) {
      app.navigate("hoje");
      toast("Concurso trocado.");
    }
  };
  root.querySelectorAll("[data-perfil-ir]").forEach((b) =>
    b.addEventListener("click", () => trocarDePerfil(b.getAttribute("data-perfil-ir")))
  );
  root.querySelectorAll("[data-perfil-novo]").forEach((b) => b.addEventListener("click", () => {
    // Sem pedir nome aqui: quem pergunta "qual concurso você vai prestar?" é o onboarding,
    // logo em seguida. Perguntar nos dois lugares fazia o app guardar um nome de perfil e
    // um cargo diferentes, convivendo. O nome passa a ser derivado do concurso.
    // Criar concurso troca o ATIVO, e a geração escreve no ativo quando a resposta chega.
    if (store.criarPerfil() === "gerando") {
      return void toast("Há uma geração em andamento. Espere ela terminar para criar outro concurso, senão as questões entram no concurso novo.", "erro");
    }
    iniciarFluxoNovoConcurso(); // o fluxo do concurso novo tem começo e fim próprios
    app.navigate("hoje");
  }));
  root.querySelectorAll("[data-perfil-renomear]").forEach((b) => b.addEventListener("click", async () => {
    const atual = store.perfis().find((p) => p.ativo);
    if (!atual) return;
    const nome = await pedirTexto("Renomear concurso:", { valor: atual.nome });
    if (!nome) return;
    store.renomearPerfil(atual.id, nome);
    app.refresh();
  }));
  root.querySelectorAll("[data-perfil-remover]").forEach((b) => b.addEventListener("click", async () => {
    const atual = store.perfis().find((p) => p.ativo);
    if (!atual) return;
    const ok = await confirmar(
      `Remover "${atual.nome}" apaga o edital, os materiais, as questões, os flashcards e todo o histórico DESTE concurso. Os outros não são afetados, mas esta ação é irreversível.`
    );
    if (!ok) return;
    // Apagar o concurso ativo troca o ativo, e ainda destruiria o destino do lote em voo.
    if (store.removerPerfil(atual.id) === "gerando") {
      return void toast("Há uma geração em andamento. Espere ela terminar para remover o concurso.", "erro");
    }
    app.navigate("hoje");
    toast("Concurso removido.");
  }));

  // Gaveta do celular: o botão "Mais" declara o estado (aria-expanded) e o Esc fecha —
  // antes só o toque no fundo escuro ou num destino fechava, e leitor de tela não sabia
  // que aquele botão abria alguma coisa.
  const btnMais = root.querySelector("[data-mbb-mais]");
  const sincronizarMais = () => btnMais?.setAttribute("aria-expanded", document.body.classList.contains("nav-aberta") ? "true" : "false");
  btnMais?.setAttribute("aria-controls", "app-sidebar");
  root.querySelector(".sidebar")?.setAttribute("id", "app-sidebar");
  sincronizarMais();
  btnMais?.addEventListener("click", () => { document.body.classList.toggle("nav-aberta"); sincronizarMais(); });
  root.querySelector("#nav-backdrop")?.addEventListener("click", () => { fecharDrawer(); sincronizarMais(); });

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
  iniciarAriaSeg(); // Fase 8 (a11y): role=tab/aria-selected nos .seg (liga o observer 1x)
  setOrbsOffline(!store.iaDisponivel()); // Fase 2: orb informa o estado (apagado sem IA)
  montarOrbs(document); // orb "vivo" (plasma canvas) em todo .orb novo; ignora os já montados
  ligarAutoOcultarFabs(content); // celular: os 3 flutuantes saem da frente ao rolar
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
  // UMA ABA POR VEZ. Cada aba reescreve o estado inteiro a cada mudança: com duas abertas, a
  // segunda gravava por cima de tudo o que a primeira fez desde que carregou, calada. Verificado
  // ANTES do `init` para não montar meio app e depois pedir para fechar.
  // `mentor_ignorar_lock` é a escolha explícita de "estudar nesta janela" feita na tela abaixo.
  // Vive no sessionStorage: vale só para esta aba e some quando ela fecha, então a guarda volta
  // a valer na próxima abertura em vez de ficar desligada para sempre.
  const ignorarLock = (() => { try { return sessionStorage.getItem("mentor_ignorar_lock") === "1"; } catch (_) { return false; } })();
  if (!ignorarLock && !(await tentarSerAbaDona())) {
    mostrarTelaSegundaAba();
    return;
  }
  await store.init();
  // Espaço: sem isto o navegador trata a biblioteca inteira como cache descartável (o Safari
  // apaga o que não é tocado por alguns dias). Não pede nada ao usuário; o navegador concede
  // sozinho quando o app foi instalado ou tem uso frequente.
  pedirArmazenamentoPersistente();
  // A LEITURA do estado falhou: o store está travado para escrita e o app, em memória, tem o
  // estado padrão. Sem esta tela ele mostraria o ONBOARDING — e o primeiro clique gravaria o
  // vazio por cima de um banco que ele só não conseguiu LER. É verificação direta, e não
  // evento, porque o `init` acontece antes de qualquer listener existir.
  if (store.somenteLeitura()) {
    mostrarTelaRecuperacao(store.erroDeLeitura());
    return; // não monta o resto do app: nada de chat, sync ou agendador escrevendo por cima
  }
  montarChat(store, app); // widget flutuante persistente (fora do #app)
  // Paleta de comando ⌘K (launcher): de qualquer tela, navega rápido (offline) e repassa
  // pergunta/ação ao chat. Só liga depois do app pronto (não no onboarding/crono).
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      abrirPaleta(app);
    }
    // Esc fecha a gaveta do celular (teclado externo / tablet). Só age se ela estiver aberta
    // e não houver modal por cima — o modal tem o próprio Esc e vem primeiro.
    if (e.key === "Escape" && document.body.classList.contains("nav-aberta") && !document.querySelector(".mm-overlay, .modal-overlay, .paleta-overlay")) {
      document.body.classList.remove("nav-aberta");
      document.querySelector("[data-mbb-mais]")?.setAttribute("aria-expanded", "false");
    }
  });
  // ===== Menus de reticências (<details> com popover): fechar por fora e por Esc =====
  // Só a Lei Seca tinha isso; nas demais telas o menu contava com o re-render da ação para
  // sumir — e ações que abrem um modal (Renomear, Anexar link…) deixavam o menu aberto atrás.
  // No celular ficou evidente: o popover virou uma folha ancorada embaixo, longe do botão,
  // e tocar fora dele (o gesto natural para dispensar) não fazia nada.
  const menusAbertos = () =>
    [...document.querySelectorAll("details[open]")].filter((d) =>
      d.querySelector(":scope > .doc-mais-pop, :scope > .ls-mais-pop, :scope > .resumo-menu-pop")
    );
  document.addEventListener("pointerdown", (e) => {
    menusAbertos().forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  }, true);
  // Escolher uma opção fecha o menu. Em fase de bolha, depois do handler da própria ação.
  document.addEventListener("click", (e) => {
    const pop = e.target.closest?.(".doc-mais-pop, .ls-mais-pop, .resumo-menu-pop");
    if (pop) pop.closest("details")?.removeAttribute("open");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menusAbertos().forEach((d) => (d.open = false)); });

  ligarOcultarFabsAoDigitar();
  ligarSeletorDeArquivoNoToque();
  montarCronometro(app); // cronômetro flutuante global (FAB único) que acompanha entre telas
  montarLembretesFab(store); // FAB de lembretes (acima do cronômetro), presente em todas as telas

  // Scroll-chaining: em alguns WebViews (app desktop), uma caixa com scroll próprio (overflow:auto,
  // ex.: o trecho de um tópico no sumário) "prende" a roda do mouse mesmo já no limite e a página
  // não continua. Este handler encaminha o scroll para a área de conteúdo quando a caixa interna já
  // chegou ao topo/fundo — mantendo o scroll interno da caixa enquanto houver o que rolar dentro.
  document.addEventListener(
    "wheel",
    (e) => {
      const box = e.target.closest && e.target.closest(".doc-corpo");
      if (!box) return;
      const podeRolarBox = box.scrollHeight > box.clientHeight + 1;
      const noLimite = !podeRolarBox || (e.deltaY > 0
        ? Math.ceil(box.scrollTop + box.clientHeight) >= box.scrollHeight
        : box.scrollTop <= 0);
      if (!noLimite) return; // a caixa ainda pode rolar nessa direção → deixa a caixa rolar
      const cont = box.closest(".content");
      if (cont && cont.scrollHeight > cont.clientHeight + 1) {
        cont.scrollTop += e.deltaY;
        e.preventDefault();
      }
    },
    { passive: false }
  );
  // O botão "Registrar" do flutuante abre a janela de registro (modo cronômetro).
  setAoPedirRegistro(() => abrirRegistroSessao(store, app, { modo: "crono" }));
  montarPlexus(); // malha "plexus" animada de fundo (atmosfera); respeita reduced-motion
  initTooltips(); // tooltips via portal (imunes a overflow:hidden dos ancestrais)
  setEstiloAlarme(store.get().config.somAlarme); // aplica a preferência de som do alarme
  // Re-render em qualquer mudança de estado — EXCETO com o Modo Foco aberto.
  // Com o overlay no ar, cada tela troca o miolo NO LUGAR (atualizarFocoFlash /
  // atualizarOverlayFoco / atualizarFocoRev / o `atualizar()` da leitura em foco). Um render
  // global aqui recriaria o `.fc-foco` e re-dispararia a animação de entrada (`fq-fade`), que
  // é exatamente o "parece que recarregou" ao passar de card — quase invisível no desktop e
  // muito evidente no celular, onde reconstruir o app inteiro custa caro. Quem fecha o foco
  // sempre chama `app.refresh()`, então a tela de trás volta atualizada.
  store.subscribe(() => {
    if (document.querySelector(".fc-foco")) return;
    render();
  });
  render();
  // Virada do dia / da faixa horária com o app aberto: saudação e data do topo são
  // calculadas no render, então ficariam defasadas. Watcher registrado UMA vez no boot
  // (não por render): a cada 60s compara a chave exibida (data-hey) com a atual e, se
  // mudou, atualiza SÓ o chip do topo — sem re-render global.
  setInterval(() => {
    const el = document.querySelector(".topbar .tb-hey");
    if (!el) return;
    const hey = heyInfo(store);
    if (el.getAttribute("data-hey") !== hey.chave) {
      el.setAttribute("data-hey", hey.chave);
      el.innerHTML = hey.html;
    }
  }, 60000);
  // Accountability (dir.3): dispara as notificações devidas (só no desktop/Tauri).
  dispararNotificacoesDevidas(store);
  // Agendador do lembrete diário (toast no app + notificação do SO no desktop).
  iniciarAgendadorDiario(store);
  // Checagem silenciosa de atualização (só no app empacotado e com updater configurado).
  verificarAtualizacao({ silencioso: true });
  // Mentor IA: auto-análise SEMANAL (1×/semana, mesmo sem clique) — só roda se IA
  // conectada, houver atividade, ≥7 dias e o usuário não desligou em Config.
  // Fase 3: quando ela RODA, o aluno fica sabendo (toast + selo na barra) — antes o
  // resultado ficava mudo numa aba e o momento de maior mágica era desperdiçado.
  store.autoAnalisarMentorSeDevido().then((rodou) => {
    if (rodou) {
      toast("Preparei um plano novo para você enquanto isso.", "ok", {
        acaoLabel: "Ver plano",
        duracao: 9000,
        onAcao: () => app.navigate("mentor"),
      });
    }
  });
  // Sincronização: ao ABRIR, puxa o mais recente da nuvem do usuário (se conectado).
  // Dois canais independentes: por arquivo (Drive/OneDrive, desktop) e por senha (celular + PC).
  // A nuvem por senha (celular + PCs) fica AUTOMÁTICA: abre, volta ao foco, alterou, saiu.
  iniciarSyncNuvemAuto();
  // E garante a sincronização ao FECHAR o app.
  ligarSyncAoFechar();

  // CONTEÚDO SOB DEMANDA: num aparelho que só tem o esqueleto, pedir "10 questões desta aula"
  // dispara um download antes da geração. Sem aviso, a espera parece travamento — e o pedido
  // pode ter vindo do chat, de um atalho ou de qualquer tela, então o aviso mora aqui, num
  // lugar só, ouvindo o evento que o store emite.
  let fecharAvisoConteudo = null;
  // Gravação que falhou. Antes morria num `console.error`: o aluno estudava e o dia não tinha
  // sido salvo, sem nada na tela. O aviso é PERSISTENTE de propósito (não é toast de 3 s) —
  // continuar estudando por cima de um app que não grava é o pior dos dois mundos.
  let avisoGravacao = null;
  window.addEventListener("mentor:gravacao", (ev) => {
    const d = (ev && ev.detail) || {};
    if (avisoGravacao) { avisoGravacao.remove(); avisoGravacao = null; }
    if (d.ok) return void toast("Consegui salvar. Seus dados estão gravados.", "ok");
    const faixa = document.createElement("div");
    faixa.className = "aviso-gravacao";
    faixa.setAttribute("role", "alert");
    faixa.innerHTML = `<span>${d.espaco
      ? "<b>Acabou o espaço para salvar.</b> O que você fizer agora pode se perder. Libere espaço (ou apague um concurso que não usa) e tente de novo."
      : "<b>Não consegui salvar.</b> O que você fizer agora pode se perder. Não feche o app antes de tentar de novo."}</span>
      <button class="btn btn-sm" data-regravar>Tentar salvar de novo</button>`;
    faixa.querySelector("[data-regravar]").addEventListener("click", async (e) => {
      e.target.disabled = true;
      e.target.textContent = "Salvando…";
      if (!(await store.tentarGravarDeNovo())) {
        e.target.disabled = false;
        e.target.textContent = "Tentar salvar de novo";
      }
    });
    document.body.appendChild(faixa);
    avisoGravacao = faixa;
  });
  window.addEventListener("mentor:conteudo", (ev) => {
    const d = (ev && ev.detail) || {};
    if (d.fase === "baixando") {
      if (fecharAvisoConteudo) fecharAvisoConteudo();
      fecharAvisoConteudo = toastCarregando(`Baixando «${String(d.titulo || "material").slice(0, 46)}»…`);
    } else if (d.fase === "fim") {
      if (fecharAvisoConteudo) { fecharAvisoConteudo(); fecharAvisoConteudo = null; }
      if (!d.ok) toast("Não consegui baixar o conteúdo deste material agora.", "erro");
    }
  });
}

// Segunda aba do mesmo app. Não é erro: é a situação normal de quem tem o PWA instalado e abre
// a mesma URL no navegador. O que não pode é as duas gravarem, porque cada uma reescreve o
// estado inteiro e a última a salvar apaga o trabalho da outra.
function mostrarTelaSegundaAba() {
  const tela = document.createElement("div");
  tela.className = "recuperacao-overlay";
  tela.setAttribute("role", "alertdialog");
  tela.setAttribute("aria-modal", "true");
  tela.innerHTML = `<div class="recuperacao-caixa">
    <h2>O Mentor já está aberto em outra janela</h2>
    <p>Para não perder nada, o app funciona numa janela por vez: se as duas gravassem, a última a
    salvar apagaria o que você fez na outra.</p>
    <p class="muted small">Volte para a janela onde já estava estudando. Se ela não existe mais
    (fechou sem querer, travou), use o botão abaixo.</p>
    <div class="recuperacao-acoes">
      <button class="btn btn-primary" data-recarregar>Tentar de novo</button>
      <button class="btn btn-ghost" data-assumir>Estudar nesta janela</button>
    </div>
  </div>`;
  tela.querySelector("[data-recarregar]").addEventListener("click", () => location.reload());
  tela.querySelector("[data-assumir]").addEventListener("click", async () => {
    const ok = await confirmar(
      "Assumir aqui só é seguro se a outra janela estiver realmente fechada. Se ela ainda estiver aberta e você mexer nas duas, uma vai apagar o trabalho da outra. Continuar?"
    );
    if (!ok) return;
    // Não há como "roubar" o lock: quem o tem é a outra aba. O que dá para fazer é seguir sem
    // ele, que é exatamente o comportamento de antes desta guarda, agora com o usuário ciente.
    // Não há como "roubar" um Web Lock: quem o tem é a outra aba. O que dá para fazer é seguir
    // sem ele — exatamente o comportamento de antes desta guarda, agora com o usuário ciente.
    try { sessionStorage.setItem("mentor_ignorar_lock", "1"); } catch (_) {}
    location.reload();
  });
  document.body.appendChild(tela);
}

// Tela de recuperação: o app não conseguiu LER os dados guardados.
//
// A promessa que ela faz é a que o código cumpre: enquanto estiver aqui, `store.persist()` está
// travado e nada é gravado. As duas saídas são explícitas e do usuário — não há caminho
// automático, de propósito, porque o automático era exatamente o defeito (abrir como aparelho
// novo e apagar o banco no primeiro clique).
function mostrarTelaRecuperacao(msg) {
  const tela = document.createElement("div");
  tela.className = "recuperacao-overlay";
  tela.setAttribute("role", "alertdialog");
  tela.setAttribute("aria-modal", "true");
  tela.innerHTML = `<div class="recuperacao-caixa">
    <h2>Não consegui abrir os seus dados</h2>
    <p>Os seus dados de estudo <b>não foram apagados</b>. Eu é que não consegui lê-los agora.
    Enquanto esta tela estiver aqui, o app <b>não grava nada</b>, para não escrever por cima do que está guardado.</p>
    <p class="muted small">Costuma ser passageiro: feche tudo e abra de novo. Se insistir, o seu cofre da
    nuvem continua lá — dá para começar do zero e restaurar com a sua senha.${msg ? ` <span class="recuperacao-erro">(${esc(msg)})</span>` : ""}</p>
    <div class="recuperacao-acoes">
      <button class="btn btn-primary" data-recarregar>Tentar abrir de novo</button>
      <button class="btn btn-ghost" data-zerar>Começar do zero mesmo assim</button>
    </div>
  </div>`;
  tela.querySelector("[data-recarregar]").addEventListener("click", () => location.reload());
  tela.querySelector("[data-zerar]").addEventListener("click", async () => {
    const ok = await confirmar(
      "Começar do zero destrava a gravação: assim que você mexer em qualquer coisa, o que estiver guardado neste aparelho é substituído. Se os seus dados estão no cofre da nuvem, dá para restaurá-los depois com a sua senha. Tem certeza?"
    );
    if (!ok) return;
    const btn = tela.querySelector("[data-zerar]");
    btn.disabled = true;
    btn.textContent = "Preparando…";
    // Só recarrega se a limpeza + gravação funcionaram. Recarregar sem isso devolveria esta
    // mesma tela na abertura seguinte — um laço, não uma saída.
    if (await store.destravarEscritaComecandoDoZero()) return void location.reload();
    btn.disabled = false;
    btn.textContent = "Começar do zero mesmo assim";
    toast("Também não consegui gravar neste aparelho. Verifique o espaço livre e as permissões do navegador.", "erro");
  });
  document.body.appendChild(tela);
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
        // GRAVAR ANTES DE SINCRONIZAR. O fechamento esperava só pela nuvem e ia embora sem
        // esperar a escrita local: uma sessão registrada nos últimos 250 ms (o debounce do
        // `persist`) morria com a janela. E subir para o cofre um estado que não foi gravado
        // aqui é pior ainda — o aparelho volta a abrir com dados mais velhos do que o cofre.
        try { await Promise.race([store.gravarAgora(), new Promise((r) => setTimeout(r, 5000))]); } catch (_) {}
        try { await Promise.race([sincronizarNuvemAoFechar(), new Promise((r) => setTimeout(r, 3000))]); } catch (_) {}
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
    // Na web não dá para esperar nada ao sair: o que vale é ter COMEÇADO a escrita antes de a
    // aba morrer. `visibilitychange → hidden` é o último momento confiável no celular (trocar
    // de app nem sempre dispara `pagehide`), por isso os dois.
    const gravarAoSair = () => { try { store.gravarAgora(); } catch (_) {} };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") gravarAoSair(); });
    window.addEventListener("pagehide", () => {
      gravarAoSair();
      try { sincronizarNuvemAoFechar(); } catch (_) {}
    });
  }
}

bootstrap();

// PWA (só na WEB): registra o service worker para instalar no celular e funcionar offline.
// No desktop Tauri isso não se aplica (o app já é nativo). Também pula a janela do cronômetro.
(function registrarPWA() {
  const ehDesktop = typeof window !== "undefined" && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);
  const ehCrono = typeof window !== "undefined" && window.__MENTOR_CRONO__ === true;
  if (ehDesktop || ehCrono) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      // `onNeedReload` é OBRIGATÓRIO aqui. O build usa registerType:"autoUpdate" e, nesse
      // modo, o cliente do vite-plugin-pwa chama window.location.reload() SOZINHO assim que o
      // service worker novo ativa (skipWaiting + clientsClaim) — a menos que este callback
      // exista. No celular esse reload caía no meio de uma geração de IA: o app voltava para a
      // rota inicial ("hoje") e o app.navigate("flashcards", …) que já tinha rodado era
      // apagado, dando exatamente o sintoma "gerou e não abriu a tela do resultado". No
      // desktop (Tauri) não há service worker, por isso o problema só aparecia no celular.
      // Com o callback, quem decide a hora de recarregar é o usuário.
      registerSW({
        immediate: true,
        onNeedReload: () => {
          toast("Nova versão do app disponível.", "ok", {
            acaoLabel: "Atualizar",
            duracao: 12000,
            onAcao: () => window.location.reload(),
          });
        },
      });
    })
    .catch(() => {});
})();
