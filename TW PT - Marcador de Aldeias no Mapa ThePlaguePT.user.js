// ==UserScript==
// @name         TW PT - Marcador de Aldeias no Mapa ThePlaguePT
// @namespace    theplaguept.tw.map-marker
// @version      2.3.0
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
        displayTitle: "Marcador - ThePlaguePT",
        version: "2.3.0",
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
        supportEnabled: false,
        supportMode: "both",
        supportCoords: new Map(),
        supportLastUpdate: 0,
        supportTravelEnabled: false,
        supportTravelCoords: new Map(),
        supportTravelLastUpdate: 0,
        attackEnabled: false,
        attackExcludeBarbarians: false,
        attackExcludeFarm: false,
        attackCoords: new Map(),
        attackLastUpdate: 0,
        villageOwners: null,
        observer: null,
        refreshTimer: 0,
        pendingMiniRefresh: false,
        panel: null,
        launcher: null,
        mapToolbar: null,
        mapToggle: null,
        bonusMapToggle: null,
        supportMapToggle: null,
        supportTravelMapToggle: null,
        attackMapToggle: null,
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
            state.supportEnabled = saved.supportEnabled === true;
            state.supportTravelEnabled = saved.supportTravelEnabled === true;
            state.supportMode = ["own", "others", "both"].includes(saved.supportMode) ? saved.supportMode : "both";
            state.attackEnabled = saved.attackEnabled === true;
            state.attackExcludeBarbarians = saved.attackExcludeBarbarians === true;
            state.attackExcludeFarm = saved.attackExcludeFarm === true;
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
            supportEnabled: state.supportEnabled,
            supportTravelEnabled: state.supportTravelEnabled,
            supportMode: state.supportMode,
            attackEnabled: state.attackEnabled,
            attackExcludeBarbarians: state.attackExcludeBarbarians,
            attackExcludeFarm: state.attackExcludeFarm,
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
        if (state.supportEnabled) for (const [key, item] of state.supportCoords) merged.set(key, item);
        if (state.supportTravelEnabled) for (const [key, item] of state.supportTravelCoords) merged.set(key, item);
        if (state.attackEnabled) for (const [key, item] of state.attackCoords) merged.set(key, item);
        return merged;
    }

    function markerColorFor(x, y) {
        if (state.attackEnabled && state.attackCoords.has(`${x}|${y}`)) return "#d71920";
        if (state.supportTravelEnabled && state.supportTravelCoords.has(`${x}|${y}`)) return "#f08a00";
        if (state.supportEnabled && state.supportCoords.has(`${x}|${y}`)) return "#00a9d6";
        const bonus = state.bonusCoords.get(`${x}|${y}`);
        if (state.bonusEnabled && bonus) {
            const palette = ["#ffb000", "#00a950", "#1473e6", "#e53935", "#8e35d1", "#00a6b8", "#f05a16", "#d4148e"];
            return palette[Math.max(0, Number(bonus.bonus) - 1) % palette.length];
        }
        return zoneColor(zoneForCoordinate(x, y));
    }

    async function loadSupportedVillages(force = false) {
        if (!state.supportEnabled) {
            state.supportCoords.clear();
            return;
        }
        if (!force && state.supportCoords.size && Date.now() - state.supportLastUpdate < 2 * 60 * 1000) return;
        const url = `${gd.link_base_pure || `${location.origin}/game.php?village=${gd.village?.id}&screen=`}overview_villages&mode=units&type=away_detail&units_type=away_detail&group=0&page=-1`;
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`erro HTTP ${response.status}`);
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const own = await loadOwnVillages();
        const ownKeys = new Set(own.map(({ x, y }) => `${x}|${y}`));
        const found = new Map();
        const originRows = [...doc.querySelectorAll("#units_table tr.units_away")];
        for (const originRow of originRows) {
            // A linha units_away identifica a aldeia de partida. Os destinos onde
            // os apoios estão estacionados surgem nas linhas row_a/row_b seguintes.
            for (let row = originRow.nextElementSibling; row && !row.classList.contains("units_away"); row = row.nextElementSibling) {
                if (!row.matches("tr.row_a, tr.row_b")) continue;
                const targetCell = row.cells?.[0];
                if (!targetCell) continue;
                const targetLink = targetCell.querySelector('a[href*="screen=info_village"],a[href*="info_village"]');
                const match = targetCell.textContent.match(/(\d{1,3})\s*\|\s*(\d{1,3})/);
                if (!match) continue;
                const x = Number(match[1]);
                const y = Number(match[2]);
                const key = `${x}|${y}`;
                const isOwn = ownKeys.has(key);
                if (state.supportMode === "own" && !isOwn) continue;
                if (state.supportMode === "others" && isOwn) continue;
                const idMatch = String(targetLink?.href || "").match(/[?&]id=(\d+)/);
                found.set(key, { x, y, id: idMatch ? Number(idMatch[1]) : null, support: true, isOwn });
            }
        }
        state.supportCoords = found;
        state.supportLastUpdate = Date.now();
    }

    async function loadTravelingSupportVillages(force = false) {
        if (!state.supportTravelEnabled) {
            state.supportTravelCoords.clear();
            return;
        }
        if (!force && state.supportTravelCoords.size && Date.now() - state.supportTravelLastUpdate < 60 * 1000) return;
        const url = `${gd.link_base_pure || `${location.origin}/game.php?village=${gd.village?.id}&screen=`}overview_villages&mode=commands&type=support&group=0&page=-1`;
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`erro HTTP ${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), "text/html");
        const own = await loadOwnVillages();
        const ownKeys = new Set(own.map(({ x, y }) => `${x}|${y}`));
        const rows = [...doc.querySelectorAll("#commands_table tr.row_a, #commands_table tr.row_ax, #commands_table tr.row_b, #commands_table tr.row_bx")];
        const found = new Map();

        for (const row of rows) {
            const signature = `${row.className || ""} ${row.innerHTML || ""}`.toLowerCase();
            if (/return_|return\.png|back\.png|command[_-]?return/.test(signature)) continue;
            const targetLabel = row.querySelector(".quickedit-label");
            const targetLink = targetLabel?.closest("a") || targetLabel?.querySelector('a[href*="info_village"]') || null;
            const match = (targetLabel?.textContent || "").match(/(\d{1,3})\s*\|\s*(\d{1,3})/);
            if (!match) continue;
            const x = Number(match[1]);
            const y = Number(match[2]);
            const key = `${x}|${y}`;
            const isOwn = ownKeys.has(key);
            if (state.supportMode === "own" && !isOwn) continue;
            if (state.supportMode === "others" && isOwn) continue;
            const idMatch = String(targetLink?.href || "").match(/[?&]id=(\d+)/);
            const previous = found.get(key);
            found.set(key, { x, y, id: idMatch ? Number(idMatch[1]) : null, supportTravel: true, isOwn, count: (previous?.count || 0) + 1 });
        }
        state.supportTravelCoords = found;
        state.supportTravelLastUpdate = Date.now();
    }

    async function loadVillageOwners() {
        if (state.villageOwners) return state.villageOwners;
        const response = await fetch(`${location.origin}/map/village.txt`, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`erro HTTP ${response.status}`);
        const owners = new Map();
        (await response.text()).split("\n").forEach((line) => {
            const fields = line.trim().split(",");
            if (fields.length < 5) return;
            owners.set(`${Number(fields[2])}|${Number(fields[3])}`, Number(fields[4]));
        });
        state.villageOwners = owners;
        return owners;
    }

    function isFarmAssistantAttackRow(row) {
        const signature = `${row.textContent || ""} ${row.innerHTML || ""}`.toLowerCase();
        return /am_farm|farm_icon|\/farm\.png|command[_-]?farm|farm assistant|assistente de farm|assistente de saque|farmar/.test(signature);
    }

    async function loadAttackedVillages(force = false) {
        if (!state.attackEnabled) {
            state.attackCoords.clear();
            return;
        }
        if (!force && state.attackCoords.size && Date.now() - state.attackLastUpdate < 60 * 1000) return;
        const url = `${gd.link_base_pure || `${location.origin}/game.php?village=${gd.village?.id}&screen=`}overview_villages&mode=commands&type=attack&group=0&page=-1`;
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`erro HTTP ${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), "text/html");
        const owners = state.attackExcludeBarbarians ? await loadVillageOwners() : null;
        const rows = [...doc.querySelectorAll("#commands_table tr.row_a, #commands_table tr.row_ax, #commands_table tr.row_b, #commands_table tr.row_bx")];
        const found = new Map();

        for (const row of rows) {
            // Nesta vista, quickedit-label é o destino do comando. Outros links
            // presentes na linha podem apontar para a aldeia própria de origem.
            const targetLabel = row.querySelector(".quickedit-label");
            const targetLink = targetLabel?.closest("a") || targetLabel?.querySelector('a[href*="info_village"]') || null;
            const match = (targetLabel?.textContent || "").match(/(\d{1,3})\s*\|\s*(\d{1,3})/);
            if (!match) continue;
            const x = Number(match[1]);
            const y = Number(match[2]);
            const key = `${x}|${y}`;
            const isBarbarian = owners ? owners.get(key) === 0 : false;
            const isFarm = isFarmAssistantAttackRow(row);
            if (state.attackExcludeBarbarians && isBarbarian) continue;
            if (state.attackExcludeFarm && isFarm) continue;
            const idMatch = String(targetLink?.href || "").match(/[?&]id=(\d+)/);
            const previous = found.get(key);
            found.set(key, { x, y, id: idMatch ? Number(idMatch[1]) : null, attack: true, isBarbarian, isFarm, count: (previous?.count || 0) + 1 });
        }
        state.attackCoords = found;
        state.attackLastUpdate = Date.now();
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
            #${APP.id}-mapToolbar{position:absolute!important;top:9px!important;right:47px!important;z-index:1200!important;box-sizing:border-box!important;height:28px!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:4px!important}
            #${APP.id}-mapToolbar button{position:relative!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;z-index:auto!important;box-sizing:border-box!important;width:30px!important;min-width:30px!important;max-width:30px!important;height:28px!important;min-height:28px!important;padding:0!important;margin:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;vertical-align:middle!important;line-height:1!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#b33a34,#8f2420 55%,#681611)!important;cursor:pointer!important;box-shadow:inset 0 1px 0 #ffffff59,inset 0 -1px 0 #00000059,0 2px 5px #00000073!important}
            #${APP.id}-mapToolbar button:hover{background:linear-gradient(to bottom,#c4473e,#a02c27 55%,#7e1c17)!important}
            #${APP.id}-attackMapToggle{order:10!important}
            #${APP.id}-supportMapToggle{order:20!important}
            #${APP.id}-supportTravelMapToggle{order:25!important}
            #${APP.id}-bonusMapToggle{order:30!important}
            #${APP.id}-mapToggle{order:40!important}
            #${APP.id}-mapToggle .tp-togglePin{display:block!important;width:16px!important;height:16px!important;flex:0 0 16px!important;border:0!important;border-radius:50%!important;background:url("${APP.launcherIcon}") center/contain no-repeat!important;filter:none!important;box-shadow:inset 0 1px 1px #ffffff59,0 1px 1px #000!important}
            #${APP.id}-bonusMapToggle .tp-toggleBonus,#${APP.id}-supportMapToggle .tp-toggleSupport,#${APP.id}-supportTravelMapToggle .tp-toggleSupportTravel,#${APP.id}-attackMapToggle .tp-toggleAttack{display:grid!important;place-items:center!important;width:16px!important;height:16px!important;flex:0 0 16px!important;margin:0!important;text-shadow:0 1px 1px #000!important}
            #${APP.id}-bonusMapToggle .tp-toggleBonus{color:#f6d28b!important;font:bold 15px/16px Arial!important}
            #${APP.id}-supportMapToggle .tp-toggleSupport{color:#9de8ff!important;font:bold 15px/16px Arial!important}
            #${APP.id}-supportTravelMapToggle .tp-toggleSupportTravel{color:#ffd080!important;font:bold 16px/16px Arial!important}
            #${APP.id}-attackMapToggle .tp-toggleAttack{color:#fff!important;font:bold 16px/16px Arial!important}
            #${APP.id}-mapToolbar button.tp-off{border-color:#493b2b!important;background:linear-gradient(#80766a,#514940)!important;filter:saturate(.2)}
            #${APP.id}-mapToolbar button.tp-off::after{content:"";position:absolute;left:2px;top:12px;width:25px;height:3px;transform:rotate(-45deg);border-radius:2px;background:#f1d7a1;box-shadow:0 0 0 1px #5b1c13}
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
            .${APP.id}-head{padding:6px 12px;border-bottom:1px solid #c98c48;background:linear-gradient(#f7e8c1,#edd49a)}
            .${APP.id}-head strong{display:block;color:#8f2b25;font-size:16px;line-height:20px}
            .${APP.id}-head span{color:#5b350f;font-size:11px}
            .${APP.id}-content{overflow:auto;padding:3px 9px}
            .${APP.id}-section{display:grid;grid-template-columns:minmax(185px,235px) minmax(0,1fr);gap:5px 12px;padding:5px 0 6px 9px;border-top:1px solid #d5b579;border-left:4px solid #9b6a2f}
            .${APP.id}-section:first-child{border-top:0}.${APP.id}-section>div{min-width:0}
            .${APP.id}-section h3{margin:0 0 2px;color:#8f2b25;font-size:12px;line-height:14px;text-transform:uppercase}
            .${APP.id}-section p{margin:1px 0;color:#5e3b16;font-size:10px;line-height:12px}
            .${APP.id}-coordsSection{border-left-color:#c72d2d}.${APP.id}-toolsSection{border-left-color:#8b48c8}.${APP.id}-bonusSection{border-left-color:#18874a}.${APP.id}-supportSection{border-left-color:#00a9d6}.${APP.id}-attackSection{border-left-color:#d71920}.${APP.id}-zonesSection{border-left-color:#1f9ac5}.${APP.id}-settingsSection{border-left-color:#e0a51d}.${APP.id}-actionsSection{border-left-color:#8a6424}
            .${APP.id}-native textarea{width:100%;height:140px;resize:vertical;box-sizing:border-box;padding:5px;border:1px solid #804000;background:#fffdf6;font:12px Consolas,monospace}
            .${APP.id}-native .tp-row{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:10px 0}
            .${APP.id}-native .tp-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
            .${APP.id}-native button.tp-action{border:1px solid #653417;border-radius:3px;padding:6px 12px;background:linear-gradient(#9d6b3e,#70401f);color:#fff;font-weight:bold;cursor:pointer;text-shadow:1px 1px #000}
            .${APP.id}-native button.tp-secondary{background:linear-gradient(#fff6dd,#dfc99d);color:#43230f;text-shadow:none}
            .${APP.id}-native .tp-help{margin-bottom:5px;color:#67472f;font-size:11px;line-height:1.5}
            .${APP.id}-tools{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:3px 0}
            .${APP.id}-tool{border:1px solid #9a744b;background:#ead9b3;padding:5px}
            .${APP.id}-toolTitle{display:block;margin-bottom:4px;color:#4b2411;font:bold 11px Verdana}
            .${APP.id}-toolLine{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
            .${APP.id}-enableRow{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin:-5px -5px 5px;padding:5px 7px;border-bottom:1px solid #b58a52;background:#ddc48c}
            .${APP.id}-enableLabel{display:flex;align-items:center;gap:7px;color:#742019;font:bold 12px Verdana}
            .${APP.id}-enableLabel input{width:15px;height:15px;margin:0;accent-color:#a82822}
            .${APP.id}-optionsRow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:4px 0;color:#4b3218}
            .${APP.id}-tool input[type="number"],.${APP.id}-tool select{height:25px;border:1px solid #80522d;background:#fffaf0}
            .${APP.id}-tool input[type="number"]{width:58px}
            .${APP.id}-tool button{height:26px;border:1px solid #603419;background:linear-gradient(#9d6b3e,#70401f);color:#fff;font-weight:bold;cursor:pointer}
            .${APP.id}-bonusTool{grid-column:1/-1;background:#efe0ba}
            .${APP.id}-bonusOptions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px 8px;margin:3px 0}
            .${APP.id}-bonusOption{display:flex;align-items:flex-start;gap:5px;min-width:0;color:#3b2508;font-size:11px}
            .${APP.id}-bonusOption span{overflow-wrap:anywhere}.${APP.id}-bonusEmpty{color:#75583b;font-style:italic}
            .${APP.id}-zonesSection{display:none}.${APP.id}-zonesSection.tp-visible{display:grid}
            .${APP.id}-zonesOutput{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;max-height:165px;overflow:auto}
            .${APP.id}-zoneCard{min-width:0;border:2px solid var(--tp-zone-color);background:#f8eac4}
            .${APP.id}-zoneHead{display:flex;justify-content:space-between;padding:4px 7px;background:var(--tp-zone-color);color:#fff;text-shadow:1px 1px #000}
            .${APP.id}-zoneCard textarea{display:block;width:100%;height:48px!important;margin:0;border:0!important;background:#fff8e7!important;font:11px Consolas,monospace!important}
            .${APP.id}-supportSection .${APP.id}-tool,.${APP.id}-attackSection .${APP.id}-tool{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:4px 10px;align-items:center}
            .${APP.id}-supportSection .${APP.id}-enableRow,.${APP.id}-attackSection .${APP.id}-enableRow{grid-column:1/-1;margin-bottom:1px}
            .${APP.id}-supportSection .${APP.id}-toolTitle,.${APP.id}-attackSection .${APP.id}-toolTitle{margin:0}
            .${APP.id}-supportSection .${APP.id}-optionsRow,.${APP.id}-attackSection .${APP.id}-optionsRow{margin:0}
            .${APP.id}-supportSection .${APP.id}-toolLine,.${APP.id}-attackSection .${APP.id}-toolLine{justify-self:end}
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
        attachToTpScriptBar(button);
        state.launcher = button;
        setupLauncherPosition();
    }

    function getMapToggleHost() {
        const host = document.querySelector("#map_wrap") || document.querySelector("#map_container") || document.querySelector("#map")?.parentElement;
        if (host && getComputedStyle(host).position === "static") host.style.position = "relative";
        return host;
    }

    function getMapToolbar() {
        const host = getMapToggleHost();
        if (!host) return null;

        let toolbar = document.getElementById(`${APP.id}-mapToolbar`);

        if (!toolbar || toolbar.parentElement !== host) {
            toolbar?.remove();
            toolbar = document.createElement("div");
            toolbar.id = `${APP.id}-mapToolbar`;
            toolbar.setAttribute("aria-label", "Ferramentas do marcador no mapa");
            host.appendChild(toolbar);
        }

        state.mapToolbar = toolbar;
        return toolbar;
    }

    function createMapToggle() {
        document.getElementById(`${APP.id}-mapToggle`)?.remove();
        const toolbar = getMapToolbar();
        if (!toolbar) return;
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
        toolbar.appendChild(button);
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
        const toolbar = getMapToolbar();
        if (!toolbar) return;
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
        toolbar.appendChild(button);
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

    function createSupportMapToggle() {
        document.getElementById(`${APP.id}-supportMapToggle`)?.remove();
        const toolbar = getMapToolbar();
        if (!toolbar) return;
        const button = document.createElement("button");
        button.id = `${APP.id}-supportMapToggle`;
        button.type = "button";
        button.innerHTML = `<span class="tp-toggleSupport" aria-hidden="true">◆</span>`;
        button.addEventListener("click", async () => {
            state.supportEnabled = !state.supportEnabled;
            const checkbox = state.panel?.querySelector(".tp-support-enabled");
            if (checkbox) checkbox.checked = state.supportEnabled;
            if (state.supportEnabled) {
                try { await loadSupportedVillages(true); } catch (error) { notify(`Não foi possível carregar os apoios: ${error.message}`); }
            }
            save();
            updateSupportMapToggle();
            refreshMarkers(true);
            notify(state.supportEnabled ? "Marcações de tropas em apoio ativadas." : "Marcações de tropas em apoio desativadas.");
        });
        toolbar.appendChild(button);
        state.supportMapToggle = button;
        updateSupportMapToggle();
    }

    function updateSupportMapToggle() {
        const button = state.supportMapToggle || document.getElementById(`${APP.id}-supportMapToggle`);
        if (!button) return;
        button.classList.toggle("tp-off", !state.supportEnabled);
        button.title = state.supportEnabled ? "Desligar marcações de tropas em apoio" : "Ligar marcações de tropas em apoio";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-pressed", String(state.supportEnabled));
    }

    function createSupportTravelMapToggle() {
        document.getElementById(`${APP.id}-supportTravelMapToggle`)?.remove();
        const toolbar = getMapToolbar();
        if (!toolbar) return;
        const button = document.createElement("button");
        button.id = `${APP.id}-supportTravelMapToggle`;
        button.type = "button";
        button.innerHTML = `<span class="tp-toggleSupportTravel" aria-hidden="true">➜</span>`;
        button.addEventListener("click", async () => {
            state.supportTravelEnabled = !state.supportTravelEnabled;
            const checkbox = state.panel?.querySelector(".tp-support-travel-enabled");
            if (checkbox) checkbox.checked = state.supportTravelEnabled;
            if (state.supportTravelEnabled) {
                try { await loadTravelingSupportVillages(true); } catch (error) { notify(`Não foi possível carregar os apoios a caminho: ${error.message}`); }
            }
            save();
            updateSupportTravelMapToggle();
            refreshMarkers(true);
            notify(state.supportTravelEnabled ? "Marcações de apoios a caminho ativadas." : "Marcações de apoios a caminho desativadas.");
        });
        toolbar.appendChild(button);
        state.supportTravelMapToggle = button;
        updateSupportTravelMapToggle();
    }

    function updateSupportTravelMapToggle() {
        const button = state.supportTravelMapToggle || document.getElementById(`${APP.id}-supportTravelMapToggle`);
        if (!button) return;
        button.classList.toggle("tp-off", !state.supportTravelEnabled);
        button.title = state.supportTravelEnabled ? "Desligar marcações de apoios a caminho" : "Ligar marcações de apoios a caminho";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-pressed", String(state.supportTravelEnabled));
    }

    function createAttackMapToggle() {
        document.getElementById(`${APP.id}-attackMapToggle`)?.remove();
        const toolbar = getMapToolbar();
        if (!toolbar) return;
        const button = document.createElement("button");
        button.id = `${APP.id}-attackMapToggle`;
        button.type = "button";
        button.innerHTML = `<span class="tp-toggleAttack" aria-hidden="true">⚔</span>`;
        button.addEventListener("click", async () => {
            state.attackEnabled = !state.attackEnabled;
            const checkbox = state.panel?.querySelector(".tp-attack-enabled");
            if (checkbox) checkbox.checked = state.attackEnabled;
            if (state.attackEnabled) {
                try { await loadAttackedVillages(true); } catch (error) { notify(`Não foi possível carregar os ataques: ${error.message}`); }
            }
            save();
            updateAttackMapToggle();
            refreshMarkers(true);
            notify(state.attackEnabled ? "Marcações de aldeias atacadas ativadas." : "Marcações de aldeias atacadas desativadas.");
        });
        toolbar.appendChild(button);
        state.attackMapToggle = button;
        updateAttackMapToggle();
    }

    function updateAttackMapToggle() {
        const button = state.attackMapToggle || document.getElementById(`${APP.id}-attackMapToggle`);
        if (!button) return;
        button.classList.toggle("tp-off", !state.attackEnabled);
        button.title = state.attackEnabled ? "Desligar marcações de aldeias atacadas" : "Ligar marcações de aldeias atacadas";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-pressed", String(state.attackEnabled));
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
        if (state.launcher.closest("#tp-theplaguept-script-bar")) return;
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
                        <div><div class="${APP.id}-tool"><div class="${APP.id}-enableRow"><label class="${APP.id}-enableLabel"><input class="tp-enabled" type="checkbox" ${state.coordinatesEnabled ? "checked" : ""}> Ativar marcação da lista de coordenadas</label></div><div class="${APP.id}-optionsRow"><label>Cor base <input class="tp-color" type="color" value="${state.color}"></label><label><input class="tp-labels" type="checkbox" ${state.showLabels ? "checked" : ""}> Mostrar coordenada no mapa</label><strong class="tp-count">${state.coords.size} aldeia(s)</strong></div></div><textarea class="${APP.id}-coordsInput" spellcheck="false" placeholder="500|500\n501|502\n498|507">${escapeHtml(coordinates)}</textarea></div>
                    </section>
                    <section class="${APP.id}-section ${APP.id}-toolsSection">
                        <div><h3>Filtros e zonas</h3><p>Reduz a lista por distância e cria grupos geográficos limitados.</p></div>
                        <div class="${APP.id}-tools">
                            <div class="${APP.id}-tool"><span class="${APP.id}-toolTitle">Distância às minhas aldeias</span><div class="${APP.id}-toolLine"><span>Máximo</span><input class="tp-distance" type="number" min="1" max="200" step="1" value="${state.distance}"><span>campos</span><button class="tp-filter" type="button">Filtrar lista</button></div></div>
                            <div class="${APP.id}-tool"><span class="${APP.id}-toolTitle">Zonas geográficas</span><div class="${APP.id}-toolLine"><span>Máximo</span><select class="tp-zone-size"><option value="25" ${state.zoneSize === 25 ? "selected" : ""}>25 aldeias</option><option value="50" ${state.zoneSize === 50 ? "selected" : ""}>50 aldeias</option></select><button class="tp-zones" type="button">Criar zonas</button></div></div>
                        </div>
                    </section>
                    <section class="${APP.id}-section ${APP.id}-zonesSection ${state.zones.length ? "tp-visible" : ""}">
                        <div><h3>Zonas</h3><p>Uma caixa independente por zona, ordenada da mais próxima para a mais distante.</p></div>
                        <div class="${APP.id}-zonesOutput">${zonesCardsHtml(state.zones)}</div>
                    </section>
                    <section class="${APP.id}-section ${APP.id}-supportSection">
                        <div><h3>Tropas em apoio</h3><p>Marca separadamente os apoios estacionados e os que ainda estão a caminho.</p></div>
                        <div class="${APP.id}-tool"><div class="${APP.id}-enableRow"><label class="${APP.id}-enableLabel"><input class="tp-support-enabled" type="checkbox" ${state.supportEnabled ? "checked" : ""}> Estacionados</label><label class="${APP.id}-enableLabel"><input class="tp-support-travel-enabled" type="checkbox" ${state.supportTravelEnabled ? "checked" : ""}> A caminho</label></div><span class="${APP.id}-toolTitle">Destinos a apresentar</span><div class="${APP.id}-optionsRow"><select class="tp-support-mode"><option value="own" ${state.supportMode === "own" ? "selected" : ""}>Apenas minhas aldeias</option><option value="others" ${state.supportMode === "others" ? "selected" : ""}>Apenas aldeias de outros jogadores</option><option value="both" ${state.supportMode === "both" ? "selected" : ""}>Minhas e de outros jogadores</option></select></div><div class="${APP.id}-toolLine"><button class="tp-support-apply" type="button">Carregar apoios e marcar</button><strong class="tp-support-count">${state.supportCoords.size} estacionado(s)</strong><strong class="tp-support-travel-count">${state.supportTravelCoords.size} a caminho</strong></div></div>
                    </section>
                    <section class="${APP.id}-section ${APP.id}-attackSection">
                        <div><h3>Aldeias atacadas</h3><p>Marca os destinos dos teus ataques em curso e apresenta as coordenadas no mapa.</p></div>
                        <div class="${APP.id}-tool"><div class="${APP.id}-enableRow"><label class="${APP.id}-enableLabel"><input class="tp-attack-enabled" type="checkbox" ${state.attackEnabled ? "checked" : ""}> Ativar marcação de aldeias atacadas</label></div><span class="${APP.id}-toolTitle">Filtros dos ataques</span><div class="${APP.id}-optionsRow"><label><input class="tp-attack-exclude-barb" type="checkbox" ${state.attackExcludeBarbarians ? "checked" : ""}> Excluir aldeias bárbaras</label><label><input class="tp-attack-exclude-farm" type="checkbox" ${state.attackExcludeFarm ? "checked" : ""}> Excluir Assistente de Farm</label></div><div class="${APP.id}-toolLine"><button class="tp-attack-apply" type="button">Carregar ataques e marcar</button><strong class="tp-attack-count">${state.attackCoords.size ? `${state.attackCoords.size} encontrada(s)` : ""}</strong></div></div>
                    </section>
                    <section class="${APP.id}-section ${APP.id}-bonusSection">
                        <div><h3>Bárbaras bónus</h3><p>Analisa automaticamente as aldeias bárbaras e marca apenas os tipos de bónus selecionados.</p></div>
                        <div class="${APP.id}-tool ${APP.id}-bonusTool"><div class="${APP.id}-enableRow"><label class="${APP.id}-enableLabel"><input class="tp-bonus-enabled" type="checkbox" ${state.bonusEnabled ? "checked" : ""}> Ativar marcação de bárbaras bónus</label></div><span class="${APP.id}-toolTitle">Tipos de aldeia bónus</span><div class="${APP.id}-bonusOptions">${bonusOptionsHtml()}</div><div class="${APP.id}-toolLine"><button class="tp-bonus-apply" type="button">Analisar mapa e marcar</button><strong class="tp-bonus-count">${state.bonusCoords.size ? `${state.bonusCoords.size} encontrada(s)` : ""}</strong></div></div>
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
        panel.querySelector(".tp-support-apply")?.addEventListener("click", async (event) => {
            const button = event.currentTarget;
            state.supportMode = panel.querySelector(".tp-support-mode").value;
            state.supportEnabled = panel.querySelector(".tp-support-enabled").checked;
            state.supportTravelEnabled = panel.querySelector(".tp-support-travel-enabled").checked;
            button.disabled = true;
            button.textContent = "A carregar…";
            try {
                await Promise.all([loadSupportedVillages(true), loadTravelingSupportVillages(true)]);
                save();
                updateSupportMapToggle();
                updateSupportTravelMapToggle();
                refreshMarkers(true);
                const count = panel.querySelector(".tp-support-count");
                if (count) count.textContent = `${state.supportCoords.size} estacionado(s)`;
                const travelCount = panel.querySelector(".tp-support-travel-count");
                if (travelCount) travelCount.textContent = `${state.supportTravelCoords.size} a caminho`;
                notify(`${state.supportCoords.size} apoio(s) estacionado(s) e ${state.supportTravelCoords.size} a caminho marcado(s).`);
            } catch (error) {
                notify(`Não foi possível carregar os apoios: ${error.message}`);
            } finally {
                button.disabled = false;
                button.textContent = "Carregar apoios e marcar";
            }
        });
        panel.querySelector(".tp-attack-apply")?.addEventListener("click", async (event) => {
            const button = event.currentTarget;
            state.attackExcludeBarbarians = panel.querySelector(".tp-attack-exclude-barb").checked;
            state.attackExcludeFarm = panel.querySelector(".tp-attack-exclude-farm").checked;
            state.attackEnabled = panel.querySelector(".tp-attack-enabled").checked;
            button.disabled = true;
            button.textContent = "A carregar…";
            try {
                await loadAttackedVillages(true);
                save();
                updateAttackMapToggle();
                refreshMarkers(true);
                const count = panel.querySelector(".tp-attack-count");
                if (count) count.textContent = `${state.attackCoords.size} encontrada(s)`;
                notify(`${state.attackCoords.size} aldeia(s) atacada(s) marcada(s).`);
            } catch (error) {
                notify(`Não foi possível carregar os ataques: ${error.message}`);
            } finally {
                button.disabled = false;
                button.textContent = "Carregar ataques e marcar";
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
            state.supportMode = panel.querySelector(".tp-support-mode")?.value || "both";
            state.supportEnabled = panel.querySelector(".tp-support-enabled")?.checked === true;
            state.supportTravelEnabled = panel.querySelector(".tp-support-travel-enabled")?.checked === true;
            state.attackExcludeBarbarians = panel.querySelector(".tp-attack-exclude-barb")?.checked === true;
            state.attackExcludeFarm = panel.querySelector(".tp-attack-exclude-farm")?.checked === true;
            state.attackEnabled = panel.querySelector(".tp-attack-enabled")?.checked === true;
            try { await loadBonusBarbarians(); } catch (error) { notify(`Não foi possível analisar os bónus: ${error.message}`); }
            try { await loadSupportedVillages(true); } catch (error) { notify(`Não foi possível carregar os apoios: ${error.message}`); }
            try { await loadTravelingSupportVillages(true); } catch (error) { notify(`Não foi possível carregar os apoios a caminho: ${error.message}`); }
            try { await loadAttackedVillages(true); } catch (error) { notify(`Não foi possível carregar os ataques: ${error.message}`); }
            save();
            updateMapToggle();
            updateBonusMapToggle();
            updateSupportMapToggle();
            updateSupportTravelMapToggle();
            updateAttackMapToggle();
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
            createSupportMapToggle();
            createSupportTravelMapToggle();
            createAttackMapToggle();
            observeMap();
            const loaders = [];
            if (state.bonusEnabled && state.bonusTypes.length) loaders.push(loadBonusBarbarians());
            if (state.supportEnabled) loaders.push(loadSupportedVillages());
            if (state.supportTravelEnabled) loaders.push(loadTravelingSupportVillages());
            if (state.attackEnabled) loaders.push(loadAttackedVillages());
            Promise.allSettled(loaders).then(() => refreshMarkers(true));
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
            const support = state.supportCoords.get(`${x}|${y}`);
            const supportTravel = state.supportTravelCoords.get(`${x}|${y}`);
            const attack = state.attackCoords.get(`${x}|${y}`);
            const details = [];
            if (attack) details.push(`${attack.count} ataque(s) em curso${attack.isBarbarian ? " — aldeia bárbara" : ""}${attack.isFarm ? " — Assistente de Farm" : ""}`);
            if (supportTravel) details.push(`${supportTravel.count} apoio(s) a caminho (${supportTravel.isOwn ? "aldeia própria" : "outro jogador"})`);
            if (support) details.push(`tropas estacionadas em apoio (${support.isOwn ? "aldeia própria" : "outro jogador"})`);
            if (bonus) details.push(bonusData()?.[bonus.bonus]?.text || `Bónus ${bonus.bonus}`);
            marker.title = details.length ? `${x}|${y} — ${details.join("; ")}` : `${x}|${y}`;
            marker.style.setProperty("--tp-marker-color", markerColorFor(x, y));
            marker.style.left = `${left}px`;
            marker.style.top = `${top}px`;
            marker.innerHTML = `<i class="${APP.id}-pinIcon"></i>${state.showLabels || attack || supportTravel ? `<b class="${APP.id}-pinLabel">${x}|${y}</b>` : ""}`;
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
