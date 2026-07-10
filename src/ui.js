// Helpers de UI (vanilla JS): seleção, eventos, toast, modal de confirmação, selos.
import { SELO } from "./ia.js";
import { esc , humanizarErroIA } from "./util.js";
import { icone } from "./icones.js";

// Ícone de impressora — Lucide único (Fase 0: fim do SVG desenhado à mão em paralelo).
export const iconImprimir = icone("printer", "ico-print");

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

// opts (opcional): { acaoLabel, onAcao, duracao } — mostra um botão de 1 toque no toast.
export function toast(msg, tipo = "ok", opts) {
  let cont = qs("#toasts");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "toasts";
    document.body.appendChild(cont);
  }
  const t = document.createElement("div");
  t.className = `toast toast-${tipo}`;
  const fechar = () => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); };
  if (opts && opts.acaoLabel && typeof opts.onAcao === "function") {
    const sp = document.createElement("span");
    sp.className = "toast-msg";
    sp.textContent = msg;
    const b = document.createElement("button");
    b.className = "toast-acao";
    b.textContent = opts.acaoLabel;
    b.addEventListener("click", () => { try { opts.onAcao(); } catch (_) {} fechar(); });
    t.appendChild(sp);
    t.appendChild(b);
  } else {
    t.textContent = msg;
  }
  cont.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(fechar, (opts && opts.duracao) || 2600);
}

// Toast PERSISTENTE de "carregando" (spinner) — NÃO some sozinho; fica até a ação terminar.
// Devolve uma função que o fecha. Dá ao usuário a certeza de que algo está sendo processado,
// independentemente de onde o botão está (útil quando o clique fecha um menu/modal).
export function toastCarregando(msg = "Processando…") {
  let cont = qs("#toasts");
  if (!cont) { cont = document.createElement("div"); cont.id = "toasts"; document.body.appendChild(cont); }
  const t = document.createElement("div");
  t.className = "toast toast-load";
  t.innerHTML = `<span class="mini-spin"></span><span class="toast-msg"></span>`;
  t.querySelector(".toast-msg").textContent = msg;
  cont.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  let feito = false;
  return (novaMsg) => {
    if (novaMsg) { const m = t.querySelector(".toast-msg"); if (m) m.textContent = novaMsg; return; } // atualiza o rótulo sem fechar
    if (feito) return; feito = true;
    t.classList.remove("show"); setTimeout(() => t.remove(), 300);
  };
}

// PADRÃO para toda AÇÃO ASSÍNCRONA (gerar, extrair, importar, chamar IA…): enquanto processa,
// mostra o toast "carregando" e deixa o botão ocupado (spinner + desabilitado); ao terminar,
// remove tudo. Em erro, mostra um toast de erro e devolve null (NÃO lança — o chamador não
// precisa de try/catch). Uso: `const r = await comOcupado(() => store.gerarX(...), { botao, msg })`.
export async function comOcupado(fn, { botao = null, msg = "Processando…", erro = "Não deu certo agora. Tente de novo em instantes." } = {}) {
  const fim = toastCarregando(msg);
  if (botao) { botao.classList.add("carregando"); botao.disabled = true; botao.setAttribute("aria-busy", "true"); }
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    // Fase 2: erro de IA vira frase humana com a acao que resolve; o texto custom de
    // rro (quando o chamador passou um) continua tendo prioridade.
    const padrao = "Não deu certo agora. Tente de novo em instantes.";
    toast(erro !== padrao ? erro : humanizarErroIA(e), "erro");
    return null;
  } finally {
    fim();
    if (botao) { botao.classList.remove("carregando"); botao.disabled = false; botao.removeAttribute("aria-busy"); }
  }
}

