// Flashcards / Revisão: recall ativo + repetição espaçada (SM-2) + exportação Anki.
// Criar cards num painel único (digitar/colar/importar, gerar do material com IA,
// ou gerar das questões offline). Revisão filtrável por disciplina/tópicos.
import { bindActions, toast, header, seloBadge, vazio, imprimir, botaoImprimir, opcoesImpressao, avisoIA, confirmar, ligarDropZone, focarItem, pedirNumero, explicacaoIAHTML, abrirJanela, abrirJanelaFluxo, confetti , plural } from "../ui.js";
import { esc, fmtData, todayISO, MOTIVOS_ERRO, textoComentario } from "../util.js";
import { icone } from "../icones.js";
import * as sm2 from "../sm2.js";
import { filtroTopicosBotaoHTML, filtroTopicosPainelHTML, ligarFiltroTopicos, questaoNoFiltro } from "./questoes-filtro.js";
import { abrirSeletorEscopo } from "./seletor-escopo.js";

let revelado = false;
let mostrarLista = false;
let editandoId = null;
const filtroRev = { sel: [], aberto: false }; // multi-tópico da revisão
let filtroTipo = "todos"; // todos | qa | afirmacao (C/E)
let cadernoErroId = null; // id do card com o painel "salvar no caderno" aberto
let puladosSessao = new Set(); // ids pulados nesta sessão (voltam depois)
let mostrarExport = false; // painel de exportação Anki (oculto até clicar)
let revisarId = null; // estuda UM card específico sob demanda (da lista "Ver todos"), mesmo não vencido
let ordemRev = "recentes"; // ordem da fila: "recentes" (recém-criados primeiro, padrão) | "vencimento"

// Opções de "baralho" (Todos / por disciplina / por tópico) — usado só na exportação.
function opcoesBaralho(st, sel) {
  return (
    `<option value="todos" ${sel === "todos" ? "selected" : ""}>Todos os baralhos</option>` +
    st.disciplinas
      .map((d) => {
        const tops = st.topicos.filter((t) => t.disciplinaId === d.id);
        return (
          `<optgroup label="${esc(d.nome)}">` +
          `<option value="disc:${d.id}" ${sel === "disc:" + d.id ? "selected" : ""}>Toda a disciplina</option>` +
          tops.map((t) => `<option value="${t.id}" ${sel === t.id ? "selected" : ""}>${esc(t.nome)}</option>`).join("") +
          `</optgroup>`
        );
      })
      .join("")
  );
}

// Filtra flashcards por escopo (todos | disc:<id> | <topicoId>) — usado na exportação.
function filtrarPorEscopo(st, escopo) {
  if (!escopo || escopo === "todos") return st.flashcards;
  if (String(escopo).startsWith("disc:")) {
    const id = escopo.slice(5);
    return st.flashcards.filter((f) => {
      if (f.disciplinaId === id) return true;
      const t = f.topicoId ? st.topicos.find((x) => x.id === f.topicoId) : null;
      return t ? t.disciplinaId === id : false;
    });
  }
  return st.flashcards.filter((f) => f.topicoId === escopo);
}

// Mapa de botões amigáveis → qualidade SM-2.
const NOTAS = [
  { q: 0, label: "Errei", cls: "n-erro" },
  { q: 3, label: "Difícil", cls: "n-dif" },
  { q: 4, label: "Bom", cls: "n-bom" },
  { q: 5, label: "Fácil", cls: "n-facil" },
];

