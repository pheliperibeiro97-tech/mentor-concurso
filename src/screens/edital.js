// Tela Edital: gerenciar disciplinas, tópicos e destaques a qualquer momento
// (o onboarding monta a estrutura inicial; aqui você acrescenta/edita depois).
import { bindActions, toast, toastCarregando, comOcupado, header, seloBadge, vazio, confirmar, botaoImprimir, imprimir, ligarDropZone, escolher, avisoIA, pedirTexto, abrirJanela, abrirJanelaFluxo, plural, dicaArquivo } from "../ui.js";
import { progressRing } from "../viz.js";
import { esc, fmtData } from "../util.js";
import { icone } from "../icones.js";
import { separarEdital } from "../ia.js";
import { lerArquivoTexto, ligarImportArquivo, arquivoParaBase64, extrairPdfPaginas } from "../pdf.js";
import { aulasDoSumario, disciplinaDoNomeDeArquivo, recortarConteudoProgramatico } from "../estrutura.js";
import { renderDossieDetalhe, dossieResumoHTML, dossieCompactoHTML, renderDossieDisciplina } from "./dossie.js";
import { filtroTopicosBotaoHTML, filtroTopicosPainelHTML, ligarFiltroTopicos } from "./questoes-filtro.js";

let aulasPreview = null; // proposta de aulas do cursinho (preview editável)
let aulasTextoSalvo = "";
let aulaTopAberto = null; // aulaId com o editor de tópicos da aula aberto (Fase 4)
let aulasImportAberto = false; // mostrar a caixa de importar aulas mesmo já tendo aulas
let topSort = "custom"; // ordem dos tópicos DENTRO da disciplina: "custom" | "relevancia"
let cursinhoView = "aula"; // Plano do cursinho: ver "aula" (aula→tópicos) ou "topico" (tópico→aula)
let curAcFechada = new Set(); // grupos do plano do cursinho RECOLHIDOS (padrão: todos abertos)
let desfazerVinculos = null; // fotografia da última revisão de vínculos, para desfazer na sessão
let curTopsAbertos = new Set(); // aulas com os tópicos do edital EXPANDIDOS (padrão: recolhidos)
let dossieAcAberta = new Set(); // Dossiê por tópico: disciplinas com o accordion ABERTO
let dossieAcInit = false; // 1ª vez na sessão: preserva o padrão de cada densidade (ver resumoBody)
let topSel = new Set(); // tópicos selecionados para ações em lote (mover/unificar/nova disciplina)
let selMode = false; // modo de seleção (mostra as caixas de seleção; fora dele só aparece o ✓ Concluído)
let discAcAberta = new Set(); // disciplinas com o accordion ABERTO (persiste na sessão)
let discAcInit = false; // na 1ª vez, abre só a primeira disciplina (fim do "paredão")
let edModo = "estrutura"; // "estrutura" (editar) | "resumo" (dossiê) | "cursinho" (plano de aulas)
const filtroEd = { sel: [], aberto: false }; // filtro multi-tópico (disciplina inteira / tópicos avulsos)
let edModoIniciado = false; // ao abrir pela 1ª vez na sessão, respeita config.baseEstudo
let edCompacto = null; // dossiê: null = automático pelo tamanho do edital; true/false = escolha do usuário
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
// Rótulo curto da relevância para exibição (chip): o NOME do nível da escala única
// (Baixa · Média · Alta · Altíssima) ou "". O % de incidência fica só em tooltip.
export function relLabel(t) {
  if ((t.peso || 0) > 0 || t.maisCai) return relNamedNome(t);
  return "";
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
    <div class="barra-acoes u-mb-8">
      <button class="btn ${nProvas ? "btn-primary" : "btn-ghost"} btn-sm" data-action="sug-provas" ${carregando || !nProvas ? "disabled" : ""} data-tip="${nProvas ? `Analisa as ${nProvas} questões das suas provas importadas (incidência real).` : "Importe provas anteriores para usar esta opção."}">${carregando === "provas" ? "Analisando…" : `Pelas minhas provas (${nProvas})`}</button>
      <button class="btn btn-ghost btn-sm" data-action="sug-web" ${carregando ? "disabled" : ""} data-tip="Pesquisa na web o 'raio-x' da banca/cargo${alvo ? ` (${esc(alvo)})` : ""} e estima a relevância, com fontes.">${carregando === "web" ? "Pesquisando…" : "Pesquisar na web"}</button>
      ${store
        .materiaisComIncidencia()
        .map(
          (m) =>
            `<button class="btn btn-ghost btn-sm" data-action="sug-material" data-id="${m.id}" ${carregando ? "disabled" : ""} data-tip="Lê a estatística de incidência que já está dentro deste material (${m.n} disciplinas) e converte em nível de relevância. Não usa IA nem internet.">${carregando === "material" ? "Lendo…" : `De “${esc(m.titulo)}”`}</button>`
        )
        .join("")}
    </div>
    ${!nProvas ? `<p class="muted small u-m-0 u-mb-4">${icone("bar-chart-3")} Você ainda não importou provas — a opção pelas suas provas (a mais confiável) aparece depois da primeira importação.</p>` : ""}
    ${rel ? sugResultadoHTML(!!store.coberturaOficial(), rel) : ""}
  </div>`;
}
function sugResultadoHTML(temOficial, r) {
  if (!r.itens.length) {
    return `<div class="muted small u-mt-12">A pesquisa não retornou sugestões aplicáveis aos seus tópicos.${r.fonte === "web" ? " Defina a banca e o cargo do concurso para melhorar a busca." : ""}</div>`;
  }
  const cabec =
    r.fonte === "provas"
      ? `Pelas suas provas: ${plural(r.itens.length, "tópico", "tópicos")} com questões (de ${r.total} analisadas). A relevância é a participação na prova.`
      : r.fonte === "material"
        ? `De “${esc(r.titulo)}”: ${plural(r.itens.length, "tópico", "tópicos")} em ${plural(r.disciplinas, "disciplina", "disciplinas")}. O percentual é a fatia do tema DENTRO da disciplina; o nível vem do acumulado (primeiros 50% = 95, até 75% = 70, até 90% = 40, resto = 15).`
        : `Pela web: estimativa de relevância por tópico — confira nas fontes abaixo.`;
  const linhas = r.itens
    .map((it, i) => {
      const sobe = it.pesoSugerido > (it.atual || 0);
      return `<li class="sug-item">
        <input type="checkbox" class="sug-cb" data-i="${i}" ${sobe ? "checked" : ""} />
        <span class="sug-nome">${esc(it.nome)}
          ${it.tema ? `<span class="sug-origem muted small">${icone("corner-down-right")} de “${esc(it.tema)}”${it.pct != null ? ` — ${String(it.pct).replace(".", ",")}% de ${esc(it.disciplina || "")}` : ""}</span>` : ""}
        </span>
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
  // O que NÃO casou importa tanto quanto o que casou: "Organização dos Poderes" é o maior tema de
  // Constitucional (21%) e não tem tópico equivalente no edital do TJSP — está repartido em Poder
  // Legislativo, Executivo, Judiciário e Funções Essenciais. Escondido num contador, isso vira
  // um buraco silencioso no seu plano; listado, você marca esses à mão.
  const forasteiros =
    r.naoEncontrados && r.naoEncontrados.length
      ? `<details class="sug-fora u-mt-8">
           <summary class="lnk">${icone("triangle-alert")} ${plural(r.naoEncontrados.length, "tema do material ficou", "temas do material ficaram")} sem tópico correspondente no seu edital</summary>
           <p class="muted small u-mt-4 u-mb-4">Ou o edital não tem esse tema, ou ele está repartido em vários itens (o caso de “Organização dos Poderes”). Defina a relevância desses à mão, no tópico certo.</p>
           <ul class="sug-fora-lista muted small">${r.naoEncontrados.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
         </details>`
      : "";
  return `<div class="sug-resultado">
    <div class="muted small u-mt-12 u-mb-8">${cabec} Marcadas as que aumentam a relevância:</div>
    <ul class="sug-lista">${linhas}</ul>
    ${forasteiros}
    ${fontes}
    ${temOficial ? `<label class="inline small u-mt-8 u-mb-8"><input type="checkbox" id="sug-dividir" /> ${icone("scale")} Dividir a relevância entre tópicos do <b>mesmo item do edital</b> (quando um item virou vários tópicos — evita inflar a soma)</label>` : ""}
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
      <p class="muted small">Traga o <b>novo edital</b> (ex.: uma retificação da banca). O app vai te mostrar o <b>que mudou</b> em relação ao atual — <b>itens novos</b>, <b>removidos</b> e possíveis <b>renomeações</b> — e você confirma. As renomeações viram <b>sinônimos</b>, então a cobertura que você já tem é preservada.</p>
      <label class="btn btn-ghost btn-sm btn-file u-mb-8" data-tip="PDF ou .txt.">${icone("paperclip")} Importar de arquivo<input id="oficial-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden /></label>
      <textarea id="oficial-texto" rows="6" placeholder="novo edital da banca…"></textarea>
      <div class="form-acoes"><button class="btn btn-ghost" data-action="oficial-recolar-cancelar">Cancelar</button><button class="btn btn-primary" data-action="oficial-conferir-mudancas">Conferir o que mudou</button></div>
    </div>`;
  }
  if (!r) {
    return `<div class="card oficial-card oficial-card-mini">
      <div class="plano-h"><h2>Checklist da banca</h2><span class="muted small">opcional</span></div>
      <p class="muted small">Tem o <b>edital da banca</b>? Traga abaixo para <b>validar a sua cobertura</b> (o que o seu edital já cobre e o que ficou de fora). <b>Não muda a sua estrutura</b>; é só uma conferência. O casamento é pelo nome + sinônimos () de cada tópico.</p>
      <label class="btn btn-ghost btn-sm btn-file u-mb-8" data-tip="${dicaArquivo("Importar de PDF ou .txt.")}">${icone("paperclip")} Importar de arquivo<input id="oficial-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden /></label>
      <textarea id="oficial-texto" rows="5" placeholder="${esc("Ex.:\nDIREITO CONSTITUCIONAL\nPrincípios fundamentais; Direitos e garantias fundamentais\nOrganização do Estado")}"></textarea>
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
    ? `<div class="muted small u-mt-12">${icone("plus")} <b>Extras</b> — seus tópicos que não casam com nenhum item oficial (aprofundamento, ou nome diferente; se for o caso, adicione um sinônimo): ${r.extras.map((t) => esc(t.nome)).join(" · ")}</div>`
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
    ${r.multi ? `<p class="muted small u-m-0 u-mb-8">${icone("shuffle")} <b>${r.multi} ${r.multi === 1 ? "item" : "itens"}</b> do edital ${r.multi === 1 ? "está dividido" : "estão divididos"} em <b>vários tópicos</b> seus — a relevância/incidência desse item é <b>compartilhada</b> entre eles (não some nem é contada em dobro). Ao aplicar relevância, dá para <b>dividir</b> entre os tópicos do mesmo item.</p>` : ""}
    ${
      r.lacunas.length
        ? `<div class="oficial-acoes"><button class="btn btn-primary btn-sm" data-action="oficial-criar-lacunas">${icone("plus")} Criar tópicos para as ${plural(r.lacunas.length, "lacuna", "lacunas")}</button></div>
           <ul class="oficial-lista">${lacunas}</ul>`
        : `<p class="muted small u-m-0 u-mt-8">${icone("check")} Nenhuma lacuna — todos os itens oficiais têm um tópico seu.</p>`
    }
    ${extras}
    ${r.ignorados ? `<p class="muted small u-mt-8">${plural(r.ignorados, "item dispensado", "itens dispensados")}.</p>` : ""}
    <div class="form-acoes"><button class="btn btn-ghost btn-sm" data-action="oficial-recolar" data-tip="Colar um edital novo/retificado e ver o que mudou (preserva o que você já mapeou).">${icone("repeat-2")} Revalidar (edital novo)</button><button class="btn btn-ghost btn-sm lnk-danger" data-action="limpar-oficial">Limpar checklist</button></div>
  </div>`;
}
// Relatório do DIFF (Fase 5): o que mudou entre o checklist atual e o novo edital colado.
function oficialDiffHTML(d) {
  const lista = (arr, ico) => arr.length ? `<ul class="oficial-lista">${arr.map((i) => `<li class="oficial-lac"><span class="oficial-ref">${ico} ${esc(i.ref)}${i.disciplina ? ` <span class="muted small">(${esc(i.disciplina)})</span>` : ""}</span></li>`).join("")}</ul>` : `<p class="muted small u-mt-4 u-mb-8">— nenhum —</p>`;
  const renoms = d.renomeacoes.length
    ? `<div class="muted small u-mt-12 u-mb-4">${icone("repeat-2")} <b>Possíveis renomeações</b> (o nome antigo vira sinônimo do tópico, preservando a cobertura):</div>
       <ul class="oficial-lista">${d.renomeacoes.map((rn, i) => `<li class="oficial-lac"><input type="checkbox" class="renom-cb" data-i="${i}" ${rn.topicoId ? "checked" : ""} /> <span class="oficial-ref"><b>${esc(rn.de)}</b> → <b>${esc(rn.para)}</b>${rn.topicoId ? "" : ` <span class="muted small">(sem tópico vinculado — não cria sinônimo)</span>`}</span></li>`).join("")}</ul>`
    : "";
  return `<div class="card oficial-card">
    <h3>${icone("repeat-2")} O que mudou no edital</h3>
    <p class="muted small">Compare com o checklist atual e confirme. <b>${d.mantidos}</b> ${d.mantidos === 1 ? "item segue igual" : "itens seguem iguais"}.</p>
    <div class="muted small u-mt-8 u-mb-4">${icone("plus")} <b>Novos</b> (${d.novos.length}) — passam a ser conferidos (viram lacuna se não tiver tópico):</div>
    ${lista(d.novos, icone("plus"))}
    <div class="muted small u-mt-8 u-mb-4">${icone("minus")} <b>Removidos</b> (${d.removidos.length}) — saem do checklist (seu tópico vira "extra"):</div>
    ${lista(d.removidos, icone("minus"))}
    ${renoms}
    <div class="form-acoes"><button class="btn btn-ghost" data-action="oficial-cancelar-diff">Cancelar</button><button class="btn btn-primary" data-action="oficial-aplicar-diff">Aplicar mudanças</button></div>
  </div>`;
}

