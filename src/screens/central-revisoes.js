// Central de Revisões: consolida TODAS as revisões espaçadas (tópicos, resumos, mapas,
// lei/juris) + flashcards (item-lote) num lugar só. É uma VISÃO sobre o estado real
// (store.revisoesConsolidadas()) — sincroniza sozinha: fez a revisão em qualquer tela,
// some daqui; registrou sessão, aparece. Fase 1: ver/filtrar + Iniciar (roteia).
import { bindActions, header, vazio, defMetrica, toast, abrirJanela, confirmar } from "../ui.js";
import { esc, fmtData, todayISO, addDays } from "../util.js";
import { icone } from "../icones.js";
import { focoShellHTML, bindFocoCrono, focoChromeKey, ligarTickCrono } from "./foco-quiz.js";
import { abrirRegistroSessao } from "../registro-sessao.js";
import * as crono from "../cronometro.js";

// Filtros (persistem entre re-renders da sessão). "" = sem filtro.
let filtroStatus = "pendentes"; // pendentes | todas | atrasada | hoje | proxima | concluidas
let filtroDisc = "";
let filtroTop = "";
let filtroTipo = "";

// Sessão única "Revisar tudo em foco": percorre as revisões vencidas (exceto o lote de
// flashcards, que tem foco próprio) uma a uma — recorde → revele → "Revisei" (concluirRevisao).
let focoRev = { ativo: false, fila: [], idx: 0, revelado: false, feitas: {}, anim: true };

const TIPO_INFO = {
  topico: { ico: "repeat-2", nome: "Tópico", cor: "#f59e0b" },
  flashcards: { ico: "layers", nome: "Flashcards", cor: "#fbbf24" },
  resumo: { ico: "file-text", nome: "Resumo", cor: "#d97706" },
  mapa: { ico: "network", nome: "Mapa mental", cor: "#d97706" },
  lei: { ico: "scroll-text", nome: "Lei seca", cor: "#8b5cf6" },
  juris: { ico: "scale", nome: "Jurisprudência", cor: "#a855f7" },
};

function quando(it) {
  if (it.status === "atrasada") return `atrasada há ${it.diasAtraso} ${it.diasAtraso === 1 ? "dia" : "dias"}`;
  if (it.status === "hoje") return "vence hoje";
  return fmtData(it.proxima);
}

function cardItem(it) {
  const ti = TIPO_INFO[it.tipo] || TIPO_INFO.topico;
  const meta = [ti.nome, it.disciplinaNome && it.disciplinaNome !== "—" ? it.disciplinaNome : null].filter(Boolean).join(" · ");
  const acoes = it.acoes
    ? `<button class="rev-remover" data-action="rev-remover" data-id="${it.id}" data-tip="Remover da fila de revisão">${icone("trash-2")}</button>
       <button class="btn btn-ghost btn-sm" data-action="rev-reprogramar" data-id="${it.id}" data-tip="Adiar para outra data">${icone("calendar-days")} Reprogramar</button>
       <button class="btn btn-ghost btn-sm" data-action="rev-concluir" data-id="${it.id}" data-tip="Dar baixa (já revisei)">${icone("check")} Concluir</button>`
    : "";
  return `<div class="rev-item rev-${it.status}" style="--cor:${ti.cor}" data-id="${it.id}">
      <span class="rev-ico">${icone(ti.ico)}</span>
      <div class="rev-corpo">
        <div class="rev-titulo">${esc(it.titulo)}</div>
        <div class="rev-meta">${esc(meta)} <span class="rev-quando rev-q-${it.status}">${quando(it)}</span></div>
      </div>
      <div class="rev-acoes">
        ${acoes}
        <button class="btn btn-primary btn-sm" data-action="rev-iniciar" data-id="${it.id}">${icone("play")} Iniciar</button>
      </div>
    </div>`;
}

function secao(titulo, itens, iconeNome, cls, extraHeader = "") {
  if (!itens.length) return "";
  return `<section class="rev-secao ${cls}">
      <h3 class="rev-secao-h">${icone(iconeNome)} ${titulo} <span class="cnt">${itens.length}</span>${extraHeader ? `<span class="rev-secao-sp"></span>${extraHeader}` : ""}</h3>
      <div class="rev-lista">${itens.map(cardItem).join("")}</div>
    </section>`;
}