export default function renderFlashcards(root, app) {
  const { store } = app;
  const st = store.get();
  // Foco num flashcard específico (Dossiê): abre a lista "Ver todos" e rola até ele.
  let focoFc = null;
  if (app.params && app.params.focoFlashcardId) {
    focoFc = app.params.focoFlashcardId;
    app.params.focoFlashcardId = null;
    mostrarLista = true;
  }
  const vencidos = store
    .flashcardsVencidos()
    .filter((c) => !puladosSessao.has(c.id) && questaoNoFiltro(c, filtroRev.sel) && tipoNoFiltro(c, filtroTipo));
  // Ordem "recém-criados primeiro": resolve o caso de gerar novos cards e querer revisá-los
  // ANTES dos pendentes antigos (sem ter que zerar a fila). Senão, ordem padrão (vencimento).
  if (ordemRev === "recentes") vencidos.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
  // "Revisar este" (da lista) força UM card específico no topo, mesmo não vencido.
  const atual = (revisarId && st.flashcards.find((c) => c.id === revisarId && !c.suspenso)) || vencidos[0];
  const suspensos = st.flashcards.filter((f) => f.suspenso).length;
  // Resumo do cabeçalho (global, sem o filtro): pendentes hoje · já revisados hoje · total geral.
  const hoje = todayISO();
  const pendentesHoje = store.flashcardsVencidos().length;
  const revisadosHoje = st.flashcards.filter((f) => f.sm2.lastReview === hoje).length;

  root.innerHTML = `
    ${header("Flashcards", `Recordação ativa com repetição espaçada · ${pendentesHoje} para hoje · ${plural(revisadosHoje, "revisado", "revisados")} · ${st.flashcards.length} no total`, botaoImprimir())}

    <div class="barra-acoes">
      <button class="btn btn-add btn-sm" data-action="toggle-criar" data-tip-pos="cima-esq" data-tip="Digite/cole, importe um arquivo, gere do material (IA) ou das suas questões.">Criar flashcards</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" data-action="toggle-lista" data-tip-pos="cima-dir" data-tip="Lista todos os seus flashcards em tabela.">${mostrarLista ? "Ocultar lista" : "Ver todos"}</button>
      <details class="doc-mais">
        <summary class="lnk" data-tip-pos="cima-dir" data-tip="Mais ações: exportar para o Anki.">${icone("ellipsis")}</summary>
        <div class="doc-mais-pop" role="menu">
          <button class="menu-item" data-action="toggle-export" ${st.flashcards.length ? "" : "disabled"}>${mostrarExport ? "Fechar exportação" : "Exportar p/ Anki"}</button>
        </div>
      </details>
    </div>

    ${editandoId ? editFormHTML(st) : ""}

    ${
      mostrarExport
        ? `<div class="card export-panel">
            <h3>${icone("download")} Exportar para o Anki</h3>
            <p class="muted small">Escolha quais flashcards exportar. Gera um <b>.txt</b> que o Anki importa (Arquivo → Importar).</p>
            <div class="form-row" style="align-items:flex-end">
              <label style="flex:1">Baralho <select id="export-escopo">${opcoesBaralho(st, "todos")}</select></label>
              <label class="inline"><input type="checkbox" id="export-venc" /> Só os vencidos (revisar hoje)</label>
              <button class="btn btn-primary" data-action="baixar-anki">Baixar .txt</button>
            </div>
          </div>`
        : ""
    }

    <div class="rev-barra">
      ${filtroTopicosBotaoHTML(st, filtroRev.sel, filtroRev.aberto)}
      <span class="filtro-lbl muted small">Tipo:</span>
      <div class="seg seg-sm" role="tablist" data-tip-pos="cima-esq" data-tip="Filtra por formato: pergunta/resposta ou afirmações Certo/Errado.">
        <button class="${filtroTipo === "todos" ? "on" : ""}" data-filtro-tipo="todos">Todos</button>
        <button class="${filtroTipo === "qa" ? "on" : ""}" data-filtro-tipo="qa">P/R</button>
        <button class="${filtroTipo === "afirmacao" ? "on" : ""}" data-filtro-tipo="afirmacao">C/E</button>
      </div>
      <span class="muted small">${vencidos.length} para revisar hoje</span>
      <span class="filtro-lbl muted small">Ordem:</span>
      <div class="seg seg-sm" role="tablist" data-tip-pos="cima-esq" data-tip="“Mais recentes” traz ao topo os flashcards recém-gerados, sem zerar os pendentes antigos.">
        <button class="${ordemRev === "vencimento" ? "on" : ""}" data-ordem-rev="vencimento">Vencimento</button>
        <button class="${ordemRev === "recentes" ? "on" : ""}" data-ordem-rev="recentes">Mais recentes</button>
      </div>
      <span class="spacer"></span>
      ${suspensos ? `<button class="lnk" data-action="reativar-susp" data-tip="Voltam a aparecer nas revisões.">${icone("ban")} ${plural(suspensos, "dispensado", "dispensados")}: reativar</button>` : ""}
    </div>
    ${filtroTopicosPainelHTML(st, filtroRev.sel, filtroRev.aberto)}

    <div class="revisao-area">
      ${
        atual
          ? cardRevisaoHTML(st, atual)
          : st.flashcards.length
            ? `<div class="card revisao-vazia">
                <div class="rev-emoji">${icone("check")}</div>
                <h3>Tudo revisado por hoje!</h3>
                <p class="muted">Volte amanhã ou adiante a revisão criando novos cards.</p>
              </div>`
            : `<div class="card revisao-vazia">
                <div class="rev-emoji">${icone("layers")}</div>
                <h3>Nenhum flashcard ainda</h3>
                <p class="muted">Crie cartões para revisar com recordação ativa e repetição espaçada.</p>
                <button class="btn btn-add" data-action="toggle-criar" style="margin-top:12px">Criar flashcards</button>
              </div>`
      }
    </div>

    ${mostrarLista ? listaHTML(st) : ""}`;

  ligarFiltroTopicos(root, app, filtroRev);
  focarItem(root, focoFc);
  root.querySelectorAll("[data-filtro-tipo]").forEach((b) =>
    b.addEventListener("click", () => {
      filtroTipo = b.getAttribute("data-filtro-tipo");
      revelado = false;
      app.refresh();
    })
  );
  root.querySelectorAll("[data-ordem-rev]").forEach((b) =>
    b.addEventListener("click", () => {
      ordemRev = b.getAttribute("data-ordem-rev");
      revisarId = null;
      revelado = false;
      app.refresh();
    })
  );
  // ao abrir o editor, rola até ele. Duplo rAF: roda DEPOIS que o main.js
  // restaura a rolagem preservada (senão a restauração sobrescreve o scroll).
  if (editandoId) {
    const alvo = root.querySelector(".form-flashcard");
    if (alvo) requestAnimationFrame(() => requestAnimationFrame(() => alvo.scrollIntoView({ behavior: "smooth", block: "center" })));
  }

  bindActions(root, {
    imprimir: async () => {
      // Respeita os filtros da tela (tópico + tipo); oferece "frente e verso" ou "só a frente".
      const cards = st.flashcards.filter((c) => questaoNoFiltro(c, filtroRev.sel) && tipoNoFiltro(c, filtroTipo));
      if (!cards.length) return toast("Nenhum flashcard no filtro atual para imprimir.", "erro");
      const op = await opcoesImpressao("Imprimir flashcards", [
        { key: "lados", label: "O que mostrar", opcoes: [{ v: "ambos", rot: "Frente e verso" }, { v: "frente", rot: "Só a frente (para auto-teste)" }], def: "ambos" },
      ]);
      if (!op) return;
      imprimir("Flashcards — Mentor Concurso", printFlashcards(st, cards, op.lados));
    },
    "toggle-criar": () => abrirCriarFlashcards(app),
    "toggle-lista": () => {
      mostrarLista = !mostrarLista;
      app.refresh();
    },
    editar: (el) => {
      const c = store.get().flashcards.find((f) => f.id === el.getAttribute("data-id"));
      if (!c) return;
      abrirJanela({
        titulo: "Editar flashcard",
        corpoHTML: editFormHTML(st, c),
        aoMontar: (jan, fechar) => {
          jan.querySelector('[data-action="cancelar-edicao"]').addEventListener("click", fechar);
          jan.querySelector('[data-action="salvar-edicao"]').addEventListener("click", () => {
            const frente = jan.querySelector("#ed-fc-frente").value.trim();
            const verso = jan.querySelector("#ed-fc-verso").value.trim();
            const topicoId = jan.querySelector("#ed-fc-top").value;
            if (!frente || !verso) return toast("Preencha frente e verso.", "erro");
            store.editarFlashcard(c.id, { frente, verso, topicoId: topicoId || null });
            toast("Flashcard atualizado.");
            fechar();
            app.refresh();
          });
        },
      });
    },
    "salvar-edicao": () => {
      const frente = root.querySelector("#ed-fc-frente").value.trim();
      const verso = root.querySelector("#ed-fc-verso").value.trim();
      const topicoId = root.querySelector("#ed-fc-top").value;
      if (!frente || !verso) return toast("Preencha frente e verso.", "erro");
      store.editarFlashcard(editandoId, { frente, verso, topicoId: topicoId || null });
      editandoId = null;
      toast("Flashcard atualizado.");
    },
    "cancelar-edicao": () => {
      editandoId = null;
      app.refresh();
    },
    "gerar-escopo": () => abrirSeletorEscopo(app, { tipo: "flashcards", titulo: "Gerar flashcards" }),
    "gerar-questoes": () => {
      const filtro = root.querySelector("#fc-add-top-q").value;
      const cards = store.gerarFlashcardsDeQuestoes(filtro);
      toast(cards.length ? `${plural(cards.length, "flashcard", "flashcards")} com gabarito comentado.` : "Nenhuma questão para gerar.", cards.length ? "ok" : "erro");
    },
    "gerar-afirmacoes": () => {
      const filtro = root.querySelector("#fc-add-top-q").value;
      const cards = store.gerarAfirmacoesDeQuestoes(filtro);
      toast(cards.length ? `${plural(cards.length, "afirmação Certo/Errado gerada", "afirmações Certo/Errado geradas")} (revise).` : "Nenhuma questão para gerar.", cards.length ? "ok" : "erro");
    },
    "comentar-fc": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Comentar este flashcard com IA");
      el.disabled = true;
      toast("Explicando este card com IA…");
      try {
        await store.comentarFlashcardIA(el.getAttribute("data-id"));
        toast("Comentário da IA gerado.");
      } catch (e) {
        toast("Não consegui comentar este card agora. Tente de novo em instantes.", "erro");
        el.disabled = false;
      }
    },
    "toggle-fc-erro": (el) => {
      const id = el.getAttribute("data-id");
      cadernoErroId = cadernoErroId === id ? null : id;
      app.refresh();
    },
    "cancelar-fc-erro": () => {
      cadernoErroId = null;
      app.refresh();
    },
    "salvar-fc-erro": (el) => {
      const c = store.get().flashcards.find((f) => f.id === el.getAttribute("data-id"));
      if (!c) return;
      const motivo = root.querySelector("#fc-cad-motivo").value || null;
      const obs = root.querySelector("#fc-cad-obs").value.trim();
      store.addErroManual({
        descricao: `[Flashcard] ${c.frente}`,
        correto: c.verso,
        suaResposta: "",
        comentario: [textoComentario(c.comentarioIA), obs].filter(Boolean).join(". ") || "",
        motivoErro: motivo,
        topicoId: c.topicoId || null,
        disciplinaId: c.disciplinaId || null,
      });
      cadernoErroId = null;
      toast("Salvo no Caderno de Erros.");
    },
    revelar: () => {
      revelado = true;
      app.refresh();
    },
    nota: (el) => {
      const q = parseInt(el.getAttribute("data-q"), 10);
      const id = el.getAttribute("data-id");
      const tinhaFila = store.flashcardsVencidos().length;
      store.revisarFlashcard(id, q);
      revelado = false;
      revisarId = null;
      // Marco: zerou a fila de revisão do dia → comemora.
      if (tinhaFila && store.flashcardsVencidos().length === 0) {
        confetti();
        toast("Fila de revisão concluída! Mandou bem.", "ok");
      } else {
        toast("Revisado. Próximo card.");
      }
    },
    pular: (el) => {
      puladosSessao.add(el.getAttribute("data-id"));
      revelado = false;
      revisarId = null;
      app.refresh();
    },
    adiar: (el) => {
      store.adiarFlashcard(el.getAttribute("data-id"), 1);
      revelado = false;
      revisarId = null;
      toast("Card adiado para amanhã.");
    },
    dispensar: (el) => {
      store.suspenderFlashcard(el.getAttribute("data-id"));
      revelado = false;
      revisarId = null;
      toast("Card dispensado. Reative quando quiser.");
    },
    // Estudar UM card específico da lista "Ver todos": joga no topo (área de revisão) e rola até lá.
    "revisar-este": (el) => {
      revisarId = el.getAttribute("data-id");
      revelado = false;
      app.refresh();
      setTimeout(() => { const ct = document.getElementById("content"); if (ct) ct.scrollTop = 0; }, 70);
    },
    "reativar-susp": () => {
      store.get().flashcards.forEach((f) => {
        if (f.suspenso) store.suspenderFlashcard(f.id);
      });
      toast("Cards dispensados reativados.");
    },
    "del-card": async (el) => {
      if (await confirmar("Excluir este flashcard? Não dá para desfazer.")) {
        revelado = false;
        store.removerFlashcard(el.getAttribute("data-id"));
        toast("Flashcard excluído.");
      }
    },
    "toggle-export": () => {
      mostrarExport = !mostrarExport;
      app.refresh();
    },
    "baixar-anki": () => {
      const escopo = root.querySelector("#export-escopo").value;
      const soVenc = root.querySelector("#export-venc").checked;
      const cards = soVenc ? store.flashcardsVencidos(escopo) : filtrarPorEscopo(st, escopo);
      exportarAnki(st, cards);
    },
  });
}

