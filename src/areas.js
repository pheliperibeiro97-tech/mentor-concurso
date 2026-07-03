// Mapa curado de ÁREAS de concurso → matérias → tópicos base (offline, editável).
// Alimenta o caminho "Escolher a área" do onboarding (store.montarPlanoInicial):
// vira a estrutura [{nome, topicos:[str]}] que aplicarEdital transforma em
// disciplinas + tópicos. É uma semente pequena e curada; o usuário edita tudo depois
// (e a biblioteca de editais REAIS — Bloco 3 — complementa/substitui isso adiante).

// Biblioteca compartilhada de tópicos base por matéria (reusada entre áreas).
// Chave = nome normalizado da matéria (minúsculo, sem acento). Matéria sem entrada
// aqui entra só com o nome (0 tópicos) — o usuário adiciona depois.
const TOPICOS_BASE = {
  "lingua portuguesa": [
    "Interpretação e compreensão de texto", "Ortografia e acentuação", "Classes de palavras",
    "Concordância verbal e nominal", "Regência verbal e nominal", "Crase",
    "Pontuação", "Sintaxe do período", "Semântica (sinônimos, antônimos, sentido)",
  ],
  "raciocinio logico": [
    "Proposições e conectivos lógicos", "Tabelas-verdade e equivalências", "Argumentação e validade",
    "Sequências e padrões", "Análise combinatória", "Probabilidade", "Problemas de raciocínio",
  ],
  "matematica": [
    "Razão e proporção", "Regra de três", "Porcentagem", "Juros simples e compostos",
    "Equações e sistemas", "Conjuntos", "Geometria básica",
  ],
  "informatica": [
    "Conceitos de hardware e software", "Sistemas operacionais (Windows/Linux)",
    "Pacote Office e editores", "Internet, navegadores e correio eletrônico",
    "Segurança da informação", "Redes de computadores", "Backup e armazenamento em nuvem",
  ],
  "direito constitucional": [
    "Princípios fundamentais", "Direitos e garantias fundamentais", "Organização do Estado",
    "Organização dos Poderes", "Administração Pública", "Controle de constitucionalidade",
    "Defesa do Estado e das instituições democráticas",
  ],
  "direito administrativo": [
    "Princípios da Administração Pública", "Atos administrativos", "Poderes administrativos",
    "Organização administrativa", "Agentes públicos", "Licitações e contratos (Lei 14.133)",
    "Improbidade administrativa", "Processo administrativo", "Responsabilidade civil do Estado",
  ],
  "direito civil": [
    "Lei de Introdução às Normas do Direito Brasileiro", "Pessoas naturais e jurídicas",
    "Bens", "Fatos e negócios jurídicos", "Prescrição e decadência", "Obrigações", "Contratos",
  ],
  "direito processual civil": [
    "Normas fundamentais e aplicação", "Jurisdição e competência", "Partes e procuradores",
    "Atos processuais e prazos", "Tutela provisória", "Petição inicial e resposta",
    "Recursos",
  ],
  "direito penal": [
    "Aplicação da lei penal", "Teoria do crime", "Culpabilidade", "Penas e medidas de segurança",
    "Extinção da punibilidade", "Crimes contra a pessoa", "Crimes contra a Administração Pública",
  ],
  "direito processual penal": [
    "Inquérito policial", "Ação penal", "Prova", "Prisão e liberdade provisória",
    "Competência", "Procedimentos", "Nulidades",
  ],
  "direito tributario": [
    "Sistema tributário nacional", "Competência tributária", "Limitações ao poder de tributar",
    "Tributos e espécies", "Obrigação tributária", "Crédito tributário", "Administração tributária",
  ],
  "administracao publica": [
    "Modelos de administração pública", "Planejamento e processo organizacional",
    "Gestão de pessoas", "Gestão de processos", "Governança e accountability", "Controle na administração",
  ],
  "atualidades": [
    "Política e economia nacional", "Cenário internacional", "Meio ambiente e sustentabilidade",
    "Tecnologia e sociedade", "Direitos humanos e cidadania",
  ],
  "contabilidade": [
    "Patrimônio e demonstrações contábeis", "Princípios de contabilidade", "Escrituração e lançamentos",
    "Balanço patrimonial", "Demonstração do resultado", "Contabilidade pública",
  ],
  "direitos humanos": [
    "Teoria geral dos direitos humanos", "Declaração Universal dos Direitos Humanos",
    "Sistema interamericano de proteção", "Direitos humanos na Constituição de 1988",
    "Grupos vulneráveis e políticas de proteção",
  ],
  "nocoes de direito": [
    "Noções de Direito Constitucional", "Noções de Direito Administrativo",
    "Noções de Direito Penal", "Noções de Direito Civil", "Princípios gerais do Direito",
  ],
  "conhecimentos bancarios": [
    "Sistema Financeiro Nacional", "Produtos e serviços bancários", "Meios de pagamento",
    "Noções de mercado de capitais", "Prevenção à lavagem de dinheiro", "Autorregulação bancária",
  ],
  "redes de computadores": [
    "Modelo OSI e TCP/IP", "Endereçamento IP e sub-redes", "Equipamentos de rede",
    "Protocolos de aplicação", "Redes sem fio", "Segurança de redes",
  ],
  "banco de dados": [
    "Modelo relacional", "Modelagem de dados (ER)", "Linguagem SQL",
    "Normalização", "Transações e integridade", "Administração de banco de dados",
  ],
  "engenharia de software": [
    "Ciclo de vida de software", "Metodologias ágeis (Scrum/Kanban)", "Requisitos de software",
    "Análise e projeto orientado a objetos (UML)", "Testes de software", "Qualidade e manutenção",
  ],
  "seguranca da informacao": [
    "Princípios (confidencialidade, integridade, disponibilidade)", "Criptografia",
    "Controle de acesso e autenticação", "Ameaças e ataques", "Gestão de incidentes",
    "Políticas e normas (ISO 27001/LGPD)",
  ],
};

