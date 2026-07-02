// Atualização automática (Tauri updater v2).
//
// Só atua no app EMPACOTADO (Tauri) e quando o bloco "plugins.updater" estiver
// configurado no tauri.conf.json (endpoint do GitHub Releases + pubkey de assinatura).
// Em dev/navegador, ou enquanto o updater não estiver configurado/assinado, as chamadas
// falham de forma silenciosa — nada quebra. Veja empacotamento/updater/GUIA_UPDATER.md.

import { toast, confirmar } from "./ui.js";

function ehDesktop() {
  // Tauri v2: __TAURI__ só existe com withGlobalTauri; __TAURI_INTERNALS__ sempre existe no webview.
  return typeof window !== "undefined" && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);
}

// Verifica se há nova versão e, com a confirmação do usuário, baixa, instala e reinicia.
// silencioso=true (checagem automática no boot): não avisa quando já está atualizado
// nem quando a checagem falha (ex.: sem internet ou updater ainda não configurado).
export async function verificarAtualizacao({ silencioso = true } = {}) {
  if (!ehDesktop()) {
    if (!silencioso) toast("Atualizações automáticas só funcionam no aplicativo instalado.");
    return;
  }
  let check, relaunch;
  try {
    ({ check } = await import("@tauri-apps/plugin-updater"));
    ({ relaunch } = await import("@tauri-apps/plugin-process"));
  } catch (_) {
    if (!silencioso) toast("Recurso de atualização indisponível nesta versão.");
    return;
  }
  try {
    const update = await check();
    if (!update) {
      if (!silencioso) toast("Você já está na versão mais recente.");
      return;
    }
    const ok = await confirmar(
      `Nova versão ${update.version} disponível. Baixar e instalar agora? O aplicativo será reiniciado.`
    );
    if (!ok) return;
    toast("Baixando atualização… não feche o aplicativo.");
    await update.downloadAndInstall();
    await relaunch();
  } catch (e) {
    try { console.error("[Updater]", e); } catch (_) {}
    if (!silencioso) toast("Não foi possível verificar atualizações agora. Tente mais tarde.");
  }
}
