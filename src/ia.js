// Camada de IA — "orquestrador, não oráculo".
// No MVP roda 100% offline com heurísticas. A arquitetura é pluggable:
// quando houver Claude Code / Gemini configurado, estes pontos chamariam o provedor.
// Todo conteúdo produzido pela IA carrega SELO DE ORIGEM:
//   verde  = extraído/estruturado do material do usuário (confiável)
//   amarelo = gerado pela IA (conferir)

export const SELO = {
  verde: { icone: "book-open", rotulo: "Extraído do seu material" },
  amarelo: { icone: "bot", rotulo: "Criado pelo Mentor · confira" },
  manual: { icone: "notebook-pen", rotulo: "Inserido por você" },
  oficial: { icone: "landmark", rotulo: "Prova oficial · gabarito da banca" },
  // Gerado SEM material do usuário, só com o conhecimento do modelo. É diferente do amarelo:
  // lá a IA transformou o SEU conteúdo; aqui não havia conteúdo nenhum para transformar. O
  // rótulo precisa dizer isso sem eufemismo — quem estuda por esta questão tem de saber que
  // ela pede conferência antes de virar memória.
  semfonte: { icone: "triangle-alert", rotulo: "Sem fonte · confira" },
  // Gerado com BUSCA NA WEB ligada: existe fonte, mas é página da internet — não o seu
  // material nem texto oficial. Continua pedindo conferência, e por isso o "confira" fica.
  web: { icone: "globe", rotulo: "Fonte na web · confira" },
  // ESTADO FINAL de qualquer selo que pedia conferência: o usuário olhou e validou. Existe
  // porque selo que nunca sai vira papel de parede — se tudo fica amarelo para sempre,
  // ninguém enxerga amarelo. Só o usuário limpa, nunca o app.
  conferido: { icone: "circle-check", rotulo: "Conferido por você" },
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
  // Algarismo ROMANO que NUMERA a seção fica em caixa alta: o edital escreve "IV – LEGISLAÇÃO
  // PENAL ESPECIAL" e "Iv – …" fica errado. Só o primeiro token, e só quando vem seguido de
  // travessão — senão "CIVIL" (que é só C-I-V-I-L) viraria "CIVIL" em pleno "Direito Civil".
  const numeraSecao = /^[IVXLCDM]{1,7}\s*[-–—]/.test(str);
  return str.toLocaleLowerCase("pt-BR").replace(/\S+/g, (w, i) => {
    const bare = w.replace(/[^0-9a-zà-ÿ]/gi, "");
    if (i === 0 && numeraSecao) return w.toLocaleUpperCase("pt-BR");
    if (i > 0 && PALAVRINHAS.has(bare)) return w;
    return w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1);
  });
}

