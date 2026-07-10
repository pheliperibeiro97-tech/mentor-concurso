// Camada de IA REAL (online) — adaptador "pluggable" de provedores.
//
// Filosofia (igual ao resto do app): IA é orquestrador, não oráculo. Todo conteúdo
// gerado aqui carrega selo 🤖 (confira) e é SEMPRE ancorado no material do usuário.
//
// Provedores suportados:
//   • gemini     — Google Gemini (chave grátis no Google AI Studio). PADRÃO recomendado.
//   • claude-cli — Claude Code local (uso pessoal · desktop; usa a auth local do dono).
//   • offline    — sem IA; o núcleo do app continua funcionando sem este módulo.
//
// Para "enlatar" o app, cada usuário cola a própria chave grátis em Configurações.

// Fase 2 — PERSONA ÚNICA: o app tem UM personagem de IA ("Mentor"), em todas as
// superfícies (chat flutuante, tela Mentor, gerações). Prefixo compartilhado dos
// system prompts voltados ao aluno — o papel específico de cada tarefa vem depois.
export const PERSONA_MENTOR =
  "Você é o Mentor: o treinador de estudos pessoal do aluno para concursos públicos. " +
  "Fale em 1ª pessoa, tom direto, encorajador e tecnicamente preciso (sem bajulação).";

export const MODELO_PADRAO = {
  // gemini-3.1-flash-lite: maior cota grátis observada (≈500 req/dia no free tier) e rápido,
  // dá conta das tarefas do app (extração/geração/Visão). Confirme o ID em AI Studio se mudar.
  gemini: "gemini-3.1-flash-lite",
  // Claude Code local: alias "haiku" (mais econômico p/ a assinatura). sonnet/opus dão mais
  // qualidade a um custo maior. O Claude Code aceita os atalhos haiku/sonnet/opus em --model.
  "claude-cli": "haiku",
};

// Atalhos de modelo aceitos pelo Claude Code local (campo Modelo na config quando claude-cli).
export const CLAUDE_MODELOS = ["haiku", "sonnet", "opus"];

// True quando há um provedor online configurado e utilizável AGORA.
export function iaDisponivel(cfg) {
  if (!cfg) return false;
  const p = cfg.iaProvider;
  if (!p || p === "offline") return false;
  if (p === "claude") return false; // (API Anthropic paga) — removida do app
  if (p === "claude-cli") return ehTauri(); // Claude Code LOCAL: só no desktop (Tauri), usa a auth local
  return !!(cfg.iaKey && cfg.iaKey.trim()); // gemini exige chave
}

export function provedorRotulo(cfg) {
  const p = cfg && cfg.iaProvider;
  if (p === "gemini") return "Google Gemini";
  if (p === "claude-cli") return "Claude Code local";
  return "Offline";
}

// ---------------------------------------------------------------------------
// Chamada de baixo nível: despacha para o provedor certo.
// Retorna texto, ou objeto já parseado quando { json: true }.
// ---------------------------------------------------------------------------
async function chamar(cfg, { system, user, json = false, temperature = 0.4 }) {
  if (!iaDisponivel(cfg)) {
    const e = new Error("IA não conectada. Configure um provedor em Configurações.");
    e.code = "IA_OFFLINE";
    throw e;
  }
  const provider = cfg.iaProvider;
  if (provider === "gemini") return chamarGemini(cfg, { system, user, json, temperature });
  if (provider === "claude-cli") return chamarClaude(cfg, { system, user, json });
  throw new Error("Provedor de IA não suportado: " + provider);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== Claude Code local (uso pessoal · desktop) =====
// Roda o Claude Code headless via comando Tauri (claude_prompt → `claude -p --output-format
// json`). Usa a autenticação local do dono (assinatura) e consome o limite dela. Só funciona
// no app desktop (Tauri); no navegador, ehTauri() é false e iaDisponivel devolve false.
function ehTauri() {
  return typeof window !== "undefined" && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);
}
async function invocarTauri(cmd, args) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(cmd, args);
}
// Lê o texto da resposta do Claude Code (--output-format json → { result, is_error }).
function lerResultadoClaude(stdout) {
  let obj;
  try { obj = JSON.parse(stdout); } catch (_) { return String(stdout || "").trim(); }
  if (obj && obj.is_error) throw new Error("Claude: " + (obj.result || obj.subtype || "erro"));
  return String((obj && obj.result) || "").trim();
}
async function chamarClaude(cfg, { system, user, json = false }) {
  if (!ehTauri()) {
    const e = new Error("O Claude Code local só funciona no app desktop (Tauri).");
    e.code = "IA_OFFLINE";
    throw e;
  }
  const instrJson = json
    ? "\n\nResponda APENAS com JSON válido (sem comentários, sem texto fora do JSON, sem cercas de código markdown)."
    : "";
  const prompt = `${system ? system + "\n\n" : ""}${user}${instrJson}`;
  const modelo = (cfg.iaModelo || "").trim() || MODELO_PADRAO["claude-cli"];
  let stdout;
  try {
    stdout = await invocarTauri("claude_prompt", { prompt, model: modelo });
  } catch (e) {
    throw new Error("Falha ao chamar o Claude Code local: " + (e && e.message ? e.message : e));
  }
  const txt = lerResultadoClaude(stdout);
  return json ? parseJSON(txt) : txt;
}
// Visão/OCR pelo Claude Code: manda a imagem (base64) p/ o comando Tauri, que grava num arquivo
// temporário e deixa o Claude LER. Mesmo contrato do chamarGeminiVisao (devolve texto, ou JSON).
async function chamarClaudeVisao(cfg, { system, user, mimeType, dataB64, json = false }) {
  if (!ehTauri()) {
    const e = new Error("O Claude Code local só funciona no app desktop (Tauri).");
    e.code = "IA_OFFLINE";
    throw e;
  }
  const instrJson = json
    ? "\n\nResponda APENAS com JSON válido (sem texto fora do JSON, sem cercas de código markdown)."
    : "";
  const prompt = `${system ? system + "\n\n" : ""}${user}${instrJson}`;
  const modelo = (cfg.iaModelo || "").trim() || MODELO_PADRAO["claude-cli"];
  let stdout;
  try {
    stdout = await invocarTauri("claude_prompt", { prompt, model: modelo, imageB64: dataB64, imageMime: mimeType });
  } catch (e) {
    throw new Error("Falha ao chamar o Claude Code local (visão): " + (e && e.message ? e.message : e));
  }
  const txt = lerResultadoClaude(stdout);
  return json ? parseJSON(txt) : txt;
}
// Dispatcher de VISÃO/OCR: roteia entre Gemini e Claude Code local conforme o provedor.
function chamarVisao(cfg, opts) {
  if (cfg.iaProvider === "claude-cli") return chamarClaudeVisao(cfg, opts);
  return chamarGeminiVisao(cfg, opts);
}
// Provedores que fazem VISÃO/OCR (Gemini ou Claude Code local).
function visaoDisponivel(cfg) {
  return iaDisponivel(cfg) && (cfg.iaProvider === "gemini" || cfg.iaProvider === "claude-cli");
}
// Visão com SAÍDA JSON ESTRITA (edital/cursinho/mapa de arquivo): Gemini usa o fallback de
// modelo (geminiResiliente); Claude Code local usa a mesma rota de visão. Retorna objeto JSON.
function chamarVisaoJson(cfg, { system, user, mimeType, dataB64, temperature = 0.2, timeoutMs = 120000 }) {
  if (cfg.iaProvider === "claude-cli") return chamarClaudeVisao(cfg, { system, user, mimeType, dataB64, json: true });
  return geminiResiliente(cfg, (c) =>
    chamarGeminiVisaoRaw(c, { system, user, mimeType, dataB64, temperature, json: true, timeoutMs })
  );
}

// fetch com TIMEOUT (evita "Processando…" infinito quando a API trava/sobrecarrega) e 1 retry
// automático em erros 5xx transitórios (ex.: 503 "high demand" do Gemini, comum no tier grátis).
async function fetchIA(url, opts, nome, timeoutMs = 60000) {
  const TIMEOUT_MS = timeoutMs;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    let resp;
    try {
      resp = await fetch(url, ctrl ? { ...opts, signal: ctrl.signal } : opts);
    } catch (e) {
      if (timer) clearTimeout(timer);
      // Timeout (abort) ou falha de rede: tenta de novo uma vez; senão, erro claro.
      if (tentativa === 0) { await esperar(1200); continue; }
      const ehTimeout = e && e.name === "AbortError";
      const msg = ehTimeout ? `${nome || "IA"}: o servidor demorou demais para responder (tente de novo em instantes).` : `${nome || "IA"}: falha de conexão (${e && e.message ? e.message : "rede"}).`;
      const err = new Error(msg);
      // Etiqueta para o failover de chave (geminiComReserva) reconhecer o erro mesmo
      // sem status HTTP — a mensagem é em PT-BR e não casaria com regex em inglês.
      err.code = ehTimeout ? "TIMEOUT" : "NETWORK";
      err.transiente = true;
      throw err;
    }
    if (timer) clearTimeout(timer);
    if (resp.ok) return resp;
    if (resp.status >= 500 && resp.status < 600 && tentativa === 0) {
      await esperar(1600);
      continue;
    }
    throw await mensagemErro(resp, nome);
  }
}

// Failover de CHAVE: executa fn com a chave principal e, se a chamada falhar por um motivo
// em que TROCAR DE CHAVE/PROJETO pode ajudar — cota esgotada (429) ou timeout/rede —, repete
// UMA vez com a chave reserva (cfg.iaKeyReserva), quando houver uma diferente configurada.
// NÃO trata 503/5xx aqui: sobrecarga é do MODELO (não da chave) e é resolvida trocando de
// MODELO (ver geminiResiliente). fn recebe o cfg a usar (com a chave vigente).
async function geminiComReserva(cfg, fn) {
  try {
    return await fn(cfg);
  } catch (e) {
    const principal = (cfg.iaKey || "").trim();
    const reserva = (cfg.iaKeyReserva || "").trim();
    const status = e && e.status;
    // Reconhece timeout/rede tanto pela ETIQUETA do fetchIA (code/transiente) quanto por
    // name/mensagem (defesa em profundidade). Antes só casava regex em inglês e perdia o
    // timeout do fetchIA, que vem com mensagem em PT-BR → o failover nunca disparava.
    const ehAbort = e && (e.transiente === true || e.code === "TIMEOUT" || e.code === "NETWORK" || e.name === "AbortError" || /abort|timeout|network|failed to fetch/i.test(e.message || ""));
    const valeReserva = status === 429 || ehAbort;
    if (valeReserva && reserva && reserva !== principal) {
      try { console.warn(`[IA Gemini] Chave principal falhou (${status || e.code || e.name || "erro"}); tentando a chave reserva.`); } catch (_) {}
      return await fn({ ...cfg, iaKey: reserva });
    }
    throw e;
  }
}

// Fallback de MODELO: tenta o modelo configurado e, em erros de SOBRECARGA DO SERVIDOR
// (503 "high demand", 500/502/504), modelo inexistente p/ a chave (404) OU COTA ESGOTADA
// (429), cai para o próximo modelo da GEMINI_FALLBACKS reenviando o MESMO payload. Cada
// tentativa de modelo já inclui o failover de CHAVE (geminiComReserva).
// Inclui 429 porque, no FREE TIER, cada modelo tem um BUCKET de cota SEPARADO — então trocar
// de modelo quando um estoura a cota diária realmente libera (ex.: 3.1-flash-lite → 3-flash).
// Esses erros falham RÁPIDO (não custam latência como o timeout, que continua não avançando).
async function geminiResiliente(cfg, fnRaw) {
  const preferido = (cfg.iaModelo || "").trim() || MODELO_PADRAO.gemini;
  const modelos = [preferido, ...GEMINI_FALLBACKS.filter((m) => m !== preferido)];
  let ultimo = null;
  for (let i = 0; i < modelos.length; i++) {
    try {
      return await geminiComReserva({ ...cfg, iaModelo: modelos[i] }, fnRaw);
    } catch (e) {
      ultimo = e;
      const st = e && e.status;
      const podeTrocarModelo = st === 503 || st === 500 || st === 502 || st === 504 || st === 404 || st === 429;
      if (!podeTrocarModelo || i === modelos.length - 1) throw e;
      try { console.warn(`[IA Gemini] modelo ${modelos[i]} indisponível (${st}); tentando ${modelos[i + 1]}.`); } catch (_) {}
    }
  }
  throw ultimo || new Error("Gemini indisponível em todos os modelos.");
}

function chamarGemini(cfg, opts) {
  return geminiResiliente(cfg, (c) => chamarGeminiRaw(c, opts));
}

async function chamarGeminiRaw(cfg, { system, user, json, temperature }) {
  const modelo = (cfg.iaModelo || "").trim() || MODELO_PADRAO.gemini;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent` +
    `?key=${encodeURIComponent(cfg.iaKey.trim())}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const resp = await fetchIA(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, "Gemini");
  const data = await resp.json();
  const cand = data && data.candidates && data.candidates[0];
  const texto = cand && cand.content && cand.content.parts
    ? cand.content.parts.map((p) => p.text || "").join("")
    : "";
  if (!texto) {
    const motivo = cand && cand.finishReason ? ` (${cand.finishReason})` : "";
    throw new Error("A IA não retornou conteúdo" + motivo + ".");
  }
  return json ? parseJSON(texto) : texto.trim();
}

async function mensagemErro(resp, nome) {
  let raw = "";
  let detalhe = "";
  try {
    raw = await resp.text();
    try {
      const j = JSON.parse(raw);
      detalhe = (j.error && (j.error.message || j.error.status)) || raw;
    } catch (_) {
      detalhe = raw;
    }
  } catch (_) {}
  // Loga o corpo bruto no console para diagnóstico fino.
  try { console.error(`[IA ${nome}] HTTP ${resp.status}:`, raw); } catch (_) {}
  let dica = "";
  if (resp.status === 401 || resp.status === 403) dica = " — chave inválida ou API não habilitada para esta chave.";
  else if (resp.status === 404) dica = " — modelo inexistente para esta chave; troque o modelo (campo Modelo).";
  else if (resp.status === 429) dica = " — cota/limite grátis deste MODELO (não é a sua chave). Troque o modelo (ex.: gemini-3.1-flash-lite, gemini-2.5-flash) ou aguarde ~1 min.";
  const e = new Error(`${nome} ${resp.status}: ${String(detalhe).slice(0, 400)}${dica}`);
  e.status = resp.status;
  return e;
}

// Parser tolerante: remove cercas ```json e isola o primeiro objeto/array.
function parseJSON(texto) {
  let s = String(texto).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(s);
  } catch (_) {
    const ini = s.search(/[[{]/);
    const fim = Math.max(s.lastIndexOf("]"), s.lastIndexOf("}"));
    if (ini >= 0 && fim > ini) {
      try {
        return JSON.parse(s.slice(ini, fim + 1));
      } catch (_) {}
    }
    throw new Error("A IA respondeu em formato inesperado (não-JSON).");
  }
}

function corta(texto, max) {
  const t = String(texto || "");
  return t.length > max ? t.slice(0, max) + "\n[...]" : t;
}

// ---------------------------------------------------------------------------
// Enriquecimento de prompt: banca + cargo + tópico + nível de dificuldade.
// Tudo OPCIONAL — quando não informado, devolve string vazia e o prompt segue
// como antes (compatibilidade com chamadas existentes).
// ---------------------------------------------------------------------------

// Frase de alvo (banca/cargo) para o system prompt. Ex.:
//   "Elabore no estilo da banca FGV, para o cargo de Analista Judiciário."
function alvoBancaCargo(banca, cargo) {
  const b = (banca || "").trim();
  const c = (cargo || "").trim();
  if (!b && !c) return "";
  const partes = [];
  if (b) partes.push(`no estilo da banca ${b}`);
  if (c) partes.push(`para o cargo de ${c}`);
  return ` Elabore ${partes.join(", ")}, reproduzindo o padrão de cobrança típico ` +
    `desse alvo (formato, profundidade e armadilhas características).`;
}

// Diretriz de FOCO no tópico: explora o que a banca mais cobra e as peculiaridades.
function focoTopico(topico, banca) {
  const t = (topico || "").trim();
  if (!t) return "";
  const b = (banca || "").trim();
  const refBanca = b ? `a banca ${b}` : "a banca do concurso";
  return ` Foque ESPECIFICAMENTE no tópico "${t}": priorize os pontos que ${refBanca} ` +
    `MAIS COBRA nesse tema (o que ela já cobrou ou costuma cobrar) e suas peculiaridades, ` +
    `no nível de profundidade típico dela.`;
}

// Calibragem da dificuldade. Aceita "facil" | "medio" | "dificil" (default medio).
function nivelDiretriz(dificuldade, banca) {
  const d = String(dificuldade || "medio").toLowerCase();
  const b = (banca || "").trim();
  const estilo = b ? `, sempre no estilo da banca ${b}` : "";
  if (d === "facil") {
    return ` Nível de dificuldade: FÁCIL. Cobre literalidade e conceitos diretos ` +
      `(definições, regra geral), sem pegadinhas${estilo}.`;
  }
  if (d === "dificil") {
    return ` Nível de dificuldade: DIFÍCIL. Explore pegadinhas, exceções à regra, ` +
      `casos concretos/aplicação a situações, jurisprudência e interpretação fina${estilo}.`;
  }
  return ` Nível de dificuldade: MÉDIO. Exija APLICAÇÃO do conceito a situações ` +
    `simples, indo além da mera literalidade${estilo}.`;
}

// Monta o bloco de diretrizes (banca/cargo + foco no tópico + nível) a anexar ao
// system prompt. Devolve "" quando nada foi informado (default = nível médio).
function diretrizesIA({ banca, cargo, topico, dificuldade } = {}) {
  return (
    alvoBancaCargo(banca, cargo) +
    focoTopico(topico, banca) +
    nivelDiretriz(dificuldade, banca)
  );
}

// ---------------------------------------------------------------------------
// Tarefas de alto nível — cada uma devolve dados prontos para o store.
// ---------------------------------------------------------------------------

// Gera questões de múltipla escolha FIÉIS ao conteúdo fornecido.
export async function gerarQuestoes(cfg, { texto, contexto, n = 5, dificuldade = "medio", banca, cargo, topico }) {
  const system =
    "Você é um elaborador de questões para concursos públicos brasileiros, no estilo das " +
    "principais bancas (FGV, Cebraspe, VUNESP, FCC). Elabore questões de múltipla escolha " +
    "que cobrem CONCEITOS examináveis do conteúdo fornecido. Regras rígidas: (1) baseie-se " +
    "SOMENTE no conteúdo dado, sem inventar fatos; (2) NUNCA pergunte sobre nome de professor, " +
    "número de página, título do arquivo, data da aula ou qualquer metadado — apenas o mérito " +
    "do assunto; (3) cada questão tem 4 alternativas plausíveis, só uma correta; (4) cada enunciado deve ser " +
    "AUTOSSUFICIENTE: NÃO use referências como 'o texto acima', 'segundo o trecho', 'conforme a figura/tabela' ou " +
    "'de acordo com o autor' a menos que o próprio enunciado já traga o trecho necessário — o candidato NÃO verá o " +
    "material de origem, então tudo que for preciso para responder deve estar no enunciado; (5) responda " +
    "exclusivamente em JSON válido, sem comentários." +
    diretrizesIA({ banca, cargo, topico, dificuldade });
  const user =
    `Disciplina/contexto: ${contexto || "geral"}\n\n` +
    `Gere ${n} questão(ões) de múltipla escolha (4 alternativas cada) a partir do CONTEÚDO abaixo.\n\n` +
    `CONTEÚDO:\n"""\n${corta(texto, 6000)}\n"""\n\n` +
    `Formato EXATO: {"questoes":[{"enunciado":"...","alternativas":["...","...","...","..."],"correta":0}]}\n` +
    `("correta" = índice 0..3 da alternativa certa).`;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.5 });
  const arr = Array.isArray(out) ? out : out.questoes || [];
  return arr
    .filter((q) => q && q.enunciado && Array.isArray(q.alternativas) && q.alternativas.length >= 2)
    .map((q) => ({
      enunciado: String(q.enunciado).trim(),
      alternativas: q.alternativas.map((a) => String(a).trim()).filter(Boolean),
      gabarito: Math.max(0, Math.min(q.alternativas.length - 1, parseInt(q.correta, 10) || 0)),
      selo: "amarelo",
    }))
    .filter((q) => q.alternativas.length >= 2);
}

