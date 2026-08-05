// Cronômetro FLUTUANDO por cima de outros aplicativos — o caso do iPad: estudar num app e
// manter o tempo à vista.
//
// Por que assim, e não com a API "óbvia": a Document Picture-in-Picture
// (`documentPictureInPicture.requestWindow`), que abriria uma janela com HTML de verdade, NÃO
// existe no Safari — nem no iPad nem no Mac. Só Chrome/Edge/Firefox no computador, onde o app
// desktop já tem a janelinha nativa (crono.html). Sobra o PiP de VÍDEO, esse sim suportado no
// iPadOS desde a versão 14: desenha-se o relógio num <canvas>, o canvas vira um MediaStream
// (`captureStream`) e o stream toca num <video> que entra em picture-in-picture.
//
// Consequência que vale saber de antemão: é um vídeo, então não cabem botões nossos dentro da
// janelinha. O que existe ali é o play/pause do sistema — e ele é reaproveitado: pausar o vídeo
// pausa o cronômetro, dar play retoma. Zerar e trocar de modo continuam no app.
import { fmtMMSS } from "./util.js";

let video = null;
let canvas = null;
let ctx = null;
let raf = 0;
let lerEstado = null;   // () => {texto, legenda, cor, rodando, extra}
let aoPlayPause = null; // (querRodar:boolean) => void
let ecoando = false;    // ignora o play/pause que NÓS mesmos disparamos

// `pictureInPictureEnabled` cobre Chrome/Edge/Firefox; `webkitSupportsPresentationMode` é o
// caminho do Safari (iPad/iPhone/Mac), que nunca implementou o nome padrão.
export function pipDisponivel() {
  if (typeof document === "undefined") return false;
  if (document.pictureInPictureEnabled) return true;
  const v = document.createElement("video");
  return typeof v.webkitSupportsPresentationMode === "function" && v.webkitSupportsPresentationMode("picture-in-picture");
}

export function pipAberto() {
  return !!(document.pictureInPictureElement || (video && video.webkitPresentationMode === "picture-in-picture"));
}

const CSS_VAR = (nome, padrao) => {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    return v || padrao;
  } catch (_) {
    return padrao;
  }
};

function desenhar() {
  if (!ctx || !lerEstado) return;
  const { texto, legenda, cor, extra } = lerEstado();
  const L = canvas.width, A = canvas.height;
  ctx.fillStyle = CSS_VAR("--surface-1", "#0f172a");
  ctx.fillRect(0, 0, L, A);
  // Faixa da cor do foco à esquerda: identifica a sessão de relance, como no pill do app.
  ctx.fillStyle = extra ? "#dc2626" : cor || "#2563eb";
  ctx.fillRect(0, 0, 10, A);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = CSS_VAR("--text-1", "#f8fafc");
  // Mono para o dígito não "dançar" a cada segundo.
  ctx.font = `600 ${Math.round(A * 0.42)}px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace`;
  ctx.fillText(texto, L / 2 + 5, A * 0.44);

  if (legenda) {
    ctx.fillStyle = CSS_VAR("--text-3", "#94a3b8");
    ctx.font = `500 ${Math.round(A * 0.13)}px "Inter Variable", Inter, system-ui, sans-serif`;
    ctx.fillText(legenda.slice(0, 34), L / 2 + 5, A * 0.78);
  }
  raf = requestAnimationFrame(desenhar);
}

// Abre (ou fecha) o cronômetro em picture-in-picture.
//   estado()      → {texto, legenda, cor, rodando, extra} a cada quadro
//   onPlayPause() ← o play/pause da janelinha do sistema
export async function alternarPip({ estado, onPlayPause } = {}) {
  if (pipAberto()) return fecharPip();
  lerEstado = estado || lerEstado;
  aoPlayPause = onPlayPause || aoPlayPause;
  if (!lerEstado) throw new Error("cronômetro em PiP sem fonte de estado");

  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 220;
    ctx = canvas.getContext("2d");
  }
  if (!video) {
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    // Fora da tela, mas NÃO display:none nem visibility:hidden — o WebKit recusa PiP de vídeo
    // que ele considera invisível.
    video.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;";
    document.body.appendChild(video);
    video.addEventListener("play", () => { if (!ecoando && aoPlayPause) aoPlayPause(true); });
    video.addEventListener("pause", () => { if (!ecoando && aoPlayPause) aoPlayPause(false); });
    const aoSair = () => { cancelAnimationFrame(raf); raf = 0; };
    video.addEventListener("leavepictureinpicture", aoSair);
    video.addEventListener("webkitpresentationmodechanged", () => { if (!pipAberto()) aoSair(); });
  }

  if (!video.srcObject) {
    if (typeof canvas.captureStream !== "function") throw new Error("este navegador não captura o canvas");
    video.srcObject = canvas.captureStream(10); // 10 fps basta para um relógio de segundos
  }
  if (!raf) desenhar(); // precisa haver quadro ANTES do play, senão o vídeo não tem o que tocar
  await video.play().catch(() => {});

  if (video.webkitSetPresentationMode) video.webkitSetPresentationMode("picture-in-picture");
  else await video.requestPictureInPicture();
  return true;
}

export async function fecharPip() {
  try {
    if (video && video.webkitSetPresentationMode) video.webkitSetPresentationMode("inline");
    else if (document.pictureInPictureElement) await document.exitPictureInPicture();
  } catch (_) {}
  cancelAnimationFrame(raf);
  raf = 0;
  return false;
}

// O cronômetro avisa quando ele mesmo mudou, para o play/pause do vídeo espelhar o app (e não
// disparar de volta um comando que o app acabou de dar).
export function espelharNoPip(rodando) {
  if (!video || !pipAberto()) return;
  ecoando = true;
  try {
    if (rodando && video.paused) video.play().catch(() => {});
    else if (!rodando && !video.paused) video.pause();
  } finally {
    setTimeout(() => { ecoando = false; }, 60);
  }
}

// Texto pronto para a janelinha, a partir do estado do cronômetro.
export function textoDoPip(seg, extra) {
  return (extra ? "+" : "") + fmtMMSS(seg);
}
