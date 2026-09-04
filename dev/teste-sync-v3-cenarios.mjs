// Cenários de uso REAIS do sync v3, com três aparelhos: o desktop que importou tudo, o
// segundo desktop e o iPad. Puro, em memória — nunca toca no cofre.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const src = readFileSync("src/sync.js", "utf8").replace('import { store } from "./store.js";', "const store = { get: () => ({}) };");
// `sync.js` importa `config-local.js` (a lista de segredos que NAO sobem para o cofre,
// compartilhada com o backup). O modulo tem de viajar junto para o diretorio temporario,
// senao o import falha e o teste morre por motivo que nao e o que ele afere.
const dirTmp = mkdtempSync(join(tmpdir(), "sync-cen-"));
writeFileSync(join(dirTmp, "config-local.js"), readFileSync("src/config-local.js", "utf8"));
const arq = join(dirTmp, "sync.mjs");
writeFileSync(arq, src);
const S = await import(pathToFileURL(arq).href);

let falhas = 0;
const ok = (c, n, extra = "") => { console.log((c ? "  ok   " : "  FALHA") + " " + n + (extra ? " — " + extra : "")); if (!c) falhas++; };
const pag = (n, t) => ({ n, texto: t, vazia: false, temImagem: false, ocr: false });
const material = (id, txt, figs = []) => ({ id, titulo: "Aula " + id, paginas: [pag(1, txt)], figuras: figs, texto: txt });
const app = (docs, extra = {}) => ({ modificadoEm: "2026-08-20T10:00:00.000Z", documentos: docs, config: {}, ...extra });

// --- Cenário A: desktop cheio sobe; iPad entra do zero
const desktop = app([material("d1", "conteudo da aula um"), material("d2", "conteudo da aula dois")]);
const snapDesktop = S.montarSnapshotSync(desktop, "desktop");
const ipad = S.aplicarRemoto(app([]), snapDesktop);
ok(ipad.documentos.length === 2 && ipad.documentos.every((d) => d.conteudo.pendente), "A) iPad recebe as 2 fichas, ambas pendentes");
ok(ipad.documentos.every((d) => !d.paginas), "A) iPad não recebe texto de página");

// --- Cenário B: iPad ALTERA outra coisa (uma sessão de estudo) e sobe. O conteúdo some?
const ipadUsado = JSON.parse(JSON.stringify(ipad));
ipadUsado.sessoes = [{ id: "s1", tempoSeg: 1800 }];
ipadUsado.modificadoEm = "2026-08-20T11:00:00.000Z";
const snapIpad = S.montarSnapshotSync(ipadUsado, "ipad");
ok(snapIpad.documentos.every((d) => d.conteudo && d.conteudo.hash), "B) o iPad devolve as fichas intactas ao subir");
ok(S.pesoTexto(snapIpad) === S.pesoTexto(snapDesktop), "B) peso de texto igual — a guarda anti-perda não dispara",
   S.pesoTexto(snapIpad) + " vs " + S.pesoTexto(snapDesktop));
ok(!S.encolheriaTexto(S.pesoTexto(snapDesktop), S.pesoTexto(snapIpad)), "B) subida do iPad não é vista como perda");

// --- Cenário C: o desktop baixa o que o iPad subiu. Perde o conteúdo?
const desktopDepois = S.aplicarRemoto(desktop, snapIpad);
ok(desktopDepois.documentos.every((d) => Array.isArray(d.paginas) && d.paginas.length === 1), "C) o desktop MANTÉM as páginas");
ok(desktopDepois.documentos[0].paginas[0].texto === "conteudo da aula um", "C) o texto continua o mesmo");
ok(desktopDepois.sessoes && desktopDepois.sessoes.length === 1, "C) e recebe a sessão que o iPad criou");

// --- Cenário D: desktop DESCREVE UMA FIGURA (conteúdo muda) e sobe; o iPad tinha baixado antes
const desktop2 = JSON.parse(JSON.stringify(desktop));
desktop2.documentos[0].figuras = [{ pagina: 1, descricao: "tabela nova" }];
desktop2.documentos[0].paginas[0].texto += "\n\n[Figura descrita pela IA] tabela nova";
desktop2.modificadoEm = "2026-08-20T12:00:00.000Z";
const snap2 = S.montarSnapshotSync(desktop2, "desktop");
ok(snap2.documentos[0].conteudo.hash !== snapDesktop.documentos[0].conteudo.hash, "D) o hash do material mudou");
const ipadComConteudoVelho = JSON.parse(JSON.stringify(ipad));
ipadComConteudoVelho.documentos[0].paginas = [pag(1, "conteudo da aula um")];
ipadComConteudoVelho.documentos[0].conteudo.pendente = false;
const ipadAtualizado = S.aplicarRemoto(ipadComConteudoVelho, snap2);
ok(ipadAtualizado.documentos[0].conteudo.desatualizado === true, "D) o iPad marca o material como desatualizado (hash diferente)");
ok(Array.isArray(ipadAtualizado.documentos[0].paginas), "D) e MANTÉM a versão velha (dá para ler mesmo sem rede)");

