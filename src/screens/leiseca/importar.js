// Lei Seca / Jurisprudência — fluxos de IMPORTAÇÃO: lei oficial (Planalto/colar),
// conferir atualização (diff), adicionar indicações (colar/PDF/material, com preview
// editável) e marcar "o que mais cai" (IA/estatística).
// (Extraído mecanicamente de leiseca.js — comportamento idêntico.)
import { abrirJanelaFluxo, toast, toastCarregando, avisoIA, comOcupado, ligarDropZone, plural } from "../../ui.js";
import { ligarImportArquivo } from "../../pdf.js";
import { esc } from "../../util.js";
import { icone } from "../../icones.js";
import { CATALOGO_LEIS } from "../../legis.js";
import { rotulos } from "./estado.js";
import { normaDeRef, comDivisoriasEstrutura } from "./leitor.js";
import { CATEGORIAS_JURIS, datalistTribunais, tribunalPickerHTML, categoriaPickerHTML, topicoOptions, bindCascata, ligarTribunalPicker, ligarCategoriaPicker, sincronizarTribPicker } from "./pickers.js";

// Caixa ÚNICA de adição: digitar 1, colar várias (uma por linha) ou importar arquivo.
function addPanelHTML(st, tipo, modo, r, texto = "", processando = false) {
  const opcoesDisc = `<option value="">— Geral (sem vínculo) —</option>` + st.disciplinas.map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("");
  const exemplo = tipo === "juris"
    ? `Súmula 473, STF | A administração pode anular seus próprios atos... | cai muito em concurso
Tema 1234, STJ | Tese firmada em recurso repetitivo...`
    : `art. 37, caput, CF | A administração obedecerá aos princípios de legalidade, impessoalidade... | decorar os 5 princípios
art. 312, CP | Apropriar-se o funcionário público de dinheiro...`;
  const instrHTML = tipo === "juris"
    ? `<details class="ed-ajuda"><summary>Como o app separa</summary>
        <div class="ed-ajuda-corpo">
          <p>Uma por linha (ex.: <i>Súmula 473 STF</i>). Para já incluir a tese e uma observação, separe com <b>|</b>: <i>referência | tese | observação</i> (os dois últimos são opcionais).</p>
          <p>Também aceita uma lista ou tabela solta: o app separa tudo sozinho e ainda deduz o <b>tribunal</b> e a <b>categoria</b>. Você confere e edita antes de salvar.</p>
        </div></details>`
    : `<details class="ed-ajuda"><summary>Como o app separa</summary>
        <div class="ed-ajuda-corpo">
          <p>Uma por linha (ex.: <i>art. 37, CF</i>). Para já incluir o trecho e uma observação, separe com <b>|</b>: <i>referência | trecho | observação</i> (os dois últimos são opcionais).</p>
          <p>Também aceita uma lista ou tabela solta: o app separa tudo sozinho. Você confere e edita antes de salvar.</p>
        </div></details>`;
  return `
    <div class="card form-leiseca">
      <h3>${tipo === "juris" ? "Adicionar súmulas / teses" : "Adicionar artigos"}</h3>
      <div class="form-row">
        <label>Disciplina <select id="add-disc">${opcoesDisc}</select></label>
        <label>Tópico (opcional) <select id="add-top"><option value="">— sem tópico —</option></select></label>
        ${
          tipo === "juris"
            ? `<label>Tribunal ${tribunalPickerHTML("", "add-trib")}</label>`
            : ""
        }
      </div>
      ${tipo === "juris" ? `<label class="u-block u-mb-8">Categoria ${categoriaPickerHTML("", "add-cat")}</label>` : ""}
      <label class="btn btn-ghost btn-file u-mb-8" data-tip-pos="cima-esq" data-tip="Importar de um PDF ou arquivo .txt. Você também pode arrastar o arquivo aqui.">${icone("paperclip")} Importar de arquivo
        <input id="add-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden />
      </label>
      ${instrHTML}
      <textarea id="add-texto" rows="4" placeholder="${esc("Ex.:\n" + exemplo)}">${esc(texto)}</textarea>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="cancelar-add">Cancelar</button>
        <button class="btn btn-primary" data-action="adicionar" ${processando ? "disabled" : ""}>${processando ? "Processando…" : "Revisar"}</button>
      </div>
      ${
        st.documentos.length
          ? `<div class="add-sep">Ou extrair de um material já cadastrado (IA):</div>
             <div class="form-row" style="align-items:flex-end; gap:10px; flex-wrap:wrap">
               <label class="inline">Material: <select id="add-doc">${st.documentos.map((d) => `<option value="${d.id}">${esc(d.titulo)}</option>`).join("")}</select></label>
               <button class="btn btn-ghost btn-sm" data-action="extrair-material" data-tip="A IA lê o material e extrai as ${tipo === "juris" ? "súmulas/temas/precedentes" : "referências de lei"} citadas (não inventa).">Extrair do material</button>
             </div>`
          : ""
      }
    </div>`;
}

