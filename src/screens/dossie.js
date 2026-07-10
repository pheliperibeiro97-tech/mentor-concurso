// Dossiê por Tópico = "pasta viva": reúne, em RESUMO e LINKADO, tudo de um assunto do
// edital. Cada item abre a respectiva tela já apontando para ele (deep-link via focarItem).
// NÃO é rota própria: vive embutido no Edital. Exporta dossieResumoHTML (visão de todo o
// edital) e renderDossieDetalhe (a pasta viva de um tópico).
import { bindActions, toast, header, seloBadge, vazio, imprimir, botaoImprimir, confirmar, escolher, iconImprimir, skeletonDoc , plural, defMetrica, ligarArrastar } from "../ui.js";
import { esc, fmtTempo, pct, fmtData, todayISO } from "../util.js";
import { icone } from "../icones.js";
import { progressRing } from "../viz.js";
import { relBandClass, relLabel, relValor, relPillSelectHTML, aplicarRelNamed, relNamedValor, relNamedNome } from "./edital.js";
import { FASES, ORDEM_FASES } from "../ciclo.js";
import { gerarEAbrirMapa, abrirMapaCompleto } from "../mapa-mental.js";

// Ordenação/edição das SESSÕES do tópico (mesma lógica do Acompanhamento, sem as
// colunas de disciplina/tópico — aqui já está tudo vinculado a um tópico).
let sessSort = { col: "data", dir: "desc" };
let sessEditId = null;
let sessFiltroFase = "";
let aliasAberto = false; // editor de "também conhecido como" (sinônimos) do tópico aberto
let dossieRevelar = new Set(); // seções vazias que o usuário optou por revelar (para adicionar)
let dossieEscondido = new Set(); // seções que o usuário tirou do dossiê (voltam para "Adicionar")

// Visão de TODO o edital: cards por tópico (agrupados por disciplina) com as
// estatísticas resumidas. Reutilizado pelo Edital (modo "Resumo"). Cada card usa
// data-action="ir-dossie" — quem renderiza decide o que fazer ao abrir.
export function dossieResumoHTML(store) {
  const st = store.get();
  if (!st.disciplinas.length)
    return vazio(
      "Monte seu edital\nAdicione as disciplinas e tópicos para ver o dossiê de cada um.",
      `<button class="btn btn-add" data-action="toggle-add-disc">${icone("plus")} Adicionar ao edital</button>`,
      icone("library")
    );
  return st.disciplinas
    .map((d) => {
      const tops = st.topicos.filter((t) => t.disciplinaId === d.id);
      const cor = store.corDisciplina(d.id);
      const concl = tops.filter((t) => t.concluido).length;
      return `
        <div class="dossie-disc">
          <h3 class="ddx-disc-tit">
            <span class="cur-dot" style="background:${cor}"></span>
            <button class="lnk" data-action="ir-dossie-disc" data-id="${d.id}" data-tip="Abrir o painel da disciplina: KPIs, semáforo por tópico e histórico." data-tip-pos="bottom-esq">${esc(d.nome)} <span class="mapa-abrir-ico">${icone("external-link")}</span></button>
            <span class="ddx-disc-cont">${concl}/${tops.length}</span>
          </h3>
          <div class="dossie-tops">
            ${
              tops.length
                ? tops
                    .map((t) => {
                      const dos = store.dossie(t.id);
                      const aprov = dos.totalTentativas ? pct(dos.acertos, dos.totalTentativas) : null;
                      const apCls = aprov === null ? "z" : aprov < 50 ? "r" : aprov < 75 ? "y" : "g";
                      const relV = relNamedValor(t);
                      return `
                  <button class="dossie-card ${t.concluido ? "ddx-done" : ""}" data-action="ir-dossie" data-id="${t.id}">
                    <div class="ddx-card-top">
                      <span class="dossie-card-nome">${t.concluido ? `${icone("check")} ` : ""}${esc(t.nome)}</span>
                      <span class="mapa-abrir-ico">${icone("external-link")}</span>
                    </div>
                    <div class="dossie-card-stats">
                      ${relV !== "nd" ? `<span class="rel-pill relp-${relV} ddx-relpill">${relNamedNome(t)}</span>` : ""}
                      ${aprov !== null ? `<span class="ddx-ap ds-${apCls}" data-tip="Aproveitamento nas questões">${aprov}%</span>` : ""}
                      <span data-tip="Materiais"><span class="ddx-stat-lbl">Mat.</span> ${dos.documentos.length}</span>
                      <span data-tip="Questões"><span class="ddx-stat-lbl">Quest.</span> ${dos.questoes.length}</span>
                      <span data-tip="Flashcards"><span class="ddx-stat-lbl">Flash.</span> ${dos.flashcards.length}</span>
                      <span data-tip="Tempo estudado">${icone("clock-3")} ${fmtTempo(dos.tempoSeg)}</span>
                    </div>
                  </button>`;
                    })
                    .join("")
                : `<p class="muted">Sem tópicos.</p>`
            }
          </div>
        </div>`;
    })
    .join("");
}

