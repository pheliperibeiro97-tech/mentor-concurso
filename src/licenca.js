// Licenciamento (anti-repasse, Opção A).
//
// Como funciona:
// - Cada instalação tem um ID de máquina estável (vem do Rust, crate machine-uid).
// - O usuário ativa com uma CHAVE. O app consulta o "porteiro" (um Web App em
//   Google Apps Script + Planilha que o desenvolvedor gerencia), que vincula a
//   chave àquela máquina e devolve uma validade (exp) + assinatura HMAC (sig).
// - O app guarda {chave, maquina, exp, sig} no SQLite (fora do estado, sobrevive
//   ao "apagar todos os dados"). Dentro da validade, abre offline. Vencida, revalida
//   online; se a chave foi revogada/atingiu o limite de máquinas, bloqueia.
//
// Importante: SÓ vale no app empacotado (Tauri). No navegador/dev (sem __TAURI__)
// o portão é transparente — nada é exigido. A chamada ao porteiro passa pelo
// tauri-plugin-http (feita pelo Rust) para não esbarrar em CORS do Apps Script.
//
// >>> ANTES DE EMPACOTAR PARA DISTRIBUIR <<<
// Preencha PORTEIRO_URL e PORTEIRO_SEGREDO abaixo com os valores do seu Apps Script
// (veja empacotamento/licenca/GUIA_DEPLOY.md). Enquanto estiverem com o texto
// "COLE_AQUI...", o portão fica DESLIGADO (útil para builds de teste).

import { esc } from "./util.js";
import { icone } from "./icones.js";

const APP_ID = "mentor-concurso";
const EMAIL_CONTATO = "phelipe.ribeiro97@gmail.com";

// === CONFIGURAÇÃO DO PORTEIRO (preencher antes de distribuir) ===
const PORTEIRO_URL = "https://script.google.com/macros/s/AKfycbwee3Zn6XFLZc18tETBwoEltkSAlDoKhjnBetxkyEvrEXyIKcMf_4zVV-4Pn3ggrExuEg/exec";
const PORTEIRO_SEGREDO = "8a8404c13e1f1b9af59308399dc4f9c06e4f496c385e178ed04484011951b41d";
// =================================================================

export const PORTEIRO_CONFIGURADO =
  !PORTEIRO_URL.startsWith("COLE_AQUI") && !PORTEIRO_SEGREDO.startsWith("COLE_AQUI");

function ehDesktop() {
  // No Tauri v2, window.__TAURI__ só existe com withGlobalTauri; o marcador sempre
  // presente no webview é window.__TAURI_INTERNALS__.
  return typeof window !== "undefined" && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);
}

function agoraSeg() {
  return Math.floor(Date.now() / 1000);
}

async function invocar(cmd, args) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(cmd, args);
}

async function porteiroFetch(url, opts) {
  // fetch do tauri-plugin-http: requisição feita pelo Rust (sem CORS).
  const { fetch } = await import("@tauri-apps/plugin-http");
  return fetch(url, opts);
}

export async function idMaquina() {
  try {
    return await invocar("get_machine_id");
  } catch (_) {
    return "";
  }
}

async function lerLicenca() {
  try {
    const json = await invocar("get_license");
    return json ? JSON.parse(json) : null;
  } catch (_) {
    return null;
  }
}

async function gravarLicenca(lic) {
  try {
    await invocar("set_license", { json: JSON.stringify(lic) });
  } catch (e) {
    console.error("Falha ao gravar licença:", e);
  }
}

async function limparLicenca() {
  try {
    await invocar("set_license", { json: "null" });
  } catch (_) {}
}

// HMAC-SHA256 em hex (mesmo cálculo do porteiro), via Web Crypto do webview.
async function hmacHex(mensagem, segredo) {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw",
    enc.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buf = await crypto.subtle.sign("HMAC", chave, enc.encode(mensagem));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function assinatura(chave, maquina, exp) {
  return hmacHex(`${APP_ID}|${chave}|${maquina}|${exp}`, PORTEIRO_SEGREDO);
}

async function licencaOk(lic, maquina) {
  if (!lic || !lic.chave || !lic.maquina || !lic.exp || !lic.sig) return false;
  if (lic.maquina !== maquina) return false; // licença copiada de outra máquina
  if (agoraSeg() >= Number(lic.exp)) return false; // vencida → precisa revalidar
  const sig = await assinatura(lic.chave, lic.maquina, lic.exp);
  return sig === lic.sig; // detecta adulteração local (ex.: esticar a validade)
}

async function consultar(chave, maquina) {
  const resp = await porteiroFetch(PORTEIRO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chave, maquina, app: APP_ID, v: 1 }),
  });
  return resp.json();
}

// Ativa uma chave digitada pelo usuário. Retorna {ok} ou {ok:false, motivo}.
export async function ativar(chaveDigitada) {
  const chave = (chaveDigitada || "").trim();
  if (!chave) return { ok: false, motivo: "vazia" };
  const maquina = await idMaquina();
  if (!maquina) return { ok: false, motivo: "maquina" };
  let data;
  try {
    data = await consultar(chave, maquina);
  } catch (_) {
    return { ok: false, motivo: "offline" };
  }
  if (!data || !data.ok) return { ok: false, motivo: (data && data.motivo) || "erro" };
  const sig = await assinatura(chave, maquina, data.exp);
  if (sig !== data.sig) return { ok: false, motivo: "assinatura" };
  await gravarLicenca({ chave, maquina, exp: Number(data.exp), sig: data.sig, titular: data.titular || "" });
  return { ok: true };
}

