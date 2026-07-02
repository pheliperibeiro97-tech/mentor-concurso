// Entry dedicado da janela flutuante do cronômetro (crono.html).
//
// Carrega APENAS o mini-relógio reaproveitando montarCronoMini(), sem licença,
// store, chat ou render do app. A versão anterior reusava index.html com #crono=1
// e dependia de detecção frágil (hash/flag); quando a detecção falhava, a janelinha
// rodava o app inteiro num espaço de 220x104 — abrindo em branco e às vezes
// derrubando o processo. Uma página própria elimina essa fragilidade na raiz.
//
// A sincronia com a janela principal é via localStorage (montarCronoMini já liga o
// ouvinte de "storage"), então ambas as janelas compartilham o mesmo estado.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { montarCronoMini } from "./cronometro.js";

function start() {
  try {
    montarCronoMini();
  } catch (e) {
    // Falha não pode deixar a janela em branco sem pista: mostra o erro na própria tela.
    try {
      const d = document.createElement("pre");
      d.style.cssText = "margin:0;padding:8px;font:11px monospace;color:#b91c1c;white-space:pre-wrap;";
      d.textContent = "Cronômetro falhou ao iniciar:\n" + (e && e.stack || e);
      document.body.appendChild(d);
    } catch (_) {}
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
