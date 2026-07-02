// Helpers de UI (vanilla JS): seleção, eventos, toast, modal de confirmação, selos.
import { SELO } from "./ia.js";
import { esc } from "./util.js";
import { icone } from "./icones.js";

// Ícone de impressora (SVG, herda a cor do texto) — visual nítido e consistente em todo o app.
export const iconImprimir =
  '<svg class="ico-print" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>';

// Ícone de MAPA MENTAL (SVG monocromático, herda a cor — como os demais ícones de botão).
// Um nó central ligado a dois ramos: leitura de "mapa mental". Escala com a fonte (1em).
// Ícone de mapa mental: usa o MESMO do botão lateral (Lucide "network") p/ consistência.
export const iconMapa = icone("network");

export function qs(sel, root = document) {
  return root.querySelector(sel);
}
export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

// Liga handlers via delegação por [data-action].
export function bindActions(root, handlers) {
  root.addEventListener("click", (ev) => {
    const alvo = ev.target.closest("[data-action]");
    if (!alvo || !root.contains(alvo)) return;
    const acao = alvo.getAttribute("data-action");
    if (handlers[acao]) {
      ev.preventDefault();
      handlers[acao](alvo, ev);
    }
  });
}

export function toast(msg, tipo = "ok") {
  let cont = qs("#toasts");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "toasts";
    document.body.appendChild(cont);
  }
  const t = document.createElement("div");
  t.className = `toast toast-${tipo}`;
  t.textContent = msg;
  cont.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

// Confirmação simples (Promise<boolean>).
export function confirmar(msg) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-msg">${esc(msg)}</p>
        <div class="modal-acoes">
          <button class="btn btn-ghost" data-c="cancel">Cancelar</button>
          <button class="btn btn-danger" data-c="ok">Confirmar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const fim = (v) => { ov.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") fim(false); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", (e) => {
      const b = e.target.closest("[data-c]");
      if (!b && e.target !== ov) return;
      fim(!!(b && b.getAttribute("data-c") === "ok"));
    });
  });
}

