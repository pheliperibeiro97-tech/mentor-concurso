// Notificações desktop (dir.3). Facultativas e desativáveis nas Configurações.
// DECISÃO: o desktop (Tauri) dispara notificação do SO; na web, o lembrete diário
// aparece como aviso DENTRO do app (não há push do navegador).
import { toast } from "./ui.js";

// PURO/testável: o lembrete diário deve disparar agora?
// (ligado + diário + horário já chegou hoje + ainda não disparou hoje).
export function deveDispararDiario(notif, agoraHHMM, hojeISO) {
  if (!notif || !notif.ativar || !notif.diario) return false;
  if (notif.ultimoDiario === hojeISO) return false;
  return agoraHHMM >= (notif.horario || "08:00");
}

function agoraHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function hojeLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Verifica uma vez se o lembrete diário deve disparar; se sim, marca como feito hoje e
// avisa (toast no app sempre; notificação do SO no desktop). Usado no load e no intervalo.
function checarDiario(store) {
  const cfg = store.get().config;
  const notif = cfg.notificacoes || {};
  const hoje = hojeLocalISO();
  if (!deveDispararDiario(notif, agoraHHMM(), hoje)) return;
  store.setConfig({ notificacoes: { ...notif, ultimoDiario: hoje } });
  // Fase 3: lembrete com DADO REAL — só o item mais urgente, 1 frase específica
  // (notificação genérica "Hora de estudar!" é a primeira que o usuário desliga).
  const dev = store.notificacoesDevidas();
  toast(dev.length ? dev[0].corpo : "Bom dia! Seu plano de hoje está pronto no app.");
  dispararNotificacoesDevidas(store); // SO (só Tauri)
}

// Agendador do lembrete diário: checa no load e a cada minuto (enquanto o app está aberto).
export function iniciarAgendadorDiario(store) {
  checarDiario(store);
  setInterval(() => checarDiario(store), 60 * 1000);
}

// O QUE notificar é determinístico em store.notificacoesDevidas(); aqui é só o disparo (SO).
export async function dispararNotificacoesDevidas(store) {
  // Web: silencioso de propósito (a decisão é notificar só no desktop/Tauri).
  if (!(typeof window !== "undefined" && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__))) return;
  if (typeof Notification === "undefined") return;
  const devidas = store.notificacoesDevidas();
  if (!devidas.length) return;
  let perm = Notification.permission;
  if (perm === "default") {
    try {
      perm = await Notification.requestPermission();
    } catch {
      return;
    }
  }
  if (perm !== "granted") return;
  // Limita a 4 para não inundar; cada item já é gentil e específico.
  devidas.slice(0, 4).forEach((n) => {
    try {
      new Notification(n.titulo, { body: n.corpo });
    } catch {
      /* ignora falha de disparo individual */
    }
  });
}