// ---- Fase 4: Plano do cursinho (aulas) ----
// Parser dedicado das aulas: "Nome da aula: t1; t2; t3" por linha (nome antes do 1º ":",
// assuntos depois, separados por ;). Aceita também "Nome:" sozinho + assuntos nas linhas
// seguintes. Linha sem ":" e sem aula atual vira o nome de uma aula.
function parseAulas(texto, disciplinas) {
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
  // Rótulo + descrição na MESMA linha, sem ':' — ex.: "Aula 00 - Ortografia oficial. Acentuação
  // gráfica. Fonemas" (formato de grade do Estratégia/Gran). Rótulo antes do traço = nome; o
  // restante = assuntos (assim liga ao edital e o título exibido reconstrói a linha original).
  const mTracoRe = /^(aula\s*\d+\p{L}*)\s*[-–—]\s+(.+)$/iu;
  // Muitas grades NÃO escrevem a palavra "Disciplina:" — só soltam o nome da matéria em maiúsculas
  // como linha própria ("DIREITO CONSTITUCIONAL") separando os blocos de aula. Sem reconhecer isso,
  // "Aula 00" (e todas as outras da seção) ficavam sem disciplina — mesmo já tendo tópicos —, porque
  // aquela linha "solta" virava uma aula fantasma e nunca atualizava `disciplinaAtual`.
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const discNomes = (disciplinas || []).map((d) => d.nome).filter(Boolean);
  const achaCabecalhoDisciplina = (l) => {
    if (!l || l.length > 60 || l.includes(":") || mTracoRe.test(l) || /^aula\s*\d+/i.test(l)) return null;
    const ln = norm(l);
    if (!ln) return null;
    return discNomes.find((dn) => { const dnl = norm(dn); return dnl.length >= 4 && (dnl === ln || ln.startsWith(dnl) || dnl.startsWith(ln)); }) || null;
  };
  for (const l of linhas) {
    // Cabeçalho de disciplina: "DISCIPLINA: Nome" / "Disciplina - Nome" → muda o contexto, não vira aula.
    const mDisc = l.match(/^disciplina\s*[:\-–]\s*(.+)$/i);
    if (mDisc) { disciplinaAtual = mDisc[1].trim(); continue; }
    const bateuDisc = achaCabecalhoDisciplina(l);
    if (bateuDisc) { disciplinaAtual = bateuDisc; continue; }
    const i = l.indexOf(":");
    const mTraco = i < 0 ? l.match(mTracoRe) : null;
    if (i > 0) {
      const resto = l.slice(i + 1).trim();
      atual = { nome: l.slice(0, i).trim(), topicos: resto ? split(resto) : [], disciplina: disciplinaAtual };
      aulas.push(atual);
    } else if (mTraco) {
      atual = { nome: mTraco[1].trim(), topicos: split(mTraco[2]), disciplina: disciplinaAtual };
      aulas.push(atual);
    } else if (atual && !/^aula\s*\d+/i.test(l)) {
      atual.topicos.push(...split(l));
    } else {
      atual = { nome: l, topicos: [], disciplina: disciplinaAtual };
      aulas.push(atual);
    }
  }
  return aulas.filter((a) => a.nome);
}
// Título EXIBIDO da aula = rótulo cadastrado ("Aula 00") + a descrição de assuntos como veio do
// cursinho, reconstruindo "Aula 00 - Ortografia oficial. Acentuação gráfica. Fonemas". O rótulo
// fica em a.nome (usado para casar/rebater grades); os assuntos originais em a.assuntos. Sem
// assuntos (ex.: aula criada à mão), mostra só o rótulo.
function tituloAula(a) {
  const ass = (a.assuntos || []).map((s) => (s || "").trim()).filter(Boolean);
  return ass.length ? `${a.nome} - ${ass.join(". ")}` : (a.nome || "");
}
// Dentro do grupo da própria disciplina, o prefixo "Direito Constitucional - " no nome da aula é
// repetição do cabeçalho logo acima: some da linha (o dado continua intacto no nome da aula).
function nomeCurtoAula(a, grupoNome) {
  const nome = a.nome || "";
  if (!grupoNome) return nome;
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const m = nome.match(/^(.+?)\s[-–—]\s*(.+)$/);
  return m && norm(m[1]) === norm(grupoNome) ? m[2].trim() : nome;
}
function tituloAulaNoGrupo(a, grupoNome) {
  const curto = nomeCurtoAula(a, grupoNome);
  const ass = (a.assuntos || []).map((s) => (s || "").trim()).filter(Boolean);
  return ass.length ? `${curto} - ${ass.join(". ")}` : curto;
}
// Convite compacto quando AINDA não há aulas: o plano do cursinho é opcional.
// Reusa a ação "importar-aulas-mais" (abre o importador completo) — sem novo handler.
function aulasConviteHTML() {
  return `<div class="card cursinho-card cursinho-convite">
    <div class="plano-h"><h2>Plano do cursinho</h2><span class="muted small">opcional</span></div>
    <p class="muted small">Faz um <b>cursinho</b> e quer estudar pela <b>ordem das aulas</b>? Traga a divisão de aulas e o app monta o mapa <b>aula ↔ tópico ↔ edital</b>. <b>Não muda a sua estrutura</b>; é uma visão paralela. Sem isso, você segue normalmente pelo seu edital.</p>
    <div class="form-acoes" style="justify-content:flex-start"><button class="btn btn-primary" data-action="importar-aulas-mais">${icone("download")} Trazer a divisão do cursinho</button></div>
  </div>`;
}
// Exemplo e ajuda do formato do texto — UM lugar só. Existem duas portas para a mesma
// importação (a caixa embutida e o modal "Adicionar aulas"), e a ajuda tinha divergido entre
// elas: a do modal falava de várias disciplinas, a embutida ainda descrevia o formato antigo.
const EXEMPLO_AULAS = "Ex.:\nDIREITO CONSTITUCIONAL\nAula 00: Apresentação do curso\nAula 01: Princípios fundamentais; Direitos e garantias\n\nDIREITO ADMINISTRATIVO\nAula 00: Apresentação\nAula 01: Atos administrativos";
function ajudaMapaHTML() {
  return `<details class="ed-ajuda"><summary>Como o app monta o mapa</summary><div class="ed-ajuda-corpo">
      <p class="u-m-0">Cada aula é uma linha. O app aceita as duas formas que as grades usam: <b>Aula 01: assunto; assunto</b> (nome antes do "<b>:</b>") e <b>Aula 01 - assunto. assunto</b> (nome antes do traço). Os assuntos são separados por "<b>;</b>", por ponto final seguido de maiúscula, por bullets ou por numeração; um subtópico com ":" e vírgulas ("Classes de palavras: substantivo, adjetivo") fica inteiro. Linha sem "<b>:</b>" e sem traço é continuação da aula anterior.</p>
      <p><b>Mais de uma disciplina no mesmo texto</b>: separe em blocos, cada um começando por uma linha com o nome da disciplina — solto (<b>DIREITO PENAL</b>, desde que o nome bata com uma disciplina do seu edital) ou com rótulo (<b>Disciplina: Direito Penal</b>, que sempre funciona). As aulas seguintes pertencem a esse bloco, e cada bloco pode ter a sua "Aula 00" sem conflito. <b>É a disciplina que limita o vínculo</b>: uma aula de Penal só casa com tópicos de Penal. Sem nenhum cabeçalho, o app trata tudo como uma disciplina só — você escolhe qual na revisão.</p>
      <p class="u-m-0">Cada assunto é ligado aos seus tópicos pelo nome (＋ sinônimos), montando o mapa aula ↔ tópico ↔ edital. <b>Nada disso muda a sua estrutura</b>: o que não casar fica listado como pendente na aula.</p>
    </div></details>`;
}
function aulasImportHTML(texto = "") {
  return `<div class="card cursinho-card">
    <h3>${icone("library")} Trazer a divisão do cursinho</h3>
    <p class="muted small">Traga a divisão de aulas do seu cursinho — uma aula por bloco, com os assuntos que ela cobre.</p>
    <label class="btn btn-ghost btn-sm btn-file u-mb-8" data-tip="PDF ou .txt. Pode arrastar aqui.">${icone("paperclip")} Importar de arquivo<input id="aulas-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden /></label>
    <textarea id="aulas-texto" rows="7" placeholder="${esc(EXEMPLO_AULAS)}">${esc(texto)}</textarea>
    ${ajudaMapaHTML()}
    <div class="form-acoes"><button class="btn btn-ghost" data-action="importar-aulas-fechar">Cancelar</button><button class="btn btn-primary" data-action="importar-aulas">Revisar</button></div>
  </div>`;
}

