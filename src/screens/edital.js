// Tela Edital: gerenciar disciplinas, tópicos e destaques a qualquer momento
// (o onboarding monta a estrutura inicial; aqui você acrescenta/edita depois).
import { bindActions, toast, header, seloBadge, vazio, confirmar, botaoImprimir, imprimir, ligarDropZone, escolher, avisoIA, pedirTexto, abrirJanela, abrirJanelaFluxo, plural, ligarArrastar } from "../ui.js";
import { progressRing } from "../viz.js";
import { esc, fmtData } from "../util.js";
import { icone } from "../icones.js";
import { separarEdital } from "../ia.js";
import { lerArquivoTexto, ligarImportArquivo, arquivoParaBase64 } from "../pdf.js";
import { renderDossieDetalhe, dossieResumoHTML, renderDossieDisciplina } from "./dossie.js";
import { filtroTopicosBotaoHTML, filtroTopicosPainelHTML, ligarFiltroTopicos } from "./questoes-filtro.js";

let aulasPreview = null; // proposta de aulas do cursinho (preview editável)
let aulasTextoSalvo = "";
let aulaTopAberto = null; // aulaId com o editor de tópicos da aula aberto (Fase 4)
let aulasImportAberto = false; // mostrar a caixa de importar aulas mesmo já tendo aulas
let topSort = "custom"; // ordem dos tópicos DENTRO da disciplina: "custom" | "relevancia"
let aulasSort = "custom"; // ordem de EXIBIÇÃO das aulas: "custom" | "nome" | "topicos" (só na renderização)
let cursinhoView = "aula"; // Plano do cursinho: ver "aula" (aula→tópicos) ou "topico" (tópico→aula)
let topSel = new Set(); // tópicos selecionados para ações em lote (mover/unificar/nova disciplina)
let selMode = false; // modo de seleção (mostra as caixas de seleção; fora dele só aparece o ✓ Concluído)
let discAcAberta = new Set(); // disciplinas com o accordion ABERTO (persiste na sessão)
let discAcInit = false; // na 1ª vez, abre só a primeira disciplina (fim do "paredão")
let edModo = "estrutura"; // "estrutura" (editar) | "resumo" (dossiê) | "cursinho" (plano de aulas)
const filtroEd = { sel: [], aberto: false }; // filtro multi-tópico (disciplina inteira / tópicos avulsos)
let edModoIniciado = false; // ao abrir pela 1ª vez na sessão, respeita config.baseEstudo
let dossieTopicoId = null; // quando setado, o Edital mostra o DOSSIÊ do tópico (desdobramento)
let dossieDiscId = null; // quando setado (e sem tópico aberto), mostra o PAINEL da disciplina
let _lastParams = null; // identidade do objeto de params: distingue navegação de re-render
let edCountAnimou = false; // count-up do anel de cobertura só na 1ª renderização da sessão (não re-anima a cada refresh)

// Faixas de RELEVÂNCIA (incidência). Guardamos sempre o peso numérico (0–100), que
// vem exato da importação; a UI seleciona por faixa. As faixas altas (81–90 e 91–100)
// são separadas de propósito para destacar o que mais cai.
const BANDAS = [
  { rotulo: "Não definido", min: 0, max: 0, rep: 0 },
  { rotulo: "0–20%", min: 1, max: 20, rep: 20 },
  { rotulo: "21–40%", min: 21, max: 40, rep: 40 },
  { rotulo: "41–60%", min: 41, max: 60, rep: 60 },
  { rotulo: "61–80%", min: 61, max: 80, rep: 80 },
  { rotulo: "81–90% (alta)", min: 81, max: 90, rep: 90 },
  { rotulo: "91–100% (altíssima)", min: 91, max: 100, rep: 100 },
];
// Índice da faixa em que um peso cai (0 = sem relevância).
function bandaIndex(peso) {
  const p = peso || 0;
  if (p <= 0) return 0;
  for (let i = 1; i < BANDAS.length; i++) if (p <= BANDAS[i].max) return i;
  return BANDAS.length - 1;
}

// ---- Relevância: helpers reutilizados pelo Edital E pelo Dossiê (mesma fonte) ----
// Valor do <select>: "nd" (não definido) | "mc" (mais cai, sem %) | "1".."6" (faixa).
export function relValor(t) {
  if ((t.peso || 0) > 0) return String(bandaIndex(t.peso));
  return t.maisCai ? "mc" : "nd";
}
// Classe de COR do item conforme a relevância (faixa, "mais cai" ou nenhuma).
export function relBandClass(t) {
  if ((t.peso || 0) > 0) return "rel-b" + bandaIndex(t.peso);
  return t.maisCai ? "rel-bmc" : "rel-b0";
}
// Rótulo curto da relevância para exibição (chip): "30%", "Mais cai" ou "".
export function relLabel(t) {
  if ((t.peso || 0) > 0) return `${t.peso}%`;
  return t.maisCai ? "Mais cai" : "";
}
// ---- Relevância NOMEADA (Não cai · Baixa · Média · Alta · Altíssima) ----
// O sistema interpreta o % de incidência (peso) da banca e mostra um nível nomeado,
// como pílula colorida. A edição grava um peso representativo do nível escolhido.
const REL_NIVEIS = [
  { v: "nd", nome: "Não cai", peso: 0 },
  { v: "baixa", nome: "Baixa", peso: 15 },
  { v: "media", nome: "Média", peso: 40 },
  { v: "alta", nome: "Alta", peso: 70 },
  { v: "altissima", nome: "Altíssima", peso: 95 },
];
// Valor nomeado atual de um tópico a partir do peso (maisCai sem % conta como Alta).
export function relNamedValor(t) {
  const p = t.peso || 0;
  if (p <= 0) return t.maisCai ? "alta" : "nd";
  if (p <= 20) return "baixa";
  if (p <= 50) return "media";
  if (p <= 80) return "alta";
  return "altissima";
}
export function relNamedNome(t) {
  return (REL_NIVEIS.find((n) => n.v === relNamedValor(t)) || REL_NIVEIS[0]).nome;
}
// <select> estilizado como pílula colorida (mantém a relevância editável na própria tabela).
export function relPillSelectHTML(t) {
  const cur = relNamedValor(t);
  const opts = REL_NIVEIS.map((n) => `<option value="${n.v}" ${n.v === cur ? "selected" : ""}>${n.nome}</option>`).join("");
  return `<select class="rel-pill relp-${cur}" data-id="${t.id}" data-nivel-named data-tip="Relevância: o quanto o tema cai na sua banca (o sistema interpreta o % de incidência).">${opts}</select>`;
}
export function aplicarRelNamed(store, id, val) {
  const n = REL_NIVEIS.find((x) => x.v === val);
  if (!n || n.v === "nd") store.setRelevancia(id, { peso: 0, maisCai: false });
  else store.setRelevancia(id, { peso: n.peso, maisCai: true });
}

// Painel de SUGESTÃO de relevância por IA: Fonte B (provas importadas) e Fonte C (web).
// São estimativas — o usuário confere e aplica (mensagem reforça importar provas).
function sugIAHTML(store, carregando = "", rel = null) {
  const st = store.get();
  const nProvas = st.questoes.filter((q) => q.provaId).length;
  const conc = st.concurso;
  const alvo = conc ? [conc.banca, conc.cargo].filter(Boolean).join(" · ") : "";
  return `<div class="card sug-rel">
    <div class="plano-h"><span class="orb orb-sm" aria-hidden="true"></span><h2>Sugerir relevância</h2><span class="muted small">pesquisa</span></div>
    <p class="muted small">Aqui a IA <b>sugere</b> quais temas mais caem. São <b>estimativas conforme a pesquisa — confira antes de aplicar</b> (o Mentor sugere, você decide). Para o <b>melhor resultado</b>, importe suas <b>provas anteriores</b> em Questões ▸ "De uma prova anterior".</p>
    <div class="barra-acoes" style="margin-bottom:6px">
      <button class="btn ${nProvas ? "btn-primary" : "btn-ghost"} btn-sm" data-action="sug-provas" ${carregando || !nProvas ? "disabled" : ""} data-tip="${nProvas ? `Analisa as ${nProvas} questões das suas provas importadas (incidência real).` : "Importe provas anteriores para usar esta opção."}">${carregando === "provas" ? "Analisando…" : `Pelas minhas provas (${nProvas})`}</button>
      <button class="btn btn-ghost btn-sm" data-action="sug-web" ${carregando ? "disabled" : ""} data-tip="Pesquisa na web o 'raio-x' da banca/cargo${alvo ? ` (${esc(alvo)})` : ""} e estima a relevância, com fontes.">${carregando === "web" ? "Pesquisando…" : "Pesquisar na web"}</button>
    </div>
    ${!nProvas ? `<p class="muted small" style="margin:0 0 4px">${icone("bar-chart-3")} Você ainda não importou provas — a opção pelas suas provas (a mais confiável) aparece depois da primeira importação.</p>` : ""}
    ${rel ? sugResultadoHTML(!!store.coberturaOficial(), rel) : ""}
  </div>`;
}
function sugResultadoHTML(temOficial, r) {
  if (!r.itens.length) {
    return `<div class="muted small" style="margin-top:10px">A pesquisa não retornou sugestões aplicáveis aos seus tópicos.${r.fonte === "web" ? " Defina a banca e o cargo do concurso para melhorar a busca." : ""}</div>`;
  }
  const cabec =
    r.fonte === "provas"
      ? `Pelas suas provas: ${plural(r.itens.length, "tópico", "tópicos")} com questões (de ${r.total} analisadas). A relevância é a participação na prova.`
      : `Pela web: estimativa de relevância por tópico — confira nas fontes abaixo.`;
  const linhas = r.itens
    .map((it, i) => {
      const sobe = it.pesoSugerido > (it.atual || 0);
      return `<li class="sug-item">
        <input type="checkbox" class="sug-cb" data-i="${i}" ${sobe ? "checked" : ""} />
        <span class="sug-nome">${esc(it.nome)}</span>
        <span class="sug-mud"><span class="muted small">${it.atual ? it.atual + "%" : "—"}</span> → <b>${it.pesoSugerido}%</b></span>
        ${it.n != null ? `<span class="muted small">${it.n} ${it.n === 1 ? "questão" : "questões"}</span>` : ""}
        ${it.confianca ? `<span class="mini-tag">confiança ${esc(it.confianca)}</span>` : ""}
      </li>`;
    })
    .join("");
  const fontes =
    r.fonte === "web" && r.fontesWeb && r.fontesWeb.length
      ? `<div class="sug-fontes muted small">${icone("globe")} Fontes: ${r.fontesWeb.map((f) => `<a href="${esc(f.uri)}" target="_blank" rel="noopener">${esc(f.titulo)} ↗</a>`).join(" · ")}</div>`
      : "";
  return `<div class="sug-resultado">
    <div class="muted small" style="margin:10px 0 6px">${cabec} Marcadas as que aumentam a relevância:</div>
    <ul class="sug-lista">${linhas}</ul>
    ${fontes}
    ${temOficial ? `<label class="inline small" style="margin:6px 0"><input type="checkbox" id="sug-dividir" /> ${icone("scale")} Dividir a relevância entre tópicos do <b>mesmo item do edital</b> (quando um item virou vários tópicos — evita inflar a soma)</label>` : ""}
    <div class="form-acoes" style="justify-content:flex-start">
      <button class="btn btn-primary btn-sm" data-action="sug-aplicar">Aplicar relevância aos selecionados</button>
      ${r.fonte === "web" ? `<button class="btn btn-ghost btn-sm" data-action="sug-imprimir" data-tip="Gera um documento com a tabela, o detalhamento e as fontes — imprima ou salve em PDF.">${icone("printer")} Imprimir / salvar PDF da pesquisa</button>` : ""}
    </div>
  </div>`;
}
// Documento imprimível (→ PDF pelo navegador) com o resumo da pesquisa de relevância.
function printSugRel(r) {
  const linhas = r.itens
    .map((it) => `<tr><td>${esc(it.nome)}</td><td style="text-align:right">${it.pesoSugerido}%</td><td>${it.confianca ? esc(it.confianca) : "—"}</td></tr>`)
    .join("");
  const tabela = `<table class="tabela"><thead><tr><th>Tópico</th><th style="text-align:right">Relevância estimada</th><th>Confiança</th></tr></thead><tbody>${linhas}</tbody></table>`;
  const fontes = (r.fontesWeb || []).length
    ? `<ul>${r.fontesWeb.map((f) => `<li><a href="${esc(f.uri)}">${esc(f.titulo)}</a></li>`).join("")}</ul>`
    : "<p>—</p>";
  const detalhe = r.resumo ? `<h2>Detalhamento</h2><div class="print-prosa">${esc(r.resumo).replace(/\n+/g, "<br>")}</div>` : "";
  return `
    <p class="print-meta">${r.alvo ? esc(r.alvo) + " · " : ""}Pesquisa de relevância (web)</p>
    <p><i>Estas são <b>estimativas</b> obtidas por pesquisa na web — confira antes de usar. Para o resultado mais confiável, baseie-se nas suas provas anteriores importadas. As fontes abaixo são <b>referências</b> para conferência; o app não copia o conteúdo delas.</i></p>
    <h2>Relevância estimada por tópico</h2>
    ${tabela}
    ${detalhe}
    <h2>Fontes consultadas</h2>
    ${fontes}`;
}

