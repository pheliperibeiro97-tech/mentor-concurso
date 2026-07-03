// Cronômetro global e persistente. Vive FORA das telas (singleton montado no boot,
// como o chat), por dois motivos que a versão anterior — presa à tela "Hoje" — não
// resolvia:
//   1) Conta o tempo por CARIMBO (startedAt), não por "tique" de setInterval. Assim a
//      contagem é o tempo real decorrido, imune ao estrangulamento de aba em segundo
//      plano e à destruição/recriação do intervalo.
//   2) Um único intervalo global sobrevive à navegação. Ao sair de "Hoje" para
//      Flashcards/Questões/etc., o cronômetro CONTINUA e um mini-relógio flutuante
//      acompanha o usuário em qualquer tela.
//
// Modo REGRESSIVO: ao atingir o alvo, NÃO para — toca um sinal sonoro uma vez e segue
// contando o TEMPO EXTRA (overtime). Assim, definir 25 min e seguir +10 registra 35.
import { toast, confetti } from "./ui.js";
import { fmtMMSS } from "./util.js";
import { icone } from "./icones.js";

const LS_KEY = "mentor_crono_v1";

let app = null;
let widget = null;
let intervalId = null;
let naTelaHoje = false; // habilita o confete ao cruzar o alvo quando o usuário está na Home
let aoPedirRegistro = null; // callback: abre a janela de registro (injetado no boot)
const ouvintes = new Set();

// A tela/boot injeta como abrir a janela de registro de sessão (evita dependência circular
// com registro-sessao.js). Chamado ao clicar "Registrar" no flutuante/tela cheia.
export function setAoPedirRegistro(fn) {
  aoPedirRegistro = typeof fn === "function" ? fn : null;
}

// Estado persistido. `base` = segundos já acumulados antes do startedAt atual;
// `startedAt` = epoch(ms) do início do trecho em andamento (0 quando parado).
let s = {
  running: false,
  modo: "regressivo", // "regressivo" (conta para baixo) | "progressivo" (para cima)
  target: 25 * 60, // alvo em segundos (modo regressivo)
  base: 0,
  startedAt: 0,
  alvoAtingido: false, // já cruzou o alvo (toca o som 1x e segue no tempo extra)
  fase: null,
  topicoId: null,
  faseNome: "",
  topicoLabel: "",
  cor: "#2563eb",
  pausedAt: 0, // epoch(ms) em que pausou — alimenta o contador de pausa efêmero
  modoTela: "pill", // "pill" (flutuante pequeno e arrastável) | "focus" (tela cheia)
  pos: null, // posição do pill arrastado {x,y}; null = posição padrão (CSS)
};

function carregar() {
  try {
    const r = JSON.parse(localStorage.getItem(LS_KEY));
    if (r && typeof r === "object") s = { ...s, ...r };
  } catch (_) {}
  // Higieniza posição salva: descarta qualquer posição na FAIXA DO CABEÇALHO (topo),
  // que fazia o pill cobrir o H1/subtítulo de todas as telas (defeito visual nº1).
  // pos=null volta à âncora padrão (canto inferior, via CSS).
  if (s.pos && (typeof s.pos.y !== "number" || s.pos.y < 96)) s.pos = null;
  // Sobreviver a um reload acidental SEM contar o tempo de app fechado: retoma do último
  // checkpoint (`base`) começando a contar de agora. Perde-se, no máximo, um intervalo de
  // checkpoint (~10s), não as horas que o app possa ter ficado fechado.
  if (s.running) s.startedAt = Date.now();
  else if (s.base > 0) s.pausedAt = Date.now(); // o contador de pausa recomeça a cada reload
}
function salvar() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch (_) {}
}

// ===== Sinal sonoro (Web Audio API — sem arquivo/asset) =====
let audioCtx = null;
function garantirAudio() {
  // Cria/retoma o contexto a partir de um gesto do usuário (iniciar), para que o
  // navegador permita tocar o som depois, a partir do tique.
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (_) {}
}
// Estilo do alarme de fim (configurável): "curto" (1 toque), "longo" (3 toques, padrão)
// ou "insistente" (6 toques). Definido pelo app a partir das Configurações.
let estiloAlarme = "longo";
export function setEstiloAlarme(e) {
  estiloAlarme = ["curto", "longo", "insistente"].includes(e) ? e : "longo";
}
// Toca o alarme uma vez (botão "Testar" das Configurações).
export function tocarAlarmeTeste() {
  garantirAudio();
  tocarAlarme();
}