function norm(s) {
  return (s || "").toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Áreas curadas. `materias` = nomes das disciplinas (viram disciplinas no edital).
// A ordem sugere a prioridade típica de estudo (as básicas primeiro).
export const AREAS = [
  {
    id: "juridica", nome: "Jurídica", ico: "scale",
    desc: "Tribunais, MP, defensorias, carreiras jurídicas.",
    materias: ["Língua Portuguesa", "Raciocínio Lógico", "Direito Constitucional", "Direito Administrativo", "Direito Civil", "Direito Processual Civil", "Direito Penal", "Direito Processual Penal"],
  },
  {
    id: "fiscal", nome: "Fiscal / Tributária", ico: "landmark",
    desc: "Auditor e analista fiscal, receitas, fazendas.",
    materias: ["Língua Portuguesa", "Raciocínio Lógico", "Matemática", "Direito Constitucional", "Direito Administrativo", "Direito Tributário", "Contabilidade", "Administração Pública"],
  },
  {
    id: "administrativa", nome: "Administrativa / Gestão", ico: "clipboard-list",
    desc: "Analista e técnico administrativo, gestão pública.",
    materias: ["Língua Portuguesa", "Raciocínio Lógico", "Informática", "Direito Constitucional", "Direito Administrativo", "Administração Pública", "Atualidades"],
  },
  {
    id: "policial", nome: "Policial / Segurança", ico: "lock",
    desc: "Polícias civil, penal, militar, federal e afins.",
    materias: ["Língua Portuguesa", "Raciocínio Lógico", "Informática", "Direito Constitucional", "Direito Administrativo", "Direito Penal", "Direito Processual Penal", "Direitos Humanos"],
  },
  {
    id: "tribunais", nome: "Tribunais / Controle", ico: "library",
    desc: "Escrevente, analista e técnico judiciário, TCs.",
    materias: ["Língua Portuguesa", "Raciocínio Lógico", "Informática", "Direito Constitucional", "Direito Administrativo", "Direito Civil", "Direito Processual Civil"],
  },
  {
    id: "bancaria", nome: "Bancária / Econômica", ico: "trending-up",
    desc: "Bancos públicos, escriturário, técnico bancário.",
    materias: ["Língua Portuguesa", "Raciocínio Lógico", "Matemática", "Informática", "Atualidades", "Conhecimentos Bancários"],
  },
  {
    id: "ti", nome: "Tecnologia da Informação", ico: "network",
    desc: "Analista de TI, desenvolvimento, infraestrutura.",
    materias: ["Língua Portuguesa", "Raciocínio Lógico", "Direito Administrativo", "Redes de Computadores", "Banco de Dados", "Engenharia de Software", "Segurança da Informação"],
  },
  {
    id: "geral", nome: "Nível médio geral", ico: "graduation-cap",
    desc: "Provas de conhecimentos gerais e básicos.",
    materias: ["Língua Portuguesa", "Raciocínio Lógico", "Matemática", "Informática", "Atualidades", "Noções de Direito"],
  },
];

export function acharArea(id) {
  return AREAS.find((a) => a.id === id) || null;
}

// Estrutura [{nome, topicos:[str]}] de uma área, no formato que store.aplicarEdital espera.
// Cada matéria recebe seus tópicos base (se houver na biblioteca) ou entra vazia.
export function estruturaDaArea(id) {
  const area = acharArea(id);
  if (!area) return [];
  return area.materias.map((nome) => ({
    nome,
    topicos: (TOPICOS_BASE[norm(nome)] || []).slice(),
  }));
}

// Métricas rápidas (para o preview do tile, antes de montar): matérias e tópicos.
export function resumoArea(id) {
  const est = estruturaDaArea(id);
  return { materias: est.length, topicos: est.reduce((s, d) => s + d.topicos.length, 0) };
}
