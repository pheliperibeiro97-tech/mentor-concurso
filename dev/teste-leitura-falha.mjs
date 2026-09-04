// Teste: leitura que FALHA não pode virar "aparelho novo".
//
// `loadState` devolvia `null` para dois casos opostos: "não há nada guardado" (aparelho novo,
// legítimo) e "não consegui ler o que está lá" (banco corrompido, JSON truncado, IndexedDB
// bloqueado). Sendo indistinguíveis, o `init` caía no `defaultState()` que já está em memória,
// o app mostrava o ONBOARDING — e a primeira gravação apagava o banco bom por cima.
//
// É o defeito mais caro da auditoria: não perde uma sessão, perde a biblioteca inteira.
//
// Uso: node dev/teste-leitura-falha.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const persistencia = readFileSync(resolve(aqui, "../src/persistence.js"), "utf8");
const store = readFileSync(resolve(aqui, "../src/store.js"), "utf8");
const main = readFileSync(resolve(aqui, "../src/main.js"), "utf8");
const erros = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };

// ---- 1. loadState distingue os dois casos ------------------------------------------------
ok(/return \{ estado: null, falhou: true, erro: err \};/.test(persistencia),
  "loadState deve marcar `falhou: true` quando a leitura dá erro");
ok(/return \{ estado: null, falhou: false, erro: null \};/.test(persistencia),
  "loadState deve devolver `falhou: false` quando simplesmente não há nada guardado");
// A regressão: qualquer caminho de erro que volte a devolver `null` seco.
ok(!/catch \(err\) \{\s*console\.error\("Falha ao carregar estado:", err\);\s*return null;\s*\}/.test(persistencia),
  "loadState não pode devolver `null` seco no catch (some a diferença entre vazio e falha)");

// ---- 2. o init trava a escrita -----------------------------------------------------------
ok(/if \(lido\.falhou\) \{/.test(store), "init deve tratar a falha de leitura à parte");
ok(/modoSomenteLeitura = true;/.test(store), "init deve travar a escrita quando a leitura falha");
ok(/function persist\(\) \{\s*\n\s*if \(modoSomenteLeitura\) return;/.test(store),
  "persist deve RECUSAR gravar em modo somente-leitura — é a trava que segura tudo");
ok(/gravarAgora\(\) \{\s*\n\s*if \(modoSomenteLeitura\) return Promise\.resolve\(false\);/.test(store),
  "gravarAgora (usado no fechamento) também deve respeitar a trava");

// ---- 3. a saída existe e não é um laço ---------------------------------------------------
ok(/async destravarEscritaComecandoDoZero\(\)/.test(store),
  "deve haver uma saída explícita do modo somente-leitura");
ok(/await resetState\(\);/.test(store),
  "começar do zero tem de LIMPAR o armazenamento — senão a abertura seguinte cai na mesma tela, para sempre");
ok(/return this\.gravarAgora\(\);/.test(store),
  "começar do zero deve devolver se a gravação funcionou (pode não haver armazenamento nenhum)");

// ---- 4. o boot mostra a tela ANTES de montar o app ---------------------------------------
ok(/if \(store\.somenteLeitura\(\)\) \{/.test(main), "o boot deve conferir o modo somente-leitura");
ok(/mostrarTelaRecuperacao\(store\.erroDeLeitura\(\)\)/.test(main), "o boot deve mostrar a tela de recuperação");
const posInit = main.indexOf("await store.init();");
const posCheck = main.indexOf("if (store.somenteLeitura())");
const posChat = main.indexOf("montarChat(store, app)");
ok(posInit < posCheck && posCheck < posChat,
  "a verificação tem de ficar ENTRE o init e a montagem do app (nada pode escrever antes)");
ok(/return; \/\/ não monta o resto do app/.test(main),
  "o boot deve PARAR ali: chat, sync e agendador não podem subir e gravar por cima");
// A verificação é direta, e não por evento: o init roda antes de qualquer listener existir.
ok(!/mentor:leitura-falhou/.test(main) && !/mentor:leitura-falhou/.test(store),
  "não usar evento para isto — o init acontece antes de os listeners serem registrados");
ok(/location\.reload\(\)/.test(main), "a tela deve oferecer tentar de novo");

// ---- resultado ---------------------------------------------------------------------------
if (erros.length) {
  console.error("FALHOU:\n- " + erros.join("\n- "));
  process.exit(1);
}
console.log("OK — leitura que falha não vira aparelho novo, e nada é gravado por cima");