// `porItem`: cada item NUMERADO do edital vira UM tópico, com a numeração preservada
// ("(39) Propriedade · Função social · …"). Sem ele (padrão), o item é fatiado frase a
// frase — bom para edital em texto corrido, ruim para edital numerado.
export function separarEdital(texto, { porItem = false } = {}) {
  const disciplinas = [];
  let atual = null;

  const garanteDisciplina = (nome, header) => {
    const limpo = (nome || "").replace(/\s*\(?\s*\d+\s*\)?\s*quest(ões|oes)?\s*\)?\s*:?\s*$/i, "").replace(/:\s*$/, "").trim();
    atual = { nome: tituloPt(limpo) || "Geral", topicos: [], _header: !!header };
    disciplinas.push(atual);
    return atual;
  };

  let linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  // Abreviações que NÃO encerram um tópico (evitam corte errado em ". ").
  const ABREV = /(?:art|arts|inc|al|cap|caps|n|nº|lei|dec|del|ec|cf|cc|cpc|clt|stf|stj|tst|res|súm|sum|fig|pág|pag|sec|seç|tit|liv|par|vol|obs)$/i;

  const pareceCabecalho = (l) => {
    // Nome de disciplina não termina em ponto. Sem esta trava, a última linha de um item que
    // caía em caixa alta ("(LINDB).") abria uma disciplina e sequestrava os itens seguintes.
    if (/\.\s*$/.test(l)) return false;
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

  // Edital em PDF quebra o item em várias linhas, e de duas formas: o número sozinho com o
  // texto abaixo (Anexo II do 192º) e "18. Contratos em geral…" com o texto na mesma linha e a
  // continuação abaixo (Anexo I). Lido linha a linha, o "1." virava um tópico vazio e CADA
  // linha do texto virava um tópico solto, sem a numeração oficial — que no modo "por item" é
  // justamente o que se quer preservar (o item numerado é o ponto sorteado na prova oral).
  //
  // Só um rótulo EM CAIXA ALTA interrompe a colagem. Terminar em ":" não basta: no meio de um
  // item é comum ("…Agentes políticos: identificação. Militares:"), e usar `pareceCabecalho`
  // aqui fazia essa linha virar disciplina e levar os 32 itens seguintes junto.
  const soCaixaAlta = (l) => {
    const letras = l.replace(/[^A-Za-zÀ-ÿ]/g, "");
    return letras.length >= 3 && l === l.toUpperCase() && /[A-ZÀ-Ý]/.test(l);
  };
  // Item pode ser arábico ("18. Contratos…") ou ROMANO com travessão ("I – Conceito de Direito
  // Penal…"), que é como o 192º numera Penal e Processual Penal.
  const abreItem = (l) => /^\d{1,3}\.(\s|$)/.test(l) || /^[IVXLCDM]{1,5}\s*[–—-]\s+\S/.test(l);
  // A colagem para no próximo item E em qualquer SUBDIVISÃO explícita do edital: alínea
  // ("a) Da aplicação da lei penal") ou subitem com travessão ("1 – Parte Geral"). Elas são
  // unidades de estudo e precisam de tópico próprio — coladas, o item II do Direito Penal
  // virava um único tópico com o Código Penal inteiro dentro, impossível de acompanhar.
  const abreSubdivisao = (l) => /^[a-z]\)\s/.test(l) || /^\d{1,3}\s*[–—-]\s+\S/.test(l);
  const juntadas = [];
  let acumulando = false;
  for (const l of linhas) {
    if (abreItem(l)) { juntadas.push(l.replace(/\.$/, ". ")); acumulando = true; continue; }
    // A parada usa o MESMO teste da abertura: com um `^\d{1,3}[.)]` frouxo, a citação legal
    // "5.903/2006, …" interrompia a colagem e virava um tópico solto começando em "903/2006".
    if (acumulando && !abreItem(l) && !/^\d{1,3}\)/.test(l) && !abreSubdivisao(l) && !soCaixaAlta(l) && !cabecalhoInline(l)) { juntadas[juntadas.length - 1] += " " + l; continue; }
    acumulando = false;
    juntadas.push(l);
  }
  linhas = juntadas.map((l) => l.replace(/\s{2,}/g, " ").trim());

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
  // Quebra por ';' que está FORA de parênteses. O ';' dentro de um parêntese quase sempre
  // separa itens de uma citação legal — "(Lei 4.737/1965; LC 64/1990; Lei 9.504/1997)" — e
  // cortar ali parte a referência no meio.
  const partirForaDeParenteses = (frase) => {
    const out = [];
    let buf = "", nivel = 0;
    for (const c of frase) {
      if (c === "(") nivel++;
      else if (c === ")") nivel = Math.max(0, nivel - 1);
      if (c === ";" && nivel === 0) { out.push(buf); buf = ""; continue; }
      buf += c;
    }
    out.push(buf);
    return out.map((s) => s.trim()).filter(Boolean);
  };

  const dividirPontoEVirgula = (frase) => {
    if (frase.includes(":")) return [frase];
    const segs = partirForaDeParenteses(frase);
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
    // A captura preserva o número: no modo POR ITEM ele volta como prefixo "(N)", porque num
    // edital de magistratura o item numerado é o PONTO sorteado na prova oral (art. 65 da
    // Resolução CNJ 75/2009) — perder a numeração custa caro.
    const partes = txt.split(/(?:^|\s)(\d{1,3}(?:\.\d{1,3})?)[).]\s+/);
    const blocos = [];
    for (let i = 0; i < partes.length; i++) {
      // partes[0] é o trecho antes do 1º número (sem numeração); depois vêm pares (nº, texto).
      if (i === 0) { if ((partes[0] || "").trim()) blocos.push({ num: "", txt: partes[0] }); continue; }
      if (i % 2 === 1) blocos.push({ num: partes[i], txt: partes[i + 1] || "" });
    }
    for (const bloco of blocos) {
      // Só descarta o número quando vem colado a uma PONTUAÇÃO de lista ("1.", "1)", "1-"),
      // que é sobra da própria separação. Um número seguido de espaço e travessão é rótulo de
      // subitem do edital ("1 – Parte Geral") e tem de continuar aparecendo.
      let b = String(bloco.txt || "").replace(/^[0-9]+(?:\.\d+)?[).\-]\s*/, "").trim();
      if (b.length < 2) continue;
      const marca = bloco.num ? `(${bloco.num}) ` : "";
      // POR ITEM: o item do edital fica inteiro, com a numeração de volta. Sem esta opção,
      // colar o Anexo I do 192º (401 itens) produzia 1.612 tópicos soltos — "Ausência",
      // "Validade", "Eficácia" — e a numeração oficial se perdia.
      if (porItem) {
        const t = tituloPt(limparRuidoTopico(b.replace(/[.;:]\s*$/, "")));
        if (t.length >= 2) atual.topicos.push(marca + t);
        continue;
      }
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

