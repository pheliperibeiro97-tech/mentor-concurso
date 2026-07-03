// Tela do GUIA do sistema (manual de uso). Renderiza as seções definidas em guia.js
// (que também são pesquisáveis pelo Assistente/chat). Seções recolhíveis (<details>).
import { bindActions, header, abrirJanela } from "../ui.js";
import { icone } from "../icones.js";
import { GUIA } from "../guia.js";

// Abre o GUIA como JANELA sobreposta (consultar sem sair da tela atual). Abre em modal
// normal (janela); o botão "⛶ Tela cheia" no cabeçalho expande quando o usuário quiser.
export function abrirGuia() {
  const corpo = `
    <div class="barra-acoes" style="margin-bottom:8px">
      <button class="btn btn-ghost btn-sm" data-action="expandir-tudo">Expandir tudo</button>
      <button class="btn btn-ghost btn-sm" data-action="recolher-tudo">Recolher tudo</button>
    </div>
    <p class="muted small ajuda-intro">Clique num título para abrir a seção. O essencial funciona <b>offline</b>; os recursos marcados com ${icone("sparkles")} usam uma IA conectada (você liga em Configurações com a sua própria chave). Dúvidas pontuais também podem ser feitas ao <b>Assistente</b> (o botão ${icone("sparkles")} no canto), que consulta este guia.</p>
    ${secoesHTML()}`;
  abrirJanela({
    titulo: "Guia do sistema",
    telaCheia: false,
    corpoHTML: corpo,
    aoMontar: (jan) => {
      jan.querySelector('[data-action="expandir-tudo"]').addEventListener("click", () => jan.querySelectorAll("details.ajuda-sec").forEach((d) => (d.open = true)));
      jan.querySelector('[data-action="recolher-tudo"]').addEventListener("click", () => jan.querySelectorAll("details.ajuda-sec").forEach((d) => (d.open = false)));
    },
  });
}

export default function renderAjuda(root, app) {
  root.innerHTML = `
    ${header(
      "Guia do sistema",
      "O que cada tela faz, como o Mentor IA funciona e como tudo se conecta.",
      `<button class="btn btn-ghost btn-sm" data-action="voltar-config">← Configurações</button>`
    )}

    <div class="barra-acoes">
      <button class="btn btn-ghost btn-sm" data-action="expandir-tudo">Expandir tudo</button>
      <button class="btn btn-ghost btn-sm" data-action="recolher-tudo">Recolher tudo</button>
    </div>

    <p class="muted small ajuda-intro">Clique num título para abrir a seção. O essencial funciona <b>offline</b>; os recursos marcados com ${icone("sparkles")} usam uma IA conectada (você liga em Configurações com a sua própria chave). Dúvidas pontuais também podem ser feitas ao <b>Assistente</b> (o botão ${icone("sparkles")} no canto), que consulta este guia.</p>

    ${secoesHTML()}
  `;

  bindActions(root, {
    "voltar-config": () => app.navigate("config"),
    "expandir-tudo": () => root.querySelectorAll("details.ajuda-sec").forEach((d) => (d.open = true)),
    "recolher-tudo": () => root.querySelectorAll("details.ajuda-sec").forEach((d) => (d.open = false)),
  });
}

// Ícone (Lucide) de cada seção do guia — alinhado ao sistema de ícones do app.
// Fica AQUI (na tela) para o guia.js seguir sendo só dados. A chave é o id da seção.
const ICONE_SECAO = {
  ciclo: "compass", hoje: "clock-3", acompanhamento: "trending-up", planejamento: "calendar-days",
  mentor: "compass", edital: "list-checks", materiais: "library", leijuris: "scale",
  questoes: "pencil-line", discursiva: "square-pen", flashcards: "layers", revtopico: "repeat-2",
  caderno: "flag", resumos: "file-text", dossie: "folder-open", marcacao: "highlighter",
  impressao: "printer", assistente: "sparkles", sincronizacao: "link", "ia-offline": "bot",
  dados: "database", "sync-nuvem": "cloud",
};
// Remove o glifo/emoji do começo do título salvo no guia (o ícone Lucide entra no lugar).
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
