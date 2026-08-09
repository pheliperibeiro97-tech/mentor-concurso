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

// "Peso de TEXTO" = total de caracteres do conteúdo extraído (páginas do material, ou o
// texto direto onde não há páginas). Existe porque o `peso()` por item NÃO PEGA o caso real
// de 2026-08-09: um aparelho manteve os MESMOS 21 documentos (a contagem bateu), mas o
// conteúdo de DENTRO deles tinha sumido (bug de importarBackup) — "subiu" por cima do cofre
// bom porque nenhuma coleção encolheu. Preciso pesar o que está dentro do documento, não só
// quantos documentos existem.
export function pesoTexto(snap) {
  if (!snap) return 0;
  const conta = (o) => {
    if (!o || !Array.isArray(o.documentos)) return 0;
    let n = 0;
    for (const d of o.documentos) {
      if (Array.isArray(d.paginas)) for (const p of d.paginas) n += p && p.texto ? p.texto.length : 0;
      else if (typeof d.texto === "string") n += d.texto.length;
    }
    return n;
  };
  return conta(snap) + (snap.perfis || []).reduce((n, p) => n + conta(p), 0);
}
// Mesma lógica do encolheria(), mas para o peso de texto — limiar mais alto (50 mil
// caracteres ≈ um material pequeno) porque um app sem nenhum material ainda é uso legítimo.
export function encolheriaTexto(de, para) {
  return de >= 50000 && para < Math.ceil(de * 0.5);
}

// Chaves de config que são do APARELHO, não da conta: cada máquina escolhe o seu provedor
// de IA (o Claude Code local só existe no desktop; o celular precisa do Gemini). Enquanto
// subiam junto, escolher um provedor num aparelho o empurrava para o outro, onde não
// funcionava — e a chave de API viajava no cofre à toa.
const CONFIG_LOCAL = ["sync", "syncNuvem", "iaProvider", "iaKey", "iaKeyReserva", "iaModelo"];
// Caches DERIVÁVEIS que não são dado do usuário e pesam muito no cofre: o índice semântico
// (768 números por trecho, ~6,4 KB cada, regenerável a partir do próprio material) e o
// checklist da banca (o edital oficial verbatim, guardado só para conferir cobertura). Já
// saem do backup compartilhável por `limparMaterialDaFatia`; o snapshot faltava.
const INDICE_VAZIO = () => ({ modelo: "", itens: [], fontes: {} });
const CHECKLIST_VAZIO = () => ({ conferidoEm: null, itens: [] });

// Snapshot para a nuvem: clona o estado e REMOVE o que não é dado do usuário — os binários
// (pdfData/imgData), o índice semântico, o checklist do edital e a config local do aparelho.
// Mantém texto/páginas. Carimba metadados de sync no topo.
export function montarSnapshotSync(state, dispositivo) {
  // O cofre é da CONTA: sobe o app inteiro, com TODOS os concursos. Uma senha, um cofre —
  // o aparelho que a digitar recebe tudo. (Um cofre por concurso gastaria uma escrita por
  // concurso a cada sincronização e subiria o conteúdo compartilhado repetido.)
  const snap = JSON.parse(JSON.stringify(state));
  // Binários e caches NUNCA sobem, e eles moram dentro de cada concurso — varrer só o topo
  // deixaria os PDFs e o índice passarem.
  const semBinarios = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o.documentos)) {
      o.documentos = o.documentos.map((d) => {
        // `texto` é o join de `paginas` (recomputarTextoDoc) — a MESMA coisa duas vezes.
        // Medido no edital do 192º: 158.098 caracteres em `texto` e 158.020 nas páginas
        // concatenadas, idênticos. Sobe só as páginas; quem recebe reconstrói o `texto` no
        // backfill do init(). Onde não há páginas (texto colado, imagem), `texto` é o campo
        // primário e vai inteiro.
        const temPaginas = Array.isArray(d.paginas) && d.paginas.length > 0;
        // `temPdf`/`temImg` dizem se ESTE aparelho tem o arquivo — e o arquivo não viaja.
        // Subir os sinais faria o celular anunciar "Abrir PDF" para algo que não tem.
        return { ...d, pdfData: null, imgData: null, temPdf: false, temImg: false, ...(temPaginas ? { texto: "" } : {}) };
      });
    }
    if (o.embeddings) o.embeddings = INDICE_VAZIO();
    if (o.editalOficial) o.editalOficial = CHECKLIST_VAZIO();
  };
  semBinarios(snap);
  (snap.perfis || []).forEach(semBinarios);
  // Metadados LOCAIS de cada máquina (handle, dispositivo, base, status, a SENHA da nuvem e
  // a configuração de IA). Nunca sincronizam.
  if (snap.config && CONFIG_LOCAL.some((k) => snap.config[k] !== undefined)) {
    snap.config = { ...snap.config };
    for (const k of CONFIG_LOCAL) delete snap.config[k];
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
    for (const d of (o && o.documentos) || []) {
      binPorId[d.id] = {
        pdfData: d.pdfData || null,
        imgData: d.imgData || null,
        // Os binários já moram fora do estado; o que precisa voltar são os SINAIS de que
        // este aparelho tem o arquivo (o remoto sempre os manda desligados).
        temPdf: !!(d.temPdf || d.pdfData),
        temImg: !!(d.temImg || d.imgData),
      };
    }
  };
  coletar(localState);
  (localState.perfis || []).forEach(coletar);
  const devolver = (o) => {
    if (!o || !Array.isArray(o.documentos)) return;
    o.documentos = o.documentos.map((d) => {
      const bin = binPorId[d.id];
      return bin
        ? { ...d, pdfData: bin.pdfData, imgData: bin.imgData, temPdf: bin.temPdf, temImg: bin.temImg }
        : { ...d, pdfData: d.pdfData || null, imgData: d.imgData || null, temPdf: !!d.temPdf, temImg: !!d.temImg };
    });
  };
  devolver(novo);
  (novo.perfis || []).forEach(devolver);
  // O índice semântico e o checklist do edital também não viajam: o remoto os traz VAZIOS.
  // Sem devolver os locais, cada sincronização apagaria o índice que este aparelho gastou
  // cota do Gemini para construir — e a conferência de cobertura já feita.
  const cachePorPerfil = {};
  const coletarCache = (o, chave) => {
    if (!o || typeof o !== "object") return;
    cachePorPerfil[chave] = { embeddings: o.embeddings, editalOficial: o.editalOficial };
  };
  coletarCache(localState, "@topo");
  (localState.perfis || []).forEach((p) => coletarCache(p, p.id));
  const devolverCache = (o, chave) => {
    if (!o || typeof o !== "object") return;
    const c = cachePorPerfil[chave];
    // Perfil que só existe no remoto não tem cache local: fica vazio e o aparelho reindexa.
    if (c && c.embeddings) o.embeddings = c.embeddings;
    if (c && c.editalOficial) o.editalOficial = c.editalOficial;
  };
  devolverCache(novo, "@topo");
  (novo.perfis || []).forEach((p) => devolverCache(p, p.id));
  // Preserva os metadados de sync e a config de IA LOCAIS (cada máquina tem os seus, incl. a
  // senha da nuvem); o remoto não os traz (foram removidos no snapshot).
  novo.config = { ...(novo.config || {}) };
  for (const k of CONFIG_LOCAL) {
    const local = localState.config && localState.config[k];
    if (local !== undefined) novo.config[k] = local;
  }
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








