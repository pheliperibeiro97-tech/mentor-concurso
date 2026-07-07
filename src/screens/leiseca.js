// Lei Seca e Jurisprudência. Cada tela tem dois modos:
//  • META    — referência a CUMPRIR/LER (vira missão; ao concluir, sai da lista).
//  • MEMÓRIA — trecho GRAVADO para relembrar (banco de memória; não é tarefa).
// Vínculo opcional a disciplina/tópico (sem vínculo → Geral). Jurisprudência
// classifica tribunal (TJSP/STJ/STF) e categoria (súmula/tema/precedente).
// Permite importar (texto/PDF) e gerar flashcards/questões.
import { bindActions, toast, header, vazio, confirmar, imprimir, botaoImprimir, opcoesImpressao, avisoIA, ligarDropZone, escolher, focarItem, pedirNumero, abrirJanela, abrirJanelaFluxo, plural } from "../ui.js";
import { esc, fmtData, todayISO, daysBetween } from "../util.js";
import { icone } from "../icones.js";
import { lerArquivoTexto, ligarImportArquivo } from "../pdf.js";
import { montarMarcacao } from "../marcacao.js";
import { filtroTopicosBotaoHTML, filtroTopicosPainelHTML, ligarFiltroTopicos, itemNoFiltro } from "./questoes-filtro.js";
import { CATALOGO_LEIS } from "../legis.js";

const TRIBUNAIS = ["STF", "STJ", "TJSP"]; // padrão; "Outro" no seletor cobre qualquer outro
const CATEGORIAS_JURIS = ["Súmula", "Súmula Vinculante", "Tema repetitivo", "Precedente obrigatório"];

// Abas (modelo v3): "ler" (a letra: link+anotações+texto) · "metas" (metas cruas de leitura) ·
// "memorizar" (promovidos, revisão espaçada) · "treinar" · "raiox".
let modoAtivo = { lei: "ler", juris: "ler" };
let lerFiltroNov = { lei: false, juris: false }; // filtro "só novidades" na aba Ler
let estudarEscopo = { lei: "tudo", juris: "tudo" }; // escopo do lançador Estudar: "tudo" | "incidencia"

