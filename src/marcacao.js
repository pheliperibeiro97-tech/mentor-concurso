// Marcação tricromática (dir.4): grifo com significado FIXO sobre um texto.
// 🟡 amarelo = palavras-chave · 🔵 azul = prazos/valores · 🔴 vermelho = restritivas.
// Componente autônomo: gerencia seu próprio subtree e listeners; persiste via store.
// Modos de leitura ativa: normal · só as marcas · recordar (marcas viram lacunas).
import { esc } from "./util.js";
import { icone } from "./icones.js";
import { toast, imprimir, iconImprimir, plural } from "./ui.js";

// 3 cores de SIGNIFICADO FIXO + cores de USO LIVRE (o usuário marca o que quiser).
const CORES_FIXAS = [
  { id: "amarelo", emoji: "🟡", nome: "palavras-chave" },
  { id: "azul", emoji: "🔵", nome: "prazos e valores" },
  { id: "vermelho", emoji: "🔴", nome: "restritivas" },
];
const CORES_LIVRES = [
  { id: "verde", emoji: "🟢", nome: "livre" },
  { id: "roxo", emoji: "🟣", nome: "livre" },
  { id: "laranja", emoji: "🟠", nome: "livre" },
];
const CORES = [...CORES_FIXAS, ...CORES_LIVRES];

// Estado transitório da UI por alvo (pincel, modo de leitura, editor de nota aberto).
// Hoisted para o módulo porque o re-render global (commit→subscribe) re-monta o
// componente; sem isto, abrir o editor de nota fecharia sozinho e o pincel se soltaria.
const ESTADO = new Map();
function estadoDe(chave) {
  if (!ESTADO.has(chave)) ESTADO.set(chave, { brush: null, modo: "normal", notaEditando: null, revelados: new Set() });
  return ESTADO.get(chave);
}

