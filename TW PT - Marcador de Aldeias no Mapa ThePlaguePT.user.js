// ==UserScript==
// @name         TW PT - Marcador de Aldeias no Mapa ThePlaguePT
// @namespace    theplaguept.tw.map-marker
// @version      2.0.1
// @description  Marca listas de coordenadas no mapa e no minimapa do Tribal Wars.
// @author       ThePlaguePT
// @match        https://*.tribalwars.com.pt/game.php*
// @include      *://*.tribalwars.*/game.php*
// @homepageURL  https://github.com/ThePlaguePT/TribalWars-Scripts
// @supportURL   https://github.com/ThePlaguePT/TribalWars-Scripts/issues
// @grant        none
// @run-at       document-idle
// @noframes
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// ==/UserScript==

(() => {
    "use strict";

    if (window.top !== window.self) return;

    const APP = {
        id: "tpMapMarker",
        title: "Marcador de Aldeias",
        displayTitle: "TW PT - Marcador de Aldeias ThePlaguePT",
        version: "2.0.1",
        defaultColor: "#b8322a",
        zIndex: 60030,
        launcherIcon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 1a5 5 0 0 0-5 5c0 3.7 5 9 5 9s5-5.3 5-9a5 5 0 0 0-5-5z' fill='%23f6d28b' stroke='%2340140d'/%3E%3Ccircle cx='8' cy='6' r='2' fill='%23a32620'/%3E%3C/svg%3E",
    };
    const gd = window.game_data || {};
    const world = gd.world || location.hostname.split(".")[0] || "world";
    const storageKey = `${APP.id}:${world}`;
    const state = {
        coords: new Map(),
        color: APP.defaultColor,
        showLabels: true,
        coordinatesEnabled: true,
        distance: 20,
        zoneSize: 25,
        zones: [],
        ownVillages: null,
        bonusTypes: [],
        bonusEnabled: false,
        bonusVillages: null,
        bonusCoords: new Map(),
        observer: null,
        refreshTimer: 0,
        pendingMiniRefresh: false,
        panel: null,
        launcher: null,
        mapToggle: null,
        bonusMapToggle: null,
        launcherPositionFrame: 0,
    };

    load();
    injectStyles();
    createLauncher();
    registerHubShortcut();

    if (gd.screen === "map" || /[?&]screen=map(?:&|$)/.test(location.search)) {
        waitForMap();
    }

    function load() {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
            state.color = /^#[0-9a-f]{6}$/i.test(saved.color) ? saved.color : APP.defaultColor;
            state.showLabels = saved.showLabels !== false;
            state.coordinatesEnabled = saved.coordinatesEnabled !== undefined ? saved.coordinatesEnabled !== false : saved.enabled !== false;
            state.distance = Math.max(1, Math.min(200, Number(saved.distance) || 20));
            state.zoneSize = Number(saved.zoneSize) === 50 ? 50 : 25;
            state.bonusTypes = Array.isArray(saved.bonusTypes) ? saved.bonusTypes.map(String) : [];
            state.bonusEnabled = saved.bonusEnabled === true;
            setCoordinates(Array.isArray(saved.coords) ? saved.coords.map((item) => `${item.x}|${item.y}`) : []);
            state.zones = Array.isArray(saved.zones) ? saved.zones.map((zone) =>
                [...parseCoordinates((zone || []).map((item) => `${item.x}|${item.y}`)).values()]
            ).filter((zone) => zone.length) : [];
        } catch (_) {
            // Uma preferência inválida nunca deve impedir o carregamento do mapa.
        }
    }

    function save() {
        localStorage.setItem(storageKey, JSON.stringify({
            coords: [...state.coords.values()],
            color: state.color,
            showLabels: state.showLabels,
            coordinatesEnabled: state.coordinatesEnabled,
            distance: state.distance,
            zoneSize: state.zoneSize,
            zones: state.zones,
            bonusTypes: state.bonusTypes,
            bonusEnabled: state.bonusEnabled,
        }));
    }

    function parseCoordinates(value) {
        const result = new Map();
        const text = Array.isArray(value) ? value.join("\n") : String(value || "");
        const regex = /(?:^|[^0-9])(\d{1,3})\s*(?:\||,|;|\/|\s)\s*(\d{1,3})(?![0-9])/g;
        let match;
        while ((match = regex.exec(text))) {
            const x = Number(match[1]);
            const y = Number(match[2]);
            if (x <= 999 && y <= 999) result.set(`${x}|${y}`, { x, y });
        }
        return result;
    }

    function setCoordinates(value) {
        state.coords = parseCoordinates(value);
    }

    function buildZones(coordinates, maximum, ownVillages) {
        const zones = [];
        const split = (items, groupCount = Math.ceil(items.length / maximum)) => {
            if (groupCount <= 1 || items.length <= maximum) {
                zones.push(items.slice().sort((a, b) => a.y - b.y || a.x - b.x));
                return;
            }
            const xs = items.map((item) => item.x);
            const ys = items.map((item) => item.y);
            const useX = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
            const sorted = items.slice().sort((a, b) => useX ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x);
            const leftGroups = Math.ceil(groupCount / 2);
            const middle = Math.min(leftGroups * maximum, Math.round(sorted.length * leftGroups / groupCount));
            split(sorted.slice(0, middle), leftGroups);
            split(sorted.slice(middle), groupCount - leftGroups);
        };
        split(coordinates);
        return zones.sort((a, b) =>
            distanceToOwn(a, ownVillages) - distanceToOwn(b, ownVillages) ||
            zoneCenter(a).y - zoneCenter(b).y || zoneCenter(a).x - zoneCenter(b).x
        );
    }

    function distanceToOwn(zone, ownVillages) {
        let minimum = Infinity;
        for (const target of zone) {
            for (const own of ownVillages || []) {
                minimum = Math.min(minimum, Math.hypot(target.x - own.x, target.y - own.y));
            }
        }
        return minimum;
    }

    function zoneCenter(zone) {
        return {
            x: zone.reduce((sum, item) => sum + item.x, 0) / zone.length,
            y: zone.reduce((sum, item) => sum + item.y, 0) / zone.length,
        };
    }

    function formatZones(zones) {
        return zones.map((zone, index) =>
            `ZONA ${index + 1} (${zone.length})\n${zone.map(({ x, y }) => `${x}|${y}`).join(" ")}`
        ).join("\n\n");
    }

    function zonesCardsHtml(zones) {
        return zones.map((zone, index) => `
            <section class="${APP.id}-zoneCard" style="--tp-zone-color:${zoneColor(index)}">
                <div class="${APP.id}-zoneHead"><strong>Zona ${index + 1}</strong><span>${zone.length} aldeia(s)</span></div>
                <textarea readonly spellcheck="false">${escapeHtml(zone.map(({ x, y }) => `${x}|${y}`).join(" "))}</textarea>
            </section>`).join("");
    }

    function updateZonesOutput(panel) {
        const output = panel.querySelector(`.${APP.id}-zonesOutput`);
        if (!output) return;
        output.innerHTML = zonesCardsHtml(state.zones);
        panel.querySelector(`.${APP.id}-zonesSection`)?.classList.toggle("tp-visible", Boolean(state.zones.length));
    }

    async function loadOwnVillages() {
        if (state.ownVillages?.length) return state.ownVillages;
        const playerId = Number(gd.player?.id);
        if (!playerId) throw new Error("jogador não identificado");
        const cacheKey = `${APP.id}:own:${world}:${playerId}`;
        try {
            const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
            if (cached?.time > Date.now() - 6 * 60 * 60 * 1000 && Array.isArray(cached.villages)) {
                state.ownVillages = cached.villages;
                return state.ownVillages;
            }
        } catch (_) { /* cache inválida */ }
        const response = await fetch(`${location.origin}/map/village.txt`, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`erro HTTP ${response.status}`);
        const text = await response.text();
        state.ownVillages = text.split("\n").reduce((villages, line) => {
            const fields = line.trim().split(",");
            if (Number(fields[4]) === playerId) villages.push({ x: Number(fields[2]), y: Number(fields[3]) });
            return villages;
        }, []);
        if (!state.ownVillages.length) throw new Error("nenhuma aldeia própria encontrada");
        try { localStorage.setItem(cacheKey, JSON.stringify({ time: Date.now(), villages: state.ownVillages })); } catch (_) { /* cache cheia */ }
        return state.ownVillages;
    }

    function zoneForCoordinate(x, y) {
        return state.zones.findIndex((zone) => zone.some((item) => item.x === x && item.y === y));
    }

    function zoneColor(index) {
        const colors = ["#e31b23", "#1261d8", "#f08a00", "#7b2fc6", "#009b4d", "#e00087", "#009fbd", "#c9a900", "#4b45d6", "#ed4b16", "#00a878", "#a914d4"];
        return index >= 0 ? colors[index % colors.length] : state.color;
    }

    function bonusData() {
        return window.TWMap?.bonus_data || {};
    }

    function bonusOptionsHtml() {
        const data = bonusData();
        const entries = Object.entries(data).filter(([id]) => Number(id) > 0);
        if (!entries.length) return `<span class="${APP.id}-bonusEmpty">Os tipos ficam disponíveis na página do mapa.</span>`;
        return entries.map(([id, info]) => `
            <label class="${APP.id}-bonusOption"><input type="checkbox" value="${escapeHtml(id)}" ${state.bonusTypes.includes(String(id)) ? "checked" : ""}><span>${escapeHtml(info?.text || `Bónus ${id}`)}</span></label>
        `).join("");
    }

    function activeCoordinates() {
        const merged = state.coordinatesEnabled ? new Map(state.coords) : new Map();
        if (state.bonusEnabled) for (const [key, item] of state.bonusCoords) merged.set(key, item);
        return merged;
    }

    function markerColorFor(x, y) {
        const bonus = state.bonusCoords.get(`${x}|${y}`);
        if (state.bonusEnabled && bonus) {
            const palette = ["#ffb000", "#00a950", "#1473e6", "#e53935", "#8e35d1", "#00a6b8", "#f05a16", "#d4148e"];
            return palette[Math.max(0, Number(bonus.bonus) - 1) % palette.length];
        }
        return zoneColor(zoneForCoordinate(x, y));
    }

    async function loadBonusBarbarians() {
        const selected = new Set(state.bonusTypes.map(String));
        state.bonusCoords.clear();
        if (!state.bonusEnabled || !selected.size) return;
        if (!state.bonusVillages) {
            const cacheKey = `${APP.id}:bonus:${world}`;
            try {
                const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
                if (cached?.time > Date.now() - 6 * 60 * 60 * 1000 && Array.isArray(cached.villages)) state.bonusVillages = cached.villages;
            } catch (_) { /* cache inválida */ }
            if (!state.bonusVillages) {
                const response = await fetch(`${location.origin}/map/village.txt`, { credentials: "same-origin" });
                if (!response.ok) throw new Error(`erro HTTP ${response.status}`);
                const text = await response.text();
                state.bonusVillages = text.split("\n").reduce((items, line) => {
                    const fields = line.trim().split(",");
                    const bonus = Number(fields[6]);
                    if (Number(fields[4]) === 0 && bonus > 0) items.push({ id: Number(fields[0]), x: Number(fields[2]), y: Number(fields[3]), bonus });
                    return items;
                }, []);
                try { localStorage.setItem(cacheKey, JSON.stringify({ time: Date.now(), villages: state.bonusVillages })); } catch (_) { /* cache cheia */ }
            }
        }
        for (const village of state.bonusVillages) {
            if (selected.has(String(village.bonus))) state.bonusCoords.set(`${village.x}|${village.y}`, village);
        }
        scanVisibleBonusBarbarians();
    }

    function scanVisibleBonusBarbarians() {
        if (!state.bonusEnabled || !state.bonusTypes.length || !window.TWMap?.villages) return;
        const selected = new Set(state.bonusTypes.map(String));
        for (const [key, village] of Object.entries(window.TWMap.villages)) {
            const owner = Number(village?.owner ?? village?.player_id ?? village?.player ?? 0);
            if (owner !== 0) continue;
            let bonus = village?.bonus ?? village?.bonus_id ?? village?.bonusId;
            const id = village?.id ?? village?.[0];
            const image = id != null ? document.getElementById(`map_village_${id}`) : null;
            if (bonus == null && image) {
                const source = image.currentSrc || image.src || "";
                for (const [bonusId, info] of Object.entries(bonusData())) {
                    const token = String(info?.image || info?.img || info?.icon || "").split("/").pop();
                    if (token && source.includes(token)) { bonus = bonusId; break; }
                }
            }
            if (!selected.has(String(bonus))) continue;
            let x = Number(village?.x);
            let y = Number(village?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                const match = String(key).match(/^(\d{3})(\d{3})$/);
                if (match) { x = Number(match[1]); y = Number(match[2]); }
            }
            if (Number.isFinite(x) && Number.isFinite(y)) state.bonusCoords.set(`${x}|${y}`, { id, x, y, bonus: Number(bonus) });
        }
    }

    function injectStyles() {
        const style = document.createElement("style");
        style.textContent = `
            #${APP.id}-launcher{position:fixed!important;top:430px!important;right:auto!important;left:16px!important;z-index:${APP.zIndex}!important;box-sizing:border-box!important;width:30px!important;min-width:30px!important;height:28px!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:0!important;overflow:hidden!important;cursor:pointer!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#b33a34,#8f2420 55%,#681611)!important;box-shadow:inset 0 1px 0 #ffffff59,inset 0 -1px 0 #00000059,0 2px 5px #00000073!important;color:#fff!important;font:700 12px Verdana,Arial,sans-serif!important;text-shadow:1px 1px 1px #000!important;white-space:nowrap!important;padding:0 6px!important;transition:width .18s ease,min-width .18s ease,padding .18s ease,gap .18s ease,background .18s ease!important}
            #${APP.id}-launcher:hover,#${APP.id}-launcher:focus-visible{width:390px!important;min-width:390px!important;gap:8px!important;padding:0 9px!important;background:linear-gradient(to bottom,#c4473e,#a02c27 55%,#7e1c17)!important}
            .${APP.id}-launcherIcon{width:16px!important;height:16px!important;flex:0 0 16px!important;border-radius:50%!important;background:url("${APP.launcherIcon}") center/contain no-repeat!important;box-shadow:inset 0 1px 1px #ffffff59,0 1px 1px #000!important}
            .${APP.id}-launcherLabel{display:inline-block!important;max-width:0!important;opacity:0!important;overflow:hidden!important;transform:translateX(-4px)!important;white-space:nowrap!important;transition:max-width .18s ease,opacity .14s ease,transform .18s ease!important}
            #${APP.id}-launcher:hover .${APP.id}-launcherLabel,#${APP.id}-launcher:focus-visible .${APP.id}-launcherLabel{max-width:345px!important;opacity:1!important;transform:translateX(0)!important}
            #${APP.id}-mapToggle{position:absolute!important;top:9px!important;right:47px!important;z-index:1200!important;box-sizing:border-box!important;width:30px!important;min-width:30px!important;height:28px!important;padding:0 6px!important;display:flex!important;align-items:center!important;justify-content:center!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#b33a34,#8f2420 55%,#681611)!important;cursor:pointer!important;box-shadow:inset 0 1px 0 #ffffff59,inset 0 -1px 0 #00000059,0 2px 5px #00000073!important}
            #${APP.id}-mapToggle:hover{background:linear-gradient(to bottom,#c4473e,#a02c27 55%,#7e1c17)!important}
            #${APP.id}-mapToggle .tp-togglePin{display:block!important;width:16px!important;height:16px!important;flex:0 0 16px!important;border:0!important;border-radius:50%!important;background:url("${APP.launcherIcon}") center/contain no-repeat!important;filter:none!important;box-shadow:inset 0 1px 1px #ffffff59,0 1px 1px #000!important}
            #${APP.id}-mapToggle.tp-off{border-color:#493b2b!important;background:linear-gradient(#80766a,#514940)!important;filter:saturate(.2)}
            #${APP.id}-mapToggle.tp-off::after{content:"";position:absolute;left:3px;top:15px;width:25px;height:3px;transform:rotate(-45deg);border-radius:2px;background:#f1d7a1;box-shadow:0 0 0 1px #5b1c13}
            #${APP.id}-bonusMapToggle{position:absolute!important;top:9px!important;right:80px!important;z-index:1200!important;box-sizing:border-box!important;width:30px!important;min-width:30px!important;height:28px!important;padding:0 6px!important;display:flex!important;align-items:center!important;justify-content:center!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#b33a34,#8f2420 55%,#681611)!important;cursor:pointer!important;box-shadow:inset 0 1px 0 #ffffff59,inset 0 -1px 0 #00000059,0 2px 5px #00000073!important}
            #${APP.id}-bonusMapToggle:hover{background:linear-gradient(to bottom,#c4473e,#a02c27 55%,#7e1c17)!important}
            #${APP.id}-bonusMapToggle .tp-toggleBonus{display:grid!important;place-items:center!important;width:16px!important;height:16px!important;color:#f6d28b!important;font:bold 15px/16px Arial!important;text-shadow:0 1px 1px #000!important}
            #${APP.id}-bonusMapToggle.tp-off{border-color:#493b2b!important;background:linear-gradient(#80766a,#514940)!important;filter:saturate(.2)}
            #${APP.id}-bonusMapToggle.tp-off::after{content:"";position:absolute;left:3px;top:12px;width:25px;height:3px;transform:rotate(-45deg);border-radius:2px;background:#f1d7a1;box-shadow:0 0 0 1px #5b1c13}
            #${APP.id}-panel{position:fixed;inset:0;z-index:60040;background:#0008;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
            #${APP.id}-panel.tp-hidden{display:none}
            #${APP.id}-panel .tp-card{width:min(620px,96vw);max-height:92vh;overflow:auto;padding:8px;border:2px solid #473019;border-radius:6px;background:linear-gradient(#d9c99e,#95805b);color:#32190d;box-shadow:0 0 0 1px #d8c99b,0 0 0 4px #5c4429,0 0 0 6px #dacba4e6,inset 0 0 0 2px #fff4cfcf,0 6px 18px #0000008c;font:13px Verdana}
            #${APP.id}-panel .tp-head{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid #56351c;background:linear-gradient(#8d633d,#5e381e);color:#fff;font-weight:bold;text-shadow:1px 1px #000}
            #${APP.id}-panel .tp-close{border:0;background:transparent;color:#fff;font:bold 20px Arial;cursor:pointer}
            #${APP.id}-panel .tp-body{padding:12px}
            #${APP.id}-panel textarea{width:100%;height:210px;resize:vertical;box-sizing:border-box;padding:8px;border:1px solid #9b7652;background:#fffdf6;font:13px Consolas,monospace}
            #${APP.id}-panel .tp-row{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:10px 0}
            #${APP.id}-panel .tp-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
            #${APP.id}-panel button.tp-action{border:1px solid #653417;border-radius:3px;padding:6px 12px;background:#815026;color:#fff;font-weight:bold;cursor:pointer}
            #${APP.id}-panel button.tp-secondary{background:#eee0bd;color:#43230f}
            #${APP.id}-panel .tp-help{color:#67472f;font-size:11px;line-height:1.5}
            #popup_box_${APP.id}Dialog{width:min(1320px,calc(100vw - 24px))!important;max-width:calc(100vw - 24px)!important}
            #popup_box_${APP.id}Dialog .popup_box_content{padding:8px!important;background:#d9c99e!important}
            .${APP.id}-native{box-sizing:border-box;width:100%;max-width:100%;padding:0;color:#3b2508;font:12px Arial,Verdana,sans-serif}
            .${APP.id}-frame{display:flex;flex-direction:column;max-height:calc(100vh - 62px);overflow:hidden;border:2px solid #7e211c;border-radius:4px;background:#f4e4b8}
            .${APP.id}-head{padding:9px 14px 8px;border-bottom:1px solid #c98c48;background:linear-gradient(#f7e8c1,#edd49a)}
            .${APP.id}-head strong{display:block;color:#8f2b25;font-size:16px;line-height:20px}
            .${APP.id}-head span{color:#5b350f;font-size:11px}
            .${APP.id}-content{overflow:auto;padding:6px 12px}
            .${APP.id}-section{display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr);gap:8px 18px;padding:8px 0 9px 12px;border-top:1px solid #d5b579;border-left:4px solid #9b6a2f}
            .${APP.id}-section:first-child{border-top:0}.${APP.id}-section>div{min-width:0}
            .${APP.id}-section h3{margin:0 0 3px;color:#8f2b25;font-size:13px;line-height:16px;text-transform:uppercase}
            .${APP.id}-section p{margin:2px 0;color:#5e3b16;font-size:11px;line-height:14px}
            .${APP.id}-coordsSection{border-left-color:#c72d2d}.${APP.id}-toolsSection{border-left-color:#8b48c8}.${APP.id}-bonusSection{border-left-color:#18874a}.${APP.id}-zonesSection{border-left-color:#1f9ac5}.${APP.id}-settingsSection{border-left-color:#e0a51d}.${APP.id}-actionsSection{border-left-color:#8a6424}
            .${APP.id}-native textarea{width:100%;height:210px;resize:vertical;box-sizing:border-box;padding:8px;border:1px solid #804000;background:#fffdf6;font:13px Consolas,monospace}
            .${APP.id}-native .tp-row{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:10px 0}
            .${APP.id}-native .tp-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
            .${APP.id}-native button.tp-action{border:1px solid #653417;border-radius:3px;padding:6px 12px;background:linear-gradient(#9d6b3e,#70401f);color:#fff;font-weight:bold;cursor:pointer;text-shadow:1px 1px #000}
            .${APP.id}-native button.tp-secondary{background:linear-gradient(#fff6dd,#dfc99d);color:#43230f;text-shadow:none}
            .${APP.id}-native .tp-help{margin-bottom:5px;color:#67472f;font-size:11px;line-height:1.5}
            .${APP.id}-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}
            .${APP.id}-tool{border:1px solid #9a744b;background:#ead9b3;padding:7px}
            .${APP.id}-toolTitle{display:block;margin-bottom:6px;color:#4b2411;font:bold 12px Verdana}
            .${APP.id}-toolLine{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
            .${APP.id}-tool input[type="number"],.${APP.id}-tool select{height:25px;border:1px solid #80522d;background:#fffaf0}
            .${APP.id}-tool input[type="number"]{width:58px}
            .${APP.id}-tool button{height:26px;border:1px solid #603419;background:linear-gradient(#9d6b3e,#70401f);color:#fff;font-weight:bold;cursor:pointer}
            .${APP.id}-bonusTool{grid-column:1/-1;background:#efe0ba}
            .${APP.id}-bonusOptions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 10px;margin:6px 0}
            .${APP.id}-bonusOption{display:flex;align-items:flex-start;gap:5px;min-width:0;color:#3b2508;font-size:11px}
            .${APP.id}-bonusOption span{overflow-wrap:anywhere}.${APP.id}-bonusEmpty{color:#75583b;font-style:italic}
            .${APP.id}-zonesSection{display:none}.${APP.id}-zonesSection.tp-visible{display:grid}
            .${APP.id}-zonesOutput{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;max-height:270px;overflow:auto}
            .${APP.id}-zoneCard{min-width:0;border:2px solid var(--tp-zone-color);background:#f8eac4}
            .${APP.id}-zoneHead{display:flex;justify-content:space-between;padding:4px 7px;background:var(--tp-zone-color);color:#fff;text-shadow:1px 1px #000}
            .${APP.id}-zoneCard textarea{display:block;width:100%;height:68px!important;margin:0;border:0!important;background:#fff8e7!important;font:12px Consolas,monospace!important}
            @media(max-width:850px){.${APP.id}-section{grid-template-columns:1fr}.${APP.id}-zonesOutput{grid-template-columns:1fr}}
            .${APP.id}-marked{overflow:visible!important;filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 4px var(--tp-marker-color))!important;outline:3px solid var(--tp-marker-color)!important;outline-offset:1px!important;border-radius:50%!important;z-index:20!important}
            .${APP.id}-badge{position:absolute;z-index:1000;pointer-events:none;transform:translate(-50%,-115%);padding:1px 3px;border-radius:2px;background:var(--tp-marker-color);color:#fff;text-shadow:0 1px #000;font:bold 9px Arial;white-space:nowrap;box-shadow:0 1px 2px #0008}
            .${APP.id}-minimapOverlay{position:absolute;inset:0;z-index:50;pointer-events:none;overflow:hidden}
            .${APP.id}-miniDot{position:absolute;width:9px;height:9px;transform:translate(-50%,-90%) rotate(-45deg);box-sizing:border-box;border:1px solid #4b1512;border-radius:50% 50% 50% 0;background:var(--tp-marker-color);box-shadow:0 1px 2px #000a}
            .${APP.id}-miniDot::after{content:"";position:absolute;left:2px;top:2px;width:3px;height:3px;border-radius:50%;background:#f3dfb5}
            .${APP.id}-zoneBadge{position:absolute;z-index:4;transform:translate(-50%,-50%);display:grid;place-items:center;min-width:18px;height:18px;padding:0 2px;border:2px solid #fff;border-radius:50%;background:var(--tp-zone-color);color:#fff;text-shadow:1px 1px #000;font:bold 10px Verdana;box-shadow:0 1px 3px #000}
            .${APP.id}-mainOverlay{z-index:100!important}
            .${APP.id}-mapPin{position:absolute;width:0;height:0;z-index:40;pointer-events:none;color:var(--tp-marker-color)}
            .${APP.id}-pinIcon{position:absolute;left:0;bottom:0;width:15px;height:15px;box-sizing:border-box;transform:translateX(-50%) rotate(-45deg);transform-origin:50% 50%;border:1px solid #5f1713;border-radius:50% 50% 50% 0;background:currentColor;box-shadow:0 1px 2px #0009}
            .${APP.id}-pinIcon::after{content:"";position:absolute;left:4px;top:4px;width:5px;height:5px;border-radius:50%;background:#f4dfb5;box-shadow:inset 0 0 0 1px #6a2b20}
            .${APP.id}-pinLabel{position:absolute;left:0;bottom:20px;transform:translateX(-50%);padding:1px 5px 2px;border:2px solid var(--tp-marker-color);border-radius:3px;background:#f7e9c7;color:#35180d;text-shadow:0 1px #fff;font:bold 12px Consolas,"Courier New",monospace;line-height:13px;letter-spacing:.1px;white-space:nowrap;box-shadow:0 1px 3px #0009}
            .${APP.id}-pinLabel::after{content:"";position:absolute;left:50%;bottom:-5px;width:6px;height:6px;transform:translateX(-50%) rotate(45deg);border-right:2px solid var(--tp-marker-color);border-bottom:2px solid var(--tp-marker-color);background:#f7e9c7}
        `;
        document.head.appendChild(style);
    }

    function createLauncher() {
        document.getElementById(`${APP.id}-launcher`)?.remove();
        const button = document.createElement("button");
        button.id = `${APP.id}-launcher`;
        button.type = "button";
        button.title = APP.displayTitle;
        button.setAttribute("aria-label", APP.displayTitle);
        button.innerHTML = `<span class="${APP.id}-launcherIcon" aria-hidden="true"></span><span class="${APP.id}-launcherLabel">${escapeHtml(APP.displayTitle)}</span>`;
        button.addEventListener("click", openPanel);
        document.body.appendChild(button);
        state.launcher = button;
        setupLauncherPosition();
    }

    function createMapToggle() {
        document.getElementById(`${APP.id}-mapToggle`)?.remove();
        const host = document.querySelector("#map_wrap") || document.querySelector("#map_container") || document.querySelector("#map")?.parentElement;
        if (!host) return;
        if (getComputedStyle(host).position === "static") host.style.position = "relative";
        const button = document.createElement("button");
        button.id = `${APP.id}-mapToggle`;
        button.type = "button";
        button.innerHTML = `<span class="tp-togglePin" aria-hidden="true"></span>`;
        button.addEventListener("click", () => {
            state.coordinatesEnabled = !state.coordinatesEnabled;
            save();
            updateMapToggle();
            const checkbox = state.panel?.querySelector(".tp-enabled");
            if (checkbox) checkbox.checked = state.coordinatesEnabled;
            refreshMarkers(true);
            notify(state.coordinatesEnabled ? "Marcações por coordenadas ativadas." : "Marcações por coordenadas desativadas.");
        });
        host.appendChild(button);
        state.mapToggle = button;
        updateMapToggle();
    }

    function updateMapToggle() {
        const button = state.mapToggle || document.getElementById(`${APP.id}-mapToggle`);
        if (!button) return;
        button.classList.toggle("tp-off", !state.coordinatesEnabled);
        button.title = state.coordinatesEnabled ? "Desligar marcações por coordenadas" : "Ligar marcações por coordenadas";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-pressed", String(state.coordinatesEnabled));
    }

    function createBonusMapToggle() {
        document.getElementById(`${APP.id}-bonusMapToggle`)?.remove();
        const host = document.querySelector("#map_wrap") || document.querySelector("#map_container") || document.querySelector("#map")?.parentElement;
        if (!host) return;
        const button = document.createElement("button");
        button.id = `${APP.id}-bonusMapToggle`;
        button.type = "button";
        button.innerHTML = `<span class="tp-toggleBonus" aria-hidden="true">★</span>`;
        button.addEventListener("click", async () => {
            state.bonusEnabled = !state.bonusEnabled;
            if (state.bonusEnabled && !state.bonusTypes.length) {
                state.bonusEnabled = false;
                updateBonusMapToggle();
                notify("Seleciona primeiro os tipos de aldeias bónus no painel.");
                return;
            }
            const checkbox = state.panel?.querySelector(".tp-bonus-enabled");
            if (checkbox) checkbox.checked = state.bonusEnabled;
            if (state.bonusEnabled && state.bonusTypes.length) {
                try { await loadBonusBarbarians(); } catch (error) { notify(`Não foi possível analisar os bónus: ${error.message}`); }
            }
            save();
            updateBonusMapToggle();
            refreshMarkers(true);
            notify(state.bonusEnabled ? "Marcações de bárbaras bónus ativadas." : "Marcações de bárbaras bónus desativadas.");
        });
        host.appendChild(button);
        state.bonusMapToggle = button;
        updateBonusMapToggle();
    }

    function updateBonusMapToggle() {
        const button = state.bonusMapToggle || document.getElementById(`${APP.id}-bonusMapToggle`);
        if (!button) return;
        button.classList.toggle("tp-off", !state.bonusEnabled);
        button.title = state.bonusEnabled ? "Desligar marcações de bárbaras bónus" : "Ligar marcações de bárbaras bónus";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-pressed", String(state.bonusEnabled));
    }

    function setupLauncherPosition() {
        const schedule = () => {
            cancelAnimationFrame(state.launcherPositionFrame);
            state.launcherPositionFrame = requestAnimationFrame(positionLauncher);
        };
        schedule();
        addEventListener("resize", schedule, { passive: true });
        setTimeout(positionLauncher, 250);
        setTimeout(positionLauncher, 1000);
    }

    function positionLauncher() {
        if (!state.launcher) return;
        const layout = document.querySelector("#main_layout td.maincell,td.maincell,#contentContainer,#content_value");
        if (!layout) return;
        const rect = layout.getBoundingClientRect();
        if (rect.width > 0) state.launcher.style.setProperty("left", `${Math.max(4, Math.round(rect.left - 55))}px`, "important");
    }

    function openPanel() {
        if (state.panel) closePanel();
        const coordinates = [...state.coords.values()].map(({ x, y }) => `${x}|${y}`).join("\n");
        const body = `
            <div class="${APP.id}-frame">
                <header class="${APP.id}-head"><strong>TW PT - Marcador de Aldeias ThePlaguePT</strong><span>Marca, filtra e organiza coordenadas do mundo ${escapeHtml(world)} por proximidade e zonas.</span></header>
                <div class="${APP.id}-content">
                    <section class="${APP.id}-section ${APP.id}-coordsSection">
                        <div><h3>Coordenadas</h3><p>Cola coordenadas em qualquer texto. Repetidas são removidas automaticamente.</p></div>
                        <div><textarea class="${APP.id}-coordsInput" spellcheck="false" placeholder="500|500\n501|502\n498|507">${escapeHtml(coordinates)}</textarea></div>
                    </section>
                    <section class="${APP.id}-section ${APP.id}-toolsSection">
                        <div><h3>Filtros e zonas</h3><p>Reduz a lista por distância e cria grupos geográficos limitados.</p></div>
                        <div class="${APP.id}-tools">
                            <div class="${APP.id}-tool"><span class="${APP.id}-toolTitle">Distância às minhas aldeias</span><div class="${APP.id}-toolLine"><span>Máximo</span><input class="tp-distance" type="number" min="1" max="200" step="1" value="${state.distance}"><span>campos</span><button class="tp-filter" type="button">Filtrar lista</button></div></div>
                            <div class="${APP.id}-tool"><span class="${APP.id}-toolTitle">Zonas geográficas</span><div class="${APP.id}-toolLine"><span>Máximo</span><select class="tp-zone-size"><option value="25" ${state.zoneSize === 25 ? "selected" : ""}>25 aldeias</option><option value="50" ${state.zoneSize === 50 ? "selected" : ""}>50 aldeias</option></select><button class="tp-zones" type="button">Criar zonas</button></div></div>
                        </div>
                    </section>
                    <section class="${APP.id}-section ${APP.id}-bonusSection">
                        <div><h3>Bárbaras bónus</h3><p>Analisa automaticamente as aldeias bárbaras e marca apenas os tipos de bónus selecionados.</p></div>
                        <div class="${APP.id}-tool ${APP.id}-bonusTool"><span class="${APP.id}-toolTitle">Tipos de aldeia bónus</span><div class="${APP.id}-bonusOptions">${bonusOptionsHtml()}</div><div class="${APP.id}-toolLine"><label><input class="tp-bonus-enabled" type="checkbox" ${state.bonusEnabled ? "checked" : ""}> Marcação de bárbaras bónus ativa</label><button class="tp-bonus-apply" type="button">Analisar mapa e marcar</button><strong class="tp-bonus-count">${state.bonusCoords.size ? `${state.bonusCoords.size} encontrada(s)` : ""}</strong></div></div>
                    </section>
                    <section class="${APP.id}-section ${APP.id}-zonesSection ${state.zones.length ? "tp-visible" : ""}">
                        <div><h3>Zonas</h3><p>Uma caixa independente por zona, ordenada da mais próxima para a mais distante.</p></div>
                        <div class="${APP.id}-zonesOutput">${zonesCardsHtml(state.zones)}</div>
                    </section>
                    <section class="${APP.id}-section ${APP.id}-settingsSection">
                        <div><h3>Configurações</h3><p>Define a apresentação das marcações no mapa.</p></div>
                        <div class="tp-row"><label>Cor base <input class="tp-color" type="color" value="${state.color}"></label><label><input class="tp-labels" type="checkbox" ${state.showLabels ? "checked" : ""}> Mostrar coordenada no mapa</label><label><input class="tp-enabled" type="checkbox" ${state.coordinatesEnabled ? "checked" : ""}> Coordenadas ativas</label><strong class="tp-count">${state.coords.size} aldeia(s)</strong></div>
                    </section>
                    <section class="${APP.id}-section ${APP.id}-actionsSection">
                        <div><h3>Ações</h3><p>Guarda as opções e atualiza as marcações.</p></div>
                        <div class="tp-actions"><button class="tp-action tp-secondary tp-clear">Limpar</button><button class="tp-action tp-save">Guardar e marcar</button></div>
                    </section>
                </div>
            </div>`;
        const dialog = window.Dialog;
        let panel;
        if (dialog && typeof dialog.show === "function") {
            dialog.show(`${APP.id}Dialog`, `<div id="${APP.id}-native" class="${APP.id}-native">${body}</div>`);
            panel = document.getElementById(`${APP.id}-native`);
        } else {
            panel = document.createElement("div");
            panel.id = `${APP.id}-panel`;
            panel.innerHTML = `<div class="tp-card" role="dialog" aria-modal="true"><div class="tp-head"><span>📍 ${APP.title}</span><button class="tp-close" title="Fechar">×</button></div>${body}</div>`;
            document.body.appendChild(panel);
            panel.querySelector(".tp-close").addEventListener("click", closePanel);
            panel.addEventListener("click", (event) => { if (event.target === panel) closePanel(); });
        }
        if (!panel) return;
        state.panel = panel;
        const textarea = panel.querySelector("textarea");
        const updateCount = () => panel.querySelector(".tp-count").textContent = `${parseCoordinates(textarea.value).size} aldeia(s)`;
        textarea.addEventListener("input", () => {
            state.zones = [];
            updateZonesOutput(panel);
            updateCount();
        });
        panel.querySelector(".tp-clear").addEventListener("click", () => { textarea.value = ""; updateCount(); });
        panel.querySelector(".tp-filter").addEventListener("click", async (event) => {
            const button = event.currentTarget;
            const distance = Math.max(1, Math.min(200, Number(panel.querySelector(".tp-distance").value) || 20));
            const candidates = [...parseCoordinates(textarea.value).values()];
            if (!candidates.length) return notify("Não existem coordenadas para filtrar.");
            button.disabled = true;
            button.textContent = "A carregar…";
            try {
                const own = await loadOwnVillages();
                const maxSquared = distance * distance;
                const filtered = candidates.filter((target) => own.some((village) => {
                    const dx = target.x - village.x;
                    const dy = target.y - village.y;
                    return dx * dx + dy * dy <= maxSquared;
                }));
                textarea.value = filtered.map(({ x, y }) => `${x}|${y}`).join("\n");
                state.distance = distance;
                state.zones = [];
                updateZonesOutput(panel);
                updateCount();
                notify(`${filtered.length} de ${candidates.length} aldeias estão a até ${distance} campos.`);
            } catch (error) {
                notify(`Não foi possível carregar as tuas aldeias: ${error.message}`);
            } finally {
                button.disabled = false;
                button.textContent = "Filtrar lista";
            }
        });
        panel.querySelector(".tp-zones").addEventListener("click", async (event) => {
            const coordinatesToGroup = [...parseCoordinates(textarea.value).values()];
            if (!coordinatesToGroup.length) return notify("Não existem coordenadas para agrupar.");
            const button = event.currentTarget;
            button.disabled = true;
            button.textContent = "A ordenar…";
            state.zoneSize = Number(panel.querySelector(".tp-zone-size").value) === 50 ? 50 : 25;
            try {
                const own = await loadOwnVillages();
                state.zones = buildZones(coordinatesToGroup, state.zoneSize, own);
                updateZonesOutput(panel);
                notify(`${state.zones.length} zona(s) criada(s), da mais próxima para a mais distante.`);
            } catch (error) {
                notify(`Não foi possível ordenar as zonas: ${error.message}`);
            } finally {
                button.disabled = false;
                button.textContent = "Criar zonas";
            }
        });
        panel.querySelector(".tp-bonus-apply")?.addEventListener("click", async (event) => {
            const button = event.currentTarget;
            state.bonusTypes = [...panel.querySelectorAll(`.${APP.id}-bonusOptions input:checked`)].map((input) => String(input.value));
            state.bonusEnabled = panel.querySelector(".tp-bonus-enabled").checked;
            if (state.bonusEnabled && !state.bonusTypes.length) return notify("Seleciona pelo menos um tipo de aldeia bónus.");
            button.disabled = true;
            button.textContent = "A analisar…";
            try {
                await loadBonusBarbarians();
                save();
                refreshMarkers(true);
                const count = panel.querySelector(".tp-bonus-count");
                if (count) count.textContent = `${state.bonusCoords.size} encontrada(s)`;
                notify(`${state.bonusCoords.size} aldeia(s) bárbara(s) bónus marcada(s).`);
            } catch (error) {
                notify(`Não foi possível analisar os bónus: ${error.message}`);
            } finally {
                button.disabled = false;
                button.textContent = "Analisar mapa e marcar";
            }
        });
        panel.querySelector(".tp-save").addEventListener("click", async () => {
            setCoordinates(textarea.value);
            state.color = panel.querySelector(".tp-color").value;
            state.showLabels = panel.querySelector(".tp-labels").checked;
            state.coordinatesEnabled = panel.querySelector(".tp-enabled").checked;
            state.distance = Math.max(1, Math.min(200, Number(panel.querySelector(".tp-distance").value) || 20));
            state.zoneSize = Number(panel.querySelector(".tp-zone-size").value) === 50 ? 50 : 25;
            state.bonusTypes = [...panel.querySelectorAll(`.${APP.id}-bonusOptions input:checked`)].map((input) => String(input.value));
            state.bonusEnabled = panel.querySelector(".tp-bonus-enabled")?.checked === true;
            try { await loadBonusBarbarians(); } catch (error) { notify(`Não foi possível analisar os bónus: ${error.message}`); }
            save();
            updateMapToggle();
            updateBonusMapToggle();
            refreshMarkers();
            closePanel();
            notify(`${state.coords.size} aldeia(s) guardada(s).`);
        });
        textarea.focus();
    }

    function closePanel() {
        if (window.Dialog && typeof window.Dialog.close === "function" && document.getElementById(`${APP.id}-native`)) {
            window.Dialog.close(`${APP.id}Dialog`);
        } else {
            state.panel?.remove();
        }
        state.panel = null;
    }

    function waitForMap(attempt = 0) {
        if (document.querySelector("#map, #map_wrap, #map_container") || attempt > 80) {
            createMapToggle();
            createBonusMapToggle();
            observeMap();
            if (state.bonusEnabled && state.bonusTypes.length) {
                loadBonusBarbarians().then(() => refreshMarkers(true)).catch((error) => console.warn(`[${APP.title}]`, error));
            } else {
                refreshMarkers();
            }
            return;
        }
        setTimeout(() => waitForMap(attempt + 1), 250);
    }

    function observeMap() {
        state.observer?.disconnect();
        state.observer = new MutationObserver((mutations) => {
            const minimap = findPoliticalMap();
            const hasGameChange = mutations.some((mutation) => {
                if (mutation.type === "attributes") {
                    return !mutation.target.classList?.contains(`${APP.id}-marked`) &&
                        !mutation.target.classList?.contains(`${APP.id}-minimapOverlay`);
                }
                const changed = [...mutation.addedNodes, ...mutation.removedNodes];
                return changed.some((node) => node.nodeType !== 1 || !isOwnMarker(node));
            });
            const minimapChanged = minimap && mutations.some((mutation) =>
                minimap.contains(mutation.target) &&
                !mutation.target.classList?.contains(`${APP.id}-minimapOverlay`)
            );
            if (hasGameChange) scheduleRefresh(Boolean(minimapChanged));
        });
        state.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "style"] });
        window.addEventListener("resize", () => scheduleRefresh(true), { passive: true });
        document.addEventListener("mouseup", () => scheduleRefresh(true), { passive: true });
        document.addEventListener("keyup", (event) => {
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) scheduleRefresh(true);
        });
    }

    function scheduleRefresh(refreshMiniMap = false) {
        state.pendingMiniRefresh ||= refreshMiniMap;
        clearTimeout(state.refreshTimer);
        state.refreshTimer = setTimeout(() => {
            const includeMiniMap = state.pendingMiniRefresh;
            state.pendingMiniRefresh = false;
            refreshMarkers(includeMiniMap);
        }, state.pendingMiniRefresh ? 70 : 16);
    }

    function isOwnMarker(node) {
        return node.classList?.contains(`${APP.id}-badge`) ||
            node.classList?.contains(`${APP.id}-minimapOverlay`) ||
            node.classList?.contains(`${APP.id}-miniDot`) ||
            node.classList?.contains(`${APP.id}-mapPin`);
    }

    function refreshMarkers(refreshMiniMap = true) {
        removeMarkers(refreshMiniMap);
        scanVisibleBonusBarbarians();
        if (!activeCoordinates().size) return;
        markMainMapAnchored();
        if (refreshMiniMap) markPoliticalMap();
    }

    function markMainMapAnchored() {
        const twMap = window.TWMap;
        if (!twMap?.villages) return;
        for (const { x, y } of activeCoordinates().values()) {
            const village = twMap.villages[`${x}${y}`];
            const villageId = village?.id ?? village?.[0];
            if (villageId == null) continue;
            const image = document.getElementById(`map_village_${villageId}`);
            if (!image?.parentElement) continue;
            const imageRect = image.getBoundingClientRect();
            const parentRect = image.parentElement.getBoundingClientRect();
            if (!imageRect.width || !imageRect.height) continue;
            const left = imageRect.left - parentRect.left + imageRect.width / 2;
            const top = imageRect.top - parentRect.top + imageRect.height / 2;
            const marker = document.createElement("span");
            marker.className = `${APP.id}-mapPin`;
            const bonus = state.bonusCoords.get(`${x}|${y}`);
            marker.title = bonus ? `${x}|${y} — ${bonusData()?.[bonus.bonus]?.text || `Bónus ${bonus.bonus}`}` : `${x}|${y}`;
            marker.style.setProperty("--tp-marker-color", markerColorFor(x, y));
            marker.style.left = `${left}px`;
            marker.style.top = `${top}px`;
            marker.innerHTML = `<i class="${APP.id}-pinIcon"></i>${state.showLabels ? `<b class="${APP.id}-pinLabel">${x}|${y}</b>` : ""}`;
            image.parentElement.appendChild(marker);
        }
    }

    function markMainMapByGrid() {
        const twMap = window.TWMap;
        const map = twMap?.map;
        const container = document.querySelector("#map");
        if (!map || !container || !Array.isArray(map.pos) || typeof map.coordByPixel !== "function") return;
        const tileX = Number(twMap.tileSize?.[0]) || 53;
        const tileY = Number(twMap.tileSize?.[1]) || 38;
        const columns = Number(twMap.size?.[0]) || Math.ceil(container.clientWidth / tileX) + 2;
        const rows = Number(twMap.size?.[1]) || Math.ceil(container.clientHeight / tileY) + 2;
        if (getComputedStyle(container).position === "static") container.style.position = "relative";
        const overlay = document.createElement("div");
        overlay.className = `${APP.id}-minimapOverlay ${APP.id}-mainOverlay`;
        overlay.style.setProperty("--tp-marker-color", state.color);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                const coord = map.coordByPixel(map.pos[0] + tileX * col, map.pos[1] + tileY * row);
                if (!coord || !activeCoordinates().has(`${coord[0]}|${coord[1]}`)) continue;
                const village = twMap.villages?.[`${coord[0]}${coord[1]}`];
                if (!village) continue;
                const marker = document.createElement("span");
                marker.className = `${APP.id}-mapPin`;
                marker.style.left = `${col * tileX + tileX / 2}px`;
                marker.style.top = `${row * tileY + tileY / 2}px`;
                marker.title = `${coord[0]}|${coord[1]}`;
                if (state.showLabels) marker.dataset.label = `${coord[0]}|${coord[1]}`;
                overlay.appendChild(marker);
            }
        }
        if (overlay.childElementCount) container.appendChild(overlay);
    }

    function removeMarkers(includeMiniMap = true) {
        document.querySelectorAll(`.${APP.id}-marked`).forEach((el) => el.classList.remove(`${APP.id}-marked`));
        document.querySelectorAll(`.${APP.id}-badge,.${APP.id}-mapPin`).forEach((el) => el.remove());
        if (includeMiniMap) document.querySelectorAll(`.${APP.id}-minimapOverlay`).forEach((el) => el.remove());
    }

    function markVillageElements() {
        const twMap = window.TWMap;
        const villages = twMap?.villages || {};
        const elements = document.querySelectorAll("#map img[id*='village'],#map_wrap img[id*='village'],#map_container img[id*='village'],[data-village-id]");
        elements.forEach((element) => {
            const idMatch = String(element.dataset.villageId || element.id || "").match(/(?:village[_-]?)(\d+)/i);
            const village = idMatch ? villages[idMatch[1]] : null;
            let x = Number(village?.x ?? village?.[2]);
            let y = Number(village?.y ?? village?.[3]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                const coordMatch = `${element.id} ${element.title} ${element.alt}`.match(/(\d{1,3})\s*\|\s*(\d{1,3})/);
                if (!coordMatch) return;
                x = Number(coordMatch[1]); y = Number(coordMatch[2]);
            }
            if (!activeCoordinates().has(`${x}|${y}`)) return;
            element.classList.add(`${APP.id}-marked`);
            element.style.setProperty("--tp-marker-color", state.color);
            if (state.showLabels && element.parentElement) {
                const badge = document.createElement("span");
                badge.className = `${APP.id}-badge`;
                badge.textContent = `${x}|${y}`;
                badge.style.setProperty("--tp-marker-color", state.color);
                badge.style.left = `${element.offsetLeft + element.offsetWidth / 2}px`;
                badge.style.top = `${element.offsetTop}px`;
                element.parentElement.appendChild(badge);
            }
        });
    }

    function markPoliticalMap() {
        const container = findPoliticalMap();
        if (!container) return;
        if (markPoliticalMapByGrid(container)) return;
        const bounds = politicalMapBounds(container);
        if (!bounds || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) return;
        if (getComputedStyle(container).position === "static") container.style.position = "relative";
        const overlay = document.createElement("div");
        overlay.className = `${APP.id}-minimapOverlay`;
        overlay.style.setProperty("--tp-marker-color", state.color);
        for (const { x, y } of activeCoordinates().values()) {
            if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
            const dot = document.createElement("span");
            dot.className = `${APP.id}-miniDot`;
            dot.title = `${x}|${y}`;
            dot.style.setProperty("--tp-marker-color", markerColorFor(x, y));
            dot.style.left = `${((x - bounds.minX) / (bounds.maxX - bounds.minX)) * 100}%`;
            dot.style.top = `${((y - bounds.minY) / (bounds.maxY - bounds.minY)) * 100}%`;
            overlay.appendChild(dot);
        }
        state.zones.forEach((zone, index) => {
            const center = zoneCenter(zone);
            if (center.x < bounds.minX || center.x > bounds.maxX || center.y < bounds.minY || center.y > bounds.maxY) return;
            const badge = document.createElement("span");
            badge.className = `${APP.id}-zoneBadge`;
            badge.textContent = String(index + 1);
            badge.title = `Zona ${index + 1} (${zone.length} aldeias)`;
            badge.style.setProperty("--tp-zone-color", zoneColor(index));
            badge.style.left = `${((center.x - bounds.minX) / (bounds.maxX - bounds.minX)) * 100}%`;
            badge.style.top = `${((center.y - bounds.minY) / (bounds.maxY - bounds.minY)) * 100}%`;
            overlay.appendChild(badge);
        });
        if (overlay.childElementCount) container.appendChild(overlay);
    }

    function markPoliticalMapByGrid(container) {
        const twMap = window.TWMap || {};
        const targets = activeCoordinates();
        const candidates = [twMap.minimap, twMap.pmap, twMap.politicalMap, twMap.pmapHandler?.map].filter(Boolean);
        for (const map of candidates) {
            if (!Array.isArray(map.pos) || typeof map.coordByPixel !== "function") continue;
            const width = container.clientWidth;
            const height = container.clientHeight;
            const found = new Map();
            // Mede toda a célula para colocar o pin no centro, não no primeiro píxel encontrado.
            for (let py = 0; py <= height; py += 1) {
                for (let px = 0; px <= width; px += 1) {
                    const coord = map.coordByPixel(map.pos[0] + px, map.pos[1] + py);
                    const key = coord && `${coord[0]}|${coord[1]}`;
                    if (!key || !targets.has(key)) continue;
                    const area = found.get(key);
                    if (area) {
                        area.maxX = px;
                        area.maxY = py;
                    } else {
                        found.set(key, { minX: px, minY: py, maxX: px, maxY: py });
                    }
                }
            }
            if (!found.size) continue;
            if (getComputedStyle(container).position === "static") container.style.position = "relative";
            const overlay = document.createElement("div");
            overlay.className = `${APP.id}-minimapOverlay`;
            overlay.style.setProperty("--tp-marker-color", state.color);
            const zonePoints = new Map();
            for (const [key, area] of found) {
                const dot = document.createElement("span");
                dot.className = `${APP.id}-miniDot`;
                dot.title = key;
                const centerX = (area.minX + area.maxX) / 2;
                const centerY = (area.minY + area.maxY) / 2;
                const [x, y] = key.split("|").map(Number);
                const zoneIndex = zoneForCoordinate(x, y);
                dot.style.setProperty("--tp-marker-color", markerColorFor(x, y));
                dot.style.left = `${centerX}px`;
                dot.style.top = `${centerY}px`;
                overlay.appendChild(dot);
                if (zoneIndex >= 0) {
                    const points = zonePoints.get(zoneIndex) || [];
                    points.push({ x: centerX, y: centerY });
                    zonePoints.set(zoneIndex, points);
                }
            }
            for (const [zoneIndex, points] of zonePoints) {
                const badge = document.createElement("span");
                badge.className = `${APP.id}-zoneBadge`;
                badge.textContent = String(zoneIndex + 1);
                badge.title = `Zona ${zoneIndex + 1} (${state.zones[zoneIndex].length} aldeias)`;
                badge.style.setProperty("--tp-zone-color", zoneColor(zoneIndex));
                badge.style.left = `${points.reduce((sum, point) => sum + point.x, 0) / points.length}px`;
                badge.style.top = `${points.reduce((sum, point) => sum + point.y, 0) / points.length}px`;
                overlay.appendChild(badge);
            }
            container.appendChild(overlay);
            return true;
        }
        return false;
    }

    function findPoliticalMap() {
        const selectors = ["#minimap", "#politicalmap", "#pmap", "#minimap_container", ".minimap"];
        return selectors.map((selector) => document.querySelector(selector)).find((el) => el && el.offsetWidth > 30 && el.offsetHeight > 30) || null;
    }

    function politicalMapBounds(container) {
        const twMap = window.TWMap || {};
        const objects = [twMap.minimap, twMap.pmap, twMap.politicalMap, twMap.pmapHandler].filter(Boolean);
        for (const obj of objects) {
            const pos = obj.pos || obj.position || obj._pos;
            const size = obj.size || obj.mapSize || obj._size;
            if (Array.isArray(pos) && Array.isArray(size) && size[0] > 0 && size[1] > 0) {
                return { minX: +pos[0], minY: +pos[1], maxX: +pos[0] + +size[0], maxY: +pos[1] + +size[1] };
            }
            const minX = numberFrom(obj, ["minX", "x", "startX"]);
            const minY = numberFrom(obj, ["minY", "y", "startY"]);
            const maxX = numberFrom(obj, ["maxX", "endX"]);
            const maxY = numberFrom(obj, ["maxY", "endY"]);
            if ([minX, minY, maxX, maxY].every(Number.isFinite)) return { minX, minY, maxX, maxY };
        }
        const source = [...container.querySelectorAll("img")].map((img) => img.currentSrc || img.src).find(Boolean) || getComputedStyle(container).backgroundImage;
        const params = parseMapUrl(source);
        if (params) return params;
        const map = twMap.map;
        const pos = map?.pos;
        const tileSize = Number(twMap.tileSize || map?.tileSize || 53);
        if (Array.isArray(pos) && tileSize > 0) {
            const visibleX = Math.max(1, document.querySelector("#map")?.clientWidth / tileSize || 15);
            const visibleY = Math.max(1, document.querySelector("#map")?.clientHeight / tileSize || 10);
            const scale = 4;
            return { minX: pos[0] - visibleX * 1.5, minY: pos[1] - visibleY * 1.5, maxX: pos[0] + visibleX * 2.5, maxY: pos[1] + visibleY * 2.5 };
        }
        return null;
    }

    function parseMapUrl(source) {
        const clean = String(source || "").replace(/^url\(["']?|["']?\)$/g, "");
        try {
            const url = new URL(clean, location.href);
            const x = Number(url.searchParams.get("x"));
            const y = Number(url.searchParams.get("y"));
            const w = Number(url.searchParams.get("w") || url.searchParams.get("width"));
            const h = Number(url.searchParams.get("h") || url.searchParams.get("height"));
            if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) return { minX: x, minY: y, maxX: x + w, maxY: y + h };
        } catch (_) { /* URL não analisável */ }
        return null;
    }

    function numberFrom(object, keys) {
        for (const key of keys) if (Number.isFinite(Number(object?.[key]))) return Number(object[key]);
        return NaN;
    }

    function notify(message) {
        if (window.UI?.SuccessMessage) window.UI.SuccessMessage(message, 2200);
        else console.info(`[${APP.title}] ${message}`);
    }

    function registerHubShortcut() {
        window.TPMapMarker = { open: openPanel, refresh: refreshMarkers, version: APP.version };
        window.dispatchEvent(new CustomEvent("TPHub:Register", { detail: { id: APP.id, title: APP.title, open: openPanel } }));
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }
})();
