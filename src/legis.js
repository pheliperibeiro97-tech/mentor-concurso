// Legislação: parser do HTML oficial (Planalto) → artigos com a LETRA EXATA e detecção de
// REVOGADO (o Planalto marca revogado com <strike>/<s>/<del>, e às vezes zero texto "(Revogado)",
// então SÓ o HTML revela). Nada de OCR nem IA adivinhando a letra. Também busca a página no
// app desktop (Tauri, sem CORS); na web, CORS bloqueia → o usuário cola o texto.

// Detecta o nome curto da norma a partir do cabeçalho/título do documento.
function detectarNormaTexto(t) {
  const h = String(t || "").slice(0, 3000);
  // Códigos conhecidos pelo NOME que aparece na ementa/título (ordem: mais específico primeiro).
  // A CF exige o título COMPLETO ("Constituição da República Federativa") — uma mera menção a
  // "Constituição Federal" (comum em outras leis, ex.: CDC) NÃO deve identificar como CF.
  const CODIGOS = [
    { nome: "CF", re: /constitui[çc][ãa]o\s+da\s+rep[úu]blica\s+federativa/i },
    { nome: "CDC", re: /c[óo]digo\s+de\s+defesa\s+do\s+consumidor|defesa\s+do\s+consumidor/i },
    { nome: "CTN", re: /c[óo]digo\s+tribut[áa]rio\s+nacional/i },
    { nome: "CLT", re: /consolida[çc][ãa]o\s+das\s+leis\s+do\s+trabalho/i },
    { nome: "CPP", re: /c[óo]digo\s+de\s+processo\s+penal/i },
    { nome: "CPC", re: /c[óo]digo\s+de\s+processo\s+civil/i },
    { nome: "CP", re: /c[óo]digo\s+penal\b/i },
    { nome: "CC", re: /c[óo]digo\s+civil\b/i },
  ];
  for (const c of CODIGOS) if (c.re.test(h)) return c.nome;
  const m = h.match(/lei\s+(?:complementar\s+)?n[ºo°.]*\s*([\d.]+)(?:[^\n]*?\bde\b[^\n]*?(\d{4}))?/i);
  if (m) return `Lei ${m[1]}${m[2] ? "/" + m[2] : ""}`;
  return null;
}