export function montarMarcacao(container, { store, alvoTipo, alvoId, texto, onChange, topicoId, tituloFonte }) {
  const estado = estadoDe(alvoTipo + ":" + alvoId);

  function marcas() {
    return store.marcasDe(alvoTipo, alvoId);
  }
  function grifos() {
    return marcas().filter((m) => m.cor !== "comentario");
  }
  function comentarios() {
    return marcas().filter((m) => m.cor === "comentario");
  }

  // Offset global de um ponto da seleção dentro do textão (concatena os text nodes).
  function offsetGlobal(root, node, off) {
    let total = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n === node) return total + off;
      total += n.textContent.length;
    }
    return total;
  }

  function textoMarcadoHTML() {
    const ms = grifos();
    if (estado.modo === "marcas") {
      // Só as marcas, na ordem, separadas por · (esconde o resto = releitura rápida).
      if (!ms.length) return `<span class="muted">Nada marcado ainda. Use o pincel ou “Auto”.</span>`;
      return ms.map((m) => `<mark class="mk mk-${m.cor}">${esc(m.texto)}</mark>`).join(`<span class="mk-sep"> · </span>`);
    }
    // normal | recordar
    let html = "";
    let pos = 0;
    for (const m of ms) {
      if (m.inicio > pos) html += esc(texto.slice(pos, m.inicio));
      const conteudo = esc(texto.slice(m.inicio, m.fim));
      if (estado.modo === "recordar" && !estado.revelados.has(m.id)) {
        html += `<span class="mk mk-cloze mk-${m.cor}" data-cloze="${m.id}" title="Clique para revelar">${"_".repeat(Math.max(3, Math.min(14, m.texto.length)))}</span>`;
      } else {
        html += `<mark class="mk mk-${m.cor}" data-mid="${m.id}" title="${estado.modo === "normal" ? "Clique para remover esta marca" : ""}">${conteudo}</mark>`;
      }
      pos = m.fim;
    }
    if (pos < texto.length) html += esc(texto.slice(pos));
    return html;
  }

  function toolbarHTML() {
    // Cores como bolinhas compactas (não emojis) — clicar seleciona o pincel; selecione o texto para grifar.
    const corBtn = (c) =>
      `<button type="button" class="mk-swatch mk-${c.id} ${estado.brush === c.id ? "on" : ""}" data-brush="${c.id}" data-tip-pos="cima" data-tip="Grifar: ${c.nome}${c.nome === "livre" ? " (uso livre)" : ""}"></button>`;
    const modoBtn = (id, label, tip) =>
      `<button type="button" class="mk-modo ${estado.modo === id ? "on" : ""}" data-modo="${id}" data-tip-pos="cima" data-tip="${tip}">${label}</button>`;
    return `
      <div class="mk-toolbar mk-tb2">
        <div class="mk-tb-linha">
          <span class="mk-rotulo">Grifar</span>
          <div class="mk-swatches">${CORES_FIXAS.map(corBtn).join("")}<span class="mk-sw-sep"></span>${CORES_LIVRES.map(corBtn).join("")}</div>
          <button type="button" class="mk-comentar ${estado.brush === "comentario" ? "on" : ""}" data-brush="comentario" data-tip-pos="cima" data-tip="Selecione um trecho para anexar um comentário (pode virar resumo).">${icone("message-square")} Comentar</button>
          <span class="mk-flex"></span>
          <div class="mk-modos">${modoBtn("normal", "Texto", "Texto completo com as marcas.")}${modoBtn("marcas", "Só marcas", "Mostra apenas os trechos marcados (releitura rápida).")}${modoBtn("recordar", "Recordar", "As marcas viram lacunas: tente lembrar e clique para revelar.")}</div>
          <details class="mk-mais">
            <summary data-tip-pos="cima-dir" data-tip="Mais ações">${icone("ellipsis")}</summary>
            <div class="mk-mais-pop">
              <button type="button" class="lnk" data-acao="auto" data-tip="Marca automaticamente prazos/valores e palavras restritivas.">${icone("sparkles")} Auto (prazos/restritivas)</button>
              ${store.iaDisponivel() ? `<button type="button" class="lnk" data-acao="ia-sugere" ${estado.sugerindo ? "disabled" : ""}>${icone("sparkles")} ${estado.sugerindo ? "Sugerindo…" : "IA sugere palavras-chave"}</button>` : ""}
              <button type="button" class="lnk lnk-danger" data-acao="limpar">${icone("eraser")} Limpar tudo</button>
              <button type="button" class="lnk" data-acao="imprimir">${iconImprimir} Imprimir</button>
            </div>
          </details>
        </div>
      </div>`;
  }

  function comentariosHTML() {
    const cs = comentarios();
    if (!cs.length) return "";
    return `<div class="mk-comentarios">
      <div class="mk-comentarios-titulo">${icone("message-square")} Comentários <span class="muted small">(${cs.length})</span></div>
      ${cs
        .map((c) => {
          const editando = estado.notaEditando === c.id;
          return `<div class="mk-coment-item">
            <div class="mk-coment-trecho">“${esc(c.texto)}”</div>
            ${
              editando
                ? `<textarea class="mk-coment-nota-input" data-id="${c.id}" rows="2" placeholder="Escreva seu comentário/observação...">${esc(c.nota || "")}</textarea>
                   <div class="mk-coment-acoes">
                     <button class="lnk" data-coment-acao="salvar" data-id="${c.id}">salvar</button>
                     <button class="lnk" data-coment-acao="cancelar" data-id="${c.id}">cancelar</button>
                   </div>`
                : `<div class="mk-coment-nota">${c.nota ? esc(c.nota) : '<span class="muted">(sem texto — clique em editar)</span>'}</div>
                   <div class="mk-coment-acoes">
                     <button class="lnk" data-coment-acao="editar" data-id="${c.id}">editar</button>
                     <button class="lnk" data-coment-acao="resumo" data-id="${c.id}" data-tip-pos="cima-esq" data-tip="Criar um resumo com este trecho + comentário.">→ resumo</button>
                     <button class="lnk lnk-danger" data-coment-acao="remover" data-id="${c.id}">remover</button>
                   </div>`
            }
          </div>`;
        })
        .join("")}
    </div>`;
  }

  // Conteúdo para impressão: as marcas agrupadas por cor (na ordem do texto) + comentários.
  function impressaoHTML() {
    const todas = marcas();
    const grupos = [...CORES_FIXAS, ...CORES_LIVRES];
    let html = tituloFonte ? `<h2 style="margin:0 0 4px">${esc(tituloFonte)}</h2>` : "";
    let temAlgo = false;
    for (const g of grupos) {
      const itens = todas.filter((m) => m.cor === g.id).sort((a, b) => a.inicio - b.inicio);
      if (!itens.length) continue;
      temAlgo = true;
      const rotulo = g.nome === "livre" ? `${g.emoji} marcações livres` : `${g.emoji} ${g.nome}`;
      html += `<h3 style="margin:12px 0 4px">${rotulo}</h3><ul style="margin:0">${itens.map((m) => `<li>${esc(m.texto)}</li>`).join("")}</ul>`;
    }
    const coments = comentarios().sort((a, b) => a.inicio - b.inicio);
    if (coments.length) {
      temAlgo = true;
      html += `<h3 style="margin:12px 0 4px">${icone("message-square")} comentários</h3>${coments
        .map((c) => `<div style="margin:0 0 8px"><div style="font-style:italic">“${esc(c.texto)}”</div>${c.nota ? `<div>${esc(c.nota)}</div>` : ""}</div>`)
        .join("")}`;
    }
    return temAlgo ? html : "<p>Nenhuma marcação ou comentário neste texto.</p>";
  }

  function pintar() {
    container.innerHTML = `
      ${toolbarHTML()}
      <div class="mk-texto ${estado.brush ? "mk-pintando" : ""} mk-modo-${estado.modo}" data-mk-texto>${textoMarcadoHTML()}</div>
      ${comentariosHTML()}`;
    ligar();
  }

  function ligar() {
    const textoEl = container.querySelector("[data-mk-texto]");

    container.querySelectorAll("[data-brush]").forEach((b) =>
      b.addEventListener("click", () => {
        const c = b.getAttribute("data-brush");
        estado.brush = estado.brush === c ? null : c;
        pintar();
      })
    );
    container.querySelectorAll(".mk-modo").forEach((b) =>
      b.addEventListener("click", () => {
        estado.modo = b.getAttribute("data-modo");
        estado.revelados.clear();
        if (estado.modo !== "normal") estado.brush = null;
        pintar();
      })
    );
    container.querySelector('[data-acao="auto"]')?.addEventListener("click", () => {
      const n = store.autoMarcar(alvoTipo, alvoId, texto);
      onChange && onChange();
      pintar();
    });
    container.querySelector('[data-acao="ia-sugere"]')?.addEventListener("click", async () => {
      estado.sugerindo = true;
      pintar();
      try {
        const n = await store.sugerirMarcacoesIA(alvoTipo, alvoId, texto, tituloFonte || "");
        toast(n ? `${plural(n, "palavra-chave grifada", "palavras-chave grifadas")} pela IA.` : "A IA não encontrou novas palavras-chave.");
        onChange && onChange();
      } catch (e) {
        toast("Falha na IA: " + e.message, "erro");
      }
      estado.sugerindo = false;
      pintar();
    });
    container.querySelector('[data-acao="limpar"]')?.addEventListener("click", () => {
      store.limparMarcas(alvoTipo, alvoId);
      onChange && onChange();
      pintar();
    });
    container.querySelector('[data-acao="imprimir"]')?.addEventListener("click", () => {
      imprimir((tituloFonte || "Marcações") + " — marcações", impressaoHTML());
    });

    // Pintar: selecionar um trecho com o pincel ativo grava a marca.
    textoEl?.addEventListener("mouseup", () => {
      if (!estado.brush || estado.modo !== "normal") return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!textoEl.contains(range.startContainer) || !textoEl.contains(range.endContainer)) return;
      let ini = offsetGlobal(textoEl, range.startContainer, range.startOffset);
      let fim = offsetGlobal(textoEl, range.endContainer, range.endOffset);
      if (ini > fim) [ini, fim] = [fim, ini];
      // apara espaços nas pontas
      while (ini < fim && /\s/.test(texto[ini])) ini++;
      while (fim > ini && /\s/.test(texto[fim - 1])) fim--;
      if (fim <= ini) return;
      const nova = store.addMarca({ alvoTipo, alvoId, cor: estado.brush, inicio: ini, fim, texto: texto.slice(ini, fim) });
      sel.removeAllRanges();
      // No modo comentar, abre o editor de nota do comentário recém-criado.
      if (estado.brush === "comentario" && nova) estado.notaEditando = nova.id;
      onChange && onChange();
      pintar();
    });

    // Ações da lista de comentários.
    container.querySelectorAll("[data-coment-acao]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = b.getAttribute("data-id");
        const acao = b.getAttribute("data-coment-acao");
        if (acao === "editar") {
          estado.notaEditando = id;
          pintar();
        } else if (acao === "cancelar") {
          estado.notaEditando = null;
          pintar();
        } else if (acao === "salvar") {
          const ta = container.querySelector(`.mk-coment-nota-input[data-id="${id}"]`);
          store.setMarcaNota(id, ta ? ta.value : "");
          estado.notaEditando = null;
          onChange && onChange();
          pintar();
        } else if (acao === "remover") {
          store.removerMarca(id);
          onChange && onChange();
          pintar();
        } else if (acao === "resumo") {
          const c = store.marcasDe(alvoTipo, alvoId).find((m) => m.id === id);
          if (!c) return;
          const titulo = (tituloFonte ? tituloFonte + " — " : "") + c.texto.slice(0, 50);
          const html = `<p>“${esc(c.texto)}”</p>${c.nota ? `<p><b>Comentário:</b> ${esc(c.nota)}</p>` : ""}`;
          store.addResumo({ titulo, conteudoHTML: html, topicoId: topicoId || null });
          toast("Resumo criado a partir do comentário.");
          pintar();
        }
      })
    );

    // Clique numa marca (modo normal, sem pincel) remove. Cloze (modo recordar) revela.
    textoEl?.addEventListener("click", (e) => {
      const cloze = e.target.closest("[data-cloze]");
      if (cloze) {
        estado.revelados.add(cloze.getAttribute("data-cloze"));
        pintar();
        return;
      }
      const mk = e.target.closest("[data-mid]");
      if (mk && estado.modo === "normal" && !estado.brush) {
        store.removerMarca(mk.getAttribute("data-mid"));
        onChange && onChange();
        pintar();
      }
    });
  }

  pintar();
}
