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
import { lembretesListaHTML, abrirLembretes, tratarCliqueLembrete } from "../lembretes.js";

let sel = { fase: null, topicoId: null, blocoMin: null, missaoId: null }; // blocoMin: tempo do bloco; missaoId: tarefa planejada em foco (pré-seleciona no registro)
let anelAnimou = false; // count-up dos anéis só na 1ª renderização da sessão (não re-anima a cada ação)
let mentorFalou = false; // streaming do texto do Mentor só uma vez por sessão (não re-digita a cada ação)

// "Por quê" data-driven do foco de hoje (voz de IA de verdade, não filler): usa SÓ sinais
// que existem no app — revisão vencida, desempenho fraco, flashcards vencidos, relevância.
// Degrada para "" quando não há sinal (usuário novo/base vazia) — a lição do redesign revertido:
// NUNCA inventar dado nem mostrar caixa vazia. Combina no máximo 2 sinais, do mais urgente ao menos.
function porqueFoco(store, st, topico) {
  if (!topico) return "";
  const sinais = [];
  // Nota: "a revisão vence hoje" NÃO entra aqui — é redundante com a seção de revisões
  // logo abaixo na própria tela (decisão do usuário, jul/2026).
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
  const lembTotal = store.lembretes().length;
  const lembPend = store.lembretesPendentes ? store.lembretesPendentes() : 0;

  if (!sel.fase) sel.fase = plano.fase;
  if (app.params && app.params.reta) {
    sel.fase = "R";
    app.params.reta = null;
  }
  if (!sel.topicoId && plano.topico) sel.topicoId = plano.topico.id;
  // Quando ocioso e em modo regressivo, alinha o alvo ao tempo do BLOCO planejado em foco
  // (se houver) ou, na falta dele, ao bloco padrão das configurações.
  if (crono.snapshot().modo === "regressivo") crono.setTargetIfIdle((sel.blocoMin || st.config.pomodoroFoco || 25) * 60);

  const faseInfo = FASES[sel.fase] || plano.faseInfo;
  const topicoSel = st.topicos.find((t) => t.id === sel.topicoId) || plano.topico;
  // O foco só é "sugerido pelo Mentor" quando FASE **e** TÓPICO batem com a sugestão
  // (plano.fase + plano.topico). Trocar a aba (Estudo/Prática/Revisão) OU o tópico já é
  // escolha do usuário — senão o selo afirmaria uma sugestão que o Mentor não fez.
  const focoEhSugestao = !!(topicoSel && plano.topico && topicoSel.id === plano.topico.id && sel.fase === plano.fase);

  const vencidos = store.flashcardsVencidos().length;
  const metas = store.metas();
  const pontos = store.pontosAtencao();
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
  const reta = store.retaFinal();
  // A faixa de insight NÃO repete o que já está no hub "Revisões de hoje" (flashcards
  // vencidos, revisão de tópico, mapas) — mostra o 1º ponto de atenção AINDA não coberto ali.
  const COBERTO_PELO_HUB = new Set(["venc", "revtop", "mapas"]);
  const pontoInsight = pontos.find((p) => !COBERTO_PELO_HUB.has(p.key));
  // Revisão do PRÓPRIO tópico em foco vencendo hoje: o Mentor comenta isso (contextual e
  // acionável, nomeando o tópico) — diferente do hub "Revisões de hoje", que dá só a
  // contagem genérica. Tem prioridade sobre o ponto de atenção comum.
  const revFoco = topicoSel ? store.revisaoTopicoDe(topicoSel.id) : null;
  const focoRevVenceHoje = !!(revFoco && revFoco.proxima && revFoco.proxima <= todayISO());
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
    return `<div class="pb pb-task${it.concluida ? " pb-done" : ""}" style="--c:${cor}"${!it.concluida && (it.topicoId || it.estimMin) ? ` data-action="focar-topico"${it.topicoId ? ` data-top="${it.topicoId}"` : ""} data-min="${it.estimMin || ""}"${it.tipo === "missao" ? ` data-missao="${it.id}"` : ""}` : ""}>
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
          <span class="pb-add-pl">${icone("plus")}</span><span class="pb-add-t">Adicionar ao dia</span><span class="pb-add-m">Outra matéria, tarefa ou sessão</span>
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
      <div class="hoje-head-acoes">
        <button class="btn btn-ghost btn-sm side-crono" data-action="abrir-crono" data-tip="Abrir o cronômetro de foco — definir o tempo e iniciar quando quiser.">Cronômetro</button>
        <button class="btn btn-ghost btn-sm side-registrar" data-action="abrir-registro" data-tip="Lançar uma sessão de estudo (com ou sem cronômetro), páginas ou questões.">Registrar sessão</button>
      </div>
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
      ${
        st.topicos.length
          ? `<div class="foco-meta">
        <div class="fm"><span class="fm-k">Bloco${sel.blocoMin ? " · do plano" : ""}</span><span class="fm-v">${sel.blocoMin || st.config.pomodoroFoco || 25} min</span></div>
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
        <button class="btn btn-ghost" data-action="foco-revisar" data-topico="${topicoSel ? topicoSel.id : ""}" data-tip="Revisar os flashcards do tópico em foco. (As demais revisões ficam no hub 'Revisões de hoje' abaixo.)">Revisar tópico atual</button>`
            : `<button class="btn btn-primary btn-lg" data-action="hub-ir" data-rota="edital">Montar meu edital →</button>`
        }
      </div>
    </section>
      <aside class="hoje-side">
        ${ringsHTML(store)}
        ${mentorVozHTML(store, st, topicoSel, focoRevVenceHoje ? `A revisão de ${topicoSel.nome} vence hoje — quer resolver agora?` : porqueHoje || (pontoInsight ? pontoInsight.txt : ""))}
      </aside>
    </div>

    <div class="hoje-split">
      <div class="hoje-split-main">
        ${hubRevisoesHTML(store)}
        ${planoSec}
      </div>
      <section class="plano-sec hoje-lembretes hoje-split-side">
        <div class="plano-h"><h2>Lembretes</h2>${lembPend ? `<span class="cnt">${lembPend}</span>` : ""}<span class="sp"></span>
          <button class="lnk small" data-lem-novo data-tip="Adicionar um recado">${icone("plus")} Novo</button>
        </div>
        ${lembPend ? lembretesListaHTML(store, { soPendentes: true }) : `<p class="muted small lem-sec-vazia">Sem lembretes${lembTotal ? " pendentes" : ""}. Anote o que não pode esquecer — prova, inscrição, boleto… <a data-lem-novo>criar o primeiro →</a></p>`}
      </section>
    </div>

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
  // Fase 2: o insight do card do Mentor é DETERMINÍSTICO (heurística local, instantâneo) —
  // efeito de "digitação" aqui era teatro de IA e desgastava a credibilidade do streaming
  // verdadeiro (chat). Entra com um fade sutil, 1x por sessão.
  if (!mentorFalou) {
    const mv = root.querySelector(".hmv-txt[data-stream]");
    if (mv) {
      mv.classList.add("hmv-fade-in");
      mentorFalou = true;
    }
  }

  function atualizaVinculo() {
    const t = st.topicos.find((x) => x.id === sel.topicoId);
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
  // Card de Lembretes na Hoje: marcar feito / remover / novo (abre o mesmo popover do topo).
  root.querySelector(".hoje-lembretes")?.addEventListener("click", (e) => {
    if (e.target.closest("[data-lem-novo]")) { abrirLembretes(store, () => app.refresh()); return; }
    tratarCliqueLembrete(e, store, () => app.refresh());
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

  // Rotas que sabem filtrar por um tópico (via params.topicoId). Só nelas faz sentido
  // perguntar o ESCOPO (deste tópico x geral); nas demais abre o conteúdo como está.
  const ESCOPO_TOPICO = new Set(["pratica", "pratica-ce", "flashcards", "erros", "resumos", "mapas"]);
  // Navega para `rota`; se houver tópico em foco e a rota suportar filtro, pergunta o escopo.
  const navComEscopo = async (rota) => {
    const tid = sel.topicoId;
    const topico = tid ? st.topicos.find((t) => t.id === tid) : null;
    if (!topico || !ESCOPO_TOPICO.has(rota)) { app.navigate(rota); return; }
    const nome = topico.nome.length > 32 ? topico.nome.slice(0, 32) + "…" : topico.nome;
    const v = await escolher("Qual escopo?", [
      { label: `Deste tópico · ${nome}`, value: "t", cls: "btn-primary" },
      { label: "Todos os tópicos", value: "g" },
    ]);
    if (!v) return;
    app.navigate(rota, v === "t" ? { topicoId: tid } : {});
  };

  bindActions(root, {
    // "Começar agora": inicia o cronômetro e entra em modo foco (tela cheia imersiva).
    "foco-comecar": () => {
      // Bloco planejado tem duração definida → estuda como Timer (regressivo) desse tamanho,
      // ligando o tempo do plano ao cronômetro mesmo se o modo atual for Pomodoro/Cronômetro.
      // Sem bloco (foco do Mentor), mantém o modo e o tempo que o usuário já usa.
      if (sel.blocoMin) {
        crono.setModo("regressivo");
        crono.setTarget(sel.blocoMin * 60);
      }
      crono.iniciar();
      crono.setModoTela("focus");
    },
    // Ícone de cronômetro: abre a tela cheia SEM iniciar — o usuário define modo/tempo e
    // dá play ali (deixa o cronômetro visível/acessível de novo, sem forçar o início).
    "abrir-crono": () => crono.setModoTela("focus"),
    // Abre a janela de registro de sessão (manual) já apontada para o foco atual.
    "abrir-registro": () => abrirRegistroSessao(store, app, { modo: "manual", fasePadrao: sel.fase, topicoPadrao: sel.topicoId, missaoPadrao: sel.missaoId }),
    // Trocar o tópico em foco: seletor disciplina → tópico (o usuário escolhe, não o sistema).
    "trocar-topico": () => {
      abrirSeletorTopico(store, (topId) => {
        sel.topicoId = topId;
        sel.blocoMin = null; // escolha manual não é bloco planejado
        sel.missaoId = null;
        app.refresh();
      });
    },
    // Sugestões do card do Mentor: repassa ao chat (propõe → confirma → executa).
    "mentor-sug": (el) => {
      const q = el.getAttribute("data-q") || "";
      if (typeof app.perguntarNoChat === "function") app.perguntarNoChat(q);
      else app.navigate("mentor");
    },
    // "Refazer meu plano": abre o Mentor IA e dispara a reanálise (ação real, não mais chat morto).
    "refazer-plano": () => app.navigate("mentor", { autoAnalisar: true }),
    // Fase 3: plano novo (auto-análise) — só ABRE (sem reanalisar de novo).
    "ver-plano": () => app.navigate("mentor"),
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
      const min = Number(el.getAttribute("data-min"));
      sel.missaoId = el.getAttribute("data-missao") || null; // tarefa do bloco → pré-seleciona no registro
      if (top) {
        // Tarefa COM tópico → vira o "foco de agora" (tópico + tempo do bloco no cronômetro).
        sel.topicoId = top;
        const f = el.getAttribute("data-fase");
        if (f && FASES[f]) sel.fase = f;
        sel.blocoMin = min > 0 ? min : null;
        if (sel.blocoMin) {
          const snap = crono.snapshot();
          if (!snap.running && snap.elapsed === 0) { crono.setModo("regressivo"); crono.setTarget(sel.blocoMin * 60); }
        }
        app.refresh();
        requestAnimationFrame(() => root.querySelector(".foco-hero")?.scrollIntoView({ behavior: "smooth", block: "center" }));
        toast("Foco atualizado — comece quando quiser.");
      } else if (min > 0) {
        // Tarefa SÓ com tempo (sem tópico real) → é um bloco de tempo puro: vai direto pro
        // cronômetro em modo Timer e abre o relógio, SEM associar um tópico falso ao foco.
        const snap = crono.snapshot();
        const ocioso = !snap.running && snap.elapsed === 0;
        if (ocioso) { crono.setModo("regressivo"); crono.setTarget(min * 60); }
        crono.setModoTela("focus");
        toast(ocioso ? `Timer de ${min} min pronto — dê play quando quiser.` : "Cronômetro em uso — finalize a sessão atual antes.");
      }
    },
    "ir-pratica": async () => {
      sel.fase = "A";
      // Respeita quais telas de questões estão visíveis (Configurações → Botões da barra):
      // múltipla escolha, certo/errado e DISCURSIVA/redação. Só pergunta se houver mais de uma.
      const oc = st.config.botoesOcultos || [];
      const tipos = [
        { value: "pratica", label: "Múltipla escolha", ico: "list-checks" },
        { value: "pratica-ce", label: "Certo / errado", ico: "check-check" },
        { value: "correcao", label: "Discursiva / redação", ico: "pencil-line" },
      ].filter((t) => !oc.includes(t.value));
      if (!tipos.length) { await navComEscopo("pratica"); return; }
      let rota = tipos[0].value;
      if (tipos.length > 1) {
        const v = await escolher("Praticar questões — qual tipo?", tipos, { lista: true });
        if (!v) return;
        rota = v;
      }
      await navComEscopo(rota);
    },
    // "Revisar tópico atual": revisa direto os flashcards do tópico em foco (escopo).
    // As demais revisões (tópicos, erros, resumos, mapas) ficam no hub "Revisões de hoje"
    // abaixo — antes este botão abria um menu que DUPLICAVA esse hub.
    "foco-revisar": (el) => {
      sel.fase = "R";
      const tid = el.getAttribute("data-topico");
      app.navigate("flashcards", tid ? { topicoId: tid } : {});
    },
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

// Card do Mentor com voz: o "porquê" do foco agora (banca/erros/flashcards), ou a revisão
// que vence, ou um ponto de atenção — tudo aqui, NÃO no card de foco + sugestões (propõe, não executa).
function mentorVozHTML(store, st, topicoSel, insightTxt) {
  const nomeTop = topicoSel ? rotuloTopico(st, topicoSel) : "";
  const sug = (q, lbl) => `<button class="chip hmv-sug" data-action="mentor-sug" data-q="${esc(q)}">${esc(lbl)}</button>`;
  // Fase 3: PLANO NOVO ainda não visto tem prioridade no card — a fala genuína da IA
  // (auto-análise do boot) aparece AQUI, não escondida numa aba.
  const planoNovo = store.mentorPlanoNaoVisto && store.mentorPlanoNaoVisto() ? st.config.mentorPlano : null;
  if (planoNovo && planoNovo.analise) {
    const nSug = Object.values((planoNovo.acoes || {})).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
    const frase = String(planoNovo.analise).split(/(?<=\.)\s/)[0].slice(0, 220);
    return `<section class="card card-ia hoje-mentor-voz">
        <div class="hmv-head"><span class="orb orb-sm" aria-hidden="true"></span><b>Mentor <span class="txt-ia">IA</span></b><span class="hmv-badge">plano novo</span></div>
        <p class="hmv-porque">${icone("sparkles")} <span class="hmv-txt" data-stream>Analisei seu progresso: ${esc(frase)}</span></p>
        <div class="hmv-sugs">
          <button class="chip hmv-sug" data-action="ver-plano" data-tip="Abre o plano completo para você revisar e aprovar.">${icone("arrow-right")} Ver o plano completo${nSug ? ` (${nSug} ${nSug === 1 ? "sugestão" : "sugestões"})` : ""}</button>
        </div>
      </section>`;
  }
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
        <button class="chip hmv-sug" data-action="refazer-plano" data-tip="Abre o Mentor IA e reanalisa seu progresso — propõe metas, tarefas e revisões pra você aprovar.">${icone("refresh-cw")} Refazer meu plano</button>
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
    // Frase sempre verdadeira: cobre tanto "não havia revisões" quanto "já concluiu todas".
    // Fica ABAIXO do cabeçalho (com respiro), como uma primeira linha — mais visual.
    return `<section class="plano-sec revhub-sec revhub-vazia">
      ${cab("")}
      <p class="revhub-ok muted small">Você está em dia com as revisões</p>
    </section>`;
  }
  const item = (n, ico, sing, plur, rota) =>
    n ? `<button class="revitem" data-action="hub-ir" data-rota="${rota}">${ico}<b>${n}</b> ${n === 1 ? sing : plur}</button>` : "";
  // Fase 1: "abrir tudo" e os itens de tópico/resumo/mapa apontam para a CENTRAL —
  // é ela quem lista e dá baixa graduada; as telas de origem guardam só o conteúdo.
  return `<section class="plano-sec revhub-sec">
    ${cab(`<a data-action="hub-ir" data-rota="revisoes">abrir tudo →</a>`)}
    <div class="revstrip">
      ${item(fc, icone("layers"), "flashcard", "flashcards", "flashcards")}
      ${item(mem, icone("brain"), "item de lei seca", "itens de lei seca", "leiseca")}
      ${item(top, icone("repeat-2"), "revisão de tópico", "revisões de tópico", "revisoes")}
      ${item(res, icone("file-text"), "resumo", "resumos", "revisoes")}
      ${item(mapasRev, icone("network"), "mapa mental", "mapas mentais", "revisoes")}
    </div>
  </section>`;
}

// Aviso de RETA FINAL (≤30 dias): banner destacado e premium na tela Hoje. Discreto
// (não é pop-up), reusa as classes do banner da prova + um modificador de realce. A
// faixa de 30 dias é decidida em store.retaFinal() (mesma fonte dos pontos/notificações).
function retaFinalHTML(m) {
  const d = m.diasProva;
  let titulo, micro;
  if (d === 0) {
    titulo = "Reta final: <b>é hoje!</b>";
    micro = "Respire fundo e confie no que você treinou. Boa prova!";
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
