// Simulado cronometrado — em dois formatos ('mc' múltipla escolha | 'ce' Certo/Errado),
// recebidos de pratica.js. Diferente do Treino: é cronometrado, mostra o gabarito só no
// final e é COMPOSTO POR MATÉRIA (cotas: X questões de cada disciplina), como uma prova
// real. Tem modos rápidos, tempo sugerido, embaralho das alternativas e resultado por
// matéria. Cada resposta vira tentativa (Caderno de Erros + Diagnóstico).
import { bindActions, toast, vazio, confirmar, seloBadge, imprimir, pedirNumero , plural, ativarCountUp, skeletonDoc, md } from "../ui.js";
import { esc, fmtMMSS, fmtTempo, pct } from "../util.js";
import { icone } from "../icones.js";
import { comentarSimulado } from "../ia-provider.js";

// Count-up da nota-herói só na 1ª pintura do resultado por sessão (não re-anima a cada
// re-render, ex.: ao ligar/desligar a correção Cebraspe).
let notaAnimou = false;
import { addQuestoesBotaoHTML, addQuestoesPanelHTML, ligarAddQuestoesArquivo, addQuestoesHandlers, statusQuestao } from "./questoes-add.js";
import { focoShellHTML, focoChromeKey } from "./foco-quiz.js";

