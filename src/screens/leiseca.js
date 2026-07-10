// Lei Seca e Jurisprudência. Cada tela tem dois modos:
//  • META    — referência a CUMPRIR/LER (vira missão; ao concluir, sai da lista).
//  • MEMÓRIA — trecho GRAVADO para relembrar (banco de memória; não é tarefa).
// Vínculo opcional a disciplina/tópico (sem vínculo → Geral). Jurisprudência
// classifica tribunal (TJSP/STJ/STF) e categoria (súmula/tema/precedente).
// Permite importar (texto/PDF) e gerar flashcards/questões.
import { bindActions, toast, toastCarregando, header, vazio, confirmar, imprimir, botaoImprimir, opcoesImpressao, avisoIA, ligarDropZone, escolher, focarItem, pedirNumero, pedirTexto, abrirJanela, abrirJanelaFluxo, plural, comOcupado } from "../ui.js";
import { esc, fmtData, todayISO, daysBetween, addDays } from "../util.js";
import { progressRing } from "../viz.js";
import { icone } from "../icones.js";
import { lerArquivoTexto, ligarImportArquivo } from "../pdf.js";
import { montarMarcacao } from "../marcacao.js";
import { responderChat as _responderChat } from "../ia-provider.js";
import { md as _md } from "../ui.js";
import { focoShellHTML, bindFocoCrono, focoChromeKey, ligarTickCrono, atualizarChipCrono } from "./foco-quiz.js";
import { filtroTopicosBotaoHTML, filtroTopicosPainelHTML, ligarFiltroTopicos, itemNoFiltro } from "./questoes-filtro.js";
import { CATALOGO_LEIS } from "../legis.js";

const TRIBUNAIS = ["STF", "STJ", "TJSP"]; // padrão; "Outro" no seletor cobre qualquer outro
const CATEGORIAS_JURIS = ["Súmula", "Súmula Vinculante", "Tema repetitivo", "Repercussão Geral", "Precedente obrigatório", "Jurisprudência em Teses", "Tese", "Enunciado"];

// Abas (modelo v3): "ler" (a letra: link+anotações+texto) · "metas" (metas cruas de leitura) ·
// "memorizar" (promovidos, revisão espaçada) · "treinar" · "raiox".
let modoAtivo = { lei: "ler", juris: "ler" };
let lerFiltroNov = { lei: false, juris: false }; // filtro "só novidades" na aba Ler
let estudarEscopo = { lei: "tudo", juris: "tudo" }; // intensidade do escopo: "tudo" | "incidencia"
let estudarLeiSel = null; // OBJETO do estudo: norma escolhida (null = a lei ativa do leitor)
let estudarSecaoSel = null; // seção estrutural "rotulo|titulo" (null = a lei inteira) — delimita p/ a IA
let estudarArtFiltro = ""; // artigo(s) do escopo: "" | "5" (um) | "1-10"/"1 a 10" (intervalo)
let estudarTemaSel = null; // tema do escopo (Memorizar temático): null = todos
// C.2.4 — escopo de estudo da JURISPRUDÊNCIA (análogo à lei, mas por tribunal/ramo/assunto/categoria).
let estudarJurisTrib = null; // tribunal (null = todos)
let estudarJurisRamo = null; // ramo do direito (null = todos)
let estudarJurisAssunto = null; // assunto (null = todos)
let estudarJurisCat = null; // categoria (Súmula, Tema repetitivo…) (null = todas)
let _escopoTipo = null; // tipo dono do recorte de estudo atual — troca de módulo (lei↔juris) zera o recorte
let _escopoAberto = false; // popover de escopo do Estudar aberto?
// Interpreta o filtro de artigo: número único ou intervalo. Devolve {de,ate} ou null.
function parseIntervaloArt(s) {
  const m = String(s || "").trim().match(/^(\d+)\s*(?:[-–—a\s]+\s*(\d+))?$/i);
  if (!m) return null;
  const de = +m[1], ate = m[2] ? +m[2] : de;
  return { de: Math.min(de, ate), ate: Math.max(de, ate) };
}
let leiAtiva = { lei: null }; // F1a: lei ativa no leitor (uma lei por vez)
let leiFiltro = { lei: null }; // filtro do leitor: null|"lido"|"favorito"|"dificil"|"grifo"|"anotacao"
let _leitorCtx = null; // {store, app, norma} — usado pelo menu flutuante de grifo (F2) e pela posição de leitura
let _indiceColapsado = false; // botão "Índice": recolhe toda a estrutura (Livro/Título/Capítulo…) → vira índice

// GRIFAR INDIVIDUAL (tipo Kindle): ao selecionar um trecho no leitor, um menu FLUTUANTE aparece.
// "Grifar" abre as CORES ali mesmo e pinta o trecho DIRETO sobre o texto (sem painel); "Comentar"
// abre o campo de anotação na hora. O offset é mapeado da seleção (bloco data-raw) para o texto CRU,
// e a marca guarda o trecho+contexto (âncora resiliente). Copiar e Perguntar à IA seguem no menu.
const CORES_GRIFO = [
  { id: "amarelo", nome: "palavras-chave" }, { id: "azul", nome: "prazos e valores" }, { id: "vermelho", nome: "restritivas" },
  { id: "verde", nome: "livre" }, { id: "roxo", nome: "livre" }, { id: "laranja", nome: "livre" },
];
// SCROLL-SPY (V2): "cabeçalho corrente" do livro — mostra a trilha estrutural (Parte › Título ·
// Capítulo) do trecho que você está lendo, atualizando conforme rola. Usa IntersectionObserver
// (leve, dispara só quando um cabeçalho cruza o topo) — não é handler de scroll (evita o bug antigo).
let _scrollSpyIO = null, _scrollSpyArtIO = null, _savePosT = null;
function garantirScrollSpy(root) {
  try { if (_scrollSpyIO) { _scrollSpyIO.disconnect(); _scrollSpyIO = null; } } catch {}
  try { if (_scrollSpyArtIO) { _scrollSpyArtIO.disconnect(); _scrollSpyArtIO = null; } } catch {}
  if (typeof IntersectionObserver === "undefined") return;
  const agora = root.querySelector(".ler-agora");
  const lista = root.querySelector(".lista-leiseca");
  const trilhaEl = agora && agora.querySelector(".la-trilha");
  const barra = root.querySelector(".ler-topo");
  const pill = root.querySelector(".ler-continuar-pill");
  const scEl = document.querySelector(".content") || document.scrollingElement;
  if (!agora || !lista || !trilhaEl) return;
  const linhaTopo = () => (barra ? barra.getBoundingClientRect().bottom : 120) + 6;
  // Pílula "Continuar de onde parou": aparece perto do topo quando há posição salva ADIANTE.
  const atualizarPill = () => {
    if (!pill) return;
    const norma = _leitorCtx && _leitorCtx.norma;
    const nearTop = (scEl ? scEl.scrollTop : window.scrollY || 0) < 500;
    const ult = norma ? ((_leitorCtx.store.get().config.ultimaLeitura || {})[norma]) : null;
    const alvo = ult && ult.indicacaoId ? lista.querySelector(`.ler-art[data-id="${ult.indicacaoId}"]`) : null;
    if (nearTop && alvo && alvo.getBoundingClientRect().top > linhaTopo() + 240) {
      const ref = alvo.querySelector(".ler-art-ref");
      pill.querySelector(".lcp-art").textContent = ref ? " · " + ref.textContent.trim() : "";
      pill.hidden = false;
    } else pill.hidden = true;
  };
  const sums = [...lista.querySelectorAll(".ls-estr > summary")];
  const atualizar = () => {
    atualizarPill();
    const linha = linhaTopo();
    let cur = null;
    for (const s of sums) { const r = s.getBoundingClientRect(); if (r.height === 0) continue; if (r.top <= linha) cur = s; else break; }
    if (!cur) { agora.hidden = true; return; }
    const partes = [];
    let el = cur.closest(".ls-estr");
    while (el) {
      const sm = el.querySelector(":scope > summary");
      const rot = sm && sm.querySelector(".ls-estr-rot") ? sm.querySelector(".ls-estr-rot").textContent.trim() : "";
      const tit = sm && sm.querySelector(".ls-estr-tit") ? sm.querySelector(".ls-estr-tit").textContent.trim() : "";
      if (rot) partes.unshift(tit ? `${rot} · ${tit}` : rot);
      el = el.parentElement ? el.parentElement.closest(".ls-estr") : null;
    }
    if (!partes.length) { agora.hidden = true; return; }
    const txt = partes.join("  ›  ");
    if (trilhaEl.textContent !== txt) trilhaEl.textContent = txt;
    agora.hidden = false;
  };
  if (sums.length) {
    _scrollSpyIO = new IntersectionObserver(atualizar, { threshold: [0, 1] });
    sums.forEach((s) => _scrollSpyIO.observe(s));
  } else agora.hidden = true;
  // Observa os artigos SÓ para atualizar a pílula ao rolar. A posição de "continuar de onde parou"
  // é gravada ao MARCAR LIDO (handler ler-lido/lf-lido) — NÃO no scroll (salvar no scroll chamava
  // setUltimaLeitura→commit→re-render, num loop que fazia a página "atualizar sozinha").
  const arts = [...lista.querySelectorAll(".ler-art")];
  if (arts.length) {
    _scrollSpyArtIO = new IntersectionObserver(() => atualizarPill(), { threshold: 0 });
    arts.forEach((a) => _scrollSpyArtIO.observe(a));
  }
  atualizar();
}

function garantirGrifoFlutuante() {
  if (typeof document === "undefined" || window.__grifoFut) return;
  window.__grifoFut = true;
  const bar = document.createElement("div");
  bar.className = "grifo-fut";
  bar.style.display = "none";
  document.body.appendChild(bar);
  let modo = "menu";      // "menu" | "cores" | "nota"
  let cap = null;         // { id, ini, fim, exact, prefix, suffix, texto } capturado quando o menu abre
  const esconder = () => { bar.style.display = "none"; modo = "menu"; cap = null; };
  const finalizar = () => { try { window.getSelection().removeAllRanges(); } catch {} esconder(); const ctx = _leitorCtx; if (ctx) { if (ctx.onMarca) ctx.onMarca(); else ctx.app.refresh(); } }; // no Foco, re-renderiza o overlay (não o fundo)

  // Offset no texto CRU a partir de um ponto (node,off) da seleção: base do bloco (data-raw) +
  // caracteres de texto até o ponto. Os blocos são contíguos ao cru, então isso é exato.
  const offsetCru = (corpoEl, node, off) => {
    let el = node.nodeType === 1 ? node : node.parentElement;
    const bloco = el && el.closest ? el.closest("[data-raw]") : null;
    if (!bloco || !corpoEl.contains(bloco)) return null;
    let total = 0, n; const walker = document.createTreeWalker(bloco, NodeFilter.SHOW_TEXT);
    while ((n = walker.nextNode())) { if (n === node) return +bloco.getAttribute("data-raw") + total + off; total += n.textContent.length; }
    return +bloco.getAttribute("data-raw") + total;
  };
  const selDentro = () => {
    if (document.querySelector(".mm-overlay, .modal-overlay")) return null;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !sel.toString().trim()) return null;
    const range = sel.getRangeAt(0);
    const anc = range.commonAncestorContainer;
    const el = anc.nodeType === 1 ? anc : anc.parentElement;
    const corpo = el && el.closest ? el.closest(".ler-art-corpo") : null;
    return corpo ? { range, corpo, texto: sel.toString().trim() } : null;
  };
  const capturar = (s) => {
    if (!s || !s.corpo) return null;
    const id = s.corpo.getAttribute("data-art-corpo");
    if (!id) return { texto: s.texto };
    const ctx = _leitorCtx; if (!ctx) return null;
    const ind = ctx.store.get().indicacoes.find((x) => x.id === id);
    if (!ind || !ind.texto) return { id, texto: s.texto }; // sem offset (só copiar/IA)
    let ini = offsetCru(s.corpo, s.range.startContainer, s.range.startOffset);
    let fim = offsetCru(s.corpo, s.range.endContainer, s.range.endOffset);
    if (ini == null || fim == null) return { id, texto: s.texto };
    if (ini > fim) [ini, fim] = [fim, ini];
    const raw = ind.texto;
    while (ini < fim && /\s/.test(raw[ini])) ini++;
    while (fim > ini && /\s/.test(raw[fim - 1])) fim--;
    if (fim <= ini) return { id, texto: s.texto };
    return { id, ini, fim, exact: raw.slice(ini, fim), prefix: raw.slice(Math.max(0, ini - 24), ini), suffix: raw.slice(fim, fim + 24), texto: s.texto };
  };

  const render = () => {
    if (modo === "nota") {
      bar.innerHTML = `<button class="gf-voltar" data-gf="voltar" data-tip="Voltar">${icone("arrow-left")}</button>` +
        `<textarea class="gf-nota" rows="3" placeholder="Escreva seu comentário…"></textarea>` +
        `<button class="gf-ia gf-nota-ok" data-gf="nota-ok" data-tip="Salvar (Ctrl+Enter)">${icone("check")}</button>`;
    } else {
      // Cores JÁ na linha (clique = grifa) · separador · demais ações.
      bar.innerHTML =
        `<div class="gf-cores">${CORES_GRIFO.map((c) => `<button class="mk-swatch mk-${c.id}" data-cor="${c.id}" data-tip="Grifar: ${c.nome}"></button>`).join("")}</div>` +
        `<span class="gf-sep"></span>` +
        `<button data-gf="comentar">${icone("message-square")}<span>Comentar</span></button>` +
        `<button data-gf="copiar">${icone("copy")}<span>Copiar</span></button>` +
        `<button data-gf="ia" class="gf-ia">${icone("sparkles")}<span>Perguntar</span></button>`;
    }
  };
  const posicionar = (rect) => {
    bar.style.display = "flex";
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    let top;
    if (modo === "nota") { // campo de comentário: ABAIXO da seleção (não cobre o texto)
      top = rect.bottom + 8;
      if (top + bh > window.innerHeight - 8) top = Math.max(8, rect.top - bh - 8);
    } else { // menu de cores/ações: acima (ou abaixo se não couber)
      top = rect.top - bh - 8; if (top < 8) top = rect.bottom + 8;
    }
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
    bar.style.top = `${top}px`; bar.style.left = `${left}px`;
  };
  let lastRect = null;
  const posicionarAtual = () => { if (lastRect) posicionar(lastRect); };
  const abrir = () => {
    const s = selDentro();
    if (!s) { if (modo === "menu") esconder(); return; }
    cap = capturar(s);
    lastRect = s.range.getBoundingClientRect();
    modo = "menu"; render();
    posicionar(lastRect);
  };

  document.addEventListener("mouseup", () => setTimeout(abrir, 0));
  document.addEventListener("selectionchange", () => { if (modo === "menu" && window.getSelection().isCollapsed) esconder(); });
  window.addEventListener("scroll", () => { if (modo === "menu") esconder(); }, true);
  window.addEventListener("resize", esconder);
  bar.addEventListener("mousedown", (e) => { if (!e.target.closest(".gf-nota")) e.preventDefault(); }); // não perde a seleção (menos no input)
  bar.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.closest(".gf-nota")) { e.preventDefault(); salvarNota(); } if (e.key === "Escape") esconder(); });

  const grifar = (cor) => {
    const ctx = _leitorCtx; if (!ctx || !cap) return;
    if (cap.ini == null) { toast("Selecione dentro de um parágrafo para grifar.", "erro"); return; }
    ctx.store.addMarca({ alvoTipo: "indicacao", alvoId: cap.id, cor, inicio: cap.ini, fim: cap.fim, texto: cap.exact, prefix: cap.prefix, suffix: cap.suffix });
    finalizar();
  };
  const salvarNota = () => {
    const ctx = _leitorCtx; if (!ctx || !cap) return;
    const val = (bar.querySelector(".gf-nota")?.value || "").trim();
    if (cap.ini == null) { toast("Selecione dentro de um parágrafo para comentar.", "erro"); return; }
    const nova = ctx.store.addMarca({ alvoTipo: "indicacao", alvoId: cap.id, cor: "comentario", inicio: cap.ini, fim: cap.fim, texto: cap.exact, prefix: cap.prefix, suffix: cap.suffix });
    if (nova && val) ctx.store.setMarcaNota(nova.id, val);
    finalizar();
  };

  bar.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-gf],[data-cor]"); if (!btn) return;
    const ctx = _leitorCtx; if (!ctx) return;
    if (btn.hasAttribute("data-cor")) return grifar(btn.getAttribute("data-cor"));
    const acao = btn.getAttribute("data-gf");
    if (acao === "voltar") { modo = "menu"; render(); posicionarAtual(); return; }
    if (acao === "comentar") { modo = "nota"; render(); posicionarAtual(); bar.querySelector(".gf-nota")?.focus(); return; }
    if (acao === "nota-ok") return salvarNota();
    if (acao === "copiar") { const t = cap ? cap.texto : ""; if (t) { try { await navigator.clipboard.writeText(t); toast("Trecho copiado."); } catch { toast("Não consegui copiar.", "erro"); } } finalizar(); return; }
    if (acao === "ia") { const t = cap ? cap.texto : ""; const id = cap ? cap.id : null; esconder(); if (t) perguntarIASobreTrecho(ctx, id, t); return; }
  });
}

// Clicar num grifo já feito → popover: mostra a nota (comentário) e permite editar/remover.
// Instalado uma vez; lê _leitorCtx. Só age em clique simples (sem seleção em andamento).
function garantirPopoverMarca() {
  if (typeof document === "undefined" || window.__marcaPop) return;
  window.__marcaPop = true;
  const pop = document.createElement("div");
  pop.className = "marca-pop";
  pop.style.display = "none";
  document.body.appendChild(pop);
  const fechar = () => { pop.style.display = "none"; };
  const abrir = (mk, marca, ctx) => {
    const ehCom = marca.cor === "comentario";
    pop.innerHTML =
      (ehCom ? `<div class="marca-pop-nota">${marca.nota ? esc(marca.nota) : '<span class="muted">(comentário vazio — clique em Editar)</span>'}</div>` : "") +
      `<div class="marca-pop-acoes">${ehCom ? `<button class="lnk" data-mp="editar">${icone("square-pen")} Editar</button>` : ""}<button class="lnk lnk-danger" data-mp="remover">${icone("x")} Remover</button></div>`;
    posicionar(mk);
    pop.onclick = (ev) => {
      const b = ev.target.closest("[data-mp]"); if (!b) return;
      const a = b.getAttribute("data-mp");
      if (a === "remover") { ctx.store.removerMarca(marca.id); fechar(); ctx.onMarca ? ctx.onMarca() : ctx.app.refresh(); }
      else if (a === "editar") {
        pop.innerHTML = `<textarea class="marca-pop-inp" rows="3" placeholder="Comentário…">${esc(marca.nota || "")}</textarea><div class="marca-pop-acoes"><button class="lnk" data-mp="salvar">${icone("check")} Salvar</button><button class="lnk" data-mp="cancelar">cancelar</button></div>`;
        posicionar(mk); pop.querySelector(".marca-pop-inp")?.focus();
        pop.onclick = (e2) => {
          const bb = e2.target.closest("[data-mp]"); if (!bb) return;
          const aa = bb.getAttribute("data-mp");
          if (aa === "salvar") { ctx.store.setMarcaNota(marca.id, pop.querySelector(".marca-pop-inp").value); fechar(); ctx.onMarca ? ctx.onMarca() : ctx.app.refresh(); }
          else if (aa === "cancelar") fechar();
        };
      }
    };
  };
  const posicionar = (mk) => {
    const r = mk.getBoundingClientRect();
    pop.style.display = "block";
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let top = r.bottom + 6; if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    let left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
    pop.style.top = `${top}px`; pop.style.left = `${left}px`;
  };
  document.addEventListener("click", (e) => {
    if (e.target.closest(".marca-pop")) return;
    const mk = e.target.closest(".ler-art-corpo mark.mk[data-mid]");
    if (!mk || !window.getSelection().isCollapsed) return fechar();
    const ctx = _leitorCtx; if (!ctx) return fechar();
    const marca = ctx.store.get().marcacoes.find((x) => x.id === mk.getAttribute("data-mid"));
    if (!marca) return fechar();
    abrir(mk, marca, ctx);
  });
  window.addEventListener("scroll", fechar, true);
}

// F2: "Perguntar à IA" sobre o trecho — INTERATIVO. O usuário escreve a dúvida (o trecho vira
// contexto) OU pede "Explicar em outras palavras". Pode ativar consulta à web. Nada automático.
function perguntarIASobreTrecho(ctx, id, trecho) {
  const { store, app } = ctx;
  const st = store.get();
  if (!store.iaDisponivel()) return avisoIA(app, "Perguntar à IA");
  const ind = id ? st.indicacoes.find((i) => i.id === id) : null;
  const ref = ind ? ind.referencia || "" : "";
  abrirJanela({
    titulo: "Perguntar à IA",
    corpoHTML: `<div class="card ia-trecho-box">
      <div class="muted small">${icone("scroll-text")} ${esc(ref)}</div>
      <blockquote class="ia-trecho">${esc(trecho)}</blockquote>
      <label class="ia-lbl">Sua dúvida sobre este trecho
        <textarea id="ia-pergunta" rows="2" placeholder="Ex.: qual a diferença para o art. seguinte? (ou clique em Explicar)"></textarea>
      </label>
      <div class="ia-acoes-row">
        <label class="inline ia-web" data-tip="A IA também pesquisa na web para responder."><input type="checkbox" id="ia-web" /> Consultar a web</label>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" data-ia="explicar">${icone("sparkles")} Explicar em outras palavras</button>
        <button class="btn btn-primary btn-sm" data-ia="perguntar">${icone("send")} Perguntar</button>
      </div>
      <div class="ia-resp" hidden></div>
    </div>`,
    aoMontar: (overlay) => {
      const corpo = overlay.querySelector(".mm-corpo");
      const respEl = corpo.querySelector(".ia-resp");
      const rodar = async (modo) => {
        const q = (corpo.querySelector("#ia-pergunta")?.value || "").trim();
        const web = !!corpo.querySelector("#ia-web")?.checked;
        const pergunta = modo === "explicar" || !q
          ? `Explique em outras palavras, de forma didática para quem estuda para concurso, este trecho da lei${ref ? ` (${ref})` : ""}: "${trecho}". Aponte pegadinhas de prova e palavras-chave. Seja objetivo.`
          : `Considere este trecho da lei${ref ? ` (${ref})` : ""}: "${trecho}". Responda à dúvida: "${q}". Seja didático e objetivo.`;
        respEl.hidden = false;
        respEl.innerHTML = `<span class="muted small">${icone("sparkles")} Consultando a IA${web ? " (com web)" : ""}…</span>`;
        try {
          const r = await _responderChat(st.config, { pergunta, fontes: [], web, perfil: store.contextoAlunoCurto ? store.contextoAlunoCurto() : "" });
          const txt = r && typeof r === "object" ? r.texto || "" : r || ""; // responderChat devolve {texto, selo, fontesWeb}
          respEl.innerHTML = txt.trim() ? _md(txt) : "Sem resposta."; // renderiza markdown leve (negrito/listas), não texto cru
        } catch (err) { console.error(err); respEl.innerHTML = `<span class="erro-msg small">A IA não respondeu agora. Tente de novo em instantes.</span>`; }
      };
      corpo.querySelector('[data-ia="explicar"]')?.addEventListener("click", () => rodar("explicar"));
      corpo.querySelector('[data-ia="perguntar"]')?.addEventListener("click", () => rodar("perguntar"));
      corpo.querySelector("#ia-pergunta")?.focus();
    },
  });
}

