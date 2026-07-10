// Simulados — CASA ÚNICA (hub): FAZER (motor cronometrado, mc/ce) + HISTÓRICO (evolução).
// Consolida o que antes vivia espalhado como aba "Simulado" dentro de Questões e C/E.
// O motor (renderSimulado) é reaproveitado, só muda de casa; ao finalizar, o simulado
// é auto-registrado no histórico (store.registrarSimulado origem:"app"). O histórico
// também aceita simulados EXTERNOS (prova física/cursinho/outra plataforma).
import { bindActions, header, vazio, toast, abrirJanela, confirmar, plural } from "../ui.js";
import { esc, fmtData, todayISO, fmtTempoCurto } from "../util.js";
import { icone } from "../icones.js";
import renderSimulado, { correcaoSimuladoHTML, imprimirSimulado } from "./simulado.js";

let subModo = "fazer"; // fazer | historico
let formatoAtivo = "mc"; // mc | ce

const FMT_NOME = { mc: "Múltipla escolha", ce: "Certo / errado" };

// Mini gráfico de evolução do aproveitamento por simulado (cronológico).
function graficoSimulados(lista) {
  const serie = [...lista].reverse(); // mais antigo → mais novo
  if (serie.length < 2) return "";
  const W = 640, H = 180, padR = 56, padTop = 14, padBottom = 24, padL = 40;
  const innerW = W - padL - padR, innerH = H - padTop - padBottom;
  const n = serie.length;
  const xAt = (i) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (p) => padTop + innerH - (p / 100) * innerH;
  const grades = [0, 50, 100]
    .map((v) => `<line x1="${padL}" y1="${yAt(v).toFixed(1)}" x2="${W - padR}" y2="${yAt(v).toFixed(1)}" class="g-grade"></line><text x="${padL - 6}" y="${(yAt(v) + 3).toFixed(1)}" class="g-eixo" text-anchor="end">${v}%</text>`)
    .join("");
  const ref = (v, cls, lbl) => `<line x1="${padL}" y1="${yAt(v).toFixed(1)}" x2="${W - padR}" y2="${yAt(v).toFixed(1)}" class="g-ref ${cls}"></line><text x="${(W - padR + 8).toFixed(1)}" y="${(yAt(v) + 3).toFixed(1)}" class="g-ref-lbl ${cls}" text-anchor="start">${lbl}</text>`;
  const linha = serie.map((s, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(s.aproveitamento).toFixed(1)}`).join(" ");
  const pontos = serie.map((s, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(s.aproveitamento).toFixed(1)}" r="3.4" class="g-ponto"><title>${esc(s.nome)}: ${s.aproveitamento}% (${s.acertos}/${s.total}) · ${fmtData(s.data)}</title></circle>`).join("");
  const passo = Math.max(1, Math.round((n - 1) / 5));
  const eixoX = serie.map((s, i) => (i % passo !== 0 && i !== n - 1 ? "" : `<text x="${xAt(i).toFixed(1)}" y="${H - 8}" class="g-eixo" text-anchor="middle">${s.data.slice(8, 10)}/${s.data.slice(5, 7)}</text>`)).join("");
  return `<div class="grafico-svg-wrap"><svg viewBox="0 0 ${W} ${H}" class="grafico-svg" role="img" aria-label="Aproveitamento por simulado">
      ${grades}${ref(70, "g-ref-bom", "bom")}${ref(50, "g-ref-ruim", "atenção")}
      <path d="${linha}" class="g-linha"></path>${pontos}${eixoX}
    </svg></div>`;
}

function cardSimulado(s) {
  const fmt = FMT_NOME[s.formato] || "Múltipla escolha";
  const cor = s.aproveitamento >= 70 ? "var(--success)" : s.aproveitamento < 50 ? "var(--danger)" : "var(--warn)";
  const origem = s.origem === "app" ? `<span class="sim-tag sim-tag-app">no app</span>` : `<span class="sim-tag sim-tag-ext">externo</span>`;
  const temCorrecao = s.origem === "app" && Array.isArray(s.questaoIds) && s.questaoIds.length;
  return `<div class="sim-item" style="--cor:${cor}">
      <div class="sim-ring" style="background:conic-gradient(${cor} ${s.aproveitamento * 3.6}deg, var(--surface-3) 0)"><span>${s.aproveitamento}%</span></div>
      <div class="sim-corpo">
        <div class="sim-titulo">${esc(s.nome)} ${origem}</div>
        <div class="sim-meta">${fmt} · <b class="sim-ac">${s.acertos} certas</b> · <b class="sim-er">${s.erros} erradas</b>${s.brancos ? ` · ${s.brancos} em branco` : ""} · ${s.total} questões · ${fmtData(s.data)}${s.tempoSeg ? ` · ${fmtTempoCurto(s.tempoSeg)}` : ""}</div>
      </div>
      ${temCorrecao ? `<button class="btn btn-ghost btn-sm sim-corr-btn" data-action="sim-ver-correcao" data-id="${s.id}">${icone("search")} Ver correção</button>` : ""}
      <button class="sim-del" data-action="sim-remover" data-id="${s.id}" data-tip="Remover do histórico">${icone("trash-2")}</button>
    </div>`;
}

