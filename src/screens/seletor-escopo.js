// Seletor de escopo unificado para GERAR/EXTRAIR conteúdo (Flashcards, Questões, Itens C/E,
// Mapa mental). O usuário escolhe a BASE e navega:
//  - Edital:   Disciplina → Tópico(s) → Aula (cursinho) → Subtópico (bloco do índice).
//  - Material: o material cadastrado (ex.: "Aula 3") → Subtópico (bloco do índice dele).
// Resolve um ESCOPO (store.resolverEscopo) e gera/extrai vinculando a fonte ao tópico.
// Janela via abrirJanelaFluxo + shim { store, refresh: rerender } (o app.refresh real não
// alcança a janela, que vive fora do root) — mesmo padrão dos outros modais.
import { abrirJanelaFluxo, toast, avisoIA , plural } from "../ui.js";
import { esc } from "../util.js";
import { icone } from "../icones.js";

// Cada tipo sabe seu rótulo, padrão de quantidade e como gerar/extrair pelo store.
const TIPOS = {
  flashcards: { rotulo: "flashcards", padrao: 6, pedeQuantidade: true, gerar: (s, e, n, d) => s.gerarFlashcardsDeEscopo(e, n, d), extrair: null },
  questoes: { rotulo: "questões", padrao: 5, pedeQuantidade: true, gerar: (s, e, n, d) => s.gerarQuestoesDeEscopo(e, n, d), extrair: (s, e) => s.extrairQuestoesDeEscopo(e) },
  ce: { rotulo: "itens Certo/Errado", padrao: 6, pedeQuantidade: true, gerar: (s, e, n, d) => s.gerarQuestoesCEDeEscopo(e, n, d), extrair: (s, e) => s.extrairQuestoesCEDeEscopo(e) },
  mapa: { rotulo: "mapa mental", padrao: 1, pedeQuantidade: false, gerar: (s, e) => s.gerarMapaMentalDeEscopo(e), extrair: null },
  resumo: { rotulo: "resumo", padrao: 1, pedeQuantidade: false, gerar: (s, e) => s.gerarResumoDeEscopo(e), extrair: null },
};

