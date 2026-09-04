// Teste: a senha do cofre é a única credencial que existe, e o servidor não pode deixar um
// aparelho apagar o que o outro acabou de gravar.
//
// A senha deriva o ENDEREÇO (`cofreId`) e a CHAVE de cifra. Não há conta, e-mail, segundo fator
// nem recuperação. O mínimo era 6 caracteres, que está nas primeiras linhas de qualquer lista de
// dicionário: quem adivinhasse lia e SOBRESCREVIA o estudo inteiro, em qualquer aparelho.
//
// O `cofreId` continua sendo SHA-256 da senha, de propósito — o porquê está no comentário longo
// em `sync-nuvem.js`, e este teste trava a decisão para ela não ser desfeita sem querer.
//
// Uso: node dev/teste-cofre.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const ler = (p) => readFileSync(resolve(aqui, "..", p), "utf8");
const erros = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };

const sync = ler("src/sync-nuvem.js");

// ---- 1. Senha forte na CRIAÇÃO, e só na criação ---------------------------------------------
ok(/const MIN_SENHA = 12;/.test(sync), "o mínimo da senha do cofre deve subir para 12");
ok(!/frase\.length < 6/.test(sync), "o mínimo de 6 caracteres não pode voltar");
ok(/if \(!env\) conferirSenha\(frase\);/.test(sync),
  "a exigência vale só quando o cofre NÃO existe (é criação)");
// Esta é a parte que mais importa: quem já tem cofre com senha curta NÃO pode ser trancado fora.
const blocoRestaurar = sync.slice(sync.indexOf("export async function restaurarDaNuvem"));
ok(!/conferirSenha/.test(blocoRestaurar.slice(0, 700)),
  "restaurar NÃO pode exigir senha forte: trancaria o usuário para fora do próprio cofre");
ok(/senha-fraca/.test(sync), "entrar num cofre existente com senha curta deve avisar, sem bloquear");

// ---- 2. O gerador de frase-senha -------------------------------------------------------------
ok(/export function sugerirFraseSenha/.test(sync), "deve haver um gerador de frase-senha");
ok(/crypto\.getRandomValues/.test(sync), "o sorteio tem de usar aleatoriedade do sistema");
// Só o código: o comentário cita `Math.random` para explicar por que não se usa.
const codigoSync = sync.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
ok(!/Math\.random/.test(codigoSync), "Math.random é previsível e não serve para gerar senha");
// A frase gerada tem de passar no próprio mínimo — senão o app sugeriria algo que ele recusa.
const lista = (sync.match(/const PALAVRAS = \("([^"]+)"\)/) || [])[1] || "";
const palavras = lista.split(" ").filter(Boolean);
ok(palavras.length >= 100, `a lista de palavras deve ser grande o bastante (tem ${palavras.length})`);
const menores = [...palavras].sort((a, b) => a.length - b.length).slice(0, 4);
const piorCaso = menores.join("-").length + 3; // 4 palavras + "-" + 2 dígitos
ok(piorCaso >= 12, `no pior caso a frase gerada tem ${piorCaso} caracteres, abaixo do mínimo de 12`);
ok(!/[áâãàéêíóôõúüç]/i.test(lista), "as palavras não devem ter acento (erro de digitação = cofre perdido)");
ok(new Set(palavras).size === palavras.length, "não pode haver palavra repetida na lista (reduz a entropia real)");

// ---- 3. A decisão de NÃO mexer no cofreId, registrada ---------------------------------------
ok(/AUD-06/.test(sync), "a decisão sobre o id do cofre tem de estar documentada no código");
ok(/não existe oráculo offline|Não existe oráculo offline/.test(sync),
  "o motivo tem de estar escrito: o ataque é limitado pela rede, não pela CPU");

// ---- 4. Gravação condicional (If-Match) -----------------------------------------------------
const fn = ler("functions/v1/cofre/[id].js");
ok(/ETag: obj\.httpEtag/.test(fn), "o GET deve devolver o ETag da versão lida");
ok(/onlyIf: \{ etagMatches/.test(fn), "o PUT deve gravar condicionalmente quando vier If-Match");
ok(/412/.test(fn), "a gravação recusada deve responder 412, não 200");
ok(/"Access-Control-Allow-Headers": "Content-Type, Accept, If-Match"/.test(fn),
  "o CORS precisa permitir If-Match, senão o navegador barra a requisição antes de sair");
ok(/"Access-Control-Expose-Headers": "ETag"/.test(fn),
  "o CORS precisa EXPOR o ETag, senão o JavaScript não consegue lê-lo");

// O cliente tem de usar os dois lados.
ok(/etagLido = resp\.headers\.get\("ETag"\)/.test(sync), "o app deve guardar o ETag que leu");
ok(/"If-Match": etagLido/.test(sync), "o app deve mandar o If-Match na subida");
ok(/resp\.status === 412/.test(sync), "o app tem de tratar o 412 (e não como erro genérico)");
ok(/Nada foi perdido/.test(sync), "a mensagem do conflito deve dizer que nada se perdeu");

// Sem If-Match, o servidor grava como antes: aparelho em versão antiga não pode parar de sincronizar.
ok(/Sem o cabeçalho, o comportamento é o de sempre/.test(fn),
  "a gravação condicional tem de ser opcional (compatibilidade com aparelho na versão antiga)");

if (erros.length) {
  console.error("FALHOU:\n- " + erros.join("\n- "));
  process.exit(1);
}
console.log("OK — senha forte na criação (sem trancar quem já tem cofre) e gravação condicional no servidor");
