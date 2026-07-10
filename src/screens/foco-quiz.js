// ===================== MODO FOCO — shell compartilhado =====================
// Chrome do quiz imersivo em tela cheia, reutilizado por Flashcards, Questões (MC),
// Certo/Errado e Simulado. Cada tela injeta apenas o MIOLO (`centro`) e a legenda
// (`rodape`); o shell cuida do overlay (aurora), da barra superior (navegação ← →,
// placar da sessão, cronômetro no chip com menu Progressivo/Regressivo/livre) e do
// palco animado. As telas consumidoras precisam ligar os handlers de navegação
// (`foco-anterior`/`foco-proximo`/`sair-foco`) e chamar `bindFocoCrono(map)`.
import { icone } from "../icones.js";
import { fmtMMSS } from "../util.js";
import * as crono from "../cronometro.js";

// ---- Cronômetro no chip (sem re-render: atualiza só o próprio chip) ----

// Atualiza o chip do cronômetro no lugar: destaque .on + tempo (displaySeg já respeita
// o modo — progressivo conta p/ cima, regressivo mostra o restante).
export function atualizarChipCrono(chip) {
  if (!chip) return;
  const snap = crono.snapshot();
  const ativo = snap.running || snap.elapsed > 0; // rodando ou pausado com tempo (≠ ocioso)
  chip.classList.toggle("on", snap.running);
  const t = chip.querySelector(".fq-crono-t");
  if (t) t.textContent = ativo ? fmtMMSS(crono.displaySeg()) : "Cronômetro";
}

// Inicia o cronômetro regressivo com `min` minutos e fecha o menu.
function iniciarRegressivo(min, btn) {
  crono.setModo("regressivo");
  crono.setTarget(min * 60);
  crono.iniciar();
  fecharMenuCrono(btn);
}

// Fecha o menu de modo do cronômetro e sincroniza o chip.
function fecharMenuCrono(btn) {
  const wrap = btn.closest(".fq-crono-wrap");
  const menu = wrap?.querySelector(".fq-crono-menu");
  if (menu) menu.hidden = true;
  atualizarChipCrono(wrap?.querySelector(".fq-crono"));
}

// Adiciona ao mapa de bindActions os handlers do cronômetro do foco. Retorna o mapa.
export function bindFocoCrono(map) {
  map["toggle-foco-crono"] = (el) => {
    // SEM re-renderizar a tela (senão o card refaz a animação e "parece que recarregou").
    // Ocioso (nada rodando, 00:00): abre o menu para escolher Progressivo × Regressivo.
    // Rodando: pausa. Pausado (tem tempo): retoma. Só atualiza o próprio chip, no lugar.
    const snap = crono.snapshot();
    if (snap.running) {
      crono.pausar();
      atualizarChipCrono(el);
      return;
    }
    if (snap.elapsed > 0) {
      crono.iniciar(); // pausado com tempo acumulado → retoma no mesmo modo
      atualizarChipCrono(el);
      return;
    }
    const menu = el.parentElement?.querySelector(".fq-crono-menu");
    if (menu) menu.hidden = !menu.hidden;
  };
  map["crono-prog"] = (el) => {
    crono.setModo("progressivo");
    crono.zerar();
    crono.iniciar();
    fecharMenuCrono(el);
  };
  map["crono-reg"] = (el) => iniciarRegressivo(Number(el.dataset.min) || 25, el);
  map["crono-reg-livre"] = (el) => {
    const inp = el.closest(".fq-cm-reg")?.querySelector(".fq-cm-input");
    const min = Math.round(Number(inp?.value));
    if (!min || min < 1) {
      inp?.focus();
      return; // sem valor válido: não inicia, deixa o menu aberto para digitar
    }
    iniciarRegressivo(Math.min(min, 600), el);
  };
  return map;
}

// Assina o tique do cronômetro para manter o chip vivo (por segundo) sem re-render.
// Retorna a função de cancelamento (para o cleanup do render).
export function ligarTickCrono(root) {
  return crono.onTick(() => {
    const t = root.querySelector(".fq-crono-t");
    if (t && crono.snapshot().running) t.textContent = fmtMMSS(crono.displaySeg());
  });
}

// ---- Teclado: parte "chrome" (comum a todas as telas de foco) ----
// Trata: Enter no campo livre do cronômetro, guarda de input/modal, Esc (sair) e ← →
// (navegar). Retorna "stop" se consumiu o evento (o chamador deve dar return), "input"
// se o foco está num campo (o chamador deve dar return sem tratar atalhos), ou null.
export function focoChromeKey(e, { root, bloquearNav = false } = {}) {
  const a = e.target;
  if (a && a.classList?.contains("fq-cm-input") && e.key === "Enter") {
    e.preventDefault();
    a.closest(".fq-cm-reg")?.querySelector('[data-action="crono-reg-livre"]')?.click();
    return "stop";
  }
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return "input";
  if (e.metaKey || e.ctrlKey || e.altKey) return "input"; // deixa atalhos do sistema passarem
  if (document.querySelector(".mm-overlay, .modal-overlay")) return "input";
  if (e.key === "Escape") {
    e.preventDefault();
    root.querySelector('[data-action="sair-foco"]')?.click();
    return "stop";
  }
  if (!bloquearNav && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    root.querySelector(`[data-action="${e.key === "ArrowLeft" ? "foco-anterior" : "foco-proximo"}"]:not([disabled])`)?.click();
    return "stop";
  }
  return null;
}

// ---- Markup do shell ----

