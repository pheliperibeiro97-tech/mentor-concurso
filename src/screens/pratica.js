// Tela de Prática de questões, em DOIS formatos (mesma estrutura):
//  • 'mc' = múltipla escolha (rota "pratica", título "Questões")
//  • 'ce' = Certo/Errado     (rota "pratica-ce", título "Questões C/E")
// Itens C/E são modelados como questão de 2 alternativas ["Certo","Errado"],
// então tentativas, Caderno de Erros e Acompanhamento funcionam igual.
import { bindActions, toast, header, seloBadge, vazio, imprimir, botaoImprimir, opcoesImpressao, avisoIA, confirmar, focarItem, explicacaoIAHTML, abrirJanela , plural, comOcupado } from "../ui.js";
import { esc, MOTIVOS_ERRO as MOTIVOS } from "../util.js";
import { icone } from "../icones.js";
import { addQuestoesBotaoHTML, addQuestoesPanelHTML, ligarAddQuestoesArquivo, addQuestoesHandlers, statusQuestao } from "./questoes-add.js";
import { filtroTopicosBotaoHTML, filtroTopicosPainelHTML, ligarFiltroTopicos, questaoNoFiltro } from "./questoes-filtro.js";
import { focoShellHTML, bindFocoCrono, focoChromeKey, ligarTickCrono } from "./foco-quiz.js";
import { abrirRegistroSessao } from "../registro-sessao.js";
import * as crono from "../cronometro.js";

// Estado independente por formato (Questões e Questões C/E não se misturam).
function novoEstado() {
  return { subModo: "treino", filtroTop: { sel: [], aberto: false }, filtroStatus: "todas", addState: { aberto: false }, editandoId: null, refazer: new Set(),
    focoAtivo: false, focoFila: [], focoIdx: 0, focoPlacar: {}, focoAnimEntrada: false }; // Modo Foco: quiz imersivo
}
const S = { mc: novoEstado(), ce: novoEstado() };

const TXT = {
  mc: {
    titulo: "Questões",
    sub: "Treine com gabarito imediato (o simulado cronometrado fica em Simulados)",
    vazioTit: "Você ainda não tem questões",
    vazioSub: "Adicione, importe de uma prova, ou gere com a IA.",
    vazioIco: icone("notebook-pen"),
    vazioCta: "Adicionar questões",
  },
  ce: {
    titulo: "Questões C/E",
    sub: "Itens Certo ou Errado, com gabarito imediato (o simulado fica em Simulados)",
    vazioTit: "Você ainda não tem itens",
    vazioSub: "Adicione, importe de uma prova, ou gere com a IA.",
    vazioIco: icone("square-pen"),
    vazioCta: "Adicionar itens",
  },
};

// Estado vazio premium da lista de prática, com CTA que reusa o data-action real
// de adicionar questões (toggle-addq, tratado por addQuestoesHandlers).
function vazioPratica(formato) {
  const t = TXT[formato];
  const cta = `<button class="btn btn-add" data-action="toggle-addq">${t.vazioCta}</button>`;
  return vazio(`${t.vazioTit}\n${t.vazioSub}`, cta, t.vazioIco);
}

// Gate da lista de prática: questão do formato certo e NÃO anulada (anuladas, vindas de
// provas anteriores, ficam fora da prática e da pontuação — não têm gabarito válido).
const ehDoFormato = (q, formato) => !q.anulada && (formato === "ce" ? q.formato === "ce" : q.formato !== "ce");

export default function renderPratica(root, app) {
  return render(root, app, "mc");
}
export function renderPraticaCE(root, app) {
  return render(root, app, "ce");
}

function render(root, app, formato) {
  const s = S[formato];
  // "Simulado" migrou para a tela "Simulados" (hub). Aqui é só o Treino (gabarito imediato).
  s.subModo = "treino";
  root.innerHTML = `
    ${header(TXT[formato].titulo, TXT[formato].sub, botaoImprimir())}
    <div id="prat-body"></div>`;
  root.querySelector('[data-action="imprimir"]')?.addEventListener("click", async () => {
    const st = app.store.get();
    const qs = st.questoes
      .filter((q) => ehDoFormato(q, formato) && questaoNoFiltro(q, s.filtroTop.sel) && (s.filtroStatus === "todas" || statusQuestao(st, q) === s.filtroStatus))
      .sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || "")); // recém-criadas primeiro
    if (!qs.length) return toast("Nada no filtro atual para imprimir.", "erro");
    const op = await opcoesImpressao(`Imprimir ${TXT[formato].titulo.toLowerCase()}`, [
      { key: "gab", label: "Gabarito", opcoes: [{ v: "sem", rot: "Sem gabarito (folha para resolver)" }, { v: "com", rot: "Com gabarito" }], def: "com" },
    ]);
    if (!op) return;
    imprimir(`${TXT[formato].titulo} — Mentor Concurso`, printQuestoes(st, qs, formato, op.gab === "com"));
  });
  const body = root.querySelector("#prat-body");
  return renderTreino(body, app, formato);
}