// ícone do selo de origem, compacto (só a bolinha; a fonte completa vai no tooltip).
function seloIcone(selo) {
  return selo === "verde" ? icone("book-open") : selo === "manual" || selo === "branco" ? icone("square-pen") : icone("bot");
}
function seloMini(selo, fonte) {
  const full =
    fonte && fonte.titulo
      ? `${selo === "verde" ? "Extraído do seu material" : "Gerado pela IA — confira"} · Fonte: ${fonte.titulo}`
      : selo === "verde"
      ? "Extraído do seu material"
      : selo === "manual" || selo === "branco"
      ? "Criado por você"
      : "Gerado pela IA — confira";
  return `<span class="selo-mini selo-${selo}" data-tip-pos="cima-dir" data-tip="${esc(full)}">${seloIcone(selo)}</span>`;
}
function corta(txt, n) {
  const s = (txt || "").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// Detalhe (pasta viva) de um tópico. Usado pelo Dossiê e EMBUTIDO no Edital.
// onVoltar: o que fazer ao clicar em "voltar" (ex.: limpar o tópico aberto no Edital).
export function renderDossieDetalhe(root, app, topicoId, onVoltar) {
  const { store } = app;
  const st = store.get();
  const dos = store.dossie(topicoId);
  const t = dos.topico;
  const disc = st.disciplinas.find((d) => d.id === t.disciplinaId);
  const aproveitamento = dos.totalTentativas ? pct(dos.acertos, dos.totalTentativas) : null;

  // Caderno de Erros DESTE tópico (espelha a tela: respeita "fora do caderno").
  const meusErros = store
    .cadernoErros()
    .filter((e) => (e.manual ? e.topicoId : e.questao && e.questao.topicoId) === topicoId);
  // As METAS de leitura (a cumprir) já aparecem em Tarefas; aqui ficam só os trechos
  // gravados para MEMORIZAR (revisão espaçada fica na tela de Lei Seca/Jurisprudência).
  const memLei = dos.indicacoes.filter((i) => i.tipo === "lei" && i.modo === "memoria");
  const memJuris = dos.indicacoes.filter((i) => i.tipo === "juris" && i.modo === "memoria");
  // Dossiê de marcações: grifos (por cor) + comentários de todas as fontes do tópico.
  const marc = store.marcacoesDoTopico(topicoId);
  // Revisão de tópico (curva do esquecimento) deste tópico, se agendada.
  const revTop = store.revisaoTopicoDe(topicoId);
  const revLabel = (() => {
    if (!revTop) return "—";
    const m = { 1: "24h", 7: "7d", 15: "15d", 30: "30d", 60: "60d", 120: "120d" };
    const venc = revTop.proxima <= todayISO();
    return `${venc ? `${icone("bell")} ` : ""}${m[revTop.intervalo] || revTop.intervalo + "d"}`;
  })();

  // ---- Cards do dossiê: cada um = um KPI clicável + a seção correspondente. A ordem e a
  // visibilidade são personalizáveis (store.ordemDossie/dossieOculta) e ficam SINCRONIZADAS
  // entre os KPIs e as seções, pois ambos saem desta mesma lista. (Sessões é fixa no fim.)
  const aprov = aproveitamento;
  const pqItens = dos.indicacoes.filter((i) => i.pq).sort((a, b) => (b.pqIncidencia || 0) - (a.pqIncidencia || 0));
  const corpoPq = pqItens.length
    ? pqItens
        .map((i) => {
          const acao = i.tipo === "juris" ? "abrir-ind-juris" : "abrir-ind-lei";
          return `<div class="mini-item ind-item"><label><span class="mini-tag pq-tag">${icone("star")} PQ${i.pqIncidencia ? ` ${i.pqIncidencia}` : ""}</span> <button class="lnk mini-link-inline" data-action="${acao}" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Abrir em ${i.tipo === "juris" ? "Jurisprudência" : "Lei Seca"}">${esc(i.referencia)}</button></label></div>`;
        })
        .join("")
    : vazioMini("Nenhum ponto provável (PQ) marcado. Marque artigos/súmulas de alta incidência em Lei Seca / Jurisprudência.");
  const pendTarefas = dos.missoes.filter((m) => !m.concluida);
  const concluidasTarefas = dos.missoes.length - pendTarefas.length;
  const corpoTarefas =
    (pendTarefas.length
      ? pendTarefas.map((m) => `<div class="mini-item"><label><input type="checkbox" data-action="toggle-miss" data-id="${m.id}" /> <button class="lnk mini-link-inline" data-action="abrir-tarefa" data-id="${m.id}" data-tip-pos="cima-esq" data-tip="Abrir no Planejamento">${esc(m.titulo)}</button></label></div>`).join("")
      : vazioMini("Nenhum registro nesta seção. Crie em Planejamento.")) +
    `<div class="mini-nota muted">Só tarefas pendentes aparecem aqui${concluidasTarefas ? ` (${plural(concluidasTarefas, "concluída ocultada", "concluídas ocultadas")})` : ""}.</div>`;

  // Registro de cards (ordem canônica). Cada um: KPI + corpo da seção.
  const CARDS = {
    material: { titulo: "Material", kpi: { val: dos.documentos.length, label: "materiais", tip: "Ver os materiais" }, print: "print-material",
      corpo: dos.documentos.length
        ? dos.documentos.map((d) => { const pg = d.topicoPaginas && d.topicoPaginas[topicoId]; return `<button class="mini-item mini-link" data-action="abrir-doc" data-id="${d.id}" data-tip-pos="cima-esq" data-tip="Abrir em Materiais: ${esc(d.titulo)}"><span class="mini-txt">${esc(d.titulo)}${pg ? ` <span class="mini-tag">págs. ${pg[0]}–${pg[1]}</span>` : ""}</span> ${seloMini(d.selo, d.origem)}</button>`; }).join("")
        : vazioMini("Nenhum registro nesta seção. Importe em Materiais.") },
    resumos: { titulo: "Resumos", kpi: { val: dos.resumos.length, label: "resumos", tip: "Ver os resumos" }, print: "print-resumos",
      corpo: dos.resumos.length
        ? dos.resumos.map((r) => `<button class="mini-item mini-link" data-action="abrir-resumo" data-id="${r.id}" data-tip-pos="cima-esq" data-tip="Abrir em Resumos: ${esc(r.titulo)}"><span class="mini-txt">${esc(r.titulo)}</span> ${r.origem && r.origem.tipo === "ia" ? seloMini("amarelo", r.origem) : ""}</button>`).join("")
        : vazioMini("Nenhum registro nesta seção. Crie em Resumos.") },
    marcacoes: { titulo: "Marcações", kpi: { val: marc.total, label: "marcações", tip: "Ver as marcações (grifos e comentários)" }, print: marc.total ? "print-marcacoes" : "",
      corpo: marcacoesDossieHTML(marc) },
    lei: { titulo: "Lei Seca (memória)", kpi: { val: memLei.length, label: "lei seca", tip: "Ver a lei seca (memória)" }, print: "print-lei",
      corpo: corpoIndicacoes(memLei, "lei") },
    juris: { titulo: "Jurisprudência (memória)", kpi: { val: memJuris.length, label: "jurisprud.", tip: "Ver a jurisprudência (memória)" }, print: "print-juris",
      corpo: corpoIndicacoes(memJuris, "juris") },
    questoes: { titulo: "Questões e desempenho", kpi: { val: dos.questoes.length, label: "questões", tip: "Ver as questões" }, print: "print-questoes",
      corpo: dos.questoes.length
        ? `<div class="mini-resumo">${plural(dos.totalTentativas, "tentativa", "tentativas")} · ${plural(dos.acertos, "acerto", "acertos")}${aprov !== null ? ` · ${aprov}%` : ""}</div>` +
          dos.questoes.map((q) => `<button class="mini-item mini-link" data-action="abrir-questao" data-id="${q.id}" data-tip-pos="cima-esq" data-tip="${esc(q.enunciado)}"><span class="mini-txt">${esc(corta(q.enunciado, 90))}</span> ${seloMini(q.selo, q.fonte)}${q.anulada ? ` <span class="selo selo-manual" data-tip="Questão anulada — fora da prática e da pontuação.">anulada</span>` : ""}</button>`).join("")
        : vazioMini("Nenhum registro nesta seção. Adicione em Questões.") },
    pq: { titulo: "Pontos prováveis (PQ)", kpi: { val: pqItens.length, label: "pontos PQ", tip: "Ver os pontos prováveis (PQ)" }, print: "",
      corpo: corpoPq },
    erros: { titulo: "Caderno de Erros", kpi: { val: meusErros.length, label: "caderno de erros", tip: "Ver o caderno de erros" }, print: "print-erros",
      corpo: meusErros.length
        ? meusErros.map((e) => { const txt = e.manual ? e.descricao : (e.questao ? e.questao.enunciado : ""); return `<button class="mini-item mini-link" data-action="abrir-erro" data-id="${e.id}" data-tip-pos="cima-esq" data-tip="${esc(txt)}"><span class="mini-txt">${esc(corta(txt, 80))}</span>${e.motivoErro ? `<span class="mini-tag">${esc(e.motivoErro)}</span>` : ""}</button>`; }).join("")
        : vazioMini("Nenhum registro nesta seção. Crie em Caderno de Erros.") },
    flashcards: { titulo: "Flashcards", kpi: { val: dos.flashcards.length, label: "flashcards", tip: "Ver os flashcards" }, print: "print-flashcards",
      corpo: dos.flashcards.length
        ? dos.flashcards.map((f) => `<button class="mini-item mini-link" data-action="abrir-flashcard" data-id="${f.id}" data-tip-pos="cima-esq" data-tip="${esc(f.frente)}"><span class="mini-txt">${esc(corta(f.frente, 80))}</span><span class="muted mini-data">${f.sm2 && f.sm2.dueDate ? fmtData(f.sm2.dueDate) : ""}</span></button>`).join("")
        : vazioMini("Nenhum registro nesta seção. Crie em Flashcards.") },
    tarefas: { titulo: "Tarefas", kpi: { val: pendTarefas.length, label: "tarefas", tip: "Ver tarefas pendentes" }, print: "print-tarefas",
      corpo: corpoTarefas },
  };
  const ORDER_KEYS = ["material", "resumos", "marcacoes", "lei", "juris", "questoes", "pq", "erros", "flashcards", "tarefas"];
  const ordemDossie = store.ordemDossie(ORDER_KEYS);
  // "Ocultar" agora RETRAI o conteúdo no lugar (título + funções continuam); não some.
  const retraida = (k) => store.dossieOculta(k);

  // Faixa COMPACTA de stats (no lugar dos ~14 tiles): só o essencial — aproveitamento,
  // questões feitas, tempo e nº de vezes estudado. Cada uma rola até a seção relacionada.
  const vezesTop = st.sessoes.filter((s) => s.topicoId === topicoId);
  const nVezes = vezesTop.length;
  const ultimaData = vezesTop.reduce((m, s) => (s.data > m ? s.data : m), "");
  const apClass = aprov === null ? "z" : aprov < 50 ? "r" : aprov < 75 ? "y" : "g";
  const dstat = (val, label, sec, cls = "") =>
    `<button class="dstat" data-action="ir-secao" data-sec="${sec}"><b class="${cls}">${val}</b><span>${label}</span></button>`;
  const painelHTML = `<div class="dossie-stats">
    ${dstat(dos.totalTentativas || 0, "Questões feitas", "questoes")}
    ${dstat(aprov === null ? "—" : aprov + "%", "Aproveitamento", "questoes", "ds-" + apClass)}
    ${dstat(fmtTempo(dos.tempoSeg), "Tempo estudado", "sessoes")}
    ${dstat(nVezes ? nVezes + "×" : "0", nVezes ? "Estudado · últ. " + fmtData(ultimaData) : "Nunca estudado", "sessoes")}
  </div>`;

  // Só as seções COM conteúdo (ou reveladas) e NÃO escondidas viram cards. As demais ficam
  // dobradas num "Adicionar ao dossiê" — acaba o paredão de "Nenhum registro". "Histórico de
  // sessões" entra no mesmo sistema (chave "sessoes").
  const valDe = (k) => (k === "sessoes" ? dos.sessoes.length : CARDS[k].kpi.val || 0);
  const tituloDe = (k) => (k === "sessoes" ? "Histórico de sessões" : CARDS[k].titulo);
  const TODAS_KEYS = [...ordemDossie, "sessoes"];
  const mostra = (k) => (valDe(k) > 0 || dossieRevelar.has(k)) && !dossieEscondido.has(k);
  const cheias = ordemDossie.filter(mostra);
  const mostraSessoes = mostra("sessoes");
  const escondidas = TODAS_KEYS.filter((k) => !mostra(k));
  const secoesHTML = cheias
    .map((k, idx) => secaoWrap(CARDS[k], k, idx > 0, idx < cheias.length - 1, retraida(k)))
    .join("");
  const addStripHTML = escondidas.length
    ? `<div class="dossie-add"><span class="dossie-add-lbl">Adicionar ao dossiê</span>${escondidas.map((k) => `<button class="dossie-add-chip" data-action="dossie-revelar" data-key="${k}">${icone("plus")} ${tituloDe(k)}</button>`).join("")}</div>`
    : "";

  root.innerHTML = `
    ${header(
      t.nome,
      disc ? disc.nome : "",
      `${botaoImprimir()} <button class="btn btn-ghost btn-sm" data-action="voltar">← Todos os tópicos</button>`
    )}

    <div class="dossie-acoes-topo">
      <button class="chip ${t.concluido ? "on" : ""}" data-action="concluir" data-tip="${t.concluido ? "Tópico concluído — clique para desmarcar." : "Marcar este tópico como concluído (já estudei)."}">${t.concluido ? `${icone("check")} Concluído` : "Concluir"}</button>
      <label class="ed-nivel dossie-rel" data-tip="Relevância: o quanto o tema cai na sua banca. Sincronizada com o Edital.">
        <span class="muted">Relevância:</span>
        ${relPillSelectHTML(t)}
      </label>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" data-action="praticar" data-tip-pos="bottom" data-tip="Abre a tela de Questões já filtrada por este tópico, para treinar.">Praticar</button>
      <button class="btn btn-ghost btn-sm" data-action="estudar" data-tip-pos="bottom-dir" data-tip="Vai para o Hoje, onde você inicia o cronômetro ou registra uma sessão de estudo.">Estudar agora</button>
      <button class="btn btn-ghost btn-sm" data-action="dossie-mapa" data-tip-pos="bottom-dir" data-tip="Gera um mapa mental deste tópico (IA, a partir dos materiais e resumos vinculados).">Mapa mental</button>
    </div>

    ${
      aliasAberto
        ? `<div class="card alias-editor">
            <div class="muted small u-mb-8">${icone("tag")} <b>Também conhecido como</b> — nomes alternativos deste tópico (separados por vírgula). Servem para <b>casar</b> com o edital, as provas e a relevância quando o nome usado lá é diferente do seu.</div>
            <div class="form-row" style="gap:8px">
              <input id="alias-input" type="text" value="${esc((t.aliases || []).join(", "))}" placeholder="Ex.: Atos da administração, Ato administrativo" class="u-grow" />
              <button class="btn btn-primary btn-sm" data-action="alias-salvar">Salvar</button>
              <button class="btn btn-ghost btn-sm" data-action="alias-toggle">Fechar</button>
            </div>
          </div>`
        : ""
    }

    <p class="muted small dossie-ajuda">Pasta viva do tópico: tudo o que você reuniu sobre o assunto. <b>Clique em qualquer item</b> para abri-lo; a <b>relevância</b> fica sincronizada com o Edital.</p>

    ${(() => {
      const maps = st.mapasMentais.filter((m) => m.topicoId === topicoId);
      if (!maps.length) return "";
      return `<div class="card dossie-mapas"><div class="muted small u-mb-8"><b>Mapas mentais</b></div><div class="aula-tops">${maps.map((m) => `<button class="mini-item mini-link" data-action="abrir-mapa" data-id="${m.id}" data-tip="Abrir mapa mental"><span class="mini-txt">${esc(m.titulo)}</span></button>`).join("")}</div></div>`;
    })()}

    ${painelHTML}

    <div class="dossie-secoes">
      ${secoesHTML}
    </div>

    ${mostraSessoes ? sessoesSecaoHTML(st, dos, store.dossieOculta("sessoes")) : ""}

    ${addStripHTML}`;

  bindActions(root, {
    "dossie-mapa": () => gerarEAbrirMapa(store, app, () => store.gerarMapaMentalDeTopico(topicoId)),
    "abrir-mapa": (el) => { const m = store.get().mapasMentais.find((x) => x.id === el.getAttribute("data-id")); if (m) abrirMapaCompleto(store, app, m); },
    imprimir: async () => {
      // Impressão SELETIVA: o usuário escolhe as seções; cada uma sai INTEGRAL (sem recolher).
      // Só oferece seções COM conteúdo (as vazias sairiam como "—" no papel).
      const secoes = secoesDossieImprimir(st, dos, meusErros, marc).filter((s) => !s.vazia);
      if (!secoes.length) return toast("Este tópico ainda não tem conteúdo para imprimir.", "erro");
      const sel = await escolherSecoesImpressao(secoes);
      if (!sel) return;
      if (!sel.length) return toast("Selecione ao menos uma seção.", "erro");
      imprimir(`Dossiê — ${t.nome}`, printDossieSelecionado(st, dos, secoes, sel));
    },
    voltar: () => onVoltar && onVoltar(),
    concluir: () => store.toggleTopicoConcluido(topicoId),
    "alias-toggle": () => {
      aliasAberto = !aliasAberto;
      app.refresh();
    },
    "alias-salvar": () => {
      const v = root.querySelector("#alias-input")?.value || "";
      store.setAliasesTopico(topicoId, v.split(",").map((s) => s.trim()).filter(Boolean));
      aliasAberto = false;
      toast("Sinônimos salvos.");
    },
    praticar: () => app.navigate("pratica", { topicoId }),
    estudar: () => app.navigate("hoje"),
    "ir-secao": (el) => {
      const sec = el.getAttribute("data-sec");
      // Se a seção está dobrada (esperando em "Adicionar ao dossiê"), revela antes de rolar.
      if (!root.querySelector(`.dossie-secao[data-sec="${sec}"]`)) {
        dossieRevelar.add(sec);
        dossieEscondido.delete(sec);
        app.refresh();
      }
      const alvo = root.querySelector(`.dossie-secao[data-sec="${sec}"]`);
      if (alvo) {
        alvo.scrollIntoView({ behavior: "smooth", block: "start" });
        alvo.classList.add("item-foco");
        setTimeout(() => alvo.classList.remove("item-foco"), 2200);
      }
    },
    "dossie-subir": (el) => store.moverDossieSecao(el.getAttribute("data-key"), "cima", ORDER_KEYS),
    "dossie-descer": (el) => store.moverDossieSecao(el.getAttribute("data-key"), "baixo", ORDER_KEYS),
    "dossie-ocultar": (el) => store.toggleDossieOculta(el.getAttribute("data-key")),
    "dossie-revelar": (el) => { const k = el.getAttribute("data-key"); dossieRevelar.add(k); dossieEscondido.delete(k); app.refresh(); },
    "dossie-remover": (el) => { const k = el.getAttribute("data-key"); dossieEscondido.add(k); dossieRevelar.delete(k); app.refresh(); },
    "abrir-sessao": (el) => app.navigate("diagnostico", { focoSessaoId: el.getAttribute("data-id") }),
    "abrir-doc": (el) => app.navigate("documentos", { focoDocId: el.getAttribute("data-id") }),
    "abrir-questao": (el) => {
      const id = el.getAttribute("data-id");
      const q = st.questoes.find((x) => x.id === id);
      app.navigate(q && q.formato === "ce" ? "pratica-ce" : "pratica", { focoQuestaoId: id });
    },
    "abrir-erro": (el) => app.navigate("erros", { focoErroId: el.getAttribute("data-id") }),
    "abrir-flashcard": (el) => app.navigate("flashcards", { focoFlashcardId: el.getAttribute("data-id") }),
    "abrir-resumo": (el) => app.navigate("resumos", { focoResumoId: el.getAttribute("data-id") }),
    "abrir-marcacao": (el) => {
      const tipo = el.getAttribute("data-tipo");
      const id = el.getAttribute("data-id");
      const fonte = el.getAttribute("data-fonte");
      if (tipo === "documento") app.navigate("documentos", { focoDocId: id, marcarId: id });
      else if (tipo === "resumo") app.navigate("resumos", { focoResumoId: id, marcarId: id });
      else app.navigate(fonte === "Jurisprudência" ? "jurisprudencia" : "leiseca", { focoIndicacaoId: id, marcarId: id });
    },
    "ir-revtopico": () => app.navigate("revtopico"),
    "abrir-ind-lei": (el) => app.navigate("leiseca", { focoIndicacaoId: el.getAttribute("data-id") }),
    "abrir-ind-juris": (el) => app.navigate("jurisprudencia", { focoIndicacaoId: el.getAttribute("data-id") }),
    "abrir-tarefa": (el) => app.navigate("planejamento", { focoMissaoId: el.getAttribute("data-id") }),
    "add-ind-lei": () => addIndicacaoDossie(root, store, topicoId, "lei"),
    "add-ind-juris": () => addIndicacaoDossie(root, store, topicoId, "juris"),
    "del-ind": (el) => store.removerIndicacao(el.getAttribute("data-id")),
    // Impressão POR SEÇÃO (cada uma imprime só o seu conteúdo).
    "print-material": () => imprimir(`Material — ${t.nome}`, printSecLista(dos.documentos, (d) => esc(d.titulo))),
    "print-resumos": () => imprimir(`Resumos — ${t.nome}`, dos.resumos.map((r) => `<h2>${esc(r.titulo)}</h2><div>${r.conteudoHTML || ""}</div>`).join("")),
    "print-marcacoes": () => imprimir(`Marcações — ${t.nome}`, marcacoesDossieHTML(marc, true)),
    "print-erros": () => imprimir(`Caderno de Erros — ${t.nome}`, printSecLista(meusErros, (e) => {
      const txt = e.manual ? e.descricao : e.questao ? e.questao.enunciado : "";
      return `${esc(txt)}${e.motivoErro ? ` <i>(${esc(e.motivoErro)})</i>` : ""}`;
    })),
    "print-lei": () => imprimir(`Lei Seca (memória) — ${t.nome}`, printSecLista(memLei, (i) => esc(i.referencia))),
    "print-juris": () => imprimir(`Jurisprudência (memória) — ${t.nome}`, printSecLista(memJuris, (i) => esc(i.referencia))),
    "print-tarefas": () => imprimir(`Tarefas pendentes — ${t.nome}`, printSecLista(dos.missoes.filter((m) => !m.concluida), (m) => esc(m.titulo))),
    "print-sessoes": () => imprimir(`Sessões — ${t.nome}`, printSecSessoes(st, dos.sessoes)),
    "print-questoes": async () => {
      const v = await escolher("Imprimir questões:", [
        { label: "Sem o gabarito", value: "sem", cls: "btn-primary" },
        { label: "Com o gabarito", value: "com" },
      ]);
      if (v) imprimir(`Questões — ${t.nome}`, printSecQuestoes(dos.questoes, v === "com"));
    },
    "print-flashcards": async () => {
      const v = await escolher("Imprimir flashcards:", [
        { label: "Só a frente", value: "sem", cls: "btn-primary" },
        { label: "Frente e verso", value: "com" },
      ]);
      if (v) imprimir(`Flashcards — ${t.nome}`, printSecFlashcards(dos.flashcards, v === "com"));
    },
    "sort-sess": (el) => {
      const col = el.getAttribute("data-col");
      if (sessSort.col === col) sessSort.dir = sessSort.dir === "asc" ? "desc" : "asc";
      else sessSort = { col, dir: col === "data" ? "desc" : "asc" };
      app.refresh();
    },
    "edit-sess": (el) => {
      sessEditId = el.getAttribute("data-id");
      app.refresh();
    },
    "cancelar-sess": () => {
      sessEditId = null;
      app.refresh();
    },
    "salvar-sess": (el) => {
      const id = el.getAttribute("data-id");
      const min = parseInt(root.querySelector(`.se-min[data-id="${id}"]`).value, 10) || 0;
      const certas = parseInt(root.querySelector(`.se-ac[data-id="${id}"]`).value, 10) || 0;
      const total = parseInt(root.querySelector(`.se-tot[data-id="${id}"]`).value, 10) || 0;
      store.editarSessao(id, {
        data: root.querySelector(`.se-data[data-id="${id}"]`).value,
        fase: root.querySelector(`.se-fase[data-id="${id}"]`).value,
        tempoSeg: min * 60,
        qAcertos: Math.min(certas, total),
        qErros: Math.max(0, total - certas),
        comentario: root.querySelector(`.se-obs[data-id="${id}"]`).value,
        missaoId: root.querySelector(`.se-missao[data-id="${id}"]`).value || null,
      });
      sessEditId = null;
      toast("Sessão atualizada.");
    },
    "del-sess": async (el) => {
      if (await confirmar("Apagar esta sessão? O tempo e as questões dela deixam de contar.")) {
        store.removerSessao(el.getAttribute("data-id"));
        toast("Sessão apagada.");
      }
    },
  });

  root.querySelector("#sess-fase")?.addEventListener("change", (e) => {
    sessFiltroFase = e.target.value;
    app.refresh();
  });

  // Relevância: sincronizada com o Edital (mesmo store.setRelevancia).
  root.querySelector("select[data-nivel-named]")?.addEventListener("change", (e) => {
    aplicarRelNamed(store, topicoId, e.target.value);
    app.refresh();
  });
  root.querySelectorAll('[data-action="toggle-ind"]').forEach((el) =>
    el.addEventListener("change", () => store.toggleIndicacaoLida(el.getAttribute("data-id")))
  );
  root.querySelectorAll('[data-action="toggle-miss"]').forEach((el) =>
    el.addEventListener("change", () => store.toggleMissao(el.getAttribute("data-id")))
  );
  // Arrastar-para-reordenar as seções do dossiê.
  ligarArrastar(root.querySelector(".dossie-secoes"), ".dossie-secao[data-drag-id]", (dragKey, alvoKey) => {
    store.reordenarDossieSecao(dragKey, alvoKey, ORDER_KEYS);
    app.refresh();
  });

  // Blocos altos do dossiê: recolhe à altura padrão com "ver mais/menos" na tela.
  // (A impressão usa printDossieSelecionado e ignora isso: conteúdo sempre integral.)
  ativarRecolhiveis(root);
}

// Recolhe os corpos de seção muito altos a uma altura padrão, com botão "ver mais/menos".
// Medição após render (scrollHeight); estado é só visual (não persiste entre re-renders).
function ativarRecolhiveis(root) {
  const LIMITE = 300; // altura padrão (px) exibida quando recolhido
  root.querySelectorAll(".dossie-secao-corpo").forEach((corpo) => {
    if (corpo.scrollHeight <= LIMITE + 48) return; // já cabe: não recolhe
    corpo.classList.add("corpo-recolhivel");
    const btn = document.createElement("button");
    btn.className = "lnk dossie-vermais";
    btn.innerHTML = `ver mais ${icone("chevron-down")}`;
    btn.addEventListener("click", () => {
      const exp = corpo.classList.toggle("corpo-expandido");
      btn.innerHTML = exp ? `ver menos ${icone("chevron-up")}` : `ver mais ${icone("chevron-down")}`;
    });
    corpo.insertAdjacentElement("afterend", btn);
  });
}

// Corpo da seção de MEMÓRIA (lei OU jurisprudência): trechos gravados para relembrar.
function corpoIndicacoes(itens, tipo) {
  const acao = tipo === "juris" ? "abrir-ind-juris" : "abrir-ind-lei";
  const addAcao = tipo === "juris" ? "add-ind-juris" : "add-ind-lei";
  const telaNome = tipo === "juris" ? "Jurisprudência" : "Lei Seca";
  const ph = tipo === "juris" ? "Ex.: Súmula 473 STF" : "Ex.: art. 37, caput, CF";
  return `
    <div class="form-inline-mini">
      <input id="ind-${tipo}-ref" type="text" placeholder="${ph}" />
      <button class="btn btn-ghost btn-sm" data-action="${addAcao}">Gravar na memória</button>
    </div>
    ${
      itens.length
        ? itens
            .map((i) => {
              const venc = i.revisao && i.revisao.proxima;
              const status = `<span class="mini-tag">${icone("brain")}</span>${i.pq ? `<span class="mini-tag pq-tag">${icone("star")} PQ</span>` : ""}${venc ? `<span class="muted mini-data">${icone("bell")} ${fmtData(i.revisao.proxima)}</span>` : ""}`;
              return `
            <div class="mini-item ind-item">
              <label>${status} <button class="lnk mini-link-inline" data-action="${acao}" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Abrir em ${telaNome} (memória) para revisar/agendar">${esc(i.referencia)}</button></label>
              <button class="lnk lnk-danger" data-action="del-ind" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Remover da memória.">${icone("x")}</button>
            </div>`;
            })
            .join("")
        : vazioMini(`Nenhum registro nesta seção. Grave em ${telaNome}.`)
    }`;
}

// Envolve um card como uma SEÇÃO: cabeçalho (título + controles) e o corpo. Quando RETRAÍDA,
// só o cabeçalho fica (o título e as funções permanecem no lugar); o retrai/expande.
function secaoWrap(card, key, podeSubir, podeDescer, retraida) {
  const printItem = card.print ? `<button class="menu-item" data-action="${card.print}"><span class="menu-ico">${icone("printer")}</span> Imprimir seção</button>` : "";
  return `<section class="dossie-secao ${retraida ? "dossie-retraida" : ""}" data-sec="${key}" data-drag-id="${key}">
    <div class="dossie-secao-head">
      <span class="drag-grip" data-tip="Arraste para reordenar" aria-hidden="true">${icone("grip-vertical")}</span>
      <button class="dossie-sec-chev" data-action="dossie-ocultar" data-key="${key}" data-tip-pos="cima-dir" data-tip="${retraida ? "Mostrar o conteúdo desta seção" : "Retrair: deixa só o título"}">${icone("chevron-down")}</button>
      <h4>${card.titulo}</h4>
      <span class="spacer"></span>
      <details class="doc-mais dossie-sec-mais">
        <summary class="ed-top-mais-sum" data-tip-pos="cima-dir" data-tip="Mais ações desta seção.">${icone("ellipsis")}</summary>
        <div class="doc-mais-pop" role="menu">
          <button class="menu-item" data-action="dossie-subir" data-key="${key}" ${podeSubir ? "" : "disabled"}><span class="menu-ico">${icone("arrow-up")}</span> Subir</button>
          <button class="menu-item" data-action="dossie-descer" data-key="${key}" ${podeDescer ? "" : "disabled"}><span class="menu-ico">${icone("arrow-down")}</span> Descer</button>
          ${printItem}
          <div class="menu-sep"></div>
          <button class="menu-item" data-action="dossie-remover" data-key="${key}"><span class="menu-ico">${icone("minus")}</span> Ocultar seção</button>
        </div>
      </details>
    </div>
    ${retraida ? "" : `<div class="dossie-secao-corpo">${card.corpo}</div>`}
  </section>`;
}

function addIndicacaoDossie(root, store, topicoId, tipo) {
  const input = root.querySelector(`#ind-${tipo}-ref`);
  const ref = input ? input.value.trim() : "";
  if (!ref) return toast("Informe a referência (artigo/súmula).", "erro");
  store.addIndicacao({ topicoId, tipo, modo: "memoria", referencia: ref });
  toast("Gravado na memória.");
}

// ---- Construtores de impressão POR SEÇÃO ----
function printSecLista(arr, fn) {
  return arr.length ? `<ul>${arr.map((x) => `<li>${fn(x)}</li>`).join("")}</ul>` : "<p>—</p>";
}
function letraAlt(i) {
  return String.fromCharCode(65 + i); // A, B, C...
}
function printSecQuestoes(questoes, comGabarito) {
  if (!questoes.length) return "<p>Nada para imprimir.</p>";
  return questoes
    .map((q, n) => {
      let corpo;
      if (q.formato === "ce") {
        corpo = `<div>( ) Certo ( ) Errado${comGabarito ? ` <b>(gabarito: ${q.gabarito === 0 ? "Certo" : "Errado"})</b>` : ""}</div>${comGabarito && q.justificativa ? `<div class="print-meta">${esc(q.justificativa)}</div>` : ""}`;
      } else {
        corpo = `<div>${(q.alternativas || [])
          .map((a, i) => `${letraAlt(i)}) ${esc(a)}${comGabarito && i === q.gabarito ? " <b>(gabarito)</b>" : ""}`)
          .join("<br>")}</div>`;
      }
      return `<div class="print-q"><p><b>${n + 1}.</b> ${esc(q.enunciado)}</p>${corpo}</div>`;
    })
    .join("");
}
function printSecFlashcards(flashcards, comVerso) {
  if (!flashcards.length) return "<p>Nada para imprimir.</p>";
  return `<ul>${flashcards
    .map((f) => `<li><b>${esc(f.frente)}</b>${comVerso ? `<br>${esc(f.verso)}` : ""}</li>`)
    .join("")}</ul>`;
}
function printSecSessoes(st, sessoes) {
  if (!sessoes.length) return "<p>Nenhuma sessão.</p>";
  const ordenadas = [...sessoes].sort((a, b) => (a.data < b.data ? 1 : -1));
  return `<table class="tabela"><thead><tr><th>Data</th><th>Fase</th><th>Tempo</th><th>Páginas</th><th>Questões</th><th>Observação</th></tr></thead><tbody>${ordenadas
    .map((s) => {
      const fi = FASES[s.fase];
      const tq = (s.qAcertos || 0) + (s.qErros || 0);
      const q = tq ? `${s.qAcertos}/${tq}` : "—";
      const pag = s.paginaInicial && s.paginaFinal ? `${s.paginaInicial}–${s.paginaFinal}` : s.paginas || "—";
      return `<tr><td>${fmtData(s.data)}</td><td>${fi ? esc(fi.nome) : esc(s.fase)}</td><td>${fmtTempo(s.tempoSeg)}</td><td>${pag}</td><td>${q}</td><td>${esc(s.comentario || "—")}</td></tr>`;
    })
    .join("")}</tbody></table>`;
}

