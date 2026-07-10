// Lei Seca — LEITOR: barra do leitor, biblioteca "Minhas leis", árvore/índice da lei,
// scroll-spy, barra auto-oculta, busca na lei, render dos artigos (com marcas), cards
// da jurisprudência, config de leitura (Aa), personalizar barra e ações em lote da lei.
// (Extraído mecanicamente de leiseca.js — comportamento idêntico.)
import { bindActions, toast, toastCarregando, vazio, confirmar, avisoIA, abrirJanela, plural, comOcupado } from "../../ui.js";
import { esc, fmtData, todayISO } from "../../util.js";
import { progressRing } from "../../viz.js";
import { icone } from "../../icones.js";
import { CATALOGO_LEIS } from "../../legis.js";
import { S, rotuloRevogado } from "./estado.js";
import { nomeTopico } from "./pickers.js";

// SCROLL-SPY (V2): "cabeçalho corrente" do livro — mostra a trilha estrutural (Parte › Título ·
// Capítulo) do trecho que você está lendo, atualizando conforme rola. Usa IntersectionObserver
// (leve, dispara só quando um cabeçalho cruza o topo) — não é handler de scroll (evita o bug antigo).
export function garantirScrollSpy(root) {
  try { if (S._scrollSpyIO) { S._scrollSpyIO.disconnect(); S._scrollSpyIO = null; } } catch {}
  try { if (S._scrollSpyArtIO) { S._scrollSpyArtIO.disconnect(); S._scrollSpyArtIO = null; } } catch {}
  if (typeof IntersectionObserver === "undefined") return;
  const agora = root.querySelector(".ler-agora");
  const lista = root.querySelector(".lista-leiseca");
  const trilhaEl = agora && agora.querySelector(".la-trilha");
  const barra = root.querySelector(".ler-topo");
  const pill = root.querySelector(".ler-continuar-pill");
  const scEl = document.querySelector(".content") || document.scrollingElement;
  if (!agora || !lista || !trilhaEl) return;
  const linhaTopo = () => (barra ? barra.getBoundingClientRect().bottom : 120) + 6;
  // Pílula "Continuar de onde parou": aparece perto do topo quando há posição salva ADIANTE.
  const atualizarPill = () => {
    if (!pill) return;
    const norma = S._leitorCtx && S._leitorCtx.norma;
    const nearTop = (scEl ? scEl.scrollTop : window.scrollY || 0) < 500;
    const ult = norma ? ((S._leitorCtx.store.get().config.ultimaLeitura || {})[norma]) : null;
    const alvo = ult && ult.indicacaoId ? lista.querySelector(`.ler-art[data-id="${ult.indicacaoId}"]`) : null;
    if (nearTop && alvo && alvo.getBoundingClientRect().top > linhaTopo() + 240) {
      const ref = alvo.querySelector(".ler-art-ref");
      pill.querySelector(".lcp-art").textContent = ref ? " · " + ref.textContent.trim() : "";
      pill.hidden = false;
    } else pill.hidden = true;
  };
  const sums = [...lista.querySelectorAll(".ls-estr > summary")];
  const atualizar = () => {
    atualizarPill();
    const linha = linhaTopo();
    let cur = null;
    for (const s of sums) { const r = s.getBoundingClientRect(); if (r.height === 0) continue; if (r.top <= linha) cur = s; else break; }
    if (!cur) { agora.hidden = true; return; }
    const partes = [];
    let el = cur.closest(".ls-estr");
    while (el) {
      const sm = el.querySelector(":scope > summary");
      const rot = sm && sm.querySelector(".ls-estr-rot") ? sm.querySelector(".ls-estr-rot").textContent.trim() : "";
      const tit = sm && sm.querySelector(".ls-estr-tit") ? sm.querySelector(".ls-estr-tit").textContent.trim() : "";
      if (rot) partes.unshift(tit ? `${rot} · ${tit}` : rot);
      el = el.parentElement ? el.parentElement.closest(".ls-estr") : null;
    }
    if (!partes.length) { agora.hidden = true; return; }
    const txt = partes.join("  ›  ");
    if (trilhaEl.textContent !== txt) trilhaEl.textContent = txt;
    agora.hidden = false;
  };
  if (sums.length) {
    S._scrollSpyIO = new IntersectionObserver(atualizar, { threshold: [0, 1] });
    sums.forEach((s) => S._scrollSpyIO.observe(s));
  } else agora.hidden = true;
  // Observa os artigos SÓ para atualizar a pílula ao rolar. A posição de "continuar de onde parou"
  // é gravada ao MARCAR LIDO (handler ler-lido/lf-lido) — NÃO no scroll (salvar no scroll chamava
  // setUltimaLeitura→commit→re-render, num loop que fazia a página "atualizar sozinha").
  const arts = [...lista.querySelectorAll(".ler-art")];
  if (arts.length) {
    S._scrollSpyArtIO = new IntersectionObserver(() => atualizarPill(), { threshold: 0 });
    arts.forEach((a) => S._scrollSpyArtIO.observe(a));
  }
  atualizar();
}

// Fase 5 — LEITOR SERENO: a barra do leitor se esconde ao rolar PARA BAIXO (imersão, estilo
// Kindle) e volta ao rolar para cima ou ao chegar perto do topo. O handler vai no scroller
// global (.content). Anti-vazamento: (a) todo render chama garantir…() que REMOVE o listener
// anterior antes de religar; (b) se a barra sair do DOM (troca de tela), o próprio handler se
// desliga no 1º scroll. Só alterna classe — nada de commit/refresh no scroll (bug antigo).
export function desligarBarraAutoOculta() {
  if (!S._barraAuto) return;
  try { S._barraAuto.el.removeEventListener("scroll", S._barraAuto.fn); } catch {}
  S._barraAuto = null;
}
export function garantirBarraAutoOculta(root) {
  desligarBarraAutoOculta();
  if (typeof document === "undefined") return;
  const barra = root.querySelector(".ler-topo");
  if (!barra) return;
  const scEl = document.querySelector(".content");
  const alvo = scEl || window;
  const pos = () => (scEl ? scEl.scrollTop : window.scrollY || 0);
  let ultimoY = pos();
  const fn = () => {
    if (!barra.isConnected) { desligarBarraAutoOculta(); return; }
    const y = pos();
    const delta = y - ultimoY;
    ultimoY = y;
    if (y <= 80) { barra.classList.remove("ler-barra-oculta"); return; } // perto do topo: sempre visível
    if (delta > 0) barra.classList.add("ler-barra-oculta");      // rolando para baixo → esconde
    else if (delta < 0) barra.classList.remove("ler-barra-oculta"); // para cima (qualquer delta) → volta
  };
  alvo.addEventListener("scroll", fn, { passive: true });
  S._barraAuto = { el: alvo, fn };
}

// F4 — Busca na lei: TEXTUAL (instantânea, offline) + SEMÂNTICA (IA, por significado). Cada
// resultado abre direto no artigo (focoIndicacaoId → rola até ele no leitor).
export function abrirBuscaLei(app, store, norma, artigos) {
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const estado = { sem: false };
  abrirJanela({
    titulo: `Buscar em ${nomeAmigavelLei(norma)}`,
    corpoHTML: `<div class="card busca-lei">
      <div class="busca-topo">${icone("search")}<input id="busca-q" type="text" placeholder="Palavra, expressão ou número do artigo (ex.: prescrição · 121)" autocomplete="off" /></div>
      <label class="busca-sem" data-tip="Busca por SIGNIFICADO (usa IA + o índice da lei), não só a palavra exata."><input type="checkbox" id="busca-sem-chk" /> ${icone("sparkles")} Busca inteligente (IA)</label>
      <div class="busca-res" id="busca-res"><p class="muted small">Digite para buscar nesta lei.</p></div>
    </div>`,
    aoMontar: (overlay, fechar) => {
      const corpo = overlay.querySelector(".mm-corpo");
      const inp = corpo.querySelector("#busca-q");
      const res = corpo.querySelector("#busca-res");
      const chk = corpo.querySelector("#busca-sem-chk");
      const jump = (id) => { fechar(); app.navigate("leiseca", { focoIndicacaoId: id }); };
      const pintar = (itens, termo) => {
        if (!itens.length) { res.innerHTML = `<p class="muted small">Nada encontrado${termo ? ` para "${esc(termo)}"` : ""}.</p>`; return; }
        res.innerHTML = itens.map((it) => `<button class="busca-item" data-id="${it.id}"><span class="busca-item-ref">${esc(it.ref)}</span><span class="busca-item-tr">${it.snippet}</span></button>`).join("");
        res.querySelectorAll(".busca-item").forEach((b) => b.addEventListener("click", () => jump(b.getAttribute("data-id"))));
      };
      const textual = (q) => {
        const nq = norm(q); const out = [];
        // Só número → "ir para o artigo": o artigo exato vem PRIMEIRO (ex.: "5" → Art. 5º).
        const soNum = /^\d+$/.test(q.trim());
        let exatoId = null;
        if (soNum) { const alvo = artigos.find((a) => numArtigo(a.referencia) === +q.trim()); if (alvo) { exatoId = alvo.id; out.push({ id: alvo.id, ref: String(alvo.referencia).split(",")[0].trim(), snippet: `${icone("corner-down-right")} Ir para este artigo` }); } }
        for (const a of artigos) {
          if (a.id === exatoId) continue;
          const texto = corpoArtigoLimpo(a.texto);
          const nt = norm(texto); const pos = nt.indexOf(nq);
          if (norm(a.referencia).includes(nq) || pos >= 0) {
            const ref = String(a.referencia).split(",")[0].trim();
            let snippet;
            if (pos >= 0) { const ini = Math.max(0, pos - 30); snippet = (ini ? "…" : "") + esc(texto.slice(ini, pos)) + "<mark>" + esc(texto.slice(pos, pos + q.length)) + "</mark>" + esc(texto.slice(pos + q.length, pos + q.length + 45)) + "…"; }
            else snippet = esc(texto.slice(0, 80)) + "…";
            out.push({ id: a.id, ref, snippet });
          }
          if (out.length >= 40) break;
        }
        return out;
      };
      const rodarTextual = () => { const q = inp.value.trim(); if (!q) { res.innerHTML = `<p class="muted small">Digite para buscar nesta lei.</p>`; return; } pintar(textual(q), q); };
      const rodarSemantica = async () => {
        const q = inp.value.trim(); if (!q) return;
        if (!store.iaDisponivel()) { chk.checked = false; estado.sem = false; res.innerHTML = `<p class="muted small">A busca inteligente precisa da IA conectada — usando busca por palavra.</p>`; return rodarTextual(); }
        res.innerHTML = `<p class="muted small">${icone("sparkles")} Buscando por significado…</p>`;
        try {
          if (!(store.get().embeddings && store.get().embeddings.itens.length)) await store.indexarSemantica(null, { ids: artigos.map((a) => a.id) });
          const r = await store.buscaSemantica(q, { k: 20 });
          const idsLei = new Set(artigos.map((a) => a.id));
          const itens = r.filter((x) => x.tipo === "leiseca" && idsLei.has(x.fonteId)).map((x) => {
            const a = artigos.find((y) => y.id === x.fonteId);
            return { id: x.fonteId, ref: String((a && a.referencia) || x.titulo).split(",")[0].trim(), snippet: esc(corpoArtigoLimpo((a && a.texto) || x.trecho).slice(0, 110)) + "…" };
          });
          pintar(itens, q);
        } catch (e) { console.error(e); res.innerHTML = `<p class="erro-msg small">Não consegui a busca inteligente agora.</p>`; }
      };
      let t;
      inp.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => (estado.sem ? rodarSemantica() : rodarTextual()), estado.sem ? 450 : 90); });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { const b = res.querySelector(".busca-item"); if (b) b.click(); } });
      chk.addEventListener("change", () => { estado.sem = chk.checked; estado.sem ? rodarSemantica() : rodarTextual(); });
      inp.focus();
    },
  });
}

