// Flashcards / Revisão: recall ativo + repetição espaçada (SM-2) + exportação Anki.
// Criar cards num painel único (digitar/colar/importar, gerar do material com IA,
// ou gerar das questões offline). Revisão filtrável por disciplina/tópicos.
import { bindActions, toast, header, seloBadge, vazio, imprimir, botaoImprimir, opcoesImpressao, avisoIA, confirmar, ligarDropZone, focarItem, pedirNumero, explicacaoIAHTML, abrirJanela, abrirJanelaFluxo, confetti , plural, comOcupado } from "../ui.js";
import { esc, fmtData, todayISO, MOTIVOS_ERRO, textoComentario } from "../util.js";
import { icone } from "../icones.js";
import * as sm2 from "../sm2.js";
import { filtroTopicosBotaoHTML, filtroTopicosPainelHTML, ligarFiltroTopicos, questaoNoFiltro } from "./questoes-filtro.js";
import { abrirSeletorEscopo } from "./seletor-escopo.js";
import { focoShellHTML, bindFocoCrono, focoChromeKey, ligarTickCrono } from "./foco-quiz.js";
import { abrirRegistroSessao } from "../registro-sessao.js";
import * as crono from "../cronometro.js";

let revelado = false;
let focoAtivo = false; // modo Foco: quiz imersivo em tela cheia (usa a fila filtrada atual)
let focoFila = [];     // ids da sessão de foco (snapshot da fila filtrada) — navegação livre
let focoIdx = 0;       // posição atual na sessão
let focoPlacar = {};   // id -> nota dada nesta sessão (para o placar ✓/✗/%)
let mostrarLista = false;
let editandoId = null;
const filtroRev = { sel: [], aberto: false }; // multi-tópico da revisão
let filtroTipo = "todos"; // todos | qa | afirmacao (C/E)
let perguntandoMotivoId = null; // após "Errei": pergunta o motivo (1 toque) antes de avançar
let puladosSessao = new Set(); // ids pulados nesta sessão (voltam depois)
let mostrarExport = false; // painel de exportação Anki (oculto até clicar)
let revisarId = null; // estuda UM card específico sob demanda (da lista "Ver todos"), mesmo não vencido
let ordemRev = "recentes"; // ordem da fila: "recentes" (recém-criados primeiro, padrão) | "vencimento"
let filtroLote = null; // #4: quando veio de uma geração, estuda SÓ os recém-gerados (geracaoId)
let filtroLoteRotulo = ""; // rótulo do lote (ex.: "do material «X»")

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
  // Escopo vindo do "Hoje" (Revisar → deste tópico): pré-filtra a revisão pelo tópico.
  if (app.params && app.params.topicoId) {
    filtroRev.sel = [app.params.topicoId];
    app.params.topicoId = null;
  }
  // #4: veio de uma geração → estuda SÓ os recém-gerados (some ao clicar "Ver todos" ou ao concluir).
  if (app.params && app.params.lote) {
    filtroLote = app.params.lote;
    filtroLoteRotulo = app.params.loteRotulo || "";
    app.params.lote = null; app.params.loteRotulo = null;
    mostrarLista = false; revisarId = null; puladosSessao = new Set();
    filtroRev.sel = []; filtroTipo = "todos"; // não confundir com filtros antigos
  }
  // Se o lote já não tem cards a estudar (todos revisados/removidos), desfaz o filtro e avisa.
  if (filtroLote && !st.flashcards.some((c) => c.geracaoId === filtroLote && !c.suspenso)) { filtroLote = null; filtroLoteRotulo = ""; toast("Você concluiu os flashcards recém-gerados! Mostrando os demais.", "ok"); }
  const vencidos = filtroLote
    ? st.flashcards.filter((c) => c.geracaoId === filtroLote && !c.suspenso && !puladosSessao.has(c.id) && tipoNoFiltro(c, filtroTipo))
    : store.flashcardsVencidos().filter((c) => !puladosSessao.has(c.id) && questaoNoFiltro(c, filtroRev.sel) && tipoNoFiltro(c, filtroTipo));
  // Ordem "recém-criados primeiro": resolve o caso de gerar novos cards e querer revisá-los
  // ANTES dos pendentes antigos (sem ter que zerar a fila). Senão, ordem padrão (vencimento).
  if (ordemRev === "recentes") vencidos.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
  // "Revisar este" (da lista) força UM card específico no topo, mesmo não vencido.
  const atual = (revisarId && st.flashcards.find((c) => c.id === revisarId && !c.suspenso)) || vencidos[0];
  // No modo foco: card da sessão pela posição (permite ← →); pula os removidos/suspensos.
  const cardFoco = focoAtivo ? st.flashcards.find((c) => c.id === focoFila[focoIdx] && !c.suspenso) : null;
  // Após "Errei": passo de 1 toque para classificar o motivo (fica pinado até escolher/pular).
  const cardMotivo = perguntandoMotivoId ? st.flashcards.find((c) => c.id === perguntandoMotivoId) : null;
  if (perguntandoMotivoId && !cardMotivo) perguntandoMotivoId = null;
  const suspensos = st.flashcards.filter((f) => f.suspenso).length;
  // Resumo do cabeçalho (global, sem o filtro): pendentes hoje · já revisados hoje · total geral.
  const hoje = todayISO();
  const pendentesHoje = store.flashcardsVencidos().length;
  const revisadosHoje = st.flashcards.filter((f) => f.sm2.lastReview === hoje).length;

  root.innerHTML = `
    ${header("Flashcards", `Recordação ativa e repetição espaçada · ${st.flashcards.length} ${st.flashcards.length === 1 ? "cartão" : "cartões"}`, botaoImprimir())}

    <div class="barra-acoes">
      <button class="btn btn-add btn-sm" data-action="toggle-criar" data-tip-pos="cima-esq" data-tip="Digite/cole, importe um arquivo, gere do material (IA) ou das suas questões.">Criar flashcards</button>
      ${atual ? `<button class="btn btn-primary btn-sm fc-foco-btn" data-action="entrar-foco" data-tip-pos="cima-esq" data-tip="Estudar em tela cheia, sem distrações — usa o filtro atual. Espaço vira, 1–4 nota, Esc sai.">${icone("expand")} Modo foco</button>` : ""}
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" data-action="toggle-lista" data-tip-pos="cima-dir" data-tip="Lista todos os seus flashcards em tabela.">${mostrarLista ? "Ocultar lista" : "Ver todos"}</button>
      <details class="doc-mais">
        <summary class="lnk" data-tip-pos="cima-dir" data-tip="Mais ações: exportar para o Anki.">${icone("ellipsis")}</summary>
        <div class="doc-mais-pop" role="menu">
          <button class="menu-item" data-action="toggle-export" ${st.flashcards.length ? "" : "disabled"}>${mostrarExport ? "Fechar exportação" : "Exportar p/ Anki"}</button>
          <button class="menu-item lnk-danger" data-action="limpar-fc" ${st.flashcards.length ? "" : "disabled"}>${icone("trash-2")} Limpar todos os flashcards</button>
        </div>
      </details>
    </div>

    ${editandoId ? editFormHTML(st) : ""}

    ${filtroLote ? `<div class="lote-banner">${icone("sparkles")}<span>Estudando só os <b>${vencidos.length}</b> flashcards recém-gerados ${esc(filtroLoteRotulo)}.</span><button class="lnk" data-action="lote-ver-todos" data-tip="Voltar para todos os seus flashcards (fila normal de revisão).">Ver todos</button></div>` : ""}

    ${
      mostrarExport
        ? `<div class="card export-panel">
            <h3>${icone("download")} Exportar para o Anki</h3>
            <p class="muted small">Escolha quais flashcards exportar. Gera um <b>.txt</b> que o Anki importa (Arquivo → Importar).</p>
            <div class="form-row u-items-end">
              <label class="u-grow">Baralho <select id="export-escopo">${opcoesBaralho(st, "todos")}</select></label>
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
      ${(filtroRev.sel.length || filtroTipo !== "todos") ? `<span class="muted small">${vencidos.length} nesta seleção</span>` : ""}
      <span class="filtro-lbl muted small">Ordem:</span>
      <div class="seg seg-sm" role="tablist" data-tip-pos="cima-esq" data-tip="“Mais recentes” traz ao topo os flashcards recém-gerados, sem zerar os pendentes antigos.">
        <button class="${ordemRev === "vencimento" ? "on" : ""}" data-ordem-rev="vencimento">Vencimento</button>
        <button class="${ordemRev === "recentes" ? "on" : ""}" data-ordem-rev="recentes">Mais recentes</button>
      </div>
      <span class="spacer"></span>
      ${suspensos ? `<button class="lnk" data-action="reativar-susp" data-tip="Voltam a aparecer nas revisões.">${icone("ban")} ${plural(suspensos, "dispensado", "dispensados")}: reativar</button>` : ""}
    </div>
    ${filtroTopicosPainelHTML(st, filtroRev.sel, filtroRev.aberto)}

    ${
      !focoAtivo && st.flashcards.length && revisadosHoje + pendentesHoje > 0
        ? `<div class="fc-progresso">
            <div class="fc-prog-bar"><span style="width:${Math.round((revisadosHoje / (revisadosHoje + pendentesHoje)) * 100)}%"></span></div>
            <span class="fc-prog-txt">${revisadosHoje} de ${revisadosHoje + pendentesHoje} hoje</span>
          </div>`
        : ""
    }

    ${
      focoAtivo
        ? ""
        : `<div class="revisao-area">
      ${
        cardMotivo
          ? motivoPanelHTML(st, cardMotivo)
          : atual
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
                <button class="btn btn-add u-mt-12" data-action="toggle-criar">Criar flashcards</button>
              </div>`
      }
    </div>`
    }

    ${mostrarLista && !focoAtivo ? listaHTML(st) : ""}
    ${focoAtivo ? focoQuizHTML(st, { card: cardFoco, cardMotivo, idx: focoIdx, total: focoFila.length, placar: focoPlacar }) : ""}`;

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
    "lote-ver-todos": () => { filtroLote = null; filtroLoteRotulo = ""; app.refresh(); },
    "fc-abrir-artigo": (el) => { // #13: abre o artigo de origem do flashcard (lei/juris)
      const ref = el.getAttribute("data-ref"), t = el.getAttribute("data-tipo");
      const ind = store.get().indicacoes.find((i) => i.tipo === t && (i.referencia || "") === ref);
      if (!ind) return toast("Artigo de origem não encontrado (pode ter sido editado ou removido).", "erro");
      app.navigate(t === "juris" ? "jurisprudencia" : "leiseca", { focoIndicacaoId: ind.id });
    },
    "limpar-fc": async () => {
      if (!st.flashcards.length) return;
      if (!(await confirmar(`Apagar TODOS os ${st.flashcards.length} flashcards? Esta ação não pode ser desfeita.`))) return;
      const n = store.limparFlashcards();
      filtroLote = null; filtroLoteRotulo = "";
      toast(`${plural(n, "flashcard apagado", "flashcards apagados")}.`);
      app.refresh();
    },
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
      const r = await comOcupado(() => store.comentarFlashcardIA(el.getAttribute("data-id")), { botao: el, msg: "Explicando este card com a IA…" });
      if (r === null) return;
      toast("Comentário da IA gerado.");
    },
    // Após "Errei": um toque classifica o motivo no registro (auto) do Caderno e avança.
    "motivo-fc": (el) => {
      store.classificarErroFlashcard(el.getAttribute("data-id"), el.getAttribute("data-motivo"));
      perguntandoMotivoId = null;
      if (focoAtivo) { focoIdx++; if (focoIdx >= focoFila.length) confetti(); app.refresh(); return; }
      if (store.flashcardsVencidos().length === 0) { confetti(); toast("Fila concluída! Registrei o erro no Caderno.", "ok"); }
      else toast("Motivo registrado. Próximo card.");
    },
    "pular-motivo": () => {
      perguntandoMotivoId = null;
      if (focoAtivo) { focoIdx++; if (focoIdx >= focoFila.length) confetti(); app.refresh(); return; }
      if (store.flashcardsVencidos().length === 0) { confetti(); toast("Fila concluída!", "ok"); }
      app.refresh();
    },
    revelar: () => {
      revelado = true;
      // No modo foco, o card faz FLIP 3D: anima trocando a classe sem re-render (o verso já
      // está no DOM). Fora do foco, re-renderiza normalmente.
      if (focoAtivo) {
        const card = root.querySelector(".fq-card");
        if (card) { card.classList.add("is-flipped"); return; }
      }
      app.refresh();
    },
    // Volta à pergunta (desvira o card) — no foco anima sem re-render.
    "voltar-pergunta": () => {
      revelado = false;
      if (focoAtivo) {
        const card = root.querySelector(".fq-card");
        if (card) { card.classList.remove("is-flipped"); return; }
      }
      app.refresh();
    },
    "entrar-foco": () => {
      // Snapshot da fila FILTRADA atual → vira a sessão navegável (livre ← →).
      const fila = store.flashcardsVencidos().filter((c) => questaoNoFiltro(c, filtroRev.sel) && tipoNoFiltro(c, filtroTipo));
      if (ordemRev === "recentes") fila.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
      focoFila = fila.map((c) => c.id);
      focoIdx = 0;
      focoPlacar = {};
      focoAtivo = true;
      revelado = false;
      perguntandoMotivoId = null;
      app.refresh();
    },
    "foco-anterior": () => { if (focoIdx > 0) { focoIdx--; revelado = false; atualizarFocoFlash(root, store); } },
    "foco-proximo": () => { if (focoIdx < focoFila.length) { focoIdx++; revelado = false; atualizarFocoFlash(root, store); } },
    "sair-foco": () => {
      focoAtivo = false;
      revelado = false;
      app.refresh();
    },
    "foco-registrar-tempo": () => {
      const temTempo = crono.snapshot().elapsed >= 60;
      focoAtivo = false;
      revelado = false;
      app.refresh();
      abrirRegistroSessao(store, app, { modo: temTempo ? "crono" : "manual", fasePadrao: "R" });
    },
    ...bindFocoCrono({}), // cronômetro do foco (toggle/prog/reg/livre) — módulo compartilhado
    nota: (el) => {
      const q = parseInt(el.getAttribute("data-q"), 10);
      const id = el.getAttribute("data-id");
      const tinhaFila = store.flashcardsVencidos().length;
      const aplicar = () => {
        if (focoAtivo) focoPlacar[id] = q; // placar da sessão (✓/✗/%)
        store.revisarFlashcard(id, q); // grava SM-2 + (se Errei) registra no Caderno; commit re-renderiza
        revelado = false;
        revisarId = null;
        // "Errei": o card já entrou no Caderno; pergunta o motivo (1 toque) antes de avançar.
        if (q === 0) { perguntandoMotivoId = id; app.refresh(); return; }
        // No foco, avança pela POSIÇÃO da sessão (permite voltar depois); zerou tudo → confete.
        if (focoAtivo) {
          focoIdx++;
          if (focoIdx >= focoFila.length) confetti();
          app.refresh();
          return;
        }
        if (tinhaFila && store.flashcardsVencidos().length === 0) { confetti(); toast("Fila de revisão concluída! Mandou bem.", "ok"); }
        else toast("Revisado. Próximo card.");
      };
      // No foco, anima a SAÍDA do card antes de trocar pelo próximo.
      const stage = focoAtivo ? root.querySelector(".fq-stage") : null;
      if (stage) { stage.classList.add("fq-out"); setTimeout(aplicar, 230); }
      else aplicar();
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

  // Atalhos de teclado na revisão (como Anki/MEI): Espaço/Enter revela; 1–4 dá a nota.
  // Ignora digitação em campos e quando há modal aberto. O listener é recriado a cada
  // render (o main.js chama o cleanup retornado antes de re-renderizar), então lê sempre
  // o estado atual de `revelado`.
  function onKey(e) {
    // No foco, o shell trata Esc/setas/campo do cronômetro; segue só se sobrar um atalho de card.
    if (focoAtivo) {
      const r = focoChromeKey(e, { root, bloquearNav: !!perguntandoMotivoId });
      if (r) return; // "stop" (consumiu) ou "input" (digitando/modal)
    } else {
      const a = e.target;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector(".mm-overlay, .modal-overlay")) return;
    }
    // Passo do motivo (após "Errei"): 1–4 classifica; Espaço/Enter pula.
    if (perguntandoMotivoId) {
      const chips = root.querySelectorAll('.fc-motivo-chips [data-action="motivo-fc"]');
      const mi = { "1": 0, "2": 1, "3": 2, "4": 3 }[e.key];
      if (mi !== undefined && chips[mi]) { e.preventDefault(); chips[mi].click(); }
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); root.querySelector('[data-action="pular-motivo"]')?.click(); }
      return;
    }
    // Escopo do card: no foco é o quiz (.fq-card/.fq-notas); fora, o inline.
    const notasSel = focoAtivo ? ".fq-notas" : ".fc-notas";
    const cardSel = focoAtivo ? ".fq-card" : ".flashcard";
    if (!root.querySelector(cardSel)) return;
    if (!revelado) {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); root.querySelector('[data-action="revelar"]')?.click(); }
      return;
    }
    const idx = { "1": 0, "2": 1, "3": 2, "4": 3 }[e.key];
    if (idx !== undefined) { e.preventDefault(); root.querySelectorAll(`${notasSel} [data-action="nota"]`)[idx]?.click(); }
    else if (e.key === "c" || e.key === "C") { e.preventDefault(); root.querySelector('[data-action="comentar-fc"]:not([disabled])')?.click(); } // C = comentar com IA
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); root.querySelector('[data-action="voltar-pergunta"]')?.click(); } // Espaço alterna: volta à pergunta
  }
  document.addEventListener("keydown", onKey);
  // Cronômetro no foco: mantém o tempo do chip vivo (por segundo) sem re-renderizar a tela.
  const offTick = focoAtivo ? ligarTickCrono(root) : null;
  return () => { document.removeEventListener("keydown", onKey); if (offTick) offTick(); };
}

