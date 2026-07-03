// Tela "Hoje": conduz o ciclo do dia + cronômetro Pomodoro + lançamento manual.
// Cronômetro com dois modos: REGRESSIVO (conta para baixo de um tempo definível) e
// PROGRESSIVO (conta para cima até você interromper).
import { bindActions, toast, header, escolher, faixaIA, confetti, plural, abrirJanela, ativarCountUp, revelarTexto } from "../ui.js";

// Comemora (confete) quando uma sessão faz o tempo do dia CRUZAR a meta diária.
function celebrarMeta(store, antes) {
  const dep = store.metas();
  if (dep.metaDiariaMin > 0 && (antes.feitoHojeMin || 0) < dep.metaDiariaMin && (dep.feitoHojeMin || 0) >= dep.metaDiariaMin) {
    confetti();
    toast("Meta diária batida! Excelente ritmo.", "ok");
  }
}
import { esc, fmtMMSS, fmtTempo, fmtData, fmtMin, todayISO } from "../util.js";
import { icone } from "../icones.js";
import { FASES, ORDEM_FASES, ordenarTopicosPorBase } from "../ciclo.js";
import * as crono from "../cronometro.js";
import { progressRing } from "../viz.js";

let sel = { fase: null, topicoId: null };
let cronoAberto = false; // mantém o bloco do cronômetro aberto entre re-renders (ex.: trocar modo)
let anelAnimou = false; // count-up dos anéis só na 1ª renderização da sessão (não re-anima a cada ação)
let mentorFalou = false; // streaming do texto do Mentor só uma vez por sessão (não re-digita a cada ação)

// "Por quê" data-driven do foco de hoje (voz de IA de verdade, não filler): usa SÓ sinais
// que existem no app — revisão vencida, desempenho fraco, flashcards vencidos, relevância.
// Degrada para "" quando não há sinal (usuário novo/base vazia) — a lição do redesign revertido:
// NUNCA inventar dado nem mostrar caixa vazia. Combina no máximo 2 sinais, do mais urgente ao menos.
function porqueFoco(store, st, topico) {
  if (!topico) return "";
  const hoje = todayISO();
  const sinais = [];
  const rev = store.revisaoTopicoDe(topico.id);
  if (rev && rev.proxima && rev.proxima <= hoje) sinais.push("a revisão dele vence hoje");
  const d = store.dossie(topico.id);
  if (d && d.totalTentativas >= 3 && d.acertos / d.totalTentativas < 0.6)
    sinais.push(`você acertou ${d.acertos} de ${plural(d.totalTentativas, "questão", "questões")} dele`);
  if (sinais.length < 2) {
    const fc = store.flashcardsVencidos().filter((f) => f.topicoId === topico.id).length;
    if (fc) sinais.push(`${plural(fc, "flashcard vencido", "flashcards vencidos")} esperando`);
  }
  if (sinais.length < 2) {
    if (topico.peso > 0) sinais.push(`cai bastante na sua banca (~${topico.peso}%)`);
    else if (topico.maisCai) sinais.push("é dos temas que mais caem");
  }
  if (!sinais.length) return "";
  const frase = sinais.slice(0, 2).join(" e ");
  return frase.charAt(0).toUpperCase() + frase.slice(1) + ".";
}