// Fase 0: fechamento ANIMADO de overlays (os modais entravam animados e saíam com corte
// seco). Adiciona .closing, espera a transição curta e remove. A Promise de quem chama
// resolve imediatamente — só o desmonte visual é adiado.
export function fecharAnimado(ov) {
  if (!ov || !document.body.contains(ov)) return;
  const reduz = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduz) { ov.remove(); return; }
  ov.classList.add("closing");
  setTimeout(() => ov.remove(), 160);
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
    const fim = (v) => { fecharAnimado(ov); document.removeEventListener("keydown", onKey); resolve(v); };
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
          ${opcoes.map((o) => `<button class="btn ${o.cls || "btn-ghost"} escolha-item" data-v="${esc(o.value)}">${o.ico ? icone(o.ico) : ""}<span class="escolha-item-txt">${esc(o.label)}${o.desc ? `<span class="escolha-item-desc">${esc(o.desc)}</span>` : ""}</span></button>`).join("")}
        </div>`
      : `<div class="modal-acoes u-wrap">
          ${opcoes.map((o) => `<button class="btn ${o.cls || "btn-ghost"}" data-v="${esc(o.value)}">${esc(o.label)}</button>`).join("")}
        </div>`;
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-msg">${esc(msg)}</p>
        ${corpo}
      </div>`;
    document.body.appendChild(ov);
    const fim = (v) => { fecharAnimado(ov); document.removeEventListener("keydown", onKey); resolve(v); };
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
export function abrirJanela({ titulo = "", corpoHTML = "", telaCheia = false, semTelaCheia = false, aoMontar } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "mm-overlay";
  overlay.innerHTML = `
    <div class="mm-modal" role="dialog" aria-modal="true">
      <div class="mm-head">
        <b class="mm-titulo">${esc(titulo)}</b>
        <span class="spacer"></span>
        ${semTelaCheia ? "" : `<button class="lnk mm-full" data-tip="Expandir para tela cheia.">${icone("maximize-2")} Tela cheia</button>`}
        ${botaoFechar("mm-close")}
      </div>
      <div class="mm-corpo">${corpoHTML}</div>
    </div>`;
  document.body.appendChild(overlay);
  const fechar = () => { fecharAnimado(overlay); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") fechar(); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
  overlay.querySelector(".mm-close").addEventListener("click", fechar);
  const fullBtn = overlay.querySelector(".mm-full");
  if (fullBtn) fullBtn.addEventListener("click", () => {
    const modal = overlay.querySelector(".mm-modal");
    const full = modal.classList.toggle("mm-modal--full");
    overlay.classList.toggle("mm-overlay--full", full);
    fullBtn.innerHTML = full ? `${icone("minimize-2")} Restaurar` : `${icone("maximize-2")} Tela cheia`;
  });
  document.addEventListener("keydown", onKey);
  if (telaCheia && fullBtn) fullBtn.click();
  if (aoMontar) aoMontar(overlay, fechar);
  // Autofocus no 1º campo (poupa um clique). Espera o render do fluxo, se houver.
  setTimeout(() => {
    const primeiro = overlay.querySelector(".mm-corpo input:not([type=hidden]):not([type=checkbox]):not([type=radio]), .mm-corpo textarea, .mm-corpo select");
    if (primeiro && document.body.contains(overlay)) primeiro.focus();
  }, 40);
  return { overlay, fechar };
}

// Arrastar-para-reordenar genérico. Torna cada item [data-drag-id] dentro de `container`
// arrastável; `onSoltar(dragId, alvoId)` é chamado ao soltar (insere o arrastado ANTES do alvo).
export function ligarArrastar(container, seletor, onSoltar) {
  if (!container) return;
  let dragId = null;
  container.querySelectorAll(seletor).forEach((el) => {
    el.setAttribute("draggable", "true");
    el.addEventListener("dragstart", (e) => {
      dragId = el.getAttribute("data-drag-id");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", dragId); } catch (_) {}
      el.classList.add("arrastando");
    });
    el.addEventListener("dragend", () => {
      dragId = null;
      el.classList.remove("arrastando");
      container.querySelectorAll(".drop-antes").forEach((z) => z.classList.remove("drop-antes"));
    });
    el.addEventListener("dragover", (e) => {
      const alvo = el.getAttribute("data-drag-id");
      if (!dragId || alvo === dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.classList.add("drop-antes");
    });
    el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove("drop-antes"); });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("drop-antes");
      const alvo = el.getAttribute("data-drag-id");
      const id = dragId || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
      if (id && alvo && id !== alvo) onSoltar(id, alvo);
      dragId = null;
    });
  });
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
    const fechar = (val) => { fecharAnimado(ov); resolve(val); };
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
    const fechar = (val) => { fecharAnimado(ov); resolve(val); };
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
    fecharAnimado(ov);
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
// Markdown leve → HTML limpo. Renderiza o que a IA costuma devolver para NUNCA vazar marcação
// crua ("###", "**", "- ", "1.", "`código`", "---") na cara do usuário. Escapa antes (seguro).
// Inline: **negrito**, *itálico*, `código`. Bloco: # títulos, listas - • * e 1./1), régua ---.
// É o renderizador ÚNICO de resposta de IA no app (chat, explicações, correção, recall, mentor…).
export function md(t) {
  const inline = (s) => s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+?)\*\*/g, "<b>$1</b>")
    .replace(/(?<![*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])/g, "<i>$1</i>");
  const linhas = esc(t || "").split(/\n/);
  let out = "", emUl = false, emOl = false;
  const fecha = () => { if (emUl) { out += "</ul>"; emUl = false; } if (emOl) { out += "</ol>"; emOl = false; } };
  for (const ln of linhas) {
    const h = ln.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*$/);
    if (h) { fecha(); out += `<div class="md-h md-h${h[1].length}">${inline(h[2])}</div>`; continue; }
    if (/^\s*(?:[-•*])\s+/.test(ln)) { if (!emUl) { fecha(); out += "<ul>"; emUl = true; } out += "<li>" + inline(ln.replace(/^\s*(?:[-•*])\s+/, "")) + "</li>"; continue; }
    const ol = ln.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (ol) { if (!emOl) { fecha(); out += "<ol>"; emOl = true; } out += "<li>" + inline(ol[2]) + "</li>"; continue; }
    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(ln)) { fecha(); out += "<hr>"; continue; }
    fecha();
    if (!ln.trim()) continue;
    out += inline(ln) + "<br>";
  }
  fecha();
  return out;
}