// Modal de ESCOLHA com N opções (Promise<value> | null se fechar fora).
// opcoes: [{ label, value, cls? }]. cls aplica a classe do botão (ex.: "btn-primary").
// opts.lista = true → renderiza as opções como LISTA vertical (largura total, texto que
// quebra, com rolagem). Ideal para escolher 1 item entre MUITOS com rótulos longos
// (ex.: "DISCIPLINA · Tópico"), que estouravam o modal no layout de pílulas.
export function escolher(msg, opcoes, opts = {}) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    const corpo = opts.lista
      ? `<div class="modal-lista" style="display:flex;flex-direction:column;gap:6px;max-height:55vh;overflow:auto;margin-top:8px">
          ${opcoes.map((o) => `<button class="btn ${o.cls || "btn-ghost"}" data-v="${esc(o.value)}" style="display:block;width:100%;text-align:justify;white-space:normal;height:auto;line-height:1.35;padding:8px 12px">${esc(o.label)}</button>`).join("")}
        </div>`
      : `<div class="modal-acoes" style="flex-wrap:wrap">
          ${opcoes.map((o) => `<button class="btn ${o.cls || "btn-ghost"}" data-v="${esc(o.value)}">${esc(o.label)}</button>`).join("")}
        </div>`;
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-msg">${esc(msg)}</p>
        ${corpo}
      </div>`;
    document.body.appendChild(ov);
    const fim = (v) => { ov.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") fim(null); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (!b && e.target !== ov) return;
      fim(b ? b.getAttribute("data-v") : null);
    });
  });
}

// JANELA modal genérica (premium) — reaproveita a casca/CSS do mapa mental (.mm-overlay/.mm-modal):
// fundo escurecido, cabeçalho com Tela cheia + Fechar, corpo rolável, Esc/clique-fora fecham.
// `corpoHTML` é o conteúdo; `aoMontar(janelaEl, fechar)` permite ligar listeners aos elementos
// internos (botões/inputs do formulário). Devolve { overlay, fechar }.
export function abrirJanela({ titulo = "", corpoHTML = "", telaCheia = false, aoMontar } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "mm-overlay";
  overlay.innerHTML = `
    <div class="mm-modal" role="dialog" aria-modal="true">
      <div class="mm-head">
        <b class="mm-titulo">${esc(titulo)}</b>
        <span class="spacer"></span>
        <button class="lnk mm-full" data-tip="Expandir para tela cheia.">${icone("maximize-2")} Tela cheia</button>
        ${botaoFechar("mm-close")}
      </div>
      <div class="mm-corpo">${corpoHTML}</div>
    </div>`;
  document.body.appendChild(overlay);
  const fechar = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") fechar(); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
  overlay.querySelector(".mm-close").addEventListener("click", fechar);
  const fullBtn = overlay.querySelector(".mm-full");
  fullBtn.addEventListener("click", () => {
    const modal = overlay.querySelector(".mm-modal");
    const full = modal.classList.toggle("mm-modal--full");
    overlay.classList.toggle("mm-overlay--full", full);
    fullBtn.innerHTML = full ? `${icone("minimize-2")} Restaurar` : `${icone("maximize-2")} Tela cheia`;
  });
  document.addEventListener("keydown", onKey);
  if (telaCheia) fullBtn.click();
  if (aoMontar) aoMontar(overlay, fechar);
  // Autofocus no 1º campo (poupa um clique). Espera o render do fluxo, se houver.
  setTimeout(() => {
    const primeiro = overlay.querySelector(".mm-corpo input:not([type=hidden]):not([type=checkbox]):not([type=radio]), .mm-corpo textarea, .mm-corpo select");
    if (primeiro && document.body.contains(overlay)) primeiro.focus();
  }, 40);
  return { overlay, fechar };
}

// JANELA modal com FLUXO stateful (multi-passo): input → preview → aplicar.
// O `app.refresh()` da tela NÃO alcança a janela (ela vive em document.body, fora do
// root), então o fluxo guarda o próprio estado e re-renderiza só o corpo da janela.
//
// `render(corpo, { rerender, fechar })` é chamado a cada passo: preencha
// `corpo.innerHTML` e religue listeners de elementos (inputs/selects que leem estado
// ao vivo). Chame `rerender()` quando a ESTRUTURA mudar (mudou de passo, removeu item).
// NÃO chame `rerender()` a cada tecla digitada — você perde o foco; atualize o estado
// local no evento `input`/`change` e leia o DOM no momento da ação.
//
// `handlers({ rerender, fechar, corpo })` (opcional) devolve o mapa de [data-action];
// é ligado UMA vez por delegação no corpo (sobrevive aos rerenders, sem duplicar).
export function abrirJanelaFluxo({ titulo = "", telaCheia = false, render, handlers } = {}) {
  return abrirJanela({
    titulo,
    telaCheia,
    aoMontar: (overlay, fechar) => {
      const corpo = overlay.querySelector(".mm-corpo");
      const rerender = () => render(corpo, { rerender, fechar });
      if (handlers) bindActions(corpo, handlers({ rerender, fechar, corpo }));
      rerender();
    },
  });
}

// Modal para pedir um NÚMERO (ex.: quantas questões/flashcards a IA deve gerar).
// Atalhos rápidos (1 clique) + campo para um valor personalizado. Resolve com o número
// (entre min e max) ou null se cancelar/fechar fora.
//
// Opção `nivel`: quando true, mostra também um seletor de NÍVEL (Fácil/Médio/Difícil)
// e a Promise resolve com { n, dificuldade } em vez de só o número (ou null se cancelar).
// Default `nivel:false` mantém o comportamento antigo (resolve só o número) — chamadas
// existentes NÃO mudam. `nivelPadrao` define o nível pré-selecionado ("medio").
export function pedirNumero(
  msg,
  { min = 1, max = 50, padrao = 5, presets = [3, 5, 10], rotuloOk = "Gerar", nivel = false, nivelPadrao = "medio" } = {}
) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    const NIVEIS = [
      { v: "facil", rot: "Fácil" },
      { v: "medio", rot: "Médio" },
      { v: "dificil", rot: "Difícil" },
    ];
    const blocoNivel = nivel
      ? `<div class="num-linha">Nível
          <div class="nivel-chips" role="group" aria-label="Nível de dificuldade">
            ${NIVEIS.map((nv) => `<button type="button" class="chip${nv.v === nivelPadrao ? " on" : ""}" data-nivel="${nv.v}" aria-pressed="${nv.v === nivelPadrao}">${nv.rot}</button>`).join("")}
          </div>
        </div>`
      : "";
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-msg">${esc(msg)}</p>
        <div class="num-presets">${presets.map((p) => `<button class="btn btn-ghost btn-sm" data-preset="${p}">${p}</button>`).join("")}</div>
        <label class="num-linha">Quantidade <input class="num-input" type="number" min="${min}" max="${max}" value="${padrao}" /></label>
        ${blocoNivel}
        <div class="modal-acoes">
          <button class="btn btn-ghost" data-c="cancel">Cancelar</button>
          <button class="btn btn-primary" data-c="ok">${esc(rotuloOk)}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const input = ov.querySelector(".num-input");
    input.focus();
    input.select();
    let nivelSel = nivelPadrao;
    const clamp = (v) => Math.max(min, Math.min(max, v));
    const ler = () => {
      const v = parseInt(input.value, 10);
      return isNaN(v) ? null : clamp(v);
    };
    // Quando nivel=true devolve {n, dificuldade}; senão só o número (retrocompatível).
    const empacotar = (n) => (nivel ? { n, dificuldade: nivelSel } : n);
    const fechar = (val) => { ov.remove(); resolve(val); };
    ov.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-nivel]");
      if (chip) {
        nivelSel = chip.getAttribute("data-nivel");
        ov.querySelectorAll("[data-nivel]").forEach((c) => {
          const on = c === chip;
          c.classList.toggle("on", on);
          c.setAttribute("aria-pressed", on ? "true" : "false");
        });
        return;
      }
      const preset = e.target.closest("[data-preset]");
      if (preset) return fechar(empacotar(clamp(parseInt(preset.getAttribute("data-preset"), 10))));
      const b = e.target.closest("[data-c]");
      if (!b && e.target !== ov) return;
      if (b && b.getAttribute("data-c") === "ok") {
        const v = ler();
        if (v) fechar(empacotar(v));
      } else fechar(null);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const v = ler(); if (v) fechar(empacotar(v)); }
      else if (e.key === "Escape") fechar(null);
    });
  });
}

// Modal para pedir um TEXTO (ex.: nome de uma aula, renomear disciplina/tópico).
// Mesmo padrão visual de pedirNumero/confirmar. Resolve com a string digitada (sem
// espaços nas pontas) ou null se cancelar/fechar fora/digitar vazio. Foco automático
// no campo; Enter confirma (em input simples), Esc cancela. `multilinha` usa textarea.
export function pedirTexto(msg, { valor = "", placeholder = "", rotuloOk = "Salvar", multilinha = false } = {}) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    const campo = multilinha
      ? `<textarea class="num-input" rows="6" placeholder="${esc(placeholder)}" style="width:100%;box-sizing:border-box;resize:vertical;min-height:120px">${esc(valor)}</textarea>`
      : `<input class="num-input" type="text" value="${esc(valor)}" placeholder="${esc(placeholder)}" style="width:100%;box-sizing:border-box" />`;
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-msg">${esc(msg)}</p>
        <label class="num-linha" style="display:block;width:100%">${campo}</label>
        <div class="modal-acoes">
          <button class="btn btn-ghost" data-c="cancel">Cancelar</button>
          <button class="btn btn-primary" data-c="ok">${esc(rotuloOk)}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const input = ov.querySelector(".num-input");
    input.focus();
    if (input.select) input.select();
    const ler = () => {
      const v = (input.value || "").trim();
      return v || null;
    };
    const fechar = (val) => { ov.remove(); resolve(val); };
    ov.addEventListener("click", (e) => {
      const b = e.target.closest("[data-c]");
      if (!b && e.target !== ov) return;
      if (b && b.getAttribute("data-c") === "ok") fechar(ler());
      else fechar(null);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !multilinha) { e.preventDefault(); fechar(ler()); }
      else if (e.key === "Escape") fechar(null);
    });
  });
}

// Aviso de função que exige IA conectada. Mostrado quando o usuário clica num botão
// de geração (questões/flashcards/comentário/correção de mérito) sem IA configurada.
// Some quando uma IA for conectada (Configurações). Retorna sempre (não bloqueia).
export function avisoIA(app, oQue = "Esta função") {
  const ov = document.createElement("div");
  ov.className = "modal-overlay";
  ov.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <p class="modal-msg">${icone("bot")} <b>${esc(oQue)}</b> usa inteligência artificial.<br><br>
      A geração offline foi desativada por produzir resultados ruins. Conecte uma IA
      (ex.: <b>Google Gemini</b>, com chave grátis) em Configurações para liberar esta função.</p>
      <div class="modal-acoes">
        <button class="btn btn-ghost" data-c="cancel">Agora não</button>
        <button class="btn btn-primary" data-c="ir">Ir para Configurações</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => {
    const b = e.target.closest("[data-c]");
    if (!b && e.target !== ov) return;
    const ir = b && b.getAttribute("data-c") === "ir";
    ov.remove();
    if (ir && app && app.navigate) app.navigate("config");
  });
}

// Arrastar-e-soltar: liga uma zona (por padrão, o cartão que contém o input) para
// receber arquivos arrastados. Ao soltar, injeta os arquivos NO PRÓPRIO input file e
// dispara o evento 'change' — reaproveitando o handler já existente da tela, sem
// duplicar lógica. Mostra realce visual enquanto o arquivo está sobre a zona.
export function ligarDropZone(inputEl, opts = {}) {
  if (!inputEl) return;
  const zona = opts.zona || inputEl.closest(".card") || inputEl.parentElement;
  if (!zona || zona.__dropLigado) return;
  zona.__dropLigado = true;
  zona.classList.add("dropzone");
  const prevent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const realce = (on) => zona.classList.toggle("dropzone-ativa", on);
  let dentro = 0;
  zona.addEventListener("dragenter", (e) => {
    prevent(e);
    dentro++;
    realce(true);
  });
  zona.addEventListener("dragover", (e) => {
    prevent(e);
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  zona.addEventListener("dragleave", (e) => {
    prevent(e);
    if (--dentro <= 0) realce(false);
  });
  zona.addEventListener("drop", (e) => {
    prevent(e);
    dentro = 0;
    realce(false);
    const arquivos = e.dataTransfer && e.dataTransfer.files;
    if (!arquivos || !arquivos.length) return;
    const dt = new DataTransfer();
    for (const f of arquivos) {
      dt.items.add(f);
      if (!opts.multiplos) break; // os handlers atuais usam files[0]
    }
    inputEl.files = dt.files;
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// Exibe a explicação da IA com DOIS modos. Aceita string (legado/comentário manual) ou
// objeto { resumido, detalhado }: mostra o resumido e oferece o detalhado (item a item)
// em "ver explicação detalhada". O usuário lê o nível que quiser.
export function explicacaoIAHTML(c, selo = "amarelo") {
  if (!c) return "";
  if (typeof c === "string") return `<div class="ia-comentario">${seloBadge(selo)}<p>${esc(c)}</p></div>`;
  const resumido = (c.resumido || "").trim();
  const detalhado = (c.detalhado || "").trim();
  if (!resumido && !detalhado) return "";
  return `<div class="ia-comentario">${seloBadge(selo)}
    <p class="ia-coment-resumo">${esc(resumido || detalhado)}</p>
    ${detalhado && resumido ? `<details class="ia-coment-det"><summary>Ver explicação detalhada (item a item)</summary><div class="ia-coment-det-corpo">${esc(detalhado).replaceAll("\n", "<br>")}</div></details>` : ""}
  </div>`;
}

// --- Mapa mental: árvore recolhível (indentada) num overlay ---
function mmRamoHTML(ramo, nivel) {
  const filhos = Array.isArray(ramo.ramos) ? ramo.ramos : [];
  if (!filhos.length) return `<li class="mm-folha">${esc(ramo.titulo)}</li>`;
  return `<li><details ${nivel <= 1 ? "open" : ""}><summary>${esc(ramo.titulo)}</summary><ul>${filhos.map((f) => mmRamoHTML(f, nivel + 1)).join("")}</ul></details></li>`;
}
export function mapaMentalArvoreHTML(arv) {
  return `<ul class="mm-arvore"><li><details open><summary class="mm-raiz-tit">${esc((arv && arv.titulo) || "Mapa mental")}</summary><ul>${((arv && arv.ramos) || []).map((r) => mmRamoHTML(r, 1)).join("")}</ul></details></li></ul>`;
}
// Abre o mapa mental num overlay. Opções:
//  onRemover()        → habilita "Remover".
//  onSalvarObs(texto) → salva a observação/comentário do usuário.
//  acoes: [{label, fn}] → botões extras (ex.: gerar flashcards/questões a partir do mapa).
export function abrirMapaMental(mapa, { onRemover, onSalvarObs, onSalvarArvore, acoes, editar } = {}) {
  let arv = mapa.arvore || mapa;
  const lista = Array.isArray(acoes) ? acoes : [];
  // Fase 2 (híbrido): se o mapa foi importado de imagem/PDF, dá para ver o ORIGINAL visual.
  const temOriginal = !!((mapa.imgData || mapa.pdfData) && !mapa.binarioDescartado);
  const originalHTML = mapa.imgData
    ? `<img src="${mapa.imgData}" alt="Mapa original" style="max-width:100%;display:block;margin:0 auto"/>`
    : mapa.pdfData
    ? `<iframe src="${mapa.pdfData}" style="width:100%;height:70vh;border:0"></iframe>`
    : "";
  const overlay = document.createElement("div");
  overlay.className = "mm-overlay";
  overlay.innerHTML =
    `<div class="mm-modal" role="dialog" aria-modal="true">
      <div class="mm-head"><b class="mm-titulo">${esc(mapa.titulo || arv.titulo || "Mapa mental")}</b><span class="spacer"></span>
        <button class="lnk mm-v-mapa" data-tip="Ver como diagrama (mapa visual).">${icone("map")} Mapa</button>
        <button class="lnk mm-v-lista" data-tip="Ver como lista (árvore de texto).">${icone("file-text")} Lista</button>
        ${onSalvarArvore ? `<button class="lnk mm-edit-btn" data-tip="Editar a árvore: renomear, adicionar e remover ramos.">${icone("square-pen")} Editar</button>` : ""}
        ${temOriginal ? `<button class="lnk mm-v-orig" data-tip="Ver a imagem/PDF original importado.">${icone("image")} Original</button>` : ""}
        <button class="lnk mm-full" data-tip="Expandir para tela cheia.">${icone("maximize-2")} Tela cheia</button>
        <button class="lnk mm-print" data-tip="Imprimir ou salvar em PDF.">${icone("printer")} Imprimir</button>
        ${onRemover ? `<button class="lnk lnk-danger mm-del">${icone("x")} Remover</button>` : ""}
        ${botaoFechar("mm-close")}
      </div>
      <div class="mm-corpo">
        <div class="mm-visual"><svg class="mm-svg" style="width:100%;height:62vh;display:block"></svg></div>
        <div class="mm-arvore" hidden>${mapaMentalArvoreHTML(arv)}</div>
        ${temOriginal ? `<div class="mm-original" hidden>${originalHTML}</div>` : ""}
        ${lista.length ? `<div class="mm-acoes">${lista.map((a, i) => `<button class="btn btn-soft btn-sm mm-acao" data-i="${i}">${esc(a.label)}</button>`).join("")}</div>` : ""}
        ${onSalvarObs ? `<div class="mm-obs">
          <label class="muted small">${icone("notebook-pen")} Observação / comentário</label>
          <textarea class="mm-obs-txt" rows="2" placeholder="Suas anotações sobre este mapa…">${esc(mapa.observacao || "")}</textarea>
          <button class="lnk mm-obs-salvar">salvar observação</button>
        </div>` : ""}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const fechar = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape" && !work) fechar(); }; // Esc não fecha durante a edição
  overlay.addEventListener("click", (e) => { if (e.target === overlay && !work) fechar(); });
  overlay.querySelector(".mm-close").addEventListener("click", fechar);
  const arvEl = overlay.querySelector(".mm-arvore");
  const secVisual = overlay.querySelector(".mm-visual");
  const secOrig = overlay.querySelector(".mm-original");
  // Imprimir: o DIAGRAMA INTEIRO (não só a parte visível). Usa a bounding box do conteúdo
  // como viewBox e remove o zoom/pan, para o mapa todo caber e escalar na página.
  overlay.querySelector(".mm-print").addEventListener("click", () => {
    const svg = overlay.querySelector(".mm-svg");
    const g = svg && svg.querySelector("g");
    let html = null;
    if (mmRendered && g) {
      try {
        const bb = g.getBBox();
        if (bb && bb.width > 1 && bb.height > 1) {
          const pad = 24;
          const clone = svg.cloneNode(true);
          const gc = clone.querySelector("g");
          if (gc) gc.removeAttribute("transform"); // tira zoom/pan → imprime o mapa INTEIRO
          clone.removeAttribute("style");
          clone.removeAttribute("width");
          clone.removeAttribute("height");
          clone.setAttribute("viewBox", `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`);
          clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
          html = `<div class="mm-print-svg">${clone.outerHTML}</div>`;
        }
      } catch (_) {}
    }
    imprimir(`Mapa mental — ${mapa.titulo || arv.titulo || ""}`, html || mapaMentalArvoreHTML(arv));
  });

  // ---- Visões: diagrama (markmap, carregado sob demanda) · lista · original ----
  let mmRendered = false;
  let mmInstance = null;
  async function renderVisual() {
    const svg = overlay.querySelector(".mm-svg");
    if (!svg) return;
    try {
      const { Markmap } = await import("markmap-view");
      svg.innerHTML = "";
      const toNode = (n) => ({ content: esc(n.titulo || ""), children: (n.ramos || []).map(toNode) });
      const data = { content: esc(arv.titulo || "Mapa mental"), children: (arv.ramos || []).map(toNode) };
      mmInstance = Markmap.create(svg, undefined, data);
      mmRendered = true;
    } catch (e) {
      try { console.error(e); } catch (_) {}
      secVisual.innerHTML = `<div class="muted small" style="padding:14px">Não foi possível desenhar o diagrama agora. Use Lista.</div>`;
    }
  }
  const vista = (nome) => {
    secVisual.toggleAttribute("hidden", nome !== "visual");
    arvEl.toggleAttribute("hidden", nome !== "lista");
    if (secOrig) secOrig.toggleAttribute("hidden", nome !== "original");
    if (nome === "visual" && !mmRendered) renderVisual();
  };
  overlay.querySelector(".mm-v-mapa").addEventListener("click", () => { if (!work) vista("visual"); });
  overlay.querySelector(".mm-v-lista").addEventListener("click", () => { if (!work) vista("lista"); });
  const vOrig = overlay.querySelector(".mm-v-orig");
  if (vOrig) vOrig.addEventListener("click", () => { if (!work) vista("original"); });
  const fullBtn = overlay.querySelector(".mm-full");
  if (fullBtn) fullBtn.addEventListener("click", () => {
    const modal = overlay.querySelector(".mm-modal");
    const full = modal.classList.toggle("mm-modal--full");
    overlay.classList.toggle("mm-overlay--full", full);
    fullBtn.innerHTML = full ? `${icone("minimize-2")} Restaurar` : `${icone("maximize-2")} Tela cheia`;
    if (mmInstance) setTimeout(() => { try { mmInstance.fit(); } catch (_) {} }, 80); // re-ajusta o diagrama ao novo tamanho
  });

  // ---- Edição da árvore (Fase 3): renomear/adicionar/remover nós; salva via onSalvarArvore ----
  let work = null; // cópia de trabalho durante a edição (null = modo leitura)
  if (onSalvarArvore) {
    const clone = (o) => JSON.parse(JSON.stringify(o || { titulo: "", ramos: [] }));
    const nodeByPath = (a, path) => { let n = a; for (const i of path.split(".").map(Number)) n = n.ramos[i]; return n; };
    const parentInfo = (a, path) => { const idx = path.split(".").map(Number); const last = idx.pop(); let p = a; for (const i of idx) p = p.ramos[i]; return { parent: p, last }; };
    const treeEditHTML = (ramos, prefix) => {
      if (!ramos || !ramos.length) return "";
      return `<ul class="mm-edit-ul">${ramos.map((r, i) => {
        const path = prefix === "" ? String(i) : prefix + "." + i;
        return `<li><span class="mm-edit-row">
            <input class="mm-edit-titulo" data-path="${path}" value="${esc(r.titulo)}" />
            <button class="lnk mm-edit-add" data-path="${path}" data-tip="Adicionar sub-ramo">＋</button>
            <button class="lnk lnk-danger mm-edit-del" data-path="${path}" data-tip="Remover este ramo">${icone("x")}</button>
          </span>${treeEditHTML(r.ramos, path)}</li>`;
      }).join("")}</ul>`;
    };
    const renderEdit = () => {
      arvEl.innerHTML = `<div class="mm-edit">
        <label class="muted small">Tema central</label>
        <input class="mm-edit-root" value="${esc(work.titulo || "")}" placeholder="Tema central do mapa" />
        ${treeEditHTML(work.ramos, "")}
        <div class="barra-acoes" style="margin-top:8px">
          <button class="btn btn-soft btn-sm mm-edit-addraiz">＋ Ramo principal</button>
          <span class="spacer"></span>
          <button class="btn btn-sm mm-edit-cancelar">Cancelar</button>
          <button class="btn btn-primary btn-sm mm-edit-salvar">Salvar</button>
        </div>`;
    };
    const sairEdit = () => { work = null; arvEl.innerHTML = mapaMentalArvoreHTML(arv); };
    const editBtn = overlay.querySelector(".mm-edit-btn");
    if (editBtn) editBtn.addEventListener("click", () => { if (work) return; vista("lista"); work = clone(arv); renderEdit(); });
    arvEl.addEventListener("input", (e) => {
      if (!work) return;
      const t = e.target;
      if (t.classList.contains("mm-edit-root")) work.titulo = t.value;
      else if (t.classList.contains("mm-edit-titulo")) { const n = nodeByPath(work, t.getAttribute("data-path")); if (n) n.titulo = t.value; }
    });
    arvEl.addEventListener("click", (e) => {
      if (!work) return;
      const b = e.target.closest("button");
      if (!b) return;
      if (b.classList.contains("mm-edit-add")) { const n = nodeByPath(work, b.getAttribute("data-path")); n.ramos = n.ramos || []; n.ramos.push({ titulo: "Novo ramo", ramos: [] }); renderEdit(); }
      else if (b.classList.contains("mm-edit-del")) { const { parent, last } = parentInfo(work, b.getAttribute("data-path")); parent.ramos.splice(last, 1); renderEdit(); }
      else if (b.classList.contains("mm-edit-addraiz")) { work.ramos = work.ramos || []; work.ramos.push({ titulo: "Novo ramo", ramos: [] }); renderEdit(); }
      else if (b.classList.contains("mm-edit-cancelar")) { sairEdit(); }
      else if (b.classList.contains("mm-edit-salvar")) {
        const limpar = (rs) => (rs || []).map((r) => ({ titulo: (r.titulo || "").trim(), ramos: limpar(r.ramos) })).filter((r) => r.titulo);
        const nova = { titulo: (work.titulo || "").trim() || "Mapa mental", ramos: limpar(work.ramos) };
        onSalvarArvore(nova);
        arv = nova;
        overlay.querySelector(".mm-titulo").innerHTML = esc(nova.titulo);
        sairEdit();
        mmRendered = false; // árvore mudou → redesenha o diagrama
        vista("visual");
      }
    });
    if (editar) { vista("lista"); work = clone(arv); renderEdit(); }
  }

  if (!work) vista("visual"); // vista inicial = diagrama (markmap), exceto se abriu em edição

  const del = overlay.querySelector(".mm-del");
  if (del && onRemover) del.addEventListener("click", () => { onRemover(); fechar(); });
  overlay.querySelectorAll(".mm-acao").forEach((b) =>
    b.addEventListener("click", () => { const a = lista[+b.getAttribute("data-i")]; if (a && a.fn) a.fn(); })
  );
  const obsSalvar = overlay.querySelector(".mm-obs-salvar");
  if (obsSalvar && onSalvarObs) obsSalvar.addEventListener("click", () => {
    onSalvarObs(overlay.querySelector(".mm-obs-txt").value);
    obsSalvar.innerHTML = `${icone("check")} salvo`;
    setTimeout(() => { obsSalvar.textContent = "salvar observação"; }, 1500);
  });
  document.addEventListener("keydown", onKey);
  return overlay;
}

