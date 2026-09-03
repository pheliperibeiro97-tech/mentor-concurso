// Teste: questão sem gabarito NÃO pode virar a alternativa "A".
//
// Existe porque o app inventava o gabarito em silêncio. O parser de colagem procura o `*` na
// alternativa correta; não achando, fazia `gabarito = 0` — a letra A no múltipla escolha. O
// aluno então estudava, "errava" e memorizava uma resposta que o app tinha inventado, e o erro
// ainda entrava no caderno de erros como se fosse dele. É o único defeito da auditoria que o
// aluno não teria como detectar sozinho: um estado corrompido se restaura, memória mal fixada não.
//
// `store.js` não é importável fora do navegador (puxa ícones .svg), então o teste reproduz o
// parser a partir do FONTE e guarda as regras que não podem voltar atrás.
//
// Uso: node dev/teste-gabarito.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const store = readFileSync(resolve(aqui, "../src/store.js"), "utf8");
const erros = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };

// ---- 1. As regressões proibidas, no fonte -----------------------------------------------
// Cada uma destas linhas JÁ existiu e inventava o gabarito.
ok(!/if \(gabarito < 0\) gabarito = 0;/.test(store),
  "parser não pode transformar `sem *` em gabarito 0 (alternativa A)");
ok(!/let gabarito = Number\(q\.gabarito\) \|\| 0;/.test(store),
  "aceitarQuestoes não pode cair em 0 quando o gabarito não veio");
ok(!/gabarito: Number\.isInteger\(gabarito\) \? gabarito : 0,/.test(store),
  "addQuestao não pode cair em 0 quando o gabarito não é inteiro");

// ---- 2. As guardas que têm de existir ---------------------------------------------------
ok(/const gabaritoValido = Number\.isInteger\(gabarito\) && gabarito >= 0 && gabarito < alts\.length;/.test(store),
  "addQuestao deve validar o gabarito contra as alternativas");
ok(/if \(!gabaritoValido && !anulada\) \{/.test(store),
  "addQuestao deve RECUSAR item sem gabarito válido (exceto questão anulada)");
ok(/semGabarito\+\+; continue;/.test(store),
  "aceitarQuestoes deve pular (e contar) o item sem gabarito");
ok(/if \(gabarito < 0\) \{ recusadas\+\+; continue; \}/.test(store),
  "importQuestoes deve pular (e contar) a linha sem `*`");

// A prova oficial sem gabarito continua entrando como ANULADA (fora da pontuação) — é
// comportamento deliberado do importador de provas, não pode ser derrubado junto.
ok(/anulada: !!q\.anulada \|\| !!q\.semGabarito,/.test(store),
  "prova oficial sem gabarito deve continuar entrando marcada como anulada");

// ---- 3. O parser, reproduzido ------------------------------------------------------------
// Mesma lógica de prepararQuestoes: `null` quando não há `*`.
function gabaritoDaLinha(linha) {
  const partes = linha.split("|").map((p) => p.trim()).filter(Boolean);
  if (partes.length < 3) return undefined; // linha ignorada
  const alts = partes.slice(1).filter((p) => !/^(ref|assunto|banca|ano|orgao):/i.test(p));
  if (alts.length < 2) return undefined;
  const achado = alts.findIndex((a) => a.startsWith("*"));
  return achado < 0 ? null : achado;
}
ok(gabaritoDaLinha("Quem promulga? | Congresso | *Presidente | STF") === 1,
  "com `*`, o gabarito é o índice da alternativa marcada");
ok(gabaritoDaLinha("Quem promulga? | Congresso | Presidente | STF") === null,
  "sem `*`, o gabarito é null — NÃO é 0");
ok(gabaritoDaLinha("Enunciado | *Primeira | b | c") === 0,
  "`*` na primeira alternativa continua valendo 0 (não confundir com ausência)");
ok(gabaritoDaLinha("Enunciado | a | b | ref: Lei 8.112") === null,
  "campo `ref:` não conta como alternativa nem como gabarito");

// ---- 4. A tela ---------------------------------------------------------------------------
const tela = readFileSync(resolve(aqui, "../src/screens/questoes-add.js"), "utf8");
ok(/gabRadio \? parseInt\(gabRadio\.getAttribute\("data-a"\), 10\) : null/.test(tela),
  "o preview deve ler `null` quando nenhum rádio está marcado");
ok(/q\.gabarito == null/.test(tela),
  "o preview deve marcar visualmente a questão sem gabarito");
ok(/semGab\)/.test(tela) && /antes de adicionar/.test(tela),
  "o preview deve BARRAR o Adicionar enquanto houver questão sem gabarito");

// ---- resultado ---------------------------------------------------------------------------
if (erros.length) {
  console.error("FALHOU:\n- " + erros.join("\n- "));
  process.exit(1);
}
console.log("OK — questão sem gabarito não entra e não vira alternativa A");
