// VOCABULÁRIO VISUAL (Fase A) — os 4 componentes que TODAS as funções novas reusam.
//
// Por que este arquivo existe: a poluição visual não vem da quantidade de funções, vem de
// cada uma inventar seu próprio jeito de aparecer. Onze funções × (um selo + um contador +
// um aviso) = 33 elementos novos e nenhum padrão. Definindo o vocabulário ANTES, as onze
// falam a mesma língua.
//
// Regra: um quinto componente aqui é sinal de que alguma função está sendo desenhada fora
// do sistema. Antes de criar, verifique se um destes serve.
//
// Nada aqui prende clique: os componentes devolvem HTML e expõem `data-action`, que a tela
// liga com o bindActions() de ui.js — mesmo contrato do resto do app.

import { icone } from "./icones.js";
import { esc } from "./util.js";

// ---------------------------------------------------------------------------
// 1. CHIPS DE ESCOLHA RÁPIDA — classificação de 1 toque, sempre pulável.
// Usos: causa do erro (fase B) e qualquer classificação curta que venha depois.
// Não é formulário: sem "salvar", sem obrigatoriedade. Quem não responde, segue.
// ---------------------------------------------------------------------------
export function chipsEscolha({ rotulo = "", opcoes = [], valor = "", acao = "chip-escolha", nome = "", dados = {} } = {}) {
  // `dados` vira data-* em CADA chip (ex.: { t: tentativaId }), para o handler saber a
  // que registro a escolha pertence sem precisar de closure.
  const extras = Object.entries(dados)
    .map(([k, v]) => ` data-${k}="${esc(String(v))}"`)
    .join("");
  const itens = opcoes
    .map((o) => {
      const v = typeof o === "string" ? o : o.valor;
      const t = typeof o === "string" ? o : o.rotulo;
      const on = v === valor;
      // .chip-sel + .on: MESMA base que .chip-trib (pickers da Lei Seca) e .chip-escopo
      // (escopo de estudo) já usam. Um chip novo aqui seria o terceiro dialeto do mesmo
      // botão — exatamente o que esta fase existe para impedir.
      return `<button type="button" class="chip-sel${on ? " on" : ""}" data-action="${esc(acao)}"
        data-valor="${esc(v)}"${extras} aria-pressed="${on}">${on ? icone("check") : ""}${esc(t)}</button>`;
    })
    .join("");
  const rot = rotulo ? `<span class="chips-rotulo">${esc(rotulo)}</span>` : "";
  return `<div class="chips-rapidos" role="group"${nome ? ` aria-label="${esc(nome)}"` : ""}>${rot}${itens}</div>`;
}

// ---------------------------------------------------------------------------
// 2. CONTADOR DE PENDÊNCIA — companheiro do selo "a conferir".
// Só existe quando há o que conferir: contador sem ação possível é enfeite. Zerado, some.
// ---------------------------------------------------------------------------
export function contadorConferir(n, { acao = "abrir-conferir" } = {}) {
  if (!n) return "";
  return `<button type="button" class="conf-contador" data-action="${esc(acao)}"
    data-tip="Conteúdo gerado que ainda não passou pela sua conferência">${icone("triangle-alert")} ${n} a conferir</button>`;
}

// ---------------------------------------------------------------------------
// 3. BLOCO DE CONFERÊNCIA INLINE — o portão do §4.1 do plano.
// O que ele tranca NÃO é criar o cartão: é a ENTRADA NA REVISÃO ESPAÇADA. Selo amarelo não
// protege contra memorização — cartão marcado que entra no SM-2 é visto oito vezes em três
// meses e o cérebro codifica igual. Por isso a conferência acontece aqui, com a fonte ao
// lado, antes do agendamento.
//
// `fonte` ausente = o app não tem o texto para exibir. Nesse caso conferir dentro do app é
// impossível, e insistir viraria beco sem saída — só então aparece "Usar assim mesmo".
// ---------------------------------------------------------------------------
export function blocoConferencia({ afirmacao = "", fonte = null, trecho = "", acaoPrefixo = "conf" } = {}) {
  const temFonte = Boolean(trecho);
  const citacao = temFonte
    ? `<blockquote class="conf-fonte">${fonte ? `<cite class="conf-ref">${esc(fonte)}</cite>` : ""}${esc(trecho)}</blockquote>`
    : `<p class="conf-semfonte">${icone("triangle-alert")} O app não tem este texto para mostrar ao lado. A conferência é sua.</p>`;
  const escapatoria = temFonte
    ? ""
    : `<button type="button" class="btn btn-ghost btn-sm" data-action="${esc(acaoPrefixo)}-assim-mesmo">Usar assim mesmo</button>`;
  return `<div class="conf-bloco${temFonte ? "" : " conf-sem-fonte"}">
    <p class="conf-afirmacao">${esc(afirmacao)}</p>
    ${citacao}
    <div class="conf-acoes">
      <button type="button" class="btn btn-primary btn-sm" data-action="${esc(acaoPrefixo)}-ok">${icone("check")} Confere</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="${esc(acaoPrefixo)}-nao">Não confere</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="${esc(acaoPrefixo)}-depois">Agora não</button>
      ${escapatoria}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// 4. GRADE DE ESTADOS — um ponto por etapa, uma linha por item.
// Usos: mapa de cobertura do edital (fase B) e qualquer progresso por tópico.
// O valor está no que fica APAGADO: o erro clássico não é estudar pouco, é estudar muito e
// nunca abrir parte do edital sem perceber. Linha vazia tem de gritar.
//
// itens: [{ nome, estados: [bool, bool, …], href }]  ·  etapas: [{ chave, rotulo }]
// ---------------------------------------------------------------------------
// A legenda é SEPARADA de propósito: quando a grade se repete (uma por disciplina), a
// legenda deve aparecer UMA vez no topo. Repeti-la em cada bloco seria, num edital de 21
// disciplinas, 21 legendas idênticas — poluição pura.
export function legendaEstadosHTML(etapas = []) {
  const itens = etapas
    .map((e) => `<span class="ge-leg"><i class="ge-p is-on"></i>${esc(e.rotulo)}</span>`)
    .join("");
  return `<div class="ge-legendas">${itens}<span class="ge-leg ge-leg-off"><i class="ge-p"></i>ainda não</span></div>`;
}

export function gradeEstados({ itens = [], etapas = [], acao = "", legenda = false } = {}) {
  const legendaHTML = legenda ? legendaEstadosHTML(etapas) : "";
  const linhas = itens
    .map((it) => {
      const pontos = etapas
        .map((e, i) => {
          const on = Boolean(it.estados && it.estados[i]);
          return `<i class="ge-p${on ? " is-on" : ""}" data-tip="${esc(e.rotulo)}${on ? "" : " — ainda não"}"></i>`;
        })
        .join("");
      const at = acao ? ` data-action="${esc(acao)}" data-id="${esc(it.id || it.nome)}"` : "";
      return `<button type="button" class="ge-linha"${at}>
        <span class="ge-nome">${esc(it.nome)}</span><span class="ge-pontos">${pontos}</span></button>`;
    })
    .join("");
  return `<div class="grade-estados">
    ${legendaHTML}
    <div class="ge-corpo">${linhas}</div>
  </div>`;
}