// Fecha o menu "..." (details.ls-mais) ao clicar fora ou apertar Esc — o <details> nativo não faz.
if (typeof document !== "undefined" && !window.__lsMaisFechar) {
  window.__lsMaisFechar = true;
  document.addEventListener("click", (e) => {
    document.querySelectorAll("details.ls-mais[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll("details.ls-mais[open]").forEach((d) => (d.open = false));
  });
}
let filtroTop = { lei: { sel: [], aberto: false }, juris: { sel: [], aberto: false } }; // filtro multitópico
let filtroTribunal = "todos"; // só jurisprudência
let filtroCategoria = "todas"; // só jurisprudência
let editandoTribunal = null; // tribunal personalizado em edição (rename) na barra de filtros
let editandoId = null;
let mostrarConcluidas = { lei: false, juris: false }; // metas concluídas recolhidas por padrão
let marcarAberto = new Set(); // ids de itens com a marcação tricromática aberta
let gruposFechados = new Set(); // grupos (norma/tribunal) recolhidos — T1

export function renderLeiSeca(root, app) {
  return renderIndicacoes(root, app, "lei");
}
export function renderJurisprudencia(root, app) {
  return renderIndicacoes(root, app, "juris");
}

function rotulos(tipo) {
  return tipo === "juris"
    ? { titulo: "Jurisprudência", item: "súmula/precedente", itemPlural: "súmulas/precedentes", itemVazio: "uma súmula ou precedente", ph: "Ex.: Súmula 473 STF · Tema 1234 STJ" }
    : { titulo: "Lei Seca", item: "artigo", itemPlural: "artigos", itemVazio: "um artigo", ph: "Ex.: art. 37, caput, CF · art. 312, CP" };
}
// Rótulo do estado "não vale mais" conforme o tipo: lei = revogado; súmula = cancelada;
// tema/precedente = superado. Usado no selo, na ação e no aviso.
function rotuloRevogado(tipo, categoria) {
  if (tipo !== "juris") return { adj: "revogado", acao: "Marcar como revogado" };
  if (/tema|precedente/i.test(categoria || "")) return { adj: "superada", acao: "Marcar como superada" };
  return { adj: "cancelada", acao: "Marcar como cancelada" };
}

function renderIndicacoes(root, app, tipo) {
  const { store } = app;
  const st = store.get();
  const r = rotulos(tipo);
  // Classificadores (flags aditivas; compat com dados antigos):
  const ehMeta = (i) => !!i.metaLeitura;   // meta crua → aba Metas
  const ehLetra = (i) => !i.metaLeitura;   // a letra (texto/link) → aba Ler

  // Foco numa indicação (Dossiê/vínculo): abre na aba certa e rola até ela.
  let focoInd = null;
  if (app.params && app.params.focoIndicacaoId) {
    const alvo = st.indicacoes.find((i) => i.id === app.params.focoIndicacaoId && i.tipo === tipo);
    app.params.focoIndicacaoId = null;
    if (alvo) {
      focoInd = alvo.id;
      modoAtivo[tipo] = ehMeta(alvo) ? "metas" : "ler"; // a letra e os promovidos vivem no Ler
      filtroTop[tipo].sel = [];
      if (tipo === "juris") { filtroTribunal = "todos"; filtroCategoria = "todas"; }
    }
  }
  // Abrir a marcação direto (vindo do dossiê de marcações).
  if (app.params && app.params.marcarId) {
    marcarAberto.add(app.params.marcarId);
    app.params.marcarId = null;
  }
  // Abrir numa aba específica (Mentor/atalhos). Modelo v4 = 3 abas: ler · estudar · metas.
  // Compat com nomes antigos: acervo/meta→ler; memorizar/treinar/raiox→estudar; memoria→estudar.
  if (app.params && app.params.aba) {
    const a = app.params.aba;
    app.params.aba = null;
    if (["ler", "estudar", "metas"].includes(a)) modoAtivo[tipo] = a;
    else if (a === "acervo" || a === "meta") modoAtivo[tipo] = "ler";
    else if (["memorizar", "treinar", "raiox", "memoria"].includes(a)) modoAtivo[tipo] = "estudar";
  }
  if (!["ler", "estudar", "metas"].includes(modoAtivo[tipo])) modoAtivo[tipo] = "ler";
  const modo = modoAtivo[tipo];

  const todasDoTipo = st.indicacoes.filter((i) => i.tipo === tipo);
  const passaFiltro = (i) =>
    itemNoFiltro(st, i, filtroTop[tipo].sel) &&
    (tipo !== "juris" || filtroTribunal === "todos" || i.tribunal === filtroTribunal) &&
    (tipo !== "juris" || filtroCategoria === "todas" || i.categoria === filtroCategoria);

  const hojeISO = todayISO();
  // Ler = a letra (todos os dispositivos com texto/link); pendentes primeiro, concluídas ao fim.
  const listaLer = todasDoTipo.filter((i) => ehLetra(i) && passaFiltro(i)).sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
  // Metas = metas cruas de leitura (viram tarefa no Planejamento).
  const listaMetas = todasDoTipo.filter((i) => ehMeta(i) && passaFiltro(i)).sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));

  const lerN = todasDoTipo.filter(ehLetra).length;
  const metasN = todasDoTipo.filter(ehMeta).length;
  const metasPend = todasDoTipo.filter((i) => ehMeta(i) && !i.lido).length;
  const revN = store.memoriasParaRevisar(tipo);
  // Revogado (lei) / cancelado / superado (juris) fica FORA do estudo e dos contadores.
  const treinaveis = todasDoTipo.filter((i) => ehLetra(i) && !i.revogado && (i.texto || "").trim()).length;
  const comInc = todasDoTipo.filter((i) => ehLetra(i) && !i.revogado && i.pqIncidencia != null).length;
  const naoLidos = todasDoTipo.filter((i) => ehLetra(i) && !i.revogado && !i.lido).length;
  const novidadesN = store.novidadesPendentes(tipo);
  const porIncidencia = (a, b) => (b.pqIncidencia || -1) - (a.pqIncidencia || -1) || (a.criadoEm < b.criadoEm ? 1 : -1);
  // Vínculos súmula↔artigo: índice computado UMA vez por render (evita O(n²) nos itens da Ler).
  const vincMap = modo === "ler" ? store.mapaVinculos() : null;

  root.innerHTML = `
    ${header(r.titulo, `${lerN} ${lerN === 1 ? r.item : r.itemPlural}${metasN ? ` · ${plural(metasN, "meta", "metas")}` : ""}${revN ? ` · ${revN} para revisar` : ""}`, botaoImprimir())}

    <div class="ls-segmented" role="tablist">
      <button class="ls-seg ${modo === "ler" ? "on" : ""}" data-action="modo" data-modo="ler" data-tip="A letra: ler, grifar e organizar cada dispositivo. É o seu acervo.">${icone("book-open")}<span class="ls-seg-txt">Ler</span>${naoLidos ? `<span class="ls-seg-n">${naoLidos}</span>` : ""}</button>
      <button class="ls-seg ${modo === "estudar" ? "on" : ""}" data-action="modo" data-modo="estudar" data-tip="Fazer: Certo/Errado, completar a letra, revisar o que vence e refazer erros — em tela cheia.">${icone("target")}<span class="ls-seg-txt">Estudar</span>${revN ? `<span class="ls-seg-n ls-seg-n-due">${revN}</span>` : ""}</button>
      <button class="ls-seg ${modo === "metas" ? "on" : ""}" data-action="modo" data-modo="metas" data-tip="Planejar a leitura: metas por nome (ex.: 'ler art. 1º a 20'), importáveis, que viram tarefa.">${icone("calendar-check")}<span class="ls-seg-txt">Metas</span>${metasPend ? `<span class="ls-seg-n">${metasPend}</span>` : ""}</button>
      <span class="ls-seg-ind" data-seg-ind></span>
    </div>

    <div class="barra-acoes">
      ${modo === "ler" ? `<button class="btn btn-add btn-sm" data-action="importar" data-tip-pos="cima-esq" data-tip="${tipo === "lei" ? "Trazer a lei: do site oficial (Planalto), colando o texto, ou de um PDF." : "Trazer súmulas/teses: colando o texto/informativo ou de um PDF."}">${icone("download")} Importar</button>` : ""}
      ${tipo === "lei" && modo === "ler" && store.normasComFonte("lei").length ? `<button class="btn btn-ghost btn-sm" data-action="conferir-atualizacao" data-tip-pos="cima-esq" data-tip="Reconsulta a fonte oficial e mostra o que MUDOU, foi ADICIONADO ou REVOGADO (diff mecânico). Você decide o que aplicar.">${icone("refresh-cw")} Conferir atualização</button>` : ""}
      ${modo === "ler" ? `<button class="btn btn-ghost btn-sm" data-action="toggle-pq-import" data-tip-pos="cima-esq" data-tip="Marque o que mais cai (incidência): a IA sugere ou você importa uma estatística. Prioriza o estudo.">${icone("star")} Marcar incidência</button>` : ""}
      ${modo === "metas" ? `<button class="btn btn-add btn-sm" data-action="nova-meta" data-tip-pos="cima-esq" data-tip="Criar uma meta de leitura (ex.: 'ler art. 1º a 20'). Dá para dividir em etapas; vira tarefa no Planejamento.">${icone("target")} Nova meta</button>` : ""}
      ${modo === "metas" ? `<button class="btn btn-ghost btn-sm" data-action="importar-metas" data-tip-pos="cima-esq" data-tip="Importar um cronograma/tabela de metas de leitura (colar ou PDF). Cada linha vira uma meta.">${icone("download")} Importar metas</button>` : ""}
      <span class="spacer"></span>
      ${modo === "ler" && novidadesN ? `<button class="btn ${lerFiltroNov[tipo] ? "btn-soft" : "btn-ghost"} btn-sm" data-action="filtro-novidades" data-tip-pos="cima-dir" data-tip="Mostrar só os dispositivos com novidade legislativa (mudaram/entraram na última conferência).">${icone("sparkles")} Novidades <span class="mini-tag nov-tag">${novidadesN}</span></button>` : ""}
      ${modo !== "estudar" ? filtroTopicosBotaoHTML(st, filtroTop[tipo].sel, filtroTop[tipo].aberto) : ""}
      ${
        tipo === "juris" && modo === "ler"
          ? `<span class="ls-fpill ${filtroTribunal !== "todos" ? "on" : ""}"><span class="ls-fpill-lbl">Tribunal</span>
              <select class="ls-fpill-sel" id="f-trib">
                <option value="todos" ${filtroTribunal === "todos" ? "selected" : ""}>Todos</option>
                ${tribunaisDe(st).map((t) => `<option value="${esc(t)}" ${filtroTribunal === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
              </select></span>${tribAdminHTML()}
             <span class="ls-fpill ${filtroCategoria !== "todas" ? "on" : ""}"><span class="ls-fpill-lbl">Tipo</span>
              <select class="ls-fpill-sel" id="f-cat">
                <option value="todas" ${filtroCategoria === "todas" ? "selected" : ""}>Todos</option>
                ${CATEGORIAS_JURIS.map((c) => `<option value="${esc(c)}" ${filtroCategoria === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
              </select></span>`
          : ""
      }
    </div>
    ${modo !== "estudar" ? filtroTopicosPainelHTML(st, filtroTop[tipo].sel, filtroTop[tipo].aberto) : ""}

    <details class="ed-ajuda">
      <summary>Como funciona ${tipo === "juris" ? "a Jurisprudência" : "a Lei Seca"}?</summary>
      <div class="ed-ajuda-corpo">
        <p>Três abas, cada uma um passo: <b>Ler</b> (a letra), <b>Estudar</b> (praticar) e <b>Metas</b> (planejar).</p>
        <p>${icone("book-open")} <b>Ler</b> — a lista com o <b>texto</b> ${tipo === "juris" ? "das súmulas/teses" : "dos artigos"}. Aqui você lê, <b>grifa</b>, marca o que mais cai com a <b>★</b> (a <b>incidência</b> aparece numa mini-barra no item) e <b>importa</b>${tipo === "juris" ? " (colar o texto/informativo ou PDF)" : " (a letra oficial do Planalto/colando — detecta o revogado — ou uma lista/PDF)"}.${tipo === "lei" ? " Em <b>Conferir atualização</b>, o app compara com a fonte e mostra o que <b>mudou/entrou/foi revogado</b> (selo de novidade)." : ""}</p>
        <p>${icone("target")} <b>Estudar</b> — em tela cheia: <b>Certo/Errado</b>, <b>Completar a letra</b>, <b>Revisar o que vence</b> e <b>Refazer erros</b>${tipo === "juris" ? ", além da <b>Súmula-duelo</b> (número/tribunal trocado)" : ""}. Escolha o <b>escopo</b> (tudo ou o que mais cai); toda geração pergunta <b>quantidade e dificuldade</b> e você ainda gera <b>flashcards</b> e <b>questões</b>.</p>
        <p>${icone("calendar-check")} <b>Metas</b> — metas de leitura (ex.: "ler ${tipo === "juris" ? "os informativos 810–815" : "art. 1º a 20"}") que viram <b>tarefa no Planejamento</b>. Dá para <b>importar um cronograma</b> e <b>dividir em etapas</b>.</p>
      </div>
    </details>

    <div class="lista-leiseca">
      ${
        modo === "estudar" ? estudarCorpoHTML(store, st, tipo, r)
        : modo === "metas" ? metasCorpoHTML(st, tipo, listaMetas, r, store)
        : lerCorpoHTML(st, tipo, lerFiltroNov[tipo] ? listaLer.filter((i) => i.novidadeEm) : listaLer, r, store, vincMap)
      }
    </div>`;

  // filtros
  ligarFiltroTopicos(root, app, filtroTop[tipo]);
  root.querySelector("#f-trib")?.addEventListener("change", (e) => {
    filtroTribunal = e.target.value;
    app.refresh();
  });
  root.querySelector("#f-cat")?.addEventListener("change", (e) => {
    filtroCategoria = e.target.value;
    app.refresh();
  });
  focarItem(root, focoInd);

  // Escopo do Estudar: itens com texto (tudo, ou só o top 20% de incidência).
  const escopoItens = () => {
    let arr = todasDoTipo.filter((i) => !i.metaLeitura && !i.revogado && (i.texto || "").trim() && passaFiltro(i));
    if (estudarEscopo[tipo] === "incidencia") {
      arr = arr.filter((i) => i.pqIncidencia != null).sort(porIncidencia);
      arr = arr.slice(0, Math.max(1, Math.ceil(arr.length * 0.2)));
    }
    return arr;
  };
  // Monta a fila de Certo/Errado e entra no Modo Foco C/E. opts.regenerate → gera n novos
  // (com a dificuldade escolhida) limitando a 12 dispositivos p/ não estourar a cota da IA.
  const iniciarCE = async (itens, opts = {}) => {
    if (!itens.length) return toast("Nada no escopo. Adicione o texto dos dispositivos na aba Ler.", "erro");
    const alvo = opts.regenerate ? itens.slice(0, 12) : itens;
    let fila = [];
    for (const it of alvo) {
      let q = store.itensTreinoDeIndicacao(it.id);
      if (opts.regenerate || !q.length) {
        if (!store.iaDisponivel()) return avisoIA(app, "Gerar treino");
        if (opts.regenerate) store.limparTreinoDeIndicacao(it.id);
        try { q = await store.gerarTreinoDeIndicacao(it.id, opts.n || 4, opts.dificuldade || "medio"); } catch (e) { console.error(e); }
      }
      fila = fila.concat(q.map((x) => x.id));
    }
    if (!fila.length) return toast("Não consegui montar o treino agora.", "erro");
    if (opts.regenerate && itens.length > 12) toast("Preparando os 12 primeiros do escopo…");
    app.navigate("pratica-ce", { focoErrosIds: fila });
  };

  // Monta a marcação tricromática nos itens com o painel aberto.
  root.querySelectorAll("[data-mk-host]").forEach((host) => {
    const id = host.getAttribute("data-mk-host");
    const item = st.indicacoes.find((x) => x.id === id);
    if (item && item.texto) {
      montarMarcacao(host, { store, alvoTipo: "indicacao", alvoId: id, texto: item.texto, topicoId: item.topicoId, tituloFonte: item.referencia });
    }
  });

  // marcar lido
  root.querySelectorAll('[data-action="toggle-lido"]').forEach((el) =>
    el.addEventListener("change", () => store.toggleIndicacaoLida(el.getAttribute("data-id")))
  );

  bindActions(root, {
    imprimir: async () => {
      // Mesmos filtros da tela (tópico/tribunal/categoria), para o modo atual OU metas+memória.
      const listaDoModo = (md) => {
        let l = todasDoTipo.filter((i) => (i.modo || "meta") === md && itemNoFiltro(st, i, filtroTop[tipo].sel));
        if (tipo === "juris" && filtroTribunal !== "todos") l = l.filter((i) => i.tribunal === filtroTribunal);
        if (tipo === "juris" && filtroCategoria !== "todas") l = l.filter((i) => i.categoria === filtroCategoria);
        return l.sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
      };
      const op = await opcoesImpressao(`Imprimir ${r.titulo.toLowerCase()}`, [
        { key: "escopo", label: "O que imprimir", opcoes: [{ v: "ambos", rot: "A cumprir + Memória" }, { v: "meta", rot: "Só a cumprir" }, { v: "memoria", rot: "Só memória" }], def: "ambos" },
        { key: "trecho", label: "Trecho/texto", opcoes: [{ v: "com", rot: "Com o trecho" }, { v: "sem", rot: "Só a referência" }], def: "com" },
      ]);
      if (!op) return;
      const ct = op.trecho === "com";
      let html;
      if (op.escopo === "ambos") {
        html = `<h2>A cumprir</h2>${printLista(st, listaDoModo("meta"), r, ct)}<h2 style="margin-top:18px">Memória</h2>${printLista(st, listaDoModo("memoria"), r, ct)}`;
      } else {
        html = printLista(st, listaDoModo(op.escopo), r, ct);
      }
      imprimir(`${r.titulo} — Mentor Concurso`, html);
    },
    modo: (el) => {
      modoAtivo[tipo] = el.getAttribute("data-modo");
      app.refresh();
    },
    "toggle-add": () => abrirAdicionarIndicacao(app, tipo, "meta"),
    "importar-lei": () => abrirImportarLei(app),
    // Importar UNIFICADO: um botão só. Lei pergunta a fonte; jurisprudência abre o colar/PDF.
    "importar": async () => {
      if (tipo !== "lei") return abrirAdicionarIndicacao(app, tipo, "meta");
      const v = await escolher("Como você quer trazer a lei?", [
        { value: "planalto", label: "A letra da lei (texto oficial) — do Planalto ou colando", cls: "btn-primary" },
        { value: "lista", label: "Uma lista de referências, ou extrair de um PDF/material" },
      ], { lista: true });
      if (v === "planalto") abrirImportarLei(app);
      else if (v === "lista") abrirAdicionarIndicacao(app, tipo, "meta");
    },
    "importar-metas": () => abrirImportarMetas(app, tipo),
    "filtro-novidades": () => { lerFiltroNov[tipo] = !lerFiltroNov[tipo]; app.refresh(); },
    "conferir-atualizacao": () => abrirConferirAtualizacao(app),
    // ---- Estudar (lançador) ----
    "estudar-escopo": (el) => { estudarEscopo[tipo] = el.getAttribute("data-e"); app.refresh(); },
    "estudar-ce": async () => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar Certo/Errado");
      const g = await pedirNumero("Quantos itens Certo/Errado por dispositivo?", { padrao: 4, min: 1, max: 8, nivel: true });
      if (!g) return;
      iniciarCE(escopoItens(), { n: g.n, dificuldade: g.dificuldade, regenerate: true });
    },
    "estudar-foco": () => {
      const pano = store._panoramaLeiSeca();
      const foco = [...pano.pq, ...pano.fracos].filter((i, k, a) => i.tipo === tipo && (i.texto || "").trim() && a.findIndex((x) => x.id === i.id) === k).slice(0, 6);
      iniciarCE(foco);
    },
    // Súmula-duelo (só juris, offline): a banca troca número/tribunal — julga a atribuição.
    "estudar-duelo": () => {
      let itens = todasDoTipo.filter((i) => !i.metaLeitura && !i.revogado && passaFiltro(i));
      if (estudarEscopo[tipo] === "incidencia") {
        itens = itens.filter((i) => i.pqIncidencia != null).sort(porIncidencia);
        itens = itens.slice(0, Math.max(1, Math.ceil(itens.length * 0.2)));
      }
      let fila = [];
      for (const it of itens) {
        let q = store.itensDueloDeIndicacao(it.id);
        if (!q.length) q = store.gerarSumulaDueloDeIndicacao(it.id);
        fila = fila.concat(q.map((x) => x.id));
      }
      if (!fila.length) return toast("Não consegui montar o duelo (as súmulas precisam ter número na referência).", "erro");
      app.navigate("pratica-ce", { focoErrosIds: fila });
    },
    "estudar-cloze": async () => {
      const itens = escopoItens();
      if (!itens.length) return toast("Adicione o texto dos dispositivos na aba Ler primeiro.", "erro");
      const nLac = await pedirNumero("Quantas lacunas por dispositivo? (completar a letra é offline)", { padrao: 4, min: 1, max: 8 });
      if (!nLac) return;
      let n = 0;
      for (const it of itens) { const c = store.gerarClozeDeIndicacao(it.id, nLac); n += Array.isArray(c) ? c.length : 0; }
      toast(n ? `${plural(n, "lacuna criada", "lacunas criadas")}. Revise na Central de Revisões.` : "Não consegui gerar lacunas destes textos.", n ? "ok" : "erro");
      if (n) app.navigate("revisoes");
    },
    // Gerar material do escopo: flashcards (IA, com fallback offline) e questões de múltipla escolha.
    "estudar-flashcards": async () => {
      const itens = escopoItens();
      if (!itens.length) return toast("Adicione o texto dos dispositivos na aba Ler primeiro.", "erro");
      if (!store.iaDisponivel()) {
        let n = 0;
        for (const it of itens) if (store.gerarFlashcardDeIndicacao(it.id)) n++;
        return toast(n ? `${plural(n, "flashcard criado", "flashcards criados")} (offline — conecte a IA para cards melhores).` : "Não consegui gerar.", n ? "ok" : "erro");
      }
      const g = await pedirNumero("Quantos flashcards por dispositivo?", { padrao: 3, min: 1, max: 6, nivel: true });
      if (!g) return;
      const alvo = itens.slice(0, 12);
      toast("Gerando flashcards com IA…");
      let total = 0;
      for (const it of alvo) { try { const cs = await store.gerarFlashcardsIADeIndicacao(it.id, g.n, g.dificuldade); total += cs.length; } catch (e) { console.error(e); } }
      toast(total ? `${plural(total, "flashcard gerado", "flashcards gerados")} na aba Flashcards${itens.length > 12 ? " (12 primeiros do escopo)" : ""}.` : "A IA não retornou flashcards.", total ? "ok" : "erro");
    },
    "estudar-questoes": async () => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar questões");
      const itens = escopoItens();
      if (!itens.length) return toast("Adicione o texto dos dispositivos na aba Ler primeiro.", "erro");
      const r = await pedirNumero("Quantas questões de múltipla escolha por dispositivo?", { padrao: 2, min: 1, max: 5, nivel: true });
      if (!r) return;
      const alvo = itens.slice(0, 12); // limita p/ não estourar a cota de IA
      toast("Gerando questões de múltipla escolha com IA…");
      let total = 0;
      for (const it of alvo) { try { const qs = await store.gerarQuestoesDeIndicacao(it.id, r.n, r.dificuldade, "mc"); total += qs.length; } catch (e) { console.error(e); } }
      toast(total ? `${plural(total, "questão gerada", "questões geradas")} na aba Questões${itens.length > 12 ? " (12 primeiros do escopo)" : ""}.` : "A IA não retornou questões. Confira se os dispositivos têm texto.", total ? "ok" : "erro");
    },
    "estudar-revisar": () => app.navigate("revisoes"),
    "estudar-erros": () => {
      const treinoQs = st.questoes.filter((q) => q.treino && q.fonte?.tipo === tipo);
      const ids = treinoQs.filter((q) => { const ts = st.tentativas.filter((t) => t.questaoId === q.id); return ts.length && !ts[ts.length - 1].acertou; }).map((q) => q.id);
      if (!ids.length) return toast("Você não tem erros de treino para refazer.", "erro");
      app.navigate("pratica-ce", { focoErrosIds: ids });
    },
    "limpar-novidade": (el) => { store.limparNovidade(el.getAttribute("data-id")); app.refresh(); },
    "abrir-fonte": (el) => {
      const ind = store.get().indicacoes.find((x) => x.id === el.getAttribute("data-id"));
      if (ind && ind.fonteUrl) window.open(ind.fonteUrl, "_blank", "noopener");
    },
    // Revogado (lei) / cancelada / superada (juris): tira do estudo, risca. Reativar desfaz.
    "marcar-rev": async (el) => {
      const id = el.getAttribute("data-id");
      const ind = store.get().indicacoes.find((x) => x.id === id);
      const rr = rotuloRevogado(tipo, ind && ind.categoria);
      if (!(await confirmar(`${tipo === "juris" ? "Marcar como " + rr.adj : "Marcar como revogado"}? Sai do Treinar e do Raio-X, fica riscado no Ler e o treino gerado é limpo. Dá para reativar depois.`))) return;
      store.marcarRevogado(id, true);
      toast(tipo === "juris" ? `Marcado como ${rr.adj} (fora do estudo).` : "Marcado como revogado (fora do estudo).");
      app.refresh();
    },
    "reativar-rev": (el) => {
      store.marcarRevogado(el.getAttribute("data-id"), false);
      toast("Reativado: voltou ao estudo.");
      app.refresh();
    },
    // Modo foco: leitura limpa do trecho em coluna estreita (~70ch), sem distração.
    "ler-foco": (el) => {
      const item = store.get().indicacoes.find((x) => x.id === el.getAttribute("data-id"));
      if (!item || !item.texto) return;
      abrirJanela({
        titulo: item.referencia || "Leitura em foco",
        corpoHTML: `<div class="leitura-foco">
          ${item.observacao ? `<p class="lf-obs">${esc(item.observacao)}</p>` : ""}
          <div class="lf-texto">${esc(item.texto)}</div>
        </div>`,
      });
    },
    "toggle-marcar": (el) => {
      const id = el.getAttribute("data-id");
      if (marcarAberto.has(id)) marcarAberto.delete(id);
      else marcarAberto.add(id);
      app.refresh();
    },
    "toggle-pq": (el) => {
      const ind = store.get().indicacoes.find((x) => x.id === el.getAttribute("data-id"));
      store.setIndicacaoPQ(el.getAttribute("data-id"), !(ind && ind.pq));
      toast(ind && ind.pq ? "PQ removida." : "Marcado como Provável Questão (PQ).");
    },
    "toggle-pq-import": () => abrirMarcarPQ(app, tipo),
    "salvar-edicao": (el) => salvar(root, store, tipo, modo, el.getAttribute("data-id")),
    editar: (el) => {
      const e = store.get().indicacoes.find((i) => i.id === el.getAttribute("data-id"));
      if (!e) return;
      abrirJanela({
        titulo: tipo === "juris" ? "Editar jurisprudência" : "Editar lei seca",
        corpoHTML: formHTML(st, tipo, modo, e),
        aoMontar: (jan, fechar) => {
          bindCascata(jan, st, "#ind-disc", "#ind-top");
          ligarTribunalPicker(jan);
          ligarCategoriaPicker(jan);
          jan.querySelector('[data-action="cancelar"]').addEventListener("click", fechar);
          jan.querySelector('[data-action="salvar-edicao"]').addEventListener("click", () => {
            if (salvar(jan, store, tipo, modo, e.id)) { fechar(); app.refresh(); }
          });
        },
      });
    },
    remover: async (el) => {
      if (await confirmar("Remover este item?")) {
        store.removerIndicacao(el.getAttribute("data-id"));
        toast("Removido.");
      }
    },
    "ir-dossie": (el) => app.navigate("edital", { dossieTopicoId: el.getAttribute("data-top") }),
    "ir-vinculo": (el) => app.navigate(el.getAttribute("data-tipo") === "juris" ? "jurisprudencia" : "leiseca", { focoIndicacaoId: el.getAttribute("data-id") }),
    "conferir-vigencia": (el) => {
      const r = store.marcarVigenciaConferida(el.getAttribute("data-id"));
      toast(r && r.n ? `Vigência de ${r.norma} conferida hoje (${plural(r.n, "artigo", "artigos")}).` : "Nada a marcar.", r && r.n ? "ok" : "erro");
      app.refresh();
    },
    "quebrar-teses": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Quebrar em teses");
      el.classList.add("lnk-disabled");
      toast("A IA está separando as teses do informativo…");
      try {
        const ts = await store.quebrarEmTeses(el.getAttribute("data-id"));
        toast(ts.length ? `${plural(ts.length, "tese extraída", "teses extraídas")} (confira e ajuste na lista).` : "Não encontrei teses distintas neste texto.", ts.length ? "ok" : "erro");
        if (ts.length) app.refresh();
      } catch (e) {
        console.error(e);
        toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro");
      }
    },
    // Promover para revisão espaçada (não move: o dispositivo continua no Ler).
    "promover-mem": (el) => {
      if (store.promoverIndicacao(el.getAttribute("data-id"))) {
        toast("Na revisão espaçada. Aparece em Estudar → Revisar (continua no Ler).");
        app.refresh();
      }
    },
    "despromover-mem": (el) => {
      if (store.despromoverIndicacao(el.getAttribute("data-id"))) {
        toast("Tirado da revisão espaçada. Continua no Ler.");
        app.refresh();
      }
    },
    // Nova META de leitura (crua): nasce aqui e vira tarefa no Planejamento.
    "nova-meta": () => abrirNovaMeta(app, tipo),
    // Quebrar uma meta crua em partes (cada parte vira tarefa).
    "quebrar-meta": (el) => abrirQuebrarMeta(app, tipo, el.getAttribute("data-id")),
    "toggle-concluidas": () => {
      mostrarConcluidas[tipo] = !mostrarConcluidas[tipo];
      app.refresh();
    },
    "toggle-grupo": (el) => {
      const k = el.getAttribute("data-grp");
      if (gruposFechados.has(k)) gruposFechados.delete(k);
      else gruposFechados.add(k);
      app.refresh();
    },
    "trib-editar": () => {
      editandoTribunal = filtroTribunal;
      app.refresh();
    },
    "trib-cancelar-edit": () => {
      editandoTribunal = null;
      app.refresh();
    },
    "trib-salvar": () => {
      const novo = (root.querySelector("#trib-novo")?.value || "").trim();
      if (!novo) return toast("Informe o nome do tribunal.", "erro");
      const c = store.renomearTribunal(filtroTribunal, novo);
      filtroTribunal = novo;
      editandoTribunal = null;
      toast(c ? `Tribunal renomeado em ${plural(c, "item", "itens")}.` : "Nada para renomear.", c ? "ok" : "erro");
      app.refresh();
    },
    "trib-remover": async () => {
      if (await confirmar(`Remover o tribunal "${filtroTribunal}"? Os itens com ele ficam sem tribunal (não são apagados).`)) {
        const c = store.removerTribunal(filtroTribunal);
        filtroTribunal = "todos";
        editandoTribunal = null;
        toast(c ? `Tribunal removido de ${plural(c, "item", "itens")}.` : "Nada alterado.", c ? "ok" : "erro");
        app.refresh();
      }
    },
    "limpar-lidas": async () => {
      if (await confirmar("Remover da lista as metas já concluídas? (não afeta a Memória nem os flashcards/questões já gerados)")) {
        const n = store.limparIndicacoesLidas(tipo);
        toast(n ? `${plural(n, "meta concluída removida", "metas concluídas removidas")}.` : "Nenhuma meta concluída.", n ? "ok" : "erro");
      }
    },
  });
}

