// Caderno de Erros: erros de questões respondidas + erros incluídos/importados
// manualmente (vinculados a disciplina e/ou tópico). Permite classificar motivo,
// editar o comentário e (para manuais) editar/remover.
import { bindActions, toast, header, seloBadge, vazio, confirmar, imprimir, botaoImprimir, opcoesImpressao, avisoIA, focarItem, explicacaoIAHTML, abrirJanela, abrirJanelaFluxo, plural } from "../ui.js";
import { esc, fmtData, MOTIVOS_ERRO as MOTIVOS, textoComentario } from "../util.js";
import { icone } from "../icones.js";
import { filtroTopicosBotaoHTML, filtroTopicosPainelHTML, ligarFiltroTopicos, itemNoFiltro } from "./questoes-filtro.js";

let filtroMotivo = "todos";
const filtroTop = { sel: [], aberto: false }; // multi-tópico (disciplinas/tópicos)
let ordenar = "recente"; // recente | antigo | motivo | disciplina
let comentando = null; // { id, manual } comentário em edição

export default function renderErros(root, app) {
  const { store } = app;
  const st = store.get();
  // Foco num erro específico (Dossiê): zera os filtros para garantir que ele apareça.
  let focoErro = null;
  if (app.params && app.params.focoErroId) {
    focoErro = app.params.focoErroId;
    app.params.focoErroId = null;
    filtroMotivo = "todos";
    filtroTop.sel = [];
    ordenar = "recente";
  }
  // Escopo vindo do "Hoje" (Revisar → deste tópico): pré-filtra pelo tópico.
  if (app.params && app.params.topicoId) {
    filtroTop.sel = [app.params.topicoId];
    app.params.topicoId = null;
  }
  const todos = store.cadernoErros();
  let erros = todos;
  if (filtroMotivo !== "todos") {
    erros = erros.filter((e) => (filtroMotivo === "sem" ? !e.motivoErro : e.motivoErro === filtroMotivo));
  }
  erros = erros.filter((e) => itemNoFiltro(st, e, filtroTop.sel));
  erros = ordenarErros(st, [...erros], ordenar);

  const porMotivo = {};
  for (const m of MOTIVOS) porMotivo[m] = todos.filter((e) => e.motivoErro === m).length;
  const semMotivo = todos.filter((e) => !e.motivoErro).length;

  // Ids únicos das QUESTÕES erradas no filtro atual (para "Refazer em foco" — reaproveita
  // o Modo Foco de Questões, com correção item a item). Erros manuais/flashcard ficam fora.
  const refazerIds = [...new Set(erros.filter((e) => e.questao && e.questao.alternativas).map((e) => e.questao.id))];

  root.innerHTML = `
    ${header("Caderno de Erros", `${plural(todos.length, "erro", "erros")} em todas as disciplinas`, botaoImprimir())}

    <div class="erros-resumo muted small">
      <b class="num">${todos.length}</b> ${todos.length === 1 ? "erro" : "erros"}${MOTIVOS.map((m) => (porMotivo[m] ? ` · <span class="num">${porMotivo[m]}</span> ${esc(m).toLowerCase()}` : "")).join("")}${semMotivo ? ` · <span class="num">${semMotivo}</span> não definido` : ""}
    </div>

    <div class="barra-acoes">
      <button class="btn btn-add btn-sm" data-action="toggle-add" data-tip-pos="cima-esq" data-tip="Digite um erro ou cole vários (um por linha).">Adicionar erro</button>
      <button class="btn btn-sm fc-foco-btn" data-action="refazer-erros-foco" ${refazerIds.length ? "" : "disabled"} data-tip="Refaz as questões erradas (deste filtro) uma a uma, em tela cheia, com correção item a item.">${icone("expand")} Refazer em foco (<span class="num">${refazerIds.length}</span>)</button>
    </div>

    <div class="barra-acoes filtro-bar">
      ${filtroTopicosBotaoHTML(st, filtroTop.sel, filtroTop.aberto)}
      <label class="inline">Motivo:
        <select id="filtro-motivo">
          <option value="todos">Todos</option>
          ${MOTIVOS.map((m) => `<option value="${m}" ${filtroMotivo === m ? "selected" : ""}>${m}</option>`).join("")}
          <option value="sem" ${filtroMotivo === "sem" ? "selected" : ""}>Não definido</option>
        </select>
      </label>
      <label class="inline">Ordenar:
        <select id="ordenar">
          <option value="recente" ${ordenar === "recente" ? "selected" : ""}>Mais recentes</option>
          <option value="antigo" ${ordenar === "antigo" ? "selected" : ""}>Mais antigos</option>
          <option value="motivo" ${ordenar === "motivo" ? "selected" : ""}>Por motivo</option>
          <option value="disciplina" ${ordenar === "disciplina" ? "selected" : ""}>Por disciplina</option>
        </select>
      </label>
    </div>
    ${filtroTopicosPainelHTML(st, filtroTop.sel, filtroTop.aberto)}

    <div class="lista-erros">
      ${
        erros.length
          ? erros.map((e) => erroHTML(st, e)).join("")
          : todos.length
            ? vazio("Nenhum erro com esse filtro\nAjuste o motivo, a disciplina ou os tópicos para ver seus erros.", "", icone("search"))
            : vazio(
                "Sem erros por aqui — bom sinal!\nOs erros aparecem sozinhos quando você erra questões na aba Questões. Você também pode incluir um manualmente.",
                `<button class="btn btn-add btn-sm" data-action="toggle-add">Adicionar erro</button>`,
                icone("party-popper")
              )
      }
    </div>`;

  root.querySelector("#filtro-motivo")?.addEventListener("change", (e) => {
    filtroMotivo = e.target.value;
    app.refresh();
  });
  root.querySelector("#ordenar")?.addEventListener("change", (e) => {
    ordenar = e.target.value;
    app.refresh();
  });
  ligarFiltroTopicos(root, app, filtroTop);
  focarItem(root, focoErro);

  // selects de motivo (questão e manual)
  root.querySelectorAll('select[data-action="motivo"]').forEach((selEl) => {
    selEl.addEventListener("change", () => {
      const id = selEl.getAttribute("data-id");
      if (selEl.getAttribute("data-manual") === "true") store.setMotivoErroManual(id, selEl.value);
      else store.setMotivoErro(id, selEl.value);
      toast("Motivo classificado.");
    });
  });

  bindActions(root, {
    imprimir: async () => {
      // Respeita os filtros da tela (motivo + tópico + ordem); oferece esconder a resposta/IA.
      if (!erros.length) return toast("Nenhum erro no filtro atual para imprimir.", "erro");
      const op = await opcoesImpressao("Imprimir caderno de erros", [
        { key: "resp", label: "Resposta certa", opcoes: [{ v: "com", rot: "Com a resposta certa" }, { v: "sem", rot: "Sem a resposta certa" }], def: "com" },
        { key: "ia", label: "Comentário da IA", opcoes: [{ v: "com", rot: "Incluir o comentário da IA" }, { v: "sem", rot: "Sem o comentário da IA" }], def: "com" },
      ]);
      if (!op) return;
      imprimir("Caderno de Erros — Mentor Concurso", printErros(st, erros, op));
    },
    "toggle-add": () => abrirAdicionarErro(app),
    "refazer-erros-foco": () => {
      if (!refazerIds.length) return;
      // Abre o Modo Foco de Questões já com a fila = questões erradas (MC e/ou C/E).
      app.navigate("pratica", { focoErrosIds: refazerIds });
    },
    "salvar-erro": (el) => salvarErro(root, store, el.getAttribute("data-id")),
    "editar-erro": (el) => {
      const e = store.get().errosManuais.find((x) => x.id === el.getAttribute("data-id"));
      if (!e) return;
      abrirJanela({
        titulo: "Editar erro",
        corpoHTML: formErroHTML(st, e),
        aoMontar: (jan, fechar) => {
          bindCascata(jan, st, "#err-disc", "#err-top");
          jan.querySelector('[data-action="cancelar-add"]').addEventListener("click", fechar);
          jan.querySelector('[data-action="salvar-erro"]').addEventListener("click", () => {
            if (salvarErro(jan, store, e.id)) { fechar(); app.refresh(); }
          });
        },
      });
    },
    "del-erro": async (el) => {
      if (await confirmar("Remover este erro do caderno?")) {
        store.removerErroManual(el.getAttribute("data-id"));
        toast("Erro removido.");
      }
    },
    "del-erro-questao": async (el) => {
      if (await confirmar("Tirar este erro do caderno? A questão e o histórico de acertos continuam (só sai daqui).")) {
        store.removerErroQuestao(el.getAttribute("data-id"));
        toast("Tirado do caderno.");
      }
    },
    "comentar-ia": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Comentar o erro");
      el.disabled = true;
      toast("Analisando o erro com IA…");
      try {
        await store.comentarErroIA(el.getAttribute("data-id"));
        toast("Comentário da IA gerado.");
      } catch (e) {
        toast("Não consegui comentar este erro agora. Tente de novo em instantes.", "erro");
        el.disabled = false;
      }
    },
    "gerar-flashcard": (el) => {
      const fc = store.gerarFlashcardDeErro(el.getAttribute("data-id"), el.getAttribute("data-manual") === "true");
      toast(fc ? "Flashcard criado a partir do erro (na aba Flashcards)." : "Não foi possível gerar.", fc ? "ok" : "erro");
    },
    "editar-comentario": (el) => {
      comentando = { id: el.getAttribute("data-id"), manual: el.getAttribute("data-manual") === "true" };
      app.refresh();
    },
    "cancelar-comentario": () => {
      comentando = null;
      app.refresh();
    },
    "salvar-comentario": (el) => {
      const id = el.getAttribute("data-id");
      const manual = el.getAttribute("data-manual") === "true";
      const texto = root.querySelector(`#coment-${id}`).value;
      store.setComentarioErro(id, texto, manual);
      comentando = null;
      toast("Comentário salvo.");
    },
    "ir-dossie": (el) => app.navigate("edital", { dossieTopicoId: el.getAttribute("data-top") }),
  });
}