function cardConcluida(c) {
  const ti = TIPO_INFO[c.tipo] || { ico: "scroll-text", nome: "Lei / juris", cor: "#8b5cf6" };
  return `<div class="rev-item rev-concluida" style="--cor:${ti.cor}">
      <span class="rev-ico rev-ico-ok">${icone("check-check")}</span>
      <div class="rev-corpo">
        <div class="rev-titulo">${esc(c.titulo || ti.nome)}</div>
        <div class="rev-meta">${esc(ti.nome)} · revisado ${esc(fmtData(c.data))}</div>
      </div>
    </div>`;
}

export default function renderCentralRevisoes(root, app) {
  const { store } = app;
  const st = store.get();
  const cont = store.revisoesResumoContagem();
  // Fila da sessão única: vencidas (atrasada+hoje) que dão baixa (exclui o lote de flashcards).
  const pendentesFoco = store.revisoesConsolidadas().filter((i) => (i.status === "atrasada" || i.status === "hoje") && i.acoes);

  let itens = store.revisoesConsolidadas();
  // Filtros
  if (filtroDisc) itens = itens.filter((i) => i.disciplinaId === filtroDisc);
  if (filtroTop) itens = itens.filter((i) => i.topicoId === filtroTop);
  if (filtroTipo) itens = itens.filter((i) => i.tipo === filtroTipo);
  if (filtroStatus === "pendentes") itens = itens.filter((i) => i.status !== "proxima");
  else if (filtroStatus !== "todas") itens = itens.filter((i) => i.status === filtroStatus);

  const atrasadas = itens.filter((i) => i.status === "atrasada").sort((a, b) => b.diasAtraso - a.diasAtraso);
  const hoje = itens.filter((i) => i.status === "hoje");
  const proximas = itens.filter((i) => i.status === "proxima").sort((a, b) => a.proxima.localeCompare(b.proxima));

  // Opções de filtro
  const opcoesDisc = st.disciplinas.map((d) => `<option value="${d.id}" ${d.id === filtroDisc ? "selected" : ""}>${esc(d.nome)}</option>`).join("");
  const opcoesTop = st.topicos
    .filter((t) => !filtroDisc || t.disciplinaId === filtroDisc)
    .map((t) => `<option value="${t.id}" ${t.id === filtroTop ? "selected" : ""}>${esc(t.nome)}</option>`)
    .join("");
  const opcoesTipo = Object.entries(TIPO_INFO).map(([k, v]) => `<option value="${k}" ${k === filtroTipo ? "selected" : ""}>${esc(v.nome)}</option>`).join("");
  const chip = (v, lbl, n) => `<button class="rev-chip ${filtroStatus === v ? "on" : ""}" data-action="rev-status" data-v="${v}">${esc(lbl)}${n != null ? ` <span class="rev-chip-n">${n}</span>` : ""}</button>`;

  const modoConcluidas = filtroStatus === "concluidas";
  const concluidas = store.revisoesConcluidasLog(30);
  const listaVazia = !atrasadas.length && !hoje.length && !proximas.length;

  root.innerHTML = `
    ${header("Central de Revisões", "Tudo o que vence, num lugar só — sincronizado com todas as telas.")}

    <section class="scorecard rev-cards">
      <div class="sc-pilar ${cont.atrasadas ? "rev-alerta" : ""}"><span class="kpi-ico">${icone("triangle-alert")}</span><span class="sc-num">${cont.atrasadas}</span><span class="sc-rot">Atrasadas</span></div>
      <div class="sc-pilar"><span class="kpi-ico">${icone("calendar-check")}</span><span class="sc-num">${cont.hoje}</span><span class="sc-rot">Para hoje</span></div>
      <div class="sc-pilar"><span class="kpi-ico">${icone("calendar-days")}</span><span class="sc-num">${cont.proximas7}</span><span class="sc-rot">Próximos 7 dias</span></div>
      <div class="sc-pilar" data-tip="Das revisões que exigiram atenção nos últimos 30 dias (concluídas + ainda atrasadas), quantas você fez. Alto = em dia.">
        <span class="kpi-ico">${icone("trending-up")}</span><span class="sc-num ${cont.taxaConclusao == null ? "" : cont.taxaConclusao >= 70 ? "rev-taxa-ok" : cont.taxaConclusao < 50 ? "rev-taxa-baixo" : ""}">${cont.taxaConclusao == null ? "—" : cont.taxaConclusao + "%"}</span><span class="sc-rot">Taxa de conclusão (30d)</span></div>
    </section>

    ${pendentesFoco.length ? `<div class="rev-foco-cta">
      <button class="btn fc-foco-btn" data-action="rev-foco-tudo" data-tip="Percorre suas revisões vencidas uma a uma, em tela cheia, sem distração (flashcards têm foco próprio).">${icone("expand")} Revisar tudo em foco <span class="rev-foco-n">${pendentesFoco.length}</span></button>
    </div>` : ""}

    <section class="card rev-filtros">
      <div class="rev-chips">
        ${chip("pendentes", "Pendentes", cont.atrasadas + cont.hoje)}
        ${chip("atrasada", "Atrasadas", cont.atrasadas)}
        ${chip("hoje", "Hoje", cont.hoje)}
        ${chip("proxima", "Próximas", null)}
        ${chip("concluidas", "Concluídas", cont.concluidas30)}
        ${chip("todas", "Todas", null)}
      </div>
      <div class="rev-selects">
        <label class="inline">Disciplina <select id="rev-f-disc"><option value="">Todas</option>${opcoesDisc}</select></label>
        <label class="inline">Tópico <select id="rev-f-top"><option value="">Todos</option>${opcoesTop}</select></label>
        <label class="inline">Tipo <select id="rev-f-tipo"><option value="">Todos</option>${opcoesTipo}</select></label>
        ${filtroDisc || filtroTop || filtroTipo || filtroStatus !== "pendentes" ? `<button class="lnk rev-limpar" data-action="rev-limpar">limpar filtros</button>` : ""}
      </div>
    </section>

    ${
      modoConcluidas
        ? concluidas.length
          ? `<section class="rev-secao"><h3 class="rev-secao-h">${icone("check-check")} Concluídas (últimos 30 dias) <span class="cnt">${concluidas.length}</span></h3><div class="rev-lista">${concluidas.map(cardConcluida).join("")}</div></section>`
          : vazio("Nenhuma revisão concluída ainda\nAo concluir revisões aqui (ou fazê-las nas outras telas), elas aparecem neste histórico.", "", icone("check-check"))
        : listaVazia
        ? vazio(
            cont.total === 0 ? "Nenhuma revisão agendada\nEstude um tópico e ligue as revisões no registro para começar a alimentar sua repetição espaçada." : "Nada aqui com esses filtros\nAjuste o status ou os filtros acima.",
            "",
            icone("calendar-check")
          )
        : `${secao("Atrasadas", atrasadas, "triangle-alert", "rev-sec-atraso", atrasadas.length ? `<button class="btn btn-ghost btn-sm rev-lote" data-action="rev-lote-atrasadas" data-tip="Move todas as atrasadas para hoje">${icone("calendar-check")} Trazer todas para hoje</button>` : "")}
           ${secao("Para hoje", hoje, "calendar-check", "rev-sec-hoje")}
           ${secao("Próximas", proximas, "calendar-days", "rev-sec-prox")}`
    }
    ${focoRev.ativo ? focoRevOverlayHTML(st, focoRev.anim ? "in" : "fade") : ""}`;
  focoRev.anim = false; // só a 1ª aparição anima; re-renders seguintes usam fade

  bindActions(root, {
    ...bindFocoCrono({}), // cronômetro do foco (compartilhado)
    "rev-foco-tudo": () => {
      // Enriquece os tópicos com o conteúdo do "reler" (palavras-chave marcadas 🟡 +
      // resumos vinculados) para o reveal ter substância, não só um prompt.
      focoRev.fila = pendentesFoco.map((it) => {
        if (it.tipo === "topico") {
          it._keywords = store.palavrasChaveDoTopico(it.refId);
          it._resumos = st.resumos.filter((r) => r.topicoId === it.refId);
        }
        return it;
      }); // objetos (snapshot estável na sessão)
      focoRev.idx = 0;
      focoRev.revelado = false;
      focoRev.feitas = {};
      focoRev.ativo = focoRev.fila.length > 0;
      focoRev.anim = true;
      app.refresh();
    },
    "revelar-rev": () => {
      focoRev.revelado = true;
      atualizarFocoRev(root, store);
    },
    "foco-anterior": () => { if (focoRev.idx > 0) { focoRev.idx--; focoRev.revelado = false; atualizarFocoRev(root, store); } },
    "foco-proximo": () => { if (focoRev.idx < focoRev.fila.length) { focoRev.idx++; focoRev.revelado = false; atualizarFocoRev(root, store); } },
    "rev-foco-concluir": (el) => {
      const id = el.getAttribute("data-id");
      const dias = store.concluirRevisao(id, el.getAttribute("data-titulo") || "");
      focoRev.feitas[id] = true;
      if (dias != null) toast(`Revisada — próxima em ${dias} ${dias === 1 ? "dia" : "dias"}.`, "ok");
      focoRev.idx++;
      focoRev.revelado = false;
      atualizarFocoRev(root, store);
    },
    "rev-foco-pular": () => { focoRev.idx++; focoRev.revelado = false; atualizarFocoRev(root, store); },
    "sair-foco": () => { focoRev.ativo = false; app.refresh(); },
    // Fim do lote: registra o TEMPO da sessão de revisão de uma vez (fase R). Se o cronômetro do
    // foco acumulou tempo (≥1 min), abre no modo cronômetro (captura); senão, modo manual.
    "rev-foco-registrar": () => {
      const temTempo = crono.snapshot().elapsed >= 60;
      focoRev.ativo = false;
      app.refresh();
      abrirRegistroSessao(store, app, { modo: temTempo ? "crono" : "manual", fasePadrao: "R" });
    },
    "rev-status": (el) => { filtroStatus = el.getAttribute("data-v"); app.refresh(); },
    "rev-limpar": () => { filtroStatus = "pendentes"; filtroDisc = ""; filtroTop = ""; filtroTipo = ""; app.refresh(); },
    "rev-iniciar": (el) => {
      const it = store.revisoesConsolidadas().find((x) => x.id === el.getAttribute("data-id"));
      if (!it) return;
      // Roteia para o fluxo do tipo, apontando ao tópico quando faz sentido.
      const params = it.topicoId ? { topicoId: it.topicoId } : {};
      app.navigate(it.rota, params);
    },
    "rev-concluir": (el) => {
      const it = store.revisoesConsolidadas().find((x) => x.id === el.getAttribute("data-id"));
      if (!it) return;
      const dias = store.concluirRevisao(it.id, it.titulo);
      if (dias == null) return;
      // Ponte: oferece REGISTRAR O TEMPO da revisão (abre o registro pré-preenchido: tópico + fase R).
      toast(
        `Revisão concluída — próxima em ${dias} ${dias === 1 ? "dia" : "dias"}.`,
        "ok",
        it.topicoId ? { acaoLabel: "Registrar tempo", duracao: 6500, onAcao: () => abrirRegistroSessao(store, app, { modo: "manual", fasePadrao: "R", topicoPadrao: it.topicoId }) } : undefined
      );
      app.refresh();
    },
    "rev-reprogramar": (el) => {
      const it = store.revisoesConsolidadas().find((x) => x.id === el.getAttribute("data-id"));
      if (it) abrirReprogramar(store, app, it);
    },
    "rev-remover": async (el) => {
      const it = store.revisoesConsolidadas().find((x) => x.id === el.getAttribute("data-id"));
      if (!it) return;
      if (!(await confirmar(`Remover a revisão de "${it.titulo}" da fila?\n\nO ${it.tipo === "topico" ? "tópico" : it.tipo} em si NÃO é apagado — só deixa de estar agendado para revisão.`))) return;
      store.removerRevisao(it.id);
      toast("Revisão removida da fila.", "ok");
      app.refresh();
    },
    "rev-lote-atrasadas": async () => {
      if (!(await confirmar("Trazer TODAS as revisões atrasadas para hoje?"))) return;
      const n = store.trazerAtrasadasParaHoje();
      toast(n ? `${n} ${n === 1 ? "revisão trazida" : "revisões trazidas"} para hoje.` : "Nenhuma atrasada.", "ok");
      app.refresh();
    },
  });

  // Selects de filtro
  root.querySelector("#rev-f-disc")?.addEventListener("change", (e) => {
    filtroDisc = e.target.value;
    // se o tópico selecionado não pertence mais à disciplina, limpa
    if (filtroTop && filtroDisc) {
      const t = st.topicos.find((x) => x.id === filtroTop);
      if (!t || t.disciplinaId !== filtroDisc) filtroTop = "";
    }
    app.refresh();
  });
  root.querySelector("#rev-f-top")?.addEventListener("change", (e) => { filtroTop = e.target.value; app.refresh(); });
  root.querySelector("#rev-f-tipo")?.addEventListener("change", (e) => { filtroTipo = e.target.value; app.refresh(); });

  // ===== Sessão única em foco: teclado + cronômetro vivo =====
  if (!focoRev.ativo) return;
  function onKey(e) {
    const chrome = focoChromeKey(e, { root }); // Esc/setas/campo do cronômetro
    if (chrome) return;
    const card = root.querySelector(".fq-revcard");
    if (!card) return; // conclusão
    if (!focoRev.revelado && !card.classList.contains("is-feita")) {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); root.querySelector('[data-action="revelar-rev"]')?.click(); }
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); root.querySelector('[data-action="rev-foco-concluir"]')?.click(); }
    else if (e.key === " ") { e.preventDefault(); root.querySelector('[data-action="rev-foco-pular"]')?.click(); }
  }
  document.addEventListener("keydown", onKey);
  const offTick = ligarTickCrono(root);
  return () => { document.removeEventListener("keydown", onKey); offTick(); };
}