// Painel ÚNICO de criação: digitar/colar/importar (frente · verso), gerar do
// material (IA) ou gerar das questões (offline).
function criarPanelHTML(st, opcoesTopico, opcoesDocs, texto = "") {
  return `
    <div class="card form-flashcard">
      <h3>Criar flashcards</h3>
      <p class="muted small u-m-0 u-mb-8">Um card por linha: a <b>frente (pergunta)</b> e o <b>verso (resposta)</b>, separados por <b>Tab</b>, <b>;</b>, <b>|</b> ou vírgula. Compatível com o Anki.</p>
      <label class="inline">Vincular ao tópico: <select id="fc-add-top"><option value="">— sem tópico —</option>${opcoesTopico}</select></label>
      <label class="btn btn-ghost btn-file u-m-0 u-mt-8 u-mb-8" data-tip-pos="cima-esq" data-tip="Importar de um arquivo .txt/.csv (formato Anki). Você também pode arrastar o arquivo aqui.">${icone("paperclip")} Importar de arquivo
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
                 st.documentos.length
                   ? `<label class="inline">Do material: <select id="fc-add-doc"><option value="">— escolher —</option>${opcoesDocs}</select></label>
                      <button class="btn btn-ia btn-sm" data-action="gerar-do-material" data-tip="A IA extrai flashcards diretamente deste material e abre mostrando só os recém-gerados.">${icone("sparkles")} Gerar deste material</button>`
                   : ""
               }
               ${
                 st.documentos.length || st.resumos.length
                   ? `<button class="btn btn-ghost btn-sm" data-action="gerar-escopo" data-tip="Escolha o tópico, a aula e (se houver índice) o subtópico; a IA gera a partir do material/resumo vinculado.">${icone("sparkles")} Por tópico/aula</button>`
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
    <p class="muted small u-m-0 u-mb-12">A <b>frente</b> fica visível; o <b>verso</b> (resposta) fica oculto para não estragar a prática — clique "ver verso" só se quiser conferir. Edite e remova (✕) à vontade.</p>
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
      "gerar-do-material": async (el) => {
        if (!store.iaDisponivel()) return avisoIA(app, "Gerar flashcards");
        const docId = corpo.querySelector("#fc-add-doc")?.value;
        if (!docId) return toast("Escolha o material de onde extrair.", "erro");
        const r = await pedirNumero("Quantos flashcards a IA deve gerar deste material?", { padrao: 6, min: 1, max: 30, nivel: true });
        if (!r) return;
        const doc = store.get().documentos.find((d) => d.id === docId);
        const rot = `do material «${(doc && doc.titulo) || "material"}»`;
        const lote = store.iniciarLoteGeracao(rot);
        const cards = await comOcupado(() => store.gerarFlashcardsDeDoc(docId, r.n, r.dificuldade), { botao: el, msg: "Gerando flashcards…" });
        store.encerrarLoteGeracao();
        if (cards == null) return;
        toast(cards.length ? `${plural(cards.length, "flashcard criado", "flashcards criados")}.` : "Nada gerado — confira se o material tem texto.", cards.length ? "ok" : "erro");
        if (cards.length) { fechar(); app.navigate("flashcards", { lote, loteRotulo: rot }); }
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

// ===================== MODO FOCO — quiz imersivo em tela cheia =====================
// Overlay full-viewport (fundo aurora + card em vidro com flip 3D). Reusa os mesmos
// handlers (revelar/nota/motivo-fc…) e a fila FILTRADA atual. Teclado: Espaço vira, 1–4 nota.
function focoQuizHTML(st, { card, cardMotivo, idx, total, placar }) {
  const notas = Object.values(placar || {});
  const erros = notas.filter((q) => q === 0).length;      // "Errei"
  const acertos = notas.filter((q) => q >= 3).length;      // Difícil/Bom/Fácil
  const feitos = acertos + erros;
  const fim = idx >= total; // passou de todos → conclusão
  const centro = cardMotivo ? quizMotivoHTML(st, cardMotivo) : card ? quizCardHTML(st, card) : quizConclusaoHTML(feitos, acertos);
  const rodape = cardMotivo
    ? `<kbd>Esc</kbd> sair · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> motivo · <kbd>Espaço</kbd> pular`
    : `<kbd>Esc</kbd> sair · <kbd>←</kbd><kbd>→</kbd> navegar · <kbd>Espaço</kbd> virar · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> nota · <kbd>C</kbd> comentar`;
  return focoShellHTML({
    idx, total, fim,
    mostrarNav: !cardMotivo, // no passo de motivo, esconde as setas
    placar: { acertos, erros },
    centro, rodape,
  });
}

// Atualiza o overlay do foco NO LUGAR (navegação ← →), trocando só o CONTEÚDO de .fc-foco. Se
// trocássemos o outerHTML (ou déssemos app.refresh), o .fc-foco re-dispararia sua animação de
// entrada (fq-fade) e o overlay "piscaria" (parece fechar e reabrir). O keydown (document) e o
// tick do cronômetro sobrevivem — buscam elementos frescos a cada evento/segundo.
function atualizarFocoFlash(root, store) {
  const st = store.get();
  const card = st.flashcards.find((c) => c.id === focoFila[focoIdx] && !c.suspenso);
  const cardMotivo = perguntandoMotivoId ? st.flashcards.find((c) => c.id === perguntandoMotivoId) : null;
  const novoHTML = focoQuizHTML(st, { card, cardMotivo, idx: focoIdx, total: focoFila.length, placar: focoPlacar });
  const foco = root.querySelector(".fc-foco");
  if (!foco) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = novoHTML;
  const novoFoco = tmp.querySelector(".fc-foco");
  if (novoFoco) foco.replaceChildren(...Array.from(novoFoco.childNodes));
  else foco.outerHTML = novoHTML;
}

function quizCardHTML(st, c) {
  const vinc = vinculoFlashcard(st, c);
  const notas = NOTAS.map((n, i) => {
    const dias = sm2.revisar(c.sm2, n.q).intervaloDias;
    const int = dias <= 1 ? "1d" : `${dias}d`;
    return `<button class="fq-nota ${n.cls}" data-action="nota" data-q="${n.q}" data-id="${c.id}" data-tip="Atalho ${i + 1}"><span class="fq-nota-l">${n.label}</span><span class="fq-nota-i">${int}</span></button>`;
  }).join("");
  return `
    <div class="fq-card ${revelado ? "is-flipped" : ""} ${c.comentarioIA ? "fq-card--ia" : ""}" data-id="${c.id}">
      <div class="fq-face fq-front">
        <div class="fq-tags">${vinc ? `<span class="fq-tag">${esc(vinc)}</span>` : ""}${c.tipo === "afirmacao" ? `<span class="fq-tag fq-tag-ce">Certo ou errado?</span>` : ""}</div>
        <div class="fq-q">${esc(c.frente)}</div>
        <button class="fq-mostrar" data-action="revelar">${icone("eye")} Mostrar resposta</button>
      </div>
      <div class="fq-face fq-back">
        <div class="fq-back-topo">
          <span class="fq-back-rot">${icone("corner-down-right")} Resposta</span>
          <button class="btn btn-ia btn-sm" data-action="comentar-fc" data-id="${c.id}" data-tip="A IA explica este card para tirar a sua dúvida. Atalho: C">${icone("sparkles")} Comentar com IA</button>
        </div>
        <div class="fq-back-corpo">
          <div class="fq-back-pergunta">${esc(c.frente)}</div>
          ${c.tipo === "afirmacao" ? `<div class="fq-gab ${c.gabaritoCerto ? "certo" : "errado"}">${c.gabaritoCerto ? `${icone("check")} Certo` : `${icone("x")} Errado`}</div>` : ""}
          <div class="fq-a">${esc(c.verso)}</div>
          ${explicacaoIAHTML(c.comentarioIA)}
        </div>
        <div class="fq-notas">${notas}</div>
      </div>
    </div>`;
}

function quizMotivoHTML(st, c) {
  return `
    <div class="fq-panel fq-panel-motivo">
      <div class="fq-motivo-selo">${icone("flag")} Anotado no Caderno de Erros</div>
      <div class="fq-q fq-q-sm">${esc(c.frente)}</div>
      <div class="fq-motivo-q">Por que você errou?</div>
      <div class="fc-motivo-chips fq-motivo-chips">
        ${MOTIVOS_ERRO.map((m, i) => `<button class="fc-motivo-chip" data-action="motivo-fc" data-id="${c.id}" data-motivo="${esc(m)}" data-tip="Atalho ${i + 1}">${esc(m)}</button>`).join("")}
      </div>
      <button class="lnk fq-motivo-pular" data-action="pular-motivo" data-tip="Pular sem escolher um motivo (Espaço)">Pular sem classificar</button>
    </div>`;
}

function quizConclusaoHTML(feitos, acertos = 0) {
  const pct = feitos ? Math.round((acertos / feitos) * 100) : 0;
  return `
    <div class="fq-panel fq-conclusao">
      <div class="fq-check">${icone("check")}</div>
      <h2>Sessão concluída</h2>
      <p class="muted">Você revisou <b>${feitos}</b> ${feitos === 1 ? "cartão" : "cartões"} neste foco.</p>
      ${feitos ? `<div class="fq-conc-placar">
        <div class="fq-conc-item ok"><strong>${acertos}</strong><span>acertos</span></div>
        <div class="fq-conc-item err"><strong>${feitos - acertos}</strong><span>erros</span></div>
        <div class="fq-conc-item pct"><strong>${pct}%</strong><span>precisão</span></div>
      </div>` : ""}
      <div class="fq-conclusao-acoes">
        ${feitos ? `<button class="btn btn-soft btn-lg" data-action="foco-registrar-tempo" data-tip="Lança o TEMPO desta revisão de flashcards no seu histórico de sessões.">${icone("clock-3")} Registrar tempo</button>` : ""}
        <button class="btn btn-primary btn-lg" data-action="sair-foco">${icone("check")} Concluir</button>
      </div>
    </div>`;
}

// Passo pós-"Errei": registro já feito no Caderno; um toque classifica o motivo (ou pula).
function motivoPanelHTML(st, c) {
  const vinc = vinculoFlashcard(st, c);
  return `
    <div class="card fc-motivo">
      <div class="fc-motivo-head">${icone("flag")} Anotado no Caderno de Erros${vinc ? ` · <b>${esc(vinc)}</b>` : ""}</div>
      <div class="fc-motivo-frente">${esc(c.frente)}</div>
      <div class="fc-motivo-q">Por que você errou?</div>
      <div class="fc-motivo-chips">
        ${MOTIVOS_ERRO.map((m, i) => `<button class="fc-motivo-chip" data-action="motivo-fc" data-id="${c.id}" data-motivo="${esc(m)}" data-tip="Atalho ${i + 1}"><span class="fc-motivo-num">${i + 1}</span> ${esc(m)}</button>`).join("")}
      </div>
      <button class="lnk fc-motivo-pular" data-action="pular-motivo" data-tip="Espaço">agora não · pular</button>
    </div>`;
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
               ${NOTAS.map((n, i) => {
                 const dias = sm2.revisar(c.sm2, n.q).intervaloDias;
                 const intCurto = dias <= 1 ? "1d" : `${dias}d`;
                 const quando = dias <= 1 ? "volta em ~24h" : `volta em ~${dias} dias`;
                 return `<button class="btn btn-nota ${n.cls}" data-action="nota" data-q="${n.q}" data-id="${c.id}" data-tip="Atalho ${i + 1} · ${esc(n.label)}: ${quando}."><span class="nota-lbl">${n.label}</span><span class="nota-int">${intCurto}</span></button>`;
               }).join("")}
             </div>
             <div class="fc-atalhos muted small">${icone("keyboard")} <b>1–4</b> nota · <b>Espaço</b> vira</div>
             <div class="fc-extra">
               <button class="btn btn-ia btn-sm" data-action="comentar-fc" data-id="${c.id}" data-tip="A IA explica este card para tirar a sua dúvida.">${icone("sparkles")} Comentar com IA</button>
               ${c.fonte && (c.fonte.tipo === "lei" || c.fonte.tipo === "juris") ? `<button class="btn btn-ghost btn-sm" data-action="fc-abrir-artigo" data-ref="${esc(c.fonte.titulo || "")}" data-tipo="${c.fonte.tipo}" data-tip="Abrir o artigo de origem na ${c.fonte.tipo === "juris" ? "Jurisprudência" : "Lei Seca"}.">${icone("book-open")} Abrir artigo</button>` : ""}
             </div>`
          : `<button class="btn btn-primary btn-lg" data-action="revelar">Mostrar resposta</button>
             <div class="fc-atalhos muted small">${icone("keyboard")} <b>Espaço</b> para mostrar</div>`
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
  // "Ver todos" mostra TODOS os cards (é a lista completa e a via de acesso para gerenciar
  // qualquer cartão) — sem o filtro de tópico/tipo da barra acima; senão um cartão SEM tópico
  // (ou fora do filtro ativo) ficaria invisível e impossível de editar/excluir pela UI.
  // Mantém só a ORDEM da barra (recém-criados sobem quando "Mais recentes").
  const cards = [...st.flashcards].sort((a, b) =>
    ordemRev === "vencimento"
      ? (a.sm2.dueDate || "").localeCompare(b.sm2.dueDate || "")
      : (b.criadoEm || "").localeCompare(a.criadoEm || "")
  );
  const contagem = cards.length === st.flashcards.length ? `${cards.length}` : `${cards.length} de ${st.flashcards.length}`;
  const hojeISO = todayISO();
  return `
    <div class="lista-flashcards">
      <div class="plano-h"><h2>Todos os flashcards</h2><span class="cnt">${contagem}</span></div>
      ${
        cards.length
          ? `<div class="fc-grid stagger">
          ${cards.map((c) => fcTileHTML(st, c, hojeISO)).join("")}
        </div>`
          : `<p class="muted small u-m-0 u-mt-8">Nenhum flashcard corresponde ao filtro de tópico/tipo atual. Ajuste a barra acima.</p>`
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
