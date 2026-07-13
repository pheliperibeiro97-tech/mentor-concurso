// Lei Seca / Jurisprudência — overlays de tela cheia: LEITURA EM FOCO (F3) e
// COMPLETAR O ARTIGO (#10, cloze em 4 níveis). Reusam a casca do foco-quiz.
// (Extraído mecanicamente de leiseca.js — comportamento idêntico.)
import { bindActions, toast } from "../../ui.js";
import { esc } from "../../util.js";
import { icone } from "../../icones.js";
import { focoShellHTML, bindFocoCrono, focoChromeKey, ligarTickCrono, atualizarChipCrono } from "../foco-quiz.js";
import { S } from "./estado.js";
import { garantirGrifoFlutuante, perguntarIASobreTrecho } from "./grifo.js";
import { normaDeRef, corpoArtigoLimpo, renderLeiComMarcas, configLeituraRowsHTML } from "./leitor.js";

// F3 — MODO FOCO de leitura: overlay tela cheia (reusa o shell do foco-quiz). Um artigo por vez,
// navegação ←→, barra inferior de ações e cronômetro. Esc/setas via focoChromeKey. Seleção de
// texto continua abrindo o menu flutuante (Copiar/Perguntar à IA).
export function abrirLeituraFoco(app, store, ids, startIdx, opts = {}) {
  if (!ids.length) return;
  let idx = Math.max(0, Math.min(startIdx || 0, ids.length - 1));
  let modoLeitura = opts.modo || "normal"; // "normal" | "marcas" | "recordar" (revisão de grifos)
  const mostrarModos = !!opts.mostrarModos;
  const revelados = new Set();
  const cur = () => store.get().indicacoes.find((i) => i.id === ids[idx]);
  const host = document.createElement("div");
  host.className = "leitura-foco-host";
  document.body.appendChild(host);
  const normaFoco = normaDeRef((store.get().indicacoes.find((i) => i.id === ids[idx]) || {}).referencia);
  S._leitorCtx = { store, app, norma: normaFoco, onMarca: () => atualizar("none") }; // grifo em tempo real: re-renderiza o artigo do Foco
  garantirGrifoFlutuante();
  let offTick = null;
  const cleanup = () => { try { if (offTick) offTick(); } catch {} document.removeEventListener("keydown", onKey); host.remove(); app.refresh(); };

  const artHTML = (ind) => {
    const refCurta = String(ind.referencia || "").split(",")[0].trim();
    const trilha = (ind.estrutura || []).map((n) => n.rotulo + (n.titulo ? " · " + n.titulo : "")).join("  ›  ");
    // Fase 5 (grifo único): sem painel-pincel no Foco — grifar/comentar é pelo gesto de seleção.
    const corpo = `<div class="ler-art-corpo lf-corpo mk-modo-${modoLeitura}" data-art-corpo="${ind.id}">${renderLeiComMarcas(ind.texto, store.marcasAncoradas("indicacao", ind.id, ind.texto), { modo: modoLeitura, revelados })}</div>`;
    return `<div class="lf-artigo ${ind.lido ? "lida" : ""}">
      ${trilha ? `<div class="lf-trilha">${esc(trilha)}</div>` : ""}
      <div class="lf-ref">${esc(refCurta)}${ind.nomeJuridico ? `<span class="lf-nome">${esc(ind.nomeJuridico)}</span>` : ""}</div>
      ${corpo}
    </div>`;
  };
  const rodapeHTML = (ind) => `<div class="lf-barra">
    <div class="lf-acoes">
      <button class="lfoco-btn ${ind.lido ? "on-ok" : ""}" data-action="lf-lido" data-tip-pos="cima" data-tip="Marcar como lido e avançar para o próximo">${icone("check")}</button>
      <span class="lf-sep"></span>
      <button class="lfoco-btn ${ind.favorito ? "on-fav" : ""}" data-action="lf-fav" data-tip-pos="cima" data-tip="${ind.favorito ? "Favorito — tirar" : "Favoritar"}">${icone("bookmark")}</button>
      <button class="lfoco-btn ${ind.dificil ? "on-dif" : ""}" data-action="lf-dif" data-tip-pos="cima" data-tip="${ind.dificil ? "Difícil — tirar" : "Marcar difícil"}">${icone("flame")}</button>
      <button class="lfoco-btn ${ind.pq ? "on-pq" : ""}" data-action="lf-pq" data-tip-pos="cima" data-tip="O que mais cai">${icone("star")}</button>
      <span class="lf-sep"></span>
      ${mostrarModos ? "" : `<button class="lfoco-btn" data-action="lf-anotar" data-tip-pos="cima" data-tip="Anotar o trecho selecionado">${icone("notebook-pen")}</button>`}
      <button class="lfoco-btn lfoco-ia" data-action="lf-ia" data-tip-pos="cima" data-tip="Perguntar à IA sobre o artigo">${icone("sparkles")}</button>
      <span class="lf-sep"></span>
      <details class="ler-config lf-cfg"><summary class="lfoco-btn" data-tip-pos="cima" data-tip="Aparência da leitura (fonte, tamanho, tema)"><span class="lcfg-aa">Aa</span></summary><div class="lcfg-pop lf-cfg-pop">${configLeituraRowsHTML(store.get().config.leitura, store.get().config.tema)}</div></details>
    </div>
    ${mostrarModos ? `<div class="lf-modos">
      ${["normal|Texto", "marcas|Só as marcas", "recordar|Recordar"].map((x) => { const [id, lbl] = x.split("|"); return `<button class="lf-modo ${modoLeitura === id ? "on" : ""}" data-action="lf-modo" data-modo="${id}">${lbl}</button>`; }).join("")}
    </div>` : ""}
    <div class="lf-legenda">${icone("arrow-left")}${icone("arrow-right")} navegar · <b>Enter</b> marcar lido e avançar · <b>Esc</b> sair · ${mostrarModos ? "no Recordar, clique nas lacunas para revelar" : "selecione o texto para grifar / copiar / IA"}</div>
  </div>`;

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
    // EXIBIR e a SETA apenas navegam — NÃO marcam lido (abrir o Foco e passar não deve inflar
    // o progresso). Marcar lido é só pelo botão "Marcar lido", que marca e avança.
    if (normaFoco) store.setUltimaLeitura(normaFoco, { indicacaoId: ind.id, pct: Math.round((100 * (idx + 1)) / ids.length) }); // continuar leitura
  };

  // A SETA (→) e a tecla apenas NAVEGAM — não marcam lido.
  const navProximo = () => { if (idx < ids.length - 1) { idx++; atualizar("fade"); } };
  // O botão "Marcar lido" marca o artigo atual como lido e avança para o próximo.
  const marcarLidoEProximo = () => {
    const ind = cur();
    if (ind && !ind.lido) store.toggleIndicacaoLida(ind.id);
    if (idx < ids.length - 1) { idx++; atualizar("fade"); } else atualizar("none");
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
    "foco-anterior": () => { if (idx > 0) { idx--; atualizar("fade"); } },
    "foco-proximo": navProximo,
    "sair-foco": () => cleanup(),
    // "Marcar lido" no Foco: marca o atual como lido e avança (a seta sozinha NÃO marca).
    "lf-lido": marcarLidoEProximo,
    "lf-fav": () => { const i = cur(); if (i) { store.toggleFavorito(i.id); atualizar("none"); } },
    "lf-dif": () => { const i = cur(); if (i) { store.toggleDificil(i.id); atualizar("none"); } },
    "lf-pq": () => { const i = cur(); if (i) { store.setIndicacaoPQ(i.id, !i.pq); atualizar("none"); } },
    // Fase 5 (grifo único): "Anotar" aciona o modo NOTA do menu flutuante sobre a seleção atual;
    // sem seleção, ensina o gesto UMA vez (o painel-pincel foi aposentado na Lei Seca).
    "lf-anotar": () => {
      if (S._gfAbrirNota && S._gfAbrirNota()) return;
      if (!S._dicaAnotarFoco) { S._dicaAnotarFoco = true; toast("Selecione o trecho do artigo — o menu que aparece tem o Comentar."); }
    },
    "lf-modo": (el) => { modoLeitura = el.getAttribute("data-modo"); revelados.clear(); atualizar("none"); },
    "lf-copiar": async () => { const i = cur(); if (!i) return; try { await navigator.clipboard.writeText(`${i.referencia}\n${corpoArtigoLimpo(i.texto)}`); toast("Artigo copiado."); } catch { toast("Não consegui copiar.", "erro"); } },
    "lf-ia": () => { const i = cur(); if (i) perguntarIASobreTrecho({ store, app }, i.id, corpoArtigoLimpo(i.texto)); },
  }));
  // Recordar: clicar numa lacuna revela o trecho grifado.
  host.addEventListener("click", (e) => {
    const cz = e.target.closest("[data-cloze]");
    if (cz) { revelados.add(cz.getAttribute("data-cloze")); atualizar("none"); }
  });
  // "Anotar" age sobre a seleção viva: o mousedown no botão não pode colapsá-la (mesmo
  // truque do menu flutuante).
  host.addEventListener("mousedown", (e) => { if (e.target.closest('[data-action="lf-anotar"]')) e.preventDefault(); });
  offTick = ligarTickCrono(host);
  const chip = host.querySelector(".fq-crono"); if (chip) atualizarChipCrono(chip);
  const onKey = (e) => {
    const r = focoChromeKey(e, { root: host });
    if (r) return; // "input" (num campo/modal) ou "stop" (Esc/setas) — já tratado
    // Enter = atalho para "Marcar lido e avançar" (não dispara em campos/botões/lacunas).
    if (e.key === "Enter") {
      const a = e.target;
      if (a && (/^(INPUT|TEXTAREA)$/.test(a.tagName) || a.isContentEditable || (a.closest && a.closest('[data-cloze],button,[role="button"]')))) return;
      e.preventDefault();
      host.querySelector('[data-action="lf-lido"]')?.click();
    }
  };
  document.addEventListener("keydown", onKey);
}

