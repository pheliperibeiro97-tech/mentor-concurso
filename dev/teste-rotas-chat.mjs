// Teste: o chat tem de saber abrir TODAS as telas do app, com os nomes da barra.
//
// `main.js` tem o `ROTAS` (a verdade) e `chat-acoes.js` tinha uma segunda lista, escrita à mão.
// As duas divergiram: faltavam Simulados, Mapas mentais, Revisões, o Guia e o "Por onde
// começar", então pedir "abre os simulados" ao Mentor respondia "qual tela você quer abrir?".
// E o chat chamava a tela de Escrita de "Discursiva", nome que a barra abandonou.
//
// A lista continua duplicada de propósito (importar `main.js` fecharia um ciclo de módulos:
// main → chat → chat-acoes → main). Quem impede a divergência é este teste.
//
// Uso: node dev/teste-rotas-chat.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const erros = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };

// ---- Lê o ROTAS do main.js (id + label) -----------------------------------------------------
const main = readFileSync(resolve(aqui, "../src/main.js"), "utf8");
const bloco = main.slice(main.indexOf("const ROTAS = ["), main.indexOf("];", main.indexOf("const ROTAS = [")));
const doApp = new Map();
for (const m of bloco.matchAll(/\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)) doApp.set(m[1], m[2]);
ok(doApp.size >= 20, `deveria achar as rotas do main.js (achei ${doApp.size})`);

// ---- Lê o NOME_TELA do chat-acoes.js --------------------------------------------------------
const chat = readFileSync(resolve(aqui, "../src/chat-acoes.js"), "utf8");
const blocoChat = chat.slice(chat.indexOf("const NOME_TELA = {"), chat.indexOf("};", chat.indexOf("const NOME_TELA = {")));
const doChat = new Map();
for (const m of blocoChat.matchAll(/"?([\w-]+)"?:\s*"([^"]+)"/g)) doChat.set(m[1], m[2]);
ok(doChat.size >= 20, `deveria achar as telas do chat (achei ${doChat.size})`);

// ---- 1. Nenhuma tela do app pode faltar no chat ---------------------------------------------
const faltando = [...doApp.keys()].filter((id) => !doChat.has(id));
ok(faltando.length === 0, `o chat não sabe abrir: ${faltando.join(", ")}`);

// ---- 2. Nem sobrar rota que não existe ------------------------------------------------------
const sobrando = [...doChat.keys()].filter((id) => !doApp.has(id));
ok(sobrando.length === 0, `o chat oferece tela inexistente: ${sobrando.join(", ")}`);

// ---- 3. Os nomes têm de ser os mesmos -------------------------------------------------------
const divergentes = [];
for (const [id, label] of doApp) {
  const noChat = doChat.get(id);
  if (noChat && noChat !== label) divergentes.push(`${id}: barra diz "${label}", chat diz "${noChat}"`);
}
ok(divergentes.length === 0, `nomes diferentes entre a barra e o chat:\n    ${divergentes.join("\n    ")}`);

// ---- 4. A regressão nomeada: "Discursiva" morreu quando a tela virou "Escrita" ---------------
ok(!/Discursiva/.test(blocoChat), 'o chat não pode chamar a tela de Escrita de "Discursiva"');

// ---- 5. A lista de rotas válidas deriva dos nomes, não é uma terceira cópia ------------------
ok(/const ROTAS_VALIDAS = new Set\(Object\.keys\(NOME_TELA\)\)/.test(chat),
  "ROTAS_VALIDAS deve derivar de NOME_TELA (senão viram três listas para manter)");

if (erros.length) {
  console.error("FALHOU:\n- " + erros.join("\n- "));
  process.exit(1);
}
console.log(`OK — o chat abre as ${doApp.size} telas do app, com os nomes da barra`);