// Painel "Conferir contra o edital oficial" (Fase 3): cola o edital da banca → checklist +
// relatório de lacunas/extras + cobertura dupla. Não altera a estrutura de estudo.
function oficialHTML(store, recolar = false, diff = null) {
  const st = store.get();
  const r = store.coberturaOficial();
  const nomeDe = (t) => {
    const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
    return (d ? d.nome + " · " : "") + t.nome;
  };
  const opcoesTop = st.topicos.map((t) => `<option value="${t.id}">${esc(nomeDe(t))}</option>`).join("");
  // Fase 5: re-reconciliação (diff) — quando há checklist e o usuário re-colou um novo edital.
  if (r && diff) return oficialDiffHTML(diff);
  if (r && recolar) {
    return `<div class="card oficial-card">
      <h3>${icone("clipboard-list")} Revalidar o checklist da banca (ver o que mudou)</h3>
      <p class="muted small">Cole o <b>novo edital</b> (ex.: uma retificação da banca). O app vai te mostrar o <b>que mudou</b> em relação ao atual — <b>itens novos</b>, <b>removidos</b> e possíveis <b>renomeações</b> — e você confirma. As renomeações viram <b>sinônimos</b>, então a cobertura que você já tem é preservada.</p>
      <label class="btn btn-ghost btn-sm btn-file" style="margin-bottom:8px" data-tip="PDF ou .txt.">${icone("paperclip")} Importar de arquivo<input id="oficial-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden /></label>
      <textarea id="oficial-texto" rows="6" placeholder="Cole o novo edital da banca…"></textarea>
      <div class="form-acoes"><button class="btn btn-ghost" data-action="oficial-recolar-cancelar">Cancelar</button><button class="btn btn-primary" data-action="oficial-conferir-mudancas">Conferir o que mudou</button></div>
    </div>`;
  }
  if (!r) {
    return `<div class="card oficial-card oficial-card-mini">
      <div class="plano-h"><h2>Checklist da banca</h2><span class="muted small">opcional</span></div>
      <p class="muted small">Tem o <b>edital da banca</b>? Cole abaixo para <b>validar a sua cobertura</b> (o que o seu edital já cobre e o que ficou de fora). <b>Não muda a sua estrutura</b>; é só uma conferência. O casamento é pelo nome + sinônimos () de cada tópico.</p>
      <label class="btn btn-ghost btn-sm btn-file" style="margin-bottom:8px" data-tip="Importar de PDF ou .txt. Pode arrastar o arquivo aqui.">${icone("paperclip")} Importar de arquivo<input id="oficial-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden /></label>
      <textarea id="oficial-texto" rows="5" placeholder="Cole o edital da banca (uma disciplina em MAIÚSCULAS ou terminada em ':', e os itens nas linhas/';' seguintes)…"></textarea>
      <div class="form-acoes"><button class="btn btn-ghost" data-action="toggle-oficial">Cancelar</button><button class="btn btn-primary" data-action="conferir-oficial">Validar cobertura</button></div>
    </div>`;
  }
  const corPct = r.pct >= 70 ? "var(--success)" : r.pct >= 40 ? "var(--warn)" : "var(--danger)";
  const lacunas = r.lacunas
    .map((l) => `<li class="oficial-lac">
        <span class="oficial-ref">${icone("triangle-alert")} ${esc(l.ref)}${l.disciplina ? ` <span class="muted small">(${esc(l.disciplina)})</span>` : ""}</span>
        <span class="spacer"></span>
        <select class="oficial-vinc" data-item="${l.id}"><option value="">— vincular a um tópico seu —</option>${opcoesTop}</select>
        <button class="lnk" data-action="oficial-dispensar" data-item="${l.id}" data-tip="Marcar como não aplicável (some das lacunas).">dispensar</button>
      </li>`)
    .join("");
  const extras = r.extras.length
    ? `<div class="muted small" style="margin-top:10px">${icone("plus")} <b>Extras</b> — seus tópicos que não casam com nenhum item oficial (aprofundamento, ou nome diferente; se for o caso, adicione um sinônimo): ${r.extras.map((t) => esc(t.nome)).join(" · ")}</div>`
    : "";
  return `<div class="card oficial-card">
    <div class="plano-h"><h2>Checklist da banca</h2></div>
    <p class="muted small">Você estuda pelo <b>seu edital</b>; aqui o app valida a cobertura contra o edital da banca. Resolva uma lacuna <b>vinculando</b> a um tópico seu (vira sinônimo) ou crie os tópicos faltantes.</p>
    <div class="oficial-kpis">
      <span class="painel-num"><b class="num" style="color:${corPct}">${r.pct}%</b><span>cobertura</span></span>
      <span class="painel-num"><b class="num">${r.cobertos}</b><span>cobertos</span></span>
      <span class="painel-num"><b class="num">${r.lacunas.length}</b><span>lacunas</span></span>
      <span class="painel-num"><b class="num">${r.extras.length}</b><span>extras</span></span>
    </div>
    ${r.multi ? `<p class="muted small" style="margin:0 0 8px">${icone("shuffle")} <b>${r.multi} ${r.multi === 1 ? "item" : "itens"}</b> do edital ${r.multi === 1 ? "está dividido" : "estão divididos"} em <b>vários tópicos</b> seus — a relevância/incidência desse item é <b>compartilhada</b> entre eles (não some nem é contada em dobro). Ao aplicar relevância, dá para <b>dividir</b> entre os tópicos do mesmo item.</p>` : ""}
    ${
      r.lacunas.length
        ? `<div class="oficial-acoes"><button class="btn btn-primary btn-sm" data-action="oficial-criar-lacunas">${icone("plus")} Criar tópicos para as ${plural(r.lacunas.length, "lacuna", "lacunas")}</button></div>
           <ul class="oficial-lista">${lacunas}</ul>`
        : `<p class="muted small" style="margin:8px 0 0">${icone("check")} Nenhuma lacuna — todos os itens oficiais têm um tópico seu.</p>`
    }
    ${extras}
    ${r.ignorados ? `<p class="muted small" style="margin-top:6px">${plural(r.ignorados, "item dispensado", "itens dispensados")}.</p>` : ""}
    <div class="form-acoes"><button class="btn btn-ghost btn-sm" data-action="oficial-recolar" data-tip="Colar um edital novo/retificado e ver o que mudou (preserva o que você já mapeou).">${icone("repeat-2")} Revalidar (edital novo)</button><button class="btn btn-ghost btn-sm lnk-danger" data-action="limpar-oficial">Limpar checklist</button></div>
  </div>`;
}
// Relatório do DIFF (Fase 5): o que mudou entre o checklist atual e o novo edital colado.
function oficialDiffHTML(d) {
  const lista = (arr, ico) => arr.length ? `<ul class="oficial-lista">${arr.map((i) => `<li class="oficial-lac"><span class="oficial-ref">${ico} ${esc(i.ref)}${i.disciplina ? ` <span class="muted small">(${esc(i.disciplina)})</span>` : ""}</span></li>`).join("")}</ul>` : `<p class="muted small" style="margin:2px 0 8px">— nenhum —</p>`;
  const renoms = d.renomeacoes.length
    ? `<div class="muted small" style="margin:10px 0 4px">${icone("repeat-2")} <b>Possíveis renomeações</b> (o nome antigo vira sinônimo do tópico, preservando a cobertura):</div>
       <ul class="oficial-lista">${d.renomeacoes.map((rn, i) => `<li class="oficial-lac"><input type="checkbox" class="renom-cb" data-i="${i}" ${rn.topicoId ? "checked" : ""} /> <span class="oficial-ref"><b>${esc(rn.de)}</b> → <b>${esc(rn.para)}</b>${rn.topicoId ? "" : ` <span class="muted small">(sem tópico vinculado — não cria sinônimo)</span>`}</span></li>`).join("")}</ul>`
    : "";
  return `<div class="card oficial-card">
    <h3>${icone("repeat-2")} O que mudou no edital</h3>
    <p class="muted small">Compare com o checklist atual e confirme. <b>${d.mantidos}</b> ${d.mantidos === 1 ? "item segue igual" : "itens seguem iguais"}.</p>
    <div class="muted small" style="margin:6px 0 2px">${icone("plus")} <b>Novos</b> (${d.novos.length}) — passam a ser conferidos (viram lacuna se não tiver tópico):</div>
    ${lista(d.novos, icone("plus"))}
    <div class="muted small" style="margin:6px 0 2px">${icone("minus")} <b>Removidos</b> (${d.removidos.length}) — saem do checklist (seu tópico vira "extra"):</div>
    ${lista(d.removidos, icone("minus"))}
    ${renoms}
    <div class="form-acoes"><button class="btn btn-ghost" data-action="oficial-cancelar-diff">Cancelar</button><button class="btn btn-primary" data-action="oficial-aplicar-diff">Aplicar mudanças</button></div>
  </div>`;
}

// ---- Fase 4: Plano do cursinho (aulas) ----
// Parser dedicado das aulas: "Nome da aula: t1; t2; t3" por linha (nome antes do 1º ":",
// assuntos depois, separados por ;). Aceita também "Nome:" sozinho + assuntos nas linhas
// seguintes. Linha sem ":" e sem aula atual vira o nome de uma aula.
function parseAulas(texto) {
  const linhas = String(texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const aulas = [];
  let atual = null;
  let disciplinaAtual = null;
  // Separa assuntos por ". " (frase, seguida de Maiúscula — evita decimais/abreviações), ';',
  // bullets e numeração. Subtópicos com ':' e vírgulas ("Classes de palavras: a, b") ficam juntos.
  const split = (s) =>
    String(s)
      .split(/\.\s+(?=[A-ZÀ-Ý])|[;•·]|(?:\s\d+[).]\s)/)
      .map((x) => x.replace(/^[-•·\s]+/, "").replace(/[.;:\s]+$/, "").trim())
      .filter(Boolean);
  for (const l of linhas) {
    // Cabeçalho de disciplina: "DISCIPLINA: Nome" / "Disciplina - Nome" → muda o contexto, não vira aula.
    const mDisc = l.match(/^disciplina\s*[:\-–]\s*(.+)$/i);
    if (mDisc) { disciplinaAtual = mDisc[1].trim(); continue; }
    const i = l.indexOf(":");
    if (i > 0) {
      const resto = l.slice(i + 1).trim();
      atual = { nome: l.slice(0, i).trim(), topicos: resto ? split(resto) : [], disciplina: disciplinaAtual };
      aulas.push(atual);
    } else if (atual) {
      atual.topicos.push(...split(l));
    } else {
      atual = { nome: l, topicos: [], disciplina: disciplinaAtual };
      aulas.push(atual);
    }
  }
  return aulas.filter((a) => a.nome);
}
// Convite compacto quando AINDA não há aulas: o plano do cursinho é opcional.
// Reusa a ação "importar-aulas-mais" (abre o importador completo) — sem novo handler.
function aulasConviteHTML() {
  return `<div class="card cursinho-card cursinho-convite">
    <div class="plano-h"><h2>Plano do cursinho</h2><span class="muted small">opcional</span></div>
    <p class="muted small">Faz um <b>cursinho</b> e quer estudar pela <b>ordem das aulas</b>? Cole a divisão de aulas e o app monta o mapa <b>aula ↔ tópico ↔ edital</b>. <b>Não muda a sua estrutura</b>; é uma visão paralela. Sem isso, você segue normalmente pelo seu edital.</p>
    <div class="form-acoes" style="justify-content:flex-start"><button class="btn btn-primary" data-action="importar-aulas-mais">${icone("download")} Trazer a divisão do cursinho</button></div>
  </div>`;
}
function aulasImportHTML(texto = "") {
  return `<div class="card cursinho-card">
    <h3>${icone("library")} Trazer a divisão do cursinho</h3>
    <p class="muted small">Cole a <b>divisão de aulas do seu cursinho</b> — uma aula por bloco, com os assuntos que ela cobre. O app liga cada assunto aos <b>seus tópicos</b> (pelo nome + sinônimos) e monta o mapa <b>aula ↔ tópico ↔ edital</b>. <b>Não muda a sua estrutura</b>; é uma visão por aula.</p>
    <label class="btn btn-ghost btn-sm btn-file" style="margin-bottom:8px" data-tip="PDF ou .txt. Pode arrastar aqui.">${icone("paperclip")} Importar de arquivo<input id="aulas-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden /></label>
    <textarea id="aulas-texto" rows="6" placeholder="${esc("Ex.:\nAula 1: Princípios fundamentais; Direitos e garantias fundamentais\nAula 2: Atos administrativos\nAula 3: Atos administrativos; Poderes administrativos")}">${esc(texto)}</textarea>
    <p class="muted small" style="margin:6px 0 0">Cada <b>aula</b> é uma linha começando pelo nome (ex.: "Aula 1:") + os assuntos separados por "<b>;</b>". (Também aceita o nome da aula numa linha e os assuntos nas linhas seguintes.) Você revisa e edita antes de montar.</p>
    <div class="form-acoes"><button class="btn btn-ghost" data-action="importar-aulas-fechar">Cancelar</button><button class="btn btn-primary" data-action="importar-aulas">Revisar</button></div>
  </div>`;
}

// Preview EDITÁVEL do edital colado: cada disciplina é um card com nome editável + lista de
// tópicos editáveis/removíveis (＋ tópico) + remover disciplina. Voltar / descartar / aplicar.
// Painel de adicionar ao edital (digitar/colar/importar). `texto` preserva o que foi
// colado ao voltar do preview. Usado dentro da janela modal (abrirAddEdital).
function addDiscPanelHTML(texto = "") {
  return `<div class="card">
    <h3>Adicionar ao edital</h3>
    <p class="muted small" style="margin:0 0 8px">Digite <b>ou</b> cole aqui — funciona dos dois jeitos. Para criar só <b>uma disciplina</b>, escreva o nome dela (uma linha). Para vários itens, <b>cole o edital</b>: uma <b>disciplina</b> é uma linha em MAIÚSCULAS ou terminada em "<b>:</b>", e as linhas seguintes (ou itens separados por "<b>;</b>") viram os <b>tópicos</b> dela. Você revisa e edita tudo antes de aplicar. Você também pode importar um arquivo.</p>
    <label class="btn btn-ghost btn-sm btn-file" style="margin-bottom:8px" data-tip="Importar de um PDF ou .txt. Você também pode arrastar o arquivo aqui.">${icone("paperclip")} Importar de arquivo
      <input id="ed-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden />
    </label>
    <textarea id="ed-texto" rows="7" placeholder="Ex.: uma disciplina (uma linha):&#10;Direito Previdenciário&#10;&#10;Ou o edital completo:&#10;DIREITO CONSTITUCIONAL&#10;Princípios fundamentais; Direitos e garantias fundamentais&#10;Organização do Estado&#10;&#10;DIREITO ADMINISTRATIVO:&#10;Atos administrativos; Licitações; Servidores públicos">${esc(texto)}</textarea>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="cancelar-add-disc">Fechar</button>
      <button class="btn btn-primary" data-action="separar">Revisar</button>
    </div>
  </div>`;
}

function editalPreviewHTML(discs) {
  const totTop = discs.reduce((a, d) => a + (d.topicos || []).length, 0);
  return `<div class="card">
    <div class="plano-h"><h2>Revisar ${plural(discs.length, "disciplina", "disciplinas")} e ${plural(totTop, "tópico", "tópicos")} antes de aplicar</h2></div>
    <p class="muted small" style="margin:0 0 8px">Edite os nomes, remova (✕) o que não quiser e acrescente tópicos. Só o que estiver aqui será criado.</p>
    <div style="margin:0 0 10px"><button class="btn btn-ghost btn-sm" data-action="estruturar-edital-ia" data-tip="Reorganiza o edital com a IA — útil quando o texto veio bagunçado (OCR, 2 colunas, numeração). Não inventa tópicos.">${icone("sparkles")} Estruturar com IA</button> <span class="muted small">use se a separação automática não ficou boa</span></div>
    <div class="ed-prev-lista">
      ${discs
        .map((d, di) => {
          return `<div class="prev-card m-material ed-prev-disc">
            <div class="prev-card-l1">
              <input class="prev-inp ed-disc-nome" data-d="${di}" value="${esc(d.nome || "")}" placeholder="DISCIPLINA" />
              <button class="prev-remover" data-action="remover-ed-disc" data-d="${di}" data-tip-pos="cima-dir" data-tip="Remover esta disciplina e seus tópicos">${icone("x")}</button>
            </div>
            <ul class="ed-prev-tops">
              ${(d.topicos || [])
                .map((t, ti) => `<li class="ed-prev-top">
                  <input class="prev-inp ed-top-nome" data-d="${di}" data-t="${ti}" value="${esc(t || "")}" placeholder="Tópico" />
                  <button class="prev-remover" data-action="remover-ed-top" data-d="${di}" data-t="${ti}" data-tip-pos="cima-dir" data-tip="Remover este tópico">${icone("x")}</button>
                </li>`)
                .join("")}
            </ul>
            <button class="lnk ed-prev-addtop" data-action="add-ed-top" data-d="${di}">${icone("plus")} tópico</button>
          </div>`;
        })
        .join("")}
    </div>
    <button class="lnk" data-action="add-ed-disc" style="margin-top:8px">${icone("plus")} disciplina</button>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="voltar-ed" data-tip-pos="cima-esq" data-tip="Volta ao texto colado para corrigir e revisar de novo.">${icone("arrow-left")} Voltar para editar</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-action="descartar-ed">Descartar</button>
      <button class="btn btn-primary" data-action="aceitar-ed">Aplicar ao edital</button>
    </div>
  </div>`;
}

