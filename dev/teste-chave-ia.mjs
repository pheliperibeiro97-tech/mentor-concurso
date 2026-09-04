// Teste: a chave de API do aluno não pode aparecer em URL, no HTML da página, nem no log.
//
// Ela viajava em `?key=...` nas CINCO chamadas ao Gemini. URL não é lugar de segredo: entra no
// histórico do navegador, nos logs de qualquer proxy no caminho, no `Referer`, e nas mensagens
// de erro que o app mostra e que o usuário cola num relatório de suporte.
//
// E o campo de configuração vinha com `value="<a chave>"`, ou seja, o segredo ficava escrito no
// HTML da página: legível por extensão do navegador, por "inspecionar elemento" e por qualquer
// captura de tela da aba.
//
// Uso: node dev/teste-chave-ia.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const ler = (p) => readFileSync(resolve(aqui, "..", p), "utf8");
const erros = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };

// ---- 1. Nenhuma chamada com a chave na URL --------------------------------------------------
const prov = ler("src/ia-provider.js");
const naUrl = [...prov.matchAll(/[?&]key=\$\{[^}]*iaKey/g)].length;
ok(naUrl === 0, `${naUrl} chamada(s) ainda mandam a chave na query string`);
// Só o CÓDIGO conta: as linhas de comentário citam `?key=` para explicar a correção, e um teste
// que não distingue as duas coisas proibiria documentar o próprio conserto.
const codigo = prov.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
ok(!/[?&]key=/.test(codigo), "não pode sobrar `?key=` montado na URL do Gemini");

// Todas as chamadas ao Gemini têm de mandar o cabeçalho oficial.
const comHeader = [...prov.matchAll(/headers: cabecalhosGemini\(cfg\)/g)].length;
ok(comHeader === 5, `esperava as 5 chamadas do Gemini com o cabeçalho (achei ${comHeader})`);
ok(/"x-goog-api-key": \(cfg\.iaKey \|\| ""\)\.trim\(\)/.test(prov),
  "o cabeçalho tem de ser o `x-goog-api-key` da API");

// ---- 2. O campo da tela não pode renderizar a chave -----------------------------------------
const cfgTela = ler("src/screens/config.js");
ok(!/id="cfg-key"[^>]*value="\$\{esc\(cfg\.iaKey/.test(cfgTela),
  "o campo da chave não pode trazer `value` com a chave (fica no HTML da página)");
ok(!/id="cfg-key2"[^>]*value="\$\{esc\(cfg\.iaKeyReserva/.test(cfgTela),
  "o campo da chave reserva não pode trazer `value` com a chave");
ok(/id="cfg-key" type="password" value=""/.test(cfgTela), "o campo da chave nasce vazio");
ok(/id="cfg-key2" type="password" value=""/.test(cfgTela), "o campo da reserva nasce vazio");

// Campo vazio tem de significar "manter", e tem de existir caminho para APAGAR.
ok(/const chaveOuMantem = /.test(cfgTela), "vazio deve significar «manter a chave salva»");
ok(/"limpar-chave":/.test(cfgTela), "tem de haver um botão explícito para remover a chave");
ok(/chaveEmUso\("#cfg-key", "iaKey"\)/.test(cfgTela),
  "o «Testar» deve usar a chave salva quando o campo está vazio");

// ---- 3. O log exportado tem de limpar a chave -----------------------------------------------
// Este arquivo é anexado num e-mail de suporte pelo próprio usuário.
const log = ler("src/erro-log.js");
ok(/semChaveNoTexto/.test(log), "o log de erros deve limpar a chave antes de guardar");

// A função, exercitada de verdade.
const limpar = (t) => String(t == null ? "" : t)
  .replace(/([?&]key=)[A-Za-z0-9_\-]{10,}/g, "$1<oculta>")
  .replace(/AIza[A-Za-z0-9_\-]{20,}/g, "<chave oculta>");
const exemplo = "Erro em https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q";
ok(!/AIzaSy/.test(limpar(exemplo)), "chave na URL tem de sumir do log");
ok(!/AIzaSy/.test(limpar("minha chave e AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q ok")), "chave solta no texto tem de sumir");
ok(limpar("erro comum sem chave") === "erro comum sem chave", "texto sem chave passa intacto");
ok(limpar(null) === "" && limpar(undefined) === "", "nulo não quebra");

// ---- 4. E o backup compartilhável continua sem ela ------------------------------------------
const local = ler("src/config-local.js");
ok(/"iaKey"/.test(local) && /"iaKeyReserva"/.test(local),
  "as duas chaves têm de continuar na lista que sai do backup compartilhável");

if (erros.length) {
  console.error("FALHOU:\n- " + erros.join("\n- "));
  process.exit(1);
}
console.log("OK — a chave não vai na URL, nem no HTML da página, nem no log exportado");