function salvarErro(root, store, editId) {
  const disciplinaId = root.querySelector("#err-disc").value || null;
  const topicoId = root.querySelector("#err-top").value || null;
  const descricao = root.querySelector("#err-desc").value.trim();
  const correto = root.querySelector("#err-correto").value.trim();
  const suaResposta = root.querySelector("#err-sua").value.trim();
  const motivoErro = root.querySelector("#err-motivo").value || null;
  if (!descricao) { toast("Descreva o erro/questão.", "erro"); return false; }
  if (!disciplinaId && !topicoId) { toast("Vincule a uma disciplina (e, se quiser, a um tópico).", "erro"); return false; }
  if (editId) {
    store.editarErroManual(editId, { disciplinaId, topicoId, descricao, correto, suaResposta, motivoErro });
    toast("Erro atualizado.");
  } else {
    store.addErroManual({ disciplinaId, topicoId, descricao, correto, suaResposta, motivoErro });
    toast("Erro adicionado ao caderno.");
  }
  return true;
}

// Formulário de EDIÇÃO de um erro manual (campos estruturados).
function formErroHTML(st, e) {
  const sel = e || {};
  let discId = sel.disciplinaId || "";
  if (!discId && sel.topicoId) {
    const t = st.topicos.find((x) => x.id === sel.topicoId);
    discId = t ? t.disciplinaId : "";
  }
  const opcoesDisc = `<option value="">— selecione —</option>` + st.disciplinas.map((d) => `<option value="${d.id}" ${d.id === discId ? "selected" : ""}>${esc(d.nome)}</option>`).join("");
  const opcoesTop = topicoOptions(st, discId, sel.topicoId);
  return `
    <div class="card form-erro">
      <h3>${icone("square-pen")} Editar erro</h3>
      <div class="form-row">
        <label>Disciplina <select id="err-disc">${opcoesDisc}</select></label>
        <label>Tópico (opcional) <select id="err-top">${opcoesTop}</select></label>
      </div>
      <label>Descrição do erro / questão <textarea id="err-desc" rows="2">${esc(sel.descricao || "")}</textarea></label>
      <div class="form-row">
        <label>Resposta correta <input id="err-correto" type="text" value="${esc(sel.correto || "")}" /></label>
        <label>Sua resposta (opcional) <input id="err-sua" type="text" value="${esc(sel.suaResposta || "")}" /></label>
      </div>
      <label class="inline">Motivo:
        <select id="err-motivo"><option value="">—</option>${MOTIVOS.map((m) => `<option ${sel.motivoErro === m ? "selected" : ""}>${m}</option>`).join("")}</select>
      </label>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="cancelar-add">Cancelar</button>
        <button class="btn btn-primary" data-action="salvar-erro" data-id="${e.id}">Salvar</button>
      </div>
    </div>`;
}

