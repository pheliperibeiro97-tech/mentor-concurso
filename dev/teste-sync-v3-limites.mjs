// Auditoria adversarial do sync v3: falhas, limites e concorrência. Sem rede, sem cofre real.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const src = readFileSync("src/sync.js", "utf8").replace('import { store } from "./store.js";', "const store = { get: () => ({}) };");
const arq = join(mkdtempSync(join(tmpdir(), "sync-lim-")), "sync.mjs");
writeFileSync(arq, src);
const S = await import(pathToFileURL(arq).href);
let falhas = 0;
const ok = (c, n, extra = "") => { console.log((c ? "  ok   " : "  FALHA") + " " + n + (extra ? " — " + extra : "")); if (!c) falhas++; };
const pag = (n, t) => ({ n, texto: t, vazia: false, temImagem: false, ocr: false });
const mat = (id, txt) => ({ id, titulo: "M" + id, paginas: [pag(1, txt)], figuras: [], texto: txt });
const app = (docs, extra = {}) => ({ modificadoEm: "2026-08-20T10:00:00.000Z", documentos: docs, config: {}, ...extra });

// 1) Colisão de hash entre materiais DIFERENTES com o mesmo tamanho e mesmas pontas
// troca NO MEIO preservando tamanho e pontas — o caso que só pontas+tamanho deixaria passar
const base = "A".repeat(200) + "palavra-original" + "Z".repeat(200);
const trocado = "A".repeat(200) + "palavra-alterada" + "Z".repeat(200);
ok(S.fichaConteudo(mat("x", base)).hash !== S.fichaConteudo(mat("y", trocado)).hash,
   "1) troca no MEIO da página, com mesmo tamanho e mesmas pontas, muda o hash");
ok(S.fichaConteudo(mat("x", base)).hash === S.fichaConteudo(mat("x", base)).hash, "1) e o hash segue estável");

// 2) Material apagado no desktop: some do esqueleto? (o pacote no R2 fica órfão)
const antes = S.montarSnapshotSync(app([mat("a", "um"), mat("b", "dois")]), "pc");
const depois = S.montarSnapshotSync(app([mat("a", "um")]), "pc");
ok(depois.documentos.length === 1, "2) material apagado sai do esqueleto");
ok(antes.documentos.length === 2, "2) (o pacote do apagado fica órfão no R2 — limitação anotada)");

// 3) Estado sem materiais: a ficha não inventa peso
const vazio = S.montarSnapshotSync(app([]), "pc");
ok(S.pesoTexto(vazio) === 0, "3) app zerado tem peso de texto zero");
ok(!S.encolheriaTexto(0, 0), "3) e a guarda não dispara com dois lados vazios");

// 4) A guarda anti-perda AINDA pega o caso que a criou (conteúdo some de dentro dos materiais)
const cheio = app([mat("a", "x".repeat(60000))]);
const esvaziado = app([{ ...mat("a", ""), paginas: [pag(1, "")] }]);
ok(S.encolheriaTexto(S.pesoTexto(cheio), S.pesoTexto(esvaziado)), "4) material esvaziado ainda é detectado como perda");
// e no formato v3, com fichas
const snapCheio = S.montarSnapshotSync(cheio, "pc");
const snapVazio = S.montarSnapshotSync(esvaziado, "pc");
ok(S.encolheriaTexto(S.pesoTexto(snapCheio), S.pesoTexto(snapVazio)), "4) idem entre dois snapshots v3");

// 5) Aparelho leve NÃO pode parecer vazio para a guarda (senão o desktop recusaria sincronizar)
const leve = S.aplicarRemoto(app([]), snapCheio);
const snapLeve = S.montarSnapshotSync(leve, "ipad");
ok(S.pesoTexto(snapLeve) === S.pesoTexto(snapCheio), "5) o aparelho leve declara o MESMO peso de texto",
   S.pesoTexto(snapLeve) + " vs " + S.pesoTexto(snapCheio));
ok(!S.encolheriaTexto(S.pesoTexto(snapCheio), S.pesoTexto(snapLeve)), "5) e a subida dele nunca é lida como perda");

// 6) Ficha corrompida/ausente (cofre antigo v2 misturado): não pode explodir nem zerar o peso
const misto = { documentos: [{ id: "a", titulo: "sem ficha", paginas: null, texto: "texto direto" }] };
ok(S.pesoTexto(misto) === "texto direto".length, "6) documento no formato ANTIGO (sem ficha) ainda conta pelo texto");
const fichaQuebrada = { documentos: [{ id: "a", conteudo: { hash: "x" }, paginas: null, texto: "" }] };
ok(S.pesoTexto(fichaQuebrada) === 0, "6) ficha sem `chars` não quebra o cálculo");

// 7) Perfis: material dentro de perfil também perde o conteúdo no snapshot
const comPerfil = { modificadoEm: "2026-08-20T10:00:00.000Z", documentos: [], config: {},
  perfis: [{ id: "p1", nome: "Magistratura", documentos: [mat("p", "conteudo do perfil")], resumos: [] }] };
const snapPerfil = S.montarSnapshotSync(comPerfil, "pc");
ok(snapPerfil.perfis[0].documentos[0].paginas === null, "7) material DENTRO do perfil também sai do snapshot");
ok(snapPerfil.perfis[0].documentos[0].conteudo.chars === "conteudo do perfil".length, "7) e leva a ficha certa");
ok(S.pesoTexto(snapPerfil) === "conteudo do perfil".length, "7) o peso soma o que está nos perfis");

// 8) aplicarRemoto com perfis: preserva o conteúdo local de dentro do perfil
const localPerfil = JSON.parse(JSON.stringify(comPerfil));
const aplicado = S.aplicarRemoto(localPerfil, snapPerfil);
ok(Array.isArray(aplicado.perfis[0].documentos[0].paginas), "8) conteúdo do perfil preservado ao baixar");

// 9) materiaisComConteudo enxerga topo e perfis (senão o conteúdo do perfil nunca subiria)
ok(S.materiaisComConteudo(comPerfil).length === 1, "9) materiaisComConteudo varre os perfis");
ok(S.materiaisComConteudo(app([mat("a", "x")])).length === 1, "9) e o topo");

// 10) Material com páginas VAZIAS (só OCR pendente): tem ficha? entra na subida?
const soVazias = app([{ id: "v", titulo: "escaneado", paginas: [pag(1, ""), pag(2, "")], figuras: [], texto: "" }]);
const snapVazias = S.montarSnapshotSync(soVazias, "pc");
ok(snapVazias.documentos[0].conteudo.n === 2 && snapVazias.documentos[0].conteudo.chars === 0,
   "10) material só com páginas vazias tem ficha (n=2, chars=0) e não some");
ok(S.materiaisComConteudo(soVazias).length === 1, "10) e o pacote dele sobe (senão o OCR feito depois se perderia)");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nAuditoria de limites: tudo conforme");
process.exit(falhas ? 1 : 0);
