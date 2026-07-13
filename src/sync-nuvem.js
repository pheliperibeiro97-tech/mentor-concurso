// Sincronização NA NUVEM por senha — funciona em QUALQUER navegador (celular incluso) e no
// app desktop. Complementa o sync.js "traga sua nuvem" (arquivo/Drive, só desktop): aqui os
// dados vão para um "cofrinho" que o usuário hospeda de graça (Cloudflare Worker + KV/R2),
// cifrados de ponta a ponta por uma SENHA que só ele conhece.
//
// GARANTIAS:
//  • Ponta a ponta: o snapshot é cifrado com AES-GCM 256, chave derivada da senha (PBKDF2).
//    O host (Cloudflare) guarda só bytes cifrados; nem nós nem o Cloudflare leem nada.
//  • O "endereço" do cofre é um HASH da senha (SHA-256) — ninguém descobre a senha a partir
//    dele, e senhas diferentes = cofres diferentes.
//  • Reusa o MOTOR do sync.js: mesmo snapshot (sem PDFs), mesma decisão "o mais recente vence"
//    e a MESMA guarda anti-perda (não deixa uma máquina vazia apagar a nuvem cheia).
//
// A senha fica salva LOCALMENTE (config.syncNuvem) para "digitar uma vez por aparelho" — ela
// é removida do snapshot antes de cifrar (montarSnapshotSync apaga config.syncNuvem).

import { store } from "./store.js";
import {
  montarSnapshotSync,
  aplicarRemoto,
  decidir,
  peso,
  encolheria,
  dispositivoId,
  guardarBackupConflito,
} from "./sync.js";

// Endpoint do cofre — Cloudflare Pages Function publicada JUNTO com o app. Na web é a mesma
// origem; no desktop (Tauri) usa esta URL absoluta. Pode ser sobrescrito por
// config.syncNuvem.endpoint (campo avançado).
const ENDPOINT_PADRAO = "https://mentor-concurso.pages.dev";

const PBKDF2_ITER = 210000; // OWASP 2023 p/ PBKDF2-HMAC-SHA256
const ENVELOPE_VER = 1;

// ---- Ambiente --------------------------------------------------------------
// Precisa de Web Crypto (subtle) + fetch. Presente em todo navegador moderno e no WebView2.
export function suportaSyncNuvem() {
  return (
    typeof window !== "undefined" &&
    !!(window.crypto && window.crypto.subtle) &&
    typeof fetch === "function"
  );
}

// ---- utilitários de bytes/base64 -------------------------------------------
const enc = new TextEncoder();
const dec = new TextDecoder();
function bufB64(buf) {
  const b = new Uint8Array(buf);
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, b.subarray(i, i + CH));
  return btoa(s);
}
function b64Buf(b64) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
function b64url(b64) {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---- cripto ----------------------------------------------------------------
async function sha256b64url(txt) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(txt));
  return b64url(bufB64(h));
}
// Endereço do cofre = hash da senha com um "tempero" fixo do app (namespacing).
export async function cofreId(frase) {
  return sha256b64url("mentor-concurso|cofre|v1|" + frase);
}
async function derivarChave(frase, saltBytes) {
  const base = await crypto.subtle.importKey("raw", enc.encode(frase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITER, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
// Cifra um objeto → envelope { v, salt, iv, ct } (tudo base64). salt/iv são públicos (padrão).
async function cifrar(frase, obj) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chave = await derivarChave(frase, salt);
  const dados = enc.encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, dados);
  return { v: ENVELOPE_VER, salt: bufB64(salt), iv: bufB64(iv), ct: bufB64(ct) };
}
// Decifra o envelope → objeto. Lança se a senha estiver errada (GCM falha a autenticação).
async function decifrar(frase, env) {
  if (!env || env.v !== ENVELOPE_VER || !env.salt || !env.iv || !env.ct) throw new Error("Cofre em formato desconhecido.");
  const chave = await derivarChave(frase, b64Buf(env.salt));
  let plano;
  try {
    plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64Buf(env.iv) }, chave, b64Buf(env.ct));
  } catch (_) {
    const e = new Error("Senha incorreta para este cofre (ou dados corrompidos).");
    e.code = "SENHA_ERRADA";
    throw e;
  }
  return JSON.parse(dec.decode(plano));
}

