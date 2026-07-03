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
import { abrirRegistroSessao } from "../registro-sessao.js";
import { progressRing } from "../viz.js";

let sel = { fase: null, topicoId: null };
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
  // O foco só é "sugerido pelo Mentor" quando o tópico atual É a sugestão (plano.topico).
  // Se o usuário trocou o tópico manualmente, o foco é escolha dele (sincroniza selos e badges).
  const focoEhSugestao = !!(topicoSel && plano.topico && topicoSel.id === plano.topico.id);

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
            ? `<div class="pb pb-ai" style="--c:${focoEhSugestao ? "var(--accent)" : "var(--primary)"}" data-action="focar-topico" data-top="${topicoSel.id}" data-fase="${sel.fase}">
          <span class="pb-stripe"></span>
          <div class="pb-top"><span class="pb-tag">Foco</span>${focoEhSugestao ? `<span class="pb-src pb-ai-src">${icone("sparkles")} Mentor</span>` : `<span class="pb-src pb-you">Você escolheu</span>`}<span class="pb-tm">agora</span></div>
          <h4>${esc(topicoSel.nome)}</h4>
          <div class="pb-meta">${esc(faseInfo.nome)} · ~${st.config.pomodoroFoco || 25} min${focoEhSugestao ? " · sugerido do seu edital" : ""}</div>
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
    <div class="page-head hoje-head">
      <div>
        <h1 class="hoje-hero">${topicoSel ? `Seu foco de hoje está <span class="g">pronto</span>.` : "Hoje"}</h1>
        ${topicoSel ? "" : `<p class="sub">Seu dia de estudo, num relance.</p>`}
      </div>
      <button class="btn btn-ghost btn-sm side-registrar" data-action="abrir-registro" data-tip="Lançar uma sessão de estudo (com ou sem cronômetro), páginas ou questões.">Registrar sessão</button>
    </div>

    ${reta.ativo ? retaFinalHTML(metas) : ""}

    <div class="hoje-grid">
    <section class="card foco-hero" style="--cor:${faseInfo.cor}">
      <div class="foco-top">
        <div class="foco-eyebrow"><span class="orb orb-xs" aria-hidden="true"></span> Seu foco agora${focoEhSugestao ? ` <span class="foco-selo">sugerido pelo Mentor</span>` : topicoSel ? ` <span class="foco-selo foco-selo-voce">sua escolha</span>` : ""}</div>
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
        <button class="btn btn-ghost btn-crono" data-action="abrir-crono" data-tip="Abrir o cronômetro de foco — definir o tempo e iniciar quando quiser." aria-label="Cronômetro de foco">${icone("clock-3")}</button>
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

  // O cronômetro vive no flutuante/tela cheia (não há mais display inline na Home).
  // A Home só avisa que está visível — o flutuante aparece igual, e este flag habilita
  // o confete ao cruzar o alvo do bloco enquanto o usuário está aqui.
  crono.setTelaHoje(true);

  bindActions(root, {
    // "Começar agora": inicia o cronômetro e entra em modo foco (tela cheia imersiva).
    "foco-comecar": () => {
      crono.iniciar();
      crono.setModoTela("focus");
    },
    // Ícone de cronômetro: abre a tela cheia SEM iniciar — o usuário define modo/tempo e
    // dá play ali (deixa o cronômetro visível/acessível de novo, sem forçar o início).
    "abrir-crono": () => crono.setModoTela("focus"),
    // Abre a janela de registro de sessão (manual) já apontada para o foco atual.
    "abrir-registro": () => abrirRegistroSessao(store, app, { modo: "manual", fasePadrao: sel.fase, topicoPadrao: sel.topicoId }),
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
    // Ao sair da tela: religa o mini-relógio flutuante em qualquer tela.
    // NÃO para o cronômetro — ele continua ticando no módulo global.
    crono.setTelaHoje(false);
  };
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
  // Mesmo padrão visual do "Plano de hoje" (cabeçalho de seção + chips), SEM card de fundo —
  // como no protótipo. Estado vazio informativo (pedido do usuário): saber que está em dia ajuda.
  const cab = (dir) =>
    `<div class="plano-h"><h2>Revisões de hoje</h2>${total ? `<span class="cnt">${total}</span>` : ""}<span class="sp"></span>${dir}</div>`;
  if (!total) {
    return `<section class="plano-sec revhub-sec">
      ${cab(`<span class="revhub-ok muted small">${icone("check-check")} nada vence hoje — você está em dia</span>`)}
    </section>`;
  }
  const item = (n, ico, sing, plur, rota) =>
    n ? `<button class="revitem" data-action="hub-ir" data-rota="${rota}">${ico}<b>${n}</b> ${n === 1 ? sing : plur}</button>` : "";
  return `<section class="plano-sec revhub-sec">
    ${cab(`<a data-action="hub-ir" data-rota="revtopico">abrir tudo →</a>`)}
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