function salvar(root, store, tipo, modo, editId) {
  const referencia = root.querySelector("#ind-ref").value.trim();
  const texto = root.querySelector("#ind-texto").value.trim();
  const observacao = (root.querySelector("#ind-obs")?.value || "").trim();
  const disciplinaId = root.querySelector("#ind-disc").value || null;
  const topicoId = root.querySelector("#ind-top").value || null;
  const tribunal = (root.querySelector("#ind-trib")?.value || "").trim() || null;
  const categoria = root.querySelector("#ind-cat")?.value || null;
  const anoRaw = root.querySelector("#ind-ano")?.value;
  const ano = anoRaw ? (parseInt(anoRaw, 10) || null) : null;
  if (!referencia) { toast("Informe a referência.", "erro"); return false; }
  store.editarIndicacao(editId, { referencia, texto, observacao, disciplinaId, topicoId, tribunal, categoria, ano });
  editandoId = null;
  toast("Item atualizado.");
  return true;
}

// Formulário de EDIÇÃO de um item (campos estruturados, um item por vez).
function formHTML(st, tipo, modo, e) {
  const sel = e || {};
  let discId = sel.disciplinaId || "";
  if (!discId && sel.topicoId) {
    const t = st.topicos.find((x) => x.id === sel.topicoId);
    discId = t ? t.disciplinaId : "";
  }
  const opcoesDisc = `<option value="">— Geral (sem vínculo) —</option>` + st.disciplinas.map((d) => `<option value="${d.id}" ${d.id === discId ? "selected" : ""}>${esc(d.nome)}</option>`).join("");
  const r = rotulos(tipo);
  return `
    <div class="card form-leiseca">
      <h3>${icone("square-pen")} Editar ${tipo === "juris" ? "jurisprudência" : "dispositivo"}</h3>
      <div class="form-row">
        <label style="flex:2">Referência <input id="ind-ref" type="text" value="${esc(sel.referencia || "")}" placeholder="${r.ph}" /></label>
        <label>Disciplina <select id="ind-disc">${opcoesDisc}</select></label>
        <label>Tópico (opcional) <select id="ind-top">${topicoOptions(st, discId, sel.topicoId)}</select></label>
      </div>
      ${
        tipo === "juris"
          ? `<div class="form-row">
              <label>Tribunal ${tribunalPickerHTML(sel.tribunal || "", "ind-trib")}</label>
              <label>Ano <input id="ind-ano" type="number" min="1988" max="2100" placeholder="Ex.: 2018" value="${sel.ano || ""}" style="width:90px" data-tip="Ano do entendimento — ajuda a ver se é antigo." /></label>
            </div>
            <label style="display:block; margin-bottom:8px">Categoria ${categoriaPickerHTML(sel.categoria || "", "ind-cat")}</label>`
          : ""
      }
      <label>Trecho / conteúdo ${modo === "memoria" ? "(o que gravar para relembrar)" : "(opcional)"}
        <textarea id="ind-texto" rows="3" placeholder="Cole o trecho importante...">${esc(sel.texto || "")}</textarea>
      </label>
      <label>Observação (opcional)
        <input id="ind-obs" type="text" value="${esc(sel.observacao || "")}" placeholder="lembrete ou ressalva (ex.: cai muito; decorar prazos)" />
      </label>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="cancelar">Cancelar</button>
        <button class="btn btn-primary" data-action="salvar-edicao" data-id="${e.id}">Salvar</button>
      </div>
    </div>`;
}

// Caixa ÚNICA de adição: digitar 1, colar várias (uma por linha) ou importar arquivo.
function addPanelHTML(st, tipo, modo, r, texto = "", processando = false) {
  const opcoesDisc = `<option value="">— Geral (sem vínculo) —</option>` + st.disciplinas.map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("");
  const exemplo = tipo === "juris"
    ? `Súmula 473, STF | A administração pode anular seus próprios atos... | cai muito em concurso
Tema 1234, STJ | Tese firmada em recurso repetitivo...`
    : `art. 37, caput, CF | A administração obedecerá aos princípios de legalidade, impessoalidade... | decorar os 5 princípios
art. 312, CP | Apropriar-se o funcionário público de dinheiro...`;
  const instrHTML = tipo === "juris"
    ? `<b>Uma por linha</b> (ex.: <i>Súmula 473 STF</i>). Para já incluir a tese e uma observação, separe com <b>|</b>: <i>referência | tese | observação</i> (opcionais). ` +
      `Ou simplesmente <b>cole sua lista/cronograma do jeito que estiver</b> (inclusive em tabela): o app separa tudo sozinho e ainda deduz o <b>tribunal</b> e a <b>categoria</b>. Você confere e edita antes de salvar.`
    : `<b>Uma por linha</b> (ex.: <i>art. 37, CF</i>). Para já incluir o trecho e uma observação, separe com <b>|</b>: <i>referência | trecho | observação</i> (opcionais). ` +
      `Ou simplesmente <b>cole sua lista/cronograma do jeito que estiver</b> (inclusive em tabela): o app separa tudo sozinho. Você confere e edita antes de salvar.`;
  return `
    <div class="card form-leiseca">
      <h3>${tipo === "juris" ? "Adicionar súmulas / teses" : "Adicionar artigos"}</h3>
      <div class="form-row">
        <label>Disciplina <select id="add-disc">${opcoesDisc}</select></label>
        <label>Tópico (opcional) <select id="add-top"><option value="">— sem tópico —</option></select></label>
        ${
          tipo === "juris"
            ? `<label>Tribunal ${tribunalPickerHTML("", "add-trib")}</label>`
            : ""
        }
      </div>
      ${tipo === "juris" ? `<label style="display:block; margin-bottom:8px">Categoria ${categoriaPickerHTML("", "add-cat")}</label>` : ""}
      <label class="btn btn-ghost btn-file" style="margin-bottom:8px" data-tip-pos="cima-esq" data-tip="Importar de um PDF ou arquivo .txt. Você também pode arrastar o arquivo aqui.">${icone("paperclip")} Importar de arquivo
        <input id="add-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden />
      </label>
      <p class="muted small" style="margin:0 0 6px">${instrHTML}</p>
      <textarea id="add-texto" rows="4" placeholder="${esc("Ex.:\n" + exemplo)}">${esc(texto)}</textarea>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="cancelar-add">Cancelar</button>
        <button class="btn btn-primary" data-action="adicionar" ${processando ? "disabled" : ""}>${processando ? "Processando…" : "Revisar"}</button>
      </div>
      ${
        st.documentos.length
          ? `<div class="add-sep">Ou extrair de um material já cadastrado (IA):</div>
             <div class="form-row" style="align-items:flex-end; gap:10px; flex-wrap:wrap">
               <label class="inline">Material: <select id="add-doc">${st.documentos.map((d) => `<option value="${d.id}">${esc(d.titulo)}</option>`).join("")}</select></label>
               <button class="btn btn-ghost btn-sm" data-action="extrair-material" data-tip="A IA lê o material e extrai as ${tipo === "juris" ? "súmulas/temas/precedentes" : "referências de lei"} citadas (não inventa).">Extrair do material</button>
             </div>`
          : ""
      }
    </div>`;
}