// #10 — COMPLETAR O ARTIGO em 4 níveis (fácil/médio/difícil/extremo). Overlay tela cheia (casca do
// Foco), um artigo por vez. fácil/médio = digitar as lacunas (checagem ao vivo, sem acento/caixa);
// difícil = recordar cláusulas inteiras (clicar para revelar, autoavaliação); extremo = redigitar o
// artigo de memória e conferir por diff de palavras.
const _clNorm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.,;:()"“”'']/g, " ").replace(/\s+/g, " ").trim();
const NIVEIS_CL = [["facil", "Fácil"], ["medio", "Médio"], ["dificil", "Difícil"], ["extremo", "Extremo"]];
export function abrirCompletarArtigo(app, store, ids, opts = {}) {
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
    const nivel = S._completarNivel;
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
    <div class="cl-niveis">${NIVEIS_CL.map(([id, lbl]) => `<button class="cl-nivel ${S._completarNivel === id ? "on" : ""}" data-action="cl-nivel" data-nivel="${id}">${lbl}</button>`).join("")}</div>
    <div class="cl-acoes">
      ${S._completarNivel === "extremo"
      ? `<button class="btn btn-sm btn-soft" data-action="cl-conferir">${icone("check")} Conferir</button>`
      : `<button class="btn btn-sm btn-ghost" data-action="cl-revelar">${icone("eye")} Revelar tudo</button>`}
      <button class="btn btn-sm btn-ghost" data-action="cl-recomecar" data-tip="Limpar e recomeçar" data-tip-pos="cima">${icone("rotate-ccw")}</button>
      <button class="lfoco-btn lfoco-ia" data-action="cl-ia" data-tip-pos="cima" data-tip="Perguntar à IA sobre o artigo">${icone("sparkles")}</button>
    </div>
    <div class="lf-legenda">${icone("arrow-left")}${icone("arrow-right")} navegar · <b>Esc</b> sair · o nível troca o desafio</div>
  </div>`;

  const atualizarScore = () => {
    const box = host.querySelector(".cl-score"); if (!box) return;
    if (S._completarNivel === "dificil") {
      const tot = host.querySelectorAll(".cl-hide").length, rev = host.querySelectorAll(".cl-hide.on").length;
      box.innerHTML = tot ? `${rev}/${tot} cláusulas reveladas` : "";
      return;
    }
    if (S._completarNivel === "extremo") return; // score sai no Conferir
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
    "cl-nivel": (el) => { S._completarNivel = el.getAttribute("data-nivel"); atualizar(); },
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