// EXTRAI as questões que JÁ EXISTEM no material (não inventa novas). Útil quando o
// PDF da aula traz uma lista de exercícios. Quando o gabarito está no próprio material,
// a questão recebe selo 📖 (extraída); quando a IA precisou inferir a correta, 🤖.
export async function extrairQuestoes(cfg, { texto, contexto, n = 30 }) {
  const system =
    "Você EXTRAI questões de múltipla escolha que JÁ ESTÃO PRESENTES no texto fornecido " +
    "(provas/exercícios da aula). Regras rígidas: (1) NÃO invente questões nem alternativas — " +
    "copie fielmente o que está no texto; (2) se houver gabarito/resposta no material, use-o e " +
    "marque gabaritoNoTexto=true; (3) se a correta não estiver indicada, escolha a mais provável e " +
    "marque gabaritoNoTexto=false; (4) ignore textos que não sejam questões. Responda só em JSON válido.";
  const user =
    `Disciplina/contexto: ${contexto || "geral"}\n\n` +
    `Extraia até ${n} questões que JÁ EXISTEM no CONTEÚDO abaixo (não crie novas).\n\n` +
    `CONTEÚDO:\n"""\n${corta(texto, 12000)}\n"""\n\n` +
    `Formato EXATO: {"questoes":[{"enunciado":"...","alternativas":["...","..."],"correta":0,"gabaritoNoTexto":true}]}`;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.1 });
  const arr = Array.isArray(out) ? out : out.questoes || [];
  return arr
    .filter((q) => q && q.enunciado && Array.isArray(q.alternativas) && q.alternativas.length >= 2)
    .map((q) => ({
      enunciado: String(q.enunciado).trim(),
      alternativas: q.alternativas.map((a) => String(a).trim()).filter(Boolean),
      gabarito: Math.max(0, Math.min(q.alternativas.length - 1, parseInt(q.correta, 10) || 0)),
      selo: q.gabaritoNoTexto ? "verde" : "amarelo",
    }))
    .filter((q) => q.alternativas.length >= 2);
}

// Normaliza a saída de itens CERTO/ERRADO da IA → {afirmacao, certo(bool), justificativa, selo}.
function normalizaCE(arr, seloFn) {
  return (arr || [])
    .filter((x) => x && x.afirmacao && (x.gabarito === "certo" || x.gabarito === "errado"))
    .map((x) => ({
      afirmacao: String(x.afirmacao).trim(),
      certo: x.gabarito === "certo",
      justificativa: String(x.justificativa || "").trim(),
      selo: seloFn ? seloFn(x) : "amarelo",
    }));
}

// GERA itens CERTO/ERRADO (estilo Cebraspe) a partir do conteúdo.
export async function gerarQuestoesCE(cfg, { texto, contexto, n = 6, dificuldade = "medio", banca, cargo, topico }) {
  const system =
    "Você elabora itens CERTO/ERRADO para concursos (estilo Cebraspe). Cada item é uma AFIRMAÇÃO " +
    "claramente verdadeira (certo) ou falsa (errado) sobre um conceito examinável, com uma breve " +
    "JUSTIFICATIVA. Regras: (1) baseie-se SOMENTE no conteúdo dado; (2) não pergunte sobre metadados " +
    "(autor, página, nome de professor); (3) misture itens certos e errados; (4) responda só em JSON válido." +
    diretrizesIA({ banca, cargo, topico, dificuldade });
  const user =
    `Disciplina/contexto: ${contexto || "geral"}\n\n` +
    `Crie ${n} itens Certo/Errado a partir do CONTEÚDO abaixo.\n\n` +
    `CONTEÚDO:\n"""\n${corta(texto, 6000)}\n"""\n\n` +
    `Formato EXATO: {"itens":[{"afirmacao":"...","gabarito":"certo|errado","justificativa":"..."}]}`;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.5 });
  return normalizaCE(Array.isArray(out) ? out : out.itens, () => "amarelo");
}

// DRILL "letra da lei": gera itens CERTO/ERRADO a partir do TEXTO OFICIAL de um dispositivo
// (artigo/súmula/tese), à moda das bancas: nos ERRADOS, altera UM ponto e devolve o trecho
// original (copiado literal) e o alterado — para o app pintar o diff (verde=correto, vermelho=trocado).
// Para jurisprudência não-literal (informativo/paráfrase), altera o TERMO/RESULTADO-chave.
export async function gerarLeiSecaCE(cfg, { texto, referencia, tipo = "lei", literal = true, n = 6, dificuldade = "medio", banca, cargo, topico }) {
  const ehJuris = tipo === "juris";
  const rotulo = ehJuris ? "súmula/tese de jurisprudência" : "dispositivo de lei";
  const comoErrar = literal
    ? "troque UM ÚNICO ponto à moda das bancas: verbo de comando (poderá↔deverá), prazo/numeral, quórum, " +
      "'vedado↔permitido', 'absolutamente↔relativamente', o sujeito, ou inclua/exclua uma exceção"
    : "altere UM ÚNICO termo ou resultado-chave (ex.: é possível↔é vedado, a competência, o prazo, o sujeito); " +
      "como o texto é paráfrase, foque no SENTIDO, não na palavra exata";
  const regraTrecho = literal
    ? "(4) para cada ERRADO devolva trechoOriginal (copiado LITERAL do texto, o pedaço que foi mudado) e trechoAlterado " +
      "(como ficou na afirmação); nos CERTO deixe ambos vazios;"
    : "(4) como o texto é PARÁFRASE (não é a letra oficial), NÃO force diff de palavra: deixe trechoOriginal e " +
      "trechoAlterado VAZIOS e faça uma afirmação CONCEITUAL sobre a tese (verdadeira ou falsa quanto ao sentido);";
  const system =
    `Você elabora itens CERTO/ERRADO de decoreba da ${rotulo}, no estilo Cebraspe, a partir do TEXTO OFICIAL fornecido. ` +
    "Regras: (1) use SOMENTE o texto dado; (2) metade CERTO (afirmação FIEL ao texto, no máximo uma leve reformulação " +
    "que preserve o sentido) e metade ERRADO; (3) no ERRADO, " + comoErrar + " — e NÃO altere mais de um ponto; " +
    regraTrecho + " (5) justificativa curta apontando o certo. Responda só em JSON válido." +
    diretrizesIA({ banca, cargo, topico, dificuldade });
  const user =
    `Referência: ${referencia || "(sem referência)"}\n\n` +
    `Crie ${n} itens Certo/Errado a partir do TEXTO OFICIAL abaixo.\n\n` +
    `TEXTO:\n"""\n${corta(texto, 4000)}\n"""\n\n` +
    `Formato EXATO: {"itens":[{"afirmacao":"...","gabarito":"certo|errado","trechoOriginal":"...","trechoAlterado":"...","justificativa":"..."}]}`;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.5 });
  const arr = Array.isArray(out) ? out : out.itens || [];
  return arr
    .map((x) => {
      const certo = /^\s*certo\s*$/i.test(String(x.gabarito || "")) || x.gabarito === true;
      return {
        afirmacao: String(x.afirmacao || "").trim(),
        certo,
        trechoOriginal: certo ? "" : String(x.trechoOriginal || "").trim(),
        trechoAlterado: certo ? "" : String(x.trechoAlterado || "").trim(),
        justificativa: String(x.justificativa || "").trim(),
      };
    })
    .filter((x) => x.afirmacao);
}

// EXTRAI itens CERTO/ERRADO que JÁ EXISTEM no material (não inventa).
export async function extrairQuestoesCE(cfg, { texto, contexto, n = 30 }) {
  const system =
    "Você EXTRAI itens CERTO/ERRADO que JÁ ESTÃO no texto (provas/exercícios). Regras: (1) NÃO invente " +
    "afirmações — copie fielmente; (2) se houver gabarito no material, use-o e marque gabaritoNoTexto=true; " +
    "(3) se não houver, infira o mais provável e marque gabaritoNoTexto=false; (4) ignore o que não for item " +
    "Certo/Errado. Responda só em JSON válido.";
  const user =
    `Disciplina/contexto: ${contexto || "geral"}\n\n` +
    `Extraia até ${n} itens Certo/Errado que JÁ EXISTEM no CONTEÚDO abaixo (não crie novos).\n\n` +
    `CONTEÚDO:\n"""\n${corta(texto, 12000)}\n"""\n\n` +
    `Formato EXATO: {"itens":[{"afirmacao":"...","gabarito":"certo|errado","justificativa":"...","gabaritoNoTexto":true}]}`;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.1 });
  return normalizaCE(Array.isArray(out) ? out : out.itens, (x) => (x.gabaritoNoTexto ? "verde" : "amarelo"));
}

// EXTRAI as questões de uma PROVA preservando o NÚMERO original de cada questão. Isso
// permite parear com o gabarito de forma robusta mesmo quando a numeração não começa em
// 1, há lacunas, ou o caderno tem versão/cor (o gabarito é por número). Não resolve, não
// inventa, não marca a resposta — o gabarito vem do quadro oficial à parte.
// formato 'mc' → {numero, enunciado, alternativas}; 'ce' → {numero, enunciado} (afirmação).
export async function extrairQuestoesProva(cfg, { texto, formato = "mc", n = 60, limiteTexto = 14000 }) {
  const ce = formato === "ce";
  const system = ce
    ? "Você EXTRAI itens CERTO/ERRADO de uma prova de concurso JÁ APLICADA. Para cada item devolva o NÚMERO " +
      "original (como aparece na prova) e a AFIRMAÇÃO, copiados fielmente. NÃO invente, NÃO resolva, NÃO marque " +
      "a resposta. Ignore o que não for item Certo/Errado. Responda só em JSON válido."
    : "Você EXTRAI questões de múltipla escolha de uma prova de concurso JÁ APLICADA. Para cada questão devolva o " +
      "NÚMERO original (como aparece na prova), o ENUNCIADO e as ALTERNATIVAS na ordem (A, B, C...). Copie " +
      "fielmente; NÃO invente, NÃO resolva, NÃO marque a correta. Responda só em JSON válido.";
  const formatoEx = ce
    ? `{"itens":[{"numero":26,"afirmacao":"..."}]}`
    : `{"itens":[{"numero":26,"enunciado":"...","alternativas":["...","...","...","..."]}]}`;
  const user =
    `Extraia até ${n} ${ce ? "itens Certo/Errado" : "questões"} da PROVA abaixo, preservando o número de cada uma.\n\n` +
    `PROVA:\n"""\n${corta(texto, limiteTexto)}\n"""\n\nFormato EXATO: ${formatoEx}`;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.1 });
  const arr = Array.isArray(out) ? out : out.itens || [];
  const num = (x) => { const v = parseInt(x.numero, 10); return Number.isInteger(v) ? v : null; };
  if (ce) {
    return arr
      .filter((x) => x && x.afirmacao)
      .map((x) => ({ numero: num(x), enunciado: String(x.afirmacao).trim(), alternativas: ["Certo", "Errado"] }));
  }
  return arr
    .filter((q) => q && q.enunciado && Array.isArray(q.alternativas) && q.alternativas.length >= 2)
    .map((q) => ({ numero: num(q), enunciado: String(q.enunciado).trim(), alternativas: q.alternativas.map((a) => String(a).trim()).filter(Boolean) }));
}

// EXTRAÇÃO RICA de questões de um PDF/export de banca (ex.: Qconcursos), com METADADOS por questão
// (código/referência, assunto, banca, ano, órgão) e GABARITO que costuma vir num bloco no FINAL.
// NÃO inventa, NÃO resolve: só copia o que está no texto e aplica o gabarito informado.
export async function extrairQuestoesPDF(cfg, { texto, formato = "mc", n = 60, limiteTexto = 16000 }) {
  const ce = formato === "ce";
  const system =
    `Você EXTRAI questões de concurso ${ce ? "no formato CERTO/ERRADO" : "de MÚLTIPLA ESCOLHA"} de um texto exportado ` +
    "de banca/site (ex.: Qconcursos), copiando FIELMENTE — NÃO invente, NÃO crie alternativas, NÃO reescreva. " +
    "Para CADA questão devolva: " +
    (ce
      ? "enunciado (a afirmação completa, juntando linhas quebradas); "
      : "enunciado (a pergunta completa, juntando linhas quebradas) e alternativas (array NA ORDEM, SEM a letra 'A)'/'(A)'); ") +
    "numero (o NÚMERO impresso da questão na prova, ex.: 12; \"\" se não houver); " +
    "referencia (o CÓDIGO da questão, ex.: 'Q4037745'; \"\" se não houver); " +
    "assunto (o tema após a disciplina, geralmente após '>' ou em 'Assunto:', ex.: 'Administração Pública - Servidores Públicos'); " +
    "banca (ex.: 'IVIN', 'COPERVE-UFSC'), ano (ex.: '2026') e orgao (ex.: 'Prefeitura de Simões' ou a 'Prova:'). " +
    "REGRA DO GABARITO (crítica): a resposta correta quase sempre vem num BLOCO no FINAL do texto (ex.: 'Respostas', " +
    "'Gabarito': '1:B 2:B 3:A ...' ou '1-B'). USE esse bloco para definir, por NÚMERO de questão (1 = primeira, na ordem), " +
    (ce
      ? "o campo certo=true/false (B/Certo/C→certo conforme o gabarito; E/Errado/F→errado). "
      : "o campo gabarito (índice 0-based: A=0, B=1, C=2, D=3, E=4). ") +
    "Se não houver bloco de respostas, gabarito=0 (ou certo=false). " +
    "ANTI-ALUCINAÇÃO: referencia, assunto, banca, ano e orgao só devem ser preenchidos se ESTIVEREM ESCRITOS no texto; " +
    "se algum não aparecer, devolva \"\" — NUNCA invente código, banca, ano ou órgão. " +
    "Ignore propaganda, marca d'água do site, 'Resumo relacionado' e cabeçalhos de página. Responda só em JSON válido.";
  const formatoEx = ce
    ? `{"itens":[{"numero":12,"enunciado":"...","certo":true,"referencia":"Q123","assunto":"...","banca":"...","ano":"2026","orgao":"...","justificativa":""}]}`
    : `{"itens":[{"numero":12,"enunciado":"...","alternativas":["...","...","..."],"gabarito":1,"referencia":"Q123","assunto":"...","banca":"...","ano":"2026","orgao":"..."}]}`;
  const user =
    `Extraia até ${n} ${ce ? "itens Certo/Errado" : "questões"} do TEXTO abaixo, com os metadados e aplicando o gabarito do bloco de respostas (se houver).\n\n` +
    `TEXTO:\n"""\n${corta(texto, limiteTexto)}\n"""\n\nFormato EXATO: ${formatoEx}`;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.1 });
  const arr = Array.isArray(out) ? out : out.itens || [];
  const meta = (x) => ({
    numero: Number.isInteger(parseInt(x.numero, 10)) ? parseInt(x.numero, 10) : null,
    referencia: String(x.referencia || "").trim(),
    assunto: String(x.assunto || "").trim(),
    banca: String(x.banca || "").trim(),
    ano: String(x.ano || "").trim(),
    orgao: String(x.orgao || "").trim(),
  });
  if (ce) {
    return arr
      .filter((x) => x && (x.enunciado || x.afirmacao))
      .map((x) => ({ enunciado: String(x.enunciado || x.afirmacao).trim(), certo: !!x.certo, justificativa: String(x.justificativa || "").trim(), ...meta(x) }));
  }
  return arr
    .filter((q) => q && q.enunciado && Array.isArray(q.alternativas) && q.alternativas.length >= 2)
    .map((q) => {
      const alternativas = q.alternativas.map((a) => String(a).trim()).filter(Boolean);
      let gabarito = parseInt(q.gabarito, 10);
      if (!Number.isInteger(gabarito) || gabarito < 0 || gabarito >= alternativas.length) gabarito = 0;
      return { enunciado: String(q.enunciado).trim(), alternativas, gabarito, ...meta(q) };
    });
}

