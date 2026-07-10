// Mentor PROATIVO: olha todo o progresso (panorama offline determinístico) e, com a
// IA conectada, propõe um PLANO de ações concretas — metas, missões, flashcards,
// questões e anotações de erro. Nada é aplicado sem APROVAÇÃO (checkbox + botão).
// É o ponto onde o sistema conversa consigo mesmo: lê sessões, erros, observações,
// cobertura, prova e metas, e devolve ações que voltam para as outras telas.
import { bindActions, toast, header, avisoIA, seloBadge, imprimir, botaoImprimir, vazio, skeletonDoc, plural, revelarTexto, md } from "../ui.js";
import { esc, fmtMin } from "../util.js";
import { icone } from "../icones.js";
import { FASES } from "../ciclo.js";

let plano = null; // resultado da última análise da IA (aguardando aprovação)
let analiseStreamPlano = null; // objeto-plano cuja análise já foi "digitada" (stream 1x por análise)

export default function renderMentor(root, app) {
  const { store } = app;
  // Hidrata o plano persistido (ex.: a auto-análise semanal rodou no boot, antes de o
  // usuário abrir esta aba) — assim as sugestões aparecem mesmo sem ter clicado.
  if (plano == null) plano = store.get().config.mentorPlano || null;
  const snap = store.snapshotMentor();
  const pontos = store.pontosAtencao();
  const ocultas = store.atencaoOcultas();
  const iaOn = store.iaDisponivel();
  const diasAnalise = store.diasDesdeAnaliseMentor();
  // A análise "nasce" com o texto digitando (stream) 1x por análise; nas re-renderizações
  // (aplicar itens, etc.) o texto já aparece inteiro. Respeita reduced-motion (via revelarTexto).
  const streamAnalise = !!(plano && plano.analise && analiseStreamPlano !== plano);

  root.innerHTML = `
    ${header("Mentor IA", "Seu treinador de estudos: analisa todo o seu progresso e propõe um plano para você aprovar.", botaoImprimir(), { tituloClasse: "txt-ia" })}

    ${panoramaHTML(snap, pontos, ocultas)}

    <section class="card mentor-ia">
      <div class="plano-h">
        <h2 class="mentor-sec-t"><span class="orb orb-sm" aria-hidden="true"></span> Análise do progresso</h2>
        <span class="muted small mentor-sec-sub">(progresso geral → sugestões)</span>
        <span class="sp"></span>
        <button class="btn btn-ia" data-action="analisar" data-tip="A IA lê o panorama acima e sugere metas, tarefas, flashcards, questões, resumos e leituras para você aprovar.">${plano ? `${icone("refresh-cw")} Reanalisar` : `${icone("sparkles")} Analisar meu progresso`}</button>
      </div>
      ${iaOn ? `<p class="mentor-periodo muted small">${
        diasAnalise === null
          ? "O mentor ainda não analisou seu progresso. Que tal começar?"
          : diasAnalise <= 0
          ? "Última análise: hoje."
          : `Última análise: há ${plural(diasAnalise, "dia", "dias")}.${diasAnalise >= 7 ? " Já faz um tempo — vale reanalisar." : ""}`
      }</p>` : ""}
      <div id="mentor-plano-slot">${
        plano
          ? planoHTML(plano, streamAnalise)
          : iaOn
          ? vazio(
              "Pronto para sua primeira análise\nO mentor lê o panorama acima e propõe metas, tarefas, flashcards, questões e anotações, cada uma com seu selo de origem. Você aprova o que quiser antes de aplicar.",
              `<button class="btn btn-ia" data-action="analisar">${icone("sparkles")} Analisar meu progresso</button>`,
              icone("search")
            )
          : vazio(
              "Conecte uma IA para começar\nO mentor analisa seu progresso e propõe metas, tarefas, flashcards, questões e anotações. Conecte uma IA em Configurações para liberar a análise.",
              "",
              icone("bot")
            )
      }</div>
    </section>

    <p class="mentor-cross muted small">${icone("sparkles")} Para <b>perguntas ou ações rápidas</b> em qualquer tela (criar um flashcard, resumir um tópico, abrir uma tela), use o <b>Assistente inteligente</b> — o botão flutuante no canto inferior direito.</p>`;

  bindActions(root, {
    imprimir: () => imprimir("Mentor IA — Mentor Concurso", printMentor(snap, pontos, plano)),
    "adiar-atencao": (el) => {
      store.adiarAtencao(el.getAttribute("data-key"), parseInt(el.getAttribute("data-dias"), 10) || 7);
      toast("Ponto adiado. Volta em 7 dias.");
    },
    "dispensar-atencao": (el) => {
      store.adiarAtencao(el.getAttribute("data-key"), "sempre");
      toast("Ponto dispensado. Reative quando quiser.");
    },
    "reativar-atencao": () => {
      store.reativarAtencoes();
      toast("Pontos de atenção reexibidos.");
    },
    "reexibir-um": (el) => {
      store.reativarAtencao(el.getAttribute("data-key"));
      toast("Ponto reexibido.");
    },
    "excluir-atencao": (el) => {
      store.adiarAtencao(el.getAttribute("data-key"), "sempre");
      toast("Ponto dispensado de vez.");
    },
    "ponto-acao": (el) => {
      const rota = el.getAttribute("data-rota");
      const disc = el.getAttribute("data-disc");
      const aba = el.getAttribute("data-aba");
      const params = {};
      if (disc) params.focoDisciplinaId = disc;
      if (aba) params.aba = aba;
      app.navigate(rota, params);
    },
    "ir-kpi": (el) => app.navigate(el.getAttribute("data-rota")),
    analisar: async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "A análise do mentor");
      el.disabled = true;
      el.classList.add("is-generating");
      el.textContent = "Analisando…";
      toast("O mentor está analisando todo o seu progresso…");
      // Esqueleto do plano "nascendo" enquanto a IA responde (em vez de tela parada).
      const slot = document.getElementById("mentor-plano-slot");
      if (slot) slot.innerHTML = `<div class="card">${skeletonDoc(6)}</div>`;
      try {
        plano = await store.analisarComMentor();
        app.refresh();
      } catch (e) {
        toast("Não consegui concluir a análise agora. Verifique a conexão e tente de novo em instantes.", "erro");
        el.disabled = false;
        el.classList.remove("is-generating");
        el.textContent = "Analisar meu progresso";
      }
    },
    "descartar-plano": () => {
      plano = null;
      store.setMentorPlano(null);
      app.refresh();
    },
    "aplicar-plano": () => aplicar(root, app),
  });

  // Stream do texto da análise ("digitando") na 1ª pintura pós-análise; 1x por análise.
  if (streamAnalise) {
    const alvo = root.querySelector(".mentor-analise-txt");
    if (alvo) revelarTexto(alvo, plano.analise, { aoFim: () => { alvo.innerHTML = md(plano.analise); } });
    analiseStreamPlano = plano;
  }

  // Auto-disparo da reanálise quando se chega aqui pelo "Refazer meu plano" (Hoje).
  if (app.params && app.params.autoAnalisar) {
    app.params.autoAnalisar = null;
    if (store.iaDisponivel()) root.querySelector('[data-action="analisar"]')?.click();
    else avisoIA(app, "A análise do mentor");
  }
}