// F4 — Busca na lei: TEXTUAL (instantânea, offline) + SEMÂNTICA (IA, por significado). Cada
// resultado abre direto no artigo (focoIndicacaoId → rola até ele no leitor).
function abrirBuscaLei(app, store, norma, artigos) {
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const estado = { sem: false };
  abrirJanela({
    titulo: `Buscar em ${nomeAmigavelLei(norma)}`,
    corpoHTML: `<div class="card busca-lei">
      <div class="busca-topo">${icone("search")}<input id="busca-q" type="text" placeholder="Palavra, expressão ou número do artigo (ex.: prescrição · 121)" autocomplete="off" /></div>
      <label class="busca-sem" data-tip="Busca por SIGNIFICADO (usa IA + o índice da lei), não só a palavra exata."><input type="checkbox" id="busca-sem-chk" /> ${icone("sparkles")} Busca inteligente (IA)</label>
      <div class="busca-res" id="busca-res"><p class="muted small">Digite para buscar nesta lei.</p></div>
    </div>`,
    aoMontar: (overlay, fechar) => {
      const corpo = overlay.querySelector(".mm-corpo");
      const inp = corpo.querySelector("#busca-q");
      const res = corpo.querySelector("#busca-res");
      const chk = corpo.querySelector("#busca-sem-chk");
      const jump = (id) => { fechar(); app.navigate("leiseca", { focoIndicacaoId: id }); };
      const pintar = (itens, termo) => {
        if (!itens.length) { res.innerHTML = `<p class="muted small">Nada encontrado${termo ? ` para "${esc(termo)}"` : ""}.</p>`; return; }
        res.innerHTML = itens.map((it) => `<button class="busca-item" data-id="${it.id}"><span class="busca-item-ref">${esc(it.ref)}</span><span class="busca-item-tr">${it.snippet}</span></button>`).join("");
        res.querySelectorAll(".busca-item").forEach((b) => b.addEventListener("click", () => jump(b.getAttribute("data-id"))));
      };
      const textual = (q) => {
        const nq = norm(q); const out = [];
        // Só número → "ir para o artigo": o artigo exato vem PRIMEIRO (ex.: "5" → Art. 5º).
        const soNum = /^\d+$/.test(q.trim());
        let exatoId = null;
        if (soNum) { const alvo = artigos.find((a) => numArtigo(a.referencia) === +q.trim()); if (alvo) { exatoId = alvo.id; out.push({ id: alvo.id, ref: String(alvo.referencia).split(",")[0].trim(), snippet: `${icone("corner-down-right")} Ir para este artigo` }); } }
        for (const a of artigos) {
          if (a.id === exatoId) continue;
          const texto = corpoArtigoLimpo(a.texto);
          const nt = norm(texto); const pos = nt.indexOf(nq);
          if (norm(a.referencia).includes(nq) || pos >= 0) {
            const ref = String(a.referencia).split(",")[0].trim();
            let snippet;
            if (pos >= 0) { const ini = Math.max(0, pos - 30); snippet = (ini ? "…" : "") + esc(texto.slice(ini, pos)) + "<mark>" + esc(texto.slice(pos, pos + q.length)) + "</mark>" + esc(texto.slice(pos + q.length, pos + q.length + 45)) + "…"; }
            else snippet = esc(texto.slice(0, 80)) + "…";
            out.push({ id: a.id, ref, snippet });
          }
          if (out.length >= 40) break;
        }
        return out;
      };
      const rodarTextual = () => { const q = inp.value.trim(); if (!q) { res.innerHTML = `<p class="muted small">Digite para buscar nesta lei.</p>`; return; } pintar(textual(q), q); };
      const rodarSemantica = async () => {
        const q = inp.value.trim(); if (!q) return;
        if (!store.iaDisponivel()) { chk.checked = false; estado.sem = false; res.innerHTML = `<p class="muted small">A busca inteligente precisa da IA conectada — usando busca por palavra.</p>`; return rodarTextual(); }
        res.innerHTML = `<p class="muted small">${icone("sparkles")} Buscando por significado…</p>`;
        try {
          if (!(store.get().embeddings && store.get().embeddings.itens.length)) await store.indexarSemantica(null, { ids: artigos.map((a) => a.id) });
          const r = await store.buscaSemantica(q, { k: 20 });
          const idsLei = new Set(artigos.map((a) => a.id));
          const itens = r.filter((x) => x.tipo === "leiseca" && idsLei.has(x.fonteId)).map((x) => {
            const a = artigos.find((y) => y.id === x.fonteId);
            return { id: x.fonteId, ref: String((a && a.referencia) || x.titulo).split(",")[0].trim(), snippet: esc(corpoArtigoLimpo((a && a.texto) || x.trecho).slice(0, 110)) + "…" };
          });
          pintar(itens, q);
        } catch (e) { console.error(e); res.innerHTML = `<p class="erro-msg small">Não consegui a busca inteligente agora.</p>`; }
      };
      let t;
      inp.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => (estado.sem ? rodarSemantica() : rodarTextual()), estado.sem ? 450 : 90); });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { const b = res.querySelector(".busca-item"); if (b) b.click(); } });
      chk.addEventListener("change", () => { estado.sem = chk.checked; estado.sem ? rodarSemantica() : rodarTextual(); });
      inp.focus();
    },
  });
}

// F3 — MODO FOCO de leitura: overlay tela cheia (reusa o shell do foco-quiz). Um artigo por vez,
// navegação ←→, barra inferior de ações e cronômetro. Esc/setas via focoChromeKey. Seleção de
// texto continua abrindo o menu flutuante (Copiar/Perguntar à IA).
function abrirLeituraFoco(app, store, ids, startIdx, opts = {}) {
  if (!ids.length) return;
  let idx = Math.max(0, Math.min(startIdx || 0, ids.length - 1));
  let grifarAberto = false;
  let modoLeitura = opts.modo || "normal"; // "normal" | "marcas" | "recordar" (revisão de grifos)
  const mostrarModos = !!opts.mostrarModos;
  const revelados = new Set();
  const cur = () => store.get().indicacoes.find((i) => i.id === ids[idx]);
  const host = document.createElement("div");
  host.className = "leitura-foco-host";
  document.body.appendChild(host);
  const normaFoco = normaDeRef((store.get().indicacoes.find((i) => i.id === ids[idx]) || {}).referencia);
  _leitorCtx = { store, app, norma: normaFoco, onMarca: () => atualizar("none") }; // grifo em tempo real: re-renderiza o artigo do Foco
  garantirGrifoFlutuante();
  let offTick = null;
  const cleanup = () => { try { if (offTick) offTick(); } catch {} document.removeEventListener("keydown", onKey); host.remove(); app.refresh(); };

  const artHTML = (ind) => {
    const refCurta = String(ind.referencia || "").split(",")[0].trim();
    const trilha = (ind.estrutura || []).map((n) => n.rotulo + (n.titulo ? " · " + n.titulo : "")).join("  ›  ");
    const corpo = grifarAberto && ind.texto && modoLeitura === "normal"
      ? `<div class="mk-host lf-mk" data-mk-host="${ind.id}"></div>`
      : `<div class="ler-art-corpo lf-corpo mk-modo-${modoLeitura}" data-art-corpo="${ind.id}">${renderLeiComMarcas(ind.texto, store.marcasAncoradas("indicacao", ind.id, ind.texto), { modo: modoLeitura, revelados })}</div>`;
    return `<div class="lf-artigo ${ind.lido ? "lida" : ""}">
      ${trilha ? `<div class="lf-trilha">${esc(trilha)}</div>` : ""}
      <div class="lf-ref">${esc(refCurta)}${ind.nomeJuridico ? `<span class="lf-nome">${esc(ind.nomeJuridico)}</span>` : ""}</div>
      ${corpo}
    </div>`;
  };
  const rodapeHTML = (ind) => `<div class="lf-barra">
    <div class="lf-acoes">
      <button class="lfoco-btn ${ind.favorito ? "on-fav" : ""}" data-action="lf-fav" data-tip-pos="cima" data-tip="${ind.favorito ? "Favorito — tirar" : "Favoritar"}">${icone("bookmark")}</button>
      <button class="lfoco-btn ${ind.dificil ? "on-dif" : ""}" data-action="lf-dif" data-tip-pos="cima" data-tip="${ind.dificil ? "Difícil — tirar" : "Marcar difícil"}">${icone("flame")}</button>
      <button class="lfoco-btn ${ind.pq ? "on-pq" : ""}" data-action="lf-pq" data-tip-pos="cima" data-tip="Provável questão">${icone("star")}</button>
      <span class="lf-sep"></span>
      ${mostrarModos ? "" : `<button class="lfoco-btn ${grifarAberto ? "on" : ""}" data-action="lf-grifar" data-tip-pos="cima" data-tip="Grifar">${icone("highlighter")}</button>
      <button class="lfoco-btn" data-action="lf-anotar" data-tip-pos="cima" data-tip="Anotar">${icone("notebook-pen")}</button>`}
      <button class="lfoco-btn lfoco-ia" data-action="lf-ia" data-tip-pos="cima" data-tip="Perguntar à IA sobre o artigo">${icone("sparkles")}</button>
      <span class="lf-sep"></span>
      <details class="ler-config lf-cfg"><summary class="lfoco-btn" data-tip-pos="cima" data-tip="Aparência da leitura (fonte, tamanho, tema)"><span class="lcfg-aa">Aa</span></summary><div class="lcfg-pop lf-cfg-pop">${configLeituraRowsHTML(store.get().config.leitura, store.get().config.tema)}</div></details>
    </div>
    ${mostrarModos ? `<div class="lf-modos">
      ${["normal|Texto", "marcas|Só as marcas", "recordar|Recordar"].map((x) => { const [id, lbl] = x.split("|"); return `<button class="lf-modo ${modoLeitura === id ? "on" : ""}" data-action="lf-modo" data-modo="${id}">${lbl}</button>`; }).join("")}
    </div>` : ""}
    <div class="lf-legenda">${icone("arrow-left")}${icone("arrow-right")} navegar · <b>Esc</b> sair · ${mostrarModos ? "no Recordar, clique nas lacunas para revelar" : "selecione o texto para grifar / copiar / IA"}</div>
  </div>`;

  const montarMk = (ind) => {
    if (!grifarAberto) return;
    const mk = host.querySelector("[data-mk-host]");
    if (mk && ind.texto) montarMarcacao(mk, { store, alvoTipo: "indicacao", alvoId: ind.id, texto: ind.texto, topicoId: ind.topicoId, tituloFonte: ind.referencia });
  };

  // Atualiza SÓ o miolo + rodapé + progresso (mantém o overlay → NÃO pisca ao trocar de artigo).
  const atualizar = (anim = "fade") => {
    const ind = cur();
    if (!ind) return cleanup();
    const stage = host.querySelector(".fq-stage");
    if (stage) { stage.className = "fq-stage" + (anim === "fade" ? " fq-fade" : ""); if (anim === "fade") void stage.offsetWidth; stage.innerHTML = artHTML(ind); }
    const rod = host.querySelector(".fq-rodape");
    if (rod) rod.innerHTML = rodapeHTML(ind);
    const bar = host.querySelector(".fq-prog-bar > span");
    if (bar) bar.style.width = `${ids.length ? Math.round((100 * (idx + 1)) / ids.length) : 100}%`;
    const pos = host.querySelector(".fq-prog-txt b");
    if (pos) pos.textContent = String(idx + 1);
    const prev = host.querySelector('[data-action="foco-anterior"]'); if (prev) prev.disabled = idx <= 0;
    const next = host.querySelector('[data-action="foco-proximo"]'); if (next) next.disabled = idx >= ids.length - 1;
    montarMk(ind);
    if (!ind.lido) store.toggleIndicacaoLida(ind.id); // ao PASSAR pelo Foco, o artigo já conta como lido (sem botão)
    if (normaFoco) store.setUltimaLeitura(normaFoco, { indicacaoId: ind.id, pct: Math.round((100 * (idx + 1)) / ids.length) }); // continuar leitura
  };

  const irProximo = () => {
    const ind = cur();
    if (ind && !ind.lido) store.toggleIndicacaoLida(ind.id); // avançar marca o artigo como lido
    if (idx < ids.length - 1) { idx++; grifarAberto = false; atualizar("fade"); } else atualizar("none");
  };

  // Aplica ao Foco as MESMAS preferências de leitura do leitor (fonte/tamanho/espaçamento/
  // alinhamento/tema) — via data-ler-* no .fc-foco, espelhando o que a lista-leiseca faz.
  const aplicarLeituraFoco = () => {
    const fc = host.querySelector(".fc-foco"); if (!fc) return;
    const L = store.get().config.leitura || {};
    fc.setAttribute("data-ler-fonte", L.fonte || "inter");
    fc.setAttribute("data-ler-tam", L.tamanho || "media");
    fc.setAttribute("data-ler-esp", L.espacamento || "normal");
    fc.setAttribute("data-ler-align", L.align || "esquerda");
    fc.setAttribute("data-ler-tema", L.tema || "auto");
  };

  // Monta o shell UMA vez; navegar só atualiza o miolo (sem recriar o .fc-foco).
  const ind0 = cur();
  host.innerHTML = focoShellHTML({ idx, total: ids.length, centro: artHTML(ind0), rodape: rodapeHTML(ind0), aria: "Leitura em foco", anim: "in" });
  aplicarLeituraFoco();
  // Aa dentro do Foco = MESMO controle do leitor (padronizado). Atualiza ao vivo, sem sair.
  host.addEventListener("click", (e) => {
    const cfgBtn = e.target.closest('[data-action="ler-cfg"]'); if (!cfgBtn) return;
    const k = cfgBtn.getAttribute("data-k"), v = cfgBtn.getAttribute("data-v");
    if (k === "tema") {
      if (v === "sepia" || v === "cinza") store.setLeitura({ tema: v });
      else { store.setLeitura({ tema: "auto" }); store.setConfig({ tema: v }); document.documentElement.setAttribute("data-tema", v); }
    } else store.setLeitura({ [k]: v });
    aplicarLeituraFoco();
    const pop = cfgBtn.closest(".lcfg-pop");
    if (pop) pop.innerHTML = configLeituraRowsHTML(store.get().config.leitura, store.get().config.tema);
  });
  bindActions(host, bindFocoCrono({
    "foco-anterior": () => { if (idx > 0) { idx--; grifarAberto = false; atualizar("fade"); } },
    "foco-proximo": irProximo,
    "sair-foco": () => cleanup(),
    "lf-fav": () => { const i = cur(); if (i) { store.toggleFavorito(i.id); atualizar("none"); } },
    "lf-dif": () => { const i = cur(); if (i) { store.toggleDificil(i.id); atualizar("none"); } },
    "lf-pq": () => { const i = cur(); if (i) { store.setIndicacaoPQ(i.id, !i.pq); atualizar("none"); } },
    "lf-grifar": () => { grifarAberto = !grifarAberto; atualizar("none"); },
    "lf-anotar": () => { grifarAberto = true; atualizar("none"); toast("Escolha a cor Comentário para anotar."); },
    "lf-modo": (el) => { modoLeitura = el.getAttribute("data-modo"); revelados.clear(); grifarAberto = false; atualizar("none"); },
    "lf-copiar": async () => { const i = cur(); if (!i) return; try { await navigator.clipboard.writeText(`${i.referencia}\n${corpoArtigoLimpo(i.texto)}`); toast("Artigo copiado."); } catch { toast("Não consegui copiar.", "erro"); } },
    "lf-ia": () => { const i = cur(); if (i) perguntarIASobreTrecho({ store, app }, i.id, corpoArtigoLimpo(i.texto)); },
  }));
  // Recordar: clicar numa lacuna revela o trecho grifado.
  host.addEventListener("click", (e) => {
    const cz = e.target.closest("[data-cloze]");
    if (cz) { revelados.add(cz.getAttribute("data-cloze")); atualizar("none"); }
  });
  montarMk(ind0);
  if (ind0 && !ind0.lido) store.toggleIndicacaoLida(ind0.id); // primeiro artigo do Foco também já conta como lido
  offTick = ligarTickCrono(host);
  const chip = host.querySelector(".fq-crono"); if (chip) atualizarChipCrono(chip);
  const onKey = (e) => { focoChromeKey(e, { root: host }); };
  document.addEventListener("keydown", onKey);
}