// Painel ÚNICO de adicionar: digite um erro OU cole vários (um por linha). Os campos
// estruturados (sua resposta, motivo do seletor) ficam disponíveis ao EDITAR o erro.
function addErroPanelHTML(st, texto = "") {
  const opcoesDisc = `<option value="">— selecione —</option>` + st.disciplinas.map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("");
  return `
    <div class="card form-erro">
      <h3>Adicionar erro ao caderno</h3>
      <div class="form-row">
        <label>Disciplina <select id="err-disc">${opcoesDisc}</select></label>
        <label>Tópico (opcional) <select id="err-top"><option value="">— sem tópico específico —</option></select></label>
      </div>
      <p class="muted small" style="margin:0 0 6px">Digite um erro ou cole vários (um por linha), campos separados por <b>|</b>: a <b>descrição</b>, a <b>resposta correta</b> e, opcional, o <b>motivo</b>. Usa a disciplina/tópico acima. Você revisa e edita cada erro antes de salvar.</p>
      <textarea id="imp-texto" rows="4" placeholder="${esc("Ex.:\nPrazo de apelação | 15 dias úteis | Esqueci\nDiferença entre dolo e culpa | dolo = vontade; culpa = imprudência")}">${esc(texto)}</textarea>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="cancelar-add">Cancelar</button>
        <button class="btn btn-primary" data-action="importar-erros">Revisar</button>
      </div>
    </div>`;
}

