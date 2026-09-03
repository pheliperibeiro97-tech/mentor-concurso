// Store central: estado do app + todas as operações de domínio.
// Núcleo 100% offline. A UI assina mudanças e re-renderiza.
import { loadState, saveState, resetState, getBlob, lerBlob, setBlob, delBlob, blobsDisponiveis, podeVincularArquivo, escolherArquivo, abrirArquivoNoSistema, ultimoErroDeGravacao, ehErroDeEspaco } from "./persistence.js";
import { limparConfigLocal } from "./config-local.js";
import { uid, todayISO, nowISO, diaLocal, addDays, daysBetween, weekdayISO, inicioSemanaISO, textoComentario } from "./util.js";
import * as sm2 from "./sm2.js";
import * as ciclo from "./ciclo.js";
import * as ia from "./ia.js";
import * as iaProv from "./ia-provider.js";
import * as bancas from "./bancas.js";
import * as areas from "./areas.js";
import { parsearLeiHTML, buscarLeiPlanalto, selecionarArtigos } from "./legis.js";
import * as provas from "./provas.js";
import * as pdf from "./pdf.js";
import { detectarEstrutura, montarEstruturaDeTopicos, acharPaginaSumario, paginasDeSumario, acharTopicoDoBloco, disciplinaDoMaterial, disciplinaDoDocumento, rotuloDocumento } from "./estrutura.js";
import { buscarNoGuia } from "./guia.js";

function defaultState() {
  return {
    meta: { versao: 1, onboarded: false, criadoEm: nowISO() },
    config: {
      iaProvider: "offline",
      iaKey: "",
      iaKeyReserva: "", // chave de reserva (Gemini): usada só quando a principal estoura a cota (429)
      iaModelo: "", // vazio = modelo padrão do provedor (ver ia-provider.js)
      pomodoroFoco: 25,
      pomodoroPausa: 5,
      somAlarme: "longo", // alarme ao terminar o bloco: "curto" | "longo" | "insistente"
      dataProva: null, // 'yyyy-mm-dd' (opcional — há estudo pré-edital)
      metaDiariaMin: 0,
      metaSemanalMin: 0,
      metaMensalMin: 0,
      dispDiariaMin: 0, // disponibilidade média de estudo por dia (min)
      botoesOcultos: [], // ids de telas ocultadas da navegação (só some; pode reativar)
      ordemNav: [], // ordem personalizada dos botões do meio (hoje sempre 1º, config sempre último)
      atencaoAdiada: {}, // pontos de atenção adiados/dispensados: key -> data|"sempre"
      atalhos: [], // atalhos personalizados do usuário (HOJE): {id,nome,tipo,alvo,icone}
      materialAgrupamento: "disciplina", // como agrupar a lista de Material: disciplina|topico|nenhum
      retaFinal: false, // modo Reta Final ativo (prioriza revisão; revela os números no Planejamento)
      diasFolga: [], // dias da semana SEM estudo (0=Dom ... 6=Sáb); somem da agenda da semana
      perfRuim: 60, // semáforo de desempenho: abaixo disto = "ruim" (vermelho)
      perfBom: 80, // semáforo de desempenho: a partir disto = "bom" (verde); entre os dois = "regular" (amarelo)
      histPeriodo: 14, // janela (em dias) do gráfico de histórico no Acompanhamento (7|14|30|90)
      sidebarColapsada: false, // barra lateral recolhida (só ícones) vs. completa (ícones + nome)
      niveisDisciplina: {}, // diagnóstico do plano: discId -> 'nunca' | 'pouco' | 'domino'
      disciplinasAdiadas: [], // "fixar ajuste" do macro: disciplinas que o gerador NÃO inclui agora
      revisaoTopicoAuto: false, // opt-in: agendar revisão (curva 24h/7d/30d) dos tópicos estudados
      // Accountability/notificações (dir.3): facultativas, desativáveis; só disparam no desktop (Tauri).
      notificacoes: { ativar: false, diario: false, horario: "08:00", inatividade: true, revisoes: true, marcos: true },
      checkinVistoData: null, // dia em que o check-in já foi visto/dispensado (não reaparece no mesmo dia)
      paletaMarcacao: "padrao", // cores da marcação: padrao | daltonismo | contraste (acessibilidade)
      bancasPreferidas: [], // nomes de bancas priorizadas nas sugestões — NUNCA limita o usuário
      descartarPdfAposImport: false, // ao importar material, descarta o PDF original após extrair o texto
      materialAvisoAceito: false, // aviso de uso pessoal/local do material já foi aceito uma vez
      dossieOrdem: [], // ordem personalizada das seções do dossiê (lista de keys)
      dossieOcultas: [], // seções do dossiê ocultadas pelo usuário (só ocultam, não removem)
      baseEstudo: "edital", // Fase 4: organizar o estudo por "edital" (padrão) ou "cursinho"
      // Reformulação Lei Seca (F0): preferências do leitor + posição + feriados.
      leitura: { fonte: "inter", tamanho: "media", espacamento: "normal", tema: "auto", align: "esquerda" }, // fonte inter|serif|mono · tamanho pequena|media|grande · espacamento normal|confortavel|muito · tema auto|sepia · align esquerda|justificado
      ultimaLeitura: {}, // { [norma]: { indicacaoId, pct, em } } — "continuar leitura" por lei
      diasFeriado: [], // datas ISO sem estudo (feriados) — além de diasFolga semanal
      metasLeitura: { artigosDia: 0, questoesDia: 0 }, // F6: metas quantitativas diárias da Lei Seca (0 = sem meta)
      nomesLeis: {}, // apelido de exibição por norma ({ "Lei 8.078/1990": "Código de Defesa do Consumidor" }) — corrige detecção errada
    },
    concurso: null,
    editalOficial: { conferidoEm: null, itens: [] }, // Fase 3: checklist do edital oficial (banca)
    aulas: [], // Fase 4: divisão didática do cursinho — {id, nome, topicoIds:[]} (ordem = a do array)
    bancas: [], // bancas adicionadas pelo usuário (além da semente embutida em bancas.js)
    provas: [], // provas anteriores importadas: {id,banca,ano,orgao,cargo,url,assinatura,comentario,criadoEm}
    disciplinas: [],
    topicos: [],
    documentos: [],
    questoes: [],
    tentativas: [],
    errosManuais: [],
    lembretes: [], // recados livres do usuário (não é estudo): {id, texto, data|null, feito, criadoEm}
    flashcards: [],
    revisoes: [],
    sessoes: [],
    indicacoes: [],
    revisoesTopico: [], // curva do esquecimento por TÓPICO estudado (dir.2): {topicoId,proxima,intervalo,historico[]}
    marcacoes: [], // marcação tricromática (dir.4): {alvoTipo,alvoId,cor,inicio,fim,texto,origem}
    missoes: [],
    rotinas: [], // modelos de tarefa semanais recorrentes (ex.: toda segunda: X)
    redacoes: [],
    resumos: [],
    mapasMentais: [], // {id, titulo, arvore:{titulo,ramos[]}, topicoId, origem, criadoEm}
    // Índice de busca semântica (vetorial). itens = trechos embutidos; fontes = assinatura
    // por fonte (docId/resumoId) para reindexar só o que mudou. Vazio = usa busca textual.
    embeddings: { modelo: "", itens: [], fontes: {} },
  };
}

// CONCLUÍDO é a única definição de cobertura do app: o tópico foi marcado como concluído no
// Edital. Ter material ou questões não basta (decisão do usuário).
//
// O nome duplo "coberto"/"concluído" sobreviveu à decisão e virou fonte de confusão: a função
// devolvia os dois números, sempre idênticos, sob rótulos diferentes, e o comentário que
// morava aqui ainda descrevia a regra ANTIGA ("estudado OU tem material"), contrariando o
// código logo abaixo. Ficou um nome só.
function topicoCoberto(state, t) {
  return !!t.concluido;
}

// Fase 1 — material pode pertencer a VÁRIOS tópicos. `topicoIds` é canônico; `topicoId`
// (legado) é mantido como o tópico PRIMÁRIO (o 1º), para os usos de contexto/geração.
function docTops(d) {
  if (Array.isArray(d.topicoIds) && d.topicoIds.length) return d.topicoIds;
  return d.topicoId ? [d.topicoId] : [];
}
function docCobre(d, topicoId) {
  return docTops(d).includes(topicoId);
}

// Intercala tarefas de disciplinas diferentes (interleaving): distribui em rodízio
// para que duas tarefas da mesma disciplina não fiquem em sequência sempre que possível.
function intercalarPorDisciplina(arr) {
  const buckets = new Map();
  for (const x of arr) {
    const k = x.discId || "_";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(x);
  }
  const filas = [...buckets.values()];
  const out = [];
  let addicionou = true;
  while (addicionou) {
    addicionou = false;
    for (const f of filas) {
      if (f.length) {
        out.push(f.shift());
        addicionou = true;
      }
    }
  }
  return out;
}

// Recalcula o texto pesquisável do documento a partir das páginas (quando houver),
// na ordem certa. Mantém doc.texto como fonte única para busca/IA/chat.
// ---- BINÁRIOS dos materiais, fora do estado --------------------------------
// O estado inteiro é uma string JSON reescrita a cada gravação. Com o PDF embutido, uma
// biblioteca de cursinho custaria ~489 MB por gravação (55,4 KB/página medidos, contra
// 4,07 KB sem o binário) — o app engasgaria a cada clique muito antes de encher o disco.
// O binário passa a viver numa chave própria (persistence.getBlob/setBlob) e o documento
// guarda só os sinalizadores `temPdf`/`temImg`. Nada se perde: visualizador, OCR por
// página e descrição de figuras leem o binário sob demanda.
const cacheBinario = new Map(); // docId -> { pdfData, imgData } (memória, nunca persistido)

// Move o binário para fora do estado. Se o armazenamento de blobs não estiver disponível
// (desktop rodando um executável antigo, sem os comandos), mantém embutido como antes —
// melhor um estado gordo que um PDF perdido.
async function guardarBinarioDoc(doc, pdfData, imgData) {
  if (!doc || (!pdfData && !imgData)) return;
  cacheBinario.set(doc.id, { pdfData: pdfData || null, imgData: imgData || null });
  const ok = await setBlob(doc.id, { pdfData: pdfData || null, imgData: imgData || null });
  if (!ok) {
    doc.pdfData = pdfData || null;
    doc.imgData = imgData || null;
    commit();
  }
}

// ---- descrição de figura: Gemini na frente, Claude Code na reserva ------------------------
// Por que híbrido: o Gemini flash-lite faz uma página em ~4 s e é grátis, mas tem cota (15
// req/min no plano gratuito) e às vezes recusa a imagem. O Claude Code local não tem cota, só
// que cada chamada sobe o agente inteiro — medido: US$ 0,048 para responder "OK" SEM imagem
// nenhuma, contra US$ 0,057 com a imagem. Ou seja, 84% do custo é a invocação, não o trabalho.
// Então ele entra só onde o Gemini falhou, e com TETO: se a cota diária do Gemini acabasse no
// meio, as centenas de páginas restantes cairiam todas no caro sem ninguém perceber.
// Parada cooperativa da leitura de figuras: é trabalho de dezenas de minutos, então tem de
// dar para interromper — e o laço é o único lugar que sabe onde está.
let pedidoDePararFiguras = false;
const ehTauriApp = () => typeof window !== "undefined" && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);
const RITMO_GEMINI_MS = 5000; // 12 req/min — o plano grátis permite 15, e sobra folga
const ESPERA_COTA_MS = 25000; // o próprio 429 do Gemini sugere ~15 s; 25 dá margem
let ultimaChamadaVisao = 0;
const ehCota = (e) => /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(String((e && e.message) || e));
// Resposta VAZIA por filtro do modelo, nao por erro de rede: `chamarGeminiVisaoRaw` carimba o
// finishReason em `e.code` (RECITATION = copia de material reconhecido; SAFETY; EMPTY).
const ehBloqueioDeConteudo = (e) => /^(RECITATION|SAFETY|EMPTY)$/.test(String((e && e.code) || ""));

async function descreverUmaFigura(store, b64, pagina, conta, orcamento) {
  const cfg = state.config;
  const temGemini = !!(cfg.iaKey || "").trim();
  const temReserva = ehTauriApp(); // Claude Code local só existe no desktop
  const chamar = (provedor, modo = "fiel") =>
    iaProv.descreverFiguras({ ...cfg, iaProvider: provedor }, { dataB64: b64, contexto: `pág. ${pagina}`, modo });
  const respeitarRitmo = async () => {
    const espera = RITMO_GEMINI_MS - (Date.now() - ultimaChamadaVisao);
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultimaChamadaVisao = Date.now();
  };

  if (temGemini) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      await respeitarRitmo();
      try {
        const texto = await chamar("gemini");
        conta.gemini++;
        return { texto, via: "gemini" };
      } catch (e) {
        // COTA (429) não é recusa da imagem: é "espere". Mandar isso para a reserva paga
        // transformaria "acabou a cota do grátis" em conta cara sem ninguém perceber — foi o
        // que aconteceu na 1ª tentativa desta leitura (20 páginas foram parar no Claude Code).
        // Então: espera e tenta de novo; se insistir, PARA a rodada.
        if (ehCota(e)) {
          if (tentativa === 0) { await new Promise((r) => setTimeout(r, ESPERA_COTA_MS)); continue; }
          return { parou: "cota" };
        }
        // BLOQUEIO DE CONTEÚDO (finishReason RECITATION): o filtro do Gemini corta a resposta que
        // reproduz texto que ele reconhece, e é exatamente o que a transcrição literal faz numa
        // página cheia de artigo de lei. Não é recusa da imagem nem falta de cota — mandar para a
        // reserva paga não resolve, porque o pedido é que está sendo barrado. Refaz UMA vez com o
        // prompt condensado (reescrever em vez de copiar): salva o conteúdo, ao custo da
        // literalidade. Medido em 20/08/2026: 99 blocos travados só por isso, e a página ficava
        // pendente para sempre — a rodada seguinte tentava a mesma coisa e tomava o mesmo bloqueio.
        if (ehBloqueioDeConteudo(e) && tentativa === 0) {
          try {
            await respeitarRitmo();
            const texto = await chamar("gemini", "condensado");
            conta.gemini++;
            conta.condensadas = (conta.condensadas || 0) + 1;
            return { texto, via: "gemini-condensado" };
          } catch (e2) {
            console.warn("[figuras] condensado também barrado na pág.", pagina, e2 && e2.message);
          }
        }
        console.warn("[figuras] Gemini recusou a pág.", pagina, e && e.message);
        conta.recusadas++;
        break; // recusa de verdade (imagem/conteúdo) → vale a reserva
      }
    }
  }
  // Sem reserva (ou com ela desligada/no teto), a recusa de UMA página não pode derrubar a
  // rodada inteira: pula essa página — ela continua pendente — e segue para a próxima.
  // Orçamento da reserva é do LOTE INTEIRO (vem do chamador), não de cada material: com teto
  // por material, 14 apostilas dariam 14 × o teto de chamadas caras.
  if (!temReserva || orcamento.max <= 0 || orcamento.usadas >= orcamento.max) return { pular: true };
  try {
    const texto = await chamar("claude-cli");
    orcamento.usadas++;
    conta.reserva++;
    return { texto, via: "claude-cli" };
  } catch (e) {
    console.error("[figuras] reserva também falhou na pág.", pagina, e && e.message);
    return { pular: true };
  }
}

// Anexa descrições de figura ao material: acumula na lista e cola cada uma NA PÁGINA de origem
// (sobrevive ao recomputarTextoDoc e fica buscável junto do conteúdo daquela página).
function gravarFiguras(d, novas) {
  if (!novas || !novas.length) return;
  d.figuras = [...(d.figuras || []), ...novas];
  for (const f of novas) {
    if (!f.descricao) continue; // página conferida e sem figura: fica só o registro
    const pg = Array.isArray(d.paginas) ? d.paginas.find((p) => p.n === f.pagina) : null;
    if (pg && !(pg.texto || "").includes("[Figura descrita pela IA]")) {
      pg.texto = (pg.texto || "") + `\n\n[Figura descrita pela IA] ${f.descricao}`;
    }
  }
  recomputarTextoDoc(d);
  commit();
}

function recomputarTextoDoc(doc) {
  if (Array.isArray(doc.paginas) && doc.paginas.length) {
    doc.texto = doc.paginas.map((p) => p.texto || "").join("\n\n").trim();
  }
}

// Separa o BLOCO DE RESPOSTAS (gabarito, geralmente no fim da prova) do corpo das questões.
// Devolve { corpo, gab:{numeroQuestao -> letra} }. gab=null se não houver bloco reconhecível.
function separarGabarito(texto) {
  const re = /(gabarito\s+oficial|gabarito|folha de respostas|respostas?\b)/gi;
  let idx = -1, m;
  while ((m = re.exec(texto))) idx = m.index;
  if (idx < 0) return { corpo: texto, gab: null };
  const regiao = texto.slice(idx);
  const gab = {};
  const par = /\b(\d{1,3})\s*[:.\-)\]]?\s*(CERTO|ERRADO|VERDADEIRO|FALSO|[A-ECEVF])\b/gi;
  let r;
  while ((r = par.exec(regiao))) {
    const num = parseInt(r[1], 10);
    if (num >= 1 && num <= 400 && !(num in gab)) gab[num] = r[2].toUpperCase();
  }
  if (Object.keys(gab).length < 3) return { corpo: texto, gab: null };
  return { corpo: texto.slice(0, idx), gab };
}

// Divide o texto das questões em PEDAÇOS (≤ max chars), cortando só em INÍCIO de questão para não
// partir uma questão ao meio. Segurança: corta à força se um pedaço passar de 1,5× max.
function dividirTextoQuestoes(texto, max = 13000) {
  if ((texto || "").length <= max) return [texto];
  const linhas = texto.split(/\n/);
  const ehInicio = (l) => /^\s*(quest(ão|ao)\s*\d+|q\d{2,}|\(?\d{1,3}[).\-]\s)/i.test(l);
  const pedacos = [];
  let buf = "";
  for (const l of linhas) {
    if (buf.length >= max && ehInicio(l)) { pedacos.push(buf); buf = ""; }
    buf += (buf ? "\n" : "") + l;
    if (buf.length >= max * 1.5) { pedacos.push(buf); buf = ""; }
  }
  if (buf.trim()) pedacos.push(buf);
  return pedacos;
}

// F5: contexto de geração a partir de um material e, opcionalmente, de UM BLOCO da estrutura.
// Sem bloco → material inteiro. Com bloco → trecho daquelas páginas, tópico/banca do bloco e
// fonte enriquecida (bloco + páginas) — para gerar questões/flashcards/mapa "por conteúdo".
// Tópico PRINCIPAL de um material: o primário (topicoId) ou, se vazio, o 1º dos múltiplos
// (topicoIds). Assim questões/flashcards gerados ou extraídos do material já herdam o tópico
// dele mesmo quando o vínculo foi feito pelo editor multi-tópico ou pela estrutura.
function topicoDoDoc(doc) {
  return (doc && (doc.topicoId || (Array.isArray(doc.topicoIds) && doc.topicoIds[0]))) || null;
}
function ctxDeDoc(doc, bloco) {
  let texto = (doc.texto || "").trim();
  if (bloco) {
    if (bloco.textoOverride) texto = bloco.textoOverride;
    else if (Array.isArray(doc.paginas) && doc.paginas.length) {
      const t = doc.paginas.filter((p) => p.n >= bloco.pIni && p.n <= bloco.pFim).map((p) => p.texto || "").join("\n\n").trim();
      if (t) texto = t;
    }
  }
  const topicoId = (bloco && bloco.topicoId) || topicoDoDoc(doc);
  // O rótulo da FONTE viaja para longe da lista de Materiais (questão, flashcard, dossiê,
  // busca, chat) — e lá "Aula 01 - Apresentação do Curso" não diz de que matéria é.
  const rotDoc = rotuloDocumento(state, doc);
  const fonte = { tipo: "documento", id: doc.id, titulo: bloco ? `${rotDoc} · ${bloco.numero || ""} ${bloco.titulo}`.trim() : rotDoc };
  if (bloco) { fonte.bloco = bloco.numero || null; fonte.paginas = [bloco.pIni, bloco.pFim]; }
  const banca = bloco && bloco.banca ? bloco.banca : undefined;
  return { texto, topicoId, fonte, banca };
}

// ---------- busca semântica (helpers) ----------
function stripHTML(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}
// Assinatura simples de uma fonte (muda quando o conteúdo muda) → reindexa só o necessário.
function sigTexto(s) {
  return String(s || "").length;
}
// Quebra um texto em trechos de ~alvo caracteres, respeitando parágrafos.
function chunksDeTexto(texto, alvo = 900) {
  const paras = String(texto || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = "";
  for (const p of paras) {
    if (buf && buf.length + p.length > alvo) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
    while (buf.length > alvo * 1.8) {
      chunks.push(buf.slice(0, alvo));
      buf = buf.slice(alvo);
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter((c) => c.trim().length >= 20);
}
// Fontes longas que valem indexar: material (documentos) e resumos.
function fontesIndexaveis(state) {
  const out = [];
  for (const d of state.documentos || []) {
    out.push({ id: d.id, tipo: "material", titulo: rotuloDocumento(state, d), texto: d.texto || "", paginas: d.paginas, sig: sigTexto(d.texto) });
  }
  for (const r of state.resumos || []) {
    const t = stripHTML(r.conteudoHTML);
    out.push({ id: r.id, tipo: "resumo", titulo: r.titulo, texto: t, paginas: null, sig: sigTexto(t) });
  }
  // Lei Seca / Jurisprudência: o texto de cada artigo/súmula/tese vira fonte pesquisável no chat.
  for (const i of state.indicacoes || []) {
    const t = (i.texto || "").trim();
    if (t.length < 20) continue;
    out.push({ id: i.id, tipo: i.tipo === "juris" ? "juris" : "leiseca", titulo: `${i.referencia}${i.tribunal ? " (" + i.tribunal + ")" : ""}`, texto: t, paginas: null, sig: sigTexto(t) });
  }
  return out.filter((f) => f.texto.trim().length >= 20);
}
// Trechos (com página, quando houver) de uma fonte.
function chunksDaFonte(f) {
  if (f.tipo === "material" && Array.isArray(f.paginas) && f.paginas.length) {
    const out = [];
    for (const p of f.paginas) {
      for (const c of chunksDeTexto(p.texto)) out.push({ texto: c, pagina: p.n });
    }
    if (out.length) return out;
  }
  return chunksDeTexto(f.texto).map((c) => ({ texto: c, pagina: null }));
}
function cosseno(a, b) {
  let d = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}
function origemDoItem(it) {
  const tipo = it.tipo === "resumo" ? "Resumo" : it.tipo === "leiseca" ? "Lei Seca" : it.tipo === "juris" ? "Jurisprudência" : "Material";
  return `${tipo}: ${it.titulo}${it.pagina ? ` (pág. ${it.pagina})` : ""}`;
}

// Achata a árvore de um mapa mental em texto-esboço (para gerar flashcards/questões dele).
function mapaParaTexto(arv, nivel = 0) {
  if (!arv) return "";
  let s = nivel === 0 && arv.titulo ? arv.titulo + "\n" : "";
  for (const r of arv.ramos || []) {
    s += "  ".repeat(nivel + 1) + "- " + (r.titulo || "") + "\n";
    s += mapaParaTexto({ ramos: r.ramos }, nivel + 1);
  }
  return s;
}

// Nome legível "Disciplina · Tópico" para dar contexto à IA (melhora a geração).
// Piso de casamento conforme o TAMANHO do tema, usado ao ler estatística de incidência de um
// material. A nota do casador é interseção/menor conjunto, e os itens do edital são enumerações
// longas ("(8) Normas Constitucionais: Hermenêutica e Filosofia…"): com tema de uma ou duas
// palavras, UMA palavra em comum já dá 0,5 e passaria no piso normal de 0,34 — foi assim que
// "Organização dos Poderes" caiu dentro de "Normas Constitucionais". Tema curto, então, só casa
// se o tópico contiver TODAS as suas palavras (nota 1).
const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "em", "no", "na", "ao", "para", "com", "seus", "suas", "sua", "seu"]);
// Tema que CITA UMA LEI ("Lei nº 12.850/13 – Crime Organizado") tem identidade própria: o número.
// Casar por palavra aqui é desastre — "lei", "nº" e pedaços de número são comuns a metade do
// edital, e foi assim que o Estatuto do Desarmamento caiu em "Pessoas naturais · Direitos da
// personalidade" e a Lei Carolina Dieckmann (12.737) em "Crimes eleitorais (Lei nº 4.737)".
// Havendo número, só casa com o tópico que cita O MESMO número; não achando, não casa.
const RX_NUM_LEI = /\b(\d{1,2}\.\d{3})(?:[/-]\d{2,4})?\b/;
function topicoPorNumeroDeLei(tema, topicos) {
  const m = String(tema || "").match(RX_NUM_LEI);
  if (!m) return undefined; // undefined = "não é citação de lei"; null = "é, mas não achei"
  const alvo = m[1];
  const achados = topicos.filter((t) => [t.nome, ...(t.aliases || [])].some((n) => String(n).includes(alvo)));
  return achados.length ? { topicoId: achados[0].id, nota: 1, porNumeroDeLei: true } : null;
}

function pisoDeTema(tema) {
  const n = String(tema || "")
    .toLowerCase()
    .split(/[^a-zà-ú]+/)
    .filter((w) => w.length > 2 && !PALAVRAS_VAZIAS.has(w)).length;
  return n <= 2 ? 1 : 0.5;
}

function nomeContexto(st, topicoId) {
  if (!topicoId) return "geral";
  const t = st.topicos.find((x) => x.id === topicoId);
  if (!t) return "geral";
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}

// Monta os campos de enriquecimento (banca, cargo, tópico, dificuldade) que as
// gerações por IA (gerarQuestoes/gerarQuestoesCE/gerarFlashcards) aceitam. Banca e
// cargo saem do concurso ativo (state.concurso). topicoId → nome do tópico p/ foco.
// dificuldade default "medio". Tudo opcional; o provedor ignora o que vier vazio.
function iaExtras(st, { topicoId, topico, dificuldade } = {}) {
  const c = st.concurso || {};
  let nomeTopico = topico;
  if (!nomeTopico && topicoId) {
    const t = st.topicos.find((x) => x.id === topicoId);
    if (t) nomeTopico = t.nome;
  }
  return {
    banca: c.banca || "",
    cargo: c.cargo || "",
    topico: nomeTopico || "",
    dificuldade: dificuldade || "medio",
  };
}

// ---- Importar LEI/JURISPRUDÊNCIA em TEXTO CORRIDO (não é lista) → fatiar em unidades ----
// (C1 lei → artigos; C2 juris → súmulas/teses). Determinístico; o informativo em prosa,
// sem marcadores claros, cai no fallback de IA (estruturarLeiSeca).

// Detecta o nome curto da norma no cabeçalho (para compor a referência: "Art. 1º, Lei 8.112/1990").
function detectarNomeLei(texto) {
  const h = String(texto || "").slice(0, 1200);
  if (/constitui[çc][aã]o\s+federal|constitui[çc][aã]o\s+da\s+rep[úu]blica/i.test(h)) return "CF";
  if (/c[óo]digo\s+de\s+processo\s+penal/i.test(h)) return "CPP";
  if (/c[óo]digo\s+de\s+processo\s+civil/i.test(h)) return "CPC";
  if (/c[óo]digo\s+penal/i.test(h)) return "CP";
  if (/c[óo]digo\s+civil/i.test(h)) return "CC";
  if (/c[óo]digo\s+tribut[áa]rio/i.test(h)) return "CTN";
  if (/consolida[çc][aã]o\s+das\s+leis\s+do\s+trabalho|\bCLT\b/i.test(h)) return "CLT";
  const m = h.match(/lei\s+(?:complementar\s+)?n[ºo°.]*\s*([\d.]+)(?:[^\n]*?\bde\b[^\n]*?(\d{4}))?/i);
  if (m) return `Lei ${m[1]}${m[2] ? `/${m[2]}` : ""}`;
  return null;
}
// Normaliza o rótulo do artigo: "Artigo 1o" / "art 1" → "Art. 1º".
function normalizarArt(label) {
  const m = String(label || "").match(/(\d+)\s*([ºo°]?)\s*(-?\s*[A-Z])?/i);
  if (!m) return String(label || "").trim();
  const letra = m[3] ? "-" + m[3].replace(/[-\s]/g, "").toUpperCase() : "";
  const ord = m[1] === "1" || m[1] === "2" || m[1] === "3" || m[1] === "4" || m[1] === "5" || m[1] === "6" || m[1] === "7" || m[1] === "8" || m[1] === "9" ? "º" : (m[2] ? "º" : "");
  return `Art. ${m[1]}${ord}${letra}`;
}
// Divide um texto por marcadores (regex com 1 grupo = rótulo), devolvendo [{label, texto}].
function dividirPorMarcador(texto, re) {
  const t = String(texto || "").replace(/\r/g, "");
  const marks = [];
  let m;
  while ((m = re.exec(t))) {
    const label = m[1];
    marks.push({ idx: m.index + m[0].indexOf(label), label });
  }
  const out = [];
  for (let i = 0; i < marks.length; i++) {
    const ini = marks[i].idx;
    const fim = i + 1 < marks.length ? marks[i + 1].idx : t.length;
    const bloco = t.slice(ini, fim).replace(/\s+\n/g, "\n").trim();
    if (bloco) out.push({ label: marks[i].label, texto: bloco });
  }
  return out;
}
// C1: lei em texto corrido → um item por artigo (texto = corpo com §/incisos/alíneas).
function fatiarLeiEmArtigos(texto) {
  const re = /(?:^|\n)\s*(Art(?:igo)?\.?\s*\d+\s*[ºo°]?(?:\s*[-.]\s*[A-Z])?)/gi;
  const partes = dividirPorMarcador(texto, re);
  if (partes.length < 2) return [];
  const lei = detectarNomeLei(texto);
  return partes.map((p) => ({
    referencia: normalizarArt(p.label) + (lei ? `, ${lei}` : ""),
    texto: p.texto,
    observacao: "",
    tribunal: null,
    categoria: null,
  }));
}
// C2: jurisprudência em texto corrido → um item por súmula/tema/enunciado (com tribunal/categoria).
function fatiarJurisEmUnidades(texto) {
  const re = /(?:^|\n)\s*((?:S[úu]mula(?:\s+Vinculante)?|Tema(?:\s+Repetitivo)?|Enunciado|OJ)\s*(?:n[ºo°.]*\s*)?\d+)/gi;
  const partes = dividirPorMarcador(texto, re);
  if (partes.length < 2) return [];
  return partes.map((p) => {
    const ref = p.label.replace(/\s+/g, " ").trim();
    let tribunal = null;
    const mt = p.texto.match(/\b(STF|STJ|TST|TSE|STM|TJ[A-Z]{2}|TRF-?\s?\d|TRT-?\s?\d+)\b/i);
    if (mt) tribunal = mt[1].toUpperCase().replace(/[\s-]/g, "");
    else if (/s[úu]mula\s+vinculante/i.test(ref)) tribunal = "STF"; // SV é sempre do STF
    let categoria = null;
    if (/^s[úu]mula\s+vinculante/i.test(ref)) categoria = "Súmula Vinculante"; // SV do STF (vinculante)
    else if (/^s[úu]mula/i.test(ref)) categoria = "Súmula";
    else if (/^tema/i.test(ref)) categoria = "Tema repetitivo";
    else if (/^enunciado/i.test(ref)) categoria = "Enunciado"; // jornadas CJF/FONAJE/súmulas administrativas
    else if (/^oj/i.test(ref)) categoria = "Precedente obrigatório"; // orientação jurisprudencial (TST)
    return { referencia: ref, texto: p.texto, observacao: "", tribunal, categoria };
  });
}
// Seleciona palavras-chave para LACUNA (cloze) na letra: números/prazos, quóruns, verbos de
// comando e termos restritivos; pula o nº do próprio dispositivo/enunciado. → [{idx,len,palavra}].
function selecionarLacunas(texto, max = 4) {
  const t = String(texto || "");
  if (t.length < 20) return [];
  const padroes = [
    /\b\d+(?:\.\d+)?\s*%?\b/g, // números, prazos, percentuais (alta prioridade)
    /\b(?:dois\s+ter[çc]os|tr[êe]s\s+quintos|maioria\s+absoluta|maioria\s+simples|unanimidade)\b/gi, // quóruns
    /\b(?:pode|poder[áa]|deve|dever[áa]|vedad[ao]|proibid[ao]|permitid[ao]|obrigat[óo]ri[ao]|facultad[ao])\b/gi, // verbos de comando
    /\b(?:somente|salvo|exceto|independentemente|ressalvad[ao]s?)\b/gi, // restritivos
  ];
  const ocup = [];
  const alvos = [];
  for (const re of padroes) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t))) {
      const ini = m.index, fim = ini + m[0].length;
      if (ocup.some((o) => ini < o.fim && fim > o.ini)) continue;
      if (/\b(?:art(?:igo)?|s[úu]mula(?:\s+vinculante)?|tema|enunciado|oj)\.?\s*$/i.test(t.slice(Math.max(0, ini - 20), ini))) continue;
      ocup.push({ ini, fim });
      alvos.push({ idx: ini, len: m[0].length, palavra: m[0] });
    }
  }
  alvos.sort((a, b) => a.idx - b.idx);
  return alvos.slice(0, max);
}
// Médio (expressões): parte das palavras-chave e COMPLETA com termos de conteúdo (>=6 letras,
// não-conectivos) até a cota — deixa a lacuna mais densa que o "fácil" sem virar digitação.
function lacunasExpressoes(texto, max = 9) {
  const t = String(texto || "");
  const base = selecionarLacunas(t, max);
  if (base.length >= max) return base;
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const stop = new Set(["quando", "porque", "tambem", "atraves", "conforme", "mediante", "enquanto", "respectivamente", "seguinte", "seguintes", "referido", "referida", "referidos", "presente", "qualquer", "aqueles", "aquelas", "mesmos", "mesmas", "conforme", "durante", "entretanto", "portanto", "todavia"]);
  const ocup = base.map((b) => ({ ini: b.idx, fim: b.idx + b.len }));
  const extra = [];
  const re = /\b[A-Za-zÀ-ÿ]{6,}\b/g;
  let m;
  while ((m = re.exec(t)) && base.length + extra.length < max) {
    const ini = m.index, fim = ini + m[0].length;
    if (stop.has(norm(m[0]))) continue;
    if (ocup.some((o) => ini < o.fim && fim > o.ini)) continue;
    if (/\b(?:art(?:igo)?|s[úu]mula|tema|inciso|al[íi]nea)\.?\s*$/i.test(t.slice(Math.max(0, ini - 18), ini))) continue;
    ocup.push({ ini, fim });
    extra.push({ idx: ini, len: m[0].length, palavra: m[0] });
  }
  return base.concat(extra).sort((a, b) => a.idx - b.idx);
}
// Difícil (frases): tampa CLÁUSULAS inteiras (segmentos entre ; : .) alternadamente — o usuário
// recorda trechos longos, não só palavras. Deixa a 1ª cláusula à mostra como âncora de contexto.
function lacunasFrases(texto) {
  const t = String(texto || "");
  const out = [];
  const re = /[^;:.\n]+[;:.]?/g;
  let m, k = 0;
  while ((m = re.exec(t))) {
    const raw = m[0];
    const trimmed = raw.trim();
    if (trimmed.length < 20) continue;
    k++;
    if (k % 2 === 0) {
      const lead = raw.length - raw.replace(/^\s+/, "").length;
      out.push({ idx: m.index + lead, len: trimmed.length, palavra: trimmed });
    }
  }
  return out;
}
// Extrai a NORMA da referência (último segmento não-posicional): "art. 37, caput, CF" → "CF".
function normaDaReferencia(ref) {
  const segs = String(ref || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (let k = segs.length - 1; k >= 0; k--) {
    const s = segs[k];
    // O ÚLTIMO segmento é sempre a norma — não aplicar o skip de inciso/romano nele ("CDC"/"CC" são
    // só letras romanas e seriam descartados como inciso, jogando a lei em "Outros").
    if (k < segs.length - 1 && /^(caput|§|par[áa]grafo(\s*[úu]nico)?|inc\.?|inciso|al[íi]nea|[ivxlcdm]+|[a-z])$/i.test(s)) continue;
    if (/^art/i.test(s)) continue;
    return s;
  }
  return null;
}
// TAG TEMÁTICA por artigo (sub-projeto): temas comuns em provas de concurso, detectados por texto.
// Offline/instantâneo (heurística robusta); a IA pode refinar/adicionar temas depois. Destrava o
// "Memorizar temático" (estudar só um tema) e a "inteligência" (você erra sempre em X → recomenda).
// Regras ajustadas para serem DISCRIMINATIVAS: um tema deve marcar o artigo QUE TRATA do assunto,
// não todo artigo que só menciona a palavra (ex.: "pena"/"multa" aparecem em quase todo crime do CP;
// por isso "Pena" e "Valores e multas" exigem o CONCEITO — dosimetria, regime, dias-multa…).
const TEMAS_REGRAS = [
  { tema: "Prazo", re: /\b\d+\s*(dias?|meses|m[êe]s|anos?|horas?)\b|\bprazo\b|decurso do tempo|decad[êe]ncia do prazo/i },
  { tema: "Competência", re: /compet[êe]ncia|\bcompete\b|\bforo\b|jurisdi[çc]|atribui[çc][ãa]o privativa|privativamente/i },
  { tema: "Quórum", re: /qu[óo]rum|maioria (?:absoluta|simples|qualificada|dos)|dois ter[çc]os|tr[êe]s quintos|unanimidade/i },
  { tema: "Dosimetria da pena", re: /dosimetria|circunst[âa]ncia[s]?\s+(?:agravante|atenuante|judiciai)|\bagravante[s]?\b|\batenuante[s]?\b|fixa[çc][ãa]o da pena|regime\s+(?:inicial|fechado|semiaberto|aberto|de cumprimento)|livramento condicional|substitui[çc][ãa]o da pena|pena[s]?\s+restritiva|concurso\s+(?:material|formal)|continuidade delitiva|causa[s]? de aumento|causa[s]? de diminui[çc]/i },
  { tema: "Multa e valores", re: /R\$|dias?[ -]multa|percentual|\bpor cento\b|%|sal[áa]rio[ -]m[íi]nimo|indeniza[çc]|valor da causa/i },
  { tema: "Prescrição e decadência", re: /prescri[çc]|decad[êe]nc/i },
  { tema: "Vedações", re: /\b[ée]\s+vedad|\bvedad[ao]s?\b|\bproib[ií]|\bdefes[oa]\b|n[ãa]o\s+(?:poder[áa]|ser[áa] admitid|se admite)/i },
  { tema: "Direitos e garantias", re: /direitos?\s+(?:e garantias|fundamentai|individuai|sociai|humanos)|inviol[áa]vel|livre exerc[íi]cio|[ée]\s+assegurad|[ée]\s+garantid|liberdade de/i },
  { tema: "Requisitos e condições", re: /requisito|somente\s+(?:se|quando)|desde que|depende de|exige-se|preencher os|condi[çc][õo]es? para/i },
  { tema: "Procedimento e recursos", re: /procedimento|\brito\b|\brecurso[s]?\b|\bprocesso\b|dilig[êe]ncia|intima[çc]|cita[çc]/i },
  { tema: "Princípios", re: /princ[íi]pio|dignidade da pessoa|isonomia|legalidade|moralidade|efici[êe]ncia administrativa|proporcionalidade|anterioridade/i },
];
function classificarTemasTexto(texto) {
  const t = String(texto || "");
  const out = [];
  for (const r of TEMAS_REGRAS) if (r.re.test(t)) out.push(r.tema);
  return out;
}
// Normaliza o texto de um dispositivo para comparação de NOVIDADE LEGISLATIVA: minúsculas, sem
// acentos, só letras/números/espaços, espaços colapsados. Assim, ruído de parser/formatação
// (pontuação, maiúsculas, espaços duplos) NÃO vira falso positivo de "mudou".
function normalizarTextoLei(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// Hash determinístico (djb2) do texto normalizado — identidade do conteúdo do artigo.
function hashLei(s) {
  const t = normalizarTextoLei(s);
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
// Detecta o ANO de um julgado/enunciado só quando há sinal CLARO de data (evita pegar número
// solto): "de 2018", "em 2018", "j. 2018", "(2018)", "/2018". Faixa 1988 (CF) → ano corrente+1.
function detectarAnoJuris(s) {
  // Sinais de data: "de 2018", "em 2018", "j. 2018", "julgado em 2018", "(2018)", "/2018".
  const m = String(s || "").match(/(?:\bde\b|\bem\b|\bjulg\w*\b(?:\s+em)?|\bj\.?|\(|\/)\s*((?:19|20)\d{2})\b/i);
  const y = m ? +m[1] : null;
  const atual = +todayISO().slice(0, 4);
  return y && y >= 1988 && y <= atual + 1 ? y : null;
}
// Detecta CANCELAMENTO/SUPERAÇÃO anotado no texto de uma jurisprudência (conservador, só marcadores
// claros): "(cancelada)", "(superada)", "súmula cancelada", "cancelada em…", "superada pelo Tema…".
function detectarCanceladaJuris(s) {
  const t = String(s || "").slice(0, 300);
  return /\((?:\s*)(?:cancelad|superad|revogad)[ao]\b|\bs[úu]mula\s+cancelad[ao]\b|\b(?:cancelad|superad)a\s+(?:em|pel[ao])\b/i.test(t);
}
// F1 — CHAVE DE IDENTIDADE de um julgado (dedup entre fontes: STJ, STF, DOD do MESMO caso).
// Prioridade: nº do processo/recurso > nº do Tema > nº da Súmula > referência normalizada.
// Ex.: STJ·REsp 2.072.985/DF; STJ·TEMA1357; STF·SV49. "" quando não dá para identificar.
function chaveIndic(it) {
  const trib = String((it && it.tribunal) || "").toUpperCase().replace(/[^A-Z]/g, "");
  const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const ref = norm(it && it.referencia);
  const proc = norm(it && it.processo);
  const tema = it && it.tema ? "TEMA" + norm(it.tema) : "";
  const mSum = ref.match(/(SUMULAVINCULANTE|SUMULA|SV)0*(\d+)/);
  const sum = mSum ? (mSum[1] === "SV" || mSum[1] === "SUMULAVINCULANTE" ? "SV" : "SUM") + mSum[2] : "";
  const core = proc || tema || sum || ref;
  if (!core) return "";
  // Referência genérica SEM número (ex.: "Julgado STJ", "Tese") não identifica um julgado específico —
  // deduplicar por ela colidiria julgados distintos (o 2º seria absorvido/perdido). Não deduplica.
  if (!proc && !tema && !sum && !/\d/.test(ref)) return "";
  return `${trib}|${core}`;
}
// F1 — o texto colado/extraído é um INFORMATIVO de jurisprudência (STF/STJ)? Se sim, roteamos para
// a extração RICA (extrairTesesInformativo), em vez do fatiador cru de súmulas/teses.
function pareceInformativo(texto) {
  const t = String(texto || "").slice(0, 6000);
  if (/informativo[^\n]{0,30}\bn[º.]?\s*\d{2,4}\b/i.test(t)) return true; // "Informativo nº 894" (nº perto da palavra, não em qualquer lugar)
  if (/jurisprud[êe]ncia\s+em\s+teses/i.test(t)) return true; // F4 — Jurisprudência em Teses (STJ)
  if (/\bRAMO\s+DO\s+DIREITO\b/i.test(t) && /\bDESTAQUE\b|\bPROCESSO\b/i.test(t)) return true; // STJ rotulado
  if ((t.match(/\bResumo:/gi) || []).length >= 2) return true; // STF (vários "Resumo:")
  return false;
}
// F1 — PARSER DETERMINÍSTICO do informativo STJ (campos rotulados PROCESSO / RAMO DO DIREITO / TEMA /
// DESTAQUE). Extrai os julgados SEM IA (economiza cota). Devolve itens ricos ou null (→ cai na IA).
function parseInformativoDeterministico(texto) {
  const t = String(texto || "").replace(/\r/g, "");
  if (!/\bRAMO\s+DO\s+DIREITO\b/i.test(t) || !/\bDESTAQUE\b/i.test(t)) return null; // só STJ rotulado
  const norm = (s) => String(s || "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  const mInf = t.match(/Informativo[^\n]*?n\.?\s*(\d+)/i);
  const nInformativo = mInf ? mInf[1] : null;
  const mData = t.match(/n\.?\s*\d+\s*[-–]\s*(\d{1,2}\s+de\s+[a-zç]+\s+de\s+\d{4})/i);
  const dataDivulgacao = mData ? mData[1] : null;
  const partes = t.split(/\n[ \t]*PROCESSO\b[ \t]*\n?/i); // cada julgado começa após o rótulo "PROCESSO" (tolera valor na mesma linha)
  const itens = [];
  for (let i = 1; i < partes.length; i++) {
    const bloco = partes[i];
    // Tolerante: o valor pode vir na linha do rótulo OU na seguinte; o terminador não exige linha isolada.
    const seg = (a, b) => { const m = bloco.match(new RegExp(a + "\\b[ \\t]*\\n?[ \\t]*([\\s\\S]*?)(?=\\n\\s*(?:" + b + ")\\b|$)", "i")); return m ? norm(m[1]) : ""; };
    const iRamo = bloco.search(/\n\s*RAMO\s+DO\s+DIREITO\s*\n/i);
    const procRaw = iRamo > 0 ? bloco.slice(0, iRamo) : bloco.slice(0, 800);
    const ramo = seg("RAMO\\s+DO\\s+DIREITO", "TEMA");
    const temaTxt = seg("TEMA", "DESTAQUE");
    const destaque = seg("DESTAQUE", "INFORMA[ÇC][ÕO]ES\\s+DO\\s+INTEIRO\\s+TEOR|LEGISLA[ÇC][ÃA]O|SA[ÍI]BA\\s+MAIS|VEJA\\s+TAMB[ÉE]M|PROCESSO");
    const tese = destaque || temaTxt;
    if (!tese || tese.length < 15) continue;
    // Recurso + número (+ /UF opcional). Não cruza \n nem engole letras seguintes (ex.: "Rel."), senão a
    // chave de dedup diverge entre fontes. Inclui AREsp/EAREsp/EDcl/Rcl… (comuns no STJ) — antes faltavam.
    const mProc = procRaw.match(/\b((?:EAREsp|AREsp|EREsp|REsp|AgRg|AgInt|EDcl|RHC|RMS|ADPF|ADC|ADO|ADI|IAC|Rcl|SLS|HC|MS|CC|Pet|AR|SS|QO|RE)\s*\d[\d.]*(?:[\/\-][A-Z]{2})?)/i);
    const processo = mProc ? norm(mProc[1]).replace(/[.,]$/, "") : "";
    const mOrgao = procRaw.match(/\b(Corte Especial|Primeira Se[çc][ãa]o|Segunda Se[çc][ãa]o|Terceira Se[çc][ãa]o|Primeira Turma|Segunda Turma|Terceira Turma|Quarta Turma|Quinta Turma|Sexta Turma|Plen[áa]rio)\b/i);
    const orgao = mOrgao ? norm(mOrgao[1]) : "";
    const mDataJ = procRaw.match(/julgad[oa]\s+em\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    const dataJulgamento = mDataJ ? mDataJ[1] : "";
    const mTema = (procRaw + " " + temaTxt).match(/Tema\s+(\d+)/i);
    const tema = mTema ? mTema[1] : "";
    const ref = tema ? `Tema ${tema} STJ` : (processo ? `${processo} STJ` : "Julgado STJ");
    itens.push({
      referencia: ref, texto: tese, observacao: "", tribunal: "STJ",
      orgao, ramo: ramo || null, assunto: (temaTxt.split(/\.\s/)[0] || "").slice(0, 90) || null,
      processo: processo || null, tema: tema || null, dataJulgamento: dataJulgamento || null,
      categoria: tema ? "Tema repetitivo" : "Tese", status: "vigente",
      nInformativo, dataDivulgacao,
    });
  }
  return itens.length ? itens : null;
}
// Heurística: o texto é uma NORMA/COLETÂNEA corrida (não uma lista de referências)?
// ≥2 marcadores, sem separador de lista "|", e com corpo (média de chars por unidade > 60).
function pareceTextoCorrido(texto, tipo) {
  const t = String(texto || "");
  if (/\|/.test(t)) return false; // usuário usou separador de lista explícito
  const re = tipo === "juris" ? /(?:^|\n)\s*(?:s[úu]mula|tema|enunciado|oj)\b/gi : /(?:^|\n)\s*art(?:igo)?\.?\s*\d/gi;
  const n = (t.match(re) || []).length;
  if (n < 2) return false;
  return t.length / n > 60;
}

// Extrai um tempo escrito no próprio texto da tarefa: "(50 min)", "50 min", "1h", "1h30".
// Devolve { titulo (sem o trecho de tempo), estimMin (number) | null }.
function extrairTempoDoTitulo(titulo) {
  const t0 = String(titulo || "").trim();
  // 1h, 1h30, 1 h 30 (horas[+min])
  let m = t0.match(/\(?\s*(\d{1,2})\s*h(?:\s*(\d{1,2}))?\s*(?:min)?\.?\s*\)?\s*$/i);
  if (m) {
    const min = (parseInt(m[1], 10) || 0) * 60 + (m[2] ? parseInt(m[2], 10) || 0 : 0);
    return { titulo: limparFim(t0.slice(0, m.index)), estimMin: min };
  }
  // 50 min, (40 min), 90min
  m = t0.match(/\(?\s*(\d{1,4})\s*min\.?\s*\)?\s*$/i);
  if (m) return { titulo: limparFim(t0.slice(0, m.index)), estimMin: Math.max(0, parseInt(m[1], 10) || 0) };
  return { titulo: t0, estimMin: null };
}
function limparFim(s) {
  return String(s).replace(/[—\-–:;,\s]+$/, "").trim();
}
// Remove marcador de lista do INÍCIO do título (•, -, *, –, ▪, ●, "1.", "1)", "a)") caso
// a IA o tenha preservado. Bullet é opcional na entrada; nunca deve sobrar no título.
function tirarMarcadorLista(s) {
  return String(s || "").replace(/^[\s]*[•·▪●◦*\-–—]+\s*/, "").replace(/^\s*\d{1,2}[.)]\s+/, "").trim();
}
// Separador EXPLÍCITO de observação ao digitar: tudo após "//" na linha é a observação
// daquela tarefa (ex.: "Ler Lei 8.112 // focar arts. 116 e 117"). Determinístico, fácil de
// teclar e independe da IA. Devolve { titulo, observacao }.
function separarObservacao(linha) {
  const s = String(linha || "");
  const i = s.indexOf("//");
  if (i < 0) return { titulo: s.trim(), observacao: "" };
  return { titulo: s.slice(0, i).trim(), observacao: s.slice(i + 2).trim() };
}

// ---------------------------------------------------------------------------
// MULTI-PERFIL — Fase 0a: os dados de ESTUDO passam a morar dentro de perfis[].
//
// Um perfil = um concurso (o `concurso` já embute cargo+banca) com todo o pacote de
// estudo dele. O `config` continua GLOBAL nesta fase — dividir o config mexe no
// `setConfig`, que reatribui por spread e destruiria os acessores abaixo (fase 0b).
//
// Como o resto do arquivo (505 acessos a `state.<coleção>`) continua funcionando sem
// reescrita: instalamos acessores NÃO-ENUMERÁVEIS em `state` que roteiam para o perfil
// ativo. Não sendo enumeráveis, `JSON.stringify(state)` os ignora — o que é salvo é o
// formato novo, limpo, com as coleções só dentro de `perfis[]`.
// ---------------------------------------------------------------------------

// O que fica no TOPO. Todo o resto pertence ao perfil — é uma REGRA, não uma lista de
// coleções, então chaves criadas depois (por backfill ou por telas novas) caem no perfil
// sozinhas, sem ninguém precisar lembrar de declará-las aqui.
const GLOBAL_TOP = new Set([
  "meta", "config", "bancas", "lembretes", "indicacoes", "modificadoEm", "perfis", "perfilAtivo",
]);

// Fase 0b: o que do CONFIG pertence ao concurso, e não ao aparelho/pessoa.
// Fica global o que segue você em qualquer concurso (tema, IA, notificações, pomodoro,
// leitura, paleta, navegação, disponibilidade de vida — diasFolga/diasFeriado —, apelidos
// de leis, backup por arquivo). Vem para cá o que muda quando o concurso muda.
const CONFIG_PERFIL = new Set([
  "dataProva",
  // dispDiariaMin é ESPELHO de metaDiariaMin (screens/config.js: patch.dispDiariaMin =
  // patch.metaDiariaMin). O plano o listava como global ("disponibilidade de vida"), mas
  // deixá-lo global faria a disponibilidade de um perfil valer para o outro até o próximo
  // salvamento. Anda com a meta.
  "metaDiariaMin", "metaSemanalMin", "metaMensalMin", "dispDiariaMin",
  "metasLeitura", "ultimaLeitura", // meta e progresso de leitura (o "leitura", que é fonte/tamanho, fica global)
  "niveisDisciplina", "disciplinasAdiadas", "atencaoAdiada",
  "bancasPreferidas", "baseEstudo", "retaFinal",
  "cursosTransversais", // cursos do cursinho que cobrem várias matérias DESTE edital
  "atalhos", // apontam para disciplina/tópico/dossiê DESTE concurso
  // mentorPlanoVisto é comparado com mentorUltimaAnalise para dizer "há plano novo".
  // Separar as duas faria o carimbo de um perfil ser comparado com o "visto" do outro.
  "mentorPlano", "mentorUltimaAnalise", "mentorPlanoVisto",
  // syncNuvem NÃO entra aqui: o cofre é da CONTA, não do concurso — uma senha só, e o
  // aparelho onde ela for digitada recebe todos os concursos.
]);

function nomeDoPerfil(st) {
  const c = st && st.concurso;
  if (!c) return "Meu concurso";
  return [c.cargo, c.orgao || c.banca].filter(Boolean).join(" · ") || c.nome || "Meu concurso";
}

// Converte o formato plano (coleções no topo) no formato multi-perfil. Idempotente:
// estado que já tem perfis volta inalterado. Roda também sobre backup/nuvem importados.
function migrarParaPerfis(st) {
  if (!st || typeof st !== "object") return st;
  // Já tem perfis: as coleções não precisam migrar, mas o CONFIG sim — um estado salvo
  // por uma versão anterior (0a, ou 0b com a lista menor) ainda guarda chaves de perfil
  // no config global. Sem esta passagem elas ficariam órfãs.
  if (Array.isArray(st.perfis) && st.perfis.length) return normalizarSyncNuvemGlobal(migrarConfigDoPerfil(st));
  // Nome só quando JÁ existe concurso; senão fica vazio para `perfis()` derivar de
  // nomeDoPerfil() depois. Gravar aqui num estado ainda sem concurso (reset/1ª abertura)
  // congelava o literal "Meu concurso" no perfil, e o seletor passava a exibi-lo para
  // sempre — enquanto a topbar mostrava o cargo digitado no onboarding. Dois nomes para a
  // mesma coisa, lado a lado.
  const perfil = { id: uid("perf"), nome: st && st.concurso ? nomeDoPerfil(st) : "" };
  const topo = {};
  for (const [k, v] of Object.entries(st)) {
    if (k === "perfis" || k === "perfilAtivo") continue; // lixo de migração pela metade
    (GLOBAL_TOP.has(k) ? topo : perfil)[k] = v;
  }
  topo.perfis = [perfil];
  topo.perfilAtivo = perfil.id;
  return normalizarSyncNuvemGlobal(migrarConfigDoPerfil(topo));
}

// A senha/cofre chegou a ser guardada POR PERFIL numa versão intermediária. Como o cofre
// passou a ser da conta, ela volta para o config global — senão o aparelho perderia a
// conexão ao trocar de concurso.
function normalizarSyncNuvemGlobal(st) {
  if (!st || !Array.isArray(st.perfis)) return st;
  for (const p of st.perfis) {
    if (p.config && p.config.syncNuvem) {
      if (!st.config) st.config = {};
      if (!st.config.syncNuvem) st.config.syncNuvem = p.config.syncNuvem;
      delete p.config.syncNuvem;
    }
  }
  return st;
}

// Fase 0b: tira do config global as chaves que são do concurso e as guarda em
// perfil.config. Idempotente — o que já saiu do config global não volta a ser procurado.
// Só o perfil ATIVO herda o config de antes; perfil criado depois nasce do default.
function migrarConfigDoPerfil(st) {
  const ps = st && st.perfis;
  if (!Array.isArray(ps) || !ps.length) return st;
  for (const p of ps) if (!p.config || typeof p.config !== "object") p.config = {};
  const ativo = ps.find((p) => p.id === st.perfilAtivo) || ps[0];
  const cfg = st.config || {};
  for (const k of CONFIG_PERFIL) {
    if (k in cfg) {
      if (!(k in ativo.config)) ativo.config[k] = cfg[k];
      delete cfg[k];
    }
  }
  return st;
}

function perfilAtivo() {
  const ps = state.perfis;
  if (!Array.isArray(ps) || !ps.length) return null;
  return ps.find((p) => p.id === state.perfilAtivo) || ps[0];
}

// Instala/reinstala os acessores do perfil ativo. Chamar depois de QUALQUER troca do
// objeto `state` (init, importarBackup, resetTudo) ou do perfil ativo — sem isso o
// `state.disciplinas` do resto do arquivo devolve undefined.
function definirAcessor(chave) {
  Object.defineProperty(state, chave, {
    get() {
      const alvo = perfilAtivo();
      return alvo ? alvo[chave] : undefined;
    },
    set(v) {
      const alvo = perfilAtivo();
      if (alvo) alvo[chave] = v;
    },
    enumerable: false, // <- é isto que mantém a serialização no formato novo
    configurable: true,
  });
}

function instalarAcessores() {
  const p = perfilAtivo();
  if (!p) return;
  for (const chave of Object.keys(p)) {
    if (chave === "id" || chave === "nome") continue;
    if (GLOBAL_TOP.has(chave)) continue; // nunca sombrear config/meta/… (config é tratado abaixo)
    definirAcessor(chave);
  }
  instalarAcessoresConfig();
}

// Os mesmos acessores, um nível abaixo: `state.config.dataProva` roteia para o config do
// perfil ativo, enquanto `state.config.tema` continua sendo o global de verdade.
// Instalados pela LISTA (não pelas chaves presentes) para que uma chave que ainda não
// existe — mentorPlano nasce só quando o Mentor gera um plano — já nasça no perfil certo.
function instalarAcessoresConfig() {
  const p = perfilAtivo();
  if (!p || !state.config) return;
  if (!p.config || typeof p.config !== "object") p.config = {};
  for (const chave of CONFIG_PERFIL) {
    // Um valor CRU no config global sombrearia o acessor, então tem de sair — mas
    // salvando-o no perfil antes. Apagar direto perderia o dado de quem chegasse aqui
    // com a chave ainda no global (estado salvo por uma versão anterior).
    const d = Object.getOwnPropertyDescriptor(state.config, chave);
    if (d && !d.get) {
      if (p.config[chave] === undefined) p.config[chave] = state.config[chave];
      delete state.config[chave];
    }
    Object.defineProperty(state.config, chave, {
      get() {
        const alvo = perfilAtivo();
        return alvo && alvo.config ? alvo.config[chave] : undefined;
      },
      set(v) {
        const alvo = perfilAtivo();
        if (alvo) {
          if (!alvo.config) alvo.config = {};
          alvo.config[chave] = v;
        }
      },
      enumerable: false, // some da serialização do config global — mora em perfis[].config
      configurable: true,
    });
  }
}

// Recolhe "órfãs": chaves que caíram no TOPO como propriedade comum em vez de irem para
// o perfil. Acontece quando algo escreve numa coleção que ainda não tinha acessor —
// `state.chatHistorico = []` num estado que nunca teve chat, por exemplo. Sem isto a
// chave ficaria enumerável no topo e seria persistida fora do perfil.
//
// É a MESMA regra da migração (não-global ⇒ do perfil), aplicada continuamente. Por isso
// o `commit` a chama: qualquer coleção futura passa a ser por-perfil sozinha, sem
// ninguém precisar declará-la.
function recolherOrfas() {
  const p = perfilAtivo();
  if (!p) return;
  for (const chave of Object.keys(state)) {
    if (GLOBAL_TOP.has(chave)) continue;
    const d = Object.getOwnPropertyDescriptor(state, chave);
    if (!d || d.get) continue; // já é acessor
    p[chave] = state[chave];
    delete state[chave];
    definirAcessor(chave);
  }
}

// Tira o conteúdo protegido de UMA fatia de perfil (usada pelo backup "sem material").
// Mantém os metadados do material e os derivados de estudo; remove binário, texto,
// páginas, o índice semântico e o conteúdo dos resumos COMPILADOS (verbatim da apostila).
export function limparMaterialDaFatia(fatia) {
  if (!fatia || typeof fatia !== "object") return fatia;
  fatia.documentos = (fatia.documentos || []).map((d) => ({
    ...d,
    pdfData: null,
    imgData: null,
    texto: "",
    paginas: null,
    conteudoRemovido: true, // marca que o conteúdo foi retirado deste backup
  }));
  fatia.embeddings = { modelo: "", itens: [], fontes: {} };
  fatia.resumos = (fatia.resumos || []).map((r) =>
    r && r.origem && r.origem.tipo === "compilado" ? { ...r, conteudoHTML: "", conteudoRemovido: true } : r
  );
  return fatia;
}

const listeners = new Set();
let state = migrarParaPerfis(defaultState());
instalarAcessores(); // app zerado (sem estado salvo) já nasce com as coleções roteadas
let saveTimer = null;
let emitAgendado = false;
// Lote de geração atual: quando um handler abre um lote (iniciarLoteGeracao), TODO flashcard/questão
// criado enquanto ele estiver aberto recebe o mesmo geracaoId — permite mostrar "só os recém-gerados".
let loteGeracao = null;
let geracoesEmVoo = 0; // quantas gerações estão em curso (trava a sync automática)

function emit() {
  for (const fn of listeners) fn(state);
}

// Notificação deferida (microtask): garante que o handler do evento termine de
// ajustar o estado LOCAL da tela (ex.: fechar formulário, zerar cronômetro)
// ANTES do re-render. Coalesce múltiplos commits do mesmo handler num só render.
function agendarEmit() {
  if (emitAgendado) return;
  emitAgendado = true;
  queueMicrotask(() => {
    emitAgendado = false;
    emit();
  });
}

// ---- índice semântico FORA do estado (chave `emb:<perfil>`) -------------------
// O vetor de cada trecho é pesado e não muda quase nunca; o estado, ao contrário, é reescrito
// inteiro a cada mudança. Guardar os dois juntos fazia toda marcação de tópico pagar o preço
// do índice. Fica na memória (state.embeddings continua igual para o resto do app) e só é
// gravado quando a ASSINATURA muda — modelo, nº de trechos ou a lista de fontes indexadas.
const embSalvos = new Map(); // perfilId -> assinatura já gravada
function assinaturaEmb(p) {
  const e = p && p.embeddings;
  if (!e || typeof e !== "object") return "";
  const fontes = Object.entries(e.fontes || {}).map(([k, v]) => `${k}:${v}`).sort().join(",");
  return `${e.modelo || ""}|${(e.itens || []).length}|${fontes}`;
}
async function restaurarEmbeddings() {
  if (!blobsDisponiveis()) return;
  for (const p of state.perfis || []) {
    try {
      const guardado = await getBlob(`emb:${p.id}`);
      if (guardado && typeof guardado === "object" && Array.isArray(guardado.itens)) {
        p.embeddings = guardado;
        embSalvos.set(p.id, assinaturaEmb(p)); // veio do disco: já está gravado
      }
      // MIGRAÇÃO: veio de um estado antigo, com o índice embutido. NÃO marcar como gravado —
      // se marcasse, a 1ª gravação tiraria o índice do estado sem nunca o ter escrito fora,
      // e ele sumiria na abertura seguinte.
    } catch (_) {}
  }
}
async function salvarEmbeddingsSujos() {
  if (!blobsDisponiveis()) return;
  for (const p of state.perfis || []) {
    const sig = assinaturaEmb(p);
    if (sig === (embSalvos.get(p.id) ?? null)) continue;
    const ok = await setBlob(`emb:${p.id}`, p.embeddings || { modelo: "", itens: [], fontes: {} });
    if (ok) embSalvos.set(p.id, sig);
  }
}

// ---- PÁGINAS do material FORA do estado (chave `pag:<docId>`) -----------------
// As páginas são o corpo do material (uma entrada de texto por página do PDF): 17,4 MB nas 17
// apostilas do cursinho, contra ~1,6 MB de todo o resto do estudo (edital, questões, sessões,
// flashcards). Como o estado é reescrito INTEIRO a cada mudança, sem isto marcar um tópico
// como estudado custava serializar a biblioteca toda. Continuam na MEMÓRIA (`d.paginas` segue
// existindo para as 76 leituras espalhadas pelo app) e só vão ao disco quando mudam.
const pagsSalvas = new Map(); // docId -> assinatura já gravada
const assinaturaPaginas = (d) => {
  const ps = d && d.paginas;
  if (!Array.isArray(ps)) return "";
  let chars = 0;
  for (const p of ps) chars += (p && p.texto ? p.texto.length : 0) + (p && p.ocr ? 1 : 0);
  return `${ps.length}:${chars}`;
};
function esquecerPaginas(docId) {
  pagsSalvas.delete(docId);
  if (blobsDisponiveis()) delBlob(`pag:${docId}`);
}
async function restaurarPaginas() {
  if (!blobsDisponiveis()) return;
  for (const p of state.perfis || []) {
    for (const d of p.documentos || []) {
      try {
        d.leituraFalhou = false;
        if (Array.isArray(d.paginas) && d.paginas.length) continue; // MIGRAÇÃO: ver abaixo
        const { ok, valor: guardado } = await lerBlob(`pag:${d.id}`);
        // FALHA DE LEITURA ≠ MATERIAL SEM CONTEÚDO. Antes as duas viravam `null`: o material
        // abria vazio, como se nunca tivesse tido corpo. O conteúdo continua no disco (a chave
        // `pag:` não foi tocada), mas o app mentia sobre ele — e "Atualizar material", a reação
        // natural de quem vê a apostila vazia, RELÊ o arquivo e apaga o que a Visão transcreveu.
        if (!ok) {
          d.leituraFalhou = true;
          continue; // não marca `pagsSalvas`: nada foi lido, nada está conferido
        }
        if (guardado && Array.isArray(guardado.paginas)) {
          d.paginas = guardado.paginas;
          pagsSalvas.set(d.id, assinaturaPaginas(d)); // veio do disco: já está gravado
        }
        // Material com as páginas ainda EMBUTIDAS no estado (versão anterior) fica de fora do
        // `pagsSalvas` de propósito: assim a 1ª gravação as escreve na chave própria ANTES de
        // o estado ser gravado sem elas. Marcá-las como "já gravadas" apagaria o conteúdo.
      } catch (_) {}
    }
  }
}
async function salvarPaginasSujas() {
  if (!blobsDisponiveis()) return;
  for (const p of state.perfis || []) {
    for (const d of p.documentos || []) {
      if (!Array.isArray(d.paginas) || !d.paginas.length) continue;
      const sig = assinaturaPaginas(d);
      if (sig === (pagsSalvas.get(d.id) ?? null)) continue;
      const ok = await setBlob(`pag:${d.id}`, { paginas: d.paginas });
      if (ok) pagsSalvas.set(d.id, sig);
    }
  }
}

let gravacaoEmVoo = null; // promessa da gravação atual (para `aguardarGravacao`)
// Gravação que FALHOU e ainda não voltou a dar certo. `saveState` devolvia `false` (cota do
// IndexedDB estourada, disco cheio, mutex do SQLite envenenado) e o `persist` descartava o
// retorno: o aluno estudava a noite inteira e o dia não tinha sido gravado, sem um sinal na
// tela. Agora o estado fica marcado e a interface é avisada por evento (o store é camada de
// dados e não chama `toast` direto — mesmo padrão de `mentor:conteudo`).
let gravacaoFalhou = false;
// Trava de escrita: ligada quando a LEITURA do estado falhou no boot. Enquanto estiver ligada,
// nada é gravado — é o que impede o app de apagar um banco que ele só não conseguiu ler.
let modoSomenteLeitura = false;
let erroDeLeitura = "";
// Última nota dada a um flashcard, para o desfazer. Vive só na memória da sessão.
let ultimaRevisao = null;
// Id da última tentativa registrada, pelo mesmo motivo (toque errado na lista de questões).
let ultimaTentativa = null;
function avisarGravacao(ok, erro) {
  if (!ok === gravacaoFalhou) return; // nada mudou: não repete o aviso a cada clique
  gravacaoFalhou = !ok;
  try {
    window.dispatchEvent(new CustomEvent("mentor:gravacao", {
      detail: { ok, espaco: !ok && ehErroDeEspaco(erro), mensagem: erro ? String(erro.message || erro) : null },
    }));
  } catch (_) {}
}
function persist() {
  if (modoSomenteLeitura) return; // leitura falhou no boot: não escrever por cima do que está lá
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    // ENCADEIA na gravação anterior, em vez de disparar por cima dela. O estado é reescrito
    // inteiro a cada gravação (centenas de ms com biblioteca grande); duas escritas em voo ao
    // mesmo tempo podiam terminar fora de ordem e deixar no disco a versão mais VELHA.
    gravacaoEmVoo = Promise.resolve(gravacaoEmVoo).catch(() => {}).then(async () => {
      // Primeiro o que mora fora (só o que mudou), depois o estado — assim uma queda entre os
      // dois deixa o conteúdo no disco e o estado apontando para ele, nunca o contrário.
      await salvarEmbeddingsSujos();
      await salvarPaginasSujas();
      const ok = await saveState(state);
      avisarGravacao(!!ok, ok ? null : ultimoErroDeGravacao());
      return ok;
    }).catch((err) => {
      avisarGravacao(false, err);
      return false;
    });
  }, 250);
}

// commit = aplica mudança, persiste e notifica a UI.
// Carimba `modificadoEm` (usado pela sincronização para "o mais recente vence"), EXCETO
// quando `opts.semCarimbo` (ex.: escritas de status do próprio sync não contam como
// mudança de dados — senão a máquina pareceria sempre a mais nova e nunca baixaria).
function commit(opts) {
  if (!opts || !opts.semCarimbo) state.modificadoEm = new Date().toISOString();
  recolherOrfas(); // nenhuma coleção escapa para o topo entre a escrita e o save
  persist();
  agendarEmit();
}

export const store = {
  // ---------- ciclo de vida ----------
  async init() {
    const lido = await loadState();
    // LEITURA QUE FALHOU NÃO PODE VIRAR "APARELHO NOVO". Antes `loadState` devolvia `null`
    // para os dois casos, o app caía no `defaultState()` que já está em memória, mostrava o
    // onboarding — e a primeira gravação (qualquer clique) escrevia o vazio por cima do banco
    // bom. O modo somente-leitura trava toda escrita até o usuário decidir o que fazer.
    if (lido.falhou) {
      modoSomenteLeitura = true;
      erroDeLeitura = lido.erro ? String(lido.erro.message || lido.erro) : "";
      return state; // o boot confere `somenteLeitura()` e mostra a tela de recuperação
    }
    const carregado = lido.estado;
    if (carregado && typeof carregado === "object") {
      // ORDEM IMPORTA (multi-perfil): migrar ANTES de qualquer merge com o default.
      // O merge repõe as coleções vazias do defaultState() no TOPO; se ele viesse
      // primeiro, os backfills abaixo normalizariam o topo vazio em vez do perfil, e a
      // migração ainda veria `disciplinas: []` e gravaria vazio por cima dos dados.
      const migrado = migrarParaPerfis(carregado);
      const base = migrarParaPerfis(defaultState());
      const baseTopo = {};
      for (const k of Object.keys(base)) if (k !== "perfis" && k !== "perfilAtivo") baseTopo[k] = base[k];
      state = { ...baseTopo, ...migrado };
      // Garante campos GLOBAIS novos em estados antigos.
      for (const k of Object.keys(baseTopo)) {
        if (state[k] === undefined) state[k] = baseTopo[k];
      }
      // Garante coleções novas DENTRO do perfil (o equivalente por-perfil do backfill
      // acima): perfil salvo por uma versão anterior não conhece a coleção nova.
      const alvo = perfilAtivo();
      const perfilBase = base.perfis[0];
      if (alvo) {
        for (const k of Object.keys(perfilBase)) {
          if (k !== "id" && k !== "nome" && alvo[k] === undefined) alvo[k] = perfilBase[k];
        }
      }
      // Acessores ANTES dos backfills — daqui para baixo `state.topicos` e companhia
      // precisam enxergar o perfil ativo, não o topo.
      instalarAcessores();
      // Solta o rótulo padrão congelado num perfil que JÁ tem concurso: versões anteriores
      // gravavam o literal "Meu concurso" no `nome` durante a migração (antes de o
      // onboarding preencher o cargo), e o seletor ficava divergindo da topbar. Vazio faz
      // `perfis()` derivar o nome do concurso. Não toca em nome escolhido por "Renomear".
      // Documentos cujo binário ainda está embutido no estado: movidos para fora logo
      // abaixo, depois que os perfis forem varridos.
      const migrarBinarioParaFora = [];
      // O que mora FORA do estado volta para a memória ANTES dos backfills: as páginas
      // (chave `pag:<doc>`) porque o backfill logo abaixo recompõe o `texto` a partir delas,
      // e o índice semântico (chave `emb:<perfil>`) porque a tela pode consultá-lo assim que
      // o app abre. Os dois saíram do estado porque ele é reescrito inteiro a cada mudança:
      // páginas = 17,4 MB e índice = 6,5 MB (989 trechos) na base com as 17 apostilas.
      await restaurarPaginas();
      await restaurarEmbeddings();
      for (const p of state.perfis || []) {
        if (p.nome === "Meu concurso" && p.concurso && p.concurso.cargo) p.nome = "";
        // O snapshot de sincronização sobe as PÁGINAS e omite o `texto` do material (é o
        // join delas — o mesmo conteúdo duas vezes, metade do peso do material no cofre).
        // Aqui ele volta, para o que veio da nuvem e para backup importado. Em TODOS os
        // concursos: os backfills abaixo enxergam só o perfil ativo, e o material dos
        // outros ficaria sem texto até alguém trocar de concurso.
        for (const d of p.documentos || []) {
          if (!d.texto && Array.isArray(d.paginas) && d.paginas.length) recomputarTextoDoc(d);
          // Material salvo antes de a disciplina existir como campo: adota a que a tela já
          // mostrava (prefixo do título e, na falta dele, o tópico dominante). Idempotente e
          // conservador — quando nada indica a disciplina, fica `null` e nada muda.
          if (d.disciplinaId === undefined) {
            const dd = disciplinaDoDocumento(p, d);
            d.disciplinaId = dd && dd.tipo === "edital" ? dd.id : null;
            d.cursoNome = dd && dd.tipo === "curso" ? dd.nome : null;
          }
          if (d.cursoNome === undefined) d.cursoNome = null;
          // Sinalizadores do binário: em material antigo eles não existem, e a UI precisa
          // saber se há PDF sem carregá-lo.
          if (d.temPdf === undefined) d.temPdf = !!d.pdfData;
          if (d.temImg === undefined) d.temImg = !!d.imgData;
          // Migração: tira o binário embutido do estado e o move para a chave própria.
          // Idempotente — na 2ª abertura já não há nada embutido para mover.
          if ((d.pdfData || d.imgData) && blobsDisponiveis()) migrarBinarioParaFora.push(d);
        }
      }
      // Backfill de campos NOVOS de config em estados salvos antigos. Preenche o que
      // falta em vez de reatribuir: `state.config = {...}` destruiria os acessores
      // por-perfil instalados logo acima (mesma razão do setConfig).
      for (const [k, v] of Object.entries(base.config)) {
        if (state.config[k] === undefined) state.config[k] = v;
      }
      // Chaves por-perfil que o default guarda no perfil, não no config global.
      const cfgBase = (base.perfis[0] && base.perfis[0].config) || {};
      for (const [k, v] of Object.entries(cfgBase)) {
        if (state.config[k] === undefined) state.config[k] = v;
      }
      // backfill nas indicações (modo meta + disciplina derivada do tópico)
      state.indicacoes.forEach((i) => {
        if (i.modo === undefined) i.modo = "meta";
        if (i.texto === undefined) i.texto = "";
        if (i.tribunal === undefined) i.tribunal = null;
        if (i.categoria === undefined) i.categoria = null;
        if (i.disciplinaId === undefined) {
          const t = i.topicoId ? state.topicos.find((x) => x.id === i.topicoId) : null;
          i.disciplinaId = t ? t.disciplinaId : null;
        }
      });
      // backfill do campo "concluido" em tópicos criados antes deste recurso
      state.topicos.forEach((t) => {
        if (t.concluido === undefined) t.concluido = false;
        // "mais cai" sem percentual: tema relevante cujo % é desconhecido.
        // Relevante (destaque) ⟺ peso > 0 OU maisCai. Backfill conservador:
        // estados antigos só tinham destaque via peso, então maisCai começa em false.
        if (t.maisCai === undefined) t.maisCai = false;
        // Fase 2: "também conhecido como" — nomes alternativos (edital/cursinho/antigos)
        // usados no casamento com dados externos (relevância, PQ, detecção, prova).
        if (!Array.isArray(t.aliases)) t.aliases = [];
      });
      // backfill do vínculo opcional sessão→tarefa
      state.sessoes.forEach((s) => {
        if (s.missaoId === undefined) s.missaoId = null;
      });
      // backfill dos campos de OCR/Visão em documentos antigos
      state.documentos.forEach((d) => {
        if (d.imgData === undefined) d.imgData = null;
        if (d.paginas === undefined) d.paginas = null;
        if (d.topicoIds === undefined) d.topicoIds = d.topicoId ? [d.topicoId] : [];
        if (!d.topicoPaginas || typeof d.topicoPaginas !== "object") d.topicoPaginas = {}; // Fase 6: {topicoId:[ini,fim]}
      });
      // backfill dos campos novos dos mapas mentais (import híbrido / visual — Fase 2)
      if (!Array.isArray(state.mapasMentais)) state.mapasMentais = [];
      state.mapasMentais.forEach((m) => {
        if (m.imgData === undefined) m.imgData = null;
        if (m.pdfData === undefined) m.pdfData = null;
        if (m.binarioDescartado === undefined) m.binarioDescartado = false;
        if (m.origem === undefined) m.origem = null;
        // Mesmos sinais dos materiais: a UI precisa saber que há original sem carregá-lo.
        if (m.temImg === undefined) m.temImg = !!m.imgData;
        if (m.temPdf === undefined) m.temPdf = !!m.pdfData;
        if ((m.imgData || m.pdfData) && blobsDisponiveis()) migrarBinarioParaFora.push(m);
      });
      // backfill do índice semântico
      if (!state.embeddings || typeof state.embeddings !== "object") {
        state.embeddings = { modelo: "", itens: [], fontes: {} };
      }
      if (!Array.isArray(state.embeddings.itens)) state.embeddings.itens = [];
      if (!state.embeddings.fontes) state.embeddings.fontes = {};
      // backfill do checklist do edital oficial (Fase 3)
      if (!state.editalOficial || !Array.isArray(state.editalOficial.itens)) {
        state.editalOficial = { conferidoEm: null, itens: [] };
      }
      // backfill da divisão do cursinho (Fase 4)
      if (!Array.isArray(state.aulas)) state.aulas = [];
      state.aulas.forEach((a) => { if (!Array.isArray(a.topicoIds)) a.topicoIds = []; });
      if (state.config.baseEstudo === undefined) state.config.baseEstudo = "edital";
      // backfill de disciplinaId nas questões (derivado do tópico)
      state.questoes.forEach((q) => {
        if (q.disciplinaId === undefined) {
          const t = q.topicoId ? state.topicos.find((x) => x.id === q.topicoId) : null;
          q.disciplinaId = t ? t.disciplinaId : null;
        }
      });
      // backfill: tarefas recorrentes (rotina semanal) e campo `data` das missões
      if (!Array.isArray(state.rotinas)) state.rotinas = [];
      if (!Array.isArray(state.config.diasFolga)) state.config.diasFolga = [];
      if (!state.config.niveisDisciplina || typeof state.config.niveisDisciplina !== "object") state.config.niveisDisciplina = {};
      if (!Array.isArray(state.config.disciplinasAdiadas)) state.config.disciplinasAdiadas = [];
      if (!Array.isArray(state.revisoesTopico)) state.revisoesTopico = [];
      if (!Array.isArray(state.revisoesFeitas)) state.revisoesFeitas = []; // log de conclusões (Central de Revisões)
      if (!Array.isArray(state.chatHistorico)) state.chatHistorico = []; // memória do chat do Mentor (Fase 2)
      if (!Array.isArray(state.simulados)) state.simulados = []; // histórico de simulados (app + externos)
      if (state.config.revisaoTopicoAuto === undefined) state.config.revisaoTopicoAuto = false;
      if (!Array.isArray(state.marcacoes)) state.marcacoes = [];
      if (!state.config.paletaMarcacao) state.config.paletaMarcacao = "padrao"; // padrao | daltonismo | contraste
      if (!state.config.notificacoes || typeof state.config.notificacoes !== "object") {
        state.config.notificacoes = { ativar: false, diario: false, horario: "08:00", inatividade: true, revisoes: true, marcos: true };
      }
      if (state.config.checkinVistoData === undefined) state.config.checkinVistoData = null;
      // backfill de categoria/ordem em missões criadas antes deste recurso
      state.missoes.forEach((m, i) => {
        if (m.ordem === undefined) m.ordem = i;
        if (m.data === undefined) m.data = null; // null = tarefa "solta" (sem dia)
        if (m.categoria === undefined) {
          if (m.origem === "indicacao" && m.indicacaoId) {
            const ind = state.indicacoes.find((x) => x.id === m.indicacaoId);
            m.categoria = ind && ind.tipo === "juris" ? "Jurisprudência" : ind ? "Lei Seca" : "Não definida";
          } else {
            m.categoria = "Não definida";
          }
        }
        // migração de nomes de categoria antigos
        if (m.categoria === "Geral") m.categoria = "Não definida";
        if (m.categoria === "Material PDF") m.categoria = "Materiais";
      });
      // Migração dos binários (materiais E mapas) para fora do estado. Roda no fim, depois
      // de TODOS os backfills terem varrido as duas coleções. Em segundo plano e um a um:
      // são dezenas de MB por PDF, e travar a abertura do app por causa disso seria pior
      // que o problema. Enquanto não termina, o binário segue embutido e tudo funciona.
      if (migrarBinarioParaFora.length) {
        (async () => {
          for (const x of migrarBinarioParaFora) {
            const ok = await setBlob(x.id, { pdfData: x.pdfData || null, imgData: x.imgData || null });
            if (!ok) break; // armazenamento indisponível: deixa como está
            cacheBinario.set(x.id, { pdfData: x.pdfData || null, imgData: x.imgData || null });
            x.pdfData = null;
            x.imgData = null;
          }
          commit({ semCarimbo: true }); // é reorganização interna, não mudança de dados
        })();
      }
    }
    return state;
  },
  get() {
    return state;
  },
  // Espera a gravação REAL terminar (o debounce de 250 ms + a escrita de páginas, índice e
  // estado). Guardar uma apostila é escrever dezenas de MB; sem isto a tela seguia adiante
  // e o app ficava surdo a cliques enquanto escrevia, sem dizer que estava salvando.
  async aguardarGravacao() {
    while (saveTimer) await new Promise((r) => setTimeout(r, 60));
    await Promise.resolve(gravacaoEmVoo).catch(() => {});
    return !gravacaoFalhou;
  },
  // A última gravação falhou e ainda não se recuperou? A tela usa para não dizer "salvo" e
  // para oferecer "tentar de novo".
  gravacaoPendente() {
    return gravacaoFalhou;
  },
  // O app está travado para escrita porque não conseguiu LER o estado no boot.
  somenteLeitura() {
    return modoSomenteLeitura;
  },
  erroDeLeitura() {
    return erroDeLeitura;
  },
  // O usuário escolheu, no diálogo de recuperação, começar do zero mesmo assim — ciente de que
  // o que estiver gravado será substituído. Só isto destrava a escrita; não há caminho
  // automático, de propósito.
  //
  // LIMPA o armazenamento antes de gravar. Sem isso, o que estava lá continuaria ilegível e a
  // abertura seguinte cairia na mesma tela de recuperação, para sempre — destravar sem
  // consertar a causa seria um laço, não uma saída.
  // Devolve `false` quando nem a limpeza nem a gravação funcionam (armazenamento indisponível
  // de verdade): aí não há começo do zero possível, e a tela tem de dizer isso.
  async destravarEscritaComecandoDoZero() {
    modoSomenteLeitura = false;
    erroDeLeitura = "";
    try { await resetState(); } catch (_) {}
    return this.gravarAgora();
  },
  // Força uma nova tentativa agora (botão do aviso). Devolve true se gravou.
  async tentarGravarDeNovo() {
    persist();
    return this.aguardarGravacao();
  },
  // Antecipa a gravação pendente: cancela o debounce de 250 ms e começa a escrever JÁ.
  // Serve para o fechamento — no desktop dá para esperar, na web o `pagehide` não deixa
  // esperar nada, e aí o que vale é ter COMEÇADO a escrita antes de a aba morrer.
  gravarAgora() {
    if (modoSomenteLeitura) return Promise.resolve(false);
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    gravacaoEmVoo = Promise.resolve(gravacaoEmVoo).catch(() => {}).then(async () => {
      await salvarEmbeddingsSujos();
      await salvarPaginasSujas();
      const ok = await saveState(state);
      avisarGravacao(!!ok, ok ? null : ultimoErroDeGravacao());
      return ok;
    }).catch(() => false);
    return gravacaoEmVoo;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  isOnboarded() {
    return !!state.meta.onboarded && !!state.concurso;
  },

  // ---------- perfis (multi-concurso) ----------
  // Um perfil = um concurso com todo o pacote de estudo dele. O nome é derivado do
  // concurso quando o usuário não escolhe um.
  perfis() {
    return (state.perfis || []).map((p) => ({
      id: p.id,
      nome: p.nome || nomeDoPerfil(p),
      ativo: p.id === state.perfilAtivo,
      cargo: (p.concurso && p.concurso.cargo) || "",
      banca: (p.concurso && p.concurso.banca) || "",
      // números para a UI mostrar o que há dentro de cada perfil antes de trocar
      topicos: (p.topicos || []).length,
      questoes: (p.questoes || []).length,
      flashcards: (p.flashcards || []).length,
    }));
  },
  perfilAtivoId() {
    return state.perfilAtivo || null;
  },
  // Recusa trocar de concurso com geração em voo. Todas as escritas (`addQuestao`,
  // `addFlashcard`) vão para o perfil ATIVO no momento em que a resposta chega: trocar no meio
  // fazia o lote inteiro cair no concurso novo, misturando as matérias de dois editais.
  // `geracoesEmVoo` já existia, mas só travava o DOWNLOAD da nuvem.
  // Devolve `"gerando"` em vez de `false` para a tela poder explicar o motivo.
  trocarPerfil(id) {
    if (!id || id === state.perfilAtivo) return false;
    if (!(state.perfis || []).some((p) => p.id === id)) return false;
    if (geracoesEmVoo > 0) return "gerando";
    state.perfilAtivo = id;
    // Obrigatório: os perfis não têm as mesmas chaves (um pode ter chatHistorico e o
    // outro não), então os acessores precisam ser refeitos para o perfil que entra.
    instalarAcessores();
    commit();
    return true;
  },
  // Cria um perfil VAZIO (nasce do default, sem herdar nada do atual) e troca para ele.
  // O onboarding cuida de preencher concurso/edital — é a mesma porta de entrada do
  // primeiro uso, reaproveitada.
  criarPerfil(nome) {
    const base = migrarParaPerfis(defaultState());
    const novo = base.perfis[0];
    novo.id = uid("perf");
    // Nome VAZIO por padrão: `perfis()` deriva o rótulo do concurso (nomeDoPerfil), então
    // assim que o onboarding gravar cargo/banca o seletor já mostra o nome certo. Só quem
    // usa "Renomear" fixa um nome próprio.
    novo.nome = (nome || "").trim();
    state.perfis = [...(state.perfis || []), novo];
    state.perfilAtivo = novo.id;
    instalarAcessores();
    commit();
    return novo.id;
  },
  renomearPerfil(id, nome) {
    const p = (state.perfis || []).find((x) => x.id === id);
    if (!p) return false;
    p.nome = (nome || "").trim() || p.nome;
    commit();
    return true;
  },
  // Remover é irreversível e leva junto TODO o estudo daquele concurso — a tela confirma
  // antes. O último perfil não pode ser removido (o app ficaria sem estado).
  removerPerfil(id) {
    const ps = state.perfis || [];
    if (ps.length < 2) return false;
    const i = ps.findIndex((p) => p.id === id);
    if (i < 0) return false;
    const alvo = ps[i];
    ps.splice(i, 1);
    if (state.perfilAtivo === id) state.perfilAtivo = ps[0].id;
    // APAGA O QUE MORA FORA DO ESTADO. Só o `resetTudo` limpava os blobs: apagar um concurso
    // tirava a ficha do material do JSON e deixava no disco o PDF, as páginas e o índice
    // semântico dele, sem nada que voltasse a apontar para eles. Numa biblioteca de cursinho
    // isso é a maior parte do peso do banco, e ficava órfão para sempre.
    // Em segundo plano: são dezenas de MB e travar a troca de concurso seria pior.
    (async () => {
      for (const d of alvo.documentos || []) {
        await delBlob(d.id);          // binário (PDF/imagem)
        await delBlob(`pag:${d.id}`); // páginas
      }
      for (const m of alvo.mapasMentais || []) await delBlob(m.id);
      await delBlob(`emb:${alvo.id}`); // índice semântico do perfil
    })();
    instalarAcessores();
    commit();
    return true;
  },
  // True quando há um provedor de IA online conectado (Gemini com chave, ou Claude local).
  // As funções GERATIVAS (gerar questões/flashcards por texto, comentar erro,
  // correção de mérito, resposta do chat) só funcionam quando isto é verdadeiro.
  iaDisponivel() {
    return iaProv.iaDisponivel(state.config);
  },

  // ---------- concurso / onboarding ----------
  criarConcurso({ cargo, banca }) {
    state.concurso = {
      id: uid("conc"),
      cargo: (cargo || "").trim() || "Concurso",
      banca: (banca || "").trim(),
      status: "ativo",
      criadoEm: nowISO(),
    };
    commit();
    return state.concurso;
  },

  // Aplica a estrutura vinda do parser de edital: [{nome, topicos:[str]}].
  // selo verde: é o material do próprio usuário, apenas estruturado.
  // Conta quantos tópicos da estrutura importada JÁ EXISTEM (mesma disciplina + nome),
  // para a UI perguntar ao usuário o que fazer — só quando houver repetidos.
  analisarEditalDup(estrutura) {
    let repetidos = 0;
    for (const disc of estrutura) {
      const nomeD = (disc.nome || "").trim().toLowerCase();
      const d = state.disciplinas.find((x) => x.nome.trim().toLowerCase() === nomeD);
      for (const tnome of disc.topicos || []) {
        const n = (tnome || "").trim().toLowerCase();
        if (d && state.topicos.some((t) => t.disciplinaId === d.id && t.nome.trim().toLowerCase() === n)) repetidos++;
      }
    }
    return { repetidos };
  },
  // modo: "pular" (reaproveita a disciplina por nome e ignora tópicos repetidos) |
  //       "duplicar" (reaproveita a disciplina, mas acrescenta os tópicos mesmo repetidos).
  aplicarEdital(estrutura, modo = "pular") {
    let disciplinas = 0;
    let topicos = 0;
    let pulados = 0;
    for (const disc of estrutura) {
      const nomeD = (disc.nome || "").trim();
      let d = state.disciplinas.find((x) => x.nome.trim().toLowerCase() === nomeD.toLowerCase());
      if (!d) {
        d = this.addDisciplina(nomeD, true);
        disciplinas++;
      }
      for (const tnome of disc.topicos || []) {
        const n = (tnome || "").trim();
        const existe = state.topicos.some((t) => t.disciplinaId === d.id && t.nome.trim().toLowerCase() === n.toLowerCase());
        if (existe && modo === "pular") {
          pulados++;
          continue;
        }
        this.addTopico(d.id, n, true, "verde");
        topicos++;
      }
    }
    commit();
    return { disciplinas, topicos, pulados };
  },

  finalizarOnboarding() {
    state.meta.onboarded = true;
    commit();
  },

  // Monta o plano inicial do onboarding a partir de um caminho escolhido, reusando
  // aplicarEdital (disciplinas + tópicos). A prova e o ritmo já vêm do passo 2 (config).
  //   origem "area"    → estrutura curada da área (areas.js), 100% offline.
  //   origem "edital"  → estrutura já parseada (Visão→JSON), passada em opts.estrutura.
  //   origem "zero"    → não cria nada (fallback: começar do zero).
  // Retorna { origem, disciplinas, topicos } para a tela "Seu plano está pronto!".
  montarPlanoInicial({ origem = "zero", areaId = null, estrutura = null } = {}) {
    let est = [];
    if (origem === "area") est = areas.estruturaDaArea(areaId);
    else if (origem === "edital") est = Array.isArray(estrutura) ? estrutura : [];
    if (!est.length) return { origem, disciplinas: 0, topicos: 0 };
    const r = this.aplicarEdital(est, "pular");
    return { origem, disciplinas: r.disciplinas, topicos: r.topicos };
  },

  // ---------- bancas (registro extensível) ----------
  // Lista completa: semente embutida (bancas.js) + as adicionadas pelo usuário,
  // sem duplicar por nome. Cada item: {nome, siteOficial, fonte:"built-in"|"usuário", id?}.
  listaBancas() {
    return bancas.mesclarBancas(state.bancas || []);
  },
  // Adiciona uma banca do usuário. Recusa nome vazio ou já existente (built-in ou do
  // usuário). Retorna a banca criada ou null.
  addBanca({ nome, siteOficial } = {}) {
    const nomeN = bancas.normalizarNomeBanca(nome);
    if (!nomeN) return null;
    if (this.listaBancas().some((b) => b.nome.toLowerCase() === nomeN.toLowerCase())) return null;
    const b = { id: uid("banca"), nome: nomeN, siteOficial: (siteOficial || "").trim() };
    state.bancas.push(b);
    commit();
    return b;
  },
  editarBanca(id, { nome, siteOficial } = {}) {
    const b = (state.bancas || []).find((x) => x.id === id);
    if (!b) return;
    if (nome !== undefined) b.nome = bancas.normalizarNomeBanca(nome) || b.nome;
    if (siteOficial !== undefined) b.siteOficial = (siteOficial || "").trim();
    commit();
  },
  // Remove uma banca DO USUÁRIO (as built-in não são removíveis). Tira também de preferidas.
  removerBanca(id) {
    const b = (state.bancas || []).find((x) => x.id === id);
    state.bancas = (state.bancas || []).filter((x) => x.id !== id);
    if (b && Array.isArray(state.config.bancasPreferidas)) {
      state.config.bancasPreferidas = state.config.bancasPreferidas.filter(
        (n) => n.toLowerCase() !== b.nome.toLowerCase()
      );
    }
    commit();
  },
  // Marca/desmarca uma banca como PREFERIDA (priorização nas sugestões — não limita).
  toggleBancaPreferida(nome) {
    const nomeN = bancas.normalizarNomeBanca(nome);
    if (!nomeN) return;
    if (!Array.isArray(state.config.bancasPreferidas)) state.config.bancasPreferidas = [];
    const arr = state.config.bancasPreferidas;
    const i = arr.findIndex((x) => x.toLowerCase() === nomeN.toLowerCase());
    if (i >= 0) arr.splice(i, 1);
    else arr.push(nomeN);
    commit();
  },

  // ---------- provas anteriores ----------
  // Assinatura para DEDUP: banca|ano|órgão|cargo normalizados.
  _assinaturaProva(ref = {}) {
    return ["banca", "ano", "orgao", "cargo"]
      .map((k) => String(ref[k] || "").trim().toLowerCase().replace(/\s+/g, " "))
      .join("|");
  },
  // Título legível da prova, usado como referência exibida na questão.
  _tituloProva(ref = {}) {
    return (
      [ref.banca, ref.ano, ref.orgao, ref.cargo]
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .join(" · ") || "Prova anterior"
    );
  },
  provaPorAssinatura(assinatura) {
    return (state.provas || []).find((p) => p.assinatura === assinatura) || null;
  },
  // Importa uma prova JÁ PARSEADA e PAREADA (ver provas.js).
  // referencia: {banca, ano, orgao, cargo, url}.
  // questoes: [{enunciado, alternativas, gabarito, formato, justificativa, anulada, semGabarito, topicoId}].
  // DEDUP por assinatura: se já existe prova igual, NÃO reimporta. Selo "oficial"
  // (gabarito da banca). Retorna {duplicada, prova, criadas, anuladas, semGabarito}.
  importarProva({ referencia = {}, questoes = [], topicoId = null } = {}) {
    const assinatura = this._assinaturaProva(referencia);
    const existente = this.provaPorAssinatura(assinatura);
    if (existente) return { duplicada: true, prova: existente, criadas: 0, anuladas: 0, semGabarito: 0 };
    const titulo = this._tituloProva(referencia);
    const prova = {
      id: uid("prova"),
      banca: String(referencia.banca || "").trim(),
      ano: String(referencia.ano || "").trim(),
      orgao: String(referencia.orgao || "").trim(),
      cargo: String(referencia.cargo || "").trim(),
      url: String(referencia.url || "").trim(),
      assinatura,
      comentario: null, // comentário POR PROVA (sob demanda — etapa futura)
      criadoEm: nowISO(),
    };
    state.provas.push(prova);
    const fonte = { tipo: "prova", id: prova.id, titulo };
    let criadas = 0, anuladas = 0, semGab = 0;
    for (const q of questoes) {
      if (!q || !q.enunciado || !Array.isArray(q.alternativas) || q.alternativas.length < 2) continue;
      if (q.anulada) anuladas++;
      if (q.semGabarito) semGab++;
      this.addQuestao({
        enunciado: q.enunciado,
        alternativas: q.alternativas,
        gabarito: Number.isInteger(q.gabarito) ? q.gabarito : 0,
        formato: q.formato === "ce" ? "ce" : "mc",
        justificativa: q.justificativa || null,
        selo: "oficial",
        fonte,
        referencia: titulo,
        provaId: prova.id,
        anulada: !!q.anulada || !!q.semGabarito,
        topicoId: q.topicoId || topicoId || null,
      });
      criadas++;
    }
    commit();
    return { duplicada: false, prova, criadas, anuladas, semGabarito: semGab };
  },
  // Extrai (IA) as questões do texto da prova + parseia o gabarito + pareia, SEM
  // importar — alimenta a tela de REVISÃO. Requer IA conectada (extração). O gabarito
  // é o OFICIAL (do texto do gabarito), não o inferido pela IA. Devolve
  // {questoes, formato, totalGabarito}.
  async prepararProvaDeTexto({ textoProva, textoGabarito, formato = "mc", onProgress } = {}) {
    if (!this.iaDisponivel()) {
      const e = new Error("Conecte a IA (Gemini) para extrair as questões da prova.");
      e.code = "IA_OFFLINE";
      throw e;
    }
    const prog = typeof onProgress === "function" ? onProgress : () => {};
    const fmt = formato === "ce" ? "ce" : "mc";
    // Extração SEM TRUNCAR: divide a prova em pedaços e junta. Cada questão preserva seu NÚMERO,
    // então o pareamento com o gabarito (por número) funciona mesmo dividindo a prova.
    const pedacos = dividirTextoQuestoes(textoProva || "", 12000);
    const extraidas = [];
    const multi = pedacos.length > 1;
    for (let i = 0; i < pedacos.length; i++) {
      prog(multi ? `Extraindo bloco ${i + 1} de ${pedacos.length}… (${extraidas.length} questões até agora)` : "Extraindo as questões da prova…");
      let itens = [];
      for (let tent = 0; tent < 3; tent++) { // repete o pedaço se a IA falhar (ex.: 503) p/ não perder questões
        try { itens = await iaProv.extrairQuestoesProva(state.config, { texto: pedacos[i], formato: fmt, n: 90, limiteTexto: 20000 }); if (itens.length) break; }
        catch (e) { console.error(`pedaço da prova falhou (tentativa ${tent + 1}):`, e); if (tent < 2) prog(`Bloco ${i + 1}: servidor ocupado, tentando de novo…`); }
      }
      extraidas.push(...itens);
    }
    prog("Aplicando o gabarito…");
    // Número impresso no início do enunciado é MAIS confiável que o número inferido pela IA (que
    // pode driftar em prova grande). Usa-o como número oficial p/ o pareamento e limpa o enunciado.
    for (const q of extraidas) {
      const m = (q.enunciado || "").match(/^\s*(\d{1,3})\s*[.)\-–]\s+/);
      if (m) { q.numero = parseInt(m[1], 10); q.enunciado = q.enunciado.replace(/^\s*\d{1,3}\s*[.)\-–]\s+/, "").trim(); }
    }
    const g = provas.parseGabarito(textoGabarito || "", fmt);
    const questoes = provas.parearQuestoesComGabarito(extraidas, g.itens, { formato: g.formato });
    return { questoes, formato: g.formato, totalGabarito: g.itens.length };
  },
  // Lê um arquivo para o import de prova: extrai o texto selecionável; se for um PDF
  // ESCANEADO (sem/pouco texto) e houver Visão (Gemini), faz OCR página a página e
  // devolve o texto transcrito. onProgress(msg) recebe mensagens de andamento.
  async lerArquivoComOcr(file, onProgress, contexto) {
    const fim = contexto || "questões de prova de concurso: enunciados, alternativas e o gabarito (quando houver)";
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (!isPdf) return file.text();
    // IA primeiro: o Gemini lê o PDF inteiro numa só chamada (inclusive escaneado).
    if (this.iaDisponivel() && state.config.iaProvider === "gemini" && file.size <= 14 * 1024 * 1024) {
      try {
        if (onProgress) onProgress("Lendo o PDF com a IA (pode demorar)...");
        const dataB64 = await pdf.arquivoParaBase64(file);
        const t = await iaProv.extrairTextoArquivo(state.config, { dataB64, mimeType: "application/pdf", nomeArquivo: file.name, contexto: fim });
        if (t && t.trim()) return t.trim();
      } catch (e) {
        if (!e || e.code !== "IA_OFFLINE") { try { console.warn("IA falhou na leitura do PDF; usando método local:", e); } catch (_) {} }
      }
    }
    const { paginas } = await pdf.extrairPdfPaginas(file);
    const textoDireto = paginas.map((p) => p.texto).join("\n\n").trim();
    const vazias = paginas.filter((p) => p.vazia).length;
    const precisaOcr = textoDireto.length < 40 || vazias > paginas.length / 2;
    if (!precisaOcr) return textoDireto;
    // Sem Visão (offline ou provedor não-Gemini): devolve o que houver; a UI orienta.
    if (!this.iaDisponivel() || state.config.iaProvider !== "gemini") return textoDireto;
    if (onProgress) onProgress("PDF escaneado: transcrevendo com a Visão (pode demorar)...");
    const imgs = await pdf.rasterizarPaginas(file, paginas.map((p) => p.n), 2);
    const partes = [];
    for (const img of imgs) {
      if (onProgress) onProgress(`Transcrevendo página ${img.n}/${imgs.length}...`);
      try {
        const t = await iaProv.transcreverImagem(state.config, { dataUrl: img.dataUrl, contexto: "prova de concurso" });
        if (t) partes.push(t);
      } catch (_) {
        // página que falhar (ex.: cota/segurança) é pulada; segue com as demais
      }
    }
    return partes.join("\n\n").trim() || textoDireto;
  },
  // Remove a prova e TODAS as questões/tentativas dela.
  removerProva(id) {
    state.provas = (state.provas || []).filter((p) => p.id !== id);
    const qIds = new Set(state.questoes.filter((q) => q.provaId === id).map((q) => q.id));
    state.questoes = state.questoes.filter((q) => q.provaId !== id);
    state.tentativas = state.tentativas.filter((t) => !qIds.has(t.questaoId));
    commit();
  },
  // Comentário da PROVA pela IA (sob demanda, ): visão geral dos temas e dicas, com base
  // nas questões da prova. A UI bloqueia antes via iaDisponivel(). Guarda em prova.comentario.
  async comentarProvaIA(provaId) {
    const prova = (state.provas || []).find((p) => p.id === provaId);
    if (!prova) return null;
    const qs = state.questoes
      .filter((x) => x.provaId === provaId)
      .map((q) => ({
        enunciado: q.enunciado,
        gabarito: q.formato === "ce" ? (q.gabarito === 0 ? "Certo" : "Errado") : String.fromCharCode(65 + (q.gabarito || 0)),
      }));
    const r = await iaProv.comentarProva(state.config, { titulo: this._tituloProva(prova), questoes: qs });
    prova.comentario = r.texto;
    commit();
    return r;
  },
  // Lista de provas com a contagem de questões (para a UI de gerência).
  listaProvas() {
    return (state.provas || []).map((p) => ({
      ...p,
      titulo: this._tituloProva(p),
      qtd: state.questoes.filter((q) => q.provaId === p.id).length,
    }));
  },

  // ---------- disciplinas ----------
  addDisciplina(nome, silent = false) {
    const d = { id: uid("disc"), nome: (nome || "").trim() || "Disciplina" };
    state.disciplinas.push(d);
    if (!silent) commit();
    return d;
  },
  renomearDisciplina(id, nome) {
    const d = state.disciplinas.find((x) => x.id === id);
    if (d) {
      d.nome = nome.trim() || d.nome;
      commit();
    }
  },
  removerDisciplina(id) {
    state.disciplinas = state.disciplinas.filter((d) => d.id !== id);
    const topSet = new Set(state.topicos.filter((t) => t.disciplinaId === id).map((t) => t.id));
    state.topicos = state.topicos.filter((t) => t.disciplinaId !== id);
    // Desvincula conteúdo dos tópicos removidos (não apaga, vira "sem tópico").
    for (const arr of ["documentos", "questoes", "flashcards", "indicacoes", "missoes", "resumos", "sessoes", "errosManuais", "rotinas"]) {
      state[arr].forEach((x) => {
        if (topSet.has(x.topicoId)) x.topicoId = null;
      });
    }
    // Solta também a referência DIRETA à disciplina removida (vira "sem disciplina").
    for (const arr of ["questoes", "flashcards", "indicacoes", "errosManuais", "resumos"]) {
      state[arr].forEach((x) => {
        if (x.disciplinaId === id) x.disciplinaId = null;
      });
    }
    // A revisão de tópico (curva do esquecimento) é por tópico: sem o tópico, não faz sentido.
    state.revisoesTopico = state.revisoesTopico.filter((r) => !topSet.has(r.topicoId));
    commit();
  },

  // Limpa TODA a estrutura do edital (disciplinas e tópicos). O conteúdo vinculado
  // (materiais, questões, flashcards, sessões, etc.) NÃO é apagado: fica "sem tópico".
  limparEdital() {
    state.disciplinas = [];
    state.topicos = [];
    for (const arr of ["documentos", "questoes", "flashcards", "indicacoes", "missoes", "resumos", "sessoes", "errosManuais", "rotinas"]) {
      (state[arr] || []).forEach((x) => { if (x.topicoId) x.topicoId = null; });
    }
    for (const arr of ["questoes", "flashcards", "indicacoes", "errosManuais", "resumos"]) {
      (state[arr] || []).forEach((x) => { if (x.disciplinaId) x.disciplinaId = null; });
    }
    state.revisoesTopico = [];
    (state.aulas || []).forEach((a) => { a.topicoIds = []; }); // aulas do cursinho mapeiam tópicos
    commit();
  },

  // ---------- tópicos ----------
  addTopico(disciplinaId, nome, silent = false, selo = "amarelo") {
    const t = {
      id: uid("top"),
      disciplinaId,
      nome: (nome || "").trim() || "Tópico",
      destaque: false,
      maisCai: false,
      previsaoAula: false,
      concluido: false,
      peso: 0,
      selo,
      criadoEm: nowISO(),
    };
    state.topicos.push(t);
    if (!silent) commit();
    return t;
  },
  // Renomeia o tópico e GUARDA o nome antigo como sinônimo (preserva o casamento com
  // dados externos que ainda usem o nome anterior). manterAlias=false pula isso.
  renomearTopico(id, nome, manterAlias = true) {
    const t = state.topicos.find((x) => x.id === id);
    if (!t) return;
    const novo = (nome || "").trim();
    if (!novo || novo === t.nome) return;
    if (manterAlias) {
      if (!Array.isArray(t.aliases)) t.aliases = [];
      const jaTem = t.aliases.some((a) => a.toLowerCase() === t.nome.toLowerCase());
      if (!jaTem && t.nome) t.aliases.push(t.nome);
    }
    t.nome = novo;
    commit();
  },
  // Define os sinônimos ("também conhecido como") de um tópico (sem duplicar o próprio nome).
  setAliasesTopico(id, aliases) {
    const t = state.topicos.find((x) => x.id === id);
    if (!t) return;
    const limpos = [];
    const vistos = new Set([t.nome.toLowerCase()]);
    for (const a of aliases || []) {
      const s = String(a || "").trim();
      const k = s.toLowerCase();
      if (s && !vistos.has(k)) { vistos.add(k); limpos.push(s); }
    }
    t.aliases = limpos;
    commit();
  },
  removerTopico(id) {
    state.topicos = state.topicos.filter((t) => t.id !== id);
    // Desvincula (não apaga) todo conteúdo que apontava para o tópico.
    for (const arr of ["documentos", "questoes", "flashcards", "indicacoes", "missoes", "resumos", "sessoes", "errosManuais", "rotinas", "mapasMentais"]) {
      state[arr].forEach((x) => {
        if (x.topicoId === id) x.topicoId = null;
      });
    }
    // Material multi-tópico (Fase 1) e aulas do cursinho (Fase 4): tira o id das listas.
    state.documentos.forEach((d) => {
      if (Array.isArray(d.topicoIds)) d.topicoIds = d.topicoIds.filter((x) => x !== id);
      if (d.topicoPaginas) delete d.topicoPaginas[id]; // Fase 6
    });
    state.aulas.forEach((a) => { if (Array.isArray(a.topicoIds)) a.topicoIds = a.topicoIds.filter((x) => x !== id); });
    // A revisão de tópico (curva do esquecimento) é por tópico: sem o tópico, não faz sentido.
    state.revisoesTopico = state.revisoesTopico.filter((r) => r.topicoId !== id);
    commit();
  },
  // Move um ou mais tópicos para outra disciplina (corrige erro de importação). Atualiza
  // também a referência DIRETA à disciplina no conteúdo vinculado.
  moverTopicos(topicoIds, novaDisciplinaId) {
    if (!state.disciplinas.some((d) => d.id === novaDisciplinaId)) return;
    const ids = new Set((topicoIds || []).filter(Boolean));
    if (!ids.size) return;
    state.topicos.forEach((t) => { if (ids.has(t.id)) t.disciplinaId = novaDisciplinaId; });
    for (const arr of ["questoes", "flashcards", "indicacoes", "errosManuais", "resumos"]) {
      state[arr].forEach((x) => { if (ids.has(x.topicoId)) x.disciplinaId = novaDisciplinaId; });
    }
    commit();
  },
  // Cria uma NOVA disciplina e move os tópicos selecionados para ela.
  criarDisciplinaDeTopicos(topicoIds, nome) {
    const ids = (topicoIds || []).filter(Boolean);
    if (!ids.length) return null;
    const d = this.addDisciplina(nome || "Nova disciplina", true);
    this.moverTopicos(ids, d.id); // já faz commit
    return d;
  },
  // Unifica dois tópicos: transfere TODO o conteúdo de `origemId` para `destinoId`,
  // junta os sinônimos e remove o de origem. (Não apaga conteúdo.)
  mesclarTopicos(origemId, destinoId) {
    if (!origemId || !destinoId || origemId === destinoId) return;
    const origem = state.topicos.find((x) => x.id === origemId);
    const destino = state.topicos.find((x) => x.id === destinoId);
    if (!origem || !destino) return;
    for (const arr of ["documentos", "questoes", "flashcards", "indicacoes", "missoes", "resumos", "sessoes", "errosManuais", "rotinas"]) {
      state[arr].forEach((x) => {
        if (x.topicoId === origemId) { x.topicoId = destinoId; if ("disciplinaId" in x) x.disciplinaId = destino.disciplinaId; }
      });
    }
    state.documentos.forEach((d) => {
      if (Array.isArray(d.topicoIds)) {
        d.topicoIds = [...new Set(d.topicoIds.map((x) => (x === origemId ? destinoId : x)))];
        d.topicoId = d.topicoIds[0] || d.topicoId;
      }
      if (d.topicoPaginas && d.topicoPaginas[origemId]) {
        if (!d.topicoPaginas[destinoId]) d.topicoPaginas[destinoId] = d.topicoPaginas[origemId];
        delete d.topicoPaginas[origemId];
      }
    });
    state.aulas.forEach((a) => { if (Array.isArray(a.topicoIds)) a.topicoIds = [...new Set(a.topicoIds.map((x) => (x === origemId ? destinoId : x)))]; });
    state.revisoesTopico.forEach((r) => { if (r.topicoId === origemId) r.topicoId = destinoId; });
    // Dedup das revisões (uma por tópico).
    const vistosRev = new Set();
    state.revisoesTopico = state.revisoesTopico.filter((r) => { if (vistosRev.has(r.topicoId)) return false; vistosRev.add(r.topicoId); return true; });
    // Junta sinônimos (nome + aliases do origem viram aliases do destino).
    if (!Array.isArray(destino.aliases)) destino.aliases = [];
    for (const a of [origem.nome, ...(origem.aliases || [])]) {
      const s = String(a || "").trim();
      if (s && s.toLowerCase() !== destino.nome.toLowerCase() && !destino.aliases.some((al) => al.toLowerCase() === s.toLowerCase())) destino.aliases.push(s);
    }
    state.topicos = state.topicos.filter((x) => x.id !== origemId);
    commit();
  },
  toggleDestaque(id) {
    const t = state.topicos.find((x) => x.id === id);
    if (t) {
      const ligar = !(t.peso > 0 || t.maisCai);
      if (ligar) {
        // Marca como relevante sem inventar percentual: "mais cai" (sem %).
        t.maisCai = true;
      } else {
        t.peso = 0;
        t.maisCai = false;
      }
      t.destaque = t.peso > 0 || t.maisCai;
      commit();
    }
  },
  // Define o nível de incidência (peso, 0–100) do tópico. Nível > 0 marca destaque.
  // (Atalho legado; o controle completo é setRelevancia.)
  setPesoTopico(id, peso) {
    this.setRelevancia(id, { peso, maisCai: false });
  },
  // Controle UNIFICADO da relevância de um tópico, sincronizado entre Edital e Dossiê.
  // Três estados: (a) Não definido (peso 0, maisCai false); (b) Mais cai SEM % (peso 0,
  // maisCai true) — tema relevante cujo percentual não veio; (c) faixa com % (peso > 0).
  // Um % conhecido implica "mais cai". destaque é derivado: relevante ⟺ peso>0 || maisCai.
  setRelevancia(id, { peso = 0, maisCai = false } = {}) {
    const t = state.topicos.find((x) => x.id === id);
    if (!t) return;
    t.peso = Math.max(0, Math.min(100, Math.round(peso) || 0));
    t.maisCai = t.peso > 0 ? true : !!maisCai;
    t.destaque = t.peso > 0 || t.maisCai;
    commit();
  },
  // Marca como destaque ("mais cai") os tópicos cujo nome casa com as linhas do texto
  // (ex.: extraído de um PDF de pontos de destaque). Retorna o que casou e o que não.
  marcarDestaquesPorTexto(texto) {
    const itens = ia.interpretarDestaques(texto); // [{nome, peso}]
    const marcados = [];
    const naoEncontrados = [];
    for (const item of itens) {
      const alvo = item.nome.toLowerCase();
      const match = state.topicos.find((t) => {
        const n = t.nome.toLowerCase();
        return n === alvo || n.includes(alvo) || alvo.includes(n);
      });
      if (match) {
        // Com % na lista, grava o percentual; SEM %, marca "mais cai" (sem inventar número).
        if (item.peso) match.peso = Math.max(match.peso || 0, item.peso);
        else match.maisCai = true;
        match.destaque = (match.peso || 0) > 0 || match.maisCai;
        if (!marcados.find((m) => m.nome === match.nome))
          marcados.push({ nome: match.nome, peso: match.peso || 0, maisCai: !!match.maisCai });
      } else {
        naoEncontrados.push(item.nome);
      }
    }
    // ordena os marcados por peso (mais importante primeiro)
    marcados.sort((a, b) => (b.peso || 0) - (a.peso || 0));
    commit();
    return { marcados, naoEncontrados };
  },
  // ---- Sugestão de RELEVÂNCIA ("temas que mais caem") — Fontes B (provas) e C (web) ----
  // São ESTIMATIVAS para o usuário CONFERIR e aplicar (o Mentor sugere, não aplica sozinho).
  // B: incidência real das suas provas importadas (a IA classifica cada questão num tópico).
  async sugerirRelevanciaPorProvas() {
    const qs = state.questoes.filter((q) => q.provaId && q.enunciado);
    if (!qs.length) return { fonte: "provas", total: 0, itens: [] };
    const enunciados = qs.slice(0, 250).map((q) => q.enunciado);
    const contagens = await iaProv.sugerirRelevanciaProvas(state.config, {
      questoes: enunciados,
      topicos: state.topicos.map((t) => t.nome),
      contexto: state.concurso ? `${state.concurso.banca || ""} ${state.concurso.cargo || ""}`.trim() : "concurso",
    });
    const total = enunciados.length;
    const itens = [];
    for (const c of contagens) {
      const t = this.acharTopicoPorNome(c.topico);
      const n = Math.max(0, Number(c.n) || 0);
      if (!t || !n) continue;
      itens.push({ topicoId: t.id, nome: t.nome, atual: t.peso || 0, pesoSugerido: Math.round((n / total) * 100), n });
    }
    itens.sort((a, b) => b.pesoSugerido - a.pesoSugerido);
    return { fonte: "provas", total, itens };
  },
  // C: "raio-x" da banca/cargo pesquisado na web (com fontes). Estimativa.
  async sugerirRelevanciaPelaWeb() {
    const c = state.concurso || {};
    const { sugestoes, fontesWeb, resumo } = await iaProv.sugerirRelevanciaWeb(state.config, {
      topicos: state.topicos.map((t) => t.nome),
      banca: c.banca,
      cargo: c.cargo,
    });
    const itens = [];
    for (const s of sugestoes) {
      const t = this.acharTopicoPorNome(s.topico);
      if (!t) continue;
      const rel = Math.max(0, Math.min(100, Number(s.relevancia) || 0));
      itens.push({ topicoId: t.id, nome: t.nome, atual: t.peso || 0, pesoSugerido: Math.round(rel), confianca: s.confianca || "media" });
    }
    itens.sort((a, b) => b.pesoSugerido - a.pesoSugerido);
    const alvo = [c.banca, c.cargo].filter(Boolean).join(" · ");
    return { fonte: "web", itens, fontesWeb: fontesWeb || [], resumo: resumo || "", alvo };
  },
  // Piso de casamento conforme o TAMANHO do tema. A nota é interseção/menor conjunto, e os itens
  // do edital são enumerações longas ("(8) Normas Constitucionais: Hermenêutica e Filosofia…"):
  // com tema de 1-2 palavras, UMA palavra em comum já dá 0,5 e passaria no piso normal de 0,34 —
  // foi assim que "Organização dos Poderes" caiu em "Normas Constitucionais". Tema curto, então,
  // só casa se o tópico contiver TODAS as suas palavras.
  // D: material de "raio-x da banca" que você importou (ex.: o Estudo Estratégico do cursinho),
  // com a fatia de cada tema por disciplina. Diferente de B e C, NÃO usa IA: o material já traz
  // os números, o trabalho é casar tema↔tópico do edital e traduzir percentual em nível.
  //
  // Dois cuidados que a experiência com a biblioteca já ensinou:
  // 1. O casamento é o `acharTopicoDoBloco`, com a DISCIPLINA como âncora — o `acharTopicoPorNome`
  //    casa por "contém" no edital inteiro e põe "Administração Pública" (Constitucional) dentro
  //    de "crimes contra a administração pública" (Penal). Disciplina que não existe no seu
  //    edital é reportada e ignorada, não empurrada para qualquer lugar.
  // 2. O percentual é fatia DA DISCIPLINA, não relevância absoluta: 21% pode ser o tema mais
  //    cobrado de Constitucional enquanto 31% é o de Tributário. Traduzir direto jogaria tudo
  //    para "Baixa". Por isso a conversão é pelo ACUMULADO, do jeito que o próprio material lê os
  //    números ("quatro temas respondem por mais da metade"): os temas que somam os primeiros
  //    50% são Altíssima, até 75% Alta, até 90% Média, o rabo é Baixa.
  async sugerirRelevanciaPorMaterial(docId) {
    await this.exigirConteudoDoc(docId); // sem o texto do material isto seria um palpite
    const doc = state.documentos.find((d) => d.id === docId);
    if (!doc) return { fonte: "material", itens: [], naoEncontrados: [], disciplinasIgnoradas: [], titulo: "" };
    const secoes = ia.interpretarIncidenciaPorDisciplina(doc.texto || "");
    const itens = [];
    const naoEncontrados = [];
    const disciplinasIgnoradas = [];
    const usados = new Set();
    for (const sec of secoes) {
      // Disciplina do material que não é disciplina do SEU edital (o caso da Legislação Penal
      // Especial, que no edital do TJSP mora como tópicos dentro de outras matérias) não é motivo
      // para jogar a seção fora: sem a âncora, cada tema é procurado no edital inteiro — e aí o
      // piso vale ainda mais, porque não há disciplina para segurar um casamento solto.
      const disciplinaId = disciplinaDoMaterial(sec.disciplina, state.disciplinas || []);
      if (!disciplinaId) disciplinasIgnoradas.push(sec.disciplina);
      let acumulado = 0;
      for (const t of sec.temas) {
        acumulado += t.pct;
        const peso = acumulado <= 50 ? 95 : acumulado <= 75 ? 70 : acumulado <= 90 ? 40 : 15;
        const porLei = topicoPorNumeroDeLei(t.tema, state.topicos);
        const r =
          porLei !== undefined
            ? porLei
            : acharTopicoDoBloco(t.tema, { topicos: state.topicos, disciplinas: state.disciplinas, disciplinaId, minMesma: pisoDeTema(t.tema) });
        if (!r) { naoEncontrados.push(`${sec.disciplina}: ${t.tema} — ${String(t.pct).replace(".", ",")}%`); continue; }
        // Vários temas podem cair no mesmo tópico do edital: fica o maior nível.
        const jaTem = itens.find((x) => x.topicoId === r.topicoId);
        if (jaTem) { if (peso > jaTem.pesoSugerido) { jaTem.pesoSugerido = peso; jaTem.pct = t.pct; jaTem.tema = t.tema; } continue; }
        const top = state.topicos.find((x) => x.id === r.topicoId);
        usados.add(r.topicoId);
        itens.push({ topicoId: r.topicoId, nome: top ? top.nome : t.tema, tema: t.tema, disciplina: sec.disciplina, pct: t.pct, atual: top ? top.peso || 0 : 0, pesoSugerido: peso });
      }
    }
    itens.sort((a, b) => b.pesoSugerido - a.pesoSugerido || b.pct - a.pct);
    return { fonte: "material", titulo: doc.titulo, itens, naoEncontrados, disciplinasIgnoradas, disciplinas: secoes.length, semDisciplina: disciplinasIgnoradas.length };
  },
  // Materiais que TÊM estatística de incidência dentro (para a tela oferecer a opção).
  materiaisComIncidencia() {
    return (state.documentos || [])
      .map((d) => ({ id: d.id, titulo: d.titulo, n: ia.interpretarIncidenciaPorDisciplina(d.texto || "").length }))
      .filter((x) => x.n >= 2);
  },
  // Aplica as relevâncias escolhidas (marca "mais cai" com o peso sugerido).
  aplicarRelevanciaSugerida(itens) {
    let n = 0;
    for (const it of itens || []) {
      if (state.topicos.find((x) => x.id === it.topicoId)) {
        this.setRelevancia(it.topicoId, { peso: it.peso, maisCai: true });
        n++;
      }
    }
    return n;
  },
  // ---- Fase 3: edital OFICIAL como checklist + cobertura dupla ----
  // Define o checklist oficial a partir da estrutura parseada (separarEdital): cada
  // tópico vira um item {ref, disciplina}. A correspondência com SEUS tópicos é por
  // nome + aliases (acharTopicoPorNome) — então resolver uma lacuna = ter o tópico (ou alias).
  definirEditalOficial(estrutura) {
    const itens = [];
    for (const disc of estrutura || []) {
      for (const top of disc.topicos || []) {
        const ref = String(top || "").trim();
        if (ref) itens.push({ id: uid("eo"), ref, disciplina: (disc.nome || "").trim(), ignorado: false });
      }
    }
    state.editalOficial = { conferidoEm: nowISO(), itens };
    commit();
    return itens.length;
  },
  limparEditalOficial() {
    state.editalOficial = { conferidoEm: null, itens: [] };
    commit();
  },
  ignorarItemOficial(itemId, ignorado) {
    const it = (state.editalOficial.itens || []).find((x) => x.id === itemId);
    if (it) { it.ignorado = !!ignorado; commit(); }
  },
  // Vincula um item oficial a um tópico SEU: adiciona o nome oficial como ALIAS do tópico
  // (é o "mapa" pelo alias; daí o casamento passa a achar e a lacuna some).
  vincularItemOficialATopico(itemId, topicoId) {
    const it = (state.editalOficial.itens || []).find((x) => x.id === itemId);
    const t = state.topicos.find((x) => x.id === topicoId);
    if (!it || !t) return;
    if (!Array.isArray(t.aliases)) t.aliases = [];
    if (it.ref && t.nome.toLowerCase() !== it.ref.toLowerCase() && !t.aliases.some((a) => a.toLowerCase() === it.ref.toLowerCase())) {
      t.aliases.push(it.ref);
    }
    commit();
  },
  // Cria tópicos (no edital do usuário) para as lacunas informadas, agrupados por disciplina.
  criarTopicosParaLacunas(lacunas) {
    const porDisc = new Map();
    for (const l of lacunas || []) {
      const d = l.disciplina || "Geral";
      if (!porDisc.has(d)) porDisc.set(d, []);
      porDisc.get(d).push(l.ref);
    }
    const estrutura = [...porDisc.entries()].map(([nome, topicos]) => ({ nome, topicos }));
    return this.aplicarEdital(estrutura, "pular");
  },
  // Relatório de cobertura do edital OFICIAL: cobertos · lacunas · extras.
  coberturaOficial() {
    const eo = state.editalOficial;
    if (!eo || !eo.itens.length) return null;
    const ativos = eo.itens.filter((i) => !i.ignorado);
    // Fase 7: cada item casa com TODOS os tópicos correspondentes (não só o 1º) — assim um
    // item dividido em vários tópicos (split) não infla os "extras".
    const comTopicos = ativos.map((i) => ({ ...i, topicos: this.acharTodosTopicosPorNome(i.ref) }));
    const cobertos = comTopicos.filter((i) => i.topicos.length);
    const lacunas = comTopicos.filter((i) => !i.topicos.length);
    const idsCobertos = new Set(cobertos.flatMap((i) => i.topicos.map((t) => t.id)));
    const extras = state.topicos.filter((t) => !idsCobertos.has(t.id));
    const multi = cobertos.filter((i) => i.topicos.length > 1).length; // itens divididos em N tópicos
    return {
      total: ativos.length,
      cobertos: cobertos.length,
      pct: ativos.length ? Math.round((cobertos.length / ativos.length) * 100) : 0,
      lacunas,
      extras,
      multi,
      ignorados: eo.itens.filter((i) => i.ignorado).length,
      conferidoEm: eo.conferidoEm,
    };
  },
  // ---- Fase 5: re-reconciliação do edital oficial (edital retificado) — DIFF ----
  // Compara a nova estrutura colada com o checklist atual e devolve o que mudou, sugerindo
  // RENOMEAÇÕES (par removido↔novo parecido) para preservar o vínculo (vira alias). Não aplica.
  diffEditalOficial(estrutura) {
    const norm = (s) => String(s || "").toLowerCase().replace(/[^\wçãõáéíóúâêôà]/gi, "");
    const flat = [];
    for (const disc of estrutura || []) {
      for (const top of disc.topicos || []) {
        const ref = String(top || "").trim();
        if (ref) flat.push({ ref, disciplina: (disc.nome || "").trim() });
      }
    }
    const atuais = state.editalOficial.itens || [];
    const setNovo = new Set(flat.map((i) => norm(i.ref)));
    const setAtual = new Set(atuais.map((i) => norm(i.ref)));
    const novos = flat.filter((i) => !setAtual.has(norm(i.ref)));
    const removidos = atuais.filter((i) => !setNovo.has(norm(i.ref)));
    const mantidos = flat.length - novos.length;
    // Renomeação sugerida: removido↔novo com alta sobreposição de PALAVRAS (Jaccard ≥ 0,5).
    // Tokeniza da string original; mantém NÚMEROS (ex.: "art. 5" ≠ "art. 37") e palavras ≥3 letras.
    const toks = (s) => new Set((String(s || "").toLowerCase().match(/[a-zçãõáéíóúâêôà0-9]+/g) || []).filter((w) => /\d/.test(w) || w.length >= 3));
    const sim = (a, b) => {
      const ta = toks(a), tb = toks(b);
      if (!ta.size || !tb.size) return 0;
      const inter = [...ta].filter((x) => tb.has(x)).length;
      return inter / new Set([...ta, ...tb]).size;
    };
    const renomeacoes = [];
    const usados = new Set();
    for (const r of removidos) {
      let best = null, bs = 0;
      for (const n of novos) {
        if (usados.has(n.ref)) continue;
        const s = sim(r.ref, n.ref);
        if (s > bs) { bs = s; best = n; }
      }
      if (best && bs >= 0.5) {
        usados.add(best.ref);
        const t = this.acharTopicoPorNome(r.ref);
        renomeacoes.push({ de: r.ref, para: best.ref, topicoId: t ? t.id : null });
      }
    }
    return { novos, removidos, mantidos, renomeacoes, novosItens: flat };
  },
  // Aplica o diff: confirma renomeações (novo nome vira ALIAS do tópico que tinha o antigo,
  // preservando a cobertura) e substitui o checklist pela nova lista.
  aplicarEditalOficialDiff(novosItens, renomeacoes) {
    for (const rn of renomeacoes || []) {
      if (!rn.topicoId) continue;
      const t = state.topicos.find((x) => x.id === rn.topicoId);
      if (t) {
        if (!Array.isArray(t.aliases)) t.aliases = [];
        if (rn.para && t.nome.toLowerCase() !== rn.para.toLowerCase() && !t.aliases.some((a) => a.toLowerCase() === rn.para.toLowerCase())) {
          t.aliases.push(rn.para);
        }
      }
    }
    state.editalOficial = {
      conferidoEm: nowISO(),
      itens: (novosItens || []).map((i) => ({ id: uid("eo"), ref: i.ref, disciplina: i.disciplina, ignorado: false })),
    };
    commit();
    return state.editalOficial.itens.length;
  },
  // ---- Fase 4: divisão didática do cursinho (aulas) ----
  // Estrutura o EDITAL por IA (formatos bagunçados: OCR, 2 colunas, numerado). Devolve
  // [{nome, topicos:[]}] no mesmo formato do separarEdital, para alimentar o preview editável.
  async estruturarEditalIA(texto) {
    if (!this.iaDisponivel()) return null;
    const ds = await iaProv.estruturarEditalIA(state.config, { texto: texto || "" });
    return (ds || []).map((d) => ({ nome: d.nome || "", topicos: [...(d.topicos || [])] }));
  },
  // Importa um EDITAL direto do PDF pela Visão (1 chamada: OCR + estrutura). Devolve
  // [{nome, topicos:[]}] como o separarEdital/estruturarEditalIA, p/ alimentar o preview.
  async estruturarEditalDePDF(dataB64, mimeType = "application/pdf") {
    const ds = await iaProv.estruturarEditalDePDF(state.config, { dataB64, mimeType });
    return (ds || []).map((d) => ({ nome: d.nome || "", topicos: [...(d.topicos || [])] }));
  },
  // Importa o PLANO DO CURSINHO direto do PDF pela Visão (1 chamada). Devolve no formato do
  // parseAulas/importarAulasCursinho: [{nome, topicos:[]=assuntos, disciplina}].
  async estruturarAulasDePDF(dataB64, mimeType = "application/pdf") {
    const aulas = await iaProv.estruturarAulasDePDF(state.config, { dataB64, mimeType });
    return (aulas || []).map((a) => ({ nome: a.nome || "", topicos: [...(a.assuntos || [])], disciplina: a.disciplina || null }));
  },
  // Importa a estrutura parseada (separarEdital): cada "disciplina" = uma AULA; seus itens
  // são os tópicos que ela cobre (casados por nome+aliases). Reporta os que não casaram.
  importarAulasCursinho(estrutura) {
    const itens = (estrutura || []).filter((i) => (i.nome || "").trim());
    const discIds = this._disciplinasDoPlano(itens);
    const declarouAlgum = itens.some((i) => String(i.disciplina || "").trim());
    let criadas = 0;
    const naoCasados = [];
    itens.forEach((item, k) => {
      const disciplinaId = discIds[k];
      const d = disciplinaId ? state.disciplinas.find((x) => x.id === disciplinaId) : null;
      // Disciplina declarada e ausente do edital: a aula entra no plano, sem vínculo nenhum.
      const foraDoEdital = declarouAlgum && !disciplinaId;
      const topicoIds = [];
      for (const tn of item.topicos || []) {
        const t = foraDoEdital ? null : this.acharTopicoPorNome(tn, { disciplinaId, restrito: !!disciplinaId });
        if (t) { if (!topicoIds.includes(t.id)) topicoIds.push(t.id); }
        else naoCasados.push(tn);
      }
      state.aulas.push({ id: uid("aula"), nome: (item.nome || "").trim(), topicoIds, disciplinaId, disciplinaNome: item.disciplina || (d ? d.nome : null), assuntos: item.topicos || [] });
      criadas++;
    });
    commit();
    // Plano que não declarou disciplina teve a sua DEDUZIDA: quem importou precisa saber qual,
    // porque é ela que limitou o casamento — e a correção é um campo de texto no preview.
    const declarou = itens.some((i) => (i.disciplina || "").trim());
    const nomes = [...new Set(discIds.filter(Boolean).map((id) => (state.disciplinas.find((x) => x.id === id) || {}).nome).filter(Boolean))];
    return { criadas, naoCasados, deduzida: !declarou && nomes.length === 1 ? nomes[0] : null };
  },
  // A disciplina de CADA item do plano importado, na ordem em que veio — é ela que limita o
  // casamento dos assuntos com os tópicos do edital. Três fontes, nesta ordem:
  //   1. a disciplina declarada no próprio item (cabeçalho "DISCIPLINA: ...", campo do preview);
  //   2. a sequência do plano: item sem disciplina herda a do bloco em que está (a aula 00 é
  //      introdutória e abre o bloco seguinte, por isso a herança olha primeiro para frente);
  //   3. plano inteiro sem disciplina nenhuma (curso de matéria só, em que a IA devolve o campo
  //      vazio de propósito): deduz a disciplina DOMINANTE pelo voto dos assuntos e a aplica a
  //      todos — melhor um contexto único deduzido do que casar cada assunto no edital inteiro.
  _disciplinasDoPlano(itens) {
    const resolver = (nome) => {
      const dn = String(nome || "").trim().toLowerCase();
      if (!dn) return null;
      const d = state.disciplinas.find((x) => (x.nome || "").toLowerCase() === dn)
        || state.disciplinas.find((x) => { const xn = (x.nome || "").toLowerCase(); return xn && (xn.includes(dn) || dn.includes(xn)); });
      return d ? d.id : null;
    };
    // Disciplina DECLARADA que não existe no edital ("Outra", no preview) é resposta, não lacuna:
    // o curso é de matéria que o usuário não vai cobrar aqui, então não se vincula nada — e muito
    // menos se deixa a dedução por voto empurrá-lo para dentro de alguma disciplina existente.
    const declarou = itens.some((i) => String(i.disciplina || "").trim());
    const ids = itens.map((i) => resolver(i.disciplina));
    let prox = null;
    for (let i = ids.length - 1; i >= 0; i--) { if (ids[i]) prox = ids[i]; else ids[i] = prox; }
    let ant = null;
    for (let i = 0; i < ids.length; i++) { if (ids[i]) ant = ids[i]; else ids[i] = ant; }
    if (declarou) return ids;
    // Só vota o assunto INEQUÍVOCO — o que casa numa disciplina só. "Prescrição" existe em Penal,
    // Civil e Administrativo: como prova de contexto não vale nada, e num empate era ela quem
    // decidia, pela ordem do array. "Contratos", que só existe em Civil, é que diz de onde é o plano.
    const voto = new Map();
    for (const i of itens) {
      for (const tn of i.topicos || []) {
        const dids = [...new Set(this.acharTodosTopicosPorNome(tn).map((t) => t.disciplinaId).filter(Boolean))];
        if (dids.length === 1) voto.set(dids[0], (voto.get(dids[0]) || 0) + 1);
      }
    }
    const vencedor = [...voto.entries()].sort((a, b) => b[1] - a[1])[0];
    return ids.map(() => (vencedor ? vencedor[0] : null));
  },
  // Casa, via IA, os ASSUNTOS das aulas do cursinho ainda sem tópico com os TÓPICOS do edital
  // (vira sinônimo do tópico + vincula a aula). Retorna { casados, total }.
  // Uma chamada POR DISCIPLINA, levando só os tópicos dela: assim a IA não tem como casar um
  // assunto de Penal num tópico de Civil — antes ela recebia o edital inteiro e o filtro vinha
  // depois, tarde demais para o sinônimo que já havia sido gravado no tópico errado.
  async compatibilizarCursinhoComEdital() {
    const regua = this.disciplinaDePlano();
    const grupos = new Map(); // disciplinaId (ou "") -> Map(assunto em minúsculas -> texto)
    for (const a of state.aulas) {
      // A disciplina é a da RÉGUA (a mesma que a tela mostra), não só o campo da aula: assim a
      // aula antiga, importada sem disciplina, também entra restrita. Aula de disciplina fora do
      // edital não tem tópico a casar, e casar no edital inteiro seria o vazamento de volta.
      const d = regua.get(a.id);
      if (d && !d.id) continue;
      const discId = d ? d.id : null;
      const chave = discId || "";
      for (const asn of a.assuntos || []) {
        const txt = (asn || "").trim();
        if (!txt || this.acharTopicoPorNome(txt, { disciplinaId: discId, restrito: !!discId })) continue;
        if (!grupos.has(chave)) grupos.set(chave, new Map());
        grupos.get(chave).set(txt.toLowerCase(), txt);
      }
    }
    let casados = 0;
    let total = 0;
    for (const [discId, mapa] of grupos) {
      const itens = [...mapa.values()].map((assunto) => ({ assunto }));
      total += itens.length;
      const escopo = discId ? state.topicos.filter((t) => t.disciplinaId === discId) : state.topicos;
      if (!itens.length || !escopo.length) continue;
      const topicos = escopo.map((t) => ({ nome: t.nome, aliases: t.aliases || [] }));
      const matches = await iaProv.compatibilizarAulasTopicos(state.config, { itens, topicos });
      for (const m of matches || []) {
        if (!m || !m.assunto || !m.topicoNome) continue;
        const t = escopo.find((x) => x.nome === m.topicoNome)
          || this.acharTopicoPorNome(m.topicoNome, { disciplinaId: discId || undefined, restrito: !!discId });
        if (!t || (discId && t.disciplinaId !== discId)) continue;
        let aplicou = false;
        for (const a of state.aulas) {
          const da = regua.get(a.id);
          if (((da && da.id) || "") !== discId) continue;
          if (!(a.assuntos || []).some((asn) => (asn || "").toLowerCase() === m.assunto.toLowerCase())) continue;
          if (!Array.isArray(a.topicoIds)) a.topicoIds = [];
          if (!a.topicoIds.includes(t.id)) a.topicoIds.push(t.id);
          if (!a.disciplinaId) a.disciplinaId = t.disciplinaId;
          aplicou = true;
        }
        if (!aplicou) continue;
        // O sinônimo só entra no tópico quando o casamento foi de fato aplicado: alias gravado
        // à toa contamina o acharTopicoPorNome de toda importação seguinte.
        if (!Array.isArray(t.aliases)) t.aliases = [];
        if (!t.aliases.some((al) => al.toLowerCase() === m.assunto.toLowerCase())) t.aliases.push(m.assunto);
        casados++;
      }
    }
    commit();
    return { casados, total };
  },
  // A disciplina em que cada aula do plano APARECE — régua única, usada pela tela do Plano do
  // cursinho, pela compatibilização com IA e pela correção de vínculos. Map(aulaId -> {id, nome}),
  // com `id` nulo quando a disciplina não está no edital (curso trazido como "Outra"). A aula sem
  // disciplina própria herda a da sequência: primeiro da seguinte (a 00 abre o bloco), depois da
  // anterior (aula de revisão no fim do bloco).
  // Régua única (a implementação mora em ciclo.js, junto da ordem de estudo, para que a tela e o
  // Hoje não possam divergir). `herdar: false` = só a disciplina que a própria aula declara.
  disciplinaDePlano(opts) {
    return ciclo.disciplinaDePlanoDe(state, opts);
  },
  // O plano na ordem em que se estuda: disciplinas na ordem de aparição, aulas pelo número.
  aulasEmOrdem() {
    return ciclo.aulasEmOrdem(state);
  },
  // Cursos do cursinho que NÃO são disciplina do edital ("Legislação Penal Especial", "Direitos
  // Difusos e Coletivos"). Sem uma disciplina do edital por trás não há régua: os vínculos dessas
  // aulas nunca são conferidos, e é por aí que sobra vínculo cruzado depois da revisão. Devolve
  // a distribuição dos vínculos por disciplina para o usuário decidir com número à vista.
  cursosDoPlanoNaoMapeados() {
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    const resolve = (nome) => {
      const dn = norm(nome);
      if (!dn) return null;
      return state.disciplinas.find((x) => norm(x.nome) === dn)
        || state.disciplinas.find((x) => { const xn = norm(x.nome); return xn && (xn.includes(dn) || dn.includes(xn)); }) || null;
    };
    const transversais = new Set((state.config.cursosTransversais || []).map(norm));
    const mapa = new Map();
    for (const a of state.aulas) {
      if ((a.disciplinaNome || "").trim()) continue; // já tem disciplina declarada
      const m = String(a.nome || "").match(/^(.+?)\s[-–—]\s*aula\s*\d/i);
      if (!m) continue;
      const pref = m[1].trim();
      if (resolve(pref) || transversais.has(norm(pref))) continue;
      if (!mapa.has(pref)) mapa.set(pref, { curso: pref, aulas: 0, vinculos: 0, porDisciplina: new Map() });
      const c = mapa.get(pref);
      c.aulas++;
      for (const id of a.topicoIds || []) {
        const t = state.topicos.find((x) => x.id === id);
        if (!t || !t.disciplinaId) continue;
        c.vinculos++;
        c.porDisciplina.set(t.disciplinaId, (c.porDisciplina.get(t.disciplinaId) || 0) + 1);
      }
    }
    return [...mapa.values()]
      .map((c) => ({
        curso: c.curso,
        aulas: c.aulas,
        vinculos: c.vinculos,
        porDisciplina: [...c.porDisciplina.entries()]
          .map(([id, n]) => ({ id, nome: (state.disciplinas.find((d) => d.id === id) || {}).nome || "—", n }))
          .sort((x, y) => y.n - x.n),
      }))
      .sort((x, y) => y.aulas - x.aulas);
  },
  // Liga um curso do cursinho a uma disciplina do edital (todas as aulas com aquele prefixo), ou
  // marca-o como TRANSVERSAL — que é resposta legítima: "Difusos e Coletivos" cobre mesmo tópicos
  // de sete matérias, e forçá-lo a uma só apagaria vínculos corretos na revisão.
  mapearCursoDoPlano(curso, disciplinaId) {
    const pref = String(curso || "").trim();
    if (!pref) return 0;
    const alvo = pref.toLowerCase();
    if (!disciplinaId) {
      if (!Array.isArray(state.config.cursosTransversais)) state.config.cursosTransversais = [];
      if (!state.config.cursosTransversais.some((x) => String(x).toLowerCase() === alvo)) state.config.cursosTransversais.push(pref);
      commit();
      return 0;
    }
    const d = state.disciplinas.find((x) => x.id === disciplinaId);
    if (!d) return 0;
    let n = 0;
    for (const a of state.aulas) {
      const m = String(a.nome || "").match(/^(.+?)\s[-–—]\s*aula\s*\d/i);
      if (!m || m[1].trim().toLowerCase() !== alvo) continue;
      a.disciplinaId = d.id;
      a.disciplinaNome = d.nome;
      n++;
    }
    if (n) commit();
    return n;
  },
  // Vínculos que apontam para FORA da disciplina em que a aula aparece. É o estrago das
  // importações antigas, que casavam o assunto no edital inteiro — e que a compatibilização com
  // IA não desfaz, porque ela só acrescenta vínculo e nunca revisita assunto que já casou.
  vinculosForaDaDisciplina() {
    const mapa = this.disciplinaDePlano({ herdar: false });
    const fora = [];
    for (const a of state.aulas) {
      const d = mapa.get(a.id);
      if (!d || !d.id) continue; // sem disciplina PRÓPRIA não há régua segura: não se mexe
      for (const tid of a.topicoIds || []) {
        const t = state.topicos.find((x) => x.id === tid);
        if (!t || t.disciplinaId === d.id) continue;
        const dt = state.disciplinas.find((x) => x.id === t.disciplinaId);
        fora.push({ aulaId: a.id, aulaNome: a.nome, disciplina: d.nome, topicoId: tid, topicoNome: t.nome, topicoDisciplina: dt ? dt.nome : "—" });
      }
    }
    return fora;
  },
  // Remove os vínculos de fora e recasa os assuntos DENTRO da disciplina da aula. Só mexe em aula
  // com disciplina conhecida, e só tira vínculo que cruza disciplina — o que está na disciplina
  // certa fica, inclusive o que o usuário ligou à mão.
  corrigirVinculosDoPlano() {
    const fora = this.vinculosForaDaDisciplina();
    if (!fora.length) return { removidos: 0, recasados: 0, aulas: 0 };
    const mapa = this.disciplinaDePlano({ herdar: false });
    const porAula = new Map();
    for (const f of fora) {
      if (!porAula.has(f.aulaId)) porAula.set(f.aulaId, new Set());
      porAula.get(f.aulaId).add(f.topicoId);
    }
    let removidos = 0;
    let recasados = 0;
    const antes = []; // fotografia para o desfazer
    for (const [aulaId, tids] of porAula) {
      const a = state.aulas.find((x) => x.id === aulaId);
      const d = mapa.get(aulaId);
      if (!a || !d || !d.id) continue;
      antes.push({ id: a.id, topicoIds: [...(a.topicoIds || [])], disciplinaId: a.disciplinaId, disciplinaNome: a.disciplinaNome });
      a.topicoIds = (a.topicoIds || []).filter((id) => !tids.has(id));
      removidos += tids.size;
      if (!a.disciplinaId) a.disciplinaId = d.id; // grava a régua que a tela já mostrava
      for (const asn of a.assuntos || []) {
        const t = this.acharTopicoPorNome(asn, { disciplinaId: d.id, restrito: true });
        if (t && !a.topicoIds.includes(t.id)) { a.topicoIds.push(t.id); recasados++; }
      }
    }
    commit();
    return { removidos, recasados, aulas: porAula.size, antes };
  },
  // Desfaz a correção, devolvendo vínculos e disciplina exatamente como estavam.
  restaurarVinculosDoPlano(antes) {
    let n = 0;
    for (const snap of antes || []) {
      const a = state.aulas.find((x) => x.id === snap.id);
      if (!a) continue;
      a.topicoIds = [...(snap.topicoIds || [])];
      a.disciplinaId = snap.disciplinaId;
      a.disciplinaNome = snap.disciplinaNome;
      n++;
    }
    if (n) commit();
    return n;
  },
  addAula(nome, disciplinaId = null) {
    const d = disciplinaId ? state.disciplinas.find((x) => x.id === disciplinaId) : null;
    state.aulas.push({ id: uid("aula"), nome: (nome || "").trim() || "Nova aula", topicoIds: [], disciplinaId: d ? d.id : null, disciplinaNome: d ? d.nome : null });
    commit();
  },
  // Define a disciplina da aula à mão. É o que destrava a revisão de vínculos numa aula legada
  // com vínculos de várias disciplinas: sem disciplina própria, não há régua para corrigir nada.
  setAulaDisciplina(id, disciplinaId) {
    const a = state.aulas.find((x) => x.id === id);
    if (!a) return;
    const d = disciplinaId ? state.disciplinas.find((x) => x.id === disciplinaId) : null;
    a.disciplinaId = d ? d.id : null;
    a.disciplinaNome = d ? d.nome : null;
    commit();
  },
  renomearAula(id, nome) {
    const a = state.aulas.find((x) => x.id === id);
    if (a) { a.nome = (nome || "").trim() || a.nome; commit(); }
  },
  setAulaTopicos(id, topicoIds) {
    const a = state.aulas.find((x) => x.id === id);
    if (a) { a.topicoIds = (topicoIds || []).filter(Boolean); commit(); }
  },
  removerAula(id) {
    state.aulas = state.aulas.filter((x) => x.id !== id);
    commit();
  },
  // Sem reordenar aula à mão (arrastar/subir/descer, removidos em 19/08/2026): a ordem do plano é
  // derivada do NÚMERO da aula dentro da disciplina (ciclo.aulasEmOrdem). Mover à mão só criava a
  // chance de a ordem guardada — que é a ordem de estudo — divergir do que a tela mostra.
  limparAulas() {
    state.aulas = [];
    commit();
  },
  // Tópicos que não estão em NENHUMA aula (ficaram de fora da divisão do cursinho).
  topicosSoltos() {
    const usados = new Set();
    state.aulas.forEach((a) => (a.topicoIds || []).forEach((t) => usados.add(t)));
    return state.topicos.filter((t) => !usados.has(t.id));
  },
  setBaseEstudo(v) {
    state.config.baseEstudo = v === "cursinho" ? "cursinho" : "edital";
    commit();
  },
  // Refino: re-reconciliação das AULAS (grade nova do cursinho) — diff por NOME de aula, com
  // renomeações por similaridade. NÃO mexe nas aulas mantidas (preserva a curadoria do usuário).
  diffAulasCursinho(estrutura) {
    const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    // A identidade da aula é DISCIPLINA + NOME. Só o nome fazia a "Aula 00" de Penal e a de Civil
    // serem a mesma aula: num plano de várias disciplinas, uma delas sumia do diff em silêncio.
    const regua = this.disciplinaDePlano();
    const chaveAula = (a) => { const d = regua.get(a.id); return norm((d && d.nome) || "") + "§" + norm(a.nome); };
    const chaveNova = (e) => norm(e.disciplina || "") + "§" + norm(e.nome);
    const novasTodas = (estrutura || []).map((e) => ({ nome: (e.nome || "").trim(), topicos: e.topicos || [], disciplina: e.disciplina || null, _n: chaveNova(e) })).filter((e) => e.nome);
    const setNovo = new Set(novasTodas.map((e) => e._n));
    const setAtual = new Set(state.aulas.map(chaveAula));
    const novas = novasTodas.filter((e) => !setAtual.has(e._n));
    const removidas = state.aulas.filter((a) => !setNovo.has(chaveAula(a)));
    // Tokens: mantém NÚMEROS (ex.: "Aula 1" ≠ "Aula 4") e palavras ≥3 letras (ignora "de","e").
    const toks = (s) => new Set((String(s || "").toLowerCase().match(/[a-zçãõáéíóúâêôà0-9]+/g) || []).filter((w) => /\d/.test(w) || w.length >= 3));
    const sim = (a, b) => {
      const ta = toks(a), tb = toks(b);
      if (!ta.size || !tb.size) return 0;
      const inter = [...ta].filter((x) => tb.has(x)).length;
      return inter / new Set([...ta, ...tb]).size;
    };
    const renomeacoes = [];
    const usados = new Set();
    for (const r of removidas) {
      let best = null, bs = 0;
      for (const n of novas) {
        if (usados.has(n._n)) continue;
        const s = sim(r.nome, n.nome);
        if (s > bs) { bs = s; best = n; }
      }
      if (best && bs >= 0.5) { usados.add(best._n); renomeacoes.push({ aulaId: r.id, de: r.nome, para: best.nome, paraChave: best._n }); }
    }
    return { novas, removidas, renomeacoes };
  },
  aplicarAulasDiff(diff, renomearIds, removerIds) {
    const renIds = new Set(renomearIds || []);
    const remIds = new Set(removerIds || []);
    // Chave disciplina+nome, não só o nome: renomear uma "Aula 00" não pode cancelar a criação
    // da "Aula 00" de outra disciplina.
    const renAlvos = new Set();
    for (const rn of diff.renomeacoes || []) {
      if (!renIds.has(rn.aulaId)) continue;
      const a = state.aulas.find((x) => x.id === rn.aulaId);
      if (a) { a.nome = rn.para; renAlvos.add(rn.paraChave || rn.para.toLowerCase()); }
    }
    let add = 0;
    const novas = diff.novas || [];
    const discIds = this._disciplinasDoPlano(novas);
    const declarouAlgum = novas.some((e) => String(e.disciplina || "").trim());
    novas.forEach((e, k) => {
      if (renAlvos.has(e._n)) return; // já virou rename de uma existente
      const disciplinaId = discIds[k];
      const d = disciplinaId ? state.disciplinas.find((x) => x.id === disciplinaId) : null;
      const foraDoEdital = declarouAlgum && !disciplinaId;
      const topicoIds = [];
      for (const tn of e.topicos || []) { const t = foraDoEdital ? null : this.acharTopicoPorNome(tn, { disciplinaId, restrito: !!disciplinaId }); if (t && !topicoIds.includes(t.id)) topicoIds.push(t.id); }
      state.aulas.push({ id: uid("aula"), nome: e.nome, topicoIds, disciplinaId, disciplinaNome: e.disciplina || (d ? d.nome : null), assuntos: e.topicos || [] });
      add++;
    });
    let rem = 0;
    for (const a of diff.removidas || []) {
      if (renIds.has(a.id)) continue; // foi renomeada, não remove
      if (!remIds.has(a.id)) continue;
      state.aulas = state.aulas.filter((x) => x.id !== a.id);
      rem++;
    }
    commit();
    return { add, rem, ren: renAlvos.size };
  },
  togglePrevisao(id) {
    const t = state.topicos.find((x) => x.id === id);
    if (t) {
      t.previsaoAula = !t.previsaoAula;
      commit();
    }
  },
  // Marca/desmarca o tópico como concluído (já estudado). Não apaga nada.
  toggleTopicoConcluido(id) {
    const t = state.topicos.find((x) => x.id === id);
    if (t) {
      t.concluido = !t.concluido;
      commit();
    }
  },

  // ---------- documentos ----------
  addDocumento({ topicoId, topicoIds, titulo, texto, origem, pdfData, paginas, imgData, estrutura, disciplinaId, cursoNome, semDisciplina }) {
    const tops = Array.isArray(topicoIds) ? topicoIds.filter(Boolean) : topicoId ? [topicoId] : [];
    const doc = {
      id: uid("doc"),
      topicoIds: tops,
      topicoId: tops[0] || null, // primário (legado/compat e contexto de geração)
      // A DISCIPLINA é do material, não uma dedução dos vínculos: é ela que agrupa a lista,
      // organiza os seletores (com centenas de aulas, procurar por nome não se sustenta) e
      // limita o casamento bloco↔tópico. Vem da importação e o usuário pode trocar no cartão.
      disciplinaId: disciplinaId && state.disciplinas.some((d) => d.id === disciplinaId) ? disciplinaId : null,
      // Curso que não é disciplina DESTE edital ("Legislação Penal Especial", "Difusos e
      // Coletivos"): ganha grupo próprio pelo nome, e os vínculos seguem livres — o conteúdo
      // dele mora mesmo em várias matérias.
      cursoNome: String(cursoNome || "").trim() || null,
      // `semDisciplina` só quando a escolha foi EXPLÍCITA (o campo "material geral"); importação
      // que não declarou nada continua deduzindo pelo nome do arquivo, como antes.
      semDisciplina: !!semDisciplina && !disciplinaId && !String(cursoNome || "").trim(),
      titulo: (titulo || "").trim() || "Documento",
      texto: texto || "",
      origem: origem || "colado",
      // Os binários vivem FORA do estado (ver guardarBinarioDoc); aqui ficam só os sinais.
      pdfData: null,
      imgData: null,
      temPdf: !!pdfData, // data URL do PDF guardada à parte (leitura/rasterização por página)
      temImg: !!imgData, // idem para foto/escaneado
      paginas: paginas || null, // [{n,texto,vazia,temImagem,ocr}] quando veio de PDF/imagem
      estrutura: estrutura || null, // F1: {origem, aulaTitulo, blocos:[{numero,titulo,tipo,banca,pIni,pFim,...}]}
      selo: "verde",
      criadoEm: nowISO(),
    };
    recomputarTextoDoc(doc);
    state.documentos.push(doc);
    guardarBinarioDoc(doc, pdfData, imgData); // assíncrono: o estado não espera o binário
    commit();
    return doc;
  },
  // F1 — descreve as FIGURAS de conteúdo (diagramas/tabelas/mapas) do material com a IA, em lote.
  // Renderiza só as páginas COM figura (marca d'água já foi excluída na extração), deduplica por
  // conteúdo e anexa as descrições ao texto (buscável). Cap p/ não estourar a cota. Roda em background.
  // Páginas com figura que AINDA não foram descritas (o que falta para este material).
  figurasPendentes(doc) {
    if (!doc || !Array.isArray(doc.paginas) || !this.temPdfDoc(doc)) return [];
    const feitas = new Set((doc.figuras || []).map((f) => f.pagina));
    return doc.paginas.filter((p) => p.temImagem && !feitas.has(p.n)).map((p) => p.n);
  },
  // Descreve as figuras do material — TODAS as que faltam, em um comando só. Faz uma requisição
  // por página com figura, então é lento e consome cota; por isso avisa o progresso, grava a
  // cada lote (o que já foi fica) e para na hora se a cota estourar.
  //
  // Era `(docId, max = 30)`: descrevia no máximo 30 páginas e jogava fora o que já existia,
  // repetindo as mesmas requisições a cada chamada. Agora é INCREMENTAL (só o que falta) e o
  // teto virou tamanho de lote, não um limite escondido.
  // Parada cooperativa. O reset é do LOTE (quem começa chama `iniciarLeituraFiguras`), não de
  // cada material: resetando por material, o "Parar" clicado no 3º seria esquecido no 4º.
  iniciarLeituraFiguras() {
    pedidoDePararFiguras = false;
  },
  pararLeituraFiguras() {
    pedidoDePararFiguras = true;
  },
  async descreverFigurasDeDoc(docId, opts = {}) {
    await this.garantirConteudoDoc(docId); // conteúdo sob demanda
    const { onProgresso, orcamentoReserva } = typeof opts === "object" && opts ? opts : {};
    const orcamento = orcamentoReserva || { usadas: 0, max: 15 }; // sem lote: teto pequeno
    const d = state.documentos.find((x) => x.id === docId);
    if (!d || !this.temPdfDoc(d) || !Array.isArray(d.paginas) || !this.iaDisponivel()) return { descritas: 0, faltam: 0 };
    const pendentes = this.figurasPendentes(d);
    if (!pendentes.length) return { descritas: 0, faltam: 0, total: (d.figuras || []).length };
    const { pdfData } = await this.binarioDoc(docId);
    if (!pdfData) return { descritas: 0, faltam: pendentes.length };
    const vistos = new Set((d.figuras || []).map((f) => f.hash).filter(Boolean));
    const novas = [];
    const conta = { gemini: 0, reserva: 0, recusadas: 0 };
    let parou = null; // "cota" (as duas fontes travaram) ou "reserva" (teto do caro)
    const LOTE = 5; // rasteriza de 5 em 5: segurar 30 imagens de página inteira estoura a memória

    for (let i = 0; i < pendentes.length && !parou; i += LOTE) {
      const imgs = await pdf.rasterizarPaginas(pdfData, pendentes.slice(i, i + LOTE), 1.6);
      for (const im of imgs) {
        if (pedidoDePararFiguras) { parou = "usuario"; break; }
        const h = hashLei(String(im.dataUrl || "").slice(0, 3000)); // dedupe grosseiro por prefixo da imagem
        if (vistos.has(h)) continue;
        vistos.add(h);
        const b64 = (im.dataUrl || "").split(",")[1] || "";
        if (!b64) continue;
        const r = await descreverUmaFigura(this, b64, im.n, conta, orcamento);
        if (r.parou) { parou = r.parou; break; }
        if (r.pular) { conta.puladas = (conta.puladas || 0) + 1; vistos.delete(h); continue; } // fica pendente
        // Resposta vazia é a resposta CERTA quando a página não tem figura de conteúdo (é o
        // que o prompt pede). Isso também precisa ser anotado: sem registro, a página volta a
        // contar como pendente e é reprocessada — e reprocessar imagem custa tempo e dinheiro.
        if (r.texto && r.texto.length > 20) novas.push({ pagina: im.n, descricao: r.texto, hash: h, via: r.via });
        else novas.push({ pagina: im.n, hash: h, vazio: true, via: r.via });
        // Progresso detalhado: sem isso a tela fica muda por 45 minutos e ninguém sabe se
        // está andando, travou ou acabou.
        if (onProgresso) onProgresso({ feitas: novas.length, total: pendentes.length, pagina: im.n, conta });
      }
      if (novas.length) gravarFiguras(d, novas.splice(0)); // grava o lote e segue (nada se perde)
    }
    const faltam = this.figurasPendentes(d).length;
    return { descritas: (d.figuras || []).filter((f) => f.descricao).length, faltam, parou, cota: parou === "cota", ...conta };
  },
  // F2 — estrutura o material pela IMAGEM do SUMÁRIO (contorna o texto colado/leaders que quebram o
  // parser determinístico). Recebe as páginas + o PDF; devolve a estrutura {origem:'ia-sumario', blocos}
  // ou null (sem sumário, sem PDF ou sem IA). Escala: manda só 1-2 imagens (a página do sumário), não o doc.
  async estruturarPorSumarioIA({ paginas, pdfData, numPaginas } = {}) {
    if (!this.iaDisponivel() || !pdfData || !Array.isArray(paginas) || !paginas.length) return null;
    const sumPag = acharPaginaSumario(paginas);
    if (!sumPag) return null;
    const total = numPaginas || paginas.length;
    const pgs = [sumPag, sumPag + 1].filter((n) => n <= total); // sumário pode ocupar 2 páginas
    let imgs;
    try { imgs = await pdf.rasterizarPaginas(pdfData, pgs, 2); } catch (_) { return null; }
    const imagensB64 = (imgs || []).map((im) => (im.dataUrl || "").split(",")[1] || "").filter(Boolean);
    if (!imagensB64.length) return null;
    let topicos;
    try { topicos = await iaProv.estruturarSumarioVisao(state.config, { imagensB64, contexto: `pág. ${pgs.join("/")}` }); }
    catch (e) { console.error("[sumario-ia]", e); return null; }
    if (!topicos || !topicos.length) return null;
    const est = montarEstruturaDeTopicos(topicos, { paginas, numPaginas: total, sumarioPag: sumPag });
    return est && est.blocos.length ? est : null;
  },
  // Reserva do caminho determinístico das AULAS do cursinho, para apostila ESCANEADA (sem
  // camada de texto, onde ler o sumário com pdf.js não devolve nada). Manda só as IMAGENS das
  // páginas de índice — nunca o PDF inteiro, cujo teto de 14 MB barrava justo as apostilas
  // grandes, que são a maioria. Devolve [{nome, topicos, disciplina}] como aulasDoSumario.
  async aulasDoSumarioVisao(source, { disciplina, paginas, numPaginas } = {}) {
    if (!this.iaDisponivel() || !source) return [];
    // Sem texto não há como pontuar as páginas: tenta as primeiras, onde o índice sempre está.
    const achadas = paginasDeSumario(paginas || []).map((p) => p.n);
    const total = numPaginas || (paginas || []).length || 6;
    const pgs = (achadas.length ? achadas : [2, 3, 4, 5]).filter((n) => n <= total);
    if (!pgs.length) return [];
    let imgs;
    try { imgs = await pdf.rasterizarPaginas(source, pgs, 2); } catch (_) { return []; }
    const imagensB64 = (imgs || []).map((im) => (im.dataUrl || "").split(",")[1] || "").filter(Boolean);
    if (!imagensB64.length) return [];
    let topicos;
    try { topicos = await iaProv.estruturarSumarioVisao(state.config, { imagensB64, contexto: `pág. ${pgs.join("/")}` }); }
    catch (e) { console.error("[aulas-sumario-ia]", e); return []; }
    const aulas = [];
    for (const t of topicos || []) {
      const titulo = (t.titulo || "").trim();
      if (!titulo) continue;
      // Nível 1 sem numeração composta é o nome da disciplina, não uma aula.
      if (t.nivel === 1 && !String(t.numero || "").includes(".")) continue;
      const sufixo = parseInt(String(t.numero || "").split(".").pop(), 10);
      const n = Number.isFinite(sufixo) ? sufixo : aulas.length + 1;
      aulas.push({ nome: `Aula ${String(n).padStart(2, "0")}`, topicos: [titulo], disciplina: disciplina || null, pagina: t.paginaImpressa ?? null });
    }
    return aulas;
  },
  // F2 — reestrutura um material JÁ salvo pela IA do sumário e aplica ("caprichar com a IA").
  async caprichaEstruturaDoc(docId) {
    await this.garantirConteudoDoc(docId); // conteúdo sob demanda
    const d = state.documentos.find((x) => x.id === docId);
    if (!d) return { ok: false };
    const est = await this.estruturarPorSumarioIA({ paginas: d.paginas, pdfData: (await this.binarioDoc(d.id)).pdfData, numPaginas: d.numPaginas || (d.paginas || []).length });
    if (!est) return { ok: false };
    d.estrutura = est;
    this.casarEstruturaComEdital(est, d.titulo, { disciplinaId: d.disciplinaId });
    this.aplicarEstruturaAoMaterial(docId, est);
    commit();
    return { ok: true, blocos: est.blocos.length };
  },
  // Disciplina do material (campo próprio). `null` volta a valer a dedução pelo título/vínculos.
  // Trocar a disciplina RE-CASA os blocos: o vínculo antigo era o da disciplina anterior, e
  // mantê-lo é justamente o cruzamento que este campo veio resolver.
  setDocumentoDisciplina(id, disciplinaId, cursoNome = null) {
    const d = state.documentos.find((x) => x.id === id);
    if (!d) return;
    d.disciplinaId = disciplinaId && state.disciplinas.some((x) => x.id === disciplinaId) ? disciplinaId : null;
    d.cursoNome = d.disciplinaId ? null : String(cursoNome || "").trim() || null;
    // Escolher "sem disciplina" é uma decisão, e precisa grudar: sem a marca, a dedução por
    // vínculo devolveria o material a uma disciplina no próximo render.
    d.semDisciplina = !d.disciplinaId && !d.cursoNome;
    if (d.estrutura && Array.isArray(d.estrutura.blocos) && d.estrutura.blocos.length) {
      this.casarEstruturaComEdital(d.estrutura, d.titulo, { limparSemMatch: true, disciplinaId: d.disciplinaId, ignorarTitulo: !d.disciplinaId });
      this.aplicarEstruturaAoMaterial(d.id, d.estrutura); // re-deriva topicoIds/topicoPaginas + commit
    } else {
      // Sem sumário não há o que re-casar; sobra tirar o vínculo que aponta para fora.
      if (d.disciplinaId) this.setDocumentoTopicos(d.id, (d.topicoIds || []).filter((tid) => (state.topicos.find((t) => t.id === tid) || {}).disciplinaId === d.disciplinaId));
      else commit();
    }
    return d;
  },
  // Renomear o material sem trocar o arquivo (o "Atualizar" só renomeia junto com a reimportação).
  renomearDocumento(id, titulo) {
    const d = state.documentos.find((x) => x.id === id);
    const t = String(titulo || "").trim();
    if (!d || !t || t === d.titulo) return d || null;
    d.titulo = t;
    commit();
    return d;
  },
  // Define os tópicos que um material cobre (Fase 1: muitos‑para‑muitos). O 1º vira o primário.
  setDocumentoTopicos(id, topicoIds) {
    const d = state.documentos.find((x) => x.id === id);
    if (!d) return;
    d.topicoIds = (topicoIds || []).filter(Boolean);
    d.topicoId = d.topicoIds[0] || null;
    // Fase 6: descarta faixas de página de tópicos que saíram.
    if (d.topicoPaginas) for (const k of Object.keys(d.topicoPaginas)) if (!d.topicoIds.includes(k)) delete d.topicoPaginas[k];
    commit();
  },
  // Fase 6: faixa de páginas [ini,fim] que cobre um tópico (vazio/null = a aula inteira).
  setDocumentoTopicoPaginas(docId, topicoId, paginas) {
    const d = state.documentos.find((x) => x.id === docId);
    if (!d) return;
    if (!d.topicoPaginas) d.topicoPaginas = {};
    const ini = parseInt(paginas && paginas[0], 10);
    const fim = parseInt(paginas && paginas[1], 10);
    if (ini > 0 && fim > 0) d.topicoPaginas[topicoId] = [Math.min(ini, fim), Math.max(ini, fim)];
    else delete d.topicoPaginas[topicoId];
    if (!Array.isArray(d.topicoIds)) d.topicoIds = d.topicoId ? [d.topicoId] : [];
    if (!d.topicoIds.includes(topicoId)) { d.topicoIds.push(topicoId); d.topicoId = d.topicoIds[0]; }
    commit();
  },
  // Adiciona tópicos a um material sem remover os já vinculados (ex.: vindo da detecção por IA).
  vincularTopicosDoc(id, topicoIds) {
    const d = state.documentos.find((x) => x.id === id);
    if (!d) return;
    const atuais = new Set(docTops(d));
    (topicoIds || []).filter(Boolean).forEach((t) => atuais.add(t));
    d.topicoIds = [...atuais];
    d.topicoId = d.topicoIds[0] || null;
    commit();
  },
  // Fase 6: vincula tópicos JÁ com a faixa de páginas detectada pela IA (precisão por página).
  async vincularTopicosComPaginas(id, itens) {
    await this.exigirConteudoDoc(id); // sem o texto do material isto seria um palpite
    const d = state.documentos.find((x) => x.id === id);
    if (!d) return;
    if (!Array.isArray(d.topicoIds)) d.topicoIds = d.topicoId ? [d.topicoId] : [];
    if (!d.topicoPaginas) d.topicoPaginas = {};
    for (const it of itens || []) {
      if (!it.topicoId) continue;
      if (!d.topicoIds.includes(it.topicoId)) d.topicoIds.push(it.topicoId);
      const pgs = (it.paginas || []).map(Number).filter((n) => n > 0);
      if (pgs.length) d.topicoPaginas[it.topicoId] = [Math.min(...pgs), Math.max(...pgs)];
    }
    d.topicoId = d.topicoIds[0] || null;
    commit();
  },
  removerDocumento(id) {
    state.documentos = state.documentos.filter((d) => d.id !== id);
    // Remove as marcações do material (texto inteiro e por página "id#N").
    state.marcacoes = state.marcacoes.filter(
      (m) => !(m.alvoTipo === "documento" && (m.alvoId === id || String(m.alvoId).startsWith(id + "#")))
    );
    // Tira da busca semântica (índice) para não devolver trechos de material apagado.
    const idx = state.embeddings;
    if (idx) {
      idx.itens = idx.itens.filter((it) => it.fonteId !== id);
      if (idx.fontes) delete idx.fontes[id];
    }
    // O que mora FORA do estado tem de ser apagado à mão: páginas (`pag:<id>`) e o binário
    // (`bin:`/`blob:<id>`). Sem isto, apagar um material deixava o PDF órfão no banco para
    // sempre — numa apostila são dezenas de MB que não voltavam nem com "apagar tudo".
    esquecerPaginas(id);
    cacheBinario.delete(id);
    if (blobsDisponiveis()) delBlob(id);
    // E o pacote de conteúdo no cofre, pela mesma razão: sem isto cada material excluído
    // deixaria um objeto órfão no R2 para sempre. Best-effort e sem esperar — a exclusão local
    // não pode ficar refém da rede.
    import("./sync-nuvem.js")
      .then((m) => m.apagarConteudoMaterial && m.apagarConteudoMaterial(id))
      .catch(() => {});
    commit();
  },
  // Descarta o BINÁRIO do material (PDF/imagem), mantendo o texto e as páginas. Usado para
  // material protegido/licenciado: o app fica só com o texto do seu estudo, não com a cópia
  // do arquivo (com marca-d'água). Perde o visualizador de PDF e o OCR posterior por página.
  descartarBinarioDoc(id) {
    const d = state.documentos.find((x) => x.id === id);
    if (!d) return false;
    d.pdfData = null;
    d.imgData = null;
    d.temPdf = false;
    d.temImg = false;
    d.binarioDescartado = true; // marca que HAVIA um binário e foi descartado (≠ material colado)
    cacheBinario.delete(id);
    delBlob(id);
    commit();
    return true;
  },
  // Binário do material (PDF/imagem), lido sob demanda de fora do estado. Devolve
  // { pdfData, imgData }. Documento antigo, ainda com o binário embutido, também funciona.
  async binarioDoc(id) {
    const d = state.documentos.find((x) => x.id === id);
    if (!d) return { pdfData: null, imgData: null };
    if (d.pdfData || d.imgData) return { pdfData: d.pdfData || null, imgData: d.imgData || null };
    const emCache = cacheBinario.get(id);
    if (emCache) return emCache;
    const salvo = (await getBlob(id)) || { pdfData: null, imgData: null };
    cacheBinario.set(id, salvo);
    return salvo;
  },
  // Atalho síncrono para a UI: "este material TEM binário?" (sem carregá-lo).
  temBinario(doc) {
    return !!(doc && (doc.temPdf || doc.temImg || doc.pdfData || doc.imgData));
  },
  temPdfDoc(doc) {
    return !!(doc && (doc.temPdf || doc.pdfData));
  },
  // ---- CONTEÚDO SOB DEMANDA (sync v3) ----
  // O aparelho que entra num cofre já cheio baixa o ESQUELETO: sabe que existem 496 materiais,
  // com título, disciplina, sumário e vínculos, mas sem o texto das páginas. Cada material
  // traz `conteudo: {n, chars, figuras, hash, pendente}` e o texto chega quando ele é aberto.
  // Sem isto, abrir uma aula no iPad exigia baixar e parsear a biblioteca inteira.
  // Sem NADA para ler neste aparelho.
  conteudoPendente(doc) {
    return !!(doc && doc.conteudo && doc.conteudo.pendente && !(Array.isArray(doc.paginas) && doc.paginas.length));
  },
  // Tem conteúdo, mas outro aparelho alterou o material depois. Dá para ler; convém atualizar.
  conteudoDesatualizado(doc) {
    return !!(doc && doc.conteudo && doc.conteudo.desatualizado && Array.isArray(doc.paginas) && doc.paginas.length);
  },
  // Grava a fatia que veio do cofre (páginas + figuras daquele material).
  aplicarConteudoMaterial(docId, fatia) {
    const d = state.documentos.find((x) => x.id === docId);
    if (!d || !fatia || !Array.isArray(fatia.paginas)) return false;
    d.paginas = fatia.paginas;
    d.figuras = Array.isArray(fatia.figuras) ? fatia.figuras : d.figuras || [];
    // `baixadoHash` marca "este conteúdo veio do cofre e não foi tocado aqui". É o que impede
    // o aparelho leve de reenviar uma versão VELHA por cima de uma alteração feita em outra
    // máquina: se o hash atual ainda é o que foi baixado, este aparelho não é a fonte da
    // mudança e não tem nada a dizer sobre o conteúdo daquele material.
    const h = (fatia.ficha && fatia.ficha.hash) || null;
    d.conteudo = { ...(d.conteudo || {}), ...(fatia.ficha || {}), pendente: false, desatualizado: false, baixadoHash: h };
    recomputarTextoDoc(d); // `texto` é derivado: quem recebe reconstrói, não trafega
    commit();
    return true;
  },
  // Garante que o material tem o conteúdo carregado antes de uma leitura que dependa dele
  // (abrir, buscar dentro, gerar a partir dele). No aparelho que já tem tudo, é um no-op.
  // Vários de uma vez — os materiais vinculados a um tópico, por exemplo. Não é a biblioteca
  // inteira: são os poucos que cobrem aquele tópico. Falha de um não derruba os outros.
  async garantirConteudoDocs(ids) {
    const alvos = [...new Set(ids || [])].filter((id) => {
      const d = state.documentos.find((x) => x.id === id);
      return d && (this.conteudoPendente(d) || this.conteudoDesatualizado(d));
    });
    if (!alvos.length) return { ok: true, baixados: 0 };
    let baixados = 0;
    for (const id of alvos) {
      try {
        const r = await this.garantirConteudoDoc(id);
        if (r && r.ok) baixados++;
      } catch (_) { /* material que não desce não pode impedir os demais */ }
    }
    return { ok: baixados === alvos.length, baixados, pedidos: alvos.length };
  },
  // Igual a garantirConteudoDoc, mas LANÇA se o conteúdo não puder ser obtido. É a que as
  // gerações usam: seguir sem o texto do material faria a IA produzir do próprio repertório e
  // o resultado chegaria rotulado como se viesse do material — inventado, com selo de fonte.
  async exigirConteudoDoc(docId) {
    const r = await this.garantirConteudoDoc(docId);
    if (r && r.ok) return r;
    const d = state.documentos.find((x) => x.id === docId);
    const nome = (d && d.titulo) || "material";
    const e = new Error(
      r && r.motivo === "sem-senha"
        ? `O conteúdo de «${nome}» está no seu cofre e este aparelho não está conectado à sincronização. Conecte-a para baixar o material.`
        : `Não consegui baixar o conteúdo de «${nome}» agora (sem conexão?). Sem o texto do material eu não gero — sairia conteúdo inventado com cara de extraído.`
    );
    e.code = "CONTEUDO_INDISPONIVEL";
    throw e;
  },
  async garantirConteudoDoc(docId) {
    const d = state.documentos.find((x) => x.id === docId);
    if (!d) return { ok: false, motivo: "sem-doc" };
    if (!this.conteudoPendente(d) && !this.conteudoDesatualizado(d)) return { ok: true, jaTinha: true };
    // Avisa a interface que ESTE material está descendo. Sem isto, quem pediu 10 questões pelo
    // chat ficaria olhando para uma tela parada durante o download, sem saber se travou — e o
    // store não pode chamar `toast` direto (é camada de dados). O evento resolve para todos os
    // caminhos de uma vez: chat, telas, atalhos.
    const avisar = (fase, extra) => {
      try {
        window.dispatchEvent(new CustomEvent("mentor:conteudo", { detail: { fase, titulo: d.titulo, ...extra } }));
      } catch (_) {}
    };
    avisar("baixando");
    const mod = await import("./sync-nuvem.js");
    const r = await mod.garantirConteudoMaterial(docId);
    avisar("fim", { ok: !!(r && r.ok) });
    return r;
  },
  // ---- Vínculo com o arquivo ORIGINAL (só desktop) ----
  // Guarda o CAMINHO, não o arquivo. Serve para reabrir o original depois de descartar o
  // binário — assim dá para não manter cópia da apostila dentro do app sem perder o acesso.
  podeVincularArquivo,
  async vincularArquivoOriginal(docId) {
    const d = state.documentos.find((x) => x.id === docId);
    if (!d) return null;
    const caminho = await escolherArquivo();
    if (!caminho) return null;
    d.caminhoOriginal = caminho;
    commit();
    return caminho;
  },
  desvincularArquivoOriginal(docId) {
    const d = state.documentos.find((x) => x.id === docId);
    if (!d) return;
    d.caminhoOriginal = null;
    commit();
  },
  abrirArquivoOriginal(docId) {
    const d = state.documentos.find((x) => x.id === docId);
    return abrirArquivoNoSistema(d && d.caminhoOriginal);
  },
  // Páginas que ainda dependem de OCR/Visão (sem texto e ainda não transcritas).
  paginasPendentes(doc) {
    if (!doc || !Array.isArray(doc.paginas)) return [];
    // `vazia` é uma marca do momento da IMPORTAÇÃO. Se a página ganhou conteúdo depois — é o
    // caso da que só tinha um quadro e foi descrita na leitura de figuras — ela não está mais
    // pendente, e continuar anunciando "página escaneada" é mentira na tela.
    return doc.paginas.filter((p) => p.vazia && !p.ocr && !(p.texto || "").trim());
  },
  // (Re)processa a estrutura de páginas de um doc já salvo a partir do PDF/imagem
  // guardado — usado para detectar páginas-lacuna em material importado antes do OCR.
  setPaginasDocumento(id, paginas) {
    const doc = state.documentos.find((d) => d.id === id);
    if (!doc) return;
    doc.paginas = paginas || null;
    recomputarTextoDoc(doc);
    commit();
  },
  // Grava o texto transcrito por Visão numa página específica (mescla no lugar certo).
  atualizarPaginaOcr(id, n, textoVisao) {
    const doc = state.documentos.find((d) => d.id === id);
    if (!doc || !Array.isArray(doc.paginas)) return;
    const p = doc.paginas.find((x) => x.n === n);
    if (!p) return;
    p.texto = String(textoVisao || "").trim();
    p.ocr = true;
    p.vazia = p.texto.length < 1;
    recomputarTextoDoc(doc);
    commit();
  },
  // Transcreve UMA página/imagem (já rasterizada pela UI) via Visão e persiste.
  // Online + Gemini (a UI bloqueia antes via iaDisponivel). 1 página = 1 requisição.
  async ocrPagina(id, n, dataUrl) {
    const doc = state.documentos.find((d) => d.id === id);
    if (!doc) throw new Error("Documento não encontrado.");
    const contexto = nomeContexto(state, doc.topicoId);
    const texto = await iaProv.transcreverImagem(state.config, { dataUrl, contexto });
    // Página realmente em branco (separador, verso, folha de rosto) devolve texto vazio — e
    // isso é uma resposta, não uma falha: marca como conferida, senão ela volta como pendente
    // em toda rodada e o usuário paga de novo pela mesma folha em branco.
    this.atualizarPaginaOcr(id, n, texto);
    if (!String(texto || "").trim()) {
      const pg = (doc.paginas || []).find((p) => p.n === n);
      if (pg) { pg.ocr = true; commit(); }
    }
    return texto;
  },
  // Transcrição avulsa de uma foto (ex.: discursiva manuscrita) — só devolve o texto,
  // não persiste documento. tipo: "manuscrito" (padrão) ou "material".
  async transcreverFoto(dataUrl, tipo) {
    return iaProv.transcreverImagem(state.config, { dataUrl, tipo: tipo || "manuscrito" });
  },

  // ---------- busca semântica (vetorial) ----------
  // Situação do índice: quantas fontes estão indexadas, quantas pendentes (novas ou
  // alteradas) e total de trechos. Serve para a UI mostrar status e o botão certo.
  // opts.tipos (opcional) = restringe o status a um domínio (["material","resumo"] em Materiais;
  // ["leiseca"] ou ["juris"] no próprio módulo). Sem opts = visão GLOBAL (a busca usa temIndice global).
  statusIndice(opts = {}) {
    const tipos = opts.tipos ? new Set(opts.tipos) : null;
    const fontes = fontesIndexaveis(state).filter((f) => !tipos || tipos.has(f.tipo));
    const idx = state.embeddings || { itens: [], fontes: {} };
    let indexadas = 0;
    let pendentes = 0;
    for (const f of fontes) {
      if (idx.fontes && idx.fontes[f.id] === f.sig) indexadas++;
      else pendentes++;
    }
    const chunks = tipos ? idx.itens.filter((it) => tipos.has(it.tipo)).length : idx.itens.length;
    return {
      indexadas,
      pendentes,
      fontes: fontes.length,
      chunks,
      temIndice: chunks > 0,
      online: this.iaDisponivel(),
    };
  },

  // Lista as fontes indexáveis com seu status (para a UI de seleção do índice).
  // emIndice = tem dados no índice (mesmo que desatualizados); indexada = em dia.
  // opts.tipos (opcional) filtra por domínio (material/resumo/leiseca/juris).
  fontesIndice(opts = {}) {
    const tipos = opts.tipos ? new Set(opts.tipos) : null;
    const idx = state.embeddings || { itens: [], fontes: {} };
    const cont = {};
    for (const it of idx.itens) cont[it.fonteId] = (cont[it.fonteId] || 0) + 1;
    return fontesIndexaveis(state).filter((f) => !tipos || tipos.has(f.tipo)).map((f) => ({
      id: f.id,
      tipo: f.tipo,
      titulo: f.titulo,
      indexada: !!(idx.fontes && idx.fontes[f.id] === f.sig),
      emIndice: (cont[f.id] || 0) > 0 || !!(idx.fontes && f.id in idx.fontes),
      chunks: cont[f.id] || 0,
    }));
  },
  // Sincroniza o índice à seleção do usuário: indexa as desejadas (pulando as já em
  // dia) e REMOVE do índice as que não estão na seleção. Um só passo = sem redundância.
  // opts.tipos (opcional) LIMITA a remoção ao domínio: assim indexar em Materiais não apaga
  // o que Lei Seca/Jurisprudência já separou (cada módulo cuida do seu escopo).
  async sincronizarIndice(idsDesejados, onProgress, opts = {}) {
    const desejados = new Set(idsDesejados || []);
    const idx = state.embeddings || { itens: [], fontes: {} };
    const tipos = opts.tipos ? new Set(opts.tipos) : null;
    // Tipo de cada fonte presente: do estado atual e, p/ fontes já removidas do módulo, do próprio índice.
    const tipoDaFonte = {};
    for (const it of idx.itens) tipoDaFonte[it.fonteId] = it.tipo;
    for (const f of fontesIndexaveis(state)) tipoDaFonte[f.id] = f.tipo;
    const presentes = new Set([
      ...Object.keys(idx.fontes || {}),
      ...idx.itens.map((it) => it.fonteId),
    ]);
    let remover = [...presentes].filter((id) => !desejados.has(id));
    if (tipos) remover = remover.filter((id) => tipos.has(tipoDaFonte[id]));
    if (remover.length) this.removerDoIndice(remover);
    if (desejados.size) return this.indexarSemantica(onProgress, { ids: [...desejados] });
    return { feitos: 0, chunks: (state.embeddings || idx).itens.length };
  },

  // (Re)indexa as fontes que mudaram. Em lote (barato). onProgress(feito, total, titulo).
  // opts.ids (opcional): restringe às fontes escolhidas pelo usuário (seleção).
  // Online + Gemini (a UI bloqueia antes). Salva progresso incrementalmente.
  async indexarSemantica(onProgress, opts = {}) {
    if (!this.iaDisponivel()) {
      const e = new Error("Conecte o Gemini em Configurações para indexar.");
      e.code = "IA_OFFLINE";
      throw e;
    }
    const idx = state.embeddings;
    idx.modelo = iaProv.EMB_MODELO;
    idx.fontes = idx.fontes || {};
    const fontes = fontesIndexaveis(state);
    const filtro = opts.ids ? new Set(opts.ids) : null;
    const alvo = fontes.filter((f) => (!filtro || filtro.has(f.id)) && idx.fontes[f.id] !== f.sig);
    let feitos = 0;
    // Total de TRECHOS, não de fontes: um material de 79 páginas rende ~200 trechos, e
    // "1/2 materiais" durante minutos parece travado. O progresso conta trecho a trecho.
    const totalChunks = alvo.reduce((a, f) => a + chunksDaFonte(f).length, 0);
    let chunksFeitos = 0;
    const LOTE = 20; // grava a cada lote: se a cota estourar no meio, o que já foi fica
    for (const f of alvo) {
      const chunks = chunksDaFonte(f);
      // Retomada: o que já está no índice para esta fonte (de uma tentativa interrompida)
      // é reaproveitado — a ordem dos trechos é determinística, então basta seguir do
      // ponto em que parou. Antes, uma falha no meio jogava fora o lote inteiro e a
      // tentativa seguinte recomeçava do zero, queimando cota de novo.
      const jaFeitos = idx.itens.filter((it) => it.fonteId === f.id).length;
      const pendentes = jaFeitos < chunks.length ? chunks.slice(jaFeitos) : [];
      if (jaFeitos > chunks.length) { // fonte encolheu: refaz do zero
        idx.itens = idx.itens.filter((it) => it.fonteId !== f.id);
      }
      chunksFeitos += Math.min(jaFeitos, chunks.length);
      for (let i = 0; i < pendentes.length; i += LOTE) {
        const lote = pendentes.slice(i, i + LOTE);
        const vetores = await iaProv.gerarEmbeddings(state.config, lote.map((c) => c.texto), "RETRIEVAL_DOCUMENT");
        lote.forEach((c, j) => {
          if (vetores[j] && vetores[j].length) {
            idx.itens.push({ id: uid("emb"), fonteId: f.id, tipo: f.tipo, titulo: f.titulo, pagina: c.pagina || null, texto: c.texto, vetor: vetores[j] });
          }
        });
        chunksFeitos += lote.length;
        if (onProgress) onProgress(chunksFeitos, totalChunks, f.titulo);
        commit(); // persiste o progresso a cada lote, não só a cada fonte
      }
      idx.fontes[f.id] = f.sig;
      feitos++;
      if (onProgress) onProgress(chunksFeitos, totalChunks, f.titulo);
      commit();
    }
    // Remove do índice fontes que não existem mais.
    const ids = new Set(fontes.map((f) => f.id));
    idx.itens = idx.itens.filter((it) => ids.has(it.fonteId));
    for (const k of Object.keys(idx.fontes)) if (!ids.has(k)) delete idx.fontes[k];
    commit();
    return { feitos, chunks: idx.itens.length };
  },

  // Indexação AUTOMÁTICA de UMA fonte recém-salva/atualizada para a busca semântica.
  // Best-effort e SILENCIOSA (nunca lança; devolve null quando não age): só roda quando
  // a IA/embeddings estão configurados E a busca por significado já foi ativada alguma
  // vez (índice não vazio) — assim salvar material não dispara requisições involuntárias
  // para quem nunca usou a busca. A primeira ativação continua explícita, pela UI
  // ("Atualizar índice" em Materiais). Se a fonte já está em dia (mesma assinatura),
  // indexarSemantica não refaz nada.
  async indexarFonteAuto(id) {
    await this.garantirConteudoDoc(id); // conteúdo sob demanda: no aparelho que só tem o esqueleto, desce agora
    try {
      if (!id || !this.iaDisponivel()) return null;
      const idx = state.embeddings;
      if (!idx || (!idx.itens.length && !Object.keys(idx.fontes || {}).length)) return null;
      return await this.indexarSemantica(null, { ids: [id] });
    } catch (e) {
      console.warn("[busca] indexação automática falhou (o material fica pendente):", e);
      return null;
    }
  },

  // Remove fontes específicas do índice (apaga seus trechos e a assinatura) — assim
  // a fonte deixa de aparecer na busca semântica e pode ser reindexada depois.
  removerDoIndice(ids) {
    const idx = state.embeddings;
    if (!idx) return;
    const alvo = new Set(ids || []);
    idx.itens = idx.itens.filter((it) => !alvo.has(it.fonteId));
    for (const id of alvo) delete idx.fontes[id];
    commit();
  },

  // Busca semântica pura: embute a pergunta e ranqueia os trechos por cosseno.
  // Devolve [{ score, tipo, titulo, pagina, trecho, origem }]. Online (requer índice).
  async buscaSemantica(query, { k = 8, minScore = 0.3 } = {}) {
    const idx = state.embeddings;
    if (!idx || !idx.itens.length) return [];
    if (!String(query || "").trim()) return [];
    const qv = await iaProv.gerarEmbedding(state.config, query, "RETRIEVAL_QUERY");
    if (!qv.length) return [];
    const sims = idx.itens.map((it) => ({ it, s: cosseno(qv, it.vetor) }));
    sims.sort((a, b) => b.s - a.s);
    return sims
      .filter((x) => x.s >= minScore)
      .slice(0, k)
      .map(({ it, s }) => ({ score: s, tipo: it.tipo, fonteId: it.fonteId, titulo: it.titulo, pagina: it.pagina, trecho: it.texto, origem: origemDoItem(it) }));
  },

  // Tópico associado a uma fonte do índice (para vincular flashcards/questões geradas).
  _topicoDaFonte(fonteId, tipo) {
    if (tipo === "resumo") {
      const r = state.resumos.find((x) => x.id === fonteId);
      return r ? r.topicoId : null;
    }
    const d = state.documentos.find((x) => x.id === fonteId);
    return d ? d.topicoId : null;
  },
  // Gera e salva flashcards a partir de UM trecho da busca semântica (online, ).
  async gerarFlashcardsDeTrecho({ texto, contexto, fonteId, tipo, n = 5, dificuldade = "medio" }) {
    const topicoId = this._topicoDaFonte(fonteId, tipo);
    const cards = await iaProv.gerarFlashcards(state.config, {
      texto, contexto: contexto || "geral", n,
      ...iaExtras(state, { topicoId, topico: contexto, dificuldade }),
    });
    const fonte = { tipo: "busca", titulo: contexto || "Busca semântica" };
    return cards.map((c) => this.addFlashcard({ ...c, topicoId, fonte, selo: "amarelo" }));
  },
  // Gera e salva questões a partir de UM trecho da busca semântica (online, ).
  async gerarQuestoesDeTrecho({ texto, contexto, fonteId, tipo, n = 3, dificuldade = "medio" }) {
    const topicoId = this._topicoDaFonte(fonteId, tipo);
    const qs = await iaProv.gerarQuestoes(state.config, {
      texto, contexto: contexto || "geral", n,
      ...iaExtras(state, { topicoId, topico: contexto, dificuldade }),
    });
    const fonte = { tipo: "busca", titulo: contexto || "Busca semântica" };
    return qs.map((q) => this.addQuestao({ ...q, topicoId, fonte })).filter(Boolean);
  },

  // Recuperação para o CHAT (híbrida): trechos semânticos do material/resumos quando há
  // índice + IA; combina com a busca textual dos itens curtos (flashcards, questões, lei,
  // anotações). Sem índice/IA, cai 100% na busca textual. Sempre devolve [{origem, trecho}].
  async recuperarTrechos(query, { k = 5 } = {}) {
    // O GUIA do sistema também é fonte do chat (perguntas de "como usar"): entra na frente.
    const guia = buscarNoGuia(query);
    let conteudo = ia.buscarNoConteudo(state, query);
    if (this.iaDisponivel() && state.embeddings.itens.length) {
      try {
        const sem = await this.buscaSemantica(query, { k });
        const extras = conteudo.filter((t) => !/^Material:|^Resumo:/.test(t.origem));
        const vistos = new Set();
        const merged = [];
        for (const s of [...sem, ...extras]) {
          const chave = s.origem + "|" + String(s.trecho).slice(0, 60);
          if (vistos.has(chave)) continue;
          vistos.add(chave);
          merged.push({ origem: s.origem, trecho: String(s.trecho).slice(0, 600) });
        }
        if (merged.length) conteudo = merged.slice(0, k + 2);
      } catch (_) {
        // qualquer falha (ex.: cota) → usa o textual
      }
    }
    return [...guia, ...conteudo];
  },
  buscarDocumentos(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return state.documentos;
    const noSumario = (d) =>
      ((d.estrutura && d.estrutura.blocos) || []).some((b) => String(b.titulo || "").toLowerCase().includes(q));
    return state.documentos.filter(
      (d) => d.titulo.toLowerCase().includes(q) || (d.texto || "").toLowerCase().includes(q) || noSumario(d)
    );
  },
  // Materiais sem conteúdo local, opcionalmente só os de uma disciplina/curso. Devolve também
  // o tamanho estimado do download, porque "baixar tudo" sem dizer quanto custa não é escolha.
  pendentesParaBaixar({ disciplinaId = null, cursoNome = null, ids = null } = {}) {
    let alvo = (state.documentos || []).filter((d) => this.conteudoPendente(d));
    if (ids) alvo = alvo.filter((d) => ids.includes(d.id));
    if (disciplinaId) alvo = alvo.filter((d) => d.disciplinaId === disciplinaId);
    if (cursoNome) alvo = alvo.filter((d) => (d.cursoNome || "") === cursoNome);
    const chars = alvo.reduce((n, d) => n + ((d.conteudo && d.conteudo.chars) || 0), 0);
    // O texto natural comprime a ~30% e o envelope em base64 acrescenta um terço — medido na
    // biblioteca real em 20/08/2026, não é chute.
    return { docs: alvo, n: alvo.length, mb: +((chars * 0.3 * 1.33) / 1048576).toFixed(1) };
  },
  // Quantos materiais a busca NÃO conseguiu olhar por dentro neste aparelho (conteúdo ainda no
  // cofre). Baixar os 496 para responder a uma busca seria pior que o problema; o honesto é a
  // tela dizer que a varredura foi parcial — busca que devolve menos sem avisar é a pior
  // espécie de resultado errado.
  materiaisNaoBuscaveis() {
    return state.documentos.filter((d) => this.conteudoPendente(d)).length;
  },

  // ---------- questões ----------
  addQuestao({ topicoId, disciplinaId, enunciado, alternativas, gabarito, selo, fonte, referencia, nivel, formato, justificativa, provaId, anulada, assunto, banca, ano, orgao, treino, diff, indicacaoId, duelo }) {
    let discId = disciplinaId || null;
    if (topicoId) {
      const t = state.topicos.find((x) => x.id === topicoId);
      if (t) discId = t.disciplinaId;
    }
    const alts = (alternativas || []).map((a) => String(a));
    // ÚLTIMA LINHA DE DEFESA (18 chamadores). Gabarito que não aponta para uma alternativa
    // existente virava o índice 0 — "A" no múltipla escolha, "Certo" no C/E —, e o aluno
    // memorizava um gabarito que o app inventou.
    // A exceção é a questão ANULADA: prova oficial cujo gabarito não veio fica registrada,
    // marcada e fora da pontuação (é como `importarProva` já trata o `semGabarito`).
    const gabaritoValido = Number.isInteger(gabarito) && gabarito >= 0 && gabarito < alts.length;
    if (!gabaritoValido && !anulada) {
      console.warn("[questoes] recusada por falta de gabarito:", (enunciado || "").slice(0, 60));
      return null;
    }
    const q = {
      id: uid("ques"),
      topicoId: topicoId || null,
      disciplinaId: discId,
      enunciado: (enunciado || "").trim(),
      alternativas: alts,
      gabarito: gabaritoValido ? gabarito : 0,
      selo: selo || "verde",
      fonte: fonte || null,
      referencia: (referencia || "").trim() || null,
      assunto: (assunto || "").trim() || null, // tema/breadcrumb da fonte (ex.: "Administração Pública - Servidores")
      banca: (banca || "").trim() || null, // ex.: "IVIN", "COPERVE-UFSC", "UERJ"
      ano: (ano || "").toString().trim() || null, // ex.: "2026"
      orgao: (orgao || "").trim() || null, // ex.: "Prefeitura de Simões" / prova
      nivel: nivel || null, // "Fácil" | "Média" | "Difícil"
      formato: formato === "ce" ? "ce" : "mc", // 'mc' = múltipla escolha | 'ce' = Certo/Errado
      justificativa: (justificativa || "").trim() || null, // usada no C/E (feedback)
      provaId: provaId || null, // vínculo à prova anterior importada (quando houver)
      anulada: !!anulada, // questão anulada/sem gabarito definitivo (fora da pontuação)
      // Drill "letra da lei" (Lei Seca/Jurisprudência): itens de treino gerados de uma indicação.
      // Não aparecem na lista normal de Questões (só no Treinar); guardam o diff da alteração.
      treino: treino ? { indicacaoId: indicacaoId || null, duelo: !!duelo } : null,
      diff: diff && (diff.trechoOriginal || diff.trechoAlterado) ? { trechoOriginal: diff.trechoOriginal || "", trechoAlterado: diff.trechoAlterado || "" } : null,
      comentarioIA: null, // explicação do gabarito gerada sob demanda pela IA ()
      criadoEm: nowISO(),
      geracaoId: loteGeracao ? loteGeracao.id : null, // lote de geração (filtro "só os recém-gerados")
      geracaoRotulo: loteGeracao ? loteGeracao.rotulo : null,
    };
    state.questoes.push(q);
    commit();
    return q;
  },
  // Atalho para CERTO/ERRADO: vira questão de 2 alternativas ["Certo","Errado"].
  addQuestaoCE({ topicoId, disciplinaId, enunciado, certo, justificativa, selo, fonte, referencia, assunto, banca, ano, orgao, nivel }) {
    return this.addQuestao({
      topicoId,
      disciplinaId,
      enunciado,
      alternativas: ["Certo", "Errado"],
      gabarito: certo ? 0 : 1,
      formato: "ce",
      justificativa,
      selo,
      fonte,
      referencia,
      assunto,
      banca,
      ano,
      orgao,
      nivel,
    });
  },
  // Importa questões: uma por linha, campos separados por "|":
  // enunciado | alt1 | alt2 | *altCorreta | ... | ref: fonte (opcional)
  // Devolve {criadas, recusadas} — `recusadas` são as linhas sem `*` (sem gabarito), que não
  // entram mais como alternativa "A". Sem chamador na UI hoje (o fluxo real é
  // prepararQuestoes → preview → aceitarQuestoes), mas a regra vale para os dois.
  importQuestoes(texto, topicoId) {
    const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let n = 0, recusadas = 0;
    for (const l of linhas) {
      const partes = l.split("|").map((p) => p.trim()).filter(Boolean);
      if (partes.length < 3) continue; // enunciado + ao menos 2 alternativas
      const enunciado = partes[0];
      let referencia = null;
      const altsRaw = [];
      for (const p of partes.slice(1)) {
        if (/^ref:/i.test(p)) {
          referencia = p.replace(/^ref:/i, "").trim();
          continue;
        }
        altsRaw.push(p);
      }
      if (altsRaw.length < 2) continue;
      // Sem o `*` não há gabarito. Antes virava o índice 0 — a alternativa "A" — e o aluno
      // estudava, errava e memorizava uma resposta que o app inventou. Linha sem `*` não entra.
      const gabarito = altsRaw.findIndex((a) => a.startsWith("*"));
      if (gabarito < 0) { recusadas++; continue; }
      const alternativas = altsRaw.map((a) => a.replace(/^\*/, "").trim());
      this.addQuestao({ topicoId, enunciado, alternativas, gabarito, selo: "manual", referencia });
      n++;
    }
    return { criadas: n, recusadas };
  },
  // PREVIEW (não grava) das questões de múltipla escolha coladas. Devolve
  // [{enunciado, alternativas:[str], gabarito:int|null, referencia}].
  // `gabarito: null` = a linha não trouxe `*`. NÃO vira 0: o preview marca a questão e o
  // "Adicionar" recusa enquanto o usuário não apontar a correta.
  prepararQuestoes(texto) {
    const linhas = String(texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (const l of linhas) {
      const partes = l.split("|").map((p) => p.trim()).filter(Boolean);
      if (partes.length < 3) continue;
      const enunciado = partes[0];
      const meta = { referencia: null, assunto: null, banca: null, ano: null, orgao: null };
      const altsRaw = [];
      for (const p of partes.slice(1)) {
        const m = p.match(/^(ref|assunto|banca|ano|[óo]rg[ãa]o|orgao)\s*:\s*(.*)$/i);
        if (m) {
          const k = m[1].toLowerCase();
          const v = m[2].trim();
          if (k === "ref") meta.referencia = v;
          else if (k === "assunto") meta.assunto = v;
          else if (k === "banca") meta.banca = v;
          else if (k === "ano") meta.ano = v;
          else meta.orgao = v;
          continue;
        }
        altsRaw.push(p);
      }
      if (altsRaw.length < 2) continue;
      const achado = altsRaw.findIndex((a) => a.startsWith("*"));
      const gabarito = achado < 0 ? null : achado; // null = sem `*`; o preview cobra do usuário
      const alternativas = altsRaw.map((a) => a.replace(/^\*/, "").trim());
      out.push({ enunciado, alternativas, gabarito, ...meta });
    }
    return out;
  },
  // PREVIEW inteligente das questões: parser determinístico `|` primeiro; se não reconhecer NADA
  // (ex.: texto de PDF de banca tipo Qconcursos) e houver IA, faz a EXTRAÇÃO RICA (referência,
  // assunto, banca, ano, órgão + gabarito do bloco de respostas no final).
  async prepararQuestoesAuto(texto, formato) {
    const det = this.prepararQuestoes(texto);
    if (det.length) return det;
    if (this.iaDisponivel()) {
      const ia = await this.extrairProvaEmPedacos(texto, "mc");
      if (ia.length) return ia;
    }
    return det;
  },
  // Extrai uma PROVA inteira SEM TRUNCAR: separa o gabarito, divide o corpo em pedaços, extrai cada
  // um e junta tudo; o gabarito é aplicado por NÚMERO da questão (ou pela ordem, como reserva).
  // Provas pequenas caem numa única chamada. `formato` = "mc" | "ce".
  async extrairProvaEmPedacos(texto, formato = "mc") {
    if (!this.iaDisponivel() || !(texto || "").trim()) return [];
    const { corpo, gab } = separarGabarito(texto);
    const pedacos = dividirTextoQuestoes(corpo, 13000);
    const todas = [];
    for (const p of pedacos) {
      let itens = [];
      for (let tent = 0; tent < 3; tent++) {
        try { itens = await iaProv.extrairQuestoesPDF(state.config, { texto: p, formato, n: 80, limiteTexto: 15000 }); if (itens.length) break; }
        catch (e) { console.error(`pedaço falhou (tentativa ${tent + 1}):`, e); }
      }
      todas.push(...itens);
    }
    // Aplica o gabarito do bloco de respostas por NÚMERO (mais robusto); reserva = ordem global.
    if (gab && Object.keys(gab).length) {
      todas.forEach((q, i) => {
        const ans = gab[q.numero] || gab[i + 1];
        if (!ans) return;
        if (formato === "ce") q.certo = /^(C|CERTO|V|VERDADEIRO)$/i.test(ans);
        else { const idx = "ABCDE".indexOf(String(ans).toUpperCase()); if (idx >= 0 && Array.isArray(q.alternativas) && idx < q.alternativas.length) q.gabarito = idx; }
      });
    }
    return todas;
  },
  // Sugere o tópico do edital mais parecido com um texto de assunto (casamento por palavras).
  // Devolve { topicoId, nome } ou null. Usado no preview de importação de questões.
  sugerirTopicoPorAssunto(assunto, disciplinaHint) {
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    // "direito/direitos" são quase-stopwords aqui: quase toda disciplina jurídica é "Direito X", então
    // o que discrimina é o termo específico (penal/civil/...). Sem isso, "Direito Penal" casaria com
    // "Direito Constitucional" só pela palavra "direito".
    const stop = new Set(["de", "da", "do", "dos", "das", "e", "a", "o", "as", "os", "em", "no", "na", "para", "com", "disposicoes", "gerais", "direito", "direitos"]);
    const tokens = (s) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !stop.has(w)));
    const alvo = tokens(`${assunto || ""} ${disciplinaHint || ""}`);
    if (!alvo.size) return null;
    let best = null, bestScore = 0;
    for (const t of state.topicos) {
      const disc = state.disciplinas.find((d) => d.id === t.disciplinaId);
      const cand = tokens(`${t.nome} ${disc ? disc.nome : ""}`);
      let inter = 0;
      for (const w of cand) if (alvo.has(w)) inter++;
      const score = inter / Math.max(1, Math.min(alvo.size, cand.size));
      if (inter > 0 && score > bestScore) { bestScore = score; best = t; }
    }
    if (best && bestScore >= 0.34) return { topicoId: best.id, nome: nomeContexto(state, best.id) };
    return null;
  },
  // F2: acha a AULA do cursinho cujo nome bate com o título do material (ex.: "1. Princípios
  // Administrativos", "Aula 01"). Compara ignorando acentos/numeração inicial.
  acharAulaPorTitulo(titulo) {
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^\s*\d+[.)\-\s]+/, "").trim();
    const t = norm(titulo);
    if (!t || !Array.isArray(state.aulas)) return null;
    return (
      state.aulas.find((a) => norm(a.nome) === t) ||
      state.aulas.find((a) => { const n = norm(a.nome); return n && (n.includes(t) || t.includes(n)); }) ||
      null
    );
  },
  // F2: casa a ESTRUTURA detectada com o edital (DETERMINÍSTICO, instantâneo). Para cada bloco,
  // sugere topicoId pelo título; usa a AULA do cursinho (casada pelo título do material) como viés.
  // Não grava nada no material — só preenche estrutura.blocos[].topicoId e estrutura.aula*.
  // `titulo` = nome do material/arquivo ("3. Direito Administrativo"). É por ele que se sabe a
  // DISCIPLINA da apostila, e casar dentro dela primeiro é o que separa um vínculo certo de um
  // vínculo por coincidência de palavra. Medido na biblioteca real: 64% → 95% de acerto nos
  // materiais cuja disciplina existe no edital.
  // `opts.limparSemMatch`: bloco sem candidato aceitável fica SEM vínculo. Usado ao
  // re-vincular material já importado — sem isso o vínculo errado antigo sobreviveria à
  // correção, que é justamente o que se quer desfazer. Em estrutura recém-detectada não faz
  // diferença (não há vínculo anterior), e no refino por IA fica desligado de propósito.
  // `opts.disciplinaId`: disciplina DECLARADA do material (campo próprio, escolhido na
  // importação ou pelo usuário). Quando existe, ela manda — e fecha a porta do casamento
  // global: o bloco fica sem vínculo em vez de cair em outra matéria.
  casarEstruturaComEdital(estrutura, titulo, opts = {}) {
    if (!estrutura || !Array.isArray(estrutura.blocos)) return estrutura;
    // O NOME DO ARQUIVO é a fonte mais confiável da aula, quando o cursinho entrega uma aula
    // por PDF: "Direito Civil - Aula 07 - Fato jurídico" de um lado, "Direito Civil - Aula 07"
    // no plano do outro. Antes só se procurava pelo título inferido de DENTRO do PDF ("7. Fato
    // jurídico"), que não bate com o rótulo da aula — e nenhum dos 475 materiais do curso
    // completo encontrava a sua aula.
    const rotuloAula = String(titulo || "").match(/^(.+ - Aula [0-9]+)(?![0-9])/);
    const aula = (rotuloAula && this.acharAulaPorTitulo(rotuloAula[1]))
      || (estrutura.aulaTitulo ? this.acharAulaPorTitulo(estrutura.aulaTitulo) : null);
    if (aula) { estrutura.aulaId = aula.id; estrutura.aulaNome = aula.nome; }
    const topsAula = aula && Array.isArray(aula.topicoIds) ? aula.topicoIds : null;
    // Apostila que não é disciplina do edital (Legislação Civil Especial, Difusos e Coletivos)
    // devolve null aqui — e aí vale o casamento global, que é o certo para elas.
    const declarada = opts.disciplinaId && state.disciplinas.some((d) => d.id === opts.disciplinaId) ? opts.disciplinaId : null;
    // `opts.ignorarTitulo`: o usuário disse que este material é de um CURSO fora do edital ou
    // que é avulso. Nesse caso o prefixo do título não pode voltar pela janela e restringir o
    // casamento — a escolha explícita vale mais do que o nome do arquivo.
    const porTitulo = !opts.ignorarTitulo && titulo ? disciplinaDoMaterial(titulo, state.disciplinas) : null;
    const disciplinaId = declarada || porTitulo;
    // Restringe quando a disciplina foi DECLARADA (campo) ou lida do PREFIXO do título — as
    // duas vêm do usuário/cursinho, não de dedução. Sem isso, um material de uma aula só,
    // com títulos curtos, casa em qualquer matéria do edital por coincidência de palavra.
    const restrito = !!disciplinaId;
    for (const b of estrutura.blocos) {
      const sug = acharTopicoDoBloco(b.titulo, { topicos: state.topicos, disciplinas: state.disciplinas, disciplinaId, restrito });
      if (sug) {
        b.topicoId = sug.topicoId;
        // se o sugerido está entre os tópicos da aula, sobe a confiança
        if (topsAula && topsAula.includes(sug.topicoId)) b.confianca = Math.min(0.99, (b.confianca || 0.7) + 0.1);
      } else if (topsAula && topsAula.length === 1 && (!disciplinaId || (state.topicos.find((t) => t.id === topsAula[0]) || {}).disciplinaId === disciplinaId)) {
        // Aula do cursinho com UM tópico só → o bloco herda. Mas a herança também respeita a
        // disciplina do material: sem isso, os capítulos do Tributário que não achavam par
        // herdavam um tópico de Constitucional e voltavam a contar como matéria errada.
        b.topicoId = topsAula[0];
      } else if (opts.limparSemMatch) {
        b.topicoId = null;
      }
    }
    return estrutura;
  },
  // Re-aplica o casamento bloco↔tópico em TODOS os materiais com sumário, usando a regra
  // atual. Serve para consertar de uma vez a biblioteca importada por uma versão anterior
  // (onde o casamento ignorava a disciplina do material). Não toca em páginas, texto, figuras
  // nem histórico — só nos vínculos e nas faixas de página derivadas deles.
  revincularMateriais() {
    const relatorio = [];
    for (const d of state.documentos) {
      const blocos = (d.estrutura && d.estrutura.blocos) || [];
      if (!blocos.length) continue;
      const antes = blocos.filter((b) => b.topicoId).length;
      this.casarEstruturaComEdital(d.estrutura, d.titulo, { limparSemMatch: true, disciplinaId: d.disciplinaId });
      const depois = blocos.filter((b) => b.topicoId).length;
      this.aplicarEstruturaAoMaterial(d.id, d.estrutura); // re-deriva topicoIds/topicoPaginas + commit
      relatorio.push({ id: d.id, titulo: d.titulo, antes, depois });
    }
    return relatorio;
  },
  // F2: REFINO por IA (leve: só os títulos + a lista de tópicos). Sobrescreve o topicoId dos blocos
  // pelo casamento semântico da IA quando ela retorna um tópico válido. Requer iaDisponivel().
  // `disciplinaId` ANCORA o casamento na matéria já declarada do material, como o caminho
  // determinístico (`casarEstruturaComEdital`) sempre fez. Sem isso, a IA recebia os tópicos do
  // edital INTEIRO e um clique em "refinar com IA" desfazia a âncora: foi assim que aulas de
  // português foram parar em tópicos de Direito Constitucional.
  async casarEstruturaComEditalIA(estrutura, disciplinaId = null) {
    if (!estrutura || !Array.isArray(estrutura.blocos) || !estrutura.blocos.length) return estrutura;
    if (!this.iaDisponivel() || !state.topicos.length) return this.casarEstruturaComEdital(estrutura);
    const universo = disciplinaId ? state.topicos.filter((t) => t.disciplinaId === disciplinaId) : state.topicos;
    // Disciplina declarada mas sem tópico nenhum: cair no edital inteiro seria pior que não
    // refinar, porque devolveria justamente o vínculo cruzado que a âncora existe para impedir.
    if (!universo.length) return this.casarEstruturaComEdital(estrutura, null, { disciplinaId });
    const titulos = estrutura.blocos.map((b) => b.titulo);
    const nomes = await iaProv.casarTitulosComTopicos(state.config, { titulos, topicos: universo.map((t) => t.nome) });
    estrutura.blocos.forEach((b, i) => {
      const nome = nomes[i];
      // `restrito` porque a âncora só vale se ela impedir a saída da disciplina: sem isso o
      // casamento flexível reencontraria o tópico de outra matéria e o filtro seria decorativo.
      const t = nome ? (universo.find((x) => x.nome.trim().toLowerCase() === nome.trim().toLowerCase()) || this.acharTopicoPorNome(nome, { disciplinaId, restrito: !!disciplinaId })) : null;
      if (t) { b.topicoId = t.id; b.confianca = Math.min(0.99, Math.max(b.confianca || 0.7, 0.9)); }
    });
    // mantém o casamento de aula
    const aula = estrutura.aulaTitulo ? this.acharAulaPorTitulo(estrutura.aulaTitulo) : null;
    if (aula) { estrutura.aulaId = aula.id; estrutura.aulaNome = aula.nome; }
    return estrutura;
  },
  // F3: aplica a estrutura ao material — grava a estrutura editada e DERIVA os vínculos:
  // topicoIds (tópicos com bloco) + topicoPaginas (faixa min–max das páginas dos blocos de cada tópico).
  // Devolve quantos tópicos foram vinculados.
  aplicarEstruturaAoMaterial(docId, estrutura) {
    const d = state.documentos.find((x) => x.id === docId);
    if (!d || !estrutura) return 0;
    d.estrutura = estrutura;
    const porTopico = {};
    for (const b of estrutura.blocos || []) {
      if (!b.topicoId) continue;
      const pi = b.pIni || 1, pf = Math.max(pi, b.pFim || pi);
      if (!porTopico[b.topicoId]) porTopico[b.topicoId] = { ini: pi, fim: pf };
      else { porTopico[b.topicoId].ini = Math.min(porTopico[b.topicoId].ini, pi); porTopico[b.topicoId].fim = Math.max(porTopico[b.topicoId].fim, pf); }
    }
    d.topicoIds = Object.keys(porTopico);
    d.topicoId = d.topicoIds[0] || d.topicoId || null;
    d.topicoPaginas = {};
    for (const [tid, r] of Object.entries(porTopico)) d.topicoPaginas[tid] = [r.ini, r.fim];
    commit();
    return d.topicoIds.length;
  },
  // Opcional 2: RE-DETECTA a estrutura de um material salvo a partir do texto atual das páginas
  // (útil após OCR de páginas escaneadas, ou quando a 1ª detecção saiu ruim). Preserva os tópicos
  // já confirmados (casa por título) e re-casa os demais. Não tem fonte/outline (são transitórios).
  async redetectarEstruturaDoc(docId) {
    await this.exigirConteudoDoc(docId); // sem o texto do material isto seria um palpite
    const d = state.documentos.find((x) => x.id === docId);
    if (!d || !Array.isArray(d.paginas) || !d.paginas.length) return null;
    const est = detectarEstrutura({ paginas: d.paginas, numPaginas: d.paginas.length });
    // Detecção nova sem blocos NÃO é o mesmo que "deu errado": quando o sumário atual veio de
    // um fallback fraco (tamanho de fonte, numeração solta), o vazio é a resposta CERTA — foi
    // assim que 4 materiais do curso completo ficaram com o texto inteiro picado em 254 blocos
    // (v0.8.20 pôs guarda no detector). Mantendo o antigo, o usuário não tinha COMO limpar pela
    // interface. Sumário de fonte forte (índice/marcadores do PDF) continua protegido.
    if (!est || !est.blocos.length) {
      const fraco = ["fonte", "numeracao", "marcador"].includes((d.estrutura || {}).origem);
      if (!fraco) return null;
      this.aplicarEstruturaAoMaterial(docId, { aulaTitulo: (d.estrutura || {}).aulaTitulo || null, aulaId: (d.estrutura || {}).aulaId || null, aulaNome: (d.estrutura || {}).aulaNome || null, origem: null, blocos: [] });
      return { origem: null, blocos: [], limpou: true };
    }
    this.casarEstruturaComEdital(est, d.titulo, { disciplinaId: d.disciplinaId });
    this._herdarTopicos(est, d.estrutura); // mantém o que o usuário já confirmou
    d.estrutura = est;
    commit();
    return est;
  },
  // Opcional 1: ATUALIZA um material existente com uma nova importação (apostila atualizada),
  // mantendo o MESMO id (questões/flashcards/marcações que apontam para ele continuam válidos) e
  // herdando os tópicos confirmados dos blocos de mesmo título. Re-deriva os vínculos das páginas.
  atualizarMaterialDeImport(docId, { texto, paginas, pdfData, imgData, estrutura, titulo }) {
    const d = state.documentos.find((x) => x.id === docId);
    if (!d) return null;
    // Atualizar por botão permite renomear junto: o cursinho às vezes muda o nome do arquivo
    // entre as versões, e o material continua sendo o mesmo (mesmo id, mesmos vínculos).
    if (titulo && titulo.trim() && titulo.trim() !== d.titulo) d.titulo = titulo.trim();
    // Quando o arquivo é REIMPORTADO, o material passa a valer daquela data — é o que responde
    // "isto ainda é a versão do cursinho?" meses depois. `criadoEm` continua sendo a 1ª entrada.
    if (paginas || pdfData || imgData || texto != null) d.atualizadoEm = nowISO();
    if (estrutura) this._herdarTopicos(estrutura, d.estrutura);
    if (paginas) d.paginas = paginas;
    if (texto != null) d.texto = texto;
    if (pdfData || imgData) {
      if (pdfData) { d.temPdf = true; d.binarioDescartado = false; }
      if (imgData) d.temImg = true;
      guardarBinarioDoc(d, pdfData || null, imgData || null);
    }
    recomputarTextoDoc(d);
    d.estrutura = estrutura || d.estrutura;
    if (d.estrutura) this.aplicarEstruturaAoMaterial(d.id, d.estrutura); // re-deriva topicoIds + topicoPaginas + commit
    else commit();
    return d;
  },
  // Copia o topicoId de blocos antigos para os novos de MESMO título (preserva o trabalho do usuário).
  _herdarTopicos(novaEst, antigaEst) {
    if (!novaEst || !novaEst.blocos || !antigaEst || !antigaEst.blocos) return;
    const norm = (s) => String(s || "").toLowerCase().trim();
    const mapa = {};
    antigaEst.blocos.forEach((b) => { if (b.topicoId) mapa[norm(b.titulo)] = b.topicoId; });
    novaEst.blocos.forEach((b) => { if (!b.topicoId) { const t = mapa[norm(b.titulo)]; if (t) b.topicoId = t; } });
  },
  // Acha um material existente pelo título (normalizado) — base do "atualizar em vez de duplicar".
  acharDocPorTitulo(titulo) {
    const norm = (s) => String(s || "").toLowerCase().trim();
    const t = norm(titulo);
    return t ? state.documentos.find((d) => norm(d.titulo) === t) : null;
  },
  // F2: refina (IA) a estrutura de um material JÁ salvo e persiste.
  async refinarEstruturaDocIA(docId) {
    await this.garantirConteudoDoc(docId); // conteúdo sob demanda
    const d = state.documentos.find((x) => x.id === docId);
    if (!d || !d.estrutura) return null;
    await this.casarEstruturaComEditalIA(d.estrutura, d.disciplinaId || null); // ancora na materia do material
    commit();
    return d.estrutura;
  },
  // Grava as questões MC aprovadas no preview (com metadados e tópico por item, se houver).
  // Devolve {criadas, semGabarito} — a tela precisa saber quantas ficaram de fora e por quê.
  aceitarQuestoes(itens, topicoId) {
    let n = 0, semGabarito = 0;
    for (const q of itens || []) {
      const alternativas = (q.alternativas || []).map((a) => (a || "").trim()).filter(Boolean);
      if (!(q.enunciado || "").trim() || alternativas.length < 2) continue;
      // Gabarito ausente ou fora do intervalo NÃO vira 0 ("A"). Uma questão com gabarito
      // inventado é pior que questão nenhuma: o aluno memoriza a resposta errada e o caderno
      // de erros ainda o culpa por ela.
      const gabarito = Number.isInteger(q.gabarito) ? q.gabarito : Number.NaN;
      if (!(gabarito >= 0 && gabarito < alternativas.length)) { semGabarito++; continue; }
      this.addQuestao({
        // "Vincular todas ao tópico" (topicoId) é o PADRÃO: só cai nele quando a questão não
        // trouxe um tópico próprio. O preview devolve null/"" (não undefined) quando fica "sem
        // tópico", então tratamos null/"" como ausência para o padrão valer.
        topicoId: q.topicoId != null && q.topicoId !== "" ? q.topicoId : topicoId || null,
        enunciado: q.enunciado.trim(), alternativas, gabarito, selo: "manual",
        referencia: q.referencia || null, assunto: q.assunto || null, banca: q.banca || null, ano: q.ano || null, orgao: q.orgao || null, nivel: q.nivel || null,
      });
      n++;
    }
    return { criadas: n, semGabarito };
  },
  // Geração de questões pela IA (online). Requer iaDisponivel() — a UI bloqueia antes.
  async gerarQuestoesDeDoc(docId, n = 5, dificuldade = "medio", bloco = null) {
    await this.exigirConteudoDoc(docId); // conteúdo sob demanda: no aparelho que só tem o esqueleto, desce agora
    const doc = state.documentos.find((d) => d.id === docId);
    if (!doc) return [];
    const { texto, topicoId, fonte, banca } = ctxDeDoc(doc, bloco);
    if (!texto.trim()) return [];
    const qs = await iaProv.gerarQuestoes(state.config, {
      texto,
      contexto: nomeContexto(state, topicoId),
      n,
      ...iaExtras(state, { topicoId, dificuldade }),
    });
    return qs.map((q) => this.addQuestao({ ...q, topicoId, fonte, banca })).filter(Boolean);
  },
  // Gera SEM material, só com o conhecimento do modelo — e só quando o usuário pediu isso
  // explicitamente, sabendo que não há fonte. As questões nascem com selo "semfonte" e, se o
  // assunto casar com um tópico já cadastrado, ficam vinculadas a ele (para aparecerem no
  // lugar certo); senão ficam soltas, sem inventar tópico.
  // Devolve { questoes, pedidas, geradas, descartadas } — os contadores sobem para a tela
  // poder dizer a verdade quando o filtro de números derrubar parte do lote.
  async gerarQuestoesSemFonte(assunto, n = 5, dificuldade = "medio", web = false, formato = "mc") {
    const t = this.acharTopicoPorNome(assunto);
    const topicoId = t ? t.id : null;
    const r = await iaProv.gerarQuestoesSemFonte(state.config, {
      assunto,
      n,
      web,
      formato,
      ...iaExtras(state, { topicoId, dificuldade }),
    });
    // Com busca, a fonte deixa de ser "nenhuma" e vira a lista de páginas — guardada junto da
    // questão para você poder conferir de onde saiu, que é o ponto de ligar a web.
    const titulo = r.comWeb ? `Fonte na web · ${assunto}` : `Sem fonte · ${assunto}`;
    const meta = { topicoId, fonte: { titulo, web: r.comWeb ? (r.fontesWeb || []).slice(0, 6) : undefined } };
    const salvas = (r.questoes || []).map((q) =>
      formato === "ce"
        ? this.addQuestaoCE({ ...q, enunciado: q.enunciado || q.afirmacao, selo: q.selo, ...meta })
        : this.addQuestao({ ...q, selo: q.selo, ...meta })
    ).filter(Boolean); // addQuestao recusa item sem gabarito válido
    return { questoes: salvas, pedidas: r.pedidas, geradas: r.geradas, descartadas: r.descartadas,
      comWeb: r.comWeb, fontesWeb: r.fontesWeb || [] };
  },

  // EXTRAI as questões que já existem no próprio material (não inventa). Online.
  async extrairQuestoesDeDoc(docId, bloco = null) {
    await this.exigirConteudoDoc(docId); // conteúdo sob demanda: no aparelho que só tem o esqueleto, desce agora
    const doc = state.documentos.find((d) => d.id === docId);
    if (!doc) return [];
    const { texto, topicoId, fonte, banca } = ctxDeDoc(doc, bloco);
    if (!texto.trim()) return [];
    const qs = await iaProv.extrairQuestoes(state.config, {
      texto,
      contexto: nomeContexto(state, topicoId),
    });
    return qs.map((q) => this.addQuestao({ ...q, topicoId, fonte, banca: q.banca || banca })).filter(Boolean);
  },
  // ---- CERTO/ERRADO (formato 'ce') ----
  // Importa itens C/E: uma linha por item: afirmação | C ou E | justificativa (opcional).
  // Aceita C/E, certo/errado, V/F, verdadeiro/falso. Também "ref:" para a referência.
  importQuestoesCE(texto, topicoId) {
    const linhas = (texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let n = 0;
    for (const l of linhas) {
      const partes = l.split("|").map((p) => p.trim());
      if (partes.length < 2) continue;
      const enunciado = partes[0];
      const g = (partes[1] || "").toLowerCase();
      let referencia = null;
      let justificativa = partes.slice(2).filter(Boolean).join(" | ");
      const mRef = justificativa.match(/ref:\s*([^|]+)/i);
      if (mRef) {
        referencia = mRef[1].trim();
        justificativa = justificativa.replace(/ref:\s*[^|]+/i, "").trim();
      }
      const ehCerto = /^(c|certo|v|verdadeiro|true)$/.test(g);
      const ehErrado = /^(e|errado|f|falso|false)$/.test(g);
      if (!enunciado || (!ehCerto && !ehErrado)) continue;
      this.addQuestaoCE({ topicoId, enunciado, certo: ehCerto, justificativa, selo: "manual", referencia });
      n++;
    }
    return n;
  },
  // PREVIEW (não grava) dos itens Certo/Errado colados. Devolve [{enunciado, certo:bool, justificativa, referencia}].
  prepararQuestoesCE(texto) {
    const linhas = String(texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (const l of linhas) {
      const partes = l.split("|").map((p) => p.trim());
      if (partes.length < 2) continue;
      const enunciado = partes[0];
      const g = (partes[1] || "").toLowerCase();
      let referencia = null;
      let justificativa = partes.slice(2).filter(Boolean).join(" | ");
      const mRef = justificativa.match(/ref:\s*([^|]+)/i);
      if (mRef) { referencia = mRef[1].trim(); justificativa = justificativa.replace(/ref:\s*[^|]+/i, "").trim(); }
      const ehCerto = /^(c|certo|v|verdadeiro|true)$/.test(g);
      const ehErrado = /^(e|errado|f|falso|false)$/.test(g);
      if (!enunciado || (!ehCerto && !ehErrado)) continue;
      out.push({ enunciado, certo: ehCerto, justificativa, referencia });
    }
    return out;
  },
  // PREVIEW inteligente C/E: determinístico `|` primeiro; se nada e houver IA, extração rica do PDF.
  async prepararQuestoesCEAuto(texto) {
    const det = this.prepararQuestoesCE(texto);
    if (det.length) return det;
    if (this.iaDisponivel()) {
      const ia = await this.extrairProvaEmPedacos(texto, "ce");
      if (ia.length) return ia;
    }
    return det;
  },
  // Grava os itens C/E aprovados no preview (com metadados e tópico por item).
  aceitarQuestoesCE(itens, topicoId) {
    let n = 0;
    for (const q of itens || []) {
      if (!(q.enunciado || "").trim()) continue;
      this.addQuestaoCE({
        topicoId: q.topicoId != null && q.topicoId !== "" ? q.topicoId : topicoId || null,
        enunciado: q.enunciado.trim(), certo: !!q.certo, justificativa: (q.justificativa || "").trim(), selo: "manual",
        referencia: q.referencia || null, assunto: q.assunto || null, banca: q.banca || null, ano: q.ano || null, orgao: q.orgao || null, nivel: q.nivel || null,
      });
      n++;
    }
    return n;
  },
  async gerarQuestoesCEDeDoc(docId, n = 6, dificuldade = "medio", bloco = null) {
    await this.exigirConteudoDoc(docId); // conteúdo sob demanda: no aparelho que só tem o esqueleto, desce agora
    const doc = state.documentos.find((d) => d.id === docId);
    if (!doc) return [];
    const { texto, topicoId, fonte, banca } = ctxDeDoc(doc, bloco);
    if (!texto.trim()) return [];
    const itens = await iaProv.gerarQuestoesCE(state.config, {
      texto,
      contexto: nomeContexto(state, topicoId),
      n,
      ...iaExtras(state, { topicoId, dificuldade }),
    });
    return itens.map((x) => this.addQuestaoCE({ ...x, enunciado: x.enunciado || x.afirmacao, topicoId, fonte, banca }));
  },
  async extrairQuestoesCEDeDoc(docId, bloco = null) {
    await this.exigirConteudoDoc(docId); // conteúdo sob demanda: no aparelho que só tem o esqueleto, desce agora
    const doc = state.documentos.find((d) => d.id === docId);
    if (!doc || !doc.texto.trim()) return [];
    const { texto, topicoId, fonte } = ctxDeDoc(doc, bloco); // simetria com extrairQuestoesDeDoc: aceita bloco/tópico
    if (!texto.trim()) return [];
    const itens = await iaProv.extrairQuestoesCE(state.config, {
      texto,
      contexto: nomeContexto(state, topicoId),
    });
    return itens.map((x) => this.addQuestaoCE({ ...x, enunciado: x.enunciado || x.afirmacao, topicoId, fonte }));
  },
  // PREVIEW (não grava) da EXTRAÇÃO de questões já existentes no material (IA). Usa o extrator RICO:
  // captura referência/assunto/banca/ano/órgão SE estiverem no material (não inventa) e aplica o
  // gabarito de um bloco de respostas, se houver. Caso o material não tenha esses dados, ficam vazios.
  async prepararQuestoesDeDoc(docId) {
    await this.exigirConteudoDoc(docId); // conteúdo sob demanda: no aparelho que só tem o esqueleto, desce agora
    const doc = state.documentos.find((d) => d.id === docId);
    if (!doc || !doc.texto.trim()) return [];
    const qs = await iaProv.extrairQuestoesPDF(state.config, { texto: doc.texto, formato: "mc" });
    return qs.map((q) => ({ ...q, topicoId: topicoDoDoc(doc) || undefined }));
  },
  async prepararQuestoesCEDeDoc(docId) {
    await this.exigirConteudoDoc(docId); // conteúdo sob demanda: no aparelho que só tem o esqueleto, desce agora
    const doc = state.documentos.find((d) => d.id === docId);
    if (!doc || !doc.texto.trim()) return [];
    const itens = await iaProv.extrairQuestoesPDF(state.config, { texto: doc.texto, formato: "ce" });
    return itens.map((x) => ({ ...x, enunciado: x.enunciado || x.afirmacao || "", topicoId: topicoDoDoc(doc) || undefined }));
  },
  editarQuestao(id, { enunciado, alternativas, gabarito, topicoId, nivel, referencia, justificativa, assunto, banca, ano, orgao }) {
    const q = state.questoes.find((x) => x.id === id);
    if (!q) return null;
    if (enunciado !== undefined) q.enunciado = (enunciado || "").trim();
    if (alternativas !== undefined) q.alternativas = (alternativas || []).map((a) => String(a));
    if (gabarito !== undefined && Number.isInteger(gabarito)) q.gabarito = gabarito;
    if (nivel !== undefined) q.nivel = nivel || null;
    if (assunto !== undefined) q.assunto = (assunto || "").trim() || null;
    if (banca !== undefined) q.banca = (banca || "").trim() || null;
    if (ano !== undefined) q.ano = (ano || "").toString().trim() || null;
    if (orgao !== undefined) q.orgao = (orgao || "").trim() || null;
    if (referencia !== undefined) q.referencia = (referencia || "").trim() || null;
    if (justificativa !== undefined) q.justificativa = (justificativa || "").trim() || null;
    if (topicoId !== undefined) {
      q.topicoId = topicoId || null;
      const t = topicoId ? state.topicos.find((x) => x.id === topicoId) : null;
      q.disciplinaId = t ? t.disciplinaId : null;
    }
    commit();
    return q;
  },
  removerQuestao(id) {
    state.questoes = state.questoes.filter((q) => q.id !== id);
    state.tentativas = state.tentativas.filter((t) => t.questaoId !== id);
    commit();
  },
  // Comentário da QUESTÃO pela IA (sob demanda, ): explica o gabarito. A UI bloqueia
  // antes via iaDisponivel(). Guarda em q.comentarioIA.
  async comentarQuestaoIA(questaoId, duvida = "") {
    const q = state.questoes.find((x) => x.id === questaoId);
    if (!q) return null;
    const r = await iaProv.comentarQuestao(state.config, {
      enunciado: q.enunciado,
      alternativas: q.alternativas,
      correta: q.formato === "ce" ? (q.gabarito === 0 ? "Certo" : "Errado") : q.gabarito,
      formato: q.formato,
      duvida: (duvida || "").trim() || undefined, // dúvida do aluno (opcional) considerada pela IA
    });
    q.comentarioIA = { resumido: r.resumido, detalhado: r.detalhado };
    commit();
    return r;
  },

  // ---------- tentativas / caderno de erros ----------
  registrarTentativa({ questaoId, escolha, tempoSeg }) {
    const q = state.questoes.find((x) => x.id === questaoId);
    if (!q) return null;
    const acertou = escolha === q.gabarito;
    const t = {
      id: uid("tent"),
      questaoId,
      topicoId: q.topicoId,
      acertou,
      escolha,
      tempoSeg: tempoSeg || 0,
      motivoErro: null,
      duvida: null,
      comentarioIA: null,
      data: nowISO(),
    };
    state.tentativas.push(t);
    ultimaTentativa = t.id; // permite desfazer o toque errado (ver desfazerUltimaTentativa)
    commit();
    return t;
  },
  // Desfaz a ÚLTIMA tentativa registrada. Na LISTA de questões o toque numa alternativa grava
  // a resposta na hora, sem confirmar (no modo foco há selecionar → confirmar), e no celular o
  // alvo é o card inteiro: um toque errado virava erro permanente no caderno. "Refazer"
  // ACRESCENTA uma tentativa nova, não apaga a anterior, então o erro continuava lá.
  // Só a última, e só nesta sessão.
  desfazerUltimaTentativa() {
    if (!ultimaTentativa) return null;
    const i = state.tentativas.findIndex((t) => t.id === ultimaTentativa);
    ultimaTentativa = null;
    if (i < 0) return null;
    const [t] = state.tentativas.splice(i, 1);
    commit();
    return t;
  },
  podeDesfazerTentativa() {
    return !!ultimaTentativa && state.tentativas.some((t) => t.id === ultimaTentativa);
  },
  idUltimaTentativa() {
    return ultimaTentativa;
  },
  setMotivoErro(tentativaId, motivo) {
    const t = state.tentativas.find((x) => x.id === tentativaId);
    if (t) {
      t.motivoErro = motivo;
      commit();
    }
  },
  setDuvida(tentativaId, duvida) {
    const t = state.tentativas.find((x) => x.id === tentativaId);
    if (t) {
      t.duvida = duvida;
      commit();
    }
  },
  // Comentário do erro pela IA (online). Requer iaDisponivel() — a UI bloqueia antes.
  async comentarErroIA(tentativaId) {
    const t = state.tentativas.find((x) => x.id === tentativaId);
    if (!t) return null;
    const q = state.questoes.find((x) => x.id === t.questaoId);
    if (!q) return null;
    const r = await iaProv.comentarErro(state.config, {
      enunciado: q.enunciado,
      escolhida: q.alternativas[t.escolha],
      correta: q.alternativas[q.gabarito],
      motivo: t.motivoErro,
      duvida: t.duvida, // a dúvida escrita pelo aluno agora é considerada pela IA
    });
    t.comentarioIA = { resumido: r.resumido, detalhado: r.detalhado };
    commit();
    return r;
  },
  // Lista de erros: tentativas erradas (com a questão embutida) + erros manuais.
  cadernoErros() {
    const deQuestoes = state.tentativas
      .filter((t) => !t.acertou && !t.foraDoCaderno)
      .map((t) => ({ ...t, manual: false, questao: state.questoes.find((q) => q.id === t.questaoId) }))
      .filter((e) => e.questao);
    const manuais = state.errosManuais.map((e) => ({ ...e, manual: true }));
    return [...deQuestoes, ...manuais].sort((a, b) => (a.data < b.data ? 1 : -1));
  },
  // Tira um erro de QUESTÃO do caderno (soft-remove): a tentativa permanece para
  // o aproveitamento/Acompanhamento, mas não aparece mais no caderno.
  removerErroQuestao(tentativaId) {
    const t = state.tentativas.find((x) => x.id === tentativaId);
    if (t) {
      t.foraDoCaderno = true;
      commit();
    }
  },

  // ---------- erros manuais (inclusão/importação no caderno) ----------
  addErroManual({ disciplinaId, topicoId, descricao, correto, suaResposta, motivoErro, comentario, flashcardId }) {
    // Salvar à mão um card que já entrou automático substitui o registro auto (evita duplicar).
    if (flashcardId) state.errosManuais = state.errosManuais.filter((x) => x.flashcardId !== flashcardId);
    const e = {
      id: uid("errm"),
      flashcardId: flashcardId || null,
      auto: false,
      disciplinaId: disciplinaId || null,
      topicoId: topicoId || null,
      descricao: (descricao || "").trim(),
      correto: (correto || "").trim(),
      suaResposta: (suaResposta || "").trim(),
      motivoErro: motivoErro || null,
      comentarioIA: (comentario || "").trim() || null,
      duvida: null,
      data: nowISO(),
    };
    state.errosManuais.push(e);
    commit();
    return e;
  },
  editarErroManual(id, patch) {
    const e = state.errosManuais.find((x) => x.id === id);
    if (!e) return;
    for (const k of ["disciplinaId", "topicoId", "descricao", "correto", "suaResposta", "motivoErro"]) {
      if (patch[k] !== undefined) e[k] = patch[k];
    }
    commit();
  },
  removerErroManual(id) {
    state.errosManuais = state.errosManuais.filter((e) => e.id !== id);
    commit();
  },

  // ---------- lembretes (recados livres — texto + data opcional; não é estudo) ----------
  // Ordem: pendentes primeiro (com data por data crescente, depois sem data), feitos por último.
  lembretes() {
    const arr = state.lembretes || [];
    const rank = (l) => (l.feito ? 2 : 0);
    return [...arr].sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (!a.feito) {
        if (a.data && b.data) return a.data < b.data ? -1 : a.data > b.data ? 1 : 0;
        if (a.data) return -1; // com data antes de sem data
        if (b.data) return 1;
      }
      return (b.criadoEm || "").localeCompare(a.criadoEm || ""); // recentes primeiro
    });
  },
  addLembrete(texto, data) {
    const t = (texto || "").trim();
    if (!t) return null;
    if (!state.lembretes) state.lembretes = [];
    const l = { id: uid("lem"), texto: t, data: data || null, feito: false, criadoEm: nowISO() };
    state.lembretes.push(l);
    commit();
    return l;
  },
  editarLembrete(id, patch) {
    const l = (state.lembretes || []).find((x) => x.id === id);
    if (!l) return;
    if (patch.texto !== undefined) l.texto = (patch.texto || "").trim();
    if (patch.data !== undefined) l.data = patch.data || null;
    commit();
  },
  toggleLembrete(id) {
    const l = (state.lembretes || []).find((x) => x.id === id);
    if (l) { l.feito = !l.feito; commit(); }
  },
  removerLembrete(id) {
    state.lembretes = (state.lembretes || []).filter((l) => l.id !== id);
    commit();
  },
  lembretesPendentes() {
    return (state.lembretes || []).filter((l) => !l.feito).length;
  },
  // Lembretes com data já vencida (ou hoje) e ainda não feitos — o Mentor cobra estes.
  lembretesVencidos() {
    const hoje = todayISO();
    return (state.lembretes || [])
      .filter((l) => !l.feito && l.data && l.data <= hoje)
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  },

  // Classifica o motivo do erro de um flashcard (no registro AUTO criado ao "Errei").
  classificarErroFlashcard(flashcardId, motivo) {
    const e = state.errosManuais.find((x) => x.flashcardId === flashcardId);
    if (e) { e.motivoErro = motivo || null; commit(); }
  },
  setMotivoErroManual(id, motivo) {
    const e = state.errosManuais.find((x) => x.id === id);
    if (e) {
      e.motivoErro = motivo;
      commit();
    }
  },
  importErrosManuais(texto, disciplinaId, topicoId) {
    const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let n = 0;
    for (const l of linhas) {
      let partes;
      if (l.includes("\t")) partes = l.split("\t");
      else if (l.includes("|")) partes = l.split("|");
      else if (l.includes(";")) partes = l.split(";");
      else partes = [l];
      const descricao = (partes[0] || "").trim();
      const correto = (partes[1] || "").trim();
      const motivo = (partes[2] || "").trim() || null;
      if (descricao) {
        this.addErroManual({ disciplinaId, topicoId, descricao, correto, motivoErro: motivo });
        n++;
      }
    }
    return n;
  },
  // PREVIEW (não grava): quebra o texto colado em erros {descricao, correto, motivoErro}.
  // Formato por linha: descrição | resposta correta | motivo (os dois últimos opcionais).
  prepararErros(texto) {
    return String(texto || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        let partes;
        if (l.includes("\t")) partes = l.split("\t");
        else if (l.includes("|")) partes = l.split("|");
        else if (l.includes(";")) partes = l.split(";");
        else partes = [l];
        return {
          descricao: (partes[0] || "").trim(),
          correto: (partes[1] || "").trim(),
          motivoErro: (partes[2] || "").trim() || null,
        };
      })
      .filter((it) => it.descricao);
  },
  // Grava os erros aprovados no preview (disciplina/tópico comuns vêm do painel).
  aceitarErros(itens, disciplinaId, topicoId) {
    let n = 0;
    for (const it of itens || []) {
      if (!(it.descricao || "").trim()) continue;
      this.addErroManual({ disciplinaId, topicoId, descricao: it.descricao, correto: it.correto, motivoErro: it.motivoErro || null });
      n++;
    }
    return n;
  },
  // Edita o comentário de um erro (manual ou de questão).
  setComentarioErro(id, texto, manual) {
    const arr = manual ? state.errosManuais : state.tentativas;
    const e = arr.find((x) => x.id === id);
    if (e) {
      e.comentarioIA = (texto || "").trim() || null;
      commit();
    }
  },

  // ---------- flashcards ----------
  addFlashcard({ topicoId, disciplinaId, frente, verso, selo, fonte, tipo, gabaritoCerto }) {
    // Garante a disciplina coerente: se veio um tópico, herda a disciplina dele.
    let discId = disciplinaId || null;
    if (topicoId) {
      const t = state.topicos.find((x) => x.id === topicoId);
      if (t) discId = t.disciplinaId;
    }
    const f = {
      id: uid("fc"),
      topicoId: topicoId || null,
      disciplinaId: discId,
      tipo: tipo === "afirmacao" ? "afirmacao" : "qa",
      gabaritoCerto: tipo === "afirmacao" ? !!gabaritoCerto : null,
      frente: (frente || "").trim(),
      verso: (verso || "").trim(),
      selo: selo || "verde",
      fonte: fonte || null,
      sm2: sm2.novoSM2(),
      criadoEm: nowISO(),
      geracaoId: loteGeracao ? loteGeracao.id : null, // lote de geração (filtro "só os recém-gerados")
      geracaoRotulo: loteGeracao ? loteGeracao.rotulo : null,
    };
    state.flashcards.push(f);
    commit();
    return f;
  },
  // Lote de geração: o handler abre um lote antes de gerar e encerra depois; tudo criado no meio
  // ganha o mesmo geracaoId (a tela mostra "só os recém-gerados de X" até o usuário ver todos).
  // `geracoesEmVoo` é um CONTADOR (não um booleano): fluxos podem aninhar lotes, e um
  // `encerrar` de dentro não pode declarar que o de fora acabou. Ver geracaoEmAndamento().
  iniciarLoteGeracao(rotulo) { geracoesEmVoo++; loteGeracao = { id: uid("ger"), rotulo: (rotulo || "").trim(), em: nowISO() }; return loteGeracao.id; },
  encerrarLoteGeracao() { geracoesEmVoo = Math.max(0, geracoesEmVoo - 1); const id = loteGeracao ? loteGeracao.id : null; loteGeracao = null; return id; },
  // Há geração de IA em curso? A sincronização automática consulta isto antes de BAIXAR:
  // um merge "o mais recente vence" no meio de uma geração substitui o estado inteiro e os
  // itens recém-criados somem. No celular isso é frequente — a aba esconde/volta a cada vez
  // que a tela apaga, e cada volta dispara uma sync.
  geracaoEmAndamento() { return geracoesEmVoo > 0; },
  limparFlashcards() { const n = state.flashcards.length; state.flashcards = []; commit(); return n; },
  contarGeracao(geracaoId, tipo) {
    if (!geracaoId) return 0;
    if (tipo === "flashcards") return state.flashcards.filter((f) => f.geracaoId === geracaoId).length;
    if (tipo === "ce") return state.questoes.filter((q) => q.geracaoId === geracaoId && q.formato === "ce").length;
    return state.questoes.filter((q) => q.geracaoId === geracaoId && q.formato !== "ce").length;
  },
  // Geração de flashcards pela IA (online). Requer iaDisponivel() — a UI bloqueia antes.
  async gerarFlashcardsDeDoc(docId, n = 6, dificuldade = "medio", bloco = null) {
    await this.exigirConteudoDoc(docId); // conteúdo sob demanda: no aparelho que só tem o esqueleto, desce agora
    const doc = state.documentos.find((d) => d.id === docId);
    if (!doc) return [];
    const { texto, topicoId, fonte } = ctxDeDoc(doc, bloco);
    if (!texto.trim()) return [];
    const cards = await iaProv.gerarFlashcards(state.config, {
      texto,
      contexto: nomeContexto(state, topicoId),
      n,
      ...iaExtras(state, { topicoId, dificuldade }),
    });
    return cards.map((c) => this.addFlashcard({ ...c, topicoId, fonte, selo: "amarelo" }));
  },
  // Gera afirmações Certo/Errado a partir das questões (gabarito = Certo; 1 distrator = Errado).
  gerarAfirmacoesDeQuestoes(filtroTopico = "todos") {
    const questoes = state.questoes.filter((q) => filtroTopico === "todos" || q.topicoId === filtroTopico);
    const criados = [];
    for (const q of questoes) {
      const correta = q.alternativas[q.gabarito];
      const fonte = { tipo: "questao", titulo: "Questão: " + q.enunciado.slice(0, 40) };
      criados.push(
        this.addFlashcard({
          tipo: "afirmacao",
          gabaritoCerto: true,
          frente: `${q.enunciado}\nAfirmação: ${correta}`,
          verso: "CERTO — corresponde à resposta correta.",
          topicoId: q.topicoId,
          disciplinaId: q.disciplinaId,
          selo: "amarelo",
          fonte,
        })
      );
      const distIdx = q.alternativas.findIndex((_, i) => i !== q.gabarito);
      if (distIdx >= 0) {
        criados.push(
          this.addFlashcard({
            tipo: "afirmacao",
            gabaritoCerto: false,
            frente: `${q.enunciado}\nAfirmação: ${q.alternativas[distIdx]}`,
            verso: `ERRADO — a correta é: ${correta}.`,
            topicoId: q.topicoId,
            disciplinaId: q.disciplinaId,
            selo: "amarelo",
            fonte,
          })
        );
      }
    }
    return criados;
  },
  // Gera flashcards a partir das questões (resposta = gabarito comentado).
  gerarFlashcardsDeQuestoes(filtroTopico = "todos") {
    const questoes = state.questoes.filter(
      (q) => filtroTopico === "todos" || q.topicoId === filtroTopico
    );
    const criados = [];
    for (const q of questoes) {
      const c = ia.flashcardDeQuestao(q);
      const fonte = { tipo: "questao", id: q.id, titulo: "Questão: " + q.enunciado.slice(0, 40) };
      criados.push(this.addFlashcard({ ...c, topicoId: q.topicoId, fonte }));
    }
    return criados;
  },
  // Versão COM IA: o verso explica o porquê do gabarito (didático). Online (gated).
  async gerarFlashcardsComentadosDeQuestoes(filtroTopico = "todos") {
    const questoes = state.questoes.filter((q) => filtroTopico === "todos" || q.topicoId === filtroTopico);
    if (!questoes.length) return [];
    const cards = await iaProv.comentarQuestoesParaFlashcards(state.config, {
      questoes: questoes.slice(0, 25).map((q) => ({ enunciado: q.enunciado, alternativas: q.alternativas, correta: q.gabarito })),
      contexto: nomeContexto(state, questoes[0].topicoId),
    });
    const topicoId = filtroTopico !== "todos" ? filtroTopico : null;
    return cards.map((c) => this.addFlashcard({ ...c, topicoId, fonte: { tipo: "questao", titulo: "Comentário IA de questões" }, selo: "amarelo" }));
  },
  // Explica um flashcard com IA (tira dúvida na revisão) e guarda em f.comentarioIA. Online.
  async comentarFlashcardIA(id) {
    const f = state.flashcards.find((x) => x.id === id);
    if (!f) return null;
    const r = await iaProv.explicarFlashcard(state.config, {
      frente: f.frente,
      verso: f.verso,
      contexto: nomeContexto(state, f.topicoId),
    });
    f.comentarioIA = { resumido: r.resumido, detalhado: r.detalhado };
    commit();
    return f.comentarioIA;
  },
  editarFlashcard(id, { frente, verso, topicoId }) {
    const f = state.flashcards.find((x) => x.id === id);
    if (!f) return;
    if (frente !== undefined) f.frente = frente.trim();
    if (verso !== undefined) f.verso = verso.trim();
    if (topicoId !== undefined) f.topicoId = topicoId || null;
    commit();
  },
  // Gera um flashcard a partir de um erro do caderno (manual ou de questão):
  // frente = enunciado/descrição, verso = resposta correta + comentário.
  gerarFlashcardDeErro(id, manual) {
    let frente, verso, topicoId, disciplinaId, ref;
    if (manual) {
      const e = state.errosManuais.find((x) => x.id === id);
      if (!e) return null;
      frente = e.descricao;
      verso = e.correto || "";
      if (e.comentarioIA) verso += (verso ? "\n\n" : "") + "" + textoComentario(e.comentarioIA);
      topicoId = e.topicoId;
      disciplinaId = e.disciplinaId;
      ref = "Erro: " + e.descricao.slice(0, 40);
    } else {
      const t = state.tentativas.find((x) => x.id === id);
      if (!t) return null;
      const q = state.questoes.find((x) => x.id === t.questaoId);
      if (!q) return null;
      frente = q.enunciado;
      verso = q.alternativas[q.gabarito] || "";
      if (t.comentarioIA) verso += (verso ? "\n\n" : "") + "" + textoComentario(t.comentarioIA);
      topicoId = q.topicoId;
      ref = "Erro: " + q.enunciado.slice(0, 40);
    }
    if (!frente) return null;
    return this.addFlashcard({ frente, verso: verso.trim() || "(complete a resposta)", topicoId, disciplinaId, selo: "amarelo", fonte: { tipo: "erro", titulo: ref } });
  },
  revisarFlashcard(id, quality) {
    const f = state.flashcards.find((x) => x.id === id);
    if (!f) return;
    // Guarda o estado ANTERIOR para o desfazer. Um toque errado no celular (os quatro botões
    // ficam lado a lado) empurrava o cartão por 30 dias sem volta: a única saída era esperar,
    // ou adiar à mão. Fica só o último, em memória, e some ao recarregar o app, que é o
    // comportamento certo para um "Ctrl+Z" de sessão.
    ultimaRevisao = {
      flashcardId: id,
      sm2: { ...f.sm2 },
      erroAutoExistia: state.errosManuais.some((e) => e.flashcardId === id && e.auto),
    };
    f.sm2 = sm2.revisar(f.sm2, quality);
    state.revisoes.push({ id: uid("rev"), flashcardId: id, nota: quality, data: nowISO() });
    // Loop de fraqueza por assunto: além do reagendamento (SM-2), a nota conecta o flashcard
    // ao Caderno de Erros — que é o razão de fraqueza do app (alimenta "erros para refazer" e
    // é marcado por tópico/disciplina). "Errei" registra o card no Caderno (auto, sem duplicar);
    // acertar bem depois ("Bom"/"Fácil") resolve e remove o registro AUTOMÁTICO (não mexe nos
    // que você salvou à mão com motivo/observação).
    if (quality === 0) {
      const jaTem = state.errosManuais.some((e) => e.flashcardId === id);
      if (!jaTem) {
        state.errosManuais.push({
          id: uid("errm"), flashcardId: id, auto: true,
          disciplinaId: f.disciplinaId || null, topicoId: f.topicoId || null,
          descricao: `[Flashcard] ${f.frente}`, correto: f.verso || "", suaResposta: "",
          motivoErro: null, comentarioIA: f.comentarioIA || null, duvida: null, data: nowISO(),
        });
      }
    } else if (quality >= 4) {
      state.errosManuais = state.errosManuais.filter((e) => !(e.flashcardId === id && e.auto));
    }
    commit();
  },
  // Desfaz a ÚLTIMA nota dada a um flashcard: devolve o agendamento anterior, apaga o registro
  // da revisão e desfaz o efeito no Caderno de Erros (o "Errei" que criou um registro
  // automático, ou o "Bom/Fácil" que removeu um). Devolve o card, ou null se não há o que
  // desfazer. Só o último, e só nesta sessão.
  desfazerUltimaRevisao() {
    if (!ultimaRevisao) return null;
    const { flashcardId, sm2: anterior, erroAutoExistia } = ultimaRevisao;
    const f = state.flashcards.find((x) => x.id === flashcardId);
    if (!f) { ultimaRevisao = null; return null; }
    f.sm2 = anterior;
    // Tira o registro da revisão desfeita (o último daquele card).
    for (let i = state.revisoes.length - 1; i >= 0; i--) {
      if (state.revisoes[i].flashcardId === flashcardId) { state.revisoes.splice(i, 1); break; }
    }
    const temAgora = state.errosManuais.some((e) => e.flashcardId === flashcardId && e.auto);
    if (erroAutoExistia && !temAgora) {
      state.errosManuais.push({
        id: uid("errm"), flashcardId, auto: true,
        disciplinaId: f.disciplinaId || null, topicoId: f.topicoId || null,
        descricao: `[Flashcard] ${f.frente}`, correto: f.verso || "", suaResposta: "",
        motivoErro: null, comentarioIA: f.comentarioIA || null, duvida: null, data: nowISO(),
      });
    } else if (!erroAutoExistia && temAgora) {
      state.errosManuais = state.errosManuais.filter((e) => !(e.flashcardId === flashcardId && e.auto));
    }
    ultimaRevisao = null;
    commit();
    return f;
  },
  podeDesfazerRevisao() {
    return !!ultimaRevisao;
  },
  removerFlashcard(id) {
    state.flashcards = state.flashcards.filter((f) => f.id !== id);
    // Remove registros AUTOMÁTICos órfãos deste card no Caderno (mantém os manuais).
    state.errosManuais = state.errosManuais.filter((e) => !(e.flashcardId === id && e.auto));
    commit();
  },
  // Vencidos (due <= hoje), excluindo SUSPENSOS (dispensados) e, opcionalmente,
  // filtrando por disciplina ("disc:<id>") ou tópico ("<topicoId>"). "todos" = tudo.
  flashcardsVencidos(filtro) {
    let arr = state.flashcards.filter((f) => !f.suspenso);
    if (filtro && filtro !== "todos") {
      if (String(filtro).startsWith("disc:")) {
        const id = filtro.slice(5);
        arr = arr.filter((f) => {
          if (f.disciplinaId === id) return true;
          const t = f.topicoId ? state.topicos.find((x) => x.id === f.topicoId) : null;
          return t ? t.disciplinaId === id : false;
        });
      } else {
        arr = arr.filter((f) => f.topicoId === filtro);
      }
    }
    return sm2.vencidos(arr);
  },
  // Relatório dos flashcards: composição do baralho (novos/aprendizado/maduros), vencidos e
  // desempenho das revisões no período (nº revisado + precisão, nota >= 3 = acerto).
  flashcardsRelatorio(dias = 30) {
    const ativos = state.flashcards.filter((f) => !f.suspenso);
    const total = ativos.length;
    const suspensos = state.flashcards.length - total;
    const hoje = todayISO();
    let vencidos = 0, atrasados = 0, novos = 0, maduros = 0, aprendizado = 0;
    for (const f of ativos) {
      const sm = f.sm2 || {};
      const iv = sm.intervaloDias || 0, reps = sm.reps || 0;
      if (sm.dueDate && sm.dueDate <= hoje) { vencidos += 1; if (sm.dueDate < hoje) atrasados += 1; }
      if (reps === 0 && iv === 0) novos += 1;
      else if (iv >= 15) maduros += 1;
      else aprendizado += 1;
    }
    const limite = addDays(hoje, -(Math.max(1, dias) - 1));
    const revs = state.revisoes.filter((r) => r.flashcardId && (r.data || "").slice(0, 10) >= limite);
    const revisados = revs.length;
    const acertos = revs.filter((r) => (r.nota || 0) >= 3).length;
    return {
      total, suspensos, vencidos, atrasados, novos, maduros, aprendizado,
      revisados, acertos, precisao: revisados ? Math.round((acertos / revisados) * 100) : null, dias,
    };
  },
  // Adia o card para daqui a N dias (sai da revisão de hoje, sem mexer no SM-2).
  adiarFlashcard(id, dias = 1) {
    const f = state.flashcards.find((x) => x.id === id);
    if (f) {
      f.sm2.dueDate = addDays(todayISO(), Math.max(1, dias));
      commit();
    }
  },
  // Dispensa/reativa o card (suspenso não aparece nas revisões até ser reativado).
  suspenderFlashcard(id) {
    const f = state.flashcards.find((x) => x.id === id);
    if (f) {
      f.suspenso = !f.suspenso;
      commit();
    }
  },

  // ---------- sessões / ciclo ----------
  registrarSessao({ fase, topicoId, tempoSeg, paginas, paginaInicial, paginaFinal, qAcertos, qErros, comentario, data, missaoId, concluirMissao, agendarRevisao, material, videoIni, videoFim, aulaId, materiais, marcarConcluido, revisaoEscada, questoesLink }) {
    const vIni = Number.isFinite(+videoIni) && +videoIni > 0 ? Math.round(+videoIni) : null;
    const vFim = Number.isFinite(+videoFim) && +videoFim >= (vIni || 0) ? Math.round(+videoFim) : null;
    const s = {
      id: uid("sess"),
      fase,
      topicoId: topicoId || null,
      aulaId: aulaId || null, // aula do cursinho vinculada (opcional) — [[aulas]]
      tempoSeg: tempoSeg || 0,
      paginas: paginas || 0,
      paginaInicial: paginaInicial || null,
      paginaFinal: paginaFinal || null,
      qAcertos: qAcertos || 0,
      qErros: qErros || 0,
      questoesLink: (questoesLink || "").trim() || null, // link do site de questões (opcional)
      missaoId: missaoId || null, // tarefa vinculada (opcional)
      material: (material || "").trim() || null, // aula/material assistido (ex.: "Aula 01")
      videoIni: vIni, // minuto inicial da videoaula assistida (opcional)
      videoFim: vFim, // minuto final da videoaula assistida (opcional)
      // Detalhamento rico da sessão (v4): múltiplas leituras/vídeos. Os campos legados
      // acima seguem preenchidos pelo item principal, então Acompanhamento/estatísticas
      // não quebram; este objeto guarda o resto para exibição futura.
      materiais: materiais && typeof materiais === "object" ? materiais : null,
      comentario: (comentario || "").trim() || null, // observação livre da sessão
      // data escolhida (yyyy-mm-dd) → meio-dia para evitar troca de dia por fuso; senão agora.
      data: data ? `${data}T12:00:00.000Z` : nowISO(),
    };
    state.sessoes.push(s);
    // Vínculo opcional com uma tarefa: pode concluí-la ao registrar (ou só vincular,
    // para o caso de ter começado mas ainda não terminado).
    if (missaoId && concluirMissao) {
      const m = state.missoes.find((x) => x.id === missaoId);
      if (m) { m.concluida = true; m.concluidaEm = todayISO(); }
    }
    // Marcar o TÓPICO como finalizado ao registrar (botão explícito da tela) — usa o
    // mesmo campo `concluido` do toggle do edital.
    if (marcarConcluido && topicoId) {
      const t = state.topicos.find((x) => x.id === topicoId);
      if (t) t.concluido = true;
    }
    // Curva do esquecimento por TÓPICO (dir.2). A tela decide via toggle explícito
    // (agendarRevisao): se ligado, agenda pela escada escolhida (padrão = REV_TOP_ESCADA);
    // se desligado num tópico de estudo com opt-in, fica PENDENTE (o Mentor sugere depois).
    if (topicoId) {
      const escada = Array.isArray(revisaoEscada) && revisaoEscada.length ? revisaoEscada : undefined;
      if (agendarRevisao === true) {
        this.agendarRevisaoTopico(topicoId, escada);
      } else if (agendarRevisao === false && fase === "E" && state.config.revisaoTopicoAuto) {
        s.revisaoPendente = true;
      } else if (agendarRevisao === undefined && fase === "E" && state.config.revisaoTopicoAuto) {
        this.agendarRevisaoTopico(topicoId);
      }
    }
    commit();
    return s;
  },
  // Edita uma sessão já registrada (Acompanhamento).
  editarSessao(id, patch) {
    const s = state.sessoes.find((x) => x.id === id);
    if (!s) return;
    for (const k of ["fase", "topicoId", "aulaId", "tempoSeg", "paginas", "paginaInicial", "paginaFinal", "qAcertos", "qErros", "questoesLink", "missaoId", "materiais"]) {
      if (patch[k] !== undefined) s[k] = patch[k];
    }
    if (patch.comentario !== undefined) s.comentario = (patch.comentario || "").trim() || null;
    if (patch.data) s.data = `${patch.data}T12:00:00.000Z`;
    commit();
  },
  removerSessao(id) {
    state.sessoes = state.sessoes.filter((x) => x.id !== id);
    commit();
  },
  // Observações das sessões (mais recentes primeiro), com disciplina/tópico — usado
  // no Acompanhamento e no Planejamento, e legível pelo mentor (chat) no futuro.
  observacoesRecentes(limite = 8) {
    return state.sessoes
      .filter((s) => s.comentario)
      .sort((a, b) => (a.data < b.data ? 1 : -1))
      .slice(0, limite)
      .map((s) => {
        const t = s.topicoId ? state.topicos.find((x) => x.id === s.topicoId) : null;
        const d = t ? state.disciplinas.find((x) => x.id === t.disciplinaId) : null;
        return {
          id: s.id,
          data: s.data,
          comentario: s.comentario,
          fase: s.fase,
          disciplinaNome: d ? d.nome : null,
          topicoNome: t ? t.nome : null,
        };
      });
  },
  planoHoje() {
    return ciclo.planoDeHoje(state);
  },

  // ---------- lei seca / jurisprudência (META a cumprir × MEMÓRIA gravada) ----------
  addIndicacao({ tipo, modo, disciplinaId, topicoId, referencia, texto, observacao, tribunal, categoria, revogado, semTarefa, metaLeitura, fonteUrl, leiHash, novidadeEm, revogadoEm, ano, estrutura, nomeJuridico, temas, favorito, dificil, lidoEm, ramo, assunto, orgao, processo, tema, dataJulgamento, dataDivulgacao, nInformativo, grupoId, status }) {
    let discId = disciplinaId || null;
    if (topicoId) {
      const t = state.topicos.find((x) => x.id === topicoId);
      if (t) discId = t.disciplinaId;
    }
    const ehJurisTipo = (tipo || "lei") === "juris";
    // Súmula Vinculante é sempre do STF; cancelamento/superação pode vir anotado no texto colado.
    const canceladaAuto = ehJurisTipo && !revogado && detectarCanceladaJuris(`${referencia || ""} ${observacao || ""} ${texto || ""}`);
    const ind = {
      id: uid("ind"),
      tipo: tipo || "lei", // 'lei' | 'juris'
      modo: modo || "meta", // 'meta' (a cumprir/ler) | 'memoria' (gravado p/ relembrar)
      disciplinaId: discId,
      topicoId: topicoId || null,
      referencia: (referencia || "").trim(),
      texto: (texto || "").trim(),
      observacao: (observacao || "").trim(), // lembrete/ressalva livre (não é o trecho)
      tribunal: tribunal || (categoria === "Súmula Vinculante" ? "STF" : null), // SV é sempre do STF
      categoria: categoria || null, // juris: Súmula | Súmula Vinculante | Tema repetitivo | Precedente
      ano: ehJurisTipo ? (ano || detectarAnoJuris(`${referencia || ""} ${observacao || ""} ${texto || ""}`)) : null, // ano do entendimento (idade)
      revogado: !!revogado || canceladaAuto || status === "superado", // lei revogada OU súmula cancelada / tese superada
      revogadoEm: revogadoEm || (canceladaAuto || status === "superado" ? todayISO() : null), // data marcada
      // F1 — campos ricos da jurisprudência/informativo (extração enriquecida)
      ramo: ramo || null, // ramo do direito (Direito Penal, Constitucional…)
      assunto: assunto || null, // assunto/tema específico (Remição pelo estudo…)
      orgao: orgao || null, // órgão julgador (Plenário, Terceira Seção…)
      processo: processo || null, // nº do processo/recurso (REsp 2.072.985/DF, ADPF 1.292/RO)
      temaNum: tema || null, // nº do Tema repetitivo/Repercussão Geral (1357)
      dataJulgamento: dataJulgamento || null, // data do julgamento (do processo)
      dataDivulgacao: dataDivulgacao || null, // data de divulgação do informativo (fonte-mãe)
      nInformativo: nInformativo || null, // nº do informativo (fonte-mãe)
      grupoId: grupoId || null, // agrupador da fonte-mãe (informativo/edição de Jur. em Teses)
      status: status || (ehJurisTipo ? "vigente" : null), // vigente | superado | importante
      chave: ehJurisTipo ? chaveIndic({ tribunal: tribunal || (categoria === "Súmula Vinculante" ? "STF" : null), processo, tema, referencia }) : null, // dedup entre fontes
      metaLeitura: !!metaLeitura, // meta CRUA de leitura (aba Metas), sem transcrever a letra
      fonteUrl: fonteUrl || null, // origem oficial (Planalto) para conferir novidade legislativa
      leiHash: leiHash || null, // hash do texto na importação (detecta mudança na reconsulta)
      estrutura: Array.isArray(estrutura) && estrutura.length ? estrutura : null, // trilha Livro/Título/Capítulo/Seção (lei)
      nomeJuridico: nomeJuridico || null, // rubrica marginal / nome jurídico / tipo penal ("Furto")
      // Tag temática (F1): auto-classifica OFFLINE na importação quando há texto e nenhum tema veio pronto.
      temas: Array.isArray(temas) && temas.length ? temas : ((texto || "").trim() && !metaLeitura ? classificarTemasTexto(texto) : []),
      favorito: !!favorito, // leitor: barra azul à esquerda; escopo "favoritos"; entra em revisão
      dificil: !!dificil, // leitor: marcador "Difícil"; ao ligar, agenda revisão espaçada
      lidoEm: lidoEm || null, // datetime ISO da última marcação como lido (histórico "hoje 14:32")
      novidadeEm: novidadeEm || null, // marcada como novidade legislativa nesta data
      lido: false,
      criadoEm: nowISO(),
    };
    state.indicacoes.push(ind);
    // A TAREFA só nasce em METAS (modelo v3): apenas meta CRUA de leitura vira missão no
    // Planejamento. A letra (Ler) e as importações NÃO criam tarefa.
    if (ind.metaLeitura && !semTarefa) {
      const ref = ind.referencia;
      const titulo = /^\s*(ler|estudar|revisar|decorar|reler)\b/i.test(ref) ? ref : `Ler ${ref}`;
      state.missoes.push({
        id: uid("miss"),
        titulo,
        topicoId: ind.topicoId,
        origem: "indicacao",
        indicacaoId: ind.id,
        categoria: tipo === "juris" ? "Jurisprudência" : "Lei Seca",
        ordem: state.missoes.length,
        concluida: false,
        criadoEm: nowISO(),
      });
    }
    commit();
    return ind;
  },
  editarIndicacao(id, patch) {
    const ind = state.indicacoes.find((x) => x.id === id);
    if (!ind) return;
    for (const k of ["referencia", "texto", "observacao", "tribunal", "categoria", "topicoId", "disciplinaId", "ano"]) {
      if (patch[k] !== undefined) ind[k] = patch[k];
    }
    if (patch.topicoId !== undefined && ind.topicoId) {
      const t = state.topicos.find((x) => x.id === ind.topicoId);
      if (t) ind.disciplinaId = t.disciplinaId;
    }
    commit();
  },
  toggleIndicacaoLida(id) {
    const ind = state.indicacoes.find((x) => x.id === id);
    if (ind) {
      ind.lido = !ind.lido;
      ind.lidoEm = ind.lido ? nowISO() : null; // datetime p/ "leu N hoje" e histórico de leitura
      const m = state.missoes.find((mm) => mm.indicacaoId === id);
      if (m) { m.concluida = ind.lido; m.concluidaEm = ind.lido ? todayISO() : null; }
      commit();
    }
  },
  // Marcar VÁRIOS artigos como lido/não-lido de uma vez (ferramenta geral "marcar em bloco").
  marcarLidosIds(ids, valor = true) {
    const set = new Set(ids || []);
    let n = 0;
    for (const ind of state.indicacoes) {
      if (!set.has(ind.id)) continue;
      if (!!ind.lido === !!valor) continue;
      ind.lido = !!valor;
      ind.lidoEm = valor ? nowISO() : null;
      const m = state.missoes.find((mm) => mm.indicacaoId === ind.id);
      if (m) { m.concluida = !!valor; m.concluidaEm = valor ? todayISO() : null; }
      n++;
    }
    if (n) commit();
    return n;
  },
  // Leitor (F0): favorito = barra azul + entra em revisão espaçada.
  toggleFavorito(id) {
    const ind = state.indicacoes.find((x) => x.id === id);
    if (!ind) return false;
    ind.favorito = !ind.favorito;
    if (ind.favorito && !ind.revisao) { ind.promovido = true; ind.revisao = { proxima: addDays(todayISO(), 1), intervalo: 1 }; }
    commit();
    return ind.favorito;
  },
  // Leitor (F0): "Difícil" → agenda revisão espaçada na escada [1,3,7,15,30,60,120] começando em 1 dia.
  toggleDificil(id) {
    const ind = state.indicacoes.find((x) => x.id === id);
    if (!ind) return false;
    ind.dificil = !ind.dificil;
    if (ind.dificil) { ind.promovido = true; if (!ind.revisao) ind.revisao = { proxima: addDays(todayISO(), 1), intervalo: 1 }; }
    commit();
    return ind.dificil;
  },
  // Filtra artigos de uma norma por nível/rótulo da estrutura (ex.: nivel 3 "Capítulo I") — habilita
  // metas/escopo por Título/Capítulo/Seção. Irmão de selecionarArtigos (que é só por número).
  selecionarPorEstrutura(norma, { nivel = null, rotulo = null } = {}) {
    return state.indicacoes.filter((i) =>
      i.tipo === "lei" && !i.metaLeitura && normaDaReferencia(i.referencia) === norma &&
      Array.isArray(i.estrutura) && i.estrutura.some((n) => (nivel == null || n.nivel === nivel) && (!rotulo || n.rotulo === rotulo)));
  },
  // Incidência (0-100) → 1-5 estrelas (0 = sem incidência marcada).
  estrelasIncidencia(pq) { return pq == null ? 0 : Math.max(1, Math.min(5, Math.round(pq / 20))); },
  // ---------- TAG TEMÁTICA (sub-projeto: classificar artigos por tema) ----------
  // Classifica em lote (OFFLINE, instantâneo) por heurística de texto. Devolve nº de artigos com tema.
  classificarTemasLote(ids) {
    let n = 0;
    for (const id of ids || []) {
      const i = state.indicacoes.find((x) => x.id === id);
      if (!i || !(i.texto || "").trim()) continue;
      i.temas = classificarTemasTexto(i.texto);
      if (i.temas.length) n++;
    }
    commit();
    return n;
  },
  // Classifica com IA (temas mais finos/precisos). Cap para não estourar a cota. Mescla c/ os offline.
  async classificarTemasIA(ids, contexto = "") {
    if (!this.iaDisponivel()) throw new Error("IA indisponível");
    let n = 0;
    for (const id of (ids || []).slice(0, 40)) {
      const i = state.indicacoes.find((x) => x.id === id);
      if (!i || !(i.texto || "").trim()) continue;
      try {
        const temas = await iaProv.classificarTemas(state.config, { texto: i.texto, referencia: i.referencia + (contexto ? " · " + contexto : "") });
        if (Array.isArray(temas) && temas.length) {
          i.temas = [...new Set([...(i.temas || []), ...temas])].slice(0, 6);
          n++;
        }
      } catch (e) { console.error("[temas IA]", e); }
    }
    commit();
    return n;
  },
  // F3: edição manual das tags de um artigo (o tagger erra — o usuário corrige).
  setTemasArtigo(id, temas) {
    const i = state.indicacoes.find((x) => x.id === id);
    if (!i) return;
    i.temas = [...new Set((temas || []).map((t) => String(t).trim()).filter(Boolean))].slice(0, 8);
    commit();
  },
  // Catálogo de temas para o editor: os temas-base (heurística) + os que já existem no acervo.
  temasCatalogo() {
    const base = TEMAS_REGRAS.map((r) => r.tema);
    const usados = new Set();
    for (const i of state.indicacoes) for (const t of i.temas || []) usados.add(t);
    return [...new Set([...base, ...usados])].sort((a, b) => a.localeCompare(b, "pt"));
  },
  // Temas presentes num conjunto (para o seletor de escopo por tema) → [{ tema, n }] ordenado.
  temasDisponiveis(ids) {
    const set = new Set(ids || []);
    const cont = new Map();
    for (const i of state.indicacoes) {
      if (!set.has(i.id) || !Array.isArray(i.temas)) continue;
      for (const t of i.temas) cont.set(t, (cont.get(t) || 0) + 1);
    }
    return [...cont.entries()].map(([tema, n]) => ({ tema, n })).sort((a, b) => b.n - a.n);
  },
  // "Inteligência": temas onde o aluno mais ERRA (cruza errosPorArtigo × temas do artigo).
  temasComErro(tipo = "lei") {
    const erros = this.errosPorArtigo(tipo);
    const cont = new Map();
    for (const e of erros) {
      const i = state.indicacoes.find((x) => x.id === e.indicacaoId);
      for (const t of (i && i.temas) || []) cont.set(t, (cont.get(t) || 0) + e.erros);
    }
    return [...cont.entries()].map(([tema, erros]) => ({ tema, erros })).sort((a, b) => b.erros - a.erros);
  },
  // Posição de "continuar leitura" por lei. semCarimbo: não é dado do usuário p/ o sync (evita
  // churn de modificadoEm a cada rolagem entre PCs).
  setUltimaLeitura(norma, patch) {
    if (!norma) return;
    state.config.ultimaLeitura = state.config.ultimaLeitura || {};
    state.config.ultimaLeitura[norma] = { ...(state.config.ultimaLeitura[norma] || {}), ...(patch || {}), em: nowISO() };
    commit({ semCarimbo: true });
  },
  // F1e: preferências de leitura (fonte/tamanho/espaçamento/tema/alinhamento). Merge nested seguro.
  setLeitura(patch) {
    state.config.leitura = { ...(state.config.leitura || {}), ...(patch || {}) };
    commit();
    return state.config.leitura;
  },
  // Caderno de erros AGREGADO por artigo ("você errou este artigo 4x") — deriva de state.tentativas.
  errosPorArtigo(tipo = "lei") {
    const qDe = new Map();
    for (const q of state.questoes) { const indId = q.treino && q.treino.indicacaoId; if (indId) qDe.set(q.id, indId); }
    const porInd = new Map();
    for (const t of state.tentativas) {
      const indId = qDe.get(t.questaoId);
      if (!indId) continue;
      let e = porInd.get(indId);
      if (!e) { e = { indicacaoId: indId, total: 0, erros: 0, ultimoErro: null }; porInd.set(indId, e); }
      e.total++;
      if (!t.acertou) { e.erros++; if (!e.ultimoErro || (t.data || "") > e.ultimoErro) e.ultimoErro = t.data || null; }
    }
    const out = [];
    for (const e of porInd.values()) {
      const ind = state.indicacoes.find((i) => i.id === e.indicacaoId);
      if (!ind || (tipo && ind.tipo !== tipo)) continue;
      out.push({ ...e, referencia: ind.referencia, lei: normaDaReferencia(ind.referencia),
        pctAcerto: e.total ? Math.round((100 * (e.total - e.erros)) / e.total) : 0,
        ultimaRevisao: ind.revisao ? ind.revisao.proxima : null });
    }
    return out.filter((x) => x.erros > 0).sort((a, b) => b.erros - a.erros || ((b.ultimoErro || "") > (a.ultimoErro || "") ? 1 : -1));
  },
  // Dashboard do Estudar/leitor: resumo de HOJE (opcionalmente de uma norma).
  resumoLeituraHoje(norma = null) {
    const hoje = todayISO();
    const lei = state.indicacoes.filter((i) => i.tipo === "lei" && !i.metaLeitura && (!norma || normaDaReferencia(i.referencia) === norma));
    const lidosHoje = lei.filter((i) => (i.lidoEm || "").slice(0, 10) === hoje).length;
    const qDe = new Map(state.questoes.filter((q) => q.treino && q.treino.indicacaoId).map((q) => [q.id, q.treino.indicacaoId]));
    const tLei = state.tentativas.filter((t) => diaLocal(t.data) === hoje && qDe.has(t.questaoId));
    const acertos = tLei.filter((t) => t.acertou).length;
    return { lidosHoje, questoesHoje: tLei.length, pctHoje: tLei.length ? Math.round((100 * acertos) / tLei.length) : null, tempoSeg: tLei.reduce((s, t) => s + (t.tempoSeg || 0), 0) };
  },
  // Renomear (apelido de exibição) de uma norma — corrige detecção errada de nome na importação.
  // Não mexe nas referências ("Art. 1º, Lei 8.078/1990"), só no nome amigável mostrado no leitor.
  definirNomeLei(norma, nome) {
    if (!norma) return;
    state.config.nomesLeis = state.config.nomesLeis || {};
    const n = (nome || "").trim();
    if (n) state.config.nomesLeis[norma] = n; else delete state.config.nomesLeis[norma];
    commit();
  },
  // F6 (Planejamento): meta quantitativa diária da Lei Seca (0 = sem meta).
  setMetaLeitura(chave, valor) {
    if (!state.config.metasLeitura) state.config.metasLeitura = { artigosDia: 0, questoesDia: 0 };
    state.config.metasLeitura[chave] = Math.max(0, Math.round(+valor || 0));
    commit();
  },
  // F6 (Planejamento Inteligente): panorama da leitura — total/lidos/faltam, ritmo (média/dia com
  // leitura nos últimos 21 dias) e previsão de conclusão. Alimenta o dashboard da aba Metas.
  planejamentoLeitura(tipo = "lei") {
    const arts = state.indicacoes.filter((i) => i.tipo === tipo && !i.metaLeitura && !i.revogado && (i.texto || "").trim());
    const total = arts.length;
    const lidos = arts.filter((i) => i.lido).length;
    const faltam = total - lidos;
    const hoje = todayISO();
    const limite = addDays(hoje, -21);
    const porDia = {};
    for (const i of arts) { const d = (i.lidoEm || "").slice(0, 10); if (d && d >= limite) porDia[d] = (porDia[d] || 0) + 1; }
    const dias = Object.keys(porDia);
    const ritmoDia = dias.length ? dias.reduce((s, d) => s + porDia[d], 0) / dias.length : 0;
    const previsaoDias = ritmoDia > 0 && faltam > 0 ? Math.ceil(faltam / ritmoDia) : null;
    const resumo = this.resumoLeituraHoje();
    const metas = state.config.metasLeitura || { artigosDia: 0, questoesDia: 0 };
    // DOMINADO (gamificação leve): já domina o artigo se acerta ≥80% (≥2 tentativas) OU já está
    // numa revisão espaçada com intervalo ≥15 dias. Distinto de "lido" (só passou o olho).
    const errosMap = new Map(this.errosPorArtigo(tipo).map((e) => [e.indicacaoId, e]));
    const dominados = arts.filter((i) => { const e = errosMap.get(i.id); return (e && e.total >= 2 && e.pctAcerto >= 80) || (i.promovido && i.revisao && i.revisao.intervalo >= 15); }).length;
    // Leitura NESTA semana (Dom–hoje) — momento/ofensiva leve.
    const dowHoje = new Date(hoje + "T12:00:00").getDay();
    const inicioSem = addDays(hoje, -dowHoje);
    const lidosSemana = arts.filter((i) => (i.lidoEm || "").slice(0, 10) >= inicioSem).length;
    return {
      total, lidos, faltam, pct: total ? Math.round((100 * lidos) / total) : 0,
      dominados, pctDominado: total ? Math.round((100 * dominados) / total) : 0,
      lidosSemana,
      lidosHoje: resumo.lidosHoje, questoesHoje: resumo.questoesHoje,
      ritmoDia: Math.round(ritmoDia * 10) / 10, previsaoDias, previsaoData: previsaoDias != null ? addDays(hoje, previsaoDias) : null,
      metaArtigosDia: metas.artigosDia || 0, metaQuestoesDia: metas.questoesDia || 0,
    };
  },
  removerIndicacao(id) {
    state.indicacoes = state.indicacoes.filter((x) => x.id !== id);
    state.missoes = state.missoes.filter((m) => m.indicacaoId !== id);
    // Remove as marcações feitas sobre o trecho desta lei/jurisprudência.
    state.marcacoes = state.marcacoes.filter((m) => !(m.alvoTipo === "indicacao" && m.alvoId === id));
    commit();
  },
  // PROMOVER para Memorizar (modelo v3): o dispositivo CONTINUA no "Ler" (não é movido) e
  // passa a aparecer também em "Memorizar", com revisão espaçada. Não mexe na missão nem no modo.
  promoverIndicacao(id, dias = 1) {
    const ind = state.indicacoes.find((x) => x.id === id);
    if (!ind) return false;
    ind.promovido = true;
    if (!ind.revisao) { const d = Math.max(1, parseInt(dias, 10) || 1); ind.revisao = { proxima: addDays(todayISO(), d), intervalo: d }; }
    commit();
    return true;
  },
  // Promove em LOTE os dispositivos de MAIOR incidência (top fração) para Memorizar — transforma
  // o mapa de incidência (Raio-X) num plano de revisão espaçada com 1 clique. Só a letra c/ texto.
  promoverTopIncidencia(tipo = "lei", frac = 0.2) {
    const com = state.indicacoes.filter((i) => i.tipo === tipo && !i.metaLeitura && !i.revogado && i.pqIncidencia != null && (i.texto || "").trim());
    com.sort((a, b) => (b.pqIncidencia || 0) - (a.pqIncidencia || 0));
    const n = Math.max(1, Math.ceil(com.length * frac));
    let promovidos = 0;
    for (const i of com.slice(0, n)) {
      if (i.promovido) continue;
      i.promovido = true;
      if (!i.revisao) i.revisao = { proxima: addDays(todayISO(), 1), intervalo: 1 };
      promovidos++;
    }
    commit();
    return { total: n, promovidos, jaEstavam: n - promovidos };
  },
  // Tira o dispositivo de "Memorizar" (continua no "Ler"). Encerra a revisão espaçada.
  despromoverIndicacao(id) {
    const ind = state.indicacoes.find((x) => x.id === id);
    if (!ind) return false;
    ind.promovido = false;
    ind.revisao = null;
    commit();
    return true;
  },
  // Marca (ou desmarca) um dispositivo como REVOGADO (lei) / CANCELADO / SUPERADO (juris): sai do
  // estudo (Treinar/Raio-X/Memorizar) e aparece riscado no Ler. Ao marcar, tira da revisão espaçada
  // e limpa o treino gerado (era da redação que não vale mais). Desmarcar só reativa.
  marcarRevogado(id, valor = true) {
    const ind = state.indicacoes.find((x) => x.id === id);
    if (!ind) return false;
    ind.revogado = !!valor;
    ind.revogadoEm = valor ? todayISO() : null;
    if (valor) {
      ind.promovido = false;
      ind.revisao = null;
      if (this.limparTreinoDeIndicacao) this.limparTreinoDeIndicacao(id);
    }
    commit();
    return true;
  },
  // META DE LEITURA (crua, sem transcrever a letra): "Ler art. 1º a 20 da CF". Nasce AQUI e
  // vira tarefa no Planejamento (a importação NÃO cria tarefa). Reaproveita a missão de indicação.
  criarMetaLeitura({ tipo = "lei", referencia, disciplinaId = null, topicoId = null, observacao = null } = {}) {
    if (!(referencia || "").trim()) return null;
    return this.addIndicacao({ tipo, modo: "meta", metaLeitura: true, referencia: referencia.trim(), disciplinaId, topicoId, observacao });
  },
  // Quebra uma meta crua em várias partes (cada parte = uma meta/ tarefa). Remove a meta-mãe.
  // partes = ["art. 1º a 5º, CF", "art. 6º a 10, CF", ...].
  quebrarMetaLeitura(id, partes) {
    const mae = state.indicacoes.find((x) => x.id === id);
    if (!mae) return 0;
    const lista = (partes || []).map((s) => (s || "").trim()).filter(Boolean);
    if (!lista.length) return 0;
    for (const ref of lista) {
      this.addIndicacao({ tipo: mae.tipo, modo: "meta", metaLeitura: true, referencia: ref, disciplinaId: mae.disciplinaId || null, topicoId: mae.topicoId || null });
    }
    this.removerIndicacao(id); // remove a mãe (e a missão dela)
    return lista.length;
  },
  // Remove as METAS já concluídas (lidas) de um tipo (lei/juris), com as missões e
  // marcações associadas. Devolve quantas foram removidas.
  limparIndicacoesLidas(tipo) {
    const remover = new Set(
      state.indicacoes
        .filter((i) => i.tipo === tipo && i.metaLeitura && i.lido)
        .map((i) => i.id)
    );
    if (!remover.size) return 0;
    state.indicacoes = state.indicacoes.filter((x) => !remover.has(x.id));
    state.missoes = state.missoes.filter((m) => !remover.has(m.indicacaoId));
    state.marcacoes = state.marcacoes.filter((m) => !(m.alvoTipo === "indicacao" && remover.has(m.alvoId)));
    commit();
    return remover.size;
  },
  // Renomeia um tribunal (campo livre) em todas as jurisprudências que o usam.
  renomearTribunal(antigo, novo) {
    const n = (novo || "").trim();
    if (!n || !antigo) return 0;
    let c = 0;
    for (const i of state.indicacoes) {
      if (i.tipo === "juris" && i.tribunal === antigo) {
        i.tribunal = n;
        c++;
      }
    }
    if (c) commit();
    return c;
  },
  // Remove um tribunal: os itens que o usavam ficam sem tribunal (não são apagados).
  removerTribunal(nome) {
    let c = 0;
    for (const i of state.indicacoes) {
      if (i.tipo === "juris" && i.tribunal === nome) {
        i.tribunal = null;
        c++;
      }
    }
    if (c) commit();
    return c;
  },
  // ---- Dossiê: ordem e visibilidade das seções (personalizável; só oculta, não remove) ----
  // Ordem efetiva = a salva (filtrada às keys válidas) + as novas keys ao final.
  ordemDossie(todasKeys) {
    const salva = (state.config.dossieOrdem || []).filter((k) => todasKeys.includes(k));
    const resto = todasKeys.filter((k) => !salva.includes(k));
    return [...salva, ...resto];
  },
  // Move uma seção trocando com a vizinha imediata (todas as seções continuam visíveis;
  // "ocultar" agora só RETRAI o conteúdo, mantendo o título no lugar).
  moverDossieSecao(key, dir, todasKeys) {
    const ordem = this.ordemDossie(todasKeys);
    const i = ordem.indexOf(key);
    const j = i + (dir === "cima" ? -1 : 1);
    if (i < 0 || j < 0 || j >= ordem.length) return;
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
    state.config.dossieOrdem = ordem;
    commit();
  },
  // Arrastar-para-reordenar: insere a seção arrastada ANTES da seção alvo.
  reordenarDossieSecao(dragKey, alvoKey, todasKeys) {
    if (!dragKey || !alvoKey || dragKey === alvoKey) return;
    const ordem = this.ordemDossie(todasKeys);
    const from = ordem.indexOf(dragKey);
    if (from < 0) return;
    ordem.splice(from, 1);
    const to = ordem.indexOf(alvoKey);
    ordem.splice(to < 0 ? ordem.length : to, 0, dragKey);
    state.config.dossieOrdem = ordem;
    commit();
  },
  // Retrai/expande o conteúdo de uma seção do dossiê (o título e as funções continuam).
  toggleDossieOculta(key) {
    const arr = Array.isArray(state.config.dossieOcultas) ? [...state.config.dossieOcultas] : [];
    const i = arr.indexOf(key);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(key);
    state.config.dossieOcultas = arr;
    commit();
  },
  dossieOculta(key) {
    return (state.config.dossieOcultas || []).includes(key);
  },
  // ---- PQ (Provável Questão, dir.4): artigo/súmula de alta incidência ----
  // Independente da relevância do tópico ("mais cai" = tópico; PQ = ponto dentro dele).
  setIndicacaoPQ(id, pq, incidencia) {
    const ind = state.indicacoes.find((x) => x.id === id);
    if (!ind) return;
    ind.pq = !!pq;
    if (incidencia !== undefined) ind.pqIncidencia = incidencia == null ? null : Number(incidencia);
    if (!ind.pq) ind.pqIncidencia = null;
    commit();
  },
  // Quantas PQ existem (total, por tipo ou por tópico).
  contarPQ({ tipo = null, topicoId = null } = {}) {
    return state.indicacoes.filter((i) => i.pq && (!tipo || i.tipo === tipo) && (!topicoId || i.topicoId === topicoId)).length;
  },
  // IMPORTA estatística de incidência (colar/arquivo): linhas "referência ; nº".
  // Casa por referência (normalizada) com os itens e devolve as correspondências para
  // o usuário REVISAR e aplicar PQ acima de um corte (o Mentor sugere, não aplica sozinho).
  analisarEstatisticaPQ(texto) {
    const norm = (s) => String(s || "").toLowerCase().replace(/[^\wçãõáéíóúâêô]/gi, "");
    const linhas = String(texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (const l of linhas) {
      // separa a referência do número de incidência (último número após ; , tab, - ou espaços)
      const m = l.match(/^(.*?)[\s;,\-–|\t]+(\d+)\s*%?\s*$/);
      if (!m) continue;
      const ref = m[1].trim();
      const inc = parseInt(m[2], 10);
      const nref = norm(ref);
      if (!nref) continue;
      const matches = state.indicacoes.filter((i) => {
        const ni = norm(i.referencia);
        return ni && (ni === nref || ni.includes(nref) || nref.includes(ni));
      });
      out.push({ ref, incidencia: inc, ids: matches.map((i) => i.id), nomes: matches.map((i) => `${i.referencia} (${i.tipo === "juris" ? "juris" : "lei"})`) });
    }
    return out;
  },
  // FONTE IA do PQ: a IA sugere quais referências (lei/juris do tipo) são de alta incidência.
  // Devolve no MESMO formato de analisarEstatisticaPQ ({ref,incidencia,ids,nomes}) para o
  // usuário revisar e aplicar (o Mentor sugere, não aplica sozinho). Online.
  async sugerirPQIA(tipo) {
    const norm = (s) => String(s || "").toLowerCase().replace(/[^\wçãõáéíóúâêô]/gi, "");
    const itensTipo = state.indicacoes.filter((i) => i.tipo === tipo && i.referencia);
    if (!itensTipo.length) return [];
    const referencias = [...new Set(itensTipo.map((i) => i.referencia))];
    const sugestoes = await iaProv.sugerirPQ(state.config, { referencias, contexto: tipo === "juris" ? "jurisprudência" : "lei seca" });
    return sugestoes
      .map((s) => {
        const nref = norm(s.referencia);
        const matches = itensTipo.filter((i) => {
          const ni = norm(i.referencia);
          return ni && (ni === nref || ni.includes(nref) || nref.includes(ni));
        });
        return { ref: s.referencia, incidencia: Number(s.incidencia) || 0, ids: matches.map((i) => i.id), nomes: matches.map((i) => `${i.referencia} (${tipo === "juris" ? "juris" : "lei"})`) };
      })
      .filter((x) => x.ids.length);
  },
  // Aplica PQ aos itens escolhidos (com a incidência casada). Devolve quantos.
  aplicarPQ(itens) {
    let n = 0;
    for (const it of itens || []) {
      const ind = state.indicacoes.find((x) => x.id === it.id);
      if (ind) {
        ind.pq = true;
        ind.pqIncidencia = it.incidencia == null ? ind.pqIncidencia : Number(it.incidencia);
        n++;
      }
    }
    if (n) commit();
    return n;
  },
  // EXTRAI referências de lei/jurisprudência citadas num material (PDF) via IA e as
  // adiciona como indicações (meta ou memória). Online (requer iaDisponivel()).
  async extrairIndicacoesDeDoc(docId, tipo, modo) {
    await this.exigirConteudoDoc(docId); // conteúdo sob demanda: no aparelho que só tem o esqueleto, desce agora
    const doc = state.documentos.find((d) => d.id === docId);
    if (!doc || !doc.texto.trim()) return [];
    const itens = await iaProv.extrairIndicacoes(state.config, {
      texto: doc.texto,
      contexto: nomeContexto(state, doc.topicoId),
      tipo,
    });
    return itens.map((it) =>
      this.addIndicacao({
        tipo,
        modo,
        referencia: it.referencia,
        texto: it.texto,
        topicoId: doc.topicoId || null,
        tribunal: it.tribunal,
        categoria: it.categoria,
      })
    );
  },
  // ---- Revisão espaçada da MEMÓRIA (lei seca / jurisprudência) ----
  // Cada item da memória pode entrar em ciclo de revisão: revisao = {proxima, intervalo}.
  // A escada de intervalos cresce conforme você lembra (consolida); se esquece, reinicia.
  // Coloca um item em revisão a partir de hoje (dias = 7/15/30...).
  agendarRevisaoMemoria(id, dias) {
    const ind = state.indicacoes.find((x) => x.id === id);
    if (!ind) return;
    const d = Math.max(1, parseInt(dias, 10) || 7);
    ind.revisao = { proxima: addDays(todayISO(), d), intervalo: d };
    commit();
    return ind.revisao;
  },
  // Registra uma revisão feita; "esqueci" reinicia, "ok" sobe um degrau, "facil" sobe dois.
  // Devolve o nº de dias até a próxima revisão.
  revisarMemoria(id, resultado) {
    const ind = state.indicacoes.find((x) => x.id === id);
    if (!ind || !ind.revisao) return null;
    const ESCADA = [1, 3, 7, 15, 30, 60, 120]; // reaproveita a escada existente + degrau 3 (difícil/leitor)
    let idx = ESCADA.indexOf(ind.revisao.intervalo);
    if (idx < 0) idx = 1;
    if (resultado === "esqueci") idx = 0;
    else if (resultado === "ok") idx = Math.min(idx + 1, ESCADA.length - 1);
    else if (resultado === "facil") idx = Math.min(idx + 2, ESCADA.length - 1);
    const dias = ESCADA[idx];
    ind.revisao = { proxima: addDays(todayISO(), dias), intervalo: dias };
    commit();
    return dias;
  },
  cancelarRevisaoMemoria(id) {
    const ind = state.indicacoes.find((x) => x.id === id);
    if (ind) {
      ind.revisao = null;
      commit();
    }
  },
  // Quantos itens da memória estão vencidos (proxima <= hoje), por tipo (lei/juris) ou total.
  memoriasParaRevisar(tipo = null) {
    const hoje = todayISO();
    return state.indicacoes.filter((i) => (i.promovido || i.modo === "memoria") && !i.metaLeitura && (!tipo || i.tipo === tipo) && i.revisao && i.revisao.proxima <= hoje).length;
  },

  // ---- REVISÃO DE TÓPICO (dir.2) — curva do esquecimento do CONTEÚDO estudado ----
  // Generaliza o mecanismo da MEMÓRIA (mesma escada e botões), mudando só o objeto:
  // o TÓPICO estudado, não uma súmula/artigo. Uma trilha por tópico (reestudar reinicia).
  REV_TOP_ESCADA: [1, 7, 15, 30, 60, 120],
  revisaoTopicoDe(topicoId) {
    return state.revisoesTopico.find((r) => r.topicoId === topicoId) || null;
  },
  // Cria ou REINICIA a trilha do tópico em 24h (sem duplicar).
  // Agenda (ou reinicia) a revisão de um tópico. `escada` (opcional) personaliza os
  // intervalos: a 1ª revisão cai no PRIMEIRO degrau e as seguintes caminham pela escada
  // conforme o desempenho (revisarTopico). Sem escada → usa REV_TOP_ESCADA (1ª em 1 dia).
  agendarRevisaoTopico(topicoId, escada) {
    if (!topicoId) return null;
    const esc =
      Array.isArray(escada) && escada.length
        ? [...new Set(escada.map((n) => Math.round(+n)).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b)
        : null;
    const primeiro = esc && esc.length ? esc[0] : 1;
    let r = state.revisoesTopico.find((x) => x.topicoId === topicoId);
    if (!r) {
      r = { id: uid("revtop"), topicoId, proxima: addDays(todayISO(), primeiro), intervalo: primeiro, criadoEm: nowISO(), historico: [] };
      if (esc && esc.length) r.escada = esc;
      state.revisoesTopico.push(r);
    } else {
      r.proxima = addDays(todayISO(), primeiro);
      r.intervalo = primeiro;
      if (esc && esc.length) r.escada = esc;
    }
    commit();
    return r;
  },
  // Registra uma revisão: "esqueci" reinicia, "lembrei" sobe 1 degrau, "facil" sobe 2.
  // Devolve o nº de dias até a próxima. Não altera cobertura (é manutenção).
  revisarTopico(topicoId, resultado) {
    const r = state.revisoesTopico.find((x) => x.topicoId === topicoId);
    if (!r) return null;
    const ESCADA = Array.isArray(r.escada) && r.escada.length ? r.escada : this.REV_TOP_ESCADA;
    let idx = ESCADA.indexOf(r.intervalo);
    if (idx < 0) idx = 1;
    if (resultado === "esqueci") idx = 0;
    else if (resultado === "lembrei") idx = Math.min(idx + 1, ESCADA.length - 1);
    else if (resultado === "facil") idx = Math.min(idx + 2, ESCADA.length - 1);
    const dias = ESCADA[idx];
    r.intervalo = dias;
    r.proxima = addDays(todayISO(), dias);
    r.ultimaRevisao = todayISO();
    r.historico = [...(r.historico || []), { data: todayISO(), resultado }];
    commit();
    return dias;
  },
  cancelarRevisaoTopico(topicoId) {
    state.revisoesTopico = state.revisoesTopico.filter((x) => x.topicoId !== topicoId);
    commit();
  },
  // PRECISÃO POR PÁGINA (dir.2): a IA detecta quais tópicos do edital o material aborda;
  // cita as páginas (busca textual em doc.paginas). Online. Fallback offline: o tópico do doc.
  // Devolve [{topico, paginas:[n...]}] para o usuário agendar revisão (Mentor sugere).
  async detectarTopicosDoMaterial(docId) {
    await this.garantirConteudoDoc(docId); // conteúdo sob demanda
    const d = state.documentos.find((x) => x.id === docId);
    if (!d || !(d.texto || "").trim()) return [];
    const topicosEdital = state.topicos;
    if (!topicosEdital.length) return [];
    let nomesDetectados;
    if (this.iaDisponivel()) {
      nomesDetectados = await iaProv.detectarTopicos(state.config, { texto: d.texto, topicos: topicosEdital.map((t) => t.nome) });
    } else {
      // Offline: usa o tópico declarado no material (se houver).
      const t = d.topicoId ? topicosEdital.find((x) => x.id === d.topicoId) : null;
      nomesDetectados = t ? [t.nome] : [];
    }
    const norm = (s) => String(s || "").toLowerCase();
    const out = [];
    for (const nome of nomesDetectados) {
      const topico = topicosEdital.find((t) => norm(t.nome) === norm(nome)) || this.acharTopicoPorNome(nome);
      if (!topico) continue;
      // páginas onde o nome do tópico aparece (citação por página)
      const paginas = (d.paginas || []).filter((p) => norm(p.texto).includes(norm(topico.nome))).map((p) => p.n);
      if (!out.some((x) => x.topico.id === topico.id)) out.push({ topico, paginas });
    }
    return out;
  },
  // Avalia (IA) o brain-dump da revisão contra o conteúdo de referência do tópico.
  // Requer iaDisponivel(). Devolve {texto, selo}.
  async avaliarRecallTopico(topicoId, texto) {
    const t = state.topicos.find((x) => x.id === topicoId);
    const ref = this.palavrasParaReler(topicoId);
    return iaProv.avaliarRecall(state.config, { topico: t ? t.nome : "", referencia: ref ? ref.texto : "", texto });
  },
  // Exportações a partir da revisão de tópico (brain-dump + feedback da IA), vinculadas ao tópico.
  // `contexto` opcional sobrescreve o nome do tópico no prompt (default: o nome do próprio tópico).
  async gerarFlashcardsDeTopico(topicoId, texto, n = 5, dificuldade = "medio", contexto = null) {
    const t = state.topicos.find((x) => x.id === topicoId);
    const cards = await iaProv.gerarFlashcards(state.config, {
      texto, contexto: contexto || (t ? t.nome : "geral"), n,
      ...iaExtras(state, { topicoId, dificuldade }),
    });
    const fonte = { tipo: "revisao", titulo: t ? t.nome : "Revisão de tópico" };
    return cards.map((c) => this.addFlashcard({ ...c, topicoId, fonte, selo: "amarelo" }));
  },
  async gerarQuestoesDeTopico(topicoId, texto, n = 3, dificuldade = "medio", contexto = null) {
    const t = state.topicos.find((x) => x.id === topicoId);
    const qs = await iaProv.gerarQuestoes(state.config, {
      texto, contexto: contexto || (t ? t.nome : "geral"), n,
      ...iaExtras(state, { topicoId, dificuldade }),
    });
    const fonte = { tipo: "revisao", titulo: t ? t.nome : "Revisão de tópico" };
    return qs.map((q) => this.addQuestao({ ...q, topicoId, fonte })).filter(Boolean);
  },
  // O prompt da IA CORTA o texto num limite de caracteres (ver corta() em ia-provider.js —
  // 6000 p/ questões/flashcards, 8000 p/ mapa mental) — se só concatenássemos os tópicos e
  // deixássemos o corte acontecer no fim, o PRIMEIRO tópico comeria o limite inteiro. E MESMO
  // sem cortar nada, medido na prática (2 tópicos curtos, bem dentro do limite): pedir "N
  // questões" de um texto com 2 assuntos NÃO garante que a IA distribua — ela pode gerar as N
  // inteiras só do assunto que "rendeu mais". A única forma confiável de garantir que TODO
  // tópico marcado realmente vira conteúdo gerado é decidir a divisão DETERMINISTICAMENTE
  // aqui (nesse código, não confiando no modelo) — cada tópico gera sua FATIA de N, numa
  // chamada de IA própria com o conteúdo dele INTEIRO (sem concatenar, então sem risco de
  // corte por outro tópico), e o resultado final é a soma de todas — ainda assim UM lote só do
  // ponto de vista do usuário, com cada item já vinculado ao tópico certo (não só ao principal).
  // Pública (usada também fora do store, ex.: documentos.js, ao gerar de vários blocos de um
  // material) — divide N o mais igual possível entre `partes` fatias.
  distribuirN(n, partes) {
    const total = Math.max(0, n | 0);
    const base = Math.floor(total / partes);
    let resto = total % partes;
    return Array.from({ length: partes }, () => { const extra = resto > 0 ? 1 : 0; if (resto > 0) resto--; return base + extra; });
  },
  async gerarFlashcardsDeTopicos(topicoId, texto, extraTopicoIds = [], n = 5, dificuldade = "medio") {
    if (!extraTopicoIds.length) return this.gerarFlashcardsDeTopico(topicoId, texto, n, dificuldade);
    const extras = extraTopicoIds.map((id) => state.topicos.find((x) => x.id === id)).filter(Boolean);
    const fatias = this.distribuirN(n, 1 + extras.length);
    const resultados = [];
    if (fatias[0]) resultados.push(...await this.gerarFlashcardsDeTopico(topicoId, texto, fatias[0], dificuldade));
    for (let i = 0; i < extras.length; i++) {
      if (!fatias[i + 1]) continue;
      const t = extras[i];
      resultados.push(...await this.gerarFlashcardsDeTopico(t.id, `Tópico: ${t.nome}\n${await this.conteudoDeTopico(t.id)}`, fatias[i + 1], dificuldade));
    }
    return resultados;
  },
  async gerarQuestoesDeTopicos(topicoId, texto, extraTopicoIds = [], n = 3, dificuldade = "medio") {
    if (!extraTopicoIds.length) return this.gerarQuestoesDeTopico(topicoId, texto, n, dificuldade);
    const extras = extraTopicoIds.map((id) => state.topicos.find((x) => x.id === id)).filter(Boolean);
    const fatias = this.distribuirN(n, 1 + extras.length);
    const resultados = [];
    if (fatias[0]) resultados.push(...await this.gerarQuestoesDeTopico(topicoId, texto, fatias[0], dificuldade));
    for (let i = 0; i < extras.length; i++) {
      if (!fatias[i + 1]) continue;
      const t = extras[i];
      resultados.push(...await this.gerarQuestoesDeTopico(t.id, `Tópico: ${t.nome}\n${await this.conteudoDeTopico(t.id)}`, fatias[i + 1], dificuldade));
    }
    return resultados;
  },
  // Tópicos cuja revisão venceu (proxima <= hoje), prontos para revisar. Mais atrasados primeiro.
  revisoesTopicoVencidas() {
    const hoje = todayISO();
    return state.revisoesTopico
      .filter((r) => r.proxima <= hoje)
      .map((r) => ({ rev: r, topico: state.topicos.find((t) => t.id === r.topicoId) }))
      .filter((x) => x.topico)
      .sort((a, b) => a.rev.proxima.localeCompare(b.rev.proxima));
  },
  revisoesTopicoCount() {
    const hoje = todayISO();
    return state.revisoesTopico.filter((r) => r.proxima <= hoje).length;
  },
  // Próximas revisões agendadas (ainda não vencidas), ordenadas por data.
  proximasRevisoesTopico(limite = 8) {
    const hoje = todayISO();
    return state.revisoesTopico
      .filter((r) => r.proxima > hoje)
      .map((r) => ({ rev: r, topico: state.topicos.find((t) => t.id === r.topicoId) }))
      .filter((x) => x.topico)
      .sort((a, b) => a.rev.proxima.localeCompare(b.rev.proxima))
      .slice(0, limite);
  },
  // O que RELER na revisão do tópico: palavras-chave marcadas (tricromático, dir.4 — ainda
  // não existe) > resumo do tópico > material (fallback). Devolve {fonte, texto} ou null.
  // Faixa de páginas que o usuário REGISTROU para este tópico em "Registrar sessão" (leitura mais
  // recente com página). É o que liga a página registrada à revisão do tópico.
  paginaRegistradaDoTopico(topicoId) {
    if (!topicoId) return null;
    const sess = state.sessoes
      .filter((s) => s.topicoId === topicoId && s.paginaInicial && s.paginaFinal && s.paginaFinal >= s.paginaInicial)
      .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
    const s = sess[0];
    return s ? { ini: s.paginaInicial, fim: s.paginaFinal, sessaoId: s.id } : null;
  },
  palavrasParaReler(topicoId) {
    // 1ª escolha: palavras-chave 🟡 marcadas (tricromático, dir.4) nos itens do tópico.
    const chaves = this.palavrasChaveDoTopico(topicoId);
    if (chaves.length) return { fonte: "Palavras-chave marcadas (🟡)", texto: chaves.map((t) => "• " + t).join("\n") };
    const resumo = state.resumos.find((r) => r.topicoId === topicoId && stripHTML(r.conteudoHTML).trim());
    if (resumo) return { fonte: "Resumo: " + (resumo.titulo || "sem título"), texto: stripHTML(resumo.conteudoHTML).trim() };
    const docs = state.documentos.filter((d) => docCobre(d, topicoId) && (d.texto || "").trim());
    // Materiais que cobrem o tópico mas cujo conteúdo ainda está no cofre: sem isto a tela
    // afirmaria que não há o que reler, quando na verdade há — só não neste aparelho.
    const pendentes = state.documentos.filter((d) => docCobre(d, topicoId) && this.conteudoPendente(d));
    if (!docs.length && pendentes.length) {
      return { fonte: "Material no cofre", texto: "", pendente: true, docIds: pendentes.map((d) => d.id), titulo: pendentes[0].titulo };
    }
    // SINCRONIA página↔revisão: se o usuário registrou uma leitura (páginas) para este tópico,
    // relê EXATAMENTE aquele trecho do material (prioridade sobre a página do sumário).
    const reg = this.paginaRegistradaDoTopico(topicoId);
    if (reg) {
      for (const d of docs) {
        if (!Array.isArray(d.paginas) || !d.paginas.length) continue;
        const t = d.paginas.filter((p) => p.n >= reg.ini && p.n <= reg.fim).map((p) => p.texto || "").join("\n\n").trim();
        if (t) return { fonte: `Trecho registrado: ${rotuloDocumento(state, d)} (p.${reg.ini}–${reg.fim})`, texto: t.slice(0, 4000), docId: d.id, pagina: reg.ini };
      }
    }
    if (docs.length) {
      // F5: revisão POR BLOCO — se há blocos vinculados a este tópico, relê só o(s) trecho(s)
      // daquelas páginas (preciso), em vez do material inteiro.
      const trechos = [];
      for (const d of docs) {
        const blocos = ((d.estrutura && d.estrutura.blocos) || []).filter((b) => b.topicoId === topicoId);
        for (const b of blocos) {
          const t = ctxDeDoc(d, b).texto;
          if (t) trechos.push({ rotulo: `${rotuloDocumento(state, d)} · ${b.numero || ""} ${b.titulo} (p.${b.pIni}–${b.pFim})`.trim(), texto: t });
        }
      }
      if (trechos.length) {
        const texto = trechos.map((t) => t.texto).join("\n\n").slice(0, 4000);
        return { fonte: "Trecho do material: " + trechos[0].rotulo + (trechos.length > 1 ? ` (+${trechos.length - 1})` : ""), texto };
      }
      const texto = docs.map((d) => (d.texto || "").trim()).join("\n\n").slice(0, 4000);
      return { fonte: "Material: " + (rotuloDocumento(state, docs[0]) || "sem título") + (docs.length > 1 ? ` (+${docs.length - 1})` : ""), texto };
    }
    return null;
  },
  // Tópicos estudados com a revisão NÃO agendada (opt-out na sessão) e ainda fora da curva.
  // O Mentor sugere agendar. Devolve [{id, nome}].
  topicosRevisaoPendente() {
    const naCurva = new Set(state.revisoesTopico.map((r) => r.topicoId));
    const ids = new Set();
    state.sessoes.forEach((s) => {
      if (s.revisaoPendente && s.topicoId && !naCurva.has(s.topicoId)) ids.add(s.topicoId);
    });
    return [...ids].map((id) => state.topicos.find((t) => t.id === id)).filter(Boolean);
  },
  // Tópicos "frágeis": "esqueci" nas 2 últimas revisões → o Mentor sugere reestudar.
  topicosRevisaoFragil() {
    return state.revisoesTopico
      .filter((r) => {
        const h = (r.historico || []).slice(-2);
        return h.length >= 2 && h.every((x) => x.resultado === "esqueci");
      })
      .map((r) => state.topicos.find((t) => t.id === r.topicoId))
      .filter(Boolean);
  },

  // ---- MARCAÇÃO TRICROMÁTICA (dir.4) — grifo com significado fixo ----
  // 🟡 amarelo = palavras-chave · 🔵 azul = prazos/valores · 🔴 vermelho = restritivas.
  // É a FONTE das palavras-chave que a revisão de tópico (dir.2) relê.
  // Marca = {id, alvoTipo, alvoId, cor, inicio, fim, texto, origem}. inicio/fim = offsets no texto.
  marcasDe(alvoTipo, alvoId) {
    return state.marcacoes
      .filter((m) => m.alvoTipo === alvoTipo && m.alvoId === alvoId)
      .sort((a, b) => a.inicio - b.inicio);
  },
  addMarca({ alvoTipo, alvoId, cor, inicio, fim, texto, origem, nota, prefix, suffix }) {
    if (inicio == null || fim == null || fim <= inicio) return null;
    // Marca manual prevalece: remove qualquer marca que cruze o intervalo (evita sobreposição).
    // Exceção: comentários (cor 'comentario') convivem com grifos no mesmo trecho.
    const ehComentario = cor === "comentario";
    if (!ehComentario) {
      state.marcacoes = state.marcacoes.filter(
        (m) => !(m.alvoTipo === alvoTipo && m.alvoId === alvoId && m.cor !== "comentario" && m.inicio < fim && m.fim > inicio)
      );
    }
    // prefix/suffix = âncora de contexto (grifo tipo Kindle): permite reancorar se o texto mudar.
    const m = { id: uid("mk"), alvoTipo, alvoId, cor: cor || "amarelo", inicio, fim, texto: texto || "", prefix: prefix || "", suffix: suffix || "", origem: origem || "manual", nota: nota || "", criadoEm: nowISO() };
    state.marcacoes.push(m);
    commit();
    return m;
  },
  // Resiliência do grifo: devolve as marcas com o offset CONFERIDO contra o texto atual. Se o
  // offset não bate mais (o texto mudou/foi reprocessado), reancora pelo trecho exato + contexto
  // (prefix/suffix). Não achou → marca `orfa` (não some, mas o app pode sinalizar). Não persiste
  // aqui (roda no render); a cura vira permanente na próxima gravação do estado.
  marcasAncoradas(alvoTipo, alvoId, rawTexto) {
    const raw = String(rawTexto || "");
    return this.marcasDe(alvoTipo, alvoId).map((m) => {
      if (!m.texto || raw.slice(m.inicio, m.fim) === m.texto) return m; // offset válido (caminho rápido)
      const alvo = this._reancorarMarca(raw, m);
      return alvo ? { ...m, inicio: alvo.inicio, fim: alvo.fim, reancorada: true } : { ...m, orfa: true };
    });
  },
  _reancorarMarca(raw, m) {
    const exact = m.texto;
    if (!exact) return null;
    const pos = [];
    let i = raw.indexOf(exact);
    while (i >= 0 && pos.length < 50) { pos.push(i); i = raw.indexOf(exact, i + 1); }
    if (!pos.length) return null;
    if (pos.length === 1) return { inicio: pos[0], fim: pos[0] + exact.length };
    // Várias ocorrências: desempata pelo contexto guardado + proximidade do offset antigo.
    const pfx = (m.prefix || "").slice(-12), sfx = (m.suffix || "").slice(0, 12);
    let best = pos[0], bestScore = -Infinity;
    for (const p of pos) {
      const antes = raw.slice(Math.max(0, p - pfx.length), p);
      const depois = raw.slice(p + exact.length, p + exact.length + sfx.length);
      let score = 0;
      if (pfx && antes.endsWith(pfx)) score += 2;
      if (sfx && depois.startsWith(sfx)) score += 2;
      score += 1 - Math.min(1, Math.abs(p - m.inicio) / (raw.length || 1));
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return { inicio: best, fim: best + exact.length };
  },
  setMarcaNota(id, nota) {
    const m = state.marcacoes.find((x) => x.id === id);
    if (m) {
      m.nota = nota || "";
      commit();
    }
  },
  removerMarca(id) {
    state.marcacoes = state.marcacoes.filter((m) => m.id !== id);
    commit();
  },
  limparMarcas(alvoTipo, alvoId, origem = null) {
    state.marcacoes = state.marcacoes.filter(
      (m) => !(m.alvoTipo === alvoTipo && m.alvoId === alvoId && (!origem || m.origem === origem))
    );
    commit();
  },
  // Auto-marcação OFFLINE: 🔵 prazos/valores (números + unidade) e 🔴 restritivas (lista de
  // palavras). 🟡 palavras-chave e PQ ficam para a IA/marcação manual. Não duplica/sobrepõe.
  autoMarcar(alvoTipo, alvoId, texto) {
    if (!texto) return 0;
    const existentes = this.marcasDe(alvoTipo, alvoId);
    const cruza = (ini, fim) => existentes.some((m) => m.inicio < fim && m.fim > ini);
    const achados = [];
    const push = (ini, fim, cor) => {
      // apara pontuação/espaço nas pontas (ex.: "R$ 1.500,00," → "R$ 1.500,00")
      while (fim > ini && /[\s.,;:]/.test(texto[fim - 1])) fim--;
      while (ini < fim && /\s/.test(texto[ini])) ini++;
      if (fim > ini && !cruza(ini, fim) && !achados.some((a) => a.inicio < fim && a.fim > ini)) {
        achados.push({ inicio: ini, fim, cor, texto: texto.slice(ini, fim) });
      }
    };
    // 🔵 prazos/valores
    const reAzul = /R\$\s?\d[\d.,]*|\b\d+(?:[.,]\d+)?\s?(?:%|dias?|meses|m[êe]s|anos?|horas?|UFESP|sal[áa]rios?\s+m[íi]nimos?)\b/gi;
    let mm;
    while ((mm = reAzul.exec(texto)) !== null) push(mm.index, mm.index + mm[0].length, "azul");
    // 🔴 restritivas
    const reVermelho = /\b(salvo|exclusivamente|somente|vedad[oa]|exceto|ressalvad[oa]|apenas|desde que|sob pena|in[ck]onstitucional)\b/gi;
    while ((mm = reVermelho.exec(texto)) !== null) push(mm.index, mm.index + mm[0].length, "vermelho");
    achados.forEach((a) => {
      state.marcacoes.push({ id: uid("mk"), alvoTipo, alvoId, cor: a.cor, inicio: a.inicio, fim: a.fim, texto: a.texto, origem: "auto", criadoEm: nowISO() });
    });
    if (achados.length) commit();
    return achados.length;
  },
  // DOSSIÊ DE MARCAÇÕES por tópico: agrega TODAS as marcas (lei seca, juris, resumos,
  // material) do tópico, agrupadas por cor + os comentários, cada uma com a fonte.
  marcacoesDoTopico(topicoId) {
    const vazio = { porCor: {}, comentarios: [], total: 0 };
    if (!topicoId) return vazio;
    const fontes = new Map();
    state.indicacoes
      .filter((i) => i.topicoId === topicoId)
      .forEach((i) => fontes.set("indicacao:" + i.id, { tipo: i.tipo === "juris" ? "Jurisprudência" : "Lei Seca", titulo: i.referencia }));
    state.resumos.filter((r) => r.topicoId === topicoId).forEach((r) => fontes.set("resumo:" + r.id, { tipo: "Resumo", titulo: r.titulo }));
    state.documentos.filter((d) => docCobre(d, topicoId)).forEach((d) => fontes.set("documento:" + d.id, { tipo: "Material", titulo: rotuloDocumento(state, d) }));
    // documento: marca pode ser "docId" ou "docId#pagina" → casa pela base; cita a página.
    const baseId = (m) => (m.alvoTipo === "documento" ? String(m.alvoId).split("#")[0] : m.alvoId);
    const paginaDe = (m) => (m.alvoTipo === "documento" && String(m.alvoId).includes("#") ? String(m.alvoId).split("#")[1] : null);
    const marcas = state.marcacoes.filter((m) => fontes.has(m.alvoTipo + ":" + baseId(m)));
    const porCor = {};
    const comentarios = [];
    for (const m of marcas) {
      const fonte0 = fontes.get(m.alvoTipo + ":" + baseId(m));
      const pag = paginaDe(m);
      const fonte = pag ? { ...fonte0, titulo: fonte0.titulo + " · pág. " + pag } : fonte0;
      // alvoId BASE para o deep-link da fonte funcionar (abre o material/item).
      const base = { texto: m.texto, fonte, alvoTipo: m.alvoTipo, alvoId: baseId(m) };
      if (m.cor === "comentario") comentarios.push({ ...base, nota: m.nota });
      else (porCor[m.cor] = porCor[m.cor] || []).push(base);
    }
    return { porCor, comentarios, total: marcas.length };
  },
  // IA SUGERE palavras-chave (🟡) e as marca no texto (casa o offset literal, sem sobrepor
  // marcas existentes). Online (requer iaDisponivel()). Devolve o nº de marcas criadas.
  async sugerirMarcacoesIA(alvoTipo, alvoId, texto, contexto) {
    const palavras = await iaProv.sugerirPalavrasChave(state.config, { texto, contexto });
    const baixo = texto.toLowerCase();
    const existentes = this.marcasDe(alvoTipo, alvoId);
    const ocupado = existentes.map((m) => [m.inicio, m.fim]);
    let n = 0;
    for (const p of palavras) {
      const alvo = p.toLowerCase();
      if (alvo.length < 2) continue;
      let from = 0;
      let idx;
      // marca a 1ª ocorrência ainda livre de cada palavra
      while ((idx = baixo.indexOf(alvo, from)) !== -1) {
        const fim = idx + alvo.length;
        const cruza = ocupado.some(([a, b]) => a < fim && b > idx);
        if (!cruza) {
          state.marcacoes.push({ id: uid("mk"), alvoTipo, alvoId, cor: "amarelo", inicio: idx, fim, texto: texto.slice(idx, fim), origem: "ia", criadoEm: nowISO() });
          ocupado.push([idx, fim]);
          n++;
          break;
        }
        from = idx + 1;
      }
    }
    if (n) commit();
    return n;
  },
  // Palavras-chave (🟡 amarelo) marcadas nos itens de um tópico (lei seca, juris, resumos).
  // É o que a revisão de tópico (dir.2) prefere reler.
  palavrasChaveDoTopico(topicoId) {
    if (!topicoId) return [];
    const ids = new Set();
    state.indicacoes.filter((i) => i.topicoId === topicoId).forEach((i) => ids.add("indicacao:" + i.id));
    state.resumos.filter((r) => r.topicoId === topicoId).forEach((r) => ids.add("resumo:" + r.id));
    state.documentos.filter((d) => docCobre(d, topicoId)).forEach((d) => ids.add("documento:" + d.id));
    // documento pode ter alvoId "docId" ou "docId#pagina" (marcação por página) → casa pela base.
    const baseId = (m) => (m.alvoTipo === "documento" ? String(m.alvoId).split("#")[0] : m.alvoId);
    return state.marcacoes
      .filter((m) => m.cor === "amarelo" && ids.has(m.alvoTipo + ":" + baseId(m)))
      .map((m) => m.texto)
      .filter(Boolean);
  },
  importIndicacoes(texto, opts) {
    const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let n = 0;
    for (const l of linhas) {
      let partes;
      if (l.includes("\t")) partes = l.split("\t");
      else if (l.includes("|")) partes = l.split("|");
      else if (l.includes(";")) partes = l.split(";");
      else partes = [l];
      const referencia = (partes[0] || "").trim();
      const txt = (partes[1] || "").trim();
      if (referencia) {
        this.addIndicacao({ ...opts, referencia, texto: txt });
        n++;
      }
    }
    return n;
  },
  // PREVIEW inteligente e CONFIÁVEL: o parser determinístico estrutura o texto colado
  // (inclui tabelas achatadas: referência, trecho e observação em linhas separadas; cabeçalhos
  // de dia/coluna ignorados; tribunal/categoria deduzidos da referência na jurisprudência).
  // Só recorre à IA se o parser não reconhecer NADA (prosa solta) e houver IA conectada.
  // Prosa (não-lista) via IA: na JURISPRUDÊNCIA, um informativo/narrativa → extrair TESES
  // (extrairTesesInformativo); se não vier nada, cai no estruturador de listas. Na lei, estrutura.
  async _estruturarProsa(texto, tipo) {
    // F1 — parser DETERMINÍSTICO primeiro (STJ rotulado): extrai sem IA (economiza cota).
    if (tipo === "juris") {
      try { const det = parseInformativoDeterministico(texto); if (det && det.length) return det; } catch (e) { console.error(e); }
    }
    if (!this.iaDisponivel()) return [];
    if (tipo === "juris") {
      try {
        const teses = await iaProv.extrairTesesInformativo(state.config, { texto });
        if (teses.length) return teses.map((t) => ({
          referencia: t.referencia || "Tese", texto: t.texto, observacao: "",
          tribunal: t.tribunal || null, categoria: t.categoria || null,
          // F1: campos ricos do informativo (fluem até o addIndicacao/preview)
          ramo: t.ramo || null, assunto: t.assunto || null, orgao: t.orgao || null,
          processo: t.processo || null, tema: t.tema || null, dataJulgamento: t.dataJulgamento || null,
          status: t.status || "vigente", nInformativo: t.nInformativo || null, dataDivulgacao: t.dataDivulgacao || null,
        }));
      } catch (e) { console.error(e); }
    }
    try {
      const ia = await iaProv.estruturarLeiSeca(state.config, { texto, tipo });
      if (ia.length) return ia;
    } catch (e) { console.error(e); }
    return [];
  },
  async prepararIndicacoesAuto(texto, tipo) {
    // F1 — INFORMATIVO (STF/STJ): vai direto para a extração RICA (teses + ramo/processo/tema/status),
    // em vez do fatiador cru. Só cai no resto se a IA não retornar nada.
    if (tipo === "juris" && pareceInformativo(texto)) {
      const rico = await this._estruturarProsa(texto, tipo);
      if (rico.length) return rico;
    }
    // (C1/C2) Texto CORRIDO de uma lei/coletânea (não é lista) → fatiar por artigo/súmula/tese.
    if (pareceTextoCorrido(texto, tipo)) {
      const fatiado = tipo === "juris" ? fatiarJurisEmUnidades(texto) : fatiarLeiEmArtigos(texto);
      if (fatiado.length >= 2) return fatiado;
      const ia = await this._estruturarProsa(texto, tipo);
      if (ia.length) return ia;
      if (fatiado.length) return fatiado;
    }
    // LISTA de referências (comportamento original).
    const itens = this.prepararIndicacoes(texto, tipo);
    if (itens.length) return itens;
    const ia = await this._estruturarProsa(texto, tipo);
    if (ia.length) return ia;
    return itens;
  },
  // PREVIEW (não grava): estrutura o texto em itens {referencia, texto, observacao, tribunal, categoria}.
  // Suporta TRÊS formatos, sem IA:
  //  (a) ROTULADO: linhas "Referência: ...", "Trecho:/Tese: ...", "Observação: ...", "Tribunal: ...", "Categoria: ...";
  //  (b) uma linha:  referência | trecho | observação  (também ;);
  //  (c) TABELA achatada: a referência numa linha e o trecho (entre aspas) / observação nas linhas seguintes.
  // Ignora título, "Dia NN:", separadores (---), descrições e cabeçalhos de coluna.
  prepararIndicacoes(texto, tipo) {
    const ehJuris = tipo === "juris";
    const linhas = String(texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const headerColuna = /^(artigos?|trecho(\s+chave)?|observa[çc][aã]o|tese|s[uú]mula\s*\/\s*tema|refer[eê]ncia|gabarito)$/i;
    const ehHeaderColuna = (l) => headerColuna.test(l.trim());
    const ehHeaderTabela = (l) => l.includes("\t") && l.split("\t").map((c) => c.trim()).filter(Boolean).every(ehHeaderColuna);
    // Título/dia/separador/cabeçalho-descritivo (ex.: "Relatório Integrado", "Cabeçalhos Tab: ...", "--- Dia 01: ... ---", "--- fls/pág 2 ---").
    const ehTituloOuDia = (l) =>
      /^[-–—]{2,}/.test(l) ||
      /^[-–—\s]*dia\s*\d+/i.test(l) ||
      /^(cronograma|plano de estudo|lista de|relat[óo]rio|cabe[çc]alho)/i.test(l) ||
      /^cabe[çc]alhos?\s+tab\s*:/i.test(l);
    // Campo rotulado "Rótulo: valor" → {campo, valor}.
    const rotulo = (l) => {
      const m = l.match(/^(refer[êe]ncia|ref|trecho|tese|conte[úu]do|observa[çc][ãa]o|obs|nota|tribunal|corte|categoria|natureza|classe)\s*:\s*(.*)$/i);
      if (!m) return null;
      const k = m[1].toLowerCase();
      const val = (m[2] || "").trim();
      if (/^(refer|ref)/.test(k)) return { f: "ref", val };
      if (/^(trecho|tese|conte)/.test(k)) return { f: "texto", val };
      if (/^(observa|obs|nota)/.test(k)) return { f: "observacao", val };
      if (/^(tribunal|corte)/.test(k)) return { f: "tribunal", val };
      if (/^(categoria|natureza|classe)/.test(k)) return { f: "categoria", val };
      return null;
    };
    const normCat = (v) => {
      const s = (v || "").toLowerCase();
      if (/s[uú]mula\s+vinculante|\bsv\b/.test(s)) return "Súmula Vinculante";
      if (/s[uú]mula/.test(s)) return "Súmula";
      if (/teses/.test(s)) return "Jurisprudência em Teses";
      if (/repercuss/.test(s)) return "Repercussão Geral";
      if (/tema/.test(s)) return "Tema repetitivo";
      if (/enunciado/.test(s)) return "Enunciado";
      if (/precedente|orienta/.test(s)) return "Precedente obrigatório";
      return null;
    };
    // Referência "solta" (sem rótulo), por padrão de texto.
    const ehReferenciaSolta = (l) =>
      ehJuris
        ? /^(s[uú]mula(\s+vinculante)?|tema|precedente|enunciado|orienta[çc][aã]o jurisprudencial|oj\b|repercuss[aã]o geral)/i.test(l)
        : /^(arts?\.?|artigos?|§|par[aá]grafo|inciso|al[íi]nea)\b/i.test(l) || /^art\.?\s*\d/i.test(l);
    const itens = [];
    let atual = null;
    const novo = (ref) => { atual = { referencia: (ref || "").trim(), texto: "", observacao: "", tribunal: null, categoria: null }; itens.push(atual); };
    for (const l of linhas) {
      if (ehHeaderTabela(l) || ehHeaderColuna(l) || ehTituloOuDia(l)) { atual = null; continue; }
      // (a) campo ROTULADO.
      const rot = rotulo(l);
      if (rot) {
        if (rot.f === "ref") { novo(rot.val); }
        else if (atual) {
          if (rot.f === "texto") atual.texto = atual.texto ? `${atual.texto} ${rot.val}` : rot.val;
          else if (rot.f === "observacao") atual.observacao = atual.observacao ? `${atual.observacao} ${rot.val}` : rot.val;
          else if (rot.f === "tribunal") atual.tribunal = rot.val || null;
          else if (rot.f === "categoria") atual.categoria = normCat(rot.val);
        }
        continue;
      }
      // (b) uma linha com separador explícito ( | ou ; ).
      if (l.includes("|") || l.includes(";")) {
        const partes = (l.includes("|") ? l.split("|") : l.split(";")).map((p) => p.trim());
        if (partes[0]) { novo(partes[0]); atual.texto = partes[1] || ""; atual.observacao = partes.slice(2).filter(Boolean).join(" — "); }
        continue;
      }
      // (c) referência solta por padrão.
      if (ehReferenciaSolta(l)) { novo(l); continue; }
      // conteúdo de tabela achatada: pertence ao item atual (trecho se entre aspas; senão observação).
      if (atual) {
        const semAspas = l.replace(/^["“'»]+|["”'«]+$/g, "").trim();
        const ehTrecho = /^["“'»]/.test(l) || /["”'«]$/.test(l);
        if (ehTrecho && !atual.texto) atual.texto = semAspas;
        else atual.observacao = atual.observacao ? `${atual.observacao} ${l}` : l;
      }
    }
    // Na jurisprudência, deduz tribunal/categoria da referência quando não vieram explícitos.
    if (ehJuris) {
      for (const it of itens) {
        if (!it.tribunal) {
          const m = it.referencia.match(/\b(STF|STJ|TST|TSE|STM|TJ[A-Z]{2}|TRF-?\s?\d|TRT-?\s?\d+|TJSP)\b/i);
          if (m) it.tribunal = m[1].toUpperCase().replace(/\s|-/g, "");
        }
        if (!it.categoria) it.categoria = normCat(it.referencia);
      }
    }
    return itens.filter((it) => it.referencia);
  },
  // PREVIEW da extração por IA (não grava): devolve as referências citadas no material.
  async prepararIndicacoesDeDoc(docId, tipo) {
    await this.exigirConteudoDoc(docId); // conteúdo sob demanda
    const doc = state.documentos.find((d) => d.id === docId);
    if (!doc || !doc.texto.trim()) return [];
    const itens = await iaProv.extrairIndicacoes(state.config, {
      texto: doc.texto,
      contexto: nomeContexto(state, doc.topicoId),
      tipo,
    });
    return itens.map((it) => ({
      referencia: (it.referencia || "").trim(),
      texto: (it.texto || "").trim(),
      observacao: "",
      tribunal: it.tribunal || null,
      categoria: it.categoria || null,
      topicoId: doc.topicoId || null,
    }));
  },
  // Grava as indicações aprovadas no preview. opts = vínculo/atributos comuns (disciplina/tópico,
  // e, p/ juris, tribunal/categoria padrão); cada item pode trazer os seus (têm prioridade).
  aceitarIndicacoes(itens, opts = {}) {
    let n = 0, enriquecidos = 0;
    // Agrupador da fonte-mãe: se o lote veio de um informativo (mesmos nº+tribunal), cria/reusa grupoId.
    const mae = (itens || []).find((x) => x.nInformativo);
    const grupoId = mae && mae.nInformativo ? `grp_${String(mae.tribunal || opts.tribunal || "").toUpperCase().replace(/[^A-Z]/g, "")}_${String(mae.nInformativo).replace(/[^0-9]/g, "")}` : null;
    for (const it of itens || []) {
      if (!(it.referencia || "").trim()) continue;
      if (it._acao === "pular") continue; // usuário marcou "já tenho" no preview
      const chave = (opts.tipo === "juris") ? chaveIndic({ tribunal: it.tribunal || opts.tribunal, processo: it.processo, tema: it.tema, referencia: it.referencia }) : "";
      const existente = chave ? state.indicacoes.find((x) => (x.tipo || "lei") === "juris" && x.chave === chave) : null;
      if (existente && it._acao !== "substituir") {
        // RECONCILIAÇÃO (padrão = enriquecer): não duplica; soma fonte, preenche campos vazios,
        // atualiza status (ex.: veio como "superado" numa mudança de entendimento).
        this._enriquecerIndicacao(existente, it, grupoId, opts);
        enriquecidos++;
        continue;
      }
      if (existente && it._acao === "substituir") this.removerIndicacao(existente.id);
      this.addIndicacao({
        tipo: opts.tipo,
        modo: opts.modo,
        disciplinaId: opts.disciplinaId || null,
        topicoId: it.topicoId !== undefined ? it.topicoId : opts.topicoId || null,
        referencia: it.referencia,
        texto: it.texto,
        observacao: it.observacao,
        tribunal: it.tribunal || opts.tribunal || null,
        categoria: it.categoria || opts.categoria || null,
        ramo: it.ramo, assunto: it.assunto, orgao: it.orgao, processo: it.processo, tema: it.tema,
        dataJulgamento: it.dataJulgamento, dataDivulgacao: it.dataDivulgacao, nInformativo: it.nInformativo,
        grupoId, status: it.status,
      });
      n++;
    }
    return n + enriquecidos; // total processado (retrocompat: número)
  },
  // F1 — enriquece um item existente com dados de outra fonte (ex.: DOD acrescenta ao que veio do STJ).
  // Soma a fonte, preenche campos vazios e propaga mudança de status; NÃO sobrescreve o que já é bom.
  _enriquecerIndicacao(ind, it, grupoId, opts = {}) {
    ind.fontes = Array.isArray(ind.fontes) ? ind.fontes : [];
    const fonteNova = it.nInformativo ? `${(it.tribunal || opts.tribunal || "").toUpperCase()} Inf. ${it.nInformativo}` : (opts.fonteRotulo || "outra fonte");
    if (!ind.fontes.includes(fonteNova)) ind.fontes.push(fonteNova);
    const preenche = (campo, val) => { if (val && !ind[campo]) ind[campo] = val; };
    preenche("ramo", it.ramo); preenche("assunto", it.assunto); preenche("orgao", it.orgao);
    const procAntes = ind.processo, temaAntes = ind.temaNum;
    preenche("processo", it.processo); preenche("temaNum", it.tema); preenche("dataJulgamento", it.dataJulgamento);
    preenche("dataDivulgacao", it.dataDivulgacao); preenche("nInformativo", it.nInformativo);
    // Se ganhou processo/tema agora, recalcula a chave — senão uma importação futura com o processo
    // não encontraria este item (chave presa na referência antiga) e criaria duplicata.
    if ((ind.processo && ind.processo !== procAntes) || (ind.temaNum && ind.temaNum !== temaAntes)) {
      ind.chave = chaveIndic({ tribunal: ind.tribunal, processo: ind.processo, tema: ind.temaNum, referencia: ind.referencia });
    }
    if (grupoId && !ind.grupoId) ind.grupoId = grupoId;
    // Comentário/caso extra (ex.: o "caso concreto/fundamentos" do DOD) vai para observação, sem duplicar.
    if (it.observacao && !(ind.observacao || "").includes(it.observacao)) ind.observacao = [(ind.observacao || "").trim(), it.observacao.trim()].filter(Boolean).join("\n");
    // Mudança de entendimento: se a nova fonte diz que superou, marca.
    if (it.status === "superado" && !ind.revogado) { ind.revogado = true; ind.revogadoEm = todayISO(); ind.status = "superado"; }
    else if (it.status && !ind.status) ind.status = it.status;
    commit();
    return ind;
  },
  // F1 — o julgado do preview já está no sistema? Devolve a indicação existente (p/ o preview
  // mostrar "já no sistema" + oferecer pular/enriquecer/substituir), ou null.
  dupIndicacao(it) {
    if (!it) return null;
    const chave = chaveIndic({ tribunal: it.tribunal, processo: it.processo, tema: it.tema, referencia: it.referencia });
    if (!chave) return null;
    return state.indicacoes.find((x) => (x.tipo || "lei") === "juris" && x.chave === chave) || null;
  },
  // Importar LEI do texto/HTML oficial (Planalto) — letra EXATA, sem OCR. Só prepara o preview.
  // {html} (colado, com formatação p/ pegar revogado) OU {url} (busca no desktop/Tauri).
  // intervalo (opcional): "121-127, 155" → só esses artigos. Devolve { norma, artigos, revogados }.
  async prepararLei({ html, url, norma, intervalo } = {}) {
    let h = html;
    if (!h && url) h = await buscarLeiPlanalto(url); // Tauri; lança SEM_DESKTOP na web
    if (!h || !h.trim()) return { norma: norma || null, artigos: [], revogados: 0 };
    const r = parsearLeiHTML(h, { norma });
    const arts = selecionarArtigos(r.artigos, intervalo);
    return { norma: r.norma || norma || null, artigos: arts, revogados: arts.filter((a) => a.revogado).length };
  },
  // Grava os artigos escolhidos como indicações de LEI (com texto). Importar NÃO cria tarefa
  // (semTarefa). Revogados ficam FORA por padrão. Devolve { n, revogados }.
  aceitarLei(artigos, opts = {}) {
    let n = 0, rev = 0;
    for (const a of artigos || []) {
      if (!(a.referencia || "").trim()) continue;
      if (a.revogado && !opts.incluirRevogados) { rev++; continue; }
      this.addIndicacao({
        tipo: "lei",
        modo: "meta",
        semTarefa: !opts.comMeta, // comMeta → também vira tarefa de leitura no Planejamento
        revogado: !!a.revogado,
        disciplinaId: opts.disciplinaId || null,
        topicoId: opts.topicoId || null,
        referencia: a.referencia,
        texto: a.texto,
        estrutura: a.estrutura || null, // trilha hierárquica (Livro/Título/Capítulo/Seção)
        nomeJuridico: a.nomeJuridico || null, // rubrica marginal / tipo penal ("Homicídio simples")
        fonteUrl: opts.fonteUrl || null, // origem oficial p/ conferir novidade depois
        leiHash: hashLei(a.texto), // identidade do texto na importação
      });
      n++;
    }
    commit();
    return { n, revogados: rev };
  },
  // NOVIDADE LEGISLATIVA — diff MECÂNICO (por hash de artigo) entre o texto GUARDADO e a fonte
  // reconsultada (Planalto ou colado). Determinístico, sem IA. Classifica cada artigo em:
  // alterado (mesma ref, hash≠) · novo (ref inexistente) · revogado (era vigente, agora <strike>).
  // NÃO aplica nada — só devolve o diagnóstico para o usuário decidir. { norma } filtra a norma.
  async compararLeiComFonte({ norma, url, html, intervalo } = {}) {
    const prep = await this.prepararLei({ html, url, norma, intervalo });
    const normaAlvo = norma || prep.norma;
    // Guardados desta norma (a letra; ignora metas cruas). Compara pelo último segmento da ref.
    const guardados = state.indicacoes.filter(
      (i) => i.tipo === "lei" && !i.metaLeitura && normaDaReferencia(i.referencia) === normaAlvo
    );
    const porRef = new Map(guardados.map((i) => [i.referencia, i]));
    const alterados = [], novos = [], revogados = [];
    const refsFresh = new Set();
    for (const a of prep.artigos) {
      refsFresh.add(a.referencia);
      const g = porRef.get(a.referencia);
      if (!g) { if (!a.revogado) novos.push({ referencia: a.referencia, texto: a.texto, estrutura: a.estrutura || null }); continue; }
      if (a.revogado && !g.revogado) { revogados.push({ referencia: a.referencia, indId: g.id }); continue; }
      if (!a.revogado) {
        const hNovo = hashLei(a.texto);
        const hVelho = g.leiHash || hashLei(g.texto);
        if (hNovo !== hVelho) alterados.push({ referencia: a.referencia, textoNovo: a.texto, textoAntigo: g.texto, indId: g.id });
      }
    }
    return { norma: normaAlvo, url: url || null, alterados, novos, revogados, semMudanca: prep.artigos.length - alterados.length - novos.length - revogados.length };
  },
  // Aplica as novidades ESCOLHIDAS (o usuário decide item a item). Marca tudo como "novidade"
  // (selo + data) para virar treino. decisoes = { alterados:[{indId,texto}], novos:[{referencia,texto}],
  // revogados:[{indId, acao:'revogar'|'ignorar'}], disciplinaId }.
  aplicarNovidadesLei(decisoes = {}) {
    const hoje = todayISO();
    let nAlt = 0, nNovo = 0, nRev = 0;
    for (const a of decisoes.alterados || []) {
      const ind = state.indicacoes.find((x) => x.id === a.indId);
      if (!ind) continue;
      ind.textoAnterior = ind.texto; // guarda a redação anterior (histórico leve)
      ind.texto = a.texto;
      ind.leiHash = hashLei(a.texto);
      ind.novidadeEm = hoje;
      this.limparTreinoDeIndicacao && this.limparTreinoDeIndicacao(ind.id); // treino antigo é da redação velha
      nAlt++;
    }
    for (const nv of decisoes.novos || []) {
      this.addIndicacao({
        tipo: "lei", modo: "meta", semTarefa: true,
        disciplinaId: decisoes.disciplinaId || null,
        referencia: nv.referencia, texto: nv.texto, estrutura: nv.estrutura || null,
        leiHash: hashLei(nv.texto), novidadeEm: hoje,
      });
      nNovo++;
    }
    for (const rv of decisoes.revogados || []) {
      if (rv.acao === "ignorar") continue;
      const ind = state.indicacoes.find((x) => x.id === rv.indId);
      if (!ind) continue;
      ind.revogado = true;
      ind.novidadeEm = hoje;
      nRev++;
    }
    commit();
    return { alterados: nAlt, novos: nNovo, revogados: nRev };
  },
  // Marca que a NOVIDADE de um artigo foi vista (some o selo). Reaproveita novidadeEm=null.
  limparNovidade(id) {
    const ind = state.indicacoes.find((x) => x.id === id);
    if (ind) { ind.novidadeEm = null; commit(); }
  },
  // Quais normas têm origem oficial (fonteUrl) — para o botão "Conferir atualização".
  normasComFonte(tipo = "lei") {
    const m = new Map();
    for (const i of state.indicacoes) {
      if (i.tipo !== tipo || i.metaLeitura || !i.fonteUrl) continue;
      const nm = normaDaReferencia(i.referencia) || "(sem norma)";
      if (!m.has(nm)) m.set(nm, { norma: nm, url: i.fonteUrl, n: 0 });
      m.get(nm).n++;
    }
    return [...m.values()];
  },
  // Quantos artigos estão marcados como NOVIDADE (selo) por tipo — alimenta o banner/Mentor.
  novidadesPendentes(tipo = "lei") {
    return state.indicacoes.filter((i) => i.tipo === tipo && !i.metaLeitura && i.novidadeEm).length;
  },
  gerarFlashcardDeIndicacao(id) {
    const i = state.indicacoes.find((x) => x.id === id);
    if (!i) return null;
    const tag = i.tipo === "juris" ? (i.categoria || "Jurisprudência") : "Lei";
    const trib = i.tribunal ? ` (${i.tribunal})` : "";
    const frente = `${tag}${trib}: ${i.referencia}`;
    const verso = i.texto || "(consulte a referência indicada)";
    return this.addFlashcard({ frente, verso, topicoId: i.topicoId, disciplinaId: i.disciplinaId, selo: "verde", fonte: { tipo: "lei", titulo: i.referencia } });
  },
  // Flashcards pela IA a partir do texto de UMA indicação (pergunta/resposta, estilo estudo).
  // Online (requer iaDisponivel()). Vincula à fonte lei/juris. Devolve os cards criados.
  async gerarFlashcardsIADeIndicacao(id, n = 4, dificuldade = "medio") {
    const i = state.indicacoes.find((x) => x.id === id);
    if (!i || !(i.texto || "").trim()) return [];
    const cards = await iaProv.gerarFlashcards(state.config, {
      texto: i.texto, contexto: i.referencia, n,
      ...iaExtras(state, { topicoId: i.topicoId, topico: i.referencia, dificuldade }),
    });
    const fonte = { tipo: i.tipo === "juris" ? "juris" : "lei", titulo: i.referencia };
    return cards.map((c) => this.addFlashcard({ ...c, topicoId: i.topicoId, disciplinaId: i.disciplinaId, fonte, selo: "amarelo" }));
  },
  // F1 — CLOZE ("complete a lei"): gera cards de LACUNA a partir do texto da indicação,
  // apagando palavras-chave (números/prazos, quóruns, verbos de comando, termos restritivos).
  // Heurística LOCAL (sem IA/sem cota). Cada lacuna vira um flashcard qa (entra no SM-2/Central).
  gerarClozeDeIndicacao(id, max = 4) {
    const i = state.indicacoes.find((x) => x.id === id);
    if (!i) return [];
    const texto = (i.texto || "").trim();
    // F7 (grifo→cloze): se o usuário grifou trechos, as LACUNAS saem dos grifos (recall do que ele
    // mesmo marcou como importante); sem grifos, cai no seletor automático de lacunas.
    const grifos = state.marcacoes
      .filter((m) => m.alvoTipo === "indicacao" && m.alvoId === id && m.cor !== "comentario" && texto.slice(m.inicio, m.fim) === m.texto)
      .sort((a, b) => a.inicio - b.inicio)
      .slice(0, max)
      .map((m) => ({ idx: m.inicio, len: m.fim - m.inicio, palavra: m.texto }));
    const escolhidos = grifos.length ? grifos : selecionarLacunas(texto, max);
    if (!escolhidos.length) return [];
    const fonte = { tipo: i.tipo === "juris" ? "juris" : "lei", titulo: i.referencia };
    return escolhidos.map((a) =>
      this.addFlashcard({
        frente: `${i.referencia} — complete:\n${texto.slice(0, a.idx)}______${texto.slice(a.idx + a.len)}`,
        verso: a.palavra,
        topicoId: i.topicoId,
        disciplinaId: i.disciplinaId,
        selo: "verde",
        fonte,
      })
    );
  },
  // E — Memorizar pela LETRA: teste de recall inline (texto com lacunas + revelar), sem SM-2
  // (a graduação continua nos botões esqueci/lembrei/fácil do item). Devolve texto + lacunas.
  lacunasDeIndicacao(id, max = 6) {
    const i = state.indicacoes.find((x) => x.id === id);
    if (!i) return null;
    const texto = (i.texto || "").trim();
    const lacunas = selecionarLacunas(texto, max);
    return { referencia: i.referencia, texto, lacunas };
  },
  // #10 Completar o artigo em 4 NÍVEIS. Recebe o texto LIMPO (sem "Art. Nº") e devolve as lacunas
  // {idx,len,palavra} para preencher inline. fácil = palavras-chave · médio = expressões ·
  // difícil = cláusulas inteiras · extremo = digitação (sem lacunas parciais; retype completo).
  lacunasCloze(textoLimpo, nivel = "facil") {
    const t = String(textoLimpo || "");
    if (nivel === "extremo") return [];
    if (nivel === "dificil") return lacunasFrases(t);
    if (nivel === "medio") return lacunasExpressoes(t, 9);
    const base = selecionarLacunas(t, 3); // fácil = palavras-chave; se o texto não tiver nenhuma, cai em expressões
    return base.length ? base : lacunasExpressoes(t, 3);
  },
  // O — VIGÊNCIA: normas (leis) cuja conferência mais recente passou de ~N meses. Data efetiva
  // de um artigo = vigenciaEm (conferida) ou criadoEm. Devolve [{norma, meses, ids}] a conferir.
  _panoramaVigencia(meses = 6) {
    const limite = addDays(todayISO(), -Math.round(meses * 30.4));
    const porNorma = new Map();
    for (const i of state.indicacoes) {
      if (i.tipo !== "lei") continue;
      const norma = normaDaReferencia(i.referencia);
      if (!norma) continue;
      const d = String(i.vigenciaEm || i.criadoEm || "").slice(0, 10);
      if (!porNorma.has(norma)) porNorma.set(norma, { recente: d, ids: [i.id] });
      else { const c = porNorma.get(norma); if (d > c.recente) c.recente = d; c.ids.push(i.id); }
    }
    const out = [];
    for (const [norma, v] of porNorma) {
      if (v.recente && v.recente < limite) out.push({ norma, meses: Math.max(1, Math.round(daysBetween(v.recente, todayISO()) / 30.4)), ids: v.ids });
    }
    out.sort((a, b) => b.meses - a.meses);
    return out;
  },
  // Marca a vigência de uma norma como conferida HOJE (em todos os artigos daquela lei).
  marcarVigenciaConferida(id) {
    const i = state.indicacoes.find((x) => x.id === id);
    if (!i) return null;
    const norma = normaDaReferencia(i.referencia);
    const hoje = todayISO();
    let n = 0;
    for (const x of state.indicacoes) {
      if (x.tipo === "lei" && (norma ? normaDaReferencia(x.referencia) === norma : x.id === id)) { x.vigenciaEm = hoje; n++; }
    }
    commit();
    return { norma: norma || i.referencia, n };
  },
  // K — QUEBRAR EM TESES: um informativo (narrativa) salvo como 1 item vira teses individuais
  // (indicações de jurisprudência). Online (IA). O item original é mantido (é a "meta de leitura").
  async quebrarEmTeses(id) {
    const i = state.indicacoes.find((x) => x.id === id);
    if (!i || i.tipo !== "juris") return [];
    const texto = (i.texto || "").trim();
    if (texto.length < 120) return [];
    const teses = await iaProv.extrairTesesInformativo(state.config, { texto });
    const criadas = [];
    for (const t of teses) {
      if (!(t.referencia || t.texto)) continue;
      criadas.push(this.addIndicacao({
        tipo: "juris",
        modo: i.modo,
        disciplinaId: i.disciplinaId,
        topicoId: i.topicoId,
        referencia: t.referencia || "Tese",
        texto: t.texto,
        observacao: "",
        tribunal: t.tribunal || i.tribunal || null,
        categoria: t.categoria || null,
      }));
    }
    return criadas;
  },
  // Vínculo súmula/tese ↔ artigo: uma jurisprudência que CITA "art. N" (da mesma norma) liga-se
  // à indicação de lei correspondente, e vice-versa. Detecção automática por referência.
  vinculosDaIndicacao(id) {
    const i = state.indicacoes.find((x) => x.id === id);
    if (!i) return [];
    const artsDe = (txt) => { const out = []; const re = /\bart(?:igo)?\.?\s*(\d+)/gi; let m; while ((m = re.exec(txt || ""))) out.push(m[1]); return [...new Set(out)]; };
    const numDe = (ref) => { const m = String(ref || "").match(/\bart(?:igo)?\.?\s*(\d+)/i); return m ? m[1] : null; };
    const normaDe = (s) => { const m = String(s || "").match(/\b(CF|CPC|CPP|CTN|CLT|CDC|CP|CC)\b|lei\s*(?:complementar\s*)?n?[ºo°.]*\s*[\d.]+/i); return m ? m[0].toUpperCase().replace(/\s+/g, " ") : null; };
    if (i.tipo === "juris") {
      const nums = new Set(artsDe(i.texto));
      if (!nums.size) return [];
      const normaTexto = normaDe(i.texto);
      return state.indicacoes.filter((x) => x.tipo === "lei" && x.id !== i.id && nums.has(numDe(x.referencia)) && (() => {
        const n = normaDe(x.referencia); return !n || !normaTexto || normaTexto.includes(n) || n.includes(normaTexto);
      })());
    }
    const meu = numDe(i.referencia);
    if (!meu) return [];
    const minhaNorma = normaDe(i.referencia);
    return state.indicacoes.filter((x) => x.tipo === "juris" && x.id !== i.id && artsDe(x.texto).includes(meu) && (() => {
      const nt = normaDe(x.texto); return !minhaNorma || !nt || nt.includes(minhaNorma) || minhaNorma.includes(nt);
    })());
  },
  // Índice de vínculos súmula↔artigo para a TELA INTEIRA de uma vez (evita O(n²): antes o render
  // chamava vinculosDaIndicacao por item). Indexa leis por número de artigo e casa com os números
  // citados no texto de cada jurisprudência. Devolve { indId: [indicações vinculadas] }.
  mapaVinculos() {
    const numDe = (ref) => { const m = String(ref || "").match(/\bart(?:igo)?\.?\s*(\d+)/i); return m ? m[1] : null; };
    const artsDe = (txt) => { const out = []; const re = /\bart(?:igo)?\.?\s*(\d+)/gi; let m; while ((m = re.exec(txt || ""))) out.push(m[1]); return [...new Set(out)]; };
    const normaDe = (s) => { const m = String(s || "").match(/\b(CF|CPC|CPP|CTN|CLT|CDC|CP|CC)\b|lei\s*(?:complementar\s*)?n?[ºo°.]*\s*[\d.]+/i); return m ? m[0].toUpperCase().replace(/\s+/g, " ") : null; };
    const leiPorNum = new Map();
    for (const l of state.indicacoes) {
      if (l.tipo !== "lei") continue;
      const n = numDe(l.referencia); if (!n) continue;
      if (!leiPorNum.has(n)) leiPorNum.set(n, []);
      leiPorNum.get(n).push(l);
    }
    const map = {};
    const liga = (a, b) => { (map[a.id] = map[a.id] || []).push(b); };
    for (const j of state.indicacoes) {
      if (j.tipo !== "juris") continue;
      const nums = artsDe(j.texto); if (!nums.length) continue;
      const nt = normaDe(j.texto);
      for (const n of nums) {
        for (const l of leiPorNum.get(n) || []) {
          const ln = normaDe(l.referencia);
          if (!ln || !nt || nt.includes(ln) || ln.includes(nt)) { liga(j, l); liga(l, j); }
        }
      }
    }
    return map;
  },
  // Gera questões pela IA a partir de uma indicação de lei seca OU jurisprudência.
  // Online (requer iaDisponivel()). Usa o trecho gravado; na falta dele, a própria
  // referência (ex.: "Súmula 473 STF") como âncora. Devolve um array de questões.
  async gerarQuestoesDeIndicacao(id, n = 3, dificuldade = "medio", formato = "mc") {
    const i = state.indicacoes.find((x) => x.id === id);
    if (!i) return [];
    const base = (i.texto || "").trim() || (i.referencia || "").trim();
    if (!base) return [];
    const ehJuris = i.tipo === "juris";
    const rotulo = ehJuris ? `Jurisprudência${i.tribunal ? " (" + i.tribunal + ")" : ""}` : "Lei seca";
    const texto = `${rotulo}: ${i.referencia}\n\n${i.texto || ""}`.trim();
    // "Provável cobrança": direciona a IA para o que MAIS cai deste dispositivo, no estilo da banca.
    const contexto = `${rotulo} — ${nomeContexto(state, i.topicoId)} · gere a PROVÁVEL COBRANÇA deste dispositivo (o que mais cai), no estilo da banca`;
    const extras = iaExtras(state, { topicoId: i.topicoId, dificuldade });
    const fonte = { tipo: ehJuris ? "juris" : "lei", titulo: i.referencia };
    if (formato === "ce") {
      const itens = await iaProv.gerarQuestoesCE(state.config, { texto, contexto, n, ...extras });
      return itens.map((it) =>
        this.addQuestao({
          enunciado: it.afirmacao,
          alternativas: ["Certo", "Errado"],
          gabarito: it.certo ? 0 : 1,
          formato: "ce",
          justificativa: it.justificativa,
          selo: it.selo || "amarelo",
          topicoId: i.topicoId,
          disciplinaId: i.disciplinaId,
          referencia: i.referencia,
          fonte,
        })
      );
    }
    const qs = await iaProv.gerarQuestoes(state.config, { texto, contexto, n, ...extras });
    return qs.map((q) =>
      this.addQuestao({ ...q, topicoId: i.topicoId, disciplinaId: i.disciplinaId, referencia: i.referencia, fonte })
    ).filter(Boolean); // addQuestao recusa item sem gabarito válido
  },
  // Itens de TREINO (drill "letra da lei") já gerados desta indicação (formato C/E, treino=true).
  itensTreinoDeIndicacao(id) {
    return state.questoes.filter((q) => q.treino && q.treino.indicacaoId === id);
  },
  // Itens de SÚMULA-DUELO (nº/tribunal trocado) desta indicação.
  itensDueloDeIndicacao(id) {
    return state.questoes.filter((q) => q.treino && q.treino.indicacaoId === id && q.treino.duelo);
  },
  // L1 — SÚMULA-DUELO: variante de jurisprudência onde a banca troca o NÚMERO ou o TRIBUNAL.
  // 100% LOCAL (sabemos o correto): 1 item Certo + nº trocado + tribunal trocado, com diff colorido.
  gerarSumulaDueloDeIndicacao(id) {
    const i = state.indicacoes.find((x) => x.id === id);
    if (!i || i.tipo !== "juris") return [];
    const m = String(i.referencia || "").match(/(\d+)/);
    if (!m) return [];
    const num = m[1];
    const numFake = String(parseInt(num, 10) + 1);
    const refBase = i.referencia.trim(); // ex.: "Súmula 473" · "Súmula Vinculante 13" · "Tema 1234"
    const trib = i.tribunal || null;
    // Tese = texto sem o prefixo de referência/tribunal (evita repetir "Súmula 473 STF" na afirmação).
    let tese = (i.texto || "").trim().replace(/^\s*(?:s[úu]mula(?:\s+vinculante)?|tema(?:\s+repetitivo)?|enunciado|oj)\s*(?:n[ºo°.]*\s*)?\d+\s*(?:do\s+)?(?:stf|stj|tst|tse|tj[a-z]{2})?\s*[:.\-–]?\s*/i, "").trim();
    if (!tese) tese = (i.texto || "").trim();
    const fonte = { tipo: "juris", titulo: i.referencia };
    const criados = [];
    const criadosPush = (q) => { if (q) criados.push(q); }; // addQuestao recusa item sem gabarito
    const add = (afirmacao, certo, orig, alt) =>
      criadosPush(this.addQuestao({
        enunciado: afirmacao, alternativas: ["Certo", "Errado"], gabarito: certo ? 0 : 1, formato: "ce",
        justificativa: certo ? `Atribuição correta: ${refBase}${trib ? " do " + trib : ""}.` : `Atribuição incorreta — o correto é ${refBase}${trib ? " do " + trib : ""}.`,
        topicoId: i.topicoId, disciplinaId: i.disciplinaId, referencia: i.referencia, fonte, selo: "verde",
        treino: true, indicacaoId: i.id, duelo: true, diff: certo ? null : { trechoOriginal: orig, trechoAlterado: alt },
      }));
    add(`${refBase}${trib ? " do " + trib : ""}: ${tese}`, true);
    add(`${refBase.replace(num, numFake)}${trib ? " do " + trib : ""}: ${tese}`, false, num, numFake);
    if (trib) {
      const tribFake = /stf/i.test(trib) ? "STJ" : "STF";
      add(`${refBase} do ${tribFake}: ${tese}`, false, trib, tribFake);
    }
    return criados;
  },
  // Remove os itens de treino desta indicação (e as tentativas ligadas a eles) — para regerar.
  limparTreinoDeIndicacao(id) {
    const ids = new Set(state.questoes.filter((q) => q.treino && q.treino.indicacaoId === id).map((q) => q.id));
    if (!ids.size) return 0;
    state.questoes = state.questoes.filter((q) => !ids.has(q.id));
    state.tentativas = state.tentativas.filter((t) => !ids.has(t.questaoId));
    commit();
    return ids.size;
  },
  // DRILL: gera itens Certo/Errado "à moda da banca" a partir do TEXTO da indicação, com o diff
  // (trecho original × alterado) para a correção colorida. Online. Marca treino=true (não polui
  // a lista de Questões). O "verde" (correto) vem do texto guardado; descarta item cujo trecho
  // original não exista no texto ou seja igual ao alterado (blindagem contra alucinação).
  async gerarTreinoDeIndicacao(id, n = 6, dificuldade = "medio") {
    const i = state.indicacoes.find((x) => x.id === id);
    if (!i) return [];
    const texto = (i.texto || "").trim();
    if (!texto) return [];
    const ehJuris = i.tipo === "juris";
    // Literal (diff da palavra): lei, súmula e tema repetitivo. Paráfrase: informativo/precedente.
    const literal = !ehJuris || /s[uú]mula|tema/i.test(i.categoria || "");
    const itens = await iaProv.gerarLeiSecaCE(state.config, {
      texto,
      referencia: i.referencia,
      tipo: i.tipo,
      literal,
      n,
      ...iaExtras(state, { topicoId: i.topicoId, dificuldade }),
    });
    const fonte = { tipo: ehJuris ? "juris" : "lei", titulo: i.referencia };
    const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const criadas = [];
    for (const it of itens) {
      // Nos ERRADOS: se há trecho válido (literal), monta o diff colorido. Para item LITERAL sem
      // trecho válido, descarta (blindagem). Para PARÁFRASE (informativo), aceita C/E conceitual
      // sem diff — o "verde/vermelho da palavra" não faz sentido num texto que já é resumo.
      let diff = null;
      if (!it.certo) {
        const orig = it.trechoOriginal, alt = it.trechoAlterado;
        const trechoValido = orig && alt && norm(orig) !== norm(alt) && norm(texto).includes(norm(orig));
        if (trechoValido) diff = { trechoOriginal: orig, trechoAlterado: alt };
        else if (literal) continue;
      }
      criadas.push(
        this.addQuestao({
          enunciado: it.afirmacao,
          alternativas: ["Certo", "Errado"],
          gabarito: it.certo ? 0 : 1,
          formato: "ce",
          justificativa: it.justificativa,
          topicoId: i.topicoId,
          disciplinaId: i.disciplinaId,
          referencia: i.referencia,
          fonte,
          selo: "amarelo",
          treino: true,
          indicacaoId: i.id,
          diff,
        })
      );
    }
    return criadas;
  },

  // ---------- trilhas / missões ----------
  addMissao({ titulo, topicoId, origem, categoria, data, estimMin }) {
    const m = {
      id: uid("miss"),
      titulo: (titulo || "").trim() || "Missão",
      topicoId: topicoId || null,
      origem: origem || "manual",
      categoria: categoria || "Não definida",
      data: data || null, // null = solta (sem dia); 'yyyy-mm-dd' = datada nesse dia
      estimMin: estimMin != null && estimMin !== "" ? Math.max(0, Number(estimMin) || 0) : null, // tempo SUGERIDO (opcional)
      ordem: state.missoes.length,
      concluida: false,
      criadoEm: nowISO(),
    };
    state.missoes.push(m);
    commit();
    return m;
  },
  // Tempo estimado/sugerido (min) da tarefa. null/"" limpa. É só sugestão — nunca cobrança.
  setMissaoEstim(id, min) {
    const m = state.missoes.find((x) => x.id === id);
    if (m) {
      m.estimMin = min != null && min !== "" ? Math.max(0, Number(min) || 0) : null;
      commit();
    }
  },
  // Define (ou limpa) o dia de uma tarefa: data ISO 'yyyy-mm-dd' = datada; null = volta a ser solta.
  setMissaoData(id, data) {
    const m = state.missoes.find((x) => x.id === id);
    if (m) {
      m.data = data || null;
      commit();
    }
  },
  setMissaoCategoria(id, categoria) {
    const m = state.missoes.find((x) => x.id === id);
    if (m) {
      m.categoria = categoria;
      commit();
    }
  },
  // Nota/comentário livre da missão (ex.: "ler a Lei X — atenção ao art. tal").
  setMissaoComentario(id, texto) {
    const m = state.missoes.find((x) => x.id === id);
    if (m) {
      m.comentario = (texto || "").trim();
      commit();
    }
  },
  // Edita o título da missão (inclusive das extraídas).
  setMissaoTitulo(id, titulo) {
    const m = state.missoes.find((x) => x.id === id);
    if (m && (titulo || "").trim()) {
      m.titulo = titulo.trim();
      commit();
    }
  },
  // Vincula (ou desvincula) a missão a um tópico.
  setMissaoTopico(id, topicoId) {
    const m = state.missoes.find((x) => x.id === id);
    if (m) {
      m.topicoId = topicoId || null;
      commit();
    }
  },
  // Move a missão para cima (-1) ou para baixo (+1) na lista inteira de pendentes
  // (ou de concluídas), independentemente da categoria — ordem livre.
  moverMissao(id, dir) {
    const m = state.missoes.find((x) => x.id === id);
    if (!m) return;
    const lista = state.missoes
      .filter((x) => x.concluida === m.concluida)
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    const idx = lista.findIndex((x) => x.id === id);
    const alvo = lista[idx + dir];
    if (!alvo) return;
    const tmp = m.ordem ?? 0;
    m.ordem = alvo.ordem ?? 0;
    alvo.ordem = tmp;
    commit();
  },
  // Reordena uma tarefa AVULSA (sem data) por ARRASTO: coloca `dragId` imediatamente
  // ANTES de `alvoId` e renumera a `ordem` das avulsas de mesmo status (pendente/concluída).
  reordenarMissao(dragId, alvoId) {
    if (!dragId || !alvoId || dragId === alvoId) return;
    const drag = state.missoes.find((x) => x.id === dragId);
    const alvo = state.missoes.find((x) => x.id === alvoId);
    if (!drag || !alvo || drag.concluida !== alvo.concluida) return;
    const lista = state.missoes
      .filter((x) => !x.data && x.concluida === drag.concluida)
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    const semDrag = lista.filter((x) => x.id !== dragId);
    const idx = semDrag.findIndex((x) => x.id === alvoId);
    if (idx < 0) return;
    semDrag.splice(idx, 0, drag);
    semDrag.forEach((m, i) => { m.ordem = i; });
    commit();
  },
  toggleMissao(id) {
    const m = state.missoes.find((x) => x.id === id);
    if (m) {
      m.concluida = !m.concluida;
      // Data em que foi concluída (só o dia, não hora) — usada para as tarefas AVULSAS
      // continuarem visíveis em "Hoje" no dia em que foram feitas, e sumirem no dia seguinte
      // (igual às tarefas datadas, que somem por só existirem no dia marcado).
      m.concluidaEm = m.concluida ? todayISO() : null;
      // sincroniza com a indicação de leitura (lei seca / jurisprudência), se vinculada
      if (m.indicacaoId) {
        const ind = state.indicacoes.find((i) => i.id === m.indicacaoId);
        if (ind) ind.lido = m.concluida;
      }
      commit();
    }
  },
  removerMissao(id) {
    // Simetria com removerIndicacao: se a tarefa estiver vinculada a uma meta de
    // leitura (lei seca / jurisprudência), remove também a meta para não deixá-la
    // órfã na aba correspondente. (A limpeza em lote de concluídas é exceção: ver
    // limparMissoesConcluidas, que preserva a indicação de propósito.)
    const m = state.missoes.find((x) => x.id === id);
    if (m && m.indicacaoId) {
      state.indicacoes = state.indicacoes.filter((i) => i.id !== m.indicacaoId);
    }
    state.missoes = state.missoes.filter((x) => x.id !== id);
    // Solta o vínculo nas sessões que apontavam para esta tarefa.
    state.sessoes.forEach((s) => {
      if (s.missaoId === id) s.missaoId = null;
    });
    commit();
  },
  // Remove as missões já concluídas (a indicação de leitura, se houver, permanece
  // registrada em sua aba). Devolve quantas foram removidas.
  limparMissoesConcluidas() {
    const n = state.missoes.filter((m) => m.concluida).length;
    state.missoes = state.missoes.filter((m) => !m.concluida);
    commit();
    return n;
  },
  // Limpa todas as tarefas DATADAS da semana corrente (grade Seg→Dom), pendentes ou concluídas.
  // NÃO mexe na rotina recorrente (template) nem nas tarefas avulsas (sem dia). Devolve o total.
  limparMissoesSemana() {
    const semana = new Set(this.semanaAtual());
    const alvo = state.missoes.filter((m) => m.data && semana.has(m.data));
    const n = alvo.length;
    state.missoes = state.missoes.filter((m) => !(m.data && semana.has(m.data)));
    commit();
    return n;
  },
  // Limpa todas as tarefas AVULSAS (sem dia), pendentes ou concluídas. Devolve o total removido.
  limparMissoesAvulsas() {
    const n = state.missoes.filter((m) => !m.data).length;
    state.missoes = state.missoes.filter((m) => m.data);
    commit();
    return n;
  },
  // Extrai missões de um texto (trilha/cronograma colado) — IA-assistida.
  // Offline (sem IA): quebra por linha; cada linha vira uma tarefa (sem observação).
  extrairMissoes(texto, topicoId = null, estimMin = null) {
    const itens = texto
      .split(/\r?\n/)
      .map((l) => l.replace(/^[\s\-*•\d.)]+/, "").trim())
      .filter((l) => l.length >= 3);
    return itens.map((l) => {
      // tempo escrito na linha ("(50 min)") tem prioridade sobre o "tempo p/ cada".
      const p = extrairTempoDoTitulo(l);
      return this.addMissao({ titulo: p.titulo, topicoId, origem: "extraida", estimMin: p.estimMin != null ? p.estimMin : estimMin });
    });
  },
  // Online (IA): identifica as tarefas e separa a OBSERVAÇÃO de cada uma. Requer
  // iaDisponivel() — a UI escolhe este caminho quando há IA conectada.
  async extrairTarefasIA(texto, topicoId = null, estimMin = null) {
    const itens = await iaProv.extrairTarefas(state.config, {
      texto,
      contexto: nomeContexto(state, topicoId),
    });
    return itens.map((it) => {
      const p = extrairTempoDoTitulo(it.titulo);
      const tempo = p.estimMin != null ? p.estimMin : it.min != null ? Math.max(0, Number(it.min) || 0) : estimMin;
      const m = this.addMissao({ titulo: p.titulo, topicoId, origem: "extraida", estimMin: tempo });
      if (it.observacao) this.setMissaoComentario(m.id, it.observacao);
      return m;
    });
  },
  // PREVIEW da extração de avulsas: devolve a PROPOSTA (não grava), para revisar/voltar
  // antes de criar. Online separa a observação; offline quebra por linha (sem observação).
  async prepararExtracaoTarefas(texto, topicoId = null, estimMin = null) {
    // TRILHA do cursinho: o arquivo já vem com as metas numeradas ("TAREFA 01"…), e esse número é
    // a ordem de execução. Recortar é melhor que interpretar — a IA, com as 34 páginas inteiras,
    // devolveu 8 tarefas inventadas das primeiras páginas e perdeu o resto. Sem IA e sem corte.
    if (ia.pareceTrilha(texto)) {
      return ia.interpretarTrilha(texto).map((t) => ({ titulo: t.titulo, observacao: t.observacao, estimMin }));
    }
    if (this.iaDisponivel()) {
      const itens = await iaProv.extrairTarefas(state.config, { texto, contexto: nomeContexto(state, topicoId) });
      return itens.map((it) => {
        const sep = separarObservacao(it.titulo);
        const p = extrairTempoDoTitulo(sep.titulo);
        const tempo = p.estimMin != null ? p.estimMin : it.min != null ? Math.max(0, Number(it.min) || 0) : estimMin;
        const observacao = sep.observacao || String(it.observacao || "").trim();
        return { titulo: tirarMarcadorLista(p.titulo), observacao, estimMin: tempo };
      });
    }
    return String(texto || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length >= 3)
      .map((l) => {
        const sep = separarObservacao(l);
        const p = extrairTempoDoTitulo(tirarMarcadorLista(sep.titulo));
        return { titulo: tirarMarcadorLista(p.titulo), observacao: sep.observacao, estimMin: p.estimMin != null ? p.estimMin : estimMin };
      });
  },
  // Grava as tarefas avulsas aprovadas no preview (sem dia, opcionalmente vinculadas a um tópico).
  aceitarExtracaoTarefas(itens, topicoId = null) {
    let n = 0;
    for (const it of itens || []) {
      const m = this.addMissao({ titulo: it.titulo, topicoId: topicoId || null, origem: "extraida", estimMin: it.estimMin != null ? it.estimMin : null });
      if (m && it.observacao) this.setMissaoComentario(m.id, it.observacao);
      n++;
    }
    return n;
  },

  // ---------- rotina semanal recorrente + visão por semana ----------
  // As 7 datas ISO da semana corrente (Segunda → Domingo).
  semanaAtual(refISO = todayISO()) {
    const seg = inicioSemanaISO(refISO);
    return Array.from({ length: 7 }, (_, i) => addDays(seg, i));
  },
  // Cria um modelo de tarefa recorrente para um dia da semana (dia: 0=Dom ... 6=Sáb).
  addRotina({ titulo, dia, topicoId, categoria, comentario, estimMin }) {
    const r = {
      id: uid("rot"),
      titulo: (titulo || "").trim() || "Tarefa da rotina",
      dia: Number(dia) || 0,
      topicoId: topicoId || null,
      categoria: categoria || "Não definida",
      comentario: (comentario || "").trim(),
      estimMin: estimMin != null && estimMin !== "" ? Math.max(0, Number(estimMin) || 0) : null,
      ativa: true,
      feitos: {}, // 'yyyy-mm-dd' -> true (marcação de feito por ocorrência/data)
      criadoEm: nowISO(),
    };
    state.rotinas.push(r);
    commit();
    return r;
  },
  setRotina(id, patch) {
    const r = state.rotinas.find((x) => x.id === id);
    if (!r) return;
    if (patch.titulo !== undefined) r.titulo = (patch.titulo || "").trim() || r.titulo;
    if (patch.dia !== undefined) r.dia = Number(patch.dia) || 0;
    if (patch.topicoId !== undefined) r.topicoId = patch.topicoId || null;
    if (patch.categoria !== undefined) r.categoria = patch.categoria;
    if (patch.comentario !== undefined) r.comentario = (patch.comentario || "").trim();
    if (patch.ativa !== undefined) r.ativa = !!patch.ativa;
    commit();
  },
  removerRotina(id) {
    state.rotinas = state.rotinas.filter((x) => x.id !== id);
    commit();
  },
  // Marca/desmarca a ocorrência de uma rotina numa data específica.
  toggleRotinaFeita(id, dataISO) {
    const r = state.rotinas.find((x) => x.id === id);
    if (!r) return;
    r.feitos = r.feitos || {};
    if (r.feitos[dataISO]) delete r.feitos[dataISO];
    else r.feitos[dataISO] = true;
    commit();
  },
  // Dias de folga (sem estudo): dia 0=Dom ... 6=Sáb. Folga = some da agenda da semana.
  // Dia sem estudo: folga SEMANAL (dia da semana) ou FERIADO (data específica).
  // `diasFeriado` existia no `defaultState` desde sempre e não era lido em lugar nenhum do
  // app: cadastrar um feriado não fazia absolutamente nada, e o plano marcava tarefa nele.
  // Aceita o índice do dia da semana (uso antigo) ou a data ISO, que é o que permite o feriado.
  diaEhFolga(dia, dataISO) {
    if (dataISO && (state.config.diasFeriado || []).includes(dataISO)) return true;
    return (state.config.diasFolga || []).includes(Number(dia));
  },
  toggleDiaFolga(dia) {
    dia = Number(dia);
    const atual = state.config.diasFolga || [];
    state.config.diasFolga = atual.includes(dia) ? atual.filter((x) => x !== dia) : [...atual, dia];
    commit();
  },
  // Itens de um dia da semana (uma data ISO): tarefas DATADAS naquele dia +
  // ocorrências das rotinas ativas cujo dia bate. Cada item é normalizado:
  // {tipo:'missao'|'rotina', id, titulo, topicoId, categoria, comentario, concluida, data}.
  tarefasDoDia(dataISO) {
    const datadas = state.missoes
      .filter((m) => m.data === dataISO)
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((m) => ({
        tipo: "missao",
        id: m.id,
        titulo: m.titulo,
        topicoId: m.topicoId,
        categoria: m.categoria,
        comentario: m.comentario || "",
        estimMin: m.estimMin || 0,
        concluida: m.concluida,
        data: dataISO,
      }));
    const wd = weekdayISO(dataISO);
    const rot = state.rotinas
      .filter((r) => r.ativa !== false && r.dia === wd)
      .map((r) => ({
        tipo: "rotina",
        id: r.id,
        titulo: r.titulo,
        topicoId: r.topicoId,
        categoria: r.categoria,
        comentario: r.comentario || "",
        estimMin: r.estimMin || 0,
        concluida: !!(r.feitos && r.feitos[dataISO]),
        data: dataISO,
      }));
    return [...rot, ...datadas];
  },
  // Tarefas AVULSAS (sem dia marcado) para o "Plano de hoje": as ainda PENDENTES (sempre) +
  // as que foram concluídas HOJE (ficam visíveis só no dia em que você as fez — igual uma
  // tarefa datada, que só aparece no dia marcado; no dia seguinte, some). Mesmo formato de
  // tarefasDoDia, para reusar o mesmo card. Elas nunca apareciam em "Hoje" porque tarefasDoDia
  // só pega `m.data === dataISO`, e avulsa é justamente a missão SEM `data`.
  tarefasAvulsasHoje() {
    const hoje = todayISO();
    return state.missoes
      .filter((m) => !m.data && (!m.concluida || m.concluidaEm === hoje))
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((m) => ({
        tipo: "missao",
        id: m.id,
        titulo: m.titulo,
        topicoId: m.topicoId,
        categoria: m.categoria,
        comentario: m.comentario || "",
        estimMin: m.estimMin || 0,
        concluida: m.concluida,
        data: null,
      }));
  },

  // ---------- redações / correção de texto ----------
  // Gera uma pergunta discursiva (ou tema de redação) pela IA, a partir de um tópico,
  // de um material (PDF) ou de um tema livre. Online (requer iaDisponivel()).
  async gerarPerguntaDiscursiva({ fonte, alvo, tipo }) {
    let contexto = "geral";
    let texto = "";
    if (fonte === "material") {
      await this.exigirConteudoDoc(alvo); // sem o texto, o "tema a partir do material" seria inventado
      const d = state.documentos.find((x) => x.id === alvo);
      if (d) {
        texto = d.texto;
        contexto = nomeContexto(state, d.topicoId);
      }
    } else if (fonte === "topico") {
      contexto = nomeContexto(state, alvo);
    } else if (fonte === "escrito") {
      // O texto do campo é o BRIEFING: a IA parte dele em vez de descartá-lo. Vai como
      // `texto` (o conteúdo em que se basear), não como `contexto` (o assunto), porque
      // pode ser uma instrução inteira e não só um tema.
      texto = String(alvo || "");
      contexto = "a instrução do candidato abaixo";
    } else if (fonte === "aleatorio") {
      // ALEATÓRIO DE VERDADE: sorteio UNIFORME sobre tudo que você tem — tópicos do
      // edital E materiais importados, no mesmo bolo. Sem peso por relevância, por
      // lacuna ou por incidência.
      //
      // Optei por união proporcional em vez de "50% tópico / 50% material": com 1.700
      // tópicos e 3 materiais, o meio a meio faria os 3 materiais aparecerem em metade
      // dos sorteios — um viés forte, silencioso e não pedido. Quem quiser que material
      // apareça mais escolhe "Material" na origem; aí é preferência, não sorteio.
      //
      // Sortear dentro do SEU acervo é melhor que pedir "qualquer coisa" à IA, que
      // devolveria o assunto mais óbvio da matéria toda vez. Sem acervo, cai no geral.
      const cands = [
        ...state.topicos.map((t) => ({ tipo: "topico", id: t.id })),
        ...state.documentos.map((d) => ({ tipo: "doc", id: d.id })),
      ];
      if (!cands.length) {
        contexto = "geral";
      } else {
        const escolhido = cands[Math.floor(Math.random() * cands.length)];
        if (escolhido.tipo === "doc") {
          const d = state.documentos.find((x) => x.id === escolhido.id);
          // material sorteado entra como CONTEÚDO, igual à origem "Material" — o caso
          // sai ancorado no que você importou, não só no nome do arquivo.
          if (d) { texto = d.texto; contexto = nomeContexto(state, d.topicoId); }
        } else {
          contexto = nomeContexto(state, escolhido.id);
        }
      }
    } else {
      contexto = (alvo || "").trim() || "geral"; // tema/matéria digitado
    }
    const r = await iaProv.gerarPerguntaDiscursiva(state.config, { contexto, texto, tipo });
    return r.enunciado;
  },

  // Correção híbrida: métricas estruturais offline SEMPRE; correção de MÉRITO pela IA
  // quando conectada (feedback: o que deveria constar / faltou / errou / como melhorar),
  // com busca na web opcional (web=true). Sem IA, devolve só as métricas.
  async corrigirRedacao({ tipo, enunciado, texto, web }) {
    const correcao = ia.corrigirTexto(texto, tipo); // estrutura/coesão/clareza/repetição (offline)
    if (this.iaDisponivel()) {
      try {
        const m = await iaProv.corrigirDiscursiva(state.config, { enunciado, texto, tipo, web, palavras: correcao.palavras });
        correcao.feedbackIA = { texto: m.texto, fontesWeb: m.fontesWeb || [] };
        correcao.comIA = true;
        // Espelho estruturado (só sentença, e só quando o JSON veio íntegro): guarda os
        // itens e a fração enfrentada, que é o número comparável entre provas.
        if (m.espelho) {
          correcao.espelho = m.espelho;
          correcao.itensPct = iaProv.itensEnfrentadosPct(m.espelho);
        }
        correcao.nota = web
          ? "Correção da IA com busca na web (, confira a fonte oficial)."
          : "Correção de mérito pela IA (, confira) + métricas estruturais.";
      } catch (e) {
        correcao.nota = "Métricas estruturais offline. Falha ao consultar a IA: " + e.message;
      }
    }
    const r = {
      id: uid("red"),
      tipo: tipo || "discursiva",
      enunciado: (enunciado || "").trim(),
      texto: texto || "",
      correcao,
      data: nowISO(),
    };
    state.redacoes.push(r);
    commit();
    return r;
  },
  removerRedacao(id) {
    state.redacoes = state.redacoes.filter((r) => r.id !== id);
    commit();
  },

  // ---------- resumos (texto rico, por disciplina/tópico) ----------
  addResumo({ disciplinaId, topicoId, titulo, conteudoHTML }) {
    let discId = disciplinaId || null;
    if (topicoId) {
      const t = state.topicos.find((x) => x.id === topicoId);
      if (t) discId = t.disciplinaId;
    }
    const r = {
      id: uid("res"),
      disciplinaId: discId,
      topicoId: topicoId || null,
      titulo: (titulo || "").trim() || "Resumo sem título",
      conteudoHTML: conteudoHTML || "",
      origem: arguments[0].origem || null,
      data: nowISO(),
    };
    state.resumos.push(r);
    commit();
    return r;
  },
  // Gera um resumo (rascunho editável) a partir de uma fonte do próprio usuário.
  // Síncrona por desenho (monta HTML na hora). No aparelho leve, um material ainda não baixado
  // produziria um resumo VAZIO sem dizer por quê — então aqui a checagem é explícita e quem
  // chama recebe um aviso em vez de um resumo em branco.
  gerarResumoDe(fonte, escopo) {
    if (fonte === "material") {
      const dPend = state.documentos.find((x) => x.id === escopo);
      if (dPend && this.conteudoPendente(dPend)) {
        return { erro: "conteudo-pendente", titulo: dPend.titulo };
      }
    }
    const escH = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const nomeTop = (id) => {
      const t = state.topicos.find((x) => x.id === id);
      if (!t) return "";
      const d = state.disciplinas.find((x) => x.id === t.disciplinaId);
      return `${d ? d.nome + " · " : ""}${t.nome}`;
    };
    const noEscopo = (topId) => escopo === "todos" || topId === escopo;
    let titulo, html, topicoId = null;
    if (fonte === "material") {
      const d = state.documentos.find((x) => x.id === escopo);
      if (!d) return null;
      titulo = "Resumo — " + d.titulo;
      html = (d.texto || "").split(/\n\s*\n/).filter((p) => p.trim()).map((p) => `<p>${escH(p)}</p>`).join("") || "<p>(vazio)</p>";
      topicoId = d.topicoId;
    } else if (fonte === "flashcards") {
      const arr = state.flashcards.filter((c) => noEscopo(c.topicoId));
      if (!arr.length) return null;
      titulo = "Resumo de flashcards" + (escopo !== "todos" ? ` — ${nomeTop(escopo)}` : "");
      html = "<ul>" + arr.map((c) => `<li><b>${escH(c.frente)}</b> — ${escH(c.verso)}</li>`).join("") + "</ul>";
      if (escopo !== "todos") topicoId = escopo;
    } else if (fonte === "erros") {
      const errs = this.cadernoErros().filter((e) => noEscopo(e.topicoId));
      if (!errs.length) return null;
      titulo = "Resumo de erros" + (escopo !== "todos" ? ` — ${nomeTop(escopo)}` : "");
      html = "<ul>" + errs.map((e) => {
        const enun = e.manual ? e.descricao : e.questao ? e.questao.enunciado : "";
        const cert = e.manual ? e.correto : e.questao ? e.questao.alternativas[e.questao.gabarito] : "";
        return `<li><b>${escH(enun)}</b>${cert ? ` → ${escH(cert)}` : ""}</li>`;
      }).join("") + "</ul>";
      if (escopo !== "todos") topicoId = escopo;
    } else if (fonte === "lei" || fonte === "juris") {
      const inds = state.indicacoes.filter((i) => i.tipo === fonte && noEscopo(i.topicoId));
      if (!inds.length) return null;
      titulo = (fonte === "juris" ? "Resumo de jurisprudência" : "Resumo de lei seca") + (escopo !== "todos" ? ` — ${nomeTop(escopo)}` : "");
      html = "<ul>" + inds.map((i) => `<li><b>${escH(i.referencia)}</b>${i.tribunal ? ` (${escH(i.tribunal)})` : ""}${i.texto ? ` — ${escH(i.texto)}` : ""}</li>`).join("") + "</ul>";
      if (escopo !== "todos") topicoId = escopo;
    } else {
      return null;
    }
    return this.addResumo({ titulo, conteudoHTML: html, topicoId, origem: { tipo: "ia", fonte } });
  },
  // Reúne as fontes do usuário (material, flashcards, erros, lei/juris) num escopo por
  // tópico ("todos" ou um topicoId). Devolve as seções {rotulo, html, texto} encontradas.
  // Fonte ÚNICA de coleta — usada tanto pela compilação offline (HTML) quanto pela síntese
  // por IA (texto puro). NÃO inventa: só reúne o que já é do usuário.
  // `escopo` aceita "todos", UM topicoId, ou um ARRAY de topicoIds (gera considerando vários
  // tópicos de uma vez — sem cap de tamanho: cada seção reúne o texto INTEIRO das fontes que
  // cobrem qualquer um dos tópicos do escopo, não só o primeiro).
  _coletarSecoesResumo(fontes, escopo) {
    const escH = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escopoArr = Array.isArray(escopo) ? escopo : null;
    const noEscopo = (topId) => escopo === "todos" || (escopoArr ? escopoArr.includes(topId) : topId === escopo);
    const secao = (fonte) => {
      if (fonte === "material") {
        const docs = state.documentos.filter((d) => docTops(d).some(noEscopo) && (d.texto || "").trim());
        if (!docs.length) return null;
        const html = docs
          .map((d) => `<p><b>${escH(d.titulo)}</b></p>` + (d.texto || "").split(/\n\s*\n/).filter((p) => p.trim()).map((p) => `<p>${escH(p)}</p>`).join(""))
          .join("");
        const texto = docs.map((d) => `${d.titulo}\n${(d.texto || "").trim()}`).join("\n\n");
        return { rotulo: "Materiais", html, texto };
      }
      if (fonte === "flashcards") {
        const arr = state.flashcards.filter((c) => noEscopo(c.topicoId));
        if (!arr.length) return null;
        return {
          rotulo: "Flashcards",
          html: "<ul>" + arr.map((c) => `<li><b>${escH(c.frente)}</b> — ${escH(c.verso)}</li>`).join("") + "</ul>",
          texto: arr.map((c) => `- ${c.frente} — ${c.verso}`).join("\n"),
        };
      }
      if (fonte === "erros") {
        const errs = this.cadernoErros().filter((e) => noEscopo(e.topicoId));
        if (!errs.length) return null;
        const linha = (e) => {
          const enun = e.manual ? e.descricao : e.questao ? e.questao.enunciado : "";
          const cert = e.manual ? e.correto : e.questao ? e.questao.alternativas[e.questao.gabarito] : "";
          return { enun, cert };
        };
        return {
          rotulo: "Caderno de erros",
          html: "<ul>" + errs.map((e) => { const { enun, cert } = linha(e); return `<li><b>${escH(enun)}</b>${cert ? ` → ${escH(cert)}` : ""}</li>`; }).join("") + "</ul>",
          texto: errs.map((e) => { const { enun, cert } = linha(e); return `- ${enun}${cert ? ` → ${cert}` : ""}`; }).join("\n"),
        };
      }
      if (fonte === "lei" || fonte === "juris") {
        const inds = state.indicacoes.filter((i) => i.tipo === fonte && noEscopo(i.topicoId));
        if (!inds.length) return null;
        return {
          rotulo: fonte === "juris" ? "Jurisprudência" : "Lei seca",
          html: "<ul>" + inds.map((i) => `<li><b>${escH(i.referencia)}</b>${i.tribunal ? ` (${escH(i.tribunal)})` : ""}${i.texto ? ` — ${escH(i.texto)}` : ""}</li>`).join("") + "</ul>",
          texto: inds.map((i) => `- ${i.referencia}${i.tribunal ? ` (${i.tribunal})` : ""}${i.texto ? ` — ${i.texto}` : ""}`).join("\n"),
        };
      }
      return null;
    };
    return (fontes || []).map(secao).filter(Boolean);
  },
  // Gera UM resumo combinando VÁRIAS fontes do usuário, num escopo por tópico
  // ("todos" ou um topicoId). Offline (compila, não inventa).
  gerarResumoMulti(fontes, escopo) {
    const escH = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const nomeTop = (id) => {
      const t = state.topicos.find((x) => x.id === id);
      if (!t) return "";
      const d = state.disciplinas.find((x) => x.id === t.disciplinaId);
      return `${d ? d.nome + " · " : ""}${t.nome}`;
    };
    // escopo: "todos" | 1 topicoId | array de topicoIds (gera considerando vários de uma vez).
    const nomesEscopo = () => (Array.isArray(escopo) ? escopo : [escopo]).map(nomeTop).filter(Boolean).join(" + ");
    const partes = this._coletarSecoesResumo(fontes, escopo);
    if (!partes.length) return null;
    const topicoId = escopo === "todos" ? null : Array.isArray(escopo) ? escopo[0] : escopo;
    const titulo = "Resumo compilado" + (escopo !== "todos" ? ` — ${nomesEscopo()}` : "");
    const html = partes.map((p) => `<h3>${escH(p.rotulo)}</h3>${p.html}`).join("");
    return this.addResumo({ titulo, conteudoHTML: html, topicoId, origem: { tipo: "compilado", fonte: (fontes || []).join("+") } });
  },
  // Sintetiza com IA (): reúne o MESMO conteúdo da compilação (offline) e pede à IA um
  // resumo CONDENSADO e DIDÁTICO (não apenas concatenado), fiel ao material. Requer IA
  // conectada. Cria o resumo com selo de IA (origem.tipo === "ia-sintese" → "confira").
  async gerarResumoSinteseIA(fontes, escopo) {
    if (!this.iaDisponivel()) {
      const e = new Error("Conecte a IA (Gemini) para sintetizar o resumo.");
      e.code = "IA_OFFLINE";
      throw e;
    }
    const nomeTop = (id) => {
      const t = state.topicos.find((x) => x.id === id);
      if (!t) return "";
      const d = state.disciplinas.find((x) => x.id === t.disciplinaId);
      return `${d ? d.nome + " · " : ""}${t.nome}`;
    };
    const nomesEscopo = () => (Array.isArray(escopo) ? escopo : [escopo]).map(nomeTop).filter(Boolean).join(" + ");
    const partes = this._coletarSecoesResumo(fontes, escopo);
    if (!partes.length) return null;
    // Texto bruto SEM cortar: cada seção já reuniu o conteúdo INTEIRO de cada tópico do
    // escopo (ver _coletarSecoesResumo) — com 2+ tópicos, todos entram, não só o primeiro.
    const textoBruto = partes.map((p) => `## ${p.rotulo}\n${p.texto}`).join("\n\n");
    const topicoId = escopo === "todos" ? null : Array.isArray(escopo) ? escopo[0] : escopo;
    const contexto = topicoId ? nomesEscopo() : (state.concurso ? `${state.concurso.banca || ""} ${state.concurso.cargo || ""}`.trim() || "geral" : "geral");
    const conteudoHTML = await iaProv.sintetizarResumo(state.config, { texto: textoBruto, contexto });
    if (!conteudoHTML || !conteudoHTML.trim()) return null;
    const titulo = "Resumo sintetizado (IA)" + (escopo !== "todos" ? ` — ${nomesEscopo()}` : "");
    return this.addResumo({ titulo, conteudoHTML, topicoId, origem: { tipo: "ia-sintese", fonte: (fontes || []).join("+") } });
  },
  editarResumo(id, patch) {
    const r = state.resumos.find((x) => x.id === id);
    if (!r) return;
    if (patch.titulo !== undefined) r.titulo = patch.titulo.trim() || r.titulo;
    if (patch.conteudoHTML !== undefined) r.conteudoHTML = patch.conteudoHTML;
    if (patch.topicoId !== undefined) {
      r.topicoId = patch.topicoId || null;
      if (r.topicoId) {
        const t = state.topicos.find((x) => x.id === r.topicoId);
        if (t) r.disciplinaId = t.disciplinaId;
      }
    }
    if (patch.disciplinaId !== undefined && !r.topicoId) r.disciplinaId = patch.disciplinaId || null;
    commit();
  },
  removerResumo(id) {
    state.resumos = state.resumos.filter((r) => r.id !== id);
    // Remove as marcações do resumo e tira-o da busca semântica (índice).
    state.marcacoes = state.marcacoes.filter((m) => !(m.alvoTipo === "resumo" && m.alvoId === id));
    const idx = state.embeddings;
    if (idx) {
      idx.itens = idx.itens.filter((it) => it.fonteId !== id);
      if (idx.fontes) delete idx.fontes[id];
    }
    commit();
  },
  // ---- Mapas mentais (árvore hierárquica gerada pela IA) ----
  addMapaMental({ titulo, arvore, topicoId, origem, imgData, pdfData }) {
    const m = {
      id: uid("mapa"),
      titulo: (titulo || "Mapa mental").trim(),
      arvore: arvore || { titulo: titulo || "Mapa mental", ramos: [] },
      topicoId: topicoId || null,
      origem: origem || null,
      // O binário vive FORA do estado (mesma razão dos materiais): o estado inteiro é
      // reescrito a cada gravação, e uma imagem de mapa embutida entra nessa conta.
      imgData: null,
      pdfData: null,
      temImg: !!imgData,
      temPdf: !!pdfData,
      binarioDescartado: false, // backup pode descartar o binário p/ economizar espaço
      observacao: "",
      criadoEm: nowISO(),
    };
    if (m.topicoId) { const t = state.topicos.find((x) => x.id === m.topicoId); if (t) m.disciplinaId = t.disciplinaId; }
    state.mapasMentais.push(m);
    if (imgData || pdfData) {
      cacheBinario.set(m.id, { pdfData: pdfData || null, imgData: imgData || null });
      setBlob(m.id, { pdfData: pdfData || null, imgData: imgData || null }).then((ok) => {
        if (!ok) { m.imgData = imgData || null; m.pdfData = pdfData || null; commit(); }
      });
    }
    commit();
    return m;
  },
  // Binário original de um MAPA (imagem/PDF importado), lido sob demanda — igual aos materiais.
  async binarioMapa(id) {
    const m = state.mapasMentais.find((x) => x.id === id);
    if (!m) return { pdfData: null, imgData: null };
    if (m.pdfData || m.imgData) return { pdfData: m.pdfData || null, imgData: m.imgData || null };
    const emCache = cacheBinario.get(id);
    if (emCache) return emCache;
    const salvo = (await getBlob(id)) || { pdfData: null, imgData: null };
    cacheBinario.set(id, salvo);
    return salvo;
  },
  temOriginalMapa(m) {
    return !!(m && (m.temImg || m.temPdf || m.imgData || m.pdfData) && !m.binarioDescartado);
  },
  removerMapaMental(id) {
    state.mapasMentais = state.mapasMentais.filter((m) => m.id !== id);
    cacheBinario.delete(id);
    if (blobsDisponiveis()) delBlob(id); // a imagem/PDF do mapa também mora fora do estado
    commit();
  },
  setObservacaoMapa(id, texto) {
    const m = state.mapasMentais.find((x) => x.id === id);
    if (!m) return;
    m.observacao = (texto || "").trim();
    commit();
  },
  renomearMapa(id, titulo) {
    const m = state.mapasMentais.find((x) => x.id === id);
    if (m) { m.titulo = (titulo || "").trim() || m.titulo; commit(); }
  },
  // (Re)vincula o mapa a um tópico (ou desvincula com topicoId null). Mantém disciplinaId em dia.
  setTopicoMapa(id, topicoId) {
    const m = state.mapasMentais.find((x) => x.id === id);
    if (!m) return;
    m.topicoId = topicoId || null;
    const t = m.topicoId ? state.topicos.find((x) => x.id === m.topicoId) : null;
    m.disciplinaId = t ? t.disciplinaId : null;
    commit();
  },
  // Edição manual da árvore (Fase 3): substitui a árvore e sincroniza o título do mapa
  // com o tema central (o card mostra m.titulo).
  setArvoreMapa(id, arvore) {
    const m = state.mapasMentais.find((x) => x.id === id);
    if (!m || !arvore) return;
    m.arvore = arvore;
    if (arvore.titulo) m.titulo = String(arvore.titulo).trim() || m.titulo;
    commit();
  },
  // ---- Revisão espaçada do MAPA MENTAL (mesma escada da memória/resumos) ----
  agendarRevisaoMapa(id, dias) {
    const m = state.mapasMentais.find((x) => x.id === id);
    if (!m) return;
    const d = Math.max(1, parseInt(dias, 10) || 1);
    m.revisao = { proxima: addDays(todayISO(), d), intervalo: d };
    commit();
    return m.revisao;
  },
  revisarMapa(id, resultado) {
    const m = state.mapasMentais.find((x) => x.id === id);
    if (!m || !m.revisao) return null;
    const ESCADA = [1, 7, 15, 30, 60, 120];
    let idx = ESCADA.indexOf(m.revisao.intervalo);
    if (idx < 0) idx = 1;
    if (resultado === "esqueci") idx = 0;
    else if (resultado === "ok") idx = Math.min(idx + 1, ESCADA.length - 1);
    else if (resultado === "facil") idx = Math.min(idx + 2, ESCADA.length - 1);
    const dias = ESCADA[idx];
    m.revisao = { proxima: addDays(todayISO(), dias), intervalo: dias };
    commit();
    return dias;
  },
  cancelarRevisaoMapa(id) {
    const m = state.mapasMentais.find((x) => x.id === id);
    if (m) { m.revisao = null; commit(); }
  },
  mapasParaRevisar() {
    const hoje = todayISO();
    return state.mapasMentais.filter((m) => m.revisao && m.revisao.proxima <= hoje).length;
  },
  // Mapa como FONTE: gera flashcards/questões a partir da árvore (igual material/resumo).
  async gerarFlashcardsDeMapa(mapaId, n = 8, dificuldade = "medio") {
    const m = state.mapasMentais.find((x) => x.id === mapaId);
    if (!m) return [];
    const fonte = { tipo: "mapa", id: m.id, titulo: m.titulo };
    const cards = await iaProv.gerarFlashcards(state.config, {
      texto: mapaParaTexto(m.arvore),
      contexto: m.titulo || nomeContexto(state, m.topicoId),
      n,
      ...iaExtras(state, { topicoId: m.topicoId, dificuldade }),
    });
    return cards.map((c) => this.addFlashcard({ ...c, topicoId: m.topicoId, fonte, selo: "amarelo" }));
  },
  async gerarQuestoesDeMapa(mapaId, n = 5, dificuldade = "medio") {
    const m = state.mapasMentais.find((x) => x.id === mapaId);
    if (!m) return [];
    const fonte = { tipo: "mapa", id: m.id, titulo: m.titulo };
    const qs = await iaProv.gerarQuestoes(state.config, {
      texto: mapaParaTexto(m.arvore),
      contexto: m.titulo || nomeContexto(state, m.topicoId),
      n,
      ...iaExtras(state, { topicoId: m.topicoId, dificuldade }),
    });
    return qs.map((q) => this.addQuestao({ ...q, topicoId: m.topicoId, fonte })).filter(Boolean);
  },
  async gerarQuestoesCEDeMapa(mapaId, n = 6, dificuldade = "medio") {
    const m = state.mapasMentais.find((x) => x.id === mapaId);
    if (!m) return [];
    const fonte = { tipo: "mapa", id: m.id, titulo: m.titulo };
    const itens = await iaProv.gerarQuestoesCE(state.config, {
      texto: mapaParaTexto(m.arvore),
      contexto: m.titulo || nomeContexto(state, m.topicoId),
      n,
      ...iaExtras(state, { topicoId: m.topicoId, dificuldade }),
    });
    return itens.map((x) => this.addQuestaoCE({ ...x, enunciado: x.enunciado || x.afirmacao, topicoId: m.topicoId, fonte }));
  },
  // Conteúdo COMPLETO de um tópico (materiais que o cobrem + resumos vinculados), SEM cortar
  // — usado sempre que a geração precisa do tópico inteiro, não só o começo. Base para
  // gerarMapaMentalDeTopico(s) e para combinar múltiplos tópicos numa só geração.
  // ATENÇÃO: é `async` porque, no aparelho que só tem o esqueleto, o texto dos materiais que
  // cobrem o tópico precisa descer ANTES de virar contexto da IA. Sem isto, gerar questões,
  // flashcards ou mapa a partir de um TÓPICO produziria material a partir do nome dele —
  // silenciosamente, que é o pior jeito de falhar.
  async conteudoDeTopico(topicoId) {
    const t = state.topicos.find((x) => x.id === topicoId);
    if (!t) return "";
    const doTopico = state.documentos.filter((d) => docCobre(d, topicoId));
    await this.garantirConteudoDocs(doTopico.map((d) => d.id));
    const mats = doTopico.map((d) => d.texto).filter(Boolean);
    const res = state.resumos.filter((r) => r.topicoId === topicoId).map((r) => (r.conteudoHTML || "").replace(/<[^>]+>/g, " ")).filter(Boolean);
    // Cair no NOME do tópico é legítimo quando não há material nem resumo — é o modo sem fonte,
    // e o app rotula o resultado como tal. Deixa de ser legítimo quando o material EXISTE e só
    // não pôde ser baixado: aí o usuário pediu "a partir do meu material" e receberia o
    // repertório do modelo com cara de extraído. Nesse caso, falhar dizendo o que houve.
    if (!mats.length && !res.length && doTopico.length) {
      const nomes = doTopico.slice(0, 2).map((d) => d.titulo).join(", ");
      const e = new Error(
        `O material deste tópico (${nomes}${doTopico.length > 2 ? "…" : ""}) está no seu cofre e não consegui baixá-lo agora. ` +
        "Sem ele eu geraria do meu próprio repertório, com cara de extraído do seu material."
      );
      e.code = "CONTEUDO_INDISPONIVEL";
      throw e;
    }
    return [...mats, ...res].join("\n\n").trim() || t.nome;
  },
  async gerarMapaMentalDeTopico(topicoId) {
    const t = state.topicos.find((x) => x.id === topicoId);
    if (!t) return null;
    const texto = await this.conteudoDeTopico(topicoId);
    const arv = await iaProv.gerarMapaMental(state.config, { texto, contexto: nomeContexto(state, topicoId) });
    return this.addMapaMental({ titulo: arv.titulo, arvore: arv, topicoId, origem: "topico" });
  },
  // Mesma coisa, mas para VÁRIOS tópicos de uma vez: junta o conteúdo INTEIRO de cada um
  // (rotulado, sem cortar nenhum) num só texto e gera UM mapa combinando todos. O mapa fica
  // vinculado ao PRIMEIRO tópico da lista (não dá para vincular a vários ao mesmo tempo).
  async gerarMapaMentalDeTopicos(topicoIds) {
    const ids = (topicoIds || []).filter(Boolean);
    if (!ids.length) return null;
    if (ids.length === 1) return this.gerarMapaMentalDeTopico(ids[0]);
    const nomes = [];
    // `Promise.all` porque `conteudoDeTopico` virou assíncrona (pode precisar baixar do cofre
    // os materiais que cobrem o tópico). Em série, N tópicos seriam N esperas seguidas.
    const blocos = await Promise.all(
      ids.map(async (id) => {
        const t = state.topicos.find((x) => x.id === id);
        if (t) nomes.push(t.nome);
        return `Tópico: ${t ? t.nome : "?"}\n${await this.conteudoDeTopico(id)}`;
      })
    );
    // Fatia igual do orçamento por tópico — sem isso, se a soma passar dos 8000 chars que o
    // ia-provider corta, o 1º tópico da lista comeria o limite inteiro e os outros sumiriam.
    const cota = Math.floor(8000 / blocos.length);
    const texto = blocos.map((b) => (b.length > cota ? b.slice(0, cota) + "\n[...]" : b)).join("\n\n---\n\n");
    const contexto = nomes.join(" + ") || nomeContexto(state, ids[0]);
    const arv = await iaProv.gerarMapaMental(state.config, { texto, contexto });
    return this.addMapaMental({ titulo: arv.titulo, arvore: arv, topicoId: ids[0], origem: "topico" });
  },
  async gerarMapaMentalDeMaterial(docId, bloco = null) {
    await this.exigirConteudoDoc(docId); // conteúdo sob demanda: no aparelho que só tem o esqueleto, desce agora
    const d = state.documentos.find((x) => x.id === docId);
    if (!d) return null;
    const { texto, topicoId } = ctxDeDoc(d, bloco);
    if (!texto.trim()) return null;
    const titBase = bloco ? `${d.titulo} · ${bloco.titulo}` : d.titulo;
    const arv = await iaProv.gerarMapaMental(state.config, { texto, contexto: titBase || nomeContexto(state, topicoId) });
    return this.addMapaMental({ titulo: arv.titulo || titBase, arvore: arv, topicoId: topicoId || null, origem: "material" });
  },
  async gerarMapaMentalDeResumo(resumoId) {
    const r = state.resumos.find((x) => x.id === resumoId);
    if (!r) return null;
    const texto = (r.conteudoHTML || "").replace(/<[^>]+>/g, " ").trim();
    if (!texto) return null;
    const arv = await iaProv.gerarMapaMental(state.config, { texto, contexto: r.titulo || nomeContexto(state, r.topicoId) });
    return this.addMapaMental({ titulo: arv.titulo || r.titulo, arvore: arv, topicoId: r.topicoId || null, origem: "resumo" });
  },
  // Gera um mapa a partir de um TEMA livre (prompt do usuário). Vincula a tópico se informado.
  async gerarMapaMentalDeTema(tema, topicoId = null) {
    const t = (tema || "").trim();
    if (!t) return null;
    const arv = await iaProv.gerarMapaMental(state.config, { texto: t, contexto: t });
    return this.addMapaMental({ titulo: arv.titulo || t, arvore: arv, topicoId: topicoId || null, origem: "tema" });
  },
  // Gera/importa um mapa a partir de um ARQUIVO (PDF/imagem) pela Visão — 1 chamada (OCR;
  // reconstrói diagramas já prontos). Vincula a tópico se informado.
  async gerarMapaMentalDeArquivo(dataB64, mimeType = "application/pdf", { contexto, topicoId } = {}) {
    const arv = await iaProv.gerarMapaMentalDeArquivo(state.config, { dataB64, mimeType, contexto: contexto || nomeContexto(state, topicoId) });
    if (!arv || !arv.ramos || !arv.ramos.length) return null;
    // Híbrido (igual Materiais): guarda o VISUAL original (imagem/PDF) + a árvore extraída.
    const dataUrl = `data:${mimeType};base64,${dataB64}`;
    const ehImg = String(mimeType).startsWith("image/");
    return this.addMapaMental({
      titulo: arv.titulo, arvore: arv, topicoId: topicoId || null, origem: "arquivo",
      imgData: ehImg ? dataUrl : null,
      pdfData: ehImg ? null : dataUrl,
    });
  },
  // ---- Revisão espaçada de RESUMOS (mesmo mecanismo da memória/tópico) ----
  // resumo.revisao = {proxima, intervalo}; escada cresce ao lembrar, reinicia ao esquecer.
  agendarRevisaoResumo(id, dias) {
    const r = state.resumos.find((x) => x.id === id);
    if (!r) return;
    const d = Math.max(1, parseInt(dias, 10) || 1);
    r.revisao = { proxima: addDays(todayISO(), d), intervalo: d };
    commit();
    return r.revisao;
  },
  revisarResumo(id, resultado) {
    const r = state.resumos.find((x) => x.id === id);
    if (!r || !r.revisao) return null;
    const ESCADA = [1, 7, 15, 30, 60, 120];
    let idx = ESCADA.indexOf(r.revisao.intervalo);
    if (idx < 0) idx = 1;
    if (resultado === "esqueci") idx = 0;
    else if (resultado === "ok") idx = Math.min(idx + 1, ESCADA.length - 1);
    else if (resultado === "facil") idx = Math.min(idx + 2, ESCADA.length - 1);
    const dias = ESCADA[idx];
    r.revisao = { proxima: addDays(todayISO(), dias), intervalo: dias };
    commit();
    return dias;
  },
  cancelarRevisaoResumo(id) {
    const r = state.resumos.find((x) => x.id === id);
    if (r) {
      r.revisao = null;
      commit();
    }
  },
  // Quantos resumos estão vencidos (proxima <= hoje) — usado no hub "Revisões de hoje".
  resumosParaRevisar() {
    const hoje = todayISO();
    return state.resumos.filter((r) => r.revisao && r.revisao.proxima <= hoje).length;
  },
  // Flashcards e questões a partir de um resumo — pela IA (online, requer iaDisponivel()).
  async gerarFlashcardsDeResumo(id, n = 6, dificuldade = "medio") {
    const r = state.resumos.find((x) => x.id === id);
    if (!r) return [];
    const texto = r.conteudoHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!texto) return [];
    const fonte = { tipo: "resumo", titulo: "Resumo: " + r.titulo };
    const cards = await iaProv.gerarFlashcards(state.config, {
      texto,
      contexto: nomeContexto(state, r.topicoId),
      n,
      ...iaExtras(state, { topicoId: r.topicoId, dificuldade }),
    });
    return cards.map((c) =>
      this.addFlashcard({ ...c, topicoId: r.topicoId, disciplinaId: r.disciplinaId, fonte, selo: "amarelo" })
    );
  },
  async gerarQuestoesDeResumo(id, n = 5, dificuldade = "medio") {
    const r = state.resumos.find((x) => x.id === id);
    if (!r) return [];
    const texto = r.conteudoHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!texto) return [];
    const fonte = { tipo: "resumo", titulo: "Resumo: " + r.titulo };
    const qs = await iaProv.gerarQuestoes(state.config, {
      texto,
      contexto: nomeContexto(state, r.topicoId),
      n,
      ...iaExtras(state, { topicoId: r.topicoId, dificuldade }),
    });
    return qs.map((q) => this.addQuestao({ ...q, topicoId: r.topicoId, fonte })).filter(Boolean);
  },
  async gerarQuestoesCEDeResumo(id, n = 6, dificuldade = "medio") {
    const r = state.resumos.find((x) => x.id === id);
    if (!r) return [];
    const texto = r.conteudoHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!texto) return [];
    const fonte = { tipo: "resumo", titulo: "Resumo: " + r.titulo };
    const itens = await iaProv.gerarQuestoesCE(state.config, {
      texto,
      contexto: nomeContexto(state, r.topicoId),
      n,
      ...iaExtras(state, { topicoId: r.topicoId, dificuldade }),
    });
    return itens.map((x) => this.addQuestaoCE({ ...x, enunciado: x.enunciado || x.afirmacao, topicoId: r.topicoId, fonte }));
  },

  // ====== GERAR/EXTRAIR POR ESCOPO (Tópico → Aula → Subtópico/bloco) ======
  // Seletor único usado por Flashcards/Questões/Itens C/E/Resumos/Mapa: o usuário escolhe
  // tópico(s), opcionalmente a aula do cursinho, e (se o material tiver índice) um bloco.
  // Tudo resolve para um ESCOPO { texto, topicoId, fonte, contexto, docIds, bloco, modo },
  // a mesma forma que ctxDeDoc já produz — para vincular a fonte ao tópico em toda geração.

  // Rótulo curto p/ contexto/fonte: nome do tópico único ou "N tópicos".
  _contextoDosTopicos(topicoIds) {
    const ids = (topicoIds || []).filter(Boolean);
    if (ids.length === 1) return nomeContexto(state, ids[0]);
    return `${ids.length} tópicos`;
  },
  // Aulas (cursinho) que cobrem ALGUM dos tópicos escolhidos. Vazio → a UI esconde "Aula".
  aulasDosTopicos(topicoIds) {
    const set = new Set((topicoIds || []).filter(Boolean));
    if (!set.size) return [];
    return (state.aulas || []).filter((a) => (a.topicoIds || []).some((tid) => set.has(tid)));
  },
  // Materiais que cobrem algum tópico escolhido; se `aulaId`, restringe aos daquela aula.
  materiaisDoEscopo(topicoIds, aulaId = null) {
    const set = new Set((topicoIds || []).filter(Boolean));
    return state.documentos.filter((d) => {
      if (set.size && !docTops(d).some((tid) => set.has(tid))) return false;
      if (aulaId && (!d.estrutura || d.estrutura.aulaId !== aulaId)) return false;
      return true;
    });
  },
  // Subtópicos = blocos do índice cujo topicoId está na seleção. [{docId, bi, rotulo}].
  // Vazio → nenhum material com índice casado (a UI mostra só "Material inteiro").
  subtopicosDoEscopo(topicoIds, aulaId = null) {
    const set = new Set((topicoIds || []).filter(Boolean));
    const out = [];
    for (const d of this.materiaisDoEscopo(topicoIds, aulaId)) {
      const blocos = (d.estrutura && d.estrutura.blocos) || [];
      blocos.forEach((b, bi) => {
        if (!set.size || (b.topicoId && set.has(b.topicoId))) {
          out.push({ docId: d.id, bi, rotulo: `${rotuloDocumento(state, d)} · ${b.numero || ""} ${b.titulo}`.trim() });
        }
      });
    }
    return out;
  },
  // Resolve o escopo escolhido na UI. Três modos:
  //  - "material": 1 material (com bloco opcional) → delega ao ctxDeDoc (fonte/topicoId prontos).
  //  - "material-multi": o MESMO material, vários subtópicos (blocos) do índice marcados de
  //    uma vez — cada gerador por-contagem (flashcards/questões/CE) chama o gerador de UM bloco
  //    várias vezes com a quantidade dividida entre os blocos (garante que todo bloco marcado
  //    entra de fato, não só o primeiro — ver distribuirN); mapa/resumo combinam o texto todo.
  //  - "agregado": vários tópicos/materiais → soma os textos (só blocos casados quando há índice)
  //    + resumos dos tópicos; topicoId = tópico único (ou null se vários).
  resolverEscopo({ topicoIds = [], aulaId = null, docId = null, bi = null, bis = null } = {}) {
    const ids = (topicoIds || []).filter(Boolean);
    // Modo material: um bloco específico, vários blocos, ou um material inteiro.
    if (docId) {
      const d = state.documentos.find((x) => x.id === docId);
      if (d) {
        const bisArr = Array.isArray(bis) ? bis.filter((i) => i != null && i >= 0) : [];
        if (bisArr.length > 1 && d.estrutura) {
          const blocos = bisArr.map((i) => d.estrutura.blocos[i]).filter(Boolean);
          if (blocos.length > 1) {
            const ctxs = blocos.map((b) => ctxDeDoc(d, b));
            const texto = ctxs.map((c) => c.texto).filter(Boolean).join("\n\n---\n\n");
            const topsUnicos = [...new Set(ctxs.map((c) => c.topicoId).filter(Boolean))];
            const contexto = blocos.map((b) => `${b.numero || ""} ${b.titulo}`.trim()).filter(Boolean).join(" + ") || d.titulo;
            return {
              texto, topicoId: topsUnicos.length === 1 ? topsUnicos[0] : null,
              fonte: { tipo: "material", titulo: rotuloDocumento(state, d) }, banca: (ctxs[0] && ctxs[0].banca) || null,
              contexto, docIds: [d.id], bloco: null, blocos, modo: "material-multi",
            };
          }
        }
        const biUnico = bisArr.length === 1 ? bisArr[0] : bi;
        const bloco = biUnico != null && biUnico >= 0 && d.estrutura ? d.estrutura.blocos[biUnico] || null : null;
        const ctx = ctxDeDoc(d, bloco);
        return { texto: ctx.texto, topicoId: ctx.topicoId, fonte: ctx.fonte, banca: ctx.banca, contexto: ctx.fonte.titulo, docIds: [d.id], bloco, modo: "material" };
      }
    }
    // Modo agregado.
    const set = new Set(ids);
    const mats = this.materiaisDoEscopo(ids, aulaId);
    const partesMat = mats
      .map((d) => {
        const casados = ((d.estrutura && d.estrutura.blocos) || []).filter((b) => b.topicoId && set.has(b.topicoId));
        if (casados.length) return casados.map((b) => ctxDeDoc(d, b).texto).filter(Boolean).join("\n\n");
        return (d.texto || "").trim();
      })
      .filter(Boolean);
    const partesRes = state.resumos.filter((r) => set.has(r.topicoId)).map((r) => stripHTML(r.conteudoHTML)).filter(Boolean);
    const texto = [...partesMat, ...partesRes].join("\n\n").trim();
    const topicoId = ids.length === 1 ? ids[0] : null;
    const aula = aulaId ? (state.aulas || []).find((a) => a.id === aulaId) : null;
    const contexto = aula ? aula.nome : this._contextoDosTopicos(ids);
    const fonte = { tipo: "escopo", titulo: aula ? `Aula: ${aula.nome}` : "Tópicos: " + this._contextoDosTopicos(ids) };
    return { texto, topicoId, fonte, contexto, docIds: mats.map((d) => d.id), bloco: null, modo: "agregado" };
  },

  // Geradores por ESCOPO. modo "material" delega ao caminho *DeDoc já provado; "material-multi"
  // (vários subtópicos do MESMO material) divide a quantidade pedida entre os blocos marcados —
  // MESMO raciocínio de gerarQuestoesDeTopicos: um só texto combinado com "gere N" não garante
  // que a IA cubra todos os blocos, então a divisão é decidida aqui, não pelo modelo. "agregado"
  // chama a IA com o texto somado e vincula fonte/topicoId do escopo a cada item.
  async gerarFlashcardsDeEscopo(escopo, n = 6, dificuldade = "medio") {
    if (!escopo || !escopo.texto) return [];
    if (escopo.modo === "material") return this.gerarFlashcardsDeDoc(escopo.docIds[0], n, dificuldade, escopo.bloco || null);
    if (escopo.modo === "material-multi") {
      const fatias = this.distribuirN(n, escopo.blocos.length);
      const resultados = [];
      for (let i = 0; i < escopo.blocos.length; i++) {
        if (!fatias[i]) continue;
        resultados.push(...await this.gerarFlashcardsDeDoc(escopo.docIds[0], fatias[i], dificuldade, escopo.blocos[i]));
      }
      return resultados;
    }
    const cards = await iaProv.gerarFlashcards(state.config, {
      texto: escopo.texto, contexto: escopo.contexto || "geral", n,
      ...iaExtras(state, { topicoId: escopo.topicoId, dificuldade }),
    });
    return cards.map((c) => this.addFlashcard({ ...c, topicoId: escopo.topicoId, fonte: escopo.fonte, selo: "amarelo" }));
  },
  async gerarQuestoesDeEscopo(escopo, n = 5, dificuldade = "medio") {
    if (!escopo || !escopo.texto) return [];
    if (escopo.modo === "material") return this.gerarQuestoesDeDoc(escopo.docIds[0], n, dificuldade, escopo.bloco || null);
    if (escopo.modo === "material-multi") {
      const fatias = this.distribuirN(n, escopo.blocos.length);
      const resultados = [];
      for (let i = 0; i < escopo.blocos.length; i++) {
        if (!fatias[i]) continue;
        resultados.push(...await this.gerarQuestoesDeDoc(escopo.docIds[0], fatias[i], dificuldade, escopo.blocos[i]));
      }
      return resultados;
    }
    const qs = await iaProv.gerarQuestoes(state.config, {
      texto: escopo.texto, contexto: escopo.contexto || "geral", n,
      ...iaExtras(state, { topicoId: escopo.topicoId, dificuldade }),
    });
    return qs.map((q) => this.addQuestao({ ...q, topicoId: escopo.topicoId, fonte: escopo.fonte })).filter(Boolean);
  },
  async gerarQuestoesCEDeEscopo(escopo, n = 6, dificuldade = "medio") {
    if (!escopo || !escopo.texto) return [];
    if (escopo.modo === "material") return this.gerarQuestoesCEDeDoc(escopo.docIds[0], n, dificuldade, escopo.bloco || null);
    if (escopo.modo === "material-multi") {
      const fatias = this.distribuirN(n, escopo.blocos.length);
      const resultados = [];
      for (let i = 0; i < escopo.blocos.length; i++) {
        if (!fatias[i]) continue;
        resultados.push(...await this.gerarQuestoesCEDeDoc(escopo.docIds[0], fatias[i], dificuldade, escopo.blocos[i]));
      }
      return resultados;
    }
    const itens = await iaProv.gerarQuestoesCE(state.config, {
      texto: escopo.texto, contexto: escopo.contexto || "geral", n,
      ...iaExtras(state, { topicoId: escopo.topicoId, dificuldade }),
    });
    return itens.map((x) => this.addQuestaoCE({ ...x, enunciado: x.enunciado || x.afirmacao, topicoId: escopo.topicoId, fonte: escopo.fonte }));
  },
  // Mapa mental é UMA árvore só (não tem "quantidade" pra dividir) — o texto combinado de
  // material-multi (cada bloco já rotulado, ver resolverEscopo) cai direto aqui.
  async gerarMapaMentalDeEscopo(escopo) {
    if (!escopo || !escopo.texto) return null;
    if (escopo.modo === "material") return this.gerarMapaMentalDeMaterial(escopo.docIds[0], escopo.bloco || null);
    const arv = await iaProv.gerarMapaMental(state.config, { texto: escopo.texto, contexto: escopo.contexto || "geral" });
    return this.addMapaMental({ titulo: arv.titulo || escopo.contexto, arvore: arv, topicoId: escopo.topicoId || null, origem: "topico" });
  },
  // Extração (best-effort): 1 material, com bloco/blocos ou inteiro. Multi-material → [].
  async extrairQuestoesDeEscopo(escopo) {
    if (!escopo) return [];
    if (escopo.modo === "material") return this.extrairQuestoesDeDoc(escopo.docIds[0], escopo.bloco || null);
    if (escopo.modo === "material-multi") {
      const out = [];
      for (const b of escopo.blocos) out.push(...await this.extrairQuestoesDeDoc(escopo.docIds[0], b));
      return out;
    }
    return [];
  },
  async extrairQuestoesCEDeEscopo(escopo) {
    if (!escopo) return [];
    if (escopo.modo === "material") return this.extrairQuestoesCEDeDoc(escopo.docIds[0], escopo.bloco || null);
    if (escopo.modo === "material-multi") {
      const out = [];
      for (const b of escopo.blocos) out.push(...await this.extrairQuestoesCEDeDoc(escopo.docIds[0], b));
      return out;
    }
    return [];
  },
  // Sintetiza UM resumo a partir do escopo (mesma IA do gerarResumoSinteseIA, sobre o
  // texto somado do escopo). Vincula topicoId/origem.
  async gerarResumoDeEscopo(escopo) {
    if (!escopo || !escopo.texto) return null;
    const conteudoHTML = await iaProv.sintetizarResumo(state.config, { texto: escopo.texto, contexto: escopo.contexto || "geral" });
    if (!conteudoHTML || !conteudoHTML.trim()) return null;
    const titulo = "Resumo sintetizado (IA)" + (escopo.contexto ? ` — ${escopo.contexto}` : "");
    return this.addResumo({ titulo, conteudoHTML, topicoId: escopo.topicoId || null, origem: { tipo: "ia-sintese", fonte: (escopo.fonte && escopo.fonte.titulo) || "escopo" } });
  },

  // ---------- metas e disponibilidade ----------
  metas() {
    const c = state.config;
    const hoje = todayISO();
    const mesAtual = hoje.slice(0, 7);
    const dia = (iso) => (iso || "").slice(0, 10);
    const somaTempo = (pred) => state.sessoes.filter((s) => pred(dia(s.data))).reduce((a, s) => a + (s.tempoSeg || 0), 0);
    const tempoHoje = somaTempo((d) => d === hoje);
    const tempoSemana = somaTempo((d) => {
      const n = daysBetween(d, hoje);
      return n >= 0 && n < 7;
    });
    const tempoMes = somaTempo((d) => d.slice(0, 7) === mesAtual);

    let diasProva = null;
    if (c.dataProva) {
      diasProva = daysBetween(hoje, c.dataProva);
    }
    const dispDia = c.dispDiariaMin || 0;
    return {
      dataProva: c.dataProva || null,
      diasProva,
      metaDiariaMin: c.metaDiariaMin || 0,
      metaSemanalMin: c.metaSemanalMin || 0,
      metaMensalMin: c.metaMensalMin || 0,
      feitoHojeMin: Math.round(tempoHoje / 60),
      feitoSemanaMin: Math.round(tempoSemana / 60),
      feitoMesMin: Math.round(tempoMes / 60),
      dispDiariaMin: dispDia,
      dispSemanaMin: dispDia * 7,
      dispAteProvaMin: diasProva && diasProva > 0 ? dispDia * diasProva : null,
    };
  },

  // RETA FINAL (determinístico): único ponto de verdade da faixa de ≤30 dias para a
  // prova. Reusado pelo banner do HOJE, pelos pontos de atenção (key "reta") e pelas
  // notificações — para todos dizerem a mesma coisa, sem duplicar a regra.
  retaFinal() {
    const d = this.metas().diasProva;
    const ativo = typeof d === "number" && d >= 0 && d <= 30;
    return { ativo, dias: ativo ? d : null };
  },

  // ---------- dossiê por tópico (visão agregada) ----------
  dossie(topicoId) {
    const topico = state.topicos.find((t) => t.id === topicoId);
    if (!topico) return null;
    const documentos = state.documentos.filter((d) => docCobre(d, topicoId));
    const questoes = state.questoes.filter((q) => q.topicoId === topicoId);
    const questoesIds = questoes.map((q) => q.id);
    const tentativas = state.tentativas.filter((t) => questoesIds.includes(t.questaoId));
    const erros = tentativas.filter((t) => !t.acertou);
    const flashcards = state.flashcards.filter((f) => f.topicoId === topicoId);
    const resumos = state.resumos.filter((r) => r.topicoId === topicoId);
    const indicacoes = state.indicacoes.filter((i) => i.topicoId === topicoId);
    const missoes = state.missoes.filter((m) => m.topicoId === topicoId);
    const sessoes = state.sessoes.filter((s) => s.topicoId === topicoId);
    const tempoSeg = sessoes.reduce((acc, s) => acc + (s.tempoSeg || 0), 0);
    const acertos = tentativas.filter((t) => t.acertou).length;
    return {
      topico,
      documentos,
      questoes,
      tentativas,
      erros,
      flashcards,
      resumos,
      indicacoes,
      missoes,
      sessoes,
      tempoSeg,
      totalTentativas: tentativas.length,
      acertos,
    };
  },

  // Cobertura de TODO o edital (não por disciplina): tópicos cobertos / total.
  // UM número de cobertura para o app inteiro. `cobertos` continua no retorno porque várias
  // telas o leem, mas é o mesmo `concluidos`: são um só conceito, não dois.
  // `pct` é sobre o TOTAL de tópicos, e não a média das disciplinas. A média não ponderada
  // (que o anel do Hoje calculava) faz uma disciplina de 2 tópicos pesar igual a uma de 200.
  coberturaEdital() {
    const total = state.topicos.length;
    const concluidos = state.topicos.filter((t) => topicoCoberto(state, t)).length;
    return { total, cobertos: concluidos, concluidos, pct: total ? Math.round((concluidos / total) * 100) : 0 };
  },
  // Reuso para a UI: um tópico está coberto?
  topicoCoberto(t) {
    return topicoCoberto(state, t);
  },

  // Acha um tópico pelo nome (casamento flexível) — usado para vincular as ações
  // sugeridas pelo mentor aos tópicos reais do edital.
  // `disciplinaId` (opcional) ancora o casamento na disciplina conhecida (ex.: cabeçalho da
  // aula do cursinho): tenta exato→contém DENTRO dela primeiro; só sai dela para um match
  // EXATO (nunca "contém", que é o que causava colisão por 1 palavra em comum — mesmo
  // problema documentado em acharTopicoDoBloco/estrutura.js, ver o comentário lá).
  // `restrito`: com a disciplina conhecida, NÃO sai dela nem em match exato. "Prescrição" de uma
  // aula de Penal não pode virar a "Prescrição" do Civil só porque o Penal não tem o tópico.
  acharTopicoPorNome(nome, { disciplinaId, restrito = false } = {}) {
    const alvo = String(nome || "").trim().toLowerCase();
    if (!alvo) return null;
    // Todos os nomes pelos quais o tópico é conhecido: o nome + os aliases (Fase 2).
    const nomes = (t) => [t.nome, ...(t.aliases || [])].map((s) => String(s).toLowerCase());
    if (disciplinaId) {
      const daCasa = state.topicos.filter((t) => t.disciplinaId === disciplinaId);
      const exatoCasa = daCasa.find((t) => nomes(t).includes(alvo));
      if (exatoCasa) return exatoCasa;
      const contemCasa = daCasa.find((t) => nomes(t).some((n) => n.includes(alvo) || alvo.includes(n)));
      if (contemCasa) return contemCasa;
      if (restrito) return null;
      return state.topicos.find((t) => t.disciplinaId !== disciplinaId && nomes(t).includes(alvo)) || null;
    }
    return (
      // 1) match EXATO no nome ou em algum alias
      state.topicos.find((t) => nomes(t).includes(alvo)) ||
      // 2) match por CONTÉM (nome ou alias contém o alvo, ou vice-versa)
      state.topicos.find((t) => nomes(t).some((n) => n.includes(alvo) || alvo.includes(n))) ||
      null
    );
  },
  // Fase 7: TODOS os tópicos que casam com um nome (um item oficial pode virar N tópicos =
  // "split"). Exatos têm prioridade; sem exatos, usa os "contém".
  acharTodosTopicosPorNome(nome) {
    const alvo = String(nome || "").trim().toLowerCase();
    if (!alvo) return [];
    const nomes = (t) => [t.nome, ...(t.aliases || [])].map((s) => String(s).toLowerCase());
    const exatos = state.topicos.filter((t) => nomes(t).includes(alvo));
    if (exatos.length) return exatos;
    return state.topicos.filter((t) => nomes(t).some((n) => n.includes(alvo) || alvo.includes(n)));
  },
  // Fase 7: a que item do edital OFICIAL um tópico pertence (para distribuir incidência).
  itemOficialDoTopico(topicoId) {
    for (const it of state.editalOficial.itens || []) {
      if (this.acharTodosTopicosPorNome(it.ref).some((t) => t.id === topicoId)) return it.ref;
    }
    return null;
  },

  // Panorama da Lei Seca/Jurisprudência para o Mentor: pontos de ALTA INCIDÊNCIA ainda
  // NÃO treinados (marcou PQ mas não drillou) e dispositivos FRACOS no drill (precisão < 60%
  // com amostra mínima). É o que faz o Mentor "puxar" a Lei Seca, não só vê-la.
  _panoramaLeiSeca() {
    const pq = [], fracos = [], semRevisao = [], antigas = [];
    const anoAtual = +todayISO().slice(0, 4);
    for (const i of state.indicacoes) {
      if (i.metaLeitura || i.revogado) continue;
      const treino = state.questoes.filter((q) => q.treino && q.treino.indicacaoId === i.id);
      const ids = new Set(treino.map((q) => q.id));
      const tents = state.tentativas.filter((t) => ids.has(t.questaoId));
      const altaInc = (i.pqIncidencia != null && i.pqIncidencia >= 50) || (i.pq && i.pqIncidencia == null);
      if (altaInc && tents.length === 0) pq.push(i);
      if (tents.length >= 3 && tents.filter((t) => t.acertou).length / tents.length < 0.6) fracos.push(i);
      // Alta incidência, com texto, mas FORA da revisão espaçada (Memorizar) → sugerir promover.
      if (altaInc && (i.texto || "").trim() && !i.promovido && i.modo !== "memoria") semRevisao.push(i);
      // Jurisprudência ANTIGA (>= 8 anos) → confirmar se o entendimento ainda está mantido.
      if (i.tipo === "juris" && i.ano && anoAtual - i.ano >= 8) antigas.push(i);
    }
    // maior incidência primeiro
    pq.sort((a, b) => (b.pqIncidencia || 0) - (a.pqIncidencia || 0));
    semRevisao.sort((a, b) => (b.pqIncidencia || 0) - (a.pqIncidencia || 0));
    antigas.sort((a, b) => (a.ano || 0) - (b.ano || 0)); // mais antigo primeiro
    return { pq, fracos, semRevisao, antigas };
  },
  // PANORAMA para o MENTOR PROATIVO: concatena todas as frentes do sistema num
  // retrato compacto (determinístico). Serve para a visão offline e como contexto
  // enviado à IA. É aqui que o sistema "conversa" consigo mesmo.
  snapshotMentor() {
    const diag = this.diagnostico();
    const m = this.metas();
    const cob = this.coberturaEdital();
    const hist = this.historico();
    const errosLista = this.cadernoErros();
    const motivos = {};
    for (const e of errosLista) {
      const k = e.motivoErro || "sem motivo";
      motivos[k] = (motivos[k] || 0) + 1;
    }
    const fases = ["E", "A", "R"];
    const cicloTempo = {};
    fases.forEach((f) => (cicloTempo[f] = Math.round((hist.tempoFase[f] || 0) / 60)));

    // Central de Revisões consolidada: o que está vencido/para hoje, POR TIPO (tópico,
    // resumo, mapa, lei, juris, flashcards). Antes o Mentor só enxergava flashcards vencidos.
    const revCont = this.revisoesResumoContagem();
    const revVencPorTipo = {};
    for (const it of this.revisoesConsolidadas()) {
      if (it.status === "atrasada" || it.status === "hoje") revVencPorTipo[it.tipo] = (revVencPorTipo[it.tipo] || 0) + 1;
    }
    const lsPano = this._panoramaLeiSeca(); // Lei Seca/Jurisprudência (drill/incidência)
    // Agenda planejada pelo aluno (hoje + próximos 7 dias) — para o Mentor NÃO propor missão
    // que o aluno já agendou (evita duplicar) e considerar a carga já planejada.
    const hojeISO = todayISO();
    const planoHoje = this.tarefasDoDia(hojeISO).filter((t) => !t.concluida);
    let planejadoSemana = 0;
    for (let d = 0; d < 7; d++) planejadoSemana += this.tarefasDoDia(addDays(hojeISO, d)).filter((t) => !t.concluida).length;

    // Comportamento (antes era uma análise ISOLADA): QUANDO o aluno rende mais + regularidade.
    // Assim a análise do Mentor deixa de ser cega ao horário e pode ajustar a rotina.
    const comp = this.comportamentoHorario();
    const ofens = this.ofensiva();
    const DIAS_SEM = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    const FAIXAS_DIA = ["madrugada", "manhã", "tarde", "noite"];

    return {
      concurso: state.concurso ? state.concurso.cargo : null,
      prova: m.dataProva ? { data: m.dataProva, diasRestantes: m.diasProva } : null,
      metas: {
        diariaMin: m.metaDiariaMin,
        semanalMin: m.metaSemanalMin,
        feitoHojeMin: m.feitoHojeMin,
        feitoSemanaMin: m.feitoSemanaMin,
        dispDiariaMin: m.dispDiariaMin,
      },
      coberturaEdital: { pct: cob.pct, cobertos: cob.cobertos, total: cob.total, concluidos: cob.concluidos },
      revisao: {
        flashcardsVencidos: this.flashcardsVencidos().length,
        totalFlashcards: state.flashcards.length,
        atrasadas: revCont.atrasadas, // Central de Revisões (todos os tipos)
        paraHoje: revCont.hoje,
        proximas7dias: revCont.proximas7,
        vencidasPorTipo: revVencPorTipo, // ex.: { topico: 2, resumo: 1, mapa: 1, lei: 3 }
      },
      // Lei Seca/Jurisprudência: alta incidência sem treinar + dispositivos fracos no drill.
      leiSeca: {
        pqNaoTreinada: lsPano.pq.length,
        pqNaoTreinadaEx: lsPano.pq.slice(0, 5).map((i) => i.referencia),
        dispositivosFracos: lsPano.fracos.length,
        dispositivosFracosEx: lsPano.fracos.slice(0, 5).map((i) => i.referencia),
        novidadeLei: this.novidadesPendentes("lei"),
        novidadeJuris: this.novidadesPendentes("juris"),
        vigenciaPendente: this._panoramaVigencia().length,
        jurisAntigas: lsPano.antigas.length,
        metasLeituraPendentes: (state.indicacoes || []).filter((i) => i.metaLeitura && !i.lido).length,
      },
      erros: {
        pendentes: this.cadernoErros().length, // o MESMO numero que o caderno mostra
        porMotivo: motivos,
      },
      cicloTempoMin: cicloTempo, // equilíbrio Estudo/Prática/Revisão
      aproveitamentoGeral: diag.percentGeral,
      // Simulados: média, melhor nota e o último (para detectar queda/tendência).
      simulados: (() => {
        const rs = this.simuladosResumo();
        const ult = this.simuladosLista()[0] || null;
        return { total: rs.total, media: rs.media, melhor: rs.melhor, ultimo: ult ? { aproveitamento: ult.aproveitamento, data: (ult.data || "").slice(0, 10), nome: ult.nome } : null };
      })(),
      disciplinas: diag.porDisciplina.map((l) => ({
        id: l.disciplina.id,
        nome: l.disciplina.nome,
        percentAcerto: l.percentAcerto,
        cobertura: l.cobertura,
        tempoMin: Math.round(l.tempoSeg / 60),
        ultimoEstudo: l.ultimoEstudo ? l.ultimoEstudo.slice(0, 10) : null,
        topicos: state.topicos.filter((t) => t.disciplinaId === l.disciplina.id).map((t) => {
          // Aproveitamento POR TÓPICO (antes só nome): tentativas (topicoId) + questões do registro de sessão.
          const tents = state.tentativas.filter((x) => x.topicoId === t.id);
          const sess = state.sessoes.filter((s) => s.topicoId === t.id);
          const sAc = sess.reduce((a, s) => a + (s.qAcertos || 0), 0);
          const sTot = sess.reduce((a, s) => a + (s.qAcertos || 0) + (s.qErros || 0), 0);
          const ac = tents.filter((x) => x.acertou).length + sAc;
          const tot = tents.length + sTot;
          return { nome: t.nome, percentAcerto: tot ? Math.round((ac / tot) * 100) : null, questoes: tot, concluido: !!t.concluido };
        }),
      })),
      topicosPrioritarios: state.topicos
        .filter((t) => (t.peso || 0) >= 61 && !topicoCoberto(state, t))
        .map((t) => t.nome),
      // O que o aluno JÁ planejou (para o Mentor não sugerir tarefa duplicada e respeitar a carga).
      planejado: {
        hoje: planoHoje.map((t) => ({ titulo: t.titulo, min: t.estimMin || null, topico: t.topicoId ? ((state.topicos.find((x) => x.id === t.topicoId) || {}).nome || null) : null })),
        totalSemana: planejadoSemana,
      },
      // Quando o aluno rende mais + constância (unifica a análise comportamental à do Mentor).
      comportamento: comp.total
        ? {
            melhorDia: comp.melhorDiaIdx != null ? DIAS_SEM[comp.melhorDiaIdx] : null,
            melhorFaixa: comp.melhorFaixaIdx != null ? FAIXAS_DIA[comp.melhorFaixaIdx] : null,
            ofensivaDias: ofens.atual,
            recordeDias: ofens.recorde,
          }
        : null,
      observacoes: this.observacoesRecentes(8).map((o) => ({
        data: diaLocal(o.data), // o dia do aluno, não o de Greenwich (a sessão é gravada em UTC)
        topico: o.topicoNome,
        nota: o.comentario,
      })),
      // Lembretes livres com data vencida (recados do próprio aluno) — o Mentor pode cobrar.
      lembretesVencidos: this.lembretesVencidos().slice(0, 6).map((l) => ({ texto: l.texto, data: l.data })),
      // Base de estudo escolhida + (quando cursinho) a SEQUÊNCIA DAS AULAS, para o Mentor
      // ordenar as sugestões pela ordem do cursinho.
      baseEstudo: state.config.baseEstudo || "edital",
      sequenciaCursinho:
        state.config.baseEstudo === "cursinho" && state.aulas.length
          ? state.aulas
              .map((a) => ({
                aula: a.nome,
                topicos: (a.topicoIds || []).map((id) => { const t = state.topicos.find((x) => x.id === id); return t ? t.nome : null; }).filter(Boolean),
              }))
              .filter((a) => a.topicos.length)
          : null,
    };
  },

  // PONTOS DE ATENÇÃO (determinístico, offline): a lista de "problemas" que o mentor
  // detecta. Fonte ÚNICA usada tanto no aviso proativo do HOJE quanto no painel do
  // Mentor — garante que as duas telas digam a mesma coisa.
  // Lista BRUTA de pontos de atenção (com chave estável por ponto).
  // Há quantos dias você não traz um informativo deste tribunal. `null` = nunca trouxe.
  // O app NÃO sabe qual foi a última edição publicada (isso exigiria a web) — ele sabe o
  // SEU intervalo. Por isso a frase que sai daqui fala do seu hábito, não de uma edição.
  diasSemInformativo(tribunal) {
    const t = String(tribunal || "").toUpperCase();
    let maisRecente = null;
    for (const i of state.indicacoes) {
      if (!i.nInformativo) continue;
      if (String(i.tribunal || "").toUpperCase() !== t) continue;
      const d = i.criadoEm || i.novidadeEm || null;
      if (d && (!maisRecente || d > maisRecente)) maisRecente = d;
    }
    if (!maisRecente) return null;
    const ms = Date.parse(todayISO()) - Date.parse(String(maisRecente).slice(0, 10));
    return Math.max(0, Math.round(ms / 86400000));
  },

  _pontosBrutos() {
    const snap = this.snapshotMentor();
    const lista = [];
    // INFORMATIVOS — o gatilho que faltava. A tela de Jurisprudência já importa e extrai
    // teses; o que ninguém lembrava era de VOLTAR lá. Ciclo real: STF semanal, STJ
    // quinzenal; o limite tem folga sobre o ciclo para não cobrar no dia exato.
    // Só cobra quem JÁ trouxe algum: lembrar é para quem começou e parou, não para quem
    // nunca quis. E, como todo ponto, pode ser adiado ou dispensado pelo usuário.
    for (const [trib, limite] of [["STF", 10], ["STJ", 20]]) {
      const dias = this.diasSemInformativo(trib);
      if (dias !== null && dias >= limite)
        lista.push({
          key: "inf:" + trib,
          icone: "scale",
          txt: `Faz ${dias} dias que você não traz um informativo do ${trib}`,
          acao: { rota: "jurisprudencia", label: "Trazer informativo" },
        });
    }
    // Cada ponto carrega uma AÇÃO direta (atalho) para a tela onde se resolve.
    if (snap.prova && snap.prova.diasRestantes >= 0 && snap.prova.diasRestantes <= 30)
      lista.push({ key: "reta", icone: "calendar", txt: `Reta final: ${snap.prova.diasRestantes} ${snap.prova.diasRestantes === 1 ? "dia" : "dias"} para a prova`, acao: { rota: "planejamento", label: "Planejar reta" } });
    if (snap.revisao.flashcardsVencidos > 0)
      lista.push({ key: "venc", icone: "repeat-2", txt: `${snap.revisao.flashcardsVencidos} ${snap.revisao.flashcardsVencidos === 1 ? "flashcard vencido" : "flashcards vencidos"} para revisar`, acao: { rota: "flashcards", label: "Revisar agora" } });
    const mapasVenc = this.mapasParaRevisar();
    if (mapasVenc > 0)
      lista.push({ key: "mapas", icone: "brain", txt: `${mapasVenc} ${mapasVenc === 1 ? "mapa mental" : "mapas mentais"} para revisar hoje`, acao: { rota: "mapas", label: "Revisar mapas" } });
    if (snap.erros.pendentes > 0)
      lista.push({ key: "erros", icone: "flag", txt: `${snap.erros.pendentes} ${snap.erros.pendentes === 1 ? "erro" : "erros"} no caderno para refazer`, acao: { rota: "erros", label: "Abrir caderno" } });
    for (const d of snap.disciplinas)
      if (d.percentAcerto !== null && d.percentAcerto < 60)
        lista.push({ key: "ap:" + d.id, icone: "trending-down", txt: `${d.nome}: aproveitamento ${d.percentAcerto}% (abaixo de 60%)`, acao: { rota: "pratica", label: "Treinar questões" } });
    for (const d of snap.disciplinas)
      if (d.topicos.length && d.cobertura < 50)
        lista.push({ key: "cob:" + d.id, icone: "folder-open", txt: `${d.nome}: cobertura ${d.cobertura}%`, acao: { rota: "edital", disc: d.id, label: "Ver no edital" } });
    if (snap.topicosPrioritarios.length)
      lista.push({ key: "prio", icone: "star", txt: `Alta incidência sem material/estudo: ${snap.topicosPrioritarios.slice(0, 5).join(", ")}`, acao: { rota: "edital", label: "Ver no edital" } });
    // Revisão de tópico (dir.2): vencidas, pendentes de agendar e frágeis.
    const revTopVenc = this.revisoesTopicoCount();
    if (revTopVenc > 0)
      lista.push({ key: "revtop", icone: "repeat-2", txt: `${revTopVenc} ${revTopVenc === 1 ? "revisão" : "revisões"} de tópico para fazer hoje`, acao: { rota: "revtopico", label: "Revisar tópicos" } });
    const pend = this.topicosRevisaoPendente();
    if (pend.length)
      lista.push({ key: "revpend", icone: "calendar-days", txt: `Agendar revisão de: ${pend.slice(0, 3).map((t) => t.nome).join(", ")} (estudou e não agendou)`, acao: { rota: "revtopico", label: "Revisão de tópicos" } });
    const fragil = this.topicosRevisaoFragil();
    if (fragil.length)
      lista.push({ key: "revfragil", icone: "triangle-alert", txt: `Tópico frágil (esqueceu 2x): ${fragil.slice(0, 3).map((t) => t.nome).join(", ")} — considere reestudar`, acao: { rota: "hoje", label: "Estudar" } });
    // Sumiço: faz N dias (≥3) sem nenhuma sessão — puxa de volta com um bloco curto.
    const ultSess = state.sessoes.reduce((mx, s) => ((s.data || "") > mx ? s.data : mx), "");
    if (ultSess) {
      const diasSem = daysBetween(ultSess.slice(0, 10), todayISO());
      if (diasSem >= 3) lista.push({ key: "sumico", icone: "alarm-clock", txt: `Faz ${diasSem} dias sem estudar — retome hoje com um bloco curto`, acao: { rota: "hoje", label: "Estudar agora" } });
    }
    // Cruza QUANDO você rende (melhor faixa do dia) com ONDE está fraco (disciplina) — proativo.
    if (snap.comportamento && snap.comportamento.melhorFaixa) {
      const fraca = snap.disciplinas
        .filter((d) => d.percentAcerto !== null && d.percentAcerto < 60)
        .sort((a, b) => a.percentAcerto - b.percentAcerto)[0];
      if (fraca) lista.push({ key: "horario-fraco", icone: "clock-3", txt: `Você rende mais de ${snap.comportamento.melhorFaixa} — encaixe ${fraca.nome} (${fraca.percentAcerto}%) nesse horário`, acao: { rota: "planejamento", label: "Planejar" } });
    }
    // Atraso no plano: tarefas datadas de dias anteriores que não foram concluídas → adaptar a agenda.
    const nAtraso = (state.missoes || []).filter((m) => m.data && m.data < todayISO() && !m.concluida).length;
    if (nAtraso > 0) lista.push({ key: "atraso", icone: "calendar-days", txt: `${nAtraso} ${nAtraso === 1 ? "tarefa atrasada" : "tarefas atrasadas"} no plano — adaptar a agenda com o Mentor`, acao: { rota: "planejamento", label: "Adaptar agenda" } });
    // Lei Seca/Jurisprudência — o Mentor PUXA: alta incidência sem treinar + dispositivos fracos.
    const lsp = this._panoramaLeiSeca();
    if (lsp.pq.length) {
      const rota = lsp.pq.some((i) => i.tipo !== "juris") ? "leiseca" : "jurisprudencia";
      lista.push({ key: "ls-pq", icone: "target", txt: `${lsp.pq.length} ${lsp.pq.length === 1 ? "ponto de alta incidência sem treinar" : "pontos de alta incidência sem treinar"}: ${lsp.pq.slice(0, 3).map((i) => i.referencia).join(", ")}`, acao: { rota, aba: "raiox", label: "Abrir Raio-X" } });
    }
    if (lsp.fracos.length) {
      const rota = lsp.fracos.some((i) => i.tipo !== "juris") ? "leiseca" : "jurisprudencia";
      lista.push({ key: "ls-fraco", icone: "trending-down", txt: `${lsp.fracos.length} ${lsp.fracos.length === 1 ? "dispositivo com baixa precisão no treino" : "dispositivos com baixa precisão no treino"}: ${lsp.fracos.slice(0, 3).map((i) => i.referencia).join(", ")}`, acao: { rota, aba: "treinar", label: "Treinar" } });
    }
    // Alta incidência FORA da revisão espaçada → sugerir colocar em Memorizar (Raio-X → Memorizar).
    if (lsp.semRevisao.length) {
      const rota = lsp.semRevisao.some((i) => i.tipo !== "juris") ? "leiseca" : "jurisprudencia";
      lista.push({ key: "ls-memorizar", icone: "brain", txt: `${lsp.semRevisao.length} ${lsp.semRevisao.length === 1 ? "dispositivo de alta incidência fora da revisão espaçada" : "dispositivos de alta incidência fora da revisão espaçada"}: ${lsp.semRevisao.slice(0, 3).map((i) => i.referencia).join(", ")}. Coloque em Memorizar.`, acao: { rota, aba: "raiox", label: "Abrir Raio-X" } });
    }
    // Jurisprudência antiga → confirmar se o entendimento ainda está mantido (pode ter mudado).
    if (lsp.antigas.length) {
      lista.push({ key: "ls-juris-antiga", icone: "alarm-clock", txt: `${lsp.antigas.length} ${lsp.antigas.length === 1 ? "entendimento antigo" : "entendimentos antigos"} (de ${lsp.antigas[0].ano}): ${lsp.antigas.slice(0, 3).map((i) => i.referencia).join(", ")}. Confirme se ainda estão mantidos.`, acao: { rota: "jurisprudencia", aba: "ler", label: "Ver na Jurisprudência" } });
    }
    // Vigência: normas que você não confere há muitos meses (lei pode ter mudado).
    const vig = this._panoramaVigencia();
    if (vig.length) lista.push({ key: "ls-vigencia", icone: "alarm-clock", txt: `Confira a vigência (faz ${vig[0].meses}+ ${vig[0].meses === 1 ? "mês" : "meses"}): ${vig.slice(0, 3).map((v) => v.norma).join(", ")}`, acao: { rota: "leiseca", label: "Conferir na Lei Seca" } });
    // Novidade legislativa: dispositivos que mudaram/entraram na última conferência (revisar+treinar).
    const nov = this.novidadesPendentes("lei");
    if (nov) lista.push({ key: "ls-novidade", icone: "sparkles", txt: `${nov} ${nov === 1 ? "dispositivo com novidade legislativa para revisar" : "dispositivos com novidade legislativa para revisar"} (mudaram ou entraram na última conferência).`, acao: { rota: "leiseca", aba: "ler", label: "Ver na Lei Seca" } });
    const novJ = this.novidadesPendentes("juris");
    if (novJ) lista.push({ key: "ls-novidade-juris", icone: "sparkles", txt: `${novJ} ${novJ === 1 ? "item de jurisprudência com novidade" : "itens de jurisprudência com novidade"} para revisar.`, acao: { rota: "jurisprudencia", aba: "ler", label: "Ver na Jurisprudência" } });
    // Lembretes com data VENCIDA — o Mentor cobra o recado que você mesmo deixou.
    const lembVenc = this.lembretesVencidos();
    if (lembVenc.length) lista.push({ key: "lembrete-vencido", icone: "bell", txt: `${lembVenc.length} ${lembVenc.length === 1 ? "lembrete vencido" : "lembretes vencidos"}: ${lembVenc.slice(0, 2).map((l) => l.texto).join(" · ").slice(0, 80)}`, acao: { rota: "hoje", label: "Ver lembretes" } });
    // Metas de leitura ainda não cumpridas (você planejou ler e não deu baixa).
    const metasLei = (state.indicacoes || []).filter((i) => i.metaLeitura && i.tipo === "lei" && !i.lido).length;
    const metasJur = (state.indicacoes || []).filter((i) => i.metaLeitura && i.tipo === "juris" && !i.lido).length;
    if (metasLei) lista.push({ key: "meta-leitura-lei", icone: "target", txt: `${metasLei} ${metasLei === 1 ? "meta de leitura pendente" : "metas de leitura pendentes"} na Lei Seca`, acao: { rota: "leiseca", aba: "metas", label: "Ver metas" } });
    if (metasJur) lista.push({ key: "meta-leitura-juris", icone: "target", txt: `${metasJur} ${metasJur === 1 ? "meta de leitura pendente" : "metas de leitura pendentes"} na Jurisprudência`, acao: { rota: "jurisprudencia", aba: "metas", label: "Ver metas" } });
    // Resumos vencidos na Central de Revisões (mesma cobrança que flashcards/mapas/tópicos).
    const resVenc = (snap.revisao.vencidasPorTipo && snap.revisao.vencidasPorTipo.resumo) || 0;
    if (resVenc > 0) lista.push({ key: "revresumo", icone: "file-text", txt: `${resVenc} ${resVenc === 1 ? "resumo" : "resumos"} para revisar hoje`, acao: { rota: "revisoes", label: "Revisar" } });
    // Ofensiva prestes a quebrar: você tem sequência de dias mas ainda não estudou hoje.
    const ofens = (snap.comportamento && snap.comportamento.ofensivaDias) || 0;
    const estudouHoje = (state.sessoes || []).some((s) => (s.data || "").slice(0, 10) === todayISO());
    if (ofens >= 3 && !estudouHoje) lista.push({ key: "ofensiva", icone: "flame", txt: `Sua sequência de ${ofens} dias quebra hoje se você não estudar`, acao: { rota: "hoje", label: "Estudar agora" } });
    // Simulados: queda no último vs. sua média; ou, sem nenhum simulado e prova perto, um diagnóstico.
    const simList = this.simuladosLista();
    const simRes = this.simuladosResumo();
    if (simList.length >= 2 && simList[0].aproveitamento != null && simRes.media != null && simList[0].aproveitamento < simRes.media - 8) {
      lista.push({ key: "sim-queda", icone: "trending-down", txt: `Seu último simulado (${simList[0].aproveitamento}%) ficou abaixo da sua média (${simRes.media}%) — revise onde caiu`, acao: { rota: "simulados", label: "Ver simulados" } });
    } else if (simList.length === 0 && snap.prova && snap.prova.diasRestantes >= 0 && snap.prova.diasRestantes <= 60) {
      lista.push({ key: "sim-fazer", icone: "clipboard-list", txt: `Faltam ${snap.prova.diasRestantes} dias e você ainda não fez um simulado — faça um para medir onde está`, acao: { rota: "simulados", label: "Fazer simulado" } });
    }
    // Meta diária: você começou o dia mas ainda não bateu a meta — empurrãozinho para fechar.
    const md = snap.metas.diariaMin || 0, fh = snap.metas.feitoHojeMin || 0;
    if (md > 0 && fh > 0 && fh < md) {
      lista.push({ key: "meta-hoje", icone: "target", txt: `Quase lá: faltam ${md - fh} min para bater sua meta de hoje (${fh}/${md} min)`, acao: { rota: "hoje", label: "Estudar agora" } });
    }
    // Lembrete de PERIODICIDADE: o Mentor pede para você reanalisar o progresso (só sugere,
    // não roda sozinho). Aparece com IA conectada, após atividade, se nunca analisou ou ≥7 dias.
    if (this.mentorPrecisaReanalise()) {
      const d = this.diasDesdeAnaliseMentor();
      const txt =
        d === null
          ? "O Mentor ainda não analisou seu progresso — peça a primeira análise"
          : `Faz ${d} ${d === 1 ? "dia" : "dias"} que o Mentor não revê seu progresso — que tal reanalisar?`;
      lista.push({ key: "reanalise", icone: "compass", txt, acao: { rota: "mentor", label: "Analisar progresso" } });
    }
    return lista;
  },
  // Um ponto está adiado se foi "dispensado" (sempre) ou se o adiamento ainda não venceu.
  _atencaoOculta(key) {
    const v = (state.config.atencaoAdiada || {})[key];
    if (!v) return false;
    if (v === "sempre") return true;
    return todayISO() < v; // v = data até a qual fica oculto
  },
  // PONTOS visíveis (já filtrando os adiados/dispensados).
  pontosAtencao() {
    return this._pontosBrutos().filter((p) => !this._atencaoOculta(p.key));
  },
  // Quantos pontos estão atualmente ocultos (para oferecer "reexibir").
  atencaoOcultasCount() {
    return this._pontosBrutos().filter((p) => this._atencaoOculta(p.key)).length;
  },
  // Lista os pontos atualmente ocultos (para reexibir seletivamente).
  atencaoOcultas() {
    const m = state.config.atencaoAdiada || {};
    return this._pontosBrutos()
      .filter((p) => this._atencaoOculta(p.key))
      .map((p) => ({ ...p, dispensado: m[p.key] === "sempre" }));
  },
  // Adia um ponto por N dias (ele volta depois) ou dispensa de vez ("sempre").
  adiarAtencao(key, dias) {
    const m = { ...(state.config.atencaoAdiada || {}) };
    m[key] = dias === "sempre" ? "sempre" : addDays(todayISO(), dias);
    state.config.atencaoAdiada = m;
    commit();
  },
  // Reexibe UM ponto (remove o adiamento/dispensa daquela chave).
  reativarAtencao(key) {
    const m = { ...(state.config.atencaoAdiada || {}) };
    delete m[key];
    state.config.atencaoAdiada = m;
    commit();
  },
  reativarAtencoes() {
    state.config.atencaoAdiada = {};
    commit();
  },

  // Roda a análise do mentor (online, requer iaDisponivel()). Devolve o PLANO
  // proposto — nada é aplicado aqui; a aprovação acontece na tela do Mentor.
  async analisarComMentor() {
    // Fase 2: dá CONTINUIDADE ao acompanhamento — o Mentor recebe o plano anterior e
    // comenta o que evoluiu desde então (senão cada análise recomeça do zero).
    const ant = state.config.mentorPlano;
    const planoAnterior = ant && ant.analise
      ? { analise: String(ant.analise).slice(0, 600), quando: state.config.mentorUltimaAnalise || null }
      : null;
    const r = await iaProv.analisarProgresso(state.config, { ...this.snapshotMentor(), planoAnterior });
    // Registra quando analisou + PERSISTE o plano (para a auto-análise semanal sobreviver e
    // aparecer na aba Mentor mesmo sem o usuário ter clicado).
    state.config.mentorUltimaAnalise = nowISO();
    state.config.mentorPlano = r || null;
    commit();
    return r;
  },
  // Define/limpa o plano persistido do Mentor (usado ao descartar/aplicar).
  setMentorPlano(p) {
    state.config.mentorPlano = p || null;
    commit();
  },
  // Auto-análise SEMANAL: o Mentor analisa o progresso sozinho 1×/semana (≥7 dias desde a
  // última), mesmo sem clique — salvo se desligado em Configurações (mentorAutoSemanal=false).
  // Chamado no boot; silencioso (não atrapalha a inicialização nem gasta cota à toa).
  async autoAnalisarMentorSeDevido() {
    if (state.config.mentorAutoSemanal === false) return;
    if (!this.mentorPrecisaReanalise()) return; // já exige IA + atividade + ≥7 dias
    try {
      await this.analisarComMentor();
      return true; // Fase 3: sinaliza ao boot que HÁ plano novo (toast "preparei um plano")
    } catch (_) {}
    return false;
  },
  // Fase 3 — plano NOVO ainda não visto pelo aluno? (a auto-análise roda no boot; sem
  // isto o resultado ficava invisível numa aba — o momento de maior mágica, desperdiçado).
  mentorPlanoNaoVisto() {
    const p = state.config.mentorPlano;
    if (!p || !p.analise) return false;
    return (state.config.mentorPlanoVisto || "") !== (state.config.mentorUltimaAnalise || "x");
  },
  marcarPlanoVisto() {
    if ((state.config.mentorPlanoVisto || "") === (state.config.mentorUltimaAnalise || "")) return;
    state.config.mentorPlanoVisto = state.config.mentorUltimaAnalise || "";
    commit({ semCarimbo: true });
  },
  // Dias desde a última análise do mentor (null = nunca analisou).
  diasDesdeAnaliseMentor() {
    const iso = state.config.mentorUltimaAnalise;
    if (!iso) return null;
    return daysBetween(iso.slice(0, 10), todayISO());
  },
  // É hora de (re)analisar o progresso? Requer IA conectada + atividade; nunca analisou ou ≥7 dias.
  // Usado pelo ponto de atenção, pela notificação e pelo selo do botão "Mentor IA".
  mentorPrecisaReanalise() {
    if (!this.iaDisponivel()) return false;
    const d = this.diasDesdeAnaliseMentor();
    return (d === null && state.sessoes.length > 0) || (d !== null && d >= 7);
  },
  // Gatilho LEVE pós-sessão: vale propor um ajuste de plano? (análise velha OU dia todo concluído).
  // Guarda diário: só sugere 1x por dia (config.mentorNudgeData). Nunca age sozinho — só propõe.
  mentorSugereReplano() {
    if (!this.iaDisponivel()) return false;
    if (state.config.mentorNudgeData === todayISO()) return false;
    const stale = this.mentorPrecisaReanalise();
    const tarefas = this.tarefasDoDia(todayISO());
    const diaConcluido = tarefas.length > 0 && tarefas.every((t) => t.concluida);
    // Atraso: tarefas planejadas de dias anteriores que não foram concluídas.
    const atrasadas = (state.missoes || []).some((m) => m.data && m.data < todayISO() && !m.concluida);
    return stale || diaConcluido || atrasadas;
  },
  marcarNudgeReplano() {
    state.config.mentorNudgeData = todayISO();
    commit({ semCarimbo: true });
  },
  // Fase 3 — o que o aluno JÁ FEZ HOJE dentro do app (questões respondidas, flashcards
  // revisados). O registro de sessão usa isto para PRÉ-PREENCHER com 1 toque: formulário
  // que pede o que o sistema já sabe é o anti-padrão nº 1 de produto IA-first.
  atividadeDoDia() {
    const hoje = todayISO();
    const tents = state.tentativas.filter((t) => diaLocal(t.data) === hoje);
    const acertos = tents.filter((t) => t.acertou).length;
    const flashcards = state.flashcards.filter((f) => f.sm2 && f.sm2.lastReview === hoje).length;
    return { questoes: tents.length, acertos, erros: tents.length - acertos, flashcards };
  },
  // Tópicos REVISADOS HOJE na Central de Revisões (para sugerir no Registrar sessão — antes
  // não havia ponte: revisar dava baixa mas não virava/sugeria sessão).
  revisadosHoje() {
    const hoje = todayISO();
    const feitas = (state.revisoesFeitas || []).filter((r) => (r.data || "").slice(0, 10) === hoje);
    const ids = new Set();
    for (const r of feitas) {
      let tid = null;
      if (r.tipo === "topico") tid = r.refId;
      else if (r.tipo === "resumo") { const x = state.resumos.find((y) => y.id === r.refId); tid = x ? x.topicoId : null; }
      else if (r.tipo === "mapa") { const x = state.mapasMentais.find((y) => y.id === r.refId); tid = x ? x.topicoId : null; }
      else if (r.tipo === "ind") { const x = state.indicacoes.find((y) => y.id === r.refId); tid = x ? x.topicoId : null; }
      if (tid) ids.add(tid);
    }
    return [...ids].map((id) => { const t = state.topicos.find((x) => x.id === id); return t ? { topicoId: id, nome: t.nome } : null; }).filter(Boolean);
  },
  // Quantas tarefas planejadas estão ATRASADAS (datadas no passado e não concluídas).
  tarefasAtrasadas() {
    const hoje = todayISO();
    return state.missoes.filter((m) => m.data && m.data < hoje && !m.concluida);
  },
  // Adaptar a agenda: redistribui as tarefas atrasadas pelos próximos dias DISPONÍVEIS desta
  // semana (a partir de hoje, pulando folgas), em rodízio. Determinístico — o Mentor propõe,
  // o usuário confirma na tela. Retorna quantas foram remanejadas.
  redistribuirAtrasadas() {
    const hoje = todayISO();
    const atrasadas = this.tarefasAtrasadas();
    if (!atrasadas.length) return 0;
    const folga = new Set(state.config.diasFolga || []);
    const dias = [];
    for (let i = 0; i < 7; i++) { const d = addDays(hoje, i); if (!folga.has(weekdayISO(d))) dias.push(d); }
    if (!dias.length) dias.push(hoje);
    atrasadas.forEach((m, i) => { m.data = dias[i % dias.length]; });
    commit();
    return atrasadas.length;
  },
  // Perfil curto do aluno (concurso, dias p/ prova, cobertura, pontos fracos) — para o chat/dossiê
  // personalizarem as respostas. Reusado pelo assistente e pelo chat do Dossiê.
  contextoAlunoCurto() {
    try {
      const s = this.snapshotMentor();
      const fracas = (s.disciplinas || []).filter((d) => d.percentAcerto !== null && d.percentAcerto < 60).map((d) => d.nome).slice(0, 3);
      return [
        s.concurso ? `Concurso: ${s.concurso}` : null,
        s.prova ? `Faltam ${s.prova.diasRestantes} dias para a prova` : null,
        s.coberturaEdital ? `Cobertura do edital: ${s.coberturaEdital.pct}%` : null,
        fracas.length ? `Onde está mais fraco: ${fracas.join(", ")}` : null,
      ].filter(Boolean).join(" · ") || null;
    } catch (_) { return null; }
  },

  // ---------- diagnóstico ----------
  diagnostico() {
    const porDisciplina = state.disciplinas.map((d) => {
      const topicos = state.topicos.filter((t) => t.disciplinaId === d.id);
      const topicosIds = topicos.map((t) => t.id);
      const questoes = state.questoes.filter((q) => topicosIds.includes(q.topicoId));
      const questoesIds = questoes.map((q) => q.id);
      const tentativas = state.tentativas.filter((t) => questoesIds.includes(t.questaoId));
      const comMaterial = topicos.filter((t) => topicoCoberto(state, t)).length;
      const sessoesDisc = state.sessoes.filter((s) => topicosIds.includes(s.topicoId));
      const tempoSeg = sessoesDisc.reduce((acc, s) => acc + (s.tempoSeg || 0), 0);
      // Questões = tentativas feitas AQUI + `qAcertos`/`qErros`, que são as feitas FORA do app
      // (caderno de papel, site de questões). As duas fontes não se sobrepõem: a tela de
      // registro deixou de oferecer o botão que copiava as tentativas do próprio app para
      // esses campos, que era o que fazia 20 questões virarem 40.
      const sessAc = sessoesDisc.reduce((a, s) => a + (s.qAcertos || 0), 0);
      const sessTot = sessoesDisc.reduce((a, s) => a + (s.qAcertos || 0) + (s.qErros || 0), 0);
      const acertos = tentativas.filter((t) => t.acertou).length + sessAc;
      const totalQ = tentativas.length + sessTot;
      const ultimoEstudo = sessoesDisc.reduce((max, s) => (s.data > max ? s.data : max), "");
      // detalhe por tópico (último estudo e tempo de cada um)
      const topicosDetalhe = topicos.map((t) => {
        const sess = state.sessoes.filter((s) => s.topicoId === t.id);
        const ult = sess.reduce((max, s) => (s.data > max ? s.data : max), "");
        return {
          id: t.id,
          nome: t.nome,
          tempoSeg: sess.reduce((acc, s) => acc + (s.tempoSeg || 0), 0),
          ultimoEstudo: ult || null,
        };
      });
      return {
        disciplina: d,
        totalTopicos: topicos.length,
        topicosComMaterial: comMaterial,
        cobertura: topicos.length ? Math.round((comMaterial / topicos.length) * 100) : 0,
        totalTentativas: totalQ,
        acertos,
        percentAcerto: totalQ ? Math.round((acertos / totalQ) * 100) : null,
        tempoSeg,
        ultimoEstudo: ultimoEstudo || null,
        topicos: topicosDetalhe,
      };
    });

    // Sugestões proativas básicas.
    // As sugestoes por disciplina se repetiam quase palavra por palavra ("Cobertura baixa em
    // X: N% dos topicos concluidos."), uma linha por disciplina, com um edital
    // real, oito linhas iguais empurravam o resto da tela para baixo sem dizer mais nada.
    // Agora cada tipo vira UMA frase que enumera as disciplinas.
    const sugestoes = [];
    const fracas = [], semCobertura = [];
    for (const linha of porDisciplina) {
      if (linha.percentAcerto !== null && linha.percentAcerto < 60) fracas.push(linha);
      if (linha.totalTopicos > 0 && linha.cobertura < 50) semCobertura.push(linha);
    }
    const lista = (arr) => arr.map((l) => l.disciplina.nome).join(", ");
    if (fracas.length === 1) sugestoes.push(`Reforce ${fracas[0].disciplina.nome}: aproveitamento de ${fracas[0].percentAcerto}% (abaixo de 60%).`);
    else if (fracas.length > 1) sugestoes.push(`Reforce ${fracas.length} disciplinas com aproveitamento abaixo de 60%: ${lista(fracas)}.`);
    if (semCobertura.length === 1) sugestoes.push(`Cobertura baixa em ${semCobertura[0].disciplina.nome}: ${semCobertura[0].cobertura}% dos tópicos concluídos.`);
    else if (semCobertura.length > 1) sugestoes.push(`Cobertura baixa em ${semCobertura.length} disciplinas (menos da metade dos tópicos com material/questões): ${lista(semCobertura)}.`);
    const vencidos = sm2.vencidos(state.flashcards).length;
    if (vencidos > 0) sugestoes.push(`Há ${vencidos} ${vencidos === 1 ? "flashcard vencido" : "flashcards vencidos"} para revisar hoje.`);

    const tempoTotal = state.sessoes.reduce((acc, s) => acc + (s.tempoSeg || 0), 0);
    // Aproveitamento geral: questões da Prática (tentativas) + do registro de sessão.
    const sessAcG = state.sessoes.reduce((a, s) => a + (s.qAcertos || 0), 0);
    const sessTotG = state.sessoes.reduce((a, s) => a + (s.qAcertos || 0) + (s.qErros || 0), 0);
    const totalTent = state.tentativas.length + sessTotG;
    const totalAcertos = state.tentativas.filter((t) => t.acertou).length + sessAcG;
    return {
      porDisciplina,
      sugestoes,
      tempoTotalSeg: tempoTotal,
      totalTentativas: totalTent,
      percentGeral: totalTent ? Math.round((totalAcertos / totalTent) * 100) : null,
    };
  },

  // ---------- histórico / acompanhamento ----------
  historico(janelaDias = 14) {
    const hoje = todayISO();
    const dia = (iso) => (iso || "").slice(0, 10);

    // Série dos últimos N dias (janela escolhida pelo usuário; padrão 14).
    const janela = Math.max(2, Math.round(janelaDias) || 14);
    const dias = [];
    for (let i = janela - 1; i >= 0; i--) dias.push(addDays(hoje, -i));
    const porDia = dias.map((d) => {
      const sess = state.sessoes.filter((s) => dia(s.data) === d);
      const tent = state.tentativas.filter((t) => dia(t.data) === d);
      return {
        data: d,
        tempoSeg: sess.reduce((a, s) => a + (s.tempoSeg || 0), 0),
        sessoes: sess.length,
        tentativas: tent.length,
        acertos: tent.filter((t) => t.acertou).length,
      };
    });

    // Agregados por período (limite = nº de dias incluindo hoje; null = tudo).
    const periodo = (pred) => {
      const dentro = (iso) => pred(dia(iso));
      const sess = state.sessoes.filter((s) => dentro(s.data));
      const tent = state.tentativas.filter((t) => dentro(t.data));
      const ac = tent.filter((t) => t.acertou).length;
      const revs = state.revisoes.filter((r) => dentro(r.data));
      // soma também as questões/páginas lançadas manualmente nas sessões
      const paginas = sess.reduce((a, s) => a + (s.paginas || 0), 0);
      const mAcertos = sess.reduce((a, s) => a + (s.qAcertos || 0), 0);
      const mErros = sess.reduce((a, s) => a + (s.qErros || 0), 0);
      const questoesTotal = tent.length + mAcertos + mErros;
      const acertosTotal = ac + mAcertos;
      return {
        tempoSeg: sess.reduce((a, s) => a + (s.tempoSeg || 0), 0),
        sessoes: sess.length,
        tentativas: tent.length,
        acertos: ac,
        paginas,
        questoesTotal,
        acertosTotal,
        errosTotal: questoesTotal - acertosTotal,
        percent: questoesTotal ? Math.round((acertosTotal / questoesTotal) * 100) : null,
        revisoes: revs.length,
      };
    };
    const mesAtual = hoje.slice(0, 7);
    const periodos = {
      hoje: periodo((d) => d === hoje),
      semana: periodo((d) => {
        const n = daysBetween(d, hoje);
        return n >= 0 && n < 7;
      }),
      mes: periodo((d) => d.slice(0, 7) === mesAtual),
      tudo: periodo(() => true),
    };

    // Distribuição por etapa do ciclo (todo o período).
    const porFase = { E: 0, A: 0, R: 0, Pl: 0 };
    const tempoFase = { E: 0, A: 0, R: 0, Pl: 0 };
    for (const s of state.sessoes) {
      if (porFase[s.fase] !== undefined) {
        porFase[s.fase] += 1;
        tempoFase[s.fase] += s.tempoSeg || 0;
      }
    }

    const recentes = [...state.sessoes]
      .sort((a, b) => (a.data < b.data ? 1 : -1))
      .slice(0, 15)
      .map((s) => {
        const t = s.topicoId ? state.topicos.find((x) => x.id === s.topicoId) : null;
        const d = t ? state.disciplinas.find((x) => x.id === t.disciplinaId) : null;
        return {
          ...s,
          disciplinaNome: d ? d.nome : "—",
          topicoNome: t ? t.nome : "—",
        };
      });

    return { porDia, periodos, porFase, tempoFase, recentes };
  },

  // Volume de estudo por TIPO de material (leitura/vídeo/questões). O tempo da sessão é único
  // (não separado por tipo), então aqui medimos VOLUME: páginas lidas (+ ritmo págs/h estimado
  // pelas sessões que tiveram leitura), minutos de vídeo (por trechos ini→fim) e questões.
  esforcoPorTipo() {
    let paginas = 0, leiturasCount = 0, videoMin = 0, videosCount = 0, tempoLeituraSeg = 0, mAc = 0, mEr = 0;
    // Materiais novos: flashcards (soma de cartões) + lei seca / juris / resumo / mapa (nº de sessões).
    let flashcardsRev = 0, leiSecaN = 0, jurisN = 0, resumoN = 0, mapaN = 0;
    for (const s of state.sessoes) {
      paginas += s.paginas || 0;
      if ((s.paginas || 0) > 0) tempoLeituraSeg += s.tempoSeg || 0;
      mAc += s.qAcertos || 0; mEr += s.qErros || 0;
      const mat = s.materiais || {};
      const vids = Array.isArray(mat.videos) && mat.videos.length
        ? mat.videos
        : (Number.isFinite(s.videoIni) || Number.isFinite(s.videoFim) ? [{ ini: s.videoIni, fim: s.videoFim }] : []);
      for (const v of vids) { videosCount += 1; if (Number.isFinite(v.ini) && Number.isFinite(v.fim) && v.fim > v.ini) videoMin += v.fim - v.ini; }
      const lts = Array.isArray(mat.leituras) && mat.leituras.length
        ? mat.leituras.filter((l) => l && (l.paginas || l.titulo))
        : ((s.paginas || 0) > 0 ? [{ paginas: s.paginas }] : []);
      leiturasCount += lts.length;
      flashcardsRev += Number(mat.flashcards) || 0;
      if (mat.leiSeca) leiSecaN += 1;
      if (mat.jurisprudencia) jurisN += 1;
      if (mat.resumo) resumoN += 1;
      if (mat.mapa) mapaN += 1;
    }
    const tentativas = state.tentativas.length;
    const acertosTent = state.tentativas.filter((t) => t.acertou).length;
    const questoes = tentativas + mAc + mEr;
    const acertos = acertosTent + mAc;
    return {
      paginas, leiturasCount, videoMin, videosCount, questoes, acertos,
      flashcardsRev, leiSecaN, jurisN, resumoN, mapaN,
      aproveitamento: questoes ? Math.round((acertos / questoes) * 100) : null,
      paginasPorHora: tempoLeituraSeg > 0 ? Math.round((paginas / (tempoLeituraSeg / 3600)) * 10) / 10 : null,
    };
  },

  // Comportamento por HORÁRIO: tempo em foco por dia da semana × faixa do dia (madrugada/manhã/
  // tarde/noite). Alimenta o heatmap "quando você rende mais". Usa o horário LOCAL de s.data
  // (sessões com cronômetro têm hora real; lançamentos manuais usam meio-dia UTC ≈ manhã).
  comportamentoHorario() {
    const dias = [0, 0, 0, 0, 0, 0, 0]; // Dom..Sáb (tempoSeg)
    const grade = Array.from({ length: 7 }, () => [0, 0, 0, 0]); // [dia][faixa]
    const somaFaixa = [0, 0, 0, 0];
    const faixaDe = (h) => (h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3);
    let maxCel = 0, total = 0;
    for (const s of state.sessoes) {
      const t = s.tempoSeg || 0;
      if (!t) continue;
      const dt = new Date(s.data);
      if (isNaN(dt.getTime())) continue;
      const dow = dt.getDay(), fx = faixaDe(dt.getHours());
      dias[dow] += t; grade[dow][fx] += t; somaFaixa[fx] += t; total += t;
      if (grade[dow][fx] > maxCel) maxCel = grade[dow][fx];
    }
    const idxMax = (arr) => arr.reduce((mi, v, i, a) => (v > a[mi] ? i : mi), 0);
    return {
      dias, grade, maxCel, total,
      melhorDiaIdx: total ? idxMax(dias) : null,
      melhorFaixaIdx: total ? idxMax(somaFaixa) : null,
    };
  },

  // Desempenho das questões PRATICADAS (state.tentativas) por BANCA e por TIPO (MC × C/E).
  // A banca vem de q.banca (ou da prova vinculada via provaId). Só entram tentativas que ainda
  // têm a questão no acervo. Manual (qAcertos/qErros da sessão) não entra: não liga a banca.
  questoesRelatorio() {
    const porBanca = new Map();
    const formato = { mc: { total: 0, acertos: 0 }, ce: { total: 0, acertos: 0 } };
    let total = 0, acertos = 0;
    for (const t of state.tentativas) {
      const q = state.questoes.find((x) => x.id === t.questaoId);
      if (!q) continue;
      total += 1; if (t.acertou) acertos += 1;
      const fmt = q.formato === "ce" ? "ce" : "mc";
      formato[fmt].total += 1; if (t.acertou) formato[fmt].acertos += 1;
      let banca = (q.banca || "").trim();
      if (!banca && q.provaId) { const p = (state.provas || []).find((x) => x.id === q.provaId); banca = p && p.banca ? p.banca.trim() : ""; }
      banca = banca || "Sem banca";
      const e = porBanca.get(banca) || { total: 0, acertos: 0 };
      e.total += 1; if (t.acertou) e.acertos += 1;
      porBanca.set(banca, e);
    }
    const pct = (a, t) => (t ? Math.round((a / t) * 100) : null);
    return {
      total, acertos, percent: pct(acertos, total),
      porFormato: { mc: { ...formato.mc, percent: pct(formato.mc.acertos, formato.mc.total) }, ce: { ...formato.ce, percent: pct(formato.ce.acertos, formato.ce.total) } },
      porBanca: [...porBanca.entries()].map(([banca, v]) => ({ banca, total: v.total, acertos: v.acertos, percent: pct(v.acertos, v.total) })).sort((a, b) => b.total - a.total),
    };
  },

  // Ofensiva (constância): dias consecutivos com pelo menos uma sessão. Dias marcados
  // como folga (config.diasFolga) NÃO contam nem quebram a sequência. Se hoje ainda não
  // houve estudo, a sequência considera até ontem (não quebra por "o dia não acabou").
  ofensiva() {
    const dia = (iso) => (iso || "").slice(0, 10);
    const folgas = state.config.diasFolga || [];
    const ehFolga = (iso) => folgas.includes(new Date(iso + "T12:00:00").getDay());
    const diasComEstudo = new Set(state.sessoes.map((s) => dia(s.data)));
    const estudou = (iso) => diasComEstudo.has(iso);

    const contarDe = (inicio) => {
      let n = 0;
      let d = inicio;
      // limite de segurança: no máximo ~2 anos para trás
      for (let i = 0; i < 760; i++) {
        if (estudou(d)) { n++; d = addDays(d, -1); }
        else if (ehFolga(d)) { d = addDays(d, -1); }
        else break;
      }
      return n;
    };

    const hoje = todayISO();
    const atual = estudou(hoje) ? contarDe(hoje) : contarDe(addDays(hoje, -1));

    // Recorde: maior sequência já alcançada (varre os dias com estudo).
    let recorde = 0;
    if (diasComEstudo.size) {
      const ordenados = [...diasComEstudo].sort();
      const primeiro = ordenados[0];
      let run = 0;
      let d = primeiro;
      const fim = hoje;
      for (let i = 0; i < 4000 && d <= fim; i++) {
        if (estudou(d)) run++;
        else if (!ehFolga(d)) run = 0;
        if (run > recorde) recorde = run;
        d = addDays(d, 1);
      }
    }
    return { atual, recorde: Math.max(recorde, atual) };
  },

  // Semáforo de desempenho conforme as faixas configuradas (config.perfRuim/perfBom).
  // Retorna "ruim" | "regular" | "bom" (ou null se percent for null).
  corDesempenho(percent) {
    if (percent === null || percent === undefined) return null;
    const ruim = Number(state.config.perfRuim ?? 60);
    const bom = Number(state.config.perfBom ?? 80);
    if (percent < ruim) return "ruim";
    if (percent >= bom) return "bom";
    return "regular";
  },

  // Cor estável de uma disciplina (mesma em todo o app: edital, gráficos, tabelas).
  // Derivada por hash do id → não precisa migração nem armazenamento, e não muda se a ordem muda.
  // ---------- grupos de disciplinas + regra de corte (Fase C) ----------
  // Muitos concursos grandes reprovam por PISO EM UM GRUPO, não pela média: dá para ter
  // 70% no geral e ser eliminado por ficar abaixo do mínimo num bloco só. É a forma mais
  // comum de reprovar em concurso jurídico, e a que o app não enxergava — ele mostrava a
  // média e passava tranquilidade enquanto o candidato caminhava para o corte.
  // O grupo é TEXTO LIVRE (não um enum "Bloco I/II/III") para servir a qualquer certame:
  // blocos da Res. 75, eixos do CNU, áreas de concurso policial.
  setGrupoDisciplina(id, grupo) {
    const d = state.disciplinas.find((x) => x.id === id);
    if (!d) return;
    const g = (grupo || "").trim();
    if (g) d.grupo = g;
    else delete d.grupo;
    commit();
  },
  // `minGrupo` é o PADRÃO; `minPorGrupo` sobrescreve por grupo. Muitos editais exigem
  // percentuais diferentes por bloco (o clássico "30% nas básicas e 50% nas específicas"),
  // e um mínimo único não representaria esses — mas exigir preencher grupo a grupo
  // atrapalharia quem tem regra uniforme (a Res. 75, p.ex., é 30% em todos).
  setRegraAprovacao({ minGrupo, minGeral, minPorGrupo, minAmostra, pesoPorGrupo }) {
    if (!state.concurso) return;
    const lim = (v) => (v === null || v === undefined || v === "" ? null : Math.max(0, Math.min(100, Number(v) || 0)));
    const atual = state.concurso.regra || {};
    const mapa = { ...(atual.minPorGrupo || {}) };
    if (minPorGrupo && typeof minPorGrupo === "object") {
      for (const [g, v] of Object.entries(minPorGrupo)) {
        const n = lim(v);
        if (n === null) delete mapa[g];
        else mapa[g] = n;
      }
    }
    // PESO ≠ MÍNIMO: o mínimo elimina, o peso muda quanto o grupo vale na nota final.
    // Alguns editais têm os dois. Vazio ou 1 = sem peso especial (não guardamos, para o
    // app saber que não há ponderação e não poluir a tela com "peso 1" em toda linha).
    const pesos = { ...(atual.pesoPorGrupo || {}) };
    if (pesoPorGrupo && typeof pesoPorGrupo === "object") {
      for (const [g, v] of Object.entries(pesoPorGrupo)) {
        const n = v === "" || v === null || v === undefined ? null : Math.max(0, Number(v) || 0);
        if (n === null || n === 1) delete pesos[g];
        else pesos[g] = n;
      }
    }
    state.concurso.regra = {
      minGrupo: minGrupo === undefined ? (atual.minGrupo ?? null) : lim(minGrupo),
      minGeral: minGeral === undefined ? (atual.minGeral ?? null) : lim(minGeral),
      minPorGrupo: mapa,
      pesoPorGrupo: pesos,
      // Quantas questões um grupo precisa ter para o painel dar veredito. 30 é só o
      // default; quem quiser ouvir mais cedo (e errar mais) ou mais tarde (e errar
      // menos) ajusta. Estava fixo no código — decisão que não era minha.
      minAmostra:
        minAmostra === undefined
          ? (atual.minAmostra ?? null)
          : minAmostra === "" || minAmostra === null
          ? null
          : Math.max(1, Number(minAmostra) || 1),
    };
    commit();
  },
  // Mínimo que vale para um grupo: o dele, se houver; senão o padrão.
  minimoDoGrupo(nome) {
    const r = (state.concurso && state.concurso.regra) || {};
    const esp = r.minPorGrupo && r.minPorGrupo[nome];
    return esp === undefined || esp === null ? (r.minGrupo ?? null) : esp;
  },
  pesoDoGrupo(nome) {
    const r = (state.concurso && state.concurso.regra) || {};
    const p = r.pesoPorGrupo && r.pesoPorGrupo[nome];
    return p === undefined || p === null ? 1 : p;
  },
  gruposDisciplinas() {
    return [...new Set(state.disciplinas.map((d) => d.grupo).filter(Boolean))].sort();
  },
  // Aproveitamento por grupo + veredito contra a regra. Uma passada: monta o mapa
  // tópico→disciplina→grupo e depois varre as tentativas uma única vez.
  desempenhoPorGrupo() {
    const regra = (state.concurso && state.concurso.regra) || {};
    const grupoDaDisc = new Map(state.disciplinas.map((d) => [d.id, d.grupo || null]));
    const grupoDoTopico = new Map(state.topicos.map((t) => [t.id, grupoDaDisc.get(t.disciplinaId) || null]));
    const acc = new Map();
    let gAcertos = 0, gTotal = 0;
    for (const t of state.tentativas) {
      gTotal++;
      if (t.acertou) gAcertos++;
      const g = grupoDoTopico.get(t.topicoId);
      if (!g) continue; // questão sem tópico ou disciplina sem grupo não entra no cálculo
      if (!acc.has(g)) acc.set(g, { grupo: g, acertos: 0, total: 0 });
      const r = acc.get(g);
      r.total++;
      if (t.acertou) r.acertos++;
    }
    // AMOSTRA MÍNIMA. Percentual sobre 3 questões não é a sua habilidade, é ruído — e
    // dizer "abaixo do mínimo" com 3 questões é a mesma falsa precisão que o app combate
    // no conteúdo gerado por IA. Abaixo do piso o grupo aparece, mas SEM veredito: o que
    // ele informa é quantas questões faltam para poder medir, que já é instrução útil.
    const MIN_AMOSTRA = regra.minAmostra ?? 30;
    const grupos = [...acc.values()]
      .map((r) => {
        const pct = r.total ? Math.round((r.acertos / r.total) * 100) : null;
        const suficiente = r.total >= MIN_AMOSTRA;
        const min = this.minimoDoGrupo(r.grupo); // o do grupo, ou o padrão
        return {
          ...r,
          pct,
          min,
          peso: this.pesoDoGrupo(r.grupo),
          suficiente,
          faltam: Math.max(0, MIN_AMOSTRA - r.total),
          abaixo: suficiente && min != null && pct != null && pct < min,
          // distância em pontos percentuais até o mínimo (o número acionável)
          gap: suficiente && min != null && pct != null ? min - pct : null,
        };
      })
      .sort((a, b) => a.grupo.localeCompare(b.grupo));
    const geralPct = gTotal ? Math.round((gAcertos / gTotal) * 100) : null;
    const geralSuficiente = gTotal >= MIN_AMOSTRA;
    // MÉDIA PONDERADA — só faz sentido quando há peso diferente de 1 em algum grupo, e
    // só entram grupos COM amostra suficiente (senão a ponderação carrega o ruído dos
    // grupos ainda não medidos e devolve uma nota final inventada).
    const temPeso = grupos.some((g) => g.peso !== 1);
    const comDado = grupos.filter((g) => g.suficiente && g.pct !== null);
    const somaPesos = comDado.reduce((a, g) => a + g.peso, 0);
    const ponderada =
      temPeso && somaPesos > 0 ? Math.round(comDado.reduce((a, g) => a + g.pct * g.peso, 0) / somaPesos) : null;
    return {
      grupos,
      regra,
      minAmostra: MIN_AMOSTRA,
      geral: { acertos: gAcertos, total: gTotal, pct: geralPct, suficiente: geralSuficiente },
      temPeso,
      ponderada,
      // ponderada incompleta = há grupo com peso mas ainda sem amostra; a nota estimada
      // ainda vai mudar, e a tela precisa dizer isso em vez de exibir número redondo.
      ponderadaParcial: temPeso && comDado.length < grupos.length,
      geralAbaixo: geralSuficiente && regra.minGeral != null && geralPct != null && geralPct < regra.minGeral,
      // Sem DATA DE PROVA a regra é referência de um certame passado, não a regra do seu.
      // O painel muda de tom por causa disto: pré-edital ele informa, não sentencia.
      referencia: !state.config.dataProva,
      // Sem grupo definido não há veredito nenhum a dar. Basta UM mínimo em qualquer
      // lugar (padrão, específico de grupo ou geral) para o painel ter o que dizer.
      configurado:
        grupos.length > 0 &&
        (regra.minGrupo != null || regra.minGeral != null || grupos.some((g) => g.min != null)),
    };
  },

  corDisciplina(id) {
    const palette = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#dc2626", "#0891b2", "#db2777", "#65a30d", "#9333ea", "#0d9488", "#ea580c", "#4f46e5"];
    const s = String(id || "");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  },

  // Links anexados a um tópico do edital (videoaula, PDF, caderno de questões…).
  addLinkTopico(topicoId, { titulo, url }) {
    const t = state.topicos.find((x) => x.id === topicoId);
    if (!t) return;
    const u = (url || "").trim();
    if (!u) return;
    if (!Array.isArray(t.links)) t.links = [];
    t.links.push({ titulo: (titulo || "").trim() || u, url: u });
    commit();
  },
  removerLinkTopico(topicoId, idx) {
    const t = state.topicos.find((x) => x.id === topicoId);
    if (!t || !Array.isArray(t.links)) return;
    t.links.splice(idx, 1);
    commit();
  },

  // Domingo (início da semana) de uma data ISO 'yyyy-mm-dd'.
  _domingoSemana(iso) {
    const d = (iso || "").slice(0, 10);
    if (!d) return null;
    const [a, m, dd] = d.split("-").map(Number);
    return addDays(d, -new Date(a, m - 1, dd).getDay());
  },
  // Acurácia (% de acerto) por semana nas últimas N semanas. Junta as tentativas da Prática
  // (cada uma acertou/errou) com as questões lançadas no registro de sessão (qAcertos/qErros).
  // Semana sem questões fica com pct=null (não inventa ponto). Alimenta o gráfico de evolução.
  // filtro opcional: { topicoId } (um tópico) ou { disciplinaId } (todos os tópicos da disciplina).
  acuraciaPorSemana(semanas = 12, filtro = null) {
    // Conjunto de tópicos aceitos (null = todos). Tentativas e sessões carregam topicoId.
    let topsOk = null;
    if (filtro && filtro.topicoId) topsOk = new Set([filtro.topicoId]);
    else if (filtro && filtro.disciplinaId) topsOk = new Set(state.topicos.filter((t) => t.disciplinaId === filtro.disciplinaId).map((t) => t.id));
    const buckets = {};
    const add = (dataISO, ac, tot) => {
      const dom = this._domingoSemana(dataISO);
      if (!dom || !tot) return;
      if (!buckets[dom]) buckets[dom] = { acertos: 0, total: 0 };
      buckets[dom].acertos += ac;
      buckets[dom].total += tot;
    };
    for (const t of state.tentativas) {
      if (topsOk && !topsOk.has(t.topicoId)) continue;
      add(t.data, t.acertou ? 1 : 0, 1);
    }
    for (const s of state.sessoes) {
      if (topsOk && !topsOk.has(s.topicoId)) continue;
      const tot = (s.qAcertos || 0) + (s.qErros || 0);
      if (tot) add(s.data, s.qAcertos || 0, tot);
    }
    const domAtual = this._domingoSemana(todayISO());
    const out = [];
    for (let i = semanas - 1; i >= 0; i--) {
      const dom = addDays(domAtual, -7 * i);
      const b = buckets[dom] || { acertos: 0, total: 0 };
      out.push({ inicio: dom, acertos: b.acertos, total: b.total, pct: b.total ? Math.round((b.acertos / b.total) * 100) : null });
    }
    return out;
  },
  // Tempo de estudo agregado por SEMANA (bucket = domingo da semana), últimas `semanas`.
  // Espelha acuraciaPorSemana; usado no gráfico "Horas por semana" (esforço vs meta).
  tempoPorSemana(semanas = 8) {
    const buckets = {};
    for (const s of state.sessoes) {
      const dom = this._domingoSemana(s.data);
      if (!dom) continue;
      if (!buckets[dom]) buckets[dom] = { tempoSeg: 0, sessoes: 0 };
      buckets[dom].tempoSeg += s.tempoSeg || 0;
      buckets[dom].sessoes += 1;
    }
    const domAtual = this._domingoSemana(todayISO());
    const out = [];
    for (let i = semanas - 1; i >= 0; i--) {
      const dom = addDays(domAtual, -7 * i);
      const b = buckets[dom] || { tempoSeg: 0, sessoes: 0 };
      out.push({ inicio: dom, tempoSeg: b.tempoSeg, sessoes: b.sessoes });
    }
    return out;
  },
  // Comparativo desta semana vs a anterior (deltas dos KPIs). Compara janelas do MESMO
  // tamanho: domingo→hoje (semana atual parcial) × domingo anterior→mesmo dia da semana.
  comparativoSemana() {
    const hoje = todayISO();
    const domAtual = this._domingoSemana(hoje);
    const domAnterior = addDays(domAtual, -7);
    const [a, m, d] = hoje.split("-").map(Number);
    const fimAnterior = addDays(domAnterior, new Date(a, m - 1, d).getDay());
    const noIntervalo = (dataISO, ini, fim) => { const x = (dataISO || "").slice(0, 10); return x >= ini && x <= fim; };
    const agg = (ini, fim) => {
      let tempoSeg = 0, acertos = 0, total = 0;
      for (const s of state.sessoes) if (noIntervalo(s.data, ini, fim)) { tempoSeg += s.tempoSeg || 0; acertos += s.qAcertos || 0; total += (s.qAcertos || 0) + (s.qErros || 0); }
      for (const t of state.tentativas) if (noIntervalo(t.data, ini, fim)) { total += 1; acertos += t.acertou ? 1 : 0; }
      return { tempoSeg, questoes: total, acertos, pct: total ? Math.round((acertos / total) * 100) : null };
    };
    return { atual: agg(domAtual, hoje), anterior: agg(domAnterior, fimAnterior) };
  },

  // ---------- Central de Revisões (VISÃO consolidada; não duplica estado) ----------
  // Junta TODAS as revisões espaçadas (tópicos, resumos, mapas, lei/juris) num formato único,
  // + flashcards como item-LOTE por disciplina. status: atrasada | hoje | proxima (pela data).
  revisoesConsolidadas() {
    const hoje = todayISO();
    const ctx = (topicoId) => {
      const t = topicoId ? state.topicos.find((x) => x.id === topicoId) : null;
      const d = t ? state.disciplinas.find((x) => x.id === t.disciplinaId) : null;
      return { topico: t, disc: d };
    };
    const out = [];
    const push = (o) => {
      o.status = o.proxima < hoje ? "atrasada" : o.proxima === hoje ? "hoje" : "proxima";
      o.diasAtraso = o.status === "atrasada" ? daysBetween(o.proxima, hoje) : 0;
      out.push(o);
    };
    for (const r of state.revisoesTopico) {
      const { topico, disc } = ctx(r.topicoId);
      if (!topico) continue;
      push({ tipo: "topico", id: "topico:" + r.topicoId, refId: r.topicoId, titulo: topico.nome, topicoId: r.topicoId, disciplinaId: disc ? disc.id : null, disciplinaNome: disc ? disc.nome : "—", proxima: r.proxima, rota: "revtopico", acoes: true });
    }
    for (const rs of state.resumos) {
      if (!rs.revisao || !rs.revisao.proxima) continue;
      const { disc } = ctx(rs.topicoId);
      push({ tipo: "resumo", id: "resumo:" + rs.id, refId: rs.id, titulo: rs.titulo || "Resumo", topicoId: rs.topicoId || null, disciplinaId: disc ? disc.id : null, disciplinaNome: disc ? disc.nome : "—", proxima: rs.revisao.proxima, rota: "resumos", acoes: true });
    }
    for (const mp of state.mapasMentais) {
      if (!mp.revisao || !mp.revisao.proxima) continue;
      const { disc } = ctx(mp.topicoId);
      push({ tipo: "mapa", id: "mapa:" + mp.id, refId: mp.id, titulo: mp.titulo || "Mapa mental", topicoId: mp.topicoId || null, disciplinaId: disc ? disc.id : null, disciplinaNome: disc ? disc.nome : "—", proxima: mp.revisao.proxima, rota: "mapas", acoes: true });
    }
    for (const ind of state.indicacoes) {
      // Inclui memórias E promovidos (favorito/difícil viram revisão espaçada) — reconcilia com
      // memoriasParaRevisar (que conta promovido||memoria); antes promovidos sumiam da Central.
      if (!(ind.modo === "memoria" || ind.promovido) || ind.metaLeitura || !ind.revisao || !ind.revisao.proxima) continue;
      const { disc } = ctx(ind.topicoId);
      push({ tipo: ind.tipo === "juris" ? "juris" : "lei", id: "ind:" + ind.id, refId: ind.id, titulo: (ind.referencia || ind.texto || "Item").slice(0, 90), topicoId: ind.topicoId || null, disciplinaId: (disc ? disc.id : null) || ind.disciplinaId || null, disciplinaNome: disc ? disc.nome : "—", proxima: ind.revisao.proxima, rota: ind.tipo === "juris" ? "jurisprudencia" : "leiseca", acoes: true });
    }
    // Flashcards: item-LOTE por disciplina (cada card tem sua data SM-2; só entram os vencidos).
    const porDisc = {};
    for (const f of this.flashcardsVencidos()) {
      const { disc } = ctx(f.topicoId);
      const k = disc ? disc.id : "_sem";
      if (!porDisc[k]) porDisc[k] = { disc, qtd: 0 };
      porDisc[k].qtd++;
    }
    for (const k of Object.keys(porDisc)) {
      const g = porDisc[k];
      push({ tipo: "flashcards", id: "fc:" + k, refId: g.disc ? g.disc.id : null, lote: true, qtd: g.qtd, titulo: `${g.qtd} flashcard${g.qtd > 1 ? "s" : ""}`, disciplinaId: g.disc ? g.disc.id : null, disciplinaNome: g.disc ? g.disc.nome : "—", proxima: hoje, rota: "flashcards", acoes: false });
    }
    return out;
  },
  // Contadores rápidos p/ os cartões do topo da Central.
  revisoesResumoContagem() {
    const itens = this.revisoesConsolidadas();
    const hoje = todayISO();
    const em7 = addDays(hoje, 7);
    const concluidas30 = this.revisoesConcluidasLog(30).length;
    const atrasadas = itens.filter((i) => i.status === "atrasada").length;
    return {
      atrasadas,
      hoje: itens.filter((i) => i.status === "hoje").length,
      proximas7: itens.filter((i) => i.status === "proxima" && i.proxima <= em7).length,
      total: itens.length,
      concluidas30,
      // "estou em dia?": das que exigiram atenção (feitas + ainda atrasadas), quantas fiz.
      taxaConclusao: concluidas30 + atrasadas > 0 ? Math.round((concluidas30 / (concluidas30 + atrasadas)) * 100) : null,
    };
  },
  // Log de revisões CONCLUÍDAS nos últimos N dias (para a aba Concluídas + taxa).
  revisoesConcluidasLog(dias = 30) {
    const lim = addDays(todayISO(), -dias);
    return (state.revisoesFeitas || []).filter((x) => (x.data || "").slice(0, 10) >= lim).sort((a, b) => (a.data < b.data ? 1 : -1));
  },
  // Reprograma (só move a data `proxima`, sem mexer no intervalo/escada) por id do item.
  reprogramarRevisao(itemId, novaData) {
    if (!itemId || !novaData) return;
    const [tipo, refId] = itemId.split(":");
    if (tipo === "topico") { const r = state.revisoesTopico.find((x) => x.topicoId === refId); if (r) r.proxima = novaData; }
    else if (tipo === "resumo") { const o = state.resumos.find((x) => x.id === refId); if (o && o.revisao) o.revisao.proxima = novaData; }
    else if (tipo === "mapa") { const o = state.mapasMentais.find((x) => x.id === refId); if (o && o.revisao) o.revisao.proxima = novaData; }
    else if (tipo === "ind") { const o = state.indicacoes.find((x) => x.id === refId); if (o && o.revisao) o.revisao.proxima = novaData; }
    commit();
  },
  // Conclui uma revisão avançando pela escada do tipo + registra no log.
  // Fase 1: aceita a GRADUAÇÃO ("esqueci" reinicia · "lembrei" sobe 1 · "facil" sobe 2),
  // preservando a inteligência do espaçamento também quando a baixa é dada pela Central.
  concluirRevisao(itemId, titulo, grau = "lembrei") {
    if (!itemId) return null;
    const [tipo, refId] = itemId.split(":");
    const g = grau === "esqueci" || grau === "facil" ? grau : "lembrei";
    const gOk = g === "lembrei" ? "ok" : g; // resumo/mapa/ind usam "ok" no degrau do meio
    let dias = null;
    if (tipo === "topico") dias = this.revisarTopico(refId, g);
    else if (tipo === "resumo") dias = this.revisarResumo(refId, gOk);
    else if (tipo === "mapa") dias = this.revisarMapa(refId, gOk);
    else if (tipo === "ind") dias = this.revisarMemoria(refId, gOk);
    if (dias === null) return null;
    if (!Array.isArray(state.revisoesFeitas)) state.revisoesFeitas = [];
    state.revisoesFeitas.push({ id: uid("revf"), item: itemId, tipo, refId, titulo: titulo || "", grau: g, data: nowISO() });
    commit();
    return dias;
  },
  // ---------- Memória do chat do Mentor (Fase 2) ----------
  // Guarda as últimas trocas para (a) rehidratar o painel ao reabrir o app e
  // (b) dar CONTEXTO multi-turno às respostas ("e o prazo disso?"). Textos são
  // cortados e a lista é capada para não inchar o estado/sync.
  chatHistorico() {
    return Array.isArray(state.chatHistorico) ? state.chatHistorico : [];
  },
  chatRegistrar(who, texto) {
    if (!texto || !String(texto).trim()) return;
    if (!Array.isArray(state.chatHistorico)) state.chatHistorico = [];
    state.chatHistorico.push({ who: who === "user" ? "user" : "bot", texto: String(texto).slice(0, 4000), data: nowISO() });
    if (state.chatHistorico.length > 30) state.chatHistorico = state.chatHistorico.slice(-30);
    commit();
  },
  chatLimpar() {
    state.chatHistorico = [];
    commit();
  },

  // Remove uma revisão da FILA (não apaga o item em si — tópico/resumo/mapa/indicação
  // continuam; só deixam de estar agendados para revisão).
  removerRevisao(itemId) {
    if (!itemId) return;
    const [tipo, refId] = itemId.split(":");
    if (tipo === "topico") { this.cancelarRevisaoTopico(refId); return; }
    let o = null;
    if (tipo === "resumo") o = state.resumos.find((x) => x.id === refId);
    else if (tipo === "mapa") o = state.mapasMentais.find((x) => x.id === refId);
    else if (tipo === "ind") o = state.indicacoes.find((x) => x.id === refId);
    if (o) { o.revisao = null; commit(); }
  },
  // Ação em lote: traz TODAS as revisões atrasadas para hoje (só move a data).
  trazerAtrasadasParaHoje() {
    const hoje = todayISO();
    let n = 0;
    for (const it of this.revisoesConsolidadas()) {
      if (it.status === "atrasada" && it.acoes) { this.reprogramarRevisao(it.id, hoje); n++; }
    }
    return n;
  },

  // ---------- Simulados (histórico + registro; app auto-registra ao finalizar) ----------
  // Registra um simulado no histórico. origem "app" (feito no motor) ou "externo" (prova
  // física/cursinho/outra plataforma). Guarda certas/erradas/branco + aproveitamento.
  registrarSimulado({ origem = "externo", nome, formato = "mc", total, acertos, erros, brancos, tempoSeg = 0, data, porDisciplina = null, questaoIds = null, respostas = null } = {}) {
    const ac = Math.max(0, Math.round(+acertos || 0));
    const er = Math.max(0, Math.round(+erros || 0));
    const br = Math.max(0, Math.round(+brancos || 0));
    const tot = total != null ? Math.max(ac + er + br, Math.round(+total || 0)) : ac + er + br;
    if (tot < 1) return null; // simulado sem questões não entra
    const s = {
      id: uid("sim"),
      origem,
      nome: (nome || "").trim() || (origem === "app" ? "Simulado no app" : "Simulado"),
      formato, // "mc" | "ce"
      total: tot,
      acertos: ac,
      erros: er,
      brancos: br,
      tempoSeg: Math.max(0, Math.round(tempoSeg || 0)),
      aproveitamento: tot ? Math.round((ac / tot) * 100) : 0,
      porDisciplina: Array.isArray(porDisciplina) && porDisciplina.length ? porDisciplina : null,
      // Snapshot para reabrir a correção (só simulados feitos no app): ids das questões
      // na ordem aplicada + o que o usuário respondeu. O gabarito/enunciado é resolvido
      // de state.questoes na hora de exibir (questão apagada depois é simplesmente omitida).
      questaoIds: origem === "app" && Array.isArray(questaoIds) && questaoIds.length ? [...questaoIds] : null,
      respostas: origem === "app" && respostas && typeof respostas === "object" ? { ...respostas } : null,
      data: data ? (String(data).length === 10 ? `${data}T12:00:00.000Z` : data) : nowISO(),
    };
    if (!Array.isArray(state.simulados)) state.simulados = [];
    state.simulados.push(s);
    commit();
    return s;
  },
  removerSimulado(id) {
    state.simulados = (state.simulados || []).filter((s) => s.id !== id);
    commit();
  },
  // Lista dos simulados (mais recentes primeiro).
  simuladosLista() {
    return [...(state.simulados || [])].sort((a, b) => (a.data < b.data ? 1 : -1));
  },
  // Cartões de evolução: total, questões, aproveitamento médio (ponderado) e melhor nota.
  simuladosResumo() {
    const arr = state.simulados || [];
    const questoes = arr.reduce((a, s) => a + (s.total || 0), 0);
    const acertos = arr.reduce((a, s) => a + (s.acertos || 0), 0);
    return {
      total: arr.length,
      questoes,
      acertos,
      media: questoes ? Math.round((acertos / questoes) * 100) : null,
      melhor: arr.length ? Math.max(...arr.map((s) => s.aproveitamento || 0)) : null,
    };
  },

  // Todas as sessões (mais recentes primeiro), com nomes de disciplina e tópico.
  sessoesDetalhadas() {
    return [...state.sessoes]
      .sort((a, b) => (a.data < b.data ? 1 : -1))
      .map((s) => {
        const t = s.topicoId ? state.topicos.find((x) => x.id === s.topicoId) : null;
        const d = t ? state.disciplinas.find((x) => x.id === t.disciplinaId) : null;
        return { ...s, disciplinaId: d ? d.id : null, disciplinaNome: d ? d.nome : "—", topicoNome: t ? t.nome : "—" };
      });
  },

  // Agregado por dia de um mês ('yyyy-mm') para o calendário.
  calendarioMes(mesISO) {
    const map = {};
    for (const s of state.sessoes) {
      const d = (s.data || "").slice(0, 10);
      if (d.slice(0, 7) === mesISO) {
        if (!map[d]) map[d] = { tempoSeg: 0, sessoes: 0, fases: {} };
        map[d].tempoSeg += s.tempoSeg || 0;
        map[d].sessoes += 1;
        // Tempo por fase (E=Estudo, A=Prática, R=Revisão) para os filtros do calendário.
        const f = s.fase || "E";
        map[d].fases[f] = (map[d].fases[f] || 0) + (s.tempoSeg || 0);
      }
    }
    return map;
  },

  // ---------- replanejamento (sugestão de plano, não obrigatório) ----------
  // Analisa desempenho, cobertura, vencidos, atraso e dias até a prova e devolve
  // missões sugeridas para o usuário aprovar/ajustar (nada é aplicado automaticamente).
  sugerirPlano() {
    const sugestoes = [];
    const diag = this.diagnostico();
    const m = this.metas();

    if (m.diasProva != null && m.diasProva >= 0 && m.diasProva <= 30) {
      sugestoes.push({ titulo: `Reta final: faltam ${m.diasProva} dias — priorizar revisão (flashcards e erros)`, categoria: "Revisão", topicoId: null });
    }
    const venc = sm2.vencidos(state.flashcards).length;
    if (venc > 0) sugestoes.push({ titulo: `Revisar ${venc} ${venc === 1 ? "flashcard vencido" : "flashcards vencidos"} hoje`, categoria: "Revisão", topicoId: null });
    const errosPend = this.cadernoErros().length; // o que o aluno ve no caderno, nao o historico inteiro
    if (errosPend > 0) sugestoes.push({ titulo: `Refazer e revisar ${errosPend} ${errosPend === 1 ? "erro" : "erros"} do caderno`, categoria: "Revisão", topicoId: null });

    for (const l of diag.porDisciplina) {
      if (l.percentAcerto !== null && l.percentAcerto < 60) {
        sugestoes.push({ titulo: `Reforçar ${l.disciplina.nome}: aproveitamento ${l.percentAcerto}% (resolver questões)`, categoria: "Prática", topicoId: null });
      }
      if (l.totalTopicos > 0 && l.cobertura < 50) {
        sugestoes.push({ titulo: `Cobrir ${l.disciplina.nome}: só ${l.cobertura}% dos tópicos concluídos`, categoria: "Materiais", topicoId: null });
      }
    }
    // destaques (mais incidência) ainda sem material/questões
    const destaques = state.topicos
      .filter((t) => t.destaque)
      .sort((a, b) => (b.peso || 0) - (a.peso || 0));
    for (const t of destaques.slice(0, 4)) {
      const temConteudo = state.documentos.some((d) => docCobre(d, t.id)) || state.questoes.some((q) => q.topicoId === t.id) || state.mapasMentais.some((m) => m.topicoId === t.id) || state.resumos.some((r) => r.topicoId === t.id);
      if (!temConteudo) sugestoes.push({ titulo: `Estudar destaque: ${t.nome}${t.peso ? ` (incidência ${t.peso}%)` : ""}`, categoria: "Não definida", topicoId: t.id });
    }
    // tópicos previstos para as próximas aulas
    for (const t of state.topicos.filter((x) => x.previsaoAula).slice(0, 3)) {
      sugestoes.push({ titulo: `Preparar próxima aula: ${t.nome}`, categoria: "Não definida", topicoId: t.id });
    }
    if (!sugestoes.length) sugestoes.push({ titulo: "Tudo em dia! Avance no próximo tópico do edital.", categoria: "Não definida", topicoId: null });
    return sugestoes;
  },

  // ---------- PLANO/CRONOGRAMA (dir. 1) — gerador OFFLINE/determinístico ----------
  // Diagnóstico do plano: nível de familiaridade por disciplina (3 níveis). Re-rodável.
  setNivelDisciplina(disciplinaId, nivel) {
    state.config.niveisDisciplina = { ...(state.config.niveisDisciplina || {}), [disciplinaId]: nivel };
    commit();
  },
  // "Fixar ajuste" do macro: adiar/retomar uma disciplina (o gerador a exclui quando adiada).
  toggleDisciplinaAdiada(disciplinaId) {
    const atual = state.config.disciplinasAdiadas || [];
    state.config.disciplinasAdiadas = atual.includes(disciplinaId) ? atual.filter((x) => x !== disciplinaId) : [...atual, disciplinaId];
    commit();
  },
  // True quando já há dados mínimos para gerar (tempo/dia + ao menos um nível marcado).
  planoTemDiagnostico() {
    const c = state.config;
    return (c.dispDiariaMin || 0) > 0 && Object.keys(c.niveisDisciplina || {}).length > 0;
  },
  // Gera uma PROPOSTA de plano para a SEMANA corrente (micro) + um panorama MACRO.
  // Determinístico: prioriza por relevância (peso) + lacuna de cobertura + nível;
  // intercala disciplinas (interleaving); reserva tempo de revisão; respeita folga e
  // a disponibilidade diária. NÃO grava nada — só devolve a proposta para aprovação.
  gerarPlanoSemana() {
    const c = state.config;
    const niveis = c.niveisDisciplina || {};
    const adiadas = new Set(c.disciplinasAdiadas || []); // "fixar ajuste": disciplinas fora agora
    // `podeGerarPlano()` já exige `dispDiariaMin > 0`, e a tela recusa 0 antes de chegar aqui:
    // este 120 é rede de segurança, não uma carga inventada nas costas do aluno.
    const capDia = (c.dispDiariaMin || 0) > 0 ? c.dispDiariaMin : 120;
    const hoje = todayISO();
    const dias = this.semanaAtual().filter((d) => d >= hoje && !this.diaEhFolga(weekdayISO(d), d));
    // Sem dia disponível, a causa é folga/feriado, e não falta de tópico. Sem isto a tela dizia
    // "tudo coberto/dominado", que manda o aluno procurar o problema no lugar errado.
    const semDiaUtil = dias.length === 0;

    // Ranking de tópicos: relevância (peso) + lacuna de cobertura + nível da disciplina.
    const rank = state.topicos
      .filter((t) => !adiadas.has(t.disciplinaId)) // respeita as disciplinas adiadas (fixadas)
      .map((t) => {
        const coberto = topicoCoberto(state, t);
        const nivel = niveis[t.disciplinaId] || "pouco";
        let score = t.peso || 0;
        if (!coberto) score += 40; // lacuna pesa
        if (nivel === "nunca") score += 25;
        if (nivel === "domino") score -= 20;
        return { t, coberto, nivel, score };
      })
      .filter((x) => !(x.coberto && x.nivel === "domino")) // já dominado e coberto: fora da fila
      .sort((a, b) => b.score - a.score);

    // Trilha por tópico: Estudo (se não coberto e não domina) + Prática. Cirúrgica quando há dados.
    const base = [];
    for (const x of rank) {
      const t = x.t;
      const docs = state.documentos.filter((d) => docCobre(d, t.id));
      const qs = state.questoes.filter((q) => q.topicoId === t.id);
      if (!x.coberto && x.nivel !== "domino") {
        const pgs = docs.reduce((a, d) => a + ((d.paginas && d.paginas.length) || 0), 0);
        base.push({
          titulo: pgs ? `Estudar ${t.nome} (${pgs} pág. de material)` : `Estudar ${t.nome}`,
          categoria: "Materiais", topicoId: t.id, discId: t.disciplinaId, estimMin: 50,
        });
      }
      base.push({
        titulo: qs.length ? `Resolver ${Math.min(20, qs.length)} questões de ${t.nome}` : `Praticar questões de ${t.nome}`,
        categoria: "Prática", topicoId: t.id, discId: t.disciplinaId, estimMin: 40,
      });
    }

    // Ordenação: por padrão interleaving entre disciplinas; se a base de estudo é o CURSINHO
    // (e há aulas), segue a SEQUÊNCIA DAS AULAS (refino do baseEstudo).
    let intercaladas;
    if (c.baseEstudo === "cursinho" && state.aulas.length) {
      const ordemAula = new Map();
      state.aulas.forEach((a, ai) => (a.topicoIds || []).forEach((tid) => { if (!ordemAula.has(tid)) ordemAula.set(tid, ai); }));
      intercaladas = [...base].sort((x, y) => (ordemAula.has(x.topicoId) ? ordemAula.get(x.topicoId) : 9999) - (ordemAula.has(y.topicoId) ? ordemAula.get(y.topicoId) : 9999));
    } else {
      intercaladas = intercalarPorDisciplina(base); // interleaving entre disciplinas
    }
    // Mesma régua do ciclo: erro PENDENTE, não erro histórico. Com `some((t) => !t.acertou)`,
    // um erro de março fazia todos os dias do plano abrirem com 25 min de revisão, para sempre.
    const temRevisao = this.flashcardsVencidos().length > 0 || ciclo.temErroPendente(state);

    // Distribui pelos dias respeitando a capacidade diária; cada dia abre com revisão.
    const itens = [];
    let idx = 0;
    for (const d of dias) {
      let usado = 0;
      if (temRevisao) {
        itens.push({ data: d, titulo: "Revisar flashcards vencidos e caderno de erros", categoria: "Revisão", topicoId: null, estimMin: 25 });
        usado += 25;
      }
      while (idx < intercaladas.length && usado + intercaladas[idx].estimMin <= capDia) {
        const tb = intercaladas[idx++];
        itens.push({ data: d, titulo: tb.titulo, categoria: tb.categoria, topicoId: tb.topicoId, estimMin: tb.estimMin });
        usado += tb.estimMin;
      }
    }
    const sobra = intercaladas.length - idx; // não coube nesta semana (vai para as próximas)

    const m = this.metas();
    const cob = this.coberturaEdital();
    return {
      itens,
      dias,
      semDiaUtil, // a tela precisa saber POR QUE não há tarefa: folga/feriado ou falta de tópico
      macro: {
        diasProva: m.diasProva,
        dataProva: m.dataProva,
        capDiaMin: capDia,
        diasEstudo: dias.length,
        totalTopicos: state.topicos.length,
        cobertos: cob.cobertos,
        coberturaPct: cob.pct,
        naFila: intercaladas.length,
        sobra,
        adiadas: [...adiadas].map((id) => (state.disciplinas.find((d) => d.id === id) || {}).nome).filter(Boolean),
      },
    };
  },
  // Aceita a proposta (em bloco): cria as tarefas datadas. Devolve quantas criou.
  aceitarPlanoSemana(itens) {
    let n = 0;
    for (const it of itens || []) {
      const m = this.addMissao({ titulo: it.titulo, categoria: it.categoria, topicoId: it.topicoId || null, data: it.data, estimMin: it.estimMin, origem: "plano" });
      if (m && it.observacao) this.setMissaoComentario(m.id, it.observacao);
      n++;
    }
    return n;
  },
  // REFINAR/EXPLICAR o plano (preview) com a IA. Devolve texto. Online (requer iaDisponivel()).
  async refinarPlanoIA(itens) {
    const plano = (itens || []).map((it) => `${it.data || "(sem dia)"}: ${it.titulo} [${it.categoria}]`).join("\n");
    const m = this.metas();
    const diag = this.diagnostico();
    const fracas = diag.porDisciplina.filter((l) => l.percentAcerto !== null && l.percentAcerto < 60).map((l) => `${l.disciplina.nome} (${l.percentAcerto}%)`);
    const revCont = this.revisoesResumoContagem();
    const contexto =
      `Prova: ${m.dataProva ? m.diasProva + " dias restantes" : "sem data"}. ` +
      `Cobertura do edital: ${this.coberturaEdital().pct}%. ` +
      `Tempo disponível: ${Math.round(m.dispDiariaMin || 0)} min/dia. ` +
      (fracas.length ? `Disciplinas fracas: ${fracas.join(", ")}. ` : "") +
      (revCont.atrasadas ? `Revisões atrasadas: ${revCont.atrasadas}. ` : "");
    return iaProv.refinarPlano(state.config, { plano, contexto });
  },
  // IMPORTAR cronograma externo: a IA estrutura o texto em tarefas (online). Mapeia o dia
  // da semana para a data desta semana (ou próxima, se já passou). Devolve a PROPOSTA
  // (não grava — o usuário aprova em bloco). Offline: cai em tarefas soltas por linha.
  async importarCronograma(texto) {
    let tarefas;
    if (this.iaDisponivel()) {
      const arr = await iaProv.estruturarCronograma(state.config, { texto, literal: true });
      const semana = this.semanaAtual();
      const hoje = todayISO();
      tarefas = arr.map((t) => {
        let data = null;
        if (t.dia != null && t.dia >= 0 && t.dia <= 6) {
          // Importação de uma SEMANA inteira: ancora na semana corrente (Seg→Dom), mesmo que
          // o dia já tenha passado — assim a semana fica toda junta na grade. O usuário remaneja
          // pelo seletor de dia do preview se quiser jogar para a próxima.
          const d = semana.find((x) => weekdayISO(x) === Number(t.dia));
          data = d || null;
        }
        // "//" digitado tem prioridade na observação; senão usa a que a IA separou.
        const sep = separarObservacao(t.titulo);
        // tempo escrito na tarefa ("(50 min)") tem prioridade; senão o que a IA devolveu em t.min.
        const p = extrairTempoDoTitulo(sep.titulo);
        const estimMin = p.estimMin != null ? p.estimMin : t.min != null ? Math.max(0, Number(t.min) || 0) : null;
        const observacao = sep.observacao || String(t.observacao || "").trim();
        return { titulo: tirarMarcadorLista(p.titulo), observacao, categoria: t.categoria || "Não definida", data, estimMin };
      }).filter((t) => t.titulo);
    } else {
      tarefas = String(texto || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length >= 3)
        .map((l) => {
          const sep = separarObservacao(l);
          const p = extrairTempoDoTitulo(tirarMarcadorLista(sep.titulo));
          return { titulo: tirarMarcadorLista(p.titulo), observacao: sep.observacao, categoria: "Não definida", data: null, estimMin: p.estimMin };
        });
    }
    return tarefas;
  },
  // ADAPTAR o cronograma colado à REALIDADE do aluno (requer IA): a IA usa o texto como base,
  // mas redistribui a carga aos dias disponíveis, ao tempo/dia, às lacunas e aos dias até a prova.
  // Devolve a PROPOSTA datada (não grava — o usuário aprova em bloco).
  async adaptarCronograma(texto) {
    if (!this.iaDisponivel()) throw new Error("Conecte a IA para adaptar o cronograma.");
    const c = state.config;
    const hoje = todayISO();
    const semana = this.semanaAtual();
    const diasDisp = semana.filter((d) => d >= hoje && !this.diaEhFolga(weekdayISO(d), d));
    const m = this.metas();
    const cob = this.coberturaEdital();
    const fracas = this.diagnostico()
      .porDisciplina.filter((l) => l.percentAcerto !== null && l.percentAcerto < 60)
      .map((l) => l.disciplina.nome);
    const contexto = {
      diasDisponiveis: diasDisp.map((d) => weekdayISO(d)),
      tempoPorDiaMin: (c.dispDiariaMin || 0) > 0 ? c.dispDiariaMin : 120,
      diasAteProva: m.diasProva,
      coberturaPct: cob.pct,
      disciplinasFracas: fracas,
    };
    const arr = await iaProv.adaptarCronograma(state.config, { texto, contexto });
    return arr
      .map((t) => {
        let data = null;
        if (t.dia != null && t.dia >= 0 && t.dia <= 6) {
          const d = semana.find((x) => weekdayISO(x) === Number(t.dia));
          data = d && d >= hoje ? d : d ? addDays(d, 7) : null;
        }
        const p = extrairTempoDoTitulo(t.titulo);
        const estimMin = p.estimMin != null ? p.estimMin : t.min != null ? Math.max(0, Number(t.min) || 0) : null;
        return { titulo: tirarMarcadorLista(p.titulo), observacao: String(t.observacao || "").trim(), categoria: t.categoria || "Não definida", data, estimMin };
      })
      .filter((t) => t.titulo);
  },

  // ---------- ACCOUNTABILITY / MOTIVAÇÃO (dir.3) ----------
  // Espírito: gentil, opt-in, sem gamificação excessiva. Streak + balanço + reforço positivo.
  // Dias com estudo = dias com ao menos uma sessão registrada.
  diasComEstudo() {
    return new Set(state.sessoes.map((s) => (s.data || "").slice(0, 10)).filter(Boolean));
  },
  // Streak consecutivo () + "X de N dias" na semana corrente (N = dias de estudo
  // configurados = 7 menos os dias de folga). Os dias de folga NÃO interrompem a
  // sequência: ao andar para trás, um dia de folga sem estudo é pulado, não quebra.
  streak() {
    const dias = this.diasComEstudo();
    const hoje = todayISO();
    const estudouHoje = dias.has(hoje);
    // conta para trás a partir de hoje (ou de ontem, se ainda não estudou hoje).
    let cursor = estudouHoje ? hoje : addDays(hoje, -1);
    let atual = 0;
    let folgaSeguidas = 0; // trava de segurança contra semana inteira de folga
    while (true) {
      if (dias.has(cursor)) {
        atual++;
        folgaSeguidas = 0;
        cursor = addDays(cursor, -1);
      } else if (this.diaEhFolga(weekdayISO(cursor), cursor) && folgaSeguidas < 7) {
        // dia de folga sem estudo: pula sem quebrar a sequência
        folgaSeguidas++;
        cursor = addDays(cursor, -1);
      } else {
        break;
      }
    }
    // Dias de estudo planejados na semana corrente (exclui folgas) e quantos cumpridos.
    const planejados = this.semanaAtual().filter((d) => !this.diaEhFolga(weekdayISO(d), d));
    const metaSemana = planejados.length; // = 7 - dias de folga
    const naSemana = planejados.filter((d) => dias.has(d)).length;
    return { atual, estudouHoje, naSemana, metaSemana, totalDias: dias.size };
  },
  // Balanço de um dia: tarefas datadas planejadas × concluídas + tempo/sessões.
  balancoDoDia(dataISO) {
    const tarefas = state.missoes.filter((m) => m.data === dataISO);
    const rot = this.tarefasDoDia(dataISO).filter((x) => x.tipo === "rotina");
    const planejadas = tarefas.length + rot.length;
    const feitas = tarefas.filter((m) => m.concluida).length + rot.filter((r) => r.concluida).length;
    const sess = state.sessoes.filter((s) => (s.data || "").slice(0, 10) === dataISO);
    const tempoMin = Math.round(sess.reduce((a, s) => a + (s.tempoSeg || 0), 0) / 60);
    return { data: dataISO, planejadas, feitas, tempoMin, sessoes: sess.length };
  },
  balancoOntem() {
    return this.balancoDoDia(addDays(todayISO(), -1));
  },
  // O que há para hoje (gentil, sem cobrança): tarefas, revisões de tópico, flashcards.
  balancoHoje() {
    const b = this.balancoDoDia(todayISO());
    return { ...b, revisoesTopico: this.revisoesTopicoCount(), flashcards: this.flashcardsVencidos().length };
  },
  // Reforço positivo: marcos REAIS recém-atingidos (sem bajulação). Lista de {icone,txt}.
  conquistas() {
    const out = [];
    const s = this.streak();
    if ([3, 7, 14, 21, 30, 50, 100].includes(s.atual)) out.push({ icone: "flame", txt: `${s.atual} dias seguidos de estudo!` });
    if (s.metaSemana > 0 && s.naSemana >= s.metaSemana) out.push({ icone: "calendar", txt: `Você cumpriu todos os ${s.metaSemana} ${s.metaSemana === 1 ? "dia" : "dias"} de estudo planejados desta semana!` });
    const consolidados = state.revisoesTopico.filter((r) => r.intervalo >= 30).length;
    if (consolidados > 0) out.push({ icone: "brain", txt: `${consolidados} ${consolidados === 1 ? "tópico já consolidado" : "tópicos já consolidados"} na memória de longo prazo.` });
    const cob = this.coberturaEdital();
    if ([25, 50, 75, 100].includes(cob.pct)) out.push({ icone: "library", txt: `${cob.pct}% do edital coberto!` });
    return out;
  },
  // O que SERIA notificado agora (lista determinística). O disparo é só no desktop (Tauri).
  notificacoesDevidas() {
    const n = state.config.notificacoes || {};
    if (!n.ativar) return [];
    const out = [];
    const hoje = todayISO();
    const dias = this.diasComEstudo();
    if (n.revisoes) {
      const rev = this.revisoesTopicoCount();
      const fc = this.flashcardsVencidos().length;
      if (rev + fc > 0) out.push({ tipo: "revisoes", titulo: "Revisões de hoje", corpo: `${rev} ${rev === 1 ? "tópico" : "tópicos"} e ${fc} ${fc === 1 ? "flashcard" : "flashcards"} para revisar.` });
    }
    // Lembrete (opt-in separado) das tarefas planejadas para hoje — só sugestão, sem cobrança.
    if (n.tarefasDia) {
      const pend = this.tarefasDoDia(hoje).filter((x) => !x.concluida).length;
      if (pend > 0) out.push({ tipo: "tarefas", titulo: "Tarefas de hoje", corpo: `${pend} ${pend === 1 ? "tarefa sugerida" : "tarefas sugeridas"} para hoje (é só sugestão).` });
    }
    // Lembrete (opt-in) de rever o progresso com o Mentor a cada ~7 dias — você decide quando.
    if (n.mentorPlano && this.iaDisponivel()) {
      const d = this.diasDesdeAnaliseMentor();
      if (d === null || d >= 7) {
        out.push({ tipo: "mentor", titulo: "Revisar o plano com o Mentor", corpo: d === null ? "Que tal pedir a primeira análise do seu progresso?" : `Faz ${d} dias sem rever seu progresso — uma análise pode ajudar.` });
      }
    }
    if (n.inatividade && dias.size) {
      const ultimo = [...dias].sort().pop();
      const faz = daysBetween(ultimo, hoje);
      if (faz >= 2) out.push({ tipo: "inatividade", titulo: "Sentimos sua falta", corpo: `Faz ${faz} dias sem estudar. Que tal retomar com algo leve hoje?` });
    }
    if (n.marcos) {
      // Marco de reta final: faltam ≤30 dias para a prova (mesma faixa do banner do HOJE
      // e do ponto de atenção "reta"). Opt-in junto com os demais marcos, sem novo campo.
      const rf = this.retaFinal();
      if (rf.ativo) {
        const corpo =
          rf.dias === 0
            ? "É hoje! Boa prova. "
            : `Faltam ${rf.dias} ${rf.dias === 1 ? "dia" : "dias"} para a prova — foco no que mais cai.`;
        out.push({ tipo: "reta", titulo: "Reta final", corpo });
      }
      this.conquistas().forEach((c) => out.push({ tipo: "marco", titulo: "Marco alcançado", corpo: c.txt }));
    }
    return out;
  },

  // ---------- configurações ----------
  setConfig(patch) {
    // MUTAÇÃO, não reatribuição. `state.config = {...}` copiaria só as chaves enumeráveis
    // e destruiria os acessores por-perfil — metas, data da prova e o plano do Mentor
    // sumiriam em silêncio. Object.assign passa pelos setters, então cada chave vai para
    // o seu lugar (global ou perfil ativo).
    Object.assign(state.config, patch);
    commit();
  },
  // Atualiza só os metadados de sincronização (config.sync) SEM carimbar modificadoEm —
  // status/última-sync não são "mudança de dados". Usado por src/sync.js.
  setSyncMeta(patch) {
    state.config.sync = { ...(state.config.sync || {}), ...patch };
    commit({ semCarimbo: true });
  },
  // Metadados da sincronização NA NUVEM por senha (config.syncNuvem) — mesmo contrato do
  // setSyncMeta (sem carimbar modificadoEm). Guarda status, dispositivo e a senha LOCAL
  // (nunca sobe: montarSnapshotSync remove config.syncNuvem antes de cifrar). Usado por
  // src/sync-nuvem.js.
  setSyncNuvemMeta(patch) {
    state.config.syncNuvem = { ...(state.config.syncNuvem || {}), ...patch };
    commit({ semCarimbo: true });
  },
  // ---------- atalhos personalizados (HOJE e, opcional, barra lateral) ----------
  addAtalho({ nome, tipo, alvo, icone, naNav, noHoje }) {
    const a = {
      id: uid("atl"),
      nome: (nome || "").trim() || "Atalho",
      tipo: tipo || "tela",
      alvo: alvo || "",
      icone: (icone || "").trim() || "",
      // Onde aparece (independentes): HOJE e/ou barra lateral. Padrão: no HOJE.
      noHoje: noHoje === undefined ? true : !!noHoje,
      naNav: !!naNav,
    };
    state.config.atalhos = [...(state.config.atalhos || []), a];
    commit();
    return a;
  },
  removerAtalho(id) {
    state.config.atalhos = (state.config.atalhos || []).filter((a) => a.id !== id);
    commit();
  },
  // Move o atalho para cima (-1) ou para baixo (+1) na lista.
  moverAtalho(id, dir) {
    const arr = [...(state.config.atalhos || [])];
    const i = arr.findIndex((a) => a.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    state.config.atalhos = arr;
    commit();
  },
  toggleAtalhoNav(id) {
    const a = (state.config.atalhos || []).find((x) => x.id === id);
    if (a) {
      a.naNav = !a.naNav;
      commit();
    }
  },
  toggleAtalhoHoje(id) {
    const a = (state.config.atalhos || []).find((x) => x.id === id);
    if (a) {
      a.noHoje = a.noHoje === false ? true : !a.noHoje;
      commit();
    }
  },

  // Snapshot do estado para EXPORTAR. comMaterial=false produz um backup COMPARTILHÁVEL:
  // remove o conteúdo dos materiais importados (binário, texto e páginas) e o índice
  // semântico (que é texto verbatim do material) — mantém só os metadados do material e
  // os SEUS derivados de estudo (flashcards, questões, resumos, marcações). Assim um backup
  // compartilhado não redistribui apostila protegida (que carrega sua marca-d'água/CPF).
  // Quantos materiais sairiam SEM conteúdo num backup feito neste aparelho. Existe porque o
  // "Backup completo" promete "inclui seus materiais (com o conteúdo)" — e num aparelho que só
  // tem o esqueleto isso seria mentira: o arquivo sairia com 496 fichas vazias, e importá-lo no
  // computador que tem tudo APAGARIA a biblioteca inteira. Quem chama tem de avisar antes.
  materiaisSemConteudoLocal() {
    return (state.documentos || []).filter((d) => this.conteudoPendente(d)).map((d) => d.titulo);
  },
  // Devolve SEMPRE um clone. Antes o backup completo devolvia o `state` vivo: quem mexesse
  // no objeto para exportar mexia no estado do app.
  //
  // O compartilhável tira DUAS coisas, por razões diferentes:
  //  - o conteúdo do material, porque é obra de terceiro e carrega a marca-d'água com o CPF
  //    de quem baixou (`limparMaterialDaFatia`);
  //  - a config local do aparelho, porque ali estão a CHAVE de API do Gemini e a SENHA do
  //    cofre — e a senha do cofre é a identidade do cofre: quem a recebe lê e SOBRESCREVE o
  //    estudo do dono em qualquer aparelho. Enquanto isto faltava, o botão anunciava "seguro
  //    para compartilhar" sobre um arquivo que entregava os dois segredos.
  // O completo mantém a config (é arquivo local de restauração — sem a chave, restaurar
  // deixaria o app sem IA), e por isso a tela avisa antes de gerar que ele NÃO se compartilha.
  snapshotExport(comMaterial = true) {
    const clone = JSON.parse(JSON.stringify(state));
    if (comMaterial) return clone;
    // Multi-perfil: material e resumos vivem DENTRO de cada perfil. Limpar só o topo
    // deixaria as apostilas passarem no backup — por isso a limpeza é por perfil, e em
    // TODOS eles (o backup leva o app inteiro, não só o perfil ativo).
    for (const p of clone.perfis || []) limparMaterialDaFatia(p);
    return limparConfigLocal(clone);
  },

  // Importa um backup JSON (substitui TODOS os dados). Valida minimamente e
  // reaplica os backfills de normalização (via init).
  // `opts.semCarimbo`: usado pelo sync na nuvem (sync-nuvem.js) ao BAIXAR — `aplicarRemoto`
  // já grava em `obj.modificadoEm` o carimbo REAL do remoto; sem isto, o `commit()` do fim
  // reescreveria para "agora", e o aparelho pareceria sempre o mais novo logo após baixar,
  // reenviando (e arriscando sobrescrever) o que outro aparelho tiver editado nesse meio-tempo.
  // A importação manual de um arquivo (config.js) não passa opts — continua carimbando "agora",
  // que é o comportamento certo ali (é uma edição local decidida pelo usuário neste instante).
  async importarBackup(obj, opts) {
    // Aceita os DOIS formatos: o plano (coleções no topo, backups antigos e cofres já na
    // nuvem) e o multi-perfil (perfis[]). A conversão de um para o outro é do init.
    const pareceBackup =
      obj && typeof obj === "object" && obj.meta && (Array.isArray(obj.topicos) || Array.isArray(obj.perfis));
    if (!pareceBackup) throw new Error("Arquivo inválido — não parece um backup do Mentor Concurso.");
    // `saveState` (persistence.estadoParaGravar) TIRA `paginas`/`embeddings` do JSON antes de
    // gravar, confiando que o conteúdo já está nas chaves próprias (`pag:<doc>`/`emb:<perfil>`)
    // — é assim que a gravação normal funciona (persist() grava os blobs sujos ANTES do
    // estado). Um backup vindo da nuvem/arquivo nunca passou por ali: sem escrever os blobs
    // aqui primeiro, `saveState` descartaria o texto extraído antes de ele tocar o disco, e o
    // material chegaria com o corpo vazio em todo aparelho que só recebe dados por sync (o que
    // importou o PDF continua com os blobs escritos pelo fluxo normal, por isso só ele via).
    if (blobsDisponiveis()) {
      const perfis = Array.isArray(obj.perfis) ? obj.perfis : [obj];
      for (const p of perfis) {
        for (const d of p.documentos || []) {
          if (Array.isArray(d.paginas) && d.paginas.length) await setBlob(`pag:${d.id}`, { paginas: d.paginas });
        }
        if (p.id && p.embeddings && Array.isArray(p.embeddings.itens) && p.embeddings.itens.length) {
          await setBlob(`emb:${p.id}`, p.embeddings);
        }
      }
    }
    await saveState(obj);
    await this.init(); // recarrega e normaliza (backfills)
    commit(opts && opts.semCarimbo ? { semCarimbo: true } : undefined);
    return state;
  },

  // Define a ordem personalizada dos botões do meio da barra (hoje/config são fixos).
  setOrdemNav(ids) {
    state.config.ordemNav = [...ids];
    commit();
  },
  // Oculta/reexibe um botão de navegação (só some da barra; continua no sistema).
  setBotaoOculto(id, oculto) {
    const set = new Set(state.config.botoesOcultos || []);
    if (oculto) set.add(id);
    else set.delete(id);
    state.config.botoesOcultos = [...set];
    commit();
  },
  // Apaga os DADOS DE ESTUDO. Preserva o que é configuração do aparelho e custa a repor:
  // a conexão com a IA (chave digitada uma vez e esquecida) e o tema. Quem apaga o edital
  // não está pedindo para desconectar a IA nem para voltar ao tema claro.
  async resetTudo() {
    const antes = state.config || {};
    const preservar = {};
    for (const k of ["iaProvider", "iaKey", "iaKeyReserva", "iaModelo", "tema"]) {
      if (antes[k] !== undefined && antes[k] !== "") preservar[k] = antes[k];
    }
    // O que mora fora do estado não é apagado por `resetState()`: binário, páginas e índice
    // semântico têm chave própria. Sem isto, "apagar tudo" deixaria centenas de MB órfãos.
    for (const p of state.perfis || []) {
      for (const d of p.documentos || []) { esquecerPaginas(d.id); delBlob(d.id); }
      for (const m of p.mapasMentais || []) delBlob(m.id);
      delBlob(`emb:${p.id}`);
      embSalvos.delete(p.id);
    }
    state = migrarParaPerfis(defaultState());
    instalarAcessores(); // `state` é outro objeto: sem isto, state.disciplinas some
    Object.assign(state.config, preservar);
    await resetState();
    commit();
  },

  // expõe utilitários para a UI
  _ia: ia,
  _sm2: sm2,
  _ciclo: ciclo,
};
