// Detector DETERMINÍSTICO da estrutura de um material (apostila/PDF), sem IA — base da
// extração por blocos (tópico → subtópico → conteúdo), ancorada às páginas.
//
// Sinais (em ordem de força), combinados por triangulação:
//   1) Índice/Sumário embutido (títulos numerados + páginas de início);
//   2) Marcadores do PDF (outline) — resolvidos em pdf.js e passados aqui já como {titulo, pagina};
//   3) Tag de seção da plataforma na própria página (ex.: "?topic=1.2") — precisão por página;
//   4) Títulos numerados no conteúdo (1.1, 3.2.1, 12) ...).
// Escala para PDFs gigantes porque NÃO manda o conteúdo para a IA — só lê o texto local.

// "1.2)" / "3.1)" / "12)" no começo da linha (com o parêntese de fechamento).
const RE_ENTRADA_INDICE = /^(\d+(?:\.\d+)*)\)\s*(.*)$/;
// Título numerado no CORPO: "1.2 Princípios..." ou "1.2) ..." ou "12) ..." (paren opcional no corpo).
const RE_TITULO_CORPO = /^(\d+(?:\.\d+)*)\)?\s+(\S.*)$/;
const RE_SO_NUMERO = /^(\d{1,4})$/; // número de página solto (no Índice)
const RE_PONTILHADO = /^[.…·∙•\-\s_]+$/; // linha de "leaders" (.....) do índice
const RE_TOPIC_TAG = /[?&]topic=(\d+(?:\.\d+)*)/i; // tag de seção da plataforma na página
// Marcador "#04 – Título" / "#12) Título" (numeração de seção de alguns cursinhos, no corpo).
const RE_MARCADOR_HASH = /^#\s*(\d{1,3})\s*[–\-)]\s+(\S.*)$/;

// Acha a página do Índice/Sumário (a palavra aparece isolada ou no topo da página).
function acharPaginaIndice(paginas) {
  for (const p of paginas) {
    const ini = (p.texto || "").slice(0, 600);
    if (/(^|\n)\s*(índice|indice|sumário|sumario)\s*(\n|$)/i.test(ini) || /\b(índice|sumário)\b/i.test(ini)) return p;
  }
  return null;
}

// Acha o número da página que parece ser o SUMÁRIO/ÍNDICE (para a IA lê-la por imagem).
// Busca só nas primeiras páginas (o sumário fica no começo) para não pegar "índice" no corpo.
export function acharPaginaSumario(paginas) {
  const ini = (paginas || []).slice(0, 15);
  for (const p of ini) {
    const cab = (p.texto || "").slice(0, 700);
    if (/(^|\n|\s)(índice|indice|sumário|sumario)(\s|\n|$)/i.test(cab) || /conteúdo\s+program/i.test(cab)) return p.n;
  }
  return null;
}

// Classifica o TIPO do bloco pelo título e extrai a banca/subtópico de blocos de questões.
// Ex.: "14) Questões Comentadas - Substantivo - Vunesp" → {tipo:"questoes", banca:"Vunesp", assunto:"Substantivo"}
export function classificarTitulo(titulo) {
  const t = String(titulo || "").trim();
  const low = t.toLowerCase();
  let tipo = "teoria";
  if (/quest(ões|oes)\s+coment|lista[s]?\s+de\s+quest|quest(ões|oes)\b/i.test(low)) tipo = "questoes";
  else if (/jurisprud/i.test(low)) tipo = "jurisprudencia";
  else if (/lei\s*seca|legisla(ção|cao)\s+comentada/i.test(low)) tipo = "leiseca";
  else if (/^resumo\b|esquema|mapa\s+mental|tabela[s]?\b/i.test(low)) tipo = "resumo";
  // banca/assunto a partir de "... - Assunto - Banca" (comum em "Questões Comentadas - X - Vunesp")
  let banca = null, assunto = null;
  if (tipo === "questoes") {
    const partes = t.split(/\s[-–]\s/).map((s) => s.trim()).filter(Boolean);
    if (partes.length >= 3) { banca = partes[partes.length - 1]; assunto = partes.slice(1, -1).join(" - "); }
    else if (partes.length === 2) { banca = partes[1]; }
  }
  return { tipo, banca, assunto };
}

