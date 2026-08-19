// Central de novidades: UM lugar discreto (sino no topo) para "o que há de novo".
// Anti-modal-fatigue (lição da auditoria): nada de modais empilhados nem tour de N
// passos — badge silencioso quando a versão instalada é mais nova que a última vista.
import { APP_VERSION } from "./erro-log.js";
import { esc } from "./util.js";
import { abrirJanela } from "./ui.js";

// Changelog (mais recente primeiro). Cada versão: { v, data, itens:[...] }.
export const NOVIDADES = [
  {
    v: "0.8.15",
    data: "agosto/2026",
    titulo: "Plano do cursinho enxuto, e os cursos que não são disciplina do edital deixam de ficar sem conferência",
    itens: [
      "MENOS POLUIÇÃO — cada aula volta a ser uma linha: o nome completo, o progresso e um contador (\"3 tópicos do edital\"). Os chips dos tópicos abrem sob demanda, como já acontecia no cartão do material. Com 61 aulas numa disciplina, a diferença é a tela caber.",
      "NOVO — \"Mapear cursos fora do edital\", no menu Mais do plano. Cursos do cursinho que não existem como disciplina no seu edital (\"Legislação Penal Especial\", \"Direitos Difusos e Coletivos\") não tinham régua nenhuma: os vínculos deles nunca eram conferidos, e era daí que sobrava vínculo cruzado mesmo depois de revisar. Agora dá para ligar cada um à disciplina correspondente — com a distribuição real dos vínculos à vista para a escolha não ser palpite — ou marcá-lo como transversal, que é resposta legítima para um curso que cobre várias matérias de verdade.",
      "O editor de tópicos do MATERIAL também recolheu: as disciplinas viraram blocos fechados, abrindo sozinha só a que já tem tópico marcado. Antes ele listava os 400 tópicos do edital de uma vez.",
    ],
  },
  {
    v: "0.8.14",
    data: "agosto/2026",
    titulo: "O nome da aula passa a valer como disciplina — e aí os vínculos errados aparecem",
    itens: [
      "CORREÇÃO — quando a grade nomeia a aula com a matéria na frente (\"Direito Tributário - Aula 01\"), esse prefixo agora define a disciplina da aula. Antes o app usava a disciplina gravada na importação, que nas versões antigas era copiada do PRIMEIRO tópico casado: se o casamento tinha errado de disciplina, a aula inteira ia junto para a disciplina errada, e o \"Revisar vínculos\" da 0.8.13 não via problema nenhum — a régua saía do próprio erro que ela deveria conferir.",
      "Efeito prático: as aulas voltam para a disciplina que o nome delas diz, e os vínculos que apontam para tópicos de outra matéria passam a ser listados pelo \"Revisar vínculos\" (menu Mais do Plano do cursinho), com a lista completa antes de mexer e com desfazer.",
      "A correção de vínculos nunca usa como referência uma disciplina deduzida dos próprios vínculos — seria circular, e todo erro pareceria coerente consigo mesmo. Onde não há prova independente da disciplina, ela não mexe.",
    ],
  },
  {
    v: "0.8.13",
    data: "agosto/2026",
    titulo: "Plano do cursinho: cada aula fica na sua disciplina, e o vínculo não atravessa mais o edital",
    itens: [
      "CORREÇÃO GRAVE — os assuntos de uma aula eram casados com o edital INTEIRO. Uma aula de Direito Penal com o assunto \"Prescrição\" podia se vincular ao tópico \"Prescrição\" de Civil ou de Administrativo, o que joga a aula (e o progresso dela) na disciplina errada. Agora a disciplina da aula limita o casamento: aula de Penal só casa com tópico de Penal.",
      "O plano passa a se organizar pela disciplina do CURSINHO, não pela vinculação ao edital. A \"Aula 00\", que é introdutória e não casa com tópico nenhum, ficava jogada em \"Sem disciplina\" — agora fica no bloco a que pertence, de 00 até o fim.",
      "\"Compatibilizar com IA\" agora faz uma chamada por disciplina, levando só os tópicos dela: a IA não tem como sugerir um tópico de outra matéria. E o sinônimo só é gravado no tópico quando o casamento é de fato aplicado (antes, um palpite recusado já contaminava as importações seguintes).",
      "Na revisão da importação, a disciplina é ESCOLHIDA na lista do seu edital, com a opção \"Outra (fora do meu edital)\" — digitar \"Const.\" onde o edital diz \"Direito Constitucional\" não casava nada, e o erro só aparecia depois. Plano com várias disciplinas mostra um seletor por aula.",
      "Um mesmo texto pode trazer VÁRIAS disciplinas: basta separar em blocos começando pelo nome da matéria (\"DIREITO PENAL\" ou \"Disciplina: Direito Penal\"). Cada bloco pode ter a sua \"Aula 00\" sem conflito — antes elas se atropelavam na hora de atualizar a grade. A ajuda \"Como o app monta o mapa\" foi reescrita conforme o que o app realmente aceita.",
      "NOVO — \"Revisar vínculos\", no menu Mais do plano: encontra os vínculos herdados das importações antigas que apontam para outra disciplina, mostra a lista antes de mexer, corrige e permite DESFAZER. O que já está na disciplina certa não é tocado, inclusive o que você ligou à mão.",
      "NOVO — \"Definir disciplina\" no menu de cada aula, e botão de recolher/expandir tudo no Plano do cursinho e no Dossiê por tópico.",
      "As aulas agora se ordenam pelo NÚMERO dentro da disciplina, e o arrastar saiu. A ordem guardada é a ordem de estudo do Hoje: arrastar na fronteira de duas disciplinas embaralhava essa ordem sem mudar nada na tela — dava para bagunçar o estudo sem perceber.",
      "\"Base de estudo\" mudou-se para Configurações › Estudo, que é onde moram os ajustes do app inteiro (ela muda a ordem das sugestões do Hoje). No plano ficou o atalho.",
      "No registro de sessão, digitar o nome de uma aula que não existe criava-a sem disciplina e podia grudar na aula homônima de outra matéria. Agora casa pelo nome dentro da disciplina do tópico registrado.",
    ],
  },
  {
    v: "0.8.12",
    data: "agosto/2026",
    titulo: "Licença: a chave de assinatura saiu de dentro do aplicativo",
    itens: [
      "SEGURANÇA — o servidor de licenças assinava com um segredo que precisava estar também dentro do app para ele conferir. Como o aplicativo é instalado em cada máquina e o código é público, esse segredo era público: com ele daria para forjar uma licença eterna para qualquer máquina, e uma licença revogada nunca mais seria alcançada. Agora o servidor assina com chave privada (que só ele tem) e o app apenas verifica com a chave pública — verificar não dá poder de assinar. É o mesmo modelo que o app já usava para conferir as atualizações.",
      "A licença se revalida sozinha na primeira abertura com internet: não é preciso digitar chave nenhuma. Máquinas ainda na versão antiga continuam funcionando durante a transição.",
    ],
  },
  {
    v: "0.8.11",
    data: "agosto/2026",
    titulo: "Escolher tópico ficou usável, e a IA passou a gerar para vários de uma vez",
    itens: [
      "Todo lugar em que se escolhe um tópico (Registrar Sessão, vincular questões, filtro, Hoje, Dossiê, Mapas Mentais) trocou a lista corrida de centenas de opções por uma lista agrupada por disciplina, com busca.",
      "Gerar com IA passou a aceitar VÁRIOS tópicos de uma vez (materiais, flashcards, questões, mapa mental, resumo, revisão): a quantidade pedida é dividida entre os selecionados, garantindo que todos entrem na geração — antes só o primeiro entrava.",
      "Modo Foco: dá para riscar alternativa (tesoura, reversível), a resposta agora é selecionar + confirmar em vez de valer no primeiro clique, e a tela não recarrega mais a cada ação. Atalhos por letra (A–F).",
      "Cronômetro: tela cheia voltou como opção própria; a janelinha flutuante foi desabilitada no celular, onde não funciona.",
      "Plano do cursinho: o app passou a reconhecer o nome da disciplina como cabeçalho de bloco mesmo sem escrever \"Disciplina:\".",
      "Plano de hoje mostra as tarefas avulsas pendentes e as concluídas no dia; mais níveis de dificuldade na geração de questões.",
    ],
  },
  {
    v: "0.8.10",
    data: "agosto/2026",
    titulo: "Olho da senha de sincronização — faltava no campo de Configurações",
    itens: [
      "CORREÇÃO — o campo de senha da sincronização em Configurações > Dados nunca teve o botão de mostrar/ocultar (só o do onboarding tinha). Digitar uma frase longa sem poder conferir é erro na certa. Agora tem o mesmo olho dos outros campos de senha do app.",
    ],
  },
  {
    v: "0.8.9",
    data: "agosto/2026",
    titulo: "A guarda de sincronização agora protege o CONTEÚDO dos materiais, não só a quantidade",
    itens: [
      "CORREÇÃO GRAVE — a guarda anti-perda da sincronização só olhava a QUANTIDADE de itens (documentos, tópicos...). Um aparelho que já tinha ficado com o texto de um material vazio (o bug da v0.8.8) continuava com o MESMO NÚMERO de documentos, então a guarda não via problema e deixava ele sobrescrever o cofre bom com uma cópia sem texto nenhum. Agora a guarda também pesa o texto extraído de dentro dos materiais — se ele encolher demais, pede confirmação em vez de sobrescrever sozinha.",
    ],
  },
  {
    v: "0.8.8",
    data: "agosto/2026",
    titulo: "O texto extraído do material voltava vazio em quem só recebia por sincronização",
    itens: [
      "CORREÇÃO GRAVE — no navegador e no celular (que só recebem material por sincronização, nunca importam o PDF), o texto extraído das páginas e os tópicos do sumário apareciam vazios. A sincronização baixava o conteúdo certo, mas o app o descartava antes de gravá-lo em disco. No computador que importou o PDF nunca deu para notar, porque ele grava o texto pelo caminho normal (extração), não pela sincronização.",
      "Corrigido também um efeito colateral: baixar dados da nuvem fazia o aparelho parecer sempre \"o mais novo\", arriscando reenviar (e sobrescrever) o que outro aparelho tivesse acabado de editar.",
      "Sumário do material: o nome do tópico do edital, quando muito longo, agora encurta com \"…\" e mostra o nome inteiro ao passar o mouse — mesmo tratamento que já existia nos tópicos vinculados do cartão do material.",
    ],
  },
  {
    v: "0.8.7",
    data: "agosto/2026",
    titulo: "O cronômetro flutuante não liga mais sozinho, e desiste com elegância onde não funciona",
    itens: [
      "CORREÇÃO — abrir a janelinha flutuante podia INICIAR o cronômetro sozinho. Era o app confundindo o «tocar» interno do vídeo (que é como a janelinha é feita) com um comando seu.",
      "Onde a janelinha não abre de verdade — o caso do iPad e do iPhone —, o app agora percebe na primeira tentativa, abre «só o cronômetro» no lugar e não volta a oferecer a janelinha naquele aparelho. Antes o botão aceitava o clique e não acontecia nada.",
    ],
  },
  {
    v: "0.8.6",
    data: "agosto/2026",
    titulo: "A barra do iPad não invade mais o app, e o cronômetro flutuante ficou nítido",
    itens: [
      "CORREÇÃO no iPad/iPhone — a hora, a data e a bateria do sistema apareciam POR CIMA da barra do app, uma escrita sobre a outra. O app desenha sob a barra do sistema de propósito (para usar a tela toda), mas só reservava espaço embaixo; agora reserva no topo também.",
      "Campo de senha ganhou o botão de MOSTRAR/OCULTAR. Digitar uma frase longa sem poder conferir era erro na certa.",
      "O cronômetro flutuante ficou NÍTIDO: a janelinha era desenhada em resolução baixa e esticada, o que deixava o relógio embaçado.",
      "No iPad e no iPhone o botão de flutuar não aparece mais — ele não podia funcionar ali (o navegador do iOS não deixa transformar o desenho do relógio em vídeo, e é assim que a janelinha é feita; vale para Chrome e Edge também, que no iOS usam o mesmo motor do Safari). No lugar dele há «abrir só o cronômetro»: adicione essa página à Tela de Início e use-a numa janela pequena ao lado do outro aplicativo.",
      "Primeira tela: saiu o rodapé «funciona sem internet e sem cadastro · a IA é opcional».",
    ],
  },
  {
    v: "0.8.5",
    data: "agosto/2026",
    titulo: "A nota da tarefa sai do tooltip, e o PDF baixa com o nome do material",
    itens: [
      "A NOTA de uma tarefa aparecia na mesma linha do título, cortada, e o texto completo só ao passar o mouse. Agora ocupa a linha de baixo, mostrando as duas primeiras linhas, com «mais» quando há mais que isso — e o link virou clicável, o que importa nas tarefas importadas da trilha (cada uma traz a orientação do professor e o endereço da aula).",
      "O leitor de PDF ganhou um «Baixar» na barra do app, que abre a caixa de salvar do sistema já com o NOME DO MATERIAL. O «salvar» do leitor do navegador propõe um nome interno (um código), e não há como mudar isso de fora.",
      "Trilha: a instrução de uma tarefa podia terminar no meio de um parêntese («… tópicos 2.7 a 2.20. (PDF»), porque no PDF ela é uma linha que não caberia. Agora emenda a continuação.",
    ],
  },
  {
    v: "0.8.4",
    data: "agosto/2026",
    titulo: "A trilha do cursinho vira tarefas, e o PDF passa a ser lido no seu computador",
    itens: [
      "NOVO — importe o PDF da TRILHA semanal do cursinho em Planejamento ▸ Tarefas avulsas ▸ «Adicionar tarefas» ▸ «Importar de arquivo»: o app recorta as metas numeradas («TAREFA 01», «TAREFA 02»…) na ordem do arquivo, cada uma com o link e a observação do cursinho. A tabela de sugestão de cronograma é ignorada de propósito — as tarefas entram sem dia, e você distribui como quiser. Antes o mesmo arquivo virava 8 tarefas inventadas a partir das primeiras páginas.",
      "PDF com texto agora é lido NO SEU COMPUTADOR, e a IA só entra quando o arquivo é escaneado. A ordem era a inversa — todo PDF subia inteiro para a IA antes de qualquer tentativa —, o que gastava cota, demorava, quebrava quando a rede oscilava e ainda deixava o modelo reescrever o que estava escrito.",
      "Arquivo que está «só na nuvem» (OneDrive/Drive) não podia ser lido e a mensagem só dizia «não consegui ler». Agora o app explica: abra o arquivo uma vez para baixá-lo, ou marque «Manter sempre neste dispositivo».",
      "NOVO — «Refazer sumário», nas opções (···) do material: monta o sumário de novo a partir do texto que já está no app. Diferente de «Atualizar material», ele NÃO relê o arquivo — então não perde o que a Visão transcreveu das páginas escaneadas.",
    ],
  },
  {
    v: "0.8.3",
    data: "agosto/2026",
    titulo: "A biblioteca inteira de uma vez, o PDF no leitor de verdade e os temas que mais caem",
    itens: [
      "O PDF agora abre no leitor do PRÓPRIO navegador: seleção de texto, busca, zoom com Ctrl+roda, página inteira, girar, miniaturas, imprimir e salvar — tudo o que você já conhece, sem uma imitação pela metade. O app entra só com o título, a tela cheia (F11) e o fechar, e abre direto na página do tópico que você clicou.",
      "NOVO — «temas que mais caem» a partir de um material seu. Se você tem um raio-x da banca (aquele PDF com o percentual de cada tema por disciplina), o Edital lê os números e propõe o nível de relevância de cada tópico. Não usa IA nem internet: os números já estão no material. A lista mostra DE ONDE veio cada sugestão e também o que NÃO achou par no seu edital — porque um tema grande às vezes está repartido em vários itens e precisa ser marcado à mão.",
      "NOVO — o cronômetro pode FLUTUAR por cima dos outros aplicativos (botão na janelinha do cronômetro), para acompanhar o tempo estudando em outro programa. No computador a janelinha traz play/pausa; zerar e trocar de modo seguem no app.",
      "Escrita: a foto da resposta manuscrita aceita VÁRIAS folhas de uma vez, ou o PDF exportado do tablet. Uma sentença tem várias páginas, e antes era uma foto por vez.",
      "Materiais: os nomes das três visões diziam a mesma coisa e nenhum descrevia o que fazia. «Ver texto extraído» abria o SUMÁRIO; agora é «Ver sumário». Quem mostra o texto lido do arquivo passou a se chamar «Ver texto extraído», e o editor virou «Editar sumário».",
      "CORREÇÃO — sumário de material cujo índice numera com ponto e sem subnível («1. Direito Constitucional …… 4») saía vazio ou errado, e a página anotada no próprio índice se perdia. Corrigido, junto com o caso de material que reenumera «1., 2., 3.» dentro de cada capítulo — o app montava o sumário com os temas de um capítulo qualquer no lugar dos capítulos.",
      "CORREÇÃO — a etiqueta «página escaneada» mentia: páginas que já tinham texto continuavam marcadas como pendentes. Agora só aparece quando a página está mesmo sem texto.",
      "Dá para escolher VÁRIOS arquivos de uma vez em «Adicionar material»: eles entram numa fila e o app importa um a um, mostrando «Importando 3 de 17». Importar a biblioteca de um cursinho deixou de ser uma tarde de cliques.",
      "Ao ler um PDF grande, a etapa «Lendo o PDF» agora conta as páginas («página 340 de 1.289»). Antes eram minutos de tela parada.",
      "Depois de salvar, o botão mostra «Salvando…» e só libera quando o material está mesmo no disco — antes a janela parecia pronta e o clique seguinte se perdia.",
      "CORREÇÃO IMPORTANTE — o sumário do material ia para a página errada. Com a IA conectada, o app deixava a leitura por imagem do índice passar por cima do sumário que ele já tinha lido corretamente do próprio PDF; e, dentro do leitor determinístico, um link da plataforma («?topic=10.5») tinha prioridade sobre o índice e sobre o título no corpo. Medido nas 17 apostilas do cursinho (339 tópicos de material): 260 e 117 acertos, contra 339 agora. Se você importou material antes desta versão, use «Atualizar material» para refazer o sumário.",
      "O app ficou MUITO mais leve com biblioteca grande: o texto das páginas, o índice de busca por significado e os PDFs saíram do arquivo de estado, que era reescrito inteiro a cada clique. Com 17 apostilas (9.105 páginas), cada gravação caiu de 43 MB para menos de 2 MB.",
      "Os PDFs passaram a ser gravados como arquivo, não como texto codificado: a mesma biblioteca ocupa cerca de 25% menos espaço em disco.",
      "Os tópicos do edital que um material cobre agora ficam recolhidos numa linha só («16 tópicos do edital · Direito Administrativo +6»), que abre quando você quiser — o cartão de uma apostila virava um parágrafo de etiquetas.",
      "CORREÇÃO — os tópicos vinculados estavam errados em quase metade dos casos. O app casava o título do capítulo com o edital INTEIRO, então bastava uma palavra em comum: «Administração Pública», numa apostila de Constitucional, virava «crimes contra a administração pública» (Penal). Agora o casamento acontece primeiro dentro da disciplina do próprio material e, na dúvida, ele não vincula — vínculo errado contava como edital coberto. Medido na biblioteca real: 64% → 95% de acerto.",
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