// Busca da JURISPRUDÊNCIA: mesma ideia da Lei Seca (textual instantânea + semântica por IA),
// só que sobre as súmulas/teses e sem "ir para o artigo nº". Cada resultado abre no card
// (focoIndicacaoId → rola até ele). Substitui o antigo botão "Busca IA", que só montava o
// índice do chat e não deixava digitar o que buscar.
export function abrirBuscaJuris(app, store, juris) {
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const estado = { sem: false };
  abrirJanela({
    titulo: "Buscar na Jurisprudência",
    corpoHTML: `<div class="card busca-lei">
      <div class="busca-topo">${icone("search")}<input id="busca-q" type="text" placeholder="Palavra, tribunal, tema ou número (ex.: algemas · 473 · prescrição)" autocomplete="off" /></div>
      <label class="busca-sem" data-tip="Busca por SIGNIFICADO (usa IA), não só a palavra exata."><input type="checkbox" id="busca-sem-chk" /> ${icone("sparkles")} Busca inteligente (IA)</label>
      <div class="busca-res" id="busca-res"><p class="muted small">Digite para buscar nas súmulas e teses.</p></div>
    </div>`,
    aoMontar: (overlay, fechar) => {
      const corpo = overlay.querySelector(".mm-corpo");
      const inp = corpo.querySelector("#busca-q");
      const res = corpo.querySelector("#busca-res");
      const chk = corpo.querySelector("#busca-sem-chk");
      const jump = (id) => { fechar(); app.navigate("jurisprudencia", { focoIndicacaoId: id }); };
      const pintar = (itens, termo) => {
        if (!itens.length) { res.innerHTML = `<p class="muted small">Nada encontrado${termo ? ` para "${esc(termo)}"` : ""}.</p>`; return; }
        res.innerHTML = itens.map((it) => `<button class="busca-item" data-id="${it.id}"><span class="busca-item-ref">${esc(it.ref)}</span><span class="busca-item-tr">${it.snippet}</span></button>`).join("");
        res.querySelectorAll(".busca-item").forEach((b) => b.addEventListener("click", () => jump(b.getAttribute("data-id"))));
      };
      const textual = (q) => {
        const nq = norm(q); const out = [];
        for (const a of juris) {
          const texto = corpoArtigoLimpo(a.texto || "");
          const nt = norm(texto); const pos = nt.indexOf(nq);
          const nRef = norm(a.referencia) + " " + norm(a.tribunal || "") + " " + norm(a.categoria || "");
          if (nRef.includes(nq) || pos >= 0) {
            const ref = String(a.referencia).split(",")[0].trim();
            let snippet;
            if (pos >= 0) { const ini = Math.max(0, pos - 30); snippet = (ini ? "…" : "") + esc(texto.slice(ini, pos)) + "<mark>" + esc(texto.slice(pos, pos + q.length)) + "</mark>" + esc(texto.slice(pos + q.length, pos + q.length + 45)) + "…"; }
            else snippet = esc(texto.slice(0, 80)) + "…";
            out.push({ id: a.id, ref, snippet });
          }
          if (out.length >= 40) break;
        }
        return out;
      };
      const rodarTextual = () => { const q = inp.value.trim(); if (!q) { res.innerHTML = `<p class="muted small">Digite para buscar nas súmulas e teses.</p>`; return; } pintar(textual(q), q); };
      const rodarSemantica = async () => {
        const q = inp.value.trim(); if (!q) return;
        if (!store.iaDisponivel()) { chk.checked = false; estado.sem = false; res.innerHTML = `<p class="muted small">A busca inteligente precisa da IA conectada — usando busca por palavra.</p>`; return rodarTextual(); }
        res.innerHTML = `<p class="muted small">${icone("sparkles")} Buscando por significado…</p>`;
        try {
          if (!(store.get().embeddings && store.get().embeddings.itens.length)) await store.indexarSemantica(null, { ids: juris.map((a) => a.id) });
          const r = await store.buscaSemantica(q, { k: 20 });
          const idsJ = new Set(juris.map((a) => a.id));
          const itens = r.filter((x) => idsJ.has(x.fonteId)).map((x) => {
            const a = juris.find((y) => y.id === x.fonteId);
            return { id: x.fonteId, ref: String((a && a.referencia) || x.titulo).split(",")[0].trim(), snippet: esc(corpoArtigoLimpo((a && a.texto) || x.trecho).slice(0, 110)) + "…" };
          });
          pintar(itens, q);
        } catch (e) { console.error(e); res.innerHTML = `<p class="erro-msg small">Não consegui a busca inteligente agora.</p>`; }
      };
      let t;
      inp.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => (estado.sem ? rodarSemantica() : rodarTextual()), estado.sem ? 450 : 90); });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { const b = res.querySelector(".busca-item"); if (b) b.click(); } });
      chk.addEventListener("change", () => { estado.sem = chk.checked; estado.sem ? rodarSemantica() : rodarTextual(); });
      inp.focus();
    },
  });
}

