// Central de novidades: UM lugar discreto (sino no topo) para "o que há de novo".
// Anti-modal-fatigue (lição da auditoria): nada de modais empilhados nem tour de N
// passos — badge silencioso quando a versão instalada é mais nova que a última vista.
import { APP_VERSION } from "./erro-log.js";
import { esc } from "./util.js";
import { abrirJanela } from "./ui.js";

// Changelog (mais recente primeiro). Cada versão: { v, data, itens:[...] }.
export const NOVIDADES = [
  {
    v: "0.6.1",
    data: "julho/2026",
    titulo: "Lembretes em qualquer tela + refinamento ultrapremium",
    itens: [
      "Novo botão flutuante de Lembretes (ícone de anotação), ao lado do cronômetro e do Assistente, presente em todas as telas — inclusive no Modo Foco. O Assistente também passou a acompanhar você no Modo Foco.",
      "Resumos legíveis no tema escuro: o texto e os grifos deixaram de sumir no fundo escuro.",
      "Visual mais coeso: ícones padronizados (sem emojis soltos), abas iguais em Lei Seca, Edital e Simulados, e os botões flutuantes alinhados.",
      "Acompanhamento mais leve: o Calendário agora é recolhível e há um único atalho para o Mentor.",
      "Impressão corrigida: o Acompanhamento não imprime mais botões/menus, o Dossiê só imprime seções com conteúdo, e o Simulado ganhou 'Imprimir folha'.",
      "Assistente e Mentor com papéis mais claros: o Assistente é para perguntas e ações rápidas; o Mentor é o seu treinador de estudos (análise + plano).",
    ],
  },
  {
    v: "0.6.0",
    data: "julho/2026",
    titulo: "Lei Seca e Jurisprudência repensadas",
    itens: [
      "Lei Seca e Jurisprudência agora têm 3 abas claras: Ler (a letra), Estudar e Metas — com visual premium.",
      "Estudar virou um lançador: Certo/Errado, Completar a letra, Revisar o que vence e Refazer erros, em tela cheia. Dá para escolher o escopo (tudo ou o que mais cai).",
      "Toda geração pergunta quantidade e dificuldade; também dá para gerar flashcards e questões de múltipla escolha a partir da letra.",
      "Importar lei oficial: traz a letra exata do Planalto (ou colando o texto), você escolhe os artigos e o app detecta o que está revogado.",
      "Novidade legislativa: reconsulte a fonte e veja o que mudou, entrou ou foi revogado — e treine só as novidades.",
      "Incidência virou uma lente: o que mais cai aparece direto no artigo e prioriza o estudo.",
      "Metas de leitura: crie, importe um cronograma inteiro e divida em etapas — cada etapa vira tarefa no Planejamento.",
      "Jurisprudência: marque súmula cancelada/superada (sai do estudo), Súmula Vinculante, o ano do entendimento (avisa quando é antigo) e a súmula-duelo (número/tribunal trocado).",
    ],
  },
  {
    v: "0.5.0",
    data: "julho/2026",
    titulo: "Redesign visual + Mentor com rosto",
    itens: [
      "Nova cara do app: cards com profundidade, botões premium e movimento em tudo.",
      "O Mentor ganhou um rosto (orb) e responde ao vivo, com texto que surge enquanto pensa.",
      "Painel da Disciplina: KPIs, desempenho por tópico em semáforo e “✨ Explicar meu desempenho”.",
      "Acompanhamento com heatmap de constância (o ano inteiro) — que motiva, sem punir.",
      "Registrar sessão mais rápido: escolha o tipo num toque e abra só o detalhe que usar.",
      "Home “Hoje” com o plano do Mentor e um “Começar agora” direto ao ponto.",
    ],
  },
];

// A "versão de novidades" é a mais recente do changelog.
function ultimaVersao() {
  return NOVIDADES.length ? NOVIDADES[0].v : APP_VERSION;
}

// Há novidade não vista? (config.novidadesVistas guarda a última versão vista)
export function temNovidade(store) {
  const vista = store.get().config.novidadesVistas || "";
  return vista !== ultimaVersao();
}

export function marcarNovidadesVistas(store) {
  store.setConfig({ novidadesVistas: ultimaVersao() });
}

// Abre o painel (janela modal única) e marca como visto.
export function abrirNovidades(store) {
  const corpo = NOVIDADES.map(
    (n) => `
      <div class="nov-bloco">
        <div class="nov-cab"><b>${esc(n.titulo)}</b> <span class="chip chip-count" style="cursor:default">v${esc(n.v)}</span> <span class="muted small">${esc(n.data)}</span></div>
        <ul class="nov-lista">${n.itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      </div>`
  ).join("");
  abrirJanela({
    titulo: "Novidades",
    corpoHTML: `<div class="novidades">${corpo}</div>`,
  });
  marcarNovidadesVistas(store);
}
