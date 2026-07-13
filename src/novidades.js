// Central de novidades: UM lugar discreto (sino no topo) para "o que há de novo".
// Anti-modal-fatigue (lição da auditoria): nada de modais empilhados nem tour de N
// passos — badge silencioso quando a versão instalada é mais nova que a última vista.
import { APP_VERSION } from "./erro-log.js";
import { esc } from "./util.js";
import { abrirJanela } from "./ui.js";

// Changelog (mais recente primeiro). Cada versão: { v, data, itens:[...] }.
export const NOVIDADES = [
  {
    v: "0.6.4",
    data: "julho/2026",
    titulo: "Estude no celular + sincronização por senha",
    itens: [
      "Agora dá para usar o Mentor no CELULAR: abra o app pelo navegador e use 'Adicionar à tela inicial' — ele vira um ícone e abre em tela cheia, como um aplicativo.",
      "Sincronização por senha entre o celular e os computadores: você escolhe uma senha, digita uma vez em cada aparelho e pronto — o que estuda num aparelho aparece no outro. Tudo é cifrado (só você lê); os PDFs originais ficam em cada aparelho.",
      "Três formas de usar, os mesmos dados: aplicativo de computador (com os recursos nativos, como buscar a lei no Planalto), navegador no computador e navegador no celular.",
      "Lei Seca — marcação rápida de volta: favoritar, marcar como difícil e 'o que mais cai' direto no artigo, num clique no ícone, sem abrir o menu.",
      "Lei Seca — modo foco: botão 'Marcar lido' que marca o artigo e já avança para o próximo (igual à seta).",
      "Gerar com IA ficou mais direto: uma única janela a partir do material importado (ou de um subtópico dele). Mapas mentais agora também perguntam a quantidade, como as demais telas.",
    ],
  },
];

// A "versão de novidades" é a mais recente do changelog.
function ultimaVersao() {
  return NOVIDADES.length ? NOVIDADES[0].v : APP_VERSION;
}

// Há novidade não vista? (config.novidadesVistas guarda a última versão vista)
export function temNovidade(store) {
  const vista = store.get().config.novidadesVistas || "";
  return vista !== ultimaVersao();
}

export function marcarNovidadesVistas(store) {
  store.setConfig({ novidadesVistas: ultimaVersao() });
}

// Abre o painel (janela modal única) e marca como visto.
export function abrirNovidades(store) {
  const corpo = NOVIDADES.map(
    (n) => `
      <div class="nov-bloco">
        <div class="nov-cab"><b>${esc(n.titulo)}</b> <span class="chip chip-count" style="cursor:default">v${esc(n.v)}</span> <span class="muted small">${esc(n.data)}</span></div>
        <ul class="nov-lista">${n.itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      </div>`
  ).join("");
  abrirJanela({
    titulo: "Novidades",
    corpoHTML: `<div class="novidades">${corpo}</div>`,
  });
  marcarNovidadesVistas(store);
}