// Preview EDITÁVEL das indicações (antes de gravar): referência, trecho e observação por item,
// + tribunal/categoria na jurisprudência. Editar, remover (✕), voltar para editar e então adicionar.
function indPreviewHTML(st, tipo, modo, r, itens) {
  const ehJuris = tipo === "juris";
  const catOpcoes = (sel) => `<option value="">— categoria —</option>` + CATEGORIAS_JURIS.map((c) => `<option ${sel === c ? "selected" : ""}>${c}</option>`).join("");
  return `<div class="card form-leiseca">
    <h3>${icone("download")} Revisar ${itens.length} ${itens.length === 1 ? "item" : "itens"} antes de adicionar</h3>
    <p class="muted small" style="margin:0 0 8px">Edite a referência, o trecho e a observação de cada item; remova (✕) o que não quiser. O vínculo (disciplina/tópico${ehJuris ? "/tribunal" : ""}) escolhido acima vale para todos.</p>
    <ul class="prev-editavel">
      ${itens
        .map((it, i) => {
          return `<li class="prev-card m-leiseca">
            <div class="prev-card-l1">
              <input class="prev-inp ind-ref-edit" data-i="${i}" value="${esc(it.referencia || "")}" placeholder="${r.ph}" />
              <button class="prev-remover" data-action="remover-ind" data-i="${i}" data-tip-pos="cima-dir" data-tip="Remover este item">${icone("x")}</button>
            </div>
            <input class="prev-inp ind-texto-edit" data-i="${i}" value="${esc(it.texto || "")}" placeholder="Trecho / conteúdo (opcional)" />
            <input class="prev-inp prev-obs ind-obs-edit" data-i="${i}" value="${esc(it.observacao || "")}" placeholder="observação (opcional) — lembrete, ressalva" />
            ${
              ehJuris
                ? `<div class="prev-card-campos">
                    <input class="ind-trib-edit" data-i="${i}" list="trib-list" autocomplete="off" placeholder="Tribunal" value="${esc(it.tribunal || "")}" style="width:120px" />
                    <select class="ind-cat-edit" data-i="${i}">${catOpcoes(it.categoria || "")}</select>
                  </div>${datalistTribunais(st)}`
                : ""
            }
          </li>`;
        })
        .join("")}
    </ul>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="voltar-ind" data-tip-pos="cima-esq" data-tip="Volta ao texto colado para corrigir e revisar de novo.">${icone("arrow-left")} Voltar para editar</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-action="descartar-ind">Descartar</button>
      <button class="btn btn-primary" data-action="aceitar-ind" ${itens.length ? "" : "disabled"}>Adicionar (${itens.length})</button>
    </div>
  </div>`;
}

// Janela "Importar lei oficial": traz a LETRA EXATA da lei do site do Planalto (app desktop) ou
// de um HTML/texto colado. O usuário escolhe a lei do catálogo (ou informa URL/cola), pode limitar
// a um intervalo de artigos, e decide o que fazer com os REVOGADOS (excluir/manter riscado/vigente).
// Nada de OCR nem IA adivinhando a letra — só parsing do texto oficial.
function abrirImportarLei(app) {
  const { store } = app;
  const estado = {
    etapa: "form", processando: false, msg: "",
    norma: "", artigos: [], revogados: 0, decis: {},
    form: { catalogo: "", url: "", html: "", intervalo: "", disciplinaId: "", comMeta: false },
  };

  const formHTML = (st) => {
    const opcCat = `<option value="">— escolha (ou cole/URL abaixo) —</option>` +
      CATALOGO_LEIS.map((l) => `<option value="${esc(l.url)}" data-nome="${esc(l.nome)}" ${estado.form.url === l.url ? "selected" : ""}>${esc(l.titulo)} (${esc(l.nome)})</option>`).join("");
    const opcDisc = `<option value="">— Geral (sem vínculo) —</option>` +
      st.disciplinas.map((d) => `<option value="${d.id}" ${estado.form.disciplinaId === d.id ? "selected" : ""}>${esc(d.nome)}</option>`).join("");
    return `<div class="card form-leiseca">
      <p class="muted small" style="margin:0 0 10px">Traz a <b>letra exata</b> do texto oficial. No app <b>desktop</b> a busca é automática pelo site do Planalto; no navegador (por segurança do site), <b>cole o texto/HTML</b> da página. O app detecta sozinho o que está <b>revogado</b>.</p>
      <div class="form-row">
        <label style="flex:1 1 260px">Lei mais cobrada (catálogo)
          <select id="imp-cat">${opcCat}</select></label>
        <label style="flex:1 1 160px">Artigos (opcional)
          <input id="imp-intervalo" value="${esc(estado.form.intervalo)}" placeholder="ex.: 1-5, 37, 121-127" data-tip="Deixe vazio para trazer a lei inteira. Ou informe artigos/intervalos: 1-5, 37, 213-217." /></label>
      </div>
      <label style="display:block; margin:2px 0 8px">Ou link direto da página oficial
        <input id="imp-url" value="${esc(estado.form.url)}" placeholder="https://www.planalto.gov.br/…" /></label>
      <label style="display:block; margin:2px 0 8px">Ou cole aqui o texto/HTML da lei (fallback do navegador)
        <textarea id="imp-html" rows="5" placeholder="Cole o conteúdo da página oficial da lei (Ctrl+A, Ctrl+C na página do Planalto e cole aqui).">${esc(estado.form.html)}</textarea></label>
      <div class="form-row" style="align-items:center; gap:14px; flex-wrap:wrap">
        <label class="inline">Vincular à disciplina <select id="imp-disc">${opcDisc}</select></label>
      </div>
      ${estado.msg ? `<p class="${/desktop|cole/i.test(estado.msg) ? "muted" : "erro-msg"} small" style="margin:8px 0 0">${esc(estado.msg)}</p>` : ""}
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="imp-cancelar">Cancelar</button>
        <button class="btn btn-primary" data-action="imp-preparar" ${estado.processando ? "disabled" : ""}>${estado.processando ? "Buscando…" : "Buscar / Preparar"}</button>
      </div>
    </div>`;
  };

  const trunc = (s, n = 220) => { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; };
  const previewHTML = () => {
    const vig = estado.artigos.filter((a) => !a.revogado);
    const rev = estado.artigos.map((a, i) => ({ a, i })).filter((x) => x.a.revogado);
    return `<div class="card form-leiseca">
      <h3>${icone("scroll-text")} ${esc(estado.norma || "Lei")} — ${estado.artigos.length} ${estado.artigos.length === 1 ? "artigo" : "artigos"}</h3>
      <p class="muted small" style="margin:0 0 8px">Confira antes de gravar. ${rev.length ? `Há <b>${rev.length}</b> ${rev.length === 1 ? "artigo revogado" : "artigos revogados"} (o Planalto marca tachado); por padrão ficam de fora.` : "Nenhum artigo revogado detectado."}</p>
      ${rev.length ? `<div class="imp-rev-bloco">
        <div class="imp-rev-tit">${icone("eye")} Revogados — decida o que fazer:</div>
        ${rev.map(({ a, i }) => `<div class="imp-rev-item">
          <div class="imp-rev-ref"><s>${esc(a.referencia)}</s></div>
          <div class="imp-rev-opts">
            <label><input type="radio" name="rev-${i}" value="excluir" ${(estado.decis[i] || "excluir") === "excluir" ? "checked" : ""} data-action="imp-decidir" data-i="${i}" /> Excluir</label>
            <label><input type="radio" name="rev-${i}" value="riscar" ${estado.decis[i] === "riscar" ? "checked" : ""} data-action="imp-decidir" data-i="${i}" /> Manter riscado</label>
            <label><input type="radio" name="rev-${i}" value="vigente" ${estado.decis[i] === "vigente" ? "checked" : ""} data-action="imp-decidir" data-i="${i}" /> Está vigente (foi engano)</label>
          </div>
        </div>`).join("")}
      </div>` : ""}
      <div class="imp-vig-lista">
        ${vig.slice(0, 60).map((a) => `<div class="imp-vig-item"><b>${esc(a.referencia)}</b><span class="muted small"> ${esc(trunc(a.texto))}</span></div>`).join("")}
        ${vig.length > 60 ? `<div class="muted small">…e mais ${vig.length - 60} artigos.</div>` : ""}
      </div>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="imp-voltar">${icone("arrow-left")} Voltar</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-action="imp-gravar">Importar</button>
      </div>
    </div>`;
  };

  // Lê os campos do formulário para o estado (antes de preparar/rerender).
  const lerForm = (corpo) => {
    estado.form.url = corpo.querySelector("#imp-url")?.value.trim() || "";
    estado.form.html = corpo.querySelector("#imp-html")?.value || "";
    estado.form.intervalo = corpo.querySelector("#imp-intervalo")?.value.trim() || "";
    estado.form.disciplinaId = corpo.querySelector("#imp-disc")?.value || "";
  };

  abrirJanelaFluxo({
    titulo: "Importar lei oficial",
    render: (corpo) => {
      const st = store.get();
      corpo.innerHTML = estado.etapa === "preview" ? previewHTML() : formHTML(st);
      // Catálogo → preenche URL (o listener é recriado a cada render, no elemento novo).
      corpo.querySelector("#imp-cat")?.addEventListener("change", (e) => {
        estado.form.url = e.target.value || "";
        estado.form.norma = e.target.selectedOptions[0]?.getAttribute("data-nome") || "";
        const inpUrl = corpo.querySelector("#imp-url");
        if (inpUrl) inpUrl.value = estado.form.url;
      });
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "imp-preparar": async () => {
        lerForm(corpo);
        if (!estado.form.html.trim() && !estado.form.url) { estado.msg = "Escolha uma lei do catálogo, cole um link ou cole o texto da lei."; return rerender(); }
        estado.processando = true; estado.msg = ""; rerender();
        try {
          const r = await store.prepararLei({
            html: estado.form.html.trim() || undefined,
            url: estado.form.html.trim() ? undefined : estado.form.url,
            norma: estado.form.norma || undefined,
            intervalo: estado.form.intervalo,
          });
          estado.processando = false;
          if (!r.artigos.length) { estado.msg = "Não encontrei artigos nesse conteúdo. Confira o link/texto ou o intervalo informado."; return rerender(); }
          estado.norma = r.norma; estado.artigos = r.artigos; estado.revogados = r.revogados;
          estado.decis = {}; estado.etapa = "preview"; rerender();
        } catch (e) {
          estado.processando = false;
          estado.msg = e && e.code === "SEM_DESKTOP"
            ? "A busca automática no Planalto só funciona no app desktop. Abra a página oficial no navegador, copie o texto (Ctrl+A, Ctrl+C) e cole no campo acima."
            : (e && e.message) || "Não consegui buscar a página. Confira o link ou cole o texto.";
          rerender();
        }
      },
      "imp-decidir": (el) => { estado.decis[+el.getAttribute("data-i")] = el.value; },
      "imp-voltar": () => { estado.etapa = "form"; estado.msg = ""; rerender(); },
      "imp-cancelar": () => fechar(),
      "imp-gravar": () => {
        const final = estado.artigos.map((a, i) => {
          if (!a.revogado) return a;
          const d = estado.decis[i] || "excluir";
          if (d === "excluir") return null;
          if (d === "vigente") return { ...a, revogado: false };
          return a; // "riscar" → mantém revogado (renderiza tachado)
        }).filter(Boolean);
        const res = store.aceitarLei(final, {
          incluirRevogados: true,
          disciplinaId: estado.form.disciplinaId || null,
          fonteUrl: estado.form.url || null, // guarda a origem p/ "Conferir atualização" depois
        });
        toast(`${res.n} ${res.n === 1 ? "artigo importado" : "artigos importados"}.`, "ok");
        fechar();
        app.refresh();
      },
    }),
  });
}