// ---------- panorama offline (sempre disponível, sem IA) ----------
function panoramaHTML(snap, pontos, ocultas) {
  const metas = snap.metas;
  const e = snap.cicloTempoMin;
  const obs = snap.observacoes.slice(0, 4);

  const itens = pontos.length
    ? pontos
        .map(
          (p) => `<li>
            <span class="ponto-txt">${esc(p.txt)}</span>
            <span class="ponto-acoes">
              ${p.acao ? `<button class="lnk ponto-cta" data-action="ponto-acao" data-rota="${esc(p.acao.rota)}" data-disc="${esc(p.acao.disc || "")}" data-aba="${esc(p.acao.aba || "")}" data-tip="Ir resolver isso agora.">${icone("arrow-right")} ${esc(p.acao.label)}</button>` : ""}
              <span class="ponto-sec">
                <button class="lnk" data-action="adiar-atencao" data-key="${esc(p.key)}" data-dias="7" data-tip-pos="cima-dir" data-tip="Lembrar de novo daqui a 7 dias.">adiar 7d</button>
                <button class="lnk lnk-danger" data-action="dispensar-atencao" data-key="${esc(p.key)}" data-tip-pos="cima-dir" data-tip="Não mostrar mais (você pode reexibir depois).">dispensar</button>
              </span>
            </span>
          </li>`
        )
        .join("")
    : `<li>Nada urgente no radar. Siga o ciclo de aprendizado e avance no edital.</li>`;

  return `
    <section class="card mentor-panorama">
      <div class="plano-h"><h2 class="mentor-sec-t"><span class="orb orb-sm" aria-hidden="true"></span> Panorama</h2><span class="muted small mentor-sec-sub">(o que precisa de atenção)</span></div>
      <ul class="mentor-alertas">${itens}</ul>
      ${
        ocultas.length
          ? `<details class="mentor-ocultas">
              <summary>${plural(ocultas.length, "ponto adiado/dispensado", "pontos adiados/dispensados")} — gerenciar</summary>
              <ul class="mentor-ocultas-lista">
                ${ocultas
                  .map(
                    (o) => `<li>
                      <span class="ponto-txt">${esc(o.txt)} <span class="mini-tag">${o.dispensado ? "dispensado" : "adiado"}</span></span>
                      <span class="ponto-acoes">
                        <button class="lnk ponto-cta" data-action="reexibir-um" data-key="${esc(o.key)}" data-tip-pos="cima-dir" data-tip="Voltar a mostrar este ponto agora.">reexibir</button>
                        ${o.dispensado ? "" : `<button class="lnk lnk-danger" data-action="excluir-atencao" data-key="${esc(o.key)}" data-tip-pos="cima-dir" data-tip="Dispensar de vez (não volta sozinho).">excluir</button>`}
                      </span>
                    </li>`
                  )
                  .join("")}
              </ul>
              <button class="lnk" data-action="reativar-atencao">Reexibir todos</button>
            </details>`
          : ""
      }
      <div class="mentor-vitals">
        <button class="mv-tile" data-action="ir-kpi" data-rota="diagnostico" data-tip="Quanto do edital você já cobriu — abre o Acompanhamento.">
          <span class="mv-num">${snap.coberturaEdital.pct}<i>%</i></span><span class="mv-lab">Cobertura do edital</span>
        </button>
        <button class="mv-tile" data-action="ir-kpi" data-rota="diagnostico" data-tip="Seu % de acerto nas questões — abre o Acompanhamento.">
          <span class="mv-num">${snap.aproveitamentoGeral === null ? "—" : `${snap.aproveitamentoGeral}<i>%</i>`}</span><span class="mv-lab">Aproveitamento</span>
        </button>
        <button class="mv-tile" data-action="ir-kpi" data-rota="diagnostico" data-tip="Tempo estudado nesta semana${metas.semanalMin ? " frente à sua meta" : ""} — abre o Acompanhamento.">
          <span class="mv-num">${fmtMin(metas.feitoSemanaMin)}${metas.semanalMin ? `<i> / ${fmtMin(metas.semanalMin)}</i>` : ""}</span><span class="mv-lab">Semana${metas.semanalMin ? " / meta" : ""}</span>
        </button>
      </div>
      <button class="lnk small mv-link" data-action="ir-kpi" data-rota="diagnostico" data-tip="Ver evolução, tempo, calendário e distribuição por etapa.">ver evolução completa no Acompanhamento ${icone("arrow-right")}</button>
      ${
        obs.length
          ? `<div class="mentor-obs"><b class="muted small">Você anotou recentemente:</b>
              <ul>${obs.map((o) => `<li class="muted small">${esc(o.nota)}${o.topico ? ` <i>(${esc(o.topico)})</i>` : ""}</li>`).join("")}</ul></div>`
          : ""
      }
    </section>`;
}

