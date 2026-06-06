// ==UserScript==
// @name         Renomear Ataques Cores ThePlaguePT
// @version      2.4.1
// @description  Botoes rapidos para renomear e colorir ataques recebidos no Tribal Wars.
// @author       ThePlaguePT
// @namespace    https://github.com/ThePlaguePT
// @match        https://*.tribalwars.com.pt/game.php?*
// @match        https://*.tribalwars.co.uk/game.php?*
// @grant        none
// @run-at       document-idle
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// ==/UserScript==

(() => {
    "use strict";

    const SCRIPT_ID = "renomear-ataques-cores-theplaguept";
    const STYLE_ID = `${SCRIPT_ID}-style`;
    const STORAGE_KEY = `${SCRIPT_ID}-config-v1`;
    const CONFIG_BUTTON_ID = `${SCRIPT_ID}-config-button`;
    const CONFIG_MODAL_ID = `${SCRIPT_ID}-config-modal`;

    const CONFIG_PADRAO = {
        tamanhoLetraPx: 8,
        tamanhoBotaoPx: 18,
        paddingHorizontalBotaoPx: 3,
        paginaDeAtaques: "coluna", // Modos: coluna, linha, nada
        mostrarBotoesNoMapa: false,
        intervaloFallbackMs: 2500,
        timeoutEdicaoMs: 1200,
        intervaloEsperaInputMs: 40,
        manterInfoAtacante: true,
        realcarTexto: true,
        realcarInformacoesTabela: true,
        ocultarBotoesApoios: true,
        ocultarBotoesAmigos: true,
        mostrarBotaoReset: true,
        botoesOcultos: [],
        tribosAliadasIds: [],
    };
    const CONFIG = {
        ...CONFIG_PADRAO,
        botoesOcultos: [...CONFIG_PADRAO.botoesOcultos],
        tribosAliadasIds: [...CONFIG_PADRAO.tribosAliadasIds],
    };

    const CORES = {
        red: { top: "#e20606", bottom: "#ff0000" },
        green: { top: "#31c908", bottom: "#228c05" },
        blue: { top: "#0d83dd", bottom: "#0860a3" },
        yellow: { top: "#ffd91c", bottom: "#e8c30d" },
        orange: { top: "#ef8b10", bottom: "#d3790a" },
        lblue: { top: "#22e5db", bottom: "#0cd3c9" },
        lime: { top: "#ffd400", bottom: "#ffd400" },
        white: { top: "#ffffff", bottom: "#dbdbdb" },
        black: { top: "#000000", bottom: "#000000" },
        gray: { top: "#adb6c6", bottom: "#828891" },
        dorange: { top: "#9232a8", bottom: "#9232a8" },
        dark: { top: "#40434e", bottom: "#40434e" },
        pink: { top: "#ffc0cb", bottom: "#ffc0cb" },
        brown: { top: "#892929", bottom: "#892929" },
        dblue: { top: "#00007f", bottom: "#00007f" },
        dgreen: { top: "#004c00", bottom: "#004c00" },
        lgreen: { top: "#93cf82", bottom: "#93cf82" },
    };

    const COMANDOS = [
        { tag: "[Morto]", label: "M", corBotao: "green", corTexto: "white", modo: "substituir" },
        { tag: "[Desviado]", label: "D!", corBotao: "orange", corTexto: "white", modo: "substituir" },
        { tag: "[Desviar]", label: "D", corBotao: "dorange", corTexto: "white", modo: "substituir" },
        { tag: "[Reconquistar]", label: "R", corBotao: "gray", corTexto: "white", modo: "substituir" },
        { tag: "[Reconquistado]", label: "RR", corBotao: "white", corTexto: "black", modo: "substituir" },
        { tag: "[Snipado]", label: "S!", corBotao: "lblue", corTexto: "white", modo: "substituir" },
        { tag: "[Snipar]", label: "S", corBotao: "blue", corTexto: "white", modo: "substituir" },
        { tag: "[Fubar]", label: "FU", corBotao: "dgreen", corTexto: "white", modo: "substituir" },
        { tag: "[Snipe Cancel]", label: "SC", corBotao: "red", corTexto: "white", modo: "substituir" },
        { tag: "[Fake]", label: "FA", corBotao: "pink", corTexto: "black", modo: "substituir" },
        {
            tag: "[Poss\u00edvel Full]",
            aliases: ["[Possivel Full]", "[Poss\u00c3\u00advel Full]"],
            label: "PV",
            corBotao: "dblue",
            corTexto: "white",
            modo: "substituir",
        },
        {
            tag: "[Refor\u00e7ar]",
            aliases: ["[Reforcar]", "[Refor\u00c3\u00a7ar]"],
            label: "RF",
            corBotao: "black",
            corTexto: "white",
            modo: "substituir",
        },
        { tag: " | Retirar", label: "R!", corBotao: "dgreen", corTexto: "white", modo: "acrescentar" },
        { tag: " | Vigiar", label: "V!", corBotao: "yellow", corTexto: "black", modo: "acrescentar" },
        {
            tag: " | \u2713",
            aliases: [" | \u00e2\u0153\u201c"],
            label: "\u2713",
            corBotao: "lgreen",
            corTexto: "black",
            modo: "acrescentar",
        },
    ];

    const SELETORES = {
        linhasAtaques: "#incomings_table tr",
        linhasComandos: "#commands_incomings .command-row, #commands_incomings tr, #commands_outgoings .command-row, #commands_outgoings tr, .command-row",
        quickedit: ".quickedit-content",
        etiquetaNome: ".quickedit-label",
        iconeRenomear: ".rename-icon",
        inputNome: 'input[type="text"]',
        areaEdicao: ".quickedit-edit",
        botoesGuardar: 'input[type="button"], input[type="submit"], button[type="submit"]',
        linkAldeia: 'a[href*="screen=info_village"]',
        linkJogador: 'a[href*="screen=info_player"]',
    };

    let execucaoAgendada = false;
    const mapasCabecalhoTabela = new WeakMap();
    const relacoesJogadores = new Map();
    let tribosAliadasCache = null;
    let tribosAliadasPromise = null;
    let configButtonPositionFrame = 0;

    function carregarConfiguracao() {
        try {
            const guardada = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            aplicarValoresConfiguracao(guardada);
        } catch (erro) {
            console.warn("[Renomear Ataques TP] Configuracao guardada invalida:", erro);
        }
    }

    function aplicarValoresConfiguracao(valores) {
        const booleanos = [
            "mostrarBotoesNoMapa",
            "manterInfoAtacante",
            "realcarTexto",
            "realcarInformacoesTabela",
            "ocultarBotoesApoios",
            "ocultarBotoesAmigos",
            "mostrarBotaoReset",
        ];

        booleanos.forEach((chave) => {
            if (typeof valores?.[chave] === "boolean") CONFIG[chave] = valores[chave];
        });

        if (["coluna", "linha", "nada"].includes(valores?.paginaDeAtaques)) {
            CONFIG.paginaDeAtaques = valores.paginaDeAtaques;
        }

        CONFIG.tamanhoLetraPx = limitarNumero(
            valores?.tamanhoLetraPx,
            4,
            14,
            CONFIG.tamanhoLetraPx,
        );
        CONFIG.tamanhoBotaoPx = limitarNumero(
            valores?.tamanhoBotaoPx,
            12,
            30,
            CONFIG.tamanhoBotaoPx,
        );
        CONFIG.paddingHorizontalBotaoPx = limitarNumero(
            valores?.paddingHorizontalBotaoPx,
            0,
            8,
            CONFIG.paddingHorizontalBotaoPx,
        );

        if (Array.isArray(valores?.tribosAliadasIds)) {
            CONFIG.tribosAliadasIds = [...new Set(
                valores.tribosAliadasIds
                    .map(Number)
                    .filter((id) => Number.isInteger(id) && id > 0),
            )];
        }

        if (Array.isArray(valores?.botoesOcultos)) {
            CONFIG.botoesOcultos = [...new Set(
                valores.botoesOcultos
                    .map(Number)
                    .filter((index) => Number.isInteger(index) && index >= 0 && index < COMANDOS.length),
            )];
        }
    }

    function guardarConfiguracao() {
        const valores = {
            tamanhoLetraPx: CONFIG.tamanhoLetraPx,
            tamanhoBotaoPx: CONFIG.tamanhoBotaoPx,
            paddingHorizontalBotaoPx: CONFIG.paddingHorizontalBotaoPx,
            paginaDeAtaques: CONFIG.paginaDeAtaques,
            mostrarBotoesNoMapa: CONFIG.mostrarBotoesNoMapa,
            manterInfoAtacante: CONFIG.manterInfoAtacante,
            realcarTexto: CONFIG.realcarTexto,
            realcarInformacoesTabela: CONFIG.realcarInformacoesTabela,
            ocultarBotoesApoios: CONFIG.ocultarBotoesApoios,
            ocultarBotoesAmigos: CONFIG.ocultarBotoesAmigos,
            mostrarBotaoReset: CONFIG.mostrarBotaoReset,
            botoesOcultos: [...CONFIG.botoesOcultos],
            tribosAliadasIds: [...CONFIG.tribosAliadasIds],
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(valores));
    }

    function limitarNumero(valor, minimo, maximo, fallback) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return fallback;

        return Math.min(maximo, Math.max(minimo, Math.round(numero)));
    }

    function iniciar() {
        if (!document.body) {
            setTimeout(iniciar, 100);
            return;
        }

        carregarConfiguracao();
        aplicarEstilos();
        criarBotaoConfiguracao();
        executar();

        const observer = new MutationObserver(agendarExecucao);
        observer.observe(document.body, { childList: true, subtree: true });

        window.addEventListener("resize", agendarPosicaoBotaoConfiguracao);
        window.addEventListener("orientationchange", agendarPosicaoBotaoConfiguracao);
        agendarPosicaoBotaoConfiguracao();
        setTimeout(agendarPosicaoBotaoConfiguracao, 250);
        setTimeout(agendarPosicaoBotaoConfiguracao, 1000);

        setInterval(executar, CONFIG.intervaloFallbackMs);
        console.log("[Renomear Ataques TP] Script carregado:", location.href);
    }

    function agendarExecucao() {
        if (execucaoAgendada) return;

        execucaoAgendada = true;
        requestAnimationFrame(() => {
            execucaoAgendada = false;
            executar();
            agendarPosicaoBotaoConfiguracao();
        });
    }

    function criarBotaoConfiguracao() {
        if (document.getElementById(CONFIG_BUTTON_ID)) return;

        const botao = document.createElement("button");
        botao.id = CONFIG_BUTTON_ID;
        botao.type = "button";
        botao.className = "ra-tp-config-button";
        botao.title = "Configurar Renomear Ataques";
        botao.setAttribute("aria-label", "Configurar Renomear Ataques");
        botao.textContent = "\u2699";
        botao.addEventListener("click", abrirPainelConfiguracao);

        document.body.appendChild(botao);
        criarModalConfiguracao();
        agendarPosicaoBotaoConfiguracao();
    }

    function agendarPosicaoBotaoConfiguracao() {
        if (configButtonPositionFrame) cancelAnimationFrame(configButtonPositionFrame);

        configButtonPositionFrame = requestAnimationFrame(() => {
            configButtonPositionFrame = 0;
            posicionarBotaoConfiguracao();
        });
    }

    function posicionarBotaoConfiguracao() {
        const botao = document.getElementById(CONFIG_BUTTON_ID);
        if (!botao) return;

        const layout =
            document.querySelector("#main_layout td.maincell")
            || document.querySelector("td.maincell")
            || document.querySelector("#contentContainer")
            || document.querySelector("#content_value");
        const barraAldeia =
            document.querySelector("#header_info")
            || document.querySelector("#menu_row2");

        let left = 12;
        let top = 104;

        if (layout) {
            const rectLayout = layout.getBoundingClientRect();
            if (rectLayout.width > 0) left = Math.max(4, Math.round(rectLayout.left - 55));
        }

        if (barraAldeia) {
            const rectBarra = barraAldeia.getBoundingClientRect();
            if (rectBarra.height > 0) {
                top = Math.max(4, Math.round(rectBarra.top + ((rectBarra.height - 28) / 2)));
            }
        }

        const launchers = obterLaunchersLaterais(botao, left);
        if (launchers.length) {
            const ultimo = launchers.reduce((atual, rect) => rect.bottom > atual.bottom ? rect : atual);
            left = Math.max(4, Math.round(ultimo.left));
            top = Math.max(4, Math.round(ultimo.bottom + 5));
        }

        botao.style.setProperty("left", `${left}px`, "important");
        botao.style.setProperty("right", "auto", "important");
        botao.style.setProperty("top", `${top}px`, "important");
        botao.style.setProperty("bottom", "auto", "important");
    }

    function obterLaunchersLaterais(botaoAtual, leftEsperado) {
        const seletoresConhecidos = [
            "#tpDefLauncher",
            "#tw-discord-alerts-ui",
            "#tw-discord-alerts-toggle",
            "#tpconq-launcher",
            "#tpTwHub-launcher",
            "[id$='-launcher']",
            "[class*='quickbar']",
        ];
        const candidatos = new Set(
            seletoresConhecidos.flatMap((seletor) => [...document.querySelectorAll(seletor)]),
        );

        document.querySelectorAll("body > button, body > a, body > div").forEach((elemento) => {
            candidatos.add(elemento);
        });

        return [...candidatos]
            .filter((elemento) => elemento !== botaoAtual && !elemento.closest(`#${CONFIG_MODAL_ID}`))
            .filter((elemento) => getComputedStyle(elemento).position === "fixed")
            .map((elemento) => elemento.getBoundingClientRect())
            .filter((rect) => (
                rect.width > 0
                && rect.height > 0
                && rect.height <= 60
                && rect.top >= 0
                && rect.bottom <= window.innerHeight
                && Math.abs(rect.left - leftEsperado) <= 12
            ));
    }

    function criarModalConfiguracao() {
        if (document.getElementById(CONFIG_MODAL_ID)) return;

        const modal = document.createElement("div");
        modal.id = CONFIG_MODAL_ID;
        modal.className = "ra-tp-config-overlay";
        modal.hidden = true;
        modal.innerHTML = `
            <div class="ra-tp-config-dialog" role="dialog" aria-modal="true" aria-labelledby="${SCRIPT_ID}-config-title">
                <div class="ra-tp-config-header">
                    <strong id="${SCRIPT_ID}-config-title">Renomear Ataques</strong>
                    <button type="button" class="ra-tp-config-close" data-ra-config-action="fechar" aria-label="Fechar">&times;</button>
                </div>
                <div class="ra-tp-config-body">
                    <section class="ra-tp-config-section">
                        <h3>Aparencia</h3>
                        <label class="ra-tp-config-field">
                            <span>Pintura dos ataques</span>
                            <select id="${SCRIPT_ID}-config-pagina">
                                <option value="coluna">Coluna do comando</option>
                                <option value="linha">Linha completa</option>
                                <option value="nada">Sem fundo</option>
                            </select>
                        </label>
                        <label class="ra-tp-config-field">
                            <span>Tamanho da letra</span>
                            <input id="${SCRIPT_ID}-config-letra" type="number" min="4" max="14" step="1">
                        </label>
                        <label class="ra-tp-config-field">
                            <span>Tamanho do botao</span>
                            <input id="${SCRIPT_ID}-config-botao" type="number" min="12" max="30" step="1">
                        </label>
                        <label class="ra-tp-config-field">
                            <span>Espaco lateral</span>
                            <input id="${SCRIPT_ID}-config-padding" type="number" min="0" max="8" step="1">
                        </label>
                    </section>
                    <section class="ra-tp-config-section">
                        <h3>Conteudo</h3>
                        ${criarToggleConfigHtml("info-atacante", "Manter atacante e origem")}
                        ${criarToggleConfigHtml("realce-texto", "Realcar texto do comando")}
                        ${criarToggleConfigHtml("realce-tabela", "Realcar informacoes da tabela")}
                    </section>
                    <section class="ra-tp-config-section">
                        <h3>Botoes</h3>
                        <div id="${SCRIPT_ID}-config-comandos" class="ra-tp-config-command-list">
                            ${criarListaBotoesConfigHtml()}
                        </div>
                        ${criarToggleConfigHtml("botao-reset", "Mostrar botao RS")}
                        ${criarToggleConfigHtml("botoes-mapa", "Mostrar botoes no mapa")}
                        ${criarToggleConfigHtml("ocultar-apoios", "Ocultar botoes em apoios")}
                        ${criarToggleConfigHtml("ocultar-amigos", "Ocultar botoes em aliados e mesma tribo")}
                        <label class="ra-tp-config-field ra-tp-config-field-wide">
                            <span>IDs adicionais de tribos aliadas</span>
                            <input id="${SCRIPT_ID}-config-aliados" type="text" placeholder="123, 456">
                        </label>
                    </section>
                </div>
                <div class="ra-tp-config-footer">
                    <button type="button" class="ra-tp-config-secondary" data-ra-config-action="restaurar">Predefinicoes</button>
                    <span class="ra-tp-config-spacer"></span>
                    <button type="button" class="ra-tp-config-secondary" data-ra-config-action="fechar">Cancelar</button>
                    <button type="button" class="ra-tp-config-primary" data-ra-config-action="guardar">Guardar</button>
                </div>
            </div>
        `;

        modal.addEventListener("click", (evento) => {
            const acao = evento.target.closest("[data-ra-config-action]")?.dataset.raConfigAction;

            if (acao === "fechar") fecharPainelConfiguracao();
            if (acao === "restaurar") preencherFormularioConfiguracao(CONFIG_PADRAO);
            if (acao === "guardar") guardarFormularioConfiguracao();
            if (evento.target === modal) fecharPainelConfiguracao();
        });

        document.addEventListener("keydown", (evento) => {
            if (evento.key === "Escape" && !modal.hidden) fecharPainelConfiguracao();
        });

        document.body.appendChild(modal);
    }

    function criarListaBotoesConfigHtml() {
        return COMANDOS.map((comando, index) => `
            <label class="ra-tp-config-command">
                <input type="checkbox" data-ra-config-command="${index}">
                <span>${escapeHtml(comando.label)} - ${escapeHtml(comando.tag.trim())}</span>
            </label>
        `).join("");
    }

    function escapeHtml(valor) {
        return String(valor || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function criarToggleConfigHtml(sufixo, label) {
        return `
            <label class="ra-tp-config-toggle">
                <input id="${SCRIPT_ID}-config-${sufixo}" type="checkbox">
                <span>${label}</span>
            </label>
        `;
    }

    function abrirPainelConfiguracao() {
        const modal = document.getElementById(CONFIG_MODAL_ID);
        if (!modal) return;

        preencherFormularioConfiguracao(CONFIG);
        modal.hidden = false;
        modal.querySelector("select, input, button")?.focus();
    }

    function fecharPainelConfiguracao() {
        const modal = document.getElementById(CONFIG_MODAL_ID);
        if (modal) modal.hidden = true;
    }

    function preencherFormularioConfiguracao(valores) {
        obterCampoConfig("pagina").value = valores.paginaDeAtaques;
        obterCampoConfig("letra").value = valores.tamanhoLetraPx;
        obterCampoConfig("botao").value = valores.tamanhoBotaoPx;
        obterCampoConfig("padding").value = valores.paddingHorizontalBotaoPx;
        obterCampoConfig("info-atacante").checked = valores.manterInfoAtacante;
        obterCampoConfig("realce-texto").checked = valores.realcarTexto;
        obterCampoConfig("realce-tabela").checked = valores.realcarInformacoesTabela;
        obterCampoConfig("botao-reset").checked = valores.mostrarBotaoReset;
        obterCampoConfig("botoes-mapa").checked = valores.mostrarBotoesNoMapa;
        obterCampoConfig("ocultar-apoios").checked = valores.ocultarBotoesApoios;
        obterCampoConfig("ocultar-amigos").checked = valores.ocultarBotoesAmigos;
        obterCampoConfig("aliados").value = (valores.tribosAliadasIds || []).join(", ");

        document.querySelectorAll("[data-ra-config-command]").forEach((checkbox) => {
            checkbox.checked = !(valores.botoesOcultos || []).includes(Number(checkbox.dataset.raConfigCommand));
        });
    }

    function guardarFormularioConfiguracao() {
        const valores = {
            paginaDeAtaques: obterCampoConfig("pagina").value,
            tamanhoLetraPx: obterCampoConfig("letra").value,
            tamanhoBotaoPx: obterCampoConfig("botao").value,
            paddingHorizontalBotaoPx: obterCampoConfig("padding").value,
            manterInfoAtacante: obterCampoConfig("info-atacante").checked,
            realcarTexto: obterCampoConfig("realce-texto").checked,
            realcarInformacoesTabela: obterCampoConfig("realce-tabela").checked,
            mostrarBotaoReset: obterCampoConfig("botao-reset").checked,
            mostrarBotoesNoMapa: obterCampoConfig("botoes-mapa").checked,
            ocultarBotoesApoios: obterCampoConfig("ocultar-apoios").checked,
            ocultarBotoesAmigos: obterCampoConfig("ocultar-amigos").checked,
            botoesOcultos: [...document.querySelectorAll("[data-ra-config-command]")]
                .filter((checkbox) => !checkbox.checked)
                .map((checkbox) => Number(checkbox.dataset.raConfigCommand)),
            tribosAliadasIds: obterCampoConfig("aliados").value
                .split(/[\s,;]+/)
                .filter(Boolean)
                .map(Number),
        };

        aplicarValoresConfiguracao(valores);
        guardarConfiguracao();
        reiniciarCachesRelacoes();
        aplicarConfiguracaoNaPagina();
        fecharPainelConfiguracao();
    }

    function obterCampoConfig(sufixo) {
        return document.getElementById(`${SCRIPT_ID}-config-${sufixo}`);
    }

    function reiniciarCachesRelacoes() {
        relacoesJogadores.clear();
        tribosAliadasCache = null;
        tribosAliadasPromise = null;
    }

    function aplicarConfiguracaoNaPagina() {
        aplicarEstilos();

        obterLinhasValidas().forEach((linha) => {
            removerBotoes(linha);
            limparPintura(linha);
            restaurarTextoSemRealce(linha);
            limparRealceInformacoesLinha(linha);
        });

        executar();
    }

    function restaurarTextoSemRealce(linha) {
        const label = linha.querySelector(SELETORES.etiquetaNome);
        if (!label) return;

        const texto = normalizarEspacos(label.textContent);
        label.textContent = texto;
        delete label.dataset.raTpRealceTexto;
        delete label.dataset.raTpRealceEscuro;
    }

    function limparRealceInformacoesLinha(linha) {
        linha.querySelectorAll("[data-ra-tp-info-realce]").forEach((celula) => {
            celula.style.removeProperty("color");
            celula.style.removeProperty("font-weight");
            celula.style.removeProperty("text-shadow");
            delete celula.dataset.raTpInfoRealce;
        });

        linha.querySelectorAll("[data-ra-tp-info-elemento]").forEach((elemento) => {
            elemento.style.removeProperty("color");
            elemento.style.removeProperty("font-weight");
            elemento.style.removeProperty("text-shadow");
            delete elemento.dataset.raTpInfoElemento;
        });
    }

    function executar() {
        const contexto = obterContextoPagina();
        const linhas = obterLinhasValidas();

        linhas.forEach((linha) => {
            const relacaoAmigavel = obterRelacaoAmigavelSincrona(linha);
            const ocultarNoMapa = contexto.isMapa && !CONFIG.mostrarBotoesNoMapa;
            const ocultarApoio = CONFIG.ocultarBotoesApoios && isApoio(linha);

            if (ocultarNoMapa || ocultarApoio || relacaoAmigavel === true) {
                removerBotoes(linha);
            } else if (relacaoAmigavel === null) {
                removerBotoes(linha);
                void verificarRelacaoAmigavel(linha);
            } else {
                inserirBotoes(linha);
            }

            aplicarCorAtaque(linha);
            realcarTextoLinha(linha);
            realcarInformacoesLinha(linha);
        });

        agendarPosicaoBotaoConfiguracao();
    }

    function obterContextoPagina() {
        const params = new URLSearchParams(location.search);
        const screen = params.get("screen") || "";

        return {
            isMapa: screen === "map" || location.href.includes("screen=map"),
        };
    }

    function obterLinhasValidas() {
        const linhas = [
            ...document.querySelectorAll(SELETORES.linhasAtaques),
            ...document.querySelectorAll(SELETORES.linhasComandos),
        ];

        return [...new Set(linhas)].filter((linha) => (
            linha.querySelector(SELETORES.etiquetaNome)
            && linha.querySelector(SELETORES.iconeRenomear)
        ));
    }

    function obterRelacaoAmigavelSincrona(linha) {
        if (!CONFIG.ocultarBotoesAmigos) return false;

        const linkJogador = obterLinkJogadorAtacante(linha);
        const jogadorId = obterIdDeLink(linkJogador);
        const jogadorAtualId = obterJogadorAtualId();

        if (jogadorId && jogadorAtualId && jogadorId === jogadorAtualId) return false;
        if (temMarcadorRelacaoAmigavel(linha, linkJogador)) return true;

        const triboId = obterTriboIdDaLinha(linha, linkJogador);
        const triboAtualId = obterTriboAtualId();

        if (triboId && triboAtualId && triboId === triboAtualId) return true;
        if (triboId && tribosAliadasCache?.has(triboId)) return true;

        if (jogadorId) {
            const estado = relacoesJogadores.get(jogadorId);
            if (estado === true || estado === false) return estado;
            return null;
        }

        if (triboId && tribosAliadasCache === null) return null;
        return false;
    }

    async function verificarRelacaoAmigavel(linha) {
        if (!CONFIG.ocultarBotoesAmigos || !linha.isConnected) return;

        const linkJogador = obterLinkJogadorAtacante(linha);
        const jogadorId = obterIdDeLink(linkJogador);
        const jogadorAtualId = obterJogadorAtualId();
        const triboIdDireta = obterTriboIdDaLinha(linha, linkJogador);

        if (jogadorId && jogadorAtualId && jogadorId === jogadorAtualId) {
            relacoesJogadores.set(jogadorId, false);
            return;
        }

        if (jogadorId && relacoesJogadores.get(jogadorId) === "pending") return;
        if (jogadorId) relacoesJogadores.set(jogadorId, "pending");

        try {
            let triboId = triboIdDireta;

            if (!triboId && linkJogador?.href) {
                triboId = await obterTriboIdDoPerfil(linkJogador.href);
            }

            const amigavel = triboId ? await isTriboAmiga(triboId) : false;
            if (jogadorId) relacoesJogadores.set(jogadorId, amigavel);
        } catch (erro) {
            if (jogadorId) relacoesJogadores.set(jogadorId, false);
            console.warn("[Renomear Ataques TP] Falha ao verificar relacao:", erro);
        } finally {
            agendarExecucao();
        }
    }

    function temMarcadorRelacaoAmigavel(linha, linkJogador) {
        const elementos = [linha, linkJogador, linkJogador?.closest("td")].filter(Boolean);
        const textoTecnico = elementos.map((elemento) => [
            elemento.className || "",
            elemento.getAttribute?.("title") || "",
            elemento.getAttribute?.("data-relation") || "",
            elemento.getAttribute?.("data-diplomacy") || "",
            elemento.getAttribute?.("data-status") || "",
        ].join(" ")).join(" ");
        const normalizado = normalizarSemAcentos(textoTecnico);

        return /(^|[\s_-])(ally|allied|friend|friendly|same[_-]?tribe|tribe[_-]?member|aliad[oa]s?|amig[oa]s?)(?=$|[\s_-])/.test(normalizado);
    }

    function obterTriboIdDaLinha(linha, linkJogador) {
        const celulaJogador = linkJogador?.closest("td");
        const linkTribo = celulaJogador?.querySelector('a[href*="screen=info_ally"][href*="id="]');
        const idDoLink = obterIdDeLink(linkTribo);
        if (idDoLink) return idDoLink;

        const elementos = [linkJogador, celulaJogador, linha].filter(Boolean);
        for (const elemento of elementos) {
            const candidatos = [
                elemento.getAttribute?.("data-ally-id"),
                elemento.getAttribute?.("data-tribe-id"),
                elemento.getAttribute?.("data-ally"),
            ];

            const id = candidatos.map(Number).find((valor) => Number.isInteger(valor) && valor > 0);
            if (id) return id;
        }

        return 0;
    }

    async function obterTriboIdDoPerfil(urlPerfil) {
        const resposta = await fetch(urlPerfil, { credentials: "same-origin" });
        if (!resposta.ok) throw new Error(`Perfil HTTP ${resposta.status}`);

        const html = await resposta.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const linkTribo = doc.querySelector('a[href*="screen=info_ally"][href*="id="]');

        return obterIdDeLink(linkTribo);
    }

    async function isTriboAmiga(triboId) {
        const triboAtualId = obterTriboAtualId();
        if (triboAtualId && triboId === triboAtualId) return true;

        const tribosAliadas = await obterTribosAliadas();
        return tribosAliadas.has(triboId);
    }

    function obterTribosAliadas() {
        if (tribosAliadasCache) return Promise.resolve(tribosAliadasCache);
        if (tribosAliadasPromise) return tribosAliadasPromise;

        tribosAliadasPromise = carregarTribosAliadas()
            .then((ids) => {
                tribosAliadasCache = ids;
                return ids;
            })
            .catch((erro) => {
                console.warn("[Renomear Ataques TP] Falha ao carregar aliados:", erro);
                tribosAliadasCache = criarSetTribosConfiguradas();
                return tribosAliadasCache;
            })
            .finally(() => {
                tribosAliadasPromise = null;
            });

        return tribosAliadasPromise;
    }

    async function carregarTribosAliadas() {
        const ids = criarSetTribosConfiguradas();
        if (!obterTriboAtualId()) return ids;

        const resposta = await fetch(criarUrlRelacoesTribo(), { credentials: "same-origin" });
        if (!resposta.ok) throw new Error(`Relacoes HTTP ${resposta.status}`);

        const html = await resposta.text();
        const doc = new DOMParser().parseFromString(html, "text/html");

        doc.querySelectorAll([
            '[data-relation="ally"] a[href*="screen=info_ally"]',
            '[data-relation="allied"] a[href*="screen=info_ally"]',
            ".relation-ally a[href*='screen=info_ally']",
            ".relation_allied a[href*='screen=info_ally']",
            "tr.ally a[href*='screen=info_ally']",
            "tr.allied a[href*='screen=info_ally']",
        ].join(",")).forEach((link) => adicionarIdTribo(ids, link));

        doc.querySelectorAll('a[href*="screen=info_ally"][href*="id="]').forEach((link) => {
            const contexto = obterContextoDiplomacia(link);
            const isAliado = /\b(aliad[oa]s?|ally|allies|allied)\b/.test(contexto);
            const isOutraRelacao = /\b(inimig[oa]s?|enemy|enemies|nap|pna|neutral)\b/.test(contexto);

            if (isAliado && !isOutraRelacao) adicionarIdTribo(ids, link);
        });

        return ids;
    }

    function criarSetTribosConfiguradas() {
        return new Set(
            CONFIG.tribosAliadasIds
                .map(Number)
                .filter((id) => Number.isInteger(id) && id > 0),
        );
    }

    function obterContextoDiplomacia(link) {
        const partes = [];
        const linha = link.closest("tr, li");
        const container = linha?.closest("table, ul, ol, section, div");

        [link, linha, container].filter(Boolean).forEach((elemento) => {
            partes.push(elemento.className || "");
            partes.push(elemento.getAttribute?.("data-relation") || "");
            partes.push(elemento.getAttribute?.("title") || "");
        });

        if (linha) {
            partes.push(linha.textContent || "");
            let anterior = linha.previousElementSibling;

            for (let i = 0; anterior && i < 5; i += 1) {
                const texto = anterior.textContent || "";
                partes.push(texto);
                if (/\b(aliad|all(?:y|ies|ied)|inimig|enem|nap|pna)\b/i.test(normalizarSemAcentos(texto))) break;
                anterior = anterior.previousElementSibling;
            }
        }

        if (container) {
            partes.push(container.querySelector("caption, thead, h2, h3, h4")?.textContent || "");
            partes.push(container.previousElementSibling?.textContent || "");
        }

        return normalizarSemAcentos(partes.join(" "));
    }

    function adicionarIdTribo(set, link) {
        const id = obterIdDeLink(link);
        if (id) set.add(id);
    }

    function obterIdDeLink(link) {
        if (!link?.href) return 0;

        try {
            return Number(new URL(link.href, location.href).searchParams.get("id")) || 0;
        } catch {
            return 0;
        }
    }

    function obterGameDataSeguro() {
        try {
            return window.TribalWars?.getGameData?.() || window.game_data || {};
        } catch {
            return window.game_data || {};
        }
    }

    function obterJogadorAtualId() {
        return Number(obterGameDataSeguro().player?.id) || 0;
    }

    function obterTriboAtualId() {
        return Number(obterGameDataSeguro().player?.ally) || 0;
    }

    function criarUrlRelacoesTribo() {
        const gameData = obterGameDataSeguro();
        const url = new URL(location.href);

        url.search = "";
        if (gameData.village?.id) url.searchParams.set("village", gameData.village.id);
        url.searchParams.set("screen", "ally");
        url.searchParams.set("mode", "relations");

        return url.href;
    }

    function inserirBotoes(linha) {
        const containerDestino = obterContainerBotoes(linha);
        if (!containerDestino || linha.querySelector(".ra-tp-botoes")) return;

        const container = document.createElement("span");
        container.className = "ra-tp-botoes";

        COMANDOS.forEach((comando, index) => {
            if (!comando.tag || !comando.label || CONFIG.botoesOcultos.includes(index)) return;

            const botao = criarBotao(comando.label, comando.tag.trim(), comando.corBotao, comando.corTexto);
            botao.dataset.comandoIndex = String(index);
            botao.addEventListener("click", (evento) => {
                evento.preventDefault();
                evento.stopPropagation();
                editarNomeLinha(linha, (valorAtual) => construirNome(valorAtual, comando, linha));
            });

            container.appendChild(botao);
        });

        if (CONFIG.mostrarBotaoReset) {
            const reset = criarBotao("RS", "Resetar etiquetas", "dark", "white");
            reset.classList.add("ra-tp-reset");
            reset.addEventListener("click", (evento) => {
                evento.preventDefault();
                evento.stopPropagation();
                editarNomeLinha(linha, (valorAtual) => limparEtiquetas(valorAtual, linha));
            });
            container.appendChild(reset);
        }

        if (container.childElementCount) containerDestino.appendChild(container);
    }

    function obterContainerBotoes(linha) {
        const quickedit = linha.querySelector(SELETORES.quickedit);
        if (quickedit) return quickedit;

        const label = linha.querySelector(SELETORES.etiquetaNome);
        return label?.closest("td") || label?.parentElement || null;
    }

    function criarBotao(label, titulo, corBotao, corTexto) {
        const botao = document.createElement("button");
        const background = obterCor(corBotao, "brown");
        const texto = obterCor(corTexto, "white");

        botao.type = "button";
        botao.className = "btn ra-tp-botao";
        if (isCorEscura(corBotao)) {
            botao.classList.add("ra-tp-botao-escuro");
            botao.style.setProperty("border-color", "rgba(255, 255, 255, 0.98)", "important");
            botao.style.setProperty("outline", "1px solid rgba(255, 255, 255, 0.85)");
        }
        botao.title = titulo;
        botao.textContent = label;
        botao.style.setProperty("font-size", `${CONFIG.tamanhoLetraPx || 12}px`, "important");
        botao.style.color = texto.top;
        botao.style.background = `linear-gradient(to bottom, ${background.top} 35%, ${background.bottom} 100%)`;

        return botao;
    }

    function isCorEscura(nomeCor) {
        return ["black", "dark"].includes(String(nomeCor || "").toLowerCase());
    }

    async function editarNomeLinha(linha, transformarNome) {
        if (linha.dataset.raTpEditando === "1") return;

        linha.dataset.raTpEditando = "1";

        try {
            const icone = linha.querySelector(SELETORES.iconeRenomear);
            if (!icone) return;

            icone.click();

            const input = await esperarPor(
                () => linha.querySelector(SELETORES.inputNome),
                CONFIG.timeoutEdicaoMs,
                CONFIG.intervaloEsperaInputMs,
            );

            if (!input) return;

            const novoNome = transformarNome(input.value);

            const botaoGuardar = obterBotaoGuardar(linha, input);
            if (novoNome !== input.value) {
                input.value = novoNome;
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
            }

            if (botaoGuardar) {
                botaoGuardar.click();
            } else if (input.form && typeof input.form.requestSubmit === "function") {
                input.form.requestSubmit();
            }

            refrescarLinhaDepois(linha);
        } finally {
            setTimeout(() => {
                delete linha.dataset.raTpEditando;
            }, 500);
        }
    }

    function obterBotaoGuardar(linha, input) {
        const areaEdicao = input.closest(SELETORES.areaEdicao);
        if (areaEdicao) {
            const botao = areaEdicao.querySelector(SELETORES.botoesGuardar);
            if (botao) return botao;
        }

        return linha.querySelector(`${SELETORES.areaEdicao} ${SELETORES.botoesGuardar}`);
    }

    function refrescarLinhaDepois(linha) {
        [250, 900].forEach((atraso) => {
            setTimeout(() => {
                limparRealceTextoLinha(linha);
                removerBotoes(linha);
                inserirBotoes(linha);
                aplicarCorAtaque(linha);
                realcarTextoLinha(linha);
                realcarInformacoesLinha(linha);
            }, atraso);
        });
    }

    function construirNome(valorAtual, comando, linha) {
        const sufixoInfo = obterSufixoInfoParaNome(valorAtual, linha);
        const atual = prepararNomeParaInfoAtacante(valorAtual, sufixoInfo);

        if (comando.modo === "acrescentar") {
            if (comandoExisteNoNome(atual, comando)) return aplicarInfoAtacanteComSufixo(atual, sufixoInfo);
            return aplicarInfoAtacanteComSufixo(`${atual}${comando.tag}`, sufixoInfo);
        }

        const sufixosAtivos = COMANDOS
            .filter((item) => item.modo === "acrescentar" && comandoExisteNoNome(atual, item))
            .map((item) => item.tag)
            .join("");
        const base = removerTags(atual, () => true);

        return aplicarInfoAtacanteComSufixo(`${base} ${comando.tag}${sufixosAtivos}`, sufixoInfo);
    }

    function limparEtiquetas(valorAtual, linha) {
        const sufixoInfo = obterSufixoInfoParaNome(valorAtual, linha);
        const atual = prepararNomeParaInfoAtacante(valorAtual, sufixoInfo);
        const limpo = removerTags(atual, () => true);

        return aplicarInfoAtacanteComSufixo(normalizarEspacos(limpo) || "Ataque", sufixoInfo);
    }

    function prepararNomeParaInfoAtacante(nome, sufixoInfo) {
        const normalizado = normalizarEspacos(nome);
        if (!sufixoInfo) return normalizado;

        return removerInfoAtacanteAuto(normalizado);
    }

    function aplicarInfoAtacante(nome, linha) {
        return aplicarInfoAtacanteComSufixo(nome, construirSufixoInfoAtacante(linha));
    }

    function aplicarInfoAtacanteComSufixo(nome, sufixoInfo) {
        const base = normalizarEspacos(nome);
        if (!sufixoInfo) return base;

        return normalizarEspacos(`${removerInfoAtacanteAuto(base)}${sufixoInfo}`);
    }

    function obterSufixoInfoParaNome(nome, linha) {
        return construirSufixoInfoAtacante(linha) || extrairSufixoInfoAtacanteDoNome(nome);
    }

    function construirSufixoInfoAtacante(linha) {
        if (!CONFIG.manterInfoAtacante) return "";

        const info = obterInfoAtacante(linha);
        const partes = [];

        if (info.jogador) partes.push(`Atacante: ${info.jogador}`);
        if (info.aldeia) partes.push(`Origem: ${info.aldeia}`);

        return partes.length ? ` / ${partes.join(" / ")}` : "";
    }

    function extrairSufixoInfoAtacanteDoNome(nome) {
        const match = String(nome || "").match(/\s*(?:\||\/)\s*(?:Atacante|Origem):\s*.*$/i);
        if (!match) return "";

        return normalizarEspacos(match[0]).replace(/^\|\s*/, "/ ");
    }

    function removerInfoAtacanteAuto(nome) {
        return normalizarEspacos(
            String(nome || "")
                .replace(/\s*(?:\||\/)\s*Atacante:\s*.*?(?=\s*(?:\||\/)\s*(?:Atacante|Origem):|$)/gi, "")
                .replace(/\s*(?:\||\/)\s*Origem:\s*.*$/gi, ""),
        );
    }

    function obterInfoAtacante(linha) {
        return {
            jogador: obterTextoLink(obterLinkJogadorAtacante(linha)),
            aldeia: obterTextoLink(obterLinkAldeiaOrigem(linha)),
        };
    }

    function obterLinkJogadorAtacante(linha) {
        const celulaPreferida = linha.children[3];
        const linkPreferido = celulaPreferida?.querySelector(SELETORES.linkJogador);
        if (linkPreferido) return linkPreferido;

        return [...linha.querySelectorAll(SELETORES.linkJogador)]
            .find((link) => !link.closest(SELETORES.quickedit)) || null;
    }

    function obterLinkAldeiaOrigem(linha) {
        const celulaPreferida = linha.children[2];
        const linkPreferido = celulaPreferida?.querySelector(SELETORES.linkAldeia);
        if (linkPreferido) return linkPreferido;

        const linksAldeia = [...linha.querySelectorAll(SELETORES.linkAldeia)]
            .filter((link) => !link.closest(SELETORES.quickedit));
        const linksComCoordenadas = linksAldeia.filter((link) => /\b\d{3}\|\d{3}\b/.test(obterTextoLink(link)));

        if (linksComCoordenadas.length > 1) return linksComCoordenadas[1];
        if (linksComCoordenadas.length === 1) return linksComCoordenadas[0];

        return linksAldeia[1] || linksAldeia[0] || null;
    }

    function obterTextoLink(link) {
        return normalizarEspacos(link?.textContent || "");
    }

    function realcarTextoLinha(linha) {
        if (!CONFIG.realcarTexto) return;

        const label = linha.querySelector(SELETORES.etiquetaNome);
        if (!label) return;

        const texto = normalizarEspacos(label.textContent);
        const linhaEscura = linha.dataset.raTpLinhaEscura === "1";
        if (
            !texto
            || (
                label.dataset.raTpRealceTexto === texto
                && label.dataset.raTpRealceEscuro === String(linhaEscura)
            )
        ) return;

        label.textContent = "";
        label.appendChild(criarFragmentoRealceTexto(texto, linhaEscura));
        label.dataset.raTpRealceTexto = texto;
        label.dataset.raTpRealceEscuro = String(linhaEscura);
    }

    function limparRealceTextoLinha(linha) {
        const label = linha.querySelector(SELETORES.etiquetaNome);
        if (label) {
            delete label.dataset.raTpRealceTexto;
            delete label.dataset.raTpRealceEscuro;
        }
    }

    function criarFragmentoRealceTexto(texto, linhaEscura) {
        const fragmento = document.createDocumentFragment();
        const regexInfo = /\/\s*(Atacante|Origem):\s*/gi;
        const marcadores = [...texto.matchAll(regexInfo)];
        const comandoPrincipal = obterComandoPrincipalRealce(texto);

        if (!marcadores.length) {
            acrescentarTextoComTags(fragmento, texto, linhaEscura, comandoPrincipal, true);
            return fragmento;
        }

        let posicao = 0;
        marcadores.forEach((marcador, index) => {
            acrescentarTextoComTags(
                fragmento,
                texto.slice(posicao, marcador.index),
                linhaEscura,
                comandoPrincipal,
                index === 0,
            );

            const tipo = marcador[1].toLowerCase();
            const inicioValor = marcador.index + marcador[0].length;
            const fimValor = marcadores[index + 1]?.index ?? texto.length;

            acrescentarSpan(fragmento, marcador[0], tipo === "atacante" ? "infoLabelAtacante" : "infoLabelOrigem", null, linhaEscura);
            if (tipo === "origem") {
                acrescentarValorOrigem(fragmento, texto.slice(inicioValor, fimValor), linhaEscura);
            } else {
                acrescentarSpan(fragmento, texto.slice(inicioValor, fimValor), "infoValorAtacante", null, linhaEscura);
            }

            posicao = fimValor;
        });

        acrescentarTextoComTags(fragmento, texto.slice(posicao), linhaEscura, comandoPrincipal, false);
        return fragmento;
    }

    function acrescentarTextoComTags(fragmento, texto, linhaEscura, comandoPrincipal, realcarUnidade) {
        const valor = String(texto || "");
        if (!valor) return;

        const tags = obterTagsParaRealce();
        const regexTags = new RegExp(tags.map((item) => escapeRegExp(item.tag)).join("|"), "g");
        let posicao = 0;
        let match;

        while ((match = regexTags.exec(valor)) !== null) {
            acrescentarSpan(
                fragmento,
                valor.slice(posicao, match.index),
                realcarUnidade && posicao === 0 && comandoPrincipal ? "unidade" : "base",
                comandoPrincipal,
                linhaEscura,
            );
            acrescentarSpan(fragmento, match[0], "tag", tags.find((item) => item.tag === match[0])?.comando, linhaEscura);
            posicao = match.index + match[0].length;
        }

        acrescentarSpan(
            fragmento,
            valor.slice(posicao),
            realcarUnidade && posicao === 0 && comandoPrincipal ? "unidade" : "base",
            comandoPrincipal,
            linhaEscura,
        );
    }

    function acrescentarValorOrigem(fragmento, texto, linhaEscura) {
        const valor = String(texto || "");
        if (!valor) return;

        const regexPartes = /(\b\d{3}\|\d{3}\b|\bK\d{1,3}\b)/g;
        let posicao = 0;
        let match;

        while ((match = regexPartes.exec(valor)) !== null) {
            acrescentarSpan(fragmento, valor.slice(posicao, match.index), "infoValorOrigem", null, linhaEscura);
            acrescentarSpan(
                fragmento,
                match[0],
                match[0].startsWith("K") ? "infoContinente" : "infoCoordenadas",
                null,
                linhaEscura,
            );
            posicao = match.index + match[0].length;
        }

        acrescentarSpan(fragmento, valor.slice(posicao), "infoValorOrigem", null, linhaEscura);
    }

    function acrescentarSpan(fragmento, texto, tipo, comando, linhaEscura) {
        if (!texto) return;

        const span = document.createElement("span");
        const estilo = obterEstiloRealce(tipo, comando, linhaEscura);

        span.textContent = texto;
        span.dataset.raTpHighlight = tipo;
        span.style.setProperty("color", estilo.cor, "important");
        span.style.setProperty("font-weight", estilo.peso);
        span.style.setProperty("text-shadow", estilo.sombra, "important");

        fragmento.appendChild(span);
    }

    function obterTagsParaRealce() {
        return COMANDOS
            .flatMap((comando) => obterTagsComAliases(comando).map((tag) => ({ tag, comando })))
            .filter((item) => item.tag)
            .sort((a, b) => b.tag.length - a.tag.length);
    }

    function obterComandoPrincipalRealce(texto) {
        return COMANDOS.find((comando) => comando.modo === "substituir" && comandoExisteNoNome(texto, comando))
            || COMANDOS.find((comando) => comandoExisteNoNome(texto, comando))
            || null;
    }

    function obterEstiloRealce(tipo, comando, linhaEscura) {
        const sombraForte = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000";
        const sombraLeve = "0 1px 0 #000, 0 0 2px #000";

        if ((tipo === "tag" || tipo === "unidade") && comando) {
            if (isCorEscura(comando.corBotao)) {
                return {
                    cor: "#111111",
                    peso: "900",
                    sombra: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 2px #fff",
                };
            }

            return {
                cor: obterCorTextoRealce(comando.corBotao),
                peso: "800",
                sombra: sombraForte,
            };
        }

        const infoLabel = { cor: "#ffe66d", peso: "800", sombra: sombraForte };
        const estilos = {
            infoLabelAtacante: infoLabel,
            infoValorAtacante: infoLabel,
            infoLabelOrigem: infoLabel,
            infoValorOrigem: infoLabel,
            infoCoordenadas: infoLabel,
            infoContinente: infoLabel,
            base: infoLabel,
        };

        return estilos[tipo] || estilos.base;
    }

    function obterCorTextoRealce(nomeCor) {
        const coresTexto = {
            red: "#ff4a4a",
            green: "#65ff65",
            blue: "#4db8ff",
            yellow: "#ffe66d",
            orange: "#ffb347",
            lblue: "#5ffff7",
            lime: "#eaff4d",
            white: "#ffffff",
            black: "#111111",
            gray: "#dce4f2",
            dorange: "#d47cff",
            dark: "#ffffff",
            pink: "#ff8ed8",
            brown: "#d98585",
            dblue: "#8fa8ff",
            dgreen: "#62e66b",
            lgreen: "#b9ff9f",
        };

        return coresTexto[String(nomeCor || "").toLowerCase()] || "#ffffff";
    }

    function realcarInformacoesLinha(linha) {
        if (!CONFIG.realcarInformacoesTabela) return;
        if (!linha.closest("#incomings_table")) return;

        const mapa = obterMapaCabecalhos(linha);
        const fallback = {
            destino: 1,
            origem: 2,
            jogador: 3,
            distancia: 4,
            chegada: 5,
            chegaEm: 6,
        };

        aplicarRealceCelulaInfo(linha.children[obterIndiceColuna(mapa, fallback, "destino")], "destino");
        aplicarRealceCelulaInfo(linha.children[obterIndiceColuna(mapa, fallback, "origem")], "origem");
        aplicarRealceCelulaInfo(linha.children[obterIndiceColuna(mapa, fallback, "jogador")], "jogador");
        aplicarRealceCelulaInfo(linha.children[obterIndiceColuna(mapa, fallback, "distancia")], "distancia");
        aplicarRealceCelulaInfo(linha.children[obterIndiceColuna(mapa, fallback, "chegada")], "chegada");

        const celulaTempo = linha.children[obterIndiceColuna(mapa, fallback, "chegaEm")];
        aplicarRealceCelulaInfo(celulaTempo, obterTipoTempoRestante(celulaTempo));
    }

    function obterMapaCabecalhos(linha) {
        const tabela = linha.closest("table");
        if (!tabela) return {};
        if (mapasCabecalhoTabela.has(tabela)) return mapasCabecalhoTabela.get(tabela);

        const mapa = {};
        const linhaCabecalho = [...tabela.querySelectorAll("tr")].find((tr) => {
            const texto = normalizarSemAcentos(tr.textContent);
            return texto.includes("destino")
                && texto.includes("origem")
                && texto.includes("jogador")
                && texto.includes("chegada");
        });

        if (linhaCabecalho) {
            [...linhaCabecalho.children].forEach((celula, index) => {
                const texto = normalizarSemAcentos(celula.textContent);

                if (texto.includes("destino")) mapa.destino = index;
                else if (texto.includes("origem")) mapa.origem = index;
                else if (texto.includes("jogador")) mapa.jogador = index;
                else if (texto.includes("distancia")) mapa.distancia = index;
                else if (texto.includes("chega em")) mapa.chegaEm = index;
                else if (texto.includes("chegada")) mapa.chegada = index;
            });
        }

        mapasCabecalhoTabela.set(tabela, mapa);
        return mapa;
    }

    function obterIndiceColuna(mapa, fallback, tipo) {
        return Number.isInteger(mapa[tipo]) ? mapa[tipo] : fallback[tipo];
    }

    function aplicarRealceCelulaInfo(celula, tipo) {
        if (!celula) return;

        const estilo = obterEstiloInfoTabela(tipo);
        celula.dataset.raTpInfoRealce = tipo;
        celula.style.setProperty("color", estilo.cor, "important");
        celula.style.setProperty("font-weight", estilo.peso);
        celula.style.setProperty("text-shadow", estilo.sombra, "important");

        celula.querySelectorAll("a, span").forEach((elemento) => {
            if (deveIgnorarRealceInfo(elemento)) return;

            elemento.dataset.raTpInfoElemento = "1";
            elemento.style.setProperty("color", estilo.cor, "important");
            elemento.style.setProperty("font-weight", estilo.peso);
            elemento.style.setProperty("text-shadow", estilo.sombra, "important");
        });
    }

    function deveIgnorarRealceInfo(elemento) {
        return Boolean(elemento.closest(".ra-tp-botoes, button, input, select, textarea"));
    }

    function obterTipoTempoRestante(celula) {
        const segundos = obterSegundosDeTempo(celula?.textContent || "");
        if (segundos === null) return "chegaEm";
        if (segundos <= 5 * 60) return "tempoCritico";
        if (segundos <= 15 * 60) return "tempoAviso";

        return "tempoOk";
    }

    function obterSegundosDeTempo(texto) {
        const match = String(texto || "").match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
        if (!match) return null;

        return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]);
    }

    function obterEstiloInfoTabela(tipo) {
        const sombra = "0 1px 0 rgba(255, 255, 255, 0.75), 0 0 1px rgba(0, 0, 0, 0.35)";
        const infoPadrao = { cor: "#6b3500", peso: "800", sombra };
        const estilos = {
            destino: infoPadrao,
            origem: infoPadrao,
            jogador: infoPadrao,
            distancia: infoPadrao,
            chegada: infoPadrao,
            chegaEm: infoPadrao,
            tempoOk: infoPadrao,
            tempoAviso: { cor: "#a45200", peso: "900", sombra },
            tempoCritico: { cor: "#b00020", peso: "900", sombra },
        };

        return estilos[tipo] || estilos.chegaEm;
    }

    function aplicarCorAtaque(linha) {
        limparPintura(linha);

        if (CONFIG.paginaDeAtaques === "nada") return;

        if (isApoio(linha)) {
            pintarLinha(linha, obterCor("yellow", "yellow").bottom);
            return;
        }

        const nome = obterNomeLinha(linha);
        const comandosEncontrados = COMANDOS.filter((comando) => comandoExisteNoNome(nome, comando));

        if (comandosEncontrados.length >= 2) {
            const cor1 = obterCor(comandosEncontrados[0].corBotao, "red").top;
            const cor2 = obterCor(comandosEncontrados[1].corBotao, "red").top;
            pintarLinha(
                linha,
                `repeating-linear-gradient(45deg, ${cor1}, ${cor1} 10px, ${cor2} 10px, ${cor2} 20px)`,
            );
            return;
        }

        if (comandosEncontrados.length === 1) {
            pintarLinha(linha, obterCor(comandosEncontrados[0].corBotao, "red").top);
            return;
        }

        pintarLinha(linha, obterCor("red", "red").bottom);
    }

    function pintarLinha(linha, background) {
        const colunaNome = linha.querySelector(SELETORES.etiquetaNome)?.closest("td");
        if (!colunaNome) return;

        linha.dataset.raTpLinhaEscura = isFundoEscuro(background) ? "1" : "0";

        if (CONFIG.paginaDeAtaques === "linha") {
            linha.querySelectorAll("td").forEach((td) => aplicarFundo(td, background));
            linha.querySelectorAll("a, .quickedit-label").forEach(aplicarTextoAtaque);
            return;
        }

        if (CONFIG.paginaDeAtaques === "coluna") {
            aplicarFundo(colunaNome, background);
            colunaNome.querySelectorAll("a, .quickedit-label").forEach(aplicarTextoAtaque);
        }
    }

    function aplicarFundo(elemento, background) {
        elemento.dataset.raTpFundo = "1";
        elemento.style.setProperty("background", background, "important");
    }

    function aplicarTextoAtaque(elemento) {
        elemento.dataset.raTpTexto = "1";
        elemento.style.setProperty("color", "white", "important");
        elemento.style.setProperty(
            "text-shadow",
            "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
            "important",
        );
    }

    function limparPintura(linha) {
        delete linha.dataset.raTpLinhaEscura;

        linha.querySelectorAll("[data-ra-tp-fundo='1']").forEach((elemento) => {
            elemento.style.removeProperty("background");
            delete elemento.dataset.raTpFundo;
        });

        linha.querySelectorAll("[data-ra-tp-texto='1']").forEach((elemento) => {
            elemento.style.removeProperty("color");
            elemento.style.removeProperty("text-shadow");
            delete elemento.dataset.raTpTexto;
        });
    }

    function isFundoEscuro(background) {
        const hex = String(background || "").match(/#[0-9a-f]{6}/i)?.[0];
        if (!hex) return false;

        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const luminancia = (0.299 * r) + (0.587 * g) + (0.114 * b);

        return luminancia < 80;
    }

    function removerBotoes(linha) {
        linha.querySelectorAll(".ra-tp-botoes").forEach((elemento) => elemento.remove());
    }

    function obterNomeLinha(linha) {
        return normalizarEspacos(linha.querySelector(SELETORES.etiquetaNome)?.textContent || "");
    }

    function comandoExisteNoNome(nome, comando) {
        return obterTagsComAliases(comando).some((tag) => nome.includes(tag));
    }

    function removerTags(nome, filtroComando) {
        let resultado = normalizarEspacos(nome);

        COMANDOS.filter(filtroComando).forEach((comando) => {
            obterTagsComAliases(comando).forEach((tag) => {
                resultado = resultado.replace(new RegExp(escapeRegExp(tag), "g"), "");
            });
        });

        return normalizarEspacos(resultado);
    }

    function obterTagsComAliases(comando) {
        return [comando.tag, ...(comando.aliases || [])].filter(Boolean);
    }

    function isApoio(linha) {
        const temIconeApoio = [...linha.querySelectorAll("img")].some((img) => {
            const texto = `${img.src || ""} ${img.alt || ""} ${img.title || ""}`.toLowerCase();
            return texto.includes("support") || texto.includes("apoio") || texto.includes("suporte");
        });
        if (temIconeApoio) return true;

        const textoLinha = normalizarSemAcentos(linha.textContent);
        return /\b(apoio|suporte|support)\b/.test(textoLinha);
    }

    function obterCor(nome, fallback) {
        return CORES[String(nome || "").toLowerCase()] || CORES[fallback] || CORES.white;
    }

    function normalizarEspacos(valor) {
        return String(valor || "").replace(/\s+/g, " ").trim();
    }

    function normalizarSemAcentos(valor) {
        return normalizarEspacos(valor)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
    }

    function escapeRegExp(valor) {
        return String(valor).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function esperarPor(obterValor, timeoutMs, intervaloMs) {
        const inicio = Date.now();

        return new Promise((resolve) => {
            const tick = () => {
                const valor = obterValor();
                if (valor) {
                    resolve(valor);
                    return;
                }

                if (Date.now() - inicio >= timeoutMs) {
                    resolve(null);
                    return;
                }

                setTimeout(tick, intervaloMs);
            };

            tick();
        });
    }

    function aplicarEstilos() {
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement("style");
            style.id = STYLE_ID;
            document.head.appendChild(style);
        }

        style.textContent = `
            .ra-tp-botoes {
                float: right;
                display: inline-flex;
                flex-wrap: wrap;
                gap: 1px;
                align-items: center;
                justify-content: flex-end;
                margin-left: 4px;
                max-width: 100%;
                vertical-align: middle;
            }

            .ra-tp-botao {
                min-width: ${CONFIG.tamanhoBotaoPx}px;
                height: ${CONFIG.tamanhoBotaoPx}px;
                padding: 0 ${CONFIG.paddingHorizontalBotaoPx}px !important;
                border: 1px solid rgba(0, 0, 0, 0.45) !important;
                border-radius: 3px;
                line-height: 1 !important;
                font-weight: 600;
                text-align: center;
                cursor: pointer;
                box-sizing: border-box;
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.42),
                    inset 0 -1px 0 rgba(0, 0, 0, 0.18),
                    0 1px 1px rgba(0, 0, 0, 0.22);
                text-shadow: 0 1px 0 rgba(0, 0, 0, 0.7);
                transition: filter 100ms ease, transform 100ms ease, box-shadow 100ms ease;
                vertical-align: middle;
            }

            .ra-tp-botao:hover {
                filter: brightness(1.12) saturate(1.08);
                transform: translateY(-1px);
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.5),
                    inset 0 -1px 0 rgba(0, 0, 0, 0.2),
                    0 2px 2px rgba(0, 0, 0, 0.24);
            }

            .ra-tp-botao:active {
                filter: brightness(0.96);
                transform: translateY(0);
                box-shadow:
                    inset 0 1px 2px rgba(0, 0, 0, 0.38),
                    0 1px 1px rgba(0, 0, 0, 0.18);
            }

            .ra-tp-botao:focus {
                outline: 1px solid rgba(255, 255, 255, 0.75);
                outline-offset: 1px;
            }

            .ra-tp-botao-escuro {
                border-color: rgba(255, 255, 255, 0.95) !important;
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.3),
                    inset 0 -1px 0 rgba(0, 0, 0, 0.25),
                    0 0 0 1px rgba(0, 0, 0, 0.5),
                    0 1px 1px rgba(0, 0, 0, 0.22);
            }

            .ra-tp-reset {
                margin-left: 3px !important;
            }

            .ra-tp-config-button {
                position: fixed;
                left: 12px;
                right: auto;
                top: 104px;
                bottom: auto;
                z-index: 2147483647;
                width: 30px;
                min-width: 30px;
                height: 28px;
                padding: 0;
                border: 1px solid #4f120f;
                border-radius: 2px;
                background: linear-gradient(to bottom, #b33a34, #8f2420 55%, #681611);
                color: #f7dfa2;
                font-size: 17px;
                line-height: 26px;
                text-align: center;
                cursor: pointer;
                box-sizing: border-box;
                text-shadow: 1px 1px 1px #000;
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.35),
                    inset 0 -1px 0 rgba(0, 0, 0, 0.35),
                    0 2px 5px rgba(0, 0, 0, 0.45);
            }

            .ra-tp-config-button:hover {
                background: linear-gradient(to bottom, #c4473e, #a02c27 55%, #7e1c17);
                filter: brightness(1.08);
            }

            .ra-tp-config-overlay[hidden] {
                display: none !important;
            }

            .ra-tp-config-overlay {
                position: fixed;
                inset: 0;
                z-index: 10001;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 12px;
                background: rgba(0, 0, 0, 0.58);
                box-sizing: border-box;
            }

            .ra-tp-config-dialog {
                width: min(520px, calc(100vw - 24px));
                max-height: calc(100vh - 24px);
                overflow: auto;
                border: 2px solid #7d5526;
                border-radius: 6px;
                background: #f3e2b6;
                color: #2b1a0b;
                box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
                box-sizing: border-box;
            }

            .ra-tp-config-header,
            .ra-tp-config-footer {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 9px 11px;
                background: #c99a45;
            }

            .ra-tp-config-header {
                border-bottom: 1px solid #8b632f;
            }

            .ra-tp-config-header strong {
                flex: 1;
                font-size: 15px;
            }

            .ra-tp-config-close {
                width: 26px;
                height: 26px;
                padding: 0;
                border: 1px solid #69451e;
                border-radius: 4px;
                background: #f0d58b;
                color: #321d0b;
                font-size: 18px;
                line-height: 22px;
                cursor: pointer;
            }

            .ra-tp-config-body {
                padding: 0 11px;
            }

            .ra-tp-config-section {
                padding: 10px 0;
                border-bottom: 1px solid rgba(110, 72, 29, 0.28);
            }

            .ra-tp-config-section:last-child {
                border-bottom: 0;
            }

            .ra-tp-config-section h3 {
                margin: 0 0 8px;
                font-size: 13px;
                color: #5b3512;
            }

            .ra-tp-config-field {
                display: grid;
                grid-template-columns: minmax(0, 1fr) 150px;
                gap: 10px;
                align-items: center;
                min-height: 30px;
                font-weight: 700;
            }

            .ra-tp-config-field input,
            .ra-tp-config-field select {
                width: 100%;
                min-width: 0;
                height: 25px;
                border: 1px solid #8b632f;
                border-radius: 3px;
                background: #fffaf0;
                color: #261609;
                box-sizing: border-box;
            }

            .ra-tp-config-toggle {
                display: flex;
                align-items: center;
                gap: 8px;
                min-height: 28px;
                font-weight: 700;
                cursor: pointer;
            }

            .ra-tp-config-toggle input {
                width: 16px;
                height: 16px;
                margin: 0;
            }

            .ra-tp-config-command-list {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 4px 8px;
                margin-bottom: 8px;
            }

            .ra-tp-config-command {
                display: flex;
                align-items: center;
                gap: 5px;
                min-width: 0;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
            }

            .ra-tp-config-command input {
                width: 14px;
                height: 14px;
                margin: 0;
                flex: 0 0 auto;
            }

            .ra-tp-config-command span {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .ra-tp-config-footer {
                border-top: 1px solid #8b632f;
            }

            .ra-tp-config-spacer {
                flex: 1;
            }

            .ra-tp-config-primary,
            .ra-tp-config-secondary {
                min-height: 27px;
                padding: 3px 10px;
                border: 1px solid #65421d;
                border-radius: 4px;
                font-weight: 700;
                cursor: pointer;
            }

            .ra-tp-config-primary {
                background: #6e8c32;
                color: #fff;
            }

            .ra-tp-config-secondary {
                background: #ead193;
                color: #2b1a0b;
            }

            @media (max-width: 560px) {
                .ra-tp-config-field {
                    grid-template-columns: 1fr;
                    gap: 3px;
                    padding: 4px 0;
                }

                .ra-tp-config-footer {
                    flex-wrap: wrap;
                }

                .ra-tp-config-command-list {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
            }
        `;
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }
})();
