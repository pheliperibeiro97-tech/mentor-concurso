// Detector DETERMINÍSTICO da estrutura de um material (apostila/PDF), sem IA — base da
// extração por blocos (tópico → subtópico → conteúdo), ancorada às páginas.
//
// Sinais (em ordem de força), combinados por triangulação:
//   1) Índice/Sumário embutido (títulos numerados + páginas de início);
//   2) Marcadores do PDF (outline) — resolvidos em pdf.js e passados aqui já como {titulo, pagina};
//   3) Tag de seção da plataforma na própria página (ex.: "?topic=1.2") — precisão por página;
//   4) Títulos numerados no conteúdo (1.1, 3.2.1, 12) ...).
// Escala para PDFs gigantes porque NÃO manda o conteúdo para a IA — só lê o texto local.

// Limpa RUÍDO de um PDF com texto selecionável (sem IA), POR PÁGINA: remove cabeçalhos/rodapés
// que se repetem em várias páginas, números de página soltos e "Página X / X de Y". PRESERVA a
// ESTRUTURA de páginas (mesma quantidade e ordem) — só altera o texto de cada página — para não
// afetar o vínculo tópico↔página ("págs. 5–8" usa a posição da página, não o número impresso).
// Determinístico (não usa IA, não inventa). Devolve um NOVO array de páginas.
export function limparRuidoDePaginas(paginas) {
  const arr = paginas || [];
  if (arr.length < 2) return arr;
  const norm = (l) => l.trim().toLowerCase().replace(/\s+/g, " ").replace(/\d+/g, "#"); // ignora números (variam por página)
  const freq = {};
  for (const p of arr) {
    const unicas = new Set((p.texto || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 3).map(norm));
    for (const k of unicas) freq[k] = (freq[k] || 0) + 1;
  }
  const corte = Math.max(2, Math.ceil(arr.length * 0.6)); // repete em ≥60% das páginas = cabeçalho/rodapé
  const ehRuido = (linha) => {
    const t = linha.trim();
    if (!t) return false;
    if (/^p[áa]g(\.|ina)?\s*\d+(\s*(de|\/)\s*\d+)?$/i.test(t)) return true; // "Página 3", "pág. 3/28"
    if (/^\d{1,4}$/.test(t)) return true; // número de página solto
    if (/^\d{1,4}\s*\/\s*\d{1,4}$/.test(t)) return true; // "3/28"
    // F1 — marca d'água personalizada: linha "rótulo: valor" de dado pessoal, ou dado solto.
    // Conservador (só rótulo:valor ou CPF/e-mail isolado) → não remove conteúdo em prosa.
    if (t.length <= 90 && /^(cpf|cnpj|telefone|tel|e-?mail|e_?mail|nome|matr[íi]cula|aluno|assinante|login|usu[áa]rio)\s*[:\-]/i.test(t)) return true;
    if (/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(t)) return true; // CPF solto na linha
    if (/^[\w.+-]+@[\w-]+\.[\w.-]{2,}$/.test(t)) return true; // e-mail solto na linha
    return arr.length >= 3 && t.length <= 80 && (freq[norm(t)] || 0) >= corte;
  };
  return arr.map((p) => ({
    ...p,
    texto: (p.texto || "").split(/\r?\n/).filter((l) => !ehRuido(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  }));
}

// Edital de concurso é um documento inteiro: vagas, inscrição, recursos, cronograma, modelos
// de declaração — e, lá no meio, o CONTEÚDO PROGRAMÁTICO, que é a única parte que interessa
// aqui. Importando o PDF do 192º do TJSP inteiro saíam 96 "disciplinas", das quais 73 eram
// seções administrativas ("1. Das Vagas", "Evento Datas", "Declaração"). Recorta do primeiro
// anexo de conteúdo programático até o primeiro anexo que não seja de conteúdo (o cronograma).
// Sem o marcador (o usuário colou só o programa), devolve o texto como veio.
// Só casa o marcador que é um TÍTULO (linha inteira): "ANEXO II - CONTEÚDO PROGRAMÁTICO",
// "DO CONTEÚDO PROGRAMÁTICO". Uma menção no meio de uma cláusula ("conteúdo programático
// constante do Anexo I") não abre o recorte — senão o corte começaria no lugar errado.
const RE_MARCO_PROGRAMA = /^[ \t]*(?:anexo\s+[ivxlcdm]+\s*[-–—:]?\s*)?(?:d[oae]\s+)?conte[úu]do\s+program[áa]tico\s*$/gim;
const RE_ANEXO = /^[ \t]*anexo\s+[ivxlcdm]+\b.*$/gim;
export function recortarConteudoProgramatico(texto) {
  const t = String(texto || "");
  RE_MARCO_PROGRAMA.lastIndex = 0;
  const m = RE_MARCO_PROGRAMA.exec(t);
  if (!m) return { texto: t, recortado: false };
  const ini = m.index;
  // Fim: o próximo "ANEXO ..." depois do início que NÃO seja de conteúdo programático.
  let fim = t.length;
  RE_ANEXO.lastIndex = ini + m[0].length;
  let a;
  while ((a = RE_ANEXO.exec(t))) {
    if (!/conte[úu]do\s+program/i.test(a[0])) { fim = a.index; break; }
  }
  const corte = t.slice(ini, fim).trim();
  // Se o recorte ficar irrisório, é sinal de marcador solto (sumário do próprio edital):
  // devolve o texto inteiro, que é o comportamento antigo e não perde nada.
  if (corte.length < 400) return { texto: t, recortado: false };
  return { texto: corte, recortado: true, de: ini, ate: fim };
}

// Edital com o nome da disciplina IMPRESSO DE LADO (girado 90°) na margem da página: o
// extrator de PDF não sabe da rotação e joga esses rótulos no FIM do bloco da página, depois
// dos itens que eles encabeçam. Medido no edital do 192º do TJSP: a página 69 sai com os
// itens 1-5, 1-4 e 1 e só então "SOCIOLOGIA DO DIREITO / PSICOLOGIA JUDICIÁRIA / ÉTICA E
// ESTATUTO…". Lido de cima para baixo, o separador de edital dava os itens à disciplina
// errada (ou a nenhuma) e inventava disciplinas com nome de fragmento ("(LINDB).").
//
// Conserto: numa página que TERMINA em rótulos em caixa alta, casar os últimos k rótulos com
// as k listas de itens que recomeçam em "1." e mover cada rótulo para antes da sua lista. O
// texto resultante fica na ordem natural, e o separador continua o mesmo. Rótulos sobrando no
// topo (o "ANEXO II", o nome do bloco) ficam onde estão e são descartados por não terem itens.
// Número de item = dígitos, ponto e então ESPAÇO ou fim de linha — nunca outro dígito. Sem o
// `(?!\d)`, a citação legal que abre uma linha de continuação ("5.903/2006, 7.962/2013…") era
// lida como o item 5; isso reiniciava a contagem e o rótulo da disciplina ia parar antes do
// item 2 em vez do 1. Consumidor começava em "(2)", e Criança e Penal perdiam itens do começo.
const RE_ITEM_NUMERADO = /^(\d{1,3})\.(?!\d)\s*(.*)$/;
// Nem toda disciplina numera com arábico: o Direito Penal e o Processual Penal do 192º usam
// ROMANO com travessão ("I – Conceito de Direito Penal", "II – CÓDIGO PENAL"). Sem reconhecer
// essa forma, a página inteira ficava sem nenhum "início de lista", o rótulo não era movido e
// todo o programa de Penal era absorvido pelo último item da disciplina anterior.
const RE_ITEM_ROMANO = /^([IVXLCDM]{1,5})\s*[–—-]\s+\S/;
const VAL_ROMANO = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
function numeroDoItem(linha) {
  const l = (linha || "").trim();
  const ar = l.match(RE_ITEM_NUMERADO);
  if (ar) return parseInt(ar[1], 10);
  const ro = l.match(RE_ITEM_ROMANO);
  if (!ro) return null;
  let total = 0;
  const s = ro[1];
  for (let i = 0; i < s.length; i++) {
    const v = VAL_ROMANO[s[i]], prox = VAL_ROMANO[s[i + 1]] || 0;
    total += v < prox ? -v : v;
  }
  return total || null;
}
function ehRotuloDisciplina(l) {
  const t = (l || "").trim();
  if (t.length < 8 || t.length > 90) return false;
  if (/^\d/.test(t)) return false;
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letras.length < 6) return false;
  return t === t.toUpperCase() && /[A-ZÀ-Ý]/.test(t);
}
export function reordenarRotulosDeEdital(paginas) {
  return (paginas || []).map((p) => {
    const linhas = (p.texto || "").split(/\r?\n/);
    let fim = linhas.length;
    while (fim > 0 && !linhas[fim - 1].trim()) fim--;
    let ini = fim;
    while (ini > 0 && (ehRotuloDisciplina(linhas[ini - 1]) || !linhas[ini - 1].trim())) ini--;
    const rotulos = linhas.slice(ini, fim).map((l) => l.trim()).filter(Boolean);
    if (!rotulos.length) return p;
    // Onde cada lista de itens RECOMEÇA (número 1, ou menor que o anterior).
    const corpo = linhas.slice(0, ini);
    const inicios = [];
    let anterior = 0;
    for (let i = 0; i < corpo.length; i++) {
      const n = numeroDoItem(corpo[i]);
      if (n == null) continue;
      if (n <= anterior || n === 1) inicios.push(i);
      anterior = n;
    }
    if (!inicios.length) return p;
    // Casa de trás para a frente: o último rótulo é da última lista.
    const pares = Math.min(inicios.length, rotulos.length);
    const usados = new Set();
    const saida = corpo.slice();
    for (let k = 0; k < pares; k++) {
      const iLinha = inicios[inicios.length - 1 - k];
      const iRot = rotulos.length - 1 - k;
      usados.add(iRot);
      saida[iLinha] = rotulos[iRot] + "\n" + saida[iLinha];
    }
    const sobra = rotulos.filter((_, i) => !usados.has(i));
    return { ...p, texto: [...sobra, ...saida].join("\n").replace(/\n{3,}/g, "\n\n").trim() };
  });
}

// Entrada de índice. Com PONTO ("1.2", "3.1.2") o parêntese é opcional — metade das
// apostilas escreve o código puro na coluna do índice. Sem ponto ("12") o parêntese é
// OBRIGATÓRIO, senão qualquer linha começada por número viraria entrada (um ano de prova,
// um item de lista).
const RE_ENTRADA_INDICE = /^(?:(\d+(?:\.\d+)+)\)?|(\d+)\))\s*(.*)$/;
// "1. Direito Constitucional": número simples seguido de PONTO. Fora do índice essa forma é
// ambígua demais (item de lista, ano de prova), mas numa linha que traz os pontinhos e a página
// não há o que confundir — e é assim que o material de estatística do cursinho numera as
// disciplinas. Sem isto, um índice perfeito devolvia zero entradas.
const RE_ENTRADA_INDICE_PONTO = /^(\d{1,2})\.\s+(\S.*)$/;
// Página na MESMA linha do título ("... Direito Civil ......... 13"). Os três layouts de
// pareamento abaixo pressupõem o número numa linha só dele — que é como o pdf.js entrega as
// apostilas —, então sem ler daqui a página se perdia e o bloco ia parar na primeira vez em que
// o título aparecesse no corpo (o capítulo da pág. 13 caía na 9).
const RE_PAGINA_NA_LINHA = /\.{2,}\s*(\d{1,4})\s*$/;
function casarEntradaIndice(linha) {
  const s = String(linha || "");
  const mp = s.match(RE_PAGINA_NA_LINHA);
  const pagina = mp ? parseInt(mp[1], 10) : undefined;
  const m = s.match(RE_ENTRADA_INDICE);
  if (m) return { numero: m[1] || m[2], titulo: (m[3] || "").trim(), pagina };
  if (RE_TEM_PONTILHADO.test(s)) {
    const p = s.match(RE_ENTRADA_INDICE_PONTO);
    if (p) return { numero: p[1], titulo: p[2].trim(), pagina };
  }
  return null;
}
// Título numerado no CORPO: "1.2 Princípios..." ou "1.2) ..." ou "12) ..." (paren opcional no corpo).
const RE_TITULO_CORPO = /^(\d+(?:\.\d+)*)\)?\s+(\S.*)$/;
const RE_SO_NUMERO = /^(\d{1,4})$/; // número de página solto (no Índice)
const RE_PONTILHADO = /^[.…·∙•\-\s_]+$/; // linha de "leaders" (.....) do índice
const RE_TOPIC_TAG = /[?&]topic=(\d+(?:\.\d+)*)/i; // tag de seção da plataforma na página
// Marcador "#04 – Título" / "#12) Título" (numeração de seção de alguns cursinhos, no corpo).
const RE_MARCADOR_HASH = /^#\s*(\d{1,3})\s*[–\-)]\s+(\S.*)$/;

