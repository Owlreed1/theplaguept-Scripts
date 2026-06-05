// ==UserScript==
// @name         TW PT - Conquistas do Mundo ThePlaguePT
// @namespace    theplaguept.tw.conquistas-mundo
// @version      1.0.33
// @description  Painel de conquistas do mundo por jogador, tribo, aldeia e hora.
// @author       ThePlaguePT
// @match        https://*.tribalwars.com.pt/game.php*
// @include      *://*.tribalwars.com.pt/game.php*
// @homepageURL  https://github.com/ThePlaguePT/TribalWars-Scripts
// @supportURL   https://github.com/ThePlaguePT/TribalWars-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW_PT_Conquistas_Mundo_ThePlaguePT.user.js
// @downloadURL  https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW_PT_Conquistas_Mundo_ThePlaguePT.user.js
// @grant        none
// @run-at       document-idle
// @icon         https://i.imgur.com/TpUuNvL.png
// ==/UserScript==

(() => {
    "use strict";

    if (window.top !== window.self) return;
    if (!/\.tribalwars\.com\.pt$/i.test(window.location.hostname)) return;

    const APP = {
        id: "tpconq",
        version: "1.0.33",
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
        mapButtonForceMarkers: false,
        panelSettingsDraft: null,
        memoryCache: new Map(),
    };

    function init() {
        injectStyle();
        createLauncher();
        ensureMapLoadButton();
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && state.panel && !state.panel.classList.contains(`${APP.id}-hidden`)) {
                closePanel();
            }
        });
        window.setInterval(() => {
            ensureMapLoadButton();
            if (state.rows.length && markMapEnabled()) scheduleMapMarkers(0);
        }, 3000);
    }

    function injectStyle() {
        if (document.getElementById(`${APP.id}-style`)) return;
        const style = document.createElement("style");
        style.id = `${APP.id}-style`;
        style.textContent = `
            #${APP.id}-launcher {
                position: fixed;
                right: 14px;
                bottom: 18px;
                z-index: 20000;
                height: 28px;
                min-width: 94px;
                border: 1px solid #4f120f;
                border-radius: 2px;
                background: linear-gradient(to bottom, #b33a34, #8f2420 55%, #681611);
                box-shadow: inset 0 1px 0 rgba(255,255,255,.35), inset 0 -1px 0 rgba(0,0,0,.35), 0 2px 5px rgba(0,0,0,.45);
                color: #fff;
                font: bold 12px Verdana, Arial, sans-serif;
                text-shadow: 1px 1px 1px #000;
                padding: 0 10px;
                cursor: pointer;
            }
            #${APP.id}-launcher:hover {
                background: linear-gradient(to bottom, #c4473e, #a02c27 55%, #7e1c17);
            }
            #${APP.id}-panel,
            #${APP.id}-panel * {
                box-sizing: border-box;
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
                z-index: 20002 !important;
                overflow: visible !important;
            }
            .popup_box:has(.${APP.id}-shell),
            [id^="popup_box_"]:has(.${APP.id}-shell) {
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
                overflow: visible !important;
            }
            #popup_box_${APP.dialogId} .popup_box_content,
            #popup_box_${APP.dialogId} .popup_box_content > div {
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                overflow-x: hidden !important;
                overflow-y: hidden !important;
            }
            #popup_box_${APP.dialogId} .${APP.id}-frame {
                width: 100% !important;
                max-width: 100% !important;
            }
            #popup_box_${APP.dialogId} .${APP.id}-shell {
                width: 100% !important;
                max-width: 100% !important;
            }
            #${APP.id}-panel {
                position: fixed;
                z-index: 20001;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: min(1320px, calc(100vw - 24px));
                max-width: calc(100vw - 24px);
                max-height: calc(100vh - 18px);
                box-sizing: border-box;
                overflow: visible;
                margin: 0;
                padding: 0;
                background: transparent;
                border: 0;
                border-radius: 0;
                color: #3b1607;
                font-family: Arial, Verdana, sans-serif;
            }
            #${APP.id}-panel.${APP.id}-hidden { display: none; }
            .${APP.id}-shell {
                position: relative;
                width: min(1260px, calc(100vw - 72px));
                max-width: 100%;
                min-width: 0;
                margin: 0 auto;
                padding: 0;
                overflow: visible;
            }
            .${APP.id}-frame {
                position: relative;
                z-index: 1;
                display: flex;
                flex-direction: column;
                width: 100%;
                max-width: 100%;
                min-width: 0;
                max-height: calc(100vh - 42px);
                border: 2px solid #7e211c;
                border-radius: 4px;
                background: #f4e4b8;
                color: #3b2508;
                overflow: hidden;
            }
            .${APP.id}-head {
                padding: 9px 14px 8px;
                background: linear-gradient(to bottom, #f7e8c1 0%, #edd49a 100%);
                border-bottom: 1px solid #c98c48;
            }
            .${APP.id}-head strong {
                display: block;
                color: #8f2b25;
                font-size: 16px;
                line-height: 20px;
                font-weight: bold;
            }
            .${APP.id}-head span {
                display: block;
                margin-top: 2px;
                color: #5e3b16;
                font-size: 12px;
                line-height: 15px;
            }
            .${APP.id}-head span span {
                display: inline;
                margin-top: 0;
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
                cursor: pointer;
                font-family: Verdana, Arial, sans-serif;
                font-size: 18px;
                font-weight: 700;
                text-align: center;
                box-shadow: 0 1px 3px rgba(0,0,0,.5);
            }
            .${APP.id}-close:hover {
                background: #ffe0a0;
            }
            .${APP.id}-body {
                display: flex;
                flex-direction: column;
                min-height: 0;
                min-width: 0;
                padding: 6px 14px 8px;
                overflow: hidden;
            }
            .${APP.id}-section {
                display: grid;
                grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);
                gap: 8px 18px;
                min-width: 0;
                padding: 8px 0 9px 12px;
                background: transparent;
                border-top: 1px solid #d5b579;
                border-bottom: 0;
                border-left: 4px solid #9b6a2f;
            }
            .${APP.id}-section:first-child {
                border-top: 0;
            }
            .${APP.id}-section:last-child {
                padding-bottom: 0;
            }
            .${APP.id}-filters { border-left-color: #c72d2d; }
            .${APP.id}-settings-section { border-left-color: #8b48c8; }
            .${APP.id}-summary-section { border-left-color: #1f9ac5; }
            .${APP.id}-list-section {
                border-left-color: #e0a51d;
                min-height: 0;
            }
            .${APP.id}-list-section .${APP.id}-section-options {
                min-height: 0;
                overflow: hidden;
            }
            .${APP.id}-actions-section {
                border-left-color: #8a6424;
                border-bottom: 0;
            }
            .${APP.id}-section-title {
                margin: 0 0 3px;
                color: #8f2b25;
                font-size: 13px;
                line-height: 16px;
                font-weight: bold;
                text-transform: uppercase;
            }
            .${APP.id}-section-desc {
                margin: 2px 0 0;
                color: #5e3b16;
                font-size: 11px;
                line-height: 14px;
            }
            .${APP.id}-section-options {
                min-width: 0;
            }
            .${APP.id}-toolbar {
                display: grid;
                grid-template-columns: repeat(4, minmax(115px, 1fr));
                gap: 6px 7px;
            }
            .${APP.id}-field {
                display: flex;
                flex-direction: column;
                gap: 4px;
                min-width: 0;
            }
            .${APP.id}-field label {
                color: #111;
                font-size: 11px;
                font-weight: 700;
            }
            .${APP.id}-field input,
            .${APP.id}-field select {
                width: 100%;
                box-sizing: border-box;
                height: 28px;
                border: 1px solid #b57d2e;
                border-radius: 2px;
                background: #fff6d7;
                color: #241006;
                padding: 5px 7px;
                font: 11px Verdana, Arial, sans-serif;
                box-shadow: inset 0 1px 2px rgba(0,0,0,.12);
            }
            .${APP.id}-field input:focus,
            .${APP.id}-field select:focus {
                outline: 2px solid rgba(167,34,30,.25);
                border-color: #a7221e;
            }
            .${APP.id}-actions {
                display: grid;
                grid-template-columns: 150px minmax(150px, 1fr) minmax(150px, 1fr) minmax(120px, auto);
                align-items: start;
                gap: 8px 10px;
            }
            .${APP.id}-action-stack {
                display: grid;
                gap: 7px;
            }
            .${APP.id}-button {
                min-height: 32px;
                border: 1px solid #681511;
                border-radius: 3px;
                background: linear-gradient(to bottom, #b13a34, #922722 55%, #731914);
                color: #fff;
                cursor: pointer;
                font: bold 11px Verdana, Arial, sans-serif;
                padding: 6px 10px;
                text-shadow: 1px 1px 1px #000;
                box-shadow: inset 0 1px 0 rgba(255,255,255,.25), inset 0 -1px 0 rgba(0,0,0,.3);
                white-space: nowrap;
            }
            .${APP.id}-button:hover {
                background: linear-gradient(to bottom, #c4473e, #a02c27 55%, #7e1c17);
            }
            .${APP.id}-button.${APP.id}-brown {
                border-color: #4e2e1c;
                background: linear-gradient(to bottom, #7b543a, #5e3b28 55%, #442819);
            }
            .${APP.id}-button.${APP.id}-brown:hover {
                background: linear-gradient(to bottom, #8a6042, #6f4630 55%, #52301e);
            }
            .${APP.id}-button:disabled {
                opacity: .55;
                cursor: wait;
            }
            .${APP.id}-check {
                flex-direction: row;
                align-items: center;
                gap: 6px;
                color: #111;
                font-weight: 700;
                min-height: 32px;
            }
            .${APP.id}-check input {
                width: auto;
                height: auto;
                margin: 0;
                accent-color: #d9152f;
            }
            .${APP.id}-config-list {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                column-gap: 18px;
                gap: 0;
            }
            .${APP.id}-config-row {
                display: grid;
                grid-template-columns: 18px minmax(0, 1fr);
                gap: 8px;
                align-items: start;
                padding: 6px 0;
                border-top: 1px solid #d5b579;
            }
            .${APP.id}-range-row {
                grid-column: 1 / -1;
            }
            .${APP.id}-config-row:first-child {
                border-top: 0;
                padding-top: 0;
            }
            .${APP.id}-config-row:nth-child(2) {
                border-top: 0;
                padding-top: 0;
            }
            .${APP.id}-config-row input {
                width: 13px;
                height: 13px;
                margin: 2px 0 0;
                accent-color: #d9152f;
            }
            .${APP.id}-config-row b {
                display: block;
                color: #111;
                font-size: 12px;
                line-height: 15px;
            }
            .${APP.id}-config-row span {
                display: block;
                margin-top: 2px;
                color: #5e3b16;
                font-size: 11px;
                line-height: 14px;
            }
            .${APP.id}-config-row .${APP.id}-range-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin: 0;
            }
            .${APP.id}-config-row .${APP.id}-range-head span {
                margin: 0;
                color: inherit;
                font: inherit;
                line-height: inherit;
            }
            .${APP.id}-config-row output {
                color: #8f2b25;
                font: bold 12px Verdana, Arial, sans-serif;
            }
            .${APP.id}-config-row input[type="range"] {
                width: 100%;
                height: 16px;
                margin: 3px 0 0;
                accent-color: #a22c27;
            }
            .${APP.id}-summary {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 8px;
            }
            .${APP.id}-metric {
                border: 1px solid #b57d2e;
                border-radius: 2px;
                background: #fff6d7;
                padding: 6px 8px;
                min-width: 0;
                box-shadow: inset 0 1px 2px rgba(0,0,0,.08);
            }
            .${APP.id}-metric b {
                display: block;
                font-size: 16px;
                color: #111;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .${APP.id}-metric span {
                color: #6f4a1e;
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
            }
            .${APP.id}-content {
                max-width: 100%;
                overflow-x: hidden;
                overflow-y: auto;
                height: clamp(170px, 28vh, 270px);
                max-height: clamp(170px, 28vh, 270px);
                min-height: 0;
                border: 1px solid #c99545;
                background: #fff2c8;
            }
            .${APP.id}-table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed;
            }
            .${APP.id}-table th:nth-child(1),
            .${APP.id}-table td:nth-child(1) { width: 11%; }
            .${APP.id}-table th:nth-child(2),
            .${APP.id}-table td:nth-child(2) { width: 21%; }
            .${APP.id}-table th:nth-child(3),
            .${APP.id}-table td:nth-child(3) { width: 8%; }
            .${APP.id}-table th:nth-child(4),
            .${APP.id}-table td:nth-child(4) { width: 15%; }
            .${APP.id}-table th:nth-child(5),
            .${APP.id}-table td:nth-child(5) { width: 10%; }
            .${APP.id}-table th:nth-child(6),
            .${APP.id}-table td:nth-child(6) { width: 15%; }
            .${APP.id}-table th:nth-child(7),
            .${APP.id}-table td:nth-child(7) { width: 10%; }
            .${APP.id}-table th:nth-child(8),
            .${APP.id}-table td:nth-child(8) { width: 10%; }
            .${APP.id}-table th,
            .${APP.id}-table td {
                border-bottom: 1px solid #d1ad68;
                padding: 6px 7px;
                text-align: left;
                vertical-align: top;
                overflow: hidden;
                text-overflow: ellipsis;
                color: #2d1307;
            }
            .${APP.id}-table th {
                position: sticky;
                top: 0;
                z-index: 1;
                background: linear-gradient(to bottom, #d7b56f, #c89745);
                color: #3b1607;
                font-size: 10px;
                text-transform: uppercase;
                border-bottom: 1px solid #8c5b22;
            }
            .${APP.id}-table tr:nth-child(even) td { background: #f6e2ae; }
            .${APP.id}-table tr:nth-child(odd) td { background: #fff2c8; }
            .${APP.id}-table a {
                color: #603913;
                font-weight: 700;
                text-decoration: none;
            }
            .${APP.id}-table a:hover { text-decoration: underline; }
            .${APP.id}-muted { color: #876846; }
            .${APP.id}-pos { color: #286421; font-weight: 700; }
            .${APP.id}-neg { color: #923020; font-weight: 700; }
            .${APP.id}-table td.${APP.id}-muted { color: #876846; }
            .${APP.id}-table td.${APP.id}-pos { color: #286421; font-weight: 700; }
            .${APP.id}-table td.${APP.id}-neg { color: #923020; font-weight: 700; }
            .${APP.id}-map-layer {
                position: absolute;
                inset: 0;
                z-index: 90;
                overflow: visible;
                pointer-events: none;
            }
            .${APP.id}-map-marker {
                --${APP.id}-marker-color: #d9152f;
                --${APP.id}-marker-rgb: 217,21,47;
                --${APP.id}-marker-bg-alpha: .95;
                --${APP.id}-marker-glow: rgba(217,21,47,.95);
                position: absolute;
                z-index: 80;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                margin: -10px 0 0 -10px;
                border: 1px solid #fff1b8;
                border-radius: 50%;
                background: rgba(var(--${APP.id}-marker-rgb), var(--${APP.id}-marker-bg-alpha));
                box-shadow: 0 0 0 2px var(--${APP.id}-marker-color), 0 0 9px var(--${APP.id}-marker-glow), inset 0 0 0 1px rgba(91,18,14,.65);
                color: #fff7d7;
                font: bold 9px/20px Verdana, Arial, sans-serif;
                letter-spacing: 0;
                text-align: center;
                text-shadow: 1px 1px 1px #000;
                pointer-events: none;
            }
            .${APP.id}-map-age-1h {
                --${APP.id}-marker-color: #18a83b;
                --${APP.id}-marker-rgb: 24,168,59;
                --${APP.id}-marker-glow: rgba(24,168,59,.95);
            }
            .${APP.id}-map-age-3h {
                --${APP.id}-marker-color: #d7b316;
                --${APP.id}-marker-rgb: 215,179,22;
                --${APP.id}-marker-glow: rgba(215,179,22,.95);
            }
            .${APP.id}-map-age-6h {
                --${APP.id}-marker-color: #ee7c13;
                --${APP.id}-marker-rgb: 238,124,19;
                --${APP.id}-marker-glow: rgba(238,124,19,.95);
            }
            .${APP.id}-map-age-old {
                --${APP.id}-marker-color: #d9152f;
                --${APP.id}-marker-rgb: 217,21,47;
                --${APP.id}-marker-glow: rgba(217,21,47,.95);
            }
            #${APP.id}-map-load {
                position: absolute;
                top: 8px;
                right: 8px;
                z-index: 95;
                display: inline-flex;
                align-items: center;
                justify-content: flex-start;
                gap: 8px;
                width: 34px;
                height: 30px;
                min-width: 34px;
                max-width: 200px;
                overflow: hidden;
                white-space: nowrap;
                border: 1px solid #4f120f;
                border-radius: 2px;
                background: linear-gradient(to bottom, #b33a34, #8f2420 55%, #681611);
                box-shadow: inset 0 1px 0 rgba(255,255,255,.35), inset 0 -1px 0 rgba(0,0,0,.35), 0 2px 5px rgba(0,0,0,.45);
                color: #fff;
                font: bold 12px Verdana, Arial, sans-serif;
                text-shadow: 1px 1px 1px #000;
                padding: 0 7px;
                cursor: pointer;
                transition: width .18s ease, background .12s ease;
            }
            #${APP.id}-map-load:hover,
            #${APP.id}-map-load:focus {
                width: 188px;
                background: linear-gradient(to bottom, #c4473e, #a02c27 55%, #7e1c17);
            }
            #${APP.id}-map-load .${APP.id}-map-load-icon {
                flex: 0 0 18px;
                position: relative;
                display: inline-block;
                width: 18px;
                height: 16px;
                border: 1px solid #fff1b8;
                border-radius: 2px;
                background:
                    linear-gradient(90deg, rgba(255,241,184,.35) 0 2px, transparent 2px 6px, rgba(255,241,184,.28) 6px 8px, transparent 8px 12px, rgba(255,241,184,.35) 12px 14px, transparent 14px),
                    linear-gradient(to bottom, #f2d08a, #d49a40);
                box-shadow: 0 0 0 1px #7b241f, 0 0 6px rgba(255,214,122,.75);
                transform: skewX(-8deg);
            }
            #${APP.id}-map-load .${APP.id}-map-load-icon::before {
                content: "";
                position: absolute;
                left: 7px;
                top: 1px;
                width: 1px;
                height: 12px;
                background: rgba(96,57,19,.75);
                box-shadow: 6px 0 0 rgba(96,57,19,.65);
            }
            #${APP.id}-map-load .${APP.id}-map-load-icon::after {
                content: "";
                position: absolute;
                left: 3px;
                top: 5px;
                width: 5px;
                height: 5px;
                border-radius: 50%;
                background: #d9152f;
                box-shadow: 0 0 0 1px #fff1b8;
            }
            #${APP.id}-map-load .${APP.id}-map-load-label {
                flex: 0 0 auto;
                opacity: 0;
                transform: translateX(-4px);
                transition: opacity .12s ease, transform .12s ease;
            }
            #${APP.id}-map-load:hover .${APP.id}-map-load-label,
            #${APP.id}-map-load:focus .${APP.id}-map-load-label {
                opacity: 1;
                transform: translateX(0);
            }
            #${APP.id}-map-load:disabled {
                opacity: .72;
                cursor: wait;
            }
            #${APP.id}-map-load:disabled,
            #${APP.id}-map-load.${APP.id}-map-load-busy {
                width: 138px;
            }
            #${APP.id}-map-load.${APP.id}-map-load-busy .${APP.id}-map-load-label {
                opacity: 1;
                transform: translateX(0);
            }
            #${APP.id}-map-load.${APP.id}-map-load-fixed {
                position: fixed;
                right: 122px;
                bottom: 18px;
                top: auto;
            }
            .${APP.id}-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin-top: 10px;
                color: #5e3b16;
                font-size: 11px;
                line-height: 14px;
            }
            .${APP.id}-footer a {
                color: #8f2b25;
                font-weight: 700;
                text-decoration: none;
            }
            .${APP.id}-footer a:hover {
                text-decoration: underline;
            }
            .${APP.id}-notice {
                padding: 22px;
                color: #4f210b;
                text-align: center;
                font-weight: 700;
            }
            .${APP.id}-loading {
                opacity: .68;
                pointer-events: none;
            }
            @media (max-width: 920px) {
                #${APP.id}-panel {
                    top: 50%;
                    max-width: calc(100vw - 24px);
                }
                .${APP.id}-section {
                    grid-template-columns: 1fr;
                    gap: 8px;
                }
                .${APP.id}-toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                .${APP.id}-config-list { grid-template-columns: 1fr; }
                .${APP.id}-range-row { grid-column: auto; }
                .${APP.id}-summary { grid-template-columns: repeat(2, 1fr); }
                .${APP.id}-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                .${APP.id}-action-stack { grid-column: span 2; }
            }
        `;
        document.head.appendChild(style);
    }

    function createLauncher() {
        if (document.getElementById(`${APP.id}-launcher`)) return;
        const button = document.createElement("button");
        button.id = `${APP.id}-launcher`;
        button.type = "button";
        button.textContent = "Conquistas";
        button.addEventListener("click", openPanel);
        document.body.appendChild(button);
        state.launcher = button;
    }

    function ensureMapLoadButton() {
        const existing = document.getElementById(`${APP.id}-map-load`);
        if (!isMapScreen()) {
            if (existing) existing.remove();
            state.mapLoadButton = null;
            state.mapButtonForceMarkers = false;
            return;
        }

        const parent = findMapOverlayRoot() || document.body;
        let button = existing;
        if (!button) {
            button = document.createElement("button");
            button.id = `${APP.id}-map-load`;
            button.type = "button";
            button.setAttribute("aria-label", "Marcar Conquistas");
            button.title = "Marcar conquistas recentes no mapa";
            button.innerHTML = `
                <span class="${APP.id}-map-load-icon" aria-hidden="true"></span>
                <span class="${APP.id}-map-load-label">Marcar Conquistas</span>
            `;
            button.addEventListener("click", loadConquestsFromMapButton);
        }

        if (parent !== document.body && window.getComputedStyle(parent).position === "static") {
            parent.style.position = "relative";
        }
        if (button.parentElement !== parent) parent.appendChild(button);
        button.classList.toggle(`${APP.id}-map-load-fixed`, parent === document.body);
        state.mapLoadButton = button;
    }

    function setMapLoadButtonBusy(isBusy) {
        if (!state.mapLoadButton) return;
        const label = state.mapLoadButton.querySelector(`.${APP.id}-map-load-label`);
        state.mapLoadButton.disabled = isBusy;
        state.mapLoadButton.classList.toggle(`${APP.id}-map-load-busy`, isBusy);
        state.mapLoadButton.setAttribute("aria-label", isBusy ? "A carregar conquistas" : "Marcar Conquistas");
        state.mapLoadButton.title = isBusy ? "A carregar conquistas..." : "Marcar conquistas recentes no mapa";
        if (label) label.textContent = isBusy ? "A carregar..." : "Marcar Conquistas";
    }

    function isMapScreen() {
        const dataScreen = window.game_data && window.game_data.screen;
        if (dataScreen === "map") return true;
        return new URLSearchParams(window.location.search).get("screen") === "map";
    }

    async function loadConquestsFromMapButton() {
        state.mapButtonForceMarkers = true;
        if (hasPanelControls() && state.controls.markMap) state.controls.markMap.checked = true;
        await loadWorldData({ forceMap: false, forceConquer: true });
        scheduleMapMarkers(0);
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
            const mapExpired = Date.now() - state.mapsLoadedAt > APP.mapCacheMs;
            const conquerExpired = Date.now() - state.conquestsLoadedAt > APP.conquerCacheMs || conquerPath !== state.lastConquerPath;

            const mapPromise = forceMap || mapExpired || !state.maps.players.size
                ? loadMaps(forceMap)
                : Promise.resolve();
            await mapPromise;

            if (forceConquer || conquerExpired || !state.rows.length) {
                const conquerText = await fetchCachedText(`conquer:${conquerPath}`, conquerPath, APP.conquerCacheMs, forceConquer, false);
                state.rows = parseConquests(conquerText, since);
                state.conquestsLoadedAt = Date.now();
                state.lastConquerPath = conquerPath;
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
        if (hours > 0 && hours <= 24) {
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
        if (state.mapButtonForceMarkers && isMapScreen()) return true;
        const settings = readPanelSettings();
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
        if (!root) return;

        const rows = mapMarkerRows().slice().sort((a, b) => b.timestamp - a.timestamp);
        const latestByVillage = new Map();
        rows.forEach((row) => {
            if (!row.village || !row.village.id) return;
            if (!latestByVillage.has(row.village.id)) latestByVillage.set(row.village.id, row);
        });

        let marked = 0;
        const candidates = Array.from(latestByVillage.values()).slice(0, APP.mapMarkerSearchMax);
        for (const row of candidates) {
            if (markMapVillage(root, row)) marked += 1;
            if (marked >= APP.mapMarkerMax) break;
        }
    }

    function clearMapMarkers() {
        document.querySelectorAll(`.${APP.id}-map-layer`).forEach((node) => node.remove());
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
        const match = window.location.hostname.match(/^([a-z]{2}\d+)/i);
        return match ? match[1].toUpperCase() : window.location.hostname;
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