// Preview EDITÁVEL das indicações (antes de gravar): referência, trecho e observação por item,
// + tribunal/categoria na jurisprudência. Editar, remover (✕), voltar para editar e então adicionar.
function indPreviewHTML(st, tipo, modo, r, itens, store) {
  const ehJuris = tipo === "juris";
  const catOpcoes = (sel) => `<option value="">— categoria —</option>` + CATEGORIAS_JURIS.map((c) => `<option ${sel === c ? "selected" : ""}>${c}</option>`).join("");
  // F1 — meta rica do julgado (extração de informativo) em chips read-only.
  const metaChips = (it) => {
    if (!ehJuris) return "";
    const chip = (txt, cls) => txt ? `<span class="prev-chip ${cls || ""}">${esc(txt)}</span>` : "";
    const stt = it.status === "superado" ? chip("superado", "st-super") : it.status === "importante" ? chip("importante", "st-import") : (it.status ? chip("vigente", "st-vig") : "");
    return `<div class="prev-meta">
      ${chip(it.ramo, "ramo")}${it.assunto ? `<span class="prev-chip sub">${esc(it.assunto)}</span>` : ""}
      ${chip(it.orgao)}${chip(it.processo, "mono")}${it.tema ? chip("Tema " + it.tema) : ""}${chip(it.dataJulgamento, "mono")}${stt}
    </div>`;
  };
  // F1 — dedup: se o julgado já existe, marca e oferece pular/enriquecer/substituir.
  const dupBloco = (it, i) => {
    const dup = ehJuris && store ? store.dupIndicacao(it) : null;
    if (!dup) return "";
    const acao = it._acao || "enriquecer";
    return `<div class="prev-dup">
      <span class="prev-dup-tag">${icone("info")} já no sistema${dup.nInformativo ? ` (Inf. ${esc(dup.nInformativo)})` : dup.tribunal ? ` (${esc(dup.tribunal)})` : ""}</span>
      <select class="ind-acao-edit" data-i="${i}" data-tip="Enriquecer = soma esta fonte ao item existente; Pular = ignora; Substituir = troca pelo novo.">
        <option value="enriquecer" ${acao === "enriquecer" ? "selected" : ""}>enriquecer o existente</option>
        <option value="pular" ${acao === "pular" ? "selected" : ""}>pular (já tenho)</option>
        <option value="substituir" ${acao === "substituir" ? "selected" : ""}>substituir</option>
      </select>
    </div>`;
  };
  const nDup = ehJuris && store ? itens.filter((it) => store.dupIndicacao(it)).length : 0;
  return `<div class="card form-leiseca">
    <h3>${icone("download")} Revisar ${itens.length} ${itens.length === 1 ? "item" : "itens"} antes de adicionar</h3>
    <p class="muted small u-m-0 u-mb-8">Edite a referência, o trecho e a observação de cada item; remova (✕) o que não quiser. O vínculo (disciplina/tópico${ehJuris ? "/tribunal" : ""}) escolhido acima vale para todos.${nDup ? ` <b>${nDup} já ${nDup === 1 ? "está" : "estão"} no sistema</b> — escolha enriquecer, pular ou substituir.` : ""}</p>
    <ul class="prev-editavel">
      ${itens
        .map((it, i) => {
          return `<li class="prev-card m-leiseca">
            <div class="prev-card-l1">
              <input class="prev-inp ind-ref-edit" data-i="${i}" value="${esc(it.referencia || "")}" placeholder="${r.ph}" />
              <button class="prev-remover" data-action="remover-ind" data-i="${i}" data-tip-pos="cima-dir" data-tip="Remover este item">${icone("x")}</button>
            </div>
            ${metaChips(it)}
            <input class="prev-inp ind-texto-edit" data-i="${i}" value="${esc(it.texto || "")}" placeholder="Trecho / conteúdo (opcional)" />
            <input class="prev-inp prev-obs ind-obs-edit" data-i="${i}" value="${esc(it.observacao || "")}" placeholder="observação (opcional) — lembrete, ressalva" />
            ${
              ehJuris
                ? `<div class="prev-card-campos">
                    <input class="ind-trib-edit" data-i="${i}" list="trib-list" autocomplete="off" placeholder="Tribunal" value="${esc(it.tribunal || "")}" style="width:120px" />
                    <select class="ind-cat-edit" data-i="${i}">${catOpcoes(it.categoria || "")}</select>
                  </div>${datalistTribunais(st)}`
                : ""
            }
            ${dupBloco(it, i)}
          </li>`;
        })
        .join("")}
    </ul>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="voltar-ind" data-tip-pos="cima-esq" data-tip="Volta ao texto colado para corrigir e revisar de novo.">${icone("arrow-left")} Voltar para editar</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-action="descartar-ind">Descartar</button>
      <button class="btn btn-primary" data-action="aceitar-ind" ${itens.length ? "" : "disabled"}>Adicionar (${itens.length})</button>
    </div>
  </div>`;
}