// Troca o overlay da sessão de revisão no lugar (fade), sem re-render da Central. Troca só o
// CONTEÚDO de .fc-foco (não o elemento), senão ele re-dispara a animação de entrada (fq-fade)
// e o overlay "pisca" (parece fechar e reabrir).
function atualizarFocoRev(root, store) {
  const foco = root.querySelector(".fc-foco");
  const novoHTML = focoRevOverlayHTML(store.get(), "fade");
  if (!foco) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = novoHTML;
  const novoFoco = tmp.querySelector(".fc-foco");
  if (novoFoco) foco.replaceChildren(...Array.from(novoFoco.childNodes));
  else foco.outerHTML = novoHTML;
}

// Conteúdo revelado por tipo (o que se tenta recordar). Resumo/lei/juris têm texto;
// tópico/mapa não têm conteúdo compacto → mostram uma confirmação orientada.
function conteudoRevelado(st, it) {
  if (it.tipo === "resumo") {
    const r = st.resumos.find((x) => x.id === it.refId);
    return r && r.conteudoHTML ? `<div class="fq-rev-conteudo">${r.conteudoHTML}</div>` : `<p class="muted">Resumo sem conteúdo.</p>`;
  }
  if (it.tipo === "lei" || it.tipo === "juris") {
    const ind = st.indicacoes.find((x) => x.id === it.refId);
    return ind ? `<div class="fq-rev-conteudo">${ind.referencia ? `<b>${esc(ind.referencia)}</b><br>` : ""}${esc(ind.texto || "")}</div>` : `<p class="muted">Item não encontrado.</p>`;
  }
  if (it.tipo === "topico") {
    const kws = it._keywords || [];
    const resumos = it._resumos || st.resumos.filter((r) => r.topicoId === it.refId);
    // Prioridade igual à Revisão de Tópicos: palavras-chave marcadas 🟡 > resumo > prompt.
    if (kws.length) {
      return `<div class="fq-rev-conteudo"><p class="muted small">Palavras-chave marcadas neste tópico:</p><ul class="fq-rev-kws">${kws.map((k) => `<li>${esc(k)}</li>`).join("")}</ul></div>`;
    }
    if (resumos.length && resumos[0].conteudoHTML) {
      return `<div class="fq-rev-conteudo">${resumos[0].conteudoHTML}</div>`;
    }
    return `<div class="fq-rev-conteudo"><p>Revise mentalmente o essencial de <b>${esc(it.titulo)}</b> — o que caiu, os pontos-chave e onde você erra.</p><p class="muted small">Dica: marque as palavras-chave (grifo amarelo) ou crie um resumo deste tópico para elas aparecerem aqui.</p></div>`;
  }
  if (it.tipo === "mapa") {
    return `<div class="fq-rev-conteudo"><p>Percorra de cabeça os ramos do mapa <b>${esc(it.titulo)}</b>. Abra a tela de Mapas depois se quiser rever o mapa completo.</p></div>`;
  }
  return `<div class="fq-rev-conteudo"><p>${esc(it.titulo)}</p></div>`;
}