// Preview EDITÁVEL dos erros (antes de gravar): descrição, resposta correta e motivo por item.
// Editar, remover (✕), voltar para editar e então adicionar. Disciplina/tópico vêm do painel.
function errPreviewHTML(st, itens) {
  const motivoOpcoes = (sel) => `<option value="">— motivo (opcional) —</option>` + MOTIVOS.map((m) => `<option ${sel === m ? "selected" : ""}>${esc(m)}</option>`).join("");
  return `<div class="card form-erro">
    <h3>${icone("download")} Revisar ${itens.length} ${itens.length === 1 ? "erro" : "erros"} antes de adicionar</h3>
    <p class="muted small" style="margin:0 0 8px">Edite a descrição, a resposta correta e o motivo de cada erro; remova (✕) o que não quiser. A disciplina/tópico escolhidos acima valem para todos.</p>
    <ul class="prev-editavel">
      ${itens
        .map((it, i) => {
          return `<li class="prev-card m-geral">
            <div class="prev-card-l1">
              <input class="prev-inp err-desc-edit" data-i="${i}" value="${esc(it.descricao || "")}" placeholder="Descrição do erro / pegadinha" />
              <button class="prev-remover" data-action="remover-err" data-i="${i}" data-tip-pos="cima-dir" data-tip="Remover este erro">${icone("x")}</button>
            </div>
            <input class="prev-inp err-correto-edit" data-i="${i}" value="${esc(it.correto || "")}" placeholder="Resposta correta (opcional)" />
            <div class="prev-card-campos">
              <select class="err-motivo-edit" data-i="${i}" data-tip="Motivo do erro">${motivoOpcoes(it.motivoErro || "")}</select>
            </div>
          </li>`;
        })
        .join("")}
    </ul>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="voltar-err" data-tip-pos="cima-esq" data-tip="Volta ao texto colado para corrigir e revisar de novo.">← Voltar para editar</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-action="descartar-err">Descartar</button>
      <button class="btn btn-primary" data-action="aceitar-err" ${itens.length ? "" : "disabled"}>Adicionar (${itens.length})</button>
    </div>
  </div>`;
}

