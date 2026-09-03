// Teste: gravação que falha não pode ser invisível, e duas gravações não podem se atropelar.
//
// Dois defeitos no mesmo lugar (`store.persist`):
//  1. `saveState` devolve `false` quando a gravação falha (cota do IndexedDB estourada, disco
//     cheio, mutex do SQLite envenenado). O `persist` DESCARTAVA esse retorno e só sobrava um
//     `console.error` — o aluno estudava a noite inteira e o dia não tinha sido gravado.
//  2. O `persist` disparava a gravação nova por cima da anterior, sem esperar. O estado é
//     reescrito INTEIRO a cada gravação (centenas de ms com biblioteca de cursinho): duas
//     escritas em voo podiam terminar fora de ordem e deixar no disco a versão mais VELHA.
//
// `store.js` não é importável fora do navegador (puxa ícones .svg). A parte 1 confere o fonte;
// a parte 2 exercita a mecânica de encadeamento de verdade, reproduzida aqui.
//
// Uso: node dev/teste-gravacao.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ehErroDeEspaco } from "../src/persistence.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const store = readFileSync(resolve(aqui, "../src/store.js"), "utf8");
const main = readFileSync(resolve(aqui, "../src/main.js"), "utf8");
const erros = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };

// ---- 1. A regressão proibida e as guardas -----------------------------------------------
ok(!/gravacaoEmVoo = \(async \(\) => \{\s*await salvarEmbeddingsSujos\(\);\s*await salvarPaginasSujas\(\);\s*await saveState\(state\);\s*\}\)\(\);/.test(store),
  "persist não pode ignorar o retorno de saveState nem disparar por cima da gravação anterior");
ok(/const ok = await saveState\(state\);\s*\n\s*avisarGravacao/.test(store),
  "persist deve LER o retorno de saveState e avisar a interface");
ok(/gravacaoEmVoo = Promise\.resolve\(gravacaoEmVoo\)\.catch\(\(\) => \{\}\)\.then/.test(store),
  "persist deve ENCADEAR na gravação anterior (uma escrita por vez)");
ok(/gravacaoPendente\(\)/.test(store) && /tentarGravarDeNovo\(\)/.test(store),
  "o store deve expor o estado da falha e um retry para a tela");
ok(/gravarAgora\(\)/.test(store), "o store deve permitir antecipar a gravação (fechamento)");

// A tela precisa reagir — e com aviso PERSISTENTE, não toast que some em 3 s.
ok(/mentor:gravacao/.test(main), "main.js deve ouvir o aviso de falha de gravação");
ok(/aviso-gravacao/.test(main), "main.js deve mostrar a faixa persistente de falha");
ok(/store\.gravarAgora\(\)/.test(main), "o fechamento deve antecipar a gravação local");
ok(main.indexOf("store.gravarAgora()") < main.indexOf("sincronizarNuvemAoFechar(), new Promise"),
  "no desktop, gravar localmente ANTES de subir para o cofre");

// ---- 2. Erro de espaço é reconhecido ----------------------------------------------------
const quota = new Error("The quota has been exceeded.");
quota.name = "QuotaExceededError";
ok(ehErroDeEspaco(quota), "QuotaExceededError deve ser reconhecido como falta de espaço");
ok(ehErroDeEspaco(new Error("disk is full")), "disco cheio deve ser reconhecido como falta de espaço");
ok(!ehErroDeEspaco(new Error("mutex poisoned")), "erro de mutex NÃO é falta de espaço");
ok(!ehErroDeEspaco(null), "erro ausente não pode ser tratado como falta de espaço");

// ---- 3. O encadeamento, exercitado ------------------------------------------------------
// Reproduz a mecânica do persist: cada gravação espera a anterior, e a ORDEM de término é a
// ordem de início — mesmo quando a primeira demora muito mais que a segunda.
const ordemFim = [];
let emVoo = null;
const gravar = (id, ms) => {
  emVoo = Promise.resolve(emVoo).catch(() => {}).then(
    () => new Promise((r) => setTimeout(() => { ordemFim.push(id); r(true); }, ms))
  );
  return emVoo;
};
gravar("lenta", 40);
gravar("rapida", 1);
await emVoo;
ok(ordemFim.join(",") === "lenta,rapida",
  `a gravação lenta tem de terminar antes da rápida que veio depois (foi "${ordemFim.join(",")}")`);

// Falha no meio não pode travar a fila: a próxima gravação ainda precisa acontecer.
const depois = [];
let emVoo2 = Promise.reject(new Error("cota estourada"));
emVoo2 = Promise.resolve(emVoo2).catch(() => {}).then(() => { depois.push("gravou"); return true; });
await emVoo2;
ok(depois.length === 1, "uma gravação que falhou não pode impedir a seguinte");

// ---- resultado ---------------------------------------------------------------------------
if (erros.length) {
  console.error("FALHOU:\n- " + erros.join("\n- "));
  process.exit(1);
}
console.log("OK — falha de gravação aparece na tela e as gravações não se atropelam");