// Janela modal "Adicionar ao edital" — fluxo stateful (digitar/colar/importar → preview
// editável → aplicar) com render-loop próprio (abrirJanelaFluxo).
function abrirAddEdital(app) {
  const { store } = app;
  const estado = { preview: null, texto: "" };
  abrirJanelaFluxo({
    titulo: "Adicionar ao edital",
    render: (corpo, { rerender }) => {
      if (estado.preview) {
        corpo.innerHTML = editalPreviewHTML(estado.preview);
        corpo.querySelectorAll(".ed-disc-nome").forEach((el) =>
          el.addEventListener("input", () => { const d = +el.getAttribute("data-d"); if (estado.preview[d]) estado.preview[d].nome = el.value; }));
        corpo.querySelectorAll(".ed-top-nome").forEach((el) =>
          el.addEventListener("input", () => { const d = +el.getAttribute("data-d"); const t = +el.getAttribute("data-t"); if (estado.preview[d] && estado.preview[d].topicos) estado.preview[d].topicos[t] = el.value; }));
        return;
      }
      corpo.innerHTML = addDiscPanelHTML(estado.texto);
      const fileInput = corpo.querySelector("#ed-file");
      if (!fileInput) return;
      ligarDropZone(fileInput);
      const preencheCaixa = (texto) => { const ta = corpo.querySelector("#ed-texto"); if (ta) ta.value = texto || ""; estado.texto = texto || ""; };
      fileInput.addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const cfg = store.get().config;
        const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
        const comIA = store.iaDisponivel() && cfg.iaProvider === "gemini" && ehPdf && f.size <= 14 * 1024 * 1024;
        if (comIA) {
          toast("Lendo e organizando o edital com a IA… (PDF grande pode levar 1–2 min)");
          try {
            const dataB64 = await arquivoParaBase64(f);
            const ds = await store.estruturarEditalDePDF(dataB64, f.type || "application/pdf");
            if (ds && ds.length) {
              estado.preview = ds;
              const tot = ds.reduce((a, d) => a + d.topicos.length, 0);
              toast(`${plural(ds.length, "disciplina", "disciplinas")} e ${plural(tot, "tópico", "tópicos")} organizados pela IA. Revise e aplique.`, "ok");
              rerender();
              return;
            }
            toast("A IA não retornou estrutura. Tentando extrair o texto para você revisar…", "erro");
          } catch (err) { try { console.error(err); } catch (_) {} toast("A IA não conseguiu ler o edital agora (instável?). Extraindo o texto para revisão…", "erro"); }
          try {
            const texto = await lerArquivoTexto(f, null, "");
            preencheCaixa(texto);
            if (texto && texto.trim()) toast("Texto extraído. Clique em 'Revisar'.", "ok");
            else toast("Não consegui ler o edital agora. Tente de novo em instantes ou cole o texto.", "erro");
          } catch (_) { toast("Não consegui ler o arquivo. Cole o texto.", "erro"); }
          return;
        }
        try {
          const texto = await lerArquivoTexto(f, cfg, "");
          preencheCaixa(texto);
          if (texto && texto.trim()) toast("Texto carregado. Clique em 'Revisar'.");
          else toast(ehPdf ? "PDF escaneado (imagem): conecte a IA (Gemini) em Configurações para extrair com OCR, ou cole o texto." : "Sem texto reconhecido. Cole manualmente.", "erro");
        } catch (err) { try { console.error(err); } catch (_) {} toast("Não consegui ler o arquivo. Cole o texto.", "erro"); }
      });
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "cancelar-add-disc": () => fechar(),
      // "Revisar": separa o edital e abre o PREVIEW editável (não grava ainda).
      separar: () => {
        const texto = corpo.querySelector("#ed-texto").value;
        if (!texto.trim()) return toast("Digite uma disciplina ou cole o texto do edital.", "erro");
        const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const estrutura = linhas.length === 1 && !/[;:]/.test(linhas[0])
          ? [{ nome: linhas[0], topicos: [] }]
          : separarEdital(texto).map((d) => ({ nome: d.nome || "", topicos: [...(d.topicos || [])] }));
        const total = estrutura.reduce((a, d) => a + d.topicos.length, 0);
        if (!estrutura.length || (!total && estrutura.every((d) => !d.nome))) return toast("Não consegui identificar disciplinas nem tópicos. Confira o texto.", "erro");
        estado.texto = texto;
        estado.preview = estrutura;
        rerender();
      },
      // Reestrutura o edital com IA (formatos bagunçados: OCR, 2 colunas, numerado).
      "estruturar-edital-ia": async (el) => {
        if (!store.iaDisponivel()) return avisoIA(app, "Estruturar edital com IA");
        const texto = estado.texto || corpo.querySelector("#ed-texto")?.value || "";
        if (!texto.trim()) return toast("Não há texto do edital para estruturar.", "erro");
        el.disabled = true; el.textContent = "Estruturando…";
        try {
          const ds = await store.estruturarEditalIA(texto);
          if (ds && ds.length) { estado.texto = texto; estado.preview = ds; toast(`${plural(ds.length, "disciplina estruturada", "disciplinas estruturadas")} pela IA. Revise e aplique.`, "ok"); rerender(); }
          else { toast("A IA não retornou uma estrutura. Mantive a versão atual.", "erro"); el.disabled = false; el.textContent = "Estruturar com IA"; }
        } catch (e) { console.error(e); toast("A IA não conseguiu estruturar agora (servidor ocupado?). Tente de novo em instantes.", "erro"); el.disabled = false; el.textContent = "Estruturar com IA"; }
      },
      "remover-ed-disc": (el) => {
        const d = parseInt(el.getAttribute("data-d"), 10);
        if (estado.preview) estado.preview.splice(d, 1);
        if (estado.preview && !estado.preview.length) estado.preview = null;
        rerender();
      },
      "remover-ed-top": (el) => {
        const d = parseInt(el.getAttribute("data-d"), 10); const t = parseInt(el.getAttribute("data-t"), 10);
        if (estado.preview && estado.preview[d]) estado.preview[d].topicos.splice(t, 1);
        rerender();
      },
      "add-ed-top": (el) => {
        const d = parseInt(el.getAttribute("data-d"), 10);
        if (estado.preview && estado.preview[d]) estado.preview[d].topicos.push("");
        rerender();
      },
      "add-ed-disc": () => { if (estado.preview) estado.preview.push({ nome: "", topicos: [] }); rerender(); },
      "voltar-ed": () => { estado.preview = null; rerender(); },
      "descartar-ed": () => fechar(),
      "aceitar-ed": async () => {
        const estrutura = (estado.preview || [])
          .map((d) => ({ nome: (d.nome || "").trim(), topicos: (d.topicos || []).map((t) => (t || "").trim()).filter(Boolean) }))
          .filter((d) => d.nome || d.topicos.length);
        if (!estrutura.length) return toast("Nada para acrescentar.", "erro");
        let modo = "pular";
        const dup = store.analisarEditalDup(estrutura);
        if (dup.repetidos > 0) {
          const escolha = await escolher(`${plural(dup.repetidos, "tópico desta importação já existe", "tópicos desta importação já existem")} no edital. O que você quer fazer?`, [
            { label: "Pular os repetidos", value: "pular", cls: "btn-primary" },
            { label: "Adicionar mesmo assim", value: "duplicar" },
            { label: "Cancelar", value: "cancelar" },
          ]);
          if (!escolha || escolha === "cancelar") return;
          modo = escolha;
        }
        const r = store.aplicarEdital(estrutura, modo);
        toast(`${plural(r.disciplinas, "disciplina", "disciplinas")} e ${plural(r.topicos, "tópico", "tópicos")} acrescentados${r.pulados ? ` · ${plural(r.pulados, "repetido pulado", "repetidos pulados")}` : ""}.`);
        fechar();
        app.refresh();
      },
    }),
  });
}

// Preview EDITÁVEL das aulas do cursinho: cada aula é um card com nome + assuntos editáveis.
function aulasPreviewHTML(aulas) {
  return `<div class="card cursinho-card">
    <div class="plano-h"><h2>Revisar ${plural(aulas.length, "aula", "aulas")} antes de montar o plano</h2></div>
    <p class="muted small" style="margin:0 0 10px">Edite o nome da aula e os assuntos; remova (✕) o que não quiser. Os assuntos serão ligados aos seus tópicos pelo nome (＋ sinônimos).</p>
    <div class="ed-prev-lista">
      ${aulas
        .map((a, ai) => {
          return `<div class="prev-card m-pratica ed-prev-disc">
            <div class="prev-card-l1">
              <input class="prev-inp aula-nome" data-a="${ai}" value="${esc(a.nome || "")}" placeholder="Aula" />
              <button class="prev-remover" data-action="remover-aula-prev" data-a="${ai}" data-tip-pos="cima-dir" data-tip="Remover esta aula">${icone("x")}</button>
            </div>
            <ul class="ed-prev-tops">
              ${(a.topicos || [])
                .map((t, ti) => `<li class="ed-prev-top">
                  <input class="prev-inp aula-top" data-a="${ai}" data-t="${ti}" value="${esc(t || "")}" placeholder="Assunto" />
                  <button class="prev-remover" data-action="remover-aula-top" data-a="${ai}" data-t="${ti}" data-tip-pos="cima-dir" data-tip="Remover este assunto">${icone("x")}</button>
                </li>`)
                .join("")}
            </ul>
            <button class="lnk ed-prev-addtop" data-action="add-aula-top" data-a="${ai}">${icone("plus")} assunto</button>
          </div>`;
        })
        .join("")}
    </div>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="voltar-aulas" data-tip-pos="cima-esq" data-tip="Volta ao texto colado para corrigir e revisar de novo.">${icone("arrow-left")} Voltar para editar</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-action="descartar-aulas">Descartar</button>
      <button class="btn btn-primary" data-action="aceitar-aulas">Montar plano do cursinho</button>
    </div>
  </div>`;
}
// Janela modal "Trazer a divisão do cursinho" — fluxo stateful (digitar/colar/importar
// → preview editável de aulas → montar plano) com render-loop próprio (abrirJanelaFluxo).
// Usa estado LOCAL (não toca nos globais aulasPreview/aulasTextoSalvo, que ainda servem
// o caminho inline de recolar/diff via arquivo).
function abrirImportarAulas(app) {
  const { store } = app;
  const estado = { preview: null, texto: "" };
  abrirJanelaFluxo({
    titulo: "Trazer a divisão do cursinho",
    render: (corpo, { rerender }) => {
      if (estado.preview) {
        corpo.innerHTML = aulasPreviewHTML(estado.preview);
        corpo.querySelectorAll(".aula-nome").forEach((el) =>
          el.addEventListener("input", () => { const a = +el.getAttribute("data-a"); if (estado.preview[a]) estado.preview[a].nome = el.value; }));
        corpo.querySelectorAll(".aula-top").forEach((el) =>
          el.addEventListener("input", () => { const a = +el.getAttribute("data-a"); const t = +el.getAttribute("data-t"); if (estado.preview[a] && estado.preview[a].topicos) estado.preview[a].topicos[t] = el.value; }));
        return;
      }
      corpo.innerHTML = aulasImportHTML(estado.texto);
      const aulasFile = corpo.querySelector("#aulas-file");
      if (!aulasFile) return;
      ligarDropZone(aulasFile);
      const preenche = (texto) => { const ta = corpo.querySelector("#aulas-texto"); if (ta) ta.value = texto || ""; estado.texto = texto || ""; };
      aulasFile.addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const cfg = store.get().config;
        const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
        const comIA = store.iaDisponivel() && cfg.iaProvider === "gemini" && ehPdf && f.size <= 14 * 1024 * 1024;
        if (comIA) {
          toast("Lendo o plano do cursinho com a IA… (pode levar 1–2 min)");
          try {
            const dataB64 = await arquivoParaBase64(f);
            const aulas = await store.estruturarAulasDePDF(dataB64, f.type || "application/pdf");
            if (aulas && aulas.length) {
              estado.preview = aulas;
              const tot = aulas.reduce((a, x) => a + x.topicos.length, 0);
              toast(`${plural(aulas.length, "aula", "aulas")} e ${plural(tot, "assunto", "assuntos")} lidos pela IA. Revise e monte o plano.`, "ok");
              rerender();
              return;
            }
            toast("A IA não reconheceu aulas. Tentando extrair o texto…", "erro");
          } catch (err) { try { console.error(err); } catch (_) {} toast("A IA não conseguiu ler agora (instável?). Extraindo o texto…", "erro"); }
          try {
            const texto = await lerArquivoTexto(f, null, "");
            preenche(texto);
            toast(texto && texto.trim() ? "Texto extraído. Clique em 'Revisar'." : "Não consegui ler agora. Tente de novo ou cole o texto.", texto && texto.trim() ? "ok" : "erro");
          } catch (_) { toast("Não consegui ler o arquivo. Cole o texto.", "erro"); }
          return;
        }
        try {
          const texto = await lerArquivoTexto(f, cfg, "");
          preenche(texto);
          if (texto && texto.trim()) toast("Texto carregado. Clique em 'Revisar'.");
          else toast(ehPdf ? "PDF escaneado (imagem): conecte a IA (Gemini) em Configurações para extrair com OCR, ou cole o texto." : "Sem texto reconhecido. Cole manualmente.", "erro");
        } catch (err) { try { console.error(err); } catch (_) {} toast("Não consegui ler o arquivo. Cole o texto.", "erro"); }
      });
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "importar-aulas-fechar": () => fechar(),
      // "Revisar": parseia as aulas e abre o PREVIEW editável (não grava ainda).
      "importar-aulas": () => {
        const texto = corpo.querySelector("#aulas-texto").value;
        if (!texto.trim()) return toast("Cole a divisão do cursinho.", "erro");
        const estrutura = parseAulas(texto).map((a) => ({ nome: a.nome || "", topicos: [...(a.topicos || [])], disciplina: a.disciplina || null }));
        if (!estrutura.length) return toast("Não reconheci aulas no texto.", "erro");
        estado.texto = texto;
        estado.preview = estrutura;
        rerender();
      },
      "remover-aula-prev": (el) => {
        const a = parseInt(el.getAttribute("data-a"), 10);
        if (estado.preview) estado.preview.splice(a, 1);
        if (estado.preview && !estado.preview.length) estado.preview = null;
        rerender();
      },
      "remover-aula-top": (el) => {
        const a = parseInt(el.getAttribute("data-a"), 10); const t = parseInt(el.getAttribute("data-t"), 10);
        if (estado.preview && estado.preview[a]) estado.preview[a].topicos.splice(t, 1);
        rerender();
      },
      "add-aula-top": (el) => {
        const a = parseInt(el.getAttribute("data-a"), 10);
        if (estado.preview && estado.preview[a]) estado.preview[a].topicos.push("");
        rerender();
      },
      "voltar-aulas": () => { estado.preview = null; rerender(); },
      "descartar-aulas": () => fechar(),
      "aceitar-aulas": () => {
        const estrutura = (estado.preview || [])
          .map((a) => ({ nome: (a.nome || "").trim(), topicos: (a.topicos || []).map((t) => (t || "").trim()).filter(Boolean), disciplina: a.disciplina || null }))
          .filter((a) => a.nome);
        if (!estrutura.length) return toast("Nenhuma aula para criar.", "erro");
        const r = store.importarAulasCursinho(estrutura);
        toast(r.criadas ? `${plural(r.criadas, "aula criada", "aulas criadas")}.${r.naoCasados.length ? ` ${plural(r.naoCasados.length, "assunto não casou", "assuntos não casaram")} com seus tópicos (use sinônimos ou crie os tópicos).` : ""}` : "Não reconheci aulas no texto.", r.criadas ? "ok" : "erro");
        if (r.naoCasados.length) console.info("Assuntos do cursinho não casados:", r.naoCasados);
        fechar();
        app.refresh();
      },
    }),
  });
}

