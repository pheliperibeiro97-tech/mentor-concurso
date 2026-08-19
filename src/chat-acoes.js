// Executor de comandos do chat-assistente. Recebe a intenção interpretada pela IA
// (ver interpretarComando em ia-provider.js) e executa a ação no store — SEMPRE após
// o usuário CONFIRMAR no chat (princípio: o assistente propõe, não executa sozinho).
// Cada função devolve uma frase de resultado (ou lança Error com mensagem amigável).
import * as crono from "./cronometro.js";
import { abrirMapaCompleto } from "./mapa-mental.js";
import { rotuloDocumento } from "./estrutura.js";

const ROTAS_VALIDAS = new Set([
  "hoje", "planejamento", "diagnostico", "mentor", "edital", "documentos", "leiseca",
  "jurisprudencia", "pratica", "pratica-ce", "correcao", "flashcards", "revtopico", "erros", "resumos", "config",
]);
const NOME_TELA = {
  hoje: "Hoje", planejamento: "Planejamento", diagnostico: "Acompanhamento", mentor: "Mentor IA",
  edital: "Edital", documentos: "Materiais", leiseca: "Lei Seca", jurisprudencia: "Jurisprudência",
  pratica: "Questões", "pratica-ce": "Questões C/E", correcao: "Discursiva", flashcards: "Flashcards",
  revtopico: "Revisão de Tópicos", erros: "Caderno de Erros", resumos: "Resumos", config: "Configurações",
};
const FASE_NOME = { E: "Estudo", A: "Prática", R: "Revisão" };

function clampInt(v, min, max, pad) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return pad;
  return Math.max(min, Math.min(max, n));
}
function dif(v) {
  return ["facil", "medio", "dificil"].includes(v) ? v : "medio";
}
function topicoId(store, nome) {
  if (!nome) return null;
  const t = store.acharTopicoPorNome(nome);
  return t ? t.id : null;
}
// A busca do store exige a FRASE INTEIRA e literal: "controle de constitucionalidade" nao casa
// com um material que escreve "controle concentrado de constitucionalidade", e o app dizia nao
// ter material — tendo. Aqui a comparacao e por PALAVRAS, sem acento: o assunto vira palavras
// significativas e vale o material que contiver quase todas. Exigir a maioria (e no minimo
// duas, quando ha mais de duas) evita casar por acaso: "improbidade administrativa" nao pega
// um material de Direito Administrativo so pela palavra "administrativa".
function normalizarTexto(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
const PALAVRAS_VAZIAS = new Set(["de","da","do","das","dos","no","na","nos","nas","em","sobre","para","com","por","um","uma","os","as"]);
function palavrasDoAssunto(alvo) {
  return [...new Set(normalizarTexto(alvo).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !PALAVRAS_VAZIAS.has(w)))];
}
function docPorAssunto(store, alvo) {
  const chaves = palavrasDoAssunto(alvo);
  if (!chaves.length) return null;
  const minimo = chaves.length <= 2 ? chaves.length : Math.max(2, Math.ceil(chaves.length * 0.6));
  let melhor = null;
  let melhorAchadas = 0;
  for (const d of store.get().documentos || []) {
    const txt = normalizarTexto(`${d.titulo} 
 ${d.texto || ""}`);
    const achadas = chaves.reduce((n, k) => n + (txt.includes(k) ? 1 : 0), 0);
    if (achadas > melhorAchadas) { melhorAchadas = achadas; melhor = d; }
  }
  return melhorAchadas >= minimo ? melhor : null;
}
function resumoPorAssunto(store, alvo) {
  const chaves = palavrasDoAssunto(alvo);
  if (!chaves.length) return null;
  const minimo = chaves.length <= 2 ? chaves.length : Math.max(2, Math.ceil(chaves.length * 0.6));
  return (store.get().resumos || []).find((r) => {
    const txt = normalizarTexto(`${r.titulo} 
 ${r.conteudo || r.conteudoHTML || ""}`);
    return chaves.reduce((n, k) => n + (txt.includes(k) ? 1 : 0), 0) >= minimo;
  }) || null;
}