// #10 — COMPLETAR O ARTIGO em 4 níveis (fácil/médio/difícil/extremo). Overlay tela cheia (casca do
// Foco), um artigo por vez. fácil/médio = digitar as lacunas (checagem ao vivo, sem acento/caixa);
// difícil = recordar cláusulas inteiras (clicar para revelar, autoavaliação); extremo = redigitar o
// artigo de memória e conferir por diff de palavras.
let _completarNivel = "facil";
const _clNorm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.,;:()"“”'']/g, " ").replace(/\s+/g, " ").trim();
const NIVEIS_CL = [["facil", "Fácil"], ["medio", "Médio"], ["dificil", "Difícil"], ["extremo", "Extremo"]];
function abrirCompletarArtigo(app, store, ids, opts = {}) {
  ids = (ids || []).filter((id) => { const i = store.get().indicacoes.find((x) => x.id === id); return i && (i.texto || "").trim().length > 24; });
  if (!ids.length) return toast("Adicione o texto dos artigos na aba Ler primeiro.", "erro");
  let idx = Math.max(0, Math.min(opts.startIdx || 0, ids.length - 1));
  const cur = () => store.get().indicacoes.find((i) => i.id === ids[idx]);
  const host = document.createElement("div");
  host.className = "leitura-foco-host completar-host";
  document.body.appendChild(host);
  let offTick = null;
  const cleanup = () => { try { if (offTick) offTick(); } catch {} document.removeEventListener("keydown", onKey); host.remove(); app.refresh(); };

  // Monta o miolo do artigo conforme o nível.
  const stageHTML = (ind) => {
    const refCurta = String(ind.referencia || "").split(",")[0].trim();
    const trilha = (ind.estrutura || []).map((n) => n.rotulo + (n.titulo ? " · " + n.titulo : "")).join("  ›  ");
    const clean = corpoArtigoLimpo(ind.texto);
    const nivel = _completarNivel;
    let corpo, dica;
    if (nivel === "extremo") {
      corpo = `<div class="cl-extremo"><textarea class="cl-type" placeholder="Digite o artigo de memória…" spellcheck="false"></textarea><div class="cl-diff" hidden></div></div>`;
      dica = "Redija o artigo inteiro de memória e clique em Conferir.";
    } else {
      const lac = store.lacunasCloze(clean, nivel);
      if (!lac.length) { corpo = `<div class="cl-corpo">${esc(clean)}</div>`; dica = "Este texto é curto demais para gerar lacunas — tente outro nível."; }
      else if (nivel === "dificil") { corpo = `<div class="cl-corpo cl-reveal">${renderClozeSpans(clean, lac)}</div>`; dica = "Recorde a cláusula e clique para conferir."; }
      else { corpo = `<div class="cl-corpo">${renderClozeInputs(clean, lac)}</div>`; dica = "Preencha as lacunas — acento e maiúscula não importam."; }
    }
    return `<div class="cl-artigo">
      ${trilha ? `<div class="lf-trilha">${esc(trilha)}</div>` : ""}
      <div class="lf-ref">${esc(refCurta)}</div>
      <div class="cl-dica">${dica}</div>
      ${corpo}
      <div class="cl-score" aria-live="polite"></div>
    </div>`;
  };
  const renderClozeInputs = (clean, lac) => {
    lac.sort((a, b) => a.idx - b.idx);
    let out = "", pos = 0;
    lac.forEach((l, k) => {
      out += esc(clean.slice(pos, l.idx));
      const w = Math.max(3, Math.min(l.palavra.length, 13));
      out += `<input class="cl-blank" data-k="${k}" data-resp="${esc(l.palavra)}" style="width:${w}ch" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="lacuna ${k + 1}">`;
      pos = l.idx + l.len;
    });
    out += esc(clean.slice(pos));
    return out;
  };
  const renderClozeSpans = (clean, lac) => {
    lac.sort((a, b) => a.idx - b.idx);
    let out = "", pos = 0;
    lac.forEach((l, k) => {
      out += esc(clean.slice(pos, l.idx));
      out += `<span class="cl-hide" data-k="${k}" tabindex="0" role="button" data-resp="${esc(l.palavra)}">${icone("eye-off")}<i>cláusula ${k + 1}</i></span>`;
      pos = l.idx + l.len;
    });
    out += esc(clean.slice(pos));
    return out;
  };

  const rodapeHTML = () => `<div class="cl-barra">
    <div class="cl-niveis">${NIVEIS_CL.map(([id, lbl]) => `<button class="cl-nivel ${_completarNivel === id ? "on" : ""}" data-action="cl-nivel" data-nivel="${id}">${lbl}</button>`).join("")}</div>
    <div class="cl-acoes">
      ${_completarNivel === "extremo"
      ? `<button class="btn btn-sm btn-soft" data-action="cl-conferir">${icone("check")} Conferir</button>`
      : `<button class="btn btn-sm btn-ghost" data-action="cl-revelar">${icone("eye")} Revelar tudo</button>`}
      <button class="btn btn-sm btn-ghost" data-action="cl-recomecar" data-tip="Limpar e recomeçar" data-tip-pos="cima">${icone("rotate-ccw")}</button>
      <button class="lfoco-btn lfoco-ia" data-action="cl-ia" data-tip-pos="cima" data-tip="Perguntar à IA sobre o artigo">${icone("sparkles")}</button>
    </div>
    <div class="lf-legenda">${icone("arrow-left")}${icone("arrow-right")} navegar · <b>Esc</b> sair · o nível troca o desafio</div>
  </div>`;

  const atualizarScore = () => {
    const box = host.querySelector(".cl-score"); if (!box) return;
    if (_completarNivel === "dificil") {
      const tot = host.querySelectorAll(".cl-hide").length, rev = host.querySelectorAll(".cl-hide.on").length;
      box.innerHTML = tot ? `${rev}/${tot} cláusulas reveladas` : "";
      return;
    }
    if (_completarNivel === "extremo") return; // score sai no Conferir
    const inputs = [...host.querySelectorAll(".cl-blank")];
    const ok = inputs.filter((i) => i.classList.contains("ok")).length;
    if (!inputs.length) { box.innerHTML = ""; return; }
    const done = ok === inputs.length;
    box.innerHTML = `<b class="${done ? "cl-full" : ""}">${ok}/${inputs.length}</b> ${done ? "— completou o artigo! " + icone("party-popper") : "corretas"}`;
    if (done) host.querySelector('[data-action="foco-proximo"]')?.classList.add("pulsa");
  };

  const conferirExtremo = () => {
    const ta = host.querySelector(".cl-type"); if (!ta) return;
    const clean = corpoArtigoLimpo(cur().texto);
    const d = wordDiffCl(clean, ta.value);
    const box = host.querySelector(".cl-diff");
    box.hidden = false;
    box.innerHTML = `<div class="cl-diff-txt">${d.html}</div><div class="cl-diff-score"><b class="${d.hit === d.total ? "cl-full" : ""}">${d.hit}/${d.total}</b> palavras corretas</div>`;
    ta.setAttribute("disabled", "");
  };

  const atualizar = () => {
    const ind = cur(); if (!ind) return cleanup();
    const stage = host.querySelector(".fq-stage");
    if (stage) { stage.className = "fq-stage fq-fade"; void stage.offsetWidth; stage.innerHTML = stageHTML(ind); }
    host.querySelector(".fq-rodape").innerHTML = rodapeHTML();
    const bar = host.querySelector(".fq-prog-bar > span"); if (bar) bar.style.width = `${Math.round((100 * (idx + 1)) / ids.length)}%`;
    const pos = host.querySelector(".fq-prog-txt b"); if (pos) pos.textContent = String(idx + 1);
    const prev = host.querySelector('[data-action="foco-anterior"]'); if (prev) prev.disabled = idx <= 0;
    const next = host.querySelector('[data-action="foco-proximo"]'); if (next) next.disabled = idx >= ids.length - 1;
    atualizarScore();
    host.querySelector(".cl-type,.cl-blank")?.focus();
  };

  const ind0 = cur();
  host.innerHTML = focoShellHTML({ idx, total: ids.length, centro: stageHTML(ind0), rodape: rodapeHTML(), aria: "Completar o artigo", anim: "in" });
  // Checagem ao vivo das lacunas digitadas.
  host.addEventListener("input", (e) => {
    const inp = e.target.closest(".cl-blank"); if (!inp) return;
    if (_clNorm(inp.value) === _clNorm(inp.getAttribute("data-resp"))) { inp.classList.add("ok"); inp.setAttribute("readonly", ""); atualizarScore(); const nx = inp.parentElement.querySelector(".cl-blank:not(.ok)"); nx && nx.focus(); }
    else inp.classList.remove("ok");
  });
  host.addEventListener("click", (e) => {
    const hide = e.target.closest(".cl-hide");
    if (hide && !hide.classList.contains("on")) { hide.classList.add("on"); hide.innerHTML = esc(hide.getAttribute("data-resp")); atualizarScore(); }
  });
  bindActions(host, bindFocoCrono({
    "foco-anterior": () => { if (idx > 0) { idx--; atualizar(); } },
    "foco-proximo": () => { if (idx < ids.length - 1) { idx++; atualizar(); } },
    "sair-foco": () => cleanup(),
    "cl-nivel": (el) => { _completarNivel = el.getAttribute("data-nivel"); atualizar(); },
    "cl-revelar": () => {
      host.querySelectorAll(".cl-blank").forEach((i) => { i.value = i.getAttribute("data-resp"); i.classList.add("ok", "revelado"); i.setAttribute("readonly", ""); });
      host.querySelectorAll(".cl-hide:not(.on)").forEach((h) => { h.classList.add("on"); h.innerHTML = esc(h.getAttribute("data-resp")); });
      atualizarScore();
    },
    "cl-recomecar": () => atualizar(),
    "cl-conferir": () => conferirExtremo(),
    "cl-ia": () => { const i = cur(); if (i) perguntarIASobreTrecho({ store, app }, i.id, corpoArtigoLimpo(i.texto)); },
  }));
  offTick = ligarTickCrono(host);
  const chip = host.querySelector(".fq-crono"); if (chip) atualizarChipCrono(chip);
  const onKey = (e) => {
    if (e.key === "Escape") return cleanup();
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; // não navegar enquanto digita
    if (e.key === "ArrowLeft" && idx > 0) { idx--; atualizar(); }
    else if (e.key === "ArrowRight" && idx < ids.length - 1) { idx++; atualizar(); }
  };
  document.addEventListener("keydown", onKey);
  setTimeout(() => host.querySelector(".cl-type,.cl-blank")?.focus(), 60);
}
// Diff de palavras (LCS) para o nível Extremo: revela o texto ORIGINAL com acertos em verde e o que
// faltou esmaecido — o usuário vê exatamente o que lembrou.
function wordDiffCl(orig, typed) {
  const A = String(orig || "").split(/\s+/).filter(Boolean);
  const B = String(typed || "").split(/\s+/).filter(Boolean);
  const a = A.map(_clNorm), b = B.map(_clNorm);
  const n = a.length, mm = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(mm + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = mm - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, hit = 0; const out = [];
  while (i < n) {
    if (j < mm && a[i] === b[j]) { out.push(`<span class="cl-w ok">${esc(A[i])}</span>`); i++; j++; hit++; }
    else if (j < mm && dp[i + 1][j] >= dp[i][j + 1]) { out.push(`<span class="cl-w miss">${esc(A[i])}</span>`); i++; }
    else if (j < mm) { j++; }
    else { out.push(`<span class="cl-w miss">${esc(A[i])}</span>`); i++; }
  }
  return { html: out.join(" "), hit, total: n };
}

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
let filtroRamo = "todos"; // F2 — ramo do direito (jurisprudência)
let filtroAssunto = "todos"; // F2 — assunto dentro do ramo (índice navegável)
let filtroStatus = "todos"; // F2 — vigente | superado | importante
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
  // O recorte de estudo é POR MÓDULO: ao trocar de Lei Seca ↔ Jurisprudência, zera o recorte
  // (senão um Tema escolhido num módulo zeraria silenciosamente o estudo do outro — estudarTemaSel é compartilhado).
  if (_escopoTipo !== tipo) {
    _escopoTipo = tipo;
    estudarLeiSel = null; estudarSecaoSel = null; estudarArtFiltro = ""; estudarTemaSel = null;
    estudarJurisTrib = null; estudarJurisRamo = null; estudarJurisAssunto = null; estudarJurisCat = null;
  }
  _nomesLeis = st.config.nomesLeis || {}; // apelidos de lei (rename) p/ o nomeAmigavelLei
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
      leiFiltro.lei = null; // não deixar um filtro de marcação esconder o artigo alvo (só a lei tem leitor)
      if (tipo === "lei" && !ehMeta(alvo)) { const nn = normaDeRef(alvo.referencia); if (nn) leiAtiva.lei = nn; } // abre a lei certa
      if (tipo === "juris") { filtroTribunal = "todos"; filtroCategoria = "todas"; filtroRamo = "todos"; filtroAssunto = "todos"; filtroStatus = "todos"; }
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
  const statusDe = (i) => (i.revogado || i.status === "superado") ? "superado" : (i.status || "vigente");
  const passaFiltro = (i) =>
    itemNoFiltro(st, i, filtroTop[tipo].sel) &&
    (tipo !== "juris" || filtroTribunal === "todos" || i.tribunal === filtroTribunal) &&
    (tipo !== "juris" || filtroCategoria === "todas" || i.categoria === filtroCategoria) &&
    (tipo !== "juris" || filtroRamo === "todos" || i.ramo === filtroRamo) &&
    (tipo !== "juris" || filtroAssunto === "todos" || i.assunto === filtroAssunto) &&
    (tipo !== "juris" || filtroStatus === "todos" || statusDe(i) === filtroStatus);

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
  // Minhas Leis: por padrão a Lei Seca ABRE na biblioteca (leiAtiva.lei = null). Só entra no leitor
  // quando o usuário escolhe uma lei (ou "continuar"). Se a lei ativa foi removida, volta à biblioteca.
  if (tipo === "lei" && leiAtiva.lei && !normasLei.includes(leiAtiva.lei)) leiAtiva.lei = null;
  const modoLeitor = tipo === "lei" && modo === "ler" && !!leiAtiva.lei;
  const mostrarBiblioteca = tipo === "lei" && modo === "ler" && !leiAtiva.lei && normasLei.length > 0;
  const listaLerFinal = modoLeitor ? listaLer.filter((i) => (normaDeRef(i.referencia) || "Outros") === leiAtiva.lei) : listaLer;
  // Filtro do leitor (estatísticas clicáveis): grifos/anotações vêm das marcações; demais das flags.
  const marcasLei = modoLeitor ? st.marcacoes.filter((m) => m.alvoTipo === "indicacao") : [];
  const comGrifo = new Set(marcasLei.filter((m) => m.cor !== "comentario").map((m) => m.alvoId));
  const comNota = new Set(marcasLei.filter((m) => m.cor === "comentario").map((m) => m.alvoId));
  const passaFiltroLei = (i) => {
    const f = leiFiltro.lei;
    if (!f) return true;
    if (f === "lido") return i.lido;
    if (f === "favorito") return i.favorito;
    if (f === "dificil") return i.dificil;
    if (f === "grifo") return comGrifo.has(i.id);
    if (f === "anotacao") return comNota.has(i.id);
    if (f === "pq") return !!i.pq || (i.pqIncidencia || 0) > 0;
    return true;
  };
  const listaLerVisivel = modoLeitor && leiFiltro.lei ? listaLerFinal.filter(passaFiltroLei) : listaLerFinal;

  root.innerHTML = `
    ${header(r.titulo, `${lerN} ${lerN === 1 ? r.item : r.itemPlural}${metasN ? ` · ${plural(metasN, "meta", "metas")}` : ""}${revN ? ` · ${revN} para revisar` : ""}`, botaoImprimir())}

    <details class="ed-ajuda">
      <summary>Como funciona ${tipo === "juris" ? "a Jurisprudência" : "a Lei Seca"}?</summary>
      <div class="ed-ajuda-corpo">
        <p>Três abas, cada uma um passo: <b>Ler</b> (a letra), <b>Estudar</b> (praticar) e <b>Metas</b> (planejar).</p>
        <p>${icone("book-open")} <b>Ler</b> — a lista com o <b>texto</b> ${tipo === "juris" ? "das súmulas/teses" : "dos artigos"}. Aqui você lê, <b>grifa</b>, marca o que mais cai com a <b>★</b> (a <b>incidência</b> aparece numa mini-barra no item) e <b>importa</b>${tipo === "juris" ? " (colar o texto/informativo ou PDF)" : " (a letra oficial do Planalto/colando — detecta o revogado — ou uma lista/PDF)"}.${tipo === "lei" ? " Em <b>Conferir atualização</b>, o app compara com a fonte e mostra o que <b>mudou/entrou/foi revogado</b> (selo de novidade)." : ""}</p>
        <p>${icone("target")} <b>Estudar</b> — em tela cheia: <b>Certo/Errado</b>, <b>Completar a letra</b>, <b>Revisar o que vence</b> e <b>Refazer erros</b>${tipo === "juris" ? ", além da <b>Súmula-duelo</b> (número/tribunal trocado)" : ""}. Escolha o <b>escopo</b> (tudo ou o que mais cai); toda geração pergunta <b>quantidade e dificuldade</b> e você ainda gera <b>flashcards</b> e <b>questões</b>.</p>
        <p>${icone("calendar-check")} <b>Metas</b> — planeje a leitura. No topo, o app mostra seu <b>progresso</b>, <b>ritmo</b> e <b>previsão de conclusão</b>; em <b>Hoje</b>, suas metas do dia e as <b>revisões que vencem</b> (com a semana à frente). Crie metas (ex.: "ler ${tipo === "juris" ? "os informativos 810–815" : "art. 1º a 20"}") que viram <b>tarefa no Planejamento</b>, mostram o <b>progresso</b> quando dá para medir, e podem ser <b>divididas em etapas</b> ou <b>importadas de um cronograma</b>.</p>
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
      ${modo === "ler" && !modoLeitor && !mostrarBiblioteca ? `<button class="btn btn-ghost btn-sm" data-action="toggle-pq-import" data-tip-pos="cima-esq" data-tip="Marque o que mais cai (incidência): a IA sugere ou você importa uma estatística.">${icone("star")} Marcar incidência</button>` : ""}
      ${modo === "ler" && !modoLeitor && !mostrarBiblioteca && st.indicacoes.some((i) => (i.tipo || "lei") === (tipo === "juris" ? "juris" : "lei") && (i.texto || "").trim().length >= 20) ? `<button class="btn btn-ia btn-sm" data-action="abrir-indice" data-tip-pos="cima-esq" data-tip="Separar ${tipo === "juris" ? "as súmulas/teses" : "os artigos"} para a Busca por significado (IA) do chat — só deste módulo.">${icone("sparkles")} Busca IA</button>` : ""}
      ${modo === "metas" ? `<button class="btn btn-add btn-sm" data-action="nova-meta" data-tip-pos="cima-esq" data-tip="Criar uma meta de leitura (ex.: 'ler art. 1º a 20'). Dá para dividir em etapas; vira tarefa no Planejamento.">${icone("calendar-check")} Nova meta</button>` : ""}
      ${modo === "metas" ? `<button class="btn btn-ghost btn-sm" data-action="importar-metas" data-tip-pos="cima-esq" data-tip="Importar um cronograma/tabela de metas de leitura (colar ou PDF). Cada linha vira uma meta.">${icone("download")} Importar metas</button>` : ""}
      <span class="spacer"></span>
      ${modo === "ler" && !modoLeitor && !mostrarBiblioteca && novidadesN ? `<button class="btn ${lerFiltroNov[tipo] ? "btn-soft" : "btn-ghost"} btn-sm" data-action="filtro-novidades" data-tip-pos="cima-dir" data-tip="Mostrar só os dispositivos com novidade legislativa (mudaram/entraram na última conferência).">${icone("file-clock")} Novidades <span class="mini-tag nov-tag">${novidadesN}</span></button>` : ""}
      ${modo !== "estudar" && !mostrarBiblioteca ? filtroTopicosBotaoHTML(st, filtroTop[tipo].sel, filtroTop[tipo].aberto) : ""}
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
              </select></span>
             ${(() => { const ramos = [...new Set(st.indicacoes.filter((i) => i.tipo === "juris" && i.ramo).map((i) => i.ramo))].sort(); return ramos.length ? `<span class="ls-fpill ${filtroRamo !== "todos" ? "on" : ""}"><span class="ls-fpill-lbl">Ramo</span>
              <select class="ls-fpill-sel" id="f-ramo">
                <option value="todos" ${filtroRamo === "todos" ? "selected" : ""}>Todos</option>
                ${ramos.map((rm) => `<option value="${esc(rm)}" ${filtroRamo === rm ? "selected" : ""}>${esc(rm)}</option>`).join("")}
              </select></span>` : ""; })()}
             <span class="ls-fpill ${filtroStatus !== "todos" ? "on" : ""}"><span class="ls-fpill-lbl">Vigência</span>
              <select class="ls-fpill-sel" id="f-status">
                <option value="todos" ${filtroStatus === "todos" ? "selected" : ""}>Todas</option>
                <option value="vigente" ${filtroStatus === "vigente" ? "selected" : ""}>Vigentes</option>
                <option value="importante" ${filtroStatus === "importante" ? "selected" : ""}>Importantes</option>
                <option value="superado" ${filtroStatus === "superado" ? "selected" : ""}>Superadas</option>
              </select></span>`
          : ""
      }
    </div>
    ${modo !== "estudar" ? filtroTopicosPainelHTML(st, filtroTop[tipo].sel, filtroTop[tipo].aberto) : ""}
    ${tipo === "juris" && modo === "ler" && !modoLeitor ? ultimoInfoBadgeHTML(st) : ""}

    ${mostrarBiblioteca ? bibliotecaLeisHTML(st, store, normasLei) : ""}

    ${modoLeitor ? leitorBarraHTML(st, store, leiAtiva.lei, normasLei, listaLerFinal, { comGrifo, comNota, filtro: leiFiltro.lei }) : ""}

    ${tipo === "juris" && modo === "ler" && !modoLeitor ? `<div class="juris-layout">${indiceJurisHTML(st)}<div class="juris-main">` : ""}
    ${mostrarBiblioteca ? "" : `<div class="lista-leiseca"${modoLeitor ? ` data-ler-fonte="${(st.config.leitura || {}).fonte || "inter"}" data-ler-tam="${(st.config.leitura || {}).tamanho || "media"}" data-ler-esp="${(st.config.leitura || {}).espacamento || "normal"}" data-ler-align="${(st.config.leitura || {}).align || "esquerda"}" data-ler-tema="${(st.config.leitura || {}).tema || "auto"}"` : ""}>
      ${
        modo === "estudar" ? estudarCorpoHTML(store, st, tipo, r)
        : modo === "metas" ? metasCorpoHTML(st, tipo, listaMetas, r, store)
        : lerCorpoHTML(st, tipo, lerFiltroNov[tipo] ? listaLerVisivel.filter((i) => i.novidadeEm) : listaLerVisivel, r, store, vincMap, modoLeitor, modoLeitor ? leiFiltro.lei : null)
      }
    </div>`}
    ${tipo === "juris" && modo === "ler" && !modoLeitor ? `</div></div>` : ""}
    ${modoLeitor ? `<button class="ler-continuar-pill" data-action="ler-continuar" hidden>${icone("corner-down-right")} Continuar de onde parou<span class="lcp-art"></span></button>` : ""}`;

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
  root.querySelector("#f-ramo")?.addEventListener("change", (e) => { filtroRamo = e.target.value; app.refresh(); });
  root.querySelector("#f-status")?.addEventListener("change", (e) => { filtroStatus = e.target.value; app.refresh(); });
  // Leitor (F1a): trocar de lei + "ir para artigo".
  root.querySelector("#ler-norma")?.addEventListener("change", (e) => { leiAtiva.lei = e.target.value; app.refresh(); });
  // Estudar: seletor de escopo/objeto (lei + seção estrutural) — via change (não fecha o dropdown).
  root.querySelector('[data-action="escopo-lei"]')?.addEventListener("change", (e) => { estudarLeiSel = e.target.value; estudarSecaoSel = null; estudarArtFiltro = ""; estudarTemaSel = null; app.refresh(); });
  root.querySelector('[data-action="escopo-secao"]')?.addEventListener("change", (e) => { estudarSecaoSel = e.target.value || null; app.refresh(); });
  root.querySelector('[data-action="escopo-art"]')?.addEventListener("change", (e) => { estudarArtFiltro = e.target.value.trim(); app.refresh(); });
  root.querySelector('[data-action="escopo-tema"]')?.addEventListener("change", (e) => { estudarTemaSel = e.target.value || null; app.refresh(); });
  // C.2.4 — recorte de estudo da juris (ramo muda → zera assunto, cascata).
  root.querySelector('[data-action="escopo-j-trib"]')?.addEventListener("change", (e) => { estudarJurisTrib = e.target.value || null; app.refresh(); });
  root.querySelector('[data-action="escopo-j-ramo"]')?.addEventListener("change", (e) => { estudarJurisRamo = e.target.value || null; estudarJurisAssunto = null; app.refresh(); });
  root.querySelector('[data-action="escopo-j-assunto"]')?.addEventListener("change", (e) => { estudarJurisAssunto = e.target.value || null; app.refresh(); });
  root.querySelector('[data-action="escopo-j-cat"]')?.addEventListener("change", (e) => { estudarJurisCat = e.target.value || null; app.refresh(); });
  root.querySelector("#ler-goto")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const n = parseInt(e.target.value, 10);
    if (!n) return;
    const alvo = st.indicacoes.find((i) => i.tipo === tipo && (normaDeRef(i.referencia) || "") === leiAtiva.lei && numArtigo(i.referencia) === n);
    if (alvo) app.navigate("leiseca", { focoIndicacaoId: alvo.id });
    else toast(`Art. ${n} não encontrado em ${leiAtiva.lei}.`, "erro");
  });
  // F2/detalhes: menu flutuante de grifo/IA + rastreio de posição de leitura.
  if (modoLeitor) {
    _leitorCtx = { store, app, norma: leiAtiva.lei }; garantirGrifoFlutuante(); garantirPopoverMarca(); garantirScrollSpy(root);
    // #5 V2: persistir o recolhimento das seções do índice. O evento "toggle" NÃO borbulha → captura.
    // IMPORTANTE: o Chrome DISPARA "toggle" ao inserir cada <details open> no render; se gravássemos
    // sempre, viraria commit→render→toggle→commit… (loop). Então só grava se o estado MUDOU de fato.
    root.querySelector(".lista-leiseca")?.addEventListener("toggle", (e) => {
      const d = e.target;
      if (!d || !d.classList || !d.classList.contains("ls-estr") || _indiceColapsado) return;
      const key = d.getAttribute("data-estr-key"); if (!key) return;
      const map = { ...((store.get().config.leitura || {}).indiceFechado || {}) };
      const set = new Set(map[leiAtiva.lei] || []);
      if (d.open === !set.has(key)) return; // já bate com o salvo (ex.: toggle disparado no render) → ignora
      if (d.open) set.delete(key); else set.add(key);
      map[leiAtiva.lei] = [...set];
      store.setLeitura({ indiceFechado: map });
    }, true);
  }
  focarItem(root, focoInd);

  // Escopo do Estudar: itens com texto (tudo, ou só o top 20% de incidência).
  // Escopo/objeto do estudo: lei escolhida (ou a ativa) + seção estrutural opcional + intensidade.
  const noEscopoEstudo = (i) => {
    if (tipo !== "lei") { // C.2.4: juris filtra por tribunal/ramo/assunto/categoria/tema
      if (estudarJurisTrib && String(i.tribunal || "") !== estudarJurisTrib) return false;
      if (estudarJurisRamo && String(i.ramo || "") !== estudarJurisRamo) return false;
      if (estudarJurisAssunto && String(i.assunto || "") !== estudarJurisAssunto) return false;
      if (estudarJurisCat && String(i.categoria || "") !== estudarJurisCat) return false;
      if (estudarTemaSel && !(Array.isArray(i.temas) && i.temas.includes(estudarTemaSel))) return false;
      return true;
    }
    const leiSel = estudarLeiSel || leiAtiva.lei;
    if (leiSel && leiSel !== "todas" && normaDeRef(i.referencia) !== leiSel) return false;
    if (estudarSecaoSel && !(Array.isArray(i.estrutura) && i.estrutura.some((n) => n.rotulo + "|" + (n.titulo || "") === estudarSecaoSel))) return false;
    const ar = parseIntervaloArt(estudarArtFiltro);
    if (ar) { const nn = numArtigo(i.referencia); if (nn < ar.de || nn > ar.ate) return false; }
    if (estudarTemaSel && !(Array.isArray(i.temas) && i.temas.includes(estudarTemaSel))) return false;
    return true;
  };
  const escopoItens = () => {
    let arr = todasDoTipo.filter((i) => !i.metaLeitura && !i.revogado && (i.texto || "").trim() && passaFiltro(i) && noEscopoEstudo(i));
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
      // Com uma lei aberta no leitor, o Imprimir é CONTEXTUAL (lei inteira / filtro / grifados;
      // crua ou com grifos). Fora do leitor, mantém a impressão da lista por filtros.
      if (modoLeitor) return imprimirLeiContexto(store, leiAtiva.lei, listaLerFinal, listaLerVisivel, leiFiltro.lei);
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
    // Fase 6 — índice de busca semântica DENTRO do módulo (Lei Seca/Jurisprudência), não mais em Materiais.
    "abrir-indice": () => { if (!store.iaDisponivel()) return avisoIA(app, "Busca por significado"); abrirIndiceModulo(app, tipo); },
    // Minhas Leis — abrir uma lei do card, voltar à biblioteca, ou continuar de onde parou.
    "abrir-lei": (el) => { leiAtiva.lei = el.getAttribute("data-norma"); leiFiltro.lei = null; app.refresh(); },
    "voltar-biblioteca": () => { leiAtiva.lei = null; leiFiltro.lei = null; app.refresh(); },
    "continuar-leitura": () => {
      const ul = store.get().config.ultimaLeitura || {};
      const cand = normasLei.filter((n) => ul[n] && ul[n].em).sort((a, b) => (ul[a].em < ul[b].em ? 1 : -1));
      const n = cand[0];
      if (!n) return toast("Você ainda não começou a ler nenhuma lei.", "erro");
      leiAtiva.lei = n;
      leiFiltro.lei = null;
      const artId = ul[n].indicacaoId;
      if (artId) app.navigate("leiseca", { focoIndicacaoId: artId });
      else app.refresh();
    },
    "filtro-novidades": () => { lerFiltroNov[tipo] = !lerFiltroNov[tipo]; app.refresh(); },
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
    "ler-aleatorio": () => { // #15: sorteia um artigo da lei atual e abre no leitor
      const arts = st.indicacoes.filter((i) => i.tipo === "lei" && !i.metaLeitura && !i.revogado && (i.texto || "").trim() && (normaDeRef(i.referencia) || "Outros") === leiAtiva.lei);
      if (!arts.length) return toast("Sem artigos nesta lei para sortear.", "erro");
      app.navigate("leiseca", { focoIndicacaoId: arts[Math.floor(Math.random() * arts.length)].id });
    },
    // ---- Estudar (lançador) ----
    "estudar-escopo": (el) => { estudarEscopo[tipo] = el.getAttribute("data-e"); app.refresh(); },
    "estudar-escopo-toggle": () => { _escopoAberto = !_escopoAberto; app.refresh(); },
    "estudar-escopo-limpar": () => { estudarSecaoSel = null; estudarArtFiltro = ""; estudarTemaSel = null; estudarJurisTrib = null; estudarJurisRamo = null; estudarJurisAssunto = null; estudarJurisCat = null; estudarEscopo[tipo] = "tudo"; app.refresh(); },
    "estudar-tema-chip": (el) => { const t = el.getAttribute("data-tema"); estudarTemaSel = estudarTemaSel === t ? null : t; estudarSecaoSel = null; estudarArtFiltro = ""; app.refresh(); }, // F2: atalho memorizar por tema
    "estudar-tema-limpar": () => { estudarTemaSel = null; app.refresh(); },
    "estudar-cross-lei": () => { estudarLeiSel = estudarLeiSel === "todas" ? null : "todas"; estudarSecaoSel = null; app.refresh(); }, // F2: tema em todas as leis
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
    // Inteligência por tema: foca o escopo do Estudar no tema onde o aluno mais erra.
    "estudar-tema-fraco": () => {
      const tf = store.temasComErro(tipo)[0]; if (!tf) return;
      estudarTemaSel = tf.tema; estudarSecaoSel = null; estudarArtFiltro = "";
      toast(`Escopo focado no tema “${tf.tema}”. Escolha Certo/Errado ou Completar a letra.`);
      app.refresh();
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
    "estudar-cloze": () => {
      const itens = escopoItens();
      if (!itens.length) return toast("Adicione o texto dos artigos na aba Ler primeiro.", "erro");
      abrirCompletarArtigo(app, store, itens.map((i) => i.id));
    },
    // Gerar material do escopo: flashcards (IA, com fallback offline) e questões de múltipla escolha.
    "estudar-flashcards": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar flashcards"); // "Gerar com IA" exige IA (igual questões)
      const itens = escopoItens();
      if (!itens.length) return toast("Adicione o texto dos artigos na aba Ler primeiro.", "erro");
      const g = await pedirNumero("Quantos flashcards por artigo?", { padrao: 3, min: 1, max: 6, nivel: true });
      if (!g) return;
      const alvo = itens.slice(0, 12);
      const rot = `da ${nomeAmigavelLei(estudarLeiSel || leiAtiva.lei)}`;
      const lote = store.iniciarLoteGeracao(rot);
      // Progresso narrado por artigo (o comOcupado tinha mensagem fixa e parecia travado);
      // corte de 12 avisado ANTES, no rótulo inicial. Botão ocupado mantido como antes.
      const fim = toastCarregando(itens.length > 12 ? "Gerando flashcards com IA… (limite de 12 por vez)" : "Gerando flashcards com IA…");
      if (el) { el.classList.add("carregando"); el.disabled = true; el.setAttribute("aria-busy", "true"); }
      let total = 0;
      try {
        let i = 0;
        for (const it of alvo) { fim(`Gerando flashcards com IA… ${++i}/${alvo.length}`); try { const cs = await store.gerarFlashcardsIADeIndicacao(it.id, g.n, g.dificuldade); total += cs.length; } catch (e) { console.error(e); } }
      } finally {
        fim();
        if (el) { el.classList.remove("carregando"); el.disabled = false; el.removeAttribute("aria-busy"); }
        store.encerrarLoteGeracao();
      }
      toast(total ? `${plural(total, "flashcard gerado", "flashcards gerados")}${itens.length > 12 ? " (12 primeiros do escopo)" : ""}.` : "A IA não retornou flashcards.", total ? "ok" : "erro");
      if (total) app.navigate("flashcards", { lote, loteRotulo: rot }); // abre mostrando só os recém-gerados
    },
    "estudar-questoes": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar questões");
      const itens = escopoItens();
      if (!itens.length) return toast("Adicione o texto dos artigos na aba Ler primeiro.", "erro");
      const r = await pedirNumero("Quantas questões de múltipla escolha por artigo?", { padrao: 2, min: 1, max: 5, nivel: true });
      if (!r) return;
      const alvo = itens.slice(0, 12); // limita p/ não estourar a cota de IA
      const rot = `da ${nomeAmigavelLei(estudarLeiSel || leiAtiva.lei)}`;
      const lote = store.iniciarLoteGeracao(rot);
      // Progresso narrado por artigo + aviso do corte de 12 ANTES (mesmo padrão dos flashcards).
      const fim = toastCarregando(itens.length > 12 ? "Gerando questões com IA… (limite de 12 por vez)" : "Gerando questões de múltipla escolha com IA…");
      if (el) { el.classList.add("carregando"); el.disabled = true; el.setAttribute("aria-busy", "true"); }
      let total = 0;
      try {
        let i = 0;
        for (const it of alvo) { fim(`Gerando questões com IA… ${++i}/${alvo.length}`); try { const qs = await store.gerarQuestoesDeIndicacao(it.id, r.n, r.dificuldade, "mc"); total += qs.length; } catch (e) { console.error(e); } }
      } finally {
        fim();
        if (el) { el.classList.remove("carregando"); el.disabled = false; el.removeAttribute("aria-busy"); }
        store.encerrarLoteGeracao();
      }
      toast(total ? `${plural(total, "questão gerada", "questões geradas")}${itens.length > 12 ? " (12 primeiros do escopo)" : ""}.` : "A IA não retornou questões. Confira se os artigos têm texto.", total ? "ok" : "erro");
      if (total) app.navigate("pratica", { lote, loteRotulo: rot }); // abre mostrando só as recém-geradas
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
    // F6 — Planejamento: define a meta quantitativa diária (só quantidade; sem dificuldade).
    "meta-set": async (el) => {
      const k = el.getAttribute("data-k");
      const atual = (store.get().config.metasLeitura || {})[k] || 0;
      const g = await pedirNumero(k === "artigosDia" ? "Meta de artigos por dia:" : "Meta de questões por dia:", { padrao: atual || (k === "artigosDia" ? 10 : 20), min: 0, max: 999 });
      if (!g) return;
      store.setMetaLeitura(k, g.n);
      toast(g.n ? "Meta diária definida." : "Meta removida.");
      app.refresh();
    },
    "ir-revisoes": () => app.navigate("revisoes"),
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
    "ler-buscar": () => abrirBuscaLei(app, store, leiAtiva.lei, listaLerFinal),
    // Renomear a lei (corrigir nome detectado errado). Só muda a exibição, não as citações.
    "ler-renomear": () => abrirRenomearLei(app, store, leiAtiva.lei),
    "ler-personalizar": () => abrirPersonalizarBarra(app, store),
    // Ações em lote (antes no modal "Ferramentas"; agora itens diretos do menu Opções ⋯).
    "ler-grifar-auto": () => acaoGrifarAuto(app, store, listaLerFinal),
    "ler-grifar-ia": (el) => acaoGrifarIA(app, store, listaLerFinal, el),
    "ler-temas": () => acaoClassificarTemas(app, store, listaLerFinal),
    "ler-temas-ia": () => acaoRefinarTemasIA(app, store, listaLerFinal, leiAtiva.lei),
    "ler-lido-bloco": () => abrirMarcarLidoBloco(app, store, listaLerFinal, leiAtiva.lei),
    "ler-imprimir-grifos": () => acaoImprimirGrifos(store, listaLerFinal, leiAtiva.lei),
    "ler-limpar-grifos": () => acaoLimparGrifos(app, store, listaLerFinal),
    "ler-site": () => { const u = (listaLerFinal.find((i) => i.fonteUrl) || {}).fonteUrl; if (u) window.open(u, "_blank", "noopener"); },
    "ler-indice": () => { _indiceColapsado = !_indiceColapsado; app.refresh(); },
    // Continuar de onde parou: rola até o artigo salvo (última posição de leitura) e some a pílula.
    "ler-continuar": () => {
      const ult = (store.get().config.ultimaLeitura || {})[leiAtiva.lei];
      const el = ult && ult.indicacaoId ? root.querySelector(`.ler-art[data-id="${ult.indicacaoId}"]`) : null;
      if (el) {
        const c = document.querySelector(".content") || document.scrollingElement;
        const barBottom = root.querySelector(".ler-topo") ? root.querySelector(".ler-topo").getBoundingClientRect().bottom : 120;
        if (c) c.scrollTop += el.getBoundingClientRect().top - barBottom - 14;
      }
      root.querySelector(".ler-continuar-pill")?.setAttribute("hidden", "");
    },
    // Estatística clicável = filtro do leitor (clicar de novo no mesmo limpa).
    "ler-stat-filtro": (el) => { const f = el.getAttribute("data-f"); leiFiltro.lei = leiFiltro.lei === f ? null : f; app.refresh(); },
    "ler-limpar-filtro": () => { leiFiltro.lei = null; app.refresh(); },
    // F3 — abre a leitura em foco (tela cheia), na ordem dos artigos da lei ativa.
    // Por padrão, o Foco CONTINUA de onde parou (posição salva pelo próprio Foco); se nunca leu,
    // começa no 1º artigo ainda não lido. Para começar noutro artigo: abrir o ⋯ do artigo → Ler em foco.
    "ler-foco-modo": () => {
      const ordenados = listaLerFinal.slice().sort((a, b) => numArtigo(a.referencia) - numArtigo(b.referencia));
      const ids = ordenados.map((i) => i.id);
      if (!ids.length) return;
      const ult = (st.config.ultimaLeitura || {})[leiAtiva.lei];
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
    // F2 — índice navegável (ramo → assunto): clicar filtra a lista.
    "juris-idx-ramo": (el) => { const rm = el.getAttribute("data-ramo"); const igual = filtroRamo === rm && filtroAssunto === "todos"; filtroRamo = igual ? "todos" : rm; filtroAssunto = "todos"; app.refresh(); },
    "juris-idx-assunto": (el) => { const rm = el.getAttribute("data-ramo"), as = el.getAttribute("data-assunto"); const igual = filtroRamo === rm && filtroAssunto === as; filtroRamo = igual ? "todos" : rm; filtroAssunto = igual ? "todos" : as; app.refresh(); },
    "juris-idx-limpar": () => { filtroRamo = "todos"; filtroAssunto = "todos"; app.refresh(); },
    // F2 (#4) — estudo ativo por card.
    "card-ce": (el) => { const it = st.indicacoes.find((x) => x.id === el.getAttribute("data-id")); if (it) iniciarCE([it], { n: 4, dificuldade: "medio", regenerate: true }); },
    "card-cloze": (el) => abrirCompletarArtigo(app, store, [el.getAttribute("data-id")]),
    "card-flash": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar flashcards");
      const id = el.getAttribute("data-id");
      const cs = await comOcupado(() => store.gerarFlashcardsIADeIndicacao(id, 4, "medio"), { botao: el, msg: "Gerando flashcards…" });
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
      ${tipo === "juris" ? `<label class="u-block u-mb-8">Categoria ${categoriaPickerHTML("", "add-cat")}</label>` : ""}
      <label class="btn btn-ghost btn-file u-mb-8" data-tip-pos="cima-esq" data-tip="Importar de um PDF ou arquivo .txt. Você também pode arrastar o arquivo aqui.">${icone("paperclip")} Importar de arquivo
        <input id="add-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden />
      </label>
      <p class="muted small u-m-0 u-mb-8">${instrHTML}</p>
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
function indPreviewHTML(st, tipo, modo, r, itens, store) {
  const ehJuris = tipo === "juris";
  const catOpcoes = (sel) => `<option value="">— categoria —</option>` + CATEGORIAS_JURIS.map((c) => `<option ${sel === c ? "selected" : ""}>${c}</option>`).join("");
  // F1 — meta rica do julgado (extração de informativo) em chips read-only.
  const metaChips = (it) => {
    if (!ehJuris) return "";
    const chip = (txt, cls) => txt ? `<span class="prev-chip ${cls || ""}">${esc(txt)}</span>` : "";
    const stt = it.status === "superado" ? chip("superado", "st-super") : it.status === "importante" ? chip("importante", "st-import") : (it.status ? chip("vigente", "st-vig") : "");
    return `<div class="prev-meta">
      ${chip(it.ramo, "ramo")}${it.assunto ? `<span class="prev-chip sub">${esc(it.assunto)}</span>` : ""}
      ${chip(it.orgao)}${chip(it.processo, "mono")}${it.tema ? chip("Tema " + it.tema) : ""}${chip(it.dataJulgamento, "mono")}${stt}
    </div>`;
  };
  // F1 — dedup: se o julgado já existe, marca e oferece pular/enriquecer/substituir.
  const dupBloco = (it, i) => {
    const dup = ehJuris && store ? store.dupIndicacao(it) : null;
    if (!dup) return "";
    const acao = it._acao || "enriquecer";
    return `<div class="prev-dup">
      <span class="prev-dup-tag">${icone("info")} já no sistema${dup.nInformativo ? ` (Inf. ${esc(dup.nInformativo)})` : dup.tribunal ? ` (${esc(dup.tribunal)})` : ""}</span>
      <select class="ind-acao-edit" data-i="${i}" data-tip="Enriquecer = soma esta fonte ao item existente; Pular = ignora; Substituir = troca pelo novo.">
        <option value="enriquecer" ${acao === "enriquecer" ? "selected" : ""}>enriquecer o existente</option>
        <option value="pular" ${acao === "pular" ? "selected" : ""}>pular (já tenho)</option>
        <option value="substituir" ${acao === "substituir" ? "selected" : ""}>substituir</option>
      </select>
    </div>`;
  };
  const nDup = ehJuris && store ? itens.filter((it) => store.dupIndicacao(it)).length : 0;
  return `<div class="card form-leiseca">
    <h3>${icone("download")} Revisar ${itens.length} ${itens.length === 1 ? "item" : "itens"} antes de adicionar</h3>
    <p class="muted small u-m-0 u-mb-8">Edite a referência, o trecho e a observação de cada item; remova (✕) o que não quiser. O vínculo (disciplina/tópico${ehJuris ? "/tribunal" : ""}) escolhido acima vale para todos.${nDup ? ` <b>${nDup} já ${nDup === 1 ? "está" : "estão"} no sistema</b> — escolha enriquecer, pular ou substituir.` : ""}</p>
    <ul class="prev-editavel">
      ${itens
        .map((it, i) => {
          return `<li class="prev-card m-leiseca">
            <div class="prev-card-l1">
              <input class="prev-inp ind-ref-edit" data-i="${i}" value="${esc(it.referencia || "")}" placeholder="${r.ph}" />
              <button class="prev-remover" data-action="remover-ind" data-i="${i}" data-tip-pos="cima-dir" data-tip="Remover este item">${icone("x")}</button>
            </div>
            ${metaChips(it)}
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
            ${dupBloco(it, i)}
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
      <p class="muted small u-m-0 u-mb-12">Traz a <b>letra exata</b> do texto oficial. No app <b>desktop</b> a busca é automática pelo site do Planalto; no navegador (por segurança do site), <b>cole o texto/HTML</b> da página. O app detecta sozinho o que está <b>revogado</b>.</p>
      <div class="form-row">
        <label style="flex:1 1 260px">Lei mais cobrada (catálogo)
          <select id="imp-cat">${opcCat}</select></label>
        <label style="flex:1 1 160px">Artigos (opcional)
          <input id="imp-intervalo" value="${esc(estado.form.intervalo)}" placeholder="ex.: 1-5, 37, 121-127" data-tip="Deixe vazio para trazer a lei inteira. Ou informe artigos/intervalos: 1-5, 37, 213-217." /></label>
      </div>
      <label class="u-block u-mt-4 u-mb-8">Ou link direto da página oficial
        <input id="imp-url" value="${esc(estado.form.url)}" placeholder="https://www.planalto.gov.br/…" /></label>
      <label class="u-block u-mt-4 u-mb-8">Ou cole aqui o texto/HTML da lei (fallback do navegador)
        <textarea id="imp-html" rows="5" placeholder="Cole o conteúdo da página oficial da lei (Ctrl+A, Ctrl+C na página do Planalto e cole aqui).">${esc(estado.form.html)}</textarea></label>
      <div class="form-row u-flex-12 u-wrap">
        <label class="inline">Vincular à disciplina <select id="imp-disc">${opcDisc}</select></label>
      </div>
      ${estado.processando ? `<div class="prova-status lendo u-flex u-mt-8"><span class="mini-spin"></span> Buscando a lei no site oficial e extraindo os artigos… (leis grandes, como a CF, podem levar alguns segundos)</div>` : ""}
      ${!estado.processando && estado.msg ? `<p class="${/desktop|cole/i.test(estado.msg) ? "muted" : "erro-msg"} small u-m-0 u-mt-8">${esc(estado.msg)}</p>` : ""}
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="imp-cancelar" ${estado.processando ? "disabled" : ""}>Cancelar</button>
        <button class="btn btn-primary ${estado.processando ? "carregando" : ""}" data-action="imp-preparar" ${estado.processando ? "disabled" : ""}>${estado.processando ? "Buscando…" : "Buscar / Preparar"}</button>
      </div>
    </div>`;
  };

  const trunc = (s, n = 220) => { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; };
  const previewHTML = () => {
    const vig = estado.artigos.filter((a) => !a.revogado);
    const rev = estado.artigos.map((a, i) => ({ a, i })).filter((x) => x.a.revogado);
    return `<div class="card form-leiseca">
      <h3>${icone("scroll-text")} ${esc(estado.norma || "Lei")} — ${estado.artigos.length} ${estado.artigos.length === 1 ? "artigo" : "artigos"}</h3>
      <p class="muted small u-m-0 u-mb-8">Confira antes de gravar. ${rev.length ? `Há <b>${rev.length}</b> ${rev.length === 1 ? "artigo revogado" : "artigos revogados"} (o Planalto marca tachado); por padrão ficam de fora.` : "Nenhum artigo revogado detectado."}</p>
      ${rev.length ? `<div class="imp-rev-bloco">
        <div class="imp-rev-tit">${icone("eye")} Revogados — decida o que fazer:</div>
        ${rev.length > 1 ? `<div class="imp-rev-todos">
          <span class="muted small">Aplicar a todos os ${rev.length}:</span>
          <button class="btn btn-ghost btn-sm" data-action="imp-todos" data-v="excluir">Excluir todos</button>
          <button class="btn btn-ghost btn-sm" data-action="imp-todos" data-v="riscar">Manter riscado todos</button>
          <button class="btn btn-ghost btn-sm" data-action="imp-todos" data-v="vigente">Está vigente todos</button>
        </div>` : ""}
        ${rev.map(({ a, i }) => `<div class="imp-rev-item">
          <div class="imp-rev-ref"><s>${esc(a.referencia)}</s></div>
          <div class="imp-rev-opts">
            <label><input type="radio" class="imp-rev-radio" name="rev-${i}" value="excluir" ${(estado.decis[i] || "excluir") === "excluir" ? "checked" : ""} data-i="${i}" /> Excluir</label>
            <label><input type="radio" class="imp-rev-radio" name="rev-${i}" value="riscar" ${estado.decis[i] === "riscar" ? "checked" : ""} data-i="${i}" /> Manter riscado</label>
            <label><input type="radio" class="imp-rev-radio" name="rev-${i}" value="vigente" ${estado.decis[i] === "vigente" ? "checked" : ""} data-i="${i}" /> Está vigente (foi engano)</label>
          </div>
        </div>`).join("")}
      </div>` : ""}
      <div class="imp-vig-lista">
        ${comDivisoriasEstrutura(vig.slice(0, 60), (a) => `<div class="imp-vig-item"><b>${esc(a.referencia)}</b><span class="muted small"> ${esc(trunc(a.texto))}</span></div>`)}
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
      // Rádios dos revogados por 'change' (não 'data-action': o bindActions dá preventDefault e
      // travaria a marcação do rádio). Cada mudança grava a decisão do artigo.
      corpo.querySelectorAll(".imp-rev-radio").forEach((el) =>
        el.addEventListener("change", () => { estado.decis[+el.getAttribute("data-i")] = el.value; }));
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "imp-preparar": async () => {
        lerForm(corpo);
        if (!estado.form.html.trim() && !estado.form.url) { estado.msg = "Escolha uma lei do catálogo, cole um link ou cole o texto da lei."; toast(estado.msg, "erro"); return rerender(); }
        estado.processando = true; estado.msg = ""; rerender();
        toast(estado.form.html.trim() ? "Extraindo os artigos do texto…" : "Buscando a lei no Planalto…");
        try {
          const r = await store.prepararLei({
            html: estado.form.html.trim() || undefined,
            url: estado.form.html.trim() ? undefined : estado.form.url,
            norma: estado.form.norma || undefined,
            intervalo: estado.form.intervalo,
          });
          estado.processando = false;
          if (!r.artigos.length) { estado.msg = "Não encontrei artigos nesse conteúdo. Confira o link/texto ou o intervalo informado."; toast(estado.msg, "erro"); return rerender(); }
          estado.norma = r.norma; estado.artigos = r.artigos; estado.revogados = r.revogados;
          estado.decis = {}; estado.etapa = "preview"; rerender();
          toast(`${r.artigos.length} ${r.artigos.length === 1 ? "artigo encontrado" : "artigos encontrados"}. Confira e importe.`, "ok");
        } catch (e) {
          console.error("[importar-lei]", e);
          estado.processando = false;
          estado.msg = e && e.code === "SEM_DESKTOP"
            ? "A busca automática no Planalto só funciona no app desktop. Abra a página oficial no navegador, copie o texto (Ctrl+A, Ctrl+C) e cole no campo acima."
            : (e && e.message) || "Não consegui buscar a página. Confira o link ou cole o texto.";
          toast(estado.msg, "erro");
          rerender();
        }
      },
      // Aplicar uma decisão a TODOS os revogados de uma vez (o usuário ainda pode ajustar 1 a 1).
      "imp-todos": (el) => {
        const v = el.getAttribute("data-v");
        estado.artigos.forEach((a, i) => { if (a.revogado) estado.decis[i] = v; });
        rerender();
        toast(v === "excluir" ? "Todos os revogados marcados para excluir." : v === "riscar" ? "Todos os revogados serão mantidos riscados." : "Todos os revogados marcados como vigentes.", "ok");
      },
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
      <p class="muted small u-m-0 u-mb-12">Reconsulta a <b>fonte oficial</b> e compara com o texto guardado: mostra o que <b>mudou</b>, foi <b>adicionado</b> ou <b>revogado</b> (diff mecânico, sem IA). No desktop a busca é automática; no navegador, <b>cole o texto atualizado</b> da lei.</p>
      ${normas.length ? `<div class="form-row">
        <label style="flex:1 1 260px">Norma (importada com origem oficial)
          <select id="ca-norma">${opc}</select></label>
        <label style="flex:0 1 160px">Artigos (opcional)
          <input id="ca-intervalo" value="${esc(estado.form.intervalo)}" placeholder="ex.: 1-30" /></label>
      </div>
      <label class="u-block u-mt-4 u-mb-8">Link da fonte (edite se mudou)
        <input id="ca-url" value="${esc(estado.form.url)}" placeholder="https://www.planalto.gov.br/…" /></label>` : `<p class="muted small">Nenhuma lei foi importada com <b>origem oficial</b> ainda. Cole abaixo o texto atualizado e informe a norma no campo.</p>
      <label class="u-block u-mt-4 u-mb-8">Norma <input id="ca-norma-txt" placeholder="Ex.: Lei 8.112/1990" value="${esc(estado.form.norma)}" /></label>`}
      <label class="u-block u-mt-4 u-mb-8">Ou cole o texto/HTML atualizado (fallback do navegador)
        <textarea id="ca-html" rows="5" placeholder="Cole o conteúdo atualizado da página oficial.">${esc(estado.form.html)}</textarea></label>
      ${estado.processando ? `<div class="prova-status lendo u-flex u-mt-8"><span class="mini-spin"></span> Consultando a fonte oficial e comparando com o texto guardado…</div>` : ""}
      ${!estado.processando && estado.msg ? `<p class="${/desktop|cole/i.test(estado.msg) ? "muted" : "erro-msg"} small u-m-0 u-mt-8">${esc(estado.msg)}</p>` : ""}
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="ca-cancelar" ${estado.processando ? "disabled" : ""}>Cancelar</button>
        <button class="btn btn-primary ${estado.processando ? "carregando" : ""}" data-action="ca-conferir" ${estado.processando ? "disabled" : ""}>${estado.processando ? "Conferindo…" : "Conferir agora"}</button>
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
      <p class="muted small u-m-0 u-mb-8">Marque o que aplicar. Alterados atualizam o texto (a redação anterior fica guardada); novos entram no acervo; revogados saem do estudo. Tudo recebe o selo <span class="mini-tag nov-tag">novidade</span> para você treinar.</p>
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
        const fimConf = toastCarregando("Consultando a fonte oficial…");
        try {
          const d = await store.compararLeiComFonte({
            norma: estado.form.norma,
            html: estado.form.html.trim() || undefined,
            url: estado.form.html.trim() ? undefined : estado.form.url,
            intervalo: estado.form.intervalo,
          });
          estado.processando = false; estado.diff = d; estado.etapa = "preview"; rerender();
          // Conferir atualização já é, na prática, conferir vigência: carimba a data de hoje
          // em todos os artigos da norma (o usuário reconsultou a fonte oficial agora).
          try { const any = store.get().indicacoes.find((x) => x.tipo === "lei" && normaDeRef(x.referencia) === estado.form.norma); if (any) store.marcarVigenciaConferida(any.id); } catch {}
        } catch (e) {
          console.error("[conferir-atualizacao]", e);
          estado.processando = false;
          estado.msg = e && e.code === "SEM_DESKTOP"
            ? "A busca automática só funciona no app desktop. Abra a página oficial, copie o texto (Ctrl+A, Ctrl+C) e cole acima."
            : (e && e.message) || "Não consegui conferir. Confira o link ou cole o texto.";
          toast(estado.msg, "erro");
          rerender();
        } finally { fimConf(); }
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
// #22: leis (normas) que têm a letra importada — base do criador estruturado de metas.
function normasComTexto(st) {
  return [...new Set(st.indicacoes.filter((i) => i.tipo === "lei" && !i.metaLeitura && !i.revogado && (i.texto || "").trim()).map((i) => normaDeRef(i.referencia) || "Outros"))].sort();
}
// #22: seções de uma lei (Parte / Título / Capítulo…) a partir do campo `estrutura` de cada artigo.
// Cada nível do caminho vira uma seção selecionável, com contagem e intervalo de artigos.
function secoesDaLei(st, norma) {
  const arts = st.indicacoes.filter((i) => i.tipo === "lei" && !i.metaLeitura && !i.revogado && (i.texto || "").trim() && (normaDeRef(i.referencia) || "Outros") === norma);
  const map = new Map();
  arts.forEach((a) => {
    const estr = Array.isArray(a.estrutura) ? a.estrutura : [];
    const num = numArtigo(a.referencia);
    const path = [];
    estr.forEach((node) => {
      path.push((node.rotulo || "") + (node.titulo ? " · " + node.titulo : ""));
      const key = path.join(" › ");
      if (!map.has(key)) map.set(key, { key, label: key, nums: [], n: 0 });
      const s = map.get(key); s.n++; if (num) s.nums.push(num);
    });
  });
  return [...map.values()].map((s) => { const nums = s.nums.filter(Boolean).sort((a, b) => a - b); return { ...s, de: nums[0] || null, ate: nums[nums.length - 1] || null }; });
}

function abrirNovaMeta(app, tipo) {
  const { store } = app;
  const st = store.get();
  const opcDisc = `<option value="">— Geral (sem vínculo) —</option>` + st.disciplinas.map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("");
  const normas = tipo === "lei" ? normasComTexto(st) : [];
  const temEstrutura = normas.length > 0;
  const opcLei = normas.map((n) => `<option value="${esc(n)}">${esc(nomeAmigavelLei(n))}</option>`).join("");
  const secoesHTML = (norma) => { const secs = secoesDaLei(st, norma); return secs.length ? secs.map((s, i) => `<option value="${i}">${esc(s.label)} — ${s.n} art.</option>`).join("") : `<option value="">(sem seções detectadas nesta lei)</option>`; };
  let modo = temEstrutura ? "estrutura" : "livre"; // #22: estruturada por padrão quando a lei tem estrutura
  const { fechar } = abrirJanela({
    titulo: tipo === "juris" ? "Nova meta de leitura (jurisprudência)" : "Nova meta de leitura (lei seca)",
    corpoHTML: `<div class="card form-leiseca">
      ${temEstrutura ? `<div class="seg seg-sm meta-modos u-mb-12" role="tablist">
        <button class="on" data-meta-modo="estrutura">Por estrutura</button>
        <button data-meta-modo="intervalo">Por intervalo</button>
        <button data-meta-modo="livre">Livre</button>
      </div>` : ""}
      ${temEstrutura ? `<div class="meta-sec" data-sec="estrutura">
        <p class="muted small u-m-0 u-mb-12">Escolha uma <b>Parte / Título / Capítulo</b> — a meta cobre exatamente esses artigos e mostra o progresso.</p>
        <div class="form-row"><label class="u-grow">Lei <select id="meta-lei">${opcLei}</select></label></div>
        <label class="u-block u-mt-8">Seção <select id="meta-secao">${secoesHTML(normas[0])}</select></label>
        <div class="meta-preview muted small u-mt-8" id="meta-prev"></div>
      </div>
      <div class="meta-sec" data-sec="intervalo" hidden>
        <p class="muted small u-m-0 u-mb-12">Um intervalo de artigos de uma lei (ex.: <i>art. 1º a 20</i>).</p>
        <div class="form-row u-items-end">
          <label class="u-grow">Lei <select id="meta-lei2">${opcLei}</select></label>
          <label>De <input id="meta-de" type="number" min="1" placeholder="1" style="width:84px" /></label>
          <label>Até <input id="meta-ate" type="number" min="1" placeholder="20" style="width:84px" /></label>
        </div>
      </div>` : ""}
      <div class="meta-sec" data-sec="livre" ${modo === "livre" ? "" : "hidden"}>
        <p class="muted small u-m-0 u-mb-12">Meta <b>crua</b>, do seu jeito (ex.: <i>${tipo === "juris" ? "Ler os informativos 810 a 815 do STJ" : "Ler art. 1º a 20 da CF"}</i>). Vira <b>tarefa no Planejamento</b>.</p>
        <label class="u-block u-mb-8">O que ler
          <input id="meta-ref" placeholder="${tipo === "juris" ? "Ex.: Ler informativos 810–815 do STJ" : "Ex.: Ler art. 1º a 20 da CF"}" /></label>
        <label class="inline u-mb-8" data-tip="Uma etapa por linha vira uma tarefa separada."><input type="checkbox" id="meta-dividir" /> Dividir em etapas (uma tarefa por linha)</label>
        <textarea id="meta-etapas" rows="4" placeholder="${esc("Ex.:\nLer art. 1º a 5º\nLer art. 6º a 11\nLer art. 12 a 20")}" style="display:none; margin-bottom:8px"></textarea>
      </div>
      <div class="form-row u-mt-8">
        <label>Disciplina <select id="meta-disc">${opcDisc}</select></label>
        <label>Tópico (opcional) <select id="meta-top"><option value="">— sem tópico —</option></select></label>
      </div>
      <label class="u-block u-m-0 u-mt-8">Observação (opcional)
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
      // Troca de modo (mostra só a seção do modo ativo).
      corpo.querySelectorAll("[data-meta-modo]").forEach((b) => b.addEventListener("click", () => {
        modo = b.getAttribute("data-meta-modo");
        corpo.querySelectorAll("[data-meta-modo]").forEach((x) => x.classList.toggle("on", x === b));
        corpo.querySelectorAll(".meta-sec").forEach((s) => { s.hidden = s.getAttribute("data-sec") !== modo; });
      }));
      // Seção estruturada: repopular ao trocar de lei + preview do intervalo.
      const leiSel = corpo.querySelector("#meta-lei");
      const secSel = corpo.querySelector("#meta-secao");
      const prev = corpo.querySelector("#meta-prev");
      const atualizarPrev = () => {
        if (!leiSel || !secSel) return;
        const s = secoesDaLei(st, leiSel.value)[+secSel.value];
        if (prev) prev.textContent = s && s.de ? `≈ ${s.n} ${s.n === 1 ? "artigo" : "artigos"} · art. ${s.de} a ${s.ate}` : "";
      };
      leiSel?.addEventListener("change", () => { secSel.innerHTML = secoesHTML(leiSel.value); atualizarPrev(); });
      secSel?.addEventListener("change", atualizarPrev);
      atualizarPrev();
      bindActions(corpo, {
        "meta-cancelar": () => fechar(),
        "meta-salvar": () => {
          const disciplinaId = corpo.querySelector("#meta-disc")?.value || null;
          const topicoId = corpo.querySelector("#meta-top")?.value || null;
          const observacao = (corpo.querySelector("#meta-obs")?.value || "").trim() || null;
          if (modo === "estrutura") {
            const lei = leiSel.value;
            const s = secoesDaLei(st, lei)[+secSel.value];
            if (!s || !s.de) return toast("Escolha uma seção com artigos.", "erro");
            store.criarMetaLeitura({ tipo, referencia: `Ler ${s.label} do ${lei} (art. ${s.de} a ${s.ate})`, disciplinaId, topicoId, observacao });
            toast("Meta criada (virou tarefa no Planejamento).", "ok");
          } else if (modo === "intervalo") {
            const lei = corpo.querySelector("#meta-lei2").value;
            const de = parseInt(corpo.querySelector("#meta-de").value, 10), ate = parseInt(corpo.querySelector("#meta-ate").value, 10);
            if (!de || !ate) return toast("Informe os artigos De e Até.", "erro");
            store.criarMetaLeitura({ tipo, referencia: `Ler art. ${Math.min(de, ate)} a ${Math.max(de, ate)} do ${lei}`, disciplinaId, topicoId, observacao });
            toast("Meta criada (virou tarefa no Planejamento).", "ok");
          } else {
            const ref = (corpo.querySelector("#meta-ref")?.value || "").trim();
            const etapas = chk?.checked ? (ta.value || "").split(/\n+/).map((s) => s.trim()).filter(Boolean) : [];
            if (etapas.length >= 2) {
              etapas.forEach((e) => store.criarMetaLeitura({ tipo, referencia: e, disciplinaId, topicoId }));
              toast(`${etapas.length} etapas criadas (viraram tarefas no Planejamento).`, "ok");
            } else {
              if (!ref) return toast(chk?.checked ? "Escreva ao menos 2 etapas (uma por linha)." : "Escreva o que ler (ex.: art. 1º a 20 da CF).", "erro");
              store.criarMetaLeitura({ tipo, referencia: ref, disciplinaId, topicoId, observacao });
              toast("Meta de leitura criada (virou tarefa no Planejamento).", "ok");
            }
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
      <p class="muted small u-m-0 u-mb-8">Meta: <b>${esc(mae.referencia)}</b>. Escreva <b>uma etapa por linha</b> — cada uma vira uma tarefa. A meta original é substituída pelas etapas.</p>
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
          <p class="muted small u-m-0 u-mb-8">Edite ou remova (✕). Cada linha vira uma tarefa no Planejamento, vinculada à disciplina escolhida.</p>
          <ul class="prev-editavel">${estado.linhas.map((t, i) => `<li class="prev-card"><div class="prev-card-l1"><input class="prev-inp im-meta" data-i="${i}" value="${esc(t)}" /><button class="prev-remover" data-action="im-rm" data-i="${i}">${icone("x")}</button></div></li>`).join("")}</ul>
          <div class="form-acoes"><button class="btn btn-ghost" data-action="im-voltar">${icone("arrow-left")} Voltar</button><span class="spacer"></span><button class="btn btn-primary" data-action="im-lancar" ${estado.linhas.length ? "" : "disabled"}>Lançar ${estado.linhas.length} ${estado.linhas.length === 1 ? "meta" : "metas"}</button></div>
        </div>`;
        corpo.querySelectorAll(".im-meta").forEach((el) => el.addEventListener("input", () => { estado.linhas[+el.getAttribute("data-i")] = el.value; }));
        return;
      }
      corpo.innerHTML = `<div class="card form-leiseca">
        <p class="muted small u-m-0 u-mb-12">Cole seu <b>cronograma/tabela</b> de leitura (uma meta por linha) ou importe um arquivo. O app limpa números de coluna e separadores; você confere antes de lançar.</p>
        <label class="inline u-mb-8">Disciplina <select id="im-disc">${opcDisc}</select></label>
        <label class="btn btn-ghost btn-file u-mb-8" data-tip="Importar de um PDF ou .txt.">${icone("paperclip")} Importar de arquivo<input id="im-file" type="file" accept=".pdf,.txt,.md,.csv" hidden /></label>
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
function abrirAdicionarIndicacao(app, tipo, modo, entrada = {}) {
  const { store } = app;
  const r = rotulos(tipo);
  const estado = { preview: null, texto: entrada.textoInicial || "", processando: false, opts: { disciplinaId: null, topicoId: null, tribunal: null, categoria: null } };
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
        corpo.innerHTML = indPreviewHTML(st, tipo, modo, r, estado.preview, store);
        const live = (sel, set) => corpo.querySelectorAll(sel).forEach((el) =>
          el.addEventListener("input", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) set(estado.preview[i], el.value); }));
        live(".ind-ref-edit", (it, v) => (it.referencia = v));
        live(".ind-texto-edit", (it, v) => (it.texto = v));
        live(".ind-obs-edit", (it, v) => (it.observacao = v));
        live(".ind-trib-edit", (it, v) => (it.tribunal = v.trim() || null));
        corpo.querySelectorAll(".ind-cat-edit").forEach((el) =>
          el.addEventListener("change", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) estado.preview[i].categoria = el.value || null; }));
        corpo.querySelectorAll(".ind-acao-edit").forEach((el) =>
          el.addEventListener("change", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) estado.preview[i]._acao = el.value; }));
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
        const itens = await comOcupado(() => store.prepararIndicacoesDeDoc(docId, tipo), { botao: el, msg: "Lendo o material e extraindo…" });
        if (itens == null) return;
        if (!itens.length) return toast("Não encontrei referências neste material.", "erro");
        estado.opts = lerOpts(corpo);
        estado.preview = itens;
        toast(`${plural(itens.length, "referência extraída", "referências extraídas")} (confira e ajuste).`);
        rerender();
      },
    }),
  });
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
      <div class="u-mt-8"><button class="btn btn-ghost btn-sm" data-action="pq-analisar">Analisar</button></div>
    </div>

    ${analise ? `<div class="pq-corte-linha"><label class="inline small">Já marcar quando a incidência ≥ <input id="pq-corte" type="number" min="0" max="100" value="${corte}" style="width:64px; margin:0 6px" /></label> <span class="muted small">(opcional · abaixo vêm desmarcadas)</span></div>` : ""}
    ${analise ? pqResultadoHTML(corte, analise) : ""}
  </div>`;
}

// Lista de sugestões de PQ (vinda da IA ou da estatística), para o usuário confirmar.
function pqResultadoHTML(corte, analise) {
  if (!analise.length) {
    return `<p class="muted small u-mt-12">Nenhuma referência foi reconhecida ou casada com seus itens. Na importação, use o formato "referência ; número"; na IA, cadastre algumas referências antes.</p>`;
  }
  const casadas = analise.filter((r) => r.ids.length).length;
  return `<div class="pq-resultado">
      <div class="muted small u-mt-12 u-mb-8">${plural(casadas, "referência casada", "referências casadas")} com seus itens. Confira e ajuste o que será marcado como PQ:</div>
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
    // O ÚLTIMO segmento é sempre a norma — não aplicar o skip de inciso/romano nele (senão "CDC"/"CC",
    // que são só letras romanas, seriam descartados como se fossem inciso e a lei cairia em "Outros").
    if (k < segs.length - 1 && /^(caput|§|par[áa]grafo\s*[úu]nico|par[áa]grafo|inc\.?|inciso|al[íi]nea|[ivxlcdm]+|[a-z])$/i.test(s)) continue;
    if (/^art/i.test(s)) continue;
    return s;
  }
  return null;
}
function chaveGrupo(tipo, i) {
  return tipo === "juris" ? (i.tribunal || "Outros") : (normaDeRef(i.referencia) || "Outros");
}
// Cor de destaque por lei (leitura visual dos cards de "Minhas Leis"). Conhecidas fixas; resto por hash estável.
function corLei(norma) {
  const n = String(norma || "").toUpperCase();
  const map = { CF: "#4f5bd5", CP: "#c4456b", CPP: "#2f6bd0", CC: "#7a4bd0", CPC: "#0f8f8f", CDC: "#0d9488", CTN: "#b07a12", CLT: "#b5642a" };
  if (map[n]) return map[n];
  let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360;
  return `hsl(${h} 52% 48%)`;
}
// Página inicial "Minhas Leis" (capa da Lei Seca): cards por lei (nome + progresso), "continuar de
// onde parou" e "importar outra lei". Clicar num card (ou continuar) abre o leitor normal.
function bibliotecaLeisHTML(st, store, normas) {
  const arts = st.indicacoes.filter((i) => i.tipo === "lei" && !i.metaLeitura);
  const ul = st.config.ultimaLeitura || {};
  const info = normas.map((n) => {
    const da = arts.filter((i) => (normaDeRef(i.referencia) || "Outros") === n);
    const vivos = da.filter((i) => !i.revogado);
    const total = vivos.length;
    const lidos = vivos.filter((i) => i.lido).length;
    return { norma: n, nome: nomeAmigavelLei(n), total, lidos, pct: total ? Math.round((100 * lidos) / total) : 0, em: ul[n] && ul[n].em ? ul[n].em : null, novidades: da.filter((i) => i.novidadeEm && !i.revogado).length, difs: vivos.filter((i) => i.dificil).length };
  });
  // Em progresso primeiro (mais recente no topo), depois alfabética.
  info.sort((a, b) => (b.em ? 1 : 0) - (a.em ? 1 : 0) || (a.em && b.em ? (a.em < b.em ? 1 : -1) : a.nome.localeCompare(b.nome, "pt-BR")));
  const ultimo = info.filter((x) => x.em).sort((a, b) => (a.em < b.em ? 1 : -1))[0];
  const continuar = ultimo
    ? `<button class="btn btn-add" data-action="continuar-leitura" data-tip="Voltar à última lei e artigo que você estava lendo.">${icone("corner-down-right")} Continuar de onde parou<span class="lb-cont-lei">${esc(ultimo.nome)}</span></button>`
    : "";
  const card = (x) => `
    <button class="lb-card" data-action="abrir-lei" data-norma="${esc(x.norma)}" style="--lc:${corLei(x.norma)}" data-tip="Abrir ${esc(x.nome)} para ler">
      <span class="lb-card-accent"></span>
      <span class="lb-ring">${progressRing(x.pct, { size: 58, stroke: 6, cor: corLei(x.norma) })}</span>
      <span class="lb-card-main">
        <span class="lb-card-nome">${esc(x.nome)}${x.novidades ? `<span class="mini-tag nov-tag lb-nov" data-tip="${x.novidades} artigo(s) com novidade legislativa.">${icone("sparkles")} ${x.novidades}</span>` : ""}</span>
        <span class="lb-card-sub">${x.total ? `${x.lidos}/${x.total} lidos · ${x.pct}%` : "sem artigos"}${x.difs ? ` · ${x.difs} difíceis` : ""}</span>
        <span class="lb-card-bar"><span style="width:${x.pct}%"></span></span>
      </span>
      <span class="lb-card-go">${icone("chevron-right")}</span>
    </button>`;
  return `<section class="lei-biblioteca">
    <div class="lb-head">
      <div class="lb-titulo"><h2>${icone("library")} Minhas leis</h2><span class="muted small">${plural(info.length, "lei cadastrada", "leis cadastradas")} · escolha uma para ler</span></div>
      <div class="lb-acoes">${continuar}<button class="btn btn-ghost" data-action="importar" data-tip="Trazer outra lei: do Planalto, colando o texto ou de um PDF.">${icone("download")} Importar outra lei</button></div>
    </div>
    <div class="lb-grid">${info.map(card).join("")}</div>
  </section>`;
}
// Nome amigável da lei: "CP" → "Código Penal" (via catálogo). Se não houver, mostra a norma crua.
let _nomesLeis = {}; // apelidos de exibição por norma (config.nomesLeis) — atualizado a cada render
function nomeAmigavelLei(norma) {
  if (!norma) return norma;
  if (_nomesLeis[norma]) return _nomesLeis[norma]; // apelido do usuário tem prioridade
  const c = CATALOGO_LEIS.find((l) => l.nome === norma);
  return c ? c.titulo : norma;
}

