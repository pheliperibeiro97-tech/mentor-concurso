// `npm test` — roda a suíte inteira e devolve código de saída diferente de zero se algo quebrar.
//
// Existe porque os testes estavam escritos e ninguém os disparava: dependiam de alguém lembrar
// de rodar `node dev/teste-x.mjs` um por um. Foi assim que três testes de sincronização ficaram
// quebrados sem ninguém notar (um `import` novo em `sync.js` que o harness deles não copiava).
//
// Uso: npm test  ·  npm test -- --so=cofre,gabarito
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..");

// Estes dois dependem de arquivos de dados que não estão no repositório (`base-edital.json` e
// companhia). Ficam de fora por padrão para o `npm test` significar algo: uma suíte que sempre
// tem duas falhas conhecidas ensina a ignorar falhas.
const SEM_DADOS = new Set(["teste-trilha.mjs", "teste-incidencia.mjs"]);

const filtro = (process.argv.find((a) => a.startsWith("--so=")) || "").slice(5).split(",").filter(Boolean);

const arquivos = readdirSync(aqui)
  .filter((f) => f.startsWith("teste-") && f.endsWith(".mjs"))
  .filter((f) => !SEM_DADOS.has(f))
  .filter((f) => !filtro.length || filtro.some((p) => f.includes(p)))
  .sort();

let falharam = [];
const t0 = Date.now();
for (const f of arquivos) {
  const nome = f.replace(/^teste-|\.mjs$/g, "");
  const r = spawnSync(process.execPath, [resolve(aqui, f)], { cwd: raiz, encoding: "utf8" });
  const ok = r.status === 0;
  process.stdout.write(`${ok ? "  ok  " : "  FALHA"} ${nome}\n`);
  if (!ok) {
    falharam.push(nome);
    // A saída do que falhou aparece na hora: procurar depois qual foi é atrito que faz a
    // pessoa parar de rodar a suíte.
    const saida = ((r.stdout || "") + (r.stderr || "")).trim();
    if (saida) process.stdout.write(saida.split("\n").map((l) => "         " + l).join("\n") + "\n");
  }
}

const seg = ((Date.now() - t0) / 1000).toFixed(1);
if (falharam.length) {
  console.error(`\n${falharam.length} de ${arquivos.length} falharam em ${seg}s: ${falharam.join(", ")}`);
  process.exit(1);
}
console.log(`\n${arquivos.length} testes passaram em ${seg}s.`);
if (SEM_DADOS.size) console.log(`(fora da suíte, por falta de arquivos de dados: ${[...SEM_DADOS].join(", ")})`);
