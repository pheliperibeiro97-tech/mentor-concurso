// Sincronização "traga sua própria nuvem" (Modelo B) — SEM servidor, SEM conta nossa.
//
// Como funciona: o usuário escolhe UM arquivo (ex.: mentor-concurso-sync.json) dentro de
// uma pasta que o Google Drive / OneDrive / Dropbox dele já sincroniza no computador. O
// app lê e grava nesse arquivo via File System Access API (funciona no WebView2 do desktop
// e em navegadores Chromium); o cliente de nuvem do próprio usuário leva o arquivo para as
// outras máquinas. Cada usuário usa a NUVEM DELE — nós nunca vemos nem guardamos nada.
//
// REGRA DE OURO: PDFs e imagens (binários) NUNCA entram no arquivo de sync — só os dados e o
// TEXTO extraído. E ao aplicar o que vem da nuvem, os binários LOCAIS são preservados.

import { store } from "./store.js";

const NOME_PADRAO = "mentor-concurso-sync.json";
const IDB_DB = "mentor-sync";
const IDB_STORE = "handles";
const IDB_KEY = "arquivo";
const IDB_BACKUPS = "backups"; // cópias do lado sobrescrito em conflito (últimos N)
const MAX_BACKUPS = 5;

// ---- Suporte do ambiente ---------------------------------------------------
export function suportaSync() {
  return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
}

