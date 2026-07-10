// Lei Seca / Jurisprudência — aba METAS: corpo da aba, progresso de meta parseável,
// nova meta (estrutura/intervalo/livre), dividir em etapas e importar cronograma.
// (Extraído mecanicamente de leiseca.js — comportamento idêntico.)
import { abrirJanela, abrirJanelaFluxo, bindActions, toast, vazio, plural } from "../../ui.js";
import { ligarImportArquivo } from "../../pdf.js";
import { esc, fmtData } from "../../util.js";
import { icone } from "../../icones.js";
import { S } from "./estado.js";
import { normaDeRef, numArtigo, nomeAmigavelLei } from "./leitor.js";
import { nomeTopico, bindCascata } from "./pickers.js";

// Janela "Nova meta de leitura": meta CRUA (sem transcrever a letra). Nasce aqui e vira
// tarefa no Planejamento. Ex.: "Ler art. 1º a 20 da CF".
// #22: leis (normas) que têm a letra importada — base do criador estruturado de metas.
function normasComTexto(st) {
  return [...new Set(st.indicacoes.filter((i) => i.tipo === "lei" && !i.metaLeitura && !i.revogado && (i.texto || "").trim()).map((i) => normaDeRef(i.referencia) || "Outros"))].sort();
}
// #22: seções de uma lei (Parte / Título / Capítulo…) a partir do campo `estrutura` de cada artigo.
// Cada nível do caminho vira uma seção selecionável, com contagem e intervalo de artigos.
function secoesDaLei(st, norma) {
  const arts = st.indicacoes.filter((i) => i.tipo === "lei" && !i.metaLeitura && !i.revogado && (i.texto || "").trim() && (normaDeRef(i.referencia) || "Outros") === norma);
  const map = new Map();
  arts.forEach((a) => {
    const estr = Array.isArray(a.estrutura) ? a.estrutura : [];
    const num = numArtigo(a.referencia);
    const path = [];
    estr.forEach((node) => {
      path.push((node.rotulo || "") + (node.titulo ? " · " + node.titulo : ""));
      const key = path.join(" › ");
      if (!map.has(key)) map.set(key, { key, label: key, nums: [], n: 0 });
      const s = map.get(key); s.n++; if (num) s.nums.push(num);
    });
  });
  return [...map.values()].map((s) => { const nums = s.nums.filter(Boolean).sort((a, b) => a - b); return { ...s, de: nums[0] || null, ate: nums[nums.length - 1] || null }; });
}