// Gera flashcards (pergunta → resposta) a partir do conteúdo.
export async function gerarFlashcards(cfg, { texto, contexto, n = 6, dificuldade = "medio", banca, cargo, topico }) {
  const system =
    "Você cria flashcards de estudo para concursos. Cada flashcard tem uma FRENTE (pergunta " +
    "objetiva sobre um conceito examinável) e um VERSO (resposta correta e concisa). Baseie-se " +
    "SOMENTE no conteúdo fornecido; não invente; não pergunte sobre metadados (autor, página, " +
    "nome de professor). Responda exclusivamente em JSON válido." +
    diretrizesIA({ banca, cargo, topico, dificuldade });
  const user =
    `Disciplina/contexto: ${contexto || "geral"}\n\n` +
    `Crie ${n} flashcards a partir do CONTEÚDO abaixo.\n\n` +
    `CONTEÚDO:\n"""\n${corta(texto, 6000)}\n"""\n\n` +
    `Formato EXATO: {"cards":[{"frente":"...","verso":"..."}]}`;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.5 });
  const arr = Array.isArray(out) ? out : out.cards || [];
  return arr
    .filter((c) => c && c.frente && c.verso)
    .map((c) => ({ frente: String(c.frente).trim(), verso: String(c.verso).trim(), selo: "amarelo" }));
}

// COMENTA questões já existentes para virar flashcards: o verso EXPLICA por que a
// alternativa correta é a certa (e por que as outras erram). Não inventa questões.
export async function comentarQuestoesParaFlashcards(cfg, { questoes, contexto }) {
  const lista = questoes
    .map((q, i) => {
      const alts = (q.alternativas || [])
        .map((a, j) => `${String.fromCharCode(65 + j)}) ${a}${j === q.correta ? " [CORRETA]" : ""}`)
        .join("\n");
      return `Q${i + 1}. ${q.enunciado}\n${alts}`;
    })
    .join("\n\n");
  const system =
    "Você cria flashcards a partir de QUESTÕES de múltipla escolha JÁ EXISTENTES. Para CADA questão, monte um " +
    "flashcard cujo VERSO EXPLIQUE, de forma didática e tecnicamente correta, por que a alternativa marcada como " +
    "correta é a certa e, quando útil, por que as outras estão erradas. NÃO invente questões novas; comente as " +
    "fornecidas, na MESMA ORDEM. A frente é o enunciado da questão. Responda só em JSON válido.";
  const user =
    `Disciplina/contexto: ${contexto || "geral"}\n\n` +
    `QUESTÕES:\n"""\n${corta(lista, 9000)}\n"""\n\n` +
    `Formato EXATO: {"cards":[{"frente":"enunciado da questão","verso":"explicação do gabarito"}]} (uma entrada por questão, na ordem).`;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.3 });
  const arr = Array.isArray(out) ? out : out.cards || [];
  return arr
    .filter((c) => c && c.frente && c.verso)
    .map((c) => ({ frente: String(c.frente).trim(), verso: String(c.verso).trim(), selo: "amarelo" }));
}

// EXTRAI tarefas de um cronograma/trilha, separando o TÍTULO (ação curta) da
// OBSERVAÇÃO (detalhes/lembretes daquele item, ex.: "atenção ao art. X"). Não inventa.
export async function extrairTarefas(cfg, { texto, contexto }) {
  const system =
    "Você organiza um cronograma/trilha de estudos em TAREFAS. Para cada item, separe o " +
    "TÍTULO da tarefa (curto e acionável) da OBSERVAÇÃO (detalhes, lembretes ou ressalvas " +
    "daquela tarefa, ex.: 'atenção ao art. X', 'priorizar súmulas'). Regras: (1) baseie-se " +
    "SOMENTE no texto dado, sem inventar; (2) cada LINHA é uma tarefa (marcador •/-/* é OPCIONAL; " +
    "una só linhas que claramente descrevem a MESMA tarefa quebrada em duas); (3) se um item não tiver " +
    "observação, deixe-a vazia; (4) SEPARADOR EXPLÍCITO: se a linha contiver '//', tudo após o '//' é a " +
    "observacao e NÃO faz parte do titulo (ex.: 'Ler Lei 8.112 // focar arts. 116 e 117'); (5) min = duração em MINUTOS " +
    "se a tarefa indicar tempo (ex.: '50 min', '(40 min)', '1h' → 60, '2h' → 120, '1h15' → 75; null se não houver; não repita o tempo no titulo). " +
    "Responda só em JSON válido.";
  const user =
    `Contexto (disciplina/tópico): ${contexto || "geral"}\n\n` +
    `TEXTO DO CRONOGRAMA/TRILHA:\n"""\n${corta(texto, 6000)}\n"""\n\n` +
    `Formato EXATO: {"tarefas":[{"titulo":"...","observacao":"...","min":null}]}  ("observacao" = "" se não houver).`;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.2 });
  const arr = Array.isArray(out) ? out : out.tarefas || [];
  return arr
    .filter((t) => t && t.titulo)
    .map((t) => ({ titulo: String(t.titulo).trim(), observacao: String(t.observacao || "").trim(), min: t.min != null ? Number(t.min) : null }));
}

// EXTRAI referências de LEI (artigos/dispositivos) ou de JURISPRUDÊNCIA (súmulas,
// temas repetitivos, precedentes) que JÁ APARECEM no material — não inventa. Para
// jurisprudência, tenta identificar o tribunal (TJSP/TRT/STJ/STF) e a categoria.
export async function extrairIndicacoes(cfg, { texto, contexto, tipo }) {
  const ehJuris = tipo === "juris";
  const system = ehJuris
    ? "Você EXTRAI referências de JURISPRUDÊNCIA (súmulas, temas repetitivos, precedentes obrigatórios) que " +
      "JÁ APARECEM no texto. Regras: (1) NÃO invente — só o que está citado no material; (2) para cada uma, dê a " +
      "referência curta (ex.: 'Súmula 473 STF', 'Tema 1234 STJ') e um resumo de 1 frase (curto) do que ela trata, com base " +
      "no texto; (3) identifique o tribunal (TJSP, TRT, STJ ou STF) e a categoria (Súmula, Tema repetitivo ou " +
      "Precedente obrigatório) quando possível; (4) NÃO repita a mesma referência (sem duplicatas); (5) responda só em JSON válido."
    : "Você EXTRAI referências de LEI (artigos e dispositivos legais) que JÁ APARECEM no texto. Regras: (1) NÃO " +
      "invente — só o que está citado no material; (2) para cada uma, dê a referência curta (ex.: 'art. 37, caput, " +
      "CF', 'art. 312, CP') e um resumo de 1 frase (curto) do que o dispositivo trata, com base no texto; (3) NÃO repita a mesma referência (sem duplicatas); (4) responda só em JSON válido.";
  const formato = ehJuris
    ? `{"itens":[{"referencia":"Súmula 473 STF","texto":"...","tribunal":"STF","categoria":"Súmula"}]}`
    : `{"itens":[{"referencia":"art. 37, CF","texto":"..."}]}`;
  const user =
    `Disciplina/contexto: ${contexto || "geral"}\n\n` +
    `Extraia as referências de ${ehJuris ? "jurisprudência" : "lei"} que JÁ ESTÃO no CONTEÚDO abaixo (não crie novas).\n\n` +
    `CONTEÚDO:\n"""\n${corta(texto, 12000)}\n"""\n\n` +
    `Formato EXATO: ${formato}`;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.1 });
  const arr = Array.isArray(out) ? out : out.itens || [];
  const TRIB = ["TJSP", "TRT", "STJ", "STF"];
  const CAT = ["Súmula", "Tema repetitivo", "Precedente obrigatório"];
  return arr
    .filter((x) => x && x.referencia)
    .map((x) => ({
      referencia: String(x.referencia).trim(),
      texto: String(x.texto || "").trim(),
      tribunal: ehJuris && TRIB.includes(x.tribunal) ? x.tribunal : null,
      categoria: ehJuris && CAT.includes(x.categoria) ? x.categoria : null,
    }))
    .filter((x) => x.referencia);
}

// Explica UM flashcard (frente + verso) para tirar a dúvida do aluno na revisão.
export async function explicarFlashcard(cfg, { frente, verso, contexto }) {
  const system =
    "Você é um tutor de concursos. Explique o conteúdo deste flashcard de forma didática e tecnicamente correta. " +
    'Devolva DOIS níveis em JSON: {"resumido":"...","detalhado":"..."}. ' +
    "RESUMIDO: 1 a 2 frases esclarecendo a resposta. " +
    "DETALHADO: aprofunde o conceito por trás da resposta, com o porquê e, quando útil, um exemplo ou ponto de atenção. " +
    "Não invente lei ou jurisprudência; se precisar citar, use termos genéricos. Responda SÓ JSON.";
  const user = `Contexto: ${contexto || "geral"}\nFRENTE (pergunta): ${frente}\nVERSO (resposta): ${verso}`;
  const r = (await chamar(cfg, { system, user, json: true, temperature: 0.4 })) || {};
  return { resumido: String(r.resumido || "").trim(), detalhado: String(r.detalhado || "").trim(), selo: "amarelo" };
}

// Comenta UMA questão objetiva (sob demanda, 🤖): explica por que a alternativa correta
// é a certa e, quando útil, por que as demais erram. Texto corrido, didático.
export async function comentarQuestao(cfg, { enunciado, alternativas, correta, formato, duvida }) {
  const ce = formato === "ce";
  const system =
    "Você é um professor de cursinho. Explique o gabarito" +
    (ce ? " de um item CERTO/ERRADO" : " de uma questão de múltipla escolha") +
    " de forma didática e tecnicamente correta. " +
    'Devolva DOIS níveis de explicação em JSON: {"resumido":"...","detalhado":"..."}. ' +
    "RESUMIDO: 1 a 2 frases com a razão central do gabarito. " +
    (ce
      ? "DETALHADO: explique POR QUE a afirmação está certa ou errada, apontando o conceito/regra que a sustenta ou a contradiz."
      : "DETALHADO: comente CADA alternativa, uma a uma, dizendo se está correta ou incorreta e POR QUÊ " +
        "(ex.: 'A) ... — incorreta porque ...'; 'B) ... — correta porque ...'). Deixe claro por que a correta é a melhor.") +
    (duvida ? " IMPORTANTE: o aluno fez uma DÚVIDA específica — responda-a diretamente e em primeiro lugar no DETALHADO, sem fugir do que ele perguntou." : "") +
    " Não invente lei ou jurisprudência; se precisar citar, use termos genéricos. Responda SÓ JSON.";
  const alts = ce
    ? `Gabarito: ${correta}`
    : (alternativas || []).map((a, i) => `${String.fromCharCode(65 + i)}) ${a}${i === correta ? " [CORRETA]" : ""}`).join("\n");
  const user = `ENUNCIADO: ${enunciado}\n${alts}` + (duvida ? `\nDÚVIDA do aluno (responda diretamente): ${duvida}` : "");
  const r = (await chamar(cfg, { system, user, json: true, temperature: 0.4 })) || {};
  return { resumido: String(r.resumido || "").trim(), detalhado: String(r.detalhado || "").trim(), selo: "amarelo" };
}

// Comenta uma PROVA inteira (sob demanda, 🤖): visão geral dos temas cobrados, nível e
// dicas de foco. Baseia-se SÓ nos enunciados/gabaritos fornecidos.
export async function comentarProva(cfg, { titulo, questoes }) {
  const lista = (questoes || [])
    .map((q, i) => `${i + 1}. ${q.enunciado}${q.gabarito ? ` (resp.: ${q.gabarito})` : ""}`)
    .join("\n");
  const system =
    "Você é um mentor de concursos. Recebe as questões de UMA prova e devolve uma visão geral útil para estudo: " +
    "os principais temas/assuntos cobrados, o nível geral e 2 a 4 dicas de foco para quem vai resolver esta prova. " +
    "Baseie-se SOMENTE nas questões fornecidas; não invente. Seja conciso. Texto corrido (markdown leve), sem JSON.";
  const t = await chamar(cfg, { system, user: `PROVA: ${titulo}\n\nQUESTÕES:\n"""\n${corta(lista, 8000)}\n"""`, json: false, temperature: 0.4 });
  return { texto: String(t).trim(), selo: "amarelo" };
}

// Comenta um erro do caderno: explica o porquê e como não repetir.
export async function comentarErro(cfg, { enunciado, escolhida, correta, motivo, duvida }) {
  const system =
    "Você é um mentor de concursos. Explique um erro do aluno. " +
    'Devolva DOIS níveis em JSON: {"resumido":"...","detalhado":"..."}. ' +
    "RESUMIDO: 1 a 2 frases com o ponto central (por que a correta é correta e a marcada é errada). " +
    "DETALHADO: explique por que a resposta correta é a correta e por que a escolhida está errada, " +
    "e dê uma dica prática para não repetir o erro. " +
    (duvida ? "IMPORTANTE: o aluno fez uma DÚVIDA específica — responda-a diretamente e em primeiro lugar no DETALHADO, sem fugir do que ele perguntou. " : "") +
    "Não invente jurisprudência nem números de lei; se citar, use termos genéricos. Responda SÓ JSON.";
  const user =
    `Questão/erro: ${enunciado || "(sem enunciado)"}\n` +
    `Resposta marcada (errada): ${escolhida || "(não informada)"}\n` +
    `Resposta correta: ${correta || "(não informada)"}\n` +
    `Motivo declarado pelo aluno: ${motivo || "(não informado)"}` +
    (duvida ? `\nDÚVIDA do aluno (responda diretamente): ${duvida}` : "");
  const r = (await chamar(cfg, { system, user, json: true, temperature: 0.4 })) || {};
  return { resumido: String(r.resumido || "").trim(), detalhado: String(r.detalhado || "").trim(), selo: "amarelo" };
}

// Correção de mérito de discursiva/redação (complementa as métricas offline).
export async function corrigirTexto(cfg, { texto, tipo, enunciado }) {
  const system =
    "Você é um corretor de provas discursivas/redações de concurso. Avalie o texto por critérios " +
    "e dê uma nota qualitativa (boa/média/baixa) em cada um, com observação objetiva. Inclua um " +
    "comentário geral de mérito (o que melhorar no conteúdo e na argumentação). Seja honesto e " +
    "específico. Responda exclusivamente em JSON válido.";
  const user =
    `Tipo: ${tipo || "discursiva"}\n` +
    `Tema/enunciado: ${enunciado || "(não informado)"}\n\n` +
    `TEXTO DO CANDIDATO:\n"""\n${corta(texto, 7000)}\n"""\n\n` +
    `Formato EXATO: {"criterios":[{"criterio":"Conteúdo/mérito","nota":"boa|média|baixa","obs":"..."},` +
    `{"criterio":"Argumentação","nota":"...","obs":"..."},{"criterio":"Adequação ao tema","nota":"...","obs":"..."}],` +
    `"comentario":"comentário geral de mérito"}`;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.3 });
  const criterios = Array.isArray(out.criterios)
    ? out.criterios
        .filter((c) => c && c.criterio)
        .map((c) => ({ criterio: String(c.criterio), nota: normalizaNota(c.nota), obs: String(c.obs || "") }))
    : [];
  return { criterios, comentario: String(out.comentario || "").trim(), selo: "amarelo" };
}

// Resposta do mentor (chat), ancorada nos trechos do material do usuário.
// Com web=true e provedor Gemini, usa BUSCA NA WEB ao vivo (Google Search grounding)
// e devolve as fontes web (fontesWeb). Em outros provedores, o web é ignorado.
export async function responderChat(cfg, { pergunta, fontes, web, perfil }) {
  const contexto = (fontes || [])
    .map((f, i) => `[${i + 1}] (${f.origem})\n${f.trecho}`)
    .join("\n\n");
  const ancora = contexto
    ? `TRECHOS DO MATERIAL DO USUÁRIO:\n${corta(contexto, 6000)}`
    : "(Sem trechos relevantes no material do usuário.)";
  // Perfil curto do aluno (concurso, dias p/ prova, cobertura, pontos fracos) para personalizar
  // a resposta — sem isso o chat responde "no vácuo", sem saber o contexto do aluno.
  const perfilLinha = perfil ? `PERFIL DO ALUNO (para personalizar; não repita literalmente): ${perfil}\n\n` : "";

  if (web && cfg.iaProvider === "gemini") {
    const system =
      PERSONA_MENTOR + " Responda à pergunta usando BUSCA NA WEB quando " +
      "ajudar, e também os trechos do material dele. Adapte a resposta ao PERFIL do aluno (concurso, " +
      "prova, pontos fracos) quando fizer sentido. Cite as fontes. IMPORTANTE: para concursos, " +
      "leis e prazos mudam — avise que a resposta pode estar desatualizada e oriente conferir a " +
      "fonte oficial (lei, edital, site do tribunal). Seja direto e didático. Texto corrido.";
    const user = `${perfilLinha}PERGUNTA: ${pergunta}\n\n${ancora}`;
    return responderChatWebGemini(cfg, { system, user });
  }

  const system =
    PERSONA_MENTOR + " Responda à pergunta APOIANDO-SE nos trechos do " +
    "material dele (fornecidos abaixo). Adapte a resposta ao PERFIL do aluno (concurso, prova, " +
    "pontos fracos) quando fizer sentido. Se os trechos bastarem, responda com base neles e cite " +
    "a fonte entre colchetes, ex.: [1]. Se não bastarem, responda com seu conhecimento geral, mas " +
    "AVISE explicitamente que é conhecimento geral (não do material dele, e não é busca na web) e " +
    "sugira o que estudar. Seja direto e didático. Texto corrido.";
  const user = `${perfilLinha}PERGUNTA: ${pergunta}\n\n${ancora}`;
  const texto = await chamar(cfg, { system, user, json: false, temperature: 0.4 });
  return { texto: String(texto).trim(), selo: "amarelo", fontesWeb: [] };
}

