// Legislação: parser do HTML oficial (Planalto) → artigos com a LETRA EXATA e detecção de
// REVOGADO (o Planalto marca revogado com <strike>/<s>/<del>, e às vezes zero texto "(Revogado)",
// então SÓ o HTML revela). Nada de OCR nem IA adivinhando a letra. Também busca a página no
// app desktop (Tauri, sem CORS); na web, CORS bloqueia → o usuário cola o texto.

// Detecta o nome curto da norma a partir do cabeçalho/título do documento.
function detectarNormaTexto(t) {
  const h = String(t || "").slice(0, 2500);
  if (/constitui[çc][aã]o\s+(?:federal|da\s+rep[úu]blica)/i.test(h)) return "CF";
  const m = h.match(/lei\s+(?:complementar\s+)?n[ºo°.]*\s*([\d.]+)(?:[^\n]*?\bde\b[^\n]*?(\d{4}))?/i);
  if (m) return `Lei ${m[1]}${m[2] ? "/" + m[2] : ""}`;
  return null;
}

// Remove as anotações de HISTÓRICO do dispositivo (não são a letra da lei) e normaliza espaços.
function limparCorpo(s) {
  return String(s || "")
    .replace(/\([^)]*\b(?:Reda[çc][aã]o dada|Vide|Inclu[íi]d[oa]|Renumerad[oa]|Revogad[oa]|Vig[êe]ncia|Regulamento|Produ[çc][aã]o de efeito|pela\s+Lei|pela\s+Emenda|pela\s+Medida)[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Parseia o HTML de uma lei (Planalto) → { norma, artigos:[{referencia, texto, revogado}] }.
// Rastreia o tachado (strike) por caractere para marcar o revogado com precisão.
export function parsearLeiHTML(html, opts = {}) {
  if (typeof DOMParser === "undefined") return { norma: opts.norma || null, artigos: [] };
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const body = doc.body;
  if (!body) return { norma: opts.norma || null, artigos: [] };
  const norma = opts.norma || detectarNormaTexto(body.textContent) || null;

  // Texto linear + máscara de "tachado" alinhada por caractere.
  let texto = "";
  const struck = [];
  const BLOCO = new Set(["P", "DIV", "BR", "TR", "LI", "TABLE", "H1", "H2", "H3", "H4", "UL", "OL", "BLOCKQUOTE"]);
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === 1) { if (BLOCO.has(n.tagName) && !texto.endsWith("\n")) { texto += "\n"; struck.push(false); } continue; }
    let raw = String(n.nodeValue || "").replace(/ /g, " ");
    if (!raw) continue;
    let el = n.parentElement, s = false;
    while (el && el !== body) {
      const tag = el.tagName ? el.tagName.toLowerCase() : "";
      if (tag === "strike" || tag === "s" || tag === "del") { s = true; break; }
      const stl = el.getAttribute ? el.getAttribute("style") || "" : "";
      if (/line-through/i.test(stl)) { s = true; break; }
      el = el.parentElement;
    }
    for (let i = 0; i < raw.length; i++) { texto += raw[i]; struck.push(s); }
  }

  // Marcadores de artigo NO INÍCIO da linha/bloco (evita "art. 170" citado no meio do texto).
  // Sufixo de letra (Art. 5º-A) só vale se for UMA letra isolada — não "Art. 124 - Provocar…"
  // (formato antigo com hífen antes da descrição). Lookahead: a letra não pode iniciar palavra.
  const re = /(?:^|\n)[ \t]*Art(?:igo)?\.?\s*(\d+)(?:\s*[ºo°])?(?:-([A-Z])(?![A-Za-zÀ-ÿ]))?/g;
  const marks = [];
  let m;
  while ((m = re.exec(texto))) marks.push({ idx: m.index, num: m[1], letra: m[2] || "" });
  if (marks.length < 2) return { norma, artigos: [] };

  // ADCT (Constituição): a numeração REINICIA em "Art. 1º" depois do corpo principal. Sinal
  // robusto (não depende do cabeçalho/índice): o 1º "Art. 1º" que aparece DEPOIS do MAIOR artigo.
  let adctIdx = Infinity;
  let maxN = 0;
  for (const mk of marks) maxN = Math.max(maxN, +mk.num);
  if (maxN >= 30) {
    let posMax = -1;
    for (let i = marks.length - 1; i >= 0; i--) if (+marks[i].num === maxN) { posMax = marks[i].idx; break; }
    for (const mk of marks) if (mk.idx > posMax && mk.num === "1" && !mk.letra) { adctIdx = mk.idx; break; }
  }

  // Coleta candidatos e mantém, por referência, o de MAIOR texto vivo (a entrada do índice é
  // curta/vazia; o artigo real é o mais longo) — resolve o falso "(revogado)" de artigos válidos.
  const porRef = new Map();
  for (let i = 0; i < marks.length; i++) {
    const ini = marks[i].idx;
    const fim = i + 1 < marks.length ? marks[i + 1].idx : texto.length;
    if (fim - ini < 8) continue;
    // Texto do artigo = SÓ o NÃO-riscado (a versão vigente; descarta a redação antiga/revogada).
    let vivo = "";
    for (let k = ini; k < fim; k++) if (!struck[k]) vivo += texto[k];
    const corpo = limparCorpo(vivo);
    const semRef = corpo.replace(/^Art\.?\s*\d+\s*[ºo°]?(?:\s*[-–]\s*[A-Z])?\.?\s*/i, "").trim();
    const revogado = semRef.length < 6 || (/\(\s*revogad/i.test(texto.slice(ini, fim)) && semRef.length < 30);
    const ord = /^[1-9]$/.test(marks[i].num) ? "º" : "";
    const norm2 = marks[i].idx >= adctIdx ? "ADCT" : norma;
    const ref = `Art. ${marks[i].num}${ord}${marks[i].letra ? "-" + marks[i].letra : ""}${norm2 ? ", " + norm2 : ""}`;
    const cand = { referencia: ref, texto: corpo || "(revogado)", revogado, _len: semRef.length, _ord: i };
    const cur = porRef.get(ref);
    if (!cur || cand._len > cur._len) porRef.set(ref, cand);
  }
  const artigos = [...porRef.values()].sort((a, b) => a._ord - b._ord).map(({ _len, _ord, ...a }) => a);
  return { norma, artigos };
}

// Seleciona só PARTE dos artigos por intervalo/lista informada pelo usuário.
// Aceita "121-127", "121 a 127", "121-127, 155, 213-217", "art. 5, 121-124". Artigos com letra
// (5-A) entram pela base numérica. Vazio → devolve todos.
export function selecionarArtigos(artigos, spec) {
  const s = String(spec || "").trim();
  if (!s) return artigos;
  const faixas = [];
  for (const tok of s.split(/[,;\n]+/)) {
    const t = tok.replace(/\bart(?:igos?)?\.?/gi, "").replace(/\s+a\s+/gi, "-").replace(/\s+/g, "");
    const mr = t.match(/^(\d+)-(\d+)$/);
    if (mr) { faixas.push([+mr[1], +mr[2]]); continue; }
    const mn = t.match(/(\d+)/);
    if (mn) faixas.push([+mn[1], +mn[1]]);
  }
  if (!faixas.length) return artigos;
  const numDe = (ref) => { const m = String(ref).match(/Art\.\s*(\d+)/i); return m ? +m[1] : null; };
  return artigos.filter((a) => { const n = numDe(a.referencia); return n != null && faixas.some(([lo, hi]) => n >= lo && n <= hi); });
}

// Busca a página oficial (Planalto) e devolve o HTML. Só no app DESKTOP (Tauri) — na web o
// CORS bloqueia, então lança SEM_DESKTOP para a UI orientar o usuário a colar o texto.
export async function buscarLeiPlanalto(url) {
  const t = typeof window !== "undefined" ? window.__TAURI__ : null;
  const httpFetch = t && (t.http?.fetch || t.tauri?.http?.fetch);
  if (!httpFetch) {
    const e = new Error("A busca direta no Planalto só funciona no app desktop. Cole o texto da lei aqui.");
    e.code = "SEM_DESKTOP";
    throw e;
  }
  const res = await httpFetch(url, { method: "GET", responseType: 2 /* Text */ });
  const html = typeof res?.data === "string" ? res.data : res?.data != null ? String(res.data) : "";
  if (!html) { const e = new Error("Não recebi o conteúdo da página. Confira o link."); e.code = "VAZIO"; throw e; }
  return html;
}

// Catálogo de leis mais cobradas (nome curto + URL oficial). Fica atrás do botão "Importar lei".
export const CATALOGO_LEIS = [
  { nome: "CF", titulo: "Constituição Federal", url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm" },
  { nome: "CP", titulo: "Código Penal", url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm" },
  { nome: "CPP", titulo: "Código de Processo Penal", url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689compilado.htm" },
  { nome: "CC", titulo: "Código Civil", url: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm" },
  { nome: "CPC", titulo: "Código de Processo Civil", url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm" },
  { nome: "CDC", titulo: "Código de Defesa do Consumidor", url: "https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm" },
  { nome: "CTN", titulo: "Código Tributário Nacional", url: "https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm" },
  { nome: "CLT", titulo: "Consolidação das Leis do Trabalho", url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm" },
  { nome: "Lei 8.112/1990", titulo: "Regime Jurídico dos Servidores da União", url: "https://www.planalto.gov.br/ccivil_03/leis/l8112cons.htm" },
  { nome: "Lei 14.133/2021", titulo: "Nova Lei de Licitações", url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm" },
  { nome: "Lei 8.666/1993", titulo: "Licitações (antiga)", url: "https://www.planalto.gov.br/ccivil_03/leis/l8666cons.htm" },
];