function docDe(store, alvo, origem) {
  // material por nome; se origem=topico, acha um material vinculado ao tópico
  let doc = (store.buscarDocumentos(alvo) || [])[0] || null;
  if (!doc && origem !== "material") {
    const t = store.acharTopicoPorNome(alvo);
    if (t) doc = (store.get().documentos || []).find((d) => (d.topicoIds || []).includes(t.id) || d.topicoId === t.id) || null;
  }
  if (!doc) doc = docPorAssunto(store, alvo); // subtema DENTRO de um material
  return doc;
}
function resumoDe(store, alvo) {
  const low = (alvo || "").toLowerCase();
  if (!low) return null;
  return (store.get().resumos || []).find((r) => (r.titulo || "").toLowerCase().includes(low))
    || resumoPorAssunto(store, alvo)
    || null;
}

// Acha um dispositivo de Lei Seca/Jurisprudência pela referência (ex.: "art 37 CF", "Súmula 473").
function normRef(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, ""); }
function indicacaoDe(store, alvo, tipo) {
  const alvoN = normRef(alvo);
  if (!alvoN) return null;
  const inds = store.get().indicacoes.filter((i) => i.tipo === tipo && !i.metaLeitura && !i.revogado && (i.texto || "").trim());
  return inds.find((i) => { const r = normRef(i.referencia); return r.includes(alvoN) || alvoN.includes(r); }) || null;
}

// Envolve `gerar` num LOTE de geração e devolve { n, lote, rot } — assim a tela de destino
// abre mostrando só o que acabou de sair, como nos demais fluxos do app.
async function gerarComLote(store, p, tipo) {
  const rot = `do pedido «${String(p.alvo || "Mentor").slice(0, 40)}»`;
  const lote = store.iniciarLoteGeracao(rot);
  try {
    return { n: await gerar(store, p, tipo), lote, rot };
  } finally {
    store.encerrarLoteGeracao();
  }
}

async function gerar(store, p, tipo) {
  // tipo: "fc" | "mc" | "ce"
  const n = clampInt(p.n, 1, 20, tipo === "fc" ? 6 : 5);
  const d = dif(p.dificuldade);
  // origem lei/juris → gera a partir de UM dispositivo (artigo/súmula) pela referência.
  if (p.origem === "lei" || p.origem === "juris") {
    const ind = indicacaoDe(store, p.alvo, p.origem === "juris" ? "juris" : "lei");
    if (!ind) throw new Error(`Não encontrei "${p.alvo || "?"}" na ${p.origem === "juris" ? "Jurisprudência" : "Lei Seca"}. Adicione o dispositivo (com o texto) e tente de novo.`);
    let itens;
    if (tipo === "fc") itens = store.iaDisponivel() ? await store.gerarFlashcardsIADeIndicacao(ind.id, n, d) : [store.gerarFlashcardDeIndicacao(ind.id)].filter(Boolean);
    else itens = await store.gerarQuestoesDeIndicacao(ind.id, n, d, tipo === "ce" ? "ce" : "mc");
    return Array.isArray(itens) ? itens.length : 0;
  }
  const r = p.origem === "resumo" ? resumoDe(store, p.alvo) : null;
  const doc = p.origem === "resumo" ? null : docDe(store, p.alvo, p.origem);
  if (!doc && !r) {
    throw new Error(`Não encontrei material nem resumo sobre "${p.alvo || "?"}". Importe o material desse assunto (ou peça a partir de um resumo) e tente de novo.`);
  }
  let itens;
  if (tipo === "fc") itens = r ? await store.gerarFlashcardsDeResumo(r.id, n, d) : await store.gerarFlashcardsDeDoc(doc.id, n, d);
  else if (tipo === "ce") {
    if (!doc) throw new Error("Questões Certo/Errado só posso gerar a partir de um material (não de resumo). Indique o material.");
    itens = await store.gerarQuestoesCEDeDoc(doc.id, n, d);
  } else itens = r ? await store.gerarQuestoesDeResumo(r.id, n, d) : await store.gerarQuestoesDeDoc(doc.id, n, d);
  return Array.isArray(itens) ? itens.length : 0;
}