// Número do artigo — ordena a lei na ordem natural (não por data de importação).
function numArtigo(ref) {
  const m = String(ref || "").match(/Art\.?\s*(\d+)/i);
  return m ? +m[1] : 1e9;
}
// Divisória de estrutura (Opção A): UMA linha em migalha (breadcrumb) juntando só os níveis que
// mudaram — ex.: "Título II › Capítulo I · Do furto" — em vez de várias linhas empilhadas.
function estruturaDivisoriaHTML(nodes) {
  const arr = Array.isArray(nodes) ? nodes : [nodes];
  const inner = arr
    .map((n) => `<span class="ls-estr-nome">${esc(n.rotulo)}</span>${n.titulo ? ` <span class="ls-estr-tit">${esc(n.titulo)}</span>` : ""}`)
    .join(`<span class="ls-estr-sep">›</span>`);
  return `<div class="ls-estr-div" data-niv="${arr[0].nivel}">${inner}</div>`;
}
// Percorre itens JÁ NA ORDEM e insere UMA divisória sempre que a trilha muda (com os níveis que
// mudaram; no parcial, o 1º item de cada trecho traz o caminho até ali).
function comDivisoriasEstrutura(itens, renderItem) {
  let prev = [], out = "";
  for (const it of itens) {
    const est = Array.isArray(it.estrutura) ? it.estrutura : [];
    let d = 0;
    while (d < est.length && d < prev.length && est[d].rotulo === prev[d].rotulo && est[d].titulo === prev[d].titulo) d++;
    if (d < est.length) out += estruturaDivisoriaHTML(est.slice(d));
    prev = est;
    out += renderItem(it);
  }
  return out;
}
// Itens de um grupo: para lei, ordena por número de artigo e insere as divisórias; juris, direto.
function renderItensGrupo(itens, tipo, renderItem) {
  if (tipo !== "lei") return itens.map(renderItem).join("");
  return comDivisoriasEstrutura(itens.slice().sort((a, b) => numArtigo(a.referencia) - numArtigo(b.referencia)), renderItem);
}