// T1 — Agrupar por NORMA (lei) ou TRIBUNAL (juris). Extrai a norma do último segmento da
// referência que não seja posicional (caput/§/inciso/alínea) nem o próprio "art.".
export function normaDeRef(ref) {
  const segs = String(ref || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (let k = segs.length - 1; k >= 0; k--) {
    const s = segs[k];
    // O ÚLTIMO segmento é sempre a norma — não aplicar o skip de inciso/romano nele (senão "CDC"/"CC",
    // que são só letras romanas, seriam descartados como se fossem inciso e a lei cairia em "Outros").
    if (k < segs.length - 1 && /^(caput|§|par[áa]grafo\s*[úu]nico|par[áa]grafo|inc\.?|inciso|al[íi]nea|[ivxlcdm]+|[a-z])$/i.test(s)) continue;
    if (/^art/i.test(s)) continue;
    return s;
  }
  return null;
}
function chaveGrupo(tipo, i) {
  return tipo === "juris" ? (i.tribunal || "Outros") : (normaDeRef(i.referencia) || "Outros");
}
// Cor de destaque por lei (leitura visual dos cards de "Minhas Leis"). Conhecidas fixas; resto por hash estável.
function corLei(norma) {
  const n = String(norma || "").toUpperCase();
  const map = { CF: "#4f5bd5", CP: "#c4456b", CPP: "#2f6bd0", CC: "#7a4bd0", CPC: "#0f8f8f", CDC: "#0d9488", CTN: "#b07a12", CLT: "#b5642a" };
  if (map[n]) return map[n];
  let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360;
  return `hsl(${h} 52% 48%)`;
}
// Página inicial "Minhas Leis" (capa da Lei Seca): cards por lei (nome + progresso), "continuar de
// onde parou" e "importar outra lei". Clicar num card (ou continuar) abre o leitor normal.
export function bibliotecaLeisHTML(st, store, normas) {
  const arts = st.indicacoes.filter((i) => i.tipo === "lei" && !i.metaLeitura);
  const ul = st.config.ultimaLeitura || {};
  const info = normas.map((n) => {
    const da = arts.filter((i) => (normaDeRef(i.referencia) || "Outros") === n);
    const vivos = da.filter((i) => !i.revogado);
    const total = vivos.length;
    const lidos = vivos.filter((i) => i.lido).length;
    return { norma: n, nome: nomeAmigavelLei(n), total, lidos, pct: total ? Math.round((100 * lidos) / total) : 0, em: ul[n] && ul[n].em ? ul[n].em : null, novidades: da.filter((i) => i.novidadeEm && !i.revogado).length, difs: vivos.filter((i) => i.dificil).length };
  });
  // Em progresso primeiro (mais recente no topo), depois alfabética.
  info.sort((a, b) => (b.em ? 1 : 0) - (a.em ? 1 : 0) || (a.em && b.em ? (a.em < b.em ? 1 : -1) : a.nome.localeCompare(b.nome, "pt-BR")));
  const ultimo = info.filter((x) => x.em).sort((a, b) => (a.em < b.em ? 1 : -1))[0];
  const continuar = ultimo
    ? `<button class="btn btn-add" data-action="continuar-leitura" data-tip="Voltar à última lei e artigo que você estava lendo.">${icone("corner-down-right")} Continuar de onde parou<span class="lb-cont-lei">${esc(ultimo.nome)}</span></button>`
    : "";
  const card = (x) => `
    <button class="lb-card" data-action="abrir-lei" data-norma="${esc(x.norma)}" style="--lc:${corLei(x.norma)}" data-tip="Abrir ${esc(x.nome)} para ler">
      <span class="lb-card-accent"></span>
      <span class="lb-ring">${progressRing(x.pct, { size: 58, stroke: 6, cor: corLei(x.norma) })}</span>
      <span class="lb-card-main">
        <span class="lb-card-nome">${esc(x.nome)}${x.novidades ? `<span class="mini-tag nov-tag lb-nov" data-tip="${x.novidades} artigo(s) com novidade legislativa.">${icone("sparkles")} ${x.novidades}</span>` : ""}</span>
        <span class="lb-card-sub">${x.total ? `${x.lidos}/${x.total} lidos · ${x.pct}%` : "sem artigos"}${x.difs ? ` · ${x.difs} difíceis` : ""}</span>
        <span class="lb-card-bar"><span style="width:${x.pct}%"></span></span>
      </span>
      <span class="lb-card-go">${icone("chevron-right")}</span>
    </button>`;
  return `<section class="lei-biblioteca">
    <div class="lb-head">
      <div class="lb-titulo"><h2>${icone("library")} Minhas leis</h2><span class="muted small">${plural(info.length, "lei cadastrada", "leis cadastradas")} · escolha uma para ler</span></div>
      <div class="lb-acoes">${continuar}<button class="btn btn-ghost" data-action="importar" data-tip="Trazer outra lei: do Planalto, colando o texto ou de um PDF.">${icone("download")} Importar outra lei</button></div>
    </div>
    <div class="lb-grid">${info.map(card).join("")}</div>
  </section>`;
}
// Nome amigável da lei: "CP" → "Código Penal" (via catálogo). Se não houver, mostra a norma crua.
export function nomeAmigavelLei(norma) {
  if (!norma) return norma;
  if (S._nomesLeis[norma]) return S._nomesLeis[norma]; // apelido do usuário tem prioridade
  const c = CATALOGO_LEIS.find((l) => l.nome === norma);
  return c ? c.titulo : norma;
}

// Número do artigo — ordena a lei na ordem natural (não por data de importação).
export function numArtigo(ref) {
  const m = String(ref || "").match(/Art\.?\s*(\d+)/i);
  return m ? +m[1] : 1e9;
}
// Divisória de estrutura (Opção A): UMA linha em migalha (breadcrumb) juntando só os níveis que
// mudaram — ex.: "Título II › Capítulo I · Do furto" — em vez de várias linhas empilhadas.
function estruturaDivisoriaHTML(nodes) {
  const arr = Array.isArray(nodes) ? nodes : [nodes];
  const inner = arr
    .map((n) => `<span class="ls-estr-nome">${esc(n.rotulo)}</span>${n.titulo ? ` <span class="ls-estr-tit">${esc(n.titulo)}</span>` : ""}`)
    .join(`<span class="ls-estr-sep">›</span>`);
  return `<div class="ls-estr-div" data-niv="${arr[0].nivel}">${inner}</div>`;
}
// Percorre itens JÁ NA ORDEM e insere UMA divisória sempre que a trilha muda (com os níveis que
// mudaram; no parcial, o 1º item de cada trecho traz o caminho até ali).
export function comDivisoriasEstrutura(itens, renderItem) {
  let prev = [], out = "";
  for (const it of itens) {
    const est = Array.isArray(it.estrutura) ? it.estrutura : [];
    let d = 0;
    while (d < est.length && d < prev.length && est[d].rotulo === prev[d].rotulo && est[d].titulo === prev[d].titulo) d++;
    if (d < est.length) out += estruturaDivisoriaHTML(est.slice(d));
    prev = est;
    out += renderItem(it);
  }
  return out;
}
// Itens de um grupo: para lei, ordena por número de artigo e insere as divisórias; juris, direto.
function renderItensGrupo(itens, tipo, renderItem) {
  if (tipo !== "lei") return itens.map(renderItem).join("");
  return comDivisoriasEstrutura(itens.slice().sort((a, b) => numArtigo(a.referencia) - numArtigo(b.referencia)), renderItem);
}

// ÍNDICE RECOLHÍVEL do leitor: em vez de migalhas soltas, aninha a estrutura (Livro › Título ›
// Capítulo › Seção…) em <details> nativos. Recolher um Título recolhe tudo dentro dele; o botão
// "Índice" recolhe todos → sobra só o esqueleto da lei (o índice), e o usuário expande o que quer.
function _contarArts(n) { let c = n.artigos.length; for (const ch of n.filhos) c += _contarArts(ch); return c; }
function renderLeitorArvore(itens, renderItem, colapsado, fechados = null) {
  const fech = fechados instanceof Set ? fechados : new Set();
  const arts = itens.slice().sort((a, b) => numArtigo(a.referencia) - numArtigo(b.referencia));
  const raiz = { filhos: [], mapa: new Map(), artigos: [], node: null };
  for (const it of arts) {
    const path = Array.isArray(it.estrutura) ? it.estrutura : [];
    let cur = raiz;
    for (const p of path) {
      const key = p.rotulo + "|" + (p.titulo || "");
      let ch = cur.mapa.get(key);
      if (!ch) { ch = { filhos: [], mapa: new Map(), artigos: [], node: p }; cur.mapa.set(key, ch); cur.filhos.push(ch); }
      cur = ch;
    }
    cur.artigos.push(it);
  }
  // Estado aberto: colapse-all global fecha tudo; senão cada seção fica aberta, salvo se o usuário
  // a recolheu (persistido em config.leitura.indiceFechado por chave de caminho — #5 V2).
  // #9: todos os artigos sob uma seção (recursivo) → "capítulo concluído" + marcar em bloco.
  const coletar = (n) => n.artigos.concat(...n.filhos.map(coletar));
  const rec = (n, pk) => {
    let html = n.artigos.map(renderItem).join("");
    for (const ch of n.filhos) {
      const nd = ch.node;
      const key = (pk ? pk + ">" : "") + nd.rotulo + "|" + (nd.titulo || "");
      const abrir = colapsado ? "" : (fech.has(key) ? "" : " open");
      const secArts = coletar(ch);
      const lidos = secArts.filter((a) => a.lido).length;
      const concl = secArts.length > 0 && lidos === secArts.length;
      const capBtn = `<button class="ls-cap-btn ${concl ? "on" : ""}" data-action="ler-cap-lido" data-ids="${secArts.map((a) => a.id).join(",")}" data-concl="${concl ? 1 : 0}" data-tip="${concl ? "Capítulo concluído — desmarcar todos" : `Marcar os ${secArts.length} artigos deste capítulo como lidos`}">${icone("check-check")}</button>`;
      html += `<details class="ls-estr" data-niv="${nd.nivel}" data-estr-key="${esc(key)}"${abrir}>` +
        `<summary class="ls-estr-head">${icone("chevron-right")}<span class="ls-estr-rot">${esc(nd.rotulo)}</span>${nd.titulo ? `<span class="ls-estr-tit">${esc(nd.titulo)}</span>` : ""}<span class="ls-estr-num">${lidos}/${secArts.length}</span>${capBtn}</summary>` +
        `<div class="ls-estr-corpo">${rec(ch, key)}</div></details>`;
    }
    return html;
  };
  const html = rec(raiz, "");
  return raiz.filhos.length ? html : comDivisoriasEstrutura(arts, renderItem); // sem estrutura → migalhas simples
}

// F1e: popover de configurações de leitura (fonte, tamanho, espaçamento, alinhamento, tema/sépia).
// Só as linhas de controle (fonte/tamanho/espaçamento/alinhamento/tema) — reaproveitadas
// tanto no popover Aa quanto embutidas na seção "Leitura" do gerenciador de Opções.
export function configLeituraRowsHTML(cfg, temaGlobal) {
  cfg = cfg || {};
  const seg = (k, opcoes) => `<div class="lcfg-seg">${opcoes.map((o) => `<button class="lcfg-opt ${cfg[k] === o.v || (cfg[k] == null && o.def) ? "on" : ""}" data-action="ler-cfg" data-k="${k}" data-v="${o.v}">${o.r}</button>`).join("")}</div>`;
  // Régua do frio ao quente + escuro: Claro (branco) · Cinza (neutro) · Sépia (quente) · Escuro.
  // Cinza e Sépia são "overlays" de leitura (data-ler-tema); Claro/Escuro trocam o tema global.
  const overlay = cfg.tema === "sepia" || cfg.tema === "cinza";
  const temaSeg = `<div class="lcfg-seg lcfg-seg-tema">
    <button class="lcfg-opt ${!overlay && temaGlobal !== "escuro" ? "on" : ""}" data-action="ler-cfg" data-k="tema" data-v="claro">Claro</button>
    <button class="lcfg-opt ${cfg.tema === "cinza" ? "on" : ""}" data-action="ler-cfg" data-k="tema" data-v="cinza">Cinza</button>
    <button class="lcfg-opt ${cfg.tema === "sepia" ? "on" : ""}" data-action="ler-cfg" data-k="tema" data-v="sepia">Sépia</button>
    <button class="lcfg-opt ${!overlay && temaGlobal === "escuro" ? "on" : ""}" data-action="ler-cfg" data-k="tema" data-v="escuro">Escuro</button>
  </div>`;
  return `<div class="lcfg-row"><span>Fonte</span>${seg("fonte", [{ v: "inter", r: "Padrão", def: true }, { v: "serif", r: "Serifada" }, { v: "mono", r: "Mono" }])}</div>
    <div class="lcfg-row"><span>Tamanho</span>${seg("tamanho", [{ v: "pequena", r: "A−" }, { v: "media", r: "A", def: true }, { v: "grande", r: "A+" }])}</div>
    <div class="lcfg-row"><span>Espaçamento</span>${seg("espacamento", [{ v: "normal", r: "Normal", def: true }, { v: "confortavel", r: "Conforto" }, { v: "muito", r: "Amplo" }])}</div>
    <div class="lcfg-row"><span>Alinhamento</span>${seg("align", [{ v: "esquerda", r: "Esquerda", def: true }, { v: "justificado", r: "Justificado" }])}</div>
    <div class="lcfg-row"><span>Tema</span>${temaSeg}</div>`;
}

// Botão "Aa" da toolbar: popover ANCORADO (não-modal) com preview ao vivo — o texto da lei
// muda atrás enquanto se ajusta. Reaproveita as linhas de controle.
function configLeituraToolHTML(cfg, temaGlobal) {
  return `<details class="ler-config ls-mais">
    <summary class="ler-tool" data-tip="Aparência da leitura (fonte, tamanho, tema)"><span class="lcfg-aa">Aa</span></summary>
    <div class="ls-mais-pop lcfg-pop">${configLeituraRowsHTML(cfg, temaGlobal)}</div>
  </details>`;
}

// Menu GERAL da lei ("Ferramentas"): o que se refere à lei inteira (ou à lista filtrada) — não ao
// artigo isolado. Grifar em lote (IA/auto), limpar/imprimir grifos, marcar lido por intervalo,
// abrir no site oficial e conferir vigência. (O grifo individual fica no menu flutuante do artigo.)
export function abrirRenomearLei(app, store, norma) {
  abrirJanela({
    titulo: "Renomear lei",
    corpoHTML: `<div class="card">
      <label class="ia-lbl">Nome desta lei
        <input id="lei-nome" type="text" value="${esc(nomeAmigavelLei(norma))}" placeholder="Ex.: Código de Defesa do Consumidor" autocomplete="off" />
      </label>
      <p class="muted small">Muda só o nome exibido — as citações (ex.: “Art. 1º, ${esc(norma)}”) continuam iguais.</p>
      <div class="form-acoes"><button class="btn btn-ghost" data-action="rn-cancelar">Cancelar</button><span class="spacer"></span><button class="btn btn-primary" data-action="rn-salvar">Salvar</button></div>
    </div>`,
    aoMontar: (jan, fechar) => {
      const inp = jan.querySelector("#lei-nome");
      inp?.focus(); inp?.select();
      const salvar = () => { store.definirNomeLei(norma, inp.value); fechar(); app.refresh(); toast("Nome da lei atualizado."); };
      jan.querySelector('[data-action="rn-salvar"]')?.addEventListener("click", salvar);
      jan.querySelector('[data-action="rn-cancelar"]')?.addEventListener("click", fechar);
      inp?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); salvar(); } });
    },
  });
}

// "Personalizar barra": escolhe quais ÍCONES ficam na toolbar do leitor e quais FILTROS
// aparecem como chips. Config leve (não é leitura) → modal compacto; muda ao vivo na barra atrás.
export function abrirPersonalizarBarra(app, store) {
  const temFonte = store.get().indicacoes.some((i) => i.tipo === "lei" && i.fonteUrl);
  const PIN_DEF = [...LER_NAV_DEF, ...LER_ACOES_DEF].filter((d) => lerAcaoDisponivel(d, store, temFonte));
  const FILTROS_DEF = [
    { k: "lido", ic: "check", lbl: "Lidos" },
    { k: "favorito", ic: "bookmark", lbl: "Favoritos" },
    { k: "dificil", ic: "flame", lbl: "Difíceis" },
    { k: "pq", ic: "star", lbl: "Que mais caem" },
    { k: "grifo", ic: "highlighter", lbl: "Grifos" },
    { k: "anotacao", ic: "sticky-note", lbl: "Anotações" },
  ];
  const barra = () => (store.get().config.leitura || {}).barra || {};
  const ocult = () => new Set((store.get().config.leitura || {}).filtrosOcultos || []);
  const btnOn = (d) => { const b = barra(); return b[d.k] === undefined ? !!d.def : !!b[d.k]; };
  const pill = (d) => `<button class="ferr-fchip ${btnOn(d) ? "on" : ""}" data-pz="botao" data-k="${d.k}" data-tip="${esc(d.tip || d.lbl)}">${icone(d.ic)} ${d.lbl}</button>`;
  abrirJanela({
    titulo: "Personalizar barra",
    corpoHTML: `<div class="card ferr-lei">
      <section class="ferr-sec">
        <h4>${icone("layout-panel-top")} Botões na barra</h4>
        <p class="muted small u-m-0 u-mb-8">Buscar e o menu ⋯ (Opções) ficam sempre. Fixe aqui os atalhos que quiser ver direto na barra — os demais continuam dentro de Opções.</p>
        <div class="ferr-grupo-lbl">Leitura</div>
        <div class="ferr-linha ferr-filtros">${LER_NAV_DEF.map(pill).join("")}</div>
        <div class="ferr-grupo-lbl">Ações da lei</div>
        <div class="ferr-linha ferr-filtros">${PIN_DEF.filter((d) => !LER_NAV_DEF.includes(d)).map(pill).join("")}</div>
      </section>
      <section class="ferr-sec">
        <h4>${icone("list-filter")} Filtros na barra</h4>
        <div class="ferr-linha ferr-filtros">
          ${FILTROS_DEF.map((f) => `<button class="ferr-fchip ${ocult().has(f.k) ? "" : "on"}" data-pz="filtro" data-k="${f.k}">${icone(f.ic)} ${f.lbl}</button>`).join("")}
        </div>
        <p class="muted small">Os chips aparecem sob o progresso (o filtro em si continua a um clique).</p>
      </section>
    </div>`,
    aoMontar: (jan) => {
      jan.addEventListener("click", (e) => {
        const b = e.target.closest("[data-pz]"); if (!b) return;
        const tipo = b.getAttribute("data-pz"), k = b.getAttribute("data-k");
        if (tipo === "botao") {
          const cur = barra(); const d = PIN_DEF.find((x) => x.k === k);
          const on = cur[k] === undefined ? !!(d && d.def) : !!cur[k];
          store.setLeitura({ barra: { ...cur, [k]: !on } });
          b.classList.toggle("on", !on);
        } else {
          const s = ocult(); if (s.has(k)) s.delete(k); else s.add(k);
          store.setLeitura({ filtrosOcultos: [...s] });
          b.classList.toggle("on", !s.has(k));
        }
        app.refresh();
      });
    },
  });
}