// Janela "Importar lei oficial": traz a LETRA EXATA da lei do site do Planalto (app desktop) ou
// de um HTML/texto colado. O usuário escolhe a lei do catálogo (ou informa URL/cola), pode limitar
// a um intervalo de artigos, e decide o que fazer com os REVOGADOS (excluir/manter riscado/vigente).
// Nada de OCR nem IA adivinhando a letra — só parsing do texto oficial.
export function abrirImportarLei(app) {
  const { store } = app;
  const estado = {
    etapa: "form", processando: false, msg: "",
    norma: "", artigos: [], revogados: 0, decis: {},
    form: { catalogo: "", url: "", html: "", intervalo: "", disciplinaId: "", comMeta: false },
  };

  const formHTML = (st) => {
    const opcCat = `<option value="">— escolha (ou link/texto abaixo) —</option>` +
      CATALOGO_LEIS.map((l) => `<option value="${esc(l.url)}" data-nome="${esc(l.nome)}" ${estado.form.url === l.url ? "selected" : ""}>${esc(l.titulo)} (${esc(l.nome)})</option>`).join("");
    const opcDisc = `<option value="">— Geral (sem vínculo) —</option>` +
      st.disciplinas.map((d) => `<option value="${d.id}" ${estado.form.disciplinaId === d.id ? "selected" : ""}>${esc(d.nome)}</option>`).join("");
    return `<div class="card form-leiseca">
      <details class="ed-ajuda"><summary>Como funciona a importação</summary>
        <div class="ed-ajuda-corpo">
          <p>Traz a <b>letra exata</b> do texto oficial. No app <b>desktop</b>, a busca é automática no site do Planalto.</p>
          <p>No navegador (por segurança do site), traga o <b>texto/HTML</b> da página. O app detecta sozinho o que está <b>revogado</b>.</p>
        </div></details>
      <div class="form-row">
        <label style="flex:1 1 260px">Lei mais cobrada (catálogo)
          <select id="imp-cat">${opcCat}</select></label>
        <label style="flex:1 1 160px">Artigos (opcional)
          <input id="imp-intervalo" value="${esc(estado.form.intervalo)}" placeholder="ex.: 1-5, 37, 121-127" data-tip="Deixe vazio para trazer a lei inteira. Ou informe artigos/intervalos: 1-5, 37, 213-217." /></label>
      </div>
      <label class="u-block u-mt-4 u-mb-8">Ou link direto da página oficial
        <input id="imp-url" value="${esc(estado.form.url)}" placeholder="https://www.planalto.gov.br/…" /></label>
      <label class="u-block u-mt-4 u-mb-8">Ou traga o texto/HTML da lei (no navegador)
        <textarea id="imp-html" rows="5" placeholder="texto da página oficial da lei (Ctrl+A, Ctrl+C na página do Planalto)">${esc(estado.form.html)}</textarea></label>
      <div class="form-row u-flex-12 u-wrap">
        <label class="inline">Vincular à disciplina <select id="imp-disc">${opcDisc}</select></label>
      </div>
      ${estado.processando ? `<div class="prova-status lendo u-flex u-mt-8"><span class="mini-spin"></span> Buscando a lei no site oficial e extraindo os artigos… (leis grandes, como a CF, podem levar alguns segundos)</div>` : ""}
      ${!estado.processando && estado.msg ? `<p class="${/desktop|traga|adicione/i.test(estado.msg) ? "muted" : "erro-msg"} small u-m-0 u-mt-8">${esc(estado.msg)}</p>` : ""}
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="imp-cancelar" ${estado.processando ? "disabled" : ""}>Cancelar</button>
        <button class="btn btn-primary ${estado.processando ? "carregando" : ""}" data-action="imp-preparar" ${estado.processando ? "disabled" : ""}>${estado.processando ? "Buscando…" : "Buscar / Preparar"}</button>
      </div>
    </div>`;
  };

  const trunc = (s, n = 220) => { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; };
  const previewHTML = () => {
    const vig = estado.artigos.filter((a) => !a.revogado);
    const rev = estado.artigos.map((a, i) => ({ a, i })).filter((x) => x.a.revogado);
    return `<div class="card form-leiseca">
      <h3>${icone("scroll-text")} ${esc(estado.norma || "Lei")} — ${estado.artigos.length} ${estado.artigos.length === 1 ? "artigo" : "artigos"}</h3>
      <p class="muted small u-m-0 u-mb-8">Confira antes de gravar. ${rev.length ? `Há <b>${rev.length}</b> ${rev.length === 1 ? "artigo revogado" : "artigos revogados"} (o Planalto marca tachado); por padrão ficam de fora.` : "Nenhum artigo revogado detectado."}</p>
      ${rev.length ? `<div class="imp-rev-bloco">
        <div class="imp-rev-tit">${icone("eye")} Revogados — decida o que fazer:</div>
        ${rev.length > 1 ? `<div class="imp-rev-todos">
          <span class="muted small">Aplicar a todos os ${rev.length}:</span>
          <button class="btn btn-ghost btn-sm" data-action="imp-todos" data-v="excluir">Excluir todos</button>
          <button class="btn btn-ghost btn-sm" data-action="imp-todos" data-v="riscar">Manter riscado todos</button>
          <button class="btn btn-ghost btn-sm" data-action="imp-todos" data-v="vigente">Está vigente todos</button>
        </div>` : ""}
        ${rev.map(({ a, i }) => `<div class="imp-rev-item">
          <div class="imp-rev-ref"><s>${esc(a.referencia)}</s></div>
          <div class="imp-rev-opts">
            <label><input type="radio" class="imp-rev-radio" name="rev-${i}" value="excluir" ${(estado.decis[i] || "excluir") === "excluir" ? "checked" : ""} data-i="${i}" /> Excluir</label>
            <label><input type="radio" class="imp-rev-radio" name="rev-${i}" value="riscar" ${estado.decis[i] === "riscar" ? "checked" : ""} data-i="${i}" /> Manter riscado</label>
            <label><input type="radio" class="imp-rev-radio" name="rev-${i}" value="vigente" ${estado.decis[i] === "vigente" ? "checked" : ""} data-i="${i}" /> Está vigente (foi engano)</label>
          </div>
        </div>`).join("")}
      </div>` : ""}
      <div class="imp-vig-lista">
        ${comDivisoriasEstrutura(vig.slice(0, 60), (a) => `<div class="imp-vig-item"><b>${esc(a.referencia)}</b><span class="muted small"> ${esc(trunc(a.texto))}</span></div>`)}
        ${vig.length > 60 ? `<div class="muted small">…e mais ${vig.length - 60} artigos.</div>` : ""}
      </div>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="imp-voltar">${icone("arrow-left")} Voltar</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-action="imp-gravar">Importar</button>
      </div>
    </div>`;
  };

  // Lê os campos do formulário para o estado (antes de preparar/rerender).
  const lerForm = (corpo) => {
    estado.form.url = corpo.querySelector("#imp-url")?.value.trim() || "";
    estado.form.html = corpo.querySelector("#imp-html")?.value || "";
    estado.form.intervalo = corpo.querySelector("#imp-intervalo")?.value.trim() || "";
    estado.form.disciplinaId = corpo.querySelector("#imp-disc")?.value || "";
  };

  abrirJanelaFluxo({
    titulo: "Importar lei oficial",
    render: (corpo) => {
      const st = store.get();
      corpo.innerHTML = estado.etapa === "preview" ? previewHTML() : formHTML(st);
      // Catálogo → preenche URL (o listener é recriado a cada render, no elemento novo).
      corpo.querySelector("#imp-cat")?.addEventListener("change", (e) => {
        estado.form.url = e.target.value || "";
        estado.form.norma = e.target.selectedOptions[0]?.getAttribute("data-nome") || "";
        const inpUrl = corpo.querySelector("#imp-url");
        if (inpUrl) inpUrl.value = estado.form.url;
      });
      // Rádios dos revogados por 'change' (não 'data-action': o bindActions dá preventDefault e
      // travaria a marcação do rádio). Cada mudança grava a decisão do artigo.
      corpo.querySelectorAll(".imp-rev-radio").forEach((el) =>
        el.addEventListener("change", () => { estado.decis[+el.getAttribute("data-i")] = el.value; }));
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "imp-preparar": async () => {
        lerForm(corpo);
        if (!estado.form.html.trim() && !estado.form.url) { estado.msg = "Escolha uma lei do catálogo, informe um link ou traga o texto da lei."; toast(estado.msg, "erro"); return rerender(); }
        estado.processando = true; estado.msg = ""; rerender();
        toast(estado.form.html.trim() ? "Extraindo os artigos do texto…" : "Buscando a lei no Planalto…");
        try {
          const r = await store.prepararLei({
            html: estado.form.html.trim() || undefined,
            url: estado.form.html.trim() ? undefined : estado.form.url,
            norma: estado.form.norma || undefined,
            intervalo: estado.form.intervalo,
          });
          estado.processando = false;
          if (!r.artigos.length) { estado.msg = "Não encontrei artigos nesse conteúdo. Confira o link/texto ou o intervalo informado."; toast(estado.msg, "erro"); return rerender(); }
          estado.norma = r.norma; estado.artigos = r.artigos; estado.revogados = r.revogados;
          estado.decis = {}; estado.etapa = "preview"; rerender();
          toast(`${r.artigos.length} ${r.artigos.length === 1 ? "artigo encontrado" : "artigos encontrados"}. Confira e importe.`, "ok");
        } catch (e) {
          console.error("[importar-lei]", e);
          estado.processando = false;
          estado.msg = e && e.code === "SEM_DESKTOP"
            ? "A busca automática no Planalto só funciona no app desktop. Abra a página oficial no navegador, copie o texto (Ctrl+A, Ctrl+C) e adicione ao campo acima."
            : (e && e.message) || "Não consegui buscar a página. Confira o link ou traga o texto.";
          toast(estado.msg, "erro");
          rerender();
        }
      },
      // Aplicar uma decisão a TODOS os revogados de uma vez (o usuário ainda pode ajustar 1 a 1).
      "imp-todos": (el) => {
        const v = el.getAttribute("data-v");
        estado.artigos.forEach((a, i) => { if (a.revogado) estado.decis[i] = v; });
        rerender();
        toast(v === "excluir" ? "Todos os revogados marcados para excluir." : v === "riscar" ? "Todos os revogados serão mantidos riscados." : "Todos os revogados marcados como vigentes.", "ok");
      },
      "imp-voltar": () => { estado.etapa = "form"; estado.msg = ""; rerender(); },
      "imp-cancelar": () => fechar(),
      "imp-gravar": () => {
        const final = estado.artigos.map((a, i) => {
          if (!a.revogado) return a;
          const d = estado.decis[i] || "excluir";
          if (d === "excluir") return null;
          if (d === "vigente") return { ...a, revogado: false };
          return a; // "riscar" → mantém revogado (renderiza tachado)
        }).filter(Boolean);
        const res = store.aceitarLei(final, {
          incluirRevogados: true,
          disciplinaId: estado.form.disciplinaId || null,
          fonteUrl: estado.form.url || null, // guarda a origem p/ "Conferir atualização" depois
        });
        toast(`${res.n} ${res.n === 1 ? "artigo importado" : "artigos importados"}.`, "ok");
        fechar();
        app.refresh();
      },
    }),
  });
}

