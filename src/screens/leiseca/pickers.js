// Lei Seca / Jurisprudência — helpers de formulário compartilhados: cascata
// disciplina→tópico, seletores de tribunal/categoria e admin de tribunal personalizado.
// (Extraído mecanicamente de leiseca.js — comportamento idêntico.)
import { esc } from "../../util.js";
import { icone } from "../../icones.js";
import { S } from "./estado.js";

export const TRIBUNAIS = ["STF", "STJ", "TJSP"]; // padrão; "Outro" no seletor cobre qualquer outro
// "Jurisprudência" é o guarda-chuva do que não se encaixa nos precedentes qualificados/súmula comum
// (inclui IRDR/IAC e demais decisões isoladas).
export const CATEGORIAS_JURIS = ["Súmula Vinculante", "Repercussão Geral", "Tema repetitivo", "Controle concentrado (ADI/ADC/ADPF)", "Súmula comum", "Jurisprudência"];
// ---------- helpers ----------
export function topicoOptions(st, disciplinaId, selecionado) {
  const tops = st.topicos.filter((t) => !disciplinaId || t.disciplinaId === disciplinaId);
  return `<option value="">— sem tópico —</option>` + tops.map((t) => `<option value="${t.id}" ${t.id === selecionado ? "selected" : ""}>${esc(t.nome)}</option>`).join("");
}
export function bindCascata(root, st, discSel, topSel) {
  const dEl = root.querySelector(discSel);
  const tEl = root.querySelector(topSel);
  if (!dEl || !tEl) return;
  dEl.addEventListener("change", () => {
    tEl.innerHTML = topicoOptions(st, dEl.value || "", null);
  });
}
export function nomeTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
// Tribunais: os padrão + os que o usuário já digitou (campo livre). Alimentam o
// datalist de sugestões e as opções do filtro (o filtro "nasce" do que foi cadastrado).
export function tribunaisDe(st) {
  return [...new Set([...TRIBUNAIS, ...st.indicacoes.filter((i) => i.tipo === "juris" && i.tribunal).map((i) => i.tribunal)])];
}
export function datalistTribunais(st) {
  return `<datalist id="trib-list">${tribunaisDe(st).map((t) => `<option value="${esc(t)}"></option>`).join("")}</datalist>`;
}
// Seletor de tribunal: chips STF/STJ/TJSP + "Outro" (revela um campo livre). O <input> guarda o
// valor (mantém o id antigo, ex.: "add-trib", para as leituras existentes seguirem funcionando).
export function tribunalPickerHTML(valor, inputId) {
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
export function ligarTribunalPicker(root) {
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
export function sincronizarTribPicker(input, valor) {
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
export function categoriaPickerHTML(sel, inputId) {
  const v = sel || "";
  return `<span class="cat-picker" data-cat-picker>
    ${CATEGORIAS_JURIS.map((c) => `<button type="button" class="chip-trib ${v === c ? "on" : ""}" data-cat-pick="${esc(c)}">${esc(c)}</button>`).join("")}
    <input type="hidden" id="${inputId}" value="${esc(v)}" />
  </span>`;
}
export function ligarCategoriaPicker(root) {
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
export function tribAdminHTML() {
  if (S.filtroTribunal === "todos" || TRIBUNAIS.includes(S.filtroTribunal)) return "";
  if (S.editandoTribunal === S.filtroTribunal) {
    return `<span class="trib-admin">
        <input id="trib-novo" type="text" value="${esc(S.filtroTribunal)}" style="width:130px" />
        <button class="lnk" data-action="trib-salvar">salvar</button>
        <button class="lnk" data-action="trib-cancelar-edit">cancelar</button>
      </span>`;
  }
  return `<span class="trib-admin">
      <button class="lnk" data-action="trib-editar" data-tip-pos="cima-dir" data-tip="Renomear este tribunal em todos os itens.">${icone("square-pen")} editar</button>
      <button class="lnk lnk-danger" data-action="trib-remover" data-tip-pos="cima-dir" data-tip="Remover este tribunal (os itens ficam sem tribunal).">${icone("trash-2")}</button>
    </span>`;
}
