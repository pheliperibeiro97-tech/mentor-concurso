// Tela "Mapas mentais": cria (Gerar / import), lista (com filtro por tópico), abre,
// imprime (individual ou seleção), revisa (escada da memória) e gera flashcards/questões.
import { bindActions, toast, header, vazio, confirmar, pedirNumero, escolher, pedirTexto, avisoIA, imprimir, iconMapa } from "../ui.js";
import { esc, fmtData, todayISO } from "../util.js";
import { icone } from "../icones.js";
import { abrirMapaCompleto, gerarEAbrirMapa } from "../mapa-mental.js";
import { arquivoParaBase64 } from "../pdf.js";
import { abrirSeletorEscopo } from "./seletor-escopo.js";

let filtroTop = ""; // "" = todos · id de tópico · "sem" = sem tópico

function nomeTop(st, m) {
  if (!m.topicoId) return "";
  const t = st.topicos.find((x) => x.id === m.topicoId);
  if (!t) return "";
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return (d ? d.nome + " · " : "") + t.nome;
}

// Árvore → HTML (lista aninhada) para IMPRESSÃO.
function arvoreParaHTML(m) {
  const arv = m.arvore || {};
  const ramos = (rs) => (rs && rs.length ? `<ul>${rs.map((r) => `<li>${esc(r.titulo)}${ramos(r.ramos)}</li>`).join("")}</ul>` : "");
  // Mapas importados de arquivo guardam a imagem original — vai junto na impressão.
  const img = m.imgData ? `<div><img src="${m.imgData}" alt="" style="max-width:100%; margin-top:8px" /></div>` : "";
  return `<div class="mm-print-bloco"><h2>${esc(m.titulo || "Mapa mental")}</h2>${ramos(arv.ramos)}${img}</div>`;
}

// Outline (texto colado) → árvore {titulo, ramos[]}. Offline. Aceita indentação (espaços/tabs),
// marcadores (-, *, •) e títulos markdown (#). O 1º item é o tema central.
function parseOutline(texto) {
  const nodes = String(texto || "")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      const indent = (l.match(/^[\t ]*/)[0] || "").replace(/\t/g, "  ").length;
      let txt = l.trim();
      const h = txt.match(/^(#{1,6})\s+(.*)$/);
      let nivel;
      if (h) { nivel = h[1].length - 1; txt = h[2].trim(); }
      else { txt = txt.replace(/^[-*•·]\s+/, "").trim(); nivel = Math.floor(indent / 2); }
      return { txt, nivel };
    })
    .filter((n) => n.txt);
  if (!nodes.length) return null;
  const root = { titulo: nodes[0].txt, ramos: [] };
  const pilha = [{ nivel: nodes[0].nivel, node: root }];
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i];
    const novo = { titulo: n.txt, ramos: [] };
    while (pilha.length > 1 && pilha[pilha.length - 1].nivel >= n.nivel) pilha.pop();
    pilha[pilha.length - 1].node.ramos.push(novo);
    pilha.push({ nivel: n.nivel, node: novo });
  }
  return root;
}