// ===== Fase 2 — STREAMING REAL (SSE) + MULTI-TURNO =====
// O chat deixou de "digitar" uma resposta já pronta: o texto chega token a token do
// streamGenerateContent do Gemini. `contents` é a conversa completa (turnos user/model);
// `onChunk(textoAcumulado)` é chamado a cada pedaço — como recebe o texto ACUMULADO,
// um retry de modelo/chave (resiliente) apenas "reinicia" o balão, sem duplicar.
async function geminiStreamRaw(cfg, { system, contents, temperature = 0.4, tools, onChunk, signal }) {
  const modelo = (cfg.iaModelo || "").trim() || MODELO_PADRAO.gemini;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:streamGenerateContent` +
    `?alt=sse&key=${encodeURIComponent(cfg.iaKey.trim())}`;
  const body = {
    contents,
    generationConfig: { temperature },
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    ...(tools ? { tools } : {}),
  };
  let resp;
  try {
    resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (e && e.name === "AbortError") throw e; // parada pedida pelo usuário: propaga como está
    const err = new Error(`Gemini: falha de conexão (${e && e.message ? e.message : "rede"}).`);
    err.code = "NETWORK";
    err.transiente = true;
    throw err;
  }
  if (!resp.ok) throw await mensagemErro(resp, "Gemini");
  if (!resp.body || !resp.body.getReader) {
    // Ambiente sem ReadableStream (raro): degrada para a resposta inteira de uma vez.
    const data = await resp.json();
    const cand = data && data.candidates && data.candidates[0];
    const texto = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || "").join("") : "";
    if (!texto) throw new Error("A IA não retornou conteúdo.");
    if (onChunk) onChunk(texto);
    return { texto: texto.trim(), fontesWeb: [] };
  }
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let texto = "";
  const fontesWeb = [];
  const vistos = new Set();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const linha = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!linha.startsWith("data:")) continue;
      const payload = linha.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let j;
      try { j = JSON.parse(payload); } catch (_) { continue; }
      const cand = j.candidates && j.candidates[0];
      if (!cand) continue;
      const t = cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || "").join("") : "";
      if (t) {
        texto += t;
        if (onChunk) onChunk(texto);
      }
      const gchunks = (cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
      for (const c of gchunks) {
        if (c.web && c.web.uri && !vistos.has(c.web.uri)) {
          vistos.add(c.web.uri);
          fontesWeb.push({ titulo: c.web.title || c.web.uri, uri: c.web.uri });
        }
      }
    }
  }
  if (!texto) throw new Error("A IA não retornou conteúdo.");
  return { texto: texto.trim(), fontesWeb };
}

// Chat com streaming + memória de turnos. `historico` = [{who:"user"|"bot", texto}] (as
// últimas trocas); vira `contents` multi-turno para follow-ups ("e o prazo disso?").
// Fallback sem streaming (claude-cli): responde inteiro e dispara onChunk uma vez.
export async function responderChatStream(cfg, { pergunta, fontes, web, perfil, historico, onChunk, signal }) {
  const contexto = (fontes || []).map((f, i) => `[${i + 1}] (${f.origem})\n${f.trecho}`).join("\n\n");
  const ancora = contexto ? `TRECHOS DO MATERIAL DO USUÁRIO:\n${corta(contexto, 6000)}` : "(Sem trechos relevantes no material do usuário.)";
  const perfilLinha = perfil ? `PERFIL DO ALUNO (para personalizar; não repita literalmente): ${perfil}\n\n` : "";
  const system = web && cfg.iaProvider === "gemini"
    ? PERSONA_MENTOR +
      " Responda à pergunta usando BUSCA NA WEB quando ajudar, e também os trechos do material do aluno. " +
      "Cite as fontes. IMPORTANTE: para concursos, leis e prazos mudam — avise que a resposta pode estar " +
      "desatualizada e oriente conferir a fonte oficial. Seja direto e didático. Texto corrido."
    : PERSONA_MENTOR +
      " Responda à pergunta APOIANDO-SE nos trechos do material do aluno (fornecidos abaixo). Se os trechos " +
      "bastarem, responda com base neles e cite a fonte entre colchetes, ex.: [1]. Se não bastarem, responda " +
      "com seu conhecimento geral, mas AVISE que é conhecimento geral (não do material dele) e sugira o que " +
      "estudar. Considere a CONVERSA anterior ao interpretar a pergunta. Seja direto e didático. Texto corrido.";
  // Conversa anterior (últimos turnos) + pergunta atual com o contexto RAG.
  const turnos = (historico || [])
    .slice(-6)
    .filter((m) => m && m.texto)
    .map((m) => ({ role: m.who === "user" ? "user" : "model", parts: [{ text: corta(m.texto, 1500) }] }));
  const contents = [...turnos, { role: "user", parts: [{ text: `${perfilLinha}PERGUNTA: ${pergunta}\n\n${ancora}` }] }];

  if (cfg.iaProvider !== "gemini") {
    // claude-cli: sem streaming — usa a rota clássica e entrega o texto inteiro.
    const r = await responderChat(cfg, { pergunta, fontes, web: false, perfil });
    if (onChunk) onChunk(r.texto);
    return { texto: r.texto, fontesWeb: [] };
  }
  const tools = web ? [{ google_search: {} }] : undefined;
  return geminiResiliente(cfg, (c) => geminiStreamRaw(c, { system, contents, temperature: 0.4, tools, onChunk, signal }));
}

// Chamada Gemini com a ferramenta de Busca Google (grounding). Devolve texto + fontes web.
function responderChatWebGemini(cfg, opts) {
  return geminiResiliente(cfg, (c) => responderChatWebGeminiRaw(c, opts));
}

async function responderChatWebGeminiRaw(cfg, { system, user }) {
  const modelo = (cfg.iaModelo || "").trim() || MODELO_PADRAO.gemini;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent` +
    `?key=${encodeURIComponent(cfg.iaKey.trim())}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: user }] }],
    systemInstruction: { parts: [{ text: system }] },
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.4 },
  };
  const resp = await fetchIA(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, "Gemini (web)");
  const data = await resp.json();
  const cand = data && data.candidates && data.candidates[0];
  const texto = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || "").join("") : "";
  const chunks = (cand && cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
  const fontesWeb = chunks
    .map((c) => (c.web ? { titulo: c.web.title || c.web.uri, uri: c.web.uri } : null))
    .filter(Boolean);
  if (!texto) throw new Error("A IA não retornou conteúdo da busca web.");
  return { texto: texto.trim(), selo: "amarelo", fontesWeb };
}

// DISCURSIVA — gera UMA pergunta discursiva (ou tema de redação) a partir de um
// tópico/material/tema livre. Devolve só o enunciado.
export async function gerarPerguntaDiscursiva(cfg, { contexto, texto, tipo }) {
  const ehRedacao = tipo === "redacao";
  const system = ehRedacao
    ? "Você propõe UM tema de redação dissertativo-argumentativa de concurso, claro e atual, no estilo de banca brasileira. Responda APENAS com o tema/proposta (1 a 3 frases), sem desenvolver."
    : "Você elabora UMA questão discursiva de concurso brasileiro, clara e objetiva, no estilo de banca, exigindo desenvolvimento. Responda APENAS com o enunciado (1 a 3 frases), sem resolver.";
  const user =
    `Assunto/contexto: ${contexto || "geral"}\n` +
    (texto ? `\nBaseie-se neste conteúdo do aluno:\n"""\n${corta(texto, 5000)}\n"""` : "");
  const enunciado = await chamar(cfg, { system, user, json: false, temperature: 0.7 });
  return { enunciado: String(enunciado).trim().replace(/^["“]|["”]$/g, "") };
}

// DISCURSIVA — corrige a resposta do aluno com feedback rico: o que deveria constar,
// o que faltou, o que errou, pontos fortes e como melhorar. Com web=true (Gemini),
// pesquisa na internet para checar fatos/atualidade e devolve as fontes.
export async function corrigirDiscursiva(cfg, { enunciado, texto, tipo, web, palavras }) {
  const usaWeb = web && cfg.iaProvider === "gemini";
  const ehRedacao = tipo === "redacao";
  const linhasEstim = palavras ? Math.max(1, Math.round(palavras / 11)) : null; // ~11 palavras/linha
  const system =
    "Você é um EXAMINADOR SÊNIOR de provas discursivas/redações de concurso público brasileiro " +
    "(padrão Cebraspe/FGV/FCC/VUNESP), rigoroso, analítico e técnico, corrigindo por ESPELHO oficial. " +
    "Seja cirúrgico e honesto: NÃO faça elogios genéricos; aponte exatamente o TRECHO onde ocorre cada desvio. " +
    "IMPORTANTE: você recebe APENAS o TEXTO digitado do candidato (sem a folha física) — portanto NÃO avalie " +
    "margem, justificação, translineação, recuo de parágrafo nem caligrafia, e cite os erros pelo TRECHO " +
    "(entre aspas), NUNCA por número de linha. Baseie-se SOMENTE no que o candidato escreveu; não presuma o " +
    "que ele não disse. Organize a correção EXATAMENTE nestas seções, com **negrito** nos títulos:\n\n" +
    "**1. Macroestrutura (conteúdo técnico)** — avalie e dê nota 0–10 a cada item, justificando:\n" +
    "• Aderência ao comando: respondeu exatamente ao que foi pedido, ou tangenciou/fugiu?\n" +
    "• Subunidades do comando: decomponha o enunciado em suas frações lógicas (ex.: identificar, conceituar, " +
    "exemplificar, fundamentar) e marque cada uma como CUMPRIDA, PARCIAL ou AUSENTE.\n" +
    "• Densidade de palavras-chave: liste os termos técnicos essenciais que o candidato USOU e os que FALTARAM " +
    "(os que o espelho cobraria).\n" +
    "• Fundamentação e base legal: há indicação precisa e CORRETA de leis, artigos, incisos, súmulas e " +
    "jurisprudência pertinentes? Aponte dispositivos inventados, errados ou desatualizados.\n" +
    "• Precisão dos institutos: houve confusão entre conceitos parecidos? Cite.\n\n" +
    "**2. Mesoestrutura (arquitetura textual)** — para cada item, diga Conforme/Inconforme e explique:\n" +
    "• Introdução com tese clara, desenvolvimento e conclusão.\n" +
    "• Encadeamento por conectivos: cite os operadores argumentativos usados (e onde faltaram) na abertura dos " +
    "parágrafos e nas transições.\n" +
    "• Proporção/simetria dos parágrafos e progressão lógica das ideias.\n" +
    "• Repetições e monotonias: aponte palavras/estruturas repetidas em excesso.\n\n" +
    "**3. Microestrutura (rigor gramatical)** — varredura mecânica. Liste CADA erro no formato:\n" +
    "Trecho: \"…\" | Tipo: [Crase/Regência/Concordância/Pontuação/Paralelismo/Ortografia/Coesão] | Correção: \"…\".\n" +
    "Se não houver erros relevantes, escreva 'sem erros relevantes'.\n\n" +
    "**4. Nota e memória de cálculo** — dê a NOTA FINAL de 0 a 10 e mostre o raciocínio: parta da média do " +
    "conteúdo (bloco 1) e PENALIZE os erros do bloco 3 de forma proporcional à extensão do texto (estilo " +
    "Cebraspe: a nota cai com a densidade de erros por linha). Penalize erro técnico-jurídico MAIS do que " +
    "deslize de forma. Feche com um veredito: Insuficiente / Regular / Bom / Excelente.\n\n" +
    "**Pontos fortes** — o que o candidato fez bem (objetivo, sem inflar).\n" +
    "**Como melhorar** — 2 a 4 orientações práticas e acionáveis para a próxima resposta." +
    (usaWeb
      ? " Use BUSCA NA WEB para conferir leis, súmulas e atualidade; cite as fontes e lembre que prazos/normas podem mudar (confira a fonte oficial)."
      : " Quando não puder confirmar uma lei/precedente, sinalize que o candidato deve conferir a fonte oficial, em vez de afirmar como certo.");
  const user =
    `Tipo: ${ehRedacao ? "redação dissertativo-argumentativa" : "questão discursiva"}\n` +
    `Pergunta/tema: ${enunciado || "(não informado — avalie como tema livre, inferindo o comando)"}\n` +
    (palavras ? `Extensão: ${palavras} palavras (~${linhasEstim} linhas estimadas).\n` : "") +
    `\nRESPOSTA DO CANDIDATO:\n"""\n${corta(texto, 7000)}\n"""`;

  if (usaWeb) {
    const r = await responderChatWebGemini(cfg, { system, user });
    return { texto: r.texto, fontesWeb: r.fontesWeb, selo: "amarelo" };
  }
  const t = await chamar(cfg, { system, user, json: false, temperature: 0.4 });
  return { texto: String(t).trim(), fontesWeb: [], selo: "amarelo" };
}

// SINTETIZAR RESUMO (🤖): recebe o MESMO conteúdo bruto que a compilação offline reúne
// (material, flashcards, erros, lei/juris) e devolve um resumo CONDENSADO e DIDÁTICO em
// HTML simples (parágrafos curtos, listas, **negrito** em termos-chave). Diferente da
// compilação offline (que só concatena fielmente), aqui a IA organiza e enxuga — sempre
// FIEL ao conteúdo dado, sem inventar. Texto corrido em HTML (sem JSON).
export async function sintetizarResumo(cfg, { texto, contexto }) {
  const system =
    "Você é um mentor de estudos para concursos públicos brasileiros. Recebe o material de " +
    "estudo do aluno (trechos de apostila, flashcards, erros, lei e jurisprudência) e produz " +
    "um RESUMO CONDENSADO e DIDÁTICO desse conteúdo. Regras rígidas:\n" +
    "(1) Seja FIEL ao conteúdo fornecido — NÃO invente fatos, leis, números ou jurisprudência " +
    "que não estejam no material; se algo estiver incompleto, não preencha lacunas com suposições.\n" +
    "(2) CONDENSE: elimine repetições e enrolação, mantenha o que é examinável e essencial.\n" +
    "(3) ORGANIZE de forma didática: agrupe por tema, vá do geral ao específico, destaque " +
    "definições, classificações, requisitos, exceções e pegadinhas.\n" +
    "(4) Linguagem clara e objetiva para estudo de concurso.\n" +
    "(5) Formato de saída: HTML SIMPLES apenas com estas tags: <p>, <ul>, <li>, <b>, <h3>. " +
    "Parágrafos curtos; use <ul>/<li> para enumerações; use <b> em termos-chave; use <h3> para " +
    "títulos de seção quando ajudar. NÃO use markdown, NÃO use cercas de código; responda só o HTML do resumo.";
  const user =
    `Disciplina/contexto: ${contexto || "geral"}\n\n` +
    `Sintetize o CONTEÚDO abaixo num resumo enxuto, fiel e bem estruturado.\n\n` +
    `CONTEÚDO:\n"""\n${corta(texto, 12000)}\n"""`;
  const t = await chamar(cfg, { system, user, json: false, temperature: 0.3 });
  return limparHTMLResumo(t);
}

// Normaliza a saída da IA para o HTML simples esperado pelo editor de resumos: remove
// cercas de código, converte **negrito** residual em <b>, e garante ao menos um <p>.
function limparHTMLResumo(texto) {
  let s = String(texto || "").trim();
  s = s.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();
  s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); // markdown residual → <b>
  if (!/<(p|ul|ol|h\d|li)\b/i.test(s)) {
    s = s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${p}</p>`).join("") || `<p>${s}</p>`;
  }
  return s.trim();
}

// AVALIAR RECORDAÇÃO (recall) da revisão de tópico: o aluno escreveu de memória o que
// lembra; compara com o conteúdo de referência e dá feedback curto + sugestão de nota.
export async function avaliarRecall(cfg, { topico, referencia, texto }) {
  const system =
    "Você é um tutor de estudos gentil e direto. O aluno fez RECORDAÇÃO ATIVA (brain-dump): " +
    "escreveu de memória o que lembra de um tópico, sem consultar. Compare com o CONTEÚDO DE " +
    "REFERÊNCIA e devolva um feedback CURTO e útil, com **negrito** nos títulos:\n" +
    "**O que você acertou** (o que recordou corretamente).\n" +
    "**O que faltou** (pontos importantes da referência que não apareceram).\n" +
    "**Corrigir** (algo que lembrou errado, se houver; cite o trecho — senão escreva 'nada relevante').\n" +
    "**Sugestão** (recomende honestamente um destes: Esqueci / Lembrei / Fácil, conforme o quanto recordou, e explique em 1 frase).\n" +
    "Baseie-se SOMENTE no que o aluno escreveu e na referência. Se a referência for curta/insuficiente, " +
    "diga que a avaliação fica limitada. Seja conciso (poucas linhas), sem inventar conteúdo.";
  const user =
    `TÓPICO: ${topico || "(não informado)"}\n\n` +
    `CONTEÚDO DE REFERÊNCIA:\n"""\n${corta(referencia || "(sem referência cadastrada)", 4000)}\n"""\n\n` +
    `O QUE O ALUNO LEMBROU:\n"""\n${corta(texto, 3000)}\n"""`;
  const t = await chamar(cfg, { system, user, json: false, temperature: 0.4 });
  return { texto: String(t).trim(), selo: "amarelo" };
}

// REFINAR o plano da semana: a IA comenta E propõe AJUSTES CONCRETOS e individuais que o
// aluno aceita um a um (aceitar parcialmente). Responde só JSON.
export async function refinarPlano(cfg, { plano, contexto }) {
  const system =
    "Você é um mentor de estudos para concursos. Recebe um PLANO da semana (tarefas com título, " +
    "dia e categoria) + panorama. Devolva: (1) um comentário curto sobre o equilíbrio/prioridade; " +
    "(2) uma lista de AJUSTES concretos e OPCIONAIS (o aluno aceita um a um). Cada ajuste tem: " +
    "`acao` ('remover' | 'adicionar' | 'mover'); `titulo` (para remover/mover: o título EXATO de " +
    "uma tarefa do plano; para adicionar: o título da nova tarefa); `categoria` (só p/ adicionar: " +
    "Materiais|Lei Seca|Jurisprudência|Prática|Revisão|Não definida); `dia` (0=domingo..6=sábado, ou " +
    "null; p/ adicionar/mover); `motivo` (1 frase). Sugira POUCO (no máximo 5), só o que melhora de " +
    "verdade; se o plano já está bom, devolva ajustes vazio. NÃO reescreva o plano todo. Responda só JSON.";
  const user =
    `Panorama: ${contexto}\n\nPlano da semana:\n${plano}\n\n` +
    `Responda EXATAMENTE: {"comentario":"...","ajustes":[{"acao":"mover","titulo":"...","categoria":"","dia":1,"motivo":"..."}]}`;
  const r = await chamar(cfg, { system, user, json: true, temperature: 0.4 });
  return { comentario: (r && r.comentario) || "", ajustes: r && Array.isArray(r.ajustes) ? r.ajustes : [] };
}