// Estado independente por formato.
function novoSS() {
  return { cfg: { status: "todas", material: "", topico: "", cotas: {}, tempoMin: 0, embaralhar: false }, addState: { aberto: false }, sim: null };
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

// Pool base do formato, respeitando SITUAÇÃO e (novo) o filtro por MATERIAL/TÓPICO de origem.
// `cfg` pode ser a string de status (retrocompat) ou {status, material, topico}.
function poolBase(st, formato, cfg) {
  const c = typeof cfg === "string" ? { status: cfg } : (cfg || {});
  const status = c.status || "todas";
  return st.questoes.filter((q) => {
    if (!ehDoFormato(q, formato)) return false;
    if (c.material && !(q.fonte && q.fonte.tipo === "documento" && q.fonte.id === c.material)) return false;
    if (c.topico && q.topicoId !== c.topico) return false;
    if (status === "todas") return true;
    const s = statusQuestao(st, q);
    if (status === "fracos") return s === "errei" || s === "pendente";
    return s === status;
  });
}
// Materiais que têm questões deste formato (para o seletor "por material").
function materiaisComQuestoes(st, formato) {
  const ids = new Set();
  for (const q of st.questoes) if (ehDoFormato(q, formato) && q.fonte && q.fonte.tipo === "documento" && q.fonte.id) ids.add(q.fonte.id);
  return [...ids].map((id) => st.documentos.find((d) => d.id === id)).filter(Boolean);
}
// Tópicos de um material que têm questões deste formato.
function topicosDoMaterial(st, formato, docId) {
  const ids = new Set();
  for (const q of st.questoes) if (ehDoFormato(q, formato) && q.fonte && q.fonte.id === docId && q.topicoId) ids.add(q.topicoId);
  return [...ids].map((id) => st.topicos.find((t) => t.id === id)).filter(Boolean);
}

// Disponível por matéria (para a tabela de cotas). Ordena por nome; "Sem matéria" por último.
function composicaoDisponivel(st, formato, cfg) {
  const base = poolBase(st, formato, cfg);
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
  const base = poolBase(st, formato, ss.cfg);
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
  // Guard: se o material filtrado não tem mais questões deste formato, limpa o filtro.
  const matComQ = materiaisComQuestoes(st, formato);
  if (cfg.material && !matComQ.some((d) => d.id === cfg.material)) { cfg.material = ""; cfg.topico = ""; }
  const topsMat = cfg.material ? topicosDoMaterial(st, formato, cfg.material) : [];
  if (cfg.topico && !topsMat.some((t) => t.id === cfg.topico)) cfg.topico = "";
  const comp = composicaoDisponivel(st, formato, cfg);
  const total = totalCotas(ss);
  const sugestao = tempoSugerido(total, formato);
  const rotTotal = (n) => (n === 1 ? "questão" : "questões");

  root.innerHTML = `
    <section class="card sim-setup-card">
      <header class="sim-setup-head">
        <div>
          <h3>Monte sua prova</h3>
          <p class="muted small">Escolha <b>quantas questões de cada disciplina</b>, como numa prova real. É cronometrado e o gabarito só aparece ao finalizar.</p>
        </div>
        ${addQuestoesBotaoHTML(ss.addState.aberto, formato)}
      </header>

      ${
        comp.length || st.questoes.filter((q) => ehDoFormato(q, formato)).length
          ? `<div class="sim-atalhos">
              <span class="sim-atalhos-lbl">Preencher rápido</span>
              <div class="sim-atalhos-chips">
                <button class="sim-chip" data-action="modo-tudo" data-tip="Usa todas as questões que você já cadastrou, de todas as disciplinas.">${icone("clipboard-list")} Todas</button>
                <button class="sim-chip" data-action="modo-edital" data-tip="Sorteia N questões distribuídas pela relevância do edital.">${icone("target")} Pelo edital</button>
                <button class="sim-chip" data-action="modo-aleatorio" data-tip="Sorteia N questões aleatórias entre as disciplinas.">${icone("dices")} Aleatória</button>
                <button class="sim-chip" data-action="modo-fracos" data-tip="Foca no que você errou ou ainda não respondeu.">${icone("bandage")} Pontos fracos</button>
              </div>
              <button class="lnk sim-modo-limpar" data-action="modo-limpar" data-tip="Zera as cotas.">limpar</button>
            </div>

            <div class="sim-situacao">
              <label for="sim-status">Considerar</label>
              <select id="sim-status">
                <option value="todas" ${cfg.status === "todas" ? "selected" : ""}>Todas as questões</option>
                <option value="pendente" ${cfg.status === "pendente" ? "selected" : ""}>Só as pendentes</option>
                <option value="errei" ${cfg.status === "errei" ? "selected" : ""}>Só as que errei</option>
                <option value="acertei" ${cfg.status === "acertei" ? "selected" : ""}>Só as que acertei</option>
                <option value="fracos" ${cfg.status === "fracos" ? "selected" : ""}>Pontos fracos (errei + pendentes)</option>
              </select>
            </div>
            ${
              matComQ.length
                ? `<div class="sim-situacao">
                    <label for="sim-material">Material</label>
                    <select id="sim-material" data-tip="Monta a prova só com as questões geradas/extraídas de um material.">
                      <option value="">Todos os materiais</option>
                      ${matComQ.map((d) => `<option value="${d.id}" ${cfg.material === d.id ? "selected" : ""}>${esc(d.titulo)}</option>`).join("")}
                    </select>
                    ${
                      cfg.material && topsMat.length
                        ? `<label for="sim-mat-topico" style="margin-left:10px">Tópico</label>
                           <select id="sim-mat-topico">
                             <option value="">Todos do material</option>
                             ${topsMat.map((t) => { const disc = st.disciplinas.find((x) => x.id === t.disciplinaId); return `<option value="${t.id}" ${cfg.topico === t.id ? "selected" : ""}>${esc((disc ? disc.nome + " · " : "") + t.nome)}</option>`; }).join("")}
                           </select>`
                        : ""
                    }
                  </div>`
                : ""
            }`
          : ""
      }

      ${
        comp.length
          ? `<div class="sim-cotas">
              <div class="sim-cotas-head"><span>Disciplina</span><span>Disponíveis</span><span>No simulado</span></div>
              ${comp
                .map((c) => {
                  const v = Math.min(c.disp, Math.max(0, cfg.cotas[c.key] || 0));
                  return `<div class="sim-cota-row ${v > 0 ? "ativa" : ""}" data-row="${esc(c.key)}">
                      <span class="sim-cota-nome">${esc(c.nome)}</span>
                      <span class="sim-cota-disp"><span class="num">${c.disp}</span> ${c.disp === 1 ? "questão" : "questões"}</span>
                      <span class="sim-cota-set">
                        <input type="number" class="sim-cota" data-disc="${esc(c.key)}" min="0" max="${c.disp}" value="${v}" aria-label="Quantas de ${esc(c.nome)}" />
                        <button class="lnk" data-action="cota-max" data-disc="${esc(c.key)}" data-tip="Usar todas desta disciplina">tudo</button>
                      </span>
                    </div>`;
                })
                .join("")}
            </div>`
          : (function () {
              // Tem questões do formato, mas nenhuma nessa situação? Vazio de filtro.
              const totalFormato = st.questoes.filter((q) => ehDoFormato(q, formato)).length;
              if (totalFormato) {
                return vazio("Nada nessa situação\nNenhuma das suas questões se enquadra no filtro acima. Troque em \"Considerar\" para montar a prova.", "", icone("dices"));
              }
              // Não tem nada: CTA reusa o data-action real de adicionar (toggle-addq).
              const cta = `<button class="btn btn-add" data-action="toggle-addq">Adicionar questões</button>`;
              return vazio("Cadastre questões para montar o simulado\nO simulado é montado a partir das suas questões. Adicione, importe de uma prova, ou gere com a IA.", cta, icone("notebook-pen"));
            })()
      }

      ${
        comp.length
          ? `<div class="sim-rodape">
              <label class="sim-tempo-campo" for="sim-tempo">Tempo <span class="muted">(min · 0 = sem limite)</span>
                <input id="sim-tempo" type="number" min="0" max="600" value="${cfg.tempoMin}" />
              </label>
              ${total ? `<span class="muted small sim-tempo-sug">Sugestão <b>${sugestao} min</b> · <button class="lnk" data-action="usar-tempo">usar</button></span>` : ""}
              <label class="sim-embaralhar" ${formato === "ce" ? "style='display:none'" : ""}><input type="checkbox" id="sim-embaralhar" ${cfg.embaralhar ? "checked" : ""} /> Embaralhar as alternativas</label>
            </div>

            <div class="sim-iniciar">
              <div class="sim-iniciar-resumo">
                <span class="sim-total"><b>${total}</b> ${rotTotal(total)} ${total === 1 ? "selecionada" : "selecionadas"}</span>
                <span class="muted small" data-tip="O gabarito só aparece ao finalizar. Os erros vão para o Caderno de Erros e o tempo para o Acompanhamento.">${icone("info")} Como funciona o simulado</span>
              </div>
              <button class="btn btn-primary btn-lg" data-action="iniciar" ${total ? "" : "disabled"}>${icone("play")} Iniciar${total ? ` · ${total} ${rotTotal(total)}` : ""}</button>
            </div>`
          : ""
      }
    </section>`;

  root.querySelector("#sim-status")?.addEventListener("change", (e) => {
    cfg.status = e.target.value;
    app.refresh();
  });
  // Filtro por MATERIAL/TÓPICO de origem das questões (simulado a partir de um material).
  root.querySelector("#sim-material")?.addEventListener("change", (e) => {
    cfg.material = e.target.value; cfg.topico = ""; cfg.cotas = {};
    app.refresh();
  });
  root.querySelector("#sim-mat-topico")?.addEventListener("change", (e) => {
    cfg.topico = e.target.value; cfg.cotas = {};
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
      inp.closest(".sim-cota-row")?.classList.toggle("ativa", v > 0);
      atualizarTotal(root, ss);
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
      const comp2 = composicaoDisponivel(st, formato, { ...cfg, status: "fracos" });
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
      ss.sim = { questaoIds: escolhidas.map((q) => q.id), respostas: {}, ordens, elapsed: 0, target: cfg.tempoMin * 60, intervalId: null, resultado: null, focoIdx: 0 };
      notaAnimou = false; // novo simulado → a nota do resultado volta a animar (o guard é por prova, não por sessão do app)
      app.refresh();
    },
  });
}