// fonte (opcional): { tipo, titulo } indicando DE QUAL material/conteúdo veio.
// `compacto`: mostra só o ícone do selo (a origem completa fica no tooltip). Usado em
// tabelas densas (ex.: "todos os flashcards") para a coluna Origem não estourar a largura.
export function seloBadge(tipo, fonte, { compacto = false } = {}) {
  const s = SELO[tipo] || SELO.amarelo;
  let texto;
  if (fonte && fonte.titulo) {
    const ref = fonte.titulo.length > 32 ? fonte.titulo.slice(0, 32) + "…" : fonte.titulo;
    if (tipo === "verde") texto = `Fonte: ${ref}`;
    else if (tipo === "amarelo") texto = `IA. Fonte: ${ref}`;
    else if (tipo === "oficial") texto = `Prova: ${ref}`;
    else texto = s.rotulo;
  } else {
    texto = s.rotulo;
  }
  const pag = fonte && Array.isArray(fonte.paginas) ? ` (p.${fonte.paginas[0]}–${fonte.paginas[1]})` : "";
  const tipFull = fonte && fonte.titulo ? `${s.rotulo} · ${fonte.titulo}${pag}` : s.rotulo;
  // O selo de IA (amarelo) recebe a borda-gradiente da marca (chip-ia): assinatura visual
  // coerente com o orb e o botão de IA.
  const ia = tipo === "amarelo" ? " chip-ia" : "";
  if (compacto) return `<span class="selo selo-${tipo}${ia} selo-compacto" data-tip="${esc(tipFull)}">${icone(s.icone)}</span>`;
  return `<span class="selo selo-${tipo}${ia}" data-tip="${esc(tipFull)}">${icone(s.icone)} ${esc(texto)}</span>`;
}

