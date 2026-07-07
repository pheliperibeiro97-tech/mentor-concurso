// Discursiva: pratique discursiva/redação com IA. Fluxo: a IA GERA uma pergunta
// (de um tópico, material ou tema livre) → você responde → a IA CORRIGE com feedback
// rico (o que deveria constar, o que faltou, o que errou, como melhorar), com busca
// na web opcional. Sem IA, ainda dá métricas estruturais offline.
import { bindActions, toast, header, seloBadge, vazio, confirmar, avisoIA, ligarDropZone, imprimir, botaoImprimir, opcoesImpressao, plural, revelarTexto } from "../ui.js";
import { esc, fmtData } from "../util.js";
import { icone } from "../icones.js";

let tipo = "discursiva";
let genFonte = "topico";
// Stream ("digitando") do feedback do Mentor só na 1ª pintura por sessão (não re-anima a cada refresh).
let feedbackRevelou = false;

const NOTA_CLS = { boa: "nota-boa", média: "nota-media", baixa: "nota-baixa" };

export default function renderCorrecao(root, app) {
  const { store } = app;
  const st = store.get();
  const iaOn = store.iaDisponivel();

  root.innerHTML = `
    ${header("Discursiva e redação", "Pratique com correção no nível de um examinador de banca.", botaoImprimir())}

    <div class="card correcao-form is-protagonista">
      <div class="form-row" style="align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:6px">
        <label class="inline">Tipo:
          <select id="gen-tipo">
            <option value="discursiva" ${tipo === "discursiva" ? "selected" : ""}>Discursiva</option>
            <option value="redacao" ${tipo === "redacao" ? "selected" : ""}>Redação</option>
          </select>
        </label>
        <span class="muted small">Escreva o <b>tema</b> e a <b>resposta</b> abaixo. Se preferir, a IA cria o tema para você.</span>
      </div>

      <div class="cor-tema-head">
        <label for="cor-enun" style="margin:0">Pergunta / tema</label>
        <button class="btn btn-ghost btn-sm" data-action="toggle-gen" data-tip="A IA cria um tema a partir de um tópico, de um material ou de um tema livre.">${icone("sparkles")} Criar tema com IA</button>
      </div>
      <textarea id="cor-enun" rows="3" placeholder="Escreva aqui o tema/enunciado…" style="margin-bottom:14px"></textarea>
      <div id="ia-gen-box" class="ia-gen-box" hidden>
        <div class="form-row" style="align-items:flex-end">
          <label>De onde
            <select id="gen-fonte">
              <option value="topico" ${genFonte === "topico" ? "selected" : ""}>Tópico do edital</option>
              <option value="material" ${genFonte === "material" ? "selected" : ""}>Material</option>
              <option value="livre" ${genFonte === "livre" ? "selected" : ""}>Tema livre</option>
            </select>
          </label>
          <label style="flex:1">Assunto <span id="gen-alvo-wrap">${alvoControl(genFonte, st)}</span></label>
          <button class="btn btn-ia" data-action="gerar-pergunta" style="margin-bottom:12px">Gerar tema</button>
        </div>
      </div>

      <label>Sua resposta
        <textarea id="cor-texto" rows="10" placeholder="Escreva aqui a sua resposta..."></textarea>
      </label>
      ${
        iaOn
          ? `<label class="btn btn-ghost btn-sm btn-file" data-tip-pos="cima-esq" data-tip="Tire/escolha uma foto da resposta manuscrita; a Visão transcreve para o campo acima.">${icone("camera")} Foto da resposta (manuscrita)
        <input id="cor-foto" type="file" accept=".jpg,.jpeg,.png,.webp,image/*" hidden />
      </label>`
          : ""
      }
      <div class="form-acoes" style="flex-wrap:wrap">
        <span class="muted" id="cor-contador">0 palavras</span>
        ${iaOn ? `<label class="inline small" title="A IA pesquisa na web para conferir fatos e atualidade"><input type="checkbox" id="cor-web" /> pesquisar na web</label>` : ""}
        <span class="spacer"></span>
        <button class="btn btn-ia" data-action="corrigir">${icone("sparkles")} Corrigir resposta</button>
      </div>
      <p class="muted small">${
        iaOn
          ? `IA conectada: <span data-tip="Avalia atendimento ao comando, conteúdo e base legal, estrutura, linguagem e nota — com o que faltou e como melhorar.">correção de <b>mérito</b>, no nível de um examinador.</span>`
          : `${seloBadge("amarelo")} Sem IA: só métricas estruturais offline. Conecte uma IA em Configurações para gerar temas e ter a correção de mérito.`
      }</p>
    </div>

    <div class="historico-correcoes">
      <div class="plano-h"><h2>Seu histórico</h2>${st.redacoes.length ? `<span class="cnt">${st.redacoes.length}</span>` : ""}<span class="sp"></span></div>
      ${
        st.redacoes.length
          ? [...st.redacoes].reverse().map((r) => correcaoHTML(r)).join("")
          : vazio("Sua primeira redação\nEscreva e peça a correção no nível de um examinador.", "", icone("square-pen"))
      }
    </div>`;

  const textoEl = root.querySelector("#cor-texto");
  const contador = root.querySelector("#cor-contador");
  textoEl.addEventListener("input", () => {
    const n = textoEl.value.trim() ? textoEl.value.trim().split(/\s+/).length : 0;
    contador.textContent = `${n} palavras`;
  });
  const fotoEl = root.querySelector("#cor-foto");
  if (fotoEl) {
    ligarDropZone(fotoEl, { zona: root.querySelector(".correcao-form") });
    fotoEl.addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      toast("Transcrevendo a foto com Visão…");
      try {
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(f);
        });
        const transc = await store.transcreverFoto(dataUrl, "manuscrito");
        const atual = textoEl.value.trim();
        textoEl.value = atual ? atual + "\n\n" + transc : transc;
        textoEl.dispatchEvent(new Event("input"));
        toast("Texto transcrito. Confira e ajuste antes de corrigir.", "ok");
      } catch (err) {
        toast("Não consegui ler a foto. Tente uma imagem mais nítida ou digite o texto.", "erro");
      } finally {
        e.target.value = "";
      }
    });
  }
  root.querySelector("#gen-tipo").addEventListener("change", (e) => (tipo = e.target.value));
  root.querySelector("#gen-fonte").addEventListener("change", (e) => {
    genFonte = e.target.value;
    root.querySelector("#gen-alvo-wrap").innerHTML = alvoControl(genFonte, st);
  });

  // Stream do feedback mais recente (o "digitando" do Mentor) na 1ª pintura por sessão:
  // revela o texto puro e, ao fim, restaura o HTML formatado (negrito/quebras). Respeita
  // reduced-motion (ativarCountUp/revelarTexto já cuidam disso).
  if (!feedbackRevelou) {
    const fbEl = root.querySelector(".cor-feedback-txt");
    if (fbEl) {
      const html = fbEl.innerHTML;
      revelarTexto(fbEl, fbEl.textContent, { cps: 40, aoFim: () => { fbEl.innerHTML = html; } });
      feedbackRevelou = true;
    }
  }

  bindActions(root, {
    // Modo comparativo: alterna sua resposta × correção da IA lado a lado (sem re-render).
    "cor-comparar": (el) => {
      const item = el.closest(".correcao-item");
      if (!item) return;
      const on = item.classList.toggle("modo-comparar");
      if (on) { const det = item.querySelector(".cor-resposta"); if (det) det.open = true; }
    },
    imprimir: async () => {
      if (!st.redacoes.length) return toast("Nenhuma correção para imprimir.", "erro");
      const op = await opcoesImpressao("Imprimir discursivas/redações", [
        { key: "texto", label: "Texto da resposta", opcoes: [{ v: "com", rot: "Com o texto da resposta" }, { v: "sem", rot: "Sem o texto (só tema, nota e correção)" }], def: "com" },
      ]);
      if (!op) return;
      imprimir("Discursiva e redação — Mentor Concurso", printRedacoes(st, op.texto === "com"));
    },
    "toggle-gen": (el) => {
      const box = root.querySelector("#ia-gen-box");
      const oculto = box.hasAttribute("hidden");
      if (oculto) box.removeAttribute("hidden");
      else box.setAttribute("hidden", "");
      el.textContent = oculto ? "Fechar gerador" : "Criar tema com IA";
    },
    "gerar-pergunta": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar pergunta discursiva");
      const fonte = root.querySelector("#gen-fonte").value;
      const alvoEl = root.querySelector("#gen-alvo");
      const alvo = alvoEl ? alvoEl.value : "";
      if ((fonte === "topico" || fonte === "material") && !alvo) return toast("Escolha o assunto.", "erro");
      if (fonte === "livre" && !alvo.trim()) return toast("Digite um tema livre.", "erro");
      el.disabled = true;
      toast("Gerando pergunta com IA…");
      try {
        const enun = await store.gerarPerguntaDiscursiva({ fonte, alvo, tipo });
        root.querySelector("#cor-enun").value = enun;
        textoEl.focus();
        toast("Pergunta gerada. Agora escreva sua resposta.");
      } catch (e) {
        toast("Não consegui gerar o tema agora. Verifique a conexão e tente de novo.", "erro");
      } finally {
        el.disabled = false;
      }
    },
    corrigir: async (el) => {
      const texto = textoEl.value.trim();
      const enun = root.querySelector("#cor-enun").value;
      if (texto.split(/\s+/).filter(Boolean).length < 10) return toast("Escreva uma resposta com ao menos 10 palavras.", "erro");
      const web = root.querySelector("#cor-web")?.checked || false;
      el.disabled = true;
      toast(store.iaDisponivel() ? (web ? "Corrigindo com IA + busca web…" : "Corrigindo com IA…") : "Analisando estrutura (offline)…");
      try {
        await store.corrigirRedacao({ tipo, enunciado: enun, texto, web });
        toast("Resposta corrigida. Veja a análise abaixo.");
      } catch (e) {
        toast("Não consegui corrigir agora. Verifique a conexão e tente de novo.", "erro");
        el.disabled = false;
      }
    },
    "cor-flashcard": (el) => {
      const r = store.get().redacoes.find((x) => x.id === el.getAttribute("data-id"));
      if (!r || !r.enunciado.trim()) return toast("Esta correção não tem pergunta para virar flashcard.", "erro");
      const fb = r.correcao.feedbackIA && r.correcao.feedbackIA.texto;
      const verso = fb || "Sua resposta: " + (r.texto || "").slice(0, 500);
      store.addFlashcard({ frente: r.enunciado, verso, selo: "amarelo", fonte: { tipo: "discursiva", titulo: "Discursiva (IA)" } });
      toast("Flashcard criado (veja em Flashcards). Edite o verso se quiser.");
    },
    "cor-erro": (el) => {
      const r = store.get().redacoes.find((x) => x.id === el.getAttribute("data-id"));
      if (!r) return;
      const fb = (r.correcao.feedbackIA && r.correcao.feedbackIA.texto) || "";
      store.addErroManual({
        descricao: `[Discursiva] ${r.enunciado || "tema livre"}`,
        correto: "",
        suaResposta: (r.texto || "").slice(0, 600),
        comentario: fb,
        motivoErro: null,
        topicoId: null,
        disciplinaId: null,
      });
      toast("Registrado no Caderno de Erros.");
    },
    "del-cor": async (el) => {
      if (await confirmar("Excluir esta correção?")) {
        store.removerRedacao(el.getAttribute("data-id"));
        toast("Correção excluída.");
      }
    },
  });
}