// Painel ÚNICO de criação: digitar/colar/importar (frente · verso), gerar do
// material (IA) ou gerar das questões (offline).
function criarPanelHTML(st, opcoesTopico, opcoesDocs, texto = "") {
  return `
    <div class="card form-flashcard">
      <h3>Criar flashcards</h3>
      <p class="muted small" style="margin:0 0 8px">Um card por linha: a <b>frente (pergunta)</b> e o <b>verso (resposta)</b>, separados por <b>Tab</b>, <b>;</b>, <b>|</b> ou vírgula. Compatível com o Anki.</p>
      <label class="inline">Vincular ao tópico: <select id="fc-add-top"><option value="">— sem tópico —</option>${opcoesTopico}</select></label>
      <label class="btn btn-ghost btn-file" style="margin:8px 0" data-tip-pos="cima-esq" data-tip="Importar de um arquivo .txt/.csv (formato Anki). Você também pode arrastar o arquivo aqui.">${icone("paperclip")} Importar de arquivo
        <input id="fc-add-file" type="file" accept=".txt,.csv,.tsv,text/plain" hidden />
      </label>
      <textarea id="fc-add-texto" rows="4" placeholder="${esc('Ex.:\nCapital do Brasil ; Brasília\nPrazo da apelação | 15 dias úteis (art. 1.003, CPC)')}">${esc(texto)}</textarea>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="cancelar-criar">Cancelar</button>
        <button class="btn btn-primary" data-action="adicionar-fc">Revisar</button>
      </div>
      ${
        st.documentos.length || st.questoes.length || st.resumos.length
          ? `<div class="add-sep">Ou gerar automaticamente:</div>
             <div class="form-row" style="align-items:flex-end; gap:12px; flex-wrap:wrap">
               ${
                 st.documentos.length || st.resumos.length
                   ? `<button class="btn btn-ia btn-sm" data-action="gerar-escopo" data-tip="Escolha o tópico, a aula e (se houver índice) o subtópico; a IA gera a partir do material/resumo vinculado.">${icone("sparkles")} Gerar com IA</button>`
                   : ""
               }
               ${
                 st.questoes.length
                   ? `<label class="inline">Das questões: <select id="fc-add-top-q"><option value="todos">Todas</option>${opcoesTopico}</select></label>
                      <button class="btn btn-ghost btn-sm" data-action="gerar-questoes" data-tip="Cria 1 card por questão. Frente = enunciado; verso = a alternativa correta destacada. Não explica o porquê.">Gerar</button>
                      <button class="btn btn-ghost btn-sm" data-action="gerar-afirmacoes" data-tip="Transforma cada questão em afirmações para julgar Certo ou Errado (a correta vira CERTO; um distrator vira ERRADO).">C/E</button>`
                   : ""
               }
             </div>`
          : ""
      }
    </div>`;
}