// ===== Sub-fluxos SECUNDÁRIOS do Edital em janela modal =====

// Painel "Temas que mais caem" (corpo só, sem .card — a janela já é o cartão).
function destaquesPanelHTML() {
  return `
    <h3>${icone("star")} Temas que mais caem</h3>
    <p class="muted small">Um tema <b>por linha</b>. Para preencher a <b>relevância sozinho</b>, inclua o percentual (ou número) após "<b>:</b>", "<b>–</b>" ou "<b>-</b>" — ex.: "Atos administrativos: 30%". Sem percentual, o tema fica marcado como <b>"mais cai" (relevante, sem %)</b>. Os temas que casarem com tópicos do edital ficam em destaque, ordenados por incidência.</p>
    <label class="btn btn-ghost btn-sm btn-file" style="margin-bottom:8px" data-tip="Importar de um PDF ou .txt. Você também pode arrastar o arquivo aqui.">${icone("paperclip")} Selecionar arquivo
      <input id="dest-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden />
    </label>
    <textarea id="dest-texto" rows="6" placeholder="Ex.:&#10;Atos administrativos: 30%&#10;Tutela provisória – 25%&#10;Direitos e garantias fundamentais"></textarea>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="cancelar-destaques">Cancelar</button>
      <button class="btn btn-primary" data-action="marcar-destaques">Marcar relevância</button>
    </div>`;
}

// "Importar temas que mais caem" — passo único (colar/importar → marcar). Sem preview.
function abrirDestaques(app) {
  const { store } = app;
  abrirJanela({
    titulo: "Temas que mais caem",
    corpoHTML: destaquesPanelHTML(),
    aoMontar: (overlay, fechar) => {
      const corpo = overlay.querySelector(".mm-corpo");
      const destFile = corpo.querySelector("#dest-file");
      if (destFile) {
        ligarDropZone(destFile);
        ligarImportArquivo(destFile, {
          getCfg: () => store.get().config,
          contexto: "uma lista de temas/assuntos que MAIS CAEM na prova, com o percentual de incidência de cada um quando houver",
          onTexto: (texto) => { const ta = corpo.querySelector("#dest-texto"); if (ta) ta.value = texto; if (texto.trim()) toast("Texto carregado. Clique em 'Marcar relevância'."); },
        });
      }
      bindActions(corpo, {
        "cancelar-destaques": () => fechar(),
        "marcar-destaques": () => {
          const texto = corpo.querySelector("#dest-texto").value;
          if (!texto.trim()) return toast("Cole os temas (um por linha).", "erro");
          const { marcados, naoEncontrados } = store.marcarDestaquesPorTexto(texto);
          if (marcados.length) {
            const top = marcados.slice(0, 3).map((m) => `${m.nome}${m.peso ? ` (${m.peso}%)` : m.maisCai ? " (mais cai)" : ""}`).join(", ");
            toast(`${plural(marcados.length, "tópico marcado como relevante", "tópicos marcados como relevantes")}. Em destaque: ${top}.${naoEncontrados.length ? ` ${naoEncontrados.length} não casou.` : ""}`);
            fechar();
            app.refresh();
          } else {
            toast("Nenhum tópico casou com a lista. Confira os nomes ou adicione os tópicos.", "erro");
          }
          if (naoEncontrados.length) console.info("Temas não encontrados no edital:", naoEncontrados);
        },
      });
    },
  });
}

// "Sugerir por IA (provas/web)" — gerar → revisar (checkboxes) → aplicar. Render-loop.
function abrirSugestaoIA(app) {
  const { store } = app;
  const estado = { carregando: "", rel: null };
  abrirJanelaFluxo({
    titulo: "Sugerir relevância (pesquisa)",
    render: (corpo) => {
      corpo.innerHTML = sugIAHTML(store, estado.carregando, estado.rel);
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "sug-provas": async () => {
        if (!store.iaDisponivel()) return avisoIA(app, "Sugerir relevância pelas provas");
        estado.carregando = "provas"; estado.rel = null; rerender();
        try {
          estado.rel = await store.sugerirRelevanciaPorProvas();
          if (!estado.rel.itens.length) toast("Não consegui derivar relevância das provas. Confira se os tópicos do edital batem com as questões.", "erro");
        } catch (e) { console.error(e); toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro"); }
        estado.carregando = ""; rerender();
      },
      "sug-web": async () => {
        if (!store.iaDisponivel()) return avisoIA(app, "Sugerir relevância pela web");
        estado.carregando = "web"; estado.rel = null; rerender();
        try {
          estado.rel = await store.sugerirRelevanciaPelaWeb();
          if (!estado.rel.itens.length) toast("A pesquisa não trouxe relevâncias aplicáveis. Defina a banca e o cargo para melhorar.", "erro");
        } catch (e) { console.error(e); toast("A pesquisa na web não pôde ser concluída agora. Tente de novo em instantes.", "erro"); }
        estado.carregando = ""; rerender();
      },
      "sug-imprimir": () => {
        if (!estado.rel || !estado.rel.itens.length) return toast("Nada para imprimir.", "erro");
        imprimir(`Pesquisa de relevância${estado.rel.alvo ? " — " + estado.rel.alvo : ""}`, printSugRel(estado.rel));
      },
      "sug-aplicar": () => {
        if (!estado.rel) return;
        let sel = [...corpo.querySelectorAll(".sug-cb:checked")]
          .map((cb) => estado.rel.itens[parseInt(cb.getAttribute("data-i"), 10)])
          .filter(Boolean)
          .map((it) => ({ topicoId: it.topicoId, peso: it.pesoSugerido }));
        if (!sel.length) return toast("Selecione ao menos um tópico.", "erro");
        let dividiu = 0;
        if (corpo.querySelector("#sug-dividir")?.checked) {
          const grupos = {};
          sel.forEach((s) => { const ref = store.itemOficialDoTopico(s.topicoId) || "__" + s.topicoId; (grupos[ref] = grupos[ref] || []).push(s); });
          sel = Object.values(grupos).flatMap((g) => { if (g.length > 1) dividiu += g.length; return g.map((s) => ({ ...s, peso: Math.max(1, Math.round(s.peso / g.length)) })); });
        }
        const n = store.aplicarRelevanciaSugerida(sel);
        toast(`${plural(n, "tópico", "tópicos")} com relevância aplicada${dividiu ? ` (relevância dividida em ${plural(dividiu, "tópico", "tópicos")} de itens compartilhados)` : ""}.`);
        fechar();
        app.refresh();
      },
    }),
  });
}

// "Checklist da banca" — colar edital → cobertura/lacunas → revalidar/diff. Render-loop.
function abrirOficial(app) {
  const { store } = app;
  const estado = { recolar: false, diff: null };
  abrirJanelaFluxo({
    titulo: "Checklist da banca",
    render: (corpo, { rerender }) => {
      corpo.innerHTML = oficialHTML(store, estado.recolar, estado.diff);
      // arquivo (cola na textarea) + vínculo de lacuna a tópico (select change).
      const oficialFile = corpo.querySelector("#oficial-file");
      if (oficialFile) {
        ligarDropZone(oficialFile);
        ligarImportArquivo(oficialFile, {
          getCfg: () => store.get().config,
          contexto: "o conteúdo programático OFICIAL do edital da banca: disciplinas e seus tópicos/assuntos, para conferência de cobertura (ignore partes administrativas)",
          onTexto: (texto) => { const ta = corpo.querySelector("#oficial-texto"); if (ta) ta.value = texto; if (texto.trim()) toast("Texto carregado. Clique em 'Conferir'."); },
        });
      }
      corpo.querySelectorAll(".oficial-vinc").forEach((sel) =>
        sel.addEventListener("change", () => {
          if (sel.value) { store.vincularItemOficialATopico(sel.getAttribute("data-item"), sel.value); toast("Vinculado (virou sinônimo do tópico)."); rerender(); }
        })
      );
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "toggle-oficial": () => fechar(), // botão "Cancelar" no estado inicial (sem checklist)
      "conferir-oficial": () => {
        const texto = corpo.querySelector("#oficial-texto").value;
        if (!texto.trim()) return toast("Cole o edital da banca.", "erro");
        const n = store.definirEditalOficial(separarEdital(texto));
        toast(n ? `${plural(n, "item", "itens")} do checklist da banca ${n === 1 ? "conferido" : "conferidos"}.` : "Não reconheci itens no texto colado.", n ? "ok" : "erro");
        if (n) rerender();
      },
      "oficial-dispensar": (el) => { store.ignorarItemOficial(el.getAttribute("data-item"), true); rerender(); },
      "oficial-criar-lacunas": () => {
        const r = store.coberturaOficial();
        if (!r || !r.lacunas.length) return toast("Sem lacunas.", "erro");
        const res = store.criarTopicosParaLacunas(r.lacunas);
        toast(`${plural(res.topicos || 0, "tópico criado", "tópicos criados")} para as lacunas.`);
        rerender();
      },
      "oficial-recolar": () => { estado.recolar = true; estado.diff = null; rerender(); },
      "oficial-recolar-cancelar": () => { estado.recolar = false; rerender(); },
      "oficial-conferir-mudancas": () => {
        const texto = corpo.querySelector("#oficial-texto").value;
        if (!texto.trim()) return toast("Cole o novo edital.", "erro");
        const diff = store.diffEditalOficial(separarEdital(texto));
        if (!diff.novos.length && !diff.removidos.length) { estado.diff = null; estado.recolar = false; rerender(); return toast("Nenhuma diferença em relação ao edital atual.", "ok"); }
        estado.diff = diff; rerender();
      },
      "oficial-cancelar-diff": () => { estado.diff = null; estado.recolar = false; rerender(); },
      "oficial-aplicar-diff": () => {
        if (!estado.diff) return;
        const renoms = estado.diff.renomeacoes.filter((_, i) => corpo.querySelector(`.renom-cb[data-i="${i}"]`)?.checked);
        const n = store.aplicarEditalOficialDiff(estado.diff.novosItens, renoms);
        toast(`Edital atualizado: ${plural(n, "item", "itens")}${renoms.length ? `, ${plural(renoms.length, "renomeação aplicada", "renomeações aplicadas")}` : ""}.`);
        estado.diff = null; estado.recolar = false; rerender();
      },
      "limpar-oficial": async () => {
        if (await confirmar("Limpar o checklist da banca? (não apaga seus tópicos)")) { store.limparEditalOficial(); rerender(); }
      },
    }),
  });
}

// "Atualizar grade do cursinho" (recolar → diff → aplicar). Render-loop.
function abrirAulasRecolar(app) {
  const { store } = app;
  const estado = { diff: null };
  abrirJanelaFluxo({
    titulo: "Atualizar a grade do cursinho",
    render: (corpo, { rerender }) => {
      corpo.innerHTML = estado.diff ? aulasDiffHTML(estado.diff) : aulasRecolarHTML();
      const aulasFile = corpo.querySelector("#aulas-file");
      if (aulasFile) {
        ligarDropZone(aulasFile);
        aulasFile.addEventListener("change", async (e) => {
          const f = e.target.files && e.target.files[0];
          if (!f) return;
          try {
            const texto = await lerArquivoTexto(f, store.get().config, "");
            const ta = corpo.querySelector("#aulas-texto");
            if (ta) ta.value = texto || "";
            toast(texto && texto.trim() ? "Texto carregado. Clique em 'Conferir o que mudou'." : "Sem texto reconhecido. Cole manualmente.", texto && texto.trim() ? "ok" : "erro");
          } catch (_) { toast("Não consegui ler o arquivo. Cole o texto.", "erro"); }
        });
      }
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "aulas-recolar-cancelar": () => fechar(),
      "aulas-conferir-mudancas": () => {
        const texto = corpo.querySelector("#aulas-texto").value;
        if (!texto.trim()) return toast("Cole a nova grade.", "erro");
        const diff = store.diffAulasCursinho(parseAulas(texto));
        if (!diff.novas.length && !diff.removidas.length) { fechar(); return toast("Nenhuma diferença em relação à grade atual.", "ok"); }
        estado.diff = diff; rerender();
      },
      "aulas-cancelar-diff": () => fechar(),
      "aulas-aplicar-diff": () => {
        if (!estado.diff) return;
        const renomearIds = [...corpo.querySelectorAll(".aula-ren-cb:checked")].map((cb) => cb.getAttribute("data-id"));
        const removerIds = [...corpo.querySelectorAll(".aula-rem-cb:checked")].map((cb) => cb.getAttribute("data-id"));
        const r = store.aplicarAulasDiff(estado.diff, renomearIds, removerIds);
        toast(`Grade atualizada: ${plural(r.add, "nova", "novas")}, ${plural(r.rem, "removida", "removidas")}${r.ren ? `, ${plural(r.ren, "renomeação", "renomeações")}` : ""}.`);
        fechar();
        app.refresh();
      },
    }),
  });
}