// ---- IndexedDB mínimo só para guardar o "handle" do arquivo (não é serializável em JSON,
// por isso não pode ir para o estado/config). ------------------------------------------------
function idb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(IDB_BACKUPS)) db.createObjectStore(IDB_BACKUPS);
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
// Guarda o snapshot (sem binários) do lado que será sobrescrito num conflito; mantém os
// últimos MAX_BACKUPS. Nunca lança (é rede de segurança, não pode quebrar a sync).
async function guardarBackupConflito(snap) {
  try {
    const db = await idb();
    const key = "bkp-" + Date.now();
    await new Promise((res, rej) => {
      const tx = db.transaction(IDB_BACKUPS, "readwrite");
      tx.objectStore(IDB_BACKUPS).put({ em: new Date().toISOString(), snap }, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    const keys = await new Promise((r) => {
      const tx = db.transaction(IDB_BACKUPS, "readonly");
      const rq = tx.objectStore(IDB_BACKUPS).getAllKeys();
      rq.onsuccess = () => r(rq.result || []); rq.onerror = () => r([]);
    });
    const sobra = keys.sort().slice(0, Math.max(0, keys.length - MAX_BACKUPS));
    if (sobra.length) {
      const tx = db.transaction(IDB_BACKUPS, "readwrite");
      sobra.forEach((k) => tx.objectStore(IDB_BACKUPS).delete(k));
    }
  } catch (_) {}
}
// Retorna o backup de conflito mais recente ({em, snap}) ou null — para a tela exportar.
export async function ultimoBackupConflito() {
  try {
    const db = await idb();
    const keys = await new Promise((r) => {
      const tx = db.transaction(IDB_BACKUPS, "readonly");
      const rq = tx.objectStore(IDB_BACKUPS).getAllKeys();
      rq.onsuccess = () => r(rq.result || []); rq.onerror = () => r([]);
    });
    if (!keys.length) return null;
    const ultima = keys.sort().slice(-1)[0];
    return await new Promise((r) => {
      const tx = db.transaction(IDB_BACKUPS, "readonly");
      const rq = tx.objectStore(IDB_BACKUPS).get(ultima);
      rq.onsuccess = () => r(rq.result || null); rq.onerror = () => r(null);
    });
  } catch (_) { return null; }
}
async function idbSet(handle) {
  const db = await idb();
  await new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function idbGet() {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const r = tx.objectStore(IDB_STORE).get(IDB_KEY);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
}
async function idbClear() {
  const db = await idb();
  await new Promise((res) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    tx.oncomplete = res; tx.onerror = res;
  });
}

// ---- Identidade do dispositivo (para o carimbo de "quem salvou por último") ----------------
export function dispositivoId() {
  const sy = (store.get().config && store.get().config.sync) || {};
  if (sy.dispositivo) return sy.dispositivo;
  const id = "disp-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  store.setSyncMeta({ dispositivo: id });
  return id;
}

// ---- ENGINE (puro e testável) --------------------------------------------------------------

// "Peso" de um estado = total de itens relevantes. Usado pela guarda anti-perda: uma
// sincronização que ENCOLHERIA muito esse total (ex.: máquina vazia sobre uma cheia) não é
// aplicada automaticamente — pede decisão do usuário.
const COLECOES_PESO = ["flashcards", "questoes", "resumos", "missoes", "revisoesTopico", "indicacoes", "documentos", "topicos", "disciplinas", "mapasMentais", "redacoes", "sessoes", "revisoes", "tentativas", "errosManuais", "marcacoes"];
export function peso(snap) {
  if (!snap) return 0;
  return COLECOES_PESO.reduce((n, k) => n + (Array.isArray(snap[k]) ? snap[k].length : 0), 0);
}
// Encolheria = o lado de origem tem um conjunto relevante (≥8 itens) e o destino ficaria com
// menos da METADE disso. Pega o caso clássico do "máquina zerada sobrescreve a cheia".
function encolheria(de, para) {
  return de >= 8 && para < Math.ceil(de * 0.5);
}

// Snapshot para a nuvem: clona o estado e REMOVE os binários (pdfData/imgData) de cada
// material, mantendo texto/páginas/embeddings. Carimba metadados de sync no topo.
export function montarSnapshotSync(state, dispositivo) {
  const snap = JSON.parse(JSON.stringify(state));
  snap.documentos = (snap.documentos || []).map((d) => ({ ...d, pdfData: null, imgData: null }));
  // config.sync é metadado LOCAL de cada máquina (handle, dispositivo, base, status) — não sincroniza.
  if (snap.config && snap.config.sync) { snap.config = { ...snap.config }; delete snap.config.sync; }
  snap._sync = {
    app: "mentor-concurso",
    versao: 1,
    // Carimbo = última modificação REAL dos dados (não "agora"), senão a máquina pareceria
    // sempre a mais nova e nunca baixaria. Sem modificadoEm (estado novo) → epoch.
    atualizadoEm: state.modificadoEm || new Date(0).toISOString(),
    dispositivo: dispositivo || "?",
  };
  return snap;
}

// Aplica o estado REMOTO sobre o LOCAL preservando os binários locais (os PDFs/imagens
// ficam só na máquina de quem importou; o sync nunca os carrega nem os apaga).
export function aplicarRemoto(localState, remoto) {
  const novo = JSON.parse(JSON.stringify(remoto));
  // Adota o carimbo do remoto como "última modificação" local, para não re-subir em seguida.
  novo.modificadoEm = (remoto._sync && remoto._sync.atualizadoEm) || novo.modificadoEm || new Date().toISOString();
  delete novo._sync;
  const binPorId = {};
  for (const d of localState.documentos || []) binPorId[d.id] = { pdfData: d.pdfData || null, imgData: d.imgData || null };
  novo.documentos = (novo.documentos || []).map((d) => {
    const bin = binPorId[d.id];
    return bin ? { ...d, pdfData: bin.pdfData, imgData: bin.imgData } : { ...d, pdfData: d.pdfData || null, imgData: d.imgData || null };
  });
  // Preserva os metadados de sync LOCAIS (cada máquina tem os seus); o remoto não os traz.
  novo.config = { ...(novo.config || {}) };
  novo.config.sync = (localState.config && localState.config.sync) || novo.config.sync;
  return novo;
}

// Decide o que fazer comparando o carimbo de tempo (newest-wins, com tolerância).
// Retorna "subir" (local é mais novo / não há remoto), "baixar" (remoto é mais novo) ou
// "igual" (mesmo carimbo).
export function decidir(localSnap, remoto) {
  if (!remoto || !remoto._sync) return "subir";
  const tl = Date.parse(localSnap?._sync?.atualizadoEm || 0) || 0;
  const tr = Date.parse(remoto._sync.atualizadoEm || 0) || 0;
  if (tr > tl) return "baixar";
  if (tl > tr) return "subir";
  return "igual";
}

// ---- TRANSPORTE (File System Access API) ---------------------------------------------------
async function temPermissao(handle, escrever = true) {
  const opts = { mode: escrever ? "readwrite" : "read" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}
async function lerArquivo(handle) {
  const file = await handle.getFile();
  const txt = (await file.text()).trim();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch (_) { return null; }
}
async function gravarArquivo(handle, obj) {
  const w = await handle.createWritable();
  await w.write(JSON.stringify(obj));
  await w.close();
}

// ---- API de alto nível usada pela tela -----------------------------------------------------

// Conecta (escolhe/cria o arquivo de sync na pasta da nuvem do usuário) e faz a 1ª sync.
export async function conectar() {
  if (!suportaSync()) throw new Error("Este ambiente não suporta a sincronização por arquivo.");
  const handle = await window.showSaveFilePicker({
    suggestedName: NOME_PADRAO,
    types: [{ description: "Sincronização do Mentor Concurso", accept: { "application/json": [".json"] } }],
  });
  await temPermissao(handle, true);
  await idbSet(handle);
  store.setSyncMeta({ conectado: true, nomeArquivo: handle.name });
  return sincronizarAgora({ motivo: "conexao" });
}

// Conexão do 2º computador: ABRE um arquivo já existente (sincronizado pelo Drive) só para
// LER e BAIXAR os dados para este computador. Nunca envia/sobrescreve a nuvem na conexão —
// é a opção segura para não perder o que está na nuvem.
export async function conectarBaixando() {
  if (!suportaSync() || typeof window.showOpenFilePicker !== "function") throw new Error("Este ambiente não suporta a sincronização por arquivo.");
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: "Sincronização do Mentor Concurso", accept: { "application/json": [".json"] } }],
  });
  if (!handle) return { ok: false };
  await temPermissao(handle, true);
  await idbSet(handle);
  const agora = new Date().toISOString();
  const state = store.get();
  const remoto = await lerArquivo(handle);
  if (!remoto) {
    // Arquivo ainda vazio (Drive talvez não baixou) — apenas conecta; nada a baixar.
    store.setSyncMeta({ conectado: true, nomeArquivo: handle.name, ultimoResultado: "vazio", erro: "" });
    return { ok: true, acao: "vazio" };
  }
  await guardarBackupConflito(montarSnapshotSync(state, dispositivoId())); // backup do que houver aqui
  const merged = aplicarRemoto(state, remoto);
  await store.importarBackup(merged);
  marcarStatus({ conectado: true, nomeArquivo: handle.name, ultimaSync: agora, baseEm: (remoto._sync && remoto._sync.atualizadoEm) || agora, ultimoResultado: "baixou", pendente: null, ultimoConflitoEm: "", erro: "" });
  return { ok: true, acao: "baixou" };
}

