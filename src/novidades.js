// Central de novidades: UM lugar discreto (sino no topo) para "o que há de novo".
// Anti-modal-fatigue (lição da auditoria): nada de modais empilhados nem tour de N
// passos — badge silencioso quando a versão instalada é mais nova que a última vista.
import { APP_VERSION } from "./erro-log.js";
import { esc } from "./util.js";
import { abrirJanela } from "./ui.js";

// Changelog (mais recente primeiro). Cada versão: { v, data, itens:[...] }.
export const NOVIDADES = [
  {
    v: "0.8.3",
    data: "agosto/2026",
    titulo: "A biblioteca inteira de uma vez, e o sumário no lugar certo",
    itens: [
      "Dá para escolher VÁRIOS arquivos de uma vez em «Adicionar material»: eles entram numa fila e o app importa um a um, mostrando «Importando 3 de 17». Importar a biblioteca de um cursinho deixou de ser uma tarde de cliques.",
      "Ao ler um PDF grande, a etapa «Lendo o PDF» agora conta as páginas («página 340 de 1.289»). Antes eram minutos de tela parada.",
      "Depois de salvar, o botão mostra «Salvando…» e só libera quando o material está mesmo no disco — antes a janela parecia pronta e o clique seguinte se perdia.",
      "CORREÇÃO IMPORTANTE — o sumário do material ia para a página errada. Com a IA conectada, o app deixava a leitura por imagem do índice passar por cima do sumário que ele já tinha lido corretamente do próprio PDF; e, dentro do leitor determinístico, um link da plataforma («?topic=10.5») tinha prioridade sobre o índice e sobre o título no corpo. Medido nas 17 apostilas do cursinho (339 tópicos de material): 260 e 117 acertos, contra 339 agora. Se você importou material antes desta versão, use «Atualizar material» para refazer o sumário.",
      "O app ficou MUITO mais leve com biblioteca grande: o texto das páginas, o índice de busca por significado e os PDFs saíram do arquivo de estado, que era reescrito inteiro a cada clique. Com 17 apostilas (9.105 páginas), cada gravação caiu de 43 MB para menos de 2 MB.",
      "Os PDFs passaram a ser gravados como arquivo, não como texto codificado: a mesma biblioteca ocupa cerca de 25% menos espaço em disco.",
      "Os tópicos do edital que um material cobre agora ficam recolhidos numa linha só («16 tópicos do edital · Direito Administrativo +6»), que abre quando você quiser — o cartão de uma apostila virava um parágrafo de etiquetas.",
      "CORREÇÃO — os tópicos vinculados estavam errados em quase metade dos casos. O app casava o título do capítulo com o edital INTEIRO, então bastava uma palavra em comum: «Administração Pública», numa apostila de Constitucional, virava «crimes contra a administração pública» (Penal). Agora o casamento acontece primeiro dentro da disciplina do próprio material e, na dúvida, ele não vincula — vínculo errado contava como edital coberto. Medido na biblioteca real: 64% → 95% de acerto.",
      "O PDF agora abre no leitor do PRÓPRIO navegador: seleção de texto, busca, zoom com Ctrl+roda, página inteira, girar, miniaturas, imprimir e salvar — tudo o que você já conhece, sem uma imitação pela metade. O app entra só com o título, a tela cheia (F11) e o fechar, e abre direto na página do tópico que você clicou.",
      "Escrita: a foto da resposta manuscrita aceita VÁRIAS folhas de uma vez, ou o PDF exportado do tablet. Uma sentença tem várias páginas, e antes era uma foto por vez.",
      "Materiais: os nomes das três visões diziam a mesma coisa e nenhum descrevia o que fazia. «Ver texto extraído» abria o SUMÁRIO; agora é «Ver sumário». Quem mostra o texto lido do arquivo passou a se chamar «Ver texto extraído», e o editor virou «Editar sumário».",
      "NOVO — «temas que mais caem» a partir de um material seu. Se você tem um raio-x da banca (aquele PDF com o percentual de cada tema por disciplina), o Edital lê os números e propõe o nível de relevância de cada tópico. Não usa IA nem internet: os números já estão no material. A lista mostra de onde veio cada sugestão e o que NÃO achou par no seu edital, para você marcar à mão.",
      "NOVO — o cronômetro pode FLUTUAR por cima dos outros aplicativos (botão na janelinha do cronômetro), para acompanhar o tempo estudando em outro programa. No computador ele traz play/pausa; zerar e trocar de modo seguem no app.",
      "«Ler figuras e tabelas»: a IA lê as páginas com imagem e escreve o que elas mostram, para o conteúdo delas entrar na busca e nas gerações. Um clique faz todas as que faltam, em todos os materiais, e dá para parar no meio e retomar de onde parou. Antes isso rodava sozinho na importação (estourando a cota da IA) e, pior, parava em silêncio nas 30 primeiras páginas de cada material.",
      "A etiqueta «página escaneada» do cartão agora é clicável: leva direto ao aviso que processa a página. Antes ela informava o problema e não oferecia saída.",
      "Materiais: o material é agrupado pela disciplina que ele mais cobre (não mais pelo primeiro tópico vinculado), e a etiqueta de tópico do cartão mostra só o começo do item, com o texto completo no tooltip — o cartão de uma apostila virava um parágrafo.",
    ],
  },
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
