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
// v1 = JSON cifrado direto (formato original, ainda LIDO). v2 = JSON + gzip + cifra.
const ENVELOPE_VER = 2;

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
// ---- compressão ------------------------------------------------------------
// O estado é JSON de texto jurídico, altamente redundante: medido, o snapshot real encolhe
// ~4x com gzip. Como o cofre tem teto duro de 24 MB (o Worker devolve 413 acima disso) e o
// corpo ainda vira base64 (+33%), comprimir é o que decide se a biblioteca de materiais
// cabe. `CompressionStream` é nativo no Chromium/WebView2 e nos Workers.
const temCompressao = typeof CompressionStream === "function" && typeof DecompressionStream === "function";
async function gzip(bytes) {
  const fluxo = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}
async function gunzip(bytes) {
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

// Cifra um objeto → envelope { v, salt, iv, ct } (tudo base64). salt/iv são públicos (padrão).
// v=2 comprime o JSON antes de cifrar; v=1 (formato antigo) continua sendo LIDO.
async function cifrar(frase, obj) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chave = await derivarChave(frase, salt);
  const cru = enc.encode(JSON.stringify(obj));
  const comprime = temCompressao;
  const dados = comprime ? await gzip(cru) : cru;
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, dados);
  return { v: comprime ? 2 : 1, salt: bufB64(salt), iv: bufB64(iv), ct: bufB64(ct) };
}
// Decifra o envelope → objeto. Lança se a senha estiver errada (GCM falha a autenticação).
async function decifrar(frase, env) {
  if (!env || !env.salt || !env.iv || !env.ct) throw new Error("Cofre em formato desconhecido.");
  if (env.v !== 1 && env.v !== ENVELOPE_VER) {
    // Antes isto era um "formato desconhecido" seco. Um cofre gravado por uma versão mais
    // nova é o caso real, e o que resolve é atualizar ESTE aparelho — vale dizer isso.
    const e = new Error("Este cofre foi gravado por uma versão mais nova do app. Atualize o Mentor neste aparelho para sincronizar.");
    e.code = "VERSAO_NOVA";
    throw e;
  }
  const chave = await derivarChave(frase, b64Buf(env.salt));
  let plano;
  try {
    plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64Buf(env.iv) }, chave, b64Buf(env.ct));
  } catch (_) {
    const e = new Error("Senha incorreta para este cofre (ou dados corrompidos).");
    e.code = "SENHA_ERRADA";
    throw e;
  }
  const bytes = env.v === 2 ? await gunzip(new Uint8Array(plano)) : new Uint8Array(plano);
  return JSON.parse(dec.decode(bytes));
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
// "Sincronizando" tem DUAS marcas: `config.syncNuvem.sincronizando` (persistida, só para a
// tela mostrar o spinner) e esta, de processo. Fechar/recarregar o app no meio de uma
// sincronização deixava a persistida presa em `true` para sempre — e isso barrava as
// sincronizações seguintes e deixava o botão "Sincronizar agora" desabilitado. A marca de
// processo morre junto com a página, então é ela que decide se há uma sync em andamento.
let emVoo = false;

// A senha viva só na memória do processo? Não: fica em config.syncNuvem.frase (local, e é
// removida do snapshot antes de subir). Helper para lê-la.
function fraseAtual() {
  return (estadoSyncNuvem().frase || "").trim();
}

// ---- API de alto nível -----------------------------------------------------