// Revalida uma licença vencida (mesma chave). Atualiza a validade ou bloqueia.
async function revalidar(lic, maquina) {
  let data;
  try {
    data = await consultar(lic.chave, maquina);
  } catch (_) {
    return { ok: false, motivo: "offline" };
  }
  if (data && data.ok) {
    const sig = await assinatura(lic.chave, maquina, data.exp);
    if (sig !== data.sig) return { ok: false, motivo: "assinatura" };
    await gravarLicenca({ ...lic, exp: Number(data.exp), sig: data.sig, titular: data.titular || lic.titular || "" });
    return { ok: true };
  }
  // chave revogada ou inexistente: apaga a licença local para exigir nova ativação.
  if (data && (data.motivo === "revogada" || data.motivo === "chave_invalida")) {
    await limparLicenca();
  }
  return { ok: false, motivo: (data && data.motivo) || "erro" };
}

// PORTÃO chamado no boot. Retorna true se o app pode abrir; senão, renderiza a
// tela de ativação/bloqueio em #app e retorna false.
export async function checarLicenca() {
  if (!ehDesktop()) return true; // navegador/dev: sem exigência
  if (!PORTEIRO_CONFIGURADO) return true; // build de teste (porteiro não configurado)

  const maquina = await idMaquina();
  const lic = await lerLicenca();

  if (lic && (await licencaOk(lic, maquina))) return true;

  if (lic && lic.maquina === maquina) {
    // licença desta máquina, mas vencida → tenta revalidar online
    const r = await revalidar(lic, maquina);
    if (r.ok) return true;
    if (r.motivo === "offline") {
      renderTela(maquina, { offline: true });
      return false;
    }
    renderTela(maquina, { erro: motivoTexto(r.motivo) });
    return false;
  }

  // sem licença válida nesta máquina
  renderTela(maquina, {});
  return false;
}

function motivoTexto(motivo) {
  switch (motivo) {
    case "chave_invalida":
      return "Chave não encontrada. Confira se digitou corretamente.";
    case "revogada":
      return "Esta chave foi revogada. Fale com o suporte.";
    case "limite_dispositivos":
      return "Esta chave já está em uso no número máximo de dispositivos. Fale com o suporte para liberar.";
    case "assinatura":
      return "Resposta de ativação inválida. Tente novamente.";
    case "offline":
      return "Sem conexão. Conecte-se à internet para ativar.";
    case "maquina":
      return "Não foi possível identificar esta máquina.";
    case "vazia":
      return "Digite a chave de licença.";
    default:
      return "Não foi possível ativar agora. Tente novamente em instantes.";
  }
}

function renderTela(maquina, { erro, offline } = {}) {
  const root = document.getElementById("app");
  if (!root) return;
  const titulo = offline ? "Revalidação necessária" : "Ativação do Mentor Concurso";
  const intro = offline
    ? "Sua licença precisa ser revalidada, mas não há conexão no momento. Conecte-se à internet e tente novamente."
    : "Insira sua chave de licença para liberar o aplicativo nesta máquina.";
  root.innerHTML = `
    <div class="licenca-portao">
      <div class="licenca-card">
        <div class="licenca-marca">${icone("graduation-cap")} Mentor Concurso</div>
        <h1>${esc(titulo)}</h1>
        <p class="licenca-intro">${esc(intro)}</p>
        ${erro ? `<p class="licenca-erro">${esc(erro)}</p>` : ""}
        ${
          offline
            ? `<button class="btn btn-primary licenca-btn" data-acao="recarregar">Tentar novamente</button>
               <details class="licenca-outra"><summary>Inserir outra chave</summary>${formChaveHTML()}</details>`
            : formChaveHTML()
        }
        <div class="licenca-rodape">
          <details class="licenca-id">
            <summary>ID desta máquina (para suporte)</summary>
            <code>${esc(maquina || "indisponível")}</code>
          </details>
          <p class="muted small">Precisa de uma chave ou de ajuda? <b>${esc(EMAIL_CONTATO)}</b></p>
        </div>
      </div>
    </div>`;
  ligarTela(root);
}

function formChaveHTML() {
  return `
    <div class="licenca-form">
      <input id="lic-chave" type="text" placeholder="Cole sua chave aqui" autocomplete="off" spellcheck="false" />
      <button class="btn btn-primary licenca-btn" data-acao="ativar">Ativar</button>
    </div>
    <p class="licenca-msg" id="lic-msg"></p>`;
}

function ligarTela(root) {
  const recarregar = root.querySelector('[data-acao="recarregar"]');
  if (recarregar) recarregar.addEventListener("click", () => location.reload());

  const btn = root.querySelector('[data-acao="ativar"]');
  const input = root.querySelector("#lic-chave");
  const msg = root.querySelector("#lic-msg");
  if (!btn || !input) return;

  const tentar = async () => {
    const setMsg = (txt, cor) => {
      if (msg) {
        msg.textContent = txt;
        msg.style.color = cor || "";
      }
    };
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = "Ativando...";
    setMsg("Verificando a chave...");
    const r = await ativar(input.value);
    if (r.ok) {
      setMsg("Ativado! Abrindo o aplicativo...", "var(--success, #16a34a)");
      setTimeout(() => location.reload(), 600);
      return;
    }
    setMsg(motivoTexto(r.motivo), "var(--danger, #dc2626)");
    btn.disabled = false;
    btn.textContent = orig;
  };

  btn.addEventListener("click", tentar);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tentar();
  });
  input.focus();
}
