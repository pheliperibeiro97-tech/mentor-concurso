// Widget reutilizável "Adicionar questões": digitar/colar (1 ou várias),
// importar PDF/.txt, ou — a partir de um material já cadastrado — extrair as
// existentes ou gerar por IA. Usado no Treino e no setup do Simulado, em DOIS
// formatos: 'mc' (múltipla escolha, padrão) e 'ce' (Certo/Errado). O estado
// {aberto} é mantido pela tela que usa.
import { toast, avisoIA, ligarDropZone, pedirNumero, abrirJanelaFluxo , plural } from "../ui.js";
import { lerArquivoTexto } from "../pdf.js";
import { esc } from "../util.js";
import { icone } from "../icones.js";
import { mesclarBancas } from "../bancas.js";
import { abrirSeletorEscopo } from "./seletor-escopo.js";

const ehCE = (formato) => formato === "ce";

export function addQuestoesBotaoHTML(aberto, formato) {
  // Sempre "Adicionar…": o fluxo virou JANELA MODAL (tem o próprio fechar). O rótulo
  // "Fechar" era do antigo painel inline e ficava preso quando o modal fechava pelo X.
  const rotulo = ehCE(formato) ? "Adicionar itens" : "Adicionar questões";
  return `<button class="btn btn-add btn-sm" data-action="toggle-addq" data-tip-pos="cima-esq" data-tip="Digite ou cole, importe um arquivo, extraia do material ou gere com IA.">${rotulo}</button>`;
}

export function addQuestoesPanelHTML(st, estado, formato) {
  const aberto = estado && estado.aberto;
  if (!aberto) return "";
  const ce = ehCE(formato);
  if (estado.preview) return qPreviewHTML(estado.preview, ce, st);
  const opcoesVincular =
    `<option value="">— sem tópico —</option>` +
    st.topicos.map((t) => `<option value="${t.id}">${esc(nomeTopico(st, t))}</option>`).join("");
  const opcoesDocs = st.documentos.map((d) => `<option value="${d.id}">${esc(d.titulo)}</option>`).join("");
  const temDocs = !!st.documentos.length;

  const instr = ce
    ? `<b>Importe ou cole um PDF/texto de prova ou de banca</b> que o app extrai os itens com o gabarito (Certo/Errado) e os dados (referência, assunto, banca, ano, órgão), aplicando o gabarito do bloco de respostas no final. Ou monte à mão, <b>um item por linha</b> com <b>|</b>: <i>afirmação | C ou E | justificativa</i>. Você revisa cada item antes de adicionar.`
    : `<b>Importe ou cole um PDF/texto de prova ou de banca</b> que o app extrai as questões com o gabarito e os dados (referência, assunto, banca, ano, órgão), aplicando o gabarito do bloco de respostas no final. Ou monte à mão, <b>uma questão por linha</b> com <b>|</b>: <i>enunciado | alternativas</i> (marque a correta com <b>*</b>). Você revisa cada questão antes de adicionar.`;
  const exemplo = ce
    ? `O ato administrativo goza de presunção de legitimidade | C | É um de seus atributos.
Servidor em estágio probatório não pode ser exonerado | E | Pode, se reprovado na avaliação.`
    : `São atributos do ato, EXCETO: | Presunção | Imperatividade | Autoexecutoriedade | *Onerosidade | ref: Q123456
Prazo da apelação? | *15 dias úteis | 5 dias | 10 dias`;
  const placeholder = `Ex.:\n${exemplo}`;

  return `
    <div class="card form-questao">
      <h3>${ce ? "Adicionar itens Certo/Errado" : "Adicionar questões"}</h3>
      <p class="muted small" style="margin:0 0 12px">Três jeitos de adicionar — escolha um abaixo.</p>

      <div class="add-via">
        <h4>${icone("square-pen")} Digitar, colar ou importar arquivo</h4>
        <p class="muted small" style="margin:0 0 10px">${instr}</p>
        <div class="add-via-linha">
          <label class="inline" style="flex:1; min-width:220px">Vincular todas ao tópico <select id="q-add-top">${opcoesVincular}</select></label>
          <label class="btn btn-ghost btn-sm btn-file" data-tip-pos="bottom-dir" data-tip="Importar de um PDF ou arquivo .txt. Você também pode arrastar o arquivo para cá.">${icone("paperclip")} Importar de arquivo
            <input id="q-add-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden />
          </label>
        </div>
        <textarea id="q-add-texto" rows="4" placeholder="${esc(placeholder)}">${esc(estado.textoSalvo || "")}</textarea>
        <div class="form-acoes">
          <button class="btn btn-ghost" data-action="cancelar-addq">Cancelar</button>
          <button class="btn btn-primary" data-action="adicionar-questoes" ${estado.processando ? "disabled" : ""}>${estado.processando ? "Processando…" : "Revisar"}</button>
        </div>
      </div>

      ${
        temDocs
          ? `<div class="add-via">
              <h4>${icone("library")} A partir de um material já cadastrado</h4>
              <p class="muted small" style="margin:0 0 10px">Use uma aula ou conteúdo que você importou em Materiais: o app extrai ${ce ? "os itens C/E" : "as questões"} que já existem nele, ou a IA gera ${ce ? "itens novos" : "questões novas"}.</p>
              <div class="add-via-linha">
                <label class="inline" style="flex:1; min-width:200px">Material <select id="q-add-doc">${opcoesDocs}</select></label>
                <button class="btn btn-ghost btn-sm" data-action="extrair-doc" data-tip="Puxa ${ce ? "os itens C/E" : "as questões"} que JÁ existem no material (não inventa).">${icone("clipboard-list")} Extrair do material</button>
                <button class="btn btn-ia btn-sm" data-action="gerar-escopo" data-tip="A IA cria ${ce ? "itens Certo/Errado novos" : "questões novas"}: escolha tópico, aula e subtópico do índice.">${icone("sparkles")} Gerar com IA</button>
              </div>
            </div>`
          : ""
      }

      ${provaImportHTML(st, estado)}
    </div>`;
}