// ---- transporte (HTTP contra o Worker) -------------------------------------
function endpointBase() {
  const sy = (store.get().config && store.get().config.syncNuvem) || {};
  return (sy.endpoint || ENDPOINT_PADRAO || "").replace(/\/+$/, "");
}
function urlCofre(id) {
  const base = endpointBase();
  if (!base) { const e = new Error("Endereço do cofre não configurado."); e.code = "SEM_ENDPOINT"; throw e; }
  return `${base}/v1/cofre/${encodeURIComponent(id)}`;
}
// GET → envelope (ou null se o cofre ainda não existe).
async function baixarEnvelope(id) {
  const resp = await fetch(urlCofre(id), { method: "GET", headers: { Accept: "application/json" } });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Cofre: HTTP ${resp.status} ao baixar.`);
  const txt = (await resp.text()).trim();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch (_) { return null; }
}
async function subirEnvelope(id, env) {
  const resp = await fetch(urlCofre(id), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(env),
  });
  if (!resp.ok) throw new Error(`Cofre: HTTP ${resp.status} ao enviar.`);
}

// ---- estado/meta -----------------------------------------------------------
export function estadoSyncNuvem() {
  return (store.get().config && store.get().config.syncNuvem) || { conectado: false };
}
function marcar(patch) {
  store.setSyncNuvemMeta(patch);
}
// A senha viva só na memória do processo? Não: fica em config.syncNuvem.frase (local, e é
// removida do snapshot antes de subir). Helper para lê-la.
function fraseAtual() {
  return (estadoSyncNuvem().frase || "").trim();
}

// ---- API de alto nível -----------------------------------------------------

// Conecta este aparelho ao cofre: valida a senha contra o que já existe na nuvem (se houver)
// e faz a 1ª sincronização. Se o cofre estiver vazio, sobe o estado local.
export async function conectarNuvem(frase, { endpoint } = {}) {
  if (!suportaSyncNuvem()) throw new Error("Este ambiente não suporta a sincronização na nuvem.");
  frase = (frase || "").trim();
  if (frase.length < 6) throw new Error("Escolha uma senha com pelo menos 6 caracteres (fácil de você lembrar).");
  // Grava a senha (e endpoint avançado) localmente ANTES de sincronizar.
  marcar({ frase, endpoint: (endpoint || "").trim() || undefined });
  const id = await cofreId(frase);
  const env = await baixarEnvelope(id);
  if (env) {
    // Cofre já existe: valida a senha decifrando. Se a senha estiver errada, aborta a conexão.
    try { await decifrar(frase, env); }
    catch (e) { marcar({ frase: "", conectado: false }); throw e; }
  }
  marcar({ conectado: true, cofre: id.slice(0, 8), erro: "" });
  return sincronizarNuvem({ motivo: "conexao" });
}

// Restauração EXPLÍCITA (aparelho novo trazendo os dados pela senha): baixa e aplica o cofre
// SEM newest-wins — a intenção é claramente "trazer o que está na nuvem para cá". Valida a
// senha decifrando; erra se o cofre não existe (senha errada ou nunca sincronizou).
export async function restaurarDaNuvem(frase, { endpoint } = {}) {
  if (!suportaSyncNuvem()) throw new Error("Este ambiente não suporta a restauração segura.");
  frase = (frase || "").trim();
  if (frase.length < 6) throw new Error("A senha tem pelo menos 6 caracteres.");
  marcar({ frase, endpoint: (endpoint || "").trim() || undefined });
  const id = await cofreId(frase);
  const envRemoto = await baixarEnvelope(id);
  if (!envRemoto) { marcar({ frase: "", conectado: false }); const e = new Error("Não há dados na nuvem para essa senha."); e.code = "COFRE_VAZIO"; throw e; }
  const remoto = await decifrar(frase, envRemoto); // lança SENHA_ERRADA se a senha não bate
  const merged = aplicarRemoto(store.get(), remoto);
  await store.importarBackup(merged);
  const agora = new Date().toISOString();
  marcar({ conectado: true, cofre: id.slice(0, 8), ultimaSync: agora, baseEm: (remoto._sync && remoto._sync.atualizadoEm) || agora, ultimoResultado: "baixou", pendente: null, erro: "" });
  return { ok: true, acao: "baixou" };
}

export async function desconectarNuvem() {
  // Limpa também o status para o card não mostrar "Sincronizado há X" depois de desconectar.
  marcar({ conectado: false, frase: "", pendente: null, ultimaSync: null, ultimoResultado: "", baseEm: "", erro: "", cofre: "" });
}

// Núcleo: baixa o remoto (decifra), decide newest-wins com guarda anti-perda, e sobe/baixa.
export async function sincronizarNuvem({ motivo = "manual", silencioso = false } = {}) {
  if (!suportaSyncNuvem()) { if (!silencioso) throw new Error("Ambiente sem suporte à nuvem."); return { ok: false, motivo: "sem-suporte" }; }
  const frase = fraseAtual();
  if (!frase) { if (!silencioso) throw new Error("Sem senha configurada. Conecte-se primeiro."); return { ok: false, motivo: "sem-senha" }; }
  marcar({ sincronizando: true });
  try {
    const id = await cofreId(frase);
    const state = store.get();
    const localSnap = montarSnapshotSync(state, dispositivoId());
    const envRemoto = await baixarEnvelope(id);
    const remoto = envRemoto ? await decifrar(frase, envRemoto) : null;
    const agora = new Date().toISOString();
    const acao = decidir(localSnap, remoto);
    const pl = peso(localSnap), pr = peso(remoto);

    // GUARDA ANTI-PERDA (mesma do sync.js): não deixa encolher demais sem o usuário decidir.
    if (acao === "baixar" && encolheria(pl, pr)) {
      await guardarBackupConflito(localSnap);
      marcar({ sincronizando: false, ultimoResultado: "reduziria", pendente: { dir: "baixar", local: pl, remoto: pr }, ultimoConflitoEm: agora, erro: "" });
      return { ok: false, motivo: "reduziria", local: pl, remoto: pr };
    }
    if (acao === "subir" && encolheria(pr, pl)) {
      if (remoto) await guardarBackupConflito(remoto);
      marcar({ sincronizando: false, ultimoResultado: "reduziria", pendente: { dir: "subir", local: pl, remoto: pr }, ultimoConflitoEm: agora, erro: "" });
      return { ok: false, motivo: "reduziria", local: pl, remoto: pr };
    }

    if (acao === "baixar") {
      await guardarBackupConflito(localSnap);
      const merged = aplicarRemoto(state, remoto);
      await store.importarBackup(merged);
      marcar({ sincronizando: false, ultimaSync: agora, baseEm: remoto._sync.atualizadoEm, ultimoResultado: "baixou", pendente: null, erro: "" });
      return { ok: true, acao: "baixou" };
    }
    if (acao === "subir") {
      if (pr > 0) await guardarBackupConflito(remoto);
      await subirEnvelope(id, await cifrar(frase, localSnap));
      marcar({ sincronizando: false, ultimaSync: agora, baseEm: localSnap._sync.atualizadoEm, ultimoResultado: "subiu", pendente: null, erro: "" });
      return { ok: true, acao: "subiu" };
    }
    marcar({ sincronizando: false, ultimaSync: agora, baseEm: (remoto && remoto._sync && remoto._sync.atualizadoEm) || localSnap._sync.atualizadoEm, ultimoResultado: "igual", pendente: null, erro: "" });
    return { ok: true, acao: "igual" };
  } catch (e) {
    marcar({ sincronizando: false, ultimoResultado: "erro", erro: e.message });
    if (!silencioso) throw e;
    return { ok: false, erro: e.message };
  }
}

// Resolve a decisão pendente (quando a sync reduziria os dados). "local" = mantém os deste
// aparelho e envia; "nuvem" = baixa e aplica o que está na nuvem (com backup).
export async function resolverPendenciaNuvem(escolha) {
  if (!suportaSyncNuvem()) return { ok: false };
  const frase = fraseAtual();
  if (!frase) return { ok: false };
  const id = await cofreId(frase);
  const agora = new Date().toISOString();
  const state = store.get();
  const localSnap = montarSnapshotSync(state, dispositivoId());
  if (escolha === "local") {
    await subirEnvelope(id, await cifrar(frase, localSnap));
    marcar({ ultimaSync: agora, baseEm: localSnap._sync.atualizadoEm, ultimoResultado: "subiu", pendente: null, ultimoConflitoEm: "", erro: "" });
    return { ok: true, acao: "subiu" };
  }
  const envRemoto = await baixarEnvelope(id);
  const remoto = envRemoto ? await decifrar(frase, envRemoto) : null;
  if (!remoto) return { ok: false };
  await guardarBackupConflito(localSnap);
  const merged = aplicarRemoto(state, remoto);
  await store.importarBackup(merged);
  marcar({ ultimaSync: agora, baseEm: (remoto._sync && remoto._sync.atualizadoEm) || agora, ultimoResultado: "baixou", pendente: null, ultimoConflitoEm: "", erro: "" });
  return { ok: true, acao: "baixou" };
}

// Sincronização ao FECHAR (best-effort). Chamada pelo main.js junto do sync de arquivo.
export async function sincronizarNuvemAoFechar() {
  if (!estadoSyncNuvem().conectado) return;
  try { await sincronizarNuvem({ motivo: "fechar", silencioso: true }); } catch (_) {}
}