// ---------- 4a-bis. Estatística de incidência POR DISCIPLINA, de um material inteiro ----------
// Material de "raio-x da banca" (ex.: o Estudo Estratégico) traz, para cada disciplina, a fatia
// de cada tema nas provas. O mesmo PDF mistura três formas de dizer isso, e as três aparecem no
// mesmo arquivo — por isso as três são lidas e vence a que achar mais temas na seção:
//   (a) TABELA (é assim que a Visão devolve um gráfico que só existia como imagem):
//         | Espécies Tributárias | 31,94% |
//   (b) TEXTO enumerado da análise qualitativa:  "1. Organização dos Poderes — 21,25%"
//   (c) GRÁFICO com camada de texto: o PDF entrega a coluna de percentuais TODA JUNTA e, logo
//       depois, a coluna de rótulos na mesma ordem — nunca lado a lado.
// Puro de propósito: entra texto, sai [{disciplina, temas:[{tema,pct}]}], sem tocar em estado.
const RX_DISCIPLINA = /^\s*\d{1,2}\.\s+([A-ZÁÂÃÉÊÍÓÔÕÚÜÇ][A-ZÁÂÃÉÊÍÓÔÕÚÜÇ \-]{5,})\s*$/;
const RX_PCT_SO = /^\s*(\d{1,2}[,.]\d{1,2})\s*%\s*$/;
const RX_TABELA = /^\s*\|\s*([^|]{3,90}?)\s*\|\s*(\d{1,2}[,.]\d{1,2})\s*%\s*\|\s*$/;
const RX_ENUM = /^\s*\d{1,2}\.\s+(.{3,90}?)\s*[—–-]\s*(\d{1,2}[,.]\d{1,2})\s*%\s*$/;
const num = (s) => parseFloat(String(s).replace(",", "."));
const ehRuido = (s) => !s || /^\d+$/.test(s) || /^[\d,.%\s|—–-]+$/.test(s);

function temasDaSecao(linhas) {
  const tabela = [], enums = [], grafico = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    let m = l.match(RX_TABELA);
    if (m && !/percentual|tema/i.test(m[1])) tabela.push({ tema: m[1], pct: num(m[2]) });
    m = l.match(RX_ENUM);
    if (m) enums.push({ tema: m[1].trim(), pct: num(m[2]) });
    // (c) corrida de percentuais sozinhos → os rótulos vêm logo abaixo, na mesma ordem
    if (RX_PCT_SO.test(l) && (i === 0 || !RX_PCT_SO.test(linhas[i - 1]))) {
      const pcts = [];
      let j = i;
      while (j < linhas.length && RX_PCT_SO.test(linhas[j])) pcts.push(num(linhas[j++].match(RX_PCT_SO)[1]));
      if (pcts.length >= 5) {
        const nomes = [];
        while (j < linhas.length && nomes.length < pcts.length) {
          const s = linhas[j++].trim();
          if (!ehRuido(s)) nomes.push(s.replace(/…+$/, "").trim());
        }
        if (nomes.length >= pcts.length) for (let k = 0; k < pcts.length; k++) grafico.push({ tema: nomes[k], pct: pcts[k] });
      }
    }
  }
  return [tabela, enums, grafico].reduce((a, b) => (b.length > a.length ? b : a), []);
}

export function interpretarIncidenciaPorDisciplina(texto) {
  const linhas = String(texto || "").split(/\r?\n/);
  const cortes = [];
  linhas.forEach((l, i) => { const m = l.match(RX_DISCIPLINA); if (m) cortes.push({ i, nome: m[1].trim() }); });
  const out = [];
  for (let k = 0; k < cortes.length; k++) {
    const ini = cortes[k].i;
    const fim = k + 1 < cortes.length ? cortes[k + 1].i : linhas.length;
    const temas = temasDaSecao(linhas.slice(ini, fim));
    if (!temas.length) continue;
    // Um tema pode reaparecer (gráfico e texto na mesma seção): fica o maior percentual.
    const porNome = new Map();
    for (const t of temas) {
      const ch = t.tema.toLowerCase();
      if (!porNome.has(ch) || porNome.get(ch).pct < t.pct) porNome.set(ch, t);
    }
    out.push({
      disciplina: cortes[k].nome.replace(/\s+/g, " ").toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()),
      temas: [...porNome.values()].sort((a, b) => b.pct - a.pct),
    });
  }
  return out;
}

