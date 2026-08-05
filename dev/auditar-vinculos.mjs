// Audita o VÍNCULO bloco↔tópico do edital nos materiais salvos: cada bloco do sumário de uma
// apostila deveria cair na disciplina daquela apostila (o arquivo "3. Direito Administrativo"
// cobre Direito Administrativo). Aqui se mede quanto disso bate e o que foi parar em outra
// disciplina — o casamento é por TÍTULO, e títulos de matérias diferentes se parecem
// ("Fontes do Direito Administrativo" × "Fontes do Direito Tributário").
//
// Uso: node dev/auditar-vinculos.mjs [-v]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const verboso = args.includes("-v");
const DB = path.join(os.homedir(), "AppData", "Roaming", "com.felipe.mentorconcurso", "mentor_concurso.db");

const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync(DB, { readOnly: true });
const estado = JSON.parse(db.prepare("select value from kv where key = 'state'").get().value);
db.close();

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

for (const perfil of estado.perfis || [estado]) {
  const docs = (perfil.documentos || []).filter((d) => (d.estrutura?.blocos || []).length);
  if (!docs.length) continue;
  const disciplinas = new Map((perfil.disciplinas || []).map((x) => [x.id, x.nome]));
  const topicos = new Map((perfil.topicos || []).map((t) => [t.id, t]));
  console.log(`\n== ${perfil.nome || "perfil"} ==`);
  let totBlocos = 0, totVinc = 0, totCerta = 0;
  for (const d of docs) {
    // Disciplina esperada: a do nome do arquivo ("3. Direito Administrativo").
    const esperada = norm(d.titulo.replace(/^\s*\d+[.\-)]?\s*/, ""));
    const blocos = d.estrutura.blocos;
    let vinc = 0, certa = 0;
    const fora = [];
    for (const b of blocos) {
      if (!b.topicoId) continue;
      vinc++;
      const t = topicos.get(b.topicoId);
      const nomeDisc = t ? disciplinas.get(t.disciplinaId) || "" : "";
      const bate = norm(nomeDisc) === esperada || norm(nomeDisc).includes(esperada) || esperada.includes(norm(nomeDisc));
      if (bate) certa++;
      else fora.push(`      ${String(b.numero).padStart(6)} ${String(b.titulo).slice(0, 46).padEnd(46)} → ${nomeDisc} · ${(t?.nome || "").slice(0, 44)}`);
    }
    totBlocos += blocos.length; totVinc += vinc; totCerta += certa;
    const pct = vinc ? Math.round((certa / vinc) * 100) : 0;
    console.log(
      `${pct === 100 ? "ok" : "XX"}  ${d.titulo.slice(0, 40).padEnd(40)} ${String(vinc).padStart(3)}/${String(blocos.length).padEnd(3)} blocos vinculados · ${certa} na disciplina certa (${pct}%)`
    );
    if (verboso) fora.slice(0, 8).forEach((l) => console.log(l));
  }
  console.log(`\nTOTAL: ${totVinc}/${totBlocos} blocos vinculados · ${totCerta} na disciplina do próprio material (${Math.round((totCerta / Math.max(totVinc, 1)) * 100)}%)`);
}
