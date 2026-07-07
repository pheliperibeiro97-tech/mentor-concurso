// Camada de IA — "orquestrador, não oráculo".
// No MVP roda 100% offline com heurísticas. A arquitetura é pluggable:
// quando houver Claude Code / Gemini configurado, estes pontos chamariam o provedor.
// Todo conteúdo produzido pela IA carrega SELO DE ORIGEM:
//   verde  = extraído/estruturado do material do usuário (confiável)
//   amarelo = gerado pela IA (conferir)

export const SELO = {
  verde: { icone: "book-open", rotulo: "Extraído do seu material" },
  amarelo: { icone: "bot", rotulo: "Gerado pela IA · confira" },
  manual: { icone: "notebook-pen", rotulo: "Inserido por você" },
  oficial: { icone: "landmark", rotulo: "Prova oficial · gabarito da banca" },
};

// ---------- 1. Separar edital em disciplinas e tópicos ----------
// Heurística: cabeçalhos (linha curta em CAIXA ALTA ou terminando em ':') viram
// disciplina; o conteúdo é quebrado por ';', por numeração (1. 2.) ou por linha.
// Title-case em pt-BR: só normaliza strings que vieram TODAS em MAIÚSCULAS (cabeçalhos de
// edital como "DIREITO ADMINISTRATIVO" → "Direito Administrativo"); respeita o que o usuário
// digitou em caixa mista. Mantém conectores minúsculos (de, do, da, e…) e preserva siglas
// curtas isoladas (TI, RLM, ICMS).
const PALAVRINHAS = new Set(["de", "do", "da", "dos", "das", "e", "em", "a", "o", "à", "às", "ao", "aos", "com", "para", "por", "no", "na", "nos", "nas", "que", "sobre", "entre"]);
export function tituloPt(s) {
  const str = String(s || "").trim();
  const letras = str.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letras.length < 3 || str !== str.toLocaleUpperCase("pt-BR")) return str; // caixa mista: respeita
  if (!/\s/.test(str) && letras.length <= 5) return str; // sigla curta isolada (TI/RLM/ICMS)
  return str.toLocaleLowerCase("pt-BR").replace(/\S+/g, (w, i) => {
    const bare = w.replace(/[^0-9a-zà-ÿ]/gi, "");
    if (i > 0 && PALAVRINHAS.has(bare)) return w;
    return w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1);
  });
}

