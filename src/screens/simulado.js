// Simulado cronometrado — em dois formatos ('mc' múltipla escolha | 'ce' Certo/Errado),
// recebidos de pratica.js. Diferente do Treino: é cronometrado, mostra o gabarito só no
// final e é COMPOSTO POR MATÉRIA (cotas: X questões de cada disciplina), como uma prova
// real. Tem modos rápidos, tempo sugerido, embaralho das alternativas e resultado por
// matéria. Cada resposta vira tentativa (Caderno de Erros + Diagnóstico).
import { bindActions, toast, vazio, confirmar, seloBadge, imprimir, pedirNumero , plural } from "../ui.js";
import { esc, fmtMMSS, fmtTempo, pct } from "../util.js";
import { icone } from "../icones.js";
import { addQuestoesBotaoHTML, addQuestoesPanelHTML, ligarAddQuestoesArquivo, addQuestoesHandlers, statusQuestao } from "./questoes-add.js";

// Estado independente por formato.
function novoSS() {
  return { cfg: { status: "todas", cotas: {}, tempoMin: 0, embaralhar: false }, addState: { aberto: false }, sim: null };
}
const SS = { mc: novoSS(), ce: novoSS() };
let formatoAtivo = "mc";

// Gate do pool do simulado: questão do formato certo e NÃO anulada (anuladas ficam fora
// da prática e da pontuação — não têm gabarito válido).
const ehDoFormato = (q, formato) => !q.anulada && (formato === "ce" ? q.formato === "ce" : q.formato !== "ce");

// Disciplina (matéria) de uma questão, via tópico. Sem tópico/disciplina → "sem".
function discKey(st, q) {
  const t = q.topicoId ? st.topicos.find((x) => x.id === q.topicoId) : null;
  return t && t.disciplinaId ? t.disciplinaId : "sem";
}
function nomeDisc(st, key) {
  if (key === "sem") return "Sem disciplina";
  const d = st.disciplinas.find((x) => x.id === key);
  return d ? d.nome : "Sem disciplina";
}

// Pool base do formato, respeitando o filtro de SITUAÇÃO (inclui "fracos" = errei ou pendente).
function poolBase(st, formato, status) {
  return st.questoes.filter((q) => {
    if (!ehDoFormato(q, formato)) return false;
    if (status === "todas") return true;
    const s = statusQuestao(st, q);
    if (status === "fracos") return s === "errei" || s === "pendente";
    return s === status;
  });
}