export function abrirNovaMeta(app, tipo) {
  const { store } = app;
  const st = store.get();
  const opcDisc = `<option value="">— Geral (sem vínculo) —</option>` + st.disciplinas.map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("");
  const normas = tipo === "lei" ? normasComTexto(st) : [];
  const temEstrutura = normas.length > 0;
  const opcLei = normas.map((n) => `<option value="${esc(n)}">${esc(nomeAmigavelLei(n))}</option>`).join("");
  const secoesHTML = (norma) => { const secs = secoesDaLei(st, norma); return secs.length ? secs.map((s, i) => `<option value="${i}">${esc(s.label)} — ${s.n} art.</option>`).join("") : `<option value="">(sem seções detectadas nesta lei)</option>`; };
  let modo = temEstrutura ? "estrutura" : "livre"; // #22: estruturada por padrão quando a lei tem estrutura
  const { fechar } = abrirJanela({
    titulo: tipo === "juris" ? "Nova meta de leitura (jurisprudência)" : "Nova meta de leitura (lei seca)",
    corpoHTML: `<div class="card form-leiseca">
      ${temEstrutura ? `<div class="seg seg-sm meta-modos u-mb-12" role="tablist">
        <button class="on" data-meta-modo="estrutura">Por estrutura</button>
        <button data-meta-modo="intervalo">Por intervalo</button>
        <button data-meta-modo="livre">Livre</button>
      </div>` : ""}
      ${temEstrutura ? `<div class="meta-sec" data-sec="estrutura">
        <p class="muted small u-m-0 u-mb-12">Escolha uma <b>Parte / Título / Capítulo</b> — a meta cobre exatamente esses artigos e mostra o progresso.</p>
        <div class="form-row"><label class="u-grow">Lei <select id="meta-lei">${opcLei}</select></label></div>
        <label class="u-block u-mt-8">Seção <select id="meta-secao">${secoesHTML(normas[0])}</select></label>
        <div class="meta-preview muted small u-mt-8" id="meta-prev"></div>
      </div>
      <div class="meta-sec" data-sec="intervalo" hidden>
        <p class="muted small u-m-0 u-mb-12">Um intervalo de artigos de uma lei (ex.: <i>art. 1º a 20</i>).</p>
        <div class="form-row u-items-end">
          <label class="u-grow">Lei <select id="meta-lei2">${opcLei}</select></label>
          <label>De <input id="meta-de" type="number" min="1" placeholder="1" style="width:84px" /></label>
          <label>Até <input id="meta-ate" type="number" min="1" placeholder="20" style="width:84px" /></label>
        </div>
      </div>` : ""}
      <div class="meta-sec" data-sec="livre" ${modo === "livre" ? "" : "hidden"}>
        <p class="muted small u-m-0 u-mb-12">Meta <b>crua</b>, do seu jeito (ex.: <i>${tipo === "juris" ? "Ler os informativos 810 a 815 do STJ" : "Ler art. 1º a 20 da CF"}</i>). Vira <b>tarefa no Planejamento</b>.</p>
        <label class="u-block u-mb-8">O que ler
          <input id="meta-ref" placeholder="${tipo === "juris" ? "Ex.: Ler informativos 810–815 do STJ" : "Ex.: Ler art. 1º a 20 da CF"}" /></label>
        <label class="inline u-mb-8" data-tip="Uma etapa por linha vira uma tarefa separada."><input type="checkbox" id="meta-dividir" /> Dividir em etapas (uma tarefa por linha)</label>
        <textarea id="meta-etapas" rows="4" placeholder="${esc("Ex.:\nLer art. 1º a 5º\nLer art. 6º a 11\nLer art. 12 a 20")}" style="display:none; margin-bottom:8px"></textarea>
      </div>
      <div class="form-row u-mt-8">
        <label>Disciplina <select id="meta-disc">${opcDisc}</select></label>
        <label>Tópico (opcional) <select id="meta-top"><option value="">— sem tópico —</option></select></label>
      </div>
      <label class="u-block u-m-0 u-mt-8">Observação (opcional)
        <input id="meta-obs" placeholder="lembrete, prazo, prioridade…" /></label>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="meta-cancelar">Cancelar</button>
        <button class="btn btn-primary" data-action="meta-salvar">Criar</button>
      </div>
    </div>`,
    aoMontar: (overlay, fechar) => {
      const corpo = overlay.querySelector(".mm-corpo");
      bindCascata(corpo, st, "#meta-disc", "#meta-top");
      const chk = corpo.querySelector("#meta-dividir");
      const ta = corpo.querySelector("#meta-etapas");
      chk?.addEventListener("change", () => { ta.style.display = chk.checked ? "" : "none"; if (chk.checked) ta.focus(); });
      // Troca de modo (mostra só a seção do modo ativo).
      corpo.querySelectorAll("[data-meta-modo]").forEach((b) => b.addEventListener("click", () => {
        modo = b.getAttribute("data-meta-modo");
        corpo.querySelectorAll("[data-meta-modo]").forEach((x) => x.classList.toggle("on", x === b));
        corpo.querySelectorAll(".meta-sec").forEach((s) => { s.hidden = s.getAttribute("data-sec") !== modo; });
      }));
      // Seção estruturada: repopular ao trocar de lei + preview do intervalo.
      const leiSel = corpo.querySelector("#meta-lei");
      const secSel = corpo.querySelector("#meta-secao");
      const prev = corpo.querySelector("#meta-prev");
      const atualizarPrev = () => {
        if (!leiSel || !secSel) return;
        const s = secoesDaLei(st, leiSel.value)[+secSel.value];
        if (prev) prev.textContent = s && s.de ? `≈ ${s.n} ${s.n === 1 ? "artigo" : "artigos"} · art. ${s.de} a ${s.ate}` : "";
      };
      leiSel?.addEventListener("change", () => { secSel.innerHTML = secoesHTML(leiSel.value); atualizarPrev(); });
      secSel?.addEventListener("change", atualizarPrev);
      atualizarPrev();
      bindActions(corpo, {
        "meta-cancelar": () => fechar(),
        "meta-salvar": () => {
          const disciplinaId = corpo.querySelector("#meta-disc")?.value || null;
          const topicoId = corpo.querySelector("#meta-top")?.value || null;
          const observacao = (corpo.querySelector("#meta-obs")?.value || "").trim() || null;
          if (modo === "estrutura") {
            const lei = leiSel.value;
            const s = secoesDaLei(st, lei)[+secSel.value];
            if (!s || !s.de) return toast("Escolha uma seção com artigos.", "erro");
            store.criarMetaLeitura({ tipo, referencia: `Ler ${s.label} do ${lei} (art. ${s.de} a ${s.ate})`, disciplinaId, topicoId, observacao });
            toast("Meta criada (virou tarefa no Planejamento).", "ok");
          } else if (modo === "intervalo") {
            const lei = corpo.querySelector("#meta-lei2").value;
            const de = parseInt(corpo.querySelector("#meta-de").value, 10), ate = parseInt(corpo.querySelector("#meta-ate").value, 10);
            if (!de || !ate) return toast("Informe os artigos De e Até.", "erro");
            store.criarMetaLeitura({ tipo, referencia: `Ler art. ${Math.min(de, ate)} a ${Math.max(de, ate)} do ${lei}`, disciplinaId, topicoId, observacao });
            toast("Meta criada (virou tarefa no Planejamento).", "ok");
          } else {
            const ref = (corpo.querySelector("#meta-ref")?.value || "").trim();
            const etapas = chk?.checked ? (ta.value || "").split(/\n+/).map((s) => s.trim()).filter(Boolean) : [];
            if (etapas.length >= 2) {
              etapas.forEach((e) => store.criarMetaLeitura({ tipo, referencia: e, disciplinaId, topicoId }));
              toast(`${etapas.length} etapas criadas (viraram tarefas no Planejamento).`, "ok");
            } else {
              if (!ref) return toast(chk?.checked ? "Escreva ao menos 2 etapas (uma por linha)." : "Escreva o que ler (ex.: art. 1º a 20 da CF).", "erro");
              store.criarMetaLeitura({ tipo, referencia: ref, disciplinaId, topicoId, observacao });
              toast("Meta de leitura criada (virou tarefa no Planejamento).", "ok");
            }
          }
          fechar();
          app.refresh();
        },
      });
    },
  });
}