export function separarEdital(texto) {
  const disciplinas = [];
  let atual = null;

  const garanteDisciplina = (nome, header) => {
    const limpo = (nome || "").replace(/\s*\(?\s*\d+\s*\)?\s*quest(ões|oes)?\s*\)?\s*:?\s*$/i, "").replace(/:\s*$/, "").trim();
    atual = { nome: tituloPt(limpo) || "Geral", topicos: [], _header: !!header };
    disciplinas.push(atual);
    return atual;
  };

  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  // Abreviações que NÃO encerram um tópico (evitam corte errado em ". ").
  const ABREV = /(?:art|arts|inc|al|cap|caps|n|nº|lei|dec|del|ec|cf|cc|cpc|clt|stf|stj|tst|res|súm|sum|fig|pág|pag|sec|seç|tit|liv|par|vol|obs)$/i;

  const pareceCabecalho = (l) => {
    const semNum = l.replace(/^[0-9]+[).\-\s]+/, "");
    const letras = semNum.replace(/[^A-Za-zÀ-ÿ]/g, "");
    const ehCaixaAlta = letras.length >= 3 && semNum === semNum.toUpperCase() && /[A-ZÀ-Ý]/.test(semNum);
    const terminaDoisPontos = /:\s*$/.test(l);
    const curto = semNum.split(/\s+/).length <= 8;
    return (ehCaixaAlta || terminaDoisPontos) && curto;
  };

  // Cabeçalho INLINE: "DIREITO CONSTITUCIONAL: <tópicos…>" (nome em MAIÚSCULAS antes do ":").
  const cabecalhoInline = (l) => {
    const m = l.match(/^\s*((?:BLOCO\s+[IVXL0-9|]+\s*[:\-]\s*)?[A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9º°\s.\-\/]{2,60}?)\s*:\s*(.*)$/);
    if (!m) return null;
    const nome = m[1].replace(/^BLOCO\s+[IVXL0-9|]+\s*[:\-]\s*/i, "").trim();
    const letras = nome.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (letras.length < 3 || nome !== nome.toUpperCase() || nome.split(/\s+/).length > 7) return null;
    return { nome, resto: m[2] || "" };
  };

  // Remove ruído que costuma sobrar em editais escaneados (links "Disponível em:",
  // URLs soltas, marcadores residuais) do texto de um tópico, sem mexer no conteúdo útil.
  const limparRuidoTopico = (t) =>
    String(t || "")
      .replace(/\bdispon[ií]vel\s+em\s*:?.*$/i, "") // "Disponível em: <...>" até o fim da linha
      .replace(/<https?:\/\/[^>]*>/gi, "") // <http...>
      .replace(/https?:\/\/\S+/gi, "") // http(s):// soltas
      .replace(/\bwww\.\S+/gi, "")
      .replace(/(\p{L})-\s+(\p{L})/gu, "$1$2") // junta hifenização de OCR ("classifica- ção" → "classificação")
      .replace(/\s{2,}/g, " ")
      .replace(/[\s.;:,\-–]+$/, "")
      .trim();

  // É CONTINUAÇÃO de uma lista (artigos, títulos) — ex.: "307", "312 a 317", "88 e 89",
  // "art. 5º" —, então deve recolar no tópico anterior em vez de virar um tópico solto.
  const ehContinuacao = (seg) => {
    const s = seg.trim();
    // dígito, OU marcador de dispositivo (art./§/inciso/lei/título/cap/seção/tomo) seguido de
    // número, OU algarismo romano ISOLADO (\b evita casar a 1ª letra de palavras como
    // "Licitações"/"Vícios"). Combinado com POUCAS letras (fragmento, não um conceito novo).
    if (!/^(?:e\s+)?(?:(?:arts?\.?|artigos?|incisos?|t[íi]tulos?|cap[íi]tulos?|se[çc][õo]es?|tomos?|leis?|§|n\.?º?)\s*)?(?:\d|[IVXLCDM]+\b)/i.test(s)) return false;
    return s.replace(/[^a-zà-ÿ]/gi, "").length <= 8; // poucas letras = fragmento numérico/artigo
  };

  // Divide UMA frase por ';' SÓ quando o ';' separa TÓPICOS (formato colado "a; b; c"), e
  // NÃO quando separa SUBTÓPICOS: se a frase tem ':' (introduz subtópicos) ela é mantida
  // inteira; e fragmentos de continuação (listas de artigos "...305; 307; 308") recolam.
  const dividirPontoEVirgula = (frase) => {
    if (frase.includes(":")) return [frase];
    const segs = frase.split(";").map((s) => s.trim()).filter(Boolean);
    if (segs.length <= 1) return segs;
    const out = [];
    for (const seg of segs) {
      if (out.length && ehContinuacao(seg)) out[out.length - 1] += "; " + seg;
      else out.push(seg);
    }
    return out;
  };

  const empurraTopicos = (txt) => {
    if (!atual) garanteDisciplina("Geral");
    // 1) quebra por NUMERAÇÃO de tópico ("1." / "1.2)") — NÃO por ';' nem bullets (';' é subtópico).
    const blocos = txt.split(/\s\d{1,3}(?:\.\d{1,3})?[).]\s+|(?:^|\s)\d{1,3}[).]\s+/);
    for (let b of blocos) {
      b = b.replace(/^[0-9]+(?:\.\d+)?[).\-\s]+/, "").trim();
      if (b.length < 2) continue;
      // 2) corta por ". " quando a frase anterior não termina em abreviação/número e a próxima
      //    começa com Maiúscula (tópicos em texto corrido — edital 1).
      const tokens = b.split(/(\.\s+)/); // mantém os ". " como separadores
      const frases = [];
      let buf = "";
      for (let i = 0; i < tokens.length; i++) {
        const tk = tokens[i];
        if (/^\.\s+$/.test(tk)) {
          const ult = buf.trim().split(/\s+/).pop() || "";
          const prox = tokens[i + 1] || "";
          if (/[A-ZÀ-Ý]/.test(prox[0] || "") && !ABREV.test(ult) && !/\d$/.test(ult)) { frases.push(buf.trim()); buf = ""; }
          else buf += tk;
        } else buf += tk;
      }
      if (buf.trim()) frases.push(buf.trim());
      // 3) cada frase: o ';' é tratado como SUBTÓPICO (não fragmenta), e limpa o ruído.
      for (const frase of frases) {
        for (const p of dividirPontoEVirgula(frase)) {
          const t = tituloPt(limparRuidoTopico(p.replace(/[.;:]\s*$/, "")));
          if (t.length >= 2) atual.topicos.push(t);
        }
      }
    }
  };

  for (const linha of linhas) {
    const inline = cabecalhoInline(linha);
    if (inline) {
      garanteDisciplina(inline.nome, true);
      if (inline.resto.trim()) empurraTopicos(inline.resto);
    } else if (pareceCabecalho(linha)) {
      garanteDisciplina(linha.replace(/:\s*$/, ""), true);
    } else {
      empurraTopicos(linha);
    }
  }

  // Descarta disciplinas vazias (cabeçalhos de GRUPO sem tópicos próprios, ex.:
  // "CONHECIMENTOS EM DIREITO" seguido das sub-disciplinas DIREITO PENAL, etc.).
  return disciplinas.filter((d) => d.topicos.length > 0);
}

