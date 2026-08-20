// Conteúdo de UM material do cofre — páginas e descrições de figura, cifradas com a mesma
// senha do cofre principal (envelope { v, salt, iv, ct }, igual ao de `/v1/cofre/:id`).
//
// Por que existe: o snapshot levava o texto de todas as páginas junto. Medido em 20/08/2026,
// com o curso completo do cursinho: 128,6 MB de snapshot, dos quais 112,7 MB eram texto de
// página. Para abrir UMA aula, o iPad tinha de baixar, decifrar e fazer JSON.parse dos 128 MB
// — é assim que um app multi-aparelho vira um app de desktop. Agora o esqueleto (metadados de
// todos os materiais) fica no objeto principal e cada material tem o seu, buscado ao abrir.
//
// Ganho colateral, e não menor: a subida vira INCREMENTAL. Apostila não muda; uma sessão de
// estudo mexe em revisões e questões. Só o material cujo hash mudou sobe de novo.
//
// Mesmo desenho de segurança do cofre principal: sem autenticação por design (o id é o hash
// da senha e o conteúdo é cifrado de ponta a ponta), CORS liberado porque o desktop Tauri
// chama de `tauri://localhost`, e um teto por requisição como única barreira contra abuso.

// Teto por MATERIAL. O maior material real do usuário tem ~2,4 MB de texto cru; 24 MB dão
// folga de uma ordem de grandeza e mantêm o abuso caro.
const LIMITE_BYTES = 24 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const DOC_RE = /^[A-Za-z0-9_-]{1,64}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};
const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });

const chave = (id, doc) => "cofre:" + id + ":p:" + doc;

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet(context) {
  const { id, doc } = context.params;
  if (!ID_RE.test(id) || !DOC_RE.test(doc)) return json({ erro: "id inválido" }, 400);
  if (!context.env.COFRE_R2) return json({ erro: "nenhum armazenamento vinculado" }, 500);
  const obj = await context.env.COFRE_R2.get(chave(id, doc));
  if (!obj) return new Response("", { status: 404, headers: CORS });
  return new Response(obj.body, { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
}

export async function onRequestPut(context) {
  const { id, doc } = context.params;
  if (!ID_RE.test(id) || !DOC_RE.test(doc)) return json({ erro: "id inválido" }, 400);
  if (!context.env.COFRE_R2) return json({ erro: "nenhum armazenamento vinculado" }, 500);
  const body = await context.request.text();
  if (body.length > LIMITE_BYTES) return json({ erro: "material grande demais" }, 413);
  try {
    const env0 = JSON.parse(body);
    if (!env0 || !env0.ct || !env0.iv || !env0.salt) return json({ erro: "envelope inválido" }, 400);
  } catch (_) {
    return json({ erro: "corpo não é JSON" }, 400);
  }
  await context.env.COFRE_R2.put(chave(id, doc), body, {
    httpMetadata: { contentType: "application/json" },
  });
  return json({ ok: true, bytes: body.length }, 200);
}