// Seções disponíveis para a impressão do dossiê (ordem da tela). Cada uma é INTEGRAL.
function secoesDossieImprimir(st, dos, meusErros, marc) {
  const lista = (arr, fn) => (arr.length ? `<ul>${arr.map(fn).join("")}</ul>` : "<p>—</p>");
  const memLei = dos.indicacoes.filter((i) => i.tipo === "lei" && i.modo === "memoria");
  const memJuris = dos.indicacoes.filter((i) => i.tipo === "juris" && i.modo === "memoria");
  const pq = dos.indicacoes.filter((i) => i.pq).sort((a, b) => (b.pqIncidencia || 0) - (a.pqIncidencia || 0));
  const pendentes = dos.missoes.filter((m) => !m.concluida);
  // `vazia` marca as seções sem conteúdo neste tópico → a impressão as omite do seletor
  // (antes oferecia todas marcadas, imprimindo cabeçalhos com "—").
  return [
    { key: "material", titulo: "Material", vazia: !dos.documentos.length, html: lista(dos.documentos, (d) => `<li>${esc(d.titulo)}</li>`) },
    { key: "resumos", titulo: "Resumos", vazia: !dos.resumos.length, html: lista(dos.resumos, (r) => `<li>${esc(r.titulo)}</li>`) },
    { key: "marcacoes", titulo: "Marcações", vazia: !marc.total, html: marcacoesDossieHTML(marc, true) },
    { key: "pq", titulo: "Pontos prováveis (PQ)", vazia: !pq.length, html: lista(pq, (i) => `<li>${esc(i.referencia)}${i.pqIncidencia ? ` (${i.pqIncidencia})` : ""}</li>`) },
    { key: "lei", titulo: "Lei Seca (memória)", vazia: !memLei.length, html: lista(memLei, (i) => `<li>${esc(i.referencia)}</li>`) },
    { key: "juris", titulo: "Jurisprudência (memória)", vazia: !memJuris.length, html: lista(memJuris, (i) => `<li>${esc(i.referencia)}</li>`) },
    { key: "questoes", titulo: "Questões", vazia: !dos.questoes.length, html: lista(dos.questoes, (q) => `<li>${esc(q.enunciado)}</li>`) },
    {
      key: "erros",
      titulo: "Caderno de Erros",
      vazia: !meusErros.length,
      html: lista(meusErros, (e) => {
        const txt = e.manual ? e.descricao : e.questao ? e.questao.enunciado : "";
        return `<li>${esc((txt || "").slice(0, 90))}${e.motivoErro ? ` (${esc(e.motivoErro)})` : ""}</li>`;
      }),
    },
    { key: "flashcards", titulo: "Flashcards", vazia: !dos.flashcards.length, html: lista(dos.flashcards, (f) => `<li><b>${esc(f.frente)}</b><br>${esc(f.verso)}</li>`) },
    { key: "tarefas", titulo: "Tarefas pendentes", vazia: !pendentes.length, html: lista(pendentes, (m) => `<li>${esc(m.titulo)}</li>`) },
    { key: "sessoes", titulo: "Sessões", vazia: !dos.sessoes.length, html: printSecSessoes(st, dos.sessoes) },
  ];
}
// Monta o HTML de impressão só com as seções selecionadas (sempre integrais), com o cabeçalho.
function printDossieSelecionado(st, dos, secoes, sel) {
  const t = dos.topico;
  const disc = st.disciplinas.find((d) => d.id === t.disciplinaId);
  const aproveitamento = dos.totalTentativas ? pct(dos.acertos, dos.totalTentativas) : null;
  const meta = `<p class="print-meta">${disc ? esc(disc.nome) : ""} · ${dos.documentos.length} materiais · ${dos.questoes.length} questões · ${aproveitamento === null ? "—" : aproveitamento + "%"} aproveitamento · ${dos.flashcards.length} flashcards · ${fmtTempo(dos.tempoSeg)}</p>`;
  const corpo = secoes
    .filter((s) => sel.includes(s.key))
    .map((s) => `<h2>${esc(s.titulo)}</h2>${s.html}`)
    .join("");
  return meta + corpo;
}
// Modal de seleção das seções a imprimir. Resolve com a lista de keys, ou null se cancelar.
function escolherSecoesImpressao(secoes) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-msg">Quais seções incluir na impressão?</p>
        <div class="print-sel-lista">
          ${secoes.map((s) => `<label class="print-sel-item"><input type="checkbox" value="${s.key}" checked /> ${esc(s.titulo)}</label>`).join("")}
        </div>
        <div class="print-sel-marcar">
          <button class="lnk" data-s="todas">marcar todas</button> ·
          <button class="lnk" data-s="nenhuma">desmarcar todas</button>
        </div>
        <div class="modal-acoes">
          <button class="btn btn-ghost" data-c="cancel">Cancelar</button>
          <button class="btn btn-primary" data-c="ok">Imprimir selecionadas</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const chks = () => [...ov.querySelectorAll('input[type="checkbox"]')];
    ov.addEventListener("click", (e) => {
      const s = e.target.closest("[data-s]");
      if (s) {
        chks().forEach((c) => (c.checked = s.getAttribute("data-s") === "todas"));
        return;
      }
      const b = e.target.closest("[data-c]");
      if (!b && e.target !== ov) return;
      const ok = b && b.getAttribute("data-c") === "ok";
      const sel = ok ? chks().filter((c) => c.checked).map((c) => c.value) : null;
      ov.remove();
      resolve(sel);
    });
  });
}