function tocarAlarme() {
  try {
    garantirAudio();
    if (!audioCtx) return;
    const reps = estiloAlarme === "curto" ? 1 : estiloAlarme === "insistente" ? 6 : 3;
    // Motivo ascendente agradável (sino), repetido conforme o estilo.
    const motivo = [[880, 0], [1175, 0.16], [987, 0.32], [1318, 0.48]];
    const espaco = 1.15; // segundos entre repetições
    const t0 = audioCtx.currentTime;
    for (let r = 0; r < reps; r++) {
      const base = t0 + r * espaco;
      motivo.forEach(([freq, dt]) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = base + dt;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.24, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.connect(g).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
      });
    }
  } catch (_) {}
}

// ===== Tempo (sempre derivado de carimbos) =====
export function elapsedSeg() {
  return s.base + (s.running ? (Date.now() - s.startedAt) / 1000 : 0);
}
// Está em tempo extra? (regressivo que já passou do alvo)
export function emOvertime() {
  return s.modo === "regressivo" && elapsedSeg() >= s.target;
}
// Valor a MOSTRAR conforme o modo (regressivo conta para baixo; após o alvo, conta o extra).
export function displaySeg() {
  const el = elapsedSeg();
  if (s.modo === "progressivo") return el;
  return el >= s.target ? el - s.target : s.target - el;
}
export function snapshot() {
  const el = elapsedSeg();
  return {
    running: s.running,
    modo: s.modo,
    target: s.target,
    elapsed: el,
    restante: Math.max(0, s.target - el),
    display: displaySeg(),
    overtime: emOvertime(),
    alvoAtingido: s.alvoAtingido,
    fase: s.fase,
    topicoId: s.topicoId,
    faseNome: s.faseNome,
    topicoLabel: s.topicoLabel,
    cor: s.cor,
    pausadoSeg: !s.running && s.base > 0 ? Math.max(0, (Date.now() - (s.pausedAt || Date.now())) / 1000) : 0,
  };
}

