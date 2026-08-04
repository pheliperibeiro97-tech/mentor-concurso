// MOTOR da sincronização — puro e testável, sem transporte. Quem transporta é o
// sync-nuvem.js (cofre cifrado por senha).
//
// Aqui vivem: o "peso" de um estado e a guarda anti-perda, a montagem do snapshot que sobe
// (sem binários), a aplicação do que vem da nuvem preservando os binários locais, a decisão
// "o mais recente vence" e as cópias de segurança de conflito.
//
// REGRA DE OURO: PDFs e imagens (binários) NUNCA sobem — só os dados e o TEXTO extraído.
// E ao aplicar o que vem da nuvem, os binários LOCAIS são preservados.
//
// (O "backup extra por arquivo" no Drive/OneDrive, que também morava aqui, foi removido em
// 2026-08-03: ficava conectado falhando em silêncio e o cofre por senha já cobre os três
// aparelhos.)

import { store } from "./store.js";


const IDB_DB = "mentor-sync";
const IDB_BACKUPS = "backups"; // cópias do lado sobrescrito em conflito (últimos N)
const MAX_BACKUPS = 5;


// ---- IndexedDB só para as cópias de segurança de conflito. ----------------------------
function idb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_BACKUPS)) db.createObjectStore(IDB_BACKUPS);
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
// Guarda o snapshot (sem binários) do lado que será sobrescrito num conflito; mantém os
// últimos MAX_BACKUPS. Nunca lança (é rede de segurança, não pode quebrar a sync).
export async function guardarBackupConflito(snap) {
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
  const conta = (o) => (o ? COLECOES_PESO.reduce((n, k) => n + (Array.isArray(o[k]) ? o[k].length : 0), 0) : 0);
  // Multi-concurso: as coleções moram dentro de perfis[]. Contar só o topo daria quase
  // zero e a guarda anti-perda nunca dispararia — uma máquina vazia sobrescreveria a cheia.
  return conta(snap) + (snap.perfis || []).reduce((n, p) => n + conta(p), 0);
}
// Encolheria = o lado de origem tem um conjunto relevante (≥8 itens) e o destino ficaria com
// menos da METADE disso. Pega o caso clássico do "máquina zerada sobrescreve a cheia".
// Exportada para o transporte de nuvem (sync-nuvem.js) reusar a MESMA guarda anti-perda.
export function encolheria(de, para) {
  return de >= 8 && para < Math.ceil(de * 0.5);
}

// Snapshot para a nuvem: clona o estado e REMOVE os binários (pdfData/imgData) de cada
// material, mantendo texto/páginas/embeddings. Carimba metadados de sync no topo.
export function montarSnapshotSync(state, dispositivo) {
  // O cofre é da CONTA: sobe o app inteiro, com TODOS os concursos. Uma senha, um cofre —
  // o aparelho que a digitar recebe tudo. (Um cofre por concurso gastaria uma escrita por
  // concurso a cada sincronização e subiria o conteúdo compartilhado repetido.)
  const snap = JSON.parse(JSON.stringify(state));
  // Binários NUNCA sobem, e eles moram dentro de cada concurso — varrer só o topo deixaria
  // os PDFs passarem.
  const semBinarios = (o) => {
    if (o && Array.isArray(o.documentos)) o.documentos = o.documentos.map((d) => ({ ...d, pdfData: null, imgData: null }));
  };
  semBinarios(snap);
  (snap.perfis || []).forEach(semBinarios);
  // config.sync / config.syncNuvem são metadados LOCAIS de cada máquina (handle, dispositivo,
  // base, status e — no da nuvem — a SENHA local). Nunca sincronizam.
  if (snap.config && (snap.config.sync || snap.config.syncNuvem)) {
    snap.config = { ...snap.config };
    delete snap.config.sync;
    delete snap.config.syncNuvem;
  }
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
// Devolve o ESTADO COMPLETO (com todos os concursos) pronto para importarBackup.
export function aplicarRemoto(localState, remoto) {
  const novo = JSON.parse(JSON.stringify(remoto));
  // Adota o carimbo do remoto como "última modificação" local, para não re-subir em seguida.
  novo.modificadoEm = (remoto._sync && remoto._sync.atualizadoEm) || novo.modificadoEm || new Date().toISOString();
  delete novo._sync;
  // Os PDFs/imagens ficam só na máquina que importou. Os ids de documento são únicos entre
  // concursos, então um índice só resolve — e ele varre topo E perfis, dos dois lados,
  // porque o remoto pode vir no formato antigo (plano) e o local no novo.
  const binPorId = {};
  const coletar = (o) => {
    for (const d of (o && o.documentos) || []) binPorId[d.id] = { pdfData: d.pdfData || null, imgData: d.imgData || null };
  };
  coletar(localState);
  (localState.perfis || []).forEach(coletar);
  const devolver = (o) => {
    if (!o || !Array.isArray(o.documentos)) return;
    o.documentos = o.documentos.map((d) => {
      const bin = binPorId[d.id];
      return bin ? { ...d, pdfData: bin.pdfData, imgData: bin.imgData } : { ...d, pdfData: d.pdfData || null, imgData: d.imgData || null };
    });
  };
  devolver(novo);
  (novo.perfis || []).forEach(devolver);
  // Preserva os metadados de sync LOCAIS (cada máquina tem os seus, incl. a senha da nuvem);
  // o remoto não os traz (foram removidos no snapshot).
  novo.config = { ...(novo.config || {}) };
  novo.config.sync = (localState.config && localState.config.sync) || novo.config.sync;
  novo.config.syncNuvem = (localState.config && localState.config.syncNuvem) || novo.config.syncNuvem;
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


// ---- API de alto nível usada pela tela -----------------------------------------------------