// --- Cenário E: segundo desktop, que tem SÓ ALGUNS materiais
const desktop2Parcial = app([material("d1", "conteudo da aula um")]);
const aplicadoParcial = S.aplicarRemoto(desktop2Parcial, snapDesktop);
ok(Array.isArray(aplicadoParcial.documentos.find((d) => d.id === "d1").paginas), "E) o que ele TEM é preservado");
ok(aplicadoParcial.documentos.find((d) => d.id === "d2").conteudo.pendente === true, "E) o que ele não tem fica pendente");
ok(aplicadoParcial.documentos.length === 2, "E) e ele passa a conhecer os dois materiais");

// --- Cenário F: material NOVO criado no aparelho leve (texto colado, sem páginas)
const ipadCriou = JSON.parse(JSON.stringify(ipad));
ipadCriou.documentos.push({ id: "d3", titulo: "Colado no iPad", texto: "anotacao feita no ipad", paginas: null, figuras: [] });
const snapIpad2 = S.montarSnapshotSync(ipadCriou, "ipad");
const d3 = snapIpad2.documentos.find((d) => d.id === "d3");
ok(d3 && d3.texto === "anotacao feita no ipad" && !d3.conteudo, "F) material sem páginas sobe com o texto inteiro (como antes)");

// --- Cenário G: iPad baixa TUDO, vai e volta entre aparelhos. O conteúdo continua lá?
const ipadBaixouTudo = JSON.parse(JSON.stringify(ipad));
for (const d of ipadBaixouTudo.documentos) {           // simula o "Baixar tudo"
  const fonte = desktop.documentos.find((x) => x.id === d.id);
  d.paginas = JSON.parse(JSON.stringify(fonte.paginas));
  d.figuras = JSON.parse(JSON.stringify(fonte.figuras));
  d.conteudo = { ...d.conteudo, pendente: false, desatualizado: false, baixadoHash: S.fichaConteudo(fonte).hash };
}
// 1ª volta: o PC mexe em outra coisa (uma questão) e sobe; o iPad baixa esse esqueleto
const pcMexeu = JSON.parse(JSON.stringify(desktop));
pcMexeu.questoes = [{ id: "q1" }];
pcMexeu.modificadoEm = "2026-08-20T13:00:00.000Z";
const snapPc = S.montarSnapshotSync(pcMexeu, "desktop");
const ipadDepois = S.aplicarRemoto(ipadBaixouTudo, snapPc);
ok(ipadDepois.documentos.every((d) => Array.isArray(d.paginas) && d.paginas.length),
   "G) depois de sincronizar, o iPad CONTINUA com todo o conteúdo baixado");
ok(ipadDepois.documentos.every((d) => !d.conteudo.pendente), "G) e nenhum material volta a ficar pendente");
// 2ª volta: o iPad estuda e sobe; ele reenviaria o conteúdo que só leu?
const ipadEstudou = JSON.parse(JSON.stringify(ipadDepois));
ipadEstudou.sessoes = [{ id: "s2" }];
ipadEstudou.modificadoEm = "2026-08-20T14:00:00.000Z";
const snapIpadCheio = S.montarSnapshotSync(ipadEstudou, "ipad");
ok(S.pesoTexto(snapIpadCheio) === S.pesoTexto(snapPc), "G) e o peso declarado continua igual ao do PC");
const marcados = S.materiaisComConteudo(ipadEstudou).filter((d) => d.conteudo && d.conteudo.baixadoHash === S.fichaConteudo(d).hash);
ok(marcados.length === ipadEstudou.documentos.length,
   "G) todos seguem marcados como 'veio do cofre, não mexi' — logo não são reenviados");

// --- Cenário H: o PC ALTERA um material que o iPad já tinha baixado
const pcDescreveu = JSON.parse(JSON.stringify(desktop));
pcDescreveu.documentos[0].paginas[0].texto += " [Figura descrita pela IA] quadro novo";
pcDescreveu.documentos[0].figuras = [{ pagina: 1, descricao: "quadro novo" }];
pcDescreveu.modificadoEm = "2026-08-20T15:00:00.000Z";
const snapPc2 = S.montarSnapshotSync(pcDescreveu, "desktop");
const ipadRecebe = S.aplicarRemoto(ipadBaixouTudo, snapPc2);
const alterado = ipadRecebe.documentos.find((d) => d.id === "d1");
const intacto = ipadRecebe.documentos.find((d) => d.id === "d2");
ok(alterado.conteudo.desatualizado === true, "H) só o material alterado é marcado para atualizar");
ok(Array.isArray(alterado.paginas), "H) e ele continua legível com a versão antiga até baixar");
ok(!intacto.conteudo.desatualizado && Array.isArray(intacto.paginas), "H) o material não alterado nem é tocado");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTodos os cenários passaram");
process.exit(falhas ? 1 : 0);
