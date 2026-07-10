// Revisão de tópico (dir.2): curva do esquecimento do CONTEÚDO estudado (24h/7d/30d...).
// Releitura/recordação das palavras-chave do tópico, com botões graduados (Esqueci/
// Lembrei/Fácil) que movem a escada [1,7,15,30,60,120] — generaliza a "memória" de lei/juris.
import { bindActions, toast, header, vazio, confirmar, avisoIA, pedirNumero, plural, revelarTexto, comOcupado, md } from "../ui.js";
import { esc, fmtData, todayISO, daysBetween } from "../util.js";
import { icone } from "../icones.js";
import { abrirVisualizadorPdf } from "../pdfviewer.js";

let ativo = null; // topicoId em revisão (fluxo aberto)
let modo = null; // "escrever" (active recall) | "reler" (releitura rápida)
let revelado = false; // no modo escrever, já revelou o conteúdo para autoconferência?
let recallFeedback = null; // feedback da IA sobre o brain-dump
let avaliando = false; // chamada de IA em andamento
let braindumpTexto = ""; // preserva o texto digitado entre re-renders
let feedbackFalou = false; // stream do feedback da IA só 1x quando ele chega (não re-digita a cada re-render)

export default function renderRevTopico(root, app) {
  const { store } = app;
  const st = store.get();
  const vencidas = store.revisoesTopicoVencidas();
  const proximas = store.proximasRevisoesTopico();
  const optIn = !!st.config.revisaoTopicoAuto;

  // Fluxo de revisão aberto?
  if (ativo) {
    const topico = st.topicos.find((t) => t.id === ativo);
    if (!topico) {
      ativo = null;
      app.refresh();
      return;
    }
    root.innerHTML = header("Revisão de Tópicos", "Revisão espaçada do conteúdo que você estudou (curva do esquecimento)") + reviewHTML(store, topico);
    bindReview(root, app, store, topico);
    // A IA "fala": revela o feedback com efeito de digitação (1x quando ele chega; respeita
    // reduced-motion). Preserva a formatação (negrito/quebras) restaurando o HTML ao final.
    const corpoEl = root.querySelector(".revtop-feedback-corpo");
    if (corpoEl && recallFeedback && !feedbackFalou) {
      const htmlFinal = corpoEl.innerHTML;
      revelarTexto(corpoEl, corpoEl.textContent, { cps: 220, aoFim: () => { corpoEl.innerHTML = htmlFinal; } });
      feedbackFalou = true;
    }
    return;
  }

  root.innerHTML = `
    ${header("Revisão de Tópicos", "Revisão espaçada do conteúdo que você estudou (curva do esquecimento)")}

    <details class="ed-ajuda">
      <summary>Como funciona a revisão de tópicos?</summary>
      <div class="ed-ajuda-corpo">
        <p><b>O que é:</b> diferente dos flashcards (que testam fatos pontuais), aqui você revisa o <b>tópico inteiro</b> que estudou, para não esquecer o que já viu (a "curva do esquecimento").</p>
        <p><b>Em que consiste:</b> cada tópico estudado reaparece em intervalos que crescem a cada acerto (24h, 7, 15, 30, 60, 120 dias). É manutenção, não conta como nova cobertura do edital.</p>
        <p><b>O que você faz:</b> escolhe <b>${icone("eye")} só reler</b> as palavras-chave do tópico, ou <b>${icone("square-pen")} escrever de memória</b> o que lembra (recordação ativa) e revelar para conferir.</p>
        <p style="margin-bottom:0"><b>Ao final:</b> você marca <b>Esqueci / Lembrei / Fácil</b> e o app reagenda sozinho — <i>Esqueci</i> reinicia em 24h, <i>Lembrei</i> sobe um degrau, <i>Fácil</i> sobe dois.</p>
      </div>
    </details>

    ${
      !optIn
        ? `<section class="card aviso-optin">
            <p style="margin:0 0 8px"><b>Revisão automática de tópicos está desligada.</b></p>
            <p class="muted small" style="margin:0 0 10px">Quando ligada, cada tópico que você <b>estudar</b> entra na curva do esquecimento (revisão em 24h, depois 7, 15, 30 dias...). Você revisa relendo as palavras-chave ou escrevendo o que lembra.</p>
            <button class="btn btn-primary btn-sm" data-action="ativar-optin">Ligar revisão automática</button>
          </section>`
        : ""
    }

    <section class="card revtop-hoje">
      <div class="plano-h"><h2>Para revisar hoje</h2>${vencidas.length ? `<span class="cnt">${vencidas.length}</span>` : ""}</div>
      ${
        vencidas.length
          ? `<ul class="revtop-lista">
              ${vencidas
                .map(({ rev, topico }) => {
                  const atraso = daysBetween(rev.proxima, todayISO());
                  return `<li class="revtop-item">
                    <div class="revtop-corpo">
                      <span class="revtop-nome">${esc(nomeTopico(st, topico))}</span>
                      <span class="muted small">${escadaLabel(rev.intervalo)}${atraso > 0 ? ` · atrasada ${plural(atraso, "dia", "dias")}` : ""}</span>
                    </div>
                    <div class="revtop-acoes">
                      <button class="btn btn-primary btn-sm" data-action="revisar" data-id="${topico.id}">Revisar</button>
                      <button class="mover-btn" data-action="cancelar" data-id="${topico.id}" data-tip-pos="cima-dir" data-tip="Tirar este tópico da curva de revisão">${icone("x")}</button>
                    </div>
                  </li>`;
                })
                .join("")}
            </ul>`
          : vazio("Tudo em dia por aqui!\nNenhum tópico vencido para revisar agora. Continue estudando que eles voltam na hora certa.", "", icone("party-popper"))
      }
    </section>

    ${
      proximas.length
        ? `<details class="card revtop-agendadas">
            <summary>${icone("calendar")} Agendadas <span class="revtop-contador revtop-contador-soft">${proximas.length}</span></summary>
            <ul class="lista-simples">
              ${proximas
                .map(({ rev, topico }) => {
                  const dif = daysBetween(todayISO(), rev.proxima);
                  const quando = dif === 1 ? "amanhã" : `em ${dif} dias`;
                  return `<li>${esc(nomeTopico(st, topico))} <span class="muted">· ${fmtData(rev.proxima)} (${quando}) · ${escadaLabel(rev.intervalo)}</span></li>`;
                })
                .join("")}
            </ul>
          </details>`
        : ""
    }`;

  bindActions(root, {
    "ativar-optin": () => {
      store.setConfig({ revisaoTopicoAuto: true });
      toast("Revisão automática de tópicos ligada.");
    },
    // Abre o material no PDF na página que o usuário registrou na sessão (sincronia página↔revisão).
    "abrir-pag-registrada": (el) => {
      const d = store.get().documentos.find((x) => x.id === el.getAttribute("data-id"));
      const pag = parseInt(el.getAttribute("data-pag"), 10) || 1;
      if (d && d.pdfData) abrirVisualizadorPdf(d.pdfData, d.titulo, pag);
      else toast("O PDF deste material não está disponível.", "erro");
    },
    revisar: (el) => {
      ativo = el.getAttribute("data-id");
      modo = null;
      revelado = false;
      recallFeedback = null;
      avaliando = false;
      braindumpTexto = "";
      app.refresh();
    },
    cancelar: async (el) => {
      if (await confirmar("Tirar este tópico da curva de revisão?")) store.cancelarRevisaoTopico(el.getAttribute("data-id"));
    },
  });
}

