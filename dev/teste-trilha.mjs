// Mede o recorte de tarefas de uma TRILHA do cursinho (PDF semanal do Estratégia).
// A trilha numera as metas ("TAREFA 01"…) dentro de seções por matéria; esse número é a ordem.
// A tabela "SUGESTÃO DE CRONOGRAMA" é ignorada de propósito — o que importa são as tarefas.
//
// uso: node dev/teste-trilha.mjs <arquivo.txt|arquivo.pdf>
import { readFileSync } from "node:fs";
import { pareceTrilha, interpretarTrilha } from "../src/ia.js";

const arq = process.argv[2];
if (!arq) throw new Error("uso: node dev/teste-trilha.mjs <arquivo.txt>");
let texto = readFileSync(arq, "utf8");
if (/\.pdf$/i.test(arq)) throw new Error("passe o TXT já extraído (o extrator de PDF roda no navegador)");

console.log(`reconhecido como trilha: ${pareceTrilha(texto)}`);
const t = interpretarTrilha(texto);
console.log(`${t.length} tarefas, na ordem do arquivo:\n`);
let ordemOk = true;
t.forEach((x, i) => {
  if (x.numero !== i + 1) ordemOk = false;
  console.log(`  ${String(x.numero).padStart(2, "0")}  ${x.titulo.slice(0, 96)}`);
  if (x.observacao) console.log(`      obs: ${x.observacao.replace(/\n/g, " · ").slice(0, 88)}`);
});
console.log(`\nnumeração contínua de 1 a ${t.length}: ${ordemOk ? "sim" : "NÃO — conferir"}`);
const semInstrucao = t.filter((x) => !x.titulo.includes(" — "));
if (semInstrucao.length) console.log(`⚠ ${semInstrucao.length} sem instrução: ${semInstrucao.map((x) => x.numero).join(", ")}`);
