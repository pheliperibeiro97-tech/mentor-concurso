// Tela do GUIA do sistema (manual de uso). Renderiza as seções definidas em guia.js
// (que também são pesquisáveis pelo Assistente/chat). Seções recolhíveis (<details>)
// + campo de filtro por texto (título e conteúdo, sem diferenciar acento/maiúscula).
import { bindActions, header, abrirJanela } from "../ui.js";
import { icone } from "../icones.js";
import { GUIA } from "../guia.js";

// Texto de introdução comum à tela e à janela.
function introHTML() {
  return `<p class="muted small ajuda-intro">Clique num título para abrir a seção. O essencial funciona <b>offline</b>; os recursos marcados com <b>(IA)</b> usam uma IA conectada (você liga em Configurações, com a sua própria chave). Dúvidas pontuais também podem ser feitas ao <b>Mentor</b> (o botão ${icone("sparkles")} no canto), que consulta este guia.</p>`;
}

// Barra do topo: filtro por texto + expandir/recolher.
function barraHTML() {
  return `
    <div class="barra-acoes u-mb-8">
      <input type="search" data-guia-filtro class="busca-input" placeholder="Filtrar o guia…" aria-label="Filtrar as seções do guia por texto" />
      <button class="btn btn-ghost btn-sm" data-action="expandir-tudo">Expandir tudo</button>
      <button class="btn btn-ghost btn-sm" data-action="recolher-tudo">Recolher tudo</button>
    </div>`;
}

// Filtro por texto: casa no título + corpo da seção, ignorando acentos e maiúsculas.
// Esconde as seções (e os cabeçalhos de grupo órfãos) que não casam; abre as que casam.
function ligarFiltro(escopo) {
  const inp = escopo.querySelector("[data-guia-filtro]");
  if (!inp) return;
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  inp.addEventListener("input", () => {
    const q = norm(inp.value.trim());
    escopo.querySelectorAll("details.ajuda-sec").forEach((d, i) => {
      const casa = !q || norm(d.textContent).includes(q);
      d.style.display = casa ? "" : "none";
      d.open = q ? casa : i === 0; // filtrando: abre o que casou; limpou: volta ao padrão
    });
    escopo.querySelectorAll("h3.ajuda-grupo").forEach((h) => {
      let temVisivel = false;
      for (let el = h.nextElementSibling; el && el.tagName !== "H3"; el = el.nextElementSibling)
        if (el.matches("details.ajuda-sec") && el.style.display !== "none") { temVisivel = true; break; }
      h.style.display = temVisivel ? "" : "none";
    });
  });
}

// Abre o GUIA como JANELA sobreposta (consultar sem sair da tela atual). Abre em modal
// normal (janela); o botão "Tela cheia" no cabeçalho expande quando o usuário quiser.
export function abrirGuia() {
  const corpo = `
    ${barraHTML()}
    ${introHTML()}
    ${secoesHTML()}`;
  abrirJanela({
    titulo: "Guia do sistema",
    telaCheia: false,
    corpoHTML: corpo,
    aoMontar: (jan) => {
      jan.querySelector('[data-action="expandir-tudo"]').addEventListener("click", () => jan.querySelectorAll("details.ajuda-sec").forEach((d) => (d.open = true)));
      jan.querySelector('[data-action="recolher-tudo"]').addEventListener("click", () => jan.querySelectorAll("details.ajuda-sec").forEach((d) => (d.open = false)));
      ligarFiltro(jan);
    },
  });
}

export default function renderAjuda(root, app) {
  root.innerHTML = `
    ${header(
      "Guia do sistema",
      "O que cada tela faz, como o Mentor funciona e como tudo se conecta.",
      `<button class="btn btn-ghost btn-sm" data-action="voltar-config">← Configurações</button>`
    )}

    ${barraHTML()}
    ${introHTML()}
    ${secoesHTML()}
  `;

  bindActions(root, {
    "voltar-config": () => app.navigate("config"),
    "expandir-tudo": () => root.querySelectorAll("details.ajuda-sec").forEach((d) => (d.open = true)),
    "recolher-tudo": () => root.querySelectorAll("details.ajuda-sec").forEach((d) => (d.open = false)),
  });
  ligarFiltro(root);
}

// Ícone (Lucide) de cada seção do guia — alinhado ao sistema de ícones do app.
// Fica AQUI (na tela) para o guia.js seguir sendo só dados. A chave é o id da seção.
const ICONE_SECAO = {
  ciclo: "compass", hoje: "clock-3", acompanhamento: "trending-up", planejamento: "calendar-days",
  mentor: "compass", edital: "list-checks", materiais: "library", leijuris: "scale",
  resumos: "file-text", mapas: "network",
  questoes: "pencil-line", discursiva: "square-pen", simulados: "clipboard-list",
  "central-revisoes": "calendar-check", flashcards: "layers", revtopico: "repeat-2",
  caderno: "flag", dossie: "folder-open", marcacao: "highlighter",
  impressao: "printer", assistente: "sparkles", sincronizacao: "link", "ia-offline": "bot",
  dados: "database", "sync-nuvem": "cloud",
};
// Remove qualquer glifo residual do começo do título salvo no guia (o ícone Lucide entra no lugar).
function tituloLimpo(t) {
  return String(t || "").replace(/^[^A-Za-zÀ-ú0-9]+/, "").trim();
}

// Monta as seções do GUIA, inserindo um cabeçalho de grupo quando o grupo muda.
function secoesHTML() {
  let grupoAtual = null;
  let html = "";
  GUIA.forEach((s, i) => {
    if (s.grupo && s.grupo !== grupoAtual) {
      grupoAtual = s.grupo;
      html += `<h3 class="ajuda-grupo">${s.grupo}</h3>`;
    }
    const ic = ICONE_SECAO[s.id] ? icone(ICONE_SECAO[s.id]) : "";
    html += `<details class="ajuda-sec card"${i === 0 ? " open" : ""}>
      <summary><span class="ajuda-sec-tit">${ic} ${tituloLimpo(s.titulo)}</span></summary>
      <div class="ajuda-sec-corpo">${s.html}</div>
    </details>`;
  });
  return html;
}