// ---- Sessões do tópico (espelha o Acompanhamento; sem coluna de tópico/disciplina) ----
function ordenarSessoesDossie(lista) {
  const dir = sessSort.dir === "asc" ? 1 : -1;
  const chaves = {
    data: (s) => s.data,
    fase: (s) => ORDEM_FASES.indexOf(s.fase),
    tempo: (s) => s.tempoSeg || 0,
    questoes: (s) => {
      const tq = (s.qAcertos || 0) + (s.qErros || 0);
      return tq ? (s.qAcertos || 0) / tq : -1;
    },
  };
  const key = chaves[sessSort.col] || chaves.data;
  return [...lista].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const cmp = typeof ka === "string" ? ka.localeCompare(kb, "pt-BR") : ka - kb;
    return cmp * dir;
  });
}
function thSess(col, label, extra = "") {
  const ativo = sessSort.col === col;
  const cls = `sortavel${extra}${ativo ? " ativo " + sessSort.dir : ""}`;
  return `<th class="${cls}" data-action="sort-sess" data-col="${col}" data-tip="Ordenar por ${label.toLowerCase()}">
    <span class="th-in"><span>${label}</span><span class="sort-ar"><b class="up">${icone("chevron-up")}</b><b class="down">${icone("chevron-down")}</b></span></span>
  </th>`;
}
function sessoesSecaoHTML(st, dos, retraida) {
  let sessoes = dos.sessoes;
  if (sessFiltroFase) sessoes = sessoes.filter((s) => s.fase === sessFiltroFase);
  sessoes = ordenarSessoesDossie(sessoes);
  const total = dos.sessoes.length;
  const corpo = !total
    ? vazioMini("Nenhum registro nesta seção. Registre no Hoje.")
    : `
      <table class="tabela tabela-sessoes">
        <thead><tr>
          ${thSess("data", "Data")}
          ${thSess("fase", "Fase")}
          ${thSess("tempo", "Tempo", " num")}
          <th class="num">Páginas</th>
          ${thSess("questoes", "Questões", " num")}
          <th>Observação</th>
          <th class="th-acoes"></th>
        </tr></thead>
        <tbody>${sessoes.map((s) => linhaSessaoDossie(st, s)).join("")}</tbody>
      </table>`;
  const contagem = total ? ` <span class="muted small">(${sessoes.length}${sessFiltroFase ? ` de ${total}` : ""})</span>` : "";
  const faseSel = total
    ? `<label class="inline small sess-fase-sel">Fase
        <select id="sess-fase">
          <option value="">Todas</option>
          ${ORDEM_FASES.map((f) => `<option value="${f}" ${sessFiltroFase === f ? "selected" : ""}>${FASES[f].nome}</option>`).join("")}
        </select>
      </label>`
    : "";
  const printBtn = `<button class="lnk dossie-print" data-action="print-sessoes" data-tip-pos="cima-dir" data-tip="Imprimir esta seção">${iconImprimir}</button>`;
  return `<section class="dossie-secao dossie-sessoes ${retraida ? "dossie-retraida" : ""}" data-sec="sessoes">
    <div class="dossie-secao-head">
      <button class="dossie-sec-chev" data-action="dossie-ocultar" data-key="sessoes" data-tip-pos="cima-dir" data-tip="${retraida ? "Mostrar o conteúdo desta seção" : "Retrair: deixa só o título"}">${icone("chevron-down")}</button>
      <h4>Histórico de sessões${contagem}</h4>
      <span class="spacer"></span>
      ${retraida ? "" : faseSel}
      <details class="doc-mais dossie-sec-mais">
        <summary class="ed-top-mais-sum" data-tip-pos="cima-dir" data-tip="Mais ações desta seção.">${icone("ellipsis")}</summary>
        <div class="doc-mais-pop" role="menu">
          <button class="menu-item" data-action="print-sessoes"><span class="menu-ico">${icone("printer")}</span> Imprimir seção</button>
          <div class="menu-sep"></div>
          <button class="menu-item" data-action="dossie-remover" data-key="sessoes"><span class="menu-ico">${icone("minus")}</span> Ocultar seção</button>
        </div>
      </details>
    </div>
    ${retraida ? "" : `<div class="dossie-secao-corpo">${corpo}</div>`}</section>`;
}
// Opções de tarefa para vincular a uma sessão: pendentes + a já vinculada (mesmo concluída).
function opcoesMissaoSessao(st, sel) {
  const lista = st.missoes.filter((m) => !m.concluida || m.id === sel);
  return (
    `<option value="">— nenhuma —</option>` +
    lista
      .map((m) => {
        const t = m.topicoId ? st.topicos.find((x) => x.id === m.topicoId) : null;
        const disc = t ? st.disciplinas.find((d) => d.id === t.disciplinaId) : null;
        const rot = (disc ? disc.nome + " · " : "") + m.titulo + (m.concluida ? " (concluída)" : "");
        return `<option value="${m.id}" ${m.id === sel ? "selected" : ""}>${esc(rot)}</option>`;
      })
      .join("")
  );
}
function linhaSessaoDossie(st, s) {
  const traco = `<span class="cel-vazia">–</span>`;
  const tq = (s.qAcertos || 0) + (s.qErros || 0);
  const q = tq ? `${s.qAcertos}/${tq} (${Math.round((s.qAcertos / tq) * 100)}%)` : traco;
  const fi = FASES[s.fase];
  const cor = fi ? fi.cor : "var(--muted)";
  const pagTd = s.paginaInicial && s.paginaFinal ? `${s.paginaInicial}–${s.paginaFinal} (${s.paginas})` : s.paginas ? `${s.paginas}` : traco;
  const obsTd = s.comentario
    ? `<span class="sess-obs" data-tip="${esc(s.comentario)}">${icone("message-square")} ${esc(s.comentario.length > 40 ? s.comentario.slice(0, 40) + "…" : s.comentario)}</span>`
    : traco;
  const linha = `<tr class="sess-row" style="--cor:${cor}">
    <td><button class="lnk" data-action="abrir-sessao" data-id="${s.id}" data-tip="Abrir no Acompanhamento">${fmtData(s.data)}</button></td>
    <td>${fi ? esc(fi.nome) : esc(s.fase)}</td>
    <td class="num">${fmtTempo(s.tempoSeg)}</td>
    <td class="num">${pagTd}</td>
    <td class="num">${q}</td>
    <td>${obsTd}</td>
    <td class="sess-acoes">
      <button class="mover-btn" data-action="edit-sess" data-id="${s.id}" data-tip-pos="cima-dir" data-tip="Editar sessão">${icone("square-pen")}</button>
      <button class="mover-btn mover-del" data-action="del-sess" data-id="${s.id}" data-tip-pos="cima-dir" data-tip="Remover sessão">${icone("x")}</button>
    </td>
  </tr>`;
  if (sessEditId !== s.id) return linha;
  const faseOpts = ORDEM_FASES.map((f) => `<option value="${f}" ${f === s.fase ? "selected" : ""}>${FASES[f].nome}</option>`).join("");
  const form = `<tr class="sess-edit-row"><td colspan="7">
    <div class="sess-edit">
      <label class="inline">Data <input type="date" class="se-data" data-id="${s.id}" value="${s.data.slice(0, 10)}" /></label>
      <label class="inline">Fase <select class="se-fase" data-id="${s.id}">${faseOpts}</select></label>
      <label class="inline">Minutos <input type="number" min="0" max="1440" class="se-min" data-id="${s.id}" value="${Math.round((s.tempoSeg || 0) / 60)}" /></label>
      <label class="inline">Certas <input type="number" min="0" max="9999" class="se-ac" data-id="${s.id}" value="${s.qAcertos || 0}" /></label>
      <label class="inline">Total <input type="number" min="0" max="9999" class="se-tot" data-id="${s.id}" value="${tq}" /></label>
      <label class="inline">Observação <input type="text" class="se-obs" data-id="${s.id}" value="${esc(s.comentario || "")}" /></label>
      <label class="inline">Tarefa <select class="se-missao" data-id="${s.id}">${opcoesMissaoSessao(st, s.missaoId)}</select></label>
      <button class="btn btn-ghost btn-sm" data-action="cancelar-sess" data-id="${s.id}">Cancelar</button>
      <button class="btn btn-primary btn-sm" data-action="salvar-sess" data-id="${s.id}">Salvar</button>
    </div>
  </td></tr>`;
  return linha + form;
}