// Janela "Dividir meta em etapas": cada linha vira uma meta/tarefa; a meta-mãe é removida.
export function abrirQuebrarMeta(app, tipo, id) {
  const { store } = app;
  const mae = store.get().indicacoes.find((x) => x.id === id);
  if (!mae) return;
  abrirJanela({
    titulo: "Dividir meta em etapas",
    corpoHTML: `<div class="card form-leiseca">
      <p class="muted small u-m-0 u-mb-8">Meta: <b>${esc(mae.referencia)}</b>. Escreva <b>uma etapa por linha</b> — cada uma vira uma tarefa. A meta original é substituída pelas etapas.</p>
      <textarea id="qm-partes" rows="6" placeholder="${esc("Ex.:\nLer art. 1º a 5º da CF\nLer art. 6º a 10 da CF\nLer art. 11 a 20 da CF")}"></textarea>
      <div class="form-acoes">
        <button class="btn btn-ghost" data-action="qm-cancelar">Cancelar</button>
        <button class="btn btn-primary" data-action="qm-salvar">Dividir</button>
      </div>
    </div>`,
    aoMontar: (overlay, fechar) => {
      const corpo = overlay.querySelector(".mm-corpo");
      bindActions(corpo, {
        "qm-cancelar": () => fechar(),
        "qm-salvar": () => {
          const partes = (corpo.querySelector("#qm-partes")?.value || "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
          if (partes.length < 2) return toast("Escreva ao menos 2 etapas (uma por linha).", "erro");
          const n = store.quebrarMetaLeitura(id, partes);
          toast(n ? `Meta dividida em ${n} etapas.` : "Não consegui dividir.", n ? "ok" : "erro");
          fechar();
          app.refresh();
        },
      });
    },
  });
}

// Janela "Importar metas": cola um cronograma/tabela (ou PDF) → uma meta por linha, com
// PREVIEW editável antes de lançar. Cada meta vira tarefa no Planejamento.
export function abrirImportarMetas(app, tipo) {
  const { store } = app;
  const st = store.get();
  const opcDisc = `<option value="">— Geral (sem vínculo) —</option>` + st.disciplinas.map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("");
  const estado = { linhas: null, texto: "", disciplinaId: "" };
  // Limpa uma linha de tabela/cronograma → instrução de leitura (tira nº de coluna, datas soltas, |, tabs).
  const limpar = (l) =>
    String(l || "").replace(/\t+/g, " ").replace(/\s*\|\s*/g, " · ").replace(/^\s*\d+[\).\-]\s*/, "").replace(/\s{2,}/g, " ").trim();
  abrirJanelaFluxo({
    titulo: "Importar metas de leitura",
    render: (corpo, { rerender, fechar }) => {
      if (estado.linhas) {
        corpo.innerHTML = `<div class="card form-leiseca">
          <h3>${icone("calendar-check")} Revisar ${estado.linhas.length} ${estado.linhas.length === 1 ? "meta" : "metas"} antes de lançar</h3>
          <p class="muted small u-m-0 u-mb-8">Edite ou remova (✕). Cada linha vira uma tarefa no Planejamento, vinculada à disciplina escolhida.</p>
          <ul class="prev-editavel">${estado.linhas.map((t, i) => `<li class="prev-card"><div class="prev-card-l1"><input class="prev-inp im-meta" data-i="${i}" value="${esc(t)}" /><button class="prev-remover" data-action="im-rm" data-i="${i}">${icone("x")}</button></div></li>`).join("")}</ul>
          <div class="form-acoes"><button class="btn btn-ghost" data-action="im-voltar">${icone("arrow-left")} Voltar</button><span class="spacer"></span><button class="btn btn-primary" data-action="im-lancar" ${estado.linhas.length ? "" : "disabled"}>Lançar ${estado.linhas.length} ${estado.linhas.length === 1 ? "meta" : "metas"}</button></div>
        </div>`;
        corpo.querySelectorAll(".im-meta").forEach((el) => el.addEventListener("input", () => { estado.linhas[+el.getAttribute("data-i")] = el.value; }));
        return;
      }
      corpo.innerHTML = `<div class="card form-leiseca">
        <p class="muted small u-m-0 u-mb-12">Cole seu <b>cronograma/tabela</b> de leitura (uma meta por linha) ou importe um arquivo. O app limpa números de coluna e separadores; você confere antes de lançar.</p>
        <label class="inline u-mb-8">Disciplina <select id="im-disc">${opcDisc}</select></label>
        <label class="btn btn-ghost btn-file u-mb-8" data-tip="Importar de um PDF ou .txt.">${icone("paperclip")} Importar de arquivo<input id="im-file" type="file" accept=".pdf,.txt,.md,.csv" hidden /></label>
        <textarea id="im-texto" rows="7" placeholder="${esc("Ex.:\nLer art. 1º a 20 da CF\nLer Lei 8.112 arts. 116 a 132\nLer Título III do CP")}">${esc(estado.texto)}</textarea>
        <div class="form-acoes"><button class="btn btn-ghost" data-action="im-cancelar">Cancelar</button><span class="spacer"></span><button class="btn btn-primary" data-action="im-revisar">Revisar</button></div>
      </div>`;
      const file = corpo.querySelector("#im-file");
      if (file) ligarImportArquivo(file, { getCfg: () => store.get().config, contexto: "cronograma de metas de leitura (uma por linha)", onTexto: (t) => { const a = corpo.querySelector("#im-texto"); if (a) a.value = t; } });
    },
    handlers: ({ rerender, fechar, corpo }) => ({
      "im-cancelar": () => fechar(),
      "im-voltar": () => { estado.linhas = null; rerender(); },
      "im-rm": (el) => { estado.linhas.splice(+el.getAttribute("data-i"), 1); rerender(); },
      "im-revisar": () => {
        estado.texto = corpo.querySelector("#im-texto")?.value || "";
        estado.disciplinaId = corpo.querySelector("#im-disc")?.value || "";
        const linhas = estado.texto.split(/\n+/).map(limpar).filter((l) => l.length > 2);
        if (!linhas.length) return toast("Cole ao menos uma linha de meta.", "erro");
        estado.linhas = linhas;
        rerender();
      },
      "im-lancar": () => {
        let n = 0;
        for (const ref of estado.linhas) if (store.criarMetaLeitura({ tipo, referencia: ref, disciplinaId: estado.disciplinaId || null })) n++;
        toast(`${n} ${n === 1 ? "meta criada" : "metas criadas"} (viraram tarefas no Planejamento).`, "ok");
        fechar();
        app.refresh();
      },
    }),
  });
}


