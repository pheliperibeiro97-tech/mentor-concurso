// Seletor de escopo unificado para GERAR/EXTRAIR conteúdo (Flashcards, Questões, Itens C/E,
// Mapa mental, Resumo). Base ÚNICA: o MATERIAL importado. O usuário escolhe um material (aula)
// e, opcionalmente, um SUBTÓPICO do índice dele. A geração usa SEMPRE o conteúdo real do
// material (nunca "o conhecimento do Mentor" solto). Resolve um ESCOPO (store.resolverEscopo).
// Janela via abrirJanelaFluxo + shim { store, refresh } (o app.refresh real não alcança a
// janela, que vive fora do root) — mesmo padrão dos outros modais.
import { abrirJanelaFluxo, toast, avisoIA, campoMaterialHTML, ligarCampoMaterial } from "../ui.js";
import { disciplinaDoDocumento } from "../estrutura.js";
import { esc, humanizarErroIA } from "../util.js";
import { icone } from "../icones.js";

// Cada tipo sabe seu rótulo, padrão de quantidade e como gerar/extrair pelo store.
const TIPOS = {
  flashcards: { rotulo: "flashcards", padrao: 6, pedeQuantidade: true, gerar: (s, e, n, d) => s.gerarFlashcardsDeEscopo(e, n, d), extrair: null },
  questoes: { rotulo: "questões", padrao: 5, pedeQuantidade: true, gerar: (s, e, n, d) => s.gerarQuestoesDeEscopo(e, n, d), extrair: (s, e) => s.extrairQuestoesDeEscopo(e) },
  ce: { rotulo: "itens Certo/Errado", padrao: 6, pedeQuantidade: true, gerar: (s, e, n, d) => s.gerarQuestoesCEDeEscopo(e, n, d), extrair: (s, e) => s.extrairQuestoesCEDeEscopo(e) },
  // Mapa: agora TAMBÉM pergunta a quantidade (coerência com as demais telas). Gera N mapas do
  // mesmo escopo (variações) chamando o gerador N vezes.
  mapa: { rotulo: "mapa mental", padrao: 1, pedeQuantidade: true, semNivel: true, gerar: async (s, e, n) => { const out = []; for (let i = 0; i < Math.max(1, n || 1); i++) out.push(await s.gerarMapaMentalDeEscopo(e)); return out; }, extrair: null },
  resumo: { rotulo: "resumo", padrao: 1, pedeQuantidade: false, gerar: (s, e) => s.gerarResumoDeEscopo(e), extrair: null },
};

// Tela que mostra o resultado de cada tipo (para onde navegar depois de gerar).
const DESTINO = { flashcards: "flashcards", questoes: "pratica", ce: "pratica-ce", mapa: "mapas", resumo: "resumos" };

// Contexto (disciplina · tópico) do material, para o usuário se situar.
function contextoDoMaterial(st, doc) {
  // A disciplina vem do MATERIAL (campo próprio), não do 1º tópico vinculado: material sem
  // vínculo nenhum mostrava contexto vazio, e material com vínculo herdado mostrava a
  // disciplina do vínculo — que é justamente o que podia estar errado.
  const disc = disciplinaDoDocumento(st, doc);
  const tid = doc && (doc.topicoId || (Array.isArray(doc.topicoIds) && doc.topicoIds[0]));
  const t = tid ? st.topicos.find((x) => x.id === tid) : null;
  if (disc && t) return `${disc.nome} · ${t.nome}`;
  if (disc) return disc.nome;
  return t ? t.nome : "";
}

