// provas.js — motor de importação de PROVAS anteriores (provas oficiais que o usuário
// baixa do site da banca). Funções PURAS (sem estado/IO): parsear o quadro de gabarito,
// converter letra↔índice e parear as questões ao gabarito por número.
//
// A extração das questões em si (enunciado/alternativas) usa a IA (extrairQuestoes);
// aqui cuidamos do GABARITO e do PAREAMENTO, que precisam ser exatos para não
// "alucinar" a resposta. Versões/cores embaralhadas (pareamento por texto) vêm depois.

// Converte "A".."E" → 0..4. Retorna -1 se inválido.
export function letraParaIndice(letra) {
  const c = String(letra || "").trim().toUpperCase();
  if (!/^[A-E]$/.test(c)) return -1;
  return c.charCodeAt(0) - 65;
}

// Parseia o quadro de respostas de uma prova. Aceita os formatos usuais das bancas:
// "01-A", "1 - A", "01: A", "1) A", "01 A", "1. C", e Certo/Errado ("01 C", "1 ERRADO",
// "1 V"). Tokens de questão sem resposta: ANULADA / NULA / N/A / X / *.
//
// formatoHint: "mc" (A–E) | "ce" (Certo/Errado) | "auto" (detecta).
// Por que o hint importa: as letras C e E são AMBÍGUAS — em A–E são as alternativas
// 3ª/5ª; em Certo/Errado significam Certo/Errado. O fluxo de importação informa o
// formato escolhido pelo usuário; "auto" só decide quando há sinais claros.
//
// Retorna { formato, itens } onde itens = [{numero, indice?|certo?|anulada?}].
export function parseGabarito(texto, formatoHint = "auto") {
  const re = /(\d{1,3})\s*[)\-.:ºª°]?\s*(CERTO|ERRADO|VERDADEIRO|FALSO|ANULAD[AO]|NULA|N\/?A|[A-EVF]|X|\*)(?![A-Za-zÀ-ÿ0-9])/gi;
  const seen = new Set();
  const pares = [];
  let m;
  while ((m = re.exec(String(texto || ""))) !== null) {
    const numero = parseInt(m[1], 10);
    if (seen.has(numero)) continue; // mantém a 1ª ocorrência de cada número
    seen.add(numero);
    pares.push({ numero, token: m[2].toUpperCase() });
  }

  // Detecta o formato quando "auto": palavra escrita (CERTO/ERRADO/...) ou só letras
  // C/E/V/F (sem A/B/D) ⇒ Certo/Errado; caso contrário ⇒ múltipla escolha.
  let formato = formatoHint;
  if (formato !== "mc" && formato !== "ce") {
    const temPalavra = pares.some((p) => /^(CERTO|ERRADO|VERDADEIRO|FALSO)$/.test(p.token));
    const letras = pares.filter((p) => /^[A-E]$/.test(p.token)).map((p) => p.token);
    const usaABD = letras.some((l) => l === "A" || l === "B" || l === "D");
    formato = temPalavra || (letras.length > 0 && !usaABD) ? "ce" : "mc";
  }

  const ehAnulada = (t) => /^(ANULAD[AO]|NULA|N\/?A|X|\*)$/.test(t);
  const itens = pares.map((p) => {
    const t = p.token;
    if (ehAnulada(t)) return { numero: p.numero, anulada: true };
    if (formato === "ce") {
      if (/^(C|CERTO|V|VERDADEIRO)$/.test(t)) return { numero: p.numero, certo: true };
      if (/^(E|ERRADO|F|FALSO)$/.test(t)) return { numero: p.numero, certo: false };
      return { numero: p.numero, anulada: true };
    }
    const idx = letraParaIndice(t);
    return idx >= 0 ? { numero: p.numero, indice: idx } : { numero: p.numero, anulada: true };
  });
  return { formato, itens };
}

// Pareia as questões (na ordem em que aparecem) com o gabarito, POR NÚMERO: a i-ésima
// questão (1-based) recebe o item de gabarito de número i. É o caso do CADERNO ÚNICO.
// (Caderno com versões/cores embaralhadas → pareamento por texto do enunciado, depois.)
//
// Devolve cada questão com: gabarito (índice), formato, e flags anulada/semGabarito.
export function parearQuestoesComGabarito(questoes, itens, { formato = "mc" } = {}) {
  const mapa = new Map((itens || []).map((it) => [it.numero, it]));
  return (questoes || []).map((q, i) => {
    // Pareia pelo NÚMERO original da questão (quando a extração o preservou); senão,
    // cai para a posição (i+1). Robusto a numeração que não começa em 1, lacunas e versões.
    const numero = Number.isInteger(q.numero) ? q.numero : i + 1;
    const g = mapa.get(numero);
    // formato e alternativas são consistentes em TODOS os ramos (inclusive anulada/sem
    // gabarito) — no C/E as alternativas são sempre Certo/Errado.
    const alternativas = formato === "ce" ? ["Certo", "Errado"] : q.alternativas;
    const base = { ...q, formato, alternativas };
    if (!g) return { ...base, gabarito: Number.isInteger(q.gabarito) ? q.gabarito : null, semGabarito: true };
    if (g.anulada) return { ...base, anulada: true, gabarito: Number.isInteger(q.gabarito) ? q.gabarito : 0 };
    if (formato === "ce") return { ...base, gabarito: g.certo ? 0 : 1 };
    return { ...base, gabarito: g.indice };
  });
}