// Ações em lote da lei (itens diretos do menu ⋯). Cada uma opera sobre os artigos com texto.
export const _comTextoLei = (lista) => lista.filter((i) => (i.texto || "").trim() && !i.revogado);

export function acaoGrifarAuto(app, store, lista) {
  const comTexto = _comTextoLei(lista);
  let n = 0; for (const i of comTexto) n += store.autoMarcar("indicacao", i.id, i.texto) || 0;
  toast(n ? `${plural(n, "grifo automático", "grifos automáticos")}.` : "Nada novo a grifar (prazos/restritivas)."); app.refresh();
}
export async function acaoGrifarIA(app, store, lista, el) {
  if (!store.iaDisponivel()) return avisoIA(app, "Grifar com IA");
  const comTexto = _comTextoLei(lista);
  const alvo = comTexto.slice(0, 25);
  if (comTexto.length > 25) toast("Muitos artigos: grifando os 25 primeiros (filtre para focar).");
  // Progresso narrado por artigo (o comOcupado tinha mensagem fixa e parecia travado).
  const fim = toastCarregando("Grifando com a IA…");
  if (el) { el.classList.add("carregando"); el.disabled = true; el.setAttribute("aria-busy", "true"); }
  let n = 0;
  try {
    let i = 0;
    for (const it of alvo) { fim(`Grifando com a IA… ${++i}/${alvo.length}`); try { n += (await store.sugerirMarcacoesIA("indicacao", it.id, it.texto, it.referencia)) || 0; } catch {} }
  } finally {
    fim();
    if (el) { el.classList.remove("carregando"); el.disabled = false; el.removeAttribute("aria-busy"); }
  }
  toast(n ? `${plural(n, "palavra-chave grifada", "palavras-chave grifadas")} pela IA.` : "A IA não achou novas palavras-chave."); app.refresh();
}
export function acaoClassificarTemas(app, store, lista) {
  const n = store.classificarTemasLote(_comTextoLei(lista).map((i) => i.id));
  toast(n ? `${plural(n, "artigo classificado", "artigos classificados")} por tema.` : "Nenhum tema detectado."); app.refresh();
}
// F1: refino por IA (temas mais finos), com loading. Mescla com os detectados offline.
export async function acaoRefinarTemasIA(app, store, lista, norma) {
  if (!store.iaDisponivel()) return avisoIA(app, "Refinar temas com IA");
  const ids = _comTextoLei(lista).map((i) => i.id);
  if (!ids.length) return toast("Sem artigos com texto para classificar.", "erro");
  const n = await comOcupado(() => store.classificarTemasIA(ids, nomeAmigavelLei(norma)), { msg: "Refinando temas com a IA…" });
  if (n == null) return;
  toast(n ? `${plural(n, "artigo refinado", "artigos refinados")} pela IA${ids.length > 40 ? " (40 primeiros)" : ""}.` : "A IA não retornou temas novos.", n ? "ok" : "erro");
  app.refresh();
}
// F3: editor manual dos temas de um artigo (chips remover/adicionar + tema personalizado).
export function abrirEditarTemas(app, id) {
  const { store } = app;
  const ind = store.get().indicacoes.find((i) => i.id === id);
  if (!ind) return;
  let temas = [...(ind.temas || [])];
  const catalogo = store.temasCatalogo();
  abrirJanela({
    titulo: "Temas do artigo",
    corpoHTML: `<div class="card form-leiseca">
      <div class="muted small u-mb-12">${esc(String(ind.referencia || "").split(",")[0])} — clique num tema para <b>remover</b>; escolha abaixo para <b>adicionar</b>.</div>
      <div id="temas-atuais" class="temas-edit-atuais"></div>
      <div class="temas-edit-add-lbl">Adicionar</div>
      <div id="temas-sugestoes" class="temas-edit-sug"></div>
      <div class="temas-edit-novo">
        <input id="tema-novo" placeholder="tema personalizado…" autocomplete="off" />
        <button class="btn btn-ghost btn-sm" data-action="tema-add-novo">${icone("plus")} Adicionar</button>
      </div>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="temas-cancelar">Cancelar</button>
        <button class="btn btn-primary" data-action="temas-salvar">Salvar</button>
      </div>
    </div>`,
    aoMontar: (overlay, fecharM) => {
      const corpo = overlay.querySelector(".mm-corpo");
      const pintar = () => {
        corpo.querySelector("#temas-atuais").innerHTML = temas.length
          ? temas.map((t) => `<button class="tema-edit-chip on" data-tema-rm="${esc(t)}" data-tip="Remover">${esc(t)} ${icone("x")}</button>`).join("")
          : `<span class="muted small">Nenhum tema ainda.</span>`;
        const disp = catalogo.filter((t) => !temas.includes(t));
        corpo.querySelector("#temas-sugestoes").innerHTML = disp.length
          ? disp.map((t) => `<button class="tema-edit-chip" data-tema-add="${esc(t)}">${icone("plus")} ${esc(t)}</button>`).join("")
          : `<span class="muted small">Todos os temas já estão no artigo.</span>`;
      };
      pintar();
      corpo.addEventListener("click", (e) => {
        const rm = e.target.closest("[data-tema-rm]"), ad = e.target.closest("[data-tema-add]");
        if (rm) { temas = temas.filter((t) => t !== rm.getAttribute("data-tema-rm")); pintar(); }
        else if (ad) { const t = ad.getAttribute("data-tema-add"); if (!temas.includes(t)) temas.push(t); pintar(); }
      });
      bindActions(corpo, {
        "tema-add-novo": () => { const inp = corpo.querySelector("#tema-novo"); const v = (inp.value || "").trim(); if (v && !temas.includes(v)) { temas.push(v); inp.value = ""; pintar(); } },
        "temas-cancelar": () => fecharM(),
        "temas-salvar": () => { store.setTemasArtigo(id, temas); toast("Temas atualizados.", "ok"); fecharM(); app.refresh(); },
      });
    },
  });
}
export async function acaoLimparGrifos(app, store, lista) {
  if (!(await confirmar("Remover TODOS os grifos e comentários desta lei?"))) return;
  for (const i of _comTextoLei(lista)) store.limparMarcas("indicacao", i.id);
  toast("Grifos removidos."); app.refresh();
}
// Marcar lido em bloco: precisa de um intervalo (de/até) → painel compacto e focado.
export function abrirMarcarLidoBloco(app, store, lista, norma) {
  const comTexto = _comTextoLei(lista);
  const nums = comTexto.map((i) => numArtigo(i.referencia)).filter((n) => n > 0);
  const minN = nums.length ? Math.min(...nums) : 1, maxN = nums.length ? Math.max(...nums) : 1;
  abrirJanela({
    titulo: `Marcar lido em bloco · ${nomeAmigavelLei(norma)}`,
    corpoHTML: `<div class="card ferr-lei">
      <section class="ferr-sec" style="border:0">
        <div class="ferr-linha">
          <label class="ferr-num">de <input type="number" id="ferr-de" min="${minN}" max="${maxN}" value="${minN}"></label>
          <label class="ferr-num">até <input type="number" id="ferr-ate" min="${minN}" max="${maxN}" value="${maxN}"></label>
          <button class="btn btn-sm btn-soft" data-ferr="lido">${icone("check")} Marcar lidos</button>
          <button class="btn btn-sm btn-ghost" data-ferr="naolido">Desmarcar</button>
        </div>
        <p class="muted small">Marca (ou desmarca) todos os artigos no intervalo informado.</p>
      </section>
    </div>`,
    aoMontar: (jan) => {
      const q = (s) => jan.querySelector(s);
      jan.addEventListener("click", (e) => {
        const b = e.target.closest("[data-ferr]"); if (!b) return;
        const a = b.getAttribute("data-ferr");
        const de = +q("#ferr-de").value, ate = +q("#ferr-ate").value;
        const lo = Math.min(de, ate), hi = Math.max(de, ate);
        const ids = comTexto.filter((i) => { const n = numArtigo(i.referencia); return n >= lo && n <= hi; }).map((i) => i.id);
        const n = store.marcarLidosIds(ids, a === "lido");
        toast(n ? `${plural(n, "artigo", "artigos")} ${a === "lido" ? "marcados como lidos" : "desmarcados"}.` : "Nada a alterar.");
        app.refresh();
      });
    },
  });
}

// Catálogo de botões da barra do leitor. NAV = navegação de leitura (padrão fixados);
// AÇÕES = ficam sempre no menu ⋯ (Opções) e podem ser fixados na barra via "Personalizar".
const LER_NAV_DEF = [
  { k: "foco", ic: "book-open", lbl: "Foco", act: "ler-foco-modo", def: true, foco: true, tip: "Leitura em foco (tela cheia)" },
  { k: "sumario", ic: "list-tree", lbl: "Sumário", act: "ler-indice", def: true, tip: "Sumário: recolher tudo e ver o índice" },
  { k: "aa", ic: "type", lbl: "Aparência (Aa)", def: true, popover: true, tip: "Aparência da leitura (fonte, tamanho, tema)" },
];
const LER_ACOES_DEF = [
  { k: "incidencia", ic: "star", lbl: "Marcar o que mais cai", act: "toggle-pq-import", grupo: "prep", tip: "Marca os artigos que MAIS CAEM em prova (por incidência): a IA sugere ou você cola a estatística. Diferente de grifar — aqui você ranqueia os artigos de maior peso." },
  { k: "buscaIA", ic: "sparkles", lbl: "Busca por significado (IA)", act: "abrir-indice", grupo: "prep", ia: true, tip: "Separa os artigos para a Busca por significado (IA) do chat — encontra pelo sentido, não só pela palavra exata. Só deste módulo." },
  { k: "grifar", ic: "highlighter", lbl: "Grifar prazos e restritivas", act: "ler-grifar-auto", grupo: "prep", tip: "Grifa dentro do texto os prazos e valores e os termos restritivos, cada grupo com uma cor própria (offline)." },
  { k: "grifarIA", ic: "sparkles", lbl: "Grifar palavras-chave (IA)", act: "ler-grifar-ia", grupo: "prep", ia: true, tip: "A IA grifa as palavras-chave de cada artigo." },
  { k: "temas", ic: "tags", lbl: "Classificar por tema", act: "ler-temas", grupo: "prep", tip: "Detecta temas por artigo (prazo, competência, quórum…) — habilita o memorizar por tema." },
  { k: "temasIA", ic: "sparkles", lbl: "Refinar temas (IA)", act: "ler-temas-ia", grupo: "prep", ia: true, tip: "A IA refina e adiciona temas mais finos por artigo (mescla com os detectados offline)." },
  { k: "lidoBloco", ic: "check-check", lbl: "Marcar lido em bloco", act: "ler-lido-bloco", grupo: "bloco", tip: "Marca um intervalo de artigos (de/até) como lidos." },
  { k: "desmarcarLidos", ic: "rotate-ccw", lbl: "Desmarcar todos lidos", act: "ler-desmarcar-lidos", grupo: "bloco", danger: true, tip: "Marca todos os artigos desta lei como NÃO lidos (zera o progresso de leitura). Pede confirmação." },
  { k: "imprimir", ic: "printer", lbl: "Imprimir grifos", act: "ler-imprimir-grifos", grupo: "bloco", tip: "Imprime os grifos e comentários desta lei." },
  { k: "limpar", ic: "eraser", lbl: "Limpar grifos", act: "ler-limpar-grifos", grupo: "bloco", danger: true, tip: "Remove todos os grifos e comentários desta lei." },
  { k: "site", ic: "external-link", lbl: "Abrir no site oficial", act: "ler-site", grupo: "bloco", fonte: true, tip: "Abre a fonte oficial da lei." },
];
// Disponibilidade dinâmica de uma ação (IA conectada / lei tem fonte oficial).
function lerAcaoDisponivel(d, store, temFonte) {
  if (d.ia && !store.iaDisponivel()) return false;
  if (d.fonte && !temFonte) return false;
  return true;
}