// Janela "Conferir atualização" (NOVIDADE LEGISLATIVA): reconsulta a fonte oficial e compara
// com o que está guardado (diff MECÂNICO por hash). Mostra alterados/novos/revogados; o usuário
// escolhe o que aplicar. Nada de IA interpretando a mudança — só o diff determinístico.
function abrirConferirAtualizacao(app) {
  const { store } = app;
  const normas = store.normasComFonte("lei");
  const estado = { etapa: "form", processando: false, msg: "", diff: null, form: { norma: normas[0]?.norma || "", url: normas[0]?.url || "", html: "", intervalo: "" } };
  const trunc = (s, n = 160) => { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; };

  const formHTML = () => {
    const opc = normas.length
      ? normas.map((x) => `<option value="${esc(x.norma)}" data-url="${esc(x.url || "")}" ${estado.form.norma === x.norma ? "selected" : ""}>${esc(x.norma)} (${x.n})</option>`).join("")
      : "";
    return `<div class="card form-leiseca">
      <p class="muted small" style="margin:0 0 10px">Reconsulta a <b>fonte oficial</b> e compara com o texto guardado: mostra o que <b>mudou</b>, foi <b>adicionado</b> ou <b>revogado</b> (diff mecânico, sem IA). No desktop a busca é automática; no navegador, <b>cole o texto atualizado</b> da lei.</p>
      ${normas.length ? `<div class="form-row">
        <label style="flex:1 1 260px">Norma (importada com origem oficial)
          <select id="ca-norma">${opc}</select></label>
        <label style="flex:0 1 160px">Artigos (opcional)
          <input id="ca-intervalo" value="${esc(estado.form.intervalo)}" placeholder="ex.: 1-30" /></label>
      </div>
      <label style="display:block; margin:2px 0 8px">Link da fonte (edite se mudou)
        <input id="ca-url" value="${esc(estado.form.url)}" placeholder="https://www.planalto.gov.br/…" /></label>` : `<p class="muted small">Nenhuma lei foi importada com <b>origem oficial</b> ainda. Cole abaixo o texto atualizado e informe a norma no campo.</p>
      <label style="display:block; margin:2px 0 8px">Norma <input id="ca-norma-txt" placeholder="Ex.: Lei 8.112/1990" value="${esc(estado.form.norma)}" /></label>`}
      <label style="display:block; margin:2px 0 8px">Ou cole o texto/HTML atualizado (fallback do navegador)
        <textarea id="ca-html" rows="5" placeholder="Cole o conteúdo atualizado da página oficial.">${esc(estado.form.html)}</textarea></label>
      ${estado.msg ? `<p class="${/desktop|cole/i.test(estado.msg) ? "muted" : "erro-msg"} small" style="margin:8px 0 0">${esc(estado.msg)}</p>` : ""}
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="ca-cancelar">Cancelar</button>
        <button class="btn btn-primary" data-action="ca-conferir" ${estado.processando ? "disabled" : ""}>${estado.processando ? "Conferindo…" : "Conferir agora"}</button>
      </div>
    </div>`;
  };

  const previewHTML = () => {
    const d = estado.diff;
    const nMud = d.alterados.length + d.novos.length + d.revogados.length;
    if (!nMud) return `<div class="card form-leiseca">
      <h3>${icone("check")} ${esc(d.norma || "Lei")} — sem novidades</h3>
      <p class="muted small">Nenhuma diferença entre o texto guardado e a fonte. ${d.semMudanca} ${d.semMudanca === 1 ? "artigo conferido" : "artigos conferidos"}.</p>
      <div class="form-acoes"><span class="spacer"></span><button class="btn btn-primary" data-action="ca-cancelar">Fechar</button></div>
    </div>`;
    const sec = (titulo, ico, itens, render) => itens.length ? `<div class="ca-sec"><div class="ca-sec-tit">${icone(ico)} ${titulo} (${itens.length})</div>${itens.map(render).join("")}</div>` : "";
    return `<div class="card form-leiseca">
      <h3>${icone("sparkles")} ${esc(d.norma || "Lei")} — ${nMud} ${nMud === 1 ? "novidade" : "novidades"}</h3>
      <p class="muted small" style="margin:0 0 8px">Marque o que aplicar. Alterados atualizam o texto (a redação anterior fica guardada); novos entram no acervo; revogados saem do estudo. Tudo recebe o selo <span class="mini-tag nov-tag">novidade</span> para você treinar.</p>
      ${sec("Alterados", "square-pen", d.alterados, (a, i) => `<label class="ca-item"><input type="checkbox" class="ca-chk" data-grp="alterados" data-i="${i}" checked />
        <span><b>${esc(a.referencia)}</b><div class="ca-diff"><span class="ls-diff-red">${esc(trunc(a.textoAntigo))}</span> <span class="muted">→</span> <span class="ls-diff-green">${esc(trunc(a.textoNovo))}</span></div></span></label>`)}
      ${sec("Novos", "download", d.novos, (a, i) => `<label class="ca-item"><input type="checkbox" class="ca-chk" data-grp="novos" data-i="${i}" checked />
        <span><b>${esc(a.referencia)}</b><div class="muted small">${esc(trunc(a.texto))}</div></span></label>`)}
      ${sec("Revogados", "eye", d.revogados, (a, i) => `<label class="ca-item"><input type="checkbox" class="ca-chk" data-grp="revogados" data-i="${i}" checked />
        <span><s>${esc(a.referencia)}</s> <span class="muted small">— sai do estudo</span></span></label>`)}
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="ca-voltar">${icone("arrow-left")} Voltar</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-action="ca-aplicar">Aplicar selecionados</button>
      </div>
    </div>`;
  };

  abrirJanelaFluxo({
    titulo: "Conferir atualização (novidade legislativa)",
    render: (corpo) => {
      corpo.innerHTML = estado.etapa === "preview" ? previewHTML() : formHTML();
      corpo.querySelector("#ca-norma")?.addEventListener("change", (e) => {
        estado.form.norma = e.target.value;
        estado.form.url = e.target.selectedOptions[0]?.getAttribute("data-url") || "";
        const u = corpo.querySelector("#ca-url"); if (u) u.value = estado.form.url;
      });
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "ca-cancelar": () => fechar(),
      "ca-voltar": () => { estado.etapa = "form"; estado.msg = ""; rerender(); },
      "ca-conferir": async () => {
        estado.form.norma = corpo.querySelector("#ca-norma")?.value || corpo.querySelector("#ca-norma-txt")?.value?.trim() || estado.form.norma;
        estado.form.url = corpo.querySelector("#ca-url")?.value?.trim() || "";
        estado.form.html = corpo.querySelector("#ca-html")?.value || "";
        estado.form.intervalo = corpo.querySelector("#ca-intervalo")?.value?.trim() || "";
        if (!estado.form.norma) { estado.msg = "Informe a norma."; return rerender(); }
        if (!estado.form.html.trim() && !estado.form.url) { estado.msg = "Cole o texto atualizado ou informe o link da fonte."; return rerender(); }
        estado.processando = true; estado.msg = ""; rerender();
        try {
          const d = await store.compararLeiComFonte({
            norma: estado.form.norma,
            html: estado.form.html.trim() || undefined,
            url: estado.form.html.trim() ? undefined : estado.form.url,
            intervalo: estado.form.intervalo,
          });
          estado.processando = false; estado.diff = d; estado.etapa = "preview"; rerender();
        } catch (e) {
          estado.processando = false;
          estado.msg = e && e.code === "SEM_DESKTOP"
            ? "A busca automática só funciona no app desktop. Abra a página oficial, copie o texto (Ctrl+A, Ctrl+C) e cole acima."
            : (e && e.message) || "Não consegui conferir. Confira o link ou cole o texto.";
          rerender();
        }
      },
      "ca-aplicar": () => {
        const d = estado.diff;
        const marc = (grp) => [...corpo.querySelectorAll(`.ca-chk[data-grp="${grp}"]`)].filter((c) => c.checked).map((c) => +c.getAttribute("data-i"));
        const decisoes = {
          alterados: marc("alterados").map((i) => ({ indId: d.alterados[i].indId, texto: d.alterados[i].textoNovo })),
          novos: marc("novos").map((i) => ({ referencia: d.novos[i].referencia, texto: d.novos[i].texto })),
          revogados: marc("revogados").map((i) => ({ indId: d.revogados[i].indId, acao: "revogar" })),
        };
        const res = store.aplicarNovidadesLei(decisoes);
        const total = res.alterados + res.novos + res.revogados;
        toast(total ? `${total} ${total === 1 ? "novidade aplicada" : "novidades aplicadas"} (${res.alterados} alterado, ${res.novos} novo, ${res.revogados} revogado).` : "Nada selecionado.", total ? "ok" : "erro");
        fechar();
        app.refresh();
      },
    }),
  });
}

// Janela "Nova meta de leitura": meta CRUA (sem transcrever a letra). Nasce aqui e vira
// tarefa no Planejamento. Ex.: "Ler art. 1º a 20 da CF".
function abrirNovaMeta(app, tipo) {
  const { store } = app;
  const st = store.get();
  const opcDisc = `<option value="">— Geral (sem vínculo) —</option>` + st.disciplinas.map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("");
  const { fechar } = abrirJanela({
    titulo: tipo === "juris" ? "Nova meta de leitura (jurisprudência)" : "Nova meta de leitura (lei seca)",
    corpoHTML: `<div class="card form-leiseca">
      <p class="muted small" style="margin:0 0 10px">Meta <b>crua</b>, sem transcrever a letra (ex.: <i>${tipo === "juris" ? "Ler os informativos 810 a 815 do STJ" : "Ler art. 1º a 20 da CF"}</i>). Vira <b>tarefa no Planejamento</b>.</p>
      <label style="display:block; margin-bottom:8px">O que ler
        <input id="meta-ref" placeholder="${tipo === "juris" ? "Ex.: Ler informativos 810–815 do STJ" : "Ex.: Ler art. 1º a 20 da CF"}" /></label>
      <label class="inline" style="margin-bottom:8px" data-tip="Uma etapa por linha vira uma tarefa separada. Se preencher, cria as etapas no lugar da meta única."><input type="checkbox" id="meta-dividir" /> Dividir em etapas (uma tarefa por linha)</label>
      <textarea id="meta-etapas" rows="4" placeholder="${esc("Ex.:\nLer art. 1º a 5º\nLer art. 6º a 11\nLer art. 12 a 20")}" style="display:none; margin-bottom:8px"></textarea>
      <div class="form-row">
        <label>Disciplina <select id="meta-disc">${opcDisc}</select></label>
        <label>Tópico (opcional) <select id="meta-top"><option value="">— sem tópico —</option></select></label>
      </div>
      <label style="display:block; margin:8px 0 0">Observação (opcional)
        <input id="meta-obs" placeholder="lembrete, prazo, prioridade…" /></label>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="meta-cancelar">Cancelar</button>
        <button class="btn btn-primary" data-action="meta-salvar">Criar</button>
      </div>
    </div>`,
    aoMontar: (overlay, fechar) => {
      const corpo = overlay.querySelector(".mm-corpo");
      bindCascata(corpo, st, "#meta-disc", "#meta-top");
      const chk = corpo.querySelector("#meta-dividir");
      const ta = corpo.querySelector("#meta-etapas");
      chk?.addEventListener("change", () => { ta.style.display = chk.checked ? "" : "none"; if (chk.checked) ta.focus(); });
      bindActions(corpo, {
        "meta-cancelar": () => fechar(),
        "meta-salvar": () => {
          const ref = (corpo.querySelector("#meta-ref")?.value || "").trim();
          const disciplinaId = corpo.querySelector("#meta-disc")?.value || null;
          const topicoId = corpo.querySelector("#meta-top")?.value || null;
          const observacao = (corpo.querySelector("#meta-obs")?.value || "").trim() || null;
          const etapas = chk?.checked ? (ta.value || "").split(/\n+/).map((s) => s.trim()).filter(Boolean) : [];
          if (etapas.length >= 2) {
            etapas.forEach((e) => store.criarMetaLeitura({ tipo, referencia: e, disciplinaId, topicoId }));
            toast(`${etapas.length} etapas criadas (viraram tarefas no Planejamento).`, "ok");
          } else {
            if (!ref) return toast(chk?.checked ? "Escreva ao menos 2 etapas (uma por linha)." : "Escreva o que ler (ex.: art. 1º a 20 da CF).", "erro");
            store.criarMetaLeitura({ tipo, referencia: ref, disciplinaId, topicoId, observacao });
            toast("Meta de leitura criada (virou tarefa no Planejamento).", "ok");
          }
          fechar();
          app.refresh();
        },
      });
    },
  });
}

// Janela "Dividir meta em etapas": cada linha vira uma meta/tarefa; a meta-mãe é removida.
function abrirQuebrarMeta(app, tipo, id) {
  const { store } = app;
  const mae = store.get().indicacoes.find((x) => x.id === id);
  if (!mae) return;
  abrirJanela({
    titulo: "Dividir meta em etapas",
    corpoHTML: `<div class="card form-leiseca">
      <p class="muted small" style="margin:0 0 8px">Meta: <b>${esc(mae.referencia)}</b>. Escreva <b>uma etapa por linha</b> — cada uma vira uma tarefa. A meta original é substituída pelas etapas.</p>
      <textarea id="qm-partes" rows="6" placeholder="${esc("Ex.:\nLer art. 1º a 5º da CF\nLer art. 6º a 10 da CF\nLer art. 11 a 20 da CF")}"></textarea>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="qm-cancelar">Cancelar</button>
        <button class="btn btn-primary" data-action="qm-salvar">Dividir</button>
      </div>
    </div>`,
    aoMontar: (overlay, fechar) => {
      const corpo = overlay.querySelector(".mm-corpo");
      bindActions(corpo, {
        "qm-cancelar": () => fechar(),
        "qm-salvar": () => {
          const partes = (corpo.querySelector("#qm-partes")?.value || "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
          if (partes.length < 2) return toast("Escreva ao menos 2 etapas (uma por linha).", "erro");
          const n = store.quebrarMetaLeitura(id, partes);
          toast(n ? `Meta dividida em ${n} etapas.` : "Não consegui dividir.", n ? "ok" : "erro");
          fechar();
          app.refresh();
        },
      });
    },
  });
}

// Janela "Importar metas": cola um cronograma/tabela (ou PDF) → uma meta por linha, com
// PREVIEW editável antes de lançar. Cada meta vira tarefa no Planejamento.
function abrirImportarMetas(app, tipo) {
  const { store } = app;
  const st = store.get();
  const opcDisc = `<option value="">— Geral (sem vínculo) —</option>` + st.disciplinas.map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("");
  const estado = { linhas: null, texto: "", disciplinaId: "" };
  // Limpa uma linha de tabela/cronograma → instrução de leitura (tira nº de coluna, datas soltas, |, tabs).
  const limpar = (l) =>
    String(l || "").replace(/\t+/g, " ").replace(/\s*\|\s*/g, " · ").replace(/^\s*\d+[\).\-]\s*/, "").replace(/\s{2,}/g, " ").trim();
  abrirJanelaFluxo({
    titulo: "Importar metas de leitura",
    render: (corpo, { rerender, fechar }) => {
      if (estado.linhas) {
        corpo.innerHTML = `<div class="card form-leiseca">
          <h3>${icone("calendar-check")} Revisar ${estado.linhas.length} ${estado.linhas.length === 1 ? "meta" : "metas"} antes de lançar</h3>
          <p class="muted small" style="margin:0 0 8px">Edite ou remova (✕). Cada linha vira uma tarefa no Planejamento, vinculada à disciplina escolhida.</p>
          <ul class="prev-editavel">${estado.linhas.map((t, i) => `<li class="prev-card"><div class="prev-card-l1"><input class="prev-inp im-meta" data-i="${i}" value="${esc(t)}" /><button class="prev-remover" data-action="im-rm" data-i="${i}">${icone("x")}</button></div></li>`).join("")}</ul>
          <div class="form-acoes"><button class="btn btn-ghost" data-action="im-voltar">${icone("arrow-left")} Voltar</button><span class="spacer"></span><button class="btn btn-primary" data-action="im-lancar" ${estado.linhas.length ? "" : "disabled"}>Lançar ${estado.linhas.length} ${estado.linhas.length === 1 ? "meta" : "metas"}</button></div>
        </div>`;
        corpo.querySelectorAll(".im-meta").forEach((el) => el.addEventListener("input", () => { estado.linhas[+el.getAttribute("data-i")] = el.value; }));
        return;
      }
      corpo.innerHTML = `<div class="card form-leiseca">
        <p class="muted small" style="margin:0 0 10px">Cole seu <b>cronograma/tabela</b> de leitura (uma meta por linha) ou importe um arquivo. O app limpa números de coluna e separadores; você confere antes de lançar.</p>
        <label class="inline" style="margin-bottom:8px">Disciplina <select id="im-disc">${opcDisc}</select></label>
        <label class="btn btn-ghost btn-file" style="margin:0 0 8px" data-tip="Importar de um PDF ou .txt.">${icone("paperclip")} Importar de arquivo<input id="im-file" type="file" accept=".pdf,.txt,.md,.csv" hidden /></label>
        <textarea id="im-texto" rows="7" placeholder="${esc("Ex.:\nLer art. 1º a 20 da CF\nLer Lei 8.112 arts. 116 a 132\nLer Título III do CP")}">${esc(estado.texto)}</textarea>
        <div class="form-acoes"><button class="btn btn-ghost" data-action="im-cancelar">Cancelar</button><span class="spacer"></span><button class="btn btn-primary" data-action="im-revisar">Revisar</button></div>
      </div>`;
      const file = corpo.querySelector("#im-file");
      if (file) ligarImportArquivo(file, { getCfg: () => store.get().config, contexto: "cronograma de metas de leitura (uma por linha)", onTexto: (t) => { const a = corpo.querySelector("#im-texto"); if (a) a.value = t; } });
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "im-cancelar": () => fechar(),
      "im-voltar": () => { estado.linhas = null; rerender(); },
      "im-rm": (el) => { estado.linhas.splice(+el.getAttribute("data-i"), 1); rerender(); },
      "im-revisar": () => {
        estado.texto = corpo.querySelector("#im-texto")?.value || "";
        estado.disciplinaId = corpo.querySelector("#im-disc")?.value || "";
        const linhas = estado.texto.split(/\n+/).map(limpar).filter((l) => l.length > 2);
        if (!linhas.length) return toast("Cole ao menos uma linha de meta.", "erro");
        estado.linhas = linhas;
        rerender();
      },
      "im-lancar": () => {
        let n = 0;
        for (const ref of estado.linhas) if (store.criarMetaLeitura({ tipo, referencia: ref, disciplinaId: estado.disciplinaId || null })) n++;
        toast(`${n} ${n === 1 ? "meta criada" : "metas criadas"} (viraram tarefas no Planejamento).`, "ok");
        fechar();
        app.refresh();
      },
    }),
  });
}