function aulasRecolarHTML() {
  return `<div class="card cursinho-card">
    <h3>${icone("repeat-2")} Atualizar a grade do cursinho (ver o que mudou)</h3>
    <p class="muted small">Cole a <b>nova grade</b>. O app compara com as aulas atuais e mostra o que <b>entrou</b>, <b>saiu</b> e possíveis <b>renomeações</b> — as aulas que você já ajustou são <b>preservadas</b>.</p>
    <label class="btn btn-ghost btn-sm btn-file" style="margin-bottom:8px" data-tip="PDF ou .txt.">${icone("paperclip")} Importar de arquivo<input id="aulas-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden /></label>
    <textarea id="aulas-texto" rows="6" placeholder="Cole a nova grade do cursinho…"></textarea>
    <div class="form-acoes"><button class="btn btn-ghost" data-action="aulas-recolar-cancelar">Cancelar</button><button class="btn btn-primary" data-action="aulas-conferir-mudancas">Conferir o que mudou</button></div>
  </div>`;
}
function aulasDiffHTML(d) {
  const novas = d.novas.length
    ? `<ul class="oficial-lista">${d.novas.map((e) => `<li class="oficial-lac"><span class="oficial-ref">${icone("plus")} ${esc(e.nome)} <span class="muted small">(${plural((e.topicos || []).length, "assunto", "assuntos")})</span></span></li>`).join("")}</ul>`
    : `<p class="muted small" style="margin:2px 0 8px">— nenhuma —</p>`;
  const removidas = d.removidas.length
    ? `<ul class="oficial-lista">${d.removidas.map((a) => `<li class="oficial-lac"><input type="checkbox" class="aula-rem-cb" data-id="${a.id}" checked /> <span class="oficial-ref">${icone("minus")} ${esc(a.nome)}</span></li>`).join("")}</ul>`
    : `<p class="muted small" style="margin:2px 0 8px">— nenhuma —</p>`;
  const renoms = d.renomeacoes.length
    ? `<div class="muted small" style="margin:10px 0 4px">${icone("repeat-2")} <b>Possíveis renomeações</b> (mantém os tópicos da aula):</div>
       <ul class="oficial-lista">${d.renomeacoes.map((rn) => `<li class="oficial-lac"><input type="checkbox" class="aula-ren-cb" data-id="${rn.aulaId}" checked /> <span class="oficial-ref"><b>${esc(rn.de)}</b> → <b>${esc(rn.para)}</b></span></li>`).join("")}</ul>`
    : "";
  return `<div class="card cursinho-card">
    <h3>${icone("repeat-2")} O que mudou na grade</h3>
    <div class="muted small" style="margin:6px 0 2px">${icone("plus")} <b>Novas aulas</b> (${d.novas.length}):</div>${novas}
    <div class="muted small" style="margin:6px 0 2px">${icone("minus")} <b>Removidas</b> (${d.removidas.length}) — marque as que quer remover:</div>${removidas}
    ${renoms}
    <div class="form-acoes"><button class="btn btn-ghost" data-action="aulas-cancelar-diff">Cancelar</button><button class="btn btn-primary" data-action="aulas-aplicar-diff">Aplicar mudanças</button></div>
  </div>`;
}
function aulaTopEditorHTML(st, a) {
  const sel = new Set(a.topicoIds || []);
  const grupos = st.disciplinas
    .map((disc) => {
      const tops = st.topicos.filter((t) => t.disciplinaId === disc.id);
      if (!tops.length) return "";
      return `<div class="ft-grupo"><div class="ft-disc"><b>${esc(disc.nome)}</b></div>${tops.map((t) => `<label class="ft-top"><input type="checkbox" class="aula-top-chk" data-aula="${a.id}" value="${t.id}" ${sel.has(t.id) ? "checked" : ""} /> ${esc(t.nome)}</label>`).join("")}</div>`;
    })
    .join("");
  return `<div class="aula-top-editor"><div class="muted small" style="margin:6px 0">${icone("files")} Tópicos que esta aula cobre — marque todos (uma aula pode cobrir vários). Salva na hora.</div>${grupos || `<p class="muted small">Sem tópicos cadastrados.</p>`}<div class="form-acoes"><button class="btn btn-ghost btn-sm" data-action="aula-topicos" data-id="${a.id}">Fechar</button></div></div>`;
}
function aulasListaHTML(store, st) {
  const aulas = st.aulas;
  if (!aulas.length) return "";
  const soltos = store.topicosSoltos();
  const base = st.config.baseEstudo || "edital";
  const nomeDe = (id) => {
    const t = st.topicos.find((x) => x.id === id);
    if (!t) return "?";
    const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
    return (d ? d.nome + " · " : "") + t.nome;
  };
  // Ordem de EXIBIÇÃO (só na tela; não toca no store). "custom" = ordem real do array,
  // na qual o mover ↑/↓ atua. Em "nome"/"topicos" o mover fica desabilitado (a numeração
  // # mostra a posição real para não confundir).
  const nTops = (a) => (a.topicoIds || []).filter((id) => st.topicos.some((t) => t.id === id)).length;
  let display = aulas.map((a, idx) => ({ a, idx }));
  if (aulasSort === "nome") display = [...display].sort((x, y) => x.a.nome.localeCompare(y.a.nome, "pt", { sensitivity: "base" }));
  else if (aulasSort === "topicos") display = [...display].sort((x, y) => nTops(y.a) - nTops(x.a));
  const custom = aulasSort === "custom";
  const discDeAula = (a) => {
    if (a.disciplinaId) { const d = st.disciplinas.find((x) => x.id === a.disciplinaId); if (d) return d.nome; }
    const tps = (a.topicoIds || []).map((id) => st.topicos.find((t) => t.id === id)).filter(Boolean);
    const dids = [...new Set(tps.map((t) => t.disciplinaId).filter(Boolean))];
    if (dids.length === 1) { const d = st.disciplinas.find((x) => x.id === dids[0]); if (d) return d.nome; }
    return a.disciplinaNome || "Sem disciplina";
  };
  const discNomeDe = (t) => { const d = st.disciplinas.find((x) => x.id === t.disciplinaId); return d ? d.nome : ""; };
  // AULA protagonista: nome da aula em cima; os TÓPICOS do edital que ela cobre embaixo
  // (cada um clicável, abre o dossiê). Bolinha com a cor da disciplina; sem títulos de
  // disciplina no meio (lista corrida na ordem das aulas).
  const aulaRow = ({ a, idx }) => {
      const tops = (a.topicoIds || []).map((id) => st.topicos.find((t) => t.id === id)).filter(Boolean);
      const discIds = [...new Set(tops.map((t) => t.disciplinaId).filter(Boolean))];
      const multi = discIds.length > 1;
      const concl = tops.filter((t) => t.concluido).length;
      return `<div class="cur-aula-row" data-drag-id="${a.id}">
        <div class="cur-aula-head">
          <span class="drag-grip" data-tip="Arraste para reordenar" aria-hidden="true">${icone("grip-vertical")}</span>
          <b class="cur-aula-nome">${esc(a.nome)}</b>
          ${multi ? `<span class="mini-tag" data-tip="Esta aula cobre mais de uma disciplina.">${icone("shuffle")} ${discIds.length} disc.</span>` : ""}
          <span class="spacer"></span>
          ${tops.length ? `<span class="cur-prog" data-tip="Tópicos desta aula concluídos.">${concl}/${tops.length}</span>` : ""}
          <button class="lnk cur-edit" data-action="aula-topicos" data-id="${a.id}" data-tip-pos="cima-dir" data-tip="Definir os tópicos desta aula">${icone("square-pen")}</button>
          <details class="doc-mais ed-top-mais">
            <summary class="ed-top-mais-sum" data-tip-pos="cima-dir" data-tip="Mais ações para esta aula.">${icone("ellipsis")}</summary>
            <div class="doc-mais-pop" role="menu">
              <button class="menu-item" data-action="aula-subir" data-id="${a.id}" ${custom && idx > 0 ? "" : "disabled"} ${custom ? "" : `data-tip="Mude a ordenação para 'Como cadastrei' para mover manualmente."`}><span class="menu-ico">${icone("arrow-up")}</span> Subir</button>
              <button class="menu-item" data-action="aula-descer" data-id="${a.id}" ${custom && idx < aulas.length - 1 ? "" : "disabled"} ${custom ? "" : `data-tip="Mude a ordenação para 'Como cadastrei' para mover manualmente."`}><span class="menu-ico">${icone("arrow-down")}</span> Descer</button>
              <button class="menu-item" data-action="aula-renomear" data-id="${a.id}"><span class="menu-ico">${icone("square-pen")}</span> Renomear</button>
              <div class="menu-sep"></div>
              <button class="menu-item menu-item-danger" data-action="aula-remover" data-id="${a.id}"><span class="menu-ico">${icone("x")}</span> Remover aula</button>
            </div>
          </details>
        </div>
        <div class="cur-aula-tops">
          ${tops.length
            ? tops.map((t) => `<button class="cur-top ${t.concluido ? "done" : ""}" data-action="ir-dossie" data-id="${t.id}" data-tip="Abrir o dossiê de ${esc(t.nome)}">${t.concluido ? `<span class="cur-top-chk">${icone("check")}</span>` : ""}${multi ? `<span class="cur-top-disc">${esc(discNomeDe(t))}</span>` : ""}<span class="cur-top-nome">${esc(t.nome)}</span><span class="mapa-abrir-ico">${icone("external-link")}</span></button>`).join("")
            : `<span class="cur-sem muted small">${icone("link")} sem tópico do edital — <button class="lnk" data-action="aula-topicos" data-id="${a.id}">vincular</button></span>`}
        </div>
        ${aulaTopAberto === a.id ? aulaTopEditorHTML(st, a) : ""}
      </div>`;
  };
  // Agrupa as aulas por DISCIPLINA (numeração das aulas reinicia por disciplina no
  // cursinho). Cabeçalho do grupo com a cor da disciplina; dentro, as aulas na ordem.
  const grupos = [];
  const idxGrupo = new Map();
  for (const item of display) {
    const dnome = discDeAula(item.a);
    if (!idxGrupo.has(dnome)) { idxGrupo.set(dnome, grupos.length); grupos.push({ disc: dnome, itens: [] }); }
    grupos[idxGrupo.get(dnome)].itens.push(item);
  }
  // Uma TABELA por disciplina (igual ao Edital): a disciplina é a "caixa", as aulas são
  // linhas. Bem menos boxes que um card por aula.
  const cards = grupos.map((g) => {
    const d = st.disciplinas.find((x) => x.nome === g.disc);
    const cor = d ? store.corDisciplina(d.id) : "var(--muted)";
    return `<div class="cur-disc" style="--acc:${cor}">
      <div class="cur-disc-h"><span class="cur-dot" style="background:${cor}"></span><span class="cur-disc-nome">${esc(g.disc)}</span><span class="cur-grupo-n">${g.itens.length} aula${g.itens.length === 1 ? "" : "s"}</span></div>
      <div class="cur-aula-list">${g.itens.map(aulaRow).join("")}</div>
    </div>`;
  }).join("");
  // Modo "por tópico": os tópicos do edital (por disciplina, ordem do edital) mostrando
  // a(s) aula(s) do cursinho que os cobrem — o inverso do modo "por aula".
  const bodyTopico = st.disciplinas.map((d) => {
    const tps = st.topicos.filter((t) => t.disciplinaId === d.id);
    if (!tps.length) return "";
    const cor = store.corDisciplina(d.id);
    const rows = tps.map((t) => {
      const aulasT = st.aulas.filter((a) => (a.topicoIds || []).includes(t.id));
      const ref = aulasT.length
        ? aulasT.map((a) => `<span class="cur-aula-chip">${esc(a.nome)}</span>`).join("")
        : `<span class="cur-sem muted small">${icone("link")} não vinculado a nenhuma aula</span>`;
      return `<div class="cur-aula-row">
        <div class="cur-aula-head">
          <button class="lnk ed-top-link cur-top-lnk" data-action="ir-dossie" data-id="${t.id}">${esc(t.nome)}<span class="mapa-abrir-ico">${icone("external-link")}</span></button>
        </div>
        <div class="cur-aula-ref">${ref}</div>
      </div>`;
    }).join("");
    return `<div class="cur-disc" style="--acc:${cor}">
      <div class="cur-disc-h"><span class="cur-dot" style="background:${cor}"></span><span class="cur-disc-nome">${esc(d.nome)}</span><span class="cur-grupo-n">${tps.length} tópico${tps.length === 1 ? "" : "s"}</span></div>
      <div class="cur-aula-list">${rows}</div>
    </div>`;
  }).join("");
  return `
    <p class="muted small cursinho-nota">As aulas <b>agrupam os seus tópicos</b> na ordem do cursinho — <b>não criam estrutura nova</b>. Com a base "Cursinho", o app estuda na <b>ordem das aulas</b> (aqui e no Hoje); o conteúdo, o progresso e a cobertura continuam os mesmos do seu edital.</p>
    <div class="barra-acoes cursinho-barra">
      <label class="inline" data-tip="Mesmos tópicos, ordem diferente — um só botão muda a navegação do estudo. EDITAL: o Hoje sugere e ordena os tópicos por disciplina (ordem do edital). CURSINHO: o Hoje sugere e ordena pela SEQUÊNCIA DAS AULAS (Aula 1 → 2 → ...), aqui e nos seletores de sessão. O conteúdo, o progresso e a COBERTURA são sempre compartilhados (a cobertura é sempre medida pelo edital).">Base de estudo:
        <select id="base-estudo">
          <option value="edital" ${base === "edital" ? "selected" : ""}>Edital (por disciplina)</option>
          <option value="cursinho" ${base === "cursinho" ? "selected" : ""}>Cursinho (por aula)</option>
        </select>
      </label>
      <span class="cur-seg" role="tablist" data-tip="Só muda a forma de ver nesta tela (não altera nada do estudo).">
        <span class="cur-seg-lbl">Ver por:</span>
        <button class="${cursinhoView === "aula" ? "on" : ""}" data-action="cur-view" data-v="aula">Aula</button>
        <button class="${cursinhoView === "topico" ? "on" : ""}" data-action="cur-view" data-v="topico">Tópico</button>
      </span>
      <span class="spacer"></span>
      <button class="btn btn-soft btn-sm" data-action="compatibilizar-aulas-ia" data-tip="A IA casa os assuntos das aulas com os tópicos do seu edital (vira sinônimo), sem você marcar um por um.">${icone("bot")} Compatibilizar com IA</button>
      <button class="btn btn-soft btn-sm" data-action="add-aula">${icone("plus")} Nova aula</button>
      <details class="doc-mais ed-barra-mais">
        <summary class="ed-barra-mais-sum" data-tip-pos="cima-dir" data-tip="Atualizar a grade, colar mais aulas ou limpar o plano.">${icone("ellipsis")} Mais</summary>
        <div class="doc-mais-pop" role="menu">
          <button class="menu-item" data-action="aulas-recolar" data-tip="Colar a grade nova/atualizada e ver o que mudou (preserva as aulas que você ajustou)."><span class="menu-ico">${icone("repeat-2")}</span> Atualizar grade</button>
          <button class="menu-item" data-action="importar-aulas-mais" data-tip="Colar outra lista de aulas (acrescenta às atuais)."><span class="menu-ico">${icone("download")}</span> Colar mais aulas</button>
          <div class="menu-sep"></div>
          <button class="menu-item menu-item-danger" data-action="limpar-aulas">Limpar plano</button>
        </div>
      </details>
    </div>
    ${cursinhoView === "aula" ? cards : bodyTopico}
    ${cursinhoView === "aula" && soltos.length ? `<div class="card cursinho-soltos muted small">${icone("pin")} <b>${soltos.length} ${soltos.length === 1 ? "tópico" : "tópicos"} fora de qualquer aula</b> (não estão na divisão do cursinho): ${soltos.map((t) => esc(t.nome)).join(" · ")}</div>` : ""}`;
}

