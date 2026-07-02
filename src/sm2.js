// Algoritmo de repetição espaçada SM-2 (estilo Anki).
// quality: qualidade da resposta no recall, de 0 (esqueci) a 5 (perfeito).
import { addDays, todayISO } from "./util.js";

export function novoSM2() {
  return {
    ef: 2.5, // easiness factor
    intervaloDias: 0,
    reps: 0,
    dueDate: todayISO(),
    lastReview: null,
  };
}

// Recebe o estado sm2 atual e a qualidade; devolve novo estado sm2.
// Intervalos FIXOS por nota (decisão do usuário, seguindo a curva de esquecimento):
// Errei → 24h · Difícil → 7 dias · Bom → 15 dias · Fácil → 30 dias.
export function revisar(sm2, quality) {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { ef, reps } = sm2;

  let intervaloDias;
  if (q < 3) {
    reps = 0;
    intervaloDias = 1; // Errei: revê em 24h (memória ainda fresca)
  } else {
    reps += 1;
    intervaloDias = q === 3 ? 7 : q === 4 ? 15 : 30; // Difícil | Bom | Fácil
  }

  // Mantém o fator de facilidade atualizado (estatística; não afeta os intervalos fixos).
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3;
  ef = Math.round(ef * 100) / 100;

  const hoje = todayISO();
  return {
    ef,
    intervaloDias,
    reps,
    dueDate: addDays(hoje, intervaloDias),
    lastReview: hoje,
  };
}

// Cards vencidos (due <= hoje).
export function vencidos(flashcards, hoje = todayISO()) {
  return flashcards.filter((f) => f.sm2.dueDate <= hoje);
}
