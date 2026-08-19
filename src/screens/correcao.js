// Discursiva: pratique discursiva/redação com IA. Fluxo: a IA GERA uma pergunta
// (de um tópico, material ou tema livre) → você responde → a IA CORRIGE com feedback
// rico (o que deveria constar, o que faltou, o que errou, como melhorar), com busca
// na web opcional. Sem IA, ainda dá métricas estruturais offline.
import { bindActions, toast, header, seloBadge, vazio, confirmar, avisoIA, ligarDropZone, imprimir, botaoImprimir, opcoesImpressao, plural, revelarTexto, comOcupado, md, campoMaterialHTML, ligarCampoMaterial } from "../ui.js";
import { esc, fmtData } from "../util.js";
import { icone } from "../icones.js";
import { setModo as setModoCrono, setTarget as setTargetCrono, iniciar as iniciarCrono } from "../cronometro.js";

let tipo = "discursiva";
let genFonte = null; // null = automático pelo contexto (ver fonteEfetiva)
// Rascunho persistente: tema e resposta sobrevivem a qualquer app.refresh() (sync,
// ação em outra tela) — antes as textareas voltavam VAZIAS e apagavam a dissertação
// em progresso. Limpo após correção bem-sucedida.
let rascunho = { enun: "", texto: "" };
// Stream ("digitando") do feedback do Mentor só na 1ª pintura por sessão (não re-anima a cada refresh).
let feedbackRevelou = false;

const NOTA_CLS = { boa: "nota-boa", média: "nota-media", baixa: "nota-baixa" };
const ROTULO_TIPO = {
  discursiva: "Discursiva",
  redacao: "Redação",
  "sentenca-civel": "Sentença cível",
  "sentenca-criminal": "Sentença criminal",
};

