// ==UserScript==
// @name         TW PT - Defesa ThePlaguePT
// @namespace    theplaguept.tw.defesa
// @version      0.1.107
// @description  Pack defensivo pessoal para Tribal Wars PT
// @author       ThePlaguePT
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// @homepageURL  https://github.com/ThePlaguePT/TribalWars-Scripts
// @supportURL   https://github.com/ThePlaguePT/TribalWars-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Defesa%20ThePlaguePT.user.js
// @downloadURL  https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Defesa%20ThePlaguePT.user.js
// @include      *://*.tribalwars.com.pt/game.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) return;

    const APP = {
        name: 'TW PT - Defesa ThePlaguePT',
        prefix: 'tpDef',
        version: '0.1.107',
        styleId: 'tpdefStyles',
        troopPop: {
            spear: 1, sword: 1, axe: 1, archer: 1, spy: 2,
            light: 4, marcher: 5, heavy: 4, ram: 5,
            catapult: 8, knight: 1, snob: 100, militia: 0
        },
        unitStats: {
            spear: {attack: 10, type: 'infantry', defense: {infantry: 15, cavalry: 45, archer: 20}},
            sword: {attack: 25, type: 'infantry', defense: {infantry: 50, cavalry: 15, archer: 40}},
            axe: {attack: 40, type: 'infantry', defense: {infantry: 10, cavalry: 5, archer: 10}},
            archer: {attack: 15, type: 'archer', defense: {infantry: 50, cavalry: 40, archer: 5}},
            spy: {attack: 0, type: 'infantry', defense: {infantry: 2, cavalry: 1, archer: 2}},
            light: {attack: 130, type: 'cavalry', defense: {infantry: 30, cavalry: 40, archer: 30}},
            marcher: {attack: 120, type: 'archer', defense: {infantry: 40, cavalry: 30, archer: 50}},
            heavy: {attack: 150, type: 'cavalry', defense: {infantry: 200, cavalry: 80, archer: 180}},
            ram: {attack: 2, type: 'infantry', defense: {infantry: 20, cavalry: 50, archer: 20}},
            catapult: {attack: 100, type: 'infantry', defense: {infantry: 100, cavalry: 100, archer: 100}},
            knight: {attack: 150, type: 'cavalry', defense: {infantry: 250, cavalry: 400, archer: 150}},
            snob: {attack: 30, type: 'infantry', defense: {infantry: 100, cavalry: 50, archer: 100}},
            militia: {attack: 0, type: 'infantry', defense: {infantry: 15, cavalry: 45, archer: 25}}
        },
        attackModelUnits: ['axe', 'light', 'heavy', 'ram', 'catapult'],
        defenseModelUnits: ['spear', 'sword', 'archer', 'light', 'heavy', 'catapult'],
        attackPresets: {
            ariete: {axe: 6200, light: 2900, ram: 400, catapult: 25}
        },
        defensePresets: {
            normal: {spear: 6750, sword: 6750, heavy: 1000},
            slow: {spear: 10000, sword: 10000},
            fast: {spear: 7000, sword: 1000, heavy: 2000}
        },
        defaultSettings: {
            features: {
                incomingOverview: true,
                duplicateMarker: true,
                tabTimer: true,
                mapPanel: true,
                massSupport: true,
                wallResistance: true
            },
            combat: {
                nightBonusAuto: true
            }
        }
    };

    const state = {
        originalTitle: document.title,
        bootAttempts: 0,
        mapOverlayTimer: null,
        mapPopupObserver: null,
        mapPopupRenderTimer: null,
        incomingCountsCache: {
            loadedAt: 0,
            loading: false,
            counts: {},
            arieteCounts: {}
        },
        supportTroopsCache: {
            villageId: null,
            loadedAt: 0,
            loading: false,
            troops: {},
            linksKey: '',
            requestId: 0
        },
        nightBonusCache: {
            loadedAt: 0,
            value: false
        },
        launcherPositionFrame: 0
    };

    let settings = {};

    function boot() {
        if (!window.game_data || !window.$) {
            if (state.bootAttempts < 120) {
                state.bootAttempts += 1;
                setTimeout(boot, 250);
            }
            return;
        }

        settings = loadSettings();
        addStyles();
        addLauncher();
        runScreenEnhancements();
    }

    function runScreenEnhancements() {
        const screen = String(game_data.screen || '');
        const mode = getCurrentMode();

        if (screen === 'overview_villages' && mode === 'incomings' && settings.features.incomingOverview) {
            enhanceIncomings();
        }

        if (screen === 'overview' && settings.features.wallResistance) {
            addWallResistanceWidget();
        }

        if (screen === 'place' && settings.features.massSupport) {
            enhanceMassSupport();
        }

        if (screen === 'map' && settings.features.mapPanel) {
            waitForMapPanel();
        }
    }

    function getCurrentMode() {
        if (game_data.mode) return String(game_data.mode);
        return new URLSearchParams(window.location.search).get('mode') || '';
    }

    function key(name) {
        return `${APP.prefix}.${game_data.world || 'global'}.${name}`;
    }

    function loadSettings() {
        const saved = readJson(key('settings'), {});
        const savedSettings = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        const merged = merge(clone(APP.defaultSettings), savedSettings);

        const savedFeatures = merged.features && typeof merged.features === 'object' && !Array.isArray(merged.features)
            ? merged.features
            : {};

        merged.features = merge(clone(APP.defaultSettings.features), savedFeatures);

        const savedCombat = merged.combat && typeof merged.combat === 'object' && !Array.isArray(merged.combat)
            ? merged.combat
            : {};

        merged.combat = merge(clone(APP.defaultSettings.combat), savedCombat);

        delete merged.tags;
        delete merged.snipe;
        delete merged.features.massRename;
        delete merged.features.snipeButtons;

        return merged;
    }

    function saveSettings() {
        try {
            localStorage.setItem(key('settings'), JSON.stringify(settings));
            return true;
        } catch (err) {
            errorMessage('Nao foi possivel guardar as configuracoes.');
            log(err);
            return false;
        }
    }

    function readJson(storageKey, fallback) {
        try {
            const raw = localStorage.getItem(storageKey);
            return raw ? JSON.parse(raw) : fallback;
        } catch (err) {
            log(err);
            return fallback;
        }
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function merge(base, extra) {
        Object.keys(extra || {}).forEach(function (k) {
            if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k])) {
                base[k] = merge(base[k] || {}, extra[k]);
            } else {
                base[k] = extra[k];
            }
        });
        return base;
    }

    function addStyles() {
        if (document.getElementById(APP.styleId)) return;

        $('head').append(`
            <style id="${APP.styleId}">
                #tpDefLauncher {
                    position: fixed !important;
                    left: 12px !important;
                    right: auto !important;
                    top: 340px !important;
                    z-index: 2147483647 !important;
                    box-sizing: border-box !important;

                    width: 30px !important;
                    min-width: 30px !important;
                    height: 28px !important;

                    display: flex !important;
                    align-items: center !important;
                    justify-content: flex-start !important;

                    gap: 0 !important;
                    overflow: hidden !important;
                    padding: 0 6px !important;

                    cursor: pointer !important;
                    white-space: nowrap !important;

                    border: 1px solid #4f120f !important;
                    border-radius: 2px !important;

                    background:
                        linear-gradient(
                            to bottom,
                            #b33a34,
                            #8f2420 55%,
                            #681611
                        ) !important;

                    box-shadow:
                        inset 0 1px 0 rgba(255,255,255,.35),
                        inset 0 -1px 0 rgba(0,0,0,.35),
                        0 2px 5px rgba(0,0,0,.45) !important;

                    color: #fff !important;
                    font-family: Verdana, Arial, sans-serif !important;
                    font-size: 12px !important;
                    font-weight: bold !important;
                    text-shadow: 1px 1px 1px #000 !important;

                    transition:
                        width .18s ease,
                        min-width .18s ease,
                        padding .18s ease,
                        gap .18s ease,
                        background .18s ease !important;
                }

                #tpDefLauncher:hover,
                #tpDefLauncher:focus-visible {
                    width: 244px !important;
                    min-width: 244px !important;
                    gap: 8px !important;
                    padding: 0 9px !important;

                    background:
                        linear-gradient(
                            to bottom,
                            #c4473e,
                            #a02c27 55%,
                            #7e1c17
                        ) !important;
                }

                .tpdef-launcher-icon {
                    width: 16px !important;
                    height: 16px !important;
                    flex: 0 0 16px !important;

                    display: inline-flex !important;
                    align-items: center;
                    justify-content: center;
                    box-sizing: border-box;
                    border: 1px solid #f1d28d;
                    border-radius: 50% !important;
                    background: #160b06;
                    color: #fff4d3;
                    font-size: 13px;
                    line-height: 17px;
                    box-shadow:
                        inset 0 1px 1px rgba(255,255,255,.35),
                        0 1px 1px #000 !important;
                }

                .tpdef-launcher-icon img {
                    width: 15px;
                    height: 15px;
                    display: block;
                }

                .tpdef-launcher-shield {
                    position: relative;
                    display: block;
                    width: 13px;
                    height: 15px;
                    background: linear-gradient(to bottom, #f6e3a4 0%, #9e7840 48%, #4d3320 100%);
                    border: 1px solid #f8e8b8;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,.55), 0 1px 1px rgba(0,0,0,.45);
                    clip-path: polygon(50% 0, 91% 14%, 82% 63%, 50% 100%, 18% 63%, 9% 14%);
                    box-sizing: border-box;
                }

                .tpdef-launcher-shield::after {
                    content: "";
                    position: absolute;
                    left: 50%;
                    top: 1px;
                    bottom: 2px;
                    width: 1px;
                    background: rgba(255,255,255,.5);
                }

                .tpdef-launcher-text {
                    display: inline-block !important;
                    max-width: 0 !important;
                    opacity: 0 !important;
                    overflow: hidden !important;
                    white-space: nowrap !important;
                    transform: translateX(-4px) !important;

                    color: #fff !important;
                    font-family: Verdana, Arial, sans-serif !important;
                    font-size: 12px !important;
                    font-weight: bold !important;
                    text-shadow: 1px 1px 1px #000 !important;

                    transition:
                        max-width .18s ease,
                        opacity .14s ease,
                        transform .18s ease !important;
                }

                #tpDefLauncher:hover .tpdef-launcher-text,
                #tpDefLauncher:focus-visible .tpdef-launcher-text {
                    max-width: 198px !important;
                    opacity: 1 !important;
                    transform: translateX(0) !important;
                }

                .tpdef-config-wrap {
                    width: 820px;
                    max-width: calc(100vw - 48px);
                    border: 2px solid #7e211c;
                    border-radius: 4px;
                    background: #f4e4b8;
                    color: #3b2508;
                    font-family: Arial, Verdana, sans-serif;
                    box-sizing: border-box;
                    overflow: hidden;
                }

                .tpdef-config-header {
                    padding: 12px 14px 9px;
                    border-bottom: 1px solid #c98c48;
                    background: linear-gradient(to bottom, #f7e8c1 0%, #edd49a 100%);
                }

                .tpdef-config-title {
                    margin: 0;
                    color: #8f2b25;
                    font-size: 16px;
                    line-height: 20px;
                    font-weight: bold;
                }

                .tpdef-config-subtitle {
                    margin-top: 2px;
                    color: #5e3b16;
                    font-size: 12px;
                    line-height: 15px;
                }

                .tpdef-config-body {
                    padding: 10px 12px 14px;
                }

                .tpdef-config-section {
                    display: grid;
                    grid-template-columns: minmax(190px, 230px) minmax(0, 1fr);
                    gap: 10px 18px;
                    padding: 11px 0 12px 10px;
                    border-top: 1px solid #d5b579;
                    border-left: 4px solid var(--tpdef-section-color, #9a2e28);
                }

                .tpdef-config-section:first-child {
                    border-top: 0;
                }

                .tpdef-config-section-head {
                    min-width: 0;
                }

                .tpdef-config-section-title {
                    color: #8f2b25;
                    font-size: 13px;
                    line-height: 16px;
                    font-weight: bold;
                    text-transform: uppercase;
                }

                .tpdef-config-section-desc {
                    margin-top: 3px;
                    color: #5e3b16;
                    font-size: 11px;
                    line-height: 14px;
                }

                .tpdef-config-fields {
                    display: grid;
                    gap: 9px;
                    min-width: 0;
                }

                .tpdef-config-check {
                    display: grid;
                    grid-template-columns: 20px minmax(0, 1fr);
                    gap: 2px 6px;
                    align-items: start;
                    min-width: 0;
                    color: #2b1b08;
                    font-size: 12px;
                    line-height: 15px;
                    font-weight: bold;
                }

                .tpdef-config-check input {
                    margin-top: 1px;
                }

                .tpdef-config-help {
                    grid-column: 2;
                    color: #6f4b16;
                    font-size: 11px;
                    line-height: 14px;
                    font-weight: normal;
                }

                .tpdef-config-actions {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 8px;
                    padding-top: 10px;
                    border-top: 1px solid #d5b579;
                }

                .tpdef-config-button {
                    width: 100%;
                    min-height: 31px;
                    border: 1px solid #5a1d18 !important;
                    border-radius: 3px;
                    background: linear-gradient(to bottom, #a73a33 0%, #842821 100%) !important;
                    color: #fff7dd !important;
                    font-weight: bold;
                    text-shadow: 1px 1px 1px #2b0e0b;
                    cursor: pointer;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,.22);
                }

                .tpdef-config-button:hover {
                    background: linear-gradient(to bottom, #b8483f 0%, #932e27 100%) !important;
                }

                .tpdef-config-button-secondary {
                    grid-column: 1 / -1;
                    background: linear-gradient(to bottom, #70402b 0%, #512c20 100%) !important;
                }

                .tpdef-config-note {
                    margin-top: 10px;
                    color: #5e3b16;
                    font-size: 11px;
                    line-height: 14px;
                }

                @media (max-width: 760px) {
                    .tpdef-config-section {
                        grid-template-columns: 1fr;
                    }

                    .tpdef-config-actions {
                        grid-template-columns: 1fr;
                    }
                }

                .tpdef-panel { margin: 8px 0; }
                .tpdef-panel th { text-align: center; }
                .tpdef-btn-row input { margin: 2px; }
                .tpdef-filter-active { font-weight: bold; text-decoration: underline; }
                .tpdef-duplicate-origin {
                    color: #fff !important;
                    padding: 1px 3px;
                    border: 1px solid currentColor;
                    border-radius: 2px;
                    font-weight: bold;
                }
                .tpdef-duplicate-badge {
                    display: inline-block;
                    margin-left: 4px;
                    padding: 1px 4px;
                    border: 1px solid rgba(0, 0, 0, .35);
                    border-radius: 2px;
                    color: #fff;
                    font-size: 10px;
                    font-weight: bold;
                    line-height: 12px;
                    vertical-align: middle;
                }

                #tpdefWallResistance.tpdef-defense-widget {
                    margin-top: 8px;
                    border: 1px solid #804000;
                    background: #f3e2b5;
                    box-shadow: 1px 1px 3px rgba(60, 35, 8, .35);
                    container-type: inline-size;
                }

                .tpdef-defense-title {
                    margin: 0;
                    padding: 2px 5px;
                    display: flex;
                    align-items: center;
                    min-height: 16px;
                    border-bottom: 1px solid #804000;
                    background: linear-gradient(to bottom, #d7bd74 0%, #b98b3a 100%);
                    color: #0f0800;
                    font-size: 13px;
                    font-style: italic;
                    font-weight: bold;
                }

                .tpdef-title-left {
                    display: inline-flex;
                    align-items: center;
                }

                .tpdef-title-status {
                    margin-left: 3px;
                    font-weight: bold;
                }

                .tpdef-window-button {
                    margin-left: auto;
                    width: 13px;
                    height: 13px;
                    line-height: 11px;
                    border: 1px solid #804000;
                    background: #f7e6bb;
                    color: #5a2b00 !important;
                    text-align: center;
                    text-decoration: none !important;
                    font-size: 12px;
                    font-style: normal;
                    font-weight: bold;
                    box-sizing: border-box;
                }

                .tpdef-defense-body {
                    display: block;
                    padding: 4px 6px;
                    background: #f7e6bb;
                }

                .tpdef-defense-table {
                    width: 100%;
                    border-collapse: collapse;
                    background: #fff3cf;
                    border: 1px solid #dfc27a;
                }

                .tpdef-defense-table td {
                    padding: 1px 4px;
                    vertical-align: middle;
                }

                .tpdef-defense-icon {
                    width: 30px;
                    text-align: center;
                }

                .tpdef-defense-icon img {
                    max-width: 20px;
                    max-height: 20px;
                }

                .tpdef-defense-main {
                    width: auto;
                }

                .tpdef-defense-line {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 8px;
                    color: #000;
                    font-size: 13px;
                    font-weight: bold;
                    line-height: 15px;
                }

                .tpdef-wall-bar {
                    margin-top: 2px;
                    height: 8px;
                    background: #d7bd74;
                    border: 1px solid #7b4f13;
                    box-shadow: inset 0 1px 2px rgba(0, 0, 0, .35);
                }

                .tpdef-wall-fill {
                    height: 100%;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .45);
                }

                .tpdef-defense-note {
                    font-weight: bold;
                    line-height: 14px;
                }

                .tpdef-fulls-highlight {
                    display: inline-flex;
                    flex: 0 0 86px;
                    align-items: center;
                    justify-content: center;
                    min-height: 24px;
                    margin-bottom: 0;
                    padding: 2px 5px;
                    border: 1px solid currentColor;
                    background: linear-gradient(to bottom, #fff9de 0%, #ecd99f 100%);
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .7);
                    text-align: center;
                    font-size: 15px;
                    font-weight: bold;
                    line-height: 16px;
                    box-sizing: border-box;
                }

                .tpdef-fulls-counters {
                    display: flex;
                    flex: 0 1 auto;
                    flex-wrap: nowrap;
                    gap: 4px;
                    min-width: 0;
                }

                .tpdef-fulls-counters .tpdef-fulls-highlight {
                    flex: 1 1 130px;
                    min-width: 110px;
                    flex-direction: column;
                    gap: 1px;
                    white-space: normal;
                }

                .tpdef-counter-label {
                    display: block;
                    font-size: 10.5px;
                    line-height: 11px;
                    font-weight: bold;
                }

                .tpdef-counter-value {
                    display: block;
                    font-size: 18px;
                    line-height: 18px;
                    font-weight: bold;
                }

                .tpdef-defense-summary {
                    display: grid;
                    grid-template-columns: minmax(118px, 1fr) minmax(260px, 1.55fr);
                    gap: 6px;
                    align-items: center;
                    min-width: 0;
                }

                .tpdef-defense-summary-clean {
                    grid-template-columns: minmax(0, 1fr);
                }

                .tpdef-defense-status {
                    min-width: 0;
                    overflow-wrap: anywhere;
                }

                .tpdef-defense-metrics {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 4px;
                    width: 100%;
                    min-width: 0;
                    justify-self: end;
                    justify-content: flex-start;
                }

                #tpdefMapDefenseInfo .tpdef-defense-summary {
                    grid-template-columns: minmax(150px, 1fr) minmax(285px, 1.45fr);
                }

                @media (max-width: 720px) {
                    .tpdef-defense-summary,
                    #tpdefMapDefenseInfo .tpdef-defense-summary {
                        grid-template-columns: 1fr;
                    }

                    .tpdef-defense-metrics {
                        flex-wrap: wrap;
                    }

                    .tpdef-fulls-highlight,
                    .tpdef-defense-shortage {
                        flex: 1 1 100%;
                    }

                    .tpdef-fulls-counters {
                        flex: 1 1 100%;
                    }
                }

                #tpdefWallResistance .tpdef-defense-badge {
                    display: none !important;
                }

                .tpdef-defense-subnote {
                    font-size: 11px;
                    color: #6f4b16;
                    line-height: 12px;
                }

                .tpdef-defense-extra {
                    margin-top: 2px;
                    font-size: 11px;
                    color: #6f4b16;
                    line-height: 12px;
                }

                .tpdef-defense-shortage {
                    flex: 1 1 170px;
                    min-width: 0;
                    max-width: 100%;
                    margin-top: 0;
                    padding: 2px 5px;
                    border: 1px solid #dec58c;
                    background: #fff7d6;
                    color: #6f4b16;
                    font-weight: bold;
                    line-height: 13px;
                    box-sizing: border-box;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .65);
                    overflow-wrap: anywhere;
                }

                .tpdef-defense-shortage-title {
                    display: block;
                    margin-bottom: 1px;
                    color: #b7332c;
                    font-size: 11px;
                    line-height: 13px;
                }

                .tpdef-support-forecast {
                    display: grid;
                    grid-template-columns: auto minmax(0, 1fr) auto;
                    grid-column: 1 / -1;
                    flex: 1 1 100%;
                    gap: 4px 7px;
                    align-items: center;
                    min-width: 0;
                    padding: 4px 6px;
                    border: 1px solid #d5b579;
                    background: #fff3cf;
                    box-sizing: border-box;
                }

                .tpdef-support-forecast-title,
                .tpdef-support-forecast-capacity {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    color: #8f2b25;
                    font-size: 11px;
                    font-weight: bold;
                    white-space: nowrap;
                }

                .tpdef-support-forecast-title img,
                .tpdef-support-unit img {
                    width: 16px;
                    height: 16px;
                    object-fit: contain;
                }

                .tpdef-support-units {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 3px 6px;
                    min-width: 0;
                }

                .tpdef-support-unit {
                    display: inline-flex;
                    align-items: center;
                    gap: 2px;
                    color: #3b2508;
                    font-size: 11px;
                    font-weight: bold;
                    white-space: nowrap;
                }

                @media (max-width: 720px) {
                    .tpdef-support-forecast {
                        grid-template-columns: 1fr;
                    }

                    .tpdef-support-forecast-capacity {
                        white-space: normal;
                    }
                }

                .tpdef-shortage-units {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0 6px;
                    min-width: 0;
                    max-width: 100%;
                    white-space: normal;
                }

                .tpdef-shortage-unit,
                .tpdef-shortage-or {
                    display: inline-flex;
                    align-items: center;
                    max-width: 100%;
                    white-space: nowrap;
                }

                .tpdef-shortage-pack {
                    display: block;
                    margin-top: 1px;
                    color: #6f4b16;
                    font-weight: normal;
                }

                .tpdef-shortage-wall {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    margin-top: 1px;
                    color: #3b2508;
                    font-weight: bold;
                    white-space: normal;
                    overflow-wrap: anywhere;
                }

                .tpdef-defense-shortage img {
                    width: 14px;
                    height: 14px;
                    margin: 0 2px 1px 0;
                    vertical-align: middle;
                }

                .tpdef-defense-shortage img:first-of-type {
                    margin-left: 0;
                }

                .tpdef-defense-action {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    font-weight: bold;
                    white-space: nowrap;
                    padding: 1px 6px !important;
                    line-height: 16px !important;
                }

                .tpdef-defense-action img {
                    width: 15px !important;
                    height: 15px !important;
                }

                .tpdef-defense-actions {
                    display: grid;
                    grid-template-columns: repeat(4, max-content);
                    gap: 3px 4px;
                    align-items: center;
                    justify-content: start;
                }

                @container (max-width: 540px) {
                    #tpdefWallResistance .tpdef-defense-summary {
                        grid-template-columns: 1fr;
                    }

                    #tpdefWallResistance .tpdef-defense-actions {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }

                    #tpdefWallResistance .tpdef-defense-metrics {
                        align-items: stretch;
                    }

                    #tpdefWallResistance .tpdef-fulls-highlight {
                        flex: 0 1 92px;
                    }

                    #tpdefWallResistance .tpdef-fulls-counters {
                        flex: 0 1 auto;
                    }

                    #tpdefWallResistance .tpdef-defense-shortage {
                        flex: 1 1 190px;
                    }

                    #tpdefWallResistance .tpdef-support-forecast {
                        grid-template-columns: 1fr;
                    }

                    #tpdefWallResistance .tpdef-defense-action {
                        min-width: 0;
                        padding-left: 4px !important;
                        padding-right: 4px !important;
                    }
                }

                @container (max-width: 440px) {
                    #tpdefWallResistance .tpdef-defense-summary {
                        grid-template-columns: 1fr;
                    }

                    #tpdefWallResistance .tpdef-defense-metrics {
                        flex-wrap: wrap;
                    }

                    #tpdefWallResistance .tpdef-fulls-highlight,
                    #tpdefWallResistance .tpdef-defense-shortage {
                        flex: 1 1 100%;
                    }

                    #tpdefWallResistance .tpdef-fulls-counters {
                        flex: 1 1 100%;
                    }
                }

                .tpdef-model-wrap {
                    width: 360px;
                }

                .tpdef-calculator-wrap {
                    width: 500px;
                }

                .tpdef-dialog-title,
                .tpdef-field-label {
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                }

                .tpdef-dialog-title {
                    min-height: 20px;
                    font-weight: bold;
                }

                .tpdef-dialog-title img,
                .tpdef-field-label img {
                    width: 18px;
                    height: 18px;
                }

                .tpdef-field-help {
                    display: block;
                    margin: 1px 0 0 23px;
                    color: #6f4b16;
                    font-size: 11px;
                    font-weight: normal;
                    line-height: 12px;
                    white-space: normal;
                }

                .tpdef-model-table {
                    background: #f7e6bb;
                }

                .tpdef-model-table td {
                    padding: 2px 5px;
                    vertical-align: middle;
                    height: 25px;
                }

                .tpdef-model-row td {
                    border-bottom: 1px solid #ead8aa;
                }

                .tpdef-model-table input[type="number"] {
                    width: 82px;
                    height: 22px;
                    padding: 2px 5px;
                    border: 1px solid #7d510f;
                    background: #fff9df;
                    color: #000;
                    text-align: right;
                    font-weight: bold;
                    box-shadow: inset 1px 1px 2px rgba(60, 35, 8, .2);
                    box-sizing: border-box;
                }

                .tpdef-model-table input[type="number"]:focus {
                    border-color: #b88932;
                    background: #fffef0;
                    outline: 1px solid #d7bd74;
                }

                .tpdef-model-small-input {
                    width: 72px !important;
                }

                .tpdef-model-table .tpdef-model-unit {
                    color: #3b2508;
                    font-weight: bold;
                    white-space: nowrap;
                }

                .tpdef-model-table .tpdef-model-unit img {
                    width: 17px;
                    height: 17px;
                    margin-right: 4px;
                    vertical-align: middle;
                }

                .tpdef-model-value {
                    width: 92px;
                    text-align: right;
                }

                .tpdef-preset-row td {
                    padding: 5px 4px !important;
                    text-align: center;
                    background: #f2dfad;
                    border-bottom: 1px solid #d7bd74;
                }

                .tpdef-preset-row .btn {
                    margin: 1px 2px;
                    padding: 2px 7px !important;
                    white-space: nowrap;
                }

                .tpdef-model-pop-row td {
                    padding: 5px 4px !important;
                    border-top: 1px solid #d7bd74;
                    background: #fff3cf;
                }

                .tpdef-model-pop {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 5px;
                    color: #8f2b25;
                    font-weight: bold;
                }

                .tpdef-model-option td {
                    padding-top: 5px;
                    border-top: 1px solid #d7bd74;
                }

                .tpdef-model-actions {
                    padding-top: 5px !important;
                    text-align: center;
                }

                .tpdef-model-actions .btn {
                    margin: 0 2px;
                    padding: 1px 7px !important;
                }

                .tpdef-calc-result {
                    margin-top: 4px;
                    padding: 6px;
                    border: 1px solid #c89f4f;
                    background: linear-gradient(to bottom, #fff9de 0%, #f0dfad 100%);
                    color: #3b2508;
                    line-height: 15px;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .75);
                }

                .tpdef-calc-help {
                    padding: 3px 5px;
                    border: 1px solid #dfc27a;
                    background: #fff3cf;
                    color: #6f4b16;
                    font-size: 11px;
                    line-height: 13px;
                }

                .tpdef-calc-title {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    margin-bottom: 5px;
                    color: #b7332c;
                    font-weight: bold;
                    font-size: 13px;
                }

                .tpdef-calc-title img {
                    width: 18px;
                    height: 18px;
                }

                .tpdef-calc-meta {
                    margin-top: 5px;
                    color: #6f4b16;
                    font-size: 11px;
                }

                .tpdef-calc-units {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                    align-items: center;
                    font-weight: bold;
                }

                .tpdef-calc-unit {
                    display: inline-flex;
                    align-items: center;
                    min-height: 22px;
                    padding: 1px 6px 1px 3px;
                    border: 1px solid #dec58c;
                    background: #fff3cf;
                    white-space: nowrap;
                    box-sizing: border-box;
                }

                .tpdef-calc-unit img {
                    width: 16px;
                    height: 16px;
                    margin-right: 3px;
                }

                .tpdef-calc-wall-flow {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                    margin-top: 5px;
                }

                .tpdef-calc-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                    padding: 1px 5px;
                    border: 1px solid #dec58c;
                    background: #fff7d6;
                    color: #3b2508;
                    font-weight: bold;
                    white-space: nowrap;
                }

                .tpdef-calc-chip img {
                    width: 15px;
                    height: 15px;
                }

                .tpdef-calc-sim-title {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    margin-top: 7px;
                    padding: 2px 4px;
                    border: 1px solid #d7bd74;
                    background: linear-gradient(to bottom, #d7bd74 0%, #c49b4b 100%);
                    color: #3b2508;
                    font-weight: bold;
                }

                .tpdef-calc-sim-title-text {
                    flex: 1 1 auto;
                }

                .tpdef-calc-sim-wrap {
                    overflow-x: auto;
                }

                .tpdef-calc-sim-controls {
                    display: inline-flex;
                    gap: 3px;
                }

                .tpdef-calc-sim-controls .btn {
                    padding: 0 6px !important;
                    line-height: 15px !important;
                }

                .tpdef-calc-sim-round[hidden] {
                    display: none !important;
                }

                .tpdef-calc-sim {
                    width: 100%;
                    margin-top: 3px;
                    border-collapse: collapse;
                    background: #f7e6bb;
                }

                .tpdef-calc-sim th,
                .tpdef-calc-sim td {
                    padding: 2px 2px;
                    border: 1px solid #ead8aa;
                    text-align: center;
                    vertical-align: middle;
                    white-space: nowrap;
                    font-size: 11px;
                }

                .tpdef-calc-sim th {
                    background: #ecd08a;
                }

                .tpdef-calc-sim img {
                    width: 16px;
                    height: 16px;
                }

                .tpdef-calc-sim-side,
                .tpdef-calc-sim-label {
                    text-align: left !important;
                    font-weight: bold;
                }

                .tpdef-calc-sim-side {
                    width: 50px;
                }

                .tpdef-calc-sim-label {
                    width: 54px;
                }

                .tpdef-calc-sim-loss {
                    color: #9b6f1b;
                }

                .tpdef-calc-sim-remaining {
                    color: #237a3b;
                    font-weight: bold;
                }

                .tpdef-calc-ram-damage {
                    margin-top: 3px;
                    padding: 2px 4px;
                    border: 1px solid #ead8aa;
                    background: #f7e6bb;
                    font-weight: bold;
                }

                .tpdef-map-overlay {
                    pointer-events: none;
                    position: absolute;
                    z-index: 50;
                    opacity: .35;
                    background: #2476c7;
                }

                .tpdef-disabled {
                    opacity: .55;
                    cursor: default;
                }

                #tpdefMapDefenseInfo {
                    margin-top: 4px;
                    width: 100%;
                }

                #tpdefMapDefenseInfo td {
                    padding: 2px 4px;
                    vertical-align: middle;
                }

                .tpdef-map-defense-title {
                    font-style: italic;
                }

                .tpdef-map-defense-title span {
                    margin-left: 3px;
                    font-weight: bold;
                }

                .tpdef-map-defense-icon {
                    width: 24px;
                    text-align: center;
                }

                .tpdef-map-defense-icon img {
                    max-width: 18px;
                    max-height: 18px;
                }

                /* ThePlaguePT shared red/cream theme */
                .tpdef-panel,
                #tpdefMassSupport,
                #tpdefMapPanel,
                #tpdefMapDefenseInfo,
                #tpdefWallResistance.tpdef-defense-widget,
                .tpdef-model-wrap,
                .tpdef-calculator-wrap {
                    border: 2px solid #7e211c !important;
                    border-radius: 4px;
                    background: #f4e4b8 !important;
                    color: #3b2508;
                    font-family: Arial, Verdana, sans-serif;
                    box-shadow: 0 1px 3px rgba(40, 15, 10, .25);
                    overflow: hidden;
                }

                .tpdef-panel table.vis,
                #tpdefMapPanel.vis,
                #tpdefMapDefenseInfo.vis,
                .tpdef-model-table,
                .tpdef-defense-table,
                #tpdefSupportPreview table.vis,
                #tpdefMassSupport.vis {
                    width: 100%;
                    border: 0 !important;
                    border-collapse: collapse;
                    background: #f4e4b8 !important;
                    color: #3b2508;
                }

                .tpdef-panel th,
                #tpdefMapPanel th,
                #tpdefMapDefenseInfo th,
                .tpdef-model-table th,
                #tpdefSupportPreview th {
                    padding: 8px 10px !important;
                    border: 0 !important;
                    border-bottom: 1px solid #c98c48 !important;
                    background: linear-gradient(to bottom, #f7e8c1 0%, #edd49a 100%) !important;
                    color: #8f2b25 !important;
                    text-align: left !important;
                    font-size: 14px;
                    font-weight: bold;
                }

                .tpdef-panel td,
                #tpdefMapPanel td,
                #tpdefMapDefenseInfo td,
                .tpdef-model-table td,
                .tpdef-defense-table td,
                #tpdefSupportPreview td {
                    border-color: #d5b579 !important;
                    background: transparent !important;
                    color: #3b2508;
                }

                #tpdefWallResistance .tpdef-defense-title {
                    padding: 6px 9px;
                    min-height: 20px;
                    border-bottom: 1px solid #c98c48 !important;
                    background: linear-gradient(to bottom, #f7e8c1 0%, #edd49a 100%) !important;
                    color: #8f2b25 !important;
                    font-size: 14px;
                    font-style: italic;
                }

                #tpdefWallResistance .tpdef-defense-body {
                    padding: 8px 10px;
                    background: #f4e4b8 !important;
                }

                #tpdefWallResistance .tpdef-defense-table {
                    border-left: 4px solid #e18b13 !important;
                    background: #f4e4b8 !important;
                }

                #tpdefWallResistance .tpdef-defense-table td {
                    padding: 4px 6px;
                }

                #tpdefWallResistance .tpdef-defense-note,
                .tpdef-calc-title,
                .tpdef-defense-shortage-title {
                    color: #8f2b25 !important;
                }

                .tpdef-wall-bar {
                    height: 9px;
                    border: 1px solid #7e211c;
                    background: #edd49a;
                }

                .tpdef-fulls-highlight,
                .tpdef-defense-shortage,
                .tpdef-calc-result,
                .tpdef-calc-help,
                .tpdef-calc-unit,
                .tpdef-calc-chip,
                .tpdef-calc-ram-damage {
                    border: 1px solid #d5b579 !important;
                    background: #fff3cf !important;
                    box-shadow: none !important;
                }

                .tpdef-fulls-highlight {
                    color: #8f2b25 !important;
                    font-size: 16px;
                }

                .tpdef-defense-subnote,
                .tpdef-defense-extra,
                .tpdef-calc-meta,
                .tpdef-field-help,
                .tpdef-calc-help {
                    color: #5e3b16 !important;
                }

                #tpdefWallResistance .tpdef-defense-actions {
                    width: 100%;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 6px 8px;
                }

                #tpdefWallResistance .tpdef-defense-action,
                .tpdef-model-actions .btn,
                .tpdef-preset-row .btn,
                .tpdef-btn-row .btn,
                #tpdefMassSupport .btn,
                #tpdefMapPanel .btn,
                .tpdef-calc-sim-controls .btn,
                .tpdef-config-button {
                    min-height: 24px;
                    border: 1px solid #5a1d18 !important;
                    border-radius: 3px;
                    background: linear-gradient(to bottom, #a73a33 0%, #842821 100%) !important;
                    color: #fff7dd !important;
                    font-weight: bold;
                    text-shadow: 1px 1px 1px #2b0e0b;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,.22);
                    text-decoration: none !important;
                }

                #tpdefWallResistance .tpdef-defense-action:hover,
                .tpdef-model-actions .btn:hover,
                .tpdef-preset-row .btn:hover,
                .tpdef-btn-row .btn:hover,
                #tpdefMassSupport .btn:hover,
                #tpdefMapPanel .btn:hover,
                .tpdef-calc-sim-controls .btn:hover,
                .tpdef-config-button:hover {
                    background: linear-gradient(to bottom, #b8483f 0%, #932e27 100%) !important;
                }

                .tpdef-model-wrap,
                .tpdef-calculator-wrap {
                    background: #f4e4b8 !important;
                }

                .tpdef-model-table {
                    border-left: 4px solid #c7362d !important;
                }

                .tpdef-model-table .tpdef-model-unit {
                    color: #3b2508;
                }

                .tpdef-model-table input[type="number"],
                .tpdef-model-table input[type="text"],
                .tpdef-model-table select,
                .tpdef-model-table textarea,
                #tpdefMassSupport input[type="number"],
                #tpdefMassSupport textarea,
                #tpdefMapPanel textarea {
                    border: 1px solid #b06b25 !important;
                    border-radius: 2px;
                    background: #fffaf0 !important;
                    color: #000;
                    box-shadow: inset 1px 1px 2px rgba(60, 35, 8, .14);
                }

                .tpdef-preset-row td,
                .tpdef-model-option td {
                    border-color: #d5b579 !important;
                    background: #f1dca7 !important;
                }

                .tpdef-calc-sim-title {
                    border: 0 !important;
                    border-left: 4px solid #1e87b8 !important;
                    background: linear-gradient(to bottom, #f7e8c1 0%, #edd49a 100%) !important;
                    color: #8f2b25 !important;
                    padding: 5px 7px;
                }

                .tpdef-calc-sim {
                    background: #f4e4b8 !important;
                }

                .tpdef-calc-sim th {
                    background: #ead196 !important;
                    color: #3b2508 !important;
                }

                .tpdef-calc-sim td {
                    border-color: #d5b579 !important;
                    background: #f8e8bd !important;
                }

                .tpdef-calc-sim-remaining {
                    color: #237a3b !important;
                }

                #tpdefMassSupport {
                    border-left: 4px solid #1e87b8 !important;
                    padding: 9px 10px !important;
                }

                #tpdefMassSupport strong {
                    color: #8f2b25;
                    text-transform: uppercase;
                }

                #tpdefMapPanel {
                    border-left: 4px solid #1e87b8 !important;
                }

                #tpdefMapDefenseInfo {
                    border-left: 4px solid #e18b13 !important;
                    box-sizing: border-box;
                    max-width: 100%;
                    table-layout: fixed;
                }

                #tpdefMapDefenseInfo .tpdef-map-icon-col {
                    width: 30px;
                }

                #tpdefMapDefenseInfo .tpdef-map-info-col {
                    width: auto;
                }

                #tpdefMapDefenseInfo .tpdef-defense-summary {
                    grid-template-columns: minmax(0, 1fr) !important;
                    gap: 2px;
                }

                #tpdefMapDefenseInfo .tpdef-defense-metrics {
                    display: grid;
                    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.45fr);
                    align-items: stretch;
                    justify-content: stretch;
                    gap: 3px;
                }

                #tpdefMapDefenseInfo .tpdef-fulls-counters {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    align-self: stretch;
                    width: 100%;
                    gap: 3px;
                }

                #tpdefMapDefenseInfo .tpdef-fulls-counters .tpdef-fulls-highlight {
                    flex: none;
                    min-width: 0;
                    min-height: 42px;
                    padding: 1px 3px;
                    font-size: 14px;
                    line-height: 15px;
                }

                #tpdefMapDefenseInfo .tpdef-counter-label {
                    font-size: 9.5px;
                    line-height: 10px;
                }

                #tpdefMapDefenseInfo .tpdef-counter-value {
                    font-size: 15px;
                    line-height: 15px;
                }

                #tpdefMapDefenseInfo .tpdef-defense-shortage {
                    flex: none;
                    align-self: stretch;
                    width: 100%;
                    padding: 2px 4px;
                    font-size: 10.5px;
                    line-height: 12px;
                }

                #tpdefMapDefenseInfo .tpdef-support-forecast {
                    grid-column: 1 / -1;
                    grid-template-columns: 1fr;
                }

                @media (max-width: 560px) {
                    #tpdefMapDefenseInfo .tpdef-defense-metrics {
                        grid-template-columns: minmax(0, 1fr);
                    }
                }

                #tpdefMapDefenseInfo .tpdef-shortage-units {
                    gap: 0 4px;
                }

                #tpdefMapDefenseInfo .tpdef-shortage-wall {
                    font-size: 10.5px;
                    line-height: 12px;
                }

                #tpdefMapDefenseInfo .tpdef-map-defense-icon {
                    width: 30px;
                    padding-left: 2px !important;
                    padding-right: 2px !important;
                }

                .tpdef-map-defense-title {
                    font-style: normal;
                }

                @container (max-width: 460px) {
                    #tpdefWallResistance .tpdef-defense-actions {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
        `);
    }

    function addLauncher() {
        if ($('#tpDefLauncher').length) return;

        $('body').append(`
            <button type="button" id="tpDefLauncher" title="Defesa - ThePlaguePT" aria-label="Defesa - ThePlaguePT">
                <span class="tpdef-launcher-icon"><span class="tpdef-launcher-shield"></span></span>
                <span class="tpdef-launcher-text">Defesa - ThePlaguePT</span>
            </button>
        `);
        $('#tpDefLauncher').off('click.tpdef').on('click.tpdef', openSettings);

        scheduleLauncherPosition();
        setTimeout(scheduleLauncherPosition, 250);
        setTimeout(scheduleLauncherPosition, 1000);

        $(window)
            .off('resize.tpdefLauncher orientationchange.tpdefLauncher')
            .on('resize.tpdefLauncher orientationchange.tpdefLauncher', scheduleLauncherPosition);
    }

    function scheduleLauncherPosition() {
        if (state.launcherPositionFrame) cancelAnimationFrame(state.launcherPositionFrame);

        state.launcherPositionFrame = requestAnimationFrame(function () {
            state.launcherPositionFrame = requestAnimationFrame(function () {
                state.launcherPositionFrame = 0;
                positionLauncher();
            });
        });
    }

    function positionLauncher() {
        const button = document.getElementById('tpDefLauncher');
        if (!button) return;

        const gameLayout =
            document.querySelector('#main_layout td.maincell') ||
            document.querySelector('td.maincell') ||
            document.querySelector('#contentContainer') ||
            document.querySelector('#content_value');

        let left = 12;
        let top = 340;

        if (gameLayout) {
            const layoutRect = gameLayout.getBoundingClientRect();
            if (layoutRect.width > 0) left = Math.max(4, Math.round(layoutRect.left - 30 - 25));
        }

        applyLauncherPosition(button, {left, top});
    }

    function applyLauncherPosition(button, position) {
        button.style.setProperty('left', `${position.left}px`, 'important');
        button.style.setProperty('right', 'auto', 'important');
        button.style.setProperty('top', `${position.top}px`, 'important');
    }

    function openSettings() {
        const html = `
            <div class="tpdef-config-wrap">
                <div class="tpdef-config-header">
                    <div class="tpdef-config-title">${escapeHtml(APP.name)} - ThePlaguePT</div>
                    <div class="tpdef-config-subtitle">Ferramentas de defesa, modelos de fulls e apoio para Tribal Wars!</div>
                </div>

                <div class="tpdef-config-body">
                    ${configSection(
                        '⚔️',
                        'Ataques em tempo real',
                        'Leitura e organização dos ataques a chegar.',
                        '#c7362d',
                        [
                            configSwitch('incomingOverview', 'Melhorar visão de ataques', 'Mostra contadores, filtros e ações rápidas na visão de ataques.'),
                            configSwitch('duplicateMarker', 'Marcar ataques repetidos', 'Destaca origens repetidas para encontrares fakes e stacks rapidamente.'),
                            configSwitch('tabTimer', 'Mostrar próximo ataque no separador', 'Atualiza o título do separador com o temporizador do próximo ataque.')
                        ]
                    )}

                    ${configSection(
                        '🗺️',
                        'Mapa e apoios',
                        'Seleção de aldeias e preparação de apoio em massa.',
                        '#1e87b8',
                        [
                            configSwitch('mapPanel', 'Painel de mapa', 'Permite selecionar aldeias no mapa para criar uma lista de apoio.'),
                            configSwitch('massSupport', 'Apoio em massa melhorado', 'Adiciona seleção rápida e pré-visualização de tropas no apoio em massa.')
                        ]
                    )}

                    ${configSection(
                        '🛡️',
                        'Defesa da aldeia',
                        'Widget principal com muralha, fulls, modelos e simulador.',
                        '#e18b13',
                        [
                            configSwitch('wallResistance', 'Widget de defesa/muralha', 'Mostra o estado defensivo da aldeia e calcula tropas necessárias.')
                        ]
                    )}

                    ${configSection(
                        'Noite',
                        'Bonus nocturno',
                        'Aplicacao automatica do bonus defensivo quando o jogo o indicar.',
                        '#6742b8',
                        [
                            configSwitch('nightBonusAuto', 'Bonus nocturno automatico', 'Aplica defesa x2 aos calculos quando o bonus nocturno estiver ativo.', 'combat')
                        ]
                    )}

                    <div class="tpdef-config-section" style="--tpdef-section-color:#6f4b16">
                        <div class="tpdef-config-section-head">
                            <div class="tpdef-config-section-title">⚙️ Ações</div>
                            <div class="tpdef-config-section-desc">Abrir ferramentas ou repor a configuração deste mundo.</div>
                        </div>
                        <div class="tpdef-config-fields">
                            <div class="tpdef-config-actions">
                                <input type="button" class="tpdef-config-button" id="tpdefOpenAttackModelFromSettings" value="Modelo de ataque">
                                <input type="button" class="tpdef-config-button" id="tpdefOpenDefenseModelFromSettings" value="Modelo de defesa">
                                <input type="button" class="tpdef-config-button" id="tpdefOpenCalculatorFromSettings" value="Calculadora de fulls">
                                <input type="button" class="tpdef-config-button" id="tpdefRefreshWidgetFromSettings" value="Atualizar widget">
                                <input type="button" class="tpdef-config-button tpdef-config-button-secondary" id="tpdefResetSettings" value="Reset configurações">
                            </div>
                        </div>
                    </div>

                    <div class="tpdef-config-note">
                        Algumas opções só aparecem depois de recarregar ou entrar no ecrã certo. Versão ${escapeHtml(APP.version)}.
                    </div>
                </div>
            </div>
        `;

        showDialog('tpDefSettings', html);

        $('.tpdef-setting').off('change.tpdef').on('change.tpdef', function () {
            const group = String($(this).data('group') || 'features');
            const settingKey = String($(this).data('key') || '');

            if (!settings[group] || typeof settings[group] !== 'object') settings[group] = {};
            settings[group][settingKey] = this.checked;
            saveSettings();

            if (group === 'combat' && settingKey === 'nightBonusAuto') {
                state.nightBonusCache.loadedAt = 0;
                if (game_data.screen === 'overview' && settings.features.wallResistance) addWallResistanceWidget();
                if (game_data.screen === 'map') scheduleMapPopupDefenseRender();
            }
        });

        $('#tpdefOpenAttackModelFromSettings').off('click.tpdef').on('click.tpdef', openAttackModelDialog);
        $('#tpdefOpenDefenseModelFromSettings').off('click.tpdef').on('click.tpdef', openDefenseModelDialog);
        $('#tpdefOpenCalculatorFromSettings').off('click.tpdef').on('click.tpdef', openDefenseCalculatorDialog);
        $('#tpdefRefreshWidgetFromSettings').off('click.tpdef').on('click.tpdef', function () {
            if (game_data.screen === 'overview' && settings.features.wallResistance) addWallResistanceWidget();
            if (game_data.screen === 'map') scheduleMapPopupDefenseRender();
            successMessage('Widget atualizado.');
        });

        $('#tpdefResetSettings').off('click.tpdef').on('click.tpdef', function () {
            settings = clone(APP.defaultSettings);
            saveSettings();
            openSettings();
        });
    }

    function configSection(icon, title, description, color, rows) {
        return `
            <div class="tpdef-config-section" style="--tpdef-section-color:${escapeAttr(color)}">
                <div class="tpdef-config-section-head">
                    <div class="tpdef-config-section-title">${escapeHtml(icon)} ${escapeHtml(title)}</div>
                    <div class="tpdef-config-section-desc">${escapeHtml(description)}</div>
                </div>
                <div class="tpdef-config-fields">
                    ${rows.join('')}
                </div>
            </div>
        `;
    }

    function configSwitch(id, label, description, group) {
        const settingGroup = group || 'features';
        const checked = settings[settingGroup] && settings[settingGroup][id];
        const inputId = `tpdef-${settingGroup}-${id}`;

        return `
            <label class="tpdef-config-check" for="${escapeAttr(inputId)}">
                <input id="${escapeAttr(inputId)}" class="tpdef-setting" data-group="${escapeAttr(settingGroup)}" data-key="${escapeAttr(id)}"
                    type="checkbox" ${checked ? 'checked' : ''}>
                <span>${escapeHtml(label)}</span>
                <span class="tpdef-config-help">${escapeHtml(description)}</span>
            </label>
        `;
    }

    function showDialog(id, html) {
        if (window.Dialog && typeof Dialog.show === 'function') {
            Dialog.show(id, html);
        } else {
            alert($(html).text());
        }
    }

    function successMessage(message) {
        if (window.UI && typeof UI.SuccessMessage === 'function') UI.SuccessMessage(message);
        else log(message);
    }

    function errorMessage(message) {
        if (window.UI && typeof UI.ErrorMessage === 'function') UI.ErrorMessage(message);
        else alert(message);
    }

    function formatNumber(value) {
        if (window.Format && typeof Format.number === 'function') return Format.number(value);
        return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    function enhanceIncomings() {
        const table = $('#incomings_table');
        if (!table.length || $('#tpdefIncomingsPanel').length) return;

        const rows = table.find('tr.row_a, tr.row_b');
        if (!rows.length) return;

        rows.each(function (i) {
            $(this).attr('data-tpdef-index', i);
        });

        const indexes = getIncomingIndexes(table);
        const data = collectIncomingData(rows);

        const panel = `
            <div id="tpdefIncomingsPanel" class="tpdef-panel">
                <table class="vis" style="width:100%">
                    <tr><th colspan="6">Defesa ThePlaguePT - A chegar</th></tr>
                    <tr>
                        <td>Total</td>
                        <td><a href="#" class="tpdef-filter tpdef-filter-active" data-filter="all">${rows.length}</a></td>
                        <td>Pequenos</td>
                        <td><a href="#" class="tpdef-filter" data-filter="small">${data.small.length}</a></td>
                        <td>Medios</td>
                        <td><a href="#" class="tpdef-filter" data-filter="medium">${data.medium.length}</a></td>
                    </tr>
                    <tr>
                        <td>Grandes</td>
                        <td><a href="#" class="tpdef-filter" data-filter="large">${data.large.length}</a></td>
                        <td>Desconhecidos</td>
                        <td><a href="#" class="tpdef-filter" data-filter="unknown">${data.unknown.length}</a></td>
                        <td>Nobres</td>
                        <td><a href="#" class="tpdef-filter" data-filter="nobles">${data.nobles.length}</a></td>
                    </tr>
                    <tr class="tpdef-btn-row">
                        <td colspan="6">
                            ${settings.features.duplicateMarker ? '<input type="button" class="btn" id="tpdefDuplicates" value="Marcar repetidos">' : ''}
                            <input type="button" class="btn" id="tpdefCopyCoords" value="Copiar coords visiveis">
                        </td>
                    </tr>
                </table>
            </div>
        `;

        if ($('.overview_filters').length) $('.overview_filters').first().before(panel);
        else table.before(panel);

        $('#tpdefIncomingsPanel')
            .off('click.tpdef')
            .on('click.tpdef', '.tpdef-filter', function (e) {
                e.preventDefault();
                applyIncomingFilter($(this).data('filter'), data, rows);
            })
            .on('click.tpdef', '#tpdefDuplicates', function () {
                markDuplicates(rows, indexes.source);
            })
            .on('click.tpdef', '#tpdefCopyCoords', function () {
                copyVisibleCoords(indexes.target);
            });

        if (settings.features.tabTimer) {
            updateTabWithNextIncoming(table);
        }
    }

    function getIncomingIndexes(table) {
        const indexOr = (value, fallback) => value >= 0 ? value : fallback;

        return {
            target: indexOr(findHeader(table, ['destino', 'alvo', 'target', 'doel']), 1),
            source: indexOr(findHeader(table, ['origem', 'source', 'herkomst']), 2),
            arrival: indexOr(findHeader(table, ['chegada', 'arrival', 'aankomst']), 5),
            timer: indexOr(findHeader(table, ['chega em', 'arrives in', 'komt aan']), 6)
        };
    }

    function findHeader(table, words) {
        let found = -1;

        table.find('tr:first').children('th,td').each(function (i) {
            const text = clean($(this).text());
            if (words.some(w => text.includes(clean(w)))) found = i;
        });

        return found;
    }

    function collectIncomingData(rows) {
        const data = {
            all: rows,
            small: $(),
            medium: $(),
            large: $(),
            unknown: $(),
            nobles: $()
        };
        const sourceIndex = getIncomingIndexes($('#incomings_table')).source;
        const nobleTrains = {};

        rows.each(function () {
            const row = $(this);
            const isSmall = row.find('img[src*="attack_small"]').length > 0;
            const isMedium = row.find('img[src*="attack_medium"]').length > 0;
            const isLarge = row.find('img[src*="attack_large"]').length > 0;
            const isGenericAttack = row.find('img[src*="command/attack"], img[src$="/attack.png"]').length > 0;
            const isNoble = row.find('img[src*="snob"], img[src*="unit_snob"]').length || clean(row.text()).includes('nobre');

            if (isSmall) data.small = data.small.add(row);
            if (isMedium) data.medium = data.medium.add(row);
            if (isLarge) data.large = data.large.add(row);
            if (!isSmall && !isMedium && !isLarge && isGenericAttack) data.unknown = data.unknown.add(row);
            if (isNoble) {
                data.nobles = data.nobles.add(row);
                const coords = getRowCoords(row, sourceIndex);
                if (coords) {
                    nobleTrains[coords] = nobleTrains[coords] || [];
                    nobleTrains[coords].push(row);
                }
            }
        });

        Object.keys(nobleTrains).forEach(function (coords) {
            if (nobleTrains[coords].length >= 2) {
                data.large = data.large.add(nobleTrains[coords][0]);
            }
        });

        return data;
    }

    function applyIncomingFilter(filter, data, rows) {
        const target = data[filter] || data.all;

        rows.hide();
        target.show();

        if (filter === 'all') rows.show();

        $('.tpdef-filter').removeClass('tpdef-filter-active');
        $(`.tpdef-filter[data-filter="${filter}"]`).addClass('tpdef-filter-active');
    }

    function markDuplicates(rows, sourceIndex) {
        const counts = {};
        const order = [];

        rows
            .css('box-shadow', '')
            .find('.tpdef-duplicate-badge')
            .remove();

        rows.find('.tpdef-duplicate-origin')
            .removeClass('tpdef-duplicate-origin')
            .removeAttr('title')
            .css({
                background: '',
                color: '',
                borderColor: ''
            });

        rows.each(function () {
            const coords = getRowCoords($(this), sourceIndex);
            if (!coords) return;
            if (!counts[coords]) order.push(coords);
            counts[coords] = (counts[coords] || 0) + 1;
        });

        const groups = {};
        order
            .filter(coords => counts[coords] > 1)
            .forEach(function (coords, index) {
                groups[coords] = {
                    label: duplicateGroupLabel(index),
                    color: duplicateGroupColor(index),
                    count: counts[coords],
                    position: 0
                };
            });

        rows.each(function () {
            const row = $(this);
            const coords = getRowCoords(row, sourceIndex);
            const group = groups[coords];
            if (!group) return;

            group.position += 1;

            const cell = row.children('td,th').eq(sourceIndex);
            const target = cell.find('a').first().length ? cell.find('a').first() : cell;
            const title = `${group.label}: ${group.count} ataques da origem ${coords}`;

            row.css('box-shadow', `inset 5px 0 0 ${group.color}`);
            target
                .addClass('tpdef-duplicate-origin')
                .attr('title', title)
                .css({
                    background: group.color,
                    borderColor: group.color,
                    color: '#fff'
                });

            const badge = $('<span/>', {
                class: 'tpdef-duplicate-badge',
                text: `${group.label} ${group.position}/${group.count}`,
                title
            })
                .css('background', group.color);

            if (target.is('td,th')) {
                target.append(badge);
            } else {
                badge.insertAfter(target);
            }
        });
    }

    function duplicateGroupLabel(index) {
        let number = index + 1;
        let label = '';

        while (number > 0) {
            number -= 1;
            label = String.fromCharCode(65 + (number % 26)) + label;
            number = Math.floor(number / 26);
        }

        return label || 'A';
    }

    function duplicateGroupColor(index) {
        const colors = [
            '#e6194b',
            '#3cb44b',
            '#4363d8',
            '#f58231',
            '#911eb4',
            '#008080',
            '#f032e6',
            '#808000',
            '#9a6324',
            '#000075',
            '#800000',
            '#469990'
        ];

        return colors[index % colors.length];
    }

    function copyVisibleCoords(targetIndex) {
        const rows = $('#incomings_table tr.row_a:visible, #incomings_table tr.row_b:visible');
        const coords = uniqueCoords(rows, targetIndex).join(' ');

        if (!coords) {
            errorMessage('Nao ha coordenadas visiveis para copiar.');
            return;
        }

        copyText(coords)
            .then(function () {
                successMessage(`${coords.split(' ').length} coordenadas copiadas.`);
            })
            .catch(function () {
                openCoordsDialog(coords);
            });
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }

        return Promise.reject(new Error('Clipboard indisponivel'));
    }

    function openCoordsDialog(coords) {
        showDialog('tpDefCoords', `
            <div style="width:420px">
                <table class="vis" style="width:100%">
                    <tr><th>Coords visiveis</th></tr>
                    <tr><td><textarea rows="7" style="width:98%">${escapeHtml(coords)}</textarea></td></tr>
                </table>
            </div>
        `);
    }

    function uniqueCoords(rows, index) {
        const out = new Set();

        rows.each(function () {
            const coords = getRowCoords($(this), index);
            if (coords) out.add(coords);
        });

        return Array.from(out);
    }

    function waitForMapPanel(attempt) {
        const count = attempt || 0;

        if (!window.TWMap || !TWMap.map || !$('#map_search').length) {
            if (count < 120) setTimeout(function () { waitForMapPanel(count + 1); }, 300);
            return;
        }

        addMapPanel();
    }

    function addMapPanel() {
        if ($('#tpdefMapPanel').length || !window.TWMap || !TWMap.map) return;

        $('#map_search').before(`
            <table id="tpdefMapPanel" class="vis" style="width:100%; margin-bottom:6px">
                <tr><th colspan="2">Defesa ThePlaguePT - Mapa</th></tr>
                <tr>
                    <td><input type="checkbox" id="tpdefMapSelectSupport"></td>
                    <td><label for="tpdefMapSelectSupport">Selecionar aldeias para apoio em massa</label></td>
                </tr>
                <tr class="tpdef-map-support" style="display:none">
                    <td>Aldeias</td>
                    <td>
                        <textarea id="tpdefMapSupportCoords" rows="5" style="width:98%" disabled></textarea>
                        <br>
                        <a class="btn tpdef-disabled" id="tpdefOpenMassSupport" target="_blank">Abrir apoio em massa</a>
                    </td>
                </tr>
            </table>
        `);

        const selected = new Map();
        installMapClickHandler(selected);

        $('#tpdefMapSelectSupport').off('change.tpdef').on('change.tpdef', function () {
            $('.tpdef-map-support').toggle(this.checked);
            selected.clear();
            clearMapOverlays();
            refreshMapSupport(selected);
            toggleMapOverlayTimer(this.checked, selected);
        });

        $('#tpdefOpenMassSupport').off('click.tpdef').on('click.tpdef', function (e) {
            if (!selected.size) {
                e.preventDefault();
                errorMessage('Seleciona pelo menos uma aldeia tua no mapa.');
            }
        });

        installMapPopupDefense();
    }

    function installMapClickHandler(selected) {
        const map = TWMap.map;
        const originalClick = typeof map._handleClick === 'function'
            ? map._handleClick
            : function () { return true; };

        if (!map._tpdefOriginalClick) {
            map._tpdefOriginalClick = originalClick;
        }

        if (map._tpdefWrappedClick) return;

        map._handleClick = function (event) {
            if (!$('#tpdefMapSelectSupport').is(':checked')) {
                return map._tpdefOriginalClick.call(this, event);
            }

            const pos = this.coordByEvent(event);
            const x = parseInt(pos && (pos[0] !== undefined ? pos[0] : pos.x), 10);
            const y = parseInt(pos && (pos[1] !== undefined ? pos[1] : pos.y), 10);

            if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

            const village = findMapVillage(x, y);

            if (!village || String(village.owner) !== String(game_data.player.id)) {
                errorMessage('Escolhe uma das tuas aldeias.');
                return false;
            }

            toggleSelectedVillage(selected, village, `${x}|${y}`);
            refreshMapSupport(selected);
            return false;
        };

        map._tpdefWrappedClick = true;
    }

    function findMapVillage(x, y) {
        if (!window.TWMap || !TWMap.villages) return null;
        return TWMap.villages[x * 1000 + y] || TWMap.villages[`${x}|${y}`] || null;
    }

    function toggleSelectedVillage(selected, village, coords) {
        const id = String(village.id);

        if (selected.has(id)) {
            selected.delete(id);
            $(`#tpdef-map-${id}`).remove();
            return;
        }

        selected.set(id, {id, coords});
        drawMapOverlay(id);
    }

    function drawMapOverlay(id) {
        const tile = $(`#map_village_${id}`);
        $(`#tpdef-map-${id}`).remove();

        if (!tile.length || !window.TWMap || !TWMap.map || !TWMap.map.scale) return;

        tile.after($('<div>', {
            id: `tpdef-map-${id}`,
            class: 'tpdef-map-overlay',
            css: {
                width: `${Math.max(1, TWMap.map.scale[0] - 1)}px`,
                height: `${Math.max(1, TWMap.map.scale[1] - 1)}px`,
                left: tile.css('left'),
                top: tile.css('top')
            }
        }));
    }

    function clearMapOverlays() {
        $('.tpdef-map-overlay').remove();
    }

    function redrawMapOverlays(selected) {
        selected.forEach(function (village) {
            drawMapOverlay(village.id);
        });
    }

    function toggleMapOverlayTimer(enabled, selected) {
        if (state.mapOverlayTimer) {
            clearInterval(state.mapOverlayTimer);
            state.mapOverlayTimer = null;
        }

        if (enabled) {
            state.mapOverlayTimer = setInterval(function () {
                redrawMapOverlays(selected);
            }, 1200);
        }
    }

    function refreshMapSupport(selected) {
        const villages = Array.from(selected.values());
        const ids = villages.map(v => encodeURIComponent(v.id)).join(',');
        const link = `${game_data.link_base_pure}place&mode=call&group=0&page=-1&sources=${ids}`;

        $('#tpdefMapSupportCoords').val(villages.map(v => v.coords).join('\n'));
        $('#tpdefOpenMassSupport')
            .attr('href', villages.length ? link : '#')
            .toggleClass('tpdef-disabled', villages.length === 0);
    }

    function installMapPopupDefense(attempt) {
        const popup = document.getElementById('map_popup');
        const count = attempt || 0;

        if (!popup) {
            if (count < 120) setTimeout(function () { installMapPopupDefense(count + 1); }, 250);
            return;
        }

        if (state.mapPopupObserver) return;

        state.mapPopupObserver = new MutationObserver(function (mutations) {
            const onlyTpdefChanges = mutations.every(function (mutation) {
                return $(mutation.target).closest('#tpdefMapDefenseInfo').length > 0;
            });

            if (onlyTpdefChanges) return;

            scheduleMapPopupDefenseRender();
        });

        state.mapPopupObserver.observe(popup, {
            childList: true,
            subtree: true
        });

        scheduleMapPopupDefenseRender();
    }

    function scheduleMapPopupDefenseRender() {
        clearTimeout(state.mapPopupRenderTimer);
        state.mapPopupRenderTimer = setTimeout(renderMapPopupDefense, 25);
    }

    function renderMapPopupDefense() {
        const popup = $('#map_popup');
        if (!popup.length || !popup.is(':visible')) return;

        const villageData = collectMapPopupVillageDefense(popup);
        if (!villageData || !Object.keys(villageData.troops).length) return;

        const attackModel = loadAttackModel();
        const level = getDefenseAgainstAttackModel(
            villageData.troops,
            villageData.wall,
            attackModel,
            villageData.incomingInfo,
            villageData.supportTroops
        );
        const signature = JSON.stringify({
            coords: villageData.coords,
            wall: villageData.wall,
            troops: villageData.troops,
            incoming: villageData.incomingInfo,
            support: villageData.supportTroops,
            attackModel,
            defenseModel: loadDefenseModel()
        });
        const existing = $('#tpdefMapDefenseInfo');

        if (existing.attr('data-tpdef-signature') === signature) return;

        existing.remove();

        const target = popup.find('table.vis').not('#tpdefMapDefenseInfo').last();
        const targetWidth = Math.floor(target.outerWidth() || popup.find('table.vis').first().outerWidth() || popup.width() || 0);
        const widthStyle = targetWidth > 0 ? ` style="width:${targetWidth}px;max-width:${targetWidth}px;"` : '';
        const html = `
            <table id="tpdefMapDefenseInfo" class="vis" data-tpdef-signature="${escapeAttr(signature)}"${widthStyle}>
                <colgroup>
                    <col class="tpdef-map-icon-col">
                    <col class="tpdef-map-info-col">
                </colgroup>
                <tr>
                    <th colspan="2" class="tpdef-map-defense-title">
                        Defesa da Aldeia -
                        <span style="color:${level.color};">${escapeHtml(level.text)}!</span>
                    </th>
                </tr>
                <tr>
                    <td class="tpdef-map-defense-icon">
                        <img src="${escapeAttr(level.icon)}" title="${escapeAttr(level.note)}" alt="">
                    </td>
                    <td>
                        ${renderDefenseSummary(level)}
                    </td>
                </tr>
            </table>
        `;

        if (target.length) target.after(html);
        else popup.append(html);
    }

    function collectMapPopupVillageDefense(popup) {
        const coords = getMapPopupCoords(popup);
        const troops = readMapPopupTroops(popup);
        const wall = readMapPopupBuildingLevel(popup, 'wall');
        const incomingInfo = getMapPopupIncomingInfo(popup, coords);
        const supportTroops = isCurrentVillageMapPopup(popup, coords) ? getCurrentVillageIncomingSupportTroops() : {};

        if (!Object.keys(troops).length) return null;

        return {coords, troops, wall, incomingInfo, supportTroops};
    }

    function renderDefenseSummary(level) {
        const status = level.extra
            ? `<div class="tpdef-defense-status"><div class="tpdef-defense-extra">${escapeHtml(level.extra)}</div></div>`
            : '';

        return `
            <div class="tpdef-defense-summary ${status ? '' : 'tpdef-defense-summary-clean'}">
                    ${status}
                    <div class="tpdef-defense-metrics">
                        <div class="tpdef-fulls-counters">
                            ${renderFullCounter(level, 'attack')}
                            ${level.defenseCounter ? renderFullCounter(level, 'defense') : ''}
                        </div>
                        ${level.shortage ? `<div class="tpdef-defense-extra tpdef-defense-shortage">${level.shortage}</div>` : ''}
                    </div>
                    ${renderIncomingSupportForecast(level)}
                </div>
            `;
    }

    function renderIncomingSupportForecast(level) {
        const forecast = level && level.supportForecast;
        const troops = forecast && forecast.troops;

        if (!hasTroops(troops)) return '';

        const preferredOrder = (game_data.units || []).concat(Object.keys(APP.troopPop));
        const units = Array.from(new Set(preferredOrder)).filter(function (unit) {
            return parseAmount(troops[unit]) > 0;
        });
        const unitHtml = units.map(function (unit) {
            return `
                <span class="tpdef-support-unit">
                    <img src="/graphic/unit/unit_${escapeAttr(unit)}.png" title="${escapeAttr(getUnitName(unit))}" alt="">
                    ${formatNumber(troops[unit])}
                </span>
            `;
        }).join('');

        return `
            <div class="tpdef-support-forecast">
                <span class="tpdef-support-forecast-title">
                    <img src="/graphic/command/support.png" alt="">
                    Apoios a chegar
                </span>
                <span class="tpdef-support-units">${unitHtml}</span>
                <span class="tpdef-support-forecast-capacity">
                    Depois dos apoios: ${escapeHtml(forecast.capacity)}
                </span>
            </div>
        `;
    }

    function renderFullCounter(level, type) {
        const isAttack = type === 'attack';
        const label = isAttack
            ? level.attackCounterLabel || 'Fulls a Chegar'
            : level.defenseCounterLabel || 'Fulls que a aldeia aguenta';
        const value = isAttack
            ? firstDefined(level.attackCounterValue, level.attackCounter || level.highlight)
            : firstDefined(level.defenseCounterValue, level.defenseCounter);
        const className = isAttack ? 'tpdef-fulls-attack' : 'tpdef-fulls-defense';

        return `
            <div class="tpdef-fulls-highlight ${className}" style="color:${level.color};">
                <span class="tpdef-counter-label">${escapeHtml(label)}</span>
                <span class="tpdef-counter-value">${escapeHtml(value)}</span>
            </div>
        `;
    }

    function readMapPopupTroops(popup) {
        const troops = {};

        popup.find('tr').each(function () {
            const iconRow = $(this);
            const icons = iconRow.find('img[src*="/unit/unit_"], img[src*="unit/unit_"]').not('#tpdefMapDefenseInfo img');
            if (!icons.length) return;

            const valueRow = iconRow.next('tr');
            if (!valueRow.length || !isMapPopupTroopValueRow(valueRow)) return;

            icons.each(function () {
                const image = $(this);
                const src = String(image.attr('src') || '');
                const match = src.match(/unit_([a-z_]+)\.png/);
                if (!match) return;

                const unit = match[1];
                if (!APP.unitStats[unit]) return;

                const iconCell = image.closest('td,th');
                const amount = parseMapPopupTroopAmount(valueRow.children('td,th').eq(iconCell.index()).text());
                if (amount > 0) troops[unit] = amount;
            });
        });

        return troops;
    }

    function isMapPopupTroopValueRow(row) {
        const cells = row.children('td,th');
        let numericCells = 0;
        let timedCells = 0;

        cells.each(function () {
            const text = $.trim($(this).text());
            if (!text) return;

            if (/\d+\s*:\s*\d{2}/.test(text)) {
                timedCells += 1;
                return;
            }

            if (/^\d+(\s*\(\d+\))?$/.test(text.replace(/\./g, ''))) {
                numericCells += 1;
            }
        });

        return numericCells > 0 && timedCells === 0;
    }

    function parseMapPopupTroopAmount(value) {
        const text = $.trim(String(value || '')).replace(/\./g, '');
        const match = text.match(/^(\d+)/);
        return match ? parseAmount(match[1]) : 0;
    }

    function readUnitAmountsFromRoot(root) {
        const troops = {};

        root.find('tr').addBack('tr').each(function () {
            const iconRow = $(this);
            const icons = iconRow.find('img[src*="/unit/unit_"], img[src*="unit/unit_"]').not('#tpdefMapDefenseInfo img');
            if (!icons.length) return;

            const valueRow = iconRow.next('tr');

            if (!valueRow.length || !isMapPopupTroopValueRow(valueRow)) return;

            icons.each(function () {
                const image = $(this);
                const match = String(image.attr('src') || '').match(/unit_([a-z_]+)\.png/);
                if (!match || !APP.unitStats[match[1]]) return;

                const amount = parseMapPopupTroopAmount(valueRow.children('td,th').eq(image.closest('td,th').index()).text());
                if (amount > 0) troops[match[1]] = (troops[match[1]] || 0) + amount;
            });
        });

        return troops;
    }

    function readMapPopupBuildingLevel(popup, building) {
        let level = 0;

        popup.find(`img[src*="/buildings/${building}.png"], img[src*="buildings/${building}.png"]`)
            .not('#tpdefMapDefenseInfo img')
            .each(function () {
                level = Math.max(level, readMapPopupIconNumber($(this)));
            });

        return level;
    }

    function readMapPopupIconNumber(image) {
        const cell = image.closest('td');
        const row = cell.closest('tr');
        const index = cell.index();
        let amount = parseFirstAmount(cell.text());

        if (amount > 0) return amount;

        amount = parseFirstAmount(row.next('tr').children('td,th').eq(index).text());
        if (amount > 0) return amount;

        return parseFirstAmount(row.prev('tr').children('td,th').eq(index).text());
    }

    function getMapPopupCoords(popup) {
        const text = popup.clone().find('#tpdefMapDefenseInfo').remove().end().text();
        const match = text.match(/\b\d{1,3}\|\d{1,3}\b/);
        return match ? match[0] : '';
    }

    function getMapPopupIncomingInfo(popup, coords) {
        const explicit = readExplicitMapPopupIncomingInfo(popup);
        if (explicit.total > 0) return explicit;

        if (coords) {
            refreshIncomingCountsCache();
            const total = state.incomingCountsCache.counts[coords] || 0;
            const ariete = state.incomingCountsCache.arieteCounts[coords] || 0;

            return {
                count: ariete || total,
                total,
                ariete,
                source: ariete ? 'cache_ariete' : 'cache_total'
            };
        }

        const villageId = getMapPopupVillageId(popup);
        if (villageId && String(villageId) === String(game_data.village && game_data.village.id)) {
            return getCurrentVillageIncomingCount();
        }

        return {count: 0, total: 0, ariete: 0, source: 'unknown'};
    }

    function isCurrentVillageMapPopup(popup, coords) {
        const currentCoords = getCurrentVillageCoords();
        if (coords && currentCoords && coords === currentCoords) return true;

        const villageId = getMapPopupVillageId(popup);
        return Boolean(villageId && String(villageId) === String(game_data.village && game_data.village.id));
    }

    function getCurrentVillageCoords() {
        if (game_data.village && game_data.village.coord) return String(game_data.village.coord);

        const x = game_data.village && (game_data.village.x || game_data.village.coord_x);
        const y = game_data.village && (game_data.village.y || game_data.village.coord_y);

        if (x !== undefined && y !== undefined) return `${x}|${y}`;

        return '';
    }

    function readExplicitMapPopupIncomingInfo(popup) {
        let count = 0;

        popup.find('img[src*="command/attack"]')
            .not('#tpdefMapDefenseInfo img')
            .each(function () {
                const amount = parseFirstAmount($(this).closest('td,div,span,tr').text());
                if (amount > 0) count += amount;
            });

        const text = clean(popup.text());
        const ariete = /\barietes?\b/.test(text) ? Math.max(1, count) : 0;

        if (count > 0) {
            return {count: ariete || count, total: Math.max(count, ariete), ariete, source: ariete ? 'popup_ariete' : 'popup_total'};
        }

        const match = text.match(/ataques?\D+(\d+)/);
        count = match ? parseAmount(match[1]) : 0;

        return {count: ariete || count, total: Math.max(count, ariete), ariete, source: ariete ? 'popup_ariete' : 'popup_total'};
    }

    function getMapPopupVillageId(popup) {
        let villageId = '';

        popup.find('a[href*="screen=info_village"][href*="id="]').each(function () {
            const match = String($(this).attr('href') || '').match(/[?&]id=(\d+)/);
            if (match) villageId = match[1];
        });

        return villageId;
    }

    function refreshIncomingCountsCache() {
        const now = Date.now();
        if (state.incomingCountsCache.loading || now - state.incomingCountsCache.loadedAt < 120000) return;

        state.incomingCountsCache.loading = true;

        $.get(`${game_data.link_base_pure}overview_villages&mode=incomings&page=-1`)
            .done(function (html) {
                const incomingCounts = collectIncomingTargetCountsFromHtml(html);
                state.incomingCountsCache.counts = incomingCounts.counts;
                state.incomingCountsCache.arieteCounts = incomingCounts.arieteCounts;
                state.incomingCountsCache.loadedAt = Date.now();
                scheduleMapPopupDefenseRender();
            })
            .always(function () {
                state.incomingCountsCache.loading = false;
            });
    }

    function collectIncomingTargetCountsFromHtml(html) {
        const counts = {};
        const arieteCounts = {};
        const root = $('<div>').append($.parseHTML(html, document, true));
        const table = root.find('#incomings_table');
        const rows = table.find('tr.row_a, tr.row_b');

        if (!table.length || !rows.length) return {counts, arieteCounts};

        const indexes = getIncomingIndexes(table);

        rows.each(function () {
            const row = $(this);
            const coords = getRowCoords($(this), indexes.target);
            if (!coords) return;
            counts[coords] = (counts[coords] || 0) + 1;

            if (isArieteNamedCommand(row)) {
                arieteCounts[coords] = (arieteCounts[coords] || 0) + 1;
            }
        });

        return {counts, arieteCounts};
    }

    function enhanceMassSupport() {
        if (getCurrentMode() !== 'call' || $('#tpdefMassSupport').length) return;

        const params = new URLSearchParams(location.search);
        const sources = (params.get('sources') || '')
            .split(',')
            .map(v => v.trim())
            .filter(Boolean);

        const html = `
            <div id="tpdefMassSupport" class="vis" style="margin-top:6px; padding:6px">
                <strong>Apoio em massa ThePlaguePT</strong>
                |
                <input type="checkbox" id="tpdefSelectFirst">
                <label for="tpdefSelectFirst">Selecionar</label>
                <input id="tpdefSelectAmount" type="number" min="0" value="0" style="width:55px">
                aldeias
                |
                <input type="button" class="btn" id="tpdefSelectFromMap" value="Selecionar aldeias do mapa (${sources.length})">
                <div id="tpdefSupportPreview" style="margin-top:6px; display:none"></div>
            </div>
        `;

        const anchor = $('.evt-button-fill').last();
        if (anchor.length) anchor.after(html);
        else $('#content_value').prepend(html);

        $('#tpdefSelectFirst').off('change.tpdef').on('change.tpdef', function () {
            applyFirstVillageSelection(this.checked);
        });

        $('#tpdefSelectAmount').off('change.tpdef input.tpdef').on('change.tpdef input.tpdef', function () {
            if ($('#tpdefSelectFirst').is(':checked')) applyFirstVillageSelection(true);
        });

        $('#tpdefSelectFromMap').off('click.tpdef').on('click.tpdef', function () {
            sources.forEach(function (id) {
                const row = $(document.getElementById(`call_village_${id}`));
                row.find('.troop-request-selector').prop('checked', true).trigger('change');
            });
            updateSupportPreview();
        });

        $(document).off('change.tpdefSupport input.tpdefSupport')
            .on('change.tpdefSupport input.tpdefSupport', '.troop-request-selector, #village_troup_list input', updateSupportPreview);

        updateSupportPreview();
    }

    function applyFirstVillageSelection(checked) {
        const amount = Math.max(0, parseInt($('#tpdefSelectAmount').val(), 10) || 0);
        $('.troop-request-selector').slice(0, amount).prop('checked', checked).trigger('change');
        updateSupportPreview();
    }

    function updateSupportPreview() {
        const preview = $('#tpdefSupportPreview');
        if (!preview.length) return;

        const checked = $('#village_troup_list tr:not(:first) .troop-request-selector:checked');
        const totals = {};
        let pop = 0;

        checked.each(function () {
            const rowTotals = collectSupportUnitsFromRow($(this).closest('tr'));

            Object.keys(rowTotals).forEach(function (unit) {
                const amount = rowTotals[unit];
                totals[unit] = (totals[unit] || 0) + amount;
                pop += amount * (APP.troopPop[unit] || 0);
            });
        });

        if (!checked.length) {
            preview.hide().empty();
            return;
        }

        const units = Object.keys(APP.troopPop).filter(unit => totals[unit] > 0);

        preview.show().html(`
            <table class="vis" style="width:100%">
                <tr>
                    <th>Aldeias</th>
                    ${units.map(u => `<th><img src="/graphic/unit/unit_${escapeAttr(u)}.png" title="${escapeAttr(u)}"></th>`).join('')}
                    <th><span class="icon header population"></span></th>
                </tr>
                <tr>
                    <td>${checked.length}</td>
                    ${units.map(u => `<td>${formatNumber(totals[u])}</td>`).join('')}
                    <td>${formatNumber(pop)}</td>
                </tr>
            </table>
        `);
    }

    function collectSupportUnitsFromRow(row) {
        const totals = {};

        row.find('td[data-unit]').each(function () {
            const cell = $(this);
            const unit = String(cell.data('unit') || '');
            const input = cell.find('input').first();
            const amount = parseAmount(input.length ? input.val() : cell.text());
            if (unit && amount > 0) totals[unit] = amount;
        });

        if (Object.keys(totals).length) return totals;

        Object.keys(APP.troopPop).forEach(function (unit) {
            const input = row.find(`.unit-item-${unit} input, input[name*="[${unit}]"], input[id*="${unit}"]`).first();
            const amount = parseAmount(input.val());
            if (amount > 0) totals[unit] = amount;
        });

        return totals;
    }

    function addWallResistanceWidget() {
        if (!game_data.village) return;

        $('#tpdefWallResistance').remove();

        const wall = getCurrentWallLevel();
        const troops = {};

        (game_data.units || Object.keys(APP.troopPop)).forEach(function (unit) {
            troops[unit] = readVillageUnitCount(unit);
        });

        const attackModel = loadAttackModel();
        const incomingInfo = getCurrentVillageIncomingCount();
        const supportTroops = getCurrentVillageIncomingSupportTroops();
        const level = getDefenseAgainstAttackModel(troops, wall, attackModel, incomingInfo, supportTroops);
        const wallPercent = Math.min(100, Math.max(0, wall * 5));
        const wallColor = getWallColor(wall);

        const widget = `
            <div id="tpdefWallResistance" class="vis moveable widget tpdef-defense-widget">
                <h4 class="head with-button tpdef-defense-title">
                    <span class="tpdef-title-left">
                        Defesa da Aldeia -
                        <span class="tpdef-title-status" style="color:${level.color};">${escapeHtml(level.text)}!</span>
                    </span>
                    <a href="#" id="tpdefWallToggle" class="tpdef-window-button">-</a>
                </h4>

                <div class="widget_content tpdef-defense-body">
                    <table class="tpdef-defense-table">
                        <tr>
                            <td class="tpdef-defense-icon">
                                <img src="/graphic/buildings/wall.png" title="Muralha" alt="">
                            </td>
                            <td class="tpdef-defense-main">
                                <div class="tpdef-defense-line">
                                    <span>Muralha</span>
                                    <span>${wall}/20</span>
                                </div>
                                <div class="tpdef-wall-bar">
                                    <div class="tpdef-wall-fill" style="width:${wallPercent}%; background:${wallColor};"></div>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td class="tpdef-defense-icon">
                                <img src="${escapeAttr(level.icon)}" title="${escapeAttr(level.note)}" alt="">
                            </td>
                            <td>
                                ${renderDefenseSummary(level)}
                            </td>
                        </tr>
                        <tr>
                            <td class="tpdef-defense-icon">
                                <img src="/graphic/buildings/place.png" title="Simulador" alt="">
                            </td>
                            <td>
                                <div class="tpdef-defense-actions">
                                    <a target="_blank" href="${escapeAttr(buildSimpleSimulatorUrl(troops, wall, attackModel))}" class="btn tpdef-defense-action">
                                        <img src="/graphic/buildings/place.png" alt="">
                                        Simulador
                                    </a>
                                    <a href="#" id="tpdefAttackModelButton" class="btn tpdef-defense-action">
                                        <img src="/graphic/command/attack.png" alt="">
                                        Modelo ataque
                                    </a>
                                    <a href="#" id="tpdefDefenseModelButton" class="btn tpdef-defense-action">
                                        <img src="/graphic/command/support.png" alt="">
                                        Modelo defesa
                                    </a>
                                    <a href="#" id="tpdefDefenseCalculatorButton" class="btn tpdef-defense-action">
                                        <img src="/graphic/buildings/place.png" alt="">
                                        Calc. fulls
                                    </a>
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>
            </div>
        `;

        if ($('#show_buildqueue').length) $('#show_buildqueue').after(widget);
        else $('#content_value').prepend(widget);

        $('#tpdefWallToggle').off('click.tpdef').on('click.tpdef', function (event) {
            event.preventDefault();
            const body = $('#tpdefWallResistance .tpdef-defense-body');
            body.toggle();
            $(this).text(body.is(':visible') ? '-' : '+');
        });

        $('#tpdefAttackModelButton').off('click.tpdef').on('click.tpdef', function (event) {
            event.preventDefault();
            openAttackModelDialog();
        });

        $('#tpdefDefenseModelButton').off('click.tpdef').on('click.tpdef', function (event) {
            event.preventDefault();
            openDefenseModelDialog();
        });

        $('#tpdefDefenseCalculatorButton').off('click.tpdef').on('click.tpdef', function (event) {
            event.preventDefault();
            openDefenseCalculatorDialog();
        });
    }

    function getCurrentWallLevel() {
        const fromGameData = parseAmount(game_data.village && game_data.village.buildings && game_data.village.buildings.wall);
        if (fromGameData > 0) return clamp(fromGameData, 0, 20);

        const fromWidget = parseWallLevelFromText($('#tpdefWallResistance .tpdef-defense-line').text());
        if (fromWidget >= 0) return fromWidget;

        const fromPage = parseWallLevelFromText($('#content_value').text());
        if (fromPage >= 0) return fromPage;

        return 0;
    }

    function parseWallLevelFromText(text) {
        const match = String(text || '').match(/\b(\d{1,2})\s*\/\s*20\b/);
        if (!match) return -1;

        return clamp(parseAmount(match[1]), 0, 20);
    }

    function readVillageUnitCount(unit) {
        const selectors = [
            `.all_unit [data-count="${unit}"]:visible`,
            `[data-count="${unit}"]:visible`,
            `#unit_overview_table .unit-item-${unit}:visible`,
            `#unit_overview_table [data-unit="${unit}"]:visible`
        ];

        for (let i = 0; i < selectors.length; i += 1) {
            const element = $(selectors[i]).first();
            if (element.length) {
                const value = parseAmount(element.text());
                if (value > 0) return value;
            }
        }

        return 0;
    }

    function getCurrentVillageIncomingCount() {
        const fromGameData = parseAmount(game_data.village && game_data.village.incomings);
        const rows = getIncomingAttackRows();
        const arieteCount = countArieteNamedRows(rows);

        if (rows.length) {
            return {
                count: arieteCount || rows.length,
                total: rows.length,
                ariete: arieteCount,
                source: arieteCount ? 'commands_ariete' : 'commands_incomings'
            };
        }

        if (fromGameData > 0) {
            return {
                count: fromGameData,
                total: fromGameData,
                ariete: 0,
                source: 'game_data'
            };
        }

        return {count: 0, total: 0, ariete: 0, source: 'unknown'};
    }

    function getIncomingAttackRows() {
        return $('#commands_incomings tr, #commands_incomings .command-row')
            .filter(function () {
                const row = $(this);
                const text = clean(row.text());
                const hasAttackIcon = row.find('img[src*="attack"]').length > 0;
                const looksLikeCommand = row.find('.quickedit, .timer, span[data-endtime]').length > 0;

                return looksLikeCommand && (hasAttackIcon || text.includes('ataque'));
            });
    }

    function countArieteNamedRows(rows) {
        let count = 0;

        rows.each(function () {
            if (isArieteNamedCommand($(this))) count += 1;
        });

        return count;
    }

    function isArieteNamedCommand(row) {
        return /\barietes?\b/.test(clean(row.text()));
    }

    function getCurrentVillageIncomingSupportTroops() {
        const villageId = String(game_data.village && game_data.village.id || '');
        const now = Date.now();
        const cache = state.supportTroopsCache;
        const links = getIncomingSupportCommandLinks();
        const linksKey = links.slice().sort().join('|');

        if (
            cache.villageId === villageId &&
            cache.linksKey === linksKey &&
            now - cache.loadedAt < 60000
        ) {
            return cache.troops || {};
        }

        const visibleTroops = readVisibleIncomingSupportTroops();

        if (!cache.loading || cache.linksKey !== linksKey || cache.villageId !== villageId) {
            refreshCurrentVillageSupportTroopsCache(visibleTroops, links, linksKey);
        }

        return visibleTroops;
    }

    function readVisibleIncomingSupportTroops() {
        const totals = {};

        getIncomingSupportRows().each(function () {
            addTroops(totals, readUnitAmountsFromRoot($(this)));
        });

        return totals;
    }

    function getIncomingSupportRows() {
        return $('#commands_incomings tr, #commands_incomings .command-row')
            .filter(function () {
                const row = $(this);
                const text = clean(row.text());
                const hasSupportIcon = row.find('img[src*="support"]').length > 0;

                return hasSupportIcon || text.includes('apoio') || text.includes('suporte');
            });
    }

    function refreshCurrentVillageSupportTroopsCache(seedTroops, commandLinks, commandLinksKey) {
        const villageId = String(game_data.village && game_data.village.id || '');
        const cache = state.supportTroopsCache;
        const links = commandLinks || getIncomingSupportCommandLinks();
        const linksKey = commandLinksKey !== undefined
            ? commandLinksKey
            : links.slice().sort().join('|');
        const requestId = cache.requestId + 1;

        cache.villageId = villageId;
        cache.linksKey = linksKey;
        cache.requestId = requestId;
        cache.loading = true;

        if (!links.length) {
            cache.troops = seedTroops || {};
            cache.loadedAt = Date.now();
            cache.loading = false;
            return;
        }

        const fetchedTotals = {};
        let remaining = links.length;

        links.forEach(function (url) {
            $.get(url)
                .done(function (html) {
                    addTroops(fetchedTotals, readUnitAmountsFromRoot($('<div>').append($.parseHTML(html, document, true))));
                })
                .always(function () {
                    remaining -= 1;

                    if (remaining > 0) return;
                    if (requestId !== cache.requestId) return;

                    cache.troops = hasTroops(fetchedTotals)
                        ? fetchedTotals
                        : cloneTroops(seedTroops || {});
                    cache.loadedAt = Date.now();
                    cache.loading = false;

                    if (game_data.screen === 'overview') addWallResistanceWidget();
                    if (game_data.screen === 'map') scheduleMapPopupDefenseRender();
                });
        });
    }

    function getIncomingSupportCommandLinks() {
        const links = new Set();

        getIncomingSupportRows().each(function () {
            $(this).find('a[href*="screen=info_command"][href*="id="]').each(function () {
                const href = String($(this).attr('href') || '');
                if (!href || !/[?&]id=\d+/.test(href)) return;

                links.add(resolveGameUrl(href));
            });
        });

        return Array.from(links);
    }

    function resolveGameUrl(href) {
        if (/^https?:\/\//.test(href)) return href;
        if (href.charAt(0) === '/') return `${location.origin}${href}`;
        return `${location.origin}${location.pathname}?${href.replace(/^\?/, '')}`;
    }

    function getWallColor(wall) {
        const level = Math.max(0, Math.min(20, wall));

        if (level >= 10) {
            const ratio = (level - 10) / 10;
            return interpolateColor('#d49a22', '#2f8f46', ratio);
        }

        return interpolateColor('#b7332c', '#d49a22', level / 10);
    }

    function interpolateColor(from, to, ratio) {
        const start = hexToRgb(from);
        const end = hexToRgb(to);
        const mix = start.map(function (value, index) {
            return Math.round(value + (end[index] - value) * ratio);
        });

        return rgbToHex(mix);
    }

    function hexToRgb(hex) {
        const cleanHex = String(hex).replace('#', '');
        return [
            parseInt(cleanHex.slice(0, 2), 16),
            parseInt(cleanHex.slice(2, 4), 16),
            parseInt(cleanHex.slice(4, 6), 16)
        ];
    }

    function rgbToHex(rgb) {
        return `#${rgb.map(function (value) {
            return value.toString(16).padStart(2, '0');
        }).join('')}`;
    }

    function loadAttackModel() {
        const saved = readJson(key('attackModel'), {});
        const source = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        const sourceUnits = source.units && typeof source.units === 'object' ? source.units : source;
        const model = {
            units: {},
            catapultWall: source.catapultWall === true
        };

        APP.attackModelUnits.forEach(function (unit) {
            const amount = parseAmount(sourceUnits[unit]);

            if (amount > 0) model.units[unit] = amount;
        });

        return model;
    }

    function saveAttackModel(model) {
        try {
            localStorage.setItem(key('attackModel'), JSON.stringify(model));
            return true;
        } catch (err) {
            errorMessage('Nao foi possivel guardar o modelo de ataque.');
            log(err);
            return false;
        }
    }

    function hasAttackModel(model) {
        const units = model && model.units ? model.units : {};

        return APP.attackModelUnits.some(function (unit) {
            return parseAmount(units[unit]) > 0 && APP.unitStats[unit] && APP.unitStats[unit].attack > 0;
        });
    }

    function getAttackModelUnits() {
        const gameUnits = game_data.units && game_data.units.length ? game_data.units : APP.attackModelUnits;

        return APP.attackModelUnits.filter(function (unit) {
            return unit === 'snob' || gameUnits.includes(unit);
        });
    }

    function loadDefenseModel() {
        const saved = readJson(key('defenseModel'), {});
        const source = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        const model = {};

        APP.defenseModelUnits.forEach(function (unit) {
            const amount = parseAmount(source[unit]);
            if (amount > 0) model[unit] = amount;
        });

        return model;
    }

    function saveDefenseModel(model) {
        try {
            localStorage.setItem(key('defenseModel'), JSON.stringify(model));
            return true;
        } catch (err) {
            errorMessage('Nao foi possivel guardar o modelo de defesa.');
            log(err);
            return false;
        }
    }

    function hasDefenseModel(model) {
        return Object.keys(model || {}).some(function (unit) {
            return parseAmount(model[unit]) > 0 && APP.unitStats[unit];
        });
    }

    function getDefenseModelUnits() {
        const gameUnits = game_data.units && game_data.units.length ? game_data.units : APP.defenseModelUnits;

        return APP.defenseModelUnits.filter(function (unit) {
            return gameUnits.includes(unit);
        });
    }

    function openAttackModelDialog() {
        const model = loadAttackModel();
        const rows = getAttackModelUnits().map(function (unit) {
            return `
                <tr class="tpdef-model-row">
                    <td class="tpdef-model-unit">
                        <img src="/graphic/unit/unit_${escapeAttr(unit)}.png" title="${escapeAttr(getUnitName(unit))}" alt="">${escapeHtml(getUnitName(unit))}
                    </td>
                    <td class="tpdef-model-value">
                        <input class="tpdef-attack-model-input" data-unit="${escapeAttr(unit)}" type="number" min="0" step="1" value="${model.units[unit] || 0}">
                    </td>
                </tr>
            `;
        }).join('');

        showDialog('tpDefAttackModel', `
            <div class="tpdef-model-wrap">
                <table class="vis tpdef-model-table" style="width:100%">
                    <tr>
                        <th colspan="2">
                            <span class="tpdef-dialog-title">
                                <img src="/graphic/command/attack.png" alt="">Modelo de ataque
                            </span>
                        </th>
                    </tr>
                    <tr class="tpdef-preset-row">
                        <td colspan="2">
                            <input type="button" class="btn tpdef-attack-preset" data-preset="ariete" value="Full Ataque">
                        </td>
                    </tr>
                    ${rows}
                    <tr class="tpdef-model-option">
                        <td class="tpdef-model-unit">
                            <span class="tpdef-field-label">
                                <img src="/graphic/buildings/wall.png" alt="">Alvo das catapultas
                            </span>
                            <span class="tpdef-field-help">Marcado = Muralha - Sim. Desmarcado = Muralha - Não.</span>
                        </td>
                        <td class="tpdef-model-value">
                            <label style="white-space:nowrap">
                                <input id="tpdefCatapultWall" type="checkbox" ${model.catapultWall ? 'checked' : ''}>
                                Muralha - Sim
                            </label>
                        </td>
                    </tr>
                    <tr class="tpdef-model-pop-row">
                        <td colspan="2">
                            <div id="tpdefAttackModelPop" class="tpdef-model-pop"></div>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="2" class="tpdef-model-actions">
                            <input type="button" class="btn" id="tpdefSaveAttackModel" value="Guardar">
                            <input type="button" class="btn" id="tpdefClearAttackModel" value="Limpar">
                        </td>
                    </tr>
                </table>
            </div>
        `);

        $('.tpdef-attack-preset').off('click.tpdef').on('click.tpdef', function () {
            applyAttackPreset(String($(this).data('preset') || ''));
        });
        $('.tpdef-attack-model-input').off('input.tpdefPop change.tpdefPop').on('input.tpdefPop change.tpdefPop', function () {
            updateModelPopulation('.tpdef-attack-model-input', '#tpdefAttackModelPop');
        });
        updateModelPopulation('.tpdef-attack-model-input', '#tpdefAttackModelPop');

        $('#tpdefSaveAttackModel').off('click.tpdef').on('click.tpdef', function () {
            const nextModel = {
                units: {},
                catapultWall: $('#tpdefCatapultWall').is(':checked')
            };

            nextModel.units = collectModelInputTroops('.tpdef-attack-model-input', APP.attackModelUnits);

            if (saveAttackModel(nextModel)) {
                successMessage('Modelo de ataque guardado.');
                closeDialog('tpDefAttackModel');
                addWallResistanceWidget();
            }
        });

        $('#tpdefClearAttackModel').off('click.tpdef').on('click.tpdef', function () {
            $('.tpdef-attack-model-input').val(0);
            if (saveAttackModel({})) {
                successMessage('Modelo de ataque limpo.');
                closeDialog('tpDefAttackModel');
                addWallResistanceWidget();
            }
        });
    }

    function openDefenseModelDialog() {
        const model = loadDefenseModel();
        const rows = getDefenseModelUnits().map(function (unit) {
            return `
                <tr class="tpdef-model-row">
                    <td class="tpdef-model-unit">
                        <img src="/graphic/unit/unit_${escapeAttr(unit)}.png" title="${escapeAttr(getUnitName(unit))}" alt="">${escapeHtml(getUnitName(unit))}
                    </td>
                    <td class="tpdef-model-value">
                        <input class="tpdef-defense-model-input" data-unit="${escapeAttr(unit)}" type="number" min="0" step="1" value="${model[unit] || 0}">
                    </td>
                </tr>
            `;
        }).join('');

        showDialog('tpDefDefenseModel', `
            <div class="tpdef-model-wrap">
                <table class="vis tpdef-model-table" style="width:100%">
                    <tr>
                        <th colspan="2">
                            <span class="tpdef-dialog-title">
                                <img src="/graphic/command/support.png" alt="">Modelo de defesa
                            </span>
                        </th>
                    </tr>
                    <tr class="tpdef-preset-row">
                        <td colspan="2">
                            <input type="button" class="btn tpdef-defense-preset" data-preset="normal" value="Defesa Normal">
                            <input type="button" class="btn tpdef-defense-preset" data-preset="slow" value="Defesa Lenta">
                            <input type="button" class="btn tpdef-defense-preset" data-preset="fast" value="Defesa Rapida">
                        </td>
                    </tr>
                    ${rows}
                    <tr class="tpdef-model-pop-row">
                        <td colspan="2">
                            <div id="tpdefDefenseModelPop" class="tpdef-model-pop"></div>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="2" class="tpdef-model-actions">
                            <input type="button" class="btn" id="tpdefSaveDefenseModel" value="Guardar">
                            <input type="button" class="btn" id="tpdefClearDefenseModel" value="Limpar">
                            <input type="button" class="btn" id="tpdefOpenDefenseCalculator" value="Calculadora">
                        </td>
                    </tr>
                </table>
            </div>
        `);

        $('.tpdef-defense-preset').off('click.tpdef').on('click.tpdef', function () {
            applyDefensePreset(String($(this).data('preset') || ''));
        });
        $('.tpdef-defense-model-input').off('input.tpdefPop change.tpdefPop').on('input.tpdefPop change.tpdefPop', function () {
            updateModelPopulation('.tpdef-defense-model-input', '#tpdefDefenseModelPop');
        });
        updateModelPopulation('.tpdef-defense-model-input', '#tpdefDefenseModelPop');

        $('#tpdefSaveDefenseModel').off('click.tpdef').on('click.tpdef', function () {
            const nextModel = collectDefenseModelInputs();

            if (saveDefenseModel(nextModel)) {
                successMessage('Modelo de defesa guardado.');
                closeDialog('tpDefDefenseModel');
                addWallResistanceWidget();
                if (game_data.screen === 'map') scheduleMapPopupDefenseRender();
            }
        });

        $('#tpdefClearDefenseModel').off('click.tpdef').on('click.tpdef', function () {
            $('.tpdef-defense-model-input').val(0);
            if (saveDefenseModel({})) {
                successMessage('Modelo de defesa limpo.');
                closeDialog('tpDefDefenseModel');
                addWallResistanceWidget();
                if (game_data.screen === 'map') scheduleMapPopupDefenseRender();
            }
        });

        $('#tpdefOpenDefenseCalculator').off('click.tpdef').on('click.tpdef', function () {
            openDefenseCalculatorDialog(collectDefenseModelInputs());
        });
    }

    function collectDefenseModelInputs() {
        return collectModelInputTroops('.tpdef-defense-model-input', APP.defenseModelUnits);
    }

    function collectModelInputTroops(inputSelector, allowedUnits) {
        const model = {};

        $(inputSelector).each(function () {
            const unit = String($(this).data('unit') || '');
            const amount = parseAmount($(this).val());
            if (amount > 0 && allowedUnits.includes(unit)) model[unit] = amount;
        });

        return model;
    }

    function updateModelPopulation(inputSelector, targetSelector) {
        const troops = collectModelInputTroops(inputSelector, Object.keys(APP.troopPop));
        const pop = calculateTroopPopulation(troops);

        $(targetSelector).html(`
            <span class="icon header population"></span>
            Populacao usada: ${formatNumber(pop)}
        `);
    }

    function openDefenseCalculatorDialog(defenseModelOverride) {
        const defaultWall = getCurrentWallLevel();
        const calculatorDefenseModel = hasDefenseModel(defenseModelOverride) ? defenseModelOverride : null;

        showDialog('tpDefDefenseCalculator', `
            <div class="tpdef-calculator-wrap">
                <table class="vis tpdef-model-table" style="width:100%">
                    <tr>
                        <th colspan="2">
                            <span class="tpdef-dialog-title">
                                <img src="/graphic/buildings/place.png" alt="">Calculadora de Fulls a Defender
                            </span>
                        </th>
                    </tr>
                    <tr>
                        <td class="tpdef-model-unit">
                            <span class="tpdef-field-label">
                                <img src="/graphic/command/attack.png" alt="">Fulls de Ataque
                            </span>
                            <span class="tpdef-field-help">Quantidade de fulls inimigos que queres defender.</span>
                        </td>
                        <td class="tpdef-model-value">
                            <input id="tpdefCalcFulls" class="tpdef-model-small-input" type="number" min="0" max="1000" step="1" value="0">
                        </td>
                    </tr>
                    <tr>
                        <td class="tpdef-model-unit">
                            <span class="tpdef-field-label">
                                <img src="/graphic/buildings/wall.png" alt="">Nível de Muralha
                            </span>
                            <span class="tpdef-field-help">Nível atual da muralha da aldeia.</span>
                        </td>
                        <td class="tpdef-model-value">
                            <input id="tpdefCalcWall" class="tpdef-model-small-input" type="number" min="0" max="20" step="1" value="${defaultWall}">
                        </td>
                    </tr>
                    <tr>
                        <td class="tpdef-model-unit">
                            <span class="tpdef-field-label">
                                <img src="/graphic/buildings/wall.png" alt="">Nível de Muralha Restante Requerida
                            </span>
                            <span class="tpdef-field-help">Muralha mínima que queres manter depois dos ataques.</span>
                        </td>
                        <td class="tpdef-model-value">
                            <input id="tpdefCalcFinalWall" class="tpdef-model-small-input" type="number" min="0" max="20" step="1" value="0">
                        </td>
                    </tr>
                    <tr>
                        <td colspan="2" class="tpdef-model-actions">
                            <input type="button" class="btn" id="tpdefRunDefenseCalculator" value="Calcular">
                            <input type="button" class="btn" id="tpdefOpenAttackModelFromCalc" value="Modelo ataque">
                            <input type="button" class="btn" id="tpdefOpenDefenseModelFromCalc" value="Modelo defesa">
                        </td>
                    </tr>
                    <tr>
                        <td colspan="2">
                            <div class="tpdef-calc-help">
                                <strong>Calcular:</strong> procura a defesa necessária.
                                <strong>Modelo ataque:</strong> define o full inimigo.
                                <strong>Modelo defesa:</strong> define a base das tropas sugeridas.
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="2">
                            <div id="tpdefDefenseCalculatorResult" class="tpdef-calc-result"></div>
                        </td>
                    </tr>
                </table>
            </div>
        `);

        $('#tpdefRunDefenseCalculator').off('click.tpdef').on('click.tpdef', function () {
            renderDefenseCalculatorResult(calculatorDefenseModel);
        });
        $('#tpdefOpenAttackModelFromCalc').off('click.tpdef').on('click.tpdef', openAttackModelDialog);
        $('#tpdefOpenDefenseModelFromCalc').off('click.tpdef').on('click.tpdef', openDefenseModelDialog);

        renderDefenseCalculatorResult(calculatorDefenseModel);
    }

    function renderDefenseCalculatorResult(defenseModelOverride) {
        const fulls = clamp(parseAmount($('#tpdefCalcFulls').val()), 0, 1000);
        const wall = clamp(parseAmount($('#tpdefCalcWall').val()), 0, 20);
        const minFinalWall = clamp(parseAmount($('#tpdefCalcFinalWall').val()), 0, 20);
        const attackModel = loadAttackModel();
        const defenseModel = hasDefenseModel(defenseModelOverride) ? defenseModelOverride : loadDefenseModel();
        const result = calculateRequiredDefenseForFulls(fulls, wall, minFinalWall, attackModel, defenseModel);

        $('#tpdefCalcFulls').val(fulls);
        $('#tpdefCalcWall').val(wall);
        $('#tpdefCalcFinalWall').val(minFinalWall);
        $('#tpdefDefenseCalculatorResult').html(renderDefenseCalculatorHtml(result, fulls, wall, minFinalWall));
        bindCalculatorSimulationControls();
    }

    function renderDefenseCalculatorHtml(result, fulls, wall, minFinalWall) {
        if (!result.ok) {
            return `
                <div class="tpdef-calc-title">
                    <img src="/graphic/command/attack.png" alt="">${escapeHtml(result.title)}
                </div>
                <div>${escapeHtml(result.message)}</div>
            `;
        }

        const attackPop = calculateTroopPopulation(cloneAttackTroops(loadAttackModel()));
        const defensePop = calculateTroopPopulation(result.troops);

        return `
            <div class="tpdef-calc-title">
                <img src="/graphic/command/support.png" alt="">Defesa Necessária para ${formatFullAttackLabel(fulls)}
            </div>
            <div class="tpdef-calc-units">
                ${renderTroopAmountBadges(result.troops)}
            </div>
            <div class="tpdef-calc-wall-flow">
                <span class="tpdef-calc-chip">
                    <span class="icon header population"></span> Pop ataque/full ${formatNumber(attackPop)}
                </span>
                ${fulls > 1 ? `
                    <span class="tpdef-calc-chip">
                        <span class="icon header population"></span> Pop ataque total ${formatNumber(attackPop * fulls)}
                    </span>
                ` : ''}
                <span class="tpdef-calc-chip">
                    <span class="icon header population"></span> Pop defesa necessaria ${formatNumber(defensePop)}
                </span>
            </div>
            <div class="tpdef-calc-wall-flow">
                <span class="tpdef-calc-chip">
                    <img src="/graphic/buildings/wall.png" alt="">Nível da Muralha ${wall}/20
                </span>
                <span class="tpdef-calc-chip">
                    <img src="/graphic/buildings/wall.png" alt="">Muralha Restante ${result.endurance.finalWall}/20
                </span>
                <span class="tpdef-calc-chip">
                    <img src="/graphic/buildings/wall.png" alt="">Muralha Restante Requerida ${minFinalWall}/20
                </span>
            </div>
            <div class="tpdef-calc-meta">
                ${formatFactor(result.factor)}x modelo defesa.
            </div>
            ${renderNightBonusCalculatorNote()}
            ${renderCalculatorSimulation(result.simulations)}
        `;
    }

    function renderNightBonusCalculatorNote() {
        if (!isNightBonusApplied()) return '';

        return `
            <div class="tpdef-calc-meta">
                <img src="/graphic/buildings/wall.png" alt="" style="width:16px;height:16px;vertical-align:middle;">
                Bonus nocturno ativo: defesa x2 aplicada aos calculos.
            </div>
        `;
    }

    function calculateRequiredDefenseForFulls(fulls, wall, minFinalWall, attackModel, defenseModel, includeSimulations) {
        if (fulls <= 0) {
            return {
                ok: false,
                title: 'Aguardando fulls',
                message: 'Introduz o numero de fulls que queres defender.'
            };
        }

        if (!hasAttackModel(attackModel)) {
            return {
                ok: false,
                title: 'Modelo de ataque em falta',
                message: 'Guarda primeiro o Modelo ataque para definir o full inimigo.'
            };
        }

        if (!hasDefenseModel(defenseModel)) {
            return {
                ok: false,
                title: 'Modelo de defesa em falta',
                message: 'Guarda primeiro o Modelo defesa ou escolhe um preset.'
            };
        }

        if (minFinalWall > wall) {
            return {
                ok: false,
                title: 'Muralha restante inválida',
                message: 'A muralha restante requerida não pode ser maior que o nível de muralha.'
            };
        }

        let high = 1;
        let highEndurance = estimateDefenseEndurance(scaleDefenseModel(defenseModel, high), wall, attackModel, fulls);

        while (!meetsDefenseTarget(highEndurance, fulls, minFinalWall) && high < 1024) {
            high *= 2;
            highEndurance = estimateDefenseEndurance(scaleDefenseModel(defenseModel, high), wall, attackModel, fulls);
        }

        if (!meetsDefenseTarget(highEndurance, fulls, minFinalWall)) {
            return {
                ok: false,
                title: 'Calculo sem resultado',
                message: 'Mesmo com uma defesa muito grande, este modelo não chegou ao número de fulls e muralha restante requerida.'
            };
        }

        let low = 0;

        for (let i = 0; i < 28; i += 1) {
            const mid = (low + high) / 2;
            const midTroops = scaleDefenseModel(defenseModel, mid);
            const midEndurance = estimateDefenseEndurance(midTroops, wall, attackModel, fulls);

            if (meetsDefenseTarget(midEndurance, fulls, minFinalWall)) high = mid;
            else low = mid;
        }

        let troops = scaleDefenseModel(defenseModel, high);
        let endurance = estimateDefenseEndurance(troops, wall, attackModel, fulls);

        if (!meetsDefenseTarget(endurance, fulls, minFinalWall)) {
            high *= 1.01;
            troops = scaleDefenseModel(defenseModel, high);
            endurance = estimateDefenseEndurance(troops, wall, attackModel, fulls);
        }

        return {
            ok: true,
            factor: high,
            troops,
            endurance,
            simulations: includeSimulations === false ? [] : buildCalculatorSimulations(troops, wall, attackModel, fulls)
        };
    }

    function meetsDefenseTarget(endurance, fulls, minFinalWall) {
        return endurance.safeAttacks >= fulls && endurance.finalWall >= minFinalWall;
    }

    function scaleDefenseModel(model, factor) {
        const troops = {};

        APP.defenseModelUnits.forEach(function (unit) {
            const amount = parseAmount(model && model[unit]);
            if (amount > 0) troops[unit] = Math.ceil(amount * factor);
        });

        return troops;
    }

    function renderTroopAmountBadges(troops) {
        const html = APP.defenseModelUnits
            .filter(function (unit) {
                return parseAmount(troops && troops[unit]) > 0;
            })
            .map(function (unit) {
                return `
                    <span class="tpdef-calc-unit">
                        <img src="/graphic/unit/unit_${escapeAttr(unit)}.png" title="${escapeAttr(getUnitName(unit))}" alt="">
                        ${formatNumber(troops[unit])}
                    </span>
                `;
            })
            .join('');

        return html || '<span>Nenhuma tropa.</span>';
    }

    function formatFullAttackLabel(fulls) {
        return `${formatNumber(fulls)} ${fulls === 1 ? 'Full de Ataque' : 'Fulls de Ataque'}`;
    }

    function buildCalculatorSimulations(troops, wall, attackModel, fulls) {
        const rounds = [];
        let currentTroops = cloneTroops(troops);
        let currentWall = wall;

        for (let i = 1; i <= fulls; i += 1) {
            const round = buildCalculatorSimulationRound(currentTroops, currentWall, attackModel, i, fulls);
            rounds.push(round);
            currentTroops = cloneTroops(round.defender.remaining);
            currentWall = round.wallFinal;
        }

        return rounds;
    }

    function buildCalculatorSimulationRound(troops, wall, attackModel, index, totalFulls) {
        const attackTroops = cloneAttackTroops(attackModel);
        const defenderStart = cloneTroops(troops);
        const defenderAfter = cloneTroops(troops);
        const attack = calculateAttackModelPower(attackModel);
        const rams = parseAmount(attackModel && attackModel.units && attackModel.units.ram);
        const catapults = parseAmount(attackModel && attackModel.units && attackModel.units.catapult);
        const defensePower = calculateDefensePower(defenderAfter, attack.weights, wall);
        const survivesBattle = attack.total > 0 && defensePower / attack.total >= 1;
        const attackerLosses = {};
        const defenderLosses = {};
        let finalWall = wall;

        if (survivesBattle) {
            applyDefenderLosses(defenderAfter, estimateDefenderCasualtyRate(attack.total, defensePower));
            fillAllLosses(attackerLosses, attackTroops);
            fillLossDifference(defenderLosses, defenderStart, defenderAfter);
            finalWall = rams > 0 && hasTroops(defenderAfter)
                ? applyRamDamageAfterBattle(wall, estimateEffectiveRamsForWallDamage(rams, defensePower, attack.total))
                : applyRamDamageAfterBattle(
                    applyRamDamageAfterBattle(wall, rams),
                    estimateSurvivingRams(rams, defensePower, attack.total)
                );
        } else {
            fillLossesByRate(attackerLosses, attackTroops, estimateAttackerCasualtyRate(defensePower, attack.total));
            fillAllLosses(defenderLosses, defenderStart);
            clearTroops(defenderAfter);
            finalWall = rams > 0
                ? applyRamDamageAfterBattle(applyRamDamageAfterBattle(wall, rams), estimateSurvivingRams(rams, defensePower, attack.total))
                : wall;
        }

        if (!hasTroops(defenderAfter)) {
            finalWall = applyCatapultWallDamageAfterBattle(
                finalWall,
                estimateSurvivingAttackUnits(catapults, defensePower, attack.total),
                attackModel
            );
        }

        return {
            units: getCalculatorSimulationUnits(attackTroops, defenderStart),
            index,
            totalFulls,
            remainingFulls: Math.max(0, totalFulls - index),
            attacker: {
                units: attackTroops,
                losses: attackerLosses
            },
            defender: {
                units: defenderStart,
                losses: defenderLosses,
                remaining: defenderAfter
            },
            wallStart: wall,
            wallFinal: finalWall
        };
    }

    function renderCalculatorSimulation(simulations) {
        if (!simulations || !simulations.length) return '';
        const hasMultiple = simulations.length > 1;

        return `
            <div class="tpdef-calc-sim-wrap" data-current="0">
                <div class="tpdef-calc-sim-title">
                    <img src="/graphic/buildings/place.png" alt="" style="width:16px;height:16px;">
                    <span class="tpdef-calc-sim-title-text">Simulação por Full de Ataque</span>
                    ${hasMultiple ? `
                        <span class="tpdef-calc-sim-controls">
                            <input type="button" class="btn tpdef-calc-sim-prev" value="<">
                            <input type="button" class="btn tpdef-calc-sim-next" value="Seguinte">
                        </span>
                    ` : ''}
                </div>
                ${simulations.map(function (simulation, index) {
                    return renderCalculatorSimulationRound(simulation, index);
                }).join('')}
            </div>
        `;
    }

    function renderCalculatorSimulationRound(simulation, index) {
        return `
            <div class="tpdef-calc-sim-round" data-index="${index}" ${index > 0 ? 'hidden' : ''}>
                <div class="tpdef-calc-meta">
                    Full de Ataque ${simulation.index}/${simulation.totalFulls}; restam ${simulation.remainingFulls}. Nível de muralha antes: ${simulation.wallStart}/20.
                </div>
                <table class="tpdef-calc-sim">
                    <tr>
                        <th colspan="2"></th>
                        ${simulation.units.map(function (unit) {
                            return `<th><img src="/graphic/unit/unit_${escapeAttr(unit)}.png" title="${escapeAttr(getUnitName(unit))}" alt=""></th>`;
                        }).join('')}
                    </tr>
                    ${renderSimulationSideRows('Atacante', simulation.attacker, simulation.units)}
                    ${renderSimulationSideRows('Defensor', simulation.defender, simulation.units)}
                </table>
                <div class="tpdef-calc-ram-damage">
                    Dano na muralha: foi danificada do nível ${simulation.wallStart} para o nível ${simulation.wallFinal}.
                </div>
            </div>
        `;
    }

    function bindCalculatorSimulationControls() {
        const wrap = $('#tpdefDefenseCalculatorResult .tpdef-calc-sim-wrap');
        if (!wrap.length) return;

        wrap.find('.tpdef-calc-sim-prev, .tpdef-calc-sim-next').off('click.tpdef').on('click.tpdef', function () {
            const rounds = wrap.find('.tpdef-calc-sim-round');
            const current = parseAmount(wrap.attr('data-current'));
            const direction = $(this).hasClass('tpdef-calc-sim-next') ? 1 : -1;
            const next = clamp(current + direction, 0, rounds.length - 1);

            wrap.attr('data-current', next);
            rounds.attr('hidden', true).eq(next).removeAttr('hidden');
            wrap.find('.tpdef-calc-sim-prev').prop('disabled', next <= 0);
            wrap.find('.tpdef-calc-sim-next').prop('disabled', next >= rounds.length - 1);
        });

        wrap.find('.tpdef-calc-sim-prev').prop('disabled', true);
        wrap.find('.tpdef-calc-sim-next').prop('disabled', wrap.find('.tpdef-calc-sim-round').length <= 1);
    }

    function renderSimulationSideRows(label, side, units) {
        const hasRemaining = side.remaining && Object.keys(side.remaining).length > 0;

        return `
            <tr>
                <td rowspan="${hasRemaining ? 3 : 2}" class="tpdef-calc-sim-side">${label}</td>
                <td class="tpdef-calc-sim-label">Unidades:</td>
                ${renderSimulationAmountCells(side.units, units, '')}
            </tr>
            <tr>
                <td class="tpdef-calc-sim-label">Baixas:</td>
                ${renderSimulationAmountCells(side.losses, units, 'tpdef-calc-sim-loss')}
            </tr>
            ${hasRemaining ? `
                <tr>
                    <td class="tpdef-calc-sim-label">Restam:</td>
                    ${renderSimulationAmountCells(side.remaining, units, 'tpdef-calc-sim-remaining')}
                </tr>
            ` : ''}
        `;
    }

    function renderSimulationAmountCells(amounts, units, className) {
        return units.map(function (unit) {
            const amount = parseAmount(amounts && amounts[unit]);
            return `<td class="${className}">${amount > 0 ? formatNumber(amount) : '0'}</td>`;
        }).join('');
    }

    function cloneAttackTroops(attackModel) {
        const troops = {};
        const units = attackModel && attackModel.units ? attackModel.units : {};

        APP.attackModelUnits.forEach(function (unit) {
            const amount = parseAmount(units[unit]);
            if (amount > 0) troops[unit] = amount;
        });

        return troops;
    }

    function getCalculatorSimulationUnits(attacker, defender) {
        return ['spear', 'sword', 'axe', 'archer', 'light', 'heavy', 'ram', 'catapult', 'knight', 'snob'];
    }

    function fillAllLosses(target, troops) {
        Object.keys(troops || {}).forEach(function (unit) {
            const amount = parseAmount(troops[unit]);
            if (amount > 0) target[unit] = amount;
        });

        return target;
    }

    function fillLossDifference(target, before, after) {
        Object.keys(before || {}).forEach(function (unit) {
            const losses = parseAmount(before[unit]) - parseAmount(after && after[unit]);
            if (losses > 0) target[unit] = losses;
        });

        return target;
    }

    function fillLossesByRate(target, troops, rate) {
        Object.keys(troops || {}).forEach(function (unit) {
            const amount = parseAmount(troops[unit]);
            if (amount > 0) target[unit] = Math.min(amount, Math.round(amount * rate));
        });

        return target;
    }

    function estimateAttackerCasualtyRate(defensePower, attackPower) {
        if (attackPower <= 0 || defensePower <= 0) return 0;

        return clamp(Math.pow(defensePower / attackPower, 1.15), 0, 1);
    }

    function formatFactor(value) {
        const rounded = Math.ceil(value * 100) / 100;
        return String(rounded).replace('.', ',');
    }

    function applyAttackPreset(name) {
        const preset = APP.attackPresets[name];
        if (!preset) return;

        $('.tpdef-attack-model-input').each(function () {
            const input = $(this);
            const unit = String(input.data('unit') || '');
            input.val(preset[unit] || 0);
        });

        updateModelPopulation('.tpdef-attack-model-input', '#tpdefAttackModelPop');
    }

    function applyDefensePreset(name) {
        const preset = APP.defensePresets[name];
        if (!preset) return;

        $('.tpdef-defense-model-input').each(function () {
            const input = $(this);
            const unit = String(input.data('unit') || '');
            input.val(preset[unit] || 0);
        });

        updateModelPopulation('.tpdef-defense-model-input', '#tpdefDefenseModelPop');
    }

    function closeDialog(id) {
        if (window.Dialog && typeof Dialog.close === 'function') {
            Dialog.close(id);
        }
    }

    function getUnitName(unit) {
        const names = {
            spear: 'Lanceiros',
            sword: 'Espadachins',
            axe: 'Vikings',
            archer: 'Arqueiros',
            spy: 'Batedores',
            light: 'Cavalaria leve',
            marcher: 'Arqueiros a cavalo',
            heavy: 'Cavalaria pesada',
            ram: 'Arietes',
            catapult: 'Catapultas',
            knight: 'Paladino',
            snob: 'Nobres'
        };

        return names[unit] || unit;
    }

    function getDefenseAgainstAttackModel(troops, wall, model, incomingInfo, supportTroops) {
        if (!hasAttackModel(model)) {
            const supportForecast = hasTroops(supportTroops)
                ? {
                    troops: cloneTroops(supportTroops),
                    capacity: 'define o modelo de ataque'
                }
                : null;

            return {
                text: 'Sem modelo',
                color: '#a66a00',
                highlight: 'Modelo por definir',
                attackCounter: '',
                defenseCounter: '',
                attackCounterLabel: '',
                attackCounterValue: '',
                defenseCounterLabel: '',
                defenseCounterValue: '',
                note: 'Modelo de ataque por definir',
                subnote: 'Usa Modelo ataque para guardar o ataque base.',
                extra: '',
                shortage: '',
                supportForecast,
                icon: '/graphic/command/attack.png'
            };
        }

        const incoming = normalizeIncomingInfo(incomingInfo);
        const hasIncoming = incoming.count > 0;
        const fullTarget = 100;
        const targetCount = hasIncoming ? incoming.count : fullTarget;
        const endurance = estimateDefenseEndurance(troops, wall, model, targetCount);
        const fullEndurance = hasIncoming
            ? estimateDefenseEndurance(troops, wall, model, fullTarget)
            : endurance;
        const supportEndurance = hasTroops(supportTroops)
            ? estimateDefenseEndurance(mergeTroops(troops, supportTroops), wall, model, targetCount)
            : null;
        const supportFullEndurance = hasTroops(supportTroops)
            ? estimateDefenseEndurance(mergeTroops(troops, supportTroops), wall, model, fullTarget)
            : null;
        const countedEndurance = supportEndurance || endurance;
        const countedFullEndurance = supportFullEndurance || fullEndurance;
        const safeCount = countedEndurance.safeAttacks;
        const currentFullsText = formatFullCapacity(fullEndurance, fullTarget);
        const supportFullsText = supportFullEndurance
            ? formatFullCapacity(supportFullEndurance, fullTarget)
            : '';
        const incomingDetail = incoming.ariete > 0
            ? `Arietes nomeados: ${incoming.ariete}/${incoming.total}.`
            : incoming.total > 0
                ? `Ataques a chegar: ${incoming.total}; nenhum com "ariete" no nome.`
                : '';
        const subnote = '';
        const projectedTroops = supportFullEndurance ? mergeTroops(troops, supportTroops) : troops;
        const shortage = getDefenseRequirementSuggestion(projectedTroops, wall, model, incoming);
        const attackCounterValue = hasIncoming ? incoming.count : 0;
        const defenseCounterValue = currentFullsText;
        const attackCounter = `Fulls a Chegar: ${attackCounterValue}`;
        const defenseCounter = `Fulls que a aldeia aguenta: ${defenseCounterValue}`;
        const highlight = hasIncoming
            ? attackCounter
            : defenseCounter;
        const extraParts = [];
        if (incomingDetail) extraParts.push(incomingDetail);
        if (isNightBonusApplied()) extraParts.push('Bonus nocturno ativo: defesa x2.');
        const extra = extraParts.join(' ');
        const supportForecast = supportFullEndurance
            ? {
                troops: cloneTroops(supportTroops),
                capacity: `${supportFullsText} fulls`
            }
            : null;

        if ((hasIncoming && safeCount >= incoming.count) || (!hasIncoming && countedFullEndurance.safeAttacks >= 10)) {
            return {
                text: 'Bunkada',
                color: '#237a3b',
                highlight,
                attackCounter,
                defenseCounter,
                attackCounterLabel: 'Fulls a Chegar',
                attackCounterValue,
                defenseCounterLabel: 'Fulls que a aldeia aguenta',
                defenseCounterValue,
                note: hasIncoming ? 'Aguenta os ataques do modelo' : 'Aguenta varios fulls do modelo',
                subnote,
                extra,
                shortage,
                supportForecast,
                icon: '/graphic/command/support.png'
            };
        }

        if ((hasIncoming && safeCount >= Math.ceil(incoming.count / 2)) || (!hasIncoming && countedFullEndurance.safeAttacks >= 5)) {
            return {
                text: 'Meio bunk',
                color: '#a66a00',
                highlight,
                attackCounter,
                defenseCounter,
                attackCounterLabel: 'Fulls a Chegar',
                attackCounterValue,
                defenseCounterLabel: 'Fulls que a aldeia aguenta',
                defenseCounterValue,
                note: hasIncoming ? 'Aguenta parte dos ataques' : 'Aguenta alguns fulls do modelo',
                subnote,
                extra,
                shortage,
                supportForecast,
                icon: '/graphic/unit/unit_heavy.png'
            };
        }

        return {
            text: 'Escasso',
            color: '#b7332c',
            highlight,
            attackCounter,
            defenseCounter,
            attackCounterLabel: 'Fulls a Chegar',
            attackCounterValue,
            defenseCounterLabel: 'Fulls que a aldeia aguenta',
            defenseCounterValue,
            note: 'Precisa de apoio',
            subnote,
            extra,
            shortage,
            supportForecast,
            icon: '/graphic/command/attack.png'
        };
    }

    function getNoIncomingProjectionCount(endurance, fullTarget) {
        return Math.max(1, Math.min(parseAmount(endurance && endurance.safeAttacks) || 1, fullTarget));
    }

    function normalizeIncomingInfo(value) {
        if (typeof value === 'number') {
            return {count: value, total: value, ariete: 0, source: 'legacy'};
        }

        const totalRaw = parseAmount(value && value.total);
        const ariete = parseAmount(value && value.ariete);
        const count = parseAmount(value && value.count) || ariete || totalRaw;
        const total = Math.max(totalRaw, ariete, count);

        return {
            count,
            total,
            ariete,
            source: value && value.source || 'unknown'
        };
    }

    function calculateAttackModelPower(model) {
        const byType = {infantry: 0, cavalry: 0, archer: 0};
        const units = model && model.units ? model.units : {};
        let total = 0;

        APP.attackModelUnits.forEach(function (unit) {
            const stats = APP.unitStats[unit];
            const amount = parseAmount(units[unit]);
            if (!stats || amount <= 0) return;

            const power = amount * stats.attack;
            const type = stats.type || 'infantry';
            byType[type] = (byType[type] || 0) + power;
            total += power;
        });

        return {
            total,
            byType,
            weights: {
                infantry: total ? byType.infantry / total : 1,
                cavalry: total ? byType.cavalry / total : 0,
                archer: total ? byType.archer / total : 0
            }
        };
    }

    function calculateDefensePower(troops, weights, wall) {
        const baseDefense = Object.keys(troops || {}).reduce(function (sum, unit) {
            const stats = APP.unitStats[unit];
            const amount = parseAmount(troops[unit]);
            if (!stats || amount <= 0 || isExcludedModelUnit(unit)) return sum;

            return sum + amount * getUnitWeightedDefense(unit, weights);
        }, 0);

        return baseDefense * getDefenseMultiplier(wall);
    }

    function getUnitWeightedDefense(unit, weights) {
        const stats = APP.unitStats[unit];
        const defense = stats && stats.defense || {};

        return (
            (defense.infantry || 0) * (weights.infantry || 0) +
            (defense.cavalry || 0) * (weights.cavalry || 0) +
            (defense.archer || 0) * (weights.archer || 0)
        );
    }

    function estimateDefenseEndurance(troops, wall, model, incomingCount) {
        const attack = calculateAttackModelPower(model);
        const rams = parseAmount(model && model.units && model.units.ram);
        const currentTroops = cloneTroops(troops);
        let currentWall = Math.max(0, Math.min(20, wall));
        let wallAfterSafeAttacks = Math.round(currentWall);
        let safeAttacks = 0;

        if (attack.total <= 0) {
            return {
                safeAttacks: 0,
                finalWall: Math.round(currentWall),
                wallAfterSafeAttacks
            };
        }

        for (let i = 0; i < incomingCount; i += 1) {
            const defensePower = calculateDefensePower(currentTroops, attack.weights, currentWall);
            const ratio = attack.total > 0 ? defensePower / attack.total : 0;
            const survivesBattle = ratio >= 1;
            let defenderSurvived = false;

            if (survivesBattle) {
                applyDefenderLosses(currentTroops, estimateDefenderCasualtyRate(attack.total, defensePower));
                defenderSurvived = hasTroops(currentTroops);
            }

            if (defenderSurvived) {
                currentWall = rams > 0
                    ? applyRamDamageAfterBattle(currentWall, estimateEffectiveRamsForWallDamage(rams, defensePower, attack.total))
                    : currentWall;
                safeAttacks += 1;
                wallAfterSafeAttacks = Math.round(currentWall);
            } else {
                currentWall = rams > 0
                    ? applyRamDamageAfterBattle(
                        applyRamDamageAfterBattle(currentWall, rams),
                        estimateSurvivingRams(rams, defensePower, attack.total)
                    )
                    : currentWall;
                currentWall = applyCatapultWallDamageAfterBattle(
                    currentWall,
                    estimateSurvivingAttackUnits(parseAmount(model && model.units && model.units.catapult), defensePower, attack.total),
                    model
                );
                clearTroops(currentTroops);
            }
        }

        return {
            safeAttacks,
            finalWall: Math.round(currentWall),
            wallAfterSafeAttacks
        };
    }

    function estimateDefenderCasualtyRate(attackPower, defensePower) {
        if (attackPower <= 0 || defensePower <= 0) return 0;

        return clamp(Math.pow(attackPower / defensePower, 1.33), 0, 1);
    }

    function applyDefenderLosses(troops, rate) {
        if (rate <= 0) return troops;

        Object.keys(troops || {}).forEach(function (unit) {
            const amount = parseAmount(troops[unit]);
            if (amount <= 0) {
                delete troops[unit];
                return;
            }

            const losses = Math.min(amount, Math.round(amount * rate));
            troops[unit] = amount - losses;

            if (troops[unit] <= 0) delete troops[unit];
        });

        return troops;
    }

    function clearTroops(troops) {
        Object.keys(troops || {}).forEach(function (unit) {
            delete troops[unit];
        });

        return troops;
    }

    function applyRamDamageAfterBattle(wall, survivingRams) {
        const level = Math.max(0, Math.min(20, wall));

        return Math.max(0, level - estimateRamWallLevelDrop(level, survivingRams, level));
    }

    function estimateRamWallLevelDrop(wall, rams, maxDrop) {
        if (wall <= 0 || rams <= 0 || maxDrop <= 0) return 0;

        const rawDrop = (rams / 4) * 0.9 * Math.pow(1.09, -wall);
        return clamp(Math.round(rawDrop), 0, maxDrop);
    }

    function estimateEffectiveRamsForWallDamage(rams, defensePower, attackPower) {
        if (rams <= 0 || defensePower <= 0 || attackPower <= 0) return Math.max(0, rams);

        const defenseRatio = defensePower / attackPower;
        const fullDamageRatio = 1.42;

        if (defenseRatio <= fullDamageRatio) return rams;

        return Math.max(0, Math.round(rams * Math.pow(fullDamageRatio / defenseRatio, 1.6)));
    }

    function applyCatapultWallDamageAfterBattle(wall, survivingCatapults, attackModel) {
        if (!attackModel || attackModel.catapultWall !== true) return wall;

        const level = Math.max(0, Math.min(20, wall));
        return Math.max(0, level - estimateCatapultWallLevelDrop(level, survivingCatapults, level));
    }

    function estimateCatapultWallLevelDrop(wall, catapults, maxDrop) {
        if (wall <= 0 || catapults <= 0 || maxDrop <= 0) return 0;

        const rawDrop = (catapults / 8) * Math.pow(1.05, -wall);
        return clamp(Math.round(rawDrop), 0, maxDrop);
    }

    function estimateSurvivingRams(rams, defensePower, attackPower) {
        return estimateSurvivingAttackUnits(rams, defensePower, attackPower);
    }

    function estimateSurvivingAttackUnits(amount, defensePower, attackPower) {
        if (amount <= 0 || attackPower <= 0) return 0;

        const lossRate = clamp(Math.pow(defensePower / attackPower, 1.15), 0, 1);
        return Math.max(0, Math.round(amount * (1 - lossRate)));
    }

    function getDefenseRequirementSuggestion(troops, wall, model, incomingInfo) {
        const incoming = normalizeIncomingInfo(incomingInfo);
        const targetFulls = Math.max(1, parseAmount(incoming.count));
        const defenseModel = loadDefenseModel();

        if (hasDefenseModel(defenseModel)) {
            const result = calculateRequiredDefenseForFulls(targetFulls, wall, 0, model, defenseModel, false);

            if (result.ok) {
                return renderDefenseRequirementSuggestion(targetFulls, result);
            }
        }

        return getDefenseShortageSuggestion(troops, wall, model, targetFulls);
    }

    function renderDefenseRequirementSuggestion(fulls, result) {
        return `
            <span class="tpdef-defense-shortage-title">Necessário p/ ${formatFullTargetShort(fulls)}:</span>
            <span class="tpdef-shortage-units">${renderDefenseRequirementUnits(result.troops)}</span>
            <span class="tpdef-shortage-wall">
                <img src="/graphic/buildings/wall.png" title="Muralha restante" alt="">Muralha restante ${result.endurance.finalWall}/20
            </span>
        `;
    }

    function renderDefenseRequirementUnits(troops) {
        const entries = APP.defenseModelUnits
            .filter(function (unit) {
                return parseAmount(troops && troops[unit]) > 0;
            })
            .map(function (unit) {
                return `
                    <span class="tpdef-shortage-unit">
                        <img src="/graphic/unit/unit_${escapeAttr(unit)}.png" title="${escapeAttr(getUnitName(unit))}" alt="">${formatNumber(troops[unit])}
                    </span>
                `;
            })
            .join('');

        return entries || '<span class="tpdef-shortage-unit">Sem tropas sugeridas.</span>';
    }

    function formatFullTargetShort(fulls) {
        return `${formatNumber(fulls)} ${fulls === 1 ? 'full' : 'fulls'}`;
    }

    function getDefenseShortageSuggestion(troops, wall, model, targetFulls) {
        const attack = calculateAttackModelPower(model);
        const currentDefense = calculateDefensePower(troops, attack.weights, wall);
        const missingPower = attack.total - currentDefense;

        if (missingPower <= 0) return '';

        const defenseModel = loadDefenseModel();

        if (hasDefenseModel(defenseModel)) {
            return getDefenseModelShortageSuggestion(defenseModel, wall, attack.weights, missingPower, targetFulls);
        }

        const wallMultiplier = getDefenseMultiplier(wall);
        const options = getDefenseSuggestionUnits()
            .map(function (unit) {
                const unitDefense = getUnitWeightedDefense(unit, attack.weights) * wallMultiplier;
                if (unitDefense <= 0) return null;

                return {
                    unit,
                    amount: Math.ceil(missingPower / unitDefense),
                    pop: Math.ceil((missingPower / unitDefense) * (APP.troopPop[unit] || 0))
                };
            })
            .filter(Boolean)
            .sort(function (a, b) {
                return a.pop - b.pop || a.amount - b.amount;
            })
            .slice(0, 2);

        if (!options.length) return '';

        return `
            <span class="tpdef-defense-shortage-title">Necessário p/ ${formatFullTargetShort(targetFulls || 1)}:</span>
            <span class="tpdef-shortage-units">${options.map(function (option) {
                return `
                    <span class="tpdef-shortage-unit">
                        <img src="/graphic/unit/unit_${escapeAttr(option.unit)}.png" title="${escapeAttr(getUnitName(option.unit))}" alt="">${formatNumber(option.amount)}
                    </span>
                `;
            }).join('<span class="tpdef-shortage-or">ou</span>')}</span>
        `;
    }

    function getDefenseModelShortageSuggestion(defenseModel, wall, weights, missingPower, targetFulls) {
        const wallMultiplier = getDefenseMultiplier(wall);
        const modelPower = Object.keys(defenseModel).reduce(function (sum, unit) {
            return sum + parseAmount(defenseModel[unit]) * getUnitWeightedDefense(unit, weights) * wallMultiplier;
        }, 0);

        if (modelPower <= 0) return '';

        const packs = Math.max(1, Math.ceil(missingPower / modelPower));
        const entries = Object.keys(defenseModel)
            .filter(function (unit) {
                return parseAmount(defenseModel[unit]) > 0;
            })
            .map(function (unit) {
                const amount = parseAmount(defenseModel[unit]) * packs;
                return `
                    <span class="tpdef-shortage-unit">
                        <img src="/graphic/unit/unit_${escapeAttr(unit)}.png" title="${escapeAttr(getUnitName(unit))}" alt="">${formatNumber(amount)}
                    </span>
                `;
            })
            .join('');

        return `
            <span class="tpdef-defense-shortage-title">Necessário p/ ${formatFullTargetShort(targetFulls || 1)}:</span>
            <span class="tpdef-shortage-units">${entries}</span>
        `;
    }

    function getDefenseSuggestionUnits() {
        const gameUnits = game_data.units && game_data.units.length ? game_data.units : Object.keys(APP.unitStats);
        const units = ['spear', 'sword', 'archer', 'heavy'];

        return units.filter(function (unit) {
            return gameUnits.includes(unit) && APP.unitStats[unit];
        });
    }

    function getUnitShortName(unit) {
        const names = {
            spear: 'lanceiros',
            sword: 'espadas',
            archer: 'arqueiros',
            heavy: 'pesadas'
        };

        return names[unit] || getUnitName(unit).toLowerCase();
    }

    function formatFullCapacity(endurance, targetCount) {
        return endurance.safeAttacks >= targetCount && endurance.finalWall > 0
            ? `${targetCount}+`
            : String(endurance.safeAttacks);
    }

    function hasTroops(troops) {
        return Object.keys(troops || {}).some(function (unit) {
            return parseAmount(troops[unit]) > 0;
        });
    }

    function calculateTroopPopulation(troops) {
        return Object.keys(troops || {}).reduce(function (sum, unit) {
            return sum + parseAmount(troops[unit]) * (APP.troopPop[unit] || 0);
        }, 0);
    }

    function mergeTroops(base, extra) {
        const merged = cloneTroops(base);
        addTroops(merged, extra);
        return merged;
    }

    function cloneTroops(troops) {
        const clone = {};
        Object.keys(troops || {}).forEach(function (unit) {
            const amount = parseAmount(troops[unit]);
            if (amount > 0) clone[unit] = amount;
        });
        return clone;
    }

    function addTroops(target, extra) {
        Object.keys(extra || {}).forEach(function (unit) {
            const amount = parseAmount(extra[unit]);
            if (amount > 0) target[unit] = (target[unit] || 0) + amount;
        });
        return target;
    }

    function getWallDefenseMultiplier(wall) {
        const level = Math.max(0, Math.min(20, wall));
        return Math.pow(1.037, level);
    }

    function getDefenseMultiplier(wall) {
        return getWallDefenseMultiplier(wall) * getNightBonusDefenseMultiplier();
    }

    function getNightBonusDefenseMultiplier() {
        return isNightBonusApplied() ? 2 : 1;
    }

    function isNightBonusApplied() {
        if (!settings.combat || !settings.combat.nightBonusAuto) return false;

        const now = Date.now();
        if (now - state.nightBonusCache.loadedAt < 15000) {
            return state.nightBonusCache.value;
        }

        state.nightBonusCache.value = detectNightBonusActive();
        state.nightBonusCache.loadedAt = now;

        return state.nightBonusCache.value;
    }

    function detectNightBonusActive() {
        if (getNightBonusFlagFromGameData()) return true;
        if (getNightBonusFromWorldConfig()) return true;

        return getNightBonusFromPage();
    }

    function getNightBonusFlagFromGameData() {
        const data = window.game_data || {};
        const flags = [
            data.night_bonus_active,
            data.nightBonusActive,
            data.is_night_bonus,
            data.isNightBonus,
            data.night_active,
            data.nightActive
        ];

        return flags.some(isTruthyFlag);
    }

    function getNightBonusFromWorldConfig() {
        const data = window.game_data || {};
        const config = data.world_config && (data.world_config.night || data.world_config.night_bonus);
        if (!config || typeof config !== 'object') return false;

        const currentFlags = [
            config.current,
            config.now,
            config.running,
            config.in_effect,
            config.active_now,
            config.is_active_now
        ];

        if (currentFlags.some(isTruthyFlag)) return true;

        const start = firstDefined(config.start_hour, config.start, config.from, config.begin, config.start_time);
        const end = firstDefined(config.end_hour, config.end, config.to, config.finish, config.end_time);
        const startMinutes = parseTimeMinutes(start);
        const endMinutes = parseTimeMinutes(end);
        const nowMinutes = getServerTimeMinutes();

        if (startMinutes === null || endMinutes === null || nowMinutes === null) return false;

        return isTimeInsideRange(nowMinutes, startMinutes, endMinutes);
    }

    function getNightBonusFromPage() {
        const text = clean(getNightBonusProbeText());
        if (!/\bbonus\s+(noturno|nocturno)\b/.test(text)) return false;
        if (/\b(desativado|desactivado|inativo|inactiva|inactive|off)\b/.test(text)) return false;

        return true;
    }

    function getNightBonusProbeText() {
        const roots = [
            '#server_info',
            '#header_info',
            '#topContainer',
            '#menu_row',
            '#content_value'
        ];
        const pieces = [];
        const seen = new Set();

        roots.forEach(function (selector) {
            if (selector === '#content_value' && String(game_data.screen || '') === 'map') return;

            const element = document.querySelector(selector);
            if (!element || seen.has(element)) return;
            seen.add(element);

            const clone = element.cloneNode(true);
            $(clone).find('[id^="tpdef"], [id^="tpDef"], [class*="tpdef-"], #map_popup, .popup_box').remove();
            pieces.push($(clone).text());
            $(clone).find('img[title], img[alt]').each(function () {
                pieces.push($(this).attr('title') || '');
                pieces.push($(this).attr('alt') || '');
            });
        });

        return pieces.join(' ');
    }

    function getServerTimeMinutes() {
        const data = window.game_data || {};

        if (typeof data.server_time === 'number') {
            const date = new Date(data.server_time * 1000);
            if (!Number.isNaN(date.getTime())) return date.getHours() * 60 + date.getMinutes();
        }

        const text = [
            $('#serverTime').text(),
            $('#server_time').text(),
            $('.server_time:first').text(),
            $('#serverDate').text()
        ].join(' ');

        return parseTimeMinutes(text);
    }

    function parseTimeMinutes(value) {
        if (value === undefined || value === null || value === '') return null;

        if (typeof value === 'number' && Number.isFinite(value)) {
            if (value >= 0 && value <= 24) return Math.round(value * 60) % 1440;
            if (value >= 0 && value < 1440) return Math.round(value);
            return null;
        }

        const text = String(value);
        const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\b/);
        if (!match) return null;

        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2] || '0', 10);
        if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null;

        return ((hours % 24) * 60 + minutes) % 1440;
    }

    function isTimeInsideRange(nowMinutes, startMinutes, endMinutes) {
        if (startMinutes === endMinutes) return false;
        if (startMinutes < endMinutes) return nowMinutes >= startMinutes && nowMinutes < endMinutes;

        return nowMinutes >= startMinutes || nowMinutes < endMinutes;
    }

    function firstDefined() {
        for (let i = 0; i < arguments.length; i += 1) {
            if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i];
        }

        return null;
    }

    function isTruthyFlag(value) {
        return value === true || value === 1 || value === '1' || value === 'true' || value === 'active' || value === 'on';
    }

    function getResistanceLevel(pop, wall) {
        if (wall < 20 && pop < 60000) {
            return {
                color: '#b7332c',
                note: 'Precisa de apoio',
                icon: '/graphic/command/attack.png'
            };
        }

        if (wall < 20) {
            return {
                color: '#a66a00',
                note: 'Muralha abaixo de 20',
                icon: '/graphic/buildings/wall.png'
            };
        }

        if (pop >= 110000) {
            return {
                color: '#237a3b',
                note: 'Aldeia bem defendida',
                icon: '/graphic/command/support.png'
            };
        }

        if (pop >= 60000) {
            return {
                color: '#1f5f9c',
                note: 'Defesa razoavel',
                icon: '/graphic/unit/unit_heavy.png'
            };
        }

        return {
            color: '#b7332c',
            note: 'Precisa de apoio',
            icon: '/graphic/command/attack.png'
        };
    }

    function buildSimpleSimulatorUrl(troops, wall, attackModel) {
        let url = `${game_data.link_base_pure}place&mode=sim&simulate&def_wall=${encodeURIComponent(wall)}`;

        Object.keys(troops).forEach(function (unit) {
            if (isExcludedModelUnit(unit)) return;
            url += `&def_${encodeURIComponent(unit)}=${encodeURIComponent(troops[unit])}`;
        });

        const units = attackModel && attackModel.units ? attackModel.units : {};

        APP.attackModelUnits.forEach(function (unit) {
            if (parseAmount(units[unit]) > 0) {
                url += `&att_${encodeURIComponent(unit)}=${encodeURIComponent(units[unit])}`;
            }
        });

        if (attackModel && attackModel.catapultWall === true) {
            url += '&building=wall';
        }

        if (isNightBonusApplied()) {
            url += '&night=on';
        }

        return url;
    }

    function isExcludedModelUnit(unit) {
        return ['knight'].includes(String(unit || ''));
    }

    function updateTabWithNextIncoming(table) {
        const timer = table.find('.timer:first');
        if (!timer.length || !window.TribalWars) return;

        function refreshTitle() {
            const value = $.trim(timer.text());
            if (value) document.title = `[${value}] ${state.originalTitle}`;
        }

        refreshTitle();
        $(window.TribalWars).off('global_tick.tpdefTab').on('global_tick.tpdefTab', refreshTitle);
    }

    function getRowCoords(row, index) {
        const cell = index >= 0 ? row.children('td,th').eq(index) : row;
        const text = cell.length ? cell.text() : row.text();
        const match = text.match(/\b\d{1,3}\|\d{1,3}\b/);
        return match ? match[0] : null;
    }

    function parseAmount(value) {
        const text = String(value === undefined || value === null ? '' : value).replace(/[^\d-]/g, '');
        const amount = parseInt(text, 10);
        return Number.isFinite(amount) ? amount : 0;
    }

    function parseFirstAmount(value) {
        const match = String(value === undefined || value === null ? '' : value).match(/-?\d[\d.]*/);
        if (!match) return 0;
        return parseAmount(match[0]);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(value) {
        return escapeHtml(value);
    }

    function clean(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function log(message) {
        if (window.console && typeof console.log === 'function') {
            console.log(`[${APP.name}]`, message);
        }
    }

    boot();
})();
