// ==UserScript==
// @name         TW PT - Info de Conquistas - ThePlaguePT
// @namespace    theplaguept.tw.conquistas-mundo
// @version      1.0.59
// @description  Painel de conquistas do mundo por jogador, tribo, aldeia e hora.
// @author       ThePlaguePT
// @match        *://*/game.php*
// @include      *://*/game.php*
// @homepageURL  https://github.com/ThePlaguePT/TribalWars-Scripts
// @supportURL   https://github.com/ThePlaguePT/TribalWars-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Info%20de%20Conquistas%20-%20ThePlaguePT.user.js
// @downloadURL  https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Info%20de%20Conquistas%20-%20ThePlaguePT.user.js
// @grant        none
// @run-at       document-idle
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// ==/UserScript==

(() => {
    "use strict";

    if (window.top !== window.self) return;
    if (!isTribalWarsGamePage()) return;

    const APP = {
        id: "tpconq",
        version: "1.0.59",
        dialogId: "tpconqWorldConquests",
        title: "Conquistas do Mundo",
        githubUrl: "https://github.com/ThePlaguePT/TribalWars-Scripts",
        mapCacheMs: 55 * 60 * 1000,
        conquerCacheMs: 90 * 1000,
        maxStoredChars: 1800000,
        defaultLimit: 250,
        mapMarkerMax: 250,
        mapMarkerSearchMax: 5000,
        autoRefreshMinMs: 2 * 60 * 1000,
        autoRefreshMaxMs: 5 * 60 * 1000,
    };

    const state = {
        panel: null,
        launcher: null,
        busy: false,
        mapsLoadedAt: 0,
        conquestsLoadedAt: 0,
        lastConquerPath: "",
        rows: [],
        maps: {
            villages: new Map(),
            players: new Map(),
            tribes: new Map(),
        },
        controls: {},
        sortKey: "recent",
        autoTimer: null,
        mapMarkerTimer: null,
        mapLoadButton: null,
        panelSettingsDraft: null,
        launcherPositionFrame: 0,
        memoryCache: new Map(),
    };

    function isTribalWarsGamePage() {
        if (!/\/game\.php$/i.test(window.location.pathname)) return false;

        const data = window.game_data;
        if (data && typeof data === "object") {
            const link = String(data.link_base_pure || data.link_base || "");
            if (link.includes("game.php")) return true;
            if (data.world || data.screen || data.player || data.village) return true;
        }

        if (window.TribalWars || window.TWMap) return true;

        const host = window.location.hostname.toLowerCase();
        return [
            /(^|\.)tribalwars\.[a-z.]+$/,
            /(^|\.)die-staemme\.de$/,
            /(^|\.)staemme\.ch$/,
            /(^|\.)plemiona\.pl$/,
            /(^|\.)divokekmeny\.cz$/,
            /(^|\.)tribals\.it$/,
            /(^|\.)guerretribale\.fr$/,
            /(^|\.)guerrastribales\.es$/,
            /(^|\.)fyletikesmaxes\.gr$/,
            /(^|\.)triburile\.ro$/,
            /(^|\.)vojnaplemen\.si$/,
            /(^|\.)klanhaboru\.hu$/,
            /(^|\.)voyna-plemyon\.ru$/,
        ].some((pattern) => pattern.test(host));
    }

    function init() {
        injectStyle();
        createLauncher();
        scheduleLauncherPosition();
        ensureMapLoadButton();
        window.addEventListener("resize", scheduleLauncherPosition);
        window.addEventListener("orientationchange", scheduleLauncherPosition);
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && state.panel && !state.panel.classList.contains(`${APP.id}-hidden`)) {
                closePanel();
            }
        });
        window.setInterval(() => {
            scheduleLauncherPosition();
            ensureMapLoadButton();
            if (state.rows.length && markMapEnabled()) scheduleMapMarkers(0);
        }, 3000);
    }

    function injectStyle() {
        if (document.getElementById(`${APP.id}-style`)) return;
        const style = document.createElement("style");
        style.id = `${APP.id}-style`;
        style.textContent = `
#tp-theplaguept-script-bar {
    position: fixed !important;
    top: 8px !important;
    left: 414px !important;
    right: auto !important;
    bottom: auto !important;
    z-index: 2147483647 !important;
    width: auto !important;
    min-width: 0 !important;
    height: 34px !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 5px !important;
    padding: 0 8px !important;
    box-sizing: border-box !important;
    pointer-events: none !important;
    overflow: visible !important;
    transform: none !important;
}

#tp-theplaguept-script-bar > * {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    bottom: auto !important;
    transform: none !important;
    width: 30px !important;
    min-width: 30px !important;
    max-width: 30px !important;
    height: 28px !important;
    min-height: 28px !important;
    margin: 0 !important;
    flex: 0 0 30px !important;
    pointer-events: auto !important;
    overflow: visible !important;
}

#tp-theplaguept-script-bar > button,
#tp-theplaguept-script-bar > * > button {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    bottom: auto !important;
    transform: none !important;
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
    justify-content: center !important;
    gap: 0 !important;
    overflow: visible !important;
}

#tp-theplaguept-script-bar > button:hover,
#tp-theplaguept-script-bar > button:focus-visible,
#tp-theplaguept-script-bar > * > button:hover,
#tp-theplaguept-script-bar > * > button:focus-visible,
#tp-theplaguept-script-bar #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:hover,
#tp-theplaguept-script-bar #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:focus-visible,
#tp-theplaguept-script-bar > #tp-od-est-launcher:hover,
#tp-theplaguept-script-bar > #tp-od-est-launcher:focus-visible {
    width: 30px !important;
    min-width: 30px !important;
    max-width: 30px !important;
    padding: 0 !important;
    gap: 0 !important;
}

#tp-theplaguept-script-bar .tpdef-launcher-text,
#tp-theplaguept-script-bar .tw-alerts-toggle-label,
#tp-theplaguept-script-bar .ti-toggle-label,
#tp-theplaguept-script-bar .ra-tp-config-button-label,
#tp-theplaguept-script-bar [class$="-launcherLabel"],
#tp-theplaguept-script-bar [class$="-launcher-text"] {
    display: none !important;
    max-width: 0 !important;
    opacity: 0 !important;
}

#tp-theplaguept-script-bar #twHubTp-launcher { order: 10 !important; }
#tp-theplaguept-script-bar #tw-discord-alerts-ui { order: 20 !important; }
#tp-theplaguept-script-bar #tpDefLauncher { order: 30 !important; }
#tp-theplaguept-script-bar #tag-incomings-pt-panel { order: 40 !important; }
#tp-theplaguept-script-bar #tpMapMarker-launcher { order: 50 !important; }
#tp-theplaguept-script-bar #renomear-ataques-cores-theplaguept-config-button { order: 60 !important; }
#tp-theplaguept-script-bar #tpResumo24h-launcher { order: 70 !important; }
#tp-theplaguept-script-bar #tpconq-launcher { order: 80 !important; }
#tp-theplaguept-script-bar #twp-troop-summary-launcher { order: 85 !important; }
#tp-theplaguept-script-bar #auto-farm-a-toggle { order: 90 !important; }
#tp-theplaguept-script-bar #tp-od-est-launcher { order: 92 !important; }
#tp-theplaguept-script-bar #script-coleta-toggle { order: 94 !important; }

#tp-theplaguept-script-bar > .tp-theplaguept-script-bar-item[data-tp-title]::after {
    content: attr(data-tp-title) !important;
    position: absolute !important;
    left: 50% !important;
    top: 33px !important;
    transform: translateX(-50%) !important;
    display: none !important;
    white-space: nowrap !important;
    max-width: 360px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    padding: 4px 8px !important;
    border: 1px solid #4f120f !important;
    border-radius: 2px !important;
    background: linear-gradient(to bottom, #f6dfaa, #d2a05a) !important;
    color: #2b1509 !important;
    font: bold 11px Verdana, Arial, sans-serif !important;
    text-shadow: 0 1px #fff !important;
    box-shadow: 0 2px 6px rgba(0,0,0,.55) !important;
    pointer-events: none !important;
    z-index: 2147483647 !important;
}

#tp-theplaguept-script-bar > .tp-theplaguept-script-bar-item[data-tp-title]:hover::after,
#tp-theplaguept-script-bar > .tp-theplaguept-script-bar-item[data-tp-title]:focus-within::after {
    display: block !important;
}

@media (max-width: 1919px) {
    #tp-theplaguept-script-bar {
        top: 50vh !important;
        left: max(12px, calc((100vw - 1220px) / 2 + 8px)) !important;
        right: auto !important;
        bottom: auto !important;
        width: 34px !important;
        min-width: 34px !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: calc(100vh - 118px) !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 5px !important;
        padding: 8px 2px !important;
        transform: translateY(-50%) !important;
    }

    #tp-theplaguept-script-bar > #auto-farm-a-toggle::after,
    #tp-theplaguept-script-bar > #script-coleta-toggle::after,
    #tp-theplaguept-script-bar > .tp-theplaguept-script-bar-item[data-tp-title]::after {
        top: 50% !important;
        left: 38px !important;
        transform: translateY(-50%) !important;
    }

    #tp-theplaguept-script-bar [data-auto-farm-countdown],
    #tp-theplaguept-script-bar [data-script-coleta-countdown] {
        top: 50% !important;
        left: 38px !important;
        transform: translateY(-50%) !important;
    }
}
`;
        button.type = "button";
        const launcherTitle = `Conquistas - ThePlaguePT v${APP.version}`;
        button.title = launcherTitle;
        button.setAttribute("aria-label", launcherTitle);
        button.setAttribute("data-tp-title", launcherTitle);
        button.innerHTML = `
            <span class="${APP.id}-launcher-icon" aria-hidden="true"></span>
            <span class="${APP.id}-launcher-text">${launcherTitle}</span>
        `;
        button.addEventListener("click", openPanel);
        document.body.appendChild(button);
        attachToTpScriptBar(button);
        state.launcher = button;
        scheduleLauncherPosition();
        window.setTimeout(scheduleLauncherPosition, 250);
        window.setTimeout(scheduleLauncherPosition, 1000);
    }

    function scheduleLauncherPosition() {
        if (state.launcherPositionFrame) window.cancelAnimationFrame(state.launcherPositionFrame);
        state.launcherPositionFrame = window.requestAnimationFrame(() => {
            state.launcherPositionFrame = 0;
            positionLauncher();
        });
    }

    function positionLauncher() {
        const button = document.getElementById(`${APP.id}-launcher`);
        if (!button) return;
        if (button.closest("#tp-theplaguept-script-bar")) return;

        const gameLayout =
            document.querySelector("#main_layout td.maincell")
            || document.querySelector("td.maincell")
            || document.querySelector("#contentContainer")
            || document.querySelector("#content_value");

        let left = 12;

        if (gameLayout) {
            const layoutRect = gameLayout.getBoundingClientRect();
            if (layoutRect.width > 0) left = Math.max(4, Math.round(layoutRect.left - 55));
        }

        button.style.setProperty("left", `${left}px`, "important");
        button.style.setProperty("right", "auto", "important");
        button.style.setProperty("top", "370px", "important");
        button.style.setProperty("bottom", "auto", "important");
    }

    function ensureMapLoadButton() {
        const existing = document.getElementById(`${APP.id}-map-load`);
        const existingRow = document.getElementById(`${APP.id}-map-toggle-row`);
        if (!isMapScreen()) {
            if (existing) existing.remove();
            if (existingRow) existingRow.remove();
            state.mapLoadButton = null;
            return;
        }

        const parent = document.getElementById("tpMapMarker-mapToolbar") || findMapOverlayRoot() || document.getElementById("map") || document.body;
        let button = existing;
        if (!button) {
            button = document.createElement("button");
            button.id = `${APP.id}-map-load`;
            button.type = "button";
            button.innerHTML = `
                <span class="${APP.id}-map-load-icon" aria-hidden="true"></span>
                <span class="${APP.id}-map-load-label"></span>
            `;
            button.addEventListener("click", loadConquestsFromMapButton);
        }

        if (existingRow) existingRow.remove();
        if (parent !== document.body && window.getComputedStyle(parent).position === "static") {
            parent.style.position = "relative";
        }
        if (button.parentElement !== parent) parent.appendChild(button);
        state.mapLoadButton = button;
        syncMapLoadButtonState();
    }

    function setMapLoadButtonBusy(isBusy) {
        if (!state.mapLoadButton) return;
        state.mapLoadButton.disabled = isBusy;
        state.mapLoadButton.classList.toggle(`${APP.id}-map-load-busy`, isBusy);
        syncMapLoadButtonState(isBusy);
    }

    function syncMapLoadButtonState(isBusy = false) {
        if (!state.mapLoadButton) return;
        const enabled = markMapEnabled();
        const label = state.mapLoadButton.querySelector(`.${APP.id}-map-load-label`);
        state.mapLoadButton.classList.toggle(`${APP.id}-map-toggle-on`, enabled);
        state.mapLoadButton.classList.toggle(`${APP.id}-map-toggle-off`, !enabled);
        state.mapLoadButton.setAttribute("aria-pressed", String(enabled));
        state.mapLoadButton.setAttribute(
            "aria-label",
            enabled ? "Desligar marcacao de conquistas" : "Ligar marcacao de conquistas",
        );
        state.mapLoadButton.title = enabled
            ? "Desligar marcacao de conquistas no mapa"
            : "Ligar marcacao de conquistas no mapa";
        if (label) label.textContent = isBusy ? "A carregar..." : enabled ? "Marcar Conquistas: ON" : "Marcar Conquistas: OFF";
    }

    function isMapScreen() {
        const dataScreen = window.game_data && window.game_data.screen;
        if (dataScreen === "map") return true;
        return new URLSearchParams(window.location.search).get("screen") === "map";
    }

    async function loadConquestsFromMapButton() {
        const nextEnabled = !markMapEnabled();
        setMapMarkingEnabled(nextEnabled, true);
        syncMapLoadButtonState();

        if (!nextEnabled) {
            clearMapMarkers();
            setStatus("Marcacao no mapa desligada.");
            return;
        }

        await loadWorldData({ forceMap: false, forceConquer: true });
        scheduleMapMarkers(0);
        setStatus("Marcacao no mapa ligada.");
    }

    function setMapMarkingEnabled(enabled, persist = false) {
        if (hasPanelControls() && state.controls.markMap) {
            state.controls.markMap.checked = enabled;
            rememberPanelSettings();
        } else {
            const settings = Object.assign(defaultPanelSettings(), readPanelSettings() || {}, state.panelSettingsDraft || {});
            settings.markMap = enabled;
            state.panelSettingsDraft = settings;
        }

        if (!persist) return;
        try {
            window.localStorage.setItem(
                panelSettingsKey(),
                JSON.stringify(Object.assign(defaultPanelSettings(), state.panelSettingsDraft || {})),
            );
        } catch (_) {
            // A definicao fica ativa nesta sessao mesmo que o browser bloqueie o storage.
        }
    }

    function createPanel() {
        const panel = document.createElement("section");
        panel.id = `${APP.id}-panel`;
        panel.className = `${APP.id}-hidden`;
        panel.innerHTML = `
            <div class="${APP.id}-shell">
                <button class="${APP.id}-close" type="button" aria-label="Fechar">X</button>
                <div class="${APP.id}-frame">
                    <div class="${APP.id}-head">
                        <strong>TW Conquistas do Mundo - ThePlaguePT</strong>
                        <span>Conquistas, perdas e resumos do mundo atual. <span id="${APP.id}-world"></span></span>
                    </div>
                    <div class="${APP.id}-body">
                        <div class="${APP.id}-section ${APP.id}-filters">
                            <div class="${APP.id}-section-copy">
                                <div class="${APP.id}-section-title">Conquistas</div>
                                <p class="${APP.id}-section-desc">Filtra por periodo, jogador, tribo, aldeia, coordenada e continente.</p>
                            </div>
                            <div class="${APP.id}-section-options">
                                <div class="${APP.id}-toolbar">
                                    <div class="${APP.id}-field">
                                        <label for="${APP.id}-hours">Periodo</label>
                                        <select id="${APP.id}-hours">
                                            <option value="1" selected>Ultima 1 hora</option>
                                            <option value="3">Ultimas 3 horas</option>
                                            <option value="6">Ultimas 6 horas</option>
                                            <option value="12">Ultimas 12 horas</option>
                                            <option value="24">Ultimas 24 horas</option>
                                            <option value="48">Ultimas 48 horas</option>
                                            <option value="72">Ultimos 3 dias</option>
                                            <option value="168">Ultimos 7 dias</option>
                                            <option value="0">Tudo no ficheiro</option>
                                        </select>
                                    </div>
                                    <div class="${APP.id}-field">
                                        <label for="${APP.id}-side">Lado do filtro</label>
                                        <select id="${APP.id}-side">
                                            <option value="both" selected>Qualquer lado</option>
                                            <option value="gain">Quem conquistou</option>
                                            <option value="loss">Quem perdeu</option>
                                        </select>
                                    </div>
                                    <div class="${APP.id}-field">
                                        <label for="${APP.id}-group">Vista</label>
                                        <select id="${APP.id}-group">
                                            <option value="rows" selected>Conquistas</option>
                                            <option value="player">Agrupar jogador</option>
                                            <option value="tribe">Agrupar tribo</option>
                                            <option value="day">Agrupar dia</option>
                                        </select>
                                    </div>
                                    <div class="${APP.id}-field">
                                        <label for="${APP.id}-sort">Ordenar</label>
                                        <select id="${APP.id}-sort">
                                            <option value="recent" selected>Mais recentes</option>
                                            <option value="oldest">Mais antigas</option>
                                            <option value="points">Pontos</option>
                                            <option value="village">Aldeia</option>
                                            <option value="winner">Jogador +</option>
                                            <option value="loser">Jogador -</option>
                                            <option value="tribe">Tribo +</option>
                                        </select>
                                    </div>
                                    <div class="${APP.id}-field">
                                        <label for="${APP.id}-search">Procurar</label>
                                        <input id="${APP.id}-search" type="search" placeholder="Jogador, tribo, aldeia, coord">
                                    </div>
                                    <div class="${APP.id}-field">
                                        <label for="${APP.id}-continent">Continente</label>
                                        <input id="${APP.id}-continent" type="text" placeholder="K55 ou 55" maxlength="3">
                                    </div>
                                    <div class="${APP.id}-field">
                                        <label for="${APP.id}-limit">Limite visivel</label>
                                        <input id="${APP.id}-limit" type="number" min="20" max="5000" step="10" value="${APP.defaultLimit}">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="${APP.id}-section ${APP.id}-settings-section">
                            <div class="${APP.id}-section-copy">
                                <div class="${APP.id}-section-title">Configuracoes</div>
                                <p class="${APP.id}-section-desc">Define filtros permanentes e limpeza da vista.</p>
                            </div>
                            <div class="${APP.id}-section-options">
                                <div class="${APP.id}-config-list">
                                    <label class="${APP.id}-config-row">
                                        <input id="${APP.id}-hide-barbarians" type="checkbox">
                                        <span>
                                            <b>Ocultar barbaras</b>
                                            <span>Remove conquistas em que Barbaros ganhou ou perdeu a aldeia.</span>
                                        </span>
                                    </label>
                                    <label class="${APP.id}-config-row">
                                        <input id="${APP.id}-hide-own" type="checkbox">
                                        <span>
                                            <b>Ocultar minhas conquistas</b>
                                            <span>Remove conquistas em que o jogador atual aparece como vencedor ou perdedor.</span>
                                        </span>
                                    </label>
                                    <label class="${APP.id}-config-row">
                                        <input id="${APP.id}-hide-self" type="checkbox">
                                        <span>
                                            <b>Ocultar auto-conquistas</b>
                                            <span>Remove conquistas em que o mesmo jogador conquistou a propria aldeia.</span>
                                        </span>
                                    </label>
                                    <label class="${APP.id}-config-row">
                                        <input id="${APP.id}-mark-map" type="checkbox">
                                        <span>
                                            <b>Assinalar no mapa</b>
                                            <span>Marca no mapa as aldeias conquistadas no periodo e filtros atuais.</span>
                                        </span>
                                    </label>
                                    <div class="${APP.id}-config-row ${APP.id}-range-row">
                                        <span></span>
                                        <span>
                                            <b class="${APP.id}-range-head">
                                                <span>Opacidade do fundo</span>
                                                <output id="${APP.id}-map-opacity-value">95%</output>
                                            </b>
                                            <input id="${APP.id}-map-opacity" type="range" min="45" max="100" step="5" value="95">
                                            <span>Controla apenas a transparencia da cor de fundo das marcas.</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="${APP.id}-section ${APP.id}-summary-section">
                            <div class="${APP.id}-section-copy">
                                <div class="${APP.id}-section-title">Resumo</div>
                                <p class="${APP.id}-section-desc">Totais do filtro ativo para leitura rapida.</p>
                            </div>
                            <div class="${APP.id}-section-options">
                                <div id="${APP.id}-summary" class="${APP.id}-summary"></div>
                            </div>
                        </div>

                        <div class="${APP.id}-section ${APP.id}-list-section">
                            <div class="${APP.id}-section-copy">
                                <div class="${APP.id}-section-title">Resultados</div>
                                <p class="${APP.id}-section-desc">Tabela de conquistas ou agregacao por jogador, tribo ou dia.</p>
                            </div>
                            <div class="${APP.id}-section-options">
                                <div id="${APP.id}-content" class="${APP.id}-content">
                                    <div class="${APP.id}-notice">Abre o painel e carrega em Atualizar.</div>
                                </div>
                            </div>
                        </div>

                        <div class="${APP.id}-section ${APP.id}-actions-section">
                            <div class="${APP.id}-section-copy">
                                <div class="${APP.id}-section-title">Acoes</div>
                                <p class="${APP.id}-section-desc">Atualiza dados da vista atual.</p>
                            </div>
                            <div class="${APP.id}-section-options">
                                <div class="${APP.id}-actions">
                                    <div class="${APP.id}-action-stack">
                                        <button id="${APP.id}-save" class="${APP.id}-button" type="button">Guardar</button>
                                        <button id="${APP.id}-reset-settings" class="${APP.id}-button ${APP.id}-brown" type="button">Reset Configuracoes</button>
                                    </div>
                                    <button id="${APP.id}-reload" class="${APP.id}-button" type="button">Atualizar</button>
                                    <button id="${APP.id}-clear" class="${APP.id}-button" type="button">Limpar Cache</button>
                                    <label class="${APP.id}-field ${APP.id}-check">
                                        <input id="${APP.id}-auto" type="checkbox">
                                        Auto 2-5 min
                                    </label>
                                </div>
                                <div class="${APP.id}-footer">
                                    <span id="${APP.id}-status">Pronto.</span>
                                    <span>Dados publicos do mapa. Tribos = tribo atual do jogador. <a href="${APP.githubUrl}" target="_blank" rel="noopener noreferrer">GitHub</a></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        state.panel = panel;
        bindPanelControls(panel);
    }

    function bindPanelControls(root) {
        state.controls = {
            world: root.querySelector(`#${APP.id}-world`),
            hours: root.querySelector(`#${APP.id}-hours`),
            side: root.querySelector(`#${APP.id}-side`),
            group: root.querySelector(`#${APP.id}-group`),
            sort: root.querySelector(`#${APP.id}-sort`),
            search: root.querySelector(`#${APP.id}-search`),
            continent: root.querySelector(`#${APP.id}-continent`),
            limit: root.querySelector(`#${APP.id}-limit`),
            hideBarbarians: root.querySelector(`#${APP.id}-hide-barbarians`),
            hideOwn: root.querySelector(`#${APP.id}-hide-own`),
            hideSelf: root.querySelector(`#${APP.id}-hide-self`),
            markMap: root.querySelector(`#${APP.id}-mark-map`),
            mapOpacity: root.querySelector(`#${APP.id}-map-opacity`),
            mapOpacityValue: root.querySelector(`#${APP.id}-map-opacity-value`),
            auto: root.querySelector(`#${APP.id}-auto`),
            reload: root.querySelector(`#${APP.id}-reload`),
            save: root.querySelector(`#${APP.id}-save`),
            resetSettings: root.querySelector(`#${APP.id}-reset-settings`),
            clear: root.querySelector(`#${APP.id}-clear`),
            summary: root.querySelector(`#${APP.id}-summary`),
            content: root.querySelector(`#${APP.id}-content`),
            status: root.querySelector(`#${APP.id}-status`),
        };

        applyPanelSettings(readPanelSettings() || defaultPanelSettings());
        rememberPanelSettings();

        const close = root.querySelector(`.${APP.id}-close`);
        if (close) close.addEventListener("click", closePanel);
        state.controls.reload.addEventListener("click", () => loadWorldData({ forceMap: false, forceConquer: true }));
        state.controls.save.addEventListener("click", savePanelSettings);
        state.controls.resetSettings.addEventListener("click", resetPanelSettings);
        state.controls.clear.addEventListener("click", clearCacheAndReload);
        state.controls.auto.addEventListener("change", () => {
            rememberPanelSettings();
            syncAutoRefresh(true);
        });

        ["hours", "side", "group", "sort", "search", "continent", "limit", "hideBarbarians", "hideOwn", "hideSelf", "markMap", "mapOpacity"].forEach((name) => {
            const control = state.controls[name];
            const eventName = control.type === "checkbox" ? "change" : control.tagName === "INPUT" ? "input" : "change";
            control.addEventListener(eventName, rememberPanelSettings);
            control.addEventListener(eventName, debounce(() => {
                rememberPanelSettings();
                syncMapOpacityOutput();
                if (name === "hours") {
                    loadWorldData({ forceMap: false, forceConquer: true });
                } else if (name === "mapOpacity") {
                    scheduleMapMarkers(0);
                } else {
                    render();
                }
                if (name === "markMap") syncMapLoadButtonState();
                scheduleMapMarkers();
            }, name === "search" ? 160 : 0));
        });

        syncAutoRefresh(false);
    }

    function defaultPanelSettings() {
        return {
            hours: "1",
            side: "both",
            group: "rows",
            sort: "recent",
            search: "",
            continent: "",
            limit: String(APP.defaultLimit),
            hideBarbarians: false,
            hideOwn: false,
            hideSelf: false,
            markMap: true,
            mapOpacity: "95",
            auto: false,
        };
    }

    function hasPanelControls() {
        return Boolean(
            state.controls
            && state.controls.hours
            && state.controls.hours.isConnected
            && state.controls.content
            && state.controls.content.isConnected,
        );
    }

    function activePanelSettings() {
        if (hasPanelControls()) {
            rememberPanelSettings();
            return Object.assign(defaultPanelSettings(), state.panelSettingsDraft || {});
        }
        return Object.assign(defaultPanelSettings(), state.panelSettingsDraft || readPanelSettings() || {});
    }

    function panelSettingsKey() {
        return `${APP.id}:settings:${window.location.host}`;
    }

    function readPanelSettings() {
        try {
            const raw = window.localStorage.getItem(panelSettingsKey());
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return null;
            return parsed;
        } catch (_) {
            return null;
        }
    }

    function collectPanelSettings() {
        return {
            hours: state.controls.hours.value,
            side: state.controls.side.value,
            group: state.controls.group.value,
            sort: state.controls.sort.value,
            search: state.controls.search.value.trim(),
            continent: state.controls.continent.value.trim(),
            limit: String(visibleLimit()),
            hideBarbarians: Boolean(state.controls.hideBarbarians.checked),
            hideOwn: Boolean(state.controls.hideOwn.checked),
            hideSelf: Boolean(state.controls.hideSelf.checked),
            markMap: Boolean(state.controls.markMap.checked),
            mapOpacity: String(markerOpacityPercentFromValue(state.controls.mapOpacity.value)),
            auto: Boolean(state.controls.auto.checked),
        };
    }

    function rememberPanelSettings() {
        if (!hasPanelControls()) return;
        state.panelSettingsDraft = collectPanelSettings();
    }

    function applyPanelSettings(settings) {
        const values = Object.assign(defaultPanelSettings(), settings || {});
        setSelectValue(state.controls.hours, values.hours);
        setSelectValue(state.controls.side, values.side);
        setSelectValue(state.controls.group, values.group);
        setSelectValue(state.controls.sort, values.sort);
        state.controls.search.value = String(values.search || "");
        state.controls.continent.value = String(values.continent || "");
        state.controls.limit.value = String(Math.max(20, Math.min(5000, Number(values.limit) || APP.defaultLimit)));
        state.controls.hideBarbarians.checked = Boolean(values.hideBarbarians);
        state.controls.hideOwn.checked = Boolean(values.hideOwn);
        state.controls.hideSelf.checked = Boolean(values.hideSelf);
        state.controls.markMap.checked = values.markMap !== false;
        state.controls.mapOpacity.value = String(markerOpacityPercentFromValue(values.mapOpacity));
        syncMapOpacityOutput();
        state.controls.auto.checked = Boolean(values.auto);
        syncMapLoadButtonState();
    }

    function setSelectValue(control, value) {
        const stringValue = String(value);
        const exists = Array.from(control.options).some((option) => option.value === stringValue);
        if (exists) control.value = stringValue;
    }

    function syncMapOpacityOutput() {
        if (!state.controls.mapOpacity || !state.controls.mapOpacityValue) return;
        state.controls.mapOpacityValue.textContent = `${markerOpacityPercentFromValue(state.controls.mapOpacity.value)}%`;
    }

    function markerOpacityPercentFromValue(value) {
        return Math.max(45, Math.min(100, Number(value) || 95));
    }

    function markerOpacityValue(settings = activePanelSettings()) {
        return markerOpacityPercentFromValue(settings.mapOpacity) / 100;
    }

    function savePanelSettings() {
        const settings = collectPanelSettings();
        state.panelSettingsDraft = settings;
        try {
            window.localStorage.setItem(panelSettingsKey(), JSON.stringify(settings));
            notify("Configuracoes guardadas.", "success");
            setStatus("Configuracoes guardadas.");
        } catch (_) {
            notify("Nao foi possivel guardar as configuracoes.", "error");
        }
    }

    function resetPanelSettings() {
        try {
            window.localStorage.removeItem(panelSettingsKey());
        } catch (_) {
            // Storage can be blocked by the browser; defaults still apply in the open panel.
        }

        applyPanelSettings(defaultPanelSettings());
        rememberPanelSettings();
        syncAutoRefresh(false);
        notify("Configuracoes repostas.", "success");
        setStatus("Configuracoes repostas.");

        if (state.rows.length) {
            loadWorldData({ forceMap: false, forceConquer: true });
        } else {
            render();
        }
    }

    function openPanel() {
        if (window.Dialog && typeof window.Dialog.show === "function") {
            openNativeDialogPanel();
            return;
        }

        if (!state.panel || !state.panel.isConnected) createPanel();
        state.controls.world.textContent = ` ${worldKey()} - ${window.location.host}`;
        state.panel.classList.remove(`${APP.id}-hidden`);
        if (!state.rows.length && !state.busy) {
            loadWorldData({ forceMap: false, forceConquer: false });
        }
    }

    function openNativeDialogPanel() {
        const html = getFallbackPanelHtml().replace(
            new RegExp(`<button[^>]*class="${APP.id}-close"[^>]*>\\s*X\\s*<\\/button>\\s*`),
            "",
        );

        window.Dialog.show(APP.dialogId, html);
        const frame = document.querySelector(`.${APP.id}-frame`);
        if (!frame) return;

        expandNativeDialog(frame);
        scheduleDialogRecentering();

        state.panel = frame;
        bindPanelControls(document);
        state.controls.world.textContent = ` ${worldKey()} - ${window.location.host}`;

        if (!state.rows.length && !state.busy) {
            loadWorldData({ forceMap: false, forceConquer: false });
        } else {
            render();
        }
    }

    function expandNativeDialog(frame) {
        const box = findNativeDialogBox(frame);
        const content = frame.closest(".popup_box_content") || (box && box.querySelector(".popup_box_content")) || frame.parentElement;
        const shell = frame.closest(`.${APP.id}-shell`) || frame.parentElement;
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
            setStyleImportant(box, "z-index", "20002");
        }

        [content, content && content.firstElementChild, shell, frame].filter(Boolean).forEach((node) => {
            setStyleImportant(node, "max-width", "100%");
            setStyleImportant(node, "min-width", "0");
            setStyleImportant(node, "box-sizing", "border-box");
            setStyleImportant(node, "overflow-x", "hidden");
            setStyleImportant(node, "overflow-y", "hidden");
        });

        if (shell) {
            setStyleImportant(shell, "width", "min(1260px, calc(100vw - 58px))");
            setStyleImportant(shell, "margin", "0 auto");
            setStyleImportant(shell, "padding", "0");
            setStyleImportant(shell, "overflow", "visible");
        }
        setStyleImportant(frame, "width", "100%");
        setStyleImportant(frame, "max-height", "calc(100vh - 42px)");
        setStyleImportant(frame, "overflow", "hidden");
    }

    function setStyleImportant(node, name, value) {
        if (!node || !node.style) return;
        node.style.setProperty(name, value, "important");
    }

    function recenterNativeDialog() {
        const frame = document.querySelector(`.${APP.id}-frame`);
        if (frame) expandNativeDialog(frame);
    }

    function scheduleDialogRecentering() {
        [0, 50, 150, 350].forEach((delay) => {
            window.setTimeout(recenterNativeDialog, delay);
        });
    }

    function findNativeDialogBox(frame) {
        const explicit = document.getElementById(`popup_box_${APP.dialogId}`);
        if (explicit) return explicit;

        let node = frame.parentElement;
        let candidate = null;
        while (node && node !== document.body) {
            const id = String(node.id || "");
            const className = String(node.className || "");
            const classes = node.classList ? Array.from(node.classList) : [];
            if (id.indexOf("popup_box_") === 0 || id === "popup_box" || classes.includes("popup_box")) return node;
            if (!candidate && /popup|dialog/i.test(`${id} ${className}`)) candidate = node;
            node = node.parentElement;
        }
        return candidate || frame.parentElement;
    }

    function getFallbackPanelHtml() {
        let panel = document.getElementById(`${APP.id}-panel`);
        if (!panel) {
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
        if (window.Dialog && typeof window.Dialog.close === "function" && state.panel && !state.panel.id) {
            window.Dialog.close(APP.dialogId);
            state.panel = null;
            return;
        }

        if (state.panel) state.panel.classList.add(`${APP.id}-hidden`);
    }

    async function loadWorldData({ forceMap, forceConquer }) {
        if (state.busy) return;
        state.busy = true;
        setBusy(true);
        setStatus("A carregar dados do mundo...");

        try {
            const settings = activePanelSettings();
            const hours = Number(settings.hours || 24);
            const since = hours > 0 ? Math.floor(Date.now() / 1000) - hours * 3600 : 0;
            const conquerPath = buildConquerPath(hours, since);
            const conquerKey = `${conquerPath}|since=${since}`;
            const mapExpired = Date.now() - state.mapsLoadedAt > APP.mapCacheMs;
            const conquerExpired = Date.now() - state.conquestsLoadedAt > APP.conquerCacheMs || conquerKey !== state.lastConquerPath;

            const mapPromise = forceMap || mapExpired || !state.maps.players.size
                ? loadMaps(forceMap)
                : Promise.resolve();
            await mapPromise;

            if (forceConquer || conquerExpired || !state.rows.length) {
                const conquerText = await fetchCachedText(`conquer:${conquerPath}`, conquerPath, APP.conquerCacheMs, forceConquer, false);
                state.rows = parseConquests(conquerText, since);
                state.conquestsLoadedAt = Date.now();
                state.lastConquerPath = conquerKey;
            }

            if (hasPanelControls()) render();
            scheduleMapMarkers();
            setStatus(`Atualizado: ${formatDateTime(new Date())}`);
        } catch (error) {
            console.error(`[${APP.id}]`, error);
            if (hasPanelControls()) showNotice(`Erro ao carregar dados: ${error.message || error}`);
            notify(`Erro ao carregar conquistas: ${error.message || error}`, "error");
            setStatus("Erro ao carregar dados.");
            clearMapMarkers();
        } finally {
            state.busy = false;
            setBusy(false);
        }
    }

    async function loadMaps(force) {
        const [villagesText, playersText, tribesText] = await Promise.all([
            fetchCachedText("villages", "/map/village.txt", APP.mapCacheMs, force, true),
            fetchCachedText("players", "/map/player.txt", APP.mapCacheMs, force, true),
            fetchCachedText("tribes", "/map/ally.txt", APP.mapCacheMs, force, true),
        ]);

        state.maps.villages = parseVillages(villagesText);
        state.maps.players = parsePlayers(playersText);
        state.maps.tribes = parseTribes(tribesText);
        state.mapsLoadedAt = Date.now();
    }

    function buildConquerPath(hours, since) {
        if (hours > 0 && hours < 24) {
            return `/interface.php?func=get_conquer&since=${since}`;
        }
        return "/map/conquer.txt";
    }

    async function fetchCachedText(name, path, ttlMs, force, allowLocalStorage) {
        const now = Date.now();
        const memory = state.memoryCache.get(name);
        if (!force && memory && now - memory.time < ttlMs) return memory.text;

        const storageKey = `${APP.id}:${window.location.host}:${name}`;
        if (!force && allowLocalStorage) {
            const stored = readStorage(storageKey);
            if (stored && now - stored.time < ttlMs) {
                state.memoryCache.set(name, stored);
                return stored.text;
            }
        }

        const response = await fetch(path, {
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Accept": "text/plain,*/*" },
        });

        if (!response.ok) {
            throw new Error(`${path} (${response.status})`);
        }

        const text = await response.text();
        const entry = { time: now, text };
        state.memoryCache.set(name, entry);

        if (allowLocalStorage && text.length <= APP.maxStoredChars) {
            writeStorage(storageKey, entry);
        }

        return text;
    }

    function readStorage(key) {
        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.text !== "string" || typeof parsed.time !== "number") return null;
            return parsed;
        } catch (_) {
            return null;
        }
    }

    function writeStorage(key, value) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch (_) {
            // Large worlds can exceed localStorage; in-memory cache is enough for the current page.
        }
    }

    function clearCacheAndReload() {
        Object.keys(window.localStorage)
            .filter((key) => key.startsWith(`${APP.id}:${window.location.host}:`))
            .forEach((key) => window.localStorage.removeItem(key));
        state.memoryCache.clear();
        state.mapsLoadedAt = 0;
        state.conquestsLoadedAt = 0;
        notify("Cache das conquistas limpo.", "success");
        loadWorldData({ forceMap: true, forceConquer: true });
    }

    function parseVillages(text) {
        const villages = new Map();
        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 7) continue;
            const id = toInt(cols[0]);
            const x = toInt(cols[2]);
            const y = toInt(cols[3]);
            villages.set(id, {
                id,
                name: decodeTW(cols[1]) || `Aldeia #${id}`,
                x,
                y,
                coords: `${x}|${y}`,
                continent: continentFromCoords(x, y),
                playerId: toInt(cols[4]),
                points: toInt(cols[5]),
                bonus: toInt(cols[6]),
            });
        }
        return villages;
    }

    function parsePlayers(text) {
        const players = new Map();
        players.set(0, {
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
            const id = toInt(cols[0]);
            players.set(id, {
                id,
                name: decodeTW(cols[1]) || `Jogador #${id}`,
                tribeId: toInt(cols[2]),
                villages: toInt(cols[3]),
                points: toInt(cols[4]),
                rank: toInt(cols[5]),
            });
        }
        return players;
    }

    function parseTribes(text) {
        const tribes = new Map();
        tribes.set(0, {
            id: 0,
            name: "Sem tribo",
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
            const id = toInt(cols[0]);
            tribes.set(id, {
                id,
                name: decodeTW(cols[1]) || `Tribo #${id}`,
                tag: decodeTW(cols[2]) || `#${id}`,
                members: toInt(cols[3]),
                villages: toInt(cols[4]),
                points: toInt(cols[5]),
                allPoints: toInt(cols[6]),
                rank: toInt(cols[7]),
            });
        }
        return tribes;
    }

    function parseConquests(text, since) {
        const rows = [];
        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 4) continue;

            const villageId = toInt(cols[0]);
            const timestamp = toInt(cols[1]);
            if (since && timestamp < since) continue;

            const newOwnerId = toInt(cols[2]);
            const oldOwnerId = toInt(cols[3]);
            const village = state.maps.villages.get(villageId) || fallbackVillage(villageId);
            const newPlayer = playerById(newOwnerId);
            const oldPlayer = playerById(oldOwnerId);
            const newTribe = tribeById(newPlayer.tribeId);
            const oldTribe = tribeById(oldPlayer.tribeId);

            rows.push({
                villageId,
                timestamp,
                date: new Date(timestamp * 1000),
                newOwnerId,
                oldOwnerId,
                village,
                newPlayer,
                oldPlayer,
                newTribe,
                oldTribe,
                search: "",
            });
        }

        rows.forEach((row) => {
            row.search = fold([
                row.village.name,
                row.village.coords,
                row.village.continent,
                row.newPlayer.name,
                row.oldPlayer.name,
                row.newTribe.name,
                row.newTribe.tag,
                row.oldTribe.name,
                row.oldTribe.tag,
            ].join(" "));
            row.searchGain = fold([
                row.village.name,
                row.village.coords,
                row.village.continent,
                row.newPlayer.name,
                row.newTribe.name,
                row.newTribe.tag,
            ].join(" "));
            row.searchLoss = fold([
                row.village.name,
                row.village.coords,
                row.village.continent,
                row.oldPlayer.name,
                row.oldTribe.name,
                row.oldTribe.tag,
            ].join(" "));
        });

        return rows.sort((a, b) => b.timestamp - a.timestamp);
    }

    function fallbackVillage(id) {
        return {
            id,
            name: `Aldeia #${id}`,
            x: 0,
            y: 0,
            coords: "?|?",
            continent: "K??",
            playerId: 0,
            points: 0,
            bonus: 0,
        };
    }

    function playerById(id) {
        if (state.maps.players.has(id)) return state.maps.players.get(id);
        return {
            id,
            name: id ? `Jogador #${id}` : "Barbaros",
            tribeId: 0,
            villages: 0,
            points: 0,
            rank: 0,
        };
    }

    function tribeById(id) {
        if (state.maps.tribes.has(id)) return state.maps.tribes.get(id);
        return {
            id,
            name: id ? `Tribo #${id}` : "Sem tribo",
            tag: id ? `#${id}` : "-",
            members: 0,
            villages: 0,
            points: 0,
            allPoints: 0,
            rank: 0,
        };
    }

    function render() {
        if (!state.panel) return;
        const rows = getCurrentRows();
        renderSummary(rows);

        const groupMode = state.controls.group.value;
        if (!state.rows.length) {
            showNotice("Sem dados carregados.");
            clearMapMarkers();
            return;
        }
        if (!rows.length) {
            showNotice("Nenhuma conquista encontrada com estes filtros.");
            setStatus("0 conquistas nos filtros atuais.");
            clearMapMarkers();
            return;
        }

        if (groupMode === "rows") {
            renderRows(rows);
        } else {
            renderGroups(rows, groupMode);
        }
        scheduleMapMarkers();
    }

    function getCurrentRows() {
        return getRowsForSettings(activePanelSettings());
    }

    function getRowsForSettings(settings) {
        const values = Object.assign(defaultPanelSettings(), settings || {});
        const query = fold(String(values.search || "").trim());
        const exactTribeTag = exactTribeTagFromQuery(query);
        const side = values.side || "both";
        const continent = normalizeContinent(values.continent || "");
        const hideBarbarians = Boolean(values.hideBarbarians);
        const hideOwn = Boolean(values.hideOwn);
        const hideSelf = Boolean(values.hideSelf);
        const hours = Number(values.hours || 24);
        const since = hours > 0 ? Math.floor(Date.now() / 1000) - hours * 3600 : 0;

        let rows = state.rows.filter((row) => {
            if (since && row.timestamp < since) return false;
            if (continent && row.village.continent !== continent) return false;
            if (hideBarbarians && isBarbarianConquest(row)) return false;
            if (hideOwn && isOwnPlayerConquest(row)) return false;
            if (hideSelf && isSelfConquest(row)) return false;
            if (!query) return true;
            if (exactTribeTag) return rowMatchesExactTribeTag(row, exactTribeTag, side);
            if (side === "gain") return row.searchGain.includes(query);
            if (side === "loss") return row.searchLoss.includes(query);
            return row.search.includes(query);
        });

        rows = rows.slice().sort((a, b) => {
            switch (values.sort) {
                case "oldest":
                    return a.timestamp - b.timestamp;
                case "points":
                    return b.village.points - a.village.points || b.timestamp - a.timestamp;
                case "village":
                    return a.village.name.localeCompare(b.village.name) || b.timestamp - a.timestamp;
                case "winner":
                    return a.newPlayer.name.localeCompare(b.newPlayer.name) || b.timestamp - a.timestamp;
                case "loser":
                    return a.oldPlayer.name.localeCompare(b.oldPlayer.name) || b.timestamp - a.timestamp;
                case "tribe":
                    return a.newTribe.tag.localeCompare(b.newTribe.tag) || b.timestamp - a.timestamp;
                case "recent":
                default:
                    return b.timestamp - a.timestamp;
            }
        });

        return rows;
    }

    function exactTribeTagFromQuery(query) {
        if (!query || query === "-") return "";
        for (const tribe of state.maps.tribes.values()) {
            const tag = fold(tribe.tag || "");
            if (tag && tag !== "-" && tag === query) return tag;
        }
        return "";
    }

    function rowMatchesExactTribeTag(row, tag, side) {
        const gainTag = fold(row.newTribe && row.newTribe.tag);
        const lossTag = fold(row.oldTribe && row.oldTribe.tag);
        if (side === "gain") return gainTag === tag;
        if (side === "loss") return lossTag === tag;
        return gainTag === tag || lossTag === tag;
    }

    function isBarbarianConquest(row) {
        return row.newOwnerId === 0 || row.oldOwnerId === 0 || row.newPlayer.id === 0 || row.oldPlayer.id === 0;
    }

    function isOwnPlayerConquest(row) {
        const id = ownPlayerId();
        return id > 0 && (row.newOwnerId === id || row.oldOwnerId === id || row.newPlayer.id === id || row.oldPlayer.id === id);
    }

    function isSelfConquest(row) {
        return row.newOwnerId > 0 && row.newOwnerId === row.oldOwnerId;
    }

    function ownPlayerId() {
        const player = window.game_data && window.game_data.player;
        return player && Number(player.id) ? Number(player.id) : 0;
    }

    function markMapEnabled() {
        if (hasPanelControls() && state.controls.markMap) return state.controls.markMap.checked;
        const settings = state.panelSettingsDraft || readPanelSettings();
        return !settings || settings.markMap !== false;
    }

    function scheduleMapMarkers(delay = 80) {
        if (state.mapMarkerTimer) window.clearTimeout(state.mapMarkerTimer);
        state.mapMarkerTimer = window.setTimeout(updateMapMarkers, delay);
    }

    function updateMapMarkers() {
        clearMapMarkers();
        if (!markMapEnabled() || !state.rows.length) return;

        const root = findMapRoot();

        const rows = mapMarkerRows().slice().sort((a, b) => b.timestamp - a.timestamp);
        const latestByVillage = new Map();
        rows.forEach((row) => {
            if (!row.village || !row.village.id) return;
            if (!latestByVillage.has(row.village.id)) latestByVillage.set(row.village.id, row);
        });

        let marked = 0;
        const candidates = Array.from(latestByVillage.values()).slice(0, APP.mapMarkerSearchMax);
        if (root) {
            for (const row of candidates) {
                if (markMapVillage(root, row)) marked += 1;
                if (marked >= APP.mapMarkerMax) break;
            }
        }
        markMiniMap(candidates);
    }

    function clearMapMarkers() {
        document.querySelectorAll(`.${APP.id}-map-layer`).forEach((node) => node.remove());
        document.querySelectorAll(`.${APP.id}-minimap-layer`).forEach((node) => node.remove());
        document.querySelectorAll(`.${APP.id}-map-marker`).forEach((node) => node.remove());
        document.querySelectorAll(`.${APP.id}-map-marker-host`).forEach((node) => {
            const original = node.dataset ? node.dataset.tpconqPosition : undefined;
            if (original == null || original === "") {
                node.style.removeProperty("position");
            } else {
                node.style.position = original;
            }
            node.classList.remove(`${APP.id}-map-marker-host`);
            if (node.dataset) delete node.dataset.tpconqPosition;
        });
        document.querySelectorAll(`.${APP.id}-map-mark`).forEach((node) => {
            node.classList.remove(`${APP.id}-map-mark`);
            if (node.dataset) delete node.dataset.tpconqMarked;
        });
    }

    function mapMarkerRows() {
        return getRowsForSettings(activePanelSettings());
    }

    function findMapRoot() {
        return findMapOverlayRoot()
            || document.getElementById("map")
            || document.getElementById("map_mover")
            || document.getElementById("map_whole")
            || document.querySelector("#map_container")
            || document.querySelector(".map_container")
            || document.querySelector("[id^='map_']");
    }

    function findMapOverlayRoot() {
        return normalizeMapOverlayRoot(
            document.getElementById("map_wrap")
            || document.querySelector("#map_container")
            || document.querySelector(".map_container")
            || document.getElementById("map"),
        );
    }

    function markMiniMap(rows) {
        const container = findMiniMapContainer();
        if (!container || !rows.length) return 0;
        return markMiniMapByGrid(container, rows) || markMiniMapByBounds(container, rows);
    }

    function markMiniMapByGrid(container, rows) {
        const rowByCoord = rowsByVillageCoord(rows);
        if (!rowByCoord.size) return 0;

        const twMap = window.TWMap || {};
        const maps = [twMap.minimap, twMap.pmap, twMap.politicalMap, twMap.pmapHandler?.map].filter(Boolean);
        for (const map of maps) {
            if (!Array.isArray(map.pos) || typeof map.coordByPixel !== "function") continue;
            const width = container.clientWidth;
            const height = container.clientHeight;
            if (width <= 30 || height <= 30) continue;

            const found = new Map();
            for (let py = 0; py <= height && found.size < rowByCoord.size && found.size < APP.mapMarkerMax; py += 2) {
                for (let px = 0; px <= width && found.size < rowByCoord.size && found.size < APP.mapMarkerMax; px += 2) {
                    const coord = map.coordByPixel(map.pos[0] + px, map.pos[1] + py);
                    const key = coord && `${coord[0]}|${coord[1]}`;
                    const row = key ? rowByCoord.get(key) : null;
                    if (row && !found.has(key)) found.set(key, { px, py, row });
                }
            }
            if (!found.size) continue;

            const layer = ensureMiniMapLayer(container);
            found.forEach((point) => addMiniMapDot(layer, point.row, `${point.px}px`, `${point.py}px`));
            return found.size;
        }
        return 0;
    }

    function markMiniMapByBounds(container, rows) {
        const bounds = miniMapBounds(container);
        if (!bounds || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) return 0;

        const layer = ensureMiniMapLayer(container);
        let marked = 0;
        for (const row of rows) {
            if (marked >= APP.mapMarkerMax) break;
            const x = Number(row.village && row.village.x);
            const y = Number(row.village && row.village.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
            addMiniMapDot(
                layer,
                row,
                `${((x - bounds.minX) / (bounds.maxX - bounds.minX)) * 100}%`,
                `${((y - bounds.minY) / (bounds.maxY - bounds.minY)) * 100}%`,
            );
            marked += 1;
        }
        if (!marked) layer.remove();
        return marked;
    }

    function rowsByVillageCoord(rows) {
        const rowByCoord = new Map();
        rows.forEach((row) => {
            const coords = row.village && row.village.coords;
            if (coords && !rowByCoord.has(coords)) rowByCoord.set(coords, row);
        });
        return rowByCoord;
    }

    function findMiniMapContainer() {
        const selectors = ["#minimap", "#politicalmap", "#pmap", "#minimap_container", ".minimap"];
        return selectors
            .map((selector) => document.querySelector(selector))
            .find((node) => node && node.offsetWidth > 30 && node.offsetHeight > 30) || null;
    }

    function ensureMiniMapLayer(container) {
        if (window.getComputedStyle(container).position === "static") container.style.position = "relative";
        let layer = container.querySelector(`#${APP.id}-minimap-layer`);
        if (!layer) {
            layer = document.createElement("div");
            layer.id = `${APP.id}-minimap-layer`;
            layer.className = `${APP.id}-minimap-layer`;
            container.appendChild(layer);
        }
        return layer;
    }

    function addMiniMapDot(layer, row, left, top) {
        const dot = document.createElement("span");
        dot.className = `${APP.id}-minimap-dot ${markerAgeClass(row)}`;
        dot.title = `${row.village.name} (${row.village.coords}) - ${formatDateTime(row.date)} - ${markerAgeLabel(row)}`;
        dot.style.left = left;
        dot.style.top = top;
        dot.style.setProperty(`--${APP.id}-marker-bg-alpha`, String(markerOpacityValue()));
        layer.appendChild(dot);
    }

    function miniMapBounds(container) {
        const twMap = window.TWMap || {};
        const maps = [twMap.minimap, twMap.pmap, twMap.politicalMap, twMap.pmapHandler].filter(Boolean);
        for (const map of maps) {
            const pos = map.pos || map.position || map._pos;
            const size = map.size || map.mapSize || map._size;
            if (Array.isArray(pos) && Array.isArray(size) && size[0] > 0 && size[1] > 0) {
                return { minX: +pos[0], minY: +pos[1], maxX: +pos[0] + +size[0], maxY: +pos[1] + +size[1] };
            }
            const minX = numberFrom(map, ["minX", "x", "startX"]);
            const minY = numberFrom(map, ["minY", "y", "startY"]);
            const maxX = numberFrom(map, ["maxX", "endX"]);
            const maxY = numberFrom(map, ["maxY", "endY"]);
            if ([minX, minY, maxX, maxY].every(Number.isFinite)) return { minX, minY, maxX, maxY };
        }

        const source = Array.from(container.querySelectorAll("img"))
            .map((image) => image.currentSrc || image.src)
            .find(Boolean) || window.getComputedStyle(container).backgroundImage;
        const urlBounds = parseMiniMapUrl(source);
        if (urlBounds) return urlBounds;

        const map = twMap.map;
        const pos = map && map.pos;
        const tileSize = twMap.tileSize || (map && map.tileSize) || 53;
        const tileX = Array.isArray(tileSize) ? Number(tileSize[0]) : Number(tileSize);
        const tileY = Array.isArray(tileSize) ? Number(tileSize[1]) : Number(tileSize);
        if (Array.isArray(pos) && tileX > 0 && tileY > 0) {
            const visibleX = Math.max(1, (document.querySelector("#map")?.clientWidth || 795) / tileX);
            const visibleY = Math.max(1, (document.querySelector("#map")?.clientHeight || 570) / tileY);
            return { minX: pos[0] - visibleX * 1.5, minY: pos[1] - visibleY * 1.5, maxX: pos[0] + visibleX * 2.5, maxY: pos[1] + visibleY * 2.5 };
        }
        return null;
    }

    function normalizeMapOverlayRoot(root) {
        if (!root) return null;
        if (["TABLE", "TBODY", "THEAD", "TFOOT", "TR"].includes(root.tagName)) return root.parentElement || root;
        return root;
    }

    function markMapVillage(root, row) {
        const target = findMapVillageElement(root, row);
        if (!target) return false;

        target.classList.add(`${APP.id}-map-mark`);
        if (target.dataset) target.dataset.tpconqMarked = "1";
        addMapMarker(root, target, row);
        return true;
    }

    function findMapVillageElement(root, row) {
        const village = row.village;
        const id = String(village.id);
        const x = String(village.x);
        const y = String(village.y);
        const coords = village.coords;
        const idValue = cssAttr(id);
        const coordsValue = cssAttr(coords);
        const selectors = [
            `#map_village_${cssAttr(`${x}_${y}`)}`,
            `#map_village_${idValue}`,
            `#map_${cssAttr(`${x}_${y}`)}`,
            `#map_cell_${cssAttr(`${x}_${y}`)}`,
            `[data-id="${idValue}"]`,
            `[data-village-id="${idValue}"]`,
            `[data-village="${idValue}"]`,
            `[rel="${idValue}"]`,
            `[data-x="${cssAttr(x)}"][data-y="${cssAttr(y)}"]`,
            `[data-coord="${coordsValue}"]`,
            `[data-coords="${coordsValue}"]`,
            `a[href*="screen=info_village"][href*="id=${idValue}"]`,
            `[title*="${coordsValue}"]`,
            `[data-title*="${coordsValue}"]`,
        ];

        for (const selector of selectors) {
            const found = Array.from(root.querySelectorAll(selector));
            for (const element of found) {
                const target = normalizeMapTarget(element, root);
                if (target && isPlausibleMapTarget(target, root)) return target;
            }
        }
        return null;
    }

    function normalizeMapTarget(element, root) {
        if (!element) return null;
        const tag = element.tagName;
        if (tag === "AREA") return null;

        const childTarget = Array.from(element.querySelectorAll?.("a, img, [id^='map_village_'], .map_village, .village") || [])
            .find((child) => isPlausibleMapTarget(child, root));
        if (childTarget) return childTarget;

        if (isPlausibleMapTarget(element, root)) return element;

        const parentTarget = element.closest?.("[id^='map_village_'], .map_village, .village, a");
        if (parentTarget && root.contains(parentTarget) && isPlausibleMapTarget(parentTarget, root)) return parentTarget;

        return childTarget || element;
    }

    function isPlausibleMapTarget(element, root) {
        if (!element || !root || !root.contains(element)) return false;
        const rect = element.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8 || rect.width > 120 || rect.height > 120) return false;
        if (rect.right < rootRect.left || rect.left > rootRect.right || rect.bottom < rootRect.top || rect.top > rootRect.bottom) return false;
        return true;
    }

    function addMapMarker(root, target, row) {
        const host = markerHostForTarget(root, target);
        if (host) {
            prepareMarkerHost(host);
            appendMarkerToHost(host, target, row);
            return;
        }

        const layer = ensureMapMarkerLayer(root);
        if (!layer) return;

        const targetRect = target.getBoundingClientRect();
        const rootRect = layer.parentElement.getBoundingClientRect();
        const marker = createMapMarker(row);
        marker.style.left = `${targetRect.left - rootRect.left + targetRect.width / 2}px`;
        marker.style.top = `${targetRect.top - rootRect.top + targetRect.height / 2}px`;
        layer.appendChild(marker);
    }

    function markerHostForTarget(root, target) {
        if (!target || !root || !root.contains(target)) return null;
        const invalidHosts = new Set(["AREA", "IMG", "INPUT", "BR", "HR", "TABLE", "TBODY", "THEAD", "TFOOT", "TR"]);
        let host = target;
        while (host && root.contains(host) && invalidHosts.has(host.tagName)) {
            host = host.parentElement;
        }
        if (!host || !root.contains(host) || invalidHosts.has(host.tagName)) return null;
        return host;
    }

    function prepareMarkerHost(host) {
        const style = window.getComputedStyle(host);
        if (style.position !== "static") return;

        if (host.dataset && host.dataset.tpconqPosition == null) {
            host.dataset.tpconqPosition = host.style.position || "";
        }
        host.classList.add(`${APP.id}-map-marker-host`);
        host.style.position = "relative";
    }

    function appendMarkerToHost(host, target, row) {
        const hostRect = host.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const marker = createMapMarker(row);
        marker.style.left = `${targetRect.left - hostRect.left + targetRect.width / 2}px`;
        marker.style.top = `${targetRect.top - hostRect.top + targetRect.height / 2}px`;
        host.appendChild(marker);
    }

    function createMapMarker(row) {
        const marker = document.createElement("span");
        marker.className = `${APP.id}-map-marker ${markerAgeClass(row)}`;
        marker.textContent = markerAgeText(row);
        marker.style.setProperty(`--${APP.id}-marker-bg-alpha`, String(markerOpacityValue()));
        marker.title = `${row.village.name} (${row.village.coords}) - ${formatDateTime(row.date)} - ${markerAgeLabel(row)}`;
        return marker;
    }

    function markerAgeText(row) {
        const ageHours = conquestAgeHours(row);
        if (ageHours < 1) return "-1";
        if (ageHours < 3) return "-3";
        if (ageHours < 6) return "-6";
        return "+6";
    }

    function markerAgeClass(row) {
        const ageHours = conquestAgeHours(row);
        if (ageHours < 1) return `${APP.id}-map-age-1h`;
        if (ageHours < 3) return `${APP.id}-map-age-3h`;
        if (ageHours < 6) return `${APP.id}-map-age-6h`;
        return `${APP.id}-map-age-old`;
    }

    function markerAgeLabel(row) {
        const ageHours = conquestAgeHours(row);
        if (ageHours < 1) return "menos de 1h";
        if (ageHours < 3) return "1-3h";
        if (ageHours < 6) return "3-6h";
        return "mais de 6h";
    }

    function conquestAgeHours(row) {
        return Math.max(0, (Date.now() / 1000 - row.timestamp) / 3600);
    }

    function ensureMapMarkerLayer(root) {
        const overlayRoot = normalizeMapOverlayRoot(root);
        if (!overlayRoot) return null;

        const style = window.getComputedStyle(overlayRoot);
        if (style.position === "static") overlayRoot.style.position = "relative";

        let layer = overlayRoot.querySelector(`#${APP.id}-map-layer`);
        if (!layer) {
            layer = document.createElement("div");
            layer.id = `${APP.id}-map-layer`;
            layer.className = `${APP.id}-map-layer`;
            overlayRoot.appendChild(layer);
        }
        return layer;
    }

    function cssAttr(value) {
        return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    function parseMiniMapUrl(source) {
        const clean = String(source || "").replace(/^url\(["']?|["']?\)$/g, "");
        try {
            const url = new URL(clean, window.location.href);
            const x = Number(url.searchParams.get("x"));
            const y = Number(url.searchParams.get("y"));
            const width = Number(url.searchParams.get("w") || url.searchParams.get("width"));
            const height = Number(url.searchParams.get("h") || url.searchParams.get("height"));
            if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
                return { minX: x, minY: y, maxX: x + width, maxY: y + height };
            }
        } catch (_) {
            // Some minimap backgrounds are not regular URLs.
        }
        return null;
    }

    function numberFrom(object, keys) {
        for (const key of keys) {
            const value = Number(object && object[key]);
            if (Number.isFinite(value)) return value;
        }
        return NaN;
    }

    function renderSummary(rows) {
        const winners = new Set();
        const losers = new Set();
        const tribes = new Set();
        let latest = 0;

        rows.forEach((row) => {
            winners.add(row.newOwnerId);
            losers.add(row.oldOwnerId);
            tribes.add(row.newTribe.id);
            tribes.add(row.oldTribe.id);
            latest = Math.max(latest, row.timestamp);
        });

        state.controls.summary.textContent = "";
        state.controls.summary.append(
            metric("Conquistas", formatNumber(rows.length)),
            metric("Jogadores +", formatNumber(winners.size)),
            metric("Jogadores -", formatNumber(losers.size)),
            metric("Tribos", formatNumber(tribes.size)),
        );

        if (latest) {
            state.controls.status.textContent = `${formatNumber(rows.length)} conquistas. Ultima: ${formatDateTime(new Date(latest * 1000))}.`;
        }
    }

    function metric(label, value) {
        const box = document.createElement("div");
        box.className = `${APP.id}-metric`;
        const valueNode = document.createElement("b");
        valueNode.textContent = value;
        const labelNode = document.createElement("span");
        labelNode.textContent = label;
        box.append(valueNode, labelNode);
        return box;
    }

    function renderRows(rows) {
        const limit = visibleLimit();
        const visibleRows = rows.slice(0, limit);
        const table = document.createElement("table");
        table.className = `${APP.id}-table`;
        table.append(
            thead(["Hora", "Aldeia", "Pts", "Ganhou", "Tribo +", "Perdeu", "Tribo -", "K"]),
            tbodyRows(visibleRows),
        );
        state.controls.content.textContent = "";
        state.controls.content.appendChild(table);
        setStatus(`Mostradas ${formatNumber(visibleRows.length)} de ${formatNumber(rows.length)} conquistas.`);
    }

    function tbodyRows(rows) {
        const body = document.createElement("tbody");
        const fragment = document.createDocumentFragment();
        rows.forEach((row) => {
            const tr = document.createElement("tr");
            tr.append(
                td(formatDateTime(row.date)),
                td(villageLink(row.village)),
                td(formatNumber(row.village.points), "muted"),
                td(playerLink(row.newPlayer), "pos"),
                td(tribeLink(row.newTribe), "pos"),
                td(playerLink(row.oldPlayer), "neg"),
                td(tribeLink(row.oldTribe), "neg"),
                td(row.village.continent),
            );
            fragment.appendChild(tr);
        });
        body.appendChild(fragment);
        return body;
    }

    function renderGroups(rows, mode) {
        const groups = buildGroups(rows, mode);
        const limit = visibleLimit();
        const visibleGroups = groups.slice(0, limit);
        const table = document.createElement("table");
        table.className = `${APP.id}-table`;
        table.append(
            thead(mode === "day"
                ? ["Dia", "Conquistas", "Pontos", "Ultima"]
                : ["Grupo", "Ganhas", "Perdidas", "Saldo", "Pontos +", "Pontos -", "Ultima"]),
            tbodyGroups(visibleGroups, mode),
        );
        state.controls.content.textContent = "";
        state.controls.content.appendChild(table);
        setStatus(`Mostrados ${formatNumber(visibleGroups.length)} de ${formatNumber(groups.length)} grupos.`);
    }

    function buildGroups(rows, mode) {
        if (mode === "day") {
            const dayGroups = new Map();
            rows.forEach((row) => {
                const key = row.date.toISOString().slice(0, 10);
                const group = ensureGroup(dayGroups, key, formatDay(row.date), null);
                group.gains += 1;
                group.pointsGained += row.village.points;
                group.latest = Math.max(group.latest, row.timestamp);
            });
            return Array.from(dayGroups.values()).sort((a, b) => b.latest - a.latest);
        }

        const side = state.controls.side.value;
        const groups = new Map();
        rows.forEach((row) => {
            if (side === "gain" || side === "both") {
                const entity = mode === "tribe" ? row.newTribe : row.newPlayer;
                const group = ensureGroup(groups, `${mode}:${entity.id}`, labelForEntity(entity, mode), entity);
                group.gains += 1;
                group.pointsGained += row.village.points;
                group.latest = Math.max(group.latest, row.timestamp);
            }

            if (side === "loss" || side === "both") {
                const entity = mode === "tribe" ? row.oldTribe : row.oldPlayer;
                const group = ensureGroup(groups, `${mode}:${entity.id}`, labelForEntity(entity, mode), entity);
                group.losses += 1;
                group.pointsLost += row.village.points;
                group.latest = Math.max(group.latest, row.timestamp);
            }
        });

        return Array.from(groups.values()).sort((a, b) => {
            const countDiff = (b.gains + b.losses) - (a.gains + a.losses);
            return countDiff || b.latest - a.latest || a.label.localeCompare(b.label);
        });
    }

    function ensureGroup(map, key, label, entity) {
        if (!map.has(key)) {
            map.set(key, {
                key,
                label,
                entity,
                gains: 0,
                losses: 0,
                pointsGained: 0,
                pointsLost: 0,
                latest: 0,
            });
        }
        return map.get(key);
    }

    function tbodyGroups(groups, mode) {
        const body = document.createElement("tbody");
        const fragment = document.createDocumentFragment();
        groups.forEach((group) => {
            const tr = document.createElement("tr");
            if (mode === "day") {
                tr.append(
                    td(group.label),
                    td(formatNumber(group.gains)),
                    td(formatNumber(group.pointsGained)),
                    td(formatDateTime(new Date(group.latest * 1000))),
                );
            } else {
                const saldo = group.gains - group.losses;
                const labelNode = group.entity
                    ? (mode === "tribe" ? tribeLink(group.entity) : playerLink(group.entity))
                    : text(group.label);
                tr.append(
                    td(labelNode),
                    td(formatNumber(group.gains), "pos"),
                    td(formatNumber(group.losses), "neg"),
                    td(`${saldo > 0 ? "+" : ""}${formatNumber(saldo)}`, saldo >= 0 ? "pos" : "neg"),
                    td(formatNumber(group.pointsGained), "pos"),
                    td(formatNumber(group.pointsLost), "neg"),
                    td(formatDateTime(new Date(group.latest * 1000))),
                );
            }
            fragment.appendChild(tr);
        });
        body.appendChild(fragment);
        return body;
    }

    function thead(labels) {
        const head = document.createElement("thead");
        const row = document.createElement("tr");
        labels.forEach((label) => {
            const th = document.createElement("th");
            th.textContent = label;
            row.appendChild(th);
        });
        head.appendChild(row);
        return head;
    }

    function td(content, variant) {
        const cell = document.createElement("td");
        if (variant) cell.classList.add(`${APP.id}-${variant}`);
        if (content instanceof Node) {
            cell.appendChild(content);
        } else {
            cell.textContent = content == null ? "" : String(content);
        }
        return cell;
    }

    function text(value) {
        return document.createTextNode(value == null ? "" : String(value));
    }

    function villageLink(village) {
        if (!village.id) return text(village.name);
        const link = document.createElement("a");
        link.href = gameUrl("info_village", village.id);
        link.textContent = `${village.name} (${village.coords})`;
        link.title = `ID ${village.id}`;
        return link;
    }

    function playerLink(player) {
        if (!player.id) return text(player.name);
        const link = document.createElement("a");
        link.href = gameUrl("info_player", player.id);
        link.textContent = player.name;
        link.title = `ID ${player.id}`;
        return link;
    }

    function tribeLink(tribe) {
        if (!tribe.id) return text(tribe.tag || tribe.name);
        const link = document.createElement("a");
        link.href = gameUrl("info_ally", tribe.id);
        link.textContent = tribe.tag || tribe.name;
        link.title = tribe.name;
        return link;
    }

    function gameUrl(screen, id) {
        const villageId = window.game_data && window.game_data.village && window.game_data.village.id;
        const params = new URLSearchParams();
        if (villageId) params.set("village", villageId);
        params.set("screen", screen);
        params.set("id", id);
        return `/game.php?${params.toString()}`;
    }

    function visibleLimit() {
        const value = Number(state.controls.limit.value || APP.defaultLimit);
        return Math.max(20, Math.min(5000, value));
    }

    function showNotice(message) {
        state.controls.content.textContent = "";
        const notice = document.createElement("div");
        notice.className = `${APP.id}-notice`;
        notice.textContent = message;
        state.controls.content.appendChild(notice);
    }

    function setBusy(isBusy) {
        setMapLoadButtonBusy(isBusy);
        if (!state.panel || !state.controls.reload) return;
        state.panel.classList.toggle(`${APP.id}-loading`, isBusy);
        ["reload", "save", "resetSettings", "clear"].forEach((name) => {
            if (state.controls[name]) state.controls[name].disabled = isBusy;
        });
    }

    function setStatus(message) {
        if (state.controls.status) state.controls.status.textContent = message;
    }

    function syncAutoRefresh(showMessage = true) {
        if (state.autoTimer) {
            window.clearTimeout(state.autoTimer);
            state.autoTimer = null;
        }
        if (state.controls.auto.checked) {
            scheduleAutoRefresh();
            if (showMessage) notify("Auto refresh ligado: aleatorio entre 2 e 5 minutos.", "success");
        }
    }

    function scheduleAutoRefresh() {
        if (!state.controls.auto.checked) return;
        const delay = randomBetween(APP.autoRefreshMinMs, APP.autoRefreshMaxMs);
        state.autoTimer = window.setTimeout(async () => {
            state.autoTimer = null;
            if (!state.controls.auto.checked) return;

            if (!state.busy && state.panel && state.panel.isConnected && !state.panel.classList.contains(`${APP.id}-hidden`)) {
                await loadWorldData({ forceMap: false, forceConquer: true });
            }

            scheduleAutoRefresh();
        }, delay);
        setStatus(`Auto refresh ligado. Proxima verificacao em ${Math.round(delay / 60000)} min.`);
    }

    function randomBetween(min, max) {
        return Math.floor(min + Math.random() * (max - min + 1));
    }

    function notify(message, type) {
        if (window.UI && typeof window.UI.SuccessMessage === "function" && type === "success") {
            window.UI.SuccessMessage(message);
            return;
        }
        if (window.UI && typeof window.UI.ErrorMessage === "function" && type === "error") {
            window.UI.ErrorMessage(message);
            return;
        }
        console[type === "error" ? "error" : "log"](`[${APP.title}] ${message}`);
    }

    function splitLines(textValue) {
        return String(textValue || "")
            .replace(/\r/g, "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
    }

    function toInt(value) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function decodeTW(value) {
        const raw = String(value || "").replace(/\+/g, " ");
        try {
            return decodeURIComponent(raw);
        } catch (_) {
            return raw;
        }
    }

    function fold(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
    }

    function continentFromCoords(x, y) {
        if (!x || !y) return "K??";
        return `K${Math.floor(y / 100)}${Math.floor(x / 100)}`;
    }

    function normalizeContinent(value) {
        const cleaned = String(value || "").trim().toUpperCase().replace(/^K/, "");
        if (!cleaned) return "";
        if (!/^\d{2}$/.test(cleaned)) return "";
        return `K${cleaned}`;
    }

    function formatNumber(value) {
        return new Intl.NumberFormat("pt-PT").format(value || 0);
    }

    function formatDateTime(date) {
        return new Intl.DateTimeFormat("pt-PT", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        }).format(date);
    }

    function formatDay(date) {
        return new Intl.DateTimeFormat("pt-PT", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        }).format(date);
    }

    function labelForEntity(entity, mode) {
        if (!entity) return "-";
        if (mode === "tribe") return entity.tag ? `${entity.tag} - ${entity.name}` : entity.name;
        return entity.name;
    }

    function worldKey() {
        const dataWorld = window.game_data && window.game_data.world;
        if (dataWorld) return String(dataWorld).toUpperCase();

        const hostPart = window.location.hostname.split(".")[0];
        return hostPart ? hostPart.toUpperCase() : window.location.hostname;
    }

    function debounce(fn, ms) {
        let timer = null;
        return (...args) => {
            if (!ms) {
                fn(...args);
                return;
            }
            window.clearTimeout(timer);
            timer = window.setTimeout(() => fn(...args), ms);
        };
    }

    init();
})();
