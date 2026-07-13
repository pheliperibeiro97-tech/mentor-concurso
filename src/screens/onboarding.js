// Onboarding (assistente curto, 3 etapas): concurso → prova/ritmo (opcional) →
// Mentor IA (opcional). Conclui abrindo direto no Edital. Tudo é editável depois
// em Configurações — só o concurso é obrigatório; o núcleo funciona offline.
import { bindActions, toast, pedirTexto } from "../ui.js";
import { esc, todayISO, daysBetween } from "../util.js";
import { restaurarDaNuvem, suportaSyncNuvem } from "../sync-nuvem.js";
import { icone } from "../icones.js";
import { testarConexao, iaDisponivel } from "../ia-provider.js";
import { AREAS, resumoArea } from "../areas.js";
import { arquivoParaBase64 } from "../pdf.js";

let passo = 1; // 1..4 | "montando" | "pronto"
let temaOb = null; // tema escolhido no onboarding (persistido ao avançar do passo 1)
let planoResultado = null; // { origem, disciplinas, topicos } — alimenta a tela "Plano pronto"
let montandoDe = "area"; // "area" | "edital" — muda o texto da tela de loading

// Indicador de etapas (done / atual / futura). "Montar plano" é o passo que ENTREGA o plano.
function steps(atual) {
  const it = (n, txt) => `<span class="${n < atual ? "done" : n === atual ? "atual" : ""}">${n}. ${txt}</span>`;
  return `<div class="ob-steps">${it(1, "Concurso")} › ${it(2, "Prova e ritmo")} › ${it(3, "IA")} › ${it(4, "Montar plano")}</div>`;
}

// Campo de tempo em horas + minutos (mesma convenção da tela Configurações).
function campoHM(idBase, totalMin, disabled) {
  const t = Math.max(0, totalMin || 0);
  const h = Math.floor(t / 60);
  const m = t % 60;
  const d = disabled ? "disabled" : "";
  return `<span class="hm-campo">
    <input id="${idBase}-h" type="number" min="0" value="${h}" ${d} /><span class="hm-sep">h</span>
    <input id="${idBase}-m" type="number" min="0" max="59" value="${m}" ${d} /><span class="hm-sep">min</span>
  </span>`;
}

