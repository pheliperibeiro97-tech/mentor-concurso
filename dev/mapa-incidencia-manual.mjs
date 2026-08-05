// Correção À MÃO do casamento tema↔tópico da estatística de incidência.
//
// O casador automático acerta a maioria, mas erra dois tipos de caso que nenhuma heurística de
// palavras resolve, e que aqui são resolvidos por leitura:
//   1. Tema do cursinho que NÃO existe como item do edital porque está REPARTIDO em vários
//      ("Organização dos Poderes" = Legislativo + Executivo + Judiciário + Funções Essenciais).
//   2. Tema cujo nome bate com o item errado ("Espécies Tributárias" caindo em "Espécies de
//      infrações tributárias").
//
// A tabela abaixo é a interpretação; o NÍVEL não é escolhido aqui — sai da mesma regra do app
// (acumulado dentro da disciplina), para o manual e o automático falarem a mesma língua.
//
// uso: node dev/mapa-incidencia-manual.mjs <base.json>          (só mostra)
//      node dev/mapa-incidencia-manual.mjs <base.json> --json   (emite o plano para o app aplicar)
import { readFileSync } from "node:fs";
import { interpretarIncidenciaPorDisciplina } from "../src/ia.js";

// tema (como aparece no material) → tópicos do edital que ele cobre, por ID.
// Comentário ao lado = por que, quando não é óbvio.
export const MAPA = {
  // ---- correções de casamento errado ----
  "Espécies Tributárias": ["top_mse1bycd_8c"], // (3) Tributo · acepções e definição do art. 3º do CTN — e não "espécies de INFRAÇÕES"
  "Teoria Geral do Direito Civil": ["top_mse1byby_6", "top_mse1byby_7", "top_mse1byby_a"], // Parte Geral: LINDB, pessoas, fatos jurídicos
  "Sujeitos da Relação Processual": ["top_mse1byc3_24"], // (9) Partes e terceiros — e não "A ação"
  "Intervenção do Estado na Propriedade Privada": ["top_mse1bycg_9r", "top_mse1bycg_9s"], // Desapropriação + Intervenção na propriedade
  "Legislação e Normas de Direito Eleitoral": ["top_mse1bycb_76"], // (4) Direito Eleitoral: fontes e princípios — e não "Propaganda"

  // ---- temas que o edital REPARTE em vários itens ----
  "Organização dos Poderes": ["top_mse1byc9_6d", "top_mse1byc9_6f", "top_mse1byc9_6g", "top_mse1byc9_6i", "top_mse1byc9_6j"], // Legislativo, Executivo, Judiciário, Tribunais Estaduais, Funções Essenciais
  "Várias Espécies de Contrato": ["top_mse1bybz_u", "top_mse1bybz_w", "top_mse1bybz_x", "top_mse1bybz_y"], // compra e venda, doação, locação, seguro
  "Procedimento Comum": ["top_mse1byc3_26", "top_mse1byc3_28", "top_mse1byc3_2a"], // petição inicial → audiência → sentença

  // ---- temas sem par óbvio, resolvidos por leitura ----
  "Processo e Procedimento": ["top_mse1byc8_5u"], // (II.l) Dos processos em espécie
  "Jurisdição e Competência": ["top_mse1byc8_5n"], // (II.e) Da competência
  Prisões: ["top_mse1byc8_5r"], // (II.i) Da prisão, medidas cautelares e liberdade provisória
  "Sentença Penal": ["top_mse1byc8_5t"], // (II.k) Da sentença
  "Sujeitos do Processo": ["top_mse1byc8_5q"], // (II.h) Do Juiz, do MP, do Acusado e Defensor
  Licitações: ["top_mse1bycf_9j"], // (18) Licitação
  "Organização Administrativa": ["top_mse1byce_96"], // (5) Estrutura da Administração Pública
  "Segurança Jurídica e Eficiência na Criação e Aplicação": ["top_mse1byce_92"], // LINDB, arts. 20-30
  "Leis Tributárias": ["top_mse1bycd_8b"], // (2) Fontes do Direito Tributário
  "Processo Administrativo e Judicial Tributário": ["top_mse1byce_8k"], // (11) Ações de natureza tributária · Execuções Fiscais
  "Responsabilidade Civil dos Fornecedores": ["top_mse1byc4_2x"], // (2) Qualidade de produtos e serviços · reparação dos danos
  "Da Prevenção e do Tratamento do...": ["top_mse1byc4_2x"],
  "Jurisprudência acerca da Aplicabilidade do...": ["top_mse1byc4_34"], // (9) Súmulas e precedentes vinculantes
  "Regime Jurídico e Proteção dos Recursos Ambientais": ["top_mse1byce_8w"], // (8) Patrimônio ambiental natural
  Eleições: ["top_mse1bycc_7i"], // (16) Eleição · atos preparatórios · apuração e diplomação
  "Ações Constitucionais, Ações Especiais...": ["top_mse1bycc_7j"], // (17) Ações judiciais eleitorais
  "Teoria geral do Direito Eleitoral": ["top_mse1bycb_76"],
  "Partidos Políticos": ["top_mse1bycb_75"], // mora em Eleitoral (3) no edital do TJSP
};

