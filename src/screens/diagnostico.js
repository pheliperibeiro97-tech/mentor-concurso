// Acompanhamento: controle das sessões por período (botões), por dia (calendário
// mensal navegável) e desempenho por disciplina/tópico (com último dia estudado).
// SEM "previsão de aprovação" (decisão do plano).
import { bindActions, header, vazio, toast, confirmar, focarItem, faixaIA, abrirJanela, imprimir, skeletonDoc , plural, defMetrica } from "../ui.js";
import { esc, fmtTempo, fmtTempoCurto, fmtMin, fmtData, todayISO, daysBetween } from "../util.js";
import { icone } from "../icones.js";
import { FASES, ORDEM_FASES } from "../ciclo.js";
import { heatmapConstancia, progressRing } from "../viz.js";
import { revelarTexto } from "../ui.js";
import { iaDisponivel as _iaOn, responderChat as _responderChat } from "../ia-provider.js";

let periodoSel = "hoje"; // hoje | semana | mes | tudo
let diaSel = null; // 'yyyy-mm-dd' quando um dia do calendário é clicado
let mesCal = null; // 'yyyy-mm' em exibição no calendário
let sessaoSort = { col: "data", dir: "desc" }; // ordenação da tabela de sessões
// Filtros do histórico de sessões (painel "Filtros" com campos rotulados + chips). "" = sem filtro.
let sessFiltroDisc = ""; // disciplina (id) — "" = todas
let sessFiltroFase = ""; // fase — "" = todas
let sessFiltroTop = ""; // tópico (id, contextual à disciplina) — "" = todos
let sessFiltroIni = ""; // data início (yyyy-mm-dd) do intervalo
let sessFiltroFim = ""; // data fim (yyyy-mm-dd) do intervalo
let sessFiltroObs = ""; // busca por texto na observação
let sessFiltrosAbertos = false; // painel "Filtros" aberto/fechado
let rolarParaSessoes = false; // ao trocar período/dia, rola até a lista de sessões
let statsDetAbertas = false; // lembra se "Estatísticas detalhadas" está aberto (sobrevive ao re-render)
let kpiAnimou = false; // count-up dos KPIs só na 1ª renderização da sessão (não re-anima a cada ação)
const discAberta = new Set();
const sessEdit = new Set(); // ids de sessões em edição

const LABEL = { hoje: "Hoje", semana: "Últimos 7 dias", mes: "Mês atual", tudo: "Todo o período" };
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function pad2(n) {
  return String(n).padStart(2, "0");
}
function haQuantoTempo(iso) {
  if (!iso) return "nunca estudado";
  const n = daysBetween(iso.slice(0, 10), todayISO());
  if (n <= 0) return "hoje";
  if (n === 1) return "ontem";
  return `há ${n} dias`;
}

// Rótulo do intervalo de datas ativo (para chip e título). Sem travessão: usa "a".
function rotuloIntervalo() {
  if (sessFiltroIni && sessFiltroFim) return `${fmtData(sessFiltroIni)} a ${fmtData(sessFiltroFim)}`;
  if (sessFiltroIni) return `desde ${fmtData(sessFiltroIni)}`;
  return `até ${fmtData(sessFiltroFim)}`;
}

// Aplica os filtros do histórico de sessões (data + fase/disciplina/tópico/observação) e ordena.
// Prioridade da data: intervalo (Data início/fim do painel) > dia (calendário) > período (cards).
function filtrarSessoes(store) {
  const todasSessoes = store.sessoesDetalhadas();
  const hoje = todayISO();
  const mesAtual = hoje.slice(0, 7);
  const preds = {
    hoje: (d) => d === hoje,
    semana: (d) => { const n = daysBetween(d, hoje); return n >= 0 && n < 7; },
    mes: (d) => d.slice(0, 7) === mesAtual,
    tudo: () => true,
  };
  let ss, tituloSessoes;
  if (sessFiltroIni || sessFiltroFim) {
    ss = todasSessoes.filter((s) => {
      const d = s.data.slice(0, 10);
      if (sessFiltroIni && d < sessFiltroIni) return false;
      if (sessFiltroFim && d > sessFiltroFim) return false;
      return true;
    });
    tituloSessoes = `Sessões · ${rotuloIntervalo()}`;
  } else if (diaSel) {
    ss = todasSessoes.filter((s) => s.data.slice(0, 10) === diaSel);
    tituloSessoes = `Sessões de ${fmtData(diaSel)}`;
  } else {
    ss = todasSessoes.filter((s) => preds[periodoSel](s.data.slice(0, 10)));
    tituloSessoes = `Sessões · ${LABEL[periodoSel]}`;
  }
  if (sessFiltroDisc) ss = ss.filter((s) => s.disciplinaId === sessFiltroDisc);
  if (sessFiltroFase) ss = ss.filter((s) => s.fase === sessFiltroFase);
  if (sessFiltroTop) ss = ss.filter((s) => s.topicoId === sessFiltroTop);
  const q = sessFiltroObs.trim().toLowerCase();
  if (q) ss = ss.filter((s) => (s.comentario || "").toLowerCase().includes(q));
  ss = ordenarSessoes(ss, sessaoSort);
  return { todasSessoes, sessoesFiltradas: ss, tituloSessoes };
}

// Chips dos filtros ativos (com × individual) + "limpar tudo".
function sessChipsHTML(st) {
  const nomeDisc = (id) => (st.disciplinas.find((d) => d.id === id) || {}).nome || "?";
  const nomeTop = (id) => (st.topicos.find((t) => t.id === id) || {}).nome || "?";
  const chip = (label, tipo, val) => `<span class="sess-chip">${esc(label)}<button class="sess-chip-x" data-action="sess-chip-remover" data-tipo="${tipo}" data-val="${val || ""}" aria-label="Remover filtro">${icone("x")}</button></span>`;
  const chips = [];
  if (sessFiltroIni || sessFiltroFim) chips.push(chip(rotuloIntervalo(), "data"));
  else if (diaSel) chips.push(chip(fmtData(diaSel), "dia"));
  else if (periodoSel !== "tudo") chips.push(chip(LABEL[periodoSel], "periodo"));
  if (sessFiltroDisc) chips.push(chip(nomeDisc(sessFiltroDisc), "disc"));
  if (sessFiltroFase) chips.push(chip(FASES[sessFiltroFase].nome, "fase"));
  if (sessFiltroTop) chips.push(chip(nomeTop(sessFiltroTop), "top"));
  if (sessFiltroObs.trim()) chips.push(chip(`"${sessFiltroObs.trim()}"`, "obs"));
  if (!chips.length) return "";
  return `<div class="sess-chips">${chips.join("")}<button class="lnk small sess-limpar" data-action="sess-limpar-tudo">limpar tudo</button></div>`;
}