// Janela modal "Adicionar erro" — fluxo stateful (editar → preview → adicionar) com
// render-loop próprio (abrirJanelaFluxo). Substitui o painel inline antigo.
function abrirAdicionarErro(app) {
  const { store } = app;
  const estado = { preview: null, texto: "", disc: "", top: "" };
  abrirJanelaFluxo({
    titulo: "Adicionar erro ao caderno",
    render: (corpo, { rerender }) => {
      const st = store.get();
      if (estado.preview) {
        corpo.innerHTML = errPreviewHTML(st, estado.preview);
        corpo.querySelectorAll(".err-desc-edit").forEach((el) =>
          el.addEventListener("input", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) estado.preview[i].descricao = el.value; })
        );
        corpo.querySelectorAll(".err-correto-edit").forEach((el) =>
          el.addEventListener("input", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) estado.preview[i].correto = el.value; })
        );
        corpo.querySelectorAll(".err-motivo-edit").forEach((el) =>
          el.addEventListener("change", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) estado.preview[i].motivoErro = el.value || null; })
        );
        return;
      }
      corpo.innerHTML = addErroPanelHTML(st, estado.texto);
      // Restaura disciplina/tópico escolhidos (e popula a cascata) ao voltar do preview.
      const dEl = corpo.querySelector("#err-disc");
      const tEl = corpo.querySelector("#err-top");
      if (dEl && estado.disc) { dEl.value = estado.disc; if (tEl) tEl.innerHTML = topicoOptions(st, estado.disc, estado.top); }
      bindCascata(corpo, st, "#err-disc", "#err-top");
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "cancelar-add": () => fechar(),
      "importar-erros": () => {
        const texto = corpo.querySelector("#imp-texto").value;
        const disc = corpo.querySelector("#err-disc").value || null;
        const top = corpo.querySelector("#err-top").value || null;
        if (!texto.trim()) return toast("Digite ou cole ao menos um erro.", "erro");
        if (!disc && !top) return toast("Vincule a uma disciplina (e, se quiser, a um tópico).", "erro");
        const itens = store.prepararErros(texto);
        if (!itens.length) return toast("Nada reconhecido. Use 'descrição | resposta correta | motivo' por linha.", "erro");
        estado.disc = disc || "";
        estado.top = top || "";
        estado.texto = texto;
        estado.preview = itens;
        rerender();
      },
      "remover-err": (el) => {
        const i = parseInt(el.getAttribute("data-i"), 10);
        if (estado.preview) estado.preview.splice(i, 1);
        if (estado.preview && !estado.preview.length) estado.preview = null;
        rerender();
      },
      "voltar-err": () => { estado.preview = null; rerender(); },
      "descartar-err": () => fechar(),
      "aceitar-err": () => {
        const itens = (estado.preview || []).filter((it) => (it.descricao || "").trim());
        if (!itens.length) return toast("Nenhum erro para adicionar.", "erro");
        const n = store.aceitarErros(itens, estado.disc || null, estado.top || null);
        toast(`${plural(n, "erro adicionado", "erros adicionados")}.`);
        fechar();
        app.refresh();
      },
    }),
  });
}

