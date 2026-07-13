import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VitePWA } from "vite-plugin-pwa";

const aqui = fileURLToPath(new URL(".", import.meta.url));

// Vite serve a SPA em modo web (testes/navegador) e gera o dist/ que o Tauri empacota.
export default defineConfig({
  clearScreen: false,
  // Versão ÚNICA do app: injetada do package.json (via npm) em build-time. O código usa
  // __APP_VERSION__ (erro-log.js) em vez de manter uma string à mão que sempre desatualiza.
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || "dev"),
  },
  plugins: [
    // PWA: instalável no celular ("Adicionar à tela inicial") e funciona offline após o 1º
    // carregamento (precache dos assets). injectRegister:null → o registro do service worker
    // é feito à mão no main.js, apenas na WEB (no desktop Tauri não faz sentido).
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      // O worker flutuante do cronômetro (crono.html) NÃO deve cair no fallback de SPA.
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
        globIgnores: ["**/pdf.worker*"], // 1,4 MB só p/ importar PDF (tarefa de desktop) — carrega da rede quando precisar
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/crono/, /^\/v1\//],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "Mentor Concurso",
        short_name: "Mentor",
        description: "Estudo e organização para concursos públicos.",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#1d4ed8",
        icons: [
          { src: "/brand-logo.png", sizes: "256x256", type: "image/png", purpose: "any" },
        ],
      },
    }),
  ],
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
