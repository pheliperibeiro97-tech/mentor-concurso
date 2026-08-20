// Cofre de sincronização do Mentor Concurso — Cloudflare Worker.
//
// Guarda, por "cofre", UM blob CIFRADO (o app cifra de ponta a ponta com a senha do usuário;
// este Worker nunca vê senha nem dados em claro). O endereço do cofre (:id) é um hash da
// senha gerado no cliente. Rotas:
//   GET  /v1/cofre/:id  → devolve o blob (200) ou 404 se ainda não existe
//   PUT  /v1/cofre/:id  → grava/atualiza o blob
//   OPTIONS            → preflight CORS
//
// Deploy (Fase 3, na conta grátis do usuário):
//   1) `npm i -g wrangler` (ou `npx wrangler`)
//   2) `wrangler login`
//   3) `wrangler kv namespace create COFRE` → cole o id no wrangler.toml
//   4) `wrangler deploy`
//
// Armazenamento: R2, com o KV antigo ainda LIDO para não perder cofre existente.
//
// Era KV (valor até 25 MiB). Em 19/08/2026 a biblioteca do usuário passou disso — o snapshot
// inclui o texto das páginas de cada material, e o curso completo do cursinho trouxe 49.537
// páginas — e toda sincronização passou a devolver 413. O R2 não tem esse teto (objeto até 5 TB),
// e a lógica é a mesma: get/put por chave.
//
// Deploy: `wrangler r2 bucket create mentor-cofre` e `wrangler deploy`. O binding KV pode ficar
// no wrangler.toml enquanto houver cofre antigo para migrar; depois é só remover.

// Teto de sanidade. NÃO é o limite do R2: é o que impede um PUT anônimo de encher o
// armazenamento gratuito. O envelope real com o curso completo tem ~29 MB.
const LIMITE_BYTES = 64 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/; // base64url do SHA-256 (o cliente corta/limita)

function cors(origin) {
  // Cofre guarda só bytes cifrados e o id é secreto (hash da senha) — liberar origem é seguro.
  // Para restringir a um domínio, troque "*" pelo endereço do app (ex.: https://SEU-APP.pages.dev).
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
  };
}
function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";
    const h = cors(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });

    const url = new URL(request.url);
    const m = url.pathname.match(/^\/v1\/cofre\/([^/]+)\/?$/);
    if (!m) return json({ erro: "rota desconhecida" }, 404, h);
    const id = decodeURIComponent(m[1]);
    if (!ID_RE.test(id)) return json({ erro: "id inválido" }, 400, h);

    if (!env.COFRE_R2 && !env.COFRE) return json({ erro: "nenhum armazenamento vinculado" }, 500, h);

    if (request.method === "GET") {
      // R2 primeiro; o KV continua sendo lido enquanto houver cofre gravado antes da migração.
      if (env.COFRE_R2) {
        const obj = await env.COFRE_R2.get("cofre:" + id);
        if (obj) return new Response(obj.body, { status: 200, headers: { "Content-Type": "application/json", ...h } });
      }
      const val = env.COFRE ? await env.COFRE.get("cofre:" + id) : null;
      if (val == null) return new Response("", { status: 404, headers: h });
      return new Response(val, { status: 200, headers: { "Content-Type": "application/json", ...h } });
    }

    if (request.method === "PUT") {
      const body = await request.text();
      if (body.length > LIMITE_BYTES) return json({ erro: "cofre grande demais" }, 413, h);
      // Validação mínima: precisa ser o envelope cifrado do app (não guardamos lixo).
      try {
        const env0 = JSON.parse(body);
        if (!env0 || !env0.ct || !env0.iv || !env0.salt) return json({ erro: "envelope inválido" }, 400, h);
      } catch (_) {
        return json({ erro: "corpo não é JSON" }, 400, h);
      }
      if (env.COFRE_R2) await env.COFRE_R2.put("cofre:" + id, body, { httpMetadata: { contentType: "application/json" } });
      else await env.COFRE.put("cofre:" + id, body);
      return json({ ok: true }, 200, h);
    }

    return json({ erro: "método não suportado" }, 405, h);
  },
};