// ESTRUTURAR CRONOGRAMA externo (cursinho/mentor) em tarefas. Detecta o dia da semana
// quando houver (0=Dom..6=Sáb) e a categoria; senão deixa null. Responde só JSON.
// `literal` (opcional, default true): modo FIEL — a IA só SEPARA/NORMALIZA o texto colado
// no formato do sistema, sem criar tarefas novas, sem resumir e sem alterar o conteúdo.
export async function estruturarCronograma(cfg, { texto, literal = true }) {
  const regraLiteral = literal
    ? "MODO LITERAL/FIEL — sua única função é REORGANIZAR e SEPARAR o texto colado no formato do sistema. " +
      "É PROIBIDO: inventar tarefas, acrescentar conteúdo, sugerir temas novos, resumir, traduzir ou parafrasear. " +
      "Preserve as palavras do aluno no titulo (apenas remova marcadores de lista, numeração e o tempo entre parênteses). " +
      "Cada tarefa de saída deve corresponder a um trecho REAL do texto; se uma linha trouxer várias tarefas, separe-as; " +
      "se várias linhas descreverem a mesma tarefa, una-as. NUNCA crie itens que não estejam escritos no texto. "
    : "NÃO invente tarefas que não estão no texto. ";
  const system =
    "Você organiza um cronograma de estudos colado pelo aluno (de cursinho/mentor) em TAREFAS. " +
    regraLiteral +
    "REGRA DO DIA (crítica): o dia da semana costuma vir como um CABEÇALHO em sua própria linha. " +
    "Aceite QUALQUER forma de escrever o dia, equivalentes entre si: nome completo ou curto, COM ou SEM " +
    "'-feira' ('Segunda' = 'Segunda-feira'; 'Terça' = 'Terça-feira'; o mesmo para Quarta, Quinta, Sexta; " +
    "Sábado e Domingo não têm '-feira'), abreviações (Seg, Ter, Qua, Qui, Sex, Sáb, Dom), ordinais " +
    "('2ª', '2ª feira'), maiúsculas/minúsculas e 'Dia 1'..'Dia 7'. O cabeçalho é seguido de VÁRIOS itens (linhas com " +
    "'•', '-', '*' ou números). Cada dia normalmente tem MÚLTIPLAS tarefas. Esse cabeçalho vale para TODOS " +
    "os itens abaixo dele ATÉ aparecer o próximo cabeçalho de dia. Propague o dia a cada item daquele bloco. " +
    "REGRA 1 ITEM = 1 TAREFA: cada LINHA abaixo de um dia é uma tarefa. O marcador de lista (•, -, *, número) " +
    "é OPCIONAL: linhas SEM marcador também são tarefas. NUNCA exija marcador. O titulo NÃO pode começar com " +
    "marcador de lista (remova '•', '-', '*', '1.', '1)' do início). Gere UMA tarefa para CADA item, na ordem em que aparecem. NUNCA junte, " +
    "resuma ou funda bullets distintos do mesmo dia numa só tarefa, ainda que tratem da mesma disciplina " +
    "(ex.: 'Lei seca: CF' e 'Questões comentadas' são DUAS tarefas, não uma). Una linhas APENAS quando uma " +
    "única tarefa estiver quebrada em duas linhas por causa de quebra de texto. Uma linha que é só o nome do " +
    "dia NÃO é tarefa (não gere tarefa para ela). Processe a SEMANA INTEIRA: se o texto traz os sete dias, " +
    "devem aparecer tarefas de todos os dias presentes, sem omitir nenhum. " +
    "Mapeie o dia para: 0=domingo,1=segunda,2=terça,3=quarta,4=quinta,5=sexta,6=sábado; use null só quando " +
    "REALMENTE não houver dia indicado para aquele bloco. " +
    "Para cada tarefa identifique também: titulo (ação clara e curta), " +
    "observacao (detalhes, lembretes ou ressalvas daquela tarefa, ex.: 'atenção aos arts. 116 e 117', " +
    "'focar súmulas recentes'; \"\" se não houver; NÃO invente observação que não esteja no texto). " +
    "SEPARADOR EXPLÍCITO: se uma linha contiver '//', tudo APÓS o '//' é a observacao daquela tarefa e NÃO " +
    "faz parte do titulo (ex.: 'Ler Lei 8.112 // focar arts. 116 e 117' → titulo 'Ler Lei 8.112', observacao 'focar arts. 116 e 117'). " +
    "categoria entre: Materiais, Lei Seca, Jurisprudência, Prática, Revisão, Não definida, e " +
    "min = duração em MINUTOS se a tarefa indicar tempo (ex.: '50 min', '(40 min)', '1h' → 60, '2h' → 120, " +
    "'1h15' → 75; null se não houver; NÃO repita o tempo no titulo). " +
    "Responda só JSON.";
  const user = `CRONOGRAMA COLADO:\n"""\n${corta(texto, 6000)}\n"""\n\nResponda EXATAMENTE: {"tarefas":[{"titulo":"...","observacao":"","dia":null,"categoria":"Prática","min":null}]}`;
  const r = await chamar(cfg, { system, user, json: true, temperature: 0.2 });
  return r && Array.isArray(r.tarefas) ? r.tarefas : [];
}

// ADAPTAR um cronograma colado à REALIDADE do aluno: usa o texto como base do QUE estudar,
// mas REDISTRIBUI a carga aos dias disponíveis, ao tempo/dia, às lacunas e aos dias até a prova.
export async function adaptarCronograma(cfg, { texto, contexto }) {
  const system =
    "Você adapta um cronograma de estudos colado pelo aluno à REALIDADE dele. " +
    "Use o conteúdo do cronograma como base do QUE estudar, mas REDISTRIBUA e AJUSTE a carga aos dias " +
    "disponíveis, ao tempo por dia, às lacunas de desempenho e aos dias até a prova informados. Pode " +
    "reordenar, agrupar, dividir ou priorizar; dê prioridade às disciplinas de baixo aproveitamento. " +
    "Use SOMENTE os dias disponíveis informados. NÃO invente temas que não estejam no cronograma. " +
    "Para cada tarefa: titulo (ação curta), dia (0=domingo..6=sábado, só dos disponíveis), categoria " +
    "entre: Materiais, Lei Seca, Jurisprudência, Prática, Revisão, Não definida, e min = tempo sugerido " +
    "em MINUTOS para a tarefa (respeitando o tempo por dia informado; null se não fizer sentido). Responda só JSON.";
  const ctx =
    `Dias disponíveis (0=dom..6=sáb): ${(contexto.diasDisponiveis || []).join(", ") || "nenhum"}. ` +
    `Tempo por dia: ${contexto.tempoPorDiaMin} min. ` +
    `Dias até a prova: ${contexto.diasAteProva != null ? contexto.diasAteProva : "sem data"}. ` +
    `Cobertura do edital: ${contexto.coberturaPct}%. ` +
    `Disciplinas com baixo aproveitamento (priorizar): ${(contexto.disciplinasFracas || []).join(", ") || "nenhuma destacada"}.`;
  const user = `CRONOGRAMA COLADO:\n"""\n${corta(texto, 6000)}\n"""\n\nCONTEXTO DO ALUNO:\n${ctx}\n\nResponda EXATAMENTE: {"tarefas":[{"titulo":"...","dia":1,"categoria":"Prática","min":null}]}`;
  const r = await chamar(cfg, { system, user, json: true, temperature: 0.3 });
  return r && Array.isArray(r.tarefas) ? r.tarefas : [];
}

// ESTRUTURAR um cronograma/lista de LEI SECA ou JURISPRUDÊNCIA colado pelo aluno em itens
// {referencia, texto, observacao}. Lida com TABELAS achatadas (colunas Artigo/Trecho/Observação
// viram linhas separadas) e cabeçalhos. NÃO inventa conteúdo — só reorganiza o que está no texto.
// K — Extrai as TESES/ENTENDIMENTOS de um INFORMATIVO de jurisprudência (narrativa) em itens.
// Diferente de estruturarLeiSeca (que só reorganiza listas): aqui a tese É o conteúdo do julgado.
export async function extrairTesesInformativo(cfg, { texto, n = 20 }) {
  const system =
    "Você extrai e CLASSIFICA os itens de um documento de jurisprudência do STF/STJ — pode ser um INFORMATIVO (vários julgados) OU uma edição de 'JURISPRUDÊNCIA EM TESES' do STJ (várias teses numeradas sobre um mesmo tema, cada uma com precedentes). Para CADA julgado/tese devolva: " +
    "referencia (curta e identificável: tribunal + nº do tema/súmula/recurso, ex.: 'Tema 1234 STJ', 'ADPF 1.292 STF', 'Súmula 646 STF'); " +
    "texto (a TESE/entendimento em 1–3 frases, FIEL, sem inventar); " +
    "tribunal (sigla STF/STJ/TST/...; \"\" se não houver); " +
    "orgao (órgão julgador: 'Plenário','Corte Especial','Primeira Turma','Terceira Seção'... ou \"\"); " +
    "ramo (ramo do direito NORMALIZADO: 'Direito Penal','Direito Constitucional','Direito Administrativo','Direito Processual Civil',...); " +
    "assunto (tema específico curto, ex.: 'Remição pelo estudo','Precatórios','Livre concorrência'); " +
    "processo (nº do processo/recurso: 'REsp 2.072.985/DF','ADPF 1.292/RO' ou \"\"); " +
    "tema (só o NÚMERO do Tema repetitivo/Repercussão Geral se houver, ex.: '1357'; senão \"\"); " +
    "dataJulgamento (dd/mm/aaaa do julgamento se houver; senão \"\"); " +
    "categoria (a que melhor couber: 'Súmula'|'Súmula Vinculante'|'Tema repetitivo'|'Repercussão Geral'|'Precedente obrigatório'|'Jurisprudência em Teses'|'Tese'|'Enunciado'; " +
    "use 'Jurisprudência em Teses' para cada tese numerada de uma edição do produto 'Jurisprudência em Teses' do STJ; 'Enunciado' para enunciados de jornadas/FONAJE/súmulas administrativas); " +
    "status ('vigente' | 'superado' (só se o texto disser que foi superado/cancelado/substituído) | 'importante'). " +
    "NÃO invente; ignore relatório/ementa acessória. Responda só JSON.";
  const user =
    `Do DOCUMENTO abaixo, identifique o nº (do informativo OU o nº da edição de Jurisprudência em Teses) e a data (se houver) e extraia até ${n} itens (um por julgado/tese). ` +
    `Se for Jurisprudência em Teses, use o nº da edição em "nInformativo" e repita o tema da edição no "assunto" de cada tese.\n\n` +
    `DOCUMENTO:\n"""\n${corta(texto, 12000)}\n"""\n\n` +
    `Formato EXATO: {"nInformativo":"894","dataDivulgacao":"30/06/2026","tribunal":"STJ","itens":[{"referencia":"...","texto":"...","tribunal":"...","orgao":"...","ramo":"...","assunto":"...","processo":"...","tema":"...","dataJulgamento":"...","categoria":"...","status":"vigente"}]}`;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.2 });
  const meta = {
    // nº do informativo só o número (STF às vezes vem "1221/2026" → "1221"; consistência com STJ "894").
    nInformativo: (String(out?.nInformativo || "").match(/\d+/) || [null])[0],
    dataDivulgacao: String(out?.dataDivulgacao || "").trim() || null,
    tribunalInfo: String(out?.tribunal || "").trim() || null,
  };
  const arr = Array.isArray(out) ? out : out.itens || [];
  const s = (v) => (String(v ?? "").trim() || null);
  return arr
    .map((x) => ({
      referencia: String(x.referencia || "").trim(),
      texto: String(x.texto || "").trim(),
      tribunal: s(x.tribunal) || meta.tribunalInfo,
      orgao: s(x.orgao),
      ramo: s(x.ramo),
      assunto: s(x.assunto),
      processo: s(x.processo),
      tema: s(x.tema),
      dataJulgamento: s(x.dataJulgamento),
      categoria: s(x.categoria),
      status: s(x.status) || "vigente",
      nInformativo: meta.nInformativo,
      dataDivulgacao: meta.dataDivulgacao,
    }))
    .filter((x) => x.referencia || x.texto);
}

export async function estruturarLeiSeca(cfg, { texto, tipo }) {
  const ehJuris = tipo === "juris";
  const alvo = ehJuris ? "súmulas, temas repetitivos e precedentes (ex.: 'Súmula 473 STF', 'Tema 1234 STJ')" : "dispositivos de lei (ex.: 'Art. 37, CF', 'Art. 1º ao 10', 'Art. 21')";
  const system =
    "Você organiza um cronograma/lista de estudo colado pelo aluno em ITENS de referência. MODO FIEL: " +
    "apenas REORGANIZE o que está escrito; é PROIBIDO inventar, resumir ou criar referências que não estejam no texto. " +
    `Cada item tem: referencia (${alvo}), texto (o TRECHO/tese/conteúdo do dispositivo, se houver) e observacao (lembrete, ` +
    "doutrina, jurisprudência atrelada, ressalva). " +
    "REGRA DA TABELA (crítica): o texto costuma vir de uma TABELA achatada, onde a referência, o trecho e a observação " +
    "de um MESMO item aparecem em LINHAS SEGUIDAS (não na mesma linha). Associe ao item da referência mais próxima ACIMA " +
    "o(s) trecho(s) e observação(ões) que vêm logo depois, até a próxima referência. Um trecho costuma vir entre aspas; " +
    "uma observação é uma frase de orientação (ex.: 'Verificar Tema 987 STF', 'Prazo em dias úteis'). " +
    "IGNORE (não gere itens): títulos do cronograma, cabeçalhos de dia (ex.: 'Dia 01: ...'), descrições do dia e " +
    "cabeçalhos de coluna ('Artigo', 'Artigos', 'Trecho', 'Trecho Chave', 'Observação'). " +
    "Se o aluno já separou com '|' numa linha (referencia | trecho | observacao), respeite essa separação. " +
    (ehJuris
      ? "PARA CADA ITEM, identifique também (quando der para deduzir DA PRÓPRIA REFERÊNCIA, sem inventar): tribunal " +
        "(a sigla do tribunal citada, ex.: STF, STJ, TJSP, TRF3; \"\" se não houver) e categoria (uma de: 'Súmula', " +
        "'Tema repetitivo', 'Precedente obrigatório'; use 'Súmula' quando a referência começa por 'Súmula', 'Tema " +
        "repetitivo' quando começa por 'Tema'; \"\" se não der para saber). "
      : "") +
    "Mantenha as palavras do aluno. Responda só JSON.";
  const formato = ehJuris
    ? `{"itens":[{"referencia":"Súmula 473 STF","texto":"","observacao":"","tribunal":"STF","categoria":"Súmula"}]}`
    : `{"itens":[{"referencia":"...","texto":"","observacao":""}]}`;
  const user = `LISTA COLADA:\n"""\n${corta(texto, 8000)}\n"""\n\nResponda EXATAMENTE: ${formato}`;
  const r = await chamar(cfg, { system, user, json: true, temperature: 0.2 });
  const arr = r && Array.isArray(r.itens) ? r.itens : [];
  const CAT = ["Súmula", "Tema repetitivo", "Precedente obrigatório"];
  return arr
    .map((x) => ({
      referencia: String(x.referencia || "").trim(),
      texto: String(x.texto || "").trim(),
      observacao: String(x.observacao || "").trim(),
      tribunal: ehJuris ? String(x.tribunal || "").trim() || null : null,
      categoria: ehJuris && CAT.includes(x.categoria) ? x.categoria : null,
    }))
    .filter((x) => x.referencia);
}

// CASAR TÍTULOS de seções (apostila) com TÓPICOS do edital. Payload minúsculo (só os títulos +
// a lista de tópicos) → funciona com PDF de qualquer tamanho. Devolve, por índice, o nome EXATO
// do tópico do edital correspondente (ou "" se nenhum). NÃO inventa tópico fora da lista.
export async function casarTitulosComTopicos(cfg, { titulos, topicos }) {
  const system =
    "Você associa TÍTULOS de seções de uma apostila aos TÓPICOS de um edital. Para CADA título, escolha o " +
    "tópico da lista que ele melhor corresponde semanticamente; se nenhum servir, devolva \"\". Use SEMPRE o " +
    "nome EXATO da lista de tópicos; NÃO invente tópicos fora dela. Ignore rótulos como 'Teoria', " +
    "'Questões Comentadas', banca e numeração — foque no assunto. Responda só JSON.";
  const lista = (topicos || []).map((t, i) => `${i + 1}. ${t}`).join("\n");
  const tits = (titulos || []).map((t, i) => `${i + 1}) ${t}`).join("\n");
  const user =
    `TÓPICOS DO EDITAL:\n${lista}\n\nTÍTULOS DAS SEÇÕES (na ordem):\n${tits}\n\n` +
    `Responda EXATAMENTE: {"casos":[{"i":1,"topico":"nome exato ou vazio"}]} — um por título, na ordem.`;
  const r = await chamar(cfg, { system, user, json: true, temperature: 0.1 });
  const arr = r && Array.isArray(r.casos) ? r.casos : [];
  const porIndice = {};
  for (const c of arr) {
    const i = parseInt(c.i, 10);
    if (Number.isInteger(i)) porIndice[i - 1] = String(c.topico || "").trim();
  }
  return (titulos || []).map((_, i) => porIndice[i] || "");
}

// DETECTAR TÓPICOS do edital que aparecem num texto de material (precisão por página, dir.2).
// Recebe o texto e a lista de tópicos do edital; devolve quais estão efetivamente abordados.
export async function detectarTopicos(cfg, { texto, topicos }) {
  const system =
    "Você identifica quais TÓPICOS de um edital são realmente ABORDADOS num texto de estudo. " +
    "Receberá o TEXTO e uma LISTA NUMERADA de tópicos. Devolva apenas os tópicos que o texto trata " +
    "de fato (não os apenas citados de passagem). Use o NOME EXATO da lista. Responda só JSON.";
  const user =
    `TEXTO:\n"""\n${corta(texto, 6000)}\n"""\n\nTÓPICOS DO EDITAL:\n${topicos.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\n` +
    `Responda EXATAMENTE: {"topicos":["nome exato","..."]}`;
  const r = await chamar(cfg, { system, user, json: true, temperature: 0.2 });
  return r && Array.isArray(r.topicos) ? r.topicos : [];
}

