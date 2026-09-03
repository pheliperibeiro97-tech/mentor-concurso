// Chaves de `config` que são do APARELHO/da pessoa, e não dados de estudo: a configuração
// de IA (com a CHAVE de API) e a conexão com a nuvem (com a SENHA do cofre).
//
// Moravam só no `sync.js`, que as retirava do snapshot que sobe para o cofre. O backup
// "compartilhável" (`store.snapshotExport(false)`) nunca soube delas: limpava o material —
// que é obra de terceiro — e mandava a chave do Gemini e a senha do cofre junto, num arquivo
// que a própria interface anuncia como "Seguro para compartilhar".
//
// A senha do cofre é a IDENTIDADE do cofre: quem a tem lê e SOBRESCREVE o estudo do dono em
// qualquer aparelho. Por isso a lista vive aqui, num módulo que os dois caminhos importam —
// acrescentar uma chave nova de segredo passa a valer para o cofre e para o backup de uma vez.
export const CONFIG_LOCAL = ["sync", "syncNuvem", "iaProvider", "iaKey", "iaKeyReserva", "iaModelo"];

// Tira as chaves locais do `config` de uma fatia JÁ CLONADA (não muta o estado vivo).
// Devolve a mesma fatia, para encadear.
export function limparConfigLocal(fatia) {
  if (!fatia || typeof fatia !== "object" || !fatia.config) return fatia;
  if (!CONFIG_LOCAL.some((k) => fatia.config[k] !== undefined)) return fatia;
  fatia.config = { ...fatia.config };
  for (const k of CONFIG_LOCAL) delete fatia.config[k];
  return fatia;
}