// objeto { resumido, detalhado }: mostra o resumido e oferece o detalhado (item a item)
// em "ver explicação detalhada". O usuário lê o nível que quiser. Passa por md() → sem markdown cru.
export function explicacaoIAHTML(c, selo = "amarelo") {
  if (!c) return "";
  if (typeof c === "string") return c.trim() ? `<div class="ia-comentario">${seloBadge(selo)}<div class="ia-coment-resumo">${md(c)}</div></div>` : "";
  const resumido = (c.resumido || "").trim();
  const detalhado = (c.detalhado || "").trim();
  if (!resumido && !detalhado) return "";
  return `<div class="ia-comentario">${seloBadge(selo)}
    <div class="ia-coment-resumo">${md(resumido || detalhado)}</div>
    ${detalhado && resumido ? `<details class="ia-coment-det"><summary>Ver explicação detalhada</summary><div class="ia-coment-det-corpo">${md(detalhado)}</div></details>` : ""}
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
        <div class="mm-tabs" role="tablist">
          <button class="mm-tab mm-v-mapa is-active" data-tip="Ver como diagrama (mapa visual).">${icone("map")} Mapa</button>
          <button class="mm-tab mm-v-lista" data-tip="Ver como lista (árvore de texto).">${icone("file-text")} Lista</button>
          ${onSalvarArvore ? `<button class="mm-tab mm-edit-btn" data-tip="Editar a árvore: renomear, adicionar e remover ramos.">${icone("square-pen")} Editar</button>` : ""}
          ${temOriginal ? `<button class="mm-tab mm-v-orig" data-tip="Ver a imagem/PDF original importado.">${icone("image")} Original</button>` : ""}
        </div>
        ${lista.length ? `<button class="lnk mm-acoes-btn" data-tip="Ações do mapa: gerar flashcards, questões, agendar revisão.">${icone("ellipsis")} Ações</button>` : ""}
        <button class="lnk mm-full" data-tip="Expandir para tela cheia.">${icone("maximize-2")} Tela cheia</button>
        <button class="lnk mm-print" data-tip="Imprimir ou salvar em PDF.">${icone("printer")} Imprimir</button>
        ${onRemover ? `<button class="lnk lnk-danger mm-del">${icone("x")} Remover</button>` : ""}
        ${botaoFechar("mm-close")}
      </div>
      <div class="mm-corpo">
        <div class="mm-visual"><svg class="mm-svg" style="width:100%;height:62vh;display:block"></svg>
          <div class="mm-ctrls">
            <button class="mm-ctrl mm-toggleall" data-tip="Recolher tudo">${icone("chevron-up")}</button>
            <span class="mm-ctrl-sep"></span>
            <button class="mm-ctrl mm-zoom-in" data-tip="Aumentar zoom">${icone("plus")}</button>
            <span class="mm-zoom-lbl">100%</span>
            <button class="mm-ctrl mm-zoom-out" data-tip="Diminuir zoom">${icone("minus")}</button>
            <span class="mm-ctrl-sep"></span>
            <button class="mm-ctrl mm-fit" data-tip="Ajustar à tela">${icone("expand")}</button>
            <button class="mm-ctrl mm-png" data-tip="Baixar (PNG ou PDF)">${icone("download")}</button>
          </div>
        </div>
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
  const fechar = () => { fecharAnimado(overlay); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape" && !work) fechar(); }; // Esc não fecha durante a edição
  overlay.addEventListener("click", (e) => { if (e.target === overlay && !work) fechar(); });
  overlay.querySelector(".mm-close").addEventListener("click", fechar);
  const arvEl = overlay.querySelector(".mm-arvore");
  const secVisual = overlay.querySelector(".mm-visual");
  const secOrig = overlay.querySelector(".mm-original");
  // Exportar/imprimir SEMPRE em tema claro (fundo branco, texto escuro): legível no papel e
  // econômico. O export estático é offscreen (não depende do zoom/pan da tela).
  const tituloMapa = () => `Mapa mental — ${mapa.titulo || arv.titulo || ""}`;
  async function svgExportMapa() {
    const { exportStaticSVG } = await import("./mm-tree.js");
    return exportStaticSVG(arv, { tema: "claro", collapsed: mmCollapsed });
  }
  // Impressão do mapa via IFRAME OCULTO contendo SÓ o título + o mapa. À prova de balas: não
  // depende de @media print nem do estado da tela; imprime exatamente esse documento isolado
  // (paisagem, 1 página). Imune a "window.print mudo" (usa o print do próprio iframe).
  async function imprimirMapa() {
    let ifr = null;
    try {
      const { svg, bw, bh } = await svgExportMapa();
      const ar = bw / Math.max(bh, 1);
      const availW = 275, availH = 175; // A4 paisagem útil (título é pequeno)
      let dw = availW, dh = availW / ar;
      if (dh > availH) { dh = availH; dw = availH * ar; }
      svg.setAttribute("width", dw.toFixed(1) + "mm");
      svg.setAttribute("height", dh.toFixed(1) + "mm");
      const t = esc(tituloMapa());
      const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${t}</title>` +
        `<style>@page{size:landscape;margin:8mm}html,body{margin:0;background:#fff}` +
        `body{font-family:system-ui,-apple-system,Arial,sans-serif;text-align:center;color:#0f172a}` +
        `h1{font-size:15px;font-weight:700;margin:0 0 1px}.sub{font-size:9.5px;color:#64748b;margin:0 0 6px}` +
        `svg{display:block;margin:0 auto;max-width:100%}</style></head>` +
        `<body><h1>${t}</h1><div class="sub">Mentor Concurso</div>${svg.outerHTML}</body></html>`;
      ifr = document.createElement("iframe");
      ifr.setAttribute("aria-hidden", "true");
      ifr.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;";
      document.body.appendChild(ifr);
      // document.write (same-origin) é imune a CSP/Trusted-Types de srcdoc.
      const idoc = ifr.contentDocument || ifr.contentWindow.document;
      idoc.open(); idoc.write(doc); idoc.close();
      const imprimirIframe = () => {
        try { ifr.contentWindow.focus(); ifr.contentWindow.print(); } catch (_) {}
        setTimeout(() => { try { ifr.remove(); } catch (_) {} }, 3000);
      };
      // conteúdo é inline (SVG), então já está pronto; pequeno atraso garante o layout
      setTimeout(imprimirIframe, 200);
    } catch (e) {
      try { console.error(e); } catch (_) {}
      if (ifr) { try { ifr.remove(); } catch (_) {} }
      toast("Não consegui preparar a impressão do mapa.", "erro");
    }
  }
  async function baixarMapaPNG() {
    const { svg, bw, bh } = await svgExportMapa();
    const scale = 2;
    svg.setAttribute("width", bw); svg.setAttribute("height", bh);
    const xml = new XMLSerializer().serializeToString(svg);
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const cv = document.createElement("canvas");
    cv.width = Math.round(bw * scale); cv.height = Math.round(bh * scale);
    const ctx = cv.getContext("2d"); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
    const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const nome = `mapa-mental-${(mapa.titulo || arv.titulo || "mapa").replace(/[^\w\-]+/g, "_").slice(0, 40)}.png`;
    await baixarArquivo(nome, bytes, "image/png"); // caixa de salvar nativa no desktop; download no navegador
  }
  async function baixarMapa() {
    const fmt = await escolher("Baixar o mapa como:", [
      { value: "png", label: "Imagem PNG", cls: "btn-primary" },
      { value: "pdf", label: "PDF (abre a impressão → Salvar como PDF)" },
    ]);
    if (!fmt) return;
    if (fmt === "pdf") return imprimirMapa();
    try { await baixarMapaPNG(); } catch (e) { try { console.error(e); } catch (_) {} toast("Não consegui gerar a imagem.", "erro"); }
  }
  overlay.querySelector(".mm-print").addEventListener("click", imprimirMapa);

  // ---- Visões: diagrama (tidy-tree próprio, carregado sob demanda) · lista · original ----
  let mmRendered = false;
  let mmInstance = null;
  const mmCollapsed = new Set(); // estado de recolhimento persistido entre re-renders
  let mmTodoExpandido = true;
  const zoomLbl = overlay.querySelector(".mm-zoom-lbl");
  const toggleBtn = overlay.querySelector(".mm-toggleall");
  async function renderVisual() {
    const svg = overlay.querySelector(".mm-svg");
    if (!svg) return;
    try {
      const { renderTidyTree } = await import("./mm-tree.js");
      const tema = document.documentElement.getAttribute("data-tema") === "escuro" ? "escuro" : "claro";
      if (mmInstance && mmInstance.destroy) mmInstance.destroy();
      mmInstance = renderTidyTree(svg, arv, {
        tema,
        collapsed: mmCollapsed,
        onZoom: (k) => { if (zoomLbl) zoomLbl.textContent = Math.round(k * 100) + "%"; },
        onToggleAll: (todoExp) => {
          mmTodoExpandido = todoExp;
          if (toggleBtn) {
            toggleBtn.innerHTML = todoExp ? icone("chevron-up") : icone("chevron-down");
            toggleBtn.setAttribute("data-tip", todoExp ? "Recolher tudo" : "Expandir tudo");
          }
        },
      });
      mmRendered = true;
    } catch (e) {
      try { console.error(e); } catch (_) {}
      secVisual.innerHTML = `<div class="muted small" style="padding:14px">Não foi possível desenhar o diagrama agora. Use Lista.</div>`;
    }
  }
  // Controles do diagrama (zoom/ajustar/expandir-recolher/PNG)
  overlay.querySelector(".mm-zoom-in")?.addEventListener("click", () => mmInstance?.zoomIn());
  overlay.querySelector(".mm-zoom-out")?.addEventListener("click", () => mmInstance?.zoomOut());
  overlay.querySelector(".mm-fit")?.addEventListener("click", () => mmInstance?.fit());
  if (toggleBtn) toggleBtn.addEventListener("click", () => { if (mmTodoExpandido) mmInstance?.collapseAll(); else mmInstance?.expandAll(); });
  overlay.querySelector(".mm-png")?.addEventListener("click", baixarMapa); // menu PNG/PDF
  // marca a aba ativa (segmented control) conforme a visão atual
  const abaPorVista = { visual: ".mm-v-mapa", lista: ".mm-v-lista", original: ".mm-v-orig" };
  const setAba = (sel) => overlay.querySelectorAll(".mm-tab").forEach((b) => b.classList.toggle("is-active", sel != null && b.matches(sel)));
  const vista = (nome) => {
    secVisual.toggleAttribute("hidden", nome !== "visual");
    arvEl.toggleAttribute("hidden", nome !== "lista");
    if (secOrig) secOrig.toggleAttribute("hidden", nome !== "original");
    if (nome === "visual" && !mmRendered) renderVisual();
    if (!work) setAba(abaPorVista[nome]); // em edição, a aba ativa é "Editar" (tratada à parte)
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
            <button class="lnk mm-edit-add" data-path="${path}" data-tip="Adicionar sub-ramo">${icone("plus")}</button>
            <button class="lnk lnk-danger mm-edit-del" data-path="${path}" data-tip="Remover este ramo">${icone("x")}</button>
          </span>${treeEditHTML(r.ramos, path)}</li>`;
      }).join("")}</ul>`;
    };
    const renderEdit = () => {
      arvEl.innerHTML = `<div class="mm-edit">
        <label class="muted small">Tema central</label>
        <input class="mm-edit-root" value="${esc(work.titulo || "")}" placeholder="Tema central do mapa" />
        ${treeEditHTML(work.ramos, "")}
        <div class="barra-acoes u-mt-8">
          <button class="btn btn-soft btn-sm mm-edit-addraiz">${icone("plus")} Ramo principal</button>
          <span class="spacer"></span>
          <button class="btn btn-sm mm-edit-cancelar">Cancelar</button>
          <button class="btn btn-primary btn-sm mm-edit-salvar">Salvar</button>
        </div>`;
    };
    const sairEdit = () => { work = null; arvEl.innerHTML = mapaMentalArvoreHTML(arv); setAba(".mm-v-lista"); };
    const editBtn = overlay.querySelector(".mm-edit-btn");
    if (editBtn) editBtn.addEventListener("click", () => { if (work) return; vista("lista"); work = clone(arv); renderEdit(); setAba(".mm-edit-btn"); });
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
    if (editar) { vista("lista"); work = clone(arv); renderEdit(); setAba(".mm-edit-btn"); }
  }

  if (!work) vista("visual"); // vista inicial = diagrama (markmap), exceto se abriu em edição

  const del = overlay.querySelector(".mm-del");
  if (del && onRemover) del.addEventListener("click", () => { onRemover(); fechar(); });
  overlay.querySelectorAll(".mm-acao").forEach((b) =>
    b.addEventListener("click", () => { const a = lista[+b.getAttribute("data-i")]; if (a && a.fn) a.fn(); })
  );
  // Botão "Ações" (só na tela cheia, onde a barra inferior fica escondida): abre um menu com
  // as mesmas ações (gerar flashcards/questões, agendar revisão).
  overlay.querySelector(".mm-acoes-btn")?.addEventListener("click", async () => {
    const i = await escolher("Ações do mapa", lista.map((a, idx) => ({ value: String(idx), label: a.label })), { lista: true });
    if (i == null) return;
    const a = lista[+i];
    if (a && a.fn) a.fn();
  });
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