function secao(titulo, conteudo, sec = "", printAcao = "") {
  return `<section class="dossie-secao"${sec ? ` data-sec="${sec}"` : ""}>
    <div class="dossie-secao-head"><h4>${titulo}</h4>${printAcao ? `<button class="lnk dossie-print" data-action="${printAcao}" data-tip-pos="cima-dir" data-tip="Imprimir esta seção">${iconImprimir}</button>` : ""}</div>
    <div class="dossie-secao-corpo">${conteudo}</div></section>`;
}

// Conteúdo da seção "Marcações" do dossiê: grifos agrupados por cor + comentários,
// cada item com a fonte (Lei Seca / Jurisprudência / Resumo / Material). `print`=versão simples.
const MK_ROTULOS = {
  amarelo: { nome: "palavras-chave" },
  azul: { nome: "prazos e valores" },
  vermelho: { nome: "restritivas" },
  verde: { nome: "marcações livres" },
  roxo: { nome: "marcações livres" },
  laranja: { nome: "marcações livres" },
};
function marcacoesDossieHTML(marc, print = false) {
  if (!marc.total) {
    return print ? "<p>Nenhuma marcação neste tópico.</p>" : vazioMini("Nenhuma marcação ainda. Grife em Lei Seca, Jurisprudência, Resumos ou Material.");
  }
  const ordem = ["amarelo", "azul", "vermelho", "verde", "roxo", "laranja"];
  // Botão clicável → abre a fonte (Lei Seca/Juris/Resumo/Material) com a marcação aberta.
  const abre = (i) => `data-action="abrir-marcacao" data-tipo="${i.alvoTipo}" data-id="${i.alvoId}" data-fonte="${esc(i.fonte.tipo)}" data-tip-pos="cima-esq" data-tip="Abrir em ${esc(i.fonte.tipo)}: ${esc(i.fonte.titulo)}"`;
  let html = "";
  for (const cor of ordem) {
    const itens = marc.porCor[cor];
    if (!itens || !itens.length) continue;
    const r = MK_ROTULOS[cor];
    html += print
      ? `<h3><i class="mk-dot mk-${cor}"></i> ${r.nome}</h3><ul>${itens.map((i) => `<li>${esc(i.texto)} <i>(${esc(i.fonte.tipo)}: ${esc(i.fonte.titulo)})</i></li>`).join("")}</ul>`
      : `<div class="mk-dossie-grupo">
          <div class="mk-dossie-cor"><i class="mk-dot mk-${cor}"></i>${r.nome} <span class="muted small">(${itens.length})</span></div>
          ${itens.map((i) => `<button class="mk-dossie-item mk-dossie-link mk-${cor}-borda" ${abre(i)}><span class="mk-dossie-txt">${esc(i.texto)}</span><span class="mk-dossie-fonte muted small">${esc(i.fonte.tipo)} · ${esc(i.fonte.titulo)} ›</span></button>`).join("")}
        </div>`;
  }
  if (marc.comentarios.length) {
    html += print
      ? `<h3>${icone("message-square")} comentários</h3>${marc.comentarios.map((c) => `<div><i>“${esc(c.texto)}”</i>${c.nota ? `<br>${esc(c.nota)}` : ""} <span>(${esc(c.fonte.tipo)}: ${esc(c.fonte.titulo)})</span></div>`).join("")}`
      : `<div class="mk-dossie-grupo">
          <div class="mk-dossie-cor">${icone("message-square")} comentários <span class="muted small">(${marc.comentarios.length})</span></div>
          ${marc.comentarios.map((c) => `<button class="mk-dossie-item mk-dossie-link mk-coment-borda" ${abre(c)}><div class="mk-dossie-trecho">“${esc(c.texto)}”</div>${c.nota ? `<div class="mk-dossie-nota">${esc(c.nota)}</div>` : ""}<span class="mk-dossie-fonte muted small">${esc(c.fonte.tipo)} · ${esc(c.fonte.titulo)} ›</span></button>`).join("")}
        </div>`;
  }
  return html;
}
function vazioMini(msg) {
  return `<div class="mini-vazio muted">${esc(msg)}</div>`;
}