// ===== Notificação aos displays (mini-relógio + assinantes da tela Hoje) =====
function notificarDisplays() {
  atualizarWidget();
  const snap = snapshot();
  ouvintes.forEach((fn) => {
    try {
      fn(snap);
    } catch (_) {}
  });
}
function emitir() {
  // Mudança de estado: notifica e PERSISTE (o tique normal não persiste a cada segundo).
  notificarDisplays();
  salvar();
}
// Assina atualizações por segundo (a tela "Hoje" usa para refrescar o display grande).
export function onTick(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

// ===== Operações =====
export function iniciar() {
  if (s.running) return;
  garantirAudio(); // gesto do usuário: libera o som do alarme depois
  s.running = true;
  s.startedAt = Date.now();
  s.pausedAt = 0; // saiu da pausa
  emitir();
}
export function pausar() {
  if (!s.running) return;
  s.base = elapsedSeg(); // congela o acumulado
  s.running = false;
  s.startedAt = 0;
  s.pausedAt = Date.now(); // começa a contar o tempo em pausa
  emitir();
}
export function toggle() {
  s.running ? pausar() : iniciar();
}
export function zerar() {
  s.running = false;
  s.startedAt = 0;
  s.base = 0;
  s.pausedAt = 0;
  s.alvoAtingido = false;
  emitir();
}
export function setModo(modo) {
  if (modo === s.modo) return;
  s.running = false;
  s.startedAt = 0;
  s.base = 0;
  s.alvoAtingido = false;
  s.modo = modo;
  emitir();
}
export function setTarget(seg) {
  s.running = false;
  s.startedAt = 0;
  s.base = 0;
  s.alvoAtingido = false;
  s.target = Math.max(1, Math.round(seg));
  emitir();
}
// Define o alvo só quando o cronômetro está ocioso (não atrapalha uma sessão em curso).
export function setTargetIfIdle(seg) {
  if (s.running || s.base > 0) return;
  if (s.target === Math.round(seg)) return;
  s.target = Math.max(1, Math.round(seg));
  emitir();
}
// Vínculo (fase/tópico) — para o registro e para o rótulo do mini-relógio.
export function vincular({ fase, topicoId, faseNome, topicoLabel, cor }) {
  s.fase = fase ?? s.fase;
  s.topicoId = topicoId ?? null;
  s.faseNome = faseNome ?? s.faseNome;
  s.topicoLabel = topicoLabel ?? "";
  if (cor) s.cor = cor;
  salvar();
  atualizarWidget();
}

// ===== Relógio flutuante: "pill" arrastável (padrão) + modo "foco" (tela cheia) =====
function ativo() {
  return s.running || s.base > 0;
}
function montarWidget() {
  if (document.getElementById("crono-fab")) return;
  widget = document.createElement("div");
  widget.id = "crono-fab";
  widget.className = "crono-fab crono-pill oculto";
  widget.innerHTML = `
    <button class="crono-btn crono-toggle" title="Iniciar / pausar" aria-label="Iniciar ou pausar">${icone("play")}</button>
    <div class="crono-corpo">
      <div class="crono-time">00:00</div>
      <div class="crono-sub"></div>
      <div class="crono-config">
        <div class="crono-modo">
          <button class="chip crono-modo-btn" data-modo="regressivo" title="Conta para baixo, a partir do bloco definido.">Regressivo</button>
          <button class="chip crono-modo-btn" data-modo="progressivo" title="Conta para cima, até você interromper.">Progressivo</button>
        </div>
        <label class="crono-alvo">Bloco <input class="crono-min" type="number" min="1" max="300" value="25" /> min</label>
      </div>
    </div>
    <div class="crono-acoes">
      <button class="crono-btn crono-registrar" title="Registrar esta sessão" aria-label="Registrar sessão">${icone("check-check")} <span class="crono-registrar-t">Registrar</span></button>
      <button class="crono-btn crono-mini crono-expandir" title="Ampliar (modo foco)" aria-label="Ampliar">${icone("maximize-2")}</button>
      <button class="crono-btn crono-mini crono-reduzir" title="Voltar ao tamanho normal" aria-label="Reduzir">${icone("minimize-2")}</button>
      <button class="crono-btn crono-mini crono-hoje" title="Abrir a tela Hoje" aria-label="Abrir Hoje">${icone("external-link")}</button>
    </div>`;
  document.body.appendChild(widget);
  widget.querySelector(".crono-toggle").addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
  widget.querySelector(".crono-expandir").addEventListener("click", (e) => { e.stopPropagation(); setModoTela("focus"); });
  widget.querySelector(".crono-reduzir").addEventListener("click", (e) => { e.stopPropagation(); setModoTela("pill"); });
  widget.querySelector(".crono-hoje").addEventListener("click", (e) => { e.stopPropagation(); if (app) app.navigate("hoje"); });
  widget.querySelector(".crono-registrar").addEventListener("click", (e) => {
    e.stopPropagation();
    if (aoPedirRegistro) aoPedirRegistro();
    else if (app) app.navigate("hoje");
  });
  // Config (só faz sentido no modo foco/tela cheia): trocar modo e ajustar o bloco.
  widget.querySelectorAll(".crono-modo-btn").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const novo = b.getAttribute("data-modo");
      if (novo === s.modo) return;
      setModo(novo);
      if (novo === "regressivo") {
        const alvoMin = app && app.store ? app.store.get().config.pomodoroFoco || 25 : 25;
        setTargetIfIdle(alvoMin * 60);
      }
    })
  );
  const minEl = widget.querySelector(".crono-min");
  if (minEl) {
    minEl.addEventListener("click", (e) => e.stopPropagation());
    minEl.addEventListener("change", () => {
      const min = Math.max(1, parseInt(minEl.value, 10) || 25);
      setTarget(min * 60);
      if (app && app.store) app.store.setConfig({ pomodoroFoco: min });
    });
  }
  // clique no corpo: no pill abre o Hoje (atalho); no foco, não navega.
  widget.querySelector(".crono-corpo").addEventListener("click", () => {
    if (s.modoTela !== "focus" && app) app.navigate("hoje");
  });
  ligarArrasto(widget);
  aplicarPos();
}

// Alterna entre o flutuante pequeno (pill) e a tela cheia (foco).
export function setModoTela(modo) {
  s.modoTela = modo === "focus" ? "focus" : "pill";
  salvar();
  aplicarPos();
  atualizarWidget();
}

// Aplica a posição salva do pill (e respeita os limites da janela). No foco, posição é fixa via CSS.
function aplicarPos() {
  if (!widget) return;
  if (s.modoTela === "focus" || !s.pos) {
    widget.style.left = widget.style.top = widget.style.right = widget.style.bottom = "";
    return;
  }
  const w = widget.offsetWidth || 220;
  const h = widget.offsetHeight || 60;
  const x = Math.min(Math.max(8, s.pos.x), window.innerWidth - w - 8);
  // Piso de 96px: o pill nunca cobre o cabeçalho/H1 da tela (defeito visual nº1),
  // mesmo com uma posição antiga salva perto do topo.
  const y = Math.min(Math.max(96, s.pos.y), window.innerHeight - h - 8);
  widget.style.left = x + "px";
  widget.style.top = y + "px";
  widget.style.right = "auto";
  widget.style.bottom = "auto";
}

