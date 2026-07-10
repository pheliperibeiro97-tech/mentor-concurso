// Captura de erros + relatório de diagnóstico. Objetivo: quando algo der errado (na
// instalação ou durante o uso), o usuário gera um ARQUIVO com as informações técnicas
// (versão, sistema, últimos erros, contagens — SEM o conteúdo de estudo) e nos envia por
// e-mail para análise. Nada é enviado automaticamente; é sempre o usuário quem exporta.
import { backendName } from "./persistence.js";

// Versão vem do package.json via `define` do Vite (vite.config.js) — fonte única, nunca
// mais desatualiza à mão. Fora do Vite (ex.: node --check) o global não existe → "dev".
export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
// E-mail de suporte ÚNICO do app (config.js e licenca.js importam daqui).
export const EMAIL_SUPORTE = "phelipe.ribeiro97@gmail.com";

const LS = "mentor_errlog_v1";
const MAX = 60;

function ler() {
  try {
    return JSON.parse(localStorage.getItem(LS)) || [];
  } catch (_) {
    return [];
  }
}
function gravar(arr) {
  try {
    localStorage.setItem(LS, JSON.stringify(arr.slice(-MAX)));
  } catch (_) {}
}

// Registra um erro no buffer (capado). origem: "error" | "promise" | "app".
export function registrarErro(origem, msg, stack) {
  const arr = ler();
  arr.push({
    t: new Date().toISOString(),
    origem,
    msg: String(msg == null ? "(sem mensagem)" : msg).slice(0, 600),
    stack: stack ? String(stack).slice(0, 1200) : "",
  });
  gravar(arr);
}

// Liga a captura global de erros não tratados (chamar uma vez no boot).
export function iniciarCapturaErros() {
  window.addEventListener("error", (e) => registrarErro("error", e.message, e.error && e.error.stack));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    registrarErro("promise", (r && r.message) || r, r && r.stack);
  });
}

// Monta o texto do relatório (JSON legível). Só metadados + erros; nunca o conteúdo.
export function montarRelatorio(store) {
  let cont = {};
  try {
    const st = store.get();
    cont = {
      disciplinas: (st.disciplinas || []).length,
      topicos: (st.topicos || []).length,
      materiais: (st.documentos || []).length,
      flashcards: (st.flashcards || []).length,
      questoes: (st.questoes || []).length,
      sessoes: (st.sessoes || []).length,
      tema: st.config && st.config.tema ? st.config.tema : "claro",
      iaProvedor: st.config ? st.config.iaProvider || "offline" : "offline",
      cargo: st.concurso ? st.concurso.cargo : "",
      banca: st.concurso ? st.concurso.banca : "",
    };
  } catch (_) {
    cont = { erro_ao_ler_estado: true };
  }
  const rel = {
    app: "Mentor Concurso",
    versao: APP_VERSION,
    gerado_em: new Date().toISOString(),
    armazenamento: (() => { try { return backendName(); } catch (_) { return "?"; } })(),
    navegador: navigator.userAgent,
    plataforma: navigator.platform,
    idioma: navigator.language,
    tela: `${window.screen ? window.screen.width : "?"}x${window.screen ? window.screen.height : "?"}`,
    resumo: cont,
    erros: ler(),
  };
  return JSON.stringify(rel, null, 2);
}

// Gera e BAIXA o arquivo de diagnóstico. Devolve o nome do arquivo.
export function baixarRelatorio(store) {
  const txt = montarRelatorio(store);
  const nome = `mentor-diagnostico-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([txt], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return nome;
}

// Limpa o histórico de erros (após enviar, se quiser).
export function limparErros() {
  try {
    localStorage.removeItem(LS);
  } catch (_) {}
}
