// Teste do leitor de SUMÁRIO de apostila (estrutura.js), sem navegador e sem IA.
//
// Existe porque o caminho que importa para a distribuição é o DETERMINÍSTICO: num computador
// de terceiro não há ninguém preparando o arquivo por fora, e nem sempre haverá IA conectada.
// Medir contra arquivos reais foi o que revelou que `acharPaginaSumario` falhava em 8 das 24
// apostilas do cursinho — a palavra "Índice" simplesmente não está na página em metade delas.
//
// Uso:
//   node dev/teste-sumarios.mjs                  # fixtures (rápido, commitável, roda em CI)
//   node dev/teste-sumarios.mjs --reais <pasta>  # .txt extraídos das apostilas de verdade
//
// ATENÇÃO ao gerar os .txt de `--reais`: use o MESMO extrator do app (pdf.js, via
// `extrairPdfPaginas`), nunca um extrator de fora. O pdf.js entrega o índice de duas colunas
// como "10.1 3" (código e página na mesma linha); o pdfminer quebra em duas linhas. Medir
// contra o texto errado deu 24/24 "correto" enquanto o app, na tela, mostrava "Aula 01 — 3".
//
// As fixtures em dev/fixtures-sumario/ reproduzem os layouts observados em miniatura, sem
// copiar material protegido. Cada uma declara o resultado esperado no cabeçalho:
//   # esperado: sumarioPag=2 entradas=4 primeira=10.1|Título|3 ultima=10.4|Título|64
// Para os arquivos REAIS, o teste não sabe o gabarito: mede cobertura e coerência
// (achou o sumário? a sequência N.1..N.k está contígua? sobrou falso positivo?).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseIndice, detectarPorNumeracao, acharPaginaSumario, limparRuidoDePaginas, reordenarRotulosDeEdital, detectarEstrutura, ehEstruturaForte } from "../src/estrutura.js";
import { separarEdital } from "../src/ia.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const iReais = args.indexOf("--reais");
const pastaReais = iReais >= 0 ? args[iReais + 1] : null;