// Por que a ação NÃO pode ser executada — consultado ANTES de propor ao usuário. O app só monta
// questões e flashcards a partir do conteúdo DELE (material, resumo, dispositivo de lei/juris),
// de propósito: é o que impede a IA de inventar. Só que essa recusa chegava depois do
// "Confirmar", como se fosse um erro; agora chega como resposta, com o caminho para resolver.
// Devolve null quando pode seguir.
export function motivoParaNaoExecutar(store, acao, params = {}) {
  const p = params || {};
  if (acao !== "criar_questoes" && acao !== "criar_flashcards") return null;
  if (p.origem === "lei" || p.origem === "juris") {
    const ehJuris = p.origem === "juris";
    return indicacaoDe(store, p.alvo, ehJuris ? "juris" : "lei")
      ? null
      : `Não encontrei "${p.alvo || "?"}" na ${ehJuris ? "Jurisprudência" : "Lei Seca"}. Importe o dispositivo com o texto e eu gero na hora.`;
  }
  const temDoc = !!docDe(store, p.alvo, p.origem);
  const temResumo = !!resumoDe(store, p.alvo);
  const oQue = acao === "criar_questoes" ? "questões" : "flashcards";
  if (!temDoc && !temResumo) {
    // Nenhum casamento CONFIANTE. Isso nao prova que o assunto nao esta nos seus materiais: pode
    // ser um subtema que a comparacao por palavras nao pegou. Por isso a resposta nao e um muro
    // — ela mostra o que existe, para voce apontar a fonte numa frase, sem precisar procurar.
    const nomes = [
      ...(store.get().documentos || []).map((d) => rotuloDocumento(store.get(), d)),
      ...(store.get().resumos || []).map((r) => r.titulo),
    ].filter(Boolean).slice(0, 6);
    const lista = nomes.length
      ? ` Se esse assunto estiver dentro de algum destes, é só me dizer qual: ${nomes.map((n) => `«${n}»`).join(", ")}.`
      : "";
    return `Não achei "${p.alvo || "?"}" pelo nome nos seus materiais, e eu só monto ${oQue} a partir do seu próprio conteúdo — é assim que evito inventar.${lista} Se ainda não tiver esse conteúdo, importe em Materiais e eu faço na hora.`;
  }
  if (acao === "criar_questoes" && p.formato === "ce" && !temDoc) {
    return `Certo/Errado eu só consigo gerar a partir de um material, não de resumo. Importe o material de "${p.alvo || "?"}" ou peça em múltipla escolha.`;
  }
  return null;
}

// A saída "sem fonte" só faz sentido para questão de múltipla escolha sobre um ASSUNTO. Para
// lei/jurisprudência não: ali o valor é a letra exata do dispositivo, e é justamente o que o
// modelo não pode inventar — sem o texto importado, não há caminho seguro.
export function podeOferecerSemFonte(acao, params = {}) {
  if (acao !== "criar_questoes") return false;
  if (params.origem === "lei" || params.origem === "juris") return false;
  // Certo/Errado ENTRA. Eu havia bloqueado alegando que "depende de recortar a letra do
  // material" — não depende: "A autoexecutoriedade permite executar sem autorização judicial"
  // é um C/E conceitual perfeitamente possível. A razão real era que eu só tinha escrito o
  // gerador de múltipla escolha. Escrito o de C/E, o bloqueio caiu.
  return !!(params.alvo || "").trim();
}

