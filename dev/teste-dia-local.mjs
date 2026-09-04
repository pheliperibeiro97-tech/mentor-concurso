// Teste: "que dia é isto?" tem de ser o dia do ALUNO, não o de Greenwich.
//
// Sessões e tentativas são gravadas com `nowISO()`, que é UTC. O app fazia `data.slice(0, 10)`
// em uma dúzia de lugares para saber de que dia era aquilo. Em Brasília, tudo depois das 21h já
// está no dia seguinte em UTC: o contador de Hoje zerava no meio da noite de estudo, o heatmap
// de constância pintava o quadrado errado e a ofensiva "quebrava" com o aluno estudando.
//
// O segundo caso é o oposto: a data ESCOLHIDA à mão é gravada como `yyyy-mm-ddT12:00:00.000Z`,
// e converter esse carimbo pelo fuso faria a escolha do aluno virar outro dia em UTC+12/+13,
// quebrando a ida e a volta do `<input type="date">` do histórico. Ele volta literal.
//
// Uso: node dev/teste-dia-local.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { diaLocal, todayISO } from "../src/util.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const erros = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };

// ---- 1. Carimbo de instante: converte para o fuso da máquina --------------------------------
// Um instante conhecido, conferido contra o que o próprio Date diz neste fuso (o teste roda em
// qualquer lugar do mundo sem precisar saber onde está).
const instante = "2026-09-04T01:30:00.000Z"; // 22:30 de 03/09 em Brasília
const d = new Date(instante);
const esperado = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
ok(diaLocal(instante) === esperado, `instante deve virar o dia LOCAL (esperado ${esperado}, veio ${diaLocal(instante)})`);
ok(diaLocal(instante) !== instante.slice(0, 10) || d.getUTCDate() === d.getDate(),
  "num fuso deslocado, o dia local tem de diferir da fatia UTC (é o bug das 21h)");

// ---- 2. Data escolhida à mão: literal, sem passar pelo fuso ---------------------------------
ok(diaLocal("2026-09-03T12:00:00.000Z") === "2026-09-03",
  "data escolhida (meio-dia UTC) volta literal: converter a moveria em UTC+12/+13");
ok(diaLocal("2026-01-01T12:00:00.000Z") === "2026-01-01", "vale na virada do ano");

// ---- 3. Dia puro e entradas estranhas -------------------------------------------------------
ok(diaLocal("2026-09-03") === "2026-09-03", "dia puro volta ele mesmo");
ok(diaLocal("") === "" && diaLocal(null) === "" && diaLocal(undefined) === "", "vazio não quebra");
ok(diaLocal("nao e data").length >= 0, "carimbo inválido não lança");
ok(diaLocal(todayISO()) === todayISO(), "todayISO passa por diaLocal sem mudar (os dois são locais)");

// ---- 4. Nenhum lugar que decide "hoje" pode ter voltado ao slice ----------------------------
// A regressão é fácil de reintroduzir: `slice(0,10)` parece equivalente e é mais curto.
const alvos = {
  "src/viz.js": /const d = diaLocal\(s\.data\)/,                      // heatmap de constância
  "src/ciclo.js": /diaLocal\(s\.data\) === hoje/,                     // sessões de hoje (fase do ciclo)
  "src/screens/hoje.js": /diaLocal\(s\.data\) === hoje/,              // rodapé de Hoje
};
for (const [arq, re] of Object.entries(alvos)) {
  const txt = readFileSync(resolve(aqui, "..", arq), "utf8");
  ok(re.test(txt), `${arq} deve usar diaLocal para decidir o dia`);
}
// `estudouHoje` (ofensiva) e a janela do relatório de cards.
const store = readFileSync(resolve(aqui, "../src/store.js"), "utf8");
ok(/const estudouHoje = \(state\.sessoes \|\| \[\]\)\.some\(\(s\) => diaLocal\(s\.data\) === todayISO\(\)\);/.test(store),
  "a ofensiva deve comparar o dia LOCAL (senão 'sua sequência quebra hoje' dispara com o aluno estudando)");
ok(/diaLocal\(r\.data\) >= limite/.test(store),
  "a janela do relatório de flashcards deve usar o dia local");

// Nenhum `.data.slice(0, 10)` sobrevivendo em src/ (fora do util, que documenta o problema).
const suspeitos = [];
for (const arq of ["src/store.js", "src/ciclo.js", "src/viz.js", "src/screens/hoje.js", "src/screens/diagnostico.js", "src/screens/dossie.js"]) {
  const txt = readFileSync(resolve(aqui, "..", arq), "utf8");
  if (/\.data \|\| ""\)\.slice\(0, 10\)|\.data\.slice\(0, 10\)/.test(txt)) suspeitos.push(arq);
}
ok(suspeitos.length === 0, `ainda há data.slice(0,10) decidindo o dia em: ${suspeitos.join(", ")}`);

// ---- resultado ------------------------------------------------------------------------------
if (erros.length) {
  console.error("FALHOU:\n- " + erros.join("\n- "));
  process.exit(1);
}
console.log("OK — o dia é o do aluno, e a data escolhida à mão não escorrega");