// ---- Fluxo de revisão de UM tópico ----
function reviewHTML(store, topico) {
  const st = store.get();
  const material = store.palavrasParaReler(topico.id);
  // Se a revisão veio da PÁGINA REGISTRADA na sessão, oferece abrir o PDF exatamente naquela página.
  const abrirPag = material && material.docId && material.pagina && (st.documentos.find((d) => d.id === material.docId) || {}).pdfData
    ? `<button class="lnk" data-action="abrir-pag-registrada" data-id="${material.docId}" data-pag="${material.pagina}" data-tip="Abre o material no PDF, na página que você registrou.">${icone("file-text")} abrir na pág. ${material.pagina}</button>`
    : "";
  const conteudo = material
    ? `<div class="revtop-fonte muted small">${esc(material.fonte)} ${abrirPag}</div>
       <div class="revtop-conteudo">${esc(material.texto).replace(/\n/g, "<br>")}</div>`
    : `<div class="revtop-sem-fonte">
        <p class="muted" style="margin:0 0 10px">Este tópico ainda não tem um resumo para reler. Você pode avaliar de memória pelos botões abaixo, ou criar um resumo agora para usar nas próximas revisões.</p>
        <button class="btn btn-ghost btn-sm" data-action="criar-resumo">${icone("square-pen")} Criar resumo deste tópico</button>
      </div>`;

  // Escolha do modo (releitura × active recall).
  const escolherModo = `
    <div class="revtop-modos">
      <button class="revtop-modo ${modo === "reler" ? "on" : ""}" data-action="modo-reler" data-tip="Releitura rápida das palavras-chave (bom para dias cansados).">${icone("eye")} Só reler as palavras-chave</button>
      <button class="revtop-modo ${modo === "escrever" ? "on" : ""}" data-action="modo-escrever" data-tip="Escreva o que lembra ANTES de ver (recordação ativa — mais eficaz).">${icone("square-pen")} Escrever o que lembro</button>
    </div>`;

  let painel = "";
  if (modo === "reler") {
    painel = `<div class="revtop-painel">${conteudo}</div>`;
  } else if (modo === "escrever") {
    const iaOn = store.iaDisponivel();
    painel = `<div class="revtop-painel">
      <label class="revtop-braindump-label">Escreva, de memória, o que você lembra deste tópico:
        <textarea id="revtop-braindump" rows="6" placeholder="Despeje tudo o que vier à cabeça, sem consultar...">${esc(braindumpTexto)}</textarea>
      </label>
      <div class="revtop-bd-acoes">
        ${revelado ? "" : `<button class="btn btn-ghost btn-sm" data-action="revelar">Revelar conteúdo para conferir ${icone("arrow-right")}</button>`}
        <button class="btn btn-ghost btn-sm" data-action="avaliar-ia" ${avaliando ? "disabled" : ""} data-tip="${iaOn ? "A IA compara o que você escreveu com o conteúdo e dá um feedback do que acertou e faltou." : "Conecte a IA nas Configurações para usar (opcional)."}">${avaliando ? "Avaliando…" : "Avaliar com IA"}</button>
      </div>
      ${
        recallFeedback
          ? `<div class="revtop-feedback">
              <div class="revtop-feedback-titulo"><span class="orb orb-sm" aria-hidden="true"></span> <span class="txt-ia">Avaliação da IA</span> <span class="selo selo-amarelo">${icone("bot")} confira</span></div>
              <div class="revtop-feedback-corpo">${mdLeve(recallFeedback)}</div>
              <div class="revtop-export">
                <span class="muted small">Aproveitar esta revisão:</span>
                <button class="lnk" data-action="exp-resumo" data-tip-pos="cima-esq" data-tip="Salvar um resumo com o que você escreveu + a avaliação.">${icone("file-text")} Resumo</button>
                <button class="lnk" data-action="exp-erro" data-tip-pos="cima-esq" data-tip="Registrar no Caderno de Erros os pontos que faltaram.">${icone("flag")} Caderno de Erros</button>
                <button class="lnk" data-action="exp-flashcards" data-tip-pos="cima-esq" data-tip="Gerar flashcards (IA) do conteúdo deste tópico.">${icone("layers")} Flashcards</button>
                <button class="lnk" data-action="exp-questoes" data-tip-pos="cima-esq" data-tip="Gerar questões (IA) do conteúdo deste tópico.">${icone("notebook-pen")} Questões</button>
              </div>
            </div>`
          : ""
      }
      ${
        revelado
          ? `<div class="revtop-revelado">
              <div class="revtop-revelado-titulo">Conteúdo de referência:</div>
              ${conteudo}
            </div>`
          : ""
      }
    </div>`;
  }

  const podeAvaliar = modo === "reler" || (modo === "escrever" && (revelado || recallFeedback));
  const botoes = `
    <div class="revtop-graduado ${podeAvaliar ? "" : "revtop-graduado-off"}">
      <span class="muted small">Quanto você lembrou?</span>
      <button class="btn-grad bg-esqueci" data-action="nota" data-r="esqueci" ${podeAvaliar ? "" : "disabled"} data-tip="Reinicia a curva (revisa de novo em 24h).">Esqueci</button>
      <button class="btn-grad bg-lembrei" data-action="nota" data-r="lembrei" ${podeAvaliar ? "" : "disabled"} data-tip="Sobe um degrau na escada.">Lembrei</button>
      <button class="btn-grad bg-facil" data-action="nota" data-r="facil" ${podeAvaliar ? "" : "disabled"} data-tip="Sobe dois degraus (consolidando rápido).">Fácil</button>
    </div>`;

  return `
    <section class="card revtop-review">
      <div class="revtop-review-head">
        <div>
          <div class="muted small">Revisando o tópico</div>
          <h3 style="margin:2px 0 0">${esc(nomeTopico(st, topico))}</h3>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="voltar">${icone("arrow-left")} Voltar</button>
      </div>
      ${escolherModo}
      ${painel}
      ${modo ? botoes : ""}
    </section>`;
}