export default function renderCorrecao(root, app) {
  const { store } = app;
  const st = store.get();
  const iaOn = store.iaDisponivel();
  const contaPalavras = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
  const ehSentenca = tipo === "sentenca-civel" || tipo === "sentenca-criminal";
  // `genFonte === null` = usuário ainda não escolheu; o app decide pelo contexto. Havendo
  // texto no campo, o padrão é partir DELE (foi o que a pessoa escreveu). Assim que ela
  // escolhe outra origem, a escolha manda e o automático não volta a interferir.
  const temBrief = Boolean(rascunho.enun.trim());
  const fonteEfetiva = genFonte || (temBrief ? "escrito" : "topico");

  root.innerHTML = `
    ${header("Escrita", "Discursiva, redação e sentença — com correção no nível de um examinador de banca.", botaoImprimir())}

    <div class="card correcao-form is-protagonista">
      <div class="form-row u-flex-12 u-wrap u-mb-8">
        <label class="inline">Tipo:
          <select id="gen-tipo">
            <option value="discursiva" ${tipo === "discursiva" ? "selected" : ""}>Discursiva</option>
            <option value="redacao" ${tipo === "redacao" ? "selected" : ""}>Redação</option>
            <option value="sentenca-civel" ${tipo === "sentenca-civel" ? "selected" : ""}>Sentença cível</option>
            <option value="sentenca-criminal" ${tipo === "sentenca-criminal" ? "selected" : ""}>Sentença criminal</option>
          </select>
        </label>
        <span class="muted small">${
          ehSentenca
            ? "O enunciado é um <b>caso</b> com as peças do processo. A correção vem por <b>itens esperados</b>, como o espelho da banca."
            : "Escreva o <b>tema</b> e a <b>resposta</b> abaixo. Se preferir, a IA cria o tema para você."
        }</span>
        ${
          ehSentenca
            ? `<button class="btn btn-ghost btn-sm u-ml-auto" data-action="cronometrar-prova" data-tip="Começa o cronômetro com o tempo da prova real (4 h por sentença, no TJSP). Ele fica no relógio flutuante.">${icone("alarm-clock")} Cronometrar 4 h</button>`
            : ""
        }
      </div>

      <div class="cor-tema-head">
        <label for="cor-enun" class="u-m-0">${ehSentenca ? "Caso concreto (peças do processo)" : "Pergunta / tema"}</label>
        <button class="btn btn-ghost btn-sm" data-action="toggle-gen" data-tip="${ehSentenca ? "A IA monta um caso completo, com as peças e as teses a enfrentar." : "A IA cria um tema a partir de um tópico, de um material, de um tema que você digitar ou aleatório."}">${
          // Com texto no campo, o rótulo anuncia que a IA parte DELE — senão a opção
          // "O que eu escrevi acima" ficaria escondida atrás de um botão que promete
          // "criar", palavra que sugere jogar fora o que já está escrito.
          temBrief
            ? `${icone("sparkles")} Gerar a partir do que escrevi`
            : `${icone("x")} Fechar gerador`
        }</button>
      </div>
      <textarea id="cor-enun" rows="${ehSentenca ? 8 : 3}" placeholder="${ehSentenca ? "Cole aqui o caso da prova (ou peça à IA para criar um)…" : "Escreva aqui o tema/enunciado…"}" class="u-mb-16">${esc(rascunho.enun)}</textarea>
      <div id="ia-gen-box" class="ia-gen-box"${rascunho.enun.trim() ? " hidden" : ""}>
        <div class="form-row u-items-end">
          <label>De onde
            <select id="gen-fonte">
              ${
                // Só aparece quando há texto no campo — e aí é o padrão, porque quem
                // escreveu quer partir dali, não de um seletor.
                temBrief
                  ? `<option value="escrito" ${fonteEfetiva === "escrito" ? "selected" : ""}>O que eu escrevi acima</option>`
                  : ""
              }
              <option value="topico" ${fonteEfetiva === "topico" ? "selected" : ""}>Tópico do edital</option>
              <option value="material" ${fonteEfetiva === "material" ? "selected" : ""}>Material</option>
              <option value="livre" ${fonteEfetiva === "livre" ? "selected" : ""}>${ehSentenca ? "Matéria que eu digitar" : "Tema livre"}</option>
              <option value="aleatorio" ${fonteEfetiva === "aleatorio" ? "selected" : ""}>Aleatório</option>
            </select>
          </label>
          <label class="u-grow">${ehSentenca ? "Matéria" : "Assunto"} <span id="gen-alvo-wrap">${alvoControl(fonteEfetiva, st, ehSentenca)}</span></label>
          <button class="btn btn-ia u-mb-12" data-action="gerar-pergunta">${ehSentenca ? "Gerar caso" : "Gerar tema"}</button>
        </div>
      </div>

      <label>Sua resposta
        <textarea id="cor-texto" rows="10" placeholder="Escreva aqui a sua resposta...">${esc(rascunho.texto)}</textarea>
      </label>
      ${
        iaOn
          ? `<label class="btn btn-ghost btn-sm btn-file" data-tip-pos="cima-esq" data-tip="Fotografe a resposta escrita à mão — várias folhas de uma vez, ou o PDF exportado do tablet. A Visão transcreve tudo, na ordem, para o campo acima.">${icone("camera")} Foto da resposta (manuscrita)
        <input id="cor-foto" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf" multiple hidden />
      </label>`
          : ""
      }
      <div class="form-acoes u-wrap">
        <span class="muted" id="cor-contador">${contaPalavras(rascunho.texto)} palavras</span>
        ${iaOn ? `<label class="inline small" data-tip="A IA pesquisa na web para conferir fatos e atualidade"><input type="checkbox" id="cor-web" /> pesquisar na web</label>` : ""}
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
          : vazio(
              ehSentenca
                ? "Sua primeira sentença\nEscreva e receba a correção por itens esperados, como no espelho da banca."
                : "Sua primeira redação\nEscreva e peça a correção no nível de um examinador.",
              // CTA: dispara a MESMA ação do gerador ("gerar-pergunta" lê #gen-fonte/#gen-alvo,
              // que existem no formulário acima mesmo com o box fechado) e preenche o tema.
              `<button class="btn btn-ia" data-action="gerar-pergunta">${icone("sparkles")} ${ehSentenca ? "Criar caso com IA" : "Criar tema com IA"}</button>`,
              icone("square-pen")
            )
      }
    </div>`;

  const textoEl = root.querySelector("#cor-texto");
  const enunEl = root.querySelector("#cor-enun");
  const contador = root.querySelector("#cor-contador");
  // Atribuição direta (sem debounce): cada tecla atualiza o rascunho de módulo.
  textoEl.addEventListener("input", () => {
    rascunho.texto = textoEl.value;
    contador.textContent = `${contaPalavras(textoEl.value)} palavras`;
  });
  enunEl.addEventListener("input", () => {
    rascunho.enun = enunEl.value;
  });
  const fotoEl = root.querySelector("#cor-foto");
  if (fotoEl) {
    ligarDropZone(fotoEl, { zona: root.querySelector(".correcao-form") });
    // Uma sentença manuscrita tem VÁRIAS folhas, e o iPad exporta as anotações como um PDF só.
    // Por isso aqui entram N imagens e/ou um PDF; cada folha vira uma requisição da Visão e o
    // texto é emendado NA ORDEM das folhas, no fim do que já está escrito.
    fotoEl.addEventListener("change", async (e) => {
      const arquivos = [...(e.target.files || [])];
      if (!arquivos.length) return;
      const lerDataUrl = (f) =>
        new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(f);
        });
      try {
        // PDF (ex.: anotação do iPad exportada) vira uma imagem por página, na ordem.
        const folhas = [];
        for (const f of arquivos) {
          if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
            const { extrairPdfPaginas, rasterizarPaginas } = await import("../pdf.js");
            const { numPaginas } = await extrairPdfPaginas(f);
            const imgs = await rasterizarPaginas(f, Array.from({ length: numPaginas }, (_, i) => i + 1), 2);
            folhas.push(...imgs.map((i) => i.dataUrl));
          } else {
            folhas.push(await lerDataUrl(f));
          }
        }
        const partes = [];
        await comOcupado(async () => {
          for (let i = 0; i < folhas.length; i++) {
            toast(folhas.length > 1 ? `Transcrevendo folha ${i + 1} de ${folhas.length}…` : "Transcrevendo a foto com Visão…");
            partes.push(await store.transcreverFoto(folhas[i], "manuscrito"));
          }
        });
        const transc = partes.filter((p) => String(p || "").trim()).join("\n\n");
        if (!transc) return toast("Não consegui ler nada nessas folhas. Tente fotos mais nítidas ou digite o texto.", "erro");
        const atual = textoEl.value.trim();
        textoEl.value = atual ? atual + "\n\n" + transc : transc;
        textoEl.dispatchEvent(new Event("input"));
        toast(`${plural(folhas.length, "folha transcrita", "folhas transcritas")}. Confira e ajuste antes de corrigir.`, "ok");
      } catch (err) {
        toast("Não consegui ler a foto. Tente uma imagem mais nítida ou digite o texto.", "erro");
      } finally {
        e.target.value = "";
      }
    });
  }
  // Trocar o tipo REDESENHA a tela: sentença muda rótulo, altura do enunciado, texto de
  // apoio e ganha o cronômetro de 4 h. O rascunho é gravado a cada tecla (l. 113-119),
  // então o refresh não perde o que está escrito.
  root.querySelector("#gen-tipo").addEventListener("change", (e) => {
    tipo = e.target.value;
    app.refresh();
  });
  root.querySelector("#gen-fonte").addEventListener("change", (e) => {
    genFonte = e.target.value; // escolha explícita: o automático para de interferir
    root.querySelector("#gen-alvo-wrap").innerHTML = alvoControl(genFonte, st, ehSentenca);
    ligarCampoMaterial(root, st, { id: "gen-alvo", msg: "Gerar a partir de qual material?", incluirVazio: false });
  });
  ligarCampoMaterial(root, st, { id: "gen-alvo", msg: "Gerar a partir de qual material?", incluirVazio: false });

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
      imprimir("Escrita — Mentor Concurso", printRedacoes(st, op.texto === "com"));
    },
    "toggle-gen": (el) => {
      const box = root.querySelector("#ia-gen-box");
      const oculto = box.hasAttribute("hidden");
      if (oculto) box.removeAttribute("hidden");
      else box.setAttribute("hidden", "");
      // innerHTML preserva o ícone (textContent apagava o sparkles ao alternar).
      el.innerHTML = oculto
        ? `${icone("x")} Fechar gerador`
        : temBrief
        ? `${icone("sparkles")} Gerar a partir do que escrevi`
        : `${icone("sparkles")} ${ehSentenca ? "Criar caso com IA" : "Criar tema com IA"}`;
    },
    // Cronômetro no tempo da prova real: 4 h por sentença (TJSP). Reusa o relógio
    // flutuante que já existe — nada de um segundo cronômetro dentro da tela.
    // Import ESTÁTICO (topo do arquivo), não dinâmico: `await import()` em dev cria uma
    // SEGUNDA instância do módulo (o HMR do Vite anexa ?t= à URL), e o estado do
    // cronômetro é de módulo — o alvo era gravado numa instância e lido de outra.
    "cronometrar-prova": () => {
      setModoCrono("regressivo");
      setTargetCrono(4 * 60 * 60);
      iniciarCrono();
      toast("Cronômetro em 4 h — o tempo real de uma sentença no TJSP.");
    },
    "gerar-pergunta": async (el) => {
      if (!store.iaDisponivel()) return avisoIA(app, ehSentenca ? "Gerar caso de sentença" : "Gerar pergunta discursiva");
      // A caixa nasce ABERTA com o campo vazio (é quando se gera). Se o usuário chegou
      // aqui pelo CTA do estado vazio com a caixa fechada, abre antes de gerar — gerar
      // com um seletor que ninguém viu é o que fazia a coisa parecer sorteio.
      const box = root.querySelector("#ia-gen-box");
      if (box && box.hasAttribute("hidden")) {
        box.removeAttribute("hidden");
        const bt = root.querySelector('[data-action="toggle-gen"]');
        if (bt) bt.innerHTML = `${icone("x")} Fechar gerador`;
        box.scrollIntoView({ block: "nearest" });
        return toast("Escolha de onde vem o tema e toque em gerar.");
      }
      const fonte = root.querySelector("#gen-fonte").value;
      const alvoEl = root.querySelector("#gen-alvo");
      let alvo = alvoEl && alvoEl.value !== undefined ? alvoEl.value : "";
      // "O que eu escrevi acima": o próprio campo é o briefing.
      if (fonte === "escrito") alvo = root.querySelector("#cor-enun").value.trim();
      if ((fonte === "topico" || fonte === "material") && !alvo) return toast("Escolha o assunto.", "erro");
      if (fonte === "livre" && !alvo.trim())
        return toast(ehSentenca ? "Digite a matéria do caso." : "Digite um tema livre.", "erro");
      if (fonte === "escrito" && !alvo) return toast("Escreva uma instrução no campo acima.", "erro");
      const enun = await comOcupado(() => store.gerarPerguntaDiscursiva({ fonte, alvo, tipo }), {
        botao: el,
        msg: ehSentenca ? "Montando o caso com a IA…" : "Gerando pergunta com a IA…",
      });
      if (enun == null) return;
      root.querySelector("#cor-enun").value = enun;
      rascunho.enun = enun;
      textoEl.focus();
      toast(ehSentenca ? "Caso montado. Agora escreva a sentença." : "Pergunta gerada. Agora escreva sua resposta.");
    },
    corrigir: async (el) => {
      const texto = textoEl.value.trim();
      const enun = root.querySelector("#cor-enun").value;
      if (texto.split(/\s+/).filter(Boolean).length < 10) return toast("Escreva uma resposta com ao menos 10 palavras.", "erro");
      // Nova correção disparada → o "digitando" do feedback volta a rodar na próxima pintura
      // (o guard é por correção, não por sessão do app).
      feedbackRevelou = false;
      const web = root.querySelector("#cor-web")?.checked || false;
      const r = await comOcupado(() => store.corrigirRedacao({ tipo, enunciado: enun, texto, web }), { botao: el, msg: store.iaDisponivel() ? (web ? "Corrigindo com IA + busca web…" : "Corrigindo com a IA…") : "Analisando estrutura (offline)…" });
      if (r === null) return;
      // Correção bem-sucedida → o rascunho cumpriu o papel; limpa e re-pinta os campos vazios.
      rascunho = { enun: "", texto: "" };
      app.refresh();
      toast("Resposta corrigida. Veja a análise abaixo.");
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
function alvoControl(fonte, st, ehSentenca = false) {
  // ALEATÓRIO é escolha, não acidente: sem campo de assunto, e a própria opção diz o
  // que vai acontecer. Antes o aleatório era o efeito de um seletor escondido com o
  // primeiro item da lista — parecia sorteio e não era.
  if (fonte === "aleatorio") {
    const nT = st.topicos.length;
    const nD = st.documentos.length;
    const onde = nT || nD ? `entre ${plural(nT, "tópico", "tópicos")} e ${plural(nD, "material", "materiais")}` : "sem edital nem material — a IA escolhe livremente";
    return `<span class="muted small" id="gen-alvo-vazio" data-tip="Sorteio uniforme: todo tópico e todo material têm a mesma chance. Sem peso por relevância ou por lacuna.">Sorteia ${onde}.</span>`;
  }
  // "O que eu escrevi acima": o campo do enunciado vira o BRIEFING. Antes, escrever ali
  // e mandar gerar jogava fora o que você tinha escrito — o gerador nunca lia o campo.
  if (fonte === "escrito") {
    return `<span class="muted small" id="gen-alvo-vazio">Usa o texto do campo acima como instrução.</span>`;
  }
  if (fonte === "material") {
    if (!(st.documentos || []).length) return `<select id="gen-alvo"><option value="">(importe um material primeiro)</option></select>`;
    return campoMaterialHTML(st, { id: "gen-alvo", vazio: "— escolher material —", incluirVazio: false });
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
  // Em sentença, "matéria livre" é o caminho natural: digitar "usucapião" ou "tráfico de
  // drogas" é mais direto que caçar na lista do edital — e evita o absurdo de gerar uma
  // sentença cível a partir de "Português · Concordância verbal".
  return `<input id="gen-alvo" type="text" placeholder="${
    ehSentenca ? "Ex.: usucapião, locação, tráfico de drogas" : "Ex.: princípio da insignificância"
  }" />`;
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
        <div class="print-meta">${ROTULO_TIPO[r.tipo] || "Discursiva"} · ${fmtData(r.data)} · ${c.palavras} palavras${nota}${c.itensPct != null ? ` · ${c.itensPct}% dos itens esperados` : ""}</div>
        ${r.enunciado ? `<div><b>Tema:</b> ${esc(r.enunciado)}</div>` : ""}
        ${comTexto && r.texto ? `<div style="margin-top:4px"><b>Resposta:</b> ${esc(r.texto)}</div>` : ""}
        ${fb ? `<div style="margin-top:4px"><b>Correção:</b> ${esc(fb)}</div>` : ""}
      </div>`;
    })
    .join("");
}

function correcaoHTML(r) {
  // A correção pode faltar ou vir pela metade: redação salva por uma versão antiga,
  // importada de outro aparelho, ou cuja correção foi interrompida no meio. Sem estas
  // guardas, um único campo ausente derruba a TELA INTEIRA (e não só aquele cartão).
  const c = r.correcao || {};
  const criterios = Array.isArray(c.criterios) ? c.criterios : [];
  const temMetricas = [c.palavras, c.paragrafos, c.frases].some((n) => typeof n === "number");
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
        <span class="mini-tag">${ROTULO_TIPO[r.tipo] || "Discursiva"}</span>
        ${
          // Único número comparável entre provas de sentença: a fração dos itens
          // esperados que você enfrentou. A nota 0–10 depende do caso; esta não.
          c.itensPct != null
            ? `<span class="cor-itens-tag" data-tip="Dos itens que o espelho cobraria neste caso, você enfrentou ${c.itensPct}% (PARCIAL conta meio). É o número que dá para comparar entre provas — a nota depende de cada caso.">${icone("list-checks")} ${c.itensPct}% dos itens</span>`
            : ""
        }
        ${c.nota ? `<span class="cor-nota-tag" data-tip="Nota geral atribuída à resposta.">${seloBadge(c.selo)} ${esc(c.nota)}</span>` : ""}
        <span class="spacer"></span>
        <span class="muted small">${fmtData(r.data)}</span>
        ${r.texto && fbTxt ? `<button class="lnk cor-comparar-btn" data-action="cor-comparar" data-tip-pos="cima-dir" data-tip="Ver sua resposta e a correção lado a lado (toque de novo para empilhar).">${icone("arrow-left-right")} Comparar</button>` : ""}
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
          ? `<details class="cor-resposta"><summary>${icone("file-text")} Sua resposta${typeof c.palavras === "number" ? ` (${c.palavras} palavra${c.palavras === 1 ? "" : "s"})` : ""}</summary><div class="cor-resposta-txt">${esc(r.texto)}</div></details>`
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
      ${!temMetricas && !criterios.length ? "" : `<details class="cor-metricas">
        <summary>${temMetricas ? `${c.palavras || 0} palavras · ${plural(c.paragrafos || 0, "parágrafo", "parágrafos")} · ${plural(c.frases || 0, "frase", "frases")} · ` : ""}ver métricas</summary>
        <div class="cor-criterios">
          ${criterios
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
      </details>`}
    </div>`;
}
