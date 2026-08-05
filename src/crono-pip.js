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
//  - Vídeo vindo de canvas não ganha play/pausa sozinho: é preciso Media Session E uma faixa de
//    áudio inaudível, e no Safari nem isso (ver "OS BOTÕES DA JANELINHA" adiante).
//  - requestAnimationFrame PARA quando a página vai para segundo plano — exatamente o momento
//    em que esta janela serve para alguma coisa. O desenho é por timer, não por quadro.
//  - O `play()` que damos para o vídeo existir não pode ser lido como "o usuário mandou iniciar";
//    sem trava, abrir a janelinha ligava o cronômetro sozinho.
// 16:9 (ver acima) em resolução ALTA. O que manda no tamanho mínimo da janelinha é a PROPORÇÃO,
// não a contagem de pixels: com 320x180 a janela abria certinho mas o vídeo era esticado na tela e
// o relógio saía embaçado. 960x540 é a mesma proporção com três vezes mais pixels — nítido, e o
// desenho continua barato (um retângulo e dois textos).
const L = 960;
const A = 540;
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
let ultimoTextoDesenhado = null;

// `pictureInPictureEnabled` cobre Chrome/Edge/Firefox; `webkitSupportsPresentationMode` é o
// caminho do Safari (iPad/iPhone/Mac), que nunca implementou o nome padrão.
// 🔴 O REQUISITO QUE DERRUBA O iPAD: `canvas.captureStream()` NÃO EXISTE no Safari do iOS/iPadOS
// (bug antigo do WebKit; funciona no Safari do Mac e no simulador, não no aparelho). Sem ele não
// há MediaStream, então não há vídeo, então não há PiP — por mais que o iPadOS suporte PiP de
// vídeo desde a versão 14. O botão precisa checar ISSO, e não só o suporte a PiP: antes ele
// aparecia no iPad e não fazia nada ao ser tocado.
// No iPad o caminho que existe é outro e é do SISTEMA: instalar o app na Tela de Início e usá-lo
// numa janela pequena (Stage Manager / janelas do iPadOS 26) ao lado do outro aplicativo.
// Aparelho onde a tentativa JÁ FALHOU. Fica gravado porque a única prova confiável é tentar:
// o iPad anuncia suporte a PiP, aceita o pedido e não abre janela nenhuma.
const CHAVE_INDISPONIVEL = "mentor_pip_indisponivel";
function marcarIndisponivel() {
  try { localStorage.setItem(CHAVE_INDISPONIVEL, "1"); } catch (_) {}
}
function jaFalhou() {
  try { return localStorage.getItem(CHAVE_INDISPONIVEL) === "1"; } catch (_) { return false; }
}

export function pipDisponivel() {
  if (typeof document === "undefined") return false;
  if (jaFalhou()) return false;
  if (typeof document.createElement("canvas").captureStream !== "function") return false;
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

// OS BOTÕES DA JANELINHA — o caminho, medido fotografando a janela do Windows.
//
// Vídeo que vem de canvas não ganha play/pausa: para o PiP, stream ao vivo não é algo que se
// pause. A janelinha nascia só com "Voltar para a guia", fechar, mudo e engrenagem.
//
// Declarar as ações da Media Session não bastou: os botões APARECERAM E NÃO FUNCIONARAM, porque
// o stream era mudo e sem faixa de áudio — sem áudio não há sessão de mídia ativa e o navegador
// nunca entrega a ação. O que fecha a conta é dar ao stream uma FAIXA DE ÁUDIO praticamente
// inaudível (30 Hz a 0,08% de volume): aí o botão aparece E o clique chega aqui (conferido
// clicando no botão de verdade, com o cursor do sistema).
//
// 🔴 Só fora do Safari. No iPad, tocar áudio TOMA O FOCO DE ÁUDIO do aparelho e cala a música de
// quem está estudando — o preço não vale o botão. Lá a janelinha é mostrador, e o play/pausa
// nativo do vídeo (que o Safari oferece) comanda o cronômetro pelos ouvintes de 'play'/'pause'.
let audio = null; // {ctx, osc} enquanto a janelinha está aberta

function ligarAudioInaudivel(stream) {
  if (audio) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctxA = new AC();
    const osc = ctxA.createOscillator();
    const gain = ctxA.createGain();
    gain.gain.value = 0.0008; // ~0,08% — inaudível, mas não zero (zero o navegador ignora)
    osc.frequency.value = 30; // abaixo da faixa útil de qualquer alto-falante
    const dest = ctxA.createMediaStreamDestination();
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    stream.addTrack(dest.stream.getAudioTracks()[0]);
    ctxA.resume().catch(() => {});
    audio = { ctx: ctxA, osc };
    return true;
  } catch (_) {
    return false;
  }
}