function editFormHTML(st, c) {
  if (!c) return "";
  const ops = st.topicos
    .map((t) => `<option value="${t.id}" ${t.id === c.topicoId ? "selected" : ""}>${esc(nomeTopico(st, t))}</option>`)
    .join("");
  return `<div class="card form-flashcard">
    <h3>${icone("square-pen")} Editar flashcard ${seloBadge(c.selo, c.fonte)}</h3>
    <label>Tópico <select id="ed-fc-top"><option value="">— sem tópico —</option>${ops}</select></label>
    <label>Frente (pergunta) <textarea id="ed-fc-frente" rows="2">${esc(c.frente)}</textarea></label>
    <label>Verso (resposta) <textarea id="ed-fc-verso" rows="3">${esc(c.verso)}</textarea></label>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="cancelar-edicao">Cancelar</button>
      <button class="btn btn-primary" data-action="salvar-edicao">Salvar alterações</button>
    </div>
  </div>`;
}

// Importa flashcards de texto: uma linha por card, separando frente/verso por
// tabulação, ponto e vírgula, barra vertical ou a primeira vírgula (compatível com Anki).
// Parser (offline): cada linha vira {frente, verso}. Separadores Tab, ;, | ou a 1ª vírgula.
function parseFlashcards(texto) {
  return String(texto || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      let partes;
      if (l.includes("\t")) partes = l.split("\t");
      else if (l.includes(";")) partes = l.split(";");
      else if (l.includes("|")) partes = l.split("|");
      else partes = l.split(/,(.+)/);
      return { frente: (partes[0] || "").trim(), verso: (partes.slice(1).join(" ") || "").trim() };
    })
    .filter((c) => c.frente);
}

