// Teste da DISCIPLINA DO MATERIAL (estrutura.js), sem app e sem navegador.
//
// Existe porque a disciplina do material era adivinhada duas vezes, de jeitos diferentes: pelo
// título, na hora de casar os blocos com o edital; e pelo tópico dominante, na hora de agrupar a
// lista. Com uma aula por PDF (475 materiais), as duas deduções passaram a errar: o bloco
// "Fontes, interpretação e integração do Direito Administrativo" foi vinculado a "Fontes do
// Direito Tributário", e bastava um vínculo cruzado para o material aparecer no grupo errado.
//
// Uso: node dev/teste-material-disciplina.mjs
import { disciplinaDoDocumento, tituloCurtoDoc, rotuloDocumento, ordenarDocumentos, cursosConhecidos, acharTopicoDoBloco, GRUPO_AVULSOS } from "../src/estrutura.js";

const disciplinas = [
  { id: "d_adm", nome: "Direito Administrativo" },
  { id: "d_trib", nome: "Direito Tributário" },
  { id: "d_penal", nome: "Direito Penal" },
];
const topicos = [
  { id: "t_fontes_trib", disciplinaId: "d_trib", nome: "(2) Fontes do Direito Tributário · Fontes do direito positivo" },
  { id: "t_ato", disciplinaId: "d_adm", nome: "(8) Ato administrativo · Conceito · Elementos" },
  { id: "t_crimes", disciplinaId: "d_penal", nome: "Crimes contra a administração pública" },
];
const st = { disciplinas, topicos, documentos: [], aulas: [] };

const erros = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };
const nomeDe = (doc) => { const d = disciplinaDoDocumento(st, doc); return d ? `${d.nome}/${d.tipo}` : "—"; };

// 1) Campo declarado manda — inclusive contra o que o título sugere.
ok(nomeDe({ titulo: "Aula 01 - Apresentação", disciplinaId: "d_adm" }) === "Direito Administrativo/edital", "campo disciplinaId deveria mandar");

// 2) Prefixo do título, quando é disciplina do edital.
ok(nomeDe({ titulo: "Direito Administrativo - Aula 07 - Atos Administrativos" }) === "Direito Administrativo/edital", "prefixo do título deveria valer");

// 3) Prefixo que NÃO é disciplina do edital vira CURSO, com nome próprio — não se dissolve
//    dentro de uma disciplina qualquer nem cai em "avulsos".
ok(nomeDe({ titulo: "Legislação Penal Especial - Aula 03 - Drogas" }) === "Legislação Penal Especial/curso", "curso fora do edital deveria manter o nome");
ok(nomeDe({ titulo: "Aula 05 - Crimes hediondos", cursoNome: "Legislação Penal Especial" }) === "Legislação Penal Especial/curso", "cursoNome deveria valer");

// 4) Material geral (edital, guia, resumo de véspera) fica SEM disciplina — e isso é resposta,
//    não lacuna: ele vai para o grupo de avulsos, no fim da lista e dos seletores.
ok(disciplinaDoDocumento(st, { titulo: "Estudo Estratégico" }) === null, "material geral deveria ficar sem disciplina");
ok(disciplinaDoDocumento(st, { titulo: "Resumo geral de véspera" }) === null, "resumo geral deveria ficar sem disciplina");

// 4b) "Avulso" declarado GRUDA: sem a marca, a herança por vínculo devolvia o material a uma
//     disciplina e a escolha do usuário se desfazia sozinha no render seguinte.
ok(disciplinaDoDocumento(st, { titulo: "Edital de Abertura (íntegra)", semDisciplina: true, topicoIds: ["t_ato", "t_ato"] }) === null, "semDisciplina deveria vencer a herança por vínculo");
ok(nomeDe({ titulo: "Direito Administrativo - Aula 07 - Atos", semDisciplina: true }) === "—", "semDisciplina deveria vencer até o prefixo do título");

// 6b) Prefixo CONTIDO no nome da disciplina também encurta ("15. Formação Humanística" dentro
//     de "Noções Gerais de Direito e Formação Humanística").
ok(tituloCurtoDoc("15. Formação Humanística - Direto ao ponto", "Noções Gerais de Direito e Formação Humanística") === "Direto ao ponto", "deveria encurtar por conter");
ok(tituloCurtoDoc("Direito Penal - Aula 01 - Teoria", "Direito Processual Penal") === "Direito Penal - Aula 01 - Teoria", "não pode encurtar disciplina diferente");

// 5) Sem campo e sem prefixo, herda do vínculo dominante — só para agrupar material antigo.
ok(nomeDe({ titulo: "Apostila velha", topicoIds: ["t_ato", "t_ato", "t_crimes"] }) === "Direito Administrativo/edital", "dominante entre vínculos deveria agrupar");
ok(disciplinaDoDocumento(st, { titulo: "Apostila velha", topicoIds: ["t_ato"] }, { herdarDeVinculos: false }) === null, "herdarDeVinculos:false não pode olhar vínculo");

