// Mede, contra o SEU edital de verdade, a leitura da estatística de incidência de um material
// ("temas que mais caem"): quantas disciplinas foram lidas, quantos temas casaram com tópicos e
// o que ficou de fora. Roda as MESMAS funções do app (parser puro + casador com disciplina).
//
// uso: node dev/teste-incidencia.mjs <base.json>
//   base.json = { topicos:[{id,nome,disciplinaId,peso,aliases}], disciplinas:[{id,nome}], texto }
//   (exportável do app com: window.app.store.get())
import { readFileSync } from "node:fs";
import { interpretarIncidenciaPorDisciplina } from "../src/ia.js";
import { acharTopicoDoBloco, disciplinaDoMaterial } from "../src/estrutura.js";

const base = JSON.parse(readFileSync(process.argv[2] || "base-edital.json", "utf8"));
const { topicos, disciplinas, texto } = base;

// Um tema CURTO ("Recursos", "Prisões", "Organização dos Poderes") tem 1-2 palavras úteis; como a
// nota é interseção/menor conjunto e os itens do edital do TJSP são enumerações longas, UMA
// palavra em comum já dá 0,5 e passa no piso de 0,34. Para esses, exige-se conter TUDO (nota 1).
const VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "no", "na", "ao", "à", "para", "com", "seus", "suas"]);
const pisoDoTema = (tema) => {
  const n = String(tema).toLowerCase().split(/[^a-zà-ú]+/).filter((w) => w.length > 2 && !VAZIAS.has(w)).length;
  return n <= 2 ? 1 : Number(process.env.PISO || 0.5); // espelha `pisoDeTema` do store.js
};

const secoes = interpretarIncidenciaPorDisciplina(texto);
console.log(`${secoes.length} disciplinas com estatística no material · ${topicos.length} tópicos no edital\n`);

let casados = 0, temasTotal = 0;
const semTopico = [], semDisciplina = [];
const alvo = new Map();
for (const sec of secoes) {
  const disciplinaId = disciplinaDoMaterial(sec.disciplina, disciplinas);
  const soma = sec.temas.reduce((a, t) => a + t.pct, 0);
  if (!disciplinaId) {
    semDisciplina.push(sec.disciplina);
    console.log(`${sec.disciplina.padEnd(36)} ${String(sec.temas.length).padStart(2)} temas · soma ${soma.toFixed(1).padStart(5)}%  → SEM disciplina no edital`);
    continue;
  }
  let acumulado = 0, ok = 0;
  for (const t of sec.temas) {
    temasTotal++;
    acumulado += t.pct;
    const peso = acumulado <= 50 ? 95 : acumulado <= 75 ? 70 : acumulado <= 90 ? 40 : 15;
    const r = acharTopicoDoBloco(t.tema, { topicos, disciplinas, disciplinaId, minMesma: pisoDoTema(t.tema) });
    if (!r) { semTopico.push(`${sec.disciplina} · ${t.tema} (${t.pct}%)`); continue; }
    ok++; casados++;
    const top = topicos.find((x) => x.id === r.topicoId);
    const at = alvo.get(r.topicoId);
    if (!at || at.peso < peso) alvo.set(r.topicoId, { peso, nome: top?.nome, tema: t.tema, disc: sec.disciplina, pct: t.pct });
  }
  console.log(`${sec.disciplina.padEnd(36)} ${String(sec.temas.length).padStart(2)} temas · soma ${soma.toFixed(1).padStart(5)}%  → ${ok} casados (${Math.round((ok / sec.temas.length) * 100)}%)`);
}

console.log(`\ncasamento: ${casados}/${temasTotal} temas (${Math.round((casados / Math.max(1, temasTotal)) * 100)}%) · ${alvo.size} tópicos do edital receberiam nível`);
const porNivel = {};
for (const v of alvo.values()) porNivel[v.peso] = (porNivel[v.peso] || 0) + 1;
console.log("níveis:", Object.entries(porNivel).sort((a, b) => b[0] - a[0]).map(([p, n]) => `${p} → ${n}`).join(" · "));

if (semDisciplina.length) console.log(`\ndisciplinas do material fora do seu edital (${semDisciplina.length}): ${semDisciplina.join(", ")}`);
if (semTopico.length) {
  console.log(`\ntemas sem tópico correspondente (${semTopico.length}):`);
  for (const s of semTopico.slice(0, 25)) console.log("  ·", s);
  if (semTopico.length > 25) console.log(`  … e mais ${semTopico.length - 25}`);
}
console.log("\namostra do que seria gravado (10 maiores):");
for (const v of [...alvo.values()].sort((a, b) => b.peso - a.peso || b.pct - a.pct).slice(0, 10))
  console.log(`  ${String(v.peso).padStart(3)}  ${(v.nome || "").slice(0, 46).padEnd(48)} ← ${v.tema.slice(0, 34)} (${v.pct}% de ${v.disc})`);
