// Teste da regra que liga um bloco do sumário ao tópico do edital (estrutura.js), sem app.
//
// Existe porque o casamento era por semelhança de título contra o edital INTEIRO: bastava uma
// palavra em comum para o bloco cair em outra matéria. Medido na biblioteca real (17 apostilas,
// 327 vínculos): 53% dos blocos caíam na disciplina do próprio material; com a preferência pela
// disciplina, 95% (entre os materiais cuja disciplina existe no edital).
//
// Uso: node dev/teste-vinculos.mjs
import { acharTopicoDoBloco, disciplinaDoMaterial } from "../src/estrutura.js";

const disciplinas = [
  { id: "d_const", nome: "Direito Constitucional" },
  { id: "d_penal", nome: "Direito Penal" },
  { id: "d_civil", nome: "Direito Civil" },
  { id: "d_dh", nome: "Direitos Humanos" },
];
const topicos = [
  { id: "t_adm_const", disciplinaId: "d_const", nome: "Administração Pública · Servidores públicos · Regime jurídico" },
  { id: "t_fund", disciplinaId: "d_const", nome: "Direitos Fundamentais · Direitos e deveres individuais e coletivos" },
  { id: "t_crimes_adm", disciplinaId: "d_penal", nome: "Dos crimes contra a administração pública (arts. 312 a 359-H)" },
  { id: "t_pessoas", disciplinaId: "d_civil", nome: "Pessoas naturais · Direitos da personalidade · Capacidade" },
  { id: "t_mulher", disciplinaId: "d_dh", nome: "Proteção às mulheres · Violência doméstica · Convenções" },
  { id: "t_idoso", disciplinaId: "d_dh", nome: "Proteção à pessoa idosa · Estatuto · Prioridades" },
];

const erros = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };
const casar = (titulo, discId) => acharTopicoDoBloco(titulo, { topicos, disciplinas, disciplinaId: discId });

// 1) O caso que motivou tudo: numa apostila de Constitucional, "Administração Pública" tem de
//    casar com o tópico de Constitucional, não com "crimes contra a administração pública".
ok(casar("Administração Pública", "d_const")?.topicoId === "t_adm_const",
  "bloco de Constitucional foi parar em outra disciplina");
// 2) O mesmo título numa apostila de Penal casa com o tópico de Penal.
ok(casar("Dos crimes contra a administração pública", "d_penal")?.topicoId === "t_crimes_adm",
  "bloco de Penal não casou com o tópico de Penal");
// 3) "Proteção às Mulheres" (Direitos Humanos) não pode virar "Pessoas naturais" (Civil).
ok(casar("Proteção às Mulheres", "d_dh")?.topicoId === "t_mulher",
  "bloco de Direitos Humanos foi parar no Civil");
// 4) Sem nada aceitável na própria disciplina E sem casamento forte fora dela: NÃO vincula.
//    Vínculo errado é pior que vínculo nenhum (ele conta como cobertura do edital).
ok(casar("Considerações iniciais do curso", "d_const") === null,
  "título genérico deveria ficar SEM vínculo");
// 5) Material que não é disciplina do edital (Legislação Penal Especial, Difusos e Coletivos):
//    sem disciplina de referência, vale o casamento global — é assim que o conteúdo deles cai
//    nas disciplinas certas.
ok(casar("Proteção à pessoa idosa", null)?.topicoId === "t_idoso",
  "sem disciplina de referência, o casamento global deveria funcionar");
// 6) A disciplina do material sai do nome do arquivo; o que não é disciplina devolve null.
ok(disciplinaDoMaterial("2. Direito Constitucional", disciplinas) === "d_const", "não achou a disciplina pelo nome do arquivo");
ok(disciplinaDoMaterial("9. Legislação Penal Especial", disciplinas) === null, "Legislação Penal Especial não é disciplina do edital");

// 7) Título CURTO não sai da própria disciplina: "Prescrição", num material de Penal, casaria
//    1.00 com "Prescrição e decadência" (Civil) — a nota é interseção/menor conjunto, e o lado
//    curto sempre cabe inteiro dentro de algum dos 400 tópicos do edital.
ok(casar("Prescrição", "d_penal") === null, "título de uma palavra não pode casar em outra disciplina");
ok(casar("Ilicitude", "d_penal") === null, "título de uma palavra não pode casar em outra disciplina");
// 8) Já um título com substância pode casar fora, se a semelhança for alta.
ok(casar("Proteção às mulheres e violência doméstica", "d_penal")?.topicoId === "t_mulher",
  "título substancial deveria poder casar em outra disciplina");

erros.forEach((e) => console.log("XX  " + e));
console.log(erros.length ? `\n${erros.length} falha(s)` : "ok  9/9 regras de vínculo bloco↔tópico");
process.exit(erros.length ? 1 : 0);