export function leitorBarraHTML(st, store, norma, normas, lista, opts = {}) {
  const vivos = lista.filter((i) => !i.revogado);
  const total = vivos.length;
  const lidos = vivos.filter((i) => i.lido).length;
  const pct = total ? Math.round((100 * lidos) / total) : 0;
  const favs = lista.filter((i) => i.favorito).length;
  const difs = lista.filter((i) => i.dificil).length;
  const pqs = lista.filter((i) => (!i.revogado) && (i.pq || (i.pqIncidencia || 0) > 0)).length;
  const ids = new Set(lista.map((i) => i.id));
  const grifos = [...(opts.comGrifo || [])].filter((id) => ids.has(id)).length;
  const notas = [...(opts.comNota || [])].filter((id) => ids.has(id)).length;
  const ult = (st.config.ultimaLeitura || {})[norma];
  const fAtivo = opts.filtro;
  const novidadesLei = lista.filter((i) => i.novidadeEm && !i.revogado).length;
  const filtroNovAtivo = !!S.lerFiltroNov.lei;
  // Filtros que o usuário escolheu esconder (gerenciado em Opções ▸ Filtros).
  const ocultos = new Set((st.config.leitura || {}).filtrosOcultos || []);
  // Fase 5 (leitor sereno): as estatísticas-filtro saem da exibição permanente e viram um
  // dropdown único "Filtrar" na barra. Mesmas ações/contagens (data-action="ler-stat-filtro");
  // some o que está zerado ou oculto pelo usuário — a menos que seja o filtro ativo.
  const filtrosDef = [
    { ic: "check", n: lidos, lbl: "lidos", key: "lido" },
    { ic: "bookmark", n: favs, lbl: "favoritos", key: "favorito" },
    { ic: "flame", n: difs, lbl: "difíceis", key: "dificil" },
    { ic: "star", n: pqs, lbl: "que mais caem", key: "pq" },
    { ic: "highlighter", n: grifos, lbl: "grifos", key: "grifo" },
    { ic: "sticky-note", n: notas, lbl: "anotações", key: "anotacao" },
  ].filter((d) => fAtivo === d.key || !ocultos.has(d.key));
  // Os filtros escolhidos em "Personalizar" aparecem sempre; os que ainda estão zerados vêm
  // desabilitados (com o "0"), para o usuário ver que existem sem cair num leitor vazio ao clicar.
  const filtroIt = (d) => { const vazio = d.n === 0 && fAtivo !== d.key; return `<button class="ler-menu-it ler-filtro-it ${fAtivo === d.key ? "on" : ""}" ${vazio ? "disabled" : ""} data-action="ler-stat-filtro" data-f="${d.key}" data-tip="${vazio ? `Nenhum artigo ${d.lbl} ainda` : (fAtivo === d.key ? "Clique para limpar o filtro" : `Mostrar só os ${d.lbl}`)}">${icone(d.ic)} ${d.lbl[0].toUpperCase() + d.lbl.slice(1)}<span class="ler-filtro-n">${d.n}</span></button>`; };
  const menuFiltro = (filtrosDef.length || fAtivo)
    ? `<details class="ls-mais ler-filtro-tool"><summary class="ler-tool ${fAtivo ? "on" : ""}" data-tip="Filtrar os artigos (lidos, favoritos, grifos…)">${icone("list-filter")}${fAtivo ? `<span class="ler-filtro-badge">1</span>` : ""}</summary><div class="ls-mais-pop ler-mais-menu">
        <div class="ler-menu-lbl">Filtrar artigos</div>
        ${filtrosDef.map(filtroIt).join("")}
        ${fAtivo ? `<div class="ler-menu-sep"></div><button class="ler-menu-it" data-action="ler-limpar-filtro" data-tip="Mostrar todos os artigos">${icone("x")} Limpar filtro</button>` : ""}
      </div></details>`
    : "";
  // Toolbar de ícones (só ícones + tooltip). Cada botão pode ser fixado na barra via "Personalizar".
  const barra = (st.config.leitura || {}).barra || {};
  const fixado = (d) => (barra[d.k] === undefined ? !!d.def : !!barra[d.k]);
  const novidadesN = lista.filter((i) => i.novidadeEm && !i.revogado).length;
  const temFonte = !!(lista.find((i) => i.fonteUrl) || {}).fonteUrl;
  // Um botão da barra (ícone). Aa é popover ancorado; os demais são ação direta.
  const toolBtn = (d) => {
    if (d.popover) return configLeituraToolHTML(st.config.leitura, st.config.tema);
    const tip = d.k === "foco" ? `${d.tip}${ult ? ", começando do último artigo lido" : ""}`
      : d.k === "sumario" ? (S._indiceColapsado ? "Expandir a lei" : d.tip) : d.tip;
    const cls = (d.foco ? "ler-tool-foco" : "") + (d.k === "sumario" && S._indiceColapsado ? " on" : "");
    return `<button class="ler-tool ${cls}" data-action="${d.act}" data-tip="${esc(tip)}">${icone(d.ic)}</button>`;
  };
  const barTools = [...LER_NAV_DEF, ...LER_ACOES_DEF]
    .filter((d) => lerAcaoDisponivel(d, store, temFonte) && fixado(d))
    .map(toolBtn).join("");
  // Menu ⋯ = catálogo completo de Opções (sempre tem tudo, independente do que está fixado).
  const menuIt = (d) => `<button class="ler-menu-it ${d.danger ? "lnk-danger" : ""}" data-action="${d.act}" data-tip="${esc(d.tip)}">${icone(d.ic)} ${d.lbl}</button>`;
  const grupoMenu = (g) => LER_ACOES_DEF.filter((d) => d.grupo === g && lerAcaoDisponivel(d, store, temFonte)).map(menuIt).join("");
  const menuMais = `<details class="ls-mais ler-mais-tool"><summary class="ler-tool" data-tip="Opções da lei">${icone("ellipsis")}</summary><div class="ls-mais-pop ler-mais-menu">
      <button class="ler-menu-it" data-action="ler-renomear" data-tip="Corrigir o nome exibido desta lei.">${icone("square-pen")} Renomear lei</button>
      <button class="ler-menu-it" data-action="conferir-atualizacao" data-tip="Reconsulta a fonte oficial e mostra o que mudou/foi incluído/revogado (e carimba a vigência).">${icone("refresh-cw")} Conferir atualização</button>
      <button class="ler-menu-it" data-action="ler-aleatorio" data-tip="Abre um artigo desta lei ao acaso — bom para revisar sem viés.">${icone("shuffle")} Artigo aleatório</button>
      ${novidadesN ? `<button class="ler-menu-it" data-action="filtro-novidades" data-tip="Mostrar só os artigos com novidade legislativa.">${icone("sparkles")} Ver só novidades (${novidadesN})</button>` : ""}
      <div class="ler-menu-sep"></div>
      <div class="ler-menu-lbl">Preparar automaticamente</div>
      ${grupoMenu("prep")}
      <div class="ler-menu-sep"></div>
      <div class="ler-menu-lbl">Em bloco e grifos</div>
      ${grupoMenu("bloco")}
      <div class="ler-menu-sep"></div>
      <button class="ler-menu-it" data-action="ler-personalizar" data-tip="Escolher quais botões ficam na barra e quais filtros aparecem.">${icone("sliders-horizontal")} Personalizar barra…</button>
    </div></details>`;
  return `<div class="ler-topo">
    <div class="ler-topo-l1">
      <button class="ler-voltar-biblio" data-action="voltar-biblioteca" data-tip="Voltar para Minhas Leis (ver todas as leis e trocar)">${icone("arrow-left")}<span>Minhas leis</span></button>
      <span class="ler-norma" data-tip="Lei aberta">${esc(nomeAmigavelLei(norma))}</span>
      <button class="ler-busca-campo" data-action="ler-buscar" data-tip="Buscar por palavra/significado ou ir para um artigo (nº)">${icone("search")}<span>Buscar ou ir para artigo…</span></button>
      <div class="ler-tools">
        ${barTools}
        ${menuFiltro}
        ${menuMais}
      </div>
    </div>
    <div class="ler-prog" data-tip="${lidos} de ${total} artigos lidos">
      <div class="ler-prog-bar"><span style="width:${pct}%"></span></div>
      <span class="ler-prog-txt"><b>${lidos}</b> / ${total} lidos · <b>${pct}%</b></span>
    </div>
    <div class="ler-agora" hidden aria-live="polite"><span class="la-ic">${icone("map-pin")}</span><span class="la-trilha"></span></div>
  </div><div class="ler-prog-fina" aria-hidden="true"><span style="width:${pct}%"></span></div>`;
}

// Renderiza a lista agrupada e recolhível. Se só existir o grupo "Outros" (sem norma), vai flat.
function corpoAgrupado(lista, tipo, chaveTab, renderItem) {
  const mapa = new Map();
  for (const i of lista) {
    const k = chaveGrupo(tipo, i);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(i);
  }
  const grupos = [...mapa.entries()].map(([norma, itens]) => ({ norma, itens }));
  if (!grupos.some((g) => g.norma !== "Outros")) return renderItensGrupo(lista, tipo, renderItem);
  grupos.sort((a, b) => (a.norma === "Outros" ? 1 : b.norma === "Outros" ? -1 : a.norma.localeCompare(b.norma)));
  return grupos
    .map((g) => {
      const key = `${tipo}:${chaveTab}:${g.norma}`;
      const aberto = !S.gruposFechados.has(key);
      return `<div class="ls-grupo">
        <button class="ls-grupo-head lnk" data-action="toggle-grupo" data-grp="${esc(key)}">
          ${icone(aberto ? "chevron-down" : "chevron-right")} <b>${esc(g.norma)}</b> <span class="num">${g.itens.length}</span>
        </button>
        ${aberto ? `<div class="ls-grupo-itens">${renderItensGrupo(g.itens, tipo, renderItem)}</div>` : ""}
      </div>`;
    })
    .join("");
}

