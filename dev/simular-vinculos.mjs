// SIMULA o casamento bloco↔tópico do edital sobre a base real, SEM gravar nada: compara o que
// está vinculado hoje com o que a regra nova (preferir a disciplina do próprio material) daria.
// Serve para decidir com número na mão antes de mexer nos dados.
//
// Uso: node dev/simular-vinculos.mjs [-v]
import os from "node:os";
import path from "node:path";
import { acharTopicoDoBloco, disciplinaDoMaterial } from "../src/estrutura.js";

const verboso = process.argv.includes("-v");
const DB = path.join(os.homedir(), "AppData", "Roaming", "com.felipe.mentorconcurso", "mentor_concurso.db");
const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync(DB, { readOnly: true });
const estado = JSON.parse(db.prepare("select value from kv where key = 'state'").get().value);
db.close();

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

for (const perfil of estado.perfis || [estado]) {
  const docs = (perfil.documentos || []).filter((d) => (d.estrutura?.blocos || []).length);
  if (!docs.length) continue;
  const topicos = perfil.topicos || [];
  const disciplinas = perfil.disciplinas || [];
  const nomeDisc = (id) => (disciplinas.find((x) => x.id === id) || {}).nome || "—";
  const discDoTopico = (topicoId) => (topicos.find((t) => t.id === topicoId) || {}).disciplinaId;

  console.log(`\n== ${perfil.nome} — simulação (nada é gravado) ==`);
  let hojeVinc = 0, hojeCerta = 0, novoVinc = 0, novaCerta = 0, mudam = 0, perdem = 0;
  for (const d of docs) {
    const discMaterial = disciplinaDoMaterial(d.titulo, disciplinas);
    const blocos = d.estrutura.blocos;
    let hv = 0, hc = 0, nv = 0, nc = 0;
    const exemplos = [];
    for (const b of blocos) {
      if (b.topicoId) { hv++; if (discMaterial && discDoTopico(b.topicoId) === discMaterial) hc++; }
      const novo = acharTopicoDoBloco(b.titulo, { topicos, disciplinas, disciplinaId: discMaterial });
      if (novo) { nv++; if (discMaterial && discDoTopico(novo.topicoId) === discMaterial) nc++; }
      if ((novo?.topicoId || null) !== (b.topicoId || null)) {
        mudam++;
        if (!novo && b.topicoId) perdem++;
        if (exemplos.length < 4) {
          const nomeDe = (id) => { const t = topicos.find((x) => x.id === id); return t ? `${nomeDisc(t.disciplinaId)} · ${t.nome.slice(0, 34)}` : "—"; };
          exemplos.push(`      ${String(b.numero).padStart(6)} ${String(b.titulo).slice(0, 38).padEnd(38)} antes: ${nomeDe(b.topicoId).slice(0, 44).padEnd(44)} agora: ${nomeDe(novo?.topicoId)}`);
        }
      }
    }
    hojeVinc += hv; hojeCerta += hc; novoVinc += nv; novaCerta += nc;
    const pctH = hv ? Math.round((hc / hv) * 100) : 0;
    const pctN = nv ? Math.round((nc / nv) * 100) : 0;
    console.log(
      `${d.titulo.slice(0, 38).padEnd(38)} disc=${discMaterial ? nomeDisc(discMaterial).slice(0, 22) : "(fora do edital)"}`.padEnd(78) +
        ` hoje ${hc}/${hv} (${pctH}%) → novo ${nc}/${nv} (${pctN}%)`
    );
    if (verboso) exemplos.forEach((l) => console.log(l));
  }
  console.log(
    `\nTOTAL hoje: ${hojeCerta}/${hojeVinc} na disciplina do material (${Math.round((hojeCerta / hojeVinc) * 100)}%)` +
      `\nTOTAL novo: ${novaCerta}/${novoVinc} (${Math.round((novaCerta / Math.max(novoVinc, 1)) * 100)}%)` +
      `\nblocos que mudariam: ${mudam} · ficariam SEM vínculo: ${perdem}`
  );
}