// Janela "Conferir atualização" (NOVIDADE LEGISLATIVA): reconsulta a fonte oficial e compara
// com o que está guardado (diff MECÂNICO por hash). Mostra alterados/novos/revogados; o usuário
// escolhe o que aplicar. Nada de IA interpretando a mudança — só o diff determinístico.
export function abrirConferirAtualizacao(app) {
  const { store } = app;
  const normas = store.normasComFonte("lei");
  const estado = { etapa: "form", processando: false, msg: "", diff: null, form: { norma: normas[0]?.norma || "", url: normas[0]?.url || "", html: "", intervalo: "" } };
  const trunc = (s, n = 160) => { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; };

  const formHTML = () => {
    const opc = normas.length
      ? normas.map((x) => `<option value="${esc(x.norma)}" data-url="${esc(x.url || "")}" ${estado.form.norma === x.norma ? "selected" : ""}>${esc(x.norma)} (${x.n})</option>`).join("")
      : "";
    return `<div class="card form-leiseca">
      <details class="ed-ajuda"><summary>Como funciona a conferência</summary>
        <div class="ed-ajuda-corpo">
          <p>Reconsulta a <b>fonte oficial</b> e compara com o texto guardado: mostra o que <b>mudou</b>, foi <b>adicionado</b> ou <b>revogado</b> (diff mecânico, sem IA).</p>
          <p>No <b>desktop</b> a busca é automática; no navegador, traga o <b>texto atualizado</b> da lei.</p>
        </div></details>
      ${normas.length ? `<div class="form-row">
        <label style="flex:1 1 260px">Norma (importada com origem oficial)
          <select id="ca-norma">${opc}</select></label>
        <label style="flex:0 1 160px">Artigos (opcional)
          <input id="ca-intervalo" value="${esc(estado.form.intervalo)}" placeholder="ex.: 1-30" /></label>
      </div>
      <label class="u-block u-mt-4 u-mb-8">Link da fonte (edite se mudou)
        <input id="ca-url" value="${esc(estado.form.url)}" placeholder="https://www.planalto.gov.br/…" /></label>` : `<p class="muted small">Nenhuma lei foi importada com <b>origem oficial</b> ainda. Traga abaixo o texto atualizado e informe a norma no campo.</p>
      <label class="u-block u-mt-4 u-mb-8">Norma <input id="ca-norma-txt" placeholder="Ex.: Lei 8.112/1990" value="${esc(estado.form.norma)}" /></label>`}
      <label class="u-block u-mt-4 u-mb-8">Ou traga o texto/HTML atualizado (no navegador)
        <textarea id="ca-html" rows="5" placeholder="texto atualizado da página oficial">${esc(estado.form.html)}</textarea></label>
      ${estado.processando ? `<div class="prova-status lendo u-flex u-mt-8"><span class="mini-spin"></span> Consultando a fonte oficial e comparando com o texto guardado…</div>` : ""}
      ${!estado.processando && estado.msg ? `<p class="${/desktop|traga|adicione/i.test(estado.msg) ? "muted" : "erro-msg"} small u-m-0 u-mt-8">${esc(estado.msg)}</p>` : ""}
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="ca-cancelar" ${estado.processando ? "disabled" : ""}>Cancelar</button>
        <button class="btn btn-primary ${estado.processando ? "carregando" : ""}" data-action="ca-conferir" ${estado.processando ? "disabled" : ""}>${estado.processando ? "Conferindo…" : "Conferir agora"}</button>
      </div>
    </div>`;
  };

  const previewHTML = () => {
    const d = estado.diff;
    const nMud = d.alterados.length + d.novos.length + d.revogados.length;
    if (!nMud) return `<div class="card form-leiseca">
      <h3>${icone("check")} ${esc(d.norma || "Lei")} — sem novidades</h3>
      <p class="muted small">Nenhuma diferença entre o texto guardado e a fonte. ${d.semMudanca} ${d.semMudanca === 1 ? "artigo conferido" : "artigos conferidos"}.</p>
      <div class="form-acoes"><span class="spacer"></span><button class="btn btn-primary" data-action="ca-cancelar">Fechar</button></div>
    </div>`;
    const sec = (titulo, ico, itens, render) => itens.length ? `<div class="ca-sec"><div class="ca-sec-tit">${icone(ico)} ${titulo} (${itens.length})</div>${itens.map(render).join("")}</div>` : "";
    return `<div class="card form-leiseca">
      <h3>${icone("sparkles")} ${esc(d.norma || "Lei")} — ${nMud} ${nMud === 1 ? "novidade" : "novidades"}</h3>
      <p class="muted small u-m-0 u-mb-8">Marque o que aplicar. Alterados atualizam o texto (a redação anterior fica guardada); novos entram no acervo; revogados saem do estudo. Tudo recebe o selo <span class="mini-tag nov-tag">novidade</span> para você treinar.</p>
      ${sec("Alterados", "square-pen", d.alterados, (a, i) => `<label class="ca-item"><input type="checkbox" class="ca-chk" data-grp="alterados" data-i="${i}" checked />
        <span><b>${esc(a.referencia)}</b><div class="ca-diff"><span class="ls-diff-red">${esc(trunc(a.textoAntigo))}</span> <span class="muted">→</span> <span class="ls-diff-green">${esc(trunc(a.textoNovo))}</span></div></span></label>`)}
      ${sec("Novos", "download", d.novos, (a, i) => `<label class="ca-item"><input type="checkbox" class="ca-chk" data-grp="novos" data-i="${i}" checked />
        <span><b>${esc(a.referencia)}</b><div class="muted small">${esc(trunc(a.texto))}</div></span></label>`)}
      ${sec("Revogados", "eye", d.revogados, (a, i) => `<label class="ca-item"><input type="checkbox" class="ca-chk" data-grp="revogados" data-i="${i}" checked />
        <span><s>${esc(a.referencia)}</s> <span class="muted small">— sai do estudo</span></span></label>`)}
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="ca-voltar">${icone("arrow-left")} Voltar</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-action="ca-aplicar">Aplicar selecionados</button>
      </div>
    </div>`;
  };

  abrirJanelaFluxo({
    titulo: "Conferir atualização (novidade legislativa)",
    render: (corpo) => {
      corpo.innerHTML = estado.etapa === "preview" ? previewHTML() : formHTML();
      corpo.querySelector("#ca-norma")?.addEventListener("change", (e) => {
        estado.form.norma = e.target.value;
        estado.form.url = e.target.selectedOptions[0]?.getAttribute("data-url") || "";
        const u = corpo.querySelector("#ca-url"); if (u) u.value = estado.form.url;
      });
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "ca-cancelar": () => fechar(),
      "ca-voltar": () => { estado.etapa = "form"; estado.msg = ""; rerender(); },
      "ca-conferir": async () => {
        estado.form.norma = corpo.querySelector("#ca-norma")?.value || corpo.querySelector("#ca-norma-txt")?.value?.trim() || estado.form.norma;
        estado.form.url = corpo.querySelector("#ca-url")?.value?.trim() || "";
        estado.form.html = corpo.querySelector("#ca-html")?.value || "";
        estado.form.intervalo = corpo.querySelector("#ca-intervalo")?.value?.trim() || "";
        if (!estado.form.norma) { estado.msg = "Informe a norma."; return rerender(); }
        if (!estado.form.html.trim() && !estado.form.url) { estado.msg = "Traga o texto atualizado ou informe o link da fonte."; return rerender(); }
        estado.processando = true; estado.msg = ""; rerender();
        const fimConf = toastCarregando("Consultando a fonte oficial…");
        try {
          const d = await store.compararLeiComFonte({
            norma: estado.form.norma,
            html: estado.form.html.trim() || undefined,
            url: estado.form.html.trim() ? undefined : estado.form.url,
            intervalo: estado.form.intervalo,
          });
          estado.processando = false; estado.diff = d; estado.etapa = "preview"; rerender();
          // Conferir atualização já é, na prática, conferir vigência: carimba a data de hoje
          // em todos os artigos da norma (o usuário reconsultou a fonte oficial agora).
          try { const any = store.get().indicacoes.find((x) => x.tipo === "lei" && normaDeRef(x.referencia) === estado.form.norma); if (any) store.marcarVigenciaConferida(any.id); } catch {}
        } catch (e) {
          console.error("[conferir-atualizacao]", e);
          estado.processando = false;
          estado.msg = e && e.code === "SEM_DESKTOP"
            ? "A busca automática só funciona no app desktop. Abra a página oficial, copie o texto (Ctrl+A, Ctrl+C) e adicione acima."
            : (e && e.message) || "Não consegui conferir. Confira o link ou traga o texto.";
          toast(estado.msg, "erro");
          rerender();
        } finally { fimConf(); }
      },
      "ca-aplicar": () => {
        const d = estado.diff;
        const marc = (grp) => [...corpo.querySelectorAll(`.ca-chk[data-grp="${grp}"]`)].filter((c) => c.checked).map((c) => +c.getAttribute("data-i"));
        const decisoes = {
          alterados: marc("alterados").map((i) => ({ indId: d.alterados[i].indId, texto: d.alterados[i].textoNovo })),
          novos: marc("novos").map((i) => ({ referencia: d.novos[i].referencia, texto: d.novos[i].texto })),
          revogados: marc("revogados").map((i) => ({ indId: d.revogados[i].indId, acao: "revogar" })),
        };
        const res = store.aplicarNovidadesLei(decisoes);
        const total = res.alterados + res.novos + res.revogados;
        toast(total ? `${total} ${total === 1 ? "novidade aplicada" : "novidades aplicadas"} (${res.alterados} alterado, ${res.novos} novo, ${res.revogados} revogado).` : "Nada selecionado.", total ? "ok" : "erro");
        fechar();
        app.refresh();
      },
    }),
  });
}