// Preview EDITÁVEL das questões com RESPOSTA OCULTA (não estraga a prática): o enunciado/afirmação
// fica visível; alternativas+correta (MC) ou gabarito+justificativa (C/E) ficam atrás de "".
// Editar, remover (✕), voltar para editar e então adicionar.
function qPreviewHTML(itens, ce, st) {
  const topOpts = (sel) =>
    `<option value="">— sem tópico —</option>` +
    (st ? st.topicos.map((t) => `<option value="${t.id}" ${sel === t.id ? "selected" : ""}>${esc(nomeTopico(st, t))}</option>`).join("") : "");
  // Linha de ORIGEM/metadados (visível: não é a resposta). Vêm preenchidos só na importação de arquivo.
  const metaRow = (q, i) => `<div class="q-meta-row">
      <input class="prev-inp q-ref" data-i="${i}" value="${esc(q.referencia || "")}" placeholder="Referência (cód.)" />
      <input class="prev-inp q-assunto" data-i="${i}" value="${esc(q.assunto || "")}" placeholder="Assunto" />
      <input class="prev-inp q-banca" data-i="${i}" value="${esc(q.banca || "")}" placeholder="Banca" />
      <input class="prev-inp q-ano" data-i="${i}" value="${esc(q.ano || "")}" placeholder="Ano" />
      <input class="prev-inp q-orgao" data-i="${i}" value="${esc(q.orgao || "")}" placeholder="Órgão/Prova" />
      <label class="q-top-lbl">Tópico ${q.topicoId ? '<span class="mini-tag" data-tip="Sugerido pelo assunto — confira.">sugerido</span>' : ""}
        <select class="q-topico" data-i="${i}">${topOpts(q.topicoId || "")}</select>
      </label>
    </div>`;
  const card = (q, i) => {
    if (ce) {
      return `<li class="prev-card m-pratica q-prev-card" data-i="${i}">
        <div class="prev-card-l1">
          <input class="prev-inp q-enun" data-i="${i}" value="${esc(q.enunciado || "")}" placeholder="Afirmação" />
          <button class="prev-remover" data-action="remover-q-prev" data-i="${i}" data-tip-pos="cima-dir" data-tip="Remover este item">${icone("x")}</button>
        </div>
        ${metaRow(q, i)}
        <details class="prev-spoiler">
          <summary>${icone("eye")} ver/editar gabarito e justificativa</summary>
          <div class="prev-card-campos">
            <label class="inline small">Gabarito:
              <select class="q-ce-gab" data-i="${i}"><option value="C" ${q.certo ? "selected" : ""}>Certo</option><option value="E" ${!q.certo ? "selected" : ""}>Errado</option></select>
            </label>
          </div>
          <input class="prev-inp q-just" data-i="${i}" value="${esc(q.justificativa || "")}" placeholder="Justificativa (opcional)" />
        </details>
      </li>`;
    }
    const alts = q.alternativas || [];
    return `<li class="prev-card m-pratica q-prev-card" data-i="${i}">
      <div class="prev-card-l1">
        <input class="prev-inp q-enun" data-i="${i}" value="${esc(q.enunciado || "")}" placeholder="Enunciado" />
        <button class="prev-remover" data-action="remover-q-prev" data-i="${i}" data-tip-pos="cima-dir" data-tip="Remover esta questão">${icone("x")}</button>
      </div>
      ${metaRow(q, i)}
      <details class="prev-spoiler">
        <summary>${icone("eye")} ver/editar alternativas e gabarito</summary>
        <p class="muted small" style="margin:0 0 4px">Marque a alternativa correta no botão à esquerda.</p>
        <ul class="q-alts" style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:5px">
          ${alts
            .map((a, ai) => `<li class="q-alt-linha" style="display:flex;align-items:center;gap:6px">
              <input type="radio" name="gab-${i}" class="q-gab" data-i="${i}" data-a="${ai}" ${ai === q.gabarito ? "checked" : ""} style="width:auto;margin:0;flex-shrink:0" />
              <input class="prev-inp q-alt" data-i="${i}" data-a="${ai}" value="${esc(a || "")}" placeholder="Alternativa ${ai + 1}" />
            </li>`)
            .join("")}
        </ul>
      </details>
    </li>`;
  };
  return `<div class="card form-questao">
    <h3>${icone("download")} Revisar ${plural(itens.length, ce ? "item" : "questão", ce ? "itens" : "questões")} antes de adicionar</h3>
    <p class="muted small" style="margin:0 0 10px">O enunciado e a origem (referência/assunto/banca…) ficam visíveis; ${ce ? "o gabarito e a justificativa" : "as alternativas e a correta"} ficam ocultos para não estragar a prática — revele só se quiser conferir. Edite e remova (✕) à vontade.</p>
    <ul class="prev-editavel">${itens.map(card).join("")}</ul>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="voltar-q" data-tip-pos="cima-esq" data-tip="Volta ao texto colado para corrigir e revisar de novo.">← Voltar para editar</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-action="descartar-q">Descartar</button>
      <button class="btn btn-primary" data-action="aceitar-q" ${itens.length ? "" : "disabled"}>Adicionar (${itens.length})</button>
    </div>
  </div>`;
}