// Atualiza o total e o tempo sugerido sem re-render completo (preserva foco nos inputs).
function atualizarTotal(root, ss) {
  const total = totalCotas(ss);
  const rot = total === 1 ? "questão" : "questões";
  const elTotal = root.querySelector(".sim-total");
  if (elTotal) elTotal.innerHTML = `<b>${total}</b> ${rot} ${total === 1 ? "selecionada" : "selecionadas"}`;
  const btn = root.querySelector('[data-action="iniciar"]');
  if (btn) {
    btn.innerHTML = `${icone("play")} Iniciar${total ? ` · ${total} ${rot}` : ""}`;
    btn.disabled = !total;
  }
}

// Alternativas para responder durante o simulado (sem gabarito). `ordem` = ordem de
// exibição (embaralho); cada botão guarda o índice ORIGINAL em data-i.
function altsSimHTML(q, formato, respostaAtual, ordem) {
  if (formato === "ce") {
    return `<div class="ce-opcoes">
      ${[0, 1].map((i) => `<button class="ce-btn sim-alt ${respostaAtual === i ? "selected" : ""}" data-action="responder" data-q="${q.id}" data-i="${i}">${i === 0 ? "Certo" : "Errado"}<kbd class="alt-key">${i === 0 ? "C" : "E"}</kbd></button>`).join("")}
    </div>`;
  }
  const ordemExib = ordem || q.alternativas.map((_, i) => i);
  return ordemExib
    .map((orig, pos) => `<button class="alt alt-btn sim-alt ${respostaAtual === orig ? "selected" : ""}" data-action="responder" data-q="${q.id}" data-i="${orig}"><span class="alt-letra">${letra(pos)}</span> <span class="alt-txt">${esc(q.alternativas[orig])}</span>${pos < 6 ? `<kbd class="alt-key">${pos + 1}</kbd>` : ""}</button>`)
    .join("");
}

