import { readFileSync } from "fs";
import { detectarEstrutura } from "./src/estrutura.js";

// Reconstrói paginas [{n,texto}] a partir do .txt do extrator (marcadores "--- fls./pág N ---").
function paginasDoTxt(caminho) {
  const txt = readFileSync(caminho, "utf8");
  const partes = txt.split(/--- fls\.\/pág (\d+)(?: \[OCR\])? ---/);
  const paginas = [];
  for (let i = 1; i < partes.length; i += 2) {
    const n = parseInt(partes[i], 10);
    const corpo = (partes[i + 1] || "").trim();
    paginas.push({ n, texto: corpo });
  }
  // numPaginas: tenta ler "TOTAL DE PÁGINAS: N"
  const mTot = txt.match(/TOTAL DE PÁGINAS:\s*(\d+)/);
  return { paginas, numPaginas: mTot ? parseInt(mTot[1], 10) : paginas.length };
}

const dir = "C:/Users/felip/pdf_extratos/";
const arquivos = [
  "1.  Princípios Administrativos .txt",
  "3.  Jurisdição.txt",
  "curso-370448-aula-01-51e6-completo.txt",
];

for (const a of arquivos) {
  const { paginas, numPaginas } = paginasDoTxt(dir + a);
  const r = detectarEstrutura({ paginas, numPaginas });
  console.log("\n==================================================");
  console.log("ARQUIVO:", a, "| páginas:", numPaginas, "| origem:", r.origem, "| aula:", JSON.stringify(r.aulaTitulo));
  console.log("BLOCOS:", r.blocos.length);
  for (const b of r.blocos) {
    console.log(
      `  ${b.numero.padEnd(5)} p.${String(b.pIni).padStart(3)}–${String(b.pFim).padStart(3)}  [${b.tipo}${b.banca ? "/" + b.banca : ""}]  conf=${(b.confianca).toFixed(2)}  ${b.titulo}`
    );
  }
}
