// Mede, página a página, a fração da página ocupada pela maior imagem — a MESMA conta que
// `extrairPdfPaginas` usa para decidir `temImagem`. Serve para descobrir por que uma página
// com gráfico não foi marcada como figura.
//
// uso: node dev/medir-figuras.mjs "<arquivo.pdf>" [pág,pág,…]
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const arquivo = process.argv[2];
const alvos = (process.argv[3] || "").split(",").filter(Boolean).map(Number);
if (!arquivo) throw new Error('uso: node dev/medir-figuras.mjs "<arquivo.pdf>" [pág,pág,…]');

const LIMIAR_IMG_FRAC = 0.1;
const LIMIAR_FUNDO = 0.82;
const FRACAO_PAGINAS_FUNDO = 0.6;

const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(arquivo)), disableWorker: true }).promise;
const ehImg = (fn) =>
  fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject ||
  fn === pdfjs.OPS.paintImageMaskXObject || fn === pdfjs.OPS.paintJpegXObject;

const paginas = alvos.length ? alvos : Array.from({ length: pdf.numPages }, (_, i) => i + 1);
let marcadas = 0, comImagem = 0;
const medidas = [];
for (const n of paginas) {
  const page = await pdf.getPage(n);
  const view = page.view;
  const areaPagina = Math.abs((view[2] - view[0]) * (view[3] - view[1])) || 1;
  const ops = await page.getOperatorList();
  let det = 1;
  const pilha = [];
  const fracs = [];
  for (let k = 0; k < ops.fnArray.length; k++) {
    const fn = ops.fnArray[k];
    if (fn === pdfjs.OPS.save) pilha.push(det);
    else if (fn === pdfjs.OPS.restore) det = pilha.length ? pilha.pop() : det;
    else if (fn === pdfjs.OPS.transform) {
      const m = ops.argsArray[k];
      det *= m[0] * m[3] - m[1] * m[2];
    } else if (ehImg(fn)) fracs.push(Math.abs(det) / areaPagina);
  }
  const fracFigura = Math.max(0, ...fracs.filter((f) => f < LIMIAR_FUNDO));
  const fracCheia = Math.max(0, ...fracs.filter((f) => f >= LIMIAR_FUNDO));
  if (fracs.length) comImagem++;
  medidas.push({ n, fracs, fracFigura, fracCheia });
}

// Mesmo 2º passe do app: página cheia só é fundo quando se repete no documento inteiro.
const cheias = medidas.filter((m) => m.fracCheia > 0);
const ehFundo = medidas.length >= 4 && cheias.length / medidas.length >= FRACAO_PAGINAS_FUNDO;
for (const m of medidas) {
  m.marcou = m.fracFigura >= LIMIAR_IMG_FRAC || (!ehFundo && m.fracCheia > 0);
  if (m.marcou) marcadas++;
  if (alvos.length || m.fracs.length)
    console.log(
      `pág ${String(m.n).padStart(3)}: ${m.fracs.length} imagem(ns) · frações ${m.fracs.map((f) => f.toFixed(3)).join(", ") || "—"}` +
        ` → temImagem=${m.marcou}${m.fracCheia > 0 ? (ehFundo ? " (página cheia, tratada como fundo)" : " (página cheia, tratada como figura)") : ""}`
    );
}
console.log(
  `\n${medidas.length} páginas · ${comImagem} com alguma imagem · ${cheias.length} com imagem de página cheia` +
    ` (${ehFundo ? "FUNDO do documento" : "figuras de conteúdo"}) · ${marcadas} marcadas como figura`
);