export function abrirSeletorEscopo(app, { tipo = "flashcards", titulo = "Gerar com IA", permiteExtrair = false } = {}) {
  const store = app.store;
  if (!store.iaDisponivel()) return avisoIA(app, titulo);
  const cfg = TIPOS[tipo] || TIPOS.flashcards;
  // base "edital": sel/aulaId/sub · base "material": docId/matBloco
  const estado = { base: "edital", sel: [], disc: "", aulaId: "", sub: "", docId: "", matBloco: "", n: cfg.padrao, dificuldade: "medio" };
  let ocupado = false;
  let rerender = () => {};

  // Monta o escopo conforme a base.
  function escopoAtual() {
    if (estado.base === "material") {
      if (!estado.docId) return { texto: "", modo: "material" };
      const bi = estado.matBloco !== "" ? parseInt(estado.matBloco, 10) : null;
      return store.resolverEscopo({ docId: estado.docId, bi });
    }
    if (estado.sub) {
      const [docId, bi] = estado.sub.split("|");
      return store.resolverEscopo({ topicoIds: estado.sel, aulaId: estado.aulaId || null, docId, bi: parseInt(bi, 10) });
    }
    return store.resolverEscopo({ topicoIds: estado.sel, aulaId: estado.aulaId || null });
  }

  // Fallback "conhecimento do Mentor": quando os tópicos escolhidos não têm material/
  // resumo vinculado, a IA gera a partir do PRÓPRIO conhecimento sobre aqueles temas
  // (nome do tópico + disciplina + banca/cargo). Rotulado com honestidade ("confira").
  function escopoConhecimento() {
    if (estado.base !== "edital" || !estado.sel.length) return null;
    const st = store.get();
    const nomes = estado.sel
      .map((id) => st.topicos.find((t) => t.id === id))
      .filter(Boolean)
      .map((t) => {
        const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
        return d ? `${t.nome} (${d.nome})` : t.nome;
      });
    if (!nomes.length) return null;
    const conc = st.concurso || {};
    const alvo = [conc.cargo, conc.banca].filter(Boolean).join(" · ");
    const texto =
      `Gere conteúdo de estudo para concurso a partir do seu conhecimento sobre os seguintes temas do edital` +
      (alvo ? ` (${alvo})` : "") + `:\n- ` + nomes.join("\n- ") +
      `\nBaseie-se em legislação, doutrina e jurisprudência consolidadas; seja fiel e objetivo.`;
    const topicoId = estado.sel.length === 1 ? estado.sel[0] : null;
    return {
      texto,
      topicoId,
      contexto: nomes.join(", "),
      fonte: { tipo: "conhecimento", titulo: "Conhecimento do Mentor: " + nomes.join(", ") },
      conhecimento: true,
    };
  }

  async function gerar(usarConhecimento) {
    if (ocupado) return;
    let escopo = escopoAtual();
    if ((usarConhecimento || !escopo.texto)) {
      const ec = escopoConhecimento();
      if (ec) escopo = ec;
    }
    if (!escopo.texto) return toast("Escolha um tópico (ou um material/resumo vinculado).", "erro");
    ocupado = true;
    rerender();
    toast(`Gerando ${cfg.rotulo} com IA…`);
    try {
      const res = await cfg.gerar(store, escopo, estado.n, estado.dificuldade);
      const qtd = Array.isArray(res) ? res.length : res ? 1 : 0;
      toast(qtd ? `Gerei ${qtd} ${cfg.rotulo} (IA).` : "A IA não retornou nada.", qtd ? "ok" : "erro");
      app.refresh();
    } catch (e) {
      toast("Não consegui gerar agora. Tente de novo em instantes.", "erro");
    } finally {
      ocupado = false;
      rerender();
    }
  }

  async function extrair() {
    if (ocupado || !cfg.extrair) return;
    const escopo = escopoAtual();
    if (escopo.modo !== "material" || !escopo.docIds || !escopo.docIds.length) return toast("Para extrair, use a base Material e escolha um material/subtópico.", "erro");
    ocupado = true;
    rerender();
    toast(`Extraindo ${cfg.rotulo} do material…`);
    try {
      const res = await cfg.extrair(store, escopo);
      const qtd = Array.isArray(res) ? res.length : 0;
      toast(qtd ? `Extraí ${qtd} ${cfg.rotulo} do material.` : "Não encontrei itens prontos no material.", qtd ? "ok" : "erro");
      app.refresh();
    } catch (e) {
      toast("A IA não conseguiu extrair agora. Tente de novo em instantes.", "erro");
    } finally {
      ocupado = false;
      rerender();
    }
  }

  // ---- blocos HTML por base ----
  function editalHTML(st) {
    const grupos = st.disciplinas
      .filter((d) => !estado.disc || d.id === estado.disc)
      .map((d) => {
        const tops = st.topicos.filter((t) => t.disciplinaId === d.id);
        if (!tops.length) return "";
        const todos = tops.every((t) => estado.sel.includes(t.id));
        return `<div class="ft-grupo">
          <label class="ft-disc"><input type="checkbox" data-se-disc="${d.id}" ${todos ? "checked" : ""} /> <b>${esc(d.nome)}</b> <span class="muted small">(disciplina toda)</span></label>
          ${tops.map((t) => `<label class="ft-top"><input type="checkbox" data-se-top="${t.id}" ${estado.sel.includes(t.id) ? "checked" : ""} /> ${esc(t.nome)}</label>`).join("")}
        </div>`;
      })
      .join("");
    const aulas = store.aulasDosTopicos(estado.sel);
    const subs = store.subtopicosDoEscopo(estado.sel, estado.aulaId || null);
    if (estado.aulaId && !aulas.some((a) => a.id === estado.aulaId)) estado.aulaId = "";
    if (estado.sub && !subs.some((s) => `${s.docId}|${s.bi}` === estado.sub)) estado.sub = "";
    return `
      <label class="inline u-mb-8">Disciplina
        <select data-se="disc" style="margin-left:6px">
          <option value="">Todas</option>
          ${st.disciplinas.map((d) => `<option value="${d.id}" ${estado.disc === d.id ? "selected" : ""}>${esc(d.nome)}</option>`).join("")}
        </select>
      </label>
      <div class="card ft-painel">${grupos || `<p class="muted small">Nenhum tópico cadastrado ainda.</p>`}</div>
      ${
        aulas.length
          ? `<label class="inline u-mt-8">Aula
              <select data-se="aula" style="margin-left:6px">
                <option value="">Todas as aulas</option>
                ${aulas.map((a) => `<option value="${a.id}" ${estado.aulaId === a.id ? "selected" : ""}>${esc(a.nome)}</option>`).join("")}
              </select>
            </label>`
          : ""
      }
      ${
        subs.length
          ? `<label class="inline u-mt-8">Subtópico (índice)
              <select data-se="sub" style="margin-left:6px; max-width:340px">
                <option value="">Material inteiro</option>
                ${subs.map((s) => `<option value="${s.docId}|${s.bi}" ${estado.sub === `${s.docId}|${s.bi}` ? "selected" : ""}>${esc(s.rotulo)}</option>`).join("")}
              </select>
            </label>`
          : ""
      }`;
  }

  function materialHTML(st) {
    const docs = st.documentos || [];
    const doc = estado.docId ? docs.find((d) => d.id === estado.docId) : null;
    if (estado.docId && !doc) estado.docId = "";
    const blocos = (doc && doc.estrutura && doc.estrutura.blocos) || [];
    if (estado.matBloco !== "" && !blocos[parseInt(estado.matBloco, 10)]) estado.matBloco = "";
    return `
      <label class="inline u-mb-8">Material (aula)
        <select data-se="mat" style="margin-left:6px; max-width:340px">
          <option value="">— escolha —</option>
          ${docs.map((d) => `<option value="${d.id}" ${estado.docId === d.id ? "selected" : ""}>${esc(d.titulo)}</option>`).join("")}
        </select>
      </label>
      ${
        blocos.length
          ? `<label class="inline u-mt-8 u-block">Subtópico (índice)
              <select data-se="matbloco" style="margin-left:6px; max-width:340px">
                <option value="">Material inteiro</option>
                ${blocos.map((b, bi) => `<option value="${bi}" ${estado.matBloco === String(bi) ? "selected" : ""}>${esc(`${b.numero || ""} ${b.titulo}`.trim())}</option>`).join("")}
              </select>
            </label>`
          : doc
            ? `<p class="muted small u-mt-8">Este material não tem índice aplicado — será usado inteiro.</p>`
            : ""
      }`;
  }

  abrirJanelaFluxo({
    titulo,
    render: (corpo, ctx) => {
      rerender = ctx.rerender;
      const st = store.get();
      const escopo = escopoAtual();
      const temConteudo = !!(escopo && escopo.texto);
      const podeConhecimento = !temConteudo && estado.base === "edital" && estado.sel.length > 0;

      corpo.innerHTML = `
        <p class="muted small" style="margin-top:0; display:flex; align-items:center; gap:7px"><span class="orb orb-xs" aria-hidden="true"></span><span>Escolha a <b>base</b> e o escopo. A IA gera a partir desse conteúdo, vinculando a fonte ao tópico.</span></p>
        <div class="tile-grid se-base-grid" role="tablist">
          <button class="tile-pick ${estado.base === "edital" ? "on" : ""}" data-se-base="edital" data-tip="Pelo edital: disciplina → tópico → aula → subtópico.">
            <span class="tile-ico">${icone("list-checks")}</span>
            <span class="tile-lbl">Pelo edital</span>
            <span class="tile-desc">Disciplina → tópico → aula</span>
          </button>
          <button class="tile-pick ${estado.base === "material" ? "on" : ""}" data-se-base="material" data-tip="Pelos materiais cadastrados em Materiais (cada aula) → subtópico do índice.">
            <span class="tile-ico">${icone("library")}</span>
            <span class="tile-lbl">Pelo material</span>
            <span class="tile-desc">Seus materiais importados</span>
          </button>
        </div>
        ${estado.base === "material" ? materialHTML(st) : editalHTML(st)}
        ${
          cfg.pedeQuantidade
            ? `<div class="form-row" style="gap:14px; margin-top:10px; align-items:flex-end">
                <label class="inline">Quantidade <input type="number" data-se="n" min="1" max="30" value="${estado.n}" style="width:64px; margin-left:6px" /></label>
                <label class="inline">Nível
                  <select data-se="dif" style="margin-left:6px">
                    <option value="facil" ${estado.dificuldade === "facil" ? "selected" : ""}>Fácil</option>
                    <option value="medio" ${estado.dificuldade === "medio" ? "selected" : ""}>Médio</option>
                    <option value="dificil" ${estado.dificuldade === "dificil" ? "selected" : ""}>Difícil</option>
                  </select>
                </label>
              </div>`
            : ""
        }
        <p class="muted small u-mt-12">${
          temConteudo
            ? "Escopo: " + esc(escopo.contexto || "")
            : podeConhecimento
              ? `Sem material vinculado — o Mentor gera do próprio conhecimento sobre ${estado.sel.length === 1 ? "o tópico" : "os tópicos"}. Confira sempre.`
              : estado.base === "material"
                ? "Escolha um material."
                : "Escolha ao menos um tópico."
        }</p>
        <div class="form-acoes">
          ${cfg.extrair && permiteExtrair ? `<button class="btn btn-ghost" data-se="extrair" ${ocupado ? "disabled" : ""} data-tip="Puxa itens que JÁ existem no material (base Material).">${icone("clipboard-list")} Extrair do material</button>` : ""}
          ${
            temConteudo
              ? `<button class="btn btn-ia ${ocupado ? "is-generating" : ""}" data-se="gerar" ${ocupado ? "disabled" : ""}>${ocupado ? "Processando…" : `${icone("sparkles")} Gerar`}</button>`
              : `<button class="btn btn-ia ${ocupado ? "is-generating" : ""}" data-se="gerar-conhecimento" ${!podeConhecimento || ocupado ? "disabled" : ""} data-tip="A IA gera a partir do conhecimento dela sobre o tópico (sem material). Confira na fonte.">${ocupado ? "Processando…" : `${icone("sparkles")} Gerar do conhecimento do Mentor`}</button>`
          }
        </div>`;

      // ---- listeners (reatados a cada rerender) ----
      corpo.querySelectorAll("[data-se-base]").forEach((b) =>
        b.addEventListener("click", () => {
          estado.base = b.getAttribute("data-se-base");
          rerender();
        })
      );
      // Edital
      corpo.querySelector('[data-se="disc"]')?.addEventListener("change", (e) => {
        estado.disc = e.target.value;
        rerender();
      });
      corpo.querySelectorAll("[data-se-top]").forEach((cb) =>
        cb.addEventListener("change", () => {
          const id = cb.getAttribute("data-se-top");
          if (cb.checked) estado.sel = [...new Set([...estado.sel, id])];
          else estado.sel = estado.sel.filter((x) => x !== id);
          estado.sub = "";
          rerender();
        })
      );
      corpo.querySelectorAll("[data-se-disc]").forEach((cb) =>
        cb.addEventListener("change", () => {
          const discId = cb.getAttribute("data-se-disc");
          const topIds = st.topicos.filter((t) => t.disciplinaId === discId).map((t) => t.id);
          const todosSel = topIds.length && topIds.every((id) => estado.sel.includes(id));
          if (todosSel) estado.sel = estado.sel.filter((id) => !topIds.includes(id));
          else estado.sel = [...new Set([...estado.sel, ...topIds])];
          estado.sub = "";
          rerender();
        })
      );
      corpo.querySelector('[data-se="aula"]')?.addEventListener("change", (e) => {
        estado.aulaId = e.target.value;
        estado.sub = "";
        rerender();
      });
      corpo.querySelector('[data-se="sub"]')?.addEventListener("change", (e) => {
        estado.sub = e.target.value;
        rerender();
      });
      // Material
      corpo.querySelector('[data-se="mat"]')?.addEventListener("change", (e) => {
        estado.docId = e.target.value;
        estado.matBloco = "";
        rerender();
      });
      corpo.querySelector('[data-se="matbloco"]')?.addEventListener("change", (e) => {
        estado.matBloco = e.target.value;
        rerender();
      });
      // Quantidade/nível: atualizam o estado SEM rerender (não perder foco do campo).
      corpo.querySelector('[data-se="n"]')?.addEventListener("input", (e) => {
        estado.n = Math.max(1, Math.min(30, parseInt(e.target.value, 10) || cfg.padrao));
      });
      corpo.querySelector('[data-se="dif"]')?.addEventListener("change", (e) => {
        estado.dificuldade = e.target.value;
      });
      corpo.querySelector('[data-se="gerar"]')?.addEventListener("click", () => gerar(false));
      corpo.querySelector('[data-se="gerar-conhecimento"]')?.addEventListener("click", () => gerar(true));
      corpo.querySelector('[data-se="extrair"]')?.addEventListener("click", extrair);
    },
  });
}
