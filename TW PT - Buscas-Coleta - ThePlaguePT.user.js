// ==UserScript==
// @name         TW PT - Buscas/Coleta - ThePlaguePT
// @namespace    theplaguept.tw.buscas-coleta
// @version      1.0.2
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
    var SCRIPT_VERSION = '1.0.2';
    var WORLD_SCOPE = obterEscopoMundo();
    var STORAGE_KEY = chaveDoMundo('scriptColeta.enabled.v1');
    var SETTINGS_KEY = chaveDoMundo('scriptColeta.settings.v1');
    var STATE_KEY = chaveDoMundo('scriptColeta.state.v1');
    var WORKER_KEY = chaveDoMundo('scriptColeta.workerHeartbeat.v1');
    var BUTTON_ID = 'script-coleta-toggle';
    var PANEL_ID = 'script-coleta-settings';
    var STYLE_ID = 'script-coleta-style';
    var TOOLBAR_ID = 'tp-theplaguept-script-bar';
    var WORKER_TAB_NAME = 'scriptColetaWorker_' + WORLD_SCOPE;
    var WORKER_TIMEOUT = 12000;
    var REQUEST_BATCH_SIZE = 200;
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
        version: 2,
        groupId: '0',
        unlockEnabled: true,
        unlockEveryCycles: 4,
        returnBufferSeconds: 60,
        enabledUnits: {
            spear: true,
            sword: true,
            axe: true,
            archer: true,
            light: true,
            marcher: true,
            heavy: true,
            knight: true
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
    var tabId = Date.now() + '-' + Math.random().toString(36).slice(2);
    var botao = null;
    var timerPrincipal = null;
    var timerContagem = null;
    var timerHeartbeat = null;
    var timerSupervisor = null;
    var workerWindowRef = null;
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

        var config = {
            version: 2,
            groupId: /^-?\d+$/.test(String(guardada.groupId))
                ? String(guardada.groupId)
                : DEFAULT_CONFIG.groupId,
            unlockEnabled: guardada.unlockEnabled !== false,
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

    function estaNaColetaEmMassa() {
        var url = new URL(window.location.href);
        var dados = window.game_data || {};
        return (dados.screen || url.searchParams.get('screen')) === 'place' &&
            (dados.mode || url.searchParams.get('mode')) === 'scavenge_mass';
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
            '<span data-script-coleta-dot aria-hidden="true"></span>' +
            '<span data-script-coleta-countdown hidden></span>';
        botao.style.setProperty('order', '91', 'important');

        botao.addEventListener('click', function (evento) {
            evento.preventDefault();
            evento.stopPropagation();

            var ligar = !estaLigado();
            localStorage.setItem(STORAGE_KEY, ligar ? '1' : '0');
            pararAutomacao(!ligar);

            if (ligar) {
                estado.nextRunAt = 0;
                guardarEstado();
                atualizarBotao('A iniciar…');
                iniciarAutomacao(true);
            } else {
                atualizarBotao('Parado');
            }
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
            '#tp-theplaguept-script-bar{position:absolute!important;top:8px!important;left:414px!important;z-index:2147483647!important;width:350px!important;height:34px!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:5px!important;padding:0 8px!important;box-sizing:border-box!important;pointer-events:none!important;overflow:visible!important}',
            '#tp-theplaguept-script-bar>#script-coleta-toggle{position:relative!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;transform:none!important;order:91!important;width:30px!important;min-width:30px!important;max-width:30px!important;height:28px!important;min-height:28px!important;margin:0!important;padding:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 30px!important;overflow:visible!important;pointer-events:auto!important;cursor:pointer!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#b33a34,#8f2420 55%,#681611)!important;box-shadow:inset 0 1px 0 #ffffff59,inset 0 -1px 0 #00000059,0 2px 5px #00000073!important;color:#fff!important;font:700 10px Verdana,Arial,sans-serif!important;text-shadow:1px 1px 1px #000!important}',
            '#tp-theplaguept-script-bar>#script-coleta-toggle.sc-ligado{background:linear-gradient(to bottom,#5f9f3d,#3f7c27 55%,#28551a)!important}',
            '#tp-theplaguept-script-bar>#script-coleta-toggle:hover,#tp-theplaguept-script-bar>#script-coleta-toggle:focus-visible{filter:brightness(1.18)!important}',
            '#script-coleta-toggle .script-coleta-launcher-icon{display:block!important;line-height:26px!important}',
            '#script-coleta-toggle [data-script-coleta-dot]{position:absolute!important;right:2px!important;bottom:2px!important;width:6px!important;height:6px!important;border:1px solid #2b1509!important;border-radius:50%!important;background:#ff6b6b!important;box-shadow:0 0 2px #000!important}',
            '#script-coleta-toggle.sc-ligado [data-script-coleta-dot]{background:#7cfc00!important}',
            '#script-coleta-toggle [data-script-coleta-countdown]{position:absolute!important;display:block!important;top:31px!important;left:50%!important;transform:translateX(-50%)!important;min-width:46px!important;padding:3px 5px!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#f6dfaa,#d2a05a)!important;color:#2b1509!important;font:bold 10px Verdana,Arial,sans-serif!important;line-height:13px!important;text-align:center!important;text-shadow:0 1px #fff!important;box-shadow:0 2px 5px #0008!important;white-space:nowrap!important;pointer-events:none!important;z-index:2147483647!important}',
            '#script-coleta-toggle [data-script-coleta-countdown][hidden]{display:none!important}',
            '#tp-theplaguept-script-bar>#script-coleta-toggle::after{content:attr(data-tp-title);position:absolute!important;display:none!important;top:33px!important;left:50%!important;transform:translateX(-50%)!important;min-width:max-content!important;max-width:420px!important;padding:4px 8px!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#f6dfaa,#d2a05a)!important;color:#2b1509!important;font:bold 11px Verdana,Arial,sans-serif!important;text-shadow:0 1px #fff!important;box-shadow:0 2px 6px #0008!important;white-space:nowrap!important;pointer-events:none!important;z-index:2147483647!important}',
            '#tp-theplaguept-script-bar>#script-coleta-toggle:hover::after,#tp-theplaguept-script-bar>#script-coleta-toggle:focus-visible::after{display:block!important}',
            '#script-coleta-settings{margin:10px 0;padding:10px;border:1px solid #7d510f;background:#f4e4bc;color:#2b1509;font:12px Verdana,Arial,sans-serif}',
            '#script-coleta-settings h3{margin:0 0 8px;font-size:15px}',
            '#script-coleta-settings .sc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:5px 10px;margin:8px 0}',
            '#script-coleta-settings .sc-unit{display:grid;grid-template-columns:22px 1fr 62px;align-items:center;gap:4px;padding:4px;background:#ead39d;border:1px solid #c49b55}',
            '#script-coleta-settings .sc-unit input[type=number]{width:58px;box-sizing:border-box}',
            '#script-coleta-settings .sc-options{display:flex;align-items:center;flex-wrap:wrap;gap:8px 16px;margin:8px 0}',
            '#script-coleta-settings .sc-options label{white-space:nowrap}',
            '#script-coleta-settings input[type=number],#script-coleta-settings input[type=text],#script-coleta-settings select{padding:3px;border:1px solid #8d6b35;background:#fff}',
            '#script-coleta-settings .sc-actions{display:flex;align-items:center;gap:8px;margin-top:8px}',
            '#script-coleta-settings .sc-status{margin-top:8px;padding:6px;background:#fff4d2;border-left:4px solid #8c5b15}',
            '#script-coleta-settings .sc-note{display:block;margin-top:6px;color:#654820}'
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
        painel.querySelector('[data-sc-save]').addEventListener(
            'click',
            guardarPainel
        );
        painel.querySelector('[data-sc-run]').addEventListener(
            'click',
            executarAgora
        );
        atualizarResumoPainel();
    }

    function montarHtmlPainel() {
        var unidades = obterUnidadesDisponiveisNoMundo().map(function (unidade) {
            return [
                '<label class="sc-unit">',
                '<input type="checkbox" data-sc-unit="', unidade, '">',
                '<span>', UNIT_LABELS[unidade], '</span>',
                '<input type="number" min="0" max="999999" step="1" ',
                'data-sc-keep="', unidade, '" title="Unidades a deixar em casa">',
                '</label>'
            ].join('');
        }).join('');

        return [
            '<h3>TW PT — Buscas/Coleta — ThePlaguePT</h3>',
            '<div>Seleciona as unidades permitidas e indica quantas devem ficar em casa.</div>',
            '<div class="sc-grid">', unidades, '</div>',
            '<div class="sc-options">',
            '<label>Grupo <input type="text" size="5" data-sc-group title="0 = todas as aldeias"></label>',
            '<label><input type="checkbox" data-sc-unlock> Tentar desbloquear níveis</label>',
            '<label>A cada <select data-sc-unlock-every>',
            '<option value="3">3 ciclos</option>',
            '<option value="4">4 ciclos</option>',
            '<option value="5">5 ciclos</option>',
            '</select></label>',
            '<label>Margem após regresso <input type="number" min="30" max="300" ',
            'step="5" data-sc-buffer> s</label>',
            '</div>',
            '<div class="sc-actions">',
            '<button type="button" class="btn" data-sc-save>Guardar</button>',
            '<button type="button" class="btn" data-sc-run>Executar agora</button>',
            '</div>',
            '<small class="sc-note">O rácio é calculado pela capacidade de saque e pelos ',
            'fatores reais dos níveis. Com quatro níveis equivale a 15:6:3:2.</small>',
            '<div class="sc-status" data-sc-status></div>'
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
        painel.querySelector('[data-sc-group]').value = CONFIG.groupId;
        painel.querySelector('[data-sc-unlock]').checked = CONFIG.unlockEnabled;
        painel.querySelector('[data-sc-unlock-every]').value =
            String(CONFIG.unlockEveryCycles);
        painel.querySelector('[data-sc-buffer]').value =
            String(CONFIG.returnBufferSeconds);
    }

    function guardarPainel() {
        var painel = document.getElementById(PANEL_ID);
        if (!painel) {
            return;
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
        preencherPainel();
        estado.nextRunAt = 0;
        estado.lastSummary = 'Definições guardadas.';
        guardarEstado();

        if (window.UI && typeof window.UI.SuccessMessage === 'function') {
            window.UI.SuccessMessage('Definições da coleta guardadas.');
        }
        if (estaLigado()) {
            iniciarAutomacao();
        }
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

        if (!estaNaColetaEmMassa()) {
            iniciarSupervisor();
            if (workerEstaAtivo()) {
                atualizarBotao('A trabalhar noutro separador');
            } else if (aberturaPorClique) {
                abrirWorker();
            } else {
                atualizarBotao('Clica para abrir a coleta em massa');
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
        if (!estaLigado() || !estaNaColetaEmMassa()) {
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
        if (cicloEmCurso || !estaLigado() || !estaNaColetaEmMassa()) {
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
            var dados = await carregarDadosColeta();
            if (geracaoAtual !== geracao || !estaLigado()) {
                return;
            }
            if (!dados.villages.length) {
                throw new Error(
                    'A coleta em massa não devolveu dados de aldeias. ' +
                    'Confirma se a funcionalidade está ativa neste mundo.'
                );
            }

            var resultado = await planearEEnviar(dados, geracaoAtual);
            if (geracaoAtual !== geracao || !estaLigado()) {
                return;
            }

            estado.lastRunAt = Date.now();
            estado.consecutiveErrors = 0;
            estado.lastSummary = resultado.summary;
            estado.nextRunAt = resultado.nextRunAt;
            guardarEstado();
            atualizarBotao(resultado.summary);
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
                    return opcao.isLocked && !obterFimDesbloqueio(opcao);
                });
                if (
                    CONFIG.unlockEnabled &&
                    primeira &&
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
            if (!plano || !plano.fullCycle) {
                return;
            }

            var novoCiclo = Math.max(
                0,
                Number(estado.cyclesByVillage[chave]) || 0
            ) + 1;
            estado.cyclesByVillage[chave] = novoCiclo;

            if (
                CONFIG.unlockEnabled &&
                novoCiclo % CONFIG.unlockEveryCycles === 0
            ) {
                var proxima = plano.village.options
                    .slice()
                    .sort(function (a, b) { return a.id - b.id; })
                    .find(function (opcao) {
                        return opcao.isLocked && !obterFimDesbloqueio(opcao);
                    });
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
                var dadosConfirmados = await carregarDadosColeta();
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
            requests: requests,
            fullCycle: requests.length === opcoes.length
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
        for (var inicio = 0; inicio < pedidos.length; inicio += REQUEST_BATCH_SIZE) {
            if (geracaoAtual !== geracao || !estaLigado()) {
                break;
            }
            var lote = pedidos.slice(inicio, inicio + REQUEST_BATCH_SIZE);
            await postTribalWars(
                'scavenge_api',
                { ajaxaction: 'send_squads' },
                { squad_requests: lote }
            );
            lote.forEach(function (pedido) {
                aldeiasEnviadas.add(Number(pedido.village_id));
            });
            if (inicio + REQUEST_BATCH_SIZE < pedidos.length) {
                await esperar(800 + Math.round(Math.random() * 400));
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

    async function carregarDadosColeta() {
        var urlInicial = criarUrlColetaEmMassa(0);
        var primeira = await obterDocumento(urlInicial, 25000);
        var ultimaPagina = obterUltimaPagina(primeira.document);
        var paginas = [{
            page: 0,
            document: primeira.document,
            url: primeira.url
        }];
        var numeros = [];
        for (var pagina = 1; pagina <= ultimaPagina; pagina += 1) {
            numeros.push(pagina);
        }

        var restantes = await mapearComConcorrencia(numeros, 3, async function (numero) {
            var resposta = await obterDocumento(
                criarUrlColetaEmMassa(numero),
                25000
            );
            return {
                page: numero,
                document: resposta.document,
                url: resposta.url
            };
        });
        Array.prototype.push.apply(paginas, restantes);

        var optionBases = {};
        var porId = {};
        paginas.forEach(function (item) {
            var extraido = extrairDadosPagina(item.document);
            Object.keys(extraido.optionBases).forEach(function (id) {
                optionBases[String(id)] = extraido.optionBases[id];
            });
            extraido.villages.forEach(function (aldeia) {
                porId[String(aldeia.id)] = aldeia;
            });
        });

        return {
            optionBases: optionBases,
            villages: Object.keys(porId).map(function (id) {
                return porId[id];
            })
        };
    }

    function criarUrlColetaEmMassa(pagina) {
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
        url.searchParams.set('mode', 'scavenge_mass');
        url.searchParams.set('group', String(CONFIG.groupId));
        url.searchParams.set('page', String(Math.max(0, Number(pagina) || 0)));
        ['action', 'ajax', 'ajaxaction', 'h'].forEach(function (chave) {
            url.searchParams.delete(chave);
        });
        url.hash = '';
        return url.href;
    }

    function obterUltimaPagina(documento) {
        var ultima = 0;
        documento.querySelectorAll('a[href*="page="]').forEach(function (link) {
            try {
                var pagina = Number(
                    new URL(link.href, window.location.href).searchParams.get('page')
                );
                if (Number.isFinite(pagina)) {
                    ultima = Math.max(ultima, pagina);
                }
            } catch (erro) {
                // Ignora ligações incompletas da paginação.
            }
        });
        return Math.min(500, ultima);
    }

    function extrairDadosPagina(documento) {
        var valores = [];
        Array.from(documento.scripts).forEach(function (script) {
            var texto = script.textContent || '';
            if (texto.indexOf('ScavengeMassScreen') === -1) {
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

    function extrairArgumentosScavenge(texto) {
        var chamadas = [];
        var padrao = /ScavengeMassScreen\.(?:init|start)\s*\(/g;
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

    async function mapearComConcorrencia(itens, limite, tarefa) {
        var resultados = new Array(itens.length);
        var proximo = 0;
        async function trabalhador() {
            while (proximo < itens.length) {
                var indice = proximo;
                proximo += 1;
                resultados[indice] = await tarefa(itens[indice], indice);
            }
        }
        var trabalhadores = [];
        var quantidade = Math.min(Math.max(1, limite), itens.length);
        for (var indice = 0; indice < quantidade; indice += 1) {
            trabalhadores.push(trabalhador());
        }
        await Promise.all(trabalhadores);
        return resultados;
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

    function abrirWorker() {
        if (workerEstaAtivo()) {
            atualizarBotao('A trabalhar noutro separador');
            return true;
        }
        var worker = window.open(criarUrlColetaEmMassa(0), WORKER_TAB_NAME);
        if (!worker) {
            atualizarBotao('Popup bloqueado — permite popups e clica novamente');
            return false;
        }
        workerWindowRef = worker;
        atualizarBotao('Coleta aberta noutro separador');
        iniciarSupervisor();
        try {
            window.focus();
        } catch (erro) {
            // O navegador escolhe o separador que fica em primeiro plano.
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
        if (!estaLigado() || !estaNaColetaEmMassa()) {
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
        if (estaNaColetaEmMassa() || timerSupervisor !== null) {
            return;
        }
        timerSupervisor = window.setInterval(function () {
            if (!estaLigado()) {
                pararSupervisor();
                return;
            }
            if (workerWindowRef && workerWindowRef.closed) {
                workerWindowRef = null;
                atualizarBotao('Worker fechado — clica para reabrir');
                return;
            }
            var sinal = lerHeartbeat();
            if (workerEstaAtivo() && sinal) {
                var contagem = Number(sinal.nextRunAt) > Date.now()
                    ? formatarDuracao(Number(sinal.nextRunAt) - Date.now())
                    : '';
                atualizarBotao('Worker: ' + (sinal.state || 'ativo'), contagem);
            }
        }, 2000);
    }

    function pararSupervisor() {
        if (timerSupervisor !== null) {
            window.clearInterval(timerSupervisor);
            timerSupervisor = null;
        }
        workerWindowRef = null;
    }

    function tratarAlteracaoStorage(evento) {
        if (evento.key === STORAGE_KEY) {
            if (estaLigado()) {
                iniciarAutomacao();
            } else {
                pararAutomacao(true);
                atualizarBotao('Parado');
            }
        } else if (evento.key === STATE_KEY) {
            estado = carregarEstado();
            atualizarResumoPainel();
        } else if (evento.key === SETTINGS_KEY) {
            CONFIG = carregarConfiguracao();
            preencherPainel();
        }
    }

    function atualizarBotao(mensagem, contagem) {
        if (!botao) {
            return;
        }
        var ligado = estaLigado();
        estadoAtual = mensagem || (ligado ? 'Ativo' : 'Parado');
        var titulo = 'Script Coleta: ' +
            (ligado ? 'LIGADO' : 'DESLIGADO') + ' — ' + estadoAtual;
        botao.classList.toggle('sc-ligado', ligado);
        botao.setAttribute('aria-label', titulo);
        botao.setAttribute('data-tp-title', titulo);
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