function renderTreino(root, app, formato) {
  const { store } = app;
  const st = store.get();
  const s = S[formato];
  if (app.params && app.params.topicoId) {
    s.filtroTop.sel = [app.params.topicoId];
    app.params.topicoId = null;
  }
  // #4: veio de uma geração → mostra SÓ as recém-geradas (some ao clicar "Ver todas").
  if (app.params && app.params.lote) {
    s.filtroLote = app.params.lote;
    s.filtroLoteRotulo = app.params.loteRotulo || "";
    app.params.lote = null; app.params.loteRotulo = null;
    s.filtroStatus = "todas"; s.filtroTop.sel = []; s.addState.aberto = false;
  }
  if (s.filtroLote && !st.questoes.some((q) => q.geracaoId === s.filtroLote && ehDoFormato(q, formato))) { s.filtroLote = null; s.filtroLoteRotulo = ""; }
  // Refazer erros em foco (vindo do Caderno de Erros): entra direto no Modo Foco com a
  // fila = questões erradas passadas (pode misturar MC e C/E — o foco detecta por questão).
  if (app.params && app.params.focoErrosIds) {
    const ids = app.params.focoErrosIds;
    app.params.focoErrosIds = null;
    s.focoFila = ids.filter((id) => st.questoes.some((q) => q.id === id));
    s.focoFila.forEach((id) => s.refazer.add(id)); // começam EM BRANCO (refazer, não rever)
    s.focoIdx = 0;
    s.focoPlacar = {};
    s.focoAtivo = s.focoFila.length > 0;
    s.focoAnimEntrada = true;
  }
  // Foco numa questão (Dossiê): garante que ela apareça (limpa o filtro de situação
  // e foca o tópico dela) e rola até ela ao final.
  let focoQ = null;
  if (app.params && app.params.focoQuestaoId) {
    focoQ = app.params.focoQuestaoId;
    app.params.focoQuestaoId = null;
    const q = st.questoes.find((x) => x.id === focoQ);
    s.filtroStatus = "todas";
    s.filtroTop.sel = q && q.topicoId ? [q.topicoId] : [];
    s.addState.aberto = false;
  }

  // Itens de TREINO (drill "letra da lei") não entram na lista de Questões — só no Treinar da Lei Seca.
  const questoes = st.questoes
    .filter((q) => !q.treino && ehDoFormato(q, formato) && (!s.filtroLote || q.geracaoId === s.filtroLote) && questaoNoFiltro(q, s.filtroTop.sel) && (s.filtroStatus === "todas" || statusQuestao(st, q) === s.filtroStatus))
    .sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || "")); // recém-criadas primeiro (padrão)
  const nErradas = st.questoes.filter((q) => !q.treino && ehDoFormato(q, formato) && statusQuestao(st, q) === "errei").length;
  // Há questões do formato, mas nenhuma passou no filtro atual? Então é um vazio de
  // filtro (não "não tem nada"): mostra mensagem orientando a ajustar os filtros.
  const totalFormato = st.questoes.filter((q) => !q.treino && ehDoFormato(q, formato)).length;

  const opcoesVincular = `<option value="">— sem tópico —</option>` + st.topicos.map((t) => `<option value="${t.id}">${esc(nomeTopico(st, t))}</option>`).join("");
  const editObj = s.editandoId ? st.questoes.find((q) => q.id === s.editandoId) : null;

  root.innerHTML = `
    <div class="barra-acoes">
      ${addQuestoesBotaoHTML(s.addState.aberto, formato)}
      <button class="btn btn-sm fc-foco-btn" data-action="entrar-foco" ${questoes.length ? "" : "disabled"} data-tip="Resolver uma a uma, em tela cheia, sem distração (respeita o filtro atual).">${icone("expand")} Modo foco</button>
      <button class="btn btn-sm btn-treinar" data-action="treinar-erradas" ${nErradas ? "" : "disabled"} data-tip="Refaz, em branco, todas as que você errou. Cada uma sai da lista quando você acerta.">Treinar erros (<span class="num">${nErradas}</span>)</button>
      <span class="spacer"></span>
      <button class="btn btn-sm btn-ghost lnk-danger" data-action="limpar-questoes" ${questoes.length ? "" : "disabled"} data-tip-pos="cima-dir" data-tip="Apaga as ${formato === "ce" ? "afirmações" : "questões"} que estão no filtro atual (tópico + situação). Não pode ser desfeito.">${icone("trash-2")} Limpar (<span class="num">${questoes.length}</span>)</button>
    </div>

    ${editObj ? editFormHTML(st, editObj, opcoesVincular, formato) : ""}

    <div class="barra-acoes filtro-bar">
      ${filtroTopicosBotaoHTML(st, s.filtroTop.sel, s.filtroTop.aberto)}
      <label class="inline">Situação:
        <select id="filtro-status">
          <option value="todas" ${s.filtroStatus === "todas" ? "selected" : ""}>Todas</option>
          <option value="pendente" ${s.filtroStatus === "pendente" ? "selected" : ""}>Pendentes</option>
          <option value="acertei" ${s.filtroStatus === "acertei" ? "selected" : ""}>Acertei</option>
          <option value="errei" ${s.filtroStatus === "errei" ? "selected" : ""}>Errei</option>
        </select>
      </label>
    </div>
    ${filtroTopicosPainelHTML(st, s.filtroTop.sel, s.filtroTop.aberto)}

    ${s.filtroLote ? `<div class="lote-banner">${icone("sparkles")}<span>Praticando só as <b>${questoes.length}</b> ${formato === "ce" ? "afirmações" : "questões"} recém-geradas ${esc(s.filtroLoteRotulo)}.</span><button class="lnk" data-action="lote-ver-todos" data-tip="Voltar para todas as suas ${formato === "ce" ? "afirmações" : "questões"}.">Ver todas</button></div>` : ""}

    ${totalFormato ? `<div class="plano-h"><h2>${formato === "ce" ? "Seus itens" : "Suas questões"}</h2><span class="cnt">${questoes.length}</span>${questoes.length ? `<span class="tempo-est" data-tip="Tempo estimado para resolver este conjunto (${formato === "ce" ? "~1,2 min" : "~2,2 min"} por ${formato === "ce" ? "item" : "questão"}).">${icone("clock-3")} ≈ ${Math.max(1, Math.round(questoes.length * (formato === "ce" ? 1.2 : 2.2)))} min</span>` : ""}<span class="sp"></span></div>` : ""}
    <div class="lista-questoes">
      ${
        questoes.length
          ? questoes.map((q) => questaoHTML(st, q, formato, s)).join("")
          : totalFormato
            ? vazio(`Nada nesse filtro\nNenhuma ${formato === "ce" ? "afirmação" : "questão"} corresponde à situação ou aos tópicos selecionados. Ajuste os filtros acima.`, "", icone("dices"))
            : vazioPratica(formato)
      }
    </div>
    ${s.focoAtivo ? focoOverlayHTML(st, s, formato, s.focoAnimEntrada ? "in" : "fade") : ""}`;
  s.focoAnimEntrada = false; // consumido: re-renders seguintes (ex.: comentar IA) não "pulam"

  root.querySelector("#filtro-status")?.addEventListener("change", (e) => {
    s.filtroStatus = e.target.value;
    app.refresh();
  });
  ligarFiltroTopicos(root, app, s.filtroTop);
  ligarAddQuestoesArquivo(root, app, formato);
  focarItem(root, focoQ);
  // ao abrir o editor, rola até ele. Duplo rAF: roda DEPOIS que o main.js
  // restaura a rolagem preservada (senão a restauração sobrescreve o scroll).
  if (editObj) {
    const alvo = root.querySelector(".form-questao");
    if (alvo) requestAnimationFrame(() => requestAnimationFrame(() => alvo.scrollIntoView({ behavior: "smooth", block: "center" })));
  }

  bindActions(root, {
    ...addQuestoesHandlers(root, app, s.addState, formato),
    ...bindFocoCrono({}), // cronômetro do foco (toggle/prog/reg/livre) — módulo compartilhado
    "entrar-foco": () => {
      // Snapshot da fila FILTRADA atual → sessão navegável.
      s.focoFila = questoes.map((q) => q.id);
      s.focoIdx = 0;
      s.focoPlacar = {};
      s.focoAtivo = true;
      s.focoAnimEntrada = true; // só a 1ª aparição tem animação plena (as demais, fade)
      app.refresh();
    },
    "foco-anterior": () => { if (s.focoIdx > 0) { s.focoIdx--; atualizarOverlayFoco(root, store, s, formato); } },
    "foco-proximo": () => { if (s.focoIdx < s.focoFila.length) { s.focoIdx++; atualizarOverlayFoco(root, store, s, formato); } },
    "sair-foco": () => { s.focoAtivo = false; app.refresh(); },
    "foco-registrar-tempo": () => {
      const temTempo = crono.snapshot().elapsed >= 60;
      s.focoAtivo = false;
      app.refresh();
      abrirRegistroSessao(store, app, { modo: temTempo ? "crono" : "manual", fasePadrao: "A" });
    },
    "lote-ver-todos": () => { s.filtroLote = null; s.filtroLoteRotulo = ""; app.refresh(); },
    "abrir-artigo-lei": (el) => { app.navigate("leiseca", { focoIndicacaoId: el.getAttribute("data-id") }); }, // #11: abre o artigo na Lei Seca
    "treinar-erradas": () => {
      // Filtra as erradas e as apresenta EM BRANCO (sem gabarito) para refazer.
      s.filtroStatus = "errei";
      s.addState.aberto = false;
      st.questoes.forEach((q) => {
        if (ehDoFormato(q, formato) && statusQuestao(st, q) === "errei") s.refazer.add(q.id);
      });
      app.refresh();
    },
    "limpar-questoes": async () => {
      // Apaga exatamente o conjunto que está no filtro atual (tópico + situação).
      if (!questoes.length) return;
      const desc = [];
      if (s.filtroTop.sel.length) desc.push(s.filtroTop.sel.length === 1 ? "do tópico selecionado" : "dos tópicos selecionados");
      if (s.filtroStatus !== "todas") desc.push(`com situação "${s.filtroStatus}"`);
      const ctx = desc.length ? " " + desc.join(" e ") : " (todos os tópicos e situações)";
      if (await confirmar(`Apagar ${plural(questoes.length, formato === "ce" ? "afirmação" : "questão", formato === "ce" ? "afirmações" : "questões")}${ctx}? Esta ação não pode ser desfeita.`)) {
        questoes.forEach((q) => store.removerQuestao(q.id));
        toast(`${plural(questoes.length, formato === "ce" ? "item removido" : "questão removida", formato === "ce" ? "itens removidos" : "questões removidas")}.`);
        app.refresh();
      }
    },
    // PILOTO de "janela": editar abre numa JANELA modal premium (antes expandia inline + scrollIntoView).
    editar: (el) => {
      const id = el.getAttribute("data-q");
      const q = store.get().questoes.find((x) => x.id === id);
      if (!q) return;
      abrirJanela({
        titulo: formato === "ce" ? "Editar item Certo/Errado" : "Editar questão",
        corpoHTML: editFormHTML(st, q, opcoesVincular, formato),
        aoMontar: (jan, fechar) => {
          jan.querySelector('[data-action="cancelar-edicao"]').addEventListener("click", fechar);
          jan.querySelector('[data-action="salvar-edicao"]').addEventListener("click", () => {
            const enun = jan.querySelector("#qe-enun").value.trim();
            const topicoId = jan.querySelector("#qe-top").value || null;
            const referencia = jan.querySelector("#qe-ref").value.trim();
            if (!enun) return toast(formato === "ce" ? "Escreva a afirmação." : "Escreva o enunciado.", "erro");
            if (formato === "ce") {
              const certo = jan.querySelector("#qe-ce").value === "certo";
              const justificativa = jan.querySelector("#qe-justif").value.trim();
              store.editarQuestao(id, { enunciado: enun, alternativas: ["Certo", "Errado"], gabarito: certo ? 0 : 1, justificativa, topicoId, referencia });
            } else {
              const alts = jan.querySelector("#qe-alts").value.split(/\r?\n/).map((a) => a.trim()).filter(Boolean);
              const gab = parseInt(jan.querySelector("#qe-gab").value, 10);
              const nivel = jan.querySelector("#qe-nivel").value || null;
              if (alts.length < 2) return toast("Informe ao menos 2 alternativas (uma por linha).", "erro");
              if (!gab || gab < 1 || gab > alts.length) return toast(`Gabarito deve ser entre 1 e ${alts.length}.`, "erro");
              store.editarQuestao(id, { enunciado: enun, alternativas: alts, gabarito: gab - 1, topicoId, nivel, referencia });
            }
            toast(formato === "ce" ? "Item atualizado." : "Questão atualizada.");
            fechar();
            app.refresh();
          });
        },
      });
    },
    responder: (el) => {
      const qId = el.getAttribute("data-q");
      const escolha = parseInt(el.getAttribute("data-i"), 10);
      const t = store.registrarTentativa({ questaoId: qId, escolha });
      s.refazer.delete(qId);
      if (s.focoAtivo && t) {
        // No foco: registra no placar da sessão e atualiza SÓ o miolo + o placar, no lugar
        // (sem app.refresh, senão o overlay re-anima e "parece recarregar").
        s.focoPlacar[qId] = t.acertou;
        const st2 = store.get();
        const q = st2.questoes.find((x) => x.id === qId);
        const stage = root.querySelector(".fq-stage");
        if (stage && q) stage.innerHTML = focoQuestaoHTML(st2, q, formato, s);
        atualizarPlacarFoco(root, s.focoPlacar);
        return;
      }
      if (t) toast(t.acertou ? "Acertou!" : "Errou. Registrado no caderno.", t.acertou ? "ok" : "erro");
    },
    refazer: (el) => {
      s.refazer.add(el.getAttribute("data-q"));
      app.refresh();
    },
    "comentar-ia": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Comentar o erro");
      const tId = el.getAttribute("data-t");
      const inp = document.getElementById("duv-" + tId); // considera a dúvida digitada mesmo sem clicar "Salvar" antes
      if (inp && inp.value.trim()) store.setDuvida(tId, inp.value.trim());
      const r = await comOcupado(() => store.comentarErroIA(tId), { botao: el, msg: "Analisando o erro com a IA…" });
      if (r === null) return;
      toast(inp && inp.value.trim() ? "A IA respondeu sua dúvida." : "Comentário da IA gerado.");
    },
    "comentar-questao": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Comentar a questão");
      const qId = el.getAttribute("data-q");
      const tId = el.getAttribute("data-t"); // no acerto há um campo de dúvida ligado à tentativa
      const inp = tId ? document.getElementById("duv-" + tId) : null;
      const duvida = inp && inp.value.trim() ? inp.value.trim() : "";
      if (duvida && tId) store.setDuvida(tId, duvida);
      const r = await comOcupado(() => store.comentarQuestaoIA(qId, duvida), { botao: el, msg: "A IA está comentando a questão…" });
      if (r === null) return;
      toast(duvida ? "A IA respondeu sua dúvida." : "Comentário gerado.");
    },
    "del-questao": async (el) => {
      if (await confirmar(formato === "ce" ? "Remover este item?" : "Remover esta questão?")) {
        store.removerQuestao(el.getAttribute("data-q"));
        toast(formato === "ce" ? "Item removido." : "Questão removida.");
      }
    },
  });

  root.querySelectorAll('select[data-action="motivo"]').forEach((selEl) => {
    selEl.addEventListener("change", () => store.setMotivoErro(selEl.getAttribute("data-t"), selEl.value));
  });

  // ===== Modo Foco: teclado + cronômetro vivo (só quando ativo) =====
  if (!s.focoAtivo) return;
  function onKey(e) {
    const chrome = focoChromeKey(e, { root }); // Esc/setas/campo do cronômetro
    if (chrome) return;
    const qcard = root.querySelector(".fq-qcard");
    if (!qcard) return; // tela de conclusão: só o chrome
    if (qcard.classList.contains("is-answered")) {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); root.querySelector('[data-action="foco-proximo"]')?.click(); }
      else if (e.key === "c" || e.key === "C") { e.preventDefault(); root.querySelector('.fq-qcard [data-action="comentar-questao"]:not([disabled])')?.click(); }
      return;
    }
    // Ainda não respondida: seleciona a alternativa (C/E nos itens, 1–6 na múltipla).
    // Detecta o formato pelo DOM da questão atual (sessão pode ser mista).
    if (root.querySelector(".fq-qalts.ce")) {
      if (e.key === "c" || e.key === "C") { e.preventDefault(); root.querySelector('.fq-qalts [data-i="0"]')?.click(); }
      else if (e.key === "e" || e.key === "E") { e.preventDefault(); root.querySelector('.fq-qalts [data-i="1"]')?.click(); }
      return;
    }
    const idx = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5 }[e.key];
    if (idx !== undefined) { e.preventDefault(); root.querySelectorAll('.fq-qalts [data-action="responder"]')[idx]?.click(); }
  }
  document.addEventListener("keydown", onKey);
  const offTick = ligarTickCrono(root);
  return () => { document.removeEventListener("keydown", onKey); offTick(); };
}

