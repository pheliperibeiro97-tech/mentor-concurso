// Paleta de comando ⌘K (launcher). Abre de qualquer tela com Ctrl/⌘+K. Faz duas coisas:
//  • NAVEGAÇÃO instantânea (telas + atalhos do usuário) — funciona OFFLINE;
//  • PERGUNTAR / FAZER à IA — repassa ao chat (app.perguntarNoChat), reusando 100% o motor
//    do chat (interpretar → propor → confirmar → executar). Não recria um chat paralelo.
import { NAV_ITENS } from "./main.js";
import { icone } from "./icones.js";
import { esc } from "./util.js";

let aberta = false;

export function abrirPaleta(app) {
  if (aberta) return;
  aberta = true;
  const cfg = (app.store.get() && app.store.get().config) || {};

  // Itens navegáveis: telas (NAV_ITENS) + telas "sem barra" (Guia / Por onde começar) + atalhos.
  const EXTRAS = [
    { id: "ajuda", label: "Guia do sistema", icone: "circle-help", grupo: "Sistema" },
    { id: "comecar", label: "Por onde começar", icone: "rocket", grupo: "Sistema" },
  ];
  const telas = [...NAV_ITENS, ...EXTRAS].map((it) => ({ kind: "nav", label: it.label, sub: it.grupo, icone: it.icone, run: () => app.navigate(it.id) }));
  const atalhos = (cfg.atalhos || []).map((a) => ({ kind: "nav", label: a.nome, sub: "Atalho", emoji: a.icone, run: () => ativarAtalho(app, a) }));
  const navegaveis = [...telas, ...atalhos];

  const ov = document.createElement("div");
  ov.className = "paleta-overlay";
  ov.innerHTML = `
    <div class="paleta" role="dialog" aria-modal="true">
      <input class="paleta-input" type="text" placeholder="Ir para uma tela ou perguntar à IA…   (Esc fecha)" autocomplete="off" spellcheck="false" />
      <div class="paleta-lista"></div>
      <div class="paleta-rodape muted">↑↓ navegar · Enter abrir · Esc fechar</div>
    </div>`;
  document.body.appendChild(ov);
  const input = ov.querySelector(".paleta-input");
  const lista = ov.querySelector(".paleta-lista");
  let sel = 0;
  let resultados = [];

  const fechar = () => { if (!aberta) return; aberta = false; ov.remove(); document.removeEventListener("keydown", onEscGlobal, true); };

  function filtrar(q) {
    const t = q.trim().toLowerCase();
    const nav = (t ? navegaveis.filter((it) => it.label.toLowerCase().includes(t)) : navegaveis).slice(0, 8);
    resultados = nav.slice();
    if (t) resultados.push({ kind: "ia", texto: q.trim() });
    sel = 0;
    render();
  }

  function render() {
    lista.innerHTML =
      resultados
        .map((r, i) => {
          const on = i === sel ? "on" : "";
          if (r.kind === "ia") {
            return `<button class="paleta-item ${on}" data-i="${i}">${icone("sparkles")}<span class="paleta-lbl">Perguntar / fazer: <b>“${esc(r.texto)}”</b></span><span class="paleta-sub">IA</span></button>`;
          }
          const ico = r.icone ? icone(r.icone) : r.emoji ? `<span class="paleta-emoji">${esc(r.emoji)}</span>` : "";
          return `<button class="paleta-item ${on}" data-i="${i}">${ico}<span class="paleta-lbl">${esc(r.label)}</span><span class="paleta-sub">${esc(r.sub || "")}</span></button>`;
        })
        .join("") || `<div class="paleta-vazio muted">Nada encontrado. Pressione Enter para perguntar à IA.</div>`;
  }

  function ativar(i) {
    const r = resultados[i];
    if (!r) return;
    fechar();
    if (r.kind === "ia") {
      if (typeof app.perguntarNoChat === "function") app.perguntarNoChat(r.texto);
    } else {
      try { r.run(); } catch (_) {}
    }
  }

  input.addEventListener("input", () => filtrar(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, resultados.length - 1); render(); scrollSel(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); scrollSel(); }
    else if (e.key === "Enter") { e.preventDefault(); ativar(sel); }
    else if (e.key === "Escape") { e.preventDefault(); fechar(); }
  });
  lista.addEventListener("click", (e) => {
    const el = e.target.closest("[data-i]");
    if (el) ativar(+el.getAttribute("data-i"));
  });
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) fechar(); });
  function scrollSel() { const el = lista.querySelector(".paleta-item.on"); if (el) el.scrollIntoView({ block: "nearest" }); }
  function onEscGlobal(e) { if (e.key === "Escape") { e.preventDefault(); fechar(); } }
  document.addEventListener("keydown", onEscGlobal, true);

  filtrar("");
  input.focus();
}

// Mesma lógica de ativação de atalho da barra lateral (main.js).
function ativarAtalho(app, a) {
  if (a.tipo === "disciplina") app.navigate("edital", { focoDisciplinaId: a.alvo });
  else if (a.tipo === "topico") app.navigate("edital", { dossieTopicoId: a.alvo });
  else if (a.tipo === "simulado") app.navigate(a.alvo === "pratica-ce" ? "pratica-ce" : "pratica", { sub: "simulado" });
  else app.navigate(a.alvo);
}