// Preview EDITÁVEL dos flashcards com VERSO OCULTO (não estraga o recall ativo): a frente fica
// visível; o verso (resposta) só aparece ao clicar "ver verso". Editar, remover, voltar, criar.
function fcPreviewHTML(itens) {
  return `<div class="card form-flashcard">
    <h3>${icone("download")} Revisar ${plural(itens.length, "flashcard", "flashcards")} antes de adicionar</h3>
    <p class="muted small" style="margin:0 0 10px">A <b>frente</b> fica visível; o <b>verso</b> (resposta) fica oculto para não estragar a prática — clique "ver verso" só se quiser conferir. Edite e remova (✕) à vontade.</p>
    <ul class="prev-editavel">
      ${itens
        .map((c, i) => {
          const semVerso = !(c.verso || "").trim();
          return `<li class="prev-card m-geral">
            <div class="prev-card-l1">
              <input class="prev-inp fc-frente-edit" data-i="${i}" value="${esc(c.frente || "")}" placeholder="Frente (pergunta)" />
              <button class="prev-remover" data-action="remover-fc-prev" data-i="${i}" data-tip-pos="cima-dir" data-tip="Remover este card">${icone("x")}</button>
            </div>
            <details class="prev-spoiler">
              <summary>${icone("eye")} ver/editar verso${semVerso ? ' <b style="color:var(--danger,#dc2626)">(vazio!)</b>' : ""}</summary>
              <input class="prev-inp fc-verso-edit" data-i="${i}" value="${esc(c.verso || "")}" placeholder="Verso (resposta)" />
            </details>
          </li>`;
        })
        .join("")}
    </ul>
    <div class="form-acoes">
      <button class="btn btn-ghost" data-action="voltar-fc" data-tip-pos="cima-esq" data-tip="Volta ao texto colado para corrigir e revisar de novo.">← Voltar para editar</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-action="descartar-fc">Descartar</button>
      <button class="btn btn-primary" data-action="aceitar-fc" ${itens.length ? "" : "disabled"}>Adicionar (${itens.length})</button>
    </div>
  </div>`;
}

