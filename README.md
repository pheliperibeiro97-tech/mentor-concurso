# Mentor Concurso — MVP

App de estudo para concursos baseado num ciclo de aprendizado ativo (Estudo → Aplicação → Revisão → Adaptação).
Núcleo 100% offline; camada de IA opcional (orquestrador, não oráculo) com **selo de origem** 🟢/🟡/✍.

## Como rodar

### Modo web (desenvolvimento / testes)
```bash
npm install
npm run dev          # abre em http://localhost:1420
```
No navegador, os dados são salvos em `localStorage`.

### Modo desktop (Tauri + SQLite)
```bash
npm run tauri dev    # janela nativa, dados em SQLite (app_data_dir)
npm run tauri build  # gera o instalador (.msi/.exe) em src-tauri/target/release/bundle
```

## Arquitetura

- **Frontend:** Vite + JavaScript modular (sem framework pesado). A MESMA interface roda no
  navegador (testes) e no webview do Tauri (desktop).
- **Persistência pluggable** (`src/persistence.js`): SQLite via Rust no desktop; `localStorage` no navegador.
- **Backend Rust** (`src-tauri/`): comandos `load_state`/`save_state` gravam o estado (JSON) numa
  tabela chave/valor SQLite. Normalização em tabelas fica para a v2.
- **Domínio** (`src/store.js`): modelo de dados + regras. `sm2.js` (repetição espaçada),
  `ciclo.js` (ciclo do dia), `ia.js` (heurísticas offline com selo de origem).
- **Telas** (`src/screens/`): Onboarding, Hoje, Prática, Caderno de Erros, Flashcards,
  Dossiê por Tópico, Base documental, Correção de texto, Planejamento, Diagnóstico, Configurações.

## Selo de origem
- 🟢 **Extraído de:** _material_ — conteúdo estruturado do seu próprio material (com a fonte específica).
- 🟡 **IA · a partir de:** _fonte_ — gerado pela IA (confira); indica o documento/questão de origem.
- ✍ **Inserido por você** — conteúdo digitado manualmente.

## Status
MVP funcional, testado tela a tela. Próximos passos (v2+): IA online (Claude Code/Gemini),
OCR de redação por foto, busca semântica, conteúdo jurídico (lei seca/jurisprudência analisada),
multi-concurso (v3).
