// Teste: falha ao LER as páginas de um material não pode virar "material sem conteúdo".
//
// Este é o mecanismo real por trás do "material oco" — e não é onde a auditoria original
// apontava. A gravação já estava protegida: `setBlob` falhando põe `blobsOk = false`, e
// `estadoParaGravar` só enxuga as páginas quando `blobsOk` é true. O furo é na LEITURA:
// `getBlob` engolia o erro e devolvia `null`, indistinguível de "não há blob guardado".
//
// Consequência: o material abre VAZIO na tela, ainda que a chave `pag:` esteja intacta no
// disco. E a reação natural de quem vê a apostila vazia — "Atualizar com arquivo novo" —
// RELÊ o arquivo e apaga o que a Visão transcreveu das páginas escaneadas. Aí, sim, há perda.
//
// Uso: node dev/teste-paginas-ilegiveis.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { estadoParaGravar, lerBlob } from "../src/persistence.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const store = readFileSync(resolve(aqui, "../src/store.js"), "utf8");
const docs = readFileSync(resolve(aqui, "../src/screens/documentos.js"), "utf8");
const erros = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };

// ---- 1. lerBlob distingue ausência de falha ----------------------------------------------
// Sem armazenamento (é o caso deste ambiente), a resposta é AUSÊNCIA — não falha.
const semNada = await lerBlob("pag:doc_1");
ok(semNada.ok === true && semNada.valor === null,
  "sem armazenamento, lerBlob deve dizer ausência (ok:true, valor:null), não falha");
const idVazio = await lerBlob("");
ok(idVazio.ok === true, "id vazio é ausência, não falha");

// ---- 2. o restaurarPaginas separa os dois casos -------------------------------------------
ok(/const \{ ok, valor: guardado \} = await lerBlob\(`pag:\$\{d\.id\}`\);/.test(store),
  "restaurarPaginas deve usar lerBlob (que distingue), não getBlob (que engole o erro)");
ok(/if \(!ok\) \{\s*\n\s*d\.leituraFalhou = true;\s*\n\s*continue;/.test(store),
  "falha de leitura deve MARCAR o material, e não passar como material sem conteúdo");
// A regressão: voltar a marcar como "já gravado" um material que não foi lido.
const trecho = store.slice(store.indexOf("async function restaurarPaginas"), store.indexOf("async function salvarPaginasSujas"));
ok(trecho.indexOf("d.leituraFalhou = true") < trecho.indexOf("pagsSalvas.set"),
  "o material com leitura falha não pode ser marcado em `pagsSalvas` (nada foi conferido)");

// ---- 3. a marca é de SESSÃO: não pode ser gravada -----------------------------------------
const estado = {
  perfis: [{
    id: "p1",
    documentos: [
      { id: "d1", titulo: "Apostila que não abriu", texto: "", paginas: null, leituraFalhou: true },
      { id: "d2", titulo: "Apostila normal", texto: "a\n\nb", paginas: [{ n: 1, texto: "a" }, { n: 2, texto: "b" }] },
    ],
  }],
  config: {},
};
const gravado = estadoParaGravar(estado, { blobs: true });
const g1 = gravado.perfis[0].documentos[0];
ok(g1.leituraFalhou === undefined,
  "`leituraFalhou` não pode ir para o disco — a falha de hoje viraria estado permanente");
ok(estado.perfis[0].documentos[0].leituraFalhou === true,
  "o objeto VIVO em memória tem de continuar marcado (a tela depende disso nesta sessão)");
// O material normal continua sendo enxugado como antes.
ok(gravado.perfis[0].documentos[1].paginas === undefined,
  "material lido normalmente continua com as páginas fora do estado");

// ---- 4. a tela avisa, e a ação destrutiva é barrada ---------------------------------------
ok(/d\.leituraFalhou/.test(docs), "o cartão do material deve mostrar que o conteúdo não abriu");
ok(/doc-ilegivel/.test(docs), "deve haver marca visual própria para o material que não abriu");
ok(/if \(d && d\.leituraFalhou\) \{[\s\S]{0,400}confirmar\(/.test(docs),
  "«Atualizar material» deve pedir confirmação quando o conteúdo não abriu (relê o arquivo e apaga a transcrição da Visão)");

// ---- resultado ---------------------------------------------------------------------------
if (erros.length) {
  console.error("FALHOU:\n- " + erros.join("\n- "));
  process.exit(1);
}
console.log("OK — falha de leitura das páginas é marcada, não gravada, e não vira perda");