// Arrasto do pill (ignora botões e o modo foco).
function ligarArrasto(el) {
  let arrastando = false, dx = 0, dy = 0, moveu = false;
  const onDown = (e) => {
    if (s.modoTela === "focus" || e.target.closest(".crono-btn")) return;
    arrastando = true;
    moveu = false;
    const r = el.getBoundingClientRect();
    dx = e.clientX - r.left;
    dy = e.clientY - r.top;
    el.classList.add("arrastando");
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const onMove = (e) => {
    if (!arrastando) return;
    moveu = true;
    s.pos = { x: e.clientX - dx, y: e.clientY - dy };
    aplicarPos();
  };
  const onUp = () => {
    if (!arrastando) return;
    arrastando = false;
    el.classList.remove("arrastando");
    if (moveu) salvar(); // só persiste se de fato moveu
  };
  el.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  // impede que um arrasto termine "abrindo o Hoje" sem querer
  el.querySelector(".crono-corpo").addEventListener("click", (e) => {
    if (moveu) { e.stopImmediatePropagation(); moveu = false; }
  }, true);
}

function atualizarWidget() {
  if (!widget) return;
  // O flutuante acompanha o usuário em QUALQUER tela (a Home não tem mais relógio inline).
  // A tela cheia (foco) também aparece quando OCIOSA — para configurar o tempo e dar play
  // (aberta pelo ícone de cronômetro no card de foco).
  const visivel = ativo() || s.modoTela === "focus";
  widget.classList.toggle("oculto", !visivel);
  if (!visivel) return;
  // Config (visível só no modo foco via CSS): reflete o modo atual e o bloco alvo.
  widget.querySelectorAll(".crono-modo-btn").forEach((b) => b.classList.toggle("on", b.getAttribute("data-modo") === s.modo));
  const minEl = widget.querySelector(".crono-min");
  if (minEl && document.activeElement !== minEl) minEl.value = Math.round(s.target / 60);
  const alvoEl = widget.querySelector(".crono-alvo");
  if (alvoEl) alvoEl.style.display = s.modo === "regressivo" ? "" : "none";
  const over = emOvertime();
  const pausadoSeg = !s.running && s.base > 0 ? Math.max(0, (Date.now() - (s.pausedAt || Date.now())) / 1000) : 0;
  widget.style.setProperty("--crono-cor", s.cor || "#2563eb");
  widget.classList.toggle("crono-focus", s.modoTela === "focus");
  widget.classList.toggle("crono-pill", s.modoTela !== "focus");
  widget.classList.toggle("rodando", s.running);
  widget.classList.toggle("extra", over);
  widget.classList.toggle("pausado", pausadoSeg > 0);
  widget.querySelector(".crono-time").textContent = (over ? "+" : "") + fmtMMSS(displaySeg());
  widget.querySelector(".crono-toggle").innerHTML = s.running ? icone("pause") : icone("play");
  const sub = widget.querySelector(".crono-sub");
  if (pausadoSeg > 0) {
    sub.innerHTML = `<span class="crono-pausa">${icone("pause")} Em pausa ${fmtMMSS(pausadoSeg)}</span>`;
  } else {
    const partes = [];
    if (s.faseNome) partes.push(s.faseNome);
    if (s.topicoLabel) partes.push(s.topicoLabel);
    sub.textContent = over ? "Tempo extra" : partes.join(" · ") || "Em foco";
  }
  if (s.modoTela === "pill") aplicarPos();
}
// A tela "Hoje" avisa quando está visível para evitar dois relógios na tela.
export function setTelaHoje(v) {
  naTelaHoje = !!v;
  // Ao SAIR da Home com o foco aberto mas OCIOSO (usuário abriu o cronômetro e não iniciou),
  // colapsa para pill — evita a tela cheia "presa" cobrindo as outras telas.
  if (!v && !ativo() && s.modoTela === "focus") {
    s.modoTela = "pill";
    salvar();
  }
  atualizarWidget();
}

// ===== Tique global (um só, vive enquanto o app estiver aberto) =====
let ticksDesdeCheckpoint = 0;
function checkpoint() {
  // Consolida o tempo corrido em `base` sem alterar o total, e persiste. Serve de âncora
  // caso o app seja recarregado (ver carregar()).
  s.base = elapsedSeg();
  s.startedAt = Date.now();
  salvar();
}
function tick() {
  if (!s.running) {
    // pausado com tempo acumulado: atualiza o contador de pausa efêmero (1x/s)
    if (s.base > 0) notificarDisplays();
    return;
  }
  // Ao cruzar o alvo (regressivo): sinaliza UMA vez (som + aviso) e SEGUE contando o extra.
  if (s.modo === "regressivo" && !s.alvoAtingido && elapsedSeg() >= s.target) {
    s.alvoAtingido = true;
    salvar();
    tocarAlarme();
    if (naTelaHoje) confetti(); // marco: bloco de foco concluído (só se o cronômetro grande está à vista)
    toast(`Tempo do bloco (${Math.round(s.target / 60)} min) atingido. Seguindo no tempo extra; pause quando terminar.`);
  }
  if (++ticksDesdeCheckpoint >= 10) {
    ticksDesdeCheckpoint = 0;
    checkpoint();
  }
  notificarDisplays(); // só atualiza displays; não persiste a cada segundo
}

// ===== Sincronia entre janelas (principal ↔ janela flutuante) via localStorage =====
// Quando uma janela altera o cronômetro, a outra recebe o evento "storage" e adota o
// estado. O tempo é por carimbo (startedAt), então o relógio é compartilhado.
let storageLigado = false;
function ligarSincroniaStorage() {
  if (storageLigado || typeof window === "undefined") return;
  storageLigado = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== LS_KEY || !e.newValue) return;
    try {
      const r = JSON.parse(e.newValue);
      if (r && typeof r === "object") {
        s = { ...s, ...r };
        notificarDisplays();
      }
    } catch (_) {}
  });
}