// Janela modal "Adicionar meta / Gravar na memória" (lei seca/jurisprudência) — fluxo
// stateful (editar → preview → aplicar) com render-loop próprio (abrirJanelaFluxo).
export function abrirAdicionarIndicacao(app, tipo, modo, entrada = {}) {
  const { store } = app;
  const r = rotulos(tipo);
  const estado = { preview: null, texto: entrada.textoInicial || "", processando: false, opts: { disciplinaId: null, topicoId: null, tribunal: null, categoria: null } };
  // Lê o vínculo escolhido (disciplina/tópico/tribunal/categoria) dos campos do painel.
  const lerOpts = (corpo) => ({
    tipo,
    modo,
    disciplinaId: corpo.querySelector("#add-disc")?.value || null,
    topicoId: corpo.querySelector("#add-top")?.value || null,
    tribunal: (corpo.querySelector("#add-trib")?.value || "").trim() || null,
    categoria: corpo.querySelector("#add-cat")?.value || null,
  });
  abrirJanelaFluxo({
    titulo: tipo === "juris" ? "Adicionar jurisprudência" : "Adicionar lei seca",
    render: (corpo, { rerender }) => {
      const st = store.get();
      if (estado.preview) {
        corpo.innerHTML = indPreviewHTML(st, tipo, modo, r, estado.preview, store);
        const live = (sel, set) => corpo.querySelectorAll(sel).forEach((el) =>
          el.addEventListener("input", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) set(estado.preview[i], el.value); }));
        live(".ind-ref-edit", (it, v) => (it.referencia = v));
        live(".ind-texto-edit", (it, v) => (it.texto = v));
        live(".ind-obs-edit", (it, v) => (it.observacao = v));
        live(".ind-trib-edit", (it, v) => (it.tribunal = v.trim() || null));
        corpo.querySelectorAll(".ind-cat-edit").forEach((el) =>
          el.addEventListener("change", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) estado.preview[i].categoria = el.value || null; }));
        corpo.querySelectorAll(".ind-acao-edit").forEach((el) =>
          el.addEventListener("change", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) estado.preview[i]._acao = el.value; }));
        return;
      }
      corpo.innerHTML = addPanelHTML(st, tipo, modo, r, estado.texto, estado.processando);
      // Restaura o vínculo escolhido (e popula a cascata de tópicos) ao voltar do preview.
      const dEl = corpo.querySelector("#add-disc");
      const tEl = corpo.querySelector("#add-top");
      if (dEl && estado.opts.disciplinaId) { dEl.value = estado.opts.disciplinaId; if (tEl) tEl.innerHTML = topicoOptions(st, estado.opts.disciplinaId, estado.opts.topicoId); }
      if (tEl && estado.opts.topicoId) tEl.value = estado.opts.topicoId;
      const tribEl = corpo.querySelector("#add-trib");
      if (tribEl && estado.opts.tribunal) sincronizarTribPicker(tribEl, estado.opts.tribunal);
      const catEl = corpo.querySelector("#add-cat");
      if (catEl && estado.opts.categoria) {
        catEl.value = estado.opts.categoria;
        const chip = corpo.querySelector(`[data-cat-pick="${estado.opts.categoria}"]`);
        if (chip) chip.classList.add("on");
      }
      bindCascata(corpo, st, "#add-disc", "#add-top");
      ligarTribunalPicker(corpo);
      ligarCategoriaPicker(corpo);
      const addFile = corpo.querySelector("#add-file");
      if (addFile) {
        ligarDropZone(addFile);
        ligarImportArquivo(addFile, {
          getCfg: () => store.get().config,
          contexto:
            tipo === "juris"
              ? "jurisprudência: súmulas, enunciados e precedentes judiciais, com o tribunal e a referência/número de cada um, preservando essa referência"
              : "legislação (lei seca): os artigos da norma com seus parágrafos, incisos e alíneas, preservando integralmente a numeração e o texto dos dispositivos",
          onTexto: (texto) => { const a = corpo.querySelector("#add-texto"); if (a) a.value = texto; if (texto.trim()) toast("Texto carregado. Revise e adicione."); },
        });
      }
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "cancelar-add": () => fechar(),
      adicionar: async () => {
        const texto = corpo.querySelector("#add-texto").value;
        if (!texto.trim()) return toast("Informe ao menos uma referência (ex.: art. 37, CF).", "erro");
        estado.opts = lerOpts(corpo);
        estado.texto = texto;
        estado.processando = true;
        rerender();
        let itens = [];
        try {
          itens = await store.prepararIndicacoesAuto(texto, tipo);
        } catch (e) {
          console.error(e);
          estado.processando = false;
          rerender();
          return toast(`A IA está indisponível no momento (tente de novo em instantes). Sem IA, separe cada item com "|".`, "erro");
        }
        estado.processando = false;
        if (!itens.length) { rerender(); return toast("Não consegui reconhecer referências. Confira o texto.", "erro"); }
        estado.preview = itens;
        rerender();
      },
      "remover-ind": (el) => {
        const i = parseInt(el.getAttribute("data-i"), 10);
        if (estado.preview) estado.preview.splice(i, 1);
        if (estado.preview && !estado.preview.length) estado.preview = null;
        rerender();
      },
      "voltar-ind": () => { estado.preview = null; rerender(); },
      "descartar-ind": () => fechar(),
      "aceitar-ind": () => {
        const itens = (estado.preview || []).filter((it) => (it.referencia || "").trim());
        if (!itens.length) return toast("Nenhum item para adicionar.", "erro");
        const n = store.aceitarIndicacoes(itens, estado.opts || { tipo, modo });
        toast(`${plural(n, "item adicionado", "itens adicionados")}.`);
        fechar();
        app.refresh();
      },
      "extrair-material": async (el) => {
        if (!store.iaDisponivel()) return avisoIA(app, "Extrair do material");
        const docId = corpo.querySelector("#add-doc").value;
        const itens = await comOcupado(() => store.prepararIndicacoesDeDoc(docId, tipo), { botao: el, msg: "Lendo o material e extraindo…" });
        if (itens == null) return;
        if (!itens.length) return toast("Não encontrei referências neste material.", "erro");
        estado.opts = lerOpts(corpo);
        estado.preview = itens;
        toast(`${plural(itens.length, "referência extraída", "referências extraídas")} (confira e ajuste).`);
        rerender();
      },
    }),
  });
}

