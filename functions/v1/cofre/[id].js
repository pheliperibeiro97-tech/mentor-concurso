// Cofre de sincronização — Cloudflare Pages Function (mesma origem do app).
//
// Publicado JUNTO com o app (Pages): o endpoint do cofre é o próprio endereço do app
// (ex.: https://SEU-APP.pages.dev/v1/cofre/:id) — sem subdomínio workers.dev, sem CORS no
// navegador. Guarda, por cofre, UM blob CIFRADO de ponta a ponta pelo app (a senha do
// usuário nunca chega aqui).
//
// Armazenamento: binding R2 "COFRE_R2", com o KV "COFRE" ainda LIDO para não perder cofre
// gravado antes da migração. Era só KV (valor até 25 MiB); em 19/08/2026 a biblioteca passou
// disso — o snapshot inclui o texto das páginas de cada material, e o curso completo do
// cursinho trouxe 49.537 páginas — e toda sincronização passou a devolver 413.
//
// Mantém CORS liberado porque o app DESKTOP (Tauri, origem tauri://localhost) também chama
// este endpoint de forma cross-origin. Como o id é um hash da senha e o conteúdo é cifrado,
// liberar origem é seguro.

// Teto de sanidade. NÃO é o limite do R2 (que aceita muito mais): é o que impede um PUT
// anônimo de encher o armazenamento gratuito. O endpoint não tem autenticação por desenho —
// o id é o hash da senha e o conteúdo é cifrado —, então o teto é a única barreira contra
// abuso. O envelope real do usuário com o curso completo do cursinho tem ~29 MB.
const LIMITE_BYTES = 96 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  // `If-Match` precisa estar aqui, senão o navegador barra a requisição condicional antes de
  // ela sair; e `ETag` precisa ser EXPOSTO, senão o JavaScript não consegue lê-lo da resposta
  // (por padrão o CORS só entrega um punhado de cabeçalhos ao script).
  "Access-Control-Allow-Headers": "Content-Type, Accept, If-Match",
  "Access-Control-Expose-Headers": "ETag",
  "Access-Control-Max-Age": "86400",
};
const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet(context) {
  const id = context.params.id;
  if (!ID_RE.test(id)) return json({ erro: "id inválido" }, 400);
  if (!context.env.COFRE_R2 && !context.env.COFRE) return json({ erro: "nenhum armazenamento vinculado" }, 500);
  if (context.env.COFRE_R2) {
    const obj = await context.env.COFRE_R2.get("cofre:" + id);
    // `ETag` identifica ESTA versão do cofre. O app o devolve no `If-Match` da próxima subida, e
    // com isso o servidor recusa gravar por cima de uma versão que aquele aparelho nunca viu.
    if (obj) return new Response(obj.body, { status: 200, headers: { "Content-Type": "application/json", ETag: obj.httpEtag || `"${obj.etag}"`, ...CORS } });
  }
  const val = context.env.COFRE ? await context.env.COFRE.get("cofre:" + id) : null;
  if (val == null) return new Response("", { status: 404, headers: CORS });
  return new Response(val, { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
}

export async function onRequestPut(context) {
  const id = context.params.id;
  if (!ID_RE.test(id)) return json({ erro: "id inválido" }, 400);
  if (!context.env.COFRE_R2 && !context.env.COFRE) return json({ erro: "nenhum armazenamento vinculado" }, 500);
  const body = await context.request.text();
  if (body.length > LIMITE_BYTES) return json({ erro: "cofre grande demais" }, 413);
  try {
    const env0 = JSON.parse(body);
    if (!env0 || !env0.ct || !env0.iv || !env0.salt) return json({ erro: "envelope inválido" }, 400);
  } catch (_) {
    return json({ erro: "corpo não é JSON" }, 400);
  }
  // GRAVAÇÃO CONDICIONAL (opcional). Quando o app manda `If-Match: <etag que ele baixou>`, a
  // gravação só acontece se o cofre ainda estiver naquela versão. Se outro aparelho tiver subido
  // no meio do caminho, a resposta é 412 e o app baixa de novo antes de tentar — em vez de
  // sobrescrever o que o outro acabou de gravar.
  // Sem o cabeçalho, o comportamento é o de sempre: aparelho em versão antiga continua
  // funcionando, e é por isso que a checagem é opcional e não obrigatória.
  const ifMatch = context.request.headers.get("If-Match");
  if (context.env.COFRE_R2) {
    if (ifMatch) {
      try {
        const r = await context.env.COFRE_R2.put("cofre:" + id, body, {
          httpMetadata: { contentType: "application/json" },
          onlyIf: { etagMatches: ifMatch.replace(/^W\//, "").replace(/"/g, "") },
        });
        // O R2 devolve `null` quando a condição não bate: ninguém gravou, e quem chamou precisa
        // saber disso (um 200 aqui seria uma gravação perdida em silêncio).
        if (!r) return json({ erro: "o cofre mudou desde a sua última leitura", codigo: "CONFLITO" }, 412);
        return json({ ok: true }, 200);
      } catch (e) {
        return json({ erro: "falha na gravação condicional" }, 500);
      }
    }
    await context.env.COFRE_R2.put("cofre:" + id, body, { httpMetadata: { contentType: "application/json" } });
  } else {
    await context.env.COFRE.put("cofre:" + id, body); // KV legado: não tem gravação condicional
  }
  return json({ ok: true }, 200);
}