// Janela modal "Criar flashcards" — fluxo stateful (editar → preview → adicionar)
// com render-loop próprio (abrirJanelaFluxo). Substitui o painel inline antigo.
function abrirCriarFlashcards(app) {
  const { store } = app;
  const estado = { preview: null, texto: "", topico: "" };
  const opcoesTopicoDe = (st) => st.topicos.map((t) => `<option value="${t.id}">${esc(nomeTopico(st, t))}</option>`).join("");
  const opcoesDocsDe = (st) =>
    st.documentos
      .map((d) => {
        const t = d.topicoId ? st.topicos.find((x) => x.id === d.topicoId) : null;
        const disc = t ? st.disciplinas.find((x) => x.id === t.disciplinaId) : null;
        return `<option value="${d.id}">${esc((disc ? disc.nome + " · " : "") + d.titulo)}</option>`;
      })
      .join("");

  abrirJanelaFluxo({
    titulo: "Criar flashcards",
    render: (corpo, { rerender }) => {
      const st = store.get();
      if (estado.preview) {
        corpo.innerHTML = fcPreviewHTML(estado.preview);
        corpo.querySelectorAll(".fc-frente-edit").forEach((el) =>
          el.addEventListener("input", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) estado.preview[i].frente = el.value; })
        );
        corpo.querySelectorAll(".fc-verso-edit").forEach((el) =>
          el.addEventListener("input", () => { const i = +el.getAttribute("data-i"); if (estado.preview[i]) estado.preview[i].verso = el.value; })
        );
        return;
      }
      corpo.innerHTML = criarPanelHTML(st, opcoesTopicoDe(st), opcoesDocsDe(st), estado.texto);
      const topEl = corpo.querySelector("#fc-add-top");
      if (topEl && estado.topico) topEl.value = estado.topico;
      const addFile = corpo.querySelector("#fc-add-file");
      if (addFile) {
        ligarDropZone(addFile);
        addFile.addEventListener("change", async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          try {
            const texto = await f.text();
            corpo.querySelector("#fc-add-texto").value = texto;
            toast(texto.trim() ? "Texto carregado. Revise e adicione." : "Arquivo vazio.", texto.trim() ? "ok" : "erro");
          } catch (err) {
            toast("Falha ao ler: " + err.message, "erro");
          }
        });
      }
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "cancelar-criar": () => fechar(),
      "adicionar-fc": () => {
        const texto = corpo.querySelector("#fc-add-texto").value;
        const top = corpo.querySelector("#fc-add-top")?.value || "";
        if (!texto.trim()) return toast("Digite ou cole ao menos um card.", "erro");
        const itens = parseFlashcards(texto);
        if (!itens.length) return toast("Nada reconhecido. Use 'frente ; verso' por linha.", "erro");
        estado.texto = texto;
        estado.topico = top;
        estado.preview = itens;
        rerender();
      },
      "remover-fc-prev": (el) => {
        const i = parseInt(el.getAttribute("data-i"), 10);
        if (estado.preview) estado.preview.splice(i, 1);
        if (estado.preview && !estado.preview.length) estado.preview = null;
        rerender();
      },
      "voltar-fc": () => { estado.preview = null; rerender(); },
      "descartar-fc": () => fechar(),
      "aceitar-fc": () => {
        const itens = (estado.preview || []).filter((c) => (c.frente || "").trim() && (c.verso || "").trim());
        if (!itens.length) return toast("Cada card precisa de frente e verso.", "erro");
        itens.forEach((c) => store.addFlashcard({ frente: c.frente, verso: c.verso, topicoId: estado.topico || null, selo: "manual" }));
        toast(`${plural(itens.length, "flashcard adicionado", "flashcards adicionados")}.`);
        fechar();
        app.refresh();
      },
      "gerar-escopo": () => abrirSeletorEscopo(app, { tipo: "flashcards", titulo: "Gerar flashcards" }),
      "gerar-questoes": () => {
        const filtro = corpo.querySelector("#fc-add-top-q").value;
        const cards = store.gerarFlashcardsDeQuestoes(filtro);
        toast(cards.length ? `${plural(cards.length, "flashcard", "flashcards")} com gabarito comentado.` : "Nenhuma questão para gerar.", cards.length ? "ok" : "erro");
        if (cards.length) { fechar(); app.refresh(); }
      },
      "gerar-afirmacoes": () => {
        const filtro = corpo.querySelector("#fc-add-top-q").value;
        const cards = store.gerarAfirmacoesDeQuestoes(filtro);
        toast(cards.length ? `${plural(cards.length, "afirmação Certo/Errado gerada", "afirmações Certo/Errado geradas")} (revise).` : "Nenhuma questão para gerar.", cards.length ? "ok" : "erro");
        if (cards.length) { fechar(); app.refresh(); }
      },
    }),
  });
}

// Filtro por tipo de card: qa (pergunta/resposta) | afirmacao (Certo/Errado).
function tipoNoFiltro(c, tipo) {
  if (tipo === "todos") return true;
  if (tipo === "afirmacao") return c.tipo === "afirmacao";
  return c.tipo !== "afirmacao";
}

function vinculoFlashcard(st, c) {
  const t = c.topicoId ? st.topicos.find((x) => x.id === c.topicoId) : null;
  if (t) return nomeTopico(st, t);
  if (c.disciplinaId) {
    const d = st.disciplinas.find((x) => x.id === c.disciplinaId);
    if (d) return d.nome;
  }
  return null;
}

