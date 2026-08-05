// Teste do que SAI do estado na hora de gravar (persistence.js) — sem navegador.
//
// Existe porque o estado é reescrito INTEIRO a cada mudança: com a biblioteca do cursinho
// dentro, ele tinha 42,9 MB e cada gravação custava 558 ms de JSON.stringify. Três coisas
// pesadas passaram a morar fora dele (binário, páginas do material e índice semântico) e o
// `texto` do material deixou de ser gravado (é o join das páginas, recomposto no init).
// Um "simplificar" desatento aqui devolve o problema sem quebrar nada visível — daí o teste.
//
// Uso: node dev/teste-persistencia.mjs
import { estadoParaGravar } from "../src/persistence.js";

const paginas = [
  { n: 1, texto: "primeira página com bastante conteúdo", vazia: false },
  { n: 2, texto: "segunda página com bastante conteúdo", vazia: false },
];
const estado = {
  perfis: [
    {
      id: "perf_1",
      nome: "Concurso",
      documentos: [
        { id: "doc_1", titulo: "Apostila", texto: paginas.map((p) => p.texto).join("\n\n"), paginas },
        { id: "doc_2", titulo: "Colado", texto: "texto colado sem páginas", paginas: null },
      ],
      embeddings: { modelo: "gemini-embedding-001", itens: [{ id: "e1", vetor: [0.1, 0.2, 0.3] }], fontes: { doc_1: "sig" } },
      topicos: [{ id: "t1", titulo: "Tópico" }],
    },
  ],
  config: { tema: "escuro" },
};

const erros = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };

const gravado = estadoParaGravar(estado, { blobs: true });
const d1 = gravado.perfis[0].documentos[0];
const d2 = gravado.perfis[0].documentos[1];

ok(d1.texto === "", "material com páginas deveria gravar `texto` vazio (é o join das páginas)");
ok(d1.paginas === undefined, "material com páginas não deveria gravar `paginas` (moram em pag:<id>)");
ok(d1.temPaginas === 2, "deveria ficar o marcador `temPaginas` com a contagem");
ok(d2.texto === "texto colado sem páginas", "material SEM páginas tem de manter o texto (é o único lugar dele)");
ok(gravado.perfis[0].embeddings === undefined, "índice semântico não deveria ser gravado no estado (mora em emb:<perfil>)");
ok(gravado.perfis[0].topicos.length === 1, "o resto do perfil tem de continuar inteiro");
ok(gravado.config.tema === "escuro", "config global tem de continuar inteira");

// O objeto VIVO não pode ser tocado: quem já leu d.texto/d.paginas continua enxergando.
ok(estado.perfis[0].documentos[0].texto.length > 0, "a gravação não pode esvaziar o texto do objeto vivo");
ok(estado.perfis[0].documentos[0].paginas.length === 2, "a gravação não pode remover as páginas do objeto vivo");
ok(estado.perfis[0].embeddings.itens.length === 1, "a gravação não pode remover o índice do objeto vivo");

// Sem armazenamento de blobs (desktop com binário antigo), nada pode sair do estado — melhor
// um estado gordo do que perder páginas e índice.
const semBlobs = estadoParaGravar(estado, { blobs: false });
ok(Array.isArray(semBlobs.perfis[0].documentos[0].paginas), "sem blobs, as páginas TÊM de continuar no estado");
ok(!!semBlobs.perfis[0].embeddings, "sem blobs, o índice semântico TEM de continuar no estado");

const bytes = (o) => JSON.stringify(o).length;
console.log(`estado inteiro: ${bytes(estado)} bytes · gravado: ${bytes(gravado)} bytes`);
erros.forEach((e) => console.log("XX  " + e));
console.log(erros.length ? `\n${erros.length} falha(s)` : "\nok  tudo que é pesado fica fora do estado gravado");
process.exit(erros.length ? 1 : 0);
