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
  // Rótulos ao usuário: "progressivo" = Cronômetro (conta p/ cima); "regressivo" = Timer
  // (conta p/ baixo). Chaves internas mantidas por compatibilidade. + "pomodoro".
  modo: "regressivo",
  target: 25 * 60, // alvo em segundos (Timer e cada fase do Pomodoro)
  base: 0,
  startedAt: 0,
  alvoAtingido: false, // já cruzou o alvo (toca o som 1x e segue no tempo extra)
  // Pomodoro (ciclos estudo/pausa). Durações vêm da config (configuráveis pelo usuário).
  pomoFase: "estudo", // "estudo" | "curta" | "longa"
  pomoSessao: 1, // sessão de estudo atual dentro do ciclo
  pomoEstudoAcum: 0, // segundos de ESTUDO acumulados no ciclo (para sugerir no registro)
  fase: null,
  topicoId: null,
  faseNome: "",
  topicoLabel: "",
  cor: "#2563eb",
  pausedAt: 0, // epoch(ms) em que pausou — alimenta o contador de pausa efêmero
  modoTela: "pill", // "pill" (flutuante pequeno e arrastável) | "focus" (tela cheia)
  pos: null, // posição do pill arrastado {x,y}; null = posição padrão (CSS)
  pillOculto: false, // pill dispensado pelo usuário (o chip da topbar cobre a glanceabilidade)
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
// Está em tempo extra? (Timer que já passou do alvo; Pomodoro nunca — ele avança de fase)
export function emOvertime() {
  return (s.modo === "regressivo" || s.modo === "pomodoro") && elapsedSeg() >= s.target;
}
// Valor a MOSTRAR conforme o modo. Timer/Pomodoro contam para baixo; ao passar do alvo
// (Pomodoro sem avanço automático), viram contagem do tempo EXTRA (para cima).
export function displaySeg() {
  const el = elapsedSeg();
  if (s.modo === "progressivo") return el;
  return el >= s.target ? el - s.target : s.target - el;
}