// Texto de marcador editorial do Planalto (links <a> a descartar). NÃO casa referência cruzada
// da lei ("arts. 142 e 144 da CF") — só as anotações (Vigência, Redação dada, Incluído…).
const MARCA_EDIT = /^\(?\s*(Reda[çc][aã]o|Vide|Inclu[íi]d|Renumerad|Revogad|Vig[êe]ncia|Regulament|Produ[çc][aã]o de efeito|Mensagem|Veto|pela\s+(Lei|Emenda|Medida))/i;

// Remove as anotações de HISTÓRICO do dispositivo (não são a letra da lei) e normaliza espaços.
function limparCorpo(s) {
  return String(s || "")
    .replace(/\([^)]*\b(?:Reda[çc][aã]o dada|Vide|Inclu[íi]d[oa]|Renumerad[oa]|Revogad[oa]|Vig[êe]ncia|Regulamento|Produ[çc][aã]o de efeito|pela\s+Lei|pela\s+Emenda|pela\s+Medida)[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Remove RUBRICAS marginais do Planalto (títulos de crime/seção mesclados no texto, ex.: "Homicídio
// qualificado", "Feminicídio", "Homicídio contra menor de 14 (quatorze) anos", "Disposições comuns").
// Conservador: opera por linha (bloco) e só descarta uma linha (que não a 1ª/caput) se for CURTA,
// SEM pontuação de frase e SEM marcador de dispositivo (§, inciso, alínea, Pena, Art…). Parênteses de
// GRAFIA de número ("(quatorze)") são ignorados na medição — não são pontuação de frase. Um
// dispositivo real sempre termina em pontuação (;:.) ou começa por marcador → nunca é descartado.
function limparRubricas(vivo) {
  const marcador = /^(§|Parágrafo|Pena|Art|Vig|Vide|[IVXLCDM]{1,4}\s*[-–]|[a-z]\)|\d)/i;
  const linhas = String(vivo || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (let idx = 0; idx < linhas.length; idx++) {
    const t = linhas[idx];
    // (1) Critério ORIGINAL, conservador: curta, ≤5 palavras, SEM pontuação nem parênteses.
    const rubOrig = t.length <= 45 && t.split(/\s+/).length <= 5 && /[a-zà-ÿ]{3,}/.test(t) && !/[.,;:()]/.test(t) && !marcador.test(t);
    // (2) Ampliação SEGURA (rubrica com "(quatorze)" e até 8 palavras) — SÓ se a linha preceder um
    // marcador ESTRITO de dispositivo (a próxima linha começa por §/inciso-romano/alínea/Pena — NÃO
    // "Art", que casaria referência cruzada "arts. 142 e 144"). Assim a rubrica "Homicídio contra
    // menor de 14 anos" (antes de "IX -") sai, mas o conteúdo "contra autoridade… descrito nos"
    // (antes de "arts. 142…", do Art. 129) fica.
    const marcadorEstrito = /^(§|Parágrafo|Pena|Multa|[IVXLCDM]{1,4}\s*[-–]|[a-z]\))/;
    const semParen = t.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim(); // ignora "(quatorze)"
    const rubAmpliada = semParen.length <= 55 && semParen.split(/\s+/).length <= 8
      && /[a-zà-ÿ]{3,}/.test(semParen) && !/[.,;:]/.test(semParen) && !marcador.test(t)
      && marcadorEstrito.test(linhas[idx + 1] || "");
    if (!(out.length > 0 && (rubOrig || rubAmpliada))) out.push(t);
  }
  return out.join("\n");
}

// Repõe "(Revogado)" em marcadores de dispositivo (inciso/§) que ficaram ÓRFÃOS após a anotação
// "(Revogado pela Lei X)" do Planalto ser descartada — ex.: "VI - VII", "§ 2º-A § 2º-B", "§ 7º" no
// fim. Assim a numeração é preservada e um marcador não cola no seguinte (como o Planalto exibe).
// Só age quando o marcador é seguido DIRETAMENTE por outro marcador ou pelo fim (sem conteúdo).
function corrigirOrfaos(corpo) {
  return String(corpo || "")
    .replace(/\b([IVXLCDM]{1,4})\s*[–-]\s*(?=(?:[IVXLCDM]{1,4}\s*[–-])|§|$)/g, "$1 - (Revogado) ")
    .replace(/§\s*(\d+)\s*[ºoO°]?\s*(-\s*[A-Za-z])?\s*(?=§|$)/g, (m, n, suf) => `§ ${n}º${suf ? "-" + suf.replace(/[-\s]/g, "").toUpperCase() : ""} (Revogado) `)
    .replace(/\s+/g, " ").trim();
}

// Detecta os cabeçalhos de ESTRUTURA (Livro/Parte/Título/Capítulo/Seção/Subseção) no início da
// linha e devolve: heads [{idx, nivel, rotulo, titulo}] em ordem, e snaps [{idx, path}] com a
// trilha hierárquica vigente a cada cabeçalho (os níveis mais profundos zeram a cada novo bloco).
function detectarEstrutura(texto) {
  const NIV = { LIVRO: 1, PARTE: 1, TITULO: 2, CAPITULO: 3, SECAO: 4, SUBSECAO: 5 };
  const NOME = { LIVRO: "Livro", PARTE: "Parte", TITULO: "Título", CAPITULO: "Capítulo", SECAO: "Seção", SUBSECAO: "Subseção" };
  const semAcento = (s) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // CAIXA ALTA ("DOS CRIMES…") vira sentence-case ("Dos crimes…"); se já tem minúscula, mantém.
  const bonito = (s) => (!s || /[a-zà-ÿ]/.test(s) ? s : s.toLowerCase().replace(/^\s*([a-zà-ÿ])/, (m, c) => c.toUpperCase()));
  // Romano/dígito (com sufixo hifenado "II-A") fica maiúsculo; palavra (ÚNICO/GERAL) vira bonito.
  const numeroBonito = (n) => (/^([ivxlcdm]+|\d+)(-[a-z])?$/i.test(n) ? n.toUpperCase() : bonito(n));
  // Token do "número" no início de um texto: romano/dígito (+ sufixo -A) ou ÚNICO/GERAL/ESPECIAL…
  const reNum = /^(?:([IVXLCDM]+|\d+)(?:-[A-Z])?|[ÚU]NIC[OA]|GERAL|ESPECIAL|PRELIMINAR|TRANSIT[ÓO]RI[AO]S?)\b/i;
  // Sem âncora "$" no fim: "." não cruza "\r"; o Planalto às vezes gruda "\r" no keyword
  // ("CAPÍTULO\r"), e "(.*)$" falharia. "(.*)" captura o resto da linha (para antes do "\r").
  // Keyword em CAIXA ALTA (Planalto sempre usa maiúsculas nos cabeçalhos). Sem o flag /i porque
  // "parte,"/"seção" minúsculos no meio de uma frase (que quebra no início de uma linha) geravam
  // cabeçalhos falsos — ex.: "parte, fato...;\nII - o" virava "Parte II o" e cortava a Parte Especial.
  const reKw = /^[ \t]*(LIVRO|PARTE|T[ÍI]TULO|CAP[ÍI]TULO|SUBSE[ÇC][ÃA]O|SE[ÇC][ÃA]O)\b[ \t]*(.*)/;
  const ehParada = (l) => /^(LIVRO|PARTE|T[ÍI]TULO|CAP[ÍI]TULO|SUBSE[ÇC]|SE[ÇC]|Art(?:igo)?\.?\s)/i.test(l);

  // Scan LINHA-A-LINHA (o Planalto quebra "CAPÍTULO\nII-A" e nomes em várias linhas ALL CAPS,
  // intercalando linhas só com "\r"). Guardo o offset de cada linha para posicionar heads/corte.
  const linhas = texto.split("\n");
  const off = new Array(linhas.length);
  for (let i = 0, acc = 0; i < linhas.length; i++) { off[i] = acc; acc += linhas[i].length + 1; }
  const heads = [];
  for (let i = 0; i < linhas.length; i++) {
    const mk = linhas[i].match(reKw);
    if (!mk) continue;
    const kw = semAcento(mk[1]);
    const nivel = NIV[kw];
    if (!nivel) continue;
    // Número: no resto desta linha ou na PRÓXIMA linha não vazia (quebra "CAPÍTULO"⏎"II-A").
    let numero = null, jNum = i, resto = (mk[2] || "").trim();
    let mn = resto.match(reNum);
    if (mn) numero = mn[0];
    else {
      for (let k = i + 1; k < linhas.length && k <= i + 3; k++) {
        const t = linhas[k].trim();
        if (!t) continue;
        mn = t.match(reNum);
        if (mn) { numero = mn[0]; jNum = k; resto = t; }
        break;
      }
    }
    if (!numero) continue;
    // Título: resto da linha do número após ele ("CAPÍTULO II - DOS CRIMES"), OU as linhas
    // seguintes em CAIXA ALTA (o nome pode quebrar em várias); pula linhas em branco e notas "(…)".
    let titulo = resto.slice(resto.indexOf(numero) + numero.length).replace(/^\s*[-–—:.]\s*/, "").trim();
    if (!titulo) {
      const partes = [];
      for (let k = jNum + 1; k < linhas.length && k <= jNum + 10; k++) {
        const t = linhas[k].trim();
        if (!t) continue;
        if (/^\(/.test(t)) { if (partes.length) break; else continue; } // nota antes do nome: pula; depois: encerra
        if (ehParada(t)) break;
        const temMinuscula = /[a-zà-ÿ]/.test(t);
        if (!partes.length) { partes.push(t); if (temMinuscula) break; } // nome de 1 linha (misto) ou início ALL CAPS
        else { if (temMinuscula) break; partes.push(t); } // continua só enquanto CAIXA ALTA
      }
      titulo = partes.join(" ");
    }
    heads.push({ idx: off[i], nivel, rotulo: `${NOME[kw]} ${numeroBonito(numero)}`.trim(), titulo: bonito(titulo) });
  }
  const snaps = [];
  const cur = {};
  for (const h of heads) {
    for (const k of Object.keys(cur)) if (+k >= h.nivel) delete cur[k];
    cur[h.nivel] = { nivel: h.nivel, rotulo: h.rotulo, titulo: h.titulo };
    snaps.push({ idx: h.idx, path: Object.keys(cur).map(Number).sort((a, b) => a - b).map((k) => cur[k]) });
  }
  return { heads, snaps };
}

// Parseia o HTML de uma lei (Planalto) → { norma, artigos:[{referencia, texto, revogado, estrutura}] }.
// Rastreia o tachado (strike) por caractere para marcar o revogado com precisão.
export function parsearLeiHTML(html, opts = {}) {
  if (typeof DOMParser === "undefined") return { norma: opts.norma || null, artigos: [] };
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const body = doc.body;
  if (!body) return { norma: opts.norma || null, artigos: [] };
  // Norma: explícita > URL do catálogo (ex.: del2848compilado → "CP" → "Código Penal") > detecção no texto.
  const doCatalogo = opts.url ? CATALOGO_LEIS.find((c) => c.url === opts.url) : null;
  const norma = opts.norma || (doCatalogo && doCatalogo.nome) || detectarNormaTexto(body.textContent) || null;

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
    let el = n.parentElement, s = false, skip = false;
    while (el && el !== body) {
      const tag = el.tagName ? el.tagName.toLowerCase() : "";
      // Links (<a>): remove SÓ se for marcador editorial (Vigência/"(Redação dada…)" etc.). Um <a>
      // pode ser referência cruzada da PRÓPRIA lei (ex.: "arts. 142 e 144 da CF") — essa fica.
      if (tag === "a") { if (MARCA_EDIT.test((el.textContent || "").trim())) skip = true; break; }
      if (tag === "strike" || tag === "s" || tag === "del") { s = true; break; }
      const stl = el.getAttribute ? el.getAttribute("style") || "" : "";
      if (/line-through/i.test(stl)) { s = true; break; }
      el = el.parentElement;
    }
    if (skip) continue;
    for (let i = 0; i < raw.length; i++) { texto += raw[i]; struck.push(s); }
  }

  return parsearLeiTexto(texto, struck, norma);
}

// NOME JURÍDICO / tipo penal (rubrica marginal ANTES do "Art. N": "Homicídio simples", "Anterioridade
// da Lei"…). Varre a região entre o artigo anterior e este, de trás pra frente: pula notas/dispositivos,
// para num cabeçalho de estrutura, e devolve a 1ª linha curta sem pontuação (a rubrica). "" se não houver.
function extrairRubrica(texto, struck, from, to) {
  let reg = "";
  for (let k = from; k < to; k++) if (!struck[k]) reg += texto[k];
  const marcador = /^(§|Parágrafo|Pena|Multa|Art|Vig|Vide|Reda|\(|[IVXLCDM]{1,4}\s*[-–]|[a-z]\)|\d)/i;
  const kwEstru = /^(LIVRO|PARTE|T[ÍI]TULO|CAP[ÍI]TULO|SUBSE[ÇC]|SE[ÇC])\b/;
  const linhas = reg.split("\n").map((s) => s.trim()).filter(Boolean);
  for (let j = linhas.length - 1; j >= 0; j--) {
    const t = linhas[j];
    if (marcador.test(t)) continue;                 // nota "(Redação…)"/dispositivo → ignora
    if (kwEstru.test(t)) return "";                  // cabeçalho de estrutura → não há rubrica
    if (t.length > 60 || t.split(/\s+/).length > 9) return ""; // linha longa = corpo, não rubrica
    if (!/[a-zà-ÿ]{3,}/.test(t)) continue;           // número solto/romano → ignora
    if (/[.;:]/.test(t)) return "";                  // pontuação forte = frase do corpo → sem rubrica
    return t.replace(/\s+/g, " ");                    // rubrica encontrada
  }
  return "";
}

// Núcleo PURO (sem DOM): recebe o texto linear + a máscara de "tachado" por caractere e devolve
// os artigos com a estrutura. Separado do DOM para ser testável fora do browser.
export function parsearLeiTexto(texto, struck, norma = null) {
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

  // Estrutura hierárquica: cada artigo herda a trilha (Livro/…/Seção) vigente na sua posição.
  const estrut = detectarEstrutura(texto);
  const estruturaEm = (idx) => {
    if (idx >= adctIdx) return []; // ADCT recomeça — a estrutura do corpo principal não vale ali
    let best = null;
    for (const s of estrut.snaps) { if (s.idx <= idx) best = s; else break; }
    return best ? best.path : [];
  };

  // Coleta candidatos e mantém, por referência, o de MAIOR texto vivo (a entrada do índice é
  // curta/vazia; o artigo real é o mais longo) — resolve o falso "(revogado)" de artigos válidos.
  const porRef = new Map();
  for (let i = 0; i < marks.length; i++) {
    const ini = marks[i].idx;
    let fim = i + 1 < marks.length ? marks[i + 1].idx : texto.length;
    // Corta o corpo no PRIMEIRO cabeçalho de estrutura depois do artigo (antes, o
    // "CAPÍTULO II / DOS CRIMES…" grudava no fim do texto deste artigo).
    for (const h of estrut.heads) if (h.idx > ini && h.idx < fim) { fim = h.idx; break; }
    if (fim - ini < 8) continue;
    // Texto do artigo = SÓ o NÃO-riscado (a versão vigente; descarta a redação antiga/revogada).
    let vivo = "";
    for (let k = ini; k < fim; k++) if (!struck[k]) vivo += texto[k];
    const corpo = corrigirOrfaos(limparCorpo(limparRubricas(vivo)));
    const semRef = corpo.replace(/^Art\.?\s*\d+\s*[ºo°]?(?:\s*[-–]\s*[A-Z])?\.?\s*/i, "").trim();
    const revogado = semRef.length < 6 || (/\(\s*revogad/i.test(texto.slice(ini, fim)) && semRef.length < 30);
    const ord = /^[1-9]$/.test(marks[i].num) ? "º" : "";
    const norm2 = marks[i].idx >= adctIdx ? "ADCT" : norma;
    const ref = `Art. ${marks[i].num}${ord}${marks[i].letra ? "-" + marks[i].letra : ""}${norm2 ? ", " + norm2 : ""}`;
    const nomeJuridico = extrairRubrica(texto, struck, i > 0 ? marks[i - 1].idx : 0, ini);
    const cand = { referencia: ref, texto: corpo || "(revogado)", revogado, estrutura: estruturaEm(marks[i].idx), nomeJuridico, _len: semRef.length, _ord: i };
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
// Usa o plugin-http do TAURI v2 (fetch → Response). A URL precisa estar na allowlist da
// capability http:default (planalto.gov.br). O Planalto é ISO-8859-1 → decodifica pelo charset.
export async function buscarLeiPlanalto(url) {
  const temTauri = typeof window !== "undefined" && (window.__TAURI_INTERNALS__ || window.__TAURI__);
  if (!temTauri) {
    const e = new Error("A busca direta no Planalto só funciona no app desktop. Cole o texto da lei aqui.");
    e.code = "SEM_DESKTOP";
    throw e;
  }
  // fetch do plugin-http (Tauri v2); fallback ao global antigo se existir.
  let fetchTauri;
  try { fetchTauri = (await import("@tauri-apps/plugin-http")).fetch; }
  catch { fetchTauri = window.__TAURI__?.http?.fetch; }
  if (!fetchTauri) { const e = new Error("A busca direta no Planalto só funciona no app desktop. Cole o texto da lei aqui."); e.code = "SEM_DESKTOP"; throw e; }

  let res;
  try {
    res = await fetchTauri(url, { method: "GET", headers: { "User-Agent": "Mozilla/5.0" } });
  } catch (err) {
    const e = new Error("Não consegui acessar o site do Planalto (sem internet ou o link mudou). Você pode colar o texto da lei.");
    e.code = "REDE"; e.cause = err;
    throw e;
  }
  if (res && res.ok === false) { const e = new Error(`O site do Planalto respondeu ${res.status}. Confira o link ou cole o texto.`); e.code = "HTTP"; throw e; }
  // Decodifica pelo charset (Planalto = ISO-8859-1/windows-1252; leis novas às vezes UTF-8).
  const buf = new Uint8Array(await res.arrayBuffer());
  let charset = ((res.headers?.get && res.headers.get("content-type")) || "").match(/charset=([\w-]+)/i)?.[1];
  if (!charset) charset = new TextDecoder("latin1").decode(buf.slice(0, 4096)).match(/charset=["']?\s*([\w-]+)/i)?.[1];
  charset = (charset || "windows-1252").toLowerCase();
  if (charset === "iso-8859-1") charset = "windows-1252";
  let html = "";
  try { html = new TextDecoder(charset).decode(buf); } catch { html = new TextDecoder("windows-1252").decode(buf); }
  if (!html.trim()) { const e = new Error("Recebi uma página vazia do Planalto. Confira o link."); e.code = "VAZIO"; throw e; }
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