// ---------- Em andamento (Modo Foco imersivo: uma questão por vez) ----------
function renderEmAndamento(root, app, st, formato) {
  const ss = SS[formato];
  const sim = ss.sim;
  const questoes = sim.questaoIds.map((id) => st.questoes.find((q) => q.id === id)).filter(Boolean);
  const temLimite = sim.target > 0;
  const total = questoes.length;
  if (sim.focoIdx == null) sim.focoIdx = 0;
  sim.focoIdx = Math.max(0, Math.min(sim.focoIdx, total - 1));

  root.innerHTML = simOverlayHTML(sim, questoes, formato, temLimite);

  function pintaTimer() {
    const el = root.querySelector(".sim-timer");
    if (el) el.textContent = temLimite ? fmtMMSS(Math.max(0, sim.target - sim.elapsed)) : fmtMMSS(sim.elapsed);
  }
  function tick() {
    sim.elapsed += 1;
    pintaTimer();
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

  // Troca a questão exibida SEM re-render da tela (só o overlay, fade) — não "mexe a tela".
  function trocar(idx) {
    sim.focoIdx = Math.max(0, Math.min(idx, total - 1));
    const foco = root.querySelector(".fc-foco");
    const novoHTML = simOverlayHTML(sim, questoes, formato, temLimite, "fade");
    if (!foco) return;
    // Troca só o CONTEÚDO (não o elemento .fc-foco), senão ele re-dispara a animação de entrada
    // (animation: fq-fade) e o overlay "pisca" (parece fechar e reabrir).
    const tmp = document.createElement("div");
    tmp.innerHTML = novoHTML;
    const novoFoco = tmp.querySelector(".fc-foco");
    if (novoFoco) foco.replaceChildren(...Array.from(novoFoco.childNodes));
    else foco.outerHTML = novoHTML;
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
    // Auto-registra no histórico de Simulados (uma vez). Erros = respondidas − acertos;
    // brancos = total − respondidas. Guarda também o desempenho por disciplina.
    if (!sim.registrado) {
      sim.registrado = true;
      const porDisc = {};
      for (const it of itens) {
        const t = it.q && it.q.topicoId ? st.topicos.find((x) => x.id === it.q.topicoId) : null;
        const d = t ? st.disciplinas.find((x) => x.id === t.disciplinaId) : null;
        const k = d ? d.id : "_sem";
        if (!porDisc[k]) porDisc[k] = { nome: d ? d.nome : "Sem disciplina", total: 0, acertos: 0 };
        porDisc[k].total++;
        if (it.acertou) porDisc[k].acertos++;
      }
      const respondidas = sim.resultado.respondidas;
      store.registrarSimulado({
        origem: "app",
        formato,
        total: sim.questaoIds.length,
        acertos,
        erros: respondidas - acertos,
        brancos: sim.questaoIds.length - respondidas,
        tempoSeg: sim.elapsed,
        porDisciplina: Object.values(porDisc),
        questaoIds: sim.questaoIds,
        respostas: { ...sim.respostas },
      });
    }
    app.refresh();
  }

  // Seleção SEM re-render (preserva o cronômetro): marca a alternativa + atualiza o contador
  // "respondidas" e o ponto da questão no mapa, no lugar. SEM correção (só no fim).
  bindActions(root, {
    responder: (el) => {
      const qId = el.getAttribute("data-q");
      const i = parseInt(el.getAttribute("data-i"), 10);
      sim.respostas[qId] = i;
      root.querySelectorAll(`.sim-alt[data-q="${qId}"]`).forEach((b) => {
        b.classList.toggle("selected", parseInt(b.getAttribute("data-i"), 10) === i);
      });
      const n = Object.keys(sim.respostas).length;
      const pn = root.querySelector(".sim-prog-n");
      if (pn) pn.textContent = n;
      root.querySelector(`.fq-simdot[data-i="${sim.focoIdx}"]`)?.classList.add("resp");
    },
    "foco-anterior": () => trocar(sim.focoIdx - 1),
    "foco-proximo": () => trocar(sim.focoIdx + 1),
    "sim-ir": (el) => trocar(parseInt(el.getAttribute("data-i"), 10)),
    finalizar: async () => {
      const faltando = sim.questaoIds.length - Object.keys(sim.respostas).length;
      if (faltando > 0 && !(await confirmar(`Faltam ${faltando} sem resposta. Finalizar mesmo assim?`))) return;
      finalizar();
    },
    // No foco, "sair" (× / Esc) = cancelar a prova (com confirmação).
    "sair-foco": async () => {
      if (await confirmar("Sair do simulado? As respostas serão descartadas.")) {
        pararTimer();
        ss.sim = null;
        app.refresh();
      }
    },
  });

  // Teclado: chrome (Esc sai, ← → navegam) + seleção (1–6 / C·E) + Espaço = próxima.
  function onKey(e) {
    const chrome = focoChromeKey(e, { root });
    if (chrome) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); root.querySelector('[data-action="foco-proximo"]')?.click(); return; }
    if (root.querySelector(".fq-qalts.ce")) {
      if (e.key === "c" || e.key === "C") { e.preventDefault(); root.querySelector('.fq-qalts [data-i="0"]')?.click(); }
      else if (e.key === "e" || e.key === "E") { e.preventDefault(); root.querySelector('.fq-qalts [data-i="1"]')?.click(); }
      return;
    }
    const idx = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5 }[e.key];
    if (idx !== undefined) { e.preventDefault(); root.querySelectorAll('.fq-qalts .sim-alt')[idx]?.click(); }
  }
  document.addEventListener("keydown", onKey);

  return () => { pararTimer(); document.removeEventListener("keydown", onKey); };
}