export default function renderEdital(root, app) {
  const { store } = app;
  const st = store.get();

  // Refino: na 1ª abertura da sessão, se a base de estudo é o cursinho e há aulas, abre direto
  // no "Plano do cursinho" (propaga config.baseEstudo). Depois disso respeita o que o usuário escolher.
  if (!edModoIniciado) {
    edModoIniciado = true;
    if (st.config.baseEstudo === "cursinho" && st.aulas.length) edModo = "cursinho";
  }

  // Dossiê embutido: se um tópico foi aberto (clique no nome, ou vindo de outra tela),
  // mostra a "pasta viva" dele aqui mesmo, com voltar para o Edital.
  // Em CADA navegação (objeto de params novo) reavalia o tópico aberto; num simples
  // re-render (mesmo objeto), preserva o estado — assim a barra lateral volta à lista,
  // mas mexer dentro do dossiê não fecha a tela.
  if (app.params !== _lastParams) {
    _lastParams = app.params;
    dossieTopicoId = app.params && app.params.dossieTopicoId ? app.params.dossieTopicoId : null;
    dossieDiscId = app.params && app.params.dossieDiscId ? app.params.dossieDiscId : dossieDiscId;
  }
  if (dossieTopicoId && st.topicos.find((t) => t.id === dossieTopicoId)) {
    return renderDossieDetalhe(root, app, dossieTopicoId, () => {
      dossieTopicoId = null;
      app.refresh();
    });
  }

  // Painel da DISCIPLINA (nível intermediário): KPIs + semáforo por tópico + histórico.
  if (dossieDiscId && st.disciplinas.find((x) => x.id === dossieDiscId)) {
    return renderDossieDisciplina(root, app, dossieDiscId, {
      onVoltar: () => {
        dossieDiscId = null;
        app.refresh();
      },
      onAbrirTopico: (tid) => {
        dossieTopicoId = tid; // voltar do tópico cai de volta no painel da disciplina
        app.refresh();
      },
    });
  }

  // Atalho que aponta para uma disciplina: garante o modo estrutura e rola até ela.
  const focoDisc = app.params ? app.params.focoDisciplinaId : null;
  if (focoDisc) {
    edModo = "estrutura";
    app.params.focoDisciplinaId = null;
  }

  const totalTopicos = st.topicos.length;
  const cob = store.coberturaEdital();
  const cobOf = store.coberturaOficial();
  // Accordion: na 1ª visita, abre só a primeira disciplina (as demais recolhidas = fim do paredão).
  if (!discAcInit && st.disciplinas.length) { discAcInit = true; discAcAberta.add(st.disciplinas[0].id); }

  const algumAberto = st.disciplinas.some((d) => discAcAberta.has(d.id));
  const estruturaBody = `
    <div class="barra-acoes ed-barra">
      <button class="btn btn-add btn-sm" data-action="toggle-add-disc" data-tip-pos="cima-esq" data-tip="Adicionar disciplinas e tópicos: digite uma disciplina ou cole/importe o edital (separado automaticamente).">${icone("plus")} Adicionar ao edital</button>
      <span class="spacer"></span>
      <label class="inline ed-ord">Ordenar:
        <select id="ed-top-sort" class="ed-ord-sel">
          <option value="custom" ${topSort === "custom" ? "selected" : ""}>Como cadastrei</option>
          <option value="relevancia" ${topSort === "relevancia" ? "selected" : ""}>Mais relevantes primeiro</option>
        </select>
      </label>
      ${st.disciplinas.length ? `<button class="lnk small" data-action="${algumAberto ? "ed-recolher" : "ed-expandir"}" data-tip-pos="cima-esq" data-tip="${algumAberto ? "Recolher todas as disciplinas." : "Abrir todas as disciplinas."}">${algumAberto ? "Recolher tudo" : "Expandir tudo"}</button>
      <button class="btn btn-ghost btn-sm ${selMode ? "on" : ""}" data-action="toggle-selmode" data-tip-pos="cima-esq" data-tip="Selecionar vários tópicos para mover, unificar ou virar nova disciplina.">${selMode ? "Concluir seleção" : "Selecionar"}</button>` : ""}
      <details class="doc-mais ed-barra-mais">
        <summary class="ed-barra-mais-sum" data-tip-pos="cima-dir" data-tip="Mais ações do edital.">${icone("ellipsis")} Mais</summary>
        <div class="doc-mais-pop" role="menu">
          <div class="menu-grupo-rotulo" aria-hidden="true">${icone("target")} Relevância</div>
          <button class="menu-item" data-action="toggle-destaques" data-tip="Cole os temas que mais caem (com % ou sem) e preenche a relevância automaticamente."><span class="menu-ico">${icone("star")}</span> Importar temas que mais caem</button>
          <button class="menu-item" data-action="toggle-sug-ia" data-tip="A IA sugere a relevância dos temas a partir das suas provas e/ou de uma pesquisa na web (você confere e aplica)."><span class="menu-ico">${icone("sparkles")}</span> Sugerir por IA (provas/web)</button>
          <div class="menu-sep"></div>
          <button class="menu-item" data-action="toggle-oficial" data-tip="Cole o edital da banca: o app valida o que o seu edital já cobre e o que ficou de fora (lacunas), sem mexer na sua estrutura."><span class="menu-ico">${icone("clipboard-list")}</span> Comparar com o edital oficial</button>
          ${st.disciplinas.length ? `<div class="menu-sep"></div>
          <button class="menu-item menu-item-danger" data-action="limpar-edital"><span class="menu-ico">${icone("trash-2")}</span> Limpar edital (estrutura)</button>` : ""}
        </div>
      </details>
    </div>

    <details class="ed-ajuda">
      <summary>Como funciona o Edital?</summary>
      <div class="ed-ajuda-corpo">
        <p>Aqui fica o <b>seu edital</b> — as disciplinas e os tópicos que você vai estudar. Clique no tópico (ou no ${icone("external-link")}) para abrir o <b>Dossiê</b>: a pasta viva com tudo daquele assunto.</p>
        <p>Cada linha mostra a <b>relevância</b> (o quanto o tema cai, de <b>Não cai</b> a <b>Altíssima</b>), o <b>aproveitamento</b> nas questões e <b>quantas vezes</b> e <b>quando</b> você estudou o tópico.</p>
        <p>A <b>relevância</b> você define clicando na pílula de cada tópico — ou deixa o sistema estimar pelas suas <b>provas</b> ou pela <b>IA</b> (menu <b>${icone("ellipsis")} Mais</b>). Marcar um tópico como <b>concluído</b> aumenta a <b>cobertura</b> do edital.</p>
      </div>
    </details>

    <div class="edital-estrutura">
      ${st.disciplinas.length ? selBarHTML(store, st) : ""}
      ${
        st.disciplinas.length
          ? `<div class="ed-filtro-barra">${filtroTopicosBotaoHTML(st, filtroEd.sel, filtroEd.aberto)}${filtroEd.sel.length ? `<button class="lnk small" data-ft="limpar" data-tip="Mostrar todas as disciplinas e tópicos.">limpar filtro</button>` : ""}</div>${filtroTopicosPainelHTML(st, filtroEd.sel, filtroEd.aberto)}`
          : ""
      }
      ${
        st.disciplinas.length
          ? (st.disciplinas.map((d) => discHTML(store, st, d)).filter(Boolean).join("") || `<p class="muted" style="padding:10px 0">Nenhum tópico no filtro selecionado.</p>`)
          : vazio(
              "Monte seu edital\nAdicione as disciplinas e tópicos que você vai estudar.",
              `<button class="btn btn-add" data-action="toggle-add-disc">${icone("plus")} Adicionar ao edital</button>`,
              ""
            )
      }
    </div>`;

  const resumoBody = `
    <p class="muted small" style="margin:4px 0 10px">Cada tópico com seus números (materiais, questões, erros, flashcards, tempo) e a relevância. <b>Clique num tópico</b> para abrir o <b>dossiê</b> dele.</p>
    <div class="dossie-lista">${dossieResumoHTML(store)}</div>`;

  let cursinhoBody;
  if (aulasPreview) cursinhoBody = aulasPreviewHTML(aulasPreview) + (st.aulas.length ? aulasListaHTML(store, st) : "");
  else if (aulasImportAberto) cursinhoBody = aulasImportHTML(aulasTextoSalvo) + (st.aulas.length ? aulasListaHTML(store, st) : "");
  else if (st.aulas.length === 0) cursinhoBody = aulasConviteHTML();
  else cursinhoBody = aulasListaHTML(store, st);
  // Modos do Edital = segmented control único (mesmo componente da Lei Seca), com estado
  // ATIVO visível (antes eram botões soltos que sumiam no modo atual, sem indicar onde você está).
  const edModosSeg = `
    <div class="ls-segmented ed-modos" role="tablist">
      <button class="ls-seg ${edModo === "estrutura" ? "on" : ""}" data-action="modo-estrutura" data-tip="Editar a estrutura do edital.">${icone("list-checks")}<span class="ls-seg-txt">Estrutura</span></button>
      <button class="ls-seg ${edModo === "resumo" ? "on" : ""}" data-action="modo-resumo" data-tip="Visão por tópico: cada tópico com seus números (materiais, questões, erros, flashcards, tempo).">${icone("table")}<span class="ls-seg-txt">Dossiê por tópico</span></button>
      <button class="ls-seg ${edModo === "cursinho" ? "on" : ""}" data-action="modo-cursinho" data-tip="Opcional: organizar/estudar pela divisão de aulas do seu cursinho (mapa aula ↔ tópico ↔ edital).">${icone("library")}<span class="ls-seg-txt">Plano do cursinho</span></button>
    </div>`;

  root.innerHTML = `
    ${header("Edital", `${plural(st.disciplinas.length, "disciplina", "disciplinas")} · ${plural(totalTopicos, "tópico", "tópicos")}`, botaoImprimir())}

    ${edModosSeg}

    <section class="card cobertura-edital">
      <div class="cob-edital-num">
        ${(() => { const anima = !edCountAnimou; edCountAnimou = true; return progressRing(cob.pct, { size: 92, stroke: 9, grad: true, count: anima }); })()}
        <div class="cob-edital-barra-wrap">
          <span class="cob-edital-rotulo">Cobertura do edital</span>
          <span class="cob-edital-info muted small"><b class="num">${cob.cobertos}</b> de <b class="num">${cob.total}</b> ${cob.total === 1 ? "tópico concluído" : "tópicos concluídos"}</span>
        </div>
      </div>
      ${
        cobOf
          ? `<div class="cob-oficial muted small">${icone("clipboard-list")} Cobertura do <b>checklist da banca</b>: <b style="color:${cobOf.pct >= 70 ? "var(--success)" : cobOf.pct >= 40 ? "var(--warn)" : "var(--danger)"}">${cobOf.pct}%</b> (${cobOf.cobertos}/${cobOf.total} itens com tópico${cobOf.lacunas.length ? ` · <b>${cobOf.lacunas.length} ${cobOf.lacunas.length === 1 ? "lacuna" : "lacunas"}</b>` : ""}) · <button class="lnk" data-action="toggle-oficial">ver</button></div>`
          : ""
      }
    </section>

    ${edModo === "resumo" ? resumoBody : edModo === "cursinho" ? cursinhoBody : estruturaBody}`;

  // Atalho de disciplina: rola até o card e destaca rapidamente.
  if (focoDisc) {
    const alvo = root.querySelector(`[data-disc-id="${focoDisc}"]`);
    if (alvo) {
      alvo.scrollIntoView({ behavior: "smooth", block: "start" });
      alvo.classList.add("disc-foco");
      setTimeout(() => alvo.classList.remove("disc-foco"), 1600);
    }
  }

  // Plano do cursinho (Fase 4): importar arquivo, base de estudo, tópicos da aula.
  const aulasFile = root.querySelector("#aulas-file");
  if (aulasFile) {
    ligarDropZone(aulasFile);
    // Importar plano do cursinho de ARQUIVO. Mesma regra dos demais: IA (Gemini) lê e organiza —
    // UMA chamada de Visão que devolve aula→assuntos direto do PDF (print de cursinho costuma ser
    // escaneado). Sem IA → extração offline (pdf.js) p/ a caixa e o usuário clica "Montar plano".
    aulasFile.addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const cfg = store.get().config;
      const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
      const comIA = store.iaDisponivel() && cfg.iaProvider === "gemini" && ehPdf && f.size <= 14 * 1024 * 1024;
      const preenche = (texto) => { const ta = root.querySelector("#aulas-texto"); if (ta) ta.value = texto || ""; aulasTextoSalvo = texto || ""; };
      if (comIA) {
        toast("Lendo o plano do cursinho com a IA… (pode levar 1–2 min)");
        try {
          const dataB64 = await arquivoParaBase64(f);
          const aulas = await store.estruturarAulasDePDF(dataB64, f.type || "application/pdf");
          if (aulas && aulas.length) {
            aulasPreview = aulas;
            aulasImportAberto = false;
            const tot = aulas.reduce((a, x) => a + x.topicos.length, 0);
            toast(`${plural(aulas.length, "aula", "aulas")} e ${plural(tot, "assunto", "assuntos")} lidos pela IA. Revise e monte o plano.`, "ok");
            app.refresh();
            return;
          }
          toast("A IA não reconheceu aulas. Tentando extrair o texto…", "erro");
        } catch (err) { try { console.error(err); } catch (_) {} toast("A IA não conseguiu ler agora (instável?). Extraindo o texto…", "erro"); }
        // Fallback local, sem nova chamada.
        try {
          const texto = await lerArquivoTexto(f, null, "");
          preenche(texto);
          toast(texto && texto.trim() ? "Texto extraído. Clique em 'Montar plano'." : "Não consegui ler agora. Tente de novo ou cole o texto.", texto && texto.trim() ? "ok" : "erro");
        } catch (_) { toast("Não consegui ler o arquivo. Cole o texto.", "erro"); }
        return;
      }
      try {
        const texto = await lerArquivoTexto(f, cfg, "");
        preenche(texto);
        if (texto && texto.trim()) toast("Texto carregado. Clique em 'Montar plano'.");
        else toast(ehPdf ? "PDF escaneado (imagem): conecte a IA (Gemini) em Configurações para extrair com OCR, ou cole o texto." : "Sem texto reconhecido. Cole manualmente.", "erro");
      } catch (err) { try { console.error(err); } catch (_) {} toast("Não consegui ler o arquivo. Cole o texto.", "erro"); }
    });
  }
  root.querySelector("#base-estudo")?.addEventListener("change", (e) => {
    store.setBaseEstudo(e.target.value);
  });
  // Arrastar-para-reordenar as aulas do cursinho (dentro de cada disciplina).
  root.querySelectorAll(".cur-disc").forEach((disc) =>
    ligarArrastar(disc, ".cur-aula-row[data-drag-id]", (id, alvo) => {
      store.reordenarAula(id, alvo);
      app.refresh();
    })
  );
  // Accordion: persiste (sem re-render) qual disciplina está aberta/fechada.
  root.querySelectorAll("details.ed-disc-acc").forEach((det) =>
    det.addEventListener("toggle", () => {
      const id = det.getAttribute("data-disc-id");
      if (det.open) discAcAberta.add(id); else discAcAberta.delete(id);
    })
  );
  ligarHoverPreview(root, store);
  // Filtro multi-tópico do Edital (disciplina inteira / tópicos avulsos).
  ligarFiltroTopicos(root, app, filtroEd);
  root.querySelector('[data-ft="limpar"]')?.addEventListener("click", () => {
    filtroEd.sel = [];
    app.refresh();
  });
  root.querySelectorAll(".aula-top-chk").forEach((chk) =>
    chk.addEventListener("change", () => {
      const aulaId = chk.getAttribute("data-aula");
      const ids = [...root.querySelectorAll(`.aula-top-chk[data-aula="${aulaId}"]:checked`)].map((c) => c.value);
      store.setAulaTopicos(aulaId, ids);
    })
  );

  root.querySelectorAll(".ed-top-sel").forEach((cb) =>
    cb.addEventListener("change", () => {
      const id = cb.getAttribute("data-id");
      if (cb.checked) topSel.add(id); else topSel.delete(id);
      app.refresh();
    })
  );

  // Edição ao vivo do preview das aulas (edital migrou para a janela modal).
  root.querySelectorAll(".aula-nome").forEach((el) =>
    el.addEventListener("input", () => {
      const a = parseInt(el.getAttribute("data-a"), 10);
      if (aulasPreview && aulasPreview[a]) aulasPreview[a].nome = el.value;
    })
  );
  root.querySelectorAll(".aula-top").forEach((el) =>
    el.addEventListener("input", () => {
      const a = parseInt(el.getAttribute("data-a"), 10);
      const t = parseInt(el.getAttribute("data-t"), 10);
      if (aulasPreview && aulasPreview[a] && aulasPreview[a].topicos) aulasPreview[a].topicos[t] = el.value;
    })
  );

  bindActions(root, {
    "compatibilizar-aulas-ia": async () => {
      if (!store.iaDisponivel()) return avisoIA(app, "Compatibilizar o plano do cursinho com o edital");
      if (!st.topicos.length) return toast("Crie ou importe os tópicos do edital primeiro.", "erro");
      toast("IA compatibilizando o cursinho com o edital… aguarde.");
      try {
        const r = await store.compatibilizarCursinhoComEdital();
        toast(r.total === 0 ? "Tudo já estava casado com o edital. " : `Compatibilizado: ${r.casados}/${r.total} ${r.total === 1 ? "assunto vinculado" : "assuntos vinculados"}.`, "ok");
        app.refresh();
      } catch (e) {
        console.error(e);
        toast("Não consegui compatibilizar agora. Tente de novo.", "erro");
      }
    },
    "limpar-edital": async () => {
      if (await confirmar("Apagar TODA a estrutura do edital (disciplinas e tópicos)? Seu conteúdo (materiais, questões, flashcards, sessões…) NÃO será apagado: ficará como 'sem tópico'. Esta ação não pode ser desfeita.")) {
        store.limparEdital();
        toast("Estrutura do edital apagada.");
      }
    },
    imprimir: () => edModo === "cursinho"
      ? imprimir("Plano do cursinho — Mentor Concurso", printCursinho(st))
      : imprimir("Edital — Mentor Concurso", printEdital(st)),
    "modo-estrutura": () => {
      edModo = "estrutura";
      app.refresh();
    },
    "modo-resumo": () => {
      edModo = "resumo";
      app.refresh();
    },
    "modo-cursinho": () => {
      edModo = "cursinho";
      app.refresh();
    },
    // "Revisar": parseia as aulas e abre o PREVIEW editável (não grava ainda).
    "importar-aulas": () => {
      const texto = root.querySelector("#aulas-texto").value;
      if (!texto.trim()) return toast("Cole a divisão do cursinho.", "erro");
      const estrutura = parseAulas(texto).map((a) => ({ nome: a.nome || "", topicos: [...(a.topicos || [])], disciplina: a.disciplina || null }));
      if (!estrutura.length) return toast("Não reconheci aulas no texto.", "erro");
      aulasTextoSalvo = texto;
      aulasPreview = estrutura;
      aulasImportAberto = false;
      app.refresh();
    },
    "remover-aula-prev": (el) => {
      const a = parseInt(el.getAttribute("data-a"), 10);
      if (aulasPreview) aulasPreview.splice(a, 1);
      if (aulasPreview && !aulasPreview.length) { aulasPreview = null; aulasImportAberto = true; }
      app.refresh();
    },
    "remover-aula-top": (el) => {
      const a = parseInt(el.getAttribute("data-a"), 10);
      const t = parseInt(el.getAttribute("data-t"), 10);
      if (aulasPreview && aulasPreview[a]) aulasPreview[a].topicos.splice(t, 1);
      app.refresh();
    },
    "add-aula-top": (el) => {
      const a = parseInt(el.getAttribute("data-a"), 10);
      if (aulasPreview && aulasPreview[a]) aulasPreview[a].topicos.push("");
      app.refresh();
    },
    "voltar-aulas": () => {
      aulasPreview = null;
      aulasImportAberto = true;
      app.refresh();
    },
    "descartar-aulas": () => {
      aulasPreview = null;
      aulasTextoSalvo = "";
      app.refresh();
    },
    "aceitar-aulas": () => {
      const estrutura = (aulasPreview || [])
        .map((a) => ({ nome: (a.nome || "").trim(), topicos: (a.topicos || []).map((t) => (t || "").trim()).filter(Boolean), disciplina: a.disciplina || null }))
        .filter((a) => a.nome);
      if (!estrutura.length) return toast("Nenhuma aula para criar.", "erro");
      const r = store.importarAulasCursinho(estrutura);
      aulasPreview = null;
      aulasTextoSalvo = "";
      toast(
        r.criadas
          ? `${plural(r.criadas, "aula criada", "aulas criadas")}.${r.naoCasados.length ? ` ${plural(r.naoCasados.length, "assunto não casou", "assuntos não casaram")} com seus tópicos (use sinônimos ou crie os tópicos).` : ""}`
          : "Não reconheci aulas no texto.",
        r.criadas ? "ok" : "erro"
      );
      if (r.naoCasados.length) console.info("Assuntos do cursinho não casados:", r.naoCasados);
    },
    "importar-aulas-mais": () => abrirImportarAulas(app),
    "aulas-recolar": () => abrirAulasRecolar(app),
    "importar-aulas-fechar": () => {
      aulasImportAberto = false;
      aulasPreview = null;
      aulasTextoSalvo = "";
      app.refresh();
    },
    "add-aula": async () => {
      const nome = await pedirTexto("Nome da aula:", { valor: "Aula " + (store.get().aulas.length + 1), rotuloOk: "Adicionar" });
      if (nome) store.addAula(nome);
    },
    "aula-renomear": async (el) => {
      const a = store.get().aulas.find((x) => x.id === el.getAttribute("data-id"));
      const nome = await pedirTexto("Renomear aula:", { valor: a ? a.nome : "" });
      if (nome) store.renomearAula(el.getAttribute("data-id"), nome);
    },
    "aula-subir": (el) => store.moverAula(el.getAttribute("data-id"), "cima"),
    "aula-descer": (el) => store.moverAula(el.getAttribute("data-id"), "baixo"),
    "aula-topicos": (el) => {
      const id = el.getAttribute("data-id");
      aulaTopAberto = aulaTopAberto === id ? null : id;
      app.refresh();
    },
    "cur-view": (el) => { cursinhoView = el.getAttribute("data-v") === "topico" ? "topico" : "aula"; app.refresh(); },
    "aula-remover": async (el) => {
      if (await confirmar("Remover esta aula? (não apaga os tópicos, só a aula)")) store.removerAula(el.getAttribute("data-id"));
    },
    "limpar-aulas": async () => {
      if (await confirmar("Limpar todo o plano do cursinho? (não apaga os tópicos)")) store.limparAulas();
    },
    "toggle-add-disc": () => abrirAddEdital(app),
    "toggle-destaques": () => abrirDestaques(app),
    "toggle-sug-ia": () => abrirSugestaoIA(app),
    "toggle-oficial": () => abrirOficial(app),
    "add-top": async (el) => {
      const nome = await pedirTexto("Nome do tópico:", { rotuloOk: "Adicionar" });
      if (nome && nome.trim()) store.addTopico(el.getAttribute("data-disc"), nome);
    },
    "ren-disc": async (el) => {
      const id = el.getAttribute("data-id");
      const d = store.get().disciplinas.find((x) => x.id === id);
      const nome = await pedirTexto("Renomear disciplina:", { valor: d ? d.nome : "" });
      if (nome) store.renomearDisciplina(id, nome);
    },
    "del-disc": async (el) => {
      if (await confirmar("Remover a disciplina e seus tópicos? (o conteúdo vinculado fica 'sem tópico')")) {
        store.removerDisciplina(el.getAttribute("data-id"));
      }
    },
    "ren-top": async (el) => {
      const id = el.getAttribute("data-id");
      const t = store.get().topicos.find((x) => x.id === id);
      const nome = await pedirTexto("Renomear tópico:", { valor: t ? t.nome : "" });
      if (nome) store.renomearTopico(id, nome);
    },
    "del-top": async (el) => {
      if (await confirmar("Remover este tópico?")) store.removerTopico(el.getAttribute("data-id"));
    },
    "done-top": (el) => store.toggleTopicoConcluido(el.getAttribute("data-id")),
    "sel-mover": () => {
      const disc = root.querySelector("#sel-mover-disc")?.value;
      if (!disc) return toast("Escolha a disciplina de destino.", "erro");
      const nMov = topSel.size;
      store.moverTopicos([...topSel], disc);
      topSel.clear();
      toast(`${plural(nMov, "tópico movido", "tópicos movidos")} de disciplina.`);
      app.refresh();
    },
    "sel-nova-disc": async () => {
      if (!topSel.size) return;
      const nome = await pedirTexto("Nome da nova disciplina:", { rotuloOk: "Criar" });
      if (!nome) return;
      store.criarDisciplinaDeTopicos([...topSel], nome);
      topSel.clear();
      toast("Nova disciplina criada com os tópicos selecionados.");
      app.refresh();
    },
    "sel-unificar": async () => {
      const dest = root.querySelector("#sel-uni-dest")?.value;
      if (!dest) return toast("Escolha o tópico de destino.", "erro");
      if (!(await confirmar("Unificar os selecionados no tópico de destino? O conteúdo vinculado (questões, materiais, flashcards, revisões…) será TRANSFERIDO para o destino e os outros tópicos serão removidos. Não pode ser desfeito."))) return;
      for (const id of [...topSel]) if (id !== dest) store.mesclarTopicos(id, dest);
      topSel.clear();
      toast("Tópicos unificados.");
      app.refresh();
    },
    "sel-limpar": () => { topSel.clear(); app.refresh(); },
    "toggle-selmode": () => { selMode = !selMode; if (!selMode) topSel.clear(); app.refresh(); },
    "ed-expandir": () => { st.disciplinas.forEach((d) => discAcAberta.add(d.id)); app.refresh(); },
    "ed-recolher": () => { discAcAberta.clear(); app.refresh(); },
    "add-link-top": async (el) => {
      const id = el.getAttribute("data-id");
      const url = await pedirTexto("Cole o link (videoaula, PDF, caderno de questões):", { placeholder: "https://…", rotuloOk: "Anexar" });
      if (!url || !url.trim()) return;
      let titulo = await pedirTexto("Título do link (opcional):", { placeholder: "Deixe vazio para usar o site", rotuloOk: "Anexar" });
      if (titulo === null) titulo = ""; // cancelou o título: ainda anexa, derivando do domínio
      if (!titulo.trim()) {
        try {
          titulo = new URL(url.trim()).hostname.replace(/^www\./, "");
        } catch {
          titulo = "";
        }
      }
      store.addLinkTopico(id, { titulo: titulo.trim(), url: url.trim() });
      toast("Link anexado ao tópico.");
    },
    "del-link-top": async (el) => {
      if (await confirmar("Remover este link?")) {
        store.removerLinkTopico(el.getAttribute("data-id"), parseInt(el.getAttribute("data-idx"), 10));
      }
    },
    "ir-dossie": (el) => {
      dossieTopicoId = el.getAttribute("data-id");
      app.refresh();
    },
    "ir-dossie-disc": (el) => {
      dossieDiscId = el.getAttribute("data-id");
      dossieTopicoId = null;
      app.refresh();
    },
  });

  root.querySelector("#ed-top-sort")?.addEventListener("change", (e) => {
    topSort = e.target.value;
    app.refresh();
  });

  root.querySelector("#aulas-sort")?.addEventListener("change", (e) => {
    aulasSort = e.target.value;
    app.refresh();
  });

  // Relevância = pílula NOMEADA (Não cai · Baixa · Média · Alta · Altíssima), a única escala
  // exibida ao usuário. (A escala em faixas de % foi removida — era código morto.)
  root.querySelectorAll("select[data-nivel-named]").forEach((el) =>
    el.addEventListener("change", () => {
      aplicarRelNamed(store, el.getAttribute("data-id"), el.value);
      app.refresh();
    })
  );
}

