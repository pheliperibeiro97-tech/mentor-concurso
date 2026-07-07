// Lembretes — recados livres do usuário (texto + data opcional). NÃO é estudo: sem
// vínculo a tópico, sem categoria, sem aviso. Acesso global pelo FAB flutuante (ícone de
// anotação no canto inferior-direito, acima do cronômetro, presente em TODAS as telas
// inclusive no Modo Foco) e também num card na tela Hoje. Visual: quadro de notas (cards
// sóbrios, cor sutil por nota) — "post-it condizente com o app", não infantil.
import { icone } from "./icones.js";
import { esc } from "./util.js";

// dd/mm a partir de ISO (YYYY-MM-DD). Vazio se não houver data.
export function fmtDataCurta(iso) {
  if (!iso) return "";
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : iso;
}

// Quadro de notas (grade adaptável). Reusado pelo painel e pelo card do Hoje.
// `opts.soPendentes` = esconde os concluídos (usado no Home; o painel mostra todos).
export function lembretesListaHTML(store, opts = {}) {
  let arr = store.lembretes();
  if (opts.soPendentes) arr = arr.filter((l) => !l.feito);
  if (!arr.length)
    return `<div class="lem-vazio"><span class="lem-vazio-ic">${icone("notebook-pen")}</span><p>Nenhum lembrete ainda.<br><span class="muted small">Anote o que não pode esquecer: prova, inscrição, boleto do cursinho…</span></p></div>`;
  return `<div class="lem-board">${arr
    .map((l, i) => {
      const cor = l.feito ? "" : ` lemc-c${i % 4}`;
      return `<article class="lemc${cor}${l.feito ? " done" : ""}" data-lem-card="${l.id}">
        <button class="lemc-chk" data-lem-toggle="${l.id}" data-tip="${l.feito ? "Reabrir" : "Concluir"}" aria-label="${l.feito ? "Reabrir" : "Concluir"}">${l.feito ? icone("check") : ""}</button>
        <div class="lemc-body">
          <div class="lemc-tx">${esc(l.texto)}</div>
          <div class="lemc-meta">
            ${l.data ? `<span class="lemc-dt">${icone("calendar-days")} ${fmtDataCurta(l.data)}</span>` : ""}
            <span class="lemc-acts">
              <button data-lem-edit="${l.id}" data-tip="Editar" aria-label="Editar">${icone("square-pen")}</button>
              <button data-lem-del="${l.id}" data-tip="Remover" aria-label="Remover">${icone("x")}</button>
            </span>
          </div>
        </div>
      </article>`;
    })
    .join("")}</div>`;
}

// Edição inline de uma nota (texto + data). `onDone` re-renderiza a lista.
export function entrarEdicaoLembrete(card, store, id, onDone) {
  const l = (store.get().lembretes || []).find((x) => x.id === id);
  if (!l || !card) return;
  card.classList.add("lemc-editing");
  card.innerHTML = `
    <form class="lemc-form">
      <input class="lemc-inp" type="text" value="${esc(l.texto)}" maxlength="200" aria-label="Editar recado" />
      <div class="lemc-form-row">
        <input class="lemc-date" type="date" value="${l.data || ""}" aria-label="Data (opcional)" />
        <span class="lemc-form-btns">
          <button type="button" class="lemc-cancel" data-lem-cancel>Cancelar</button>
          <button type="submit" class="lemc-save">Salvar</button>
        </span>
      </div>
    </form>`;
  const inp = card.querySelector(".lemc-inp");
  const dt = card.querySelector(".lemc-date");
  inp.focus();
  inp.select();
  card.querySelector(".lemc-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!inp.value.trim()) { inp.focus(); return; }
    store.editarLembrete(id, { texto: inp.value, data: dt.value || null });
    onDone && onDone();
  });
  card.querySelector("[data-lem-cancel]").addEventListener("click", () => onDone && onDone());
}

// Delegação dos cliques do quadro (toggle/editar/remover). Reusada pelo painel e pelo Hoje.
export function tratarCliqueLembrete(e, store, rerender) {
  const t = e.target.closest("[data-lem-toggle]");
  const d = e.target.closest("[data-lem-del]");
  const ed = e.target.closest("[data-lem-edit]");
  if (t) { store.toggleLembrete(t.getAttribute("data-lem-toggle")); rerender(); return true; }
  if (d) { store.removerLembrete(d.getAttribute("data-lem-del")); rerender(); return true; }
  if (ed) { entrarEdicaoLembrete(ed.closest("[data-lem-card]"), store, ed.getAttribute("data-lem-edit"), rerender); return true; }
  return false;
}