export async function desconectar() {
  await idbClear();
  store.setSyncMeta({ conectado: false });
}

export function estadoSync() {
  return (store.get().config && store.get().config.sync) || { conectado: false };
}

// Núcleo: lê o remoto, decide, e sobe ou baixa (preservando binários locais). Atualiza o
// status em config.sync. `silencioso` evita erro visível em chamadas automáticas.
export async function sincronizarAgora({ motivo = "manual", silencioso = false } = {}) {
  if (!suportaSync()) { if (!silencioso) throw new Error("Ambiente sem suporte a sincronização."); return { ok: false, motivo: "sem-suporte" }; }
  const handle = await idbGet();
  if (!handle) { if (!silencioso) throw new Error("Nenhuma pasta conectada. Clique em Conectar."); return { ok: false, motivo: "sem-handle" }; }
  marcarStatus({ sincronizando: true });
  try {
    if (!(await temPermissao(handle, true))) throw new Error("Permissão de acesso ao arquivo negada.");
    const state = store.get();
    const localSnap = montarSnapshotSync(state, dispositivoId());
    const remoto = await lerArquivo(handle);
    const agora = new Date().toISOString();
    const acao = decidir(localSnap, remoto);
    const pl = peso(localSnap), pr = peso(remoto);

    // GUARDA ANTI-PERDA: se a sincronização ENCOLHERIA muito os dados, NÃO aplica sozinha —
    // guarda backup do lado em risco e registra uma decisão pendente para o usuário escolher.
    if (acao === "baixar" && encolheria(pl, pr)) {
      await guardarBackupConflito(localSnap); // o local (maior) seria sobrescrito
      marcarStatus({ sincronizando: false, ultimoResultado: "reduziria", pendente: { dir: "baixar", local: pl, remoto: pr }, ultimoConflitoEm: agora, erro: "" });
      return { ok: false, motivo: "reduziria", local: pl, remoto: pr };
    }
    if (acao === "subir" && encolheria(pr, pl)) {
      if (remoto) await guardarBackupConflito(remoto); // o remoto (maior) seria sobrescrito
      marcarStatus({ sincronizando: false, ultimoResultado: "reduziria", pendente: { dir: "subir", local: pl, remoto: pr }, ultimoConflitoEm: agora, erro: "" });
      return { ok: false, motivo: "reduziria", local: pl, remoto: pr };
    }

    if (acao === "baixar") {
      await guardarBackupConflito(localSnap); // SEMPRE guarda o que será sobrescrito
      const merged = aplicarRemoto(state, remoto); // aplica preservando binários e config.sync locais
      await store.importarBackup(merged);
      marcarStatus({ sincronizando: false, ultimaSync: agora, baseEm: remoto._sync.atualizadoEm, ultimoResultado: "baixou", pendente: null, erro: "" });
      return { ok: true, acao: "baixou" };
    }
    if (acao === "subir") {
      if (pr > 0) await guardarBackupConflito(remoto); // guarda o remoto não-vazio antes de sobrescrever
      await gravarArquivo(handle, localSnap);
      marcarStatus({ sincronizando: false, ultimaSync: agora, baseEm: localSnap._sync.atualizadoEm, ultimoResultado: "subiu", pendente: null, erro: "" });
      return { ok: true, acao: "subiu" };
    }
    marcarStatus({ sincronizando: false, ultimaSync: agora, baseEm: (remoto && remoto._sync && remoto._sync.atualizadoEm) || localSnap._sync.atualizadoEm, ultimoResultado: "igual", pendente: null, erro: "" });
    return { ok: true, acao: "igual" };
  } catch (e) {
    marcarStatus({ sincronizando: false, ultimoResultado: "erro", erro: e.message });
    if (!silencioso) throw e;
    return { ok: false, erro: e.message };
  }
}

