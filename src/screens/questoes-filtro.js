// Filtro multi-tópico compartilhado (Treino e Simulado): permite escolher vários
// tópicos OU disciplinas inteiras (sem misturar outras). Estado = { sel: [ids de
// tópico], aberto }. sel vazio = todos os tópicos.
import { esc } from "../util.js";
import { icone } from "../icones.js";

export function questaoNoFiltro(q, sel) {
  return !sel.length || sel.includes(q.topicoId);
}

// Versão genérica (Caderno, Resumos, etc.): casa pelo tópico do item OU, se o item
// só tem disciplina, casa quando algum tópico daquela disciplina está selecionado.
export function itemNoFiltro(st, item, sel) {
  if (!sel.length) return true;
  if (item.topicoId) return sel.includes(item.topicoId);
  const d = item.disciplinaId || null;
  if (!d) return false;
  return st.topicos.some((t) => t.disciplinaId === d && sel.includes(t.id));
}

// Texto curto do que está selecionado (para o rótulo do botão).
export function resumoTopicos(st, sel) {
  if (!sel.length) return "todos";
  const porDisc = new Map();
  for (const id of sel) {
    const t = st.topicos.find((x) => x.id === id);
    if (t) porDisc.set(t.disciplinaId, (porDisc.get(t.disciplinaId) || 0) + 1);
  }
  const partes = [];
  for (const [dId, cnt] of porDisc) {
    const d = st.disciplinas.find((x) => x.id === dId);
    const total = st.topicos.filter((t) => t.disciplinaId === dId).length;
    partes.push(d && cnt === total ? `${d.nome} (toda)` : `${cnt} de ${d ? d.nome : "?"}`);
  }
  return partes.length <= 2 ? partes.join(" + ") : `${sel.length} tópicos`;
}

// Botão (vai na barra de filtros).
export function filtroTopicosBotaoHTML(st, sel, aberto) {
  return `<button class="btn btn-ghost btn-sm" data-ft="toggle" data-tip-pos="cima-esq" data-tip="Escolha vários tópicos ou disciplinas inteiras.">Tópicos: ${esc(resumoTopicos(st, sel))} ${aberto ? icone("chevron-up") : icone("chevron-down")}</button>`;
}

// Painel de checkboxes (bloco; renderizar ABAIXO da barra de filtros).
export function filtroTopicosPainelHTML(st, sel, aberto) {
  if (!aberto) return "";
  const grupos = st.disciplinas
    .map((d) => {
      const tops = st.topicos.filter((t) => t.disciplinaId === d.id);
      if (!tops.length) return "";
      const todos = tops.every((t) => sel.includes(t.id));
      return `<div class="ft-grupo">
          <label class="ft-disc"><input type="checkbox" data-ft-disc="${d.id}" ${todos ? "checked" : ""} /> <b>${esc(d.nome)}</b> <span class="muted small">(disciplina toda)</span></label>
          ${tops.map((t) => `<label class="ft-top"><input type="checkbox" data-ft-topico="${t.id}" ${sel.includes(t.id) ? "checked" : ""} /> ${esc(t.nome)}</label>`).join("")}
        </div>`;
    })
    .join("");
  return `<div class="card ft-painel">
      <label class="ft-todos"><input type="checkbox" data-ft="todos" ${sel.length ? "" : "checked"} /> Todos os tópicos</label>
      ${grupos || `<p class="muted small">Nenhum tópico cadastrado ainda.</p>`}
    </div>`;
}

// Liga os listeners do filtro (chamar após o render). `estado` = { sel, aberto }.
export function ligarFiltroTopicos(root, app, estado) {
  root.querySelector('[data-ft="toggle"]')?.addEventListener("click", () => {
    estado.aberto = !estado.aberto;
    app.refresh();
  });
  root.querySelector('[data-ft="todos"]')?.addEventListener("change", () => {
    estado.sel = [];
    app.refresh();
  });
  root.querySelectorAll("[data-ft-topico]").forEach((cb) =>
    cb.addEventListener("change", () => {
      const id = cb.getAttribute("data-ft-topico");
      if (cb.checked) {
        if (!estado.sel.includes(id)) estado.sel = [...estado.sel, id];
      } else {
        estado.sel = estado.sel.filter((x) => x !== id);
      }
      app.refresh();
    })
  );
  root.querySelectorAll("[data-ft-disc]").forEach((cb) =>
    cb.addEventListener("change", () => {
      const st = app.store.get();
      const discId = cb.getAttribute("data-ft-disc");
      const topIds = st.topicos.filter((t) => t.disciplinaId === discId).map((t) => t.id);
      const todosSel = topIds.length && topIds.every((id) => estado.sel.includes(id));
      if (todosSel) estado.sel = estado.sel.filter((id) => !topIds.includes(id));
      else estado.sel = [...new Set([...estado.sel, ...topIds])];
      app.refresh();
    })
  );
}