// SUGERIR PQ (Provável Questão): dada uma lista de referências de lei/jurisprudência, a IA
// indica quais são de ALTA INCIDÊNCIA em concursos, com incidência estimada. Responde só JSON.
export async function sugerirPQ(cfg, { referencias, contexto }) {
  const system =
    "Você é um examinador experiente de concursos públicos brasileiros. Recebe uma LISTA de " +
    "referências (artigos de lei, súmulas, temas). Indique quais são CLÁSSICAS de ALTA INCIDÊNCIA " +
    "em provas ('queridinhas das bancas'). Para cada uma que considerar PROVÁVEL QUESTÃO, devolva a " +
    "referência EXATA (igual à lista) e uma incidência estimada de 0 a 100. Seja SELETIVO (não marque " +
    "tudo; só as realmente recorrentes). NÃO invente referências fora da lista. Responda só JSON.";
  const user =
    `Contexto: ${contexto || "geral"}\n\nREFERÊNCIAS:\n${referencias.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n\n` +
    `Responda EXATAMENTE: {"pq":[{"referencia":"...","incidencia":70}]}`;
  const r = await chamar(cfg, { system, user, json: true, temperature: 0.3 });
  return r && Array.isArray(r.pq) ? r.pq : [];
}

// RELEVÂNCIA — Fonte B: a partir dos ENUNCIADOS de questões REAIS (provas importadas),
// classifica cada uma no tópico mais provável e devolve a CONTAGEM por tópico (incidência
// real). Não inventa tópicos fora da lista. Online (JSON).
export async function sugerirRelevanciaProvas(cfg, { questoes, topicos, contexto }) {
  const system =
    "Você é um examinador. Recebe ENUNCIADOS de questões REAIS de provas anteriores e uma LISTA de " +
    "tópicos do edital. Para cada questão, identifique o tópico da lista mais adequado (ignore a questão " +
    "se não couber em nenhum). Devolva a CONTAGEM de questões por tópico (incidência real). Use EXATAMENTE " +
    "os nomes da lista; NÃO invente tópicos. Responda só JSON.";
  const lista = topicos.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const qs = questoes.map((q, i) => `Q${i + 1}: ${corta(q, 220)}`).join("\n");
  const user =
    `Contexto: ${contexto || "concurso"}\n\nTÓPICOS DO EDITAL:\n${lista}\n\nQUESTÕES (${questoes.length}):\n${qs}\n\n` +
    `Responda EXATAMENTE: {"contagens":[{"topico":"...","n":3}]}`;
  const r = await chamar(cfg, { system, user, json: true, temperature: 0.2 });
  return r && Array.isArray(r.contagens) ? r.contagens : [];
}

// RELEVÂNCIA — Fonte C: PESQUISA NA WEB (raio-x/incidência da banca/cargo) e estima a
// relevância 0–100 por tópico, citando as fontes. Web grounding (Gemini). É ESTIMATIVA.
export async function sugerirRelevanciaWeb(cfg, { topicos, banca, orgao, cargo, ano }) {
  const alvo =
    [banca && `banca ${banca}`, orgao && `órgão ${orgao}`, cargo && `cargo ${cargo}`, ano && `ano ${ano}`]
      .filter(Boolean)
      .join(", ") || "concurso público";
  const lista = topicos.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const system =
    "Você é um especialista em concursos públicos brasileiros e tem acesso à BUSCA WEB. Pesquise o " +
    "'raio-x' / a incidência por assunto das provas do alvo informado e estime, para CADA tópico da lista, " +
    "uma RELEVÂNCIA de 0 a 100 (o quanto costuma cair). Baseie-se nas fontes encontradas; quando não houver " +
    "dado para um tópico, estime com cautela e marque confiança 'baixa'. Use EXATAMENTE os nomes da lista. " +
    'AO FINAL, inclua um bloco JSON puro: {"sugestoes":[{"topico":"...","relevancia":70,"confianca":"alta|media|baixa"}]}.';
  const user = `Alvo: ${alvo}\n\nTÓPICOS:\n${lista}\n\nPesquise a incidência e devolva o JSON ao final.`;
  const r = await responderChatWebGemini(cfg, { system, user });
  let sugestoes = [];
  try {
    const j = parseJSON(r.texto);
    if (j && Array.isArray(j.sugestoes)) sugestoes = j.sugestoes;
  } catch (_) {}
  // Resumo (detalhamento) = a síntese textual da IA, SEM o bloco JSON e sem cercas de código.
  let resumo = String(r.texto || "").replace(/```[\s\S]*?```/g, "").trim();
  const iJson = resumo.search(/\{\s*"sugestoes"/);
  if (iJson >= 0) resumo = resumo.slice(0, iJson).trim();
  return { sugestoes, fontesWeb: r.fontesWeb, resumo };
}

// SUGERIR PALAVRAS-CHAVE (🟡) para a marcação tricromática: a IA identifica os termos/
// expressões MAIS IMPORTANTES que aparecem LITERALMENTE no texto (para casar o offset).
// Classifica um dispositivo de lei em TEMAS de estudo (sub-projeto de tag temática). Rótulos
// canônicos e consistentes para habilitar "Memorizar por tema" e a inteligência por tema.
export async function classificarTemas(cfg, { texto, referencia }) {
  const system =
    "Você classifica um dispositivo de lei em TEMAS de estudo para concurso público. " +
    "Devolva de 1 a 4 temas CURTOS e CANÔNICOS. Para temas GERAIS, prefira estes rótulos exatos quando couber: " +
    "Prazo, Competência, Quórum, Prescrição e decadência, Dosimetria da pena, Direitos e garantias, Vedações, " +
    "Requisitos e condições, Procedimento e recursos, Princípios, Multa e valores. " +
    "ALÉM disso, quando o dispositivo tratar de um INSTITUTO PRÓPRIO da matéria, adicione 1 tema ESPECÍFICO " +
    "(ex.: na Constituição — 'Controle de constitucionalidade', 'Remédios constitucionais', 'Organização dos poderes'; " +
    "no Penal — 'Extinção da punibilidade', 'Concurso de pessoas', 'Crimes contra a vida'; " +
    "no Civil/Processo — 'Negócio jurídico', 'Responsabilidade civil', 'Recursos'). Use a norma citada para inferir a matéria. " +
    "Só o essencial (não force 4). Use SEMPRE o mesmo rótulo para o mesmo tema (consistência). Responda só JSON.";
  const user = `Dispositivo (norma indica a matéria): ${referencia || ""}\n\nTEXTO:\n"""\n${corta(texto, 3000)}\n"""\n\nResponda EXATAMENTE: {"temas":["...","..."]}`;
  const r = await chamar(cfg, { system, user, json: true, temperature: 0.1 });
  const arr = r && Array.isArray(r.temas) ? r.temas : [];
  return arr.map((s) => String(s).trim()).filter(Boolean).slice(0, 4);
}
export async function sugerirPalavrasChave(cfg, { texto, contexto }) {
  const system =
    "Você ajuda um concurseiro a GRIFAR as palavras-chave de um texto de estudo. " +
    "Liste as expressões MAIS IMPORTANTES para memorizar (conceitos, termos técnicos, núcleos). " +
    "REGRAS CRÍTICAS: cada item deve ser uma sequência EXATA e CONTÍNUA que aparece LITERALMENTE no texto " +
    "(copie ipsis litteris, com a mesma grafia/acentuação; não parafraseie, não junte trechos distantes); " +
    "prefira expressões curtas (1 a 5 palavras); marque POUCO e cirúrgico (no máximo ~12). " +
    "NÃO inclua prazos/valores nem palavras restritivas (essas têm cor própria). Responda só JSON.";
  const user = `Contexto: ${contexto || "geral"}\n\nTEXTO:\n"""\n${corta(texto, 5000)}\n"""\n\nResponda EXATAMENTE: {"palavras":["...","..."]}`;
  const r = await chamar(cfg, { system, user, json: true, temperature: 0.2 });
  const arr = r && Array.isArray(r.palavras) ? r.palavras : [];
  return arr.map((s) => String(s).trim()).filter(Boolean);
}

// MENTOR PROATIVO: recebe um panorama do progresso (JSON) e devolve análise +
// um PLANO de ações concretas (metas, missões, flashcards, questões, anotações de
// erro). Tudo 🤖 e sujeito à aprovação do aluno antes de aplicar.
export async function analisarProgresso(cfg, snapshot) {
  const system =
    PERSONA_MENTOR + " Recebe um PANORAMA " +
    "do progresso do aluno em JSON e devolve uma análise objetiva e um PLANO de ações concretas " +
    "CONTINUIDADE: se houver um plano anterior (campo planoAnterior: análise passada + quando), " +
    "comente em 1 frase o que EVOLUIU ou continua pendente desde então — o aluno deve sentir " +
    "que é o MESMO mentor acompanhando, não uma análise do zero. " +
    "para a próxima etapa. Seja honesto, específico e prático: priorize o que mais impacta a " +
    "aprovação considerando o tempo restante até a prova, as disciplinas fracas, a cobertura, os " +
    "erros e as observações do aluno. RESPEITE a BASE DE ESTUDO (campo baseEstudo): se for " +
    "'cursinho', PRIORIZE e ORDENE as sugestões e as missões seguindo a SEQUÊNCIA DAS AULAS " +
    "(campo sequenciaCursinho: Aula 1 → 2 → ...), avançando a partir de onde o aluno parou; se for " +
    "'edital', priorize por matéria, relevância e cobertura. " +
    "CONSIDERE a CENTRAL DE REVISÕES (campo revisao): se houver revisões atrasadas/para hoje (revisao.atrasadas, revisao.vencidasPorTipo por tópico/resumo/mapa/lei/juris/flashcards), TRATE-AS como prioridade e reflita isso em 'atencao' e nas missões de categoria 'Revisão'. " +
    "USE o desempenho POR TÓPICO (disciplinas[].topicos[].percentAcerto e questoes): mire os TÓPICOS específicos mais fracos, não só a disciplina. " +
    "NÃO proponha missões que DUPLIQUEM o que o aluno JÁ planejou (campo planejado.hoje/totalSemana); complemente, não repita, e respeite a carga já agendada. " +
    "CONSIDERE o COMPORTAMENTO (campo comportamento): quando houver, sugira aproveitar o melhor dia/faixa do dia (comportamento.melhorDia/melhorFaixa) para as tarefas mais difíceis, e reforce a constância (comportamento.ofensivaDias). " +
    "CONSIDERE os SIMULADOS (campo simulados: total, media, melhor, ultimo): se a última nota (simulados.ultimo.aproveitamento) estiver abaixo da média (simulados.media), aponte a queda e onde revisar; se não houver simulados (simulados.total=0) e a prova estiver próxima, sugira fazer um simulado diagnóstico. Compare também com a meta diária (metas.feitoHojeMin × metas.diariaMin). " +
    "CONSIDERE a LEI SECA/JURISPRUDÊNCIA (campo leiSeca): se houver pontos de ALTA INCIDÊNCIA sem treinar (leiSeca.pqNaoTreinada/pqNaoTreinadaEx) ou dispositivos FRACOS no drill (leiSeca.dispositivosFracos/dispositivosFracosEx), destaque em 'atencao' e sugira treinar a letra desses dispositivos. Também considere: novidade legislativa a revisar (leiSeca.novidadeLei/novidadeJuris), vigência não conferida há muito tempo (leiSeca.vigenciaPendente), entendimentos antigos (leiSeca.jurisAntigas) e metas de leitura pendentes (leiSeca.metasLeituraPendentes). " +
    "CONSIDERE os LEMBRETES vencidos (campo lembretesVencidos: recados que o próprio aluno deixou, com data já passada): se houver, mencione-os em 'atencao' de forma acolhedora (ex.: 'você anotou X para o dia tal'). " +
    "NÃO invente dados fora do panorama. As ações (flashcards/" +
    "questões) são auxiliares de estudo (selo amarelo) e serão REVISADAS pelo aluno. Responda " +
    "exclusivamente em JSON válido.";
  const user =
    `PANORAMA DO ALUNO:\n${JSON.stringify(snapshot)}\n\n` +
    `Responda no formato EXATO:\n` +
    `{"analise":"2 a 4 frases","atencao":["ponto que precisa de atenção","..."],` +
    `"melhorar":["sugestão de melhoria","..."],` +
    `"acoes":{` +
    `"metas":{"diariaMin":0,"semanalMin":0,"justificativa":""},` +
    `"missoes":[{"titulo":"...","categoria":"Prática","topico":""}],` +
    `"flashcards":[{"frente":"...","verso":"...","topico":""}],` +
    `"questoes":[{"enunciado":"...","alternativas":["a","b","c","d"],"correta":0,"topico":""}],` +
    `"erros":[{"descricao":"confusão comum a fixar","correto":"o correto","topico":"","motivo":"Pegadinha"}],` +
    `"resumos":[{"titulo":"...","conteudo":"síntese curta dos pontos-chave","topico":""}],` +
    `"indicacoes":[{"tipo":"lei","referencia":"art. 37, CF","topico":""}]}}\n` +
    `Limites: até 6 flashcards, 4 questões, 6 missões, 4 erros, 2 resumos, 4 indicações. Use "metas":null se as metas atuais já estão boas. ` +
    `"topico" deve ser EXATAMENTE um dos nomes de tópico citados no panorama, ou "" se geral. ` +
    `"categoria" das missões ∈ ["Materiais","Lei Seca","Jurisprudência","Prática","Revisão","Não definida"]. ` +
    `"motivo" dos erros ∈ ["Não sabia","Esqueci","Interpretação","Distração","Pegadinha"]. ` +
    `"resumos": sínteses curtas dos pontos-chave do tema (não invente além do panorama/tema). ` +
    `"indicacoes": leituras a fazer — "tipo" ∈ ["lei","juris"], "referencia" = artigo/súmula/precedente. ` +
    `TEMPO: ao mencionar QUALQUER duração nos textos (analise, atencao, melhorar, justificativa), escreva no formato "Xh" ou "XhYYmin" (ex.: "2h", "1h30min", "45min"), NUNCA em minutos puros como "120 minutos". Os campos numéricos diariaMin/semanalMin continuam em minutos (inteiros).`;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.5 });
  const a = (out && out.acoes) || {};
  const arr = (x) => (Array.isArray(x) ? x : []);
  return {
    analise: String(out.analise || "").trim(),
    atencao: arr(out.atencao).map(String),
    melhorar: arr(out.melhorar).map(String),
    acoes: {
      metas:
        a.metas && (a.metas.diariaMin || a.metas.semanalMin)
          ? {
              diariaMin: parseInt(a.metas.diariaMin, 10) || 0,
              semanalMin: parseInt(a.metas.semanalMin, 10) || 0,
              justificativa: String(a.metas.justificativa || "").trim(),
            }
          : null,
      missoes: arr(a.missoes)
        .filter((m) => m && m.titulo)
        .map((m) => ({ titulo: String(m.titulo).trim(), categoria: String(m.categoria || "Não definida").trim(), topico: String(m.topico || "").trim() })),
      flashcards: arr(a.flashcards)
        .filter((c) => c && c.frente && c.verso)
        .map((c) => ({ frente: String(c.frente).trim(), verso: String(c.verso).trim(), topico: String(c.topico || "").trim() })),
      questoes: arr(a.questoes)
        .filter((q) => q && q.enunciado && Array.isArray(q.alternativas) && q.alternativas.length >= 2)
        .map((q) => ({
          enunciado: String(q.enunciado).trim(),
          alternativas: q.alternativas.map((x) => String(x).trim()).filter(Boolean),
          correta: Math.max(0, Math.min(q.alternativas.length - 1, parseInt(q.correta, 10) || 0)),
          topico: String(q.topico || "").trim(),
        })),
      erros: arr(a.erros)
        .filter((e) => e && e.descricao)
        .map((e) => ({ descricao: String(e.descricao).trim(), correto: String(e.correto || "").trim(), topico: String(e.topico || "").trim(), motivo: String(e.motivo || "").trim() })),
      resumos: arr(a.resumos)
        .filter((r) => r && r.titulo && r.conteudo)
        .map((r) => ({ titulo: String(r.titulo).trim(), conteudo: String(r.conteudo).trim(), topico: String(r.topico || "").trim() })),
      indicacoes: arr(a.indicacoes)
        .filter((i) => i && i.referencia)
        .map((i) => ({ tipo: String(i.tipo) === "juris" ? "juris" : "lei", referencia: String(i.referencia).trim(), topico: String(i.topico || "").trim() })),
    },
  };
}

// ---------------------------------------------------------------------------
// VISÃO (OCR inteligente) — transcreve UMA imagem (página de PDF rasterizada ou
// foto) preservando TABELAS (em Markdown) e descrevendo ORGANOGRAMAS/diagramas.
// É a única função que envia imagem; reservada ao Gemini (multimodal).
//
// Princípio econômico: NÃO é usada para transcrever o PDF inteiro — o texto
// continua saindo de graça pelo pdf.js. A Visão entra só nas páginas-lacuna
// (sem camada de texto) ou quando o usuário pede explicitamente numa página.
// ---------------------------------------------------------------------------
function chamarGeminiVisao(cfg, opts) {
  return geminiResiliente(cfg, (c) => chamarGeminiVisaoRaw(c, opts));
}