// Disponível por matéria (para a tabela de cotas). Ordena por nome; "Sem matéria" por último.
function composicaoDisponivel(st, formato, status) {
  const base = poolBase(st, formato, status);
  const mapa = new Map();
  for (const q of base) {
    const k = discKey(st, q);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(q);
  }
  return [...mapa.entries()]
    .map(([key, qs]) => ({ key, nome: nomeDisc(st, key), disp: qs.length, peso: relevanciaDisc(st, key) }))
    .sort((a, b) => {
      const sa = a.key === "sem", sb = b.key === "sem";
      if (sa !== sb) return sa ? 1 : -1;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
}

// Relevância agregada da matéria = soma dos pesos (relevância "mais cai") dos seus tópicos.
function relevanciaDisc(st, key) {
  if (key === "sem") return 0;
  return st.topicos.filter((t) => t.disciplinaId === key).reduce((a, t) => a + (t.peso || 0), 0);
}

// Monta a lista final de questões a partir das cotas (X de cada matéria), embaralhada.
function montarPorCotas(st, formato, ss) {
  const base = poolBase(st, formato, ss.cfg.status);
  const porDisc = new Map();
  for (const q of base) {
    const k = discKey(st, q);
    if (!porDisc.has(k)) porDisc.set(k, []);
    porDisc.get(k).push(q);
  }
  let escolhidas = [];
  for (const [k, qs] of porDisc) {
    const cota = Math.max(0, ss.cfg.cotas[k] || 0);
    if (cota > 0) escolhidas = escolhidas.concat(embaralhar(qs).slice(0, cota));
  }
  return embaralhar(escolhidas);
}

function totalCotas(ss) {
  return Object.values(ss.cfg.cotas || {}).reduce((a, n) => a + (Math.max(0, n) || 0), 0);
}
// Tempo sugerido: ~3 min por questão de múltipla escolha, ~2 min por item Certo/Errado.
function tempoSugerido(total, formato) {
  return total * (formato === "ce" ? 2 : 3);
}

// Distribui N itens entre matérias proporcional a um peso, respeitando o disponível (max).
function distribuir(N, itens) {
  const res = {};
  const pesoTotal = itens.reduce((a, i) => a + Math.max(0, i.peso), 0) || itens.reduce((a, i) => a + i.max, 0) || 1;
  const comFrac = itens.map((i) => {
    const ideal = ((Math.max(0, i.peso) || i.max) / pesoTotal) * N;
    const base = Math.min(i.max, Math.floor(ideal));
    return { key: i.key, max: i.max, base, frac: ideal - Math.floor(ideal) };
  });
  let restante = N;
  comFrac.forEach((i) => { res[i.key] = i.base; restante -= i.base; });
  comFrac.sort((a, b) => b.frac - a.frac);
  let idx = 0, guard = 0;
  while (restante > 0 && comFrac.some((i) => res[i.key] < i.max) && guard < 100000) {
    const i = comFrac[idx % comFrac.length];
    if (res[i.key] < i.max) { res[i.key]++; restante--; }
    idx++; guard++;
  }
  return res;
}

export default function renderSimulado(root, app, formato = "mc") {
  formatoAtivo = formato;
  const { store } = app;
  const st = store.get();
  const ss = SS[formato];
  if (ss.sim && ss.sim.resultado) return renderResultado(root, app, st, formato);
  if (ss.sim) return renderEmAndamento(root, app, st, formato);
  return renderSetup(root, app, st, formato);
}

// ---------- Configuração ----------
function renderSetup(root, app, st, formato) {
  const ss = SS[formato];
  const cfg = ss.cfg;
  const nomeItem = formato === "ce" ? "itens" : "questões";
  const comp = composicaoDisponivel(st, formato, cfg.status);
  const total = totalCotas(ss);
  const sugestao = tempoSugerido(total, formato);

  root.innerHTML = `
    <div class="barra-acoes">
      ${addQuestoesBotaoHTML(ss.addState.aberto, formato)}
    </div>

    <section class="card sim-setup-card">
      <header class="sim-setup-head">
        <h3>Monte sua prova</h3>
        <p class="muted small" data-tip="Você pode fazer só uma disciplina, várias, ou X de cada. É cronometrado e o gabarito só aparece ao finalizar.">Escolha <b>quantas ${nomeItem} de cada disciplina</b>, como numa prova real.</p>
      </header>

      <div class="sim-modos">
        <span class="muted small">Atalhos:</span>
        <button class="btn btn-ghost btn-sm" data-action="modo-tudo" data-tip="Usa todas as ${nomeItem} que você já cadastrou, de todas as disciplinas.">${icone("clipboard-list")} Todas as ${nomeItem}</button>
        <button class="btn btn-ghost btn-sm" data-action="modo-edital" data-tip="Sorteia N ${nomeItem} distribuídas pela relevância do edital (proporção do edital).">${icone("target")} Pelo edital…</button>
        <button class="btn btn-ghost btn-sm" data-action="modo-aleatorio" data-tip="Sorteia N ${nomeItem} aleatórias entre as disciplinas.">${icone("dices")} Aleatória…</button>
        <button class="btn btn-ghost btn-sm" data-action="modo-fracos" data-tip="Foca no que você errou ou ainda não respondeu.">${icone("bandage")} Pontos fracos</button>
        <button class="lnk sim-modo-limpar" data-action="modo-limpar" data-tip="Zera as cotas.">limpar</button>
      </div>

      <div class="form-row" style="margin:10px 0 4px">
        <label class="inline">Situação:
          <select id="sim-status">
            <option value="todas" ${cfg.status === "todas" ? "selected" : ""}>Todas</option>
            <option value="pendente" ${cfg.status === "pendente" ? "selected" : ""}>Pendentes</option>
            <option value="errei" ${cfg.status === "errei" ? "selected" : ""}>Errei</option>
            <option value="acertei" ${cfg.status === "acertei" ? "selected" : ""}>Acertei</option>
            <option value="fracos" ${cfg.status === "fracos" ? "selected" : ""}>Pontos fracos (errei + pendentes)</option>
          </select>
        </label>
      </div>

      ${
        comp.length
          ? `<table class="sim-cotas">
              <thead><tr><th>Disciplina</th><th>Disponível</th><th>Quantas no simulado</th></tr></thead>
              <tbody>
                ${comp
                  .map((c) => {
                    const v = Math.min(c.disp, Math.max(0, cfg.cotas[c.key] || 0));
                    return `<tr>
                      <td>${esc(c.nome)}</td>
                      <td class="sim-disp">${c.disp}</td>
                      <td><input type="number" class="sim-cota" data-disc="${esc(c.key)}" min="0" max="${c.disp}" value="${v}" /> <button class="lnk" data-action="cota-max" data-disc="${esc(c.key)}" data-tip="Usar todas desta disciplina">tudo</button></td>
                    </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>`
          : (function () {
              const nomeItem = formato === "ce" ? "itens" : "questões";
              // Tem questões do formato, mas nenhuma nessa situação? Vazio de filtro.
              const totalFormato = st.questoes.filter((q) => ehDoFormato(q, formato)).length;
              if (totalFormato) {
                return vazio(`Nada nessa situação\nNenhuma das suas ${nomeItem} se enquadra na situação escolhida. Troque a situação acima para montar a prova.`, "", icone("dices"));
              }
              // Não tem nada: CTA reusa o data-action real de adicionar (toggle-addq).
              const cta = `<button class="btn btn-add" data-action="toggle-addq">Adicionar ${nomeItem}</button>`;
              return vazio(`Cadastre ${nomeItem} para montar o simulado\nO simulado é montado a partir das suas ${nomeItem}. Adicione, importe de uma prova, ou gere com a IA.`, cta, icone("notebook-pen"));
            })()
      }

      <div class="sim-rodape">
        <label class="inline">Tempo (min, 0 = sem limite)
          <input id="sim-tempo" type="number" min="0" max="600" value="${cfg.tempoMin}" />
        </label>
        ${total ? `<span class="muted small">Sugestão: <b>${sugestao} min</b> (≈${formato === "ce" ? 2 : 3} min/${formato === "ce" ? "item" : "questão"}) · <button class="lnk" data-action="usar-tempo">usar</button></span>` : ""}
        <label class="inline" ${formato === "ce" ? "style='display:none'" : ""}><input type="checkbox" id="sim-embaralhar" ${cfg.embaralhar ? "checked" : ""} /> Embaralhar as alternativas</label>
      </div>

      <div class="sim-iniciar">
        <div class="sim-iniciar-resumo">
          <span class="sim-total"><b>${total}</b> ${total === 1 ? (formato === "ce" ? "item selecionado" : "questão selecionada") : (formato === "ce" ? "itens selecionados" : "questões selecionadas")}</span>
          <span class="muted small" data-tip="As alternativas são embaralhadas e o gabarito só aparece ao finalizar. Os erros vão para o Caderno de Erros e o tempo para o Acompanhamento.">Como funciona</span>
        </div>
        <button class="btn btn-primary btn-lg" data-action="iniciar" ${total ? "" : "disabled"}>${icone("play")} Iniciar simulado${total ? ` (${total})` : ""}</button>
      </div>
    </section>`;

  root.querySelector("#sim-status")?.addEventListener("change", (e) => {
    cfg.status = e.target.value;
    app.refresh();
  });
  // Cotas: salvar sem re-render (evita perder o foco enquanto digita); atualiza o total ao vivo.
  root.querySelectorAll(".sim-cota").forEach((inp) =>
    inp.addEventListener("input", () => {
      const k = inp.getAttribute("data-disc");
      const max = parseInt(inp.getAttribute("max"), 10) || 0;
      let v = parseInt(inp.value, 10);
      if (isNaN(v)) v = 0;
      v = Math.max(0, Math.min(max, v));
      cfg.cotas[k] = v;
      atualizarTotal(root, ss, formato);
    })
  );
  root.querySelector("#sim-tempo")?.addEventListener("input", (e) => {
    cfg.tempoMin = Math.max(0, parseInt(e.target.value, 10) || 0);
  });
  root.querySelector("#sim-embaralhar")?.addEventListener("change", (e) => {
    cfg.embaralhar = e.target.checked;
  });
  ligarAddQuestoesArquivo(root, app, formato);

  bindActions(root, {
    ...addQuestoesHandlers(root, app, ss.addState, formato),
    "cota-max": (el) => {
      const k = el.getAttribute("data-disc");
      const c = comp.find((x) => x.key === k);
      if (c) cfg.cotas[k] = c.disp;
      app.refresh();
    },
    "modo-tudo": () => {
      comp.forEach((c) => (cfg.cotas[c.key] = c.disp));
      app.refresh();
    },
    "modo-limpar": () => {
      cfg.cotas = {};
      app.refresh();
    },
    "modo-fracos": () => {
      cfg.status = "fracos";
      const comp2 = composicaoDisponivel(st, formato, "fracos");
      cfg.cotas = {};
      comp2.forEach((c) => (cfg.cotas[c.key] = c.disp));
      app.refresh();
    },
    "modo-aleatorio": async () => {
      const dispTotal = comp.reduce((a, c) => a + c.disp, 0);
      if (!dispTotal) return toast("Nada disponível para sortear.", "erro");
      const n = await pedirNumero("Quantas questões no simulado (sorteadas entre as disciplinas)?", { padrao: Math.min(20, dispTotal), min: 1, max: dispTotal, rotuloOk: "Distribuir" });
      if (!n) return;
      const dist = distribuir(n, comp.map((c) => ({ key: c.key, peso: c.disp, max: c.disp })));
      cfg.cotas = dist;
      app.refresh();
    },
    "modo-edital": async () => {
      const dispTotal = comp.reduce((a, c) => a + c.disp, 0);
      if (!dispTotal) return toast("Nada disponível para sortear.", "erro");
      const temPeso = comp.some((c) => c.peso > 0);
      const n = await pedirNumero(temPeso ? "Quantas questões (distribuídas pela relevância do edital)?" : "Sem relevância no edital ainda — vou distribuir pelo disponível. Quantas questões?", { padrao: Math.min(20, dispTotal), min: 1, max: dispTotal, rotuloOk: "Distribuir" });
      if (!n) return;
      const dist = distribuir(n, comp.map((c) => ({ key: c.key, peso: c.peso, max: c.disp })));
      cfg.cotas = dist;
      app.refresh();
    },
    "usar-tempo": () => {
      cfg.tempoMin = tempoSugerido(totalCotas(ss), formato);
      app.refresh();
    },
    iniciar: () => {
      const escolhidas = montarPorCotas(st, formato, ss);
      if (!escolhidas.length) return toast("Defina ao menos uma cota maior que zero.", "erro");
      const ordens = {};
      if (cfg.embaralhar && formato !== "ce") {
        for (const q of escolhidas) ordens[q.id] = embaralhar(q.alternativas.map((_, i) => i));
      }
      ss.sim = { questaoIds: escolhidas.map((q) => q.id), respostas: {}, ordens, elapsed: 0, target: cfg.tempoMin * 60, intervalId: null, resultado: null };
      app.refresh();
    },
  });
}

// Atualiza o total e o tempo sugerido sem re-render completo (preserva foco nos inputs).
function atualizarTotal(root, ss, formato) {
  const total = totalCotas(ss);
  const elTotal = root.querySelector(".sim-total");
  if (elTotal) elTotal.innerHTML = `<b>${total}</b> ${total === 1 ? (formato === "ce" ? "item selecionado" : "questão selecionada") : (formato === "ce" ? "itens selecionados" : "questões selecionadas")}`;
  const btn = root.querySelector('[data-action="iniciar"]');
  if (btn) {
    btn.innerHTML = `${icone("play")} Iniciar simulado (${total})`;
    btn.disabled = !total;
  }
}

// Alternativas para responder durante o simulado (sem gabarito). `ordem` = ordem de
// exibição (embaralho); cada botão guarda o índice ORIGINAL em data-i.
function altsSimHTML(q, formato, respostaAtual, ordem) {
  if (formato === "ce") {
    return `<div class="ce-opcoes">
      ${[0, 1].map((i) => `<button class="ce-btn sim-alt ${respostaAtual === i ? "selected" : ""}" data-action="responder" data-q="${q.id}" data-i="${i}">${i === 0 ? "Certo" : "Errado"}</button>`).join("")}
    </div>`;
  }
  const ordemExib = ordem || q.alternativas.map((_, i) => i);
  return ordemExib
    .map((orig, pos) => `<button class="alt alt-btn sim-alt ${respostaAtual === orig ? "selected" : ""}" data-action="responder" data-q="${q.id}" data-i="${orig}"><span class="alt-letra">${letra(pos)}</span> ${esc(q.alternativas[orig])}</button>`)
    .join("");
}

// ---------- Em andamento ----------
function renderEmAndamento(root, app, st, formato) {
  const ss = SS[formato];
  const sim = ss.sim;
  const questoes = sim.questaoIds.map((id) => st.questoes.find((q) => q.id === id)).filter(Boolean);
  const temLimite = sim.target > 0;

  root.innerHTML = `
    <div class="sim-barra card">
      <div class="sim-timer ${temLimite ? "sim-timer-limite" : ""}" id="sim-timer" data-tip="${temLimite ? "Tempo restante" : "Tempo decorrido"}">${temLimite ? fmtMMSS(sim.target - sim.elapsed) : fmtMMSS(sim.elapsed)}</div>
      <div class="sim-progresso" id="sim-progresso">Respondidas: ${Object.keys(sim.respostas).length}/${questoes.length}</div>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" data-action="cancelar" data-tip="Descarta o simulado sem corrigir.">Cancelar</button>
      <button class="btn btn-primary" data-action="finalizar">${icone("check")} Finalizar e corrigir</button>
    </div>

    <div class="lista-questoes sim-andamento">
      ${questoes
        .map((q, n) => `<div class="card questao">
            <div class="questao-meta">${formato === "ce" ? `<span class="mini-tag">Certo/Errado</span>` : ""}${seloBadge(q.selo, q.fonte)}${q.referencia ? `<span class="questao-ref-chip">${icone("paperclip")} ${esc(q.referencia)}</span>` : ""}</div>
            <div class="questao-enun"><b>${n + 1}.</b> ${esc(q.enunciado)}</div>
            <div class="questao-alts">${altsSimHTML(q, formato, sim.respostas[q.id], sim.ordens && sim.ordens[q.id])}</div>
          </div>`)
        .join("")}
    </div>`;

  const timerEl = root.querySelector("#sim-timer");
  const progEl = root.querySelector("#sim-progresso");

  function tick() {
    sim.elapsed += 1;
    timerEl.textContent = temLimite ? fmtMMSS(Math.max(0, sim.target - sim.elapsed)) : fmtMMSS(sim.elapsed);
    if (temLimite && sim.target - sim.elapsed <= 0) {
      toast("Tempo esgotado! Corrigindo…");
      finalizar();
    }
  }
  if (!sim.intervalId) sim.intervalId = setInterval(tick, 1000);

  function pararTimer() {
    if (sim.intervalId) clearInterval(sim.intervalId);
    sim.intervalId = null;
  }

  function finalizar() {
    pararTimer();
    const { store } = app;
    let acertos = 0;
    const itens = sim.questaoIds.map((qId) => {
      const q = st.questoes.find((x) => x.id === qId);
      const escolha = sim.respostas[qId];
      const respondida = escolha !== undefined;
      const acertou = respondida && escolha === q.gabarito;
      if (acertou) acertos += 1;
      if (respondida) store.registrarTentativa({ questaoId: qId, escolha, tempoSeg: 0 });
      return { q, escolha, respondida, acertou };
    });
    sim.resultado = { itens, acertos, total: sim.questaoIds.length, respondidas: Object.keys(sim.respostas).length, tempoSeg: sim.elapsed };
    if (sim.elapsed > 0) store.registrarSessao({ fase: "A", topicoId: null, tempoSeg: sim.elapsed });
    app.refresh();
  }

  // Seleção SEM re-render (preserva o cronômetro).
  bindActions(root, {
    responder: (el) => {
      const qId = el.getAttribute("data-q");
      const i = parseInt(el.getAttribute("data-i"), 10);
      sim.respostas[qId] = i;
      root.querySelectorAll(`.sim-alt[data-q="${qId}"]`).forEach((b) => {
        b.classList.toggle("selected", parseInt(b.getAttribute("data-i"), 10) === i);
      });
      progEl.textContent = `Respondidas: ${Object.keys(sim.respostas).length}/${sim.questaoIds.length}`;
    },
    finalizar: async () => {
      const faltando = sim.questaoIds.length - Object.keys(sim.respostas).length;
      if (faltando > 0 && !(await confirmar(`Faltam ${faltando} sem resposta. Finalizar mesmo assim?`))) return;
      finalizar();
    },
    cancelar: async () => {
      if (await confirmar("Cancelar o simulado? As respostas serão descartadas.")) {
        pararTimer();
        ss.sim = null;
        app.refresh();
      }
    },
  });

  return () => pararTimer();
}

// Alternativas na correção (com gabarito). `ordem` = ordem de exibição (embaralho).
function altsCorrecaoHTML(q, formato, it, ordem) {
  if (formato === "ce") {
    return `<div class="ce-opcoes">
      ${[0, 1].map((i) => {
        const cls = i === q.gabarito ? "ce-opt correta" : it.respondida && i === it.escolha ? "ce-opt errada" : "ce-opt";
        const tag = i === q.gabarito ? ` ${icone("check")}` : it.respondida && i === it.escolha ? ` ${icone("x")}` : "";
        return `<div class="${cls}">${i === 0 ? "Certo" : "Errado"}${tag}</div>`;
      }).join("")}
    </div>${q.justificativa ? `<div class="ce-justif"><b>Justificativa:</b> ${esc(q.justificativa)}</div>` : ""}`;
  }
  const ordemExib = ordem || q.alternativas.map((_, i) => i);
  return ordemExib
    .map((orig, pos) => {
      let cls = "alt";
      let tag = "";
      if (orig === q.gabarito) { cls = "alt correta"; tag = ` ${icone("check")}`; }
      else if (it.respondida && orig === it.escolha) { cls = "alt errada"; tag = ` ${icone("x")}`; }
      return `<div class="${cls}"><span class="alt-letra">${letra(pos)}</span> ${esc(q.alternativas[orig])}${tag}</div>`;
    })
    .join("");
}

// ---------- Resultado ----------
function renderResultado(root, app, st, formato) {
  const ss = SS[formato];
  const r = ss.sim.resultado;

  // Correção estilo Cebraspe (desconto): só faz sentido em Certo/Errado.
  const cebraspeAtivo = formato === "ce" && st.config && st.config.correcaoCebraspe === true;

  // Cálculo de desconto (Cebraspe): cada erro anula um acerto; brancos não contam.
  // erros = respondidas − acertos ; brancos = total − respondidas
  // nota líquida (pontos) = acertos − erros = 2·acertos − respondidas
  const cebErros = r.respondidas - r.acertos;
  const cebBrancos = r.total - r.respondidas;
  const cebLiquidoPts = r.acertos - cebErros; // = 2*acertos - respondidas
  const cebPctLiquido = r.total > 0 ? Math.round((cebLiquidoPts / r.total) * 100) : 0;

  const aproveitamento = pct(r.acertos, r.total);
  const cor = cebraspeAtivo
    ? cebPctLiquido >= 70
      ? "var(--success)"
      : cebPctLiquido >= 50
        ? "var(--warn)"
        : "var(--danger)"
    : aproveitamento >= 70
      ? "var(--success)"
      : aproveitamento >= 50
        ? "var(--warn)"
        : "var(--danger)";

  // Número grande e placar variam conforme o modo de correção.
  const fmtSinal = (v) => (v > 0 ? "+" + v : String(v)); // mostra o sinal (ex.: -12%)
  const notaGrande = cebraspeAtivo ? `${fmtSinal(cebPctLiquido)}%` : `${aproveitamento}%`;
  const notaNegativa = cebraspeAtivo && cebLiquidoPts < 0;
  const placar = cebraspeAtivo
    ? `Líquido: ${cebLiquidoPts} pts (${plural(r.acertos, "acerto", "acertos")} − ${plural(cebErros, "erro", "erros")}) · ${cebBrancos} em branco ${cebBrancos === 1 ? "não conta" : "não contam"}`
    : `${plural(r.acertos, "acerto", "acertos")} · ${plural(r.total - r.acertos, "erro", "erros")} em ${r.total}`;

  // Aproveitamento por matéria.
  const porMat = new Map();
  for (const it of r.itens) {
    const k = discKey(st, it.q);
    if (!porMat.has(k)) porMat.set(k, { nome: nomeDisc(st, k), acertos: 0, total: 0, respondidas: 0 });
    const m = porMat.get(k);
    m.total += 1;
    if (it.respondida) m.respondidas += 1;
    if (it.acertou) m.acertos += 1;
  }
  const mats = [...porMat.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  // Toggle de correção com desconto (somente formato C/E).
  const toggleCebraspeHTML =
    formato === "ce"
      ? `<div class="sim-ceb-toggle">
          <label class="sim-ceb-switch">
            <input type="checkbox" data-action="toggle-cebraspe"${cebraspeAtivo ? " checked" : ""}>
            <span>Correção com desconto (estilo Cebraspe)</span>
          </label>
          <span class="sim-ceb-info" data-tip="Cada erro anula um acerto; questões em branco não contam.">ⓘ</span>
          <div class="muted small sim-ceb-aviso">Critério específico de bancas que descontam (Cebraspe/Cespe). Nem toda prova C/E usa esse critério.</div>
        </div>`
      : "";

  root.innerHTML = `
    <section class="card sim-resultado">
      <div class="muted small sim-resultado-rotulo">Seu desempenho</div>
      <div class="sim-nota${notaNegativa ? " sim-nota-neg" : ""}" style="color:${cor}">${notaGrande}</div>
      <div class="sim-placar">${placar}</div>
      <div class="muted small sim-resultado-meta">${r.respondidas}/${r.total} respondidas · ${fmtTempo(r.tempoSeg)} <span data-tip="Os erros foram salvos no Caderno de Erros e o tempo no Acompanhamento.">ⓘ</span></div>
      ${toggleCebraspeHTML}
      <div class="form-acoes" style="justify-content:center;margin-top:16px">
        <button class="btn btn-add btn-lg" data-action="novo">Novo simulado</button>
        <button class="btn btn-ghost" data-action="ir-erros">Ver Caderno de Erros</button>
      </div>
    </section>

    ${
      mats.length > 1
        ? `<section class="card">
            <h3>Aproveitamento por disciplina</h3>
            <div class="sim-por-mat">
              ${mats
                .map((m) => {
                  if (cebraspeAtivo) {
                    const mErros = m.respondidas - m.acertos;
                    const mLiquido = m.acertos - mErros;
                    const mPct = m.total > 0 ? Math.round((mLiquido / m.total) * 100) : 0;
                    const c = mPct >= 70 ? "var(--success)" : mPct >= 50 ? "var(--warn)" : "var(--danger)";
                    const larg = Math.max(0, mPct); // barra não recua abaixo de 0
                    return `<div class="sim-mat-linha">
                      <span class="sim-mat-nome">${esc(m.nome)}</span>
                      <span class="sim-mat-barra"><span class="sim-mat-fill" style="width:${larg}%;background:${c}"></span></span>
                      <span class="sim-mat-num"><b style="color:${c}">${fmtSinal(mPct)}%</b> · ${mLiquido} pts (${m.acertos}−${mErros})</span>
                    </div>`;
                  }
                  const p = pct(m.acertos, m.total);
                  const c = p >= 70 ? "var(--success)" : p >= 50 ? "var(--warn)" : "var(--danger)";
                  return `<div class="sim-mat-linha">
                      <span class="sim-mat-nome">${esc(m.nome)}</span>
                      <span class="sim-mat-barra"><span class="sim-mat-fill" style="width:${p}%;background:${c}"></span></span>
                      <span class="sim-mat-num"><b style="color:${c}">${p}%</b> · ${m.acertos}/${m.total}</span>
                    </div>`;
                })
                .join("")}
            </div>
          </section>`
        : ""
    }

    <h3>Correção</h3>
    <div class="lista-questoes">
      ${r.itens
        .map((it, n) => {
          const q = it.q;
          const status = !it.respondida ? `<span class="sim-status nao">não respondida</span>` : it.acertou ? `<span class="sim-status ok">acertou</span>` : `<span class="sim-status erro">errou</span>`;
          return `<div class="card questao">
            <div class="questao-meta">${formato === "ce" ? `<span class="mini-tag">Certo/Errado</span>` : ""}${seloBadge(q.selo, q.fonte)}${q.referencia ? `<span class="questao-ref-chip">${icone("paperclip")} ${esc(q.referencia)}</span>` : ""}</div>
            <div class="questao-enun"><b>${n + 1}.</b> ${esc(q.enunciado)} ${status}</div>
            <div class="questao-alts">${altsCorrecaoHTML(q, formato, it, ss.sim.ordens && ss.sim.ordens[q.id])}</div>
          </div>`;
        })
        .join("")}
    </div>`;

  bindActions(root, {
    novo: () => {
      ss.sim = null;
      app.refresh();
    },
    "ir-erros": () => {
      ss.sim = null;
      app.navigate("erros");
    },
    "toggle-cebraspe": (el) => {
      app.store.setConfig({ correcaoCebraspe: !!(el && el.checked) });
      app.refresh();
    },
  });
}

// ---------- Impressão (chamada pelo botão Imprimir do cabeçalho, em pratica.js) ----------
export function imprimirSimulado(app) {
  const formato = formatoAtivo;
  const ss = SS[formato];
  const st = app.store.get();
  if (ss.sim && ss.sim.resultado) {
    return imprimir("Simulado — correção", printFolha(st, ss.sim.resultado.itens.map((it) => it.q), true, formato));
  }
  const questoes = ss.sim ? ss.sim.questaoIds.map((id) => st.questoes.find((q) => q.id === id)).filter(Boolean) : montarPorCotas(st, formato, ss);
  if (!questoes.length) return toast("Monte o simulado (defina cotas) para imprimir.", "erro");
  return imprimir(ss.sim ? "Simulado — questões" : "Simulado — folha", printFolha(st, questoes, false, formato));
}

function printFolha(st, questoes, comGabarito, formato) {
  if (!questoes.length) return "<p>Nada.</p>";
  return questoes
    .map((q, n) => {
      let corpo;
      if (formato === "ce") {
        corpo = `<div style="margin-top:4px">( ) Certo ( ) Errado${comGabarito ? ` <span class="gab">(gabarito: ${q.gabarito === 0 ? "Certo" : "Errado"})</span>` : ""}</div>`;
      } else {
        corpo = `<div style="margin-top:4px">${q.alternativas.map((a, i) => `${letra(i)} ${esc(a)}${comGabarito && i === q.gabarito ? ' <span class="gab">(gabarito)</span>' : ""}`).join("<br>")}</div>`;
      }
      return `<div class="print-item"><div><b>${n + 1}.</b> ${esc(q.enunciado)}${q.referencia ? ` <span class="print-meta">[${esc(q.referencia)}]</span>` : ""}</div>${corpo}</div>`;
    })
    .join("");
}

// ---------- helpers ----------
function embaralhar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function letra(i) {
  return String.fromCharCode(65 + i) + ")";
}
