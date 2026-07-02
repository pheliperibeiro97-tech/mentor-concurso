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
const IDB_KEY = "state";
const temIndexedDB = () => typeof indexedDB !== "undefined";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbReq(modo, fn) {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, modo);
        const store = tx.objectStore(IDB_STORE);
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
