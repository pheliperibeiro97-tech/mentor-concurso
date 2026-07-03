// Modal de REGISTRO de sessão (cronômetro OU manual). Extraído da tela "Hoje" no
// redesign v3: a Home deixou de exibir os painéis inline (o cronômetro vive no
// flutuante/tela cheia). Registrar uma sessão passou a ser uma JANELA:
//   • modo "manual"  → aberto pelo botão "＋ Registrar sessão" (acima dos anéis);
//   • modo "crono"   → aberto ao encerrar o cronômetro (botão Registrar do flutuante).
// Preserva integralmente os campos e a lógica de store.registrarSessao (páginas,
// questões, vídeo/aula, observação, vínculo com tarefa e agendamento de revisão).
import { abrirJanela, toast, confetti, plural } from "./ui.js";
import { esc, fmtMMSS, fmtTempo, todayISO } from "./util.js";
import { FASES, ORDEM_FASES, ordenarTopicosPorBase } from "./ciclo.js";
import * as crono from "./cronometro.js";

function rotuloTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
// Confete quando a sessão faz o tempo do dia CRUZAR a meta diária (mesma regra da Home).
function celebrarMeta(store, antes) {
  const dep = store.metas();
  if (dep.metaDiariaMin > 0 && (antes.feitoHojeMin || 0) < dep.metaDiariaMin && (dep.feitoHojeMin || 0) >= dep.metaDiariaMin) {
    confetti();
    toast("Meta diária batida! Excelente ritmo.", "ok");
  }
}

// Blocos "o que você usou nesta sessão" — mesmos campos/ids (prefixo rs-) que viviam na Home.
function blocosUso(st, opcoesTarefas) {
  return `
    <div class="ses-extra2">
      <div class="ses-sec">O que você usou nesta sessão? <span class="muted small">(opcional — clique para detalhar)</span></div>
      <div class="ses-chips">
        <button type="button" class="chip ses-chip" data-ses-bloco="rs-b-pag">Páginas</button>
        <button type="button" class="chip ses-chip" data-ses-bloco="rs-b-q">Questões</button>
        <button type="button" class="chip ses-chip" data-ses-bloco="rs-b-vid">Vídeo / aula</button>
        <button type="button" class="chip ses-chip" data-ses-bloco="rs-b-obs">Observação</button>
      </div>
      <div id="rs-b-pag" class="ses-bloco" hidden>
        <div class="form-row ses-row">
          <label>Pág. inicial<input id="rs-pini" type="number" min="0" max="99999" value="0" /></label>
          <label>Pág. final<input id="rs-pfim" type="number" min="0" max="99999" value="0" /></label>
          <label>Total de páginas<input id="rs-pag" type="number" min="0" max="9999" value="0" readonly title="Calculado pela página inicial e final." /></label>
        </div>
      </div>
      <div id="rs-b-q" class="ses-bloco" hidden>
        <div class="form-row ses-row">
          <label>Questões feitas<input id="rs-tot" type="number" min="0" max="9999" value="0" /></label>
          <label class="ses-q-ac">Questões certas<input id="rs-ac" type="number" min="0" max="9999" value="0" /></label>
          <label>Aproveitamento<input id="rs-pct" type="text" value="—" readonly /></label>
        </div>
      </div>
      <div id="rs-b-vid" class="ses-bloco" hidden>
        <div class="form-row ses-row">
          <label style="flex:2">Aula / material <span class="muted small" data-tip="Qual aula/videoaula você assistiu (ex.: Aula 12). Opcional.">ⓘ</span><input id="rs-mat" type="text" maxlength="80" placeholder="Ex.: Aula 12 · Prof. Fulano" /></label>
          <label>Vídeo min. ini.<input id="rs-vini" type="number" min="0" max="999" placeholder="—" /></label>
          <label>Vídeo min. fim<input id="rs-vfim" type="number" min="0" max="999" placeholder="—" /></label>
        </div>
      </div>
      <div id="rs-b-obs" class="ses-bloco" hidden>
        <label class="ses-campo">Observação
          <textarea id="rs-obs" class="obs-auto" rows="1" placeholder="Ex.: tive dificuldade com o princípio da insignificância"></textarea>
        </label>
      </div>
      <div class="ses-fim">
        ${
          opcoesTarefas
            ? `<label class="ses-campo">Vincular a uma tarefa
                <select id="rs-missao"><option value="">— nenhuma —</option>${opcoesTarefas}</select>
              </label>
              <label class="inline check-tarefa"><input type="checkbox" id="rs-missao-concluir" /> Concluir a tarefa ao registrar <span class="muted">(desmarque se ainda vai continuá-la)</span></label>`
            : ""
        }
        ${
          st.config.revisaoTopicoAuto
            ? `<label class="inline check-tarefa"><input type="checkbox" id="rs-agendar-rev" checked /> Agendar revisão deste tópico <span class="chip chip-count ses-chip-rev" style="cursor:default">24h → 7d → 30d</span></label>`
            : ""
        }
      </div>
    </div>`;
}