// ÍNDICE RECOLHÍVEL do leitor: em vez de migalhas soltas, aninha a estrutura (Livro › Título ›
// Capítulo › Seção…) em <details> nativos. Recolher um Título recolhe tudo dentro dele; o botão
// "Índice" recolhe todos → sobra só o esqueleto da lei (o índice), e o usuário expande o que quer.
function _contarArts(n) { let c = n.artigos.length; for (const ch of n.filhos) c += _contarArts(ch); return c; }
function renderLeitorArvore(itens, renderItem, colapsado, fechados = null) {
  const fech = fechados instanceof Set ? fechados : new Set();
  const arts = itens.slice().sort((a, b) => numArtigo(a.referencia) - numArtigo(b.referencia));
  const raiz = { filhos: [], mapa: new Map(), artigos: [], node: null };
  for (const it of arts) {
    const path = Array.isArray(it.estrutura) ? it.estrutura : [];
    let cur = raiz;
    for (const p of path) {
      const key = p.rotulo + "|" + (p.titulo || "");
      let ch = cur.mapa.get(key);
      if (!ch) { ch = { filhos: [], mapa: new Map(), artigos: [], node: p }; cur.mapa.set(key, ch); cur.filhos.push(ch); }
      cur = ch;
    }
    cur.artigos.push(it);
  }
  // Estado aberto: colapse-all global fecha tudo; senão cada seção fica aberta, salvo se o usuário
  // a recolheu (persistido em config.leitura.indiceFechado por chave de caminho — #5 V2).
  // #9: todos os artigos sob uma seção (recursivo) → "capítulo concluído" + marcar em bloco.
  const coletar = (n) => n.artigos.concat(...n.filhos.map(coletar));
  const rec = (n, pk) => {
    let html = n.artigos.map(renderItem).join("");
    for (const ch of n.filhos) {
      const nd = ch.node;
      const key = (pk ? pk + ">" : "") + nd.rotulo + "|" + (nd.titulo || "");
      const abrir = colapsado ? "" : (fech.has(key) ? "" : " open");
      const secArts = coletar(ch);
      const lidos = secArts.filter((a) => a.lido).length;
      const concl = secArts.length > 0 && lidos === secArts.length;
      const capBtn = `<button class="ls-cap-btn ${concl ? "on" : ""}" data-action="ler-cap-lido" data-ids="${secArts.map((a) => a.id).join(",")}" data-concl="${concl ? 1 : 0}" data-tip="${concl ? "Capítulo concluído — desmarcar todos" : `Marcar os ${secArts.length} artigos deste capítulo como lidos`}">${icone("check-check")}</button>`;
      html += `<details class="ls-estr" data-niv="${nd.nivel}" data-estr-key="${esc(key)}"${abrir}>` +
        `<summary class="ls-estr-head">${icone("chevron-right")}<span class="ls-estr-rot">${esc(nd.rotulo)}</span>${nd.titulo ? `<span class="ls-estr-tit">${esc(nd.titulo)}</span>` : ""}<span class="ls-estr-num">${lidos}/${secArts.length}</span>${capBtn}</summary>` +
        `<div class="ls-estr-corpo">${rec(ch, key)}</div></details>`;
    }
    return html;
  };
  const html = rec(raiz, "");
  return raiz.filhos.length ? html : comDivisoriasEstrutura(arts, renderItem); // sem estrutura → migalhas simples
}

// F1e: popover de configurações de leitura (fonte, tamanho, espaçamento, alinhamento, tema/sépia).
// Só as linhas de controle (fonte/tamanho/espaçamento/alinhamento/tema) — reaproveitadas
// tanto no popover Aa quanto embutidas na seção "Leitura" do gerenciador de Opções.
function configLeituraRowsHTML(cfg, temaGlobal) {
  cfg = cfg || {};
  const seg = (k, opcoes) => `<div class="lcfg-seg">${opcoes.map((o) => `<button class="lcfg-opt ${cfg[k] === o.v || (cfg[k] == null && o.def) ? "on" : ""}" data-action="ler-cfg" data-k="${k}" data-v="${o.v}">${o.r}</button>`).join("")}</div>`;
  // Régua do frio ao quente + escuro: Claro (branco) · Cinza (neutro) · Sépia (quente) · Escuro.
  // Cinza e Sépia são "overlays" de leitura (data-ler-tema); Claro/Escuro trocam o tema global.
  const overlay = cfg.tema === "sepia" || cfg.tema === "cinza";
  const temaSeg = `<div class="lcfg-seg lcfg-seg-tema">
    <button class="lcfg-opt ${!overlay && temaGlobal !== "escuro" ? "on" : ""}" data-action="ler-cfg" data-k="tema" data-v="claro">Claro</button>
    <button class="lcfg-opt ${cfg.tema === "cinza" ? "on" : ""}" data-action="ler-cfg" data-k="tema" data-v="cinza">Cinza</button>
    <button class="lcfg-opt ${cfg.tema === "sepia" ? "on" : ""}" data-action="ler-cfg" data-k="tema" data-v="sepia">Sépia</button>
    <button class="lcfg-opt ${!overlay && temaGlobal === "escuro" ? "on" : ""}" data-action="ler-cfg" data-k="tema" data-v="escuro">Escuro</button>
  </div>`;
  return `<div class="lcfg-row"><span>Fonte</span>${seg("fonte", [{ v: "inter", r: "Padrão", def: true }, { v: "serif", r: "Serifada" }, { v: "mono", r: "Mono" }])}</div>
    <div class="lcfg-row"><span>Tamanho</span>${seg("tamanho", [{ v: "pequena", r: "A−" }, { v: "media", r: "A", def: true }, { v: "grande", r: "A+" }])}</div>
    <div class="lcfg-row"><span>Espaçamento</span>${seg("espacamento", [{ v: "normal", r: "Normal", def: true }, { v: "confortavel", r: "Conforto" }, { v: "muito", r: "Amplo" }])}</div>
    <div class="lcfg-row"><span>Alinhamento</span>${seg("align", [{ v: "esquerda", r: "Esquerda", def: true }, { v: "justificado", r: "Justificado" }])}</div>
    <div class="lcfg-row"><span>Tema</span>${temaSeg}</div>`;
}

// Botão "Aa" da toolbar: popover ANCORADO (não-modal) com preview ao vivo — o texto da lei
// muda atrás enquanto se ajusta. Reaproveita as linhas de controle.
function configLeituraToolHTML(cfg, temaGlobal) {
  return `<details class="ler-config ls-mais">
    <summary class="ler-tool" data-tip="Aparência da leitura (fonte, tamanho, tema)"><span class="lcfg-aa">Aa</span></summary>
    <div class="ls-mais-pop lcfg-pop">${configLeituraRowsHTML(cfg, temaGlobal)}</div>
  </details>`;
}

// Barra superior do LEITOR (F1a): lei atual, "ir para artigo", continuar, progresso e estatísticas.
// Impressão dos grifos da lei (agrupados por artigo, na ordem), reutilizando o helper global.
function imprimirGrifosLeiHTML(store, arts, norma) {
  const CORNOME = { amarelo: "palavras-chave", azul: "prazos e valores", vermelho: "restritivas", verde: "livre", roxo: "livre", laranja: "livre", comentario: "comentário" };
  let html = `<h2 style="margin:0 0 8px">${esc(nomeAmigavelLei(norma))} — grifos e comentários</h2>`, algo = false;
  for (const i of arts) {
    const ms = store.marcasDe("indicacao", i.id);
    if (!ms.length) continue;
    algo = true;
    html += `<h3 style="margin:12px 0 4px">${esc(String(i.referencia || "").split(",")[0])}</h3><ul style="margin:0">`;
    for (const m of ms) html += `<li><b style="text-transform:capitalize">${CORNOME[m.cor] || m.cor}:</b> ${esc(m.texto)}${m.nota ? ` — <i>${esc(m.nota)}</i>` : ""}</li>`;
    html += `</ul>`;
  }
  return algo ? html : "<p>Nenhum grifo nesta lei ainda.</p>";
}

// Impressão da LEI em si (texto corrido, na ordem), limpa (crua) ou com os grifos/anotações
// inline. Reaproveita o mesmo render do leitor (renderLeiComMarcas) para manter a formatação.
function imprimirLeiHTML(store, arts, norma, opts = {}) {
  const comGrifos = !!opts.grifos;
  // Ordena por número do artigo (e sufixo: 5º, 5º-A…), pois a lista do leitor não vem ordenada.
  arts = arts.slice().sort((a, b) => (numArtigo(a.referencia) - numArtigo(b.referencia)) || String(a.referencia).localeCompare(String(b.referencia), "pt", { numeric: true }));
  let html = "", algo = false;
  for (const i of arts) {
    if (!(i.texto || "").trim()) continue;
    algo = true;
    const ref = esc(String(i.referencia || "").split(",")[0].trim());
    const nome = i.nomeJuridico ? ` <i class="print-art-nome">${esc(i.nomeJuridico)}</i>` : "";
    const marcas = comGrifos ? store.marcasAncoradas("indicacao", i.id, i.texto) : [];
    html += `<div class="print-art"><h3>${ref}${nome}</h3><div class="print-art-corpo">${renderLeiComMarcas(i.texto, marcas)}</div>`;
    if (comGrifos) {
      const notas = store.marcasDe("indicacao", i.id).filter((m) => m.cor === "comentario" && (m.nota || "").trim());
      if (notas.length) html += `<ul class="print-notas">${notas.map((m) => `<li><b>Nota</b> (“${esc(m.texto)}”): ${esc(m.nota)}</li>`).join("")}</ul>`;
    }
    html += `</div>`;
  }
  return algo ? html : "<p>Nenhum artigo com texto para imprimir.</p>";
}

// Diálogo CONTEXTUAL de impressão quando há uma lei aberta no leitor: escolhe O QUE imprimir
// (lei inteira / só o filtro atual / só os artigos grifados) e o ESTILO (crua ou com grifos).
async function imprimirLeiContexto(store, norma, listaFinal, listaVisivel, filtroAtivo) {
  const arts = listaFinal.filter((i) => (i.texto || "").trim() && !i.revogado);
  if (!arts.length) return toast("Nada para imprimir nesta lei.", "erro");
  const temMarcas = arts.some((i) => store.marcasDe("indicacao", i.id).length);
  const FLBL = { lido: "lidos", favorito: "favoritos", dificil: "difíceis", pq: "que mais caem", grifo: "grifados", anotacao: "anotados" };
  const escopoOpts = [{ v: "todos", rot: `A lei inteira (${arts.length} artigos)` }];
  if (filtroAtivo && FLBL[filtroAtivo]) {
    const nVis = listaVisivel.filter((i) => (i.texto || "").trim() && !i.revogado).length;
    escopoOpts.push({ v: "filtro", rot: `Só os ${FLBL[filtroAtivo]} (filtro atual · ${nVis})` });
  }
  if (temMarcas) escopoOpts.push({ v: "marcados", rot: "Só os artigos grifados/anotados" });
  const grupos = [{ key: "escopo", label: "O que imprimir", opcoes: escopoOpts, def: "todos" }];
  // Só faz sentido perguntar o estilo se houver grifos para mostrar.
  if (temMarcas) grupos.push({ key: "estilo", label: "Estilo", opcoes: [{ v: "grifada", rot: "Com meus grifos e anotações" }, { v: "crua", rot: "Texto limpo (lei crua)" }], def: "grifada" });
  const op = await opcoesImpressao(`Imprimir ${nomeAmigavelLei(norma)}`, grupos);
  if (!op) return;
  let sel = arts;
  if (op.escopo === "filtro") sel = listaVisivel.filter((i) => (i.texto || "").trim() && !i.revogado);
  else if (op.escopo === "marcados") sel = arts.filter((i) => store.marcasDe("indicacao", i.id).length);
  if (!sel.length) return toast("Nenhum artigo no escopo escolhido.", "erro");
  const grifos = op.estilo === "grifada"; // ausente quando não há marcas → crua
  imprimir(nomeAmigavelLei(norma) + (grifos ? " — com meus grifos" : ""), imprimirLeiHTML(store, sel, norma, { grifos }), { cls: "pa-lei" });
}

