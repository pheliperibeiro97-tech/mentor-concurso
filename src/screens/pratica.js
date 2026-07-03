// Tela de Prática de questões, em DOIS formatos (mesma estrutura):
//  • 'mc' = múltipla escolha (rota "pratica", título "Questões")
//  • 'ce' = Certo/Errado     (rota "pratica-ce", título "Questões C/E")
// Itens C/E são modelados como questão de 2 alternativas ["Certo","Errado"],
// então tentativas, Caderno de Erros e Acompanhamento funcionam igual.
import { bindActions, toast, header, seloBadge, vazio, imprimir, botaoImprimir, opcoesImpressao, avisoIA, confirmar, focarItem, explicacaoIAHTML, abrirJanela , plural } from "../ui.js";
import { esc, MOTIVOS_ERRO as MOTIVOS } from "../util.js";
import { icone } from "../icones.js";
import renderSimulado, { imprimirSimulado } from "./simulado.js";
import { addQuestoesBotaoHTML, addQuestoesPanelHTML, ligarAddQuestoesArquivo, addQuestoesHandlers, statusQuestao } from "./questoes-add.js";
import { filtroTopicosBotaoHTML, filtroTopicosPainelHTML, ligarFiltroTopicos, questaoNoFiltro } from "./questoes-filtro.js";

// Estado independente por formato (Questões e Questões C/E não se misturam).
function novoEstado() {
  return { subModo: "treino", filtroTop: { sel: [], aberto: false }, filtroStatus: "todas", addState: { aberto: false }, editandoId: null, refazer: new Set() };
}
const S = { mc: novoEstado(), ce: novoEstado() };