// Liga auto-cálculo (aproveitamento + total de páginas), chips de detalhe e observação
// que cresce — mesma lógica da Home, agora escopada ao corpo da janela.
function ligarForm(scope) {
  const tot = scope.querySelector("#rs-tot");
  const ac = scope.querySelector("#rs-ac");
  const pct = scope.querySelector("#rs-pct");
  if (tot && ac && pct) {
    const calc = () => {
      const t = parseInt(tot.value, 10) || 0;
      let a = parseInt(ac.value, 10) || 0;
      if (a > t) a = t;
      pct.value = t ? `${Math.round((a / t) * 100)}% (${a}/${t})` : "—";
    };
    tot.addEventListener("input", calc);
    ac.addEventListener("input", calc);
  }
  const pini = scope.querySelector("#rs-pini");
  const pfim = scope.querySelector("#rs-pfim");
  const pag = scope.querySelector("#rs-pag");
  if (pini && pfim && pag) {
    const calc = () => {
      const ini = parseInt(pini.value, 10) || 0;
      const fim = parseInt(pfim.value, 10) || 0;
      pag.value = ini > 0 && fim >= ini ? fim - ini + 1 : 0;
    };
    pini.addEventListener("input", calc);
    pfim.addEventListener("input", calc);
  }
  scope.querySelectorAll("[data-ses-bloco]").forEach((ch) =>
    ch.addEventListener("click", () => {
      const alvo = scope.querySelector("#" + ch.getAttribute("data-ses-bloco"));
      if (!alvo) return;
      const abrir = alvo.hidden;
      alvo.hidden = !abrir;
      ch.classList.toggle("on", abrir);
      if (abrir) alvo.querySelector("input, textarea")?.focus();
    })
  );
  scope.querySelectorAll(".obs-auto").forEach((ta) => {
    const crescer = () => {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    };
    ta.addEventListener("input", crescer);
    crescer();
  });
}

// Lê os campos e grava a sessão. Retorna true se registrou (para a janela fechar).
function gravar(scope, store, modo) {
  const st = store.get();
  const fase = scope.querySelector("#rs-fase").value;
  const top = scope.querySelector("#rs-top").value || null;

  let tempoSeg = 0;
  let data;
  let min = 0;
  if (modo === "crono") {
    tempoSeg = Math.round(crono.snapshot().elapsed);
    if (tempoSeg < 1) {
      toast("Inicie o cronômetro antes de registrar.", "erro");
      return false;
    }
  } else {
    min = parseInt(scope.querySelector("#rs-min").value, 10) || 0;
    tempoSeg = min * 60;
    data = scope.querySelector("#rs-data").value || null;
  }

  const pIni = parseInt(scope.querySelector("#rs-pini").value, 10) || 0;
  const pFim = parseInt(scope.querySelector("#rs-pfim").value, 10) || 0;
  let pag = 0;
  if (pIni > 0 && pFim >= pIni) pag = pFim - pIni + 1;
  const tot = parseInt(scope.querySelector("#rs-tot").value, 10) || 0;
  let ac = parseInt(scope.querySelector("#rs-ac").value, 10) || 0;
  if (ac > tot) ac = tot;
  const er = Math.max(0, tot - ac);
  const obs = scope.querySelector("#rs-obs")?.value || "";
  const mat = scope.querySelector("#rs-mat")?.value || "";
  const vIni = parseInt(scope.querySelector("#rs-vini")?.value, 10) || 0;
  const vFim = parseInt(scope.querySelector("#rs-vfim")?.value, 10) || 0;
  const missaoId = scope.querySelector("#rs-missao")?.value || null;
  const concluirMissao = !!scope.querySelector("#rs-missao-concluir")?.checked;
  const agEl = scope.querySelector("#rs-agendar-rev");

  if (modo === "manual" && min < 1 && pag < 1 && tot < 1) {
    toast("Informe ao menos minutos, páginas ou questões.", "erro");
    return false;
  }

  const metaAntes = store.metas();
  store.registrarSessao({
    fase,
    topicoId: top,
    tempoSeg,
    paginas: pag,
    paginaInicial: pIni || null,
    paginaFinal: pFim || null,
    qAcertos: ac,
    qErros: er,
    comentario: obs,
    material: mat,
    videoIni: vIni || null,
    videoFim: vFim || null,
    data: modo === "manual" ? data : undefined,
    missaoId,
    concluirMissao,
    agendarRevisao: agEl ? agEl.checked : undefined,
  });
  if (modo === "crono") crono.zerar();

  const partes = [];
  if (modo === "crono") partes.push(fmtTempo(tempoSeg));
  else if (min) partes.push(`${min} min`);
  if (pag) partes.push(pIni && pFim ? `págs. ${pIni}–${pFim} (${pag})` : `${pag} pág.`);
  if (tot) partes.push(`${ac}/${tot} questões (${tot ? Math.round((ac / tot) * 100) : 0}%)`);
  if (mat.trim()) partes.push(mat.trim());
  if (missaoId && concluirMissao) partes.push("tarefa concluída");
  else if (missaoId) partes.push("tarefa vinculada");
  if (fase === "E" && top && st.config.revisaoTopicoAuto && agEl && agEl.checked) partes.push("revisão agendada");
  toast(`Sessão registrada: ${partes.join(" · ")} em ${FASES[fase].nome}.`, "ok");
  celebrarMeta(store, metaAntes);
  return true;
}