// Executa a ação. Retorna uma frase de resultado.
export async function executarComando(store, app, acao, params = {}) {
  const p = params || {};
  switch (acao) {
    // Gerar pelo Mentor ABRE a tela do resultado (era só uma frase "veja em Flashcards" — no
    // celular o painel do chat cobre a tela inteira, então o resultado ficava escondido atrás).
    case "criar_flashcards": {
      const { n: q, lote, rot } = await gerarComLote(store, p, "fc");
      if (q) app.navigate("flashcards", { lote, loteRotulo: rot });
      return `Criei ${q} ${q === 1 ? "flashcard" : "flashcards"} (nível ${dif(p.dificuldade)}).`;
    }
    case "criar_questoes": {
      const fmt = p.formato === "ce" ? "ce" : "mc";
      const { n: q, lote, rot } = await gerarComLote(store, p, fmt);
      if (q) app.navigate(fmt === "ce" ? "pratica-ce" : "pratica", { lote, loteRotulo: rot });
      return `Criei ${q} ${q === 1 ? "questão" : "questões"} ${fmt === "ce" ? "Certo/Errado" : "de múltipla escolha"} (nível ${dif(p.dificuldade)}).`;
    }
    // Gerar SEM material — só quando o usuário pediu de propósito, ciente de que não há fonte.
    case "criar_questoes_sem_fonte": {
      const assunto = String(p.alvo || p.assunto || "").trim();
      const rot = `sem fonte «${assunto.slice(0, 40)}»`;
      const lote = store.iniciarLoteGeracao(rot);
      let r;
      try {
        r = await store.gerarQuestoesSemFonte(assunto, clampInt(p.n, 1, 20, 5), p.dificuldade, !!p.web, p.formato === "ce" ? "ce" : "mc");
      } finally {
        store.encerrarLoteGeracao();
      }
      const feitas = r.questoes.length;
      const ehCE = p.formato === "ce";
      if (feitas) app.navigate(ehCE ? "pratica-ce" : "pratica", { lote, loteRotulo: rot });
      if (!feitas) return `Não consegui montar questão nenhuma sobre "${assunto}" sem depender de número de artigo, prazo ou percentual. Com o material importado eu faço direito.`;
      // A conta aparece quando o filtro derrubou algo: melhor entregar menos e dizer, do que
      // completar o lote com o que foi barrado justamente por ser arriscado.
      const sobra = r.descartadas
        ? ` Descartei ${r.descartadas} que dependiam de número de artigo, prazo ou percentual.`
        : "";
      if (r.comWeb) {
        const nf = (r.fontesWeb || []).length;
        return `Criei ${feitas} ${feitas === 1 ? "questão" : "questões"} sobre "${assunto}" com busca na web${nf ? ` (${nf} ${nf === 1 ? "fonte consultada" : "fontes consultadas"})` : ""}.${sobra} Estão marcadas com «Fonte na web · confira» — página de internet não é texto oficial, vale conferir.`;
      }
      const oQue = ehCE ? (feitas === 1 ? "item Certo/Errado" : "itens Certo/Errado") : (feitas === 1 ? "questão" : "questões");
      return `Criei ${feitas} ${oQue} sobre "${assunto}" — sem fonte, direto do meu conhecimento.${sobra} Cada ${ehCE ? "item está marcado" : "uma está marcada"} com o selo «Sem fonte · confira»: vale checar antes de virar memória.`;
    }
    case "criar_resumo": {
      const fontesOk = ["material", "flashcards", "erros", "lei", "juris"];
      const fonte = fontesOk.includes(p.origem) ? p.origem : "material";
      const tid = p.alvo && p.alvo !== "todos" ? topicoId(store, p.alvo) : null;
      const r = store.gerarResumoDe(fonte, tid || "todos");
      if (!r) throw new Error("Não consegui montar o resumo (sem conteúdo suficiente da fonte indicada).");
      app.navigate("resumos");
      return `Resumo criado a partir de ${fonte}${tid ? ` do tópico "${p.alvo}"` : ""}.`;
    }
    case "criar_mapa_mental": {
      const tid = p.alvo ? topicoId(store, p.alvo) : null;
      if (!tid) throw new Error(`Diga de qual TÓPICO fazer o mapa (não encontrei "${p.alvo || "?"}").`);
      const m = await store.gerarMapaMentalDeTopico(tid);
      if (!m) throw new Error("Não consegui montar o mapa (sem conteúdo suficiente do tópico).");
      abrirMapaCompleto(store, app, m);
      return `Mapa mental do tópico "${p.alvo}" gerado e aberto.`;
    }
    case "adicionar_tarefa": {
      if (!p.titulo) throw new Error("Qual é o título da tarefa?");
      const dia = p.dia === null || p.dia === undefined ? null : clampInt(p.dia, 0, 6, null);
      let data = null;
      if (dia !== null) {
        const semana = store.semanaAtual();
        data = semana && semana[dia] ? semana[dia] : null;
      }
      store.addMissao({ titulo: p.titulo, topicoId: topicoId(store, p.topico), categoria: p.categoria || undefined, data, origem: "chat" });
      return `Tarefa adicionada: "${p.titulo}"${data ? ` (${data})` : " (solta)"}.`;
    }
    case "agendar_revisao": {
      const tid = topicoId(store, p.topico);
      if (!tid) throw new Error(`Não encontrei o tópico "${p.topico || "?"}".`);
      store.agendarRevisaoTopico(tid);
      return `Revisão do tópico "${p.topico}" agendada (curva 24h → 7d → ...).`;
    }
    case "registrar_sessao": {
      const fase = ["E", "A", "R"].includes(p.fase) ? p.fase : "E";
      const min = clampInt(p.minutos, 0, 600, 0);
      const tot = clampInt(p.total, 0, 9999, 0);
      let ac = clampInt(p.acertos, 0, 9999, 0);
      if (ac > tot) ac = tot;
      if (min < 1 && tot < 1 && !p.paginas) throw new Error("Quanto tempo (minutos) durou a sessão?");
      store.registrarSessao({
        fase, topicoId: topicoId(store, p.topico), tempoSeg: min * 60,
        paginas: clampInt(p.paginas, 0, 99999, 0), qAcertos: ac, qErros: Math.max(0, tot - ac),
      });
      return `Sessão registrada: ${min} min em ${FASE_NOME[fase]}${tot ? ` · ${ac}/${tot} questões` : ""}.`;
    }
    case "iniciar_cronometro": {
      const fase = ["E", "A", "R"].includes(p.fase) ? p.fase : "E";
      const tid = topicoId(store, p.topico);
      const t = tid ? store.get().topicos.find((x) => x.id === tid) : null;
      crono.vincular({ fase, topicoId: tid, faseNome: FASE_NOME[fase], topicoLabel: t ? t.nome : "" });
      if (p.minutos) crono.setTarget(clampInt(p.minutos, 1, 300, 25) * 60);
      crono.iniciar();
      app.navigate("hoje");
      return `Cronômetro iniciado${t ? ` para "${t.nome}"` : ""} em ${FASE_NOME[fase]}.`;
    }
    case "marcar_topico": {
      const t = store.acharTopicoPorNome(p.topico);
      if (!t) throw new Error(`Não encontrei o tópico "${p.topico || "?"}".`);
      const querConcluido = p.concluido !== false;
      if (!!t.concluido !== querConcluido) store.toggleTopicoConcluido(t.id);
      return `Tópico "${t.nome}" marcado como ${querConcluido ? "concluído ✓" : "não concluído"}.`;
    }
    case "definir_metas": {
      const patch = {};
      if (p.diariaMin != null) patch.metaDiariaMin = clampInt(p.diariaMin, 0, 1440, 0);
      if (p.semanalMin != null) patch.metaSemanalMin = clampInt(p.semanalMin, 0, 10080, 0);
      if (p.mensalMin != null) patch.metaMensalMin = clampInt(p.mensalMin, 0, 44640, 0);
      if (!Object.keys(patch).length) throw new Error("Qual meta? (diária, semanal ou mensal, em minutos)");
      store.setConfig(patch);
      const fmt = (m) => `${Math.floor(m / 60)}h${m % 60 ? (m % 60) + "min" : ""}`;
      return `Metas atualizadas: ${Object.entries(patch).map(([k, v]) => `${k.replace("meta", "").replace("Min", "")} ${fmt(v)}`).join(" · ")}.`;
    }
    case "definir_data_prova": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data || "")) throw new Error("Qual a data da prova? (ex.: 2026-09-15)");
      store.setConfig({ dataProva: p.data });
      return `Data da prova definida: ${p.data}.`;
    }
    case "adicionar_erro": {
      if (!p.descricao) throw new Error("Descreva o erro que você quer anotar.");
      const tid = topicoId(store, p.topico);
      const t = tid ? store.get().topicos.find((x) => x.id === tid) : null;
      store.addErroManual({ descricao: p.descricao, correto: p.correto || "", topicoId: tid, disciplinaId: t ? t.disciplinaId : null });
      return `Erro anotado no Caderno de Erros.`;
    }
    case "abrir": {
      const tela = ROTAS_VALIDAS.has(p.tela) ? p.tela : null;
      if (!tela) throw new Error("Qual tela você quer abrir?");
      app.navigate(tela);
      return `Abrindo ${NOME_TELA[tela] || tela}.`;
    }
    case "analisar_progresso": {
      // Fase 2: o usuário JÁ pediu a análise — executa (a tela auto-dispara via autoAnalisar).
      app.navigate("mentor", { autoAnalisar: true });
      return `Analisando seu progresso agora — o plano aparece na tela do Mentor em instantes.`;
    }
    case "criar_lembrete": {
      const texto = (p.texto || "").trim();
      if (!texto) throw new Error("O que você quer lembrar?");
      const data = /^\d{4}-\d{2}-\d{2}$/.test(p.data || "") ? p.data : null;
      store.addLembrete(texto, data);
      return `Lembrete criado${data ? ` para ${data}` : ""}: "${texto}".`;
    }
    case "criar_meta_leitura": {
      const juris = p.tipo === "juris";
      const ref = (p.referencia || "").trim();
      if (!ref) throw new Error("O que você quer ler? (ex.: 'ler art. 1º a 20 da CF')");
      store.criarMetaLeitura({ tipo: juris ? "juris" : "lei", referencia: ref });
      return `Meta de leitura criada na ${juris ? "Jurisprudência" : "Lei Seca"}: "${ref}". Virou tarefa no Planejamento.`;
    }
    case "estudar_letra":
    case "treinar_letra": { // treinar_letra = alias legado (a antiga aba Treinar virou Estudar)
      const juris = p.dominio === "juris";
      app.navigate(juris ? "jurisprudencia" : "leiseca", { aba: "estudar" });
      return `Abrindo o Estudar da ${juris ? "Jurisprudência" : "Lei Seca"} (Certo/Errado, completar a letra, revisar, refazer erros${juris ? ", súmula-duelo" : ""}).`;
    }
    case "ler_letra":
    case "raiox_letra": { // raiox_letra = alias legado (o Raio-X virou a incidência inline na aba Ler)
      const juris = p.dominio === "juris";
      app.navigate(juris ? "jurisprudencia" : "leiseca", { aba: "ler" });
      return `Abrindo a aba Ler da ${juris ? "Jurisprudência" : "Lei Seca"} (a letra, com a incidência do que mais cai).`;
    }
    default:
      throw new Error("Não entendi a ação solicitada.");
  }
}