export default function renderMapas(root, app) {
  const { store } = app;
  const st = store.get();
  const hoje = todayISO();
  const maps = st.mapasMentais.slice().sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
  const due = maps.filter((m) => m.revisao && m.revisao.proxima <= hoje);
  const filtrados = maps.filter((m) => (filtroTop === "" ? true : filtroTop === "sem" ? !m.topicoId : m.topicoId === filtroTop));

  const sub = (m) => (nomeTop(st, m) ? ` <span class="muted small">${esc(nomeTop(st, m))}</span>` : "");
  const seloOrig = (m) => ((m.imgData || m.pdfData) && !m.binarioDescartado ? ` <span class="muted small" data-tip="Tem a imagem/PDF original (ver dentro do mapa).">${icone("image")} original</span>` : "");

  const cardRevisar = (m) => `<div class="card mapa-card">
      <div class="mapa-card-top"><b>${esc(m.titulo)}</b>${sub(m)}</div>
      <div class="barra-acoes">
        <button class="btn btn-soft btn-sm" data-action="abrir" data-id="${m.id}">Abrir e revisar</button>
        <span class="spacer"></span>
        <button class="btn-grad bg-esqueci" data-action="rev-esqueci" data-id="${m.id}" data-tip="Reinicia a escada (revisar amanhã).">Esqueci</button>
        <button class="btn-grad bg-lembrei" data-action="rev-ok" data-id="${m.id}" data-tip="Sobe um degrau na escada da memória.">Lembrei</button>
        <button class="btn-grad bg-facil" data-action="rev-facil" data-id="${m.id}" data-tip="Sobe dois degraus.">Fácil</button>
      </div>
    </div>`;

  const cardMapa = (m) => `<div class="card mapa-card">
      <div class="mapa-card-top">
        <input type="checkbox" class="mapa-chk" data-id="${m.id}" title="Selecionar para imprimir" />
        <b>${esc(m.titulo)}</b>${sub(m)}${seloOrig(m)}${m.revisao ? ` <span class="muted small">· próxima revisão ${fmtData(m.revisao.proxima)}</span>` : ""}
      </div>
      <div class="barra-acoes">
        <button class="btn btn-soft btn-sm" data-action="abrir" data-id="${m.id}" data-tip="Abrir o mapa (lá dentro: imprimir, agendar revisão, gerar flashcards/questões).">Abrir</button>
        <span class="spacer"></span>
        <button class="lnk lnk-danger" data-action="remover" data-id="${m.id}">${icone("x")} Remover</button>
      </div>
    </div>`;

  // Filtro por tópico (multitópico, como nas demais telas), agrupado por disciplina.
  const porDisc = {};
  st.topicos.forEach((t) => { (porDisc[t.disciplinaId] = porDisc[t.disciplinaId] || []).push(t); });
  const grupos = st.disciplinas
    .map((d) => {
      const tops = porDisc[d.id] || [];
      if (!tops.length) return "";
      return `<optgroup label="${esc(d.nome)}">${tops.map((t) => `<option value="${t.id}" ${filtroTop === t.id ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</optgroup>`;
    })
    .join("");
  const filtroHTML = `<label class="inline">Filtrar:
      <select id="mapa-filtro">
        <option value="" ${filtroTop === "" ? "selected" : ""}>Todos os tópicos</option>
        ${grupos}
        <option value="sem" ${filtroTop === "sem" ? "selected" : ""}>Sem tópico</option>
      </select>
    </label>`;

  // Topo: IMPRIMIR (seleção/todos) — onde o Gerar estava antes.
  const imprimirBtn = `<button class="btn btn-ghost btn-sm" data-action="imprimir-mapas" data-tip-pos="bottom" data-tip="Imprime os mapas marcados (ou todos do filtro atual, se nenhum marcado).">${icone("printer")} Imprimir</button>
    <input id="mapa-file" type="file" accept=".pdf,image/*,application/pdf" hidden />`;
  // Gerar fica na MESMA LINHA de "Todos os mapas".
  const gerarBtn = `<button class="btn btn-ia btn-sm" data-action="gerar-mapa" data-tip="Criar um mapa mental: por IA (tópico/material/resumo/tema/arquivo) ou colando uma estrutura escrita.">${icone("sparkles")} Gerar mapa mental</button>`;

  root.innerHTML = `
    ${header("Mapas mentais", "Suas ideias em árvore. Crie a partir de tópico, material, resumo, tema, arquivo ou do zero; revise na escada da memória e gere flashcards e questões a partir deles.", imprimirBtn)}
    ${due.length ? `<div class="plano-h"><h2>Para revisar hoje</h2><span class="cnt">${due.length}</span></div>${due.map(cardRevisar).join("")}` : ""}
    <div class="plano-h mapa-listhead" style="align-items:center">
      <h2>Todos os mapas</h2>
      <span class="cnt">${filtrados.length}${filtroTop ? ` de ${maps.length}` : ""}</span>
      <span class="sp"></span>
      ${maps.length ? filtroHTML : ""}
      ${gerarBtn}
    </div>
    ${filtrados.length ? filtrados.map(cardMapa).join("") : vazio(maps.length ? "Nenhum mapa neste filtro" : "Nenhum mapa mental ainda", maps.length ? "Troque o filtro ou gere um novo mapa." : "Clique em Gerar mapa mental (tópico, material, resumo, tema livre, arquivo ou estrutura escrita), ou gere pelo Dossiê/chat.", iconMapa)}
  `;

  const abrir = (id) => { const m = store.get().mapasMentais.find((x) => x.id === id); if (m) abrirMapaCompleto(store, app, m); };

  root.querySelector("#mapa-filtro")?.addEventListener("change", (e) => { filtroTop = e.target.value; app.refresh(); });

  // Arquivo (PDF/imagem) → Visão lê (1 chamada), monta a árvore e GUARDA o original (visual).
  const mapaFile = root.querySelector("#mapa-file");
  if (mapaFile) {
    mapaFile.addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar mapa de arquivo");
      const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
      const ehImg = (f.type || "").startsWith("image/");
      if (!ehPdf && !ehImg) return toast("Envie um PDF ou uma imagem.", "erro");
      if (f.size > 14 * 1024 * 1024) return toast("Arquivo muito grande (máx. 14 MB).", "erro");
      const dataB64 = await arquivoParaBase64(f);
      const mimeType = ehPdf ? "application/pdf" : f.type || "image/png";
      const contexto = (f.name || "").replace(/\.[^.]+$/, "");
      gerarEAbrirMapa(store, app, () => store.gerarMapaMentalDeArquivo(dataB64, mimeType, { contexto }));
    });
  }

  bindActions(root, {
    abrir: (el) => abrir(el.getAttribute("data-id")),
    "print-um": (el) => { const m = store.get().mapasMentais.find((x) => x.id === el.getAttribute("data-id")); if (m) imprimir(`Mapa mental — ${m.titulo}`, arvoreParaHTML(m)); },
    "imprimir-mapas": () => {
      const marcados = [...root.querySelectorAll(".mapa-chk:checked")].map((c) => c.getAttribute("data-id"));
      const alvo = marcados.length ? filtrados.filter((m) => marcados.includes(m.id)) : filtrados;
      if (!alvo.length) return toast("Nada para imprimir.", "erro");
      imprimir(`Mapas mentais (${alvo.length})`, alvo.map(arvoreParaHTML).join('<hr class="print-sep"/>'));
    },
    "gerar-mapa": async () => {
      let fonte = await escolher("Criar mapa mental a partir de quê?", [
        { value: "escopo", label: "Tópico, aula ou material" },
        { value: "resumo", label: "Resumo" },
        { value: "tema", label: "Tema livre" },
        { value: "arquivo", label: "Arquivo (PDF/imagem)" },
        { value: "manual", label: "Montar manualmente" },
      ]);
      if (!fonte) return;
      // Tópico/aula/material caem no seletor de escopo unificado (janela própria).
      if (fonte === "escopo") return abrirSeletorEscopo(app, { tipo: "mapa", titulo: "Gerar mapa mental" });
      // Montar manualmente (offline): colar uma estrutura escrita OU começar em branco.
      if (fonte === "manual") {
        const modo = await escolher("Como quer montar?", [
          { value: "outline", label: "Colar uma estrutura escrita", cls: "btn-primary" },
          { value: "zero", label: "Começar em branco" },
        ]);
        if (!modo) return;
        if (modo === "zero") {
          const m = store.addMapaMental({ titulo: "Novo mapa mental", arvore: { titulo: "Novo mapa mental", ramos: [] }, origem: "manual" });
          app.refresh();
          abrirMapaCompleto(store, app, m, { editar: true });
          return;
        }
        // modo === "outline": cai no fluxo de colar estrutura abaixo.
        fonte = "outline";
      }
      // Import OFFLINE de estrutura escrita — não exige IA.
      if (fonte === "outline") {
        const txt = await pedirTexto("Cole a estrutura do mapa (um item por linha; indente com espaços/tab ou use - para os sub-itens):", {
          multilinha: true,
          rotuloOk: "Criar",
          placeholder: "Tema central\n  Ramo 1\n    sub-ramo\n  Ramo 2",
        });
        if (!txt || !txt.trim()) return;
        const arv = parseOutline(txt);
        if (!arv || !arv.ramos.length) return toast("Não consegui ler a estrutura. Use uma linha por item, com indentação.", "erro");
        const m = store.addMapaMental({ titulo: arv.titulo, arvore: arv, origem: "outline" });
        toast("Mapa mental criado.", "ok");
        app.refresh();
        abrirMapaCompleto(store, app, m);
        return;
      }
      // Demais fontes usam IA.
      if (!store.iaDisponivel()) return avisoIA(app, "Gerar mapa mental");
      if (fonte === "arquivo") { root.querySelector("#mapa-file")?.click(); return; }
      if (fonte === "tema") {
        const tema = await pedirTexto("Sobre o que é o mapa mental?", { placeholder: "Ex.: Controle de constitucionalidade", rotuloOk: "Gerar" });
        if (!tema || !tema.trim()) return;
        return gerarEAbrirMapa(store, app, () => store.gerarMapaMentalDeTema(tema));
      }
      const s = store.get();
      let opcoes = [];
      if (fonte === "topico") opcoes = s.topicos.map((t) => ({ value: t.id, label: nomeTop(s, { topicoId: t.id }) || t.nome }));
      else if (fonte === "material") opcoes = s.documentos.filter((d) => (d.texto || "").trim()).map((d) => ({ value: d.id, label: d.titulo || "Material" }));
      else if (fonte === "resumo") opcoes = s.resumos.filter((r) => (r.conteudoHTML || "").replace(/<[^>]+>/g, " ").trim()).map((r) => ({ value: r.id, label: r.titulo || "Resumo" }));
      if (!opcoes.length) return toast("Nada disponível nessa fonte ainda.", "erro");
      const id = await escolher("Escolha a fonte do mapa:", opcoes.slice(0, 80), { lista: true });
      if (!id) return;
      const ger =
        fonte === "topico" ? () => store.gerarMapaMentalDeTopico(id)
        : fonte === "material" ? () => store.gerarMapaMentalDeMaterial(id)
        : () => store.gerarMapaMentalDeResumo(id);
      return gerarEAbrirMapa(store, app, ger);
    },
    "rev-agendar": async (el) => {
      const r = await pedirNumero("Revisar daqui a quantos dias?", { padrao: 1, min: 1, max: 365, presets: [1, 7, 15], rotuloOk: "Agendar" });
      if (!r) return;
      store.agendarRevisaoMapa(el.getAttribute("data-id"), r.n);
      toast("Mapa adicionado à revisão espaçada.");
      app.refresh();
    },
    "rev-cancelar": (el) => { store.cancelarRevisaoMapa(el.getAttribute("data-id")); toast("Mapa fora da revisão."); app.refresh(); },
    "rev-ok": (el) => { const d = store.revisarMapa(el.getAttribute("data-id"), "ok"); toast(`Boa! Próxima revisão em ${d} dia(s).`); app.refresh(); },
    "rev-facil": (el) => { const d = store.revisarMapa(el.getAttribute("data-id"), "facil"); toast(`Fácil! Próxima em ${d} dia(s).`); app.refresh(); },
    "rev-esqueci": (el) => { const d = store.revisarMapa(el.getAttribute("data-id"), "esqueci"); toast(`Sem problema. Revisar de novo em ${d} dia(s).`); app.refresh(); },
    remover: async (el) => { if (await confirmar("Remover este mapa mental?")) { store.removerMapaMental(el.getAttribute("data-id")); toast("Mapa removido."); app.refresh(); } },
  });
}
