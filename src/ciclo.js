// Lógica do ciclo de aprendizado (Estudo → Prática → Revisão → Planejamento).
// Conduz o dia: decide qual fase e qual tópico priorizar agora.
import { todayISO } from "./util.js";
import { vencidos } from "./sm2.js";

export const FASES = {
  E: { codigo: "E", nome: "Estudo", cor: "#3b82f6", desc: "Aprender conteúdo novo" },
  // ATENÇÃO — LEGADO PROPOSITAL, NÃO "CONSERTAR": a chave é "A" mas o código exibido é "P".
  // "A" (de "Aplicação", nome antigo da fase) é a chave HISTÓRICA persistida nos dados dos
  // usuários (sessoes[].fase === "A", ORDEM_FASES, FASE_ICON...). Renomear a chave para "P"
  // quebraria todo dado já salvo e exigiria migração. O rótulo/código visível ("P" de
  // "Prática") vive no campo `codigo`; a chave fica "A" para sempre.
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
    for (const a of aulasEmOrdem(state)) {
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
  aulasEmOrdem(state).forEach((a, ai) => (a.topicoIds || []).forEach((tid) => { if (!ordem.has(tid)) ordem.set(tid, ai); }));
  return [...topicos].sort((a, b) => (ordem.has(a.id) ? ordem.get(a.id) : 9999) - (ordem.has(b.id) ? ordem.get(b.id) : 9999));
}

// ===== Ordem do plano do cursinho =====
// Mora aqui, e não na tela, porque a ordem do plano É a ordem de estudo da base "Cursinho":
// se a tela ordenasse por conta própria, o que se vê e o que se estuda divergiriam em silêncio
// (foi o que acontecia quando a ordem era a posição no array, movida à mão por arrastar).

// A disciplina em que cada aula APARECE. `herdar: false` devolve só a que a própria aula declara
// — é o que a correção de vínculos usa: herança serve para agrupar, nunca para apagar vínculo.
export function disciplinaDePlanoDe(state, { herdar = true } = {}) {
  const disciplinas = state.disciplinas || [];
  const aulas = state.aulas || [];
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const resolver = (nome) => {
    const dn = norm(nome);
    if (!dn) return null;
    return disciplinas.find((x) => norm(x.nome) === dn)
      || disciplinas.find((x) => { const xn = norm(x.nome); return xn && (xn.includes(dn) || dn.includes(xn)); })
      || null;
  };
  // Muitas grades nomeiam a aula com a matéria na frente ("Direito Tributário - Aula 01"). Esse
  // prefixo é a prova mais confiável que existe da disciplina da aula, e vem do próprio cursinho.
  const prefixoDaAula = (nome) => {
    const m = String(nome || "").match(/^(.+?)\s[-–—]\s*aula\s*\d/i);
    return m ? m[1].trim() : null;
  };
  const propria = (a, { comVinculos = true } = {}) => {
    // 1) o que a importação/o usuário declarou. Nome que não existe no edital é resposta ("Outra"):
    // a aula fica no plano sem vínculo nenhum.
    const bruto = (a.disciplinaNome || "").trim();
    if (bruto) { const d = resolver(bruto); return d ? { id: d.id, nome: d.nome } : { id: null, nome: bruto }; }
    // 2) o prefixo do NOME da aula, quando bate com uma disciplina do edital. Vem ANTES do
    // disciplinaId gravado de propósito: nas importações antigas esse campo era preenchido com a
    // disciplina do PRIMEIRO tópico casado — ou seja, herdava o erro do casamento sem disciplina,
    // e uma aula de Tributário acabava marcada como Constitucional por causa do vínculo errado.
    const pref = prefixoDaAula(a.nome);
    if (pref) { const d = resolver(pref); if (d) return { id: d.id, nome: d.nome }; }
    // 3) o campo gravado, e por último a única disciplina dos tópicos vinculados.
    if (a.disciplinaId) { const d = disciplinas.find((x) => x.id === a.disciplinaId); if (d) return { id: d.id, nome: d.nome }; }
    // Último recurso: a disciplina DOMINANTE entre os tópicos vinculados. Serve para agrupar na
    // tela, mas NÃO para a correção de vínculos — ali seria circular (a régua sairia justamente
    // dos vínculos que se quer conferir, e todo erro pareceria coerente consigo mesmo).
    if (!comVinculos) return null;
    const conta = new Map();
    for (const id of a.topicoIds || []) {
      const t = (state.topicos || []).find((x) => x.id === id);
      if (t && t.disciplinaId) conta.set(t.disciplinaId, (conta.get(t.disciplinaId) || 0) + 1);
    }
    const venc = [...conta.entries()].sort((x, y) => y[1] - x[1])[0];
    if (venc) { const d = disciplinas.find((x) => x.id === venc[0]); if (d) return { id: d.id, nome: d.nome }; }
    return null;
  };
  const mapa = new Map();
  if (!herdar) {
    for (const a of aulas) mapa.set(a.id, propria(a, { comVinculos: false }));
    return mapa;
  }
  // A aula sem disciplina própria herda a da sequência: primeiro da seguinte (a 00 abre o bloco),
  // depois da anterior (aula de revisão no fim do bloco).
  let prox = null;
  for (let i = aulas.length - 1; i >= 0; i--) {
    const p = propria(aulas[i]);
    if (p) prox = p;
    mapa.set(aulas[i].id, p || prox);
  }
  let ant = null;
  for (const a of aulas) {
    const r = mapa.get(a.id);
    if (r) ant = r; else mapa.set(a.id, ant);
  }
  return mapa;
}

// Número da aula ("Aula 00" → 0; "Aula 14 - Exclusivamente PDF" → 14). Sem número, null.
function numeroDaAula(nome) {
  const m = String(nome || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// O plano na ordem em que se estuda: disciplinas na ordem em que aparecem, e dentro de cada uma
// as aulas pelo NÚMERO. Aula sem número (ex.: "Revisão final") vai para o fim do bloco, na ordem
// em que foi importada. O sort é estável, então empate mantém a ordem de importação.
export function aulasEmOrdem(state) {
  const aulas = state.aulas || [];
  if (!aulas.length) return [];
  const regua = disciplinaDePlanoDe(state);
  const grupos = [];
  const idx = new Map();
  for (const a of aulas) {
    const d = regua.get(a.id);
    const chave = (d && d.nome) || "";
    if (!idx.has(chave)) { idx.set(chave, grupos.length); grupos.push([]); }
    grupos[idx.get(chave)].push(a);
  }
  return grupos.flatMap((g) =>
    [...g].sort((x, y) => {
      const nx = numeroDaAula(x.nome);
      const ny = numeroDaAula(y.nome);
      if (nx === null && ny === null) return 0;
      if (nx === null) return 1;
      if (ny === null) return -1;
      return nx - ny;
    })
  );
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
