// Configurações: camada de IA, Pomodoro, concurso e dados.
import { bindActions, toast, header, confirmar, ligarDropZone, escolher } from "../ui.js";
import { baixarRelatorio, EMAIL_SUPORTE, APP_VERSION } from "../erro-log.js";
import { verificarAtualizacao } from "../updater.js";
import { setEstiloAlarme, tocarAlarmeTeste } from "../cronometro.js";
import { esc } from "../util.js";
import { icone } from "../icones.js";
import { backendName } from "../persistence.js";
import { MODELO_PADRAO, testarConexao, iaDisponivel, GEMINI_FALLBACKS, CLAUDE_MODELOS } from "../ia-provider.js";
import { NAV_ITENS, NAV_FIXOS, ordemNavEfetiva, gruposNav } from "../main.js";
import { abrirGuia } from "./ajuda.js";
import { suportaSync, conectar as syncConectar, conectarBaixando as syncConectarBaixar, sincronizarAgora, desconectar as syncDesconectar, ultimoBackupConflito, resolverPendencia } from "../sync.js";
import { suportaSyncNuvem, conectarNuvem, sincronizarNuvem, desconectarNuvem, resolverPendenciaNuvem } from "../sync-nuvem.js";

// "há X" curto para o status de sincronização.
function haQuanto(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!(ms >= 0)) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

// Aba ativa das Configurações (persiste entre re-renders desta sessão).
let abaCfg = "estudo";

// Texto de ajuda por provedor (onde pegar a chave grátis).
const AJUDA_IA = {
  gemini: 'Chave grátis no Google AI Studio (aistudio.google.com/apikey). Não precisa escolher o modelo: use <b>Testar conexão</b> que ele acha sozinho o melhor modelo grátis que sua chave aceita.',
  "claude-cli": 'Usa o <b>Claude Code instalado nesta máquina</b> (sua autenticação local) — <b>uso pessoal</b>, só no app <b>desktop</b>. Não precisa de chave. Atenção: consome o <b>limite da sua assinatura Claude</b>. A <b>busca semântica</b> (embeddings) continua exigindo o Gemini — sem ele, ela cai na busca por palavra exata. Modelo: <b>haiku</b> (econômico), <b>sonnet</b> ou <b>opus</b> (mais qualidade, mais custo).',
  offline: "Sem IA: o núcleo do app funciona, mas a geração de questões/flashcards, o comentário de erros, a correção de mérito e o chat elaborado ficam bloqueados.",
};

