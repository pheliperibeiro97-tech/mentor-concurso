// Helpers de mapa mental: abrir um mapa salvo com TODAS as ações (observação, remover,
// gerar flashcards/questões a partir dele) e gerar+abrir a partir de uma fonte.
import { abrirMapaMental, toast, avisoIA, pedirNumero, plural, abrirJanela, skeletonDoc } from "./ui.js";
import { icone } from "./icones.js";

// Abre um mapa já salvo com as ações completas. opts.editar abre direto no modo de edição.
export function abrirMapaCompleto(store, app, mapa, opts = {}) {
  abrirMapaMental(mapa, {
    editar: opts.editar,
    onRemover: () => { store.removerMapaMental(mapa.id); toast("Mapa mental removido."); app.refresh(); },
    onSalvarObs: (txt) => store.setObservacaoMapa(mapa.id, txt),
    onSalvarArvore: (arvore) => {
      store.setArvoreMapa(mapa.id, arvore);
      mapa.arvore = arvore;
      if (arvore.titulo) mapa.titulo = arvore.titulo;
      toast("Mapa atualizado.", "ok");
      app.refresh();
    },
    acoes: [
      {
        label: "Gerar flashcards",
        fn: async () => {
          if (!store.iaDisponivel()) return avisoIA(app, "Gerar flashcards do mapa");
          const r = await pedirNumero("Quantos flashcards a IA deve gerar deste mapa?", { padrao: 8, min: 1, max: 30, nivel: true });
          if (!r) return;
          toast("Gerando flashcards com a IA…");
          try {
            const fc = await store.gerarFlashcardsDeMapa(mapa.id, r.n, r.dificuldade);
            toast(fc.length ? `${plural(fc.length, "flashcard gerado", "flashcards gerados")} (confira).` : "A IA não retornou nada.", fc.length ? "ok" : "erro");
          } catch (e) { console.error(e); toast("Não consegui gerar agora.", "erro"); }
        },
      },
      {
        label: "Gerar questões (múltipla escolha)",
        fn: async () => {
          if (!store.iaDisponivel()) return avisoIA(app, "Gerar questões do mapa");
          const r = await pedirNumero("Quantas questões de múltipla escolha a IA deve gerar deste mapa?", { padrao: 5, min: 1, max: 30, nivel: true });
          if (!r) return;
          toast("Gerando questões com a IA…");
          try {
            const qs = await store.gerarQuestoesDeMapa(mapa.id, r.n, r.dificuldade);
            toast(qs.length ? `${plural(qs.length, "questão gerada", "questões geradas")} (confira).` : "A IA não retornou nada.", qs.length ? "ok" : "erro");
          } catch (e) { console.error(e); toast("Não consegui gerar agora.", "erro"); }
        },
      },
      {
        label: "Gerar questões Certo/Errado",
        fn: async () => {
          if (!store.iaDisponivel()) return avisoIA(app, "Gerar questões Certo/Errado do mapa");
          const r = await pedirNumero("Quantas afirmações Certo/Errado a IA deve gerar deste mapa?", { padrao: 6, min: 1, max: 30, nivel: true });
          if (!r) return;
          toast("Gerando afirmações Certo/Errado com a IA…");
          try {
            const qs = await store.gerarQuestoesCEDeMapa(mapa.id, r.n, r.dificuldade);
            toast(qs.length ? `${plural(qs.length, "afirmação Certo/Errado gerada", "afirmações Certo/Errado geradas")} (confira).` : "A IA não retornou nada.", qs.length ? "ok" : "erro");
          } catch (e) { console.error(e); toast("Não consegui gerar agora.", "erro"); }
        },
      },
      {
        label: "↺ Agendar revisão",
        fn: async () => {
          const r = await pedirNumero("Revisar este mapa daqui a quantos dias?", { padrao: 1, min: 1, max: 365, presets: [1, 7, 15], rotuloOk: "Agendar" });
          if (!r) return;
          store.agendarRevisaoMapa(mapa.id, r.n);
          toast("Mapa adicionado à revisão espaçada.");
          app.refresh();
        },
      },
    ],
  });
}

// Gera um mapa a partir de uma fonte (fn geradora assíncrona) com feedback e abre.
export async function gerarEAbrirMapa(store, app, gerar) {
  if (!store.iaDisponivel()) return avisoIA(app, "Gerar mapa mental");
  const carreg = abrirJanela({ titulo: "Gerando mapa mental…", corpoHTML: `<div class="ai-frame">${skeletonDoc(5)}</div>` });
  try {
    const m = await gerar();
    carreg.fechar();
    if (!m) return toast("Sem conteúdo suficiente para gerar o mapa.", "erro");
    toast("Mapa mental gerado.", "ok");
    app.refresh();
    abrirMapaCompleto(store, app, m);
  } catch (e) {
    carreg.fechar();
    console.error(e);
    toast("Não consegui gerar o mapa agora. Tente de novo.", "erro");
  }
}