// Detecta a norma (abreviação/Lei) mencionada no TEXTO LIVRE de uma meta ("… da CF", "… do CPC",
// "Lei 8.112/90"). CPP/CPC antes de CP (senão "CP" casaria dentro deles). null se não achar.
function normaDoTextoMeta(ref) {
  const t = String(ref || "");
  const cod = t.match(/\b(CF|CDC|CTN|CLT|CPP|CPC|CP|CC)\b/);
  if (cod) return cod[1];
  const lei = t.match(/lei\s+(?:complementar\s+)?n?[ºo°.]*\s*([\d.]+)(?:\s*\/\s*(\d{4}))?/i);
  if (lei) return `Lei ${lei[1]}${lei[2] ? "/" + lei[2] : ""}`;
  return null;
}

// Progresso de uma meta de leitura QUANDO parseável (intervalo de artigos + lei determinável) —
// conta quantos artigos daquele intervalo já foram LIDOS. Conservador: sem intervalo claro, sem
// lei determinável (e >1 lei importada) ou sem artigo casado → null (a meta fica sem barra).
function progressoMeta(st, ref) {
  const s = String(ref || "");
  const m = s.match(/art(?:igos?|s)?\.?\s*(\d+)\s*[ºo°]?\s*(?:a|at[ée]|[-–—])\s*(\d+)/i) || s.match(/\b(\d+)\s*[ºo°]?\s*(?:a|[-–—])\s*(\d+)\b/);
  if (!m) return null;
  const de = Math.min(+m[1], +m[2]), ate = Math.max(+m[1], +m[2]);
  if (ate - de > 800) return null; // sanidade
  const arts = st.indicacoes.filter((i) => i.tipo === "lei" && !i.metaLeitura && !i.revogado && (i.texto || "").trim());
  const normaAlvo = normaDoTextoMeta(s);
  let cand = arts;
  if (normaAlvo) cand = arts.filter((i) => normaDeRef(i.referencia) === normaAlvo);
  else { const normas = [...new Set(arts.map((i) => normaDeRef(i.referencia)).filter(Boolean))]; if (normas.length !== 1) return null; }
  const noRange = cand.filter((i) => { const n = numArtigo(i.referencia); return n >= de && n <= ate; });
  if (!noRange.length) return null;
  const lidos = noRange.filter((i) => i.lido).length;
  return { lidos, total: noRange.length, pct: Math.round((100 * lidos) / noRange.length) };
}