// Menu GERAL da lei ("Ferramentas"): o que se refere à lei inteira (ou à lista filtrada) — não ao
// artigo isolado. Grifar em lote (IA/auto), limpar/imprimir grifos, marcar lido por intervalo,
// abrir no site oficial e conferir vigência. (O grifo individual fica no menu flutuante do artigo.)
function abrirRenomearLei(app, store, norma) {
  abrirJanela({
    titulo: "Renomear lei",
    corpoHTML: `<div class="card">
      <label class="ia-lbl">Nome desta lei
        <input id="lei-nome" type="text" value="${esc(nomeAmigavelLei(norma))}" placeholder="Ex.: Código de Defesa do Consumidor" autocomplete="off" />
      </label>
      <p class="muted small">Muda só o nome exibido — as citações (ex.: “Art. 1º, ${esc(norma)}”) continuam iguais.</p>
      <div class="form-acoes"><button class="btn btn-ghost" data-action="rn-cancelar">Cancelar</button><span class="spacer"></span><button class="btn btn-primary" data-action="rn-salvar">Salvar</button></div>
    </div>`,
    aoMontar: (jan, fechar) => {
      const inp = jan.querySelector("#lei-nome");
      inp?.focus(); inp?.select();
      const salvar = () => { store.definirNomeLei(norma, inp.value); fechar(); app.refresh(); toast("Nome da lei atualizado."); };
      jan.querySelector('[data-action="rn-salvar"]')?.addEventListener("click", salvar);
      jan.querySelector('[data-action="rn-cancelar"]')?.addEventListener("click", fechar);
      inp?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); salvar(); } });
    },
  });
}

// "Personalizar barra": escolhe quais ÍCONES ficam na toolbar do leitor e quais FILTROS
// aparecem como chips. Config leve (não é leitura) → modal compacto; muda ao vivo na barra atrás.
function abrirPersonalizarBarra(app, store) {
  const temFonte = store.get().indicacoes.some((i) => i.tipo === "lei" && i.fonteUrl);
  const PIN_DEF = [...LER_NAV_DEF, ...LER_ACOES_DEF].filter((d) => lerAcaoDisponivel(d, store, temFonte));
  const FILTROS_DEF = [
    { k: "lido", ic: "check", lbl: "Lidos" },
    { k: "favorito", ic: "bookmark", lbl: "Favoritos" },
    { k: "dificil", ic: "flame", lbl: "Difíceis" },
    { k: "pq", ic: "star", lbl: "Que mais caem" },
    { k: "grifo", ic: "highlighter", lbl: "Grifos" },
    { k: "anotacao", ic: "sticky-note", lbl: "Anotações" },
  ];
  const barra = () => (store.get().config.leitura || {}).barra || {};
  const ocult = () => new Set((store.get().config.leitura || {}).filtrosOcultos || []);
  const btnOn = (d) => { const b = barra(); return b[d.k] === undefined ? !!d.def : !!b[d.k]; };
  const pill = (d) => `<button class="ferr-fchip ${btnOn(d) ? "on" : ""}" data-pz="botao" data-k="${d.k}" data-tip="${esc(d.tip || d.lbl)}">${icone(d.ic)} ${d.lbl}</button>`;
  abrirJanela({
    titulo: "Personalizar barra",
    corpoHTML: `<div class="card ferr-lei">
      <section class="ferr-sec">
        <h4>${icone("layout-panel-top")} Botões na barra</h4>
        <p class="muted small u-m-0 u-mb-8">Buscar e o menu ⋯ (Opções) ficam sempre. Fixe aqui os atalhos que quiser ver direto na barra — os demais continuam dentro de Opções.</p>
        <div class="ferr-grupo-lbl">Leitura</div>
        <div class="ferr-linha ferr-filtros">${LER_NAV_DEF.map(pill).join("")}</div>
        <div class="ferr-grupo-lbl">Ações da lei</div>
        <div class="ferr-linha ferr-filtros">${PIN_DEF.filter((d) => !LER_NAV_DEF.includes(d)).map(pill).join("")}</div>
      </section>
      <section class="ferr-sec">
        <h4>${icone("list-filter")} Filtros na barra</h4>
        <div class="ferr-linha ferr-filtros">
          ${FILTROS_DEF.map((f) => `<button class="ferr-fchip ${ocult().has(f.k) ? "" : "on"}" data-pz="filtro" data-k="${f.k}">${icone(f.ic)} ${f.lbl}</button>`).join("")}
        </div>
        <p class="muted small">Os chips aparecem sob o progresso (o filtro em si continua a um clique).</p>
      </section>
    </div>`,
    aoMontar: (jan) => {
      jan.addEventListener("click", (e) => {
        const b = e.target.closest("[data-pz]"); if (!b) return;
        const tipo = b.getAttribute("data-pz"), k = b.getAttribute("data-k");
        if (tipo === "botao") {
          const cur = barra(); const d = PIN_DEF.find((x) => x.k === k);
          const on = cur[k] === undefined ? !!(d && d.def) : !!cur[k];
          store.setLeitura({ barra: { ...cur, [k]: !on } });
          b.classList.toggle("on", !on);
        } else {
          const s = ocult(); if (s.has(k)) s.delete(k); else s.add(k);
          store.setLeitura({ filtrosOcultos: [...s] });
          b.classList.toggle("on", !s.has(k));
        }
        app.refresh();
      });
    },
  });
}

// Ações em lote da lei (itens diretos do menu ⋯). Cada uma opera sobre os artigos com texto.
const _comTextoLei = (lista) => lista.filter((i) => (i.texto || "").trim() && !i.revogado);

function acaoGrifarAuto(app, store, lista) {
  const comTexto = _comTextoLei(lista);
  let n = 0; for (const i of comTexto) n += store.autoMarcar("indicacao", i.id, i.texto) || 0;
  toast(n ? `${plural(n, "grifo automático", "grifos automáticos")}.` : "Nada novo a grifar (prazos/restritivas)."); app.refresh();
}
async function acaoGrifarIA(app, store, lista, el) {
  if (!store.iaDisponivel()) return avisoIA(app, "Grifar com IA");
  const comTexto = _comTextoLei(lista);
  const alvo = comTexto.slice(0, 25);
  if (comTexto.length > 25) toast("Muitos artigos: grifando os 25 primeiros (filtre para focar).");
  // Progresso narrado por artigo (o comOcupado tinha mensagem fixa e parecia travado).
  const fim = toastCarregando("Grifando com a IA…");
  if (el) { el.classList.add("carregando"); el.disabled = true; el.setAttribute("aria-busy", "true"); }
  let n = 0;
  try {
    let i = 0;
    for (const it of alvo) { fim(`Grifando com a IA… ${++i}/${alvo.length}`); try { n += (await store.sugerirMarcacoesIA("indicacao", it.id, it.texto, it.referencia)) || 0; } catch {} }
  } finally {
    fim();
    if (el) { el.classList.remove("carregando"); el.disabled = false; el.removeAttribute("aria-busy"); }
  }
  toast(n ? `${plural(n, "palavra-chave grifada", "palavras-chave grifadas")} pela IA.` : "A IA não achou novas palavras-chave."); app.refresh();
}
function acaoClassificarTemas(app, store, lista) {
  const n = store.classificarTemasLote(_comTextoLei(lista).map((i) => i.id));
  toast(n ? `${plural(n, "artigo classificado", "artigos classificados")} por tema.` : "Nenhum tema detectado."); app.refresh();
}
// F1: refino por IA (temas mais finos), com loading. Mescla com os detectados offline.
async function acaoRefinarTemasIA(app, store, lista, norma) {
  if (!store.iaDisponivel()) return avisoIA(app, "Refinar temas com IA");
  const ids = _comTextoLei(lista).map((i) => i.id);
  if (!ids.length) return toast("Sem artigos com texto para classificar.", "erro");
  const n = await comOcupado(() => store.classificarTemasIA(ids, nomeAmigavelLei(norma)), { msg: "Refinando temas com a IA…" });
  if (n == null) return;
  toast(n ? `${plural(n, "artigo refinado", "artigos refinados")} pela IA${ids.length > 40 ? " (40 primeiros)" : ""}.` : "A IA não retornou temas novos.", n ? "ok" : "erro");
  app.refresh();
}
// F3: editor manual dos temas de um artigo (chips remover/adicionar + tema personalizado).
function abrirEditarTemas(app, id) {
  const { store } = app;
  const ind = store.get().indicacoes.find((i) => i.id === id);
  if (!ind) return;
  let temas = [...(ind.temas || [])];
  const catalogo = store.temasCatalogo();
  abrirJanela({
    titulo: "Temas do artigo",
    corpoHTML: `<div class="card form-leiseca">
      <div class="muted small u-mb-12">${esc(String(ind.referencia || "").split(",")[0])} — clique num tema para <b>remover</b>; escolha abaixo para <b>adicionar</b>.</div>
      <div id="temas-atuais" class="temas-edit-atuais"></div>
      <div class="temas-edit-add-lbl">Adicionar</div>
      <div id="temas-sugestoes" class="temas-edit-sug"></div>
      <div class="temas-edit-novo">
        <input id="tema-novo" placeholder="tema personalizado…" autocomplete="off" />
        <button class="btn btn-ghost btn-sm" data-action="tema-add-novo">${icone("plus")} Adicionar</button>
      </div>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="temas-cancelar">Cancelar</button>
        <button class="btn btn-primary" data-action="temas-salvar">Salvar</button>
      </div>
    </div>`,
    aoMontar: (overlay, fecharM) => {
      const corpo = overlay.querySelector(".mm-corpo");
      const pintar = () => {
        corpo.querySelector("#temas-atuais").innerHTML = temas.length
          ? temas.map((t) => `<button class="tema-edit-chip on" data-tema-rm="${esc(t)}" data-tip="Remover">${esc(t)} ${icone("x")}</button>`).join("")
          : `<span class="muted small">Nenhum tema ainda.</span>`;
        const disp = catalogo.filter((t) => !temas.includes(t));
        corpo.querySelector("#temas-sugestoes").innerHTML = disp.length
          ? disp.map((t) => `<button class="tema-edit-chip" data-tema-add="${esc(t)}">${icone("plus")} ${esc(t)}</button>`).join("")
          : `<span class="muted small">Todos os temas já estão no artigo.</span>`;
      };
      pintar();
      corpo.addEventListener("click", (e) => {
        const rm = e.target.closest("[data-tema-rm]"), ad = e.target.closest("[data-tema-add]");
        if (rm) { temas = temas.filter((t) => t !== rm.getAttribute("data-tema-rm")); pintar(); }
        else if (ad) { const t = ad.getAttribute("data-tema-add"); if (!temas.includes(t)) temas.push(t); pintar(); }
      });
      bindActions(corpo, {
        "tema-add-novo": () => { const inp = corpo.querySelector("#tema-novo"); const v = (inp.value || "").trim(); if (v && !temas.includes(v)) { temas.push(v); inp.value = ""; pintar(); } },
        "temas-cancelar": () => fecharM(),
        "temas-salvar": () => { store.setTemasArtigo(id, temas); toast("Temas atualizados.", "ok"); fecharM(); app.refresh(); },
      });
    },
  });
}
function acaoImprimirGrifos(store, lista, norma) {
  imprimir(nomeAmigavelLei(norma) + " — grifos", imprimirGrifosLeiHTML(store, _comTextoLei(lista), norma));
}
async function acaoLimparGrifos(app, store, lista) {
  if (!(await confirmar("Remover TODOS os grifos e comentários desta lei?"))) return;
  for (const i of _comTextoLei(lista)) store.limparMarcas("indicacao", i.id);
  toast("Grifos removidos."); app.refresh();
}
// Marcar lido em bloco: precisa de um intervalo (de/até) → painel compacto e focado.
function abrirMarcarLidoBloco(app, store, lista, norma) {
  const comTexto = _comTextoLei(lista);
  const nums = comTexto.map((i) => numArtigo(i.referencia)).filter((n) => n > 0);
  const minN = nums.length ? Math.min(...nums) : 1, maxN = nums.length ? Math.max(...nums) : 1;
  abrirJanela({
    titulo: `Marcar lido em bloco · ${nomeAmigavelLei(norma)}`,
    corpoHTML: `<div class="card ferr-lei">
      <section class="ferr-sec" style="border:0">
        <div class="ferr-linha">
          <label class="ferr-num">de <input type="number" id="ferr-de" min="${minN}" max="${maxN}" value="${minN}"></label>
          <label class="ferr-num">até <input type="number" id="ferr-ate" min="${minN}" max="${maxN}" value="${maxN}"></label>
          <button class="btn btn-sm btn-soft" data-ferr="lido">${icone("check")} Marcar lidos</button>
          <button class="btn btn-sm btn-ghost" data-ferr="naolido">Desmarcar</button>
        </div>
        <p class="muted small">Marca (ou desmarca) todos os artigos no intervalo informado.</p>
      </section>
    </div>`,
    aoMontar: (jan) => {
      const q = (s) => jan.querySelector(s);
      jan.addEventListener("click", (e) => {
        const b = e.target.closest("[data-ferr]"); if (!b) return;
        const a = b.getAttribute("data-ferr");
        const de = +q("#ferr-de").value, ate = +q("#ferr-ate").value;
        const lo = Math.min(de, ate), hi = Math.max(de, ate);
        const ids = comTexto.filter((i) => { const n = numArtigo(i.referencia); return n >= lo && n <= hi; }).map((i) => i.id);
        const n = store.marcarLidosIds(ids, a === "lido");
        toast(n ? `${plural(n, "artigo", "artigos")} ${a === "lido" ? "marcados como lidos" : "desmarcados"}.` : "Nada a alterar.");
        app.refresh();
      });
    },
  });
}

// Catálogo de botões da barra do leitor. NAV = navegação de leitura (padrão fixados);
// AÇÕES = ficam sempre no menu ⋯ (Opções) e podem ser fixados na barra via "Personalizar".
const LER_NAV_DEF = [
  { k: "foco", ic: "book-open", lbl: "Foco", act: "ler-foco-modo", def: true, foco: true, tip: "Leitura em foco (tela cheia)" },
  { k: "sumario", ic: "list-tree", lbl: "Sumário", act: "ler-indice", def: true, tip: "Sumário: recolher tudo e ver o índice" },
  { k: "aa", ic: "type", lbl: "Aparência (Aa)", def: true, popover: true, tip: "Aparência da leitura (fonte, tamanho, tema)" },
];
const LER_ACOES_DEF = [
  { k: "incidencia", ic: "star", lbl: "Marcar o que mais cai", act: "toggle-pq-import", grupo: "prep", tip: "Marca os artigos que MAIS CAEM em prova (por incidência): a IA sugere ou você cola a estatística. Diferente de grifar — aqui você ranqueia os artigos de maior peso." },
  { k: "buscaIA", ic: "sparkles", lbl: "Busca por significado (IA)", act: "abrir-indice", grupo: "prep", ia: true, tip: "Separa os artigos para a Busca por significado (IA) do chat — encontra pelo sentido, não só pela palavra exata. Só deste módulo." },
  { k: "grifar", ic: "highlighter", lbl: "Grifar prazos e restritivas", act: "ler-grifar-auto", grupo: "prep", tip: "Grifa dentro do texto 🔵 prazos e valores e 🔴 termos restritivos (offline)." },
  { k: "grifarIA", ic: "sparkles", lbl: "Grifar palavras-chave (IA)", act: "ler-grifar-ia", grupo: "prep", ia: true, tip: "A IA grifa 🟡 as palavras-chave de cada artigo." },
  { k: "temas", ic: "tags", lbl: "Classificar por tema", act: "ler-temas", grupo: "prep", tip: "Detecta temas por artigo (prazo, competência, quórum…) — habilita o memorizar por tema." },
  { k: "temasIA", ic: "sparkles", lbl: "Refinar temas (IA)", act: "ler-temas-ia", grupo: "prep", ia: true, tip: "A IA refina e adiciona temas mais finos por artigo (mescla com os detectados offline)." },
  { k: "lidoBloco", ic: "check-check", lbl: "Marcar lido em bloco", act: "ler-lido-bloco", grupo: "bloco", tip: "Marca um intervalo de artigos (de/até) como lidos." },
  { k: "imprimir", ic: "printer", lbl: "Imprimir grifos", act: "ler-imprimir-grifos", grupo: "bloco", tip: "Imprime os grifos e comentários desta lei." },
  { k: "limpar", ic: "eraser", lbl: "Limpar grifos", act: "ler-limpar-grifos", grupo: "bloco", danger: true, tip: "Remove todos os grifos e comentários desta lei." },
  { k: "site", ic: "external-link", lbl: "Abrir no site oficial", act: "ler-site", grupo: "bloco", fonte: true, tip: "Abre a fonte oficial da lei." },
];
// Disponibilidade dinâmica de uma ação (IA conectada / lei tem fonte oficial).
function lerAcaoDisponivel(d, store, temFonte) {
  if (d.ia && !store.iaDisponivel()) return false;
  if (d.fonte && !temFonte) return false;
  return true;
}

