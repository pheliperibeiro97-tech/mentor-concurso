// Modal de REGISTRO de sessão (cronômetro OU manual) — redesign v4 "ultrapremium".
// Antes era um empilhado de tabelas; agora é um fluxo em 4 ETAPAS numeradas, dinâmico
// (cada chip/botão revela seu espaço), inspirado no melhor dos concorrentes mas ancorado
// no nosso modelo:
//   ① Essenciais  → data/tempo do crono, Fase (cards com ícone), Matéria→Tópico, Aula real
//   ② Tempo       → cronômetro (snapshot) ou minutos manuais
//   ③ Materiais   → cards Apostila/Livro (título + de/até, múltiplas leituras),
//                   Questões (acertos/erros + anel de aproveitamento + link) e
//                   Vídeo (título + link + início/fim, múltiplos)
//   ④ Finalização → marcar tópico como finalizado, programar revisões (escada de
//                   intervalos EDITÁVEL), vincular/concluir tarefa, observação
// O modelo (store.registrarSessao) ganhou campos ricos (aulaId, materiais,
// marcarConcluido, revisaoEscada) mantendo os legados preenchidos pelo item principal,
// então Acompanhamento e estatísticas seguem intactos.
import { abrirJanela, toast, confetti } from "./ui.js";
import { icone } from "./icones.js";
import { esc, fmtMMSS, fmtTempo, todayISO } from "./util.js";
import { FASES, ORDEM_FASES, ordenarTopicosPorBase } from "./ciclo.js";
import * as crono from "./cronometro.js";

const FASE_ICON = { E: "graduation-cap", A: "target", R: "repeat-2", Pl: "compass" };
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
// "2026-07-03" → "03 jul" (sem o ano: é sempre o ano corrente, óbvio pelo contexto).
function fmtDiaMes(iso) {
  const p = String(iso).split("-");
  return p.length === 3 ? `${p[2]} ${MESES_ABREV[+p[1] - 1] || ""}` : iso;
}

function rotuloTopico(st, t) {
  const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
  return `${d ? d.nome + " · " : ""}${t.nome}`;
}
function aulasDoTopico(st, topicoId) {
  if (!topicoId) return [];
  return (st.aulas || []).filter((a) => Array.isArray(a.topicoIds) && a.topicoIds.includes(topicoId));
}
// Confete quando a sessão faz o tempo do dia CRUZAR a meta diária (mesma regra da Home).
function celebrarMeta(store, antes) {
  const dep = store.metas();
  if (dep.metaDiariaMin > 0 && (antes.feitoHojeMin || 0) < dep.metaDiariaMin && (dep.feitoHojeMin || 0) >= dep.metaDiariaMin) {
    confetti();
    toast("Meta diária batida! Excelente ritmo.", "ok");
  }
}

