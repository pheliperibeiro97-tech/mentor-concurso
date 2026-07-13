// MENTOR — chat flutuante. Fase 2: persona ÚNICA (o mesmo Mentor da barra lateral,
// aqui em modo conversa), com MEMÓRIA persistente (últimas trocas guardadas no store,
// multi-turno no prompt) e STREAMING REAL (o texto chega token a token, com markdown
// formatado desde o primeiro pedaço; botão Parar disponível durante a geração).
import { iaDisponivel, responderChatStream, interpretarComando } from "./ia-provider.js";
import { executarComando } from "./chat-acoes.js";
import { esc, humanizarErroIA } from "./util.js";
import { icone } from "./icones.js";
import { skeletonDoc, plural, md } from "./ui.js";

export function montarChat(store, app) {
  if (document.getElementById("chat-fab")) return;

  const fab = document.createElement("button");
  fab.id = "chat-fab";
  fab.className = "chat-fab";
  fab.title = "Mentor: pergunte ou peça uma ação — eu proponho, você confirma";
  // Ícone do Mentor = símbolo de IA (estrelinhas) VIVO: brilha/pisca (twinkle) e o
  // círculo tem pulso próprio. Assinatura da inteligência, distinta do orb dos cartões.
  fab.innerHTML = icone("sparkles");

  const panel = document.createElement("div");
  panel.id = "chat-panel";
  panel.className = "chat-panel oculto";
  panel.innerHTML = `
    <div class="chat-head">
      <div class="chat-head-id"><b>Mentor</b><div class="chat-sub">responde com seu material e <b>executa ações</b></div></div>
      <span class="spacer"></span>
      <button class="chat-exp" title="Expandir / recolher o chat">${icone("maximize-2")}</button>
      <button class="chat-x" title="Fechar">${icone("x")}</button>
    </div>
    <div class="chat-webbar">
      <button class="chat-web" aria-pressed="false" title="Busca ao vivo na internet. Requer uma IA conectada com suporte a busca na web.">${icone("globe")} Buscar na web: desligada</button>
      <span class="spacer"></span>
      <button class="chat-limpar" title="Apagar a conversa (inclusive a memória salva)">Limpar conversa</button>
    </div>
    <div class="chat-msgs" id="chat-msgs"></div>
    <div class="chat-input">
      <textarea id="chat-in" rows="1" placeholder="Pergunte ou peça uma ação (ex.: crie 5 flashcards de...)"></textarea>
      <button id="chat-send" title="Enviar">${icone("send")}</button>
    </div>`;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const msgs = panel.querySelector("#chat-msgs");
  const input = panel.querySelector("#chat-in");

  // MEMÓRIA: rehidrata a conversa salva (o Mentor não tem mais amnésia entre sessões).
  function renderConversa() {
    const hist = store.chatHistorico();
    if (!hist.length) {
      msgs.innerHTML = msgInicial(store, app.rotaAtual);
      return;
    }
    msgs.innerHTML = hist
      .map((m) => `<div class="chat-msg ${m.who}">${m.who === "user" ? esc(m.texto) : `<p>${md(m.texto)}</p>`}</div>`)
      .join("");
    msgs.scrollTop = msgs.scrollHeight;
  }
  renderConversa();

  // Fechado, o painel some só visualmente (classe .oculto) — sem `inert`, o #chat-in
  // continuava focável por Tab e recebendo texto "no escuro". `inert` desativa foco e
  // interação de TODOS os filhos (suportado no Chromium/WebView2); o tabIndex=-1 no
  // textarea é cinto de segurança extra.
  const abrir = () => {
    panel.classList.remove("oculto");
    panel.removeAttribute("inert");
    input.removeAttribute("tabindex");
    fab.classList.add("ativo");
    input.focus();
  };
  const fechar = () => {
    panel.classList.add("oculto");
    panel.setAttribute("inert", "");
    input.tabIndex = -1;
    fab.classList.remove("ativo");
  };
  fechar(); // estado inicial coerente (nasce oculto → também inerte)
  fab.addEventListener("click", () => (panel.classList.contains("oculto") ? abrir() : fechar()));
  panel.querySelector(".chat-x").addEventListener("click", fechar);
  panel.querySelector(".chat-limpar").addEventListener("click", () => {
    store.chatLimpar();
    renderConversa();
  });
  // Expandir / recolher o painel (tamanho padrão menor, opção de ampliar).
  panel.querySelector(".chat-exp").addEventListener("click", () => {
    panel.classList.toggle("expandido");
    input.focus();
  });

  // Busca na web (Google Search grounding via IA): interruptor claro, DESLIGADO por padrão.
  let webOn = false;
  const webBtn = panel.querySelector(".chat-web");
  function atualizaWeb() {
    webBtn.innerHTML = icone("globe") + (webOn ? " Buscar na web: ligada" : " Buscar na web: desligada");
    webBtn.classList.toggle("ativo", webOn);
    webBtn.setAttribute("aria-pressed", webOn ? "true" : "false");
    webBtn.title = webOn
      ? "Busca ao vivo na internet ativada. Toque para desativar."
      : "Busca ao vivo na internet (desativada). Toque para ativar. Requer uma IA conectada com suporte a busca na web.";
  }
  webBtn.addEventListener("click", () => {
    webOn = !webOn;
    atualizaWeb();
    add(
      webOn
        ? `<p class="chat-nota">${icone("globe")} Busca na web <b>ligada</b> (requer uma IA conectada com busca web). As respostas virão com fontes da internet — confira sempre, leis e prazos mudam.</p>`
        : `<p class="chat-nota">${icone("globe")} Busca na web desligada. Volto a responder pelo seu material e pelo que eu já sei.</p>`,
      "bot"
    );
  });
  atualizaWeb();

  function add(html, who) {
    const d = document.createElement("div");
    d.className = "chat-msg " + who;
    d.innerHTML = html;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // Roteador: tenta interpretar como COMANDO (ação a executar, com confirmação).
  // Se não for comando (ou sem IA), cai na resposta normal (RAG).
  async function responder(q) {
    const cfg = store.get().config;
    if (iaDisponivel(cfg)) {
      const pensando = addPensando();
      try {
        const st = store.get();
        const cmd = await interpretarComando(cfg, {
          pergunta: q,
          topicos: (st.topicos || []).map((t) => t.nome),
          materiais: (st.documentos || []).map((d) => d.titulo),
          resumos: (st.resumos || []).map((r) => r.titulo),
        });
        pensando.remove();
        if (cmd.acao) {
          propor(cmd);
          return;
        }
      } catch (_) {
        pensando.remove(); // falhou o roteador: segue como pergunta normal
      }
    }
    await responderPergunta(q);
  }

  // Propõe uma ação e só executa após CONFIRMAÇÃO (o assistente sugere, não age sozinho).
  function propor(cmd) {
    const d = document.createElement("div");
    d.className = "chat-msg bot";
    d.innerHTML = `<div class="chat-acao">
        <p class="chat-acao-txt"><span class="orb orb-xs" aria-hidden="true"></span> <b>${esc(cmd.resumo || "Executar esta ação?")}</b></p>
        <div class="chat-acao-btns">
          <button class="btn btn-sm btn-primary chat-acao-ok">Confirmar</button>
          <button class="btn btn-sm btn-ghost chat-acao-no">Cancelar</button>
        </div>
      </div>`;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    d.querySelector(".chat-acao-no").addEventListener("click", () => {
      d.querySelector(".chat-acao-btns").innerHTML = `<span class="chat-nota">Cancelado.</span>`;
    });
    d.querySelector(".chat-acao-ok").addEventListener("click", async () => {
      const btns = d.querySelector(".chat-acao-btns");
      btns.innerHTML = `<span class="chat-nota chat-gerando"><span class="orb orb-xs is-thinking" aria-hidden="true"></span> Gerando com a IA… aguarde</span>`;
      try {
        const msg = await executarComando(store, app, cmd.acao, cmd.params);
        btns.outerHTML = `<p class="chat-nota chat-acao-feito">${icone("check")} ${esc(msg)}</p>`;
      } catch (e) {
        btns.innerHTML = `<span class="chat-nota">${icone("triangle-alert")} ${esc(e.message)}</span>`;
      }
    });
  }

  // Sem IA: só recuperação (offline). Com IA conectada: STREAMING REAL — o texto chega
  // token a token, já formatado (markdown) desde o primeiro pedaço, com botão Parar.
  async function responderPergunta(q) {
    const cfg = store.get().config;
    const res = await store.recuperarTrechos(q);
    const fontesHTML = res.length
      ? res
          .map((r) => `<div class="chat-fonte"><div class="chat-trecho">${esc(r.trecho)}</div><div class="chat-origem">${icone("book-open")} ${esc(r.origem)}</div></div>`)
          .join("")
      : "";

    if (iaDisponivel(cfg)) {
      const pensando = addPensando();
      // Conversa anterior SEM o turno do usuário que acabou de entrar (a pergunta vai à parte).
      const historico = store.chatHistorico().slice(0, -1);
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const d = document.createElement("div");
      d.className = "chat-msg bot";
      let comecou = false;
      const comecar = () => {
        if (comecou) return;
        comecou = true;
        pensando.remove();
        d.innerHTML = `<p class="chat-stream-md"></p><p class="chat-nota chat-parar-linha"><button class="lnk chat-parar">${icone("circle-stop")} Parar</button></p>`;
        msgs.appendChild(d);
        d.querySelector(".chat-parar").addEventListener("click", () => ctrl && ctrl.abort());
      };
      const pertoDoFim = () => msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
      try {
        const r = await responderChatStream(cfg, {
          pergunta: q,
          fontes: res,
          web: webOn,
          perfil: store.contextoAlunoCurto(),
          historico,
          signal: ctrl ? ctrl.signal : undefined,
          onChunk: (parcial) => {
            comecar();
            const rolarJunto = pertoDoFim();
            const alvo = d.querySelector(".chat-stream-md");
            if (alvo) alvo.innerHTML = md(parcial);
            if (rolarJunto) msgs.scrollTop = msgs.scrollHeight;
          },
        });
        const webHTML = r.fontesWeb && r.fontesWeb.length
          ? `<div class="chat-web-fontes"><b class="chat-nota">${icone("globe")} Fontes da web:</b>${r.fontesWeb
              .slice(0, 6)
              .map((f) => `<a href="${esc(f.uri)}" target="_blank" rel="noopener">${esc(f.titulo)}</a>`)
              .join("")}</div>`
          : "";
        // Rodapé de origem: quando apoiado no material, a própria nota é o "abridor"
        // das fontes (clicável) — evita repetir "fonte/material" em duas linhas.
        let rodape;
        if (webOn) {
          rodape =
            webHTML +
            `<p class="chat-nota">${icone("bot")} ${icone("globe")} Respondi com busca na web — confira a fonte oficial.</p>` +
            (fontesHTML ? `<details class="chat-fontes-det"><summary>${icone("book-open")} Trechos do seu material (${res.length})</summary>${fontesHTML}</details>` : "");
        } else if (res.length) {
          rodape = `<details class="chat-fontes-det chat-origem-det"><summary>${icone("bot")} Baseei-me em <b>${plural(res.length, "trecho", "trechos")} do seu material</b> — toque para conferir</summary>${fontesHTML}</details>`;
        } else {
          rodape = `<p class="chat-nota">${icone("bot")} Respondi com meu conhecimento geral — esse tema ainda não está no seu material. Confira.</p>`;
        }
        comecar(); // caso raro: resposta veio inteira sem chunks intermediários
        d.innerHTML = `<p>${md(r.texto)}</p>` + rodape;
        msgs.scrollTop = msgs.scrollHeight;
        store.chatRegistrar("bot", r.texto);
      } catch (e) {
        pensando.remove();
        if (e && e.name === "AbortError") {
          // Parada pedida: preserva o parcial e sinaliza.
          const parcial = d.querySelector(".chat-stream-md");
          const linha = d.querySelector(".chat-parar-linha");
          if (linha) linha.outerHTML = `<p class="chat-nota">${icone("circle-stop")} Geração interrompida por você.</p>`;
          if (parcial && parcial.textContent.trim()) store.chatRegistrar("bot", parcial.textContent);
          else d.remove();
          return;
        }
        if (comecou) d.remove();
        const dd = document.createElement("div");
        dd.className = "chat-msg bot";
        dd.innerHTML =
          `<p class="chat-nota">${icone("triangle-alert")} ${esc(humanizarErroIA(e))}</p>` +
          `<p class="chat-nota"><button class="btn btn-sm btn-ghost chat-retry">${icone("refresh-cw")} Tentar de novo</button></p>` +
          (fontesHTML ? `<details class="chat-fontes-det"><summary>${icone("book-open")} Enquanto isso, trechos do seu material (${res.length})</summary>${fontesHTML}</details>` : "");
        msgs.appendChild(dd);
        msgs.scrollTop = msgs.scrollHeight;
        dd.querySelector(".chat-retry").addEventListener("click", () => {
          dd.remove();
          responderPergunta(q);
        });
      }
      return;
    }

    // Modo offline (sem IA): devolve os trechos do material.
    if (res.length) {
      add(
        `<p>Encontrei isto no seu conteúdo:</p>${fontesHTML}` +
          `<p class="chat-nota">Estas são as fontes do seu material. Para uma <b>resposta elaborada</b> (com a origem), conecte uma IA em Configurações.</p>`,
        "bot"
      );
    } else {
      add(
        `<p>Não encontrei isso no seu conteúdo (material, resumos, lei/jurisprudência, flashcards, questões).</p>
         <p class="chat-nota">Cadastre o material relacionado, ou conecte uma IA em Configurações para respostas geradas (sempre indicando a origem).</p>`,
        "bot"
      );
    }
  }

  function addPensando() {
    const d = document.createElement("div");
    d.className = "chat-msg bot chat-pensando";
    d.innerHTML = `<p class="chat-nota chat-pensando-linha"><span class="orb orb-xs is-thinking" aria-hidden="true"></span> lendo seu material <span class="typing" aria-label="digitando"><i></i><i></i><i></i></span></p>${skeletonDoc(2, { titulo: false })}`;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  function enviar(texto) {
    const q = (texto != null ? texto : input.value).trim();
    if (!q) return;
    // Se a conversa ainda mostra só a saudação, limpa antes do 1º turno real.
    if (!store.chatHistorico().length) msgs.innerHTML = "";
    add(esc(q), "user");
    store.chatRegistrar("user", q); // memória (multi-turno + rehidratação)
    input.value = "";
    ajustarAltura();
    setTimeout(() => responder(q), 120);
  }
  panel.querySelector("#chat-send").addEventListener("click", () => enviar());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  });

  // Campo de texto que cresce com o conteúdo (até um limite).
  function ajustarAltura() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 96) + "px";
  }
  input.addEventListener("input", ajustarAltura);

  // Chips de sugestão (no estado inicial): clicar envia a pergunta pronta.
  msgs.addEventListener("click", (e) => {
    const chip = e.target.closest(".chat-chip");
    if (chip) enviar(chip.getAttribute("data-q"));
  });

  // Ponte para a paleta ⌘K: abre o chat e (opcional) já envia uma pergunta/comando,
  // reusando todo o fluxo do chat (interpretar → propor → confirmar → executar).
  app.perguntarNoChat = (texto) => {
    abrir();
    if (texto != null && String(texto).trim()) enviar(texto);
  };
}

