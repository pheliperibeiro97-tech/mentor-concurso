// Tela "Hoje": conduz o ciclo do dia + cronômetro Pomodoro + lançamento manual.
// Cronômetro com dois modos: REGRESSIVO (conta para baixo de um tempo definível) e
// PROGRESSIVO (conta para cima até você interromper).
import { bindActions, toast, header, escolher, faixaIA, celebrarMeta, plural, abrirJanela, ativarCountUp, revelarTexto } from "../ui.js";
import { esc, fmtMMSS, fmtTempo, fmtData, fmtMin, todayISO } from "../util.js";
import { icone } from "../icones.js";
import { FASES, ORDEM_FASES, ordenarTopicosPorBase } from "../ciclo.js";
import * as crono from "../cronometro.js";
import { abrirRegistroSessao } from "../registro-sessao.js";
import { progressRing } from "../viz.js";
import { lembretesListaHTML, abrirLembretes, tratarCliqueLembrete } from "../lembretes.js";

// Foco de agora. `tarefaId`/`tarefaTipo` apontam a TAREFA em foco — o foco não é mais só um
// tópico: "ler lei seca" e "ver informativo" são tarefas legítimas e muitas nem têm tópico
// (as importadas de cronograma nunca têm). `manual` marca que o usuário escolheu o tópico à
// mão, para a semente do plano não atropelar a escolha dele. `dia` faz o foco expirar na virada.
let sel = { fase: null, topicoId: null, blocoMin: null, missaoId: null, tarefaId: null, tarefaTipo: null, faseDeTarefa: null, manual: false, dia: null };
let anelAnimou = false; // count-up dos anéis só na 1ª renderização da sessão (não re-anima a cada ação)
let mentorFalou = false; // streaming do texto do Mentor só uma vez por sessão (não re-digita a cada ação)