// Salva um arquivo (bytes) escolhendo o caminho. No app DESKTOP (Tauri) usa a CAIXA DE SALVAR
// NATIVA (comando Rust save_bytes) — o <a download> nem sempre abre diálogo no webview. No
// navegador (ou se o nativo falhar), cai no <a download> com Blob URL. Retorna false se o
// usuário cancelar o diálogo nativo.
export async function baixarArquivo(nome, bytes, mime) {
  const ehTauri = typeof window !== "undefined" && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);
  if (ehTauri) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      let bin = "";
      const CH = 0x8000; // fatia p/ não estourar o argumento do fromCharCode
      for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      const salvo = await invoke("save_bytes", { name: nome, data: btoa(bin) });
      return salvo !== null; // null = cancelou
    } catch (e) { try { console.warn("[baixar] save nativo indisponível; usando download do navegador", e); } catch (_) {} }
  }
  const blob = new Blob([bytes], { type: mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

// Impressão: monta uma área limpa (#print-area) e dispara window.print().
// @media print mostra só essa área e esconde o app — funciona no navegador e no Tauri.
// opts.cls: classe extra no #print-area (ex.: "pa-mapa" p/ encaixar o diagrama em 1 página).
// opts.landscape: força orientação paisagem (mapas largos cabem inteiros).
export function imprimir(titulo, htmlInterno, opts = {}) {
  let area = document.getElementById("print-area");
  if (!area) {
    area = document.createElement("div");
    area.id = "print-area";
    document.body.appendChild(area);
  }
  area.className = opts.cls || ""; // reseta a cada impressão (não vaza entre mapa e listas)
  const quando = new Date().toLocaleString("pt-BR");
  area.innerHTML = `<h1>${esc(titulo)}</h1><div class="print-cabec">Mentor Concurso · impresso em ${esc(quando)}</div>${htmlInterno}`;
  // Remove qualquer @page pendente de uma impressão anterior (senão a orientação paisagem do
  // mapa poderia "vazar" para uma impressão de lista disparada logo em seguida).
  document.getElementById("mm-print-page")?.remove();
  let pageStyle = null;
  if (opts.landscape) {
    pageStyle = document.createElement("style");
    pageStyle.id = "mm-print-page";
    pageStyle.textContent = "@page { size: landscape; margin: 10mm; }";
    document.head.appendChild(pageStyle);
  }
  const limpar = () => { if (pageStyle) { pageStyle.remove(); pageStyle = null; } window.removeEventListener("afterprint", limpar); };
  window.addEventListener("afterprint", limpar);
  window.print();
  setTimeout(limpar, 1500); // fallback caso afterprint não dispare
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
    const fechar = (val) => { fecharAnimado(ov); resolve(val); };
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
// título forte; o resto, subtítulo). `cta` é HTML de um botão (opcional). `ico` é o HTML
// de um ícone Lucide contextual (opcional; padrão = inbox). Compatível com vazio(msg, cta).
export function vazio(msg, cta = "", ico = "") {
  const linhas = String(msg || "").split("\n");
  const titulo = esc(linhas.shift() || "");
  const sub = esc(linhas.join(" ").trim());
  return `<div class="empty">
    <div class="empty-icon">${ico || icone("inbox")}</div>
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