export default function renderConfig(root, app) {
  const { store } = app;
  const st = store.get();
  const cfg = st.config;
  const c = st.concurso;
  // No celular/navegador (sem Tauri) alguns recursos são só do app desktop — não mostrar o
  // gatilho no mobile evita o toque que só entrega um aviso negativo.
  const ehDesktop = typeof window !== "undefined" && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);
  // Provedores ainda sem implementação (desabilitam chave/modelo na tela).
  const iaInativa = ["offline"].includes(cfg.iaProvider);
  // Provedores que NÃO usam chave de API (Claude Code local usa a autenticação local da CLI).
  const semChave = cfg.iaProvider === "claude-cli";
  // "Sem meta por enquanto": nenhuma das 3 metas definida.
  const semMetas = !cfg.metaDiariaMin && !cfg.metaSemanalMin && !cfg.metaMensalMin;
  const nt = cfg.notificacoes || {};
  const sy = cfg.sync || {};
  const syncSuporta = suportaSync();
  const syncStatus = sy.pendente
    ? `${icone("triangle-alert")} Decisão necessária`
    : sy.sincronizando
    ? "Sincronizando…"
    : sy.ultimoResultado === "erro"
    ? `${icone("triangle-alert")} Erro: ` + esc(sy.erro || "falha")
    : sy.ultimaSync
    ? `Sincronizado ${icone("check")} ` + haQuanto(sy.ultimaSync)
    : "Ainda não sincronizado";
  // Sincronização NA NUVEM por senha (funciona no celular e em qualquer navegador).
  const sn = cfg.syncNuvem || {};
  const nuvemSuporta = suportaSyncNuvem();
  const nuvemStatus = sn.pendente
    ? `${icone("triangle-alert")} Decisão necessária`
    : sn.sincronizando
    ? "Sincronizando…"
    : sn.ultimoResultado === "erro"
    ? `${icone("triangle-alert")} Erro: ` + esc(sn.erro || "falha")
    : sn.ultimaSync
    ? `Sincronizado ${icone("check")} ` + haQuanto(sn.ultimaSync)
    : "Ainda não sincronizado";

  root.innerHTML = `
    ${header("Configurações", "Ajuste a IA, o ritmo de estudo e seus dados")}

    <section class="card guia-card">
      <button class="btn btn-primary" data-action="abrir-guia">${icone("book-open")} Guia do sistema</button>
      <p class="muted small u-m-0 u-mt-8">Manual completo: o que cada tela faz, como o Mentor IA funciona e como tudo se conecta.</p>
    </section>

    <div class="seg u-mb-16" role="tablist">
      <button data-aba-btn="estudo">${icone("target")} Estudo &amp; prova</button>
      <button data-aba-btn="ia">${icone("bot")} IA</button>
      <button data-aba-btn="aparencia">${icone("palette")} Aparência</button>
      <button data-aba-btn="conta">${icone("graduation-cap")} Dados &amp; concurso</button>
    </div>

    <div class="cfg-aba" data-aba="aparencia" ${abaCfg === "aparencia" ? "" : "hidden"}>
    <h2 class="cfg-grupo-titulo">Aparência &amp; experiência</h2>
    <p class="cfg-grupo-sub">Como o app se mostra para você: tema, lembretes e as cores dos seus grifos.</p>

    <section class="card">
      <h3>${icone("palette")} Aparência</h3>
      <div class="tema-opcoes">
        <button class="tema-opt ${cfg.tema !== "escuro" ? "on" : ""}" data-action="set-tema" data-tema="claro" data-tip="Fundo claro, ideal para ambientes iluminados.">
          <span class="tema-amostra tema-amostra-claro"></span>
          <span>Claro</span>
        </button>
        <button class="tema-opt ${cfg.tema === "escuro" ? "on" : ""}" data-action="set-tema" data-tema="escuro" data-tip="Fundo escuro, reduz o brilho à noite.">
          <span class="tema-amostra tema-amostra-escuro"></span>
          <span>Escuro</span>
        </button>
      </div>
    </section>

    <section class="card">
      <h3>${icone("bell")} Notificações</h3>
      <label class="inline" style="font-weight:600; display:flex; width:fit-content; gap:8px; margin-bottom:6px">
        <input id="cfg-not-ativar" type="checkbox" ${nt.ativar ? "checked" : ""} /> Ativar lembretes
      </label>
      <p class="muted small u-m-0 u-mb-12">As notificações são <b>facultativas</b> e só disparam no <b>aplicativo desktop</b> (na web o navegador não notifica). Escolha quais quer receber:</p>
      <div class="not-opcoes" ${nt.ativar ? "" : "data-desativado"}>
        <label class="inline small not-linha"><input id="cfg-not-diario" type="checkbox" ${nt.diario ? "checked" : ""} /> Lembrete diário no horário:
          <input id="cfg-not-horario" type="time" value="${nt.horario || "08:00"}" style="width:auto; margin:0 0 0 6px" /></label>
        <label class="inline small not-linha"><input id="cfg-not-revisoes" type="checkbox" ${nt.revisoes ? "checked" : ""} /> Revisões vencidas (flashcards e tópicos)</label>
        <label class="inline small not-linha"><input id="cfg-not-tarefas" type="checkbox" ${nt.tarefasDia ? "checked" : ""} /> Tarefas planejadas do dia <span class="muted">(só um lembrete; é sugestão, nunca cobrança)</span></label>
        <label class="inline small not-linha"><input id="cfg-not-mentor" type="checkbox" ${nt.mentorPlano ? "checked" : ""} /> Revisar o progresso com o Mentor IA <span class="muted">(lembra a cada ~7 dias; você decide quando rodar)</span></label>
        <label class="inline small not-linha"><input id="cfg-not-inatividade" type="checkbox" ${nt.inatividade ? "checked" : ""} /> Aviso de inatividade (“faz N dias…”)</label>
        <label class="inline small not-linha"><input id="cfg-not-marcos" type="checkbox" ${nt.marcos ? "checked" : ""} /> Marcos e conquistas (streak, simulado, reta final)</label>
      </div>
    </section>

    <section class="card">
      <h3>${icone("highlighter")} Cores da marcação (acessibilidade)</h3>
      <label class="inline">Paleta:
        <select id="cfg-paleta" style="width:auto; margin-left:6px">
          <option value="padrao" ${cfg.paletaMarcacao === "padrao" ? "selected" : ""}>Padrão</option>
          <option value="daltonismo" ${cfg.paletaMarcacao === "daltonismo" ? "selected" : ""}>Daltonismo (Okabe-Ito)</option>
          <option value="contraste" ${cfg.paletaMarcacao === "contraste" ? "selected" : ""}>Alto contraste</option>
        </select>
      </label>
      <div class="mk-legenda u-mt-12">
        <span class="mk-leg"><i class="mk-dot mk-amarelo"></i>palavras-chave</span>
        <span class="mk-leg"><i class="mk-dot mk-azul"></i>prazos/valores</span>
        <span class="mk-leg"><i class="mk-dot mk-vermelho"></i>restritivas</span>
        <span class="mk-leg"><i class="mk-dot mk-verde"></i><i class="mk-dot mk-roxo"></i><i class="mk-dot mk-laranja"></i>livres</span>
      </div>
      <p class="muted small u-m-0 u-mt-8">Ajusta as cores dos grifos em Lei Seca, Jurisprudência, Resumos e Material.</p>
    </section>

    </div>

    <div class="cfg-aba" data-aba="estudo" ${abaCfg === "estudo" ? "" : "hidden"}>
    <h2 class="cfg-grupo-titulo">Estudo</h2>
    <p class="cfg-grupo-sub">Seu ritmo e a memória de longo prazo: metas, dias de estudo e a curva de revisão.</p>

    <section class="card">
      <h3>${icone("target")} Metas e prova</h3>
      <p class="muted small">Tudo opcional. As metas são comparadas com o tempo realizado no Acompanhamento.</p>
      <div style="max-width:240px; margin-bottom:16px">
        <label class="u-mb-8">Data da prova
          <input id="cfg-prova" type="date" value="${esc(cfg.dataProva || "")}" ${cfg.dataProva ? "" : "disabled"} />
        </label>
        <label class="inline small u-fw-regular"><input id="cfg-prova-pre" type="checkbox" ${cfg.dataProva ? "" : "checked"} /> Ainda sem data de prova</label>
      </div>
      <div class="form-row">
        <label>Meta diária ${campoHM("cfg-meta-dia", cfg.metaDiariaMin, semMetas)}</label>
        <label>Meta semanal ${campoHM("cfg-meta-sem", cfg.metaSemanalMin, semMetas)}</label>
        <label>Meta mensal ${campoHM("cfg-meta-mes", cfg.metaMensalMin, semMetas)}</label>
      </div>
      <label class="inline small" style="font-weight:400; margin-bottom:12px; display:flex; width:fit-content"><input id="cfg-meta-pre" type="checkbox" ${semMetas ? "checked" : ""} /> Sem meta por enquanto</label>
    </section>

    <section class="card">
      <h3>${icone("alarm-clock")} Som do alarme do cronômetro</h3>
      <p class="muted small">Quando o tempo do bloco termina, o cronômetro toca um sinal e segue contando o tempo extra. Escolha a duração do som.</p>
      <label class="inline">Alarme:
        <select id="cfg-alarme" style="width:auto; margin-left:6px">
          <option value="curto" ${cfg.somAlarme === "curto" ? "selected" : ""}>Curto (1 toque)</option>
          <option value="longo" ${(cfg.somAlarme || "longo") === "longo" ? "selected" : ""}>Longo (3 toques)</option>
          <option value="insistente" ${cfg.somAlarme === "insistente" ? "selected" : ""}>Insistente (6 toques)</option>
        </select>
      </label>
      <div class="form-acoes u-mt-12">
        <button class="btn btn-ghost btn-sm" data-action="testar-alarme">${icone("bell")} Testar</button>
      </div>
    </section>

    <section class="card">
      <h3>${icone("calendar-check")} Dias de estudo</h3>
      <p class="muted small">Marque os dias da semana em que você pretende estudar. Os dias desmarcados são considerados <b>folga</b>: somem da agenda do Planejamento e não interrompem a sua sequência de dias seguidos. O contador "${esc("X/N")}" do Hoje usa o total de dias marcados aqui.</p>
      <div class="dias-estudo-grid">
        ${DIAS_SEMANA.map((nome, d) => {
          const estuda = !store.diaEhFolga(d);
          return `<label class="dia-estudo-chip ${estuda ? "on" : "off"}">
            <input type="checkbox" data-dia-estudo="${d}" ${estuda ? "checked" : ""} /> ${esc(nome)}
          </label>`;
        }).join("")}
      </div>
      <p class="muted small u-m-0 u-mt-12"><b class="num">${7 - (cfg.diasFolga || []).length}</b> ${7 - (cfg.diasFolga || []).length === 1 ? "dia" : "dias"} de estudo por semana.</p>
    </section>

    <section class="card">
      <h3>${icone("repeat-2")} Revisão de Tópicos</h3>
      <label class="inline" style="font-weight:500; display:flex; width:fit-content; align-items:flex-start; gap:8px">
        <input id="cfg-revtop" type="checkbox" ${cfg.revisaoTopicoAuto ? "checked" : ""} />
        <span>Agendar revisão dos tópicos que eu estudar (curva 24h · 7d · 30d...)</span>
      </label>
      <p class="muted small u-m-0 u-mt-8">Cada sessão de <b>Estudo</b> de um tópico entra na curva do esquecimento. No registro da sessão você pode desmarcar caso não queira agendar. As revisões aparecem na tela <b>Revisão de Tópicos</b> e no Hoje.</p>
    </section>

    <section class="card">
      <h3>${icone("gauge")} Desempenho (semáforo)</h3>
      <p class="muted small">Define as faixas de cor do aproveitamento (% de acertos) no Acompanhamento. Abaixo de <b>"ruim"</b> = vermelho; a partir de <b>"bom"</b> = verde; entre os dois = amarelo.</p>
      <div class="form-row" style="max-width:360px">
        <label>Limite "ruim" (%)
          <input id="cfg-perf-ruim" type="number" min="0" max="100" value="${Number(cfg.perfRuim ?? 60)}" />
        </label>
        <label>Limite "bom" (%)
          <input id="cfg-perf-bom" type="number" min="0" max="100" value="${Number(cfg.perfBom ?? 80)}" />
        </label>
      </div>
    </section>

    </div>

    <div class="cfg-aba" data-aba="ia" ${abaCfg === "ia" ? "" : "hidden"}>
    <h2 class="cfg-grupo-titulo">Inteligência</h2>
    <p class="cfg-grupo-sub">A camada de IA que orquestra questões, flashcards, correção e chat. O núcleo do app funciona sem ela.</p>

    <section class="card">
      <h3>${icone("bot")} Camada de IA <span class="muted small" data-tip="O essencial funciona offline. A IA é só orquestradora (com selo de origem) e a chave fica salva apenas na sua máquina.">${icone("info")}</span></h3>
      <p class="muted small">Conecte uma chave para liberar os recursos de IA.</p>
      <p class="small">Status: ${iaDisponivel(cfg) ? '<b style="color:var(--success)">IA conectada</b> ' : '<b>Offline</b> (funções de IA bloqueadas)'}</p>
      <div class="form-row">
        <label>Provedor
          <select id="cfg-ia">
            <option value="offline" ${cfg.iaProvider === "offline" ? "selected" : ""}>Offline (sem IA)</option>
            <option value="gemini" ${cfg.iaProvider === "gemini" ? "selected" : ""}>Google Gemini (chave grátis)</option>
            ${ehDesktop || cfg.iaProvider === "claude-cli" ? `<option value="claude-cli" ${cfg.iaProvider === "claude-cli" ? "selected" : ""}>Claude Code local (pessoal · desktop)</option>` : ""}
          </select>
        </label>
        <label>Modelo (vazio = automático; ou escolha um da lista)
          <select id="cfg-modelo" ${iaInativa ? "disabled" : ""}>
            ${(() => {
              const ehGemini = cfg.iaProvider === "gemini";
              const opts = ehGemini ? GEMINI_FALLBACKS : cfg.iaProvider === "claude-cli" ? CLAUDE_MODELOS : [];
              const atual = (cfg.iaModelo || "").trim();
              // Só prepõe o modelo salvo no GEMINI (onde IDs personalizados são comuns). No Claude,
              // os 3 atalhos cobrem tudo; no Offline não há modelo — evita mostrar um modelo de
              // outro provedor (ex.: um modelo Gemini salvo aparecendo na lista do Claude).
              const lista = ehGemini && atual && !opts.includes(atual) ? [atual, ...opts] : opts;
              const padrao = MODELO_PADRAO[cfg.iaProvider] || "";
              return (
                `<option value="" ${!atual ? "selected" : ""}>— automático${padrao ? ` (${esc(padrao)})` : ""} —</option>` +
                lista.map((m) => `<option value="${esc(m)}" ${atual === m ? "selected" : ""}>${esc(m)}${m === padrao ? " · recomendado" : ""}</option>`).join("")
              );
            })()}
          </select>
        </label>
      </div>
      <label>Chave de API
        <input id="cfg-key" type="password" value="${esc(cfg.iaKey || "")}" placeholder="${semChave ? "não precisa — usa a autenticação local do Claude Code" : "cole a chave aqui"}" ${iaInativa || semChave ? "disabled" : ""} />
      </label>
      ${
        cfg.iaProvider === "gemini"
          ? `<label>Chave reserva <span class="muted small" data-tip="Opcional. Use uma 2ª chave grátis do Gemini (de outra conta Google). Ela só entra em ação automaticamente quando a chave principal estoura a cota diária (erro 429) — no uso normal, a principal é sempre usada.">${icone("info")}</span>
        <input id="cfg-key2" type="password" value="${esc(cfg.iaKeyReserva || "")}" placeholder="opcional — entra só quando a principal esgota a cota" ${iaInativa ? "disabled" : ""} />
      </label>`
          : ""
      }
      <p class="muted small">${AJUDA_IA[cfg.iaProvider] || ""}</p>
      <label class="inline small" style="display:flex; width:fit-content; align-items:flex-start; gap:8px; margin:4px 0 2px; font-weight:400">
        <input id="cfg-mentor-auto" type="checkbox" ${cfg.mentorAutoSemanal !== false ? "checked" : ""} />
        <span>Deixar o <b>Mentor IA</b> analisar o seu progresso <b>automaticamente uma vez por semana</b> (mesmo sem você clicar em "Analisar"). Desmarque para analisar só quando você clicar.</span>
      </label>
      <div class="form-acoes">
        <button class="btn btn-primary btn-sm" data-action="salvar-ia">Salvar IA</button>
        ${cfg.iaProvider === "gemini" ? `<button class="btn btn-ghost btn-sm" data-action="testar-ia">${icone("plug-zap")} Testar conexão</button>` : ""}
      </div>
      <p class="small u-m-0 u-mt-12" id="ia-msg"></p>
    </section>

    </div>

    <div class="cfg-aba" data-aba="aparencia" ${abaCfg === "aparencia" ? "" : "hidden"}>
    <h2 class="cfg-grupo-titulo">Navegação</h2>
    <p class="cfg-grupo-sub">Personalize a barra lateral e crie atalhos para o que você mais acessa. Itens de ajuste fino, recolhidos por padrão.</p>

    <details class="cfg-acordeao">
      <summary>${icone("puzzle")} Botões da barra (ordem e visibilidade)</summary>
      <p class="muted small">Reordene os botões com as <b>setas</b> dentro de cada grupo e desmarque <b>"visível"</b> para ocultar os que não usa. Ocultar não apaga nada: é só esconder, e você reexibe quando quiser. A ordem dos grupos é fixa (<b>HOJE</b> sempre no topo, <b>Configurações</b> sempre por último).</p>
      <div class="botoes-ordem">
        ${gruposNav(cfg)
          .map((g) => {
            const meio = g.itens.filter((it) => !NAV_FIXOS.includes(it.id));
            return `<div class="nav-grupo-cfg">${esc(g.grupo)}</div>` +
              g.itens
                .map((it) => {
                  if (NAV_FIXOS.includes(it.id)) return botaoLinha(it, { fixo: true });
                  const mi = meio.indexOf(it);
                  return botaoLinha(it, { i: mi, total: meio.length, oculto: (cfg.botoesOcultos || []).includes(it.id) });
                })
                .join("");
          })
          .join("")}
      </div>
    </details>

    <details class="cfg-acordeao">
      <summary>${icone("star")} Atalhos rápidos</summary>
      <p class="muted small">Crie botões de acesso rápido para o que você mais usa: uma <b>tela</b> (inclusive Acompanhamento e Central de Revisões), uma <b>disciplina</b> do edital, o <b>dossiê de um tópico</b> ou <b>Questões filtradas por tópico</b> (treinar um tema num clique). Defina o <b>nome</b>, o <b>ícone</b> e o <b>destino</b>. O atalho aparece na <b>barra lateral</b>.</p>
      <div class="form-row">
        <label class="u-grow">Nome <input id="atl-nome" type="text" placeholder="Ex.: Português" /></label>
        <label>Tipo
          <select id="atl-tipo">
            <option value="tela">Tela</option>
            <option value="disciplina">Disciplina (edital)</option>
            <option value="topico">Tópico (dossiê)</option>
            <option value="questoes">Questões (por tópico)</option>
          </select>
        </label>
        <label class="u-grow">Destino <select id="atl-alvo">${alvoOptions("tela", st)}</select></label>
      </div>
      <input id="atl-icone" type="hidden" value="star" />
      <div class="atl-ico-lbl muted small">Ícone</div>
      <div class="ico-palette">${ICONES_ATALHO.map((n) => `<button type="button" class="ico-btn${n === "star" ? " sel" : ""}" data-action="atl-emoji" data-emoji="${n}" title="${n}" aria-label="${n}">${icone(n)}</button>`).join("")}</div>
      <div class="form-row" style="align-items:center">
        <span class="muted small">Aparece na barra lateral.</span>
        <span class="spacer"></span>
        <button class="btn btn-add btn-sm" data-action="add-atalho">Adicionar atalho</button>
      </div>
      <div class="atalhos-lista-cfg">
        ${
          (cfg.atalhos || []).length
            ? cfg.atalhos
                .map(
                  (a, i) => `<div class="atalho-row">
                    <span class="atalho-row-nome"><span class="atalho-row-ic">${icone(a.icone) || icone("star")}</span> ${esc(a.nome)} <span class="muted small">(${esc(rotuloTipo(a.tipo))})</span></span>
                    <span class="spacer"></span>
                    <button class="lnk" data-action="atl-up" data-id="${a.id}" ${i === 0 ? "disabled" : ""} data-tip="Subir" data-tip-pos="cima-dir">${icone("chevron-up")}</button>
                    <button class="lnk" data-action="atl-down" data-id="${a.id}" ${i === cfg.atalhos.length - 1 ? "disabled" : ""} data-tip="Descer" data-tip-pos="cima-dir">${icone("chevron-down")}</button>
                    <button class="lnk lnk-danger" data-action="del-atalho" data-id="${a.id}" data-tip="Remover atalho" data-tip-pos="cima-dir">${icone("x")}</button>
                  </div>`
                )
                .join("")
            : '<span class="muted small">Nenhum atalho ainda.</span>'
        }
      </div>
    </details>

    </div>

    <div class="cfg-aba" data-aba="conta" ${abaCfg === "conta" ? "" : "hidden"}>
    <h2 class="cfg-grupo-titulo">Dados &amp; concurso</h2>
    <p class="cfg-grupo-sub">Seu concurso-alvo, backup dos dados e a zona de risco (apagar tudo).</p>

    <section class="card">
      <h3>${icone("graduation-cap")} Concurso</h3>
      <div class="form-row">
        <label class="u-grow-2">Cargo <input id="cfg-cargo" type="text" value="${esc(c ? c.cargo : "")}" /></label>
        <label class="u-grow">Banca <input id="cfg-banca" type="text" value="${esc(c ? c.banca : "")}" /></label>
      </div>
      <p class="muted small">Multi-concurso e modo fusão chegam na v3.</p>
    </section>

    <section class="card">
      <h3>${icone("life-buoy")} Suporte e atualizações</h3>
      <div class="u-row u-wrap">
        <button class="btn btn-soft btn-sm" data-action="enviar-sugestao" data-tip="Abre seu e-mail com uma mensagem pronta para enviar.">${icone("lightbulb")} Enviar sugestão</button>
        <button class="btn btn-ghost btn-sm" data-action="gerar-diagnostico" data-tip="Gera um arquivo com informações técnicas (versão, sistema, erros recentes) para você anexar num e-mail de suporte. Não inclui o conteúdo dos seus estudos.">${icone("life-buoy")} Relatar um problema (gerar diagnóstico)</button>
        ${ehDesktop ? `<button class="btn btn-ghost btn-sm" data-action="buscar-update" data-tip="Verifica se há uma versão mais nova (só no aplicativo instalado).">${icone("refresh-cw")} Procurar atualizações</button>` : ""}
      </div>
      <p class="muted small u-m-0 u-mt-8">Versão ${esc(APP_VERSION)} · Desenvolvido por <b>Phelipe Ribeiro da Silva</b></p>
    </section>

    <section class="card">
      <h3>${icone("smartphone")} Sincronização <span class="muted small">(celular e computadores)</span></h3>
      <p class="muted small">Use uma <b>senha</b> e tenha os mesmos dados no <b>celular</b> e nos <b>computadores</b>.</p>
      ${
        nuvemSuporta
          ? `<div class="sync-status ${sn.ultimoResultado === "erro" ? "erro" : sn.conectado ? "ok" : ""}">
              <span>${sn.conectado ? `Conectado ${icone("lock")}` : "Não conectado"}</span>
              ${sn.conectado ? `<span class="sync-status-sep">·</span><span>${nuvemStatus}</span>` : ""}
            </div>
            ${
              sn.conectado
                ? `<div class="form-acoes">
                    <button class="btn btn-primary btn-sm" data-action="nuvem-agora" ${sn.sincronizando ? "disabled" : ""} data-tip="Envia ou baixa as alterações agora (o mais recente vence).">${icone("refresh-cw")} Sincronizar agora</button>
                    <button class="btn btn-ghost btn-sm" data-action="nuvem-desconectar" data-tip="Para de sincronizar neste aparelho e esquece a senha daqui (os dados locais continuam).">Desconectar</button>
                  </div>`
                : `<div class="form-linha u-mt-8">
                     <label class="small" for="nuvem-frase">Senha</label>
                     <input id="nuvem-frase" type="password" class="input" autocomplete="off" placeholder="uma frase sua, fácil de lembrar" />
                   </div>
                   <div class="form-acoes u-mt-8">
                     <button class="btn btn-primary btn-sm" data-action="nuvem-conectar">${icone("lock")} Conectar</button>
                   </div>`
            }
            ${
              sn.pendente
                ? `<div class="sync-conflito">
                    <p class="small u-m-0 u-mb-8"><b>${icone("triangle-alert")} A sincronização reduziria os seus dados</b> (aqui: <b>${Number(sn.pendente.local) || 0} itens</b> · na nuvem: <b>${Number(sn.pendente.remoto) || 0} itens</b>). Isso costuma acontecer quando um aparelho <b>vazio</b> se conecta. Por segurança, nada foi alterado. O que usar?</p>
                    <div class="form-acoes">
                      <button class="btn btn-primary btn-sm" data-action="nuvem-manter-local">Manter os daqui (enviar p/ a nuvem)</button>
                      <button class="btn btn-soft btn-sm" data-action="nuvem-usar-nuvem">Usar os da nuvem (substitui os daqui)</button>
                    </div>
                  </div>`
                : ""
            }
            <details class="ed-ajuda u-mt-12">
              <summary>Como funciona</summary>
              <div class="ed-ajuda-corpo">
                <p>Você escolhe uma <b>senha</b> (a mesma em todo aparelho) e o app guarda seus dados num <b>cofre cifrado</b> na nuvem. Digite a senha <b>uma vez por aparelho</b> e depois ele sincroniza sozinho (ao abrir e ao fechar). A senha cifra tudo de ponta a ponta (nem nós nem o serviço de nuvem conseguem ler) e <b>nunca sai do aparelho</b>. Não há recuperação de senha, então escolha uma frase fácil de lembrar. Os <b>PDFs originais</b> não sobem (ficam em cada aparelho); já o <b>texto extraído</b> sincroniza. Use <b>um aparelho por vez</b>: deixe um terminar de sincronizar antes de abrir no outro (se editar em dois ao mesmo tempo, vence o mais recente).</p>
              </div>
            </details>`
          : `<p class="muted small">Este navegador não suporta a sincronização segura (falta o Web Crypto). Use um navegador atual (Chrome, Edge, Safari, Firefox).</p>`
      }
    </section>

    <section class="card">
      <details class="ed-ajuda">
        <summary>${icone("refresh-cw")} Backup extra por arquivo (opcional · Drive/OneDrive · desktop)</summary>
        <div class="ed-ajuda-corpo">
          <p class="muted small u-mt-8">Além da sincronização por senha, você pode guardar uma cópia dos seus dados num arquivo dentro da sua própria nuvem (Google Drive ou OneDrive), só no app desktop. O app grava ali os dados e o <b>texto</b> dos materiais (os <b>PDFs ficam só nesta máquina</b>); nada passa por servidor nosso.</p>
      ${
        syncSuporta
          ? `<div class="sync-status ${sy.ultimoResultado === "erro" ? "erro" : sy.conectado ? "ok" : ""}">
              <span>${sy.conectado ? `Conectado a <b>${esc(sy.nomeArquivo || "arquivo de sync")}</b>` : "Não conectado"}</span>
              <span class="sync-status-sep">·</span>
              <span>${syncStatus}</span>
            </div>
            ${
              sy.conectado
                ? `<div class="form-acoes">
                    <button class="btn btn-primary btn-sm" data-action="sync-agora" ${sy.sincronizando ? "disabled" : ""} data-tip="Envia ou baixa as alterações agora (o mais recente vence).">${icone("refresh-cw")} Sincronizar agora</button>
                    <button class="btn btn-ghost btn-sm" data-action="sync-desconectar">Desconectar</button>
                  </div>`
                : `<p class="muted small u-m-0 u-mt-8 u-mb-8"><b>1º computador</b>: cria o arquivo numa pasta do seu Drive/OneDrive e <b>envia</b> os seus dados.<br><b>2º computador</b>: espere o Drive baixar o arquivo e selecione-o (esse modo só <b>lê e baixa</b>, <b>nunca sobrescreve</b> a nuvem).</p>
                   <div class="form-acoes">
                     <button class="btn btn-primary btn-sm" data-action="sync-conectar">${icone("refresh-cw")} 1º computador: criar e enviar</button>
                     <button class="btn btn-soft btn-sm" data-action="sync-conectar-baixar">${icone("download")} 2º computador: baixar</button>
                   </div>`
            }
            ${
              sy.pendente
                ? `<div class="sync-conflito">
                    <p class="small u-m-0 u-mb-8"><b>${icone("triangle-alert")} A sincronização reduziria os seus dados</b> (aqui: <b>${Number(sy.pendente.local) || 0} itens</b> · na nuvem: <b>${Number(sy.pendente.remoto) || 0} itens</b>). Isso costuma acontecer quando uma máquina <b>vazia</b> se conecta. Por segurança, nada foi alterado. O que usar?</p>
                    <div class="form-acoes">
                      <button class="btn btn-primary btn-sm" data-action="sync-manter-local">Manter os daqui (enviar p/ a nuvem)</button>
                      <button class="btn btn-soft btn-sm" data-action="sync-usar-nuvem">Usar os da nuvem (substitui os daqui)</button>
                    </div>
                  </div>`
                : ""
            }
            ${
              sy.ultimoConflitoEm && !sy.pendente
                ? `<div class="sync-conflito">
                    <p class="small u-m-0 u-mb-8"><b>${icone("triangle-alert")} Conflito na última sincronização</b>: houve edições offline nos dois computadores. Para não perder nada, foi guardada uma <b>cópia da versão anterior deste computador</b>.</p>
                    <div class="form-acoes">
                      <button class="btn btn-soft btn-sm" data-action="sync-baixar-backup">${icone("download")} Baixar cópia de segurança</button>
                      <button class="btn btn-ghost btn-sm" data-action="sync-dispensar-conflito">Dispensar aviso</button>
                    </div>
                  </div>`
                : ""
            }
            <p class="muted small u-m-0 u-mt-12">${icone("triangle-alert")} Use <b>um computador de cada vez</b> com o app aberto (deixe o Drive terminar de sincronizar antes de abrir na outra máquina). <b>Ao fechar o app, ele sincroniza sozinho.</b></p>`
          : `<p class="muted small">Este ambiente não suporta a sincronização por arquivo. No <b>aplicativo instalado</b> (desktop) ela funciona.</p>`
      }
        </div>
      </details>
    </section>

    <section class="card">
      <h3>${icone("database")} Dados</h3>
      <p class="muted small">Armazenamento: <b>${esc(backendName())}</b></p>
      <div class="dados-stats">
        <span><span class="num">${st.disciplinas.length}</span> disciplinas</span>
        <span><span class="num">${st.topicos.length}</span> tópicos</span>
        <span><span class="num">${st.documentos.length}</span> materiais</span>
        <span><span class="num">${st.questoes.length}</span> questões</span>
        <span><span class="num">${st.flashcards.length}</span> flashcards</span>
      </div>
      <div class="form-acoes">
        <button class="btn btn-ghost btn-sm" data-action="exportar-completo" data-tip="Inclui TUDO, inclusive seus materiais (PDF/texto). Use só localmente: NÃO compartilhe.">${icone("download")} Backup completo (local)</button>
        <button class="btn btn-ghost btn-sm" data-action="exportar-compartilhavel" data-tip="Remove o conteúdo dos materiais importados (mantém seus flashcards/questões/resumos/marcações). Seguro para compartilhar.">${icone("download")} Backup compartilhável (sem materiais)</button>
        <label class="btn btn-ghost btn-sm btn-file">${icone("upload")} Importar backup (JSON)
          <input id="cfg-import" type="file" accept=".json,application/json" hidden />
        </label>
      </div>
      <p class="muted small"><b>Backup completo</b> inclui seus materiais (com o conteúdo) e fica só no seu dispositivo. <b>Backup compartilhável</b> tira o conteúdo dos materiais (que podem ser protegidos por direito autoral), mantendo o que é seu (questões, flashcards, resumos, marcações). Importar <b>substitui todos os dados atuais</b>.</p>
      <label class="inline small" style="display:flex; width:fit-content; gap:8px; margin-top:10px; font-weight:400">
        <input id="cfg-descartar-pdf" type="checkbox" ${cfg.descartarPdfAposImport ? "checked" : ""} />
        <span>Ao importar material, <b>descartar o PDF original</b> após extrair o texto (economiza espaço e não guarda a cópia do arquivo; mantém o texto. Você perde o visualizador de PDF e o OCR posterior). Não se aplica a páginas que ainda precisam de OCR.</span>
      </label>

      <div class="cfg-zona-risco">
        <span class="cfg-zona-risco-tag">${icone("triangle-alert")} Zona de risco</span>
        <p class="muted small u-m-0 u-mt-8 u-mb-12">Esta ação é <b>irreversível</b> e apaga concurso, tópicos, questões, flashcards e materiais. Faça um backup antes.</p>
        <button class="btn btn-danger btn-sm" data-action="reset" data-tip="Apaga TODOS os dados e reinicia o onboarding. Não há como desfazer.">${icone("trash-2")} Apagar tudo e recomeçar</button>
      </div>
    </section>
    </div>`;

  // Abas das Configurações: alterna a visibilidade SEM re-render (preserva edições nos campos).
  const sincronizarAbas = () => {
    root.querySelectorAll(".cfg-aba").forEach((d) => { d.hidden = d.getAttribute("data-aba") !== abaCfg; });
    root.querySelectorAll("[data-aba-btn]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-aba-btn") === abaCfg));
  };
  root.querySelectorAll("[data-aba-btn]").forEach((b) =>
    b.addEventListener("click", () => { abaCfg = b.getAttribute("data-aba-btn"); sincronizarAbas(); })
  );
  sincronizarAbas();

  root.querySelector("#cfg-revtop")?.addEventListener("change", (e) => {
    store.setConfig({ revisaoTopicoAuto: e.target.checked });
    toast(e.target.checked ? "Revisão automática de tópicos ligada." : "Revisão automática de tópicos desligada.");
  });

  root.querySelector("#cfg-mentor-auto")?.addEventListener("change", (e) => {
    store.setConfig({ mentorAutoSemanal: e.target.checked });
    toast(e.target.checked ? "Mentor IA: análise automática semanal ligada." : "Mentor IA: análise automática só quando você clicar.");
  });

  root.querySelector("#cfg-descartar-pdf")?.addEventListener("change", (e) => {
    store.setConfig({ descartarPdfAposImport: e.target.checked });
    toast(e.target.checked ? "Materiais: PDF original será descartado após importar (mantém o texto)." : "Materiais: PDF original será mantido.");
  });

  root.querySelector("#cfg-paleta")?.addEventListener("change", (e) => {
    store.setConfig({ paletaMarcacao: e.target.value });
    toast("Paleta da marcação atualizada.");
    app.refresh();
  });

  // Notificações: salva o objeto inteiro a cada mudança (e re-renderiza só ao ligar/desligar o mestre).
  const salvarNotif = (rerender) => {
    store.setConfig({
      notificacoes: {
        ativar: !!root.querySelector("#cfg-not-ativar")?.checked,
        diario: !!root.querySelector("#cfg-not-diario")?.checked,
        horario: root.querySelector("#cfg-not-horario")?.value || "08:00",
        revisoes: !!root.querySelector("#cfg-not-revisoes")?.checked,
        tarefasDia: !!root.querySelector("#cfg-not-tarefas")?.checked,
        mentorPlano: !!root.querySelector("#cfg-not-mentor")?.checked,
        inatividade: !!root.querySelector("#cfg-not-inatividade")?.checked,
        marcos: !!root.querySelector("#cfg-not-marcos")?.checked,
      },
    });
    if (rerender) app.refresh();
  };
  root.querySelector("#cfg-not-ativar")?.addEventListener("change", () => salvarNotif(true));
  ["#cfg-not-diario", "#cfg-not-horario", "#cfg-not-revisoes", "#cfg-not-tarefas", "#cfg-not-mentor", "#cfg-not-inatividade", "#cfg-not-marcos"].forEach((sel) =>
    root.querySelector(sel)?.addEventListener("change", () => salvarNotif(false))
  );

  bindActions(root, {
    "abrir-guia": () => abrirGuia(),
    "enviar-sugestao": () => {
      // E-mail do desenvolvedor que recebe as sugestões (exclusivo do Mentor).
      const para = EMAIL_SUPORTE;
      const assunto = encodeURIComponent("Sugestão / problema — Mentor Concurso");
      const corpo = encodeURIComponent(
        "Descreva sua sugestão ou o problema (quanto mais detalhe, melhor):\n\n\n" +
        "— Em qual tela aconteceu?\n— O que você esperava?\n— O que aconteceu?\n"
      );
      window.location.href = `mailto:${para}?subject=${assunto}&body=${corpo}`;
    },
    "buscar-update": () => verificarAtualizacao({ silencioso: false }),
    "sync-conectar": async () => {
      try { await syncConectar(); toast("Conectado e sincronizado.", "ok"); }
      catch (e) { if (e.name !== "AbortError") toast("Não foi possível conectar: " + e.message, "erro"); }
      app.refresh();
    },
    "sync-conectar-baixar": async () => {
      try {
        const r = await syncConectarBaixar();
        toast(r.acao === "baixou" ? "Conectado — dados baixados da nuvem." : "Conectado (o arquivo ainda estava vazio).", "ok");
      } catch (e) { if (e.name !== "AbortError") toast("Não foi possível conectar: " + e.message, "erro"); }
      app.refresh();
    },
    "sync-agora": async () => {
      toast("Sincronizando…");
      try {
        const r = await sincronizarAgora({ motivo: "manual" });
        toast(r.acao === "baixou" ? "Dados atualizados da nuvem." : r.acao === "subiu" ? "Dados enviados para a nuvem." : "Já estava sincronizado.", "ok");
      } catch (e) { toast("Falha ao sincronizar: " + e.message, "erro"); }
      app.refresh();
    },
    "sync-desconectar": async () => { await syncDesconectar(); toast("Sincronização desconectada."); app.refresh(); },
    "sync-baixar-backup": async () => {
      const b = await ultimoBackupConflito();
      if (!b || !b.snap) return toast("Nenhuma cópia de segurança encontrada.", "erro");
      exportarJSON(b.snap, "backup-conflito");
      toast("Cópia de segurança baixada (JSON). Importe em Dados se precisar recuperar algo.", "ok");
    },
    "sync-dispensar-conflito": () => { store.setSyncMeta({ ultimoConflitoEm: "" }); toast("Aviso dispensado."); app.refresh(); },
    "sync-manter-local": async () => {
      toast("Enviando os dados deste computador para a nuvem…");
      try { await resolverPendencia("local"); toast("Mantidos os dados deste computador (enviados à nuvem).", "ok"); }
      catch (e) { toast("Falha: " + e.message, "erro"); }
      app.refresh();
    },
    "sync-usar-nuvem": async () => {
      const ok = await confirmar("Isto vai SUBSTITUIR os dados deste computador pelos da nuvem. Uma cópia de segurança dos atuais será guardada. Continuar?");
      if (!ok) return;
      try { await resolverPendencia("nuvem"); toast("Aplicados os dados da nuvem.", "ok"); }
      catch (e) { toast("Falha: " + e.message, "erro"); }
      app.refresh();
    },
    // ---- Sincronização na nuvem por senha (celular + computadores) ----
    "nuvem-conectar": async () => {
      const frase = (root.querySelector("#nuvem-frase")?.value || "").trim();
      const endpoint = (root.querySelector("#nuvem-endpoint")?.value || "").trim();
      if (!frase) return toast("Digite a sua senha de sincronização.", "erro");
      toast("Conectando…");
      try {
        const r = await conectarNuvem(frase, { endpoint });
        toast(r.acao === "baixou" ? "Conectado — dados baixados da nuvem." : r.acao === "subiu" ? "Conectado — dados enviados para a nuvem." : "Conectado e sincronizado.", "ok");
      } catch (e) { toast("Não foi possível conectar: " + e.message, "erro"); }
      app.refresh();
    },
    "nuvem-agora": async () => {
      toast("Sincronizando…");
      try {
        const r = await sincronizarNuvem({ motivo: "manual" });
        toast(r.acao === "baixou" ? "Dados atualizados da nuvem." : r.acao === "subiu" ? "Dados enviados para a nuvem." : "Já estava sincronizado.", "ok");
      } catch (e) { toast("Falha ao sincronizar: " + e.message, "erro"); }
      app.refresh();
    },
    "nuvem-desconectar": async () => {
      const ok = await confirmar("Desconectar a sincronização neste aparelho? A senha será esquecida aqui (os seus dados locais continuam intactos).");
      if (!ok) return;
      await desconectarNuvem(); toast("Sincronização desconectada neste aparelho."); app.refresh();
    },
    "nuvem-manter-local": async () => {
      toast("Enviando os dados deste aparelho para a nuvem…");
      try { await resolverPendenciaNuvem("local"); toast("Mantidos os dados deste aparelho (enviados à nuvem).", "ok"); }
      catch (e) { toast("Falha: " + e.message, "erro"); }
      app.refresh();
    },
    "nuvem-usar-nuvem": async () => {
      const ok = await confirmar("Isto vai SUBSTITUIR os dados deste aparelho pelos da nuvem. Uma cópia de segurança dos atuais será guardada. Continuar?");
      if (!ok) return;
      try { await resolverPendenciaNuvem("nuvem"); toast("Aplicados os dados da nuvem.", "ok"); }
      catch (e) { toast("Falha: " + e.message, "erro"); }
      app.refresh();
    },
    "gerar-diagnostico": async () => {
      const nome = baixarRelatorio(store);
      const v = await escolher(
        `Diagnóstico salvo (${nome}, na pasta Downloads). Anexe esse arquivo num e-mail e envie para ${EMAIL_SUPORTE} que a gente analisa.`,
        [
          { label: "Abrir e-mail agora", value: "email", cls: "btn-primary" },
          { label: "Fechar", value: "fechar" },
        ]
      );
      if (v === "email") {
        const assunto = encodeURIComponent("Problema — Mentor Concurso (diagnóstico anexo)");
        const corpo = encodeURIComponent(
          "Descreva o que aconteceu e ANEXE o arquivo de diagnóstico que acabou de ser salvo na sua pasta Downloads.\n\n— O que você estava fazendo?\n— O que aconteceu?\n"
        );
        window.location.href = `mailto:${EMAIL_SUPORTE}?subject=${assunto}&body=${corpo}`;
      }
    },
    "set-tema": (el) => {
      store.setConfig({ tema: el.getAttribute("data-tema") });
    },
    "salvar-ia": () => {
      store.setConfig({
        iaProvider: root.querySelector("#cfg-ia").value,
        iaKey: root.querySelector("#cfg-key")?.value || "",
        iaKeyReserva: root.querySelector("#cfg-key2")?.value || "",
        iaModelo: root.querySelector("#cfg-modelo")?.value.trim() || "",
      });
      const conectada = store.iaDisponivel();
      toast(conectada ? "IA conectada" : "Configuração de IA salva.");
      app.refresh();
    },
    "testar-ia": async (el) => {
      // Usa os valores atuais do formulário (sem precisar salvar antes).
      const cfgTeste = {
        iaProvider: root.querySelector("#cfg-ia").value,
        iaKey: root.querySelector("#cfg-key")?.value || "",
        iaModelo: root.querySelector("#cfg-modelo")?.value.trim() || "",
      };
      const msg = root.querySelector("#ia-msg");
      const setMsg = (html, cor) => { if (msg) { msg.innerHTML = html; msg.style.color = cor || ""; } };
      if (!cfgTeste.iaKey.trim()) { setMsg("Cole a chave de API antes de testar.", "var(--danger)"); return; }
      el.disabled = true;
      const txtOrig = el.textContent;
      el.textContent = "Testando...";
      setMsg("Testando conexão (pode tentar alguns modelos)...");
      try {
        const { ok, modelo } = await testarConexao(cfgTeste);
        if (ok) {
          const campoModelo = root.querySelector("#cfg-modelo");
          const trocou = modelo && campoModelo && campoModelo.value.trim() !== modelo;
          if (modelo && campoModelo) campoModelo.value = modelo; // fixa o modelo que funcionou
          setMsg(
            ` Conexão OK com o modelo <b>${modelo || "padrão"}</b>.` +
              (trocou ? ` (ajustei o modelo para um que sua chave aceita.)` : "") +
              ` Clique em <b>Salvar IA</b> para ativar.`,
            "var(--success)"
          );
        } else {
          setMsg("Conectou, mas a resposta foi inesperada.", "var(--danger)");
        }
      } catch (e) {
        setMsg(`${icone("x")} Falha: ` + esc(e.message), "var(--danger)");
      } finally {
        el.disabled = false;
        el.textContent = txtOrig;
      }
    },
    "testar-alarme": () => {
      const v = root.querySelector("#cfg-alarme").value;
      setEstiloAlarme(v);
      tocarAlarmeTeste();
    },
    "add-atalho": () => {
      const nome = root.querySelector("#atl-nome").value.trim();
      const tipo = root.querySelector("#atl-tipo").value;
      const alvo = root.querySelector("#atl-alvo").value;
      const icone = root.querySelector("#atl-icone").value.trim() || "star";
      if (!nome) return toast("Dê um nome ao atalho.", "erro");
      if (!alvo) return toast("Escolha o destino.", "erro");
      // Atalhos sempre aparecem na barra lateral (a opção "Hoje" foi removida).
      store.addAtalho({ nome, tipo, alvo, icone, naNav: true, noHoje: false });
      toast("Atalho criado.");
    },
    "del-atalho": (el) => store.removerAtalho(el.getAttribute("data-id")),
    "atl-up": (el) => store.moverAtalho(el.getAttribute("data-id"), -1),
    "atl-down": (el) => store.moverAtalho(el.getAttribute("data-id"), 1),
    "nav-up": (el) => moverNav(store, el.getAttribute("data-id"), -1),
    "nav-down": (el) => moverNav(store, el.getAttribute("data-id"), 1),
    "atl-emoji": (el) => {
      const inp = root.querySelector("#atl-icone");
      if (inp) inp.value = el.getAttribute("data-emoji");
      // Destaca o ícone escolhido na paleta (sem re-render).
      root.querySelectorAll(".ico-btn.sel").forEach((b) => b.classList.remove("sel"));
      el.classList.add("sel");
    },
    "exportar-completo": () => exportarJSON(store.snapshotExport(true), "completo"),
    "exportar-compartilhavel": () => exportarJSON(store.snapshotExport(false), "compartilhavel"),
    reset: async () => {
      if (await confirmar("Isso apaga TODOS os dados (concurso, tópicos, questões, flashcards). Tem certeza?")) {
        await store.resetTudo();
        toast("Dados apagados. Recomeçando o onboarding.");
      }
    },
  });

  // Ao trocar o provedor, PERSISTE a escolha (e o que já foi digitado) antes de
  // re-renderizar. Sem isto, o re-render relê a config salva (offline) e o select
  // "voltava" para Offline, impedindo a seleção.
  // Atalhos: o destino depende do tipo escolhido.
  // Checkboxes "não definida": desabilitam (e zeram) os campos correspondentes.
  const ligarNaoDef = (chkSel, inputSels, vazio) => {
    root.querySelector(chkSel)?.addEventListener("change", (e) => {
      inputSels.forEach((s) => {
        const el = root.querySelector(s);
        if (el) { el.disabled = e.target.checked; if (e.target.checked) el.value = vazio; }
      });
    });
  };
  ligarNaoDef("#cfg-prova-pre", ["#cfg-prova"], "");
  ligarNaoDef("#cfg-meta-pre", ["#cfg-meta-dia-h", "#cfg-meta-dia-m", "#cfg-meta-sem-h", "#cfg-meta-sem-m", "#cfg-meta-mes-h", "#cfg-meta-mes-m"], "0");

  // ---------- Autosave (metas/prova, alarme, semáforo e concurso salvam on-change) ----------
  // setConfig() re-renderiza o app; quando o save dispara com o usuário ainda digitando,
  // preserva o foco, o valor bruto e o cursor do campo ativo através do re-render.
  const salvarPreservandoFoco = (fn) => {
    const ativo = document.activeElement;
    let guarda = null;
    if (ativo && root.contains(ativo) && ativo.id) {
      let caret = null;
      try { caret = typeof ativo.selectionStart === "number" ? ativo.selectionStart : null; } catch { /* type=number/date não expõe seleção */ }
      guarda = {
        id: ativo.id,
        // Só campos de texto recuperam o valor bruto digitado (preserva espaço no fim, etc.).
        // Nos numéricos o re-render já mostra o valor normalizado salvo (ex.: 90min -> 1h30).
        valor: ativo.tagName === "INPUT" && ativo.type === "text" ? ativo.value : null,
        caret,
      };
    }
    fn();
    if (!guarda) return;
    // O re-render acontece num microtask (agendarEmit do store); o timeout roda depois dele.
    setTimeout(() => {
      const el = document.getElementById(guarda.id);
      if (!el) return;
      el.focus();
      if (guarda.valor != null) el.value = guarda.valor;
      try { if (guarda.caret != null && typeof el.setSelectionRange === "function") el.setSelectionRange(guarda.caret, guarda.caret); } catch { /* idem */ }
    }, 0);
  };
  const debounce = (fn, ms) => {
    let t = null;
    return () => { clearTimeout(t); t = setTimeout(fn, ms); };
  };

  // Metas e prova: mesma lógica de parse (h/min -> minutos; NaN vira 0) do antigo "Salvar metas/prova".
  const salvarMetas = () => {
    if (!root.querySelector("#cfg-meta-pre")) return; // a tela mudou antes do debounce disparar
    const hm = (base) => {
      const h = Math.max(0, parseInt(root.querySelector(`#${base}-h`)?.value, 10) || 0);
      const m = Math.max(0, parseInt(root.querySelector(`#${base}-m`)?.value, 10) || 0);
      return h * 60 + m;
    };
    const metaPre = root.querySelector("#cfg-meta-pre").checked;
    const patch = {
      dataProva: root.querySelector("#cfg-prova-pre").checked ? null : (root.querySelector("#cfg-prova").value || null),
      metaDiariaMin: metaPre ? 0 : hm("cfg-meta-dia"),
      metaSemanalMin: metaPre ? 0 : hm("cfg-meta-sem"),
      metaMensalMin: metaPre ? 0 : hm("cfg-meta-mes"),
    };
    // Disponibilidade diária = meta diária (mesmo conceito); alimenta o Mentor.
    patch.dispDiariaMin = patch.metaDiariaMin;
    const atual = store.get().config;
    if (
      patch.dataProva === (atual.dataProva || null) &&
      patch.metaDiariaMin === (atual.metaDiariaMin || 0) &&
      patch.metaSemanalMin === (atual.metaSemanalMin || 0) &&
      patch.metaMensalMin === (atual.metaMensalMin || 0)
    ) return; // nada mudou (evita re-render e toast à toa)
    salvarPreservandoFoco(() => {
      store.setConfig(patch);
      toast("Salvo.");
    });
  };
  const salvarMetasDeb = debounce(salvarMetas, 500);
  ["cfg-meta-dia", "cfg-meta-sem", "cfg-meta-mes"].forEach((base) =>
    ["-h", "-m"].forEach((suf) => root.querySelector(`#${base}${suf}`)?.addEventListener("input", salvarMetasDeb))
  );
  root.querySelector("#cfg-prova")?.addEventListener("change", salvarMetas);
  // Checkboxes "sem data/meta": MARCAR limpa e salva na hora (o ligarNaoDef acima já zerou os
  // campos). DESMARCAR não salva nada (os dados continuam vazios): só libera os campos, e o
  // save acontece quando o usuário preencher a data/meta.
  const aoMudarPre = (e) => { if (e.target.checked) salvarMetas(); };
  root.querySelector("#cfg-prova-pre")?.addEventListener("change", aoMudarPre);
  root.querySelector("#cfg-meta-pre")?.addEventListener("change", aoMudarPre);

  // Som do alarme: select salva na hora (o "Testar" continua como botão).
  root.querySelector("#cfg-alarme")?.addEventListener("change", (e) => {
    const v = e.target.value;
    store.setConfig({ somAlarme: v });
    setEstiloAlarme(v);
    toast("Salvo.");
  });

  // Semáforo: mesma validação do antigo "Salvar limites" (NaN -> padrão, clamp 0-100,
  // "ruim" < "bom"). No meio da digitação (debounce), campo vazio só espera; no blur
  // (change), aplica o padrão como o handler antigo fazia.
  const salvarPerf = (aoSair) => {
    const inpRuim = root.querySelector("#cfg-perf-ruim");
    const inpBom = root.querySelector("#cfg-perf-bom");
    if (!inpRuim || !inpBom) return;
    let ruim = parseInt(inpRuim.value, 10);
    let bom = parseInt(inpBom.value, 10);
    if ((isNaN(ruim) || isNaN(bom)) && !aoSair) return;
    if (isNaN(ruim)) ruim = 60;
    if (isNaN(bom)) bom = 80;
    ruim = Math.max(0, Math.min(100, ruim));
    bom = Math.max(0, Math.min(100, bom));
    if (ruim >= bom) return toast('O limite "ruim" deve ser menor que o "bom".', "erro");
    const atual = store.get().config;
    if (ruim === Number(atual.perfRuim ?? 60) && bom === Number(atual.perfBom ?? 80)) return; // nada mudou
    salvarPreservandoFoco(() => {
      store.setConfig({ perfRuim: ruim, perfBom: bom });
      toast("Salvo.");
    });
  };
  const salvarPerfDeb = debounce(() => salvarPerf(false), 500);
  ["#cfg-perf-ruim", "#cfg-perf-bom"].forEach((sel) => {
    const el = root.querySelector(sel);
    el?.addEventListener("input", salvarPerfDeb);
    el?.addEventListener("change", () => salvarPerf(true));
  });

  // Concurso: cargo obrigatório (como no antigo "Salvar concurso") — sem cargo, o
  // debounce só espera; no blur, avisa.
  const salvarConc = (aoSair) => {
    const inpCargo = root.querySelector("#cfg-cargo");
    if (!inpCargo) return;
    const cargo = inpCargo.value.trim();
    const banca = root.querySelector("#cfg-banca")?.value.trim() || "";
    if (!cargo) { if (aoSair) toast("Informe o cargo.", "erro"); return; }
    const conc = store.get().concurso;
    if (!conc) return;
    if (conc.cargo === cargo && conc.banca === banca) return; // nada mudou
    salvarPreservandoFoco(() => {
      conc.cargo = cargo;
      conc.banca = banca;
      store.setConfig({}); // força persistência + re-render
      toast("Salvo.");
    });
  };
  const salvarConcDeb = debounce(() => salvarConc(false), 500);
  ["#cfg-cargo", "#cfg-banca"].forEach((sel) => {
    const el = root.querySelector(sel);
    el?.addEventListener("input", salvarConcDeb);
    el?.addEventListener("change", () => salvarConc(true));
  });

  root.querySelector("#atl-tipo")?.addEventListener("change", (e) => {
    root.querySelector("#atl-alvo").innerHTML = alvoOptions(e.target.value, store.get());
  });

  root.querySelectorAll("[data-bv]").forEach((el) =>
    el.addEventListener("change", () => store.setBotaoOculto(el.getAttribute("data-bv"), !el.checked))
  );

  // Dias de estudo: cada toggle marca/desmarca o dia como folga (mesmo dado do Planejamento).
  root.querySelectorAll("[data-dia-estudo]").forEach((el) =>
    el.addEventListener("change", () => {
      store.toggleDiaFolga(el.getAttribute("data-dia-estudo"));
      toast(el.checked ? "Dia marcado como estudo." : "Dia marcado como folga.");
      app.refresh();
    })
  );

  // Importar backup JSON (substitui tudo, com confirmação).
  const importEl = root.querySelector("#cfg-import");
  if (importEl) ligarDropZone(importEl);
  importEl?.addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const texto = await f.text();
      const obj = JSON.parse(texto);
      if (!(await confirmar("Importar este backup SUBSTITUI todos os dados atuais. Continuar?"))) {
        e.target.value = "";
        return;
      }
      await store.importarBackup(obj);
      toast("Backup importado com sucesso.");
    } catch (err) {
      toast("Falha ao importar: " + err.message, "erro");
    } finally {
      e.target.value = "";
    }
  });

  root.querySelector("#cfg-ia").addEventListener("change", (e) => {
    store.setConfig({
      iaProvider: e.target.value,
      iaKey: root.querySelector("#cfg-key")?.value || "",
      iaModelo: root.querySelector("#cfg-modelo")?.value.trim() || "",
    });
    app.refresh();
  });
}