// Parseia a página do Índice/Sumário em { entradas:[{numero,titulo,pagina}], indicePag }.
// Robusto a 2 layouts: (1) números de página ANTES de todas as entradas; (2) "N) Título … pág"
// (número logo após cada título, com pontilhado).
export function parseIndice(paginas, numPaginas) {
  const pag = acharPaginaIndice(paginas);
  if (!pag) return { entradas: [], indicePag: null };
  const linhas = (pag.texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const seq = []; // sequência de tokens em ordem: {t:'E',numero,titulo} | {t:'N',n}
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (RE_PONTILHADO.test(l)) continue;
    if (/^(índice|indice|sumário|sumario)$/i.test(l)) continue;
    const mE = l.match(RE_ENTRADA_INDICE);
    if (mE) {
      let titulo = (mE[2] || "").trim();
      let j = i + 1;
      while (!titulo && j < linhas.length) {
        const nxt = linhas[j];
        if (RE_PONTILHADO.test(nxt) || RE_SO_NUMERO.test(nxt) || /^(índice|sumário)$/i.test(nxt)) { j++; continue; }
        if (RE_ENTRADA_INDICE.test(nxt)) break;
        titulo = nxt.trim();
        i = j;
        break;
      }
      seq.push({ t: "E", numero: mE[1], titulo: (titulo || "").replace(/^[\s–\-]+/, "").trim() });
      continue;
    }
    if (RE_SO_NUMERO.test(l)) {
      const n = parseInt(l, 10);
      if (n >= 1 && (!numPaginas || n <= numPaginas)) seq.push({ t: "N", n });
    }
  }
  const entradas = seq.filter((x) => x.t === "E").map((x) => ({ numero: x.numero, titulo: x.titulo }));
  if (!entradas.length) return { entradas: [], indicePag: pag.n };
  const nums = seq.filter((x) => x.t === "N");
  const idxFirstE = seq.findIndex((x) => x.t === "E");
  let idxLastN = -1;
  for (let k = seq.length - 1; k >= 0; k--) if (seq[k].t === "N") { idxLastN = k; break; }

  if (idxLastN >= 0 && idxLastN < idxFirstE) {
    // Layout 1: todos os números ANTES das entradas → pareia por ordem.
    const crescente = nums.every((x, k) => k === 0 || x.n >= nums[k - 1].n);
    if (nums.length === entradas.length && crescente) entradas.forEach((e, k) => (e.pagina = nums[k].n));
  } else {
    // Layout 2 (intercalado): para cada entrada, o número que vem logo depois (antes da próxima entrada).
    let ei = 0;
    for (let k = 0; k < seq.length; k++) {
      if (seq[k].t !== "E") continue;
      for (let m = k + 1; m < seq.length && seq[m].t !== "E"; m++) {
        if (seq[m].t === "N") { entradas[ei].pagina = seq[m].n; break; }
      }
      ei++;
    }
    // valida: maioria com página e não-decrescente; senão descarta (usa título no corpo).
    const pgs = entradas.map((e) => e.pagina).filter((x) => x != null);
    const ok = pgs.length >= Math.ceil(entradas.length * 0.6) && pgs.every((p, k) => k === 0 || p >= pgs[k - 1]);
    if (!ok) entradas.forEach((e) => delete e.pagina);
  }
  return { entradas, indicePag: pag.n };
}

// Mapa página → seção a partir da tag "?topic=X.Y" presente em cada página (quando houver).
export function mapaTopicTag(paginas) {
  const mapa = {}; // numeroSecao -> {ini, fim}
  for (const p of paginas) {
    const m = (p.texto || "").match(RE_TOPIC_TAG);
    if (!m) continue;
    const sec = m[1];
    if (!mapa[sec]) mapa[sec] = { ini: p.n, fim: p.n };
    else { mapa[sec].ini = Math.min(mapa[sec].ini, p.n); mapa[sec].fim = Math.max(mapa[sec].fim, p.n); }
  }
  return mapa;
}

// Acha, no CORPO, a página onde um título numerado aparece (para confirmar/achar o início).
// Ignora a página do Índice (lá todos os títulos aparecem, daria falso positivo).
function paginaDoTitulo(paginas, numero, titulo, indicePag) {
  const alvoNum = numero;
  const tituloNorm = String(titulo || "").toLowerCase().slice(0, 30);
  for (const p of paginas) {
    if (indicePag && p.n === indicePag) continue;
    const linhas = (p.texto || "").split(/\r?\n/).map((l) => l.trim());
    for (const l of linhas) {
      const m = l.match(RE_TITULO_CORPO);
      if (m && m[1] === alvoNum) {
        // confere que o texto após o número bate com o título do índice (evita falso positivo)
        if (!tituloNorm || m[2].toLowerCase().includes(tituloNorm.slice(0, 12)) || tituloNorm.includes(m[2].toLowerCase().slice(0, 12))) return p.n;
      }
    }
  }
  return null;
}