// Barra de ações em lote para os tópicos selecionados (corrigir erros de importação).
function selBarHTML(store, st) {
  for (const id of [...topSel]) if (!st.topicos.some((t) => t.id === id)) topSel.delete(id);
  if (!selMode) return "";
  const n = topSel.size;
  const opcoesDisc = st.disciplinas.map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("");
  const opcoesDest = [...topSel].map((id) => { const t = st.topicos.find((x) => x.id === id); return t ? `<option value="${id}">${esc(t.nome)}</option>` : ""; }).join("");
  return `<div class="card ed-sel-bar">
    <b>${n ? plural(n, "tópico selecionado", "tópicos selecionados") : "Modo seleção — marque os tópicos"}</b>
    ${n ? `<label class="inline">Mover para <select id="sel-mover-disc"><option value="">— disciplina —</option>${opcoesDisc}</select></label>
    <button class="btn btn-sm btn-soft" data-action="sel-mover">Mover</button>
    <button class="btn btn-sm btn-soft" data-action="sel-nova-disc">Nova disciplina com estes</button>
    ${n >= 2 ? `<label class="inline">Unificar em <select id="sel-uni-dest"><option value="">— tópico —</option>${opcoesDest}</select></label><button class="btn btn-sm btn-soft" data-action="sel-unificar">Unificar</button>` : ""}` : ""}
    <span class="spacer"></span>
    ${n ? `<button class="lnk" data-action="sel-limpar">limpar seleção</button>` : ""}
    <button class="btn btn-sm btn-ghost" data-action="toggle-selmode">Concluir</button>
  </div>`;
}
// Aproveitamento agregado da disciplina = acertos totais / questões totais dos tópicos
// (não média de médias, p/ não distorcer tópicos com poucas questões). null = sem dados.
function aprovAgregadoDisc(st, discId) {
  let ac = 0, q = 0;
  for (const t of st.topicos.filter((x) => x.disciplinaId === discId)) {
    const s = statsTopico(st, t.id);
    if (s.questoes) { q += s.questoes; ac += Math.round((s.pct / 100) * s.questoes); }
  }
  return q ? Math.round((ac / q) * 100) : null;
}