// Emojis sugeridos para os atalhos (clique para preencher; ou digite o seu).
// Ícones de atalho = nomes Lucide (renderizados por icone()), coerentes com a barra lateral.
// (Antes era uma paleta de emojis coloridos que destoava dos ícones Lucide da navegação.)
const ICONES_ATALHO = ["star", "book-open", "pencil-line", "scroll-text", "scale", "file-text", "layers", "square-pen", "repeat-2", "flag", "target", "calendar-days", "refresh-cw", "lightbulb", "trending-up", "landmark", "clipboard-list", "clock-3"];

// Dias da semana (0=Dom ... 6=Sáb), coerente com store.diaEhFolga/toggleDiaFolga.
const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// Move o botão para cima/baixo DENTRO do seu grupo (troca com o vizinho do mesmo grupo).
function moverNav(store, id, dir) {
  const ordem = ordemNavEfetiva(store.get().config.ordemNav);
  const grupoDe = (x) => (NAV_ITENS.find((it) => it.id === x) || {}).grupo;
  const g = grupoDe(id);
  const mesmos = ordem.filter((x) => grupoDe(x) === g); // itens do mesmo grupo, na ordem atual
  const pos = mesmos.indexOf(id);
  const alvo = mesmos[pos + dir];
  if (!alvo) return;
  const i = ordem.indexOf(id);
  const j = ordem.indexOf(alvo);
  [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  store.setOrdemNav(ordem);
}

function rotaInfo(id) {
  return NAV_ITENS.find((x) => x.id === id);
}
function botaoLinha(it, opts = {}) {
  if (!it) return "";
  const { fixo, i, total, oculto } = opts;
  return `<div class="botao-linha ${fixo ? "bl-fixo" : ""}">
    <span class="bl-nome">${icone(it.icone)} ${esc(it.label)}${fixo ? ' <span class="muted small">(fixo)</span>' : ""}</span>
    <span class="spacer"></span>
    ${
      fixo
        ? ""
        : `<label class="inline small" title="Mostrar na barra"><input type="checkbox" data-bv="${it.id}" ${oculto ? "" : "checked"} /> visível</label>
           <button class="lnk" data-action="nav-up" data-id="${it.id}" ${i === 0 ? "disabled" : ""} data-tip="Subir" data-tip-pos="cima-dir">${icone("chevron-up")}</button>
           <button class="lnk" data-action="nav-down" data-id="${it.id}" ${i === total - 1 ? "disabled" : ""} data-tip="Descer" data-tip-pos="cima-dir">${icone("chevron-down")}</button>`
    }
  </div>`;
}

// Campo de tempo em horas + minutos (coerente com fmtMin do resto do app).
// Armazena/lê em minutos totais; idBase gera os ids "<idBase>-h" e "<idBase>-m".
function campoHM(idBase, totalMin, disabled) {
  const t = Math.max(0, totalMin || 0);
  const h = Math.floor(t / 60);
  const m = t % 60;
  const d = disabled ? "disabled" : "";
  return `<span class="hm-campo">
    <input id="${idBase}-h" type="number" min="0" value="${h}" ${d} /><span class="hm-sep">h</span>
    <input id="${idBase}-m" type="number" min="0" max="59" value="${m}" ${d} /><span class="hm-sep">min</span>
  </span>`;
}

function rotuloTipo(t) {
  return t === "disciplina" ? "disciplina" : t === "topico" ? "tópico" : t === "questoes" ? "questões" : t === "simulado" ? "simulado" : "tela";
}

// Opções de destino do atalho conforme o tipo.
function alvoOptions(tipo, st) {
  // Simulado: o usuário escolhe abrir o simulado de Questões (MC) ou de Questões Certo/Errado.
  if (tipo === "simulado") return `<option value="pratica">Simulado · Questões (múltipla escolha)</option><option value="pratica-ce">Simulado · Questões Certo/Errado</option>`;
  if (tipo === "disciplina")
    return st.disciplinas.map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("") || `<option value="">(sem disciplinas)</option>`;
  if (tipo === "topico" || tipo === "questoes")
    return (
      st.topicos
        .map((t) => {
          const d = st.disciplinas.find((x) => x.id === t.disciplinaId);
          return `<option value="${t.id}">${esc((d ? d.nome + " · " : "") + t.nome)}</option>`;
        })
        .join("") || `<option value="">(sem tópicos)</option>`
    );
  // tela
  return NAV_ITENS.map((it) => `<option value="${it.id}">${esc(it.label)}</option>`).join("");
}

function exportarJSON(state, sufixo) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mentor_concurso_backup${sufixo ? "_" + sufixo : ""}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(sufixo === "compartilhavel" ? "Backup compartilhável exportado (sem materiais)." : "Backup completo exportado (local).");
}