// Janela modal "Marcar Prováveis Questões (PQ)" — IA sugere OU importa estatística →
// lista com checkboxes → aplicar. Render-loop próprio (abrirJanelaFluxo).
export function abrirMarcarPQ(app, tipo) {
  const { store } = app;
  const estado = { analise: null, corte: 30, sugerindo: false };
  abrirJanelaFluxo({
    titulo: "O que mais cai",
    render: (corpo, { rerender }) => {
      corpo.innerHTML = pqImportHTML(tipo, estado.corte, estado.sugerindo, estado.analise);
      corpo.querySelector("#pq-corte")?.addEventListener("change", (e) => {
        estado.corte = parseInt(e.target.value, 10) || 0;
        if (estado.analise) rerender();
      });
      // Importar estatística de ARQUIVO (.txt/.csv/.pdf) — antes só dava p/ colar.
      ligarImportArquivo(corpo.querySelector("#pq-file"), {
        getCfg: () => store.get().config,
        contexto: "estatística de incidência (o que mais cai)",
        onTexto: (texto) => {
          if (!texto || !texto.trim()) return toast("Não consegui ler texto desse arquivo.", "erro");
          // Joga o texto extraído no quadro p/ você conferir/editar antes de "Analisar".
          const ta = corpo.querySelector("#pq-texto");
          if (ta) { ta.value = texto.trim(); ta.focus(); }
          toast("Texto importado — confira e clique em Analisar.");
        },
      });
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "pq-ia-sugere": async () => {
        if (!store.iaDisponivel()) return avisoIA(app, "Sugerir 'o que mais cai' com IA");
        estado.sugerindo = true; rerender();
        try {
          estado.analise = await store.sugerirPQIA(tipo);
          toast(estado.analise.length ? `${plural(estado.analise.length, "referência sugerida", "referências sugeridas")} pela IA.` : "A IA não destacou nenhuma como alta incidência.");
        } catch (e) { console.error(e); toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro"); }
        estado.sugerindo = false; rerender();
      },
      "pq-analisar": () => {
        const texto = corpo.querySelector("#pq-texto")?.value || "";
        estado.corte = parseInt(corpo.querySelector("#pq-corte")?.value, 10) || 0;
        if (!texto.trim()) return toast("Cole a estatística de incidência.", "erro");
        estado.analise = store.analisarEstatisticaPQ(texto);
        rerender();
      },
      "pq-aplicar": () => {
        const itens = [];
        corpo.querySelectorAll(".pq-cb:checked").forEach((cb) => {
          const r = estado.analise[parseInt(cb.getAttribute("data-i"), 10)];
          if (r) r.ids.forEach((id) => itens.push({ id, incidencia: r.incidencia }));
        });
        const n = store.aplicarPQ(itens);
        toast(n ? `${plural(n, "item marcado", "itens marcados")} como 'o que mais cai'.` : "Nenhum item selecionado.", n ? "ok" : "erro");
        if (n) { fechar(); app.refresh(); }
      },
    }),
  });
}