// Lê o preview de volta do DOM (preserva edições sem listeners por tecla, evitando perder o foco).
function lerPreviewQ(root, ce) {
  const val = (c, sel) => (c.querySelector(sel)?.value || "").trim() || null;
  return [...root.querySelectorAll(".q-prev-card")].map((c) => {
    const enunciado = c.querySelector(".q-enun")?.value || "";
    const meta = {
      referencia: val(c, ".q-ref"),
      assunto: val(c, ".q-assunto"),
      banca: val(c, ".q-banca"),
      ano: val(c, ".q-ano"),
      orgao: val(c, ".q-orgao"),
      topicoId: (c.querySelector(".q-topico")?.value || "") || null,
    };
    if (ce) {
      return { enunciado, certo: (c.querySelector(".q-ce-gab")?.value || "C") === "C", justificativa: c.querySelector(".q-just")?.value || "", ...meta };
    }
    const alternativas = [...c.querySelectorAll(".q-alt")].map((i) => i.value);
    const gabRadio = c.querySelector(".q-gab:checked");
    const gabarito = gabRadio ? parseInt(gabRadio.getAttribute("data-a"), 10) : 0;
    return { enunciado, alternativas, gabarito, ...meta };
  });
}

// ---- Importar prova anterior (provas oficiais que o usuário baixa do site da banca) ----
// Sub-fluxo dentro do widget: cola o texto da prova + o gabarito + a referência; a IA
// extrai as questões e o GABARITO é o OFICIAL (selo ), com tela de revisão antes de
// confirmar. O transitório (form e revisão) vive no `estado` da tela (persiste no render).
function provaImportHTML(st, estado) {
  const aberto = !!estado.provaAberto;
  const pf = estado.provaForm || {};
  const rev = estado.provaRevisao;
  const lista = mesclarBancas(st.bancas || []);
  const dataOpts = lista.map((b) => `<option value="${esc(b.nome)}"></option>`).join("");
  const opcoesVincular =
    `<option value="">— sem tópico —</option>` +
    st.topicos.map((t) => `<option value="${t.id}" ${pf.topicoId === t.id ? "selected" : ""}>${esc(nomeTopico(st, t))}</option>`).join("");

  let corpo;
  if (!aberto) {
    corpo = `<button class="btn btn-ghost btn-sm" data-action="toggle-prova" data-tip="Importe uma prova que você baixou do site da banca: questões reais + gabarito definitivo." data-tip-pos="cima-esq">${icone("file-text")} Importar prova anterior</button>`;
  } else if (rev) {
    corpo = provaRevisaoHTML(rev);
  } else {
    corpo = `
      <p class="muted small">Traga o <b>texto da prova</b> e o <b>gabarito definitivo</b> que você baixou do site da banca. A IA extrai as questões; o gabarito é o <b>definitivo</b> (selo oficial). O app não baixa nada: você traz o conteúdo.</p>
      <details class="prova-fontes">
        <summary>${icone("download")} Onde baixar provas anteriores (sites oficiais)</summary>
        <div class="prova-fontes-lista">
          ${lista.filter((b) => b.siteOficial).map((b) => `<a href="${esc(b.siteOficial)}" target="_blank" rel="noopener">${esc(b.nome)} ↗</a>`).join("")}
        </div>
        <p class="muted small">Provas anteriores de concurso público costumam ser de acesso livre no site da banca. Baixe a prova e o gabarito e cole/importe aqui.</p>
      </details>
      <div class="form-row">
        <label style="flex:1">Banca <input id="prova-banca" list="prova-bancas-list" value="${esc(pf.banca || "")}" placeholder="Ex.: VUNESP" /></label>
        <label style="width:96px">Ano <input id="prova-ano" value="${esc(pf.ano || "")}" placeholder="2024" /></label>
        <label style="flex:1">Órgão <input id="prova-orgao" value="${esc(pf.orgao || "")}" placeholder="Ex.: TJSP" /></label>
      </div>
      <datalist id="prova-bancas-list">${dataOpts}</datalist>
      <div class="form-row">
        <label style="flex:1">Cargo <input id="prova-cargo" value="${esc(pf.cargo || "")}" placeholder="Ex.: Escrevente" /></label>
        <label style="flex:2">URL da fonte (opcional) <input id="prova-url" value="${esc(pf.url || "")}" placeholder="https://..." /></label>
        <label>Formato
          <select id="prova-formato">
            <option value="mc" ${pf.formato !== "ce" ? "selected" : ""}>Múltipla escolha (A, B, C…)</option>
            <option value="ce" ${pf.formato === "ce" ? "selected" : ""}>Certo/Errado</option>
          </select>
        </label>
      </div>
      <label class="inline">Vincular ao tópico: <select id="prova-topico">${opcoesVincular}</select></label>

      <div class="prova-campo">
        <div class="prova-campo-tit"><b>1) Prova</b> <span class="muted small">— cole o texto abaixo <b>ou</b> importe o arquivo (faça só um)</span>
          <label class="btn btn-ghost btn-sm btn-file" data-tip-pos="bottom-dir" data-tip="PDF ou .txt da prova. PDF escaneado é transcrito por OCR (Visão) se a IA estiver conectada.">${icone("paperclip")} Importar arquivo<input id="prova-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden /></label>
        </div>
        <textarea id="prova-texto" rows="5" placeholder="Cole aqui o texto da prova (enunciados e alternativas)…">${esc(pf.textoProva || "")}</textarea>
      </div>

      <div class="prova-campo">
        <div class="prova-campo-tit"><b>2) Gabarito definitivo</b> <span class="muted small">— cole abaixo <b>ou</b> importe o arquivo (faça só um)</span>
          <label class="btn btn-ghost btn-sm btn-file" data-tip-pos="bottom-dir" data-tip="PDF ou .txt do gabarito. PDF escaneado é transcrito por OCR (Visão) se a IA estiver conectada.">${icone("paperclip")} Importar arquivo<input id="gab-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" hidden /></label>
        </div>
        <textarea id="gab-texto" rows="3" placeholder="Cole aqui o gabarito definitivo (ex.: 1-A  2-C  3-E …  ·  Cebraspe: 1-C  2-E …)">${esc(pf.textoGabarito || "")}</textarea>
      </div>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="prova-cancelar">Cancelar</button>
        <button class="btn btn-primary" data-action="prova-extrair">Extrair e revisar</button>
      </div>`;
  }
  return `<div class="add-via">
    <h4>${icone("file-text")} De uma prova anterior <span class="muted small" style="font-weight:400">(gabarito definitivo)</span></h4>
    ${corpo}
  </div>`;
}

