// ==UserScript==
// @name         TW PT - AutoFarm - ThePlaguePT
// @namespace    theplaguept.tw.autofarm
// @version      1.0.2
// @description  Automação por rondas do Assistente de Saque do Tribal Wars.
// @author       ThePlaguePT
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// @match        *://*/game.php*
// @include      *://*.tribalwars.*/game.php*
// @homepageURL  https://github.com/ThePlaguePT/TribalWars-Scripts
// @supportURL   https://github.com/ThePlaguePT/TribalWars-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20AutoFarm%20-%20ThePlaguePT.user.js
// @downloadURL  https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20AutoFarm%20-%20ThePlaguePT.user.js
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    if (window.top !== window.self || !/\/game\.php$/i.test(window.location.pathname)) return;
    if (window.__twPtAutoFarm) return;

    const APP = Object.freeze({
        name: 'TW PT - AutoFarm - ThePlaguePT',
        shortName: 'TW PT - AutoFarm',
        version: '1.0.2',
        id: 'twPtAutoFarm',
        buttonId: 'auto-farm-a-toggle',
        toolbarId: 'tp-theplaguept-script-bar',
        toolbarStyleId: 'tp-theplaguept-script-bar-style',
        styleId: 'twPtAutoFarm-style',
        statusId: 'twPtAutoFarm-worker-status',
        settingsId: 'twPtAutoFarm-settings',
        workerHeartbeatMs: 3000,
        workerFreshMs: 90000,
        monitorMs: 2500,
    });

    const world = getWorld();
    const tabId = makeId();
    const keys = Object.freeze({
        enabled: `twPtAutoFarm.v1.${world}.enabled`,
        worker: `twPtAutoFarm.v1.${world}.worker`,
        settings: `twPtAutoFarm.v1.${world}.settings`,
    });
    const DEFAULT_SETTINGS = Object.freeze({
        schema: 1,
        models: {
            a: defaultModel(true),
            b: defaultModel(true),
            c: defaultModel(false),
        },
    });
    const workerWindowName = `TW_PT_AutoFarm_${world}`;
    const workerLockName = `twPtAutoFarm-worker-${world}`;

    const state = {
        button: null,
        panel: null,
        settingsPanel: null,
        settings: null,
        savedTimer: 0,
        workerWindow: null,
        monitorTimer: 0,
        heartbeatTimer: 0,
        fallbackLeaseTimer: 0,
        releaseLock: null,
        ownsWorker: false,
        acquiringWorker: false,
        duplicateWorker: false,
        popupBlocked: false,
        destroyed: false,
    };

    window.__twPtAutoFarm = Object.freeze({
        name: APP.name,
        version: APP.version,
        world,
        enable: () => enable(true),
        disable,
        openWorker: () => openWorker(true),
        isEnabled,
        getSettings: () => clone(state.settings || loadSettings()),
        getStatus: () => ({
            enabled: isEnabled(),
            world,
            farmPage: isFarmPage(),
            ownsWorker: state.ownsWorker,
            worker: readWorker(),
        }),
    });

    ready(init);

    function init() {
        state.settings = loadSettings();
        injectStyles();
        createButton();
        bindEvents();
        startMonitor();

        if (isFarmPage()) {
            createWorkerPanel();
            createModelsPanel();
            if (isEnabled()) startWorker();
        }

        updateUi();
        console.info(`[${APP.shortName}] v${APP.version} carregado em ${world}.`);

        if (window.__autoFarmAController) {
            console.warn(
                `[${APP.shortName}] A versão antiga "Script Farm" também está ativa. ` +
                'Desativa-a no gestor de userscripts antes de testar este ficheiro novo.'
            );
        }
    }

    function bindEvents() {
        window.addEventListener('storage', event => {
            if (event.key === keys.enabled) {
                if (isEnabled() && isFarmPage()) startWorker();
                if (!isEnabled()) stopWorker();
                updateUi();
            }

            if (event.key === keys.worker) updateUi();
            if (event.key === keys.settings) {
                state.settings = loadSettings();
                renderSettingsUi();
            }
        });

        window.addEventListener('beforeunload', destroy, { once: true });
        window.addEventListener('pagehide', destroy, { once: true });
    }

    function createButton() {
        document.getElementById(APP.buttonId)?.remove();

        const button = document.createElement('button');
        button.id = APP.buttonId;
        button.className = 'tp-theplaguept-script-bar-item';
        button.type = 'button';
        button.innerHTML = `
            <span class="auto-farm-a-launcher-icon">SF</span>
            <span data-auto-farm-dot aria-hidden="true"></span>
            <span data-auto-farm-countdown hidden></span>
        `;
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (isEnabled()) {
                disable();
            } else {
                enable(true);
            }
        });

        ensureToolbar().appendChild(button);
        state.button = button;
    }

    function ensureToolbar() {
        let toolbar = document.getElementById(APP.toolbarId);
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = APP.toolbarId;
            toolbar.setAttribute('aria-label', 'Botões ThePlaguePT');
            document.body.appendChild(toolbar);
        }
        return toolbar;
    }

    function injectStyles() {
        if (!document.getElementById(APP.toolbarStyleId)) {
            const sharedStyle = document.createElement('style');
            sharedStyle.id = APP.toolbarStyleId;
            sharedStyle.textContent = `
                #${APP.toolbarId}{position:absolute!important;top:8px!important;left:414px!important;z-index:2147483647!important;width:350px!important;height:34px!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:5px!important;padding:0 8px!important;box-sizing:border-box!important;pointer-events:none!important;overflow:visible!important}
                #${APP.toolbarId}>*{position:relative!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;transform:none!important;width:30px!important;min-width:30px!important;max-width:30px!important;height:28px!important;min-height:28px!important;margin:0!important;flex:0 0 30px!important;pointer-events:auto!important;overflow:visible!important}
            `;
            (document.head || document.documentElement).appendChild(sharedStyle);
        }

        if (document.getElementById(APP.styleId)) return;
        const style = document.createElement('style');
        style.id = APP.styleId;
        style.textContent = `
            #${APP.toolbarId}>#${APP.buttonId}{order:90!important;position:relative!important;width:30px!important;min-width:30px!important;max-width:30px!important;height:28px!important;min-height:28px!important;margin:0!important;padding:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#b33a34,#8f2420 55%,#681611)!important;box-shadow:inset 0 1px 0 #ffffff59,inset 0 -1px 0 #00000059,0 2px 5px #00000073!important;color:#fff!important;font:700 10px Verdana,Arial,sans-serif!important;text-shadow:1px 1px 1px #000!important;cursor:pointer!important;overflow:visible!important}
            #${APP.toolbarId}>#${APP.buttonId}.af-ligado{background:linear-gradient(to bottom,#5f9f3d,#3f7c27 55%,#28551a)!important}
            #${APP.toolbarId}>#${APP.buttonId}:hover,#${APP.toolbarId}>#${APP.buttonId}:focus-visible{filter:brightness(1.18)!important}
            #${APP.buttonId} .auto-farm-a-launcher-icon{display:block!important;line-height:26px!important}
            #${APP.buttonId} [data-auto-farm-dot]{position:absolute!important;right:2px!important;bottom:2px!important;width:6px!important;height:6px!important;border:1px solid #2b1509!important;border-radius:50%!important;background:#ff6b6b!important;box-shadow:0 0 2px #000!important}
            #${APP.buttonId}.af-ligado [data-auto-farm-dot]{background:#7cfc00!important}
            #${APP.buttonId} [data-auto-farm-countdown]{position:absolute!important;display:block!important;top:31px!important;left:50%!important;transform:translateX(-50%)!important;min-width:46px!important;padding:3px 5px!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#f6dfaa,#d2a05a)!important;color:#2b1509!important;font:bold 10px Verdana,Arial,sans-serif!important;line-height:13px!important;text-align:center!important;text-shadow:0 1px #fff!important;box-shadow:0 2px 5px #0008!important;white-space:nowrap!important;pointer-events:none!important;z-index:2147483647!important}
            #${APP.buttonId} [data-auto-farm-countdown][hidden]{display:none!important}
            #${APP.toolbarId}>#${APP.buttonId}::after{content:attr(data-tp-title);position:absolute!important;display:none!important;top:33px!important;left:50%!important;transform:translateX(-50%)!important;min-width:max-content!important;max-width:380px!important;padding:4px 8px!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#f6dfaa,#d2a05a)!important;color:#2b1509!important;font:bold 11px Verdana,Arial,sans-serif!important;text-shadow:0 1px #fff!important;box-shadow:0 2px 6px #0008!important;white-space:nowrap!important;pointer-events:none!important;z-index:2147483647!important}
            #${APP.toolbarId}>#${APP.buttonId}:hover::after,#${APP.toolbarId}>#${APP.buttonId}:focus-visible::after{display:block!important}
            #${APP.statusId}{margin:8px 0;padding:7px 10px;border:1px solid #c1a264;background:#f4e4b8;color:#3b260f;font:11px Verdana,Arial,sans-serif;box-sizing:border-box}
            #${APP.statusId} strong{margin-right:9px;color:#5d2d12}
            #${APP.statusId} [data-role="state"]{font-weight:bold}
            #${APP.statusId}[data-state="active"] [data-role="state"]{color:#287119}
            #${APP.statusId}[data-state="duplicate"] [data-role="state"],#${APP.statusId}[data-state="waiting"] [data-role="state"]{color:#9a5b0b}
            #${APP.statusId}[data-state="off"] [data-role="state"]{color:#8a1c17}
            #${APP.statusId} small{display:block;margin-top:3px;color:#84683a}
            #${APP.settingsId}{margin:8px 0 12px;border:1px solid #c8a86a;background:#f6e8bd;color:#3c2a14;font:11px Verdana,Arial,sans-serif;box-sizing:border-box}
            #${APP.settingsId} *{box-sizing:border-box}
            #${APP.settingsId} .af-settings-title{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 12px;border-bottom:1px solid #d3b97d;background:linear-gradient(to bottom,#f9edca,#f0dca8);font:20px Georgia,'Times New Roman',serif;color:#3d2915}
            #${APP.settingsId} .af-settings-title small{font:10px Verdana,Arial,sans-serif;color:#80643b}
            #${APP.settingsId} .af-models-wrap{padding:12px}
            #${APP.settingsId} .af-section-title{display:flex;align-items:center;gap:9px;margin:0 0 8px;color:#75501f;font-weight:bold;letter-spacing:1.2px}
            #${APP.settingsId} .af-section-title::after{content:'';height:1px;flex:1;background:#b99658}
            #${APP.settingsId} .af-model-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
            #${APP.settingsId} .af-model-card{min-width:0;border:1px solid #c4a15d;border-radius:4px;background:#faefd0;box-shadow:0 1px 2px #70502024;overflow:hidden;transition:opacity .15s ease}
            #${APP.settingsId} .af-model-card.af-model-off{opacity:.56}
            #${APP.settingsId} .af-model-head{display:flex;align-items:center;gap:8px;min-height:38px;padding:6px 10px;border-bottom:1px solid #d3b778;background:#f8e8bc}
            #${APP.settingsId} .af-model-badge{display:inline-flex;align-items:center;justify-content:center;width:25px;height:25px;border:1px solid #594325;border-radius:4px;background:linear-gradient(#7f6846,#3f3020);box-shadow:inset 0 1px #ffffff73,0 1px 2px #0005;color:#f8e8bd;font:bold 17px Georgia,serif;text-shadow:1px 1px #000}
            #${APP.settingsId} .af-model-name{font-weight:bold;font-size:12px;flex:1}
            #${APP.settingsId} .af-switch{display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none}
            #${APP.settingsId} .af-switch input{position:absolute;opacity:0;pointer-events:none}
            #${APP.settingsId} .af-switch-track{position:relative;width:32px;height:18px;border:1px solid #a37b35;border-radius:10px;background:#ecd8a5;box-shadow:inset 0 1px 2px #0003}
            #${APP.settingsId} .af-switch-track::after{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#9a855b;box-shadow:0 1px 2px #0005;transition:left .14s ease,background .14s ease}
            #${APP.settingsId} .af-switch input:checked+.af-switch-track{background:#b48335}
            #${APP.settingsId} .af-switch input:checked+.af-switch-track::after{left:16px;background:#f5dfaa}
            #${APP.settingsId} .af-switch input:focus-visible+.af-switch-track{outline:2px solid #3777c7;outline-offset:1px}
            #${APP.settingsId} .af-model-body{padding:7px 10px 9px}
            #${APP.settingsId} .af-filter-row{display:grid;grid-template-columns:minmax(118px,1fr) 18px 52px;align-items:center;gap:6px;min-height:36px;border-bottom:1px dashed #dcc38b}
            #${APP.settingsId} .af-filter-label,#${APP.settingsId} .af-subtitle{color:#806037;font-weight:bold;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
            #${APP.settingsId} .af-filter-label{display:flex;align-items:center;gap:5px;white-space:nowrap}
            #${APP.settingsId} .af-filter-label img{width:16px;height:16px;object-fit:contain}
            #${APP.settingsId} input[type="checkbox"]{width:15px;height:15px;margin:0;accent-color:#76501c;cursor:pointer}
            #${APP.settingsId} input[type="number"]{width:100%;height:27px;padding:3px 6px;border:1px solid #d2b275;border-radius:3px;background:#fffaf0;color:#3b2814;font:11px Verdana,Arial,sans-serif}
            #${APP.settingsId} input:disabled{cursor:not-allowed;opacity:.62;background:#f0e3bf}
            #${APP.settingsId} .af-resource-row{grid-template-columns:minmax(118px,1fr) 18px 1fr auto 1fr}
            #${APP.settingsId} .af-resource-icons{display:inline-flex;gap:2px}
            #${APP.settingsId} .af-resource-icons img{width:13px;height:13px}
            #${APP.settingsId} .af-subtitle{margin:8px 0 5px}
            #${APP.settingsId} .af-loot-types{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding-bottom:7px;border-bottom:1px dashed #dcc38b}
            #${APP.settingsId} .af-check-option{display:flex;align-items:center;gap:5px;min-height:27px;padding:4px 6px;border:1px solid #d4b777;border-radius:3px;background:#fff7df;font-weight:bold;font-size:10px;text-transform:uppercase;color:#77562d;cursor:pointer}
            #${APP.settingsId} .af-reports{display:grid;grid-template-columns:1fr 1fr;gap:4px}
            #${APP.settingsId} .af-report-option{position:relative;display:flex;align-items:center;gap:5px;min-height:27px;padding:4px 7px;border:1px solid #d8c28d;border-radius:3px;background:#eadcaf;color:#7b6743;cursor:pointer;user-select:none}
            #${APP.settingsId} .af-report-option.af-selected{border-color:#9c651b;background:#fff8e5;color:#3f2d18;font-weight:bold}
            #${APP.settingsId} .af-report-option input{position:absolute;opacity:0;pointer-events:none}
            #${APP.settingsId} .af-report-option:focus-within{outline:2px solid #3777c7;outline-offset:1px}
            #${APP.settingsId} .af-report-dot{width:11px;height:11px;flex:0 0 11px;border-radius:50%;box-shadow:inset 0 1px #fff8,0 1px 2px #0004}
            #${APP.settingsId} .af-blue{background:#2387e8}#${APP.settingsId} .af-green{background:#58bf38}#${APP.settingsId} .af-yellow{background:#ffd21a}#${APP.settingsId} .af-red{background:#df3c2c}
            #${APP.settingsId} .af-red-blue{background:linear-gradient(90deg,#df3c2c 0 50%,#2387e8 50%)}
            #${APP.settingsId} .af-red-yellow{background:linear-gradient(90deg,#df3c2c 0 50%,#ffd21a 50%)}
            #${APP.settingsId} .af-model-off .af-model-body{pointer-events:none}
            @media(max-width:950px){#${APP.settingsId} .af-model-grid{grid-template-columns:1fr}#${APP.settingsId} .af-settings-title{font-size:17px}}
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function createWorkerPanel() {
        let panel = document.getElementById(APP.statusId);
        if (!panel) {
            panel = document.createElement('div');
            panel.id = APP.statusId;
            panel.innerHTML = `
                <strong>${escapeHtml(APP.name)} v${APP.version}</strong>
                <span data-role="state"></span>
                <small>Base limpa: nesta fase não envia ataques nem muda de aldeia.</small>
            `;

            const anchor = document.querySelector('#am_widget_Farm, #content_value, #contentContainer');
            if (anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor);
            else document.body.prepend(panel);
        }
        state.panel = panel;
    }

    function createModelsPanel() {
        let panel = document.getElementById(APP.settingsId);
        if (!panel) {
            panel = document.createElement('section');
            panel.id = APP.settingsId;
            panel.setAttribute('aria-label', 'Definições dos modelos do AutoFarm');
            panel.innerHTML = `
                <header class="af-settings-title">
                    <span>Auto Farm — Definições</span>
                    <small data-role="saved">Guardado automaticamente — ${escapeHtml(world)}</small>
                </header>
                <div class="af-models-wrap">
                    <div class="af-section-title">MODELOS</div>
                    <div class="af-model-grid">
                        ${modelCard('a', 'A')}
                        ${modelCard('b', 'B')}
                        ${modelCard('c', 'C')}
                    </div>
                </div>
            `;

            panel.addEventListener('change', event => {
                if (!(event.target instanceof HTMLInputElement) || !event.target.dataset.setting) return;
                saveSettingsFromPanel();
            });

            if (state.panel?.parentNode) {
                state.panel.insertAdjacentElement('afterend', panel);
            } else {
                const anchor = document.querySelector('#am_widget_Farm, #content_value, #contentContainer');
                if (anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor);
                else document.body.prepend(panel);
            }
        }

        state.settingsPanel = panel;
        renderSettingsUi();
    }

    function modelCard(modelKey, letter) {
        const base = `models.${modelKey}`;
        const reportOptions = [
            ['blue', 'Azul', 'af-blue'],
            ['green', 'Verde', 'af-green'],
            ['yellow', 'Amarelo', 'af-yellow'],
            ['red', 'Vermelho', 'af-red'],
            ['redBlue', 'Verm./azul', 'af-red-blue'],
            ['redYellow', 'Verm./amar.', 'af-red-yellow'],
        ];

        return `
            <article class="af-model-card" data-model="${modelKey}">
                <header class="af-model-head">
                    <span class="af-model-badge" aria-hidden="true">${letter}</span>
                    <span class="af-model-name">Modelo ${letter}</span>
                    <label class="af-switch">
                        <input class="af-model-enabled" type="checkbox" data-setting="${base}.enabled">
                        <span class="af-switch-track" aria-hidden="true"></span>
                        <span>Ativo</span>
                    </label>
                </header>
                <div class="af-model-body">
                    <div class="af-filter-row" data-filter="wall">
                        <span class="af-filter-label"><img src="/graphic/buildings/wall.png" alt="">Muralha máx.</span>
                        <input type="checkbox" data-setting="${base}.wall.enabled" aria-label="Limitar muralha do Modelo ${letter}">
                        <input type="number" min="0" max="20" step="1" data-setting="${base}.wall.max" aria-label="Nível máximo de muralha do Modelo ${letter}">
                    </div>
                    <div class="af-filter-row" data-filter="distance">
                        <span class="af-filter-label"><span aria-hidden="true">⚑</span>Distância máx.</span>
                        <input type="checkbox" data-setting="${base}.distance.enabled" aria-label="Limitar distância do Modelo ${letter}">
                        <input type="number" min="0" max="999" step="1" data-setting="${base}.distance.max" aria-label="Distância máxima do Modelo ${letter}">
                    </div>
                    <div class="af-filter-row af-resource-row" data-filter="resources">
                        <span class="af-filter-label">
                            <span class="af-resource-icons" aria-hidden="true">
                                <img src="/graphic/holz.png" alt=""><img src="/graphic/lehm.png" alt=""><img src="/graphic/eisen.png" alt="">
                            </span>
                            Recursos
                        </span>
                        <input type="checkbox" data-setting="${base}.resources.enabled" aria-label="Limitar recursos do Modelo ${letter}">
                        <input type="number" min="0" max="1000000000" step="1" data-setting="${base}.resources.min" aria-label="Recursos mínimos do Modelo ${letter}">
                        <span aria-hidden="true">–</span>
                        <input type="number" min="0" max="1000000000" step="1" data-setting="${base}.resources.max" aria-label="Recursos máximos do Modelo ${letter}">
                    </div>

                    <div class="af-subtitle">Tipo de saque</div>
                    <div class="af-loot-types">
                        <label class="af-check-option">
                            <input type="checkbox" data-setting="${base}.loot.full">
                            <span aria-hidden="true">💰</span>Saque total
                        </label>
                        <label class="af-check-option">
                            <input type="checkbox" data-setting="${base}.loot.partial">
                            <span aria-hidden="true">🪙</span>Saque parcial
                        </label>
                    </div>

                    <div class="af-subtitle">Relatórios</div>
                    <div class="af-reports">
                        ${reportOptions.map(([key, label, dotClass]) => `
                            <label class="af-report-option" data-report="${key}">
                                <input type="checkbox" data-setting="${base}.reports.${key}">
                                <span class="af-report-dot ${dotClass}" aria-hidden="true"></span>
                                <span>${label}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            </article>
        `;
    }

    function saveSettingsFromPanel() {
        if (!state.settingsPanel) return;
        const next = clone(state.settings || DEFAULT_SETTINGS);

        state.settingsPanel.querySelectorAll('input[data-setting]').forEach(input => {
            const value = input.type === 'checkbox' ? input.checked : Number(input.value);
            setByPath(next, input.dataset.setting, value);
        });

        state.settings = normalizeSettings(next);
        try {
            localStorage.setItem(keys.settings, JSON.stringify(state.settings));
        } catch (error) {
            console.error(`[${APP.shortName}] Não foi possível guardar as definições.`, error);
            notify('error', 'Não foi possível guardar as definições do AutoFarm.');
            return;
        }

        renderSettingsUi();
        showSavedState();
        window.dispatchEvent(new CustomEvent('twPtAutoFarm:settings', {
            detail: { world, settings: clone(state.settings) },
        }));
    }

    function renderSettingsUi() {
        if (!state.settingsPanel || !state.settings) return;

        state.settingsPanel.querySelectorAll('input[data-setting]').forEach(input => {
            const value = getByPath(state.settings, input.dataset.setting);
            if (input.type === 'checkbox') input.checked = Boolean(value);
            else input.value = String(value);
        });

        state.settingsPanel.querySelectorAll('.af-model-card').forEach(card => {
            const modelKey = card.dataset.model;
            const model = state.settings.models[modelKey];
            const active = Boolean(model.enabled);
            card.classList.toggle('af-model-off', !active);

            card.querySelectorAll('input').forEach(input => {
                input.disabled = !active && !input.classList.contains('af-model-enabled');
            });

            card.querySelectorAll('.af-filter-row').forEach(row => {
                const filter = model[row.dataset.filter];
                row.querySelectorAll('input[type="number"]').forEach(input => {
                    input.disabled = !active || !filter.enabled;
                });
            });

            card.querySelectorAll('.af-report-option').forEach(option => {
                const checkbox = option.querySelector('input[type="checkbox"]');
                option.classList.toggle('af-selected', Boolean(checkbox?.checked));
            });
        });
    }

    function showSavedState() {
        const label = state.settingsPanel?.querySelector('[data-role="saved"]');
        if (!label) return;
        window.clearTimeout(state.savedTimer);
        label.textContent = `✓ Guardado agora — ${world}`;
        state.savedTimer = window.setTimeout(() => {
            label.textContent = `Guardado automaticamente — ${world}`;
        }, 1600);
    }

    function enable(openTab) {
        localStorage.setItem(keys.enabled, '1');
        state.popupBlocked = false;

        if (isFarmPage()) {
            startWorker();
            notify('success', `${APP.shortName} ligado em ${world}.`);
        } else if (openTab) {
            openWorker(true);
        }
        updateUi();
    }

    function disable() {
        localStorage.setItem(keys.enabled, '0');
        state.popupBlocked = false;
        stopWorker();
        updateUi();
        notify('success', `${APP.shortName} desligado em ${world}.`);
    }

    function openWorker(fromUserGesture) {
        if (!isEnabled()) localStorage.setItem(keys.enabled, '1');

        if (isFarmPage()) {
            startWorker();
            updateUi();
            return window;
        }

        const url = buildFarmUrl();
        let worker = null;
        try {
            worker = window.open(url, workerWindowName);
        } catch (error) {
            console.error(`[${APP.shortName}] Não foi possível abrir o worker.`, error);
        }

        if (!worker) {
            state.popupBlocked = true;
            updateUi();
            if (fromUserGesture) {
                notify('error', 'O browser bloqueou o separador do Assistente de Saque. Autoriza pop-ups para este mundo e volta a ligar o botão AF.');
            }
            return null;
        }

        state.workerWindow = worker;
        state.popupBlocked = false;
        try {
            worker.blur();
            window.focus();
        } catch (_) {
            // Alguns browsers não permitem controlar o foco de outro separador.
        }

        notify('success', 'Assistente de Saque aberto num separador próprio. A página atual não foi alterada.');
        updateUi();
        return worker;
    }

    function buildFarmUrl() {
        const url = new URL(window.location.href);
        ['mode', 'action', 'page', 'ajax', 'ajaxaction', 'view'].forEach(name => {
            url.searchParams.delete(name);
        });
        url.searchParams.set('screen', 'am_farm');

        const villageId = getVillageId();
        if (villageId) url.searchParams.set('village', villageId);
        return url.toString();
    }

    function startWorker() {
        if (!isFarmPage() || !isEnabled() || state.ownsWorker || state.acquiringWorker) return;

        state.acquiringWorker = true;
        state.duplicateWorker = false;
        updateUi();

        if (navigator.locks?.request) {
            navigator.locks.request(workerLockName, { mode: 'exclusive', ifAvailable: true }, async lock => {
                state.acquiringWorker = false;
                if (!lock || !isEnabled() || state.destroyed) {
                    state.duplicateWorker = Boolean(!lock);
                    updateUi();
                    return;
                }

                claimWorker();
                await new Promise(resolve => {
                    state.releaseLock = resolve;
                });
            }).catch(error => {
                state.acquiringWorker = false;
                console.warn(`[${APP.shortName}] Web Lock indisponível; a usar controlo local.`, error);
                startFallbackLease();
            });
            return;
        }

        state.acquiringWorker = false;
        startFallbackLease();
    }

    function claimWorker() {
        if (!isEnabled() || state.destroyed) return;
        state.ownsWorker = true;
        state.duplicateWorker = false;
        publishHeartbeat();
        window.clearInterval(state.heartbeatTimer);
        state.heartbeatTimer = window.setInterval(publishHeartbeat, APP.workerHeartbeatMs);
        updateUi();
    }

    function startFallbackLease() {
        const current = readWorker();
        if (isFreshWorker(current) && current.tabId !== tabId) {
            state.duplicateWorker = true;
            updateUi();
            return;
        }

        claimWorker();
        window.clearInterval(state.fallbackLeaseTimer);
        state.fallbackLeaseTimer = window.setInterval(() => {
            const worker = readWorker();
            if (isFreshWorker(worker) && worker.tabId !== tabId) {
                stopWorker(false);
                state.duplicateWorker = true;
                updateUi();
            }
        }, APP.workerHeartbeatMs + 400);
    }

    function publishHeartbeat() {
        if (!state.ownsWorker || !isEnabled()) return;
        const heartbeat = {
            tabId,
            world,
            version: APP.version,
            state: 'ready',
            villageId: getVillageId(),
            url: window.location.href,
            updatedAt: Date.now(),
        };
        localStorage.setItem(keys.worker, JSON.stringify(heartbeat));
        updateUi();
    }

    function stopWorker(releaseLock = true) {
        window.clearInterval(state.heartbeatTimer);
        window.clearInterval(state.fallbackLeaseTimer);
        state.heartbeatTimer = 0;
        state.fallbackLeaseTimer = 0;

        const current = readWorker();
        if (current?.tabId === tabId) localStorage.removeItem(keys.worker);

        state.ownsWorker = false;
        state.acquiringWorker = false;
        if (!isEnabled()) state.duplicateWorker = false;

        if (releaseLock && state.releaseLock) {
            const release = state.releaseLock;
            state.releaseLock = null;
            release();
        }
        updateUi();
    }

    function startMonitor() {
        window.clearInterval(state.monitorTimer);
        state.monitorTimer = window.setInterval(() => {
            if (state.workerWindow?.closed) state.workerWindow = null;
            updateUi();
        }, APP.monitorMs);
    }

    function updateUi() {
        const enabled = isEnabled();
        const worker = readWorker();
        const workerFresh = isFreshWorker(worker);
        let visualState = 'off';
        let label = `Desligado em ${world}`;
        let panelState = 'off';

        if (enabled && (state.ownsWorker || workerFresh)) {
            visualState = 'on';
            panelState = state.ownsWorker ? 'active' : 'duplicate';
            label = state.ownsWorker
                ? `Ligado — este separador controla ${world}`
                : `Ligado — worker ativo em ${world}`;
        } else if (enabled && state.popupBlocked) {
            visualState = 'error';
            panelState = 'waiting';
            label = `Ligado, mas o separador foi bloqueado em ${world}`;
        } else if (enabled) {
            visualState = 'waiting';
            panelState = state.duplicateWorker ? 'duplicate' : 'waiting';
            label = state.duplicateWorker
                ? `Ligado — existe outro worker em ${world}`
                : `Ligado — à espera do Assistente de Saque em ${world}`;
        }

        if (state.button) {
            state.button.dataset.state = visualState;
            state.button.classList.toggle('af-ligado', enabled);
            state.button.dataset.tpTitle = `${APP.name}: ${label}. Clique para ${enabled ? 'desligar' : 'ligar'}.`;
            state.button.setAttribute('aria-label', state.button.dataset.tpTitle);
            state.button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        }

        if (state.panel) {
            state.panel.dataset.state = panelState;
            const status = state.panel.querySelector('[data-role="state"]');
            if (status) status.textContent = label;
        }
    }

    function readWorker() {
        try {
            const value = JSON.parse(localStorage.getItem(keys.worker) || 'null');
            return value && value.world === world ? value : null;
        } catch (_) {
            return null;
        }
    }

    function isFreshWorker(worker) {
        return Boolean(
            worker &&
            Number.isFinite(Number(worker.updatedAt)) &&
            Date.now() - Number(worker.updatedAt) < APP.workerFreshMs
        );
    }

    function isEnabled() {
        return localStorage.getItem(keys.enabled) === '1';
    }

    function isFarmPage() {
        const gameScreen = String(window.game_data?.screen || '').toLowerCase();
        const urlScreen = String(new URL(window.location.href).searchParams.get('screen') || '').toLowerCase();
        return gameScreen === 'am_farm' || urlScreen === 'am_farm';
    }

    function getWorld() {
        const gameWorld = String(window.game_data?.world || '').trim();
        const hostWorld = String(window.location.hostname.split('.')[0] || '').trim();
        return sanitizeKey(gameWorld || hostWorld || window.location.hostname || 'unknown-world');
    }

    function getVillageId() {
        const gameVillage = Number(window.game_data?.village?.id || 0);
        if (gameVillage > 0) return String(gameVillage);
        return new URL(window.location.href).searchParams.get('village') || '';
    }

    function sanitizeKey(value) {
        return String(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 80) || 'unknown-world';
    }

    function defaultModel(enabled) {
        return {
            enabled,
            wall: { enabled: false, max: 20 },
            distance: { enabled: false, max: 50 },
            resources: { enabled: false, min: 0, max: 0 },
            loot: { full: true, partial: true },
            reports: {
                blue: true,
                green: true,
                yellow: false,
                red: false,
                redBlue: false,
                redYellow: false,
            },
        };
    }

    function loadSettings() {
        try {
            return normalizeSettings(JSON.parse(localStorage.getItem(keys.settings) || 'null'));
        } catch (error) {
            console.warn(`[${APP.shortName}] Definições inválidas; foram usadas as predefinições.`, error);
            return normalizeSettings(null);
        }
    }

    function normalizeSettings(value) {
        const source = value && typeof value === 'object' ? value : {};
        const models = {};

        ['a', 'b', 'c'].forEach(modelKey => {
            const fallback = DEFAULT_SETTINGS.models[modelKey];
            const model = source.models?.[modelKey] || {};
            models[modelKey] = {
                enabled: booleanValue(model.enabled, fallback.enabled),
                wall: {
                    enabled: booleanValue(model.wall?.enabled, fallback.wall.enabled),
                    max: integerValue(model.wall?.max, fallback.wall.max, 0, 20),
                },
                distance: {
                    enabled: booleanValue(model.distance?.enabled, fallback.distance.enabled),
                    max: integerValue(model.distance?.max, fallback.distance.max, 0, 999),
                },
                resources: {
                    enabled: booleanValue(model.resources?.enabled, fallback.resources.enabled),
                    min: integerValue(model.resources?.min, fallback.resources.min, 0, 1000000000),
                    max: integerValue(model.resources?.max, fallback.resources.max, 0, 1000000000),
                },
                loot: {
                    full: booleanValue(model.loot?.full, fallback.loot.full),
                    partial: booleanValue(model.loot?.partial, fallback.loot.partial),
                },
                reports: {
                    blue: booleanValue(model.reports?.blue, fallback.reports.blue),
                    green: booleanValue(model.reports?.green, fallback.reports.green),
                    yellow: booleanValue(model.reports?.yellow, fallback.reports.yellow),
                    red: booleanValue(model.reports?.red, fallback.reports.red),
                    redBlue: booleanValue(model.reports?.redBlue, fallback.reports.redBlue),
                    redYellow: booleanValue(model.reports?.redYellow, fallback.reports.redYellow),
                },
            };
        });

        return { schema: 1, models };
    }

    function booleanValue(value, fallback) {
        return typeof value === 'boolean' ? value : fallback;
    }

    function integerValue(value, fallback, min, max) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, Math.round(number)));
    }

    function getByPath(object, path) {
        return String(path).split('.').reduce((value, key) => value?.[key], object);
    }

    function setByPath(object, path, value) {
        const parts = String(path).split('.');
        const last = parts.pop();
        const target = parts.reduce((parent, key) => {
            if (!parent[key] || typeof parent[key] !== 'object') parent[key] = {};
            return parent[key];
        }, object);
        target[last] = value;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function makeId() {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }

    function notify(type, message) {
        const ui = window.UI;
        if (type === 'error' && typeof ui?.ErrorMessage === 'function') {
            ui.ErrorMessage(message, 5000);
            return;
        }
        if (type === 'success' && typeof ui?.SuccessMessage === 'function') {
            ui.SuccessMessage(message, 3500);
            return;
        }
        console[type === 'error' ? 'error' : 'info'](`[${APP.shortName}] ${message}`);
    }

    function destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        window.clearInterval(state.monitorTimer);
        window.clearTimeout(state.savedTimer);
        stopWorker();
    }

    function ready(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
        } else {
            callback();
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
})();
