// ==UserScript==
// @name         TW PT - AutoFarm - ThePlaguePT
// @namespace    theplaguept.tw.autofarm
// @version      1.0.1
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
        version: '1.0.1',
        id: 'twPtAutoFarm',
        buttonId: 'auto-farm-a-toggle',
        toolbarId: 'tp-theplaguept-script-bar',
        toolbarStyleId: 'tp-theplaguept-script-bar-style',
        styleId: 'twPtAutoFarm-style',
        statusId: 'twPtAutoFarm-worker-status',
        workerHeartbeatMs: 3000,
        workerFreshMs: 90000,
        monitorMs: 2500,
    });

    const world = getWorld();
    const tabId = makeId();
    const keys = Object.freeze({
        enabled: `twPtAutoFarm.v1.${world}.enabled`,
        worker: `twPtAutoFarm.v1.${world}.worker`,
    });
    const workerWindowName = `TW_PT_AutoFarm_${world}`;
    const workerLockName = `twPtAutoFarm-worker-${world}`;

    const state = {
        button: null,
        panel: null,
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
        injectStyles();
        createButton();
        bindEvents();
        startMonitor();

        if (isFarmPage()) {
            createWorkerPanel();
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