export default function renderOnboarding(root, app) {
  const { store } = app;
  const st = store.get();
  const cfg = st.config;
  // "Meta não definida": nenhuma das 3 metas definida.
  const semMetas = !cfg.metaDiariaMin && !cfg.metaSemanalMin && !cfg.metaMensalMin;

  // Robustez: sem concurso, sempre começa no passo 1.
  if (!st.concurso) passo = 1;

  const hm = (base) => {
    const h = Math.max(0, parseInt(root.querySelector(`#${base}-h`)?.value, 10) || 0);
    const m = Math.max(0, parseInt(root.querySelector(`#${base}-m`)?.value, 10) || 0);
    return h * 60 + m;
  };

  // Finaliza o onboarding e abre a tela "Por onde começar?".
  const irComecar = () => {
    store.finalizarOnboarding();
    app.navigate("comecar");
  };

  // Monta o plano do caminho de ÁREA (offline), com loading progressivo antes do "Plano pronto".
  // O trabalho é síncrono e rápido; o delay é só p/ o feedback.
  const montarPlano = (origem, areaId) => {
    montandoDe = "area";
    passo = "montando";
    app.refresh();
    setTimeout(() => {
      planoResultado = store.montarPlanoInicial({ origem, areaId });
      passo = "pronto";
      app.refresh();
    }, 950);
  };

  // Importa o EDITAL (PDF) do usuário via Visão→JSON (Gemini) e monta o plano a partir dele.
  // Só é oferecido quando a IA (Gemini) está conectada; senão o tile vira o fallback offline.
  const importarEdital = async (file) => {
    if (!file) return;
    montandoDe = "edital";
    passo = "montando";
    app.refresh();
    try {
      const b64 = await arquivoParaBase64(file);
      const estrutura = await store.estruturarEditalDePDF(b64, file.type || "application/pdf");
      if (!estrutura || !estrutura.length) throw new Error("estrutura vazia");
      planoResultado = store.montarPlanoInicial({ origem: "edital", estrutura });
      passo = "pronto";
      app.refresh();
    } catch (e) {
      passo = 4;
      app.refresh();
      toast("Não consegui ler este edital agora (PDF protegido/escaneado ou instabilidade da IA). Tente outro PDF ou escolha uma área.", "erro");
    }
  };

  // -------- LOADING: montando o plano --------
  if (passo === "montando") {
    const edital = montandoDe === "edital";
    root.innerHTML = `
      <div class="ob-card">
        <div class="ob-logo"><span class="orb" style="width:56px;height:56px" aria-hidden="true"></span></div>
        <h1>${edital ? "Lendo seu edital…" : "Montando seu plano…"}</h1>
        <ul class="ob-load">
          ${edital
            ? `<li style="--i:0">${icone("check")}<span>Lendo o PDF com a IA</span></li>
               <li style="--i:1">${icone("check")}<span>Estruturando as disciplinas e tópicos</span></li>
               <li style="--i:2">${icone("check")}<span>Montando seu plano</span></li>`
            : `<li style="--i:0">${icone("check")}<span>Criando as matérias</span></li>
               <li style="--i:1">${icone("check")}<span>Adicionando os tópicos base</span></li>
               <li style="--i:2">${icone("check")}<span>Preparando seu ponto de partida</span></li>`}
        </ul>
        ${edital ? `<p class="muted small u-mt-16">Isso pode levar alguns segundos.</p>` : ""}
      </div>`;
    return;
  }

  // -------- PLANO PRONTO --------
  if (passo === "pronto") {
    if (!planoResultado) { passo = 4; app.refresh(); return; }
    const cargo = st.concurso ? st.concurso.cargo : "seus estudos";
    const dias = cfg.dataProva ? Math.max(0, daysBetween(todayISO(), cfg.dataProva)) : null;
    const r = planoResultado;
    root.innerHTML = `
      <div class="ob-card">
        <div class="ob-logo"><span class="orb" style="width:56px;height:56px" aria-hidden="true"></span></div>
        <h1>Seu plano está pronto!</h1>
        <p class="ob-lead">Montamos um ponto de partida para <b>${esc(cargo)}</b>. Você já pode começar a estudar hoje — e ajustar tudo quando quiser no Edital.</p>
        <div class="ob-plano-kpis">
          <div class="ob-kpi"><b data-count="${r.disciplinas}">${r.disciplinas}</b><span>${r.disciplinas === 1 ? "matéria" : "matérias"}</span></div>
          <div class="ob-kpi"><b data-count="${r.topicos}">${r.topicos}</b><span>${r.topicos === 1 ? "tópico" : "tópicos"}</span></div>
          ${dias != null ? `<div class="ob-kpi"><b data-count="${dias}">${dias}</b><span>${dias === 1 ? "dia p/ a prova" : "dias p/ a prova"}</span></div>` : ""}
        </div>
        <div class="ob-final" style="border:0; justify-content:center; padding-top:6px">
          <button class="btn btn-ghost" data-action="ver-edital">Ver meu plano no Edital</button>
          <button class="btn btn-primary btn-lg" data-action="comecar-agora">${icone("play")} Começar agora →</button>
        </div>
      </div>`;
    bindActions(root, {
      "comecar-agora": () => { store.finalizarOnboarding(); app.navigate("hoje"); },
      "ver-edital": () => { store.finalizarOnboarding(); app.navigate("edital"); },
    });
    return;
  }

  // -------- PASSO 4: Montar seu plano --------
  if (passo === 4) {
    // Import de edital por PDF exige a Visão do Gemini (lê inclusive escaneado). Sem IA,
    // o tile vira o fallback offline (abre o importador do Edital, onde há OCR/colar texto).
    const iaPdf = iaDisponivel(cfg) && cfg.iaProvider === "gemini";
    const editalBtn = iaPdf
      ? `<label class="btn btn-ghost btn-file" data-tip="Lê o PDF do seu edital com a IA (inclusive escaneado) e monta o plano">${icone("upload")} Importar edital (PDF)<input id="ob-edital-file" type="file" accept=".pdf,application/pdf" hidden /></label>`
      : `<button class="btn btn-ghost" data-action="importar-edital" data-tip="Conecte o Gemini (passo anterior) para o Mentor ler o PDF automaticamente">${icone("upload")} Importar edital (PDF)</button>`;
    root.innerHTML = `
      <div class="ob-card ob-wide">
        ${steps(4)}
        <h1>Montar seu plano</h1>
        <p class="ob-lead">Escolha sua <b>área</b> e o Mentor já cria as matérias e os tópicos base para você começar hoje. Prefere seu edital exato? Importe o PDF. Sem pressa? Comece do zero — tudo é editável depois.</p>
        <div class="tile-grid ob-areas">
          ${AREAS.map((a) => {
            const rr = resumoArea(a.id);
            return `<button class="tile-pick" data-action="area" data-area="${a.id}">
              <span class="tile-ico">${icone(a.ico)}</span>
              <span class="tile-lbl">${esc(a.nome)}</span>
              <span class="tile-desc">${esc(a.desc)}</span>
              <span class="tile-meta">${rr.materias} matérias · ${rr.topicos} tópicos</span>
            </button>`;
          }).join("")}
        </div>
        <div class="ob-final">
          <button class="btn btn-ghost" data-action="voltar">← Voltar</button>
          <div class="u-row u-wrap">
            ${editalBtn}
            <button class="btn btn-ghost" data-action="zero">Começar do zero</button>
          </div>
        </div>
      </div>`;
    bindActions(root, {
      voltar: () => { passo = 3; app.refresh(); },
      area: (el) => montarPlano("area", el.getAttribute("data-area")),
      "importar-edital": () => {
        store.finalizarOnboarding();
        toast("Importe o PDF do seu edital aqui: o Mentor estrutura as disciplinas e tópicos.", "ok");
        app.navigate("edital");
      },
      zero: () => irComecar(),
    });
    // Import inline do edital (quando a IA está conectada).
    root.querySelector("#ob-edital-file")?.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importarEdital(f);
    });
    return;
  }

  // -------- PASSO 1: Concurso (obrigatório) --------
  if (passo === 1) {
    root.innerHTML = `
      <div class="ob-card">
        <div class="ob-logo">${icone("library")}</div>
        <h1>Bem-vindo ao Mentor Concurso</h1>
        <p class="ob-lead"><b>Seu mentor de estudos para concursos:</b> um ciclo que organiza o que estudar, praticar e revisar até o dia da prova.</p>
        <p class="ob-steps" style="justify-content:center; display:flex">São só 3 passos rápidos. Comece informando o concurso.</p>
        <div class="ob-tema">
          <span class="ob-tema-label">Aparência</span>
          <div class="tema-opcoes">
            <button type="button" class="tema-opt ${(temaOb ?? cfg.tema) !== "escuro" ? "on" : ""}" data-action="set-tema" data-tema="claro"><span class="tema-amostra tema-amostra-claro"></span><span>Claro</span></button>
            <button type="button" class="tema-opt ${(temaOb ?? cfg.tema) === "escuro" ? "on" : ""}" data-action="set-tema" data-tema="escuro"><span class="tema-amostra tema-amostra-escuro"></span><span>Escuro</span></button>
          </div>
        </div>
        <div class="ob-form">
          <label>Qual concurso você vai prestar? <span class="ob-tag-req">obrigatório</span>
            <input id="ob-cargo" type="text" value="${esc(st.concurso ? st.concurso.cargo : "")}" placeholder="Ex.: Escrevente Técnico Judiciário · TJSP" />
          </label>
          <label>Banca <span class="ob-tag-opt">opcional</span>
            <input id="ob-banca" type="text" value="${esc(st.concurso ? st.concurso.banca : "")}" placeholder="Ex.: VUNESP" />
          </label>
          <div class="ob-final" style="border:0; padding:0; margin-top:4px">
            <button class="btn btn-ghost" data-action="pular-tudo" data-tip="Cria só o concurso e já abre o edital. Metas e IA ficam para depois, em Configurações.">Pular para o fim</button>
            <button class="btn btn-primary btn-lg" data-action="criar">Continuar →</button>
          </div>
        </div>
        ${suportaSyncNuvem() ? `<p class="ob-jatenho">Já usa o Mentor em outro aparelho? <button type="button" class="lnk" data-action="restaurar-nuvem">Restaurar meus dados da nuvem</button></p>` : ""}
        <p class="ob-foot">${icone("check")} Funciona sem internet e sem cadastro &nbsp;·&nbsp; ${icone("check")} Tema claro ou escuro &nbsp;·&nbsp; ${icone("check")} A IA é opcional (você conecta quando quiser). Tudo é ajustável depois em Configurações.</p>
      </div>`;

    bindActions(root, {
      "set-tema": (el) => {
        temaOb = el.getAttribute("data-tema") === "escuro" ? "escuro" : "claro";
        // aplica ao vivo sem re-render (preserva o que já foi digitado)
        document.documentElement.setAttribute("data-tema", temaOb);
        root.querySelectorAll(".tema-opt").forEach((b) => b.classList.toggle("on", b.getAttribute("data-tema") === temaOb));
      },
      criar: () => {
        if (!salvarConcurso(root, store)) return;
        if (temaOb) store.setConfig({ tema: temaOb });
        passo = 2;
        app.refresh();
      },
      "pular-tudo": () => {
        if (!salvarConcurso(root, store)) return;
        if (temaOb) store.setConfig({ tema: temaOb });
        irComecar();
      },
      // Aparelho novo trazendo os dados pela senha (pula o cadastro do concurso).
      "restaurar-nuvem": async () => {
        const frase = await pedirTexto("Digite a sua senha de sincronização para trazer os seus dados:", { placeholder: "sua senha (a mesma dos outros aparelhos)", rotuloOk: "Restaurar" });
        if (!frase || !frase.trim()) return;
        toast("Restaurando da nuvem…");
        try {
          await restaurarDaNuvem(frase);
          toast("Pronto! Seus dados foram restaurados neste aparelho.", "ok");
          app.refresh();
        } catch (e) {
          const msg = e.code === "COFRE_VAZIO" ? "Não encontrei dados na nuvem para essa senha. Confira a senha, ou comece um novo plano."
            : e.code === "SENHA_ERRADA" ? "Senha incorreta para este cofre."
            : "Não consegui restaurar: " + e.message;
          toast(msg, "erro");
        }
      },
    });
    return;
  }

  // -------- PASSO 2: Prova e ritmo (opcional) --------
  if (passo === 2) {
    root.innerHTML = `
      <div class="ob-card ob-wide">
        ${steps(2)}
        <h1>Prova e ritmo de estudo <span class="ob-tag-opt">opcional</span></h1>
        <p class="ob-lead">Tem data da prova ou uma meta de horas em mente? Informe e o app acompanha seu ritmo. Sem pressa: deixe em branco e ajuste quando quiser em Configurações.</p>
        <div class="ob-form">
          <div class="ob-grupo">
            <h3>${icone("calendar")} Prova</h3>
            <div style="max-width:240px">
              <label class="u-mb-8">Data da prova
                <input id="ob-prova" type="date" value="${esc(cfg.dataProva || "")}" ${cfg.dataProva ? "" : "disabled"} />
              </label>
              <label class="inline small u-fw-regular"><input id="ob-prova-pre" type="checkbox" ${cfg.dataProva ? "" : "checked"} /> Ainda sem data de prova</label>
            </div>
          </div>
          <div class="ob-grupo">
            <h3>${icone("target")} Metas</h3>
            <div class="form-row">
              <label>Meta diária ${campoHM("ob-meta-dia", cfg.metaDiariaMin, semMetas)}</label>
              <label>Meta semanal ${campoHM("ob-meta-sem", cfg.metaSemanalMin, semMetas)}</label>
              <label>Meta mensal ${campoHM("ob-meta-mes", cfg.metaMensalMin, semMetas)}</label>
            </div>
            <label class="inline small" style="font-weight:400; display:flex; width:fit-content"><input id="ob-meta-pre" type="checkbox" ${semMetas ? "checked" : ""} /> Sem meta por enquanto</label>
          </div>
        </div>
        <div class="ob-final">
          <button class="btn btn-ghost" data-action="voltar">← Voltar</button>
          <div class="u-row u-wrap">
            <button class="btn btn-ghost" data-action="pular">Pular</button>
            <button class="btn btn-primary" data-action="salvar">Continuar →</button>
          </div>
        </div>
      </div>`;

    bindActions(root, {
      voltar: () => { passo = 1; app.refresh(); },
      pular: () => { passo = 3; app.refresh(); },
      salvar: () => {
        const metaPre = root.querySelector("#ob-meta-pre").checked;
        store.setConfig({
          dataProva: root.querySelector("#ob-prova-pre").checked ? null : (root.querySelector("#ob-prova").value || null),
          metaDiariaMin: metaPre ? 0 : hm("ob-meta-dia"),
          metaSemanalMin: metaPre ? 0 : hm("ob-meta-sem"),
          metaMensalMin: metaPre ? 0 : hm("ob-meta-mes"),
          // Disponibilidade diária = meta diária (mesmo conceito); alimenta o Mentor.
          dispDiariaMin: metaPre ? 0 : hm("ob-meta-dia"),
        });
        passo = 3;
        app.refresh();
      },
    });
    // Checkboxes "não definida": desabilitam (e zeram) os campos.
    const ligarNaoDef = (chkSel, inputSels, vazio) => {
      root.querySelector(chkSel)?.addEventListener("change", (e) => {
        inputSels.forEach((s) => {
          const el = root.querySelector(s);
          if (el) { el.disabled = e.target.checked; if (e.target.checked) el.value = vazio; }
        });
      });
    };
    ligarNaoDef("#ob-prova-pre", ["#ob-prova"], "");
    ligarNaoDef("#ob-meta-pre", ["#ob-meta-dia-h", "#ob-meta-dia-m", "#ob-meta-sem-h", "#ob-meta-sem-m", "#ob-meta-mes-h", "#ob-meta-mes-m"], "0");
    return;
  }

  // -------- PASSO 3: IA (opcional) --------
  const prov = cfg.iaProvider || "offline";
  // Provedores sem chave de API (desabilitam o campo): Offline e Claude Code local
  // (usa a autenticação local do Claude Code, sem chave). Espelha o config.js.
  const inativa = ["offline", "claude-cli"].includes(prov);
  root.innerHTML = `
    <div class="ob-card ob-wide">
      ${steps(3)}
      <h1>Mentor IA <span class="ob-tag-opt">opcional</span></h1>
      <p class="ob-lead">Com a IA (chave grátis do Gemini), o Mentor gera questões, corrige redações e conversa com você. Conecte agora ou depois.</p>
      <p class="small ob-ia-status">Status: ${iaDisponivel(cfg) ? '<b style="color:var(--success)">IA conectada</b> ' : '<b>Offline</b> — a IA é opcional; conecte agora ou depois em Configurações.'}</p>
      <div class="ob-form">
        <div class="form-row">
          <label>Provedor
            <select id="ob-ia">
              <option value="offline" ${prov === "offline" ? "selected" : ""}>Offline (sem IA)</option>
              <option value="gemini" ${prov === "gemini" ? "selected" : ""}>Google Gemini (chave grátis)</option>
              <option value="claude-cli" ${prov === "claude-cli" ? "selected" : ""}>Claude Code local (pessoal · desktop)</option>
            </select>
          </label>
          <label>Chave de API
            <input id="ob-key" type="password" value="${esc(cfg.iaKey || "")}" placeholder="cole a chave aqui" ${inativa ? "disabled" : ""} />
          </label>
        </div>
        ${prov === "gemini" ? `<div class="form-acoes">
          <button class="btn btn-ghost btn-sm" data-action="testar">${icone("plug-zap")} Testar conexão</button>
          <span class="small" id="ob-ia-msg"></span>
        </div>
        <p class="muted small">Pegue a chave grátis em aistudio.google.com/apikey, cole acima e clique em Testar conexão (ele escolhe sozinho o melhor modelo grátis que sua chave aceita).</p>` : ""}
      </div>
      <div class="ob-final">
        <button class="btn btn-ghost" data-action="voltar">← Voltar</button>
        <div class="u-row u-wrap">
          <button class="btn btn-ghost" data-action="offline" data-tip="Segue sem IA. Você pode conectar a qualquer momento em Configurações.">Seguir offline</button>
          <button class="btn btn-primary btn-lg" data-action="concluir">Continuar →</button>
        </div>
      </div>
    </div>`;

  const setMsg = (html, cor) => {
    const m = root.querySelector("#ob-ia-msg");
    if (m) { m.innerHTML = html; m.style.color = cor || ""; }
  };
  const lerIA = () => ({
    iaProvider: root.querySelector("#ob-ia").value,
    iaKey: root.querySelector("#ob-key")?.value || "",
    iaModelo: cfg.iaModelo || "",
  });

  bindActions(root, {
    voltar: () => { passo = 2; app.refresh(); },
    offline: () => { store.setConfig({ iaProvider: "offline" }); passo = 4; app.refresh(); },
    concluir: () => { store.setConfig(lerIA()); passo = 4; app.refresh(); },
    testar: async (el) => {
      const c = lerIA();
      if (!c.iaKey.trim()) { setMsg("Cole a chave antes de testar.", "var(--danger)"); return; }
      el.disabled = true;
      const txt = el.textContent;
      el.textContent = "Testando…";
      setMsg("Testando conexão (pode tentar alguns modelos)…");
      try {
        const { ok, modelo } = await testarConexao(c);
        if (ok) {
          c.iaModelo = modelo || "";
          store.setConfig(c);
          setMsg(`Conectado com o modelo <b>${modelo || "padrão"}</b>.`, "var(--success)");
        } else {
          setMsg("Conectou, mas a resposta foi inesperada.", "var(--danger)");
        }
      } catch (e) {
        setMsg("Falha: " + esc(e.message), "var(--danger)");
      } finally {
        el.disabled = false;
        el.textContent = txt;
      }
    },
  });

  // Trocar provedor habilita/desabilita a chave e mostra o "Testar conexão".
  root.querySelector("#ob-ia")?.addEventListener("change", (e) => {
    store.setConfig({ iaProvider: e.target.value, iaKey: root.querySelector("#ob-key")?.value || "" });
    app.refresh();
  });
}

// Valida e cria/atualiza o concurso a partir dos campos do passo 1.
function salvarConcurso(root, store) {
  const cargo = root.querySelector("#ob-cargo").value;
  const banca = root.querySelector("#ob-banca").value;
  if (!cargo.trim()) {
    toast("Informe o cargo/concurso.", "erro");
    return false;
  }
  store.criarConcurso({ cargo, banca });
  return true;
}
