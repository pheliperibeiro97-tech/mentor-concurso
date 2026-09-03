// Repetição espaçada por ESCADA FIXA: 24h · 7 · 15 · 30 dias, escolhida pela nota.
//
// NÃO é o SM-2 nem o algoritmo do Anki, e o cabeçalho daqui dizia que era. O `ef` (fator de
// facilidade) é calculado e guardado, mas NÃO entra no cálculo do intervalo: ele é estatística,
// não agendador. Quem for mexer aqui precisa saber disso antes, e não depois.
//
// A escada fixa é decisão de produto do usuário (04/07/2026), tomada contra as 7 datas fixas do
// MEI: ela reage à nota (esqueci/difícil/bom/fácil), o que as datas fixas não fazem. Trocar por
// um SM-2 de verdade reagendaria todos os cartões que já existem, e não é conserto de defeito.
// O que era defeito era o NOME.
//
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

  // Fator de facilidade: guardado como ESTATÍSTICA do cartão. Não afeta o intervalo (ver o
  // cabeçalho): quem ler só esta linha pode achar que afeta.
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