export function abrirSeletorEscopo(app, { tipo = "flashcards", titulo = "Gerar com IA", permiteExtrair = false } = {}) {
  const store = app.store;
  if (!store.iaDisponivel()) return avisoIA(app, titulo);
  const cfg = TIPOS[tipo] || TIPOS.flashcards;
  // matBlocos: subtópicos (índices) marcados — pode ser mais de um, para gerar combinando
  // vários de uma vez (pedido do usuário: "e se eu quiser dois?"). Vazio = material inteiro.
  const estado = { docId: "", matBlocos: [], n: cfg.padrao, dificuldade: "medio" };
  let ocupado = false;
  let rerender = () => {};
  let fecharJanela = () => {};

  // Rótulo do lote: a tela de destino abre mostrando SÓ o que acabou de ser gerado.
  const rotuloLote = (escopo) => `de «${String((escopo && escopo.contexto) || "material").slice(0, 40)}»`;

  // Terminou de gerar/extrair: fecha a janela e ABRE a tela do resultado, como fazem os demais
  // fluxos (documentos.js, revtopico.js, mapa-mental.js). Antes daqui saía só um toast e um
  // app.refresh() com a janela ainda aberta por cima — no computador dava para ver a lista
  // atrás da caixa; no celular a janela ocupa a tela toda e a impressão era de que nada
  // acontecera depois de gerar.
  function abrirResultado(lote, rot) {
    fecharJanela();
    app.navigate(DESTINO[tipo] || "flashcards", { lote, loteRotulo: rot });
  }

  // Escopo = 1 material (com subtópico(s) opcionais — pode marcar mais de um).
  function escopoAtual() {
    if (!estado.docId) return { texto: "", modo: "material" };
    const bis = estado.matBlocos.length ? estado.matBlocos : null;
    const bi = bis && bis.length === 1 ? bis[0] : null;
    return store.resolverEscopo({ docId: estado.docId, bi, bis });
  }

  async function gerar() {
    if (ocupado) return;
    const escopo = escopoAtual();
    if (!escopo.texto) return toast("Escolha um material importado para gerar.", "erro");
    ocupado = true;
    rerender();
    toast(`Gerando ${cfg.rotulo} com IA…`);
    const rot = rotuloLote(escopo);
    const lote = store.iniciarLoteGeracao(rot);
    let qtd = 0;
    try {
      const res = await cfg.gerar(store, escopo, estado.n, estado.dificuldade);
      qtd = Array.isArray(res) ? res.length : res ? 1 : 0;
      toast(qtd ? `Gerei ${qtd} ${cfg.rotulo} (IA).` : "A IA não retornou nada.", qtd ? "ok" : "erro");
    } catch (e) {
      toast(humanizarErroIA(e), "erro");
    } finally {
      store.encerrarLoteGeracao();
      ocupado = false;
      if (qtd) abrirResultado(lote, rot);
      else rerender();
    }
  }

  async function extrair() {
    if (ocupado || !cfg.extrair) return;
    const escopo = escopoAtual();
    if (escopo.modo !== "material" || !escopo.docIds || !escopo.docIds.length) return toast("Escolha um material (ou subtópico) para extrair.", "erro");
    ocupado = true;
    rerender();
    toast(`Extraindo ${cfg.rotulo} do material…`);
    const rot = rotuloLote(escopo);
    const lote = store.iniciarLoteGeracao(rot);
    let qtd = 0;
    try {
      const res = await cfg.extrair(store, escopo);
      qtd = Array.isArray(res) ? res.length : 0;
      toast(qtd ? `Extraí ${qtd} ${cfg.rotulo} do material.` : "Não encontrei itens prontos no material.", qtd ? "ok" : "erro");
    } catch (e) {
      toast("A IA não conseguiu extrair agora. Tente de novo em instantes.", "erro");
    } finally {
      store.encerrarLoteGeracao();
      ocupado = false;
      if (qtd) abrirResultado(lote, rot);
      else rerender();
    }
  }

  function materialHTML(st) {
    const docs = st.documentos || [];
    if (!docs.length) return `<p class="muted small u-mt-8">Você ainda não importou nenhum material. Vá em <b>Materiais</b> e adicione um material para poder gerar a partir dele.</p>`;
    const doc = estado.docId ? docs.find((d) => d.id === estado.docId) : null;
    if (estado.docId && !doc) estado.docId = "";
    const blocos = (doc && doc.estrutura && doc.estrutura.blocos) || [];
    estado.matBlocos = estado.matBlocos.filter((bi) => blocos[bi]);
    const ctx = doc ? contextoDoMaterial(st, doc) : "";
    return `
      <label class="inline u-mb-8 u-block">Material (aula)
        ${campoMaterialHTML(st, { id: "escopo-mat", selecionado: estado.docId, vazio: "— escolha um material —", incluirVazio: false })}
      </label>
      ${ctx ? `<p class="muted small u-mt-4 u-mb-4">${icone("list-checks")} ${esc(ctx)}</p>` : ""}
      ${
        blocos.length
          ? `<label class="inline u-block u-mt-8">Subtópicos (índice) <span class="muted small">— marque um ou mais; nenhum marcado = material inteiro</span></label>
             <div class="escopo-blocos" data-rolagem="escopo-blocos">
               ${blocos.map((b, bi) => `<label class="escolha-item escolha-check escopo-bloco-item"><input type="checkbox" data-se="matbloco" value="${bi}" ${estado.matBlocos.includes(bi) ? "checked" : ""} /> <span class="escolha-item-txt">${esc(`${b.numero || ""} ${b.titulo}`.trim())}</span></label>`).join("")}
             </div>`
          : doc
            ? `<p class="muted small u-mt-8">Este material não tem índice aplicado — será usado inteiro.</p>`
            : ""
      }`;
  }

  abrirJanelaFluxo({
    titulo,
    render: (corpo, ctx) => {
      rerender = ctx.rerender;
      fecharJanela = ctx.fechar;
      const st = store.get();
      const escopo = escopoAtual();
      const temConteudo = !!(escopo && escopo.texto);

      corpo.innerHTML = `
        <p class="muted small" style="margin-top:0; display:flex; align-items:center; gap:7px"><span class="orb orb-xs" aria-hidden="true"></span><span>A IA gera a partir do <b>material importado</b> que você escolher (ou de um <b>subtópico</b> específico dele).</span></p>
        ${materialHTML(st)}
        ${
          cfg.pedeQuantidade
            ? `<div class="form-row" style="gap:14px; margin-top:12px; align-items:flex-end">
                <label class="inline">Quantidade <input type="number" data-se="n" min="1" max="30" value="${estado.n}" style="width:64px; margin-left:6px" /></label>
                ${
                  cfg.semNivel
                    ? ""
                    : `<label class="inline">Nível
                        <select data-se="dif">
                          <option value="facil" ${estado.dificuldade === "facil" ? "selected" : ""}>Fácil</option>
                          <option value="medio" ${estado.dificuldade === "medio" ? "selected" : ""}>Médio</option>
                          <option value="dificil" ${estado.dificuldade === "dificil" ? "selected" : ""}>Difícil</option>
                          <option value="muito_dificil" ${estado.dificuldade === "muito_dificil" ? "selected" : ""}>Muito difícil</option>
                          <option value="avancada" ${estado.dificuldade === "avancada" ? "selected" : ""}>Avançada (banca pesada)</option>
                        </select>
                      </label>`
                }
              </div>`
            : ""
        }
        <p class="muted small u-mt-12">${
          temConteudo
            ? "Escopo: " + esc(escopo.contexto || "")
            : "Escolha um material."
        }</p>
        <div class="form-acoes">
          ${cfg.extrair && permiteExtrair ? `<button class="btn btn-ghost" data-se="extrair" ${ocupado ? "disabled" : ""} data-tip="Puxa itens que JÁ existem no material (não inventa).">${icone("clipboard-list")} Extrair do material</button>` : ""}
          <button class="btn btn-ia ${ocupado ? "is-generating" : ""}" data-se="gerar" ${!temConteudo || ocupado ? "disabled" : ""} data-tip="Gera a partir do material do escopo escolhido.">${ocupado ? "Processando…" : `${icone("sparkles")} Gerar`}</button>
        </div>`;

      // ---- listeners (reatados a cada rerender) ----
      ligarCampoMaterial(corpo, st, {
        id: "escopo-mat",
        msg: "Escolha o material (aula)",
        incluirVazio: false,
        aoTrocar: (docId) => { estado.docId = docId; estado.matBlocos = []; rerender(); },
      });
      corpo.querySelectorAll('[data-se="matbloco"]').forEach((chk) =>
        chk.addEventListener("change", (e) => {
          const bi = parseInt(e.target.value, 10);
          if (e.target.checked) { if (!estado.matBlocos.includes(bi)) estado.matBlocos.push(bi); }
          else estado.matBlocos = estado.matBlocos.filter((x) => x !== bi);
          rerender();
        })
      );
      // Quantidade/nível: atualizam o estado SEM rerender (não perder foco do campo).
      corpo.querySelector('[data-se="n"]')?.addEventListener("input", (e) => {
        estado.n = Math.max(1, Math.min(30, parseInt(e.target.value, 10) || cfg.padrao));
      });
      corpo.querySelector('[data-se="dif"]')?.addEventListener("change", (e) => {
        estado.dificuldade = e.target.value;
      });
      corpo.querySelector('[data-se="gerar"]')?.addEventListener("click", () => gerar());
      corpo.querySelector('[data-se="extrair"]')?.addEventListener("click", extrair);
    },
  });
}