// Chip do cronômetro + menu de modo (Progressivo × Regressivo com presets 10/25 + livre).
function cronoChipHTML() {
  const snap = crono.snapshot();
  const cronoOn = snap.running;
  const cronoAtivo = cronoOn || snap.elapsed > 0;
  return `
    <div class="fq-crono-wrap">
      <button class="fq-chip fq-crono ${cronoOn ? "on" : ""}" data-action="toggle-foco-crono" data-tip="${cronoOn ? "Pausar" : "Cronometrar esta sessão (fica aqui, sem sair da tela)"}">${icone("clock-3")} <span class="fq-crono-t">${cronoAtivo ? fmtMMSS(crono.displaySeg()) : "Cronômetro"}</span></button>
      <div class="fq-crono-menu" hidden>
        <button class="fq-cm-item" data-action="crono-prog">${icone("play")} Progressivo <span class="muted">(crescente)</span></button>
        <div class="fq-cm-reg">
          <span class="muted small">Regressivo:</span>
          <button class="fq-cm-min" data-action="crono-reg" data-min="10">10</button>
          <button class="fq-cm-min" data-action="crono-reg" data-min="25">25</button>
          <input class="fq-cm-input" type="number" min="1" max="600" inputmode="numeric" placeholder="livre" aria-label="Minutos personalizados" />
          <button class="fq-cm-go" data-action="crono-reg-livre" data-tip="Iniciar com esse tempo">${icone("play")}</button>
          <span class="muted small">min</span>
        </div>
      </div>
    </div>`;
}

// Chip de SEQUÊNCIA (acertos seguidos na sessão): aparece com 3+, some ao errar.
// Exportado para as telas atualizarem o chip NO LUGAR (sem re-render do overlay).
export function streakChipHTML(seq) {
  if (!seq || seq < 3) return "";
  return `<span class="fq-chip fq-seq" data-tip="Acertos seguidos nesta sessão (zera ao errar)">${icone("flame")} <span class="fq-seq-n">${seq} seguidas</span></span>`;
}

// Placar da sessão (✓ acertos · ✗ erros · precisão). Aceita objeto {acertos, erros, seq?}
// ou null (esconde — ex.: simulado, para não entregar o gabarito). `seq` (opcional) é a
// sequência atual de acertos: com 3+ ganha um chip de streak ao lado do placar.
function placarHTML(placar) {
  if (!placar) return "";
  const { acertos = 0, erros = 0, seq = 0 } = placar;
  const feitos = acertos + erros;
  const pct = feitos ? Math.round((acertos / feitos) * 100) : 0;
  return `${streakChipHTML(seq)}
    <div class="fq-placar" data-tip="Placar da sessão (acertos / erros / precisão)">
      <span class="fq-plc-ok">${icone("check")} ${acertos}</span>
      <span class="fq-plc-err">${icone("x")} ${erros}</span>
      <span class="fq-plc-pct">${feitos ? pct + "%" : "—"}</span>
    </div>`;
}

/**
 * Monta o overlay do Modo Foco. O consumidor injeta o miolo e a legenda.
 * @param {object} o
 * @param {number} o.idx     posição atual (0-based)
 * @param {number} o.total   total de itens da sessão
 * @param {boolean} [o.fim]  true na tela de conclusão (esconde as setas)
 * @param {boolean} [o.mostrarNav=true] mostra as setas ← →
 * @param {object|null} [o.placar] {acertos, erros} ou null p/ esconder
 * @param {string} [o.placarExtra] HTML extra ao lado do placar (ex.: contador do simulado)
 * @param {string} o.centro   HTML do miolo (card/questão/conclusão)
 * @param {string} o.rodape   HTML da legenda de teclas
 * @param {string} [o.aria]   rótulo acessível do dialog
 * @param {string} [o.anim]   "in" (entrada plena, padrão) | "fade" (só opacidade, sem
 *                            movimento — para trocas em-lugar) | "none"
 * @param {boolean} [o.crono=true] mostra o chip do cronômetro de estudo (o Simulado usa
 *                            o seu próprio timer de prova, então passa false)
 * @param {string} [o.acoesExtra] HTML extra na barra de ações, antes do botão Sair
 */
export function focoShellHTML({ idx, total, fim = false, mostrarNav = true, placar = null, placarExtra = "", centro, rodape, aria = "Modo foco", anim = "in", crono = true, acoesExtra = "" }) {
  const pctProg = total ? Math.round((Math.min(idx, total) / total) * 100) : 100;
  const posicao = Math.min(idx + (fim ? 0 : 1), total);
  const nav = mostrarNav && !fim;
  const stageCls = anim === "fade" ? " fq-fade" : anim === "none" ? " fq-no-anim" : "";
  return `
    <div class="fc-foco" role="dialog" aria-modal="true" aria-label="${aria}">
      <div class="fq-aurora" aria-hidden="true"><span></span><span></span><span></span></div>
      <header class="fq-top">
        <div class="fq-topnav">
          ${nav ? `<button class="fq-nav" data-action="foco-anterior" data-tip="Anterior (←)" ${idx <= 0 ? "disabled" : ""}>${icone("arrow-left")}</button>` : ""}
          <div class="fq-prog" data-tip="Progresso da sessão">
            <div class="fq-prog-bar"><span style="width:${pctProg}%"></span></div>
            <span class="fq-prog-txt"><b>${posicao}</b><i>/</i>${total}</span>
          </div>
          ${nav ? `<button class="fq-nav" data-action="foco-proximo" data-tip="Próximo (→)">${icone("arrow-right")}</button>` : ""}
        </div>
        <div class="fq-top-acoes">
          ${placarExtra}${placarHTML(placar)}${acoesExtra}
          <button class="fq-chip fq-sair" data-action="sair-foco" data-tip="Sair (Esc)">${icone("x")}</button>
        </div>
      </header>
      <div class="fq-palco"><div class="fq-stage${stageCls}">${centro}</div></div>
      <footer class="fq-rodape">${rodape}</footer>
    </div>`;
}