// FALLBACK 1 — títulos NUMERADOS no corpo (PDF sem página de Índice, mas com seções "1.2 Título").
// Conservador: título curto, começa com maiúscula, sem pontuação final; exige ≥3 seções.
export function detectarPorNumeracao(paginas, indicePag) {
  const entradas = [];
  const vistos = new Set();
  for (const p of paginas) {
    if (indicePag && p.n === indicePag) continue;
    const linhas = (p.texto || "").split(/\r?\n/).map((l) => l.trim());
    for (const l of linhas) {
      const m = l.match(/^(\d+(?:\.\d+){0,2})\)?\s+([A-ZÀ-Úa-zà-ú].{2,68})$/);
      if (!m) continue;
      const num = m[1];
      const titulo = m[2].trim();
      if (vistos.has(num)) continue;
      if (/[.;:,]$/.test(titulo)) continue; // parece frase, não título
      vistos.add(num);
      entradas.push({ numero: num, titulo, pagina: p.n, nivel: (num.match(/\./g) || []).length + 1 });
    }
  }
  return entradas.length >= 3 ? entradas : [];
}

// FALLBACK 1b — títulos por MARCADOR "#NN –" (cursinhos que numeram seções com "#04 – Tema").
// Conservador: exige ≥3 marcadores distintos; título de tamanho de linha (não parágrafo).
export function detectarPorMarcador(paginas, indicePag) {
  const entradas = [];
  const vistos = new Set();
  for (const p of paginas) {
    if (indicePag && p.n === indicePag) continue;
    const linhas = (p.texto || "").split(/\r?\n/).map((l) => l.trim());
    for (const l of linhas) {
      const m = l.match(RE_MARCADOR_HASH);
      if (!m) continue;
      const num = m[1];
      const titulo = m[2].trim();
      if (vistos.has(num)) continue;
      if (titulo.length < 3 || titulo.length > 90) continue;
      vistos.add(num);
      entradas.push({ numero: num, titulo, pagina: p.n, nivel: 1 });
    }
  }
  return entradas.length >= 3 ? entradas : [];
}

// FALLBACK 2 — títulos por TAMANHO DE FONTE (PDF sem Índice nem numeração). Usa linhasPorPagina
// (com fontSize/bold) do pdf.js. Corpo = fonte mais comum (ponderada por chars); títulos = fonte
// maior/negrito, linha curta e não repetida (ignora cabeçalho/rodapé). Nível por faixa de tamanho.
export function detectarPorFonte(linhasPorPagina, numPaginas, indicePag) {
  if (!Array.isArray(linhasPorPagina) || !linhasPorPagina.length) return [];
  const hist = {}, cont = {};
  let charsTotal = 0, charsBold = 0;
  for (const pg of linhasPorPagina)
    for (const l of pg.linhas || []) {
      if (!l.texto) continue;
      const fs = Math.round(l.fontSize || 0);
      if (fs > 0) hist[fs] = (hist[fs] || 0) + l.texto.length;
      cont[l.texto] = (cont[l.texto] || 0) + 1;
      charsTotal += l.texto.length;
      if (l.bold) charsBold += l.texto.length;
    }
  const ent = Object.entries(hist).sort((a, b) => b[1] - a[1]);
  if (!ent.length) return [];
  const bodyFs = parseInt(ent[0][0], 10);
  // Se o documento é MAJORITARIAMENTE negrito (ex.: apostila MEGE 96% Calibri-Bold), o negrito
  // deixa de discriminar título de corpo → usamos SÓ o tamanho de fonte. Caso normal: negrito ainda
  // vale como sinal secundário (título curto um pouco maior e em negrito).
  const negritoDominante = charsTotal > 0 && charsBold / charsTotal > 0.5;
  const limiteRep = Math.max(3, Math.round(linhasPorPagina.length * 0.4));
  const headings = [];
  for (const pg of linhasPorPagina) {
    if (indicePag && pg.n === indicePag) continue;
    for (const l of pg.linhas || []) {
      const t = (l.texto || "").trim();
      if (t.length < 3 || t.length > 90) continue;
      if ((cont[t] || 0) >= limiteRep) continue; // repetida = cabeçalho/rodapé
      const fs = l.fontSize || 0;
      const ehTitulo = negritoDominante
        ? fs >= bodyFs * 1.15                                       // só tamanho (negrito não discrimina)
        : fs >= bodyFs * 1.18 || (l.bold && fs >= bodyFs * 1.02 && t.length <= 60);
      if (ehTitulo) headings.push({ titulo: t, pagina: pg.n, fontSize: Math.round(fs * 10) / 10 });
    }
  }
  if (headings.length < 2) return [];
  const tams = [...new Set(headings.map((h) => Math.round(h.fontSize)))].sort((a, b) => b - a).slice(0, 3);
  const nivelDe = (fs) => { const i = tams.indexOf(Math.round(fs)); return i >= 0 ? i + 1 : 1; };
  return headings.map((h, k) => ({ numero: String(k + 1), titulo: h.titulo, pagina: h.pagina, nivel: nivelDe(h.fontSize) }));
}