async function chamarGeminiVisaoRaw(cfg, { system, user, mimeType, dataB64, temperature = 0.1, json = false, timeoutMs }) {
  const modelo = (cfg.iaModelo || "").trim() || MODELO_PADRAO.gemini;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent` +
    `?key=${encodeURIComponent(cfg.iaKey.trim())}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: user }, { inlineData: { mimeType, data: dataB64 } }] }],
    systemInstruction: { parts: [{ text: system }] },
    // thinkingBudget:0 DESLIGA o "pensamento" dos modelos 2.5 (flash/flash-lite). A Visão aqui
    // faz OCR/estruturação (não raciocínio longo); com thinking ligado o gemini-2.5-flash levava
    // ~170s e ESTOURAVA o timeout. Sem thinking fica rápido (e mais barato). Ignorado por modelos
    // que não suportam thinking.
    generationConfig: { temperature, thinkingConfig: { thinkingBudget: 0 }, ...(json ? { responseMimeType: "application/json" } : {}) },
  };
  const resp = await fetchIA(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, "Gemini (visão)", timeoutMs);
  const data = await resp.json();
  const cand = data && data.candidates && data.candidates[0];
  const texto = cand && cand.content && cand.content.parts
    ? cand.content.parts.map((p) => p.text || "").join("")
    : "";
  if (!texto) {
    const fr = cand && cand.finishReason;
    const e = new Error("A Visão não retornou conteúdo" + (fr ? ` (${fr})` : "") + ".");
    e.code = fr || "EMPTY"; // ex.: "RECITATION" (cópia de material protegido), "SAFETY"
    throw e;
  }
  return json ? parseJSON(texto) : texto.trim();
}

// Regras de ESTRUTURA do edital (hierarquia de 3 níveis), compartilhadas pela versão por
// TEXTO (estruturarEditalIA) e pela versão por PDF/Visão (estruturarEditalDePDF).
const REGRAS_EDITAL =
  "REGRAS DE ESTRUTURA (o edital tem 3 níveis: grupo → disciplina → tópico:subtópicos): " +
  "(1) DISTINGA cabeçalhos de GRUPO/SEÇÃO/CARGO ('BLOCO I', 'CONHECIMENTOS GERAIS', 'CONHECIMENTOS ESPECÍFICOS', " +
  "'ANEXO', 'CONTEÚDO PROGRAMÁTICO', 'para o cargo de…', 'para todas as áreas') da DISCIPLINA real (a matéria: " +
  "Direito Constitucional, Língua Portuguesa, Matemática, Informática, Direito Penal…). NÃO crie disciplina a partir " +
  "de um grupo/seção/cargo; use o grupo só para agrupar as disciplinas certas. " +
  "(2) TÓPICO é uma unidade temática. Quando um tópico trouxer SUBTÓPICOS introduzidos por ':' e separados por ';' " +
  "(ex.: 'Ações constitucionais: habeas corpus; mandado de segurança; ação popular'), MANTENHA TUDO JUNTO como UM " +
  "tópico — NUNCA quebre os subtópicos em tópicos separados. Listas de artigos de lei ('Código Penal - artigos 293 a " +
  "305; 307; 312 a 317') são UM tópico só. " +
  "(3) Separe tópicos por frase (ponto final) ou numeração — NUNCA por ';'. " +
  "(4) Junte palavras quebradas por hífen de fim de linha do OCR ('classifica- ção' → 'classificação'). " +
  "(5) COPIE fielmente; NÃO invente tópicos nem disciplinas. Ignore ruído administrativo (inscrição, vagas, datas, " +
  "remuneração), URLs/links e marcas d'água.";

const FORMATO_EDITAL =
  `Formato EXATO: {"disciplinas":[{"nome":"DIREITO CONSTITUCIONAL","topicos":["Constituição: conceito, objeto; classificações","Princípios fundamentais"]}]}`;

// Normaliza a saída JSON da IA (disciplinas→tópicos) limpando ruído residual.
function normalizaEditalIA(out) {
  const arr = out && Array.isArray(out.disciplinas) ? out.disciplinas : [];
  return arr
    .filter((d) => d && d.nome)
    .map((d) => ({
      nome: String(d.nome).trim().replace(/:\s*$/, ""),
      topicos: (Array.isArray(d.topicos) ? d.topicos : []).map((t) =>
        String(t)
          .replace(/\bdispon[ií]vel\s+em\s*:?.*$/i, "") // "Disponível em: <...>"
          .replace(/<https?:\/\/[^>]*>/gi, "").replace(/https?:\/\/\S+/gi, "").replace(/\bwww\.\S+/gi, "") // URLs
          .replace(/(\p{L})-\s+(\p{L})/gu, "$1$2") // hifenização de OCR
          .replace(/^[0-9]+(?:\.\d+)?[).\-\s]+/, "") // numeração inicial (1., 3.1.)
          .replace(/\s{2,}/g, " ").replace(/[.;:\s]*$/, "").trim()
      ).filter((t) => t.length >= 2),
    }))
    .filter((d) => d.nome && d.topicos.length > 0);
}

// ESTRUTURA o conteúdo programático de um EDITAL (a partir de TEXTO já extraído) em
// disciplinas → tópicos. Robusto a texto bagunçado (OCR, 2 colunas, ruído). NÃO inventa.
export async function estruturarEditalIA(cfg, { texto }) {
  const system =
    "Você organiza o CONTEÚDO PROGRAMÁTICO de um edital de concurso em DISCIPLINAS e seus TÓPICOS, devolvendo só JSON. " +
    "O texto pode vir bagunçado: OCR, DUAS COLUNAS embaralhadas, frases quebradas no meio. RECONSTITUA a estrutura real. " +
    REGRAS_EDITAL;
  const user =
    `Organize o conteúdo programático abaixo em disciplinas e tópicos.\n\nTEXTO:\n"""\n${corta(texto, 30000)}\n"""\n\n` +
    FORMATO_EDITAL;
  const out = await chamar(cfg, { system, user, json: true, temperature: 0.1 });
  return normalizaEditalIA(out);
}

// EDITAL em UMA chamada: lê o PDF (inclusive ESCANEADO / 2 colunas) pela Visão e devolve
// DIRETO a estrutura {disciplinas:[{nome,topicos[]}]}. Substitui o par "extrair texto +
// reorganizar" (2 chamadas, a 2ª frágil em texto grande) por uma só. Timeout ampliado (120s,
// OCR de documento é lento) + fallback de modelo/chave (geminiResiliente). Só Gemini.
export async function estruturarEditalDePDF(cfg, { dataB64, mimeType = "application/pdf" }) {
  if (!visaoDisponivel(cfg)) {
    const e = new Error("A importação de edital por IA usa o Google Gemini ou o Claude Code local. Selecione um deles em Configurações.");
    e.code = "IA_OFFLINE";
    throw e;
  }
  const system =
    "Você lê um EDITAL de concurso público brasileiro (PDF, possivelmente ESCANEADO ou em DUAS COLUNAS) e organiza " +
    "o seu CONTEÚDO PROGRAMÁTICO em DISCIPLINAS e TÓPICOS, devolvendo SÓ JSON. Faça OCR quando necessário. " +
    REGRAS_EDITAL;
  const user =
    "Leia este edital e organize APENAS o conteúdo programático (as matérias e seus assuntos) no formato JSON pedido. " +
    FORMATO_EDITAL;
  const out = await chamarVisaoJson(cfg, { system, user, mimeType, dataB64, temperature: 0.1 });
  return normalizaEditalIA(out);
}

// PLANO DO CURSINHO em UMA chamada: lê o PDF (print de plataforma — Estratégia, Gran, Direção —,
// em geral ESCANEADO) e devolve {aulas:[{nome,disciplina,assuntos[]}]} para mapear aula→tópico do
// edital. Ignora o ruído de interface (status, botões, professores, %). Só Gemini; 120s + fallback.
export async function estruturarAulasDePDF(cfg, { dataB64, mimeType = "application/pdf" }) {
  if (!visaoDisponivel(cfg)) {
    const e = new Error("A importação do plano do cursinho por IA usa o Google Gemini ou o Claude Code local. Selecione um deles em Configurações.");
    e.code = "IA_OFFLINE";
    throw e;
  }
  const system =
    "Você lê o PLANO DE AULAS de um curso de cursinho de concursos (print de plataforma como Estratégia, Gran ou " +
    "Direção, possivelmente ESCANEADO ou em 2 colunas) e devolve SÓ JSON com a lista de AULAS, NA ORDEM. Faça OCR se preciso. " +
    "Para CADA aula: 'nome' = o rótulo (ex.: 'Aula 00', 'Aula 01', 'Aula 14 - Exclusivamente PDF'; 'Aula demo' vira 'Aula 00'); " +
    "'assuntos' = a lista de temas/conteúdos daquela aula. " +
    "REGRAS: (1) separe os assuntos por FRASE (ponto final) ou ';' — ex.: 'Ortografia oficial. Acentuação gráfica.' → " +
    "['Ortografia oficial','Acentuação gráfica']; (2) quando um assunto tiver subtópicos com ':' e vírgulas (ex.: " +
    "'Classes de palavras: substantivo, adjetivo, verbo'), MANTENHA-O como UM assunto; (3) se houver várias DISCIPLINAS, " +
    "preencha 'disciplina' por aula; curso de uma matéria só → 'disciplina' vazio; (4) junte palavras quebradas por hífen de OCR. " +
    "IGNORE TODO o ruído de interface: status ('Disponível','Não estudei','Concluído','Assistido'), botões ('Assistir','Baixar', " +
    "'Dê sua opinião'), porcentagens, estrelas/avaliação, nomes e contagem de professores, datas, carga horária, links e marcas d'água. " +
    "COPIE fielmente os assuntos; NÃO invente.";
  const user =
    "Leia este plano de aulas e devolva as aulas no formato JSON pedido.\n" +
    `Formato EXATO: {"aulas":[{"nome":"Aula 01","disciplina":"","assuntos":["Classes de palavras: substantivo, adjetivo","Flexão nominal"]}]}`;
  const out = await chamarVisaoJson(cfg, { system, user, mimeType, dataB64, temperature: 0.1 });
  const arr = out && Array.isArray(out.aulas) ? out.aulas : [];
  const limpa = (t) =>
    String(t)
      .replace(/<https?:\/\/[^>]*>/gi, "").replace(/https?:\/\/\S+/gi, "")
      .replace(/(\p{L})-\s+(\p{L})/gu, "$1$2")
      .replace(/^[-•·\s]+/, "").replace(/\s{2,}/g, " ").replace(/[.;:\s]*$/, "").trim();
  return arr
    .filter((a) => a && a.nome)
    .map((a) => ({
      nome: String(a.nome).trim(),
      disciplina: a.disciplina ? String(a.disciplina).trim() : null,
      assuntos: (Array.isArray(a.assuntos) ? a.assuntos : []).map(limpa).filter((t) => t.length >= 2),
    }))
    .filter((a) => a.nome);
}

export async function extrairTextoArquivo(cfg, { dataB64, mimeType, nomeArquivo, contexto }) {
  if (!iaDisponivel(cfg)) {
    const e = new Error("Conecte o Gemini em Configurações para importar este arquivo com a IA.");
    e.code = "IA_OFFLINE";
    throw e;
  }
  if (cfg.iaProvider !== "gemini") {
    throw new Error("A importação por IA usa o Google Gemini. Selecione o Gemini em Configurações.");
  }
  const fim = (contexto || "").trim() || "o texto integral do documento de estudo";
  const system =
    `Você extrai de um documento (PDF, inclusive escaneado, ou imagem) APENAS o conteúdo relevante para esta finalidade: ${fim}. ` +
    "Transcreva fielmente esse conteúdo na ordem de leitura, preservando a estrutura útil (títulos, listas, numeração de itens quando faz parte do conteúdo). " +
    "IGNORE o que não serve a essa finalidade: cabeçalhos e rodapés repetidos, marcas d'água, logotipos, números de página, " +
    "propaganda, avisos de copyright, instruções de navegação e ruído de digitalização. Tabelas: transcreva em texto legível. " +
    "NÃO resuma, NÃO comente, NÃO invente nada: devolva somente o texto útil. Se não houver conteúdo relevante, devolva uma string vazia.";
  const user = `Extraia o conteúdo relevante deste arquivo${nomeArquivo ? ` ("${nomeArquivo}")` : ""}, conforme a finalidade.`;
  return chamarVisao(cfg, { system, user, mimeType, dataB64, temperature: 0 });
}

// F1 — descreve as FIGURAS/diagramas/tabelas de UMA página (imagem). O texto corrido já foi
// extraído em separado; aqui só o conteúdo VISUAL. Devolve "" quando a página não tem figura real.
export async function descreverFiguras(cfg, { dataB64, contexto = "" }) {
  if (!visaoDisponivel(cfg)) return "";
  const system =
    "Você olha a IMAGEM de UMA página de um material de estudo. O TEXTO corrido dela já foi extraído à parte — " +
    "NÃO o repita. Descreva APENAS o conteúdo VISUAL relevante para estudo: diagramas, esquemas, mapas mentais, " +
    "fluxogramas, tabelas, quadros comparativos, linhas do tempo — transcrevendo/organizando a informação de forma " +
    "FIEL e útil (texto ou markdown, sem inventar). Se a página NÃO tiver figura de conteúdo (só texto, logotipo ou " +
    "marca d'água), devolva EXATAMENTE uma string vazia. Seja objetivo.";
  const user = `Descreva as figuras/diagramas/tabelas desta página${contexto ? ` (${contexto})` : ""}.`;
  const t = await chamarVisao(cfg, { system, user, mimeType: "image/jpeg", dataB64, temperature: 0 });
  return String(t || "").trim();
}

// F2 — lê a IMAGEM da(s) página(s) de SUMÁRIO/ÍNDICE e devolve a árvore de tópicos FIEL.
// A leitura por imagem contorna os defeitos do texto extraído (leaders "....", palavras coladas,
// numeração "1." sem parêntese, títulos sem número) que fazem o parser determinístico falhar.
// Devolve [{numero, titulo, nivel, paginaImpressa}]; mapeamento título→página física é feito depois.
export async function estruturarSumarioVisao(cfg, { imagensB64 = [], contexto = "" }) {
  if (!visaoDisponivel(cfg)) {
    const e = new Error("A estruturação por sumário usa o Google Gemini ou o Claude Code local.");
    e.code = "IA_OFFLINE";
    throw e;
  }
  const imgs = (imagensB64 || []).filter(Boolean);
  if (!imgs.length) return [];
  const system =
    "Você recebe a IMAGEM da(s) página(s) de SUMÁRIO/ÍNDICE/CONTEÚDO de um material de estudo (apostila, aula, resumo). " +
    "Extraia a LISTA DE TÓPICOS exatamente como está, PRESERVANDO A HIERARQUIA (seções, subseções). Devolva SÓ JSON. " +
    "Para cada tópico: 'numero' = a numeração impressa se houver ('1', '1.2', '3.1.2') senão string vazia; " +
    "'titulo' = o texto do tópico, fiel, sem os pontos de preenchimento ('....') e sem o número de página; " +
    "'nivel' = a profundidade (1 = tópico principal/disciplina, 2 = subtópico, 3 = sub-subtópico), inferida pela " +
    "numeração e pela indentação/hierarquia visual; 'paginaImpressa' = o número de página que aparece à direita do " +
    "tópico, se houver, senão null. " +
    "REGRAS: (1) NÃO invente tópicos que não estejam na imagem; (2) NÃO inclua a palavra 'SUMÁRIO'/'ÍNDICE'/'CONTEÚDO' " +
    "como tópico; (3) junte palavras quebradas por hífen ou por falha de digitalização; (4) mantenha a ORDEM da página; " +
    "(5) se a imagem NÃO for um sumário (for conteúdo corrido), devolva lista vazia.";
  const user =
    `Extraia o sumário desta(s) página(s)${contexto ? ` (${contexto})` : ""} no formato JSON.\n` +
    `Formato EXATO: {"topicos":[{"numero":"1","titulo":"Teoria da Constituição","nivel":1,"paginaImpressa":5}]}`;
  // chamarVisaoJson aceita 1 imagem; para várias páginas de sumário, concatena os resultados.
  const todos = [];
  for (const dataB64 of imgs) {
    try {
      const out = await chamarVisaoJson(cfg, { system, user, mimeType: "image/jpeg", dataB64, temperature: 0 });
      const arr = out && Array.isArray(out.topicos) ? out.topicos : Array.isArray(out) ? out : [];
      for (const t of arr) {
        const titulo = String((t && t.titulo) || "").replace(/\.{2,}.*$/, "").replace(/\s{2,}/g, " ").trim();
        if (!titulo || titulo.length < 2) continue;
        todos.push({
          numero: String((t && t.numero) || "").trim(),
          titulo,
          nivel: Math.max(1, Math.min(4, parseInt((t && t.nivel) || 1, 10) || 1)),
          paginaImpressa: t && t.paginaImpressa != null && !isNaN(parseInt(t.paginaImpressa, 10)) ? parseInt(t.paginaImpressa, 10) : null,
        });
      }
    } catch (e) { console.error("[sumario-visao]", e); }
  }
  return todos;
}

// Prompt (system) comum dos mapas mentais. `comOCR` adiciona a instrução de leitura
// quando a fonte é um ARQUIVO (PDF/imagem) lido pela Visão.
function sysMapaMental(comOCR) {
  return (
    (comOCR ? "Você lê um arquivo de estudo (PDF/imagem, inclusive ESCANEADO ou um diagrama/mapa já desenhado; faça OCR) e " : "Você ") +
    "cria MAPAS MENTAIS de estudo. Organize as ideias em uma ÁRVORE hierárquica: um tema central, ramos principais " +
    "(conceitos-chave) e sub-ramos (detalhes, requisitos, exemplos, exceções). " +
    (comOCR ? "Se o arquivo JÁ for um mapa/diagrama, RECONSTITUA fielmente os nós e a hierarquia dele. " : "") +
    "Seja fiel ao conteúdo, sem inventar. Rótulos CURTOS (palavras ou expressões, não frases longas). " +
    "Profundidade de até 3 níveis. Responda SÓ JSON no formato: " +
    '{"titulo":"<tema central>","ramos":[{"titulo":"<ramo>","ramos":[{"titulo":"<sub-ramo>"}]}]}.'
  );
}
function normalizaMapa(r, contexto) {
  const limpaRamos = (arr, prof) => (Array.isArray(arr) ? arr : [])
    .map((x) => ({ titulo: String((x && x.titulo) || "").trim(), ramos: prof < 3 ? limpaRamos(x && x.ramos, prof + 1) : [] }))
    .filter((x) => x.titulo);
  return { titulo: String((r && r.titulo) || contexto || "Mapa mental").trim(), ramos: limpaRamos(r && r.ramos, 1) };
}