// Card de uma revisão na sessão (recorde → revele → Revisei).
function revCardHTML(st, it, revelado, feita) {
  const ti = TIPO_INFO[it.tipo] || TIPO_INFO.topico;
  const meta = [ti.nome, it.disciplinaNome && it.disciplinaNome !== "—" ? it.disciplinaNome : null].filter(Boolean).join(" · ");
  const tags = `<div class="fq-tags"><span class="fq-tag" style="color:${ti.cor};background:color-mix(in srgb, ${ti.cor} 16%, transparent)">${icone(ti.ico)} ${esc(ti.nome)}</span>${it.disciplinaNome && it.disciplinaNome !== "—" ? `<span class="fq-tag">${esc(it.disciplinaNome)}</span>` : ""}</div>`;
  if (feita) {
    return `<div class="fq-revcard is-feita" data-id="${it.id}">
      ${tags}
      <div class="fq-rev-feita">${icone("check-check")} Revisada nesta sessão</div>
      <div class="fq-rev-titulo-sm">${esc(it.titulo)}</div>
      <div class="fq-rev-acoes"><button class="fq-mostrar" data-action="foco-proximo">${icone("arrow-right")} Continuar</button></div>
    </div>`;
  }
  if (!revelado) {
    return `<div class="fq-revcard" data-id="${it.id}">
      ${tags}
      <div class="fq-rev-cue">Recorde o essencial de</div>
      <div class="fq-q">${esc(it.titulo)}</div>
      <button class="fq-mostrar" data-action="revelar-rev">${icone("eye")} Revelar</button>
      <div class="fc-atalhos muted small">${icone("keyboard")} <b>Espaço</b> para revelar</div>
    </div>`;
  }
  return `<div class="fq-revcard is-revelada" data-id="${it.id}">
    ${tags}
    <div class="fq-rev-titulo-sm">${esc(it.titulo)}</div>
    ${conteudoRevelado(st, it)}
    <div class="fq-rev-acoes">
      <button class="btn btn-ghost" data-action="rev-foco-pular" data-tip="Não dar baixa agora (Espaço)">Pular</button>
      <button class="btn btn-primary" data-action="rev-foco-concluir" data-id="${it.id}" data-titulo="${esc(it.titulo)}" data-tip="Dar baixa e reprogramar a próxima (Enter)">${icone("check")} Revisei</button>
    </div>
    <div class="fc-atalhos muted small">${icone("keyboard")} <b>Enter</b> revisei · <b>Espaço</b> pular</div>
  </div>`;
}