function provaRevisaoHTML(rev) {
  const qs = rev.questoes || [];
  const anuladas = qs.filter((q) => q.anulada).length;
  const semGab = qs.filter((q) => q.semGabarito).length;
  const comGab = qs.filter((q) => !q.anulada && !q.semGabarito).length;
  // Lista: só os enunciados (para conferir a extração). O GABARITO fica OCULTO na importação
  // (não se mostra a resposta antes de praticar) — o app confirma quantos têm gabarito aplicado.
  const linhas = qs
    .map((q, i) => {
      const flags =
        (q.anulada ? ` <span class="selo selo-manual">anulada</span>` : "") +
        (q.semGabarito ? ` <span class="selo selo-amarelo">sem gabarito</span>` : "");
      const txt = (q.enunciado || "").replace(/\s+/g, " ").trim();
      const num = Number.isInteger(q.numero) ? q.numero : i + 1;
      return `<div class="prova-rev-item"><b>${num}.</b> ${esc(txt.slice(0, 110))}${txt.length > 110 ? "…" : ""}${flags}</div>`;
    })
    .join("");
  return `
    <p class="small"><b>${qs.length}</b> ${qs.length === 1 ? "questão extraída" : "questões extraídas"} · <b>${comGab}</b> com gabarito aplicado${anuladas ? ` · <b>${anuladas}</b> ${anuladas === 1 ? "anulada" : "anuladas"}` : ""}${semGab ? ` · <b>${semGab}</b> sem gabarito` : ""}. Revise os enunciados e confirme (o gabarito fica oculto até a prática).</p>
    <div class="prova-rev-lista">${linhas || '<span class="muted small">Nada extraído. Volte e confira o texto colado.</span>'}</div>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="prova-voltar">Voltar</button>
      <button class="btn btn-primary" data-action="prova-confirmar" ${qs.length ? "" : "disabled"}>Confirmar importação (${qs.length})</button>
    </div>`;
}