// Aba METAS — metas CRUAS de leitura (sem transcrever a letra). Cada meta = tarefa no
// Planejamento; dá para quebrar em partes. Pendentes em cima, concluídas recolhidas.
export function metasCorpoHTML(st, tipo, lista, r, store) {
  const cta = `<button class="btn btn-add" data-action="nova-meta">${icone("calendar-check")} Nova meta de leitura</button>`;
  const pano = tipo === "lei" ? store.planejamentoLeitura(tipo) : null;
  const pend = lista.filter((i) => !i.lido);
  const done = lista.filter((i) => i.lido);

  if (!lista.length && (!pano || !pano.total))
    return vazio(
      `Sem metas de leitura\nCrie metas cruas (ex.: "${tipo === "juris" ? "ler os Informativos 810–815 do STJ" : "ler art. 1º a 20 da CF"}"). Cada uma vira tarefa no Planejamento e pode ser quebrada em partes.`,
      cta,
      icone("calendar-check")
    );

  // Fase 5 — sem dashboard duplicado: UMA linha-resumo (progresso · ritmo · previsão) + link
  // para o Planejamento. Metas diárias, revisões vencendo e calendário da semana vivem no
  // Planejamento, na Central de Revisões e no Hoje — aqui ficam só as METAS de leitura.
  const linkPlanejar = `<button class="lnk" data-action="ir-planejamento" data-tip="Cronograma da semana, metas do dia e revisões — no Planejamento global.">${icone("calendar-days")} Planejar a semana ${icone("arrow-right")}</button>`;
  const resumo = `<div class="estudar-tira metas-resumo">
      ${pano && pano.total ? `<span class="et-item" data-tip="${pano.lidos} de ${pano.total} lidos · ${pano.pctDominado}% dominado · faltam ${pano.faltam}">${icone("book-open")}<b>${pano.pct}%</b> lido (${pano.lidos}/${pano.total})</span>
      <span class="et-item" data-tip="Média de artigos lidos por dia de estudo.">${icone("zap")}<b>${pano.ritmoDia || "—"}</b> artigos/dia</span>
      <span class="et-item" data-tip="${pano.previsaoDias != null ? `Conclusão em ~${plural(pano.previsaoDias, "dia", "dias")} no ritmo atual.` : "Leia alguns dias para o app prever a conclusão."}">${icone("flag")}<span>termina ~<b>${pano.previsaoData ? fmtData(pano.previsaoData) : "—"}</b></span></span>` : ""}
      <span class="spacer"></span>${linkPlanejar}
    </div>`;

  const linha = (i) => {
    const topico = i.topicoId ? st.topicos.find((t) => t.id === i.topicoId) : null;
    const disc = topico ? st.disciplinas.find((d) => d.id === topico.disciplinaId) : i.disciplinaId ? st.disciplinas.find((d) => d.id === i.disciplinaId) : null;
    const vinc = topico
      ? `<button class="tag-topico lnk" data-action="ir-dossie" data-top="${topico.id}">${esc(nomeTopico(st, topico))}</button>`
      : `<span class="tag-topico">${disc ? esc(disc.nome) : "Geral"}</span>`;
    return `<div class="card ls-item ls-meta-crua ${i.lido ? "lido" : ""}" data-foco-id="${i.id}">
      <div class="ls-top">
        <input type="checkbox" data-action="toggle-lido" data-id="${i.id}" ${i.lido ? "checked" : ""} title="Concluir meta" />
        <span class="ls-ref">${i.lido ? `<s>${esc(i.referencia)}</s>` : esc(i.referencia)}</span>
        <span class="spacer"></span>
        ${vinc}
      </div>
      ${i.observacao ? `<div class="ls-obs muted small">${icone("notebook-pen")} ${esc(i.observacao)}</div>` : ""}
      ${(() => { const p = i.lido ? null : progressoMeta(st, i.referencia); return p ? `<div class="ls-meta-prog ${p.pct >= 100 ? "ok" : ""}"><div class="lmp-bar"><span style="width:${p.pct}%"></span></div><span class="lmp-txt">${p.lidos}/${p.total} lidos · ${p.pct}%</span></div>` : ""; })()}
      <div class="ls-rodape">
        <div class="ls-acoes">
          <button class="lnk" data-action="quebrar-meta" data-id="${i.id}" data-tip-pos="cima-esq" data-tip="Divide esta meta em etapas menores (ex.: blocos de artigos). Cada etapa vira uma tarefa.">${icone("list-checks")} Dividir em etapas</button>
          <details class="ls-mais"><summary data-tip="Mais ações" title="Mais ações">${icone("ellipsis")}</summary><div class="ls-mais-pop">
            <button class="lnk" data-action="editar" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Editar a referência e o vínculo.">${icone("square-pen")} Editar</button>
            <button class="lnk lnk-danger" data-action="remover" data-id="${i.id}" data-tip-pos="cima-dir" data-tip="Remover esta meta.">${icone("x")} Remover</button>
          </div></details>
        </div>
      </div>
    </div>`;
  };
  let listaHTML = pend.length ? pend.map(linha).join("") : `<p class="muted small" style="padding:6px 2px">${icone("check")} Nenhuma meta de leitura pendente. Crie uma para dividir o estudo em partes.</p>`;
  if (done.length) {
    listaHTML += `<div class="concluidas-head">
        <button class="lnk" data-action="toggle-concluidas">${S.mostrarConcluidas[tipo] ? icone("chevron-down") : icone("chevron-right")} ${icone("check")} Concluídas (<span class="num">${done.length}</span>)</button>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" data-action="limpar-lidas" data-tip-pos="cima-dir" data-tip="Remove as metas já concluídas.">${icone("trash-2")} Limpar concluídas</button>
      </div>
      ${S.mostrarConcluidas[tipo] ? done.map(linha).join("") : ""}`;
  }
  return `${resumo}
    <section class="plan-sec">
      <div class="plan-sec-head">${icone("list-checks")} Metas de leitura ${pend.length ? `<span class="muted small">— ${plural(pend.length, "pendente", "pendentes")}</span>` : ""}</div>
      ${listaHTML}
    </section>`;
}