// Um sumário se reconhece pela FORMA, não pela palavra. Medido nas 24 apostilas de um
// cursinho de magistratura: em 8 delas a página do índice não traz "Índice" nem "Sumário"
// em lugar nenhum — só a coluna de códigos, a de páginas e os títulos com pontilhado.
// Exigir a palavra deixava um terço da biblioteca sem estrutura (e, pior, matava também o
// caminho por IA, que só é acionado quando esta função acha alguma coisa).
// Quatro sinais, qualquer um bastando: código sozinho na linha, título com pontilhado, par
// código+página ("10.1 3", que é como o pdf.js entrega o índice de duas colunas) e série de
// entradas "código + título" da mesma família em ordem crescente.
const RE_COD_SOZINHO = /^(\d+(?:\.\d+)+)\)?$/; // "10.1" ou "16.1)" sozinhos na linha
const RE_TEM_PONTILHADO = /\.{4,}\s*\d*\s*$/; // "Título ......" (com ou sem página no fim)

const RE_COD_PAGINA = /^(\d+(?:\.\d+)+)\)?\s+(\d{1,4})$/; // "10.1 3" — código e página na mesma linha
function pontuarSumario(p) {
  const linhas = (p.texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let codigos = 0, pontilhados = 0, codPagina = 0;
  const inline = []; // "16.1) Considerações Iniciais" — código + TÍTULO na mesma linha
  for (const l of linhas) {
    if (RE_COD_SOZINHO.test(l)) { codigos++; continue; }
    const cp = l.match(RE_COD_PAGINA);
    if (cp) { codPagina++; continue; }
    if (RE_TEM_PONTILHADO.test(l)) { pontilhados++; continue; }
    const ent = casarEntradaIndice(l);
    if (ent && ent.numero.includes(".") && ent.titulo.length >= 3) inline.push(ent.numero);
  }
  // Entrada inline sozinha não vale nada (o CORPO começa com "9.1 Introdução"); o que denuncia
  // um índice é uma SÉRIE delas, da mesma família e em ordem. Foi o que separou a página de
  // índice do Consumidor (17 entradas "16.N) Título") da página de corpo do Penal Especial.
  const porPrefixo = new Map();
  for (const n of inline) {
    const pre = n.split(".")[0];
    if (!porPrefixo.has(pre)) porPrefixo.set(pre, []);
    porPrefixo.get(pre).push(parseInt(n.split(".").pop(), 10));
  }
  let serie = 0;
  for (const suf of porPrefixo.values()) {
    if (suf.length > serie && suf.every((v, i) => i === 0 || v > suf[i - 1])) serie = suf.length;
  }
  const palavra = /(^|\n|\s)(índice|indice|sumário|sumario)(\s|\n|$)/i.test((p.texto || "").slice(0, 700))
    || /conteúdo\s+program/i.test((p.texto || "").slice(0, 700));
  // Pela FORMA: qualquer um dos sinais fortes basta, mesmo sem a palavra "Índice" na página
  // (metade das apostilas não a tem). Com a palavra, um único sinal já serve — é o caso da
  // apostila curta, de uma aula só, cujo índice tem uma linha.
  const fortes = codigos >= 3 || pontilhados >= 3 || codPagina >= 3 || serie >= 4;
  const ehSumario = fortes || (palavra && codigos + pontilhados + codPagina + inline.length >= 1);
  return { ehSumario, codigos, pontilhados, codPagina, serie, palavra };
}

// Todas as páginas de sumário, em sequência: o índice costuma ocupar 1, mas às vezes 2 ou 3
// (Processual Civil tem 47 aulas em duas páginas — ler só a primeira perdia 23).
export function paginasDeSumario(paginas) {
  const ini = (paginas || []).slice(0, 15);
  const achadas = [];
  for (const p of ini) {
    const s = pontuarSumario(p);
    if (s.ehSumario) achadas.push(p);
    else if (achadas.length) break; // acabou a sequência do índice
  }
  return achadas;
}

// Primeira página do sumário (para a IA lê-la por imagem). Mantida com o nome antigo porque
// `estruturarPorSumarioIA` depende dela.
export function acharPaginaSumario(paginas) {
  const pgs = paginasDeSumario(paginas);
  return pgs.length ? pgs[0].n : null;
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

// Parseia o Índice/Sumário em { entradas:[{numero,titulo,pagina}], indicePag }.
// Cada página do índice é lida SOZINHA e as entradas são concatenadas — assim um índice de
// duas ou três páginas não perde o resto (o Processual Civil tem 47 aulas em 2 páginas).
export function parseIndice(paginas, numPaginas) {
  const pgsIndice = paginasDeSumario(paginas);
  if (!pgsIndice.length) return { entradas: [], indicePag: null };
  const entradas = [];
  const vistos = new Set();
  for (const pg of pgsIndice) {
    for (const e of parsePaginaIndice(pg, numPaginas)) {
      // Um índice não lista o mesmo código duas vezes. Quando a página seguinte à do índice já
      // é o CORPO (que abre com "7.1 Apresentação"), ela pontua como índice e repetiria as
      // primeiras entradas — sem página, no fim da lista. Vale a primeira ocorrência.
      if (vistos.has(e.numero)) continue;
      vistos.add(e.numero);
      entradas.push(e);
    }
  }
  // `indicePag` é o PISO para procurar os títulos no corpo: a última página do índice.
  // `indicePags` são TODAS as páginas do índice — apostila grande espalha o índice por 2-3
  // páginas, e pular só a última faz um título ser "achado no corpo" numa página de índice
  // anterior (o Processual Civil, com índice nas págs. 2-3, ancorava tudo na 3).
  return { entradas, indicePag: pgsIndice[pgsIndice.length - 1].n, indicePags: pgsIndice.map((p) => p.n) };
}

// Apostila de cursinho → AULAS, sem IA nenhuma. Cada item do sumário é uma aula: em
// "19.1 Microssistema Coletivo", 19 é a disciplina e 1 é o número da aula. Devolve no formato
// que parseAulas/importarAulasCursinho já consomem: [{nome, topicos, disciplina}].
// `pagina` vai junto (a faixa do índice) para quem quiser mostrar de onde veio.
export function aulasDoSumario(paginas, { disciplina, numPaginas } = {}) {
  const { entradas } = parseIndice(paginas, numPaginas || 0);
  const aulas = [];
  for (let k = 0; k < entradas.length; k++) {
    const e = entradas[k];
    const titulo = (e.titulo || "").trim();
    if (!titulo || !e.numero.includes(".")) continue; // "19" sozinho é a disciplina, não uma aula
    const sufixo = parseInt(e.numero.split(".").pop(), 10);
    const n = Number.isFinite(sufixo) ? sufixo : aulas.length + 1;
    aulas.push({
      nome: `Aula ${String(n).padStart(2, "0")}`,
      topicos: [titulo],
      disciplina: disciplina || null,
      pagina: e.pagina ?? null,
    });
  }
  return aulas;
}

// "10. Direito Ambiental.pdf" → "Direito Ambiental". É como o cursinho nomeia os arquivos, e
// é a única pista de disciplina que existe fora do conteúdo. Campo fica editável no preview.
export function disciplinaDoNomeDeArquivo(nome) {
  return String(nome || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^\s*\d+\s*[.\-–)]\s*/, "")
    .replace(/[_]+/g, " ")
    .trim();
}

// Um índice é de UMA disciplina: os códigos formam uma família só ("19.1", "19.2"…). Quando
// o título de uma aula ocupa várias linhas, a continuação pode começar por algo que parece
// código — "6.938/1981). O Saneamento Básico…" virava a seção 6.938 e quebrava a sequência.
// Havendo prefixo dominante (≥60%), tudo que foge dele sai antes de casar códigos com páginas.
function podarForaDaFamilia(seq) {
  const codigos = seq.filter((x) => (x.t === "C" || x.t === "E") && x.numero.includes("."));
  if (codigos.length < 4) return;
  const conta = new Map();
  for (const x of codigos) {
    const pre = x.numero.split(".")[0];
    conta.set(pre, (conta.get(pre) || 0) + 1);
  }
  const [pre, n] = [...conta.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n < Math.ceil(codigos.length * 0.6)) return;
  for (let i = seq.length - 1; i >= 0; i--) {
    const x = seq[i];
    if ((x.t === "C" || x.t === "E") && x.numero.includes(".") && x.numero.split(".")[0] !== pre) seq.splice(i, 1);
  }
}

// Uma página de índice → entradas. Três layouts observados em apostilas reais:
//   1) coluna de páginas ANTES, depois "N) Título"           (Consumidor, Difusos…)
//   2) "N) Título .... pág" intercalado                       (formato clássico)
//   3) coluna de CÓDIGOS e páginas intercaladas, e os títulos com pontilhado num bloco
//      DEPOIS — as três listas em ordem, para compactar     (Ambiental, Constitucional…)
function parsePaginaIndice(pag, numPaginas) {
  const linhas = (pag.texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const seq = []; // {t:'E',numero,titulo} | {t:'C',numero} | {t:'N',n} | {t:'T',titulo}
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (RE_PONTILHADO.test(l)) continue;
    if (/^(índice|indice|sumário|sumario)$/i.test(l)) continue;
    const ent = casarEntradaIndice(l);
    if (ent) {
      let titulo = ent.titulo;
      // Título na linha SEGUINTE (pulando pontilhado/número de página).
      let j = i + 1;
      while (!titulo && j < linhas.length) {
        const nxt = linhas[j];
        if (RE_PONTILHADO.test(nxt) || RE_SO_NUMERO.test(nxt) || /^(índice|sumário)$/i.test(nxt)) { j++; continue; }
        if (casarEntradaIndice(nxt)) break; // é a próxima entrada: este código ficou sem título
        // Linha com pontilhado pertence ao BLOCO de títulos do layout 3 (que vem depois de
        // toda a coluna de códigos) — não é o título deste código. Sem esta guarda, o último
        // código da coluna adotava o primeiro título do bloco e desalinhava tudo.
        if (RE_TEM_PONTILHADO.test(nxt)) break;
        titulo = nxt.trim();
        i = j;
        break;
      }
      titulo = (titulo || "").replace(/\.{2,}\s*\d*\s*$/, "").replace(/^[\s–\-]+/, "").trim();
      // "10.1 3" — código e PÁGINA na mesma linha, com os títulos num bloco depois. É como o
      // pdf.js entrega o índice de duas colunas (o pdfminer separa em duas linhas). Sem esta
      // regra o número da página virava o título da aula: "Aula 01 — 3".
      if (RE_SO_NUMERO.test(titulo)) {
        const n = parseInt(titulo, 10);
        seq.push({ t: "C", numero: ent.numero });
        if (n >= 1 && (!numPaginas || n <= numPaginas)) seq.push({ t: "N", n });
        continue;
      }
      seq.push(titulo ? { t: "E", numero: ent.numero, titulo, pagina: ent.pagina } : { t: "C", numero: ent.numero });
      continue;
    }
    if (RE_SO_NUMERO.test(l)) {
      const n = parseInt(l, 10);
      if (n >= 1 && (!numPaginas || n <= numPaginas)) seq.push({ t: "N", n });
      continue;
    }
    if (RE_TEM_PONTILHADO.test(l)) {
      const titulo = l.replace(/\.{2,}\s*\d*\s*$/, "").trim();
      if (titulo.length >= 3) seq.push({ t: "T", titulo });
    }
  }

  podarForaDaFamilia(seq);

  const nums = seq.filter((x) => x.t === "N").map((x) => x.n);
  const soCodigos = seq.filter((x) => x.t === "C").map((x) => x.numero);
  const titulos = seq.filter((x) => x.t === "T").map((x) => x.titulo);

  // ---- Layout 3: códigos sem título + o mesmo número de títulos com pontilhado ----
  if (soCodigos.length >= 2 && soCodigos.length === titulos.length) {
    const casa = soCodigos.map((numero, k) => ({ numero, titulo: titulos[k] }));
    const paginasOk = nums.length === soCodigos.length && nums.every((n, k) => k === 0 || n >= nums[k - 1]);
    if (paginasOk) casa.forEach((e, k) => (e.pagina = nums[k]));
    return casa;
  }

  const entradas = seq.filter((x) => x.t === "E").map((x) => (x.pagina != null ? { numero: x.numero, titulo: x.titulo, pagina: x.pagina } : { numero: x.numero, titulo: x.titulo }));
  if (!entradas.length) return [];
  // Página lida da própria linha em TODAS as entradas: não há o que inferir, e deixar os layouts
  // abaixo rodarem só arriscaria sobrescrever (ou apagar) um dado que já está certo.
  if (entradas.every((e) => e.pagina != null)) return entradas;

  const idxFirstE = seq.findIndex((x) => x.t === "E");
  let idxLastN = -1;
  for (let k = seq.length - 1; k >= 0; k--) if (seq[k].t === "N") { idxLastN = k; break; }

  if (idxLastN >= 0 && idxLastN < idxFirstE) {
    // Layout 1: todos os números ANTES das entradas → pareia por ordem.
    const crescente = nums.every((n, k) => k === 0 || n >= nums[k - 1]);
    if (nums.length === entradas.length && crescente) entradas.forEach((e, k) => (e.pagina = nums[k]));
  } else {
    // Layout 2 (intercalado): para cada entrada, o número que vem logo depois.
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
    const ok = pgs.length >= Math.ceil(entradas.length * 0.6) && pgs.every((n, k) => k === 0 || n >= pgs[k - 1]);
    if (!ok) entradas.forEach((e) => delete e.pagina);
  }
  // Rede de segurança do pareamento: se nenhum layout casou as páginas mas há exatamente um
  // número para cada entrada, em ordem crescente, o pareamento posicional é seguro. É o que
  // acontece na SEGUNDA página de um índice longo, onde a ordem das colunas muda.
  if (!entradas.some((e) => e.pagina != null) && nums.length === entradas.length && nums.length
      && nums.every((n, k) => k === 0 || n >= nums[k - 1])) {
    entradas.forEach((e, k) => (e.pagina = nums[k]));
  }
  return entradas;
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

// Uma página é do índice? Aceita número (uso antigo) ou lista de páginas.
function ehPaginaDeIndice(n, indicePag) {
  return Array.isArray(indicePag) ? indicePag.includes(n) : !!indicePag && n === indicePag;
}

// Acha, no CORPO, a página onde um título numerado aparece (para confirmar/achar o início).
// Ignora as páginas do Índice (lá todos os títulos aparecem, daria falso positivo).
// Devolve { pagina, comTitulo } — `comTitulo` diz se o texto ao lado do número também bateu.
// O casamento só pelo NÚMERO é guardado como reserva: quando a linha do índice quebra, o
// título chega truncado ("Normas do Direito Brasileiro (LINDB)" no lugar da frase inteira) e a
// conferência de texto falha, embora "3.22 " abrindo linha no corpo seja âncora boa.
function paginaDoTitulo(paginas, numero, titulo, indicePag) {
  const alvoNum = numero;
  const tituloNorm = String(titulo || "").toLowerCase().slice(0, 30);
  let soNumero = null;
  for (const p of paginas) {
    if (ehPaginaDeIndice(p.n, indicePag)) continue;
    const linhas = (p.texto || "").split(/\r?\n/).map((l) => l.trim());
    for (const l of linhas) {
      const m = l.match(RE_TITULO_CORPO);
      if (m && m[1] === alvoNum) {
        // confere que o texto após o número bate com o título do índice (evita falso positivo)
        if (!tituloNorm || m[2].toLowerCase().includes(tituloNorm.slice(0, 12)) || tituloNorm.includes(m[2].toLowerCase().slice(0, 12))) {
          return { pagina: p.n, comTitulo: true };
        }
        if (soNumero == null) soNumero = p.n;
      }
    }
  }
  return soNumero != null ? { pagina: soNumero, comTitulo: false } : null;
}

// FALLBACK 1 — títulos NUMERADOS no corpo (PDF sem página de Índice, mas com seções "1.2 Título").
// Conservador: título curto, começa com maiúscula, sem pontuação final; exige ≥3 seções.
export function detectarPorNumeracao(paginas, indicePag) {
  const brutas = [];
  const vistos = new Set();
  const repeticoes = {}; // quantas vezes cada número aparece no documento inteiro
  for (const p of paginas) {
    if (ehPaginaDeIndice(p.n, indicePag)) continue;
    const linhas = (p.texto || "").split(/\r?\n/).map((l) => l.trim());
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      const m = l.match(/^(\d+(?:\.\d+){0,2})\)?\s+([A-ZÀ-Úa-zà-ú].{2,68})$/);
      if (!m) continue;
      const num = m[1];
      const titulo = m[2].trim();
      if (/[.;:,]$/.test(titulo)) continue; // parece frase, não título
      repeticoes[num] = (repeticoes[num] || 0) + 1;
      if (vistos.has(num)) continue;
      // ANO de prova ("2023 VUNESP Tribunal de Justiça…"): é cabeçalho de questão comentada
      // dentro da apostila, não uma seção — e roubava dezenas de páginas da aula real.
      if (/^(19|20)\d\d$/.test(num)) continue;
      // Item de LISTA no meio de um parágrafo: a linha anterior não termina em pontuação,
      // ou seja, o texto vinha correndo e este número continua a frase.
      const ant = (linhas[i - 1] || "").trim();
      if (ant && !/[.:;!?]$/.test(ant) && !/^\s*$/.test(ant)) continue;
      brutas.push({ numero: num, titulo, pagina: p.n, nivel: (num.match(/\./g) || []).length + 1 });
      vistos.add(num);
    }
  }
  // NUMERAÇÃO QUE RECOMEÇA não é estrutura do documento. Material que enumera de novo dentro de
  // cada capítulo ("1. Organização dos Poderes — 21,25%" em Constitucional, "1. Espécies
  // Tributárias — 31,94%" em Tributário) faz "1.", "2.", "3." aparecerem uma dúzia de vezes cada.
  // O `vistos` esconde isso — só a PRIMEIRA ocorrência sobrevive —, e o resultado é um sumário
  // montado com os temas de um capítulo qualquer, no lugar dos capítulos. Quando vários números
  // se repetem pelo documento, a numeração é local: aqui não serve, e o índice assume.
  const repetidos = Object.values(repeticoes).filter((c) => c >= 3).length;
  if (repetidos >= 3) return [];

  // COERÊNCIA DE FAMÍLIA: uma apostila numera as seções sob um mesmo prefixo ("10.1", "10.2"…).
  // Se a maioria compartilha um prefixo, o que está fora dele é ruído (lista, tabela, questão).
  const porPrefixo = {};
  for (const e of brutas) {
    const pre = e.numero.includes(".") ? e.numero.split(".")[0] : null;
    if (pre) porPrefixo[pre] = (porPrefixo[pre] || 0) + 1;
  }
  const dominante = Object.entries(porPrefixo).sort((a, b) => b[1] - a[1])[0];
  const entradas = dominante && dominante[1] >= Math.ceil(brutas.length * 0.6)
    ? brutas.filter((e) => e.numero.startsWith(dominante[0] + "."))
    : brutas;
  return entradas.length >= 3 ? entradas : [];
}