// Preview EDITÁVEL do edital colado: cada disciplina é um card com nome editável + lista de
// tópicos editáveis/removíveis (＋ tópico) + remover disciplina. Voltar / descartar / aplicar.
// Painel de adicionar ao edital (digitar/colar/importar). `texto` preserva o que foi
// colado ao voltar do preview. Usado dentro da janela modal (abrirAddEdital).
function addDiscPanelHTML(texto = "", porItem = false) {
  return `<div class="card">
    <h3>Adicionar ao edital</h3>
    <p class="muted small u-m-0 u-mb-8">Traga o conteúdo programático — disciplinas e tópicos.</p>
    <details class="ed-ajuda"><summary>Como o app separa</summary><div class="ed-ajuda-corpo">
      <p>Uma disciplina por linha (em MAIÚSCULAS ou terminada em ":") e os tópicos nas linhas seguintes. Também vale digitar só uma disciplina. O app separa e mostra tudo para você revisar antes de aplicar.</p>
      <p><b>Por frase</b> (padrão): cada frase do texto vira um tópico — bom para edital escrito em texto corrido. O corte é no ponto final, respeitando abreviações ("arts. 1º a 12") e o que está entre parênteses.</p>
      <p><b>Por item do edital</b>: cada item <b>numerado</b> vira UM tópico e o número é preservado ("(39) Propriedade · Função social · …"). Use quando o edital for numerado — em concurso de magistratura o item numerado é o <b>ponto</b> sorteado na prova oral.</p>
    </div></details>
    <div class="seg u-mb-8" role="group" aria-label="Como quebrar os tópicos">
      <button type="button" class="${porItem ? "" : "on"}" data-action="ed-modo" data-modo="frase" data-tip="Cada frase vira um tópico. Bom para edital em texto corrido.">Por frase</button>
      <button type="button" class="${porItem ? "on" : ""}" data-action="ed-modo" data-modo="item" data-tip="Cada item numerado vira um tópico, com o número preservado. Bom para edital numerado.">Por item do edital</button>
    </div>
    <label class="btn btn-ghost btn-sm btn-file u-mb-8" data-tip="${dicaArquivo("Importar de um PDF ou .txt.")}">${icone("paperclip")} Importar de arquivo
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
    <p class="muted small u-m-0 u-mb-8">Edite os nomes, remova (✕) o que não quiser e acrescente tópicos. Só o que estiver aqui será criado.</p>
    <div class="u-mb-12"><button class="btn btn-ghost btn-sm" data-action="estruturar-edital-ia" data-tip="Reorganiza o edital com a IA — útil quando o texto veio bagunçado (OCR, 2 colunas, numeração). Não inventa tópicos.">${icone("sparkles")} Estruturar com IA</button> <span class="muted small">use se a separação automática não ficou boa</span></div>
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
    <button class="lnk u-mt-8" data-action="add-ed-disc">${icone("plus")} disciplina</button>
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
  const estado = { preview: null, texto: "", porItem: false };
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
      corpo.innerHTML = addDiscPanelHTML(estado.texto, estado.porItem);
      const fileInput = corpo.querySelector("#ed-file");
      if (!fileInput) return;
      ligarDropZone(fileInput);
      // O usuário traz o PDF do edital INTEIRO — vagas, inscrição, recursos, cronograma. Só o
      // conteúdo programático interessa aqui: sem recortar, o edital do 192º produzia 96
      // "disciplinas", das quais 73 eram seções administrativas. Recorta e avisa.
      const preencheCaixa = (texto, { recortar = false } = {}) => {
        let t = texto || "";
        if (recortar) {
          const r = recortarConteudoProgramatico(t);
          if (r.recortado) { t = r.texto; toast("Fiquei só com o conteúdo programático do edital.", "ok"); }
        }
        const ta = corpo.querySelector("#ed-texto");
        if (ta) ta.value = t;
        estado.texto = t;
      };
      fileInput.addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const cfg = store.get().config;
        const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
        const comIA = store.iaDisponivel() && cfg.iaProvider === "gemini" && ehPdf && f.size <= 14 * 1024 * 1024;
        if (comIA) {
          const fim = toastCarregando("Lendo e organizando o edital com a IA… (PDF grande pode levar 1–2 min)");
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
          finally { fim(); }
          const fim2 = toastCarregando("Extraindo o texto do PDF…");
          try {
            const texto = await lerArquivoTexto(f, null, "");
            preencheCaixa(texto, { recortar: ehPdf });
            if (texto && texto.trim()) toast("Texto extraído. Use «Revisar» para conferir.", "ok");
            else toast("Não consegui ler o edital agora. Tente de novo em instantes ou cole o texto.", "erro");
          } catch (_) { toast("Não consegui ler o arquivo. Cole o texto.", "erro"); }
          finally { fim2(); }
          return;
        }
        const fim = toastCarregando("Lendo o arquivo…");
        try {
          const texto = await lerArquivoTexto(f, cfg, "");
          preencheCaixa(texto, { recortar: ehPdf });
          if (texto && texto.trim()) toast("Texto carregado. Use «Revisar» para conferir.");
          else toast(ehPdf ? "PDF escaneado (imagem): conecte a IA (Gemini) em Configurações para extrair com OCR, ou cole o texto." : "Sem texto reconhecido. Cole manualmente.", "erro");
        } catch (err) { try { console.error(err); } catch (_) {} toast("Não consegui ler o arquivo. Cole o texto.", "erro"); }
        finally { fim(); }
      });
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "cancelar-add-disc": () => fechar(),
      // Granularidade da quebra. Guarda o texto já digitado antes de repintar o painel.
      "ed-modo": (el) => {
        estado.texto = corpo.querySelector("#ed-texto")?.value ?? estado.texto;
        estado.porItem = el.getAttribute("data-modo") === "item";
        rerender();
      },
      // "Revisar": separa o edital e abre o PREVIEW editável (não grava ainda).
      separar: () => {
        const texto = corpo.querySelector("#ed-texto").value;
        if (!texto.trim()) return toast("Digite uma disciplina ou cole o texto do edital.", "erro");
        const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const estrutura = linhas.length === 1 && !/[;:]/.test(linhas[0])
          ? [{ nome: linhas[0], topicos: [] }]
          : separarEdital(texto, { porItem: estado.porItem }).map((d) => ({ nome: d.nome || "", topicos: [...(d.topicos || [])] }));
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
        const ds = await comOcupado(() => store.estruturarEditalIA(texto), { botao: el, msg: "Estruturando o edital com a IA…" });
        if (ds == null) return;
        if (ds.length) { estado.texto = texto; estado.preview = ds; toast(`${plural(ds.length, "disciplina estruturada", "disciplinas estruturadas")} pela IA. Revise e aplique.`, "ok"); rerender(); }
        else toast("A IA não retornou uma estrutura. Mantive a versão atual.", "erro");
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

// Disciplina do lote, quando todas as aulas vieram do mesmo arquivo (é o caso do cursinho:
// um PDF por disciplina). Um campo só, no topo, em vez de repetir a mesma coisa em 47 cards.
// Importa porque é o que liga a aula à disciplina quando os assuntos não casam com tópicos.
// A disciplina é ESCOLHIDA na lista do edital, não digitada: digitar "Const." onde o edital diz
// "Direito Constitucional" não casa nada, e o erro só aparece depois, no plano montado. "Outra"
// existe para o curso de matéria que não está no edital — aí nada é vinculado, de propósito.
function aulasDisciplinaHTML(aulas, disciplinas) {
  const nomes = new Set((aulas || []).map((a) => (a.disciplina || "").trim()));
  if (nomes.size !== 1) return "";
  const disc = [...nomes][0];
  const doEdital = (disciplinas || []).find((d) => (d.nome || "").toLowerCase() === disc.toLowerCase());
  const outra = !!disc && !doEdital;
  return `<label class="ed-prev-disc-lote">
    <span class="muted small">Disciplina destas aulas${disc ? "" : " — escolha: os assuntos só casam com tópicos dela"}</span>
    <select class="prev-inp aula-disc-sel">
      <option value="" ${!disc ? "selected" : ""}>Escolha a disciplina…</option>
      ${(disciplinas || []).map((d) => `<option value="${esc(d.nome)}" ${doEdital && doEdital.id === d.id ? "selected" : ""}>${esc(d.nome)}</option>`).join("")}
      <option value="__outra" ${outra ? "selected" : ""}>Outra (fora do meu edital)</option>
    </select>
    <input class="prev-inp aula-disc-lote" value="${esc(outra ? disc : "")}" placeholder="Nome da disciplina" ${outra ? "" : "hidden"} />
    <span class="muted small aula-disc-aviso" ${outra ? "" : "hidden"}>Fora do edital: as aulas ficam no plano, mas sem vínculo com tópico nenhum.</span>
  </label>`;
}

// Preview EDITÁVEL das aulas do cursinho: cada aula é um card com nome + assuntos editáveis.
function aulasPreviewHTML(aulas, disciplinas) {
  // Plano com mais de uma disciplina (cabeçalhos no texto): o campo único não serve, e esconder
  // a disciplina de cada aula obrigaria a confiar no parser sem poder conferir nem corrigir.
  const porAula = new Set((aulas || []).map((a) => (a.disciplina || "").trim())).size > 1;
  return `<div class="card cursinho-card">
    <div class="plano-h"><h2>Revisar ${plural(aulas.length, "aula", "aulas")} antes de montar o plano</h2></div>
    <p class="muted small u-m-0 u-mb-12">Edite o nome da aula e os assuntos; remova (✕) o que não quiser. Os assuntos serão ligados aos seus tópicos pelo nome (＋ sinônimos).</p>
    ${aulasDisciplinaHTML(aulas, disciplinas)}
    ${porAula ? `<p class="muted small u-mb-8">${icone("shuffle")} Este plano tem <b>mais de uma disciplina</b>: confira a de cada aula abaixo (veio dos cabeçalhos do texto).</p>` : ""}
    <div class="ed-prev-lista">
      ${aulas
        .map((a, ai) => {
          const dsc = (a.disciplina || "").trim();
          const noEdital = (disciplinas || []).find((d) => (d.nome || "").toLowerCase() === dsc.toLowerCase());
          return `<div class="prev-card m-pratica ed-prev-disc">
            <div class="prev-card-l1">
              <input class="prev-inp aula-nome" data-a="${ai}" value="${esc(a.nome || "")}" placeholder="Aula" />
              <button class="prev-remover" data-action="remover-aula-prev" data-a="${ai}" data-tip-pos="cima-dir" data-tip="Remover esta aula">${icone("x")}</button>
            </div>
            ${porAula ? `<select class="prev-inp aula-disc-uma u-mt-8" data-a="${ai}" data-tip="Disciplina desta aula — só os tópicos dela podem ser vinculados.">
              <option value="" ${!dsc ? "selected" : ""}>Sem disciplina…</option>
              ${(disciplinas || []).map((d) => `<option value="${esc(d.nome)}" ${noEdital && noEdital.id === d.id ? "selected" : ""}>${esc(d.nome)}</option>`).join("")}
              ${dsc && !noEdital ? `<option value="${esc(dsc)}" selected>${esc(dsc)} (fora do edital)</option>` : ""}
            </select>` : ""}
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

// Campo unificado de "Adicionar aulas": toggle Acrescentar × Atualizar + campo (colar/importar).
function aulasAddInputHTML(estado) {
  const atualizar = estado.modo === "atualizar";
  return `<div class="card cursinho-card">
    <h3>${icone("download")} Adicionar aulas</h3>
    <div class="seg u-mb-12" role="tablist">
      <button class="${!atualizar ? "on" : ""}" data-action="aulas-modo" data-modo="acrescentar" data-tip="Acrescenta as aulas trazidas às que já existem.">Acrescentar</button>
      <button class="${atualizar ? "on" : ""}" data-action="aulas-modo" data-modo="atualizar" data-tip="Compara a grade nova com a atual (o que entrou, saiu, renomeou) e preserva os seus ajustes.">Atualizar grade</button>
    </div>
    <p class="muted small u-m-0 u-mb-8">${atualizar ? "Traga a nova grade — o app compara com a atual e mostra o que entrou, saiu e renomeações, preservando seus ajustes." : "Traga a divisão de aulas — uma aula por bloco, com os assuntos que ela cobre."}</p>
    <label class="btn btn-ghost btn-sm btn-file u-mb-8" data-tip="PDF ou .txt. Pode arrastar aqui.">${icone("paperclip")} Importar de arquivo<input id="aulas-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden /></label>
    <textarea id="aulas-texto" rows="7" placeholder="${esc(atualizar ? "nova grade do cursinho…" : EXEMPLO_AULAS)}">${esc(estado.texto || "")}</textarea>
    ${ajudaMapaHTML()}
    <div class="form-acoes"><button class="btn btn-ghost" data-action="aulas-add-cancelar">Cancelar</button><button class="btn btn-primary" data-action="aulas-add-continuar">${atualizar ? "Conferir o que mudou" : "Revisar"}</button></div>
  </div>`;
}

// Cursos do cursinho que não são disciplina do edital: uma linha por curso, com a distribuição
// real dos vínculos à vista, para a escolha ser informada e não palpite.
function abrirMapearCursos(app) {
  const { store } = app;
  const render = () => {
    const cursos = store.cursosDoPlanoNaoMapeados();
    const st = store.get();
    if (!cursos.length) return `<p class="muted">Nenhum curso pendente: todos já correspondem a uma disciplina do seu edital ou foram marcados como transversais.</p>`;
    return `<p class="muted small u-mt-0">Estes cursos do seu cursinho <b>não são disciplinas do seu edital</b>, então o app não tem régua para conferir os vínculos deles — é por aí que sobra vínculo cruzado depois de "Revisar vínculos". Ligue cada um à disciplina correspondente, ou marque como <b>transversal</b> se ele cobre várias de verdade.</p>
      ${cursos.map((c) => `<div class="card cursinho-card mapa-curso">
        <div class="plano-h"><h3 class="u-m-0">${esc(c.curso)}</h3><span class="muted small">${plural(c.aulas, "aula", "aulas")} · ${plural(c.vinculos, "vínculo", "vínculos")}</span></div>
        <p class="muted small u-m-0 u-mb-8">${c.porDisciplina.length ? `Hoje os vínculos apontam para: ${c.porDisciplina.map((d) => `<b>${esc(d.nome)}</b> (${d.n})`).join(" · ")}` : "Ainda sem vínculo nenhum."}</p>
        <label class="inline">Ligar a:
          <select class="mapa-curso-sel" data-curso="${esc(c.curso)}">
            <option value="">— transversal (não conferir os vínculos) —</option>
            ${st.disciplinas.map((d) => `<option value="${d.id}" ${c.porDisciplina.length && c.porDisciplina[0].id === d.id ? "selected" : ""}>${esc(d.nome)}</option>`).join("")}
          </select>
        </label>
        <div class="form-acoes"><button class="btn btn-soft btn-sm" data-action="mapa-curso-aplicar" data-curso="${esc(c.curso)}">Aplicar a estas ${plural(c.aulas, "aula", "aulas")}</button></div>
      </div>`).join("")}`;
  };
  const j = abrirJanela({ titulo: "Cursos do cursinho fora do edital", corpoHTML: render() });
  const corpo = j.overlay.querySelector(".mm-corpo");
  bindActions(corpo, {
    "mapa-curso-aplicar": (el) => {
      const curso = el.getAttribute("data-curso");
      const sel = corpo.querySelector(`.mapa-curso-sel[data-curso="${CSS.escape(curso)}"]`);
      const discId = sel ? sel.value : "";
      const n = store.mapearCursoDoPlano(curso, discId || null);
      toast(discId ? `${plural(n, "aula ligada", "aulas ligadas")} a ${sel.selectedOptions[0].textContent}.` : `"${curso}" marcado como transversal.`);
      corpo.innerHTML = render();
      app.refresh();
    },
  });
}

// Liga o seletor de disciplina do preview às aulas em edição: escolha do edital, ou "Outra",
// que revela o campo de texto. Um só lugar, porque o preview aparece em dois (tela e modal).
function ligarDiscLote(raiz, aulas) {
  const sel = raiz.querySelector(".aula-disc-sel");
  const inp = raiz.querySelector(".aula-disc-lote");
  const aviso = raiz.querySelector(".aula-disc-aviso");
  if (!aulas) return;
  // Plano de várias disciplinas: um seletor por aula, e não o do lote.
  raiz.querySelectorAll(".aula-disc-uma").forEach((el) =>
    el.addEventListener("change", () => {
      const a = parseInt(el.getAttribute("data-a"), 10);
      if (aulas[a]) aulas[a].disciplina = el.value.trim() || null;
    })
  );
  if (!sel) return;
  const aplicar = (v) => aulas.forEach((a) => (a.disciplina = v || null));
  sel.addEventListener("change", () => {
    const outra = sel.value === "__outra";
    if (inp) inp.hidden = !outra;
    if (aviso) aviso.hidden = !outra;
    if (outra) { if (inp) { inp.focus(); aplicar(inp.value.trim()); } }
    else aplicar(sel.value);
  });
  inp?.addEventListener("input", () => { if (sel.value === "__outra") aplicar(inp.value.trim()); });
}

// Adicionar aulas UNIFICADO: um modal com toggle Acrescentar (parse→preview→cria) ou Atualizar
// (parse→diff→aplica). Substitui os antigos "Colar mais aulas" e "Atualizar grade".
function abrirAdicionarAulas(app, modoInicial = "acrescentar") {
  const { store } = app;
  const estado = { modo: modoInicial, texto: "", preview: null, diff: null };
  abrirJanelaFluxo({
    titulo: "Adicionar aulas",
    render: (corpo, { rerender }) => {
      if (estado.preview) {
        corpo.innerHTML = aulasPreviewHTML(estado.preview, store.get().disciplinas);
        corpo.querySelectorAll(".aula-nome").forEach((el) => el.addEventListener("input", () => { const a = +el.getAttribute("data-a"); if (estado.preview[a]) estado.preview[a].nome = el.value; }));
        corpo.querySelectorAll(".aula-top").forEach((el) => el.addEventListener("input", () => { const a = +el.getAttribute("data-a"); const t = +el.getAttribute("data-t"); if (estado.preview[a] && estado.preview[a].topicos) estado.preview[a].topicos[t] = el.value; }));
        ligarDiscLote(corpo, estado.preview);
        return;
      }
      if (estado.diff) { corpo.innerHTML = aulasDiffHTML(estado.diff, store.get()); return; }
      corpo.innerHTML = aulasAddInputHTML(estado);
      const aulasFile = corpo.querySelector("#aulas-file");
      if (!aulasFile) return;
      ligarDropZone(aulasFile);
      aulasFile.addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        const cfg = store.get().config;
        const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
        // Acrescentar lê a apostila direto: primeiro o sumário por pdf.js (offline, sem cota,
        // sem teto de tamanho), e só depois a IA. Atualizar continua sendo por texto.
        if (estado.modo === "acrescentar" && ehPdf) {
          const fim = toastCarregando("Lendo o sumário da apostila…");
          let aulas = [];
          try {
            const { paginas, numPaginas } = await extrairPdfPaginas(f, { ate: 20 });
            const disciplina = disciplinaDoNomeDeArquivo(f.name);
            aulas = aulasDoSumario(paginas, { disciplina, numPaginas });
            if (aulas.length < 2 && store.iaDisponivel()) aulas = await store.aulasDoSumarioVisao(f, { disciplina, paginas, numPaginas });
          } catch (err) { try { console.error(err); } catch (_) {} }
          finally { fim(); }
          if (aulas.length >= 2) { estado.preview = aulas; toast(`${plural(aulas.length, "aula lida", "aulas lidas")} do sumário. Revise e monte o plano.`, "ok"); rerender(); return; }
        }
        // Acrescentar aceita a leitura rica por IA do PDF (aulas + assuntos direto); atualizar só texto.
        if (estado.modo === "acrescentar" && store.iaDisponivel() && cfg.iaProvider === "gemini" && ehPdf && f.size <= 14 * 1024 * 1024) {
          const fim = toastCarregando("Lendo o plano do cursinho com a IA… (pode levar 1–2 min)");
          try {
            const aulas = await store.estruturarAulasDePDF(await arquivoParaBase64(f), f.type || "application/pdf");
            if (aulas && aulas.length) { estado.preview = aulas; toast(`${plural(aulas.length, "aula lida", "aulas lidas")} pela IA. Revise e monte o plano.`, "ok"); rerender(); return; }
            toast("A IA não reconheceu aulas. Extraindo o texto…", "erro");
          } catch (_) { toast("A IA não conseguiu ler agora. Extraindo o texto…", "erro"); }
          finally { fim(); }
        }
        const fim = toastCarregando("Lendo o arquivo…");
        try { const texto = await lerArquivoTexto(f, cfg, ""); const ta = corpo.querySelector("#aulas-texto"); if (ta) ta.value = texto || ""; estado.texto = texto || ""; toast(texto && texto.trim() ? "Texto carregado." : (ehPdf ? "PDF escaneado: conecte a IA (Gemini) para OCR, ou cole o texto." : "Sem texto reconhecido. Cole manualmente."), texto && texto.trim() ? "ok" : "erro"); }
        catch (_) { toast("Não consegui ler o arquivo. Cole o texto.", "erro"); }
        finally { fim(); }
      });
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "aulas-modo": (el) => { const ta = corpo.querySelector("#aulas-texto"); if (ta) estado.texto = ta.value; estado.modo = el.getAttribute("data-modo"); rerender(); },
      "aulas-add-cancelar": () => fechar(),
      "aulas-add-continuar": () => {
        const texto = corpo.querySelector("#aulas-texto").value;
        if (!texto.trim()) return toast("Traga a divisão de aulas.", "erro");
        estado.texto = texto;
        if (estado.modo === "atualizar") {
          const diff = store.diffAulasCursinho(parseAulas(texto, store.get().disciplinas));
          if (!diff.novas.length && !diff.removidas.length) { fechar(); return toast("Nenhuma diferença em relação à grade atual.", "ok"); }
          estado.diff = diff; rerender();
        } else {
          const estrutura = parseAulas(texto, store.get().disciplinas).map((a) => ({ nome: a.nome || "", topicos: [...(a.topicos || [])], disciplina: a.disciplina || null }));
          if (!estrutura.length) return toast("Não reconheci aulas no texto.", "erro");
          estado.preview = estrutura; rerender();
        }
      },
      // Preview (acrescentar)
      "remover-aula-prev": (el) => { const a = +el.getAttribute("data-a"); if (estado.preview) estado.preview.splice(a, 1); if (estado.preview && !estado.preview.length) estado.preview = null; rerender(); },
      "remover-aula-top": (el) => { const a = +el.getAttribute("data-a"); const t = +el.getAttribute("data-t"); if (estado.preview && estado.preview[a]) estado.preview[a].topicos.splice(t, 1); rerender(); },
      "add-aula-top": (el) => { const a = +el.getAttribute("data-a"); if (estado.preview && estado.preview[a]) estado.preview[a].topicos.push(""); rerender(); },
      "voltar-aulas": () => { estado.preview = null; rerender(); },
      "descartar-aulas": () => fechar(),
      "aceitar-aulas": () => {
        const estrutura = (estado.preview || []).map((a) => ({ nome: (a.nome || "").trim(), topicos: (a.topicos || []).map((t) => (t || "").trim()).filter(Boolean), disciplina: a.disciplina || null })).filter((a) => a.nome);
        if (!estrutura.length) return toast("Nenhuma aula para criar.", "erro");
        const r = store.importarAulasCursinho(estrutura);
        toast(r.criadas ? `${plural(r.criadas, "aula criada", "aulas criadas")}.${r.naoCasados.length ? ` ${plural(r.naoCasados.length, "assunto não casou", "assuntos não casaram")} com seus tópicos.` : ""}` : "Não reconheci aulas.", r.criadas ? "ok" : "erro");
        fechar(); app.refresh();
      },
      // Diff (atualizar)
      "aulas-cancelar-diff": () => { estado.diff = null; rerender(); },
      "aulas-aplicar-diff": () => {
        if (!estado.diff) return;
        const renomearIds = [...corpo.querySelectorAll(".aula-ren-cb:checked")].map((cb) => cb.getAttribute("data-id"));
        const removerIds = [...corpo.querySelectorAll(".aula-rem-cb:checked")].map((cb) => cb.getAttribute("data-id"));
        const r = store.aplicarAulasDiff(estado.diff, renomearIds, removerIds);
        toast(`Grade atualizada: ${plural(r.add, "nova", "novas")}, ${plural(r.rem, "removida", "removidas")}${r.ren ? `, ${plural(r.ren, "renomeação", "renomeações")}` : ""}.`);
        fechar(); app.refresh();
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
    <label class="btn btn-ghost btn-sm btn-file u-mb-8" data-tip="${dicaArquivo("Importar de um PDF ou .txt.")}">${icone("paperclip")} Selecionar arquivo
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
          onTexto: (texto) => { const ta = corpo.querySelector("#dest-texto"); if (ta) ta.value = texto; if (texto.trim()) toast("Texto carregado. Use «Marcar relevância»."); },
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

// "Anexar link" a um tópico — UM modal com os 2 campos (URL obrigatória + título opcional).
// Título vazio → deriva do domínio. Usado pela tabela do Edital e pelo dossiê do tópico.
export function abrirAnexarLink(app, topicoId) {
  const { store } = app;
  abrirJanela({
    titulo: "Anexar link ao tópico",
    corpoHTML: `
      <p class="muted small u-m-0 u-mb-8">Videoaula, PDF, caderno de questões… O link fica guardado no <b>dossiê</b> do tópico. O título é opcional — sem ele, usamos o nome do site.</p>
      <div class="form-inline-mini"><input id="lnk-url" type="url" placeholder="https://… (obrigatório)" /></div>
      <div class="form-inline-mini"><input id="lnk-titulo" type="text" placeholder="Título (opcional)" /></div>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="lnk-cancelar">Cancelar</button>
        <button class="btn btn-primary" data-action="lnk-anexar">Anexar</button>
      </div>`,
    aoMontar: (overlay, fechar) => {
      const corpo = overlay.querySelector(".mm-corpo");
      bindActions(corpo, {
        "lnk-cancelar": () => fechar(),
        "lnk-anexar": () => {
          const url = (corpo.querySelector("#lnk-url")?.value || "").trim();
          if (!url) return toast("Informe a URL do link.", "erro");
          let titulo = (corpo.querySelector("#lnk-titulo")?.value || "").trim();
          if (!titulo) {
            try { titulo = new URL(url).hostname.replace(/^www\./, ""); } catch { titulo = ""; }
          }
          store.addLinkTopico(topicoId, { titulo, url });
          toast("Link anexado ao tópico.");
          fechar();
          app.refresh();
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
      // Sem IA e sem rede: os números já estão no material que o usuário importou.
      "sug-material": (el) => {
        estado.carregando = "material"; estado.rel = null; rerender();
        try {
          const r = store.sugerirRelevanciaPorMaterial(el.dataset.id);
          estado.rel = r;
          if (!r.itens.length) toast("Não achei estatística de incidência aplicável aos seus tópicos neste material.", "erro");
          else {
            const partes = [`${plural(r.itens.length, "tópico casado", "tópicos casados")}`];
            if (r.naoEncontrados.length) partes.push(`${plural(r.naoEncontrados.length, "tema ficou", "temas ficaram")} sem correspondência`);
            // Disciplina do material que não existe no edital não é descartada: os temas dela são
            // procurados no edital inteiro (a Legislação Penal Especial mora dentro do Penal).
            if (r.disciplinasIgnoradas.length) partes.push(`${r.disciplinasIgnoradas.join(", ")} não é disciplina do seu edital — procurei os temas dela no edital inteiro`);
            toast(partes.join(" · ") + ".", "ok");
          }
        } catch (e) { console.error(e); toast("Não consegui ler a estatística deste material.", "erro"); }
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
          onTexto: (texto) => { const ta = corpo.querySelector("#oficial-texto"); if (ta) ta.value = texto; if (texto.trim()) toast("Texto carregado. Use «Validar cobertura» para conferir."); },
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

function aulasDiffHTML(d, st) {
  const discDe = (a) => { const x = (st.disciplinas || []).find((y) => y.id === a.disciplinaId); return x ? x.nome : (a.disciplinaNome || ""); };
  const novas = d.novas.length
    ? `<ul class="oficial-lista">${d.novas.map((e) => `<li class="oficial-lac"><span class="oficial-ref">${icone("plus")} ${e.disciplina ? `<span class="muted small">${esc(e.disciplina)} · </span>` : ""}${esc(e.nome)} <span class="muted small">(${plural((e.topicos || []).length, "assunto", "assuntos")})</span></span></li>`).join("")}</ul>`
    : `<p class="muted small u-mt-4 u-mb-8">— nenhuma —</p>`;
  const removidas = d.removidas.length
    ? `<ul class="oficial-lista">${d.removidas.map((a) => `<li class="oficial-lac"><input type="checkbox" class="aula-rem-cb" data-id="${a.id}" checked /> <span class="oficial-ref">${icone("minus")} ${discDe(a) ? `<span class="muted small">${esc(discDe(a))} · </span>` : ""}${esc(a.nome)}</span></li>`).join("")}</ul>`
    : `<p class="muted small u-mt-4 u-mb-8">— nenhuma —</p>`;
  const renoms = d.renomeacoes.length
    ? `<div class="muted small u-mt-12 u-mb-4">${icone("repeat-2")} <b>Possíveis renomeações</b> (mantém os tópicos da aula):</div>
       <ul class="oficial-lista">${d.renomeacoes.map((rn) => `<li class="oficial-lac"><input type="checkbox" class="aula-ren-cb" data-id="${rn.aulaId}" checked /> <span class="oficial-ref"><b>${esc(rn.de)}</b> → <b>${esc(rn.para)}</b></span></li>`).join("")}</ul>`
    : "";
  return `<div class="card cursinho-card">
    <h3>${icone("repeat-2")} O que mudou na grade</h3>
    <div class="muted small u-mt-8 u-mb-4">${icone("plus")} <b>Novas aulas</b> (${d.novas.length}):</div>${novas}
    <div class="muted small u-mt-8 u-mb-4">${icone("minus")} <b>Removidas</b> (${d.removidas.length}) — marque as que quer remover:</div>${removidas}
    ${renoms}
    <div class="form-acoes"><button class="btn btn-ghost" data-action="aulas-cancelar-diff">Cancelar</button><button class="btn btn-primary" data-action="aulas-aplicar-diff">Aplicar mudanças</button></div>
  </div>`;
}
function aulaTopEditorHTML(st, a, discDaAula) {
  const sel = new Set(a.topicoIds || []);
  // Cada disciplina é um <details> recolhido — mostrar as 400+ tópicos de TODAS as
  // disciplinas de uma vez era a poluição visual que o usuário reclamou (só a disciplina da
  // própria aula, quando conhecida, já abre sozinha; as outras o usuário abre se precisar).
  // A disciplina da AULA vem primeiro e sinalizada: as outras aparecem marcadas como fora dela,
  // porque marcar ali cria exatamente o vínculo cruzado que a revisão de vínculos vai apontar.
  const discId = discDaAula && discDaAula.id ? discDaAula.id : a.disciplinaId;
  const ordenadas = discId ? [...st.disciplinas].sort((x, y) => (x.id === discId ? -1 : y.id === discId ? 1 : 0)) : st.disciplinas;
  const grupos = ordenadas
    .map((disc) => {
      const tops = st.topicos.filter((t) => t.disciplinaId === disc.id);
      if (!tops.length) return "";
      const daAula = discId && disc.id === discId;
      const marcados = tops.filter((t) => sel.has(t.id)).length;
      const aberta = daAula || marcados > 0;
      const etiqueta = daAula
        ? ` <span class="mini-tag" data-tip="Disciplina desta aula.">${icone("check")} desta aula</span>`
        : discId ? ` <span class="muted small">fora da disciplina desta aula</span>` : "";
      return `<details class="ft-grupo${daAula ? " ft-grupo-daaula" : ""}"${aberta ? " open" : ""}><summary class="ft-disc-h"><b>${esc(disc.nome)}</b>${etiqueta}${marcados ? ` <span class="muted small">(${marcados} marcado${marcados > 1 ? "s" : ""})</span>` : ""}</summary>${tops.map((t) => `<label class="ft-top"><input type="checkbox" class="aula-top-chk" data-aula="${a.id}" value="${t.id}" ${sel.has(t.id) ? "checked" : ""} /> ${esc(t.nome)}</label>`).join("")}</details>`;
    })
    .join("");
  return `<div class="aula-top-editor"><div class="muted small u-mt-8 u-mb-8">${icone("files")} Tópicos que esta aula cobre — marque todos (uma aula pode cobrir vários). Salva na hora.</div>${grupos || `<p class="muted small">Sem tópicos cadastrados.</p>`}<div class="form-acoes"><button class="btn btn-ghost btn-sm" data-action="aula-topicos" data-id="${a.id}">Fechar</button></div></div>`;
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
  // Ordem: a MESMA que o Hoje usa para estudar (disciplina na ordem de aparição, aulas pelo
  // número). Não há ordenação de tela nem reordenação à mão — a tela não pode divergir do estudo.
  const display = store.aulasEmOrdem().map((a) => ({ a }));
  // A disciplina de uma aula é a do CURSINHO, não a vinculação por edital: a aula 00, que é
  // introdutória e não casa com tópico nenhum, pertence à disciplina do bloco em que veio.
  // A régua mora no store (disciplinaDePlano), porque a correção de vínculos usa a mesma.
  const discPorAula = store.disciplinaDePlano();
  const discDeAula = (a) => { const d = discPorAula.get(a.id); return d && d.nome ? d.nome : "Sem disciplina"; };
  const discNomeDe = (t) => { const d = st.disciplinas.find((x) => x.id === t.disciplinaId); return d ? d.nome : ""; };
  // AULA protagonista: nome da aula em cima; os TÓPICOS do edital que ela cobre embaixo
  // (cada um clicável, abre o dossiê). Bolinha com a cor da disciplina; sem títulos de
  // disciplina no meio (lista corrida na ordem das aulas).
  const aulaRow = ({ a }, grupoNome) => {
      const tops = (a.topicoIds || []).map((id) => st.topicos.find((t) => t.id === id)).filter(Boolean);
      const discIds = [...new Set(tops.map((t) => t.disciplinaId).filter(Boolean))];
      const multi = discIds.length > 1;
      const concl = tops.filter((t) => t.concluido).length;
      // Assuntos do cursinho que ainda não casaram com tópico do edital (no preview aparecem;
      // aqui não podem sumir). Calculado antes do cabeçalho porque o contador vive nele.
      const naoCasados = (a.assuntos || []).map((s) => (s || "").trim()).filter(Boolean).filter((asn) => !store.acharTopicoPorNome(asn, { disciplinaId: a.disciplinaId, restrito: !!a.disciplinaId }));
      const rotuloTops = [
        tops.length ? `${tops.length} ${tops.length === 1 ? "tópico do edital" : "tópicos do edital"}` : "",
        naoCasados.length ? `${naoCasados.length} sem tópico` : "",
      ].filter(Boolean).join(" · ");
      return `<div class="cur-aula-row">
        <div class="cur-aula-head">
          <div class="cur-aula-titulo">
            <b class="cur-aula-nome">${esc(tituloAulaNoGrupo(a, grupoNome))}</b>
            ${tops.length || naoCasados.length
              ? `<details class="cur-aula-acc" data-aula-acc="${a.id}" ${curTopsAbertos.has(a.id) ? "open" : ""}>
                  <summary class="cur-aula-acc-sum">${icone("chevron-down")} <span>${rotuloTops}</span></summary>
                  <div class="cur-aula-tops">
                    ${tops.map((t) => `<button class="cur-top ${t.concluido ? "done" : ""}" data-action="ir-dossie" data-id="${t.id}" data-tip="Abrir o dossiê de ${esc(t.nome)}">${t.concluido ? `<span class="cur-top-chk">${icone("check")}</span>` : ""}${multi ? `<span class="cur-top-disc">${esc(discNomeDe(t))}</span>` : ""}<span class="cur-top-nome">${esc(t.nome)}</span><span class="mapa-abrir-ico">${icone("external-link")}</span></button>`).join("")}
                  </div>
                  ${naoCasados.length ? `<div class="cur-aula-pend muted small">${icone("link")} Assuntos da aula sem tópico do edital: ${naoCasados.map((asn) => `<span class="cur-assunto-chip">${esc(asn)}</span>`).join(" ")} <button class="lnk" data-action="compatibilizar-aulas-ia" data-tip="A IA casa esses assuntos com seus tópicos.">casar com IA</button></div>` : ""}
                </details>`
              : `<span class="cur-sem muted small">${icone("link")} sem tópico do edital — <button class="lnk" data-action="aula-topicos" data-id="${a.id}">vincular</button></span>`}
          </div>
          ${multi ? `<span class="mini-tag" data-tip="Esta aula cobre mais de uma disciplina.">${icone("shuffle")} ${discIds.length} disc.</span>` : ""}
          <span class="spacer"></span>
          ${tops.length ? `<span class="cur-prog" data-tip="Tópicos desta aula concluídos.">${concl}/${tops.length}</span>` : ""}
          <button class="lnk cur-edit" data-action="aula-topicos" data-id="${a.id}" data-tip-pos="cima-dir" data-tip="Definir os tópicos desta aula">${icone("square-pen")}</button>
          <details class="doc-mais ed-top-mais">
            <summary class="ed-top-mais-sum" data-tip-pos="cima-dir" data-tip="Mais ações para esta aula.">${icone("ellipsis")}</summary>
            <div class="doc-mais-pop" role="menu">
              <button class="menu-item" data-action="aula-renomear" data-id="${a.id}" data-tip="O número no nome define a posição da aula na disciplina."><span class="menu-ico">${icone("square-pen")}</span> Renomear</button>
              <button class="menu-item" data-action="aula-disciplina" data-id="${a.id}" data-tip="Define a disciplina desta aula. É ela que limita quais tópicos podem ser vinculados."><span class="menu-ico">${icone("library")}</span> Definir disciplina</button>
              <div class="menu-sep"></div>
              <button class="menu-item menu-item-danger" data-action="aula-remover" data-id="${a.id}"><span class="menu-ico">${icone("x")}</span> Remover aula</button>
            </div>
          </details>
        </div>
        ${aulaTopAberto === a.id ? aulaTopEditorHTML(st, a, discPorAula.get(a.id)) : ""}
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
  // Cabeçalho de um grupo — o MESMO nas duas visões: bolinha da cor, nome, contagem, chevron.
  const grupoHTML = (nome, cor, contagem, corpo) => `<details class="cur-disc" style="--acc:${cor}" data-cur-grupo="${esc(nome)}" ${curAcFechada.has(nome) ? "" : "open"}>
      <summary class="cur-disc-h"><span class="cur-dot" style="background:${cor}"></span><span class="cur-disc-nome">${esc(nome)}</span><span class="cur-grupo-n">${contagem}</span><span class="spacer"></span><span class="cur-disc-chev">${icone("chevron-down")}</span></summary>
      <div class="cur-aula-list">${corpo}</div>
    </details>`;
  const cards = grupos.map((g) => {
    const d = st.disciplinas.find((x) => x.nome === g.disc);
    const cor = d ? store.corDisciplina(d.id) : "var(--muted)";
    return grupoHTML(g.disc, cor, `${g.itens.length} aula${g.itens.length === 1 ? "" : "s"}`, g.itens.map((it) => aulaRow(it, g.disc)).join(""));
  }).join("");
  // Modo "por tópico": o inverso do "por aula". As disciplinas seguem a MESMA ordem da outra
  // visão (a do plano; as que não têm aula vão para o fim) — duas ordens diferentes faziam as
  // duas abas parecerem telas de apps distintos.
  const ordemGrupo = new Map(grupos.map((g, i) => [g.disc, i]));
  const discsOrdenadas = [...st.disciplinas].sort((a, b) => {
    const ia = ordemGrupo.has(a.nome) ? ordemGrupo.get(a.nome) : 9999;
    const ib = ordemGrupo.has(b.nome) ? ordemGrupo.get(b.nome) : 9999;
    return ia - ib;
  });
  const bodyTopico = discsOrdenadas.map((d) => {
    const tps = st.topicos.filter((t) => t.disciplinaId === d.id);
    if (!tps.length) return "";
    const cor = store.corDisciplina(d.id);
    const rows = tps.map((t) => {
      const aulasT = st.aulas.filter((a) => (a.topicoIds || []).includes(t.id));
      // "Aula 01" existe em toda disciplina: a chip só identifica a aula se disser de onde ela é
      // quando vier de OUTRA disciplina (o caso que a revisão de vínculos aponta).
      // Mesma anatomia da outra visão: título em cima, vínculos no bloco recolhido embaixo.
      const chips = aulasT.map((a) => {
        const da = discPorAula.get(a.id);
        const outra = da && da.nome && da.nome !== d.nome;
        return `<span class="cur-top cur-top-estatico${outra ? " cur-top-fora" : ""}"${outra ? ` data-tip="Esta aula é de ${esc(da.nome)} — vínculo fora da disciplina."` : ""}>${outra ? `<span class="cur-top-disc">${esc(da.nome)}</span>` : ""}<span class="cur-top-nome">${esc(nomeCurtoAula(a, da && da.nome))}</span></span>`;
      }).join("");
      return `<div class="cur-aula-row">
        <div class="cur-aula-head">
          <div class="cur-aula-titulo">
            <b class="cur-aula-nome"><button class="lnk cur-top-lnk" data-action="ir-dossie" data-id="${t.id}">${esc(t.nome)}<span class="mapa-abrir-ico">${icone("external-link")}</span></button></b>
            ${aulasT.length
              ? `<details class="cur-aula-acc" data-aula-acc="top:${t.id}" ${curTopsAbertos.has("top:" + t.id) ? "open" : ""}>
                  <summary class="cur-aula-acc-sum">${icone("chevron-down")} <span>${plural(aulasT.length, "aula do cursinho", "aulas do cursinho")}</span></summary>
                  <div class="cur-aula-tops">${chips}</div>
                </details>`
              : `<span class="cur-sem muted small">${icone("link")} sem aula do cursinho — nem todo tópico precisa de uma</span>`}
          </div>
        </div>
      </div>`;
    }).join("");
    return grupoHTML(d.nome, cor, `${tps.length} tópico${tps.length === 1 ? "" : "s"}`, rows);
  }).join("");
  const nomesGrupos = cursinhoView === "aula"
    ? grupos.map((g) => g.disc)
    : st.disciplinas.filter((d) => st.topicos.some((t) => t.disciplinaId === d.id)).map((d) => d.nome);
  const algumGrupoAberto = nomesGrupos.some((n) => !curAcFechada.has(n));
  // Dois controles com finalidades diferentes: um abre/fecha as DISCIPLINAS (os blocos
  // coloridos), outro abre/fecha os VÍNCULOS dentro de cada linha. Antes só existia o primeiro,
  // e para ver os tópicos de 61 aulas era clicar 61 vezes.
  const idsExpansiveis = cursinhoView === "aula"
    ? aulas.filter((a) => (a.topicoIds || []).length || (a.assuntos || []).length).map((a) => a.id)
    : st.topicos.filter((t) => st.aulas.some((a) => (a.topicoIds || []).includes(t.id))).map((t) => "top:" + t.id);
  const algumTopAberto = idsExpansiveis.some((id) => curTopsAbertos.has(id));
  const vinculosFora = store.vinculosForaDaDisciplina();
  const cursosPendentes = store.cursosDoPlanoNaoMapeados();
  return `
    <p class="muted small cursinho-nota">As aulas <b>agrupam os seus tópicos</b> na ordem do cursinho — <b>não criam estrutura nova</b>. Com a base "Cursinho", o app estuda na <b>ordem das aulas</b> (aqui e no Hoje); o conteúdo, o progresso e a cobertura continuam os mesmos do seu edital.</p>
    <div class="barra-acoes cursinho-barra">
      <span class="muted small" data-tip="A base de estudo é um ajuste do app inteiro (muda a ordem das sugestões do Hoje) — por isso mora em Configurações › Estudo.">Base de estudo: <b>${base === "cursinho" ? "Cursinho (ordem das aulas)" : "Edital (por disciplina)"}</b> <button class="lnk" data-action="ir-config-base">alterar</button></span>
      <span class="filtro-lbl muted small">Ver por:</span>
      <span class="seg seg-sm" role="tablist" data-tip="Só muda a forma de ver nesta tela (não altera nada do estudo).">
        <button class="${cursinhoView === "aula" ? "on" : ""}" data-action="cur-view" data-v="aula">Aula</button>
        <button class="${cursinhoView === "topico" ? "on" : ""}" data-action="cur-view" data-v="topico">Tópico</button>
      </span>
      <span class="spacer"></span>
      ${nomesGrupos.length ? `<span class="cur-ctrl"><span class="filtro-lbl muted small">Disciplinas:</span><button class="lnk small" data-action="${algumGrupoAberto ? "cur-recolher" : "cur-expandir"}" data-tip-pos="cima-esq" data-tip="${algumGrupoAberto ? "Recolher todas as disciplinas (os blocos coloridos)." : "Abrir todas as disciplinas."}">${algumGrupoAberto ? "recolher" : "expandir"}</button></span>` : ""}
      ${idsExpansiveis.length ? `<span class="cur-ctrl"><span class="filtro-lbl muted small">${cursinhoView === "aula" ? "Tópicos" : "Aulas"}:</span><button class="lnk small" data-action="${algumTopAberto ? "cur-tops-recolher" : "cur-tops-expandir"}" data-tip-pos="cima-esq" data-tip="${algumTopAberto ? `Recolher os vínculos de todas as ${cursinhoView === "aula" ? "aulas" : "tópicos"} — sem fechar as disciplinas.` : `Abrir de uma vez os vínculos de todas as ${cursinhoView === "aula" ? "aulas" : "tópicos"}.`}">${algumTopAberto ? "recolher" : "expandir"}</button></span>` : ""}
      <button class="btn btn-soft btn-sm" data-action="aulas-adicionar" data-tip="Trazer aulas: acrescentar à lista, ou atualizar a grade (comparar e preservar seus ajustes).">${icone("download")} Adicionar aulas</button>
      <details class="doc-mais ed-barra-mais">
        <summary class="ed-barra-mais-sum" data-tip-pos="cima-dir" data-tip="Compatibilizar com IA, aula avulsa, revisão de vínculos e limpeza do plano.">${icone("ellipsis")} Mais</summary>
        <div class="doc-mais-pop" role="menu">
          <button class="menu-item" data-action="compatibilizar-aulas-ia" data-tip="A IA casa os assuntos das aulas com os tópicos do seu edital (vira sinônimo), sem você marcar um por um. Uma chamada por disciplina — não sai dela."><span class="menu-ico">${icone("bot")}</span> Compatibilizar com IA</button>
          ${cursosPendentes.length ? `<button class="menu-item" data-action="mapear-cursos" data-tip="Cursos do cursinho que não são disciplina do seu edital: sem ligá-los, os vínculos deles nunca são conferidos."><span class="menu-ico">${icone("shuffle")}</span> Mapear cursos fora do edital (${cursosPendentes.length})</button>` : ""}
          ${vinculosFora.length ? `<button class="menu-item" data-action="corrigir-vinculos" data-tip="Tira os vínculos que apontam para tópicos de outra disciplina e recasa os assuntos dentro da disciplina da aula."><span class="menu-ico">${icone("link")}</span> Revisar vínculos (${vinculosFora.length} fora da disciplina)</button>` : ""}
          ${desfazerVinculos ? `<button class="menu-item" data-action="desfazer-vinculos" data-tip="Volta as aulas ao estado anterior à última revisão de vínculos (vale nesta sessão)."><span class="menu-ico">${icone("repeat-2")}</span> Desfazer revisão de vínculos</button>` : ""}
          <div class="menu-sep"></div>
          <button class="menu-item menu-item-danger" data-action="limpar-aulas">Limpar plano</button>
        </div>
      </details>
    </div>
    ${cursinhoView === "aula" ? cards : bodyTopico}
    ${cursinhoView === "aula" && soltos.length ? `<details class="card cursinho-soltos muted small">
      <summary class="cursinho-soltos-sum">${icone("pin")} <b>${soltos.length} ${soltos.length === 1 ? "tópico" : "tópicos"} fora de qualquer aula</b> — nem todo tópico do edital precisa de aula do cursinho. ${icone("chevron-down")}</summary>
      <div class="cursinho-soltos-lista">${soltos.map((t) => `<span class="cur-assunto-chip">${esc(t.nome)}</span>`).join(" ")}</div>
    </details>` : ""}`;
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
      <button class="btn btn-add btn-sm" data-action="toggle-add-disc" data-tip-pos="cima-esq" data-tip="Adicionar disciplinas e tópicos: digite uma disciplina ou traga/importe o edital (separado automaticamente).">${icone("plus")} Adicionar ao edital</button>
      <span class="spacer"></span>
      <label class="inline ed-ord"><span class="ed-ord-lbl">Ordenar:</span>
        <select id="ed-top-sort" class="ed-ord-sel" aria-label="Ordenar os tópicos">
          <option value="custom" ${topSort === "custom" ? "selected" : ""}>Como cadastrei</option>
          <option value="relevancia" ${topSort === "relevancia" ? "selected" : ""}>Mais relevantes</option>
        </select>
      </label>
      ${st.disciplinas.length ? `<button class="lnk small" data-action="${algumAberto ? "ed-recolher" : "ed-expandir"}" data-tip-pos="cima-esq" data-tip="${algumAberto ? "Recolher todas as disciplinas." : "Abrir todas as disciplinas."}">${algumAberto ? "Recolher tudo" : "Expandir tudo"}</button>
      <button class="btn btn-ghost btn-sm ${selMode ? "on" : ""}" data-action="toggle-selmode" data-tip-pos="cima-esq" data-tip="Selecionar vários tópicos para mover, unificar ou virar nova disciplina.">${selMode ? "Concluir seleção" : "Selecionar"}</button>` : ""}
      <details class="doc-mais ed-barra-mais">
        <summary class="ed-barra-mais-sum" data-tip-pos="cima-dir" data-tip="Mais ações do edital.">${icone("ellipsis")} Mais</summary>
        <div class="doc-mais-pop" role="menu">
          <div class="menu-grupo-rotulo" aria-hidden="true">${icone("target")} Relevância</div>
          <button class="menu-item" data-action="toggle-destaques" data-tip="Traga os temas que mais caem (com % ou sem) e preenche a relevância automaticamente."><span class="menu-ico">${icone("star")}</span> Importar temas que mais caem</button>
          <button class="menu-item" data-action="toggle-sug-ia" data-tip="A IA sugere a relevância dos temas a partir das suas provas e/ou de uma pesquisa na web (você confere e aplica)."><span class="menu-ico">${icone("sparkles")}</span> Sugerir por IA (provas/web)</button>
          <div class="menu-sep"></div>
          <button class="menu-item" data-action="toggle-oficial" data-tip="Traga o edital da banca: o app valida o que o seu edital já cobre e o que ficou de fora (lacunas), sem mexer na sua estrutura."><span class="menu-ico">${icone("clipboard-list")}</span> Comparar com o edital oficial</button>
          ${st.disciplinas.length ? `<div class="menu-sep"></div>
          <button class="menu-item menu-item-danger" data-action="limpar-edital"><span class="menu-ico">${icone("trash-2")}</span> Limpar edital (estrutura)</button>` : ""}
        </div>
      </details>
    </div>

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

  // Cards × lista compacta. O padrão segue o TAMANHO do edital: acima de 60 tópicos os
  // cards deixam de ser legíveis (e o cálculo por card fica caro), então a lista compacta
  // entra sozinha. O usuário troca quando quiser — a escolha manual vence o automático.
  const totalTops = st.topicos.length;
  const compacto = edCompacto === null ? totalTops > 60 : edCompacto;
  // 1ª visita da sessão: cada densidade tem o seu padrão — a compacta mostra tudo (é uma linha
  // por tópico), os cards abrem só a primeira disciplina (o paredão de cards é o que cansa).
  if (!dossieAcInit && st.disciplinas.length) {
    dossieAcInit = true;
    if (compacto) st.disciplinas.forEach((d) => dossieAcAberta.add(d.id));
    else dossieAcAberta.add(st.disciplinas[0].id);
  }
  const algumDossieAberto = st.disciplinas.some((d) => dossieAcAberta.has(d.id));
  const resumoBody = `
    <div class="u-flex-12 u-between u-items-end u-wrap u-mb-12">
      <p class="muted small u-m-0">${
        compacto
          ? "Uma linha por tópico: material, questão, cartão e concluído. <b>Abra um tópico</b> para ver o <b>dossiê</b> dele."
          : "Cada tópico com seus números (materiais, questões, erros, flashcards, tempo) e a relevância. <b>Abra um tópico</b> para ver o <b>dossiê</b> dele."
      }</p>
      <div class="u-flex-12 u-nowrap">
        ${st.disciplinas.length ? `<button class="lnk small" data-action="${algumDossieAberto ? "dossie-recolher" : "dossie-expandir"}" data-tip-pos="cima-dir" data-tip="${algumDossieAberto ? "Recolher todas as disciplinas." : "Abrir todas as disciplinas."}">${algumDossieAberto ? "Recolher tudo" : "Expandir tudo"}</button>` : ""}
        <button class="btn btn-ghost btn-sm u-nowrap" data-action="ed-densidade" data-tip="${
          compacto ? "Ver os cards com os números de cada tópico." : "Ver uma linha por tópico — melhor para edital grande."
        }">${icone(compacto ? "table" : "list-tree")} ${compacto ? "Ver em cards" : "Ver compacto"}</button>
      </div>
    </div>
    <div class="dossie-lista">${compacto ? dossieCompactoHTML(store, dossieAcAberta) : dossieResumoHTML(store, dossieAcAberta)}</div>`;

  let cursinhoBody;
  if (aulasPreview) cursinhoBody = aulasPreviewHTML(aulasPreview, st.disciplinas) + (st.aulas.length ? aulasListaHTML(store, st) : "");
  else if (aulasImportAberto) cursinhoBody = aulasImportHTML(aulasTextoSalvo) + (st.aulas.length ? aulasListaHTML(store, st) : "");
  else if (st.aulas.length === 0) cursinhoBody = aulasConviteHTML();
  else cursinhoBody = aulasListaHTML(store, st);
  // Modos do Edital = segmented control único (mesmo componente da Lei Seca), com estado
  // ATIVO visível (antes eram botões soltos que sumiam no modo atual, sem indicar onde você está).
  const edModosSeg = `
    <div class="seg ed-modos u-mb-16" role="tablist">
      <button class="${edModo === "estrutura" ? "on" : ""}" data-action="modo-estrutura" data-tip="Editar a estrutura do edital.">${icone("list-checks")}<span class="seg-txt">Estrutura</span></button>
      <button class="${edModo === "resumo" ? "on" : ""}" data-action="modo-resumo" data-tip="Visão por tópico: cada tópico com seus números (materiais, questões, erros, flashcards, tempo).">${icone("table")}<span class="seg-txt">Dossiê por tópico</span></button>
      <button class="${edModo === "cursinho" ? "on" : ""}" data-action="modo-cursinho" data-tip="Opcional: organizar/estudar pela divisão de aulas do seu cursinho (mapa aula ↔ tópico ↔ edital).">${icone("library")}<span class="seg-txt">Plano do cursinho</span></button>
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

      // PDF: tenta PRIMEIRO o caminho determinístico (lê o sumário da apostila com pdf.js).
      // Vem antes da IA de propósito: funciona offline, sem chave, sem cota, e sem o teto de
      // 14 MB que justamente barrava as apostilas de cursinho (13 a 33 MB). A IA fica como
      // reserva para quando o PDF é escaneado (sem camada de texto) ou o sumário não é lido.
      if (ehPdf) {
        const fim = toastCarregando("Lendo o sumário da apostila…");
        let aulas = [];
        try {
          // 20 páginas bastam: o índice de apostila fica logo depois da capa.
          const { paginas, numPaginas } = await extrairPdfPaginas(f, { ate: 20 });
          const disciplina = disciplinaDoNomeDeArquivo(f.name);
          aulas = aulasDoSumario(paginas, { disciplina, numPaginas });
          // Apostila escaneada (sem camada de texto): a IA lê a IMAGEM do índice.
          if (aulas.length < 2 && store.iaDisponivel()) aulas = await store.aulasDoSumarioVisao(f, { disciplina, paginas, numPaginas });
        } catch (err) { try { console.error(err); } catch (_) {} }
        finally { fim(); }
        if (aulas.length >= 2) {
          aulasPreview = aulas;
          aulasImportAberto = false;
          toast(`${plural(aulas.length, "aula lida", "aulas lidas")} do sumário. Revise e monte o plano.`, "ok");
          app.refresh();
          return;
        }
      }

      if (comIA) {
        const fim = toastCarregando("Lendo o plano do cursinho com a IA… (pode levar 1–2 min)");
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
        finally { fim(); }
        // Fallback local, sem nova chamada.
        const fim2 = toastCarregando("Extraindo o texto do PDF…");
        try {
          const texto = await lerArquivoTexto(f, null, "");
          preenche(texto);
          toast(texto && texto.trim() ? "Texto extraído. Use «Montar plano»." : "Não consegui ler agora. Tente de novo ou cole o texto.", texto && texto.trim() ? "ok" : "erro");
        } catch (_) { toast("Não consegui ler o arquivo. Cole o texto.", "erro"); }
        finally { fim2(); }
        return;
      }
      const fim = toastCarregando("Lendo o arquivo…");
      try {
        const texto = await lerArquivoTexto(f, cfg, "");
        preenche(texto);
        if (texto && texto.trim()) toast("Texto carregado. Use «Montar plano».");
        else toast(ehPdf ? "PDF escaneado (imagem): conecte a IA (Gemini) em Configurações para extrair com OCR, ou cole o texto." : "Sem texto reconhecido. Cole manualmente.", "erro");
      } catch (err) { try { console.error(err); } catch (_) {} toast("Não consegui ler o arquivo. Cole o texto.", "erro"); }
      finally { fim(); }
    });
  }
  // Tópicos de cada aula: persiste (sem re-render) quais estão expandidos.
  root.querySelectorAll("details.cur-aula-acc[data-aula-acc]").forEach((det) =>
    det.addEventListener("toggle", () => {
      const id = det.getAttribute("data-aula-acc");
      if (det.open) curTopsAbertos.add(id); else curTopsAbertos.delete(id);
    })
  );
  // Plano do cursinho: persiste (sem re-render) qual grupo está recolhido.
  root.querySelectorAll("details.cur-disc[data-cur-grupo]").forEach((det) =>
    det.addEventListener("toggle", () => {
      const nome = det.getAttribute("data-cur-grupo");
      if (det.open) curAcFechada.delete(nome); else curAcFechada.add(nome);
    })
  );
  // Dossiê por tópico: persiste (sem re-render) qual disciplina está aberta.
  root.querySelectorAll("details.dossie-disc[data-dossie-grupo]").forEach((det) =>
    det.addEventListener("toggle", () => {
      const id = det.getAttribute("data-dossie-grupo");
      if (det.open) dossieAcAberta.add(id); else dossieAcAberta.delete(id);
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
  ligarDiscLote(root, aulasPreview);

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
      if (await confirmar("Apagar o edital? Seus materiais, questões e flashcards continuam salvos — só ficam sem tópico.")) {
        store.limparEdital();
        toast("Estrutura do edital apagada.");
      }
    },
    imprimir: () => edModo === "cursinho"
      ? imprimir("Plano do cursinho — Mentor Concurso", printCursinho(st, store))
      : imprimir("Edital — Mentor Concurso", printEdital(st)),
    "modo-estrutura": () => {
      edModo = "estrutura";
      app.refresh();
    },
    "modo-resumo": () => {
      edModo = "resumo";
      app.refresh();
    },
    // Alterna cards × lista compacta. A partir do 1º clique a escolha é do usuário e o
    // automático pelo tamanho do edital não volta a mandar.
    "ed-densidade": () => {
      edCompacto = !(edCompacto === null ? st.topicos.length > 60 : edCompacto);
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
      const estrutura = parseAulas(texto, store.get().disciplinas).map((a) => ({ nome: a.nome || "", topicos: [...(a.topicos || [])], disciplina: a.disciplina || null }));
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
          ? `${plural(r.criadas, "aula criada", "aulas criadas")}.${r.deduzida ? ` Disciplina assumida: ${r.deduzida} — os assuntos casaram só com tópicos dela.` : ""}${r.naoCasados.length ? ` ${plural(r.naoCasados.length, "assunto não casou", "assuntos não casaram")} com seus tópicos (use sinônimos ou crie os tópicos).` : ""}`
          : "Não reconheci aulas no texto.",
        r.criadas ? "ok" : "erro"
      );
      if (r.naoCasados.length) console.info("Assuntos do cursinho não casados:", r.naoCasados);
    },
    "aulas-adicionar": () => abrirAdicionarAulas(app),
    "importar-aulas-mais": () => abrirAdicionarAulas(app, "acrescentar"), // compat: convite "Trazer a divisão do cursinho"
    "aulas-recolar": () => abrirAdicionarAulas(app, "atualizar"),
    "importar-aulas-fechar": () => {
      aulasImportAberto = false;
      aulasPreview = null;
      aulasTextoSalvo = "";
      app.refresh();
    },
    "aula-renomear": async (el) => {
      const a = store.get().aulas.find((x) => x.id === el.getAttribute("data-id"));
      const nome = await pedirTexto("Renomear aula:", { valor: a ? a.nome : "" });
      if (nome) store.renomearAula(el.getAttribute("data-id"), nome);
    },
    "aula-disciplina": async (el) => {
      const id = el.getAttribute("data-id");
      const a = st.aulas.find((x) => x.id === id);
      if (!a) return;
      if (!st.disciplinas.length) return toast("Cadastre as disciplinas do edital primeiro.", "erro");
      const opcoes = [...st.disciplinas.map((d) => ({ label: d.nome, value: d.id })), { label: "— sem disciplina —", value: "" }];
      const escolhida = await escolher(`Disciplina de "${a.nome}":`, opcoes, { lista: true });
      if (escolhida === null) return;
      store.setAulaDisciplina(id, escolhida || null);
      const fora = store.vinculosForaDaDisciplina().filter((f) => f.aulaId === id).length;
      toast(fora ? `Disciplina definida. ${plural(fora, "vínculo ficou", "vínculos ficaram")} fora dela — use "Revisar vínculos" em Mais.` : "Disciplina definida.");
    },
    "aula-topicos": (el) => {
      const id = el.getAttribute("data-id");
      aulaTopAberto = aulaTopAberto === id ? null : id;
      app.refresh();
    },
    "cur-view": (el) => { cursinhoView = el.getAttribute("data-v") === "topico" ? "topico" : "aula"; app.refresh(); },
    "aula-remover": async (el) => {
      if (await confirmar("Remover esta aula? (não apaga os tópicos, só a aula)")) store.removerAula(el.getAttribute("data-id"));
    },
    "mapear-cursos": () => abrirMapearCursos(app),
    "corrigir-vinculos": async () => {
      const fora = store.vinculosForaDaDisciplina();
      if (!fora.length) return toast("Nenhum vínculo fora da disciplina.");
      const amostra = fora.slice(0, 8).map((f) => `• ${f.aulaNome} (${f.disciplina}) → ${f.topicoNome} [${f.topicoDisciplina}]`).join("\n");
      const resto = fora.length > 8 ? `\n… e mais ${fora.length - 8}.` : "";
      const ok = await confirmar(
        `Remover ${plural(fora.length, "vínculo que aponta", "vínculos que apontam")} para tópico de OUTRA disciplina e recasar os assuntos dentro da disciplina da aula?\n\n${amostra}${resto}\n\nOs vínculos que já estão na disciplina certa não são tocados.`
      );
      if (!ok) return;
      const r = store.corrigirVinculosDoPlano();
      desfazerVinculos = r.antes && r.antes.length ? r.antes : null;
      toast(`${plural(r.removidos, "vínculo removido", "vínculos removidos")} em ${plural(r.aulas, "aula", "aulas")}${r.recasados ? `; ${plural(r.recasados, "assunto recasado", "assuntos recasados")} na disciplina certa` : ""}. Dá para desfazer em "Mais".`);
    },
    "desfazer-vinculos": async () => {
      if (!desfazerVinculos) return;
      if (!(await confirmar("Desfazer a revisão de vínculos? As aulas voltam exatamente como estavam antes dela."))) return;
      const n = store.restaurarVinculosDoPlano(desfazerVinculos);
      desfazerVinculos = null;
      toast(`${plural(n, "aula restaurada", "aulas restauradas")}.`);
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
      if (!(await confirmar("Unificar os selecionados no tópico de destino? O conteúdo vinculado vai junto para o destino e os outros tópicos são removidos."))) return;
      for (const id of [...topSel]) if (id !== dest) store.mesclarTopicos(id, dest);
      topSel.clear();
      toast("Tópicos unificados.");
      app.refresh();
    },
    "sel-limpar": () => { topSel.clear(); app.refresh(); },
    "toggle-selmode": () => { selMode = !selMode; if (!selMode) topSel.clear(); app.refresh(); },
    "ed-expandir": () => { st.disciplinas.forEach((d) => discAcAberta.add(d.id)); app.refresh(); },
    "ed-recolher": () => { discAcAberta.clear(); app.refresh(); },
    "cur-recolher": () => {
      root.querySelectorAll(".cur-disc[data-cur-grupo]").forEach((el) => curAcFechada.add(el.getAttribute("data-cur-grupo")));
      app.refresh();
    },
    "cur-expandir": () => { curAcFechada.clear(); app.refresh(); },
    "cur-tops-expandir": () => {
      const ids = cursinhoView === "aula"
        ? st.aulas.filter((a) => (a.topicoIds || []).length || (a.assuntos || []).length).map((a) => a.id)
        : st.topicos.filter((t) => st.aulas.some((a) => (a.topicoIds || []).includes(t.id))).map((t) => "top:" + t.id);
      ids.forEach((id) => curTopsAbertos.add(id));
      app.refresh();
    },
    "cur-tops-recolher": () => { curTopsAbertos.clear(); app.refresh(); },
    "dossie-expandir": () => { st.disciplinas.forEach((d) => dossieAcAberta.add(d.id)); app.refresh(); },
    "dossie-recolher": () => { dossieAcAberta.clear(); app.refresh(); },
    "ir-config-base": () => app.navigate("config"),
    "add-link-top": (el) => abrirAnexarLink(app, el.getAttribute("data-id")),
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
        <span class="spacer"></span>
        <details class="doc-mais ed-top-mais">
          <summary class="ed-top-mais-sum" data-tip-pos="cima-dir" data-tip="Ações da disciplina.">${icone("ellipsis")}</summary>
          <div class="doc-mais-pop" role="menu">
            <button class="menu-item" data-action="add-top" data-disc="${d.id}"><span class="menu-ico">${icone("plus")}</span> Adicionar tópico</button>
            <button class="menu-item" data-action="ren-disc" data-id="${d.id}"><span class="menu-ico">${icone("square-pen")}</span> Renomear disciplina</button>
            <div class="menu-sep"></div>
            <button class="menu-item menu-item-danger" data-action="del-disc" data-id="${d.id}"><span class="menu-ico">${icone("x")}</span> Remover disciplina</button>
          </div>
        </details>
        <span class="ed-disc-chev">${icone("chevron-down")}</span>
      </summary>
      ${tops.length ? `<div class="ed-tabwrap"><table class="ed-tab">
        <thead><tr><th class="edc-chk"></th><th data-tip="Abre o dossiê — a pasta viva do assunto.">Tópico</th><th class="edc-rel" data-tip="O quanto o tema cai na sua banca (Não cai a Altíssima) — use a pílula para definir.">Relevância</th><th class="edc-ap" data-tip="Seu percentual de acertos nas questões deste tópico.">Aproveitamento</th><th class="edc-est" data-tip="Quantas vezes e há quanto tempo você estudou o tópico.">Estudo</th><th class="edc-acts"></th></tr></thead>
        <tbody>${tops.map((t, i) => topHTML(store, st, t, i + 1)).join("")}</tbody>
      </table></div>` : `<p class="muted small ed-semtop">Sem tópicos ainda. Use o "+" acima para adicionar.</p>`}
    </details>`;
}

// Acervo do tópico (materiais · questões · flashcards) como selo discreto na própria linha.
// No computador esses números vêm do hover-preview (.ed-hovercard), que é EXCLUSIVO de mouse
// — `ligarHoverPreview` sai cedo em `pointer: coarse`. No celular eles ficavam invisíveis.
// O selo é oculto por CSS onde o hovercard existe, para não duplicar a informação.
// Os índices são montados uma vez por render (ver acervoIndice) — nada de varrer por linha.
let _acervoIdx = null;
function acervoIndice(st) {
  // A chave do cache NÃO pode ser a identidade de `st`: store.get() devolve sempre o mesmo
  // objeto (mutado no lugar), então o índice nunca seria refeito e os números congelariam.
  // `modificadoEm` é carimbado a cada commit; o tamanho das listas cobre escritas sem carimbo.
  const chave = `${st.modificadoEm || ""}|${(st.documentos || []).length}|${(st.questoes || []).length}|${(st.flashcards || []).length}`;
  if (_acervoIdx && _acervoIdx.chave === chave) return _acervoIdx;
  const mat = new Map(), q = new Map(), fc = new Map();
  const soma = (m, id) => { if (id) m.set(id, (m.get(id) || 0) + 1); };
  (st.documentos || []).forEach((d) => { soma(mat, d.topicoId); (d.topicoIds || []).forEach((id) => soma(mat, id)); });
  (st.questoes || []).forEach((x) => soma(q, x.topicoId));
  (st.flashcards || []).forEach((x) => soma(fc, x.topicoId));
  _acervoIdx = { chave, mat, q, fc };
  return _acervoIdx;
}
function acervoTag(st, topicoId) {
  const ix = acervoIndice(st);
  const nMat = ix.mat.get(topicoId) || 0, nQ = ix.q.get(topicoId) || 0, nFc = ix.fc.get(topicoId) || 0;
  if (!nMat && !nQ && !nFc) return "";
  const partes = [];
  if (nMat) partes.push(`${icone("library")} ${nMat}`);
  if (nQ) partes.push(`${icone("pencil-line")} ${nQ}`);
  if (nFc) partes.push(`${icone("layers")} ${nFc}`);
  return ` <span class="mini-tag ed-acervo" data-tip="${nMat} ${nMat === 1 ? "material" : "materiais"} · ${nQ} ${nQ === 1 ? "questão" : "questões"} · ${nFc} ${nFc === 1 ? "flashcard" : "flashcards"} neste tópico">${partes.join(" ")}</span>`;
}

function topHTML(store, st, t, n) {
  const s = statsTopico(st, t.id);
  // Links anexados: na tabela fica só um indicador discreto (contagem + tooltip);
  // ver/abrir/remover os links vive no dossiê do tópico.
  const links = Array.isArray(t.links) ? t.links : [];
  const linkInd = links.length
    ? ` <span class="mini-tag" data-tip="${plural(links.length, "link anexado", "links anexados")} — veja no dossiê">${icone("paperclip")} ${links.length}</span>`
    : "";
  // Aproveitamento: só o badge/pílula colorida com o % (o detalhamento vai no tooltip;
  // barra e contagem de questões ficam no dossiê).
  const nivelSem = s.pct === null ? "na" : store.corDesempenho(s.pct) || "na";
  const certas = s.pct === null ? 0 : Math.round((s.pct / 100) * s.questoes);
  const erradas = (s.questoes || 0) - certas;
  const apTip = s.pct === null ? "Sem questões respondidas neste tópico." : `${certas} certas · ${erradas} erradas · ${s.questoes} no total`;
  const apCell = `<span class="ed-sem ed-sem-${nivelSem}" data-tip="${apTip}"><i class="ed-sem-dot"></i>${s.pct === null ? "—" : s.pct + "%"}</span>`;
  // Estudo: célula única "vezes · há quanto tempo" (funde as antigas "Vezes"/"Última vez").
  const vezes = st.sessoes.filter((x) => x.topicoId === t.id).length;
  const estCell = vezes
    ? `<span class="ed-est" data-tip="${plural(vezes, "sessão de estudo", "sessões de estudo")}${s.ultima ? ` · última: ${fmtData(s.ultima)}` : ""}"><b class="ed-vez">${vezes}×</b> <span class="ed-ult">· ${haQuantoTempo(s.ultima)}</span></span>`
    : `<span class="ed-est none">nunca</span>`;
  return `
    <tr class="${t.concluido ? "ed-tr-done" : ""}">
      <td class="edc-chk">${selMode ? `<input type="checkbox" class="ed-top-sel" data-id="${t.id}" ${topSel.has(t.id) ? "checked" : ""} data-tip="Selecionar (para mover, unificar ou virar nova disciplina)" />` : `<button class="ed-chk ${t.concluido ? "on" : ""}" data-action="done-top" data-id="${t.id}" data-tip-pos="cima-esq" data-tip="${t.concluido ? "Concluído · toque para desmarcar" : "Marcar como concluído (já estudei)"}">${icone("check")}</button>`}</td>
      <td class="edc-nome"><button class="lnk ed-top-link" data-action="ir-dossie" data-id="${t.id}">${esc(t.nome)}<span class="mapa-abrir-ico" aria-hidden="true">${icone("external-link")}</span></button>${linkInd}${acervoTag(st, t.id)}</td>
      <td class="edc-rel" data-label="Relevância">${relPillSelectHTML(t)}</td>
      <td class="edc-ap" data-label="Aproveitamento">${apCell}</td>
      <td class="edc-est" data-label="Estudo">${estCell}</td>
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

// Métricas inline de um tópico a partir das sessões: total de questões feitas,
// % de aproveitamento (null se nenhuma questão) e a última data estudada.
// Hover-preview de tópico (desktop): mini-card flutuante com os números, sem clicar/navegar.
let hoverCardEl = null, hoverTimerEd = null, hoverGlobaisLigados = false;
// O cartão vive FORA do #content (filho do body), então nenhum re-render o alcança: quem o
// abriu tem de fechá-lo. Clicar no tópico navega e apaga a linha do DOM — o `mouseleave`
// nunca chega, e o cartão ficava ligado por cima de todas as telas seguintes até recarregar.
function fecharHoverPreview() {
  clearTimeout(hoverTimerEd);
  if (hoverCardEl) hoverCardEl.classList.remove("on");
}
function ligarHoverPreview(root, store) {
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return; // só desktop/mouse
  root.querySelectorAll(".ed-top-link[data-id]").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      clearTimeout(hoverTimerEd);
      hoverTimerEd = setTimeout(() => mostrarHoverTopico(el, store), 350);
    });
    el.addEventListener("mouseleave", fecharHoverPreview);
    el.addEventListener("click", fecharHoverPreview); // navega e destrói a âncora
  });
  // Globais UMA vez só: `ligarHoverPreview` roda a cada render do Edital, e o listener de
  // scroll era reempilhado em todos eles (vazamento).
  if (hoverGlobaisLigados) return;
  hoverGlobaisLigados = true;
  window.addEventListener("scroll", fecharHoverPreview, { passive: true });
  document.addEventListener("pointerdown", fecharHoverPreview, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharHoverPreview(); });
}
function mostrarHoverTopico(el, store) {
  // A espera de 350ms pode terminar DEPOIS de o clique já ter trocado de tela. Numa âncora
  // solta do DOM o getBoundingClientRect() devolve tudo zero e o cartão ia parar no canto
  // (8,8), tapando o menu — sem nunca mais receber um mouseleave que o fechasse.
  if (!el.isConnected) return;
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
function printCursinho(st, store) {
  const aulas = st.aulas || [];
  if (!aulas.length) return "<p>Nenhuma aula no plano do cursinho.</p>";
  const nomeTop = (id) => { const t = st.topicos.find((x) => x.id === id); return t ? esc(t.nome) : ""; };
  // Mesma divisão da tela: uma seção por disciplina, aulas numeradas DENTRO dela. A lista corrida
  // numerava 1..N atravessando disciplinas — o papel não batia com o que se via no app.
  const regua = store.disciplinaDePlano();
  const grupos = [];
  const idx = new Map();
  for (const a of aulas) {
    const d = regua.get(a.id);
    const nome = (d && d.nome) || "Sem disciplina";
    if (!idx.has(nome)) { idx.set(nome, grupos.length); grupos.push({ nome, itens: [] }); }
    grupos[idx.get(nome)].itens.push(a);
  }
  return grupos
    .map((g) => {
      const linhas = g.itens
        .map((a, i) => {
          const tops = (a.topicoIds || []).map((id) => nomeTop(id)).filter(Boolean);
          return `<div class="print-aula"><b>${i + 1}. ${esc(tituloAula(a))}</b>${tops.length ? `<div class="print-meta">No edital: ${tops.join(" · ")}</div>` : ""}</div>`;
        })
        .join("");
      return `<h2>${esc(g.nome)}</h2>${linhas}`;
    })
    .join("");
}