// NOTA: a antiga "geração offline" de questões e flashcards por lacuna (cloze) foi
// REMOVIDA. Ela escolhia a palavra mais longa da frase como resposta, sem qualquer
// compreensão — produzia itens inúteis (ex.: perguntar o nome do professor). Toda
// geração a partir de TEXTO LIVRE agora exige IA conectada (ver ia-provider.js); a UI
// bloqueia o botão e orienta a conectar uma IA. As transformações abaixo, que apenas
// REESTRUTURAM conteúdo que o próprio usuário já criou (questões → flashcards), seguem
// offline, pois não inventam nada.

// ---------- 3b. Gerar flashcard a partir de uma QUESTÃO (gabarito comentado) ----------
// A resposta (verso) vira um gabarito comentado, alternativa por alternativa.
export function flashcardDeQuestao(questao) {
  const letra = (i) => String.fromCharCode(65 + i);
  const corretaTxt = questao.alternativas[questao.gabarito];
  const linhas = questao.alternativas.map((a, i) => {
    const marca = i === questao.gabarito ? "✓ correta" : "✗ incorreta";
    return `${letra(i)}) ${a} — ${marca}`;
  });
  const verso =
    `Resposta correta: ${letra(questao.gabarito)}) ${corretaTxt}.\n\n` +
    `Gabarito comentado:\n${linhas.join("\n")}`;
  return { frente: questao.enunciado, verso, selo: "amarelo" };
}

// ---------- 4. Corrigir texto discursivo/redação (heurístico offline) ----------
export function corrigirTexto(texto, tipo = "discursiva") {
  const limpo = texto.trim();
  const palavras = limpo ? limpo.split(/\s+/).length : 0;
  const paragrafos = limpo.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const frases = quebrarFrases(limpo);
  const frasesLongas = frases.filter((f) => f.split(/\s+/).length > 35);

  const conectivos = [
    "portanto", "contudo", "entretanto", "todavia", "ademais", "outrossim",
    "porquanto", "destarte", "conquanto", "porque", "porém", "assim", "logo",
    "por conseguinte", "dessa forma", "em suma", "por fim", "além disso",
  ];
  const usados = conectivos.filter((c) => limpo.toLowerCase().includes(c));

  // Repetição de palavras de conteúdo (>4 letras).
  const freq = {};
  limpo
    .toLowerCase()
    .replace(/[^a-zà-ÿ\s]/g, "")
    .split(/\s+/)
    .filter((p) => p.length > 4)
    .forEach((p) => (freq[p] = (freq[p] || 0) + 1));
  const repetidas = Object.entries(freq)
    .filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const criterios = [];
  // Estrutura
  if (paragrafos.length < 3) {
    criterios.push({
      criterio: "Estrutura",
      nota: paragrafos.length <= 1 ? "baixa" : "média",
      obs: `Apenas ${paragrafos.length} ${paragrafos.length === 1 ? "parágrafo" : "parágrafos"}. Espera-se introdução, desenvolvimento e conclusão (≥3 blocos).`,
    });
  } else {
    criterios.push({
      criterio: "Estrutura",
      nota: "boa",
      obs: `${paragrafos.length} parágrafos — estrutura adequada de intro/desenvolvimento/conclusão.`,
    });
  }
  // Coesão
  criterios.push({
    criterio: "Coesão",
    nota: usados.length >= 3 ? "boa" : usados.length >= 1 ? "média" : "baixa",
    obs: usados.length
      ? `Conectivos usados: ${usados.slice(0, 6).join(", ")}.`
      : "Poucos conectivos identificados — encadeie melhor as ideias (portanto, contudo, ademais...).",
  });
  // Coerência (frases longas demais prejudicam)
  criterios.push({
    criterio: "Coerência / clareza",
    nota: frasesLongas.length === 0 ? "boa" : frasesLongas.length <= 2 ? "média" : "baixa",
    obs: frasesLongas.length
      ? `${frasesLongas.length} ${frasesLongas.length === 1 ? "frase muito longa" : "frases muito longas"} (>35 palavras). Considere dividir.`
      : "Frases com extensão adequada.",
  });
  // Conteúdo / repetição
  criterios.push({
    criterio: "Vocabulário / repetição",
    nota: repetidas.length === 0 ? "boa" : "média",
    obs: repetidas.length
      ? `Palavras repetidas: ${repetidas.map(([p, n]) => `${p} (${n}x)`).join(", ")}.`
      : "Sem repetições excessivas detectadas.",
  });

  return {
    tipo,
    palavras,
    paragrafos: paragrafos.length,
    frases: frases.length,
    criterios,
    selo: "amarelo",
    nota: "Correção heurística offline. Para análise de mérito do conteúdo, conecte uma IA em Configurações.",
  };
}