// Controle de "assunto" conforme a fonte: select de tópicos/materiais, ou texto livre.
function alvoControl(fonte, st) {
  if (fonte === "material") {
    const ops = st.documentos.map((d) => `<option value="${d.id}">${esc(d.titulo)}</option>`).join("");
    return `<select id="gen-alvo">${ops || `<option value="">(importe um material primeiro)</option>`}</select>`;
  }
  if (fonte === "topico") {
    const ops = st.topicos
      .map((t) => {
        const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
        return `<option value="${t.id}">${esc((d ? d.nome + " · " : "") + t.nome)}</option>`;
      })
      .join("");
    return `<select id="gen-alvo">${ops || `<option value="">(cadastre o edital primeiro)</option>`}</select>`;
  }
  return `<input id="gen-alvo" type="text" placeholder="Ex.: princípio da insignificância" />`;
}

function printRedacoes(st, comTexto = true) {
  if (!st.redacoes.length) return "<p>Nenhuma correção.</p>";
  return [...st.redacoes]
    .reverse()
    .map((r) => {
      const c = r.correcao;
      const fb = (c.feedbackIA && c.feedbackIA.texto) || c.comentarioIA || "";
      const nota = c.nota != null && c.nota !== "" ? ` · Nota: ${esc(String(c.nota))}` : "";
      return `<div class="print-item">
        <div class="print-meta">${r.tipo === "redacao" ? "Redação" : "Discursiva"} · ${fmtData(r.data)} · ${c.palavras} palavras${nota}</div>
        ${r.enunciado ? `<div><b>Tema:</b> ${esc(r.enunciado)}</div>` : ""}
        ${comTexto && r.texto ? `<div style="margin-top:4px"><b>Resposta:</b> ${esc(r.texto)}</div>` : ""}
        ${fb ? `<div style="margin-top:4px"><b>Correção:</b> ${esc(fb)}</div>` : ""}
      </div>`;
    })
    .join("");
}