// Janela modal "Adicionar meta / Gravar na memória" (lei seca/jurisprudência) — fluxo
// stateful (editar → preview → aplicar) com render-loop próprio (abrirJanelaFluxo).
function abrirAdicionarIndicacao(app, tipo, modo) {
  const { store } = app;
  const r = rotulos(tipo);
  const estado = { preview: null, texto: "", processando: false, opts: { disciplinaId: null, topicoId: null, tribunal: null, categoria: null } };
  // Lê o vínculo escolhido (disciplina/tópico/tribunal/categoria) dos campos do painel.
  const lerOpts = (corpo) => ({
    tipo,
    modo,
    disciplinaId: corpo.querySelector("#add-disc")?.value || null,
    topicoId: corpo.querySelector("#add-top")?.value || null,
    tribunal: (corpo.querySelector("#add-trib")?.value || "").trim() || null,
    categoria: corpo.querySelector("#add-cat")?.value || null,
  });
  abrirJanelaFluxo({
    titulo: tipo === "juris" ? "Adicionar jurisprudência" : "Adicionar lei seca",
    render: (corpo, { rerender }) => {
      const st = store.get();
      if (estado.preview) {
        corpo.innerHTML = indPreviewHTML(st, tipo, modo, r, estado.preview);
        const live = (sel, set) => corpo.querySelectorAll(sel).forEach((el) =>
          el.addEventListener("input", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) set(estado.preview[i], el.value); }));
        live(".ind-ref-edit", (it, v) => (it.referencia = v));
        live(".ind-texto-edit", (it, v) => (it.texto = v));
        live(".ind-obs-edit", (it, v) => (it.observacao = v));
        live(".ind-trib-edit", (it, v) => (it.tribunal = v.trim() || null));
        corpo.querySelectorAll(".ind-cat-edit").forEach((el) =>
          el.addEventListener("change", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) estado.preview[i].categoria = el.value || null; }));
        return;
      }
      corpo.innerHTML = addPanelHTML(st, tipo, modo, r, estado.texto, estado.processando);
      // Restaura o vínculo escolhido (e popula a cascata de tópicos) ao voltar do preview.
      const dEl = corpo.querySelector("#add-disc");
      const tEl = corpo.querySelector("#add-top");
      if (dEl && estado.opts.disciplinaId) { dEl.value = estado.opts.disciplinaId; if (tEl) tEl.innerHTML = topicoOptions(st, estado.opts.disciplinaId, estado.opts.topicoId); }
      if (tEl && estado.opts.topicoId) tEl.value = estado.opts.topicoId;
      const tribEl = corpo.querySelector("#add-trib");
      if (tribEl && estado.opts.tribunal) sincronizarTribPicker(tribEl, estado.opts.tribunal);
      const catEl = corpo.querySelector("#add-cat");
      if (catEl && estado.opts.categoria) {
        catEl.value = estado.opts.categoria;
        const chip = corpo.querySelector(`[data-cat-pick="${estado.opts.categoria}"]`);
        if (chip) chip.classList.add("on");
      }
      bindCascata(corpo, st, "#add-disc", "#add-top");
      ligarTribunalPicker(corpo);
      ligarCategoriaPicker(corpo);
      const addFile = corpo.querySelector("#add-file");
      if (addFile) {
        ligarDropZone(addFile);
        ligarImportArquivo(addFile, {
          getCfg: () => store.get().config,
          contexto:
            tipo === "juris"
              ? "jurisprudência: súmulas, enunciados e precedentes judiciais, com o tribunal e a referência/número de cada um, preservando essa referência"
              : "legislação (lei seca): os artigos da norma com seus parágrafos, incisos e alíneas, preservando integralmente a numeração e o texto dos dispositivos",
          onTexto: (texto) => { const a = corpo.querySelector("#add-texto"); if (a) a.value = texto; if (texto.trim()) toast("Texto carregado. Revise e adicione."); },
        });
      }
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "cancelar-add": () => fechar(),
      adicionar: async () => {
        const texto = corpo.querySelector("#add-texto").value;
        if (!texto.trim()) return toast("Informe ao menos uma referência (ex.: art. 37, CF).", "erro");
        estado.opts = lerOpts(corpo);
        estado.texto = texto;
        estado.processando = true;
        rerender();
        let itens = [];
        try {
          itens = await store.prepararIndicacoesAuto(texto, tipo);
        } catch (e) {
          console.error(e);
          estado.processando = false;
          rerender();
          return toast(`A IA está indisponível no momento (tente de novo em instantes). Sem IA, separe cada item com "|".`, "erro");
        }
        estado.processando = false;
        if (!itens.length) { rerender(); return toast("Não consegui reconhecer referências. Confira o texto.", "erro"); }
        estado.preview = itens;
        rerender();
      },
      "remover-ind": (el) => {
        const i = parseInt(el.getAttribute("data-i"), 10);
        if (estado.preview) estado.preview.splice(i, 1);
        if (estado.preview && !estado.preview.length) estado.preview = null;
        rerender();
      },
      "voltar-ind": () => { estado.preview = null; rerender(); },
      "descartar-ind": () => fechar(),
      "aceitar-ind": () => {
        const itens = (estado.preview || []).filter((it) => (it.referencia || "").trim());
        if (!itens.length) return toast("Nenhum item para adicionar.", "erro");
        const n = store.aceitarIndicacoes(itens, estado.opts || { tipo, modo });
        toast(`${plural(n, "item adicionado", "itens adicionados")}.`);
        fechar();
        app.refresh();
      },
      "extrair-material": async (el) => {
        if (!store.iaDisponivel()) return avisoIA(app, "Extrair do material");
        const docId = corpo.querySelector("#add-doc").value;
        el.disabled = true;
        toast("Lendo o material e extraindo…");
        try {
          const itens = await store.prepararIndicacoesDeDoc(docId, tipo);
          if (!itens.length) { el.disabled = false; return toast("Não encontrei referências neste material.", "erro"); }
          estado.opts = lerOpts(corpo);
          estado.preview = itens;
          toast(`${plural(itens.length, "referência extraída", "referências extraídas")} (confira e ajuste).`);
          rerender();
        } catch (e) {
          console.error(e);
          toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro");
          el.disabled = false;
        }
      },
    }),
  });
}

// Janela modal "Marcar Prováveis Questões (PQ)" — IA sugere OU importa estatística →
// lista com checkboxes → aplicar. Render-loop próprio (abrirJanelaFluxo).
function abrirMarcarPQ(app, tipo) {
  const { store } = app;
  const estado = { analise: null, corte: 30, sugerindo: false };
  abrirJanelaFluxo({
    titulo: "Marcar Prováveis Questões (PQ)",
    render: (corpo, { rerender }) => {
      corpo.innerHTML = pqImportHTML(tipo, estado.corte, estado.sugerindo, estado.analise);
      corpo.querySelector("#pq-corte")?.addEventListener("change", (e) => {
        estado.corte = parseInt(e.target.value, 10) || 0;
        if (estado.analise) rerender();
      });
      // Importar estatística de ARQUIVO (.txt/.csv/.pdf) — antes só dava p/ colar.
      ligarImportArquivo(corpo.querySelector("#pq-file"), {
        getCfg: () => store.get().config,
        contexto: "estatística de incidência (PQ)",
        onTexto: (texto) => {
          if (!texto || !texto.trim()) return toast("Não consegui ler texto desse arquivo.", "erro");
          // Joga o texto extraído no quadro p/ você conferir/editar antes de "Analisar".
          const ta = corpo.querySelector("#pq-texto");
          if (ta) { ta.value = texto.trim(); ta.focus(); }
          toast("Texto importado — confira e clique em Analisar.");
        },
      });
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "pq-ia-sugere": async () => {
        if (!store.iaDisponivel()) return avisoIA(app, "Sugerir PQ com IA");
        estado.sugerindo = true; rerender();
        try {
          estado.analise = await store.sugerirPQIA(tipo);
          toast(estado.analise.length ? `${plural(estado.analise.length, "referência sugerida", "referências sugeridas")} pela IA.` : "A IA não destacou nenhuma como alta incidência.");
        } catch (e) { console.error(e); toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro"); }
        estado.sugerindo = false; rerender();
      },
      "pq-analisar": () => {
        const texto = corpo.querySelector("#pq-texto")?.value || "";
        estado.corte = parseInt(corpo.querySelector("#pq-corte")?.value, 10) || 0;
        if (!texto.trim()) return toast("Cole a estatística de incidência.", "erro");
        estado.analise = store.analisarEstatisticaPQ(texto);
        rerender();
      },
      "pq-aplicar": () => {
        const itens = [];
        corpo.querySelectorAll(".pq-cb:checked").forEach((cb) => {
          const r = estado.analise[parseInt(cb.getAttribute("data-i"), 10)];
          if (r) r.ids.forEach((id) => itens.push({ id, incidencia: r.incidencia }));
        });
        const n = store.aplicarPQ(itens);
        toast(n ? `${plural(n, "item marcado", "itens marcados")} como PQ.` : "Nenhum item selecionado.", n ? "ok" : "erro");
        if (n) { fechar(); app.refresh(); }
      },
    }),
  });
}

// Painel para marcar Prováveis Questões (PQ): dois caminhos (IA sugere OU importar
// estatística), ambos casados com as referências CADASTRADAS NESTA ABA. O usuário confirma.
function pqImportHTML(tipo, corte = 30, sugerindo = false, analise = null) {
  const ondeBase = tipo === "juris" ? "Jurisprudência" : "Lei Seca";
  return `<div class="card pq-import">
    <h3><span class="orb orb-sm" aria-hidden="true" style="display:inline-block;vertical-align:middle"></span> ${icone("star")} Marcar Prováveis Questões (PQ) <span class="muted small pq-info" data-tip-pos="bottom" data-tip="Pontos de alta incidência (o que mais cai) num tópico. A IA estima pelas suas referências de ${ondeBase}; ou importe/cole uma estatística. Você confirma antes de aplicar.">${icone("info")}</span></h3>

    <div class="pq-acoes">
      <button class="btn btn-ia btn-sm" data-action="pq-ia-sugere" ${sugerindo ? "disabled" : ""}>${icone("sparkles")} ${sugerindo ? "Analisando…" : "Sugerir com IA"}</button>
      <span class="muted small">ou importe uma estatística:</span>
      <label class="btn btn-ghost btn-sm btn-file" data-tip="Arquivo (.txt/.csv/.pdf) com 'referência ; número' por linha."><input type="file" id="pq-file" accept=".txt,.csv,.md,.pdf" hidden />${icone("paperclip")} Importar arquivo</label>
    </div>

    <div class="pq-colar">
      <p class="muted small pq-colar-dica">Uma por linha: <b>referência ; número</b> — importe um arquivo (cai aqui embaixo) ou digite/cole. Ex.: <code>art. 37, CF ; 45</code></p>
      <textarea id="pq-texto" rows="4" placeholder="art. 37, CF ; 45&#10;Súmula 473 STF ; 30"></textarea>
      <div style="margin-top:6px"><button class="btn btn-ghost btn-sm" data-action="pq-analisar">Analisar</button></div>
    </div>

    ${analise ? `<div class="pq-corte-linha"><label class="inline small">Já marcar quando a incidência ≥ <input id="pq-corte" type="number" min="0" max="100" value="${corte}" style="width:64px; margin:0 6px" /></label> <span class="muted small">(opcional · abaixo vêm desmarcadas)</span></div>` : ""}
    ${analise ? pqResultadoHTML(corte, analise) : ""}
  </div>`;
}

// Lista de sugestões de PQ (vinda da IA ou da estatística), para o usuário confirmar.
function pqResultadoHTML(corte, analise) {
  if (!analise.length) {
    return `<p class="muted small" style="margin-top:10px">Nenhuma referência foi reconhecida ou casada com seus itens. Na importação, use o formato "referência ; número"; na IA, cadastre algumas referências antes.</p>`;
  }
  const casadas = analise.filter((r) => r.ids.length).length;
  return `<div class="pq-resultado">
      <div class="muted small" style="margin:10px 0 6px">${plural(casadas, "referência casada", "referências casadas")} com seus itens. Confira e ajuste o que será marcado como PQ:</div>
      <ul class="pq-lista">
        ${analise
          .map((r, i) => {
            const casou = r.ids.length > 0;
            const acima = r.incidencia >= corte;
            return `<li class="pq-res-item ${casou ? "" : "pq-nao-casou"}">
              <input type="checkbox" class="pq-cb" data-i="${i}" ${casou && acima ? "checked" : ""} ${casou ? "" : "disabled"} />
              <span class="pq-res-ref"><b>${esc(r.ref)}</b> · incidência ${r.incidencia}</span>
              <span class="pq-res-match muted small">${casou ? "→ " + esc(r.nomes.join(", ")) : "(nenhum item correspondente)"}</span>
            </li>`;
          })
          .join("")}
      </ul>
      <button class="btn btn-primary btn-sm" data-action="pq-aplicar">Aplicar PQ aos selecionados</button>
    </div>`;
}