// ---------- 4b. Interpretar lista de "temas que mais caem" com nível/percentual ----------
// Extrai de cada linha o nome do tema e o peso/incidência (percentual ou número),
// para ranquear o que é mais importante. Ex.: "Atos administrativos - 25%".
export function interpretarDestaques(texto) {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);
  const itens = [];
  for (const linha of linhas) {
    let peso = 0;
    // percentual explícito
    const mPct = linha.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
    if (mPct) peso = Math.round(parseFloat(mPct[1].replace(",", ".")));
    else {
      // número solto no fim/início (ex.: "Tema: 12 questões", "(8)")
      const mNum = linha.match(/(?:^|[\s(:])(\d{1,3})(?:\b|\))/);
      if (mNum) peso = parseInt(mNum[1], 10);
    }
    // nome = linha sem marcadores, números, percentuais e palavras de contagem
    const nome = linha
      .replace(/\d{1,3}(?:[.,]\d+)?\s*%/g, "")
      .replace(/\b\d{1,3}\b/g, "")
      .replace(/quest(õ|o)es?|incid[êe]ncia|temas?|pontos?/gi, "")
      .replace(/^[\s\-*•·:.()]+|[\s\-*•·:.()]+$/g, "")
      .trim();
    if (nome.length >= 2) itens.push({ nome, peso });
  }
  return itens;
}

// NOTA: o "comentário de erro" deixou de ser um template fixo offline. Agora é gerado
// por IA (ia-provider.js → comentarErro), que de fato analisa o erro. A UI bloqueia o
// botão e orienta a conectar uma IA quando não há provedor configurado.

// ---------- Mentor: busca no conteúdo do usuário (RAG offline simples) ----------
// Retorna trechos relevantes do material/resumos/lei/juris/flashcards/erros,
// cada um com a ORIGEM (para o chat sempre indicar de onde veio a resposta).
export function buscarNoConteudo(state, query) {
  const palavras = (query || "")
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (!palavras.length) return [];
  const limpa = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const score = (texto) => {
    const t = limpa(texto).toLowerCase();
    return palavras.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);
  };
  const trechoRelevante = (texto) => {
    const frases = quebrarFrases(limpa(texto));
    const f = frases.find((fr) => palavras.some((w) => fr.toLowerCase().includes(w)));
    const r = (f || frases[0] || "").trim();
    return r.length > 280 ? r.slice(0, 280) + "…" : r;
  };

  const out = [];
  for (const d of state.documentos || []) {
    const sc = score(d.titulo + " " + d.texto);
    if (sc) out.push({ sc, origem: `Material: ${d.titulo}`, trecho: trechoRelevante(d.texto) });
  }
  for (const r of state.resumos || []) {
    const sc = score(r.titulo + " " + r.conteudoHTML);
    if (sc) out.push({ sc, origem: `Resumo: ${r.titulo}`, trecho: trechoRelevante(r.conteudoHTML) });
  }
  for (const i of state.indicacoes || []) {
    const sc = score(i.referencia + " " + (i.texto || ""));
    if (sc) out.push({ sc, origem: `${i.tipo === "juris" ? "Jurisprudência" : "Lei seca"}: ${i.referencia}`, trecho: i.texto || i.referencia });
  }
  for (const f of state.flashcards || []) {
    const sc = score(f.frente + " " + f.verso);
    if (sc) out.push({ sc, origem: "Flashcard", trecho: `${limpa(f.frente)} — ${limpa(f.verso)}` });
  }
  for (const q of state.questoes || []) {
    const sc = score(q.enunciado);
    if (sc) out.push({ sc, origem: "Questão", trecho: `${q.enunciado} (resposta: ${q.alternativas[q.gabarito]})` });
  }
  // Observações que o usuário deixou ao registrar sessões (ex.: "tive dificuldade
  // com o princípio da insignificância") — o mentor pode partir delas.
  for (const s of state.sessoes || []) {
    if (!s.comentario) continue;
    const sc = score(s.comentario);
    if (sc) {
      const t = s.topicoId ? (state.topicos || []).find((x) => x.id === s.topicoId) : null;
      out.push({ sc, origem: `Anotação de sessão${t ? " · " + t.nome : ""}`, trecho: s.comentario });
    }
  }
  out.sort((a, b) => b.sc - a.sc);
  return out.slice(0, 5);
}

// ---------- helpers ----------
function quebrarFrases(texto) {
  return texto
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}