// Liga o upload de arquivo do painel (chamar após o render). Wira o import normal e os
// dois arquivos do sub-fluxo de prova (prova e gabarito) — cada um joga o texto lido na
// sua textarea correspondente.
export function ligarAddQuestoesArquivo(root, app, formato) {
  const ce = ehCE(formato);
  // comOcr: arquivos de prova/gabarito tentam OCR (Visão) quando o PDF é escaneado e há
  // IA conectada; o import normal de questões fica só com o texto selecionável.
  const wire = (inputSel, areaSel, comOcr, contexto) => {
    const inp = root.querySelector(inputSel);
    if (!inp) return;
    ligarDropZone(inp);
    const status = document.createElement("span");
    status.className = "import-status";
    (inp.closest("label") || inp).insertAdjacentElement("afterend", status);
    inp.addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const area = root.querySelector(areaSel);
      const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
      const ehImg = (f.type || "").startsWith("image/");
      const comIA = app.store.iaDisponivel() && (ehPdf || ehImg);
      status.className = "import-status lendo";
      status.innerHTML = `<span class="import-spin">${icone("refresh-cw")}</span> <span class="import-nome"></span>`;
      const setNome = (t) => { const n = status.querySelector(".import-nome"); if (n) n.textContent = t; };
      setNome(`${f.name} — lendo${comIA ? " com a IA" : ""}…`);
      try {
        const texto = comOcr && app
          ? await app.store.lerArquivoComOcr(f, (msg) => setNome(msg), contexto)
          : await lerArquivoTexto(f, app.store.get().config, contexto);
        if (area) area.value = texto;
        const linhas = (texto || "").split(/\r?\n/).filter((l) => l.trim()).length;
        status.className = texto.trim() ? "import-status ok" : "import-status erro";
        status.textContent = texto.trim() ? `✓ ${f.name} — carregado (${linhas} linha${linhas === 1 ? "" : "s"})` : `${f.name} — sem texto reconhecido. Cole manualmente.`;
      } catch (err) {
        console.error(err);
        status.className = "import-status erro";
        status.textContent = err && err.code === "PDF_PROTEGIDO" ? "PDF protegido — cole o texto." : `✗ ${f.name} — não consegui ler. Cole manualmente.`;
      }
    });
  };
  wire("#q-add-file", "#q-add-texto", false,
    "questões de concurso (export de banca/Qconcursos). TRANSCREVA FIELMENTE o conteúdo, preservando TUDO: o código " +
    "da questão (ex.: Q4037745), a disciplina e o assunto (linha com '>' ou 'Assunto:'), banca, ano, órgão, o enunciado " +
    "completo, as alternativas na ordem, e o BLOCO DE RESPOSTAS/GABARITO (ex.: 'Respostas 1:B 2:A...') se houver. NÃO resolva, " +
    "NÃO reformate, NÃO invente; apenas transcreva o texto legível. IGNORE propaganda, marca d'água do site e os blocos " +
    "'Resumo relacionado' (textos de divulgação entre as questões).");
  wire("#prova-file", "#prova-texto", true, "as QUESTÕES de uma prova de concurso: o enunciado e as alternativas de cada questão, na ordem, com a numeração (sem o gabarito de respostas)");
  wire("#gab-file", "#gab-texto", true, "o GABARITO de uma prova: a lista de respostas corretas por número de questão (ex.: 1-A, 2-C, 3-E...), apenas o mapa de respostas");
}