// Abre a janela de registro. opts: { modo: "manual"|"crono", fasePadrao, topicoPadrao }.
export function abrirRegistroSessao(store, app, { modo = "manual", fasePadrao = null, topicoPadrao = null } = {}) {
  const st = store.get();
  const topicosOrd = ordenarTopicosPorBase(st, st.topicos);

  // Valores iniciais: no modo cronômetro, herda o vínculo do próprio cronômetro.
  let faseIni = fasePadrao;
  let topIni = topicoPadrao;
  let elapsed = 0;
  if (modo === "crono") {
    const sn = crono.snapshot();
    elapsed = Math.round(sn.elapsed);
    faseIni = sn.fase || faseIni;
    topIni = sn.topicoId || topIni;
  }
  if (!faseIni || !FASES[faseIni]) faseIni = store.planoHoje().fase;

  const opcoesTopico = topicosOrd
    .map((t) => `<option value="${t.id}" ${t.id === topIni ? "selected" : ""}>${esc(rotuloTopico(st, t))}</option>`)
    .join("");
  const opcoesFase = ORDEM_FASES.map((f) => `<option value="${f}" ${f === faseIni ? "selected" : ""}>${FASES[f].nome}</option>`).join("");
  const opcoesTarefas = st.missoes
    .filter((m) => !m.concluida)
    .map((m) => {
      const t = m.topicoId ? st.topicos.find((x) => x.id === m.topicoId) : null;
      return `<option value="${m.id}">${esc((t ? rotuloTopico(st, t) + " · " : "") + m.titulo)}</option>`;
    })
    .join("");

  const topo =
    modo === "crono"
      ? `<div class="rs-crono">
          <div class="rs-crono-time" data-count-static>${fmtMMSS(elapsed)}</div>
          <div class="muted small">tempo focado nesta sessão</div>
        </div>
        <div class="form-row">
          <label>Fase<select id="rs-fase">${opcoesFase}</select></label>
          <label style="flex:2">Tópico<select id="rs-top"><option value="">— sem tópico —</option>${opcoesTopico}</select></label>
        </div>`
      : `<div class="form-row">
          <label>Data<input id="rs-data" type="date" value="${todayISO()}" data-tip="Dia em que a sessão de fato ocorreu (pode lançar dias anteriores)." /></label>
          <label>Minutos<input id="rs-min" type="number" min="0" max="600" value="30" /></label>
          <label>Fase<select id="rs-fase">${opcoesFase}</select></label>
          <label style="flex:2">Tópico<select id="rs-top"><option value="">— sem tópico —</option>${opcoesTopico}</select></label>
        </div>`;

  const corpoHTML = `<div class="registro-sessao">
      ${topo}
      ${blocosUso(st, opcoesTarefas)}
      <div class="rs-rodape">
        <button class="btn btn-success btn-lg" data-rs-registrar>Registrar sessão</button>
      </div>
    </div>`;

  abrirJanela({
    titulo: modo === "crono" ? "Registrar sessão do cronômetro" : "Registrar sessão manual",
    corpoHTML,
    aoMontar: (overlay, fechar) => {
      const scope = overlay.querySelector(".mm-corpo");
      ligarForm(scope);
      overlay.querySelector("[data-rs-registrar]").addEventListener("click", () => {
        if (gravar(scope, store, modo)) fechar();
      });
    },
  });
}
