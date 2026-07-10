# Plano — Materiais: extração de PDF de alta qualidade + auditoria da tela

> Prioridade: **consertar a importação de PDF** (texto + imagens, automática, precisa, tópicos bonitos). Depois: auditoria crítica da tela de Materiais visando design **ultrapremium** e simplificação.

---

## 1. Diagnóstico REAL (medido no PDF de exemplo — "Direito Civil - Ponto 1", MEGE, 55 págs)

Analisei o arquivo com precisão. O que ele é de verdade:

- **Texto NATIVO** (não escaneado): 126.788 caracteres extraíveis. 0 páginas escaneadas.
- **3.135 "imagens" — mas só 3 únicas**: uma imagem do tamanho da página inteira repetida **3.025 vezes** (fundo/marca d'água tiled) + 2 imagens 1×/página. **Nenhuma imagem de conteúdo real** (diagramas/figuras) neste PDF — é 100% texto + marca d'água.
- **Marca d'água personalizada** carimbada em TODA página: `CPF: … / Telefone: … / E-mail: … / Nome: PHELIPE …` + decorações de número de página ("1 1", "2 2").
- **Fonte**: 96% do corpo é **Calibri-Bold 12** — ou seja, **o documento inteiro é negrito**. Títulos reais são sz 14/18/22 + **numeração hierárquica** (`1.`, `1.1.`, `1.1.1.`). Existe um **SUMÁRIO** (índice) na pág. 4.

### Por que os tópicos saem HORRÍVEIS hoje
1. A detecção por **fonte/negrito** (`detectarPorFonte`) é inútil aqui: como *tudo* é bold sz12, ela marca linhas de corpo como se fossem títulos → lista de tópicos sem sentido.
2. A **marca d'água** (CPF/e-mail/nome + "1 1") entra no texto e às vezes vira "título".
3. O sinal BOM (numeração `1.`/`1.1.`/`1.1.1.` e o SUMÁRIO) é subaproveitado.

### Por que a extração de texto sai suja
- A ordem de leitura do pdf.js intercala a marca d'água com o conteúdo; `limparRuidoDePaginas` remove linha repetida em ≥60% das páginas, mas variações de espaçamento/posição deixam resíduo.

**Conclusão:** o problema NÃO é o PDF ser difícil — é o pipeline não priorizar os sinais certos (numeração + sumário) e não remover marca d'água (texto E imagem) com robustez.

### 1b. Comparativo dos 3 PDFs testados (mudou o plano)

| PDF | Tam | Págs | Texto | Escaneado | Imagens (únicas) | Estrutura boa por | Marca d'água |
|---|---|---|---|---|---|---|---|
| MEGE Civil P1 | 1,3 MB | 55 | nativo | não | 3.135 (**3 únicas**) | numeração `1.1.1` | full-page repetida + texto pessoal |
| Estratégia Aula 00 | 2,9 MB | 89 | nativo | ~1% | 3.115 (**26 únicas**, pequenas) | **tamanho de fonte** (sz20>16>12) | small repetidas (ícones/decoração) |
| ENAM Constitucional | **17,5 MB** | **789** | nativo | não | poucas (6 únicas, **algumas de conteúdo** 1052×459) | fonte + numeração `2.1` | header "2. Direito Constitucional" em toda pág |
| Síntese Estratégica III | 6,3 MB | 214 | nativo | não | 492 (**388 ÚNICAS!** — muita imagem de conteúdo) | marcador `#04 –` `#05 –` | — |

⚠️ **O 4º PDF (Síntese) é 2 COLUNAS** (blocos em x≈40 e x≈320, largura 595) e **cheio de imagens de conteúdo** (388 únicas — é um material visual/mapas). Isso expõe os 2 maiores furos: (a) **ordem de leitura em coluna** e (b) **imagem = conteúdo, não ruído**.

**Aprendizados que corrigem o plano:**
1. **Tamanho de fonte É um bom sinal na maioria** (Estratégia/ENAM têm hierarquia clara sz20>16>12). O caso MEGE ("tudo negrito") é a exceção → a regra é: **usar hierarquia de TAMANHO** (não "negrito"), com numeração e sumário como reforço; e a **IA montando a árvore** como unificador quando o tamanho não separa (MEGE).
2. **Imagens variam MUITO**: MEGE (0 de conteúdo), Estratégia (26 únicas pequenas, mistura ícone×diagrama → ambíguo), ENAM (poucas, mas **reais** — diagramas largos). ⇒ classificar por **repetição + tamanho**, **dedupe por xref** (descrever cada única UMA vez, não 800×), e IA decide as ambíguas.
3. **TAMANHO é o problema central que faltou no plano** — ver §3b.

---

## 3b. Tamanho, limites e performance (o ENAM de 789 págs quebra opções) ⚠️

O ENAM tem **~1,9 milhão de caracteres ≈ 484 mil tokens** de texto. Isso invalida abordagens ingênuas:

- **Vision página-a-página (Opção B) é INVIÁVEL para PDF grande**: 789 páginas como imagem estouram tokens e custo. ⇒ Vision só para **pequeno (≤ ~30 págs) ou escaneado**.
- **Limpeza de texto por IA (Opção D) NÃO escala**: a IA tem **teto de saída** (~8k tokens) — não reconsegue re-emitir 484k tokens de texto limpo; e fatiar em ~15 págs daria **~53 chamadas**. ⇒ D só para **pequeno/médio (≤ ~40 págs)**.
- **A única chamada de IA que ESCALA é a árvore de tópicos** (mandar só as ~200–300 linhas-título + sumário, nunca o texto inteiro) — barata mesmo com 789 págs. ⇒ é o coração da Opção C.
- **Extração de texto por pdf.js escala**, mas 789 págs no navegador pesa (memória/tempo) ⇒ **processar em BLOCOS** (a infra de blocos/sumário já existe) com barra de progresso.
- **IndexedDB / armazenamento**: guardar um PDF de 17,5 MB (base64 ≈ 23 MB) por material estoura cota rápido. ⇒ **não guardar o PDF de arquivos grandes** (só texto + tópicos + imagens de conteúdo); guardar o PDF só quando pequeno.

### Limitar o tamanho do upload? — SIM, mas com inteligência (não bloquear)
Roteamento automático por tamanho (o usuário só solta o arquivo):

| Tamanho | Texto | Estrutura | Imagens | Guarda o PDF? | Vision? |
|---|---|---|---|---|---|
| **pequeno** (≤ ~30 págs / ≤ 8 MB) | pdf.js (ou Vision se escaneado) | IA árvore | detecta+descreve | sim | se escaneado |
| **médio** (≤ ~150 págs) | pdf.js em blocos | IA árvore | detecta+dedupe+descreve | opcional | não |
| **grande** (≤ ~1000 págs) | pdf.js em blocos + progresso | IA árvore (só títulos) | dedupe; descreve as poucas de conteúdo | **não** (só texto+tópicos) | não |
| **gigante** (> ~1000 págs / > 60 MB) | avisar e sugerir dividir por parte do sumário | — | — | não | não |

- **Aviso amigável** acima de ~25 MB / ~300 págs: "material grande — vou extrair o texto e os tópicos, mas não vou guardar o PDF original (economiza espaço)". Sem travar.
- **Hard cap** só no patológico (> ~1000 págs ou > 60 MB) → sugerir importar por partes (o sumário já permite recortar).

---

## 3c. Opção C é MESMO a melhor? — fraquezas honestas e como blindar (100% automático)

A meta é: **usuário só solta o arquivo; o sistema faz tudo, inclusive estruturar pelo SUMÁRIO, sem um clique.** Sob essa lente, C tem furos reais:

**Fraquezas honestas da Opção C:**
1. **Estruturar "pelo sumário" é a parte MAIS frágil.** O sumário é uma página de texto com títulos + números de página. Dois problemas sérios:
   - Os números do sumário são a **paginação IMPRESSA**, que difere do índice FÍSICO (capa/rosto deslocam). "Sumário diz pág. 45" ≠ página física 45. Mapear errado joga o tópico na página errada.
   - Leaders pontilhados ("Título …… 45"), títulos em 2 linhas, subníveis, 2 colunas → regex quebra.
2. **pdf.js erra ordem de leitura em layout complexo** (as caixas coloridas/margens do Estratégia): o texto sai embaralhado → prejudica conteúdo E detecção de título.
3. **IA no "monte a árvore" pode alucinar/renomear** títulos → perde fidelidade ao sumário real e quebra o casamento título↔corpo.
4. **Heurística de marca d'água** pode remover demais (um cabeçalho de seção legítimo) ou de menos.
5. **Automação total tira a válvula de segurança**: se a árvore sai ruim e não há clique, o usuário fica com tópico ruim e sem saída.

**Resposta franca:** "a melhor" para automação total NÃO é uma opção estática — é um **pipeline ADAPTATIVO** (o C é o esqueleto certo, mas a etapa de estrutura precisa ser mais robusta que "IA lê títulos"). Blindagens:

- **Estrutura por PRIORIDADE de sinais confiáveis (cai para o próximo se falhar):**
  1. **Outline/bookmarks do PDF** (`getOutline`) — quando existe, é o mais confiável (já vem com página exata). Muitos cursos têm.
  2. **Sumário lido por VISION** — renderiza SÓ a(s) página(s) do sumário (1–2 imagens, custo mínimo, escala até em PDF de 789 págs) e a IA extrai a árvore FIEL (Vision lê pontilhado/2 colunas muito melhor que regex sobre texto embaralhado).
  3. **Hierarquia de TAMANHO de fonte** + numeração (Estratégia/ENAM).
  4. IA reconcilia (com instrução de **NÃO inventar** — usar a grafia do sumário).
- **Mapa título→página pelo CORPO, não pelo número do sumário:** pega os títulos (do sumário/outline) e acha a **1ª ocorrência de cada um no texto do corpo** → página real. Elimina o problema do deslocamento de paginação. (casamento fuzzy quando o título do sumário difere um pouco do corpo.)
- **Válvula de segurança que preserva a automação:** importa SEMPRE (nunca trava); se a confiança da estrutura for baixa, mostra um **aviso sutil "revisar tópicos"** que o usuário pode ignorar — automático por padrão, com rede de segurança.

**Veredito:** o **esqueleto C** (pdf.js grátis + IA cirúrgica + Vision só onde vale) continua sendo a melhor base custo×qualidade×escala. O que muda é **elevar a etapa de estrutura** para: outline → **Vision-no-sumário** → fonte/numeração → IA reconcilia → **mapear pelo corpo**. Assim "estruturar pelo sumário" fica robusto e barato (Vision em 1 página, não em 789), e tudo continua **automático ao soltar o arquivo**.

*(Se você preferir simplicidade máxima de código e topar o custo, a alternativa honesta seria "Vision no documento todo" — mas isso morre no ENAM de 789 págs. Por isso o adaptativo ganha.)*

---

## 2. O que já existe (base técnica — integrar)

- `extrairPdfPaginas` (pdf.js): texto por página **com tamanho de fonte e negrito** (`linhasPorPagina`), rastreio de **imagens** com área (matriz de transformação), `getOutline` (bookmarks), `rasterizarPaginas` (renderiza páginas em imagem).
- `detectarEstrutura` (estrutura.js): tenta Sumário → outline → numeração → fonte.
- `limparRuidoDePaginas`: remove cabeçalho/rodapé repetido + nº de página.
- IA: `extrairTextoArquivo` (Gemini Vision: PDF→texto), `estruturarEditalDePDF`/`estruturarAulasDePDF` (Vision→JSON).

---

## 3. OPÇÕES de extração de qualidade (com custo × qualidade)

> Import de material é **pouco frequente** → dá para gastar um pouco mais de IA por material, sem "queimar" cota (a chave é NÃO mandar 55 páginas de imagem sempre).

### Opção A — Pipeline pdf.js "cirúrgico" (offline · custo ZERO de IA)
- **Marca d'água fora**: (texto) remover linhas repetidas + padrões `CPF/CNPJ/e-mail/telefone/"Nome: X"` e números soltos; (imagem) **ignorar** imagens repetidas em muitas páginas OU do tamanho da página (fundo/marca) — só tratar como conteúdo as imagens únicas de tamanho médio no fluxo.
- **Estrutura certa**: priorizar **numeração** (`1.`, `1.1.`…) e o **SUMÁRIO**; usar fonte só quando não há numeração; **quando "tudo é bold", ignorar o negrito** como sinal.
- **Saída**: texto limpo em markdown (títulos pela numeração) + árvore de tópicos.
- ✅ instantâneo, grátis, privado. ❌ não "entende" o conteúdo; PDF muito bagunçado ainda sai imperfeito; imagens de conteúdo saem sem descrição.

### Opção B — IA Vision página-a-página (qualidade MÁXIMA · custo ALTO)
- Renderiza páginas e manda ao Gemini Vision → markdown impecável (ignora marca d'água, reconstrói títulos, transcreve tabelas, descreve imagens).
- ✅ qualidade máxima; funciona em **escaneado/bagunçado**; imagem vira texto/descrição. ❌ caro/lento (tokens de imagem × páginas), cota.
- Mitiga: mandar o PDF inteiro em 1 chamada (já existe `extrairTextoArquivo`) em vez de 55 — mas PDF grande pode estourar o limite.

### Opção C — HÍBRIDO inteligente ⭐ (RECOMENDADO)
- **pdf.js faz o texto** (Opção A) — grátis e preciso para texto-nativo.
- **IA entra só onde agrega**, com custo mínimo:
  1. **Árvore de tópicos**: manda à IA **só as linhas-título candidatas + o sumário** (1 chamada de **texto**, barata) → devolve a hierarquia limpa e bonita.
  2. **Imagens de conteúdo**: só as reais (não a marca d'água) — normalmente 0–5 por material — a IA descreve/OCR (viram texto pesquisável). Se não houver, custo zero.
- **Detecção automática de escaneado**: se a página não tem texto → cai sozinho na Opção B (Vision) só nessas páginas.
- ✅ qualidade perto da Vision, **custo mínimo** (1 chamada de texto + n imagens reais), 100% automático (só soltar o arquivo). ❌ mais engenharia.

### Opção D — Texto pdf.js + 1 passada de IA de LIMPEZA (barata)
- pdf.js extrai; manda o **texto** (não imagem) ao Gemini: "remova a marca d'água, reconstrua títulos em markdown, preserve tudo". 1 chamada de texto por material (ou por blocos de ~15 págs).
- ✅ barato (tokens de texto), limpa muito bem o texto-nativo + conserta tópicos. ❌ não vê imagens (aqui não há de conteúdo); escaneado precisa de Vision antes.

### Sobre IMAGENS (regra transversal a todas as opções)
- **Marca d'água/fundo** = imagem repetida em ≥40% das páginas **ou** que cobre ~página inteira → **ignorar sempre**.
- **Imagem de conteúdo** = única, tamanho médio, dentro do fluxo → extrair (render/crop), guardar no material; **opcional**: IA descreve (alt) e faz OCR do texto dentro dela (vira conteúdo buscável/estudável).

### Recomendação
**Padrão = Opção C** (híbrido), com **fallback automático para B** (Vision) em páginas escaneadas e **D como botão "caprichar com IA"** quando o usuário quiser o texto ainda mais limpo. Tudo dispara **sozinho ao importar** — o usuário só solta o arquivo.

---

## 4. Auditoria crítica da tela de Materiais (design ultrapremium + simplificar)

*(preliminar — aprofundo elemento a elemento na implementação; itens já visíveis)*

1. **Fluxo de importação exposto demais**: hoje o usuário vê "detectar tópicos", "estrutura — N blocos", editar faixas de página, aplicar tópicos, refinar com IA… **muita decisão manual**. Alvo: **soltar o arquivo → pronto** (extraiu texto limpo + tópicos bons automaticamente); edição vira "avançado", escondido.
2. **Painel de estrutura/tópicos feio e técnico** ("N blocos", "confiança < 0.6", "pIni/pFim"): jargão de máquina. Alvo: um **sumário limpo** (árvore de tópicos com página), sem "blocos/confiança" na cara.
3. **Preview de importação**: os tópicos horríveis vêm daqui — resolver na origem (extração) melhora tudo.
4. **Cartão do material**: revisar densidade, ações (Gerar ▾ já existe), selo, e a leitura do texto extraído.
5. **Estados**: vazio, carregando (já tem spinner), erro — revisar para o padrão premium.
6. **Consistência**: ícones Lucide, tipografia, 2 temas, sem inline styles soltos.

---

## 5. Fases

- **F1 — Extração (o urgente):** implementar Opção C. (a) remover marca d'água texto+imagem; (b) estrutura por numeração+sumário (parar de usar bold quando tudo é bold); (c) IA monta a árvore de tópicos a partir dos títulos (1 chamada de texto); (d) imagens de conteúdo detectadas e (opcional) descritas; (e) auto-detecção de escaneado → Vision. Tudo automático ao importar.
- **F2 — UX do import:** esconder o maquinário (blocos/confiança/faixas) atrás de "avançado"; mostrar só o sumário limpo; "soltar → pronto".
- **F3 — Auditoria visual da tela:** cartões, estados, tipografia, 2 temas; simplificações.

---

## 6. Decisões (§)
1. Padrão = **Opção C adaptativa** (ver §3c: outline → Vision-no-sumário → fonte/numeração → IA reconcilia → mapear pelo corpo). *Confirmar.*
2. Imagens de conteúdo: **descrever/OCR com IA** por padrão, ou só extrair e guardar (descrição sob demanda)?
3. Botão "Caprichar com IA" (Opção D) como extra opcional (só p/ docs pequenos/médios)?
4. **RESOLVIDO (usuário): MANTER/persistir — NÃO descartar.** Guardar texto + tópicos + imagens de conteúdo E o PDF original. Para arquivos grandes, guardar mesmo assim, mitigando a cota do IndexedDB por **compressão** (nunca "jogar fora" o material); avisar só no patológico. *(Também vale para a limpeza de marca d'água: manter o texto bruto para a limpeza ser reversível — não destruir conteúdo.)*

---

## 7. ⭐ Sumário/tópicos navegável — estilo LEI SECA (revisão por tópicos)

**Confirmado pelo usuário:** o plano INCLUI sumário/tópicos como peça central. Já existe um **rascunho** (`detectarEstrutura` → blocos, `sumarioNavegavelHTML`, "aplicar tópicos ao material"), mas o sumário sai ruim (as causas estão em §1/§3c: sinais errados + sem robustez). **Visão nova:** o material importado deve virar um **índice navegável como o leitor da Lei Seca** — com árvore de seções recolhível, ir-para-tópico, e **revisão por tópicos** (estudar/revisar por parte do sumário).

**Reaproveitar a infra da Lei Seca (não recriar):**
- **Árvore/índice**: o leitor da Lei Seca já tem `renderLeitorArvore` (seções `<details>` recolhíveis, "capítulo concluído", scroll-spy, persistir recolhimento). O material pode render seu sumário no mesmo padrão premium.
- **Revisão por tópico**: a Lei Seca já tem revisão espaçada, "difícil/favorito", memorizar por tema, gerar C-E/flashcards por escopo. O material, tendo tópicos, ganha o mesmo: **revisar/estudar um tópico do material** (gerar questões/flashcards daquele tópico, marcar como revisado, agendar revisão).
- **Ponte com o edital**: os tópicos do material já casam com os tópicos do edital (existe `casarEstruturaComEdital`) → revisar "por tópico" cruza material + edital + Lei Seca.

**Como o sumário fica BOM (resolve o "não ficou bom"):**
- Estrutura pela cascata robusta do §3c (outline → **Vision lê a página do sumário** → fonte/numeração → IA reconcilia) e **mapear título→página pelo corpo** (não pelo número impresso).
- Resultado: um índice fiel ao documento, hierárquico, com faixas de página corretas → navegável e revisável por tópico.

**Impacto no plano:** vira uma fase própria (F4 abaixo), depois da extração e da UX.

---

## 8. Fases (revisado)
- **F1 — Extração robusta** (Opção C adaptativa; §3c): texto pdf.js/Vision, marca d'água fora (texto+imagem, reversível), imagens de conteúdo (dedupe+descrição), roteamento por tamanho (§3b), guardar tudo (§6.4, com compressão).
- **F2 — Estrutura/sumário robusto** (§3c/§7): outline → Vision-no-sumário → fonte/numeração → IA reconcilia → mapa pelo corpo; confiança + válvula "revisar tópicos".
- **F3 — UX do import**: soltar → pronto; maquinário (blocos/confiança/faixas) vira "avançado".
- **F4 — Sumário navegável estilo Lei Seca + revisão por tópicos** (§7): reusar `renderLeitorArvore` + revisão/geração por tópico do material.
- **F5 — Auditoria visual da tela** (§4): cartões, estados, tipografia, 2 temas.

---

## 9. Multi-COLUNA e IMAGENS (com o 4º PDF) — dois furos que faltavam

### 9a. Layout em 2 colunas (o furo mais grave da extração hoje)
O `extrairPdfPaginas` (pdf.js) agrupa itens **por linha (mesmo y)** — em 2 colunas isso **intercala esquerda↔direita** e embaralha o texto (e os títulos) → conteúdo e sumário saem inúteis. Correção (client-side, grátis, escala):
- **Detectar colunas** por agrupamento dos x0 dos itens/blocos (bimodal em x≈40 e x≈320 no exemplo) e **ler coluna a coluna** (ordenar por coluna, depois por y). Robusto para 1, 2 ou 3 colunas; cai para linear quando não há colunas.
- É o mesmo raciocínio que já validei aqui em Python (a leitura por coluna sai perfeita). Sem isso, NENHUMA opção (nem a IA de texto) recebe um texto limpo.

### 9b. Imagens — decisão do usuário: **descrição automática pela IA, em PARTES, sem clique**
O 4º PDF tem **388 imagens únicas de conteúdo** (mapas/esquemas) — mandar tudo de uma vez é inviável. Fluxo aprovado:
- **Automático e em lotes**: o sistema detecta as imagens de conteúdo (dedupe por xref; ignora marca d'água/decoração por repetição+tamanho), agrupa em **lotes** e a IA descreve/OCR **em partes** (respeitando cota, sem travar), tudo sem ação do usuário.
- Cada descrição/《texto da imagem》entra no conteúdo do material → vira **texto buscável e estudável** (some no meio do tópico certo, pela página).
- Ambíguas (ícone×diagrama) → a IA decide no próprio lote.
- Se o material tem centenas de imagens, roda em background com progresso; nunca bloqueia o uso.

---

## 10. COMO É HOJE no Mentor × O QUE MUDA (aterrissando no código real)

**Hoje (fluxo real):** `abrirImportarMaterial` → escolhe arquivo → `extrairPdfPaginas` (pdf.js: texto por linha com fontSize/bold, outline, imagens com área) → `limparRuidoDePaginas` (remove repetido ≥60%) → `detectarEstrutura({paginas,outline,numPaginas,linhasPorPagina})` → **blocos** (titulo/nivel/pIni/pFim/confiança/topicoId) → `casarEstruturaComEdital` (casa tópicos do material com o edital) → se sem texto+IA+≤14MB → Vision `extrairTextoArquivo` → junta páginas → **preview com painel técnico** (editar blocos/faixas, "aplicar tópicos", "refinar com IA") → salvar (`texto`, `estrutura`, `paginas`, `pdf`≤50MB). A **revisão por tópico JÁ existe** (os blocos linkam `topicoId` do edital; `gerarFlashcardsDeDoc/gerarQuestoesDeDoc(id,…,bloco)`; `sumarioNavegavelHTML`).

**O que MUDA (por peça):**
| Peça (hoje) | Problema | Muda para |
|---|---|---|
| `extrairPdfPaginas` (linha por y) | embaralha 2 colunas; não tira marca d'água-imagem | **ordem por coluna** + descartar imagem marca d'água (repetida/página-inteira) |
| `limparRuidoDePaginas` | resíduo de marca d'água pessoal | + padrões CPF/e-mail/"Nome:" + **reversível** (mantém bruto) |
| `detectarEstrutura` (cai em fonte/bold) | tópicos horríveis (MEGE all-bold; colunas) | prioridade **outline → Vision-no-sumário → tamanho de fonte (não bold) → numeração/`#NN` → IA reconcilia → mapa pelo corpo** |
| preview técnico (blocos/confiança/faixas) | usuário precisa editar | **automático (soltar→pronto)**; painel vira "avançado" |
| imagens (ignora/rasteriza) | perde conteúdo visual | **detecta+dedupe+descreve por IA em lotes** (auto) |
| índice/revisão por tópico (blocos+edital) | sumário ruim degrada tudo | eleva ao padrão **leitor Lei Seca** (`renderLeitorArvore`) + revisão por tópico |
| guardar `pdf`≤50MB | cota IndexedDB em arquivos grandes | **manter (comprimir)**, não descartar (§6.4) |

Ou seja: **a extração é feita PELO Mentor** (pdf.js + IA no próprio app), reaproveitando `detectarEstrutura`, `casarEstruturaComEdital`, `renderLeitorArvore`, `gerar*DeDoc`. Não é um extrator novo — é **consertar e elevar** o que já existe.

---

## 11. O de 789 páginas é grande demais? — sim, tratar diferente
Não faz sentido um material único de 789 págs (revisão por tópico fica pesada). Proposta: acima de ~300 págs, além de "não guardar o PDF/só comprimir", **oferecer dividir pelo sumário** — cada seção de 1º nível vira um material coerente (melhor para revisar por tópico) OU o usuário importa uma faixa. Continua automático; só acrescenta a sugestão de recorte.

---

## 12. Decisões — status
1. **Backbone C adaptativo** (§3c: outline→Vision-no-sumário→fonte→numeração→IA reconcilia→mapa pelo corpo; +coluna §9a). → **usuário decide após revisar com o caso das colunas (agora incluído).**
2. Imagens → ✅ **RESOLVIDO: descrição automática pela IA, em lotes/partes, sem ação do usuário** (§9b).
3. Botão "caprichar com IA" → ✅ **ACEITO** (nome livre — ex.: "Aprimorar com IA", "Texto premium", "Refinar leitura"). Só p/ docs pequenos/médios (não escala em 789 págs).
4. Armazenamento → ✅ **RESOLVIDO: manter/persistir tudo, comprimir, não descartar.**
5. (novo) 789 págs / gigantes → proposta §11 (dividir pelo sumário). → confirmar.
