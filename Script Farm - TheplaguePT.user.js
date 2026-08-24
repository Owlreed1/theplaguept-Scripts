// ==UserScript==
// @name         Script Farm - TheplaguePT
// @namespace    theplaguept.tw.script-farm
// @version      1.0.1
// @description  Automação configurável do Assistente de Saque para Tribal Wars.
// @author       ThePlaguePT
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// @match        *://*/game.php*
// @include      *://*/game.php*
// @homepageURL  https://github.com/ThePlaguePT/TribalWars-Scripts
// @supportURL   https://github.com/ThePlaguePT/TribalWars-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/Script%20Farm%20-%20TheplaguePT.user.js
// @downloadURL  https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/Script%20Farm%20-%20TheplaguePT.user.js
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    if (window.__autoFarmAController) {
        return;
    }
    window.__autoFarmAController = true;

    var STORAGE_KEY = 'autoFarmA.enabled';
    var SETTINGS_KEY = 'autoFarmA.settings.v1';
    var BUTTON_ID = 'auto-farm-a-toggle';
    var TOOLBAR_ID = 'tp-theplaguept-script-bar';
    var TOOLBAR_STYLE_ID = 'auto-farm-a-toolbar-style';
    var WORKER_KEY = 'autoFarmA.workerHeartbeat';
    var WORKER_TAB_NAME = 'autoFarmAWorker';
    var WORKER_TIMEOUT = 12000;
    var MAP_CACHE_KEY = 'autoFarmA.mapBarbarians.v1';
    var MAP_SCOUTED_KEY = 'autoFarmA.mapScouted.v1';
    var WALL_ATTACKED_KEY = 'autoFarmA.wallAttacked.v1';
    var FARM_KNOWN_CACHE_KEY = 'autoFarmA.knownFarmTargets.v1';
    var PLAYER_TARGETS_KEY = 'autoFarmA.playerTargets.v1';
    var MAP_CACHE_DURATION = 60 * 1000;
    var FARM_KNOWN_CACHE_DURATION = 15 * 60 * 1000;
    var MAP_SCOUTED_DURATION = 365 * 24 * 60 * 60 * 1000;
    var WALL_ATTACKED_DURATION = 30 * 60 * 1000;
    var PLAYER_TARGETS_DURATION = 60 * 60 * 1000;
    var SETTINGS_ID = 'auto-farm-a-settings';
    var SETTINGS_STYLE_ID = 'auto-farm-a-settings-style';
    var CONFIG_PADRAO = {
        modeloAtivo: true,
        modelo: 'a',
        modeloCComInfoAtivo: true,
        maxAtaquesPorAldeia: 50,
        batedorModeloBAtivo: false,
        maxBatedoresPorAldeia: 50,
        mapearNovasBarbaras: false,
        raioNovasBarbaras: 50,
        maxNovasBarbaras: 50,
        demolirMuralhas: true,
        maxDemolicoesPorAldeia: 10,
        intervaloAtaque: 420,
        ignorarAtacados: true,
        limiteMuralhaAtivo: false,
        muralhaMaxima: 20,
        limiteDistanciaAtivo: false,
        distanciaMaxima: 50,
        mudarSemTropas: true,
        mudarSemAlvos: true,
        esgotarEnviosAntesMudar: true,
        voltarAoAssistente: true,
        atualizarEmErros: true,
        esperaInterface: 10000,
        limiteSemProgresso: 35000,
        esperaRecuperacao: 1800,
        esperaNavegacao: 6000,
        esperaProximaAldeia: 150
    };
    var CONFIG = carregarConfiguracao();

    var tiposDeUnidade = [
        'spear', 'sword', 'axe', 'archer', 'spy', 'light',
        'marcher', 'heavy', 'ram', 'catapult', 'knight',
        'snob', 'militia'
    ];

    var timers = new Set();
    var watchdogTimer = null;
    var workerHeartbeatTimer = null;
    var tabId = Date.now() + '-' + Math.random().toString(36).slice(2);
    var observador = null;
    var botao = null;
    var aMudarAldeia = false;
    var aRecuperar = false;
    var ultimoTipoEnviado = null;
    var ultimoAlvoEnviado = null;
    var idsAlvosDeJogadores = null;
    var estadoAtual = '';
    var mapaProcessadoNesteCiclo = false;
    var idsBarbarasMapa = null;
    var validacaoBarbarasEmCurso = false;
    var tiposSemTropas = {
        principal: false,
        batedor: false
    };

    iniciar();

    function iniciar() {
        criarBotao();
        instalarRecuperacaoGlobal();

        if (estaNoAssistenteFarm()) {
            window.setTimeout(function () {
                criarPainelDefinicoes(0);
            }, 100);
        }

        if (estaLigado()) {
            atualizarBotao('A iniciar…');
            agendar(executarControlador, 250);
        } else {
            atualizarBotao('Parado');
        }
    }

    function carregarConfiguracao() {
        var guardada = {};

        try {
            guardada = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        } catch (erro) {
            console.warn('Script Farm: não foi possível ler as definições.', erro);
        }

        if (!Number.isFinite(Number(guardada.intervaloAtaque))) {
            var intervaloAntigoMin = Number(guardada.intervaloAtaqueMin);
            var intervaloAntigoMax = Number(guardada.intervaloAtaqueMax);
            if (
                Number.isFinite(intervaloAntigoMin) &&
                Number.isFinite(intervaloAntigoMax)
            ) {
                guardada.intervaloAtaque = Math.round(
                    (intervaloAntigoMin + intervaloAntigoMax) / 2
                );
            }
        }

        return normalizarConfiguracao(
            Object.assign({}, CONFIG_PADRAO, guardada)
        );
    }

    function guardarConfiguracao() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(CONFIG));
    }

    function normalizarConfiguracao(valor) {
        var resultado = Object.assign({}, CONFIG_PADRAO, valor);

        resultado.modeloAtivo = Boolean(resultado.modeloAtivo);
        resultado.modelo = resultado.modelo === 'b' ? 'b' : 'a';
        resultado.modeloCComInfoAtivo = Boolean(
            resultado.modeloCComInfoAtivo
        );
        resultado.maxAtaquesPorAldeia = limitarNumero(
            resultado.maxAtaquesPorAldeia,
            1,
            500,
            CONFIG_PADRAO.maxAtaquesPorAldeia
        );
        resultado.maxBatedoresPorAldeia = limitarNumero(
            resultado.maxBatedoresPorAldeia,
            1,
            500,
            CONFIG_PADRAO.maxBatedoresPorAldeia
        );
        resultado.raioNovasBarbaras = limitarNumero(
            resultado.raioNovasBarbaras,
            1,
            200,
            CONFIG_PADRAO.raioNovasBarbaras
        );
        resultado.maxNovasBarbaras = limitarNumero(
            resultado.maxNovasBarbaras,
            1,
            500,
            CONFIG_PADRAO.maxNovasBarbaras
        );
        resultado.maxDemolicoesPorAldeia = limitarNumero(
            resultado.maxDemolicoesPorAldeia,
            1,
            100,
            CONFIG_PADRAO.maxDemolicoesPorAldeia
        );
        resultado.intervaloAtaque = limitarNumero(
            resultado.intervaloAtaque,
            250,
            60000,
            CONFIG_PADRAO.intervaloAtaque
        );
        resultado.muralhaMaxima = limitarNumero(
            resultado.muralhaMaxima,
            0,
            20,
            CONFIG_PADRAO.muralhaMaxima
        );
        resultado.distanciaMaxima = limitarNumero(
            resultado.distanciaMaxima,
            1,
            1000,
            CONFIG_PADRAO.distanciaMaxima
        );
        resultado.limiteSemProgresso = limitarNumero(
            resultado.limiteSemProgresso,
            10000,
            300000,
            CONFIG_PADRAO.limiteSemProgresso
        );
        resultado.esperaProximaAldeia = limitarNumero(
            resultado.esperaProximaAldeia,
            0,
            60000,
            CONFIG_PADRAO.esperaProximaAldeia
        );
        resultado.ignorarAtacados = Boolean(resultado.ignorarAtacados);
        resultado.batedorModeloBAtivo = Boolean(resultado.batedorModeloBAtivo);
        resultado.mapearNovasBarbaras = Boolean(resultado.mapearNovasBarbaras);
        resultado.demolirMuralhas = Boolean(resultado.demolirMuralhas);
        resultado.limiteMuralhaAtivo = Boolean(resultado.limiteMuralhaAtivo);
        resultado.limiteDistanciaAtivo = Boolean(resultado.limiteDistanciaAtivo);
        resultado.mudarSemTropas = Boolean(resultado.mudarSemTropas);
        resultado.mudarSemAlvos = Boolean(resultado.mudarSemAlvos);
        resultado.esgotarEnviosAntesMudar = Boolean(
            resultado.esgotarEnviosAntesMudar
        );
        resultado.voltarAoAssistente = Boolean(resultado.voltarAoAssistente);
        resultado.atualizarEmErros = Boolean(resultado.atualizarEmErros);

        return resultado;
    }

    function limitarNumero(valor, minimo, maximo, padrao) {
        var numero = Number(valor);
        if (!Number.isFinite(numero)) {
            numero = padrao;
        }
        return Math.min(maximo, Math.max(minimo, Math.round(numero)));
    }

    function criarPainelDefinicoes(tentativa) {
        if (!estaNoAssistenteFarm() || document.getElementById(SETTINGS_ID)) {
            return;
        }

        var referencia = document.querySelector('#am_widget_Farm, #plunder_list');
        if (!referencia) {
            if (tentativa < 40) {
                window.setTimeout(function () {
                    criarPainelDefinicoes(tentativa + 1);
                }, 250);
            }
            return;
        }

        injetarEstilosDefinicoes();

        var painel = document.createElement('section');
        painel.id = SETTINGS_ID;
        painel.innerHTML = [
            '<div class="af-settings-title">',
                '<div><strong>Script Farm — TheplaguePT</strong>',
                '<span>As alterações ficam guardadas neste mundo.</span></div>',
                '<span class="af-version">v1.0.1</span>',
            '</div>',
            '<div class="af-settings-grid">',
                '<fieldset class="af-card">',
                    '<legend>Modelo e filtros</legend>',
                    '<label class="af-check"><input id="af-modelo-ativo" type="checkbox"> Ativar envios automáticos</label>',
                    '<label>Modelo a enviar<select id="af-modelo"><option value="a">Modelo A</option><option value="b">Modelo B</option></select></label>',
                    '<label class="af-check af-modelo-c-toggle"><input id="af-modelo-c-info" type="checkbox"> Ativar Modelo C automático</label>',
                    '<small>Desmarca esta opção para nunca enviar o Modelo C. Quando ativa, uma aldeia com relatório disponível recebe apenas C.</small>',
                    '<div class="af-inline">',
                        '<label class="af-check"><input id="af-limite-muralha" type="checkbox"> Limitar muralha</label>',
                        '<label class="af-compact">Nível máximo<input id="af-muralha-max" type="number" min="0" max="20" step="1"></label>',
                    '</div>',
                    '<div class="af-inline">',
                        '<label class="af-check"><input id="af-limite-distancia" type="checkbox"> Limitar distância</label>',
                        '<label class="af-compact">Campos máximos<input id="af-distancia-max" type="number" min="1" max="1000" step="1"></label>',
                    '</div>',
                    '<label class="af-check"><input id="af-ignorar-atacados" type="checkbox"> Ignorar aldeias com ataque em curso</label>',
                    '<label>Máximo de ataques por aldeia<input id="af-max-ataques" type="number" min="1" max="500" step="1"></label>',
                '</fieldset>',
                '<fieldset class="af-card">',
                    '<legend>Reconhecimento — Modelo B</legend>',
                    '<label class="af-check"><input id="af-batedor-b-ativo" type="checkbox"> Enviar Modelo B às aldeias já existentes na lista</label>',
                    '<label>Máximo de batedores por aldeia<input id="af-max-batedores" type="number" min="1" max="500" step="1"></label>',
                    '<label class="af-check"><input id="af-mapear-novas" type="checkbox"> Procurar e reconhecer novas bárbaras no mapa</label>',
                    '<div class="af-two-columns">',
                        '<label>Raio máximo (campos)<input id="af-raio-novas" type="number" min="1" max="200" step="1"></label>',
                        '<label>Máximo de novas bárbaras<input id="af-max-novas" type="number" min="1" max="500" step="1"></label>',
                    '</div>',
                    '<small>Configura o Modelo B do jogo com exatamente 1 batedor. Quando a pesquisa do mapa está ativa, as aldeias da lista não recebem B: os batedores ficam reservados para aldeias novas.</small>',
                '</fieldset>',
                '<fieldset class="af-card">',
                    '<legend>Demolir muralhas</legend>',
                    '<label class="af-check"><input id="af-demolir-muralhas" type="checkbox"> Atacar bárbaras com muralha conhecida</label>',
                    '<label>Máximo de demolições por aldeia<input id="af-max-demolicoes" type="number" min="1" max="100" step="1"></label>',
                    '<small>Envia um ataque normal com Vikings e aríetes antes do farm. A quantidade é calculada pelo nível conhecido; muralhas com “?” aguardam reconhecimento.</small>',
                '</fieldset>',
                '<fieldset class="af-card">',
                    '<legend>Tempos</legend>',
                    '<label>Tempo base entre envios (ms)<input id="af-intervalo-base" type="number" min="250" max="60000" step="10"></label>',
                    '<small>Todos os tempos da automação recebem uma variação aleatória fixa de ±10%. Exemplo: 1000 ms resulta em 900–1100 ms.</small>',
                    '<label>Refresh se não houver progresso (segundos)<input id="af-sem-progresso" type="number" min="10" max="300" step="1"></label>',
                    '<label>Pausa antes da próxima aldeia (ms)<input id="af-pausa-aldeia" type="number" min="0" max="60000" step="50"></label>',
                '</fieldset>',
                '<fieldset class="af-card">',
                    '<legend>Automação</legend>',
                    '<label class="af-check"><input id="af-voltar-assistente" type="checkbox"> Abrir o Assistente de Saque num separador de trabalho</label>',
                    '<label class="af-check"><input id="af-mudar-sem-tropas" type="checkbox"> Avançar imediatamente quando não houver tropas</label>',
                    '<label class="af-check"><input id="af-mudar-sem-alvos" type="checkbox"> Avançar quando não houver alvos válidos</label>',
                    '<label class="af-check"><input id="af-esgotar-envios" type="checkbox"> Só mudar depois de esgotar todos os envios possíveis</label>',
                    '<label class="af-check"><input id="af-atualizar-erros" type="checkbox"> Atualizar e continuar após erros ou interrupções</label>',
                    '<small>Uma verificação CAPTCHA fica sempre em pausa para resolução manual.</small>',
                '</fieldset>',
            '</div>',
            '<div class="af-settings-actions">',
                '<span id="af-settings-message" role="status"></span>',
                '<button id="af-settings-reset" type="button">Repor predefinições</button>',
                '<button id="af-settings-save" type="button" class="btn">Guardar e aplicar</button>',
            '</div>'
        ].join('');

        referencia.parentNode.insertBefore(painel, referencia);
        preencherPainelDefinicoes();
        ligarEventosDefinicoes();
    }

    function injetarEstilosDefinicoes() {
        if (document.getElementById(SETTINGS_STYLE_ID)) {
            return;
        }

        var estilo = document.createElement('style');
        estilo.id = SETTINGS_STYLE_ID;
        estilo.textContent = [
            '#auto-farm-a-settings{margin:0 0 14px;padding:12px;background:#f4e4bc;border:1px solid #9d7d45;border-radius:4px;color:#4b371c;box-shadow:0 1px 3px rgba(0,0,0,.18);font-family:Arial,sans-serif}',
            '#auto-farm-a-settings *{box-sizing:border-box}',
            '#auto-farm-a-settings .af-settings-title{display:flex;justify-content:space-between;align-items:center;margin:-12px -12px 12px;padding:10px 12px;background:#e3c887;border-bottom:1px solid #9d7d45}',
            '#auto-farm-a-settings .af-settings-title strong{display:block;font-size:15px}',
            '#auto-farm-a-settings .af-settings-title span{font-size:11px;color:#725b35}',
            '#auto-farm-a-settings .af-version{font-weight:bold}',
            '#auto-farm-a-settings .af-settings-grid{display:grid;grid-template-columns:repeat(3,minmax(210px,1fr));gap:12px}',
            '#auto-farm-a-settings .af-card{min-width:0;margin:0;padding:11px;border:1px solid #b79a63;border-radius:4px;background:#fff4d7}',
            '#auto-farm-a-settings .af-card legend{padding:0 7px;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.04em}',
            '#auto-farm-a-settings label{display:block;margin:0 0 10px;font-size:11px;font-weight:bold}',
            '#auto-farm-a-settings input[type=number],#auto-farm-a-settings select{display:block;width:100%;height:29px;margin-top:4px;padding:4px 7px;border:1px solid #b98d4b;border-radius:3px;background:#fff;color:#3e2e1a}',
            '#auto-farm-a-settings .af-check{display:flex;align-items:flex-start;gap:6px;font-weight:normal;line-height:17px}',
            '#auto-farm-a-settings .af-check input{margin:2px 0 0}',
            '#auto-farm-a-settings .af-modelo-c-toggle{margin-bottom:6px;padding:6px;border:1px solid #c39a51;border-radius:3px;background:#f6e4af;font-weight:bold}',
            '#auto-farm-a-settings .af-inline{display:grid;grid-template-columns:1fr 105px;gap:10px;align-items:end}',
            '#auto-farm-a-settings .af-two-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
            '#auto-farm-a-settings .af-compact{margin-top:-4px}',
            '#auto-farm-a-settings small{display:block;margin:-3px 0 10px;color:#80683f;font-size:10px;line-height:13px}',
            '#auto-farm-a-settings .af-settings-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px;padding-top:10px;border-top:1px dashed #b79a63}',
            '#auto-farm-a-settings .af-settings-actions button{padding:6px 11px;cursor:pointer}',
            '#auto-farm-a-settings #af-settings-message{margin-right:auto;font-size:11px;font-weight:bold;color:#2f6f32}',
            '@media(max-width:900px){#auto-farm-a-settings .af-settings-grid{grid-template-columns:1fr}#auto-farm-a-settings .af-settings-actions{flex-wrap:wrap}}'
        ].join('');
        document.head.appendChild(estilo);
    }

    function preencherPainelDefinicoes() {
        definirCheckbox('af-modelo-ativo', CONFIG.modeloAtivo);
        definirValor('af-modelo', CONFIG.modelo);
        definirCheckbox(
            'af-modelo-c-info',
            CONFIG.modeloCComInfoAtivo
        );
        definirCheckbox('af-limite-muralha', CONFIG.limiteMuralhaAtivo);
        definirValor('af-muralha-max', CONFIG.muralhaMaxima);
        definirCheckbox('af-limite-distancia', CONFIG.limiteDistanciaAtivo);
        definirValor('af-distancia-max', CONFIG.distanciaMaxima);
        definirCheckbox('af-ignorar-atacados', CONFIG.ignorarAtacados);
        definirValor('af-max-ataques', CONFIG.maxAtaquesPorAldeia);
        definirCheckbox('af-batedor-b-ativo', CONFIG.batedorModeloBAtivo);
        definirValor('af-max-batedores', CONFIG.maxBatedoresPorAldeia);
        definirCheckbox('af-mapear-novas', CONFIG.mapearNovasBarbaras);
        definirValor('af-raio-novas', CONFIG.raioNovasBarbaras);
        definirValor('af-max-novas', CONFIG.maxNovasBarbaras);
        definirCheckbox('af-demolir-muralhas', CONFIG.demolirMuralhas);
        definirValor(
            'af-max-demolicoes',
            CONFIG.maxDemolicoesPorAldeia
        );
        definirValor('af-intervalo-base', CONFIG.intervaloAtaque);
        definirValor('af-sem-progresso', CONFIG.limiteSemProgresso / 1000);
        definirValor('af-pausa-aldeia', CONFIG.esperaProximaAldeia);
        definirCheckbox('af-voltar-assistente', CONFIG.voltarAoAssistente);
        definirCheckbox('af-mudar-sem-tropas', CONFIG.mudarSemTropas);
        definirCheckbox('af-mudar-sem-alvos', CONFIG.mudarSemAlvos);
        definirCheckbox(
            'af-esgotar-envios',
            CONFIG.esgotarEnviosAntesMudar
        );
        definirCheckbox('af-atualizar-erros', CONFIG.atualizarEmErros);
        atualizarEstadoCamposDefinicoes();
    }

    function ligarEventosDefinicoes() {
        var limiteMuralha = document.getElementById('af-limite-muralha');
        limiteMuralha.addEventListener('change', atualizarEstadoCamposDefinicoes);
        document.getElementById('af-limite-distancia').addEventListener(
            'change',
            atualizarEstadoCamposDefinicoes
        );
        document.getElementById('af-batedor-b-ativo').addEventListener(
            'change',
            atualizarEstadoCamposDefinicoes
        );
        document.getElementById('af-mapear-novas').addEventListener(
            'change',
            atualizarEstadoCamposDefinicoes
        );
        document.getElementById('af-demolir-muralhas').addEventListener(
            'change',
            atualizarEstadoCamposDefinicoes
        );

        document.getElementById('af-settings-save').addEventListener('click', function () {
            CONFIG = normalizarConfiguracao(Object.assign({}, CONFIG, {
                modeloAtivo: lerCheckbox('af-modelo-ativo'),
                modelo: lerValor('af-modelo'),
                modeloCComInfoAtivo: lerCheckbox('af-modelo-c-info'),
                limiteMuralhaAtivo: lerCheckbox('af-limite-muralha'),
                muralhaMaxima: lerValor('af-muralha-max'),
                limiteDistanciaAtivo: lerCheckbox('af-limite-distancia'),
                distanciaMaxima: lerValor('af-distancia-max'),
                ignorarAtacados: lerCheckbox('af-ignorar-atacados'),
                maxAtaquesPorAldeia: lerValor('af-max-ataques'),
                batedorModeloBAtivo: lerCheckbox('af-batedor-b-ativo'),
                maxBatedoresPorAldeia: lerValor('af-max-batedores'),
                mapearNovasBarbaras: lerCheckbox('af-mapear-novas'),
                raioNovasBarbaras: lerValor('af-raio-novas'),
                maxNovasBarbaras: lerValor('af-max-novas'),
                demolirMuralhas: lerCheckbox('af-demolir-muralhas'),
                maxDemolicoesPorAldeia: lerValor('af-max-demolicoes'),
                intervaloAtaque: lerValor('af-intervalo-base'),
                limiteSemProgresso: Number(lerValor('af-sem-progresso')) * 1000,
                esperaProximaAldeia: lerValor('af-pausa-aldeia'),
                voltarAoAssistente: lerCheckbox('af-voltar-assistente'),
                mudarSemTropas: lerCheckbox('af-mudar-sem-tropas'),
                mudarSemAlvos: lerCheckbox('af-mudar-sem-alvos'),
                esgotarEnviosAntesMudar: lerCheckbox('af-esgotar-envios'),
                atualizarEmErros: lerCheckbox('af-atualizar-erros')
            }));
            guardarConfiguracao();
            preencherPainelDefinicoes();
            mostrarMensagemDefinicoes('Definições guardadas e aplicadas.');
            reiniciarSeLigado();
        });

        document.getElementById('af-settings-reset').addEventListener('click', function () {
            CONFIG = normalizarConfiguracao(Object.assign({}, CONFIG_PADRAO));
            guardarConfiguracao();
            preencherPainelDefinicoes();
            mostrarMensagemDefinicoes('Predefinições repostas.');
            reiniciarSeLigado();
        });
    }

    function reiniciarSeLigado() {
        pararExecucao();
        if (estaLigado()) {
            atualizarBotao('A aplicar as definições…');
            agendar(executarControlador, 250);
        }
    }

    function atualizarEstadoCamposDefinicoes() {
        document.getElementById('af-muralha-max').disabled =
            !lerCheckbox('af-limite-muralha');
        document.getElementById('af-distancia-max').disabled =
            !lerCheckbox('af-limite-distancia');
        document.getElementById('af-max-batedores').disabled =
            !lerCheckbox('af-batedor-b-ativo') ||
            lerCheckbox('af-mapear-novas');
        document.getElementById('af-raio-novas').disabled =
            !lerCheckbox('af-mapear-novas');
        document.getElementById('af-max-novas').disabled =
            !lerCheckbox('af-mapear-novas');
        document.getElementById('af-max-demolicoes').disabled =
            !lerCheckbox('af-demolir-muralhas');
    }

    function mostrarMensagemDefinicoes(texto) {
        var mensagem = document.getElementById('af-settings-message');
        mensagem.textContent = texto;
        window.setTimeout(function () {
            if (mensagem.textContent === texto) {
                mensagem.textContent = '';
            }
        }, 3500);
    }

    function definirCheckbox(id, valor) {
        document.getElementById(id).checked = Boolean(valor);
    }

    function definirValor(id, valor) {
        document.getElementById(id).value = valor;
    }

    function lerCheckbox(id) {
        return document.getElementById(id).checked;
    }

    function lerValor(id) {
        return document.getElementById(id).value;
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
            '<span class="auto-farm-a-launcher-icon">SF</span>' +
            '<span data-auto-farm-dot aria-hidden="true"></span>';
        botao.style.setProperty('order', '90', 'important');

        botao.addEventListener('click', function (evento) {
            evento.preventDefault();
            evento.stopPropagation();

            if (
                estaLigado() &&
                !estaNoAssistenteFarm() &&
                CONFIG.voltarAoAssistente &&
                !workerEstaAtivo()
            ) {
                abrirAssistenteEmSeparador();
                return;
            }

            var ligar = !estaLigado();
            localStorage.setItem(STORAGE_KEY, ligar ? '1' : '0');
            pararExecucao();

            if (ligar) {
                atualizarBotao('A iniciar…');
                if (!estaNoAssistenteFarm() && CONFIG.voltarAoAssistente) {
                    abrirAssistenteEmSeparador();
                } else {
                    agendar(executarControlador, 100);
                }
            } else {
                atualizarBotao('Parado');
            }
        });

        barra.appendChild(botao);
    }

    function obterBarraScripts() {
        injetarEstilosBarraScripts();

        var barra = document.getElementById(TOOLBAR_ID);
        if (!barra) {
            barra = document.createElement('div');
            barra.id = TOOLBAR_ID;
            barra.setAttribute('aria-label', 'Botões ThePlaguePT');
            document.body.appendChild(barra);
        }

        return barra;
    }

    function injetarEstilosBarraScripts() {
        if (document.getElementById(TOOLBAR_STYLE_ID)) {
            return;
        }

        var estilo = document.createElement('style');
        estilo.id = TOOLBAR_STYLE_ID;
        estilo.textContent = [
            '#tp-theplaguept-script-bar{position:absolute!important;top:8px!important;left:414px!important;z-index:2147483647!important;width:350px!important;height:34px!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:5px!important;padding:0 8px!important;box-sizing:border-box!important;pointer-events:none!important;overflow:visible!important}',
            '#tp-theplaguept-script-bar>#auto-farm-a-toggle{position:relative!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;transform:none!important;order:90!important;width:30px!important;min-width:30px!important;max-width:30px!important;height:28px!important;min-height:28px!important;margin:0!important;padding:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 30px!important;overflow:visible!important;pointer-events:auto!important;cursor:pointer!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#b33a34,#8f2420 55%,#681611)!important;box-shadow:inset 0 1px 0 #ffffff59,inset 0 -1px 0 #00000059,0 2px 5px #00000073!important;color:#fff!important;font:700 10px Verdana,Arial,sans-serif!important;text-shadow:1px 1px 1px #000!important}',
            '#tp-theplaguept-script-bar>#auto-farm-a-toggle.af-ligado{background:linear-gradient(to bottom,#5f9f3d,#3f7c27 55%,#28551a)!important}',
            '#tp-theplaguept-script-bar>#auto-farm-a-toggle:hover,#tp-theplaguept-script-bar>#auto-farm-a-toggle:focus-visible{filter:brightness(1.18)!important}',
            '#auto-farm-a-toggle .auto-farm-a-launcher-icon{display:block!important;line-height:26px!important}',
            '#auto-farm-a-toggle [data-auto-farm-dot]{position:absolute!important;right:2px!important;bottom:2px!important;width:6px!important;height:6px!important;border:1px solid #2b1509!important;border-radius:50%!important;background:#ff6b6b!important;box-shadow:0 0 2px #000!important}',
            '#auto-farm-a-toggle.af-ligado [data-auto-farm-dot]{background:#7cfc00!important}',
            '#tp-theplaguept-script-bar>#auto-farm-a-toggle::after{content:attr(data-tp-title);position:absolute!important;display:none!important;top:33px!important;left:50%!important;transform:translateX(-50%)!important;min-width:max-content!important;max-width:360px!important;padding:4px 8px!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#f6dfaa,#d2a05a)!important;color:#2b1509!important;font:bold 11px Verdana,Arial,sans-serif!important;text-shadow:0 1px #fff!important;box-shadow:0 2px 6px #0008!important;white-space:nowrap!important;pointer-events:none!important;z-index:2147483647!important}',
            '#tp-theplaguept-script-bar>#auto-farm-a-toggle:hover::after,#tp-theplaguept-script-bar>#auto-farm-a-toggle:focus-visible::after{display:block!important}'
        ].join('');
        document.head.appendChild(estilo);
    }

    function atualizarBotao(mensagem) {
        if (!botao) {
            return;
        }

        var ligado = estaLigado();
        var estado = mensagem || (ligado ? 'Ativo' : 'Parado');
        var titulo = 'Script Farm: ' + (ligado ? 'LIGADO' : 'DESLIGADO') + ' — ' + estado;

        estadoAtual = estado;

        botao.classList.toggle('af-ligado', ligado);
        botao.setAttribute('aria-label', titulo);
        botao.setAttribute('data-tp-title', titulo);

        if (workerHeartbeatTimer !== null) {
            publicarSinalWorker();
        }
    }

    function estaLigado() {
        return localStorage.getItem(STORAGE_KEY) === '1';
    }

    function executarControlador() {
        if (!estaLigado()) {
            return;
        }

        aMudarAldeia = false;
        aRecuperar = false;

        if (temProtecaoBot()) {
            pausarParaVerificacao();
            return;
        }

        if (!estaNoAssistenteFarm()) {
            if (!CONFIG.voltarAoAssistente) {
                atualizarBotao('Ativo — separador de trabalho desativado');
                return;
            }

            if (workerEstaAtivo()) {
                atualizarBotao('A trabalhar noutro separador');
            } else {
                abrirAssistenteEmSeparador();
            }
            return;
        }

        if (
            !CONFIG.modeloAtivo &&
            !CONFIG.modeloCComInfoAtivo &&
            !CONFIG.batedorModeloBAtivo &&
            !CONFIG.mapearNovasBarbaras &&
            !CONFIG.demolirMuralhas
        ) {
            atualizarBotao('Farm e reconhecimento desativados nas definições');
            return;
        }

        if (!iniciarSinalWorker()) {
            atualizarBotao('Em pausa — outro separador AF já está ativo');
            return;
        }
        atualizarBotao('A carregar a lista de farm…');
        armarWatchdog();
        esperarInterface(Date.now());
    }

    function estaNoAssistenteFarm() {
        if (window.game_data && window.game_data.screen) {
            return window.game_data.screen === 'am_farm';
        }

        return new URL(window.location.href).searchParams.get('screen') === 'am_farm';
    }

    function criarUrlAssistenteFarm() {
        var url = new URL(window.location.href);
        url.searchParams.set('screen', 'am_farm');
        url.searchParams.delete('mode');
        url.searchParams.delete('action');
        url.searchParams.delete('page');
        url.hash = '';
        return url.href;
    }

    function abrirAssistenteEmSeparador() {
        if (workerEstaAtivo()) {
            atualizarBotao('A trabalhar noutro separador');
            return true;
        }

        var separador = window.open(
            criarUrlAssistenteFarm(),
            WORKER_TAB_NAME
        );

        if (!separador) {
            atualizarBotao('Popup bloqueado — permite popups e clica novamente');
            return false;
        }

        atualizarBotao('Assistente aberto noutro separador');

        try {
            window.focus();
        } catch (erro) {
            // O navegador decide se o novo separador fica em primeiro plano.
        }

        return true;
    }

    function workerEstaAtivo() {
        var sinal = lerSinalWorker();
        if (!sinal) {
            return false;
        }

        if (Date.now() - Number(sinal.momento) > WORKER_TIMEOUT) {
            localStorage.removeItem(WORKER_KEY);
            return false;
        }

        return true;
    }

    function lerSinalWorker() {
        try {
            return JSON.parse(localStorage.getItem(WORKER_KEY) || 'null');
        } catch (erro) {
            return null;
        }
    }

    function iniciarSinalWorker() {
        var existente = lerSinalWorker();
        if (
            existente &&
            existente.id !== tabId &&
            Date.now() - Number(existente.momento) <= WORKER_TIMEOUT
        ) {
            return false;
        }

        pararSinalWorker(false);
        if (!publicarSinalWorker()) {
            return false;
        }
        workerHeartbeatTimer = window.setInterval(publicarSinalWorker, 3000);
        return true;
    }

    function publicarSinalWorker() {
        if (!estaLigado() || !estaNoAssistenteFarm()) {
            pararSinalWorker(true);
            return false;
        }

        var existente = lerSinalWorker();
        if (
            existente &&
            existente.id !== tabId &&
            Date.now() - Number(existente.momento) <= WORKER_TIMEOUT
        ) {
            pararSinalWorker(false);
            atualizarBotao('Em pausa — outro separador AF está ativo');
            return false;
        }

        localStorage.setItem(WORKER_KEY, JSON.stringify({
            id: tabId,
            momento: Date.now(),
            aldeia: window.game_data && window.game_data.village
                ? window.game_data.village.id
                : null,
            estado: estadoAtual
        }));
        return true;
    }

    function pararSinalWorker(remover) {
        if (workerHeartbeatTimer !== null) {
            window.clearInterval(workerHeartbeatTimer);
            workerHeartbeatTimer = null;
        }

        if (!remover) {
            return;
        }

        var sinal = lerSinalWorker();
        if (sinal && sinal.id === tabId) {
            localStorage.removeItem(WORKER_KEY);
        }
    }

    function esperarInterface(inicio) {
        if (!estaLigado() || aMudarAldeia || aRecuperar) {
            return;
        }

        if (temProtecaoBot()) {
            pausarParaVerificacao();
            return;
        }

        var interfaceFarm = document.querySelector('#plunder_list, #am_widget_Farm');
        if (interfaceFarm) {
            observarPagina();
            iniciarFarm();
            return;
        }

        if (Date.now() - inicio >= CONFIG.esperaInterface) {
            recuperar('A página não terminou de carregar');
            return;
        }

        agendar(function () {
            esperarInterface(inicio);
        }, 250);
    }

    function iniciarFarm() {
        if (semTropasVisiveis()) {
            tratarSemTrabalho('Sem tropas', CONFIG.mudarSemTropas);
            return;
        }

        if (idsBarbarasMapa === null) {
            if (validacaoBarbarasEmCurso) {
                return;
            }

            validacaoBarbarasEmCurso = true;
            atualizarBotao('A validar bárbaras e ignorar aldeias de jogadores…');
            obterBarbarasDoMapa(true).then(function (barbaras) {
                idsBarbarasMapa = new Set(barbaras.map(function (aldeia) {
                    return String(aldeia.id);
                }));
                validacaoBarbarasEmCurso = false;
                agendar(iniciarFarm, 50);
            }).catch(function (erro) {
                validacaoBarbarasEmCurso = false;
                console.error('Script Farm: validação de proprietários falhou.', erro);
                recuperar(
                    'Sem validação de bárbaras: ' +
                    resumirMensagem(obterMensagemErro(erro), 65)
                );
            });
            return;
        }

        tiposSemTropas.principal = false;
        tiposSemTropas.batedor = false;
        ultimoTipoEnviado = null;

        if (CONFIG.mapearNovasBarbaras && !mapaProcessadoNesteCiclo) {
            mapaProcessadoNesteCiclo = true;
            cancelarTimer(watchdogTimer);
            watchdogTimer = null;
            atualizarBotao(
                'Mapa B prioritário: a procurar aldeias novas até ' +
                CONFIG.raioNovasBarbaras + ' campos…'
            );

            mapearNovasBarbaras().then(function (resultado) {
                if (!estaLigado() || aMudarAldeia || aRecuperar) {
                    return;
                }

                if (resultado.enviados > 0) {
                    recarregarDepoisMapa(resultado);
                    return;
                }

                atualizarBotao('Mapa B: ' + resultado.motivo + ' — a continuar…');
                agendar(iniciarFarm, 100);
            }).catch(function (erro) {
                if (!estaLigado() || aMudarAldeia || aRecuperar) {
                    return;
                }
                console.error('Script Farm: falha no mapa prioritário.', erro);
                recuperar(
                    'Mapa B: ' +
                    resumirMensagem(obterMensagemErro(erro), 80)
                );
            });
            return;
        }

        var planoMuralhas = criarPlanoDemolicaoMuralhas();
        if (planoMuralhas.tarefas.length > 0) {
            cancelarTimer(watchdogTimer);
            watchdogTimer = null;

            executarDemolicoesMuralha(planoMuralhas.tarefas).then(
                function (resultado) {
                    if (!estaLigado() || aMudarAldeia || aRecuperar) {
                        return;
                    }

                    if (resultado.enviados > 0) {
                        recarregarDepoisDemolicoes(resultado.enviados);
                    } else {
                        mudarAldeia(
                            'Muralhas: ' +
                            (resultado.motivo || 'nenhum ataque enviado')
                        );
                    }
                }
            ).catch(function (erro) {
                if (!estaLigado() || aMudarAldeia || aRecuperar) {
                    return;
                }
                console.error('Script Farm: falha ao demolir muralha.', erro);
                recuperar(
                    'Demolição interrompida: ' +
                    resumirMensagem(obterMensagemErro(erro), 70)
                );
            });
            return;
        }

        var plano = criarPlanoFarm();
        var fila = plano.tarefas;

        if (fila.length === 0) {
            if (
                plano.jogadoresIgnorados > 0 &&
                plano.alvosBarbaros === 0
            ) {
                mudarAldeia(
                    plano.jogadoresIgnorados +
                    ' aldeia(s) de jogadores ignorada(s)'
                );
                return;
            }

            if (CONFIG.mapearNovasBarbaras) {
                finalizarListaComMapa(0, 0);
                return;
            }

            if (
                plano.semTropasParaTarefas ||
                (plano.temBotoes && !plano.temBotoesAtivos)
            ) {
                tratarSemTrabalho(
                    'Sem tropas para os modelos ativos',
                    CONFIG.mudarSemTropas
                );
            } else {
                tratarSemTrabalho(
                    'Sem alvos que cumpram os filtros',
                    CONFIG.mudarSemAlvos
                );
            }
            return;
        }

        var indice = 0;
        var enviadosPrincipais = 0;
        var batedoresEnviados = 0;

        function enviarProximo() {
            if (!estaLigado() || aMudarAldeia || aRecuperar) {
                return;
            }

            if (temProtecaoBot()) {
                pausarParaVerificacao();
                return;
            }

            if (semTropasVisiveis()) {
                tratarSemTrabalho('Tropas esgotadas', CONFIG.mudarSemTropas);
                return;
            }

            var tarefa = null;
            while (indice < fila.length && !tarefa) {
                var candidata = fila[indice++];
                var semBatedores =
                    candidata.tipo === 'batedor' &&
                    quantidadeUnidade('spy') === 0;

                if (semBatedores) {
                    tiposSemTropas.batedor = true;
                }

                if (
                    !tiposSemTropas[candidata.tipo] &&
                    candidata.botao.isConnected &&
                    !botaoEstaDesativado(candidata.botao)
                ) {
                    tarefa = candidata;
                }
            }

            if (!tarefa) {
                finalizarListaComMapa(
                    enviadosPrincipais,
                    batedoresEnviados
                );
                return;
            }

            try {
                ultimoTipoEnviado = tarefa.tipo;
                ultimoAlvoEnviado = obterIdAlvoLinha(
                    tarefa.botao.closest('tr')
                );
                tarefa.botao.click();
                marcarEnvioNesteCiclo(tarefa.botao);

                if (tarefa.tipo === 'batedor') {
                    batedoresEnviados += 1;
                } else {
                    enviadosPrincipais += 1;
                }

                atualizarBotao(
                    'Farm: ' + enviadosPrincipais +
                    ' | Batedores: ' + batedoresEnviados
                );
                armarWatchdog();
            } catch (erro) {
                console.error('Script Farm:', erro);
                recuperar('O envio foi interrompido');
                return;
            }

            agendar(
                enviarProximo,
                CONFIG.intervaloAtaque
            );
        }

        atualizarBotao('A iniciar reconhecimento e farm…');
        enviarProximo();
    }

    function finalizarListaComMapa(enviosPrincipais, batedoresDaLista) {
        if (!CONFIG.mapearNovasBarbaras || mapaProcessadoNesteCiclo) {
            mudarAldeia(
                'Farm: ' + enviosPrincipais +
                ' | Batedores: ' + batedoresDaLista
            );
            return;
        }

        cancelarTimer(watchdogTimer);
        watchdogTimer = null;
        atualizarBotao('A procurar novas bárbaras num raio de ' +
            CONFIG.raioNovasBarbaras + ' campos…');

        mapearNovasBarbaras().then(function (resultado) {
            if (!estaLigado() || aMudarAldeia || aRecuperar) {
                return;
            }

            var resumo =
                'Farm: ' + enviosPrincipais +
                ' | Lista B: ' + batedoresDaLista +
                ' | Mapa B: ' + resultado.enviados;

            if (resultado.motivo) {
                resumo += ' (' + resultado.motivo + ')';
            }

            mudarAldeia(resumo);
        }).catch(function (erro) {
            if (!estaLigado() || aMudarAldeia || aRecuperar) {
                return;
            }

            console.error('Script Farm: falha ao mapear bárbaras.', erro);
            recuperar(
                'Mapa B: ' +
                resumirMensagem(obterMensagemErro(erro), 80)
            );
        });
    }

    function recarregarDepoisMapa(resultado) {
        aRecuperar = true;
        limparTimers();
        desligarObservador();
        atualizarBotao(
            'Mapa B: ' + resultado.enviados +
            ' nova(s) reconhecida(s) — a atualizar tropas…'
        );
        agendar(function () {
            window.location.reload();
        }, 700);
    }

    async function mapearNovasBarbaras() {
        var origem = obterCoordenadasOrigem();
        var origemId = obterIdAldeiaOrigem();
        var quantidadeBatedores = quantidadeUnidade('spy');
        var modeloBId = obterIdModeloB();

        if (!origem || !origemId) {
            return criarResultadoMapa(0, 'origem desconhecida');
        }

        if (quantidadeBatedores === 0) {
            tiposSemTropas.batedor = true;
            return criarResultadoMapa(0, 'sem batedores');
        }

        if (!modeloBId) {
            return criarResultadoMapa(0, 'Modelo B não encontrado');
        }

        if (
            !window.TribalWars ||
            typeof window.TribalWars.post !== 'function' ||
            !window.Accountmanager ||
            !window.Accountmanager.send_units_link
        ) {
            return criarResultadoMapa(0, 'envio do jogo indisponível');
        }

        atualizarBotao('Mapa: a carregar aldeias bárbaras…');

        var barbaras = await obterBarbarasDoMapa();
        var auxiliares = await Promise.allSettled([
            obterAlvosConhecidosFarm(),
            obterAtaquesDeSaida()
        ]);
        var conhecidas = auxiliares[0].status === 'fulfilled'
            ? auxiliares[0].value
            : obterAlvosConhecidosPaginaAtual();
        var ataquesDeSaida = auxiliares[1].status === 'fulfilled'
            ? auxiliares[1].value
            : obterAtaquesVisiveisPaginaAtual();
        var reconhecidasRecentemente = obterReconhecidasRecentemente();

        auxiliares.forEach(function (resultado, indice) {
            if (resultado.status === 'rejected') {
                console.warn(
                    'Script Farm: consulta auxiliar do mapa falhou (' +
                    (indice === 0 ? 'lista' : 'ataques') + ').',
                    resultado.reason
                );
            }
        });

        var limite = CONFIG.maxNovasBarbaras;
        if (quantidadeBatedores !== null) {
            limite = Math.min(limite, quantidadeBatedores);
        }

        var estatisticas = {
            noRaio: 0,
            conhecidas: 0,
            atacadas: 0,
            recentes: 0,
            jogadores: 0
        };
        var alvosDeJogadores = obterAlvosDeJogadores();
        var candidatas = barbaras.map(function (aldeia) {
            var diferencaX = aldeia.x - origem.x;
            var diferencaY = aldeia.y - origem.y;
            aldeia.distancia = Math.sqrt(
                (diferencaX * diferencaX) + (diferencaY * diferencaY)
            );
            return aldeia;
        }).filter(function (aldeia) {
            var coordenada = chaveCoordenada(aldeia);

            if (
                aldeia.distancia > CONFIG.raioNovasBarbaras ||
                String(aldeia.id) === String(origemId)
            ) {
                return false;
            }

            if (alvosDeJogadores.has(String(aldeia.id))) {
                estatisticas.jogadores += 1;
                return false;
            }

            estatisticas.noRaio += 1;
            if (
                conhecidas.ids.has(String(aldeia.id)) ||
                conhecidas.coordenadas.has(coordenada)
            ) {
                estatisticas.conhecidas += 1;
                return false;
            }
            if (ataquesDeSaida.has(coordenada)) {
                estatisticas.atacadas += 1;
                return false;
            }
            if (reconhecidasRecentemente.has(String(aldeia.id))) {
                estatisticas.recentes += 1;
                return false;
            }
            return true;
        }).sort(function (primeira, segunda) {
            return primeira.distancia - segunda.distancia ||
                primeira.id - segunda.id;
        }).slice(0, limite);

        if (candidatas.length === 0) {
            return criarResultadoMapa(
                0,
                '0 novas/' + estatisticas.noRaio +
                ' no raio; lista ' + estatisticas.conhecidas +
                ', ataques ' + estatisticas.atacadas +
                ', recentes ' + estatisticas.recentes +
                ', jogadores ' + estatisticas.jogadores
            );
        }

        atualizarBotao(
            'Mapa B: ' + candidatas.length + ' nova(s) de ' +
            estatisticas.noRaio + ' no raio — modelo ' + modeloBId
        );

        var enviados = 0;

        for (var indice = 0; indice < candidatas.length; indice += 1) {
            if (!estaLigado() || aMudarAldeia || aRecuperar) {
                return criarResultadoMapa(enviados, 'interrompido');
            }

            if (temProtecaoBot()) {
                pausarParaVerificacao();
                return criarResultadoMapa(enviados, 'verificação pendente');
            }

            if (quantidadeUnidade('spy') === 0) {
                tiposSemTropas.batedor = true;
                return criarResultadoMapa(enviados, 'sem batedores');
            }

            var alvo = candidatas[indice];
            atualizarBotao(
                'Mapa: ' + (indice + 1) + '/' + candidatas.length +
                ' — ' + alvo.x + '|' + alvo.y +
                ' (' + alvo.distancia.toFixed(1) + ' campos)'
            );

            try {
                await enviarModeloBParaAlvo(alvo.id, modeloBId, origemId);
            } catch (erro) {
                var mensagemErro = obterMensagemErro(erro);

                if (erroIndicaFaltaDeTropas(mensagemErro)) {
                    tiposSemTropas.batedor = true;
                    return criarResultadoMapa(enviados, 'sem batedores');
                }

                if (erroIndicaAldeiaDeJogador(mensagemErro)) {
                    registarAlvoDeJogador(alvo.id);
                    continue;
                }

                if (erroIndicaModeloInvalido(mensagemErro)) {
                    console.warn('Script Farm: Modelo B recusado.', erro);
                    return criarResultadoMapa(enviados, 'Modelo B recusado');
                }

                throw erro;
            }

            enviados += 1;
            registarReconhecimento(alvo.id);
            armarWatchdog();

            if (indice < candidatas.length - 1) {
                await esperarAutomacao(
                    CONFIG.intervaloAtaque
                );
            }
        }

        return criarResultadoMapa(enviados, 'raio concluído');
    }

    function criarResultadoMapa(enviados, motivo) {
        return {
            enviados: enviados,
            motivo: motivo || ''
        };
    }

    function obterIdAldeiaOrigem() {
        var aldeia = window.game_data && window.game_data.village;
        var id = aldeia && Number(aldeia.id);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    function obterIdModeloB() {
        var botaoB = document.querySelector(
            '#plunder_list a.farm_icon_b, #am_widget_Farm a.farm_icon_b'
        );
        var id = obterIdModeloDoElemento(botaoB);

        if (id) {
            return id;
        }

        var inputs = Array.from(document.querySelectorAll(
            'form[action*="action=edit_all"] input[type="hidden"], ' +
            'form[action*="am_farm"] input[type="hidden"]'
        ));

        for (var indice = 0; indice < inputs.length; indice += 1) {
            var input = inputs[indice];
            var nome = input.name || '';

            if (!/(?:template.*\[id\]|template_id)/i.test(nome)) {
                continue;
            }

            var linha = input.closest('tr');
            var linhaAnterior = linha && linha.previousElementSibling;
            var linhaSeguinte = linha && linha.nextElementSibling;
            var pertenceAoModeloB = Boolean(
                (linha && linha.querySelector('.farm_icon_b')) ||
                (linhaAnterior && linhaAnterior.querySelector('.farm_icon_b')) ||
                (linhaSeguinte && linhaSeguinte.querySelector('.farm_icon_b'))
            );

            if (pertenceAoModeloB) {
                id = numeroPositivo(input.value);
                if (id) {
                    return id;
                }
            }
        }

        var templates = window.Accountmanager &&
            window.Accountmanager.farm &&
            window.Accountmanager.farm.templates;
        if (templates) {
            id = numeroPositivo(
                (templates.b && (templates.b.id || templates.b.template_id)) ||
                (templates.B && (templates.B.id || templates.B.template_id))
            );
        }

        return id || null;
    }

    function obterIdModeloDoElemento(elemento) {
        if (!elemento) {
            return null;
        }

        var valores = [
            elemento.getAttribute('data-template-id'),
            elemento.getAttribute('data-template'),
            elemento.dataset && elemento.dataset.templateId,
            elemento.dataset && elemento.dataset.template
        ];

        if (window.jQuery) {
            valores.push(window.jQuery(elemento).data('template_id'));
            valores.push(window.jQuery(elemento).data('template'));
        }

        for (var indice = 0; indice < valores.length; indice += 1) {
            var id = numeroPositivo(valores[indice]);
            if (id) {
                return id;
            }
        }

        var codigo = [
            elemento.getAttribute('href') || '',
            elemento.getAttribute('onclick') || '',
            elemento.outerHTML || ''
        ].join(' ');
        var resultado = codigo.match(
            /(?:template_id|template)[^0-9]{0,12}(\d+)/i
        );

        if (resultado) {
            return numeroPositivo(resultado[1]);
        }

        resultado = codigo.match(
            /Accountmanager\.farm\.sendUnits\s*\(\s*[^,]+\s*,\s*\d+\s*,\s*(\d+)/i
        );

        return resultado ? numeroPositivo(resultado[1]) : null;
    }

    function numeroPositivo(valor) {
        var numero = Number(valor);
        return Number.isFinite(numero) && numero > 0
            ? Math.round(numero)
            : null;
    }

    async function obterBarbarasDoMapa(forcarAtualizacao) {
        var cache = lerJsonSeguro(sessionStorage, MAP_CACHE_KEY, null);

        if (
            !forcarAtualizacao &&
            cache &&
            Date.now() - Number(cache.momento) < MAP_CACHE_DURATION &&
            Array.isArray(cache.aldeias)
        ) {
            return cache.aldeias.map(function (aldeia) {
                return {
                    id: Number(aldeia[0]),
                    x: Number(aldeia[1]),
                    y: Number(aldeia[2])
                };
            });
        }

        var url = new URL('/map/village.txt', window.location.origin).href;
        var texto = await obterTexto(url, 30000);
        var barbaras = [];

        texto.split(/\r?\n/).forEach(function (linha) {
            var campos = linha.split(',');
            if (campos.length < 5 || Number(campos[4]) !== 0) {
                return;
            }

            var id = numeroPositivo(campos[0]);
            var x = Number(campos[2]);
            var y = Number(campos[3]);

            if (id && Number.isFinite(x) && Number.isFinite(y)) {
                barbaras.push({ id: id, x: x, y: y });
            }
        });

        escreverJsonSeguro(sessionStorage, MAP_CACHE_KEY, {
            momento: Date.now(),
            aldeias: barbaras.map(function (aldeia) {
                return [aldeia.id, aldeia.x, aldeia.y];
            })
        });

        return barbaras;
    }

    async function obterAlvosConhecidosFarm() {
        var ids = new Set();
        var coordenadas = new Set();
        extrairAlvosFarm(document, ids, coordenadas);

        var cache = lerJsonSeguro(
            sessionStorage,
            FARM_KNOWN_CACHE_KEY,
            null
        );

        if (
            cache &&
            Date.now() - Number(cache.momento) < FARM_KNOWN_CACHE_DURATION
        ) {
            (cache.ids || []).forEach(function (id) {
                ids.add(String(id));
            });
            (cache.coordenadas || []).forEach(function (coordenada) {
                coordenadas.add(coordenada);
            });
            return { ids: ids, coordenadas: coordenadas };
        }

        var urls = obterUrlsPaginasFarm();

        for (var inicio = 0; inicio < urls.length; inicio += 4) {
            var lote = urls.slice(inicio, inicio + 4);
            var resultados = await Promise.all(lote.map(function (url) {
                return obterTexto(url, 20000);
            }));

            resultados.forEach(function (html) {
                if (!html) {
                    return;
                }
                var pagina = new DOMParser().parseFromString(html, 'text/html');
                extrairAlvosFarm(pagina, ids, coordenadas);
            });
        }

        escreverJsonSeguro(sessionStorage, FARM_KNOWN_CACHE_KEY, {
            momento: Date.now(),
            ids: Array.from(ids),
            coordenadas: Array.from(coordenadas)
        });

        return { ids: ids, coordenadas: coordenadas };
    }

    function extrairAlvosFarm(documento, ids, coordenadas) {
        documento.querySelectorAll(
            '#plunder_list tr[id^="village_"], ' +
            '#am_widget_Farm tr[id^="village_"]'
        ).forEach(function (linha) {
            var resultadoId = linha.id.match(/^village_(\d+)/);
            var coordenada = obterCoordenadas(linha.textContent);

            if (resultadoId) {
                ids.add(resultadoId[1]);
            }
            if (coordenada) {
                coordenadas.add(chaveCoordenada(coordenada));
            }
        });
    }

    function obterAlvosConhecidosPaginaAtual() {
        var ids = new Set();
        var coordenadas = new Set();
        extrairAlvosFarm(document, ids, coordenadas);
        return { ids: ids, coordenadas: coordenadas };
    }

    function obterAtaquesVisiveisPaginaAtual() {
        var coordenadas = new Set();
        document.querySelectorAll(
            '#plunder_list tr[id^="village_"], ' +
            '#am_widget_Farm tr[id^="village_"]'
        ).forEach(function (linha) {
            if (!linhaTemAtaque(linha)) {
                return;
            }
            var coordenada = obterCoordenadas(linha.textContent);
            if (coordenada) {
                coordenadas.add(chaveCoordenada(coordenada));
            }
        });
        return coordenadas;
    }

    function obterUrlsPaginasFarm() {
        var urls = new Set();
        var basesPaginadas = {};
        var seletores = [
            '#plunder_list_nav a[href]',
            '#plunder_list_nav option[value]',
            '.paged-nav-item a[href]',
            '.paged-nav a[href]'
        ];

        document.querySelectorAll(seletores.join(',')).forEach(function (item) {
            var valor = item.getAttribute('href') || item.value;
            if (!valor) {
                return;
            }

            var url;
            try {
                url = new URL(valor, window.location.href);
            } catch (erro) {
                return;
            }

            if (
                url.origin !== window.location.origin ||
                url.searchParams.get('screen') !== 'am_farm'
            ) {
                return;
            }

            url.hash = '';
            urls.add(url.href);

            url.searchParams.forEach(function (parametro, nome) {
                if (!/page/i.test(nome) || !/^\d+$/.test(parametro)) {
                    return;
                }

                var chave = nome + '|' + url.pathname;
                var pagina = Number(parametro);
                if (!basesPaginadas[chave] || pagina > basesPaginadas[chave].max) {
                    basesPaginadas[chave] = {
                        url: new URL(url.href),
                        nome: nome,
                        max: pagina
                    };
                }
            });
        });

        Object.keys(basesPaginadas).forEach(function (chave) {
            var base = basesPaginadas[chave];
            var maximo = Math.min(base.max, 100);

            for (var pagina = 0; pagina <= maximo; pagina += 1) {
                var url = new URL(base.url.href);
                url.searchParams.set(base.nome, pagina);
                urls.add(url.href);
            }
        });

        urls.delete(new URL(window.location.href).href);
        return Array.from(urls).slice(0, 101);
    }

    async function obterAtaquesDeSaida() {
        var coordenadas = new Set();
        var url = criarUrlAtaquesDeSaida();
        var html = await obterTexto(url, 20000);
        var pagina = new DOMParser().parseFromString(html, 'text/html');
        pagina.querySelectorAll(
            '#commands_table tr.row_a, #commands_table tr.row_ax, ' +
            '#commands_table tr.row_b, #commands_table tr.row_bx'
        ).forEach(function (linha) {
            var etiqueta = linha.querySelector(
                '.quickedit-label, .quickedit-content'
            );
            var coordenada = obterCoordenadas(
                etiqueta ? etiqueta.textContent : linha.textContent
            );
            if (coordenada) {
                coordenadas.add(chaveCoordenada(coordenada));
            }
        });

        return coordenadas;
    }

    function criarUrlAtaquesDeSaida() {
        if (window.game_data && window.game_data.link_base_pure) {
            return window.game_data.link_base_pure +
                'overview_villages&mode=commands&type=attack&group=0&page=-1';
        }

        var url = new URL(window.location.href);
        url.searchParams.set('screen', 'overview_villages');
        url.searchParams.set('mode', 'commands');
        url.searchParams.set('type', 'attack');
        url.searchParams.set('group', '0');
        url.searchParams.set('page', '-1');
        return url.href;
    }

    function obterReconhecidasRecentemente() {
        var agora = Date.now();
        var guardadas = lerJsonSeguro(localStorage, MAP_SCOUTED_KEY, {});
        var ativas = new Set();
        var limpas = {};

        Object.keys(guardadas || {}).forEach(function (id) {
            var momento = Number(guardadas[id]);
            if (agora - momento < MAP_SCOUTED_DURATION) {
                ativas.add(String(id));
                limpas[id] = momento;
            }
        });

        escreverJsonSeguro(localStorage, MAP_SCOUTED_KEY, limpas);
        return ativas;
    }

    function registarReconhecimento(alvoId) {
        var guardadas = lerJsonSeguro(localStorage, MAP_SCOUTED_KEY, {});
        guardadas[String(alvoId)] = Date.now();
        escreverJsonSeguro(localStorage, MAP_SCOUTED_KEY, guardadas);
    }

    function chaveCoordenada(coordenada) {
        return Number(coordenada.x) + '|' + Number(coordenada.y);
    }

    function enviarModeloBParaAlvo(alvoId, modeloBId, origemId) {
        return new Promise(function (resolver, rejeitar) {
            var url = String(window.Accountmanager.send_units_link);

            if (/([?&]village=)\d+/.test(url)) {
                url = url.replace(
                    /([?&]village=)\d+/,
                    '$1' + encodeURIComponent(origemId)
                );
            } else {
                var urlEnvio = new URL(url, window.location.href);
                urlEnvio.searchParams.set('village', origemId);
                url = urlEnvio.href;
            }

            window.TribalWars.post(
                url,
                null,
                {
                    target: alvoId,
                    template_id: modeloBId,
                    source: origemId
                },
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

    function obterMensagemErro(erro) {
        if (!erro) {
            return '';
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

    function erroIndicaFaltaDeTropas(mensagem) {
        return /(?:not enough units|insufficient troops|tropas insuficientes|unidades insuficientes|não há tropas|não existem tropas|no hay suficientes unidades|nicht genügend einheiten|pas assez d.unités)/i.test(
            mensagem
        );
    }

    function erroIndicaModeloInvalido(mensagem) {
        return /(?:template|modelo|predefinição|preset).*(?:invalid|inválid|not found|não encontr|inexist|empty|vazi)/i.test(
            mensagem
        );
    }

    function erroIndicaAldeiaDeJogador(mensagem) {
        return /(?:attack villages owned by players|atacar aldeias? (?:pertencentes a|de|que pertencem a) jogadores|atacar aldeas?.*jugadores|d.rfer.*spieler|villages?.*joueurs)/i.test(
            String(mensagem || '')
        );
    }

    function esperarAutomacao(atraso) {
        return new Promise(function (resolver) {
            agendar(resolver, atraso);
        });
    }

    async function obterTexto(url, limiteMs) {
        var pagina = await requisitarPagina(
            url,
            { method: 'GET' },
            limiteMs
        );
        return pagina.texto;
    }

    async function requisitarPagina(url, opcoes, limiteMs) {
        var controlador = typeof AbortController === 'function'
            ? new AbortController()
            : null;
        var temporizador = window.setTimeout(function () {
            if (controlador) {
                controlador.abort();
            }
        }, limiteMs);

        try {
            var resposta = await window.fetch(
                url,
                Object.assign({}, opcoes || {}, {
                    credentials: 'same-origin',
                    signal: controlador ? controlador.signal : undefined
                })
            );
            if (!resposta.ok) {
                throw new Error('HTTP ' + resposta.status);
            }
            return {
                texto: await resposta.text(),
                url: resposta.url || url
            };
        } finally {
            window.clearTimeout(temporizador);
        }
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
            console.warn('Script Farm: cache indisponível.', erro);
        }
    }

    function criarPlanoDemolicaoMuralhas() {
        if (!CONFIG.demolirMuralhas) {
            return { tarefas: [] };
        }

        var vikingsDisponiveis = quantidadeUnidade('axe');
        var arietesDisponiveis = quantidadeUnidade('ram');
        var recentes = obterAtaquesMuralhaRecentes();
        var tarefas = [];
        var linhas = Array.from(document.querySelectorAll(
            '#plunder_list tr[id^="village_"], ' +
            '#am_widget_Farm tr[id^="village_"]'
        ));

        vikingsDisponiveis = vikingsDisponiveis === null
            ? 0
            : vikingsDisponiveis;
        arietesDisponiveis = arietesDisponiveis === null
            ? 0
            : arietesDisponiveis;

        linhas.some(function (linha) {
            if (tarefas.length >= CONFIG.maxDemolicoesPorAldeia) {
                return true;
            }

            var nivel = obterNivelMuralha(linha);
            var alvoId = obterIdAlvoLinha(linha);

            if (
                !nivel ||
                !alvoId ||
                !alvoEhBarbaro(linha) ||
                deveUsarModeloC(linha) ||
                linhaTemAtaque(linha) ||
                recentes.has(String(alvoId)) ||
                !dentroDoLimiteDistancia(linha)
            ) {
                return false;
            }

            var tropas = calcularTropasDemolicao(nivel);
            if (
                vikingsDisponiveis < tropas.axe ||
                arietesDisponiveis < tropas.ram
            ) {
                return false;
            }

            tarefas.push({
                alvoId: alvoId,
                coordenada: obterCoordenadas(linha.textContent),
                nivel: nivel,
                axe: tropas.axe,
                ram: tropas.ram
            });
            vikingsDisponiveis -= tropas.axe;
            arietesDisponiveis -= tropas.ram;
            return false;
        });

        return { tarefas: tarefas };
    }

    function obterNivelMuralha(item) {
        var linha = item && item.matches && item.matches('tr')
            ? item
            : item && item.closest
                ? item.closest('tr')
                : null;

        if (!linha || !linha.cells || linha.cells.length <= 6) {
            return null;
        }

        var texto = linha.cells[6].textContent.trim();
        if (!/^\d+$/.test(texto)) {
            return null;
        }

        var nivel = Number(texto);
        return nivel > 0 ? Math.min(20, nivel) : 0;
    }

    function obterIdAlvoLinha(linha) {
        var resultado = String(linha.id || '').match(/^village_(\d+)/);
        if (resultado) {
            return numeroPositivo(resultado[1]);
        }

        var link = linha.querySelector('a[href*="target="]');
        if (link) {
            try {
                return numeroPositivo(
                    new URL(link.href, window.location.href)
                        .searchParams.get('target')
                );
            } catch (erro) {
                // Tenta o onclick abaixo.
            }
        }

        var botaoFarm = linha.querySelector(
            'a.farm_icon_a, a.farm_icon_b, a.farm_icon_c'
        );
        var codigo = botaoFarm && botaoFarm.getAttribute('onclick');
        resultado = String(codigo || '').match(
            /Accountmanager\.farm\.sendUnits\s*\(\s*[^,]+\s*,\s*(\d+)/i
        );
        return resultado ? numeroPositivo(resultado[1]) : null;
    }

    function alvoEhBarbaro(item) {
        if (!idsBarbarasMapa) {
            return false;
        }

        var linha = item && item.matches && item.matches('tr')
            ? item
            : item && item.closest
                ? item.closest('tr')
                : null;
        var alvoId = linha && obterIdAlvoLinha(linha);
        return Boolean(
            alvoId &&
            idsBarbarasMapa.has(String(alvoId)) &&
            !obterAlvosDeJogadores().has(String(alvoId))
        );
    }

    function obterAlvosDeJogadores() {
        if (idsAlvosDeJogadores === null) {
            idsAlvosDeJogadores = obterRegistosRecentes(
                PLAYER_TARGETS_KEY,
                PLAYER_TARGETS_DURATION
            );
        }
        return idsAlvosDeJogadores;
    }

    function registarAlvoDeJogador(alvoId) {
        var id = numeroPositivo(alvoId);
        if (!id) {
            return;
        }

        obterAlvosDeJogadores().add(String(id));
        var guardados = lerJsonSeguro(localStorage, PLAYER_TARGETS_KEY, {});
        guardados[String(id)] = Date.now();
        escreverJsonSeguro(localStorage, PLAYER_TARGETS_KEY, guardados);

        if (idsBarbarasMapa) {
            idsBarbarasMapa.delete(String(id));
        }
        sessionStorage.removeItem(MAP_CACHE_KEY);

        var linha = document.getElementById('village_' + id);
        if (linha) {
            linha.setAttribute('data-auto-farm-player', '1');
            linha.setAttribute('data-auto-farm-sent', '1');
        }
    }

    function deveUsarModeloC(item) {
        if (!CONFIG.modeloCComInfoAtivo) {
            return false;
        }

        var linha = item && item.matches && item.matches('tr')
            ? item
            : item && item.closest
                ? item.closest('tr')
                : null;
        var botaoC = linha && obterBotaoNoAlvo(linha, 'c');

        return Boolean(botaoC && !botaoEstaDesativado(botaoC));
    }

    function calcularTropasDemolicao(nivelMuralha) {
        var arietesPorNivel = [
            0, 4, 7, 10, 15, 20, 25, 30, 38, 46, 55,
            65, 76, 88, 101, 115, 130, 146, 163, 181, 230
        ];
        var vikingsPorNivel = [
            0, 60, 60, 60, 150, 150, 150, 250, 250, 500, 700,
            900, 1200, 1500, 1800, 2200, 2600, 3100, 3700, 4300, 5000
        ];
        var nivel = Math.min(20, Math.max(1, Number(nivelMuralha)));

        return {
            axe: vikingsPorNivel[nivel],
            ram: arietesPorNivel[nivel]
        };
    }

    async function executarDemolicoesMuralha(tarefas) {
        var enviados = 0;
        var origemId = obterIdAldeiaOrigem();

        if (!origemId) {
            return { enviados: 0, motivo: 'origem desconhecida' };
        }

        for (var indice = 0; indice < tarefas.length; indice += 1) {
            if (!estaLigado() || aMudarAldeia || aRecuperar) {
                return { enviados: enviados, motivo: 'interrompido' };
            }

            var tarefa = tarefas[indice];
            var destino = tarefa.coordenada
                ? chaveCoordenada(tarefa.coordenada)
                : 'ID ' + tarefa.alvoId;
            atualizarBotao(
                'Muralha ' + (indice + 1) + '/' + tarefas.length +
                ': ' + destino + ' nv.' + tarefa.nivel +
                ' — ' + tarefa.axe + ' Vikings + ' + tarefa.ram + ' aríetes'
            );

            try {
                await enviarAtaqueNormalMuralha(tarefa, origemId);
            } catch (erro) {
                var mensagem = obterMensagemErro(erro);
                if (erroIndicaAldeiaDeJogador(mensagem)) {
                    registarAlvoDeJogador(tarefa.alvoId);
                    continue;
                }
                if (erroIndicaFaltaDeTropas(mensagem)) {
                    tiposSemTropas.principal = true;
                    return { enviados: enviados, motivo: 'sem Vikings/aríetes' };
                }
                throw erro;
            }

            enviados += 1;
            registarAtaqueMuralha(tarefa.alvoId);

            if (indice < tarefas.length - 1) {
                await esperarAutomacao(
                    CONFIG.intervaloAtaque
                );
            }
        }

        return { enviados: enviados, motivo: 'concluído' };
    }

    async function enviarAtaqueNormalMuralha(tarefa, origemId) {
        var urlInicial = criarUrlAtaqueNormal(tarefa, origemId);
        var paginaInicial = await requisitarPagina(
            urlInicial,
            { method: 'GET' },
            25000
        );
        var documentoInicial = new DOMParser().parseFromString(
            paginaInicial.texto,
            'text/html'
        );
        var formulario = documentoInicial.querySelector('#command-data-form');

        if (!formulario) {
            throw new Error(
                extrairErroPagina(documentoInicial) ||
                'Formulário de ataque normal indisponível'
            );
        }

        var dados = serializarFormulario(formulario);
        dados.set('axe', tarefa.axe);
        dados.set('ram', tarefa.ram);
        adicionarBotaoFormulario(formulario, dados, ['attack']);

        var paginaConfirmacao = await submeterFormulario(
            formulario,
            paginaInicial.url,
            dados,
            25000
        );
        var documentoConfirmacao = new DOMParser().parseFromString(
            paginaConfirmacao.texto,
            'text/html'
        );
        var confirmacao = documentoConfirmacao.querySelector(
            '#command-confirm-form, form[action*="action=command"]'
        );

        if (!confirmacao) {
            throw new Error(
                extrairErroPagina(documentoConfirmacao) ||
                'O jogo não apresentou a confirmação do ataque'
            );
        }

        var dadosConfirmacao = serializarFormulario(confirmacao);
        adicionarBotaoFormulario(
            confirmacao,
            dadosConfirmacao,
            ['submit', 'send', 'attack']
        );

        var paginaFinal = await submeterFormulario(
            confirmacao,
            paginaConfirmacao.url,
            dadosConfirmacao,
            25000
        );
        var documentoFinal = new DOMParser().parseFromString(
            paginaFinal.texto,
            'text/html'
        );
        var erroFinal = extrairErroPagina(documentoFinal);

        if (
            erroFinal ||
            documentoFinal.querySelector('#command-confirm-form')
        ) {
            throw new Error(erroFinal || 'O ataque não foi confirmado');
        }
    }

    function criarUrlAtaqueNormal(tarefa, origemId) {
        var url;
        if (window.game_data && window.game_data.link_base_pure) {
            url = new URL(
                window.game_data.link_base_pure + 'place',
                window.location.href
            );
        } else {
            url = new URL(window.location.href);
            url.searchParams.set('screen', 'place');
        }

        url.searchParams.set('village', origemId);
        url.searchParams.set('target', tarefa.alvoId);
        url.searchParams.set('axe', tarefa.axe);
        url.searchParams.set('ram', tarefa.ram);
        return url.href;
    }

    function serializarFormulario(formulario) {
        var dados = new URLSearchParams();

        formulario.querySelectorAll('input, select, textarea').forEach(
            function (campo) {
                if (!campo.name || campo.disabled) {
                    return;
                }

                var tipo = String(campo.type || '').toLowerCase();
                if (
                    ['submit', 'button', 'image', 'reset', 'file'].indexOf(tipo) !== -1 ||
                    ((tipo === 'checkbox' || tipo === 'radio') && !campo.checked)
                ) {
                    return;
                }

                if (campo.tagName === 'SELECT' && campo.multiple) {
                    Array.from(campo.options).forEach(function (opcao) {
                        if (opcao.selected) {
                            dados.append(campo.name, opcao.value);
                        }
                    });
                } else {
                    dados.append(campo.name, campo.value);
                }
            }
        );

        return dados;
    }

    function adicionarBotaoFormulario(formulario, dados, nomes) {
        for (var indice = 0; indice < nomes.length; indice += 1) {
            var nome = nomes[indice];
            var botaoSubmit = formulario.querySelector(
                'button[name="' + nome + '"], input[name="' + nome + '"]'
            );
            if (botaoSubmit) {
                dados.set(nome, botaoSubmit.value || '1');
                return;
            }
        }
    }

    async function submeterFormulario(formulario, urlBase, dados, limiteMs) {
        var url = new URL(
            formulario.getAttribute('action') || urlBase,
            urlBase
        );
        var metodo = String(formulario.method || 'POST').toUpperCase();

        if (metodo === 'GET') {
            dados.forEach(function (valor, chave) {
                url.searchParams.append(chave, valor);
            });
            return requisitarPagina(url.href, { method: 'GET' }, limiteMs);
        }

        return requisitarPagina(url.href, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body: dados.toString()
        }, limiteMs);
    }

    function extrairErroPagina(documento) {
        var elemento = documento.querySelector(
            '#error, .error_box, .error-message, .error-msg'
        );
        return elemento ? elemento.textContent.trim() : '';
    }

    function obterAtaquesMuralhaRecentes() {
        return obterRegistosRecentes(
            WALL_ATTACKED_KEY,
            WALL_ATTACKED_DURATION
        );
    }

    function registarAtaqueMuralha(alvoId) {
        var guardados = lerJsonSeguro(localStorage, WALL_ATTACKED_KEY, {});
        guardados[String(alvoId)] = Date.now();
        escreverJsonSeguro(localStorage, WALL_ATTACKED_KEY, guardados);
    }

    function obterRegistosRecentes(chave, duracao) {
        var agora = Date.now();
        var guardados = lerJsonSeguro(localStorage, chave, {});
        var ativos = new Set();
        var limpos = {};

        Object.keys(guardados || {}).forEach(function (id) {
            var momento = Number(guardados[id]);
            if (agora - momento < duracao) {
                ativos.add(String(id));
                limpos[id] = momento;
            }
        });

        escreverJsonSeguro(localStorage, chave, limpos);
        return ativos;
    }

    function recarregarDepoisDemolicoes(quantidade) {
        aRecuperar = true;
        limparTimers();
        desligarObservador();
        atualizarBotao(
            'Muralhas: ' + quantidade +
            ' ataque(s) lançado(s) — a atualizar tropas…'
        );
        agendar(function () {
            window.location.reload();
        }, 700);
    }

    function resumirMensagem(mensagem, maximo) {
        var limpa = String(mensagem || 'erro desconhecido')
            .replace(/\s+/g, ' ')
            .trim();
        return limpa.length > maximo
            ? limpa.slice(0, maximo - 1) + '…'
            : limpa;
    }

    function criarPlanoFarm() {
        var modelosNecessarios = [];
        var batedorListaAtivo =
            CONFIG.batedorModeloBAtivo &&
            !CONFIG.mapearNovasBarbaras;
        var modeloPrincipalAtivo =
            CONFIG.modeloAtivo &&
            !(CONFIG.mapearNovasBarbaras && CONFIG.modelo === 'b');

        if (CONFIG.modeloCComInfoAtivo) {
            modelosNecessarios.push('c');
        }

        if (batedorListaAtivo) {
            modelosNecessarios.push('b');
        }

        if (
            modeloPrincipalAtivo &&
            modelosNecessarios.indexOf(CONFIG.modelo) === -1
        ) {
            modelosNecessarios.push(CONFIG.modelo);
        }

        var botoesRelevantes = [];
        modelosNecessarios.forEach(function (modelo) {
            obterBotoesFarm(modelo).forEach(function (item) {
                if (botoesRelevantes.indexOf(item) === -1) {
                    botoesRelevantes.push(item);
                }
            });
        });

        var alvos = [];
        botoesRelevantes.forEach(function (item) {
            var alvo = item.closest('tr') || item.parentElement || item;
            if (alvos.indexOf(alvo) === -1) {
                alvos.push(alvo);
            }
        });

        var tarefasModeloC = [];
        var tarefasBatedor = [];
        var tarefasPrincipais = [];
        var jogadoresIgnorados = 0;
        var alvosBarbaros = 0;
        var semBatedores =
            batedorListaAtivo &&
            quantidadeUnidade('spy') === 0;

        alvos.forEach(function (alvo) {
            var referencia = null;
            modelosNecessarios.some(function (modelo) {
                referencia = obterBotaoNoAlvo(alvo, modelo);
                return Boolean(referencia);
            });

            if (!referencia) {
                return;
            }

            if (!alvoEhBarbaro(alvo)) {
                jogadoresIgnorados += 1;
                return;
            }
            alvosBarbaros += 1;

            if (
                linhaJaEnviadaNesteCiclo(referencia) ||
                (CONFIG.ignorarAtacados && linhaTemAtaque(referencia)) ||
                !dentroDoLimiteDistancia(referencia)
            ) {
                return;
            }

            if (
                deveUsarModeloC(alvo) &&
                tarefasModeloC.length + tarefasPrincipais.length <
                    CONFIG.maxAtaquesPorAldeia
            ) {
                tarefasModeloC.push({
                    botao: obterBotaoNoAlvo(alvo, 'c'),
                    tipo: 'principal'
                });
                return;
            }

            if (
                (
                    CONFIG.demolirMuralhas &&
                    Number(obterNivelMuralha(alvo)) > 0
                ) ||
                !dentroDoLimiteMuralha(referencia)
            ) {
                return;
            }

            if (
                batedorListaAtivo &&
                !semBatedores &&
                tarefasBatedor.length < CONFIG.maxBatedoresPorAldeia
            ) {
                var botaoB = obterBotaoNoAlvo(alvo, 'b');
                if (botaoB && !botaoEstaDesativado(botaoB)) {
                    tarefasBatedor.push({
                        botao: botaoB,
                        tipo: 'batedor'
                    });
                }
            }

            if (
                modeloPrincipalAtivo &&
                !(batedorListaAtivo && CONFIG.modelo === 'b') &&
                tarefasModeloC.length + tarefasPrincipais.length <
                    CONFIG.maxAtaquesPorAldeia
            ) {
                var botaoPrincipal = obterBotaoNoAlvo(alvo, CONFIG.modelo);
                if (
                    botaoPrincipal &&
                    !botaoEstaDesativado(botaoPrincipal)
                ) {
                    tarefasPrincipais.push({
                        botao: botaoPrincipal,
                        tipo: 'principal'
                    });
                }
            }
        });

        return {
            tarefas: tarefasModeloC.concat(
                tarefasBatedor,
                tarefasPrincipais
            ),
            temBotoes: botoesRelevantes.length > 0,
            temBotoesAtivos: botoesRelevantes.some(function (item) {
                return !botaoEstaDesativado(item);
            }),
            semTropasParaTarefas:
                semBatedores &&
                tarefasModeloC.length === 0 &&
                tarefasPrincipais.length === 0,
            jogadoresIgnorados: jogadoresIgnorados,
            alvosBarbaros: alvosBarbaros
        };
    }

    function obterBotoesFarm(modelo) {
        var classeModelo = 'farm_icon_' + modelo;
        var seletor =
            '#plunder_list a.' + classeModelo + ', ' +
            '#am_widget_Farm a.' + classeModelo;
        return Array.from(document.querySelectorAll(seletor));
    }

    function obterBotaoNoAlvo(alvo, modelo) {
        var classeModelo = 'farm_icon_' + modelo;

        if (alvo.matches && alvo.matches('a.' + classeModelo)) {
            return alvo;
        }

        return alvo.querySelector
            ? alvo.querySelector('a.' + classeModelo)
            : null;
    }

    function botaoEstaDesativado(item) {
        return (
            !item ||
            item.classList.contains('farm_icon_disabled') ||
            item.getAttribute('aria-disabled') === 'true' ||
            item.hasAttribute('disabled') ||
            Boolean(item.closest('.farm_icon_disabled'))
        );
    }

    function marcarEnvioNesteCiclo(item) {
        if (!item) {
            return;
        }

        item.classList.add('farm_icon_disabled');
        var linha = item.closest('tr');
        if (linha) {
            linha.setAttribute('data-auto-farm-sent', '1');
        }
    }

    function linhaJaEnviadaNesteCiclo(item) {
        var linha = item && item.matches && item.matches('tr')
            ? item
            : item && item.closest
                ? item.closest('tr')
                : null;
        return Boolean(
            linha && linha.getAttribute('data-auto-farm-sent') === '1'
        );
    }

    function linhaTemAtaque(item) {
        var linha = item && item.matches && item.matches('tr')
            ? item
            : item && item.closest
                ? item.closest('tr')
                : null;
        if (!linha) {
            return false;
        }

        if (linhaJaEnviadaNesteCiclo(linha)) {
            return true;
        }

        return Array.from(linha.querySelectorAll('img')).some(function (imagem) {
            var origem = (imagem.getAttribute('src') || '').toLowerCase();
            return origem.indexOf('attack') !== -1;
        });
    }

    function dentroDoLimiteMuralha(item) {
        if (!CONFIG.limiteMuralhaAtivo) {
            return true;
        }

        var linha = item.closest('tr');
        if (!linha || linha.cells.length <= 6) {
            return true;
        }

        var nivel = parseInt(linha.cells[6].textContent, 10);
        return Number.isNaN(nivel) || nivel <= CONFIG.muralhaMaxima;
    }

    function dentroDoLimiteDistancia(item) {
        if (!CONFIG.limiteDistanciaAtivo) {
            return true;
        }

        var linha = item.closest('tr');
        var origem = obterCoordenadasOrigem();
        var destino = linha && obterCoordenadas(linha.textContent);

        if (!origem || !destino) {
            return true;
        }

        var diferencaX = destino.x - origem.x;
        var diferencaY = destino.y - origem.y;
        var distancia = Math.sqrt(
            (diferencaX * diferencaX) + (diferencaY * diferencaY)
        );

        return distancia <= CONFIG.distanciaMaxima;
    }

    function obterCoordenadasOrigem() {
        if (!window.game_data || !window.game_data.village) {
            return null;
        }

        var aldeia = window.game_data.village;
        if (aldeia.coord) {
            return obterCoordenadas(aldeia.coord);
        }

        if (Number.isFinite(Number(aldeia.x)) && Number.isFinite(Number(aldeia.y))) {
            return {
                x: Number(aldeia.x),
                y: Number(aldeia.y)
            };
        }

        return null;
    }

    function obterCoordenadas(texto) {
        var resultado = String(texto || '').match(/(\d{1,3})\s*\|\s*(\d{1,3})/);
        if (!resultado) {
            return null;
        }

        return {
            x: Number(resultado[1]),
            y: Number(resultado[2])
        };
    }

    function tratarSemTrabalho(motivo, deveMudar) {
        if (deveMudar) {
            mudarAldeia(motivo);
            return;
        }

        limparTimers();
        desligarObservador();
        atualizarBotao(motivo + ' — em pausa');
    }

    function semTropasVisiveis() {
        var encontrouContador = false;
        var total = 0;

        tiposDeUnidade.forEach(function (tipo) {
            var quantidade = quantidadeUnidade(tipo);
            if (quantidade !== null) {
                encontrouContador = true;
                total += quantidade;
            }
        });

        return encontrouContador && total === 0;
    }

    function quantidadeUnidade(tipo) {
        var elemento = document.getElementById(tipo);
        if (!elemento) {
            return null;
        }

        var quantidade = lerNumero(elemento.textContent);
        return Number.isNaN(quantidade) ? null : quantidade;
    }

    function lerNumero(texto) {
        var digitos = String(texto || '').replace(/[^0-9]/g, '');
        return digitos ? Number(digitos) : Number.NaN;
    }

    function mudarAldeia(motivo) {
        if (!estaLigado() || aMudarAldeia) {
            return;
        }

        if (
            CONFIG.esgotarEnviosAntesMudar &&
            existemEnviosPossiveisAgora()
        ) {
            recarregarParaContinuarAldeia(motivo);
            return;
        }

        aMudarAldeia = true;
        aRecuperar = false;
        limparTimers();
        desligarObservador();
        atualizarBotao(motivo + ' — próxima aldeia…');

        agendar(function () {
            var controlo = encontrarControloAldeiaSeguinte();

            if (!controlo) {
                aMudarAldeia = false;
                recuperar('Não encontrei a aldeia seguinte');
                return;
            }

            var href = controlo.getAttribute('href');
            if (href && href !== '#' && href.indexOf('javascript:') !== 0) {
                window.location.assign(new URL(href, window.location.href).href);
            } else {
                controlo.click();
            }

            agendar(function () {
                window.location.reload();
            }, CONFIG.esperaNavegacao);
        }, CONFIG.esperaProximaAldeia);
    }

    function existemEnviosPossiveisAgora() {
        if (!idsBarbarasMapa || semTropasVisiveis()) {
            return false;
        }

        if (
            !tiposSemTropas.principal &&
            criarPlanoDemolicaoMuralhas().tarefas.length > 0
        ) {
            return true;
        }

        return criarPlanoFarm().tarefas.some(function (tarefa) {
            return (
                !tiposSemTropas[tarefa.tipo] &&
                tarefa.botao &&
                tarefa.botao.isConnected &&
                !botaoEstaDesativado(tarefa.botao)
            );
        });
    }

    function recarregarParaContinuarAldeia(motivo) {
        if (!estaLigado() || aRecuperar) {
            return;
        }

        aRecuperar = true;
        aMudarAldeia = false;
        limparTimers();
        desligarObservador();
        atualizarBotao(
            motivo + ' — ainda há envios; a continuar nesta aldeia…'
        );

        agendar(function () {
            window.location.reload();
        }, 900);
    }

    function encontrarControloAldeiaSeguinte() {
        var seletores = [
            '#village_switch_right',
            'a.arrowRight',
            '.arrowRight a',
            'a.groupRight',
            '.groupRight a',
            '.arrowRight',
            '.groupRight'
        ];

        var candidatos = [];
        seletores.forEach(function (seletor) {
            document.querySelectorAll(seletor).forEach(function (elemento) {
                if (candidatos.indexOf(elemento) === -1) {
                    candidatos.push(elemento);
                }
            });
        });

        return candidatos.find(function (elemento) {
            var href = elemento.getAttribute('href');
            return href && href !== '#';
        }) || candidatos[0] || null;
    }

    function observarPagina() {
        desligarObservador();

        var erroTropas = /(?:not enough units|insufficient troops|tropas insuficientes|unidades insuficientes|não há tropas|não existem tropas|no hay suficientes unidades|nicht genügend einheiten|pas assez d.unités)/i;
        var erroAldeiaJogador = /(?:attack villages owned by players|atacar aldeias? (?:pertencentes a|de|que pertencem a) jogadores|atacar aldeas?.*jugadores|d.rfer.*spieler|villages?.*joueurs)/i;
        var erroGeral = /(?:network error|connection error|erro de rede|erro de ligação|pedido falhou|request failed|script.*interrompido)/i;

        observador = new MutationObserver(function (alteracoes) {
            if (!estaLigado() || aMudarAldeia || aRecuperar) {
                return;
            }

            if (temProtecaoBot()) {
                pausarParaVerificacao();
                return;
            }

            var textoNovo = alteracoes.map(function (alteracao) {
                return Array.from(alteracao.addedNodes).map(function (no) {
                    return no.textContent || '';
                }).join(' ');
            }).join(' ');

            if (erroAldeiaJogador.test(textoNovo)) {
                registarAlvoDeJogador(ultimoAlvoEnviado);
                atualizarBotao(
                    'Aldeia de jogador ignorada — a continuar nas bárbaras…'
                );
            } else if (erroTropas.test(textoNovo)) {
                if (ultimoTipoEnviado) {
                    tiposSemTropas[ultimoTipoEnviado] = true;
                }
            } else if (erroGeral.test(textoNovo)) {
                recuperar('Erro detetado na página');
            }
        });

        observador.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function instalarRecuperacaoGlobal() {
        window.addEventListener('storage', function (evento) {
            if (evento.key === STORAGE_KEY) {
                pararExecucao();

                if (estaLigado()) {
                    atualizarBotao(
                        estaNoAssistenteFarm()
                            ? 'A retomar neste separador…'
                            : 'Ligado — separador de trabalho pendente'
                    );

                    if (estaNoAssistenteFarm()) {
                        agendar(executarControlador, 100);
                    }
                } else {
                    atualizarBotao('Parado');
                }
            } else if (
                evento.key === WORKER_KEY &&
                estaLigado() &&
                !estaNoAssistenteFarm() &&
                workerEstaAtivo()
            ) {
                var sinal = lerSinalWorker();
                atualizarBotao(
                    sinal && sinal.estado
                        ? 'Worker: ' + sinal.estado
                        : 'A trabalhar noutro separador'
                );
            } else if (
                evento.key === WORKER_KEY &&
                estaLigado() &&
                estaNoAssistenteFarm() &&
                !workerEstaAtivo()
            ) {
                agendar(executarControlador, 500);
            } else if (evento.key === SETTINGS_KEY) {
                CONFIG = carregarConfiguracao();
                preencherPainelSeExistir();

                if (estaLigado() && estaNoAssistenteFarm()) {
                    reiniciarSeLigado();
                }
            }
        });

        window.addEventListener('beforeunload', function () {
            pararSinalWorker(true);
        });

        window.addEventListener('error', function (evento) {
            if (evento.error && estaLigado() && !temProtecaoBot()) {
                recuperar('Erro de JavaScript');
            }
        });

        window.addEventListener('unhandledrejection', function () {
            if (estaLigado() && !temProtecaoBot()) {
                recuperar('Operação interrompida');
            }
        });

        window.addEventListener('online', function () {
            if (estaLigado()) {
                recuperar('Ligação recuperada', 500);
            }
        });

        if (window.jQuery) {
            window.jQuery(document).ajaxError(function () {
                if (estaLigado() && estaNoAssistenteFarm() && !temProtecaoBot()) {
                    recuperar('Falha de comunicação com o jogo');
                }
            });
        }
    }

    function armarWatchdog() {
        if (!CONFIG.atualizarEmErros) {
            return;
        }

        cancelarTimer(watchdogTimer);
        watchdogTimer = agendar(function () {
            recuperar('Sem resposta do jogo');
        }, CONFIG.limiteSemProgresso);
    }

    function recuperar(motivo, atraso) {
        if (!estaLigado() || aRecuperar || temProtecaoBot()) {
            return;
        }

        aRecuperar = true;
        aMudarAldeia = false;
        limparTimers();
        desligarObservador();

        if (!CONFIG.atualizarEmErros) {
            aRecuperar = false;
            atualizarBotao(motivo + ' — em pausa');
            return;
        }

        atualizarBotao(motivo + ' — a atualizar…');

        agendar(function () {
            window.location.reload();
        }, typeof atraso === 'number' ? atraso : CONFIG.esperaRecuperacao);
    }

    function temProtecaoBot() {
        if (!document.body) {
            return false;
        }

        return (
            document.body.hasAttribute('data-bot-protect') ||
            Boolean(document.querySelector(
                '#bot_check, #botprotection_quest, #captcha, [id*="captcha"]'
            ))
        );
    }

    function pausarParaVerificacao() {
        limparTimers();
        desligarObservador();
        aRecuperar = false;
        aMudarAldeia = false;
        atualizarBotao('Verificação/CAPTCHA — resolve manualmente');

        function verificarNovamente() {
            if (!estaLigado()) {
                return;
            }

            if (temProtecaoBot()) {
                agendar(verificarNovamente, 2000);
            } else {
                recuperar('Verificação concluída', 500);
            }
        }

        agendar(verificarNovamente, 2000);
    }

    function pararExecucao() {
        limparTimers();
        desligarObservador();
        pararSinalWorker(true);
        aMudarAldeia = false;
        aRecuperar = false;
    }

    function preencherPainelSeExistir() {
        if (document.getElementById(SETTINGS_ID)) {
            preencherPainelDefinicoes();
        }
    }

    function desligarObservador() {
        if (observador) {
            observador.disconnect();
            observador = null;
        }
    }

    function agendar(funcao, atraso) {
        var atrasoComVariacao = aplicarVariacao10(atraso);
        var id = window.setTimeout(function () {
            timers.delete(id);
            funcao();
        }, atrasoComVariacao);
        timers.add(id);
        return id;
    }

    function cancelarTimer(id) {
        if (id !== null && id !== undefined) {
            window.clearTimeout(id);
            timers.delete(id);
        }
    }

    function limparTimers() {
        timers.forEach(function (id) {
            window.clearTimeout(id);
        });
        timers.clear();
        watchdogTimer = null;
    }

    function aplicarVariacao10(atraso) {
        var tempoBase = Math.max(0, Number(atraso) || 0);
        if (tempoBase === 0) {
            return 0;
        }

        return Math.round(
            tempoBase * (0.9 + (Math.random() * 0.2))
        );
    }
}());
