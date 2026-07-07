// Conteúdo do GUIA do sistema (manual de uso). Fica separado da tela para ser, ao mesmo
// tempo, renderizado pela tela Ajuda (ajuda.js) e PESQUISÁVEL pelo Assistente/chat
// (store.recuperarTrechos → buscarNoGuia). Módulo só de dados: não importa UI.

// Cada seção: { id, grupo (ou null = topo), titulo, html }.
export const GUIA = [
  {
    id: "ciclo",
    grupo: null,
    titulo: "🧭 Como o app funciona (o ciclo de aprendizado)",
    html: `
      <p>O app organiza o estudo em quatro etapas que você registra e revisa:</p>
      <ul>
        <li><b>Estudo</b> — ler o material e fazer anotações/resumos.</li>
        <li><b>Prática</b> — resolver questões e treinar discursivas.</li>
        <li><b>Revisão</b> — flashcards, caderno de erros, memória de lei/jurisprudência, revisão de tópicos e de resumos (curva do esquecimento).</li>
        <li><b>Planejamento</b> — o ajuste de rota: o <b>Mentor IA</b> analisa seu desempenho e sugere os próximos passos.</li>
      </ul>
      <p>Tudo gira em torno do <b>Edital</b> (disciplinas e tópicos). Cada conteúdo (material, questão, resumo, flashcard, lei) pode ser vinculado a um tópico, e o <b>Dossiê</b> reúne tudo de um tópico num lugar só.</p>`,
  },

  { id: "hoje", grupo: "Rotina", titulo: "◷ Hoje", html: `
      <p>Sua tela de partida. Reúne o que importa agora:</p>
      <ul>
        <li><b>Check-in</b> do dia (saudação, sequência de dias estudando, balanço de ontem × hoje). Dispensável por dia.</li>
        <li><b>Revisões de hoje</b> — hub único com flashcards vencidos, memória de lei/jurisprudência, revisão de tópicos e <b>resumos para revisar</b>. Cada item abre a sua tela.</li>
        <li><b>Cronômetro</b> de estudo e <b>lançamento manual</b> de uma sessão já estudada (sem cronômetro). Em ambos há "Detalhes opcionais" (páginas, questões, observação e vínculo a uma tarefa), e a opção de <b>agendar a revisão</b> do tópico estudado. O cronômetro é um <b>botão flutuante</b> no canto inferior direito, presente em <b>todas as telas</b> (inclusive no Modo Foco). Clique para abrir os modos <b>Cronômetro</b> (conta para cima), <b>Timer</b> (conta para baixo) e <b>Pomodoro</b> (ciclos de estudo e pausa, com durações configuráveis), além de pausar/retomar, zerar e <b>registrar a sessão</b>.</li>
        <li><b>Lembretes</b> — recados rápidos (um texto e, se quiser, uma data): prova, inscrição, boleto do cursinho. Ficam num <b>card aqui no Hoje</b> e num <b>botão flutuante</b> (ícone de anotação) logo acima do cronômetro, presente em <b>todas as telas</b>, inclusive no Modo Foco — para anotar de qualquer lugar sem perder o foco. Marque como <b>concluído</b> quando resolver. O ícone flutuante não mostra contador de propósito (para não disputar a sua atenção); a lista fica aqui no Hoje.</li>
        <li>Aviso da prova (dias restantes) e o resumo do dia.</li>
      </ul>` },

  { id: "acompanhamento", grupo: "Rotina", titulo: "Acompanhamento", html: `
      <p>Sua evolução num relance:</p>
      <ul>
        <li><b>Constância</b> — um mapa de calor (estilo GitHub) dos seus dias: a cor indica <b>quanto tempo você estudou no dia</b> (mais escuro = mais tempo). Dia sem estudo fica claro e <b>não pune</b>; um <b>dia de folga</b> tem marca própria (não conta como falta).</li>
        <li><b>Comportamental</b> [IA] — o Mentor lê seus horários e a sua regularidade e aponta quando você rende mais e o que anda esquecido.</li>
        <li><b>Indicadores</b> (KPIs) — cobertura do edital, aproveitamento, tempo na semana e a contagem regressiva da prova.</li>
        <li><b>Por disciplina</b> — um <b>card</b> por disciplina, com o anel de aproveitamento (semáforo), cobertura e tempo; clique para abrir o <b>Painel da disciplina</b> (KPIs, semáforo por tópico e análise do Mentor).</li>
        <li><b>Gráficos, metas, períodos, calendário</b> e a distribuição por etapa do ciclo, além da tabela de <b>sessões</b> (ordenável, com filtros por disciplina/fase; dá para editar ou apagar). Clicar num período ou num dia rola até a lista de sessões.</li>
      </ul>` },

  { id: "planejamento", grupo: "Rotina", titulo: "▣ Planejamento (Cronograma da semana)", html: `
      <p>Suas <b>tarefas</b>, em três formas que convivem:</p>
      <ul>
        <li><b>Soltas</b> — lista livre, sem dia.</li>
        <li><b>Rotina semanal recorrente</b> — modelos que se repetem (ex.: toda segunda: X).</li>
        <li><b>Datadas</b> — num dia específico da semana (arrastáveis entre os dias). Você pode marcar <b>dias de folga</b>.</li>
      </ul>
      <p><b>Pedir plano ao Mentor</b> (🤖 só a montagem é assistida; o gerador base é offline): a partir de um diagnóstico (tempo/dia e nível por disciplina), monta tarefas datadas priorizando relevância e lacunas, intercalando disciplinas e reservando tempo de revisão. Você vê um <b>preview editável</b> e aceita em bloco. Também dá para <b>importar</b> um cronograma externo (a IA estrutura), <b>refinar o plano com IA</b> (aceitação parcial por ajuste), corrigir rota das tarefas atrasadas e <b>exportar</b> (.ics, .csv, .json ou imprimir).</p>` },

  { id: "mentor", grupo: "Rotina", titulo: "🧭 Mentor IA (Análise do progresso)", html: `
      <p>O Mentor lê seu panorama geral e <b>sugere</b> ações — nunca executa sozinho (você sempre aprova). Tem:</p>
      <ul>
        <li><b>Pontos de atenção</b> (offline): cobertura baixa, aproveitamento abaixo da meta, flashcards/erros acumulados, revisões vencidas/pendentes/frágeis. Cada ponto tem um botão de ação que leva à tela certa.</li>
        <li><b>Análise com IA</b> (🤖): além dos pontos, sugere um <b>mix</b> para aprovar — metas, flashcards, questões, <b>resumos</b> e <b>leituras</b> de lei/jurisprudência. As respostas de flashcards/questões ficam ocultas no plano (para não perder a prática).</li>
        <li><b>Análise automática semanal</b>: com a IA conectada, o Mentor analisa o seu progresso <b>sozinho uma vez por semana</b> (mesmo sem você clicar), e as sugestões já ficam prontas aqui. Você pode analisar quando quiser; para desligar a automática, vá em <b>Configurações → IA</b>.</li>
        <li><b>KPIs</b> clicáveis (cobertura, aproveitamento, semana, etapas) e indicação de há quanto tempo você não analisa.</li>
      </ul>
      <p>Diferença para o Planejamento: o <b>Cronograma</b> monta tarefas <b>datadas</b>; a <b>Análise do Mentor</b> lê o progresso e propõe um mix para aprovar.</p>` },

  { id: "edital", grupo: "Estudo", titulo: "≡ Edital", html: `
      <p>A espinha do app: disciplinas e tópicos. Você adiciona <b>manualmente</b>, <b>cola</b> o texto, ou <b>importa de um arquivo</b> (PDF/imagem, inclusive <b>escaneado</b> — também arrastando). Com a <b>IA (Gemini) conectada</b>, ela <b>lê e organiza</b> o conteúdo programático em disciplinas e tópicos numa etapa só: faz OCR, mantém "Tópico: subtópico A; B" como <b>um item</b> (não fragmenta a lista de artigos/subtópicos) e descarta o ruído administrativo (inscrição, vagas, datas, links). Sem IA, o texto é separado <b>offline</b> e você clica em "Revisar". Nos dois casos há um <b>preview editável</b> antes de aplicar (com deduplicação). Cada tópico tem:</p>
      <ul>
        <li><b>Relevância</b> ("o quanto cai"): faixa com % ou <b>"Mais cai (sem %)"</b> quando o percentual é desconhecido. As cores indicam a intensidade. Sincronizada com o Dossiê.</li>
        <li><b>Concluído</b> — o botão <b>✓</b> ao lado do tópico marca que você já estudou (é o que conta para a <b>cobertura</b>).</li>
        <li><b>Semáforo de aproveitamento</b> — ao lado de cada tópico, uma bolinha verde/âmbar/vermelha mostra como você vai nas questões dele (neutra enquanto não há questões).</li>
        <li><b>Dossiê por tópico</b> — visão que reúne tudo do tópico.</li>
      </ul>
      <p>Para <b>reorganizar em lote</b> (mover, unificar ou virar nova disciplina), clique em <b>Selecionar tópicos</b>: aparecem as caixas de seleção; fora desse modo, cada tópico mostra só o ✓ Concluído.</p>
      <p><b>📋 Checklist da banca</b> (opcional): confira a cobertura do seu edital contra o edital oficial da banca (o que já cobre × lacunas), sem mudar a sua estrutura.</p>
      <p><b>📚 Plano do cursinho</b> (opcional): traga a divisão de aulas do seu cursinho — <b>cole</b> ou <b>importe o PDF</b> (a IA lê o print da plataforma, inclusive escaneado, e extrai cada <b>aula</b> com os seus <b>assuntos</b>, ignorando botões/status). O app casa cada assunto com os seus tópicos (por nome + 🏷 sinônimos) e monta o mapa <b>aula ↔ tópico ↔ edital</b>. Com a <b>base de estudo "Cursinho"</b>, o Hoje passa a sugerir na ordem das aulas. Não altera a estrutura do edital nem a cobertura.</p>` },

  { id: "materiais", grupo: "Estudo", titulo: "▦ Materiais", html: `
      <p>Sua base de conteúdo. Importe <b>PDF, imagem (foto/escaneado) ou texto</b> (também arrastando o arquivo). O texto é extraído automaticamente; páginas escaneadas ou com tabela/organograma ficam pendentes e podem ser processadas <b>sob clique</b> pela <b>Visão (OCR/IA 🤖)</b> — só nelas, página a página (econômico).</p>
      <p>Duas <b>buscas</b>: <b>🔎 no material</b> (palavra exata, offline, conforme você digita) e <b>🧩 por significado</b> (semântica 🤖 — acha pelo sentido; é preciso "separar"/indexar os materiais antes). Cada material pode ser <b>marcado</b> (grifos por cor) e ter os <b>tópicos detectados</b> pela IA para agendar revisão.</p>` },

  { id: "leijuris", grupo: "Estudo", titulo: "§ Lei Seca · ⚖ Jurisprudência", html: `
      <p>Cada tela tem <b>três abas</b> — pense nelas como verbos: <b>Ler</b> (a letra), <b>Estudar</b> (praticar) e <b>Metas</b> (planejar).</p>
      <ul>
        <li><b>📖 Ler</b> — a única lista com o <b>texto</b> dos dispositivos. Aqui você lê, <b>grifa</b> (marcação tricromática), marca o que mais cai com a <b>★</b> e vê a <b>incidência</b> como uma mini-barra no próprio artigo. No <b>⋯</b> de cada item: Ler em foco, abrir na fonte oficial, marcar para revisar, editar, revogar/cancelar e remover.</li>
        <li><b>◎ Estudar</b> — um <b>lançador</b> em tela cheia (não é lista de texto). Escolha o <b>escopo</b> (tudo ou o que mais cai) e o que fazer: <b>Certo/Errado</b> (a banca troca um ponto; na lei sai com diff colorido), <b>Completar a letra</b> (lacunas/cloze), <b>Revisar o que vence</b> (revisão espaçada) e <b>Refazer meus erros</b>. Na jurisprudência há também a <b>Súmula-duelo</b> (a banca troca o número ou o tribunal). Toda geração pergunta <b>quantidade e dificuldade</b>; dá para gerar <b>flashcards</b> e <b>questões de múltipla escolha</b> do escopo. Uma faixa "<b>Foque nisto hoje</b>" mostra o que mais cai onde você erra.</li>
        <li><b>🎯 Metas</b> — <b>metas cruas de leitura</b> (ex.: "ler art. 1º a 20"), sem transcrever a letra. Cada meta vira <b>tarefa no Planejamento</b>. Dá para <b>importar um cronograma/tabela</b> inteiro e <b>dividir em etapas</b> (cada etapa = uma tarefa).</li>
      </ul>
      <p><b>Importar (aba Ler):</b> um só botão. Na lei você escolhe entre trazer a <b>letra oficial</b> (buscar no <b>Planalto</b> no app desktop, ou colar o texto — o app detecta o que está <b>revogado</b> e você decide manter/excluir) ou <b>colar uma lista/PDF</b>. Na jurisprudência, cole súmulas/teses ou o informativo (que pode ser separado em <b>teses</b>). Tudo passa por um <b>preview editável</b>.</p>
      <p><b>Manter atualizado (só lei):</b> "Conferir atualização" reconsulta a fonte e mostra, por <b>diff mecânico</b>, o que <b>mudou</b>, <b>entrou</b> ou foi <b>revogado</b> — vira selo de <b>novidade</b> (filtrável na aba Ler) para você revisar. O <b>lembrete de vigência</b> continua (⋯ → Conferi a vigência).</p>
      <p><b>Jurisprudência:</b> marque uma súmula como <b>cancelada/superada</b> (sai do estudo, fica riscada), classifique como <b>Súmula Vinculante</b>, registre o <b>ano</b> do entendimento (o app avisa quando é antigo) e use a <b>súmula-duelo</b>. Uma súmula que cita um artigo aparece <b>ligada</b> a ele (e vice-versa). O <b>Mentor</b> cobra o que falta treinar, os pontos de alta incidência sem prática e os entendimentos antigos a conferir.</p>` },

  { id: "questoes", grupo: "Prática", titulo: "✎ Questões · ✔ Questões C/E", html: `
      <p>Banco de questões (múltipla escolha e Certo/Errado, telas gêmeas). <b>Treino</b>: responda, veja o gabarito e o comentário; erro vai para o <b>Caderno de Erros</b>. Filtros por tópico e por situação (pendentes/acertei/errei) e o botão <b>Treinar erros</b> (refaz as erradas em branco). Para provas <b>cronometradas com gabarito só no fim</b>, use a tela <b>Simulados</b> (abaixo). Adicionar questões: digitar/colar, importar de arquivo, ou <b>extrair/gerar com IA</b> 🤖 a partir de um material.</p>
      <p><b>⛶ Modo foco</b>: resolve as questões do filtro atual <b>uma a uma, em tela cheia e sem distração</b>, com correção imediata, comentário da IA, <b>placar</b> da sessão (✓/✗/%). O <b>cronômetro flutuante</b> (Cronômetro/Timer/Pomodoro) segue disponível no canto. Navegue com ← → (revisitar mostra o resultado anterior). Atalhos: 1–4 (ou C/E) respondem, Espaço vai para a próxima. Vale para múltipla escolha e para Certo/Errado.</p>` },

  { id: "simulados", grupo: "Prática", titulo: "◎ Simulados", html: `
      <p>Tela única para <b>fazer</b> e <b>acompanhar</b> simulados. Em <b>Fazer</b>, monte um simulado (múltipla escolha e/ou Certo/Errado) a partir dos seus filtros, responda <b>cronometrado</b> e veja o gabarito e o desempenho (geral e por disciplina) só <b>no fim</b> — como numa prova real.</p>
      <p>Em <b>Histórico</b>, acompanhe a sua <b>evolução</b>: os simulados feitos aqui entram sozinhos, e você pode <b>registrar um simulado externo</b> (feito fora do app) para não perder o histórico. Mostra total de simulados, questões, média, melhor resultado e a curva ao longo do tempo.</p>` },

  { id: "discursiva", grupo: "Prática", titulo: "✍ Discursiva e redação", html: `
      <p>Escreva o tema/enunciado e a sua resposta e peça a <b>correção</b> 🤖 no nível de um <b>examinador de banca</b>. Ela é estruturada em <b>Macroestrutura</b> (conteúdo: aderência ao comando, subunidades do comando, palavras-chave usadas/faltantes, base legal, precisão dos institutos), <b>Mesoestrutura</b> (introdução/tese, conectivos, proporção, repetições), <b>Microestrutura</b> (erros gramaticais um a um, com o trecho e a correção) e <b>Nota</b> (0–10 com memória de cálculo + veredito), além de <b>Pontos fortes</b> e <b>Como melhorar</b>. Offline, dá métricas estruturais. Dá para <b>gerar um tema</b> com IA, transformar a correção em flashcard ou enviar ao Caderno de Erros.</p>
      <p>No <b>histórico</b>, cada correção mostra o tema, a <b>sua resposta</b> (recolhível) e a correção da IA. Clique em <b>⇄ Comparar</b> para ver a <b>sua resposta e a correção lado a lado</b> (clique de novo para empilhar).</p>` },

  { id: "flashcards", grupo: "Revisão", titulo: "⟳ Flashcards", html: `
      <p>Revisão espaçada no nível do card (SRS). Ao revisar, avalie <b>Errei / Difícil / Bom / Fácil</b> — os intervalos são fixos por nota (1 / 7 / 15 / 30 dias). Crie manualmente (frente ; verso), importe de arquivo, ou gere automaticamente: <b>do material</b> (🤖) e <b>das questões</b> (offline). Na revisão dá para <b>✨ Comentar com IA</b> (explica o porquê) e mandar ao <b>Caderno de Erros</b>. Tem <b>⛶ Modo foco</b>: revisão imersiva em tela cheia, com virada do card (flip), placar e cronômetro; atalhos 1–4 dão a nota, Espaço vira, ← → navegam.</p>` },

  { id: "revtopico", grupo: "Revisão", titulo: "↺ Revisão de Tópicos", html: `
      <p>A <b>curva do esquecimento</b> no nível do <b>tópico estudado</b> (não do card). Opcional (liga nas Configurações): cada sessão de Estudo entra na fila em 24h. Ao revisar, escolha <b>👁 só reler</b> as palavras-chave ou <b>✎ escrever de memória</b> (recordação ativa, com "✨ Avaliar com IA" opcional 🤖); depois Esqueci/Lembrei/Fácil reagendam na escada 1·7·15·30·60·120. O que se relê vem das palavras-chave marcadas (🟡) &gt; resumo &gt; material.</p>` },

  { id: "caderno", grupo: "Revisão", titulo: "⚑ Caderno de Erros", html: `
      <p>Junta os erros de questões (automático) e os <b>erros manuais</b> que você adicionar. Classifique cada um por <b>motivo</b> (Não sabia / Esqueci / Interpretação / Distração-Pegadinha), filtre e ordene. Dá para comentar com IA 🤖 e gerar flashcard. Tirar um erro de questão do caderno não apaga a tentativa (o aproveitamento continua valendo). Botão <b>⛶ Refazer em foco</b>: reabre as questões erradas (do filtro atual) uma a uma, em branco, no Modo Foco — corrige na hora e sai do caderno quando você acerta.</p>` },

  { id: "resumos", grupo: "Revisão", titulo: "≣ Resumos", html: `
      <p>Anotações em <b>texto rico</b> (negrito, cores, listas, marcador), por disciplina e tópico. Importe de PDF/texto, <b>gere um rascunho</b> a partir das suas fontes — <b>compilando</b> (offline, fiel ao conteúdo) ou pedindo à <b>IA para sintetizar</b> 🤖 por tópico, aula ou material — e grife o texto (marcação). Têm <b>revisão espaçada</b>: botão <b>⏰ revisar</b> (programar 24h/7/15/30); quando vencer, escolha <b>👁 Reler</b> ou <b>🧠 Recordar</b> (esconde o conteúdo até você revelar) e avalie Esqueci/Lembrei/Fácil. Os resumos vencidos aparecem no hub "Revisões de hoje".</p>` },

  { id: "central-revisoes", grupo: "Revisão", titulo: "↻ Central de Revisões", html: `
      <p>Reúne <b>tudo o que vence</b> num lugar só — tópicos, resumos, mapas, lei/jurisprudência e flashcards — como uma <b>visão</b> sincronizada: fez a revisão em qualquer tela, some daqui. Filtre por status (atrasadas/hoje/próximas/concluídas), disciplina e tipo; reprograme, conclua ou traga todas as atrasadas para hoje. Mostra a <b>taxa de conclusão</b> (30 dias).</p>
      <p><b>⛶ Revisar tudo em foco</b>: percorre as revisões vencidas <b>uma a uma, em tela cheia</b> — para cada uma, tente <b>recordar</b> o essencial, <b>revele</b> o conteúdo (o resumo, o texto da lei etc.) e marque <b>✓ Revisei</b> (dá baixa e reprograma a próxima) ou <b>Pular</b>. Tem cronômetro e placar. Os <b>flashcards</b> ficam de fora dessa sessão porque têm o Modo Foco próprio deles.</p>` },

  { id: "dossie", grupo: "Recursos que atravessam as telas", titulo: "▤ Dossiê por tópico (pasta viva)", html: `
      <p>Reúne, <b>resumido e linkado</b>, tudo de um tópico: materiais, resumos, marcações, lei/jurisprudência (memória), pontos prováveis (PQ), questões e desempenho, caderno de erros, flashcards, tarefas e sessões. <b>Clique em qualquer item</b> para abri-lo na tela dele (deep-link). Os números no topo são atalhos que rolam até a seção. As seções muito longas aparecem <b>recolhidas</b> (botão "ver mais/menos"). Na <b>impressão</b> você escolhe quais seções incluir, e elas saem sempre <b>integrais</b>.</p>` },

  { id: "marcacao", grupo: "Recursos que atravessam as telas", titulo: "🖍️ Marcação tricromática", html: `
      <p>Grifos com significado <b>fixo</b>: 🟡 palavras-chave · 🔵 prazos e valores · 🔴 restritivas (salvo, exceto, vedado…). Há também cores de <b>uso livre</b> (🟢🟣🟠) e <b>💬 comentários</b> em trechos. Funciona em <b>Lei Seca, Jurisprudência, Resumos e Material</b>. O <b>✨ Auto</b> marca prazos/restritivas offline; <b>🟡 IA sugere</b> as palavras-chave 🤖. Modos de leitura: texto completo, "👁 só as marcas" e "🧠 Recordar" (lacunas). As 🟡 alimentam a Revisão de Tópicos; tudo é agregado no <b>Dossiê de marcações</b> do tópico. As cores são configuráveis (daltonismo).</p>` },

  { id: "impressao", grupo: "Recursos que atravessam as telas", titulo: "🖨 Impressão (e o que incluir)", html: `
      <p>O botão <b>Imprimir</b> (canto superior direito de cada tela) abre o diálogo de impressão / salvar em PDF, respeitando os <b>filtros que estão na tela</b>. Antes de imprimir, você escolhe <b>o que incluir</b>:</p>
      <ul>
        <li><b>Flashcards</b>: frente e verso, ou <b>só a frente</b> (folha para auto-teste).</li>
        <li><b>Questões / Certo-Errado</b>: <b>com</b> ou <b>sem o gabarito</b> (folha em branco para resolver).</li>
        <li><b>Caderno de Erros</b>: com/sem a resposta certa e com/sem o comentário da IA.</li>
        <li><b>Lei Seca / Jurisprudência</b>: o modo atual ou <b>metas + memória</b>, com ou sem o trecho.</li>
        <li><b>Discursiva</b>: com ou sem o texto da resposta (a nota sempre vai).</li>
      </ul>
      <p>No <b>Dossiê</b> e no <b>Acompanhamento</b> você escolhe quais <b>seções/quadros</b> entram na folha. E os realces coloridos saem como <b>negrito + sublinhado</b>, para não sumirem na impressão em preto e branco.</p>` },

  { id: "assistente", grupo: "Recursos que atravessam as telas", titulo: "O Assistente (chat)", html: `
      <p>O botão flutuante das <b>estrelinhas ✨</b> (no canto inferior direito) abre o Assistente, que tira dúvidas usando <b>quatro fontes</b>: o seu <b>material</b> (busca por significado, com os trechos e a origem), este <b>guia do sistema</b> (perguntas de "como usar"), uma <b>IA</b> conectada (🤖, respostas elaboradas) e a <b>web</b> (🌐, busca ao vivo — desligada por padrão, requer IA com suporte a busca). As respostas mostram <b>selos de origem</b>: 📖/verde = do seu material · 🤖/amarelo = gerado por IA (confira) · 🌐 = da web. É diferente do <b>Mentor IA</b> (tela proativa que analisa seu progresso). Além de responder, o Assistente <b>executa ações</b> quando você pede (sempre com a sua confirmação).</p>
      <p><b>Atalho ⌘K:</b> pressione <b>Ctrl/⌘ + K</b> em qualquer tela para abrir a <b>paleta de comando</b> — vá direto para uma tela ou atalho (funciona offline) ou digite uma pergunta/ação que ela <b>repassa ao Assistente</b>.</p>` },

  { id: "sincronizacao", grupo: "Recursos que atravessam as telas", titulo: "🔗 Como tudo se sincroniza", html: `
      <p>Os módulos conversam entre si:</p>
      <ul>
        <li><b>Deep-links do Dossiê</b>: clicar num item abre a tela dele já apontando para ele.</li>
        <li><b>Meta de lei/juris ↔ Tarefa</b>: criar uma meta gera a tarefa no Planejamento; concluir de um lado conclui do outro; remover apaga o par.</li>
        <li><b>Sessão ↔ Tarefa</b>: ao registrar/editar uma sessão você pode vinculá-la a uma tarefa (e concluí-la).</li>
        <li><b>Marcações → Dossiê</b>: os grifos de todas as fontes do tópico aparecem agregados no Dossiê; as 🟡 viram material da Revisão de Tópicos.</li>
        <li><b>PQ → Dossiê</b>: um ponto provável marcado em Lei/Juris aparece na seção "Pontos prováveis" do tópico.</li>
        <li><b>Relevância</b> do tópico é a mesma no Edital e no Dossiê.</li>
        <li><b>Cobertura</b> = tópicos marcados como <b>concluídos</b> (vale para Edital, Acompanhamento e Mentor).</li>
      </ul>
      <p>Ao <b>apagar</b> algo, os vínculos são limpos: remover um tópico/disciplina desvincula (não apaga) o conteúdo e cancela a revisão do tópico; remover um material/resumo limpa suas marcações e o tira da busca por significado.</p>` },

  { id: "ia-offline", grupo: "IA, dados e privacidade", titulo: "🤖 O que usa IA e o que é offline", html: `
      <p>O <b>essencial funciona offline</b>: registrar estudo, edital, materiais (texto), questões, flashcards, caderno de erros, resumos, marcação automática (prazos/restritivas), busca por palavra exata e revisões espaçadas. Usam <b>IA conectada</b> (🤖) os recursos de <b>gerar/comentar/corrigir</b> (questões, flashcards, redação), a <b>Visão/OCR</b>, a <b>leitura e organização de edital e do plano do cursinho a partir de PDF</b> (inclusive escaneado), a <b>busca por significado</b>, as <b>sugestões de palavras-chave/PQ</b> e a <b>análise/cronograma</b> do Mentor. Quando o provedor estiver instável, o app tenta <b>outro modelo</b> e a <b>chave reserva</b> automaticamente. Você conecta a IA em <b>Configurações</b>, com a sua própria chave.</p>
      <p>Ao gerar questões ou flashcards com IA, você escolhe a <b>quantidade</b> e o <b>nível</b> (Fácil / Médio / Difícil). As questões são elaboradas <b>no estilo da sua banca e cargo</b>, focando no que ela mais cobra naquele tópico.</p>` },

  { id: "dados", grupo: "IA, dados e privacidade", titulo: "💾 Dados, backup e privacidade", html: `
      <p>Seus dados ficam <b>no seu dispositivo</b> (no navegador, em localStorage; no app desktop, em SQLite) — nada é enviado a um servidor do app. Em <b>Configurações</b> você pode <b>exportar</b> (backup), <b>importar</b> e <b>apagar</b> tudo. Quando você usa um recurso de IA, apenas o conteúdo daquela operação vai para o provedor que você conectou. As <b>notificações</b> (lembrete diário, revisões, inatividade, marcos) são opcionais e só disparam no app desktop.</p>
      <p><b>Configurações</b> está organizada em <b>abas</b>: <b>Estudo &amp; prova</b> (metas, dias, revisão de tópicos, desempenho), <b>IA</b> (camada de inteligência), <b>Aparência</b> (tema <b>Claro/Escuro</b>, notificações, cores da marcação e a barra lateral) e <b>Conta &amp; dados</b> (concurso, sincronização na nuvem, backup e a zona de risco do "apagar tudo").</p>` },

  { id: "sync-nuvem", grupo: "IA, dados e privacidade", titulo: "☁ Sincronização entre computadores", html: `
      <p>Opcional e <b>gratuita</b>: use os seus dados em <b>mais de um computador</b>, na <b>sua própria nuvem</b> (Google Drive ou OneDrive). Em <b>Configurações → Conta &amp; dados → Sincronização na nuvem</b>, clique em <b>Conectar uma pasta da nuvem</b> e escolha um arquivo dentro de uma pasta que o seu Drive/OneDrive já sincroniza. O app grava ali os seus dados e o <b>texto</b> dos materiais; o seu Drive leva para as outras máquinas. <b>Nada passa por servidor nosso</b> — é a sua conta de nuvem.</p>
      <ul>
        <li>Os <b>PDFs ficam só na máquina</b> de quem importou (não sobem). Na outra máquina o material continua legível pelo <b>texto extraído</b>; só o visualizador do PDF não abre lá.</li>
        <li>Na <b>2ª máquina</b>: instale o app, espere o Drive baixar o arquivo e conecte <b>o mesmo arquivo</b> para puxar os seus dados.</li>
        <li>O app <b>puxa o mais recente ao abrir</b> e <b>sincroniza ao fechar</b>; há também o botão <b>Sincronizar agora</b> e o status (<b>Sincronizado ✓ há…</b>).</li>
        <li>Use <b>um computador de cada vez</b> (deixe o Drive terminar de sincronizar antes de abrir na outra máquina).</li>
        <li>Se você editar offline nos dois ao mesmo tempo, vence o <b>mais recente</b> e o app guarda uma <b>cópia de segurança</b> do outro lado (botão "Baixar cópia de segurança"), para nada se perder.</li>
      </ul>` },
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