function bindReview(root, app, store, topico) {
  bindActions(root, {
    voltar: () => {
      ativo = null;
      modo = null;
      revelado = false;
      recallFeedback = null;
      braindumpTexto = "";
      app.refresh();
    },
    "modo-reler": () => {
      modo = "reler";
      revelado = false;
      app.refresh();
    },
    "modo-escrever": () => {
      modo = "escrever";
      revelado = false;
      app.refresh();
    },
    revelar: () => {
      braindumpTexto = root.querySelector("#revtop-braindump")?.value || "";
      revelado = true;
      app.refresh();
    },
    "avaliar-ia": async () => {
      const texto = (root.querySelector("#revtop-braindump")?.value || "").trim();
      braindumpTexto = texto;
      if (!texto) return toast("Escreva o que você lembra antes de avaliar.", "erro");
      if (!store.iaDisponivel()) return avisoIA(app, "Avaliar recordação com IA");
      avaliando = true;
      app.refresh();
      try {
        const res = await store.avaliarRecallTopico(topico.id, texto);
        recallFeedback = res.texto;
        feedbackFalou = false; // novo feedback chegou → libera o stream (1x)
      } catch (e) {
        toast("Não consegui avaliar a sua recordação agora. Tente de novo em instantes.", "erro");
      }
      avaliando = false;
      app.refresh();
    },
    "criar-resumo": () => {
      braindumpTexto = root.querySelector("#revtop-braindump")?.value || "";
      app.navigate("resumos", { novoResumoTopico: topico.id });
    },
    // Exportações a partir da revisão: consideram TÓPICO + resposta da IA (+ o que o aluno lembrou).
    "exp-resumo": () => {
      const html =
        `<p><b>O que lembrei:</b></p><p>${esc(braindumpTexto) || "<i>(não escrito)</i>"}</p>` +
        `<p><b>Avaliação da IA:</b></p><div>${mdLeve(recallFeedback || "")}</div>`;
      store.addResumo({ titulo: `Revisão — ${topico.nome}`, conteudoHTML: html, topicoId: topico.id });
      toast("Resumo criado a partir da revisão.");
    },
    "exp-erro": () => {
      const ref = store.palavrasParaReler(topico.id);
      store.addErroManual({
        topicoId: topico.id,
        descricao: `Revisão do tópico "${topico.nome}": pontos a reforçar (recordação incompleta).`,
        correto: ref ? ref.texto : "",
        comentario: recallFeedback || "",
        motivoErro: "Esqueci",
      });
      toast("Registrado no Caderno de Erros.");
    },
    "exp-flashcards": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar flashcards");
      const r = await pedirNumero("Quantos flashcards a IA deve gerar?", { padrao: 5, min: 1, max: 30, nivel: true });
      if (!r) return;
      const { n, dificuldade } = r;
      const rot = `do tópico «${(topico.nome || "tópico").slice(0, 40)}»`;
      const lote = store.iniciarLoteGeracao(rot);
      const cs = await comOcupado(() => store.gerarFlashcardsDeTopico(topico.id, fonteExport(store, topico), n, dificuldade), { botao: el, msg: "Gerando flashcards (tópico + avaliação)…" });
      store.encerrarLoteGeracao();
      if (cs == null) return;
      toast(`${plural(cs.length, "flashcard criado", "flashcards criados")}.`);
      if (cs.length) app.navigate("flashcards", { lote, loteRotulo: rot });
    },
    "exp-questoes": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar questões");
      const r = await pedirNumero("Quantas questões a IA deve gerar?", { padrao: 3, min: 1, max: 30, nivel: true });
      if (!r) return;
      const { n, dificuldade } = r;
      const rot = `do tópico «${(topico.nome || "tópico").slice(0, 40)}»`;
      const lote = store.iniciarLoteGeracao(rot);
      const qs = await comOcupado(() => store.gerarQuestoesDeTopico(topico.id, fonteExport(store, topico), n, dificuldade), { botao: el, msg: "Gerando questões (tópico + avaliação)…" });
      store.encerrarLoteGeracao();
      if (qs == null) return;
      toast(`${plural(qs.length, "questão criada", "questões criadas")}.`);
      if (qs.length) app.navigate("pratica", { lote, loteRotulo: rot });
    },
    nota: (el) => {
      const r = el.getAttribute("data-r");
      const dias = store.revisarTopico(topico.id, r);
      ativo = null;
      modo = null;
      revelado = false;
      recallFeedback = null;
      braindumpTexto = "";
      const quando = dias === 1 ? "amanhã" : `em ${dias} dias`;
      toast(r === "esqueci" ? `Curva reiniciada: revisa de novo ${quando}.` : `Boa! Próxima revisão ${quando}.`);
    },
  });

  // Preserva o texto do brain-dump entre re-renders (ex.: ao mostrar "Avaliando…").
  root.querySelector("#revtop-braindump")?.addEventListener("input", (e) => {
    braindumpTexto = e.target.value;
  });
}

// Fonte para gerar flashcards/questões: TÓPICO + conteúdo de referência + o que o aluno
// lembrou + a avaliação da IA (o usuário pediu considerar "tópico + resposta da IA").
function fonteExport(store, topico) {
  const ref = store.palavrasParaReler(topico.id);
  const partes = [`Tópico: ${topico.nome}`];
  if (ref && ref.texto) partes.push(`Conteúdo de referência:\n${ref.texto}`);
  if (braindumpTexto) partes.push(`O que o aluno lembrou:\n${braindumpTexto}`);
  if (recallFeedback) partes.push(`Avaliação da IA (o que faltou/corrigir):\n${recallFeedback}`);
  return partes.join("\n\n");
}

// Markdown leve: **negrito** + quebras de linha (para o feedback da IA).
const mdLeve = (txt) => md(txt); // usa o renderizador único (negrito/itálico/###/listas/código)

function escadaLabel(intervalo) {
  const map = { 1: "24h", 7: "7 dias", 15: "15 dias", 30: "30 dias", 60: "60 dias", 120: "120 dias" };
  return `degrau ${map[intervalo] || intervalo + "d"}`;
}

function nomeTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
