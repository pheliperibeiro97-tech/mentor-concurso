// Cronômetro FLUTUANDO por cima de outros aplicativos — o caso do iPad: estudar num app e
// manter o tempo à vista.
//
// Por que assim, e não com a API "óbvia": a Document Picture-in-Picture
// (`documentPictureInPicture.requestWindow`), que abriria uma janela com HTML de verdade, NÃO
// existe no Safari — nem no iPad nem no Mac. Só Chrome/Edge/Firefox no computador, onde o app
// desktop já tem a janelinha nativa (crono.html). Sobra o PiP de VÍDEO, esse sim suportado no
// iPadOS desde a versão 14: o relógio é desenhado num <canvas>, o canvas vira um MediaStream
// (`captureStream`) e o stream toca num <video> que entra em picture-in-picture.
//
// Quatro coisas que só apareceram testando, e que explicam o formato do código:
//  - PROPORÇÃO manda no tamanho. A janelinha do PiP mantém a proporção do vídeo e tem altura
//    mínima própria: com um canvas largo e baixo (480x220) ela nascia enorme e NÃO ENCOLHIA.
//    16:9 é o formato que os navegadores esperam e o que aceita ser reduzido.
//  - Vídeo vindo de canvas NÃO GANHA os botões de play/pausa: para o PiP, stream ao vivo não é
//    algo que se pause. Quem desenha esses botões é a MEDIA SESSION.
//  - requestAnimationFrame PARA quando a página vai para segundo plano — exatamente o momento
//    em que esta janela serve para alguma coisa. O desenho é por timer, não por quadro.
//  - O `play()` que damos para o vídeo existir não pode ser lido como "o usuário mandou iniciar";
//    sem trava, abrir a janelinha ligava o cronômetro sozinho.
import { fmtMMSS } from "./util.js";

const L = 320; // 16:9 — ver acima
const A = 180;
const MS_DESENHO = 250; // em segundo plano o navegador afrouxa para ~1 s, que é o que importa

let video = null;
let canvas = null;
let ctx = null;
let timer = 0;
let faixa = null;       // CanvasCaptureMediaStreamTrack, para forçar quadro
let lerEstado = null;   // () => {texto, legenda, cor, rodando, extra}
let aoPlayPause = null; // (querRodar:boolean) => void
let ecoando = false;    // ignora o play/pause que NÓS mesmos disparamos
let ultimoEstadoSistema = null;

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

const ehSafari = () => !!(video && video.webkitSetPresentationMode);

const CSS_VAR = (nome, padrao) => {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    return v || padrao;
  } catch (_) {
    return padrao;
  }
};

function ligarControlesDoSistema() {
  const ms = typeof navigator !== "undefined" && navigator.mediaSession;
  if (!ms) return;
  try {
    if (window.MediaMetadata) ms.metadata = new window.MediaMetadata({ title: "Cronômetro", artist: "Mentor Concurso" });
    ms.setActionHandler("play", () => { if (aoPlayPause) aoPlayPause(true); });
    ms.setActionHandler("pause", () => { if (aoPlayPause) aoPlayPause(false); });
  } catch (_) {}
}

function desligarControlesDoSistema() {
  const ms = typeof navigator !== "undefined" && navigator.mediaSession;
  if (!ms) return;
  try {
    ms.setActionHandler("play", null);
    ms.setActionHandler("pause", null);
    ms.metadata = null;
    ms.playbackState = "none";
  } catch (_) {}
  ultimoEstadoSistema = null;
}

function atualizarEstadoDoSistema(rodando) {
  const alvo = rodando ? "playing" : "paused";
  if (alvo === ultimoEstadoSistema) return; // o tique chama a cada segundo; só mexe na mudança
  ultimoEstadoSistema = alvo;
  try {
    if (navigator.mediaSession) navigator.mediaSession.playbackState = alvo;
  } catch (_) {}
}

// Encolhe a fonte até o texto caber na largura útil — "1:59:59" e uma legenda longa não podem
// vazar pelas bordas de uma janelinha de 320 px.
function fonteQueCabe(texto, tamanhoIdeal, familia, largura) {
  let px = tamanhoIdeal;
  do {
    ctx.font = `${familia.peso} ${px}px ${familia.face}`;
    if (ctx.measureText(texto).width <= largura) return;
    px -= 2;
  } while (px > 9);
}