export function abrirRegistroSessao(store, app, { modo = "manual", fasePadrao = null, topicoPadrao = null, missaoPadrao = null } = {}) {
  const st = store.get();
  const missaoIni = missaoPadrao; // tarefa vinda do bloco planejado ("Começar agora") — pré-selecionada
  const topicosOrd = ordenarTopicosPorBase(st, st.topicos);
  // Base de estudo: com "cursinho" e aulas cadastradas, o registro é AULA-primeiro
  // (escolhe a aula → o tópico segue). Sempre sincronizados (tópico ↔ aula).
  const baseCursinho = (st.config.baseEstudo || "edital") === "cursinho" && (st.aulas || []).length > 0;
  const revHoje = store.revisadosHoje ? store.revisadosHoje() : []; // tópicos revisados hoje na Central → sugestão

  // Valores iniciais: no modo cronômetro, herda o vínculo do próprio cronômetro.
  let faseIni = fasePadrao;
  let topIni = topicoPadrao;
  let elapsed = 0;
  if (modo === "crono") {
    const sn = crono.snapshot();
    // No Pomodoro, o tempo de estudo é o ACUMULADO no ciclo (soma das fases de estudo),
    // não só a fase atual; nos demais modos, o tempo decorrido.
    elapsed = Math.round(sn.modo === "pomodoro" ? sn.pomoEstudoSeg || 0 : sn.elapsed);
    faseIni = sn.fase || faseIni;
    topIni = sn.topicoId || topIni;
  }
  if (!faseIni || !FASES[faseIni]) faseIni = store.planoHoje().fase;

  // Disciplina e tópico num SÓ seletor: agrupa por disciplina (optgroup), já que o rótulo
  // do tópico sempre carrega a disciplina. Evita o campo "Matéria" separado e redundante.
  const opcoesTopicoAgrup = () =>
    st.disciplinas
      .map((d) => {
        const tops = topicosOrd.filter((t) => t.disciplinaId === d.id);
        if (!tops.length) return "";
        return (
          `<optgroup label="${esc(d.nome)}">` +
          tops.map((t) => `<option value="${t.id}" ${t.id === topIni ? "selected" : ""}>${esc(t.nome)}</option>`).join("") +
          `</optgroup>`
        );
      })
      .join("");
  const opcoesTarefas = st.missoes
    .filter((m) => !m.concluida)
    .map((m) => {
      const t = m.topicoId ? st.topicos.find((x) => x.id === m.topicoId) : null;
      // Descrição da tarefa em primeiro (tópico só como contexto, entre parênteses).
      return `<option value="${m.id}" ${m.id === missaoIni ? "selected" : ""}>${esc(m.titulo + (t ? ` (${rotuloTopico(st, t)})` : ""))}</option>`;
    })
    .join("");

  // ── ETAPA 1 — Essenciais ────────────────────────────────────────────────
  const faseCards = ORDEM_FASES.map(
    (f) => `<button type="button" class="rsx-fase ${f === faseIni ? "on" : ""}" data-fase="${f}" style="--cor:${FASES[f].cor}">
        ${icone(FASE_ICON[f] || "book-open")}
        <b>${FASES[f].nome}</b>
      </button>`
  ).join("");

  const dataChip =
    modo === "manual"
      ? `<button type="button" class="rsx-data" id="rs-data-btn" data-tip="Dia em que a sessão de fato ocorreu (pode lançar dias anteriores).">
          ${icone("calendar-days")}<span id="rs-data-lbl">${fmtDiaMes(todayISO())}</span>
          <input id="rs-data" type="date" value="${todayISO()}" class="rsx-data-native" tabindex="-1" aria-hidden="true" /></button>`
      : `<span class="rsx-data rsx-data--ro">${icone("calendar-days")} ${fmtDiaMes(todayISO())}</span>`;

  const step1 = `
    <section class="rsx-step">
      <div class="rsx-h"><span class="rsx-num">1</span> Informações essenciais ${dataChip}</div>
      <label class="rsx-lbl">Fase <b class="rsx-req">*</b></label>
      <div class="rsx-fases">${faseCards}</div>
      ${baseCursinho ? `<label class="rsx-lbl">${icone("graduation-cap")} Aula do cursinho <span class="muted">(escolha a aula; o tópico segue)</span></label>
      <select id="rs-aula-sel" class="rsx-topsel"><option value="">— escolha a aula —</option>${(st.aulas || []).map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`).join("")}</select>` : ""}
      <label class="rsx-lbl">${baseCursinho ? `Tópico do edital <span class="muted">(sincronizado com a aula)</span>` : "Disciplina · tópico"}</label>
      <select id="rs-top" class="rsx-topsel"><option value="">— sem tópico —</option>${opcoesTopicoAgrup()}</select>
      ${revHoje.length ? `<div class="rsx-revsug"><span class="muted small">${icone("repeat-2")} Revisou hoje:</span> ${revHoje.map((r) => `<button type="button" class="rsx-chip rsx-revchip" data-rev-top="${r.topicoId}" data-tip="Preenche este tópico como Revisão.">${esc(r.nome)}</button>`).join("")}</div>` : ""}
      <div id="rs-concluir-wrap" class="rsx-topfin" hidden>
        <label class="rsx-check"><input type="checkbox" id="rs-concluir-topico" />
          <span>Marcar tópico como <b>finalizado</b> no edital</span></label>
      </div>
      <div id="rs-aula-wrap" class="rsx-aula" hidden>
        <label class="rsx-lbl">${icone("graduation-cap")} Aula do cursinho <span class="muted">(opcional — escolha ou digite uma nova)</span></label>
        <input id="rs-aula" list="rs-aula-list" type="text" maxlength="90" autocomplete="off" placeholder="Ex.: Aula 12 — Controle difuso" />
        <datalist id="rs-aula-list">${(st.aulas || []).map((a) => `<option value="${esc(a.nome)}"></option>`).join("")}</datalist>
      </div>
    </section>`;

  // ── ETAPA 2 — Tempo ─────────────────────────────────────────────────────
  const step2 =
    modo === "crono"
      ? `<section class="rsx-step">
          <div class="rsx-h"><span class="rsx-num">2</span> Tempo de estudo</div>
          <div class="rsx-crono">
            <div class="rsx-crono-time" data-count-static>${fmtMMSS(elapsed)}</div>
            <div class="muted small">tempo focado nesta sessão</div>
          </div>
        </section>`
      : `<section class="rsx-step">
          <div class="rsx-h"><span class="rsx-num">2</span> Tempo de estudo</div>
          <div class="rsx-tempo">
            <label class="rsx-lbl">Tempo estudado</label>
            <div class="rsx-hms">
              <label class="rsx-hms-f"><input id="rs-h" type="number" min="0" max="23" value="0" /><span>h</span></label>
              <label class="rsx-hms-f"><input id="rs-m" type="number" min="0" max="59" value="30" /><span>min</span></label>
              <label class="rsx-hms-f"><input id="rs-s" type="number" min="0" max="59" value="0" /><span>s</span></label>
              <span id="rs-tempo-hint" class="rsx-tempo-hint"></span>
            </div>
          </div>
        </section>`;

  // ── ETAPA 3 — Materiais ─────────────────────────────────────────────────
  const step3 = `
    <section class="rsx-step">
      <div class="rsx-h"><span class="rsx-num">3</span> Materiais de estudo
        <span class="muted small rsx-h-hint">clique para detalhar o que usou</span></div>
      <div class="rsx-matchips">
        <button type="button" class="rsx-chip" data-mat="leitura">${icone("book-open")} Apostila / Livro</button>
        <button type="button" class="rsx-chip" data-mat="questoes">${icone("clipboard-list")} Questões</button>
        <button type="button" class="rsx-chip" data-mat="video">${icone("play")} Vídeo / aula</button>
        <button type="button" class="rsx-chip" data-mat="leiseca">${icone("scroll-text")} Lei Seca</button>
        <button type="button" class="rsx-chip" data-mat="juris">${icone("scale")} Jurisprudência</button>
        <button type="button" class="rsx-chip" data-mat="flashcards">${icone("layers")} Flashcards</button>
        <button type="button" class="rsx-chip" data-mat="resumo">${icone("file-text")} Resumo</button>
        <button type="button" class="rsx-chip" data-mat="mapa">${icone("brain")} Mapa mental</button>
      </div>

      <div class="rsx-cards">
        <div id="rs-card-leitura" class="rsx-card" hidden>
          <div class="rsx-card-h">${icone("book-open")} <b>Apostila / Livro</b>
            <button type="button" class="rsx-add" data-add="leitura" data-tip="Adicionar outra leitura">${icone("plus")}</button></div>
          <div id="rs-leituras" class="rsx-rows"></div>
        </div>

        <div id="rs-card-questoes" class="rsx-card" hidden>
          <div class="rsx-card-h">${icone("clipboard-list")} <b>Questões</b></div>
          <div class="rsx-q">
            <label class="rsx-q-ac">Acertos<input id="rs-ac" type="number" min="0" max="9999" value="0" /></label>
            <label class="rsx-q-er">Erros<input id="rs-er" type="number" min="0" max="9999" value="0" /></label>
            <div class="rsx-ring" id="rs-ring"><span id="rs-ring-pct">—</span></div>
          </div>
          <input id="rs-qlink" class="rsx-qlink" type="text" maxlength="300" placeholder="Link (opcional)" />
        </div>

        <div id="rs-card-video" class="rsx-card" hidden>
          <div class="rsx-card-h">${icone("play")} <b>Vídeo / aula</b>
            <button type="button" class="rsx-add" data-add="video" data-tip="Adicionar outro vídeo">${icone("plus")}</button></div>
          <div id="rs-videos" class="rsx-rows"></div>
        </div>

        <div id="rs-card-leiseca" class="rsx-card" hidden>
          <div class="rsx-card-h">${icone("scroll-text")} <b>Lei Seca</b></div>
          <input id="rs-leiseca" class="rsx-qlink" type="text" maxlength="200" placeholder="O que estudou (ex.: CF, art. 5º a 17)" />
        </div>

        <div id="rs-card-juris" class="rsx-card" hidden>
          <div class="rsx-card-h">${icone("scale")} <b>Jurisprudência</b></div>
          <input id="rs-juris" class="rsx-qlink" type="text" maxlength="200" placeholder="Súmula / precedente (ex.: Súmula 473 STF)" />
        </div>

        <div id="rs-card-flashcards" class="rsx-card" hidden>
          <div class="rsx-card-h">${icone("layers")} <b>Flashcards</b></div>
          <label class="r-mini rsx-flash-q">Cartões revisados <input id="rs-flashqtd" type="number" min="0" max="9999" value="0" /></label>
        </div>

        <div id="rs-card-resumo" class="rsx-card" hidden>
          <div class="rsx-card-h">${icone("file-text")} <b>Resumo</b></div>
          <input id="rs-resumo" class="rsx-qlink" type="text" maxlength="200" placeholder="Resumo revisado (título)" />
        </div>

        <div id="rs-card-mapa" class="rsx-card" hidden>
          <div class="rsx-card-h">${icone("brain")} <b>Mapa mental</b></div>
          <input id="rs-mapa" class="rsx-qlink" type="text" maxlength="200" placeholder="Mapa revisado (título)" />
        </div>
      </div>
    </section>`;

  // ── ETAPA 4 — Finalização ───────────────────────────────────────────────
  const step4 = `
    <section class="rsx-step">
      <div class="rsx-h"><span class="rsx-num">4</span> Finalização</div>

      <div id="rs-rev-wrap" class="rsx-rev rsx-rev--first" hidden>
        <label class="rsx-check rsx-rev-top"><input type="checkbox" id="rs-rev-on" />
          ${icone("repeat-2")} <span>Programar revisões deste tópico</span></label>
        <div id="rs-rev-body" class="rsx-rev-body" hidden>
          <div class="rsx-lbl">Escada de revisão <span class="muted">(dias — remova ou adicione)</span></div>
          <div id="rs-escada" class="rsx-escada"></div>
          <div class="rsx-escada-add">
            <input id="rs-escada-in" type="number" min="1" max="3650" placeholder="dias" />
            <button type="button" class="btn btn-ghost btn-sm" id="rs-escada-btn">${icone("plus")} Adicionar</button>
          </div>
        </div>
      </div>

      ${
        opcoesTarefas
          ? `<div class="rsx-fin-linha"><label class="rsx-lbl">Vincular a uma tarefa</label>
              <select id="rs-missao"><option value="">— nenhuma —</option>${opcoesTarefas}</select>
              <label class="rsx-check"><input type="checkbox" id="rs-missao-concluir" /> <span>Concluir a tarefa ao registrar</span></label></div>`
          : ""
      }

      <label class="rsx-lbl rsx-obs-lbl">Observações</label>
      <textarea id="rs-obs" class="rsx-obs" rows="2" placeholder="Opcional — ex.: tive dificuldade com o princípio da insignificância"></textarea>
    </section>`;

  const corpoHTML = `<div class="rsx" data-modo="${modo}">
      <div class="rsx-prog"><i id="rs-prog-bar"></i></div>
      ${step1}${step2}${step3}${step4}
      <div class="rsx-rodape">
        <button type="button" class="btn btn-ghost" data-rs-cancelar>Cancelar</button>
        <button type="button" class="btn btn-primary btn-lg" data-rs-registrar>Salvar registro</button>
      </div>
    </div>`;

  abrirJanela({
    titulo: modo === "crono" ? "Registrar sessão do cronômetro" : "Registrar sessão de estudo",
    corpoHTML,
    aoMontar: (overlay, fechar) => {
      const scope = overlay.querySelector(".mm-corpo");
      const q = (sel) => scope.querySelector(sel);
      const escadaSel = [...store.REV_TOP_ESCADA];
      // Tempo manual em h:min:s → segundos.
      const totalSegManual = () =>
        (parseInt(q("#rs-h")?.value, 10) || 0) * 3600 + (parseInt(q("#rs-m")?.value, 10) || 0) * 60 + (parseInt(q("#rs-s")?.value, 10) || 0);

      // ---- Barra de progresso (4 marcos preenchendo) ----
      const bar = q("#rs-prog-bar");
      const sync = () => {
        const temTempo = modo === "crono" ? elapsed > 0 : totalSegManual() > 0;
        const temFase = !!q(".rsx-fase.on");
        const temMat =
          !q("#rs-card-leitura").hidden || !q("#rs-card-video").hidden ||
          (parseInt(q("#rs-ac")?.value, 10) || 0) + (parseInt(q("#rs-er")?.value, 10) || 0) > 0;
        const temFim = (q("#rs-top")?.value ? q("#rs-rev-on")?.checked : false) || !!(q("#rs-obs")?.value || "").trim() || !!q("#rs-concluir-topico")?.checked;
        const n = [temTempo, temFase, temMat, temFim].filter(Boolean).length;
        bar.style.width = Math.round((n / 4) * 100) + "%";
      };

      // ---- Data: um só calendário; clicar no campo abre o seletor; rótulo sem ano ----
      const dataBtn = q("#rs-data-btn");
      const dataInp = q("#rs-data");
      if (dataBtn && dataInp) {
        dataBtn.addEventListener("click", () => {
          if (dataInp.showPicker) { try { dataInp.showPicker(); } catch (_) { dataInp.focus(); } } else dataInp.focus();
        });
        dataInp.addEventListener("change", () => { q("#rs-data-lbl").textContent = fmtDiaMes(dataInp.value || todayISO()); });
      }

      // ---- Fase (cards, seleção única) ----
      scope.querySelectorAll(".rsx-fase").forEach((b) =>
        b.addEventListener("click", () => {
          scope.querySelectorAll(".rsx-fase").forEach((x) => x.classList.remove("on"));
          b.classList.add("on");
          sync();
        })
      );

      // ---- Tópico (Disciplina·tópico num só seletor) controla Aula + finalização ----
      const top = q("#rs-top");
      const atualizarTopico = () => {
        const tid = top.value || null;
        // Aula do cursinho: aparece sempre que há tópico; combobox (escolher OU digitar nova).
        // Prefill com a aula já vinculada ao tópico, se houver.
        const aulaWrap = q("#rs-aula-wrap");
        // Com base "cursinho" a aula é escolhida no seletor de cima; aqui o campo de texto
        // fica oculto (evita dois campos de aula), mas continua alimentando o salvamento.
        aulaWrap.hidden = !tid || baseCursinho;
        if (tid && !baseCursinho) {
          const aulas = aulasDoTopico(st, tid);
          q("#rs-aula").value = aulas.length ? aulas[0].nome : "";
        }
        // Finalizar tópico + Programar revisão só fazem sentido com tópico.
        const t = tid ? st.topicos.find((x) => x.id === tid) : null;
        const concWrap = q("#rs-concluir-wrap");
        concWrap.hidden = !tid;
        if (tid) {
          const chk = q("#rs-concluir-topico");
          chk.checked = !!(t && t.concluido);
          concWrap.querySelector(".rsx-check").classList.toggle("rsx-ja", !!(t && t.concluido));
        }
        const revWrap = q("#rs-rev-wrap");
        revWrap.hidden = !tid;
        if (tid && !q("#rs-rev-on").dataset.tocado) {
          // padrão: ligado para tópico de estudo com opt-in global; senão desligado
          const faseSel = q(".rsx-fase.on")?.dataset.fase;
          q("#rs-rev-on").checked = faseSel === "E" && st.config.revisaoTopicoAuto;
          q("#rs-rev-body").hidden = !q("#rs-rev-on").checked;
        }
        sync();
      };
      top?.addEventListener("change", atualizarTopico);
      // Sugestão "Revisou hoje": preenche o tópico e marca a fase Revisão (ponte Central → registro).
      scope.querySelectorAll(".rsx-revchip").forEach((c) =>
        c.addEventListener("click", () => {
          const tid = c.getAttribute("data-rev-top");
          if (top && tid) top.value = tid;
          scope.querySelectorAll(".rsx-fase").forEach((x) => x.classList.toggle("on", x.dataset.fase === "R"));
          atualizarTopico();
        })
      );
      // Base "cursinho": escolher a AULA define o tópico (sincronizados).
      q("#rs-aula-sel")?.addEventListener("change", (e) => {
        const a = (st.aulas || []).find((x) => x.id === e.target.value);
        if (!a) { q("#rs-aula").value = ""; return; }
        const tid = (a.topicoIds || []).find((id) => st.topicos.some((t) => t.id === id));
        if (tid) top.value = tid;
        atualizarTopico();
        q("#rs-aula").value = a.nome;
      });

      // ---- Tempo manual: h:min:s → hint legível ----
      const atualizarTempoHint = () => {
        const seg = totalSegManual();
        q("#rs-tempo-hint").textContent = seg ? "= " + fmtTempo(seg) : "";
        sync();
      };
      ["#rs-h", "#rs-m", "#rs-s"].forEach((sel) => q(sel)?.addEventListener("input", atualizarTempoHint));

      // ---- Materiais: chips revelam cards ----
      scope.querySelectorAll(".rsx-matchips .rsx-chip").forEach((ch) =>
        ch.addEventListener("click", () => {
          const alvo = q("#rs-card-" + ch.dataset.mat);
          const abrir = alvo.hidden;
          alvo.hidden = !abrir;
          ch.classList.toggle("on", abrir);
          if (abrir) {
            if (ch.dataset.mat === "leitura" && !q("#rs-leituras").children.length) addLeitura();
            if (ch.dataset.mat === "video" && !q("#rs-videos").children.length) addVideo();
            alvo.querySelector("input")?.focus();
          }
          sync();
        })
      );

      // Linhas repetíveis (múltiplas leituras / vídeos), com "+" e remover.
      function addLeitura() {
        const row = document.createElement("div");
        row.className = "rsx-row rsx-row-leitura";
        row.innerHTML = `
          <div class="rsx-row-top">
            <input class="r-tit" type="text" maxlength="90" placeholder="Título (ex.: Vade Mecum · Cap. 3)" />
            <button type="button" class="rsx-del" data-tip="Remover">${icone("x")}</button>
          </div>
          <div class="rsx-subrow">
            <label class="r-mini">De<input class="r-de" type="number" min="0" max="99999" value="0" /></label>
            <label class="r-mini">Até<input class="r-ate" type="number" min="0" max="99999" value="0" /></label>
          </div>`;
        row.querySelector(".rsx-del").addEventListener("click", () => { row.remove(); sync(); });
        q("#rs-leituras").appendChild(row);
      }
      function addVideo() {
        const row = document.createElement("div");
        row.className = "rsx-row rsx-row-video";
        row.innerHTML = `
          <div class="rsx-row-top">
            <input class="r-tit" type="text" maxlength="90" placeholder="Título do vídeo (ex.: Aula 12)" />
            <button type="button" class="rsx-del" data-tip="Remover">${icone("x")}</button>
          </div>
          <input class="r-link" type="text" maxlength="300" placeholder="Link (opcional)" />
          <div class="rsx-subrow">
            <label class="r-mini">Ini (min)<input class="r-ini" type="number" min="0" max="999" placeholder="—" /></label>
            <label class="r-mini">Fim (min)<input class="r-fim" type="number" min="0" max="999" placeholder="—" /></label>
          </div>`;
        row.querySelector(".rsx-del").addEventListener("click", () => { row.remove(); sync(); });
        q("#rs-videos").appendChild(row);
      }
      scope.querySelectorAll(".rsx-add").forEach((b) =>
        b.addEventListener("click", () => { b.dataset.add === "leitura" ? addLeitura() : addVideo(); })
      );

      // Questões: anel de aproveitamento ao vivo.
      const atualizarRing = () => {
        const ac = parseInt(q("#rs-ac").value, 10) || 0;
        const er = parseInt(q("#rs-er").value, 10) || 0;
        const tot = ac + er;
        const pct = tot ? Math.round((ac / tot) * 100) : 0;
        const ring = q("#rs-ring");
        ring.style.background = tot
          ? `conic-gradient(var(--success) ${pct * 3.6}deg, var(--surface-3) 0)`
          : "var(--surface-3)";
        q("#rs-ring-pct").textContent = tot ? pct + "%" : "—";
        sync();
      };
      q("#rs-ac")?.addEventListener("input", atualizarRing);
      q("#rs-er")?.addEventListener("input", atualizarRing);

      // Marcar tópico como finalizado alimenta a barra de progresso.
      q("#rs-concluir-topico")?.addEventListener("change", sync);

      // Revisão: toggle + escada editável.
      const revOn = q("#rs-rev-on");
      revOn?.addEventListener("change", () => {
        revOn.dataset.tocado = "1";
        q("#rs-rev-body").hidden = !revOn.checked;
        sync();
      });
      const renderEscada = () => {
        const cont = q("#rs-escada");
        cont.innerHTML = escadaSel
          .map((d) => `<span class="rsx-esc"><b>${d}d</b><button type="button" data-esc="${d}">${icone("x")}</button></span>`)
          .join("");
        cont.querySelectorAll("button[data-esc]").forEach((btn) =>
          btn.addEventListener("click", () => {
            const d = +btn.dataset.esc;
            const i = escadaSel.indexOf(d);
            if (i >= 0 && escadaSel.length > 1) { escadaSel.splice(i, 1); renderEscada(); }
          })
        );
      };
      const addEscada = () => {
        const d = parseInt(q("#rs-escada-in").value, 10);
        if (Number.isFinite(d) && d > 0 && !escadaSel.includes(d)) {
          escadaSel.push(d);
          escadaSel.sort((a, b) => a - b);
          renderEscada();
        }
        q("#rs-escada-in").value = "";
      };
      q("#rs-escada-btn")?.addEventListener("click", addEscada);
      q("#rs-escada-in")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addEscada(); } });
      renderEscada();

      q("#rs-obs")?.addEventListener("input", sync);

      // ---- Gravar ----
      const gravar = () => {
        const fase = q(".rsx-fase.on")?.dataset.fase;
        if (!fase) { toast("Escolha a fase da sessão.", "erro"); return; }
        const topicoId = q("#rs-top").value || null;

        // Aula do cursinho (combobox): nome existente → vincula; nome novo → cria e vincula.
        let aulaId = null;
        const aulaNome = (q("#rs-aula")?.value || "").trim();
        if (aulaNome && topicoId) {
          const ex = (store.get().aulas || []).find((a) => a.nome.trim().toLowerCase() === aulaNome.toLowerCase());
          if (ex) {
            aulaId = ex.id;
            if (!ex.topicoIds.includes(topicoId)) store.setAulaTopicos(ex.id, [...ex.topicoIds, topicoId]);
          } else {
            store.addAula(aulaNome);
            const nova = store.get().aulas.slice(-1)[0];
            store.setAulaTopicos(nova.id, [topicoId]);
            aulaId = nova.id;
          }
        }

        let tempoSeg = 0;
        let data;
        if (modo === "crono") {
          const sn = crono.snapshot();
          tempoSeg = Math.round(sn.modo === "pomodoro" ? sn.pomoEstudoSeg || 0 : sn.elapsed);
          if (tempoSeg < 1) { toast("Inicie o cronômetro antes de registrar.", "erro"); return; }
        } else {
          tempoSeg = totalSegManual();
          data = q("#rs-data").value || null;
        }

        // Leituras (múltiplas). Legado: 1ª leitura vira paginaInicial/Final; páginas = soma.
        const leituras = [];
        scope.querySelectorAll(".rsx-row-leitura").forEach((r) => {
          const titulo = r.querySelector(".r-tit").value.trim();
          const de = parseInt(r.querySelector(".r-de").value, 10) || 0;
          const ate = parseInt(r.querySelector(".r-ate").value, 10) || 0;
          const pag = de > 0 && ate >= de ? ate - de + 1 : 0;
          if (titulo || pag) leituras.push({ titulo: titulo || null, de: de || null, ate: ate || null, paginas: pag });
        });
        const pagTotal = leituras.reduce((a, l) => a + (l.paginas || 0), 0);
        const primLeitura = leituras.find((l) => l.paginas) || leituras[0] || null;

        // Vídeos (múltiplos). Legado: 1º vídeo vira material/videoIni/videoFim.
        const videos = [];
        scope.querySelectorAll(".rsx-row-video").forEach((r) => {
          const titulo = r.querySelector(".r-tit").value.trim();
          const link = r.querySelector(".r-link").value.trim();
          const ini = parseInt(r.querySelector(".r-ini").value, 10);
          const fim = parseInt(r.querySelector(".r-fim").value, 10);
          if (titulo || link || Number.isFinite(ini) || Number.isFinite(fim))
            videos.push({ titulo: titulo || null, link: link || null, ini: Number.isFinite(ini) ? ini : null, fim: Number.isFinite(fim) ? fim : null });
        });
        const primVideo = videos[0] || null;

        // Questões.
        const ac = parseInt(q("#rs-ac").value, 10) || 0;
        const er = parseInt(q("#rs-er").value, 10) || 0;
        const qlink = q("#rs-qlink").value.trim();

        if (modo === "manual" && tempoSeg < 1 && pagTotal < 1 && ac + er < 1) {
          toast("Informe ao menos tempo, páginas ou questões.", "erro");
          return;
        }

        const materiais = {};
        if (leituras.length) materiais.leituras = leituras;
        if (videos.length) materiais.videos = videos;
        if (ac || er || qlink) materiais.questoes = { acertos: ac, erros: er, link: qlink || null };
        // Materiais novos (Lei Seca, Jurisprudência, Flashcards, Resumo, Mapa mental).
        const leiSecaTxt = (q("#rs-leiseca")?.value || "").trim();
        const jurisTxt = (q("#rs-juris")?.value || "").trim();
        const resumoTxt = (q("#rs-resumo")?.value || "").trim();
        const mapaTxt = (q("#rs-mapa")?.value || "").trim();
        const flashQtd = parseInt(q("#rs-flashqtd")?.value, 10) || 0;
        if (leiSecaTxt) materiais.leiSeca = leiSecaTxt;
        if (jurisTxt) materiais.jurisprudencia = jurisTxt;
        if (resumoTxt) materiais.resumo = resumoTxt;
        if (mapaTxt) materiais.mapa = mapaTxt;
        if (flashQtd) materiais.flashcards = flashQtd;

        const revChk = q("#rs-rev-on");
        const agendarRevisao = topicoId ? (revChk && !revChk.closest("[hidden]") ? revChk.checked : undefined) : undefined;

        const metaAntes = store.metas();
        store.registrarSessao({
          fase,
          topicoId,
          aulaId,
          tempoSeg,
          paginas: pagTotal,
          paginaInicial: primLeitura ? primLeitura.de : null,
          paginaFinal: primLeitura ? primLeitura.ate : null,
          qAcertos: ac,
          qErros: er,
          questoesLink: qlink,
          comentario: q("#rs-obs").value,
          material: primVideo ? primVideo.titulo : "",
          videoIni: primVideo ? primVideo.ini : null,
          videoFim: primVideo ? primVideo.fim : null,
          materiais: Object.keys(materiais).length ? materiais : null,
          marcarConcluido: !!q("#rs-concluir-topico")?.checked,
          data: modo === "manual" ? data : undefined,
          missaoId: q("#rs-missao")?.value || null,
          concluirMissao: !!q("#rs-missao-concluir")?.checked,
          agendarRevisao,
          revisaoEscada: agendarRevisao ? escadaSel : undefined,
        });
        if (modo === "crono") crono.zerar();

        // Resumo no toast.
        const partes = [];
        if (tempoSeg) partes.push(fmtTempo(tempoSeg));
        if (pagTotal) partes.push(`${pagTotal} pág.`);
        if (ac + er) partes.push(`${ac}/${ac + er} questões (${ac + er ? Math.round((ac / (ac + er)) * 100) : 0}%)`);
        if (videos.length) partes.push(videos.length > 1 ? `${videos.length} vídeos` : "vídeo");
        if (leiSecaTxt) partes.push("lei seca");
        if (jurisTxt) partes.push("jurisprudência");
        if (flashQtd) partes.push(`${flashQtd} flashcards`);
        if (resumoTxt) partes.push("resumo");
        if (mapaTxt) partes.push("mapa");
        if (q("#rs-concluir-topico")?.checked) partes.push("tópico finalizado");
        if (agendarRevisao) partes.push(`revisão em ${escadaSel[0]}d`);
        toast(`Sessão registrada: ${partes.join(" · ")} em ${FASES[fase].nome}.`, "ok");
        celebrarMeta(store, metaAntes);
        fechar();
        // Gatilho leve: se a análise está velha ou o dia foi concluído, propõe ajustar o plano (1 toque).
        if (store.mentorSugereReplano && store.mentorSugereReplano()) {
          store.marcarNudgeReplano();
          setTimeout(() => toast("Quer que o Mentor ajuste seu plano?", "ok", { acaoLabel: "Ajustar plano", duracao: 6500, onAcao: () => app.navigate("mentor", { autoAnalisar: true }) }), 900);
        }
      };

      q("[data-rs-registrar]").addEventListener("click", gravar);
      q("[data-rs-cancelar]").addEventListener("click", fechar);

      // Estado inicial coerente.
      if (topIni) { top.value = topIni; }
      // Base "cursinho": se já veio um tópico, reflete a aula que o cobre no seletor.
      if (baseCursinho && topIni) {
        const a = (st.aulas || []).find((x) => (x.topicoIds || []).includes(topIni));
        if (a) { const sel = q("#rs-aula-sel"); if (sel) sel.value = a.id; q("#rs-aula").value = a.nome; }
      }
      atualizarTopico();
      if (modo === "manual") atualizarTempoHint();
      sync();
    },
  });
}