function cardRevisaoHTML(st, c) {
  const vinc = vinculoFlashcard(st, c);
  return `
    <div class="card flashcard">
      <div class="fc-meta">
        ${vinc ? `<span class="tag-topico">${esc(vinc)}</span>` : ""}
        ${seloBadge(c.selo, c.fonte)}
        <span class="spacer"></span>
        <button class="lnk fc-editar" data-action="editar" data-id="${c.id}" data-tip-pos="cima-dir" data-tip="Editar este flashcard.">${icone("square-pen")}</button>
        <button class="lnk lnk-danger" data-action="del-card" data-id="${c.id}" data-tip-pos="cima-dir" data-tip="Excluir este flashcard de vez.">${icone("x")}</button>
      </div>
      ${c.tipo === "afirmacao" ? '<div class="fc-tipo-tag">Afirmação · Certo ou Errado?</div>' : ""}
      <div class="fc-frente">${esc(c.frente)}</div>
      ${
        revelado
          ? `${c.tipo === "afirmacao" ? `<div class="fc-gabarito ${c.gabaritoCerto ? "certo" : "errado"}">${c.gabaritoCerto ? `${icone("check")} CERTO` : `${icone("x")} ERRADO`}</div>` : ""}
             <div class="fc-verso">${esc(c.verso)}</div>
             ${explicacaoIAHTML(c.comentarioIA)}
             <div class="fc-notas">
               ${NOTAS.map((n) => {
                 const dias = sm2.revisar(c.sm2, n.q).intervaloDias;
                 const quando = dias <= 1 ? "volta em 24h" : `volta em ${dias} dias`;
                 return `<button class="btn btn-nota ${n.cls}" data-action="nota" data-q="${n.q}" data-id="${c.id}" data-tip="${esc(n.label)}: ${quando}.">${n.label}</button>`;
               }).join("")}
             </div>
             <div class="fc-extra">
               <button class="fc-acao" data-action="comentar-fc" data-id="${c.id}" data-tip="A IA explica este card para tirar a sua dúvida.">${icone("sparkles")} Comentar com IA</button>
               <button class="fc-acao ${cadernoErroId === c.id ? "on" : ""}" data-action="toggle-fc-erro" data-id="${c.id}" data-tip="Registra este card no Caderno de Erros para revisar lá também. As notas (Errei/Bom…) acima são da revisão; isto é à parte.">${icone("flag")} Caderno de Erros</button>
             </div>
             ${
               cadernoErroId === c.id
                 ? `<div class="fc-caderno-box">
                     <p class="muted small" style="margin:0 0 8px">Classifique o motivo (a disciplina e o tópico já vêm deste card):</p>
                     <div class="fc-cad-row">
                       <label class="inline">Motivo: <select id="fc-cad-motivo"><option value="">— não definido —</option>${MOTIVOS_ERRO.map((m) => `<option>${m}</option>`).join("")}</select></label>
                       <input id="fc-cad-obs" type="text" placeholder="Observação (opcional)" />
                     </div>
                     <div class="form-acoes">
                       <button class="btn btn-ghost btn-sm" data-action="cancelar-fc-erro">Cancelar</button>
                       <button class="btn btn-primary btn-sm" data-action="salvar-fc-erro" data-id="${c.id}">Salvar no Caderno</button>
                     </div>
                   </div>`
                 : ""
             }`
          : `<button class="btn btn-primary btn-lg" data-action="revelar">Mostrar resposta</button>`
      }
      <div class="fc-sessao">
        <button class="fc-acao" data-action="pular" data-id="${c.id}" data-tip="Vê outro agora; este volta nesta sessão.">${icone("skip-forward")} Pular</button>
        <button class="fc-acao" data-action="adiar" data-id="${c.id}" data-tip="Reagenda este card para amanhã.">${icone("alarm-clock")} Adiar 1 dia</button>
        <button class="fc-acao fc-acao-danger" data-action="dispensar" data-id="${c.id}" data-tip="Suspende o card das revisões (reative depois).">${icone("ban")} Dispensar</button>
      </div>
    </div>`;
}

function listaHTML(st) {
  if (!st.flashcards.length)
    return `<div class="card">${vazio(
      "Você ainda não tem flashcards\nCrie cartões para revisar com recordação ativa e repetição espaçada.",
      `<button class="btn btn-add btn-sm" data-action="toggle-criar">Criar flashcards</button>`,
      icone("layers")
    )}</div>`;
  // Aplica os MESMOS filtros (tópico + tipo) e ORDEM da fila de revisão, para a lista "Ver
  // todos" ficar sincronizada com a barra acima. Sem isto, a lista ignorava filtro/ordem e
  // os cards recém-gerados não subiam para o topo.
  const cards = [...st.flashcards]
    .filter((c) => questaoNoFiltro(c, filtroRev.sel) && tipoNoFiltro(c, filtroTipo))
    .sort((a, b) =>
      ordemRev === "vencimento"
        ? (a.sm2.dueDate || "").localeCompare(b.sm2.dueDate || "")
        : (b.criadoEm || "").localeCompare(a.criadoEm || "")
    );
  const contagem = cards.length === st.flashcards.length ? `${cards.length}` : `${cards.length} de ${st.flashcards.length}`;
  const hojeISO = todayISO();
  return `
    <div class="lista-flashcards">
      <h3 class="lista-fc-tit">Todos os flashcards (${contagem})</h3>
      ${
        cards.length
          ? `<div class="fc-grid stagger">
          ${cards.map((c) => fcTileHTML(st, c, hojeISO)).join("")}
        </div>`
          : `<p class="muted small" style="margin:8px 0 0">Nenhum flashcard corresponde ao filtro de tópico/tipo atual. Ajuste a barra acima.</p>`
      }
    </div>`;
}

