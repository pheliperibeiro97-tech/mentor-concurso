// Audita o SUMÁRIO dos materiais JÁ SALVOS: para cada bloco, compara a página gravada com a
// página em que o cabeçalho numerado ("16.3") realmente abre linha no corpo do PDF.
//
// Existe porque o teste de fixtures mede o detector, e isto mede o RESULTADO na base do
// usuário — foi assim que apareceu que a IA estava sobrescrevendo o sumário determinístico
// (260/339 blocos certos) e que a tag da plataforma derrubava o determinístico (117/339).
// Depois do conserto: 339/339.
//
// Uso:
//   node dev/auditar-sumarios.mjs                    # base do desktop (SQLite do Tauri)
//   node dev/auditar-sumarios.mjs --estado x.json    # backup/export do app
//   node dev/auditar-sumarios.mjs -v                 # lista bloco a bloco os divergentes
//
// Regra do gabarito: página de índice é a que traz 3+ códigos distintos do próprio material
// (apostila grande espalha o índice por 2-3 páginas); a âncora é a primeira ocorrência FORA
// delas. Sem isso o auditor "acha" o bloco na própria página de índice e acusa erro onde não há.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const verboso = args.includes("-v");
const iEstado = args.indexOf("--estado");
const DB_PADRAO = path.join(os.homedir(), "AppData", "Roaming", "com.felipe.mentorconcurso", "mentor_concurso.db");

// Desde a v0.8.3 as páginas do material moram fora do estado (chave `blob:pag:<doc>`), porque
// o estado é reescrito inteiro a cada mudança. O auditor precisa delas, então recompõe.
function juntarPaginas(estado, db) {
  if (!db) return estado;
  for (const p of estado.perfis || [estado]) {
    for (const d of p.documentos || []) {
      if (Array.isArray(d.paginas) && d.paginas.length) continue;
      const linha = db.prepare("select value from kv where key = ?").get(`blob:pag:${d.id}`);
      if (!linha) continue;
      try {
        const guardado = JSON.parse(linha.value);
        if (Array.isArray(guardado.paginas)) d.paginas = guardado.paginas;
      } catch (_) {}
    }
  }
  return estado;
}

async function lerEstado() {
  if (iEstado >= 0) return JSON.parse(fs.readFileSync(args[iEstado + 1], "utf8"));
  if (!fs.existsSync(DB_PADRAO)) {
    console.error(`Base do desktop não encontrada em ${DB_PADRAO}. Use --estado <arquivo.json>.`);
    process.exit(2);
  }
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite")); // nativo a partir do Node 22
  } catch {
    console.error("Este Node não tem node:sqlite (precisa de Node 22+). Use --estado <arquivo.json>.");
    process.exit(2);
  }
  const db = new DatabaseSync(DB_PADRAO, { readOnly: true });
  const linha = db.prepare("select value from kv where key = 'state'").get();
  if (!linha) { console.error("chave 'state' não encontrada na base."); process.exit(2); }
  const estado = juntarPaginas(JSON.parse(linha.value), db);
  db.close();
  return estado;
}

const estado = await lerEstado();
const perfis = estado.perfis || [estado];

// O número do bloco às vezes carrega a pontuação do índice ("5.1)"); o corpo abre com "5.1 ".
const RE_COD = /^\d+\.\d+$/;
const codDoBloco = (b) => String(b.numero || "").trim().replace(/[).\-–]+$/, "");
// O piso de 3 códigos não enxerga o índice de uma AULA de duas seções ("16.1" e "16.2"): a
// página de índice fica de fora, o gabarito vira a própria página do índice e o auditor acusa
// divergência onde o app está certo. Com poucos códigos, o piso passa a ser "todos eles" — e
// só nas primeiras páginas, que é onde índice mora.
function paginasDeIndice(paginas, codigos) {
  const piso = Math.max(2, Math.min(3, codigos.length));
  const idx = new Set();
  for (const p of paginas) {
    let n = 0;
    for (const cod of codigos) if (abreLinha(p.texto, cod)) n++;
    if (n >= 3 || (n >= piso && p.n <= 10)) idx.add(p.n);
  }
  return idx;
}
function abreLinha(texto, cod) {
  return new RegExp(`^\\s*${cod.replace(".", "\\.")}[\\s).\\-–]`, "m").test(texto || "");
}

let totBlocos = 0, totOk = 0, totSemGabarito = 0, materiaisComErro = 0;
for (const perfil of perfis) {
  const docs = (perfil.documentos || []).filter((d) => (d.estrutura?.blocos || []).length && (d.paginas || []).length);
  if (!docs.length) continue;
  console.log(`\n== ${perfil.nome || "perfil"} — ${docs.length} materiais com sumário ==`);
  for (const d of docs) {
    const blocos = d.estrutura.blocos;
    const codigos = [...new Set(blocos.map(codDoBloco).filter((n) => RE_COD.test(n)))];
    const idxPags = paginasDeIndice(d.paginas, codigos);
    const divergentes = [];
    let n = 0, ok = 0;
    for (const b of blocos) {
      const cod = codDoBloco(b);
      if (!RE_COD.test(cod)) continue;
      const real = d.paginas.find((p) => !idxPags.has(p.n) && abreLinha(p.texto, cod))?.n;
      if (real == null) { totSemGabarito++; continue; }
      n++;
      if (b.pIni != null && Math.abs(b.pIni - real) <= 2) ok++;
      else divergentes.push(`      ${cod.padStart(6)} ${String(b.titulo).slice(0, 44).padEnd(44)} gravado=${b.pIni} corpo=${real}`);
    }
    totBlocos += n; totOk += ok;
    if (divergentes.length) materiaisComErro++;
    const semPagina = blocos.filter((b) => b.pIni == null).length;
    const foraDeOrdem = blocos.some((b, i) => i && b.pIni != null && blocos[i - 1].pIni != null && b.pIni < blocos[i - 1].pIni);
    console.log(
      `${divergentes.length || semPagina || foraDeOrdem ? "XX" : "ok"}  ${d.titulo.slice(0, 42).padEnd(42)}` +
        ` ${String(ok).padStart(3)}/${String(n).padEnd(3)} blocos na página certa` +
        `${semPagina ? ` · ${semPagina} sem página` : ""}${foraDeOrdem ? " · FORA DE ORDEM" : ""} · origem=${d.estrutura.origem}`
    );
    if (verboso) divergentes.forEach((l) => console.log(l));
  }
}
console.log(
  `\nTOTAL: ${totOk}/${totBlocos} blocos na página certa` +
    `${totSemGabarito ? ` · ${totSemGabarito} sem cabeçalho no corpo (não dá para conferir)` : ""}` +
    `${materiaisComErro ? ` · ${materiaisComErro} materiais com divergência` : ""}`
);
process.exit(totOk === totBlocos ? 0 : 1);