export default function renderHoje(root, app) {
  const { store } = app;
  const st = store.get();
  const plano = store.planoHoje();

  if (!sel.fase) sel.fase = plano.fase;
  if (app.params && app.params.reta) {
    sel.fase = "R";
    app.params.reta = null;
  }
  if (!sel.topicoId && plano.topico) sel.topicoId = plano.topico.id;
  // Quando ocioso e em modo regressivo, alinha o alvo ao bloco salvo nas configurações.
  if (crono.snapshot().modo === "regressivo") crono.setTargetIfIdle((st.config.pomodoroFoco || 25) * 60);

  const faseInfo = FASES[sel.fase] || plano.faseInfo;
  const topicoSel = st.topicos.find((t) => t.id === sel.topicoId) || plano.topico;

  const cicloHTML = ORDEM_FASES.map((f) => {
    const info = FASES[f];
    const n = plano.contagem[f];
    return `<div class="ciclo-fase ${f === plano.fase ? "rec" : ""}" style="--cor:${info.cor}" data-tip-pos="cima-esq" data-tip="${plural(n, "sessão", "sessões")} de ${info.nome} ${n === 1 ? "registrada" : "registradas"} hoje">
      <div class="ciclo-bolha">${info.codigo}</div>
      <div class="ciclo-nome">${info.nome}</div>
    </div>`;
  }).join('<div class="ciclo-seta">→</div>');

  // Em base "cursinho", os seletores de tópico seguem a ordem das AULAS (Aula 1 → 2 → ...).
  const topicosOrd = ordenarTopicosPorBase(st, st.topicos);
  const opcoesTopico = topicosOrd
    .map((t) => `<option value="${t.id}" ${t.id === sel.topicoId ? "selected" : ""}>${esc(rotuloTopico(st, t))}</option>`)
    .join("");
  const opcoesTopicoMan = topicosOrd
    .map((t) => `<option value="${t.id}">${esc(rotuloTopico(st, t))}</option>`)
    .join("");
  // Tarefas pendentes (para vincular opcionalmente à sessão).
  const opcoesTarefas = st.missoes
    .filter((m) => !m.concluida)
    .map((m) => {
      const t = m.topicoId ? st.topicos.find((x) => x.id === m.topicoId) : null;
      return `<option value="${m.id}">${esc((t ? rotuloTopico(st, t) + " · " : "") + m.titulo)}</option>`;
    })
    .join("");

  const vencidos = store.flashcardsVencidos().length;
  const errosPend = st.tentativas.filter((t) => !t.acertou).length;
  const apQ = aproveitamentoQuestoesHoje(st);
  const metas = store.metas();
  const ofensHoje = store.ofensiva();
  const pontos = store.pontosAtencao();
  const tarefasHojePend = store.tarefasDoDia(todayISO()).filter((x) => !x.concluida);
  const cr = crono.snapshot();
  // "Onde parei": última sessão registrada (tópico + data) — retoma sem precisar pensar.
  const ultimaSess = st.sessoes && st.sessoes.length
    ? [...st.sessoes].sort((a, b) => (a.data < b.data ? 1 : -1))[0]
    : null;
  const ondeParei = ultimaSess
    ? (() => {
        const t = ultimaSess.topicoId ? st.topicos.find((x) => x.id === ultimaSess.topicoId) : null;
        const nome = (t && t.nome) || ultimaSess.material || (FASES[ultimaSess.fase] && FASES[ultimaSess.fase].nome) || "estudo";
        return `${esc(nome)} · ${fmtData(ultimaSess.data)}`;
      })()
    : "";
  const hora = new Date().getHours();
  const saud = hora < 5 ? "Boa madrugada" : hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const provaChip = metas && metas.prova ? ` · prova em ${plural(metas.prova.diasRestantes, "dia", "dias")}` : "";
  const reta = store.retaFinal();
  // A faixa de insight NÃO repete o que já está no hub "Revisões de hoje" (flashcards
  // vencidos, revisão de tópico, mapas) — mostra o 1º ponto de atenção AINDA não coberto ali.
  const COBERTO_PELO_HUB = new Set(["venc", "revtop", "mapas"]);
  const pontoInsight = pontos.find((p) => !COBERTO_PELO_HUB.has(p.key));
  // "Plano de hoje do Mentor": o mentor FALA na Home — 2 a 4 acionáveis derivados do
  // que o app já sabe (pontos de atenção, tópico sugerido, revisões, prova). Cada um
  // com um botão que EXECUTA (não é aviso decorativo). Substitui a faixinha discreta.
  // "Plano de hoje" em BLOCOS: Foco sugerido (Mentor) + tarefas planejadas (você) + adicionar.
  // Absorve as tarefas e o "adicionar" num painel só (como no protótipo). As linhas-rec antigas
  // (ponto de atenção, flashcards, contagem de tarefas) já vivem no card do Mentor / faixa de Revisões.
  const tarefasDia = store.tarefasDoDia(todayISO());
  const nPlano = (topicoSel ? 1 : 0) + tarefasDia.length;
  const minPlano = (topicoSel ? st.config.pomodoroFoco || 25 : 0) + tarefasDia.reduce((a, x) => a + (x.estimMin || 0), 0);
  const pbTask = (it) => {
    const cor = it.tipo === "rotina" ? "#f472b6" : "#818cf8";
    return `<div class="pb pb-task${it.concluida ? " pb-done" : ""}" style="--c:${cor}"${it.topicoId && !it.concluida ? ` data-action="focar-topico" data-top="${it.topicoId}"` : ""}>
        <span class="pb-stripe"></span>
        <div class="pb-top"><span class="pb-tag">${it.tipo === "rotina" ? "Rotina" : "Tarefa"}</span><span class="pb-src pb-you">${it.tipo === "rotina" ? "Sua rotina" : "Você planejou"}</span>${it.estimMin ? `<span class="pb-tm">≈ ${fmtMin(it.estimMin)}</span>` : ""}</div>
        <h4><span class="pb-chk" data-action="th-toggle" data-tipo="${it.tipo}" data-id="${it.id}"${it.concluida ? " data-on" : ""}></span>${esc(it.titulo)}</h4>
      </div>`;
  };
  const planoSec = `
    <section class="plano-sec">
      <div class="plano-h"><h2>Plano de hoje</h2>${nPlano ? `<span class="cnt">${plural(nPlano, "item", "itens")}${minPlano ? ` · ${fmtMin(minPlano)}` : ""}</span>` : ""}<span class="sp"></span><a data-action="hub-ir" data-rota="planejamento">Ver semana →</a></div>
      <p class="plano-note muted small">${icone("sparkles")} <b>Mentor sugere</b> · o resto é o que você planejou — comece pelo que quiser.</p>
      <div class="plano-blocos">
        ${
          topicoSel
            ? `<div class="pb pb-ai" style="--c:var(--accent)" data-action="focar-topico" data-top="${topicoSel.id}" data-fase="${sel.fase}">
          <span class="pb-stripe"></span>
          <div class="pb-top"><span class="pb-tag">Foco</span><span class="pb-src pb-ai-src">${icone("sparkles")} Mentor</span><span class="pb-tm">agora</span></div>
          <h4>${esc(topicoSel.nome)}</h4>
          <div class="pb-meta">${esc(faseInfo.nome)} · ~${st.config.pomodoroFoco || 25} min · sugerido do seu edital</div>
        </div>`
            : ""
        }
        ${tarefasDia.map(pbTask).join("")}
        <button class="pb pb-add" data-action="hub-ir" data-rota="planejamento">
          <span class="pb-add-pl">＋</span><span class="pb-add-t">Adicionar ao dia</span><span class="pb-add-m">Outra matéria, tarefa ou sessão</span>
        </button>
      </div>
    </section>`;

  // Recomposição visual (gap nº1): o card de FOCO é o herói (topo). "Plano de hoje" e a
  // ofensiva descem para depois do herói. Info a mais no card de foco (porquê + meta) que
  // antes ficava espalhada — mesma informação, disposição diferente.
  const porqueHoje = topicoSel ? porqueFoco(store, st, topicoSel) : "";
  const dossieTop = topicoSel ? store.dossie(topicoSel.id) : null;
  const dominio = dossieTop && dossieTop.totalTentativas > 0 ? Math.round((dossieTop.acertos / dossieTop.totalTentativas) * 100) : null;
  const discFoco = topicoSel ? st.disciplinas.find((d) => d.id === topicoSel.disciplinaId) : null;
  const ondePareiFase = ultimaSess ? (FASES[ultimaSess.fase] && FASES[ultimaSess.fase].nome) || "" : "";

  root.innerHTML = `
    <div class="page-head hoje-head"><div>
      <h1 class="hoje-hero">${topicoSel ? `Seu foco de hoje está <span class="g">pronto</span>.` : "Hoje"}</h1>
      ${topicoSel ? "" : `<p class="sub">Seu dia de estudo, num relance.</p>`}
    </div></div>

    ${reta.ativo ? retaFinalHTML(metas) : ""}

    <div class="hoje-grid">
    <section class="card foco-hero" style="--cor:${faseInfo.cor}">
      <div class="foco-top">
        <div class="foco-eyebrow"><span class="orb orb-xs" aria-hidden="true"></span> Seu foco agora${topicoSel ? ` <span class="foco-selo">sugerido pelo Mentor</span>` : ""}</div>
        <div class="seg seg-fases" role="tablist">
          ${ORDEM_FASES.map((f) => `<button class="${f === sel.fase ? "on" : ""}" data-sel-fase="${f}" style="--cor:${FASES[f].cor}" data-tip="${esc(FASES[f].desc)}">${FASES[f].nome}</button>`).join("")}
        </div>
      </div>
      ${discFoco ? `<div class="foco-disc">${esc(discFoco.nome)}</div>` : ""}
      <div class="foco-topline">
        <div class="foco-topico-nome">${topicoSel ? esc(topicoSel.nome) : st.topicos.length ? "Escolha um tópico" : "Monte seu edital para o Mentor montar seu dia"}</div>
        ${st.topicos.length ? `<button class="btn btn-ghost btn-sm foco-trocar" data-action="trocar-topico" data-tip="Escolher outra disciplina e tópico — você decide.">${icone("repeat-2")} Trocar tópico</button>` : ""}
      </div>
      ${porqueHoje ? `<div class="foco-porque">${icone("sparkles")} ${porqueHoje}</div>` : ""}
      ${
        st.topicos.length
          ? `<div class="foco-meta">
        <div class="fm"><span class="fm-k">Bloco</span><span class="fm-v">${st.config.pomodoroFoco || 25} min</span></div>
        ${ondePareiFase ? `<div class="fm"><span class="fm-k">Onde parei</span><span class="fm-v">${esc(ondePareiFase)}</span></div>` : ""}
        <div class="fm"><span class="fm-k">Domínio</span><span class="fm-v">${dominio != null ? dominio + "%" : "—"}</span></div>
      </div>`
          : ""
      }
      <div class="foco-acoes">
        ${
          st.topicos.length
            ? `<button class="btn btn-primary btn-lg btn-foco" data-action="foco-comecar">${icone("play")} Começar agora</button>
        <button class="btn btn-ghost" data-action="ir-pratica" data-tip="Praticar questões deste tópico.">Questões</button>
        <button class="btn btn-ghost" data-action="ir-flashcards" data-tip="Revisar flashcards vencidos.">Revisar${vencidos ? ` · ${vencidos}` : ""}</button>`
            : `<button class="btn btn-primary btn-lg" data-action="hub-ir" data-rota="edital">Montar meu edital →</button>`
        }
      </div>
    </section>
      <aside class="hoje-side">
        ${ringsHTML(store)}
        ${mentorVozHTML(store, st, topicoSel, pontoInsight ? pontoInsight.txt : "")}
      </aside>
    </div>

    ${hubRevisoesHTML(store)}

    ${planoSec}

      <details class="card crono-card hoje-recolhe" ${cronoAberto || cr.running || cr.elapsed > 0 ? "open" : ""}>
        <summary class="hoje-recolhe-sum">${icone("clock-3")} Cronômetro de foco <span class="muted small" style="font-weight:400">— ${cr.running ? "em andamento" : "clique para abrir"}</span></summary>
        <div class="cronometro">
        <div class="crono-modo">
          <button class="chip ${cr.modo === "regressivo" ? "on" : ""}" data-action="modo" data-modo="regressivo" data-tip="Conta o tempo para baixo, a partir do bloco definido.">Regressivo</button>
          <button class="chip ${cr.modo === "progressivo" ? "on" : ""}" data-action="modo" data-modo="progressivo" data-tip="Conta o tempo para cima, até você interromper.">Progressivo</button>
        </div>
        <div class="crono-display ${cr.overtime ? "overtime" : ""}" id="crono-display">${cr.overtime ? "+" : ""}${fmtMMSS(cr.display)}</div>
        <div class="crono-label" id="crono-label">${labelInicial()}</div>
        <div class="crono-vinculo" id="crono-vinculo">Registrar como <b>${faseInfo.nome}</b> · <b>${topicoSel ? esc(rotuloTopico(st, topicoSel)) : "sem tópico"}</b></div>
        <div class="crono-nota muted small" data-tip="O tempo continua mesmo se você abrir Flashcards, Questões ou outra tela.">⏱ Continua rodando em qualquer tela.</div>
        <div class="crono-acoes">
          <button class="btn btn-primary" data-action="toggle" data-tip="Iniciar ou pausar o cronômetro.">${cr.running ? `${icone("pause")} Pausar` : `${icone("play")} Iniciar`}</button>
          <button class="btn btn-zerar" data-action="zerar" data-tip="Voltar a zero sem registrar a sessão.">Zerar</button>
          <button class="btn btn-success" data-action="registrar" data-tip="Salvar o tempo focado nesta fase e tópico.">Registrar sessão</button>
        </div>
        ${
          cr.modo === "regressivo"
            ? `<div class="crono-presets">
                <span class="muted">Tempo:</span>
                <input id="crono-min" type="number" min="1" max="300" value="${Math.round(cr.target / 60)}" title="minutos" />
                <span class="muted">minutos</span>
              </div>`
            : ""
        }
        <div class="ses-extra2">
          <div class="ses-sec">O que você usou nesta sessão? <span class="muted small">(opcional — clique para detalhar)</span></div>
          <div class="ses-chips">
            <button type="button" class="chip ses-chip" data-ses-bloco="cr-b-pag">Páginas</button>
            <button type="button" class="chip ses-chip" data-ses-bloco="cr-b-q">Questões</button>
            <button type="button" class="chip ses-chip" data-ses-bloco="cr-b-vid">Vídeo / aula</button>
            <button type="button" class="chip ses-chip" data-ses-bloco="cr-b-obs">Observação</button>
          </div>
          <div id="cr-b-pag" class="ses-bloco" hidden>
            <div class="form-row ses-row">
              <label>Pág. inicial<input id="cr-pini" type="number" min="0" max="99999" value="0" /></label>
              <label>Pág. final<input id="cr-pfim" type="number" min="0" max="99999" value="0" /></label>
              <label>Total de páginas<input id="cr-pag" type="number" min="0" max="9999" value="0" readonly title="Calculado pela página inicial e final." /></label>
            </div>
          </div>
          <div id="cr-b-q" class="ses-bloco" hidden>
            <div class="form-row ses-row">
              <label>Questões feitas<input id="cr-tot" type="number" min="0" max="9999" value="0" /></label>
              <label class="ses-q-ac">Questões certas<input id="cr-ac" type="number" min="0" max="9999" value="0" /></label>
              <label>Aproveitamento<input id="cr-pct" type="text" value="—" readonly /></label>
            </div>
          </div>
          <div id="cr-b-vid" class="ses-bloco" hidden>
            <div class="form-row ses-row">
              <label style="flex:2">Aula / material <span class="muted small" data-tip="Qual aula/videoaula você assistiu (ex.: Aula 12). Opcional.">ⓘ</span><input id="cr-mat" type="text" maxlength="80" placeholder="Ex.: Aula 12 · Prof. Fulano" /></label>
              <label>Vídeo min. ini.<input id="cr-vini" type="number" min="0" max="999" placeholder="—" /></label>
              <label>Vídeo min. fim<input id="cr-vfim" type="number" min="0" max="999" placeholder="—" /></label>
            </div>
          </div>
          <div id="cr-b-obs" class="ses-bloco" hidden>
            <label class="ses-campo">Observação
              <textarea id="cr-obs" class="obs-auto" rows="1" placeholder="Ex.: tive dificuldade com o princípio da insignificância"></textarea>
            </label>
          </div>
          <div class="ses-fim">
            ${
              opcoesTarefas
                ? `<label class="ses-campo">Vincular a uma tarefa
                    <select id="cr-missao"><option value="">— nenhuma —</option>${opcoesTarefas}</select>
                  </label>
                  <label class="inline check-tarefa"><input type="checkbox" id="cr-missao-concluir" /> Concluir a tarefa ao registrar <span class="muted">(desmarque se ainda vai continuá-la)</span></label>`
                : ""
            }
            ${
              st.config.revisaoTopicoAuto
                ? `<label class="inline check-tarefa"><input type="checkbox" id="cr-agendar-rev" checked /> Agendar revisão deste tópico <span class="chip chip-count ses-chip-rev" style="cursor:default">24h → 7d → 30d</span></label>`
                : ""
            }
          </div>
        </div>
        </div>
      </details>

    <details class="card lancamento-manual hoje-recolhe">
      <summary class="hoje-recolhe-sum">${icone("square-pen")} Lançar sessão manual <span class="muted small" style="font-weight:400">(já estudei, sem cronômetro)</span></summary>
      <div class="form-row manual-row">
        <label>Data
          <input id="man-data" type="date" value="${hojeStr()}" data-tip="Dia em que essa sessão de fato ocorreu (pode lançar dias anteriores)." />
        </label>
        <label>Fase
          <select id="man-fase">${ORDEM_FASES.map((f) => `<option value="${f}" ${f === sel.fase ? "selected" : ""}>${FASES[f].nome}</option>`).join("")}</select>
        </label>
        <label style="flex:2">Tópico
          <select id="man-top"><option value="">— sem tópico —</option>${opcoesTopicoMan}</select>
        </label>
        <label>Minutos
          <input id="man-min" type="number" min="0" max="600" value="30" />
        </label>
      </div>
      <div class="ses-extra2">
          <div class="ses-sec">O que você usou nesta sessão? <span class="muted small">(opcional — clique para detalhar)</span></div>
          <div class="ses-chips">
            <button type="button" class="chip ses-chip" data-ses-bloco="man-b-pag">Páginas</button>
            <button type="button" class="chip ses-chip" data-ses-bloco="man-b-q">Questões</button>
            <button type="button" class="chip ses-chip" data-ses-bloco="man-b-vid">Vídeo / aula</button>
            <button type="button" class="chip ses-chip" data-ses-bloco="man-b-obs">Observação</button>
          </div>
          <div id="man-b-pag" class="ses-bloco" hidden>
            <div class="form-row ses-row">
              <label>Pág. inicial<input id="man-pini" type="number" min="0" max="99999" value="0" /></label>
              <label>Pág. final<input id="man-pfim" type="number" min="0" max="99999" value="0" /></label>
              <label>Total de páginas<input id="man-pag" type="number" min="0" max="9999" value="0" readonly title="Calculado pela página inicial e final." /></label>
            </div>
          </div>
          <div id="man-b-q" class="ses-bloco" hidden>
            <div class="form-row ses-row">
              <label>Questões realizadas<input id="man-tot" type="number" min="0" max="9999" value="0" /></label>
              <label class="ses-q-ac">Questões certas<input id="man-ac" type="number" min="0" max="9999" value="0" /></label>
              <label>Aproveitamento<input id="man-pct" type="text" value="—" readonly /></label>
            </div>
          </div>
          <div id="man-b-vid" class="ses-bloco" hidden>
            <div class="form-row ses-row">
              <label style="flex:2">Aula / material <span class="muted small" data-tip="Qual aula/videoaula você assistiu (ex.: Aula 12). Opcional.">ⓘ</span><input id="man-mat" type="text" maxlength="80" placeholder="Ex.: Aula 12 · Prof. Fulano" /></label>
              <label>Vídeo min. ini.<input id="man-vini" type="number" min="0" max="999" placeholder="—" /></label>
              <label>Vídeo min. fim<input id="man-vfim" type="number" min="0" max="999" placeholder="—" /></label>
            </div>
          </div>
          <div id="man-b-obs" class="ses-bloco" hidden>
            <label class="ses-campo">Observação
              <textarea id="man-obs" class="obs-auto" rows="1" placeholder="Ex.: revisei súmulas, ainda confundo competência originária do STF"></textarea>
            </label>
          </div>
          <div class="ses-fim">
            ${
              opcoesTarefas
                ? `<label class="ses-campo">Vincular a uma tarefa
                    <select id="man-missao"><option value="">— nenhuma —</option>${opcoesTarefas}</select>
                  </label>
                  <label class="inline check-tarefa"><input type="checkbox" id="man-missao-concluir" /> Concluir a tarefa ao registrar <span class="muted">(desmarque se ainda vai continuá-la)</span></label>`
                : ""
            }
            ${
              st.config.revisaoTopicoAuto
                ? `<label class="inline check-tarefa"><input type="checkbox" id="man-agendar-rev" checked /> Agendar revisão deste tópico <span class="chip chip-count ses-chip-rev" style="cursor:default">24h → 7d → 30d</span></label>`
                : ""
            }
          </div>
        </div>
      <div class="manual-rodape">
        <button class="btn btn-success" data-action="lancar-manual" data-tip="Salvar uma sessão já estudada, sem usar o cronômetro.">Registrar sessão</button>
      </div>
    </details>

    <div class="hoje-rodape">
      <span class="muted small">Hoje: <b>${fmtTempo(tempoHoje(st))}</b> em foco · <b>${sessoesHoje(st)}</b> ${sessoesHoje(st) === 1 ? "sessão" : "sessões"} · <b>${questoesHoje(st)}</b> questões</span>
      <button class="lnk small" data-action="hub-ir" data-rota="diagnostico">Ver acompanhamento completo →</button>
    </div>`;

  // Atmosfera (gap#3): count-up dos anéis na 1ª renderização (respeita reduced-motion; guarda
  // contra re-animar a cada ação). Em dados vazios os anéis são 0% → sem animação visível.
  if (!anelAnimou) {
    ativarCountUp(root);
    anelAnimou = true;
  }
  // Streaming do texto do Mentor (efeito "digitando", 1x por sessão; respeita reduced-motion).
  if (!mentorFalou) {
    const mv = root.querySelector(".hmv-txt[data-stream]");
    if (mv) {
      revelarTexto(mv, mv.textContent, { cps: 35 });
      mentorFalou = true;
    }
  }

  function atualizaVinculo() {
    const t = st.topicos.find((x) => x.id === sel.topicoId);
    const vEl = root.querySelector("#crono-vinculo");
    if (vEl) vEl.innerHTML = `Registrar como <b>${esc(FASES[sel.fase].nome)}</b> · <b>${t ? esc(rotuloTopico(st, t)) : "sem tópico"}</b>`;
    // Espelha o vínculo no cronômetro global (para o registro e o rótulo do mini-relógio).
    crono.vincular({
      fase: sel.fase,
      topicoId: sel.topicoId,
      faseNome: FASES[sel.fase]?.nome || "",
      topicoLabel: t ? rotuloTopico(st, t) : "",
      cor: FASES[sel.fase]?.cor,
    });
  }
  atualizaVinculo();
  root.querySelector("#sel-topico")?.addEventListener("change", (e) => {
    sel.topicoId = e.target.value;
    atualizaVinculo();
  });
  root.querySelectorAll("[data-sel-fase]").forEach((b) =>
    b.addEventListener("click", () => {
      sel.fase = b.getAttribute("data-sel-fase");
      atualizaVinculo();
      app.refresh(); // re-renderiza o herói (cor/rotulo da fase)
    })
  );

  // Auto-cálculo de aproveitamento (questões) e total de páginas, reaproveitado pelo
  // lançamento manual (man-*) e pelo cronômetro (cr-*).
  function ligarAutoCalc(pre) {
    const tot = root.querySelector(`#${pre}-tot`);
    const ac = root.querySelector(`#${pre}-ac`);
    const pct = root.querySelector(`#${pre}-pct`);
    const pini = root.querySelector(`#${pre}-pini`);
    const pfim = root.querySelector(`#${pre}-pfim`);
    const pag = root.querySelector(`#${pre}-pag`);
    if (tot && ac && pct) {
      const calc = () => {
        const t = parseInt(tot.value, 10) || 0;
        let a = parseInt(ac.value, 10) || 0;
        if (a > t) a = t;
        pct.value = t ? `${Math.round((a / t) * 100)}% (${a}/${t})` : "—";
      };
      tot.addEventListener("input", calc);
      ac.addEventListener("input", calc);
    }
    if (pini && pfim && pag) {
      const calc = () => {
        const ini = parseInt(pini.value, 10) || 0;
        const fim = parseInt(pfim.value, 10) || 0;
        pag.value = ini > 0 && fim >= ini ? fim - ini + 1 : 0;
      };
      pini.addEventListener("input", calc);
      pfim.addEventListener("input", calc);
    }
  }
  ligarAutoCalc("man");
  ligarAutoCalc("cr");

  // Chips de material (progressive disclosure): o formulário nasce curto e cresce só
  // no que interessa. Os inputs continuam no DOM (mesmos ids) — os handlers não mudam.
  root.querySelectorAll("[data-ses-bloco]").forEach((ch) =>
    ch.addEventListener("click", () => {
      const alvo = root.querySelector("#" + ch.getAttribute("data-ses-bloco"));
      if (!alvo) return;
      const abrir = alvo.hidden;
      alvo.hidden = !abrir;
      ch.classList.toggle("on", abrir);
      if (abrir) alvo.querySelector("input, textarea")?.focus();
    })
  );

  // Campos de observação que crescem conforme o texto (apenas visual).
  root.querySelectorAll(".obs-auto").forEach((ta) => {
    const crescer = () => {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    };
    ta.addEventListener("input", crescer);
    crescer();
  });

  const minInput = root.querySelector("#crono-min");
  if (minInput) {
    minInput.addEventListener("change", () => {
      const min = Math.max(1, parseInt(minInput.value, 10) || 25);
      crono.setTarget(min * 60);
      label.textContent = `Bloco de ${min} min`;
      store.setConfig({ pomodoroFoco: min }); // lembra o tempo escolhido p/ a próxima vez
    });
  }

  const display = root.querySelector("#crono-display");
  const label = root.querySelector("#crono-label");

  // O display grande da tela "Hoje" agora apenas REFLETE o cronômetro global, que
  // tica num único intervalo no boot e continua rodando em qualquer tela.
  function pintar(snapAtual) {
    const sn = snapAtual || crono.snapshot();
    if (display) {
      display.textContent = (sn.overtime ? "+" : "") + fmtMMSS(sn.display);
      display.classList.toggle("overtime", sn.overtime);
    }
    if (label) {
      if (sn.pausadoSeg > 0) label.innerHTML = `<span class="crono-pausa">${icone("pause")} Em pausa ${fmtMMSS(sn.pausadoSeg)}</span>`;
      else if (sn.overtime) label.textContent = "Tempo extra (alvo atingido) — pause para registrar.";
      else if (sn.running) label.textContent = sn.modo === "progressivo" ? "Contando..." : "Em foco...";
    }
    const btn = root.querySelector('[data-action="toggle"]');
    if (btn) btn.innerHTML = sn.running ? `${icone("pause")} Pausar` : `${icone("play")} Iniciar`;
  }
  // Lembra se o usuário deixou o bloco do cronômetro aberto (para não fechar ao trocar modo).
  root.querySelector(".crono-card")?.addEventListener("toggle", (e) => { cronoAberto = e.target.open; });
  // Esconde o mini-relógio flutuante enquanto a tela "Hoje" (com o relógio grande) está visível.
  crono.setTelaHoje(true);
  const desinscrever = crono.onTick(pintar);
  pintar();

  bindActions(root, {
    modo: (el) => {
      const novo = el.getAttribute("data-modo");
      if (novo === crono.snapshot().modo) return;
      crono.setModo(novo);
      if (novo === "regressivo") crono.setTargetIfIdle((st.config.pomodoroFoco || 25) * 60);
      cronoAberto = true; // o usuário está com o bloco aberto: não o feche ao trocar o modo
      app.refresh();
    },
    toggle: () => crono.toggle(),
    "foco-comecar": () => {
      crono.iniciar();
      app.refresh();
      requestAnimationFrame(() => root.querySelector(".crono-card")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    },
    // Trocar o tópico em foco: seletor disciplina → tópico (o usuário escolhe, não o sistema).
    "trocar-topico": () => {
      abrirSeletorTopico(store, (topId) => {
        sel.topicoId = topId;
        app.refresh();
      });
    },
    // Sugestões do card do Mentor: repassa ao chat (propõe → confirma → executa).
    "mentor-sug": (el) => {
      const q = el.getAttribute("data-q") || "";
      if (typeof app.perguntarNoChat === "function") app.perguntarNoChat(q);
      else app.navigate("mentor");
    },
    // Marca/desmarca uma tarefa de hoje como feita (missão ou ocorrência de rotina).
    "th-toggle": (el) => {
      const id = el.getAttribute("data-id");
      if (el.getAttribute("data-tipo") === "rotina") store.toggleRotinaFeita(id, todayISO());
      else store.toggleMissao(id);
      app.refresh();
    },
    // Clicar num item do plano / numa tarefa → torna-o o FOCO atual (rola até o card de foco).
    "focar-topico": (el) => {
      const top = el.getAttribute("data-top") || el.getAttribute("data-topico");
      if (!top) return;
      sel.topicoId = top;
      const f = el.getAttribute("data-fase");
      if (f && FASES[f]) sel.fase = f;
      app.refresh();
      requestAnimationFrame(() => root.querySelector(".foco-hero")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      toast("Foco atualizado — comece quando quiser.");
    },
    zerar: () => {
      crono.zerar();
      if (label) label.textContent = "";
    },
    registrar: () => {
      const seg = Math.round(crono.snapshot().elapsed);
      if (seg < 1) {
        toast("Inicie o cronômetro antes de registrar.", "erro");
        return;
      }
      crono.zerar();
      // detalhes opcionais da sessão cronometrada
      const pIni = parseInt(root.querySelector("#cr-pini").value, 10) || 0;
      const pFim = parseInt(root.querySelector("#cr-pfim").value, 10) || 0;
      let pag = 0;
      if (pIni > 0 && pFim >= pIni) pag = pFim - pIni + 1;
      const tot = parseInt(root.querySelector("#cr-tot").value, 10) || 0;
      let ac = parseInt(root.querySelector("#cr-ac").value, 10) || 0;
      if (ac > tot) ac = tot;
      const er = Math.max(0, tot - ac);
      const obs = root.querySelector("#cr-obs")?.value || "";
      const mat = root.querySelector("#cr-mat")?.value || "";
      const vIni = parseInt(root.querySelector("#cr-vini")?.value, 10) || 0;
      const vFim = parseInt(root.querySelector("#cr-vfim")?.value, 10) || 0;
      const crMissao = root.querySelector("#cr-missao")?.value || null;
      const crConcluir = !!root.querySelector("#cr-missao-concluir")?.checked;
      const crAgendarRev = root.querySelector("#cr-agendar-rev");
      const metaAntes = store.metas();
      store.registrarSessao({
        fase: sel.fase,
        topicoId: sel.topicoId,
        tempoSeg: seg,
        paginas: pag,
        paginaInicial: pIni || null,
        paginaFinal: pFim || null,
        qAcertos: ac,
        qErros: er,
        comentario: obs,
        material: mat,
        videoIni: vIni || null,
        videoFim: vFim || null,
        missaoId: crMissao,
        concluirMissao: crConcluir,
        agendarRevisao: crAgendarRev ? crAgendarRev.checked : undefined,
      });
      const extra = [];
      if (pag) extra.push(pIni && pFim ? `págs. ${pIni}–${pFim}` : `${pag} pág.`);
      if (tot) extra.push(`${ac}/${tot} questões`);
      if (mat.trim()) extra.push(mat.trim());
      if (crMissao && crConcluir) extra.push("tarefa concluída");
      else if (crMissao) extra.push("tarefa vinculada");
      if (sel.fase === "E" && sel.topicoId && st.config.revisaoTopicoAuto && crAgendarRev && crAgendarRev.checked) extra.push("revisão agendada (24h)");
      toast(`Sessão de ${fmtTempo(seg)} em ${FASES[sel.fase].nome}${extra.length ? " · " + extra.join(" · ") : ""}.`);
      celebrarMeta(store, metaAntes);
    },
    "lancar-manual": () => {
      const fase = root.querySelector("#man-fase").value;
      const top = root.querySelector("#man-top").value || null;
      const data = root.querySelector("#man-data").value || null;
      const min = parseInt(root.querySelector("#man-min").value, 10) || 0;
      const pIni = parseInt(root.querySelector("#man-pini").value, 10) || 0;
      const pFim = parseInt(root.querySelector("#man-pfim").value, 10) || 0;
      let pag = parseInt(root.querySelector("#man-pag").value, 10) || 0;
      if (pIni > 0 && pFim >= pIni) pag = pFim - pIni + 1;
      const tot = parseInt(root.querySelector("#man-tot").value, 10) || 0;
      let ac = parseInt(root.querySelector("#man-ac").value, 10) || 0;
      if (ac > tot) ac = tot;
      const er = Math.max(0, tot - ac);
      if (min < 1 && pag < 1 && tot < 1) {
        toast("Informe ao menos minutos, páginas ou questões.", "erro");
        return;
      }
      const obs = root.querySelector("#man-obs")?.value || "";
      const mat = root.querySelector("#man-mat")?.value || "";
      const vIni = parseInt(root.querySelector("#man-vini")?.value, 10) || 0;
      const vFim = parseInt(root.querySelector("#man-vfim")?.value, 10) || 0;
      const manMissao = root.querySelector("#man-missao")?.value || null;
      const manConcluir = !!root.querySelector("#man-missao-concluir")?.checked;
      const manAgendarRev = root.querySelector("#man-agendar-rev");
      const metaAntesMan = store.metas();
      store.registrarSessao({
        fase,
        topicoId: top,
        tempoSeg: min * 60,
        paginas: pag,
        paginaInicial: pIni || null,
        paginaFinal: pFim || null,
        qAcertos: ac,
        qErros: er,
        comentario: obs,
        material: mat,
        videoIni: vIni || null,
        videoFim: vFim || null,
        data,
        missaoId: manMissao,
        concluirMissao: manConcluir,
        agendarRevisao: manAgendarRev ? manAgendarRev.checked : undefined,
      });
      const partes = [];
      if (min) partes.push(`${min} min`);
      if (pag) partes.push(pIni && pFim ? `págs. ${pIni}–${pFim} (${pag})` : `${pag} pág.`);
      if (tot) partes.push(`${ac}/${tot} questões (${Math.round((ac / tot) * 100)}%)`);
      if (mat.trim()) partes.push(mat.trim());
      if (manMissao && manConcluir) partes.push("tarefa concluída");
      else if (manMissao) partes.push("tarefa vinculada");
      toast(`Lançado: ${partes.join(" · ")} em ${FASES[fase].nome}.`);
      celebrarMeta(store, metaAntesMan);
    },
    "ir-pratica": async () => {
      sel.fase = "A";
      // Respeita quais telas de questões estão visíveis (Configurações → Botões da barra):
      // abre a habilitada; se as duas, pergunta; se nenhuma, abre Questões mesmo assim.
      const oc = st.config.botoesOcultos || [];
      const mcOn = !oc.includes("pratica");
      const ceOn = !oc.includes("pratica-ce");
      let rota = "pratica";
      if (mcOn && ceOn) {
        const v = await escolher("Abrir qual prática de questões?", [
          { label: "Questões", value: "pratica", cls: "btn-primary" },
          { label: "Questões C/E", value: "pratica-ce" },
        ]);
        if (!v) return;
        rota = v;
      } else if (ceOn && !mcOn) {
        rota = "pratica-ce";
      }
      app.navigate(rota, { topicoId: sel.topicoId });
    },
    "ir-flashcards": () => app.navigate("flashcards"),
    "ir-erros": () => app.navigate("erros"),
    "ir-mentor": () => app.navigate("mentor"),
    "ir-revtopico": () => app.navigate("revtopico"),
    "hub-ir": (el) => app.navigate(el.getAttribute("data-rota")),
    "checkin-dispensar": () => {
      store.setConfig({ checkinVistoData: todayISO() });
    },
    atalho: (el) => {
      const a = (st.config.atalhos || []).find((x) => x.id === el.getAttribute("data-id"));
      if (!a) return;
      if (a.tipo === "disciplina") app.navigate("edital", { focoDisciplinaId: a.alvo });
      else if (a.tipo === "topico") app.navigate("edital", { dossieTopicoId: a.alvo });
      else if (a.tipo === "simulado") app.navigate(a.alvo === "pratica-ce" ? "pratica-ce" : "pratica", { sub: "simulado" });
      else app.navigate(a.alvo);
    },
  });

  return () => {
    // Ao sair da tela: para de refletir o display grande e religa o mini-relógio flutuante.
    // NÃO para o cronômetro — ele continua ticando no módulo global.
    desinscrever();
    crono.setTelaHoje(false);
  };

  function labelInicial() {
    if (cr.overtime) return "Tempo extra (alvo atingido) — pause para registrar.";
    if (cr.running) return cr.modo === "progressivo" ? "Contando..." : "Em foco...";
    return "";
  }
}

// Hub unificado "Revisões de hoje" (dir.2+3): junta flashcards + memória lei/juris +
// revisão de tópico num só lugar; cada item leva à sua tela.
// Anéis de progresso (KPIs num relance) — reusa os mesmos números do Acompanhamento
// (store.diagnostico + store.metas). Degrada com contexto quando não há dado (usuário novo).
function ringsHTML(store) {
  const m = store.metas();
  let diag;
  try { diag = store.diagnostico(); } catch (_) { diag = { porDisciplina: [], percentGeral: null }; }
  const discComTop = (diag.porDisciplina || []).filter((l) => l.topicos && l.topicos.length);
  const cob = discComTop.length ? Math.round(discComTop.reduce((a, l) => a + l.cobertura, 0) / discComTop.length) : 0;
  const aprov = diag.percentGeral;
  const metaSem = m.metaSemanalMin > 0 ? Math.min(100, Math.round((m.feitoSemanaMin / m.metaSemanalMin) * 100)) : null;
  const metaDia = m.metaDiariaMin > 0 ? Math.min(100, Math.round((m.feitoHojeMin / m.metaDiariaMin) * 100)) : null;
  const ring = (pct, rot, sub) => `<div class="hr-item">
      ${progressRing(pct == null ? 0 : pct, { size: 52, stroke: 6, grad: true, count: true })}
      <div class="hr-txt"><div class="hr-k">${rot}</div>${sub ? `<div class="hr-s">${esc(sub)}</div>` : ""}</div>
    </div>`;
  return `<section class="card hoje-rings">
      ${ring(cob, "Edital coberto", cob ? "" : "marque tópicos")}
      ${ring(aprov, "Aproveitamento", aprov == null ? "sem questões" : "")}
      ${ring(metaSem, "Meta da semana", metaSem == null ? "defina em Config" : `${m.feitoSemanaMin} / ${m.metaSemanalMin} min`)}
      ${ring(metaDia, "Meta do dia", metaDia == null ? "defina em Config" : `${m.feitoHojeMin} / ${m.metaDiariaMin} min`)}
    </section>`;
}

// Card do Mentor com voz: uma observação/ponto de atenção (o "porquê" do foco agora vive
// DENTRO do card de foco) + sugestões (propõe, não executa).
function mentorVozHTML(store, st, topicoSel, insightTxt) {
  const nomeTop = topicoSel ? rotuloTopico(st, topicoSel) : "";
  const sug = (q, lbl) => `<button class="chip hmv-sug" data-action="mentor-sug" data-q="${esc(q)}">${esc(lbl)}</button>`;
  const txt = insightTxt
    ? esc(insightTxt)
    : topicoSel
    ? "Peça questões, um resumo ou o replanejamento do dia — eu proponho, você aprova."
    : "Escolha um tópico e eu ajudo com questões, resumo e plano.";
  return `<section class="card card-ia hoje-mentor-voz">
      <div class="hmv-head"><span class="orb orb-sm" aria-hidden="true"></span><b>Mentor <span class="txt-ia">IA</span></b><span class="hmv-badge">sugere</span></div>
      <p class="hmv-porque${insightTxt ? "" : " muted"}">${insightTxt ? `${icone("sparkles")} <span class="hmv-txt" data-stream>${txt}</span>` : `<span class="hmv-txt">${txt}</span>`}</p>
      <div class="hmv-sugs">
        ${topicoSel ? sug(`Gere 10 questões de ${nomeTop}`, "Gerar questões") : ""}
        ${topicoSel ? sug(`Faça um resumo de ${nomeTop}`, "Resumir o tópico") : ""}
        ${sug("Refaça meu plano de estudos de hoje", "Refazer meu plano")}
      </div>
      <div class="hmv-nota muted small">O Mentor propõe; você aprova antes de qualquer ação.</div>
    </section>`;
}

function hubRevisoesHTML(store) {
  const fc = store.flashcardsVencidos().length;
  const mem = store.memoriasParaRevisar();
  const top = store.revisoesTopicoCount();
  const res = store.resumosParaRevisar();
  const mapasRev = store.mapasParaRevisar();
  const total = fc + mem + top + res + mapasRev;
  if (!total) return "";
  // Faixa slim (não mais um card recolhível): tudo que vence hoje, num lugar só.
  const item = (n, ico, sing, plur, rota) =>
    n ? `<button class="revitem" data-action="hub-ir" data-rota="${rota}">${ico}<b>${n}</b> ${n === 1 ? sing : plur}</button>` : "";
  return `<section class="card revhub">
    <div class="revhub-h">${icone("repeat-2")} Revisões de hoje <span class="revhub-cnt">${total}</span>
      <span class="spacer"></span><span class="muted small">tudo que vence hoje, num lugar só</span></div>
    <div class="revstrip">
      ${item(fc, icone("layers"), "flashcard", "flashcards", "flashcards")}
      ${item(mem, icone("brain"), "item de lei seca", "itens de lei seca", "leiseca")}
      ${item(top, icone("repeat-2"), "revisão de tópico", "revisões de tópico", "revtopico")}
      ${item(res, icone("file-text"), "resumo", "resumos", "resumos")}
      ${item(mapasRev, icone("network"), "mapa mental", "mapas mentais", "mapas")}
    </div>
  </section>`;
}

// Tarefas planejadas para hoje (datadas + rotinas). É SUGESTÃO: marca/conclui, aponta o
// cronômetro para a tarefa, mas nunca bloqueia o usuário de estudar outra coisa. O tempo
// (≈) é só estimativa e jamais interrompe a sessão.
function tarefasHojeHTML(store) {
  const itens = store.tarefasDoDia(todayISO());
  if (!itens.length) {
    // Estado vazio DISCRETO: só para quem já usa o planejamento (tem missões), p/ não
    // poluir quem ainda não planejou — e esclarece que a seção existe, hoje só está livre.
    if (!(store.get().missoes || []).length) return "";
    return `<details class="card tarefas-hoje-card hoje-recolhe">
      <summary class="hoje-recolhe-sum">${icone("clipboard-list")} Tarefas de hoje <span class="spacer"></span><span class="muted small" style="font-weight:400">nada hoje</span></summary>
      <p class="muted small" style="margin:8px 0 0">Nada planejado para hoje — siga o ciclo livremente. <button class="lnk small" data-action="hub-ir" data-rota="planejamento">abrir planejamento →</button></p>
    </details>`;
  }
  const pend = itens.filter((x) => !x.concluida);
  const totMin = pend.reduce((a, x) => a + (x.estimMin || 0), 0);
  const feitas = itens.length - pend.length;
  return `<details class="card tarefas-hoje-card hoje-recolhe">
    <summary class="hoje-recolhe-sum">
      ${icone("clipboard-list")} Tarefas de hoje
      <span class="spacer"></span>
      <span class="muted small">${feitas}/${itens.length} ${feitas === 1 ? "feita" : "feitas"}${totMin > 0 ? ` · ≈ ${fmtMin(totMin)}` : ""}</span>
    </summary>
    <p class="muted small" style="margin:8px 0 10px">Sugestão do que você planejou. Você é livre para estudar outra coisa.</p>
    <ul class="th-lista">
      ${itens
        .map(
          (it) => `<li class="th-item ${it.concluida ? "feito" : ""}">
            <input type="checkbox" class="th-check" data-action="th-toggle" data-tipo="${it.tipo}" data-id="${it.id}" ${it.concluida ? "checked" : ""} />
            ${it.topicoId && !it.concluida ? `<button class="th-titulo th-titulo-btn" data-action="focar-topico" data-top="${it.topicoId}" data-tip="Tornar esta tarefa o seu foco de agora.">${esc(it.titulo)}</button>` : `<span class="th-titulo">${esc(it.titulo)}</span>`}
            ${it.tipo === "rotina" ? `<span class="th-badge" data-tip="Tarefa da sua rotina semanal">${icone("repeat-2")}</span>` : ""}
            ${it.estimMin ? `<span class="muted small th-tempo" data-tip="Tempo só sugerido.">≈ ${fmtMin(it.estimMin)}</span>` : ""}
            <span class="spacer"></span>
            ${it.topicoId && !it.concluida ? `<button class="lnk th-estudar" data-action="focar-topico" data-top="${it.topicoId}" data-tip="Tornar esta tarefa o seu foco de agora.">${icone("play")} focar</button>` : ""}
          </li>`
        )
        .join("")}
    </ul>
  </details>`;
}

// Check-in gentil ao abrir o app (dir.3): balanço de ontem + hoje + streak + reforço positivo.
// Dispensável por dia (não cobra horário, não é agressivo).
function checkinHTML(store) {
  const s = store.streak();
  const ont = store.balancoOntem();
  const hj = store.balancoHoje();
  const conq = store.conquistas();
  const saud = s.estudouHoje ? "Bom te ver de novo hoje!" : s.atual > 0 ? "Bom te ver de volta!" : "Vamos começar?";
  const ontemTxt =
    ont.sessoes || ont.planejadas
      ? `Ontem você ${ont.planejadas ? `concluiu ${ont.feitas}/${ont.planejadas} ${ont.planejadas === 1 ? "tarefa" : "tarefas"}` : "estudou"}${ont.tempoMin ? ` e somou ${fmtMin(ont.tempoMin)}` : ""}.`
      : "Ontem não houve registro de estudo — sem cobrança, hoje é um novo dia.";
  const hojeTxt = hj.planejadas
    ? `Hoje: ${hj.feitas}/${hj.planejadas} ${hj.planejadas === 1 ? "tarefa" : "tarefas"}`
    : "Hoje você ainda não marcou tarefas";
  const extras = [];
  if (hj.revisoesTopico) extras.push(`${plural(hj.revisoesTopico, "revisão", "revisões")} de tópico`);
  if (hj.flashcards) extras.push(`${plural(hj.flashcards, "flashcard", "flashcards")}`);
  return `<section class="card checkin-card">
    <button class="checkin-fechar" data-action="checkin-dispensar" data-tip-pos="cima-dir" data-tip="Ok, entendi (some por hoje).">${icone("x")}</button>
    <div class="checkin-head">
      <h3>${saud}</h3>
      <div class="checkin-chips">
        <span class="chip-streak" data-tip="Dias consecutivos de estudo. Os dias de folga que você configurou não interrompem a sequência.">${icone("flame")} ${plural(s.atual, "dia seguido", "dias seguidos")}</span>
        <span class="chip-semana" data-tip="Dias estudados nesta semana sobre os dias de estudo configurados (folgas não contam).">${icone("calendar")} ${s.naSemana}/${s.metaSemana || 7} na semana</span>
      </div>
    </div>
    <p class="checkin-balanco">${ontemTxt} ${hojeTxt}${extras.length ? " · " + extras.join(" · ") : ""}.</p>
    ${conq.length ? `<div class="checkin-conquistas">${conq.map((c) => `<span class="conquista">${icone(c.icone)} ${esc(c.txt)}</span>`).join("")}</div>` : ""}
  </section>`;
}

// Banner da prova: data + contagem regressiva. Some quando não há data (estudo
// pré-edital é válido), mostrando só uma dica discreta para cadastrar.
function provaBannerHTML(m) {
  if (!m.dataProva) {
    return `<div class="prova-banner sem-data"><span class="prova-ico">${icone("calendar")}</span>
      <span class="muted small">Data da prova não cadastrada. Defina em <b>Configurações</b> para ver a contagem regressiva.</span></div>`;
  }
  const d = m.diasProva;
  let txt, cls;
  if (d > 0) {
    txt = `faltam <b>${d}</b> dia${d === 1 ? "" : "s"}`;
    cls = d <= 30 ? "urgente" : "";
  } else if (d === 0) {
    txt = "<b>é hoje!</b> Boa prova! 🍀";
    cls = "urgente";
  } else {
    txt = "<b>já passou</b>";
    cls = "passou";
  }
  return `<div class="prova-banner ${cls}">
    <span class="prova-ico">${icone("calendar")}</span>
    <span>Prova em <b>${fmtData(m.dataProva)}</b> · ${txt}</span>
  </div>`;
}

// Aviso de RETA FINAL (≤30 dias): banner destacado e premium na tela Hoje. Discreto
// (não é pop-up), reusa as classes do banner da prova + um modificador de realce. A
// faixa de 30 dias é decidida em store.retaFinal() (mesma fonte dos pontos/notificações).
function retaFinalHTML(m) {
  const d = m.diasProva;
  let titulo, micro;
  if (d === 0) {
    titulo = "Reta final: <b>é hoje!</b>";
    micro = "Respire fundo e confie no que você treinou. Boa prova! 🍀";
  } else if (d <= 7) {
    titulo = `Reta final: falta${d === 1 ? "" : "m"} <b>${d}</b> dia${d === 1 ? "" : "s"}`;
    micro = "Reta de chegada: revise o essencial, descanse e mantenha a calma.";
  } else if (d <= 15) {
    titulo = `Reta final: faltam <b>${d}</b> dias`;
    micro = "Hora de consolidar: priorize revisão e questões do que mais cai.";
  } else {
    titulo = `Reta final: faltam <b>${d}</b> dias`;
    micro = "Entrou na reta final: foque no que tem mais peso e revise sem pressa.";
  }
  return `<div class="prova-banner urgente prova-banner-reta" role="status">
    <span class="prova-ico">${icone("flame")}</span>
    <div class="prova-reta-corpo">
      <span class="prova-reta-titulo">${titulo} <span class="muted">· prova em ${fmtData(m.dataProva)}</span></span>
      <span class="prova-reta-micro muted small">${micro}</span>
    </div>
  </div>`;
}

function rotuloTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}

// Seletor de foco: lista as DISCIPLINAS e, sob cada uma, os TÓPICOS — o usuário escolhe
// (não é sugestão automática). Reaproveita a janela modal premium (abrirJanela).
function abrirSeletorTopico(store, onPick) {
  const st = store.get();
  const grupos = st.disciplinas
    .map((d) => ({ d, tops: ordenarTopicosPorBase(st, st.topicos.filter((t) => t.disciplinaId === d.id)) }))
    .filter((g) => g.tops.length);
  const soltos = ordenarTopicosPorBase(st, st.topicos.filter((t) => !st.disciplinas.some((d) => d.id === t.disciplinaId)));
  if (soltos.length) grupos.push({ d: { id: "", nome: "Sem disciplina" }, tops: soltos });
  const corpo = `<div class="seltop">
    ${grupos
      .map(
        ({ d, tops }) => `<div class="seltop-disc">
          <div class="seltop-disc-nome"><span class="disc-cor" style="background:${d.id ? store.corDisciplina(d.id) : "var(--border-strong)"}"></span>${esc(d.nome)}</div>
          <div class="seltop-tops">
            ${tops.map((t) => `<button class="seltop-top" data-top="${t.id}">${esc(t.nome)}</button>`).join("")}
          </div>
        </div>`
      )
      .join("")}
  </div>`;
  abrirJanela({
    titulo: "Escolher disciplina e tópico",
    corpoHTML: corpo,
    aoMontar: (el, fechar) => {
      el.querySelectorAll("[data-top]").forEach((b) =>
        b.addEventListener("click", () => {
          onPick(b.getAttribute("data-top"));
          fechar();
        })
      );
    },
  });
}
function dataHoje() {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}
function hojeStr() {
  return new Date().toISOString().slice(0, 10);
}
function sessoesHoje(st) {
  return st.sessoes.filter((s) => s.data.slice(0, 10) === hojeStr()).length;
}
function tempoHoje(st) {
  return st.sessoes.filter((s) => s.data.slice(0, 10) === hojeStr()).reduce((a, s) => a + (s.tempoSeg || 0), 0);
}
// Questões feitas hoje = tentativas na Prática/Simulado + questões lançadas manualmente.
function questoesHoje(st) {
  const hoje = hojeStr();
  const tent = st.tentativas.filter((t) => t.data.slice(0, 10) === hoje).length;
  const man = st.sessoes
    .filter((s) => s.data.slice(0, 10) === hoje)
    .reduce((a, s) => a + (s.qAcertos || 0) + (s.qErros || 0), 0);
  return tent + man;
}
// Aproveitamento de questões hoje (tentativas + lançamentos manuais).
function aproveitamentoQuestoesHoje(st) {
  const hoje = hojeStr();
  const tent = st.tentativas.filter((t) => t.data.slice(0, 10) === hoje);
  const sess = st.sessoes.filter((s) => s.data.slice(0, 10) === hoje);
  const acerto = tent.filter((t) => t.acertou).length + sess.reduce((a, s) => a + (s.qAcertos || 0), 0);
  const total = tent.length + sess.reduce((a, s) => a + (s.qAcertos || 0) + (s.qErros || 0), 0);
  return total ? Math.round((acerto / total) * 100) : null;
}