function desligarAudio() {
  if (!audio) return;
  try { audio.osc.stop(); } catch (_) {}
  try { audio.ctx.close(); } catch (_) {}
  audio = null;
}

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

// Encaixa o texto na largura útil: primeiro encolhendo a fonte até um mínimo legível, depois
// CORTANDO com reticências. Só encolher não bastava — o rótulo do tópico é uma frase inteira
// ("…laterais · Conceito e características · Princípios do direito contratu…") e vazava pelas
// duas bordas de uma janelinha de 320 px.
function encaixarTexto(texto, tamanhoIdeal, familia, largura, minimoPx) {
  let px = tamanhoIdeal;
  const cabe = (t) => ctx.measureText(t).width <= largura;
  const passo = Math.max(2, Math.round(tamanhoIdeal * 0.02)); // resolução alta pede passo maior
  for (; px >= minimoPx; px -= passo) {
    ctx.font = `${familia.peso} ${px}px ${familia.face}`;
    if (cabe(texto)) return texto;
  }
  ctx.font = `${familia.peso} ${minimoPx}px ${familia.face}`;
  if (cabe(texto)) return texto;
  let t = texto;
  while (t.length > 1 && !cabe(t + "…")) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

function desenhar() {
  if (!ctx || !lerEstado) return;
  let e;
  try { e = lerEstado(); } catch (_) { return; }
  // Tudo em fração da tela, e não em pixels fixos: assim a resolução pode subir (foi de 320x180
  // para 960x540 porque o relógio saía embaçado) sem que a faixa, as margens e os pisos de fonte
  // encolham junto.
  const faixaL = Math.round(L * 0.025);
  const margem = Math.round(L * 0.05);
  const util = L - margem * 2;
  const centro = L / 2 + faixaL / 2;
  ctx.fillStyle = CSS_VAR("--surface-1", "#0f172a");
  ctx.fillRect(0, 0, L, A);
  // Faixa da cor do foco à esquerda: identifica a sessão de relance, como o pill dentro do app.
  ctx.fillStyle = e.extra ? "#dc2626" : e.cor || "#2563eb";
  ctx.fillRect(0, 0, faixaL, A);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = CSS_VAR("--text-1", "#f8fafc");
  // Mono para o dígito não "dançar" a cada segundo.
  const MONO = { peso: 600, face: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace' };
  ctx.fillText(encaixarTexto(e.texto, Math.round(A * 0.4), MONO, util, Math.round(A * 0.13)), centro, A * 0.42);

  if (e.legenda) {
    ctx.fillStyle = CSS_VAR("--text-3", "#94a3b8");
    const SANS = { peso: 500, face: '"Inter Variable", Inter, system-ui, sans-serif' };
    ctx.fillText(encaixarTexto(e.legenda, Math.round(A * 0.12), SANS, util, Math.round(A * 0.07)), centro, A * 0.76);
  }
  ultimoTextoDesenhado = e.texto;
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

// Espera o vídeo ter quadro (readyState >= HAVE_CURRENT_DATA). Teto curto: se não vier, tenta
// assim mesmo e o erro sobe para a tela avisar, em vez de ficar preso aqui.
function comQuadro(ms = 1500) {
  if (!video || video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const pronto = () => { limpar(); resolve(); };
    const limpar = () => {
      clearTimeout(t);
      video.removeEventListener("loadeddata", pronto);
      video.removeEventListener("canplay", pronto);
    };
    const t = setTimeout(pronto, ms);
    video.addEventListener("loadeddata", pronto);
    video.addEventListener("canplay", pronto);
  });
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
    const aoSair = () => { pararDesenho(); desligarControlesDoSistema(); desligarAudio(); };
    video.addEventListener("leavepictureinpicture", aoSair);
    video.addEventListener("webkitpresentationmodechanged", () => { if (!pipAberto()) aoSair(); });
  }
  if (!video.srcObject) {
    if (typeof canvas.captureStream !== "function") throw new Error("este navegador não captura o canvas");
    let stream = canvas.captureStream(0); // 0 = só sai quadro quando pedimos (requestFrame)
    faixa = stream.getVideoTracks()[0] || null;
    // Navegador sem requestFrame precisa de captura contínua, senão o vídeo nunca recebe quadro.
    if (!(faixa && faixa.requestFrame)) { stream = canvas.captureStream(4); faixa = null; }
    // Fora do Safari, a faixa de áudio inaudível é o que faz os botões existirem (ver acima).
    if (!video.webkitSetPresentationMode && ligarAudioInaudivel(stream)) video.muted = false;
    video.srcObject = stream;
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
  const tocando = video.play();
  // A trava só pode cair QUANDO O NOSSO play terminar, não no fim deste bloco: no Safari o pedido
  // de PiP sai sem `await` (senão quebra a cadeia do gesto), então o `finally` rodava ANTES do
  // play resolver — o evento 'play' chegava com a trava já solta e LIGAVA O CRONÔMETRO sozinho.
  // Foi o defeito que o usuário viu no iPad ("ao clicar para flutuar, ele ativa").
  const soltarTrava = () => setTimeout(() => { ecoando = false; }, 80);
  if (tocando && tocando.then) tocando.then(soltarTrava, soltarTrava);
  else soltarTrava();

  try {
    // Os dois navegadores querem coisas OPOSTAS aqui, e atender só um quebra o outro:
    //  - Safari: o pedido tem de sair DENTRO do gesto do usuário, então nada de `await` antes
    //    (e `webkitSetPresentationMode` é síncrono, o que resolve).
    //  - Chromium: `requestPictureInPicture()` REJEITA enquanto o vídeo não tem quadro. Tentar
    //    sem esperar foi o que deixou a janelinha sem abrir, calada.
    if (video.webkitSetPresentationMode) video.webkitSetPresentationMode("picture-in-picture");
    else {
      await comQuadro();
      await video.requestPictureInPicture();
    }
  } catch (e) {
    marcarIndisponivel();
    await fecharPip();
    throw e;
  }

  // CONFERE em vez de confiar. O suporte anunciado não garante nada — no iPad o pedido "passa" e
  // a janelinha não abre. Não abriu, então este aparelho não faz PiP: desfaz tudo e anota, para o
  // botão não voltar a prometer o que não entrega.
  await new Promise((r) => setTimeout(r, 700));
  if (!pipAberto()) {
    marcarIndisponivel();
    await fecharPip();
    return false;
  }
  espelharNoPip(lerEstado().rodando);
  return true;
}

export async function fecharPip() {
  desligarControlesDoSistema();
  desligarAudio();
  try {
    if (video && video.webkitSetPresentationMode) video.webkitSetPresentationMode("inline");
    else if (document.pictureInPictureElement) await document.exitPictureInPicture();
  } catch (_) {}
  pararDesenho();
  try { if (video && !video.paused) { ecoando = true; video.pause(); setTimeout(() => { ecoando = false; }, 60); } } catch (_) {}
  return false;
}

// O cronômetro avisa quando ele mesmo mudou, para a janelinha espelhar o app (sem devolver ao app
// o comando que ele acabou de dar).
export function espelharNoPip(rodando) {
  if (!video || !pipAberto()) return;
  atualizarEstadoDoSistema(rodando); // teclas de mídia e centro de mídia do sistema
  // O ⏵/⏸ da janelinha segue o estado do VÍDEO, não o `playbackState` (medido: com o cronômetro
  // pausado o botão continuava ⏸, e um segundo clique repetia "pause" em vez de retomar). Então o
  // vídeo acompanha o relógio nos dois navegadores. Pausado, a imagem congela — e congelada no
  // tempo parado é exatamente o que se quer ver.
  ecoando = true;
  try {
    if (rodando && video.paused) video.play().catch(() => {});
    else if (!rodando && !video.paused) video.pause();
  } finally {
    setTimeout(() => { ecoando = false; }, 60);
  }
  // Com o vídeo pausado o canvas não é mais transmitido, então a imagem fica na do último quadro.
  // Se o valor mudar mesmo parado (zerar, trocar de modo, mudar o alvo), a janelinha mostraria um
  // número velho: aqui ela é destravada só o suficiente para receber o quadro novo.
  if (!rodando) reidratarQuadroCongelado();
}

let reidratando = false;
function reidratarQuadroCongelado() {
  if (reidratando || !video || !lerEstado) return;
  let texto;
  try { texto = lerEstado().texto; } catch (_) { return; }
  if (texto === ultimoTextoDesenhado) return;
  reidratando = true;
  ecoando = true;
  video
    .play()
    .then(() => new Promise((r) => setTimeout(r, 200)))
    .catch(() => {})
    .finally(() => {
      try { video.pause(); } catch (_) {}
      setTimeout(() => { ecoando = false; reidratando = false; }, 80);
    });
}