// Painel para marcar Prováveis Questões (PQ): dois caminhos (IA sugere OU importar
// estatística), ambos casados com as referências CADASTRADAS NESTA ABA. O usuário confirma.
function pqImportHTML(tipo, corte = 30, sugerindo = false, analise = null) {
  const ondeBase = tipo === "juris" ? "Jurisprudência" : "Lei Seca";
  return `<div class="card pq-import">
    <h3><span class="orb orb-sm" aria-hidden="true" style="display:inline-block;vertical-align:middle"></span> ${icone("star")} Marcar o que mais cai <span class="muted small pq-info" data-tip-pos="bottom" data-tip="Pontos de alta incidência (o que mais cai) num tópico. A IA estima pelas suas referências de ${ondeBase}; ou importe/cole uma estatística. Você confirma antes de aplicar.">${icone("info")}</span></h3>

    <div class="pq-acoes">
      <button class="btn btn-ia btn-sm" data-action="pq-ia-sugere" ${sugerindo ? "disabled" : ""}>${icone("sparkles")} ${sugerindo ? "Analisando…" : "Sugerir com IA"}</button>
      <span class="muted small">ou importe uma estatística:</span>
      <label class="btn btn-ghost btn-sm btn-file" data-tip="Arquivo (.txt/.csv/.pdf) com 'referência ; número' por linha."><input type="file" id="pq-file" accept=".txt,.csv,.md,.pdf" hidden />${icone("paperclip")} Importar arquivo</label>
    </div>

    <div class="pq-colar">
      <p class="muted small pq-colar-dica">Uma por linha: <b>referência ; número</b> — importe um arquivo (cai aqui embaixo) ou digite/cole. Ex.: <code>art. 37, CF ; 45</code></p>
      <textarea id="pq-texto" rows="4" placeholder="art. 37, CF ; 45&#10;Súmula 473 STF ; 30"></textarea>
      <div class="u-mt-8"><button class="btn btn-ghost btn-sm" data-action="pq-analisar">Analisar</button></div>
    </div>

    ${analise ? `<div class="pq-corte-linha"><label class="inline small">Já marcar quando a incidência ≥ <input id="pq-corte" type="number" min="0" max="100" value="${corte}" style="width:64px; margin:0 6px" /></label> <span class="muted small">(opcional · abaixo vêm desmarcadas)</span></div>` : ""}
    ${analise ? pqResultadoHTML(corte, analise) : ""}
  </div>`;
}