// Impressão: monta uma área limpa (#print-area) e dispara window.print().
// @media print mostra só essa área e esconde o app — funciona no navegador e no Tauri.
export function imprimir(titulo, htmlInterno) {
  let area = document.getElementById("print-area");
  if (!area) {
    area = document.createElement("div");
    area.id = "print-area";
    document.body.appendChild(area);
  }
  const quando = new Date().toLocaleString("pt-BR");
  area.innerHTML = `<h1>${esc(titulo)}</h1><div class="print-cabec">Mentor Concurso · impresso em ${esc(quando)}</div>${htmlInterno}`;
  window.print();
}

// Modal de OPÇÕES DE IMPRESSÃO (reusado pelos botões "Imprimir" de cabeçalho): cada grupo
// vira um conjunto de radios. `grupos` = [{ key, label, opcoes:[{v, rot}], def }].
// Resolve com um objeto { [key]: v } ao clicar Imprimir, ou null se cancelar/fechar.
export function opcoesImpressao(titulo, grupos) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    ov.innerHTML = `
      <div class="modal op-impressao" role="dialog" aria-modal="true">
        <p class="modal-msg">${esc(titulo)}</p>
        ${grupos
          .map(
            (g) => `<div class="op-grupo">
          <span class="op-grupo-lbl">${esc(g.label)}</span>
          <div class="op-opcoes">${g.opcoes
            .map((o) => `<label class="op-radio"><input type="radio" name="op-${esc(g.key)}" value="${esc(o.v)}" ${(g.def ?? g.opcoes[0].v) === o.v ? "checked" : ""} /> ${esc(o.rot)}</label>`)
            .join("")}</div>
        </div>`
          )
          .join("")}
        <div class="modal-acoes" style="justify-content:flex-end; margin-top:6px">
          <button class="btn btn-ghost btn-sm" data-x="cancel">Cancelar</button>
          <button class="btn btn-primary btn-sm" data-x="ok">${iconImprimir} Imprimir</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const fechar = (val) => { ov.remove(); resolve(val); };
    ov.addEventListener("click", (e) => {
      if (e.target === ov) return fechar(null);
      const x = e.target.closest("[data-x]");
      if (!x) return;
      if (x.getAttribute("data-x") === "cancel") return fechar(null);
      const res = {};
      grupos.forEach((g) => { res[g.key] = ov.querySelector(`input[name="op-${g.key}"]:checked`)?.value ?? (g.def ?? g.opcoes[0].v); });
      fechar(res);
    });
  });
}

export function botaoImprimir() {
  return `<button class="btn btn-ghost btn-sm no-print" data-action="imprimir" data-tip-pos="bottom" data-tip="Imprimir ou salvar em PDF (Ctrl+P).">${iconImprimir} Imprimir</button>`;
}

// Pluralização enxuta p/ contagens visíveis (evita o feio "1 dia(s)"). Ex.: plural(1,"dia","dias") → "1 dia".
export function plural(n, singular, pluralForma) {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

// Glossário de métricas (Etapa F.3): a IA orienta por números, então eles precisam ser claros.
// Texto canônico dos tooltips [?]. Use defMetrica("chave") ao lado do número/rótulo.
export const MET = {
  cobertura: "Cobertura — % dos tópicos do seu edital marcados como concluídos.",
  desempenho: "Desempenho — % de acertos nas questões que você resolveu nos últimos 30 dias.",
  aproveitamento: "Aproveitamento — % de acertos na amostra atual (deste tópico, disciplina ou sessão).",
  constancia: "Constância — a cor de cada dia mostra quanto tempo você estudou (mais escuro = mais). Folga não pune.",
  relevancia: "Relevância — o quanto o tema costuma cair, em faixa (com % ou 'Mais cai' quando o % é desconhecido).",
  vencimento: "Vencimento — quando este item volta para revisão pela curva do esquecimento.",
  streak: "Ofensiva — dias seguidos estudando (a folga configurada não quebra a sequência).",
};
// Marcador [?] discreto com o texto do glossário (tooltip via portal). pos: data-tip-pos opcional.
export function defMetrica(chave, pos = "cima") {
  if (!MET[chave]) return "";
  return `<span class="kpi-info" data-tip="${esc(MET[chave])}" data-tip-pos="${pos}" tabindex="0" role="button" aria-label="O que é isto?">?</span>`;
}

// Cabeçalho padrão de tela.
export function header(titulo, subtitulo = "", extra = "", opts = {}) {
  const clsH1 = opts.tituloClasse ? ` class="${opts.tituloClasse}"` : "";
  return `
    <div class="page-head">
      <div>
        <h1${clsH1}>${esc(titulo)}</h1>
        ${subtitulo ? `<p class="sub">${esc(subtitulo)}</p>` : ""}
      </div>
      <div class="page-head-extra">${extra}</div>
    </div>`;
}

// ===== Camada de IA contextual: faixa de insight () =====
// Faixa fina e dispensável que faz a inteligência do sistema "aparecer" dentro das telas
// (não só na página do Mentor IA). `texto` pode conter HTML seguro (caller faz esc do dinâmico).
// Auto-wiring global via ligarFaixasIA (chamado no roteador), sem handler por tela.
const faixasIADispensadas = new Set();
export function faixaIA({ texto, ctaLabel = "", rota = "", key = "" }) {
  if (key && faixasIADispensadas.has(key)) return "";
  return `<div class="faixa-ia"${key ? ` data-faixa-key="${esc(key)}"` : ""}>
    <span class="faixa-ia-selo"><span class="orb orb-xs" aria-hidden="true"></span></span>
    <span class="faixa-ia-txt">${texto}</span>
    ${ctaLabel && rota ? `<button class="faixa-ia-cta" data-faixa-rota="${esc(rota)}">${esc(ctaLabel)} →</button>` : ""}
    ${key ? `<button class="faixa-ia-x" data-faixa-fechar="${esc(key)}" title="Dispensar este aviso">${icone("x")}</button>` : ""}
  </div>`;
}
export function ligarFaixasIA(root, app) {
  root.querySelectorAll(".faixa-ia").forEach((f) => {
    const cta = f.querySelector("[data-faixa-rota]");
    if (cta) cta.addEventListener("click", () => app.navigate(cta.getAttribute("data-faixa-rota")));
    const x = f.querySelector("[data-faixa-fechar]");
    if (x) x.addEventListener("click", () => { faixasIADispensadas.add(x.getAttribute("data-faixa-fechar")); f.remove(); });
  });
}

// Botão de FECHAR canônico (redondo, ícone x centralizado). Use em modais/painéis.
export function botaoFechar(extra = "", label = "Fechar") {
  return `<button class="btn-fechar ${extra}" aria-label="${esc(label)}" data-fechar>${icone("x")}</button>`;
}

// Confete sutil (sem lib, spans CSS) para marcos: fila de flashcards concluída, meta batida.
// Respeita prefers-reduced-motion. x/y = origem (padrão: canto inferior direito).
export function confetti(x, y) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cont = document.createElement("div");
  cont.className = "cft-wrap";
  cont.style.left = (x == null ? window.innerWidth - 90 : x) + "px";
  cont.style.top = (y == null ? window.innerHeight - 150 : y) + "px";
  const cores = ["#2563eb", "#06b6d4", "#16a34a", "#f59e0b", "#e4374d", "#9333ea"];
  for (let i = 0; i < 20; i++) {
    const s = document.createElement("i");
    s.className = "cft";
    const ang = Math.random() * Math.PI - Math.PI; // sobe e espalha
    const dist = 60 + Math.random() * 90;
    s.style.setProperty("--dx", Math.cos(ang) * dist + "px");
    s.style.setProperty("--dy", (-40 - Math.random() * 90) + "px");
    s.style.setProperty("--rot", Math.random() * 720 - 360 + "deg");
    s.style.setProperty("--dur", 0.8 + Math.random() * 0.5 + "s");
    s.style.background = cores[i % cores.length];
    cont.appendChild(s);
  }
  document.body.appendChild(cont);
  setTimeout(() => cont.remove(), 1400);
}

// Esqueleto de documento "nascendo" (shimmer) — mostrado durante gerações de IA no lugar
// de um spinner. Passa a sensação premium de que o conteúdo está sendo redigido.
export function skeletonDoc(linhas = 5, { titulo = true } = {}) {
  const ws = [70, 95, 88, 62, 92, 80, 55, 90];
  const lns = Array.from({ length: linhas }, (_, i) => `<div class="skel skel-ln" style="width:${ws[i % ws.length]}%"></div>`).join("");
  return `<div class="skel-doc" role="status" aria-label="Gerando…">${titulo ? `<div class="skel skel-tit"></div>` : ""}${lns}</div>`;
}

// Ponto colorido (marcação/status) como CSS — substitui os emojis 🟡🔵🔴🟢🟣🟠 na UI.
const PONTO_COR = { amarelo: "#f4c000", azul: "#2563eb", vermelho: "#dc2626", verde: "#16a34a", roxo: "#9333ea", laranja: "#ea580c" };
export function pontoCor(cor) {
  return `<span class="pt-cor" style="--c:${PONTO_COR[cor] || cor}" aria-hidden="true"></span>`;
}

// Estado vazio premium. `msg` pode ser "Título" ou "Título\nSubtítulo" (1ª linha vira
// título forte; o resto, subtítulo). `cta` é HTML de um botão (opcional). `icone` é um
// emoji contextual (opcional). Compatível com as chamadas antigas vazio(msg, cta).
export function vazio(msg, cta = "", icone = "∅") {
  const linhas = String(msg || "").split("\n");
  const titulo = esc(linhas.shift() || "");
  const sub = esc(linhas.join(" ").trim());
  return `<div class="empty">
    <div class="empty-icon">${icone}</div>
    <p class="empty-titulo">${titulo}</p>
    ${sub ? `<p class="empty-sub">${sub}</p>` : ""}
    ${cta ? `<div class="empty-acao">${cta}</div>` : ""}
  </div>`;
}

// Deep-link: rola até o item marcado com [data-foco-id="ID"] dentro de root e o
// destaca brevemente. Usado pelo Dossiê (pasta viva): ao abrir uma tela apontando
// para um item específico, ele "pisca" para o usuário localizá-lo.
// Duplo rAF: o render() restaura a rolagem preservada no 1º frame; rolamos depois.
export function focarItem(root, id) {
  if (!id) return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const alvo = root.querySelector(`[data-foco-id="${CSS.escape(id)}"]`);
      if (!alvo) return;
      alvo.scrollIntoView({ behavior: "smooth", block: "center" });
      alvo.classList.add("item-foco");
      setTimeout(() => alvo.classList.remove("item-foco"), 2200);
    })
  );
}

// ===== FASE 0 — movimento =====
// Revela elementos [data-reveal] ao entrarem na viewport (uma vez). Chamado pelo
// roteador após cada render; as telas só precisam marcar o atributo.
export function ativarReveal(scope = document) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const alvos = scope.querySelectorAll("[data-reveal]:not(.reveal)");
  if (!alvos.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("reveal");
          io.unobserve(e.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px" }
  );
  alvos.forEach((el) => io.observe(el));
}

// Anima números de 0 até o valor final (elementos com data-count="N"). O texto final
// pode ter sufixo (ex.: "87%"): passe só o número em data-count e o sufixo em data-suf.
export function ativarCountUp(scope = document) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  scope.querySelectorAll("[data-count]:not([data-counted])").forEach((el) => {
    el.setAttribute("data-counted", "1");
    const fim = parseFloat(el.getAttribute("data-count"));
    if (!isFinite(fim)) return;
    const suf = el.getAttribute("data-suf") || "";
    const dur = 600;
    const t0 = performance.now();
    const passo = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(fim * (1 - Math.pow(1 - p, 3))) + suf;
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  });
}

// Revelação progressiva de texto (efeito "digitando" do Mentor). Aceita plain text;
// clique no elemento pula para o texto completo. Respeita prefers-reduced-motion.
export function revelarTexto(el, texto, { cps = 260, aoFim } = {}) {
  if (!el) return;
  const completo = String(texto || "");
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = completo;
    if (aoFim) aoFim();
    return;
  }
  el.classList.add("stream-cursor");
  let i = 0;
  let vivo = true;
  const terminar = () => {
    vivo = false;
    el.textContent = completo;
    el.classList.remove("stream-cursor");
    el.removeEventListener("click", terminar);
    if (aoFim) aoFim();
  };
  el.addEventListener("click", terminar);
  const passoMs = Math.max(8, Math.round(1000 / cps) * 3); // revela ~3 chars por tick
  const tick = () => {
    if (!vivo) return;
    i = Math.min(completo.length, i + 3);
    el.textContent = completo.slice(0, i);
    if (i < completo.length) setTimeout(tick, passoMs);
    else terminar();
  };
  tick();
}
