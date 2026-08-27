// ==UserScript==
// @name         TW PT - AutoFarm - ThePlaguePT
// @namespace    theplaguept.tw.autofarm
// @version      1.2.0
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
        version: '1.2.0',
        id: 'twPtAutoFarm',
        buttonId: 'auto-farm-a-toggle',
        toolbarId: 'tp-theplaguept-script-bar',
        toolbarStyleId: 'tp-theplaguept-script-bar-style',
        styleId: 'twPtAutoFarm-style',
        statusId: 'twPtAutoFarm-worker-status',
        settingsId: 'twPtAutoFarm-settings',
        settingsToggleId: 'twPtAutoFarm-settings-toggle',
        workerHeartbeatMs: 3000,
        workerFreshMs: 90000,
        monitorMs: 2500,
        defaultAttackMs: 650,
        minAttackMs: 200,
        idlePollMs: 2500,
        requestTimeoutMs: 25000,
        returnSafetyMs: 15000,
        spyHistoryMs: 365 * 24 * 60 * 60 * 1000,
    });
    const UNIT_MINUTES_PER_FIELD = Object.freeze({
        spear: 18,
        sword: 22,
        axe: 18,
        archer: 18,
        spy: 9,
        light: 10,
        marcher: 10,
        heavy: 11,
        ram: 30,
        catapult: 30,
        knight: 10,
        snob: 35,
    });

    const world = getWorld();
    const tabId = makeId();
    const keys = Object.freeze({
        enabled: `twPtAutoFarm.v1.${world}.enabled`,
        worker: `twPtAutoFarm.v1.${world}.worker`,
        settings: `twPtAutoFarm.v1.${world}.settings`,
        run: `twPtAutoFarm.v1.${world}.run`,
        spyHistory: `twPtAutoFarm.v1.${world}.spyHistory`,
        activeAttacks: `twPtAutoFarm.v1.${world}.activeAttacks`,
        unitSpeed: `twPtAutoFarm.v1.${world}.unitSpeed`,
    });
    const DEFAULT_SETTINGS = Object.freeze({
        schema: 8,
        general: {
            attackIntervalMs: 650,
            roundPauseSeconds: 60,
        },
        models: {
            a: defaultModel(true),
            b: defaultModel(true),
            c: defaultModel(false),
        },
        spy: {
            enabled: false,
            scoutsPerVillage: 1,
            radius: 50,
            maxAttacks: 25,
            intervalMs: 650,
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
        farmTimer: 0,
        farmRunning: false,
        farmGeneration: 0,
        roundTimer: 0,
        idleScans: 0,
        farmSent: 0,
        pendingTargetDueAt: 0,
        spyRunning: false,
        spyAbortController: null,
        unitSpeed: null,
        unitSpeedPromise: null,
        processedRows: new WeakSet(),
        processedTargets: new Set(),
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
            farmSent: state.farmSent,
            run: readRunState(),
            activeAttacks: readActiveAttacks(),
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
            loadWorldUnitSpeed();
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
                if (state.ownsWorker) resumeRoundWorkflow();
            }
            if (event.key === keys.run) {
                renderModelCounts();
                if (state.ownsWorker) resumeRoundWorkflow();
            }
            if (event.key === keys.activeAttacks) {
                renderModelCounts();
                if (state.ownsWorker) resumeRoundWorkflow();
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
            #${APP.statusId}{margin:5px 0;padding:5px 9px;border:1px solid #c1a264;background:#f4e4b8;color:#3b260f;font:11px Verdana,Arial,sans-serif;box-sizing:border-box}
            #${APP.statusId} strong{margin-right:9px;color:#5d2d12}
            #${APP.statusId} [data-role="state"]{font-weight:bold}
            #${APP.statusId}[data-state="active"] [data-role="state"]{color:#287119}
            #${APP.statusId}[data-state="duplicate"] [data-role="state"],#${APP.statusId}[data-state="waiting"] [data-role="state"]{color:#9a5b0b}
            #${APP.statusId}[data-state="off"] [data-role="state"]{color:#8a1c17}
            #${APP.settingsId}{margin:6px 0 9px;border:1px solid #c8a86a;background:#f6e8bd;color:#3c2a14;font:11px Verdana,Arial,sans-serif;box-sizing:border-box}
            #${APP.settingsId} *{box-sizing:border-box}
            #${APP.settingsId} .af-settings-title{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px;border-bottom:1px solid #d3b97d;background:linear-gradient(to bottom,#f9edca,#f0dca8);font:17px Georgia,'Times New Roman',serif;color:#3d2915}
            #${APP.settingsId} .af-settings-title small{font:10px Verdana,Arial,sans-serif;color:#80643b}
            #${APP.settingsId} .af-settings-actions{display:flex;align-items:center;gap:8px}
            #${APP.settingsId} .af-settings-toggle{min-width:74px;height:27px;padding:3px 10px;border:1px solid #4f120f;border-radius:3px;background:linear-gradient(#b33a34,#8f2420 55%,#681611);box-shadow:inset 0 1px #ffffff59,0 1px 3px #0005;color:#fff;font:bold 11px Verdana,Arial,sans-serif;text-shadow:1px 1px #000;cursor:pointer}
            #${APP.settingsId} .af-settings-toggle.af-ligado{background:linear-gradient(#5f9f3d,#3f7c27 55%,#28551a)}
            #${APP.settingsId} .af-settings-toggle:hover,#${APP.settingsId} .af-settings-toggle:focus-visible{filter:brightness(1.15)}
            #${APP.settingsId} .af-models-wrap{padding:8px}
            #${APP.settingsId} .af-section-title{display:flex;align-items:center;gap:8px;margin:0 0 6px;color:#75501f;font-weight:bold;letter-spacing:1.2px}
            #${APP.settingsId} .af-section-title::after{content:'';height:1px;flex:1;background:#b99658}
            #${APP.settingsId} .af-model-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
            #${APP.settingsId} .af-model-card{min-width:0;border:1px solid #c4a15d;border-radius:4px;background:#faefd0;box-shadow:0 1px 2px #70502024;overflow:hidden;transition:opacity .15s ease}
            #${APP.settingsId} .af-model-card.af-model-off{opacity:.56}
            #${APP.settingsId} .af-model-head{display:flex;align-items:center;gap:7px;min-height:32px;padding:4px 8px;border-bottom:1px solid #d3b778;background:#f8e8bc}
            #${APP.settingsId} .af-model-badge{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:1px solid #594325;border-radius:4px;background:linear-gradient(#7f6846,#3f3020);box-shadow:inset 0 1px #ffffff73,0 1px 2px #0005;color:#f8e8bd;font:bold 15px Georgia,serif;text-shadow:1px 1px #000}
            #${APP.settingsId} .af-model-name{font-weight:bold;font-size:12px;flex:1}
            #${APP.settingsId} .af-model-counters{display:flex;align-items:center;gap:3px}
            #${APP.settingsId} .af-model-count{padding:2px 5px;border:1px solid #c5a66a;border-radius:8px;background:#f3dfae;color:#77552a;font:bold 9px Verdana,Arial,sans-serif;white-space:nowrap}
            #${APP.settingsId} .af-model-round-count{background:#f9edca;color:#80643b;font-weight:normal}
            #${APP.settingsId} .af-switch{display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none}
            #${APP.settingsId} .af-switch input{position:absolute;opacity:0;pointer-events:none}
            #${APP.settingsId} .af-switch-track{position:relative;width:32px;height:18px;border:1px solid #a37b35;border-radius:10px;background:#ecd8a5;box-shadow:inset 0 1px 2px #0003}
            #${APP.settingsId} .af-switch-track::after{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#9a855b;box-shadow:0 1px 2px #0005;transition:left .14s ease,background .14s ease}
            #${APP.settingsId} .af-switch input:checked+.af-switch-track{background:#b48335}
            #${APP.settingsId} .af-switch input:checked+.af-switch-track::after{left:16px;background:#f5dfaa}
            #${APP.settingsId} .af-switch input:focus-visible+.af-switch-track{outline:2px solid #3777c7;outline-offset:1px}
            #${APP.settingsId} .af-model-body{padding:5px 8px 7px}
            #${APP.settingsId} .af-filter-row{display:grid;grid-template-columns:minmax(112px,1fr) 18px 52px;align-items:center;gap:5px;min-height:30px;border-bottom:1px dashed #dcc38b}
            #${APP.settingsId} .af-filter-label,#${APP.settingsId} .af-subtitle{color:#806037;font-weight:bold;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
            #${APP.settingsId} .af-filter-label{display:flex;align-items:center;gap:5px;white-space:nowrap}
            #${APP.settingsId} .af-filter-label img{width:16px;height:16px;object-fit:contain}
            #${APP.settingsId} input[type="checkbox"]{width:15px;height:15px;margin:0;accent-color:#76501c;cursor:pointer}
            #${APP.settingsId} input[type="number"]{width:100%;height:24px;padding:2px 5px;border:1px solid #d2b275;border-radius:3px;background:#fffaf0;color:#3b2814;font:11px Verdana,Arial,sans-serif}
            #${APP.settingsId} input:disabled{cursor:not-allowed;opacity:.62;background:#f0e3bf}
            #${APP.settingsId} .af-subtitle{margin:5px 0 4px}
            #${APP.settingsId} .af-loot-types{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding-bottom:5px;border-bottom:1px dashed #dcc38b}
            #${APP.settingsId} .af-check-option{display:flex;align-items:center;gap:4px;min-height:24px;padding:3px 5px;border:1px solid #d4b777;border-radius:3px;background:#fff7df;font-weight:bold;font-size:10px;text-transform:uppercase;color:#77562d;cursor:pointer}
            #${APP.settingsId} .af-reports{display:grid;grid-template-columns:1fr 1fr;gap:4px}
            #${APP.settingsId} .af-report-option{position:relative;display:flex;align-items:center;gap:5px;min-height:24px;padding:3px 6px;border:1px solid #d8c28d;border-radius:3px;background:#eadcaf;color:#7b6743;cursor:pointer;user-select:none}
            #${APP.settingsId} .af-report-option.af-selected{border-color:#9c651b;background:#fff8e5;color:#3f2d18;font-weight:bold}
            #${APP.settingsId} .af-report-option input{position:absolute;opacity:0;pointer-events:none}
            #${APP.settingsId} .af-report-option:focus-within{outline:2px solid #3777c7;outline-offset:1px}
            #${APP.settingsId} .af-report-help{display:block;margin-top:4px;color:#87683d;font-size:8px;line-height:11px}
            #${APP.settingsId} .af-report-dot{width:11px;height:11px;flex:0 0 11px;border-radius:50%;box-shadow:inset 0 1px #fff8,0 1px 2px #0004}
            #${APP.settingsId} .af-blue{background:#2387e8}#${APP.settingsId} .af-green{background:#58bf38}#${APP.settingsId} .af-yellow{background:#ffd21a}#${APP.settingsId} .af-red{background:#df3c2c}
            #${APP.settingsId} .af-red-blue{background:linear-gradient(90deg,#df3c2c 0 50%,#2387e8 50%)}
            #${APP.settingsId} .af-red-yellow{background:linear-gradient(90deg,#df3c2c 0 50%,#ffd21a 50%)}
            #${APP.settingsId} .af-model-off .af-model-body{pointer-events:none}
            #${APP.settingsId} .af-general-wrap{margin-top:8px;padding-top:7px;border-top:1px solid #c6a767}
            #${APP.settingsId} .af-general-grid{display:grid;grid-template-columns:repeat(2,minmax(240px,360px));justify-content:start;gap:8px}
            #${APP.settingsId} .af-general-field{min-height:34px;padding:4px 8px;border:1px solid #d1b475;border-radius:3px;background:#fff4d6;display:grid;grid-template-columns:minmax(110px,1fr) 112px;align-items:center;gap:8px}
            #${APP.settingsId} .af-general-field>span{color:#75532b;font-weight:bold;font-size:10px;text-transform:uppercase}
            #${APP.settingsId} .af-general-input{display:flex;align-items:center;gap:4px}
            #${APP.settingsId} .af-general-input input{width:64px}
            #${APP.settingsId} .af-general-input small{color:#8a6c3e;font-size:9px;white-space:nowrap}
            #${APP.settingsId} .af-spy-wrap{margin-top:8px;padding-top:7px;border-top:1px solid #c6a767}
            #${APP.settingsId} .af-spy-card{border:1px solid #c4a15d;border-radius:4px;background:#faefd0;box-shadow:0 1px 2px #70502024;overflow:hidden;transition:opacity .15s ease}
            #${APP.settingsId} .af-spy-card.af-spy-off{opacity:.58}
            #${APP.settingsId} .af-spy-head{display:flex;align-items:center;gap:7px;min-height:32px;padding:4px 8px;border-bottom:1px solid #d3b778;background:#f8e8bc}
            #${APP.settingsId} .af-spy-badge{display:inline-flex;align-items:center;justify-content:center;width:24px;height:22px;border:1px solid #594325;border-radius:4px;background:linear-gradient(#55758a,#263d4b);box-shadow:inset 0 1px #ffffff73,0 1px 2px #0005;color:#fff4d2;font-size:14px}
            #${APP.settingsId} .af-spy-badge img{display:block;width:18px;height:18px;object-fit:contain}
            #${APP.settingsId} .af-spy-name{font-weight:bold;font-size:12px;flex:1}
            #${APP.settingsId} .af-spy-status{margin-right:8px;color:#80643b;font-size:9px;white-space:nowrap}
            #${APP.settingsId} .af-spy-body{padding:7px 8px}
            #${APP.settingsId} .af-spy-grid{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:6px}
            #${APP.settingsId} .af-spy-field{min-height:42px;padding:4px 6px;border:1px solid #d1b475;border-radius:3px;background:#fff4d6;display:grid;grid-template-columns:minmax(80px,1fr) 64px;align-items:center;gap:6px}
            #${APP.settingsId} .af-spy-field>span{color:#75532b;font-weight:bold;font-size:9px;text-transform:uppercase;line-height:13px}
            #${APP.settingsId} .af-spy-field input{width:64px}
            #${APP.settingsId} .af-spy-help{display:block;margin-top:6px;color:#87683d;font-size:9px;line-height:13px}
            #${APP.settingsId} .af-spy-off .af-spy-body{pointer-events:none}
            @media(max-width:1100px){#${APP.settingsId} .af-spy-grid{grid-template-columns:repeat(2,minmax(150px,1fr))}}
            @media(max-width:800px){#${APP.settingsId} .af-general-grid{grid-template-columns:1fr}}
            @media(max-width:950px){#${APP.settingsId} .af-model-grid{grid-template-columns:1fr}#${APP.settingsId} .af-settings-title{font-size:17px}}
            @media(max-width:620px){#${APP.settingsId} .af-spy-grid{grid-template-columns:1fr}}
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
                    <span class="af-settings-actions">
                        <small data-role="saved">Guardado automaticamente</small>
                        <button id="${APP.settingsToggleId}" class="af-settings-toggle" type="button">Ligar</button>
                    </span>
                </header>
                <div class="af-models-wrap">
                    <div class="af-section-title">MODELOS</div>
                    <div class="af-model-grid">
                        ${modelCard('a', 'A')}
                        ${modelCard('b', 'B')}
                        ${modelCard('c', 'C')}
                    </div>
                    <div class="af-general-wrap">
                        <div class="af-section-title">TEMPOS E RONDAS</div>
                        <div class="af-general-grid">
                            <label class="af-general-field">
                                <span>Entre ataques</span>
                                <span class="af-general-input">
                                    <input type="number" min="200" max="60000" step="10" data-setting="general.attackIntervalMs" aria-label="Intervalo entre ataques em milissegundos">
                                    <small>ms ±10%</small>
                                </span>
                            </label>
                            <label class="af-general-field">
                                <span>Entre rondas</span>
                                <span class="af-general-input">
                                    <input type="number" min="1" max="86400" step="1" data-setting="general.roundPauseSeconds" aria-label="Pausa entre rondas em segundos">
                                    <small>seg. ±10%</small>
                                </span>
                            </label>
                        </div>
                    </div>
                    <div class="af-spy-wrap">
                        <div class="af-section-title">ESPIAR ALDEIAS BB</div>
                        <article class="af-spy-card">
                            <header class="af-spy-head">
                                <span class="af-spy-badge" aria-hidden="true"><img src="/graphic/unit/unit_spy.png" alt=""></span>
                                <span class="af-spy-name">Modelo Espião BB</span>
                                <span class="af-spy-status" data-role="spy-status">Inativo</span>
                                <span class="af-model-counters">
                                    <span class="af-model-count" data-spy-active-count>Curso 0/25</span>
                                    <span class="af-model-count af-model-round-count" data-spy-round-count>Ronda 0</span>
                                </span>
                                <label class="af-switch">
                                    <input class="af-spy-enabled" type="checkbox" data-setting="spy.enabled">
                                    <span class="af-switch-track" aria-hidden="true"></span>
                                    <span>Ativo</span>
                                </label>
                            </header>
                            <div class="af-spy-body">
                                <div class="af-spy-grid">
                                    <label class="af-spy-field">
                                        <span>Batedores/alvo</span>
                                        <input type="number" min="1" max="100" step="1" data-setting="spy.scoutsPerVillage">
                                    </label>
                                    <label class="af-spy-field">
                                        <span>Raio máximo</span>
                                        <input type="number" min="1" max="200" step="1" data-setting="spy.radius">
                                    </label>
                                    <label class="af-spy-field">
                                        <span>Máx. de ataques</span>
                                        <input type="number" min="1" max="500" step="1" data-setting="spy.maxAttacks" title="Máximo de espionagens simultaneamente em curso">
                                    </label>
                                    <label class="af-spy-field">
                                        <span>Entre espionagens (ms) ±10%</span>
                                        <input type="number" min="200" max="60000" step="10" data-setting="spy.intervalMs" title="Milissegundos, com variação automática de ±10%">
                                    </label>
                                </div>
                                <small class="af-spy-help">Usa ataques diretos com batedores. O máximo limita as espionagens simultaneamente em curso; cada vaga regressa quando o comando volta. Lê o mapa, aceita apenas aldeias com proprietário 0 (bárbaras), ordena pelas mais próximas e ignora alvos já espiados por este módulo.</small>
                            </div>
                        </article>
                    </div>
                </div>
            `;

            panel.addEventListener('change', event => {
                if (!(event.target instanceof HTMLInputElement) || !event.target.dataset.setting) return;
                saveSettingsFromPanel();
            });
            panel.querySelector(`#${APP.settingsToggleId}`)?.addEventListener('click', event => {
                event.preventDefault();
                if (isEnabled()) disable();
                else enable(false);
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
                    <span class="af-model-counters">
                        <span class="af-model-count" data-model-active-count="${modelKey}">Curso 0/∞</span>
                        <span class="af-model-count af-model-round-count" data-model-round-count="${modelKey}">Ronda 0</span>
                    </span>
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
                    <div class="af-filter-row" data-filter="maxAttacks">
                        <span class="af-filter-label" title="Limita os comandos simultaneamente em curso"><span aria-hidden="true">⚔</span>Máx. de ataques</span>
                        <input type="checkbox" data-setting="${base}.maxAttacks.enabled" aria-label="Limitar ataques simultaneamente em curso do Modelo ${letter}">
                        <input type="number" min="1" max="10000" step="1" data-setting="${base}.maxAttacks.max" aria-label="Máximo de ataques simultaneamente em curso do Modelo ${letter}">
                    </div>
                    <div class="af-filter-row" data-filter="sameVillage">
                        <span class="af-filter-label"><span aria-hidden="true">↻</span>Ataques/alvo</span>
                        <input type="checkbox" data-setting="${base}.sameVillage.enabled" aria-label="Permitir vários ataques do Modelo ${letter} à mesma aldeia">
                        <input type="number" min="2" max="50" step="1" data-setting="${base}.sameVillage.max" aria-label="Máximo de ataques do Modelo ${letter} à mesma aldeia por ronda">
                    </div>
                    <div class="af-filter-row" data-filter="sameVillage">
                        <span class="af-filter-label" title="A separação real varia automaticamente dez por cento"><span aria-hidden="true">⏱</span>Dif. chegada (s) ±10%</span>
                        <span aria-hidden="true"></span>
                        <input type="number" min="1" max="86400" step="1" data-setting="${base}.sameVillage.separationSeconds" aria-label="Diferença de chegada em segundos dos ataques do Modelo ${letter}">
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
                    <small class="af-report-help">Cada cor é apenas um filtro: marcada permite o envio; desmarcada impede-o. Nenhuma cor tem prioridade.</small>
                </div>
            </article>
        `;
    }

    function saveSettingsFromPanel() {
        if (!state.settingsPanel) return;
        const spyWasEnabled = Boolean(state.settings?.spy?.enabled);
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
        if (state.ownsWorker && spyWasEnabled && !state.settings.spy.enabled) {
            const run = ensureRunState();
            if (run.round.phase === 'spying') {
                cancelSpyWork();
                if (run.round.farmCompleted) {
                    beginRoundPause(run);
                } else {
                    run.round.phase = 'farming';
                    writeRunState(run);
                    scheduleFarmStep(100);
                }
                return;
            }
        }
        if (state.ownsWorker) resumeRoundWorkflow();
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

        const spyCard = state.settingsPanel.querySelector('.af-spy-card');
        if (spyCard) {
            const active = Boolean(state.settings.spy.enabled);
            spyCard.classList.toggle('af-spy-off', !active);
            spyCard.querySelectorAll('input').forEach(input => {
                input.disabled = !active && !input.classList.contains('af-spy-enabled');
            });
            if (!state.spyRunning) setSpyStatus(active ? 'Pronto' : 'Inativo');
        }
        renderModelCounts();
    }

    function setSpyStatus(message) {
        const label = state.settingsPanel?.querySelector('[data-role="spy-status"]');
        if (label) label.textContent = String(message || '');
    }

    function showSavedState() {
        const label = state.settingsPanel?.querySelector('[data-role="saved"]');
        if (!label) return;
        window.clearTimeout(state.savedTimer);
        label.textContent = '✓ Guardado agora';
        state.savedTimer = window.setTimeout(() => {
            label.textContent = 'Guardado automaticamente';
        }, 1600);
    }

    function enable(openTab) {
        const wasEnabled = isEnabled();
        if (!wasEnabled) resetRunState();
        else ensureRunState();
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
        ensureRunState();
        state.ownsWorker = true;
        state.duplicateWorker = false;
        publishHeartbeat();
        window.clearInterval(state.heartbeatTimer);
        state.heartbeatTimer = window.setInterval(publishHeartbeat, APP.workerHeartbeatMs);
        updateUi();
        startFarmLoop();
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
        stopFarmLoop();
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
            if (isFarmPage() && isEnabled() && !state.ownsWorker && !state.acquiringWorker) {
                const worker = readWorker();
                if (!isFreshWorker(worker)) startWorker();
            }
            updateUi();
        }, APP.monitorMs);
    }

    function updateUi() {
        const enabled = isEnabled();
        const visualState = enabled ? 'on' : 'off';
        const label = enabled ? 'Ligado' : 'Desligado';
        const panelState = enabled ? 'active' : 'off';

        if (state.button) {
            state.button.dataset.state = visualState;
            state.button.classList.toggle('af-ligado', enabled);
            state.button.dataset.tpTitle = `${APP.name}: ${label}. Clique para ${enabled ? 'desligar' : 'ligar'}.`;
            state.button.setAttribute('aria-label', state.button.dataset.tpTitle);
            state.button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        }

        const settingsToggle = document.getElementById(APP.settingsToggleId);
        if (settingsToggle) {
            settingsToggle.textContent = enabled ? 'Desligar' : 'Ligar';
            settingsToggle.classList.toggle('af-ligado', enabled);
            settingsToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            settingsToggle.setAttribute('aria-label', enabled ? 'Desligar AutoFarm' : 'Ligar AutoFarm');
        }

        if (state.panel) {
            state.panel.dataset.state = panelState;
            const status = state.panel.querySelector('[data-role="state"]');
            if (status) status.textContent = label;
        }
        const round = readRunState()?.round;
        if (enabled && round?.phase === 'waiting' && round.pauseUntil > Date.now()) {
            showRoundCountdown(Math.ceil((round.pauseUntil - Date.now()) / 1000));
        } else if (!enabled || round?.phase !== 'waiting') {
            hideRoundCountdown();
        }
        renderModelCounts();
    }

    function startFarmLoop() {
        if (!isFarmPage() || !isEnabled() || !state.ownsWorker || state.destroyed) return;
        resumeRoundWorkflow();
    }

    function stopFarmLoop() {
        state.farmGeneration += 1;
        state.spyAbortController?.abort();
        state.spyAbortController = null;
        window.clearTimeout(state.farmTimer);
        window.clearTimeout(state.roundTimer);
        state.farmTimer = 0;
        state.roundTimer = 0;
        state.farmRunning = false;
        state.spyRunning = false;
        state.idleScans = 0;
        setSpyStatus(state.settings?.spy?.enabled ? 'Pronto' : 'Inativo');
        hideRoundCountdown();
    }

    function scheduleFarmStep(delayMs) {
        window.clearTimeout(state.farmTimer);
        state.farmTimer = 0;
        if (!isFarmPage() || !isEnabled() || !state.ownsWorker || state.destroyed || state.farmRunning) return;
        state.farmTimer = window.setTimeout(runFarmStep, Math.max(50, Number(delayMs) || 50));
    }

    async function runFarmStep() {
        state.farmTimer = 0;
        if (!isEnabled() || !state.ownsWorker || state.destroyed || state.farmRunning) return;
        if (ensureRunState().round.phase !== 'farming') {
            resumeRoundWorkflow();
            return;
        }

        const generation = state.farmGeneration;
        state.farmRunning = true;
        let task = null;
        let finishRequested = false;
        let pendingDelay = 0;
        try {
            task = findNextFarmTask();
            if (task) {
                state.idleScans = 0;
                await sendFarmTask(task);
            } else if (state.pendingTargetDueAt > Date.now()) {
                state.idleScans = 0;
                pendingDelay = state.pendingTargetDueAt - Date.now();
            } else {
                state.idleScans += 1;
                finishRequested = state.idleScans >= 3;
            }
        } catch (error) {
            console.error(`[${APP.shortName}] Falha ao enviar um modelo.`, error);
        } finally {
            if (generation !== state.farmGeneration) return;
            state.farmRunning = false;
            if (isEnabled() && state.ownsWorker && !state.destroyed) {
                if (finishRequested) finishRound();
                else if (task) scheduleFarmStep(randomizedAttackDelay());
                else scheduleFarmStep(pendingDelay > 0 ? Math.min(APP.idlePollMs, pendingDelay) : APP.idlePollMs);
            }
        }
    }

    function resumeRoundWorkflow() {
        if (!isFarmPage() || !isEnabled() || !state.ownsWorker || state.destroyed) return;
        const run = ensureRunState();

        if (run.round.phase === 'start') {
            run.round.phase = 'start_reloading';
            writeRunState(run);
            refreshPageForRound();
            return;
        }

        if (run.round.phase === 'start_reloading') {
            beginRound(run);
            return;
        }

        if (run.round.phase === 'end_reloading') {
            beginRoundPause(run);
            return;
        }

        if (run.round.phase === 'spying') {
            startSpyPhase(run);
            return;
        }

        if (run.round.phase === 'waiting') {
            scheduleRoundWait(run);
            return;
        }

        hideRoundCountdown();
        scheduleFarmStep(150);
    }

    function beginRound(run) {
        clearRoundProgress(run);
        run.round.phase = 'farming';
        run.round.pauseUntil = 0;
        writeRunState(run);
        hideRoundCountdown();
        scheduleFarmStep(200);
    }

    function finishRound() {
        state.idleScans = 0;
        const run = ensureRunState();
        run.round.farmCompleted = true;
        if (state.settings?.spy?.enabled) startSpyPhase(run);
        else beginRoundPause(run);
    }

    function startSpyPhase(runValue) {
        const run = runValue || ensureRunState();
        if (!run.round.farmCompleted) {
            cancelSpyWork();
            run.round.phase = 'farming';
            writeRunState(run);
            scheduleFarmStep(100);
            return;
        }

        const config = state.settings?.spy || loadSettings().spy;
        if (!config.enabled) {
            cancelSpyWork();
            beginRoundPause(run);
            return;
        }
        if (state.spyRunning || !isEnabled() || !state.ownsWorker || state.destroyed) return;

        run.round.phase = 'spying';
        run.round.pauseUntil = 0;
        run.round.spy = normalizeRoundSpy(run.round.spy);
        writeRunState(run);

        const generation = state.farmGeneration;
        state.spyRunning = true;
        setSpyStatus('A preparar…');

        runSpyPhase(generation).then(result => {
            if (generation !== state.farmGeneration) return;
            state.spyRunning = false;
            setSpyStatus('Pronto');
            if (isEnabled() && state.ownsWorker && !state.destroyed) {
                beginRoundPause(ensureRunState());
            }
        }).catch(error => {
            if (generation !== state.farmGeneration) return;
            state.spyRunning = false;
            const message = getAutomationErrorMessage(error);
            setSpyStatus('Ignorado nesta ronda');
            console.error(`[${APP.shortName}] A espionagem BB foi ignorada nesta ronda.`, error);
            notify('error', `Espionagem BB ignorada: ${message.slice(0, 120)}`);
            if (isEnabled() && state.ownsWorker && !state.destroyed) {
                beginRoundPause(ensureRunState());
            }
        });
    }

    function cancelSpyWork() {
        if (state.spyRunning || state.spyAbortController) state.farmGeneration += 1;
        state.spyAbortController?.abort();
        state.spyAbortController = null;
        state.spyRunning = false;
        setSpyStatus(state.settings?.spy?.enabled ? 'Pronto' : 'Inativo');
    }

    async function runSpyPhase(generation) {
        const origin = getOriginCoordinates();
        const sourceId = getVillageId();
        if (!origin || !/^\d+$/.test(sourceId)) {
            throw new Error('Não foi possível identificar a aldeia de origem.');
        }

        const initialRun = ensureRunState();
        const config = state.settings.spy;
        const availableSlots = Math.max(0, config.maxAttacks - getActiveAttackCount('spy'));
        if (availableSlots === 0) {
            return { sent: initialRun.round.spy.sent, reason: 'máximo de ataques em curso atingido' };
        }
        const unitSpeed = await loadWorldUnitSpeed();

        setSpyStatus('A ler o mapa…');
        const villages = await fetchBarbarianVillages();
        if (generation !== state.farmGeneration || !isEnabled() || !state.ownsWorker) {
            return { sent: initialRun.round.spy.sent, reason: 'interrompido' };
        }

        const history = readSpyHistory();
        const attempted = initialRun.round.spy.attempted;
        const candidates = villages.map(village => ({
            ...village,
            distance: Math.hypot(village.x - origin.x, village.y - origin.y),
        })).filter(village => (
            village.distance <= config.radius &&
            String(village.id) !== sourceId &&
            !history[String(village.id)] &&
            !attempted[String(village.id)]
        )).sort((first, second) => (
            first.distance - second.distance || first.id - second.id
        )).slice(0, availableSlots);

        if (candidates.length === 0) {
            setSpyStatus('Sem novas BB no raio');
            return { sent: initialRun.round.spy.sent, reason: 'sem candidatas' };
        }

        let sentNow = 0;
        for (let index = 0; index < candidates.length; index += 1) {
            const currentConfig = state.settings?.spy;
            if (
                generation !== state.farmGeneration ||
                !isEnabled() ||
                !state.ownsWorker ||
                !currentConfig?.enabled
            ) {
                break;
            }

            const run = ensureRunState();
            if (getActiveAttackCount('spy') >= currentConfig.maxAttacks) break;
            const target = candidates[index];
            setSpyStatus(`${index + 1}/${candidates.length} · ${target.x}|${target.y}`);

            try {
                await sendDirectSpyAttack(target, currentConfig.scoutsPerVillage, sourceId);
            } catch (error) {
                const message = getAutomationErrorMessage(error);
                run.round.spy.attempted[String(target.id)] = message.slice(0, 40) || 'erro';
                writeRunState(run);
                if (errorMeansNoScouts(message)) {
                    setSpyStatus('Sem batedores');
                    break;
                }
                if (errorMeansPlayerVillage(message)) continue;
                throw error;
            }

            run.round.spy.sent += 1;
            run.round.spy.attempted[String(target.id)] = 'enviado';
            registerActiveAttack({
                model: 'spy',
                sourceId,
                targetKey: `village:${target.id}`,
                targetCoord: `${target.x}|${target.y}`,
                distance: target.distance,
                minutesPerField: UNIT_MINUTES_PER_FIELD.spy,
                unitSpeed,
            });
            writeRunState(run);
            history[String(target.id)] = Date.now();
            writeSpyHistory(history);
            sentNow += 1;
            console.info(
                `[${APP.shortName}] Espionagem BB enviada para ${target.x}|${target.y} ` +
                `(${target.distance.toFixed(1)} campos), com ${currentConfig.scoutsPerVillage} batedor(es).`
            );

            if (index < candidates.length - 1) {
                await delay(randomizedSpyDelay(currentConfig.intervalMs));
            }
        }

        return {
            sent: ensureRunState().round.spy.sent,
            sentNow,
            reason: 'concluído',
        };
    }

    async function fetchBarbarianVillages() {
        const url = new URL('/map/village.txt', window.location.origin).href;
        const response = await requestGamePage(url, { method: 'GET' }, APP.requestTimeoutMs);
        const villages = [];
        response.text.split(/\r?\n/).forEach(line => {
            const fields = line.split(',');
            if (fields.length < 5 || Number(fields[4]) !== 0) return;
            const id = Number(fields[0]);
            const x = Number(fields[2]);
            const y = Number(fields[3]);
            if (Number.isInteger(id) && id > 0 && Number.isFinite(x) && Number.isFinite(y)) {
                villages.push({ id, x, y });
            }
        });
        return villages;
    }

    async function sendDirectSpyAttack(target, scouts, sourceId) {
        const initialUrl = buildDirectAttackUrl(target.id, sourceId);
        const initialPage = await requestGamePage(initialUrl, { method: 'GET' }, APP.requestTimeoutMs);
        const initialDocument = new DOMParser().parseFromString(initialPage.text, 'text/html');
        const commandForm = initialDocument.querySelector('#command-data-form');
        if (!commandForm) {
            throw new Error(extractGamePageError(initialDocument) || 'Formulário de ataque indisponível.');
        }

        const commandData = serializeGameForm(commandForm);
        commandData.set('spy', String(scouts));
        applyDirectAttackTarget(commandForm, commandData, target);
        addGameSubmitControl(commandForm, commandData, ['attack']);
        const confirmationPage = await submitGameForm(
            commandForm,
            initialPage.url,
            commandData,
            APP.requestTimeoutMs
        );
        const confirmationDocument = new DOMParser().parseFromString(confirmationPage.text, 'text/html');
        const confirmationForm = confirmationDocument.querySelector(
            '#command-confirm-form, form[action*="action=command"]'
        );
        if (!confirmationForm) {
            throw new Error(
                extractGamePageError(confirmationDocument) ||
                'O jogo não apresentou a confirmação da espionagem.'
            );
        }

        const confirmationData = serializeGameForm(confirmationForm);
        confirmationData.set('spy', String(scouts));
        applyDirectAttackTarget(confirmationForm, confirmationData, target);
        addGameSubmitControl(confirmationForm, confirmationData, ['submit', 'send', 'attack']);
        const finalPage = await submitGameForm(
            confirmationForm,
            confirmationPage.url,
            confirmationData,
            APP.requestTimeoutMs
        );
        const finalDocument = new DOMParser().parseFromString(finalPage.text, 'text/html');
        const finalError = extractGamePageError(finalDocument);
        if (finalError || finalDocument.querySelector('#command-confirm-form')) {
            throw new Error(finalError || 'A espionagem não foi confirmada pelo jogo.');
        }
    }

    function applyDirectAttackTarget(form, data, target) {
        const id = String(target.id);
        const coordinates = `${target.x}|${target.y}`;

        // O formulário do Ponto de Encontro nem sempre inclui o campo oculto
        // quando é carregado em segundo plano. O ID tem de seguir sempre no POST.
        data.set('target', id);
        if (form.querySelector('[name="target_id"]')) data.set('target_id', id);
        if (form.querySelector('[name="x"]')) data.set('x', String(target.x));
        if (form.querySelector('[name="y"]')) data.set('y', String(target.y));
        if (form.querySelector('[name="target_x"]')) data.set('target_x', String(target.x));
        if (form.querySelector('[name="target_y"]')) data.set('target_y', String(target.y));
        if (form.querySelector('[name="input"]')) data.set('input', coordinates);
    }

    function buildDirectAttackUrl(targetId, sourceId) {
        const url = window.game_data?.link_base_pure
            ? new URL(`${window.game_data.link_base_pure}place`, window.location.href)
            : new URL(window.location.href);
        url.searchParams.set('screen', 'place');
        url.searchParams.set('village', sourceId);
        url.searchParams.set('target', String(targetId));
        return url.href;
    }

    function serializeGameForm(form) {
        const data = new URLSearchParams();
        form.querySelectorAll('input,select,textarea').forEach(field => {
            if (!field.name || field.disabled) return;
            const type = String(field.type || '').toLowerCase();
            if (['submit', 'button', 'image', 'reset', 'file'].includes(type)) return;
            if ((type === 'checkbox' || type === 'radio') && !field.checked) return;
            if (field instanceof HTMLSelectElement && field.multiple) {
                Array.from(field.options).forEach(option => {
                    if (option.selected) data.append(field.name, option.value);
                });
            } else {
                data.append(field.name, field.value);
            }
        });
        return data;
    }

    function addGameSubmitControl(form, data, names) {
        for (const name of names) {
            const control = form.querySelector(`button[name="${name}"],input[name="${name}"]`);
            if (control) {
                data.set(name, control.value || '1');
                return;
            }
        }
    }

    async function submitGameForm(form, baseUrl, data, timeoutMs) {
        const url = new URL(form.getAttribute('action') || baseUrl, baseUrl);
        const method = String(form.method || 'POST').toUpperCase();
        if (method === 'GET') {
            data.forEach((value, key) => url.searchParams.append(key, value));
            return requestGamePage(url.href, { method: 'GET' }, timeoutMs);
        }
        return requestGamePage(url.href, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: data.toString(),
        }, timeoutMs);
    }

    async function requestGamePage(url, options, timeoutMs) {
        const controller = new AbortController();
        state.spyAbortController = controller;
        const timer = window.setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                credentials: 'same-origin',
                redirect: 'follow',
                ...options,
                signal: controller.signal,
            });
            const text = await response.text();
            if (!response.ok) throw new Error(`Pedido recusado pelo jogo (${response.status}).`);
            return { text, url: response.url || url };
        } catch (error) {
            if (error?.name === 'AbortError') throw new Error('O pedido ao jogo excedeu o tempo limite.');
            throw error;
        } finally {
            window.clearTimeout(timer);
            if (state.spyAbortController === controller) state.spyAbortController = null;
        }
    }

    function extractGamePageError(documentValue) {
        return String(documentValue.querySelector(
            '#error,.error_box,.error-message,.error-msg'
        )?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function readSpyHistory() {
        const now = Date.now();
        const clean = {};
        try {
            const stored = JSON.parse(localStorage.getItem(keys.spyHistory) || '{}');
            Object.entries(stored || {}).slice(0, 10000).forEach(([id, timestamp]) => {
                const moment = Number(timestamp);
                if (/^\d+$/.test(id) && moment > 0 && now - moment < APP.spyHistoryMs) {
                    clean[id] = moment;
                }
            });
        } catch (_) {
            // Um histórico inválido é simplesmente reconstruído.
        }
        writeSpyHistory(clean);
        return clean;
    }

    function writeSpyHistory(history) {
        localStorage.setItem(keys.spyHistory, JSON.stringify(history || {}));
    }

    function randomizedSpyDelay(baseMs) {
        const base = Math.max(APP.minAttackMs, Number(baseMs) || APP.defaultAttackMs);
        const variation = base * 0.10;
        return Math.round(base - variation + (Math.random() * variation * 2));
    }

    function getAutomationErrorMessage(error) {
        if (!error) return 'erro desconhecido';
        if (typeof error === 'string') return error;
        return String(error.message || error.error || error.responseText || error);
    }

    function errorMeansNoScouts(message) {
        return /(?:not enough units|insufficient troops|tropas insuficientes|unidades insuficientes|não há tropas|não existem tropas|batedores insuficientes|no hay suficientes unidades|nicht genügend einheiten|pas assez d.unités)/i.test(
            String(message || '')
        );
    }

    function errorMeansPlayerVillage(message) {
        return /(?:attack villages owned by players|atacar aldeias? (?:pertencentes a|de|que pertencem a) jogadores|atacar aldeas?.*jugadores|d.rfer.*spieler|villages?.*joueurs)/i.test(
            String(message || '')
        );
    }

    function beginRoundPause(run) {
        const settings = state.settings || loadSettings();
        run.round.phase = 'waiting';
        run.round.pauseUntil = Date.now() + randomizedRoundPauseMs(settings.general.roundPauseSeconds);
        writeRunState(run);
        scheduleRoundWait(run);
    }

    function scheduleRoundWait(runValue) {
        window.clearTimeout(state.roundTimer);
        const run = runValue || ensureRunState();
        const remaining = Math.max(0, run.round.pauseUntil - Date.now());
        if (remaining <= 0) {
            startNextRound(run);
            return;
        }

        showRoundCountdown(Math.ceil(remaining / 1000));
        state.roundTimer = window.setTimeout(() => {
            state.roundTimer = 0;
            if (isEnabled() && state.ownsWorker && !state.destroyed) {
                scheduleRoundWait(ensureRunState());
            }
        }, Math.min(1000, remaining));
    }

    function startNextRound(run) {
        run.round.number += 1;
        run.round.pauseUntil = 0;
        hideRoundCountdown();
        run.round.phase = 'start_reloading';
        writeRunState(run);
        refreshPageForRound();
    }

    function refreshPageForRound() {
        state.farmGeneration += 1;
        window.clearTimeout(state.farmTimer);
        window.clearTimeout(state.roundTimer);
        state.farmTimer = 0;
        state.roundTimer = 0;
        state.farmRunning = false;
        hideRoundCountdown();
        window.setTimeout(() => window.location.reload(), 60);
    }

    function clearRoundProgress(runValue) {
        const run = runValue || ensureRunState();
        run.counts = { a: 0, b: 0, c: 0 };
        run.round.targets = {};
        run.round.farmCompleted = false;
        run.round.spy = { sent: 0, attempted: {} };
        setSpyStatus(state.settings?.spy?.enabled ? 'Pronto' : 'Inativo');
        state.processedTargets.clear();
        state.processedRows = new WeakSet();
        state.idleScans = 0;
        state.pendingTargetDueAt = 0;
        getFarmRows().forEach(row => delete row.dataset.twPtAutofarmSent);
    }

    function allActiveModelsExhausted() {
        const settings = state.settings || loadSettings();
        const active = ['a', 'b', 'c'].filter(model => settings.models[model].enabled);
        return active.length > 0 && active.every(model => {
            const limit = settings.models[model].maxAttacks;
            return limit.enabled && getActiveAttackCount(model) >= limit.max;
        });
    }

    function showRoundCountdown(totalSeconds) {
        const display = state.button?.querySelector('[data-auto-farm-countdown]');
        if (!display) return;
        const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
        const minutes = Math.floor(seconds / 60);
        const remainder = String(seconds % 60).padStart(2, '0');
        display.textContent = `${minutes}:${remainder}`;
        display.hidden = false;
    }

    function hideRoundCountdown() {
        const display = state.button?.querySelector('[data-auto-farm-countdown]');
        if (!display) return;
        display.textContent = '';
        display.hidden = true;
    }

    function findNextFarmTask() {
        const rows = getFarmRows();
        const settings = state.settings || loadSettings();
        const run = ensureRunState();
        const activeCounts = getActiveAttackCounts();
        const now = Date.now();
        const eligibleTasks = [];
        state.pendingTargetDueAt = 0;

        rows.sort((first, second) => {
            const firstDistance = getTargetDistance(first);
            const secondDistance = getTargetDistance(second);
            if (firstDistance !== secondDistance) return firstDistance < secondDistance ? -1 : 1;
            return getDomOrder(first, second);
        });

        for (const row of rows) {
            const targetKey = getTargetKey(row);
            const progress = targetKey ? run.round.targets[targetKey] : null;

            if (progress) {
                const config = settings.models[progress.model];
                const maximum = getSameVillageLimit(config);
                if (progress.sent >= maximum) {
                    row.dataset.twPtAutofarmSent = '1';
                    state.processedTargets.add(targetKey);
                    continue;
                }

                const button = row.querySelector(`a.farm_icon_${progress.model}`);
                const reportColor = getReportColor(row);
                if (
                    !config?.enabled ||
                    !modelHasCapacity(progress.model, config, activeCounts) ||
                    !button ||
                    isFarmButtonDisabled(button) ||
                    !reportColor ||
                    !modelMatchesRow(row, config, reportColor)
                ) {
                    continue;
                }

                if (progress.nextAt > now) {
                    state.pendingTargetDueAt = state.pendingTargetDueAt > 0
                        ? Math.min(state.pendingTargetDueAt, progress.nextAt)
                        : progress.nextAt;
                    continue;
                }

                eligibleTasks.push({
                    row,
                    button,
                    model: progress.model,
                    reportColor,
                    targetKey,
                });
                continue;
            }

            if (state.processedRows.has(row) || row.dataset.twPtAutofarmSent === '1') continue;
            const selected = selectModelForRow(row, activeCounts);
            if (selected) {
                eligibleTasks.push({
                    row,
                    button: selected.button,
                    model: selected.model,
                    reportColor: selected.reportColor,
                    targetKey,
                });
            }
        }
        return eligibleTasks[0] || null;
    }

    function getFarmRows() {
        const selector = [
            '#plunder_list a.farm_icon_a',
            '#plunder_list a.farm_icon_b',
            '#plunder_list a.farm_icon_c',
            '#am_widget_Farm a.farm_icon_a',
            '#am_widget_Farm a.farm_icon_b',
            '#am_widget_Farm a.farm_icon_c',
        ].join(',');
        const rows = [];
        const seen = new Set();
        document.querySelectorAll(selector).forEach(button => {
            const row = button.closest('tr');
            if (row && !seen.has(row)) {
                seen.add(row);
                rows.push(row);
            }
        });
        return rows;
    }

    function selectModelForRow(row, activeCounts) {
        const settings = state.settings || loadSettings();
        const reportColor = getReportColor(row);
        if (!reportColor) return null;
        for (const model of ['a', 'b', 'c']) {
            const config = settings.models[model];
            const button = row.querySelector(`a.farm_icon_${model}`);
            if (
                config.enabled &&
                modelHasCapacity(model, config, activeCounts) &&
                button &&
                !isFarmButtonDisabled(button) &&
                modelMatchesRow(row, config, reportColor)
            ) {
                return { model, button, reportColor };
            }
        }
        return null;
    }

    function modelMatchesRow(row, config, detectedColor) {
        const reportColor = detectedColor || getReportColor(row);
        if (!reportColor || !config.reports[reportColor]) return false;

        if (config.wall.enabled) {
            const wallLevel = getWallLevel(row);
            if (!Number.isFinite(wallLevel) || wallLevel > config.wall.max) return false;
        }

        if (config.distance.enabled) {
            const distance = getTargetDistance(row);
            if (!Number.isFinite(distance) || distance > config.distance.max) return false;
        }

        const lootType = getLootType(row);
        if (lootType === 'full' && !config.loot.full) return false;
        if (lootType === 'partial' && !config.loot.partial) return false;
        if (!lootType && !(config.loot.full && config.loot.partial)) return false;
        return config.loot.full || config.loot.partial;
    }

    async function sendFarmTask(task) {
        if (!task.button?.isConnected || isFarmButtonDisabled(task.button)) return;
        let currentColor = getReportColor(task.row);
        let currentConfig = state.settings?.models?.[task.model];
        if (
            !currentColor ||
            currentColor !== task.reportColor ||
            !currentConfig?.reports?.[currentColor] ||
            !modelHasCapacity(task.model, currentConfig)
        ) {
            console.warn(
                `[${APP.shortName}] Envio ${task.model.toUpperCase()} cancelado: ` +
                `a cor atual (${currentColor || 'desconhecida'}) não está permitida ou o limite foi atingido.`
            );
            return;
        }

        const unitSpeed = await loadWorldUnitSpeed();
        const distance = getTargetDistance(task.row);
        const target = getCoordinates(task.row.textContent);
        const minutesPerField = getModelSlowestMinutesPerField(task.model);

        currentColor = getReportColor(task.row);
        currentConfig = state.settings?.models?.[task.model];
        if (
            !task.button?.isConnected ||
            isFarmButtonDisabled(task.button) ||
            currentColor !== task.reportColor ||
            !currentConfig?.reports?.[currentColor] ||
            !modelHasCapacity(task.model, currentConfig)
        ) return;

        task.button.click();
        state.farmSent += 1;
        const progress = recordFarmSend(task.model, {
            color: currentColor,
            targetKey: task.targetKey,
            targetCoord: target ? `${target.x}|${target.y}` : '',
            distance,
            minutesPerField,
            unitSpeed,
        });
        if (!task.targetKey || progress.complete) {
            state.processedRows.add(task.row);
            task.row.dataset.twPtAutofarmSent = '1';
            if (task.targetKey) state.processedTargets.add(task.targetKey);
        }
        console.info(
            `[${APP.shortName}] Modelo ${task.model.toUpperCase()} enviado` +
            `${task.targetKey ? ` para ${task.targetKey}` : ''} — cor ${currentColor}` +
            `${progress.maximum > 1 ? `, envio ${progress.sent}/${progress.maximum}` : ''}.`
        );
        await waitForFarmRequest(6000);
    }

    async function waitForFarmRequest(timeoutMs) {
        const startedAt = Date.now();
        await delay(80);
        while (
            window.jQuery &&
            Number(window.jQuery.active || 0) > 0 &&
            Date.now() - startedAt < timeoutMs
        ) {
            await delay(60);
        }
    }

    function randomizedAttackDelay() {
        const base = state.settings?.general?.attackIntervalMs || APP.defaultAttackMs;
        const variation = base * 0.10;
        return Math.round(base - variation + (Math.random() * variation * 2));
    }

    function randomizedRoundPauseMs(baseSeconds) {
        const base = Math.max(1, Number(baseSeconds) || DEFAULT_SETTINGS.general.roundPauseSeconds) * 1000;
        const variation = base * 0.10;
        return Math.round(base - variation + (Math.random() * variation * 2));
    }

    function randomizedArrivalSeparationMs(baseSeconds) {
        const base = Math.max(1, Number(baseSeconds) || 1) * 1000;
        const variation = base * 0.10;
        return Math.round(base - variation + (Math.random() * variation * 2));
    }

    function getReportColor(row) {
        const candidates = row.querySelectorAll([
            '.report_dot',
            '[class*="report_dot"]',
            '[data-report-color]',
            'img[src*="/dots/"]',
            'img[src*="dots/"]',
            'img[src*="dot_"]',
            'img[src*="dot-"]',
        ].join(','));

        for (const element of candidates) {
            const explicitValues = [
                element.getAttribute('data-report-color'),
                element.getAttribute('data-color'),
                element.getAttribute('src'),
                element.getAttribute('class'),
                element.getAttribute('title'),
                element.getAttribute('alt'),
                element.getAttribute('style'),
            ];
            for (const value of explicitValues) {
                const color = normalizeReportColor(value);
                if (color) return color;
            }
            const computed = window.getComputedStyle?.(element);
            const computedTokenColor = normalizeReportColor(computed?.backgroundImage);
            if (computedTokenColor) return computedTokenColor;
            const computedRgbColor = reportColorFromRgb(computed?.backgroundColor);
            if (computedRgbColor) return computedRgbColor;
        }
        return null;
    }

    function normalizeReportColor(value) {
        const text = normalizeText(value);
        const tokens = new Set(text.split(/[^a-z]+/).filter(Boolean));
        const red = tokens.has('red') || tokens.has('vermelho') || tokens.has('vermelha');
        const blue = tokens.has('blue') || tokens.has('azul');
        const yellow = tokens.has('yellow') || tokens.has('amarelo') || tokens.has('amarela');
        const green = tokens.has('green') || tokens.has('verde');
        if (red && blue) return 'redBlue';
        if (red && yellow) return 'redYellow';
        if (blue) return 'blue';
        if (green) return 'green';
        if (yellow) return 'yellow';
        if (red) return 'red';
        return null;
    }

    function reportColorFromRgb(value) {
        const match = String(value || '').match(/rgba?[(]\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (!match) return null;
        const red = Number(match[1]);
        const green = Number(match[2]);
        const blue = Number(match[3]);
        if (green > red + 25 && green > blue + 25) return 'green';
        if (blue > red + 25 && blue > green + 15) return 'blue';
        if (red > 170 && green > 120 && blue < 120 && Math.abs(red - green) < 110) return 'yellow';
        if (red > green + 35 && red > blue + 35) return 'red';
        return null;
    }

    function getLootType(row) {
        for (const image of row.querySelectorAll('img[src*="max_loot"]')) {
            const match = String(image.getAttribute('src') || '').match(/max_loot\/(0|1)(?:\.|$)/i);
            if (match) return match[1] === '1' ? 'full' : 'partial';
        }

        const descriptions = [
            row.className,
            row.getAttribute('data-loot'),
            row.getAttribute('data-loot-type'),
            row.getAttribute('data-haul'),
        ];
        row.querySelectorAll('[title],[alt],[data-loot],[data-loot-type],[data-haul]').forEach(element => {
            descriptions.push(
                element.getAttribute('title'),
                element.getAttribute('alt'),
                element.getAttribute('data-loot'),
                element.getAttribute('data-loot-type'),
                element.getAttribute('data-haul')
            );
        });
        const text = normalizeText(descriptions.filter(Boolean).join(' '));
        if (/(saque|pilhagem) (total|complet)|full (loot|haul|plunder)|(loot|haul|plunder) (full|complete)/.test(text)) {
            return 'full';
        }
        if (/(saque|pilhagem) parcial|partial (loot|haul|plunder)|(loot|haul|plunder) partial/.test(text)) {
            return 'partial';
        }
        return null;
    }

    function getWallLevel(row) {
        const direct = row.getAttribute('data-wall-level') || row.getAttribute('data-muralha');
        if (/^\d+$/.test(String(direct || '').trim())) return Math.min(20, Number(direct));

        const marked = row.querySelector('[data-building="wall"],[data-wall-level],td.wall,td[class*="wall_level"]');
        const index = findColumnIndex(row, /wall|muralha/);
        const cell = marked || (index >= 0 ? row.cells[index] : null) || (row.cells.length > 6 ? row.cells[6] : null);
        const text = String(cell?.textContent || '').trim();
        return /^\d+$/.test(text) ? Math.min(20, Number(text)) : null;
    }

    function findColumnIndex(row, pattern) {
        const table = row.closest('table');
        if (!table) return -1;
        for (const header of table.querySelectorAll('th')) {
            const image = header.querySelector('img');
            const description = normalizeText([
                header.textContent,
                header.className,
                header.getAttribute('title'),
                image?.getAttribute('src'),
                image?.getAttribute('title'),
                image?.getAttribute('alt'),
            ].filter(Boolean).join(' '));
            if (pattern.test(description)) return header.cellIndex;
        }
        return -1;
    }

    function getTargetDistance(row) {
        const origin = getOriginCoordinates();
        const target = getCoordinates(row.textContent);
        if (origin && target) {
            return Math.hypot(target.x - origin.x, target.y - origin.y);
        }

        const marked = row.querySelector('[data-distance],td.distance,td[class*="distance"]');
        const direct = String(marked?.getAttribute('data-distance') || marked?.textContent || '')
            .trim().replace(',', '.');
        return /^\d+(?:\.\d+)?$/.test(direct) ? Number(direct) : Number.POSITIVE_INFINITY;
    }

    function getOriginCoordinates() {
        const village = window.game_data?.village;
        if (!village) return null;
        if (village.coord) return getCoordinates(village.coord);
        if (Number.isFinite(Number(village.x)) && Number.isFinite(Number(village.y))) {
            return { x: Number(village.x), y: Number(village.y) };
        }
        return null;
    }

    function getCoordinates(value) {
        const match = String(value || '').match(/(\d{1,3})\s*[|]\s*(\d{1,3})/);
        return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
    }

    function getTargetKey(row) {
        const idMatch = String(row.id || '').match(/^village_(\d+)/);
        if (idMatch) return `village:${idMatch[1]}`;

        const targetLink = row.querySelector('a[href*="target="]');
        if (targetLink) {
            try {
                const target = new URL(targetLink.href, window.location.href).searchParams.get('target');
                if (/^\d+$/.test(String(target || ''))) return `village:${target}`;
            } catch (_) {
                // Usa o onclick ou as coordenadas abaixo.
            }
        }

        const farmButton = row.querySelector('a.farm_icon_a,a.farm_icon_b,a.farm_icon_c');
        const onclick = farmButton?.getAttribute('onclick') || '';
        const onclickMatch = onclick.match(/Accountmanager[.]farm[.]sendUnits\s*[(]\s*[^,]+\s*,\s*(\d+)/i);
        if (onclickMatch) return `village:${onclickMatch[1]}`;

        const coordinates = getCoordinates(row.textContent);
        return coordinates ? `coord:${coordinates.x}|${coordinates.y}` : '';
    }

    function isFarmButtonDisabled(button) {
        return !button ||
            button.classList.contains('farm_icon_disabled') ||
            button.getAttribute('aria-disabled') === 'true' ||
            button.hasAttribute('disabled') ||
            Boolean(button.closest('.farm_icon_disabled'));
    }

    function getDomOrder(first, second) {
        if (first === second) return 0;
        return first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    }

    function normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function delay(ms) {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }

    function resetRunState() {
        const run = {
            sessionId: makeId(),
            startedAt: Date.now(),
            counts: { a: 0, b: 0, c: 0 },
            round: {
                number: 1,
                phase: 'start',
                pauseUntil: 0,
                farmCompleted: false,
                targets: {},
                spy: { sent: 0, attempted: {} },
            },
            lastSend: null,
        };
        localStorage.setItem(keys.run, JSON.stringify(run));
        state.farmSent = 0;
        state.processedTargets.clear();
        state.processedRows = new WeakSet();
        renderModelCounts();
        return run;
    }

    function ensureRunState() {
        return readRunState() || resetRunState();
    }

    function readRunState() {
        try {
            const run = JSON.parse(localStorage.getItem(keys.run) || 'null');
            if (!run || typeof run !== 'object' || !run.sessionId || !run.counts) return null;
            return {
                sessionId: String(run.sessionId),
                startedAt: Number(run.startedAt) || Date.now(),
                counts: {
                    a: integerValue(run.counts.a, 0, 0, 1000000),
                    b: integerValue(run.counts.b, 0, 0, 1000000),
                    c: integerValue(run.counts.c, 0, 0, 1000000),
                },
                round: normalizeRoundState(run.round),
                lastSend: normalizeLastSend(run.lastSend),
            };
        } catch (_) {
            return null;
        }
    }

    function recordFarmSend(model, details = {}) {
        const run = ensureRunState();
        const config = state.settings?.models?.[model] || loadSettings().models[model];
        const targetKey = String(details.targetKey || '');
        const previous = targetKey ? run.round.targets[targetKey] : null;
        const maximum = getSameVillageLimit(config);
        const sent = previous?.model === model ? previous.sent + 1 : 1;
        const complete = !targetKey || sent >= maximum;
        const now = Date.now();

        run.counts[model] = (run.counts[model] || 0) + 1;
        if (targetKey) {
            run.round.targets[targetKey] = {
                model,
                sent,
                nextAt: complete ? 0 : now + randomizedArrivalSeparationMs(config.sameVillage.separationSeconds),
                lastAt: now,
            };
        }
        run.lastSend = {
            model,
            color: String(details.color || ''),
            targetKey,
            at: now,
        };
        registerActiveAttack({
            model,
            sourceId: getVillageId(),
            targetKey,
            targetCoord: details.targetCoord,
            distance: details.distance,
            minutesPerField: details.minutesPerField,
            unitSpeed: details.unitSpeed,
            sentAt: now,
        });
        writeRunState(run);
        return { sent, maximum, complete };
    }

    function getSameVillageLimit(config) {
        return config?.sameVillage?.enabled
            ? integerValue(config.sameVillage.max, 2, 2, 50)
            : 1;
    }

    function modelHasCapacity(model, config, activeCounts) {
        const active = activeCounts?.[model] ?? getActiveAttackCount(model);
        return !config?.maxAttacks?.enabled || active < config.maxAttacks.max;
    }

    function renderModelCounts() {
        if (!state.settingsPanel || !state.settings) return;
        const run = readRunState();
        ['a', 'b', 'c'].forEach(model => {
            const roundCount = run?.counts?.[model] || 0;
            const activeCount = getActiveAttackCount(model);
            const limit = state.settings.models[model].maxAttacks;
            const activeBadge = state.settingsPanel.querySelector(`[data-model-active-count="${model}"]`);
            const roundBadge = state.settingsPanel.querySelector(`[data-model-round-count="${model}"]`);
            const nextReturn = getNextActiveReturn(model);
            if (activeBadge) {
                activeBadge.textContent = `Curso ${activeCount}/${limit.enabled ? limit.max : '∞'}`;
                activeBadge.title = nextReturn
                    ? `${activeCount} ataque(s) em curso. Próxima vaga prevista: ${formatClock(nextReturn)}.`
                    : `${activeCount} ataque(s) em curso.`;
            }
            if (roundBadge) {
                roundBadge.textContent = `Ronda ${roundCount}`;
                roundBadge.title = `${roundCount} ataque(s) lançados na ronda atual.`;
            }
        });
        const spyActive = getActiveAttackCount('spy');
        const spyRound = run?.round?.spy?.sent || 0;
        const spyMaximum = state.settings.spy.maxAttacks;
        const spyActiveBadge = state.settingsPanel.querySelector('[data-spy-active-count]');
        const spyRoundBadge = state.settingsPanel.querySelector('[data-spy-round-count]');
        const spyNextReturn = getNextActiveReturn('spy');
        if (spyActiveBadge) {
            spyActiveBadge.textContent = `Curso ${spyActive}/${spyMaximum}`;
            spyActiveBadge.title = spyNextReturn
                ? `${spyActive} espionagem(ns) em curso. Próxima vaga prevista: ${formatClock(spyNextReturn)}.`
                : `${spyActive} espionagem(ns) em curso.`;
        }
        if (spyRoundBadge) {
            spyRoundBadge.textContent = `Ronda ${spyRound}`;
            spyRoundBadge.title = `${spyRound} espionagem(ns) lançada(s) na ronda atual.`;
        }
        if (!state.spyRunning && state.settings.spy.enabled) setSpyStatus('Pronto');
    }

    function readActiveAttacks() {
        const now = Date.now();
        let stored = [];
        let changed = false;
        try {
            const parsed = JSON.parse(localStorage.getItem(keys.activeAttacks) || '[]');
            stored = Array.isArray(parsed) ? parsed : [];
            if (!Array.isArray(parsed)) changed = true;
        } catch (_) {
            changed = true;
        }

        const clean = [];
        stored.slice(-10000).forEach(value => {
            if (!value || typeof value !== 'object') {
                changed = true;
                return;
            }
            const model = ['a', 'b', 'c', 'spy'].includes(value.model) ? value.model : '';
            const returnAt = Number(value.returnAt) || 0;
            if (!model || returnAt <= now) {
                changed = true;
                return;
            }
            clean.push({
                id: String(value.id || makeId()),
                model,
                sourceId: String(value.sourceId || ''),
                targetKey: String(value.targetKey || ''),
                targetCoord: String(value.targetCoord || ''),
                sentAt: Math.max(0, Number(value.sentAt) || now),
                returnAt,
                distance: Math.max(0, Number(value.distance) || 0),
                minutesPerField: Math.max(1, Number(value.minutesPerField) || 35),
                unitSpeed: Math.max(0.01, Number(value.unitSpeed) || 1),
            });
        });

        if (changed || clean.length !== stored.length) writeActiveAttacks(clean);
        return clean;
    }

    function writeActiveAttacks(attacks) {
        try {
            localStorage.setItem(keys.activeAttacks, JSON.stringify((attacks || []).slice(-10000)));
        } catch (error) {
            console.warn(`[${APP.shortName}] Não foi possível guardar os ataques em curso.`, error);
        }
    }

    function registerActiveAttack(details) {
        const sentAt = Math.max(0, Number(details.sentAt) || Date.now());
        const distance = Number.isFinite(Number(details.distance))
            ? Math.max(0.01, Number(details.distance))
            : 999;
        const minutesPerField = Math.max(1, Number(details.minutesPerField) || 35);
        const unitSpeed = Math.max(0.01, Number(details.unitSpeed) || 1);
        const travelMs = distance * minutesPerField * 60 * 1000 * unitSpeed;
        const attack = {
            id: makeId(),
            model: details.model,
            sourceId: String(details.sourceId || getVillageId() || ''),
            targetKey: String(details.targetKey || ''),
            targetCoord: String(details.targetCoord || ''),
            sentAt,
            returnAt: sentAt + Math.ceil(travelMs * 2) + APP.returnSafetyMs,
            distance,
            minutesPerField,
            unitSpeed,
        };
        const attacks = readActiveAttacks();
        attacks.push(attack);
        writeActiveAttacks(attacks);
        return attack;
    }

    function getActiveAttackCount(model) {
        return getActiveAttackCounts()[model] || 0;
    }

    function getActiveAttackCounts() {
        const sourceId = getVillageId();
        const counts = { a: 0, b: 0, c: 0, spy: 0 };
        readActiveAttacks().forEach(attack => {
            if ((!sourceId || attack.sourceId === sourceId) && attack.model in counts) {
                counts[attack.model] += 1;
            }
        });
        return counts;
    }

    function getNextActiveReturn(model) {
        const sourceId = getVillageId();
        const returnTimes = readActiveAttacks().filter(attack => (
            attack.model === model && (!sourceId || attack.sourceId === sourceId)
        )).map(attack => attack.returnAt);
        return returnTimes.length ? Math.min(...returnTimes) : 0;
    }

    function formatClock(timestamp) {
        try {
            return new Date(timestamp).toLocaleTimeString('pt-PT', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
        } catch (_) {
            return new Date(timestamp).toLocaleTimeString();
        }
    }

    async function loadWorldUnitSpeed() {
        if (Number.isFinite(state.unitSpeed) && state.unitSpeed > 0) return state.unitSpeed;
        if (state.unitSpeedPromise) return state.unitSpeedPromise;

        const cached = Number(localStorage.getItem(keys.unitSpeed));
        if (Number.isFinite(cached) && cached > 0) {
            state.unitSpeed = cached;
            return cached;
        }

        state.unitSpeedPromise = (async () => {
            const controller = new AbortController();
            const timer = window.setTimeout(() => controller.abort(), 8000);
            try {
                const response = await fetch('/interface.php?func=get_config', {
                    credentials: 'same-origin',
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const xml = new DOMParser().parseFromString(await response.text(), 'text/xml');
                const value = Number(xml.querySelector('unit_speed')?.textContent);
                if (!Number.isFinite(value) || value <= 0) throw new Error('unit_speed inválido');
                state.unitSpeed = value;
                localStorage.setItem(keys.unitSpeed, String(value));
                return value;
            } catch (error) {
                console.warn(`[${APP.shortName}] Velocidade das unidades indisponível; usado o valor seguro 1.`, error);
                state.unitSpeed = 1;
                return 1;
            } finally {
                window.clearTimeout(timer);
                state.unitSpeedPromise = null;
            }
        })();
        return state.unitSpeedPromise;
    }

    function getModelSlowestMinutesPerField(model) {
        const units = getFarmTemplateUnits(model);
        const speeds = Object.entries(units)
            .filter(([, amount]) => Number(amount) > 0)
            .map(([unit]) => UNIT_MINUTES_PER_FIELD[unit])
            .filter(Number.isFinite);
        if (speeds.length) return Math.max(...speeds);

        console.warn(
            `[${APP.shortName}] Não foi possível ler as unidades do Modelo ${model.toUpperCase()}; ` +
            'o regresso será calculado pela unidade mais lenta.'
        );
        return UNIT_MINUTES_PER_FIELD.snob;
    }

    function getFarmTemplateUnits(model) {
        const result = {};
        const templates = window.Accountmanager?.farm?.templates;
        const templateId = getFarmTemplateId(model);
        let template = templates?.[model] || templates?.[model.toUpperCase()] || null;
        if (!template && templates && typeof templates === 'object') {
            template = Object.values(templates).find(value => (
                value && typeof value === 'object' &&
                templateId && String(value.id || value.template_id || '') === String(templateId)
            )) || null;
        }
        collectTemplateUnits(template, result);

        if (!Object.values(result).some(value => value > 0)) {
            Object.assign(result, getFarmTemplateUnitsFromDom(model, templateId));
        }
        if (!Object.values(result).some(value => value > 0)) {
            Object.assign(result, getAvailableFarmUnitsFromDom());
        }
        return result;
    }

    function collectTemplateUnits(template, result) {
        if (!template || typeof template !== 'object') return;
        const sources = [template, template.units, template.unit_counts, template.troops]
            .filter(value => value && typeof value === 'object');
        Object.keys(UNIT_MINUTES_PER_FIELD).forEach(unit => {
            for (const source of sources) {
                const amount = Number(source[unit]);
                if (Number.isFinite(amount) && amount >= 0) {
                    result[unit] = amount;
                    break;
                }
            }
        });
    }

    function getFarmTemplateId(model) {
        const button = document.querySelector(
            `#plunder_list a.farm_icon_${model},#am_widget_Farm a.farm_icon_${model}`
        );
        if (!button) return '';
        const values = [
            button.getAttribute('data-template-id'),
            button.getAttribute('data-template'),
            button.dataset?.templateId,
            button.dataset?.template,
        ];
        for (const value of values) {
            if (/^\d+$/.test(String(value || ''))) return String(value);
        }
        const code = [
            button.getAttribute('href'),
            button.getAttribute('onclick'),
            button.outerHTML,
        ].filter(Boolean).join(' ');
        const explicit = code.match(/(?:template_id|template)[^0-9]{0,12}(\d+)/i);
        if (explicit) return explicit[1];
        const call = code.match(/Accountmanager[.]farm[.]sendUnits\s*[(]\s*[^,]+\s*,\s*\d+\s*,\s*(\d+)/i);
        return call?.[1] || '';
    }

    function getFarmTemplateUnitsFromDom(model, templateId) {
        const result = {};
        const root = document.querySelector('#am_widget_Farm');
        if (!root) return result;
        const unitInputs = Array.from(root.querySelectorAll('input')).filter(input => getInputUnitName(input));
        const inputRows = Array.from(new Set(unitInputs.map(input => input.closest('tr')).filter(Boolean)));
        const fallbackRow = inputRows[{ a: 0, b: 1, c: 2 }[model]] || null;

        unitInputs.forEach(input => {
            const row = input.closest('tr');
            const unit = getInputUnitName(input);
            if (!unit || !templateInputBelongsToModel(input, row, model, templateId, fallbackRow)) return;
            const amount = Number(input.value);
            if (Number.isFinite(amount) && amount >= 0) result[unit] = amount;
        });
        return result;
    }

    function getInputUnitName(input) {
        const cell = input.closest('td,th');
        const values = [
            input.name,
            input.id,
            input.className,
            input.getAttribute('data-unit'),
            cell?.className,
            cell?.querySelector('img')?.getAttribute('src'),
        ].filter(Boolean).join(' ').toLowerCase();
        return Object.keys(UNIT_MINUTES_PER_FIELD).find(unit => (
            new RegExp(`(?:^|[^a-z])(?:unit[_-]?)?${unit}(?:[^a-z]|$)`).test(values)
        )) || '';
    }

    function getAvailableFarmUnitsFromDom() {
        const result = {};
        const root = document.querySelector('#am_widget_Farm');
        if (!root) return result;
        root.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            const unit = getInputUnitName(checkbox);
            const cell = checkbox.closest('td,th');
            const row = cell?.closest('tr');
            if (!unit || !checkbox.checked || !cell || !row) return;

            let amount = null;
            let candidateRow = row.nextElementSibling;
            for (let index = 0; candidateRow && index < 3; index += 1) {
                const candidateCell = candidateRow.cells?.[cell.cellIndex];
                const text = String(candidateCell?.textContent || '').trim().replace(/\s+/g, '');
                if (/^\d{1,3}(?:[.]\d{3})*$/.test(text) || /^\d+$/.test(text)) {
                    amount = Number(text.replace(/[.]/g, ''));
                    break;
                }
                candidateRow = candidateRow.nextElementSibling;
            }
            if (Number.isFinite(amount) && amount > 0) result[unit] = amount;
        });
        return result;
    }

    function templateInputBelongsToModel(input, row, model, templateId, fallbackRow) {
        const rows = [row, row?.previousElementSibling, row?.previousElementSibling?.previousElementSibling]
            .filter(Boolean);
        const structural = [
            input.name,
            input.id,
            input.getAttribute('data-template-id'),
            ...rows.map(value => value.outerHTML),
        ].filter(Boolean).join(' ');
        if (templateId && new RegExp(`(?:^|[^0-9])${templateId}(?:[^0-9]|$)`).test(structural)) {
            return true;
        }
        if (new RegExp(`farm_icon_${model}|modelo?\\s+${model}|model\\s+${model}`, 'i').test(structural)) {
            return true;
        }
        if (rows.some(value => Array.from(value.cells || []).some(cell => (
            normalizeText(cell.textContent) === model
        )))) return true;
        return row === fallbackRow;
    }

    function normalizeRoundState(value) {
        const allowed = new Set(['start', 'start_reloading', 'farming', 'spying', 'end_reloading', 'waiting']);
        const source = value && typeof value === 'object' ? value : {};
        return {
            number: integerValue(source.number, 1, 1, 1000000),
            phase: allowed.has(source.phase) ? source.phase : 'farming',
            pauseUntil: Math.max(0, Number(source.pauseUntil) || 0),
            farmCompleted: source.farmCompleted === true,
            targets: normalizeRoundTargets(source.targets),
            spy: normalizeRoundSpy(source.spy),
        };
    }

    function normalizeRoundSpy(value) {
        const source = value && typeof value === 'object' ? value : {};
        const attempted = {};
        if (source.attempted && typeof source.attempted === 'object' && !Array.isArray(source.attempted)) {
            Object.entries(source.attempted).slice(0, 1000).forEach(([id, result]) => {
                if (/^\d+$/.test(id)) attempted[id] = String(result || 'tentado').slice(0, 40);
            });
        }
        return {
            sent: integerValue(source.sent, 0, 0, 500),
            attempted,
        };
    }

    function normalizeRoundTargets(value) {
        const targets = {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) return targets;

        Object.entries(value).slice(0, 3000).forEach(([targetKey, progress]) => {
            if (!/^(?:village:\d+|coord:\d{1,3}[|]\d{1,3})$/.test(targetKey)) return;
            if (!progress || typeof progress !== 'object') return;
            const model = ['a', 'b', 'c'].includes(progress.model) ? progress.model : '';
            if (!model) return;
            targets[targetKey] = {
                model,
                sent: integerValue(progress.sent, 1, 1, 50),
                nextAt: Math.max(0, Number(progress.nextAt) || 0),
                lastAt: Math.max(0, Number(progress.lastAt) || 0),
            };
        });
        return targets;
    }

    function normalizeLastSend(value) {
        if (!value || typeof value !== 'object') return null;
        const model = ['a', 'b', 'c'].includes(value.model) ? value.model : '';
        const color = ['blue', 'green', 'yellow', 'red', 'redBlue', 'redYellow'].includes(value.color)
            ? value.color
            : '';
        if (!model || !color) return null;
        return {
            model,
            color,
            targetKey: String(value.targetKey || ''),
            at: Number(value.at) || 0,
        };
    }

    function writeRunState(run) {
        localStorage.setItem(keys.run, JSON.stringify(run));
        renderModelCounts();
        return run;
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
            maxAttacks: { enabled: false, max: 100 },
            sameVillage: { enabled: false, max: 2, separationSeconds: 60 },
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
        const generalSource = source.general || {};
        const spySource = source.spy || {};

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
                maxAttacks: {
                    enabled: booleanValue(model.maxAttacks?.enabled, fallback.maxAttacks.enabled),
                    max: integerValue(model.maxAttacks?.max, fallback.maxAttacks.max, 1, 10000),
                },
                sameVillage: {
                    enabled: booleanValue(model.sameVillage?.enabled, fallback.sameVillage.enabled),
                    max: integerValue(model.sameVillage?.max, fallback.sameVillage.max, 2, 50),
                    separationSeconds: integerValue(
                        model.sameVillage?.separationSeconds,
                        fallback.sameVillage.separationSeconds,
                        1,
                        86400
                    ),
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

        return {
            schema: 8,
            general: {
                attackIntervalMs: integerValue(
                    generalSource.attackIntervalMs,
                    DEFAULT_SETTINGS.general.attackIntervalMs,
                    APP.minAttackMs,
                    60000
                ),
                roundPauseSeconds: integerValue(
                    generalSource.roundPauseSeconds,
                    DEFAULT_SETTINGS.general.roundPauseSeconds,
                    1,
                    86400
                ),
            },
            models,
            spy: {
                enabled: booleanValue(spySource.enabled, DEFAULT_SETTINGS.spy.enabled),
                scoutsPerVillage: integerValue(
                    spySource.scoutsPerVillage,
                    DEFAULT_SETTINGS.spy.scoutsPerVillage,
                    1,
                    100
                ),
                radius: integerValue(spySource.radius, DEFAULT_SETTINGS.spy.radius, 1, 200),
                maxAttacks: integerValue(
                    spySource.maxAttacks ?? spySource.maxPerRound,
                    DEFAULT_SETTINGS.spy.maxAttacks,
                    1,
                    500
                ),
                intervalMs: integerValue(
                    spySource.intervalMs,
                    DEFAULT_SETTINGS.spy.intervalMs,
                    APP.minAttackMs,
                    60000
                ),
            },
        };
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