function desenhar() {
  if (!ctx || !lerEstado) return;
  let e;
  try { e = lerEstado(); } catch (_) { return; }
  const util = L - 16;
  ctx.fillStyle = CSS_VAR("--surface-1", "#0f172a");
  ctx.fillRect(0, 0, L, A);
  // Faixa da cor do foco à esquerda: identifica a sessão de relance, como o pill dentro do app.
  ctx.fillStyle = e.extra ? "#dc2626" : e.cor || "#2563eb";
  ctx.fillRect(0, 0, 8, A);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = CSS_VAR("--text-1", "#f8fafc");
  // Mono para o dígito não "dançar" a cada segundo.
  fonteQueCabe(e.texto, Math.round(A * 0.4), { peso: 600, face: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace' }, util);
  ctx.fillText(e.texto, L / 2 + 4, A * 0.42);

  if (e.legenda) {
    ctx.fillStyle = CSS_VAR("--text-3", "#94a3b8");
    fonteQueCabe(e.legenda, Math.round(A * 0.12), { peso: 500, face: '"Inter Variable", Inter, system-ui, sans-serif' }, util);
    ctx.fillText(e.legenda, L / 2 + 4, A * 0.76);
  }
  // Com fps=0 o quadro só sai quando pedimos — assim o vídeo acompanha o timer, e não o
  // contrário (que é o que congelava em segundo plano).
  try { if (faixa && faixa.requestFrame) faixa.requestFrame(); } catch (_) {}
}

function comecarDesenho() {
  if (timer) return;
  desenhar();
  timer = setInterval(desenhar, MS_DESENHO);
}
function pararDesenho() {
  clearInterval(timer);
  timer = 0;
}

function montar() {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = L;
    canvas.height = A;
    ctx = canvas.getContext("2d");
  }
  if (!video) {
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    // Fora da tela, mas com tamanho de verdade e sem display:none/visibility:hidden — o WebKit
    // recusa PiP de vídeo que ele considere invisível ou de área zero.
    video.style.cssText = "position:fixed;left:-9999px;top:0;width:160px;height:90px;opacity:0.01;pointer-events:none;";
    document.body.appendChild(video);
    video.addEventListener("play", () => { if (!ecoando && aoPlayPause) aoPlayPause(true); });
    video.addEventListener("pause", () => { if (!ecoando && aoPlayPause) aoPlayPause(false); });
    const aoSair = () => { pararDesenho(); desligarControlesDoSistema(); };
    video.addEventListener("leavepictureinpicture", aoSair);
    video.addEventListener("webkitpresentationmodechanged", () => { if (!pipAberto()) aoSair(); });
  }
  if (!video.srcObject) {
    if (typeof canvas.captureStream !== "function") throw new Error("este navegador não captura o canvas");
    const stream = canvas.captureStream(0); // 0 = só sai quadro quando pedimos (requestFrame)
    faixa = stream.getVideoTracks()[0] || null;
    // Navegador sem requestFrame precisa de captura contínua, senão o vídeo nunca recebe quadro.
    video.srcObject = faixa && faixa.requestFrame ? stream : canvas.captureStream(4);
    if (!(faixa && faixa.requestFrame)) faixa = null;
  }
}

// Abre (ou fecha) o cronômetro em picture-in-picture.
//   estado()      → {texto, legenda, cor, rodando, extra} a cada desenho
//   onPlayPause() ← o play/pause da janelinha do sistema
export async function alternarPip({ estado, onPlayPause } = {}) {
  if (pipAberto()) return fecharPip();
  lerEstado = estado || lerEstado;
  aoPlayPause = onPlayPause || aoPlayPause;
  if (!lerEstado) throw new Error("cronômetro em PiP sem fonte de estado");

  montar();
  comecarDesenho(); // precisa haver quadro ANTES do play, senão o vídeo não tem o que tocar
  ligarControlesDoSistema();

  ecoando = true;
  // Sem `await` de propósito: no Safari o pedido de PiP tem de sair DENTRO do gesto do usuário, e
  // esperar a promessa do play já quebraria essa cadeia.
  const tocando = video.play();
  if (tocando && tocando.catch) tocando.catch(() => {});
  try {
    if (video.webkitSetPresentationMode) video.webkitSetPresentationMode("picture-in-picture");
    else await video.requestPictureInPicture();
  } finally {
    ecoando = false;
  }
  espelharNoPip(lerEstado().rodando);
  return true;
}

export async function fecharPip() {
  try {
    if (video && video.webkitSetPresentationMode) video.webkitSetPresentationMode("inline");
    else if (document.pictureInPictureElement) await document.exitPictureInPicture();
  } catch (_) {}
  pararDesenho();
  desligarControlesDoSistema();
  try { if (video && !video.paused) { ecoando = true; video.pause(); setTimeout(() => { ecoando = false; }, 60); } } catch (_) {}
  return false;
}

// O cronômetro avisa quando ele mesmo mudou, para a janelinha espelhar o app (sem devolver ao app
// o comando que ele acabou de dar).
export function espelharNoPip(rodando) {
  if (!video || !pipAberto()) return;
  atualizarEstadoDoSistema(rodando);
  // No Safari os botões da janelinha SÃO o play/pause do vídeo, então lá o vídeo acompanha o
  // relógio. No Chromium quem desenha os botões é a Media Session, e o vídeo precisa continuar
  // tocando: pausá-lo congelaria a janelinha mesmo com o cronômetro andando.
  if (!ehSafari()) return;
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