// Gera um MAPA MENTAL (árvore hierárquica) a partir de um conteúdo de estudo (TEXTO).
// Retorna { titulo, ramos: [{ titulo, ramos: [...] }] } com até ~3 níveis.
export async function gerarMapaMental(cfg, { texto, contexto }) {
  if (!iaDisponivel(cfg)) { const e = new Error("Conecte o Gemini em Configurações."); e.code = "IA_OFFLINE"; throw e; }
  const user = `Tema/contexto: ${contexto || "geral"}\n\nCONTEÚDO:\n"""\n${corta(texto, 8000)}\n"""`;
  const r = (await chamar(cfg, { system: sysMapaMental(false), user, json: true, temperature: 0.4 })) || {};
  return normalizaMapa(r, contexto);
}

// Gera/IMPORTA um MAPA MENTAL a partir de um ARQUIVO (PDF/imagem) pela Visão — em UMA chamada
// (lê com OCR, e se for um diagrama já pronto, reconstrói a árvore). 120s + fallback. Só Gemini.
export async function gerarMapaMentalDeArquivo(cfg, { dataB64, mimeType = "application/pdf", contexto }) {
  if (!visaoDisponivel(cfg)) {
    const e = new Error("A leitura de arquivo para mapa mental usa o Google Gemini ou o Claude Code local. Selecione um deles em Configurações.");
    e.code = "IA_OFFLINE";
    throw e;
  }
  const user = `Tema/contexto: ${contexto || "geral"}. Leia este arquivo e gere o mapa mental no formato JSON pedido.`;
  const r = await chamarVisaoJson(cfg, { system: sysMapaMental(true), user, mimeType, dataB64, temperature: 0.4 });
  return normalizaMapa(r, contexto);
}

// Casa os ASSUNTOS de um plano de cursinho com os TÓPICOS do edital (sinônimos), via IA.
// itens = [{assunto}]; topicos = [{nome, aliases}]. Retorna [{assunto, topicoNome|null}].
export async function compatibilizarAulasTopicos(cfg, { itens, topicos }) {
  if (!iaDisponivel(cfg)) { const e = new Error("Conecte o Gemini em Configurações."); e.code = "IA_OFFLINE"; throw e; }
  const system =
    "Você casa ASSUNTOS de um plano de cursinho com os TÓPICOS de um edital. Para CADA assunto, escolha o " +
    "tópico do edital que melhor corresponde (mesmo com nomes diferentes ou sinônimos). Se nenhum corresponder, " +
    "use null. NÃO invente tópicos: use EXATAMENTE um nome da lista. Responda só JSON.";
  const tops = (topicos || []).map((t, i) => `${i + 1}. ${t.nome}${t.aliases && t.aliases.length ? ` (sinônimos: ${t.aliases.join(", ")})` : ""}`).join("\n");
  const asn = (itens || []).map((x, i) => `${i + 1}. ${x.assunto}`).join("\n");
  const user =
    `TÓPICOS DO EDITAL:\n${tops}\n\nASSUNTOS DO CURSINHO:\n${asn}\n\n` +
    `Responda EXATAMENTE: {"matches":[{"assunto":"<texto do assunto>","topicoNome":"<nome EXATO da lista ou null>"}]}`;
  const r = await chamar(cfg, { system, user, json: true, temperature: 0.1 });
  return r && Array.isArray(r.matches) ? r.matches : [];
}

// dataUrl: "data:image/jpeg;base64,...."; tipo: "material" (padrão) ou "manuscrito".
export async function transcreverImagem(cfg, { dataUrl, contexto, tipo }) {
  if (!iaDisponivel(cfg)) {
    const e = new Error("IA não conectada. Conecte o Gemini em Configurações para usar a Visão.");
    e.code = "IA_OFFLINE";
    throw e;
  }
  if (cfg.iaProvider !== "gemini") {
    throw new Error("A transcrição por Visão (OCR) está disponível no Google Gemini. Selecione o Gemini em Configurações.");
  }
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!m) throw new Error("Imagem inválida para a Visão.");
  const mimeType = m[1];
  const dataB64 = m[2];

  if (tipo === "manuscrito") {
    const system =
      "Você é um transcritor de manuscritos. Transcreva FIELMENTE, em português, o texto manuscrito da " +
      "imagem (resposta de prova discursiva/redação). Regras: (1) preserve a divisão em parágrafos; " +
      "(2) NÃO corrija erros de português, ortografia ou conteúdo do candidato — transcreva como está; " +
      "(3) marque trechos ilegíveis como [ilegível]; (4) responda apenas com a transcrição, sem comentários seus.";
    const user = "Transcreva o texto manuscrito desta imagem.";
    return chamarVisao(cfg, { system, user, mimeType, dataB64 });
  }

  const system =
    "Você é um OCR inteligente para material de estudo. Transcreva FIELMENTE, em português, TODO o " +
    "conteúdo legível da imagem (página de PDF escaneado, slide ou foto). Regras rígidas:\n" +
    "(1) Para TABELAS, reproduza a estrutura como tabela em Markdown (| coluna | coluna | com linha de cabeçalho).\n" +
    "(2) Para ORGANOGRAMAS, FLUXOGRAMAS ou diagramas, descreva a hierarquia/relações como LISTA ANINHADA " +
    "(indentada por níveis) e acrescente um parágrafo curto explicando o fluxo/relações.\n" +
    "(3) NÃO invente conteúdo ausente; marque trechos ilegíveis como [ilegível].\n" +
    "(4) NÃO adicione comentários, títulos ou texto seu além da transcrição do que está na imagem.";
  const user =
    (contexto ? `Contexto (disciplina/tópico): ${contexto}\n\n` : "") +
    "Transcreva o conteúdo desta página/imagem seguindo as regras (texto corrido, tabelas em Markdown, diagramas descritos).";
  try {
    return await chamarVisao(cfg, { system, user, mimeType, dataB64 });
  } catch (e) {
    // O Gemini barra a CÓPIA LITERAL de material protegido (finishReason RECITATION).
    // Fallback: reestruturar o conteúdo COM PALAVRAS PRÓPRIAS — passa pelo filtro e
    // ainda entrega o que importa para estudar (tabelas/organogramas estruturados).
    if (e.code === "RECITATION") {
      const sys2 =
        "Esta é uma página do material de estudo do PRÓPRIO usuário. Em vez de copiar o texto " +
        "literalmente, EXTRAIA e ORGANIZE as informações com suas próprias palavras, de forma " +
        "concisa (sem reproduzir frases longas idênticas às do material). Regras: (1) preserve TABELAS " +
        "como tabela em Markdown; (2) represente ORGANOGRAMAS/diagramas como LISTA ANINHADA por níveis + " +
        "um parágrafo explicando as relações; (3) foque no conteúdo de estudo (conceitos, listas, " +
        "hierarquias, definições); (4) não invente o que não está na imagem.";
      try {
        return await chamarGeminiVisao(cfg, { system: sys2, user, mimeType, dataB64, temperature: 0.3 });
      } catch (e2) {
        if (e2.code === "RECITATION")
          throw new Error("O Gemini bloqueou esta página pelo filtro de direito autoral, mesmo reestruturando. Transcreva o trecho manualmente.");
        throw e2;
      }
    }
    if (e.code === "SAFETY")
      throw new Error("O Gemini bloqueou esta página pelo filtro de segurança. Tente outra página ou transcreva o trecho manualmente.");
    throw e;
  }
}

// ---------------------------------------------------------------------------
// EMBEDDINGS (busca semântica) — vetores de texto via Gemini text-embedding-004
// (grátis). Indexa trechos do material/resumos e compara por similaridade de cosseno.
// Econômico: 1 requisição em lote embute até 100 trechos. Gemini-only; offline o app
// cai para a busca TEXTUAL (o núcleo não depende disto).
// ---------------------------------------------------------------------------
// Modelo de embedding atual disponível na API grátis. Matryoshka (MRL): podemos pedir
// uma dimensão menor (768) para o índice não ficar enorme, mantendo boa qualidade.
export const EMB_MODELO = "gemini-embedding-001";
export const EMB_DIM = 768;

// Arredonda para 4 casas — corta o tamanho do índice (JSON) sem afetar o cosseno.
function arredondarVetor(vals) {
  return (vals || []).map((x) => Math.round(x * 1e4) / 1e4);
}

// Executa fn sobre os itens com no máximo `limite` chamadas simultâneas (acelera a
// indexação sem estourar o limite de requisições por minuto).
async function mapLimit(itens, limite, fn) {
  const out = new Array(itens.length);
  let i = 0;
  async function worker() {
    while (i < itens.length) {
      const idx = i++;
      out[idx] = await fn(itens[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, worker));
  return out;
}

function embedUm(cfg, modelo, texto, taskType) {
  return geminiComReserva(cfg, (c) => embedUmRaw(c, modelo, texto, taskType));
}

async function embedUmRaw(cfg, modelo, texto, taskType) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:embedContent` +
    `?key=${encodeURIComponent(cfg.iaKey.trim())}`;
  const body = {
    model: `models/${modelo}`,
    content: { parts: [{ text: texto }] },
    taskType,
    outputDimensionality: EMB_DIM,
  };
  const resp = await fetchIA(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, "Gemini (embedding)");
  const data = await resp.json();
  return arredondarVetor((data && data.embedding && data.embedding.values) || []);
}

// taskType melhora o resultado: RETRIEVAL_DOCUMENT ao indexar, RETRIEVAL_QUERY na busca.
// Embute item a item (a API grátis não tem batch síncrono para este modelo), com
// concorrência limitada. 1 trecho = 1 requisição.
export async function gerarEmbeddings(cfg, textos, taskType = "RETRIEVAL_DOCUMENT") {
  if (!iaDisponivel(cfg)) {
    const e = new Error("IA não conectada. Conecte o Gemini em Configurações para a busca semântica.");
    e.code = "IA_OFFLINE";
    throw e;
  }
  if (cfg.iaProvider !== "gemini") {
    throw new Error("A busca semântica usa embeddings do Google Gemini. Selecione o Gemini em Configurações.");
  }
  const modelo = (cfg.iaEmbModelo || "").trim() || EMB_MODELO;
  const lista = (textos || []).map((t) => corta(String(t || ""), 8000));
  return mapLimit(lista, 4, (t) => embedUm(cfg, modelo, t, taskType));
}

export async function gerarEmbedding(cfg, texto, taskType = "RETRIEVAL_QUERY") {
  const [v] = await gerarEmbeddings(cfg, [texto], taskType);
  return v || [];
}

// Modelos Gemini grátis em ordem de preferência (a cota grátis varia por modelo/chave;
// se um der 429/404, tentamos o próximo). Usado no diagnóstico do botão "Testar".
export const GEMINI_FALLBACKS = [
  "gemini-3.1-flash-lite", // padrão: maior cota grátis observada (~500 RPD)
  "gemini-2.5-flash-lite", // 2ª opção (cota baixa em alguns projetos, ~20 RPD)
  "gemini-2.5-flash", // rede de segurança
];

// Teste de conexão. Para o Gemini, se o modelo configurado falhar por COTA (429) ou
// não existir (404), tenta automaticamente outros modelos grátis e devolve qual
// funcionou — assim o usuário descobre um modelo utilizável sem tentativa e erro.
// Retorna { ok: boolean, modelo: string }.
export async function testarConexao(cfg) {
  const ping = { system: "Responda apenas com a palavra: ok", user: "Diga 'ok'.", json: false, temperature: 0 };

  if (cfg.iaProvider === "gemini") {
    const preferido = (cfg.iaModelo || "").trim();
    const lista = preferido
      ? [preferido, ...GEMINI_FALLBACKS.filter((m) => m !== preferido)]
      : [...GEMINI_FALLBACKS];
    let ultimo = null;
    for (const modelo of lista) {
      try {
        // Loop de modelos é DESTA função: usa o wrapper de CHAVE direto (não o
        // geminiResiliente), senão haveria fallback de modelo aninhado (N×N).
        const r = await geminiComReserva({ ...cfg, iaModelo: modelo }, (c) => chamarGeminiRaw(c, ping));
        return { ok: !!r, modelo };
      } catch (e) {
        ultimo = e;
        // Erro de chave/permissão (400 "API key not valid", 401, 403) não melhora
        // trocando de modelo: para já. Só vale insistir em 429 (cota) e 404 (modelo).
        if (e.status === 400 || e.status === 401 || e.status === 403) break;
      }
    }
    throw ultimo || new Error("Falha desconhecida ao testar o Gemini.");
  }

  const r = await chamar(cfg, ping);
  return { ok: String(r).toLowerCase().includes("ok"), modelo: (cfg.iaModelo || "").trim() || MODELO_PADRAO[cfg.iaProvider] };
}

function normalizaNota(n) {
  const s = String(n || "").toLowerCase();
  if (s.startsWith("b") && s.includes("a")) return "baixa";
  if (s.startsWith("m")) return "média";
  if (s.startsWith("b")) return "boa";
  if (s.includes("alt") || s.includes("ót") || s.includes("bo")) return "boa";
  return "média";
}

// ---------------------------------------------------------------------------
// Roteador de COMANDOS do chat-executor: decide se a mensagem é um COMANDO
// (ação a executar no app, após confirmação) ou apenas uma PERGUNTA.
// Retorna { acao, params, resumo }. acao=null => trate como pergunta (RAG).
// ---------------------------------------------------------------------------
export async function interpretarComando(cfg, { pergunta, topicos = [], materiais = [], resumos = [] }) {
  const lista = (arr) => (arr || []).slice(0, 60).join(" · ") || "(nenhum)";
  const system =
    "Você é o ROTEADOR de comandos de um app de estudos para concursos. Decida se a mensagem é " +
    "um COMANDO (ação a executar no app) ou apenas uma PERGUNTA/dúvida/explicação.\n" +
    'Se for só PERGUNTA/explicação (ex.: "o que é...", "explique...", "como funciona o app", "qual a diferença..."), ' +
    'responda {"acao":null}.\n' +
    "REGRA IMPORTANTE: se a mensagem PEDE PARA GERAR/CRIAR/FAZER/MONTAR algo (verbos como gere, crie, faça, " +
    "elabore, prepare, monte, gerar, criar, fazer, resuma, sintetize, compile, agende, registre, marque, abra), " +
    "então É UM COMANDO — escolha a ação correspondente e NUNCA responda como se fosse pergunta. Exemplos: " +
    '"resuma o tópico X" → criar_resumo; "gere 5 questões de Y" → criar_questoes; "faça flashcards de Z" → criar_flashcards.\n' +
    "Se for COMANDO, escolha UMA ação e extraia os parâmetros. AÇÕES:\n" +
    "- criar_flashcards {origem:'topico'|'material'|'resumo'|'lei'|'juris', alvo:<nome do tópico/material/resumo OU a referência do dispositivo, ex.: 'art. 37 CF' | 'Súmula 473 STF'>, n:<1-20>, dificuldade:'facil'|'medio'|'dificil'}\n" +
    "- criar_questoes {origem:'topico'|'material'|'resumo'|'lei'|'juris', alvo:<nome ou referência do dispositivo>, n:<1-20>, dificuldade, formato:'mc'|'ce'}\n" +
    "- criar_resumo {origem:'material'|'flashcards'|'erros'|'lei'|'juris', alvo:<nome do tópico ou 'todos'>}\n" +
    "- criar_meta_leitura {tipo:'lei'|'juris', referencia:<texto, ex.: 'ler art. 1º a 20 da CF' | 'ler os informativos 810-815 do STJ'>} (cria uma meta de leitura na aba Metas, que vira tarefa no Planejamento)\n" +
    "- criar_mapa_mental {alvo:<nome do tópico>}\n" +
    "- adicionar_tarefa {titulo:<texto>, dia:<0=Dom..6=Sáb ou null>, categoria:<'Materiais'|'Prática'|'Revisão'|'Lei Seca'|'Jurisprudência' ou null>, topico:<nome ou null>}\n" +
    "- agendar_revisao {topico:<nome>}\n" +
    "- registrar_sessao {fase:'E'|'A'|'R', topico:<nome ou null>, minutos:<int>, paginas:<int ou null>, acertos:<int ou null>, total:<int ou null>}\n" +
    "- iniciar_cronometro {topico:<nome ou null>, fase:'E'|'A'|'R', minutos:<int ou null>}\n" +
    "- marcar_topico {topico:<nome>, concluido:true|false}\n" +
    "- definir_metas {diariaMin:<int ou null>, semanalMin:<int ou null>, mensalMin:<int ou null>}\n" +
    "- definir_data_prova {data:'yyyy-mm-dd'}\n" +
    "- adicionar_erro {descricao:<texto>, correto:<texto ou null>, topico:<nome ou null>}\n" +
    "- criar_lembrete {texto:<texto do recado>, data:'yyyy-mm-dd' ou null} (recado livre — o app lembra; use data quando o usuário citar um prazo/dia)\n" +
    "- abrir {tela:'hoje'|'planejamento'|'diagnostico'|'mentor'|'edital'|'documentos'|'leiseca'|'jurisprudencia'|'pratica'|'pratica-ce'|'correcao'|'flashcards'|'revtopico'|'erros'|'resumos'|'config'}\n" +
    "- estudar_letra {dominio:'lei'|'juris'} (abre a aba Estudar: praticar a letra — Certo/Errado, completar a letra (cloze), revisar o que vence, refazer erros; na jurisprudência também a súmula-duelo)\n" +
    "- ler_letra {dominio:'lei'|'juris'} (abre a aba Ler: a letra dos artigos/súmulas, com a incidência do que mais cai inline)\n" +
    "- analisar_progresso {}\n" +
    `TÓPICOS existentes: ${lista(topicos)}\n` +
    `MATERIAIS existentes: ${lista(materiais)}\n` +
    `RESUMOS existentes: ${lista(resumos)}\n` +
    "Use EXATAMENTE os nomes existentes quando o usuário se referir a um tópico/material/resumo. " +
    "Não invente nomes. Se um dado essencial faltar, deixe null (quem executa pedirá). " +
    'Responda SÓ JSON: {"acao":<string|null>,"params":{...},"resumo":<frase curta, 1ª pessoa, do que será feito p/ o usuário confirmar, ex.: "Criar 5 flashcards (nível médio) de Atos administrativos.">}.';
  const obj = (await chamar(cfg, { system, user: pergunta, json: true, temperature: 0.1 })) || {};
  return { acao: obj.acao || null, params: obj.params || {}, resumo: obj.resumo || "" };
}