// Overlay do simulado em andamento (shell compartilhado). Uma questão por vez, timer da
// prova + "respondidas X/Y" + botão Finalizar no topo, mapa de questões clicável no rodapé.
function simOverlayHTML(sim, questoes, formato, temLimite, anim = "in") {
  const total = questoes.length;
  const idx = Math.max(0, Math.min(sim.focoIdx || 0, total - 1));
  const q = questoes[idx];
  const respondidas = Object.keys(sim.respostas).length;
  const timerTxt = temLimite ? fmtMMSS(Math.max(0, sim.target - sim.elapsed)) : fmtMMSS(sim.elapsed);
  const placarExtra = `
    <div class="fq-chip fq-simtimer ${temLimite ? "lim" : ""}" data-tip="${temLimite ? "Tempo restante da prova" : "Tempo decorrido"}">${icone("clock-3")} <span class="sim-timer">${timerTxt}</span></div>
    <div class="fq-chip fq-simresp" data-tip="Respondidas">${icone("check-check")} <span class="sim-prog-n">${respondidas}</span>/${total}</div>`;
  const acoesExtra = `<button class="fq-chip fq-simfim" data-action="finalizar" data-tip="Finalizar e corrigir a prova">${icone("check")} Finalizar</button>`;
  const ce = formato === "ce";
  const centro = `
    <div class="fq-qcard fq-simcard" data-id="${q.id}">
      <div class="fq-tags">
        <span class="fq-tag">Questão ${idx + 1}</span>
        ${ce ? `<span class="fq-tag fq-tag-ce">Certo ou errado?</span>` : ""}
        ${q.referencia ? `<span class="fq-tag">${esc(q.referencia)}</span>` : ""}
      </div>
      <div class="fq-qenun">${esc(q.enunciado)}</div>
      <div class="fq-qalts ${ce ? "ce" : ""}">${altsSimHTML(q, formato, sim.respostas[q.id], sim.ordens && sim.ordens[q.id])}</div>
      <div class="fc-atalhos muted small">${icone("keyboard")} ${ce ? `<b>C</b> certo · <b>E</b> errado` : `teclas <b>1</b>–<b>${Math.min(q.alternativas.length, 6)}</b> para responder`} · <b>Espaço</b> próxima</div>
    </div>
    <nav class="fq-simmapa" aria-label="Mapa de questões">
      ${questoes.map((qq, i) => {
        const resp = sim.respostas[qq.id] !== undefined;
        return `<button class="fq-simdot ${resp ? "resp" : ""} ${i === idx ? "cur" : ""}" data-action="sim-ir" data-i="${i}" data-tip="Questão ${i + 1}${resp ? " · respondida" : ""}">${i + 1}</button>`;
      }).join("")}
    </nav>`;
  const rodape = ce
    ? `<kbd>Esc</kbd> sair · <kbd>←</kbd><kbd>→</kbd> navegar · <kbd>C</kbd> certo · <kbd>E</kbd> errado · <kbd>Espaço</kbd> próxima`
    : `<kbd>Esc</kbd> sair · <kbd>←</kbd><kbd>→</kbd> navegar · <kbd>1</kbd>–<kbd>6</kbd> responder · <kbd>Espaço</kbd> próxima`;
  return focoShellHTML({
    idx, total, anim, crono: false, placar: null, placarExtra, acoesExtra, centro, rodape,
    aria: "Simulado em andamento",
  });
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

  // Fase 3: erradas desta prova (CTA "Refazer as N erradas" + comentário do Mentor).
  const erradasIds = r.itens.filter((it) => it.respondida && !it.acertou).map((it) => it.q.id);

  // Toggle de correção com desconto (somente formato C/E).
  const toggleCebraspeHTML =
    formato === "ce"
      ? `<div class="sim-ceb-toggle">
          <label class="sim-ceb-switch">
            <input type="checkbox" data-action="toggle-cebraspe"${cebraspeAtivo ? " checked" : ""}>
            <span>Correção com desconto (estilo Cebraspe)</span>
          </label>
          <span class="sim-ceb-info" data-tip="Cada erro anula um acerto; questões em branco não contam.">${icone("info")}</span>
          <div class="muted small sim-ceb-aviso">Critério específico de bancas que descontam (Cebraspe/Cespe). Nem toda prova C/E usa esse critério.</div>
        </div>`
      : "";

  root.innerHTML = `
    <section class="card sim-resultado">
      <div class="muted small sim-resultado-rotulo">Seu desempenho</div>
      <div class="sim-nota${notaNegativa ? " sim-nota-neg" : ""}" style="color:${cor}"${!notaAnimou && !cebraspeAtivo ? ` data-count="${aproveitamento}" data-suf="%"` : ""}>${notaGrande}</div>
      <div class="sim-placar">${placar}</div>
      <div class="muted small sim-resultado-meta"><span class="num">${r.respondidas}</span>/<span class="num">${r.total}</span> respondidas · <span class="num">${fmtTempo(r.tempoSeg)}</span> <span data-tip="Os erros foram salvos no Caderno de Erros e o tempo no Acompanhamento.">${icone("info")}</span></div>
      ${toggleCebraspeHTML}
      <div class="form-acoes u-center u-mt-16">
        ${erradasIds.length ? `<button class="btn btn-primary btn-lg" data-action="refazer-erradas" data-tip="Refaz só as que você errou, no Modo Foco — o melhor momento é agora.">${icone("repeat-2")} Refazer as ${erradasIds.length} erradas</button>` : ""}
        <button class="btn btn-add btn-lg" data-action="novo">Novo simulado</button>
        <button class="btn btn-ghost" data-action="ir-erros">Ver Caderno de Erros</button>
      </div>
    </section>

    ${app.store.iaDisponivel() ? `<section class="card card-ia sim-mentor">
      <div class="plano-h"><h2 class="mentor-sec-t"><span class="orb orb-sm" aria-hidden="true"></span> O que este simulado diz sobre você</h2></div>
      <div id="sim-mentor-slot">${ss.sim.comentIA ? `<div class="u-m-0">${md(ss.sim.comentIA)}</div>` : skeletonDoc(3, { titulo: false })}</div>
    </section>` : ""}

    ${
      mats.length > 1
        ? `<section class="card">
            <div class="plano-h"><h2>Aproveitamento por disciplina</h2><span class="cnt">${mats.length}</span><span class="sp"></span></div>
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
                      <span class="sim-mat-num"><b class="num" style="color:${c}">${fmtSinal(mPct)}%</b> · <span class="num">${mLiquido}</span> pts (<span class="num">${m.acertos}−${mErros}</span>)</span>
                    </div>`;
                  }
                  const p = pct(m.acertos, m.total);
                  const c = p >= 70 ? "var(--success)" : p >= 50 ? "var(--warn)" : "var(--danger)";
                  return `<div class="sim-mat-linha">
                      <span class="sim-mat-nome">${esc(m.nome)}</span>
                      <span class="sim-mat-barra"><span class="sim-mat-fill" style="width:${p}%;background:${c}"></span></span>
                      <span class="sim-mat-num"><b class="num" style="color:${c}">${p}%</b> · <span class="num">${m.acertos}/${m.total}</span></span>
                    </div>`;
                })
                .join("")}
            </div>
          </section>`
        : ""
    }

    <div class="plano-h"><h2>Correção</h2><span class="cnt">${r.itens.length}</span><span class="sp"></span></div>
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

  // Count-up da nota-herói (1ª pintura por sessão; respeita reduced-motion via ativarCountUp).
  if (!notaAnimou) {
    ativarCountUp(root);
    notaAnimou = true;
  }

  bindActions(root, {
    novo: () => {
      ss.sim = null;
      notaAnimou = false; // próxima prova volta a animar a nota (sem afetar o toggle Cebraspe desta)
      app.refresh();
    },
    "ir-erros": () => {
      ss.sim = null;
      app.navigate("erros");
    },
    // Fase 3: fecha o loop no pico de motivação — refaz SÓ as erradas, direto no Modo Foco.
    "refazer-erradas": () => {
      const ids = erradasIds.slice();
      ss.sim = null;
      app.navigate(formato === "ce" ? "pratica-ce" : "pratica", { focoErrosIds: ids });
    },
    "toggle-cebraspe": (el) => {
      app.store.setConfig({ correcaoCebraspe: !!(el && el.checked) });
      app.refresh();
    },
  });

  // Fase 3: o Mentor COMENTA o resultado (1x por prova; cacheado em ss.sim.comentIA para
  // sobreviver a re-renders como o toggle Cebraspe). Compara com a média anterior e aponta
  // os tópicos que derrubaram — antes o app ficava mudo no momento de maior emoção.
  if (app.store.iaDisponivel() && ss.sim && !ss.sim.comentIA && !ss.sim._comentando) {
    ss.sim._comentando = true;
    const historico = (st.simulados || []).map((s) => s.aproveitamento).filter((n) => typeof n === "number");
    const anteriores = historico.slice(0, -1); // exclui o registro desta prova (auto-log)
    const mediaAnterior = anteriores.length ? Math.round(anteriores.reduce((a, b) => a + b, 0) / anteriores.length) : null;
    const topErr = {};
    for (const it of r.itens) {
      if (!it.respondida || it.acertou) continue;
      const t = it.q.topicoId ? st.topicos.find((x) => x.id === it.q.topicoId) : null;
      const nome = t ? t.nome : "Sem tópico";
      topErr[nome] = (topErr[nome] || 0) + 1;
    }
    const dados = {
      nota: aproveitamento,
      mediaAnterior,
      totalQuestoes: r.total,
      tempoMin: Math.round(r.tempoSeg / 60),
      porDisciplina: mats.map((m) => ({ nome: m.nome, pct: pct(m.acertos, m.total) })),
      topicosErrados: Object.entries(topErr).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nome, n]) => ({ nome, erros: n })),
    };
    comentarSimulado(app.store.get().config, dados)
      .then((txt) => { ss.sim.comentIA = txt; })
      .catch(() => { ss.sim.comentIA = ""; })
      .finally(() => {
        ss.sim._comentando = false;
        const slot = root.querySelector("#sim-mentor-slot");
        if (!slot) return;
        if (ss.sim.comentIA) slot.innerHTML = `<div class="u-m-0">${md(ss.sim.comentIA)}</div>`;
        else slot.closest(".sim-mentor")?.remove(); // falhou: sai de cena em silêncio
      });
  }
}