// Prazo relativo da próxima revisão (semáforo suave): atrasado / hoje / em N dias.
function vencimentoFc(dueDate, hojeISO) {
  if (!dueDate) return { txt: "sem data", cls: "" };
  if (dueDate < hojeISO) return { txt: "atrasado", cls: "venc-atraso" };
  if (dueDate === hojeISO) return { txt: "vence hoje", cls: "venc-hoje" };
  const d1 = new Date(dueDate + "T00:00:00"), d0 = new Date(hojeISO + "T00:00:00");
  const dias = Math.round((d1 - d0) / 86400000);
  return { txt: dias <= 30 ? `vence em ${dias}d` : `vence ${fmtData(dueDate)}`, cls: "venc-ok" };
}

// Card premium de flashcard (substitui a linha de tabela). O card inteiro = "estudar";
// os botões do rodapé (editar/remover) resolvem antes via closest de bindActions.
function fcTileHTML(st, c, hojeISO) {
  const vinc = vinculoFlashcard(st, c);
  const v = vencimentoFc(c.sm2.dueDate, hojeISO);
  return `<div class="card card-click fc-tile" data-foco-id="${c.id}" data-action="revisar-este" data-id="${c.id}" data-tip-pos="cima" data-tip="Estudar este card agora (abre na área de revisão, no topo).">
    <div class="fc-tile-frente">${esc(c.frente.slice(0, 120))}</div>
    <div class="fc-tile-chips">
      ${vinc ? `<span class="chip chip-sm">${esc(vinc)}</span>` : ""}
      <span class="chip chip-sm ${v.cls}">${v.txt}</span>
      ${seloBadge(c.selo, c.fonte, { compacto: true })}
    </div>
    <div class="fc-tile-acoes">
      <button class="lnk fc-editar" data-action="editar" data-id="${c.id}" data-tip-pos="cima-dir" data-tip="Editar este flashcard.">${icone("square-pen")} editar</button>
      <button class="lnk lnk-danger" data-action="del-card" data-id="${c.id}" data-tip-pos="cima-dir" data-tip="Remover este flashcard.">${icone("x")} remover</button>
    </div>
  </div>`;
}

// Exporta um .txt que o Anki importa SEM configuração manual: cabeçalhos com
// #separator, #html (para os <br>), #deck e #tags. Quebras de linha no verso
// (ex.: gabarito comentado) viram <br>. Cada card leva tag "Disciplina::Tópico".
function exportarAnki(st, cards) {
  cards = cards || st.flashcards;
  if (!cards.length) return toast("Nenhum flashcard neste filtro para exportar.", "erro");

  const campo = (txt) =>
    String(txt || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\t/g, " ")
      .replace(/\r?\n/g, "<br>");

  const limpaTag = (s) => String(s || "").trim().replace(/\s+/g, "_").replace(/[^0-9A-Za-zÀ-ÿ_:-]/g, "");
  const tagDe = (c) => {
    const t = c.topicoId ? st.topicos.find((x) => x.id === c.topicoId) : null;
    const d = t
      ? st.disciplinas.find((x) => x.id === t.disciplinaId)
      : c.disciplinaId
      ? st.disciplinas.find((x) => x.id === c.disciplinaId)
      : null;
    const partes = [];
    if (d) partes.push(limpaTag(d.nome));
    if (t) partes.push(limpaTag(t.nome));
    return partes.length ? partes.join("::") : "MentorConcurso";
  };

  const cabecalho = ["#separator:tab", "#html:true", "#deck:Mentor Concurso", "#tags column:3"];
  const linhas = cards.map((c) => `${campo(c.frente)}\t${campo(c.verso)}\t${tagDe(c)}`);
  const conteudo = cabecalho.join("\n") + "\n" + linhas.join("\n") + "\n";

  const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mentor_concurso_anki.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(`${plural(cards.length, "card exportado", "cards exportados")}. No Anki: Arquivo → Importar → selecione o .txt.`);
}

function printFlashcards(st, cards, lados = "ambos") {
  cards = cards || st.flashcards;
  if (!cards.length) return "<p>Nenhum flashcard.</p>";
  return cards
    .map((c) => {
      const topico = st.topicos.find((t) => t.id === c.topicoId);
      return `<div class="print-item">
        <div><b>P:</b> ${esc(c.frente)}</div>
        ${lados === "frente" ? "" : `<div class="print-verso"><b>R:</b> ${esc(c.verso)}</div>`}
        <div class="print-meta">${topico ? esc(nomeTopico(st, topico)) : "sem tópico"}${c.fonte ? " · " + esc(c.fonte.titulo) : ""}</div>
      </div>`;
    })
    .join("");
}

function nomeTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