// Monta a VIEW da janela flutuante (carregada com ?crono=1). Só o relógio + controles.
export function montarCronoMini() {
  carregar();
  ligarSincroniaStorage();
  document.body.classList.add("crono-mini-body");
  const el = document.createElement("div");
  el.className = "crono-mini-win";
  el.innerHTML = `
    <div class="cmw-linha" data-tauri-drag-region>
      <button class="cmw-btn cmw-toggle" title="Iniciar / pausar">${icone("play")}</button>
      <div class="cmw-time" data-tauri-drag-region>00:00</div>
      <button class="cmw-btn cmw-x" title="Fechar a janela flutuante">${icone("x")}</button>
    </div>
    <div class="cmw-sub" data-tauri-drag-region></div>`;
  document.body.appendChild(el);
  el.querySelector(".cmw-toggle").addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
  el.querySelector(".cmw-x").addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      await getCurrentWebviewWindow().close();
    } catch (_) {}
  });
  const pintar = () => {
    const over = emOvertime();
    const pausadoSeg = !s.running && s.base > 0 ? Math.max(0, (Date.now() - (s.pausedAt || Date.now())) / 1000) : 0;
    el.style.setProperty("--crono-cor", s.cor || "#2563eb");
    el.classList.toggle("rodando", s.running);
    el.classList.toggle("extra", over);
    el.classList.toggle("pausado", pausadoSeg > 0);
    el.querySelector(".cmw-time").textContent = (over ? "+" : "") + fmtMMSS(displaySeg());
    el.querySelector(".cmw-toggle").innerHTML = s.running ? icone("pause") : icone("play");
    const sub = el.querySelector(".cmw-sub");
    if (pausadoSeg > 0) {
      sub.innerHTML = `<span class="crono-pausa">${icone("pause")} Em pausa ${fmtMMSS(pausadoSeg)}</span>`;
    } else {
      const p = [];
      if (s.faseNome) p.push(s.faseNome);
      if (s.topicoLabel) p.push(s.topicoLabel);
      sub.textContent = over ? "Tempo extra" : p.join(" · ") || "Em foco";
    }
  };
  pintar();
  ouvintes.add(pintar); // atualiza em mudanças de estado/storage
  setInterval(pintar, 1000); // exibição por segundo (o checkpoint fica na janela principal)
}

export function montarCronometro(application) {
  app = application;
  carregar();
  ligarSincroniaStorage();
  montarWidget();
  if (!intervalId) intervalId = setInterval(tick, 1000);
  atualizarWidget();
}
