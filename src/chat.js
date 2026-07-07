// Assistente — chat flutuante. Faz MAIS que o Mentor IA (que é o painel proativo):
// responde com base no conteúdo do usuário (material, resumos, lei/jurisprudência,
// flashcards, questões) SEMPRE indicando a origem , gera respostas elaboradas com a
// IA conectada () e, opcionalmente, busca ao vivo na web (). Por isso se chama
// "Assistente", para não se confundir com o "Mentor IA" da barra lateral.
import { iaDisponivel, responderChat, interpretarComando } from "./ia-provider.js";
import { executarComando } from "./chat-acoes.js";
import { esc } from "./util.js";
import { icone } from "./icones.js";
import { revelarTexto, skeletonDoc, plural } from "./ui.js";

export function montarChat(store, app) {
  if (document.getElementById("chat-fab")) return;

  const fab = document.createElement("button");
  fab.id = "chat-fab";
  fab.className = "chat-fab";
  fab.title = "Assistente: pergunte OU peça uma ação (ele executa)";
  // Ícone do assistente = símbolo de IA (estrelinhas) VIVO: brilha/pisca (twinkle) e o
  // círculo tem pulso próprio. Assinatura da inteligência, distinta do orb dos cartões.
  fab.innerHTML = icone("sparkles");

  const panel = document.createElement("div");
  panel.id = "chat-panel";
  panel.className = "chat-panel oculto";
  panel.innerHTML = `
    <div class="chat-head">
      <div class="chat-head-id"><b>Assistente Inteligente</b><div class="chat-sub">responde com seu material e <b>executa ações</b></div></div>
      <span class="spacer"></span>
      <button class="chat-exp" title="Expandir / recolher o chat">${icone("maximize-2")}</button>
      <button class="chat-x" title="Fechar">${icone("x")}</button>
    </div>
    <div class="chat-webbar">
      <button class="chat-web" aria-pressed="false" title="Busca ao vivo na internet. Requer uma IA conectada com suporte a busca na web.">${icone("globe")} Buscar na web: desligada</button>
      <span class="spacer"></span>
      <button class="chat-limpar" title="Limpar a conversa">Limpar conversa</button>
    </div>
    <div class="chat-msgs" id="chat-msgs">${msgInicial(store)}</div>
    <div class="chat-input">
      <textarea id="chat-in" rows="1" placeholder="Pergunte OU peça uma ação (ex.: crie 5 flashcards de...)"></textarea>
      <button id="chat-send" title="Enviar">${icone("send")}</button>
    </div>`;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const msgs = panel.querySelector("#chat-msgs");
  const input = panel.querySelector("#chat-in");

  const abrir = () => {
    panel.classList.remove("oculto");
    fab.classList.add("ativo");
    input.focus();
  };
  const fechar = () => {
    panel.classList.add("oculto");
    fab.classList.remove("ativo");
  };
  fab.addEventListener("click", () => (panel.classList.contains("oculto") ? abrir() : fechar()));
  panel.querySelector(".chat-x").addEventListener("click", fechar);
  panel.querySelector(".chat-limpar").addEventListener("click", () => {
    msgs.innerHTML = msgInicial(store);
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
      ? "Busca ao vivo na internet ativada. Clique para desativar."
      : "Busca ao vivo na internet (desativada). Clique para ativar. Requer uma IA conectada com suporte a busca na web.";
  }
  webBtn.addEventListener("click", () => {
    webOn = !webOn;
    atualizaWeb();
    add(
      webOn
        ? `<p class="chat-nota">${icone("globe")} Busca na web <b>ligada</b> (requer uma IA conectada com busca web). As respostas virão com fontes da internet — confira sempre, leis e prazos mudam.</p>`
        : `<p class="chat-nota">${icone("globe")} Busca na web desligada. Volto a responder pelo seu material + conhecimento do modelo.</p>`,
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

  // Sem IA: só recuperação (offline). Com IA conectada: resposta elaborada ,
  // ancorada nos mesmos trechos do material do usuário (sempre com origem).
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
      try {
        const r = await responderChat(cfg, { pergunta: q, fontes: res, web: webOn, perfil: store.contextoAlunoCurto() });
        pensando.remove();
        const texto = md(r.texto);
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
            `<p class="chat-nota">${icone("bot")} ${icone("globe")} Resposta gerada por IA com busca na web — confira a fonte oficial.</p>` +
            (fontesHTML ? `<details class="chat-fontes-det"><summary>${icone("book-open")} Trechos do seu material (${res.length})</summary>${fontesHTML}</details>` : "");
        } else if (res.length) {
          rodape = `<details class="chat-fontes-det chat-origem-det"><summary>${icone("bot")} Resposta gerada por IA, apoiada em <b>${plural(res.length, "fonte", "fontes")} do seu material</b> — confira</summary>${fontesHTML}</details>`;
        } else {
          rodape = `<p class="chat-nota">${icone("bot")} Resposta gerada por IA (conhecimento geral do modelo, não do seu material) — confira.</p>`;
        }
        // Revelação progressiva (sensação de resposta ao vivo): mostra o texto puro
        // surgindo com cursor; ao terminar (ou num clique, que pula), troca pelo HTML
        // final formatado + rodapé de fontes.
        const d = document.createElement("div");
        d.className = "chat-msg bot";
        d.innerHTML = `<p class="chat-stream"></p>`;
        msgs.appendChild(d);
        const rolar = setInterval(() => { msgs.scrollTop = msgs.scrollHeight; }, 120);
        revelarTexto(d.querySelector(".chat-stream"), r.texto, {
          aoFim: () => {
            clearInterval(rolar);
            d.innerHTML = `<p>${texto}</p>` + rodape;
            msgs.scrollTop = msgs.scrollHeight;
          },
        });
      } catch (e) {
        pensando.remove();
        add(`<p class="chat-nota">Falha ao consultar a IA: ${esc(e.message)}</p>` + (fontesHTML ? `<p>Enquanto isso, achei estes trechos no seu material:</p>${fontesHTML}` : ""), "bot");
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
    d.innerHTML = `<p class="chat-nota chat-pensando-linha"><span class="orb orb-xs is-thinking" aria-hidden="true"></span> pensando <span class="typing" aria-label="digitando"><i></i><i></i><i></i></span></p>${skeletonDoc(2, { titulo: false })}`;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  function enviar(texto) {
    const q = (texto != null ? texto : input.value).trim();
    if (!q) return;
    add(esc(q), "user");
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

// Markdown leve: **negrito**, listas com "- " ou "• ", e quebras de linha.
function md(t) {
  const linhas = esc(t || "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").split(/\n/);
  let out = "";
  let emLista = false;
  for (const ln of linhas) {
    if (/^\s*[-•]\s+/.test(ln)) {
      if (!emLista) {
        out += "<ul>";
        emLista = true;
      }
      out += "<li>" + ln.replace(/^\s*[-•]\s+/, "") + "</li>";
    } else {
      if (emLista) {
        out += "</ul>";
        emLista = false;
      }
      out += ln + "<br>";
    }
  }
  if (emLista) out += "</ul>";
  return out;
}

// Mostra/oculta o botão conforme o onboarding.
export function atualizarChatVisibilidade(onboarded) {
  const fab = document.getElementById("chat-fab");
  const panel = document.getElementById("chat-panel");
  if (fab) fab.style.display = onboarded ? "" : "none";
  if (!onboarded && panel) panel.classList.add("oculto");
}

function msgInicial(store) {
  const st = store.get();
  const tops = st.topicos.slice(0, 3);
  const chips =
    (tops[0] ? `<button class="chat-chip" data-q="Crie 5 flashcards de ${esc(tops[0].nome)}">${icone("sparkles")} Criar flashcards de ${esc(tops[0].nome)}</button>` : "") +
    `<button class="chat-chip" data-q="Abra meu acompanhamento">${icone("sparkles")} Abrir Acompanhamento</button>` +
    (tops[1] ? `<button class="chat-chip" data-q="Resuma o que eu tenho sobre ${esc(tops[1].nome)}">Resumir: ${esc(tops[1].nome)}</button>` : "") +
    `<button class="chat-chip" data-q="Quais são meus erros mais recentes?">Meus erros recentes</button>` +
    `<button class="chat-chip" data-q="Como funciona o app?">Como usar o app?</button>`;
  return `<div class="chat-msg bot">
      <p>Oi! Sou seu <b>assistente inteligente</b>. Faço duas coisas:</p>
      <p>${icone("search")} <b>Respondo</b> com base no que você cadastrou (material, resumos, lei/juris, flashcards, questões), sempre com a <b>origem</b> — e explico <b>como usar o app</b>.</p>
      <p>${icone("sparkles")} <b>Executo ações</b> para você: criar flashcards/questões, adicionar tarefa, agendar revisão, registrar sessão, iniciar o cronômetro, abrir telas e mais. Eu sempre <b>proponho e peço sua confirmação</b> antes de fazer.</p>
      <p class="chat-nota">Aqui é para <b>perguntas e ações rápidas</b>. Para uma <b>análise completa do seu progresso</b> e um <b>plano de estudos</b> para aprovar, use o <b>Mentor IA</b> (na barra lateral).</p>
      <div class="chat-sugestoes">${chips}</div>
    </div>`;
}