function revConclusaoHTML(feitas, total) {
  return `<div class="fq-panel fq-conclusao">
      <div class="fq-check">${icone("check-check")}</div>
      <h2>Revisões em dia</h2>
      <p class="muted">Você concluiu <b>${feitas}</b> de ${total} ${total === 1 ? "revisão" : "revisões"} nesta sessão.</p>
      <div class="fq-conclusao-acoes">
        ${feitas ? `<button class="btn btn-soft btn-lg" data-action="rev-foco-registrar" data-tip="Lança o tempo desta sessão de revisão (usa o cronômetro do foco).">${icone("clock-3")} Registrar tempo</button>` : ""}
        <button class="btn btn-primary btn-lg" data-action="sair-foco">${icone("check")} Concluir</button>
      </div>
    </div>`;
}

// Overlay da sessão única (shell compartilhado). `focoRev.fila` guarda os OBJETOS da
// revisão (snapshot estável na sessão).
function focoRevOverlayHTML(st, anim = "in") {
  const total = focoRev.fila.length;
  const idx = focoRev.idx;
  const it = idx >= total ? null : focoRev.fila[idx];
  const feitasCount = Object.keys(focoRev.feitas).length;
  const centro = it ? revCardHTML(st, it, focoRev.revelado, !!focoRev.feitas[it.id]) : revConclusaoHTML(feitasCount, total);
  const placarExtra = `<div class="fq-chip fq-revplc" data-tip="Revisadas nesta sessão">${icone("check-check")} <span>${feitasCount}</span>/${total}</div>`;
  const rodape = !it
    ? `<kbd>Esc</kbd> sair`
    : focoRev.feitas[it.id]
      ? `<kbd>Esc</kbd> sair · <kbd>←</kbd><kbd>→</kbd> navegar`
      : focoRev.revelado
        ? `<kbd>Esc</kbd> sair · <kbd>←</kbd><kbd>→</kbd> navegar · <kbd>Enter</kbd> revisei · <kbd>Espaço</kbd> pular`
        : `<kbd>Esc</kbd> sair · <kbd>←</kbd><kbd>→</kbd> navegar · <kbd>Espaço</kbd> revelar`;
  return focoShellHTML({
    idx, total, fim: !it, anim, placar: null, placarExtra, centro, rodape,
    aria: "Revisar tudo em foco",
  });
}

