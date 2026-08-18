// ==UserScript==
// @name         TW Hub ThePlaguePT
// @namespace    theplaguept.tw.hub
// @version      0.2.6
// @description  Hub flutuante para aceder rapidamente aos teus scripts e botoes no Tribal Wars.
// @author       ThePlaguePT
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// @include      *://*.tribalwars.*/game.php*
// @include      *://*.tribalwars.com.pt/*
// @include      *://*.tribalwars.co.uk/*
// @include      *://*.tribalwars.com.br/*
// @homepageURL  https://github.com/ThePlaguePT/TribalWars-Scripts
// @supportURL   https://github.com/ThePlaguePT/TribalWars-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW_Hub_ThePlaguePT.user.js
// @downloadURL  https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW_Hub_ThePlaguePT.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @run-at       document-idle
// @noframes
// ==/UserScript==

/*
    TW Hub ThePlaguePT

    Formas de adicionar botoes ao Hub:

    1) Dentro de outro userscript:

       (window.TWHubQueue = window.TWHubQueue || []).push({
           id: "meu-script",
           label: "Meu Script",
           group: "Scripts",
           run: function () {
               // abre o painel do teu script, executa uma funcao, etc.
           }
       });

    2) Se o outro script ja cria um botao na pagina:

       Usa "Capturar" no Hub e clica nesse botao. O Hub guarda o seletor CSS
       e passa a clicar nesse botao por ti.
*/

