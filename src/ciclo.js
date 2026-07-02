// Lógica do ciclo de aprendizado (Estudo → Prática → Revisão → Planejamento).
// Conduz o dia: decide qual fase e qual tópico priorizar agora.
import { todayISO } from "./util.js";
import { vencidos } from "./sm2.js";

export const FASES = {
  E: { codigo: "E", nome: "Estudo", cor: "#3b82f6", desc: "Aprender conteúdo novo" },
  A: { codigo: "P", nome: "Prática", cor: "#10b981", desc: "Resolver questões" },
  R: { codigo: "R", nome: "Revisão", cor: "#f59e0b", desc: "Flashcards e caderno de erros" },
  // A 4ª etapa não é uma sessão cronometrada: é o ajuste de rota, feito no
  // Planejamento com apoio do Mentor IA. Mantida só para exibir dados antigos.
  Pl: { codigo: "Pl", nome: "Planejamento", cor: "#8b5cf6", desc: "Ajuste de rota com o Mentor IA" },
};

// Fases que o usuário registra (cronômetro / lançamento manual). Planejamento fica de fora.
export const ORDEM_FASES = ["E", "A", "R"];

// Quantas sessões de cada fase já foram feitas hoje.
export function sessoesDeHoje(state) {
  const hoje = todayISO();
  const cont = { E: 0, A: 0, R: 0 };
  for (const s of state.sessoes) {
    if (s.data && s.data.slice(0, 10) === hoje && cont[s.fase] !== undefined) {
      cont[s.fase] += 1;
    }
  }
  return cont;
}

// Recomenda a próxima fase: a do ciclo com menos sessões hoje (mantém o ciclo girando),
// mas prioriza Revisão se há flashcards vencidos ou erros pendentes.
export function proximaFase(state) {
  const cont = sessoesDeHoje(state);
  const temVencidos = vencidos(state.flashcards).length > 0;
  const errosPendentes = state.tentativas.some((t) => !t.acertou);

  if ((temVencidos || errosPendentes) && cont.R <= Math.min(cont.E, cont.A)) {
    return "R";
  }
  // Escolhe a fase de menor contagem, respeitando a ordem do ciclo em empate.
  let melhor = ORDEM_FASES[0];
  for (const f of ORDEM_FASES) {
    if (cont[f] < cont[melhor]) melhor = f;
  }
  return melhor;
}

// Tópico sugerido para a fase: o de menor "cobertura" (menos questões/material/sessões).
export function topicoSugerido(state, fase) {
  if (!state.topicos.length) return null;
  const score = (t) => {
    const qs = state.questoes.filter((q) => q.topicoId === t.id).length;
    const docs = state.documentos.filter((d) => d.topicoId === t.id).length;
    const sess = state.sessoes.filter((s) => s.topicoId === t.id).length;
    const bonusDestaque = t.destaque ? -2 : 0; // destaques têm prioridade
    const bonusPeso = -(t.peso || 0) / 15; // maior incidência = maior prioridade
    return qs + docs + sess + bonusDestaque + bonusPeso;
  };
  // Para Revisão, prioriza tópicos com flashcards vencidos.
  if (fase === "R") {
    const hoje = todayISO();
    const comVencidos = state.topicos.filter((t) =>
      state.flashcards.some((f) => f.topicoId === t.id && f.sm2.dueDate <= hoje)
    );
    if (comVencidos.length) {
      return comVencidos.sort((a, b) => score(a) - score(b))[0];
    }
  }
  // Base de estudo = CURSINHO: anda pela SEQUÊNCIA DAS AULAS (Aula 1 → 2 → ...).
  // Sugere o 1º tópico ainda NÃO concluído na ordem das aulas; se todas concluídas, cai no score.
  if (state.config && state.config.baseEstudo === "cursinho" && Array.isArray(state.aulas) && state.aulas.length) {
    for (const a of state.aulas) {
      for (const tid of a.topicoIds || []) {
        const t = state.topicos.find((x) => x.id === tid);
        if (t && !t.concluido) return t;
      }
    }
  }
  return [...state.topicos].sort((a, b) => score(a) - score(b))[0];
}

// Ordena tópicos pela posição na SEQUÊNCIA DAS AULAS quando a base de estudo é o cursinho;
// caso contrário, mantém a ordem do edital. Usado nos seletores de tópico do Hoje.
export function ordenarTopicosPorBase(state, topicos) {
  if (!state.config || state.config.baseEstudo !== "cursinho" || !Array.isArray(state.aulas) || !state.aulas.length) {
    return topicos;
  }
  const ordem = new Map();
  state.aulas.forEach((a, ai) => (a.topicoIds || []).forEach((tid) => { if (!ordem.has(tid)) ordem.set(tid, ai); }));
  return [...topicos].sort((a, b) => (ordem.has(a.id) ? ordem.get(a.id) : 9999) - (ordem.has(b.id) ? ordem.get(b.id) : 9999));
}

// Plano do dia: a recomendação principal + visão do ciclo.
export function planoDeHoje(state) {
  const fase = proximaFase(state);
  const topico = topicoSugerido(state, fase);
  return {
    fase,
    faseInfo: FASES[fase],
    topico,
    contagem: sessoesDeHoje(state),
  };
}
