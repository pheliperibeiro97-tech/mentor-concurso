// Central de novidades: UM lugar discreto (sino no topo) para "o que há de novo".
// Anti-modal-fatigue (lição da auditoria): nada de modais empilhados nem tour de N
// passos — badge silencioso quando a versão instalada é mais nova que a última vista.
import { APP_VERSION } from "./erro-log.js";
import { esc } from "./util.js";
import { abrirJanela } from "./ui.js";

// Changelog (mais recente primeiro). Cada versão: { v, data, itens:[...] }.
export const NOVIDADES = [
  {
    v: "0.8.2",
    data: "agosto/2026",
    titulo: "Atualizar material com um clique, e o edital sem buracos",
    itens: [
      "Novo botão «Atualizar material», nas opções (···) de cada material: traga a versão nova do arquivo e o app substitui o texto e o sumário MANTENDO tudo o que você criou a partir dele — questões, flashcards, mapas, vínculos com o edital e histórico. Antes isso dependia de o nome do arquivo ser idêntico ao anterior; se o cursinho renomeasse, o app criava uma cópia solta.",
      "Dá para renomear o material na mesma hora, sem perder os vínculos.",
      "Edital em PDF: uma disciplina inteira podia sumir na importação. Direito Penal e Processual Penal são numerados em algarismo romano (I, II, III, IV) e o app só entendia «1., 2., 3.» — todo o programa de Processual Penal era absorvido pela disciplina anterior. Corrigido.",
      "Ainda no edital: uma citação de lei no começo de uma linha («5.903/2006, …») era lida como «item 5» e desalinhava a disciplina em um item — o Direito do Consumidor começava no item 2. Corrigido.",
      "As alíneas do edital (a, b, c…) e os subitens («1 – Parte Geral») agora viram tópicos próprios, acompanháveis um a um. O Direito da Criança saiu de 3 tópicos gigantes para 43.",
      "Materiais: o cartão ficou mais limpo. «Ver texto extraído» foi para dentro das opções (···), junto de «Abrir PDF»; fora ficou só «Gerar com IA». Clicar no título continua abrindo o material.",
      "No primeiro acesso, se você tentar avançar sem informar o concurso, o campo agora fica destacado e recebe o foco — antes só aparecia um aviso no rodapé, longe de onde você estava olhando.",
    ],
  },
  {
    v: "0.8.1",
    data: "agosto/2026",
    titulo: "O app lê a apostila e o edital sozinho",
    itens: [
      "Importar a apostila do cursinho em 'Plano do cursinho' agora traz as aulas direto do SUMÁRIO do PDF, sem IA e sem limite de tamanho — antes o recurso era pulado justamente nas apostilas grandes, que são a maioria. Uma apostila de 1.289 páginas com 47 aulas leva alguns segundos.",
      "A disciplina das aulas vem preenchida a partir do nome do arquivo ('10. Direito Ambiental.pdf'), num campo editável acima da lista que vale para todas as aulas do lote.",
      "Materiais: a estrutura por tópicos passou a ser encontrada mesmo quando a página do índice não escreve a palavra 'Índice' (acontecia em um terço das apostilas), e os tópicos aparecem na ordem do documento.",
      "Edital em PDF: o app fica só com o CONTEÚDO PROGRAMÁTICO e ignora vagas, inscrição, recursos e cronograma. O cabeçalho repetido em toda página não vira mais disciplina, e o nome da disciplina impresso de lado na margem passa a ficar no lugar certo.",
      "Quando a apostila é escaneada (sem texto), a IA é chamada só com a IMAGEM da página do índice, em vez do PDF inteiro.",
    ],
  },
  {
    v: "0.8.0",
    data: "agosto/2026",
    titulo: "Espaço: a biblioteca de materiais agora cabe",
    itens: [
      "O PDF original deixou de ficar dentro dos dados do app: fica guardado à parte e é carregado só quando você abre o material. Uma biblioteca que ocupava 489 MB passou a ocupar 36 MB, e salvar ficou quase 4× mais rápido.",
      "A sincronização passou a mandar os dados comprimidos: o mesmo material ocupa cerca de um terço no cofre da nuvem.",
      "No computador, dá para VINCULAR o arquivo original em vez de guardar uma cópia: o app abre o PDF na pasta onde ele já está.",
      "Restaurar o app não apaga mais a chave da IA nem o tema, e a chave da IA passou a ser de cada aparelho (não viaja mais na sincronização).",
      "O grifo em Materiais foi removido (a tela serve para importar, extrair e gerar); grifar continua na Lei Seca.",
    ],
  },
  {
    v: "0.7.1",
    data: "agosto/2026",
    titulo: "Senha de sincronização mais fácil de resgatar",
    itens: [
      "Esqueceu a senha de sincronização? Num aparelho que já está conectado, Configurações → Dados agora tem o botão VER SENHA: ele mostra a senha guardada ali, para você usar nos outros aparelhos.",
      "Ao conectar, dá para guardar uma DICA da senha. Ela fica só naquele aparelho e reaparece quando você for reconectar — inclusive depois de desconectar, que é quando a senha é apagada.",
      "Um link 'Não sei a minha senha' explica o que fazer sem ela: ver a senha num aparelho conectado, trazer tudo por Backup completo + Importar (que não pede senha) ou começar um cofre novo com o que já está no aparelho.",
      "Quem já usa o Mentor em outro aparelho não passa mais pelo formulário de primeira vez: a tela inicial agora pergunta se é a sua primeira vez ou se você já tem conta — e nesse caso pede só a senha.",
      "O 'Backup extra por arquivo' (Google Drive/OneDrive) foi removido: ficava conectado falhando em silêncio e a sincronização por senha já cobre celular e computadores. Para uma cópia à parte, use Backup completo em Configurações → Dados.",
    ],
  },
  {
    v: "0.7.0",
    data: "agosto/2026",
    titulo: "Vários concursos no mesmo app",
    itens: [
      "Agora dá para estudar para MAIS DE UM concurso no mesmo app. Cada concurso guarda o seu próprio edital, materiais, questões, flashcards, histórico, metas e data da prova — nada se mistura.",
      "Para trocar, clique no nome do concurso no alto da tela (no celular, ele fica no topo do menu lateral). Ali também estão 'Novo concurso', 'Renomear' e 'Remover'.",
      "O que é seu e não do concurso continua valendo em todos: tema, chave da IA, notificações, pomodoro, dias de folga, lembretes e as bancas cadastradas.",
      "Criar um concurso novo não mexe no que você já tem: ele nasce vazio e o atual fica intacto. Se criar por engano, dá para voltar ou descartar na mesma tela.",
      "A sincronização continua com UMA senha só: o aparelho onde você digitá-la recebe todos os seus concursos de uma vez.",
      "Seus dados atuais viram automaticamente o seu primeiro concurso, sem que você precise fazer nada.",
    ],
  },
  {
    v: "0.6.4",
    data: "julho/2026",
    titulo: "Estude no celular + sincronização por senha",
    itens: [
      "Agora dá para usar o Mentor no CELULAR: abra o app pelo navegador e use 'Adicionar à tela inicial' — ele vira um ícone e abre em tela cheia, como um aplicativo.",
      "Sincronização por senha entre o celular e os computadores: você escolhe uma senha, digita uma vez em cada aparelho e pronto — o que estuda num aparelho aparece no outro. Tudo é cifrado (só você lê); os PDFs originais ficam em cada aparelho.",
      "Três formas de usar, os mesmos dados: aplicativo de computador (com os recursos nativos, como buscar a lei no Planalto), navegador no computador e navegador no celular.",
      "Lei Seca — marcação rápida de volta: favoritar, marcar como difícil e 'o que mais cai' direto no artigo, num clique no ícone, sem abrir o menu.",
      "Lei Seca — modo foco: botão 'Marcar lido' que marca o artigo e já avança para o próximo (igual à seta).",
      "Gerar com IA ficou mais direto: uma única janela a partir do material importado (ou de um subtópico dele). Mapas mentais agora também perguntam a quantidade, como as demais telas.",
    ],
  },
];

// A "versão de novidades" é a mais recente do changelog.
function ultimaVersao() {
  return NOVIDADES.length ? NOVIDADES[0].v : APP_VERSION;
}

// Há novidade não vista? (config.novidadesVistas guarda a última versão vista)
export function temNovidade(store) {
  const vista = store.get().config.novidadesVistas || "";
  return vista !== ultimaVersao();
}

export function marcarNovidadesVistas(store) {
  store.setConfig({ novidadesVistas: ultimaVersao() });
}

// Abre o painel (janela modal única) e marca como visto.
export function abrirNovidades(store) {
  const corpo = NOVIDADES.map(
    (n) => `
      <div class="nov-bloco">
        <div class="nov-cab"><b>${esc(n.titulo)}</b> <span class="chip chip-count" style="cursor:default">v${esc(n.v)}</span> <span class="muted small">${esc(n.data)}</span></div>
        <ul class="nov-lista">${n.itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      </div>`
  ).join("");
  abrirJanela({
    titulo: "Novidades",
    corpoHTML: `<div class="novidades">${corpo}</div>`,
  });
  marcarNovidadesVistas(store);
}