// Handler do botão: abre a JANELA modal de adicionar (substitui o painel inline).
// `estado` = objeto de estado do widget mantido pela tela-pai. `formato` = 'mc' | 'ce'.
export function addQuestoesHandlers(root, app, estado, formato) {
  return {
    "toggle-addq": () => abrirAddQuestoes(app, estado, formato),
  };
}

// Janela modal "Adicionar questões / itens C/E" — fluxo stateful com render-loop próprio
// (abrirJanelaFluxo). Reusa addQuestoesPanelHTML/qPreviewHTML/provaImportHTML; lê o preview
// do DOM (lerPreviewQ) a cada ação, então não precisa religar listeners por tecla.
function abrirAddQuestoes(app, estado, formato) {
  const { store } = app;
  const ce = ehCE(formato);
  estado.aberto = true; // addQuestoesPanelHTML só renderiza com aberto=true
  abrirJanelaFluxo({
    titulo: ce ? "Adicionar itens Certo/Errado" : "Adicionar questões",
    render: (corpo) => {
      const st = store.get();
      corpo.innerHTML = addQuestoesPanelHTML(st, estado, formato);
      ligarAddQuestoesArquivo(corpo, app, formato); // wira #q-add-file, #prova-file, #gab-file (no corpo)
    },
    handlers: ({ rerender, fechar, corpo }) => {
      // Fecha a janela e zera o transitório do fluxo.
      const cerrar = () => {
        estado.aberto = false;
        estado.preview = null;
        estado.textoSalvo = "";
        estado.processando = false;
        estado.provaAberto = false;
        estado.provaForm = null;
        estado.provaRevisao = null;
        fechar();
      };
      return {
        "cancelar-addq": () => cerrar(),
        // "Revisar": parseia e abre o PREVIEW editável (resposta oculta), sem gravar ainda.
        // Determinístico p/ texto `|`; PDF de banca → extração rica por IA (ref/assunto/banca/ano/órgão + gabarito final).
        "adicionar-questoes": async () => {
          const texto = corpo.querySelector("#q-add-texto").value;
          const top = corpo.querySelector("#q-add-top").value || null;
          if (!texto.trim()) return toast(ce ? "Digite ou cole ao menos um item." : "Digite ou cole ao menos uma questão.", "erro");
          estado.processando = true;
          rerender();
          let itens = [];
          try {
            itens = ce ? await store.prepararQuestoesCEAuto(texto) : await store.prepararQuestoesAuto(texto, "mc");
          } catch (e) {
            console.error(e);
            estado.processando = false;
            rerender();
            return toast(`A IA está indisponível no momento (tente de novo em instantes). Sem IA, use o formato com "|".`, "erro");
          }
          estado.processando = false;
          if (!itens.length) { rerender(); return toast(ce ? "Nada reconhecido. Use 'afirmação | C ou E | justificativa' por linha." : "Nada reconhecido. Use 'enunciado | alt | *correta' por linha.", "erro"); }
          // Sugere o tópico pelo assunto (você confere no preview). Só quando o item não trouxe tópico.
          for (const it of itens) {
            if (it.topicoId === undefined && (it.assunto || "")) {
              const sug = store.sugerirTopicoPorAssunto(it.assunto, "");
              if (sug) it.topicoId = sug.topicoId;
            }
          }
          estado.previewTop = top;
          estado.textoSalvo = texto;
          estado.preview = itens;
          rerender();
        },
        "remover-q-prev": (el) => {
          const i = parseInt(el.getAttribute("data-i"), 10);
          estado.preview = lerPreviewQ(corpo, ce); // preserva edições antes de remover
          estado.preview.splice(i, 1);
          if (!estado.preview.length) estado.preview = null;
          rerender();
        },
        "voltar-q": () => { estado.preview = null; rerender(); },
        "descartar-q": () => cerrar(),
        "aceitar-q": () => {
          const itens = lerPreviewQ(corpo, ce);
          const n = ce ? store.aceitarQuestoesCE(itens, estado.previewTop || null) : store.aceitarQuestoes(itens, estado.previewTop || null);
          if (!n) return toast(ce ? "Cada item precisa de afirmação e gabarito." : "Cada questão precisa de enunciado e ao menos 2 alternativas.", "erro");
          cerrar();
          app.refresh();
          toast(`${plural(n, ce ? "item adicionado" : "questão adicionada", ce ? "itens adicionados" : "questões adicionadas")}.`);
        },
        // Extrai do material para o PREVIEW editável (não grava ainda).
        "extrair-doc": async (el) => {
          if (!store.iaDisponivel()) return avisoIA(app, ce ? "Extrair itens C/E do material" : "Extrair questões do material");
          const docId = corpo.querySelector("#q-add-doc").value;
          el.disabled = true;
          toast("Extraindo do material…");
          try {
            const itens = ce ? await store.prepararQuestoesCEDeDoc(docId) : await store.prepararQuestoesDeDoc(docId);
            if (!itens.length) { el.disabled = false; return toast("Não encontrei nada pronto neste material.", "erro"); }
            const doc = store.get().documentos.find((d) => d.id === docId);
            estado.previewTop = (doc && doc.topicoId) || corpo.querySelector("#q-add-top")?.value || null;
            estado.textoSalvo = "";
            estado.preview = itens;
            toast(`${plural(itens.length, ce ? "item extraído" : "questão extraída", ce ? "itens extraídos" : "questões extraídas")} (confira e ajuste).`);
            rerender();
          } catch (e) {
            console.error(e);
            toast("A IA não conseguiu concluir agora. Tente de novo em instantes.", "erro");
            el.disabled = false;
          }
        },
        // Abre o seletor de escopo (Tópico → Aula → Subtópico, ou base Material). Fecha o
        // painel de adição: o seletor é uma janela própria e grava direto + app.refresh().
        "gerar-escopo": () => {
          cerrar();
          abrirSeletorEscopo(app, { tipo: ce ? "ce" : "questoes", titulo: ce ? "Gerar itens Certo/Errado" : "Gerar questões" });
        },

        // ---- Importar prova anterior ----
        "toggle-prova": () => { estado.provaAberto = !estado.provaAberto; estado.provaRevisao = null; rerender(); },
        "prova-cancelar": () => { estado.provaAberto = false; estado.provaForm = null; estado.provaRevisao = null; rerender(); },
        "prova-voltar": () => { estado.provaRevisao = null; rerender(); },
        "prova-extrair": async (el) => {
          const pf = {
            banca: corpo.querySelector("#prova-banca")?.value.trim() || "",
            ano: corpo.querySelector("#prova-ano")?.value.trim() || "",
            orgao: corpo.querySelector("#prova-orgao")?.value.trim() || "",
            cargo: corpo.querySelector("#prova-cargo")?.value.trim() || "",
            url: corpo.querySelector("#prova-url")?.value.trim() || "",
            formato: corpo.querySelector("#prova-formato")?.value || "mc",
            topicoId: corpo.querySelector("#prova-topico")?.value || "",
            textoProva: corpo.querySelector("#prova-texto")?.value || "",
            textoGabarito: corpo.querySelector("#gab-texto")?.value || "",
          };
          estado.provaForm = pf;
          if (!pf.textoProva.trim()) return toast("Cole o texto da prova.", "erro");
          if (!pf.textoGabarito.trim()) return toast("Cole o gabarito oficial.", "erro");
          if (!store.iaDisponivel()) return avisoIA(app, "Importar prova anterior");
          el.disabled = true;
          el.textContent = "Extraindo…";
          let status = corpo.querySelector("#prova-status");
          if (!status) { status = document.createElement("div"); status.id = "prova-status"; el.closest(".form-acoes")?.insertAdjacentElement("afterend", status) || el.insertAdjacentElement("afterend", status); }
          const setStatus = (msg, tipo) => { status.className = "prova-status " + (tipo || "lendo"); status.innerHTML = tipo === "erro" ? `${esc(msg)}` : `<span class="import-spin">${icone("refresh-cw")}</span> ${esc(msg)}`; };
          setStatus("Iniciando a extração… (pode demorar em provas grandes)");
          try {
            const rev = await store.prepararProvaDeTexto({ textoProva: pf.textoProva, textoGabarito: pf.textoGabarito, formato: pf.formato, onProgress: (msg) => setStatus(msg) });
            estado.provaRevisao = rev;
            if (!rev.questoes.length) { setStatus("Não consegui extrair questões. Verifique se colou o texto da prova (e tente novamente).", "erro"); el.disabled = false; el.textContent = "Extrair e revisar"; return; }
            rerender(); // mostra o preview da prova
          } catch (e) {
            console.error(e);
            setStatus(e && e.code === "IA_OFFLINE" ? "Conecte a IA (Gemini) para extrair." : "Não consegui extrair agora (servidor de IA ocupado ou texto inválido). Tente de novo em instantes.", "erro");
            el.disabled = false;
            el.textContent = "Extrair e revisar";
          }
        },
        "prova-confirmar": () => {
          const pf = estado.provaForm || {};
          const rev = estado.provaRevisao;
          if (!rev || !rev.questoes.length) return toast("Nada para importar.", "erro");
          const r = store.importarProva({
            referencia: { banca: pf.banca, ano: pf.ano, orgao: pf.orgao, cargo: pf.cargo, url: pf.url },
            questoes: rev.questoes,
            topicoId: pf.topicoId || null,
          });
          if (r.duplicada) return toast("Esta prova já foi importada antes.", "erro");
          cerrar();
          app.refresh();
          toast(`${plural(r.criadas, ce ? "item importado" : "questão importada", ce ? "itens importados" : "questões importadas")}${r.anuladas ? `, ${plural(r.anuladas, "anulada", "anuladas")}` : ""}.`);
        },
      };
    },
  });
}

// Situação de uma questão pelas tentativas (a última define acertei/errei).
export function statusQuestao(st, q) {
  const tents = st.tentativas.filter((t) => t.questaoId === q.id);
  if (!tents.length) return "pendente";
  return tents[tents.length - 1].acertou ? "acertei" : "errei";
}

function nomeTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