// Categoria da tarefa → fase do estudo. É o único uso funcional da categoria no app: sem isso
// ela é só uma etiqueta colorida no Planejamento.
const CAT_FASE = { "Prática": "A", "Revisão": "R", "Materiais": "E", "Lei Seca": "E", "Jurisprudência": "E" };
// Põe uma tarefa no foco. Aplicada tanto pela semente do plano quanto pelo clique — antes cada
// caminho fazia uma coisa diferente, e a categoria só virava fase na primeiríssima renderização.
function aplicarTarefaAoFoco(t, st) {
  sel.tarefaId = t.id;
  sel.tarefaTipo = t.tipo;
  sel.missaoId = t.tipo === "missao" ? t.id : null;
  sel.blocoMin = t.estimMin || null;
  // Tópico é OPCIONAL: tarefa sem tópico (lei seca, informativo, importada de cronograma) vira
  // foco do mesmo jeito e não arrasta um tópico velho junto, que confundiria o registro.
  sel.topicoId = t.topicoId && (st.topicos || []).some((x) => x.id === t.topicoId) ? t.topicoId : null;
  // A fase vem da categoria a cada troca de tarefa; trocar de aba depois continua livre.
  if (CAT_FASE[t.categoria] && sel.faseDeTarefa !== t.id) { sel.fase = CAT_FASE[t.categoria]; sel.faseDeTarefa = t.id; }
}

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

  // ===== Foco de agora =====
  // O foco segue o PLANO quando existe um: a primeira tarefa pendente do dia, na ordem em que
  // você planejou — COM OU SEM tópico. Antes o foco vinha sempre do ciclo (score, revisão
  // vencida, ordem das aulas) e exigia tópico, então "ler lei seca" e qualquer tarefa vinda de
  // importação de cronograma (que nasce sem tópico) nunca podiam ser o foco.
  // Tarefa AVULSA (sem dia marcado) não entra sozinha: vira foco só no clique.
  const hojeISO = todayISO();
  if (sel.dia !== hojeISO) sel = { fase: null, topicoId: null, blocoMin: null, missaoId: null, tarefaId: null, tarefaTipo: null, faseDeTarefa: null, manual: false, dia: hojeISO };
  const tarefasDia = store.tarefasDoDia(hojeISO);
  const tarefasTodas = [...tarefasDia, ...store.tarefasAvulsasHoje()];
  // A tarefa em foco é relida a cada render: concluída, apagada ou de outro dia, ela cai
  // sozinha e o foco volta a se semear — em vez de grudar até recarregar o app.
  let tarefaFoco = sel.tarefaId ? tarefasTodas.find((t) => t.id === sel.tarefaId && t.tipo === sel.tarefaTipo && !t.concluida) : null;
  if (sel.tarefaId && !tarefaFoco) { sel.tarefaId = null; sel.tarefaTipo = null; sel.missaoId = null; sel.blocoMin = null; }
  if (!tarefaFoco && !sel.manual) {
    tarefaFoco = tarefasDia.find((t) => !t.concluida);
    if (tarefaFoco) aplicarTarefaAoFoco(tarefaFoco, st);
  }
  if (!sel.fase) sel.fase = plano.fase;
  if (app.params && app.params.reta) {
    sel.fase = "R";
    app.params.reta = null;
  }
  // Sem tarefa em foco, o tópico do ciclo assume. COM tarefa em foco, não: uma tarefa sem
  // tópico tem de poder ficar sem tópico, senão o registro grava a sessão no tópico errado.
  if (!sel.topicoId && !tarefaFoco && plano.topico) sel.topicoId = plano.topico.id;
  // Quando ocioso e em modo regressivo, alinha o alvo ao tempo do BLOCO planejado em foco
  // (se houver) ou, na falta dele, ao bloco padrão das configurações.
  if (crono.snapshot().modo === "regressivo") crono.setTargetIfIdle((sel.blocoMin || st.config.pomodoroFoco || 25) * 60);

  const faseInfo = FASES[sel.fase] || plano.faseInfo;
  const topicoSel = st.topicos.find((t) => t.id === sel.topicoId) || (tarefaFoco ? null : plano.topico);
  // O foco só é "sugerido pelo Mentor" quando FASE **e** TÓPICO batem com a sugestão
  // (plano.fase + plano.topico). Trocar a aba (Estudo/Prática/Revisão) OU o tópico já é
  // escolha do usuário — senão o selo afirmaria uma sugestão que o Mentor não fez.
  const focoEhSugestao = !!(topicoSel && plano.topico && topicoSel.id === plano.topico.id && sel.fase === plano.fase);
  // Foco que veio do PLANO leva selo próprio: dizer "sugerido pelo Mentor" no que o usuário
  // mesmo planejou seria atribuir ao app uma escolha que é dele.
  // Basta a tarefa estar em foco — ela não precisa ter tópico para o selo ser verdadeiro.
  const focoDoPlano = !!tarefaFoco;

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
  // "Plano de hoje": SÓ as tarefas planejadas pelo usuário + "Adicionar ao dia". O card-herói
  // acima não repete o item, mas agora NASCE dele (ver o seed de `sel` no topo): o foco do dia
  // é a primeira tarefa pendente do plano. Contadores contam só o que resta.
  // Tarefas AVULSAS (sem dia marcado): antes só apareciam em Planejamento → Tarefas avulsas,
  // nunca em "Hoje" — mesmo sendo, por definição, coisa que dá pra fazer em qualquer dia,
  // inclusive hoje. Entram como um bloco à parte (não contam nos contadores de "hoje", que
  // seguem só o que foi planejado PARA hoje). As PENDENTES ficam sempre; as que você concluiu
  // aparecem só no dia em que concluiu (igual uma tarefa datada, que só existe no dia marcado).
  const tarefasAvulsas = store.tarefasAvulsasHoje();
  const avulsasPendentes = tarefasAvulsas.filter((t) => !t.concluida).length;
  const avulsasFeitasHoje = tarefasAvulsas.length - avulsasPendentes;
  const nPlano = tarefasDia.length;
  const minPlano = tarefasDia.reduce((a, x) => a + (x.estimMin || 0), 0);
  const pbTask = (it) => {
    const cor = it.tipo === "rotina" ? "#f472b6" : "#818cf8";
    const tag = it.tipo === "rotina" ? "Rotina" : it.data ? "Tarefa" : "Avulsa";
    // TODA tarefa pendente é clicável, com ou sem tópico e com ou sem tempo: antes só era
    // clicável quando tinha um dos dois, e tarefa de cronograma importado não tem nenhum —
    // ficava impossível colocá-la em foco.
    const emFoco = !it.concluida && sel.tarefaId === it.id && sel.tarefaTipo === it.tipo;
    return `<div class="pb pb-task${it.concluida ? " pb-done" : ""}${emFoco ? " pb-foco" : ""}" style="--c:${cor}"${!it.concluida ? ` data-action="focar-tarefa" data-tarefa="${it.id}" data-tarefa-tipo="${it.tipo}"` : ""}>
        <span class="pb-stripe"></span>
        <div class="pb-top"><span class="pb-tag">${tag}</span><span class="pb-src pb-you">${it.tipo === "rotina" ? "Sua rotina" : it.data ? "Você planejou" : "Sem dia marcado"}</span>${it.estimMin ? `<span class="pb-tm">≈ ${fmtMin(it.estimMin)}</span>` : ""}${emFoco ? `<span class="pb-tm pb-emfoco">em foco</span>` : ""}</div>
        <h4><span class="pb-chk" data-action="th-toggle" data-tipo="${it.tipo}" data-id="${it.id}"${it.concluida ? " data-on" : ""}></span>${esc(it.titulo)}</h4>
      </div>`;
  };
  const planoSec = `
    <section class="plano-sec">
      <div class="plano-h"><h2>Plano de hoje</h2>${nPlano ? `<span class="cnt">${plural(nPlano, "item", "itens")}${minPlano ? ` · ${fmtMin(minPlano)}` : ""}</span>` : ""}<span class="sp"></span><a data-action="hub-ir" data-rota="planejamento">Ver semana →</a></div>
      <div class="plano-blocos">
        ${tarefasDia.map(pbTask).join("")}
        <button class="pb pb-add" data-action="hub-ir" data-rota="planejamento">
          <span class="pb-add-pl">${icone("plus")}</span><span class="pb-add-t">Adicionar ao dia</span><span class="pb-add-m">Outra matéria, tarefa ou sessão</span>
        </button>
      </div>
      ${tarefasAvulsas.length ? `<div class="plano-avulsas-h muted small">${icone("clipboard-list")} ${plural(avulsasPendentes, "tarefa avulsa pendente", "tarefas avulsas pendentes")}${avulsasFeitasHoje ? ` · ${plural(avulsasFeitasHoje, "concluída hoje", "concluídas hoje")}` : ""} (sem dia marcado)</div>
      <div class="plano-blocos">${tarefasAvulsas.map(pbTask).join("")}</div>` : ""}
    </section>`;

  // Recomposição visual (gap nº1): o card de FOCO é o herói (topo) e é o ÚNICO lugar do
  // foco sugerido — o "Plano de hoje" abaixo lista só o que o usuário planejou.
  const porqueHoje = topicoSel ? porqueFoco(store, st, topicoSel) : "";
  const discFoco = topicoSel ? st.disciplinas.find((d) => d.id === topicoSel.disciplinaId) : null;
  // O que o Mentor tem a propor além do que já está em foco: o tópico do ciclo (quando não é o
  // que você já está vendo) e as revisões pendentes. Vira botão no card dele.
  const revPendentes = store.flashcardsVencidos().length + store.revisoesTopicoCount() + store.memoriasParaRevisar() + store.resumosParaRevisar() + store.mapasParaRevisar();
  const sugestaoMentor = {
    topico: plano.topico || null,
    fase: plano.fase || "",
    jaEmFoco: !!(plano.topico && topicoSel && plano.topico.id === topicoSel.id && !tarefaFoco),
    revisoes: revPendentes,
    topicoRev: revFoco && revFoco.proxima && revFoco.proxima <= todayISO() && topicoSel ? topicoSel.id : "",
  };
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
        <div class="foco-eyebrow"><span class="orb orb-xs" aria-hidden="true"></span> Seu foco agora${focoDoPlano ? ` <span class="foco-selo foco-selo-voce">do seu plano de hoje</span>` : focoEhSugestao ? ` <span class="foco-selo">sugerido pelo Mentor</span>` : topicoSel ? ` <span class="foco-selo foco-selo-voce">sua escolha</span>` : ""}</div>
        <div class="seg seg-fases" role="tablist">
          ${ORDEM_FASES.map((f) => `<button class="${f === sel.fase ? "on" : ""}" data-sel-fase="${f}" style="--cor:${FASES[f].cor}" data-tip="${esc(FASES[f].desc)}">${FASES[f].nome}</button>`).join("")}
        </div>
      </div>
      ${tarefaFoco ? `<div class="foco-disc">${esc(tarefaFoco.categoria && tarefaFoco.categoria !== "Não definida" ? tarefaFoco.categoria : (tarefaFoco.data ? "Tarefa de hoje" : "Tarefa avulsa"))}${discFoco ? ` · ${esc(discFoco.nome)}` : ""}</div>`
        : discFoco ? `<div class="foco-disc">${esc(discFoco.nome)}</div>` : ""}
      <div class="foco-topline">
        <div class="foco-topico-nome">${tarefaFoco ? esc(tarefaFoco.titulo) : topicoSel ? esc(topicoSel.nome) : st.topicos.length ? "Escolha um tópico" : "Monte seu edital para o Mentor montar seu dia"}</div>
        ${st.topicos.length ? `<button class="btn btn-ghost btn-sm foco-trocar" data-action="trocar-topico" data-tip="${tarefaFoco && !topicoSel ? "Vincular um tópico do edital a esta tarefa (opcional)." : "Escolher outra disciplina e tópico."}">${icone("repeat-2")} ${tarefaFoco && !topicoSel ? "Vincular tópico" : "Trocar tópico"}</button>` : ""}
      </div>
      ${
        st.topicos.length
          ? `<div class="foco-meta">
        <div class="fm"><span class="fm-k">Bloco${sel.blocoMin ? " · do plano" : ""}</span><span class="fm-v">${sel.blocoMin || st.config.pomodoroFoco || 25} min</span></div>
        ${ondePareiFase ? `<div class="fm"><span class="fm-k">Onde parei</span><span class="fm-v">${esc(ondePareiFase)}</span></div>` : ""}
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
        ${mentorVozHTML(store, st, topicoSel, focoRevVenceHoje ? `A revisão de ${topicoSel.nome} vence hoje — quer resolver agora?` : porqueHoje || (pontoInsight ? pontoInsight.txt : ""), sugestaoMentor)}
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
      <span class="muted small">Hoje: <b>${fmtTempo(tempoHoje(st))}</b> em foco · <b>${sessoesHoje(st)}</b> ${sessoesHoje(st) === 1 ? "sessão" : "sessões"} · <b>${questoesHoje(st)}</b> ${questoesHoje(st) === 1 ? "questão" : "questões"}</span>
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
    // Sem tópico, o rótulo é o TÍTULO DA TAREFA: o cronômetro flutuante mostrava só a fase
    // ("Estudo") quando o foco era "ler lei seca", e não dava para saber o que estava rodando.
    crono.vincular({
      fase: sel.fase,
      topicoId: sel.topicoId,
      faseNome: FASES[sel.fase]?.nome || "",
      topicoLabel: t ? rotuloTopico(st, t) : (tarefaFoco ? tarefaFoco.titulo : ""),
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
        // Com uma tarefa em foco, escolher tópico é VINCULAR o tópico a ela (a tarefa continua
        // em foco, com o bloco de tempo dela). Sem tarefa, é a escolha manual de sempre.
        if (sel.tarefaId) {
          sel.topicoId = topId;
        } else {
          sel.topicoId = topId;
          sel.blocoMin = null; // escolha manual não é bloco planejado
          sel.missaoId = null;
          sel.manual = true; // não deixa a semente do plano atropelar a escolha do usuário
        }
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
    // Clicar numa tarefa (do plano ou avulsa) → ela vira o FOCO, com ou sem tópico.
    "focar-tarefa": (el) => {
      const id = el.getAttribute("data-tarefa");
      const tipo = el.getAttribute("data-tarefa-tipo");
      const t = [...store.tarefasDoDia(todayISO()), ...store.tarefasAvulsasHoje()].find((x) => x.id === id && x.tipo === tipo);
      if (!t) return;
      aplicarTarefaAoFoco(t, store.get());
      sel.manual = false; // a escolha passa a ser a tarefa; a semente do plano volta a valer quando ela sair
      if (sel.blocoMin) {
        const snap = crono.snapshot();
        if (!snap.running && snap.elapsed === 0) { crono.setModo("regressivo"); crono.setTarget(sel.blocoMin * 60); }
      }
      app.refresh();
      requestAnimationFrame(() => root.querySelector(".foco-hero")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      toast(sel.topicoId ? "Foco atualizado — comece quando quiser." : "Foco atualizado — esta tarefa não tem tópico, e tudo bem.");
    },
    // Sugestão do Mentor (tópico do ciclo ou revisão) → vira o foco, do mesmo jeito que uma
    // tarefa do plano. Antes a sugestão era só texto: não dava para aceitá-la em um clique.
    "focar-sugestao": (el) => {
      const top = el.getAttribute("data-top");
      const f = el.getAttribute("data-fase");
      sel.tarefaId = null; sel.tarefaTipo = null; sel.missaoId = null; sel.blocoMin = null;
      sel.manual = true; // sugestão aceita à mão: a semente do plano não sobrescreve
      if (top) sel.topicoId = top;
      if (f && FASES[f]) { sel.fase = f; sel.faseDeTarefa = null; }
      app.refresh();
      requestAnimationFrame(() => root.querySelector(".foco-hero")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      toast("Foco atualizado — comece quando quiser.");
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
function mentorVozHTML(store, st, topicoSel, insightTxt, sugestao) {
  const nomeTop = topicoSel ? rotuloTopico(st, topicoSel) : "";
  const sug = (q, lbl) => `<button class="chip hmv-sug" data-action="mentor-sug" data-q="${esc(q)}">${esc(lbl)}</button>`;
  // O que o Mentor sugere vira BOTÃO, não só texto: aceitar a sugestão em um clique é o mesmo
  // gesto de clicar numa tarefa do plano. Antes o card só falava, e trocar o foco era manual.
  const sugFoco = [
    sugestao && sugestao.revisoes
      ? `<button class="chip hmv-sug hmv-sug-foco" data-action="focar-sugestao" data-fase="R"${sugestao.topicoRev ? ` data-top="${sugestao.topicoRev}"` : ""} data-tip="Põe a Revisão em foco agora.">${icone("repeat-2")} Revisar (${sugestao.revisoes} ${sugestao.revisoes === 1 ? "pendente" : "pendentes"})</button>`
      : "",
    sugestao && sugestao.topico && !sugestao.jaEmFoco
      ? `<button class="chip hmv-sug hmv-sug-foco" data-action="focar-sugestao" data-top="${sugestao.topico.id}" data-fase="${sugestao.fase || ""}" data-tip="Põe este tópico em foco agora.">${icone("target")} Estudar ${esc(sugestao.topico.nome.length > 42 ? sugestao.topico.nome.slice(0, 42) + "…" : sugestao.topico.nome)}</button>`
      : "",
  ].filter(Boolean).join("");
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
          <button class="chip hmv-sug" data-action="ver-plano" data-tip="Abre o plano completo para você revisar.">${icone("arrow-right")} Ver o plano completo${nSug ? ` (${nSug} ${nSug === 1 ? "sugestão" : "sugestões"})` : ""}</button>
        </div>
      </section>`;
  }
  const txt = insightTxt
    ? esc(insightTxt)
    : topicoSel
    ? "Peça questões, um resumo ou o replanejamento do dia."
    : "Escolha um tópico e eu ajudo com questões, resumo e plano.";
  return `<section class="card card-ia hoje-mentor-voz">
      <div class="hmv-head"><span class="orb orb-sm" aria-hidden="true"></span><b>Mentor <span class="txt-ia">IA</span></b><span class="hmv-badge">sugere</span></div>
      <p class="hmv-porque${insightTxt ? "" : " muted"}">${insightTxt ? `${icone("sparkles")} <span class="hmv-txt" data-stream>${txt}</span>` : `<span class="hmv-txt">${txt}</span>`}</p>
      <div class="hmv-sugs">
        ${sugFoco}
        ${topicoSel ? sug(`Gere 10 questões de ${nomeTop}`, "Gerar questões") : ""}
        ${topicoSel ? sug(`Faça um resumo de ${nomeTop}`, "Resumir o tópico") : ""}
        <button class="chip hmv-sug" data-action="refazer-plano" data-tip="Abre o Mentor IA e reanalisa seu progresso — metas, tarefas e revisões.">${icone("refresh-cw")} Refazer meu plano</button>
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
// (não é sugestão automática). Reaproveita a janela modal premium (abrirJanela). Cada
// disciplina é um <details> recolhido (evita todos os tópicos de todas as disciplinas
// aparecendo de uma vez); com muitos tópicos, ganha busca que auto-abre quem casa.
function abrirSeletorTopico(store, onPick) {
  const st = store.get();
  const grupos = st.disciplinas
    .map((d) => ({ d, tops: ordenarTopicosPorBase(st, st.topicos.filter((t) => t.disciplinaId === d.id)) }))
    .filter((g) => g.tops.length);
  const soltos = ordenarTopicosPorBase(st, st.topicos.filter((t) => !st.disciplinas.some((d) => d.id === t.disciplinaId)));
  if (soltos.length) grupos.push({ d: { id: "", nome: "Sem disciplina" }, tops: soltos });
  const totalTop = grupos.reduce((n, g) => n + g.tops.length, 0);
  const corpo = `<div class="seltop">
    ${totalTop > 12 ? `<input type="search" class="seltop-busca busca-input" placeholder="Buscar tópico…" aria-label="Buscar tópico" />` : ""}
    ${grupos
      .map(
        ({ d, tops }) => `<details class="seltop-disc">
          <summary class="seltop-disc-nome"><span class="disc-cor" style="background:${d.id ? store.corDisciplina(d.id) : "var(--border-strong)"}"></span>${esc(d.nome)}</summary>
          <div class="seltop-tops">
            ${tops.map((t) => `<button class="seltop-top" data-top="${t.id}" data-busca="${esc(t.nome.toLowerCase())}">${esc(t.nome)}</button>`).join("")}
          </div>
        </details>`
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
      el.querySelector(".seltop-busca")?.addEventListener("input", (e) => {
        const t = e.target.value.trim().toLowerCase();
        el.querySelectorAll(".seltop-disc").forEach((g) => {
          const itens = [...g.querySelectorAll("[data-top]")];
          if (!t) { itens.forEach((it) => { it.hidden = false; }); g.hidden = false; g.open = false; return; }
          const temMatch = itens.some((it) => { const casa = it.getAttribute("data-busca").includes(t); it.hidden = !casa; return casa; });
          g.hidden = !temMatch;
          if (temMatch) g.open = true;
        });
      });
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
