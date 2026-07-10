// Lei Seca e Jurisprudência. Cada tela tem dois modos:
//  • META    — referência a CUMPRIR/LER (vira missão; ao concluir, sai da lista).
//  • MEMÓRIA — trecho GRAVADO para relembrar (banco de memória; não é tarefa).
// Vínculo opcional a disciplina/tópico (sem vínculo → Geral). Jurisprudência
// classifica tribunal (TJSP/STJ/STF) e categoria (súmula/tema/precedente).
// Permite importar (texto/PDF) e gerar flashcards/questões.
import { bindActions, toast, toastCarregando, header, confirmar, imprimir, botaoImprimir, opcoesImpressao, avisoIA, escolher, focarItem, pedirNumero, pedirTexto, abrirJanela, abrirJanelaFluxo, plural, comOcupado } from "../ui.js";
import { esc, todayISO } from "../util.js";
import { icone } from "../icones.js";
import { montarMarcacao } from "../marcacao.js";
import { filtroTopicosBotaoHTML, filtroTopicosPainelHTML, ligarFiltroTopicos, itemNoFiltro } from "./questoes-filtro.js";
import { S, parseIntervaloArt, rotulos, rotuloRevogado } from "./leiseca/estado.js";
import { CATEGORIAS_JURIS, tribunaisDe, tribAdminHTML, topicoOptions, bindCascata, tribunalPickerHTML, categoriaPickerHTML, ligarTribunalPicker, ligarCategoriaPicker } from "./leiseca/pickers.js";
import { garantirGrifoFlutuante, garantirPopoverMarca } from "./leiseca/grifo.js";
import { abrirLeituraFoco, abrirCompletarArtigo } from "./leiseca/foco.js";
import { garantirScrollSpy, garantirBarraAutoOculta, desligarBarraAutoOculta, abrirBuscaLei, abrirBuscaJuris, normaDeRef, numArtigo, nomeAmigavelLei, bibliotecaLeisHTML, leitorBarraHTML, lerCorpoHTML, ultimoInfoBadgeHTML, indiceJurisHTML, abrirRenomearLei, abrirPersonalizarBarra, acaoGrifarAuto, acaoGrifarIA, acaoClassificarTemas, acaoRefinarTemasIA, acaoLimparGrifos, abrirMarcarLidoBloco, abrirEditarTemas, animarFlagsLeitor } from "./leiseca/leitor.js";
import { estudarCorpoHTML } from "./leiseca/estudar.js";
import { metasCorpoHTML, abrirNovaMeta, abrirQuebrarMeta, abrirImportarMetas } from "./leiseca/metas.js";
import { abrirImportarLei, abrirConferirAtualizacao, abrirAdicionarIndicacao, abrirMarcarPQ } from "./leiseca/importar.js";
import { imprimirLeiHTML, imprimirLeiContexto, printLista, acaoImprimirGrifos } from "./leiseca/impressao.js";

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

export function renderLeiSeca(root, app) {
  return renderIndicacoes(root, app, "lei");
}
export function renderJurisprudencia(root, app) {
  return renderIndicacoes(root, app, "juris");
}


