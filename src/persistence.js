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

export async function saveState(state) {
  const json = JSON.stringify(state);
  try {
    if (isTauri()) {
      await tauriInvoke("save_state", { json });
    } else if (temIndexedDB()) {
      await idbPut(IDB_KEY, json);
    } else {
      localStorage.setItem(STORAGE_KEY, json);
    }
    return true;
  } catch (err) {
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
export async function getBlob(id) {
  if (!id) return null;
  try {
    if (isTauri()) {
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