// ---------- Consulta posterior (Histórico › Ver correção) ----------
// Reconstrói a correção de um simulado feito no app a partir do snapshot salvo
// (registro.questaoIds + registro.respostas). Read-only, sem cronômetro nem botões.
// Questões apagadas depois do simulado são simplesmente omitidas.
export function correcaoSimuladoHTML(app, registro) {
  const st = app.store.get();
  const formato = registro.formato === "ce" ? "ce" : "mc";
  const ids = Array.isArray(registro.questaoIds) ? registro.questaoIds : [];
  const respostas = registro.respostas || {};
  const itens = ids
    .map((qId) => {
      const q = st.questoes.find((x) => x.id === qId);
      if (!q) return null;
      const escolha = respostas[qId];
      const respondida = escolha !== undefined && escolha !== null;
      return { q, escolha, respondida, acertou: respondida && escolha === q.gabarito };
    })
    .filter(Boolean);

  if (!itens.length) {
    return `<div class="sim-corr-vazio">${vazio("Correção indisponível\nAs questões deste simulado foram editadas ou removidas depois que ele foi feito.", "", icone("clipboard-list"))}</div>`;
  }

  const total = itens.length;
  const acertos = itens.filter((it) => it.acertou).length;
  const respondidas = itens.filter((it) => it.respondida).length;
  const aproveitamento = pct(acertos, total);
  const cor = aproveitamento >= 70 ? "var(--success)" : aproveitamento >= 50 ? "var(--warn)" : "var(--danger)";
  const faltaram = total - itens.length; // já filtradas; informa se o registro tinha mais

  // Aproveitamento por matéria (só quando há mais de uma).
  const porMat = new Map();
  for (const it of itens) {
    const k = discKey(st, it.q);
    if (!porMat.has(k)) porMat.set(k, { nome: nomeDisc(st, k), acertos: 0, total: 0 });
    const m = porMat.get(k);
    m.total += 1;
    if (it.acertou) m.acertos += 1;
  }
  const mats = [...porMat.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const matHTML =
    mats.length > 1
      ? `<div class="sim-corr-mats">${mats
          .map((m) => {
            const p = pct(m.acertos, m.total);
            const c = p >= 70 ? "var(--success)" : p >= 50 ? "var(--warn)" : "var(--danger)";
            return `<div class="sim-mat-linha">
                <span class="sim-mat-nome">${esc(m.nome)}</span>
                <span class="sim-mat-barra"><span class="sim-mat-fill" style="width:${p}%;background:${c}"></span></span>
                <span class="sim-mat-num"><b class="num" style="color:${c}">${p}%</b> · <span class="num">${m.acertos}/${m.total}</span></span>
              </div>`;
          })
          .join("")}</div>`
      : "";

  const listaHTML = itens
    .map((it, n) => {
      const q = it.q;
      const status = !it.respondida ? `<span class="sim-status nao">não respondida</span>` : it.acertou ? `<span class="sim-status ok">acertou</span>` : `<span class="sim-status erro">errou</span>`;
      return `<div class="card questao">
          <div class="questao-meta">${formato === "ce" ? `<span class="mini-tag">Certo/Errado</span>` : ""}${seloBadge(q.selo, q.fonte)}${q.referencia ? `<span class="questao-ref-chip">${icone("paperclip")} ${esc(q.referencia)}</span>` : ""}</div>
          <div class="questao-enun"><b>${n + 1}.</b> ${esc(q.enunciado)} ${status}</div>
          <div class="questao-alts">${altsCorrecaoHTML(q, formato, it, null)}</div>
        </div>`;
    })
    .join("");

  return `<div class="sim-corr">
      <div class="sim-corr-topo">
        <div class="sim-corr-nota" style="color:${cor}">${aproveitamento}%</div>
        <div class="sim-corr-placar">${plural(acertos, "acerto", "acertos")} · ${plural(respondidas - acertos, "erro", "erros")} · ${total - respondidas} em branco <span class="muted">em ${total}</span></div>
        ${faltaram > 0 ? `<div class="muted small">${faltaram} ${faltaram === 1 ? "questão foi removida" : "questões foram removidas"} depois deste simulado.</div>` : ""}
      </div>
      ${matHTML}
      <div class="sim-corr-lista lista-questoes">${listaHTML}</div>
    </div>`;
}

// ---------- Impressão (ligada ao botão "Imprimir folha" do cabeçalho, em simulados.js) ----------
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