function renderIndicacoes(root, app, tipo) {
  const { store } = app;
  const st = store.get();
  // O recorte de estudo é POR MÓDULO: ao trocar de Lei Seca ↔ Jurisprudência, zera o recorte
  // (senão um Tema escolhido num módulo zeraria silenciosamente o estudo do outro — S.estudarTemaSel é compartilhado).
  if (S._escopoTipo !== tipo) {
    S._escopoTipo = tipo;
    S.estudarLeiSel = null; S.estudarSecaoSel = null; S.estudarArtFiltro = ""; S.estudarTemaSel = null;
    S.estudarJurisTrib = null; S.estudarJurisRamo = null; S.estudarJurisAssunto = null; S.estudarJurisCat = null;
  }
  S._nomesLeis = st.config.nomesLeis || {}; // apelidos de lei (rename) p/ o nomeAmigavelLei
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
      S.modoAtivo[tipo] = ehMeta(alvo) ? "metas" : "ler"; // a letra e os promovidos vivem no Ler
      S.filtroTop[tipo].sel = [];
      S.leiFiltro.lei = null; // não deixar um filtro de marcação esconder o artigo alvo (só a lei tem leitor)
      if (tipo === "lei" && !ehMeta(alvo)) { const nn = normaDeRef(alvo.referencia); if (nn) S.leiAtiva.lei = nn; } // abre a lei certa
      if (tipo === "juris") { S.filtroTribunal = "todos"; S.filtroCategoria = "todas"; S.filtroRamo = "todos"; S.filtroAssunto = "todos"; S.filtroStatus = "todos"; }
    }
  }
  // Abrir a marcação direto (vindo do dossiê de marcações).
  if (app.params && app.params.marcarId) {
    S.marcarAberto.add(app.params.marcarId);
    app.params.marcarId = null;
  }
  // Abrir numa aba específica (Mentor/atalhos). Modelo v4 = 3 abas: ler · estudar · metas.
  // Compat com nomes antigos: acervo/meta→ler; memorizar/treinar/raiox→estudar; memoria→estudar.
  if (app.params && app.params.aba) {
    const a = app.params.aba;
    app.params.aba = null;
    if (["ler", "estudar", "metas"].includes(a)) S.modoAtivo[tipo] = a;
    else if (a === "acervo" || a === "meta") S.modoAtivo[tipo] = "ler";
    else if (["memorizar", "treinar", "raiox", "memoria"].includes(a)) S.modoAtivo[tipo] = "estudar";
  }
  if (!["ler", "estudar", "metas"].includes(S.modoAtivo[tipo])) S.modoAtivo[tipo] = "ler";
  const modo = S.modoAtivo[tipo];

  const todasDoTipo = st.indicacoes.filter((i) => i.tipo === tipo);
  const statusDe = (i) => (i.revogado || i.status === "superado") ? "superado" : (i.status || "vigente");
  const passaFiltro = (i) =>
    itemNoFiltro(st, i, S.filtroTop[tipo].sel) &&
    (tipo !== "juris" || S.filtroTribunal === "todos" || i.tribunal === S.filtroTribunal) &&
    (tipo !== "juris" || S.filtroCategoria === "todas" || i.categoria === S.filtroCategoria) &&
    (tipo !== "juris" || S.filtroRamo === "todos" || i.ramo === S.filtroRamo) &&
    (tipo !== "juris" || S.filtroAssunto === "todos" || i.assunto === S.filtroAssunto) &&
    (tipo !== "juris" || S.filtroStatus === "todos" || statusDe(i) === S.filtroStatus);

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

  // Leitor (F1a): uma lei por vez. Normas de lei disponíveis + lei ativa (a Jurisprudência não vira leitor).
  const normasLei = tipo === "lei" ? [...new Set(todasDoTipo.filter(ehLetra).map((i) => normaDeRef(i.referencia) || "Outros"))].sort() : [];
  // Minhas Leis: por padrão a Lei Seca ABRE na biblioteca (S.leiAtiva.lei = null). Só entra no leitor
  // quando o usuário escolhe uma lei (ou "continuar"). Se a lei ativa foi removida, volta à biblioteca.
  if (tipo === "lei" && S.leiAtiva.lei && !normasLei.includes(S.leiAtiva.lei)) S.leiAtiva.lei = null;
  const modoLeitor = tipo === "lei" && modo === "ler" && !!S.leiAtiva.lei;
  const mostrarBiblioteca = tipo === "lei" && modo === "ler" && !S.leiAtiva.lei && normasLei.length > 0;
  const listaLerFinal = modoLeitor ? listaLer.filter((i) => (normaDeRef(i.referencia) || "Outros") === S.leiAtiva.lei) : listaLer;
  // Filtro do leitor (estatísticas clicáveis): grifos/anotações vêm das marcações; demais das flags.
  const marcasLei = modoLeitor ? st.marcacoes.filter((m) => m.alvoTipo === "indicacao") : [];
  const comGrifo = new Set(marcasLei.filter((m) => m.cor !== "comentario").map((m) => m.alvoId));
  const comNota = new Set(marcasLei.filter((m) => m.cor === "comentario").map((m) => m.alvoId));
  const passaFiltroLei = (i) => {
    const f = S.leiFiltro.lei;
    if (!f) return true;
    if (f === "lido") return i.lido;
    if (f === "favorito") return i.favorito;
    if (f === "dificil") return i.dificil;
    if (f === "grifo") return comGrifo.has(i.id);
    if (f === "anotacao") return comNota.has(i.id);
    if (f === "pq") return !!i.pq || (i.pqIncidencia || 0) > 0;
    return true;
  };
  const listaLerVisivel = modoLeitor && S.leiFiltro.lei ? listaLerFinal.filter(passaFiltroLei) : listaLerFinal;

  root.innerHTML = `
    ${header(r.titulo, `${lerN} ${lerN === 1 ? r.item : r.itemPlural}${metasN ? ` · ${plural(metasN, "meta", "metas")}` : ""}${revN ? ` · ${revN} para revisar` : ""}`, botaoImprimir())}

    <details class="ed-ajuda">
      <summary>Como funciona ${tipo === "juris" ? "a Jurisprudência" : "a Lei Seca"}?</summary>
      <div class="ed-ajuda-corpo">
        <p>Três abas, cada uma um passo: <b>Ler</b> (a letra), <b>Estudar</b> (praticar) e <b>Metas</b> (planejar).</p>
        <p>${icone("book-open")} <b>Ler</b> — a lista com o <b>texto</b> ${tipo === "juris" ? "das súmulas/teses" : "dos artigos"}. Aqui você lê, <b>grifa</b>, marca o que mais cai com a <b>★</b> (a <b>incidência</b> aparece numa mini-barra no item) e <b>importa</b>${tipo === "juris" ? " (colar o texto/informativo ou PDF)" : " (a letra oficial do Planalto/colando — detecta o revogado — ou uma lista/PDF)"}.${tipo === "lei" ? " Em <b>Conferir atualização</b>, o app compara com a fonte e mostra o que <b>mudou/entrou/foi revogado</b> (selo de novidade)." : ""}</p>
        <p>${icone("target")} <b>Estudar</b> — em tela cheia: <b>Certo/Errado</b>, <b>Completar a letra</b>, <b>Revisar o que vence</b> e <b>Refazer erros</b>${tipo === "juris" ? ", além da <b>Súmula-duelo</b> (número/tribunal trocado)" : ""}. Escolha o <b>escopo</b> (tudo ou o que mais cai); um clique já começa no padrão e, em <b>Opções…</b>, você ajusta <b>quantidade e dificuldade</b> — dá ainda para gerar <b>flashcards</b> e <b>questões</b>.</p>
        <p>${icone("calendar-check")} <b>Metas</b> — planeje a leitura. No topo, uma linha resume seu <b>progresso</b>, <b>ritmo</b> e <b>previsão de conclusão</b> (as metas do dia e as revisões vivem no <b>Planejamento</b>). Crie metas (ex.: "ler ${tipo === "juris" ? "os informativos 810–815" : "art. 1º a 20"}") que viram <b>tarefa no Planejamento</b>, mostram o <b>progresso</b> quando dá para medir, e podem ser <b>divididas em etapas</b> ou <b>importadas de um cronograma</b>.</p>
      </div>
    </details>

    <div class="seg u-mb-16" role="tablist">
      <button class="${modo === "ler" ? "on" : ""}" data-action="modo" data-modo="ler" data-tip="A letra: ler, grifar e organizar cada dispositivo. É o seu acervo.">${icone("book-open")}<span class="seg-txt">Ler</span></button>
      <button class="${modo === "estudar" ? "on" : ""}" data-action="modo" data-modo="estudar" data-tip="Fazer: Certo/Errado, completar a letra, revisar o que vence e refazer erros — em tela cheia.">${icone("target")}<span class="seg-txt">Estudar</span>${revN ? `<span class="seg-badge seg-badge-due">${revN}</span>` : ""}</button>
      <button class="${modo === "metas" ? "on" : ""}" data-action="modo" data-modo="metas" data-tip="Planejar a leitura: metas por nome (ex.: 'ler art. 1º a 20'), importáveis, que viram tarefa.">${icone("calendar-check")}<span class="seg-txt">Metas</span>${metasPend ? `<span class="seg-badge">${metasPend}</span>` : ""}</button>
    </div>

    <div class="barra-acoes">
      ${modo === "ler" && !mostrarBiblioteca ? `<button class="btn btn-add btn-sm" data-action="importar" data-tip-pos="cima-esq" data-tip="${tipo === "lei" ? "Trazer a lei: do site oficial (Planalto), colando o texto, ou de um PDF." : "Trazer súmulas/teses: colando o texto/informativo ou de um PDF."}">${icone("download")} Importar</button>` : ""}
      ${tipo === "lei" && modo === "ler" && !modoLeitor && !mostrarBiblioteca && store.normasComFonte("lei").length ? `<button class="btn btn-ghost btn-sm" data-action="conferir-atualizacao" data-tip-pos="cima-esq" data-tip="Recompara com a fonte oficial e mostra o que mudou, entrou ou foi revogado. Você decide o que aplicar.">${icone("refresh-cw")} Conferir atualização</button>` : ""}
      ${modo === "ler" && !modoLeitor && !mostrarBiblioteca ? `<button class="btn btn-ghost btn-sm" data-action="toggle-pq-import" data-tip-pos="cima-esq" data-tip="Marque o que mais cai (incidência): a IA sugere ou você importa uma estatística.">${icone("star")} O que mais cai</button>` : ""}
      ${modo === "ler" && !modoLeitor && !mostrarBiblioteca && tipo === "juris" && st.indicacoes.some((i) => i.tipo === "juris" && (i.texto || "").trim().length >= 10) ? `<button class="btn btn-ghost btn-sm" data-action="buscar-juris" data-tip-pos="cima-esq" data-tip="Buscar nas súmulas e teses por palavra, tribunal, número ou significado (IA).">${icone("search")} Buscar</button>` : ""}
      ${modo === "metas" ? `<button class="btn btn-add btn-sm" data-action="nova-meta" data-tip-pos="cima-esq" data-tip="Criar uma meta de leitura (ex.: 'ler art. 1º a 20'). Dá para dividir em etapas; vira tarefa no Planejamento.">${icone("calendar-check")} Nova meta</button>` : ""}
      ${modo === "metas" ? `<button class="btn btn-ghost btn-sm" data-action="importar-metas" data-tip-pos="cima-esq" data-tip="Importar um cronograma/tabela de metas de leitura (colar ou PDF). Cada linha vira uma meta.">${icone("download")} Importar metas</button>` : ""}
      <span class="spacer"></span>
      ${modo === "ler" && !modoLeitor && !mostrarBiblioteca && novidadesN ? `<button class="btn ${S.lerFiltroNov[tipo] ? "btn-soft" : "btn-ghost"} btn-sm" data-action="filtro-novidades" data-tip-pos="cima-dir" data-tip="Mostrar só os dispositivos com novidade legislativa (mudaram/entraram na última conferência).">${icone("file-clock")} Novidades <span class="mini-tag nov-tag">${novidadesN}</span></button>` : ""}
      ${modo !== "estudar" && !mostrarBiblioteca && tipo !== "juris" ? filtroTopicosBotaoHTML(st, S.filtroTop[tipo].sel, S.filtroTop[tipo].aberto) : ""}
      ${
        tipo === "juris" && modo === "ler"
          ? `<span class="ls-fpill ${S.filtroTribunal !== "todos" ? "on" : ""}"><span class="ls-fpill-lbl">Tribunal</span>
              <select class="ls-fpill-sel" id="f-trib">
                <option value="todos" ${S.filtroTribunal === "todos" ? "selected" : ""}>Todos</option>
                ${tribunaisDe(st).map((t) => `<option value="${esc(t)}" ${S.filtroTribunal === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
              </select></span>${tribAdminHTML()}
             <span class="ls-fpill ${S.filtroCategoria !== "todas" ? "on" : ""}"><span class="ls-fpill-lbl">Tipo</span>
              <select class="ls-fpill-sel" id="f-cat">
                <option value="todas" ${S.filtroCategoria === "todas" ? "selected" : ""}>Todos</option>
                ${CATEGORIAS_JURIS.map((c) => `<option value="${esc(c)}" ${S.filtroCategoria === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
              </select></span>
             ${(() => { const ramos = [...new Set(st.indicacoes.filter((i) => i.tipo === "juris" && i.ramo).map((i) => i.ramo))].sort(); return ramos.length ? `<span class="ls-fpill ${S.filtroRamo !== "todos" ? "on" : ""}"><span class="ls-fpill-lbl">Ramo</span>
              <select class="ls-fpill-sel" id="f-ramo">
                <option value="todos" ${S.filtroRamo === "todos" ? "selected" : ""}>Todos</option>
                ${ramos.map((rm) => `<option value="${esc(rm)}" ${S.filtroRamo === rm ? "selected" : ""}>${esc(rm)}</option>`).join("")}
              </select></span>` : ""; })()}
             <span class="ls-fpill ${S.filtroStatus !== "todos" ? "on" : ""}"><span class="ls-fpill-lbl">Vigência</span>
              <select class="ls-fpill-sel" id="f-status">
                <option value="todos" ${S.filtroStatus === "todos" ? "selected" : ""}>Todas</option>
                <option value="vigente" ${S.filtroStatus === "vigente" ? "selected" : ""}>Vigentes</option>
                <option value="importante" ${S.filtroStatus === "importante" ? "selected" : ""}>Importantes</option>
                <option value="superado" ${S.filtroStatus === "superado" ? "selected" : ""}>Superadas</option>
              </select></span>`
          : ""
      }
    </div>
    ${modo !== "estudar" && tipo !== "juris" ? filtroTopicosPainelHTML(st, S.filtroTop[tipo].sel, S.filtroTop[tipo].aberto) : ""}
    ${tipo === "juris" && modo === "ler" && !modoLeitor ? ultimoInfoBadgeHTML(st) : ""}

    ${mostrarBiblioteca ? bibliotecaLeisHTML(st, store, normasLei) : ""}

    ${modoLeitor ? leitorBarraHTML(st, store, S.leiAtiva.lei, normasLei, listaLerFinal, { comGrifo, comNota, filtro: S.leiFiltro.lei }) : ""}

    ${tipo === "juris" && modo === "ler" && !modoLeitor ? `<div class="juris-layout">${indiceJurisHTML(st)}<div class="juris-main">` : ""}
    ${mostrarBiblioteca ? "" : `<div class="lista-leiseca"${modoLeitor ? ` data-ler-fonte="${(st.config.leitura || {}).fonte || "inter"}" data-ler-tam="${(st.config.leitura || {}).tamanho || "media"}" data-ler-esp="${(st.config.leitura || {}).espacamento || "normal"}" data-ler-align="${(st.config.leitura || {}).align || "esquerda"}" data-ler-tema="${(st.config.leitura || {}).tema || "auto"}"` : ""}>
      ${
        modo === "estudar" ? estudarCorpoHTML(store, st, tipo, r)
        : modo === "metas" ? metasCorpoHTML(st, tipo, listaMetas, r, store)
        : lerCorpoHTML(st, tipo, S.lerFiltroNov[tipo] ? listaLerVisivel.filter((i) => i.novidadeEm) : listaLerVisivel, r, store, vincMap, modoLeitor, modoLeitor ? S.leiFiltro.lei : null)
      }
    </div>`}
    ${tipo === "juris" && modo === "ler" && !modoLeitor ? `</div></div>` : ""}
    ${modoLeitor ? `<button class="ler-continuar-pill" data-action="ler-continuar" hidden>${icone("corner-down-right")} Continuar de onde parou<span class="lcp-art"></span></button>` : ""}`;

  // filtros
  ligarFiltroTopicos(root, app, S.filtroTop[tipo]);
  root.querySelector("#f-trib")?.addEventListener("change", (e) => {
    S.filtroTribunal = e.target.value;
    app.refresh();
  });
  root.querySelector("#f-cat")?.addEventListener("change", (e) => {
    S.filtroCategoria = e.target.value;
    app.refresh();
  });
  root.querySelector("#f-ramo")?.addEventListener("change", (e) => { S.filtroRamo = e.target.value; app.refresh(); });
  root.querySelector("#f-status")?.addEventListener("change", (e) => { S.filtroStatus = e.target.value; app.refresh(); });
  // Leitor (F1a): trocar de lei + "ir para artigo".
  root.querySelector("#ler-norma")?.addEventListener("change", (e) => { S.leiAtiva.lei = e.target.value; app.refresh(); });
  // Estudar: seletor de escopo/objeto (lei + seção estrutural) — via change (não fecha o dropdown).
  root.querySelector('[data-action="escopo-lei"]')?.addEventListener("change", (e) => { S.estudarLeiSel = e.target.value; S.estudarSecaoSel = null; S.estudarArtFiltro = ""; S.estudarTemaSel = null; app.refresh(); });
  root.querySelector('[data-action="escopo-secao"]')?.addEventListener("change", (e) => { S.estudarSecaoSel = e.target.value || null; app.refresh(); });
  root.querySelector('[data-action="escopo-art"]')?.addEventListener("change", (e) => { S.estudarArtFiltro = e.target.value.trim(); app.refresh(); });
  root.querySelector('[data-action="escopo-tema"]')?.addEventListener("change", (e) => { S.estudarTemaSel = e.target.value || null; app.refresh(); });
  // C.2.4 — recorte de estudo da juris (ramo muda → zera assunto, cascata).
  root.querySelector('[data-action="escopo-j-trib"]')?.addEventListener("change", (e) => { S.estudarJurisTrib = e.target.value || null; app.refresh(); });
  root.querySelector('[data-action="escopo-j-ramo"]')?.addEventListener("change", (e) => { S.estudarJurisRamo = e.target.value || null; S.estudarJurisAssunto = null; app.refresh(); });
  root.querySelector('[data-action="escopo-j-assunto"]')?.addEventListener("change", (e) => { S.estudarJurisAssunto = e.target.value || null; app.refresh(); });
  root.querySelector('[data-action="escopo-j-cat"]')?.addEventListener("change", (e) => { S.estudarJurisCat = e.target.value || null; app.refresh(); });
  root.querySelector("#ler-goto")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const n = parseInt(e.target.value, 10);
    if (!n) return;
    const alvo = st.indicacoes.find((i) => i.tipo === tipo && (normaDeRef(i.referencia) || "") === S.leiAtiva.lei && numArtigo(i.referencia) === n);
    if (alvo) app.navigate("leiseca", { focoIndicacaoId: alvo.id });
    else toast(`Art. ${n} não encontrado em ${S.leiAtiva.lei}.`, "erro");
  });
  // F2/detalhes: menu flutuante de grifo/IA + popover de marca — na tela toda (Fase 5, grifo
  // único): vale no leitor E nos cards com texto (juris/metas), que grifam pelo gesto de seleção.
  S._leitorCtx = { store, app, norma: modoLeitor ? S.leiAtiva.lei : null };
  garantirGrifoFlutuante(); garantirPopoverMarca();
  // Rastreio de posição de leitura / barra auto-oculta: só no leitor.
  if (modoLeitor) {
    garantirScrollSpy(root); garantirBarraAutoOculta(root);
    // #5 V2: persistir o recolhimento das seções do índice. O evento "toggle" NÃO borbulha → captura.
    // IMPORTANTE: o Chrome DISPARA "toggle" ao inserir cada <details open> no render; se gravássemos
    // sempre, viraria commit→render→toggle→commit… (loop). Então só grava se o estado MUDOU de fato.
    root.querySelector(".lista-leiseca")?.addEventListener("toggle", (e) => {
      const d = e.target;
      if (!d || !d.classList || !d.classList.contains("ls-estr") || S._indiceColapsado) return;
      const key = d.getAttribute("data-estr-key"); if (!key) return;
      const map = { ...((store.get().config.leitura || {}).indiceFechado || {}) };
      const set = new Set(map[S.leiAtiva.lei] || []);
      if (d.open === !set.has(key)) return; // já bate com o salvo (ex.: toggle disparado no render) → ignora
      if (d.open) set.delete(key); else set.add(key);
      map[S.leiAtiva.lei] = [...set];
      store.setLeitura({ indiceFechado: map });
    }, true);
  } else desligarBarraAutoOculta(); // saiu do leitor (biblioteca/estudar/metas): solta o handler de scroll
  focarItem(root, focoInd);

  // Escopo do Estudar: itens com texto (tudo, ou só o top 20% de incidência).
  // Escopo/objeto do estudo: lei escolhida (ou a ativa) + seção estrutural opcional + intensidade.
  const noEscopoEstudo = (i) => {
    if (tipo !== "lei") { // C.2.4: juris filtra por tribunal/ramo/assunto/categoria/tema
      if (S.estudarJurisTrib && String(i.tribunal || "") !== S.estudarJurisTrib) return false;
      if (S.estudarJurisRamo && String(i.ramo || "") !== S.estudarJurisRamo) return false;
      if (S.estudarJurisAssunto && String(i.assunto || "") !== S.estudarJurisAssunto) return false;
      if (S.estudarJurisCat && String(i.categoria || "") !== S.estudarJurisCat) return false;
      if (S.estudarTemaSel && !(Array.isArray(i.temas) && i.temas.includes(S.estudarTemaSel))) return false;
      return true;
    }
    const leiSel = S.estudarLeiSel || S.leiAtiva.lei;
    if (leiSel && leiSel !== "todas" && normaDeRef(i.referencia) !== leiSel) return false;
    if (S.estudarSecaoSel && !(Array.isArray(i.estrutura) && i.estrutura.some((n) => n.rotulo + "|" + (n.titulo || "") === S.estudarSecaoSel))) return false;
    const ar = parseIntervaloArt(S.estudarArtFiltro);
    if (ar) { const nn = numArtigo(i.referencia); if (nn < ar.de || nn > ar.ate) return false; }
    if (S.estudarTemaSel && !(Array.isArray(i.temas) && i.temas.includes(S.estudarTemaSel))) return false;
    return true;
  };
  const escopoItens = () => {
    let arr = todasDoTipo.filter((i) => !i.metaLeitura && !i.revogado && (i.texto || "").trim() && passaFiltro(i) && noEscopoEstudo(i));
    if (S.estudarEscopo[tipo] === "incidencia") {
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
    // Progresso narrado: a geração itera artigo a artigo (lenta); o rótulo do toast é
    // atualizado a cada item — e o corte de 12 é avisado ANTES, não depois.
    const fim = toastCarregando(opts.regenerate && itens.length > 12 ? "Gerando Certo/Errado… (limite de 12 por vez)" : "Preparando o treino…");
    let fila = [];
    try {
      let i = 0;
      for (const it of alvo) {
        i++;
        let q = store.itensTreinoDeIndicacao(it.id);
        if (opts.regenerate || !q.length) {
          if (!store.iaDisponivel()) return avisoIA(app, "Gerar treino");
          if (opts.regenerate) store.limparTreinoDeIndicacao(it.id);
          fim(`Gerando Certo/Errado… ${i}/${alvo.length}`);
          try { q = await store.gerarTreinoDeIndicacao(it.id, opts.n || 4, opts.dificuldade || "medio"); } catch (e) { console.error(e); }
        }
        fila = fila.concat(q.map((x) => x.id));
      }
    } finally { fim(); }
    if (!fila.length) return toast("Não consegui montar o treino agora.", "erro");
    app.navigate("pratica-ce", { focoErrosIds: fila });
  };

  // Gera flashcards do escopo (IA). Chamado com o padrão (1 clique) ou com o que o usuário
  // escolheu em "Opções…". Mantém o progresso narrado e o corte de 12 avisado ANTES.
  const gerarFlashcardsEscopo = async (el, n, dificuldade) => {
    if (!store.iaDisponivel()) return avisoIA(app, "Gerar flashcards"); // "Gerar com IA" exige IA (igual questões)
    const itens = escopoItens();
    if (!itens.length) return toast("Adicione o texto dos artigos na aba Ler primeiro.", "erro");
    const alvo = itens.slice(0, 12);
    const rot = `da ${nomeAmigavelLei(S.estudarLeiSel || S.leiAtiva.lei)}`;
    const lote = store.iniciarLoteGeracao(rot);
    const fim = toastCarregando(itens.length > 12 ? "Gerando flashcards com IA… (limite de 12 por vez)" : "Gerando flashcards com IA…");
    if (el) { el.classList.add("carregando"); el.disabled = true; el.setAttribute("aria-busy", "true"); }
    let total = 0;
    try {
      let i = 0;
      for (const it of alvo) { fim(`Gerando flashcards com IA… ${++i}/${alvo.length}`); try { const cs = await store.gerarFlashcardsIADeIndicacao(it.id, n, dificuldade); total += cs.length; } catch (e) { console.error(e); } }
    } finally {
      fim();
      if (el) { el.classList.remove("carregando"); el.disabled = false; el.removeAttribute("aria-busy"); }
      store.encerrarLoteGeracao();
    }
    toast(total ? `${plural(total, "flashcard gerado", "flashcards gerados")}${itens.length > 12 ? " (12 primeiros do escopo)" : ""}.` : "A IA não retornou flashcards.", total ? "ok" : "erro");
    if (total) app.navigate("flashcards", { lote, loteRotulo: rot }); // abre mostrando só os recém-gerados
  };
  // Gera questões de múltipla escolha do escopo (IA) — mesmo padrão dos flashcards.
  const gerarQuestoesEscopo = async (el, n, dificuldade) => {
    if (!store.iaDisponivel()) return avisoIA(app, "Gerar questões");
    const itens = escopoItens();
    if (!itens.length) return toast("Adicione o texto dos artigos na aba Ler primeiro.", "erro");
    const alvo = itens.slice(0, 12); // limita p/ não estourar a cota de IA
    const rot = `da ${nomeAmigavelLei(S.estudarLeiSel || S.leiAtiva.lei)}`;
    const lote = store.iniciarLoteGeracao(rot);
    const fim = toastCarregando(itens.length > 12 ? "Gerando questões com IA… (limite de 12 por vez)" : "Gerando questões de múltipla escolha com IA…");
    if (el) { el.classList.add("carregando"); el.disabled = true; el.setAttribute("aria-busy", "true"); }
    let total = 0;
    try {
      let i = 0;
      for (const it of alvo) { fim(`Gerando questões com IA… ${++i}/${alvo.length}`); try { const qs = await store.gerarQuestoesDeIndicacao(it.id, n, dificuldade, "mc"); total += qs.length; } catch (e) { console.error(e); } }
    } finally {
      fim();
      if (el) { el.classList.remove("carregando"); el.disabled = false; el.removeAttribute("aria-busy"); }
      store.encerrarLoteGeracao();
    }
    toast(total ? `${plural(total, "questão gerada", "questões geradas")}${itens.length > 12 ? " (12 primeiros do escopo)" : ""}.` : "A IA não retornou questões. Confira se os artigos têm texto.", total ? "ok" : "erro");
    if (total) app.navigate("pratica", { lote, loteRotulo: rot }); // abre mostrando só as recém-geradas
  };

  // Painel de REVISÃO de marcas nos itens abertos (Fase 5: semPinceis — só os modos Texto/
  // Só marcas/Recordar + ⋯ Auto/IA/limpar/imprimir; grifar é pelo gesto de seleção).
  root.querySelectorAll("[data-mk-host]").forEach((host) => {
    const id = host.getAttribute("data-mk-host");
    const item = st.indicacoes.find((x) => x.id === id);
    if (item && item.texto) {
      montarMarcacao(host, { store, alvoTipo: "indicacao", alvoId: id, texto: item.texto, topicoId: item.topicoId, tituloFonte: item.referencia, semPinceis: true });
    }
  });

  // marcar lido
  root.querySelectorAll('[data-action="toggle-lido"]').forEach((el) =>
    el.addEventListener("change", () => store.toggleIndicacaoLida(el.getAttribute("data-id")))
  );

  bindActions(root, {
    imprimir: async () => {
      // Com uma lei aberta no leitor, o Imprimir é CONTEXTUAL (lei inteira / filtro / grifados;
      // crua ou com grifos). Fora do leitor, as opções seguem o modelo ATUAL (v4): a letra
      // (toda ou só o que mais cai), as metas de leitura e, na Jurisprudência, o filtro da tela.
      if (modoLeitor) return imprimirLeiContexto(store, S.leiAtiva.lei, listaLerFinal, listaLerVisivel, S.leiFiltro.lei);
      const letras = todasDoTipo.filter((i) => ehLetra(i) && !i.revogado);
      const pqs = letras.filter((i) => !!i.pq || (i.pqIncidencia || 0) > 0).sort(porIncidencia);
      const metas = todasDoTipo.filter(ehMeta).sort((a, b) => (a.lido === b.lido ? (a.criadoEm < b.criadoEm ? 1 : -1) : a.lido ? 1 : -1));
      if (!letras.length && !metas.length) return toast("Nada para imprimir ainda.", "erro");
      // Na Jurisprudência a lista da tela obedece aos filtros (tribunal/tipo/ramo/tópico…).
      const jurisTela = tipo === "juris" ? listaLer.filter((i) => !i.revogado) : [];
      const filtroJurisAtivo = tipo === "juris" && jurisTela.length !== letras.length;
      const escopoOpts = [];
      if (letras.length) {
        if (filtroJurisAtivo) escopoOpts.push({ v: "tela", rot: `Jurisprudência do filtro atual (${jurisTela.length})` });
        escopoOpts.push({ v: "todos", rot: tipo === "juris" ? `Toda a jurisprudência (${letras.length})` : `Todos os artigos (${letras.length})` });
      }
      if (pqs.length) escopoOpts.push({ v: "pq", rot: `Apenas o que mais cai (${pqs.length})` });
      if (metas.length) escopoOpts.push({ v: "metas", rot: `Metas de leitura (${metas.length})` });
      const op = await opcoesImpressao(`Imprimir ${r.titulo.toLowerCase()}`, [
        { key: "escopo", label: "O que imprimir", opcoes: escopoOpts, def: escopoOpts[0].v },
        { key: "trecho", label: "Conteúdo", opcoes: [{ v: "com", rot: "Com o texto" }, { v: "sem", rot: "Só as referências" }], def: "com" },
      ]);
      if (!op) return;
      if (op.escopo === "metas")
        return imprimir(`${r.titulo} — metas de leitura`, `<h2>Metas de leitura</h2>` + printLista(st, metas, r, op.trecho === "com"));
      const sel = op.escopo === "pq" ? pqs : op.escopo === "tela" ? jurisTela : letras;
      if (!sel.length) return toast("Nada para imprimir neste escopo.", "erro");
      const titulo = op.escopo === "pq" ? `${r.titulo} — o que mais cai` : `${r.titulo} — Mentor Concurso`;
      // Lei com texto: agrupa por norma e usa o MESMO formato do leitor (artigos em ordem).
      if (tipo === "lei" && op.trecho === "com") {
        const normas = [...new Set(sel.map((i) => normaDeRef(i.referencia) || "Outros"))].sort();
        const html = normas.map((n) => `<h2>${esc(nomeAmigavelLei(n))}</h2>` + imprimirLeiHTML(store, sel.filter((i) => (normaDeRef(i.referencia) || "Outros") === n), n)).join("");
        return imprimir(titulo, html, { cls: "pa-lei" });
      }
      imprimir(titulo, printLista(st, sel, r, op.trecho === "com"));
    },
    modo: (el) => {
      S.modoAtivo[tipo] = el.getAttribute("data-modo");
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
    // Fase 6 — índice de busca semântica DENTRO do módulo (Lei Seca/Jurisprudência), não mais em Materiais.
    "abrir-indice": () => { if (!store.iaDisponivel()) return avisoIA(app, "Busca por significado"); abrirIndiceModulo(app, tipo); },
    "buscar-juris": () => { const juris = st.indicacoes.filter((i) => i.tipo === "juris" && (i.texto || "").trim()); if (!juris.length) return toast("Importe súmulas/teses antes de buscar.", "erro"); abrirBuscaJuris(app, store, juris); },
    // Minhas Leis — abrir uma lei do card, voltar à biblioteca, ou continuar de onde parou.
    "abrir-lei": (el) => { S.leiAtiva.lei = el.getAttribute("data-norma"); S.leiFiltro.lei = null; app.refresh(); },
    "voltar-biblioteca": () => { S.leiAtiva.lei = null; S.leiFiltro.lei = null; app.refresh(); },
    "continuar-leitura": () => {
      const ul = store.get().config.ultimaLeitura || {};
      const cand = normasLei.filter((n) => ul[n] && ul[n].em).sort((a, b) => (ul[a].em < ul[b].em ? 1 : -1));
      const n = cand[0];
      if (!n) return toast("Você ainda não começou a ler nenhuma lei.", "erro");
      S.leiAtiva.lei = n;
      S.leiFiltro.lei = null;
      const artId = ul[n].indicacaoId;
      if (artId) app.navigate("leiseca", { focoIndicacaoId: artId });
      else app.refresh();
    },
    "filtro-novidades": () => { S.lerFiltroNov[tipo] = !S.lerFiltroNov[tipo]; app.refresh(); },
    "conferir-atualizacao": () => abrirConferirAtualizacao(app),
    "art-temas": (el) => abrirEditarTemas(app, el.getAttribute("data-id")), // F3: editar temas do artigo
    "art-nota": async (el) => { // #4: nota livre do artigo (não ancorada a grifo)
      const id = el.getAttribute("data-id");
      const ind = st.indicacoes.find((i) => i.id === id); if (!ind) return;
      const v = await pedirTexto("Nota deste artigo", { valor: ind.observacao || "", placeholder: "lembrete, ressalva, macete (ex.: cai muito; decorar os prazos)", rotuloOk: "Salvar", multilinha: true });
      if (v === null) return;
      store.editarIndicacao(id, { observacao: v.trim() });
      toast(v.trim() ? "Nota salva." : "Nota removida.", "ok");
    },
    "ler-cap-lido": (el) => { // #9: marca/desmarca todos os artigos do capítulo como lidos
      const ids = (el.getAttribute("data-ids") || "").split(",").filter(Boolean);
      const concl = el.getAttribute("data-concl") === "1";
      const n = store.marcarLidosIds(ids, !concl);
      toast(concl ? "Capítulo desmarcado." : `${plural(n || ids.length, "artigo marcado", "artigos marcados")} como lido.`, "ok");
    },
    "ler-desmarcar-lidos": async () => { // desmarca TODOS os lidos da lei ativa (com confirmação)
      const alvos = st.indicacoes.filter((i) => i.tipo === "lei" && !i.metaLeitura && !i.revogado && i.lido && (normaDeRef(i.referencia) || "Outros") === S.leiAtiva.lei);
      if (!alvos.length) return toast("Nenhum artigo lido nesta lei.", "erro");
      if (!(await confirmar(`Desmarcar os ${alvos.length} artigos lidos de ${nomeAmigavelLei(S.leiAtiva.lei)}? O progresso de leitura volta a 0.`))) return;
      const n = store.marcarLidosIds(alvos.map((i) => i.id), false);
      toast(`${plural(n || alvos.length, "artigo desmarcado", "artigos desmarcados")}. Progresso zerado.`, "ok");
      app.refresh();
    },
    "ler-aleatorio": () => { // #15: sorteia um artigo da lei atual e abre no leitor
      const arts = st.indicacoes.filter((i) => i.tipo === "lei" && !i.metaLeitura && !i.revogado && (i.texto || "").trim() && (normaDeRef(i.referencia) || "Outros") === S.leiAtiva.lei);
      if (!arts.length) return toast("Sem artigos nesta lei para sortear.", "erro");
      app.navigate("leiseca", { focoIndicacaoId: arts[Math.floor(Math.random() * arts.length)].id });
    },
    // ---- Estudar (lançador) ----
    "estudar-escopo": (el) => { S.estudarEscopo[tipo] = el.getAttribute("data-e"); app.refresh(); },
    "estudar-escopo-toggle": () => { S._escopoAberto = !S._escopoAberto; app.refresh(); },
    "estudar-escopo-limpar": () => { S.estudarSecaoSel = null; S.estudarArtFiltro = ""; S.estudarTemaSel = null; S.estudarJurisTrib = null; S.estudarJurisRamo = null; S.estudarJurisAssunto = null; S.estudarJurisCat = null; S.estudarEscopo[tipo] = "tudo"; app.refresh(); },
    "estudar-tema-chip": (el) => { const t = el.getAttribute("data-tema"); S.estudarTemaSel = S.estudarTemaSel === t ? null : t; S.estudarSecaoSel = null; S.estudarArtFiltro = ""; app.refresh(); }, // F2: atalho memorizar por tema
    "estudar-tema-limpar": () => { S.estudarTemaSel = null; app.refresh(); },
    "estudar-cross-lei": () => { S.estudarLeiSel = S.estudarLeiSel === "todas" ? null : "todas"; S.estudarSecaoSel = null; app.refresh(); }, // F2: tema em todas as leis
    // 1 clique = começa DIRETO no padrão (4 itens, dificuldade média, escopo atual).
    // Quantidade/dificuldade viram o link "Opções…" do card (handler -opcoes abaixo).
    "estudar-ce": () => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar Certo/Errado");
      iniciarCE(escopoItens(), { n: 4, dificuldade: "medio", regenerate: true });
    },
    "estudar-ce-opcoes": async () => {
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
    // Inteligência por tema: foca o escopo do Estudar no tema onde o aluno mais erra.
    "estudar-tema-fraco": () => {
      const tf = store.temasComErro(tipo)[0]; if (!tf) return;
      S.estudarTemaSel = tf.tema; S.estudarSecaoSel = null; S.estudarArtFiltro = "";
      toast(`Escopo focado no tema “${tf.tema}”. Escolha Certo/Errado ou Completar a letra.`);
      app.refresh();
    },
    // Súmula-duelo (só juris, offline): a banca troca número/tribunal — julga a atribuição.
    // Respeita o MESMO recorte de estudo (tribunal/ramo/assunto/tema) que C/E e Completar usam.
    "estudar-duelo": () => {
      let itens = todasDoTipo.filter((i) => !i.metaLeitura && !i.revogado && passaFiltro(i) && noEscopoEstudo(i));
      if (S.estudarEscopo[tipo] === "incidencia") {
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
    "estudar-cloze": () => {
      const itens = escopoItens();
      if (!itens.length) return toast("Adicione o texto dos artigos na aba Ler primeiro.", "erro");
      abrirCompletarArtigo(app, store, itens.map((i) => i.id));
    },
    // Gerar material do escopo: flashcards (IA, com fallback offline) e questões de múltipla escolha.
    // 1 clique gera DIRETO no padrão; o link "Opções…" do card abre o pedirNumero de antes.
    "estudar-flashcards": (el) => gerarFlashcardsEscopo(el, 3, "medio"),
    "estudar-flashcards-opcoes": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar flashcards");
      const g = await pedirNumero("Quantos flashcards por artigo?", { padrao: 3, min: 1, max: 6, nivel: true });
      if (!g) return;
      gerarFlashcardsEscopo(el, g.n, g.dificuldade);
    },
    "estudar-questoes": (el) => gerarQuestoesEscopo(el, 2, "medio"),
    "estudar-questoes-opcoes": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar questões");
      const g = await pedirNumero("Quantas questões de múltipla escolha por artigo?", { padrao: 2, min: 1, max: 5, nivel: true });
      if (!g) return;
      gerarQuestoesEscopo(el, g.n, g.dificuldade);
    },
    "estudar-revisar": () => app.navigate("revisoes"),
    "estudar-grifos": () => {
      const comGrifo = st.indicacoes
        .filter((i) => i.tipo === tipo && !i.metaLeitura && !i.revogado && (i.texto || "").trim() && store.marcasDe("indicacao", i.id).some((m) => m.cor !== "comentario"))
        .sort((a, b) => numArtigo(a.referencia) - numArtigo(b.referencia));
      if (!comGrifo.length) return toast("Grife trechos na aba Ler para revisar aqui.", "erro");
      abrirLeituraFoco(app, store, comGrifo.map((i) => i.id), 0, { modo: "recordar", mostrarModos: true });
    },
    "estudar-erros": () => {
      const treinoQs = st.questoes.filter((q) => q.treino && q.fonte?.tipo === tipo);
      const ids = treinoQs.filter((q) => { const ts = st.tentativas.filter((t) => t.questaoId === q.id); return ts.length && !ts[ts.length - 1].acertou; }).map((q) => q.id);
      if (!ids.length) return toast("Você não tem erros de treino para refazer.", "erro");
      app.navigate("pratica-ce", { focoErrosIds: ids });
    },
    // Caderno de erros: praticar Certo/Errado só daquele artigo; ou abri-lo na aba Ler.
    "estudar-erro-art": (el) => {
      const ind = st.indicacoes.find((i) => i.id === el.getAttribute("data-id"));
      if (!ind || !(ind.texto || "").trim()) return toast("Este dispositivo não tem texto para praticar.", "erro");
      iniciarCE([ind]);
    },
    "ir-artigo": (el) => app.navigate("leiseca", { focoIndicacaoId: el.getAttribute("data-id") }),
    "ir-caderno": () => app.navigate("erros", { fonteFiltro: tipo }),
    // F7 (Ler→Estudar): praticar Certo/Errado só deste artigo, direto do menu do artigo.
    "estudar-artigo": (el) => {
      const ind = st.indicacoes.find((i) => i.id === el.getAttribute("data-id"));
      if (!ind || !(ind.texto || "").trim()) return toast("Este artigo não tem texto para estudar.", "erro");
      iniciarCE([ind]);
    },
    // Fase 5 — as metas diárias e as revisões saíram da aba Metas (vivem no Planejamento/
    // Central); daqui só se navega para lá.
    "ir-planejamento": () => app.navigate("planejamento"),
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
      if (!(await confirmar(`${tipo === "juris" ? "Marcar como " + rr.adj : "Marcar como revogado"}? Sai do estudo e fica riscado no Ler; as questões geradas dele são removidas. Dá para reativar depois.`))) return;
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
    "ler-buscar": () => abrirBuscaLei(app, store, S.leiAtiva.lei, listaLerFinal),
    // Renomear a lei (corrigir nome detectado errado). Só muda a exibição, não as citações.
    "ler-renomear": () => abrirRenomearLei(app, store, S.leiAtiva.lei),
    "ler-personalizar": () => abrirPersonalizarBarra(app, store),
    // Ações em lote (antes no modal "Ferramentas"; agora itens diretos do menu Opções ⋯).
    "ler-grifar-auto": () => acaoGrifarAuto(app, store, listaLerFinal),
    "ler-grifar-ia": (el) => acaoGrifarIA(app, store, listaLerFinal, el),
    "ler-temas": () => acaoClassificarTemas(app, store, listaLerFinal),
    "ler-temas-ia": () => acaoRefinarTemasIA(app, store, listaLerFinal, S.leiAtiva.lei),
    "ler-lido-bloco": () => abrirMarcarLidoBloco(app, store, listaLerFinal, S.leiAtiva.lei),
    "ler-imprimir-grifos": () => acaoImprimirGrifos(store, listaLerFinal, S.leiAtiva.lei),
    "ler-limpar-grifos": () => acaoLimparGrifos(app, store, listaLerFinal),
    "ler-site": () => { const u = (listaLerFinal.find((i) => i.fonteUrl) || {}).fonteUrl; if (u) window.open(u, "_blank", "noopener"); },
    "ler-indice": () => { S._indiceColapsado = !S._indiceColapsado; app.refresh(); },
    // Continuar de onde parou: rola até o artigo salvo (última posição de leitura) e some a pílula.
    "ler-continuar": () => {
      const ult = (store.get().config.ultimaLeitura || {})[S.leiAtiva.lei];
      // focarItem abre <details> recolhidos do alvo e rola até ele (antes o cálculo manual falhava
      // quando o artigo estava dentro de um Título/Capítulo fechado).
      if (ult && ult.indicacaoId) focarItem(root, ult.indicacaoId);
      root.querySelector(".ler-continuar-pill")?.setAttribute("hidden", "");
    },
    // Estatística clicável = filtro do leitor (clicar de novo no mesmo limpa).
    "ler-stat-filtro": (el) => { const f = el.getAttribute("data-f"); S.leiFiltro.lei = S.leiFiltro.lei === f ? null : f; app.refresh(); },
    "ler-limpar-filtro": () => { S.leiFiltro.lei = null; app.refresh(); },
    // F3 — abre a leitura em foco (tela cheia), na ordem dos artigos da lei ativa.
    // Por padrão, o Foco CONTINUA de onde parou (posição salva pelo próprio Foco); se nunca leu,
    // começa no 1º artigo ainda não lido. Para começar noutro artigo: abrir o ⋯ do artigo → Ler em foco.
    "ler-foco-modo": () => {
      const ordenados = listaLerFinal.slice().sort((a, b) => numArtigo(a.referencia) - numArtigo(b.referencia));
      const ids = ordenados.map((i) => i.id);
      if (!ids.length) return;
      const ult = (st.config.ultimaLeitura || {})[S.leiAtiva.lei];
      let start = ult ? ids.indexOf(ult.indicacaoId) : -1;
      if (start < 0) start = ordenados.findIndex((i) => !i.lido);
      abrirLeituraFoco(app, store, ids, start >= 0 ? start : 0);
    },
    // ⋯ "Ler em foco" (por artigo) — mesmo modo foco, começando NAQUELE artigo.
    "ler-foco-art": (el) => {
      const id = el.getAttribute("data-id");
      const ids = listaLerFinal.slice().sort((a, b) => numArtigo(a.referencia) - numArtigo(b.referencia)).map((i) => i.id);
      const start = ids.indexOf(id);
      if (ids.length) abrirLeituraFoco(app, store, ids, start >= 0 ? start : 0);
    },
    // F1e: preferências de leitura. Tema Claro/Escuro mexem no tema GLOBAL do app; Sépia é só do leitor.
    "ler-cfg": (el) => {
      const k = el.getAttribute("data-k"), v = el.getAttribute("data-v");
      if (k === "tema") {
        if (v === "sepia" || v === "cinza") store.setLeitura({ tema: v });
        else { store.setLeitura({ tema: "auto" }); store.setConfig({ tema: v }); }
      } else store.setLeitura({ [k]: v });
      app.refresh();
    },
    // Leitor (F1b): marcar lido (botão, não checkbox) + favorito + difícil. F1d: pop no indicador.
    "ler-lido": (el) => {
      const id = el.getAttribute("data-id");
      store.toggleIndicacaoLida(id);
      // Marcar como lido grava a posição de "continuar de onde parou" (o último lido).
      const ind = store.get().indicacoes.find((x) => x.id === id);
      if (ind && ind.lido) { const nn = normaDeRef(ind.referencia); if (nn) store.setUltimaLeitura(nn, { indicacaoId: id }); }
      app.refresh(); animarFlagsLeitor(id);
    },
    "toggle-favorito": (el) => { const id = el.getAttribute("data-id"); const on = store.toggleFavorito(id); toast(on ? "Favorito (entra na revisão espaçada)." : "Removido dos favoritos."); app.refresh(); animarFlagsLeitor(id); },
    "toggle-dificil": (el) => { const id = el.getAttribute("data-id"); const on = store.toggleDificil(id); toast(on ? "Marcado como difícil (revisão em 1/3/7/15/30 dias)." : "Removido dos difíceis."); app.refresh(); animarFlagsLeitor(id); },
    // Antes abria um modal simples homônimo (texto ~70ch); agora delega ao MESMO overlay
    // premium de tela cheia do "ler-foco-art", começando no item clicado. Para juris a lista
    // fica na ordem exibida (numArtigo não se aplica a "Súmula NNN"); só itens com texto entram.
    "ler-foco": (el) => {
      const id = el.getAttribute("data-id");
      const ids = listaLerFinal.filter((i) => (i.texto || "").trim()).map((i) => i.id);
      const start = ids.indexOf(id);
      if (ids.length) abrirLeituraFoco(app, store, ids, start >= 0 ? start : 0);
    },
    "toggle-marcar": (el) => {
      const id = el.getAttribute("data-id");
      if (S.marcarAberto.has(id)) S.marcarAberto.delete(id);
      else S.marcarAberto.add(id);
      app.refresh();
    },
    "toggle-pq": (el) => {
      const ind = store.get().indicacoes.find((x) => x.id === el.getAttribute("data-id"));
      store.setIndicacaoPQ(el.getAttribute("data-id"), !(ind && ind.pq));
      toast(ind && ind.pq ? "Removido de 'o que mais cai'." : "Marcado como 'o que mais cai'.");
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
    // F2 — índice navegável (ramo → assunto): clicar filtra a lista.
    "juris-idx-ramo": (el) => { const rm = el.getAttribute("data-ramo"); const igual = S.filtroRamo === rm && S.filtroAssunto === "todos"; S.filtroRamo = igual ? "todos" : rm; S.filtroAssunto = "todos"; app.refresh(); },
    "juris-idx-assunto": (el) => { const rm = el.getAttribute("data-ramo"), as = el.getAttribute("data-assunto"); const igual = S.filtroRamo === rm && S.filtroAssunto === as; S.filtroRamo = igual ? "todos" : rm; S.filtroAssunto = igual ? "todos" : as; app.refresh(); },
    "juris-idx-limpar": () => { S.filtroRamo = "todos"; S.filtroAssunto = "todos"; app.refresh(); },
    // F2 (#4) — estudo ativo por card.
    "card-ce": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar Certo/Errado");
      const it = st.indicacoes.find((x) => x.id === el.getAttribute("data-id")); if (!it) return;
      const g = await pedirNumero("Quantos itens Certo/Errado desta tese?", { padrao: 4, min: 1, max: 8, nivel: true });
      if (!g) return;
      iniciarCE([it], { n: g.n, dificuldade: g.dificuldade, regenerate: true });
    },
    "card-questoes": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar questões");
      const id = el.getAttribute("data-id");
      const g = await pedirNumero("Quantas questões de múltipla escolha desta tese?", { padrao: 2, min: 1, max: 5, nivel: true });
      if (!g) return;
      const qs = await comOcupado(() => store.gerarQuestoesDeIndicacao(id, g.n, g.dificuldade, "mc"), { botao: el, msg: "Gerando questões…" });
      if (qs == null) return;
      toast(qs.length ? `${plural(qs.length, "questão gerada", "questões geradas")}.` : "A IA não retornou questões.", qs.length ? "ok" : "erro");
      if (qs.length) app.navigate("pratica");
    },
    "card-flash": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar flashcards");
      const id = el.getAttribute("data-id");
      const g = await pedirNumero("Quantos flashcards desta tese?", { padrao: 4, min: 1, max: 6, nivel: true });
      if (!g) return;
      const cs = await comOcupado(() => store.gerarFlashcardsIADeIndicacao(id, g.n, g.dificuldade), { botao: el, msg: "Gerando flashcards…" });
      if (cs == null) return;
      toast(cs.length ? `${plural(cs.length, "flashcard gerado", "flashcards gerados")}.` : "A IA não retornou flashcards.", cs.length ? "ok" : "erro");
      if (cs.length) app.navigate("flashcards");
    },
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
      S.mostrarConcluidas[tipo] = !S.mostrarConcluidas[tipo];
      app.refresh();
    },
    "toggle-grupo": (el) => {
      const k = el.getAttribute("data-grp");
      if (S.gruposFechados.has(k)) S.gruposFechados.delete(k);
      else S.gruposFechados.add(k);
      app.refresh();
    },
    "trib-editar": () => {
      S.editandoTribunal = S.filtroTribunal;
      app.refresh();
    },
    "trib-cancelar-edit": () => {
      S.editandoTribunal = null;
      app.refresh();
    },
    "trib-salvar": () => {
      const novo = (root.querySelector("#trib-novo")?.value || "").trim();
      if (!novo) return toast("Informe o nome do tribunal.", "erro");
      const c = store.renomearTribunal(S.filtroTribunal, novo);
      S.filtroTribunal = novo;
      S.editandoTribunal = null;
      toast(c ? `Tribunal renomeado em ${plural(c, "item", "itens")}.` : "Nada para renomear.", c ? "ok" : "erro");
      app.refresh();
    },
    "trib-remover": async () => {
      if (await confirmar(`Remover o tribunal "${S.filtroTribunal}"? Os itens com ele ficam sem tribunal (não são apagados).`)) {
        const c = store.removerTribunal(S.filtroTribunal);
        S.filtroTribunal = "todos";
        S.editandoTribunal = null;
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
  S.editandoId = null;
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
        <label class="u-grow-2">Referência <input id="ind-ref" type="text" value="${esc(sel.referencia || "")}" placeholder="${r.ph}" /></label>
        <label>Disciplina <select id="ind-disc">${opcoesDisc}</select></label>
        <label>Tópico (opcional) <select id="ind-top">${topicoOptions(st, discId, sel.topicoId)}</select></label>
      </div>
      ${
        tipo === "juris"
          ? `<div class="form-row">
              <label>Tribunal ${tribunalPickerHTML(sel.tribunal || "", "ind-trib")}</label>
              <label>Ano <input id="ind-ano" type="number" min="1988" max="2100" placeholder="Ex.: 2018" value="${sel.ano || ""}" class="u-w-90" data-tip="Ano do entendimento — ajuda a ver se é antigo." /></label>
            </div>
            <label class="u-block u-mb-8">Categoria ${categoriaPickerHTML(sel.categoria || "", "ind-cat")}</label>`
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

// Fase 6 — Índice de busca semântica DO MÓDULO (Lei Seca ou Jurisprudência). Cada módulo separa
// os seus itens (artigos/súmulas/teses) para a "Busca por significado (IA)" do chat, sem passar
// mais por Materiais. Escopo por tipo → não interfere no que Materiais/outro módulo já separou.
function abrirIndiceModulo(app, tipo) {
  const { store } = app;
  const ehJuris = tipo === "juris";
  const escopo = { tipos: [ehJuris ? "juris" : "leiseca"] };
  const nomeItem = ehJuris ? "súmulas/teses" : "artigos";
  const estado = { sel: null };
  const initSel = () => { estado.sel = new Set(store.fontesIndice(escopo).filter((f) => f.emIndice).map((f) => f.id)); };
  abrirJanelaFluxo({
    titulo: "Busca por significado (IA)",
    render: (corpo) => {
      if (estado.sel === null) initSel();
      const fontes = store.fontesIndice(escopo);
      const s = store.statusIndice(escopo);
      const sel = estado.sel;
      const statusFonte = (f) => f.indexada
        ? `${icone("check")} separado (${plural(f.chunks, "trecho", "trechos")})`
        : f.emIndice ? `${icone("refresh-cw")} desatualizado` : "ainda não separado";
      const linha = (f) => `
        <label class="sem-fonte">
          <input type="checkbox" class="idx-chk" data-id="${f.id}" ${sel.has(f.id) ? "checked" : ""} />
          <span class="sem-fonte-nome">${esc(f.titulo)}</span>
          <span class="sem-fonte-status ${f.indexada ? "ok" : f.emIndice ? "pend" : ""}">${statusFonte(f)}</span>
        </label>`;
      corpo.innerHTML = `
        <div class="sem-sel">
          <p class="muted small u-m-0 u-mb-8">Separe ${nomeItem} deste módulo para a <b>busca por significado</b> do chat (encontra pelo sentido, não só pela palavra exata). Separar 1 trecho = 1 requisição à IA. ${s.temIndice ? `Separados: <b>${s.indexadas}</b> de ${s.fontes} (${plural(s.chunks, "trecho", "trechos")}).` : "Nada separado ainda."}</p>
          <div class="sem-sel-top">
            <span class="muted small">${fontes.length} ${fontes.length === 1 ? "item disponível" : "itens disponíveis"}</span>
            <span class="spacer"></span>
            <button class="lnk" data-action="idx-todos">marcar todos</button> ·
            <button class="lnk" data-action="idx-nenhum">desmarcar todos</button>
          </div>
          <div class="sem-sel-lista idx-lista">${fontes.map(linha).join("")}</div>
          <div class="sem-sel-acoes">
            <button class="btn btn-primary btn-sm" data-action="idx-aplicar">Separar selecionados (${sel.size})</button>
            <span class="muted small">Desmarcar e aplicar remove da busca.</span>
          </div>
        </div>`;
      corpo.querySelectorAll(".idx-chk").forEach((chk) => chk.addEventListener("change", () => {
        const id = chk.getAttribute("data-id");
        if (chk.checked) estado.sel.add(id); else estado.sel.delete(id);
        const btn = corpo.querySelector('[data-action="idx-aplicar"]');
        if (btn) btn.textContent = `Separar selecionados (${estado.sel.size})`;
      }));
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "idx-todos": () => { estado.sel = new Set(store.fontesIndice(escopo).map((f) => f.id)); rerender(); },
      "idx-nenhum": () => { estado.sel = new Set(); rerender(); },
      "idx-aplicar": async (el) => {
        const ids = [...(estado.sel || [])];
        const fim = toastCarregando(ids.length ? "Separando para a busca…" : "Removendo da busca…");
        if (el) el.disabled = true;
        try {
          const r = await store.sincronizarIndice(ids, (feito, total, titulo) => toast(`Indexando ${feito}/${total}: ${titulo}`), escopo);
          toast(`Índice deste módulo: ${plural(r.chunks, "trecho", "trechos")}.`, "ok");
          rerender();
          app.refresh();
        } catch (e) {
          toast(e && e.code === "IA_OFFLINE" ? e.message : "Não consegui separar agora. Tente de novo em instantes.", "erro");
        } finally { fim(); if (el) el.disabled = false; }
      },
    }),
  });
}