// ===== Dossiê da DISCIPLINA (mini-dashboard, Item 2 do plano visual) =====
// Nível intermediário entre o Edital/Acompanhamento (geral) e a pasta viva do tópico:
// KPIs da disciplina, desempenho por tópico em semáforo (JUSTO: sem questões = neutro),
// histórico recente e a análise do Mentor sob demanda ("✨ Explicar meu desempenho").
import { revelarTexto } from "../ui.js";
import { iaDisponivel as _iaOn, responderChat as _responderChat } from "../ia-provider.js";
import { fmtTempoCurto as _fmtTC } from "../util.js";

let ddxOrd = "relevancia"; // relevancia | desempenho | tempo
let ddxKpiAnimou = false; // count-up dos KPIs da disciplina só na 1ª renderização (não re-anima ao reordenar)
const ddxAnaliseCache = {}; // { discId: { dia, texto } } — não re-consulta a IA à toa

function ddxPerf(store, aprov, nTent) {
  if (aprov === null || nTent < 3) return { cls: "", banda: "ddx-neutro" }; // semáforo justo
  const cor = store.corDesempenho(aprov);
  return { cls: cor ? `perf-${cor}` : "", banda: cor ? `ddx-${cor}` : "ddx-neutro" };
}
// Cabeçalho do frame de análise do Mentor: orb (voz da IA) + rótulo. Inline flex para
// alinhar o orb sem depender de CSS novo.
function ddxAnaliseHeadHTML() {
  return `<div class="ddx-analise-head u-flex u-mb-8"><span class="orb orb-sm" aria-hidden="true"></span><b class="txt-ia">Análise do Mentor</b></div>`;
}

