// Conteúdo do GUIA do sistema (manual de uso). Fica separado da tela para ser, ao mesmo
// tempo, renderizado pela tela Ajuda (ajuda.js) e PESQUISÁVEL pelo Assistente/chat
// (store.recuperarTrechos → buscarNoGuia). Módulo só de dados: não importa UI.
// Convenções: títulos SEM emoji/glifo (o ícone Lucide entra na tela); recursos que
// dependem de IA conectada são marcados com "(IA)" no texto.

// Cada seção: { id, grupo (ou null = topo), titulo, html }.
export const GUIA = [
  {
    id: "ciclo",
    grupo: null,
    titulo: "Como o app funciona (o ciclo de aprendizado)",
    html: `
      <p>O app organiza o estudo num ciclo, e a barra lateral segue esse ciclo em grupos: <b>Rotina</b>, <b>Estudar</b>, <b>Praticar</b> e <b>Revisar</b>.</p>
      <ul>
        <li><b>Estudar</b> — Edital, Materiais, Lei Seca, Jurisprudência, Resumos e Mapas mentais.</li>
        <li><b>Praticar</b> — Questões (múltipla escolha e Certo/Errado na mesma tela), Discursiva e Simulados.</li>
        <li><b>Revisar</b> — Revisões (a central), Flashcards e Caderno de Erros.</li>
        <li><b>Rotina</b> — Hoje, Planejamento, Acompanhamento e o <b>Mentor</b>, que analisa seu desempenho e sugere os próximos passos.</li>
      </ul>
      <p>Tudo gira em torno do <b>Edital</b> (disciplinas e tópicos): cada conteúdo pode ser vinculado a um tópico, e o <b>Dossiê</b> reúne tudo de um tópico num lugar só.</p>`,
  },

  { id: "hoje", grupo: "Rotina", titulo: "Hoje", html: `
      <p>Sua tela de partida — reúne o que importa agora.</p>
      <ul>
        <li><b>Revisões de hoje</b> — hub com flashcards vencidos, lei/jurisprudência, tópicos, mapas e resumos a revisar; cada item abre a tela certa.</li>
        <li><b>Registrar sessão</b> — pelo cronômetro ou lançamento manual, num fluxo de <b>4 etapas</b> (Essenciais, Tempo, Materiais, Finalização). A faixa <b>"Detectei hoje no app"</b> preenche com um toque as questões e flashcards que você já fez aqui; na Finalização dá para marcar o tópico como concluído e programar a revisão (escada editável).</li>
        <li><b>Cronômetro flutuante</b> — botão no canto inferior direito, presente em todas as telas (inclusive no Modo Foco), com os modos Cronômetro, Timer e Pomodoro (durações configuráveis).</li>
        <li><b>Lembretes</b> — recados rápidos (texto e, se quiser, uma data), num card do Hoje e num botão flutuante acima do cronômetro; marque como concluído quando resolver.</li>
        <li>Aviso da prova (dias restantes) e o resumo do dia.</li>
      </ul>` },

  { id: "planejamento", grupo: "Rotina", titulo: "Planejamento (Cronograma da semana)", html: `
      <p>Suas <b>tarefas</b> da semana, em três formas que convivem:</p>
      <ul>
        <li><b>Soltas</b> — lista livre, sem dia.</li>
        <li><b>Rotina semanal</b> — modelos recorrentes (ex.: toda segunda: X).</li>
        <li><b>Datadas</b> — num dia específico (arrastáveis entre os dias); dá para marcar <b>dias de folga</b>.</li>
        <li><b>Pedir plano ao Mentor</b> (IA) — a partir de um diagnóstico (tempo/dia e nível por disciplina), monta tarefas datadas priorizando relevância e lacunas, com <b>preview editável</b>; também refina o plano e corrige a rota das atrasadas.</li>
        <li><b>Importar</b> um cronograma externo (a IA estrutura) e <b>exportar</b> (.ics, .csv, .json ou imprimir).</li>
      </ul>` },

  { id: "acompanhamento", grupo: "Rotina", titulo: "Acompanhamento", html: `
      <p>Sua evolução num relance:</p>
      <ul>
        <li><b>Constância</b> — mapa de calor dos seus dias: mais escuro = mais tempo estudado. Dia sem estudo não pune; dia de folga tem marca própria.</li>
        <li><b>Comportamental</b> (IA) — o Mentor lê horários e regularidade e aponta quando você rende mais e o que anda esquecido.</li>
        <li><b>Indicadores</b> — cobertura do edital, aproveitamento, tempo na semana e contagem regressiva da prova.</li>
        <li><b>Por disciplina</b> — um card por disciplina (anel de aproveitamento, cobertura, tempo); clique para abrir o <b>Painel da disciplina</b>.</li>
        <li><b>Gráficos, metas, calendário</b> e a tabela de <b>sessões</b> (ordenável, com filtros; dá para editar ou apagar).</li>
      </ul>` },

  { id: "mentor", grupo: "Rotina", titulo: "Mentor IA (Análise do progresso)", html: `
      <p>O Mentor lê seu panorama e <b>sugere</b> ações — nunca executa sozinho (você sempre aprova). O botão flutuante de conversa é o <b>mesmo Mentor</b> (ver "Mentor em conversa").</p>
      <ul>
        <li><b>Pontos de atenção</b> (offline) — cobertura baixa, aproveitamento abaixo da meta, flashcards/erros acumulados, revisões vencidas; cada ponto tem um botão que leva à tela certa.</li>
        <li><b>Análise com IA</b> — sugere um <b>mix</b> para aprovar: metas, flashcards, questões, resumos e leituras de lei/jurisprudência.</li>
        <li><b>Análise automática semanal</b> — com a IA conectada, roda sozinha uma vez por semana; desligue em Configurações → IA.</li>
        <li><b>KPIs clicáveis</b> e a indicação de há quanto tempo você não analisa.</li>
      </ul>
      <p>Diferença para o Planejamento: o Cronograma monta tarefas <b>datadas</b>; a Análise lê o progresso e propõe um mix para aprovar.</p>` },

  { id: "edital", grupo: "Estudar", titulo: "Edital", html: `
      <p>A espinha do app: disciplinas e tópicos. Adicione manualmente, cole o texto ou importe de arquivo (PDF/imagem, inclusive escaneado, também arrastando). Com IA a organização é automática; sem IA, a separação é offline. Nos dois casos há <b>preview editável</b> antes de aplicar. Cada tópico tem:</p>
      <ul>
        <li><b>Relevância</b> ("o quanto cai") — faixa com % ou "Mais cai (sem %)"; sincronizada com o Dossiê.</li>
        <li><b>Concluído</b> — o botão de marcar ao lado do tópico indica que você já o estudou (é o que conta para a <b>cobertura</b>).</li>
        <li><b>Semáforo de aproveitamento</b> — bolinha verde/âmbar/vermelha conforme seu desempenho nas questões do tópico.</li>
        <li><b>Selecionar tópicos</b> — modo de reorganização em lote (mover, unificar ou virar nova disciplina).</li>
        <li><b>Checklist da banca</b> (opcional) — confere a sua cobertura contra o edital oficial, sem mudar a sua estrutura.</li>
        <li><b>Plano do cursinho</b> (opcional) — cole ou importe o PDF das aulas; o app casa cada assunto com os seus tópicos e, com a base de estudo "Cursinho", o Hoje sugere na ordem das aulas.</li>
      </ul>` },

  { id: "materiais", grupo: "Estudar", titulo: "Materiais", html: `
      <p>Sua base de conteúdo: importe <b>PDF, imagem ou texto</b> (também arrastando o arquivo).</p>
      <ul>
        <li>O texto é extraído automaticamente; páginas escaneadas ou com tabela ficam pendentes e podem ser processadas <b>sob clique</b> pela Visão/OCR (IA), página a página.</li>
        <li><b>Busca no material</b> — palavra exata, offline, conforme você digita.</li>
        <li><b>Busca por significado</b> (IA) — acha pelo sentido; é preciso indexar ("separar") os materiais antes.</li>
        <li>Cada material pode ser <b>grifado</b> (selecione o texto) e ter os <b>tópicos detectados</b> pela IA para agendar revisão.</li>
      </ul>` },

  { id: "leijuris", grupo: "Estudar", titulo: "Lei Seca · Jurisprudência", html: `
      <p>Telas gêmeas, cada uma com <b>três abas</b> — pense nelas como verbos: <b>Ler</b> (a letra), <b>Estudar</b> (praticar) e <b>Metas</b> (planejar).</p>
      <ul>
        <li><b>Ler</b> — a lista com o texto dos dispositivos. Para <b>grifar, selecione o trecho</b>: um menu flutuante aparece com as cores, comentar, copiar e perguntar à IA (não há painel de pincéis). A barra do leitor <b>se oculta ao rolar</b>, sobrando tela para o texto. O botão de estrela marca <b>"O que mais cai"</b> (incidência), que vira mini-barra no próprio artigo. No menu <b>⋯</b> de cada item: ler em foco, abrir na fonte oficial, marcar para revisar, editar, revogar/cancelar e remover.</li>
        <li><b>Estudar</b> — lançador em tela cheia: <b>Certo/Errado</b> (na lei, com diff colorido), <b>Completar a letra</b> (lacunas), <b>Revisar o que vence</b> e <b>Refazer meus erros</b>; na jurisprudência, também a <b>Súmula-duelo</b> (número ou tribunal trocado). Escolha o escopo (tudo ou o que mais cai); <b>um clique já começa</b> no padrão e em <b>Opções…</b> você ajusta quantidade e dificuldade — dá ainda para gerar flashcards e questões do escopo.</li>
        <li><b>Metas</b> — metas cruas de leitura (ex.: "ler art. 1º a 20"), sem transcrever a letra; cada meta vira <b>tarefa no Planejamento</b>, e dá para importar um cronograma inteiro e dividir em etapas.</li>
        <li><b>Importar (aba Ler)</b> — um só botão: na lei, letra oficial (Planalto no app desktop, ou colar — o app detecta o que está revogado) ou lista/PDF; na jurisprudência, súmulas/teses ou o informativo (separável em teses). Tudo com preview editável.</li>
        <li><b>Manter atualizado (só lei)</b> — "Conferir atualização" reconsulta a fonte e mostra por diff o que mudou, entrou ou foi revogado; vira selo de novidade filtrável.</li>
        <li><b>Jurisprudência</b> — marque cancelada/superada (sai do estudo, fica riscada), classifique como Súmula Vinculante e registre o ano do entendimento (o app avisa quando é antigo); súmula que cita um artigo aparece ligada a ele.</li>
      </ul>` },

  { id: "resumos", grupo: "Estudar", titulo: "Resumos", html: `
      <p>Anotações em <b>texto rico</b> (negrito, cores, listas), por disciplina e tópico.</p>
      <ul>
        <li>Importe de PDF/texto ou <b>gere um rascunho</b>: compilando (offline, fiel ao conteúdo) ou pedindo à IA para sintetizar por tópico, aula ou material.</li>
        <li><b>Grife</b> o texto selecionando o trecho (marcação).</li>
        <li><b>Revisão espaçada</b> — programe a revisão (24h/7/15/30); ao vencer, escolha <b>Reler</b> ou <b>Recordar</b> (esconde o conteúdo até você revelar) e avalie Esqueci/Lembrei/Fácil.</li>
        <li>Os vencidos aparecem no hub "Revisões de hoje" e na tela <b>Revisões</b>.</li>
      </ul>` },

  { id: "mapas", grupo: "Estudar", titulo: "Mapas mentais", html: `
      <p>Mapas por tópico, para enxergar a estrutura do assunto.</p>
      <ul>
        <li><b>Gerar</b> com IA a partir dos seus conteúdos, colar um outline (offline) ou importar de arquivo.</li>
        <li>Guardados como <b>árvore</b> (ramos que expandem/recolhem); dá para imprimir e gerar flashcards/questões do mapa.</li>
        <li><b>Revisão espaçada</b> própria — os vencidos aparecem no Hoje e na tela Revisões.</li>
      </ul>` },

  { id: "questoes", grupo: "Praticar", titulo: "Questões (múltipla escolha e Certo/Errado)", html: `
      <p>Banco de questões numa tela só: o <b>seletor</b> no topo alterna entre <b>Múltipla escolha</b> e <b>Certo/Errado</b>.</p>
      <ul>
        <li><b>Treino</b> — responda, veja o gabarito e o comentário; o erro vai para o <b>Caderno de Erros</b>.</li>
        <li><b>Filtros</b> por tópico e situação (pendentes/acertei/errei) e o botão <b>Treinar erros</b> (refaz as erradas em branco).</li>
        <li><b>Adicionar</b> — digitar/colar, importar de arquivo, ou extrair/gerar com IA a partir de um material.</li>
        <li><b>Modo foco</b> — uma a uma, em tela cheia, com correção imediata, comentário da IA e placar; atalhos: 1–4 (ou C/E) respondem, Espaço avança.</li>
        <li>Para prova cronometrada com gabarito só no fim, use <b>Simulados</b>.</li>
      </ul>` },

  { id: "discursiva", grupo: "Praticar", titulo: "Discursiva e redação", html: `
      <p>Escreva o tema/enunciado e a sua resposta e peça a <b>correção</b> (IA) no nível de um examinador de banca.</p>
      <ul>
        <li>Correção estruturada: <b>Macroestrutura</b> (conteúdo e base legal), <b>Mesoestrutura</b> (coesão e proporção), <b>Microestrutura</b> (erros gramaticais um a um) e <b>Nota 0–10</b> com memória de cálculo, além de pontos fortes e como melhorar.</li>
        <li>Offline, dá métricas estruturais.</li>
        <li>Dá para <b>gerar um tema</b> com IA, transformar a correção em flashcard ou enviar ao Caderno de Erros.</li>
        <li>No <b>histórico</b>, o botão <b>Comparar</b> põe a sua resposta e a correção lado a lado.</li>
      </ul>` },

  { id: "simulados", grupo: "Praticar", titulo: "Simulados", html: `
      <p>Tela única para <b>fazer</b> e <b>acompanhar</b> simulados.</p>
      <ul>
        <li><b>Fazer</b> — monte um simulado (múltipla escolha e/ou Certo/Errado) a partir dos filtros, responda <b>cronometrado</b> e veja gabarito e desempenho (geral e por disciplina) só <b>no fim</b>, como numa prova real.</li>
        <li><b>Histórico</b> — sua evolução: os simulados feitos aqui entram sozinhos, e dá para <b>registrar um simulado externo</b>.</li>
        <li>Mostra total de simulados, questões, média, melhor resultado e a curva ao longo do tempo.</li>
      </ul>` },

  { id: "central-revisoes", grupo: "Revisar", titulo: "Revisões (a central)", html: `
      <p>A tela <b>Revisões</b> reúne <b>tudo o que vence</b> num lugar só — tópicos, resumos, mapas, lei/jurisprudência e flashcards — como uma visão sincronizada: fez a revisão em qualquer tela, some daqui.</p>
      <ul>
        <li><b>Filtros</b> por status (atrasadas/hoje/próximas/concluídas), disciplina e tipo; reprograme, conclua ou traga as atrasadas para hoje.</li>
        <li><b>Baixa graduada</b> — ao concluir, avalie: <b>Esqueci</b> (reinicia a curva, volta em 24h), <b>Lembrei</b> (sobe um degrau) ou <b>Fácil</b> (sobe dois).</li>
        <li><b>Revisar tudo em foco</b> — percorre as vencidas uma a uma, em tela cheia: tente recordar, revele o conteúdo e avalie (teclas 1/2/3; Espaço pula). Tem cronômetro e placar.</li>
        <li>Ao <b>final da sessão em foco</b>, dá para <b>emendar os flashcards</b> vencidos — fecha o dia num funil só.</li>
        <li>Mostra a <b>taxa de conclusão</b> (30 dias).</li>
      </ul>` },

  { id: "flashcards", grupo: "Revisar", titulo: "Flashcards", html: `
      <p>Revisão espaçada no nível do card (SRS).</p>
      <ul>
        <li>Ao revisar, avalie <b>Errei / Difícil / Bom / Fácil</b> — intervalos fixos por nota (1 / 7 / 15 / 30 dias).</li>
        <li>Crie manualmente (frente ; verso), importe de arquivo, ou gere: do material (IA) e das questões (offline).</li>
        <li>Na revisão dá para <b>comentar com IA</b> (explica o porquê) e mandar ao Caderno de Erros.</li>
        <li><b>Modo foco</b> — revisão imersiva em tela cheia, com virada do card e placar; atalhos: 1–4 dão a nota, Espaço vira, setas navegam.</li>
      </ul>` },

  { id: "revtopico", grupo: "Revisar", titulo: "Revisão de Tópicos", html: `
      <p>A curva do esquecimento no nível do <b>tópico estudado</b> (não do card). Não é um item da barra: chegue pela tela <b>Revisões</b> ou pelo hub do Hoje. Opcional (liga nas Configurações).</p>
      <ul>
        <li>Cada sessão de Estudo entra na fila em 24h.</li>
        <li>Ao revisar, escolha <b>só reler</b> as palavras-chave ou <b>escrever de memória</b> (recordação ativa, com avaliação por IA opcional).</li>
        <li>Depois, <b>Esqueci/Lembrei/Fácil</b> reagendam na escada 1·7·15·30·60·120.</li>
        <li>O que se relê vem das palavras-chave grifadas em amarelo, do resumo ou do material.</li>
      </ul>` },

  { id: "caderno", grupo: "Revisar", titulo: "Caderno de Erros", html: `
      <p>Junta os erros de questões (automático) e os erros manuais que você adicionar.</p>
      <ul>
        <li>Classifique por <b>motivo</b> (Não sabia / Esqueci / Interpretação / Distração-Pegadinha), filtre e ordene.</li>
        <li>Dá para <b>comentar com IA</b> e gerar flashcard do erro.</li>
        <li>Tirar um erro do caderno não apaga a tentativa (o aproveitamento continua valendo).</li>
        <li><b>Refazer em foco</b> — reabre as questões erradas do filtro atual, uma a uma, em branco; quando você acerta, o erro sai do caderno.</li>
      </ul>` },

  { id: "dossie", grupo: "Recursos que atravessam as telas", titulo: "Dossiê por tópico (pasta viva)", html: `
      <p>Reúne, resumido e linkado, tudo de um tópico: materiais, resumos, marcações, lei/jurisprudência, pontos que mais caem, questões e desempenho, erros, flashcards, tarefas e sessões.</p>
      <ul>
        <li><b>Clique em qualquer item</b> para abri-lo na tela dele (deep-link).</li>
        <li>Os números do topo rolam até a seção; seções longas vêm recolhidas ("ver mais/menos").</li>
        <li>Na <b>impressão</b> você escolhe quais seções incluir, e elas saem sempre integrais.</li>
      </ul>` },

  { id: "marcacao", grupo: "Recursos que atravessam as telas", titulo: "Marcação tricromática", html: `
      <p>Grifos com significado <b>fixo</b>: <b>amarelo</b> = palavras-chave · <b>azul</b> = prazos e valores · <b>vermelho</b> = restritivas (salvo, exceto, vedado…). Há também cores de uso livre (verde, roxo, laranja) e <b>comentários</b> em trechos.</p>
      <ul>
        <li>Funciona em <b>Lei Seca, Jurisprudência, Resumos e Material</b>: <b>selecione o texto</b> e o menu flutuante aparece.</li>
        <li><b>Auto</b> marca prazos/restritivas offline; a IA pode sugerir as palavras-chave.</li>
        <li>Modos de leitura: texto completo, só as marcas e Recordar (lacunas).</li>
        <li>As palavras-chave (amarelo) alimentam a Revisão de Tópicos; tudo se agrega no Dossiê do tópico.</li>
        <li>As cores são configuráveis (daltonismo).</li>
      </ul>` },

  { id: "impressao", grupo: "Recursos que atravessam as telas", titulo: "Impressão (e o que incluir)", html: `
      <p>O botão <b>Imprimir</b> (canto superior direito de cada tela) abre o diálogo de impressão / salvar em PDF, respeitando os <b>filtros da tela</b>. Antes, você escolhe o que incluir:</p>
      <ul>
        <li><b>Flashcards</b> — frente e verso, ou só a frente (folha de auto-teste).</li>
        <li><b>Questões / Certo-Errado</b> — com ou sem o gabarito.</li>
        <li><b>Caderno de Erros</b> — com/sem a resposta certa e o comentário da IA.</li>
        <li><b>Lei Seca / Jurisprudência</b> — o modo atual ou metas + memória, com ou sem o trecho.</li>
        <li><b>Dossiê e Acompanhamento</b> — você escolhe quais seções/quadros entram.</li>
      </ul>
      <p>Os realces coloridos saem como <b>negrito + sublinhado</b>, para não sumirem em preto e branco.</p>` },

  { id: "assistente", grupo: "Recursos que atravessam as telas", titulo: "Mentor em conversa (o botão flutuante)", html: `
      <p>O botão flutuante de <b>estrelinhas</b> (canto inferior direito) abre o <b>Mentor em modo conversa</b> — é a <b>mesma persona</b> da tela Mentor IA, com <b>memória entre sessões</b> (a conversa continua de onde parou; "Limpar conversa" apaga).</p>
      <ul>
        <li>Responde com <b>quatro fontes</b>: o seu material (busca por significado), este guia (perguntas de "como usar"), a IA conectada e, opcionalmente, a <b>web</b> (botão "Buscar na web", desligado por padrão; requer IA com suporte a busca).</li>
        <li>As respostas mostram <b>selos de origem</b>: do seu material · gerado por IA (confira) · da web.</li>
        <li>Também <b>executa ações</b> quando você pede — sempre propõe e espera a sua confirmação.</li>
        <li><b>Atalho Ctrl+K</b> (Cmd+K no Mac) — paleta de comando em qualquer tela: vá direto a uma tela/atalho (offline) ou digite uma pergunta/ação que ela repassa ao Mentor.</li>
      </ul>` },

  { id: "sincronizacao", grupo: "Recursos que atravessam as telas", titulo: "Como tudo se sincroniza", html: `
      <p>Os módulos conversam entre si:</p>
      <ul>
        <li><b>Deep-links do Dossiê</b> — clicar num item abre a tela dele já apontando para ele.</li>
        <li><b>Meta de lei/juris e Tarefa</b> — criar a meta gera a tarefa no Planejamento; concluir de um lado conclui do outro; remover apaga o par.</li>
        <li><b>Sessão e Tarefa</b> — ao registrar/editar uma sessão você pode vinculá-la a uma tarefa (e concluí-la).</li>
        <li><b>Marcações → Dossiê</b> — os grifos de todas as fontes do tópico aparecem agregados; as palavras-chave (amarelo) viram material da Revisão de Tópicos.</li>
        <li><b>Relevância e cobertura</b> — a relevância é a mesma no Edital e no Dossiê; cobertura = tópicos concluídos (vale para Edital, Acompanhamento e Mentor).</li>
        <li>Ao <b>apagar</b>, os vínculos são limpos: remover tópico/disciplina desvincula (não apaga) o conteúdo; remover material/resumo limpa as marcações e o tira da busca por significado.</li>
      </ul>` },

  { id: "ia-offline", grupo: "IA, dados e privacidade", titulo: "O que usa IA e o que é offline", html: `
      <p>O <b>essencial funciona offline</b>: registrar estudo, edital, materiais (texto), questões, flashcards, caderno de erros, resumos, marcação automática, busca por palavra exata e revisões espaçadas.</p>
      <ul>
        <li><b>Usam IA conectada</b>: gerar/comentar/corrigir (questões, flashcards, redação), Visão/OCR, leitura de edital e do plano do cursinho em PDF, busca por significado, sugestões de palavras-chave/incidência e a análise/cronograma do Mentor.</li>
        <li>Provedor instável? O app tenta <b>outro modelo</b> e a <b>chave reserva</b> automaticamente.</li>
        <li>Você conecta a IA em <b>Configurações → IA</b>, com a sua própria chave.</li>
        <li>Ao gerar questões ou flashcards, escolha <b>quantidade</b> e <b>nível</b> (Fácil/Médio/Difícil); as questões saem no estilo da sua banca e cargo.</li>
      </ul>` },

  { id: "dados", grupo: "IA, dados e privacidade", titulo: "Dados, backup e privacidade", html: `
      <p>Seus dados ficam <b>no seu dispositivo</b> (navegador: localStorage; app desktop: SQLite) — nada é enviado a um servidor do app. Quando você usa um recurso de IA, apenas o conteúdo daquela operação vai ao provedor que você conectou.</p>
      <ul>
        <li>Configurações está em <b>abas</b>: <b>Estudo &amp; prova</b> (metas, dias, revisão de tópicos, desempenho), <b>IA</b>, <b>Aparência</b> (tema Claro/Escuro, notificações, cores da marcação, barra lateral) e <b>Dados &amp; concurso</b> (concurso, sincronização na nuvem, backup e a zona de risco do "apagar tudo").</li>
        <li>As Configurações <b>salvam automaticamente</b> conforme você mexe.</li>
        <li>Em <b>Dados &amp; concurso</b> você pode <b>exportar</b> (backup), <b>importar</b> e <b>apagar</b> tudo.</li>
        <li>As <b>notificações</b> (lembrete diário, revisões, inatividade, marcos) são opcionais e só disparam no app desktop.</li>
      </ul>` },

  { id: "sync-nuvem", grupo: "IA, dados e privacidade", titulo: "Sincronização entre celular e computadores", html: `
      <p>Opcional e <b>gratuita</b>: mantenha os mesmos dados no <b>celular</b> e nos <b>computadores</b>, por uma <b>senha</b>. Fica em <b>Configurações → Dados &amp; concurso → Sincronização — celular e computadores</b>.</p>
      <ul>
        <li><b>Como ligar</b>: escolha uma <b>senha</b> (uma frase fácil de lembrar) e digite-a <b>uma vez em cada aparelho</b>. A partir daí sincroniza sozinho — <b>ao abrir</b> e <b>ao fechar</b> — e há o botão <b>Sincronizar agora</b>.</li>
        <li><b>Privacidade</b>: a senha <b>cifra</b> tudo de ponta a ponta; nem nós nem o serviço de nuvem conseguem ler. A senha <b>não sai do aparelho</b> e <b>não tem recuperação</b> — se esquecer, escolha outra (cada aparelho mantém a cópia local).</li>
        <li><b>PDFs</b>: os arquivos originais <b>ficam em cada aparelho</b> (não sobem); o <b>texto extraído</b> sincroniza normalmente, então o material segue legível e pesquisável.</li>
        <li><b>Conflito</b>: vence o <b>mais recente</b>. Se um aparelho quase vazio fosse apagar um cheio, o app <b>para e pergunta</b> antes, guardando uma cópia de segurança.</li>
        <li><b>Backup extra (opcional, só no app de computador)</b>: além disso, você pode manter uma cópia num arquivo dentro do seu <b>Google Drive/OneDrive</b> — em <b>Backup extra por arquivo</b>.</li>
      </ul>` },

  { id: "plataformas", grupo: "IA, dados e privacidade", titulo: "Onde usar: computador, navegador e celular", html: `
      <p>São <b>três formas</b> de usar o Mentor, com os <b>mesmos dados</b> (basta ligar a sincronização por senha):</p>
      <ul>
        <li><b>Aplicativo de computador</b> (instalado): a versão mais completa. Tem os <b>recursos nativos</b> — buscar a lei direto no <b>Planalto</b>, salvar arquivos, notificações do sistema e atualização automática.</li>
        <li><b>Navegador no computador</b>: abra o endereço do app no Chrome/Edge. Funciona igual, exceto os recursos nativos acima (nesses casos o app avisa "melhor no aplicativo").</li>
        <li><b>Celular (navegador)</b>: abra o endereço e use <b>"Adicionar à tela inicial"</b> — vira um ícone e abre em tela cheia, como um app. Ideal para <b>revisar e estudar</b> (ler a lei, flashcards, questões, o Mentor); a parte de <b>montar</b> (importar PDF, organizar edital) fica melhor no computador.</li>
      </ul>
      <p class="muted small">Dica: comece pelo computador (onde você monta e importa) e use o celular para revisar nos intervalos — a senha mantém os dois em dia.</p>` },
];

// Versão para busca: título + texto puro (sem tags) de cada seção.
function textoPuro(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
export function guiaSecoesBusca() {
  return GUIA.map((s) => ({ titulo: s.titulo, texto: textoPuro(s.html) }));
}

// Busca no guia: casa por palavras-chave da pergunta (>=4 letras). Devolve até 2 seções
// no formato do chat ({origem, trecho}). Pensado para perguntas de "como usar o sistema".
export function buscarNoGuia(query) {
  const q = (query || "").toLowerCase();
  const termos = [...new Set(q.split(/[^a-zà-ú0-9]+/i).filter((w) => w.length >= 4))];
  if (!termos.length) return [];
  const min = termos.length === 1 ? 1 : 2; // 1 termo: basta casar; vários: pelo menos 2
  const scored = guiaSecoesBusca()
    .map((s) => {
      const alvo = (s.titulo + " " + s.texto).toLowerCase();
      let score = 0;
      for (const t of termos) if (alvo.includes(t)) score++;
      return { s, score };
    })
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((x) => ({
    origem: "Guia do sistema · " + x.s.titulo.replace(/^[^A-Za-zÀ-ú]+/, ""),
    trecho: x.s.texto.slice(0, 600),
  }));
}