// Aba LER — a letra (link/anotações/texto). Não lidos agrupados por norma; lidos recolhidos.
// No modo LEITOR (semGrupo=true) já há a barra da lei no topo → não repete o cabeçalho de norma.
export function lerCorpoHTML(st, tipo, lista, r, store, vincMap, semGrupo = false, filtroLei = null) {
  // Mesmo botão do topo (mesmo data-action "importar" → mesmo chooser "letra da lei / lista·PDF"),
  // mesmo rótulo e tooltip, para não parecer uma ação diferente.
  const ctaAdd = `<button class="btn btn-add" data-action="importar" data-tip="${tipo === "lei" ? "Trazer a lei: do site oficial (Planalto), colando o texto, ou de um PDF." : "Trazer súmulas/teses: colando o texto/informativo ou de um PDF."}">${icone("download")} Importar</button>`;
  // LEITOR (lei): TODOS os artigos em ordem; o lido PERMANECE no lugar (esmaecido), nunca some.
  if (semGrupo) {
    if (lista.length) { const fechados = new Set((((st.config.leitura || {}).indiceFechado || {})[S.leiAtiva.lei]) || []); return renderLeitorArvore(lista, (i) => itemLeitorHTML(st, tipo, i, store, vincMap), S._indiceColapsado, fechados); }
    if (filtroLei) return vazio(`Nenhum artigo neste filtro\nNenhum artigo marcado como ${{ lido: "lido", favorito: "favorito", dificil: "difícil", grifo: "grifado", anotacao: "anotado" }[filtroLei] || filtroLei}.`,
      `<button class="btn btn-ghost" data-action="ler-limpar-filtro">${icone("x")} Limpar filtro</button>`, icone("filter"));
    return vazio(`Comece pela letra\nImporte ou cole ${r.itemVazio} para ler, marcar e treinar.`, ctaAdd, icone("book-open"));
  }
  // Jurisprudência (lista de cards): como na Lei Seca, o LIDO permanece no lugar (esmaecido via
  // .ls-item.lido) — não vai para uma seção "Lidos" nem some. Súmula/tese lida pode ser relida.
  if (!lista.length) return vazio(`Comece pela letra\nImporte ou cole ${r.itemVazio} para ler, marcar e treinar.`, ctaAdd, icone("book-open"));
  return corpoAgrupado(lista, tipo, "ler", (i) => itemHTML(st, tipo, i, store, "ler", vincMap));
}

// Item da aba LER (v4) — enxuto: a letra + poucas ações (prática/geração ficam no Estudar).
// Incidência aparece INLINE (mini-barra). O menu "⋯" traz só organizar/gerenciar.
// vincMap: índice de vínculos pré-computado (store.mapaVinculos) para evitar O(n²) no render.
// Corpo do artigo SEM o prefixo "Art. Nº" (a referência já vai no cabeçalho) — evita repetição.
export function corpoArtigoLimpo(texto) {
  const t = String(texto || "");
  // "Art. 1º - Não..." → "Não..."; "Art. 121. Matar" → "Matar"; "Art. 5º-A - Texto" → "Texto".
  // Sufixo de letra só ATADO ("5º-A"), nunca "\s*-\s*[A-Z]" (isso comia o início da frase, ex.: "- Não").
  const sem = t.replace(/^\s*Art\.?\s*\d+\s*[ºo°]?(?:-[A-Z])?\s*[-–—.:]?\s*/i, "").trim();
  return sem || t;
}

// F1c: indenta o dispositivo em blocos — caput · § parágrafos · incisos (I, II…) · alíneas (a, b…).
// Heurística SEGURA (só insere quebras nas fronteiras, nunca apaga/embaralha). Preserva a letra.
function formatarTextoLei(texto) {
  const SEP = String.fromCharCode(1); // separador interno (não aparece na letra da lei)
  let t = String(texto || "");
  t = t.replace(/\s+(?=(?:§\s*\d+[ºo°]?|Parágrafo\s+único)\b)/gi, SEP + "P"); // parágrafos
  t = t.replace(/(?<=[;:]\s)(?=[IVXLCDM]{1,4}\s*[-–]\s)/g, SEP + "I");         // incisos (após ; ou :)
  t = t.replace(/(?<=[;:]\s)(?=[a-z]\)\s)/g, SEP + "A");                        // alíneas
  const cls = { P: "lei-par", I: "lei-inc", A: "lei-ali" };
  const parts = t.split(SEP);
  const out = [];
  const caput = (parts[0] || "").trim();
  if (caput) out.push(`<div class="lei-caput">${esc(caput)}</div>`);
  for (let k = 1; k < parts.length; k++) {
    const txt = parts[k].slice(1).trim();
    if (txt) out.push(`<div class="${cls[parts[k][0]] || "lei-caput"}">${esc(txt)}</div>`);
  }
  return out.join("") || esc(String(texto || ""));
}

// Mapa de origem Formatado↔Cru: renderiza o texto INDENTADO (caput/§/inciso/alínea) já com os
// grifos POR CIMA. Cada bloco carrega data-raw = offset (no texto CRU) do seu 1º caractere visível,
// para (a) posicionar as marcas e (b) converter a seleção do usuário de volta para offset ao grifar.
// Contíguo por construção (nunca apaga caractere) → os offsets batem com os das marcas.
function segmentosLei(rawTexto) {
  const raw = String(rawTexto || "");
  const mPref = raw.match(/^\s*Art\.?\s*\d+\s*[ºo°]?(?:-[A-Z])?\s*[-–—.:]?\s*/i);
  const base = mPref && raw.slice(mPref[0].length).trim() ? mPref[0].length : 0;
  const body = raw.slice(base);
  const bnds = [];
  let m;
  const reP = /(?:§\s*\d+[ºo°]?|Parágrafo\s+único)\b/gi;
  while ((m = reP.exec(body))) bnds.push({ pos: m.index, cls: "lei-par" });
  const reI = /(?<=[;:]\s)[IVXLCDM]{1,4}\s*[-–]\s/g;
  while ((m = reI.exec(body))) bnds.push({ pos: m.index, cls: "lei-inc" });
  const reA = /(?<=[;:]\s)[a-z]\)\s/g;
  while ((m = reA.exec(body))) bnds.push({ pos: m.index, cls: "lei-ali" });
  // Item (abaixo da alínea): número + parêntese, "1)"/"2)" — conservador p/ não confundir com §/inciso.
  const reIt = /(?<=[;:]\s)\d{1,2}\)\s/g;
  while ((m = reIt.exec(body))) bnds.push({ pos: m.index, cls: "lei-item" });
  bnds.sort((a, b) => a.pos - b.pos);
  const segs = [];
  let prev = 0, prevCls = "lei-caput";
  for (const b of bnds) { if (b.pos <= prev) continue; segs.push({ s: prev, e: b.pos, cls: prevCls }); prev = b.pos; prevCls = b.cls; }
  segs.push({ s: prev, e: body.length, cls: prevCls });
  // Apara espaços das pontas p/ exibição, mantendo o offset CRU (base + índice) do 1º char visível.
  return segs.map((seg) => {
    let s = seg.s, e = seg.e;
    while (s < e && /\s/.test(body[s])) s++;
    while (e > s && /\s/.test(body[e - 1])) e--;
    return e > s ? { texto: body.slice(s, e), raw: base + s, cls: seg.cls } : null;
  }).filter(Boolean);
}
function trechoComMarcas(text, rawStart, marcas, opts = {}) {
  const rawEnd = rawStart + text.length;
  const modo = opts.modo || "normal", revelados = opts.revelados;
  const rel = (marcas || [])
    .filter((m) => m.fim > rawStart && m.inicio < rawEnd)
    .map((m) => ({ id: m.id, cor: m.cor, a: Math.max(m.inicio, rawStart) - rawStart, b: Math.min(m.fim, rawEnd) - rawStart }))
    .sort((x, y) => x.a - y.a);
  let html = "", pos = 0;
  for (const m of rel) {
    if (m.a < pos) continue; // sobreposição — ignora
    if (m.a > pos) html += esc(text.slice(pos, m.a));
    const trecho = text.slice(m.a, m.b);
    // Recordar: grifo (não comentário) vira lacuna clicável, exceto se já revelado.
    if (modo === "recordar" && m.cor !== "comentario" && !(revelados && revelados.has(m.id))) {
      html += `<span class="mk mk-cloze mk-${m.cor}" data-cloze="${m.id}" title="Clique para revelar">${"_".repeat(Math.max(3, Math.min(16, trecho.length)))}</span>`;
    } else {
      const cls = m.cor === "comentario" ? "mk mk-comentario mk-tem-nota" : "mk mk-" + m.cor;
      html += `<mark class="${cls}" data-mid="${m.id}">${esc(trecho)}</mark>`;
    }
    pos = m.b;
  }
  if (pos < text.length) html += esc(text.slice(pos));
  return html;
}
export function renderLeiComMarcas(rawTexto, marcas, opts = {}) {
  // "marcas" (só grifos): esconde o resto, mostra só os trechos grifados na ordem.
  if (opts.modo === "marcas") {
    const gs = (marcas || []).filter((m) => m.cor !== "comentario").sort((a, b) => a.inicio - b.inicio);
    if (!gs.length) return `<span class="muted">Nada grifado neste artigo — grife trechos para revisar aqui.</span>`;
    return gs.map((m) => `<mark class="mk mk-${m.cor}">${esc(m.texto)}</mark>`).join(`<span class="mk-sep"> · </span>`);
  }
  const segs = segmentosLei(rawTexto);
  if (!segs.length) return esc(corpoArtigoLimpo(rawTexto));
  return segs.map((seg) => `<div class="${seg.cls}" data-raw="${seg.raw}">${trechoComMarcas(seg.texto, seg.raw, marcas, opts)}</div>`).join("");
}

// Menu "⋯" do artigo (organizar/gerenciar) — usado pelo render do leitor.
// Fase 5 (leitor sereno): favorito/difícil/"o que mais cai" saíram dos botões-ícone permanentes
// do cabeçalho e vivem AQUI (mesmas ações/handlers); o estado segue visível nos badges do cabeçalho.
function menuArtigoHTML(i, tipo) {
  return [
    `<button class="lnk" data-action="toggle-favorito" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="${i.favorito ? "Favorito (entra em revisão). Clique para tirar." : "Favoritar (destaca e entra em revisão)."}">${icone("bookmark")} ${i.favorito ? "Tirar dos favoritos" : "Favoritar"}</button>`,
    `<button class="lnk" data-action="toggle-dificil" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="${i.dificil ? "Difícil (revisão 1/3/7/15/30). Clique para tirar." : "Marcar como difícil (agenda revisão)."}">${icone("flame")} ${i.dificil ? "Tirar dos difíceis" : "Marcar como difícil"}</button>`,
    `<button class="lnk" data-action="toggle-pq" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="${i.pq ? "Marcado como 'o que mais cai'. Clique para desmarcar." : "Marcar como 'o que mais cai'."}">${icone("star")} ${i.pq ? "Desmarcar 'o que mais cai'" : "Marcar: o que mais cai"}</button>`,
    `<div class="ls-mais-sep"></div>`,
    i.texto ? `<button class="lnk" data-action="ler-foco-art" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Abrir a leitura em foco (tela cheia) neste artigo.">${icone("book-open")} Ler em foco</button>` : "",
    i.texto ? `<button class="lnk" data-action="estudar-artigo" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Certo/Errado só deste artigo — testa a letra (certo/errado).">${icone("repeat-2")} Estudar este artigo</button>` : "",
    i.texto && !i.promovido ? `<button class="lnk" data-action="promover-mem" data-id="${i.id}">${icone("brain")} Marcar para revisar</button>` : "",
    i.promovido ? `<button class="lnk" data-action="despromover-mem" data-id="${i.id}">${icone("brain")} Tirar da revisão</button>` : "",
    i.novidadeEm ? `<button class="lnk" data-action="limpar-novidade" data-id="${i.id}">${icone("check")} Já vi a novidade</button>` : "",
    `<button class="lnk" data-action="art-nota" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Nota livre deste artigo (lembrete, macete) — sem precisar grifar.">${icone("notebook-pen")} ${i.observacao ? "Editar nota" : "Adicionar nota"}</button>`,
    i.texto ? `<button class="lnk" data-action="art-temas" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Ver e corrigir os temas deste artigo (Prazo, Competência…).">${icone("tags")} Temas${(i.temas || []).length ? ` (${i.temas.length})` : ""}</button>` : "",
    `<button class="lnk" data-action="editar" data-id="${i.id}">${icone("square-pen")} Editar</button>`,
    i.revogado
      ? `<button class="lnk" data-action="reativar-rev" data-id="${i.id}">${icone("rotate-ccw")} Reativar</button>`
      : `<button class="lnk lnk-danger" data-action="marcar-rev" data-id="${i.id}">${icone("ban")} ${rotuloRevogado(tipo, i.categoria).acao}</button>`,
    `<button class="lnk lnk-danger" data-action="remover" data-id="${i.id}">${icone("x")} Remover</button>`,
  ].filter(Boolean).join("");
}

