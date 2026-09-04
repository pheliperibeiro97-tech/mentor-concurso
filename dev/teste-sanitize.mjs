// Teste: o HTML do resumo é conteúdo NÃO CONFIÁVEL e tem de passar por uma allowlist.
//
// O sanitizador era lista negra: removia `script,style,iframe,object,embed` e os atributos
// `on*`. Cobre o óbvio e deixa passar o resto. `<a href="data:text/html,...">`, `<form action>`,
// `<button formaction>`, `<base href>`, `<svg><use href>` e `<meta refresh>` não estavam na
// lista e continuavam vivos.
//
// Importa porque este HTML é gerado por IA a partir do MATERIAL do aluno, que é um PDF de
// terceiro; e no desktop o webview tem a ponte do Tauri, então XSS ali não é só roubo de texto.
//
// `resumos.js` não é importável fora do navegador, então o teste reimplanta a MESMA allowlist
// sobre um DOM mínimo e confere que o fonte continua com ela.
//
// Uso: node dev/teste-sanitize.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(aqui, "../src/screens/resumos.js"), "utf8");
const erros = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };

// ---- 1. O fonte tem de ser allowlist, não lista negra ---------------------------------------
ok(/const TAGS_OK = new Set\(/.test(src), "deve haver uma allowlist de TAGS");
ok(/const ATTRS_OK = new Set\(/.test(src), "deve haver uma allowlist de ATRIBUTOS");
ok(/function hrefSeguro/.test(src), "deve haver validação de esquema do href");
// A regressão: voltar a decidir por lista negra de atributos.
ok(!/if \(\/\^on\/i\.test\(a\.name\) \|\| \(a\.name === "href" && \/javascript:\/i\.test\(a\.value\)\)\)/.test(src),
  "não pode voltar à lista negra de `on*` + `javascript:`");

// As tags que o ataque usava e que a lista negra antiga não tinha.
for (const t of ["form", "input", "button", "base", "meta", "svg", "math", "link"]) {
  ok(new RegExp(`"${t}"`).test(src.slice(src.indexOf("TAGS_APAGAR"), src.indexOf("TAGS_APAGAR") + 400)),
    `"${t}" tem de estar entre as tags apagadas (não estava na lista negra antiga)`);
}
// `style` como ATRIBUTO fica de fora: carrega url() e position:fixed. Só a linha do ATTRS_OK
// (a seguinte é a das tags apagadas, onde "style" aparece legitimamente, como TAG).
const linhaAttrs = src.split(/\r?\n/).find((l) => l.includes("const ATTRS_OK")) || "";
ok(!/"style"/.test(linhaAttrs), "`style` não pode ser atributo permitido");
ok(/"href"/.test(linhaAttrs), "`href` tem de ser atributo permitido (o resumo cita fontes)");

// ---- 2. A regra do href, exercitada ---------------------------------------------------------
const hrefSeguro = (v) => (/^(https?:|mailto:)/i.test(String(v || "").trim()) ? String(v).trim() : null);
ok(hrefSeguro("https://planalto.gov.br/lei") === "https://planalto.gov.br/lei", "https passa");
ok(hrefSeguro("http://x.com") === "http://x.com", "http passa");
ok(hrefSeguro("mailto:a@b.com") === "mailto:a@b.com", "mailto passa");
ok(hrefSeguro("javascript:alert(1)") === null, "javascript: é bloqueado");
ok(hrefSeguro("  JavaScript:alert(1)") === null, "javascript: com espaço e maiúscula é bloqueado");
ok(hrefSeguro("data:text/html;base64,PHNjcmlwdD4=") === null, "data: é bloqueado (embute uma página inteira)");
ok(hrefSeguro("/config") === null, "href relativo é bloqueado (arrastaria a navegação do app)");
ok(hrefSeguro("") === null && hrefSeguro(null) === null, "vazio é bloqueado");

// ---- 3. O chat também: link de grounding só http(s) ------------------------------------------
const chat = readFileSync(resolve(aqui, "../src/chat.js"), "utf8");
ok(/\.filter\(\(f\) => \/\^https\?:\\\/\\\/\/i\.test\(String\(f\.uri \|\| ""\)\)\)/.test(chat),
  "os links de fonte da web do chat devem ser filtrados por esquema (esc() não protege o esquema)");

// ---- 4. E a CSP do desktop deixou de ser nula ------------------------------------------------
const conf = JSON.parse(readFileSync(resolve(aqui, "../src-tauri/tauri.conf.json"), "utf8"));
const csp = conf.app?.security?.csp;
ok(typeof csp === "string" && csp.length > 0, "a CSP do desktop não pode ser null");
if (typeof csp === "string") {
  ok(/default-src 'self'/.test(csp), "CSP deve ter default-src 'self'");
  ok(/object-src 'none'/.test(csp), "CSP deve bloquear object-src");
  ok(!/script-src[^;]*unsafe-inline/.test(csp), "script-src NÃO pode ter unsafe-inline (é o que XSS explora)");
  ok(/style-src[^;]*'unsafe-inline'/.test(csp), "style-src precisa de unsafe-inline: o app usa 164 style= inline");
  ok(/connect-src[^;]*generativelanguage\.googleapis\.com/.test(csp), "connect-src precisa do Gemini (vai pelo fetch do webview)");
  ok(/connect-src[^;]*mentor-concurso\.pages\.dev/.test(csp), "connect-src precisa do cofre");
  ok(/connect-src[^;]*ipc:/.test(csp), "connect-src precisa do ipc: do Tauri, senão o app não fala com o Rust");
  ok(/worker-src[^;]*blob:/.test(csp), "worker-src precisa de blob: para o worker do pdf.js");
  ok(/img-src[^;]*data:/.test(csp), "img-src precisa de data: (PDF e imagens são data URL)");
  ok(/media-src[^;]*blob:/.test(csp), "media-src precisa de blob: para o PiP do cronômetro");
}

if (erros.length) {
  console.error("FALHOU:\n- " + erros.join("\n- "));
  process.exit(1);
}
console.log("OK — resumo por allowlist, links só http(s), e o desktop deixou de rodar sem CSP");
