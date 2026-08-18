// ==UserScript==
// @name         TW PT - Spy Info ThePlaguePT
// @namespace    theplaguept.tw.spy-info
// @version      1.0.15
// @description  Painéis com resumo diário horario TWStats para jogador e tribo: pontos, aldeias, conquistas, OD e histórico.
// @author       ThePlaguePT
// @match        https://*.tribalwars.com.pt/game.php*
// @match        https://pt.twstats.com/*
// @match        http://pt.twstats.com/*
// @include      *://*.tribalwars.*/game.php*
// @homepageURL  https://github.com/ThePlaguePT/TribalWars-Scripts
// @supportURL   https://github.com/ThePlaguePT/TribalWars-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Spy%20Info%20ThePlaguePT.user.js
// @downloadURL  https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Spy%20Info%20ThePlaguePT.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_openInTab
// @grant        unsafeWindow
// @connect      pt.twstats.com
// @connect      twstats.com
// @run-at       document-idle
// @noframes
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// ==/UserScript==

/* ===== Painel de jogador ===== */
(() => {
    "use strict";

    if (window.top !== window.self) return;

    const IS_TWSTATS = /(^|\.)twstats\.com$/i.test(window.location.hostname);
    const IS_TRIBALWARS = /tribalwars\./i.test(window.location.hostname);
    if (!IS_TWSTATS && !IS_TRIBALWARS) return;

    const APP = {
        id: "tpResumo24h",
        version: "1.0.15",
        title: "Spy Info",
        displayTitle: "TW PT - Spy Info ThePlaguePT",
        dialogId: "tpResumo24hInfoJogador",
        githubUrl: "https://github.com/ThePlaguePT/TribalWars-Scripts",
        launcherIcon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect x='2' y='9' width='2' height='5' fill='%23f6d28b'/%3E%3Crect x='6' y='5' width='2' height='9' fill='%23f6d28b'/%3E%3Crect x='10' y='2' width='2' height='12' fill='%23f6d28b'/%3E%3Cpath d='M1 14.5h14' stroke='%2340140d'/%3E%3C/svg%3E",
        mapCacheMs: 50 * 60 * 1000,
        conquerCacheMs: 90 * 1000,
        conquerAllCacheMs: 5 * 60 * 1000,
        twStatsCacheMs: 30 * 60 * 1000,
        twStatsTimeoutMs: 12000,
        twStatsBridgeWaitMs: 30000,
        twStatsBaselineToleranceMs: 48 * 60 * 60 * 1000,
        maxDailyConquestRows: 80,
        minSnapshotGapMs: 10 * 60 * 1000,
        snapshotRetentionMs: 10 * 24 * 60 * 60 * 1000,
        dailySnapshotRetentionMs: 180 * 24 * 60 * 60 * 1000,
        dayMs: 24 * 60 * 60 * 1000,
        baselineTargetMs: 24 * 60 * 60 * 1000,
        baselineToleranceMs: 4 * 60 * 60 * 1000,
        maxSnapshotsPerPlayer: 120,
        zIndex: 60030,
    };

    const OD_FILES = {
        total: ["/map/kill_all.txt"],
        off: ["/map/kill_att.txt"],
        def: ["/map/kill_def.txt"],
        support: [
            "/map/kill_sup.txt",
            "/map/kill_support.txt",
            "/map/kill_supporter.txt",
        ],
    };

    const state = {
        launcher: null,
        panel: null,
        busy: false,
        memoryCache: new Map(),
        controls: {},
        lastResult: null,
        nativeDialog: false,
        launcherPositionFrame: 0,
        launcherResizeObserver: null,
    };

    const nf = new Intl.NumberFormat("pt-PT");

    init();

    function init() {
        if (IS_TWSTATS) {
            initTwStatsBridge();
            return;
        }

        injectStyle();
        createLauncher();
        removeLegacyLaunchers();
        window.setTimeout(removeLegacyLaunchers, 250);
        window.setTimeout(removeLegacyLaunchers, 1000);
        removeOldProfileStatsButtons(null);
        registerHubShortcut();

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && state.panel && !state.panel.classList.contains(`${APP.id}-hidden`)) {
                closePanel();
            }
        });

        gameWindow().TPResumo24hJogador = {
            open: openPanel,
            run: () => runSummary(false),
            version: APP.version,
        };
    }

    function removeLegacyLaunchers() {
        const tribeLauncher = document.getElementById("tpResumo24hTribo-launcher");
        if (tribeLauncher) tribeLauncher.remove();
    }

    function ensureTpScriptBar(doc = document) {
        if (!doc || !doc.body) return null;
        if (!doc.getElementById("tp-theplaguept-script-bar-style")) {
            const style = doc.createElement("style");
            style.id = "tp-theplaguept-script-bar-style";
            style.textContent = '#tp-theplaguept-script-bar{position:fixed!important;top:6px!important;left:103px!important;z-index:2147483647!important;width:448px!important;height:38px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;padding:0 8px!important;box-sizing:border-box!important;pointer-events:none!important}#tp-theplaguept-script-bar>*{position:relative!important;top:auto!important;left:auto!important;right:auto!important;bottom:auto!important;transform:none!important;width:30px!important;min-width:30px!important;max-width:30px!important;height:28px!important;min-height:28px!important;margin:0!important;flex:0 0 30px!important;pointer-events:auto!important;overflow:visible!important}#tp-theplaguept-script-bar>button,#tp-theplaguept-script-bar>*>button{position:relative!important;top:auto!important;left:auto!important;right:auto!important;bottom:auto!important;transform:none!important;width:30px!important;min-width:30px!important;max-width:30px!important;height:28px!important;min-height:28px!important;margin:0!important;padding:0!important;flex:0 0 30px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:0!important;overflow:hidden!important}#tp-theplaguept-script-bar>button:hover,#tp-theplaguept-script-bar>button:focus-visible,#tp-theplaguept-script-bar>*>button:hover,#tp-theplaguept-script-bar>*>button:focus-visible,#tp-theplaguept-script-bar #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:hover,#tp-theplaguept-script-bar #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:focus-visible{width:30px!important;min-width:30px!important;max-width:30px!important;padding:0!important;gap:0!important}#tp-theplaguept-script-bar .tpdef-launcher-text,#tp-theplaguept-script-bar .tw-alerts-toggle-label,#tp-theplaguept-script-bar .ti-toggle-label,#tp-theplaguept-script-bar .ra-tp-config-button-label,#tp-theplaguept-script-bar [class$="-launcherLabel"],#tp-theplaguept-script-bar [class$="-launcher-text"]{display:none!important;max-width:0!important;opacity:0!important}#tp-theplaguept-script-bar #twHubTp-launcher{order:10!important}#tp-theplaguept-script-bar #tw-discord-alerts-ui{order:20!important}#tp-theplaguept-script-bar #tpDefLauncher{order:30!important}#tp-theplaguept-script-bar #tag-incomings-pt-panel{order:40!important}#tp-theplaguept-script-bar #tpMapMarker-launcher{order:50!important}#tp-theplaguept-script-bar #renomear-ataques-cores-theplaguept-config-button{order:60!important}#tp-theplaguept-script-bar #tpResumo24h-launcher{order:70!important}#tp-theplaguept-script-bar #tpconq-launcher{order:80!important}';
            (doc.head || doc.documentElement).appendChild(style);
        }
        let bar = doc.getElementById("tp-theplaguept-script-bar");
        if (!bar) {
            bar = doc.createElement("div");
            bar.id = "tp-theplaguept-script-bar";
            bar.setAttribute("aria-label", "Botoes ThePlaguePT");
            (doc.body || doc.documentElement).appendChild(bar);
        }
        return bar;
    }

    function attachToTpScriptBar(element, doc = document) {
        const bar = ensureTpScriptBar(doc);
        if (!bar || !element) return;
        element.classList.add("tp-theplaguept-script-bar-item");
        const orders = {"twHubTp-launcher":10,"tw-discord-alerts-ui":20,tpDefLauncher:30,"tag-incomings-pt-panel":40,"tpMapMarker-launcher":50,"renomear-ataques-cores-theplaguept-config-button":60,"tpResumo24h-launcher":70,"tpconq-launcher":80};
        const applyCompactButtonStyle = node => {
            if (!node || !node.style) return;
            node.style.setProperty("position", "relative", "important");
            node.style.setProperty("top", "auto", "important");
            node.style.setProperty("left", "auto", "important");
            node.style.setProperty("right", "auto", "important");
            node.style.setProperty("bottom", "auto", "important");
            node.style.setProperty("transform", "none", "important");
            node.style.setProperty("width", "30px", "important");
            node.style.setProperty("min-width", "30px", "important");
            node.style.setProperty("max-width", "30px", "important");
            node.style.setProperty("height", "28px", "important");
            node.style.setProperty("min-height", "28px", "important");
            node.style.setProperty("margin", "0", "important");
            node.style.setProperty("flex", "0 0 30px", "important");
        };
        applyCompactButtonStyle(element);
        if (orders[element.id]) element.style.setProperty("order", String(orders[element.id]), "important");
        Array.from(element.children || []).filter(child => child.matches && child.matches("button")).forEach(applyCompactButtonStyle);
        element.querySelectorAll('.tpdef-launcher-text,.tw-alerts-toggle-label,.ti-toggle-label,.ra-tp-config-button-label,[class$="-launcherLabel"],[class$="-launcher-text"]').forEach(label => {
            label.style.setProperty("display", "none", "important");
            label.style.setProperty("max-width", "0", "important");
            label.style.setProperty("opacity", "0", "important");
        });
        if (element.parentElement !== bar) bar.appendChild(element);
    }

    function createLauncher() {
        const existing = document.getElementById(`${APP.id}-launcher`);
        if (existing) existing.remove();

        const button = document.createElement("button");
        button.id = `${APP.id}-launcher`;
        button.type = "button";
        button.title = APP.displayTitle;
        button.setAttribute("aria-label", APP.displayTitle);
        button.innerHTML = `
            <span class="${APP.id}-launcherIcon" aria-hidden="true"></span>
            <span class="${APP.id}-launcherLabel">${escapeHTML(APP.displayTitle)}</span>
        `;
        button.addEventListener("click", openPanel);
        document.body.appendChild(button);
        attachToTpScriptBar(button);
        state.launcher = button;
        setupLauncherPosition();
    }

    function removeOldProfileStatsButtons(keep) {
        const wrappers = Array.from(document.querySelectorAll(
            `#${APP.id}-profileStats, .${APP.id}-profileStatsRow, .${APP.id}-profileStatsWrap, .${APP.id}-profileStatsButton`
        ));
        const looseButtons = Array.from(document.querySelectorAll("button, a, input")).filter((node) => {
            const text = cleanText(node.textContent || node.value);
            return text === "Info - Stats";
        });
        Array.from(new Set([...wrappers, ...looseButtons])).forEach((node) => {
            if (keep && (node === keep || keep.contains(node))) return;

            const container = node.closest(`.${APP.id}-profileStatsRow, .${APP.id}-profileStatsWrap`) || node;
            if (keep && (container === keep || keep.contains(container))) return;
            container.remove();
        });
    }

    function setupLauncherPosition() {
        scheduleLauncherPosition();
        window.addEventListener("resize", scheduleLauncherPosition);
        window.addEventListener("orientationchange", scheduleLauncherPosition);

        if (typeof window.ResizeObserver === "function") {
            const observedLayout = findGameLayout();
            if (observedLayout) {
                state.launcherResizeObserver = new window.ResizeObserver(scheduleLauncherPosition);
                state.launcherResizeObserver.observe(observedLayout);
            }
        }

        window.setTimeout(positionLauncher, 250);
        window.setTimeout(positionLauncher, 1000);
    }

    function findGameLayout() {
        return document.querySelector("#main_layout td.maincell") ||
            document.querySelector("td.maincell") ||
            document.querySelector("#contentContainer") ||
            document.querySelector("#content_value");
    }

    function positionLauncher() {
        if (!state.launcher) return;
        if (state.launcher.closest("#tp-theplaguept-script-bar")) return;

        const gameLayout = findGameLayout();
        if (!gameLayout) return;

        const layoutRect = gameLayout.getBoundingClientRect();
        if (layoutRect.width <= 0) return;

        const launcherWidth = 30;
        const launcherGap = 25;
        const left = Math.max(4, Math.round(layoutRect.left - launcherWidth - launcherGap));
        state.launcher.style.setProperty("left", `${left}px`, "important");
    }

    function scheduleLauncherPosition() {
        window.cancelAnimationFrame(state.launcherPositionFrame);
        state.launcherPositionFrame = window.requestAnimationFrame(positionLauncher);
    }

    function registerHubShortcut() {
        const item = {
            id: "informacao-jogador-tribo-theplaguept",
            label: "Spy Info",
            group: "Paineis",
            description: "Abre o resumo de pontos, aldeias, conquistas e OD de jogador ou tribo.",
            order: 35,
            run: openPanel,
        };
        const page = gameWindow();
        page.TWHubQueue = page.TWHubQueue || [];
        page.TWHubQueue.push(item);
    }

    function openPanel() {
        const dialogApi = gameWindow().Dialog;
        if (dialogApi && typeof dialogApi.show === "function") {
            openNativeDialogPanel();
            return;
        }

        if (state.nativeDialog) {
            if (dialogApi && typeof dialogApi.close === "function") dialogApi.close(APP.dialogId);
            state.nativeDialog = false;
            state.panel = null;
            state.controls = {};
        }

        if (!state.panel || !state.panel.isConnected) createPanel();
        state.nativeDialog = false;
        state.panel.classList.remove(`${APP.id}-hidden`);
        hydratePanelAfterOpen();
    }

    function hydratePanelAfterOpen() {
        const guess = defaultPlayerQuery();
        if (guess && state.controls.playerInput && !state.controls.playerInput.value.trim()) {
            state.controls.playerInput.value = guess;
        }
        window.setTimeout(() => {
            if (state.controls.playerInput) state.controls.playerInput.focus();
        }, 20);
    }

    function openNativeDialogPanel() {
        const html = getPanelInnerHTML().replace(
            new RegExp(`<button[^>]*class="${APP.id}-close"[^>]*>[\\s\\S]*?<\\/button>`),
            "",
        );

        gameWindow().Dialog.show(APP.dialogId, html);
        const dialog = document.querySelector(`#popup_box_${APP.dialogId} .${APP.id}-dialog`) ||
            document.querySelector(`.${APP.id}-dialog`);
        if (!dialog) return;

        state.panel = dialog;
        state.nativeDialog = true;
        bindPanelControls(document);
        expandNativeDialog(dialog);
        scheduleDialogRecentering();

        if (state.lastResult) renderResult(state.lastResult);
        hydratePanelAfterOpen();
    }

    function getPanelInnerHTML() {
        let panel = document.getElementById(`${APP.id}-panel`);
        if (!panel || state.nativeDialog) {
            if (panel) panel.remove();
            createPanel();
            panel = document.getElementById(`${APP.id}-panel`);
        }

        const html = panel.innerHTML;
        panel.remove();
        if (state.panel === panel) state.panel = null;
        state.controls = {};
        return html;
    }

    function closePanel() {
        const dialogApi = gameWindow().Dialog;
        if (state.nativeDialog && dialogApi && typeof dialogApi.close === "function") {
            dialogApi.close(APP.dialogId);
            state.nativeDialog = false;
            state.panel = null;
            state.controls = {};
            return;
        }

        if (state.panel) state.panel.classList.add(`${APP.id}-hidden`);
    }

    function createPanel() {
        const panel = document.createElement("div");
        panel.id = `${APP.id}-panel`;
        panel.className = `${APP.id}-hidden`;
        panel.innerHTML = `
            <div class="${APP.id}-dialog" role="dialog" aria-modal="true" aria-label="${APP.title}">
                <button type="button" class="${APP.id}-close" data-action="close" title="Fechar">x</button>
                <div class="${APP.id}-shell">
                    <header class="${APP.id}-masthead">
                        <h2>${escapeHTML(APP.displayTitle)}</h2>
                        <p>Resumo horario por dia TWStats do mundo atual. ${escapeHTML(worldLabel())}</p>
                    </header>

                    <form id="${APP.id}-form" class="${APP.id}-panelRow ${APP.id}-searchRow">
                        <aside class="${APP.id}-rowLabel">
                            <strong>${sectionIcon("JOGADOR")}<span>JOGADOR</span></strong>
                            <span>Procura por nome ou ID para gerar o resumo.</span>
                        </aside>
                        <div class="${APP.id}-rowContent">
                            <div class="${APP.id}-controlsGrid">
                                <label>
                                    <span>Tipo</span>
                                    <select name="infoType">
                                        <option value="player" selected>Jogador</option>
                                        <option value="tribe">Tribo</option>
                                    </select>
                                </label>
                                <label>
                                    <span>Jogador</span>
                                    <input type="text" name="player" autocomplete="off" placeholder="Nome ou ID do jogador">
                                </label>
                                <label>
                                    <span>Periodo</span>
                                    <select name="period">
                                        <option value="0" selected>Hoje</option>
                                        <option value="1">-1 dia</option>
                                        <option value="2">-2 dias</option>
                                        <option value="3">-3 dias</option>
                                        <option value="4">-4 dias</option>
                                        <option value="5">-5 dias</option>
                                        <option value="6">-6 dias</option>
                                        <option value="custom">Data manual</option>
                                    </select>
                                </label>
                                <label>
                                    <span>Data</span>
                                    <input type="date" name="periodDate">
                                </label>
                                <label>
                                    <span>Comparar</span>
                                    <select disabled>
                                        <option>Historico TWStats horario</option>
                                    </select>
                                </label>
                            </div>
                        </div>
                    </form>

                    <div class="${APP.id}-body">
                        <section class="${APP.id}-panelRow ${APP.id}-summaryRow">
                            <aside class="${APP.id}-rowLabel">
                                <strong>${sectionIcon("RESUMO")}<span>RESUMO</span></strong>
                                <span>Totais e variação do jogador selecionado.</span>
                            </aside>
                            <div class="${APP.id}-rowContent">
                                <div class="${APP.id}-empty">Escreve um jogador para carregar o resumo.</div>
                            </div>
                        </section>
                    </div>

                    <section class="${APP.id}-panelRow ${APP.id}-actionsRow">
                        <aside class="${APP.id}-rowLabel">
                            <strong>${sectionIcon("ACOES")}<span>ACOES</span></strong>
                            <span>Atualiza dados da vista atual.</span>
                        </aside>
                        <div class="${APP.id}-rowContent">
                            <div class="${APP.id}-actions">
                                <button type="submit" form="${APP.id}-form">Atualizar</button>
                                <button type="button" data-action="clear">Limpar Cache</button>
                            </div>
                            <div class="${APP.id}-footerLine">
                                <span class="${APP.id}-status">Pronto.</span>
                                <span>Dados publicos do mapa. <a href="${APP.githubUrl}" target="_blank" rel="noopener">GitHub</a></span>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        state.panel = panel;
        state.nativeDialog = false;
        bindPanelControls(panel);
    }

    function bindPanelControls(root) {
        const scope = state.nativeDialog
            ? document.querySelector(`#popup_box_${APP.dialogId} .${APP.id}-dialog`) || root.querySelector(`.${APP.id}-dialog`) || root
            : root;

        state.controls.playerInput = scope.querySelector('input[name="player"]');
        state.controls.periodSelect = scope.querySelector('select[name="period"]');
        state.controls.periodDateInput = scope.querySelector('input[name="periodDate"]');
        state.controls.status = scope.querySelector(`.${APP.id}-status`);
        state.controls.body = scope.querySelector(`.${APP.id}-body`);
        state.controls.submit = scope.querySelector('button[type="submit"]');
        state.controls.infoTypeSelect = scope.querySelector('select[name="infoType"]');
        state.controls.clear = scope.querySelector('[data-action="clear"]');

        const closeButton = scope.querySelector('[data-action="close"]');
        if (closeButton) closeButton.addEventListener("click", closePanel);

        const form = scope.querySelector("form");
        if (form) form.addEventListener("submit", (event) => {
            event.preventDefault();
            runSummary(false);
        });

        if (state.controls.clear) state.controls.clear.addEventListener("click", clearCache);
        if (state.controls.infoTypeSelect) state.controls.infoTypeSelect.addEventListener("change", () => {
            if (state.controls.infoTypeSelect.value === "tribe") switchToTribePanel();
        });
        syncDateInputFromPeriod();
        if (state.controls.periodSelect) state.controls.periodSelect.addEventListener("change", () => {
            syncDateInputFromPeriod();
            if (state.lastResult && (state.controls.playerInput.value || "").trim()) runSummary(false);
        });
        if (state.controls.periodDateInput) state.controls.periodDateInput.addEventListener("change", () => {
            syncPeriodFromDateInput();
            if (state.lastResult && (state.controls.playerInput.value || "").trim()) runSummary(false);
        });

        if (state.controls.body) state.controls.body.addEventListener("click", (event) => {
            const exportButton = event.target.closest(`[data-${APP.id}-export]`);
            if (exportButton) {
                exportDailyArchive(exportButton.getAttribute(`data-${APP.id}-export`));
                return;
            }

            const toggle = event.target.closest(`[data-${APP.id}-toggle]`);
            if (toggle) togglePanelRow(toggle);
        });
    }

    function switchToTribePanel() {
        closePanel();
        window.setTimeout(() => {
            const api = gameWindow().TPResumo24hTribo;
            if (api && typeof api.open === "function") api.open();
        }, 0);
    }

    function expandNativeDialog(dialog) {
        const box = findNativeDialogBox(dialog);
        const content = dialog.closest(".popup_box_content") || (box && box.querySelector(".popup_box_content")) || dialog.parentElement;
        const frame = dialog.querySelector(`.${APP.id}-shell`) || dialog;
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 1320;
        const width = Math.min(1320, Math.max(320, viewportWidth - 24));

        if (box) {
            setStyleImportant(box, "position", "fixed");
            setStyleImportant(box, "top", "50%");
            setStyleImportant(box, "left", "50%");
            setStyleImportant(box, "right", "auto");
            setStyleImportant(box, "bottom", "auto");
            setStyleImportant(box, "transform", "translate(-50%, -50%)");
            setStyleImportant(box, "margin", "0");
            setStyleImportant(box, "margin-left", "0");
            setStyleImportant(box, "width", `${width}px`);
            setStyleImportant(box, "max-width", "calc(100vw - 24px)");
            setStyleImportant(box, "max-height", "calc(100vh - 8px)");
            setStyleImportant(box, "box-sizing", "border-box");
            setStyleImportant(box, "overflow", "visible");
            setStyleImportant(box, "z-index", String(APP.zIndex + 2));
        }

        [content, content && content.firstElementChild, dialog, frame].filter(Boolean).forEach((node) => {
            setStyleImportant(node, "max-width", "100%");
            setStyleImportant(node, "min-width", "0");
            setStyleImportant(node, "box-sizing", "border-box");
            setStyleImportant(node, "overflow-x", "hidden");
        });

        setStyleImportant(dialog, "width", "min(1260px, calc(100vw - 58px))");
        setStyleImportant(dialog, "margin", "0 auto");
        setStyleImportant(dialog, "padding", "0");
        setStyleImportant(dialog, "overflow", "visible");
        if (content) {
            setStyleImportant(content, "max-height", "calc(100vh - 38px)");
            setStyleImportant(content, "overflow", "hidden");
            setStyleImportant(content, "padding-bottom", "0");
        }
        setStyleImportant(frame, "width", "100%");
        setStyleImportant(frame, "height", "auto");
        setStyleImportant(frame, "max-height", "calc(100vh - 76px)");
        setStyleImportant(frame, "overflow-x", "hidden");
        setStyleImportant(frame, "overflow-y", "auto");
        setStyleImportant(frame, "padding-bottom", "16px");
    }

    function setStyleImportant(node, name, value) {
        if (!node || !node.style) return;
        node.style.setProperty(name, value, "important");
    }

    function recenterNativeDialog() {
        const dialog = document.querySelector(`#popup_box_${APP.dialogId} .${APP.id}-dialog`);
        if (dialog) expandNativeDialog(dialog);
    }

    function scheduleDialogRecentering() {
        [0, 50, 150, 350].forEach((delay) => {
            window.setTimeout(recenterNativeDialog, delay);
        });
    }

    function findNativeDialogBox(dialog) {
        const explicit = document.getElementById(`popup_box_${APP.dialogId}`);
        if (explicit) return explicit;

        let node = dialog.parentElement;
        let candidate = null;
        while (node && node !== document.body) {
            const id = String(node.id || "");
            const className = String(node.className || "");
            const classes = node.classList ? Array.from(node.classList) : [];
            if (id.indexOf("popup_box_") === 0 || id === "popup_box" || classes.includes("popup_box")) return node;
            if (!candidate && /popup|dialog/i.test(`${id} ${className}`)) candidate = node;
            node = node.parentElement;
        }
        return candidate || dialog.parentElement;
    }

    async function runSummary(force) {
        if (state.busy) return;

        const query = (state.controls.playerInput.value || defaultPlayerQuery()).trim();
        if (!query) {
            showNotice("Indica o nome ou ID do jogador.", "warn");
            return;
        }

        state.busy = true;
        setBusy(true);
        setStatus(force ? "A atualizar ficheiros do mundo..." : "A carregar dados do mundo...");

        try {
            const result = await buildSummary(query, force);
            state.lastResult = result;
            state.controls.playerInput.value = result.player.name;
            renderResult(result);
            setStatus(`Atualizado: ${formatDateTime(new Date(result.generatedAt))} - ${result.period.shortLabel}: ${baselineStatusLabel(result.precision)}`);
        } catch (error) {
            console.error(`[${APP.id}]`, error);
            showNotice(`Erro: ${error.message || error}`, "error");
            setStatus("Erro ao carregar dados.");
        } finally {
            state.busy = false;
            setBusy(false);
        }
    }

    async function buildSummary(query, force) {
        const now = Date.now();
        const periodInfo = selectedPeriodInfo(now);
        const periodHours = periodInfo.hours;
        const periodMs = periodInfo.ms;
        const since = Math.floor(periodInfo.startMs / 1000);
        const until = Math.floor(periodInfo.endMs / 1000);

        const playersText = await fetchCachedText("players", "/map/player.txt", APP.mapCacheMs, force);
        const players = parsePlayers(playersText);
        const player = findPlayer(players, query);
        if (!player) throw new Error("Jogador nao encontrado no player.txt.");

        const conquerAllPromise = fetchCachedText("conquerAll", "/map/conquer.txt", APP.conquerAllCacheMs, force);
        const villagePromise = fetchCachedText("villages", "/map/village.txt", APP.mapCacheMs, force);
        const tribePromise = fetchCachedText("tribes", "/map/ally.txt", APP.mapCacheMs, force, true);
        const odPromise = loadOdEntries(player.id, force);

        const [conquerAllText, villagesText, tribesText, od] = await Promise.all([
            conquerAllPromise,
            villagePromise,
            tribePromise,
            odPromise,
        ]);

        const tribes = parseTribes(tribesText || "");
        player.tribe = tribeInfo(tribes, player.tribeId);
        const villages = parseVillages(villagesText);
        const conquests = summarizeConquests(conquerAllText, villages, players.byId, player.id, since, until);
        const todayConquests = summarizeConquests(conquerAllText, villages, players.byId, player.id, since, until);
        const allTime = summarizeAllTimeConquests(conquerAllText, villages, players.byId, player.id);
        const villagesSummary = summarizePlayerVillages(villages, player.id);
        const metrics = buildEvaluationMetrics(player, villagesSummary, od, allTime);

        const current = {
            ts: now,
            playerId: player.id,
            name: player.name,
            tribe: player.tribe,
            points: player.points,
            villages: player.villages,
            rank: player.rank,
            od,
            metrics,
            villagesArchive: compactVillageArchive(villagesSummary),
            conquestsDay: compactConquestArchive(todayConquests),
            allTimeSummary: compactAllTimeArchive(allTime),
        };

        const dailyHistory = loadDailySnapshots(player.id);
        const history = mergeBaselineHistory(loadSnapshots(player.id), dailyHistory);
        const externalBaseline = await loadTwStatsBaseline(player.id, current, now, periodInfo, force);
        const twStatsCurrent = externalBaseline && externalBaseline.currentSnapshot
            ? mergeTwStatsCurrent(current, externalBaseline.currentSnapshot)
            : null;
        const displayCurrent = twStatsCurrent || current;
        const localBaseline = chooseBaseline(history, periodInfo.endMs, periodHours);
        const baseline = externalBaseline && externalBaseline.snapshot ? externalBaseline.snapshot : localBaseline;
        const diffs = buildDiffs(displayCurrent, baseline);
        const precision = buildPrecisionInfo(periodInfo.endMs, periodHours, baseline, conquests, todayConquests, externalBaseline, localBaseline);
        const dailyStats = buildDailyStats(dailyHistory, displayCurrent);
        saveSnapshot(current);
        saveDailySnapshot(current);

        return {
            generatedAt: now,
            since,
            period: {
                hours: periodHours,
                days: periodHours / 24,
                ms: periodMs,
                label: periodInfo.label,
                shortLabel: periodInfo.shortLabel,
                dayOffset: periodInfo.dayOffset,
                startMs: periodInfo.startMs,
                endMs: periodInfo.endMs,
            },
            player,
            current: displayCurrent,
            baseline,
            diffs,
            precision,
            dailyStats,
            conquests,
            allTime,
            villagesSummary,
            twstats: buildTwStatsLinks(player.id),
            odSupportAvailable: od.support !== null,
            supportSource: od.supportSource || "",
        };
    }

    function selectedPeriodInfo(now) {
        const todayStart = startOfLocalDayMs(now);
        const selectedDateStart = selectedPeriodStartMs(todayStart);
        const dayOffset = Math.max(0, Math.round((todayStart - selectedDateStart) / APP.dayMs));
        const startMs = todayStart - dayOffset * APP.dayMs;
        const endMs = dayOffset === 0 ? now : startMs + APP.dayMs;
        const ms = Math.max(60 * 1000, endMs - startMs);
        const hours = ms / (60 * 60 * 1000);
        const dateText = formatDateOnly(new Date(startMs));
        const label = dayOffset === 0 ? `Hoje (${dateText}, 00:00-agora)` : `${dateText} (00:00-24:00)`;

        return {
            dayOffset,
            startMs,
            endMs,
            ms,
            hours,
            label,
            shortLabel: dayOffset === 0 ? "Hoje" : dateText,
        };
    }

    function selectedPeriodStartMs(todayStart) {
        const selectValue = String(state.controls.periodSelect && state.controls.periodSelect.value || "0");
        const manualStart = parsePeriodDateInputMs(todayStart);
        if (selectValue === "custom" && Number.isFinite(manualStart)) return manualStart;

        const dayOffset = clampDayOffset(Number.parseInt(selectValue, 10));
        return todayStart - dayOffset * APP.dayMs;
    }

    function parsePeriodDateInputMs(todayStart) {
        const value = state.controls.periodDateInput && state.controls.periodDateInput.value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;

        const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
        const time = buildLocalTime(year, month, day, 0, 0, 0);
        if (!Number.isFinite(time)) return null;
        return Math.min(time, todayStart);
    }

    function syncDateInputFromPeriod() {
        if (!state.controls.periodDateInput) return;
        const todayStart = startOfLocalDayMs(Date.now());
        const dayOffset = clampDayOffset(Number.parseInt(state.controls.periodSelect && state.controls.periodSelect.value, 10));
        state.controls.periodDateInput.value = formatDateInputValue(todayStart - dayOffset * APP.dayMs);
    }

    function syncPeriodFromDateInput() {
        if (!state.controls.periodDateInput || !state.controls.periodSelect) return;
        const todayStart = startOfLocalDayMs(Date.now());
        const selectedStart = parsePeriodDateInputMs(todayStart);
        if (!Number.isFinite(selectedStart)) return;

        const dayOffset = Math.max(0, Math.round((todayStart - selectedStart) / APP.dayMs));
        state.controls.periodSelect.value = dayOffset >= 0 && dayOffset <= 6 ? String(dayOffset) : "custom";
        state.controls.periodDateInput.value = formatDateInputValue(selectedStart);
    }

    function formatDateInputValue(time) {
        const date = new Date(time);
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0"),
        ].join("-");
    }

    function clampDayOffset(value) {
        return Number.isFinite(value) && value >= 0 && value <= 30 ? value : 0;
    }

    function startOfLocalDayMs(time) {
        const date = new Date(time);
        date.setHours(0, 0, 0, 0);
        return date.getTime();
    }

    function periodToMs(hours) {
        return Math.max(1, hours || 24) * 60 * 60 * 1000;
    }

    async function loadOdEntries(playerId, force) {
        const [totalText, offText, defText, supportData] = await Promise.all([
            fetchFirstAvailable("odTotal", OD_FILES.total, APP.mapCacheMs, force, true),
            fetchFirstAvailable("odOff", OD_FILES.off, APP.mapCacheMs, force, true),
            fetchFirstAvailable("odDef", OD_FILES.def, APP.mapCacheMs, force, true),
            fetchFirstAvailable("odSupport", OD_FILES.support, APP.mapCacheMs, force, true),
        ]);

        return normalizeOdEntries({
            total: findKillEntry(totalText.text, playerId),
            off: findKillEntry(offText.text, playerId),
            def: findKillEntry(defText.text, playerId),
            support: supportData.text ? findKillEntry(supportData.text, playerId) : null,
            supportSource: supportData.path || "",
        });
    }

    function normalizeOdEntries(od) {
        if (!od) return od;

        if (!od.support) {
            const supportScore = deriveSupportScore(od.total, od.off, od.def);
            if (Number.isFinite(supportScore)) {
                od.support = { score: supportScore, rank: null };
                od.supportSource = od.supportSource || "calculado";
            }
        }

        return od;
    }

    function deriveSupportScore(total, off, def) {
        const totalScore = total && Number.isFinite(total.score) ? total.score : null;
        const offScore = off && Number.isFinite(off.score) ? off.score : null;
        const defScore = def && Number.isFinite(def.score) ? def.score : null;
        if (!Number.isFinite(totalScore) || !Number.isFinite(offScore) || !Number.isFinite(defScore)) return null;

        return Math.max(0, totalScore - offScore - defScore);
    }

    async function fetchFirstAvailable(name, paths, ttlMs, force, optional) {
        let lastError = null;
        for (const path of paths) {
            try {
                const text = await fetchCachedText(`${name}:${path}`, path, ttlMs, force, optional);
                if (text !== null) return { path, text };
            } catch (error) {
                lastError = error;
            }
        }

        if (!optional && lastError) throw lastError;
        return { path: "", text: null };
    }

    async function fetchCachedText(name, path, ttlMs, force, optional) {
        const now = Date.now();
        const cached = state.memoryCache.get(name);
        if (!force && cached && now - cached.time < ttlMs) {
            if (cached.missing) return null;
            return cached.text;
        }

        const response = await fetch(path, {
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Accept": "text/plain,*/*" },
        });

        if (!response.ok) {
            if (optional && (response.status === 404 || response.status === 403)) {
                state.memoryCache.set(name, { time: now, missing: true, text: null });
                return null;
            }
            throw new Error(`${path} (${response.status})`);
        }

        const text = await response.text();
        state.memoryCache.set(name, { time: now, text });
        return text;
    }

    function parsePlayers(text) {
        const byId = new Map();
        const rows = [];

        byId.set(0, {
            id: 0,
            name: "Barbaros",
            tribeId: 0,
            villages: 0,
            points: 0,
            rank: 0,
        });

        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 6) continue;

            const player = {
                id: toInt(cols[0]),
                name: decodeTW(cols[1]) || `Jogador #${toInt(cols[0])}`,
                tribeId: toInt(cols[2]),
                villages: toInt(cols[3]),
                points: toInt(cols[4]),
                rank: toInt(cols[5]),
            };
            player.search = fold(player.name);
            byId.set(player.id, player);
            rows.push(player);
        }

        return { byId, rows };
    }

    function parseTribes(text) {
        const byId = new Map();
        byId.set(0, {
            id: 0,
            name: "-",
            tag: "-",
            members: 0,
            villages: 0,
            points: 0,
            allPoints: 0,
            rank: 0,
        });

        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 8) continue;

            const tribe = {
                id: toInt(cols[0]),
                name: decodeTW(cols[1]) || `Tribo #${toInt(cols[0])}`,
                tag: decodeTW(cols[2]) || "-",
                members: toInt(cols[3]),
                villages: toInt(cols[4]),
                points: toInt(cols[5]),
                allPoints: toInt(cols[6]),
                rank: toInt(cols[7]),
            };
            byId.set(tribe.id, tribe);
        }

        return { byId };
    }

    function tribeInfo(tribes, tribeId) {
        const tribe = tribes && tribes.byId ? tribes.byId.get(tribeId) : null;
        return tribe || {
            id: tribeId || 0,
            name: "-",
            tag: "-",
            members: 0,
            villages: 0,
            points: 0,
            allPoints: 0,
            rank: 0,
        };
    }

    function parseVillages(text) {
        const villages = new Map();
        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 6) continue;
            const id = toInt(cols[0]);
            const x = toInt(cols[2]);
            const y = toInt(cols[3]);
            villages.set(id, {
                id,
                name: decodeTW(cols[1]) || `Aldeia #${id}`,
                x,
                y,
                coords: `${x}|${y}`,
                playerId: toInt(cols[4]),
                points: toInt(cols[5]),
            });
        }
        return villages;
    }

    function findPlayer(players, query) {
        const clean = String(query || "").trim();
        if (!clean) return null;

        if (/^\d+$/.test(clean)) {
            const byId = players.byId.get(toInt(clean));
            if (byId) return byId;
        }

        const search = fold(clean);
        const exact = players.rows.find((player) => player.search === search);
        if (exact) return exact;

        const starts = players.rows.filter((player) => player.search.startsWith(search));
        if (starts.length === 1) return starts[0];

        const contains = players.rows.filter((player) => player.search.includes(search));
        if (contains.length === 1) return contains[0];

        if (starts.length > 1 || contains.length > 1) {
            const matches = (starts.length ? starts : contains)
                .slice(0, 8)
                .map((player) => `${player.name} (#${player.id})`)
                .join(", ");
            throw new Error(`Varios jogadores encontrados: ${matches}. Usa o nome completo ou o ID.`);
        }

        return null;
    }

    function findKillEntry(text, playerId) {
        if (text === null) return null;

        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 3) continue;
            const id = toInt(cols[1]);
            if (id === playerId) {
                return {
                    rank: toInt(cols[0]) || null,
                    score: toInt(cols[2]),
                };
            }
        }

        return {
            rank: null,
            score: 0,
        };
    }

    function summarizeConquests(text, villages, playersById, playerId, since, until) {
        const gained = [];
        const lost = [];

        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 4) continue;

            const timestamp = toInt(cols[1]);
            if (timestamp < since) continue;
            if (Number.isFinite(until) && timestamp >= until) continue;

            const villageId = toInt(cols[0]);
            const newOwnerId = toInt(cols[2]);
            const oldOwnerId = toInt(cols[3]);
            if (newOwnerId === oldOwnerId) continue;

            if (newOwnerId !== playerId && oldOwnerId !== playerId) continue;

            const village = villages.get(villageId) || fallbackVillage(villageId);
            const row = {
                villageId,
                village,
                timestamp,
                date: new Date(timestamp * 1000),
                newOwner: playerName(playersById, newOwnerId),
                oldOwner: playerName(playersById, oldOwnerId),
            };

            if (newOwnerId === playerId) gained.push(row);
            if (oldOwnerId === playerId) lost.push(row);
        }

        gained.sort((a, b) => b.timestamp - a.timestamp);
        lost.sort((a, b) => b.timestamp - a.timestamp);

        return {
            gained,
            lost,
            net: gained.length - lost.length,
        };
    }

    function summarizePlayerVillages(villages, playerId) {
        const rows = Array.from(villages.values())
            .filter((village) => village.playerId === playerId)
            .sort((a, b) => a.x - b.x || a.y - b.y || a.name.localeCompare(b.name));

        const continents = new Map();
        for (const village of rows) {
            const continent = continentFromVillage(village);
            const list = continents.get(continent) || [];
            list.push(village);
            continents.set(continent, list);
        }

        return {
            rows,
            coords: rows.map((village) => village.coords),
            continents: Array.from(continents.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([continent, list]) => ({
                    continent,
                    rows: list,
                    coords: list.map((village) => village.coords),
            })),
        };
    }

    function buildEvaluationMetrics(player, villagesSummary, od, allTime) {
        const villageRows = villagesSummary && villagesSummary.rows ? villagesSummary.rows : [];
        const villagePoints = villageRows.reduce((total, village) => total + (Number.isFinite(village.points) ? village.points : 0), 0);
        const villageCount = villageRows.length || player.villages || 0;
        const odTotal = od && od.total && Number.isFinite(od.total.score) ? od.total.score : null;
        const odOff = od && od.off && Number.isFinite(od.off.score) ? od.off.score : null;
        const odDef = od && od.def && Number.isFinite(od.def.score) ? od.def.score : null;
        const odSupport = od && od.support && Number.isFinite(od.support.score) ? od.support.score : null;

        return {
            pointsPerVillage: villageCount ? Math.round(player.points / villageCount) : null,
            villagePoints,
            averageVillagePoints: villageCount ? Math.round(villagePoints / villageCount) : null,
            odTotal,
            odOff,
            odDef,
            odSupport,
            odPerPoint: odTotal && player.points ? roundMetric(odTotal / player.points) : null,
            offensiveShare: odTotal ? roundMetric((odOff || 0) * 100 / odTotal) : null,
            defensiveShare: odTotal ? roundMetric((odDef || 0) * 100 / odTotal) : null,
            supportShare: odTotal ? roundMetric((odSupport || 0) * 100 / odTotal) : null,
            allTimeGained: allTime ? allTime.gained : 0,
            allTimeLost: allTime ? allTime.lost : 0,
            allTimeNet: allTime ? allTime.net : 0,
        };
    }

    function compactVillageArchive(summary) {
        const rows = summary && summary.rows ? summary.rows : [];
        const continents = summary && summary.continents ? summary.continents : [];
        return {
            count: rows.length,
            coords: rows.map((village) => village.coords),
            rows: rows.map((village) => ({
                id: village.id,
                name: village.name,
                coords: village.coords,
                x: village.x,
                y: village.y,
                points: village.points,
                continent: continentFromVillage(village),
            })),
            continents: continents.map((group) => ({
                continent: group.continent,
                count: group.rows.length,
                coords: group.coords,
                points: group.rows.reduce((total, village) => total + (Number.isFinite(village.points) ? village.points : 0), 0),
            })),
        };
    }

    function compactConquestArchive(conquests) {
        const gained = conquests && conquests.gained ? conquests.gained : [];
        const lost = conquests && conquests.lost ? conquests.lost : [];
        return {
            gained: gained.length,
            lost: lost.length,
            net: (conquests && conquests.net) || 0,
            rows: [...gained.map((row) => compactConquestRow(row, "gain")), ...lost.map((row) => compactConquestRow(row, "loss"))]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, APP.maxDailyConquestRows),
        };
    }

    function compactConquestRow(row, mode) {
        return {
            mode,
            timestamp: row.timestamp,
            date: formatDateTime(row.date),
            villageId: row.villageId,
            village: row.village ? row.village.name : "",
            coords: row.village ? row.village.coords : "-",
            points: row.village ? row.village.points : 0,
            continent: row.village ? continentFromVillage(row.village) : "-",
            oldOwner: row.oldOwner,
            newOwner: row.newOwner,
        };
    }

    function compactAllTimeArchive(allTime) {
        return {
            gained: allTime ? allTime.gained : 0,
            lost: allTime ? allTime.lost : 0,
            net: allTime ? allTime.net : 0,
            firstTs: allTime ? allTime.firstTs : 0,
            lastTs: allTime ? allTime.lastTs : 0,
            opponents: allTime && allTime.opponents ? allTime.opponents : [],
        };
    }

    function roundMetric(value) {
        return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
    }

    function summarizeAllTimeConquests(text, villages, playersById, playerId) {
        const daily = new Map();
        const opponents = new Map();
        const rows = [];
        let gained = 0;
        let lost = 0;
        let firstTs = 0;
        let lastTs = 0;

        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 4) continue;

            const villageId = toInt(cols[0]);
            const timestamp = toInt(cols[1]);
            const newOwnerId = toInt(cols[2]);
            const oldOwnerId = toInt(cols[3]);
            if (!timestamp || newOwnerId === oldOwnerId) continue;
            if (newOwnerId !== playerId && oldOwnerId !== playerId) continue;

            const dayKey = dateKey(timestamp);
            const day = daily.get(dayKey) || {
                key: dayKey,
                ts: startOfDayTs(timestamp),
                gained: 0,
                lost: 0,
            };

            const village = villages.get(villageId) || fallbackVillage(villageId);
            const baseRow = {
                villageId,
                village,
                timestamp,
                date: new Date(timestamp * 1000),
                oldOwner: playerName(playersById, oldOwnerId),
                newOwner: playerName(playersById, newOwnerId),
            };

            if (newOwnerId === playerId) {
                gained += 1;
                day.gained += 1;
                addOpponent(opponents, oldOwnerId, playersById, "from", village.points);
                rows.push({ ...baseRow, mode: "gain", opponent: baseRow.oldOwner });
            }

            if (oldOwnerId === playerId) {
                lost += 1;
                day.lost += 1;
                addOpponent(opponents, newOwnerId, playersById, "to", village.points);
                rows.push({ ...baseRow, mode: "loss", opponent: baseRow.newOwner });
            }

            daily.set(dayKey, day);
            firstTs = firstTs ? Math.min(firstTs, timestamp) : timestamp;
            lastTs = Math.max(lastTs, timestamp);
        }

        const days = Array.from(daily.values()).sort((a, b) => a.ts - b.ts);
        let runningGained = 0;
        let runningLost = 0;
        const cumulative = days.map((day) => {
            runningGained += day.gained;
            runningLost += day.lost;
            return {
                key: day.key,
                ts: day.ts,
                value: runningGained - runningLost,
                gained: runningGained,
                lost: runningLost,
            };
        });

        return {
            gained,
            lost,
            net: gained - lost,
            firstTs,
            lastTs,
            days,
            cumulative,
            rows: rows.sort((a, b) => b.timestamp - a.timestamp),
            opponents: Array.from(opponents.values())
                .sort((a, b) => (b.from + b.to) - (a.from + a.to)),
        };
    }

    function addOpponent(opponents, id, playersById, key, points) {
        const current = opponents.get(id) || {
            id,
            name: playerName(playersById, id),
            from: 0,
            to: 0,
            points: 0,
        };
        current[key] += 1;
        current.points += Number.isFinite(points) ? points : 0;
        opponents.set(id, current);
    }

    function buildTwStatsLinks(playerId) {
        const world = twStatsWorldKey();
        const base = `https://pt.twstats.com/${encodeURIComponent(world)}/`;
        const profileUrl = `${base}index.php?page=player&id=${encodeURIComponent(playerId)}`;
        const graphs = [
            ["points", "Pontos"],
            ["villages", "Aldeias"],
            ["od", "OD"],
            ["oda", "OD ofensivo"],
            ["odd", "OD defensivo"],
            ["rank", "Rank"],
        ].map(([graph, label]) => ({
            graph,
            label,
            url: `${base}image.php?graph=${encodeURIComponent(graph)}&id=${encodeURIComponent(playerId)}&type=playergraph`,
        }));

        return {
            world,
            profileUrl,
            historyUrl: `${profileUrl}&mode=history`,
            hourlyUrl: `${profileUrl}&mode=history&type=hourly`,
            hourlyUrls: [
                `${profileUrl}&mode=history&type=hourly`,
                `${profileUrl}&mode=history&view=hourly`,
                `${profileUrl}&mode=history&hourly=1`,
                `${profileUrl}&mode=history`,
            ],
            graphs,
        };
    }

    async function initTwStatsBridge() {
        const info = currentTwStatsPageInfo();
        if (!info.playerId || !info.world) return;

        const autoBridge = markAutoTwStatsBridge(info);
        const hourlyHref = findTwStatsHourlyHref(document);
        const hourlyKey = `${APP.id}:twstats-hourly:${info.world}:${info.playerId}`;
        if (hourlyHref && !/hour|hora/i.test(window.location.href) && !sessionStorage.getItem(hourlyKey)) {
            sessionStorage.setItem(hourlyKey, "1");
            window.location.href = hourlyHref;
            return;
        }

        const records = parseTwStatsHistoryRecords(document.documentElement.outerHTML, null);
        if (!records.length) {
            showTwStatsBridgeNotice(0);
            closeAutoTwStatsTab(autoBridge);
            return;
        }

        await gmSetValue(twStatsBridgeKey(info.world, info.playerId), {
            world: info.world,
            playerId: info.playerId,
            href: window.location.href,
            savedAt: Date.now(),
            records: records.slice(-240),
        });

        showTwStatsBridgeNotice(records.length);
        closeAutoTwStatsTab(autoBridge);
    }

    function markAutoTwStatsBridge(info) {
        const key = `${APP.id}:twstats-auto:${info.world}:${info.playerId}`;
        const params = new URLSearchParams(window.location.search);
        if (params.get("tpInfoAuto") === APP.id) {
            try { sessionStorage.setItem(key, "1"); } catch (_) {}
            return true;
        }

        try {
            return sessionStorage.getItem(key) === "1";
        } catch (_) {
            return false;
        }
    }

    function closeAutoTwStatsTab(enabled) {
        if (!enabled) return;
        window.setTimeout(() => {
            try { window.close(); } catch (_) {}
        }, 300);
    }

    function findTwStatsHourlyHref(doc) {
        const link = Array.from(doc.querySelectorAll("a[href]")).find((node) => {
            const text = fold(node.textContent);
            const href = fold(node.getAttribute("href") || "");
            return text.includes("hour") || text.includes("hora") || href.includes("hour") || href.includes("hora");
        });
        if (!link) return "";

        try {
            return new URL(link.getAttribute("href"), window.location.href).href;
        } catch (_) {
            return "";
        }
    }

    function currentTwStatsPageInfo() {
        const params = new URLSearchParams(window.location.search);
        const pathWorld = (window.location.pathname.match(/\/([^/]+)\//) || [])[1] || "";
        if (params.get("page") !== "player") return { world: pathWorld.toLowerCase(), playerId: "" };
        return {
            world: pathWorld.toLowerCase(),
            playerId: /^\d+$/.test(params.get("id") || "") ? params.get("id") : "",
        };
    }

    function showTwStatsBridgeNotice(count) {
        if (document.getElementById(`${APP.id}-twstatsBridge`)) return;
        const notice = document.createElement("div");
        notice.id = `${APP.id}-twstatsBridge`;
        notice.textContent = count
            ? `${APP.displayTitle}: ${count} linhas de historico guardadas. Volta ao Tribal Wars e carrega Atualizar.`
            : `${APP.displayTitle}: nao encontrei linhas de historico nesta pagina TWStats. Confirma se estas no separador Historico do jogador.`;
        notice.style.cssText = [
            "position:fixed",
            "left:12px",
            "bottom:12px",
            "z-index:999999",
            "max-width:520px",
            "padding:8px 10px",
            "border:1px solid #7b201c",
            "background:#fff1bd",
            "color:#7d1713",
            "font:700 12px Verdana,Arial,sans-serif",
            "box-shadow:0 2px 8px rgba(0,0,0,.35)",
        ].join(";");
        document.body.appendChild(notice);
    }

    function twStatsBridgeKey(world, playerId) {
        return `${APP.id}:twstats-hourly-v3:${String(world || "").toLowerCase()}:${playerId}`;
    }

    async function loadTwStatsBaseline(playerId, current, now, periodInfo, force) {
        if (!periodInfo || !Number.isFinite(periodInfo.startMs) || !Number.isFinite(periodInfo.endMs)) {
            return { attempted: false, reason: "period" };
        }

        const links = buildTwStatsLinks(playerId);
        const storedBaseline = force ? null : await loadStoredTwStatsBaseline(links.world, playerId, current, now, periodInfo);
        if (storedBaseline && storedBaseline.snapshot) return storedBaseline;

        const urls = Array.from(new Set([
            ...(links.hourlyUrls || []),
            links.hourlyUrl,
            `${links.profileUrl}&mode=history`,
            links.profileUrl,
        ].filter(Boolean)));
        let lastMessage = "";

        for (const url of urls) {
            try {
                setStatus("A tentar historico horario TWStats...");
                const html = await fetchTwStatsText(url, force);
                const parsed = parseTwStatsBaselineFromHtml(html, current, now, periodInfo);
                if (parsed.snapshot) {
                    return {
                        attempted: true,
                        ok: true,
                        source: "twstats",
                        url,
                        snapshot: parsed.snapshot,
                        currentSnapshot: parsed.currentSnapshot || null,
                        message: parsed.message,
                    };
                }
                lastMessage = parsed.message || lastMessage;
            } catch (error) {
                const message = error && error.message ? error.message : String(error);
                lastMessage = message || lastMessage;
                if (/cloudflare|verificacao|bloque/i.test(message)) continue;
            }
        }

        const openedBaseline = await openTwStatsHistoryAndWait(links, playerId, current, now, periodInfo);
        if (openedBaseline && openedBaseline.snapshot) return openedBaseline;

        return {
            attempted: true,
            ok: false,
            source: "twstats",
            url: links.historyUrl,
            message: lastMessage || "TWStats nao devolveu linhas horarias suficientes para o dia escolhido.",
        };
    }

    async function loadStoredTwStatsBaseline(world, playerId, current, now, periodInfo) {
        const payload = await gmGetValue(twStatsBridgeKey(world, playerId), null);
        if (!payload || !Array.isArray(payload.records) || !payload.records.length) return null;
        const parsed = chooseTwStatsBaselineFromRecords(payload.records, current, now, periodInfo);
        if (!parsed.snapshot) {
            return {
                attempted: true,
                ok: false,
                source: "twstats",
                url: payload.href || "",
                message: `TWStats guardado (${payload.records.length} linhas), sem base utilizavel.`,
            };
        }
        return {
            attempted: true,
            ok: true,
            source: "twstats",
            url: payload.href || "",
            snapshot: parsed.snapshot,
            currentSnapshot: parsed.currentSnapshot || null,
            message: `${parsed.message} Fonte: pagina TWStats aberta no browser.`,
        };
    }

    async function openTwStatsHistoryAndWait(links, playerId, current, now, periodInfo) {
        if (typeof GM_openInTab !== "function" || typeof GM_addValueChangeListener !== "function") return null;

        const key = twStatsBridgeKey(links.world, playerId);
        const url = decorateTwStatsAutoUrl(links.hourlyUrl || links.historyUrl || links.profileUrl);
        const startAt = Date.now();
        let tab = null;

        try {
            setStatus("A abrir historico horario TWStats em segundo plano...");
            tab = GM_openInTab(url, { active: false, insert: true, setParent: true });
        } catch (_) {
            return null;
        }

        try {
            const payload = await waitForTwStatsBridgeValue(key, APP.twStatsBridgeWaitMs, startAt);
            if (!payload || !Array.isArray(payload.records) || !payload.records.length) return null;

            const parsed = chooseTwStatsBaselineFromRecords(payload.records, current, now, periodInfo);
            if (!parsed.snapshot) return null;

            return {
                attempted: true,
                ok: true,
                source: "twstats",
                url: payload.href || url,
                snapshot: parsed.snapshot,
                currentSnapshot: parsed.currentSnapshot || null,
                message: `${parsed.message} Fonte: TWStats aberto automaticamente.`,
            };
        } finally {
            try {
                if (tab && typeof tab.close === "function") tab.close();
            } catch (_) {}
        }
    }

    function decorateTwStatsAutoUrl(url) {
        try {
            const parsed = new URL(url, window.location.href);
            parsed.searchParams.set("tpInfoAuto", APP.id);
            return parsed.href;
        } catch (_) {
            return url;
        }
    }

    function waitForTwStatsBridgeValue(key, timeoutMs, startAt) {
        return new Promise((resolve) => {
            let finished = false;
            let listenerId = null;
            const isFresh = (value) => value &&
                Array.isArray(value.records) &&
                value.records.length &&
                (!Number.isFinite(value.savedAt) || value.savedAt >= startAt - 1000);
            const finish = (value) => {
                if (finished) return;
                finished = true;
                if (listenerId !== null && typeof GM_removeValueChangeListener === "function") {
                    try { GM_removeValueChangeListener(listenerId); } catch (_) {}
                }
                resolve(value || null);
            };

            gmGetValue(key, null).then((value) => {
                if (isFresh(value)) finish(value);
            });

            try {
                listenerId = GM_addValueChangeListener(key, (_name, _oldValue, newValue) => {
                    if (isFresh(newValue)) finish(newValue);
                });
            } catch (_) {}

            window.setTimeout(() => finish(null), timeoutMs);
        });
    }

    async function fetchTwStatsText(url, force) {
        const now = Date.now();
        const key = `twstats:${url}`;
        const cached = state.memoryCache.get(key);
        if (!force && cached && now - cached.time < APP.twStatsCacheMs) return cached.text;

        const text = await requestExternalText(url, APP.twStatsTimeoutMs);
        if (isTwStatsChallenge(text)) {
            throw new Error("TWStats pediu verificacao Cloudflare. Abre o TWStats uma vez no browser e volta a atualizar.");
        }

        state.memoryCache.set(key, { time: now, text });
        return text;
    }

    function requestExternalText(url, timeoutMs) {
        return new Promise((resolve, reject) => {
            const done = (text, status) => {
                if (status && (status < 200 || status >= 300)) {
                    reject(new Error(`TWStats respondeu ${status}.`));
                    return;
                }
                resolve(String(text || ""));
            };

            const fail = (error) => reject(new Error(error && error.message ? error.message : "Nao foi possivel contactar o TWStats."));

            if (typeof GM_xmlhttpRequest === "function") {
                GM_xmlhttpRequest({
                    method: "GET",
                    url,
                    timeout: timeoutMs,
                    anonymous: false,
                    headers: { "Accept": "text/html,application/xhtml+xml,*/*" },
                    onload: (response) => done(response.responseText, response.status),
                    onerror: fail,
                    ontimeout: () => reject(new Error("Tempo esgotado ao contactar o TWStats.")),
                });
                return;
            }

            if (typeof GM !== "undefined" && GM && typeof GM.xmlHttpRequest === "function") {
                GM.xmlHttpRequest({
                    method: "GET",
                    url,
                    timeout: timeoutMs,
                    anonymous: false,
                    headers: { "Accept": "text/html,application/xhtml+xml,*/*" },
                    onload: (response) => done(response.responseText, response.status),
                    onerror: fail,
                    ontimeout: () => reject(new Error("Tempo esgotado ao contactar o TWStats.")),
                });
                return;
            }

            fetch(url, {
                credentials: "include",
                cache: "no-store",
                headers: { "Accept": "text/html,application/xhtml+xml,*/*" },
            })
                .then((response) => {
                    if (!response.ok) throw new Error(`TWStats respondeu ${response.status}.`);
                    return response.text();
                })
                .then(resolve)
                .catch(fail);
        });
    }

    async function gmGetValue(key, fallback) {
        try {
            if (typeof GM_getValue === "function") return GM_getValue(key, fallback);
            if (typeof GM !== "undefined" && GM && typeof GM.getValue === "function") return await GM.getValue(key, fallback);
        } catch (_) {}
        return fallback;
    }

    async function gmSetValue(key, value) {
        try {
            if (typeof GM_setValue === "function") {
                GM_setValue(key, value);
                return true;
            }
            if (typeof GM !== "undefined" && GM && typeof GM.setValue === "function") {
                await GM.setValue(key, value);
                return true;
            }
        } catch (_) {}
        return false;
    }

    function isTwStatsChallenge(text) {
        return /just a moment|cf_chl|cloudflare|enable javascript and cookies/i.test(String(text || ""));
    }

    function parseTwStatsBaselineFromHtml(html, current, now, periodInfo) {
        const records = parseTwStatsHistoryRecords(html, current);
        return chooseTwStatsBaselineFromRecords(records, current, now, periodInfo);
    }

    function chooseTwStatsBaselineFromRecords(records, current, now, periodInfo) {
        const dailyPair = chooseTwStatsDailyDatePair(records, periodInfo);
        if (dailyPair) {
            return {
                snapshot: twStatsRecordToSnapshot(dailyPair.baseline, current),
                currentSnapshot: twStatsRecordToSnapshot(dailyPair.current, current),
                message: `Diario TWStats: ${formatDateOnly(new Date(dailyPair.current.ts))} comparado com ${formatDateOnly(new Date(dailyPair.baseline.ts))} (${records.length} linhas lidas).`,
            };
        }

        const hourlyPair = chooseTwStatsHourlyPair(records, periodInfo);
        if (hourlyPair) {
            return {
                snapshot: twStatsRecordToSnapshot(hourlyPair.baseline, current),
                currentSnapshot: twStatsRecordToSnapshot(hourlyPair.current, current),
                message: `Horario TWStats: ${formatDateTime(new Date(hourlyPair.baseline.ts))} ate ${formatDateTime(new Date(hourlyPair.current.ts))} (${records.length} linhas lidas).`,
            };
        }

        return { snapshot: null, message: `TWStats lido (${records.length} linhas), sem par horario suficiente para ${periodInfo && periodInfo.label ? periodInfo.label : "o periodo"}.` };
    }

    function chooseTwStatsDailyDatePair(records, periodInfo) {
        if (!periodInfo || !Number.isFinite(periodInfo.startMs)) return null;

        const ordered = (records || [])
            .filter((record) => record && Number.isFinite(record.ts))
            .filter((record) => twStatsRecordScore(record) >= 3)
            .sort((a, b) => a.ts - b.ts);
        if (ordered.length < 2 || !recordsLookDaily(ordered)) return null;

        const tolerance = 12 * 60 * 60 * 1000;
        const current = pickTwStatsRecordClosest(ordered, periodInfo.startMs, tolerance);
        const baseline = pickTwStatsRecordClosest(ordered, periodInfo.startMs - APP.dayMs, tolerance);

        if (!baseline || !current || current.ts <= baseline.ts) return null;
        return { baseline, current };
    }

    function recordsLookDaily(records) {
        const ordered = (records || []).filter((record) => record && Number.isFinite(record.ts));
        if (ordered.length < 2) return false;

        const midnightRows = ordered.filter((record) => isLocalDayStart(record.ts)).length;
        if (midnightRows / ordered.length >= 0.8) return true;

        const gaps = [];
        for (let index = 1; index < ordered.length; index += 1) {
            gaps.push(ordered[index].ts - ordered[index - 1].ts);
        }
        const dailyGaps = gaps.filter((gap) => gap >= 18 * 60 * 60 * 1000).length;
        return gaps.length > 0 && dailyGaps / gaps.length >= 0.8;
    }

    function isLocalDayStart(time) {
        const date = new Date(time);
        return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
    }

    function pickTwStatsRecordClosest(records, target, tolerance) {
        return (records || [])
            .map((record) => ({
                record,
                distance: Math.abs(record.ts - target),
            }))
            .filter((item) => item.distance <= tolerance)
            .sort((a, b) => a.distance - b.distance)[0]?.record || null;
    }

    function chooseTwStatsHourlyPair(records, periodInfo) {
        if (!periodInfo || !Number.isFinite(periodInfo.startMs) || !Number.isFinite(periodInfo.endMs)) return null;

        const ordered = (records || [])
            .filter((record) => record && Number.isFinite(record.ts))
            .filter((record) => record.ts <= periodInfo.endMs + 90 * 60 * 1000)
            .filter((record) => twStatsRecordScore(record) >= 3)
            .sort((a, b) => a.ts - b.ts);
        if (ordered.length < 2) return null;

        const startTolerance = 6 * 60 * 60 * 1000;
        const endTolerance = 6 * 60 * 60 * 1000;
        const baseline = pickTwStatsRecordNear(ordered, periodInfo.startMs, startTolerance, "start");
        const current = pickTwStatsRecordNear(ordered, periodInfo.endMs, endTolerance, "end");

        if (!baseline || !current || current.ts <= baseline.ts) return null;
        return { baseline, current };
    }

    function pickTwStatsRecordNear(records, target, tolerance, mode) {
        const preferBefore = mode === "start" || mode === "end";
        const directional = records
            .filter((record) => preferBefore ? record.ts <= target : true)
            .map((record) => ({
                record,
                distance: Math.abs(record.ts - target),
                before: target - record.ts,
            }))
            .filter((item) => item.distance <= tolerance)
            .sort((a, b) => a.distance - b.distance || Math.abs(a.before) - Math.abs(b.before));
        if (directional.length) return directional[0].record;

        return records
            .map((record) => ({
                record,
                distance: Math.abs(record.ts - target),
            }))
            .filter((item) => item.distance <= tolerance)
            .sort((a, b) => a.distance - b.distance)[0]?.record || null;
    }

    function chooseTwStatsDailyPair(records, now, periodHours) {
        if (periodHours !== 24) return null;

        const ordered = (records || [])
            .filter((record) => record && Number.isFinite(record.ts))
            .filter((record) => record.ts <= now + APP.dayMs)
            .filter((record) => twStatsRecordScore(record) >= 3)
            .sort((a, b) => a.ts - b.ts);
        if (ordered.length < 2) return null;

        const latest = ordered[ordered.length - 1];
        const target = latest.ts - periodToMs(periodHours);
        const baseline = ordered
            .slice(0, -1)
            .map((record) => ({
                record,
                distance: Math.abs(record.ts - target),
            }))
            .filter((item) => item.distance <= APP.twStatsBaselineToleranceMs)
            .sort((a, b) => a.distance - b.distance)[0];

        if (!baseline) return null;
        return {
            current: latest,
            baseline: baseline.record,
        };
    }

    function twStatsRecordScore(record) {
        return ["points", "villages", "rank", "odTotal", "odOff", "odDef", "odSupport"]
            .reduce((count, key) => count + (Number.isFinite(record && record[key]) ? 1 : 0), 0);
    }

    function twStatsRecordToSnapshot(record, current) {
        const total = twStatsOdEntry(record.odTotal);
        const off = twStatsOdEntry(record.odOff);
        const def = twStatsOdEntry(record.odDef);
        const support = twStatsOdEntry(record.odSupport) || twStatsOdEntry(deriveSupportScore(total, off, def));

        return {
            ts: record.ts,
            playerId: current && current.playerId,
            name: current && current.name,
            points: Number.isFinite(record.points) ? record.points : (current && current.points),
            villages: Number.isFinite(record.villages) ? record.villages : (current && current.villages),
            rank: Number.isFinite(record.rank) ? record.rank : (current && current.rank),
            od: {
                total,
                off,
                def,
                support,
            },
            source: "twstats",
        };
    }

    function mergeTwStatsCurrent(current, snapshot) {
        if (!snapshot) return current;
        return {
            ...current,
            points: Number.isFinite(snapshot.points) ? snapshot.points : current.points,
            villages: Number.isFinite(snapshot.villages) ? snapshot.villages : current.villages,
            rank: Number.isFinite(snapshot.rank) ? snapshot.rank : current.rank,
            od: {
                total: snapshot.od && snapshot.od.total ? snapshot.od.total : current.od.total,
                off: snapshot.od && snapshot.od.off ? snapshot.od.off : current.od.off,
                def: snapshot.od && snapshot.od.def ? snapshot.od.def : current.od.def,
                support: snapshot.od && snapshot.od.support ? snapshot.od.support : current.od.support,
            },
            source: "twstats",
        };
    }

    function twStatsOdEntry(score) {
        return Number.isFinite(score) ? { score, rank: null } : null;
    }

    function parseTwStatsHistoryRecords(html, current) {
        const records = [];
        const doc = new DOMParser().parseFromString(String(html || ""), "text/html");

        Array.from(doc.querySelectorAll("table")).forEach((table) => {
            let headers = [];
            Array.from(table.querySelectorAll("tr")).forEach((row) => {
                const headerCells = Array.from(row.querySelectorAll("th"));
                const cells = Array.from(row.querySelectorAll("th,td"));
                const texts = cells.map((cell) => cleanText(cell.textContent));
                if (!texts.length) return;

                const rowDate = parseTwStatsDate(texts.join(" "));
                if (!rowDate) {
                    const possibleHeaders = texts.filter(Boolean);
                    if (possibleHeaders.some((text) => twStatsHeaderKey(text))) headers = possibleHeaders;
                    return;
                }

                const values = extractTwStatsValues(headers, texts, current);
                if (hasTwStatsValue(values)) {
                    records.push({
                        ts: rowDate,
                        ...values,
                    });
                }
            });
        });

        if (!records.length) {
            records.push(...parseTwStatsLooseRecords(doc, current));
        }

        return records
            .filter((record, index, list) => list.findIndex((item) => item.ts === record.ts) === index)
            .sort((a, b) => a.ts - b.ts);
    }

    function parseTwStatsLooseRecords(doc, current) {
        const records = [];
        const nodes = Array.from(doc.querySelectorAll("tr, li, p, div"));
        nodes.forEach((node) => {
            const text = cleanText(node.textContent);
            if (!text || text.length < 12) return;

            const rowDate = parseTwStatsDate(text);
            if (!rowDate) return;

            const values = inferTwStatsValues([text], current);
            if (hasTwStatsValue(values)) {
                records.push({
                    ts: rowDate,
                    ...values,
                });
            }
        });
        return records;
    }

    function extractTwStatsValues(headers, texts, current) {
        const values = {};
        const aligned = headers && headers.length === texts.length ? headers : [];
        if (aligned.length) {
            texts.forEach((text, index) => {
                const key = twStatsHeaderKey(aligned[index]);
                const value = parseTwStatsCellNumber(key, text);
                if (key && Number.isFinite(value)) values[key] = value;
            });
        }

        if (!hasTwStatsValue(values)) {
            return inferTwStatsValues(texts, current);
        }

        return values;
    }

    function parseTwStatsCellNumber(key, text) {
        const value = parseTwStatsNumber(text);
        if (Number.isFinite(value)) return value;

        const raw = cleanText(text);
        if (/^[-=]+$/.test(raw) && /^od/.test(String(key || ""))) return 0;
        return null;
    }

    function inferTwStatsValues(texts, current) {
        const numbers = texts
            .flatMap((text) => {
                const values = parseTwStatsNumbers(text);
                if (parseTwStatsDate(text) && values.length <= 3) return [];
                return values;
            });
        const values = {};
        const used = new Set();

        values.points = pickClosestNumber(numbers, current && current.points, used);
        values.villages = pickClosestNumber(numbers, current && current.villages, used);
        values.rank = pickClosestNumber(numbers, current && current.rank, used);
        values.odTotal = pickClosestNumber(numbers, current && current.od && current.od.total && current.od.total.score, used);
        values.odOff = pickClosestNumber(numbers, current && current.od && current.od.off && current.od.off.score, used);
        values.odDef = pickClosestNumber(numbers, current && current.od && current.od.def && current.od.def.score, used);
        values.odSupport = pickClosestNumber(numbers, current && current.od && current.od.support && current.od.support.score, used);

        Object.keys(values).forEach((key) => {
            if (!Number.isFinite(values[key])) delete values[key];
        });
        return values;
    }

    function pickClosestNumber(numbers, target, used) {
        if (!Number.isFinite(target)) return null;
        let bestIndex = -1;
        let bestDistance = Infinity;
        numbers.forEach((value, index) => {
            if (used.has(index) || !Number.isFinite(value)) return;
            const distance = Math.abs(value - target);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = index;
            }
        });
        if (bestIndex < 0) return null;
        used.add(bestIndex);
        return numbers[bestIndex];
    }

    function hasTwStatsValue(values) {
        return !!values && ["points", "villages", "rank", "odTotal", "odOff", "odDef", "odSupport"]
            .some((key) => Number.isFinite(values[key]));
    }

    function twStatsHeaderKey(header) {
        const text = fold(header);
        if (!text) return "";
        if (text === "data" || text === "date" || text.includes("jogador") || text.includes("player") || text.includes("tribo") || text.includes("tribe")) return "";
        if (text.includes("pontos") || text === "points" || text.includes("score")) return "points";
        if (text.includes("aldeias") || text.includes("villages") || text === "vills" || text === "vill") return "villages";
        if (text.includes("rank") || text.includes("ranking") || text.includes("classificacao") || text.includes("posicao")) return "rank";
        if (text === "oda" || text.startsWith("oda ") || text.includes("od ataque") || text.includes("od ofens") || text.includes("ofensivo") || text.includes("atacante") || text.includes("attacker") || text.includes("offensive") || text.includes("attack")) return "odOff";
        if (text === "odd" || text.startsWith("odd ") || text.includes("od defesa") || text.includes("od defens") || text.includes("defensivo") || text.includes("defensor") || text.includes("defender") || text.includes("defensive")) return "odDef";
        if (text === "ods" || text.includes("od apoio") || text.includes("apoio") || text.includes("support")) return "odSupport";
        if (text === "od" || text.startsWith("od ") || text.includes("od total") || text.includes("bash") || text.includes("oponentes") || text.includes("derrotados") || text.includes("total od")) return "odTotal";
        return "";
    }

    function parseTwStatsDate(text) {
        const value = cleanText(text);
        let match = value.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[,\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (match) return buildLocalTime(+match[1], +match[2], +match[3], +match[4] || 0, +match[5] || 0, +match[6] || 0);

        match = value.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (match) {
            let year = +match[3];
            if (year < 100) year += year < 70 ? 2000 : 1900;
            return buildLocalTime(year, +match[2], +match[1], +match[4] || 0, +match[5] || 0, +match[6] || 0);
        }

        match = value.match(/(\d{1,2})[-/.](\d{1,2})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (match) {
            const year = new Date().getFullYear();
            return normalizeTwStatsTime(buildLocalTime(year, +match[2], +match[1], +match[3] || 0, +match[4] || 0, +match[5] || 0));
        }

        const folded = fold(value);
        match = folded.match(/(\d{1,2})\s+([a-z]+)\s+(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (match) {
            const month = twStatsMonthNumber(match[2]);
            if (!month) return null;
            let year = +match[3];
            if (year < 100) year += year < 70 ? 2000 : 1900;
            return buildLocalTime(year, month, +match[1], +match[4] || 0, +match[5] || 0, +match[6] || 0);
        }

        match = folded.match(/(\d{1,2})\s+([a-z]+)(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (match) {
            const month = twStatsMonthNumber(match[2]);
            if (!month) return null;
            const year = new Date().getFullYear();
            return normalizeTwStatsTime(buildLocalTime(year, month, +match[1], +match[3] || 0, +match[4] || 0, +match[5] || 0));
        }

        match = folded.match(/([a-z]+)\s+(\d{1,2}),?\s+(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (!match) return null;
        const month = twStatsMonthNumber(match[1]);
        if (!month) return null;
        let year = +match[3];
        if (year < 100) year += year < 70 ? 2000 : 1900;
        return buildLocalTime(year, month, +match[2], +match[4] || 0, +match[5] || 0, +match[6] || 0);
    }

    function normalizeTwStatsTime(time) {
        if (!Number.isFinite(time)) return null;
        const now = Date.now();
        if (time > now + APP.dayMs) {
            const date = new Date(time);
            date.setFullYear(date.getFullYear() - 1);
            return date.getTime();
        }
        return time;
    }

    function twStatsMonthNumber(monthText) {
        const key = fold(monthText).slice(0, 3);
        return {
            jan: 1,
            fev: 2,
            feb: 2,
            mar: 3,
            abr: 4,
            apr: 4,
            mai: 5,
            may: 5,
            jun: 6,
            jul: 7,
            ago: 8,
            aug: 8,
            set: 9,
            sep: 9,
            out: 10,
            oct: 10,
            nov: 11,
            dez: 12,
            dec: 12,
        }[key] || null;
    }

    function buildLocalTime(year, month, day, hour, minute, second) {
        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
        const date = new Date(year, month - 1, day, hour, minute, second);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
        const time = date.getTime();
        return Number.isFinite(time) ? time : null;
    }

    function parseTwStatsNumber(text) {
        const numbers = parseTwStatsNumbers(text);
        return numbers.length ? numbers[0] : null;
    }

    function parseTwStatsNumbers(text) {
        const raw = cleanText(text);
        const matches = raw.match(/[+-]?\d[\d.,]*(?:\s*[kKmM])?/g) || [];
        return matches
            .map((match) => parseTwStatsNumberToken(match))
            .filter(Number.isFinite);
    }

    function parseTwStatsNumberToken(token) {
        const raw = cleanText(token);
        const multiplier = /\d\s*k\b/i.test(raw) ? 1000 : (/\d\s*m\b/i.test(raw) ? 1000000 : 1);
        let value = raw.replace(/[^\d,.]/g, "");
        if (!/[0-9]/.test(value)) return null;
        value = value
            .replace(/[.,](?=\d{3}(?:\D|$))/g, "")
            .replace(/,/g, ".");
        const number = multiplier > 1 ? Number.parseFloat(value) * multiplier : Number.parseInt(value, 10);
        return Number.isFinite(number) ? Math.round(number) : null;
    }

    function twStatsWorldKey() {
        const hostPart = window.location.hostname.split(".")[0].toLowerCase();
        if (/^[a-z]{2}(?:p|c)?\d+$/i.test(hostPart)) return hostPart;

        const gameData = pageGameData();
        const world = String(gameData.world || "").toLowerCase();
        if (/^[a-z]{2}(?:p|c)?\d+$/i.test(world)) return world;
        return hostPart || "en1";
    }

    function fallbackVillage(id) {
        return {
            id,
            name: `Aldeia #${id}`,
            x: 0,
            y: 0,
            coords: "-",
            playerId: 0,
            points: 0,
        };
    }

    function playerName(playersById, id) {
        const player = playersById.get(id);
        if (player) return player.name;
        if (id === 0) return "Barbaros";
        return `Jogador #${id}`;
    }

    function buildDiffs(current, baseline) {
        if (!baseline) {
            return {
                points: null,
                villages: null,
                rank: null,
                od: {
                    total: null,
                    off: null,
                    def: null,
                    support: null,
                },
            };
        }

        return {
            points: diffNumber(current.points, baseline.points),
            villages: diffNumber(current.villages, baseline.villages),
            rank: diffNumber(current.rank, baseline.rank),
            od: {
                total: diffScore(current.od.total, baseline.od && baseline.od.total),
                off: diffScore(current.od.off, baseline.od && baseline.od.off),
                def: diffScore(current.od.def, baseline.od && baseline.od.def),
                support: diffScore(current.od.support, baseline.od && baseline.od.support),
            },
        };
    }

    function buildPrecisionInfo(now, periodHours, baseline, conquests, todayConquests, externalBaseline, localBaseline) {
        const targetAgeMs = periodToMs(periodHours);
        const baselineAgeMs = baseline && Number.isFinite(baseline.ts) ? now - baseline.ts : null;
        const offsetMs = baselineAgeMs === null ? null : baselineAgeMs - targetAgeMs;
        return {
            periodHours,
            baselineSource: baseline && baseline.source ? baseline.source : (baseline ? "local" : ""),
            baselineTs: baseline && Number.isFinite(baseline.ts) ? baseline.ts : null,
            baselineAgeMs,
            baselineOffsetMs: offsetMs,
            baselineExact: offsetMs !== null && Math.abs(offsetMs) <= APP.minSnapshotGapMs,
            hasBaseline: !!baseline,
            externalAttempted: !!(externalBaseline && externalBaseline.attempted),
            externalOk: !!(externalBaseline && externalBaseline.ok),
            externalMessage: externalBaseline && externalBaseline.message ? externalBaseline.message : "",
            externalUrl: externalBaseline && externalBaseline.url ? externalBaseline.url : "",
            localFallback: !!(baseline && localBaseline && baseline === localBaseline && externalBaseline && externalBaseline.attempted && !externalBaseline.ok),
            conquestsExact: true,
            conquestsRows: (conquests && conquests.gained ? conquests.gained.length : 0) + (conquests && conquests.lost ? conquests.lost.length : 0),
            todayConquestsExact: true,
            todayConquestsRows: (todayConquests && todayConquests.gained ? todayConquests.gained.length : 0) + (todayConquests && todayConquests.lost ? todayConquests.lost.length : 0),
        };
    }

    function diffNumber(current, previous) {
        if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
        return current - previous;
    }

    function diffScore(current, previous) {
        if (!current || !previous) return null;
        if (!Number.isFinite(current.score) || !Number.isFinite(previous.score)) return null;
        return current.score - previous.score;
    }

    function chooseBaseline(history, now, periodHours) {
        const target = now - periodToMs(periodHours);
        const candidates = history
            .filter((snapshot) => snapshot && Number.isFinite(snapshot.ts) && snapshot.ts < now - APP.minSnapshotGapMs)
            .map((snapshot) => ({
                snapshot,
                distance: Math.abs(snapshot.ts - target),
                age: now - snapshot.ts,
            }))
            .filter((item) => item.distance <= APP.baselineToleranceMs)
            .sort((a, b) => a.distance - b.distance);

        return candidates[0] ? candidates[0].snapshot : null;
    }

    function mergeBaselineHistory(snapshots, dailySnapshots) {
        const byTime = new Map();
        (snapshots || []).forEach((snapshot) => {
            if (snapshot && Number.isFinite(snapshot.ts)) byTime.set(snapshot.ts, snapshot);
        });
        (dailySnapshots || []).forEach((entry) => {
            if (entry && Number.isFinite(entry.ts)) byTime.set(entry.ts, dailyEntryToSnapshot(entry));
        });
        return Array.from(byTime.values()).sort((a, b) => a.ts - b.ts);
    }

    function dailyEntryToSnapshot(entry) {
        return {
            ts: entry.ts,
            playerId: entry.playerId,
            name: entry.name,
            points: entry.points,
            villages: entry.villages,
            rank: entry.rank,
            od: entry.od || {},
        };
    }

    function loadSnapshots(playerId) {
        try {
            const raw = window.localStorage.getItem(snapshotKey(playerId));
            const parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((snapshot) => snapshot && Number.isFinite(snapshot.ts))
                .sort((a, b) => a.ts - b.ts);
        } catch (_) {
            return [];
        }
    }

    function saveSnapshot(snapshot) {
        const key = snapshotKey(snapshot.playerId);
        const now = snapshot.ts;
        let history = loadSnapshots(snapshot.playerId)
            .filter((item) => now - item.ts <= APP.snapshotRetentionMs);

        const recentIndex = history.findIndex((item) => Math.abs(item.ts - snapshot.ts) < APP.minSnapshotGapMs);
        if (recentIndex >= 0) {
            history[recentIndex] = snapshot;
        } else {
            history.push(snapshot);
        }

        history = history
            .sort((a, b) => a.ts - b.ts)
            .slice(-APP.maxSnapshotsPerPlayer);

        try {
            window.localStorage.setItem(key, JSON.stringify(history));
        } catch (_) {
            // Se o armazenamento estiver cheio, o resumo atual continua a funcionar.
        }
    }

    function snapshotKey(playerId) {
        return `${APP.id}:snapshots:${window.location.host}:${playerId}`;
    }

    function loadDailySnapshots(playerId) {
        try {
            const raw = window.localStorage.getItem(dailySnapshotKey(playerId));
            const parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((snapshot) => snapshot && snapshot.day && Number.isFinite(snapshot.ts))
                .sort((a, b) => a.ts - b.ts);
        } catch (_) {
            return [];
        }
    }

    function saveDailySnapshot(snapshot) {
        const key = dailySnapshotKey(snapshot.playerId);
        const now = snapshot.ts;
        const entry = snapshotToDailyEntry(snapshot);
        const byDay = new Map(loadDailySnapshots(snapshot.playerId)
            .filter((item) => now - item.ts <= APP.dailySnapshotRetentionMs)
            .map((item) => [item.day, item]));

        byDay.set(entry.day, entry);

        const values = Array.from(byDay.values()).sort((a, b) => a.ts - b.ts);

        try {
            window.localStorage.setItem(key, JSON.stringify(values));
        } catch (_) {
            try {
                window.localStorage.setItem(key, JSON.stringify(values.map(compactStoredDailyEntry)));
            } catch (_) {
                // O resumo atual continua funcional mesmo sem historico diario local.
            }
        }
    }

    function compactStoredDailyEntry(entry) {
        return {
            ...entry,
            villagesArchive: entry.villagesArchive ? {
                count: entry.villagesArchive.count,
                coords: entry.villagesArchive.coords,
                continents: entry.villagesArchive.continents,
                rows: [],
            } : null,
            conquestsDay: entry.conquestsDay ? {
                gained: entry.conquestsDay.gained,
                lost: entry.conquestsDay.lost,
                net: entry.conquestsDay.net,
                rows: (entry.conquestsDay.rows || []).slice(0, 20),
            } : null,
        };
    }

    function buildDailyStats(history, current) {
        const byDay = new Map((history || []).map((entry) => [entry.day, entry]));
        byDay.set(dayKeyFromMs(current.ts), snapshotToDailyEntry(current));

        const rows = Array.from(byDay.values())
            .sort((a, b) => a.ts - b.ts)
            .map((entry, index, list) => dailyRowWithDiff(entry, list[index - 1] || null));

        return {
            today: rows[rows.length - 1] || null,
            rows: rows.slice(-45).reverse(),
        };
    }

    function dailyRowWithDiff(entry, previous) {
        return {
            day: entry.day,
            ts: entry.ts,
            points: entry.points,
            villages: entry.villages,
            rank: entry.rank,
            tribe: entry.tribe || {},
            od: entry.od || {},
            metrics: entry.metrics || {},
            villagesArchive: entry.villagesArchive || null,
            conquestsDay: entry.conquestsDay || null,
            allTimeSummary: entry.allTimeSummary || null,
            precision: {
                previousTs: previous && Number.isFinite(previous.ts) ? previous.ts : null,
                gapMs: previous && Number.isFinite(previous.ts) ? entry.ts - previous.ts : null,
                exactDay: previous && Number.isFinite(previous.ts) ? Math.abs((entry.ts - previous.ts) - APP.dayMs) <= APP.baselineToleranceMs : false,
            },
            diff: {
                points: previous ? diffNumber(entry.points, previous.points) : null,
                villages: previous ? diffNumber(entry.villages, previous.villages) : null,
                rank: previous ? diffNumber(entry.rank, previous.rank) : null,
                od: {
                    total: previous ? diffScore(entry.od && entry.od.total, previous.od && previous.od.total) : null,
                    off: previous ? diffScore(entry.od && entry.od.off, previous.od && previous.od.off) : null,
                    def: previous ? diffScore(entry.od && entry.od.def, previous.od && previous.od.def) : null,
                    support: previous ? diffScore(entry.od && entry.od.support, previous.od && previous.od.support) : null,
                },
            },
        };
    }

    function snapshotToDailyEntry(snapshot) {
        return {
            day: dayKeyFromMs(snapshot.ts),
            ts: snapshot.ts,
            playerId: snapshot.playerId,
            name: snapshot.name,
            tribe: snapshot.tribe || {},
            points: snapshot.points,
            villages: snapshot.villages,
            rank: snapshot.rank,
            od: snapshot.od || {},
            metrics: snapshot.metrics || {},
            villagesArchive: snapshot.villagesArchive || null,
            conquestsDay: snapshot.conquestsDay || null,
            allTimeSummary: snapshot.allTimeSummary || null,
        };
    }

    function dailySnapshotKey(playerId) {
        return `${APP.id}:daily:${window.location.host}:${playerId}`;
    }

    function renderResult(result) {
        const summaryContent = `
            <div class="${APP.id}-playerHead">
                <div>
                    <a href="/game.php?screen=info_player&id=${result.player.id}" target="_blank" rel="noopener">${escapeHTML(result.player.name)}</a>
                    <span>#${result.player.id} - ${escapeHTML(result.period.label)} - Tribo: ${escapeHTML(result.player.tribe && result.player.tribe.tag ? result.player.tribe.tag : "-")}</span>
                </div>
                <small class="${APP.id}-sourceBadge" title="${escapeHTML(baselineStatusTitle(result.precision))}">${escapeHTML(baselineStatusLabel(result.precision))}</small>
            </div>

            <div class="${APP.id}-grid ${APP.id}-summaryGrid">
                ${metricCard("Pontos", formatNumber(result.current.points), result.diffs.points)}
                ${metricCard("Aldeias", formatNumber(result.current.villages), result.diffs.villages)}
                ${metricCard("Rank", `#${formatNumber(result.current.rank)}`, result.diffs.rank, true)}
                ${metricCard("Ganhas / Perdidas", `${formatNumber(result.conquests.gained.length)} / ${formatNumber(result.conquests.lost.length)}`, result.conquests.net)}
                ${metricCard("OD Total", formatNumber(result.current.od.total && result.current.od.total.score), result.diffs.od.total)}
                ${metricCard("OD Ofensivo", formatNumber(result.current.od.off && result.current.od.off.score), result.diffs.od.off)}
                ${metricCard("OD Defensivo", formatNumber(result.current.od.def && result.current.od.def.score), result.diffs.od.def)}
                ${metricCard("OD Apoio", formatNumber(result.current.od.support && result.current.od.support.score), result.diffs.od.support)}
            </div>
        `;

        const odContent = `
            <div class="${APP.id}-tableWrap">
                <table class="${APP.id}-table ${APP.id}-odTable">
                    <thead>
                        <tr>
                            <th>TIPO</th>
                            <th>PONTOS</th>
                            <th>RANK</th>
                            <th>${escapeHTML(result.period.shortLabel)}</th>
                        </tr>
                    </thead>
                    <tbody>
                    ${odRow("Total", result.current.od.total, result.diffs.od.total)}
                    ${odRow("Ofensivo", result.current.od.off, result.diffs.od.off)}
                    ${odRow("Defensivo", result.current.od.def, result.diffs.od.def)}
                    ${odRow("Apoio", result.current.od.support, result.diffs.od.support)}
                    </tbody>
                </table>
                </div>
        `;

        state.controls.body.innerHTML = `
            ${panelRow("RESUMO", `Totais do periodo selecionado: ${result.period.label}.`, summaryContent, "summaryRow", true)}
            ${panelRow("ALDEIAS", "Coordenadas atuais do jogador, todas e por continente.", renderVillageCoordinates(result.villagesSummary), "villagesRow", false)}
            ${panelRow("MUNDO", "Stats desde o inicio do mundo pelo historico publico de conquistas.", renderAllTimeStats(result.allTime), "worldStatsRow", false)}
            ${panelRow("TWSTATS", "Graficos historicos externos, quando o mundo existe no TWStats.", renderTwStatsGraphs(result.twstats), "chartsRow", false)}
            ${panelRow("OD", "Pontos ofensivos, defensivos e apoio.", odContent, "odSectionRow", false)}
            ${panelRow("CONQUISTAS", `Aldeias ganhas e perdidas em ${result.period.label}.`, renderConquestTable(result.conquests.gained, result.conquests.lost, result.period.label), "resultsRow", false)}
        `;
    }

    function panelRow(title, description, content, className, expanded) {
        const isExpanded = expanded ? "true" : "false";
        return `
            <section class="${APP.id}-panelRow ${APP.id}-${className || "row"} ${expanded ? `${APP.id}-panelRowOpen` : ""}" data-${APP.id}-row>
                <aside class="${APP.id}-rowLabel">
                    <strong>${sectionIcon(title)}<span>${escapeHTML(title)}</span></strong>
                    <span>${escapeHTML(description)}</span>
                </aside>
                <div class="${APP.id}-rowContent">
                    <button type="button" class="${APP.id}-sectionToggle" data-${APP.id}-toggle aria-expanded="${isExpanded}" aria-label="${expanded ? "Esconder detalhes" : "Mostrar detalhes"}" title="${expanded ? "Esconder detalhes" : "Mostrar detalhes"}">
                        ${expanded ? "-" : "+"}
                    </button>
                    <div class="${APP.id}-sectionContent">
                        ${content}
                    </div>
                </div>
            </section>
        `;
    }

    function renderPrecisionNotice(precision) {
        if (!precision) return "";
        const sourceText = precision.baselineSource === "twstats" ? "historico TWStats" : "snapshot local";
        const baselineText = precision.hasBaseline
            ? `Pontos/rank/OD comparados com ${sourceText} de ${formatDuration(precision.baselineAgeMs)} atras (${formatOffset(precision.baselineOffsetMs)} do alvo).`
            : "Pontos/rank/OD sem historico TWStats suficiente para comparar este periodo.";
        const externalText = precision.externalAttempted && precision.externalMessage
            ? `<span>${escapeHTML(precision.externalMessage)}</span>`
            : "";
        const fallbackText = precision.localFallback
            ? `<span>TWStats indisponivel; foi usado fallback local guardado pelo script.</span>`
            : "";
        return `
            <div class="${APP.id}-precisionBox">
                <strong>Precisao dos dados</strong>
                <span>Conquistas: exatas por timestamp do /map/conquer.txt completo.</span>
                <span>${escapeHTML(baselineText)}</span>
                ${externalText}
                ${fallbackText}
            </div>
        `;
    }

    function baselineStatusLabel(precision) {
        if (!precision || !precision.hasBaseline) {
            if (precision && precision.externalMessage) {
                const lines = String(precision.externalMessage).match(/TWStats lido \((\d+) linhas\)/i);
                if (lines) return `TWStats ${lines[1]} linhas`;
                if (/cloudflare|verificacao/i.test(precision.externalMessage)) return "TWStats bloqueado";
                if (/tempo esgotado|contactar/i.test(precision.externalMessage)) return "TWStats erro";
            }
            return "sem base TWStats";
        }
        if (precision.baselineSource === "twstats") {
            if (/horario twstats/i.test(precision.externalMessage || "")) return "TWStats horario";
            if (/diario twstats/i.test(precision.externalMessage || "")) return "TWStats diario";
            return "TWStats";
        }
        if (precision.localFallback) return "fallback local";
        return "local";
    }

    function baselineStatusTitle(precision) {
        if (!precision) return "Sem informacao de origem para o periodo selecionado.";
        if (precision.baselineSource === "twstats") return precision.externalMessage || "Dados do periodo selecionado calculados pelo historico TWStats.";
        if (precision.localFallback) return precision.externalMessage || "TWStats indisponivel; usado fallback local.";
        return precision.externalMessage || "Sem linha utilizavel do historico TWStats para o periodo selecionado.";
    }

    function formatOffset(ms) {
        if (!Number.isFinite(ms)) return "sem desvio calculado";
        if (Math.abs(ms) < 60000) return "sem desvio";
        const text = formatDuration(Math.abs(ms));
        return ms > 0 ? `+${text}` : `-${text}`;
    }

    function sectionIcon(title) {
        const icons = {
            jogador: "&#9817;",
            resumo: "&#9638;",
            aldeias: "&#8962;",
            mundo: "&#9673;",
            twstats: "TW",
            od: "OD",
            conquistas: "&#9873;",
            acoes: "&#10003;",
        };
        const key = fold(title);
        return `<span class="${APP.id}-sectionIcon" aria-hidden="true">${icons[key] || "&#9632;"}</span>`;
    }

    function togglePanelRow(button) {
        const row = button.closest(`[data-${APP.id}-row]`);
        if (!row) return;

        const open = !row.classList.contains(`${APP.id}-panelRowOpen`);
        row.classList.toggle(`${APP.id}-panelRowOpen`, open);
        button.setAttribute("aria-expanded", open ? "true" : "false");
        button.setAttribute("aria-label", open ? "Esconder detalhes" : "Mostrar detalhes");
        button.title = open ? "Esconder detalhes" : "Mostrar detalhes";
        button.textContent = open ? "-" : "+";
    }

    function renderDailyArchive(rows) {
        if (!rows || !rows.length) {
            return `<div class="${APP.id}-emptyList">Ainda nao existe arquivo diario para este jogador.</div>`;
        }

        const latest = rows[0];
        const latestArchive = latest && latest.villagesArchive ? latest.villagesArchive : null;
        return `
            <div class="${APP.id}-archiveActions">
                <button type="button" data-${APP.id}-export="json">Exportar JSON</button>
                <button type="button" data-${APP.id}-export="csv">Exportar CSV</button>
                <span>${formatNumber(rows.length)} registos diarios guardados</span>
            </div>
            <div class="${APP.id}-tableWrap ${APP.id}-archiveWrap">
                <table class="${APP.id}-table ${APP.id}-archiveTable">
                    <thead>
                        <tr>
                            <th>DIA</th>
                            <th>BASE</th>
                            <th>TRIBO</th>
                            <th>PONTOS</th>
                            <th>+PTS</th>
                            <th>ALD</th>
                            <th>RANK</th>
                            <th>OD</th>
                            <th>OD OF</th>
                            <th>OD DEF</th>
                            <th>OD APOIO</th>
                            <th>G/P DIA</th>
                            <th>MEDIA ALD</th>
                            <th>OD/PTS</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => `
                            <tr>
                                <td>${escapeHTML(formatDateOnly(new Date(row.ts)))}</td>
                                <td>${escapeHTML(formatDailyPrecision(row.precision))}</td>
                                <td>${escapeHTML(row.tribe && row.tribe.tag ? row.tribe.tag : "-")}</td>
                                <td>${formatNumber(row.points)}</td>
                                <td><em class="${deltaClass(row.diff.points, false)}">${escapeHTML(formatDelta(row.diff.points))}</em></td>
                                <td>${formatNumber(row.villages)}</td>
                                <td>#${formatNumber(row.rank)}</td>
                                <td>${formatNumber(row.metrics && row.metrics.odTotal)}</td>
                                <td>${formatNumber(row.metrics && row.metrics.odOff)}</td>
                                <td>${formatNumber(row.metrics && row.metrics.odDef)}</td>
                                <td>${formatNumber(row.metrics && row.metrics.odSupport)}</td>
                                <td>${formatNumber(row.conquestsDay && row.conquestsDay.gained)} / ${formatNumber(row.conquestsDay && row.conquestsDay.lost)}</td>
                                <td>${formatNumber(row.metrics && row.metrics.averageVillagePoints)}</td>
                                <td>${formatMetric(row.metrics && row.metrics.odPerPoint)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
            ${renderLatestArchiveDetails(latestArchive)}
        `;
    }

    function renderLatestArchiveDetails(archive) {
        if (!archive || !archive.continents || !archive.continents.length) return "";
        return `
            <div class="${APP.id}-archiveDetails">
                <label class="${APP.id}-coordsField ${APP.id}-coordsAll">
                    <span>Ultimo registo - todas as coordenadas (${formatNumber(archive.count)})</span>
                    <textarea readonly rows="3">${escapeTextArea((archive.coords || []).join(" "))}</textarea>
                </label>
                <div class="${APP.id}-continentGrid">
                    ${archive.continents.map((group) => `
                        <label class="${APP.id}-coordsField">
                            <span>${escapeHTML(group.continent)} (${formatNumber(group.count)}) - ${formatNumber(group.points)} pts</span>
                            <textarea readonly rows="3">${escapeTextArea((group.coords || []).join(" "))}</textarea>
                        </label>
                    `).join("")}
                </div>
            </div>
        `;
    }

    function formatDailyPrecision(precision) {
        if (!precision || !Number.isFinite(precision.gapMs)) return "N/D";
        return `${formatDuration(precision.gapMs)}${precision.exactDay ? "" : "*"}`;
    }

    function exportDailyArchive(format) {
        if (!state.lastResult || !state.lastResult.player) {
            showNotice("Carrega primeiro um jogador para exportar o arquivo.", "warn");
            return;
        }

        const player = state.lastResult.player;
        const entries = loadDailySnapshots(player.id);
        if (!entries.length) {
            showNotice("Ainda nao existe arquivo diario para exportar.", "warn");
            return;
        }

        const safeName = String(player.name || player.id).replace(/[^\w.-]+/g, "_");
        if (format === "csv") {
            downloadTextFile(`${APP.displayTitle} - ${safeName} - diario.csv`, dailyArchiveToCsv(entries), "text/csv;charset=utf-8");
            return;
        }

        downloadTextFile(`${APP.displayTitle} - ${safeName} - diario.json`, JSON.stringify(entries, null, 2), "application/json;charset=utf-8");
    }

    function dailyArchiveToCsv(entries) {
        const rowsWithPrecision = (entries || [])
            .slice()
            .sort((a, b) => a.ts - b.ts)
            .map((entry, index, list) => dailyRowWithDiff(entry, list[index - 1] || null));
        const headers = [
            "dia", "data", "base_intervalo", "jogador_id", "nome", "tribo", "pontos", "aldeias", "rank",
            "od_total", "od_ofensivo", "od_defensivo", "od_apoio", "pontos_por_aldeia",
            "media_pontos_aldeia", "od_por_ponto", "conquistas_ganhas_dia", "conquistas_perdidas_dia",
            "conquistas_saldo_dia", "conquistas_total_ganhas", "conquistas_total_perdidas",
            "conquistas_total_saldo", "coordenadas",
        ];
        const rows = rowsWithPrecision.map((entry) => [
            entry.day,
            formatDateTime(new Date(entry.ts)),
            formatDailyPrecision(entry.precision),
            entry.playerId,
            entry.name,
            entry.tribe && entry.tribe.tag,
            entry.points,
            entry.villages,
            entry.rank,
            entry.metrics && entry.metrics.odTotal,
            entry.metrics && entry.metrics.odOff,
            entry.metrics && entry.metrics.odDef,
            entry.metrics && entry.metrics.odSupport,
            entry.metrics && entry.metrics.pointsPerVillage,
            entry.metrics && entry.metrics.averageVillagePoints,
            entry.metrics && entry.metrics.odPerPoint,
            entry.conquestsDay && entry.conquestsDay.gained,
            entry.conquestsDay && entry.conquestsDay.lost,
            entry.conquestsDay && entry.conquestsDay.net,
            entry.allTimeSummary && entry.allTimeSummary.gained,
            entry.allTimeSummary && entry.allTimeSummary.lost,
            entry.allTimeSummary && entry.allTimeSummary.net,
            entry.villagesArchive && entry.villagesArchive.coords ? entry.villagesArchive.coords.join(" ") : "",
        ]);
        return [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
    }

    function csvCell(value) {
        const text = String(value == null ? "" : value);
        return `"${text.replace(/"/g, '""')}"`;
    }

    function downloadTextFile(filename, content, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 500);
    }

    function formatMetric(value) {
        return Number.isFinite(value) ? String(value).replace(".", ",") : "N/D";
    }

    function renderVillageCoordinates(summary) {
        if (!summary || !summary.rows.length) {
            return `<div class="${APP.id}-emptyList">Sem aldeias atuais para este jogador.</div>`;
        }

        return `
            <div class="${APP.id}-coordsBlock">
                <label class="${APP.id}-coordsField ${APP.id}-coordsAll">
                    <span>Todas as aldeias (${formatNumber(summary.coords.length)})</span>
                    <textarea readonly rows="3">${escapeTextArea(summary.coords.join(" "))}</textarea>
                </label>
                <div class="${APP.id}-continentGrid">
                    ${summary.continents.map((group) => `
                        <label class="${APP.id}-coordsField">
                            <span>${escapeHTML(group.continent)} (${formatNumber(group.coords.length)})</span>
                            <textarea readonly rows="3">${escapeTextArea(group.coords.join(" "))}</textarea>
                        </label>
                    `).join("")}
                </div>
            </div>
        `;
    }

    function renderAllTimeStats(allTime) {
        if (!allTime || (!allTime.gained && !allTime.lost)) {
            return `<div class="${APP.id}-emptyList">Sem conquistas publicas deste jogador no historico do mundo.</div>`;
        }

        const first = allTime.firstTs ? formatDateOnly(new Date(allTime.firstTs * 1000)) : "-";
        const last = allTime.lastTs ? formatDateOnly(new Date(allTime.lastTs * 1000)) : "-";
        return `
            <div class="${APP.id}-grid ${APP.id}-allTimeGrid">
                ${plainMetricCard("Ganhas", formatNumber(allTime.gained))}
                ${plainMetricCard("Perdidas", formatNumber(allTime.lost))}
                ${plainMetricCard("Saldo", formatSigned(allTime.net))}
                ${plainMetricCard("Periodo", `${first} - ${last}`)}
            </div>
            <div class="${APP.id}-chartsGrid">
                ${renderLineChart("Saldo acumulado", allTime.cumulative)}
                ${renderBarChart("Atividade diaria", allTime.days)}
            </div>
            ${renderAllTimeConquestTable(allTime.rows)}
            ${renderOpponentTable(allTime.opponents)}
        `;
    }

    function renderTwStatsGraphs(twstats) {
        if (!twstats || !twstats.world) {
            return `<div class="${APP.id}-emptyList">Nao foi possivel determinar o mundo para TWStats.</div>`;
        }

        return `
            <div class="${APP.id}-twstatsLinks">
                <a href="${escapeHTML(twstats.profileUrl)}" target="_blank" rel="noopener">Abrir perfil no TWStats</a>
                <a href="${escapeHTML(twstats.historyUrl)}" target="_blank" rel="noopener">Historico</a>
                <span>Mundo: ${escapeHTML(twstats.world.toUpperCase())}</span>
            </div>
            <div class="${APP.id}-twstatsGrid">
                ${twstats.graphs.map((graph) => `
                    <figure>
                        <figcaption>${escapeHTML(graph.label)}</figcaption>
                        <img src="${escapeHTML(graph.url)}" alt="${escapeHTML(graph.label)}" loading="lazy" onerror="this.closest('figure').classList.add('${APP.id}-graphMissing')">
                        <span>Grafico indisponivel neste mundo.</span>
                    </figure>
                `).join("")}
            </div>
        `;
    }

    function plainMetricCard(label, value) {
        return `
            <div class="${APP.id}-metric">
                <span>${escapeHTML(label)}</span>
                <strong>${escapeHTML(value)}</strong>
            </div>
        `;
    }

    function renderLineChart(title, series) {
        const points = sampleSeries(series || [], 140);
        if (points.length < 2) return chartEmpty(title);

        const width = 520;
        const height = 180;
        const pad = 24;
        const values = points.map((point) => point.value);
        const min = Math.min(0, ...values);
        const max = Math.max(1, ...values);
        const range = Math.max(1, max - min);
        const polyline = points.map((point, index) => {
            const x = pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
            const y = height - pad - ((point.value - min) / range) * (height - pad * 2);
            return `${roundChart(x)},${roundChart(y)}`;
        }).join(" ");

        return `
            <div class="${APP.id}-chart">
                <h4>${escapeHTML(title)}</h4>
                <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(title)}">
                    <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="${APP.id}-chartAxis"></line>
                    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" class="${APP.id}-chartAxis"></line>
                    <polyline points="${polyline}" class="${APP.id}-chartLine"></polyline>
                </svg>
                <div class="${APP.id}-chartLegend">
                    <span>${escapeHTML(formatDateOnly(new Date(points[0].ts * 1000)))}</span>
                    <strong>${escapeHTML(formatSigned(points[points.length - 1].value))}</strong>
                    <span>${escapeHTML(formatDateOnly(new Date(points[points.length - 1].ts * 1000)))}</span>
                </div>
            </div>
        `;
    }

    function renderBarChart(title, days) {
        const points = sampleSeries(days || [], 90);
        if (!points.length) return chartEmpty(title);

        const width = 520;
        const height = 180;
        const pad = 24;
        const max = Math.max(1, ...points.map((point) => point.gained + point.lost));
        const innerWidth = width - pad * 2;
        const barWidth = Math.max(2, innerWidth / points.length - 1);
        const bars = points.map((point, index) => {
            const total = point.gained + point.lost;
            const gainedHeight = (point.gained / max) * (height - pad * 2);
            const lostHeight = (point.lost / max) * (height - pad * 2);
            const x = pad + (index / points.length) * innerWidth;
            const gainedY = height - pad - gainedHeight;
            const lostY = gainedY - lostHeight;
            return `
                <rect x="${roundChart(x)}" y="${roundChart(gainedY)}" width="${roundChart(barWidth)}" height="${roundChart(gainedHeight)}" class="${APP.id}-barGain"></rect>
                <rect x="${roundChart(x)}" y="${roundChart(lostY)}" width="${roundChart(barWidth)}" height="${roundChart(lostHeight)}" class="${APP.id}-barLoss"></rect>
            `;
        }).join("");

        return `
            <div class="${APP.id}-chart">
                <h4>${escapeHTML(title)}</h4>
                <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(title)}">
                    <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="${APP.id}-chartAxis"></line>
                    ${bars}
                </svg>
                <div class="${APP.id}-chartLegend">
                    <span>Ganhas</span>
                    <strong>${formatNumber(points.reduce((sum, point) => sum + point.gained + point.lost, 0))}</strong>
                    <span>Perdidas</span>
                </div>
            </div>
        `;
    }

    function renderOpponentTable(opponents) {
        if (!opponents || !opponents.length) return "";
        return `
            <div class="${APP.id}-tableWrap ${APP.id}-opponentWrap">
                <table class="${APP.id}-table ${APP.id}-opponentTable">
                    <thead>
                        <tr>
                            <th>ADVERSARIO</th>
                            <th>GANHAS DE</th>
                            <th>PERDIDAS PARA</th>
                            <th>PTS ATUAIS</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${opponents.map((opponent) => `
                            <tr>
                                <td>${escapeHTML(opponent.name)}</td>
                                <td>${formatNumber(opponent.from)}</td>
                                <td>${formatNumber(opponent.to)}</td>
                                <td>${formatNumber(opponent.points)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderAllTimeConquestTable(rows) {
        if (!rows || !rows.length) return "";
        return `
            <div class="${APP.id}-tableWrap ${APP.id}-allTimeConquestsWrap">
                <table class="${APP.id}-table ${APP.id}-allTimeConquestsTable">
                    <thead>
                        <tr>
                            <th>DATA</th>
                            <th>TIPO</th>
                            <th>ALDEIA</th>
                            <th>COORD</th>
                            <th>PTS</th>
                            <th>ADVERSARIO</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => `
                            <tr class="${APP.id}-${row.mode === "loss" ? "loss" : "gain"}">
                                <td>${escapeHTML(formatDateTime(row.date))}</td>
                                <td><strong>${row.mode === "loss" ? "Perdida" : "Ganha"}</strong></td>
                                <td>${escapeHTML(row.village && row.village.name ? row.village.name : `Aldeia #${row.villageId}`)}</td>
                                <td>${escapeHTML(row.village && row.village.coords ? row.village.coords : "-")}</td>
                                <td>${formatNumber(row.village && row.village.points)}</td>
                                <td>${escapeHTML(row.opponent || "-")}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    function chartEmpty(title) {
        return `
            <div class="${APP.id}-chart">
                <h4>${escapeHTML(title)}</h4>
                <div class="${APP.id}-emptyList">Sem dados suficientes para grafico.</div>
            </div>
        `;
    }

    function renderConquestTable(gained, lost, periodLabelText) {
        const rows = [
            ...gained.map((row) => ({ mode: "gain", row })),
            ...lost.map((row) => ({ mode: "loss", row })),
        ].sort((a, b) => b.row.timestamp - a.row.timestamp);

        if (!rows.length) {
            return `<div class="${APP.id}-emptyList">Sem aldeias ganhas ou perdidas em ${escapeHTML(periodLabelText)}.</div>`;
        }

        return `
            <div class="${APP.id}-tableWrap ${APP.id}-conquestWrap">
                <table class="${APP.id}-table ${APP.id}-conquestTable">
                    <thead>
                        <tr>
                            <th>HORA</th>
                            <th>TIPO</th>
                            <th>ALDEIA</th>
                            <th>PTS</th>
                            <th>DE</th>
                            <th>PARA</th>
                            <th>K</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(conquestTableRow).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    function conquestTableRow(item) {
        const row = item.row;
        const village = row.village || fallbackVillage(row.villageId);
        const type = item.mode === "gain" ? "GANHOU" : "PERDEU";
        return `
            <tr class="${APP.id}-${item.mode}">
                <td>${formatTime(row.date)}</td>
                <td><strong>${type}</strong></td>
                <td>
                    <a href="/game.php?screen=info_village&id=${row.villageId}" target="_blank" rel="noopener">${escapeHTML(village.name)}</a>
                    <small>(${escapeHTML(village.coords)})</small>
                </td>
                <td>${formatNumber(village.points)}</td>
                <td>${escapeHTML(row.oldOwner)}</td>
                <td>${escapeHTML(row.newOwner)}</td>
                <td>${escapeHTML(continentFromVillage(village))}</td>
            </tr>
        `;
    }

    function renderNotice(message, type) {
        return `<div class="${APP.id}-notice ${APP.id}-${type}">${escapeHTML(message)}</div>`;
    }

    function metricCard(label, value, delta, inverse) {
        const deltaText = delta === null ? "N/D" : formatSigned(delta);
        const title = inverse && delta !== null
            ? "No rank, valor negativo significa subida."
            : "";
        return `
            <div class="${APP.id}-metric" title="${escapeHTML(title)}">
                <span>${escapeHTML(label)}</span>
                <strong>${escapeHTML(value)}</strong>
                <em class="${deltaClass(delta, inverse)}">${escapeHTML(deltaText)}</em>
            </div>
        `;
    }

    function odRow(label, entry, delta) {
        const score = entry ? formatNumber(entry.score) : "N/D";
        const rank = entry && entry.rank ? `#${formatNumber(entry.rank)}` : "-";
        return `
            <tr>
                <td>${escapeHTML(label)}</td>
                <td><strong>${escapeHTML(score)}</strong></td>
                <td>${escapeHTML(rank)}</td>
                <td><em class="${deltaClass(delta, false)}">${escapeHTML(formatDelta(delta))}</em></td>
            </tr>
        `;
    }

    function renderConquestList(rows, mode) {
        if (!rows.length) {
            return `<div class="${APP.id}-emptyList">Sem aldeias ${mode === "gain" ? "ganhas" : "perdidas"} no periodo selecionado.</div>`;
        }

        const visible = rows.slice(0, 12);
        const more = rows.length > visible.length
            ? `<div class="${APP.id}-more">+${formatNumber(rows.length - visible.length)} restantes</div>`
            : "";

        return `
            <div class="${APP.id}-list">
                ${visible.map((row) => conquestRow(row, mode)).join("")}
                ${more}
            </div>
        `;
    }

    function conquestRow(row, mode) {
        const other = mode === "gain" ? row.oldOwner : row.newOwner;
        return `
            <div class="${APP.id}-conq ${APP.id}-${mode}">
                <a href="/game.php?screen=info_village&id=${row.villageId}" target="_blank" rel="noopener">
                    ${escapeHTML(row.village.coords)}
                </a>
                <span>${escapeHTML(row.village.name)}</span>
                <small>${escapeHTML(other)} - ${formatTime(row.date)} - ${formatNumber(row.village.points)} pts</small>
            </div>
        `;
    }

    function showNotice(message, type) {
        state.controls.body.innerHTML = panelRow(
            "RESUMO",
            "Estado da pesquisa atual.",
            renderNotice(message, type || "warn"),
            "summaryRow",
            true
        );
    }

    function setBusy(isBusy) {
        if (!state.controls.submit) return;
        state.controls.submit.disabled = isBusy;
        if (state.controls.clear) state.controls.clear.disabled = isBusy;
        if (state.panel && state.panel.classList) state.panel.classList.toggle(`${APP.id}-busy`, isBusy);
    }

    function setStatus(message) {
        if (state.controls.status) state.controls.status.textContent = message;
    }

    function clearCache() {
        state.memoryCache.clear();
        state.lastResult = null;

        try {
            const snapshotPrefix = `${APP.id}:snapshots:${window.location.host}:`;
            const dailyPrefix = `${APP.id}:daily:${window.location.host}:`;
            Object.keys(window.localStorage)
                .filter((key) => key.startsWith(snapshotPrefix) || key.startsWith(dailyPrefix))
                .forEach((key) => window.localStorage.removeItem(key));
        } catch (_) {
            // O browser pode bloquear localStorage em alguns contextos.
        }

        showNotice("Cache local limpo. Faz um novo resumo para guardar a snapshot atual.", "warn");
        setStatus("Cache limpo.");
    }

    function defaultPlayerQuery() {
        const params = new URLSearchParams(window.location.search);
        if (params.get("screen") === "info_player" && params.get("id")) return params.get("id");

        const gameData = pageGameData();
        if (gameData.player && gameData.player.name) return gameData.player.name;
        if (gameData.player && gameData.player.id) return String(gameData.player.id);
        return "";
    }

    function worldLabel() {
        const gameData = pageGameData();
        const world = String(gameData.world || window.location.hostname.split(".")[0] || "").toUpperCase();
        return `${world} - ${window.location.host}`;
    }

    function continentFromVillage(village) {
        if (!village || village.coords === "-") return "-";
        if (!Number.isFinite(village.x) || !Number.isFinite(village.y)) return "-";
        return `K${Math.floor(village.y / 100)}${Math.floor(village.x / 100)}`;
    }

    function splitLines(text) {
        return String(text || "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
    }

    function decodeTW(value) {
        const text = String(value || "").replace(/\+/g, " ");
        try {
            return decodeURIComponent(text);
        } catch (_) {
            return text;
        }
    }

    function fold(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    function toInt(value) {
        const number = Number.parseInt(value, 10);
        return Number.isFinite(number) ? number : 0;
    }

    function formatNumber(value) {
        if (!Number.isFinite(value)) return "N/D";
        return nf.format(value);
    }

    function formatSigned(value) {
        if (!Number.isFinite(value)) return "N/D";
        if (value > 0) return `+${nf.format(value)}`;
        return nf.format(value);
    }

    function formatDelta(value) {
        return Number.isFinite(value) ? formatSigned(value) : "N/D";
    }

    function formatDuration(ms) {
        const totalMinutes = Math.max(0, Math.round(ms / 60000));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (!hours) return `${minutes}m`;
        return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    }

    function formatDateTime(date) {
        return date.toLocaleString("pt-PT", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function formatTime(date) {
        return date.toLocaleString("pt-PT", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function deltaClass(delta, inverse) {
        if (delta === null || delta === 0) return `${APP.id}-neutral`;
        const good = inverse ? delta < 0 : delta > 0;
        return good ? `${APP.id}-positive` : `${APP.id}-negative`;
    }

    function escapeHTML(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }[char]));
    }

    function escapeTextArea(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function cleanText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function gameWindow() {
        return (typeof unsafeWindow !== "undefined" && unsafeWindow) ? unsafeWindow : window;
    }

    function pageGameData() {
        return gameWindow().game_data || {};
    }

    function startOfDayTs(timestamp) {
        const date = new Date(timestamp * 1000);
        date.setHours(0, 0, 0, 0);
        return Math.floor(date.getTime() / 1000);
    }

    function dateKey(timestamp) {
        const date = new Date(startOfDayTs(timestamp) * 1000);
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0"),
        ].join("-");
    }

    function dayKeyFromMs(ms) {
        return dateKey(Math.floor(ms / 1000));
    }

    function formatDateOnly(date) {
        return date.toLocaleDateString("pt-PT", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
        });
    }

    function sampleSeries(series, maxPoints) {
        const list = Array.isArray(series) ? series.filter((item) => item && Number.isFinite(item.ts)) : [];
        if (list.length <= maxPoints) return list;

        const sampled = [];
        const step = (list.length - 1) / (maxPoints - 1);
        for (let i = 0; i < maxPoints; i += 1) {
            sampled.push(list[Math.round(i * step)]);
        }
        return sampled;
    }

    function roundChart(value) {
        return Math.round(value * 10) / 10;
    }

    function injectStyle() {
        if (document.getElementById(`${APP.id}-style`)) return;

        const style = document.createElement("style");
        style.id = `${APP.id}-style`;
        style.textContent = `
            #${APP.id}-launcher {
                position: fixed;
                right: 16px;
                top: 132px;
                z-index: ${APP.zIndex};
                min-width: 44px;
                height: 34px;
                border: 1px solid #6f4d2d;
                border-radius: 4px;
                background: #8b5a2b;
                color: #fff7df;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
            }

            #${APP.id}-launcher:hover {
                background: #9b6a35;
            }

            #${APP.id}-panel {
                position: fixed;
                right: 16px;
                top: 176px;
                z-index: ${APP.zIndex};
                width: min(560px, calc(100vw - 24px));
                max-height: calc(100vh - 196px);
                overflow: hidden;
                display: flex;
                flex-direction: column;
                border: 1px solid #5d4228;
                border-radius: 6px;
                background: #f4ead2;
                color: #2c1b10;
                box-shadow: 0 12px 34px rgba(0, 0, 0, 0.4);
                font: 12px Verdana, Arial, sans-serif;
            }

            #${APP.id}-panel.${APP.id}-hidden {
                display: none;
            }

            .${APP.id}-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 10px 12px;
                background: #6f4d2d;
                color: #fff7df;
            }

            .${APP.id}-head strong {
                display: block;
                font-size: 14px;
                line-height: 1.2;
            }

            .${APP.id}-head span {
                display: block;
                color: #e8d3a6;
                font-size: 11px;
                margin-top: 2px;
            }

            .${APP.id}-icon {
                width: 26px;
                height: 26px;
                border: 1px solid rgba(255, 255, 255, 0.35);
                border-radius: 4px;
                background: rgba(0, 0, 0, 0.12);
                color: #fff7df;
                cursor: pointer;
                font-weight: 700;
            }

            .${APP.id}-search {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto auto;
                gap: 8px;
                padding: 10px 12px;
                border-bottom: 1px solid #d4bea0;
                background: #ead9b8;
            }

            .${APP.id}-search input {
                min-width: 0;
                height: 30px;
                border: 1px solid #a5835a;
                border-radius: 4px;
                padding: 0 9px;
                background: #fffaf0;
                color: #2c1b10;
                box-sizing: border-box;
            }

            .${APP.id}-search button {
                height: 30px;
                border: 1px solid #6f4d2d;
                border-radius: 4px;
                background: #7b552f;
                color: #fff7df;
                cursor: pointer;
                padding: 0 10px;
                font-weight: 700;
            }

            .${APP.id}-search button:disabled {
                opacity: 0.6;
                cursor: progress;
            }

            .${APP.id}-status {
                padding: 7px 12px;
                border-bottom: 1px solid #ddc9aa;
                color: #6d543d;
                font-size: 11px;
                background: #f8efd9;
            }

            .${APP.id}-body {
                overflow: auto;
                padding: 12px;
            }

            .${APP.id}-empty,
            .${APP.id}-emptyList,
            .${APP.id}-notice {
                border: 1px solid #d8c09b;
                border-radius: 6px;
                background: #fff7e5;
                padding: 10px;
                color: #5c4734;
            }

            .${APP.id}-notice.${APP.id}-error {
                border-color: #b2564f;
                background: #fff0ef;
                color: #842e27;
            }

            .${APP.id}-notice.${APP.id}-warn {
                border-color: #c19745;
                background: #fff4d4;
                color: #65491e;
                margin-bottom: 10px;
            }

            .${APP.id}-summaryHead {
                display: flex;
                align-items: flex-end;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 10px;
                border-bottom: 1px solid #d7c19f;
                padding-bottom: 9px;
            }

            .${APP.id}-summaryHead a {
                display: inline-block;
                color: #3a2414;
                font-size: 16px;
                font-weight: 700;
                text-decoration: none;
            }

            .${APP.id}-summaryHead a:hover {
                text-decoration: underline;
            }

            .${APP.id}-summaryHead span,
            .${APP.id}-summaryHead small {
                color: #6d543d;
            }

            .${APP.id}-grid {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 8px;
                margin-bottom: 12px;
            }

            .${APP.id}-metric {
                min-height: 74px;
                border: 1px solid #d1b88f;
                border-radius: 6px;
                background: #fff9ea;
                padding: 9px;
                box-sizing: border-box;
            }

            .${APP.id}-metric span,
            .${APP.id}-odRow span {
                display: block;
                color: #71563d;
                font-size: 11px;
                margin-bottom: 4px;
            }

            .${APP.id}-metric strong {
                display: block;
                font-size: 16px;
                color: #2f1e12;
                line-height: 1.25;
                overflow-wrap: anywhere;
            }

            .${APP.id}-metric em,
            .${APP.id}-odRow em {
                display: block;
                margin-top: 4px;
                font-style: normal;
                font-weight: 700;
            }

            .${APP.id}-positive {
                color: #24723a;
            }

            .${APP.id}-negative {
                color: #a33b2f;
            }

            .${APP.id}-neutral {
                color: #6d6256;
            }

            .${APP.id}-section {
                margin-top: 12px;
            }

            .${APP.id}-section h3 {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin: 0 0 7px;
                color: #3a2414;
                font-size: 13px;
            }

            .${APP.id}-section h3 span {
                color: #6d543d;
                font-weight: 400;
            }

            .${APP.id}-odTable {
                border: 1px solid #d1b88f;
                border-radius: 6px;
                overflow: hidden;
                background: #fff9ea;
            }

            .${APP.id}-odRow {
                display: grid;
                grid-template-columns: minmax(86px, 1fr) minmax(92px, 1fr) 70px 86px;
                gap: 8px;
                align-items: center;
                padding: 8px 9px;
                border-top: 1px solid #ead8ba;
            }

            .${APP.id}-odRow:first-child {
                border-top: 0;
            }

            .${APP.id}-odRow span {
                margin: 0;
            }

            .${APP.id}-odRow strong {
                color: #2f1e12;
            }

            .${APP.id}-odRow small {
                color: #71563d;
            }

            .${APP.id}-odRow em {
                margin: 0;
                text-align: right;
            }

            .${APP.id}-hint {
                margin-top: 6px;
                color: #6d543d;
                font-size: 11px;
            }

            .${APP.id}-split {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }

            .${APP.id}-list {
                display: grid;
                gap: 6px;
            }

            .${APP.id}-conq {
                border: 1px solid #d1b88f;
                border-radius: 6px;
                background: #fff9ea;
                padding: 8px;
                min-width: 0;
            }

            .${APP.id}-conq a {
                display: inline-block;
                color: #2c4f7b;
                font-weight: 700;
                text-decoration: none;
                margin-right: 5px;
            }

            .${APP.id}-conq a:hover {
                text-decoration: underline;
            }

            .${APP.id}-conq span {
                color: #2f1e12;
                font-weight: 700;
                overflow-wrap: anywhere;
            }

            .${APP.id}-conq small {
                display: block;
                color: #71563d;
                margin-top: 3px;
                overflow-wrap: anywhere;
            }

            .${APP.id}-more {
                color: #6d543d;
                padding: 4px 2px;
            }

            @media (max-width: 720px) {
                #${APP.id}-launcher {
                    top: auto;
                    right: 10px;
                    bottom: 78px;
                }

                #${APP.id}-panel {
                    right: 8px;
                    top: 76px;
                    width: calc(100vw - 16px);
                    max-height: calc(100vh - 88px);
                }

                .${APP.id}-search {
                    grid-template-columns: 1fr 1fr;
                }

                .${APP.id}-search input {
                    grid-column: 1 / -1;
                }

                .${APP.id}-summaryHead,
                .${APP.id}-split {
                    grid-template-columns: 1fr;
                    display: grid;
                }

                .${APP.id}-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                .${APP.id}-odRow {
                    grid-template-columns: minmax(76px, 1fr) minmax(82px, 1fr) 54px 76px;
                }
            }

            /* Layout inspirado no painel "Conquistas do Mundo". */
            #${APP.id}-launcher {
                position: fixed !important;
                top: 400px !important;
                right: auto !important;
                left: 16px !important;
                z-index: ${APP.zIndex} !important;
                box-sizing: border-box !important;
                width: 30px !important;
                min-width: 30px !important;
                height: 28px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: flex-start !important;
                gap: 0 !important;
                overflow: hidden !important;
                cursor: pointer !important;
                border: 1px solid #4f120f !important;
                border-radius: 2px !important;
                background: linear-gradient(to bottom, #b33a34, #8f2420 55%, #681611) !important;
                box-shadow: inset 0 1px 0 rgba(255,255,255,.35), inset 0 -1px 0 rgba(0,0,0,.35), 0 2px 5px rgba(0,0,0,.45) !important;
                color: #fff !important;
                font: 700 12px Verdana, Arial, sans-serif !important;
                text-shadow: 1px 1px 1px #000 !important;
                white-space: nowrap !important;
                padding: 0 6px !important;
                transition: width .18s ease, min-width .18s ease, padding .18s ease, gap .18s ease, background .18s ease !important;
            }

            #${APP.id}-launcher:hover,
            #${APP.id}-launcher:focus-visible {
                width: 378px !important;
                min-width: 378px !important;
                gap: 8px !important;
                padding: 0 9px !important;
                background: linear-gradient(to bottom, #c4473e, #a02c27 55%, #7e1c17) !important;
            }

            .${APP.id}-launcherIcon {
                width: 16px !important;
                height: 16px !important;
                flex: 0 0 16px !important;
                border-radius: 50% !important;
                background: url("${APP.launcherIcon}") center / contain no-repeat !important;
                box-shadow: inset 0 1px 1px rgba(255,255,255,.35), 0 1px 1px #000 !important;
            }

            .${APP.id}-launcherLabel {
                display: inline-block !important;
                max-width: 0 !important;
                opacity: 0 !important;
                overflow: hidden !important;
                transform: translateX(-4px) !important;
                white-space: nowrap !important;
                transition: max-width .18s ease, opacity .14s ease, transform .18s ease !important;
            }

            #${APP.id}-launcher:hover .${APP.id}-launcherLabel,
            #${APP.id}-launcher:focus-visible .${APP.id}-launcherLabel {
                max-width: 332px !important;
                opacity: 1 !important;
                transform: translateX(0) !important;
            }

            #${APP.id}-panel {
                position: fixed;
                z-index: ${APP.zIndex + 1};
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: min(1320px, calc(100vw - 24px));
                max-width: calc(100vw - 24px);
                max-height: calc(100vh - 18px);
                overflow: hidden;
                margin: 0;
                padding: 18px;
                border: 2px solid #473019;
                border-radius: 6px;
                background: linear-gradient(#d9c99e, #95805b);
                box-shadow:
                    0 0 0 1px #d8c99b,
                    0 0 0 4px #5c4429,
                    0 0 0 6px rgba(218, 203, 164, .9),
                    inset 0 0 0 2px rgba(255,244,207,.8),
                    inset 0 0 0 5px rgba(92,68,41,.45),
                    0 6px 18px rgba(0,0,0,.55);
                color: #2f1809;
                box-sizing: border-box;
                font: 12px Verdana, Arial, sans-serif;
            }

            #${APP.id}-panel::before {
                content: "";
                position: absolute;
                inset: 9px;
                pointer-events: none;
                border: 1px solid #8d261f;
                box-shadow: inset 0 0 0 1px #f4e3b6;
                z-index: 0;
            }

            #${APP.id}-panel::after {
                content: "";
                position: absolute;
                inset: 4px;
                pointer-events: none;
                border: 1px solid rgba(255,244,207,.7);
                z-index: 0;
            }

            #${APP.id}-panel.${APP.id}-hidden {
                display: none;
            }

            #popup_box_${APP.dialogId} {
                position: fixed !important;
                top: 50% !important;
                left: 50% !important;
                right: auto !important;
                bottom: auto !important;
                transform: translate(-50%, -50%) !important;
                margin: 0 !important;
                width: min(1320px, calc(100vw - 24px)) !important;
                max-width: calc(100vw - 24px) !important;
                max-height: calc(100vh - 8px) !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                z-index: ${APP.zIndex + 2} !important;
            }

            #popup_box_${APP.dialogId} .popup_box_content,
            #popup_box_${APP.dialogId} .popup_box_content > div {
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                height: auto !important;
                box-sizing: border-box !important;
            }

            #popup_box_${APP.dialogId} .popup_box_content {
                max-height: calc(100vh - 38px) !important;
                overflow: hidden !important;
                padding-bottom: 0 !important;
            }

            #popup_box_${APP.dialogId} .popup_box_content > div {
                max-height: none !important;
                overflow: visible !important;
            }

            #popup_box_${APP.dialogId} .${APP.id}-dialog {
                width: min(1260px, calc(100vw - 58px)) !important;
                max-width: 100% !important;
                margin: 0 auto !important;
            }

            #popup_box_${APP.dialogId} .${APP.id}-shell {
                max-height: calc(100vh - 76px) !important;
                overflow-x: hidden !important;
                overflow-y: auto !important;
                padding-bottom: 16px !important;
            }

            .${APP.id}-dialog {
                position: relative;
                z-index: 1;
                width: 100%;
                max-width: 100%;
                min-width: 0;
                margin: 0 auto;
                padding: 0;
                border: 0;
                border-radius: 0;
                background: transparent;
                box-shadow: none;
                overflow: visible;
                box-sizing: border-box;
            }

            .${APP.id}-dialog::before {
                content: none;
            }

            .${APP.id}-close {
                position: absolute;
                top: -12px;
                right: -12px;
                z-index: 3;
                width: 20px;
                height: 20px;
                line-height: 16px;
                padding: 0;
                border: 2px solid #4c2a12;
                border-radius: 2px;
                background: #f6d28b;
                color: #1b0d07;
                font-size: 18px;
                font-weight: 700;
                text-align: center;
                cursor: pointer;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
            }

            .${APP.id}-shell {
                position: relative;
                z-index: 1;
                display: flex;
                flex-direction: column;
                width: 100%;
                max-width: 100%;
                max-height: calc(100vh - 76px);
                min-height: 0;
                min-width: 0;
                padding: 0;
                border: 2px solid #7e211c;
                border-radius: 4px;
                background: #f4e4b8;
                color: #3b2508;
                overflow-x: hidden;
                overflow-y: auto;
                box-sizing: border-box;
            }

            .${APP.id}-masthead {
                margin: 0;
                padding: 9px 14px 8px;
                border: 0;
                border-bottom: 1px solid #c8913e;
                border-radius: 0;
                background: linear-gradient(to bottom, #f7e8c1 0%, #edd49a 100%);
            }

            .${APP.id}-masthead h2 {
                margin: 0;
                color: #9d1714;
                font-family: Verdana, Arial, sans-serif;
                font-size: 16px;
                line-height: 20px;
                font-weight: 700;
                letter-spacing: 0;
            }

            .${APP.id}-masthead p {
                margin: 3px 0 0;
                color: #4a240d;
                font-size: 12px;
            }

            .${APP.id}-panelRow {
                display: grid;
                grid-template-columns: 258px minmax(0, 1fr);
                border-top: 1px solid #d2b873;
                background: rgba(255, 255, 255, 0.08);
            }

            .${APP.id}-panelRow:first-of-type {
                border-top: 0;
            }

            .${APP.id}-rowLabel {
                min-height: 48px;
                padding: 9px 12px 8px 11px;
                border-left: 4px solid #b42522;
                box-sizing: border-box;
            }

            .${APP.id}-summaryRow .${APP.id}-rowLabel {
                border-left-color: #13a8bb;
            }

            .${APP.id}-villagesRow .${APP.id}-rowLabel {
                border-left-color: #3f8d2a;
            }

            .${APP.id}-odSectionRow .${APP.id}-rowLabel {
                border-left-color: #8f69d3;
            }

            .${APP.id}-worldStatsRow .${APP.id}-rowLabel {
                border-left-color: #c59325;
            }

            .${APP.id}-chartsRow .${APP.id}-rowLabel {
                border-left-color: #2d70b6;
            }

            .${APP.id}-resultsRow .${APP.id}-rowLabel {
                border-left-color: #c59325;
            }

            .${APP.id}-actionsRow .${APP.id}-rowLabel {
                border-left-color: #9d6d27;
            }

            .${APP.id}-rowLabel strong {
                display: flex;
                align-items: center;
                gap: 6px;
                color: #9f1d19;
                font-size: 13px;
                line-height: 1.15;
                text-transform: uppercase;
            }

            .${APP.id}-sectionIcon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 17px;
                height: 17px;
                flex: 0 0 17px;
                border: 1px solid #c8913e;
                border-radius: 2px;
                background: linear-gradient(to bottom, #fff2c8, #dfb765);
                color: #7d1713;
                font-size: 10px;
                line-height: 1;
                font-weight: 700;
                text-transform: none;
                box-shadow: inset 0 1px 0 rgba(255,255,255,.75);
            }

            .${APP.id}-rowLabel > span {
                display: block;
                margin-top: 3px;
                color: #4d250f;
                line-height: 1.25;
            }

            .${APP.id}-rowContent {
                min-width: 0;
                padding: 7px 12px 8px;
                box-sizing: border-box;
            }

            .${APP.id}-sectionToggle {
                display: block;
                width: 24px;
                min-width: 24px;
                height: 22px;
                margin-left: auto;
                padding: 0;
                border: 1px solid #7b201c;
                border-radius: 3px;
                background: linear-gradient(#b43a34, #8c1713);
                color: #fff8dc;
                cursor: pointer;
                font: 700 16px/19px Verdana, Arial, sans-serif;
                text-shadow: 0 1px 0 #40100d;
                box-shadow: inset 0 1px 0 rgba(255,255,255,.25), inset 0 -1px 0 rgba(0,0,0,.3);
            }

            .${APP.id}-sectionToggle:hover {
                background: linear-gradient(#c64a43, #971d18);
            }

            .${APP.id}-sectionContent {
                display: none;
                margin-top: 6px;
            }

            .${APP.id}-panelRowOpen .${APP.id}-sectionContent {
                display: block;
            }

            .${APP.id}-controlsGrid {
                display: grid;
                grid-template-columns: .75fr 1.4fr 1fr 1fr;
                gap: 8px;
                align-items: end;
            }

            .${APP.id}-controlsGrid label {
                display: grid;
                gap: 4px;
                min-width: 0;
                color: #000;
                font-weight: 700;
            }

            .${APP.id}-controlsGrid label > span {
                line-height: 1.1;
            }

            .${APP.id}-controlsGrid input,
            .${APP.id}-controlsGrid select {
                width: 100%;
                min-width: 0;
                height: 29px;
                padding: 3px 9px;
                border: 1px solid #c89042;
                border-radius: 2px;
                background: #fff6d7;
                color: #2f1809;
                box-sizing: border-box;
                font: 12px Verdana, Arial, sans-serif;
            }

            .${APP.id}-controlsGrid select:disabled {
                opacity: 1;
                color: #4d250f;
            }

            .${APP.id}-body {
                display: flex;
                flex-direction: column;
                flex: 0 0 auto;
                min-height: 0;
                min-width: 0;
                overflow: visible;
                padding: 0;
            }

            .${APP.id}-searchRow,
            .${APP.id}-actionsRow {
                flex: 0 0 auto;
            }

            .${APP.id}-playerHead {
                display: flex;
                align-items: flex-end;
                justify-content: space-between;
                gap: 16px;
                margin-bottom: 6px;
            }

            .${APP.id}-playerHead a {
                color: #2b1508;
                font-size: 16px;
                font-weight: 700;
                text-decoration: none;
            }

            .${APP.id}-playerHead a:hover {
                text-decoration: underline;
            }

            .${APP.id}-playerHead span,
            .${APP.id}-playerHead small {
                color: #6b3a15;
            }

            .${APP.id}-sourceBadge {
                flex: 0 0 auto;
                align-self: flex-start;
                padding: 3px 7px;
                border: 1px solid #c89042;
                border-radius: 2px;
                background: #fff1bd;
                color: #7d1713 !important;
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
            }

            .${APP.id}-precisionBox {
                display: grid;
                gap: 3px;
                margin: 6px 0 0;
                padding: 6px 8px;
                border: 1px solid #c89042;
                border-radius: 2px;
                background: #fff1bd;
                color: #4d250f;
                font-size: 11px;
            }

            .${APP.id}-precisionBox strong {
                color: #9d1714;
                text-transform: uppercase;
            }

            .${APP.id}-precisionBox span {
                display: block;
            }

            .${APP.id}-empty,
            .${APP.id}-emptyList,
            .${APP.id}-notice {
                border: 1px solid #c89042;
                border-radius: 2px;
                background: #fff2c8;
                color: #4d250f;
                padding: 11px 12px;
            }

            .${APP.id}-notice.${APP.id}-warn {
                margin: 0 0 9px;
                border-color: #c89042;
                background: #fff2c8;
                color: #6e3a12;
            }

            .${APP.id}-notice.${APP.id}-error {
                border-color: #a52c26;
                background: #ffe5d9;
                color: #7d1712;
            }

            .${APP.id}-grid {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 6px;
                margin: 0;
            }

            .${APP.id}-archiveActions {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
                color: #5a2f13;
                font-size: 11px;
            }

            .${APP.id}-archiveActions button {
                height: 24px;
                min-width: 94px;
                padding: 0 10px;
                border: 1px solid #7b201c;
                border-radius: 3px;
                background: linear-gradient(#b43a34, #8c1713);
                color: #fff8dc;
                cursor: pointer;
                font: 700 11px Verdana, Arial, sans-serif;
                text-shadow: 0 1px 0 #40100d;
            }

            .${APP.id}-archiveActions button:hover {
                background: linear-gradient(#c64a43, #971d18);
            }

            .${APP.id}-archiveWrap {
                max-height: 320px;
            }

            .${APP.id}-archiveDetails {
                display: grid;
                gap: 8px;
                margin-top: 9px;
            }

            .${APP.id}-metric {
                min-height: 43px;
                padding: 6px 8px;
                border: 1px solid #c89042;
                border-radius: 2px;
                background: #fff6d7;
                box-sizing: border-box;
            }

            .${APP.id}-metric span {
                display: block;
                margin: 0 0 2px;
                color: #6a340f;
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
            }

            .${APP.id}-metric strong {
                display: block;
                color: #120b05;
                font-size: 16px;
                line-height: 1.15;
                overflow-wrap: anywhere;
            }

            .${APP.id}-metric em {
                display: block;
                margin-top: 2px;
                font-style: normal;
                font-weight: 700;
            }

            .${APP.id}-positive {
                color: #176c2d;
            }

            .${APP.id}-negative {
                color: #a22620;
            }

            .${APP.id}-neutral {
                color: #63452b;
            }

            .${APP.id}-tableWrap {
                width: 100%;
                overflow: auto;
                border: 1px solid #c89042;
                background: #fff2c8;
            }

            .${APP.id}-table {
                width: 100%;
                min-width: 760px;
                border-collapse: collapse;
                color: #2f1809;
                font-size: 12px;
            }

            .${APP.id}-table th {
                padding: 6px 8px;
                background: linear-gradient(#dcb25e, #c99035);
                color: #2a1408;
                text-align: left;
                font-size: 11px;
                text-transform: uppercase;
            }

            .${APP.id}-table td {
                padding: 8px;
                border-top: 1px solid #e0c481;
                background: #fff2c8;
                vertical-align: top;
            }

            .${APP.id}-table tr:nth-child(even) td {
                background: #f7e3a9;
            }

            .${APP.id}-table a {
                color: #2d1709;
                font-weight: 700;
                text-decoration: none;
            }

            .${APP.id}-table a:hover {
                text-decoration: underline;
            }

            .${APP.id}-table small {
                display: block;
                color: #6b3a15;
                margin-top: 2px;
            }

            .${APP.id}-table em {
                font-style: normal;
                font-weight: 700;
            }

            .${APP.id}-odTable {
                min-width: 560px;
            }

            .${APP.id}-hint {
                margin-top: 6px;
                color: #5a2f13;
                font-size: 11px;
            }

            .${APP.id}-coordsBlock {
                display: grid;
                gap: 10px;
            }

            .${APP.id}-coordsField {
                display: grid;
                gap: 4px;
                min-width: 0;
                color: #4d250f;
                font-weight: 700;
            }

            .${APP.id}-coordsField textarea {
                width: 100%;
                min-height: 54px;
                resize: vertical;
                border: 1px solid #c89042;
                border-radius: 2px;
                background: #fff6d7;
                color: #2f1809;
                box-sizing: border-box;
                padding: 6px 8px;
                font: 12px Consolas, "Courier New", monospace;
                line-height: 1.35;
            }

            .${APP.id}-continentGrid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 8px;
            }

            .${APP.id}-chartsGrid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
                margin-top: 10px;
            }

            .${APP.id}-chart {
                border: 1px solid #c89042;
                background: #fff6d7;
                padding: 8px;
                min-width: 0;
            }

            .${APP.id}-chart h4 {
                margin: 0 0 6px;
                color: #7f1b16;
                font-size: 12px;
            }

            .${APP.id}-chart svg {
                display: block;
                width: 100%;
                height: auto;
                background: #fff2c8;
            }

            .${APP.id}-chartAxis {
                stroke: #9d6d27;
                stroke-width: 1;
            }

            .${APP.id}-chartLine {
                fill: none;
                stroke: #a7221e;
                stroke-width: 2.5;
            }

            .${APP.id}-barGain {
                fill: #24723a;
            }

            .${APP.id}-barLoss {
                fill: #a22620;
            }

            .${APP.id}-chartLegend,
            .${APP.id}-twstatsLinks {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                margin-top: 6px;
                color: #5a2f13;
                font-size: 11px;
            }

            .${APP.id}-twstatsLinks {
                justify-content: flex-start;
                margin: 0 0 8px;
            }

            .${APP.id}-twstatsLinks a {
                color: #9f1d19;
                font-weight: 700;
                text-decoration: none;
            }

            .${APP.id}-twstatsGrid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
            }

            .${APP.id}-twstatsGrid figure {
                margin: 0;
                border: 1px solid #c89042;
                background: #fff6d7;
                padding: 8px;
                min-width: 0;
            }

            .${APP.id}-twstatsGrid figcaption {
                margin-bottom: 6px;
                color: #7f1b16;
                font-weight: 700;
            }

            .${APP.id}-twstatsGrid img {
                display: block;
                max-width: 100%;
                height: auto;
                background: #fff2c8;
            }

            .${APP.id}-twstatsGrid figure > span {
                display: none;
                color: #6e3a12;
            }

            .${APP.id}-twstatsGrid figure.${APP.id}-graphMissing img {
                display: none;
            }

            .${APP.id}-twstatsGrid figure.${APP.id}-graphMissing > span {
                display: block;
            }

            .${APP.id}-opponentWrap {
                margin-top: 10px;
            }

            .${APP.id}-allTimeConquestsWrap {
                margin-top: 10px;
                max-height: 260px;
                overflow-y: auto;
            }

            .${APP.id}-gain td:nth-child(2) strong {
                color: #16662a;
            }

            .${APP.id}-loss td:nth-child(2) strong {
                color: #9d211b;
            }

            .${APP.id}-actions {
                display: grid;
                grid-template-columns: repeat(2, minmax(140px, 1fr));
                gap: 10px;
                margin-bottom: 9px;
            }

            .${APP.id}-actions button {
                height: 33px;
                border: 1px solid #7b201c;
                border-radius: 3px;
                background: linear-gradient(#b43a34, #8c1713);
                color: #fff8dc;
                cursor: pointer;
                font: 700 12px Verdana, Arial, sans-serif;
                text-shadow: 0 1px 0 #40100d;
            }

            .${APP.id}-actions button:hover {
                background: linear-gradient(#c64a43, #971d18);
            }

            .${APP.id}-actions button:disabled {
                opacity: 0.65;
                cursor: progress;
            }

            .${APP.id}-footerLine {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                color: #5a2f13;
                font-size: 11px;
            }

            .${APP.id}-status {
                padding: 0;
                border: 0;
                background: transparent;
                color: #5a2f13;
                font-size: 11px;
            }

            .${APP.id}-footerLine a {
                color: #9f1d19;
                font-weight: 700;
                text-decoration: none;
            }

            @media (max-width: 900px) {
                #${APP.id}-panel {
                    padding: 8px;
                    align-items: flex-start;
                }

                .${APP.id}-dialog {
                    width: 100%;
                    max-height: calc(100vh - 16px);
                }

                .${APP.id}-shell {
                    min-height: 0;
                    padding: 10px;
                }

                .${APP.id}-panelRow {
                    grid-template-columns: 1fr;
                }

                .${APP.id}-rowLabel {
                    min-height: 0;
                    padding-bottom: 7px;
                }

                .${APP.id}-controlsGrid,
                .${APP.id}-grid,
                .${APP.id}-actions,
                .${APP.id}-continentGrid,
                .${APP.id}-chartsGrid,
                .${APP.id}-twstatsGrid {
                    grid-template-columns: 1fr;
                }

                .${APP.id}-playerHead,
                .${APP.id}-footerLine {
                    align-items: flex-start;
                    flex-direction: column;
                }
            }
        `;
        document.head.appendChild(style);
    }
})();


/* ===== Painel de tribo ===== */
(() => {
    "use strict";

    if (window.top !== window.self) return;

    const IS_TWSTATS = /(^|\.)twstats\.com$/i.test(window.location.hostname);
    const IS_TRIBALWARS = /tribalwars\./i.test(window.location.hostname);
    if (!IS_TWSTATS && !IS_TRIBALWARS) return;

    const APP = {
        id: "tpResumo24hTribo",
        version: "1.0.15",
        title: "Spy Info",
        displayTitle: "TW PT - Spy Info ThePlaguePT",
        dialogId: "tpResumo24hInfoTribo",
        githubUrl: "https://github.com/ThePlaguePT/TribalWars-Scripts",
        launcherIcon: "https://dspt.innogamescdn.com/asset/f441272cc5/graphic/welcome/player_points.webp",
        mapCacheMs: 50 * 60 * 1000,
        conquerCacheMs: 90 * 1000,
        conquerAllCacheMs: 5 * 60 * 1000,
        twStatsCacheMs: 30 * 60 * 1000,
        twStatsTimeoutMs: 12000,
        twStatsBridgeWaitMs: 30000,
        twStatsBaselineToleranceMs: 48 * 60 * 60 * 1000,
        maxDailyConquestRows: 80,
        minSnapshotGapMs: 10 * 60 * 1000,
        snapshotRetentionMs: 10 * 24 * 60 * 60 * 1000,
        dailySnapshotRetentionMs: 180 * 24 * 60 * 60 * 1000,
        dayMs: 24 * 60 * 60 * 1000,
        baselineTargetMs: 24 * 60 * 60 * 1000,
        baselineToleranceMs: 4 * 60 * 60 * 1000,
        maxSnapshotsPerPlayer: 120,
        zIndex: 60030,
    };

    const OD_FILES = {
        total: ["/map/kill_all.txt"],
        off: ["/map/kill_att.txt"],
        def: ["/map/kill_def.txt"],
        support: [
            "/map/kill_sup.txt",
            "/map/kill_support.txt",
            "/map/kill_supporter.txt",
        ],
    };

    const state = {
        launcher: null,
        panel: null,
        busy: false,
        memoryCache: new Map(),
        controls: {},
        lastResult: null,
        nativeDialog: false,
        launcherPositionFrame: 0,
        launcherResizeObserver: null,
    };

    const nf = new Intl.NumberFormat("pt-PT");

    init();

    function init() {
        if (IS_TWSTATS) {
            initTwStatsBridge();
            return;
        }

        injectStyle();
        removeStandaloneLauncher();
        removeOldProfileStatsButtons(null);

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && state.panel && !state.panel.classList.contains(`${APP.id}-hidden`)) {
                closePanel();
            }
        });

        gameWindow().TPResumo24hTribo = {
            open: openPanel,
            run: () => runSummary(false),
            version: APP.version,
        };
    }

    function removeStandaloneLauncher() {
        const launcher = document.getElementById(`${APP.id}-launcher`);
        if (launcher) launcher.remove();
    }

    function createLauncher() {
        if (document.getElementById(`${APP.id}-launcher`)) return;

        const button = document.createElement("button");
        button.id = `${APP.id}-launcher`;
        button.type = "button";
        button.title = APP.displayTitle;
        button.setAttribute("aria-label", APP.displayTitle);
        button.innerHTML = `
            <span class="${APP.id}-launcherIcon" aria-hidden="true"></span>
            <span class="${APP.id}-launcherLabel">${escapeHTML(APP.displayTitle)}</span>
        `;
        button.addEventListener("click", openPanel);
        document.body.appendChild(button);
        state.launcher = button;
        setupLauncherPosition();
    }

    function removeOldProfileStatsButtons(keep) {
        const wrappers = Array.from(document.querySelectorAll(
            `#${APP.id}-profileStats, .${APP.id}-profileStatsRow, .${APP.id}-profileStatsWrap, .${APP.id}-profileStatsButton`
        ));
        const looseButtons = Array.from(document.querySelectorAll("button, a, input")).filter((node) => {
            const text = cleanText(node.textContent || node.value);
            return text === "Info - Stats";
        });
        Array.from(new Set([...wrappers, ...looseButtons])).forEach((node) => {
            if (keep && (node === keep || keep.contains(node))) return;

            const container = node.closest(`.${APP.id}-profileStatsRow, .${APP.id}-profileStatsWrap`) || node;
            if (keep && (container === keep || keep.contains(container))) return;
            container.remove();
        });
    }

    function setupLauncherPosition() {
        scheduleLauncherPosition();
        window.addEventListener("resize", scheduleLauncherPosition);
        window.addEventListener("orientationchange", scheduleLauncherPosition);

        if (typeof window.ResizeObserver === "function") {
            const observedLayout = findGameLayout();
            if (observedLayout) {
                state.launcherResizeObserver = new window.ResizeObserver(scheduleLauncherPosition);
                state.launcherResizeObserver.observe(observedLayout);
            }
        }

        window.setTimeout(positionLauncher, 250);
        window.setTimeout(positionLauncher, 1000);
    }

    function findGameLayout() {
        return document.querySelector("#main_layout td.maincell") ||
            document.querySelector("td.maincell") ||
            document.querySelector("#contentContainer") ||
            document.querySelector("#content_value");
    }

    function positionLauncher() {
        if (!state.launcher) return;

        const gameLayout = findGameLayout();
        if (!gameLayout) return;

        const layoutRect = gameLayout.getBoundingClientRect();
        if (layoutRect.width <= 0) return;

        const launcherWidth = 30;
        const launcherGap = 25;
        const left = Math.max(4, Math.round(layoutRect.left - launcherWidth - launcherGap));
        state.launcher.style.setProperty("left", `${left}px`, "important");
    }

    function scheduleLauncherPosition() {
        window.cancelAnimationFrame(state.launcherPositionFrame);
        state.launcherPositionFrame = window.requestAnimationFrame(positionLauncher);
    }

    function registerHubShortcut() {
        const item = {
            id: "resumo-24h-tribo-theplaguept",
            label: "Info Tribo",
            group: "Paineis",
            description: "Abre o resumo de pontos, membros, aldeias, conquistas e OD da tribo.",
            order: 36,
            run: openPanel,
        };
        const page = gameWindow();
        page.TWHubQueue = page.TWHubQueue || [];
        page.TWHubQueue.push(item);
    }

    function openPanel() {
        const dialogApi = gameWindow().Dialog;
        if (dialogApi && typeof dialogApi.show === "function") {
            openNativeDialogPanel();
            return;
        }

        if (state.nativeDialog) {
            if (dialogApi && typeof dialogApi.close === "function") dialogApi.close(APP.dialogId);
            state.nativeDialog = false;
            state.panel = null;
            state.controls = {};
        }

        if (!state.panel || !state.panel.isConnected) createPanel();
        state.nativeDialog = false;
        state.panel.classList.remove(`${APP.id}-hidden`);
        hydratePanelAfterOpen();
    }

    function hydratePanelAfterOpen() {
        const guess = defaultPlayerQuery();
        if (guess && state.controls.playerInput && !state.controls.playerInput.value.trim()) {
            state.controls.playerInput.value = guess;
        }
        window.setTimeout(() => {
            if (state.controls.playerInput) state.controls.playerInput.focus();
        }, 20);
    }

    function openNativeDialogPanel() {
        const html = getPanelInnerHTML().replace(
            new RegExp(`<button[^>]*class="${APP.id}-close"[^>]*>[\\s\\S]*?<\\/button>`),
            "",
        );

        gameWindow().Dialog.show(APP.dialogId, html);
        const dialog = document.querySelector(`#popup_box_${APP.dialogId} .${APP.id}-dialog`) ||
            document.querySelector(`.${APP.id}-dialog`);
        if (!dialog) return;

        state.panel = dialog;
        state.nativeDialog = true;
        bindPanelControls(document);
        expandNativeDialog(dialog);
        scheduleDialogRecentering();

        if (state.lastResult) renderResult(state.lastResult);
        hydratePanelAfterOpen();
    }

    function getPanelInnerHTML() {
        let panel = document.getElementById(`${APP.id}-panel`);
        if (!panel || state.nativeDialog) {
            if (panel) panel.remove();
            createPanel();
            panel = document.getElementById(`${APP.id}-panel`);
        }

        const html = panel.innerHTML;
        panel.remove();
        if (state.panel === panel) state.panel = null;
        state.controls = {};
        return html;
    }

    function closePanel() {
        const dialogApi = gameWindow().Dialog;
        if (state.nativeDialog && dialogApi && typeof dialogApi.close === "function") {
            dialogApi.close(APP.dialogId);
            state.nativeDialog = false;
            state.panel = null;
            state.controls = {};
            return;
        }

        if (state.panel) state.panel.classList.add(`${APP.id}-hidden`);
    }

    function createPanel() {
        const panel = document.createElement("div");
        panel.id = `${APP.id}-panel`;
        panel.className = `${APP.id}-hidden`;
        panel.innerHTML = `
            <div class="${APP.id}-dialog" role="dialog" aria-modal="true" aria-label="${APP.title}">
                <button type="button" class="${APP.id}-close" data-action="close" title="Fechar">x</button>
                <div class="${APP.id}-shell">
                    <header class="${APP.id}-masthead">
                        <h2>${escapeHTML(APP.displayTitle)}</h2>
                        <p>Resumo horario por dia TWStats da tribo no mundo atual. ${escapeHTML(worldLabel())}</p>
                    </header>

                    <form id="${APP.id}-form" class="${APP.id}-panelRow ${APP.id}-searchRow">
                        <aside class="${APP.id}-rowLabel">
                            <strong>${sectionIcon("TRIBO")}<span>TRIBO</span></strong>
                            <span>Procura por tag, nome ou ID para gerar o resumo.</span>
                        </aside>
                        <div class="${APP.id}-rowContent">
                            <div class="${APP.id}-controlsGrid">
                                <label>
                                    <span>Tipo</span>
                                    <select name="infoType">
                                        <option value="player">Jogador</option>
                                        <option value="tribe" selected>Tribo</option>
                                    </select>
                                </label>
                                <label>
                                    <span>Tribo</span>
                                    <input type="text" name="player" autocomplete="off" placeholder="Tag, nome ou ID da tribo">
                                </label>
                                <label>
                                    <span>Periodo</span>
                                    <select name="period">
                                        <option value="0" selected>Hoje</option>
                                        <option value="1">-1 dia</option>
                                        <option value="2">-2 dias</option>
                                        <option value="3">-3 dias</option>
                                        <option value="4">-4 dias</option>
                                        <option value="5">-5 dias</option>
                                        <option value="6">-6 dias</option>
                                        <option value="custom">Data manual</option>
                                    </select>
                                </label>
                                <label>
                                    <span>Data</span>
                                    <input type="date" name="periodDate">
                                </label>
                                <label>
                                    <span>Comparar</span>
                                    <select disabled>
                                        <option>Historico TWStats horario</option>
                                    </select>
                                </label>
                            </div>
                        </div>
                    </form>

                    <div class="${APP.id}-body">
                        <section class="${APP.id}-panelRow ${APP.id}-summaryRow">
                            <aside class="${APP.id}-rowLabel">
                                <strong>${sectionIcon("RESUMO")}<span>RESUMO</span></strong>
                                <span>Totais e variação da tribo selecionada.</span>
                            </aside>
                            <div class="${APP.id}-rowContent">
                                <div class="${APP.id}-empty">Escreve uma tribo para carregar o resumo.</div>
                            </div>
                        </section>
                    </div>

                    <section class="${APP.id}-panelRow ${APP.id}-actionsRow">
                        <aside class="${APP.id}-rowLabel">
                            <strong>${sectionIcon("ACOES")}<span>ACOES</span></strong>
                            <span>Atualiza dados da vista atual.</span>
                        </aside>
                        <div class="${APP.id}-rowContent">
                            <div class="${APP.id}-actions">
                                <button type="submit" form="${APP.id}-form">Atualizar</button>
                                <button type="button" data-action="clear">Limpar Cache</button>
                            </div>
                            <div class="${APP.id}-footerLine">
                                <span class="${APP.id}-status">Pronto.</span>
                                <span>Dados publicos do mapa. <a href="${APP.githubUrl}" target="_blank" rel="noopener">GitHub</a></span>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        state.panel = panel;
        state.nativeDialog = false;
        bindPanelControls(panel);
    }

    function bindPanelControls(root) {
        const scope = state.nativeDialog
            ? document.querySelector(`#popup_box_${APP.dialogId} .${APP.id}-dialog`) || root.querySelector(`.${APP.id}-dialog`) || root
            : root;

        state.controls.playerInput = scope.querySelector('input[name="player"]');
        state.controls.periodSelect = scope.querySelector('select[name="period"]');
        state.controls.periodDateInput = scope.querySelector('input[name="periodDate"]');
        state.controls.status = scope.querySelector(`.${APP.id}-status`);
        state.controls.body = scope.querySelector(`.${APP.id}-body`);
        state.controls.submit = scope.querySelector('button[type="submit"]');
        state.controls.infoTypeSelect = scope.querySelector('select[name="infoType"]');
        state.controls.clear = scope.querySelector('[data-action="clear"]');

        const closeButton = scope.querySelector('[data-action="close"]');
        if (closeButton) closeButton.addEventListener("click", closePanel);

        const form = scope.querySelector("form");
        if (form) form.addEventListener("submit", (event) => {
            event.preventDefault();
            runSummary(false);
        });

        if (state.controls.clear) state.controls.clear.addEventListener("click", clearCache);
        if (state.controls.infoTypeSelect) state.controls.infoTypeSelect.addEventListener("change", () => {
            if (state.controls.infoTypeSelect.value === "player") switchToPlayerPanel();
        });
        syncDateInputFromPeriod();
        if (state.controls.periodSelect) state.controls.periodSelect.addEventListener("change", () => {
            syncDateInputFromPeriod();
            if (state.lastResult && (state.controls.playerInput.value || "").trim()) runSummary(false);
        });
        if (state.controls.periodDateInput) state.controls.periodDateInput.addEventListener("change", () => {
            syncPeriodFromDateInput();
            if (state.lastResult && (state.controls.playerInput.value || "").trim()) runSummary(false);
        });

        if (state.controls.body) state.controls.body.addEventListener("click", (event) => {
            const exportButton = event.target.closest(`[data-${APP.id}-export]`);
            if (exportButton) {
                exportDailyArchive(exportButton.getAttribute(`data-${APP.id}-export`));
                return;
            }

            const toggle = event.target.closest(`[data-${APP.id}-toggle]`);
            if (toggle) togglePanelRow(toggle);
        });
    }

    function switchToPlayerPanel() {
        closePanel();
        window.setTimeout(() => {
            const api = gameWindow().TPResumo24hJogador;
            if (api && typeof api.open === "function") api.open();
        }, 0);
    }

    function expandNativeDialog(dialog) {
        const box = findNativeDialogBox(dialog);
        const content = dialog.closest(".popup_box_content") || (box && box.querySelector(".popup_box_content")) || dialog.parentElement;
        const frame = dialog.querySelector(`.${APP.id}-shell`) || dialog;
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 1320;
        const width = Math.min(1320, Math.max(320, viewportWidth - 24));

        if (box) {
            setStyleImportant(box, "position", "fixed");
            setStyleImportant(box, "top", "50%");
            setStyleImportant(box, "left", "50%");
            setStyleImportant(box, "right", "auto");
            setStyleImportant(box, "bottom", "auto");
            setStyleImportant(box, "transform", "translate(-50%, -50%)");
            setStyleImportant(box, "margin", "0");
            setStyleImportant(box, "margin-left", "0");
            setStyleImportant(box, "width", `${width}px`);
            setStyleImportant(box, "max-width", "calc(100vw - 24px)");
            setStyleImportant(box, "max-height", "calc(100vh - 8px)");
            setStyleImportant(box, "box-sizing", "border-box");
            setStyleImportant(box, "overflow", "visible");
            setStyleImportant(box, "z-index", String(APP.zIndex + 2));
        }

        [content, content && content.firstElementChild, dialog, frame].filter(Boolean).forEach((node) => {
            setStyleImportant(node, "max-width", "100%");
            setStyleImportant(node, "min-width", "0");
            setStyleImportant(node, "box-sizing", "border-box");
            setStyleImportant(node, "overflow-x", "hidden");
        });

        setStyleImportant(dialog, "width", "min(1260px, calc(100vw - 58px))");
        setStyleImportant(dialog, "margin", "0 auto");
        setStyleImportant(dialog, "padding", "0");
        setStyleImportant(dialog, "overflow", "visible");
        if (content) {
            setStyleImportant(content, "max-height", "calc(100vh - 38px)");
            setStyleImportant(content, "overflow", "hidden");
            setStyleImportant(content, "padding-bottom", "0");
        }
        setStyleImportant(frame, "width", "100%");
        setStyleImportant(frame, "height", "auto");
        setStyleImportant(frame, "max-height", "calc(100vh - 76px)");
        setStyleImportant(frame, "overflow-x", "hidden");
        setStyleImportant(frame, "overflow-y", "auto");
        setStyleImportant(frame, "padding-bottom", "16px");
    }

    function setStyleImportant(node, name, value) {
        if (!node || !node.style) return;
        node.style.setProperty(name, value, "important");
    }

    function recenterNativeDialog() {
        const dialog = document.querySelector(`#popup_box_${APP.dialogId} .${APP.id}-dialog`);
        if (dialog) expandNativeDialog(dialog);
    }

    function scheduleDialogRecentering() {
        [0, 50, 150, 350].forEach((delay) => {
            window.setTimeout(recenterNativeDialog, delay);
        });
    }

    function findNativeDialogBox(dialog) {
        const explicit = document.getElementById(`popup_box_${APP.dialogId}`);
        if (explicit) return explicit;

        let node = dialog.parentElement;
        let candidate = null;
        while (node && node !== document.body) {
            const id = String(node.id || "");
            const className = String(node.className || "");
            const classes = node.classList ? Array.from(node.classList) : [];
            if (id.indexOf("popup_box_") === 0 || id === "popup_box" || classes.includes("popup_box")) return node;
            if (!candidate && /popup|dialog/i.test(`${id} ${className}`)) candidate = node;
            node = node.parentElement;
        }
        return candidate || dialog.parentElement;
    }

    async function runSummary(force) {
        if (state.busy) return;

        const query = (state.controls.playerInput.value || defaultPlayerQuery()).trim();
        if (!query) {
            showNotice("Indica a tag, o nome ou o ID da tribo.", "warn");
            return;
        }

        state.busy = true;
        setBusy(true);
        setStatus(force ? "A atualizar ficheiros do mundo..." : "A carregar dados do mundo...");

        try {
            const result = await buildSummary(query, force);
            state.lastResult = result;
            state.controls.playerInput.value = result.player.tag || result.player.name;
            renderResult(result);
            setStatus(`Atualizado: ${formatDateTime(new Date(result.generatedAt))} - ${result.period.shortLabel}: ${baselineStatusLabel(result.precision)}`);
        } catch (error) {
            console.error(`[${APP.id}]`, error);
            showNotice(`Erro: ${error.message || error}`, "error");
            setStatus("Erro ao carregar dados.");
        } finally {
            state.busy = false;
            setBusy(false);
        }
    }

    async function buildSummary(query, force) {
        const now = Date.now();
        const periodInfo = selectedPeriodInfo(now);
        const periodHours = periodInfo.hours;
        const periodMs = periodInfo.ms;
        const since = Math.floor(periodInfo.startMs / 1000);
        const until = Math.floor(periodInfo.endMs / 1000);

        const [playersText, tribesText] = await Promise.all([
            fetchCachedText("players", "/map/player.txt", APP.mapCacheMs, force),
            fetchCachedText("tribes", "/map/ally.txt", APP.mapCacheMs, force, true),
        ]);
        const players = parsePlayers(playersText);
        const tribes = parseTribes(tribesText || "");
        const player = findTribe(tribes, query);
        if (!player) throw new Error("Tribo nao encontrada no ally.txt.");
        player.tribe = player;

        const conquerAllPromise = fetchCachedText("conquerAll", "/map/conquer.txt", APP.conquerAllCacheMs, force);
        const villagePromise = fetchCachedText("villages", "/map/village.txt", APP.mapCacheMs, force);
        const memberIds = tribeMemberIds(players, player.id);
        const memberSet = new Set(memberIds);
        const odPromise = loadOdEntries(memberIds, force);

        const [conquerAllText, villagesText, od] = await Promise.all([
            conquerAllPromise,
            villagePromise,
            odPromise,
        ]);

        const villages = parseVillages(villagesText);
        const conquests = summarizeTribeConquests(conquerAllText, villages, players.byId, player.id, since, until);
        const todayConquests = summarizeTribeConquests(conquerAllText, villages, players.byId, player.id, since, until);
        const allTime = summarizeTribeAllTimeConquests(conquerAllText, villages, players.byId, player.id);
        const villagesSummary = summarizeTribeVillages(villages, memberSet);
        const metrics = buildEvaluationMetrics(player, villagesSummary, od, allTime);

        const current = {
            ts: now,
            playerId: player.id,
            name: player.tag,
            tribe: player.tribe,
            points: player.points,
            villages: player.villages,
            members: player.members,
            rank: player.rank,
            od,
            metrics,
            villagesArchive: compactVillageArchive(villagesSummary),
            conquestsDay: compactConquestArchive(todayConquests),
            allTimeSummary: compactAllTimeArchive(allTime),
        };

        const dailyHistory = loadDailySnapshots(player.id);
        const history = mergeBaselineHistory(loadSnapshots(player.id), dailyHistory);
        const externalBaseline = await loadTwStatsBaseline(player.id, current, now, periodInfo, force);
        const twStatsCurrent = externalBaseline && externalBaseline.currentSnapshot
            ? mergeTwStatsCurrent(current, externalBaseline.currentSnapshot)
            : null;
        const displayCurrent = twStatsCurrent || current;
        const localBaseline = chooseBaseline(history, periodInfo.endMs, periodHours);
        const baseline = externalBaseline && externalBaseline.snapshot ? externalBaseline.snapshot : localBaseline;
        const diffs = buildDiffs(displayCurrent, baseline);
        const precision = buildPrecisionInfo(periodInfo.endMs, periodHours, baseline, conquests, todayConquests, externalBaseline, localBaseline);
        const dailyStats = buildDailyStats(dailyHistory, displayCurrent);
        saveSnapshot(current);
        saveDailySnapshot(current);

        return {
            generatedAt: now,
            since,
            period: {
                hours: periodHours,
                days: periodHours / 24,
                ms: periodMs,
                label: periodInfo.label,
                shortLabel: periodInfo.shortLabel,
                dayOffset: periodInfo.dayOffset,
                startMs: periodInfo.startMs,
                endMs: periodInfo.endMs,
            },
            player,
            current: displayCurrent,
            baseline,
            diffs,
            precision,
            dailyStats,
            conquests,
            allTime,
            villagesSummary,
            twstats: buildTwStatsLinks(player.id),
            odSupportAvailable: od.support !== null,
            supportSource: od.supportSource || "",
        };
    }

    function selectedPeriodInfo(now) {
        const todayStart = startOfLocalDayMs(now);
        const selectedDateStart = selectedPeriodStartMs(todayStart);
        const dayOffset = Math.max(0, Math.round((todayStart - selectedDateStart) / APP.dayMs));
        const startMs = todayStart - dayOffset * APP.dayMs;
        const endMs = dayOffset === 0 ? now : startMs + APP.dayMs;
        const ms = Math.max(60 * 1000, endMs - startMs);
        const hours = ms / (60 * 60 * 1000);
        const dateText = formatDateOnly(new Date(startMs));
        const label = dayOffset === 0 ? `Hoje (${dateText}, 00:00-agora)` : `${dateText} (00:00-24:00)`;

        return {
            dayOffset,
            startMs,
            endMs,
            ms,
            hours,
            label,
            shortLabel: dayOffset === 0 ? "Hoje" : dateText,
        };
    }

    function selectedPeriodStartMs(todayStart) {
        const selectValue = String(state.controls.periodSelect && state.controls.periodSelect.value || "0");
        const manualStart = parsePeriodDateInputMs(todayStart);
        if (selectValue === "custom" && Number.isFinite(manualStart)) return manualStart;

        const dayOffset = clampDayOffset(Number.parseInt(selectValue, 10));
        return todayStart - dayOffset * APP.dayMs;
    }

    function parsePeriodDateInputMs(todayStart) {
        const value = state.controls.periodDateInput && state.controls.periodDateInput.value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;

        const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
        const time = buildLocalTime(year, month, day, 0, 0, 0);
        if (!Number.isFinite(time)) return null;
        return Math.min(time, todayStart);
    }

    function syncDateInputFromPeriod() {
        if (!state.controls.periodDateInput) return;
        const todayStart = startOfLocalDayMs(Date.now());
        const dayOffset = clampDayOffset(Number.parseInt(state.controls.periodSelect && state.controls.periodSelect.value, 10));
        state.controls.periodDateInput.value = formatDateInputValue(todayStart - dayOffset * APP.dayMs);
    }

    function syncPeriodFromDateInput() {
        if (!state.controls.periodDateInput || !state.controls.periodSelect) return;
        const todayStart = startOfLocalDayMs(Date.now());
        const selectedStart = parsePeriodDateInputMs(todayStart);
        if (!Number.isFinite(selectedStart)) return;

        const dayOffset = Math.max(0, Math.round((todayStart - selectedStart) / APP.dayMs));
        state.controls.periodSelect.value = dayOffset >= 0 && dayOffset <= 6 ? String(dayOffset) : "custom";
        state.controls.periodDateInput.value = formatDateInputValue(selectedStart);
    }

    function formatDateInputValue(time) {
        const date = new Date(time);
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0"),
        ].join("-");
    }

    function clampDayOffset(value) {
        return Number.isFinite(value) && value >= 0 && value <= 30 ? value : 0;
    }

    function startOfLocalDayMs(time) {
        const date = new Date(time);
        date.setHours(0, 0, 0, 0);
        return date.getTime();
    }

    function periodToMs(hours) {
        return Math.max(1, hours || 24) * 60 * 60 * 1000;
    }

    async function loadOdEntries(memberIds, force) {
        const [totalText, offText, defText, supportData] = await Promise.all([
            fetchFirstAvailable("odTotal", OD_FILES.total, APP.mapCacheMs, force, true),
            fetchFirstAvailable("odOff", OD_FILES.off, APP.mapCacheMs, force, true),
            fetchFirstAvailable("odDef", OD_FILES.def, APP.mapCacheMs, force, true),
            fetchFirstAvailable("odSupport", OD_FILES.support, APP.mapCacheMs, force, true),
        ]);

        return normalizeOdEntries({
            total: sumKillEntries(totalText.text, memberIds),
            off: sumKillEntries(offText.text, memberIds),
            def: sumKillEntries(defText.text, memberIds),
            support: supportData.text ? sumKillEntries(supportData.text, memberIds) : null,
            supportSource: supportData.path || "",
        });
    }

    function sumKillEntries(text, memberIds) {
        if (text === null) return null;
        const members = new Set(memberIds || []);
        let score = 0;
        let found = false;

        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 3) continue;
            const id = toInt(cols[1]);
            if (!members.has(id)) continue;

            score += toInt(cols[2]);
            found = true;
        }

        return {
            rank: null,
            score: found ? score : 0,
        };
    }

    function normalizeOdEntries(od) {
        if (!od) return od;

        if (!od.support) {
            const supportScore = deriveSupportScore(od.total, od.off, od.def);
            if (Number.isFinite(supportScore)) {
                od.support = { score: supportScore, rank: null };
                od.supportSource = od.supportSource || "calculado";
            }
        }

        return od;
    }

    function deriveSupportScore(total, off, def) {
        const totalScore = total && Number.isFinite(total.score) ? total.score : null;
        const offScore = off && Number.isFinite(off.score) ? off.score : null;
        const defScore = def && Number.isFinite(def.score) ? def.score : null;
        if (!Number.isFinite(totalScore) || !Number.isFinite(offScore) || !Number.isFinite(defScore)) return null;

        return Math.max(0, totalScore - offScore - defScore);
    }

    async function fetchFirstAvailable(name, paths, ttlMs, force, optional) {
        let lastError = null;
        for (const path of paths) {
            try {
                const text = await fetchCachedText(`${name}:${path}`, path, ttlMs, force, optional);
                if (text !== null) return { path, text };
            } catch (error) {
                lastError = error;
            }
        }

        if (!optional && lastError) throw lastError;
        return { path: "", text: null };
    }

    async function fetchCachedText(name, path, ttlMs, force, optional) {
        const now = Date.now();
        const cached = state.memoryCache.get(name);
        if (!force && cached && now - cached.time < ttlMs) {
            if (cached.missing) return null;
            return cached.text;
        }

        const response = await fetch(path, {
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Accept": "text/plain,*/*" },
        });

        if (!response.ok) {
            if (optional && (response.status === 404 || response.status === 403)) {
                state.memoryCache.set(name, { time: now, missing: true, text: null });
                return null;
            }
            throw new Error(`${path} (${response.status})`);
        }

        const text = await response.text();
        state.memoryCache.set(name, { time: now, text });
        return text;
    }

    function parsePlayers(text) {
        const byId = new Map();
        const rows = [];

        byId.set(0, {
            id: 0,
            name: "Barbaros",
            tribeId: 0,
            villages: 0,
            points: 0,
            rank: 0,
        });

        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 6) continue;

            const player = {
                id: toInt(cols[0]),
                name: decodeTW(cols[1]) || `Jogador #${toInt(cols[0])}`,
                tribeId: toInt(cols[2]),
                villages: toInt(cols[3]),
                points: toInt(cols[4]),
                rank: toInt(cols[5]),
            };
            player.search = fold(player.name);
            byId.set(player.id, player);
            rows.push(player);
        }

        return { byId, rows };
    }

    function parseTribes(text) {
        const byId = new Map();
        const rows = [];
        byId.set(0, {
            id: 0,
            name: "-",
            tag: "-",
            members: 0,
            villages: 0,
            points: 0,
            allPoints: 0,
            rank: 0,
        });

        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 8) continue;

            const tribe = {
                id: toInt(cols[0]),
                name: decodeTW(cols[1]) || `Tribo #${toInt(cols[0])}`,
                tag: decodeTW(cols[2]) || "-",
                members: toInt(cols[3]),
                villages: toInt(cols[4]),
                points: toInt(cols[5]),
                allPoints: toInt(cols[6]),
                rank: toInt(cols[7]),
            };
            tribe.searchName = fold(tribe.name);
            tribe.searchTag = fold(tribe.tag);
            byId.set(tribe.id, tribe);
            rows.push(tribe);
        }

        return { byId, rows };
    }

    function tribeInfo(tribes, tribeId) {
        const tribe = tribes && tribes.byId ? tribes.byId.get(tribeId) : null;
        return tribe || {
            id: tribeId || 0,
            name: "-",
            tag: "-",
            members: 0,
            villages: 0,
            points: 0,
            allPoints: 0,
            rank: 0,
        };
    }

    function findTribe(tribes, query) {
        const clean = String(query || "").trim();
        if (!clean) return null;

        if (/^\d+$/.test(clean)) {
            const byId = tribes.byId.get(toInt(clean));
            if (byId) return byId;
        }

        const search = fold(clean);
        const exact = tribes.rows.find((tribe) => tribe.searchTag === search || tribe.searchName === search);
        if (exact) return exact;

        const starts = tribes.rows.filter((tribe) => tribe.searchTag.startsWith(search) || tribe.searchName.startsWith(search));
        if (starts.length === 1) return starts[0];

        const contains = tribes.rows.filter((tribe) => tribe.searchTag.includes(search) || tribe.searchName.includes(search));
        if (contains.length === 1) return contains[0];

        if (starts.length > 1 || contains.length > 1) {
            const matches = (starts.length ? starts : contains)
                .slice(0, 8)
                .map((tribe) => `${tribe.tag} - ${tribe.name} (#${tribe.id})`)
                .join(", ");
            throw new Error(`Varias tribos encontradas: ${matches}. Usa a tag completa ou o ID.`);
        }

        return null;
    }

    function parseVillages(text) {
        const villages = new Map();
        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 6) continue;
            const id = toInt(cols[0]);
            const x = toInt(cols[2]);
            const y = toInt(cols[3]);
            villages.set(id, {
                id,
                name: decodeTW(cols[1]) || `Aldeia #${id}`,
                x,
                y,
                coords: `${x}|${y}`,
                playerId: toInt(cols[4]),
                points: toInt(cols[5]),
            });
        }
        return villages;
    }

    function findPlayer(players, query) {
        const clean = String(query || "").trim();
        if (!clean) return null;

        if (/^\d+$/.test(clean)) {
            const byId = players.byId.get(toInt(clean));
            if (byId) return byId;
        }

        const search = fold(clean);
        const exact = players.rows.find((player) => player.search === search);
        if (exact) return exact;

        const starts = players.rows.filter((player) => player.search.startsWith(search));
        if (starts.length === 1) return starts[0];

        const contains = players.rows.filter((player) => player.search.includes(search));
        if (contains.length === 1) return contains[0];

        if (starts.length > 1 || contains.length > 1) {
            const matches = (starts.length ? starts : contains)
                .slice(0, 8)
                .map((player) => `${player.name} (#${player.id})`)
                .join(", ");
            throw new Error(`Varios jogadores encontrados: ${matches}. Usa o nome completo ou o ID.`);
        }

        return null;
    }

    function findKillEntry(text, playerId) {
        if (text === null) return null;

        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 3) continue;
            const id = toInt(cols[1]);
            if (id === playerId) {
                return {
                    rank: toInt(cols[0]) || null,
                    score: toInt(cols[2]),
                };
            }
        }

        return {
            rank: null,
            score: 0,
        };
    }

    function tribeMemberIds(players, tribeId) {
        return (players && players.rows ? players.rows : [])
            .filter((player) => player.tribeId === tribeId)
            .map((player) => player.id);
    }

    function playerTribeId(playersById, playerId) {
        const player = playersById.get(playerId);
        return player ? player.tribeId : 0;
    }

    function summarizeTribeConquests(text, villages, playersById, tribeId, since, until) {
        const gained = [];
        const lost = [];

        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 4) continue;

            const timestamp = toInt(cols[1]);
            if (timestamp < since) continue;
            if (Number.isFinite(until) && timestamp >= until) continue;

            const villageId = toInt(cols[0]);
            const newOwnerId = toInt(cols[2]);
            const oldOwnerId = toInt(cols[3]);
            if (newOwnerId === oldOwnerId) continue;

            const newTribeId = playerTribeId(playersById, newOwnerId);
            const oldTribeId = playerTribeId(playersById, oldOwnerId);
            if (newTribeId === oldTribeId) continue;
            if (newTribeId !== tribeId && oldTribeId !== tribeId) continue;

            const village = villages.get(villageId) || fallbackVillage(villageId);
            const row = {
                villageId,
                village,
                timestamp,
                date: new Date(timestamp * 1000),
                newOwner: playerName(playersById, newOwnerId),
                oldOwner: playerName(playersById, oldOwnerId),
            };

            if (newTribeId === tribeId) gained.push(row);
            if (oldTribeId === tribeId) lost.push(row);
        }

        gained.sort((a, b) => b.timestamp - a.timestamp);
        lost.sort((a, b) => b.timestamp - a.timestamp);

        return {
            gained,
            lost,
            net: gained.length - lost.length,
        };
    }

    function summarizeConquests(text, villages, playersById, playerId, since, until) {
        const gained = [];
        const lost = [];

        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 4) continue;

            const timestamp = toInt(cols[1]);
            if (timestamp < since) continue;
            if (Number.isFinite(until) && timestamp >= until) continue;

            const villageId = toInt(cols[0]);
            const newOwnerId = toInt(cols[2]);
            const oldOwnerId = toInt(cols[3]);
            if (newOwnerId === oldOwnerId) continue;

            if (newOwnerId !== playerId && oldOwnerId !== playerId) continue;

            const village = villages.get(villageId) || fallbackVillage(villageId);
            const row = {
                villageId,
                village,
                timestamp,
                date: new Date(timestamp * 1000),
                newOwner: playerName(playersById, newOwnerId),
                oldOwner: playerName(playersById, oldOwnerId),
            };

            if (newOwnerId === playerId) gained.push(row);
            if (oldOwnerId === playerId) lost.push(row);
        }

        gained.sort((a, b) => b.timestamp - a.timestamp);
        lost.sort((a, b) => b.timestamp - a.timestamp);

        return {
            gained,
            lost,
            net: gained.length - lost.length,
        };
    }

    function summarizePlayerVillages(villages, playerId) {
        const rows = Array.from(villages.values())
            .filter((village) => village.playerId === playerId)
            .sort((a, b) => a.x - b.x || a.y - b.y || a.name.localeCompare(b.name));

        const continents = new Map();
        for (const village of rows) {
            const continent = continentFromVillage(village);
            const list = continents.get(continent) || [];
            list.push(village);
            continents.set(continent, list);
        }

        return {
            rows,
            coords: rows.map((village) => village.coords),
            continents: Array.from(continents.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([continent, list]) => ({
                    continent,
                    rows: list,
                    coords: list.map((village) => village.coords),
            })),
        };
    }

    function summarizeTribeVillages(villages, memberSet) {
        const rows = Array.from(villages.values())
            .filter((village) => memberSet.has(village.playerId))
            .sort((a, b) => a.x - b.x || a.y - b.y || a.name.localeCompare(b.name));

        const continents = new Map();
        for (const village of rows) {
            const continent = continentFromVillage(village);
            const list = continents.get(continent) || [];
            list.push(village);
            continents.set(continent, list);
        }

        return {
            rows,
            coords: rows.map((village) => village.coords),
            continents: Array.from(continents.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([continent, list]) => ({
                    continent,
                    rows: list,
                    coords: list.map((village) => village.coords),
            })),
        };
    }

    function buildEvaluationMetrics(player, villagesSummary, od, allTime) {
        const villageRows = villagesSummary && villagesSummary.rows ? villagesSummary.rows : [];
        const villagePoints = villageRows.reduce((total, village) => total + (Number.isFinite(village.points) ? village.points : 0), 0);
        const villageCount = villageRows.length || player.villages || 0;
        const odTotal = od && od.total && Number.isFinite(od.total.score) ? od.total.score : null;
        const odOff = od && od.off && Number.isFinite(od.off.score) ? od.off.score : null;
        const odDef = od && od.def && Number.isFinite(od.def.score) ? od.def.score : null;
        const odSupport = od && od.support && Number.isFinite(od.support.score) ? od.support.score : null;

        return {
            pointsPerVillage: villageCount ? Math.round(player.points / villageCount) : null,
            villagePoints,
            averageVillagePoints: villageCount ? Math.round(villagePoints / villageCount) : null,
            odTotal,
            odOff,
            odDef,
            odSupport,
            odPerPoint: odTotal && player.points ? roundMetric(odTotal / player.points) : null,
            offensiveShare: odTotal ? roundMetric((odOff || 0) * 100 / odTotal) : null,
            defensiveShare: odTotal ? roundMetric((odDef || 0) * 100 / odTotal) : null,
            supportShare: odTotal ? roundMetric((odSupport || 0) * 100 / odTotal) : null,
            allTimeGained: allTime ? allTime.gained : 0,
            allTimeLost: allTime ? allTime.lost : 0,
            allTimeNet: allTime ? allTime.net : 0,
        };
    }

    function compactVillageArchive(summary) {
        const rows = summary && summary.rows ? summary.rows : [];
        const continents = summary && summary.continents ? summary.continents : [];
        return {
            count: rows.length,
            coords: rows.map((village) => village.coords),
            rows: rows.map((village) => ({
                id: village.id,
                name: village.name,
                coords: village.coords,
                x: village.x,
                y: village.y,
                points: village.points,
                continent: continentFromVillage(village),
            })),
            continents: continents.map((group) => ({
                continent: group.continent,
                count: group.rows.length,
                coords: group.coords,
                points: group.rows.reduce((total, village) => total + (Number.isFinite(village.points) ? village.points : 0), 0),
            })),
        };
    }

    function compactConquestArchive(conquests) {
        const gained = conquests && conquests.gained ? conquests.gained : [];
        const lost = conquests && conquests.lost ? conquests.lost : [];
        return {
            gained: gained.length,
            lost: lost.length,
            net: (conquests && conquests.net) || 0,
            rows: [...gained.map((row) => compactConquestRow(row, "gain")), ...lost.map((row) => compactConquestRow(row, "loss"))]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, APP.maxDailyConquestRows),
        };
    }

    function compactConquestRow(row, mode) {
        return {
            mode,
            timestamp: row.timestamp,
            date: formatDateTime(row.date),
            villageId: row.villageId,
            village: row.village ? row.village.name : "",
            coords: row.village ? row.village.coords : "-",
            points: row.village ? row.village.points : 0,
            continent: row.village ? continentFromVillage(row.village) : "-",
            oldOwner: row.oldOwner,
            newOwner: row.newOwner,
        };
    }

    function compactAllTimeArchive(allTime) {
        return {
            gained: allTime ? allTime.gained : 0,
            lost: allTime ? allTime.lost : 0,
            net: allTime ? allTime.net : 0,
            firstTs: allTime ? allTime.firstTs : 0,
            lastTs: allTime ? allTime.lastTs : 0,
            opponents: allTime && allTime.opponents ? allTime.opponents : [],
        };
    }

    function roundMetric(value) {
        return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
    }

    function summarizeAllTimeConquests(text, villages, playersById, playerId) {
        const daily = new Map();
        const opponents = new Map();
        const rows = [];
        let gained = 0;
        let lost = 0;
        let firstTs = 0;
        let lastTs = 0;

        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 4) continue;

            const villageId = toInt(cols[0]);
            const timestamp = toInt(cols[1]);
            const newOwnerId = toInt(cols[2]);
            const oldOwnerId = toInt(cols[3]);
            if (!timestamp || newOwnerId === oldOwnerId) continue;
            if (newOwnerId !== playerId && oldOwnerId !== playerId) continue;

            const dayKey = dateKey(timestamp);
            const day = daily.get(dayKey) || {
                key: dayKey,
                ts: startOfDayTs(timestamp),
                gained: 0,
                lost: 0,
            };

            const village = villages.get(villageId) || fallbackVillage(villageId);
            const baseRow = {
                villageId,
                village,
                timestamp,
                date: new Date(timestamp * 1000),
                oldOwner: playerName(playersById, oldOwnerId),
                newOwner: playerName(playersById, newOwnerId),
            };

            if (newOwnerId === playerId) {
                gained += 1;
                day.gained += 1;
                addOpponent(opponents, oldOwnerId, playersById, "from", village.points);
                rows.push({ ...baseRow, mode: "gain", opponent: baseRow.oldOwner });
            }

            if (oldOwnerId === playerId) {
                lost += 1;
                day.lost += 1;
                addOpponent(opponents, newOwnerId, playersById, "to", village.points);
                rows.push({ ...baseRow, mode: "loss", opponent: baseRow.newOwner });
            }

            daily.set(dayKey, day);
            firstTs = firstTs ? Math.min(firstTs, timestamp) : timestamp;
            lastTs = Math.max(lastTs, timestamp);
        }

        const days = Array.from(daily.values()).sort((a, b) => a.ts - b.ts);
        let runningGained = 0;
        let runningLost = 0;
        const cumulative = days.map((day) => {
            runningGained += day.gained;
            runningLost += day.lost;
            return {
                key: day.key,
                ts: day.ts,
                value: runningGained - runningLost,
                gained: runningGained,
                lost: runningLost,
            };
        });

        return {
            gained,
            lost,
            net: gained - lost,
            firstTs,
            lastTs,
            days,
            cumulative,
            rows: rows.sort((a, b) => b.timestamp - a.timestamp),
            opponents: Array.from(opponents.values())
                .sort((a, b) => (b.from + b.to) - (a.from + a.to)),
        };
    }

    function summarizeTribeAllTimeConquests(text, villages, playersById, tribeId) {
        const daily = new Map();
        const opponents = new Map();
        const rows = [];
        let gained = 0;
        let lost = 0;
        let firstTs = 0;
        let lastTs = 0;

        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 4) continue;

            const villageId = toInt(cols[0]);
            const timestamp = toInt(cols[1]);
            const newOwnerId = toInt(cols[2]);
            const oldOwnerId = toInt(cols[3]);
            if (!timestamp || newOwnerId === oldOwnerId) continue;

            const newTribeId = playerTribeId(playersById, newOwnerId);
            const oldTribeId = playerTribeId(playersById, oldOwnerId);
            if (newTribeId === oldTribeId) continue;
            if (newTribeId !== tribeId && oldTribeId !== tribeId) continue;

            const dayKey = dateKey(timestamp);
            const day = daily.get(dayKey) || {
                key: dayKey,
                ts: startOfDayTs(timestamp),
                gained: 0,
                lost: 0,
            };

            const village = villages.get(villageId) || fallbackVillage(villageId);
            const baseRow = {
                villageId,
                village,
                timestamp,
                date: new Date(timestamp * 1000),
                oldOwner: playerName(playersById, oldOwnerId),
                newOwner: playerName(playersById, newOwnerId),
            };

            if (newTribeId === tribeId) {
                gained += 1;
                day.gained += 1;
                addOpponent(opponents, oldOwnerId, playersById, "from", village.points);
                rows.push({ ...baseRow, mode: "gain", opponent: baseRow.oldOwner });
            }

            if (oldTribeId === tribeId) {
                lost += 1;
                day.lost += 1;
                addOpponent(opponents, newOwnerId, playersById, "to", village.points);
                rows.push({ ...baseRow, mode: "loss", opponent: baseRow.newOwner });
            }

            daily.set(dayKey, day);
            firstTs = firstTs ? Math.min(firstTs, timestamp) : timestamp;
            lastTs = Math.max(lastTs, timestamp);
        }

        const days = Array.from(daily.values()).sort((a, b) => a.ts - b.ts);
        let runningGained = 0;
        let runningLost = 0;
        const cumulative = days.map((day) => {
            runningGained += day.gained;
            runningLost += day.lost;
            return {
                key: day.key,
                ts: day.ts,
                value: runningGained - runningLost,
                gained: runningGained,
                lost: runningLost,
            };
        });

        return {
            gained,
            lost,
            net: gained - lost,
            firstTs,
            lastTs,
            days,
            cumulative,
            rows: rows.sort((a, b) => b.timestamp - a.timestamp),
            opponents: Array.from(opponents.values())
                .sort((a, b) => (b.from + b.to) - (a.from + a.to)),
        };
    }

    function addOpponent(opponents, id, playersById, key, points) {
        const current = opponents.get(id) || {
            id,
            name: playerName(playersById, id),
            from: 0,
            to: 0,
            points: 0,
        };
        current[key] += 1;
        current.points += Number.isFinite(points) ? points : 0;
        opponents.set(id, current);
    }

    function buildTwStatsLinks(playerId) {
        const world = twStatsWorldKey();
        const base = `https://pt.twstats.com/${encodeURIComponent(world)}/`;
        const profileUrl = `${base}index.php?page=tribe&id=${encodeURIComponent(playerId)}`;
        const allyProfileUrl = `${base}index.php?page=ally&id=${encodeURIComponent(playerId)}`;
        const graphs = [
            ["points", "Pontos"],
            ["villages", "Aldeias"],
            ["members", "Membros"],
            ["od", "OD"],
            ["oda", "OD ofensivo"],
            ["odd", "OD defensivo"],
            ["rank", "Rank"],
        ].map(([graph, label]) => ({
            graph,
            label,
            url: `${base}image.php?graph=${encodeURIComponent(graph)}&id=${encodeURIComponent(playerId)}&type=tribegraph`,
        }));

        return {
            world,
            profileUrl,
            historyUrl: `${profileUrl}&mode=history`,
            hourlyUrl: `${profileUrl}&mode=history&type=hourly`,
            hourlyUrls: [
                `${profileUrl}&mode=history&type=hourly`,
                `${profileUrl}&mode=history&view=hourly`,
                `${profileUrl}&mode=history&hourly=1`,
                `${profileUrl}&mode=history`,
                `${allyProfileUrl}&mode=history&type=hourly`,
                `${allyProfileUrl}&mode=history&view=hourly`,
                `${allyProfileUrl}&mode=history&hourly=1`,
                `${allyProfileUrl}&mode=history`,
            ],
            graphs,
        };
    }

    async function initTwStatsBridge() {
        const info = currentTwStatsPageInfo();
        if (!info.playerId || !info.world) return;

        const autoBridge = markAutoTwStatsBridge(info);
        const hourlyHref = findTwStatsHourlyHref(document);
        const hourlyKey = `${APP.id}:twstats-hourly:${info.world}:${info.playerId}`;
        if (hourlyHref && !/hour|hora/i.test(window.location.href) && !sessionStorage.getItem(hourlyKey)) {
            sessionStorage.setItem(hourlyKey, "1");
            window.location.href = hourlyHref;
            return;
        }

        const records = parseTwStatsHistoryRecords(document.documentElement.outerHTML, null);
        if (!records.length) {
            showTwStatsBridgeNotice(0);
            closeAutoTwStatsTab(autoBridge);
            return;
        }

        await gmSetValue(twStatsBridgeKey(info.world, info.playerId), {
            world: info.world,
            playerId: info.playerId,
            href: window.location.href,
            savedAt: Date.now(),
            records: records.slice(-240),
        });

        showTwStatsBridgeNotice(records.length);
        closeAutoTwStatsTab(autoBridge);
    }

    function markAutoTwStatsBridge(info) {
        const key = `${APP.id}:twstats-auto:${info.world}:${info.playerId}`;
        const params = new URLSearchParams(window.location.search);
        if (params.get("tpInfoAuto") === APP.id) {
            try { sessionStorage.setItem(key, "1"); } catch (_) {}
            return true;
        }

        try {
            return sessionStorage.getItem(key) === "1";
        } catch (_) {
            return false;
        }
    }

    function closeAutoTwStatsTab(enabled) {
        if (!enabled) return;
        window.setTimeout(() => {
            try { window.close(); } catch (_) {}
        }, 300);
    }

    function findTwStatsHourlyHref(doc) {
        const link = Array.from(doc.querySelectorAll("a[href]")).find((node) => {
            const text = fold(node.textContent);
            const href = fold(node.getAttribute("href") || "");
            return text.includes("hour") || text.includes("hora") || href.includes("hour") || href.includes("hora");
        });
        if (!link) return "";

        try {
            return new URL(link.getAttribute("href"), window.location.href).href;
        } catch (_) {
            return "";
        }
    }

    function currentTwStatsPageInfo() {
        const params = new URLSearchParams(window.location.search);
        const pathWorld = (window.location.pathname.match(/\/([^/]+)\//) || [])[1] || "";
        if (!["tribe", "ally"].includes(params.get("page"))) return { world: pathWorld.toLowerCase(), playerId: "" };
        return {
            world: pathWorld.toLowerCase(),
            playerId: /^\d+$/.test(params.get("id") || "") ? params.get("id") : "",
        };
    }

    function showTwStatsBridgeNotice(count) {
        if (document.getElementById(`${APP.id}-twstatsBridge`)) return;
        const notice = document.createElement("div");
        notice.id = `${APP.id}-twstatsBridge`;
        notice.textContent = count
            ? `${APP.displayTitle}: ${count} linhas de historico guardadas. Volta ao Tribal Wars e carrega Atualizar.`
            : `${APP.displayTitle}: nao encontrei linhas de historico nesta pagina TWStats. Confirma se estas no separador Historico da tribo.`;
        notice.style.cssText = [
            "position:fixed",
            "left:12px",
            "bottom:12px",
            "z-index:999999",
            "max-width:520px",
            "padding:8px 10px",
            "border:1px solid #7b201c",
            "background:#fff1bd",
            "color:#7d1713",
            "font:700 12px Verdana,Arial,sans-serif",
            "box-shadow:0 2px 8px rgba(0,0,0,.35)",
        ].join(";");
        document.body.appendChild(notice);
    }

    function twStatsBridgeKey(world, playerId) {
        return `${APP.id}:twstats-hourly-v3:${String(world || "").toLowerCase()}:${playerId}`;
    }

    async function loadTwStatsBaseline(playerId, current, now, periodInfo, force) {
        if (!periodInfo || !Number.isFinite(periodInfo.startMs) || !Number.isFinite(periodInfo.endMs)) {
            return { attempted: false, reason: "period" };
        }

        const links = buildTwStatsLinks(playerId);
        const storedBaseline = force ? null : await loadStoredTwStatsBaseline(links.world, playerId, current, now, periodInfo);
        if (storedBaseline && storedBaseline.snapshot) return storedBaseline;

        const urls = Array.from(new Set([
            ...(links.hourlyUrls || []),
            links.hourlyUrl,
            `${links.profileUrl}&mode=history`,
            links.profileUrl,
        ].filter(Boolean)));
        let lastMessage = "";

        for (const url of urls) {
            try {
                setStatus("A tentar historico horario TWStats...");
                const html = await fetchTwStatsText(url, force);
                const parsed = parseTwStatsBaselineFromHtml(html, current, now, periodInfo);
                if (parsed.snapshot) {
                    return {
                        attempted: true,
                        ok: true,
                        source: "twstats",
                        url,
                        snapshot: parsed.snapshot,
                        currentSnapshot: parsed.currentSnapshot || null,
                        message: parsed.message,
                    };
                }
                lastMessage = parsed.message || lastMessage;
            } catch (error) {
                const message = error && error.message ? error.message : String(error);
                lastMessage = message || lastMessage;
                if (/cloudflare|verificacao|bloque/i.test(message)) continue;
            }
        }

        const openedBaseline = await openTwStatsHistoryAndWait(links, playerId, current, now, periodInfo);
        if (openedBaseline && openedBaseline.snapshot) return openedBaseline;

        return {
            attempted: true,
            ok: false,
            source: "twstats",
            url: links.historyUrl,
            message: lastMessage || "TWStats nao devolveu linhas horarias suficientes para o dia escolhido.",
        };
    }

    async function loadStoredTwStatsBaseline(world, playerId, current, now, periodInfo) {
        const payload = await gmGetValue(twStatsBridgeKey(world, playerId), null);
        if (!payload || !Array.isArray(payload.records) || !payload.records.length) return null;
        const parsed = chooseTwStatsBaselineFromRecords(payload.records, current, now, periodInfo);
        if (!parsed.snapshot) {
            return {
                attempted: true,
                ok: false,
                source: "twstats",
                url: payload.href || "",
                message: `TWStats guardado (${payload.records.length} linhas), sem base utilizavel.`,
            };
        }
        return {
            attempted: true,
            ok: true,
            source: "twstats",
            url: payload.href || "",
            snapshot: parsed.snapshot,
            currentSnapshot: parsed.currentSnapshot || null,
            message: `${parsed.message} Fonte: pagina TWStats aberta no browser.`,
        };
    }

    async function openTwStatsHistoryAndWait(links, playerId, current, now, periodInfo) {
        if (typeof GM_openInTab !== "function" || typeof GM_addValueChangeListener !== "function") return null;

        const key = twStatsBridgeKey(links.world, playerId);
        const url = decorateTwStatsAutoUrl(links.hourlyUrl || links.historyUrl || links.profileUrl);
        const startAt = Date.now();
        let tab = null;

        try {
            setStatus("A abrir historico horario TWStats em segundo plano...");
            tab = GM_openInTab(url, { active: false, insert: true, setParent: true });
        } catch (_) {
            return null;
        }

        try {
            const payload = await waitForTwStatsBridgeValue(key, APP.twStatsBridgeWaitMs, startAt);
            if (!payload || !Array.isArray(payload.records) || !payload.records.length) return null;

            const parsed = chooseTwStatsBaselineFromRecords(payload.records, current, now, periodInfo);
            if (!parsed.snapshot) return null;

            return {
                attempted: true,
                ok: true,
                source: "twstats",
                url: payload.href || url,
                snapshot: parsed.snapshot,
                currentSnapshot: parsed.currentSnapshot || null,
                message: `${parsed.message} Fonte: TWStats aberto automaticamente.`,
            };
        } finally {
            try {
                if (tab && typeof tab.close === "function") tab.close();
            } catch (_) {}
        }
    }

    function decorateTwStatsAutoUrl(url) {
        try {
            const parsed = new URL(url, window.location.href);
            parsed.searchParams.set("tpInfoAuto", APP.id);
            return parsed.href;
        } catch (_) {
            return url;
        }
    }

    function waitForTwStatsBridgeValue(key, timeoutMs, startAt) {
        return new Promise((resolve) => {
            let finished = false;
            let listenerId = null;
            const isFresh = (value) => value &&
                Array.isArray(value.records) &&
                value.records.length &&
                (!Number.isFinite(value.savedAt) || value.savedAt >= startAt - 1000);
            const finish = (value) => {
                if (finished) return;
                finished = true;
                if (listenerId !== null && typeof GM_removeValueChangeListener === "function") {
                    try { GM_removeValueChangeListener(listenerId); } catch (_) {}
                }
                resolve(value || null);
            };

            gmGetValue(key, null).then((value) => {
                if (isFresh(value)) finish(value);
            });

            try {
                listenerId = GM_addValueChangeListener(key, (_name, _oldValue, newValue) => {
                    if (isFresh(newValue)) finish(newValue);
                });
            } catch (_) {}

            window.setTimeout(() => finish(null), timeoutMs);
        });
    }

    async function fetchTwStatsText(url, force) {
        const now = Date.now();
        const key = `twstats:${url}`;
        const cached = state.memoryCache.get(key);
        if (!force && cached && now - cached.time < APP.twStatsCacheMs) return cached.text;

        const text = await requestExternalText(url, APP.twStatsTimeoutMs);
        if (isTwStatsChallenge(text)) {
            throw new Error("TWStats pediu verificacao Cloudflare. Abre o TWStats uma vez no browser e volta a atualizar.");
        }

        state.memoryCache.set(key, { time: now, text });
        return text;
    }

    function requestExternalText(url, timeoutMs) {
        return new Promise((resolve, reject) => {
            const done = (text, status) => {
                if (status && (status < 200 || status >= 300)) {
                    reject(new Error(`TWStats respondeu ${status}.`));
                    return;
                }
                resolve(String(text || ""));
            };

            const fail = (error) => reject(new Error(error && error.message ? error.message : "Nao foi possivel contactar o TWStats."));

            if (typeof GM_xmlhttpRequest === "function") {
                GM_xmlhttpRequest({
                    method: "GET",
                    url,
                    timeout: timeoutMs,
                    anonymous: false,
                    headers: { "Accept": "text/html,application/xhtml+xml,*/*" },
                    onload: (response) => done(response.responseText, response.status),
                    onerror: fail,
                    ontimeout: () => reject(new Error("Tempo esgotado ao contactar o TWStats.")),
                });
                return;
            }

            if (typeof GM !== "undefined" && GM && typeof GM.xmlHttpRequest === "function") {
                GM.xmlHttpRequest({
                    method: "GET",
                    url,
                    timeout: timeoutMs,
                    anonymous: false,
                    headers: { "Accept": "text/html,application/xhtml+xml,*/*" },
                    onload: (response) => done(response.responseText, response.status),
                    onerror: fail,
                    ontimeout: () => reject(new Error("Tempo esgotado ao contactar o TWStats.")),
                });
                return;
            }

            fetch(url, {
                credentials: "include",
                cache: "no-store",
                headers: { "Accept": "text/html,application/xhtml+xml,*/*" },
            })
                .then((response) => {
                    if (!response.ok) throw new Error(`TWStats respondeu ${response.status}.`);
                    return response.text();
                })
                .then(resolve)
                .catch(fail);
        });
    }

    async function gmGetValue(key, fallback) {
        try {
            if (typeof GM_getValue === "function") return GM_getValue(key, fallback);
            if (typeof GM !== "undefined" && GM && typeof GM.getValue === "function") return await GM.getValue(key, fallback);
        } catch (_) {}
        return fallback;
    }

    async function gmSetValue(key, value) {
        try {
            if (typeof GM_setValue === "function") {
                GM_setValue(key, value);
                return true;
            }
            if (typeof GM !== "undefined" && GM && typeof GM.setValue === "function") {
                await GM.setValue(key, value);
                return true;
            }
        } catch (_) {}
        return false;
    }

    function isTwStatsChallenge(text) {
        return /just a moment|cf_chl|cloudflare|enable javascript and cookies/i.test(String(text || ""));
    }

    function parseTwStatsBaselineFromHtml(html, current, now, periodInfo) {
        const records = parseTwStatsHistoryRecords(html, current);
        return chooseTwStatsBaselineFromRecords(records, current, now, periodInfo);
    }

    function chooseTwStatsBaselineFromRecords(records, current, now, periodInfo) {
        const dailyPair = chooseTwStatsDailyDatePair(records, periodInfo);
        if (dailyPair) {
            return {
                snapshot: twStatsRecordToSnapshot(dailyPair.baseline, current),
                currentSnapshot: twStatsRecordToSnapshot(dailyPair.current, current),
                message: `Diario TWStats: ${formatDateOnly(new Date(dailyPair.current.ts))} comparado com ${formatDateOnly(new Date(dailyPair.baseline.ts))} (${records.length} linhas lidas).`,
            };
        }

        const hourlyPair = chooseTwStatsHourlyPair(records, periodInfo);
        if (hourlyPair) {
            return {
                snapshot: twStatsRecordToSnapshot(hourlyPair.baseline, current),
                currentSnapshot: twStatsRecordToSnapshot(hourlyPair.current, current),
                message: `Horario TWStats: ${formatDateTime(new Date(hourlyPair.baseline.ts))} ate ${formatDateTime(new Date(hourlyPair.current.ts))} (${records.length} linhas lidas).`,
            };
        }

        return { snapshot: null, message: `TWStats lido (${records.length} linhas), sem par horario suficiente para ${periodInfo && periodInfo.label ? periodInfo.label : "o periodo"}.` };
    }

    function chooseTwStatsDailyDatePair(records, periodInfo) {
        if (!periodInfo || !Number.isFinite(periodInfo.startMs)) return null;

        const ordered = (records || [])
            .filter((record) => record && Number.isFinite(record.ts))
            .filter((record) => twStatsRecordScore(record) >= 3)
            .sort((a, b) => a.ts - b.ts);
        if (ordered.length < 2 || !recordsLookDaily(ordered)) return null;

        const tolerance = 12 * 60 * 60 * 1000;
        const current = pickTwStatsRecordClosest(ordered, periodInfo.startMs, tolerance);
        const baseline = pickTwStatsRecordClosest(ordered, periodInfo.startMs - APP.dayMs, tolerance);

        if (!baseline || !current || current.ts <= baseline.ts) return null;
        return { baseline, current };
    }

    function recordsLookDaily(records) {
        const ordered = (records || []).filter((record) => record && Number.isFinite(record.ts));
        if (ordered.length < 2) return false;

        const midnightRows = ordered.filter((record) => isLocalDayStart(record.ts)).length;
        if (midnightRows / ordered.length >= 0.8) return true;

        const gaps = [];
        for (let index = 1; index < ordered.length; index += 1) {
            gaps.push(ordered[index].ts - ordered[index - 1].ts);
        }
        const dailyGaps = gaps.filter((gap) => gap >= 18 * 60 * 60 * 1000).length;
        return gaps.length > 0 && dailyGaps / gaps.length >= 0.8;
    }

    function isLocalDayStart(time) {
        const date = new Date(time);
        return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
    }

    function pickTwStatsRecordClosest(records, target, tolerance) {
        return (records || [])
            .map((record) => ({
                record,
                distance: Math.abs(record.ts - target),
            }))
            .filter((item) => item.distance <= tolerance)
            .sort((a, b) => a.distance - b.distance)[0]?.record || null;
    }

    function chooseTwStatsHourlyPair(records, periodInfo) {
        if (!periodInfo || !Number.isFinite(periodInfo.startMs) || !Number.isFinite(periodInfo.endMs)) return null;

        const ordered = (records || [])
            .filter((record) => record && Number.isFinite(record.ts))
            .filter((record) => record.ts <= periodInfo.endMs + 90 * 60 * 1000)
            .filter((record) => twStatsRecordScore(record) >= 3)
            .sort((a, b) => a.ts - b.ts);
        if (ordered.length < 2) return null;

        const startTolerance = 6 * 60 * 60 * 1000;
        const endTolerance = 6 * 60 * 60 * 1000;
        const baseline = pickTwStatsRecordNear(ordered, periodInfo.startMs, startTolerance, "start");
        const current = pickTwStatsRecordNear(ordered, periodInfo.endMs, endTolerance, "end");

        if (!baseline || !current || current.ts <= baseline.ts) return null;
        return { baseline, current };
    }

    function pickTwStatsRecordNear(records, target, tolerance, mode) {
        const preferBefore = mode === "start" || mode === "end";
        const directional = records
            .filter((record) => preferBefore ? record.ts <= target : true)
            .map((record) => ({
                record,
                distance: Math.abs(record.ts - target),
                before: target - record.ts,
            }))
            .filter((item) => item.distance <= tolerance)
            .sort((a, b) => a.distance - b.distance || Math.abs(a.before) - Math.abs(b.before));
        if (directional.length) return directional[0].record;

        return records
            .map((record) => ({
                record,
                distance: Math.abs(record.ts - target),
            }))
            .filter((item) => item.distance <= tolerance)
            .sort((a, b) => a.distance - b.distance)[0]?.record || null;
    }

    function chooseTwStatsDailyPair(records, now, periodHours) {
        if (periodHours !== 24) return null;

        const ordered = (records || [])
            .filter((record) => record && Number.isFinite(record.ts))
            .filter((record) => record.ts <= now + APP.dayMs)
            .filter((record) => twStatsRecordScore(record) >= 3)
            .sort((a, b) => a.ts - b.ts);
        if (ordered.length < 2) return null;

        const latest = ordered[ordered.length - 1];
        const target = latest.ts - periodToMs(periodHours);
        const baseline = ordered
            .slice(0, -1)
            .map((record) => ({
                record,
                distance: Math.abs(record.ts - target),
            }))
            .filter((item) => item.distance <= APP.twStatsBaselineToleranceMs)
            .sort((a, b) => a.distance - b.distance)[0];

        if (!baseline) return null;
        return {
            current: latest,
            baseline: baseline.record,
        };
    }

    function twStatsRecordScore(record) {
        return ["points", "villages", "members", "rank", "odTotal", "odOff", "odDef", "odSupport"]
            .reduce((count, key) => count + (Number.isFinite(record && record[key]) ? 1 : 0), 0);
    }

    function twStatsRecordToSnapshot(record, current) {
        const total = twStatsOdEntry(record.odTotal);
        const off = twStatsOdEntry(record.odOff);
        const def = twStatsOdEntry(record.odDef);
        const support = twStatsOdEntry(record.odSupport) || twStatsOdEntry(deriveSupportScore(total, off, def));

        return {
            ts: record.ts,
            playerId: current && current.playerId,
            name: current && current.name,
            points: Number.isFinite(record.points) ? record.points : (current && current.points),
            villages: Number.isFinite(record.villages) ? record.villages : (current && current.villages),
            members: Number.isFinite(record.members) ? record.members : (current && current.members),
            rank: Number.isFinite(record.rank) ? record.rank : (current && current.rank),
            od: {
                total,
                off,
                def,
                support,
            },
            source: "twstats",
        };
    }

    function mergeTwStatsCurrent(current, snapshot) {
        if (!snapshot) return current;
        return {
            ...current,
            points: Number.isFinite(snapshot.points) ? snapshot.points : current.points,
            villages: Number.isFinite(snapshot.villages) ? snapshot.villages : current.villages,
            members: Number.isFinite(snapshot.members) ? snapshot.members : current.members,
            rank: Number.isFinite(snapshot.rank) ? snapshot.rank : current.rank,
            od: {
                total: snapshot.od && snapshot.od.total ? snapshot.od.total : current.od.total,
                off: snapshot.od && snapshot.od.off ? snapshot.od.off : current.od.off,
                def: snapshot.od && snapshot.od.def ? snapshot.od.def : current.od.def,
                support: snapshot.od && snapshot.od.support ? snapshot.od.support : current.od.support,
            },
            source: "twstats",
        };
    }

    function twStatsOdEntry(score) {
        return Number.isFinite(score) ? { score, rank: null } : null;
    }

    function parseTwStatsHistoryRecords(html, current) {
        const records = [];
        const doc = new DOMParser().parseFromString(String(html || ""), "text/html");

        Array.from(doc.querySelectorAll("table")).forEach((table) => {
            let headers = [];
            Array.from(table.querySelectorAll("tr")).forEach((row) => {
                const headerCells = Array.from(row.querySelectorAll("th"));
                const cells = Array.from(row.querySelectorAll("th,td"));
                const texts = cells.map((cell) => cleanText(cell.textContent));
                if (!texts.length) return;

                const rowDate = parseTwStatsDate(texts.join(" "));
                if (!rowDate) {
                    const possibleHeaders = texts.filter(Boolean);
                    if (possibleHeaders.some((text) => twStatsHeaderKey(text))) headers = possibleHeaders;
                    return;
                }

                const values = extractTwStatsValues(headers, texts, current);
                if (hasTwStatsValue(values)) {
                    records.push({
                        ts: rowDate,
                        ...values,
                    });
                }
            });
        });

        if (!records.length) {
            records.push(...parseTwStatsLooseRecords(doc, current));
        }

        return records
            .filter((record, index, list) => list.findIndex((item) => item.ts === record.ts) === index)
            .sort((a, b) => a.ts - b.ts);
    }

    function parseTwStatsLooseRecords(doc, current) {
        const records = [];
        const nodes = Array.from(doc.querySelectorAll("tr, li, p, div"));
        nodes.forEach((node) => {
            const text = cleanText(node.textContent);
            if (!text || text.length < 12) return;

            const rowDate = parseTwStatsDate(text);
            if (!rowDate) return;

            const values = inferTwStatsValues([text], current);
            if (hasTwStatsValue(values)) {
                records.push({
                    ts: rowDate,
                    ...values,
                });
            }
        });
        return records;
    }

    function extractTwStatsValues(headers, texts, current) {
        const values = {};
        const aligned = headers && headers.length === texts.length ? headers : [];
        if (aligned.length) {
            texts.forEach((text, index) => {
                const key = twStatsHeaderKey(aligned[index]);
                const value = parseTwStatsCellNumber(key, text);
                if (key && Number.isFinite(value)) values[key] = value;
            });
        }

        if (!hasTwStatsValue(values)) {
            return inferTwStatsValues(texts, current);
        }

        return values;
    }

    function parseTwStatsCellNumber(key, text) {
        const value = parseTwStatsNumber(text);
        if (Number.isFinite(value)) return value;

        const raw = cleanText(text);
        if (/^[-=]+$/.test(raw) && /^od/.test(String(key || ""))) return 0;
        return null;
    }

    function inferTwStatsValues(texts, current) {
        const numbers = texts
            .flatMap((text) => {
                const values = parseTwStatsNumbers(text);
                if (parseTwStatsDate(text) && values.length <= 3) return [];
                return values;
            });
        const values = {};
        const used = new Set();

        values.points = pickClosestNumber(numbers, current && current.points, used);
        values.villages = pickClosestNumber(numbers, current && current.villages, used);
        values.members = pickClosestNumber(numbers, current && current.members, used);
        values.rank = pickClosestNumber(numbers, current && current.rank, used);
        values.odTotal = pickClosestNumber(numbers, current && current.od && current.od.total && current.od.total.score, used);
        values.odOff = pickClosestNumber(numbers, current && current.od && current.od.off && current.od.off.score, used);
        values.odDef = pickClosestNumber(numbers, current && current.od && current.od.def && current.od.def.score, used);
        values.odSupport = pickClosestNumber(numbers, current && current.od && current.od.support && current.od.support.score, used);

        Object.keys(values).forEach((key) => {
            if (!Number.isFinite(values[key])) delete values[key];
        });
        return values;
    }

    function pickClosestNumber(numbers, target, used) {
        if (!Number.isFinite(target)) return null;
        let bestIndex = -1;
        let bestDistance = Infinity;
        numbers.forEach((value, index) => {
            if (used.has(index) || !Number.isFinite(value)) return;
            const distance = Math.abs(value - target);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = index;
            }
        });
        if (bestIndex < 0) return null;
        used.add(bestIndex);
        return numbers[bestIndex];
    }

    function hasTwStatsValue(values) {
        return !!values && ["points", "villages", "members", "rank", "odTotal", "odOff", "odDef", "odSupport"]
            .some((key) => Number.isFinite(values[key]));
    }

    function twStatsHeaderKey(header) {
        const text = fold(header);
        if (!text) return "";
        if (text === "data" || text === "date" || text.includes("jogador") || text.includes("player") || text.includes("tribo") || text.includes("tribe")) return "";
        if (text.includes("pontos") || text === "points" || text.includes("score")) return "points";
        if (text.includes("aldeias") || text.includes("villages") || text === "vills" || text === "vill") return "villages";
        if (text.includes("membros") || text.includes("members")) return "members";
        if (text.includes("rank") || text.includes("ranking") || text.includes("classificacao") || text.includes("posicao")) return "rank";
        if (text === "oda" || text.startsWith("oda ") || text.includes("od ataque") || text.includes("od ofens") || text.includes("ofensivo") || text.includes("atacante") || text.includes("attacker") || text.includes("offensive") || text.includes("attack")) return "odOff";
        if (text === "odd" || text.startsWith("odd ") || text.includes("od defesa") || text.includes("od defens") || text.includes("defensivo") || text.includes("defensor") || text.includes("defender") || text.includes("defensive")) return "odDef";
        if (text === "ods" || text.includes("od apoio") || text.includes("apoio") || text.includes("support")) return "odSupport";
        if (text === "od" || text.startsWith("od ") || text.includes("od total") || text.includes("bash") || text.includes("oponentes") || text.includes("derrotados") || text.includes("total od")) return "odTotal";
        return "";
    }

    function parseTwStatsDate(text) {
        const value = cleanText(text);
        let match = value.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[,\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (match) return buildLocalTime(+match[1], +match[2], +match[3], +match[4] || 0, +match[5] || 0, +match[6] || 0);

        match = value.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (match) {
            let year = +match[3];
            if (year < 100) year += year < 70 ? 2000 : 1900;
            return buildLocalTime(year, +match[2], +match[1], +match[4] || 0, +match[5] || 0, +match[6] || 0);
        }

        match = value.match(/(\d{1,2})[-/.](\d{1,2})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (match) {
            const year = new Date().getFullYear();
            return normalizeTwStatsTime(buildLocalTime(year, +match[2], +match[1], +match[3] || 0, +match[4] || 0, +match[5] || 0));
        }

        const folded = fold(value);
        match = folded.match(/(\d{1,2})\s+([a-z]+)\s+(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (match) {
            const month = twStatsMonthNumber(match[2]);
            if (!month) return null;
            let year = +match[3];
            if (year < 100) year += year < 70 ? 2000 : 1900;
            return buildLocalTime(year, month, +match[1], +match[4] || 0, +match[5] || 0, +match[6] || 0);
        }

        match = folded.match(/(\d{1,2})\s+([a-z]+)(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (match) {
            const month = twStatsMonthNumber(match[2]);
            if (!month) return null;
            const year = new Date().getFullYear();
            return normalizeTwStatsTime(buildLocalTime(year, month, +match[1], +match[3] || 0, +match[4] || 0, +match[5] || 0));
        }

        match = folded.match(/([a-z]+)\s+(\d{1,2}),?\s+(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (!match) return null;
        const month = twStatsMonthNumber(match[1]);
        if (!month) return null;
        let year = +match[3];
        if (year < 100) year += year < 70 ? 2000 : 1900;
        return buildLocalTime(year, month, +match[2], +match[4] || 0, +match[5] || 0, +match[6] || 0);
    }

    function normalizeTwStatsTime(time) {
        if (!Number.isFinite(time)) return null;
        const now = Date.now();
        if (time > now + APP.dayMs) {
            const date = new Date(time);
            date.setFullYear(date.getFullYear() - 1);
            return date.getTime();
        }
        return time;
    }

    function twStatsMonthNumber(monthText) {
        const key = fold(monthText).slice(0, 3);
        return {
            jan: 1,
            fev: 2,
            feb: 2,
            mar: 3,
            abr: 4,
            apr: 4,
            mai: 5,
            may: 5,
            jun: 6,
            jul: 7,
            ago: 8,
            aug: 8,
            set: 9,
            sep: 9,
            out: 10,
            oct: 10,
            nov: 11,
            dez: 12,
            dec: 12,
        }[key] || null;
    }

    function buildLocalTime(year, month, day, hour, minute, second) {
        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
        const date = new Date(year, month - 1, day, hour, minute, second);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
        const time = date.getTime();
        return Number.isFinite(time) ? time : null;
    }

    function parseTwStatsNumber(text) {
        const numbers = parseTwStatsNumbers(text);
        return numbers.length ? numbers[0] : null;
    }

    function parseTwStatsNumbers(text) {
        const raw = cleanText(text);
        const matches = raw.match(/[+-]?\d[\d.,]*(?:\s*[kKmM])?/g) || [];
        return matches
            .map((match) => parseTwStatsNumberToken(match))
            .filter(Number.isFinite);
    }

    function parseTwStatsNumberToken(token) {
        const raw = cleanText(token);
        const multiplier = /\d\s*k\b/i.test(raw) ? 1000 : (/\d\s*m\b/i.test(raw) ? 1000000 : 1);
        let value = raw.replace(/[^\d,.]/g, "");
        if (!/[0-9]/.test(value)) return null;
        value = value
            .replace(/[.,](?=\d{3}(?:\D|$))/g, "")
            .replace(/,/g, ".");
        const number = multiplier > 1 ? Number.parseFloat(value) * multiplier : Number.parseInt(value, 10);
        return Number.isFinite(number) ? Math.round(number) : null;
    }

    function twStatsWorldKey() {
        const hostPart = window.location.hostname.split(".")[0].toLowerCase();
        if (/^[a-z]{2}(?:p|c)?\d+$/i.test(hostPart)) return hostPart;

        const gameData = pageGameData();
        const world = String(gameData.world || "").toLowerCase();
        if (/^[a-z]{2}(?:p|c)?\d+$/i.test(world)) return world;
        return hostPart || "en1";
    }

    function fallbackVillage(id) {
        return {
            id,
            name: `Aldeia #${id}`,
            x: 0,
            y: 0,
            coords: "-",
            playerId: 0,
            points: 0,
        };
    }

    function playerName(playersById, id) {
        const player = playersById.get(id);
        if (player) return player.name;
        if (id === 0) return "Barbaros";
        return `Jogador #${id}`;
    }

    function buildDiffs(current, baseline) {
        if (!baseline) {
            return {
                points: null,
                villages: null,
                members: null,
                rank: null,
                od: {
                    total: null,
                    off: null,
                    def: null,
                    support: null,
                },
            };
        }

        return {
            points: diffNumber(current.points, baseline.points),
            villages: diffNumber(current.villages, baseline.villages),
            members: diffNumber(current.members, baseline.members),
            rank: diffNumber(current.rank, baseline.rank),
            od: {
                total: diffScore(current.od.total, baseline.od && baseline.od.total),
                off: diffScore(current.od.off, baseline.od && baseline.od.off),
                def: diffScore(current.od.def, baseline.od && baseline.od.def),
                support: diffScore(current.od.support, baseline.od && baseline.od.support),
            },
        };
    }

    function buildPrecisionInfo(now, periodHours, baseline, conquests, todayConquests, externalBaseline, localBaseline) {
        const targetAgeMs = periodToMs(periodHours);
        const baselineAgeMs = baseline && Number.isFinite(baseline.ts) ? now - baseline.ts : null;
        const offsetMs = baselineAgeMs === null ? null : baselineAgeMs - targetAgeMs;
        return {
            periodHours,
            baselineSource: baseline && baseline.source ? baseline.source : (baseline ? "local" : ""),
            baselineTs: baseline && Number.isFinite(baseline.ts) ? baseline.ts : null,
            baselineAgeMs,
            baselineOffsetMs: offsetMs,
            baselineExact: offsetMs !== null && Math.abs(offsetMs) <= APP.minSnapshotGapMs,
            hasBaseline: !!baseline,
            externalAttempted: !!(externalBaseline && externalBaseline.attempted),
            externalOk: !!(externalBaseline && externalBaseline.ok),
            externalMessage: externalBaseline && externalBaseline.message ? externalBaseline.message : "",
            externalUrl: externalBaseline && externalBaseline.url ? externalBaseline.url : "",
            localFallback: !!(baseline && localBaseline && baseline === localBaseline && externalBaseline && externalBaseline.attempted && !externalBaseline.ok),
            conquestsExact: true,
            conquestsRows: (conquests && conquests.gained ? conquests.gained.length : 0) + (conquests && conquests.lost ? conquests.lost.length : 0),
            todayConquestsExact: true,
            todayConquestsRows: (todayConquests && todayConquests.gained ? todayConquests.gained.length : 0) + (todayConquests && todayConquests.lost ? todayConquests.lost.length : 0),
        };
    }

    function diffNumber(current, previous) {
        if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
        return current - previous;
    }

    function diffScore(current, previous) {
        if (!current || !previous) return null;
        if (!Number.isFinite(current.score) || !Number.isFinite(previous.score)) return null;
        return current.score - previous.score;
    }

    function chooseBaseline(history, now, periodHours) {
        const target = now - periodToMs(periodHours);
        const candidates = history
            .filter((snapshot) => snapshot && Number.isFinite(snapshot.ts) && snapshot.ts < now - APP.minSnapshotGapMs)
            .map((snapshot) => ({
                snapshot,
                distance: Math.abs(snapshot.ts - target),
                age: now - snapshot.ts,
            }))
            .filter((item) => item.distance <= APP.baselineToleranceMs)
            .sort((a, b) => a.distance - b.distance);

        return candidates[0] ? candidates[0].snapshot : null;
    }

    function mergeBaselineHistory(snapshots, dailySnapshots) {
        const byTime = new Map();
        (snapshots || []).forEach((snapshot) => {
            if (snapshot && Number.isFinite(snapshot.ts)) byTime.set(snapshot.ts, snapshot);
        });
        (dailySnapshots || []).forEach((entry) => {
            if (entry && Number.isFinite(entry.ts)) byTime.set(entry.ts, dailyEntryToSnapshot(entry));
        });
        return Array.from(byTime.values()).sort((a, b) => a.ts - b.ts);
    }

    function dailyEntryToSnapshot(entry) {
        return {
            ts: entry.ts,
            playerId: entry.playerId,
            name: entry.name,
            points: entry.points,
            villages: entry.villages,
            members: entry.members,
            rank: entry.rank,
            od: entry.od || {},
        };
    }

    function loadSnapshots(playerId) {
        try {
            const raw = window.localStorage.getItem(snapshotKey(playerId));
            const parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((snapshot) => snapshot && Number.isFinite(snapshot.ts))
                .sort((a, b) => a.ts - b.ts);
        } catch (_) {
            return [];
        }
    }

    function saveSnapshot(snapshot) {
        const key = snapshotKey(snapshot.playerId);
        const now = snapshot.ts;
        let history = loadSnapshots(snapshot.playerId)
            .filter((item) => now - item.ts <= APP.snapshotRetentionMs);

        const recentIndex = history.findIndex((item) => Math.abs(item.ts - snapshot.ts) < APP.minSnapshotGapMs);
        if (recentIndex >= 0) {
            history[recentIndex] = snapshot;
        } else {
            history.push(snapshot);
        }

        history = history
            .sort((a, b) => a.ts - b.ts)
            .slice(-APP.maxSnapshotsPerPlayer);

        try {
            window.localStorage.setItem(key, JSON.stringify(history));
        } catch (_) {
            // Se o armazenamento estiver cheio, o resumo atual continua a funcionar.
        }
    }

    function snapshotKey(playerId) {
        return `${APP.id}:snapshots:${window.location.host}:${playerId}`;
    }

    function loadDailySnapshots(playerId) {
        try {
            const raw = window.localStorage.getItem(dailySnapshotKey(playerId));
            const parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((snapshot) => snapshot && snapshot.day && Number.isFinite(snapshot.ts))
                .sort((a, b) => a.ts - b.ts);
        } catch (_) {
            return [];
        }
    }

    function saveDailySnapshot(snapshot) {
        const key = dailySnapshotKey(snapshot.playerId);
        const now = snapshot.ts;
        const entry = snapshotToDailyEntry(snapshot);
        const byDay = new Map(loadDailySnapshots(snapshot.playerId)
            .filter((item) => now - item.ts <= APP.dailySnapshotRetentionMs)
            .map((item) => [item.day, item]));

        byDay.set(entry.day, entry);

        const values = Array.from(byDay.values()).sort((a, b) => a.ts - b.ts);

        try {
            window.localStorage.setItem(key, JSON.stringify(values));
        } catch (_) {
            try {
                window.localStorage.setItem(key, JSON.stringify(values.map(compactStoredDailyEntry)));
            } catch (_) {
                // O resumo atual continua funcional mesmo sem historico diario local.
            }
        }
    }

    function compactStoredDailyEntry(entry) {
        return {
            ...entry,
            villagesArchive: entry.villagesArchive ? {
                count: entry.villagesArchive.count,
                coords: entry.villagesArchive.coords,
                continents: entry.villagesArchive.continents,
                rows: [],
            } : null,
            conquestsDay: entry.conquestsDay ? {
                gained: entry.conquestsDay.gained,
                lost: entry.conquestsDay.lost,
                net: entry.conquestsDay.net,
                rows: (entry.conquestsDay.rows || []).slice(0, 20),
            } : null,
        };
    }

    function buildDailyStats(history, current) {
        const byDay = new Map((history || []).map((entry) => [entry.day, entry]));
        byDay.set(dayKeyFromMs(current.ts), snapshotToDailyEntry(current));

        const rows = Array.from(byDay.values())
            .sort((a, b) => a.ts - b.ts)
            .map((entry, index, list) => dailyRowWithDiff(entry, list[index - 1] || null));

        return {
            today: rows[rows.length - 1] || null,
            rows: rows.slice(-45).reverse(),
        };
    }

    function dailyRowWithDiff(entry, previous) {
        return {
            day: entry.day,
            ts: entry.ts,
            points: entry.points,
            villages: entry.villages,
            members: entry.members,
            rank: entry.rank,
            tribe: entry.tribe || {},
            od: entry.od || {},
            metrics: entry.metrics || {},
            villagesArchive: entry.villagesArchive || null,
            conquestsDay: entry.conquestsDay || null,
            allTimeSummary: entry.allTimeSummary || null,
            precision: {
                previousTs: previous && Number.isFinite(previous.ts) ? previous.ts : null,
                gapMs: previous && Number.isFinite(previous.ts) ? entry.ts - previous.ts : null,
                exactDay: previous && Number.isFinite(previous.ts) ? Math.abs((entry.ts - previous.ts) - APP.dayMs) <= APP.baselineToleranceMs : false,
            },
            diff: {
                points: previous ? diffNumber(entry.points, previous.points) : null,
                villages: previous ? diffNumber(entry.villages, previous.villages) : null,
                members: previous ? diffNumber(entry.members, previous.members) : null,
                rank: previous ? diffNumber(entry.rank, previous.rank) : null,
                od: {
                    total: previous ? diffScore(entry.od && entry.od.total, previous.od && previous.od.total) : null,
                    off: previous ? diffScore(entry.od && entry.od.off, previous.od && previous.od.off) : null,
                    def: previous ? diffScore(entry.od && entry.od.def, previous.od && previous.od.def) : null,
                    support: previous ? diffScore(entry.od && entry.od.support, previous.od && previous.od.support) : null,
                },
            },
        };
    }

    function snapshotToDailyEntry(snapshot) {
        return {
            day: dayKeyFromMs(snapshot.ts),
            ts: snapshot.ts,
            playerId: snapshot.playerId,
            name: snapshot.name,
            tribe: snapshot.tribe || {},
            points: snapshot.points,
            villages: snapshot.villages,
            members: snapshot.members,
            rank: snapshot.rank,
            od: snapshot.od || {},
            metrics: snapshot.metrics || {},
            villagesArchive: snapshot.villagesArchive || null,
            conquestsDay: snapshot.conquestsDay || null,
            allTimeSummary: snapshot.allTimeSummary || null,
        };
    }

    function dailySnapshotKey(playerId) {
        return `${APP.id}:daily:${window.location.host}:${playerId}`;
    }

    function renderResult(result) {
        const summaryContent = `
            <div class="${APP.id}-playerHead">
                <div>
                    <a href="/game.php?screen=info_ally&id=${result.player.id}" target="_blank" rel="noopener">${escapeHTML(result.player.tag)}</a>
                    <span>#${result.player.id} - ${escapeHTML(result.player.name)} - ${escapeHTML(result.period.label)}</span>
                </div>
                <small class="${APP.id}-sourceBadge" title="${escapeHTML(baselineStatusTitle(result.precision))}">${escapeHTML(baselineStatusLabel(result.precision))}</small>
            </div>

            <div class="${APP.id}-grid ${APP.id}-summaryGrid">
                ${metricCard("Pontos", formatNumber(result.current.points), result.diffs.points)}
                ${metricCard("Aldeias", formatNumber(result.current.villages), result.diffs.villages)}
                ${metricCard("Membros", formatNumber(result.current.members), result.diffs.members)}
                ${metricCard("Rank", `#${formatNumber(result.current.rank)}`, result.diffs.rank, true)}
                ${metricCard("Ganhas / Perdidas", `${formatNumber(result.conquests.gained.length)} / ${formatNumber(result.conquests.lost.length)}`, result.conquests.net)}
                ${metricCard("OD Total", formatNumber(result.current.od.total && result.current.od.total.score), result.diffs.od.total)}
                ${metricCard("OD Ofensivo", formatNumber(result.current.od.off && result.current.od.off.score), result.diffs.od.off)}
                ${metricCard("OD Defensivo", formatNumber(result.current.od.def && result.current.od.def.score), result.diffs.od.def)}
                ${metricCard("OD Apoio", formatNumber(result.current.od.support && result.current.od.support.score), result.diffs.od.support)}
            </div>
        `;

        const odContent = `
            <div class="${APP.id}-tableWrap">
                <table class="${APP.id}-table ${APP.id}-odTable">
                    <thead>
                        <tr>
                            <th>TIPO</th>
                            <th>PONTOS</th>
                            <th>RANK</th>
                            <th>${escapeHTML(result.period.shortLabel)}</th>
                        </tr>
                    </thead>
                    <tbody>
                    ${odRow("Total", result.current.od.total, result.diffs.od.total)}
                    ${odRow("Ofensivo", result.current.od.off, result.diffs.od.off)}
                    ${odRow("Defensivo", result.current.od.def, result.diffs.od.def)}
                    ${odRow("Apoio", result.current.od.support, result.diffs.od.support)}
                    </tbody>
                </table>
                </div>
        `;

        state.controls.body.innerHTML = `
            ${panelRow("RESUMO", `Totais do periodo selecionado: ${result.period.label}.`, summaryContent, "summaryRow", true)}
            ${panelRow("ALDEIAS", "Coordenadas atuais da tribo, todas e por continente.", renderVillageCoordinates(result.villagesSummary), "villagesRow", false)}
            ${panelRow("MUNDO", "Stats desde o inicio do mundo pelo historico publico de conquistas.", renderAllTimeStats(result.allTime), "worldStatsRow", false)}
            ${panelRow("TWSTATS", "Graficos historicos externos, quando o mundo existe no TWStats.", renderTwStatsGraphs(result.twstats), "chartsRow", false)}
            ${panelRow("OD", "Pontos ofensivos, defensivos e apoio.", odContent, "odSectionRow", false)}
            ${panelRow("CONQUISTAS", `Aldeias ganhas e perdidas pela tribo em ${result.period.label}.`, renderConquestTable(result.conquests.gained, result.conquests.lost, result.period.label), "resultsRow", false)}
        `;
    }

    function panelRow(title, description, content, className, expanded) {
        const isExpanded = expanded ? "true" : "false";
        return `
            <section class="${APP.id}-panelRow ${APP.id}-${className || "row"} ${expanded ? `${APP.id}-panelRowOpen` : ""}" data-${APP.id}-row>
                <aside class="${APP.id}-rowLabel">
                    <strong>${sectionIcon(title)}<span>${escapeHTML(title)}</span></strong>
                    <span>${escapeHTML(description)}</span>
                </aside>
                <div class="${APP.id}-rowContent">
                    <button type="button" class="${APP.id}-sectionToggle" data-${APP.id}-toggle aria-expanded="${isExpanded}" aria-label="${expanded ? "Esconder detalhes" : "Mostrar detalhes"}" title="${expanded ? "Esconder detalhes" : "Mostrar detalhes"}">
                        ${expanded ? "-" : "+"}
                    </button>
                    <div class="${APP.id}-sectionContent">
                        ${content}
                    </div>
                </div>
            </section>
        `;
    }

    function renderPrecisionNotice(precision) {
        if (!precision) return "";
        const sourceText = precision.baselineSource === "twstats" ? "historico TWStats" : "snapshot local";
        const baselineText = precision.hasBaseline
            ? `Pontos/rank/OD comparados com ${sourceText} de ${formatDuration(precision.baselineAgeMs)} atras (${formatOffset(precision.baselineOffsetMs)} do alvo).`
            : "Pontos/rank/OD sem historico TWStats suficiente para comparar este periodo.";
        const externalText = precision.externalAttempted && precision.externalMessage
            ? `<span>${escapeHTML(precision.externalMessage)}</span>`
            : "";
        const fallbackText = precision.localFallback
            ? `<span>TWStats indisponivel; foi usado fallback local guardado pelo script.</span>`
            : "";
        return `
            <div class="${APP.id}-precisionBox">
                <strong>Precisao dos dados</strong>
                <span>Conquistas: exatas por timestamp do /map/conquer.txt completo.</span>
                <span>${escapeHTML(baselineText)}</span>
                ${externalText}
                ${fallbackText}
            </div>
        `;
    }

    function baselineStatusLabel(precision) {
        if (!precision || !precision.hasBaseline) {
            if (precision && precision.externalMessage) {
                const lines = String(precision.externalMessage).match(/TWStats lido \((\d+) linhas\)/i);
                if (lines) return `TWStats ${lines[1]} linhas`;
                if (/cloudflare|verificacao/i.test(precision.externalMessage)) return "TWStats bloqueado";
                if (/tempo esgotado|contactar/i.test(precision.externalMessage)) return "TWStats erro";
            }
            return "sem base TWStats";
        }
        if (precision.baselineSource === "twstats") {
            if (/horario twstats/i.test(precision.externalMessage || "")) return "TWStats horario";
            if (/diario twstats/i.test(precision.externalMessage || "")) return "TWStats diario";
            return "TWStats";
        }
        if (precision.localFallback) return "fallback local";
        return "local";
    }

    function baselineStatusTitle(precision) {
        if (!precision) return "Sem informacao de origem para o periodo selecionado.";
        if (precision.baselineSource === "twstats") return precision.externalMessage || "Dados do periodo selecionado calculados pelo historico TWStats.";
        if (precision.localFallback) return precision.externalMessage || "TWStats indisponivel; usado fallback local.";
        return precision.externalMessage || "Sem linha utilizavel do historico TWStats para o periodo selecionado.";
    }

    function formatOffset(ms) {
        if (!Number.isFinite(ms)) return "sem desvio calculado";
        if (Math.abs(ms) < 60000) return "sem desvio";
        const text = formatDuration(Math.abs(ms));
        return ms > 0 ? `+${text}` : `-${text}`;
    }

    function sectionIcon(title) {
        const icons = {
            jogador: "&#9817;",
            tribo: "&#9819;",
            resumo: "&#9638;",
            aldeias: "&#8962;",
            mundo: "&#9673;",
            twstats: "TW",
            od: "OD",
            conquistas: "&#9873;",
            acoes: "&#10003;",
        };
        const key = fold(title);
        return `<span class="${APP.id}-sectionIcon" aria-hidden="true">${icons[key] || "&#9632;"}</span>`;
    }

    function togglePanelRow(button) {
        const row = button.closest(`[data-${APP.id}-row]`);
        if (!row) return;

        const open = !row.classList.contains(`${APP.id}-panelRowOpen`);
        row.classList.toggle(`${APP.id}-panelRowOpen`, open);
        button.setAttribute("aria-expanded", open ? "true" : "false");
        button.setAttribute("aria-label", open ? "Esconder detalhes" : "Mostrar detalhes");
        button.title = open ? "Esconder detalhes" : "Mostrar detalhes";
        button.textContent = open ? "-" : "+";
    }

    function renderDailyArchive(rows) {
        if (!rows || !rows.length) {
            return `<div class="${APP.id}-emptyList">Ainda nao existe arquivo diario para esta tribo.</div>`;
        }

        const latest = rows[0];
        const latestArchive = latest && latest.villagesArchive ? latest.villagesArchive : null;
        return `
            <div class="${APP.id}-archiveActions">
                <button type="button" data-${APP.id}-export="json">Exportar JSON</button>
                <button type="button" data-${APP.id}-export="csv">Exportar CSV</button>
                <span>${formatNumber(rows.length)} registos diarios guardados</span>
            </div>
            <div class="${APP.id}-tableWrap ${APP.id}-archiveWrap">
                <table class="${APP.id}-table ${APP.id}-archiveTable">
                    <thead>
                        <tr>
                            <th>DIA</th>
                            <th>BASE</th>
                            <th>TRIBO</th>
                            <th>PONTOS</th>
                            <th>+PTS</th>
                            <th>ALD</th>
                            <th>RANK</th>
                            <th>OD</th>
                            <th>OD OF</th>
                            <th>OD DEF</th>
                            <th>OD APOIO</th>
                            <th>G/P DIA</th>
                            <th>MEDIA ALD</th>
                            <th>OD/PTS</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => `
                            <tr>
                                <td>${escapeHTML(formatDateOnly(new Date(row.ts)))}</td>
                                <td>${escapeHTML(formatDailyPrecision(row.precision))}</td>
                                <td>${escapeHTML(row.tribe && row.tribe.tag ? row.tribe.tag : "-")}</td>
                                <td>${formatNumber(row.points)}</td>
                                <td><em class="${deltaClass(row.diff.points, false)}">${escapeHTML(formatDelta(row.diff.points))}</em></td>
                                <td>${formatNumber(row.villages)}</td>
                                <td>#${formatNumber(row.rank)}</td>
                                <td>${formatNumber(row.metrics && row.metrics.odTotal)}</td>
                                <td>${formatNumber(row.metrics && row.metrics.odOff)}</td>
                                <td>${formatNumber(row.metrics && row.metrics.odDef)}</td>
                                <td>${formatNumber(row.metrics && row.metrics.odSupport)}</td>
                                <td>${formatNumber(row.conquestsDay && row.conquestsDay.gained)} / ${formatNumber(row.conquestsDay && row.conquestsDay.lost)}</td>
                                <td>${formatNumber(row.metrics && row.metrics.averageVillagePoints)}</td>
                                <td>${formatMetric(row.metrics && row.metrics.odPerPoint)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
            ${renderLatestArchiveDetails(latestArchive)}
        `;
    }

    function renderLatestArchiveDetails(archive) {
        if (!archive || !archive.continents || !archive.continents.length) return "";
        return `
            <div class="${APP.id}-archiveDetails">
                <label class="${APP.id}-coordsField ${APP.id}-coordsAll">
                    <span>Ultimo registo - todas as coordenadas (${formatNumber(archive.count)})</span>
                    <textarea readonly rows="3">${escapeTextArea((archive.coords || []).join(" "))}</textarea>
                </label>
                <div class="${APP.id}-continentGrid">
                    ${archive.continents.map((group) => `
                        <label class="${APP.id}-coordsField">
                            <span>${escapeHTML(group.continent)} (${formatNumber(group.count)}) - ${formatNumber(group.points)} pts</span>
                            <textarea readonly rows="3">${escapeTextArea((group.coords || []).join(" "))}</textarea>
                        </label>
                    `).join("")}
                </div>
            </div>
        `;
    }

    function formatDailyPrecision(precision) {
        if (!precision || !Number.isFinite(precision.gapMs)) return "N/D";
        return `${formatDuration(precision.gapMs)}${precision.exactDay ? "" : "*"}`;
    }

    function exportDailyArchive(format) {
        if (!state.lastResult || !state.lastResult.player) {
            showNotice("Carrega primeiro uma tribo para exportar o arquivo.", "warn");
            return;
        }

        const player = state.lastResult.player;
        const entries = loadDailySnapshots(player.id);
        if (!entries.length) {
            showNotice("Ainda nao existe arquivo diario para exportar.", "warn");
            return;
        }

        const safeName = String(player.name || player.id).replace(/[^\w.-]+/g, "_");
        if (format === "csv") {
            downloadTextFile(`${APP.displayTitle} - ${safeName} - diario.csv`, dailyArchiveToCsv(entries), "text/csv;charset=utf-8");
            return;
        }

        downloadTextFile(`${APP.displayTitle} - ${safeName} - diario.json`, JSON.stringify(entries, null, 2), "application/json;charset=utf-8");
    }

    function dailyArchiveToCsv(entries) {
        const rowsWithPrecision = (entries || [])
            .slice()
            .sort((a, b) => a.ts - b.ts)
            .map((entry, index, list) => dailyRowWithDiff(entry, list[index - 1] || null));
        const headers = [
            "dia", "data", "base_intervalo", "tribo_id", "nome", "tag", "pontos", "aldeias", "rank",
            "od_total", "od_ofensivo", "od_defensivo", "od_apoio", "pontos_por_aldeia",
            "media_pontos_aldeia", "od_por_ponto", "conquistas_ganhas_dia", "conquistas_perdidas_dia",
            "conquistas_saldo_dia", "conquistas_total_ganhas", "conquistas_total_perdidas",
            "conquistas_total_saldo", "coordenadas",
        ];
        const rows = rowsWithPrecision.map((entry) => [
            entry.day,
            formatDateTime(new Date(entry.ts)),
            formatDailyPrecision(entry.precision),
            entry.playerId,
            entry.name,
            entry.tribe && entry.tribe.tag,
            entry.points,
            entry.villages,
            entry.rank,
            entry.metrics && entry.metrics.odTotal,
            entry.metrics && entry.metrics.odOff,
            entry.metrics && entry.metrics.odDef,
            entry.metrics && entry.metrics.odSupport,
            entry.metrics && entry.metrics.pointsPerVillage,
            entry.metrics && entry.metrics.averageVillagePoints,
            entry.metrics && entry.metrics.odPerPoint,
            entry.conquestsDay && entry.conquestsDay.gained,
            entry.conquestsDay && entry.conquestsDay.lost,
            entry.conquestsDay && entry.conquestsDay.net,
            entry.allTimeSummary && entry.allTimeSummary.gained,
            entry.allTimeSummary && entry.allTimeSummary.lost,
            entry.allTimeSummary && entry.allTimeSummary.net,
            entry.villagesArchive && entry.villagesArchive.coords ? entry.villagesArchive.coords.join(" ") : "",
        ]);
        return [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
    }

    function csvCell(value) {
        const text = String(value == null ? "" : value);
        return `"${text.replace(/"/g, '""')}"`;
    }

    function downloadTextFile(filename, content, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 500);
    }

    function formatMetric(value) {
        return Number.isFinite(value) ? String(value).replace(".", ",") : "N/D";
    }

    function renderVillageCoordinates(summary) {
        if (!summary || !summary.rows.length) {
            return `<div class="${APP.id}-emptyList">Sem aldeias atuais para esta tribo.</div>`;
        }

        return `
            <div class="${APP.id}-coordsBlock">
                <label class="${APP.id}-coordsField ${APP.id}-coordsAll">
                    <span>Todas as aldeias (${formatNumber(summary.coords.length)})</span>
                    <textarea readonly rows="3">${escapeTextArea(summary.coords.join(" "))}</textarea>
                </label>
                <div class="${APP.id}-continentGrid">
                    ${summary.continents.map((group) => `
                        <label class="${APP.id}-coordsField">
                            <span>${escapeHTML(group.continent)} (${formatNumber(group.coords.length)})</span>
                            <textarea readonly rows="3">${escapeTextArea(group.coords.join(" "))}</textarea>
                        </label>
                    `).join("")}
                </div>
            </div>
        `;
    }

    function renderAllTimeStats(allTime) {
        if (!allTime || (!allTime.gained && !allTime.lost)) {
            return `<div class="${APP.id}-emptyList">Sem conquistas publicas desta tribo no historico do mundo.</div>`;
        }

        const first = allTime.firstTs ? formatDateOnly(new Date(allTime.firstTs * 1000)) : "-";
        const last = allTime.lastTs ? formatDateOnly(new Date(allTime.lastTs * 1000)) : "-";
        return `
            <div class="${APP.id}-grid ${APP.id}-allTimeGrid">
                ${plainMetricCard("Ganhas", formatNumber(allTime.gained))}
                ${plainMetricCard("Perdidas", formatNumber(allTime.lost))}
                ${plainMetricCard("Saldo", formatSigned(allTime.net))}
                ${plainMetricCard("Periodo", `${first} - ${last}`)}
            </div>
            <div class="${APP.id}-chartsGrid">
                ${renderLineChart("Saldo acumulado", allTime.cumulative)}
                ${renderBarChart("Atividade diaria", allTime.days)}
            </div>
            ${renderAllTimeConquestTable(allTime.rows)}
            ${renderOpponentTable(allTime.opponents)}
        `;
    }

    function renderTwStatsGraphs(twstats) {
        if (!twstats || !twstats.world) {
            return `<div class="${APP.id}-emptyList">Nao foi possivel determinar o mundo para TWStats.</div>`;
        }

        return `
            <div class="${APP.id}-twstatsLinks">
                <a href="${escapeHTML(twstats.profileUrl)}" target="_blank" rel="noopener">Abrir perfil no TWStats</a>
                <a href="${escapeHTML(twstats.historyUrl)}" target="_blank" rel="noopener">Historico</a>
                <span>Mundo: ${escapeHTML(twstats.world.toUpperCase())}</span>
            </div>
            <div class="${APP.id}-twstatsGrid">
                ${twstats.graphs.map((graph) => `
                    <figure>
                        <figcaption>${escapeHTML(graph.label)}</figcaption>
                        <img src="${escapeHTML(graph.url)}" alt="${escapeHTML(graph.label)}" loading="lazy" onerror="this.closest('figure').classList.add('${APP.id}-graphMissing')">
                        <span>Grafico indisponivel neste mundo.</span>
                    </figure>
                `).join("")}
            </div>
        `;
    }

    function plainMetricCard(label, value) {
        return `
            <div class="${APP.id}-metric">
                <span>${escapeHTML(label)}</span>
                <strong>${escapeHTML(value)}</strong>
            </div>
        `;
    }

    function renderLineChart(title, series) {
        const points = sampleSeries(series || [], 140);
        if (points.length < 2) return chartEmpty(title);

        const width = 520;
        const height = 180;
        const pad = 24;
        const values = points.map((point) => point.value);
        const min = Math.min(0, ...values);
        const max = Math.max(1, ...values);
        const range = Math.max(1, max - min);
        const polyline = points.map((point, index) => {
            const x = pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
            const y = height - pad - ((point.value - min) / range) * (height - pad * 2);
            return `${roundChart(x)},${roundChart(y)}`;
        }).join(" ");

        return `
            <div class="${APP.id}-chart">
                <h4>${escapeHTML(title)}</h4>
                <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(title)}">
                    <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="${APP.id}-chartAxis"></line>
                    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" class="${APP.id}-chartAxis"></line>
                    <polyline points="${polyline}" class="${APP.id}-chartLine"></polyline>
                </svg>
                <div class="${APP.id}-chartLegend">
                    <span>${escapeHTML(formatDateOnly(new Date(points[0].ts * 1000)))}</span>
                    <strong>${escapeHTML(formatSigned(points[points.length - 1].value))}</strong>
                    <span>${escapeHTML(formatDateOnly(new Date(points[points.length - 1].ts * 1000)))}</span>
                </div>
            </div>
        `;
    }

    function renderBarChart(title, days) {
        const points = sampleSeries(days || [], 90);
        if (!points.length) return chartEmpty(title);

        const width = 520;
        const height = 180;
        const pad = 24;
        const max = Math.max(1, ...points.map((point) => point.gained + point.lost));
        const innerWidth = width - pad * 2;
        const barWidth = Math.max(2, innerWidth / points.length - 1);
        const bars = points.map((point, index) => {
            const total = point.gained + point.lost;
            const gainedHeight = (point.gained / max) * (height - pad * 2);
            const lostHeight = (point.lost / max) * (height - pad * 2);
            const x = pad + (index / points.length) * innerWidth;
            const gainedY = height - pad - gainedHeight;
            const lostY = gainedY - lostHeight;
            return `
                <rect x="${roundChart(x)}" y="${roundChart(gainedY)}" width="${roundChart(barWidth)}" height="${roundChart(gainedHeight)}" class="${APP.id}-barGain"></rect>
                <rect x="${roundChart(x)}" y="${roundChart(lostY)}" width="${roundChart(barWidth)}" height="${roundChart(lostHeight)}" class="${APP.id}-barLoss"></rect>
            `;
        }).join("");

        return `
            <div class="${APP.id}-chart">
                <h4>${escapeHTML(title)}</h4>
                <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(title)}">
                    <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="${APP.id}-chartAxis"></line>
                    ${bars}
                </svg>
                <div class="${APP.id}-chartLegend">
                    <span>Ganhas</span>
                    <strong>${formatNumber(points.reduce((sum, point) => sum + point.gained + point.lost, 0))}</strong>
                    <span>Perdidas</span>
                </div>
            </div>
        `;
    }

    function renderOpponentTable(opponents) {
        if (!opponents || !opponents.length) return "";
        return `
            <div class="${APP.id}-tableWrap ${APP.id}-opponentWrap">
                <table class="${APP.id}-table ${APP.id}-opponentTable">
                    <thead>
                        <tr>
                            <th>ADVERSARIO</th>
                            <th>GANHAS DE</th>
                            <th>PERDIDAS PARA</th>
                            <th>PTS ATUAIS</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${opponents.map((opponent) => `
                            <tr>
                                <td>${escapeHTML(opponent.name)}</td>
                                <td>${formatNumber(opponent.from)}</td>
                                <td>${formatNumber(opponent.to)}</td>
                                <td>${formatNumber(opponent.points)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderAllTimeConquestTable(rows) {
        if (!rows || !rows.length) return "";
        return `
            <div class="${APP.id}-tableWrap ${APP.id}-allTimeConquestsWrap">
                <table class="${APP.id}-table ${APP.id}-allTimeConquestsTable">
                    <thead>
                        <tr>
                            <th>DATA</th>
                            <th>TIPO</th>
                            <th>ALDEIA</th>
                            <th>COORD</th>
                            <th>PTS</th>
                            <th>ADVERSARIO</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => `
                            <tr class="${APP.id}-${row.mode === "loss" ? "loss" : "gain"}">
                                <td>${escapeHTML(formatDateTime(row.date))}</td>
                                <td><strong>${row.mode === "loss" ? "Perdida" : "Ganha"}</strong></td>
                                <td>${escapeHTML(row.village && row.village.name ? row.village.name : `Aldeia #${row.villageId}`)}</td>
                                <td>${escapeHTML(row.village && row.village.coords ? row.village.coords : "-")}</td>
                                <td>${formatNumber(row.village && row.village.points)}</td>
                                <td>${escapeHTML(row.opponent || "-")}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    function chartEmpty(title) {
        return `
            <div class="${APP.id}-chart">
                <h4>${escapeHTML(title)}</h4>
                <div class="${APP.id}-emptyList">Sem dados suficientes para grafico.</div>
            </div>
        `;
    }

    function renderConquestTable(gained, lost, periodLabelText) {
        const rows = [
            ...gained.map((row) => ({ mode: "gain", row })),
            ...lost.map((row) => ({ mode: "loss", row })),
        ].sort((a, b) => b.row.timestamp - a.row.timestamp);

        if (!rows.length) {
            return `<div class="${APP.id}-emptyList">Sem aldeias ganhas ou perdidas em ${escapeHTML(periodLabelText)}.</div>`;
        }

        return `
            <div class="${APP.id}-tableWrap ${APP.id}-conquestWrap">
                <table class="${APP.id}-table ${APP.id}-conquestTable">
                    <thead>
                        <tr>
                            <th>HORA</th>
                            <th>TIPO</th>
                            <th>ALDEIA</th>
                            <th>PTS</th>
                            <th>DE</th>
                            <th>PARA</th>
                            <th>K</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(conquestTableRow).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    function conquestTableRow(item) {
        const row = item.row;
        const village = row.village || fallbackVillage(row.villageId);
        const type = item.mode === "gain" ? "GANHOU" : "PERDEU";
        return `
            <tr class="${APP.id}-${item.mode}">
                <td>${formatTime(row.date)}</td>
                <td><strong>${type}</strong></td>
                <td>
                    <a href="/game.php?screen=info_village&id=${row.villageId}" target="_blank" rel="noopener">${escapeHTML(village.name)}</a>
                    <small>(${escapeHTML(village.coords)})</small>
                </td>
                <td>${formatNumber(village.points)}</td>
                <td>${escapeHTML(row.oldOwner)}</td>
                <td>${escapeHTML(row.newOwner)}</td>
                <td>${escapeHTML(continentFromVillage(village))}</td>
            </tr>
        `;
    }

    function renderNotice(message, type) {
        return `<div class="${APP.id}-notice ${APP.id}-${type}">${escapeHTML(message)}</div>`;
    }

    function metricCard(label, value, delta, inverse) {
        const deltaText = delta === null ? "N/D" : formatSigned(delta);
        const title = inverse && delta !== null
            ? "No rank, valor negativo significa subida."
            : "";
        return `
            <div class="${APP.id}-metric" title="${escapeHTML(title)}">
                <span>${escapeHTML(label)}</span>
                <strong>${escapeHTML(value)}</strong>
                <em class="${deltaClass(delta, inverse)}">${escapeHTML(deltaText)}</em>
            </div>
        `;
    }

    function odRow(label, entry, delta) {
        const score = entry ? formatNumber(entry.score) : "N/D";
        const rank = entry && entry.rank ? `#${formatNumber(entry.rank)}` : "-";
        return `
            <tr>
                <td>${escapeHTML(label)}</td>
                <td><strong>${escapeHTML(score)}</strong></td>
                <td>${escapeHTML(rank)}</td>
                <td><em class="${deltaClass(delta, false)}">${escapeHTML(formatDelta(delta))}</em></td>
            </tr>
        `;
    }

    function renderConquestList(rows, mode) {
        if (!rows.length) {
            return `<div class="${APP.id}-emptyList">Sem aldeias ${mode === "gain" ? "ganhas" : "perdidas"} no periodo selecionado.</div>`;
        }

        const visible = rows.slice(0, 12);
        const more = rows.length > visible.length
            ? `<div class="${APP.id}-more">+${formatNumber(rows.length - visible.length)} restantes</div>`
            : "";

        return `
            <div class="${APP.id}-list">
                ${visible.map((row) => conquestRow(row, mode)).join("")}
                ${more}
            </div>
        `;
    }

    function conquestRow(row, mode) {
        const other = mode === "gain" ? row.oldOwner : row.newOwner;
        return `
            <div class="${APP.id}-conq ${APP.id}-${mode}">
                <a href="/game.php?screen=info_village&id=${row.villageId}" target="_blank" rel="noopener">
                    ${escapeHTML(row.village.coords)}
                </a>
                <span>${escapeHTML(row.village.name)}</span>
                <small>${escapeHTML(other)} - ${formatTime(row.date)} - ${formatNumber(row.village.points)} pts</small>
            </div>
        `;
    }

    function showNotice(message, type) {
        state.controls.body.innerHTML = panelRow(
            "RESUMO",
            "Estado da pesquisa atual.",
            renderNotice(message, type || "warn"),
            "summaryRow",
            true
        );
    }

    function setBusy(isBusy) {
        if (!state.controls.submit) return;
        state.controls.submit.disabled = isBusy;
        if (state.controls.clear) state.controls.clear.disabled = isBusy;
        if (state.panel && state.panel.classList) state.panel.classList.toggle(`${APP.id}-busy`, isBusy);
    }

    function setStatus(message) {
        if (state.controls.status) state.controls.status.textContent = message;
    }

    function clearCache() {
        state.memoryCache.clear();
        state.lastResult = null;

        try {
            const snapshotPrefix = `${APP.id}:snapshots:${window.location.host}:`;
            const dailyPrefix = `${APP.id}:daily:${window.location.host}:`;
            Object.keys(window.localStorage)
                .filter((key) => key.startsWith(snapshotPrefix) || key.startsWith(dailyPrefix))
                .forEach((key) => window.localStorage.removeItem(key));
        } catch (_) {
            // O browser pode bloquear localStorage em alguns contextos.
        }

        showNotice("Cache local limpo. Faz um novo resumo para guardar a snapshot atual.", "warn");
        setStatus("Cache limpo.");
    }

    function defaultPlayerQuery() {
        const params = new URLSearchParams(window.location.search);
        if (params.get("screen") === "info_ally" && params.get("id")) return params.get("id");

        const gameData = pageGameData();
        if (gameData.player && gameData.player.ally) return String(gameData.player.ally);
        return "";
    }

    function worldLabel() {
        const gameData = pageGameData();
        const world = String(gameData.world || window.location.hostname.split(".")[0] || "").toUpperCase();
        return `${world} - ${window.location.host}`;
    }

    function continentFromVillage(village) {
        if (!village || village.coords === "-") return "-";
        if (!Number.isFinite(village.x) || !Number.isFinite(village.y)) return "-";
        return `K${Math.floor(village.y / 100)}${Math.floor(village.x / 100)}`;
    }

    function splitLines(text) {
        return String(text || "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
    }

    function decodeTW(value) {
        const text = String(value || "").replace(/\+/g, " ");
        try {
            return decodeURIComponent(text);
        } catch (_) {
            return text;
        }
    }

    function fold(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    function toInt(value) {
        const number = Number.parseInt(value, 10);
        return Number.isFinite(number) ? number : 0;
    }

    function formatNumber(value) {
        if (!Number.isFinite(value)) return "N/D";
        return nf.format(value);
    }

    function formatSigned(value) {
        if (!Number.isFinite(value)) return "N/D";
        if (value > 0) return `+${nf.format(value)}`;
        return nf.format(value);
    }

    function formatDelta(value) {
        return Number.isFinite(value) ? formatSigned(value) : "N/D";
    }

    function formatDuration(ms) {
        const totalMinutes = Math.max(0, Math.round(ms / 60000));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (!hours) return `${minutes}m`;
        return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    }

    function formatDateTime(date) {
        return date.toLocaleString("pt-PT", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function formatTime(date) {
        return date.toLocaleString("pt-PT", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function deltaClass(delta, inverse) {
        if (delta === null || delta === 0) return `${APP.id}-neutral`;
        const good = inverse ? delta < 0 : delta > 0;
        return good ? `${APP.id}-positive` : `${APP.id}-negative`;
    }

    function escapeHTML(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }[char]));
    }

    function escapeTextArea(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function cleanText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function gameWindow() {
        return (typeof unsafeWindow !== "undefined" && unsafeWindow) ? unsafeWindow : window;
    }

    function pageGameData() {
        return gameWindow().game_data || {};
    }

    function startOfDayTs(timestamp) {
        const date = new Date(timestamp * 1000);
        date.setHours(0, 0, 0, 0);
        return Math.floor(date.getTime() / 1000);
    }

    function dateKey(timestamp) {
        const date = new Date(startOfDayTs(timestamp) * 1000);
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0"),
        ].join("-");
    }

    function dayKeyFromMs(ms) {
        return dateKey(Math.floor(ms / 1000));
    }

    function formatDateOnly(date) {
        return date.toLocaleDateString("pt-PT", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
        });
    }

    function sampleSeries(series, maxPoints) {
        const list = Array.isArray(series) ? series.filter((item) => item && Number.isFinite(item.ts)) : [];
        if (list.length <= maxPoints) return list;

        const sampled = [];
        const step = (list.length - 1) / (maxPoints - 1);
        for (let i = 0; i < maxPoints; i += 1) {
            sampled.push(list[Math.round(i * step)]);
        }
        return sampled;
    }

    function roundChart(value) {
        return Math.round(value * 10) / 10;
    }

    function injectStyle() {
        if (document.getElementById(`${APP.id}-style`)) return;

        const style = document.createElement("style");
        style.id = `${APP.id}-style`;
        style.textContent = `
            #${APP.id}-launcher {
                position: fixed;
                right: 16px;
                top: 132px;
                z-index: ${APP.zIndex};
                min-width: 44px;
                height: 34px;
                border: 1px solid #6f4d2d;
                border-radius: 4px;
                background: #8b5a2b;
                color: #fff7df;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
            }

            #${APP.id}-launcher:hover {
                background: #9b6a35;
            }

            #${APP.id}-panel {
                position: fixed;
                right: 16px;
                top: 176px;
                z-index: ${APP.zIndex};
                width: min(560px, calc(100vw - 24px));
                max-height: calc(100vh - 196px);
                overflow: hidden;
                display: flex;
                flex-direction: column;
                border: 1px solid #5d4228;
                border-radius: 6px;
                background: #f4ead2;
                color: #2c1b10;
                box-shadow: 0 12px 34px rgba(0, 0, 0, 0.4);
                font: 12px Verdana, Arial, sans-serif;
            }

            #${APP.id}-panel.${APP.id}-hidden {
                display: none;
            }

            .${APP.id}-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 10px 12px;
                background: #6f4d2d;
                color: #fff7df;
            }

            .${APP.id}-head strong {
                display: block;
                font-size: 14px;
                line-height: 1.2;
            }

            .${APP.id}-head span {
                display: block;
                color: #e8d3a6;
                font-size: 11px;
                margin-top: 2px;
            }

            .${APP.id}-icon {
                width: 26px;
                height: 26px;
                border: 1px solid rgba(255, 255, 255, 0.35);
                border-radius: 4px;
                background: rgba(0, 0, 0, 0.12);
                color: #fff7df;
                cursor: pointer;
                font-weight: 700;
            }

            .${APP.id}-search {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto auto;
                gap: 8px;
                padding: 10px 12px;
                border-bottom: 1px solid #d4bea0;
                background: #ead9b8;
            }

            .${APP.id}-search input {
                min-width: 0;
                height: 30px;
                border: 1px solid #a5835a;
                border-radius: 4px;
                padding: 0 9px;
                background: #fffaf0;
                color: #2c1b10;
                box-sizing: border-box;
            }

            .${APP.id}-search button {
                height: 30px;
                border: 1px solid #6f4d2d;
                border-radius: 4px;
                background: #7b552f;
                color: #fff7df;
                cursor: pointer;
                padding: 0 10px;
                font-weight: 700;
            }

            .${APP.id}-search button:disabled {
                opacity: 0.6;
                cursor: progress;
            }

            .${APP.id}-status {
                padding: 7px 12px;
                border-bottom: 1px solid #ddc9aa;
                color: #6d543d;
                font-size: 11px;
                background: #f8efd9;
            }

            .${APP.id}-body {
                overflow: auto;
                padding: 12px;
            }

            .${APP.id}-empty,
            .${APP.id}-emptyList,
            .${APP.id}-notice {
                border: 1px solid #d8c09b;
                border-radius: 6px;
                background: #fff7e5;
                padding: 10px;
                color: #5c4734;
            }

            .${APP.id}-notice.${APP.id}-error {
                border-color: #b2564f;
                background: #fff0ef;
                color: #842e27;
            }

            .${APP.id}-notice.${APP.id}-warn {
                border-color: #c19745;
                background: #fff4d4;
                color: #65491e;
                margin-bottom: 10px;
            }

            .${APP.id}-summaryHead {
                display: flex;
                align-items: flex-end;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 10px;
                border-bottom: 1px solid #d7c19f;
                padding-bottom: 9px;
            }

            .${APP.id}-summaryHead a {
                display: inline-block;
                color: #3a2414;
                font-size: 16px;
                font-weight: 700;
                text-decoration: none;
            }

            .${APP.id}-summaryHead a:hover {
                text-decoration: underline;
            }

            .${APP.id}-summaryHead span,
            .${APP.id}-summaryHead small {
                color: #6d543d;
            }

            .${APP.id}-grid {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 8px;
                margin-bottom: 12px;
            }

            .${APP.id}-metric {
                min-height: 74px;
                border: 1px solid #d1b88f;
                border-radius: 6px;
                background: #fff9ea;
                padding: 9px;
                box-sizing: border-box;
            }

            .${APP.id}-metric span,
            .${APP.id}-odRow span {
                display: block;
                color: #71563d;
                font-size: 11px;
                margin-bottom: 4px;
            }

            .${APP.id}-metric strong {
                display: block;
                font-size: 16px;
                color: #2f1e12;
                line-height: 1.25;
                overflow-wrap: anywhere;
            }

            .${APP.id}-metric em,
            .${APP.id}-odRow em {
                display: block;
                margin-top: 4px;
                font-style: normal;
                font-weight: 700;
            }

            .${APP.id}-positive {
                color: #24723a;
            }

            .${APP.id}-negative {
                color: #a33b2f;
            }

            .${APP.id}-neutral {
                color: #6d6256;
            }

            .${APP.id}-section {
                margin-top: 12px;
            }

            .${APP.id}-section h3 {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin: 0 0 7px;
                color: #3a2414;
                font-size: 13px;
            }

            .${APP.id}-section h3 span {
                color: #6d543d;
                font-weight: 400;
            }

            .${APP.id}-odTable {
                border: 1px solid #d1b88f;
                border-radius: 6px;
                overflow: hidden;
                background: #fff9ea;
            }

            .${APP.id}-odRow {
                display: grid;
                grid-template-columns: minmax(86px, 1fr) minmax(92px, 1fr) 70px 86px;
                gap: 8px;
                align-items: center;
                padding: 8px 9px;
                border-top: 1px solid #ead8ba;
            }

            .${APP.id}-odRow:first-child {
                border-top: 0;
            }

            .${APP.id}-odRow span {
                margin: 0;
            }

            .${APP.id}-odRow strong {
                color: #2f1e12;
            }

            .${APP.id}-odRow small {
                color: #71563d;
            }

            .${APP.id}-odRow em {
                margin: 0;
                text-align: right;
            }

            .${APP.id}-hint {
                margin-top: 6px;
                color: #6d543d;
                font-size: 11px;
            }

            .${APP.id}-split {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }

            .${APP.id}-list {
                display: grid;
                gap: 6px;
            }

            .${APP.id}-conq {
                border: 1px solid #d1b88f;
                border-radius: 6px;
                background: #fff9ea;
                padding: 8px;
                min-width: 0;
            }

            .${APP.id}-conq a {
                display: inline-block;
                color: #2c4f7b;
                font-weight: 700;
                text-decoration: none;
                margin-right: 5px;
            }

            .${APP.id}-conq a:hover {
                text-decoration: underline;
            }

            .${APP.id}-conq span {
                color: #2f1e12;
                font-weight: 700;
                overflow-wrap: anywhere;
            }

            .${APP.id}-conq small {
                display: block;
                color: #71563d;
                margin-top: 3px;
                overflow-wrap: anywhere;
            }

            .${APP.id}-more {
                color: #6d543d;
                padding: 4px 2px;
            }

            @media (max-width: 720px) {
                #${APP.id}-launcher {
                    top: auto;
                    right: 10px;
                    bottom: 78px;
                }

                #${APP.id}-panel {
                    right: 8px;
                    top: 76px;
                    width: calc(100vw - 16px);
                    max-height: calc(100vh - 88px);
                }

                .${APP.id}-search {
                    grid-template-columns: 1fr 1fr;
                }

                .${APP.id}-search input {
                    grid-column: 1 / -1;
                }

                .${APP.id}-summaryHead,
                .${APP.id}-split {
                    grid-template-columns: 1fr;
                    display: grid;
                }

                .${APP.id}-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                .${APP.id}-odRow {
                    grid-template-columns: minmax(76px, 1fr) minmax(82px, 1fr) 54px 76px;
                }
            }

            /* Layout inspirado no painel "Conquistas do Mundo". */
            #${APP.id}-launcher {
                position: fixed !important;
                top: 438px !important;
                right: auto !important;
                left: 16px !important;
                z-index: ${APP.zIndex} !important;
                box-sizing: border-box !important;
                width: 30px !important;
                min-width: 30px !important;
                height: 28px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: flex-start !important;
                gap: 0 !important;
                overflow: hidden !important;
                cursor: pointer !important;
                border: 1px solid #4f120f !important;
                border-radius: 2px !important;
                background: linear-gradient(to bottom, #b33a34, #8f2420 55%, #681611) !important;
                box-shadow: inset 0 1px 0 rgba(255,255,255,.35), inset 0 -1px 0 rgba(0,0,0,.35), 0 2px 5px rgba(0,0,0,.45) !important;
                color: #fff !important;
                font: 700 12px Verdana, Arial, sans-serif !important;
                text-shadow: 1px 1px 1px #000 !important;
                white-space: nowrap !important;
                padding: 0 6px !important;
                transition: width .18s ease, min-width .18s ease, padding .18s ease, gap .18s ease, background .18s ease !important;
            }

            #${APP.id}-launcher:hover,
            #${APP.id}-launcher:focus-visible {
                width: 378px !important;
                min-width: 378px !important;
                gap: 8px !important;
                padding: 0 9px !important;
                background: linear-gradient(to bottom, #c4473e, #a02c27 55%, #7e1c17) !important;
            }

            .${APP.id}-launcherIcon {
                width: 16px !important;
                height: 16px !important;
                flex: 0 0 16px !important;
                border-radius: 50% !important;
                background: url("${APP.launcherIcon}") center / contain no-repeat !important;
                box-shadow: inset 0 1px 1px rgba(255,255,255,.35), 0 1px 1px #000 !important;
            }

            .${APP.id}-launcherLabel {
                display: inline-block !important;
                max-width: 0 !important;
                opacity: 0 !important;
                overflow: hidden !important;
                transform: translateX(-4px) !important;
                white-space: nowrap !important;
                transition: max-width .18s ease, opacity .14s ease, transform .18s ease !important;
            }

            #${APP.id}-launcher:hover .${APP.id}-launcherLabel,
            #${APP.id}-launcher:focus-visible .${APP.id}-launcherLabel {
                max-width: 332px !important;
                opacity: 1 !important;
                transform: translateX(0) !important;
            }

            #${APP.id}-panel {
                position: fixed;
                z-index: ${APP.zIndex + 1};
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: min(1320px, calc(100vw - 24px));
                max-width: calc(100vw - 24px);
                max-height: calc(100vh - 18px);
                overflow: hidden;
                margin: 0;
                padding: 18px;
                border: 2px solid #473019;
                border-radius: 6px;
                background: linear-gradient(#d9c99e, #95805b);
                box-shadow:
                    0 0 0 1px #d8c99b,
                    0 0 0 4px #5c4429,
                    0 0 0 6px rgba(218, 203, 164, .9),
                    inset 0 0 0 2px rgba(255,244,207,.8),
                    inset 0 0 0 5px rgba(92,68,41,.45),
                    0 6px 18px rgba(0,0,0,.55);
                color: #2f1809;
                box-sizing: border-box;
                font: 12px Verdana, Arial, sans-serif;
            }

            #${APP.id}-panel::before {
                content: "";
                position: absolute;
                inset: 9px;
                pointer-events: none;
                border: 1px solid #8d261f;
                box-shadow: inset 0 0 0 1px #f4e3b6;
                z-index: 0;
            }

            #${APP.id}-panel::after {
                content: "";
                position: absolute;
                inset: 4px;
                pointer-events: none;
                border: 1px solid rgba(255,244,207,.7);
                z-index: 0;
            }

            #${APP.id}-panel.${APP.id}-hidden {
                display: none;
            }

            #popup_box_${APP.dialogId} {
                position: fixed !important;
                top: 50% !important;
                left: 50% !important;
                right: auto !important;
                bottom: auto !important;
                transform: translate(-50%, -50%) !important;
                margin: 0 !important;
                width: min(1320px, calc(100vw - 24px)) !important;
                max-width: calc(100vw - 24px) !important;
                max-height: calc(100vh - 8px) !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                z-index: ${APP.zIndex + 2} !important;
            }

            #popup_box_${APP.dialogId} .popup_box_content,
            #popup_box_${APP.dialogId} .popup_box_content > div {
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                height: auto !important;
                box-sizing: border-box !important;
            }

            #popup_box_${APP.dialogId} .popup_box_content {
                max-height: calc(100vh - 38px) !important;
                overflow: hidden !important;
                padding-bottom: 0 !important;
            }

            #popup_box_${APP.dialogId} .popup_box_content > div {
                max-height: none !important;
                overflow: visible !important;
            }

            #popup_box_${APP.dialogId} .${APP.id}-dialog {
                width: min(1260px, calc(100vw - 58px)) !important;
                max-width: 100% !important;
                margin: 0 auto !important;
            }

            #popup_box_${APP.dialogId} .${APP.id}-shell {
                max-height: calc(100vh - 76px) !important;
                overflow-x: hidden !important;
                overflow-y: auto !important;
                padding-bottom: 16px !important;
            }

            .${APP.id}-dialog {
                position: relative;
                z-index: 1;
                width: 100%;
                max-width: 100%;
                min-width: 0;
                margin: 0 auto;
                padding: 0;
                border: 0;
                border-radius: 0;
                background: transparent;
                box-shadow: none;
                overflow: visible;
                box-sizing: border-box;
            }

            .${APP.id}-dialog::before {
                content: none;
            }

            .${APP.id}-close {
                position: absolute;
                top: -12px;
                right: -12px;
                z-index: 3;
                width: 20px;
                height: 20px;
                line-height: 16px;
                padding: 0;
                border: 2px solid #4c2a12;
                border-radius: 2px;
                background: #f6d28b;
                color: #1b0d07;
                font-size: 18px;
                font-weight: 700;
                text-align: center;
                cursor: pointer;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
            }

            .${APP.id}-shell {
                position: relative;
                z-index: 1;
                display: flex;
                flex-direction: column;
                width: 100%;
                max-width: 100%;
                max-height: calc(100vh - 76px);
                min-height: 0;
                min-width: 0;
                padding: 0;
                border: 2px solid #7e211c;
                border-radius: 4px;
                background: #f4e4b8;
                color: #3b2508;
                overflow-x: hidden;
                overflow-y: auto;
                box-sizing: border-box;
            }

            .${APP.id}-masthead {
                margin: 0;
                padding: 9px 14px 8px;
                border: 0;
                border-bottom: 1px solid #c8913e;
                border-radius: 0;
                background: linear-gradient(to bottom, #f7e8c1 0%, #edd49a 100%);
            }

            .${APP.id}-masthead h2 {
                margin: 0;
                color: #9d1714;
                font-family: Verdana, Arial, sans-serif;
                font-size: 16px;
                line-height: 20px;
                font-weight: 700;
                letter-spacing: 0;
            }

            .${APP.id}-masthead p {
                margin: 3px 0 0;
                color: #4a240d;
                font-size: 12px;
            }

            .${APP.id}-panelRow {
                display: grid;
                grid-template-columns: 258px minmax(0, 1fr);
                border-top: 1px solid #d2b873;
                background: rgba(255, 255, 255, 0.08);
            }

            .${APP.id}-panelRow:first-of-type {
                border-top: 0;
            }

            .${APP.id}-rowLabel {
                min-height: 48px;
                padding: 9px 12px 8px 11px;
                border-left: 4px solid #b42522;
                box-sizing: border-box;
            }

            .${APP.id}-summaryRow .${APP.id}-rowLabel {
                border-left-color: #13a8bb;
            }

            .${APP.id}-villagesRow .${APP.id}-rowLabel {
                border-left-color: #3f8d2a;
            }

            .${APP.id}-odSectionRow .${APP.id}-rowLabel {
                border-left-color: #8f69d3;
            }

            .${APP.id}-worldStatsRow .${APP.id}-rowLabel {
                border-left-color: #c59325;
            }

            .${APP.id}-chartsRow .${APP.id}-rowLabel {
                border-left-color: #2d70b6;
            }

            .${APP.id}-resultsRow .${APP.id}-rowLabel {
                border-left-color: #c59325;
            }

            .${APP.id}-actionsRow .${APP.id}-rowLabel {
                border-left-color: #9d6d27;
            }

            .${APP.id}-rowLabel strong {
                display: flex;
                align-items: center;
                gap: 6px;
                color: #9f1d19;
                font-size: 13px;
                line-height: 1.15;
                text-transform: uppercase;
            }

            .${APP.id}-sectionIcon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 17px;
                height: 17px;
                flex: 0 0 17px;
                border: 1px solid #c8913e;
                border-radius: 2px;
                background: linear-gradient(to bottom, #fff2c8, #dfb765);
                color: #7d1713;
                font-size: 10px;
                line-height: 1;
                font-weight: 700;
                text-transform: none;
                box-shadow: inset 0 1px 0 rgba(255,255,255,.75);
            }

            .${APP.id}-rowLabel > span {
                display: block;
                margin-top: 3px;
                color: #4d250f;
                line-height: 1.25;
            }

            .${APP.id}-rowContent {
                min-width: 0;
                padding: 7px 12px 8px;
                box-sizing: border-box;
            }

            .${APP.id}-sectionToggle {
                display: block;
                width: 24px;
                min-width: 24px;
                height: 22px;
                margin-left: auto;
                padding: 0;
                border: 1px solid #7b201c;
                border-radius: 3px;
                background: linear-gradient(#b43a34, #8c1713);
                color: #fff8dc;
                cursor: pointer;
                font: 700 16px/19px Verdana, Arial, sans-serif;
                text-shadow: 0 1px 0 #40100d;
                box-shadow: inset 0 1px 0 rgba(255,255,255,.25), inset 0 -1px 0 rgba(0,0,0,.3);
            }

            .${APP.id}-sectionToggle:hover {
                background: linear-gradient(#c64a43, #971d18);
            }

            .${APP.id}-sectionContent {
                display: none;
                margin-top: 6px;
            }

            .${APP.id}-panelRowOpen .${APP.id}-sectionContent {
                display: block;
            }

            .${APP.id}-controlsGrid {
                display: grid;
                grid-template-columns: .75fr 1.4fr 1fr 1fr;
                gap: 8px;
                align-items: end;
            }

            .${APP.id}-controlsGrid label {
                display: grid;
                gap: 4px;
                min-width: 0;
                color: #000;
                font-weight: 700;
            }

            .${APP.id}-controlsGrid label > span {
                line-height: 1.1;
            }

            .${APP.id}-controlsGrid input,
            .${APP.id}-controlsGrid select {
                width: 100%;
                min-width: 0;
                height: 29px;
                padding: 3px 9px;
                border: 1px solid #c89042;
                border-radius: 2px;
                background: #fff6d7;
                color: #2f1809;
                box-sizing: border-box;
                font: 12px Verdana, Arial, sans-serif;
            }

            .${APP.id}-controlsGrid select:disabled {
                opacity: 1;
                color: #4d250f;
            }

            .${APP.id}-body {
                display: flex;
                flex-direction: column;
                flex: 0 0 auto;
                min-height: 0;
                min-width: 0;
                overflow: visible;
                padding: 0;
            }

            .${APP.id}-searchRow,
            .${APP.id}-actionsRow {
                flex: 0 0 auto;
            }

            .${APP.id}-playerHead {
                display: flex;
                align-items: flex-end;
                justify-content: space-between;
                gap: 16px;
                margin-bottom: 6px;
            }

            .${APP.id}-playerHead a {
                color: #2b1508;
                font-size: 16px;
                font-weight: 700;
                text-decoration: none;
            }

            .${APP.id}-playerHead a:hover {
                text-decoration: underline;
            }

            .${APP.id}-playerHead span,
            .${APP.id}-playerHead small {
                color: #6b3a15;
            }

            .${APP.id}-sourceBadge {
                flex: 0 0 auto;
                align-self: flex-start;
                padding: 3px 7px;
                border: 1px solid #c89042;
                border-radius: 2px;
                background: #fff1bd;
                color: #7d1713 !important;
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
            }

            .${APP.id}-precisionBox {
                display: grid;
                gap: 3px;
                margin: 6px 0 0;
                padding: 6px 8px;
                border: 1px solid #c89042;
                border-radius: 2px;
                background: #fff1bd;
                color: #4d250f;
                font-size: 11px;
            }

            .${APP.id}-precisionBox strong {
                color: #9d1714;
                text-transform: uppercase;
            }

            .${APP.id}-precisionBox span {
                display: block;
            }

            .${APP.id}-empty,
            .${APP.id}-emptyList,
            .${APP.id}-notice {
                border: 1px solid #c89042;
                border-radius: 2px;
                background: #fff2c8;
                color: #4d250f;
                padding: 11px 12px;
            }

            .${APP.id}-notice.${APP.id}-warn {
                margin: 0 0 9px;
                border-color: #c89042;
                background: #fff2c8;
                color: #6e3a12;
            }

            .${APP.id}-notice.${APP.id}-error {
                border-color: #a52c26;
                background: #ffe5d9;
                color: #7d1712;
            }

            .${APP.id}-grid {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 6px;
                margin: 0;
            }

            .${APP.id}-archiveActions {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
                color: #5a2f13;
                font-size: 11px;
            }

            .${APP.id}-archiveActions button {
                height: 24px;
                min-width: 94px;
                padding: 0 10px;
                border: 1px solid #7b201c;
                border-radius: 3px;
                background: linear-gradient(#b43a34, #8c1713);
                color: #fff8dc;
                cursor: pointer;
                font: 700 11px Verdana, Arial, sans-serif;
                text-shadow: 0 1px 0 #40100d;
            }

            .${APP.id}-archiveActions button:hover {
                background: linear-gradient(#c64a43, #971d18);
            }

            .${APP.id}-archiveWrap {
                max-height: 320px;
            }

            .${APP.id}-archiveDetails {
                display: grid;
                gap: 8px;
                margin-top: 9px;
            }

            .${APP.id}-metric {
                min-height: 43px;
                padding: 6px 8px;
                border: 1px solid #c89042;
                border-radius: 2px;
                background: #fff6d7;
                box-sizing: border-box;
            }

            .${APP.id}-metric span {
                display: block;
                margin: 0 0 2px;
                color: #6a340f;
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
            }

            .${APP.id}-metric strong {
                display: block;
                color: #120b05;
                font-size: 16px;
                line-height: 1.15;
                overflow-wrap: anywhere;
            }

            .${APP.id}-metric em {
                display: block;
                margin-top: 2px;
                font-style: normal;
                font-weight: 700;
            }

            .${APP.id}-positive {
                color: #176c2d;
            }

            .${APP.id}-negative {
                color: #a22620;
            }

            .${APP.id}-neutral {
                color: #63452b;
            }

            .${APP.id}-tableWrap {
                width: 100%;
                overflow: auto;
                border: 1px solid #c89042;
                background: #fff2c8;
            }

            .${APP.id}-table {
                width: 100%;
                min-width: 760px;
                border-collapse: collapse;
                color: #2f1809;
                font-size: 12px;
            }

            .${APP.id}-table th {
                padding: 6px 8px;
                background: linear-gradient(#dcb25e, #c99035);
                color: #2a1408;
                text-align: left;
                font-size: 11px;
                text-transform: uppercase;
            }

            .${APP.id}-table td {
                padding: 8px;
                border-top: 1px solid #e0c481;
                background: #fff2c8;
                vertical-align: top;
            }

            .${APP.id}-table tr:nth-child(even) td {
                background: #f7e3a9;
            }

            .${APP.id}-table a {
                color: #2d1709;
                font-weight: 700;
                text-decoration: none;
            }

            .${APP.id}-table a:hover {
                text-decoration: underline;
            }

            .${APP.id}-table small {
                display: block;
                color: #6b3a15;
                margin-top: 2px;
            }

            .${APP.id}-table em {
                font-style: normal;
                font-weight: 700;
            }

            .${APP.id}-odTable {
                min-width: 560px;
            }

            .${APP.id}-hint {
                margin-top: 6px;
                color: #5a2f13;
                font-size: 11px;
            }

            .${APP.id}-coordsBlock {
                display: grid;
                gap: 10px;
            }

            .${APP.id}-coordsField {
                display: grid;
                gap: 4px;
                min-width: 0;
                color: #4d250f;
                font-weight: 700;
            }

            .${APP.id}-coordsField textarea {
                width: 100%;
                min-height: 54px;
                resize: vertical;
                border: 1px solid #c89042;
                border-radius: 2px;
                background: #fff6d7;
                color: #2f1809;
                box-sizing: border-box;
                padding: 6px 8px;
                font: 12px Consolas, "Courier New", monospace;
                line-height: 1.35;
            }

            .${APP.id}-continentGrid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 8px;
            }

            .${APP.id}-chartsGrid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
                margin-top: 10px;
            }

            .${APP.id}-chart {
                border: 1px solid #c89042;
                background: #fff6d7;
                padding: 8px;
                min-width: 0;
            }

            .${APP.id}-chart h4 {
                margin: 0 0 6px;
                color: #7f1b16;
                font-size: 12px;
            }

            .${APP.id}-chart svg {
                display: block;
                width: 100%;
                height: auto;
                background: #fff2c8;
            }

            .${APP.id}-chartAxis {
                stroke: #9d6d27;
                stroke-width: 1;
            }

            .${APP.id}-chartLine {
                fill: none;
                stroke: #a7221e;
                stroke-width: 2.5;
            }

            .${APP.id}-barGain {
                fill: #24723a;
            }

            .${APP.id}-barLoss {
                fill: #a22620;
            }

            .${APP.id}-chartLegend,
            .${APP.id}-twstatsLinks {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                margin-top: 6px;
                color: #5a2f13;
                font-size: 11px;
            }

            .${APP.id}-twstatsLinks {
                justify-content: flex-start;
                margin: 0 0 8px;
            }

            .${APP.id}-twstatsLinks a {
                color: #9f1d19;
                font-weight: 700;
                text-decoration: none;
            }

            .${APP.id}-twstatsGrid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
            }

            .${APP.id}-twstatsGrid figure {
                margin: 0;
                border: 1px solid #c89042;
                background: #fff6d7;
                padding: 8px;
                min-width: 0;
            }

            .${APP.id}-twstatsGrid figcaption {
                margin-bottom: 6px;
                color: #7f1b16;
                font-weight: 700;
            }

            .${APP.id}-twstatsGrid img {
                display: block;
                max-width: 100%;
                height: auto;
                background: #fff2c8;
            }

            .${APP.id}-twstatsGrid figure > span {
                display: none;
                color: #6e3a12;
            }

            .${APP.id}-twstatsGrid figure.${APP.id}-graphMissing img {
                display: none;
            }

            .${APP.id}-twstatsGrid figure.${APP.id}-graphMissing > span {
                display: block;
            }

            .${APP.id}-opponentWrap {
                margin-top: 10px;
            }

            .${APP.id}-allTimeConquestsWrap {
                margin-top: 10px;
                max-height: 260px;
                overflow-y: auto;
            }

            .${APP.id}-gain td:nth-child(2) strong {
                color: #16662a;
            }

            .${APP.id}-loss td:nth-child(2) strong {
                color: #9d211b;
            }

            .${APP.id}-actions {
                display: grid;
                grid-template-columns: repeat(2, minmax(140px, 1fr));
                gap: 10px;
                margin-bottom: 9px;
            }

            .${APP.id}-actions button {
                height: 33px;
                border: 1px solid #7b201c;
                border-radius: 3px;
                background: linear-gradient(#b43a34, #8c1713);
                color: #fff8dc;
                cursor: pointer;
                font: 700 12px Verdana, Arial, sans-serif;
                text-shadow: 0 1px 0 #40100d;
            }

            .${APP.id}-actions button:hover {
                background: linear-gradient(#c64a43, #971d18);
            }

            .${APP.id}-actions button:disabled {
                opacity: 0.65;
                cursor: progress;
            }

            .${APP.id}-footerLine {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                color: #5a2f13;
                font-size: 11px;
            }

            .${APP.id}-status {
                padding: 0;
                border: 0;
                background: transparent;
                color: #5a2f13;
                font-size: 11px;
            }

            .${APP.id}-footerLine a {
                color: #9f1d19;
                font-weight: 700;
                text-decoration: none;
            }

            @media (max-width: 900px) {
                #${APP.id}-panel {
                    padding: 8px;
                    align-items: flex-start;
                }

                .${APP.id}-dialog {
                    width: 100%;
                    max-height: calc(100vh - 16px);
                }

                .${APP.id}-shell {
                    min-height: 0;
                    padding: 10px;
                }

                .${APP.id}-panelRow {
                    grid-template-columns: 1fr;
                }

                .${APP.id}-rowLabel {
                    min-height: 0;
                    padding-bottom: 7px;
                }

                .${APP.id}-controlsGrid,
                .${APP.id}-grid,
                .${APP.id}-actions,
                .${APP.id}-continentGrid,
                .${APP.id}-chartsGrid,
                .${APP.id}-twstatsGrid {
                    grid-template-columns: 1fr;
                }

                .${APP.id}-playerHead,
                .${APP.id}-footerLine {
                    align-items: flex-start;
                    flex-direction: column;
                }
            }
        `;
        document.head.appendChild(style);
    }
})();