// 6) Título curto some com o prefixo repetido dentro do grupo — com e sem numeração do cursinho.
ok(tituloCurtoDoc("Direito Administrativo - Aula 07 - Atos", "Direito Administrativo") === "Aula 07 - Atos", "deveria encurtar o título");
ok(tituloCurtoDoc("3. Direito Administrativo - Direto ao ponto", "Direito Administrativo") === "Direto ao ponto", "deveria encurtar com numeração");
ok(tituloCurtoDoc("Estudo Estratégico", "") === "Estudo Estratégico", "sem disciplina, título inteiro");

// 7) Fora da lista agrupada, o rótulo leva a disciplina junto (fonte de questão, dossiê, busca).
ok(rotuloDocumento(st, { titulo: "Aula 01 - Apresentação", disciplinaId: "d_adm" }) === "Direito Administrativo · Aula 01 - Apresentação", "rótulo deveria trazer a disciplina");
ok(rotuloDocumento(st, { titulo: "Estudo Estratégico" }) === "Estudo Estratégico", "avulso: só o título");

// 8) Ordem natural: Aula 2 antes de Aula 10 (e não a ordem de importação).
const ordenados = ordenarDocumentos(st, [
  { titulo: "Direito Administrativo - Aula 10 - Serviços" },
  { titulo: "Direito Administrativo - Aula 2 - Regime" },
  { titulo: "Direito Tributário - Aula 01 - Tributos" },
]).map((d) => d.titulo);
ok(ordenados[0].includes("Aula 2") && ordenados[1].includes("Aula 10") && ordenados[2].startsWith("Direito Tributário"), "ordem natural por disciplina e número: " + JSON.stringify(ordenados));

// 8b) AULA 00 existe em alguns cursos (introdutória) e tem de vir ANTES da 01 — tanto escrita
//     com dois dígitos quanto com um. É o caso que o número zero costuma quebrar.
const comZero = ordenarDocumentos(st, [
  { titulo: "Direito Administrativo - Aula 10 - Serviços" },
  { titulo: "Direito Administrativo - Aula 00 - Apresentação" },
  { titulo: "Direito Administrativo - Aula 2 - Regime" },
  { titulo: "Direito Administrativo - Aula 01 - Princípios" },
]).map((d) => d.titulo.replace("Direito Administrativo - ", ""));
ok(comZero[0].startsWith("Aula 00") && comZero[1].startsWith("Aula 01") && comZero[3].startsWith("Aula 10"), "Aula 00 antes da 01: " + JSON.stringify(comZero));

// 9) Cursos conhecidos saem de materiais e do plano, sem repetir disciplina do edital.
const st2 = { ...st, documentos: [{ titulo: "Legislação Penal Especial - Aula 01 - Drogas" }], aulas: [{ nome: "Direitos Difusos e Coletivos - Aula 03 - ACP" }, { nome: "Direito Penal - Aula 01 - Teoria" }] };
const cursos = cursosConhecidos(st2);
ok(cursos.includes("Legislação Penal Especial") && cursos.includes("Direitos Difusos e Coletivos") && !cursos.includes("Direito Penal"), "cursos conhecidos: " + JSON.stringify(cursos));

// 10) O casamento RESTRITO não sai da disciplina — é o conserto do vínculo cruzado. Sem
//     `restrito`, o mesmo título continua podendo casar fora (comportamento das apostilas que
//     não são disciplina do edital).
const comum = { topicos, disciplinas };
// (título escolhido para atingir o piso do casamento global — é assim que o vínculo cruzado
// aparecia na base real, com os nomes longos do edital do 192º)
const alvoCruzado = "Fontes do Direito Tributário e fontes do direito positivo";
ok(acharTopicoDoBloco(alvoCruzado, { ...comum, disciplinaId: "d_adm", restrito: true }) === null, "restrito não pode casar fora da disciplina");
const solto = acharTopicoDoBloco(alvoCruzado, { ...comum, disciplinaId: "d_adm" });
ok(solto && solto.topicoId === "t_fontes_trib", "sem restrito, o casamento global continua valendo (é o comportamento das apostilas fora do edital)");
ok((acharTopicoDoBloco("Ato administrativo: conceito e elementos", { ...comum, disciplinaId: "d_adm", restrito: true }) || {}).topicoId === "t_ato", "restrito deve casar DENTRO da disciplina");

// 11) O rótulo do grupo dos avulsos é um só, em toda a interface.
ok(typeof GRUPO_AVULSOS === "string" && GRUPO_AVULSOS.length > 3, "GRUPO_AVULSOS deveria existir");

if (erros.length) {
  console.error("FALHAS:\n" + erros.map((e) => " ✗ " + e).join("\n"));
  process.exit(1);
}
console.log(`ok  ${16} regras de disciplina do material`);