// Conecta este aparelho ao cofre: valida a senha contra o que já existe na nuvem (se houver)
// e faz a 1ª sincronização. Se o cofre estiver vazio, sobe o estado local.
export async function conectarNuvem(frase, { endpoint, dica } = {}) {
  if (!suportaSyncNuvem()) throw new Error("Este ambiente não suporta a sincronização na nuvem.");
  frase = (frase || "").trim();
  if (frase.length < 6) throw new Error("Escolha uma senha com pelo menos 6 caracteres (fácil de você lembrar).");
  // Grava a senha (e endpoint avançado) localmente ANTES de sincronizar.
  marcar({ frase, endpoint: (endpoint || "").trim() || undefined, ...(dica !== undefined ? { dica: String(dica).slice(0, 80) } : {}) });
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
export async function restaurarDaNuvem(frase, { endpoint, dica } = {}) {
  if (!suportaSyncNuvem()) throw new Error("Este ambiente não suporta a restauração segura.");
  frase = (frase || "").trim();
  if (frase.length < 6) throw new Error("A senha tem pelo menos 6 caracteres.");
  marcar({ frase, endpoint: (endpoint || "").trim() || undefined, ...(dica !== undefined ? { dica: String(dica).slice(0, 80) } : {}) });
  const id = await cofreId(frase);
  const envRemoto = await baixarEnvelope(id);
  if (!envRemoto) { marcar({ frase: "", conectado: false }); const e = new Error("Não há dados na nuvem para essa senha."); e.code = "COFRE_VAZIO"; throw e; }
  const remoto = await decifrar(frase, envRemoto); // lança SENHA_ERRADA se a senha não bate
  // O cofre é da conta: restaurar traz TODOS os concursos de uma vez. É a intenção
  // explícita de "trazer o que está na nuvem para cá", então substitui mesmo — a guarda
  // anti-perda de sincronizarNuvem é que protege o caminho automático.
  const merged = aplicarRemoto(store.get(), remoto);
  await store.importarBackup(merged);
  const agora = new Date().toISOString();
  marcar({ conectado: true, cofre: id.slice(0, 8), ultimaSync: agora, baseEm: (remoto._sync && remoto._sync.atualizadoEm) || agora, ultimoResultado: "baixou", pendente: null, erro: "" });
  return { ok: true, acao: "baixou" };
}

export async function desconectarNuvem() {
  // Limpa também o status para o card não mostrar "Sincronizado há X" depois de desconectar.
  // A DICA sobrevive de propósito: sem a frase (que é apagada aqui), ela é o que resta para
  // você lembrar qual senha usou quando voltar a conectar neste aparelho.
  marcar({ conectado: false, frase: "", pendente: null, ultimaSync: null, ultimoResultado: "", baseEm: "", erro: "", cofre: "" });
}

// Núcleo: baixa o remoto (decifra), decide newest-wins com guarda anti-perda, e sobe/baixa.
export async function sincronizarNuvem({ motivo = "manual", silencioso = false } = {}) {
  if (!suportaSyncNuvem()) { if (!silencioso) throw new Error("Ambiente sem suporte à nuvem."); return { ok: false, motivo: "sem-suporte" }; }
  const frase = fraseAtual();
  if (!frase) { if (!silencioso) throw new Error("Sem senha configurada. Conecte-se primeiro."); return { ok: false, motivo: "sem-senha" }; }
  emVoo = true; // marca de PROCESSO (some ao recarregar) — a de estado abaixo é só para a tela
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
  } finally {
    emVoo = false;
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

// ---- Sincronização AUTOMÁTICA ---------------------------------------------
// Antes a nuvem só era consultada ao ABRIR e ao FECHAR. Com o app aberto o dia inteiro (ou
// com a aba do celular apenas "congelada" pelo sistema, sem evento de fechamento confiável),
// o que era editado num aparelho demorava a aparecer no outro. Agora o app se mantém em dia
// sozinho, em quatro momentos:
//   • ENVIA alguns segundos depois de qualquer alteração (debounce, não atrapalha digitação);
//   • ENVIA quando a aba/janela é escondida (no celular é o único instante garantido);
//   • BAIXA quando o app volta ao foco e a cada poucos minutos com ele aberto;
//   • ENVIA quando a conexão volta.
const AUTO_DEBOUNCE_MS = 6000;      // espera depois da última alteração antes de enviar
const AUTO_INTERVALO_MS = 3 * 60 * 1000; // varredura periódica com o app em foco
const AUTO_MIN_INTERVALO_MS = 15000; // piso padrão entre duas sincronizações
// Voltar ao app é o momento em que o usuário mais espera ver o que fez no outro aparelho:
// piso curto, senão uma sincronização recente "engole" a volta ao foco (visto em teste).
const AUTO_MIN_VOLTA_MS = 4000;

let autoLigado = false;
let autoTimer = null;
let autoUltimoEm = 0;
let autoModificadoVisto = "";

// Dispara uma sincronização silenciosa se fizer sentido. Nunca lança.
// `piso` = tempo mínimo desde a última sincronização (0 = sempre).
async function autoSync(motivo, { piso = AUTO_MIN_INTERVALO_MS } = {}) {
  const st = estadoSyncNuvem();
  // Conflito pendente = o usuário precisa decidir; sincronizar em laço só geraria backups.
  if (!st.conectado || emVoo || st.pendente) return;
  // Geração de IA em curso: NÃO sincronizar. `sincronizarNuvem` pode decidir "baixar" e
  // chamar importarBackup, que troca o estado inteiro — os flashcards/questões recém-criados
  // sumiriam e a tela de destino abriria sem eles. É o cenário típico do celular, onde
  // esconder e voltar a aba (tela apagando durante uma geração longa) dispara uma sync.
  if (store.geracaoEmAndamento && store.geracaoEmAndamento()) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const agora = Date.now();
  if (agora - autoUltimoEm < piso) return;
  autoUltimoEm = agora;
  try { await sincronizarNuvem({ motivo, silencioso: true }); } catch (_) {}
  // Baixar altera o estado (e dispara o subscribe): evita o eco de uma segunda sync inútil.
  autoModificadoVisto = store.get().modificadoEm || "";
  clearTimeout(autoTimer);
  autoTimer = null;
}

// Liga os gatilhos automáticos (uma única vez) e já faz a sincronização de abertura.
export function iniciarSyncNuvemAuto() {
  if (autoLigado || !suportaSyncNuvem()) return;
  autoLigado = true;
  autoModificadoVisto = store.get().modificadoEm || "";
  // Processo novo: nenhuma sync pode estar em andamento. Limpa a marca órfã deixada por um
  // fechamento no meio do caminho (senão a tela mostra spinner e o botão fica desabilitado).
  if (estadoSyncNuvem().sincronizando) marcar({ sincronizando: false });

  // 1) Qualquer alteração real de dados (config.syncNuvem não carimba modificadoEm, então
  //    os próprios metadados de sync não realimentam o laço).
  store.subscribe(() => {
    const m = store.get().modificadoEm || "";
    if (!m || m === autoModificadoVisto) return;
    autoModificadoVisto = m;
    if (!estadoSyncNuvem().conectado) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => autoSync("alteracao", { piso: 0 }), AUTO_DEBOUNCE_MS);
  });

  // 2) Aba escondida (celular trocando de app) → envia agora; voltou ao foco → busca o novo.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { clearTimeout(autoTimer); autoSync("escondeu", { piso: 0 }); }
    else autoSync("voltou", { piso: AUTO_MIN_VOLTA_MS });
  });
  window.addEventListener("focus", () => autoSync("foco", { piso: AUTO_MIN_VOLTA_MS }));
  window.addEventListener("online", () => autoSync("online", { piso: 0 }));

  // 3) Varredura periódica só com o app à vista (aba de fundo não gasta rede/bateria).
  setInterval(() => { if (!document.hidden) autoSync("periodico"); }, AUTO_INTERVALO_MS);

  // 4) Abertura.
  autoSync("boot", { piso: 0 });
}
