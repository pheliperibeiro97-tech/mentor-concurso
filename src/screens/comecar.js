// Tela "Por onde começar?" — mostrada uma vez logo após o onboarding. Apresenta as
// principais funções, o guia, e sugere o primeiro passo concreto (montar o Edital).
import { bindActions, header } from "../ui.js";
import { esc } from "../util.js";
import { icone } from "../icones.js";

// Ícones reusam exatamente os das rotas na barra lateral (coerência total).
const FUNCS = [
  { rota: "edital", ico: icone("list-checks"), nome: "Edital", txt: "O mapa do que estudar: disciplinas e tópicos da sua prova, com o que ainda falta cobrir." },
  { rota: "documentos", ico: icone("library"), nome: "Materiais", txt: "Importe PDFs e materiais; com a IA viram flashcards, questões e resumos." },
  { rota: "pratica", ico: icone("pencil-line"), nome: "Questões e Simulados", txt: "Resolva questões e monte simulados; os erros vão para o Caderno de Erros." },
  { rota: "flashcards", ico: icone("layers"), nome: "Flashcards", txt: "Revisão espaçada (curva do esquecimento) para fixar o que importa." },
  { rota: "resumos", ico: icone("file-text"), nome: "Resumos", txt: "Resumos com marcação por cores e revisão programada." },
  { rota: "mentor", ico: icone("compass"), nome: "Mentor IA", txt: "A camada de inteligência: sugere, organiza e conversa com você (opcional)." },
  { rota: "hoje", ico: icone("clock-3"), nome: "Hoje", txt: "Seu painel diário com o cronômetro de foco e o ciclo de estudos." },
  { rota: "diagnostico", ico: icone("trending-up"), nome: "Acompanhamento", txt: "Sua evolução em gráficos: cobertura, aproveitamento e constância." },
];

export default function renderComecar(root, app) {
  const { store } = app;
  const c = store.get().concurso;
  const alvo = c && c.cargo ? esc(c.cargo) : "seus estudos";
  root.innerHTML = `
    ${header("Tudo pronto! Por onde começar?", `Um mapa rápido do Mentor para ${alvo}.`)}

    <section class="card comecar-passo1">
      <div class="cp1-num">1</div>
      <div class="cp1-corpo">
        <h3>Monte seu Edital</h3>
        <p class="muted">Tudo no Mentor parte do edital: ele organiza as disciplinas e os tópicos da sua prova e mostra o que já está coberto. Comece por aqui, e depois é só <b>estudar → praticar → revisar</b>.</p>
        <button class="btn btn-primary btn-lg" data-action="ir-edital">Começar pelo Edital →</button>
      </div>
    </section>

    <h2 class="comecar-titulo">O que o Mentor faz</h2>
    <div class="comecar-grid">
      ${FUNCS.map(
        (f) => `
        <button class="card comecar-card" data-action="ir" data-rota="${f.rota}">
          <span class="cc-ico">${f.ico}</span>
          <span class="cc-nome">${esc(f.nome)}</span>
          <span class="cc-txt muted small">${esc(f.txt)}</span>
        </button>`
      ).join("")}
    </div>

    <div class="comecar-rodape">
      <button class="btn btn-ghost" data-action="ir-guia">${icone("book-open")} Abrir o guia completo</button>
      <button class="btn btn-ghost" data-action="ir-hoje">Ir direto para o Hoje</button>
    </div>`;

  bindActions(root, {
    "ir-edital": () => app.navigate("edital"),
    ir: (el) => app.navigate(el.getAttribute("data-rota")),
    "ir-guia": () => app.navigate("ajuda"),
    "ir-hoje": () => app.navigate("hoje"),
  });
}