// Lista de sugestões de PQ (vinda da IA ou da estatística), para o usuário confirmar.
function pqResultadoHTML(corte, analise) {
  if (!analise.length) {
    return `<p class="muted small u-mt-12">Nenhuma referência foi reconhecida ou casada com seus itens. Na importação, use o formato "referência ; número"; na IA, cadastre algumas referências antes.</p>`;
  }
  const casadas = analise.filter((r) => r.ids.length).length;
  return `<div class="pq-resultado">
      <div class="muted small u-mt-12 u-mb-8">${plural(casadas, "referência casada", "referências casadas")} com seus itens. Confira e ajuste o que será marcado como 'o que mais cai':</div>
      <ul class="pq-lista">
        ${analise
          .map((r, i) => {
            const casou = r.ids.length > 0;
            const acima = r.incidencia >= corte;
            return `<li class="pq-res-item ${casou ? "" : "pq-nao-casou"}">
              <input type="checkbox" class="pq-cb" data-i="${i}" ${casou && acima ? "checked" : ""} ${casou ? "" : "disabled"} />
              <span class="pq-res-ref"><b>${esc(r.ref)}</b> · incidência ${r.incidencia}</span>
              <span class="pq-res-match muted small">${casou ? "→ " + esc(r.nomes.join(", ")) : "(nenhum item correspondente)"}</span>
            </li>`;
          })
          .join("")}
      </ul>
      <button class="btn btn-primary btn-sm" data-action="pq-aplicar">Marcar os selecionados</button>
    </div>`;
}