// ---------- 4a-ter. TRILHA do cursinho (PDF semanal) → tarefas, na ordem do arquivo ----------
// A trilha semanal numera as metas ("TAREFA 01", "TAREFA 02"…) dentro de seções por matéria
// ("MATÉRIA: DIREITO PROCESSUAL CIVIL"). Esse número É a ordem de execução.
//
// Por que determinístico e não pela IA: jogar as 34 páginas na IA devolveu 8 tarefas inventadas
// a partir das primeiras páginas — ela reescreve o material em vez de recortar as metas, e o
// resto do documento se perde no caminho. Aqui o recorte é exato e a ordem é a do arquivo.
const RX_TRILHA_NOME = /TRILHA\s+ESTRAT[ÉE]GICA\s+(\d{1,3})/i;
const RX_MATERIA = /^\s*MAT[ÉE]RIA:\s*(.+?)\s*$/;
const RX_TAREFA = /^\s*TAREFA\s+(\d{1,3})\s*$/;

// CAIXA ALTA → Título, sem transformar as preposições ("DIREITO DO CONSUMIDOR" viraria
// "Direito Do Consumidor", que ninguém escreve assim).
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "no", "na", "a", "o", "ao", "à", "para", "com"]);
function capitalizarTitulo(s) {
  return String(s || "")
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.replace(/^\p{L}/u, (c) => c.toUpperCase())))
    .join(" ")
    .trim();
}

export function pareceTrilha(texto) {
  const t = String(texto || "");
  return (t.match(/^\s*TAREFA\s+\d{1,3}\s*$/gm) || []).length >= 3;
}

export function interpretarTrilha(texto) {
  const linhas = String(texto || "").split(/\r?\n/);
  const nome = (String(texto || "").match(RX_TRILHA_NOME) || [])[1];
  const prefixo = nome ? `Trilha ${nome}` : "Trilha";
  const tarefas = [];
  let materia = "";
  let atual = null;
  const fechar = () => {
    if (!atual) return;
    const uteis = atual.linhas.map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l && !/^\d+$/.test(l));
    const corpo = uteis.filter((l) => !/^https?:|^OBS/i.test(l));
    // O bloco abre com o ASSUNTO da tarefa, que quase sempre repete a matéria da seção — mas nem
    // sempre: dentro de "MATÉRIA: FORMAÇÃO HUMANÍSTICA" vêm "Diário de Legislação", "Revisão
    // semanal" e "Hora do informativo!", que são outra coisa. Quando difere, quem manda é a linha.
    const primeira = corpo[0] || "";
    const ehMateria = primeira.toLowerCase() === (atual.materia || "").toLowerCase();
    const assunto = ehMateria ? atual.materia : primeira || atual.materia;
    const instrucao = (ehMateria ? corpo[1] : corpo[1]) || (ehMateria ? "" : primeira) || "";
    const link = (uteis.find((l) => /https?:\/\//.test(l)) || "").replace(/\s+/g, "");
    const obs = uteis.filter((l) => /^OBS/i.test(l)).join(" ");
    const cabecalho = [prefixo, atual.n, assunto].filter(Boolean).join(" · ");
    tarefas.push({
      numero: Number(atual.n),
      materia: atual.materia,
      assunto,
      titulo: `${cabecalho}${instrucao ? " — " + instrucao : ""}`.replace(/\s+/g, " ").replace(/[.\s]+$/, ""),
      observacao: [obs, link].filter(Boolean).join("\n"),
    });
    atual = null;
  };
  for (const linha of linhas) {
    const mm = linha.match(RX_MATERIA);
    if (mm) {
      fechar();
      materia = capitalizarTitulo(mm[1]); // "DIREITO DO CONSUMIDOR" → "Direito do Consumidor"
      continue;
    }
    const mt = linha.match(RX_TAREFA);
    if (mt) {
      fechar();
      atual = { n: mt[1], materia, linhas: [] };
      continue;
    }
    if (atual && atual.linhas.length < 14) atual.linhas.push(linha);
  }
  fechar();
  // A ordem é a do arquivo; o número da tarefa desempata se o PDF trouxer algo fora de ordem.
  return tarefas.sort((a, b) => a.numero - b.numero);
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