// md() (renderizador de markdown leve) agora vive em ui.js e é importado acima — um só no app.

// Mostra/oculta o botão conforme o onboarding.
export function atualizarChatVisibilidade(onboarded) {
  const fab = document.getElementById("chat-fab");
  const panel = document.getElementById("chat-panel");
  if (fab) fab.style.display = onboarded ? "" : "none";
  if (!onboarded && panel) {
    panel.classList.add("oculto");
    panel.setAttribute("inert", ""); // fechado também para foco/teclado, não só visualmente
    const inp = panel.querySelector("#chat-in");
    if (inp) inp.tabIndex = -1;
  }
}

// Saudação inicial — Fase 2: persona única (Mentor) + CHIPS CONTEXTUAIS pela tela
// em que o usuário está (o Mentor parece atento ao que você está fazendo agora).
function msgInicial(store, rota) {
  const st = store.get();
  const tops = st.topicos.slice(0, 3);
  const chip = (q, rotulo, ia) => `<button class="chat-chip" data-q="${esc(q)}">${ia ? icone("sparkles") + " " : ""}${esc(rotulo)}</button>`;
  const porRota = {
    pratica: [chip("Comente meus erros mais recentes de questões", "Comentar meus erros recentes", true), tops[0] ? chip(`Crie 5 questões de ${tops[0].nome}`, `Criar questões de ${tops[0].nome}`, true) : ""],
    "pratica-ce": [chip("Comente meus erros mais recentes de questões", "Comentar meus erros recentes", true)],
    erros: [chip("Qual padrão você vê nos meus erros?", "Padrão dos meus erros", true)],
    edital: [chip("Onde estou mais fraco no edital?", "Onde estou mais fraco?", true)],
    leiseca: [tops[0] ? chip(`Crie 5 flashcards de ${tops[0].nome}`, `Flashcards de ${tops[0].nome}`, true) : ""],
    diagnostico: [chip("Explique minha semana de estudos", "Explicar minha semana", true)],
    revisoes: [chip("O que devo revisar primeiro hoje?", "O que revisar primeiro?", true)],
    flashcards: [tops[0] ? chip(`Crie 5 flashcards de ${tops[0].nome}`, `Flashcards de ${tops[0].nome}`, true) : ""],
  };
  const contexto = (porRota[rota] || []).filter(Boolean).join("");
  const chips =
    contexto +
    (tops[0] && !contexto.includes("flashcards de") ? chip(`Crie 5 flashcards de ${tops[0].nome}`, `Criar flashcards de ${tops[0].nome}`, true) : "") +
    (tops[1] ? chip(`Resuma o que eu tenho sobre ${tops[1].nome}`, `Resumir: ${tops[1].nome}`, false) : "") +
    chip("Quais são meus erros mais recentes?", "Meus erros recentes", false) +
    chip("Como funciona o app?", "Como usar o app?", false);
  return `<div class="chat-msg bot">
      <p>Oi! Sou o <b>Mentor</b> — pergunte qualquer coisa ou peça uma ação.</p>
      <p>${icone("search")} <b>Respondo</b> com base no que você cadastrou (material, resumos, lei/juris, flashcards, questões), sempre com a <b>origem</b>.</p>
      <p>${icone("sparkles")} <b>Executo ações</b>: criar flashcards/questões, agendar revisão, registrar sessão, abrir telas e mais — eu proponho, você confirma.</p>
      <div class="chat-sugestoes">${chips}</div>
    </div>`;
}