// Resolve a decisão pendente (quando a sync reduziria os dados). "local" = mantém os deste
// computador e envia para a nuvem; "nuvem" = baixa e aplica o que está na nuvem (com backup).
export async function resolverPendencia(escolha) {
  if (!suportaSync()) return { ok: false };
  const handle = await idbGet();
  if (!handle) return { ok: false };
  if (!(await temPermissao(handle, true))) throw new Error("Permissão de acesso ao arquivo negada.");
  const agora = new Date().toISOString();
  const state = store.get();
  const localSnap = montarSnapshotSync(state, dispositivoId());
  if (escolha === "local") {
    await gravarArquivo(handle, localSnap);
    marcarStatus({ ultimaSync: agora, baseEm: localSnap._sync.atualizadoEm, ultimoResultado: "subiu", pendente: null, ultimoConflitoEm: "", erro: "" });
    return { ok: true, acao: "subiu" };
  }
  const remoto = await lerArquivo(handle);
  if (!remoto) return { ok: false };
  await guardarBackupConflito(localSnap);
  const merged = aplicarRemoto(state, remoto);
  await store.importarBackup(merged);
  marcarStatus({ ultimaSync: agora, baseEm: (remoto._sync && remoto._sync.atualizadoEm) || agora, ultimoResultado: "baixou", pendente: null, ultimoConflitoEm: "", erro: "" });
  return { ok: true, acao: "baixou" };
}

function marcarStatus(patch) {
  store.setSyncMeta(patch);
}

// Sincronização ao FECHAR o app (desktop: intercepta o fechamento; web: best-effort).
// No desktop só fecha de fato depois de tentar subir os dados.
export async function sincronizarAoFechar() {
  const cfg = store.get().config || {};
  if (!cfg.sync || !cfg.sync.conectado) return;
  try { await sincronizarAgora({ motivo: "fechar", silencioso: true }); } catch (_) {}
}
