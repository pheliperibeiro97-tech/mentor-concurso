// Acompanhamento: controle das sessões por período (botões), por dia (calendário
// mensal navegável) e desempenho por disciplina/tópico (com último dia estudado).
// SEM "previsão de aprovação" (decisão do plano).
import { bindActions, header, vazio, toast, confirmar, focarItem, faixaIA, abrirJanela, imprimir, plural, defMetrica } from "../ui.js";
import { esc, fmtTempo, fmtTempoCurto, fmtMin, fmtData, todayISO, daysBetween } from "../util.js";
import { icone } from "../icones.js";
import { FASES, ORDEM_FASES } from "../ciclo.js";
import { linhaConstanciaMes, progressRing } from "../viz.js";
import { ligarTooltipsGraficos, tipAttrs } from "../chart-tooltip.js";
import { iaDisponivel as _iaOn, responderChat as _responderChat } from "../ia-provider.js";

let periodoSel = "hoje"; // hoje | semana | mes | tudo
let diaSel = null; // 'yyyy-mm-dd' quando um dia do calendário é clicado
let mesCal = null; // 'yyyy-mm' em exibição no calendário
let calFiltro = "tudo"; // filtro do calendário: "tudo" | "E" (estudo) | "A" (prática) | "R" (revisão)
let desempDisc = ""; // filtro do gráfico "Evolução do desempenho": disciplina (id) — "" = todas
let desempTop = "";  // filtro do gráfico "Evolução do desempenho": tópico (id, contextual à disciplina) — "" = todos
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
let sessAberto = false; // lembra se o bloco recolhível "Sessões" está aberto (sobrevive ao re-render)
let calDetAberto = false; // lembra se o bloco recolhível "Calendário" está aberto (sobrevive ao re-render)
let kpiAnimou = false; // count-up dos KPIs só na 1ª renderização da sessão (não re-anima a cada ação)
const sessEdit = new Set(); // ids de sessões em edição
const sessDet = new Set(); // ids de sessões com o detalhamento (materiais) aberto

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
    tituloSessoes = `Histórico de sessões · ${rotuloIntervalo()}`;
  } else if (diaSel) {
    ss = todasSessoes.filter((s) => s.data.slice(0, 10) === diaSel);
    tituloSessoes = `Histórico de sessões · ${fmtData(diaSel)}`;
  } else {
    ss = todasSessoes.filter((s) => preds[periodoSel](s.data.slice(0, 10)));
    tituloSessoes = `Histórico de sessões · ${LABEL[periodoSel]}`;
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
  // Resumo de revisões (Central de Revisões) — mostrado como card clicável.
  const revCont = store.revisoesResumoContagem();
  // Deltas vs a semana anterior (mesmo trecho da semana): direção "de relance" nos KPIs.
  const cmp = store.comparativoSemana();
  const deltaHTML = (atual, anterior, fmt, suf = "") => {
    if (atual == null || anterior == null) return "";
    const d = atual - anterior;
    if (d === 0) return `<span class="sc-delta flat" data-tip="Igual ao mesmo período da semana passada">sem mudança</span>`;
    const cls = d > 0 ? "up" : "down";
    return `<span class="sc-delta ${cls}" data-tip="Comparado ao mesmo período da semana passada">${icone(d > 0 ? "trending-up" : "trending-down")} ${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}${suf}</span>`;
  };
  // Guarda: os KPIs contam 0→N só ao ENTRAR na tela; nas re-renderizações (trocar período,
  // ordenar, filtrar) emitem o valor final estático, sem re-animar (evita o "piscar").
  const kpiAnima = !kpiAnimou;
  kpiAnimou = true;
  root.innerHTML = `
    ${header("Acompanhamento", "Sua evolução, num relance.", `${app.store && app.store.iaDisponivel() ? `<button class="btn btn-ia btn-sm" data-action="explicar-semana" data-tip="O Mentor lê seus números da semana e explica em linguagem humana o que está bom e o que ajustar.">${icone("sparkles")} Explicar minha semana</button>` : ""}<button class="btn btn-ghost btn-sm" data-action="abrir-imprimir-acomp" data-tip="Escolha o que imprimir desta página">${icone("printer")} Imprimir</button>`)}

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

    <!-- 1) VISÃO GERAL (o "num relance"): KPIs primeiro. -->
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
        ${deltaHTML(cmp.atual.pct, cmp.anterior.pct, (v) => v, "pp")}
      </div>
      <div class="sc-pilar" data-tip="Tempo em foco nos últimos 7 dias.">
        <span class="kpi-ico">${icone("clock-3")}</span>
        <span class="sc-num">${fmtTempoCurto(semanaSeg)}</span>
        <span class="sc-rot">Na semana</span>
        ${deltaHTML(cmp.atual.tempoSeg, cmp.anterior.tempoSeg, (v) => fmtTempoCurto(v))}
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

    ${metasCompactasHTML(m)}

    ${
      revCont.total
        ? `<button type="button" class="card card-click rev-resumo-card ${revCont.atrasadas ? "rev-resumo-alerta" : ""}" data-action="ir-central-revisoes" data-tip="Abrir a Central de Revisões">
            <span class="rev-resumo-ico">${icone("calendar-check")}</span>
            <div class="rev-resumo-txt">
              <div class="rev-resumo-tit">Revisões <span class="muted small">taxa de conclusão (30 dias)</span></div>
              <div class="rev-resumo-sub">${revCont.atrasadas ? `<b class="rev-resumo-atraso">${revCont.atrasadas} atrasada${revCont.atrasadas > 1 ? "s" : ""}</b> · ` : ""}${revCont.hoje} para hoje · ${revCont.total} em circulação</div>
            </div>
            <span class="rev-resumo-num ${revCont.taxaConclusao != null && revCont.taxaConclusao >= 70 ? "ok" : revCont.taxaConclusao != null && revCont.taxaConclusao < 50 ? "baixo" : ""}">${revCont.taxaConclusao == null ? "—" : revCont.taxaConclusao + "%"}</span>
            <span class="rev-resumo-ir">Ver central ${icone("arrow-right")}</span>
          </button>`
        : ""
    }

    <!-- 2) CONSTÂNCIA (assinatura, compacta e sempre visível). -->
    <section class="card constancia-card" data-print="constancia" data-print-label="Constância (heatmap)">
      <div class="plano-h" style="margin-bottom:4px">
        <h2>${icone("flame")} Constância</h2>${defMetrica("constancia")}
        <span class="sp"></span>
        <span class="chip chip-count" style="cursor:default">${ofensivaTexto(ofens)}</span>
      </div>
      <p class="muted small u-m-0 u-mt-4 u-mb-12">Cada quadrado é um dia deste mês. Dia sem registro fica neutro — selecione um dia para ver as sessões.</p>
      ${linhaConstanciaMes(store.get().sessoes, { folgaDias: store.get().config.diasFolga || [] })}
    </section>

    <!-- 2b) CALENDÁRIO (recolhível, logo abaixo da Constância). -->
    <details class="bloco-recolhe" id="cal-det" data-print="calendario" data-print-label="Calendário" ${calDetAberto ? "open" : ""}>
      <summary><span class="sum-tit">${icone("calendar-days")} Calendário</span><span class="sum-dica muted small">selecione um dia para ver as sessões</span></summary>
      <div class="card card-plano">
        <div id="cal-container">${calendarioHTML(store)}</div>
      </div>
    </details>

    <details class="bloco-recolhe" id="stats-det" data-print="stats" data-print-label="Estatísticas detalhadas (gráficos + por disciplina)" ${statsDetAbertas ? "open" : ""}>
      <summary><span class="sum-tit">${icone("bar-chart-3")} Estatísticas detalhadas</span><span class="sum-dica muted small">gráficos · por disciplina · banca · materiais · comportamento</span></summary>
      <div class="card card-plano">
        <div class="stat-sub stat-sub--top"><span class="stat-sub-tit">${icone("trending-up")} Evolução</span> <span class="muted small">esforço e desempenho no tempo</span></div>
        <!-- Ordem lógica: TEMPO/esforço (dia → semana) · composição · DESEMPENHO (acurácia → por disciplina). -->
        <div class="graficos-grid">
          <div class="grafico-bloco">
            <div class="grafico-tit-linha">
              <h4 class="grafico-tit">Tempo em foco <span class="muted small">por dia (últimos ${histPeriodo} dias)</span></h4>
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
            <div class="grafico-tit-linha">
              <h4 class="grafico-tit">Ritmo semanal <span class="muted small">horas por semana × meta</span></h4>
              <button class="lnk" data-action="ampliar-horas" data-tip="Ver o gráfico ampliado">${icone("maximize-2")} Ampliar</button>
            </div>
            ${graficoHorasSemana(store.tempoPorSemana(8), m.metaSemanalMin)}
          </div>
          <div class="grafico-bloco">
            <div class="grafico-tit-linha">
              <h4 class="grafico-tit">Para onde vai seu tempo <span class="muted small">distribuição por etapa</span></h4>
              <button class="lnk" data-action="ampliar-pizza" data-tip="Ver o gráfico ampliado">${icone("maximize-2")} Ampliar</button>
            </div>
            <div class="grafico-centro">${graficoTempoPizza(hist.tempoFase)}</div>
          </div>
          <div class="grafico-bloco">
            <div class="grafico-tit-linha">
              <h4 class="grafico-tit">Evolução do desempenho <span class="muted small">% de acerto por semana</span></h4>
              <span class="grafico-tit-acoes">
                <select id="desemp-disc" class="hist-periodo-sel" data-tip="Filtrar por disciplina">
                  <option value="">Todas as disciplinas</option>
                  ${st.disciplinas.map((d) => `<option value="${d.id}" ${desempDisc === d.id ? "selected" : ""}>${esc(d.nome)}</option>`).join("")}
                </select>
                ${
                  desempDisc
                    ? `<select id="desemp-top" class="hist-periodo-sel" data-tip="Filtrar por tópico">
                        <option value="">Todos os tópicos</option>
                        ${st.topicos.filter((t) => t.disciplinaId === desempDisc).map((t) => `<option value="${t.id}" ${desempTop === t.id ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}
                      </select>`
                    : ""
                }
                <button class="lnk" data-action="ampliar-acuracia" data-tip="Ver o gráfico ampliado">${icone("maximize-2")} Ampliar</button>
              </span>
            </div>
            ${graficoAcuraciaSemanal(store.acuraciaPorSemana(12, desempTop ? { topicoId: desempTop } : desempDisc ? { disciplinaId: desempDisc } : null))}
          </div>
        </div>
        <div class="stat-sub"><span class="stat-sub-tit">${icone("library")} Por disciplina</span> <span class="muted small" data-tip="Selecione uma disciplina para abrir o painel: KPIs, semáforo por tópico e análise do Mentor.">${icone("info")}</span></div>
        ${
          diag.porDisciplina.length
            ? `<div class="disc-grid stagger">${diag.porDisciplina.map((l) => cardDisciplina(l, store)).join("")}</div>
              <p class="diag-totais muted small">${diag.totalTentativas} questões resolvidas no total · ${fmtTempo(diag.tempoTotalSeg)} em foco.</p>`
            : vazio("Nenhuma disciplina ainda\nCadastre disciplinas e tópicos no Edital para acompanhar o desempenho.", "", icone("library"))
        }
        ${pontosFracosHTML(store, diag.porDisciplina)}
        ${blocoPorBanca(store, store.questoesRelatorio())}

        <div class="stat-sub"><span class="stat-sub-tit">${icone("layers")} Volume por tipo</span> <span class="muted small">quanto de cada material você consumiu</span></div>
        <div data-print="volume" data-print-label="Volume por tipo de estudo">${blocoEsforcoTipo(store.esforcoPorTipo())}</div>

        <div class="stat-sub"><span class="stat-sub-tit">${icone("repeat-2")} Flashcards</span> <span class="muted small">composição e desempenho</span></div>
        ${blocoFlashcards(store)}

        <div class="stat-sub"><span class="stat-sub-tit">${icone("clock-3")} Comportamento</span> <span class="muted small">quando você rende mais + análise do Mentor</span></div>
        <div data-print="comport" data-print-label="Comportamental">
          <p class="muted small u-m-0 u-mb-8">Seus hábitos → onde ajustar a rotina. A análise completa (horários, constância, edital e revisões) fica no <b>Mentor IA</b>, no card Sugestões abaixo.</p>
          <div class="comport-heat">${heatmapHorario(store.comportamentoHorario())}</div>
        </div>
      </div>
    </details>

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
    }

    <section class="card diag-sugestoes">
      <div class="plano-h"><h2>${icone("lightbulb")} Sugestões</h2></div>
      ${diag.sugestoes.length ? `<ul>${diag.sugestoes.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : `<p class="muted small">Sem alertas no momento. Continue o ciclo.</p>`}
      <button class="btn btn-ghost btn-sm" data-action="ir-mentor" data-tip="Ver o plano completo e aplicar ações sugeridas pela IA.">${icone("compass")} Abrir o Mentor IA</button>
    </section>

    <!-- ÚLTIMA TABELA: histórico de sessões detalhado (recolhível). -->
    <details class="bloco-recolhe" id="sess-det" data-print="sessoes" data-print-label="Histórico de sessões" ${sessAberto ? "open" : ""}>
      <summary><span class="sum-tit">${icone("clock-3")} Histórico de sessões</span><span class="sum-dica muted small">${plural(todasSessoes.length, "sessão registrada", "sessões registradas")} · tabela detalhada</span></summary>
    <section class="card" id="sess-sec">
      <div class="plano-h" style="margin-bottom:10px">
        <h2>${icone("clock-3")} ${esc(tituloSessoes)}</h2>
        <span class="cnt" id="sess-count">${plural(sessoesFiltradas.length, "sessão", "sessões")}</span>
        ${diaSel ? `<button class="btn btn-ghost btn-sm" data-action="limpar-dia">${icone("arrow-left")} Voltar ao período</button>` : ""}
        <span class="sp"></span>
        <button class="btn btn-ghost btn-sm ${sessFiltrosAbertos || nCatFiltros ? "on" : ""}" data-action="sess-filtros-toggle" data-tip="Filtrar por data, fase, disciplina, tópico ou observação.">${icone("list-filter")} Filtros${nCatFiltros ? ` <span class="cnt">${nCatFiltros}</span>` : ""}</button>
      </div>
      <div class="u-flex u-wrap u-mb-8" role="group" aria-label="Período do histórico" data-ui="sess-presets">
        ${["hoje", "semana", "mes", "tudo"].map((p) => `<button class="btn btn-ghost btn-sm ${!sessFiltroIni && !sessFiltroFim && !diaSel && periodoSel === p ? "on" : ""}" data-action="periodo" data-p="${p}">${LABEL[p]}</button>`).join("")}
      </div>
      ${sessChipsHTML(st)}
      ${sessPainelHTML(st)}
      ${
        sessoesFiltradas.length
          ? `<table class="tabela tabela-sessoes">
              <thead><tr>
                ${thSort("data", "Data")}
                ${thSort("disciplina", "Disciplina / Tópico")}
                ${thSort("tempo", "Tempo", " num")}
                ${thSort("questoes", "Questões", " num")}
                <th class="th-acoes"></th>
              </tr></thead>
              <tbody>${sessoesFiltradas.map((s) => linhaSessao(s, st, sessEdit.has(s.id))).join("")}</tbody>
            </table>`
          : todasSessoes.length
          ? vazio("Nenhuma sessão neste filtro\nAjuste o período, o dia ou os filtros acima.", "", icone("search"))
          : vazio("Ainda sem sessões registradas\nRegistre estudo no Hoje e seu progresso aparece aqui.", "", icone("clipboard-list"))
      }
    </section>
    </details>`;

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

  ligarTooltipsGraficos(root);

  bindActions(root, {
    "ir-central-revisoes": () => app.navigate("revisoes"),
    "ir-flashcards-venc": () => app.navigate("flashcards"),
    // A análise comportamental deixou de ser uma ilha: o Mentor IA já cruza horários +
    // constância + edital + revisões numa análise só. Aqui só levamos o usuário até lá.
    "ampliar-hist": () => {
      const jp = Number(store.get().config.histPeriodo) || 14;
      abrirJanela({
        titulo: `Tempo em foco (últimos ${jp} dias)`,
        semTelaCheia: true,
        corpoHTML: `<div class="grafico-ampliado">${graficoHistorico(store.historico(jp).porDia, jp)}</div>`,
        aoMontar: (ov) => ligarTooltipsGraficos(ov),
      });
    },
    "ampliar-horas": () => abrirJanela({
      titulo: "Ritmo semanal",
      semTelaCheia: true,
      corpoHTML: `<div class="grafico-ampliado">${graficoHorasSemana(store.tempoPorSemana(8), store.metas().metaSemanalMin)}</div>`,
      aoMontar: (ov) => ligarTooltipsGraficos(ov),
    }),
    "ampliar-pizza": () => abrirJanela({
      titulo: "Para onde vai seu tempo",
      semTelaCheia: true,
      corpoHTML: `<div class="grafico-ampliado grafico-centro">${graficoTempoPizza(store.historico(store.get().config.histPeriodo || 14).tempoFase)}</div>`,
      aoMontar: (ov) => ligarTooltipsGraficos(ov),
    }),
    "ampliar-acuracia": () => abrirJanela({
      titulo: "Evolução do desempenho",
      semTelaCheia: true,
      corpoHTML: `<div class="grafico-ampliado">${graficoAcuraciaSemanal(store.acuraciaPorSemana(12, desempTop ? { topicoId: desempTop } : desempDisc ? { disciplinaId: desempDisc } : null))}</div>`,
      aoMontar: (ov) => ligarTooltipsGraficos(ov),
    }),
    // Fase 3: a tela mais densa em números ganha a VOZ do Mentor (mesmo padrão do Dossiê) —
    // manda os números da semana para o chat e ele explica em linguagem humana.
    "explicar-semana": () => {
      if (!app.perguntarNoChat) return;
      const st2 = store.get();
      const hoje = new Date();
      const seg = new Date(hoje); seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
      const iniISO = `${seg.getFullYear()}-${String(seg.getMonth() + 1).padStart(2, "0")}-${String(seg.getDate()).padStart(2, "0")}`;
      const sem = (st2.sessoes || []).filter((s) => (s.data || "").slice(0, 10) >= iniISO);
      const minSem = Math.round(sem.reduce((a, s) => a + (s.tempoSeg || 0), 0) / 60);
      const tents = (st2.tentativas || []).filter((s) => (s.data || "").slice(0, 10) >= iniISO);
      const acer = tents.filter((x) => x.acertou).length;
      const resumoNums = `tempo ${minSem} min em ${sem.length} sessões; questões ${tents.length} (${tents.length ? Math.round((acer / tents.length) * 100) : 0}% de acerto)`;
      app.perguntarNoChat(`Explique minha semana de estudos em linguagem simples e me diga o que ajustar (números desta semana: ${resumoNums}).`);
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
                // Tira TODOS os controles de UI que não fazem sentido no papel (ampliar, filtros,
                // navegação, expandir-detalhes, setas de ordenação) SEM remover os cards de
                // conteúdo (que também são <button>). Cabeçalhos de ordenação viram texto simples.
                clone.querySelectorAll('.grafico-tit-acoes, [data-action^="ampliar"], [data-action="ir-central-revisoes"], [data-action="sess-filtros-toggle"], .sess-filtros-painel, [data-ui="sess-presets"], [data-action="toggle-sess-det"], .sort-ar').forEach((el) => el.remove());
                clone.querySelectorAll('[data-action="sort-sessao"]').forEach((th) => { th.removeAttribute("data-action"); th.classList.remove("sortavel"); });
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
    "disc-painel": (el) => app.navigate("edital", { dossieDiscId: el.getAttribute("data-id") }),
    // Presets de período do histórico (chips dentro da própria seção — sem rolagem).
    periodo: (el) => {
      periodoSel = el.getAttribute("data-p");
      diaSel = null;
      sessFiltroIni = "";
      sessFiltroFim = "";
      sessAberto = true;
      app.refresh();
    },
    "limpar-dia": () => {
      diaSel = null;
      app.refresh();
    },
    // Navegação/filtro do calendário: re-renderiza SÓ o calendário (não fecha o bloco).
    "mes-prev": () => { mesCal = deslocaMes(mesCal, -1); rerenderCal(root, store); },
    "mes-next": () => { mesCal = deslocaMes(mesCal, 1); rerenderCal(root, store); },
    "mes-hoje": () => { mesCal = todayISO().slice(0, 7); rerenderCal(root, store); },
    "cal-filtro": (el) => { const f = el.getAttribute("data-f") || "tudo"; calFiltro = calFiltro === f ? "tudo" : f; rerenderCal(root, store); },
    dia: (el) => {
      const d = el.getAttribute("data-dia");
      diaSel = diaSel === d ? null : d;
      sessFiltroIni = "";
      sessFiltroFim = "";
      if (diaSel) { rolarParaSessoes = true; sessAberto = true; }
      app.refresh();
    },
    "sort-sessao": (el) => {
      const col = el.getAttribute("data-col");
      if (sessaoSort.col === col) sessaoSort.dir = sessaoSort.dir === "asc" ? "desc" : "asc";
      else sessaoSort = { col, dir: col === "data" || col === "tempo" || col === "questoes" ? "desc" : "asc" };
      app.refresh();
    },
    "toggle-sess-det": (el) => {
      const id = el.getAttribute("data-id");
      if (sessDet.has(id)) sessDet.delete(id);
      else sessDet.add(id);
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
      const aulaId = root.querySelector(`.se-aula[data-id="${id}"]`)?.value || null;
      const min = parseInt(root.querySelector(`.se-min[data-id="${id}"]`)?.value, 10) || 0;
      const pini = parseInt(root.querySelector(`.se-pini[data-id="${id}"]`)?.value, 10) || 0;
      const pfim = parseInt(root.querySelector(`.se-pfim[data-id="${id}"]`)?.value, 10) || 0;
      const paginas = pini > 0 && pfim >= pini ? pfim - pini + 1 : 0;
      let ac = parseInt(root.querySelector(`.se-ac[data-id="${id}"]`)?.value, 10) || 0;
      const tot = parseInt(root.querySelector(`.se-tot[data-id="${id}"]`)?.value, 10) || 0;
      if (ac > tot) ac = tot;
      const er = Math.max(0, tot - ac);
      const comentario = root.querySelector(`.se-obs[data-id="${id}"]`)?.value || "";
      const missaoId = root.querySelector(`.se-missao[data-id="${id}"]`)?.value || null;
      // Reconcilia o objeto `materiais` (item principal) com os campos legados editados,
      // para o detalhamento não ficar defasado do que a linha mostra.
      const s0 = store.get().sessoes.find((x) => x.id === id);
      let materiais = s0 && s0.materiais ? { ...s0.materiais } : null;
      if (materiais) {
        if (Array.isArray(materiais.leituras) && materiais.leituras.length) {
          materiais.leituras = [...materiais.leituras];
          materiais.leituras[0] = { ...materiais.leituras[0], de: pini || null, ate: pfim || null, paginas };
        }
        if (materiais.questoes) materiais.questoes = { ...materiais.questoes, acertos: ac, erros: er };
      }
      store.editarSessao(id, {
        data, fase, topicoId, aulaId,
        tempoSeg: min * 60,
        paginaInicial: pini || null, paginaFinal: pfim || null, paginas,
        qAcertos: ac, qErros: er,
        comentario, missaoId,
        ...(materiais ? { materiais } : {}),
      });
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
  root.querySelector("#cal-det")?.addEventListener("toggle", (e) => {
    calDetAberto = e.target.open;
  });
  root.querySelector("#sess-det")?.addEventListener("toggle", (e) => {
    sessAberto = e.target.open;
  });

  root.querySelector("#hist-periodo")?.addEventListener("change", (e) => {
    store.setConfig({ histPeriodo: Number(e.target.value) || 14 });
    app.refresh();
  });

  // Filtro do gráfico "Evolução do desempenho" (disciplina → tópico contextual).
  root.querySelector("#desemp-disc")?.addEventListener("change", (e) => {
    desempDisc = e.target.value;
    desempTop = ""; // ao trocar de disciplina, zera o tópico
    app.refresh();
  });
  root.querySelector("#desemp-top")?.addEventListener("change", (e) => {
    desempTop = e.target.value;
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
        : `<tr><td colspan="5" class="muted small" style="text-align:center;padding:14px">Nenhuma sessão com esse texto.</td></tr>`;
    const cnt = root.querySelector("#sess-count");
    if (cnt) cnt.textContent = plural(ss.length, "sessão", "sessões");
  });
}

// Re-renderiza SÓ o calendário (mês/filtro) sem app.refresh — evita fechar o bloco.
function rerenderCal(root, store) {
  const cont = root.querySelector("#cal-container");
  if (cont) cont.innerHTML = calendarioHTML(store);
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
  // Tempo do dia conforme o filtro: "tudo" = total; senão só a fase escolhida.
  const tempoDoDia = (reg) => (!reg ? 0 : calFiltro === "tudo" ? reg.tempoSeg : (reg.fases && reg.fases[calFiltro]) || 0);
  const maxTempo = Math.max(1, ...Object.values(dados).map((x) => tempoDoDia(x)));
  const totalMesSeg = Object.values(dados).reduce((a, x) => a + tempoDoDia(x), 0);
  // Sessões contadas conforme o filtro (dias que têm a fase filtrada).
  const totalMesSess = Object.values(dados).reduce((a, x) => a + (calFiltro === "tudo" ? x.sessoes : (x.fases && x.fases[calFiltro] ? 1 : 0)), 0);
  const corFiltro = calFiltro === "tudo" ? "var(--accent)" : FASES[calFiltro] ? FASES[calFiltro].cor : "var(--accent)";

  let celulas = "";
  for (let i = 0; i < primeiroDia; i++) celulas += `<div class="cal-vazio"></div>`;
  for (let d = 1; d <= diasNoMes; d++) {
    const diaISO = `${ano}-${pad2(mes)}-${pad2(d)}`;
    const reg = dados[diaISO];
    const ehHoje = diaISO === hoje;
    const sel = diaISO === diaSel;
    const seg = tempoDoDia(reg);
    const temNoFiltro = seg > 0;
    const intensidade = temNoFiltro ? 0.28 + 0.55 * (seg / maxTempo) : 0;
    // Sem filtro: fundo neutro (acento) + pontinhos por tipo. Com filtro: cor da fase.
    const cor = calFiltro === "tudo" ? "var(--accent)" : corFiltro;
    const estilo = temNoFiltro ? `style="--int:${intensidade.toFixed(2)};--cal-cor:${cor}"` : "";
    const fasesPresentes = reg && reg.fases ? ["E", "A", "R"].filter((f) => reg.fases[f] > 0) : [];
    const titulo = reg
      ? `${plural(reg.sessoes, "sessão", "sessões")} · ${fmtTempo(reg.tempoSeg)}${calFiltro !== "tudo" ? ` · ${FASES[calFiltro].nome}: ${fmtTempo(seg)}` : fasesPresentes.length ? " · " + fasesPresentes.map((f) => FASES[f].nome).join(", ") : ""}`
      : "sem registros";
    const rodape = calFiltro === "tudo"
      ? (fasesPresentes.length ? `<span class="cal-dots">${fasesPresentes.map((f) => `<span class="cal-dot" style="background:${FASES[f].cor}"></span>`).join("")}</span>` : "")
      : (temNoFiltro ? `<span class="cal-min">${fmtMin(seg / 60)}</span>` : "");
    celulas += `
      <button class="cal-dia ${temNoFiltro ? "tem" : ""} ${ehHoje ? "hoje" : ""} ${sel ? "sel" : ""}" data-action="dia" data-dia="${diaISO}" ${estilo} title="${titulo}">
        <span class="cal-num">${d}</span>
        ${rodape}
      </button>`;
  }

  const chip = (v, rot, cor) => `<button class="cal-filtro ${calFiltro === v ? "on" : ""}" data-action="cal-filtro" data-f="${v}" style="--fc:${cor}"><span class="cal-filtro-dot"></span>${rot}</button>`;
  return `
    <div class="cal-head">
      <button class="btn btn-ghost btn-sm" data-action="mes-prev" data-tip="Mês anterior">${icone("chevron-left")}</button>
      <div class="cal-mes">${esc(nomeMes)}</div>
      <button class="btn btn-ghost btn-sm" data-action="mes-next" data-tip="Próximo mês">${icone("chevron-right")}</button>
      <button class="btn btn-ghost btn-sm" data-action="mes-hoje" data-tip="Ir para o mês atual">hoje</button>
    </div>
    <div class="cal-filtros" data-tip="Sem filtro = mostra tudo. Selecione um tipo para destacar só ele; toque de novo para limpar.">
      ${chip("E", "Estudo", FASES.E.cor)}
      ${chip("A", "Prática", FASES.A.cor)}
      ${chip("R", "Revisão", FASES.R.cor)}
    </div>
    <div class="cal-grid cal-semana">${SEMANA.map((s) => `<div class="cal-wd">${s}</div>`).join("")}</div>
    <div class="cal-grid">${celulas}</div>
    <div class="cal-total">Total do mês${calFiltro !== "tudo" ? ` <span style="color:${corFiltro}">(${FASES[calFiltro].nome})</span>` : ""}: <b>${fmtMin(totalMesSeg / 60)}</b> <span class="muted">· ${plural(totalMesSess, calFiltro === "tudo" ? "sessão" : "dia", calFiltro === "tudo" ? "sessões" : "dias")}</span></div>`;
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
    // Coluna unificada "Disciplina / Tópico": ordena por disciplina e, dentro dela, por tópico.
    disciplina: (s) => `${(s.disciplinaNome || "").toLowerCase()} · ${(s.topicoNome || "").toLowerCase()}`,
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

// Painel de detalhamento aberto sob a linha. Depois da dieta de colunas (9→4), é ele que
// carrega fase, páginas e observação (que saíram da linha), além dos materiais múltiplos.
function detalhesSessao(s, st) {
  const m = s.materiais || {};
  const blocos = [];
  const fi = FASES[s.fase];
  if (fi) blocos.push(`<span class="sd-chip">${icone("layers")} ${esc(fi.nome)}</span>`);
  const nLeit = (m.leituras && m.leituras.length) || 0;
  if (s.paginaInicial && s.paginaFinal)
    blocos.push(`<span class="sd-chip">${icone("book-open")} págs. ${s.paginaInicial}–${s.paginaFinal} (${s.paginas})${nLeit > 1 ? ` <span class="muted">+${nLeit - 1} leituras</span>` : ""}</span>`);
  else if (s.paginas) blocos.push(`<span class="sd-chip">${icone("book-open")} ${plural(s.paginas, "página lida", "páginas lidas")}</span>`);
  if (s.aulaId) {
    const a = st.aulas.find((x) => x.id === s.aulaId);
    if (a) blocos.push(`<span class="sd-chip">${icone("graduation-cap")} ${esc(a.nome)}</span>`);
  }
  const chips = blocos.length ? `<div class="sd-chips">${blocos.join("")}</div>` : "";

  const leituras = (m.leituras || []).filter((l) => l.titulo || l.paginas);
  const listaLeituras = leituras.length
    ? `<div class="sd-grupo"><b>${icone("library")} Leituras</b><ul>${leituras
        .map((l) => `<li>${esc(l.titulo || "Leitura")}${l.de && l.ate ? ` <span class="muted">· págs. ${l.de}–${l.ate} (${l.paginas})</span>` : l.paginas ? ` <span class="muted">· ${l.paginas} págs.</span>` : ""}</li>`)
        .join("")}</ul></div>`
    : "";

  const videos = m.videos || [];
  const listaVideos = videos.length
    ? `<div class="sd-grupo"><b>${icone("play")} Vídeos / aulas</b><ul>${videos
        .map((v) => {
          const tempo = v.ini != null && v.fim != null ? ` <span class="muted">· ${v.ini}–${v.fim} min</span>` : "";
          const link = v.link ? ` <a href="${esc(v.link)}" target="_blank" rel="noopener" class="sd-link">${icone("external-link")} abrir</a>` : "";
          return `<li>${esc(v.titulo || "Vídeo")}${tempo}${link}</li>`;
        })
        .join("")}</ul></div>`
    : "";

  const qlink = (m.questoes && m.questoes.link) || s.questoesLink;
  const linkQ = qlink ? `<div class="sd-grupo"><b>${icone("list-checks")} Questões</b><ul><li><a href="${esc(qlink)}" target="_blank" rel="noopener" class="sd-link">${icone("external-link")} ${esc(qlink)}</a></li></ul></div>` : "";

  // Materiais novos (lei seca, jurisprudência, flashcards, resumo, mapa) — num grupo só.
  const extras = [];
  if (m.leiSeca) extras.push(`<li>${icone("scroll-text")} <b>Lei Seca:</b> ${esc(m.leiSeca)}</li>`);
  if (m.jurisprudencia) extras.push(`<li>${icone("scale")} <b>Jurisprudência:</b> ${esc(m.jurisprudencia)}</li>`);
  if (m.flashcards) extras.push(`<li>${icone("layers")} <b>Flashcards:</b> ${m.flashcards} revisados</li>`);
  if (m.resumo) extras.push(`<li>${icone("file-text")} <b>Resumo:</b> ${esc(m.resumo)}</li>`);
  if (m.mapa) extras.push(`<li>${icone("brain")} <b>Mapa mental:</b> ${esc(m.mapa)}</li>`);
  const listaExtras = extras.length ? `<div class="sd-grupo"><b>${icone("library")} Lei, jurisprudência e revisões</b><ul>${extras.join("")}</ul></div>` : "";

  const obs = s.comentario ? `<div class="sd-grupo"><b>${icone("message-square")} Observação</b><ul><li>${esc(s.comentario)}</li></ul></div>` : "";

  return `<div class="sess-det">${chips}${listaLeituras}${listaVideos}${linkQ}${listaExtras}${obs}</div>`;
}

// ----- linha de sessão (+ edição inline) -----
// Dieta de colunas (Fase 5): a linha mostra só Data · Disciplina/Tópico · Tempo · Questões.
// Fase, páginas e observação moram no detalhamento expansível (toda linha tem o botão).
function linhaSessao(s, st, editando) {
  const traco = `<span class="cel-vazia">–</span>`;
  const tq = s.qAcertos + s.qErros;
  const q = tq ? `${s.qAcertos}/${tq} (${Math.round((s.qAcertos / tq) * 100)}%)` : traco;
  const fi = FASES[s.fase];
  const cor = fi ? fi.cor : "var(--muted)";
  const disc = s.disciplinaNome && s.disciplinaNome !== "—" ? esc(s.disciplinaNome) : "";
  const top = s.topicoNome && s.topicoNome !== "—" ? esc(s.topicoNome) : "";
  const discTopTd = disc || top ? `${disc || top}${disc && top ? `<div class="muted small">${top}</div>` : ""}` : traco;
  const aberto = sessDet.has(s.id);
  const btnDet = `<button class="mover-btn sess-det-btn ${aberto ? "on" : ""}" data-action="toggle-sess-det" data-id="${s.id}" data-tip-pos="cima-dir" data-tip="${aberto ? "Ocultar" : "Ver"} detalhes (fase, páginas, observação, materiais)">${icone("chevron-down")}</button>`;
  const linha = `<tr class="sess-row ${aberto ? "det-aberto" : ""}" style="--cor:${cor}" data-foco-id="${s.id}">
    <td>${fmtData(s.data)}</td>
    <td>${discTopTd}</td>
    <td class="num">${fmtTempoCurto(s.tempoSeg)}</td>
    <td class="num">${q}</td>
    <td class="sess-acoes">
      ${btnDet}
      <button class="mover-btn" data-action="edit-sessao" data-id="${s.id}" data-tip-pos="cima-dir" data-tip="Editar sessão">${icone("square-pen")}</button>
      <button class="mover-btn mover-del" data-action="del-sessao" data-id="${s.id}" data-tip-pos="cima-dir" data-tip="Remover sessão">${icone("x")}</button>
    </td>
  </tr>`;
  const detRow = aberto && !editando ? `<tr class="sess-det-row"><td colspan="5">${detalhesSessao(s, st)}</td></tr>` : "";
  if (!editando) return linha + detRow;

  const topOpts =
    `<option value="">— sem tópico —</option>` +
    st.topicos.map((t) => `<option value="${t.id}" ${t.id === s.topicoId ? "selected" : ""}>${esc(rotuloTopico(st, t))}</option>`).join("");
  const faseOpts = ORDEM_FASES.map((f) => `<option value="${f}" ${f === s.fase ? "selected" : ""}>${FASES[f].nome}</option>`).join("");
  // Aula: só oferece se o tópico atual pertence a alguma aula do cursinho.
  const aulasT = (st.aulas || []).filter((a) => Array.isArray(a.topicoIds) && a.topicoIds.includes(s.topicoId));
  const aulaField = aulasT.length
    ? `<label class="inline">Aula <select class="se-aula" data-id="${s.id}"><option value="">— nenhuma —</option>${aulasT
        .map((a) => `<option value="${a.id}" ${a.id === s.aulaId ? "selected" : ""}>${esc(a.nome)}</option>`)
        .join("")}</select></label>`
    : "";
  const form = `<tr class="sess-edit-row"><td colspan="5">
    <div class="sess-edit">
      <label class="inline">Data <input type="date" class="se-data" data-id="${s.id}" value="${s.data.slice(0, 10)}" /></label>
      <label class="inline">Fase <select class="se-fase" data-id="${s.id}">${faseOpts}</select></label>
      <label class="inline">Tópico <select class="se-top" data-id="${s.id}">${topOpts}</select></label>
      ${aulaField}
      <label class="inline">Minutos <input type="number" min="0" max="1440" class="se-min" data-id="${s.id}" value="${Math.round((s.tempoSeg || 0) / 60)}" /></label>
      <label class="inline">Pág. de <input type="number" min="0" max="99999" class="se-pini" data-id="${s.id}" value="${s.paginaInicial || 0}" /></label>
      <label class="inline">Pág. até <input type="number" min="0" max="99999" class="se-pfim" data-id="${s.id}" value="${s.paginaFinal || 0}" /></label>
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
  if (v >= 70) return "var(--success)";
  if (v >= 50) return "var(--warn)";
  return "var(--danger)";
}

// Card premium por disciplina (substitui a linha de tabela). Clique → Painel da disciplina.
function cardDisciplina(l, store) {
  const aprov = l.percentAcerto;
  const cor = store.corDisciplina(l.disciplina.id);
  const anel = aprov === null
    ? `<div class="pring pring-vazio" style="width:66px;height:66px"><span class="pring-txt muted" style="font-size:var(--fs-2xs)">sem<br>questões</span></div>`
    : progressRing(aprov, { cor: corAproveitamento(aprov) });
  const ultimo = l.ultimoEstudo ? haQuantoTempo(l.ultimoEstudo) : "nunca estudado";
  return `<button class="card card-click disc-card" data-action="disc-painel" data-id="${l.disciplina.id}" data-tip="Abrir a disciplina: aproveitamento e tempo por tópico" data-tip-pos="cima">
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

// ----- metas: linha única compacta (o card de 3 barras virou este resumo; a meta
// aparece UMA vez na tela — os valores são configurados em Configurações) -----
function metasCompactasHTML(m) {
  const partes = [];
  const parte = (rot, feito, meta) => {
    const pct = Math.round((feito / meta) * 100);
    return `<span>${rot} <b>${fmtMin(feito)} / ${fmtMin(meta)}</b> <span class="muted">(${pct}%)</span>${pct >= 100 ? ` <span class="meta-tag-ok">${icone("check")} batida</span>` : ""}</span>`;
  };
  if (m.metaDiariaMin) partes.push(parte("Hoje", m.feitoHojeMin, m.metaDiariaMin));
  if (m.metaSemanalMin) partes.push(parte("Semana", m.feitoSemanaMin, m.metaSemanalMin));
  if (m.metaMensalMin) partes.push(parte("Mês", m.feitoMesMin, m.metaMensalMin));
  const corpo = partes.length
    ? partes.join(`<span class="muted">·</span>`)
    : `<span class="muted">Defina suas metas em <b>Configurações</b>.</span>`;
  const tip = m.dispDiariaMin
    ? ` data-tip="Disponibilidade: ${fmtMin(m.dispDiariaMin)}/dia · ${fmtMin(m.dispSemanaMin)}/semana${m.dispAteProvaMin != null ? ` · ~${Math.round(m.dispAteProvaMin / 60)}h até a prova` : ""}"`
    : "";
  return `<section class="card metas-card" data-print="metas" data-print-label="Metas">
    <p class="u-m-0 small u-flex u-wrap"${tip}>${icone("target")} <b>Metas</b><span class="muted">·</span>${corpo}</p>
  </section>`;
}

// ----- ofensiva (constância): linha discreta, sem caixa -----
function ofensivaTexto(o) {
  if (!o || !o.atual) return `<span>Comece sua sequência hoje.</span>`;
  const dias = `${o.atual} dia${o.atual === 1 ? "" : "s"}`;
  return `<span>Sequência: <b>${dias}</b> · recorde ${o.recorde}</span>`;
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
// Relatório dos FLASHCARDS no Acompanhamento (centraliza a análise; a tela Flashcards fica só
// para estudar). Tiles + barra de composição; o tile "vencidos hoje" é clicável → vai revisar.
function blocoFlashcards(store) {
  const rel = store.flashcardsRelatorio();
  if (!rel || !rel.total) return "";
  const comp = rel.novos + rel.aprendizado + rel.maduros || 1;
  const pct = (n) => Math.round((n / comp) * 100);
  const tile = (ico, num, rot, action) =>
    `<div class="esf-tile${action ? " esf-tile-click" : ""}"${action ? ` role="button" tabindex="0" data-action="${action}" data-tip="Revisar os vencidos agora"` : ""}><span class="esf-ico">${icone(ico)}</span><b class="esf-num">${num}</b><span class="esf-rot">${rot}</span></div>`;
  return `<div data-print="flashstats" data-print-label="Flashcards">
    <div class="esf-tipos">
      ${tile("layers", rel.total, `cartões${rel.suspensos ? ` · ${rel.suspensos} dispensado${rel.suspensos > 1 ? "s" : ""}` : ""}`)}
      ${tile("alarm-clock", rel.vencidos, `vencidos hoje${rel.atrasados ? ` · ${rel.atrasados} atrasado${rel.atrasados > 1 ? "s" : ""}` : ""}`, rel.vencidos ? "ir-flashcards-venc" : "")}
      ${tile("target", rel.precisao != null ? rel.precisao + "%" : "—", `precisão (${rel.dias}d) · ${rel.revisados} ${rel.revisados === 1 ? "revisão" : "revisões"}`)}
    </div>
    <div class="fc-comp u-mt-16">
      <div class="fc-comp-barra" role="img" aria-label="Composição: ${rel.novos} novos, ${rel.aprendizado} em aprendizado, ${rel.maduros} maduros">
        <span class="fc-comp-seg fc-comp-novo" style="width:${pct(rel.novos)}%"></span>
        <span class="fc-comp-seg fc-comp-apr" style="width:${pct(rel.aprendizado)}%"></span>
        <span class="fc-comp-seg fc-comp-mad" style="width:${pct(rel.maduros)}%"></span>
      </div>
      <div class="fc-comp-leg">
        <span><i class="fc-comp-novo"></i> Novos <b>${rel.novos}</b></span>
        <span><i class="fc-comp-apr"></i> Em aprendizado <b>${rel.aprendizado}</b></span>
        <span><i class="fc-comp-mad"></i> Maduros <b>${rel.maduros}</b></span>
      </div>
    </div>
  </div>`;
}

// Desempenho por BANCA (barras) + por TIPO (MC × C/E). Só aparece com questões praticadas.
// Religado dentro de "Estatísticas detalhadas" (Fase 5): o card solto tinha se perdido do render.
function blocoPorBanca(store, rel) {
  if (!rel || !rel.total) return "";
  const bancas = rel.porBanca.filter((b) => b.banca !== "Sem banca");
  const { mc, ce } = rel.porFormato;
  const tipo = (lbl, o) => (o.total ? `<span class="qb-tipo">${lbl} <b class="${perfClasse(store, o.percent)}">${o.percent}%</b> <span class="muted small">(${o.total})</span></span>` : "");
  const lista = bancas.length
    ? `<div class="qb-lista">${bancas.slice(0, 10).map((b) => `<div class="qb-row">
        <span class="qb-nome" title="${esc(b.banca)}">${esc(b.banca)}</span>
        <div class="qb-bar"><span style="width:${b.percent}%"></span></div>
        <span class="qb-pct ${perfClasse(store, b.percent)}">${b.percent}%</span>
        <span class="qb-tot muted small">${b.total}q</span>
      </div>`).join("")}</div>`
    : `<p class="muted small u-m-0 u-mt-8">Importe questões de provas com banca (em Prática/Questões) para ver o desempenho por banca.</p>`;
  return `<div class="stat-sub"><span class="stat-sub-tit">${icone("clipboard-list")} Por banca</span> <span class="muted small">acerto nas questões praticadas, por banca e tipo</span></div>
  <div data-print="banca" data-print-label="Desempenho por banca / tipo">
    <p class="muted small u-m-0 u-mb-12">${rel.total} praticadas no treino · ${tipo("Múltipla escolha", mc)}${mc.total && ce.total ? " · " : ""}${tipo("Certo/Errado", ce)}</p>
    ${lista}
  </div>`;
}

// Heatmap "quando você rende mais": dia da semana (linhas) × faixa do dia (colunas), célula
// mais forte = mais tempo em foco. Dá a leitura CONCRETA que a análise por IA descreve em texto.
function heatmapHorario(comp) {
  if (!comp || !comp.total)
    return vazio("Sem dados de horário ainda\nRegistre sessões com o cronômetro para ver quando você rende mais.", "", icone("clock-3"));
  const diasLbl = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const faixasLbl = ["Madrugada", "Manhã", "Tarde", "Noite"];
  const nivel = (v) => { if (!v) return 0; const r = v / comp.maxCel; return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1; };
  const cabec = `<div class="hh-row hh-head"><span class="hh-dia"></span>${faixasLbl.map((f) => `<span class="hh-cel-lbl">${f}</span>`).join("")}</div>`;
  const linhas = diasLbl.map((d, di) =>
    `<div class="hh-row"><span class="hh-dia">${d}</span>${comp.grade[di].map((v, fi) => `<span class="hh-cel hh-n${nivel(v)}" title="${d} · ${faixasLbl[fi]}: ${fmtTempoCurto(v)}"></span>`).join("")}</div>`
  ).join("");
  const insight = comp.melhorDiaIdx != null
    ? `<p class="hh-insight"><span class="orb orb-sm" aria-hidden="true"></span> Você rende mais: <b>${diasLbl[comp.melhorDiaIdx]}</b> · <b>${faixasLbl[comp.melhorFaixaIdx]}</b></p>`
    : "";
  // Legenda da intensidade (mesmo idioma da Constância: "menos → mais").
  const legenda = `<div class="hh-leg muted small">menos <span class="hh-cel hh-n1"></span><span class="hh-cel hh-n2"></span><span class="hh-cel hh-n3"></span><span class="hh-cel hh-n4"></span> mais tempo/dia</div>`;
  return `<div class="hh-grid">${cabec}${linhas}</div>${legenda}${insight}`;
}

// Volume de estudo por TIPO de material: páginas lidas (+ ritmo), vídeo (min→h) e questões.
// Complementa a pizza "por etapa" mostrando QUANTO de cada material o aluno consumiu.
function blocoEsforcoTipo(e) {
  if (!e || (!e.paginas && !e.videoMin && !e.questoes && !e.flashcardsRev && !e.leiSecaN && !e.jurisN && !e.resumoN && !e.mapaN))
    return vazio("Sem materiais registrados ainda\nRegistre leituras, vídeos ou questões ao registrar uma sessão.", "", icone("layers"));
  const hV = Math.floor(e.videoMin / 60), mV = e.videoMin % 60;
  const tempoVideo = e.videoMin ? (hV ? `${hV}h${mV ? String(mV).padStart(2, "0") : ""}` : `${mV}min`) : "—";
  const tile = (ico, num, rot) => `<div class="esf-tile"><span class="esf-ico">${icone(ico)}</span><b class="esf-num">${num}</b><span class="esf-rot">${rot}</span></div>`;
  const tileSe = (cond, ico, num, rot) => (cond ? tile(ico, num, rot) : "");
  const sess = (n) => `${plural(n, "sessão", "sessões")}`;
  // Sem o % aqui (o aproveitamento fica no KPI) — aqui é VOLUME. Lei seca/juris/resumo/mapa contam
  // por nº de SESSÕES em que apareceram; flashcards, por cartões revisados.
  return `<div class="esf-tipos">
    ${tile("book-open", e.paginas, `páginas lidas${e.paginasPorHora ? ` · ${e.paginasPorHora}/h` : ""}`)}
    ${tile("play", tempoVideo, `de vídeo${e.videosCount ? ` · ${e.videosCount} vídeo${e.videosCount > 1 ? "s" : ""}` : ""}`)}
    ${tile("clipboard-list", e.questoes, "questões resolvidas")}
    ${tileSe(e.flashcardsRev, "layers", e.flashcardsRev, "flashcards revisados")}
    ${tileSe(e.leiSecaN, "scroll-text", e.leiSecaN, `lei seca · ${sess(e.leiSecaN)}`)}
    ${tileSe(e.jurisN, "scale", e.jurisN, `jurisprudência · ${sess(e.jurisN)}`)}
    ${tileSe(e.resumoN, "file-text", e.resumoN, `resumos · ${sess(e.resumoN)}`)}
    ${tileSe(e.mapaN, "brain", e.mapaN, `mapas · ${sess(e.mapaN)}`)}
  </div>`;
}

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
  const sw = 19; // espessura da rosca (mais fina = anel elegante + mais espaço p/ o número central)
  const rInner = r - sw / 2;
  const circ = 2 * Math.PI * rInner;
  let offset = 0;
  const segs = fatias
    .map((x) => {
      const frac = x.seg / total;
      const len = frac * circ;
      const dash = `${len.toFixed(2)} ${(circ - len).toFixed(2)}`;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${rInner}" fill="none"
        stroke="${x.info.cor}" stroke-width="${sw}" class="donut-seg"
        stroke-dasharray="${dash}" stroke-dashoffset="${(-offset).toFixed(2)}"
        transform="rotate(-90 ${cx} ${cy})"${tipAttrs(x.info.nome, `${fmtTempoCurto(x.seg)} (${Math.round(frac * 100)}%)`, x.info.cor)}></circle>`;
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

  // Fonte do número central adapta ao tamanho do texto para não encostar/ser cortado pelo anel.
  const numStr = fmtTempoCurto(total);
  const numCls = numStr.length > 7 ? "donut-centro-num donut-centro-num-xs" : numStr.length > 5 ? "donut-centro-num donut-centro-num-sm" : "donut-centro-num";
  return `
    <div class="donut-wrap">
      <svg viewBox="0 0 160 160" class="donut-svg" data-gtip="rosca" role="img" aria-label="Distribuição do tempo de estudo por etapa">
        ${segs}
        <text x="${cx}" y="${cy - 3}" class="${numCls}" text-anchor="middle">${numStr}</text>
        <text x="${cx}" y="${cy + 14}" class="donut-centro-rot" text-anchor="middle">total</text>
      </svg>
      <div class="donut-legenda">${legenda}</div>
    </div>`;
}

// ----- gráficos SVG (vanilla, sem dependências) -----

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

  // rótulos de data: ~5 marcas IGUALMENTE espaçadas do 1º ao último ponto (inclusive),
  // sem colisão (o esquema "i % passo + último forçado" sobrepunha as 2 últimas datas).
  const nTicks = Math.min(5, n);
  const div = Math.max(1, nTicks - 1);
  const tickIdx = new Set(Array.from({ length: nTicks }, (_, k) => Math.round((k * (n - 1)) / div)));
  const eixoX = serie
    .map((d, i) => {
      if (!tickIdx.has(i)) return "";
      const dd = d.data.slice(8, 10);
      const mm = d.data.slice(5, 7);
      return `<text x="${xAt(i).toFixed(1)}" y="${H - 8}" class="g-eixo" text-anchor="middle">${dd}/${mm}</text>`;
    })
    .join("");

  const pontos = pts
    .map(
      (p) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" class="g-ponto"${tipAttrs(fmtData(p.d.data), `${fmtMin((p.d.tempoSeg || 0) / 60)} · ${plural(p.d.sessoes, "sessão", "sessões")}`, "var(--primary)")}></circle>`
    )
    .join("");

  return `
    <div class="grafico-svg-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="grafico-svg" data-gtip="linha" data-plot-left="${padL}" data-plot-right="${W - padR}" data-plot-top="${padTop}" data-plot-bot="${padTop + innerH}" role="img" aria-label="Tempo em foco por dia nos últimos ${janelaDias} dias">
        ${grades}
        <path d="${area}" class="g-area"></path>
        <path d="${linha}" class="g-linha"></path>
        ${pontos}
        ${eixoX}
      </svg>
    </div>`;
}

// Evolução da ACURÁCIA (% de acerto) por semana — linha com faixas de referência
// (bom ≥70% / atenção <50%). Semana sem questões vira lacuna (não inventa ponto).
function graficoAcuraciaSemanal(serie) {
  const comDado = (serie || []).filter((s) => s.pct !== null);
  if (comDado.length < 2) return vazio("Poucos dados ainda\nResolva questões (na Prática ou no registro) por algumas semanas para ver sua evolução de acerto.", "", icone("trending-up"));

  const W = 520, H = 200, padR = 44, padTop = 14, padBottom = 26, padL = 40;
  const innerW = W - padL - padR;
  const innerH = H - padTop - padBottom;
  const n = serie.length;
  const xAt = (i) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (pct) => padTop + innerH - (pct / 100) * innerH;

  // Grades + eixo Y (0 / 50 / 100 %)
  const grades = [0, 50, 100]
    .map((v) => {
      const y = yAt(v);
      return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="g-grade"></line>
              <text x="${padL - 6}" y="${(y + 3).toFixed(1)}" class="g-eixo" text-anchor="end">${v}%</text>`;
    })
    .join("");

  // Faixas de referência: bom ≥70% (verde) e atenção <50% (vermelho)
  const ref = (v, cls, lbl) => {
    const y = yAt(v);
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="g-ref ${cls}"></line>
            <text x="${(W - padR + 4).toFixed(1)}" y="${(y + 3).toFixed(1)}" class="g-ref-lbl ${cls}" text-anchor="start">${lbl}</text>`;
  };
  const refs = ref(70, "g-ref-bom", "bom") + ref(50, "g-ref-ruim", "atenção");

  // Linha em segmentos: só liga semanas ADJACENTES com dado (quebra nas lacunas).
  let segs = "";
  for (let i = 0; i < n - 1; i++) {
    if (serie[i].pct !== null && serie[i + 1].pct !== null) {
      segs += `<line x1="${xAt(i).toFixed(1)}" y1="${yAt(serie[i].pct).toFixed(1)}" x2="${xAt(i + 1).toFixed(1)}" y2="${yAt(serie[i + 1].pct).toFixed(1)}" class="g-linha-seg"></line>`;
    }
  }
  const pontos = serie
    .map((s, i) =>
      s.pct === null
        ? ""
        : `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(s.pct).toFixed(1)}" r="3.2" class="g-ponto"${tipAttrs(fmtData(s.inicio), `${s.pct}% (${s.acertos}/${s.total})`, "var(--primary)")}></circle>`
    )
    .join("");

  const nTicks = Math.min(5, n);
  const div = Math.max(1, nTicks - 1);
  const tickIdx = new Set(Array.from({ length: nTicks }, (_, k) => Math.round((k * (n - 1)) / div)));
  const eixoX = serie
    .map((s, i) => {
      if (!tickIdx.has(i)) return "";
      return `<text x="${xAt(i).toFixed(1)}" y="${H - 8}" class="g-eixo" text-anchor="middle">${s.inicio.slice(8, 10)}/${s.inicio.slice(5, 7)}</text>`;
    })
    .join("");

  return `
    <div class="grafico-svg-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="grafico-svg" data-gtip="linha" data-plot-left="${padL}" data-plot-right="${W - padR}" data-plot-top="${padTop}" data-plot-bot="${padTop + innerH}" role="img" aria-label="Evolução do desempenho (% de acerto) por semana">
        ${grades}
        ${refs}
        ${segs}
        ${pontos}
        ${eixoX}
      </svg>
    </div>`;
}

// Horas de estudo por SEMANA (barras verticais) com linha de meta semanal. Visão agregada
// que complementa o "Desempenho histórico" (dia a dia): mostra se a soma da semana bate a meta.
function graficoHorasSemana(serie, metaSemanalMin = 0) {
  const dados = serie || [];
  const algum = dados.some((s) => (s.tempoSeg || 0) > 0);
  if (!dados.length || !algum) return vazio("Sem horas registradas ainda\nRegistre estudo para ver suas horas por semana.", "", icone("bar-chart-3"));

  const W = 520, H = 200, padTop = 16, padBottom = 26, padR = 14;
  const metaSeg = (metaSemanalMin || 0) * 60;
  const maxSeg = Math.max(1, ...dados.map((s) => s.tempoSeg || 0), metaSeg);
  // topo arredondado para a hora cheia acima (mín. 1h)
  const maxMin = Math.max(60, Math.ceil(maxSeg / 60 / 60) * 60);
  const rotulosY = [0, maxMin / 2, maxMin].map(fmtMin);
  const maxLabel = Math.max(...rotulosY.map((s) => s.length));
  const padL = Math.max(40, Math.round(maxLabel * 6.4) + 12);
  const innerW = W - padL - padR;
  const innerH = H - padTop - padBottom;
  const n = dados.length;
  const yAt = (seg) => padTop + innerH - (seg / 60 / maxMin) * innerH;
  const slot = innerW / n;
  const bw = Math.min(34, slot * 0.62);

  const grades = [0, maxMin / 2, maxMin]
    .map((minv) => {
      const y = yAt(minv * 60);
      return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="g-grade"></line>
              <text x="${padL - 6}" y="${(y + 3).toFixed(1)}" class="g-eixo" text-anchor="end">${fmtMin(minv)}</text>`;
    })
    .join("");

  // Linha de meta semanal (se houver meta definida).
  let metaLn = "";
  if (metaSeg > 0) {
    const y = yAt(metaSeg);
    metaLn = `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="g-ref g-ref-meta"></line>
              <text x="${(W - padR).toFixed(1)}" y="${(y - 4).toFixed(1)}" class="g-ref-lbl g-ref-meta" text-anchor="end">meta ${fmtMin(metaSemanalMin)}</text>`;
  }

  const barras = dados
    .map((s) => {
      const cx = padL + slot * dados.indexOf(s) + slot / 2;
      const x = cx - bw / 2;
      const h = (s.tempoSeg / 60 / maxMin) * innerH;
      const y = padTop + innerH - h;
      const dd = s.inicio.slice(8, 10), mm = s.inicio.slice(5, 7);
      const atingiu = metaSeg > 0 && s.tempoSeg >= metaSeg;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="3" class="g-bar-sem${atingiu ? " g-bar-sem-ok" : ""}"${tipAttrs(`Semana de ${fmtData(s.inicio)}`, `${fmtMin((s.tempoSeg || 0) / 60)} · ${plural(s.sessoes, "sessão", "sessões")}`, atingiu ? "var(--success)" : "var(--primary)")}></rect>
              <text x="${cx.toFixed(1)}" y="${H - 8}" class="g-eixo" text-anchor="middle">${dd}/${mm}</text>`;
    })
    .join("");

  return `
    <div class="grafico-svg-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="grafico-svg" data-gtip="barras" role="img" aria-label="Ritmo semanal: horas de estudo por semana × meta">
        ${grades}
        ${metaLn}
        ${barras}
      </svg>
    </div>`;
}