// ---------- impressão ----------
function printMentor(snap, pontos, p) {
  const e = snap.cicloTempoMin;
  let h = `<h2>Panorama</h2><ul>`;
  if (snap.prova) h += `<li>Prova: ${esc(snap.prova.data)} (faltam ${snap.prova.diasRestantes} dias)</li>`;
  h += `<li>Cobertura do edital: ${snap.coberturaEdital.pct}% (${snap.coberturaEdital.cobertos}/${snap.coberturaEdital.total})</li>`;
  h += `<li>Aproveitamento geral: ${snap.aproveitamentoGeral === null ? "—" : snap.aproveitamentoGeral + "%"}</li>`;
  h += `<li>Tempo por fase: ${esc(FASES.E.nome)} ${fmtMin(e.E)} · ${esc(FASES.A.nome)} ${fmtMin(e.A)} · ${esc(FASES.R.nome)} ${fmtMin(e.R)}</li></ul>`;
  h += `<h2>Pontos de atenção</h2>`;
  h += pontos.length ? `<ul>${pontos.map((x) => `<li>${esc(x.txt)}</li>`).join("")}</ul>` : `<p>Nada urgente.</p>`;
  if (snap.observacoes.length)
    h += `<h2>Observações recentes</h2><ul>${snap.observacoes.map((o) => `<li>${esc(o.nota)}${o.topico ? ` (${esc(o.topico)})` : ""}</li>`).join("")}</ul>`;
  if (p) {
    h += `<h2>Análise do mentor</h2><div>${md(p.analise)}</div>`;
    if (p.atencao.length) h += `<h3>Atenção</h3><ul>${p.atencao.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
    if (p.melhorar.length) h += `<h3>Melhorar</h3><ul>${p.melhorar.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
    const a = p.acoes;
    if (a.metas) h += `<h3>Metas sugeridas</h3><p>Diária ${fmtMin(a.metas.diariaMin)} · Semanal ${fmtMin(a.metas.semanalMin)}</p>`;
    if (a.missoes.length) h += `<h3>Tarefas</h3><ul>${a.missoes.map((m) => `<li>${esc(m.titulo)}</li>`).join("")}</ul>`;
    if (a.flashcards.length) h += `<h3>Flashcards</h3><ul>${a.flashcards.map((c) => `<li><b>${esc(c.frente)}</b> → ${esc(c.verso)}</li>`).join("")}</ul>`;
    if (a.questoes.length) h += `<h3>Questões</h3><ul>${a.questoes.map((q) => `<li>${esc(q.enunciado)}</li>`).join("")}</ul>`;
    if (a.erros.length) h += `<h3>Caderno de Erros</h3><ul>${a.erros.map((x) => `<li>${esc(x.descricao)}</li>`).join("")}</ul>`;
    if ((a.resumos || []).length) h += `<h3>Resumos</h3><ul>${a.resumos.map((r) => `<li><b>${esc(r.titulo)}</b>: ${esc(r.conteudo)}</li>`).join("")}</ul>`;
    if ((a.indicacoes || []).length) h += `<h3>Lei Seca e Jurisprudência</h3><ul>${a.indicacoes.map((i) => `<li>${esc(i.tipo === "juris" ? "jurisprudência" : "lei seca")}: ${esc(i.referencia)}</li>`).join("")}</ul>`;
  }
  return h;
}

// ---------- plano da IA (com aprovação) ----------
function planoHTML(p, stream = false) {
  const a = p.acoes;
  const blocos = [];

  if (p.analise) blocos.push(`<div class="mentor-analise"><div class="mentor-analise-h"><span class="orb orb-sm" aria-hidden="true"></span>${seloBadge("amarelo")}</div><div class="mentor-analise-txt">${stream ? "" : md(p.analise)}</div></div>`);
  if (p.atencao.length || p.melhorar.length) {
    blocos.push(`<div class="mentor-listas">
      ${p.atencao.length ? `<div><b>${icone("triangle-alert")} Atenção</b><ul>${p.atencao.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      ${p.melhorar.length ? `<div><b>${icone("trending-up")} Melhorar</b><ul>${p.melhorar.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
    </div>`);
  }

  // Metas sugeridas
  if (a.metas) {
    blocos.push(grupo("Metas sugeridas", `
      <label class="mentor-item">
        <input type="checkbox" class="ap" data-tipo="metas" checked />
        <span>Meta diária <b>${fmtMin(a.metas.diariaMin)}</b> · semanal <b>${fmtMin(a.metas.semanalMin)}</b>${a.metas.justificativa ? ` · <span class="muted">${esc(a.metas.justificativa)}</span>` : ""}</span>
      </label>`, "target"));
  }
  // Missões
  if (a.missoes.length) {
    blocos.push(grupo("Tarefas", a.missoes.map((m, i) => `
      <label class="mentor-item">
        <input type="checkbox" class="ap" data-tipo="missao" data-i="${i}" checked />
        <span><span class="mini-tag">${esc(m.categoria)}</span> ${esc(m.titulo)}${m.topico ? ` <i class="muted">(${esc(m.topico)})</i>` : ""}</span>
      </label>`).join(""), "list-checks", a.missoes.length));
  }
  // Flashcards
  if (a.flashcards.length) {
    blocos.push(grupo("Flashcards", a.flashcards.map((c, i) => `
      <label class="mentor-item">
        <input type="checkbox" class="ap" data-tipo="flashcard" data-i="${i}" checked />
        <span><b>${esc(c.frente)}</b> <span class="muted">(resposta oculta — você a verá ao revisar)</span>${c.topico ? ` <i class="muted">(${esc(c.topico)})</i>` : ""}</span>
      </label>`).join(""), "layers", a.flashcards.length));
  }
  // Questões
  if (a.questoes.length) {
    blocos.push(grupo("Questões", a.questoes.map((q, i) => `
      <label class="mentor-item">
        <input type="checkbox" class="ap" data-tipo="questao" data-i="${i}" checked />
        <span>${esc(q.enunciado)} <span class="muted">(gabarito oculto — você responde na prática)</span>${q.topico ? ` <i class="muted">(${esc(q.topico)})</i>` : ""}</span>
      </label>`).join(""), "clipboard-list", a.questoes.length));
  }
  // Caderno de erros
  if (a.erros.length) {
    blocos.push(grupo("Anotações no Caderno de Erros", a.erros.map((e, i) => `
      <label class="mentor-item">
        <input type="checkbox" class="ap" data-tipo="erro" data-i="${i}" checked />
        <span><b>${esc(e.descricao)}</b>${e.correto ? ` → ${esc(e.correto)}` : ""}${e.motivo ? ` <span class="mini-tag">${esc(e.motivo)}</span>` : ""}${e.topico ? ` <i class="muted">(${esc(e.topico)})</i>` : ""}</span>
      </label>`).join(""), "flag", a.erros.length));
  }
  // Resumos
  const resumos = a.resumos || [];
  if (resumos.length) {
    blocos.push(grupo("Resumos", resumos.map((r, i) => `
      <label class="mentor-item">
        <input type="checkbox" class="ap" data-tipo="resumo" data-i="${i}" checked />
        <span><b>${esc(r.titulo)}</b>${r.topico ? ` <i class="muted">(${esc(r.topico)})</i>` : ""}<br><span class="muted small">${esc(r.conteudo.slice(0, 160))}${r.conteudo.length > 160 ? "…" : ""}</span></span>
      </label>`).join(""), "file-text", resumos.length));
  }
  // Lei seca / Jurisprudência (leituras)
  const indicacoes = a.indicacoes || [];
  if (indicacoes.length) {
    blocos.push(grupo("Lei Seca e Jurisprudência", indicacoes.map((ind, i) => `
      <label class="mentor-item">
        <input type="checkbox" class="ap" data-tipo="indicacao" data-i="${i}" checked />
        <span><span class="mini-tag">${ind.tipo === "juris" ? "Jurisprudência" : "Lei Seca"}</span> ${esc(ind.referencia)}${ind.topico ? ` <i class="muted">(${esc(ind.topico)})</i>` : ""}</span>
      </label>`).join(""), "scale", indicacoes.length));
  }

  const temAcoes = a.metas || a.missoes.length || a.flashcards.length || a.questoes.length || a.erros.length || resumos.length || indicacoes.length;

  return `
    ${blocos.join("")}
    ${
      temAcoes
        ? `<div class="form-acoes" style="margin-top:12px">
            <span class="muted small">Marque o que aprovar (tudo já vem marcado). Ao aplicar, os itens são criados nas abas correspondentes, com o selo de origem.</span>
            <span class="spacer"></span>
            <button class="btn btn-ghost" data-action="descartar-plano">Descartar</button>
            <button class="btn btn-primary" data-action="aplicar-plano" data-tip="Cria os itens marcados nas abas (Planejamento, Flashcards, Questões, Caderno de Erros).">${icone("check")} Aplicar selecionados</button>
          </div>`
        : `<p class="muted">O mentor não propôs ações novas desta vez. <button class="lnk" data-action="descartar-plano">Fechar</button></p>`
    }`;
}

// Cabeçalho de seção do plano com ícone + contador (dá hierarquia/escaneabilidade ao plano,
// que antes era uma parede de listas com títulos só em negrito).
function grupo(titulo, corpo, ico, n) {
  return `<div class="mentor-grupo"><h4>${ico ? `${icone(ico)} ` : ""}${titulo}${n != null ? ` <span class="mentor-grupo-n">${n}</span>` : ""}</h4>${corpo}</div>`;
}

// ---------- aprovação → aplica nas telas ----------
function aplicar(root, app) {
  const { store } = app;
  if (!plano) return;
  const a = plano.acoes;
  const marcado = (tipo, i) => {
    const sel = i === undefined ? `.ap[data-tipo="${tipo}"]` : `.ap[data-tipo="${tipo}"][data-i="${i}"]`;
    const el = root.querySelector(sel);
    return el && el.checked;
  };
  const topId = (nome) => {
    const t = store.acharTopicoPorNome(nome);
    return t ? t.id : null;
  };
  const fonte = { tipo: "mentor", titulo: "Mentor (sugestão)" };
  let n = 0;

  if (a.metas && marcado("metas")) {
    store.setConfig({ metaDiariaMin: a.metas.diariaMin, metaSemanalMin: a.metas.semanalMin });
    n++;
  }
  a.missoes.forEach((m, i) => {
    if (marcado("missao", i)) {
      store.addMissao({ titulo: m.titulo, categoria: m.categoria, topicoId: topId(m.topico), origem: "mentor" });
      n++;
    }
  });
  a.flashcards.forEach((c, i) => {
    if (marcado("flashcard", i)) {
      store.addFlashcard({ frente: c.frente, verso: c.verso, topicoId: topId(c.topico), selo: "amarelo", fonte });
      n++;
    }
  });
  a.questoes.forEach((q, i) => {
    if (marcado("questao", i)) {
      store.addQuestao({ enunciado: q.enunciado, alternativas: q.alternativas, gabarito: q.correta, topicoId: topId(q.topico), selo: "amarelo", fonte });
      n++;
    }
  });
  a.erros.forEach((e, i) => {
    if (marcado("erro", i)) {
      const tid = topId(e.topico);
      const t = tid ? store.get().topicos.find((x) => x.id === tid) : null;
      store.addErroManual({ descricao: e.descricao, correto: e.correto, motivoErro: e.motivo || null, topicoId: tid, disciplinaId: t ? t.disciplinaId : null });
      n++;
    }
  });
  (a.resumos || []).forEach((r, i) => {
    if (marcado("resumo", i)) {
      store.addResumo({ titulo: r.titulo, conteudoHTML: `<p>${esc(r.conteudo)}</p>`, topicoId: topId(r.topico), origem: { tipo: "ia", fonte: "Mentor (sugestão)" } });
      n++;
    }
  });
  (a.indicacoes || []).forEach((ind, i) => {
    if (marcado("indicacao", i)) {
      store.addIndicacao({ tipo: ind.tipo, modo: "meta", referencia: ind.referencia, topicoId: topId(ind.topico) });
      n++;
    }
  });

  if (n) {
    plano = null;
    store.setMentorPlano(null);
    toast(`${plural(n, "item aplicado", "itens aplicados")} nas abas correspondentes.`);
    app.refresh();
  } else {
    toast("Nada selecionado para aplicar.", "erro");
  }
}