// F1d: microinteração — o indicador de status "aparece" com um pop suave após marcar. Como o
// app.refresh() recria o DOM, buscamos o elemento novo no document e aplicamos a classe uma vez.
export function animarFlagsLeitor(id) {
  if (typeof document === "undefined") return;
  const el = document.querySelector(`.ler-art[data-id="${id}"] .ler-flags`);
  if (el) { el.classList.remove("ler-flag-anim"); void el.offsetWidth; el.classList.add("ler-flag-anim"); }
}

// Render do artigo no LEITOR (F1b): SEM cartão — bloco de texto contínuo, separador fino,
// cabeçalho discreto "Art. Nº" (sem repetir a lei), texto sem o prefixo, ações no hover.
function itemLeitorHTML(st, tipo, i, store, vincMap) {
  const refCurta = String(i.referencia || "").split(",")[0].trim();
  const corpo = corpoArtigoLimpo(i.texto);
  const est = i.pqIncidencia != null && store ? store.estrelasIncidencia(i.pqIncidencia) : 0;
  const rotRev = rotuloRevogado(tipo, i.categoria);
  const badges =
    (i.revogado ? `<span class="mini-tag rev-tag">${icone("ban")} ${rotRev.adj}</span>` : "") +
    (i.novidadeEm && !i.revogado ? `<span class="mini-tag nov-tag" data-tip="Novidade legislativa (${fmtData(i.novidadeEm)}).">${icone("sparkles")} novidade</span>` : "") +
    (i.promovido ? `<span class="mini-tag" data-tip="Na sua revisão espaçada.">${icone("brain")} revisando</span>` : "");
  const incHTML = est ? `<span class="ler-art-inc" data-tip="Incidência ${i.pqIncidencia} — o quanto cai.">${"★".repeat(est)}<span class="ler-inc-off">${"★".repeat(5 - est)}</span></span>` : "";
  const ic = (acao, on, iconeNome, tip) => `<button class="ler-ic ${on ? "on-" + on : ""}" data-action="${acao}" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="${tip}">${icone(iconeNome)}</button>`;
  // Fase 5 (leitor sereno): UMA ação visível por artigo — "lido" + menu ⋯ (favorito/difícil/
  // "o que mais cai" migraram para o menu; o estado ativo segue visível nos badges do cabeçalho).
  const acoes =
    ic("ler-lido", i.lido ? "ok" : "", "check", i.lido ? "Lido — clique para desmarcar." : "Marcar como lido.") +
    `<details class="ls-mais ler-mais"><summary data-tip="Mais ações">${icone("ellipsis")}</summary><div class="ls-mais-pop">${menuArtigoHTML(i, tipo)}</div></details>`;
  const grifos = store ? store.marcasAncoradas("indicacao", i.id, i.texto) : [];
  return `<article class="ler-art ${i.lido ? "lida" : ""} ${i.revogado ? "revogada" : ""} ${i.favorito ? "fav" : ""} ${i.dificil ? "dif" : ""}" data-foco-id="${i.id}" data-id="${i.id}">
    <div class="ler-art-head">
      ${i.lido ? `<span class="ler-lido-mark" data-tip="Lido">${icone("check")}</span>` : ""}
      <span class="ler-art-ref">${esc(refCurta)}</span>
      ${i.nomeJuridico ? `<span class="ler-art-nome">${esc(i.nomeJuridico)}</span>` : ""}
      ${i.dificil ? `<span class="ler-dif-mark" data-tip="Difícil">${icone("flame")}</span>` : ""}
      ${i.favorito ? `<span class="ler-fav-mark" data-tip="Favorito">${icone("bookmark")}</span>` : ""}
      ${i.pq && !est ? `<span class="ler-pq-mark" data-tip="Você marcou: o que mais cai">${icone("star")}</span>` : ""}
      ${incHTML}${badges}
      <span class="spacer"></span>
      <div class="ler-art-acoes">${acoes}</div>
    </div>
    ${i.texto ? `<div class="ler-art-corpo" data-art-corpo="${i.id}">${renderLeiComMarcas(i.texto, grifos)}</div>` : ""}
    ${i.observacao ? `<div class="ler-art-obs">${icone("notebook-pen")} ${esc(i.observacao)}</div>` : ""}
  </article>`;
}

