// Estado COMPARTILHADO da tela Lei Seca / Jurisprudência.
// Antes eram variáveis de módulo do leiseca.js; no split em módulos viraram o objeto
// mutável ÚNICO `S` (singleton). Todos os módulos leem/escrevem via `S.<nome>` — nunca
// reatribuir `S` em si. Os comentários de cada campo vieram do arquivo original.
export const S = {
  // Abas (modelo v3): "ler" (a letra: link+anotações+texto) · "metas" (metas cruas de leitura) ·
  // "memorizar" (promovidos, revisão espaçada) · "treinar" · "raiox".
  modoAtivo: { lei: "ler", juris: "ler" },
  lerFiltroNov: { lei: false, juris: false }, // filtro "só novidades" na aba Ler
  estudarEscopo: { lei: "tudo", juris: "tudo" }, // intensidade do escopo: "tudo" | "incidencia"
  estudarLeiSel: null, // OBJETO do estudo: norma escolhida (null = a lei ativa do leitor)
  estudarSecaoSel: null, // seção estrutural "rotulo|titulo" (null = a lei inteira) — delimita p/ a IA
  estudarArtFiltro: "", // artigo(s) do escopo: "" | "5" (um) | "1-10"/"1 a 10" (intervalo)
  estudarTemaSel: null, // tema do escopo (Memorizar temático): null = todos
  // C.2.4 — escopo de estudo da JURISPRUDÊNCIA (análogo à lei, mas por tribunal/ramo/assunto/categoria).
  estudarJurisTrib: null, // tribunal (null = todos)
  estudarJurisRamo: null, // ramo do direito (null = todos)
  estudarJurisAssunto: null, // assunto (null = todos)
  estudarJurisCat: null, // categoria (Súmula, Tema repetitivo…) (null = todas)
  _escopoTipo: null, // tipo dono do recorte de estudo atual — troca de módulo (lei↔juris) zera o recorte
  _escopoAberto: false, // popover de escopo do Estudar aberto?
  leiAtiva: { lei: null }, // F1a: lei ativa no leitor (uma lei por vez)
  leiFiltro: { lei: null }, // filtro do leitor: null|"lido"|"favorito"|"dificil"|"grifo"|"anotacao"
  _leitorCtx: null, // {store, app, norma} — usado pelo menu flutuante de grifo (F2) e pela posição de leitura
  _gfAbrirNota: null, // Fase 5: botão "Anotar" do Foco aciona o modo NOTA do menu flutuante (exige seleção)
  _dicaAnotarFoco: false, // dica do Anotar sem seleção — mostrada UMA vez por sessão
  _indiceColapsado: false, // botão "Índice": recolhe toda a estrutura (Livro/Título/Capítulo…) → vira índice
  // Scroll-spy do leitor (IntersectionObservers ativos) + timer de posição.
  _scrollSpyIO: null,
  _scrollSpyArtIO: null,
  _savePosT: null,
  _barraAuto: null, // { el, fn } do listener ativo da barra auto-oculta do leitor
  _completarNivel: "facil", // nível do "Completar o artigo" (facil|medio|dificil|extremo)
  filtroTop: { lei: { sel: [], aberto: false }, juris: { sel: [], aberto: false } }, // filtro multitópico
  filtroTribunal: "todos", // só jurisprudência
  filtroCategoria: "todas", // só jurisprudência
  filtroRamo: "todos", // F2 — ramo do direito (jurisprudência)
  filtroAssunto: "todos", // F2 — assunto dentro do ramo (índice navegável)
  filtroStatus: "todos", // F2 — vigente | superado | importante
  editandoTribunal: null, // tribunal personalizado em edição (rename) na barra de filtros
  editandoId: null,
  mostrarConcluidas: { lei: false, juris: false }, // metas concluídas recolhidas por padrão
  marcarAberto: new Set(), // ids de itens com a marcação tricromática aberta
  gruposFechados: new Set(), // grupos (norma/tribunal) recolhidos — T1
  _nomesLeis: {}, // apelidos de exibição por norma (config.nomesLeis) — atualizado a cada render
};

// Interpreta o filtro de artigo: número único ou intervalo. Devolve {de,ate} ou null.
export function parseIntervaloArt(s) {
  const m = String(s || "").trim().match(/^(\d+)\s*(?:[-–—a\s]+\s*(\d+))?$/i);
  if (!m) return null;
  const de = +m[1], ate = m[2] ? +m[2] : de;
  return { de: Math.min(de, ate), ate: Math.max(de, ate) };
}
export function rotulos(tipo) {
  return tipo === "juris"
    ? { titulo: "Jurisprudência", item: "súmula/precedente", itemPlural: "súmulas/precedentes", itemVazio: "uma súmula ou precedente", ph: "Ex.: Súmula 473 STF · Tema 1234 STJ" }
    : { titulo: "Lei Seca", item: "artigo", itemPlural: "artigos", itemVazio: "um artigo", ph: "Ex.: art. 37, caput, CF · art. 312, CP" };
}
// Rótulo do estado "não vale mais" conforme o tipo: lei = revogado; súmula = cancelada;
// tema/precedente = superado. Usado no selo, na ação e no aviso.
export function rotuloRevogado(tipo, categoria) {
  if (tipo !== "juris") return { adj: "revogado", acao: "Marcar como revogado" };
  if (/tema|precedente/i.test(categoria || "")) return { adj: "superada", acao: "Marcar como superada" };
  return { adj: "cancelada", acao: "Marcar como cancelada" };
}
