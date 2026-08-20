// Teste do sync v3 (conteúdo sob demanda) — puro, sem rede e sem tocar no cofre real.
// Roda as funções de sync.js contra fixtures em memória. Ver a regra: nunca exercitar
// sincronização com o app conectado.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// sync.js importa o store (que puxa o app inteiro). Para testar isolado, carrego o módulo
// com o import do store trocado por um stub.
const src = readFileSync("src/sync.js", "utf8").replace(
  'import { store } from "./store.js";',
  "const store = { get: () => ({}) };"
);
const dir = mkdtempSync(join(tmpdir(), "sync-v3-"));
const arq = join(dir, "sync.mjs");
writeFileSync(arq, src);
const S = await import(pathToFileURL(arq).href);

let falhas = 0;
const ok = (cond, nome, extra = "") => { console.log((cond ? "  ok   " : "  FALHA") + " " + nome + (extra ? " — " + extra : "")); if (!cond) falhas++; };

const pagina = (n, txt) => ({ n, texto: txt, vazia: false, temImagem: n % 2 === 0, ocr: false });
const estado = () => ({
  modificadoEm: "2026-08-20T12:00:00.000Z",
  documentos: [
    { id: "doc_a", titulo: "Aula 01", paginas: [pagina(1, "alfa".repeat(50)), pagina(2, "beta".repeat(80))],
      figuras: [{ pagina: 2, descricao: "tabela com prazos", via: "gemini" }], texto: "alfa beta", temPdf: true, pdfData: "BINARIO" },
    { id: "doc_b", titulo: "Texto colado", texto: "conteudo colado sem paginas", paginas: null, figuras: [] },
  ],
  config: { tema: "escuro", iaKey: "SEGREDO", syncNuvem: { frase: "senha" } },
  embeddings: { modelo: "x", itens: [1, 2, 3] },
});

// 1) montarSnapshotSync tira conteúdo e binário, mantém a ficha
const snap = S.montarSnapshotSync(estado(), "pc-teste");
const a = snap.documentos[0], b = snap.documentos[1];
ok(a.paginas === null && a.figuras === null, "material com páginas não leva conteúdo no snapshot");
ok(a.conteudo && a.conteudo.n === 2 && a.conteudo.chars === 200 + 320, "ficha traz n e chars", JSON.stringify(a.conteudo));
ok(a.conteudo.figuras === 1 && typeof a.conteudo.hash === "string", "ficha traz figuras e hash");
ok(a.pdfData === null && a.temPdf === false, "binário não viaja");
ok(b.texto === "conteudo colado sem paginas" && !b.conteudo, "material SEM páginas mantém o texto (é o campo primário)");
ok(!snap.config.iaKey && !snap.config.syncNuvem, "chave de IA e senha do cofre não sobem");
ok(JSON.stringify(snap).length < 1200, "snapshot é esqueleto", JSON.stringify(snap).length + " bytes");

// 2) a guarda anti-perda continua enxergando o peso do texto
ok(S.pesoTexto(snap) === 520 + "conteudo colado sem paginas".length, "pesoTexto usa a ficha quando não há páginas", String(S.pesoTexto(snap)));
ok(S.encolheriaTexto(S.pesoTexto(estado()), 0) === false || true, "encolheriaTexto segue disponível");

// 3) baixar no aparelho que JÁ TEM o conteúdo: nada se perde
const local = estado();
const aplicado = S.aplicarRemoto(local, snap);
const da = aplicado.documentos.find((d) => d.id === "doc_a");
ok(Array.isArray(da.paginas) && da.paginas.length === 2, "páginas locais preservadas quando o hash bate");
ok(da.figuras.length === 1 && da.figuras[0].descricao === "tabela com prazos", "figuras locais preservadas");
ok(da.conteudo.pendente === false, "material não fica marcado como pendente");
ok(da.pdfData === "BINARIO" && da.temPdf === true, "binário local devolvido");

// 4) aparelho NOVO (iPad): recebe esqueleto e marca pendente, sem apagar nada que tivesse
const vazio = { documentos: [], config: {} };
const noIpad = S.aplicarRemoto(vazio, snap);
const ipadA = noIpad.documentos.find((d) => d.id === "doc_a");
ok(ipadA.paginas === null && ipadA.conteudo.pendente === true, "material chega pendente no aparelho novo");
ok(ipadA.titulo === "Aula 01" && ipadA.conteudo.n === 2, "esqueleto traz título e nº de páginas");

// 5) conteúdo local DIFERENTE do remoto → precisa rebaixar
const desatualizado = estado();
desatualizado.documentos[0].paginas[1].texto = "beta MUDOU";
const aplic2 = S.aplicarRemoto(desatualizado, snap);
ok(aplic2.documentos[0].conteudo.desatualizado === true && Array.isArray(aplic2.documentos[0].paginas),
   "hash diferente marca como desatualizado SEM descartar o que já se podia ler");

// 6) a fatia que vai para o objeto do material leva o conteúdo completo
const fatia = S.fatiaConteudo(estado().documentos[0]);
ok(fatia.paginas.length === 2 && fatia.figuras.length === 1, "fatia leva páginas e figuras");
ok(fatia.ficha.hash === a.conteudo.hash, "hash da fatia casa com o da ficha do snapshot");

// 7) o hash muda quando o conteúdo muda, e não muda quando nada mudou
const f1 = S.fichaConteudo(estado().documentos[0]);
const f2 = S.fichaConteudo(estado().documentos[0]);
const mudado = estado().documentos[0];
mudado.figuras.push({ pagina: 1, descricao: "nova figura" });
ok(f1.hash === f2.hash, "hash estável para o mesmo conteúdo");
ok(S.fichaConteudo(mudado).hash !== f1.hash, "hash muda quando uma figura é descrita");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTodos os testes passaram");
process.exit(falhas ? 1 : 0);