// Temas conscientemente DEIXADOS DE FORA, com o motivo — para não parecerem esquecimento.
export const FORA = {
  "[ilegível]": "a Visão não conseguiu ler o nome no gráfico (13,68% de Legislação Penal Especial)",
  "Lei nº. 12.737/12 - Lei Carolina Dieckmann": "a lei não consta do edital",
  "Lei nº 12.830/13 – Investigação Criminal..": "a lei não consta do edital",
  "Decreto-Lei nº. 3.240/41 - Sequestro os bens...": "a lei não consta do edital",
  "Introdução ao estudo do Direito Penal": "0,53% — cauda, e sem item próprio no edital",
  Execução: "execução penal já entra pelo item (IV.h), casado pela Lei nº 7.210/84",
  "Do Direito de Empresa": "1,04% — o conteúdo é de Direito Empresarial, já coberto lá",
  CONANDA: "0,73% — sem item próprio no edital",
  // Conferido: NENHUM dos 401 tópicos menciona nacionalidade/naturalização. O vizinho de capítulo
  // na CF ("Direitos de cidadania · sufrágio") é OUTRA matéria — e a regra aqui é que vazio é
  // melhor que errado. Fica na lista de "sem correspondência", à vista, para marcar à mão.
  Nacionalidade: "2,08% — o edital do TJSP não traz item de nacionalidade",
};

const nivelPorAcumulado = (a) => (a <= 50 ? 95 : a <= 75 ? 70 : a <= 90 ? 40 : 15);

export function planoManual(texto, topicos) {
  const porId = new Map(topicos.map((t) => [t.id, t]));
  const plano = [];
  const semMapa = [];
  for (const sec of interpretarIncidenciaPorDisciplina(texto)) {
    let acumulado = 0;
    for (const t of sec.temas) {
      acumulado += t.pct;
      const alvos = MAPA[t.tema];
      if (!alvos) { if (!FORA[t.tema]) semMapa.push(`${sec.disciplina}: ${t.tema}`); continue; }
      for (const id of alvos) {
        if (!porId.has(id)) { semMapa.push(`ID inexistente: ${id} (${t.tema})`); continue; }
        plano.push({ topicoId: id, nome: porId.get(id).nome, tema: t.tema, disciplina: sec.disciplina, pct: t.pct, peso: nivelPorAcumulado(acumulado), atual: porId.get(id).peso || 0 });
      }
    }
  }
  // Mesmo tópico alcançado por dois temas: fica o maior nível.
  const melhor = new Map();
  for (const p of plano) if (!melhor.has(p.topicoId) || melhor.get(p.topicoId).peso < p.peso) melhor.set(p.topicoId, p);
  return { plano: [...melhor.values()].sort((a, b) => b.peso - a.peso || b.pct - a.pct), semMapa };
}

if (process.argv[1] && process.argv[1].endsWith("mapa-incidencia-manual.mjs")) {
  const base = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const { plano, semMapa } = planoManual(base.texto, base.topicos);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(plano.map((p) => ({ topicoId: p.topicoId, peso: p.peso }))));
  } else {
    console.log(`${plano.length} tópicos no plano manual (${Object.keys(MAPA).length} temas mapeados, ${Object.keys(FORA).length} deixados de fora de propósito)\n`);
    for (const p of plano)
      console.log(`  ${String(p.peso).padStart(3)}  ${p.nome.slice(0, 44).padEnd(46)} ← ${p.tema.slice(0, 34).padEnd(36)} ${String(p.pct).replace(".", ",")}% · ${p.disciplina}`);
    if (semMapa.length) { console.log(`\nsem mapa (${semMapa.length}):`); semMapa.forEach((s) => console.log("  ·", s)); }
    console.log("\ndeixados de fora de propósito:");
    for (const [tema, pq] of Object.entries(FORA)) console.log(`  · ${tema} — ${pq}`);
  }
}