// FALLBACK 1b — títulos por MARCADOR "#NN –" (cursinhos que numeram seções com "#04 – Tema").
// Conservador: exige ≥3 marcadores distintos; título de tamanho de linha (não parágrafo).
export function detectarPorMarcador(paginas, indicePag) {
  const entradas = [];
  const vistos = new Set();
  for (const p of paginas) {
    if (ehPaginaDeIndice(p.n, indicePag)) continue;
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
    if (ehPaginaDeIndice(pg.n, indicePag)) continue;
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

// ---- casamento bloco do sumário ↔ tópico do edital --------------------------------------
// Fica aqui (e não no store) porque é regra pura: entra texto, sai um id. Assim dá para medir
// contra a base real sem abrir o app — foi como se descobriu que só 53% dos vínculos caíam na
// disciplina do próprio material.
const STOP_CASAMENTO = new Set([
  "de", "da", "do", "dos", "das", "e", "a", "o", "as", "os", "em", "no", "na", "para", "com",
  // "direito(s)" é quase-stopword: toda disciplina jurídica é "Direito X", o que discrimina é o
  // termo específico. "disposicoes/gerais" aparecem em metade dos títulos de lei.
  "disposicoes", "gerais", "direito", "direitos",
]);
const normCasamento = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const tokensCasamento = (s) =>
  new Set(normCasamento(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP_CASAMENTO.has(w)));

// Acha o tópico que melhor casa com um título de bloco.
//   `disciplinaId` = disciplina do MATERIAL (do nome do arquivo). Quando ela é conhecida, o
//   casamento acontece PRIMEIRO dentro dela; só se não houver nada aceitável ali é que se olha
//   o edital inteiro, e com exigência bem maior — é preferível não vincular a vincular errado.
// Sem essa preferência, "2.8 Administração Pública" (apostila de Constitucional) casava com
// "Dos crimes contra a administração pública" (Penal), e "Proteção às Mulheres" (Direitos
// Humanos) com "Pessoas naturais" (Civil): basta uma palavra em comum.
// `minOutra` é alto de propósito (0.75 contra 0.34 da própria disciplina): medindo na
// biblioteca real, o que passava entre 0.6 e 0.75 era majoritariamente ruído — "Processo
// Judicial Tributário" virando "Arbitragem", "Incidente de Deslocamento de Competência"
// virando "Precedentes judiciais". Perde-se junto algum vínculo legítimo (o capítulo de
// crimes ambientais da apostila de Ambiental, que mora em Penal no edital), e é uma troca
// consciente: vínculo errado conta como edital coberto e contamina dossiê e revisões, então
// vazio é melhor — e o usuário pode vincular à mão no cartão do material.
export function acharTopicoDoBloco(titulo, { topicos, disciplinas, disciplinaId, restrito = false, minMesma = 0.34, minOutra = 0.75 } = {}) {
  const alvo = tokensCasamento(titulo);
  if (!alvo.size || !Array.isArray(topicos) || !topicos.length) return null;
  const nomeDisc = (id) => {
    const d = (disciplinas || []).find((x) => x.id === id);
    return d ? d.nome : "";
  };
  const melhorEntre = (lista, incluirDisciplinaNoTexto) => {
    let melhor = null, melhorNota = 0;
    for (const t of lista) {
      const cand = tokensCasamento(`${t.nome} ${incluirDisciplinaNoTexto ? nomeDisc(t.disciplinaId) : ""}`);
      let inter = 0;
      for (const w of cand) if (alvo.has(w)) inter++;
      const nota = inter / Math.max(1, Math.min(alvo.size, cand.size));
      if (inter > 0 && nota > melhorNota) { melhorNota = nota; melhor = t; }
    }
    return { melhor, nota: melhorNota };
  };
  if (disciplinaId) {
    const daCasa = topicos.filter((t) => t.disciplinaId === disciplinaId);
    // Dentro da própria disciplina o nome dela não entra no texto: todos os candidatos a
    // compartilham, e ela só inflaria a nota sem discriminar nada.
    const r = melhorEntre(daCasa, false);
    if (r.melhor && r.nota >= minMesma) return { topicoId: r.melhor.id, nota: r.nota, mesmaDisciplina: true };
  }
  // Disciplina DECLARADA (campo do material ou prefixo do título) fecha a porta: o bloco fica
  // sem tópico em vez de casar em outra matéria. Foi assim que "Fontes, interpretação e
  // integração do Direito Administrativo" virou "Fontes do Direito Tributário" — com uma aula
  // por material os títulos são curtos e temáticos, e o piso global de 0,75 não segura.
  if (disciplinaId && restrito) return null;
  // Sair da disciplina do material exige um título com SUBSTÂNCIA. Um título de uma ou duas
  // palavras ("Prescrição", "Ilicitude", "Evolução Histórica") pontua 1.00 em qualquer lugar —
  // a nota é interseção/menor conjunto, então o lado curto sempre cabe inteiro dentro de algum
  // dos 400 tópicos do edital. Foi assim que "7.33 Prescrição", do Direito Penal, virou
  // "Prescrição e decadência" do Civil. Dentro da própria disciplina o risco não existe (o
  // universo é pequeno e temático), então o piso vale só para o casamento global.
  if (disciplinaId && alvo.size < 3) return null;
  const g = melhorEntre(topicos, true);
  const minimo = disciplinaId ? minOutra : minMesma;
  if (g.melhor && g.nota >= minimo) return { topicoId: g.melhor.id, nota: g.nota, mesmaDisciplina: false };
  return null;
}

// Disciplina do material a partir do título/arquivo ("3. Direito Administrativo" → a disciplina
// de mesmo nome no edital). Devolve null quando não há correspondência clara — caso das
// apostilas que não são disciplina do edital (Legislação Civil Especial, Difusos e Coletivos),
// em que o conteúdo mora mesmo em outras matérias.
export function disciplinaDoMaterial(titulo, disciplinas) {
  const alvo = normCasamento(disciplinaDoNomeDeArquivo(titulo)).trim();
  if (!alvo || !Array.isArray(disciplinas)) return null;
  const exata = disciplinas.find((d) => normCasamento(d.nome).trim() === alvo);
  if (exata) return exata.id;
  const contida = disciplinas.find((d) => {
    const n = normCasamento(d.nome).trim();
    return n.length >= 6 && (n.includes(alvo) || alvo.includes(n));
  });
  return contida ? contida.id : null;
}

// DISCIPLINA DE UM MATERIAL — fonte única, usada pela tela, pelos seletores e pelo casamento
// bloco↔tópico. Três fontes, nesta ordem (a mesma escada que o plano do cursinho já usa para
// as aulas, em ciclo.disciplinaDePlanoDe):
//   1. `doc.disciplinaId` — declarado na importação ou pelo usuário. É a resposta, quando existe.
//   2. o PREFIXO do título ("Direito Administrativo - Aula 07 - Atos"), que vem do próprio
//      cursinho e é prova melhor do que qualquer dedução por vínculo;
//   3. a disciplina DOMINANTE entre os blocos/tópicos vinculados — que só serve para agrupar
//      material antigo, importado antes de o campo existir. Nunca para restringir casamento:
//      ali seria circular (a régua sairia do próprio vínculo que se quer conferir).
// Rótulo do grupo de quem não tem disciplina — edital em PDF, guia do cursinho, resumo de
// véspera, prova avulsa. Um nome só, usado na lista de Materiais e em TODO seletor: dois nomes
// para a mesma coisa ("Sem disciplina" aqui, outra coisa ali) fazem o usuário procurar duas vezes.
export const GRUPO_AVULSOS = "Avulsos (sem disciplina)";

export function disciplinaDoDocumento(st, doc, { herdarDeVinculos = true } = {}) {
  if (!doc || !st) return null;
  const disciplinas = st.disciplinas || [];
  const doEdital = (d) => (d ? { id: d.id, nome: d.nome, tipo: "edital" } : null);
  const resolver = (nome) => {
    const alvo = normCasamento(nome).trim();
    if (!alvo) return null;
    return (
      disciplinas.find((d) => normCasamento(d.nome).trim() === alvo) ||
      disciplinas.find((d) => { const n = normCasamento(d.nome).trim(); return n.length >= 6 && (n.includes(alvo) || alvo.includes(n)); }) ||
      null
    );
  };
  // 1) Campo declarado. `cursoNome` é a resposta para o que NÃO é disciplina deste edital
  // ("Legislação Penal Especial", "Direitos Difusos e Coletivos"): o curso existe, tem nome
  // próprio e merece o seu grupo — dissolvê-lo dentro de uma disciplina do edital sumiria com
  // ele do lugar onde o usuário vai procurar.
  if (doc.disciplinaId) {
    const d = doEdital(disciplinas.find((x) => x.id === doc.disciplinaId));
    if (d) return d;
  }
  // "Avulso" é uma RESPOSTA, não ausência de resposta: o usuário disse que este material (o
  // edital em PDF, o guia do cursinho, um resumo geral) não é de disciplina nenhuma. Sem esta
  // marca, a herança por vínculos logo abaixo o devolvia para alguma disciplina e a escolha
  // se desfazia sozinha na tela seguinte.
  if (doc.semDisciplina) return null;
  if (String(doc.cursoNome || "").trim()) {
    const nome = String(doc.cursoNome).trim();
    return doEdital(resolver(nome)) || { id: null, nome, tipo: "curso" };
  }
  // 2) Prefixo do título — "Direito Administrativo - Aula 07 - Atos". Vem do próprio cursinho
  // e é prova melhor do que qualquer dedução por vínculo. Só vale com o "Aula NN" adiante:
  // sem isso, "Estudo Estratégico" viraria um curso.
  const mAula = String(doc.titulo || "").match(/^(.+?)\s[-–—]\s*aula\s*\d/i);
  if (mAula) {
    const pref = mAula[1].trim();
    return doEdital(resolver(pref)) || { id: null, nome: pref, tipo: "curso" };
  }
  const porTitulo = disciplinaDoMaterial(doc.titulo, disciplinas); // "3. Direito Administrativo"
  if (porTitulo) return doEdital(disciplinas.find((x) => x.id === porTitulo));
  // 3) Disciplina DOMINANTE entre os vínculos — só para agrupar material antigo, importado
  // antes de o campo existir. Nunca para restringir casamento: ali seria circular.
  if (!herdarDeVinculos) return null;
  const contagem = new Map();
  const anota = (topicoId) => {
    if (!topicoId) return;
    const t = (st.topicos || []).find((x) => x.id === topicoId);
    if (!t || !t.disciplinaId) return;
    contagem.set(t.disciplinaId, (contagem.get(t.disciplinaId) || 0) + 1);
  };
  for (const b of (doc.estrutura && doc.estrutura.blocos) || []) anota(b.topicoId);
  if (!contagem.size) (doc.topicoIds || []).forEach(anota);
  if (!contagem.size) anota(doc.topicoId);
  // Material que não é de disciplina nenhuma (edital em PDF, guia do cursinho, resumo geral)
  // devolve null — e vai para o grupo "Sem disciplina", que é a resposta certa para ele.
  if (!contagem.size) return null;
  return doEdital(disciplinas.find((x) => x.id === [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0]));
}

// Dentro do grupo da própria disciplina, o prefixo "Direito Administrativo - " no título é
// repetição do cabeçalho logo acima: some da linha (o dado continua inteiro no título). Mesma
// regra do `nomeCurtoAula` do plano do cursinho — inclusive para poder voltar atrás sem migrar
// dado nenhum.
export function tituloCurtoDoc(titulo, disciplinaNome) {
  const nome = String(titulo || "");
  if (!disciplinaNome) return nome;
  const m = nome.match(/^(.+?)\s[-–—]\s*(.+)$/);
  if (!m) return nome;
  // `disciplinaDoNomeDeArquivo` tira a numeração do cursinho ("3. Direito Administrativo"),
  // para o resumido e o completo se comportarem igual dentro do grupo.
  const esq = normCasamento(disciplinaDoNomeDeArquivo(m[1])).trim();
  const dir = normCasamento(disciplinaNome).trim();
  if (!esq || !dir) return nome;
  const casa = esq === dir || (esq.length >= 6 && dir.length >= 6 && (dir.includes(esq) || esq.includes(dir)));
  return casa ? m[2].trim() : nome;
}

// Nomes de CURSO já conhecidos (materiais e plano do cursinho) — para o seletor oferecer o que
// já existe em vez de o usuário redigitar "Legislação Penal Especial" a cada importação.
export function cursosConhecidos(st) {
  const vistos = new Map();
  const guarda = (nome) => {
    const n = String(nome || "").trim();
    if (!n) return;
    const k = normCasamento(n).trim();
    // Mesma régua do `disciplinaDoDocumento`: "Formação Humanística" É disciplina deste edital,
    // que só a chama de "Noções Gerais de Direito e Formação Humanística". Comparar por
    // igualdade exata a listava como se fosse curso de fora.
    if (!k || (st.disciplinas || []).some((d) => { const dn = normCasamento(d.nome).trim(); return dn === k || (dn.length >= 6 && k.length >= 6 && (dn.includes(k) || k.includes(dn))); })) return;
    if (!vistos.has(k)) vistos.set(k, n);
  };
  for (const d of st.documentos || []) {
    const dd = disciplinaDoDocumento(st, d, { herdarDeVinculos: false });
    if (dd && dd.tipo === "curso") guarda(dd.nome);
  }
  for (const a of st.aulas || []) {
    if (String(a.disciplinaNome || "").trim()) { guarda(a.disciplinaNome); continue; }
    const m = String(a.nome || "").match(/^(.+?)\s[-–—]\s*aula\s*\d/i);
    if (m) guarda(m[1]);
  }
  return [...vistos.values()].sort((x, y) => x.localeCompare(y, "pt"));
}

// Rótulo do material para quando ele aparece FORA da lista agrupada — fonte de uma questão ou
// flashcard, dossiê, busca, chat. Sem a disciplina, "Aula 01 - Apresentação do Curso" não diz
// de que matéria é.
export function rotuloDocumento(st, doc) {
  if (!doc) return "";
  const d = disciplinaDoDocumento(st, doc);
  const curto = tituloCurtoDoc(doc.titulo, d && d.nome);
  return d ? `${d.nome} · ${curto}` : doc.titulo || "";
}

// Ordem natural do material dentro da disciplina: "Aula 2" antes de "Aula 10" (localeCompare
// com numeric), e não a ordem de importação — que espalhava os PDFs de uma mesma matéria
// conforme a data em que cada lote entrou.
export function ordenarDocumentos(st, docs) {
  return [...(docs || [])].sort((a, b) => {
    const da = disciplinaDoDocumento(st, a), db = disciplinaDoDocumento(st, b);
    const na = da ? da.nome : "￿", nb = db ? db.nome : "￿";
    if (na !== nb) return na.localeCompare(nb, "pt");
    return String(a.titulo || "").localeCompare(String(b.titulo || ""), "pt", { numeric: true });
  });
}

// O sumário determinístico é bom o bastante para dispensar a IA? Veio do ÍNDICE (ou da
// numeração das seções no corpo, que também é ancorada em texto real) e quase todo bloco tem
// página. `outline`/`fonte`/`marcador` NÃO contam: são os fallbacks incertos, e é neles (mais
// no PDF escaneado, que não tem texto nenhum) que a Visão da IA ganha da heurística.
// Fica aqui, e não na tela, porque é regra de detecção — e assim entra no teste sem DOM.
export function ehEstruturaForte(est) {
  if (!est || !Array.isArray(est.blocos) || !est.blocos.length) return false;
  if (est.origem !== "indice" && est.origem !== "numeracao") return false;
  const comPagina = est.blocos.filter((b) => b.pIni != null).length;
  return comPagina >= Math.ceil(est.blocos.length * 0.8);
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
  let { entradas, indicePag, indicePags } = parseIndice(paginas, numPaginas);
  indicePags = indicePags || (indicePag ? [indicePag] : []);
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

  // Resolve a página de início de cada entrada: CORPO > índice > tag.
  //
  // A ordem era tag > índice > corpo, e a tag ganhava sempre que existisse. Só que a tag é um
  // link da plataforma na página ("?topic=10.5"): ela marca uma página que FALA da seção, não
  // onde a seção começa — nas apostilas do cursinho ela cai dezenas de páginas adiante. Medido
  // nas 17 apostilas (339 blocos, gabarito = página em que o cabeçalho "N.M" abre linha no
  // corpo): com a tag na frente, 117/339; com o índice/corpo na frente, 316/339. O cabeçalho no
  // corpo é a única âncora que É o começo da seção, então ele manda; o índice vem logo atrás
  // (concordam quase sempre) e a tag vira o último recurso, para PDF sem índice legível.
  const blocos = entradas.map((e) => {
    let pIni = null, conf = 0.5;
    const noCorpo = paginaDoTitulo(paginas, e.numero, e.titulo, indicePags);
    const pCorpo = noCorpo && noCorpo.comTitulo ? noCorpo.pagina : null;
    if (pCorpo != null) { pIni = pCorpo; conf = 0.9; }
    else if (e.pagina) { pIni = e.pagina; conf = 0.8; }
    else if (noCorpo) { pIni = noCorpo.pagina; conf = 0.75; } // número bateu, título veio truncado
    else if (temTag && tags[e.numero]) { pIni = tags[e.numero].ini; conf = 0.55; } // pede conferência na tela
    // Duas fontes independentes concordando: confiança máxima.
    if (pCorpo != null && e.pagina && Math.abs(pCorpo - e.pagina) <= 1) conf = 0.99;
    const cls = classificarTitulo(e.titulo);
    const nivel = e.nivel || (e.numero.match(/\./g) || []).length + 1;
    return { numero: e.numero, titulo: e.titulo, ...cls, nivel, pIni, pFim: null, confianca: pIni != null ? Math.min(conf, tetoConf) : 0.3 };
  });

  // Calcula pFim: até a página anterior ao próximo bloco (ordenado por pIni).
  const comPag = blocos.filter((b) => b.pIni != null).sort((a, b) => a.pIni - b.pIni);
  for (let i = 0; i < comPag.length; i++) {
    comPag[i].pFim = i + 1 < comPag.length ? Math.max(comPag[i].pIni, comPag[i + 1].pIni - 1) : numPaginas || comPag[i].pIni;
  }
  // Devolve na ORDEM DO DOCUMENTO. A ordenação acima é de uma cópia (`comPag`), só para
  // calcular pFim; sem ordenar o resultado, a tela mostrava "10.7 p.199-234" antes de
  // "6 p.187-198". Bloco SEM página fica junto do seu vizinho na ordem do índice (chave
  // meio-termo), e não jogado no fim — senão "10.1", cujo título não foi achado no corpo,
  // aparecia depois de "10.12".
  let ultimo = 0;
  blocos.forEach((b, i) => {
    if (b.pIni != null) ultimo = b.pIni;
    b._ordem = b.pIni != null ? b.pIni : ultimo + 0.5;
    b._i = i;
  });
  blocos.sort((a, b) => a._ordem - b._ordem || a._i - b._i);
  blocos.forEach((b) => { delete b._ordem; delete b._i; });
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