// F2 — badge "último informativo no sistema" (por tribunal) + atalho para o site oficial.
const SITES_INFORMATIVO = {
  STF: "https://portal.stf.jus.br/textos/verTexto.asp?servico=informativoSTF",
  STJ: "https://processo.stj.jus.br/jurisprudencia/externo/informativo/",
};
export function ultimoInfoBadgeHTML(st) {
  const porTrib = {};
  for (const i of st.indicacoes || []) {
    if (i.tipo !== "juris" || !i.nInformativo) continue;
    if (/teses|enunciado/i.test(i.categoria || "")) continue; // edição de Jur. em Teses / enunciados não são "informativo"
    const trib = String(i.tribunal || "").toUpperCase();
    const n = parseInt((String(i.nInformativo).match(/\d+/) || ["0"])[0], 10);
    if (!n || !trib) continue;
    if (!porTrib[trib] || n > porTrib[trib].n) porTrib[trib] = { n, data: i.dataDivulgacao || null };
  }
  // Tribunais com site oficial (STF/STJ) SEMPRE aparecem com o atalho "abrir site ↗" (para conferir
  // o último informativo, copiar o texto ou baixar o PDF e importar aqui). O nº aparece quando já há
  // informativo daquele tribunal no sistema. + eventuais outros tribunais já importados.
  const extras = Object.keys(porTrib).filter((t) => !SITES_INFORMATIVO[t]);
  const todos = [...Object.keys(SITES_INFORMATIVO), ...extras];
  const item = (t) => {
    const p = porTrib[t];
    const num = p ? ` nº <b class="tabnums">${p.n}</b>${p.data ? ` <span class="muted">· ${esc(p.data)}</span>` : ""}` : ` <span class="muted small">— nenhum ainda</span>`;
    const site = SITES_INFORMATIVO[t] ? ` <a class="ui-site" href="${SITES_INFORMATIVO[t]}" target="_blank" rel="noopener" data-tip="Abrir os informativos no site oficial — copie o texto ou baixe o PDF e importe aqui.">abrir site ↗</a>` : "";
    return `<span class="ui-item"><b>${esc(t)}</b>${num}${site}</span>`;
  };
  return `<div class="ultimo-info">
    <span class="ui-lbl">${icone("scale")} Informativos</span>
    ${todos.map(item).join('<span class="ui-div"></span>')}
  </div>`;
}
// F2 — cor do chip de ramo do direito (leitura visual instantânea na lista de jurisprudência).
function corRamo(ramo) {
  const r = String(ramo || "").toLowerCase();
  if (/constituc/.test(r)) return "#4f5bd5";
  if (/penal/.test(r)) return "#c4456b";
  if (/administrat/.test(r)) return "#0f8f8f";
  if (/civil/.test(r)) return "#7a4bd0";
  if (/process/.test(r)) return "#2f6bd0";
  if (/tribut/.test(r)) return "#b07a12";
  if (/previd/.test(r)) return "#2a8a4e";
  if (/trabalh/.test(r)) return "#b5642a";
  if (/consumidor/.test(r)) return "#0d9488";
  if (/empresar/.test(r)) return "#7c3aed";
  if (/human/.test(r)) return "#be185d";
  return "#5b6b86";
}
// F2 — linha de META rica do card de jurisprudência (extração de informativo): chip de ramo colorido,
// origem (tribunal + nº do informativo), assunto, órgão, processo, Tema, data, status.
function jurisMetaHTML(i) {
  const chip = (txt, cls) => txt ? `<span class="jm-chip ${cls || ""}">${esc(txt)}</span>` : "";
  const ramoChip = i.ramo ? `<span class="jm-ramo" style="--rc:${corRamo(i.ramo)}">${esc(i.ramo)}</span>` : "";
  const ehTeses = /teses/i.test(i.categoria || "");
  const rotFonte = ehTeses ? "Ed." : "Inf.";
  const origem = i.nInformativo ? `<span class="jm-origem">${esc(i.tribunal || "")}${i.tribunal ? " · " : ""}${rotFonte} ${esc(i.nInformativo)}</span>` : "";
  const stt = i.status === "importante"
    ? `<span class="jm-chip st-import">★ importante</span>`
    : (i.status === "superado" || i.revogado) ? "" : (i.status ? `<span class="jm-chip st-vig">● vigente</span>` : "");
  const meta = [
    ramoChip,
    i.assunto ? `<span class="jm-sub">${esc(i.assunto)}</span>` : "",
    chip(i.orgao),
    chip(i.processo, "mono"),
    i.temaNum ? chip("Tema " + i.temaNum) : "",
    chip(i.dataJulgamento, "mono"),
    stt,
  ].filter(Boolean).join("");
  return (origem || meta) ? `<div class="ls-juris-meta">${origem}${meta}</div>` : "";
}
// F2 — ÍNDICE navegável (Ramo → Assunto) da jurisprudência, classificado pela IA na extração.
// Clicar num ramo/assunto filtra a lista (e serve de escopo p/ estudar-por-tópico). Estilo Lei Seca.
export function indiceJurisHTML(st) {
  const itens = (st.indicacoes || []).filter((i) => i.tipo === "juris" && !i.metaLeitura);
  const tree = {};
  for (const i of itens) {
    const rm = i.ramo || "Sem ramo";
    const as = i.assunto || "Outros";
    (tree[rm] = tree[rm] || { total: 0, assuntos: {} }).total++;
    tree[rm].assuntos[as] = (tree[rm].assuntos[as] || 0) + 1;
  }
  const ramos = Object.keys(tree).sort((a, b) => tree[b].total - tree[a].total || a.localeCompare(b, "pt-BR"));
  const head = `<div class="ji-head">${icone("list-tree")} Índice <span class="ji-ia">✦ assunto pela IA</span></div>`;
  if (!ramos.length) return `<aside class="juris-idx">${head}<p class="ji-vazio muted small">Importe informativos para o índice se montar por ramo → assunto.</p></aside>`;
  const body = ramos.map((rm) => {
    const g = tree[rm];
    const ramoOn = S.filtroRamo === rm;
    const assuntos = Object.keys(g.assuntos).sort((a, b) => g.assuntos[b] - g.assuntos[a] || a.localeCompare(b, "pt-BR"));
    return `<details class="ji-ramo" ${ramoOn ? "open" : ""}>
      <summary><span class="ji-dot" style="background:${corRamo(rm)}"></span><span class="ji-nome ${ramoOn && S.filtroAssunto === "todos" ? "on" : ""}" data-action="juris-idx-ramo" data-ramo="${esc(rm)}">${esc(rm)}</span><span class="ji-cnt">${g.total}</span></summary>
      <div class="ji-assuntos">${assuntos.map((as) => `<button class="ji-as ${ramoOn && S.filtroAssunto === as ? "on" : ""}" data-action="juris-idx-assunto" data-ramo="${esc(rm)}" data-assunto="${esc(as)}"><span>${esc(as)}</span><span class="ji-cnt">${g.assuntos[as]}</span></button>`).join("")}</div>
    </details>`;
  }).join("");
  const limpar = (S.filtroRamo !== "todos" || S.filtroAssunto !== "todos") ? `<button class="ji-limpar lnk" data-action="juris-idx-limpar">${icone("x")} limpar filtro</button>` : "";
  return `<aside class="juris-idx">${head}<div class="ji-tree">${body}</div><div class="ji-foot">Clique num assunto para <b>filtrar</b>.${limpar ? " " + limpar : ""}</div></aside>`;
}
function itemHTML(st, tipo, i, store, contexto = "ler", vincMap = null) {
  const topico = i.topicoId ? st.topicos.find((t) => t.id === i.topicoId) : null;
  const disc = topico ? st.disciplinas.find((d) => d.id === topico.disciplinaId) : i.disciplinaId ? st.disciplinas.find((d) => d.id === i.disciplinaId) : null;
  const vinc = topico
    ? `<button class="tag-topico lnk" data-action="ir-dossie" data-top="${topico.id}">${esc(nomeTopico(st, topico))}</button>`
    : `<span class="tag-topico">${disc ? esc(disc.nome) : "Geral"}</span>`;
  const rotRev = rotuloRevogado(tipo, i.categoria);
  const anoVelho = tipo === "juris" && i.ano && (+todayISO().slice(0, 4) - i.ano) >= 8;
  // Selos: só o que muda o STATUS do dispositivo (não ações). Incidência é separada (inline).
  const badges =
    (i.revogado ? `<span class="mini-tag rev-tag" data-tip="Fora do estudo${i.revogadoEm ? ` (${fmtData(i.revogadoEm)})` : ""}.">${icone("ban")} ${rotRev.adj}</span>` : "") +
    (i.novidadeEm && !i.revogado ? `<span class="mini-tag nov-tag" data-tip="Novidade legislativa (${fmtData(i.novidadeEm)}): mudou ou entrou na última conferência.">${icone("sparkles")} novidade</span>` : "") +
    (tipo === "juris" && i.ano ? `<span class="mini-tag ${anoVelho ? "ano-velho" : "ano-tag"}" data-tip="Entendimento de ${i.ano}.${anoVelho ? " Pode ser antigo — confira se ainda está mantido." : ""}">${anoVelho ? icone("alarm-clock") + " " : ""}${i.ano}</span>` : "") +
    (i.promovido ? `<span class="mini-tag" data-tip="Está na sua revisão espaçada (aba Estudar → Revisar).">${icone("brain")} revisando</span>` : "") +
    (i.tribunal ? `<span class="mini-tag trib-tag">${esc(i.tribunal)}</span>` : "") +
    (tipo === "juris" && i.categoria ? `<span class="mini-tag cat-tag">${esc(i.categoria)}</span>` : "");
  // Incidência inline (a "lente"): mini-barra + número quando marcada.
  const incHTML = i.pqIncidencia != null
    ? `<span class="ls-inc ${i.pqIncidencia >= 70 ? "alta" : i.pqIncidencia >= 40 ? "media" : "baixa"}" data-tip="Incidência ${i.pqIncidencia} — o quanto cai. Prioriza no Estudar."><span class="ls-inc-bar"><span style="width:${Math.max(8, Math.min(100, i.pqIncidencia))}%"></span></span>${i.pqIncidencia}</span>`
    : "";
  // Ação principal visível: ★ (marcar como o que mais cai) + revisar marcas (se houver texto).
  // Fase 5 (grifo único): o botão NÃO arma mais pincéis — abre o painel de revisão (modos +
  // imprimir); grifar/comentar é selecionando o texto do card (menu flutuante).
  const acaoPQ = `<button class="lnk-ic ${i.pq ? "on" : ""}" data-action="toggle-pq" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="${i.pq ? "Marcado como 'o que mais cai'. Clique para desmarcar." : "Marcar como 'o que mais cai'."}">${icone("star")}</button>`;
  // Fase 5 (grifo único): grifar/comentar é selecionando o texto do card — o antigo botão
  // "Revisar as marcas" (por-card) saiu daqui por ser redundante (as marcas já aparecem no texto).
  // Menu "⋯" LEAN: só organizar/gerenciar (nada de treino/geração — isso é da aba Estudar).
  // Na juris, "Ler em foco" e "Marcar para revisar" já vivem no menu "Estudar" → não repetir aqui.
  const menu = [
    i.texto && tipo !== "juris" ? `<button class="lnk" data-action="ler-foco" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Abrir a leitura em foco (tela cheia) neste item.">${icone("book-open")} Ler em foco</button>` : "",
    i.fonteUrl ? `<button class="lnk" data-action="abrir-fonte" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Abrir na fonte oficial (Planalto).">${icone("external-link")} Abrir no site oficial</button>` : "",
    i.texto && !i.promovido ? `<button class="lnk" data-action="promover-mem" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Entra na revisão espaçada (curva do esquecimento) — aparece na hora certa no Revisar. Não estuda agora; só agenda.">${icone("brain")} Marcar para revisar</button>` : "",
    i.promovido ? `<button class="lnk" data-action="despromover-mem" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Tirar da revisão espaçada. Continua no Ler.">${icone("brain")} Tirar da revisão</button>` : "",
    tipo === "juris" && (i.texto || "").length > 300 ? `<button class="lnk" data-action="quebrar-teses" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="A IA separa este informativo em teses individuais.">${icone("list-checks")} Quebrar em teses</button>` : "",
    tipo === "lei" ? `<button class="lnk" data-action="conferir-vigencia" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Marca que você conferiu a vigência hoje (o Mentor lembra quando faz muito tempo).">${icone("calendar-check")} Conferi a vigência</button>` : "",
    i.novidadeEm ? `<button class="lnk" data-action="limpar-novidade" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Já revisei esta novidade: remover o selo.">${icone("check")} Já vi a novidade</button>` : "",
    `<button class="lnk" data-action="editar" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Editar referência, vínculo e trecho.">${icone("square-pen")} Editar</button>`,
    i.revogado
      ? `<button class="lnk" data-action="reativar-rev" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Voltar ao estudo.">${icone("rotate-ccw")} Reativar</button>`
      : `<button class="lnk lnk-danger" data-action="marcar-rev" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="${tipo === "juris" ? "Cancelada/superada: sai do estudo e fica riscada." : "Revogado: sai do estudo e fica riscado."}">${icone("ban")} ${rotRev.acao}</button>`,
    `<button class="lnk lnk-danger" data-action="remover" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Remover este item.">${icone("x")} Remover</button>`,
  ].filter(Boolean).join("");
  const vinculos = vincMap ? (vincMap[i.id] || []) : store ? store.vinculosDaIndicacao(i.id) : [];
  const vincHTML = vinculos.length
    ? `<div class="ls-vinculos">${icone("link")} <span class="muted small">${tipo === "juris" ? "Interpreta" : "Relacionada"}:</span> ${vinculos.slice(0, 5).map((v) => `<button class="lnk ls-vinc-chip" data-action="ir-vinculo" data-id="${v.id}" data-tipo="${v.tipo}" data-tip="Abrir ${esc(v.referencia)}">${esc(v.referencia)}</button>`).join(" · ")}</div>`
    : "";
  // F2 (#4) — ESTUDO ATIVO por card (o diferencial do Mentor): gera/treina direto do julgado.
  const iaOn = store && store.iaDisponivel();
  // Fase 5 (leitor sereno): a fileira de 5 botões vira UM botão "Estudar" com menu pop —
  // mesmos data-action/handlers de antes, só a apresentação muda.
  const estudarAcoes = (tipo === "juris" && (i.texto || "").trim() && !i.revogado)
    ? `<div class="ls-estudar-acoes">
        <details class="ls-mais ls-estudar-menu">
          <summary class="btn btn-soft btn-sm" data-tip="Estudar esta tese agora: Certo/Errado, flashcards, questões ou ler em foco.">${icone("graduation-cap")} Estudar</summary>
          <div class="ls-mais-pop">
            <button class="lnk" data-action="card-ce" data-id="${i.id}" data-tip="${iaOn ? "Gerar Certo/Errado desta tese (você escolhe quantidade e nível) e treinar agora." : "Conecte a IA (Configurações) para gerar."}">${icone("check")} Certo/Errado</button>
            <button class="lnk" data-action="card-flash" data-id="${i.id}" data-tip="${iaOn ? "Gerar flashcards desta tese (você escolhe quantidade e nível)." : "Conecte a IA para gerar."}">${icone("layers")} Flashcard</button>
            <button class="lnk" data-action="card-questoes" data-id="${i.id}" data-tip="${iaOn ? "Gerar questões de múltipla escolha desta tese (você escolhe quantidade e nível)." : "Conecte a IA para gerar."}">${icone("list-checks")} Questões</button>
            <button class="lnk" data-action="ler-foco" data-id="${i.id}" data-tip="Ler em foco (tela cheia).">${icone("book-open")} Foco</button>
          </div>
        </details>
      </div>`
    : "";
  return `
    <div class="card ls-item ${i.lido ? "lido" : ""} ${i.revogado ? "ls-revogado" : ""}" data-foco-id="${i.id}">
      <div class="ls-top">
        <input type="checkbox" data-action="toggle-lido" data-id="${i.id}" ${i.lido ? "checked" : ""} title="Marcar como lido" />
        <span class="ls-ref">${i.revogado || i.lido ? `<s>${esc(i.referencia)}</s>` : esc(i.referencia)}</span>
        ${incHTML}
        ${badges}
        <span class="spacer"></span>
        ${vinc}
        <div class="ls-acoes">
          ${acaoPQ}
          <details class="ls-mais">
            <summary data-tip="Mais ações" title="Mais ações">${icone("ellipsis")}</summary>
            <div class="ls-mais-pop">${menu}</div>
          </details>
        </div>
      </div>
      ${tipo === "juris" ? jurisMetaHTML(i) : ""}
      ${i.texto && !S.marcarAberto.has(i.id) ? `<div class="ls-texto" data-art-corpo="${i.id}"><div data-raw="0">${trechoComMarcas(i.texto, 0, store ? store.marcasAncoradas("indicacao", i.id, i.texto) : [])}</div></div>` : ""}
      ${i.texto && S.marcarAberto.has(i.id) ? `<div class="mk-host" data-mk-host="${i.id}"></div>` : ""}
      ${i.observacao ? `<div class="ls-obs muted small">${icone("notebook-pen")} ${esc(i.observacao)}</div>` : ""}
      ${vincHTML}
      ${estudarAcoes}
    </div>`;
}