function leitorBarraHTML(st, store, norma, normas, lista, opts = {}) {
  const vivos = lista.filter((i) => !i.revogado);
  const total = vivos.length;
  const lidos = vivos.filter((i) => i.lido).length;
  const pct = total ? Math.round((100 * lidos) / total) : 0;
  const favs = lista.filter((i) => i.favorito).length;
  const difs = lista.filter((i) => i.dificil).length;
  const pqs = lista.filter((i) => (!i.revogado) && (i.pq || (i.pqIncidencia || 0) > 0)).length;
  const ids = new Set(lista.map((i) => i.id));
  const grifos = [...(opts.comGrifo || [])].filter((id) => ids.has(id)).length;
  const notas = [...(opts.comNota || [])].filter((id) => ids.has(id)).length;
  const ult = (st.config.ultimaLeitura || {})[norma];
  const fAtivo = opts.filtro;
  const novidadesLei = lista.filter((i) => i.novidadeEm && !i.revogado).length;
  const filtroNovAtivo = !!lerFiltroNov.lei;
  // Filtros que o usuário escolheu esconder (gerenciado em Opções ▸ Filtros).
  const ocultos = new Set((st.config.leitura || {}).filtrosOcultos || []);
  // Chip = filtro: clicar mostra só aqueles artigos; clicar de novo limpa.
  // Só mostra a estatística quando há o quê (esconde os zeros — ruído), a menos que seja o filtro ativo.
  // E respeita a escolha do usuário de ocultar aquele filtro da barra.
  const stat = (ic, n, lbl, key) => (ocultos.has(key) && fAtivo !== key) || (!n && fAtivo !== key) ? "" : `<button class="ler-stat ${fAtivo === key ? "on" : ""}" data-action="ler-stat-filtro" data-f="${key}" data-tip="Filtrar só os ${lbl}${fAtivo === key ? " (clique para limpar)" : ""}"><span class="ler-stat-ic">${icone(ic)}</span><b>${n}</b><span class="ler-stat-lbl">${lbl}</span></button>`;
  // Toolbar de ícones (só ícones + tooltip). Cada botão pode ser fixado na barra via "Personalizar".
  const barra = (st.config.leitura || {}).barra || {};
  const fixado = (d) => (barra[d.k] === undefined ? !!d.def : !!barra[d.k]);
  const novidadesN = lista.filter((i) => i.novidadeEm && !i.revogado).length;
  const temFonte = !!(lista.find((i) => i.fonteUrl) || {}).fonteUrl;
  // Um botão da barra (ícone). Aa é popover ancorado; os demais são ação direta.
  const toolBtn = (d) => {
    if (d.popover) return configLeituraToolHTML(st.config.leitura, st.config.tema);
    const tip = d.k === "foco" ? `${d.tip}${ult ? ", começando do último artigo lido" : ""}`
      : d.k === "sumario" ? (_indiceColapsado ? "Expandir a lei" : d.tip) : d.tip;
    const cls = (d.foco ? "ler-tool-foco" : "") + (d.k === "sumario" && _indiceColapsado ? " on" : "");
    return `<button class="ler-tool ${cls}" data-action="${d.act}" data-tip="${esc(tip)}">${icone(d.ic)}</button>`;
  };
  const barTools = [...LER_NAV_DEF, ...LER_ACOES_DEF]
    .filter((d) => lerAcaoDisponivel(d, store, temFonte) && fixado(d))
    .map(toolBtn).join("");
  // Menu ⋯ = catálogo completo de Opções (sempre tem tudo, independente do que está fixado).
  const menuIt = (d) => `<button class="ler-menu-it ${d.danger ? "lnk-danger" : ""}" data-action="${d.act}" data-tip="${esc(d.tip)}">${icone(d.ic)} ${d.lbl}</button>`;
  const grupoMenu = (g) => LER_ACOES_DEF.filter((d) => d.grupo === g && lerAcaoDisponivel(d, store, temFonte)).map(menuIt).join("");
  const menuMais = `<details class="ls-mais ler-mais-tool"><summary class="ler-tool" data-tip="Opções da lei">${icone("ellipsis")}</summary><div class="ls-mais-pop ler-mais-menu">
      <button class="ler-menu-it" data-action="ler-renomear" data-tip="Corrigir o nome exibido desta lei.">${icone("square-pen")} Renomear lei</button>
      <button class="ler-menu-it" data-action="conferir-atualizacao" data-tip="Reconsulta a fonte oficial e mostra o que mudou/foi incluído/revogado (e carimba a vigência).">${icone("refresh-cw")} Conferir atualização</button>
      <button class="ler-menu-it" data-action="ler-aleatorio" data-tip="Abre um artigo desta lei ao acaso — bom para revisar sem viés.">${icone("shuffle")} Artigo aleatório</button>
      ${novidadesN ? `<button class="ler-menu-it" data-action="filtro-novidades" data-tip="Mostrar só os artigos com novidade legislativa.">${icone("sparkles")} Ver só novidades (${novidadesN})</button>` : ""}
      <div class="ler-menu-sep"></div>
      <div class="ler-menu-lbl">Preparar automaticamente</div>
      ${grupoMenu("prep")}
      <div class="ler-menu-sep"></div>
      <div class="ler-menu-lbl">Em bloco e grifos</div>
      ${grupoMenu("bloco")}
      <div class="ler-menu-sep"></div>
      <button class="ler-menu-it" data-action="ler-personalizar" data-tip="Escolher quais botões ficam na barra e quais filtros aparecem.">${icone("sliders-horizontal")} Personalizar barra…</button>
    </div></details>`;
  return `<div class="ler-topo">
    <div class="ler-topo-l1">
      <button class="ler-voltar-biblio" data-action="voltar-biblioteca" data-tip="Voltar para Minhas Leis (ver todas as leis e trocar)">${icone("arrow-left")}<span>Minhas leis</span></button>
      <span class="ler-norma" data-tip="Lei aberta">${esc(nomeAmigavelLei(norma))}</span>
      <button class="ler-busca-campo" data-action="ler-buscar" data-tip="Buscar por palavra/significado ou ir para um artigo (nº)">${icone("search")}<span>Buscar ou ir para artigo…</span></button>
      <div class="ler-tools">
        ${barTools}
        ${menuMais}
      </div>
    </div>
    <div class="ler-prog" data-tip="${lidos} de ${total} artigos lidos">
      <div class="ler-prog-bar"><span style="width:${pct}%"></span></div>
      <span class="ler-prog-txt"><b>${lidos}</b> / ${total} lidos · <b>${pct}%</b></span>
    </div>
    <div class="ler-stats">
      ${stat("check", lidos, "lidos", "lido")}
      ${stat("bookmark", favs, "favoritos", "favorito")}
      ${stat("flame", difs, "difíceis", "dificil")}
      ${stat("star", pqs, "que mais caem", "pq")}
      ${stat("highlighter", grifos, "grifos", "grifo")}
      ${stat("sticky-note", notas, "anotações", "anotacao")}
      ${fAtivo ? `<button class="ler-stat-limpar" data-action="ler-limpar-filtro" data-tip="Mostrar todos os artigos">${icone("x")} limpar filtro</button>` : ""}
    </div>
    <div class="ler-agora" hidden aria-live="polite"><span class="la-ic">${icone("map-pin")}</span><span class="la-trilha"></span></div>
  </div>`;
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
  if (!grupos.some((g) => g.norma !== "Outros")) return renderItensGrupo(lista, tipo, renderItem);
  grupos.sort((a, b) => (a.norma === "Outros" ? 1 : b.norma === "Outros" ? -1 : a.norma.localeCompare(b.norma)));
  return grupos
    .map((g) => {
      const key = `${tipo}:${chaveTab}:${g.norma}`;
      const aberto = !gruposFechados.has(key);
      return `<div class="ls-grupo">
        <button class="ls-grupo-head lnk" data-action="toggle-grupo" data-grp="${esc(key)}">
          ${icone(aberto ? "chevron-down" : "chevron-right")} <b>${esc(g.norma)}</b> <span class="num">${g.itens.length}</span>
        </button>
        ${aberto ? `<div class="ls-grupo-itens">${renderItensGrupo(g.itens, tipo, renderItem)}</div>` : ""}
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
  const comGrifo = comTexto.filter((i) => store.marcasDe("indicacao", i.id).some((m) => m.cor !== "comentario"));
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

  // F5 — dashboard "Hoje", recomendação inteligente e caderno de erros.
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

  // Tira de contexto FINA (não um painel de tiles) — números do dia em uma linha. "Revisões
  // vencendo" sai daqui (já vive na recomendação e no card "Revisar o que vence").
  const etItem = (ic, n, lbl, cls = "") => `<span class="et-item ${cls}">${icone(ic)}<b>${n}</b> ${lbl}</span>`;
  const dashboard = `<div class="estudar-tira">
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
  const leiSel = tipo === "lei" ? (estudarLeiSel || leiAtiva.lei || normas[0] || null) : null;
  // Seções (níveis 1–3) da lei escolhida, em ordem do documento.
  const secMap = new Map();
  if (tipo === "lei") for (const i of base) {
    if (leiSel && leiSel !== "todas" && normaDeRef(i.referencia) !== leiSel) continue;
    for (const n of i.estrutura || []) if (n.nivel <= 3) { const k = n.rotulo + "|" + (n.titulo || ""); if (!secMap.has(k)) secMap.set(k, { ...n, k }); }
  }
  const secoes = [...secMap.values()];
  // Conjunto REAL do escopo (para os contadores dos cards e para a IA).
  const artRange = parseIntervaloArt(estudarArtFiltro);
  const noEscopoSemTema = (i) => (!leiSel || leiSel === "todas" || normaDeRef(i.referencia) === leiSel)
    && (!estudarSecaoSel || (Array.isArray(i.estrutura) && i.estrutura.some((n) => n.rotulo + "|" + (n.titulo || "") === estudarSecaoSel)))
    && (!artRange || (() => { const nn = numArtigo(i.referencia); return nn >= artRange.de && nn <= artRange.ate; })());
  const noEscopo = (i) => noEscopoSemTema(i) && (!estudarTemaSel || (Array.isArray(i.temas) && i.temas.includes(estudarTemaSel)));
  // C.2.4 — recorte de estudo da JURISPRUDÊNCIA por tribunal/ramo/assunto/categoria (sem o tema).
  const noEscopoJurisSemTema = (i) =>
    (!estudarJurisTrib || String(i.tribunal || "") === estudarJurisTrib)
    && (!estudarJurisRamo || String(i.ramo || "") === estudarJurisRamo)
    && (!estudarJurisAssunto || String(i.assunto || "") === estudarJurisAssunto)
    && (!estudarJurisCat || String(i.categoria || "") === estudarJurisCat);
  const noEscopoJuris = (i) => noEscopoJurisSemTema(i) && (!estudarTemaSel || (Array.isArray(i.temas) && i.temas.includes(estudarTemaSel)));
  // Temas disponíveis no recorte (habilita "Memorizar por tema"): lei = lei/seção/artigo; juris = trib/ramo/assunto/cat.
  const temasDisp = tipo === "lei" ? store.temasDisponiveis(comTexto.filter(noEscopoSemTema).map((i) => i.id)) : store.temasDisponiveis(comTexto.filter(noEscopoJurisSemTema).map((i) => i.id));
  const comTextoEsc = tipo === "lei" ? comTexto.filter(noEscopo) : comTexto.filter(noEscopoJuris);
  const comGrifoEsc = tipo === "lei" ? comGrifo.filter(noEscopo) : comGrifo.filter(noEscopoJuris);
  // Opções do recorte de juris (cascata: assunto restringe ao ramo escolhido).
  const jTribs = tipo === "juris" ? [...new Set(base.map((i) => i.tribunal).filter(Boolean))].sort() : [];
  const jRamos = tipo === "juris" ? [...new Set(base.map((i) => i.ramo).filter(Boolean))].sort() : [];
  const jAssuntos = tipo === "juris" ? [...new Set(base.filter((i) => !estudarJurisRamo || i.ramo === estudarJurisRamo).map((i) => i.assunto).filter(Boolean))].sort() : [];
  const jCats = tipo === "juris" ? [...new Set(base.map((i) => i.categoria).filter(Boolean))].sort() : [];
  const nEsc = comTextoEsc.length;
  const temInc = base.some((i) => i.pqIncidencia != null); // há artigos marcados por incidência?

  // ESCOPO: a LEI é a escolha principal (destaque); "Refinar" (parte/artigos/tema/prioridade) e OPCIONAL.
  const secAtual = estudarSecaoSel ? secoes.find((s) => s.k === estudarSecaoSel) : null;
  const leiNome = leiSel ? nomeAmigavelLei(leiSel) : "";
  const refinoPartes = tipo === "lei"
    ? [secAtual ? (secAtual.titulo || secAtual.rotulo) : "a lei inteira",
       estudarArtFiltro ? `art. ${estudarArtFiltro}` : "", estudarTemaSel ? `tema: ${estudarTemaSel}` : "",
       esc2 === "incidencia" ? "o que mais cai" : ""].filter(Boolean)
    : [];
  const filtrado = tipo === "lei" && (estudarSecaoSel || estudarArtFiltro || estudarTemaSel || esc2 === "incidencia");
  const escopoLeiHTML = tipo !== "lei" ? "" : `<div class="estudar-escopo ${_escopoAberto ? "aberto" : ""}">
      <button class="est-escopo-btn ${filtrado ? "on" : ""}" data-action="estudar-escopo-toggle" data-tip="Escolher a lei a estudar (e, se quiser, refinar por parte, artigos ou incidencia)">
        ${icone("book-open")}<span class="ee-resumo"><b class="ee-lei">${esc(leiNome)}</b><span class="ee-refino"> · ${esc(refinoPartes.join(" · "))}</span></span><span class="escopo-cont">${plural(nEsc, "artigo", "artigos")}</span>${icone("chevron-down")}
      </button>
      ${_escopoAberto ? `<div class="est-escopo-pop">
        <div class="ee-sec-lbl">${icone("book-open")} Lei a estudar</div>
        ${normas.length > 1
          ? `<select class="escopo-sel ee-lei-sel" data-action="escopo-lei">${normas.map((nr) => `<option value="${esc(nr)}" ${leiSel === nr ? "selected" : ""}>${esc(nomeAmigavelLei(nr))}</option>`).join("")}</select>`
          : `<div class="ee-lei-fixa"><b>${esc(leiNome)}</b><span class="muted small">Importe outra lei na aba Ler para ter mais opcoes.</span></div>`}
        <div class="ee-sec-lbl ee-opc">Refinar <span>— opcional</span></div>
        ${secoes.length ? `<label class="ee-row"><span>Parte</span><select class="escopo-sel" data-action="escopo-secao">
          <option value="">A lei inteira</option>
          ${secoes.map((s) => `<option value="${esc(s.k)}" ${estudarSecaoSel === s.k ? "selected" : ""}>${" ".repeat(Math.max(0, (s.nivel - 1) * 2))}${esc(s.rotulo)}${s.titulo ? " · " + esc(s.titulo) : ""}</option>`).join("")}
        </select></label>` : ""}
        <label class="ee-row"><span>Artigos</span><input class="escopo-art" data-action="escopo-art" value="${esc(estudarArtFiltro)}" placeholder="ex.: 121 ou 1-10" />
          <span class="ee-hint">Um numero ou um intervalo. Vazio = todos os artigos do campo acima.</span></label>
        ${temasDisp.length ? `<label class="ee-row"><span>Tema</span><select class="escopo-sel" data-action="escopo-tema">
          <option value="">Todos os temas</option>
          ${temasDisp.map((t) => `<option value="${esc(t.tema)}" ${estudarTemaSel === t.tema ? "selected" : ""}>${esc(t.tema)} (${t.n})</option>`).join("")}
        </select></label>` : ""}
        <div class="ee-row"><span>Prioridade</span><div class="ee-toggle">
          <button class="chip-escopo ${esc2 === "tudo" ? "on" : ""}" data-action="estudar-escopo" data-e="tudo">Todos</button>
          <button class="chip-escopo ${esc2 === "incidencia" ? "on" : ""}" data-action="estudar-escopo" data-e="incidencia" data-tip="'O que mais cai' usa so os artigos que voce marcou por incidencia em prova (top 20%).${temInc ? "" : " Nenhum marcado ainda: marque em Ler > Opcoes > Marcar o que mais cai."}">O que mais cai</button>
        </div></div>
        <div class="ee-foot">${filtrado ? `<button class="lnk" data-action="estudar-escopo-limpar">${icone("x")} Limpar recorte</button>` : "<span></span>"}<button class="btn btn-sm btn-primary" data-action="estudar-escopo-toggle">Pronto</button></div>
      </div>` : ""}
    </div>`;
  // C.2.4 — escopo de estudo da JURISPRUDÊNCIA: tribunal / ramo / assunto / categoria / tema.
  const jFiltrado = tipo === "juris" && (estudarJurisTrib || estudarJurisRamo || estudarJurisAssunto || estudarJurisCat || estudarTemaSel || esc2 === "incidencia");
  const jResumo = estudarJurisRamo || estudarJurisTrib || estudarJurisCat || "Toda a jurisprudência";
  const jRefino = [estudarJurisTrib && estudarJurisTrib !== jResumo ? estudarJurisTrib : "", estudarJurisAssunto, estudarJurisCat && estudarJurisCat !== jResumo ? estudarJurisCat : "", estudarTemaSel ? `tema: ${estudarTemaSel}` : "", esc2 === "incidencia" ? "o que mais cai" : ""].filter(Boolean);
  const jSel = (act, val, opts, todos) => `<select class="escopo-sel" data-action="${act}"><option value="">${todos}</option>${opts.map((o) => `<option value="${esc(o)}" ${val === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  const escopoJurisHTML = tipo !== "juris" ? "" : `<div class="estudar-escopo ${_escopoAberto ? "aberto" : ""}">
      <button class="est-escopo-btn ${jFiltrado ? "on" : ""}" data-action="estudar-escopo-toggle" data-tip="Recortar o que estudar: tribunal, ramo, assunto, categoria ou tema">
        ${icone("scale")}<span class="ee-resumo"><b class="ee-lei">${esc(jResumo)}</b><span class="ee-refino">${jRefino.length ? " · " + esc(jRefino.join(" · ")) : ""}</span></span><span class="escopo-cont">${plural(nEsc, "julgado", "julgados")}</span>${icone("chevron-down")}
      </button>
      ${_escopoAberto ? `<div class="est-escopo-pop">
        <div class="ee-sec-lbl">${icone("scale")} Recorte da jurisprudência <span>— tudo opcional</span></div>
        ${jTribs.length ? `<label class="ee-row"><span>Tribunal</span>${jSel("escopo-j-trib", estudarJurisTrib, jTribs, "Todos")}</label>` : ""}
        ${jRamos.length ? `<label class="ee-row"><span>Ramo</span>${jSel("escopo-j-ramo", estudarJurisRamo, jRamos, "Todos")}</label>` : ""}
        ${jAssuntos.length ? `<label class="ee-row"><span>Assunto</span>${jSel("escopo-j-assunto", estudarJurisAssunto, jAssuntos, "Todos")}</label>` : ""}
        ${jCats.length ? `<label class="ee-row"><span>Categoria</span>${jSel("escopo-j-cat", estudarJurisCat, jCats, "Todas")}</label>` : ""}
        ${temasDisp.length ? `<label class="ee-row"><span>Tema</span><select class="escopo-sel" data-action="escopo-tema"><option value="">Todos os temas</option>${temasDisp.map((t) => `<option value="${esc(t.tema)}" ${estudarTemaSel === t.tema ? "selected" : ""}>${esc(t.tema)} (${t.n})</option>`).join("")}</select></label>` : ""}
        <div class="ee-row"><span>Prioridade</span><div class="ee-toggle">
          <button class="chip-escopo ${esc2 === "tudo" ? "on" : ""}" data-action="estudar-escopo" data-e="tudo">Todos</button>
          <button class="chip-escopo ${esc2 === "incidencia" ? "on" : ""}" data-action="estudar-escopo" data-e="incidencia" data-tip="'O que mais cai' usa só as súmulas/teses marcadas por incidência (★).${temInc ? "" : " Nenhuma marcada ainda: marque em Ler > ★ Marcar incidência."}">O que mais cai</button>
        </div></div>
        <div class="ee-foot">${jFiltrado ? `<button class="lnk" data-action="estudar-escopo-limpar">${icone("x")} Limpar recorte</button>` : "<span></span>"}<button class="btn btn-sm btn-primary" data-action="estudar-escopo-toggle">Pronto</button></div>
      </div>` : ""}
    </div>`;
  const escopoSel = tipo === "lei" ? escopoLeiHTML : escopoJurisHTML;

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

  // A recomendação do Mentor "mora" no card certo (sem hero duplicado). Recs que não têm card
  // próprio (foco/tema fraco) apontam para o Certo/Errado, a prática universal.
  const recCardAcao = { "estudar-foco": "estudar-ce", "estudar-tema-fraco": "estudar-ce" }[rec.acao] || rec.acao;
  const card = (ic, titulo, desc, acao, extra, on = true) => {
    const isRec = on && acao === recCardAcao;
    return `
    <button class="estudar-card ${on ? "" : "off"} ${isRec ? "rec" : ""}" data-action="${acao}" ${on ? "" : "disabled"}${isRec ? ` data-tip="${esc(rec.desc)}"` : ""}>
      ${isRec ? `<span class="estudar-card-rec">${icone("sparkles")} Recomendado pelo Mentor</span>` : ""}
      <span class="estudar-card-ic">${icone(ic)}</span>
      <span class="estudar-card-txt"><b>${titulo}</b><span class="muted small">${desc}</span></span>
      ${extra ? `<span class="estudar-card-n">${extra}</span>` : ""}
    </button>`;
  };
  const grupo = (ic, titulo, sub, cards) => `<section class="estudar-grupo">
      <div class="eg-head"><span class="eg-ic">${icone(ic)}</span><b>${titulo}</b><span class="muted small">${sub}</span></div>
      <div class="estudar-grid">${cards.filter(Boolean).join("")}</div>
    </section>`;

  // Erros FUNDIDOS (E5): um card só "Meus erros" com Refazer (treino) + Abrir caderno (tela dedicada).
  const isRecErros = recCardAcao === "estudar-erros";
  const errosCard = (errosN || erros.length) ? `<div class="estudar-card estudar-card-gerar ${isRecErros ? "rec" : ""}">
      ${isRecErros ? `<span class="estudar-card-rec">${icone("sparkles")} Recomendado pelo Mentor</span>` : ""}
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
    card("repeat-2", "Certo / Errado", tipo === "juris" ? "Afirmações sobre a súmula/tese — você julga Certo ou Errado." : "Uma palavra é trocada no texto; você caça a pegadinha (diff colorido).", "estudar-ce", nEsc ? `${nEsc}` : "", !!nEsc),
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
          <span class="estudar-card-txt"><b>Gerar material</b><span class="muted small">A IA cria a partir do escopo e abre a aba correspondente.</span></span>
          <span class="estudar-card-acoes">
            <button class="btn btn-sm btn-soft" data-action="estudar-flashcards">${icone("layers")} Flashcards</button>
            <button class="btn btn-sm btn-soft" data-action="estudar-questoes">${icone("notebook-pen")} Questões</button>
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
  const crossLei = estudarLeiSel === "todas";
  const temTemas = temasDisp.length; // F3: memorizar por tema também na juris
  const temMaisDeUmaLei = tipo === "lei" && new Set(st.indicacoes.filter((i) => i.tipo === "lei" && !i.metaLeitura && !i.revogado && (i.texto || "").trim()).map((i) => normaDeRef(i.referencia) || "Outros")).size > 1;
  const temaChipsHTML = temTemas ? `<div class="est-temas">
      <span class="est-temas-h">${icone("tags")} Memorizar por tema</span>
      <div class="est-temas-chips">
        ${temasDisp.slice(0, 12).map((t) => `<button class="est-tema-chip ${estudarTemaSel === t.tema ? "on" : ""}" data-action="estudar-tema-chip" data-tema="${esc(t.tema)}" data-tip="Estudar só ${esc(t.tema)}${crossLei ? " (todas as leis)" : ""} — Certo/Errado, Completar e Gerar passam a focar neste tema.">${esc(t.tema)} <span class="etc-n">${t.n}</span></button>`).join("")}
        ${estudarTemaSel ? `<button class="est-tema-chip clear" data-action="estudar-tema-limpar" data-tip="Voltar a todos os temas.">${icone("x")} limpar</button>` : ""}
      </div>
      ${temMaisDeUmaLei ? `<button class="est-crosslei ${crossLei ? "on" : ""}" data-action="estudar-cross-lei" data-tip="Alternar entre estudar o tema só nesta lei ou em TODAS as leis importadas.">${icone(crossLei ? "check-check" : "layers")} ${crossLei ? "Todas as leis" : "Só esta lei"}</button>` : ""}
    </div>` : "";

  return `
    ${dashboard}
    ${sugereHTML}
    ${temaChipsHTML}
    ${escopoSel}
    ${grupo("rotate-ccw", "Revisar", "o que você já viu", cardsRevisar)}
    ${grupo("dumbbell", "Treinar", "teste-se na letra da lei", cardsTreinar)}
    ${gerarHTML}
    ${statsHTML}`;
}

// Aba LER — a letra (link/anotações/texto). Não lidos agrupados por norma; lidos recolhidos.
// No modo LEITOR (semGrupo=true) já há a barra da lei no topo → não repete o cabeçalho de norma.
function lerCorpoHTML(st, tipo, lista, r, store, vincMap, semGrupo = false, filtroLei = null) {
  // Mesmo botão do topo (mesmo data-action "importar" → mesmo chooser "letra da lei / lista·PDF"),
  // mesmo rótulo e tooltip, para não parecer uma ação diferente.
  const ctaAdd = `<button class="btn btn-add" data-action="importar" data-tip="${tipo === "lei" ? "Trazer a lei: do site oficial (Planalto), colando o texto, ou de um PDF." : "Trazer súmulas/teses: colando o texto/informativo ou de um PDF."}">${icone("download")} Importar</button>`;
  // LEITOR (lei): TODOS os artigos em ordem; o lido PERMANECE no lugar (esmaecido), nunca some.
  if (semGrupo) {
    if (lista.length) { const fechados = new Set((((st.config.leitura || {}).indiceFechado || {})[leiAtiva.lei]) || []); return renderLeitorArvore(lista, (i) => itemLeitorHTML(st, tipo, i, store, vincMap), _indiceColapsado, fechados); }
    if (filtroLei) return vazio(`Nenhum artigo neste filtro\nNenhum artigo marcado como ${{ lido: "lido", favorito: "favorito", dificil: "difícil", grifo: "grifado", anotacao: "anotado" }[filtroLei] || filtroLei}.`,
      `<button class="btn btn-ghost" data-action="ler-limpar-filtro">${icone("x")} Limpar filtro</button>`, icone("filter"));
    return vazio(`Comece pela letra\nImporte ou cole ${r.itemVazio} para ler, marcar e treinar.`, ctaAdd, icone("book-open"));
  }
  // Jurisprudência (lista de cards): como na Lei Seca, o LIDO permanece no lugar (esmaecido via
  // .ls-item.lido) — não vai para uma seção "Lidos" nem some. Súmula/tese lida pode ser relida.
  if (!lista.length) return vazio(`Comece pela letra\nImporte ou cole ${r.itemVazio} para ler, marcar e treinar.`, ctaAdd, icone("book-open"));
  return corpoAgrupado(lista, tipo, "ler", (i) => itemHTML(st, tipo, i, store, "ler", vincMap));
}


// Detecta a norma (abreviação/Lei) mencionada no TEXTO LIVRE de uma meta ("… da CF", "… do CPC",
// "Lei 8.112/90"). CPP/CPC antes de CP (senão "CP" casaria dentro deles). null se não achar.
function normaDoTextoMeta(ref) {
  const t = String(ref || "");
  const cod = t.match(/\b(CF|CDC|CTN|CLT|CPP|CPC|CP|CC)\b/);
  if (cod) return cod[1];
  const lei = t.match(/lei\s+(?:complementar\s+)?n?[ºo°.]*\s*([\d.]+)(?:\s*\/\s*(\d{4}))?/i);
  if (lei) return `Lei ${lei[1]}${lei[2] ? "/" + lei[2] : ""}`;
  return null;
}

// Progresso de uma meta de leitura QUANDO parseável (intervalo de artigos + lei determinável) —
// conta quantos artigos daquele intervalo já foram LIDOS. Conservador: sem intervalo claro, sem
// lei determinável (e >1 lei importada) ou sem artigo casado → null (a meta fica sem barra).
function progressoMeta(st, ref) {
  const s = String(ref || "");
  const m = s.match(/art(?:igos?|s)?\.?\s*(\d+)\s*[ºo°]?\s*(?:a|at[ée]|[-–—])\s*(\d+)/i) || s.match(/\b(\d+)\s*[ºo°]?\s*(?:a|[-–—])\s*(\d+)\b/);
  if (!m) return null;
  const de = Math.min(+m[1], +m[2]), ate = Math.max(+m[1], +m[2]);
  if (ate - de > 800) return null; // sanidade
  const arts = st.indicacoes.filter((i) => i.tipo === "lei" && !i.metaLeitura && !i.revogado && (i.texto || "").trim());
  const normaAlvo = normaDoTextoMeta(s);
  let cand = arts;
  if (normaAlvo) cand = arts.filter((i) => normaDeRef(i.referencia) === normaAlvo);
  else { const normas = [...new Set(arts.map((i) => normaDeRef(i.referencia)).filter(Boolean))]; if (normas.length !== 1) return null; }
  const noRange = cand.filter((i) => { const n = numArtigo(i.referencia); return n >= de && n <= ate; });
  if (!noRange.length) return null;
  const lidos = noRange.filter((i) => i.lido).length;
  return { lidos, total: noRange.length, pct: Math.round((100 * lidos) / noRange.length) };
}

// Aba METAS — metas CRUAS de leitura (sem transcrever a letra). Cada meta = tarefa no
// Planejamento; dá para quebrar em partes. Pendentes em cima, concluídas recolhidas.
function metasCorpoHTML(st, tipo, lista, r, store) {
  const cta = `<button class="btn btn-add" data-action="nova-meta">${icone("calendar-check")} Nova meta de leitura</button>`;
  const pano = tipo === "lei" ? store.planejamentoLeitura(tipo) : null;
  const dueRev = store.memoriasParaRevisar(tipo);
  const pend = lista.filter((i) => !i.lido);
  const done = lista.filter((i) => i.lido);

  if (!lista.length && (!pano || !pano.total))
    return vazio(
      `Sem metas de leitura\nCrie metas cruas (ex.: "${tipo === "juris" ? "ler os Informativos 810–815 do STJ" : "ler art. 1º a 20 da CF"}"). Cada uma vira tarefa no Planejamento e pode ser quebrada em partes.`,
      cta,
      icone("calendar-check")
    );

  // F6 — DASHBOARD do Planejamento Inteligente (só lei: progresso + ritmo + previsão).
  const dashboard = pano && pano.total ? `<div class="plan-dash">
      <div class="pd-card pd-prog">
        <div class="pd-lbl">Progresso da leitura</div>
        <div class="pd-big">${pano.lidos}<span class="pd-de"> / ${pano.total}</span></div>
        <div class="pd-bar pd-bar-dual" data-tip="${pano.pct}% lido · ${pano.pctDominado}% dominado"><span class="pdb-lido" style="width:${pano.pct}%"></span><span class="pdb-dom" style="width:${pano.pctDominado}%"></span></div>
        <div class="pd-sub">${pano.pct}% lido · <b class="pd-dom">${pano.pctDominado}% dominado</b> · faltam ${pano.faltam}</div>
      </div>
      <div class="pd-card"><span class="pd-ic">${icone("zap")}</span><div class="pd-n">${pano.ritmoDia || "—"}</div><div class="pd-l">artigos/dia (seu ritmo)</div>${pano.lidosSemana ? `<div class="pd-semana">${icone("flame")} ${plural(pano.lidosSemana, "lido", "lidos")} esta semana</div>` : ""}</div>
      <div class="pd-card"><span class="pd-ic">${icone("flag")}</span><div class="pd-n">${pano.previsaoData ? fmtData(pano.previsaoData) : "—"}</div><div class="pd-l">${pano.previsaoDias != null ? `conclusão em ~${plural(pano.previsaoDias, "dia", "dias")}` : "leia alguns dias p/ prever"}</div></div>
    </div>` : "";

  // F6 — METAS QUANTITATIVAS diárias (artigos/dia, questões/dia) com progresso de hoje.
  const metaBar = (k, ic, lbl, feito, meta) => {
    const pct = meta ? Math.min(100, Math.round((100 * feito) / meta)) : 0;
    return `<div class="plan-meta ${meta && feito >= meta ? "ok" : ""}">
        <span class="pm-ic">${icone(ic)}</span>
        <div class="pm-body">
          <div class="pm-top"><b>${lbl}</b>${meta ? `<span class="pm-nums">${feito} / ${meta}${meta && feito >= meta ? ` ${icone("check")}` : ""}</span>` : `<span class="muted small">sem meta definida</span>`}</div>
          ${meta ? `<div class="pm-bar"><span style="width:${pct}%"></span></div>` : ""}
        </div>
        <button class="btn btn-ghost btn-sm" data-action="meta-set" data-k="${k}">${icone(meta ? "square-pen" : "plus")} ${meta ? "Ajustar" : "Definir"}</button>
      </div>`;
  };
  // BLOCO 2 - "Hoje": funde metas diarias + agenda + calendario leve. UMA fonte de revisoes (o
  // calendario consolidado), entao o numero de hoje bate com a celula de hoje (sem inconsistencia).
  const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const hojeCal = todayISO();
  const dowHoje = new Date(hojeCal + "T12:00:00").getDay();
  const semana = []; for (let k = 0; k < 7; k++) semana.push(addDays(addDays(hojeCal, -dowHoje), k));
  const revsAll = store.revisoesConsolidadas();
  const revPorDia = {}; let atrasadas = 0;
  for (const rv of revsAll) { if (rv.proxima < hojeCal) atrasadas++; else revPorDia[rv.proxima] = (revPorDia[rv.proxima] || 0) + 1; }
  const folgasSem = st.config.diasFolga || []; const feriadosSem = st.config.diasFeriado || [];
  const revDoDia = (d) => (d === hojeCal ? (revPorDia[d] || 0) + atrasadas : (revPorDia[d] || 0));
  const revHoje = revDoDia(hojeCal);
  const hojeBlock = `<section class="plan-sec plan-hoje">
      <div class="plan-sec-head">${icone("calendar-check")} Hoje</div>
      ${pano && pano.total ? metaBar("artigosDia", "book-open", "Ler artigos", pano.lidosHoje, pano.metaArtigosDia) + metaBar("questoesDia", "check-check", "Resolver questões", pano.questoesHoje, pano.metaQuestoesDia) : ""}
      <div class="pa-linha"><span class="pa-ic">${icone("brain")}</span><b>${plural(revHoje, "revisão vencendo", "revisões vencendo")}</b>${revHoje ? ` <button class="lnk" data-action="ir-revisoes">revisar agora</button>` : ""}</div>
      <div class="plan-semana-rot">Esta semana</div>
      <div class="plan-cal plan-semana">
        ${semana.map((d) => {
          const dow = new Date(d + "T12:00:00").getDay();
          const isHoje = d === hojeCal, isFolga = folgasSem.includes(dow) || feriadosSem.includes(d), n = revDoDia(d);
          return `<div class="pc-dia ${isHoje ? "hoje" : ""} ${isFolga ? "folga" : ""}"><span class="pc-dow">${DOW[dow]}</span><span class="pc-num">${d.slice(8)}</span>${isFolga ? `<span class="pc-tag">folga</span>` : n ? `<button class="pc-rev" data-action="ir-revisoes" data-tip="${plural(n, "revisão", "revisões")}${d === hojeCal && atrasadas ? ` (${atrasadas} atrasada${atrasadas > 1 ? "s" : ""})` : ""}">${n}</button>` : `<span class="pc-vazio">—</span>`}</div>`;
        }).join("")}
      </div>
      <button class="btn btn-soft btn-sm" data-action="ir-planejamento" data-tip="Cronograma da semana, replanejamento e horas - no Planejamento global.">${icone("calendar-days")} Abrir Planejamento da semana</button>
    </section>`;

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
      ${(() => { const p = i.lido ? null : progressoMeta(st, i.referencia); return p ? `<div class="ls-meta-prog ${p.pct >= 100 ? "ok" : ""}"><div class="lmp-bar"><span style="width:${p.pct}%"></span></div><span class="lmp-txt">${p.lidos}/${p.total} lidos · ${p.pct}%</span></div>` : ""; })()}
      <div class="ls-rodape">
        <div class="ls-acoes">
          <button class="lnk" data-action="quebrar-meta" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Divide esta meta em etapas menores (ex.: blocos de artigos). Cada etapa vira uma tarefa.">${icone("list-checks")} Dividir em etapas</button>
          <details class="ls-mais"><summary data-tip="Mais ações" title="Mais ações">${icone("ellipsis")}</summary><div class="ls-mais-pop">
            <button class="lnk" data-action="editar" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Editar a referência e o vínculo.">${icone("square-pen")} Editar</button>
            <button class="lnk lnk-danger" data-action="remover" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Remover esta meta.">${icone("x")} Remover</button>
          </div></details>
        </div>
      </div>
    </div>`;
  };
  let listaHTML = pend.length ? pend.map(linha).join("") : `<p class="muted small" style="padding:6px 2px">${icone("check")} Nenhuma meta de leitura pendente. Crie uma para dividir o estudo em partes.</p>`;
  if (done.length) {
    listaHTML += `<div class="concluidas-head">
        <button class="lnk" data-action="toggle-concluidas">${mostrarConcluidas[tipo] ? icone("chevron-down") : icone("chevron-right")} ${icone("check")} Concluídas (<span class="num">${done.length}</span>)</button>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" data-action="limpar-lidas" data-tip-pos="cima-dir" data-tip="Remove as metas já concluídas.">${icone("trash-2")} Limpar concluídas</button>
      </div>
      ${mostrarConcluidas[tipo] ? done.map(linha).join("") : ""}`;
  }
  return `${dashboard}${hojeBlock}
    <section class="plan-sec">
      <div class="plan-sec-head">${icone("list-checks")} Metas de leitura ${pend.length ? `<span class="muted small">— ${plural(pend.length, "pendente", "pendentes")}</span>` : ""}</div>
      ${listaHTML}
    </section>`;
}

// Item da aba LER (v4) — enxuto: a letra + poucas ações (prática/geração ficam no Estudar).
// Incidência aparece INLINE (mini-barra). O menu "⋯" traz só organizar/gerenciar.
// vincMap: índice de vínculos pré-computado (store.mapaVinculos) para evitar O(n²) no render.
// Corpo do artigo SEM o prefixo "Art. Nº" (a referência já vai no cabeçalho) — evita repetição.
function corpoArtigoLimpo(texto) {
  const t = String(texto || "");
  // "Art. 1º - Não..." → "Não..."; "Art. 121. Matar" → "Matar"; "Art. 5º-A - Texto" → "Texto".
  // Sufixo de letra só ATADO ("5º-A"), nunca "\s*-\s*[A-Z]" (isso comia o início da frase, ex.: "- Não").
  const sem = t.replace(/^\s*Art\.?\s*\d+\s*[ºo°]?(?:-[A-Z])?\s*[-–—.:]?\s*/i, "").trim();
  return sem || t;
}

// F1c: indenta o dispositivo em blocos — caput · § parágrafos · incisos (I, II…) · alíneas (a, b…).
// Heurística SEGURA (só insere quebras nas fronteiras, nunca apaga/embaralha). Preserva a letra.
function formatarTextoLei(texto) {
  const SEP = String.fromCharCode(1); // separador interno (não aparece na letra da lei)
  let t = String(texto || "");
  t = t.replace(/\s+(?=(?:§\s*\d+[ºo°]?|Parágrafo\s+único)\b)/gi, SEP + "P"); // parágrafos
  t = t.replace(/(?<=[;:]\s)(?=[IVXLCDM]{1,4}\s*[-–]\s)/g, SEP + "I");         // incisos (após ; ou :)
  t = t.replace(/(?<=[;:]\s)(?=[a-z]\)\s)/g, SEP + "A");                        // alíneas
  const cls = { P: "lei-par", I: "lei-inc", A: "lei-ali" };
  const parts = t.split(SEP);
  const out = [];
  const caput = (parts[0] || "").trim();
  if (caput) out.push(`<div class="lei-caput">${esc(caput)}</div>`);
  for (let k = 1; k < parts.length; k++) {
    const txt = parts[k].slice(1).trim();
    if (txt) out.push(`<div class="${cls[parts[k][0]] || "lei-caput"}">${esc(txt)}</div>`);
  }
  return out.join("") || esc(String(texto || ""));
}

// Mapa de origem Formatado↔Cru: renderiza o texto INDENTADO (caput/§/inciso/alínea) já com os
// grifos POR CIMA. Cada bloco carrega data-raw = offset (no texto CRU) do seu 1º caractere visível,
// para (a) posicionar as marcas e (b) converter a seleção do usuário de volta para offset ao grifar.
// Contíguo por construção (nunca apaga caractere) → os offsets batem com os das marcas.
function segmentosLei(rawTexto) {
  const raw = String(rawTexto || "");
  const mPref = raw.match(/^\s*Art\.?\s*\d+\s*[ºo°]?(?:-[A-Z])?\s*[-–—.:]?\s*/i);
  const base = mPref && raw.slice(mPref[0].length).trim() ? mPref[0].length : 0;
  const body = raw.slice(base);
  const bnds = [];
  let m;
  const reP = /(?:§\s*\d+[ºo°]?|Parágrafo\s+único)\b/gi;
  while ((m = reP.exec(body))) bnds.push({ pos: m.index, cls: "lei-par" });
  const reI = /(?<=[;:]\s)[IVXLCDM]{1,4}\s*[-–]\s/g;
  while ((m = reI.exec(body))) bnds.push({ pos: m.index, cls: "lei-inc" });
  const reA = /(?<=[;:]\s)[a-z]\)\s/g;
  while ((m = reA.exec(body))) bnds.push({ pos: m.index, cls: "lei-ali" });
  // Item (abaixo da alínea): número + parêntese, "1)"/"2)" — conservador p/ não confundir com §/inciso.
  const reIt = /(?<=[;:]\s)\d{1,2}\)\s/g;
  while ((m = reIt.exec(body))) bnds.push({ pos: m.index, cls: "lei-item" });
  bnds.sort((a, b) => a.pos - b.pos);
  const segs = [];
  let prev = 0, prevCls = "lei-caput";
  for (const b of bnds) { if (b.pos <= prev) continue; segs.push({ s: prev, e: b.pos, cls: prevCls }); prev = b.pos; prevCls = b.cls; }
  segs.push({ s: prev, e: body.length, cls: prevCls });
  // Apara espaços das pontas p/ exibição, mantendo o offset CRU (base + índice) do 1º char visível.
  return segs.map((seg) => {
    let s = seg.s, e = seg.e;
    while (s < e && /\s/.test(body[s])) s++;
    while (e > s && /\s/.test(body[e - 1])) e--;
    return e > s ? { texto: body.slice(s, e), raw: base + s, cls: seg.cls } : null;
  }).filter(Boolean);
}
function trechoComMarcas(text, rawStart, marcas, opts = {}) {
  const rawEnd = rawStart + text.length;
  const modo = opts.modo || "normal", revelados = opts.revelados;
  const rel = (marcas || [])
    .filter((m) => m.fim > rawStart && m.inicio < rawEnd)
    .map((m) => ({ id: m.id, cor: m.cor, a: Math.max(m.inicio, rawStart) - rawStart, b: Math.min(m.fim, rawEnd) - rawStart }))
    .sort((x, y) => x.a - y.a);
  let html = "", pos = 0;
  for (const m of rel) {
    if (m.a < pos) continue; // sobreposição — ignora
    if (m.a > pos) html += esc(text.slice(pos, m.a));
    const trecho = text.slice(m.a, m.b);
    // Recordar: grifo (não comentário) vira lacuna clicável, exceto se já revelado.
    if (modo === "recordar" && m.cor !== "comentario" && !(revelados && revelados.has(m.id))) {
      html += `<span class="mk mk-cloze mk-${m.cor}" data-cloze="${m.id}" title="Clique para revelar">${"_".repeat(Math.max(3, Math.min(16, trecho.length)))}</span>`;
    } else {
      const cls = m.cor === "comentario" ? "mk mk-comentario mk-tem-nota" : "mk mk-" + m.cor;
      html += `<mark class="${cls}" data-mid="${m.id}">${esc(trecho)}</mark>`;
    }
    pos = m.b;
  }
  if (pos < text.length) html += esc(text.slice(pos));
  return html;
}
function renderLeiComMarcas(rawTexto, marcas, opts = {}) {
  // "marcas" (só grifos): esconde o resto, mostra só os trechos grifados na ordem.
  if (opts.modo === "marcas") {
    const gs = (marcas || []).filter((m) => m.cor !== "comentario").sort((a, b) => a.inicio - b.inicio);
    if (!gs.length) return `<span class="muted">Nada grifado neste artigo — grife trechos para revisar aqui.</span>`;
    return gs.map((m) => `<mark class="mk mk-${m.cor}">${esc(m.texto)}</mark>`).join(`<span class="mk-sep"> · </span>`);
  }
  const segs = segmentosLei(rawTexto);
  if (!segs.length) return esc(corpoArtigoLimpo(rawTexto));
  return segs.map((seg) => `<div class="${seg.cls}" data-raw="${seg.raw}">${trechoComMarcas(seg.texto, seg.raw, marcas, opts)}</div>`).join("");
}

