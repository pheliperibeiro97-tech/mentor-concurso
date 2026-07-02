import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = fileURLToPath(new URL(".", import.meta.url));

// Vite serve a SPA em modo web (testes/navegador) e gera o dist/ que o Tauri empacota.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2021",
    outDir: "dist",
    emptyOutDir: true,
    // Multi-página: além do app (index.html), a janela flutuante do cronômetro tem
    // sua própria página mínima (crono.html). Ambas precisam ir para o dist/.
    rollupOptions: {
      input: {
        main: resolve(aqui, "index.html"),
        crono: resolve(aqui, "crono.html"),
      },
    },
  },
});