(function () {
    "use strict";

    const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

    if (pageWindow.top !== pageWindow.self) return;
    if (!/tribalwars\./i.test(window.location.hostname)) return;

    const APP = {
        id: "tpTwHub",
        version: "0.2.3",
        settingsKey: "tpTwHub:settings:v1",
        customKey: "tpTwHub:custom:v1",
        hiddenDefaultsKey: "tpTwHub:hiddenDefaults:v1",
        zIndex: 60000,
    };

    const DEFAULT_SETTINGS = {
        open: true,
        left: null,
        top: 150,
        width: 302,
        filter: "",
        showUnavailable: true,
    };

    const DEFAULT_SHORTCUTS = [
        {
            id: "defesa-theplaguept",
            label: "Defesa",
            group: "Paineis",
            selector: "#tpDefLauncher",
            description: "Abre o painel Defesa ThePlaguePT.",
            order: 10,
        },
        {
            id: "conquistas-mundo",
            label: "Conquistas",
            group: "Paineis",
            selector: "#tpconq-launcher",
            description: "Abre o painel Conquistas do Mundo.",
            order: 20,
        },
        {
            id: "alertas-discord",
            label: "Alertas Discord",
            group: "Paineis",
            selector: "#tw-discord-alerts-toggle",
            description: "Abre as configuracoes dos alertas Discord.",
            order: 30,
        },
        {
            id: "tag-incomings",
            label: "Tag Incomings",
            group: "Paineis",
            selector: "#tag-incomings-pt-panel .ti-toggle",
            screen: "overview_villages",
            params: {mode: "incomings"},
            description: "Abre o painel TI; se nao existir, vai para Incomings.",
            order: 40,
        },
        {
            id: "renomeador-ataques",
            label: "Renomeador",
            group: "Paineis",
            selector: "#renomear-ataques-cores-theplaguept-config-button",
            screen: "overview_villages",
            params: {mode: "incomings"},
            description: "Abre as configuracoes do renomeador de ataques.",
            order: 45,
        },
        {
            id: "marcador-mapa",
            label: "Marcador Mapa",
            group: "Paineis",
            selector: "#tpMapMarker-launcher",
            screen: "map",
            description: "Abre o marcador de aldeias no mapa.",
            order: 48,
        },
        {
            id: "notas-relatorio",
            label: "Guardar Nota",
            group: "Relatorios",
            selector: "#tpnr_single_save",
            screen: "report",
            description: "Usa o botao de nota no relatorio atual.",
            order: 50,
        },
        {
            id: "notas-massa",
            label: "Notas em Massa",
            group: "Relatorios",
            selector: "#tpnr_mass_selected",
            screen: "report",
            description: "Usa o botao de notas em massa quando estiver na lista.",
            order: 60,
        },
        {
            id: "ir-incomings",
            label: "Ir para Incomings",
            group: "Paginas",
            screen: "overview_villages",
            params: {mode: "incomings"},
            description: "Abre a vista de ataques a chegar.",
            order: 100,
        },
        {
            id: "ir-relatorios",
            label: "Ir para Relatorios",
            group: "Paginas",
            screen: "report",
            description: "Abre os relatorios.",
            order: 110,
        },
        {
            id: "ir-mapa",
            label: "Ir para Mapa",
            group: "Paginas",
            screen: "map",
            description: "Abre o mapa.",
            order: 120,
        },
        {
            id: "ir-praca",
            label: "Ir para Praca",
            group: "Paginas",
            screen: "place",
            description: "Abre a praca de reuniao.",
            order: 130,
        },
    ];

    const state = {
        settings: Object.assign({}, DEFAULT_SETTINGS),
        custom: [],
        hiddenDefaults: [],
        entries: new Map(),
        dom: {},
        observer: null,
        renderTimer: null,
        picker: null,
        notifyTimer: null,
    };

    function boot() {
        state.settings = Object.assign({}, DEFAULT_SETTINGS, readValue(APP.settingsKey, {}));
        state.custom = normalizeCustomList(readValue(APP.customKey, []));
        state.hiddenDefaults = readValue(APP.hiddenDefaultsKey, []);

        injectStyle();
        createUi();
        exposeApi();
        registerDefaults();
        registerCustomShortcuts();
        consumeQueue();
        window.addEventListener("TPHub:Register", handleLegacyHubRegister);
        startDomObserver();
        render();
    }

    function exposeApi() {
        const api = {
            version: APP.version,
            register(entry) {
                const normalized = normalizeEntry(entry, "registered");
                if (!normalized) return false;
                state.entries.set(normalized.id, normalized);
                scheduleRender();
                return normalized.id;
            },
            unregister(id) {
                const key = String(id || "");
                const existed = state.entries.delete(key);
                scheduleRender();
                return existed;
            },
            run(id) {
                return runEntry(String(id || ""));
            },
            open() {
                setOpen(true);
            },
            close() {
                setOpen(false);
            },
            toggle() {
                setOpen(!state.settings.open);
            },
            notify(message, type) {
                notify(message, type);
            },
            list() {
                return Array.from(state.entries.values()).map((entry) => Object.assign({}, entry, {
                    run: Boolean(entry.run),
                    visible: Boolean(entry.visible),
                }));
            },
        };

        pageWindow.TWHub = api;
        if (window !== pageWindow) window.TWHub = api;
    }

    function consumeQueue() {
        const queue = Array.isArray(pageWindow.TWHubQueue) ? pageWindow.TWHubQueue : [];
        pageWindow.TWHubQueue = queue;

        while (queue.length) {
            const entry = queue.shift();
            pageWindow.TWHub.register(entry);
        }

        queue.push = function (...items) {
            items.forEach((item) => pageWindow.TWHub.register(item));
            return queue.length;
        };
    }

    function handleLegacyHubRegister(event) {
        const detail = event && event.detail ? event.detail : {};
        if (!detail || !detail.id || !detail.title || typeof detail.open !== "function") return;

        const normalizedId = cleanId(detail.id);
        const knownDefaultIds = {
            tpmapmarker: "marcador-mapa",
        };
        const existingDefaultId = knownDefaultIds[normalizedId];

        if (existingDefaultId && state.entries.has(existingDefaultId)) {
            const existing = state.entries.get(existingDefaultId);
            existing.run = detail.open;
            existing.selector = existing.selector || "";
            scheduleRender();
            return;
        }

        pageWindow.TWHub.register({
            id: normalizedId,
            label: cleanText(detail.title),
            group: "Paineis",
            description: `Abre ${cleanText(detail.title)}.`,
            run: detail.open,
            order: 80,
        });
    }

    function registerDefaults() {
        DEFAULT_SHORTCUTS
            .filter((entry) => !state.hiddenDefaults.includes(entry.id))
            .forEach((entry) => {
                const normalized = normalizeEntry(entry, "default");
                if (normalized) state.entries.set(normalized.id, normalized);
            });
    }

    function registerCustomShortcuts() {
        state.custom.forEach((entry) => {
            const normalized = normalizeEntry(entry, "custom");
            if (normalized) state.entries.set(normalized.id, normalized);
        });
    }

    function normalizeCustomList(value) {
        if (!Array.isArray(value)) return [];
        return value
            .map((entry) => normalizeStoredShortcut(entry))
            .filter(Boolean);
    }

    function normalizeStoredShortcut(entry) {
        if (!entry || typeof entry !== "object") return null;
        const label = cleanText(entry.label || entry.title || entry.name);
        if (!label) return null;

        const normalized = {
            id: cleanId(entry.id || label),
            label,
            group: cleanText(entry.group) || "Meus Atalhos",
            description: cleanText(entry.description),
            selector: cleanText(entry.selector),
            screen: cleanText(entry.screen),
            url: cleanText(entry.url),
            params: normalizeParams(entry.params),
            order: toNumber(entry.order, 500),
            createdAt: toNumber(entry.createdAt, Date.now()),
        };

        if (!normalized.selector && !normalized.screen && !normalized.url) return null;
        return normalized;
    }

    function normalizeEntry(entry, source) {
        if (!entry || typeof entry !== "object") return null;
        const label = cleanText(entry.label || entry.title || entry.name || entry.id);
        if (!label) return null;

        const normalized = {
            id: cleanId(entry.id || label),
            label,
            group: cleanText(entry.group || entry.category) || (source === "custom" ? "Meus Atalhos" : "Scripts"),
            description: cleanText(entry.description || entry.desc),
            selector: cleanText(entry.selector),
            screen: cleanText(entry.screen),
            url: cleanText(entry.url),
            params: normalizeParams(entry.params),
            run: typeof entry.run === "function" ? entry.run : null,
            visible: typeof entry.visible === "function" ? entry.visible : null,
            enabled: entry.enabled !== false,
            closeAfterRun: entry.closeAfterRun === true,
            source,
            order: toNumber(entry.order, 500),
            createdAt: toNumber(entry.createdAt, Date.now()),
        };

        if (!normalized.id) normalized.id = cleanId(label);
        return normalized;
    }

    function injectStyle() {
        if (document.getElementById(`${APP.id}-style`)) return;

        const style = document.createElement("style");
        style.id = `${APP.id}-style`;
        style.textContent = `
            #${APP.id},
            #${APP.id} * {
                box-sizing: border-box;
                font-family: Verdana, Arial, sans-serif;
                letter-spacing: 0;
            }

            #${APP.id} {
                position: fixed;
                z-index: ${APP.zIndex};
                color: #2f1d12;
                font-size: 12px;
            }

            #${APP.id}-quickbar {
                position: fixed;
                top: 7px;
                left: 116px;
                z-index: ${APP.zIndex};
                width: clamp(230px, 24vw, 430px);
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                padding: 0 8px;
                pointer-events: none;
            }

            #${APP.id}-quickbar button,
            #${APP.id}-quickbar [role="button"] {
                pointer-events: auto;
            }

            #${APP.id}-quickbar .${APP.id}-quick-button,
            #${APP.id}-quickbar #${APP.id}-launcher {
                position: relative !important;
                top: auto !important;
                left: auto !important;
                right: auto !important;
                bottom: auto !important;
                transform: none !important;
                z-index: ${APP.zIndex} !important;
                width: 30px !important;
                min-width: 30px !important;
                max-width: 30px !important;
                height: 28px !important;
                min-height: 28px !important;
                margin: 0 !important;
                padding: 0 !important;
                flex: 0 0 30px !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: flex-start !important;
                overflow: hidden !important;
                border: 1px solid #4f120f !important;
                border-radius: 2px !important;
                background: linear-gradient(to bottom, #b33a34, #8f2420 55%, #681611) !important;
                color: #fff !important;
                font-size: 13px !important;
                font-weight: 700 !important;
                line-height: 1 !important;
                text-shadow: 1px 1px 1px #000 !important;
                box-shadow: inset 0 1px 0 rgba(255,255,255,.35), inset 0 -1px 0 rgba(0,0,0,.35), 0 2px 5px rgba(0,0,0,.42) !important;
                cursor: pointer !important;
            }

            #${APP.id}-quickbar .${APP.id}-quick-button:hover,
            #${APP.id}-quickbar #${APP.id}-launcher:hover {
                filter: brightness(1.12);
            }

            #${APP.id}-quickbar .${APP.id}-quick-button[data-missing="1"] {
                opacity: .55;
                filter: grayscale(.4);
            }

            .${APP.id}-managed-original {
                position: absolute !important;
                top: auto !important;
                left: -10000px !important;
                right: auto !important;
                bottom: auto !important;
                width: 1px !important;
                min-width: 1px !important;
                max-width: 1px !important;
                height: 1px !important;
                min-height: 1px !important;
                overflow: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }

            #${APP.id}-launcher {
                position: fixed;
                right: 14px;
                top: 156px;
                z-index: ${APP.zIndex};
                width: 38px;
                height: 38px;
                display: none;
                align-items: center;
                justify-content: center;
                border: 1px solid #5d2d1b;
                border-radius: 6px;
                background: linear-gradient(#f3d69a, #cfa35d);
                color: #44200f;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(0, 0, 0, .35);
            }

            #${APP.id}-launcher:hover {
                filter: brightness(1.06);
            }

            #${APP.id}-panel {
                position: fixed;
                right: 14px;
                top: 150px;
                width: 302px;
                max-width: calc(100vw - 18px);
                max-height: min(76vh, 620px);
                display: flex;
                flex-direction: column;
                border: 1px solid #5d2d1b;
                border-radius: 7px;
                background: #f4e4bf;
                box-shadow: 0 7px 24px rgba(0, 0, 0, .38);
                overflow: hidden;
            }

            #${APP.id}-panel.${APP.id}-closed {
                display: none;
            }

            .${APP.id}-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                min-height: 36px;
                padding: 7px 8px;
                background: linear-gradient(#7d3a25, #4d1d12);
                color: #fff4d7;
                cursor: move;
                user-select: none;
            }

            .${APP.id}-title {
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 1px;
            }

            .${APP.id}-title strong {
                font-size: 12px;
                line-height: 1.2;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .${APP.id}-title span {
                color: #ead2a0;
                font-size: 10px;
                line-height: 1.2;
            }

            .${APP.id}-head-actions {
                display: flex;
                gap: 4px;
                flex: 0 0 auto;
            }

            .${APP.id}-icon-button,
            .${APP.id}-mini-button {
                min-width: 26px;
                height: 24px;
                border: 1px solid rgba(51, 24, 13, .55);
                border-radius: 5px;
                background: #e3c37c;
                color: #39190e;
                font-weight: 700;
                cursor: pointer;
                line-height: 1;
            }

            .${APP.id}-icon-button:hover,
            .${APP.id}-mini-button:hover {
                background: #f2d794;
            }

            .${APP.id}-body {
                display: flex;
                flex-direction: column;
                gap: 7px;
                min-height: 0;
                padding: 8px;
            }

            .${APP.id}-toolbar {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto auto;
                gap: 5px;
                align-items: center;
            }

            .${APP.id}-search {
                width: 100%;
                min-width: 0;
                height: 26px;
                border: 1px solid #b98c4d;
                border-radius: 5px;
                background: #fff7df;
                color: #2f1d12;
                padding: 4px 7px;
                font-size: 12px;
            }

            .${APP.id}-toggle-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 4px 1px 0;
                color: #5d4228;
                font-size: 11px;
            }

            .${APP.id}-toggle-row label {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                cursor: pointer;
            }

            .${APP.id}-list {
                display: flex;
                flex-direction: column;
                gap: 7px;
                min-height: 74px;
                max-height: 430px;
                overflow: auto;
                padding-right: 2px;
            }

            .${APP.id}-group {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .${APP.id}-group-title {
                padding: 4px 5px 2px;
                color: #71421f;
                font-weight: 700;
                font-size: 10px;
                text-transform: uppercase;
            }

            .${APP.id}-entry {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 4px;
                align-items: stretch;
            }

            .${APP.id}-entry-main {
                min-width: 0;
                min-height: 34px;
                border: 1px solid #b98848;
                border-radius: 6px;
                background: #fff1c8;
                color: #2e1a0f;
                cursor: pointer;
                text-align: left;
                padding: 5px 7px;
            }

            .${APP.id}-entry-main:hover {
                background: #fff8df;
                border-color: #835329;
            }

            .${APP.id}-entry-line {
                display: flex;
                align-items: center;
                gap: 6px;
                min-width: 0;
            }

            .${APP.id}-status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                flex: 0 0 auto;
                background: #9f9176;
                box-shadow: 0 0 0 1px rgba(48, 28, 15, .25);
            }

            .${APP.id}-status-dot.${APP.id}-ready {
                background: #23823c;
            }

            .${APP.id}-status-dot.${APP.id}-route {
                background: #b97818;
            }

            .${APP.id}-entry-label {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-weight: 700;
                font-size: 12px;
            }

            .${APP.id}-entry-desc {
                margin-top: 2px;
                color: #725234;
                font-size: 10px;
                line-height: 1.2;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .${APP.id}-entry-actions {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .${APP.id}-mini-button {
                min-width: 24px;
                height: 17px;
                padding: 0 5px;
                font-size: 10px;
                font-weight: 700;
            }

            .${APP.id}-empty {
                padding: 14px 8px;
                border: 1px dashed #bc9258;
                border-radius: 6px;
                color: #6b4a2e;
                text-align: center;
                background: rgba(255, 248, 224, .62);
            }

            .${APP.id}-footer {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 5px;
                padding-top: 2px;
            }

            .${APP.id}-footer button {
                min-width: 0;
                height: 24px;
                border: 1px solid #a7793d;
                border-radius: 5px;
                background: #dec07c;
                color: #32190d;
                cursor: pointer;
                font-size: 11px;
                font-weight: 700;
            }

            .${APP.id}-footer button:hover {
                background: #efd493;
            }

            #${APP.id}-notice {
                position: fixed;
                right: 18px;
                bottom: 18px;
                z-index: ${APP.zIndex + 1};
                max-width: min(360px, calc(100vw - 28px));
                padding: 9px 11px;
                border: 1px solid #5c351a;
                border-radius: 6px;
                background: #fff3d1;
                color: #2e1a0f;
                box-shadow: 0 4px 16px rgba(0, 0, 0, .35);
                display: none;
            }

            #${APP.id}-notice.${APP.id}-warn {
                background: #ffe5c9;
                border-color: #9b4d22;
            }

            #${APP.id}-notice.${APP.id}-error {
                background: #ffd4d0;
                border-color: #8a241c;
            }

            .${APP.id}-picking button,
            .${APP.id}-picking a,
            .${APP.id}-picking input[type="button"],
            .${APP.id}-picking input[type="submit"],
            .${APP.id}-picking [role="button"] {
                cursor: crosshair !important;
            }

            .${APP.id}-pick-target {
                outline: 3px solid #1f8ec8 !important;
                outline-offset: 2px !important;
            }

            @media (max-width: 520px) {
                #${APP.id}-panel {
                    left: 8px !important;
                    right: 8px !important;
                    top: 72px !important;
                    width: auto !important;
                    max-height: calc(100vh - 90px);
                }

                #${APP.id}-launcher {
                    top: 78px;
                    right: 10px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function ensureTpScriptBar(doc = document) {
        if (!doc || !doc.body) return null;
        if (!doc.getElementById("tp-theplaguept-script-bar-style")) {
            const style = doc.createElement("style");
            style.id = "tp-theplaguept-script-bar-style";
            style.textContent = '#tp-theplaguept-script-bar{position: absolute !important;top:8px!important;left:414px!important;z-index:2147483647!important;width:350px!important;height:34px!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:5px!important;padding:0 8px!important;box-sizing:border-box!important;pointer-events:none!important}#tp-theplaguept-script-bar>*{position:relative!important;top:auto!important;left:auto!important;right:auto!important;bottom:auto!important;transform:none!important;width:30px!important;min-width:30px!important;max-width:30px!important;height:28px!important;min-height:28px!important;margin:0!important;flex:0 0 30px!important;pointer-events:auto!important;overflow:visible!important}#tp-theplaguept-script-bar>button,#tp-theplaguept-script-bar>*>button{position:relative!important;top:auto!important;left:auto!important;right:auto!important;bottom:auto!important;transform:none!important;width:30px!important;min-width:30px!important;max-width:30px!important;height:28px!important;min-height:28px!important;margin:0!important;padding:0!important;flex:0 0 30px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:0!important;overflow:visible!important}#tp-theplaguept-script-bar>button:hover,#tp-theplaguept-script-bar>button:focus-visible,#tp-theplaguept-script-bar>*>button:hover,#tp-theplaguept-script-bar>*>button:focus-visible,#tp-theplaguept-script-bar #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:hover,#tp-theplaguept-script-bar #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:focus-visible{width:30px!important;min-width:30px!important;max-width:30px!important;padding:0!important;gap:0!important}#tp-theplaguept-script-bar .tpdef-launcher-text,#tp-theplaguept-script-bar .tw-alerts-toggle-label,#tp-theplaguept-script-bar .ti-toggle-label,#tp-theplaguept-script-bar .ra-tp-config-button-label,#tp-theplaguept-script-bar [class$="-launcherLabel"],#tp-theplaguept-script-bar [class$="-launcher-text"]{display:none!important;max-width:0!important;opacity:0!important}#tp-theplaguept-script-bar #twHubTp-launcher{order:10!important}#tp-theplaguept-script-bar #tw-discord-alerts-ui{order:20!important}#tp-theplaguept-script-bar #tpDefLauncher{order:30!important}#tp-theplaguept-script-bar #tag-incomings-pt-panel{order:40!important}#tp-theplaguept-script-bar #tpMapMarker-launcher{order:50!important}#tp-theplaguept-script-bar #renomear-ataques-cores-theplaguept-config-button{order:60!important}#tp-theplaguept-script-bar #tpResumo24h-launcher{order:70!important}#tp-theplaguept-script-bar #tpconq-launcher{order:80!important}#tp-theplaguept-script-bar>.tp-theplaguept-script-bar-item[data-tp-title]::after{content:attr(data-tp-title);position:absolute!important;left:50%!important;top:33px!important;transform:translateX(-50%)!important;display:none!important;white-space:nowrap!important;max-width:360px!important;overflow:hidden!important;text-overflow:ellipsis!important;padding:4px 8px!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#f6dfaa,#d2a05a)!important;color:#2b1509!important;font:bold 11px Verdana,Arial,sans-serif!important;text-shadow:0 1px #fff!important;box-shadow:0 2px 6px #0008!important;pointer-events:none!important;z-index:2147483647!important}#tp-theplaguept-script-bar>.tp-theplaguept-script-bar-item[data-tp-title]:hover::after,#tp-theplaguept-script-bar>.tp-theplaguept-script-bar-item[data-tp-title]:focus-within::after{display:block!important}';
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
        const tooltipButton = element.querySelector && element.querySelector('button[title],button[aria-label]');
        const tooltipSource =
            element.getAttribute('data-tp-tooltip') ||
            element.getAttribute('title') ||
            element.getAttribute('aria-label') ||
            (tooltipButton ? tooltipButton.getAttribute('title') || tooltipButton.getAttribute('aria-label') : '') ||
            '';
        if (tooltipSource) {
            element.dataset.tpTooltip = tooltipSource;
            element.setAttribute('aria-label', tooltipSource);
            element.removeAttribute('title');

            if (tooltipButton) {
                tooltipButton.setAttribute('aria-label', tooltipSource);
                tooltipButton.removeAttribute('title');
            }
        }

        const getSharedTooltip = () => {
            const tooltipDoc = element.ownerDocument || document;
            let tooltip = tooltipDoc.getElementById('tp-theplaguept-script-bar-tooltip');

            if (!tooltip) {
                tooltip = tooltipDoc.createElement('div');
                tooltip.id = 'tp-theplaguept-script-bar-tooltip';

                const tooltipStyles = {
                    position: 'fixed',
                    display: 'none',
                    'z-index': '2147483647',
                    padding: '4px 8px',
                    border: '1px solid #4f120f',
                    'border-radius': '2px',
                    background: 'linear-gradient(to bottom, #f6dfaa, #d2a05a)',
                    color: '#2b1509',
                    font: 'bold 11px Verdana, Arial, sans-serif',
                    'text-shadow': '0 1px #fff',
                    'box-shadow': '0 2px 6px rgba(0,0,0,.55)',
                    'white-space': 'nowrap',
                    'max-width': '360px',
                    overflow: 'hidden',
                    'text-overflow': 'ellipsis',
                    'pointer-events': 'none'
                };

                Object.entries(tooltipStyles).forEach(([property, value]) => {
                    tooltip.style.setProperty(property, value, 'important');
                });

                (tooltipDoc.body || tooltipDoc.documentElement).appendChild(tooltip);
            }

            return tooltip;
        };
        const hideSharedTooltip = () => {
            const tooltipDoc = element.ownerDocument || document;
            const tooltip = tooltipDoc.getElementById('tp-theplaguept-script-bar-tooltip');

            if (tooltip) {
                tooltip.style.setProperty('display', 'none', 'important');
            }
        };
        const showSharedTooltip = () => {
            const text = element.dataset.tpTooltip || '';
            if (!text) return;

            const tooltipDoc = element.ownerDocument || document;
            const tooltipWin = tooltipDoc.defaultView || window;
            const tooltip = getSharedTooltip();

            tooltip.textContent = text;
            tooltip.style.setProperty('display', 'block', 'important');

            const rect = element.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            const viewportWidth = tooltipWin.innerWidth || tooltipDoc.documentElement.clientWidth || 1024;
            const left = Math.max(6, Math.min(
                rect.left + (rect.width / 2) - (tooltipRect.width / 2),
                viewportWidth - tooltipRect.width - 6
            ));

            tooltip.style.setProperty('left', `${left}px`, 'important');
            tooltip.style.setProperty('top', `${rect.bottom + 6}px`, 'important');
        };

        if (!element.dataset.tpTooltipReady) {
            element.addEventListener('mouseenter', showSharedTooltip);
            element.addEventListener('focusin', showSharedTooltip);
            element.addEventListener('mouseleave', hideSharedTooltip);
            element.addEventListener('focusout', hideSharedTooltip);
            element.dataset.tpTooltipReady = '1';
        }
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

    function createUi() {
        if (document.getElementById(APP.id)) return;

        const root = document.createElement("div");
        root.id = APP.id;

        const quickbar = ensureTpScriptBar();
        quickbar.setAttribute("aria-label", "Botoes ThePlaguePT");

        const launcher = document.createElement("button");
        launcher.id = `${APP.id}-launcher`;
        launcher.type = "button";
        launcher.title = "Abrir TW Hub";
        launcher.textContent = "H";
        launcher.addEventListener("click", () => setOpen(true));

        const panel = document.createElement("section");
        panel.id = `${APP.id}-panel`;
        panel.setAttribute("aria-label", "TW Hub");

        panel.innerHTML = `
            <div class="${APP.id}-head">
                <div class="${APP.id}-title">
                    <strong>TW Hub</strong>
                    <span data-role="count">0 atalhos</span>
                </div>
                <div class="${APP.id}-head-actions">
                    <button class="${APP.id}-icon-button" type="button" data-action="capture" title="Capturar botao">+</button>
                    <button class="${APP.id}-icon-button" type="button" data-action="close" title="Recolher">x</button>
                </div>
            </div>
            <div class="${APP.id}-body">
                <div class="${APP.id}-toolbar">
                    <input class="${APP.id}-search" type="search" data-role="filter" placeholder="Filtrar scripts">
                    <button class="${APP.id}-icon-button" type="button" data-action="add" title="Adicionar atalho">Add</button>
                    <button class="${APP.id}-icon-button" type="button" data-action="capture" title="Capturar botao">Cap</button>
                </div>
                <div class="${APP.id}-toggle-row">
                    <label>
                        <input type="checkbox" data-role="show-unavailable">
                        <span>Mostrar indisponiveis</span>
                    </label>
                    <span>v${APP.version}</span>
                </div>
                <div class="${APP.id}-list" data-role="list"></div>
                <div class="${APP.id}-footer">
                    <button type="button" data-action="export">Exportar</button>
                    <button type="button" data-action="import">Importar</button>
                    <button type="button" data-action="reset">Reset</button>
                </div>
            </div>
        `;

        const notice = document.createElement("div");
        notice.id = `${APP.id}-notice`;

        root.appendChild(panel);
        root.appendChild(notice);
        document.body.appendChild(root);
        attachToTpScriptBar(launcher);

        state.dom = {
            root,
            quickbar,
            launcher,
            panel,
            head: panel.querySelector(`.${APP.id}-head`),
            list: panel.querySelector("[data-role='list']"),
            count: panel.querySelector("[data-role='count']"),
            filter: panel.querySelector("[data-role='filter']"),
            showUnavailable: panel.querySelector("[data-role='show-unavailable']"),
            notice,
        };

        state.dom.filter.value = state.settings.filter || "";
        state.dom.showUnavailable.checked = state.settings.showUnavailable !== false;

        panel.addEventListener("click", handlePanelClick);
        quickbar.addEventListener("click", handleQuickbarClick);
        state.dom.filter.addEventListener("input", () => {
            state.settings.filter = state.dom.filter.value;
            saveSettings();
            scheduleRender();
        });
        state.dom.showUnavailable.addEventListener("change", () => {
            state.settings.showUnavailable = state.dom.showUnavailable.checked;
            saveSettings();
            scheduleRender();
        });

        initDragging();
        applyPanelState();
        applyPanelPosition();
    }

    function handlePanelClick(event) {
        const actionButton = event.target.closest("[data-action]");
        if (actionButton) {
            const action = actionButton.getAttribute("data-action");
            if (action === "close") setOpen(false);
            if (action === "add") addShortcutFlow();
            if (action === "capture") startPicker();
            if (action === "export") exportShortcuts();
            if (action === "import") importShortcuts();
            if (action === "reset") resetHub();
            return;
        }

        const runButton = event.target.closest("[data-run-id]");
        if (runButton) {
            runEntry(runButton.getAttribute("data-run-id"));
            return;
        }

        const editButton = event.target.closest("[data-edit-id]");
        if (editButton) {
            editShortcutFlow(editButton.getAttribute("data-edit-id"));
            return;
        }

        const deleteButton = event.target.closest("[data-delete-id]");
        if (deleteButton) {
            deleteShortcut(deleteButton.getAttribute("data-delete-id"));
        }
    }

    function handleQuickbarClick(event) {
        const button = event.target.closest("[data-quick-id]");
        if (!button || !state.dom.quickbar || !state.dom.quickbar.contains(button)) return;

        runEntry(button.getAttribute("data-quick-id"));
    }

    function render() {
        if (!state.dom.list) return;

        const filter = cleanText(state.settings.filter).toLowerCase();
        const showUnavailable = state.settings.showUnavailable !== false;
        const entries = Array.from(state.entries.values())
            .filter((entry) => entry.enabled)
            .map((entry) => Object.assign({}, entry, {availability: getAvailability(entry)}))
            .filter((entry) => showUnavailable || entry.availability.available || entry.availability.route)
            .filter((entry) => {
                if (!filter) return true;
                return `${entry.label} ${entry.group} ${entry.description}`.toLowerCase().includes(filter);
            })
            .sort(compareEntries);

        renderQuickbar();

        state.dom.count.textContent = `${entries.length} ${entries.length === 1 ? "atalho" : "atalhos"}`;
        state.dom.list.textContent = "";

        if (!entries.length) {
            const empty = document.createElement("div");
            empty.className = `${APP.id}-empty`;
            empty.textContent = "Sem atalhos para mostrar.";
            state.dom.list.appendChild(empty);
            return;
        }

        const groups = new Map();
        entries.forEach((entry) => {
            if (!groups.has(entry.group)) groups.set(entry.group, []);
            groups.get(entry.group).push(entry);
        });

        groups.forEach((groupEntries, groupName) => {
            const group = document.createElement("div");
            group.className = `${APP.id}-group`;

            const title = document.createElement("div");
            title.className = `${APP.id}-group-title`;
            title.textContent = groupName;
            group.appendChild(title);

            groupEntries.forEach((entry) => group.appendChild(createEntryNode(entry)));
            state.dom.list.appendChild(group);
        });
    }

    function renderQuickbar() {
        if (!state.dom.quickbar || !state.dom.launcher) return;

        Array.from(state.dom.quickbar.querySelectorAll(`.${APP.id}-quick-button,[data-quick-id]`)).forEach((node) => node.remove());
        cleanupManagedOriginals(new Set());
    }

    function quickIcon(entry) {
        const id = String(entry.id || "").toLowerCase();
        const label = cleanText(entry.label);

        if (id.includes("defesa")) return "D";
        if (id.includes("conquistas")) return "C";
        if (id.includes("alertas")) return "●";
        if (id.includes("spy")) return "S";
        if (id.includes("tag") || id.includes("incomings")) return "⚔";
        if (id.includes("renomeador")) return "R";
        if (id.includes("map") || id.includes("mapa") || id.includes("marcador")) return "⌖";

        return label ? label.slice(0, 1).toUpperCase() : "?";
    }

    function hideOriginalLauncher(entry) {
        if (!entry) return null;

        const selector = entry.selector || inferredOriginalSelector(entry);
        if (!selector) return null;

        const target = safeQuery(selector);
        if (!target || state.dom.root.contains(target)) return null;

        if (!target.dataset.tpTwHubOriginalStyleSaved) {
            target.dataset.tpTwHubOriginalStyleSaved = "1";
            target.dataset.tpTwHubOriginalStyle = target.getAttribute("style") || "";
            target.classList.add(`${APP.id}-managed-original`);
            target.style.setProperty("display", "none", "important");
            target.style.setProperty("visibility", "hidden", "important");
            target.style.setProperty("pointer-events", "none", "important");
            target.style.setProperty("position", "absolute", "important");
            target.style.setProperty("left", "-10000px", "important");
            target.style.setProperty("top", "auto", "important");
            target.style.setProperty("right", "auto", "important");
            target.style.setProperty("bottom", "auto", "important");
        } else if (!target.classList.contains(`${APP.id}-managed-original`)) {
            target.classList.add(`${APP.id}-managed-original`);
        }

        return target;
    }

    function inferredOriginalSelector(entry) {
        const id = String(entry && entry.id || "").toLowerCase();

        if (id === "informacao-jogador-tribo-theplaguept") return "#tpResumo24h-launcher";
        if (id === "resumo-24h-tribo-theplaguept") return "#tpResumo24hTribo-launcher";

        return "";
    }

    function cleanupManagedOriginals(activeTargets) {
        document.querySelectorAll(`.${APP.id}-managed-original`).forEach((node) => {
            if (!activeTargets.has(node) && (!state.dom.root || !state.dom.root.contains(node))) {
                const originalStyle = node.dataset.tpTwHubOriginalStyle || "";
                if (originalStyle) {
                    node.setAttribute("style", originalStyle);
                } else {
                    node.removeAttribute("style");
                }

                delete node.dataset.tpTwHubOriginalStyleSaved;
                delete node.dataset.tpTwHubOriginalStyle;
                node.classList.remove(`${APP.id}-managed-original`);
            }
        });
    }

    function createEntryNode(entry) {
        const row = document.createElement("div");
        row.className = `${APP.id}-entry`;

        const main = document.createElement("button");
        main.type = "button";
        main.className = `${APP.id}-entry-main`;
        main.dataset.runId = entry.id;
        main.title = entry.description || entry.label;

        const line = document.createElement("div");
        line.className = `${APP.id}-entry-line`;

        const dot = document.createElement("span");
        dot.className = `${APP.id}-status-dot`;
        if (entry.availability.available) dot.classList.add(`${APP.id}-ready`);
        else if (entry.availability.route) dot.classList.add(`${APP.id}-route`);

        const label = document.createElement("span");
        label.className = `${APP.id}-entry-label`;
        label.textContent = entry.label;

        line.appendChild(dot);
        line.appendChild(label);
        main.appendChild(line);

        const desc = document.createElement("div");
        desc.className = `${APP.id}-entry-desc`;
        desc.textContent = availabilityText(entry);
        main.appendChild(desc);

        row.appendChild(main);

        const actions = document.createElement("div");
        actions.className = `${APP.id}-entry-actions`;

        if (entry.source === "custom") {
            const edit = document.createElement("button");
            edit.type = "button";
            edit.className = `${APP.id}-mini-button`;
            edit.dataset.editId = entry.id;
            edit.title = "Editar";
            edit.textContent = "Ed";

            const del = document.createElement("button");
            del.type = "button";
            del.className = `${APP.id}-mini-button`;
            del.dataset.deleteId = entry.id;
            del.title = "Remover";
            del.textContent = "X";

            actions.appendChild(edit);
            actions.appendChild(del);
        }

        row.appendChild(actions);
        return row;
    }

    function getAvailability(entry) {
        if (typeof entry.visible === "function") {
            try {
                if (entry.visible()) return {available: true, route: false};
                return {available: false, route: Boolean(entry.url || entry.screen)};
            } catch (error) {
                console.warn("[TW Hub] visible() falhou:", error);
                return {available: false, route: Boolean(entry.url || entry.screen)};
            }
        }

        if (typeof entry.run === "function") return {available: true, route: false};
        if (entry.selector && safeQuery(entry.selector)) return {available: true, route: false};
        return {available: false, route: Boolean(entry.url || entry.screen)};
    }

    function availabilityText(entry) {
        if (entry.availability.available) return entry.description || "Disponivel nesta pagina.";
        if (entry.availability.route) return entry.description || "Abre a pagina certa se necessario.";
        if (entry.selector) return `Nao encontrei: ${entry.selector}`;
        return entry.description || "Indisponivel nesta pagina.";
    }

    function compareEntries(a, b) {
        const group = a.group.localeCompare(b.group, "pt", {sensitivity: "base"});
        if (group !== 0) return group;
        if (a.order !== b.order) return a.order - b.order;
        return a.label.localeCompare(b.label, "pt", {sensitivity: "base"});
    }

    function runEntry(id) {
        const entry = state.entries.get(id);
        if (!entry) return false;

        try {
            if (typeof entry.run === "function") {
                entry.run({
                    hub: pageWindow.TWHub,
                    entry,
                    window: pageWindow,
                    document,
                    gameData: pageWindow.game_data,
                });
                notify(`Executado: ${entry.label}`);
                if (entry.closeAfterRun) setOpen(false);
                return true;
            }

            if (entry.selector) {
                const target = safeQuery(entry.selector);
                if (target) {
                    target.click();
                    notify(`Aberto: ${entry.label}`);
                    if (entry.closeAfterRun) setOpen(false);
                    return true;
                }
            }

            const url = buildUrl(entry);
            if (url) {
                window.location.href = url;
                return true;
            }

            notify(`Nao encontrei o botao: ${entry.label}`, "warn");
            return false;
        } catch (error) {
            console.error("[TW Hub] Erro ao executar atalho:", error);
            notify(`Erro em ${entry.label}: ${error.message || error}`, "error");
            return false;
        }
    }

    function safeQuery(selector) {
        if (!selector) return null;
        try {
            return document.querySelector(selector);
        } catch (error) {
            return null;
        }
    }

    function buildUrl(entry) {
        if (entry.url) {
            try {
                return new URL(entry.url, window.location.origin).toString();
            } catch (error) {
                return "";
            }
        }

        if (!entry.screen) return "";

        const url = new URL("/game.php", window.location.origin);
        const villageId = getVillageId();
        if (villageId) url.searchParams.set("village", villageId);
        url.searchParams.set("screen", entry.screen);
        Object.entries(entry.params || {}).forEach(([key, value]) => {
            if (key && value !== undefined && value !== null && value !== "") {
                url.searchParams.set(key, String(value));
            }
        });
        return url.toString();
    }

    function getVillageId() {
        const gameDataVillage = pageWindow.game_data && pageWindow.game_data.village;
        if (gameDataVillage && gameDataVillage.id) return String(gameDataVillage.id);
        return new URLSearchParams(window.location.search).get("village") || "";
    }

    function addShortcutFlow(prefill) {
        const data = promptShortcut(prefill || {});
        if (!data) return;

        const existingIds = new Set(state.custom.map((entry) => entry.id));
        data.id = uniqueId(cleanId(data.id || data.label), existingIds);
        data.createdAt = Date.now();

        state.custom.push(data);
        saveCustom();
        state.entries.set(data.id, normalizeEntry(data, "custom"));
        render();
        notify(`Atalho adicionado: ${data.label}`);
    }

    function editShortcutFlow(id) {
        const index = state.custom.findIndex((entry) => entry.id === id);
        if (index < 0) return;

        const data = promptShortcut(state.custom[index]);
        if (!data) return;

        data.id = id;
        data.createdAt = state.custom[index].createdAt || Date.now();
        state.custom[index] = data;
        saveCustom();
        state.entries.set(id, normalizeEntry(data, "custom"));
        render();
        notify(`Atalho atualizado: ${data.label}`);
    }

    function promptShortcut(prefill) {
        const label = pageWindow.prompt("Nome do botao no Hub:", prefill.label || "");
        if (label === null) return null;

        const cleanLabel = cleanText(label);
        if (!cleanLabel) {
            notify("O nome nao pode ficar vazio.", "warn");
            return null;
        }

        const selector = pageWindow.prompt(
            "Seletor CSS do botao existente. Pode ficar vazio se usares fallback.",
            prefill.selector || ""
        );
        if (selector === null) return null;

        const fallback = pageWindow.prompt(
            "Fallback opcional se o botao nao existir. Usa screen, screen?param=valor ou URL.",
            fallbackToPrompt(prefill)
        );
        if (fallback === null) return null;

        const group = pageWindow.prompt("Grupo no Hub:", prefill.group || "Meus Atalhos");
        if (group === null) return null;

        const parsedFallback = parseFallback(fallback);
        const data = {
            id: prefill.id || cleanId(cleanLabel),
            label: cleanLabel,
            group: cleanText(group) || "Meus Atalhos",
            description: cleanText(prefill.description),
            selector: cleanText(selector),
            screen: parsedFallback.screen,
            url: parsedFallback.url,
            params: parsedFallback.params,
            order: toNumber(prefill.order, 500),
        };

        if (!data.selector && !data.screen && !data.url) {
            notify("Define um seletor, uma screen ou uma URL.", "warn");
            return null;
        }

        return data;
    }

    function fallbackToPrompt(entry) {
        if (entry.url) return entry.url;
        if (!entry.screen) return "";
        const params = new URLSearchParams(entry.params || {}).toString();
        return params ? `${entry.screen}?${params}` : entry.screen;
    }

    function parseFallback(value) {
        const text = cleanText(value);
        if (!text) return {screen: "", url: "", params: {}};

        if (/^(https?:)?\/\//i.test(text) || text.startsWith("/")) {
            return {screen: "", url: text, params: {}};
        }

        const parts = text.split("?");
        return {
            screen: cleanText(parts[0]),
            url: "",
            params: normalizeParams(parts[1] || ""),
        };
    }

    function deleteShortcut(id) {
        const entry = state.entries.get(id);
        if (!entry || entry.source !== "custom") return;
        if (!pageWindow.confirm(`Remover "${entry.label}" do Hub?`)) return;

        state.custom = state.custom.filter((item) => item.id !== id);
        state.entries.delete(id);
        saveCustom();
        render();
        notify(`Atalho removido: ${entry.label}`);
    }

    function exportShortcuts() {
        const payload = {
            name: "TW Hub ThePlaguePT",
            version: APP.version,
            custom: state.custom,
        };
        const text = JSON.stringify(payload, null, 2);

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => notify("Configuracao copiada para a area de transferencia."))
                .catch(() => pageWindow.prompt("Copia a configuracao:", text));
            return;
        }

        pageWindow.prompt("Copia a configuracao:", text);
    }

    function importShortcuts() {
        const raw = pageWindow.prompt("Cola aqui o JSON exportado pelo Hub:");
        if (raw === null) return;

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            notify("JSON invalido.", "error");
            return;
        }

        const imported = normalizeCustomList(Array.isArray(parsed) ? parsed : parsed.custom);
        if (!imported.length) {
            notify("Nao encontrei atalhos validos no JSON.", "warn");
            return;
        }

        const replace = pageWindow.confirm("OK substitui os atalhos atuais. Cancelar junta aos existentes.");
        state.custom = replace ? imported : mergeCustom(state.custom, imported);
        saveCustom();

        Array.from(state.entries.values())
            .filter((entry) => entry.source === "custom")
            .forEach((entry) => state.entries.delete(entry.id));
        registerCustomShortcuts();
        render();
        notify(`Importados ${imported.length} atalhos.`);
    }

    function mergeCustom(current, imported) {
        const map = new Map();
        current.forEach((entry) => map.set(entry.id, entry));
        imported.forEach((entry) => {
            let id = entry.id;
            if (map.has(id)) id = uniqueId(id, new Set(map.keys()));
            map.set(id, Object.assign({}, entry, {id}));
        });
        return Array.from(map.values());
    }

    function resetHub() {
        if (!pageWindow.confirm("Repor posicao e remover atalhos personalizados?")) return;

        state.settings = Object.assign({}, DEFAULT_SETTINGS);
        state.custom = [];
        state.hiddenDefaults = [];

        writeValue(APP.settingsKey, state.settings);
        writeValue(APP.customKey, state.custom);
        writeValue(APP.hiddenDefaultsKey, state.hiddenDefaults);

        state.entries.clear();
        registerDefaults();
        applyPanelState();
        applyPanelPosition();
        if (state.dom.filter) state.dom.filter.value = "";
        if (state.dom.showUnavailable) state.dom.showUnavailable.checked = true;
        render();
        notify("Hub reposto.");
    }

    function startPicker() {
        if (state.picker) {
            stopPicker();
            return;
        }

        notify("Modo captura ativo: clica no botao que queres adicionar. ESC cancela.");
        document.documentElement.classList.add(`${APP.id}-picking`);

        const picker = {
            target: null,
            onMove(event) {
                const target = findPickTarget(event.target);
                if (target === picker.target) return;
                if (picker.target) picker.target.classList.remove(`${APP.id}-pick-target`);
                picker.target = target;
                if (picker.target) picker.target.classList.add(`${APP.id}-pick-target`);
            },
            onClick(event) {
                const target = findPickTarget(event.target);
                if (!target) return;

                event.preventDefault();
                event.stopPropagation();

                const selector = buildSelector(target);
                const label = labelFromTarget(target);
                stopPicker();
                addShortcutFlow({label, selector, group: "Meus Atalhos"});
            },
            onKey(event) {
                if (event.key === "Escape") {
                    event.preventDefault();
                    stopPicker();
                    notify("Captura cancelada.");
                }
            },
        };

        state.picker = picker;
        document.addEventListener("mousemove", picker.onMove, true);
        document.addEventListener("click", picker.onClick, true);
        document.addEventListener("keydown", picker.onKey, true);
    }

    function stopPicker() {
        const picker = state.picker;
        if (!picker) return;

        if (picker.target) picker.target.classList.remove(`${APP.id}-pick-target`);
        document.documentElement.classList.remove(`${APP.id}-picking`);
        document.removeEventListener("mousemove", picker.onMove, true);
        document.removeEventListener("click", picker.onClick, true);
        document.removeEventListener("keydown", picker.onKey, true);
        state.picker = null;
    }

    function findPickTarget(start) {
        if (!start || start === document || start === window) return null;
        const target = start.closest("button, a, input[type='button'], input[type='submit'], [role='button']");
        if (!target) return null;
        if (state.dom.root && state.dom.root.contains(target)) return null;
        return target;
    }

    function buildSelector(element) {
        if (element.id) return `#${cssEscape(element.id)}`;

        const path = [];
        let node = element;
        while (node && node.nodeType === 1 && node !== document.body) {
            let part = node.tagName.toLowerCase();
            const stableClasses = Array.from(node.classList || [])
                .filter((className) => !className.startsWith(APP.id))
                .slice(0, 2);

            if (stableClasses.length) {
                part += `.${stableClasses.map(cssEscape).join(".")}`;
            }

            const parent = node.parentElement;
            if (parent) {
                const same = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
                if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
            }

            path.unshift(part);
            const selector = path.join(" > ");
            try {
                if (document.querySelectorAll(selector).length === 1) return selector;
            } catch (error) {
                // Continue building a safer path.
            }

            node = parent;
        }

        return path.join(" > ");
    }

    function labelFromTarget(target) {
        const value = target.value || target.textContent || target.title || target.getAttribute("aria-label") || target.id || "Atalho";
        return cleanText(value).slice(0, 48) || "Atalho";
    }

    function initDragging() {
        let drag = null;

        state.dom.head.addEventListener("mousedown", (event) => {
            if (event.button !== 0) return;
            if (event.target.closest("button, input, a")) return;

            const rect = state.dom.panel.getBoundingClientRect();
            drag = {
                startX: event.clientX,
                startY: event.clientY,
                left: rect.left,
                top: rect.top,
            };
            event.preventDefault();
        });

        document.addEventListener("mousemove", (event) => {
            if (!drag) return;
            const nextLeft = drag.left + event.clientX - drag.startX;
            const nextTop = drag.top + event.clientY - drag.startY;
            setPanelPosition(nextLeft, nextTop);
        });

        document.addEventListener("mouseup", () => {
            if (!drag) return;
            drag = null;
            saveSettings();
        });
    }

    function setPanelPosition(left, top) {
        const panel = state.dom.panel;
        const rect = panel.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
        const maxTop = Math.max(8, window.innerHeight - 48);

        state.settings.left = clamp(Math.round(left), 8, maxLeft);
        state.settings.top = clamp(Math.round(top), 8, maxTop);
        applyPanelPosition();
    }

    function applyPanelPosition() {
        if (!state.dom.panel) return;

        state.dom.panel.style.width = `${clamp(toNumber(state.settings.width, 302), 260, 460)}px`;
        state.dom.panel.style.top = `${clamp(toNumber(state.settings.top, 150), 8, Math.max(8, window.innerHeight - 48))}px`;

        if (state.settings.left === null || state.settings.left === undefined) {
            state.dom.panel.style.left = "";
            state.dom.panel.style.right = "14px";
        } else {
            state.dom.panel.style.left = `${clamp(toNumber(state.settings.left, 14), 8, Math.max(8, window.innerWidth - 80))}px`;
            state.dom.panel.style.right = "auto";
        }
    }

    function setOpen(open) {
        state.settings.open = Boolean(open);
        saveSettings();
        applyPanelState();
    }

    function applyPanelState() {
        if (!state.dom.panel || !state.dom.launcher) return;

        state.dom.panel.classList.toggle(`${APP.id}-closed`, !state.settings.open);
        state.dom.launcher.style.setProperty("display", state.settings.open ? "none" : "inline-flex", "important");
    }

    function startDomObserver() {
        if (state.observer) state.observer.disconnect();

        state.observer = new MutationObserver((mutations) => {
            const onlyHubChanges = mutations.every((mutation) => {
                return state.dom.root && state.dom.root.contains(mutation.target);
            });
            if (!onlyHubChanges) scheduleRender();
        });
        state.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["id", "class", "style", "disabled"],
        });
    }

    function scheduleRender() {
        if (state.renderTimer) return;
        state.renderTimer = window.setTimeout(() => {
            state.renderTimer = null;
            render();
        }, 160);
    }

    function notify(message, type) {
        if (!state.dom.notice) return;

        state.dom.notice.textContent = cleanText(message);
        state.dom.notice.className = "";
        if (type) state.dom.notice.classList.add(`${APP.id}-${type}`);
        state.dom.notice.style.display = "block";

        clearTimeout(state.notifyTimer);
        state.notifyTimer = window.setTimeout(() => {
            state.dom.notice.style.display = "none";
        }, 2600);
    }

    function saveSettings() {
        writeValue(APP.settingsKey, state.settings);
    }

    function saveCustom() {
        state.custom = normalizeCustomList(state.custom);
        writeValue(APP.customKey, state.custom);
    }

    function readValue(key, fallback) {
        try {
            if (typeof GM_getValue === "function") {
                return GM_getValue(key, fallback);
            }
        } catch (error) {
            // Fall back to localStorage.
        }

        try {
            const raw = window.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function writeValue(key, value) {
        try {
            if (typeof GM_setValue === "function") {
                GM_setValue(key, value);
                return;
            }
        } catch (error) {
            // Fall back to localStorage.
        }

        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.warn("[TW Hub] Nao foi possivel guardar configuracao:", error);
        }
    }

    function normalizeParams(value) {
        if (!value) return {};
        if (typeof value === "object" && !Array.isArray(value)) {
            return Object.entries(value).reduce((acc, pair) => {
                const key = cleanText(pair[0]);
                if (!key) return acc;
                acc[key] = cleanText(pair[1]);
                return acc;
            }, {});
        }

        const params = {};
        String(value).replace(/^\?/, "").split("&").forEach((part) => {
            if (!part) return;
            const pieces = part.split("=");
            const key = decodeURIComponent(pieces[0] || "").trim();
            const val = decodeURIComponent(pieces.slice(1).join("=") || "").trim();
            if (key) params[key] = val;
        });
        return params;
    }

    function cleanText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function cleanId(value) {
        return cleanText(value)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 64) || `atalho-${Date.now()}`;
    }

    function uniqueId(base, existing) {
        let id = base || `atalho-${Date.now()}`;
        let index = 2;
        while (existing.has(id)) {
            id = `${base}-${index}`;
            index += 1;
        }
        return id;
    }

    function toNumber(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === "function") {
            return window.CSS.escape(String(value));
        }
        return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    }

    if (document.body) boot();
    else document.addEventListener("DOMContentLoaded", boot, {once: true});
})();