// Modal de reprogramação: atalhos (Hoje/Amanhã/+3d/+1sem) + calendário. Só move a data.
function abrirReprogramar(store, app, it) {
  const hoje = todayISO();
  const atalhos = [
    { d: 0, lbl: "Hoje" },
    { d: 1, lbl: "Amanhã" },
    { d: 3, lbl: "Em 3 dias" },
    { d: 7, lbl: "Em 1 semana" },
  ];
  const corpoHTML = `<div class="rev-repro">
      <div class="rev-repro-atual">${icone("calendar-days")} Programada para <b>${esc(fmtData(it.proxima))}</b></div>
      <div class="rsx-lbl">Nova data</div>
      <div class="rev-repro-chips">
        ${atalhos.map((a) => `<button type="button" class="rev-chip" data-d="${a.d}">${a.lbl}</button>`).join("")}
      </div>
      <label class="rev-repro-cal">Ou escolha no calendário<input type="date" id="rev-repro-data" value="${hoje}" min="${addDays(hoje, -365)}" /></label>
      <div class="rev-repro-rodape">
        <button class="btn btn-ghost" data-rr-cancelar>Cancelar</button>
        <button class="btn btn-primary" data-rr-ok>Confirmar nova data</button>
      </div>
    </div>`;
  abrirJanela({
    titulo: "Reprogramar revisão",
    corpoHTML,
    aoMontar: (overlay, fechar) => {
      const scope = overlay.querySelector(".mm-corpo");
      const inp = scope.querySelector("#rev-repro-data");
      scope.querySelectorAll(".rev-chip[data-d]").forEach((b) =>
        b.addEventListener("click", () => {
          inp.value = addDays(hoje, parseInt(b.getAttribute("data-d"), 10));
          scope.querySelectorAll(".rev-chip[data-d]").forEach((x) => x.classList.remove("on"));
          b.classList.add("on");
        })
      );
      scope.querySelector("[data-rr-cancelar]").addEventListener("click", fechar);
      scope.querySelector("[data-rr-ok]").addEventListener("click", () => {
        const nova = inp.value || hoje;
        store.reprogramarRevisao(it.id, nova);
        toast(`Revisão reprogramada para ${fmtData(nova)}.`, "ok");
        fechar();
        app.refresh();
      });
    },
  });
}
