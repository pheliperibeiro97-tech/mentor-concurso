// Registro de bancas de concurso.
//
// Filosofia: a lista vem com uma SEMENTE embutida (bancas conhecidas, com o site
// oficial onde o usuário baixa as provas anteriores) e é EXTENSÍVEL: o usuário pode
// adicionar qualquer banca que falte. A banca indicada/preferida NUNCA limita o
// usuário — é só priorização/sugestão; ele sempre pode usar qualquer banca.
//
// Links oficiais verificados (jun/2026). Onde não temos link confiável, fica vazio
// (o usuário pode completar). NÃO embutimos conteúdo de terceiros, apenas o nome da
// banca e o endereço público do site oficial.

export const BANCAS_BUILTIN = [
  { nome: "VUNESP", siteOficial: "https://www.vunesp.com.br" },
  { nome: "FGV", siteOficial: "https://conhecimento.fgv.br/concursos" },
  { nome: "Cebraspe (CESPE)", siteOficial: "https://www.cebraspe.org.br" },
  { nome: "FCC", siteOficial: "https://www.concursosfcc.com.br" },
  { nome: "IBFC", siteOficial: "https://www.ibfc.org.br" },
  { nome: "Cesgranrio", siteOficial: "https://www.cesgranrio.org.br" },
  { nome: "Quadrix", siteOficial: "https://concursos.quadrix.org.br" },
  { nome: "Instituto AOCP", siteOficial: "" },
  { nome: "Consulplan", siteOficial: "" },
  { nome: "IADES", siteOficial: "" },
];

// Normaliza o nome (trim + colapsa espaços) para comparação/armazenamento.
export function normalizarNomeBanca(nome) {
  return String(nome || "").trim().replace(/\s+/g, " ");
}

function chave(nome) {
  return normalizarNomeBanca(nome).toLowerCase();
}

// Mescla a semente embutida com as bancas adicionadas pelo usuário, sem duplicar
// por nome (case-insensitive). Built-in vêm marcadas fonte:"built-in"; as do usuário
// preservam seus campos (inclui id) e vêm marcadas fonte:"usuário". Ordenado por nome.
export function mesclarBancas(doUsuario = []) {
  const out = [];
  const vistos = new Set();
  for (const b of BANCAS_BUILTIN) {
    vistos.add(chave(b.nome));
    out.push({ ...b, fonte: "built-in" });
  }
  for (const b of doUsuario || []) {
    const k = chave(b.nome);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    out.push({ ...b, fonte: "usuário" });
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