// ---- leitura dos arquivos ---------------------------------------------------
// Fixture: "--- pagina N ---". Extração real: "--- fls./pág N ---".
function paginasDoTexto(txt) {
  const partes = txt.split(/---\s*(?:pagina|fls\.\/pág)\s+(\d+)\s*(?:\[OCR\])?\s*---/);
  const paginas = [];
  for (let i = 1; i < partes.length; i += 2) {
    paginas.push({ n: parseInt(partes[i], 10), texto: (partes[i + 1] || "").replace(/^#.*$/gm, "") });
  }
  return paginas;
}

function esperadoDoCabecalho(txt) {
  const m = txt.match(/^#\s*esperado:\s*(.+)$/m);
  if (!m) return null;
  const e = {};
  for (const par of m[1].trim().split(/\s+(?=\w+=)/)) {
    const [k, ...v] = par.split("=");
    e[k] = v.join("=");
  }
  return e;
}

const fmtEntrada = (e) => (e ? `${e.numero}|${e.titulo}|${e.pagina ?? "?"}` : "-");

// ---- modo FIXTURES (com gabarito) -------------------------------------------
function rodarFixtures() {
  const dir = path.join(aqui, "fixtures-sumario");
  const arqs = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
  let falhas = 0;
  for (const arq of arqs) {
    const txt = fs.readFileSync(path.join(dir, arq), "utf8");
    const paginas = paginasDoTexto(txt);
    const esp = esperadoDoCabecalho(txt) || {};
    const sumPag = acharPaginaSumario(paginas) || 0;
    // As fixtures são miniaturas: têm 3-5 páginas, mas as páginas CITADAS no índice são as
    // da apostila real (3, 16, 64…). O teto de validação tem de ser o da apostila, não o da
    // fixture, senão o pareamento descarta as páginas por "número maior que o documento".
    const { entradas } = parseIndice(paginas, 999);
    const erros = [];

    const cmp = (rotulo, obtido, esperado) => {
      if (esperado === undefined) return;
      if (String(obtido) !== String(esperado)) erros.push(`${rotulo}: obtido «${obtido}», esperado «${esperado}»`);
    };
    cmp("sumarioPag", sumPag, esp.sumarioPag);
    cmp("entradas", entradas.length, esp.entradas);
    if (entradas.length) {
      cmp("primeira", fmtEntrada(entradas[0]), esp.primeira);
      cmp("ultima", fmtEntrada(entradas[entradas.length - 1]), esp.ultima);
    }
    if (esp.fallback !== undefined) {
      const fb = detectarPorNumeracao(paginas, sumPag || null);
      cmp("fallback", fb.length, esp.fallback);
      if (esp.semFalsos === "sim") {
        const suspeitos = fb.filter((e) => /^(19|20)\d\d$/.test(e.numero) || !e.numero.includes("."));
        if (suspeitos.length) erros.push(`falsos positivos: ${suspeitos.map((s) => s.numero + " " + s.titulo.slice(0, 24)).join(" · ")}`);
      }
    }
    console.log(`${erros.length ? "XX" : "ok"}  ${arq.replace(".txt", "").padEnd(24)} sumário p.${sumPag || "-"} · ${entradas.length} entradas`);
    erros.forEach((e) => console.log(`      ${e}`));
    falhas += erros.length ? 1 : 0;
  }
  console.log(`\n${arqs.length - falhas}/${arqs.length} fixtures passaram`);
  return falhas;
}

// ---- modo REAL (sem gabarito: mede cobertura e coerência) --------------------
function rodarReais(pasta) {
  const arqs = fs.readdirSync(pasta).filter((f) => f.endsWith(".txt")).sort();
  let comSumario = 0;
  const linhas = [];
  for (const arq of arqs) {
    const txt = fs.readFileSync(path.join(pasta, arq), "utf8");
    const paginas = paginasDoTexto(txt);
    const sumPag = acharPaginaSumario(paginas);
    // Só extraí as primeiras páginas de cada apostila, então `paginas.length` não é o total
    // do PDF — e o pareamento rejeita página citada acima do total. O rodapé traz "3/1289";
    // usar esse total, senão um teto generoso. No app o valor certo vem de doc.paginas.length.
    const totalPdf = Math.max(...(txt.match(/\b\d+\/(\d{2,5})\b/g) || []).map((s) => +s.split("/")[1]), 9999);
    const { entradas } = parseIndice(paginas, totalPdf);
    if (sumPag) comSumario++;
    // Coerência: os códigos de mesmo prefixo formam 1..k sem furos?
    const nums = entradas.map((e) => e.numero).filter((c) => c.includes("."));
    const sufixos = nums.map((c) => parseInt(c.split(".")[1], 10)).filter(Number.isFinite);
    const contigua = sufixos.length > 0 && sufixos.every((v, i) => v === i + 1);
    const comPagina = entradas.filter((e) => e.pagina != null).length;
    linhas.push({
      nome: arq.replace(".txt", ""),
      sumPag: sumPag || "-",
      entradas: entradas.length,
      comPagina,
      contigua: sufixos.length ? (contigua ? "sim" : "NÃO") : "-",
    });
  }
  console.log("arquivo".padEnd(42), "sum".padStart(4), "entr".padStart(5), "c/pág".padStart(6), "contígua".padStart(9));
  for (const l of linhas) {
    console.log(l.nome.slice(0, 42).padEnd(42), String(l.sumPag).padStart(4), String(l.entradas).padStart(5), String(l.comPagina).padStart(6), String(l.contigua).padStart(9));
  }
  const ok = linhas.filter((l) => l.entradas > 0 && l.contigua !== "NÃO").length;
  console.log(`\nsumário encontrado: ${comSumario}/${arqs.length} · com entradas coerentes: ${ok}/${arqs.length}`);
  return arqs.length - ok;
}

// ---- fixtures de EDITAL (rótulo de disciplina girado na margem) ---------------
// Mesma ideia das fixtures de sumário, para o outro arquivo que o usuário importa. Mede o
// caminho completo do PDF: limpar cabeçalho repetido → reordenar rótulos → separar.
function rodarFixturesEdital() {
  const dir = path.join(aqui, "fixtures-edital");
  if (!fs.existsSync(dir)) return 0;
  const arqs = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
  let falhas = 0;
  for (const arq of arqs) {
    const txt = fs.readFileSync(path.join(dir, arq), "utf8");
    const esp = esperadoDoCabecalho(txt) || {};
    const paginas = paginasDoTexto(txt);
    const texto = reordenarRotulosDeEdital(limparRuidoDePaginas(paginas)).map((p) => p.texto).join("\n\n");
    const ds = separarEdital(texto, { porItem: true });
    const erros = [];
    const cmp = (rotulo, obtido, esperado) => {
      if (esperado === undefined) return;
      if (String(obtido) !== String(esperado)) erros.push(`${rotulo}: obtido «${obtido}», esperado «${esperado}»`);
    };
    cmp("disciplinas", ds.length, esp.disciplinas);
    cmp("nomes", ds.map((d) => d.nome).join("|"), esp.nomes);
    cmp("itens", ds.map((d) => d.topicos.length).join("|"), esp.itens);
    console.log(`${erros.length ? "XX" : "ok"}  ${arq.replace(".txt", "").padEnd(24)} ${ds.length} disciplinas · ${ds.reduce((a, d) => a + d.topicos.length, 0)} itens`);
    erros.forEach((e) => console.log(`      ${e}`));
    falhas += erros.length ? 1 : 0;
  }
  console.log(`\n${arqs.length - falhas}/${arqs.length} fixtures de edital passaram`);
  return falhas;
}

// ---- fixtures de ESTRUTURA (o que o import de MATERIAL usa: detectarEstrutura) -------------
// As fixtures de cima medem a LEITURA do índice; estas medem a decisão seguinte, que é onde
// cada bloco vai parar no PDF. Existem porque a ordem das fontes estava invertida: a tag da
// plataforma ("?topic=7.2") ganhava do índice e do cabeçalho no corpo, e nas 17 apostilas do
// cursinho isso dava 117/339 blocos na página certa (contra 339/339 com a ordem corrigida).
function rodarFixturesEstrutura() {
  const dir = path.join(aqui, "fixtures-estrutura");
  if (!fs.existsSync(dir)) return 0;
  const arqs = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
  let falhas = 0;
  for (const arq of arqs) {
    const txt = fs.readFileSync(path.join(dir, arq), "utf8");
    const esp = esperadoDoCabecalho(txt) || {};
    const paginas = paginasDoTexto(txt);
    const est = detectarEstrutura({ paginas, numPaginas: paginas.length });
    const erros = [];
    const cmp = (rotulo, obtido, esperado) => {
      if (esperado === undefined) return;
      if (String(obtido) !== String(esperado)) erros.push(`${rotulo}: obtido «${obtido}», esperado «${esperado}»`);
    };
    cmp("origem", est.origem || "nenhuma", esp.origem);
    cmp("blocos", est.blocos.length, esp.blocos);
    cmp("paginas", est.blocos.map((b) => b.pIni ?? "?").join("|"), esp.paginas);
    // `forte` decide se a IA é chamada no import (documentos.js): forte = determinístico
    // resolveu, IA nem é acionada. É a outra metade do conserto — sem esta checagem, a
    // preferência poderia voltar a inverter sem nenhuma fixture reclamar.
    cmp("forte", ehEstruturaForte(est) ? "sim" : "nao", esp.forte);
    console.log(`${erros.length ? "XX" : "ok"}  ${arq.replace(".txt", "").padEnd(24)} ${est.blocos.length} blocos · p.${est.blocos.map((b) => b.pIni ?? "?").join("/")} · forte=${ehEstruturaForte(est) ? "sim" : "nao"}`);
    erros.forEach((e) => console.log(`      ${e}`));
    falhas += erros.length ? 1 : 0;
  }
  console.log(`\n${arqs.length - falhas}/${arqs.length} fixtures de estrutura passaram`);
  return falhas;
}

let falhas;
if (pastaReais) {
  falhas = rodarReais(pastaReais);
} else {
  falhas = rodarFixtures();
  console.log("");
  falhas += rodarFixturesEdital();
  console.log("");
  falhas += rodarFixturesEstrutura();
}
process.exit(falhas ? 1 : 0);