function erroHTML(st, e) {
  const topico = st.topicos.find((t) => t.id === e.topicoId);
  const disc = topico
    ? st.disciplinas.find((d) => d.id === topico.disciplinaId)
    : e.disciplinaId
    ? st.disciplinas.find((d) => d.id === e.disciplinaId)
    : null;
  const vinculo = topico
    ? `<button class="tag-topico lnk" data-action="ir-dossie" data-top="${topico.id}">${esc(nomeTopico(st, topico))}</button>`
    : disc
    ? `<span class="tag-topico">${esc(disc.nome)}</span>`
    : `<span class="tag-topico">Tópico não definido</span>`;

  let enun, respostas;
  if (e.manual) {
    enun = e.descricao;
    respostas = `
      ${e.suaResposta ? `<div class="erro-sua">Sua resposta: <b>${esc(e.suaResposta)}</b></div>` : ""}
      ${e.correto ? `<div class="erro-cert">Correto: <b>${esc(e.correto)}</b></div>` : ""}`;
  } else {
    const q = e.questao;
    enun = q.enunciado;
    respostas = `
      <div class="erro-sua">Você marcou: <b>${esc(q.alternativas[e.escolha] ?? "—")}</b></div>
      <div class="erro-cert">Gabarito: <b>${esc(q.alternativas[q.gabarito] ?? "—")}</b></div>`;
  }

  const emEdicaoComent = comentando && comentando.id === e.id;
  const comentarioHTML = emEdicaoComent
    ? `<div class="erro-coment-edit">
        <textarea id="coment-${e.id}" rows="2" placeholder="Escreva seu comentário sobre o erro...">${esc(textoComentario(e.comentarioIA))}</textarea>
        <div class="form-acoes">
          <button class="btn btn-ghost btn-sm" data-action="cancelar-comentario">Cancelar</button>
          <button class="btn btn-primary btn-sm" data-action="salvar-comentario" data-id="${e.id}" data-manual="${e.manual}">Salvar comentário</button>
        </div>
      </div>`
    : e.comentarioIA
    ? `${explicacaoIAHTML(e.comentarioIA)}<button class="lnk" data-action="editar-comentario" data-id="${e.id}" data-manual="${e.manual}" data-tip="Editar este comentário.">${icone("square-pen")} editar comentário</button>`
    : `<button class="lnk add-coment" data-action="editar-comentario" data-id="${e.id}" data-manual="${e.manual}" data-tip="Anote por que errou e como não repetir.">${icone("square-pen")} adicionar comentário</button>`;

  // "Análise" recolhível: classificação (motivo) + comentário. Aberta quando já há
  // algo (motivo definido, comentário ou edição em andamento); fechada quando vazia.
  const analiseAberta = !!e.motivoErro || !!e.comentarioIA || emEdicaoComent;

  return `
    <div class="card erro-item ${e.manual ? "erro-manual" : ""}" data-foco-id="${e.id}">
      <div class="erro-head">
        ${vinculo}
        ${e.manual ? '<span class="mini-tag">manual</span>' : ""}
        <span class="spacer"></span>
        <span class="muted">${fmtData(e.data)}</span>
        ${
          e.manual
            ? `<button class="lnk" data-action="editar-erro" data-id="${e.id}" data-tip-pos="cima-dir" data-tip="Editar este erro.">${icone("square-pen")}</button>
               <button class="lnk lnk-danger" data-action="del-erro" data-id="${e.id}" data-tip-pos="cima-dir" data-tip="Remover este erro do caderno.">${icone("x")}</button>`
            : `<button class="lnk lnk-danger" data-action="del-erro-questao" data-id="${e.id}" data-tip-pos="cima-dir" data-tip="Tirar do caderno (a questão e o histórico de acertos continuam).">${icone("x")}</button>`
        }
      </div>
      <div class="erro-enun">${esc(enun)}</div>
      <div class="erro-respostas">${respostas}</div>
      ${e.duvida ? `<div class="erro-duvida">${icone("message-square")} ${esc(e.duvida)}</div>` : ""}
      <details class="erro-analise"${analiseAberta ? " open" : ""}>
        <summary>Análise${e.motivoErro ? ` · ${esc(e.motivoErro)}` : ""}</summary>
        <div class="erro-acoes">
          <label class="inline">Motivo:
            <select data-action="motivo" data-id="${e.id}" data-manual="${e.manual}">
              <option value="">—</option>
              ${MOTIVOS.map((m) => `<option ${e.motivoErro === m ? "selected" : ""}>${m}</option>`).join("")}
            </select>
          </label>
          ${!e.manual ? `<button class="btn btn-ia btn-sm" data-action="comentar-ia" data-id="${e.id}" data-tip-pos="cima-dir" data-tip="A IA explica por que você errou e como não repetir (com selo de origem).">${icone("sparkles")} Comentar com IA</button>` : ""}
          <button class="btn btn-ghost btn-sm" data-action="gerar-flashcard" data-id="${e.id}" data-manual="${e.manual}" data-tip="Cria um flashcard a partir deste erro, para revisar depois.">${icone("layers")} Flashcards</button>
        </div>
        ${comentarioHTML}
      </details>
    </div>`;
}