// Painel de filtros: card de campos rotulados (disciplina, tópico, datas, fase + busca).
// Abre abaixo do botão "Filtros"; a tabela continua visível e atualiza ao vivo.
function sessPainelHTML(st) {
  if (!sessFiltrosAbertos) return "";
  const semDisc = !st.disciplinas.length;
  const discOpts = st.disciplinas.map((d) => `<option value="${d.id}" ${sessFiltroDisc === d.id ? "selected" : ""}>${esc(d.nome)}</option>`).join("");
  // Tópico contextual: disciplina selecionada → só os tópicos dela; senão → todos, agrupados por disciplina.
  let topOpts;
  if (sessFiltroDisc) {
    topOpts = st.topicos.filter((t) => t.disciplinaId === sessFiltroDisc).map((t) => `<option value="${t.id}" ${sessFiltroTop === t.id ? "selected" : ""}>${esc(t.nome)}</option>`).join("");
  } else {
    topOpts = st.disciplinas
      .map((d) => {
        const ts = st.topicos.filter((t) => t.disciplinaId === d.id);
        if (!ts.length) return "";
        return `<optgroup label="${esc(d.nome)}">${ts.map((t) => `<option value="${t.id}" ${sessFiltroTop === t.id ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</optgroup>`;
      })
      .join("");
  }
  const faseOpts = ORDEM_FASES.map((f) => `<option value="${f}" ${sessFiltroFase === f ? "selected" : ""}>${esc(FASES[f].nome)}</option>`).join("");
  const temFiltro = sessFiltroDisc || sessFiltroFase || sessFiltroTop || sessFiltroIni || sessFiltroFim || sessFiltroObs.trim() || periodoSel !== "tudo" || diaSel;
  const campoSel = (id, label, inner, dis) => `<label class="sff-field">
        <span class="sff-lbl">${label}</span>
        <select id="${id}" class="sff-input sff-input-sel" ${dis ? "disabled" : ""}>${inner}</select>
      </label>`;
  const campoData = (id, label, val) => `<label class="sff-field">
        <span class="sff-lbl">${label}</span>
        <input type="date" id="${id}" class="sff-input sff-date" value="${val || ""}" />
      </label>`;
  return `<div class="sess-filtros-painel" role="region" aria-label="Filtros do histórico">
      <div class="sff-head">
        <span class="sff-tit">${icone("list-filter")} Filtros</span>
        <span class="sff-sub">Refine o histórico de sessões</span>
        ${temFiltro ? `<button class="sff-limpar" data-action="sess-limpar-tudo">${icone("rotate-ccw")} Limpar filtros</button>` : ""}
      </div>
      <div class="sff-grid">
        ${campoSel("sess-f-disc", "Disciplina", `<option value="">Todas as disciplinas</option>${discOpts}`, semDisc)}
        ${campoSel("sess-f-top", "Tópico", `<option value="">Todos os tópicos</option>${topOpts}`, semDisc)}
        ${campoData("sess-f-ini", "Data início", sessFiltroIni)}
        ${campoData("sess-f-fim", "Data fim", sessFiltroFim)}
        ${campoSel("sess-f-fase", "Fase", `<option value="">Todas as fases</option>${faseOpts}`, false)}
      </div>
      <div class="sff-busca">${icone("search")}<input id="sess-busca" type="search" class="sff-busca-input" placeholder="Buscar nas observações…" value="${esc(sessFiltroObs)}" /></div>
    </div>`;
}

export default function renderDiagnostico(root, app) {
  const { store } = app;
  const st = store.get();
  const diag = store.diagnostico();
  const histPeriodo = Number(st.config.histPeriodo) || 14;
  const hist = store.historico(histPeriodo);
  const ofens = store.ofensiva();
  if (!mesCal) mesCal = todayISO().slice(0, 7);
  // Deep-link de uma sessão específica (vindo do Dossiê): mostra todo o período,
  // limpa filtros e rola até a linha dela.
  let focoSess = null;
  if (app.params && app.params.focoSessaoId) {
    focoSess = app.params.focoSessaoId;
    app.params.focoSessaoId = null;
    periodoSel = "tudo";
    diaSel = null;
    sessFiltroDisc = "";
    sessFiltroFase = "";
    sessFiltroTop = "";
    sessFiltroIni = "";
    sessFiltroFim = "";
    sessFiltroObs = "";
  }

  // ----- histórico de sessões: filtros (período/dia + fase/disciplina/tópico/observação) -----
  const { todasSessoes, sessoesFiltradas, tituloSessoes } = filtrarSessoes(store);
  const dateAtiva = !!(sessFiltroIni || sessFiltroFim || diaSel || periodoSel !== "tudo");
  const nCatFiltros =
    (dateAtiva ? 1 : 0) + (sessFiltroDisc ? 1 : 0) + (sessFiltroFase ? 1 : 0) + (sessFiltroTop ? 1 : 0) + (sessFiltroObs.trim() ? 1 : 0);

  const m = store.metas();
  const observacoes = store.observacoesRecentes();

  const pontoTopo = store.pontosAtencao()[0];

  // Cobertura geral = média da cobertura por disciplina (dado já presente no diag).
  const discComTop = diag.porDisciplina.filter((l) => l.topicos.length);
  const coberturaGeral = discComTop.length
    ? Math.round(discComTop.reduce((a, l) => a + l.cobertura, 0) / discComTop.length)
    : null;
  const semanaSeg = hist.periodos.semana.tempoSeg;
  // Guarda: os KPIs contam 0→N só ao ENTRAR na tela; nas re-renderizações (trocar período,
  // ordenar, filtrar) emitem o valor final estático, sem re-animar (evita o "piscar").
  const kpiAnima = !kpiAnimou;
  kpiAnimou = true;
  root.innerHTML = `
    ${header("Acompanhamento", "Sua evolução, num relance.", `<button class="btn btn-ghost btn-sm" data-action="abrir-imprimir-acomp" data-tip="Escolha o que imprimir desta página">${icone("printer")} Imprimir</button>`)}

    ${
      pontoTopo
        ? faixaIA({
            texto: `O Mentor notou: <b>${esc(pontoTopo.txt)}</b>`,
            ctaLabel: pontoTopo.acao ? pontoTopo.acao.label : "",
            rota: pontoTopo.acao ? pontoTopo.acao.rota : "",
            key: "acomp-" + pontoTopo.key,
          })
        : ""
    }

    <section class="card constancia-card" data-print="constancia" data-print-label="Constância (heatmap)">
      <div class="plano-h" style="margin-bottom:4px">
        <h2>${icone("flame")} Constância</h2>${defMetrica("constancia")}
        <span class="sp"></span>
        <span class="chip chip-count" style="cursor:default">${ofensivaTexto(ofens)}</span>
      </div>
      <p class="muted small" style="margin:2px 0 10px">Cada quadrado é um dia. Dia sem registro fica neutro — a régua aqui é a sua própria rotina.</p>
      ${heatmapConstancia(store.get().sessoes, { folgaDias: store.get().config.diasFolga || [] })}
    </section>

    <section class="card card-ia comport-card" data-print="comport" data-print-label="Comportamental">
      <div class="barra-acoes" style="margin-bottom:6px">
        <h3 style="margin:0;display:flex;align-items:center;gap:8px"><span class="orb orb-sm" aria-hidden="true"></span> Comportamental <span class="muted small" style="font-weight:500">(seus hábitos → onde ajustar)</span></h3>
        <span class="spacer"></span>
        <button class="btn btn-ia btn-sm" data-action="analisar-comport" data-tip="O Mentor lê seus horários, sua constância e o que anda esquecido, e sugere ajustes de rotina.">${icone("sparkles")} Analisar meus hábitos</button>
      </div>
      <div id="comport-slot"><p class="muted small" style="margin:2px 0 0">O Mentor analisa quando você rende mais, sua regularidade e as disciplinas esquecidas. Clique para gerar (usa a IA conectada).</p></div>
    </section>

    <section class="scorecard stagger" data-print="kpis" data-print-label="Indicadores (cobertura, aproveitamento, prova)">
      <div class="sc-pilar">
        <span class="kpi-ico">${icone("list-checks")}</span>
        <span class="sc-num" ${coberturaGeral === null || !kpiAnima ? "" : `data-count="${coberturaGeral}" data-suf="%"`}>${coberturaGeral === null ? "—" : coberturaGeral + "%"}</span>
        <span class="sc-rot">Cobertura do edital ${defMetrica("cobertura")}</span>
      </div>
      <div class="sc-pilar">
        <span class="kpi-ico">${icone("target")}</span>
        <span class="sc-num ${perfClasse(store, diag.percentGeral)}" ${diag.percentGeral === null || !kpiAnima ? "" : `data-count="${diag.percentGeral}" data-suf="%"`}>${diag.percentGeral === null ? "—" : diag.percentGeral + "%"}</span>
        <span class="sc-rot">Aproveitamento ${defMetrica("aproveitamento")}</span>
      </div>
      <div class="sc-pilar" data-tip="Tempo em foco nos últimos 7 dias.">
        <span class="kpi-ico">${icone("clock-3")}</span>
        <span class="sc-num">${fmtTempoCurto(semanaSeg)}</span>
        <span class="sc-rot">Na semana</span>
      </div>
      <div class="sc-prova">
        ${
          m.dataProva
            ? m.diasProva >= 0
              ? `<span class="kpi-ico">${icone("calendar-days")}</span><span class="sc-num" ${kpiAnima ? `data-count="${m.diasProva}"` : ""}>${m.diasProva}</span><span class="sc-rot">${m.diasProva === 1 ? "dia" : "dias"} até a prova · ${fmtData(m.dataProva)}</span>`
              : `<span class="kpi-ico">${icone("calendar-days")}</span><span class="sc-rot">Prova em ${fmtData(m.dataProva)} já passou</span>`
            : `<span class="kpi-ico">${icone("calendar-days")}</span><span class="sc-rot muted">Defina a data da prova em <b>Configurações</b></span>`
        }
      </div>
    </section>

    <section class="card metas-card" data-print="metas" data-print-label="Metas">
      <div class="plano-h"><h2>${icone("target")} Metas</h2></div>
      ${barraMeta("Hoje", m.feitoHojeMin, m.metaDiariaMin)}
      ${barraMeta("Esta semana", m.feitoSemanaMin, m.metaSemanalMin)}
      ${barraMeta("Este mês", m.feitoMesMin, m.metaMensalMin)}
      ${
        m.dispDiariaMin
          ? `<p class="muted small disp-info">Disponibilidade: <b>${fmtMin(m.dispDiariaMin)}</b>/dia · ${fmtMin(m.dispSemanaMin)}/semana${m.dispAteProvaMin != null ? ` · ~${Math.round(m.dispAteProvaMin / 60)}h até a prova` : ""}.</p>`
          : !(m.metaDiariaMin || m.metaSemanalMin || m.metaMensalMin)
          ? `<p class="muted small">Defina suas metas em <b>Configurações</b>.</p>`
          : ""
      }
    </section>

    <details class="bloco-recolhe" id="stats-det" data-print="stats" data-print-label="Estatísticas detalhadas (gráficos + por disciplina)" ${statsDetAbertas ? "open" : ""}>
      <summary><span class="sum-tit">${icone("bar-chart-3")} Estatísticas detalhadas</span><span class="sum-dica muted small">gráficos e desempenho por disciplina</span></summary>
      <div class="card card-plano">
        <h3>${icone("trending-up")} Gráficos</h3>
        <div class="graficos-grid">
          <div class="grafico-bloco">
            <div class="grafico-tit-linha">
              <h4 class="grafico-tit">Evolução por disciplina <span class="muted small">cobertura × aproveitamento</span></h4>
              <button class="lnk" data-action="ampliar-disc" data-tip="Ver o gráfico ampliado">${icone("maximize-2")} Ampliar</button>
            </div>
            ${graficoDisciplinas(diag.porDisciplina)}
          </div>
          <div class="grafico-bloco">
            <div class="grafico-tit-linha">
              <h4 class="grafico-tit">Desempenho histórico <span class="muted small">tempo em foco (últimos ${histPeriodo} dias)</span></h4>
              <span class="grafico-tit-acoes">
                <select id="hist-periodo" class="hist-periodo-sel" data-tip="Janela do gráfico de histórico">
                  ${[7, 14, 30, 90].map((n) => `<option value="${n}" ${histPeriodo === n ? "selected" : ""}>${n} dias</option>`).join("")}
                </select>
                <button class="lnk" data-action="ampliar-hist" data-tip="Ver o gráfico ampliado">${icone("maximize-2")} Ampliar</button>
              </span>
            </div>
            ${graficoHistorico(hist.porDia, histPeriodo)}
          </div>
          <div class="grafico-bloco">
            <h4 class="grafico-tit">Para onde vai seu tempo <span class="muted small">distribuição por etapa</span></h4>
            ${graficoTempoPizza(hist.tempoFase)}
          </div>
        </div>
        ${pontosFracosHTML(store, diag.porDisciplina)}
        <h3 style="margin-top:20px">${icone("library")} Por disciplina <span class="muted small" data-tip="Clique numa disciplina para abrir o painel: KPIs, semáforo por tópico e análise do Mentor.">${icone("info")}</span></h3>
        ${
          diag.porDisciplina.length
            ? `<div class="disc-grid stagger">${diag.porDisciplina.map((l) => cardDisciplina(l, store)).join("")}</div>
              <p class="diag-totais muted small">${diag.totalTentativas} questões resolvidas no total · ${fmtTempo(diag.tempoTotalSeg)} em foco.</p>`
            : vazio("Nenhuma disciplina ainda\nCadastre disciplinas e tópicos no Edital para acompanhar o desempenho.", "", icone("library"))
        }
      </div>
    </details>

    <section class="card" data-print="periodo" data-print-label="Por período">
      <div class="plano-h"><h2>${icone("bar-chart-3")} Por período</h2><span class="muted small" data-tip="Clique em um período para filtrar as sessões abaixo.">${icone("info")}</span></div>
      <div class="periodos-grid">
        ${periodoBtn("hoje", "Hoje", hist.periodos.hoje)}
        ${periodoBtn("semana", "Últimos 7 dias", hist.periodos.semana)}
        ${periodoBtn("mes", "Mês atual", hist.periodos.mes)}
        ${periodoBtn("tudo", "Todo o período", hist.periodos.tudo)}
      </div>
    </section>

    <details class="bloco-recolhe" data-print="calendario" data-print-label="Calendário" open>
      <summary><span class="sum-tit">${icone("calendar-days")} Calendário</span><span class="sum-dica muted small">recolher/expandir</span></summary>
      <div class="plano-grid plano-grid-flat">
        <section class="card card-plano">
          <h3>${icone("calendar-days")} Calendário <span class="muted small" data-tip="Clique em um dia para ver as sessões.">${icone("info")}</span></h3>
          ${calendarioHTML(store)}
        </section>
      </div>
    </details>

    <section class="card" id="sess-sec" data-print="sessoes" data-print-label="Histórico de sessões">
      <div class="plano-h" style="margin-bottom:10px">
        <h2>${icone("clock-3")} ${esc(tituloSessoes)}</h2>
        <span class="cnt" id="sess-count">${plural(sessoesFiltradas.length, "sessão", "sessões")}</span>
        ${diaSel ? `<button class="btn btn-ghost btn-sm" data-action="limpar-dia">← Voltar ao período</button>` : ""}
        <span class="sp"></span>
        <button class="btn btn-ghost btn-sm ${sessFiltrosAbertos || nCatFiltros ? "on" : ""}" data-action="sess-filtros-toggle" data-tip="Filtrar por data, fase, disciplina, tópico ou observação.">${icone("list-filter")} Filtros${nCatFiltros ? ` <span class="cnt">${nCatFiltros}</span>` : ""}</button>
      </div>
      ${sessChipsHTML(st)}
      ${sessPainelHTML(st)}
      ${
        sessoesFiltradas.length
          ? `<table class="tabela tabela-sessoes">
              <thead><tr>
                ${thSort("data", "Data")}
                ${thSort("fase", "Fase")}
                ${thSort("disciplina", "Disciplina")}
                ${thSort("topico", "Tópico")}
                ${thSort("tempo", "Tempo", " num")}
                <th class="num">Páginas</th>
                ${thSort("questoes", "Questões", " num")}
                <th>Observação</th>
                <th class="th-acoes"></th>
              </tr></thead>
              <tbody>${sessoesFiltradas.map((s) => linhaSessao(s, st, sessEdit.has(s.id))).join("")}</tbody>
            </table>`
          : todasSessoes.length
          ? vazio("Nenhuma sessão neste filtro\nAjuste o período, o dia ou os filtros acima.", "", icone("search"))
          : vazio("Ainda sem sessões registradas\nRegistre estudo no Hoje e seu progresso aparece aqui.", "", icone("clipboard-list"))
      }
    </section>

    <section class="card diag-sugestoes">
      <div class="plano-h"><h2>${icone("lightbulb")} Sugestões</h2></div>
      ${diag.sugestoes.length ? `<ul>${diag.sugestoes.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : `<p class="muted small">Sem alertas no momento. Continue o ciclo.</p>`}
      <button class="btn btn-ghost btn-sm" data-action="ir-mentor" data-tip="Ver o plano completo e aplicar ações sugeridas pela IA.">${icone("compass")} Abrir o Mentor IA</button>
    </section>

    ${
      observacoes.length
        ? `<details class="bloco-recolhe">
            <summary><span class="sum-tit">${icone("message-square")} Últimas observações</span><span class="sum-dica muted small">o que você anotou nas sessões</span></summary>
            <div class="card card-plano">
              <ul class="obs-lista">
                ${observacoes
                  .map(
                    (o) => `<li class="obs-item">
                      <span class="obs-meta muted small">${fmtData(o.data)}${o.disciplinaNome ? " · " + esc(o.disciplinaNome) : ""}${o.topicoNome ? " · " + esc(o.topicoNome) : ""}</span>
                      <span class="obs-texto">${esc(o.comentario)}</span>
                    </li>`
                  )
                  .join("")}
              </ul>
              <p class="muted small">O assistente inteligente (chat) também usa estas anotações.</p>
            </div>
          </details>`
        : ""
    }`;

  focarItem(root, focoSess);

  // Rola até a lista de sessões após trocar período/dia. Feito DENTRO do render (duplo
  // rAF) para rodar depois da restauração de rolagem do main.js.
  if (rolarParaSessoes) {
    rolarParaSessoes = false;
    const irParaSessoes = () => {
      const sec = root.querySelector("#sess-sec");
      if (!sec) return;
      sec.scrollIntoView({ behavior: "smooth", block: "start" });
      // destaque breve para deixar claro que chegou nas Sessões
      sec.classList.remove("flash-destaque");
      void sec.offsetWidth; // reinicia a animação
      sec.classList.add("flash-destaque");
    };
    // Roda depois da restauração de rolagem do main.js (duplo rAF + um reforço atrasado p/ vencer a corrida).
    requestAnimationFrame(() => requestAnimationFrame(irParaSessoes));
    setTimeout(irParaSessoes, 160);
  }

  bindActions(root, {
    "analisar-comport": async (el) => {
      if (!_iaOn(st.config)) return toast("Conecte uma IA em Configurações para a análise comportamental.", "erro");
      // Snapshot de hábitos a partir das sessões (só dados locais).
      const sess = st.sessoes || [];
      if (sess.length < 3) return toast("Registre algumas sessões primeiro — preciso de dados para analisar.", "erro");
      const porHora = {};
      const porDiaSem = [0, 0, 0, 0, 0, 0, 0];
      const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
      let comHora = 0;
      for (const x of sess) {
        const iso = x.data || "";
        const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
        if (a) porDiaSem[new Date(a, m - 1, d).getDay()] += x.tempoSeg || 0;
        const hm = iso.slice(11, 13);
        if (hm) { porHora[hm] = (porHora[hm] || 0) + (x.tempoSeg || 0); comHora++; }
      }
      const topHora = Object.entries(porHora).sort((x, y) => y[1] - x[1])[0];
      const melhorDia = porDiaSem.map((v, i) => [i, v]).sort((x, y) => y[1] - x[1])[0];
      const piorDia = porDiaSem.map((v, i) => [i, v]).sort((x, y) => x[1] - y[1])[0];
      const diag2 = store.diagnostico();
      const negligenciadas = diag2.porDisciplina
        .filter((l) => l.totalTopicos > 0)
        .sort((x, y) => x.tempoSeg - y.tempoSeg)
        .slice(0, 3)
        .map((l) => l.disciplina.nome);
      const of = store.ofensiva();
      const pergunta =
        "Você é meu mentor de estudos. Analise MEUS HÁBITOS (dados reais, sem markdown) em 3-5 frases diretas: quando eu rendo mais, minha regularidade e o que ajustar na rotina.\n" +
        (comHora && topHora ? `Estudo mais por volta das ${topHora[0]}h. ` : "Raramente registro o horário. ") +
        `Dia mais forte: ${DIAS[melhorDia[0]]}; mais fraco: ${DIAS[piorDia[0]]}. ` +
        `Ofensiva atual: ${plural(of.atual, "dia", "dias")} (recorde ${of.recorde}). ` +
        (negligenciadas.length ? `Disciplinas com menos tempo: ${negligenciadas.join(", ")}.` : "");
      el.disabled = true;
      el.classList.add("is-generating");
      el.textContent = "Analisando…";
      // Esqueleto "nascendo" durante a espera (em vez de tela parada).
      root.querySelector("#comport-slot").innerHTML = `<div class="ai-frame ddx-analise">${skeletonDoc(4)}</div>`;
      try {
        const r = await _responderChat(st.config, { pergunta, fontes: [], web: false });
        const slot = root.querySelector("#comport-slot");
        slot.innerHTML = '<div class="ai-frame ddx-analise"><p class="ddx-analise-txt"></p><p class="muted small" style="margin:6px 0 0">Análise de hábitos do Mentor — baseada nas suas sessões.</p></div>';
        revelarTexto(slot.querySelector(".ddx-analise-txt"), (r.texto || "").trim());
        el.disabled = false; el.classList.remove("is-generating"); el.innerHTML = `${icone("refresh-cw")} Reanalisar`;
      } catch (e) {
        toast("Não consegui analisar agora: " + e.message, "erro");
        el.disabled = false; el.classList.remove("is-generating"); el.innerHTML = `${icone("sparkles")} Analisar meus hábitos`;
      }
    },
    "ampliar-disc": () => abrirJanela({
      titulo: "Evolução por disciplina",
      telaCheia: true,
      corpoHTML: `<div class="grafico-ampliado">${graficoDisciplinas(store.diagnostico().porDisciplina)}</div>`,
    }),
    "ampliar-hist": () => {
      const jp = Number(store.get().config.histPeriodo) || 14;
      abrirJanela({
        titulo: `Desempenho histórico (últimos ${jp} dias)`,
        telaCheia: true,
        corpoHTML: `<div class="grafico-ampliado">${graficoHistorico(store.historico(jp).porDia, jp)}</div>`,
      });
    },
    // Impressão SELECIONÁVEL: o usuário escolhe quais seções da página entram no PDF/impressão.
    "abrir-imprimir-acomp": () => {
      const secoes = [...root.querySelectorAll("[data-print]")];
      if (!secoes.length) return;
      const itens = secoes
        .map(
          (s) =>
            `<label class="imp-sec"><input type="checkbox" class="imp-chk" value="${s.getAttribute("data-print")}" checked /> ${esc(s.getAttribute("data-print-label") || s.getAttribute("data-print"))}</label>`
        )
        .join("");
      abrirJanela({
        titulo: "Imprimir acompanhamento",
        corpoHTML: `
          <p class="muted small" style="margin:0 0 10px">Escolha o que imprimir desta página:</p>
          <div class="imp-lista">${itens}</div>
          <div class="barra-acoes" style="margin-top:16px">
            <button class="btn btn-ghost btn-sm imp-toggle">Marcar/desmarcar todos</button>
            <span class="spacer"></span>
            <button class="btn btn-primary btn-sm imp-go">${icone("printer")} Imprimir</button>
          </div>`,
        aoMontar: (overlay, fechar) => {
          overlay.querySelector(".imp-toggle").addEventListener("click", () => {
            const chks = [...overlay.querySelectorAll(".imp-chk")];
            const todos = chks.every((c) => c.checked);
            chks.forEach((c) => (c.checked = !todos));
          });
          overlay.querySelector(".imp-go").addEventListener("click", () => {
            const escolhidas = [...overlay.querySelectorAll(".imp-chk:checked")].map((c) => c.value);
            if (!escolhidas.length) return toast("Selecione ao menos uma seção.", "erro");
            const html = escolhidas
              .map((key) => {
                const orig = root.querySelector(`[data-print="${key}"]`);
                if (!orig) return "";
                const clone = orig.cloneNode(true);
                clone.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""));
                // tira controles que não fazem sentido no papel (ampliar, filtros)
                clone.querySelectorAll('.grafico-tit-acoes, [data-action="ampliar-disc"], [data-action="ampliar-hist"]').forEach((el) => el.remove());
                return `<section class="print-sec">${clone.innerHTML}</section>`;
              })
              .join('<hr class="print-sep"/>');
            imprimir("Acompanhamento", html);
            fechar();
          });
        },
      });
    },
    "ir-mentor": () => app.navigate("mentor"),
    "disc-edital": (el) => app.navigate("edital", { focoDisciplinaId: el.getAttribute("data-id") }),
    "disc-painel": (el) => app.navigate("edital", { dossieDiscId: el.getAttribute("data-id") }),
    periodo: (el) => {
      periodoSel = el.getAttribute("data-p");
      diaSel = null;
      sessFiltroIni = "";
      sessFiltroFim = "";
      rolarParaSessoes = true;
      app.refresh();
    },
    "limpar-dia": () => {
      diaSel = null;
      app.refresh();
    },
    "mes-prev": () => {
      mesCal = deslocaMes(mesCal, -1);
      app.refresh();
    },
    "mes-next": () => {
      mesCal = deslocaMes(mesCal, 1);
      app.refresh();
    },
    "mes-hoje": () => {
      mesCal = todayISO().slice(0, 7);
      app.refresh();
    },
    dia: (el) => {
      const d = el.getAttribute("data-dia");
      diaSel = diaSel === d ? null : d;
      sessFiltroIni = "";
      sessFiltroFim = "";
      if (diaSel) rolarParaSessoes = true;
      app.refresh();
    },
    "toggle-disc": (el) => {
      const id = el.getAttribute("data-id");
      if (discAberta.has(id)) discAberta.delete(id);
      else discAberta.add(id);
      app.refresh();
    },
    "sort-sessao": (el) => {
      const col = el.getAttribute("data-col");
      if (sessaoSort.col === col) sessaoSort.dir = sessaoSort.dir === "asc" ? "desc" : "asc";
      else sessaoSort = { col, dir: col === "data" || col === "tempo" || col === "questoes" ? "desc" : "asc" };
      app.refresh();
    },
    "edit-sessao": (el) => {
      sessEdit.add(el.getAttribute("data-id"));
      app.refresh();
    },
    "cancelar-sessao": (el) => {
      sessEdit.delete(el.getAttribute("data-id"));
      app.refresh();
    },
    "salvar-sessao": (el) => {
      const id = el.getAttribute("data-id");
      const data = root.querySelector(`.se-data[data-id="${id}"]`)?.value || null;
      const fase = root.querySelector(`.se-fase[data-id="${id}"]`)?.value;
      const topicoId = root.querySelector(`.se-top[data-id="${id}"]`)?.value || null;
      const min = parseInt(root.querySelector(`.se-min[data-id="${id}"]`)?.value, 10) || 0;
      let ac = parseInt(root.querySelector(`.se-ac[data-id="${id}"]`)?.value, 10) || 0;
      const tot = parseInt(root.querySelector(`.se-tot[data-id="${id}"]`)?.value, 10) || 0;
      if (ac > tot) ac = tot;
      const comentario = root.querySelector(`.se-obs[data-id="${id}"]`)?.value || "";
      const missaoId = root.querySelector(`.se-missao[data-id="${id}"]`)?.value || null;
      store.editarSessao(id, { data, fase, topicoId, tempoSeg: min * 60, qAcertos: ac, qErros: Math.max(0, tot - ac), comentario, missaoId });
      sessEdit.delete(id);
      toast("Sessão atualizada.");
    },
    "del-sessao": async (el) => {
      if (await confirmar("Apagar esta sessão? (não afeta as questões resolvidas na Prática)")) {
        store.removerSessao(el.getAttribute("data-id"));
        toast("Sessão apagada.");
      }
    },
    "sess-filtros-toggle": () => {
      sessFiltrosAbertos = !sessFiltrosAbertos;
      app.refresh();
    },
    "sess-limpar-tudo": () => {
      sessFiltroDisc = "";
      sessFiltroFase = "";
      sessFiltroTop = "";
      sessFiltroIni = "";
      sessFiltroFim = "";
      sessFiltroObs = "";
      periodoSel = "tudo";
      diaSel = null;
      app.refresh();
    },
    "sess-chip-remover": (el) => {
      const tipo = el.getAttribute("data-tipo");
      if (tipo === "data") { sessFiltroIni = ""; sessFiltroFim = ""; }
      else if (tipo === "dia") diaSel = null;
      else if (tipo === "periodo") periodoSel = "tudo";
      else if (tipo === "disc") { sessFiltroDisc = ""; sessFiltroTop = ""; }
      else if (tipo === "fase") sessFiltroFase = "";
      else if (tipo === "top") sessFiltroTop = "";
      else if (tipo === "obs") sessFiltroObs = "";
      app.refresh();
    },
  });

  root.querySelector("#stats-det")?.addEventListener("toggle", (e) => {
    statsDetAbertas = e.target.open;
  });

  root.querySelector("#hist-periodo")?.addEventListener("change", (e) => {
    store.setConfig({ histPeriodo: Number(e.target.value) || 14 });
    app.refresh();
  });

  // Filtros do histórico de sessões (selects/datas do painel + busca com foco preservado).
  root.querySelector("#sess-f-disc")?.addEventListener("change", (e) => {
    sessFiltroDisc = e.target.value;
    // Se o tópico selecionado não pertence à nova disciplina, limpa.
    if (sessFiltroDisc && sessFiltroTop) {
      const t = st.topicos.find((x) => x.id === sessFiltroTop);
      if (!t || t.disciplinaId !== sessFiltroDisc) sessFiltroTop = "";
    }
    app.refresh();
  });
  root.querySelector("#sess-f-top")?.addEventListener("change", (e) => {
    sessFiltroTop = e.target.value;
    app.refresh();
  });
  root.querySelector("#sess-f-fase")?.addEventListener("change", (e) => {
    sessFiltroFase = e.target.value;
    app.refresh();
  });
  root.querySelector("#sess-f-ini")?.addEventListener("change", (e) => {
    sessFiltroIni = e.target.value;
    periodoSel = "tudo";
    diaSel = null;
    app.refresh();
  });
  root.querySelector("#sess-f-fim")?.addEventListener("change", (e) => {
    sessFiltroFim = e.target.value;
    periodoSel = "tudo";
    diaSel = null;
    app.refresh();
  });
  // Busca na observação: atualiza SÓ o corpo da tabela + contagem (não re-renderiza, preserva o foco/cursor).
  root.querySelector("#sess-busca")?.addEventListener("input", (e) => {
    sessFiltroObs = e.target.value;
    const { sessoesFiltradas: ss } = filtrarSessoes(store);
    const tbody = root.querySelector(".tabela-sessoes tbody");
    if (tbody)
      tbody.innerHTML = ss.length
        ? ss.map((s) => linhaSessao(s, st, sessEdit.has(s.id))).join("")
        : `<tr><td colspan="9" class="muted small" style="text-align:center;padding:14px">Nenhuma sessão com esse texto.</td></tr>`;
    const cnt = root.querySelector("#sess-count");
    if (cnt) cnt.textContent = plural(ss.length, "sessão", "sessões");
  });
}

// ----- período (botão clicável) -----
function periodoBtn(id, rotulo, p) {
  const ativo = periodoSel === id && !diaSel;
  return `
    <button class="periodo-card ${ativo ? "ativo" : ""}" data-action="periodo" data-p="${id}">
      <div class="periodo-rotulo">${esc(rotulo)}</div>
      <div class="periodo-tempo">${fmtTempoCurto(p.tempoSeg)}</div>
      <div class="periodo-detalhe">
        <span>${p.sessoes} sessões · ${p.paginas} págs.</span>
        <span>${p.questoesTotal} questões${p.percent !== null ? ` · ${p.percent}%` : ""}</span>
      </div>
    </button>`;
}

// ----- calendário mensal -----
function calendarioHTML(store) {
  const [ano, mes] = mesCal.split("-").map(Number);
  const primeiroDia = new Date(ano, mes - 1, 1).getDay();
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const nomeMesRaw = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const nomeMes = nomeMesRaw.charAt(0).toUpperCase() + nomeMesRaw.slice(1); // "Junho de 2026"
  const dados = store.calendarioMes(mesCal);
  const hoje = todayISO();
  const maxTempo = Math.max(1, ...Object.values(dados).map((x) => x.tempoSeg));
  const totalMesSeg = Object.values(dados).reduce((a, x) => a + x.tempoSeg, 0);
  const totalMesSess = Object.values(dados).reduce((a, x) => a + x.sessoes, 0);

  let celulas = "";
  for (let i = 0; i < primeiroDia; i++) celulas += `<div class="cal-vazio"></div>`;
  for (let d = 1; d <= diasNoMes; d++) {
    const diaISO = `${ano}-${pad2(mes)}-${pad2(d)}`;
    const reg = dados[diaISO];
    const ehHoje = diaISO === hoje;
    const sel = diaISO === diaSel;
    const intensidade = reg ? 0.25 + 0.55 * (reg.tempoSeg / maxTempo) : 0;
    const estilo = reg ? `style="--int:${intensidade.toFixed(2)}"` : "";
    celulas += `
      <button class="cal-dia ${reg ? "tem" : ""} ${ehHoje ? "hoje" : ""} ${sel ? "sel" : ""}" data-action="dia" data-dia="${diaISO}" ${estilo} title="${reg ? `${plural(reg.sessoes, "sessão", "sessões")} · ${fmtTempo(reg.tempoSeg)}` : "sem registros"}">
        <span class="cal-num">${d}</span>
        ${reg ? `<span class="cal-min">${fmtMin(reg.tempoSeg / 60)}</span>` : ""}
      </button>`;
  }

  return `
    <div class="cal-head">
      <button class="btn btn-ghost btn-sm" data-action="mes-prev" data-tip="Mês anterior">${icone("chevron-left")}</button>
      <div class="cal-mes">${esc(nomeMes)}</div>
      <button class="btn btn-ghost btn-sm" data-action="mes-next" data-tip="Próximo mês">${icone("chevron-right")}</button>
      <button class="btn btn-ghost btn-sm" data-action="mes-hoje" data-tip="Voltar ao mês atual">hoje</button>
    </div>
    <div class="cal-grid cal-semana">${SEMANA.map((s) => `<div class="cal-wd">${s}</div>`).join("")}</div>
    <div class="cal-grid">${celulas}</div>
    <div class="cal-total">Total do mês: <b>${fmtMin(totalMesSeg / 60)}</b> <span class="muted">· ${plural(totalMesSess, "sessão", "sessões")}</span></div>`;
}

function deslocaMes(mesISO, delta) {
  let [ano, mes] = mesISO.split("-").map(Number);
  mes += delta;
  if (mes < 1) {
    mes = 12;
    ano -= 1;
  } else if (mes > 12) {
    mes = 1;
    ano += 1;
  }
  return `${ano}-${pad2(mes)}`;
}

// ----- ordenação da tabela de sessões -----
function aprovSessao(s) {
  const t = s.qAcertos + s.qErros;
  return t ? s.qAcertos / t : -1; // sessões sem questões vão para o fim
}
function ordenarSessoes(lista, sort) {
  const dir = sort.dir === "asc" ? 1 : -1;
  const chaves = {
    data: (s) => s.data,
    fase: (s) => ORDEM_FASES.indexOf(s.fase),
    disciplina: (s) => (s.disciplinaNome || "").toLowerCase(),
    topico: (s) => (s.topicoNome || "").toLowerCase(),
    tempo: (s) => s.tempoSeg || 0,
    questoes: (s) => aprovSessao(s),
  };
  const key = chaves[sort.col] || chaves.data;
  return [...lista].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const cmp = typeof ka === "string" ? ka.localeCompare(kb, "pt-BR") : ka - kb;
    return cmp * dir;
  });
}
// Cabeçalho clicável com indicador de seta (▲/▼) ao lado do nome.
function thSort(col, label, extra = "") {
  const ativo = sessaoSort.col === col;
  const cls = `sortavel${extra}${ativo ? " ativo " + sessaoSort.dir : ""}`;
  return `<th class="${cls}" data-action="sort-sessao" data-col="${col}" data-tip="Ordenar por ${label.toLowerCase()}">
    <span class="th-in"><span>${label}</span><span class="sort-ar"><b class="up">${icone("chevron-up")}</b><b class="down">${icone("chevron-down")}</b></span></span>
  </th>`;
}

// ----- linha de sessão (+ edição inline) -----
function linhaSessao(s, st, editando) {
  const traco = `<span class="cel-vazia">–</span>`;
  const tq = s.qAcertos + s.qErros;
  const q = tq ? `${s.qAcertos}/${tq} (${Math.round((s.qAcertos / tq) * 100)}%)` : traco;
  const fi = FASES[s.fase];
  const cor = fi ? fi.cor : "#94a3b8";
  const faseTd = fi ? esc(fi.nome) : esc(s.fase);
  const discTd = s.disciplinaNome && s.disciplinaNome !== "—" ? esc(s.disciplinaNome) : traco;
  const topTd = s.topicoNome && s.topicoNome !== "—" ? esc(s.topicoNome) : traco;
  const pagTd = s.paginaInicial && s.paginaFinal ? `${s.paginaInicial}–${s.paginaFinal} (${s.paginas})` : s.paginas ? `${s.paginas}` : traco;
  const obsTd = s.comentario
    ? `<span class="sess-obs" data-tip="${esc(s.comentario)}">${icone("message-square")} ${esc(s.comentario.length > 40 ? s.comentario.slice(0, 40) + "…" : s.comentario)}</span>`
    : traco;
  const linha = `<tr class="sess-row" style="--cor:${cor}" data-foco-id="${s.id}">
    <td>${fmtData(s.data)}</td>
    <td>${faseTd}</td>
    <td>${discTd}</td>
    <td>${topTd}</td>
    <td class="num">${fmtTempoCurto(s.tempoSeg)}</td>
    <td class="num">${pagTd}</td>
    <td class="num">${q}</td>
    <td>${obsTd}</td>
    <td class="sess-acoes">
      <button class="mover-btn" data-action="edit-sessao" data-id="${s.id}" data-tip-pos="cima-dir" data-tip="Editar sessão">${icone("square-pen")}</button>
      <button class="mover-btn mover-del" data-action="del-sessao" data-id="${s.id}" data-tip-pos="cima-dir" data-tip="Remover sessão">${icone("x")}</button>
    </td>
  </tr>`;
  if (!editando) return linha;

  const topOpts =
    `<option value="">— sem tópico —</option>` +
    st.topicos.map((t) => `<option value="${t.id}" ${t.id === s.topicoId ? "selected" : ""}>${esc(rotuloTopico(st, t))}</option>`).join("");
  const faseOpts = ORDEM_FASES.map((f) => `<option value="${f}" ${f === s.fase ? "selected" : ""}>${FASES[f].nome}</option>`).join("");
  const form = `<tr class="sess-edit-row"><td colspan="9">
    <div class="sess-edit">
      <label class="inline">Data <input type="date" class="se-data" data-id="${s.id}" value="${s.data.slice(0, 10)}" /></label>
      <label class="inline">Fase <select class="se-fase" data-id="${s.id}">${faseOpts}</select></label>
      <label class="inline">Tópico <select class="se-top" data-id="${s.id}">${topOpts}</select></label>
      <label class="inline">Minutos <input type="number" min="0" max="1440" class="se-min" data-id="${s.id}" value="${Math.round((s.tempoSeg || 0) / 60)}" /></label>
      <label class="inline">Certas <input type="number" min="0" max="9999" class="se-ac" data-id="${s.id}" value="${s.qAcertos || 0}" /></label>
      <label class="inline">Total <input type="number" min="0" max="9999" class="se-tot" data-id="${s.id}" value="${tq}" /></label>
      <label class="inline">Observação <input type="text" class="se-obs" data-id="${s.id}" value="${esc(s.comentario || "")}" /></label>
      <label class="inline">Tarefa <select class="se-missao" data-id="${s.id}">${opcoesMissaoSessao(st, s.missaoId)}</select></label>
      <button class="btn btn-ghost btn-sm" data-action="cancelar-sessao" data-id="${s.id}">Cancelar</button>
      <button class="btn btn-primary btn-sm" data-action="salvar-sessao" data-id="${s.id}">Salvar</button>
    </div>
  </td></tr>`;
  return linha + form;
}

function rotuloTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
// Opções de tarefa para vincular a uma sessão: pendentes + a já vinculada (mesmo concluída).
function opcoesMissaoSessao(st, sel) {
  const lista = st.missoes.filter((m) => !m.concluida || m.id === sel);
  return (
    `<option value="">— nenhuma —</option>` +
    lista
      .map((m) => {
        const t = m.topicoId ? st.topicos.find((x) => x.id === m.topicoId) : null;
        const rot = (t ? rotuloTopico(st, t) + " · " : "") + m.titulo + (m.concluida ? " (concluída)" : "");
        return `<option value="${m.id}" ${m.id === sel ? "selected" : ""}>${esc(rot)}</option>`;
      })
      .join("")
  );
}

// ----- por disciplina (expansível por tópico) -----
// Cor de semáforo do aproveitamento (anel do card): >70 verde, ≥50 âmbar, <50 vermelho.
function corAproveitamento(v) {
  if (v == null) return "var(--muted)";
  if (v >= 70) return "#16a34a";
  if (v >= 50) return "#d97706";
  return "#dc2626";
}

// Card premium por disciplina (substitui a linha de tabela). Clique → Painel da disciplina.
function cardDisciplina(l, store) {
  const aprov = l.percentAcerto;
  const cor = store.corDisciplina(l.disciplina.id);
  const anel = aprov === null
    ? `<div class="pring pring-vazio" style="width:66px;height:66px"><span class="pring-txt muted" style="font-size:var(--fs-2xs)">sem<br>questões</span></div>`
    : progressRing(aprov, { cor: corAproveitamento(aprov) });
  const ultimo = l.ultimoEstudo ? haQuantoTempo(l.ultimoEstudo) : "nunca estudado";
  return `<button class="card card-click disc-card" data-action="disc-painel" data-id="${l.disciplina.id}" data-tip="Abrir o painel da disciplina" data-tip-pos="cima">
    <div class="disc-card-top">
      <span class="disc-cor" style="background:${cor}"></span>
      <span class="disc-card-nome">${esc(l.disciplina.nome)}</span>
    </div>
    <div class="disc-card-mid">
      ${anel}
      <div class="disc-card-metas">
        <div class="disc-meta"><span class="disc-meta-lbl">Aproveitamento</span><span class="disc-meta-val">${aprov === null ? "—" : aprov + "%"}</span></div>
        <div class="disc-meta"><span class="disc-meta-lbl">Cobertura</span><span class="disc-meta-val">${l.cobertura}%</span></div>
        <div class="disc-meta"><span class="disc-meta-lbl">Tempo</span><span class="disc-meta-val">${fmtTempoCurto(l.tempoSeg)}</span></div>
      </div>
    </div>
    <div class="disc-card-foot muted small">${plural(l.topicos.length, "tópico", "tópicos")} · ${ultimo}</div>
  </button>`;
}

function linhaDisciplina(l, store) {
  const aberta = discAberta.has(l.disciplina.id);
  const aprov = l.percentAcerto;
  const aprovTxt =
    aprov === null
      ? `<span class="muted">sem questões</span>`
      : `${barra(aprov, `<span class="${perfClasse(store, aprov)}">${aprov}%</span>`)}`;
  const ultimo = l.ultimoEstudo
    ? `${fmtData(l.ultimoEstudo)} <span class="muted">(${haQuantoTempo(l.ultimoEstudo)})</span>`
    : `<span class="muted">nunca</span>`;

  let linhas = `<tr class="disc-row" data-action="toggle-disc" data-id="${l.disciplina.id}">
    <td><span class="disc-toggle">${aberta ? icone("chevron-down") : icone("chevron-right")}</span> <span class="disc-cor" style="background:${store.corDisciplina(l.disciplina.id)}"></span> ${esc(l.disciplina.nome)} <button class="disc-ir-edital" data-action="disc-painel" data-id="${l.disciplina.id}" data-tip="Painel da disciplina: KPIs, semáforo por tópico e análise do Mentor." data-tip-pos="cima-dir" aria-label="Painel da disciplina">${icone("table")}</button> <button class="disc-ir-edital" data-action="disc-edital" data-id="${l.disciplina.id}" data-tip="Abrir no Edital" data-tip-pos="cima-dir" aria-label="Abrir no Edital">${icone("external-link")}</button></td>
    <td><div class="cel-barra">${aprovTxt}</div></td>
    <td><div class="cel-barra">${barra(l.cobertura, `${l.cobertura}%`)}</div></td>
    <td>${fmtTempoCurto(l.tempoSeg)}</td>
    <td>${ultimo}</td>
  </tr>`;

  if (aberta) {
    linhas += l.topicos.length
      ? l.topicos
          .map(
            (t) => `<tr class="topico-row">
        <td class="topico-nome">${icone("corner-down-right")} ${esc(t.nome)}</td>
        <td colspan="2" class="muted">—</td>
        <td>${fmtTempoCurto(t.tempoSeg)}</td>
        <td>${t.ultimoEstudo ? `${fmtData(t.ultimoEstudo)} <span class="muted">(${haQuantoTempo(t.ultimoEstudo)})</span>` : `<span class="muted">nunca</span>`}</td>
      </tr>`
          )
          .join("")
      : `<tr class="topico-row"><td colspan="5" class="muted">Sem tópicos.</td></tr>`;
  }
  return linhas;
}

function barra(v, txt) {
  const cor = v >= 70 ? "bom" : v >= 50 ? "medio" : "ruim";
  return `<div class="barra"><div class="barra-fill ${cor}" style="width:${v}%"></div></div><span class="barra-num">${txt}</span>`;
}

function barraMeta(label, feito, meta) {
  if (!meta) {
    return `<div class="meta-linha"><span class="meta-label">${label}</span><div class="barra barra-vazia"></div><span class="barra-num">${fmtMin(feito)} <span class="muted">(sem meta)</span></span></div>`;
  }
  const pctReal = Math.round((feito / meta) * 100); // pode passar de 100%
  const pct = Math.min(100, pctReal);
  const batida = pctReal >= 100;
  const cor = batida ? "bom" : pctReal >= 60 ? "medio" : "ruim";
  return `<div class="meta-linha ${batida ? "meta-batida" : ""}">
    <span class="meta-label">${label}</span>
    <div class="barra"><div class="barra-fill ${cor}" style="width:${pct}%"></div></div>
    <span class="barra-num">${fmtMin(feito)} / ${fmtMin(meta)} <b>(${pctReal}%)</b>${batida ? ` <span class="meta-tag-ok">${icone("check")} meta batida</span>` : ""}</span>
  </div>`;
}

function cicloDistribHTML(hist) {
  const totalSess = ORDEM_FASES.reduce((a, f) => a + (hist.porFase[f] || 0), 0);
  if (!totalSess) return `<p class="muted">Nenhuma sessão registrada.</p>`;
  return ORDEM_FASES.map((f) => {
    const info = FASES[f];
    const n = hist.porFase[f] || 0;
    const pctv = Math.round((n / totalSess) * 100);
    return `
      <div class="etapa-linha">
        <span class="etapa-nome" style="color:${info.cor}">${info.nome}</span>
        <div class="barra"><div class="barra-fill" style="width:${pctv}%;background:${info.cor}"></div></div>
        <span class="barra-num">${n} (${pctv}%) · ${fmtTempoCurto(hist.tempoFase[f] || 0)}</span>
      </div>`;
  }).join("");
}

// ----- ofensiva (constância): linha discreta, sem caixa -----
function ofensivaTexto(o) {
  if (!o || !o.atual) return `<span>Comece sua ofensiva hoje.</span>`;
  const dias = `${o.atual} dia${o.atual === 1 ? "" : "s"}`;
  return `<span>Ofensiva: <b>${dias}</b> · recorde ${o.recorde}</span>`;
}

// ----- semáforo de desempenho: classe CSS a partir de store.corDesempenho() -----
function perfClasse(store, percent) {
  const cor = store.corDesempenho(percent); // "ruim" | "regular" | "bom" | null
  return cor ? `perf-${cor}` : "";
}

// ----- pontos fracos ("onde você mais erra"): até 5 piores aproveitamentos -----
function pontosFracosHTML(store, porDisciplina) {
  const fracos = (porDisciplina || [])
    .filter((l) => l.percentAcerto !== null)
    .sort((a, b) => a.percentAcerto - b.percentAcerto)
    .slice(0, 5);
  if (!fracos.length) return "";
  const itens = fracos
    .map(
      (l) => `<li class="fraco-item">
        <span class="fraco-nome">${esc(l.disciplina.nome)}</span>
        <span class="fraco-pct ${perfClasse(store, l.percentAcerto)}">${l.percentAcerto}%</span>
      </li>`
    )
    .join("");
  return `
    <h3 style="margin-top:20px">${icone("target")} Onde você mais erra <span class="muted small" data-tip="Disciplinas com pior aproveitamento (apenas as que têm questões registradas).">${icone("info")}</span></h3>
    <ul class="fracos-lista">${itens}</ul>`;
}

// ----- gráfico de rosca (donut): "para onde vai seu tempo" por etapa -----
function graficoTempoPizza(tempoFase) {
  const tf = tempoFase || {};
  const fatias = ORDEM_FASES.concat("Pl")
    .map((f) => ({ f, seg: tf[f] || 0, info: FASES[f] }))
    .filter((x) => x.seg > 0);
  const total = fatias.reduce((a, x) => a + x.seg, 0);
  if (!total) return vazio("Sem tempo registrado ainda\nRegistre estudo no Hoje para ver a distribuição por etapa.", "", icone("clock-3"));

  const cx = 80;
  const cy = 80;
  const r = 64;
  const sw = 26; // espessura da rosca
  const rInner = r - sw / 2;
  const circ = 2 * Math.PI * rInner;
  let offset = 0;
  const segs = fatias
    .map((x) => {
      const frac = x.seg / total;
      const len = frac * circ;
      const dash = `${len.toFixed(2)} ${(circ - len).toFixed(2)}`;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${rInner}" fill="none"
        stroke="${x.info.cor}" stroke-width="${sw}"
        stroke-dasharray="${dash}" stroke-dashoffset="${(-offset).toFixed(2)}"
        transform="rotate(-90 ${cx} ${cy})">
        <title>${esc(x.info.nome)}: ${fmtTempoCurto(x.seg)} (${Math.round(frac * 100)}%)</title>
      </circle>`;
      offset += len;
      return seg;
    })
    .join("");

  const legenda = fatias
    .map(
      (x) => `<span class="leg-item">
        <i class="leg-dot" style="background:${x.info.cor}"></i>${esc(x.info.nome)}
        <span class="muted">${Math.round((x.seg / total) * 100)}%</span>
      </span>`
    )
    .join("");

  return `
    <div class="donut-wrap">
      <svg viewBox="0 0 160 160" class="donut-svg" role="img" aria-label="Distribuição do tempo de estudo por etapa">
        ${segs}
        <text x="${cx}" y="${cy - 4}" class="donut-centro-num" text-anchor="middle">${fmtTempoCurto(total)}</text>
        <text x="${cx}" y="${cy + 14}" class="donut-centro-rot" text-anchor="middle">total</text>
      </svg>
      <div class="donut-legenda">${legenda}</div>
    </div>`;
}

// ----- gráficos SVG (vanilla, sem dependências) -----

// Barras horizontais: cobertura (var(--primary)) e aproveitamento (var(--accent))
// por disciplina. Usa diag.porDisciplina (cobertura 0-100; percentAcerto 0-100|null).
function graficoDisciplinas(porDisciplina) {
  const linhas = (porDisciplina || []).filter((l) => l.totalTopicos > 0 || l.cobertura > 0 || l.percentAcerto !== null);
  if (!linhas.length) return vazio("Sem dados de evolução ainda\nCadastre disciplinas e materiais para ver cobertura e aproveitamento.", "", icone("trending-up"));

  const rowH = 34; // altura por disciplina
  const padTop = 8;
  const padBottom = 22; // espaço para o eixo 0–100
  const labelW = 168; // coluna de rótulos à esquerda (cabe "DIREITO PROCESSUAL CIVIL")
  const trackW = 340; // largura útil da barra (0–100%)
  const barH = 9;
  const gap = 4; // entre as duas barras da mesma disciplina
  const W = labelW + trackW + 46;
  const H = padTop + linhas.length * rowH + padBottom;

  const barras = linhas
    .map((l, i) => {
      const y = padTop + i * rowH;
      const cob = Math.max(0, Math.min(100, l.cobertura || 0));
      const aprov = l.percentAcerto === null ? null : Math.max(0, Math.min(100, l.percentAcerto));
      const nomeCompleto = esc(l.disciplina.nome);
      const nome = esc(l.disciplina.nome.length > 26 ? l.disciplina.nome.slice(0, 25) + "…" : l.disciplina.nome);
      const yc = y + 4;
      const ya = y + 4 + barH + gap;
      const aprovBar =
        aprov === null
          ? `<text x="${labelW + 6}" y="${ya + barH - 1}" class="g-na">sem questões</text>`
          : `<rect x="${labelW}" y="${ya}" width="${(aprov / 100) * trackW}" height="${barH}" rx="3" class="g-bar-aprov"></rect>
             <text x="${labelW + (aprov / 100) * trackW + 5}" y="${ya + barH - 1}" class="g-val">${aprov}%</text>`;
      return `
        <text x="${labelW - 8}" y="${y + rowH / 2 + 1}" class="g-lbl" text-anchor="end"><title>${nomeCompleto}</title>${nome}</text>
        <rect x="${labelW}" y="${yc}" width="${trackW}" height="${barH}" rx="3" class="g-track"></rect>
        <rect x="${labelW}" y="${yc}" width="${(cob / 100) * trackW}" height="${barH}" rx="3" class="g-bar-cob"></rect>
        <text x="${labelW + (cob / 100) * trackW + 5}" y="${yc + barH - 1}" class="g-val">${cob}%</text>
        <rect x="${labelW}" y="${ya}" width="${trackW}" height="${barH}" rx="3" class="g-track"></rect>
        ${aprovBar}`;
    })
    .join("");

  const grades = [0, 25, 50, 75, 100]
    .map((p) => {
      const x = labelW + (p / 100) * trackW;
      return `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${H - padBottom}" class="g-grade"></line>
              <text x="${x}" y="${H - 6}" class="g-eixo" text-anchor="middle">${p}</text>`;
    })
    .join("");

  return `
    <div class="grafico-legenda">
      <span class="leg-item"><i class="leg-cob"></i>Cobertura</span>
      <span class="leg-item"><i class="leg-aprov"></i>Aproveitamento</span>
    </div>
    <div class="grafico-svg-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="grafico-svg" role="img" aria-label="Cobertura e aproveitamento por disciplina">
        ${grades}
        ${barras}
      </svg>
    </div>`;
}

// Série temporal real: hist.porDia[] (14 dias) com tempoSeg por dia.
// Gráfico de linha do tempo em foco; pontos marcados, eixo de datas espaçado.
function graficoHistorico(porDia, janelaDias = 14) {
  const serie = porDia || [];
  const algumDado = serie.some((d) => (d.tempoSeg || 0) > 0);
  if (!serie.length || !algumDado) return vazio("Sem histórico ainda\nRegistre estudo no Hoje para ver seu tempo em foco ao longo dos dias.", "", icone("bar-chart-3"));

  const W = 520;
  const H = 200;
  const padR = 14;
  const padTop = 14;
  const padBottom = 26;
  const maxSeg = Math.max(1, ...serie.map((d) => d.tempoSeg || 0));
  // arredonda o topo para o múltiplo de 30 min mais próximo acima (mín. 30 min)
  const maxMin = Math.max(30, Math.ceil(maxSeg / 60 / 30) * 30);
  // Margem esquerda dimensionada pelo MAIOR rótulo do eixo Y (senão o 1º dígito é cortado, ex.: "1h30min").
  const rotulosY = [0, maxMin / 2, maxMin].map(fmtMin);
  const maxLabel = Math.max(...rotulosY.map((s) => s.length));
  const padL = Math.max(40, Math.round(maxLabel * 6.4) + 12);
  const innerW = W - padL - padR;
  const innerH = H - padTop - padBottom;
  const n = serie.length;
  const xAt = (i) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (seg) => padTop + innerH - (seg / 60 / maxMin) * innerH;

  const pts = serie.map((d, i) => ({ x: xAt(i), y: yAt(d.tempoSeg || 0), d }));
  const linha = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${linha} L${pts[pts.length - 1].x.toFixed(1)},${(padTop + innerH).toFixed(1)} L${pts[0].x.toFixed(1)},${(padTop + innerH).toFixed(1)} Z`;

  // grades horizontais (0, meio, topo) com rótulo em minutos
  const niveis = [0, maxMin / 2, maxMin];
  const grades = niveis
    .map((minv) => {
      const y = yAt(minv * 60);
      return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="g-grade"></line>
              <text x="${padL - 6}" y="${(y + 3).toFixed(1)}" class="g-eixo" text-anchor="end">${fmtMin(minv)}</text>`;
    })
    .join("");

  // rótulos de data: ~5 marcas distribuídas (dd/mm)
  const passo = Math.max(1, Math.round((n - 1) / 4));
  const eixoX = serie
    .map((d, i) => {
      if (i % passo !== 0 && i !== n - 1) return "";
      const dd = d.data.slice(8, 10);
      const mm = d.data.slice(5, 7);
      return `<text x="${xAt(i).toFixed(1)}" y="${H - 8}" class="g-eixo" text-anchor="middle">${dd}/${mm}</text>`;
    })
    .join("");

  const pontos = pts
    .map(
      (p) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" class="g-ponto">
           <title>${fmtData(p.d.data)}: ${fmtMin((p.d.tempoSeg || 0) / 60)} · ${plural(p.d.sessoes, "sessão", "sessões")}</title>
         </circle>`
    )
    .join("");

  return `
    <div class="grafico-svg-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="grafico-svg" role="img" aria-label="Tempo em foco por dia nos últimos ${janelaDias} dias">
        ${grades}
        <path d="${area}" class="g-area"></path>
        <path d="${linha}" class="g-linha"></path>
        ${pontos}
        ${eixoX}
      </svg>
    </div>`;
}