export default function renderSimulados(root, app) {
  const { store } = app;
  const st = store.get();

  const subtabs = `<div class="ls-segmented" role="tablist">
      <button class="ls-seg ${subModo === "fazer" ? "on" : ""}" data-sub="fazer">${icone("clipboard-list")}<span class="ls-seg-txt">Novo simulado</span></button>
      <button class="ls-seg ${subModo === "historico" ? "on" : ""}" data-sub="historico">${icone("trending-up")}<span class="ls-seg-txt">Histórico</span></button>
    </div>`;

  if (subModo === "fazer") {
    root.innerHTML = `
      ${header("Simulados", "Monte uma prova cronometrada a partir das suas questões.", `<button class="btn btn-ghost btn-sm" data-action="sim-imprimir" data-tip="Imprimir a folha do simulado (questões; com gabarito quando já corrigido).">${icone("printer")} Imprimir folha</button>`)}
      ${subtabs}
      <div class="ls-segmented sim-fmt" role="group" aria-label="Formato do simulado">
        <button class="ls-seg ${formatoAtivo === "mc" ? "on" : ""}" data-fmt="mc">${icone("list-checks")}<span class="ls-seg-txt">Múltipla escolha</span></button>
        <button class="ls-seg ${formatoAtivo === "ce" ? "on" : ""}" data-fmt="ce">${icone("check-check")}<span class="ls-seg-txt">Certo / errado</span></button>
      </div>
      <div id="sim-body"></div>`;
    ligarSubtabs(root, app);
    root.querySelectorAll("[data-fmt]").forEach((b) => b.addEventListener("click", () => { formatoAtivo = b.getAttribute("data-fmt"); app.refresh(); }));
    root.querySelector('[data-action="sim-imprimir"]')?.addEventListener("click", () => imprimirSimulado(app));
    // Reaproveita o MOTOR existente (config → prova cronometrada → resultado).
    // IMPORTANTE: RETORNAR o cleanup do motor — no simulado em andamento ele remove o listener de
    // teclado (Esc) e para o timer. Sem o return, o cleanup se perdia: ao sair para outra tela o
    // listener do simulado VAZAVA (Esc noutra tela abria "Sair do simulado?") e o timer seguia rodando.
    return renderSimulado(root.querySelector("#sim-body"), app, formatoAtivo);
  }

  // ----- Histórico -----
  const resumo = store.simuladosResumo();
  const lista = store.simuladosLista();
  const corFaixa = (v) => (v == null ? "" : v >= 70 ? "sim-ok" : v < 50 ? "sim-baixo" : "");
  root.innerHTML = `
    ${header("Simulados", "Acompanhe a evolução e registre simulados feitos fora do app.", `<button class="btn btn-primary btn-sm" data-action="sim-registrar-externo">${icone("plus")} Registrar externo</button>`)}
    ${subtabs}

    <section class="scorecard sim-cards">
      <div class="sc-pilar"><span class="kpi-ico">${icone("clipboard-list")}</span><span class="sc-num">${resumo.total}</span><span class="sc-rot">Simulados</span></div>
      <div class="sc-pilar"><span class="kpi-ico">${icone("target")}</span><span class="sc-num ${corFaixa(resumo.media)}">${resumo.media == null ? "—" : resumo.media + "%"}</span><span class="sc-rot">Aproveitamento médio</span></div>
      <div class="sc-pilar"><span class="kpi-ico">${icone("trending-up")}</span><span class="sc-num ${corFaixa(resumo.melhor)}">${resumo.melhor == null ? "—" : resumo.melhor + "%"}</span><span class="sc-rot">Melhor nota</span></div>
      <div class="sc-pilar"><span class="kpi-ico">${icone("list-checks")}</span><span class="sc-num">${resumo.questoes}</span><span class="sc-rot">Questões no total</span></div>
    </section>

    ${
      lista.length
        ? `${lista.length >= 2 ? `<section class="card sim-grafico"><h3 class="grafico-tit">Evolução <span class="muted small">aproveitamento por simulado</span></h3>${graficoSimulados(lista)}</section>` : ""}
           <section class="rev-secao"><h3 class="rev-secao-h">${icone("clipboard-list")} Seus simulados <span class="cnt">${lista.length}</span></h3>
             <div class="sim-lista">${lista.map((s) => cardSimulado(s)).join("")}</div>
           </section>`
        : vazio("Nenhum simulado ainda\nMonte um simulado na aba \"Novo simulado\" ou registre um simulado feito fora do app para acompanhar sua evolução.", "", icone("clipboard-list"))
    }`;
  ligarSubtabs(root, app);

  bindActions(root, {
    "sim-registrar-externo": () => abrirRegistrarExterno(store, app),
    "sim-ver-correcao": (el) => {
      const s = store.simuladosLista().find((x) => x.id === el.getAttribute("data-id"));
      if (!s) return;
      abrirJanela({
        titulo: `${s.nome} · ${fmtData(s.data)}`,
        corpoHTML: correcaoSimuladoHTML(app, s),
      });
    },
    "sim-remover": async (el) => {
      const s = store.simuladosLista().find((x) => x.id === el.getAttribute("data-id"));
      if (!s) return;
      if (!(await confirmar(`Remover "${esc(s.nome)}" do histórico de simulados?`))) return;
      store.removerSimulado(s.id);
      toast("Simulado removido do histórico.");
      app.refresh();
    },
  });
}

