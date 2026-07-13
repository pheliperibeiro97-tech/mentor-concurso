// Cofre de sincronização — Cloudflare Pages Function (mesma origem do app).
//
// Publicado JUNTO com o app (Pages): o endpoint do cofre é o próprio endereço do app
// (ex.: https://SEU-APP.pages.dev/v1/cofre/:id) — sem subdomínio workers.dev, sem CORS no
// navegador. Guarda, por cofre, UM blob CIFRADO de ponta a ponta pelo app (a senha do
// usuário nunca chega aqui). Binding KV "COFRE" configurado no wrangler.toml da raiz.
//
// Mantém CORS liberado porque o app DESKTOP (Tauri, origem tauri://localhost) também chama
// este endpoint de forma cross-origin. Como o id é um hash da senha e o conteúdo é cifrado,
// liberar origem é seguro.

const LIMITE_BYTES = 24 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};
const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet(context) {
  const id = context.params.id;
  if (!ID_RE.test(id)) return json({ erro: "id inválido" }, 400);
  if (!context.env.COFRE) return json({ erro: "KV COFRE não vinculado" }, 500);
  const val = await context.env.COFRE.get("cofre:" + id);
  if (val == null) return new Response("", { status: 404, headers: CORS });
  return new Response(val, { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
}

export async function onRequestPut(context) {
  const id = context.params.id;
  if (!ID_RE.test(id)) return json({ erro: "id inválido" }, 400);
  if (!context.env.COFRE) return json({ erro: "KV COFRE não vinculado" }, 500);
  const body = await context.request.text();
  if (body.length > LIMITE_BYTES) return json({ erro: "cofre grande demais para o KV; migre para R2" }, 413);
  try {
    const env0 = JSON.parse(body);
    if (!env0 || !env0.ct || !env0.iv || !env0.salt) return json({ erro: "envelope inválido" }, 400);
  } catch (_) {
    return json({ erro: "corpo não é JSON" }, 400);
  }
  await context.env.COFRE.put("cofre:" + id, body);
  return json({ ok: true }, 200);
}