// Chave de casamento robusta a texto colado/acentos: "1. Teoria da Constituição" e
// "1.TeoriadaConstituição" viram a mesma chave "teoriadaconstituicao".
function chaveCasamento(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Acha a 1ª página do CORPO (após o sumário) cujo texto contém o início do título. Casa por
// prefixo da chave normalizada (tolera palavras coladas do pdf.js e leaders do sumário).
function paginaDoTituloTexto(paginas, titulo, aPartirDe) {
  const alvo = chaveCasamento(titulo).slice(0, 24);
  if (alvo.length < 6) return null; // curto demais → casamento não confiável
  for (const p of paginas) {
    if (aPartirDe && p.n <= aPartirDe) continue;
    if (chaveCasamento(p.texto).includes(alvo)) return p.n;
  }
  return null;
}

// F2 — monta a estrutura a partir da ÁRVORE DE TÓPICOS lida pela IA no sumário.
// topicos: [{numero, titulo, nivel, paginaImpressa}]. Mapeia cada título à página FÍSICA do corpo
// (1ª ocorrência); onde não achar, usa o número impresso corrigido pelo offset mediano observado.
export function montarEstruturaDeTopicos(topicos, { paginas, numPaginas, sumarioPag, aulaTitulo } = {}) {
  paginas = paginas || [];
  numPaginas = numPaginas || paginas.length || 0;
  const tops = (topicos || []).filter((t) => t && t.titulo && t.titulo.trim().length >= 2);
  if (!tops.length) return { aulaTitulo, origem: null, blocos: [] };

  // 1) casa cada título ao corpo pelo texto, EM ORDEM (monotônico): o sumário está em ordem de
  // leitura, então cada tópico só é procurado a partir da página do anterior — evita que um nome
  // curto/comum ("Direito Penal") case cedo demais. Guarda offset (físico − impresso) dos que casaram.
  const offsets = [];
  let piso = sumarioPag || 0;
  const casados = tops.map((t) => {
    const pTexto = paginaDoTituloTexto(paginas, t.titulo, piso);
    if (pTexto != null) { if (t.paginaImpressa != null) offsets.push(pTexto - t.paginaImpressa); piso = pTexto; }
    return { ...t, pTexto };
  });
  offsets.sort((a, b) => a - b);
  const offset = offsets.length ? offsets[Math.floor(offsets.length / 2)] : null; // mediano

  // 2) resolve pIni: texto do corpo > página impressa + offset; confiança conforme a fonte.
  const blocos = casados.map((t, k) => {
    let pIni = null, conf;
    if (t.pTexto != null) { pIni = t.pTexto; conf = 0.95; }
    else if (t.paginaImpressa != null && offset != null) {
      pIni = Math.min(numPaginas || t.paginaImpressa, Math.max(1, t.paginaImpressa + offset)); conf = 0.7;
    } else conf = 0.4;
    const cls = classificarTitulo(t.titulo);
    const nivel = t.nivel || (String(t.numero || "").match(/\./g) || []).length + 1;
    return { numero: String(t.numero || String(k + 1)), titulo: t.titulo.trim(), ...cls, nivel, pIni, pFim: null, confianca: conf };
  });

  // 3) pFim encadeado por pIni.
  const comPag = blocos.filter((b) => b.pIni != null).sort((a, b) => a.pIni - b.pIni);
  for (let i = 0; i < comPag.length; i++) {
    comPag[i].pFim = i + 1 < comPag.length ? Math.max(comPag[i].pIni, comPag[i + 1].pIni - 1) : numPaginas || comPag[i].pIni;
  }
  return { aulaTitulo: aulaTitulo || inferirTituloAula(paginas), origem: "ia-sumario", blocos };
}

// DETECTA a estrutura: devolve { aulaTitulo, origem, blocos:[{numero,titulo,tipo,banca,assunto,nivel,pIni,pFim,confianca}] }.
// `outline` (opcional) = [{titulo, pagina}] de pdf.getOutline(); `linhasPorPagina` = fonte por linha (fallback).
export function detectarEstrutura({ paginas, outline, numPaginas, linhasPorPagina } = {}) {
  paginas = paginas || [];
  numPaginas = numPaginas || paginas.length || 0;
  const aulaTitulo = inferirTituloAula(paginas);
  const tags = mapaTopicTag(paginas);
  const temTag = Object.keys(tags).length > 0;

  // Fonte primária: Índice/Sumário. Fallbacks (PDF sem Índice): outline → numeração → fonte.
  let { entradas, indicePag } = parseIndice(paginas, numPaginas);
  let origem = entradas.length ? "indice" : null;
  if (!entradas.length && Array.isArray(outline) && outline.length) {
    entradas = outline.map((o, k) => ({ numero: String(k + 1), titulo: o.titulo, pagina: o.pagina }));
    origem = "outline";
  }
  if (!entradas.length) {
    const numeradas = detectarPorNumeracao(paginas, indicePag);
    if (numeradas.length) { entradas = numeradas; origem = "numeracao"; }
  }
  if (!entradas.length) {
    const marcadas = detectarPorMarcador(paginas, indicePag);
    if (marcadas.length) { entradas = marcadas; origem = "marcador"; }
  }
  if (!entradas.length) {
    const porFonte = detectarPorFonte(linhasPorPagina, numPaginas, indicePag);
    if (porFonte.length) { entradas = porFonte; origem = "fonte"; }
  }
  if (!entradas.length) return { aulaTitulo, origem: null, blocos: [] };

  // Confiança menor para fallbacks (mais incertos → o usuário confirma na F3).
  const tetoConf = origem === "fonte" ? 0.55 : origem === "numeracao" ? 0.72 : origem === "marcador" ? 0.82 : 0.99;

  // Resolve a página de início de cada entrada: tag > índice > título no corpo.
  const blocos = entradas.map((e) => {
    let pIni = null, conf = 0.5;
    if (temTag && tags[e.numero]) { pIni = tags[e.numero].ini; conf = 0.98; }
    else if (e.pagina) { pIni = e.pagina; conf = 0.8; }
    const pCorpo = paginaDoTitulo(paginas, e.numero, e.titulo, indicePag);
    if (pCorpo) {
      if (pIni == null) { pIni = pCorpo; conf = 0.7; }
      else if (Math.abs(pCorpo - pIni) <= 1) conf = Math.min(0.99, conf + 0.15); // bateu → confiança alta
    }
    const cls = classificarTitulo(e.titulo);
    const nivel = e.nivel || (e.numero.match(/\./g) || []).length + 1;
    return { numero: e.numero, titulo: e.titulo, ...cls, nivel, pIni, pFim: null, confianca: pIni != null ? Math.min(conf, tetoConf) : 0.3 };
  });

  // Calcula pFim: até a página anterior ao próximo bloco (ordenado por pIni).
  const comPag = blocos.filter((b) => b.pIni != null).sort((a, b) => a.pIni - b.pIni);
  for (let i = 0; i < comPag.length; i++) {
    comPag[i].pFim = i + 1 < comPag.length ? Math.max(comPag[i].pIni, comPag[i + 1].pIni - 1) : numPaginas || comPag[i].pIni;
  }
  return { aulaTitulo, origem, blocos };
}

// Título da aula = a linha de destaque das primeiras páginas (ex.: "1. Princípios Administrativos",
// "Aula 01"). Heurística simples: 1ª linha que parece título de aula nas 2 primeiras páginas.
function inferirTituloAula(paginas) {
  const ini = (paginas[0]?.texto || "") + "\n" + (paginas[1]?.texto || "");
  const linhas = ini.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const l of linhas) {
    if (/^aula\s*\d+/i.test(l)) return l;
    if (/^\d+\.\s+\S/.test(l) && l.length <= 80) return l; // "1. Princípios Administrativos"
  }
  return linhas[0] || null;
}
