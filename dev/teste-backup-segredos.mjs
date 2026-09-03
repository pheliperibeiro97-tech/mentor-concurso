// Teste do que NÃO pode sair num backup compartilhável — a chave da IA e a senha do cofre.
//
// Existe porque o furo já esteve aberto: `sync.js` retirava a config local do snapshot que
// sobe para a nuvem, mas `store.snapshotExport(false)` — o "Backup compartilhável" — só
// limpava o material. O arquivo saía com `config.iaKey` e `config.syncNuvem` dentro, e a
// senha do cofre é a IDENTIDADE do cofre: quem a recebe lê e SOBRESCREVE o estudo do dono.
// A interface, enquanto isso, anunciava o botão como "Seguro para compartilhar".
//
// `store.js` não é importável fora do navegador (puxa ícones .svg), então o teste tem duas
// partes: a função pura de verdade, e uma guarda de fonte que falha se alguém tirar a
// chamada de dentro do `snapshotExport`.
//
// Uso: node dev/teste-backup-segredos.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { CONFIG_LOCAL, limparConfigLocal } from "../src/config-local.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const erros = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };

// ---- 1. A função pura -------------------------------------------------------------------
const fatia = {
  config: {
    tema: "escuro",
    iaKey: "AIzaSy-CHAVE-REAL-DO-ALUNO",
    iaKeyReserva: "AIzaSy-RESERVA",
    iaProvider: "gemini",
    iaModelo: "gemini-2.5-flash",
    syncNuvem: { conectado: true, frase: "senha-do-cofre", dispositivo: "PC" },
    sync: { handle: "x" },
  },
  topicos: [{ id: "t1" }],
};
const original = JSON.parse(JSON.stringify(fatia));
const limpo = limparConfigLocal(JSON.parse(JSON.stringify(fatia)));

for (const k of CONFIG_LOCAL) {
  ok(limpo.config[k] === undefined, `\`config.${k}\` deveria sair do backup compartilhável`);
}
ok(limpo.config.tema === "escuro", "o que NÃO é segredo (tema) deveria continuar no backup");
ok(limpo.topicos.length === 1, "os dados de estudo deveriam continuar no backup");

// Nenhuma das chaves pode sobreviver em lugar nenhum do JSON serializado.
const serializado = JSON.stringify(limpo);
ok(!serializado.includes("AIzaSy"), "nenhuma chave de API pode aparecer no JSON exportado");
ok(!serializado.includes("senha-do-cofre"), "a senha do cofre não pode aparecer no JSON exportado");

// Não pode mutar o estado vivo: quem chama passa um clone, mas a função não deve contar com isso
// para o objeto de fora.
const vivo = JSON.parse(JSON.stringify(original));
limparConfigLocal({ ...vivo, config: { ...vivo.config } });
ok(vivo.config.iaKey === original.config.iaKey, "limparConfigLocal não pode mexer no objeto de origem");

// Fatia sem config (perfil, por exemplo) não pode quebrar.
ok(limparConfigLocal({ topicos: [] }) !== null, "fatia sem config deveria passar sem erro");
ok(limparConfigLocal(null) === null, "null deveria passar sem erro");

// ---- 2. Guarda de fonte: o snapshotExport tem de usar a função ---------------------------
const store = readFileSync(resolve(aqui, "../src/store.js"), "utf8");
const corpo = store.slice(store.indexOf("snapshotExport("), store.indexOf("snapshotExport(") + 1200);
ok(corpo.includes("limparConfigLocal"), "snapshotExport deve limpar a config local do backup compartilhável");
ok(!/snapshotExport\([^)]*\)\s*\{\s*if \(comMaterial\) return state;/.test(store),
  "snapshotExport não pode devolver o `state` vivo — tem de clonar sempre");

const sync = readFileSync(resolve(aqui, "../src/sync.js"), "utf8");
ok(sync.includes('from "./config-local.js"'), "sync.js deve usar a MESMA lista do backup (config-local.js)");

// ---- resultado ---------------------------------------------------------------------------
if (erros.length) {
  console.error("FALHOU:\n- " + erros.join("\n- "));
  process.exit(1);
}
console.log(`OK — backup compartilhável não leva segredo (${CONFIG_LOCAL.length} chaves conferidas)`);