// T1 — Agrupar por NORMA (lei) ou TRIBUNAL (juris). Extrai a norma do último segmento da
// referência que não seja posicional (caput/§/inciso/alínea) nem o próprio "art.".
function normaDeRef(ref) {
  const segs = String(ref || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (let k = segs.length - 1; k >= 0; k--) {
    const s = segs[k];
    if (/^(caput|§|par[áa]grafo\s*[úu]nico|par[áa]grafo|inc\.?|inciso|al[íi]nea|[ivxlcdm]+|[a-z])$/i.test(s)) continue;
    if (/^art/i.test(s)) continue;
    return s;
  }
  return null;
}
function chaveGrupo(tipo, i) {
  return tipo === "juris" ? (i.tribunal || "Outros") : (normaDeRef(i.referencia) || "Outros");
}
// Renderiza a lista agrupada e recolhível. Se só existir o grupo "Outros" (sem norma), vai flat.
function corpoAgrupado(lista, tipo, chaveTab, renderItem) {
  const mapa = new Map();
  for (const i of lista) {
    const k = chaveGrupo(tipo, i);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(i);
  }
  const grupos = [...mapa.entries()].map(([norma, itens]) => ({ norma, itens }));
  if (!grupos.some((g) => g.norma !== "Outros")) return lista.map(renderItem).join("");
  grupos.sort((a, b) => (a.norma === "Outros" ? 1 : b.norma === "Outros" ? -1 : a.norma.localeCompare(b.norma)));
  return grupos
    .map((g) => {
      const key = `${tipo}:${chaveTab}:${g.norma}`;
      const aberto = !gruposFechados.has(key);
      return `<div class="ls-grupo">
        <button class="ls-grupo-head lnk" data-action="toggle-grupo" data-grp="${esc(key)}">
          ${icone(aberto ? "chevron-down" : "chevron-right")} <b>${esc(g.norma)}</b> <span class="num">${g.itens.length}</span>
        </button>
        ${aberto ? `<div class="ls-grupo-itens">${g.itens.map(renderItem).join("")}</div>` : ""}
      </div>`;
    })
    .join("");
}

// Aba ESTUDAR (modelo v4): NÃO é lista de texto — é um LANÇADOR. Você escolhe o que fazer
// (Certo/Errado · Completar a letra · Revisar o que vence · Refazer erros) e o escopo (tudo /
// o que mais cai), e cai em tela cheia. Absorve Treinar + Memorizar + cloze + Raio-X (como faixa).
function estudarCorpoHTML(store, st, tipo, r) {
  const base = st.indicacoes.filter((i) => i.tipo === tipo && !i.metaLeitura && !i.revogado);
  const comTexto = base.filter((i) => (i.texto || "").trim());
  const dueRev = store.memoriasParaRevisar(tipo);
  const pano = store._panoramaLeiSeca();
  const foco = [...pano.pq, ...pano.fracos].filter((i, k, a) => i.tipo === tipo && a.findIndex((x) => x.id === i.id) === k).slice(0, 6);
  // Erros de treino deste tipo (última tentativa errada) → "Refazer erros".
  const treinoQs = st.questoes.filter((q) => q.treino && (q.fonte?.tipo === tipo || (tipo === "lei" && q.fonte?.tipo === "lei")));
  const ultimaErrada = (qid) => { const ts = st.tentativas.filter((t) => t.questaoId === qid); return ts.length && !ts[ts.length - 1].acertou; };
  const errosN = treinoQs.filter((q) => ultimaErrada(q.id)).length;
  const esc2 = estudarEscopo[tipo] || "tudo";

  if (!comTexto.length && !dueRev) {
    return vazio(
      `Nada para estudar ainda\nNa aba Ler, importe ${r.itemVazio} COM o texto — o Estudar transforma a letra em Certo/Errado, lacunas e revisão.`,
      `<button class="btn btn-add" data-action="modo" data-modo="ler">${icone("book-open")} Ir para Ler</button>`,
      icone("target")
    );
  }

  const faixaFoco = foco.length
    ? `<div class="estudar-foco">
        <div class="estudar-foco-tit">${icone("bar-chart-3")} Foque nisto hoje <span class="muted small">(mais caem × onde você erra)</span></div>
        <div class="estudar-foco-chips">${foco.map((i) => `<span class="foco-chip">${esc(i.referencia)}${i.pqIncidencia != null ? `<b>${i.pqIncidencia}</b>` : ""}</span>`).join("")}</div>
        <button class="btn btn-primary btn-sm" data-action="estudar-foco" data-tip="Certo/Errado só com estes dispositivos prioritários.">${icone("play")} Praticar estes</button>
      </div>`
    : "";

  const escopoSel = `<div class="estudar-escopo">
      <span class="muted small">Escopo:</span>
      <button class="chip-escopo ${esc2 === "tudo" ? "on" : ""}" data-action="estudar-escopo" data-e="tudo">Tudo${comTexto.length ? ` (${comTexto.length})` : ""}</button>
      <button class="chip-escopo ${esc2 === "incidencia" ? "on" : ""}" data-action="estudar-escopo" data-e="incidencia" data-tip="Só os de maior incidência (top 20%).">O que mais cai</button>
    </div>`;

  const card = (ic, titulo, desc, acao, extra, on = true) => `
    <button class="estudar-card ${on ? "" : "off"}" data-action="${acao}" ${on ? "" : "disabled"}>
      <span class="estudar-card-ic">${icone(ic)}</span>
      <span class="estudar-card-txt"><b>${titulo}</b><span class="muted small">${desc}</span></span>
      ${extra ? `<span class="estudar-card-n">${extra}</span>` : ""}
    </button>`;

  return `
    <p class="muted small" style="margin:2px 0 12px">${icone("target")} Escolha o que praticar. Tudo roda em <b>tela cheia</b> e alimenta seu histórico, o Caderno de Erros e a Central de Revisões.</p>
    ${faixaFoco}
    ${escopoSel}
    <div class="estudar-grid">
      ${card("repeat-2", "Certo / Errado", tipo === "juris" ? "Afirmações no estilo da banca sobre a súmula/tese — você julga Certo ou Errado." : "A banca troca uma palavra; você caça a pegadinha (diff colorido).", "estudar-ce", comTexto.length ? `${comTexto.length}` : "", !!comTexto.length)}
      ${card("puzzle", "Completar a letra", tipo === "juris" ? "Recall por lacunas nos pontos-chave da tese. Vira flashcard." : "Recall por lacunas: prazos, verbos, quóruns. Vira flashcard.", "estudar-cloze", "", !!comTexto.length)}
      ${tipo === "juris" ? card("scale", "Súmula-duelo", "A banca troca o número ou o tribunal da súmula — você diz se a atribuição está certa (offline, sem IA).", "estudar-duelo", "", !!base.length) : ""}
      ${card("brain", "Revisar o que vence", "Revisão espaçada dos pontos que você marcou para fixar.", "estudar-revisar", dueRev ? `${dueRev}` : "0", true)}
      ${card("list-checks", "Refazer meus erros", "Volte nos itens que você errou no treino.", "estudar-erros", errosN ? `${errosN}` : "", !!errosN)}
    </div>
    ${comTexto.length ? `<div class="estudar-gerar">
      <span class="muted small">Gerar material do escopo para estudar depois:</span>
      <button class="btn btn-ghost btn-sm" data-action="estudar-flashcards" data-tip="A IA cria flashcards (pergunta/resposta) do escopo, na aba Flashcards. Sem IA, faz uma versão offline.">${icone("layers")} Flashcards</button>
      <button class="btn btn-ghost btn-sm" data-action="estudar-questoes" data-tip="A IA cria questões de múltipla escolha, no estilo da banca, na aba Questões.">${icone("notebook-pen")} Questões de múltipla escolha</button>
    </div>` : ""}`;
}

// Aba LER — a letra (link/anotações/texto). Não lidos agrupados por norma; lidos recolhidos.
function lerCorpoHTML(st, tipo, lista, r, store, vincMap) {
  const ctaAdd = `<button class="btn btn-add" data-action="toggle-add">${icone("download")} Importar ${r.item}</button>`;
  const pend = lista.filter((i) => !i.lido);
  const done = lista.filter((i) => i.lido);
  let html = pend.length
    ? corpoAgrupado(pend, tipo, "ler", (i) => itemHTML(st, tipo, i, store, "ler", vincMap))
    : vazio(
        done.length ? "Tudo lido\nVocê marcou todos os dispositivos como lidos." : `Comece pela letra\nImporte ou cole ${r.itemVazio} para ler, marcar e treinar.`,
        done.length ? "" : ctaAdd,
        done.length ? icone("party-popper") : icone("book-open")
      );
  if (done.length) {
    html += `<div class="concluidas-head">
        <button class="lnk" data-action="toggle-concluidas">${mostrarConcluidas[tipo] ? icone("chevron-down") : icone("chevron-right")} ${icone("check")} Lidos (<span class="num">${done.length}</span>)</button>
      </div>
      ${mostrarConcluidas[tipo] ? corpoAgrupado(done, tipo, "ler-done", (i) => itemHTML(st, tipo, i, store, "ler", vincMap)) : ""}`;
  }
  return html;
}


// Aba METAS — metas CRUAS de leitura (sem transcrever a letra). Cada meta = tarefa no
// Planejamento; dá para quebrar em partes. Pendentes em cima, concluídas recolhidas.
function metasCorpoHTML(st, tipo, lista, r, store) {
  const cta = `<button class="btn btn-add" data-action="nova-meta">${icone("target")} Nova meta de leitura</button>`;
  if (!lista.length)
    return vazio(
      `Sem metas de leitura\nCrie metas cruas (ex.: "${tipo === "juris" ? "ler os Informativos 810–815 do STJ" : "ler art. 1º a 20 da CF"}"). Cada uma vira tarefa no Planejamento e pode ser quebrada em partes.`,
      cta,
      icone("target")
    );
  const pend = lista.filter((i) => !i.lido);
  const done = lista.filter((i) => i.lido);
  const linha = (i) => {
    const topico = i.topicoId ? st.topicos.find((t) => t.id === i.topicoId) : null;
    const disc = topico ? st.disciplinas.find((d) => d.id === topico.disciplinaId) : i.disciplinaId ? st.disciplinas.find((d) => d.id === i.disciplinaId) : null;
    const vinc = topico
      ? `<button class="tag-topico lnk" data-action="ir-dossie" data-top="${topico.id}">${esc(nomeTopico(st, topico))}</button>`
      : `<span class="tag-topico">${disc ? esc(disc.nome) : "Geral"}</span>`;
    return `<div class="card ls-item ls-meta-crua ${i.lido ? "lido" : ""}" data-foco-id="${i.id}">
      <div class="ls-top">
        <input type="checkbox" data-action="toggle-lido" data-id="${i.id}" ${i.lido ? "checked" : ""} title="Concluir meta" />
        <span class="ls-ref">${i.lido ? `<s>${esc(i.referencia)}</s>` : esc(i.referencia)}</span>
        <span class="spacer"></span>
        ${vinc}
      </div>
      ${i.observacao ? `<div class="ls-obs muted small">${icone("notebook-pen")} ${esc(i.observacao)}</div>` : ""}
      <div class="ls-rodape">
        <div class="ls-acoes">
          <button class="lnk" data-action="quebrar-meta" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Divide esta meta em etapas menores (ex.: blocos de artigos). Cada etapa vira uma tarefa.">${icone("list-checks")} Dividir em etapas</button>
          <details class="ls-mais"><summary data-tip="Mais ações" title="Mais ações">${icone("ellipsis")}</summary><div class="ls-mais-pop">
            <button class="lnk" data-action="editar" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Editar a referência e o vínculo.">${icone("square-pen")} Editar</button>
            <button class="lnk lnk-danger" data-action="remover" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Remover esta meta.">${icone("x")} Remover</button>
          </div></details>
        </div>
        <span class="ls-foot-meta"><span class="muted small">${fmtData(i.criadoEm)}</span></span>
      </div>
    </div>`;
  };
  let html = pend.length ? pend.map(linha).join("") : vazio("Metas em dia\nTodas as metas de leitura foram concluídas.", "", icone("party-popper"));
  if (done.length) {
    html += `<div class="concluidas-head">
        <button class="lnk" data-action="toggle-concluidas">${mostrarConcluidas[tipo] ? icone("chevron-down") : icone("chevron-right")} ${icone("check")} Concluídas (<span class="num">${done.length}</span>)</button>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" data-action="limpar-lidas" data-tip-pos="cima-dir" data-tip="Remove as metas já concluídas.">${icone("trash-2")} Limpar concluídas</button>
      </div>
      ${mostrarConcluidas[tipo] ? done.map(linha).join("") : ""}`;
  }
  return html;
}

// Item da aba LER (v4) — enxuto: a letra + poucas ações (prática/geração ficam no Estudar).
// Incidência aparece INLINE (mini-barra). O menu "⋯" traz só organizar/gerenciar.
// vincMap: índice de vínculos pré-computado (store.mapaVinculos) para evitar O(n²) no render.
function itemHTML(st, tipo, i, store, contexto = "ler", vincMap = null) {
  const topico = i.topicoId ? st.topicos.find((t) => t.id === i.topicoId) : null;
  const disc = topico ? st.disciplinas.find((d) => d.id === topico.disciplinaId) : i.disciplinaId ? st.disciplinas.find((d) => d.id === i.disciplinaId) : null;
  const vinc = topico
    ? `<button class="tag-topico lnk" data-action="ir-dossie" data-top="${topico.id}">${esc(nomeTopico(st, topico))}</button>`
    : `<span class="tag-topico">${disc ? esc(disc.nome) : "Geral"}</span>`;
  const rotRev = rotuloRevogado(tipo, i.categoria);
  const anoVelho = tipo === "juris" && i.ano && (+todayISO().slice(0, 4) - i.ano) >= 8;
  // Selos: só o que muda o STATUS do dispositivo (não ações). Incidência é separada (inline).
  const badges =
    (i.revogado ? `<span class="mini-tag rev-tag" data-tip="Fora do estudo${i.revogadoEm ? ` (${fmtData(i.revogadoEm)})` : ""}.">${icone("ban")} ${rotRev.adj}</span>` : "") +
    (i.novidadeEm && !i.revogado ? `<span class="mini-tag nov-tag" data-tip="Novidade legislativa (${fmtData(i.novidadeEm)}): mudou ou entrou na última conferência.">${icone("sparkles")} novidade</span>` : "") +
    (tipo === "juris" && i.ano ? `<span class="mini-tag ${anoVelho ? "ano-velho" : "ano-tag"}" data-tip="Entendimento de ${i.ano}.${anoVelho ? " Pode ser antigo — confira se ainda está mantido." : ""}">${anoVelho ? icone("alarm-clock") + " " : ""}${i.ano}</span>` : "") +
    (i.promovido ? `<span class="mini-tag" data-tip="Está na sua revisão espaçada (aba Estudar → Revisar).">${icone("brain")} revisando</span>` : "") +
    (i.tribunal ? `<span class="mini-tag trib-tag">${esc(i.tribunal)}</span>` : "") +
    (tipo === "juris" && i.categoria ? `<span class="mini-tag cat-tag">${esc(i.categoria)}</span>` : "");
  // Incidência inline (a "lente"): mini-barra + número quando marcada.
  const incHTML = i.pqIncidencia != null
    ? `<span class="ls-inc ${i.pqIncidencia >= 70 ? "alta" : i.pqIncidencia >= 40 ? "media" : "baixa"}" data-tip="Incidência ${i.pqIncidencia} — o quanto cai. Prioriza no Estudar."><span class="ls-inc-bar"><span style="width:${Math.max(8, Math.min(100, i.pqIncidencia))}%"></span></span>${i.pqIncidencia}</span>`
    : "";
  // Ação principal visível: ★ (marcar como o que mais cai) + grifar (se houver texto).
  const acaoPQ = `<button class="lnk-ic ${i.pq ? "on" : ""}" data-action="toggle-pq" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="${i.pq ? "É provável questão (o que mais cai). Clique para desmarcar." : "Marcar como provável questão (o que mais cai)."}">${icone("star")}</button>`;
  const acaoMarcar = i.texto
    ? `<button class="lnk-ic ${marcarAberto.has(i.id) ? "on" : ""}" data-action="toggle-marcar" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Grifar palavras-chave, prazos e termos restritivos.">${icone("square-pen")}</button>`
    : "";
  // Menu "⋯" LEAN: só organizar/gerenciar (nada de treino/geração — isso é da aba Estudar).
  const menu = [
    i.texto ? `<button class="lnk" data-action="ler-foco" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Ler em tela limpa, coluna estreita (~70 caracteres).">${icone("book-open")} Ler em foco</button>` : "",
    i.fonteUrl ? `<button class="lnk" data-action="abrir-fonte" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Abrir na fonte oficial (Planalto).">${icone("external-link")} Abrir no site oficial</button>` : "",
    i.texto && !i.promovido ? `<button class="lnk" data-action="promover-mem" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Entra na revisão espaçada (aba Estudar → Revisar). Continua aqui no Ler.">${icone("brain")} Marcar para revisar</button>` : "",
    i.promovido ? `<button class="lnk" data-action="despromover-mem" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Tirar da revisão espaçada. Continua no Ler.">${icone("brain")} Tirar da revisão</button>` : "",
    tipo === "juris" && (i.texto || "").length > 300 ? `<button class="lnk" data-action="quebrar-teses" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="A IA separa este informativo em teses individuais.">${icone("list-checks")} Quebrar em teses</button>` : "",
    tipo === "lei" ? `<button class="lnk" data-action="conferir-vigencia" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Marca que você conferiu a vigência hoje (o Mentor lembra quando faz muito tempo).">${icone("calendar-check")} Conferi a vigência</button>` : "",
    i.novidadeEm ? `<button class="lnk" data-action="limpar-novidade" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Já revisei esta novidade: remover o selo.">${icone("check")} Já vi a novidade</button>` : "",
    `<button class="lnk" data-action="editar" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Editar referência, vínculo e trecho.">${icone("square-pen")} Editar</button>`,
    i.revogado
      ? `<button class="lnk" data-action="reativar-rev" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Voltar ao estudo.">${icone("rotate-ccw")} Reativar</button>`
      : `<button class="lnk lnk-danger" data-action="marcar-rev" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="${tipo === "juris" ? "Cancelada/superada: sai do estudo e fica riscada." : "Revogado: sai do estudo e fica riscado."}">${icone("ban")} ${rotRev.acao}</button>`,
    `<button class="lnk lnk-danger" data-action="remover" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Remover este item.">${icone("x")} Remover</button>`,
  ].filter(Boolean).join("");
  const vinculos = vincMap ? (vincMap[i.id] || []) : store ? store.vinculosDaIndicacao(i.id) : [];
  const vincHTML = vinculos.length
    ? `<div class="ls-vinculos">${icone("link")} <span class="muted small">${tipo === "juris" ? "Interpreta" : "Relacionada"}:</span> ${vinculos.slice(0, 5).map((v) => `<button class="lnk ls-vinc-chip" data-action="ir-vinculo" data-id="${v.id}" data-tipo="${v.tipo}" data-tip="Abrir ${esc(v.referencia)}">${esc(v.referencia)}</button>`).join(" · ")}</div>`
    : "";
  return `
    <div class="card ls-item ${i.lido ? "lido" : ""} ${i.revogado ? "ls-revogado" : ""}" data-foco-id="${i.id}">
      <div class="ls-top">
        <input type="checkbox" data-action="toggle-lido" data-id="${i.id}" ${i.lido ? "checked" : ""} title="Marcar como lido" />
        <span class="ls-ref">${i.revogado || i.lido ? `<s>${esc(i.referencia)}</s>` : esc(i.referencia)}</span>
        ${incHTML}
        ${badges}
        <span class="spacer"></span>
        ${vinc}
        <div class="ls-acoes">
          ${acaoPQ}${acaoMarcar}
          <details class="ls-mais">
            <summary data-tip="Mais ações" title="Mais ações">${icone("ellipsis")}</summary>
            <div class="ls-mais-pop">${menu}</div>
          </details>
        </div>
      </div>
      ${i.texto && !marcarAberto.has(i.id) ? `<div class="ls-texto">${esc(i.texto)}</div>` : ""}
      ${i.texto && marcarAberto.has(i.id) ? `<div class="mk-host" data-mk-host="${i.id}"></div>` : ""}
      ${i.observacao ? `<div class="ls-obs muted small">${icone("notebook-pen")} ${esc(i.observacao)}</div>` : ""}
      ${vincHTML}
    </div>`;
}

function printLista(st, lista, r, comTrecho = true) {
  if (!lista.length) return "<p>Nenhum item.</p>";
  return lista
    .map((i) => {
      const topico = i.topicoId ? st.topicos.find((t) => t.id === i.topicoId) : null;
      const disc = topico ? st.disciplinas.find((d) => d.id === topico.disciplinaId) : i.disciplinaId ? st.disciplinas.find((d) => d.id === i.disciplinaId) : null;
      const vinc = topico ? nomeTopico(st, topico) : disc ? disc.nome : "Geral";
      const extra = [i.tribunal, i.categoria].filter(Boolean).join(" · ");
      return `<div class="print-item">[${i.lido && i.modo !== "memoria" ? "x" : " "}] <b>${esc(i.referencia)}</b>${extra ? ` <span class="print-meta">(${esc(extra)})</span>` : ""}
        ${comTrecho && i.texto ? `<div>${esc(i.texto)}</div>` : ""}
        <div class="print-meta">${esc(vinc)}</div></div>`;
    })
    .join("");
}

// ---------- helpers ----------
function topicoOptions(st, disciplinaId, selecionado) {
  const tops = st.topicos.filter((t) => !disciplinaId || t.disciplinaId === disciplinaId);
  return `<option value="">— sem tópico —</option>` + tops.map((t) => `<option value="${t.id}" ${t.id === selecionado ? "selected" : ""}>${esc(t.nome)}</option>`).join("");
}
function bindCascata(root, st, discSel, topSel) {
  const dEl = root.querySelector(discSel);
  const tEl = root.querySelector(topSel);
  if (!dEl || !tEl) return;
  dEl.addEventListener("change", () => {
    tEl.innerHTML = topicoOptions(st, dEl.value || "", null);
  });
}
function nomeTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
// Tribunais: os padrão + os que o usuário já digitou (campo livre). Alimentam o
// datalist de sugestões e as opções do filtro (o filtro "nasce" do que foi cadastrado).
function tribunaisDe(st) {
  return [...new Set([...TRIBUNAIS, ...st.indicacoes.filter((i) => i.tipo === "juris" && i.tribunal).map((i) => i.tribunal)])];
}
function datalistTribunais(st) {
  return `<datalist id="trib-list">${tribunaisDe(st).map((t) => `<option value="${esc(t)}"></option>`).join("")}</datalist>`;
}
// Seletor de tribunal: chips STF/STJ/TJSP + "Outro" (revela um campo livre). O <input> guarda o
// valor (mantém o id antigo, ex.: "add-trib", para as leituras existentes seguirem funcionando).
function tribunalPickerHTML(valor, inputId) {
  const v = (valor || "").trim();
  const ehCustom = v && !TRIBUNAIS.includes(v);
  return `<span class="trib-picker" data-trib-picker>
    ${TRIBUNAIS.map((t) => `<button type="button" class="chip-trib ${v === t ? "on" : ""}" data-trib-pick="${t}">${t}</button>`).join("")}
    <button type="button" class="chip-trib ${ehCustom ? "on" : ""}" data-trib-pick="__outro">Outro</button>
    <input type="text" id="${inputId}" class="trib-custom" placeholder="Ex.: TST, TRF-3, TJRJ" value="${esc(v)}" style="${ehCustom ? "" : "display:none"}" />
  </span>`;
}
// Liga os chips (delegação): seleciona o tribunal ou revela o campo "Outro". Dispara "input" no
// campo para que quem escuta (preview editável) atualize o valor.
function ligarTribunalPicker(root) {
  root.querySelectorAll("[data-trib-picker]").forEach((p) => {
    const input = p.querySelector(".trib-custom");
    p.querySelectorAll("[data-trib-pick]").forEach((b) =>
      b.addEventListener("click", () => {
        const val = b.getAttribute("data-trib-pick");
        p.querySelectorAll("[data-trib-pick]").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        if (val === "__outro") { input.style.display = ""; input.value = ""; input.focus(); }
        else { input.style.display = "none"; input.value = val; }
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })
    );
  });
}
// Sincroniza o seletor com um valor (ativa o chip certo ou "Outro" + mostra o campo).
function sincronizarTribPicker(input, valor) {
  const p = input.closest("[data-trib-picker]");
  if (!p) { input.value = valor || ""; return; }
  const v = (valor || "").trim();
  input.value = v;
  const custom = v && !TRIBUNAIS.includes(v);
  p.querySelectorAll("[data-trib-pick]").forEach((b) => {
    const bv = b.getAttribute("data-trib-pick");
    b.classList.toggle("on", custom ? bv === "__outro" : bv === v);
  });
  input.style.display = custom ? "" : "none";
}
// Seletor de CATEGORIA (juris) como chips (single-select), no mesmo idioma do seletor de tribunal.
// O valor fica num <input hidden> com o id antigo (ex.: "add-cat") p/ as leituras seguirem.
function categoriaPickerHTML(sel, inputId) {
  const v = sel || "";
  return `<span class="cat-picker" data-cat-picker>
    ${CATEGORIAS_JURIS.map((c) => `<button type="button" class="chip-trib ${v === c ? "on" : ""}" data-cat-pick="${esc(c)}">${esc(c)}</button>`).join("")}
    <input type="hidden" id="${inputId}" value="${esc(v)}" />
  </span>`;
}
function ligarCategoriaPicker(root) {
  root.querySelectorAll("[data-cat-picker]").forEach((p) => {
    const input = p.querySelector("input");
    p.querySelectorAll("[data-cat-pick]").forEach((b) =>
      b.addEventListener("click", () => {
        const val = b.getAttribute("data-cat-pick");
        const already = input.value === val;
        p.querySelectorAll("[data-cat-pick]").forEach((x) => x.classList.remove("on"));
        if (already) { input.value = ""; } else { b.classList.add("on"); input.value = val; }
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })
    );
  });
}
// Editar/excluir um tribunal PERSONALIZADO (os padrão TJSP/TRT/STJ/STF não são alterados).
// Aparece só quando um tribunal personalizado está selecionado no filtro.
function tribAdminHTML() {
  if (filtroTribunal === "todos" || TRIBUNAIS.includes(filtroTribunal)) return "";
  if (editandoTribunal === filtroTribunal) {
    return `<span class="trib-admin">
        <input id="trib-novo" type="text" value="${esc(filtroTribunal)}" style="width:130px" />
        <button class="lnk" data-action="trib-salvar">salvar</button>
        <button class="lnk" data-action="trib-cancelar-edit">cancelar</button>
      </span>`;
  }
  return `<span class="trib-admin">
      <button class="lnk" data-action="trib-editar" data-tip-pos="cima-dir" data-tip="Renomear este tribunal em todos os itens.">${icone("square-pen")} editar</button>
      <button class="lnk lnk-danger" data-action="trib-remover" data-tip-pos="cima-dir" data-tip="Remover este tribunal (os itens ficam sem tribunal).">${icone("trash-2")}</button>
    </span>`;
}
