// ==UserScript==
// @name         TW PT - Buscas/Coleta - ThePlaguePT
// @namespace    theplaguept.tw.buscas-coleta
// @version      1.3.0
// @description  Automatiza ciclos independentes de coleta no Tribal Wars.
// @author       ThePlaguePT
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// @match        *://*/game.php*
// @include      *://*/game.php*
// @homepageURL  https://github.com/ThePlaguePT/TribalWars-Scripts
// @supportURL   https://github.com/ThePlaguePT/TribalWars-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Buscas-Coleta%20-%20ThePlaguePT.user.js
// @downloadURL  https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Buscas-Coleta%20-%20ThePlaguePT.user.js
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    var SCRIPT_NAME = 'TW PT - Buscas/Coleta - ThePlaguePT';
    var SCRIPT_VERSION = '1.3.0';
    var WORLD_SCOPE = obterEscopoMundo();
    var STORAGE_KEY = chaveDoMundo('scriptColeta.enabled.v1');
    var SETTINGS_KEY = chaveDoMundo('scriptColeta.settings.v1');
    var STATE_KEY = chaveDoMundo('scriptColeta.state.v1');
    var WORKER_KEY = chaveDoMundo('scriptColeta.workerHeartbeat.v1');
    var BUTTON_ID = 'script-coleta-toggle';
    var PANEL_ID = 'script-coleta-settings';
    var PANEL_TOGGLE_ID = 'script-coleta-settings-toggle';
    var STYLE_ID = 'script-coleta-style';
    var TOOLBAR_ID = 'tp-theplaguept-script-bar';
    var WORKER_TAB_NAME = 'scriptColetaWorker_' + WORLD_SCOPE;
    var WORKER_URL_PARAM = 'tp_sc_worker';
    var WORKER_TIMEOUT = 12000;
    var AUTO_OPEN_RETRY = 30 * 1000;
    var RETRY_WITHOUT_WORK = 5 * 60 * 1000;
    var INITIAL_UNLOCK_RETRY = 30 * 60 * 1000;

    var UNIT_CARRY = Object.freeze({
        spear: 25,
        sword: 15,
        axe: 10,
        archer: 10,
        light: 80,
        marcher: 50,
        heavy: 50,
        knight: 100
    });
    var UNIT_LABELS = Object.freeze({
        spear: 'Lança',
        sword: 'Espada',
        axe: 'Viking',
        archer: 'Arqueiro',
        light: 'Cavalaria leve',
        marcher: 'Arqueiro a cavalo',
        heavy: 'Cavalaria pesada',
        knight: 'Paladino'
    });
    var DEFAULT_CONFIG = {
        version: 3,
        groupId: '0',
        unlockEnabled: false,
        unlockEveryCycles: 4,
        returnBufferSeconds: 60,
        enabledUnits: {
            spear: false,
            sword: false,
            axe: false,
            archer: false,
            light: false,
            marcher: false,
            heavy: false,
            knight: false
        },
        keepHome: {
            spear: 0,
            sword: 0,
            axe: 0,
            archer: 0,
            light: 0,
            marcher: 0,
            heavy: 0,
            knight: 0
        }
    };

    if (window.__scriptColetaController) {
        console.warn(
            '[Script Coleta] Outra cópia já foi carregada nesta página. ' +
            'Desativa versões duplicadas no gestor de userscripts.'
        );
        return;
    }

    var CONFIG = carregarConfiguracao();
    var estado = carregarEstado();
    if (estado.scriptVersion !== SCRIPT_VERSION) {
        estado.scriptVersion = SCRIPT_VERSION;
        estado.nextRunAt = 0;
        escreverJsonSeguro(localStorage, STATE_KEY, estado);
    }
    var tabId = Date.now() + '-' + Math.random().toString(36).slice(2);
    var botao = null;
    var timerPrincipal = null;
    var timerContagem = null;
    var timerHeartbeat = null;
    var timerSupervisor = null;
    var timerGuardarPainel = null;
    var geracaoGrupos = 0;
    var workerWindowRef = null;
    var proximaTentativaAbrirWorker = 0;
    var cicloEmCurso = false;
    var estadoAtual = 'Parado';
    var geracao = 0;

    window.__scriptColetaController = {
        nome: SCRIPT_NAME,
        versao: SCRIPT_VERSION,
        mundo: WORLD_SCOPE,
        executarAgora: executarAgora,
        obterEstado: function () {
            return JSON.parse(JSON.stringify(estado));
        }
    };

    iniciar();

    function obterEscopoMundo() {
        var dados = window.game_data || {};
        var mundoUrl = null;
        try {
            mundoUrl = new URL(window.location.href).searchParams.get('world');
        } catch (erro) {
            mundoUrl = null;
        }

        var valor = dados.world || mundoUrl || window.location.hostname ||
            'mundo-desconhecido';
        var normalizado = String(valor).toLowerCase().replace(
            /[^a-z0-9_-]+/g,
            '-'
        ).replace(/^-+|-+$/g, '');
        return normalizado || 'mundo-desconhecido';
    }

    function chaveDoMundo(chaveBase) {
        return String(chaveBase) + '.world.' + WORLD_SCOPE;
    }

    function iniciar() {
        injetarEstilos();
        criarBotao();

        if (estaNaColeta()) {
            window.setTimeout(criarPainel, 100);
        }

        window.addEventListener('storage', tratarAlteracaoStorage);
        window.addEventListener('pagehide', function () {
            if (eSeparadorTrabalhoGerido()) {
                pararHeartbeat(true);
            }
        });

        console.info(
            '[Script Coleta] v' + SCRIPT_VERSION + ' carregado — ' +
            (estaLigado() ? 'LIGADO' : 'DESLIGADO') +
            '; mundo=' + WORLD_SCOPE +
            '; grupo=' + CONFIG.groupId
        );

        if (estaLigado()) {
            atualizarBotao('A iniciar…');
            iniciarAutomacao();
        } else {
            atualizarBotao('Parado');
        }
    }

    function carregarConfiguracao() {
        var guardada = lerJsonSeguro(localStorage, SETTINGS_KEY, {});
        var unidadesAntigas = guardada.enabledUnits || {};
        var usaPredefinicaoAntiga = Number(guardada.version || 0) < 2 &&
            unidadesAntigas.axe === true &&
            unidadesAntigas.light === true &&
            ['spear', 'sword', 'archer', 'marcher', 'heavy', 'knight']
                .every(function (unidade) {
                    return unidadesAntigas[unidade] === false;
                });
        if (usaPredefinicaoAntiga) {
            Object.keys(UNIT_CARRY).forEach(function (unidade) {
                unidadesAntigas[unidade] = true;
            });
            guardada.enabledUnits = unidadesAntigas;
        }

        var reservasAntigas = guardada.keepHome || {};
        var usaPredefinicaoAnterior = Number(guardada.version || 0) < 3 &&
            Object.keys(UNIT_CARRY).every(function (unidade) {
                return unidadesAntigas[unidade] === true &&
                    (!reservasAntigas[unidade] || Number(reservasAntigas[unidade]) === 0);
            }) &&
            guardada.unlockEnabled !== false &&
            String(guardada.groupId === undefined ? '0' : guardada.groupId) === '0' &&
            Number(guardada.unlockEveryCycles || 4) === 4 &&
            Number(guardada.returnBufferSeconds || 60) === 60;
        if (usaPredefinicaoAnterior) {
            Object.keys(UNIT_CARRY).forEach(function (unidade) {
                unidadesAntigas[unidade] = false;
            });
            guardada.enabledUnits = unidadesAntigas;
            guardada.unlockEnabled = false;
        }

        var config = {
            version: 3,
            groupId: /^-?\d+$/.test(String(guardada.groupId))
                ? String(guardada.groupId)
                : DEFAULT_CONFIG.groupId,
            unlockEnabled: typeof guardada.unlockEnabled === 'boolean'
                ? guardada.unlockEnabled
                : DEFAULT_CONFIG.unlockEnabled,
            unlockEveryCycles: limitarInteiro(
                guardada.unlockEveryCycles,
                3,
                5,
                DEFAULT_CONFIG.unlockEveryCycles
            ),
            returnBufferSeconds: limitarInteiro(
                guardada.returnBufferSeconds,
                30,
                300,
                DEFAULT_CONFIG.returnBufferSeconds
            ),
            enabledUnits: {},
            keepHome: {}
        };

        Object.keys(UNIT_CARRY).forEach(function (unidade) {
            var ativos = guardada.enabledUnits || {};
            var reservas = guardada.keepHome || {};
            config.enabledUnits[unidade] =
                typeof ativos[unidade] === 'boolean'
                    ? ativos[unidade]
                    : DEFAULT_CONFIG.enabledUnits[unidade];
            config.keepHome[unidade] = limitarInteiro(
                reservas[unidade],
                0,
                999999,
                DEFAULT_CONFIG.keepHome[unidade]
            );
        });

        escreverJsonSeguro(localStorage, SETTINGS_KEY, config);
        return config;
    }

    function carregarEstado() {
        var guardado = lerJsonSeguro(localStorage, STATE_KEY, {});
        return {
            scriptVersion: String(guardado.scriptVersion || ''),
            nextRunAt: Number(guardado.nextRunAt) || 0,
            lastRunAt: Number(guardado.lastRunAt) || 0,
            lastSummary: String(guardado.lastSummary || ''),
            consecutiveErrors: Math.max(0, Number(guardado.consecutiveErrors) || 0),
            cyclesByVillage: objetoSimples(guardado.cyclesByVillage),
            unlockAttempts: objetoSimples(guardado.unlockAttempts),
            initialUnlockAttempts: objetoSimples(guardado.initialUnlockAttempts)
        };
    }

    function guardarEstado() {
        escreverJsonSeguro(localStorage, STATE_KEY, estado);
        atualizarResumoPainel();
    }

    function objetoSimples(valor) {
        return valor && typeof valor === 'object' && !Array.isArray(valor)
            ? valor
            : {};
    }

    function limitarInteiro(valor, minimo, maximo, padrao) {
        var numero = Number(valor);
        if (!Number.isFinite(numero)) {
            numero = Number(padrao);
        }
        return Math.min(maximo, Math.max(minimo, Math.round(numero)));
    }

    function estaLigado() {
        return localStorage.getItem(STORAGE_KEY) === '1';
    }

    function estaNaColeta() {
        var dados = window.game_data || {};
        var url = new URL(window.location.href);
        var screen = dados.screen || url.searchParams.get('screen');
        var mode = dados.mode || url.searchParams.get('mode');
        return screen === 'place' && (
            mode === 'scavenge' || mode === 'scavenge_mass'
        );
    }

    function estaNaPaginaTrabalho() {
        var url = new URL(window.location.href);
        var dados = window.game_data || {};
        return (dados.screen || url.searchParams.get('screen')) === 'place' &&
            (dados.mode || url.searchParams.get('mode')) === 'scavenge';
    }

    function eSeparadorTrabalhoGerido() {
        try {
            return window.name === WORKER_TAB_NAME ||
                new URL(window.location.href).searchParams.get(
                    WORKER_URL_PARAM
                ) === '1';
        } catch (erro) {
            return window.name === WORKER_TAB_NAME;
        }
    }

    function criarBotao() {
        var anterior = document.getElementById(BUTTON_ID);
        if (anterior) {
            anterior.remove();
        }

        var barra = obterBarraScripts();
        botao = document.createElement('button');
        botao.id = BUTTON_ID;
        botao.className = 'tp-theplaguept-script-bar-item';
        botao.type = 'button';
        botao.innerHTML =
            '<span class="script-coleta-launcher-icon">SC</span>' +
            '<span data-script-coleta-power role="switch" aria-checked="false" ' +
            'title="Ligar ou desligar Buscas/Coleta">&#x23FB;</span>' +
            '<span data-script-coleta-countdown hidden></span>';
        botao.style.setProperty('order', '91', 'important');

        botao.addEventListener('click', function (evento) {
            evento.preventDefault();
            evento.stopPropagation();
            var alvo = evento.target && evento.target.closest
                ? evento.target.closest('[data-script-coleta-power]')
                : null;
            if (alvo) {
                alternarEstadoPelaBarra();
                return;
            }
            abrirOuFocarSeparadorTrabalho();
        });

        barra.appendChild(botao);
    }

    function obterBarraScripts() {
        var barra = document.getElementById(TOOLBAR_ID);
        if (!barra) {
            barra = document.createElement('div');
            barra.id = TOOLBAR_ID;
            barra.setAttribute('aria-label', 'Botões ThePlaguePT');
            document.body.appendChild(barra);
        }
        return barra;
    }

    function injetarEstilos() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        var estilo = document.createElement('style');
        estilo.id = STYLE_ID;
        estilo.textContent = [
            '#tp-theplaguept-script-bar{position:fixed !important;top:8px !important;left:414px !important;right:auto !important;bottom:auto !important;z-index:2147483647 !important;width:auto !important;min-width:0 !important;height:34px !important;display:flex !important;flex-direction:row !important;align-items:center !important;justify-content:flex-start !important;gap:5px !important;padding:0 8px !important;box-sizing:border-box !important;pointer-events:none !important;overflow:visible !important;transform:none !important;}#tp-theplaguept-script-bar>*{position:relative !important;top:auto !important;left:auto !important;right:auto !important;bottom:auto !important;transform:none !important;width:30px !important;min-width:30px !important;max-width:30px !important;height:28px !important;min-height:28px !important;margin:0 !important;flex:0 0 30px !important;pointer-events:auto !important;overflow:visible !important;}#tp-theplaguept-script-bar>button,#tp-theplaguept-script-bar>*>button{position:relative !important;top:auto !important;left:auto !important;right:auto !important;bottom:auto !important;transform:none !important;width:30px !important;min-width:30px !important;max-width:30px !important;height:28px !important;min-height:28px !important;margin:0 !important;padding:0 !important;flex:0 0 30px !important;display:inline-flex !important;align-items:center !important;justify-content:center !important;gap:0 !important;overflow:visible !important;}#tp-theplaguept-script-bar>button:hover,#tp-theplaguept-script-bar>button:focus-visible,#tp-theplaguept-script-bar>*>button:hover,#tp-theplaguept-script-bar>*>button:focus-visible,#tp-theplaguept-script-bar #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:hover,#tp-theplaguept-script-bar #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:focus-visible,#tp-theplaguept-script-bar>#tp-od-est-launcher:hover,#tp-theplaguept-script-bar>#tp-od-est-launcher:focus-visible{width:30px !important;min-width:30px !important;max-width:30px !important;padding:0 !important;gap:0 !important;}#tp-theplaguept-script-bar .tpdef-launcher-text,#tp-theplaguept-script-bar .tw-alerts-toggle-label,#tp-theplaguept-script-bar .ti-toggle-label,#tp-theplaguept-script-bar .ra-tp-config-button-label,#tp-theplaguept-script-bar [class$="-launcherLabel"],#tp-theplaguept-script-bar [class$="-launcher-text"]{display:none !important;max-width:0 !important;opacity:0 !important;}#tp-theplaguept-script-bar #twHubTp-launcher{order:10 !important;}#tp-theplaguept-script-bar #tw-discord-alerts-ui{order:20 !important;}#tp-theplaguept-script-bar #tpDefLauncher{order:30 !important;}#tp-theplaguept-script-bar #tag-incomings-pt-panel{order:40 !important;}#tp-theplaguept-script-bar #tpMapMarker-launcher{order:50 !important;}#tp-theplaguept-script-bar #renomear-ataques-cores-theplaguept-config-button{order:60 !important;}#tp-theplaguept-script-bar #tpResumo24h-launcher{order:70 !important;}#tp-theplaguept-script-bar #tpconq-launcher{order:80 !important;}#tp-theplaguept-script-bar #twp-troop-summary-launcher{order:85 !important;}#tp-theplaguept-script-bar #auto-farm-a-toggle{order:90 !important;}#tp-theplaguept-script-bar #tp-od-est-launcher{order:92 !important;}#tp-theplaguept-script-bar #script-coleta-toggle{order:94 !important;}#tp-theplaguept-script-bar>.tp-theplaguept-script-bar-item[data-tp-title]::after{content:attr(data-tp-title) !important;position:absolute !important;left:50% !important;top:33px !important;transform:translateX(-50%) !important;display:none !important;white-space:nowrap !important;max-width:360px !important;overflow:hidden !important;text-overflow:ellipsis !important;padding:4px 8px !important;border:1px solid #4f120f !important;border-radius:2px !important;background:linear-gradient(to bottom,#f6dfaa,#d2a05a) !important;color:#2b1509 !important;font:bold 11px Verdana,Arial,sans-serif !important;text-shadow:0 1px #fff !important;box-shadow:0 2px 6px rgba(0,0,0,.55) !important;pointer-events:none !important;z-index:2147483647 !important;}#tp-theplaguept-script-bar>.tp-theplaguept-script-bar-item[data-tp-title]:hover::after,#tp-theplaguept-script-bar>.tp-theplaguept-script-bar-item[data-tp-title]:focus-within::after{display:block !important;}@media (max-width:1919px){#tp-theplaguept-script-bar{top:50vh !important;left:max(12px,calc((100vw - 1220px) / 2 + 8px)) !important;right:auto !important;bottom:auto !important;width:34px !important;min-width:34px !important;height:auto !important;min-height:0 !important;max-height:calc(100vh - 118px) !important;flex-direction:column !important;align-items:center !important;justify-content:center !important;gap:5px !important;padding:8px 2px !important;transform:translateY(-50%) !important;}#tp-theplaguept-script-bar>#auto-farm-a-toggle::after,#tp-theplaguept-script-bar>#script-coleta-toggle::after,#tp-theplaguept-script-bar>.tp-theplaguept-script-bar-item[data-tp-title]::after{top:50% !important;left:38px !important;transform:translateY(-50%) !important;}#tp-theplaguept-script-bar [data-auto-farm-countdown],#tp-theplaguept-script-bar [data-script-coleta-countdown]{top:50% !important;left:38px !important;transform:translateY(-50%) !important;}}',
            '#tp-theplaguept-script-bar>#script-coleta-toggle{position:relative!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;transform:none!important;order:94!important;width:30px!important;min-width:30px!important;max-width:30px!important;height:28px!important;min-height:28px!important;margin:0!important;padding:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 30px!important;overflow:visible!important;pointer-events:auto!important;cursor:pointer!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#b33a34,#8f2420 55%,#681611)!important;box-shadow:inset 0 1px 0 #ffffff59,inset 0 -1px 0 #00000059,0 2px 5px #00000073!important;color:#fff!important;font:700 10px Verdana,Arial,sans-serif!important;text-shadow:1px 1px 1px #000!important}',
            '#tp-theplaguept-script-bar>#script-coleta-toggle.sc-ligado{background:linear-gradient(to bottom,#5f9f3d,#3f7c27 55%,#28551a)!important}',
            '#tp-theplaguept-script-bar>#script-coleta-toggle:hover,#tp-theplaguept-script-bar>#script-coleta-toggle:focus-visible{filter:brightness(1.18)!important}',
            '#script-coleta-toggle .script-coleta-launcher-icon{display:block!important;line-height:26px!important}',
            '#script-coleta-toggle [data-script-coleta-power]{position:absolute!important;right:-7px!important;top:-7px!important;width:15px!important;height:15px!important;display:flex!important;align-items:center!important;justify-content:center!important;border:1px solid #4f120f!important;border-radius:50%!important;background:#a92d27!important;color:#fff!important;font:bold 10px/13px Arial,sans-serif!important;text-shadow:0 1px #000!important;box-shadow:0 1px 3px #0009!important;cursor:pointer!important;pointer-events:auto!important;z-index:4!important}',
            '#script-coleta-toggle.sc-ligado [data-script-coleta-power]{background:#3f8a29!important}',
            '#script-coleta-toggle [data-script-coleta-power]:hover{filter:brightness(1.25)!important}',
            '#script-coleta-toggle [data-script-coleta-countdown]{position:absolute!important;display:none!important;top:31px!important;left:50%!important;transform:translateX(-50%)!important;min-width:46px!important;padding:3px 5px!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#f6dfaa,#d2a05a)!important;color:#2b1509!important;font:bold 10px Verdana,Arial,sans-serif!important;line-height:13px!important;text-align:center!important;text-shadow:0 1px #fff!important;box-shadow:0 2px 5px #0008!important;white-space:nowrap!important;pointer-events:none!important;z-index:2147483647!important}',
            '#script-coleta-toggle [data-script-coleta-countdown][hidden]{display:none!important}',
            '#script-coleta-toggle:hover [data-script-coleta-countdown]:not([hidden]),#script-coleta-toggle:focus-visible [data-script-coleta-countdown]:not([hidden]){display:block!important}',
            '#tp-theplaguept-script-bar>#script-coleta-toggle::after{content:attr(data-tp-title);position:absolute!important;display:none!important;top:52px!important;left:50%!important;transform:translateX(-50%)!important;min-width:max-content!important;max-width:420px!important;padding:4px 8px!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#f6dfaa,#d2a05a)!important;color:#2b1509!important;font:bold 11px Verdana,Arial,sans-serif!important;text-shadow:0 1px #fff!important;box-shadow:0 2px 6px #0008!important;white-space:nowrap!important;pointer-events:none!important;z-index:2147483647!important}',
            '#tp-theplaguept-script-bar>#script-coleta-toggle:hover::after,#tp-theplaguept-script-bar>#script-coleta-toggle:focus-visible::after{display:block!important}',
            '@media(max-width:1919px){#tp-theplaguept-script-bar>#script-coleta-toggle::after,#script-coleta-toggle [data-script-coleta-countdown]{top:50%!important;left:38px!important;transform:translateY(-50%)!important}}',
            '#script-coleta-settings{margin:6px 0 9px;border:1px solid #c8a86a;background:#f6e8bd;color:#3c2a14;font:11px Verdana,Arial,sans-serif;box-sizing:border-box}',
            '#script-coleta-settings *{box-sizing:border-box}',
            '#script-coleta-settings .sc-settings-title{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px;border-bottom:1px solid #d3b97d;background:linear-gradient(to bottom,#f9edca,#f0dca8);font:17px Georgia,"Times New Roman",serif;color:#3d2915}',
            '#script-coleta-settings .sc-settings-actions{display:flex;align-items:center;gap:8px}',
            '#script-coleta-settings .sc-settings-actions small{font:10px Verdana,Arial,sans-serif;color:#80643b}',
            '#script-coleta-settings .sc-settings-toggle{min-width:74px;height:27px;padding:3px 10px;border:1px solid #4f120f;border-radius:3px;background:linear-gradient(#b33a34,#8f2420 55%,#681611);box-shadow:inset 0 1px #ffffff59,0 1px 3px #0005;color:#fff;font:bold 11px Verdana,Arial,sans-serif;text-shadow:1px 1px #000;cursor:pointer}',
            '#script-coleta-settings .sc-settings-toggle.sc-ligado{background:linear-gradient(#5f9f3d,#3f7c27 55%,#28551a)}',
            '#script-coleta-settings .sc-settings-toggle:hover,#script-coleta-settings .sc-settings-toggle:focus-visible{filter:brightness(1.15)}',
            '#script-coleta-settings .sc-settings-body{padding:8px}',
            '#script-coleta-settings .sc-section-title{display:flex;align-items:center;gap:8px;margin:0 0 6px;color:#75501f;font-weight:bold;letter-spacing:1.2px}',
            '#script-coleta-settings .sc-section-title::after{content:"";height:1px;flex:1;background:#b99658}',
            '#script-coleta-settings .sc-unit-grid{display:grid;grid-template-columns:repeat(4,minmax(175px,1fr));gap:8px}',
            '#script-coleta-settings .sc-unit-card,#script-coleta-settings .sc-control-card{min-width:0;border:1px solid #c4a15d;border-radius:4px;background:#faefd0;box-shadow:0 1px 2px #70502024;overflow:hidden;transition:opacity .15s ease}',
            '#script-coleta-settings .sc-option-off{opacity:.56}',
            '#script-coleta-settings .sc-unit-head,#script-coleta-settings .sc-control-head{display:flex;align-items:center;gap:7px;min-height:34px;padding:4px 8px;border-bottom:1px solid #d3b778;background:#f8e8bc}',
            '#script-coleta-settings .sc-unit-icon{display:inline-flex;align-items:center;justify-content:center;width:25px;height:24px;border:1px solid #594325;border-radius:4px;background:linear-gradient(#7f6846,#3f3020);box-shadow:inset 0 1px #ffffff73,0 1px 2px #0005}',
            '#script-coleta-settings .sc-unit-icon img{display:block;max-width:20px;max-height:20px}',
            '#script-coleta-settings .sc-unit-name{flex:1;font-weight:bold;font-size:11px}',
            '#script-coleta-settings .sc-switch{display:inline-flex;align-items:center;gap:5px;cursor:pointer;user-select:none;white-space:nowrap}',
            '#script-coleta-settings .sc-switch input{position:absolute;opacity:0;pointer-events:none}',
            '#script-coleta-settings .sc-switch-track{position:relative;width:32px;height:18px;border:1px solid #a37b35;border-radius:10px;background:#ecd8a5;box-shadow:inset 0 1px 2px #0003}',
            '#script-coleta-settings .sc-switch-track::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#9a855b;box-shadow:0 1px 2px #0005;transition:left .14s ease,background .14s ease}',
            '#script-coleta-settings .sc-switch input:checked+.sc-switch-track{background:#b48335}',
            '#script-coleta-settings .sc-switch input:checked+.sc-switch-track::after{left:16px;background:#f5dfaa}',
            '#script-coleta-settings .sc-switch input:focus-visible+.sc-switch-track{outline:2px solid #3777c7;outline-offset:1px}',
            '#script-coleta-settings .sc-unit-body,#script-coleta-settings .sc-control-body{padding:7px 8px}',
            '#script-coleta-settings .sc-unit-body label,#script-coleta-settings .sc-control-body label{display:grid;grid-template-columns:minmax(88px,1fr) 82px;align-items:center;gap:6px;color:#75532b;font-weight:bold;font-size:9px;text-transform:uppercase}',
            '#script-coleta-settings input[type=number],#script-coleta-settings input[type=text],#script-coleta-settings select{width:100%;height:25px;padding:2px 5px;border:1px solid #d2b275;border-radius:3px;background:#fffaf0;color:#3b2814;font:11px Verdana,Arial,sans-serif}',
            '#script-coleta-settings input:disabled,#script-coleta-settings select:disabled{cursor:not-allowed;opacity:.62;background:#f0e3bf}',
            '#script-coleta-settings .sc-controls-grid{display:grid;grid-template-columns:minmax(260px,.7fr) minmax(380px,1.3fr);gap:8px;margin-top:8px}',
            '#script-coleta-settings .sc-control-head>span:first-child{flex:1;color:#75501f;font-weight:bold;letter-spacing:.7px}',
            '#script-coleta-settings .sc-two-fields{display:grid;grid-template-columns:1fr 1.35fr;gap:10px}',
            '#script-coleta-settings .sc-input-suffix{display:grid;grid-template-columns:1fr 16px;align-items:center;gap:3px}',
            '#script-coleta-settings .sc-input-suffix small{font-size:9px;text-transform:none}',
            '#script-coleta-settings .sc-group-status{grid-column:1/-1;min-height:25px;padding:5px 7px;border:1px dashed #d1b475;border-radius:3px;background:#fff4d6;color:#80643b;font-size:9px;line-height:14px}',
            '#script-coleta-settings .sc-status{margin-top:8px;padding:6px 8px;border:1px dashed #d1b475;border-radius:3px;background:#fff4d6;color:#80643b;font-size:10px}',
            '#script-coleta-settings .sc-status strong{color:#5d2d12}',
            '#script-coleta-settings .sc-note{display:block;margin-top:7px;color:#87683d;font-size:9px;line-height:13px}',
            '@media(max-width:1200px){#script-coleta-settings .sc-unit-grid{grid-template-columns:repeat(3,minmax(175px,1fr))}}',
            '@media(max-width:850px){#script-coleta-settings .sc-unit-grid{grid-template-columns:repeat(2,minmax(175px,1fr))}#script-coleta-settings .sc-controls-grid{grid-template-columns:1fr}}',
            '@media(max-width:560px){#script-coleta-settings .sc-unit-grid,#script-coleta-settings .sc-two-fields{grid-template-columns:1fr}#script-coleta-settings .sc-settings-title{font-size:15px}}'
        ].join('');
        document.head.appendChild(estilo);
    }

    function criarPainel() {
        if (document.getElementById(PANEL_ID)) {
            atualizarResumoPainel();
            return;
        }

        var content = document.getElementById('content_value') || document.body;
        var painel = document.createElement('div');
        painel.id = PANEL_ID;
        painel.innerHTML = montarHtmlPainel();

        var referencia = content.querySelector(
            '.scavenge-mass-screen, .scavenge-screen, .candidate-squad-widget, .vis'
        );
        if (referencia && referencia.parentNode) {
            referencia.parentNode.insertBefore(painel, referencia);
        } else {
            content.insertBefore(painel, content.firstChild);
        }

        preencherPainel();
        carregarGruposNoPainel();
        painel.addEventListener('change', tratarEdicaoPainel);
        painel.addEventListener('input', function (evento) {
            if (
                evento.target instanceof HTMLInputElement &&
                (evento.target.type === 'number' || evento.target.type === 'text')
            ) {
                agendarGuardarPainel();
            }
        });
        painel.querySelector('#' + PANEL_TOGGLE_ID).addEventListener(
            'click',
            alternarEstadoPeloPainel
        );
        atualizarResumoPainel();
    }

    function montarHtmlPainel() {
        var unidades = obterUnidadesDisponiveisNoMundo().map(function (unidade) {
            return [
                '<article class="sc-unit-card" data-sc-unit-card="', unidade, '">',
                '<header class="sc-unit-head">',
                '<span class="sc-unit-icon"><img src="/graphic/unit/unit_', unidade, '.png" alt=""></span>',
                '<span class="sc-unit-name">', UNIT_LABELS[unidade], '</span>',
                '<label class="sc-switch">',
                '<input type="checkbox" data-sc-unit="', unidade, '">',
                '<span class="sc-switch-track" aria-hidden="true"></span>',
                '<span>Ativo</span>',
                '</label>',
                '</header>',
                '<div class="sc-unit-body">',
                '<label><span>Deixar em casa</span>',
                '<input type="number" min="0" max="999999" step="1" ',
                'data-sc-keep="', unidade, '" title="Unidades a deixar em casa"></label>',
                '</div>',
                '</article>'
            ].join('');
        }).join('');

        return [
            '<header class="sc-settings-title">',
            '<span>Buscas/Coleta — Definições</span>',
            '<span class="sc-settings-actions">',
            '<small data-sc-saved>Guardado automaticamente</small>',
            '<button id="', PANEL_TOGGLE_ID, '" class="sc-settings-toggle" type="button">Ligar</button>',
            '</span>',
            '</header>',
            '<div class="sc-settings-body">',
            '<div class="sc-section-title">UNIDADES DE COLETA</div>',
            '<div class="sc-unit-grid">', unidades, '</div>',
            '<div class="sc-controls-grid">',
            '<article class="sc-control-card sc-unlock-card">',
            '<header class="sc-control-head">',
            '<span>DESBLOQUEAR NÍVEIS</span>',
            '<label class="sc-switch">',
            '<input type="checkbox" data-sc-unlock>',
            '<span class="sc-switch-track" aria-hidden="true"></span>',
            '<span>Ativo</span>',
            '</label>',
            '</header>',
            '<div class="sc-control-body">',
            '<label><span>Tentar a cada</span><select data-sc-unlock-every>',
            '<option value="3">3 ciclos</option>',
            '<option value="4">4 ciclos</option>',
            '<option value="5">5 ciclos</option>',
            '</select></label>',
            '</div>',
            '</article>',
            '<article class="sc-control-card">',
            '<header class="sc-control-head"><span>ALDEIAS E TEMPOS</span></header>',
            '<div class="sc-control-body sc-two-fields">',
            '<label><span>Grupo</span><select data-sc-group aria-label="Grupo de aldeias da coleta">',
            '<option value="0">Todas as aldeias</option>',
            '</select></label>',
            '<label><span>Margem após regresso</span><span class="sc-input-suffix">',
            '<input type="number" min="30" max="300" step="5" data-sc-buffer><small>s</small>',
            '</span></label>',
            '<div class="sc-group-status" data-sc-group-status>A carregar os grupos e aldeias do jogo…</div>',
            '</div>',
            '</article>',
            '</div>',
            '<small class="sc-note">O rácio é calculado pela capacidade de saque e pelos fatores reais dos níveis. ',
            'Com quatro níveis equivale a 15:6:3:2.</small>',
            '<div class="sc-status" data-sc-status></div>',
            '</div>'
        ].join('');
    }

    function preencherPainel() {
        var painel = document.getElementById(PANEL_ID);
        if (!painel) {
            return;
        }

        obterUnidadesDisponiveisNoMundo().forEach(function (unidade) {
            painel.querySelector('[data-sc-unit="' + unidade + '"]').checked =
                Boolean(CONFIG.enabledUnits[unidade]);
            painel.querySelector('[data-sc-keep="' + unidade + '"]').value =
                String(CONFIG.keepHome[unidade] || 0);
        });
        garantirOpcaoGrupoGuardado(
            painel.querySelector('[data-sc-group]'),
            CONFIG.groupId
        );
        painel.querySelector('[data-sc-group]').value = CONFIG.groupId;
        painel.querySelector('[data-sc-unlock]').checked = CONFIG.unlockEnabled;
        painel.querySelector('[data-sc-unlock-every]').value =
            String(CONFIG.unlockEveryCycles);
        painel.querySelector('[data-sc-buffer]').value =
            String(CONFIG.returnBufferSeconds);
        atualizarEstadoControlosPainel();
    }

    function tratarEdicaoPainel(evento) {
        if (
            !(evento.target instanceof HTMLInputElement) &&
            !(evento.target instanceof HTMLSelectElement)
        ) {
            return;
        }
        if (evento.target.id === PANEL_TOGGLE_ID) {
            return;
        }
        guardarPainel();
    }

    function agendarGuardarPainel() {
        var indicador = document.querySelector(
            '#' + PANEL_ID + ' [data-sc-saved]'
        );
        if (indicador) {
            indicador.textContent = 'A guardar…';
        }
        if (timerGuardarPainel !== null) {
            window.clearTimeout(timerGuardarPainel);
        }
        timerGuardarPainel = window.setTimeout(function () {
            timerGuardarPainel = null;
            guardarPainel();
        }, 300);
    }

    function guardarPainel() {
        var painel = document.getElementById(PANEL_ID);
        if (!painel) {
            return;
        }
        if (timerGuardarPainel !== null) {
            window.clearTimeout(timerGuardarPainel);
            timerGuardarPainel = null;
        }

        obterUnidadesDisponiveisNoMundo().forEach(function (unidade) {
            CONFIG.enabledUnits[unidade] = painel.querySelector(
                '[data-sc-unit="' + unidade + '"]'
            ).checked;
            CONFIG.keepHome[unidade] = limitarInteiro(
                painel.querySelector('[data-sc-keep="' + unidade + '"]').value,
                0,
                999999,
                0
            );
        });

        var grupoAnterior = String(CONFIG.groupId || '0');
        var grupo = String(painel.querySelector('[data-sc-group]').value).trim();
        CONFIG.groupId = /^-?\d+$/.test(grupo) ? grupo : '0';
        CONFIG.unlockEnabled = painel.querySelector('[data-sc-unlock]').checked;
        CONFIG.unlockEveryCycles = limitarInteiro(
            painel.querySelector('[data-sc-unlock-every]').value,
            3,
            5,
            4
        );
        CONFIG.returnBufferSeconds = limitarInteiro(
            painel.querySelector('[data-sc-buffer]').value,
            30,
            300,
            60
        );

        escreverJsonSeguro(localStorage, SETTINGS_KEY, CONFIG);
        estado.nextRunAt = 0;
        guardarEstado();
        atualizarEstadoControlosPainel();
        mostrarPainelGuardado();
        if (grupoAnterior !== CONFIG.groupId) {
            carregarGruposNoPainel();
        }
        if (estaLigado()) {
            reiniciarAutomacaoAposEdicao();
        }
    }

    function mostrarPainelGuardado() {
        var indicador = document.querySelector(
            '#' + PANEL_ID + ' [data-sc-saved]'
        );
        if (!indicador) {
            return;
        }
        indicador.textContent = 'Guardado';
        window.setTimeout(function () {
            if (indicador.isConnected) {
                indicador.textContent = 'Guardado automaticamente';
            }
        }, 900);
    }

    async function carregarGruposNoPainel() {
        var painel = document.getElementById(PANEL_ID);
        var seletor = painel && painel.querySelector('[data-sc-group]');
        var resumo = painel && painel.querySelector('[data-sc-group-status]');
        if (!seletor || !resumo) {
            return;
        }

        var versao = ++geracaoGrupos;
        var selecionado = String(CONFIG.groupId || '0');
        seletor.disabled = true;
        resumo.textContent = 'A carregar os grupos e aldeias do jogo…';

        try {
            var dados = await obterDadosGrupo(selecionado);
            if (versao !== geracaoGrupos || !seletor.isConnected) {
                return;
            }
            seletor.textContent = '';
            dados.groups.forEach(function (grupo) {
                var opcao = document.createElement('option');
                opcao.value = grupo.id;
                opcao.textContent = grupo.name;
                seletor.appendChild(opcao);
            });
            garantirOpcaoGrupoGuardado(seletor, selecionado);
            seletor.value = selecionado;
            resumo.textContent = dados.name + ': ' + dados.villages.length +
                ' aldeia(s). Cada aldeia é processada separadamente em segundo plano.';
        } catch (erro) {
            if (versao !== geracaoGrupos || !seletor.isConnected) {
                return;
            }
            garantirOpcaoGrupoGuardado(seletor, selecionado);
            seletor.value = selecionado;
            resumo.textContent = 'Não foi possível atualizar os grupos: ' +
                resumirMensagem(obterMensagemErro(erro), 120);
            console.warn('[Script Coleta] Não foi possível carregar os grupos.', erro);
        } finally {
            if (versao === geracaoGrupos && seletor.isConnected) {
                seletor.disabled = false;
            }
        }
    }

    function garantirOpcaoGrupoGuardado(seletor, grupoId) {
        if (!seletor) {
            return;
        }
        var opcoes = Array.from(seletor.options || []);
        if (!opcoes.some(function (opcao) { return opcao.value === '0'; })) {
            seletor.add(new Option('Todas as aldeias', '0'));
        }
        var id = String(grupoId || '0');
        if (!Array.from(seletor.options || []).some(function (opcao) {
            return opcao.value === id;
        })) {
            seletor.add(new Option('Grupo guardado #' + id, id));
        }
    }

    async function obterDadosGrupo(grupoId) {
        var modos = ['units', 'combined'];
        var grupos = [];
        var vistos = new Set();
        var ultimoErro = null;
        var recebeuPagina = false;

        for (var indice = 0; indice < modos.length; indice += 1) {
            try {
                var resposta = await obterDocumento(
                    criarUrlVisaoGeralGrupo(grupoId, modos[indice]),
                    30000
                );
                var documento = resposta.document;
                if (documentoTemProtecaoBot(documento)) {
                    throw new Error(
                        'O jogo pediu uma verificação antes de listar os grupos.'
                    );
                }
                recebeuPagina = true;
                extrairGruposJogo(documento).forEach(function (grupo) {
                    if (!vistos.has(grupo.id)) {
                        vistos.add(grupo.id);
                        grupos.push(grupo);
                    }
                });
                var aldeias = extrairAldeiasGrupo(documento);
                if (aldeias.length) {
                    var normalizados = garantirGrupoTodas(grupos);
                    var selecionado = normalizados.find(function (grupo) {
                        return grupo.id === String(grupoId);
                    });
                    return {
                        groups: normalizados,
                        villages: aldeias,
                        name: selecionado
                            ? selecionado.name
                            : (String(grupoId) === '0'
                                ? 'Todas as aldeias'
                                : 'Grupo #' + grupoId)
                    };
                }
            } catch (erro) {
                ultimoErro = erro;
                if (/verifica(?:ção|cao)/i.test(obterMensagemErro(erro))) {
                    throw erro;
                }
            }
        }

        if (!recebeuPagina && ultimoErro) {
            throw ultimoErro;
        }
        var gruposNormalizados = garantirGrupoTodas(grupos);
        var grupoSelecionado = gruposNormalizados.find(function (grupo) {
            return grupo.id === String(grupoId);
        });
        if (String(grupoId) !== '0' && !grupoSelecionado) {
            throw new Error('O grupo escolhido já não existe ou não pôde ser lido.');
        }
        return {
            groups: gruposNormalizados,
            villages: [],
            name: grupoSelecionado ? grupoSelecionado.name : 'Todas as aldeias'
        };
    }

    function criarUrlVisaoGeralGrupo(grupoId, modo) {
        var url = new URL(window.location.href);
        url.searchParams.set('screen', 'overview_villages');
        url.searchParams.set('mode', modo);
        if (modo === 'units') {
            url.searchParams.set('type', 'complete');
            url.searchParams.set('units_type', 'complete');
        } else {
            url.searchParams.delete('type');
            url.searchParams.delete('units_type');
        }
        url.searchParams.set('group', String(grupoId));
        url.searchParams.set('page', '-1');
        ['action', 'ajax', 'ajaxaction', 'h'].forEach(function (chave) {
            url.searchParams.delete(chave);
        });
        url.hash = '';
        return url.href;
    }

    function extrairGruposJogo(documento) {
        var grupos = [];
        var vistos = new Set();
        documento.querySelectorAll([
            '#group_selection option',
            'select[name="group"] option',
            'select[id*="group"] option'
        ].join(',')).forEach(function (opcao) {
            var id = String(opcao.value || '').trim();
            if (!/^-?\d+$/.test(id) || vistos.has(id)) {
                return;
            }
            vistos.add(id);
            grupos.push({
                id: id,
                name: String(opcao.textContent || '').trim() || 'Grupo #' + id
            });
        });
        return garantirGrupoTodas(grupos);
    }

    function garantirGrupoTodas(gruposOriginais) {
        var grupos = Array.isArray(gruposOriginais)
            ? gruposOriginais.slice()
            : [];
        if (!grupos.some(function (grupo) { return grupo.id === '0'; })) {
            grupos.unshift({ id: '0', name: 'Todas as aldeias' });
        }
        return grupos;
    }

    function extrairAldeiasGrupo(documento) {
        var aldeias = [];
        var vistas = new Set();
        documento.querySelectorAll([
            '#units_table tr',
            '#combined_table tr',
            '#production_table tr',
            '#buildings_table tr',
            'table.overview_table tr',
            'table.vis tr'
        ].join(',')).forEach(function (linha) {
            if (!/\d{1,3}\s*[|]\s*\d{1,3}/.test(linha.textContent || '')) {
                return;
            }
            var id = '';
            var ligacao = linha.querySelector('a[href*="village="]');
            if (ligacao) {
                try {
                    id = new URL(
                        ligacao.href,
                        window.location.href
                    ).searchParams.get('village') || '';
                } catch (erro) {
                    id = '';
                }
            }
            if (!/^\d+$/.test(id)) {
                var marcado = linha.matches('[data-village-id],[data-id]')
                    ? linha
                    : linha.querySelector('[data-village-id],[data-id]');
                id = String(
                    (marcado && marcado.getAttribute('data-village-id')) ||
                    (marcado && marcado.getAttribute('data-id')) ||
                    ''
                );
            }
            if (/^\d+$/.test(id) && Number(id) > 0 && !vistas.has(id)) {
                vistas.add(id);
                aldeias.push(id);
            }
        });
        return aldeias;
    }

    function documentoTemProtecaoBot(documento) {
        return Boolean(documento && documento.querySelector(
            '#bot_check,.g-recaptcha,[id*="captcha"],[data-sitekey]'
        ));
    }

    function atualizarEstadoControlosPainel() {
        var painel = document.getElementById(PANEL_ID);
        if (!painel) {
            return;
        }

        obterUnidadesDisponiveisNoMundo().forEach(function (unidade) {
            var ativo = Boolean(CONFIG.enabledUnits[unidade]);
            var card = painel.querySelector(
                '[data-sc-unit-card="' + unidade + '"]'
            );
            var reserva = painel.querySelector('[data-sc-keep="' + unidade + '"]');
            if (card) {
                card.classList.toggle('sc-option-off', !ativo);
            }
            if (reserva) {
                reserva.disabled = !ativo;
            }
        });

        var unlockAtivo = Boolean(CONFIG.unlockEnabled);
        var unlockCard = painel.querySelector('.sc-unlock-card');
        var unlockEvery = painel.querySelector('[data-sc-unlock-every]');
        if (unlockCard) {
            unlockCard.classList.toggle('sc-option-off', !unlockAtivo);
        }
        if (unlockEvery) {
            unlockEvery.disabled = !unlockAtivo;
        }
        atualizarBotaoPainel();
    }

    function alternarEstadoPeloPainel(evento) {
        evento.preventDefault();
        definirEstadoScript(!estaLigado(), true);
    }

    function alternarEstadoPelaBarra() {
        definirEstadoScript(!estaLigado(), true);
    }

    function definirEstadoScript(ligar, aberturaPorClique) {
        localStorage.setItem(STORAGE_KEY, ligar ? '1' : '0');
        pararAutomacao(!ligar);

        if (ligar) {
            estado.nextRunAt = 0;
            guardarEstado();
            atualizarBotao('A iniciar…');
            iniciarAutomacao(Boolean(aberturaPorClique));
        } else {
            if (
                !eSeparadorTrabalhoGerido() &&
                workerWindowRef &&
                !workerWindowRef.closed
            ) {
                try {
                    workerWindowRef.close();
                } catch (erro) {
                    // O navegador pode já ter eliminado a referência.
                }
                workerWindowRef = null;
            }
            atualizarBotao('Parado');
        }
        atualizarBotaoPainel();
    }

    function atualizarBotaoPainel() {
        var toggle = document.getElementById(PANEL_TOGGLE_ID);
        if (!toggle) {
            return;
        }
        var ligado = estaLigado();
        toggle.textContent = ligado ? 'Desligar' : 'Ligar';
        toggle.classList.toggle('sc-ligado', ligado);
        toggle.setAttribute('aria-pressed', ligado ? 'true' : 'false');
        toggle.setAttribute(
            'aria-label',
            ligado ? 'Desligar Buscas/Coleta' : 'Ligar Buscas/Coleta'
        );
    }

    function reiniciarAutomacaoAposEdicao() {
        geracao += 1;
        limparTimerPrincipal();

        function retomarQuandoSeguro() {
            if (!estaLigado()) {
                return;
            }
            if (cicloEmCurso) {
                timerPrincipal = window.setTimeout(retomarQuandoSeguro, 250);
                return;
            }
            iniciarAutomacao();
        }

        retomarQuandoSeguro();
    }

    function obterUnidadesDisponiveisNoMundo() {
        var unidadesJogo = window.game_data && window.game_data.units;
        if (Array.isArray(unidadesJogo) && unidadesJogo.length) {
            return Object.keys(UNIT_CARRY).filter(function (unidade) {
                return unidadesJogo.indexOf(unidade) !== -1;
            });
        }

        return Object.keys(UNIT_CARRY).filter(function (unidade) {
            if (unidade !== 'archer' && unidade !== 'marcher') {
                return true;
            }
            return Boolean(document.querySelector(
                'input[name="' + unidade + '"], [data-unit="' + unidade + '"]'
            ));
        });
    }

    function atualizarResumoPainel() {
        var painel = document.getElementById(PANEL_ID);
        var alvo = painel && painel.querySelector('[data-sc-status]');
        if (!alvo) {
            return;
        }

        var partes = [
            '<strong>' + (estaLigado() ? 'Ligado' : 'Desligado') + '</strong>',
            escaparHtml(estado.lastSummary || estadoAtual || 'Sem ciclos executados.')
        ];
        if (estaLigado() && Number(estado.nextRunAt) > Date.now()) {
            partes.push('Próxima verificação em ' + formatarDuracao(
                Number(estado.nextRunAt) - Date.now()
            ) + '.');
        }
        alvo.innerHTML = partes.join(' — ');
    }

    function iniciarAutomacao(aberturaPorClique) {
        if (!estaLigado()) {
            return;
        }

        geracao += 1;
        limparTimerPrincipal();

        if (!estaNaPaginaTrabalho() || !eSeparadorTrabalhoGerido()) {
            iniciarSupervisor();
            if (workerEstaAtivo()) {
                atualizarBotao('A trabalhar noutro separador');
            } else if (aberturaPorClique) {
                abrirWorker({ focar: true, automatico: false });
            } else {
                supervisionarWorker();
            }
            return;
        }

        if (!iniciarHeartbeat()) {
            atualizarBotao('Em pausa — outro separador SC está ativo');
            return;
        }

        agendarProximaExecucao();
    }

    function executarAgora() {
        if (!estaLigado()) {
            localStorage.setItem(STORAGE_KEY, '1');
        }
        estado.nextRunAt = 0;
        guardarEstado();
        pararAutomacao(false);
        atualizarBotao('Execução manual…');
        iniciarAutomacao(true);
    }

    function pararAutomacao(removerEstadoWorker) {
        geracao += 1;
        cicloEmCurso = false;
        limparTimerPrincipal();
        pararHeartbeat(removerEstadoWorker !== false);
        pararSupervisor();
    }

    function agendarProximaExecucao() {
        limparTimerPrincipal();
        if (
            !estaLigado() ||
            !estaNaPaginaTrabalho() ||
            !eSeparadorTrabalhoGerido()
        ) {
            return;
        }

        var restante = Number(estado.nextRunAt) - Date.now();
        if (restante <= 0) {
            timerPrincipal = window.setTimeout(executarCiclo, 150);
            return;
        }

        atualizarContagem();
        timerPrincipal = window.setTimeout(
            executarCiclo,
            Math.min(restante, 2147480000)
        );
    }

    function atualizarContagem() {
        if (timerContagem !== null) {
            window.clearTimeout(timerContagem);
            timerContagem = null;
        }
        if (!estaLigado()) {
            atualizarBotao('Parado');
            return;
        }

        var restante = Math.max(0, Number(estado.nextRunAt) - Date.now());
        if (!restante) {
            return;
        }
        var contagem = formatarDuracao(restante);
        atualizarBotao('Próxima verificação em ' + contagem, contagem);
        atualizarResumoPainel();
        timerContagem = window.setTimeout(atualizarContagem, 1000);
    }

    function limparTimerPrincipal() {
        if (timerPrincipal !== null) {
            window.clearTimeout(timerPrincipal);
            timerPrincipal = null;
        }
        if (timerContagem !== null) {
            window.clearTimeout(timerContagem);
            timerContagem = null;
        }
    }

    async function executarCiclo() {
        if (
            cicloEmCurso ||
            !estaLigado() ||
            !estaNaPaginaTrabalho() ||
            !eSeparadorTrabalhoGerido()
        ) {
            return;
        }
        if (temProtecaoBot()) {
            pausarPorProtecaoBot();
            return;
        }

        cicloEmCurso = true;
        var geracaoAtual = geracao;
        atualizarBotao('A ler aldeias e coletas…');

        try {
            var dados = await carregarDadosColeta(null, geracaoAtual);
            if (geracaoAtual !== geracao || !estaLigado()) {
                return;
            }
            var recuperacao = await tentarDesbloquearPrimeiroNivelAldeias(
                dados.unreadVillageIds,
                geracaoAtual
            );
            if (geracaoAtual !== geracao || !estaLigado()) {
                return;
            }
            if (!dados.villages.length) {
                if (recuperacao.iniciados) {
                    estado.lastRunAt = Date.now();
                    estado.consecutiveErrors = 0;
                    estado.nextRunAt = Date.now() + 60 * 1000;
                    estado.lastSummary =
                        recuperacao.iniciados +
                        ' aldeia(s) — desbloqueio do nível 1 iniciado';
                    guardarEstado();
                    atualizarBotao(estado.lastSummary);
                    fecharSeparadorNoFimDaRonda(geracaoAtual);
                    return;
                }
                throw new Error(
                    'As páginas individuais não devolveram dados utilizáveis.' +
                    (recuperacao.motivo
                        ? ' Recuperação do nível 1: ' + recuperacao.motivo
                        : '')
                );
            }

            var resultado = await planearEEnviar(dados, geracaoAtual);
            if (geracaoAtual !== geracao || !estaLigado()) {
                return;
            }
            if (recuperacao.iniciados) {
                resultado.summary += ' — ' + recuperacao.iniciados +
                    ' desbloqueios de recuperação iniciados';
                resultado.nextRunAt = Math.min(
                    resultado.nextRunAt,
                    Date.now() + 60 * 1000
                );
            }

            estado.lastRunAt = Date.now();
            estado.consecutiveErrors = 0;
            estado.lastSummary = resultado.summary;
            estado.nextRunAt = resultado.nextRunAt;
            guardarEstado();
            atualizarBotao(resultado.summary);
            fecharSeparadorNoFimDaRonda(geracaoAtual);
        } catch (erro) {
            if (geracaoAtual !== geracao || !estaLigado()) {
                return;
            }
            estado.consecutiveErrors += 1;
            var espera = Math.min(
                30 * 60 * 1000,
                60 * 1000 * Math.pow(2, Math.min(4, estado.consecutiveErrors - 1))
            );
            estado.nextRunAt = Date.now() + espera;
            estado.lastSummary = 'Erro: ' + resumirMensagem(obterMensagemErro(erro), 120);
            guardarEstado();
            console.error('[Script Coleta]', erro);
            atualizarBotao(estado.lastSummary);
        } finally {
            cicloEmCurso = false;
            if (estaLigado() && geracaoAtual === geracao) {
                agendarProximaExecucao();
            }
        }
    }

    function fecharSeparadorNoFimDaRonda(geracaoAtual) {
        window.setTimeout(function () {
            if (
                geracaoAtual === geracao &&
                estaLigado() &&
                estaNaPaginaTrabalho() &&
                eSeparadorTrabalhoGerido() &&
                !temProtecaoBot()
            ) {
                atualizarBotao('Ronda concluída — a fechar separador');
                pararHeartbeat(true);
                try {
                    window.close();
                } catch (erro) {
                    console.warn(
                        '[Script Coleta] O navegador não permitiu fechar o separador.',
                        erro
                    );
                }
            }
        }, 750);
    }

    async function planearEEnviar(dados, geracaoAtual) {
        var agora = Date.now();
        var pedidos = [];
        var planosPorAldeia = {};
        var candidatosEspera = [];
        var estimativasEnvio = [];
        var desbloqueiosIniciais = [];
        var semTropas = 0;
        var ocupadas = 0;
        var semPraca = 0;

        dados.villages.forEach(function (aldeia) {
            if (!aldeia.hasRallyPoint) {
                semPraca += 1;
                return;
            }

            var opcoes = aldeia.options.slice().sort(function (a, b) {
                return a.id - b.id;
            });
            var desbloqueadas = opcoes.filter(function (opcao) {
                return !opcao.isLocked;
            });
            var ativas = desbloqueadas.filter(function (opcao) {
                return Boolean(opcao.squad);
            });

            opcoes.forEach(function (opcao) {
                var fimDesbloqueio = obterFimDesbloqueio(opcao);
                if (fimDesbloqueio > agora) {
                    candidatosEspera.push(fimDesbloqueio + 10000);
                }
            });

            if (!desbloqueadas.length) {
                var primeira = opcoes.find(function (opcao) {
                    return opcao.isLocked;
                });
                if (
                    CONFIG.unlockEnabled &&
                    primeira &&
                    !obterFimDesbloqueio(primeira) &&
                    podeTentarPrimeiroDesbloqueio(aldeia.id, primeira.id, agora)
                ) {
                    desbloqueiosIniciais.push({
                        villageId: aldeia.id,
                        optionId: primeira.id,
                        initial: true
                    });
                }
                return;
            }

            if (ativas.length) {
                ocupadas += 1;
                var regressos = ativas.map(obterRegressoSquad).filter(Boolean);
                if (regressos.length) {
                    candidatosEspera.push(
                        Math.max.apply(Math, regressos) + obterMargemRegresso()
                    );
                }
                return;
            }

            var plano = criarPlanoAldeia(aldeia, desbloqueadas, dados.optionBases);
            if (!plano.requests.length) {
                semTropas += 1;
                return;
            }

            planosPorAldeia[String(aldeia.id)] = plano;
            Array.prototype.push.apply(pedidos, plano.requests);
        });

        var desbloqueiosFeitos = await executarDesbloqueios(
            desbloqueiosIniciais,
            geracaoAtual
        );
        var aldeiasEnviadas = new Set();
        if (pedidos.length && geracaoAtual === geracao && estaLigado()) {
            atualizarBotao(
                'A lançar ' + pedidos.length + ' coletas em ' +
                Object.keys(planosPorAldeia).length + ' aldeias…'
            );
            aldeiasEnviadas = await enviarPedidosEmLotes(pedidos, geracaoAtual);
        }

        var desbloqueiosDeCiclo = [];
        aldeiasEnviadas.forEach(function (aldeiaId) {
            var chave = String(aldeiaId);
            var plano = planosPorAldeia[chave];
            if (!plano) {
                return;
            }

            var novoCiclo = Math.max(
                0,
                Number(estado.cyclesByVillage[chave]) || 0
            ) + 1;
            estado.cyclesByVillage[chave] = novoCiclo;

            if (CONFIG.unlockEnabled) {
                var proxima = obterProximoDesbloqueioDevido(
                    plano.village,
                    novoCiclo
                );
                var tentativaChave = chave + ':' + (proxima ? proxima.id : 0);
                if (
                    proxima &&
                    Number(estado.unlockAttempts[tentativaChave]) !== novoCiclo
                ) {
                    estado.unlockAttempts[tentativaChave] = novoCiclo;
                    desbloqueiosDeCiclo.push({
                        villageId: aldeiaId,
                        optionId: proxima.id,
                        initial: false
                    });
                }
            }
        });

        desbloqueiosFeitos += await executarDesbloqueios(
            desbloqueiosDeCiclo,
            geracaoAtual
        );

        Object.keys(planosPorAldeia).forEach(function (chave) {
            if (!aldeiasEnviadas.has(Number(chave))) {
                return;
            }
            var plano = planosPorAldeia[chave];
            plano.requests.forEach(function (pedido) {
                var estimado = estimarRegressoPedido(
                    pedido,
                    plano.village,
                    dados.optionBases
                );
                if (estimado) {
                    estimativasEnvio.push(estimado + obterMargemRegresso());
                }
            });
        });

        if (aldeiasEnviadas.size && geracaoAtual === geracao && estaLigado()) {
            atualizarBotao('A confirmar os horários de regresso…');
            try {
                await esperar(1400);
                var dadosConfirmados = await carregarDadosColeta(
                    Array.from(aldeiasEnviadas),
                    geracaoAtual
                );
                var regressosConfirmados = obterProximosRegressos(
                    dadosConfirmados,
                    aldeiasEnviadas
                );
                Array.prototype.push.apply(
                    candidatosEspera,
                    regressosConfirmados.length
                        ? regressosConfirmados
                        : estimativasEnvio
                );
            } catch (erroConfirmacao) {
                console.warn(
                    '[Script Coleta] Foi usada a duração calculada porque a ' +
                    'confirmação do regresso falhou.',
                    erroConfirmacao
                );
                Array.prototype.push.apply(candidatosEspera, estimativasEnvio);
            }
        }

        var proxima = candidatosEspera.filter(function (momento) {
            return Number(momento) > agora + 5000;
        }).sort(function (a, b) { return a - b; })[0];

        if (!proxima) {
            proxima = agora + RETRY_WITHOUT_WORK;
        }

        var enviados = aldeiasEnviadas.size;
        var resumo = enviados
            ? enviados + ' aldeias lançadas (' + pedidos.length + ' coletas)'
            : 'Nenhuma aldeia pronta';
        if (desbloqueiosFeitos) {
            resumo += ' — ' + desbloqueiosFeitos + ' desbloqueios iniciados';
        }
        if (!enviados && ocupadas) {
            resumo += ' — ' + ocupadas + ' com tropas em coleta';
        }
        if (semTropas) {
            resumo += ' — ' + semTropas + ' sem tropas disponíveis';
        }
        if (semPraca) {
            resumo += ' — ' + semPraca + ' sem Praça de Reuniões';
        }

        return {
            summary: resumo,
            nextRunAt: Math.max(agora + 15000, proxima)
        };
    }

    function obterProximoDesbloqueioDevido(aldeia, ciclosConcluidos) {
        var proxima = (aldeia.options || [])
            .slice()
            .sort(function (a, b) { return a.id - b.id; })
            .find(function (opcao) {
                return opcao.isLocked;
            });
        if (!proxima || obterFimDesbloqueio(proxima)) {
            return null;
        }
        var ciclosNecessarios = Math.max(1, Number(proxima.id) - 1) *
            CONFIG.unlockEveryCycles;
        return Number(ciclosConcluidos) >= ciclosNecessarios
            ? proxima
            : null;
    }

    function obterProximosRegressos(dados, aldeiasEnviadas) {
        var regressos = [];
        dados.villages.forEach(function (aldeia) {
            if (!aldeiasEnviadas.has(Number(aldeia.id))) {
                return;
            }
            var porAldeia = aldeia.options
                .map(obterRegressoSquad)
                .filter(function (momento) {
                    return momento > Date.now();
                });
            if (porAldeia.length) {
                regressos.push(
                    Math.max.apply(Math, porAldeia) + obterMargemRegresso()
                );
            }
        });
        return regressos;
    }

    function criarPlanoAldeia(aldeia, opcoes, optionBases) {
        var disponiveis = {};
        Object.keys(UNIT_CARRY).forEach(function (unidade) {
            if (!CONFIG.enabledUnits[unidade]) {
                return;
            }
            var emCasa = Math.max(0, Number(aldeia.unitsHome[unidade]) || 0);
            var reserva = Math.max(0, Number(CONFIG.keepHome[unidade]) || 0);
            disponiveis[unidade] = Math.max(0, Math.floor(emCasa - reserva));
        });

        var pesos = opcoes.map(function (opcao) {
            var base = obterBaseOpcao(opcao, optionBases);
            var fator = Number(base.loot_factor || base.lootFactor || 0);
            return fator > 0 ? 1 / fator : 1;
        });
        var alocacoes = distribuirUnidades(disponiveis, pesos);
        var requests = [];

        opcoes.forEach(function (opcao, indice) {
            var unidades = alocacoes[indice] || {};
            var quantidade = Object.keys(unidades).reduce(function (total, unidade) {
                return total + (Number(unidades[unidade]) || 0);
            }, 0);
            if (!quantidade) {
                return;
            }

            requests.push({
                village_id: aldeia.id,
                candidate_squad: {
                    unit_counts: unidades,
                    carry_max: calcularCapacidade(unidades, aldeia.unitCarryFactor)
                },
                option_id: opcao.id,
                use_premium: false
            });
        });

        return {
            village: aldeia,
            requests: requests
        };
    }

    function distribuirUnidades(disponiveis, pesos) {
        var somaPesos = pesos.reduce(function (total, peso) {
            return total + Math.max(0, Number(peso) || 0);
        }, 0);
        var saida = pesos.map(function () { return {}; });
        if (!somaPesos || !pesos.length) {
            return saida;
        }

        Object.keys(disponiveis).forEach(function (unidade) {
            var total = Math.max(0, Math.floor(Number(disponiveis[unidade]) || 0));
            if (!total) {
                return;
            }

            var partes = pesos.map(function (peso, indice) {
                var exato = total * Math.max(0, Number(peso) || 0) / somaPesos;
                return {
                    index: indice,
                    value: Math.floor(exato),
                    remainder: exato - Math.floor(exato)
                };
            });
            var usados = partes.reduce(function (soma, parte) {
                return soma + parte.value;
            }, 0);
            partes.slice().sort(function (a, b) {
                return b.remainder - a.remainder || a.index - b.index;
            }).slice(0, total - usados).forEach(function (parte) {
                partes[parte.index].value += 1;
            });
            partes.forEach(function (parte) {
                if (parte.value > 0) {
                    saida[parte.index][unidade] = parte.value;
                }
            });
        });

        return saida;
    }

    function calcularCapacidade(unidades, fatorAldeia) {
        var capacidade = Object.keys(unidades).reduce(function (total, unidade) {
            return total +
                (Number(unidades[unidade]) || 0) *
                (Number(UNIT_CARRY[unidade]) || 0);
        }, 0);
        var fator = Number(fatorAldeia);
        if (!Number.isFinite(fator) || fator <= 0) {
            fator = 1;
        }
        return Math.max(1, Math.floor(capacidade * fator));
    }

    async function enviarPedidosEmLotes(pedidos, geracaoAtual) {
        var aldeiasEnviadas = new Set();
        var porAldeia = [];
        var indicePorAldeia = {};
        pedidos.forEach(function (pedido) {
            var chave = String(pedido.village_id);
            if (indicePorAldeia[chave] === undefined) {
                indicePorAldeia[chave] = porAldeia.length;
                porAldeia.push({ villageId: Number(pedido.village_id), requests: [] });
            }
            porAldeia[indicePorAldeia[chave]].requests.push(pedido);
        });

        for (var indice = 0; indice < porAldeia.length; indice += 1) {
            if (geracaoAtual !== geracao || !estaLigado()) {
                break;
            }
            var aldeia = porAldeia[indice];
            atualizarBotao(
                'A lançar coleta — aldeia ' + (indice + 1) + '/' +
                porAldeia.length
            );
            await postTribalWars(
                'scavenge_api',
                { ajaxaction: 'send_squads' },
                { squad_requests: aldeia.requests }
            );
            aldeiasEnviadas.add(aldeia.villageId);
            if (indice + 1 < porAldeia.length) {
                await esperar(700 + Math.round(Math.random() * 500));
            }
        }
        return aldeiasEnviadas;
    }

    async function executarDesbloqueios(tentativas, geracaoAtual) {
        var iniciados = 0;
        for (var indice = 0; indice < tentativas.length; indice += 1) {
            if (geracaoAtual !== geracao || !estaLigado()) {
                break;
            }
            var tentativa = tentativas[indice];
            if (tentativa.initial) {
                estado.initialUnlockAttempts[
                    String(tentativa.villageId) + ':' + tentativa.optionId
                ] = Date.now();
            }
            try {
                await postTribalWars(
                    'scavenge_api',
                    { ajaxaction: 'unlock_option' },
                    {
                        village_id: tentativa.villageId,
                        option_id: tentativa.optionId
                    }
                );
                iniciados += 1;
            } catch (erro) {
                console.warn(
                    '[Script Coleta] Não foi possível desbloquear a opção ' +
                    tentativa.optionId + ' na aldeia ' + tentativa.villageId + '.',
                    erro
                );
            }
            if (indice + 1 < tentativas.length) {
                await esperar(700 + Math.round(Math.random() * 500));
            }
        }
        guardarEstado();
        return iniciados;
    }

    async function tentarDesbloquearPrimeiroNivelAldeias(
        aldeias,
        geracaoAtual
    ) {
        if (!CONFIG.unlockEnabled) {
            return {
                iniciados: 0,
                motivo: 'a definição "Desbloquear níveis" está desligada.'
            };
        }

        var ids = Array.from(new Set((aldeias || []).map(function (id) {
            return Number(id);
        }).filter(function (id) {
            return Number.isFinite(id) && id > 0;
        })));
        if (!ids.length) {
            return {
                iniciados: 0,
                motivo: ''
            };
        }

        var agora = Date.now();
        var iniciados = 0;
        var falhas = [];
        var ignoradas = 0;

        for (var indice = 0; indice < ids.length; indice += 1) {
            if (geracaoAtual !== geracao || !estaLigado()) {
                break;
            }
            var aldeiaId = ids[indice];
            if (!podeTentarPrimeiroDesbloqueio(aldeiaId, 1, agora)) {
                ignoradas += 1;
                continue;
            }
            estado.initialUnlockAttempts[String(aldeiaId) + ':1'] = Date.now();
            guardarEstado();
            atualizarBotao(
                'A recuperar nível 1 — aldeia ' + (indice + 1) + '/' + ids.length
            );
            try {
                await postTribalWars(
                    'scavenge_api',
                    { ajaxaction: 'unlock_option' },
                    { village_id: aldeiaId, option_id: 1 }
                );
                iniciados += 1;
            } catch (erro) {
                falhas.push(obterMensagemErro(erro));
                console.warn(
                    '[Script Coleta] A recuperação não conseguiu desbloquear o ' +
                    'nível 1 da aldeia ' + aldeiaId + '.',
                    erro
                );
            }
            if (indice + 1 < ids.length) {
                await esperar(700 + Math.round(Math.random() * 500));
            }
        }

        return {
            iniciados: iniciados,
            motivo: falhas.length
                ? resumirMensagem(falhas[0], 100)
                : (ignoradas && !iniciados
                    ? 'as aldeias já tiveram uma tentativa recente.'
                    : '')
        };
    }

    function obterIdAldeiaAtual() {
        var dados = window.game_data || {};
        var id = Number(dados.village && dados.village.id);
        if (!Number.isFinite(id) || id <= 0) {
            try {
                id = Number(new URL(window.location.href).searchParams.get('village'));
            } catch (erro) {
                id = 0;
            }
        }
        return Number.isFinite(id) && id > 0 ? Math.floor(id) : 0;
    }

    function podeTentarPrimeiroDesbloqueio(aldeiaId, optionId, agora) {
        var chave = String(aldeiaId) + ':' + optionId;
        var anterior = Number(estado.initialUnlockAttempts[chave]) || 0;
        return agora - anterior >= INITIAL_UNLOCK_RETRY;
    }

    function estimarRegressoPedido(pedido, aldeia, optionBases) {
        var opcao = aldeia.options.find(function (item) {
            return Number(item.id) === Number(pedido.option_id);
        });
        if (!opcao) {
            return 0;
        }
        var base = obterBaseOpcao(opcao, optionBases);
        var fatorSaque = Number(base.loot_factor || base.lootFactor);
        var expoente = Number(base.duration_exponent || base.durationExponent);
        var fatorDuracao = Number(base.duration_factor || base.durationFactor);
        var segundosIniciais = Number(
            base.duration_initial_seconds || base.durationInitialSeconds
        );
        if (
            !Number.isFinite(fatorSaque) || fatorSaque <= 0 ||
            !Number.isFinite(expoente) ||
            !Number.isFinite(fatorDuracao)
        ) {
            return 0;
        }

        var capacidade = Number(pedido.candidate_squad.carry_max) || 0;
        var saque = capacidade * fatorSaque;
        var segundos = (
            Math.pow(100 * saque * saque, expoente) +
            (Number.isFinite(segundosIniciais) ? segundosIniciais : 0)
        ) * fatorDuracao;
        return Date.now() + Math.max(1, segundos) * 1000;
    }

    function obterBaseOpcao(opcao, optionBases) {
        var id = String(opcao.baseId || opcao.id);
        return optionBases[id] || opcao.base || {};
    }

    function obterMargemRegresso() {
        return CONFIG.returnBufferSeconds * 1000 +
            Math.round(Math.random() * 15000);
    }

    async function carregarDadosColeta(aldeiasEspecificas, geracaoAtual) {
        var dadosGrupo;
        if (Array.isArray(aldeiasEspecificas)) {
            dadosGrupo = {
                villages: aldeiasEspecificas.map(String),
                name: 'Aldeias a confirmar'
            };
        } else {
            dadosGrupo = await obterDadosGrupo(CONFIG.groupId);
        }
        if (!dadosGrupo.villages.length) {
            throw new Error('O grupo escolhido não contém aldeias.');
        }

        var optionBases = {};
        var porId = {};
        var naoLidas = [];
        var erros = [];

        for (var indice = 0; indice < dadosGrupo.villages.length; indice += 1) {
            if (
                geracaoAtual !== undefined &&
                (geracaoAtual !== geracao || !estaLigado())
            ) {
                break;
            }
            var aldeiaId = String(dadosGrupo.villages[indice]);
            atualizarBotao(
                'A ler ' + dadosGrupo.name + ' — aldeia ' +
                (indice + 1) + '/' + dadosGrupo.villages.length
            );
            atualizarProgressoGrupo(
                dadosGrupo.name,
                indice + 1,
                dadosGrupo.villages.length
            );

            try {
                var resposta = await obterDocumento(
                    criarUrlColetaIndividual(aldeiaId),
                    25000
                );
                if (documentoTemProtecaoBot(resposta.document)) {
                    throw new Error(
                        'O jogo pediu uma verificação ao ler a aldeia ' + aldeiaId + '.'
                    );
                }
                var extraido = extrairDadosPagina(resposta.document);
                Object.keys(extraido.optionBases).forEach(function (id) {
                    optionBases[String(id)] = extraido.optionBases[id];
                });
                var aldeia = extraido.villages.find(function (item) {
                    return String(item.id) === aldeiaId;
                }) || (extraido.villages.length === 1
                    ? extraido.villages[0]
                    : null);
                if (aldeia) {
                    porId[aldeiaId] = aldeia;
                } else {
                    naoLidas.push(aldeiaId);
                }
            } catch (erro) {
                if (/verifica(?:ção|cao)/i.test(obterMensagemErro(erro))) {
                    throw erro;
                }
                naoLidas.push(aldeiaId);
                erros.push(
                    'Aldeia ' + aldeiaId + ': ' + obterMensagemErro(erro)
                );
                console.warn(
                    '[Script Coleta] Não foi possível ler a aldeia ' + aldeiaId + '.',
                    erro
                );
            }

            if (indice + 1 < dadosGrupo.villages.length) {
                await esperar(300 + Math.round(Math.random() * 300));
            }
        }

        return {
            optionBases: optionBases,
            villages: Object.keys(porId).map(function (id) {
                return porId[id];
            }),
            requestedVillageIds: dadosGrupo.villages.slice(),
            unreadVillageIds: naoLidas,
            groupName: dadosGrupo.name,
            errors: erros
        };
    }

    function atualizarProgressoGrupo(nome, atual, total) {
        var resumo = document.querySelector(
            '#' + PANEL_ID + ' [data-sc-group-status]'
        );
        if (resumo) {
            resumo.textContent = nome + ': a processar aldeia ' + atual + '/' +
                total + ' separadamente em segundo plano.';
        }
    }

    function criarUrlColetaIndividual(aldeiaId) {
        var url;
        if (window.game_data && window.game_data.link_base_pure) {
            url = new URL(
                String(window.game_data.link_base_pure) + 'place',
                window.location.href
            );
        } else {
            url = new URL(window.location.href);
            url.searchParams.set('screen', 'place');
        }
        url.searchParams.set('mode', 'scavenge');
        url.searchParams.set('group', String(CONFIG.groupId));
        if (Number(aldeiaId) > 0) {
            url.searchParams.set('village', String(Math.floor(Number(aldeiaId))));
        }
        [
            'action',
            'ajax',
            'ajaxaction',
            'h',
            'page',
            WORKER_URL_PARAM
        ].forEach(function (chave) {
            url.searchParams.delete(chave);
        });
        url.hash = '';
        return url.href;
    }

    function extrairDadosPagina(documento) {
        var valores = [];
        Array.from(documento.scripts).forEach(function (script) {
            var texto = script.textContent || '';
            if (
                texto.indexOf('ScavengeMassScreen') === -1 &&
                texto.indexOf('ScavengeScreen') === -1 &&
                texto.indexOf('unit_counts_home') === -1 &&
                texto.indexOf('duration_factor') === -1
            ) {
                return;
            }
            extrairArgumentosScavenge(texto).forEach(function (argumentos) {
                argumentos.forEach(function (argumento) {
                    var valor = analisarJson(argumento);
                    if (valor !== null) {
                        valores.push(valor);
                    }
                });
            });
            extrairValoresJsonEstruturados(texto).forEach(function (valor) {
                valores.push(valor);
            });
        });

        var bases = {};
        var aldeias = {};
        valores.forEach(function (valor) {
            recolherBasesOpcoes(valor, bases, 0);
            recolherAldeias(valor, aldeias, 0);
        });

        return {
            optionBases: bases,
            villages: Object.keys(aldeias).map(function (id) {
                return normalizarAldeia(aldeias[id]);
            }).filter(Boolean)
        };
    }

    function extrairValoresJsonEstruturados(texto) {
        var valores = [];
        var maximo = 2500;
        var tentativas = 0;

        for (var indice = 0; indice < texto.length && tentativas < maximo; indice += 1) {
            var abertura = texto.charAt(indice);
            if (abertura !== '{' && abertura !== '[') {
                continue;
            }

            var fecho = abertura === '{' ? '}' : ']';
            var fim = encontrarFecho(texto, indice, abertura, fecho);
            if (fim === -1) {
                continue;
            }

            var candidato = texto.slice(indice, fim + 1).trim();
            if (candidato.length < 2 || candidato.length > 8 * 1024 * 1024) {
                continue;
            }

            if (abertura === '{') {
                var primeiroConteudo = candidato.slice(1).match(/\S/);
                if (
                    primeiroConteudo &&
                    primeiroConteudo[0] !== '"' &&
                    primeiroConteudo[0] !== '}'
                ) {
                    continue;
                }
            }

            tentativas += 1;
            var valor = analisarJson(candidato);
            if (valor !== null) {
                valores.push(valor);
                indice = fim;
            }
        }

        return valores;
    }

    function extrairArgumentosScavenge(texto) {
        var chamadas = [];
        var padrao = /Scavenge(?:Mass)?Screen\.(?:init|start)\s*\(/g;
        var resultado;
        while ((resultado = padrao.exec(texto))) {
            var inicio = padrao.lastIndex;
            var fim = encontrarFecho(texto, inicio - 1, '(', ')');
            if (fim === -1) {
                continue;
            }
            chamadas.push(separarArgumentos(texto.slice(inicio, fim)));
            padrao.lastIndex = fim + 1;
        }
        return chamadas;
    }

    function encontrarFecho(texto, indiceAbertura, abertura, fecho) {
        var profundidade = 0;
        var aspas = '';
        var escapado = false;
        for (var indice = indiceAbertura; indice < texto.length; indice += 1) {
            var caractere = texto.charAt(indice);
            if (aspas) {
                if (escapado) {
                    escapado = false;
                } else if (caractere === '\\') {
                    escapado = true;
                } else if (caractere === aspas) {
                    aspas = '';
                }
                continue;
            }
            if (caractere === '"' || caractere === "'") {
                aspas = caractere;
            } else if (caractere === abertura) {
                profundidade += 1;
            } else if (caractere === fecho) {
                profundidade -= 1;
                if (profundidade === 0) {
                    return indice;
                }
            }
        }
        return -1;
    }

    function separarArgumentos(texto) {
        var partes = [];
        var inicio = 0;
        var pilha = [];
        var aspas = '';
        var escapado = false;
        var pares = { ')': '(', ']': '[', '}': '{' };
        for (var indice = 0; indice < texto.length; indice += 1) {
            var caractere = texto.charAt(indice);
            if (aspas) {
                if (escapado) {
                    escapado = false;
                } else if (caractere === '\\') {
                    escapado = true;
                } else if (caractere === aspas) {
                    aspas = '';
                }
                continue;
            }
            if (caractere === '"' || caractere === "'") {
                aspas = caractere;
            } else if (caractere === '(' || caractere === '[' || caractere === '{') {
                pilha.push(caractere);
            } else if (Object.prototype.hasOwnProperty.call(pares, caractere)) {
                if (pilha[pilha.length - 1] === pares[caractere]) {
                    pilha.pop();
                }
            } else if (caractere === ',' && !pilha.length) {
                partes.push(texto.slice(inicio, indice).trim());
                inicio = indice + 1;
            }
        }
        partes.push(texto.slice(inicio).trim());
        return partes.filter(Boolean);
    }

    function analisarJson(texto) {
        var limpo = String(texto || '').trim();
        if (!limpo || (limpo.charAt(0) !== '{' && limpo.charAt(0) !== '[')) {
            return null;
        }
        try {
            return JSON.parse(limpo);
        } catch (erro) {
            return null;
        }
    }

    function recolherBasesOpcoes(valor, saida, profundidade) {
        if (!valor || typeof valor !== 'object' || profundidade > 8) {
            return;
        }
        Object.keys(valor).forEach(function (chave) {
            var item = valor[chave];
            if (
                item && typeof item === 'object' &&
                Number.isFinite(Number(item.loot_factor)) &&
                Number.isFinite(Number(item.duration_factor))
            ) {
                var id = String(item.id || item.base_id || chave);
                saida[id] = item;
            }
        });
        Object.keys(valor).forEach(function (chave) {
            recolherBasesOpcoes(valor[chave], saida, profundidade + 1);
        });
    }

    function recolherAldeias(valor, saida, profundidade) {
        if (!valor || typeof valor !== 'object' || profundidade > 8) {
            return;
        }
        if (
            valor.village_id !== undefined &&
            valor.unit_counts_home &&
            valor.options
        ) {
            saida[String(valor.village_id)] = valor;
            return;
        }
        Object.keys(valor).forEach(function (chave) {
            recolherAldeias(valor[chave], saida, profundidade + 1);
        });
    }

    function normalizarAldeia(valor) {
        var id = Number(valor.village_id);
        if (!Number.isFinite(id) || id <= 0) {
            return null;
        }
        var opcoes = [];
        Object.keys(valor.options || {}).forEach(function (chave) {
            var opcao = valor.options[chave] || {};
            var optionId = Number(opcao.base_id || opcao.option_id || opcao.id || chave);
            if (!Number.isFinite(optionId) || optionId <= 0) {
                return;
            }
            opcoes.push({
                id: optionId,
                baseId: Number(opcao.base_id || optionId),
                base: opcao,
                isLocked: valorBooleanoJogo(opcao.is_locked),
                unlockTime: opcao.unlock_time || opcao.unlock_at || null,
                squad: opcao.scavenging_squad || opcao.squad || null
            });
        });
        return {
            id: id,
            name: String(valor.village_name || 'Aldeia ' + id),
            hasRallyPoint: valorBooleanoJogo(
                valor.has_rally_point === undefined
                    ? true
                    : valor.has_rally_point
            ),
            unitsHome: valor.unit_counts_home || {},
            unitCarryFactor: Number(valor.unit_carry_factor) || 1,
            options: opcoes
        };
    }

    function obterRegressoSquad(opcao) {
        var squad = opcao && opcao.squad;
        if (!squad) {
            return 0;
        }
        return normalizarTimestamp(
            squad.return_time ||
            squad.return_timestamp ||
            squad.return_at ||
            squad.arrival_time ||
            squad.end_time
        );
    }

    function obterFimDesbloqueio(opcao) {
        return normalizarTimestamp(opcao && opcao.unlockTime);
    }

    function normalizarTimestamp(valor) {
        if (valor && typeof valor === 'object') {
            valor = valor.timestamp || valor.time || valor.end_time || valor.value;
        }
        var numero = Number(valor);
        if (!Number.isFinite(numero) || numero <= 0) {
            return 0;
        }
        return numero > 100000000000 ? numero : numero * 1000;
    }

    function valorBooleanoJogo(valor) {
        return valor === true || valor === 1 || valor === '1' || valor === 'true';
    }

    async function obterDocumento(url, limiteMs) {
        var controlador = typeof AbortController === 'function'
            ? new AbortController()
            : null;
        var temporizador = window.setTimeout(function () {
            if (controlador) {
                controlador.abort();
            }
        }, limiteMs);

        try {
            var resposta = await window.fetch(url, {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                signal: controlador ? controlador.signal : undefined
            });
            if (!resposta.ok) {
                throw new Error('HTTP ' + resposta.status + ' ao carregar a coleta');
            }
            var texto = await resposta.text();
            return {
                document: new DOMParser().parseFromString(texto, 'text/html'),
                url: resposta.url || url
            };
        } finally {
            window.clearTimeout(temporizador);
        }
    }

    function postTribalWars(controlador, acao, dados) {
        return new Promise(function (resolver, rejeitar) {
            if (!window.TribalWars || typeof window.TribalWars.post !== 'function') {
                rejeitar(new Error('API TribalWars.post indisponível.'));
                return;
            }

            window.TribalWars.post(
                controlador,
                acao,
                dados,
                function (resposta) {
                    if (resposta && (resposta.error || resposta.errors)) {
                        rejeitar(resposta);
                        return;
                    }
                    resolver(resposta);
                },
                rejeitar
            );
        });
    }

    function esperar(atraso) {
        return new Promise(function (resolver) {
            window.setTimeout(resolver, Math.max(0, Number(atraso) || 0));
        });
    }

    function abrirOuFocarSeparadorTrabalho() {
        if (estaNaPaginaTrabalho() && eSeparadorTrabalhoGerido()) {
            criarPainel();
            atualizarBotao('Separador de trabalho aberto');
            try {
                window.focus();
            } catch (erro) {
                // O navegador decide se permite alterar o foco.
            }
            return true;
        }
        return abrirWorker({ focar: true, automatico: false });
    }

    function abrirWorker(opcoes) {
        var definicoes = opcoes || {};
        var focar = definicoes.focar !== false;
        var automatico = Boolean(definicoes.automatico);
        if (
            workerEstaAtivo() ||
            (workerWindowRef && !workerWindowRef.closed)
        ) {
            try {
                var existente = window.open('', WORKER_TAB_NAME);
                if (existente) {
                    workerWindowRef = existente;
                    if (focar) {
                        existente.focus();
                        atualizarBotao('Separador de trabalho focado');
                    } else {
                        atualizarBotao('Separador de trabalho aberto');
                    }
                    return true;
                }
            } catch (erroFoco) {
                // Se não for possível focar, tenta abrir pelo URL normal.
            }
        }
        var url = new URL(criarUrlColetaIndividual(obterIdAldeiaAtual()));
        url.searchParams.set(WORKER_URL_PARAM, '1');
        var worker = window.open(url.href, WORKER_TAB_NAME);
        if (!worker) {
            proximaTentativaAbrirWorker = Date.now() + AUTO_OPEN_RETRY;
            atualizarBotao(
                automatico
                    ? 'Abertura automática bloqueada — permite popups ou clica em SC'
                    : 'Popup bloqueado — permite popups e clica novamente'
            );
            return false;
        }
        workerWindowRef = worker;
        proximaTentativaAbrirWorker = Date.now() + AUTO_OPEN_RETRY;
        atualizarBotao(
            automatico
                ? 'Ronda aberta automaticamente'
                : 'Coleta aberta noutro separador'
        );
        iniciarSupervisor();
        if (focar) {
            try {
                worker.focus();
            } catch (erro) {
                // O navegador escolhe o separador que fica em primeiro plano.
            }
        }
        return true;
    }

    function iniciarHeartbeat() {
        var existente = lerHeartbeat();
        if (
            existente &&
            existente.id !== tabId &&
            Date.now() - Number(existente.moment) <= WORKER_TIMEOUT &&
            String(existente.version || '') === SCRIPT_VERSION
        ) {
            return false;
        }
        pararHeartbeat(false);
        publicarHeartbeat();
        timerHeartbeat = window.setInterval(publicarHeartbeat, 3000);
        return true;
    }

    function publicarHeartbeat() {
        if (
            !estaLigado() ||
            !estaNaPaginaTrabalho() ||
            !eSeparadorTrabalhoGerido()
        ) {
            pararHeartbeat(true);
            return;
        }
        escreverJsonSeguro(localStorage, WORKER_KEY, {
            id: tabId,
            version: SCRIPT_VERSION,
            moment: Date.now(),
            state: estadoAtual,
            nextRunAt: estado.nextRunAt
        });
    }

    function lerHeartbeat() {
        return lerJsonSeguro(localStorage, WORKER_KEY, null);
    }

    function workerEstaAtivo() {
        var sinal = lerHeartbeat();
        if (!sinal) {
            return false;
        }
        if (
            Date.now() - Number(sinal.moment) > WORKER_TIMEOUT ||
            String(sinal.version || '') !== SCRIPT_VERSION
        ) {
            localStorage.removeItem(WORKER_KEY);
            return false;
        }
        return true;
    }

    function pararHeartbeat(remover) {
        if (timerHeartbeat !== null) {
            window.clearInterval(timerHeartbeat);
            timerHeartbeat = null;
        }
        if (remover) {
            var sinal = lerHeartbeat();
            if (sinal && sinal.id === tabId) {
                localStorage.removeItem(WORKER_KEY);
            }
        }
    }

    function iniciarSupervisor() {
        if (eSeparadorTrabalhoGerido() || timerSupervisor !== null) {
            return;
        }
        timerSupervisor = window.setInterval(supervisionarWorker, 1000);
        supervisionarWorker();
    }

    function supervisionarWorker() {
        if (eSeparadorTrabalhoGerido()) {
            return;
        }
        if (!estaLigado()) {
            pararSupervisor();
            atualizarBotao('Parado');
            return;
        }
        if (workerWindowRef && workerWindowRef.closed) {
            workerWindowRef = null;
        }

        var sinal = lerHeartbeat();
        if (workerEstaAtivo() && sinal) {
            atualizarBotao('Worker: ' + (sinal.state || 'ativo'));
            return;
        }

        var restante = Number(estado.nextRunAt) - Date.now();
        if (restante > 0) {
            var contagem = formatarDuracao(restante);
            atualizarBotao('Próxima ronda em ' + contagem, contagem);
            return;
        }

        if (Date.now() < proximaTentativaAbrirWorker) {
            atualizarBotao('A aguardar abertura do separador de trabalho');
            return;
        }
        abrirWorker({ focar: false, automatico: true });
    }

    function pararSupervisor() {
        if (timerSupervisor !== null) {
            window.clearInterval(timerSupervisor);
            timerSupervisor = null;
        }
    }

    function tratarAlteracaoStorage(evento) {
        if (evento.key === STORAGE_KEY) {
            if (estaLigado()) {
                iniciarAutomacao();
            } else {
                pararAutomacao(true);
                atualizarBotao('Parado');
            }
            atualizarBotaoPainel();
        } else if (evento.key === STATE_KEY) {
            estado = carregarEstado();
            atualizarResumoPainel();
            if (!eSeparadorTrabalhoGerido()) {
                supervisionarWorker();
            }
        } else if (evento.key === SETTINGS_KEY) {
            CONFIG = carregarConfiguracao();
            preencherPainel();
            carregarGruposNoPainel();
            if (
                estaLigado() &&
                estaNaPaginaTrabalho() &&
                eSeparadorTrabalhoGerido()
            ) {
                reiniciarAutomacaoAposEdicao();
            }
        }
    }

    function atualizarBotao(mensagem, contagem) {
        if (!botao) {
            return;
        }
        var ligado = estaLigado();
        estadoAtual = mensagem || (ligado ? 'Ativo' : 'Parado');
        var titulo = 'Buscas/Coleta: ' +
            (ligado ? 'LIGADO' : 'DESLIGADO') + ' — ' + estadoAtual +
            '. Clique em SC para abrir/focar; clique em ⏻ para ligar/desligar.';
        botao.classList.toggle('sc-ligado', ligado);
        botao.setAttribute('aria-label', titulo);
        botao.setAttribute('data-tp-title', titulo);
        var energia = botao.querySelector('[data-script-coleta-power]');
        if (energia) {
            energia.setAttribute('aria-checked', ligado ? 'true' : 'false');
            energia.setAttribute(
                'title',
                ligado
                    ? 'Desligar Buscas/Coleta'
                    : 'Ligar Buscas/Coleta'
            );
        }
        var mostrador = botao.querySelector('[data-script-coleta-countdown]');
        if (mostrador) {
            if (contagem) {
                mostrador.textContent = contagem;
                mostrador.hidden = false;
            } else {
                mostrador.textContent = '';
                mostrador.hidden = true;
            }
        }
        atualizarResumoPainel();
        atualizarBotaoPainel();
        if (timerHeartbeat !== null) {
            publicarHeartbeat();
        }
    }

    function temProtecaoBot() {
        return Boolean(
            document.body && (
                document.body.hasAttribute('data-bot-protect') ||
                document.querySelector(
                    '#bot_check, #botprotection_quest, #captcha, [id*="captcha"]'
                )
            )
        );
    }

    function pausarPorProtecaoBot() {
        estado.nextRunAt = Date.now() + 2 * 60 * 1000;
        estado.lastSummary = 'Verificação/CAPTCHA — resolve manualmente';
        guardarEstado();
        atualizarBotao(estado.lastSummary);
        agendarProximaExecucao();
    }

    function formatarDuracao(milissegundos) {
        var total = Math.max(0, Math.ceil(Number(milissegundos) / 1000));
        var horas = Math.floor(total / 3600);
        var minutos = Math.floor((total % 3600) / 60);
        var segundos = total % 60;
        var hh = String(horas).padStart(2, '0');
        var mm = String(minutos).padStart(2, '0');
        var ss = String(segundos).padStart(2, '0');
        return horas > 0 ? hh + ':' + mm + ':' + ss : mm + ':' + ss;
    }

    function obterMensagemErro(erro) {
        if (!erro) {
            return 'erro desconhecido';
        }
        if (typeof erro === 'string') {
            return erro;
        }
        if (erro.message) {
            return String(erro.message);
        }
        if (erro.error) {
            return String(erro.error);
        }
        if (erro.responseJSON) {
            return obterMensagemErro(erro.responseJSON);
        }
        try {
            return JSON.stringify(erro);
        } catch (falha) {
            return String(erro);
        }
    }

    function resumirMensagem(texto, limite) {
        var limpo = String(texto || '').replace(/\s+/g, ' ').trim();
        return limpo.length > limite
            ? limpo.slice(0, Math.max(0, limite - 1)) + '…'
            : limpo;
    }

    function escaparHtml(texto) {
        return String(texto || '').replace(/[&<>"']/g, function (caractere) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[caractere];
        });
    }

    function lerJsonSeguro(armazenamento, chave, padrao) {
        try {
            var valor = armazenamento.getItem(chave);
            return valor ? JSON.parse(valor) : padrao;
        } catch (erro) {
            return padrao;
        }
    }

    function escreverJsonSeguro(armazenamento, chave, valor) {
        try {
            armazenamento.setItem(chave, JSON.stringify(valor));
        } catch (erro) {
            console.warn('[Script Coleta] Armazenamento indisponível.', erro);
        }
    }
}());