// Formulário de EDIÇÃO (estruturado), específico por formato.
function editFormHTML(st, q, opcoesVincular, formato) {
  const tid = q.topicoId || "";
  const opTop = opcoesVincular.replace(`value="${tid}">`, `value="${tid}" selected>`);
  if (formato === "ce") {
    return `
    <div class="card form-questao">
      <h3>${icone("square-pen")} Editar item Certo/Errado</h3>
      <div class="form-row">
        <label style="flex:2">Tópico (opcional) <select id="qe-top">${opTop}</select></label>
        <label>Gabarito <select id="qe-ce"><option value="certo" ${q.gabarito === 0 ? "selected" : ""}>Certo</option><option value="errado" ${q.gabarito === 1 ? "selected" : ""}>Errado</option></select></label>
      </div>
      <label>Afirmação <textarea id="qe-enun" rows="2">${esc(q.enunciado)}</textarea></label>
      <label>Justificativa (opcional) <textarea id="qe-justif" rows="2">${esc(q.justificativa || "")}</textarea></label>
      <label>Referência (opcional) <input id="qe-ref" type="text" value="${esc(q.referencia || "")}" placeholder="Ex.: Q12345 · Prova Cebraspe 2023" /></label>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="cancelar-edicao">Cancelar</button>
        <button class="btn btn-primary" data-action="salvar-edicao" data-q="${q.id}">Salvar</button>
      </div>
    </div>`;
  }
  return `
    <div class="card form-questao">
      <h3>${icone("square-pen")} Editar questão</h3>
      <div class="form-row">
        <label>Tópico (opcional) <select id="qe-top">${opTop}</select></label>
        <label>Nível <select id="qe-nivel"><option value="">—</option>${["Fácil", "Média", "Difícil"].map((n) => `<option ${q.nivel === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      </div>
      <label>Enunciado <textarea id="qe-enun" rows="2">${esc(q.enunciado)}</textarea></label>
      <label>Alternativas (uma por linha)
        <textarea id="qe-alts" rows="4">${esc(q.alternativas.join("\n"))}</textarea>
      </label>
      <div class="form-row">
        <label>Nº da alternativa correta <input id="qe-gab" type="number" min="1" value="${q.gabarito + 1}" /></label>
        <label style="flex:2">Referência (opcional) <input id="qe-ref" type="text" value="${esc(q.referencia || "")}" placeholder="Ex.: Q12345 · Prova VUNESP 2023 · art. 1.003 CPC" /></label>
      </div>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="cancelar-edicao">Cancelar</button>
        <button class="btn btn-primary" data-action="salvar-edicao" data-q="${q.id}">Salvar</button>
      </div>
    </div>`;
}

function vinculoQuestao(st, q) {
  const t = q.topicoId ? st.topicos.find((x) => x.id === q.topicoId) : null;
  if (t) return nomeTopico(st, t);
  if (q.disciplinaId) {
    const d = st.disciplinas.find((x) => x.id === q.disciplinaId);
    if (d) return d.nome;
  }
  return null;
}

function questaoHTML(st, q, formato, s) {
  const ce = formato === "ce";
  const tentativas = st.tentativas.filter((t) => t.questaoId === q.id);
  const ultima = tentativas[tentativas.length - 1];
  const respondida = ultima && !s.refazer.has(q.id);

  let altsHTML;
  if (ce) {
    if (respondida) {
      altsHTML = `<div class="ce-opcoes">
        ${[0, 1].map((i) => {
          const rotulo = i === 0 ? "Certo" : "Errado";
          const cls = i === q.gabarito ? "ce-opt correta" : i === ultima.escolha ? "ce-opt errada" : "ce-opt";
          const tag = i === q.gabarito ? ` ${icone("check")}` : i === ultima.escolha ? ` ${icone("x")}` : "";
          return `<div class="${cls}">${rotulo}${tag}</div>`;
        }).join("")}
      </div>`;
    } else {
      altsHTML = `<div class="ce-opcoes">
        <button class="btn ce-btn ce-certo" data-action="responder" data-q="${q.id}" data-i="0">Certo</button>
        <button class="btn ce-btn ce-errado" data-action="responder" data-q="${q.id}" data-i="1">Errado</button>
      </div>`;
    }
  } else {
    altsHTML = q.alternativas
      .map((a, i) => {
        if (respondida) {
          const cls = i === q.gabarito ? "alt correta" : i === ultima.escolha ? "alt errada" : "alt";
          const tag = i === q.gabarito ? ` ${icone("check")}` : i === ultima.escolha ? ` ${icone("x")}` : "";
          return `<div class="${cls}"><span class="alt-letra">${letra(i)}</span> ${esc(a)}${tag}</div>`;
        }
        return `<button class="alt alt-btn" data-action="responder" data-q="${q.id}" data-i="${i}"><span class="alt-letra">${letra(i)}</span> ${esc(a)}</button>`;
      })
      .join("");
  }

  // Bloco de feedback (após responder) e ações do card (Refazer fica sempre como
  // ação do card, fora do painel de feedback/erro).
  let feedback = "";
  let cardAcoes = "";
  if (respondida) {
    const justif = ce && q.justificativa ? `<div class="ce-justif"><b>Justificativa:</b> ${esc(q.justificativa)}</div>` : "";
    if (ultima.acertou) {
      feedback = `<div class="feedback ok">${icone("check")} Você acertou.</div>${justif}
        <div class="duvida-row">
          <input id="duv-${ultima.id}" type="text" placeholder="Tem uma dúvida sobre esta questão? Escreva e clique em Comentar." value="${esc(ultima.duvida || "")}" title="Escreva sua dúvida; a IA responde junto com a explicação do gabarito." />
          <button class="btn btn-ia btn-sm" data-action="comentar-questao" data-q="${q.id}" data-t="${ultima.id}" data-tip-pos="cima-dir" data-tip="A IA explica o gabarito e, se você escrever uma dúvida, responde a ela primeiro.">${icone("sparkles")} Comentar com IA</button>
        </div>`;
      cardAcoes = `
        <div class="questao-rodape">
          <button class="btn btn-ghost btn-sm" data-action="refazer" data-q="${q.id}" data-tip-pos="cima-esq" data-tip="Responder de novo, sem apagar o registro do acerto.">${icone("refresh-cw")} Refazer</button>
        </div>`;
    } else {
      // Painel "Análise do erro": agrupa o que é relacionado ao erro
      // (feedback ✗, motivo, anotação/dúvida e comentar com IA).
      feedback = `
        <div class="feedback erro">${icone("x")} Resposta incorreta. Salva no Caderno de Erros.</div>${justif}
        <div class="analise-erro">
          <div class="analise-erro-titulo">Análise do erro</div>
          <label class="inline analise-erro-motivo">Motivo:
            <select data-action="motivo" data-t="${ultima.id}">
              <option value="">—</option>
              ${MOTIVOS.map((m) => `<option ${ultima.motivoErro === m ? "selected" : ""}>${m}</option>`).join("")}
            </select>
          </label>
          <div class="duvida-row">
            <input id="duv-${ultima.id}" type="text" placeholder="Tem uma dúvida sobre este erro? Escreva e clique em Comentar (opcional)." value="${esc(ultima.duvida || "")}" title="Escreva sua dúvida; a IA responde junto com a explicação. Não é obrigatório." />
            <button class="btn btn-ia btn-sm" data-action="comentar-ia" data-t="${ultima.id}" data-tip-pos="cima-dir" data-tip="A IA explica por que a resposta certa é a correta e, se você escrever uma dúvida, responde a ela primeiro.">${icone("sparkles")} Comentar com IA</button>
          </div>
          ${explicacaoIAHTML(ultima.comentarioIA)}
        </div>`;
      cardAcoes = `
        <div class="questao-rodape">
          <button class="btn btn-ghost btn-sm" data-action="refazer" data-q="${q.id}" data-tip-pos="cima-dir" data-tip="Responder de novo. O erro continua registrado no Caderno de Erros.">${icone("refresh-cw")} Refazer</button>
        </div>`;
    }
  }

  return `
    <div class="card questao" data-foco-id="${q.id}">
      <div class="questao-meta">
        ${(() => { const v = vinculoQuestao(st, q); return v ? `<span class="tag-topico">${esc(v)}</span>` : ""; })()}
        ${ce ? `<span class="mini-tag">Certo/Errado</span>` : ""}
        ${q.nivel ? `<span class="nivel-badge nivel-${esc(q.nivel.toLowerCase())}">${esc(q.nivel)}</span>` : ""}
        ${seloBadge(q.selo, q.fonte)}
        <div class="questao-acoes-meta">
          ${q.referencia ? `<span class="questao-ref-chip" data-tip-pos="cima-dir" data-tip="Referência / numeração de origem.">${icone("paperclip")} ${esc(q.referencia)}</span>` : ""}
          <button class="lnk" data-action="editar" data-q="${q.id}" data-tip-pos="cima-dir" data-tip="Editar.">${icone("square-pen")}</button>
          <button class="lnk lnk-danger" data-action="del-questao" data-q="${q.id}" data-tip-pos="cima-dir" data-tip="Remover.">${icone("x")}</button>
        </div>
      </div>
      <div class="questao-enun">${esc(q.enunciado)}</div>
      <div class="questao-alts">${altsHTML}</div>
      ${feedback}
      ${cardAcoes}
      ${q.comentarioIA ? explicacaoIAHTML(q.comentarioIA) : ""}
    </div>`;
}

// ===================== MODO FOCO — quiz imersivo de questões =====================
// Reaproveita o shell compartilhado (foco-quiz.js): overlay + aurora + barra (nav ← →,
// placar, cronômetro) + palco animado. O miolo é a questão (enunciado + alternativas +
// correção imediata). Fila = snapshot da lista filtrada; revisitar mostra o resultado
// anterior (sem nova tentativa).
function focoOverlayHTML(st, s, formato, anim = "in") {
  const total = s.focoFila.length;
  const idx = s.focoIdx;
  const fim = idx >= total;
  const q = fim ? null : st.questoes.find((x) => x.id === s.focoFila[idx]);
  const vals = Object.values(s.focoPlacar);
  const acertos = vals.filter((v) => v === true).length;
  const erros = vals.filter((v) => v === false).length;
  const centro = q ? focoQuestaoHTML(st, q, formato, s) : focoConclusaoHTML(acertos, erros);
  const rodape = !q
    ? `<kbd>Esc</kbd> sair`
    : q.formato === "ce" // legenda por questão (sessão pode ser mista, ex.: refazer erros)
      ? `<kbd>Esc</kbd> sair · <kbd>←</kbd><kbd>→</kbd> navegar · <kbd>C</kbd> certo · <kbd>E</kbd> errado · <kbd>Espaço</kbd> próxima`
      : `<kbd>Esc</kbd> sair · <kbd>←</kbd><kbd>→</kbd> navegar · <kbd>1</kbd>–<kbd>4</kbd> responder · <kbd>Espaço</kbd> próxima · <kbd>C</kbd> comentar`;
  return focoShellHTML({
    idx, total, fim: !q, anim,
    placar: { acertos, erros },
    centro, rodape,
    aria: formato === "ce" ? "Modo foco Certo/Errado" : "Modo foco Questões",
  });
}

// Atualiza o overlay do foco NO LUGAR — troca só o CONTEÚDO de .fc-foco, mantendo o próprio
// elemento montado. Se trocássemos o outerHTML, o novo .fc-foco re-dispararia sua animação de
// entrada (animation: fq-fade) e o overlay "piscaria" (parece fechar e reabrir). Só o miolo
// (.fq-stage) tem a transição de fade, sem movimento.
function atualizarOverlayFoco(root, store, s, formato) {
  const foco = root.querySelector(".fc-foco");
  const novoHTML = focoOverlayHTML(store.get(), s, formato, "fade");
  if (!foco) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = novoHTML;
  const novoFoco = tmp.querySelector(".fc-foco");
  if (novoFoco) foco.replaceChildren(...Array.from(novoFoco.childNodes));
  else foco.outerHTML = novoHTML;
}

// Drill "letra da lei": realça na afirmação já respondida o trecho que a banca alterou (vermelho).
function enunTreino(q, respondida) {
  if (respondida && q.treino && q.diff && q.diff.trechoAlterado) {
    const alvo = q.diff.trechoAlterado;
    const i = q.enunciado.toLowerCase().indexOf(alvo.toLowerCase());
    if (i >= 0) {
      return `${esc(q.enunciado.slice(0, i))}<span class="ls-diff-red">${esc(q.enunciado.slice(i, i + alvo.length))}</span>${esc(q.enunciado.slice(i + alvo.length))}`;
    }
  }
  return esc(q.enunciado);
}
// Correção colorida do drill: trecho trocado (vermelho) → texto correto guardado (verde).
// #11: para itens de Lei Seca, mostra também a INCIDÊNCIA (★, quanto cai), o TEXTO INTEGRAL do
// artigo e um botão para ABRIR o artigo na Lei Seca.
function diffTreinoHTML(q, st) {
  if (!q.treino) return "";
  const diff = q.diff && q.diff.trechoOriginal
    ? `<div class="ls-diff"><span class="ls-diff-red">${esc(q.diff.trechoAlterado)}</span> ${icone("arrow-right")} <span class="ls-diff-green">${esc(q.diff.trechoOriginal)}</span> <span class="muted small">(texto correto)</span></div>`
    : `<div class="ls-diff ls-diff-fiel">${icone("check")} Afirmação fiel à letra do texto.</div>`;
  const ind = q.treino.indicacaoId && st ? st.indicacoes.find((i) => i.id === q.treino.indicacaoId) : null;
  if (!ind) return diff;
  const nEstrelas = ind.pqIncidencia == null ? 0 : Math.max(1, Math.min(5, Math.round(ind.pqIncidencia / 20)));
  const estrelas = ind.pqIncidencia != null
    ? `<span class="ce-inc" data-tip="O quanto este artigo cai em prova (incidência).">${Array.from({ length: 5 }, (_, k) => `<span class="${k < nEstrelas ? "on" : ""}">${icone("star")}</span>`).join("")}</span>`
    : "";
  const ref = String(ind.referencia || "").split(",")[0].trim();
  const texto = String(ind.texto || "").replace(/^\s*Art\.?\s*\d+\s*[ºo°]?(?:-[A-Z])?\s*[-–—.:]?\s*/i, "").trim() || ind.texto || "";
  return diff + `<div class="ce-artigo">
      <div class="ce-artigo-h"><b>${esc(ref)}</b>${estrelas}<span class="spacer"></span><button class="lnk" data-action="abrir-artigo-lei" data-id="${ind.id}" data-tip="Abrir este artigo na Lei Seca (com grifos e ações).">${icone("book-open")} Abrir artigo</button></div>
      <div class="ce-artigo-txt">${esc(texto)}</div>
    </div>`;
}

function focoQuestaoHTML(st, q, formato, s) {
  const ce = q.formato === "ce"; // por QUESTÃO (permite sessão mista: refazer erros MC+CE)
  const tentativas = st.tentativas.filter((t) => t.questaoId === q.id);
  const ultima = tentativas[tentativas.length - 1];
  // Respondida (mostra correção) a menos que esteja marcada p/ refazer (aí começa em branco).
  const respondida = !!ultima && !s.refazer.has(q.id);
  const vinc = vinculoQuestao(st, q);
  // Histórico da questão (como no MEI): quantas vezes já tentou e o placar ✓/✗.
  const nTent = tentativas.length;
  const acT = tentativas.filter((t) => t.acertou).length;
  const histChip = nTent
    ? `<span class="fq-tag fq-tag-hist" data-tip="Seu histórico nesta questão (todas as tentativas)">${icone("rotate-ccw")} ${nTent} ${nTent === 1 ? "tentativa" : "tentativas"} · <b class="hist-ok">${icone("check")} ${acT}</b> <b class="hist-err">${icone("x")} ${nTent - acT}</b>${!respondida ? " · nova conta" : ""}</span>`
    : "";

  let alts;
  if (ce) {
    alts = [0, 1].map((i) => {
      const rot = i === 0 ? "Certo" : "Errado";
      if (respondida) {
        const cls = i === q.gabarito ? "alt correta" : i === ultima.escolha ? "alt errada" : "alt alt-off";
        const tag = i === q.gabarito ? ` ${icone("check")}` : i === ultima.escolha ? ` ${icone("x")}` : "";
        return `<div class="${cls}">${rot}${tag}</div>`;
      }
      return `<button class="alt alt-btn" data-action="responder" data-q="${q.id}" data-i="${i}">${rot}<kbd class="alt-key">${i === 0 ? "C" : "E"}</kbd></button>`;
    }).join("");
  } else {
    alts = q.alternativas.map((a, i) => {
      if (respondida) {
        const cls = i === q.gabarito ? "alt correta" : i === ultima.escolha ? "alt errada" : "alt alt-off";
        const tag = i === q.gabarito ? ` ${icone("check")}` : i === ultima.escolha ? ` ${icone("x")}` : "";
        return `<div class="${cls}"><span class="alt-letra">${letra(i)}</span> ${esc(a)}${tag}</div>`;
      }
      return `<button class="alt alt-btn" data-action="responder" data-q="${q.id}" data-i="${i}"><span class="alt-letra">${letra(i)}</span> <span class="alt-txt">${esc(a)}</span>${i < 6 ? `<kbd class="alt-key">${i + 1}</kbd>` : ""}</button>`;
    }).join("");
  }

  let feedback = "";
  if (respondida) {
    const justif = ce && q.justificativa ? `<div class="ce-justif"><b>Justificativa:</b> ${esc(q.justificativa)}</div>` : "";
    feedback = `
      <div class="fq-qfeedback">
        <div class="feedback ${ultima.acertou ? "ok" : "erro"}">${icone(ultima.acertou ? "check" : "x")} ${ultima.acertou ? "Você acertou." : "Resposta incorreta. Salva no Caderno de Erros."}</div>
        ${diffTreinoHTML(q, st)}
        ${justif}
        <div class="fq-qia-topo">
          <button class="btn btn-ia btn-sm" data-action="comentar-questao" data-q="${q.id}" data-tip="A IA explica o gabarito desta questão (com selo de origem). Atalho: C">${icone("sparkles")} Comentar com IA</button>
          <span class="fq-qia-dica muted small">→ ou Espaço para a próxima</span>
        </div>
        ${q.comentarioIA ? explicacaoIAHTML(q.comentarioIA) : ""}
      </div>`;
  }

  return `
    <div class="fq-qcard ${respondida ? "is-answered" : ""} ${respondida && q.comentarioIA ? "fq-qcard--ia" : ""}" data-id="${q.id}">
      <div class="fq-tags">
        ${vinc ? `<span class="fq-tag">${esc(vinc)}</span>` : ""}
        ${ce ? `<span class="fq-tag fq-tag-ce">Certo ou errado?</span>` : q.nivel ? `<span class="fq-tag">${esc(q.nivel)}</span>` : ""}
        ${histChip}
      </div>
      <div class="fq-qenun">${enunTreino(q, respondida)}</div>
      <div class="fq-qalts ${ce ? "ce" : ""}">${alts}</div>
      ${
        respondida
          ? ""
          : `<div class="fc-atalhos muted small">${icone("keyboard")} ${
              ce
                ? `<b>C</b> certo · <b>E</b> errado`
                : `teclas <b>1</b>–<b>${Math.min(q.alternativas.length, 6)}</b> para responder`
            }</div>`
      }
      ${feedback}
    </div>`;
}

function focoConclusaoHTML(acertos, erros) {
  const feitos = acertos + erros;
  const pct = feitos ? Math.round((acertos / feitos) * 100) : 0;
  return `
    <div class="fq-panel fq-conclusao">
      <div class="fq-check">${icone("check")}</div>
      <h2>Sessão concluída</h2>
      <p class="muted">Você resolveu <b>${feitos}</b> ${feitos === 1 ? "questão" : "questões"} neste foco.</p>
      ${feitos ? `<div class="fq-conc-placar">
        <div class="fq-conc-item ok"><strong>${acertos}</strong><span>acertos</span></div>
        <div class="fq-conc-item err"><strong>${erros}</strong><span>erros</span></div>
        <div class="fq-conc-item pct"><strong>${pct}%</strong><span>precisão</span></div>
      </div>` : ""}
      <div class="fq-conclusao-acoes">
        ${feitos ? `<button class="btn btn-soft btn-lg" data-action="foco-registrar-tempo" data-tip="Lança o TEMPO desta sessão de prática (as questões já foram contadas uma a uma).">${icone("clock-3")} Registrar tempo</button>` : ""}
        <button class="btn btn-primary btn-lg" data-action="sair-foco">${icone("check")} Concluir</button>
      </div>
    </div>`;
}

// Atualiza o placar da sessão no lugar (sem re-render), após responder no foco.
function atualizarPlacarFoco(root, placar) {
  const vals = Object.values(placar);
  const acertos = vals.filter((v) => v === true).length;
  const erros = vals.filter((v) => v === false).length;
  const feitos = acertos + erros;
  const box = root.querySelector(".fq-placar");
  if (!box) return;
  const ok = box.querySelector(".fq-plc-ok");
  if (ok) ok.innerHTML = `${icone("check")} ${acertos}`;
  const er = box.querySelector(".fq-plc-err");
  if (er) er.innerHTML = `${icone("x")} ${erros}`;
  const pc = box.querySelector(".fq-plc-pct");
  if (pc) pc.textContent = feitos ? Math.round((acertos / feitos) * 100) + "%" : "—";
}

function printQuestoes(st, questoes, formato, comGab = true) {
  if (!questoes.length) return "<p>Nada para imprimir.</p>";
  return questoes
    .map((q, n) => {
      const topico = st.topicos.find((t) => t.id === q.topicoId);
      let corpo;
      if (formato === "ce") {
        corpo = `<div style="margin-top:4px">( ) Certo ( ) Errado${comGab ? ` <span class="gab">(gabarito: ${q.gabarito === 0 ? "Certo" : "Errado"})</span>` : ""}</div>${comGab && q.justificativa ? `<div class="print-meta">${esc(q.justificativa)}</div>` : ""}`;
      } else {
        const alts = q.alternativas.map((a, i) => `${letra(i)} ${esc(a)}${comGab && i === q.gabarito ? ' <span class="gab">(gabarito)</span>' : ""}`).join("<br>");
        corpo = `<div style="margin-top:4px">${alts}</div>`;
      }
      return `<div class="print-item">
        <div><b>${n + 1}.</b> ${esc(q.enunciado)}${q.referencia ? ` <span class="print-meta">[${esc(q.referencia)}]</span>` : ""}</div>
        ${corpo}
        <div class="print-meta">${topico ? esc(nomeTopico(st, topico)) : "sem tópico"}</div>
      </div>`;
    })
    .join("");
}

function letra(i) {
  return String.fromCharCode(65 + i) + ")";
}
function nomeTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
