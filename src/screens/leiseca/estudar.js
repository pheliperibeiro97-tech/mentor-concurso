// Lei Seca / Jurisprudência — aba ESTUDAR (lançador): escopo/recorte do estudo,
// cards de Revisar/Treinar/Gerar, sugestões do Mentor e estatísticas do escopo.
// (Extraído mecanicamente de leiseca.js — comportamento idêntico.)
import { vazio, plural } from "../../ui.js";
import { esc, fmtData, todayISO, addDays } from "../../util.js";
import { progressRing } from "../../viz.js";
import { icone } from "../../icones.js";
import { S, parseIntervaloArt } from "./estado.js";
import { normaDeRef, numArtigo, nomeAmigavelLei } from "./leitor.js";

// Aba ESTUDAR (modelo v4): NÃO é lista de texto — é um LANÇADOR. Você escolhe o que fazer
// (Certo/Errado · Completar a letra · Revisar o que vence · Refazer erros) e o escopo (tudo /
// o que mais cai), e cai em tela cheia. Absorve Treinar + Memorizar + cloze + Raio-X (como faixa).
export function estudarCorpoHTML(store, st, tipo, r) {
  const base = st.indicacoes.filter((i) => i.tipo === tipo && !i.metaLeitura && !i.revogado);
  const comTexto = base.filter((i) => (i.texto || "").trim());
  const comGrifo = comTexto.filter((i) => store.marcasDe("indicacao", i.id).some((m) => m.cor !== "comentario"));
  const dueRev = store.memoriasParaRevisar(tipo);
  const pano = store._panoramaLeiSeca();
  const foco = [...pano.pq, ...pano.fracos].filter((i, k, a) => i.tipo === tipo && a.findIndex((x) => x.id === i.id) === k).slice(0, 6);
  // Erros de treino deste tipo (última tentativa errada) → "Refazer erros".
  const treinoQs = st.questoes.filter((q) => q.treino && (q.fonte?.tipo === tipo || (tipo === "lei" && q.fonte?.tipo === "lei")));
  const ultimaErrada = (qid) => { const ts = st.tentativas.filter((t) => t.questaoId === qid); return ts.length && !ts[ts.length - 1].acertou; };
  const errosN = treinoQs.filter((q) => ultimaErrada(q.id)).length;
  const esc2 = S.estudarEscopo[tipo] || "tudo";

  if (!comTexto.length && !dueRev) {
    return vazio(
      `Nada para estudar ainda\nNa aba Ler, importe ${r.itemVazio} COM o texto — o Estudar transforma a letra em Certo/Errado, lacunas e revisão.`,
      `<button class="btn btn-add" data-action="modo" data-modo="ler">${icone("book-open")} Ir para Ler</button>`,
      icone("target")
    );
  }

  // F5 — números do dia (tira no <details> do fim), recomendação inteligente e caderno de erros.
  const hoje = store.resumoLeituraHoje();
  const ofens = store.ofensiva();
  const dificeis = base.filter((i) => i.dificil).length;
  const erros = store.errosPorArtigo(tipo);
  const fmtMin = (seg) => (seg >= 60 ? `${Math.round(seg / 60)} min` : `${seg}s`);

  // Inteligência por tema: o tema onde o aluno mais erra (só se já houver classificação + erros).
  const temaFraco = store.temasComErro(tipo)[0] || null; // F3: vale p/ juris também
  // Recomendação: revisão vencida > tema fraco > erros pendentes > foco no que mais cai > treino.
  let rec;
  if (dueRev) rec = { ic: "brain", titulo: "Revisar o que vence", desc: `${plural(dueRev, "ponto", "pontos")} na hora certa da curva do esquecimento.`, acao: "estudar-revisar" };
  else if (temaFraco && temaFraco.erros >= 2) rec = { ic: "tags", titulo: `Reforce “${temaFraco.tema}”`, desc: `É o tema onde você mais erra (${plural(temaFraco.erros, "erro", "erros")}). Estude só ele.`, acao: "estudar-tema-fraco", tema: temaFraco.tema };
  else if (errosN) rec = { ic: "list-checks", titulo: "Refazer seus erros", desc: `${plural(errosN, "questão que você errou", "questões que você errou")} esperando revanche.`, acao: "estudar-erros" };
  else if (foco.length) rec = { ic: "bar-chart-3", titulo: "Foque no que mais cai", desc: "Certo/Errado só com os dispositivos prioritários.", acao: "estudar-foco" };
  else rec = { ic: "repeat-2", titulo: "Certo / Errado", desc: "Treine a letra julgando afirmações certas ou erradas.", acao: "estudar-ce" };

  // Tira de contexto FINA — números do dia em uma linha. Fase 5: contexto, não ação — vive
  // recolhida no <details> "Mais" do FIM da aba (o Estudar acima da dobra é só lançador).
  const etItem = (ic, n, lbl, cls = "") => `<span class="et-item ${cls}">${icone(ic)}<b>${n}</b> ${lbl}</span>`;
  const tiraDia = `<div class="estudar-tira">
        ${etItem("book-open", hoje.lidosHoje, "lidos hoje")}
        ${etItem("check-check", hoje.questoesHoje, hoje.pctHoje != null ? `questões · ${hoje.pctHoje}%` : "questões")}
        ${etItem("flame", dificeis, "difíceis")}
        ${etItem("zap", ofens.atual, ofens.atual === 1 ? "dia seguido" : "dias seguidos")}
        ${hoje.tempoSeg ? etItem("clock-3", fmtMin(hoje.tempoSeg), "praticando") : ""}
      </div>`;

  // ESCOPO/OBJETO do estudo (delimitar não é "tudo de todas as leis" — a IA e o recall pedem foco).
  // Lei escolhida (default = lei ativa do leitor) + seção estrutural (Título/Capítulo) opcional.
  const normas = tipo === "lei" ? [...new Set(base.map((i) => normaDeRef(i.referencia)).filter(Boolean))] : [];
  // Default do escopo: lei escolhida → lei ativa do leitor → 1ª lei (evita nome vazio ao vir da biblioteca).
  const leiSel = tipo === "lei" ? (S.estudarLeiSel || S.leiAtiva.lei || normas[0] || null) : null;
  // Seções (níveis 1–3) da lei escolhida, em ordem do documento.
  const secMap = new Map();
  if (tipo === "lei") for (const i of base) {
    if (leiSel && leiSel !== "todas" && normaDeRef(i.referencia) !== leiSel) continue;
    for (const n of i.estrutura || []) if (n.nivel <= 3) { const k = n.rotulo + "|" + (n.titulo || ""); if (!secMap.has(k)) secMap.set(k, { ...n, k }); }
  }
  const secoes = [...secMap.values()];
  // Conjunto REAL do escopo (para os contadores dos cards e para a IA).
  const artRange = parseIntervaloArt(S.estudarArtFiltro);
  const noEscopoSemTema = (i) => (!leiSel || leiSel === "todas" || normaDeRef(i.referencia) === leiSel)
    && (!S.estudarSecaoSel || (Array.isArray(i.estrutura) && i.estrutura.some((n) => n.rotulo + "|" + (n.titulo || "") === S.estudarSecaoSel)))
    && (!artRange || (() => { const nn = numArtigo(i.referencia); return nn >= artRange.de && nn <= artRange.ate; })());
  const noEscopo = (i) => S.estudarSoItem[tipo] ? i.id === S.estudarSoItem[tipo] : (noEscopoSemTema(i) && (!S.estudarTemaSel || (Array.isArray(i.temas) && i.temas.includes(S.estudarTemaSel))));
  // C.2.4 — recorte de estudo da JURISPRUDÊNCIA por tribunal/ramo/assunto/categoria (sem o tema).
  const noEscopoJurisSemTema = (i) =>
    (!S.estudarJurisTrib || String(i.tribunal || "") === S.estudarJurisTrib)
    && (!S.estudarJurisRamo || String(i.ramo || "") === S.estudarJurisRamo)
    && (!S.estudarJurisAssunto || String(i.assunto || "") === S.estudarJurisAssunto)
    && (!S.estudarJurisCat || String(i.categoria || "") === S.estudarJurisCat);
  const noEscopoJuris = (i) => S.estudarSoItem[tipo] ? i.id === S.estudarSoItem[tipo] : (noEscopoJurisSemTema(i) && (!S.estudarTemaSel || (Array.isArray(i.temas) && i.temas.includes(S.estudarTemaSel))));
  // Temas disponíveis no recorte (habilita "Memorizar por tema"): lei = lei/seção/artigo; juris = trib/ramo/assunto/cat.
  const temasDisp = tipo === "lei" ? store.temasDisponiveis(comTexto.filter(noEscopoSemTema).map((i) => i.id)) : store.temasDisponiveis(comTexto.filter(noEscopoJurisSemTema).map((i) => i.id));
  const comTextoEsc = tipo === "lei" ? comTexto.filter(noEscopo) : comTexto.filter(noEscopoJuris);
  const comGrifoEsc = tipo === "lei" ? comGrifo.filter(noEscopo) : comGrifo.filter(noEscopoJuris);
  // Opções do recorte de juris (cascata: assunto restringe ao ramo escolhido).
  const jTribs = tipo === "juris" ? [...new Set(base.map((i) => i.tribunal).filter(Boolean))].sort() : [];
  const jRamos = tipo === "juris" ? [...new Set(base.map((i) => i.ramo).filter(Boolean))].sort() : [];
  const jAssuntos = tipo === "juris" ? [...new Set(base.filter((i) => !S.estudarJurisRamo || i.ramo === S.estudarJurisRamo).map((i) => i.assunto).filter(Boolean))].sort() : [];
  const jCats = tipo === "juris" ? [...new Set(base.map((i) => i.categoria).filter(Boolean))].sort() : [];
  const nEsc = comTextoEsc.length;
  const temInc = base.some((i) => i.pqIncidencia != null); // há artigos marcados por incidência?

  // ESCOPO: a LEI é a escolha principal (destaque); "Refinar" (parte/artigos/tema/prioridade) e OPCIONAL.
  const secAtual = S.estudarSecaoSel ? secoes.find((s) => s.k === S.estudarSecaoSel) : null;
  const leiNome = leiSel ? nomeAmigavelLei(leiSel) : "";
  const refinoPartes = tipo === "lei"
    ? [secAtual ? (secAtual.titulo || secAtual.rotulo) : "a lei inteira",
       S.estudarArtFiltro ? `art. ${S.estudarArtFiltro}` : "", S.estudarTemaSel ? `tema: ${S.estudarTemaSel}` : "",
       esc2 === "incidencia" ? "o que mais cai" : ""].filter(Boolean)
    : [];
  const filtrado = tipo === "lei" && (S.estudarSecaoSel || S.estudarArtFiltro || S.estudarTemaSel || esc2 === "incidencia");
  const escopoLeiHTML = tipo !== "lei" ? "" : `<div class="estudar-escopo ${S._escopoAberto ? "aberto" : ""}">
      <button class="est-escopo-btn ${filtrado ? "on" : ""}" data-action="estudar-escopo-toggle" data-tip="Escolher a lei a estudar (e, se quiser, refinar por parte, artigos ou incidência)">
        ${icone("book-open")}<span class="ee-resumo"><b class="ee-lei">${esc(leiNome)}</b><span class="ee-refino"> · ${esc(refinoPartes.join(" · "))}</span></span><span class="escopo-cont">${plural(nEsc, "artigo", "artigos")}</span>${icone("chevron-down")}
      </button>
      ${S._escopoAberto ? `<div class="est-escopo-pop">
        <div class="ee-sec-lbl">${icone("book-open")} Lei a estudar</div>
        ${normas.length > 1
          ? `<select class="escopo-sel ee-lei-sel" data-action="escopo-lei">${normas.map((nr) => `<option value="${esc(nr)}" ${leiSel === nr ? "selected" : ""}>${esc(nomeAmigavelLei(nr))}</option>`).join("")}</select>`
          : `<div class="ee-lei-fixa"><b>${esc(leiNome)}</b><span class="muted small">Importe outra lei na aba Ler para ter mais opções.</span></div>`}
        <div class="ee-sec-lbl ee-opc">Refinar <span>— opcional</span></div>
        ${secoes.length ? `<label class="ee-row"><span>Parte</span><select class="escopo-sel" data-action="escopo-secao">
          <option value="">A lei inteira</option>
          ${secoes.map((s) => `<option value="${esc(s.k)}" ${S.estudarSecaoSel === s.k ? "selected" : ""}>${" ".repeat(Math.max(0, (s.nivel - 1) * 2))}${esc(s.rotulo)}${s.titulo ? " · " + esc(s.titulo) : ""}</option>`).join("")}
        </select></label>` : ""}
        <label class="ee-row"><span>Artigos</span><input class="escopo-art" data-action="escopo-art" value="${esc(S.estudarArtFiltro)}" placeholder="ex.: 121 ou 1-10" />
          <span class="ee-hint">Um número ou um intervalo. Vazio = todos os artigos do campo acima.</span></label>
        ${temasDisp.length ? `<label class="ee-row"><span>Tema</span><select class="escopo-sel" data-action="escopo-tema">
          <option value="">Todos os temas</option>
          ${temasDisp.map((t) => `<option value="${esc(t.tema)}" ${S.estudarTemaSel === t.tema ? "selected" : ""}>${esc(t.tema)} (${t.n})</option>`).join("")}
        </select></label>` : ""}
        <div class="ee-row"><span>Prioridade</span><div class="ee-toggle">
          <button class="chip-escopo ${esc2 === "tudo" ? "on" : ""}" data-action="estudar-escopo" data-e="tudo">Todos</button>
          <button class="chip-escopo ${esc2 === "incidencia" ? "on" : ""}" data-action="estudar-escopo" data-e="incidencia" data-tip="'O que mais cai' usa só os artigos que você marcou por incidência em prova (top 20%).${temInc ? "" : " Nenhum marcado ainda: marque em Ler > Opções > Marcar o que mais cai."}">O que mais cai</button>
        </div></div>
        <div class="ee-foot">${filtrado ? `<button class="lnk" data-action="estudar-escopo-limpar">${icone("x")} Limpar recorte</button>` : "<span></span>"}<button class="btn btn-sm btn-primary" data-action="estudar-escopo-toggle">Pronto</button></div>
      </div>` : ""}
    </div>`;
  // C.2.4 — escopo de estudo da JURISPRUDÊNCIA: tribunal / ramo / assunto / categoria / tema.
  const jFiltrado = tipo === "juris" && (S.estudarJurisTrib || S.estudarJurisRamo || S.estudarJurisAssunto || S.estudarJurisCat || S.estudarTemaSel || esc2 === "incidencia");
  const jResumo = S.estudarJurisRamo || S.estudarJurisTrib || S.estudarJurisCat || "Toda a jurisprudência";
  const jRefino = [S.estudarJurisTrib && S.estudarJurisTrib !== jResumo ? S.estudarJurisTrib : "", S.estudarJurisAssunto, S.estudarJurisCat && S.estudarJurisCat !== jResumo ? S.estudarJurisCat : "", S.estudarTemaSel ? `tema: ${S.estudarTemaSel}` : "", esc2 === "incidencia" ? "o que mais cai" : ""].filter(Boolean);
  const jSel = (act, val, opts, todos) => `<select class="escopo-sel" data-action="${act}"><option value="">${todos}</option>${opts.map((o) => `<option value="${esc(o)}" ${val === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  const escopoJurisHTML = tipo !== "juris" ? "" : `<div class="estudar-escopo ${S._escopoAberto ? "aberto" : ""}">
      <button class="est-escopo-btn ${jFiltrado ? "on" : ""}" data-action="estudar-escopo-toggle" data-tip="Recortar o que estudar: tribunal, ramo, assunto, categoria ou tema">
        ${icone("scale")}<span class="ee-resumo"><b class="ee-lei">${esc(jResumo)}</b><span class="ee-refino">${jRefino.length ? " · " + esc(jRefino.join(" · ")) : ""}</span></span><span class="escopo-cont">${plural(nEsc, "julgado", "julgados")}</span>${icone("chevron-down")}
      </button>
      ${S._escopoAberto ? `<div class="est-escopo-pop">
        <div class="ee-sec-lbl">${icone("scale")} Recorte da jurisprudência <span>— tudo opcional</span></div>
        ${jTribs.length ? `<label class="ee-row"><span>Tribunal</span>${jSel("escopo-j-trib", S.estudarJurisTrib, jTribs, "Todos")}</label>` : ""}
        ${jRamos.length ? `<label class="ee-row"><span>Ramo</span>${jSel("escopo-j-ramo", S.estudarJurisRamo, jRamos, "Todos")}</label>` : ""}
        ${jAssuntos.length ? `<label class="ee-row"><span>Assunto</span>${jSel("escopo-j-assunto", S.estudarJurisAssunto, jAssuntos, "Todos")}</label>` : ""}
        ${jCats.length ? `<label class="ee-row"><span>Categoria</span>${jSel("escopo-j-cat", S.estudarJurisCat, jCats, "Todas")}</label>` : ""}
        ${temasDisp.length ? `<label class="ee-row"><span>Tema</span><select class="escopo-sel" data-action="escopo-tema"><option value="">Todos os temas</option>${temasDisp.map((t) => `<option value="${esc(t.tema)}" ${S.estudarTemaSel === t.tema ? "selected" : ""}>${esc(t.tema)} (${t.n})</option>`).join("")}</select></label>` : ""}
        <div class="ee-row"><span>Prioridade</span><div class="ee-toggle">
          <button class="chip-escopo ${esc2 === "tudo" ? "on" : ""}" data-action="estudar-escopo" data-e="tudo">Todos</button>
          <button class="chip-escopo ${esc2 === "incidencia" ? "on" : ""}" data-action="estudar-escopo" data-e="incidencia" data-tip="'O que mais cai' usa só as súmulas/teses marcadas por incidência (★).${temInc ? "" : " Nenhuma marcada ainda: marque em Ler > ★ O que mais cai."}">O que mais cai</button>
        </div></div>
        <div class="ee-foot">${jFiltrado ? `<button class="lnk" data-action="estudar-escopo-limpar">${icone("x")} Limpar recorte</button>` : "<span></span>"}<button class="btn btn-sm btn-primary" data-action="estudar-escopo-toggle">Pronto</button></div>
      </div>` : ""}
    </div>`;
  // Trava de item (Central → "Iniciar"): no lugar do seletor de escopo, uma faixa fixa com o
  // dispositivo em revisão + "sair". Certo/Errado, Completar e Gerar passam a usar só ele.
  const soItemInd = S.estudarSoItem[tipo] ? st.indicacoes.find((i) => i.id === S.estudarSoItem[tipo]) : null;
  const escopoSel = soItemInd
    ? `<div class="estudar-escopo est-soitem"><span class="est-escopo-btn on" data-tip="Revisão travada neste dispositivo — Certo/Errado, Completar e Gerar usam só ele.">${icone("target")} <span class="ee-resumo"><b>Revisão: ${esc(String(soItemInd.referencia || "").split(",")[0].trim())}</b>${soItemInd.tribunal ? ` <span class="muted small">(${esc(soItemInd.tribunal)})</span>` : ""}</span></span><button class="lnk small" data-action="estudar-soitem-limpar" data-tip="Sair da revisão e estudar o resto normalmente.">${icone("x")} sair</button></div>`
    : (tipo === "lei" ? escopoLeiHTML : escopoJurisHTML);

  // F5 (2ª leva) — ESTATÍSTICAS específicas da lei/escopo: progresso, dominados/a-revisar,
  // desempenho por tema (acerto) e evolução da leitura (14 dias). Recolhível (não polui).
  const statsBase = tipo === "lei" ? comTexto.filter(noEscopoSemTema) : comTexto;
  const errosMap = new Map(erros.map((e) => [e.indicacaoId, e]));
  const lidosEsc = statsBase.filter((i) => i.lido).length;
  const pctLido = statsBase.length ? Math.round((100 * lidosEsc) / statsBase.length) : 0;
  const hojeISOe = todayISO();
  const dominados = statsBase.filter((i) => { const e = errosMap.get(i.id); return (e && e.total >= 2 && e.pctAcerto >= 80) || (i.promovido && i.revisao && i.revisao.intervalo >= 15); }).length;
  const aRevisarN = statsBase.filter((i) => (i.promovido || i.modo === "memoria") && i.revisao && i.revisao.proxima < hojeISOe).length;
  const temaPerf = temasDisp.map((t) => {
    const arts = statsBase.filter((i) => (i.temas || []).includes(t.tema));
    let tot = 0, err = 0;
    for (const a of arts) { const e = errosMap.get(a.id); if (e) { tot += e.total; err += e.erros; } }
    return { tema: t.tema, tentativas: tot, acerto: tot ? Math.round((100 * (tot - err)) / tot) : null };
  }).filter((t) => t.tentativas > 0).sort((a, b) => a.acerto - b.acerto).slice(0, 8);
  // F4.2 — progresso e ESQUECIDOS por tema (lido/total + revisões vencidas por tema).
  const temaProgresso = temasDisp.map((t) => {
    const arts = statsBase.filter((i) => (i.temas || []).includes(t.tema));
    const lidos = arts.filter((i) => i.lido).length;
    const esquec = arts.filter((i) => (i.promovido || i.modo === "memoria") && i.revisao && i.revisao.proxima < hojeISOe).length;
    return { tema: t.tema, total: arts.length, lidos, esquec, pct: arts.length ? Math.round((100 * lidos) / arts.length) : 0 };
  }).filter((t) => t.total > 0).sort((a, b) => b.esquec - a.esquec || b.total - a.total).slice(0, 8);
  const dias14 = []; for (let k = 13; k >= 0; k--) dias14.push(addDays(hojeISOe, -k));
  const lidosPorDia = dias14.map((d) => statsBase.filter((i) => (i.lidoEm || "").slice(0, 10) === d).length);
  const maxDia = Math.max(1, ...lidosPorDia);
  const temStats = statsBase.length && (lidosEsc > 0 || temaPerf.length > 0); // F3: stats p/ juris também
  const statsHTML = temStats ? `<details class="estat-lei">
      <summary class="plan-sec-head"><span class="eg-ic">${icone("bar-chart-3")}</span><b>Estatísticas ${tipo === "juris" ? "da jurisprudência" : "da lei"}</b><span class="muted small">${tipo === "lei" ? "— no escopo atual" : ""}</span></summary>
      <div class="estat-corpo">
        <div class="estat-topo">
          <div class="estat-ring">${progressRing(pctLido, { size: 88, sub: "lido" })}</div>
          <div class="estat-nums">
            <div class="estat-num"><b>${lidosEsc}<span class="estat-de">/${statsBase.length}</span></b><span>lidos</span></div>
            <div class="estat-num"><b>${dominados}</b><span>dominados</span></div>
            <div class="estat-num ${aRevisarN ? "due" : ""}"><b>${aRevisarN}</b><span>a revisar</span></div>
            <div class="estat-num"><b>${statsBase.length - lidosEsc}</b><span>a ler</span></div>
          </div>
        </div>
        ${temaPerf.length ? `<div class="estat-sub">Desempenho por tema <span class="muted small">(% de acerto)</span></div>
          ${temaPerf.map((t) => `<div class="estat-bar-linha"><span class="ebl-lbl">${esc(t.tema)}</span><span class="ebl-bar ${t.acerto < 60 ? "ruim" : t.acerto < 80 ? "reg" : "bom"}"><span style="width:${t.acerto}%"></span></span><span class="ebl-n">${t.acerto}%</span></div>`).join("")}` : `<p class="muted small">Resolva questões (Certo/Errado) para ver o desempenho por tema.</p>`}
        ${temaProgresso.length ? `<div class="estat-sub">Progresso por tema <span class="muted small">(lido · a revisar)</span></div>
          ${temaProgresso.map((t) => `<div class="estat-bar-linha"><button class="ebl-lbl ebl-lbl-lnk" data-action="estudar-tema-chip" data-tema="${esc(t.tema)}" data-tip="Estudar só este tema.">${esc(t.tema)}</button><span class="ebl-bar bom"><span style="width:${t.pct}%"></span></span><span class="ebl-n">${t.lidos}/${t.total}${t.esquec ? ` <span class="ebl-due" data-tip="Revisões vencidas neste tema.">${icone("brain")}${t.esquec}</span>` : ""}</span></div>`).join("")}` : ""}
        <div class="estat-sub">Leitura — últimos 14 dias</div>
        <div class="estat-evol">${lidosPorDia.map((n, k) => `<span class="ee-col" data-tip="${fmtData(dias14[k])}: ${plural(n, "artigo", "artigos")}"><span style="height:${Math.max(3, Math.round((100 * n) / maxDia))}%"></span></span>`).join("")}</div>
      </div>
    </details>` : "";

  // A recomendação do Mentor destaca o card certo (borda + tooltip, SEM selo — o selo duplicava
  // os chips "O Mentor sugere"). Recs sem card próprio (foco/tema fraco) apontam p/ Certo/Errado.
  const recCardAcao = { "estudar-foco": "estudar-ce", "estudar-tema-fraco": "estudar-ce" }[rec.acao] || rec.acao;
  // opcoes (opcional): { acao, tip } — link "Opções…" discreto dentro do card. O clique no card
  // inicia DIRETO com o padrão; o link abre a escolha de quantidade/dificuldade (bindActions
  // dispara pelo [data-action] mais interno, então o clique no link não dispara o card).
  const card = (ic, titulo, desc, acao, extra, on = true, opcoes = null) => {
    const isRec = on && acao === recCardAcao;
    return `
    <button class="estudar-card ${on ? "" : "off"} ${isRec ? "rec" : ""}" data-action="${acao}" ${on ? "" : "disabled"}${isRec ? ` data-tip="${esc(rec.desc)}"` : ""}>
      <span class="estudar-card-ic">${icone(ic)}</span>
      <span class="estudar-card-txt"><b>${titulo}</b><span class="muted small">${desc}</span></span>
      ${extra ? `<span class="estudar-card-n">${extra}</span>` : ""}
      ${opcoes && on ? `<span class="lnk small" role="button" data-action="${opcoes.acao}" data-tip="${opcoes.tip}">Opções…</span>` : ""}
    </button>`;
  };
  const grupo = (ic, titulo, sub, cards) => `<section class="estudar-grupo">
      <div class="eg-head"><span class="eg-ic">${icone(ic)}</span><b>${titulo}</b><span class="muted small">${sub}</span></div>
      <div class="estudar-grid">${cards.filter(Boolean).join("")}</div>
    </section>`;

  // Erros FUNDIDOS (E5): um card só "Meus erros" com Refazer (treino) + Abrir caderno (tela dedicada).
  const isRecErros = recCardAcao === "estudar-erros";
  const errosCard = (errosN || erros.length) ? `<div class="estudar-card estudar-card-gerar ${isRecErros ? "rec" : ""}">
      <span class="estudar-card-ic">${icone("list-checks")}</span>
      <span class="estudar-card-txt"><b>Meus erros</b><span class="muted small">${erros.length ? plural(erros.length, "artigo com erro recorrente", "artigos com erros recorrentes") : "questões que você errou no treino"}</span></span>
      <span class="estudar-card-acoes">
        ${errosN ? `<button class="btn btn-sm btn-soft" data-action="estudar-erros">${icone("repeat-2")} Refazer (${errosN})</button>` : ""}
        <button class="btn btn-sm btn-ghost" data-action="ir-caderno">${icone("book-open")} Caderno</button>
      </span>
    </div>` : "";
  // Cards secundários (grifos) só aparecem quando HÁ o quê — não ficam apagados ocupando espaço.
  const cardsRevisar = [
    card("brain", "Revisar o que vence", "Revisão espaçada dos pontos que você marcou para fixar.", "estudar-revisar", dueRev ? `${dueRev}` : "0", true),
    comGrifoEsc.length ? card("highlighter", "Revisar grifos", "Releia só o que grifou (Só as marcas) ou tampe e tente lembrar (Recordar).", "estudar-grifos", `${comGrifoEsc.length}`, true) : "",
    errosCard,
  ];
  const cardsTreinar = [
    card("repeat-2", "Certo / Errado", tipo === "juris" ? "Afirmações sobre a súmula/tese — você julga Certo ou Errado. Um clique já começa (4 itens, nível médio)." : "Uma palavra é trocada no texto; você caça a pegadinha (diff colorido). Um clique já começa (4 itens, nível médio).", "estudar-ce", nEsc ? `${nEsc}` : "", !!nEsc, { acao: "estudar-ce-opcoes", tip: "Escolher quantidade e dificuldade antes de começar." }),
    card("puzzle", "Completar o artigo", tipo === "juris" ? "Recall por lacunas nos pontos-chave da tese." : "Preencha as lacunas em 4 níveis — do fácil ao redigitar de memória.", "estudar-cloze", "", !!nEsc),
    tipo === "juris" ? card("scale", "Súmula-duelo", "Troca-se o número/tribunal da súmula — você diz se a atribuição está certa (offline).", "estudar-duelo", "", !!base.length) : "",
  ];
  // GERAR unificado: UM card (mesmo estilo dos demais) com os dois destinos como botões dentro —
  // unificado E consistente. A IA cria a partir do escopo e leva direto para a aba correspondente.
  const gerarHTML = nEsc ? `<section class="estudar-grupo">
      <div class="eg-head"><span class="eg-ic">${icone("sparkles")}</span><b>Gerar com IA</b><span class="muted small">material do escopo para fixar depois</span></div>
      <div class="estudar-grid">
        <div class="estudar-card estudar-card-gerar">
          <span class="estudar-card-ic">${icone("sparkles")}</span>
          <span class="estudar-card-txt"><b>Gerar material</b><span class="muted small">A IA cria a partir do escopo e abre a aba correspondente. Você escolhe quantidade e nível.</span></span>
          <span class="estudar-card-acoes">
            <button class="btn btn-sm btn-soft" data-action="estudar-flashcards" data-tip="Gerar flashcards do escopo — você escolhe quantidade e nível.">${icone("layers")} Flashcards</button>
            <button class="btn btn-sm btn-soft" data-action="estudar-questoes" data-tip="Gerar questões de múltipla escolha do escopo — você escolhe quantidade e nível.">${icone("notebook-pen")} Questões</button>
          </span>
        </div>
      </div>
    </section>` : "";

  // F2 (#16 + #21) — sugestões PROATIVAS do Mentor: lê o estado real (revisões vencendo, erros,
  // tema fraco, muitos difíceis, o que mais cai) e oferece 1–3 ações de 1 clique.
  const recs = [];
  if (dueRev) recs.push({ ic: "brain", txt: `${plural(dueRev, "revisão vencendo", "revisões vencendo")}`, acao: "estudar-revisar" });
  if (errosN) recs.push({ ic: "list-checks", txt: `Refazer ${plural(errosN, "erro", "erros")}`, acao: "estudar-erros" });
  if (temaFraco && temaFraco.erros >= 2) recs.push({ ic: "tags", txt: `Reforçar “${temaFraco.tema}”`, acao: "estudar-tema-fraco", tema: temaFraco.tema });
  if (dificeis >= 3) recs.push({ ic: "flame", txt: `${dificeis} difíceis — treinar Certo/Errado`, acao: "estudar-ce" });
  else if (foco.length >= 3) recs.push({ ic: "star", txt: "Foco no que mais cai", acao: "estudar-foco" });
  const sugereHTML = recs.length ? `<div class="est-sugere"><span class="est-sugere-h">${icone("sparkles")} O Mentor sugere</span><div class="est-sugere-chips">${recs.slice(0, 3).map((r) => `<button class="est-sugere-chip" data-action="${r.acao}"${r.tema ? ` data-tema="${esc(r.tema)}"` : ""} data-tip="Fazer agora.">${icone(r.ic)} ${esc(r.txt)}</button>`).join("")}</div></div>` : "";

  // F2 — MEMORIZAR TEMÁTICO: atalho de 1 clique por tema (Prazo, Competência…). Ao escolher, foca o
  // escopo naquele tema e as ações abaixo (Certo/Errado, Completar, Gerar) passam a operar só nele.
  const crossLei = S.estudarLeiSel === "todas";
  const temTemas = temasDisp.length; // F3: memorizar por tema também na juris
  const temMaisDeUmaLei = tipo === "lei" && new Set(st.indicacoes.filter((i) => i.tipo === "lei" && !i.metaLeitura && !i.revogado && (i.texto || "").trim()).map((i) => normaDeRef(i.referencia) || "Outros")).size > 1;
  const temaChipsHTML = temTemas ? `<div class="est-temas">
      <span class="est-temas-h">${icone("tags")} Memorizar por tema</span>
      <div class="est-temas-chips">
        ${temasDisp.slice(0, 12).map((t) => `<button class="est-tema-chip ${S.estudarTemaSel === t.tema ? "on" : ""}" data-action="estudar-tema-chip" data-tema="${esc(t.tema)}" data-tip="Estudar só ${esc(t.tema)}${crossLei ? " (todas as leis)" : ""} — Certo/Errado, Completar e Gerar passam a focar neste tema.">${esc(t.tema)} <span class="etc-n">${t.n}</span></button>`).join("")}
        ${S.estudarTemaSel ? `<button class="est-tema-chip clear" data-action="estudar-tema-limpar" data-tip="Voltar a todos os temas.">${icone("x")} limpar</button>` : ""}
      </div>
      ${temMaisDeUmaLei ? `<button class="est-crosslei ${crossLei ? "on" : ""}" data-action="estudar-cross-lei" data-tip="Alternar entre estudar o tema só nesta lei ou em TODAS as leis importadas.">${icone(crossLei ? "check-check" : "layers")} ${crossLei ? "Todas as leis" : "Só esta lei"}</button>` : ""}
    </div>` : "";

  // Fase 5 — Estudar como LANÇADOR: acima da dobra só o que dispara ação (chips do Mentor,
  // escopo e os cards Revisar/Treinar/Gerar). Contexto (números do dia) e o atalho "Memorizar
  // por tema" ficam num <details> recolhido no fim — abre expandido se um tema está ativo.
  const maisHTML = `<details class="ed-ajuda est-mais"${S.estudarTemaSel ? " open" : ""}>
      <summary>Números do dia${temTemas ? " e memorizar por tema" : ""}</summary>
      <div class="ed-ajuda-corpo">${tiraDia}${temaChipsHTML}</div>
    </details>`;
  return `
    ${sugereHTML}
    ${escopoSel}
    ${grupo("rotate-ccw", "Revisar", "o que você já viu", cardsRevisar)}
    ${grupo("dumbbell", "Treinar", "teste-se na letra da lei", cardsTreinar)}
    ${gerarHTML}
    ${statsHTML}
    ${maisHTML}`;
}