function correcaoHTML(r) {
  const c = r.correcao;
  // markdown leve: **negrito** e quebras de linha.
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\r?\n/g, "<br>");
  const fb = c.feedbackIA;
  const fontes =
    fb && fb.fontesWeb && fb.fontesWeb.length
      ? `<div class="chat-web-fontes"><b class="muted small">${icone("globe")} Fontes da web:</b>${fb.fontesWeb
          .slice(0, 6)
          .map((f) => `<a href="${esc(f.uri)}" target="_blank" rel="noopener">${esc(f.titulo)}</a>`)
          .join("")}</div>`
      : "";
  const fbTxt = fb && fb.texto ? fb.texto : c.comentarioIA;
  return `
    <div class="card correcao-item">
      <div class="cor-head">
        <span class="mini-tag">${r.tipo === "redacao" ? "Redação" : "Discursiva"}</span>
        <span class="cor-nota-tag" data-tip="Nota geral atribuída à resposta.">${seloBadge(c.selo)} ${esc(c.nota)}</span>
        <span class="spacer"></span>
        <span class="muted small">${fmtData(r.data)}</span>
        ${r.texto && fbTxt ? `<button class="lnk cor-comparar-btn" data-action="cor-comparar" data-tip-pos="cima-dir" data-tip="Ver sua resposta e a correção lado a lado (clique de novo para empilhar).">${icone("arrow-left-right")} Comparar</button>` : ""}
        <details class="doc-mais">
          <summary data-tip-pos="cima-dir" data-tip="Mais ações">${icone("ellipsis")}</summary>
          <div class="doc-mais-pop">
            <button class="lnk" data-action="cor-erro" data-id="${r.id}"><span class="menu-ico">${icone("flag")}</span> Caderno de Erros</button>
            <div class="menu-sep"></div>
            <button class="lnk menu-item-danger" data-action="del-cor" data-id="${r.id}"><span class="menu-ico">${icone("x")}</span> Excluir</button>
          </div>
        </details>
      </div>
      ${r.enunciado ? `<div class="cor-enun-txt">${esc(r.enunciado)}</div>` : ""}
      <div class="cor-corpo">
      ${
        r.texto
          ? `<details class="cor-resposta"><summary>${icone("file-text")} Sua resposta (${c.palavras} palavra${c.palavras === 1 ? "" : "s"})</summary><div class="cor-resposta-txt">${esc(r.texto)}</div></details>`
          : ""
      }
      ${
        fbTxt
          ? `<blockquote class="cor-feedback">
              <span class="cor-feedback-selo" data-tip="Correção feita pela IA, no nível de um examinador."><span class="orb orb-sm" aria-hidden="true"></span></span>
              <div class="cor-feedback-txt">${md(fbTxt)}</div>${fontes}
            </blockquote>`
          : ""
      }
      </div>
      <details class="cor-metricas">
        <summary>${c.palavras} palavras · ${plural(c.paragrafos, "parágrafo", "parágrafos")} · ${plural(c.frases, "frase", "frases")} · ver métricas</summary>
        <div class="cor-criterios">
          ${c.criterios
            .map(
              (cr) => `
            <div class="criterio">
              <div class="criterio-top">
                <span class="criterio-nome">${esc(cr.criterio)}</span>
                <span class="criterio-nota ${NOTA_CLS[cr.nota] || ""}">${esc(cr.nota)}</span>
              </div>
              <div class="criterio-obs">${esc(cr.obs)}</div>
            </div>`
            )
            .join("")}
        </div>
      </details>
    </div>`;
}
