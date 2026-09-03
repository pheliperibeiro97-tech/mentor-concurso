// Camada de persistência com adaptador "pluggable".
// - Em desktop (Tauri): grava/lê o estado no SQLite via comandos Rust.
// - No navegador (testes/dev): usa localStorage com a MESMA API.
// O resto do app não sabe qual backend está ativo.

const STORAGE_KEY = "mentor_concurso_state";

function isTauri() {
  // Tauri v2: __TAURI__ só existe com withGlobalTauri; __TAURI_INTERNALS__ sempre existe no webview.
  return typeof window !== "undefined" && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);
}

async function tauriInvoke(cmd, args) {
  // Import dinâmico para não quebrar no navegador (onde o módulo não existe).
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(cmd, args);
}

// ---- IndexedDB (navegador): aguenta centenas de MB, ao contrário do localStorage (~5–10MB).
// Guarda o estado JSON inteiro numa única chave. Materiais (PDF/imagem) deixam de estourar a cota.
const IDB_NAME = "mentor_concurso";
const IDB_STORE = "kv";
const IDB_BLOBS = "blobs"; // binários dos materiais, FORA do estado (ver blobs abaixo)
const IDB_KEY = "state";
const temIndexedDB = () => typeof indexedDB !== "undefined";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(IDB_BLOBS)) db.createObjectStore(IDB_BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbReq(modo, fn, nomeStore = IDB_STORE) {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(nomeStore, modo);
        const store = tx.objectStore(nomeStore);
        let resultado;
        const r = fn(store);
        if (r) r.onsuccess = () => (resultado = r.result);
        tx.oncomplete = () => resolve(resultado);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}
const idbGet = (k) => idbReq("readonly", (s) => s.get(k));
const idbPut = (k, v) => idbReq("readwrite", (s) => s.put(v, k));
const idbDel = (k) => idbReq("readwrite", (s) => s.delete(k));

export function backendName() {
  if (isTauri()) return "SQLite (Tauri)";
  return temIndexedDB() ? "IndexedDB (navegador)" : "localStorage (navegador)";
}

export async function loadState() {
  try {
    if (isTauri()) {
      const json = await tauriInvoke("load_state");
      return json ? JSON.parse(json) : null;
    }
    if (temIndexedDB()) {
      const v = await idbGet(IDB_KEY);
      if (v != null) return typeof v === "string" ? JSON.parse(v) : v;
      // Migração ÚNICA: estado antigo no localStorage → IndexedDB.
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try { await idbPut(IDB_KEY, raw); localStorage.removeItem(STORAGE_KEY); } catch (_) {}
        return JSON.parse(raw);
      }
      return null;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Falha ao carregar estado:", err);
    return null;
  }
}

// O `texto` do material é o JOIN das `paginas` (o init o recompõe com recomputarTextoDoc, e a
// sincronização já o retira do snapshot pelo mesmo motivo). Gravar os dois é guardar o mesmo
// conteúdo duas vezes: medido na base com as 17 apostilas do cursinho, 17,4 MB de um estado de
// 42,9 MB. E o estado inteiro é reescrito a CADA mudança — tirar isso derrubou o
// `JSON.stringify` de 558 ms para 371 ms por gravação.
// A cópia é RASA: troca só o campo `texto`; `paginas` continua sendo a mesma referência (não há
// cópia de conteúdo), e o objeto vivo em memória não é tocado — quem já leu `d.texto` continua
// enxergando o texto.
// Também tira o ÍNDICE SEMÂNTICO: ele mora na chave `emb:<perfil>` (o store grava e restaura),
// e cada trecho carrega um vetor de 768 dimensões — 6,5 KB por trecho no JSON. Só sai daqui
// quando o armazenamento de blobs está disponível; sem ele, o índice continua no estado (é
// melhor um estado gordo do que perder o índice num desktop com binário antigo).
// E tira as PÁGINAS do material (chave `pag:<doc>`, gravada pelo store): são o corpo do
// material — 17,4 MB nas 17 apostilas do cursinho, contra ~1,6 MB de todo o resto do estudo.
// `opts.blobs` existe para o teste (dev/teste-persistencia.mjs) conseguir exercitar os dois
// mundos; em produção vale o `blobsOk` real do módulo.
export function estadoParaGravar(state, opts) {
  const comBlobs = opts && opts.blobs !== undefined ? !!opts.blobs : blobsOk;
  const enxugarDoc = (d) => {
    if (!d || typeof d !== "object") return d;
    const temPaginas = Array.isArray(d.paginas) && d.paginas.length > 0;
    if (!temPaginas) return d;
    // `texto` é o join das páginas (o init recompõe); `paginas` mora fora quando há blobs.
    return { ...d, texto: "", ...(comBlobs ? { paginas: undefined, temPaginas: d.paginas.length } : {}) };
  };
  const enxugarDocs = (docs) => (Array.isArray(docs) ? docs.map(enxugarDoc) : docs);
  const enxugarPerfil = (p) => {
    if (!p || typeof p !== "object") return p;
    const out = p.documentos ? { ...p, documentos: enxugarDocs(p.documentos) } : { ...p };
    if (comBlobs) out.embeddings = undefined; // `undefined` some do JSON.stringify
    return out;
  };
  if (Array.isArray(state && state.perfis)) return { ...state, perfis: state.perfis.map(enxugarPerfil) };
  if (state && Array.isArray(state.documentos)) return { ...state, documentos: enxugarDocs(state.documentos) };
  return state;
}

// Por que a última gravação falhou. O `saveState` devolve booleano (é o que os chamadores
// esperam), mas a tela precisa dizer ao aluno o que aconteceu: "acabou o espaço" e "o programa
// não conseguiu escrever" pedem reações diferentes.
let ultimoErro = null;
export function ultimoErroDeGravacao() {
  return ultimoErro;
}
// `true` quando a falha foi de ESPAÇO (cota do navegador estourada / disco cheio). É a causa
// mais provável numa biblioteca de cursinho e a única que o aluno resolve sozinho.
export function ehErroDeEspaco(err) {
  const nome = (err && (err.name || err.constructor?.name)) || "";
  const msg = String((err && err.message) || err || "");
  return nome === "QuotaExceededError" || /quota|storage|espa[çc]o|disk|full|no space/i.test(msg);
}

export async function saveState(state) {
  const json = JSON.stringify(estadoParaGravar(state));
  try {
    if (isTauri()) {
      await tauriInvoke("save_state", { json });
    } else if (temIndexedDB()) {
      await idbPut(IDB_KEY, json);
    } else {
      localStorage.setItem(STORAGE_KEY, json);
    }
    ultimoErro = null;
    return true;
  } catch (err) {
    // Falha de gravação não pode morrer no console: quem estava estudando não olha o console,
    // e o app seguia se comportando como se tivesse salvado.
    ultimoErro = err;
    console.error("Falha ao salvar estado:", err);
    return false;
  }
}

export async function resetState() {
  try {
    if (isTauri()) {
      await tauriInvoke("save_state", { json: JSON.stringify(null) });
    } else {
      if (temIndexedDB()) { try { await idbDel(IDB_KEY); } catch (_) {} }
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.error("Falha ao resetar estado:", err);
  }
}

// ---- BINÁRIOS dos materiais (PDF/imagem), fora do estado -------------------
// O estado é uma única string JSON reescrita a cada gravação; com os PDFs dentro dela, uma
// biblioteca de cursinho (9.026 páginas) daria ~489 MB serializados a CADA mudança —
// medido: 55,4 KB por página com o PDF contra 4,07 KB sem. Guardar o binário numa chave
// própria tira 93% do peso do caminho quente e não custa nada em recurso: o visualizador
// de PDF, o OCR por página e a descrição de figuras continuam funcionando, porque leem o
// binário sob demanda.
//
// Desktop: tabela `kv` do SQLite, chave `blob:<id>` (comandos get_blob/set_blob/del_blob).
// Navegador: object store `blobs` do mesmo IndexedDB.
//
// Se o desktop estiver rodando um binário ANTIGO (sem os comandos), `blobsDisponiveis()`
// passa a false e o store volta a guardar o binário embutido no estado — funciona como
// antes, sem perder arquivo, até o app ser atualizado.
let blobsOk = true;
export function blobsDisponiveis() {
  return blobsOk;
}
// Um blob de MATERIAL é `{pdfData, imgData}` com data URL base64 — a forma que o
// visualizador, o OCR e a Visão consomem. No desktop ele é gravado como BYTES (o Rust
// decodifica): a mesma biblioteca ocupa 288 MB em vez de 383 MB. Os outros blobs (páginas do
// material, índice semântico) são JSON e seguem pelo caminho de texto.
// Material gravado por uma versão anterior continua sendo lido do caminho antigo — não há
// migração forçada; a próxima gravação daquele material já vai em bytes.
const RE_DATA_URL = /^data:([^;,]*);base64,(.*)$/s;
// Chaves que NÃO são binário de material: continuam em JSON (e nem tentam o caminho de bytes).
const ehChaveDeTexto = (id) => /^(pag|emb):/.test(String(id));
function campoBinario(valor) {
  if (!valor || typeof valor !== "object") return null;
  // Um material é PDF ou imagem, nunca os dois. Se algum dia for, o caminho de texto guarda
  // os dois campos e nada se perde — o de bytes guarda um só.
  if (valor.pdfData && valor.imgData) return null;
  for (const campo of ["pdfData", "imgData"]) {
    const m = typeof valor[campo] === "string" ? valor[campo].match(RE_DATA_URL) : null;
    if (m) return { campo: campo === "pdfData" ? "pdf" : "img", mime: m[1] || "application/octet-stream", b64: m[2] };
  }
  return null;
}

export async function getBlob(id) {
  if (!id) return null;
  try {
    if (isTauri()) {
      const bin = ehChaveDeTexto(id) ? null : await tauriInvoke("get_blob_bin", { id: String(id) });
      if (bin) {
        const { campo, mime, b64 } = JSON.parse(bin);
        const dataUrl = `data:${mime};base64,${b64}`;
        return { pdfData: campo === "pdf" ? dataUrl : null, imgData: campo === "img" ? dataUrl : null };
      }
      const txt = await tauriInvoke("get_blob", { id: String(id) });
      return txt ? JSON.parse(txt) : null;
    }
    if (temIndexedDB()) return (await idbReq("readonly", (s) => s.get(String(id)), IDB_BLOBS)) || null;
  } catch (err) {
    blobsOk = false;
    console.warn("[blobs] leitura indisponível; o binário fica no estado:", err);
  }
  return null;
}
export async function setBlob(id, valor) {
  if (!id) return false;
  try {
    if (isTauri()) {
      const bin = campoBinario(valor);
      if (bin) {
        await tauriInvoke("set_blob_bin", { id: String(id), campo: bin.campo, mime: bin.mime, b64: bin.b64 });
        return true;
      }
      await tauriInvoke("set_blob", { id: String(id), json: JSON.stringify(valor || {}) });
      return true;
    }
    if (temIndexedDB()) {
      await idbReq("readwrite", (s) => s.put(valor || {}, String(id)), IDB_BLOBS);
      return true;
    }
  } catch (err) {
    blobsOk = false;
    console.warn("[blobs] gravação indisponível; o binário fica no estado:", err);
  }
  return false;
}
export async function delBlob(id) {
  if (!id) return;
  try {
    if (isTauri()) await tauriInvoke("del_blob", { id: String(id) });
    else if (temIndexedDB()) await idbReq("readwrite", (s) => s.delete(String(id)), IDB_BLOBS);
  } catch (err) {
    console.warn("[blobs] remoção falhou:", err);
  }
}

// ---- Arquivo ORIGINAL do material (só desktop) ------------------------------
// Vincular em vez de copiar: o material aponta para onde o arquivo já mora (OneDrive, pasta
// do cursinho). No navegador não existe caminho de arquivo, então `podeVincularArquivo()`
// devolve false e a UI nem oferece.
export function podeVincularArquivo() {
  return isTauri();
}
export async function escolherArquivo() {
  if (!isTauri()) return null;
  try {
    return (await tauriInvoke("escolher_arquivo")) || null;
  } catch (err) {
    console.warn("[arquivo] seletor indisponível:", err);
    return null;
  }
}
export async function abrirArquivoNoSistema(caminho) {
  if (!isTauri() || !caminho) return { ok: false, erro: "Disponível só no aplicativo de computador." };
  try {
    await tauriInvoke("abrir_no_sistema", { caminho });
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: String(err && err.message ? err.message : err) };
  }
}