function ligarSubtabs(root, app) {
  root.querySelectorAll("[data-sub]").forEach((b) =>
    b.addEventListener("click", () => { subModo = b.getAttribute("data-sub"); app.refresh(); })
  );
}

// Modal de registro de simulado EXTERNO (prova física/cursinho/outra plataforma).
function abrirRegistrarExterno(store, app) {
  const corpoHTML = `<div class="sim-ext">
      <label class="rsx-lbl">Nome do simulado <b class="rsx-req">*</b></label>
      <input id="sim-nome" type="text" maxlength="120" placeholder="Ex.: Simulado CESPE · Direito Constitucional" />
      <div class="sim-ext-row">
        <label>Data<input id="sim-data" type="date" value="${todayISO()}" /></label>
        <label>Tipo<select id="sim-tipo"><option value="mc">Múltipla escolha</option><option value="ce">Certo / errado</option></select></label>
      </div>
      <label class="rsx-lbl">Resultado</label>
      <div class="sim-ext-res">
        <label class="sim-res-ac">Certas<input id="sim-ac" type="number" min="0" max="9999" value="0" /></label>
        <label class="sim-res-er">Erradas<input id="sim-er" type="number" min="0" max="9999" value="0" /></label>
        <label>Em branco<input id="sim-br" type="number" min="0" max="9999" value="0" /></label>
      </div>
      <div class="rsx-rodape">
        <button class="btn btn-ghost" data-se-cancelar>Cancelar</button>
        <button class="btn btn-primary" data-se-ok>Salvar simulado</button>
      </div>
    </div>`;
  abrirJanela({
    titulo: "Registrar simulado externo",
    corpoHTML,
    aoMontar: (overlay, fechar) => {
      const q = (s) => overlay.querySelector(s);
      q("[data-se-cancelar]").addEventListener("click", fechar);
      q("[data-se-ok]").addEventListener("click", () => {
        const nome = q("#sim-nome").value.trim();
        const ac = parseInt(q("#sim-ac").value, 10) || 0;
        const er = parseInt(q("#sim-er").value, 10) || 0;
        const br = parseInt(q("#sim-br").value, 10) || 0;
        if (ac + er + br < 1) { toast("Informe o resultado (certas/erradas/branco).", "erro"); return; }
        store.registrarSimulado({ origem: "externo", nome, formato: q("#sim-tipo").value, acertos: ac, erros: er, brancos: br, data: q("#sim-data").value || null });
        toast("Simulado registrado no histórico.");
        fechar();
        app.refresh();
      });
    },
  });
}