function discHTML(store, st, d) {
  let tops = st.topicos.filter((t) => t.disciplinaId === d.id);
  // Filtro multi-tópico: se há seleção, mostra só os tópicos escolhidos; disciplina sem
  // nenhum tópico no filtro é ocultada (selecionar a disciplina toda inclui todos os dela).
  if (filtroEd.sel.length) {
    tops = tops.filter((t) => filtroEd.sel.includes(t.id));
    if (!tops.length) return "";
  }
  if (topSort === "relevancia") tops = [...tops].sort((a, b) => (b.peso || 0) - (a.peso || 0));
  const concluidos = tops.filter((t) => t.concluido).length;
  const cob = tops.length ? Math.round((concluidos / tops.length) * 100) : 0;
  // Semáforo agregado de aproveitamento (verde/âmbar/vermelho, neutro sem dados).
  const aprov = aprovAgregadoDisc(st, d.id);
  const nivel = aprov === null ? "na" : store.corDesempenho(aprov) || "na";
  // Aberta se: modo seleção OU há filtro ativo OU o usuário deixou aberta.
  const aberta = selMode || filtroEd.sel.length > 0 || discAcAberta.has(d.id);
  return `
    <details class="card ed-disc ed-disc-acc" data-disc-id="${d.id}" ${aberta ? "open" : ""}>
      <summary class="ed-disc-sum">
        <span class="disc-cor" style="background:${store.corDisciplina(d.id)}"></span>
        <strong class="ed-disc-nome">${esc(d.nome)}</strong>
        <span class="ed-disc-prog" data-tip="Cobertura: tópicos marcados como concluídos.">
          <span class="ed-prog-track"><i class="ed-prog-bar" style="width:${cob}%"></i></span>
          <b class="nums">${cob}%</b>
          <span class="ed-disc-cont muted small nums" data-tip="Tópicos concluídos.">${concluidos}/${tops.length}</span>
        </span>
        <span class="ed-sem ed-sem-${nivel}" data-tip="Aproveitamento médio das questões desta disciplina.">
          <i class="ed-sem-dot"></i>${aprov === null ? "—" : aprov + "%"}
        </span>
        <span class="spacer"></span>
        <span class="ed-disc-acoes">
          <button class="mover-btn" data-action="add-top" data-disc="${d.id}" data-tip-pos="cima-dir" data-tip="Adicionar tópico">${icone("plus")}</button>
          <button class="mover-btn" data-action="ren-disc" data-id="${d.id}" data-tip-pos="cima-dir" data-tip="Renomear disciplina">${icone("square-pen")}</button>
          <button class="mover-btn mover-del" data-action="del-disc" data-id="${d.id}" data-tip-pos="cima-dir" data-tip="Remover disciplina e seus tópicos">${icone("x")}</button>
        </span>
        <span class="ed-disc-chev">${icone("chevron-down")}</span>
      </summary>
      ${tops.length ? `<div class="ed-tabwrap"><table class="ed-tab">
        <thead><tr><th class="edc-chk"></th><th>Tópico</th><th class="edc-rel">Relevância</th><th class="edc-ap">Aproveitamento</th><th class="edc-vez">Vezes</th><th class="edc-ult">Última vez</th><th class="edc-acts"></th></tr></thead>
        <tbody>${tops.map((t, i) => topHTML(store, st, t, i + 1)).join("")}</tbody>
      </table></div>` : `<p class="muted small ed-semtop">Sem tópicos ainda. Use o "+" acima para adicionar.</p>`}
    </details>`;
}

function topHTML(store, st, t, n) {
  const ult = ultimoEstudoTopico(st, t.id);
  const s = statsTopico(st, t.id);
  // Métricas inline compactas: % de aproveitamento (colorido), questões feitas e
  // última data estudada. Sem dados → "—" discreto.
  // Semáforo de aproveitamento por tópico: bolinha + % num pill colorido
  // (verde/âmbar/vermelho), neutro quando ainda não há questões.
  const nivelSem = s.pct === null ? "na" : store.corDesempenho(s.pct) || "na";
  const metricas = `<span class="ed-top-metricas" data-tip="Aproveitamento · questões feitas · última vez estudado.">
        <span class="ed-sem ed-sem-${nivelSem}"><i class="ed-sem-dot"></i>${s.pct === null ? "—" : s.pct + "%"}</span>
        <span class="ed-met-q">${s.questoes ? `${s.questoes} q` : "—"}</span>
        <span class="ed-met-data">${s.ultima ? fmtData(s.ultima) : "—"}</span>
      </span>`;
  const links = Array.isArray(t.links) ? t.links : [];
  const chips = links.length
    ? `<span class="ed-top-links">${links
        .map((l, i) => `<a class="ed-link-chip" href="${esc(l.url)}" target="_blank" rel="noopener" data-tip="${esc(l.url)}">${icone("link")} ${esc(l.titulo || l.url)}<button class="ed-link-x" data-action="del-link-top" data-id="${t.id}" data-idx="${i}" data-tip="Remover link" title="Remover">${icone("x")}</button></a>`)
        .join("")}</span>`
    : "";
  // Aproveitamento: barra colorida (verde/âmbar/vermelho) + %, ou "—" sem questões.
  const apCor = s.pct === null ? "z" : s.pct < 50 ? "r" : s.pct < 75 ? "y" : "g";
  const certas = s.pct === null ? 0 : Math.round((s.pct / 100) * s.questoes);
  const erradas = (s.questoes || 0) - certas;
  const apTip = s.pct === null ? "Sem questões respondidas neste tópico." : `${certas} certas · ${erradas} erradas · ${s.questoes} no total`;
  const apCell = s.pct === null
    ? `<span class="ed-ap z" data-tip="${apTip}"><span class="ed-apb"><i style="width:0"></i></span><b>—</b></span>`
    : `<span class="ed-ap ${apCor}" data-tip="${apTip}"><span class="ed-apb"><i style="width:${s.pct}%"></i></span><b>${s.pct}%</b></span>`;
  // Estudo em duas colunas: nº de vezes | última vez (alinhadas e com o mesmo estilo).
  const vezes = st.sessoes.filter((x) => x.topicoId === t.id).length;
  const vezCell = vezes ? `<b class="ed-vez">${vezes}×</b>` : `<span class="ed-est none">—</span>`;
  const ultCell = s.ultima ? `<span class="ed-ult">${fmtData(s.ultima)}</span>` : `<span class="ed-est none">nunca</span>`;
  return `
    <tr class="${t.concluido ? "ed-tr-done" : ""}">
      <td class="edc-chk">${selMode ? `<input type="checkbox" class="ed-top-sel" data-id="${t.id}" ${topSel.has(t.id) ? "checked" : ""} title="Selecionar (para mover, unificar ou virar nova disciplina)" />` : `<button class="ed-chk ${t.concluido ? "on" : ""}" data-action="done-top" data-id="${t.id}" data-tip-pos="cima-esq" data-tip="${t.concluido ? "Concluído · clique para desmarcar" : "Marcar como concluído (já estudei)"}">${icone("check")}</button>`}</td>
      <td class="edc-nome"><button class="lnk ed-top-link" data-action="ir-dossie" data-id="${t.id}">${esc(t.nome)}<span class="mapa-abrir-ico" aria-hidden="true">${icone("external-link")}</span></button>${chips}</td>
      <td class="edc-rel">${relPillSelectHTML(t)}</td>
      <td class="edc-ap">${apCell}</td>
      <td class="edc-vez">${vezCell}</td>
      <td class="edc-ult">${ultCell}</td>
      <td class="edc-acts">
        <details class="doc-mais ed-top-mais">
          <summary class="ed-top-mais-sum" data-tip-pos="cima-dir" data-tip="Mais ações para este tópico.">${icone("ellipsis")}</summary>
          <div class="doc-mais-pop" role="menu">
            <button class="menu-item" data-action="ren-top" data-id="${t.id}"><span class="menu-ico">${icone("square-pen")}</span> Renomear</button>
            <button class="menu-item" data-action="add-link-top" data-id="${t.id}"><span class="menu-ico">${icone("link")}</span> Anexar link</button>
            <div class="menu-sep"></div>
            <button class="menu-item menu-item-danger" data-action="del-top" data-id="${t.id}"><span class="menu-ico">${icone("x")}</span> Remover tópico</button>
          </div>
        </details>
      </td>
    </tr>`;
}

function ultimoEstudoTopico(st, topicoId) {
  return st.sessoes
    .filter((s) => s.topicoId === topicoId)
    .reduce((max, s) => (s.data > max ? s.data : max), "");
}
// Métricas inline de um tópico a partir das sessões: total de questões feitas,
// % de aproveitamento (null se nenhuma questão) e a última data estudada.
// Hover-preview de tópico (desktop): mini-card flutuante com os números, sem clicar/navegar.
let hoverCardEl = null, hoverTimerEd = null;
function ligarHoverPreview(root, store) {
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return; // só desktop/mouse
  root.querySelectorAll(".ed-top-link[data-id]").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      clearTimeout(hoverTimerEd);
      hoverTimerEd = setTimeout(() => mostrarHoverTopico(el, store), 350);
    });
    el.addEventListener("mouseleave", () => { clearTimeout(hoverTimerEd); if (hoverCardEl) hoverCardEl.classList.remove("on"); });
  });
  window.addEventListener("scroll", () => { if (hoverCardEl) hoverCardEl.classList.remove("on"); }, { passive: true, once: false });
}
function mostrarHoverTopico(el, store) {
  const st = store.get();
  const id = el.getAttribute("data-id");
  const t = st.topicos.find((x) => x.id === id);
  if (!t) return;
  const s = statsTopico(st, id);
  const nivel = s.pct === null ? "na" : store.corDesempenho(s.pct) || "na";
  const rel = relLabel(t);
  const nMat = (st.documentos || []).filter((d) => d.topicoId === id || (d.topicoIds || []).includes(id)).length;
  const nFc = (st.flashcards || []).filter((f) => f.topicoId === id).length;
  const nQ = (st.questoes || []).filter((q) => q.topicoId === id).length;
  if (!hoverCardEl) { hoverCardEl = document.createElement("div"); hoverCardEl.className = "ed-hovercard"; document.body.appendChild(hoverCardEl); }
  hoverCardEl.innerHTML = `
    <div class="ed-hc-nome">${esc(t.nome)}${t.concluido ? ` ${icone("check")}` : ""}</div>
    <div class="ed-hc-row"><span class="ed-sem ed-sem-${nivel}"><i class="ed-sem-dot"></i>${s.pct === null ? "sem questões" : s.pct + "%"}</span>${rel ? `<span class="ed-hc-rel">${esc(rel)}</span>` : ""}</div>
    <div class="ed-hc-stats">${plural(nMat, "material", "materiais")} · ${plural(nQ, "questão", "questões")} · ${plural(nFc, "flashcard", "flashcards")}</div>
    <div class="ed-hc-stats">${s.ultima ? `Última vez: ${fmtData(s.ultima)}` : "Ainda não estudado"}</div>`;
  const r = el.getBoundingClientRect();
  const w = 280;
  hoverCardEl.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
  const th = hoverCardEl.offsetHeight || 96;
  const abaixo = r.bottom + th + 10 < window.innerHeight;
  hoverCardEl.style.top = (abaixo ? r.bottom + 8 : r.top - th - 8) + "px";
  hoverCardEl.classList.add("on");
}

function statsTopico(st, topicoId) {
  let questoes = 0;
  let acertos = 0;
  let ultima = "";
  for (const s of st.sessoes) {
    if (s.topicoId !== topicoId) continue;
    questoes += (s.qAcertos || 0) + (s.qErros || 0);
    acertos += s.qAcertos || 0;
    if (s.data > ultima) ultima = s.data;
  }
  const pct = questoes ? Math.round((acertos / questoes) * 100) : null;
  return { questoes, pct, ultima };
}
function haQuantoTempo(iso) {
  if (!iso) return "nunca";
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const [ay, am, ad] = iso.slice(0, 10).split("-").map(Number);
  const [by, bm, bd] = hojeISO.split("-").map(Number);
  const n = Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
  if (n <= 0) return "hoje";
  if (n === 1) return "ontem";
  return `há ${n} dias`;
}

function printEdital(st) {
  if (!st.disciplinas.length) return "<p>Nenhuma disciplina.</p>";
  return st.disciplinas
    .map((d) => {
      const tops = st.topicos.filter((t) => t.disciplinaId === d.id);
      const itens = tops.length
        ? `<ul>${tops.map((t) => { const rv = relNamedValor(t); const rel = rv !== "nd" ? ` <span class="print-meta">(${relNamedNome(t)})</span>` : ""; return `<li>${t.concluido ? "✓ " : ""}${t.destaque ? "★ " : ""}${esc(t.nome)}${rel}${t.previsaoAula ? ` <span class="print-meta">(aula prevista)</span>` : ""}</li>`; }).join("")}</ul>`
        : "<p>—</p>";
      return `<h2>${esc(d.nome)}</h2>${itens}`;
    })
    .join("");
}
// Impressão do PLANO DO CURSINHO: aulas na ordem, agrupadas por disciplina, com os tópicos.
function printCursinho(st) {
  const aulas = st.aulas || [];
  if (!aulas.length) return "<p>Nenhuma aula no plano do cursinho.</p>";
  const nomeTop = (id) => { const t = st.topicos.find((x) => x.id === id); return t ? esc(t.nome) : ""; };
  return aulas
    .map((a, i) => {
      const tops = (a.topicoIds || []).map((id) => nomeTop(id)).filter(Boolean);
      return `<div class="print-aula"><b>${i + 1}. ${esc(a.nome)}</b>${tops.length ? `<div class="print-meta">No edital: ${tops.join(" · ")}</div>` : ""}</div>`;
    })
    .join("");
}