const TXT = {
  mc: {
    titulo: "Questões",
    sub: "Treine com gabarito imediato ou faça um simulado cronometrado",
    vazioTit: "Você ainda não tem questões",
    vazioSub: "Adicione, importe de uma prova, ou gere com a IA.",
    vazioIco: icone("notebook-pen"),
    vazioCta: "Adicionar questões",
  },
  ce: {
    titulo: "Questões C/E",
    sub: "Itens Certo ou Errado, com gabarito imediato ou simulado cronometrado",
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
  if (app.params && app.params.sub) {
    s.subModo = app.params.sub;
    app.params.sub = null;
  }
  // Deep-link de uma questão específica (vindo do Dossiê): força o modo Treino.
  if (app.params && app.params.focoQuestaoId) s.subModo = "treino";
  root.innerHTML = `
    ${header(TXT[formato].titulo, TXT[formato].sub, botaoImprimir())}
    <div class="subtabs">
      <button class="subtab ${s.subModo === "treino" ? "on" : ""}" data-sub="treino">${icone("square-pen")} Treino</button>
      <button class="subtab ${s.subModo === "simulado" ? "on" : ""}" data-sub="simulado">${icone("clock-3")} Simulado</button>
    </div>
    <div id="prat-body"></div>`;
  root.querySelectorAll("[data-sub]").forEach((b) =>
    b.addEventListener("click", () => {
      s.subModo = b.getAttribute("data-sub");
      app.refresh();
    })
  );
  root.querySelector('[data-action="imprimir"]')?.addEventListener("click", async () => {
    if (s.subModo === "simulado") return imprimirSimulado(app);
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
  if (s.subModo === "simulado") return renderSimulado(body, app, formato);
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

  const questoes = st.questoes
    .filter((q) => ehDoFormato(q, formato) && questaoNoFiltro(q, s.filtroTop.sel) && (s.filtroStatus === "todas" || statusQuestao(st, q) === s.filtroStatus))
    .sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || "")); // recém-criadas primeiro (padrão)
  const nErradas = st.questoes.filter((q) => ehDoFormato(q, formato) && statusQuestao(st, q) === "errei").length;
  // Há questões do formato, mas nenhuma passou no filtro atual? Então é um vazio de
  // filtro (não "não tem nada"): mostra mensagem orientando a ajustar os filtros.
  const totalFormato = st.questoes.filter((q) => ehDoFormato(q, formato)).length;

  const opcoesVincular = `<option value="">— sem tópico —</option>` + st.topicos.map((t) => `<option value="${t.id}">${esc(nomeTopico(st, t))}</option>`).join("");
  const editObj = s.editandoId ? st.questoes.find((q) => q.id === s.editandoId) : null;

  root.innerHTML = `
    <div class="barra-acoes">
      ${addQuestoesBotaoHTML(s.addState.aberto, formato)}
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

    ${totalFormato ? `<div class="plano-h"><h2>Suas questões</h2><span class="cnt">${questoes.length}</span><span class="sp"></span></div>` : ""}
    <div class="lista-questoes">
      ${
        questoes.length
          ? questoes.map((q) => questaoHTML(st, q, formato, s)).join("")
          : totalFormato
            ? vazio(`Nada nesse filtro\nNenhuma ${formato === "ce" ? "afirmação" : "questão"} corresponde à situação ou aos tópicos selecionados. Ajuste os filtros acima.`, "", icone("dices"))
            : vazioPratica(formato)
      }
    </div>`;

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
      if (t) toast(t.acertou ? "Acertou!" : "Errou. Registrado no caderno.", t.acertou ? "ok" : "erro");
    },
    refazer: (el) => {
      s.refazer.add(el.getAttribute("data-q"));
      app.refresh();
    },
    "salvar-duvida": (el) => {
      const tId = el.getAttribute("data-t");
      const v = root.querySelector(`#duv-${tId}`).value;
      store.setDuvida(tId, v);
      toast("Dúvida anotada.");
    },
    "comentar-ia": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Comentar o erro");
      el.disabled = true;
      toast("Analisando o erro com IA…");
      try {
        await store.comentarErroIA(el.getAttribute("data-t"));
        toast("Comentário da IA gerado.");
      } catch (e) {
        toast("Não consegui comentar o erro agora. Verifique a conexão e tente de novo.", "erro");
        el.disabled = false;
      }
    },
    "comentar-questao": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Comentar a questão");
      el.disabled = true;
      toast("A IA está comentando a questão…");
      try {
        await store.comentarQuestaoIA(el.getAttribute("data-q"));
        toast("Comentário gerado.");
      } catch (e) {
        toast("Não consegui comentar a questão agora. Verifique a conexão e tente de novo.", "erro");
        el.disabled = false;
      }
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
      feedback = `<div class="feedback ok">${icone("check")} Você acertou.</div>${justif}`;
      cardAcoes = `
        <div class="questao-rodape">
          <button class="btn btn-ia btn-sm" data-action="comentar-questao" data-q="${q.id}" data-tip-pos="cima-dir" data-tip="A IA explica o gabarito desta questão (com selo de origem).">${icone("sparkles")} Comentar com IA</button>
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
            <input id="duv-${ultima.id}" type="text" placeholder="Anotar dúvida ou observação..." value="${esc(ultima.duvida || "")}" title="Anote a dúvida ou uma observação sobre o erro." />
            <button class="btn btn-ghost btn-sm" data-action="salvar-duvida" data-t="${ultima.id}" data-tip-pos="cima-dir" data-tip="Salva a anotação neste erro (fica no Caderno de Erros).">Salvar</button>
            <button class="btn btn-ia btn-sm" data-action="comentar-ia" data-t="${ultima.id}" data-tip-pos="cima-dir" data-tip="A IA explica por que a resposta certa é a correta e onde você se confundiu (com selo de origem).">${icone("sparkles")} Comentar com IA</button>
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
      ${q.comentarioIA ? `<div class="ia-comentario"><span class="orb orb-xs" aria-hidden="true"></span>${seloBadge("amarelo")}<p>${esc(q.comentarioIA)}</p></div>` : ""}
    </div>`;
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