// ===== Pomodoro: durações (da config, configuráveis) + transição de fase =====
function pomoCfg() {
  const c = app && app.store ? app.store.get().config || {} : {};
  return {
    estudo: (c.pomoEstudo || c.pomodoroFoco || 25) * 60,
    curta: (c.pomoCurta || 5) * 60,
    longa: (c.pomoLonga || 15) * 60,
    sessoes: c.pomoSessoes || 4,
    autoAvanca: !!c.pomoAutoAvanca, // padrão: NÃO avança sozinho (o tempo extra conta como estudo)
  };
}
export function pomoDurFase(fase) {
  const p = pomoCfg();
  return fase === "estudo" ? p.estudo : fase === "curta" ? p.curta : p.longa;
}
export function pomoSessoesTotal() {
  return pomoCfg().sessoes;
}
export const POMO_ROTULO = { estudo: "Estudo", curta: "Pausa curta", longa: "Pausa longa" };
// Avança para a próxima fase do ciclo. `natural` = terminou o tempo (acumula o alvo cheio);
// senão (pular) acumula só o tempo decorrido da fase de estudo.
function avancarPomo(natural) {
  if (s.pomoFase === "estudo") {
    // Conta o tempo REAL estudado nesta fase (inclui o extra além do alvo).
    s.pomoEstudoAcum = (s.pomoEstudoAcum || 0) + Math.max(0, Math.round(elapsedSeg()));
  }
  let prox;
  if (s.pomoFase === "estudo") prox = s.pomoSessao >= pomoSessoesTotal() ? "longa" : "curta";
  else if (s.pomoFase === "curta") { prox = "estudo"; s.pomoSessao += 1; }
  else { prox = "estudo"; s.pomoSessao = 1; s.pomoEstudoAcum = 0; } // fim do ciclo → recomeça
  s.pomoFase = prox;
  s.target = pomoDurFase(prox);
  s.base = 0;
  s.startedAt = s.running ? Date.now() : 0;
  s.alvoAtingido = false;
}
// Pular a fase atual (botão ⏭ do Pomodoro): vai direto para a próxima.
export function pularFase() {
  if (s.modo !== "pomodoro") return;
  avancarPomo(false);
  emitir();
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
    // Pomodoro
    pomoFase: s.pomoFase,
    pomoSessao: s.pomoSessao,
    pomoSessoes: s.modo === "pomodoro" ? pomoSessoesTotal() : 0,
    pomoEstudoSeg: (s.pomoEstudoAcum || 0) + (s.modo === "pomodoro" && s.pomoFase === "estudo" ? el : 0),
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
  // Pomodoro: zerar reinicia o ciclo (fase estudo, sessão 1, acumulado 0) — evita
  // duplicar o tempo de estudo no próximo registro (registrar chama zerar).
  if (s.modo === "pomodoro") {
    s.pomoFase = "estudo";
    s.pomoSessao = 1;
    s.pomoEstudoAcum = 0;
    s.target = pomoDurFase("estudo");
  }
  emitir();
}
export function setModo(modo) {
  if (modo === s.modo) return;
  s.running = false;
  s.startedAt = 0;
  s.base = 0;
  s.alvoAtingido = false;
  s.modo = modo;
  if (modo === "pomodoro") {
    // Começa um ciclo novo na fase de estudo.
    s.pomoFase = "estudo";
    s.pomoSessao = 1;
    s.pomoEstudoAcum = 0;
    s.target = pomoDurFase("estudo");
  }
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
let popAberto = false;
function montarWidget() {
  if (document.getElementById("crono-fab")) return;
  widget = document.createElement("div");
  widget.id = "crono-fab";
  widget.className = "cf";
  widget.innerHTML = `
    <div class="cf-pop" hidden role="dialog" aria-label="Cronômetro">
      <div class="cf-topbar">
        <div class="cf-modos">
          <button class="cf-modo" data-modo="progressivo" title="Conta para cima, até você interromper.">Cronômetro</button>
          <button class="cf-modo" data-modo="regressivo" title="Conta para baixo, a partir do tempo definido.">Timer</button>
          <button class="cf-modo" data-modo="pomodoro" title="Ciclos de estudo e pausa.">Pomodoro</button>
        </div>
        <button class="cf-x" data-cf-fechar aria-label="Fechar">${icone("x")}</button>
      </div>
      <div class="cf-disp"><div class="cf-big">00:00</div><div class="cf-cap"></div></div>
      <div class="cf-timer">
        <div class="cf-presets">
          <button class="cf-preset" data-min="10">10</button>
          <button class="cf-preset" data-min="25">25</button>
          <button class="cf-preset" data-min="50">50</button>
          <label class="cf-livre">livre <input class="cf-min" type="number" min="1" max="300" /> min</label>
        </div>
      </div>
      <div class="cf-pomo">
        <div class="cf-pomo-fases">
          <span class="cf-fase" data-fase="estudo">Estudo</span>
          <span class="cf-fase" data-fase="curta">Pausa curta</span>
          <span class="cf-fase" data-fase="longa">Pausa longa</span>
        </div>
        <div class="cf-pomo-sess"></div>
        <details class="cf-pomo-cfg">
          <summary>${icone("settings")} Durações (min)</summary>
          <div class="cf-pomo-grid">
            <label>Estudo <input data-cfg="pomoEstudo" type="number" min="1" max="120" /></label>
            <label>Pausa curta <input data-cfg="pomoCurta" type="number" min="1" max="60" /></label>
            <label>Pausa longa <input data-cfg="pomoLonga" type="number" min="1" max="60" /></label>
            <label>Sessões <input data-cfg="pomoSessoes" type="number" min="1" max="12" /></label>
          </div>
          <label class="cf-pomo-auto" title="Ligado: entra na pausa sozinho ao bater o tempo. Desligado: toca o alarme mas segue contando o tempo extra (que conta como estudo) até você tocar em ⏭."><input data-cfg="pomoAutoAvanca" type="checkbox" /> Avançar de fase sozinho</label>
        </details>
      </div>
      <div class="cf-ctrl">
        <button class="cf-play" data-cf-toggle aria-label="Iniciar ou pausar">${icone("play")}</button>
        <button class="cf-sec" data-cf-zerar title="Zerar" aria-label="Zerar">${icone("rotate-ccw")}</button>
        <button class="cf-sec cf-skip" data-cf-pular title="Pular fase" aria-label="Pular fase">${icone("skip-forward")}</button>
        <button class="cf-reg" data-cf-registrar>Registrar sessão</button>
      </div>
    </div>
    <button class="cf-btn" data-cf-abrir aria-label="Abrir o cronômetro">${icone("clock-3")}<span class="cf-btn-t">Cronômetro</span></button>`;
  document.body.appendChild(widget);

  const on = (sel, ev, fn) => widget.querySelector(sel)?.addEventListener(ev, fn);
  on(".cf-btn", "click", (e) => { e.stopPropagation(); setPopAberto(!popAberto); });
  on("[data-cf-fechar]", "click", () => setPopAberto(false));
  on("[data-cf-toggle]", "click", toggle);
  on("[data-cf-zerar]", "click", zerar);
  on("[data-cf-pular]", "click", pularFase);
  on("[data-cf-registrar]", "click", () => { if (aoPedirRegistro) aoPedirRegistro(); else if (app) app.navigate("hoje"); });
  widget.querySelectorAll(".cf-modo").forEach((b) =>
    b.addEventListener("click", () => {
      const novo = b.getAttribute("data-modo");
      if (novo === s.modo) return;
      setModo(novo);
      if (novo === "regressivo") {
        const alvoMin = app && app.store ? app.store.get().config.pomodoroFoco || 25 : 25;
        setTargetIfIdle(alvoMin * 60);
      }
    })
  );
  widget.querySelectorAll(".cf-preset").forEach((b) =>
    b.addEventListener("click", () => setTarget((parseInt(b.dataset.min, 10) || 25) * 60))
  );
  const minEl = widget.querySelector(".cf-min");
  if (minEl) minEl.addEventListener("change", () => {
    const min = Math.max(1, parseInt(minEl.value, 10) || 25);
    setTarget(min * 60);
    if (app && app.store) app.store.setConfig({ pomodoroFoco: min });
  });
  widget.querySelectorAll("[data-cfg]").forEach((inp) =>
    inp.addEventListener("change", () => {
      const key = inp.getAttribute("data-cfg");
      const v = inp.type === "checkbox" ? inp.checked : Math.max(1, parseInt(inp.value, 10) || 1);
      if (app && app.store) app.store.setConfig({ [key]: v });
      if (s.modo === "pomodoro" && !ativo()) { s.target = pomoDurFase(s.pomoFase); emitir(); }
      else atualizarWidget();
    })
  );
  // Fecha ao clicar fora / Esc. Usa POINTERDOWN (não click): assim, ao abrir o popover por
  // um botão externo (ex.: "Cronômetro" do Hoje), o clique que dispara a abertura não é
  // interpretado como "clique fora" — no pointerdown desse gatilho, popAberto ainda é false.
  document.addEventListener("pointerdown", (e) => { if (popAberto && !widget.contains(e.target)) setPopAberto(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && popAberto) setPopAberto(false); });
}

function setPopAberto(v) {
  popAberto = !!v;
  const pop = widget && widget.querySelector(".cf-pop");
  if (pop) pop.hidden = !popAberto;
  if (widget) widget.classList.toggle("cf-open", popAberto);
  if (popAberto) atualizarWidget();
}

// Retrocompat: entradas antigas ("Começar agora"/"Cronômetro" do Hoje) abrem o popover.
export function setModoTela(modo) {
  setPopAberto(modo === "focus");
}

function atualizarWidget() {
  if (!widget) return;
  const over = emOvertime();
  const pausadoSeg = !s.running && s.base > 0 ? Math.max(0, (Date.now() - (s.pausedAt || Date.now())) / 1000) : 0;
  widget.style.setProperty("--crono-cor", s.cor || "#2563eb");
  widget.classList.toggle("rodando", s.running);
  widget.classList.toggle("ativo", ativo());
  widget.classList.toggle("extra", over);
  widget.classList.toggle("pausado", pausadoSeg > 0);
  // Botão FAB: tempo ao vivo quando ativo; "Cronômetro" quando ocioso.
  const btnT = widget.querySelector(".cf-btn-t");
  if (btnT) btnT.textContent = ativo() ? (over ? "+" : "") + fmtMMSS(displaySeg()) : "Cronômetro";
  if (!popAberto) return; // só atualiza o miolo do popover quando aberto
  widget.querySelectorAll(".cf-modo").forEach((b) => b.classList.toggle("on", b.getAttribute("data-modo") === s.modo));
  const showTimer = s.modo === "regressivo", showPomo = s.modo === "pomodoro";
  widget.querySelector(".cf-timer").style.display = showTimer ? "" : "none";
  widget.querySelector(".cf-pomo").style.display = showPomo ? "" : "none";
  widget.querySelector(".cf-skip").style.display = showPomo ? "" : "none";
  const big = widget.querySelector(".cf-big");
  if (big) big.textContent = (over ? "+" : "") + fmtMMSS(displaySeg());
  const cap = widget.querySelector(".cf-cap");
  if (cap) {
    if (pausadoSeg > 0) cap.textContent = `Em pausa ${fmtMMSS(pausadoSeg)}`;
    else if (showPomo) cap.textContent = `${POMO_ROTULO[s.pomoFase]} · sessão ${s.pomoSessao} de ${pomoSessoesTotal()}`;
    else if (over) cap.textContent = "Tempo extra — pause quando terminar";
    else if (s.modo === "progressivo") cap.textContent = "Contando o tempo de estudo";
    else cap.textContent = "Conta regressiva do bloco";
  }
  widget.querySelectorAll(".cf-preset").forEach((b) => b.classList.toggle("on", (parseInt(b.dataset.min, 10) || 0) * 60 === s.target));
  const minEl = widget.querySelector(".cf-min");
  if (minEl && document.activeElement !== minEl) minEl.value = Math.round(s.target / 60);
  widget.querySelectorAll(".cf-fase").forEach((b) => {
    const f = b.getAttribute("data-fase");
    b.classList.toggle("on", showPomo && f === s.pomoFase);
    b.classList.toggle("pausa", f !== "estudo");
  });
  const sess = widget.querySelector(".cf-pomo-sess");
  if (sess) sess.textContent = `Sessão ${s.pomoSessao} de ${pomoSessoesTotal()}`;
  const cfg = pomoCfg();
  const setInp = (key, val) => { const i = widget.querySelector(`[data-cfg="${key}"]`); if (i && document.activeElement !== i) i.value = val; };
  setInp("pomoEstudo", Math.round(cfg.estudo / 60));
  setInp("pomoCurta", Math.round(cfg.curta / 60));
  setInp("pomoLonga", Math.round(cfg.longa / 60));
  setInp("pomoSessoes", cfg.sessoes);
  const chkAuto = widget.querySelector('[data-cfg="pomoAutoAvanca"]');
  if (chkAuto && document.activeElement !== chkAuto) chkAuto.checked = cfg.autoAvanca;
  widget.querySelector("[data-cf-toggle]").innerHTML = s.running ? icone("pause") : icone("play");
  const temTempo = s.running || s.base > 0;
  widget.querySelector("[data-cf-zerar]").style.display = temTempo ? "" : "none";
  widget.querySelector("[data-cf-registrar]").style.display = temTempo ? "" : "none";
}
// A tela "Hoje" avisa quando está visível (habilita o confete ao cruzar o alvo).
export function setTelaHoje(v) {
  naTelaHoje = !!v;
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
  // Pomodoro: ao terminar a fase, toca o alarme UMA vez. Se "avançar sozinho" estiver
  // ligado, passa para a próxima fase; senão SEGUE contando o tempo extra (que conta como
  // estudo) até o usuário tocar em ⏭.
  if (s.modo === "pomodoro" && !s.alvoAtingido && elapsedSeg() >= s.target) {
    s.alvoAtingido = true;
    salvar();
    tocarAlarme();
    if (naTelaHoje && s.pomoFase === "estudo") confetti();
    if (pomoCfg().autoAvanca) {
      const antes = POMO_ROTULO[s.pomoFase];
      avancarPomo(true);
      toast(`${antes} concluído. Agora: ${POMO_ROTULO[s.pomoFase]}${s.pomoFase === "estudo" ? ` · sessão ${s.pomoSessao}` : ""}.`);
    } else {
      toast(`${POMO_ROTULO[s.pomoFase]} (${Math.round(s.target / 60)} min) concluído — seguindo no tempo extra. Toque em ⏭ para a próxima fase.`);
    }
    emitir();
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
