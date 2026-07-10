// Lei Seca / Jurisprudência — IMPRESSÃO: lei em texto corrido (crua/com grifos),
// grifos agrupados por artigo, diálogo contextual do leitor e lista simples.
// (Extraído mecanicamente de leiseca.js — comportamento idêntico.)
import { imprimir, opcoesImpressao, toast } from "../../ui.js";
import { esc } from "../../util.js";
import { nomeAmigavelLei, numArtigo, renderLeiComMarcas, _comTextoLei } from "./leitor.js";
import { nomeTopico } from "./pickers.js";

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
export function imprimirLeiHTML(store, arts, norma, opts = {}) {
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
export async function imprimirLeiContexto(store, norma, listaFinal, listaVisivel, filtroAtivo) {
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

export function acaoImprimirGrifos(store, lista, norma) {
  imprimir(nomeAmigavelLei(norma) + " — grifos", imprimirGrifosLeiHTML(store, _comTextoLei(lista), norma));
}

export function printLista(st, lista, r, comTrecho = true) {
  if (!lista.length) return "<p>Nenhum item.</p>";
  return lista
    .map((i) => {
      const topico = i.topicoId ? st.topicos.find((t) => t.id === i.topicoId) : null;
      const disc = topico ? st.disciplinas.find((d) => d.id === topico.disciplinaId) : i.disciplinaId ? st.disciplinas.find((d) => d.id === i.disciplinaId) : null;
      const vinc = topico ? nomeTopico(st, topico) : disc ? disc.nome : "Geral";
      const extra = [i.tribunal, i.categoria].filter(Boolean).join(" · ");
      return `<div class="print-item">[${i.lido ? "x" : " "}] <b>${esc(i.referencia)}</b>${extra ? ` <span class="print-meta">(${esc(extra)})</span>` : ""}
        ${comTrecho && i.texto ? `<div>${esc(i.texto)}</div>` : ""}
        <div class="print-meta">${esc(vinc)}</div></div>`;
    })
    .join("");
}
