// Utilitários puros (datas, ids, formatação).

let _idCounter = 0;
export function uid(prefix = "id") {
  _idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${_idCounter.toString(36)}`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Data LOCAL no formato yyyy-mm-dd (sem conversão para UTC — evita erro de fuso).
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function nowISO() {
  return new Date().toISOString();
}

export function addDays(isoDate, days) {
  const [y, m, dd] = isoDate.slice(0, 10).split("-").map(Number);
  const d = new Date(y, m - 1, dd);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Diferença em dias (b - a), datas ISO yyyy-mm-dd. Usa UTC só para o cálculo.
export function daysBetween(a, b) {
  const [ay, am, ad] = a.slice(0, 10).split("-").map(Number);
  const [by, bm, bd] = b.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Dia da semana de uma data ISO (convenção nativa do JS: 0=Dom, 1=Seg ... 6=Sáb).
export function weekdayISO(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

// Segunda-feira da semana que contém a data ISO (semana Seg→Dom).
export function inicioSemanaISO(iso) {
  const offset = (weekdayISO(iso) + 6) % 7; // dias desde a última segunda
  return addDays(iso, -offset);
}

// Rótulos dos dias da semana, alinhados à convenção getDay() (0=Dom ... 6=Sáb).
export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// REGRA CANÔNICA de tempo do app: < 60 min → "X min"; ≥ 60 min → "HhMM".
// (O cronômetro ao vivo usa fmtMMSS à parte.) Centralizado aqui para que TODAS as
// telas exibam o mesmo formato.
export function fmtMin(min) {
  min = Math.max(0, Math.round(min));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}min`;
}
// Segundos → mesma regra (arredonda para minutos).
export function fmtTempo(seg) {
  return fmtMin(Math.round((seg || 0) / 60));
}
// Alias mantido por compatibilidade (idêntico a fmtTempo).
export function fmtTempoCurto(seg) {
  return fmtTempo(seg);
}

export function fmtMMSS(seg) {
  seg = Math.max(0, Math.round(seg));
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function fmtData(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// Motivos de erro (Caderno de Erros + correção de questões). Centralizado aqui
// para que as duas telas nunca divirjam. Cada motivo mapeia uma ação corretiva:
// Não sabia→estudar · Esqueci→revisar · Interpretação→ler melhor · Distração→atenção.
export const MOTIVOS_ERRO = ["Não sabia", "Esqueci", "Interpretação", "Distração/Pegadinha"];

export function pct(num, den) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

// Escapa HTML para inserção segura em innerHTML.
export function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Normaliza um comentário/explicação da IA: aceita string (legado ou comentário manual)
// OU objeto { resumido, detalhado }. Devolve TEXTO PLANO (impressão, verso de flashcard,
// exportações). Para exibição rica com os dois modos, use explicacaoIAHTML (ui.js).
export function textoComentario(c) {
  if (!c) return "";
  if (typeof c === "string") return c;
  return c.detalhado || c.resumido || "";
}