// Painel global aberto pelo chip do topbar: adicionar rápido + quadro. Adapta a altura ao
// conteúdo (até ~toda a tela) e rola quando há muitos. `onChange` atualiza a contagem do chip.
export function abrirLembretes(store, onChange) {
  if (document.querySelector(".lem-pop-overlay")) return;
  const ov = document.createElement("div");
  ov.className = "lem-pop-overlay";
  ov.innerHTML = `
    <div class="lem-pop" role="dialog" aria-label="Lembretes">
      <div class="lem-head"><span class="lem-head-t">${icone("notebook-pen")} <b>Lembretes</b></span><button class="lem-close" data-lem-close type="button" aria-label="Fechar">${icone("x")}</button></div>
      <form class="lem-add">
        <input class="lem-inp" type="text" placeholder="Escrever um recado…" maxlength="200" aria-label="Novo lembrete" />
        <input class="lem-date" type="date" data-tip="Data (opcional)" aria-label="Data (opcional)" />
        <button class="lem-add-btn" type="submit" data-tip="Adicionar" aria-label="Adicionar">${icone("plus")}</button>
      </form>
      <div class="lem-corpo">${lembretesListaHTML(store)}</div>
    </div>`;
  document.body.appendChild(ov);
  const inp = ov.querySelector(".lem-inp");
  const dateInp = ov.querySelector(".lem-date");
  const corpo = ov.querySelector(".lem-corpo");
  inp.focus();
  const rerender = () => { corpo.innerHTML = lembretesListaHTML(store); if (onChange) onChange(); };
  const fechar = () => { ov.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") fechar(); };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("click", (e) => { if (e.target === ov) fechar(); });
  ov.querySelector("[data-lem-close]").addEventListener("click", fechar);
  ov.querySelector(".lem-add").addEventListener("submit", (e) => {
    e.preventDefault();
    const l = store.addLembrete(inp.value, dateInp.value || null);
    if (l) { inp.value = ""; dateInp.value = ""; inp.focus(); rerender(); }
  });
  corpo.addEventListener("click", (e) => tratarCliqueLembrete(e, store, rerender));
}

// ===== FAB flutuante global (canto inferior-direito, acima do cronômetro) =====
// Botão de anotação sempre à vista em TODAS as telas, inclusive no Modo Foco. Abre um
// popover premium (escrever no topo + quadro abaixo), espelhando o padrão visual do
// cronômetro. Substitui o antigo chip do topbar. A contagem de pendentes vira um badge no
// próprio botão. Reaproveita os estilos do painel (.lem-add/.lem-corpo/.lemc).
let lemFab = null;
let lemStore = null;
let lemPopAberto = false;

function lemRerenderCorpo() {
  if (!lemFab) return;
  const corpo = lemFab.querySelector(".lem-corpo");
  if (corpo) corpo.innerHTML = lembretesListaHTML(lemStore);
}

// Reflete no FAB as mudanças feitas fora dele (tela Hoje, assistente…): apenas re-renderiza
// o quadro quando o popover está aberto. De propósito NÃO há contador no botão — o número de
// pendentes distrai a concentração; a consciência dos lembretes fica na tela Hoje.
export function atualizarLembretesFab() {
  if (!lemFab) return;
  // Não regenerar o quadro enquanto uma nota está em edição inline (perderia o texto).
  if (lemPopAberto && !lemFab.querySelector(".lemc-editing")) lemRerenderCorpo();
}

function setLemPop(v) {
  lemPopAberto = !!v;
  const pop = lemFab && lemFab.querySelector(".lf-pop");
  if (pop) pop.hidden = !lemPopAberto;
  if (lemFab) lemFab.classList.toggle("lf-open", lemPopAberto);
  if (lemPopAberto) {
    lemRerenderCorpo();
    const inp = lemFab.querySelector(".lem-inp");
    if (inp) setTimeout(() => inp.focus(), 30);
  }
}

export function montarLembretesFab(store) {
  if (document.getElementById("lem-fab")) return;
  lemStore = store;
  lemFab = document.createElement("div");
  lemFab.id = "lem-fab";
  lemFab.className = "lf";
  lemFab.innerHTML = `
    <div class="lf-pop" hidden role="dialog" aria-label="Lembretes">
      <div class="lf-head"><span class="lf-head-t">${icone("notebook-pen")} <b>Lembretes</b></span>
        <button class="lf-x" data-lf-fechar type="button" aria-label="Fechar">${icone("x")}</button></div>
      <form class="lem-add">
        <input class="lem-inp" type="text" placeholder="Escrever um lembrete…" maxlength="200" aria-label="Novo lembrete" />
        <input class="lem-date" type="date" data-tip="Data (opcional)" aria-label="Data (opcional)" />
        <button class="lem-add-btn" type="submit" data-tip="Adicionar" aria-label="Adicionar">${icone("plus")}</button>
      </form>
      <div class="lem-corpo">${lembretesListaHTML(store)}</div>
    </div>
    <button class="lf-btn" data-lf-abrir type="button" data-tip="Lembretes — recados rápidos (em qualquer tela)" aria-label="Abrir lembretes">${icone("notebook-pen")}</button>`;
  document.body.appendChild(lemFab);

  const inp = lemFab.querySelector(".lem-inp");
  const dateInp = lemFab.querySelector(".lem-date");
  const corpo = lemFab.querySelector(".lem-corpo");
  const aposMudar = () => { lemRerenderCorpo(); atualizarLembretesFab(); };
  lemFab.querySelector("[data-lf-abrir]").addEventListener("click", (e) => { e.stopPropagation(); setLemPop(!lemPopAberto); });
  lemFab.querySelector("[data-lf-fechar]").addEventListener("click", () => setLemPop(false));
  lemFab.querySelector(".lem-add").addEventListener("submit", (e) => {
    e.preventDefault();
    const l = store.addLembrete(inp.value, dateInp.value || null);
    if (l) { inp.value = ""; dateInp.value = ""; inp.focus(); aposMudar(); }
  });
  corpo.addEventListener("click", (e) => tratarCliqueLembrete(e, store, aposMudar));
  // Fecha ao clicar fora / Esc (mesmo padrão do cronômetro).
  document.addEventListener("pointerdown", (e) => { if (lemPopAberto && !lemFab.contains(e.target)) setLemPop(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && lemPopAberto) setLemPop(false); });
  // Mantém o badge sincronizado com mudanças feitas fora do FAB.
  if (store.subscribe) store.subscribe(() => atualizarLembretesFab());
  atualizarLembretesFab();
}