function printErros(st, erros, { resp = "com", ia = "com" } = {}) {
  if (!erros.length) return "<p>Nenhum erro registrado.</p>";
  return erros
    .map((e) => {
      const topico = st.topicos.find((t) => t.id === e.topicoId);
      const disc = topico ? st.disciplinas.find((d) => d.id === topico.disciplinaId) : e.disciplinaId ? st.disciplinas.find((d) => d.id === e.disciplinaId) : null;
      const vinc = topico ? nomeTopico(st, topico) : disc ? disc.nome : "Tópico não definido";
      let corpo;
      if (e.manual) {
        corpo = `<div><b>${esc(e.descricao)}</b></div>${e.suaResposta ? `<div>Sua resposta: ${esc(e.suaResposta)}</div>` : ""}${resp === "com" && e.correto ? `<div>Correto: <span class="gab">${esc(e.correto)}</span></div>` : ""}`;
      } else {
        const q = e.questao;
        corpo = `<div><b>${esc(q.enunciado)}</b></div><div>Sua resposta: ${esc(q.alternativas[e.escolha] ?? "—")}</div>${resp === "com" ? `<div>Gabarito: <span class="gab">${esc(q.alternativas[q.gabarito] ?? "—")}</span></div>` : ""}`;
      }
      return `<div class="print-item">${corpo}
        <div class="print-meta">${esc(vinc)}${e.motivoErro ? " · motivo: " + esc(e.motivoErro) : ""} · ${fmtData(e.data)}</div>
        ${ia === "com" && e.comentarioIA ? `<div class="print-verso">${icone("message-square")} ${esc(textoComentario(e.comentarioIA))}</div>` : ""}</div>`;
    })
    .join("");
}

// ---------- helpers ----------
// Disciplina de um erro (direta ou via tópico).
function discDoErro(st, e) {
  if (e.disciplinaId) return e.disciplinaId;
  const t = e.topicoId ? st.topicos.find((x) => x.id === e.topicoId) : null;
  return t ? t.disciplinaId : null;
}
function ordenarErros(st, lista, modo) {
  const nomeDisc = (e) => {
    const d = st.disciplinas.find((x) => x.id === discDoErro(st, e));
    return d ? d.nome : "~"; // sem disciplina vai para o fim
  };
  if (modo === "antigo") return lista.sort((a, b) => (a.data > b.data ? 1 : -1));
  if (modo === "motivo") return lista.sort((a, b) => (a.motivoErro || "~").localeCompare(b.motivoErro || "~", "pt"));
  if (modo === "disciplina") return lista.sort((a, b) => nomeDisc(a).localeCompare(nomeDisc(b), "pt"));
  return lista.sort((a, b) => (a.data < b.data ? 1 : -1)); // recente (padrão)
}
function topicoOptions(st, disciplinaId, selecionado) {
  const tops = st.topicos.filter((t) => !disciplinaId || t.disciplinaId === disciplinaId);
  return `<option value="">— sem tópico específico —</option>` + tops.map((t) => `<option value="${t.id}" ${t.id === selecionado ? "selected" : ""}>${esc(t.nome)}</option>`).join("");
}
function bindCascata(root, st, discSel, topSel) {
  const dEl = root.querySelector(discSel);
  const tEl = root.querySelector(topSel);
  if (!dEl || !tEl) return;
  dEl.addEventListener("change", () => {
    tEl.innerHTML = topicoOptions(st, dEl.value || "", null);
  });
}
function nomeTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
