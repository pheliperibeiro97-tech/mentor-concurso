// Lei Seca / Jurisprudência — GRIFO pelo gesto de seleção (menu flutuante tipo Kindle),
// popover das marcas feitas e "Perguntar à IA" sobre um trecho.
// (Extraído mecanicamente de leiseca.js — comportamento idêntico.)
import { toast, avisoIA, abrirJanela, md as _md } from "../../ui.js";
import { esc } from "../../util.js";
import { icone } from "../../icones.js";
import { CORES_FIXAS, CORES_LIVRES } from "../../marcacao.js";
import { responderChat as _responderChat } from "../../ia-provider.js";
import { S } from "./estado.js";

// GRIFAR INDIVIDUAL (tipo Kindle): ao selecionar um trecho no leitor, um menu FLUTUANTE aparece.
// "Grifar" abre as CORES ali mesmo e pinta o trecho DIRETO sobre o texto (sem painel); "Comentar"
// abre o campo de anotação na hora. O offset é mapeado da seleção (bloco data-raw) para o texto CRU,
// e a marca guarda o trecho+contexto (âncora resiliente). Copiar e Perguntar à IA seguem no menu.
const CORES_GRIFO = [...CORES_FIXAS, ...CORES_LIVRES]; // fonte única: marcacao.js (nunca duplicar)
export function garantirGrifoFlutuante() {
  if (typeof document === "undefined" || window.__grifoFut) return;
  window.__grifoFut = true;
  const bar = document.createElement("div");
  bar.className = "grifo-fut";
  bar.style.display = "none";
  document.body.appendChild(bar);
  let modo = "menu";      // "menu" | "cores" | "nota"
  let cap = null;         // { id, ini, fim, exact, prefix, suffix, texto } capturado quando o menu abre
  const esconder = () => { bar.style.display = "none"; modo = "menu"; cap = null; };
  const finalizar = () => { try { window.getSelection().removeAllRanges(); } catch {} esconder(); const ctx = S._leitorCtx; if (ctx) { if (ctx.onMarca) ctx.onMarca(); else ctx.app.refresh(); } }; // no Foco, re-renderiza o overlay (não o fundo)

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
    // Fase 5 (grifo único): vale em QUALQUER corpo com data-art-corpo — leitor, Foco e os cards
    // de texto (juris/metas), que perderam o painel-pincel e grifam só pelo gesto de seleção.
    const corpo = el && el.closest ? el.closest("[data-art-corpo]") : null;
    return corpo ? { range, corpo, texto: sel.toString().trim() } : null;
  };
  const capturar = (s) => {
    if (!s || !s.corpo) return null;
    const id = s.corpo.getAttribute("data-art-corpo");
    if (!id) return { texto: s.texto };
    const ctx = S._leitorCtx; if (!ctx) return null;
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
  // Fase 5: rolar NÃO fecha mais o menu (fechava e o usuário "perdia" a seleção) — REPOSICIONA
  // junto da seleção (throttle por rAF); só fecha se a seleção se perdeu/colapsou.
  let _reposPend = false;
  window.addEventListener("scroll", () => {
    if (modo !== "menu" || bar.style.display === "none" || _reposPend) return;
    _reposPend = true;
    requestAnimationFrame(() => {
      _reposPend = false;
      if (modo !== "menu" || bar.style.display === "none") return;
      const s = selDentro();
      if (!s) { esconder(); return; }
      lastRect = s.range.getBoundingClientRect();
      posicionarAtual();
    });
  }, true);
  window.addEventListener("resize", esconder);
  bar.addEventListener("mousedown", (e) => { if (!e.target.closest(".gf-nota")) e.preventDefault(); }); // não perde a seleção (menos no input)
  bar.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.closest(".gf-nota")) { e.preventDefault(); salvarNota(); } if (e.key === "Escape") esconder(); });

  const grifar = (cor) => {
    const ctx = S._leitorCtx; if (!ctx || !cap) return;
    if (cap.ini == null) { toast("Selecione dentro de um parágrafo para grifar.", "erro"); return; }
    ctx.store.addMarca({ alvoTipo: "indicacao", alvoId: cap.id, cor, inicio: cap.ini, fim: cap.fim, texto: cap.exact, prefix: cap.prefix, suffix: cap.suffix });
    finalizar();
  };
  const salvarNota = () => {
    const ctx = S._leitorCtx; if (!ctx || !cap) return;
    const val = (bar.querySelector(".gf-nota")?.value || "").trim();
    if (cap.ini == null) { toast("Selecione dentro de um parágrafo para comentar.", "erro"); return; }
    const nova = ctx.store.addMarca({ alvoTipo: "indicacao", alvoId: cap.id, cor: "comentario", inicio: cap.ini, fim: cap.fim, texto: cap.exact, prefix: cap.prefix, suffix: cap.suffix });
    if (nova && val) ctx.store.setMarcaNota(nova.id, val);
    finalizar();
  };

  // Fase 5: entrada externa (botão "Anotar" do Foco) — abre o modo NOTA direto sobre a seleção
  // atual. Devolve false se não há seleção grifável (o chamador mostra a dica).
  S._gfAbrirNota = () => {
    const s = selDentro();
    if (!s) return false;
    cap = capturar(s);
    if (!cap || cap.ini == null) { cap = null; return false; }
    lastRect = s.range.getBoundingClientRect();
    modo = "nota"; render(); posicionar(lastRect);
    bar.querySelector(".gf-nota")?.focus();
    return true;
  };

  bar.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-gf],[data-cor]"); if (!btn) return;
    const ctx = S._leitorCtx; if (!ctx) return;
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
// Instalado uma vez; lê S._leitorCtx. Só age em clique simples (sem seleção em andamento).
export function garantirPopoverMarca() {
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
    const mk = e.target.closest("[data-art-corpo] mark.mk[data-mid]"); // leitor, Foco e cards (Fase 5)
    if (!mk || !window.getSelection().isCollapsed) return fechar();
    const ctx = S._leitorCtx; if (!ctx) return fechar();
    const marca = ctx.store.get().marcacoes.find((x) => x.id === mk.getAttribute("data-mid"));
    if (!marca) return fechar();
    abrir(mk, marca, ctx);
  });
  window.addEventListener("scroll", fechar, true);
}

// F2: "Perguntar à IA" sobre o trecho — INTERATIVO. O usuário escreve a dúvida (o trecho vira
// contexto) OU pede "Explicar em outras palavras". Pode ativar consulta à web. Nada automático.
export function perguntarIASobreTrecho(ctx, id, trecho) {
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