export function renderDossieDisciplina(root, app, discId, { onVoltar, onAbrirTopico } = {}) {
  const { store } = app;
  const st = store.get();
  const d = st.disciplinas.find((x) => x.id === discId);
  if (!d) {
    if (onVoltar) onVoltar();
    return;
  }
  const diag = store.diagnostico();
  const linha = diag.porDisciplina.find((l) => l.disciplina.id === discId) || {
    cobertura: 0, percentAcerto: null, tempoSeg: 0, totalTentativas: 0, acertos: 0, topicos: [],
  };
  const tops = st.topicos.filter((t) => t.disciplinaId === discId);

  const infoTop = tops.map((t) => {
    const qIds = st.questoes.filter((q) => q.topicoId === t.id).map((q) => q.id);
    const tent = st.tentativas.filter((x) => qIds.includes(x.questaoId));
    const ac = tent.filter((x) => x.acertou).length;
    const aprov = tent.length ? Math.round((ac / tent.length) * 100) : null;
    const det = (linha.topicos || []).find((x) => x.id === t.id) || {};
    return { t, aprov, nTent: tent.length, nQ: qIds.length, tempoSeg: det.tempoSeg || 0, ultimo: det.ultimoEstudo || null };
  });
  const ordenado = [...infoTop].sort((a, b) => {
    if (ddxOrd === "desempenho") return (a.aprov === null ? 101 : a.aprov) - (b.aprov === null ? 101 : b.aprov); // piores primeiro
    if (ddxOrd === "tempo") return a.tempoSeg - b.tempoSeg; // menos estudados primeiro
    return relValor(b.t) - relValor(a.t); // mais relevantes primeiro
  });

  const kpiPerf = ddxPerf(store, linha.percentAcerto, linha.totalTentativas);
  const sessDisc = st.sessoes
    .filter((s) => tops.some((t) => t.id === s.topicoId))
    .sort((a, b) => (a.data < b.data ? 1 : -1))
    .slice(0, 6);

  const linhaTopico = (i) => {
    const p = ddxPerf(store, i.aprov, i.nTent);
    const rel = relLabel(i.t);
    const corAnel = { ruim: "var(--danger)", regular: "var(--warn)", bom: "var(--success)" }[store.corDesempenho(i.aprov)] || "var(--muted)";
    const meio =
      i.aprov === null || i.nTent < 3
        ? `<span class="muted small">${i.nTent ? `${plural(i.nTent, "questão", "questões")} — resolva ≥3 p/ medir` : i.nQ ? `${plural(i.nQ, "questão à espera", "questões à espera")}` : "não praticado"}</span>`
        : progressRing(i.aprov, { size: 42, stroke: 5, cor: corAnel });
    return `
      <button class="ddx-linha ${p.banda}" data-action="ddx-topico" data-id="${i.t.id}">
        <div class="ddx-linha-nome">${i.t.concluido ? `${icone("check")} ` : ""}${esc(i.t.nome)}${rel ? ` <span class="dossie-card-rel">${esc(rel)}</span>` : ""}</div>
        <div class="ddx-linha-meio">${meio}</div>
        <div class="ddx-linha-stats muted small">
          <span data-tip="tempo estudado">${icone("clock-3")} ${fmtTempo(i.tempoSeg)}</span>
          <span data-tip="último estudo">${i.ultimo ? fmtData(i.ultimo) : "—"}</span>
          <span class="ddx-chev">${icone("chevron-right")}</span>
        </div>
      </button>`;
  };

  // Guarda: os KPIs contam 0→N só ao ENTRAR na disciplina; ao reordenar/gerar análise
  // exibem o valor final estático (evita re-animar a cada re-render).
  const ddxAnima = !ddxKpiAnimou;
  ddxKpiAnimou = true;

  const cacheA = ddxAnaliseCache[discId];
  const analiseHTML =
    cacheA && cacheA.dia === todayISO()
      ? `<div class="ai-frame ddx-analise">${ddxAnaliseHeadHTML()}<p class="ddx-analise-txt">${esc(cacheA.texto)}</p><p class="muted small" style="margin:6px 0 0">Gerada hoje — confira sempre.</p></div>`
      : "";

  root.innerHTML = `
    <div class="ddx-head">
      <button class="btn btn-ghost btn-sm" data-action="ddx-voltar">← Edital</button>
      <div class="ddx-head-tit">
        <h1>${esc(d.nome)}</h1>
        <div class="ddx-head-chips">
          <span class="chip chip-count" style="cursor:default">${linha.cobertura}% do edital</span>
          <span class="chip" style="cursor:default">${plural(tops.length, "tópico", "tópicos")}</span>
          <span class="chip" style="cursor:default">${plural(linha.totalTentativas, "questão resolvida", "questões resolvidas")}</span>
        </div>
      </div>
      <span class="spacer"></span>
      <button class="btn btn-ia btn-sm" data-action="ddx-explicar" data-tip="O Mentor lê seus números desta disciplina e explica onde focar.">${icone("sparkles")} Explicar meu desempenho</button>
    </div>

    <section class="scorecard stagger">
      <div class="sc-pilar">
        <span class="kpi-ico">${icone("target")}</span>
        <span class="sc-num ${kpiPerf.cls}" ${linha.percentAcerto === null || !ddxAnima ? "" : `data-count="${linha.percentAcerto}" data-suf="%"`}>${linha.percentAcerto === null ? "—" : linha.percentAcerto + "%"}</span>
        <span class="sc-rot">Aproveitamento ${defMetrica("aproveitamento")}</span>
      </div>
      <div class="sc-pilar">
        <span class="kpi-ico">${icone("list-checks")}</span>
        <span class="sc-num" ${ddxAnima ? `data-count="${linha.cobertura}" data-suf="%"` : ""}>${linha.cobertura}%</span>
        <span class="sc-rot">Cobertura ${defMetrica("cobertura")}</span>
      </div>
      <div class="sc-pilar" data-tip="Tempo total em foco nesta disciplina.">
        <span class="kpi-ico">${icone("clock-3")}</span>
        <span class="sc-num">${_fmtTC(linha.tempoSeg || 0)}</span>
        <span class="sc-rot">Tempo total</span>
      </div>
      <div class="sc-pilar" data-tip="Acertos / questões resolvidas.">
        <span class="kpi-ico">${icone("check-check")}</span>
        <span class="sc-num">${linha.acertos || 0}/${linha.totalTentativas || 0}</span>
        <span class="sc-rot">Acertos</span>
      </div>
    </section>

    <div id="ddx-analise-slot">${analiseHTML}</div>

    <section class="card" data-reveal>
      <div class="plano-h" style="margin-bottom:10px">
        <h2>${icone("target")} Desempenho por tópico</h2>
        <span class="sp"></span>
        <div class="seg" role="tablist">
          <button class="${ddxOrd === "relevancia" ? "on" : ""}" data-action="ddx-ord" data-ord="relevancia" data-tip="Mais relevantes primeiro.">Relevância</button>
          <button class="${ddxOrd === "desempenho" ? "on" : ""}" data-action="ddx-ord" data-ord="desempenho" data-tip="Piores aproveitamentos primeiro.">Desempenho</button>
          <button class="${ddxOrd === "tempo" ? "on" : ""}" data-action="ddx-ord" data-ord="tempo" data-tip="Menos estudados primeiro.">Tempo</button>
        </div>
      </div>
      <p class="muted small" style="margin:0 0 10px">Sem questões suficientes o tópico fica <b>neutro</b> (a régua só vale com prática). Clique para abrir a pasta viva.</p>
      <div class="ddx-lista stagger">
        ${ordenado.length ? ordenado.map(linhaTopico).join("") : `<p class="muted">Sem tópicos nesta disciplina.</p>`}
      </div>
    </section>

    <section class="card" data-reveal>
      <div class="plano-h"><h2>${icone("clock-3")} Histórico recente</h2></div>
      ${
        sessDisc.length
          ? `<div class="ddx-hist">${sessDisc
              .map((s) => {
                const t = st.topicos.find((x) => x.id === s.topicoId);
                const f = FASES[s.fase];
                return `<div class="ddx-hist-linha"><span class="ddx-hist-data muted small">${fmtData(s.data)}</span><span class="ddx-hist-fase" style="--cor:${f ? f.cor : "var(--muted)"}">${f ? f.nome : "—"}</span><span class="ddx-hist-top">${esc(t ? t.nome : s.material || "—")}</span><span class="muted small">${fmtTempo(s.tempoSeg || 0)}</span></div>`;
              })
              .join("")}</div>`
          : `<p class="muted small u-m-0">Nenhuma sessão registrada nesta disciplina ainda.</p>`
      }
    </section>`;

  bindActions(root, {
    "ddx-voltar": () => onVoltar && onVoltar(),
    "ddx-topico": (el) => onAbrirTopico && onAbrirTopico(el.getAttribute("data-id")),
    "ddx-ord": (el) => {
      ddxOrd = el.getAttribute("data-ord");
      app.refresh();
    },
    "ddx-explicar": async (el) => {
      if (!_iaOn(st.config)) return toast("Conecte uma IA em Configurações para a análise do Mentor.", "erro");
      el.disabled = true;
      el.classList.add("is-generating");
      el.textContent = "Analisando…";
      const piores = infoTop.filter((i) => i.aprov !== null && i.nTent >= 3).sort((a, b) => a.aprov - b.aprov).slice(0, 4);
      const semPratica = infoTop.filter((i) => !i.nTent).slice(0, 5);
      const pergunta =
        `Você é meu mentor de estudos para concurso. Analise MEU desempenho na disciplina "${d.nome}" e responda em 3-5 frases diretas (sem markdown): onde estou bem, onde focar e o próximo passo prático.\n` +
        `Dados reais: aproveitamento geral ${linha.percentAcerto === null ? "sem questões" : linha.percentAcerto + "%"} em ${linha.totalTentativas} questões; cobertura ${linha.cobertura}%; tempo total ${_fmtTC(linha.tempoSeg || 0)}.\n` +
        (piores.length ? `Piores tópicos: ${piores.map((i) => `${i.t.nome} (${i.aprov}% em ${i.nTent})`).join("; ")}.\n` : "") +
        (semPratica.length ? `Sem prática ainda: ${semPratica.map((i) => i.t.nome).join("; ")}.` : "");
      root.querySelector("#ddx-analise-slot").innerHTML = `<div class="ai-frame ddx-analise">${ddxAnaliseHeadHTML()}${skeletonDoc(4)}</div>`;
      try {
        const r = await _responderChat(st.config, { pergunta, fontes: [], web: false, perfil: store.contextoAlunoCurto() });
        ddxAnaliseCache[discId] = { dia: todayISO(), texto: (r.texto || "").trim() };
        const slot = root.querySelector("#ddx-analise-slot");
        slot.innerHTML = `<div class="ai-frame ddx-analise">${ddxAnaliseHeadHTML()}<p class="ddx-analise-txt"></p><p class="muted small" style="margin:6px 0 0">Gerada hoje — confira sempre.</p></div>`;
        revelarTexto(slot.querySelector(".ddx-analise-txt"), ddxAnaliseCache[discId].texto);
        el.disabled = false;
        el.classList.remove("is-generating");
        el.innerHTML = `${icone("refresh-cw")} Reanalisar`;
      } catch (e) {
        toast("Não consegui analisar agora: " + e.message, "erro");
        el.disabled = false;
        el.classList.remove("is-generating");
        el.innerHTML = `${icone("sparkles")} Explicar meu desempenho`;
      }
    },
  });
}