// Menu "⋯" do artigo (organizar/gerenciar) — usado pelo render do leitor.
function menuArtigoHTML(i, tipo) {
  return [
    i.texto ? `<button class="lnk" data-action="ler-foco-art" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Abrir a leitura em foco (tela cheia) neste artigo.">${icone("book-open")} Ler em foco</button>` : "",
    i.texto ? `<button class="lnk" data-action="estudar-artigo" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Certo/Errado só deste artigo — testa a letra (certo/errado).">${icone("repeat-2")} Estudar este artigo</button>` : "",
    i.texto && !i.promovido ? `<button class="lnk" data-action="promover-mem" data-id="${i.id}">${icone("brain")} Marcar para revisar</button>` : "",
    i.promovido ? `<button class="lnk" data-action="despromover-mem" data-id="${i.id}">${icone("brain")} Tirar da revisão</button>` : "",
    i.novidadeEm ? `<button class="lnk" data-action="limpar-novidade" data-id="${i.id}">${icone("check")} Já vi a novidade</button>` : "",
    `<button class="lnk" data-action="art-nota" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Nota livre deste artigo (lembrete, macete) — sem precisar grifar.">${icone("notebook-pen")} ${i.observacao ? "Editar nota" : "Adicionar nota"}</button>`,
    i.texto ? `<button class="lnk" data-action="art-temas" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Ver e corrigir os temas deste artigo (Prazo, Competência…).">${icone("tags")} Temas${(i.temas || []).length ? ` (${i.temas.length})` : ""}</button>` : "",
    `<button class="lnk" data-action="editar" data-id="${i.id}">${icone("square-pen")} Editar</button>`,
    i.revogado
      ? `<button class="lnk" data-action="reativar-rev" data-id="${i.id}">${icone("rotate-ccw")} Reativar</button>`
      : `<button class="lnk lnk-danger" data-action="marcar-rev" data-id="${i.id}">${icone("ban")} ${rotuloRevogado(tipo, i.categoria).acao}</button>`,
    `<button class="lnk lnk-danger" data-action="remover" data-id="${i.id}">${icone("x")} Remover</button>`,
  ].filter(Boolean).join("");
}

// F1d: microinteração — o indicador de status "aparece" com um pop suave após marcar. Como o
// app.refresh() recria o DOM, buscamos o elemento novo no document e aplicamos a classe uma vez.
function animarFlagsLeitor(id) {
  if (typeof document === "undefined") return;
  const el = document.querySelector(`.ler-art[data-id="${id}"] .ler-flags`);
  if (el) { el.classList.remove("ler-flag-anim"); void el.offsetWidth; el.classList.add("ler-flag-anim"); }
}

// Render do artigo no LEITOR (F1b): SEM cartão — bloco de texto contínuo, separador fino,
// cabeçalho discreto "Art. Nº" (sem repetir a lei), texto sem o prefixo, ações no hover.
function itemLeitorHTML(st, tipo, i, store, vincMap) {
  const refCurta = String(i.referencia || "").split(",")[0].trim();
  const corpo = corpoArtigoLimpo(i.texto);
  const est = i.pqIncidencia != null && store ? store.estrelasIncidencia(i.pqIncidencia) : 0;
  const rotRev = rotuloRevogado(tipo, i.categoria);
  const badges =
    (i.revogado ? `<span class="mini-tag rev-tag">${icone("ban")} ${rotRev.adj}</span>` : "") +
    (i.novidadeEm && !i.revogado ? `<span class="mini-tag nov-tag" data-tip="Novidade legislativa (${fmtData(i.novidadeEm)}).">${icone("sparkles")} novidade</span>` : "") +
    (i.promovido ? `<span class="mini-tag" data-tip="Na sua revisão espaçada.">${icone("brain")} revisando</span>` : "");
  const incHTML = est ? `<span class="ler-art-inc" data-tip="Incidência ${i.pqIncidencia} — o quanto cai.">${"★".repeat(est)}<span class="ler-inc-off">${"★".repeat(5 - est)}</span></span>` : "";
  const ic = (acao, on, iconeNome, tip) => `<button class="ler-ic ${on ? "on-" + on : ""}" data-action="${acao}" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="${tip}">${icone(iconeNome)}</button>`;
  const acoes =
    ic("ler-lido", i.lido ? "ok" : "", "check", i.lido ? "Lido — clique para desmarcar." : "Marcar como lido.") +
    ic("toggle-favorito", i.favorito ? "fav" : "", "bookmark", i.favorito ? "Favorito (entra em revisão). Clique para tirar." : "Favoritar (destaca e entra em revisão).") +
    ic("toggle-dificil", i.dificil ? "dif" : "", "flame", i.dificil ? "Difícil (revisão 1/3/7/15/30). Clique para tirar." : "Marcar como difícil (agenda revisão).") +
    ic("toggle-pq", i.pq ? "pq" : "", "star", i.pq ? "Provável questão. Clique para desmarcar." : "Marcar como provável questão.") +
    `<details class="ls-mais ler-mais"><summary data-tip="Mais ações">${icone("ellipsis")}</summary><div class="ls-mais-pop">${menuArtigoHTML(i, tipo)}</div></details>`;
  const grifos = store ? store.marcasAncoradas("indicacao", i.id, i.texto) : [];
  return `<article class="ler-art ${i.lido ? "lida" : ""} ${i.revogado ? "revogada" : ""} ${i.favorito ? "fav" : ""} ${i.dificil ? "dif" : ""}" data-foco-id="${i.id}" data-id="${i.id}">
    <div class="ler-art-head">
      ${i.lido ? `<span class="ler-lido-mark" data-tip="Lido">${icone("check")}</span>` : ""}
      <span class="ler-art-ref">${esc(refCurta)}</span>
      ${i.nomeJuridico ? `<span class="ler-art-nome">${esc(i.nomeJuridico)}</span>` : ""}
      ${i.dificil ? `<span class="ler-dif-mark" data-tip="Difícil">${icone("flame")}</span>` : ""}
      ${incHTML}${badges}
      <span class="spacer"></span>
      <div class="ler-art-acoes">${acoes}</div>
    </div>
    ${i.texto ? `<div class="ler-art-corpo" data-art-corpo="${i.id}">${renderLeiComMarcas(i.texto, grifos)}</div>` : ""}
    ${i.observacao ? `<div class="ler-art-obs">${icone("notebook-pen")} ${esc(i.observacao)}</div>` : ""}
  </article>`;
}

// F2 — badge "último informativo no sistema" (por tribunal) + atalho para o site oficial.
const SITES_INFORMATIVO = {
  STF: "https://portal.stf.jus.br/textos/verTexto.asp?servico=informativoSTF",
  STJ: "https://processo.stj.jus.br/jurisprudencia/externo/informativo/",
};
function ultimoInfoBadgeHTML(st) {
  const porTrib = {};
  for (const i of st.indicacoes || []) {
    if (i.tipo !== "juris" || !i.nInformativo) continue;
    if (/teses|enunciado/i.test(i.categoria || "")) continue; // edição de Jur. em Teses / enunciados não são "informativo"
    const trib = String(i.tribunal || "").toUpperCase();
    const n = parseInt((String(i.nInformativo).match(/\d+/) || ["0"])[0], 10);
    if (!n || !trib) continue;
    if (!porTrib[trib] || n > porTrib[trib].n) porTrib[trib] = { n, data: i.dataDivulgacao || null };
  }
  // Tribunais com site oficial (STF/STJ) SEMPRE aparecem com o atalho "abrir site ↗" (para conferir
  // o último informativo, copiar o texto ou baixar o PDF e importar aqui). O nº aparece quando já há
  // informativo daquele tribunal no sistema. + eventuais outros tribunais já importados.
  const extras = Object.keys(porTrib).filter((t) => !SITES_INFORMATIVO[t]);
  const todos = [...Object.keys(SITES_INFORMATIVO), ...extras];
  const item = (t) => {
    const p = porTrib[t];
    const num = p ? ` nº <b class="tabnums">${p.n}</b>${p.data ? ` <span class="muted">· ${esc(p.data)}</span>` : ""}` : ` <span class="muted small">— nenhum ainda</span>`;
    const site = SITES_INFORMATIVO[t] ? ` <a class="ui-site" href="${SITES_INFORMATIVO[t]}" target="_blank" rel="noopener" data-tip="Abrir os informativos no site oficial — copie o texto ou baixe o PDF e importe aqui.">abrir site ↗</a>` : "";
    return `<span class="ui-item"><b>${esc(t)}</b>${num}${site}</span>`;
  };
  return `<div class="ultimo-info">
    <span class="ui-lbl">${icone("scale")} Informativos</span>
    ${todos.map(item).join('<span class="ui-div"></span>')}
  </div>`;
}
// F2 — cor do chip de ramo do direito (leitura visual instantânea na lista de jurisprudência).
function corRamo(ramo) {
  const r = String(ramo || "").toLowerCase();
  if (/constituc/.test(r)) return "#4f5bd5";
  if (/penal/.test(r)) return "#c4456b";
  if (/administrat/.test(r)) return "#0f8f8f";
  if (/civil/.test(r)) return "#7a4bd0";
  if (/process/.test(r)) return "#2f6bd0";
  if (/tribut/.test(r)) return "#b07a12";
  if (/previd/.test(r)) return "#2a8a4e";
  if (/trabalh/.test(r)) return "#b5642a";
  if (/consumidor/.test(r)) return "#0d9488";
  if (/empresar/.test(r)) return "#7c3aed";
  if (/human/.test(r)) return "#be185d";
  return "#5b6b86";
}
// F2 — linha de META rica do card de jurisprudência (extração de informativo): chip de ramo colorido,
// origem (tribunal + nº do informativo), assunto, órgão, processo, Tema, data, status.
function jurisMetaHTML(i) {
  const chip = (txt, cls) => txt ? `<span class="jm-chip ${cls || ""}">${esc(txt)}</span>` : "";
  const ramoChip = i.ramo ? `<span class="jm-ramo" style="--rc:${corRamo(i.ramo)}">${esc(i.ramo)}</span>` : "";
  const ehTeses = /teses/i.test(i.categoria || "");
  const rotFonte = ehTeses ? "Ed." : "Inf.";
  const origem = i.nInformativo ? `<span class="jm-origem">${esc(i.tribunal || "")}${i.tribunal ? " · " : ""}${rotFonte} ${esc(i.nInformativo)}</span>` : "";
  const stt = i.status === "importante"
    ? `<span class="jm-chip st-import">★ importante</span>`
    : (i.status === "superado" || i.revogado) ? "" : (i.status ? `<span class="jm-chip st-vig">● vigente</span>` : "");
  const meta = [
    ramoChip,
    i.assunto ? `<span class="jm-sub">${esc(i.assunto)}</span>` : "",
    chip(i.orgao),
    chip(i.processo, "mono"),
    i.temaNum ? chip("Tema " + i.temaNum) : "",
    chip(i.dataJulgamento, "mono"),
    stt,
  ].filter(Boolean).join("");
  return (origem || meta) ? `<div class="ls-juris-meta">${origem}${meta}</div>` : "";
}
// F2 — ÍNDICE navegável (Ramo → Assunto) da jurisprudência, classificado pela IA na extração.
// Clicar num ramo/assunto filtra a lista (e serve de escopo p/ estudar-por-tópico). Estilo Lei Seca.
function indiceJurisHTML(st) {
  const itens = (st.indicacoes || []).filter((i) => i.tipo === "juris" && !i.metaLeitura);
  const tree = {};
  for (const i of itens) {
    const rm = i.ramo || "Sem ramo";
    const as = i.assunto || "Outros";
    (tree[rm] = tree[rm] || { total: 0, assuntos: {} }).total++;
    tree[rm].assuntos[as] = (tree[rm].assuntos[as] || 0) + 1;
  }
  const ramos = Object.keys(tree).sort((a, b) => tree[b].total - tree[a].total || a.localeCompare(b, "pt-BR"));
  const head = `<div class="ji-head">${icone("list-tree")} Índice <span class="ji-ia">✦ assunto pela IA</span></div>`;
  if (!ramos.length) return `<aside class="juris-idx">${head}<p class="ji-vazio muted small">Importe informativos para o índice se montar por ramo → assunto.</p></aside>`;
  const body = ramos.map((rm) => {
    const g = tree[rm];
    const ramoOn = filtroRamo === rm;
    const assuntos = Object.keys(g.assuntos).sort((a, b) => g.assuntos[b] - g.assuntos[a] || a.localeCompare(b, "pt-BR"));
    return `<details class="ji-ramo" ${ramoOn ? "open" : ""}>
      <summary><span class="ji-dot" style="background:${corRamo(rm)}"></span><span class="ji-nome ${ramoOn && filtroAssunto === "todos" ? "on" : ""}" data-action="juris-idx-ramo" data-ramo="${esc(rm)}">${esc(rm)}</span><span class="ji-cnt">${g.total}</span></summary>
      <div class="ji-assuntos">${assuntos.map((as) => `<button class="ji-as ${ramoOn && filtroAssunto === as ? "on" : ""}" data-action="juris-idx-assunto" data-ramo="${esc(rm)}" data-assunto="${esc(as)}"><span>${esc(as)}</span><span class="ji-cnt">${g.assuntos[as]}</span></button>`).join("")}</div>
    </details>`;
  }).join("");
  const limpar = (filtroRamo !== "todos" || filtroAssunto !== "todos") ? `<button class="ji-limpar lnk" data-action="juris-idx-limpar">${icone("x")} limpar filtro</button>` : "";
  return `<aside class="juris-idx">${head}<div class="ji-tree">${body}</div><div class="ji-foot">Clique num assunto para <b>filtrar</b>.${limpar ? " " + limpar : ""}</div></aside>`;
}
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
  // F2 (#4) — ESTUDO ATIVO por card (o diferencial do Mentor): gera/treina direto do julgado.
  const iaOn = store && store.iaDisponivel();
  const estudarAcoes = (tipo === "juris" && (i.texto || "").trim() && !i.revogado)
    ? `<div class="ls-estudar-acoes">
        <span class="lea-lbl">estudar</span>
        <button class="lea ia" data-action="card-ce" data-id="${i.id}" data-tip="${iaOn ? "Gerar Certo/Errado desta tese e treinar agora." : "Conecte a IA (Configurações) para gerar."}">${icone("check")} Certo/Errado</button>
        <button class="lea ia" data-action="card-flash" data-id="${i.id}" data-tip="${iaOn ? "Gerar flashcards desta tese." : "Conecte a IA para gerar."}">${icone("layers")} Flashcard</button>
        <button class="lea ia" data-action="card-cloze" data-id="${i.id}" data-tip="Completar a tese (lacunas) — recordação ativa.">${icone("square-pen")} Completar</button>
        <button class="lea ${i.promovido ? "on" : ""}" data-action="${i.promovido ? "despromover-mem" : "promover-mem"}" data-id="${i.id}" data-tip="${i.promovido ? "Já está na revisão espaçada — clique para tirar." : "Colocar na revisão espaçada (curva do esquecimento)."}">${icone("repeat")} Revisar</button>
        <button class="lea foco" data-action="ler-foco" data-id="${i.id}" data-tip="Ler em foco, tela limpa.">${icone("book-open")} Foco</button>
      </div>`
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
      ${tipo === "juris" ? jurisMetaHTML(i) : ""}
      ${i.texto && !marcarAberto.has(i.id) ? `<div class="ls-texto">${esc(i.texto)}</div>` : ""}
      ${i.texto && marcarAberto.has(i.id) ? `<div class="mk-host" data-mk-host="${i.id}"></div>` : ""}
      ${i.observacao ? `<div class="ls-obs muted small">${icone("notebook-pen")} ${esc(i.observacao)}</div>` : ""}
      ${vincHTML}
      ${estudarAcoes}
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
