// ==UserScript==
// @name         TW PT - Marcador de Aldeias no Mapa ThePlaguePT
// @namespace    theplaguept.tw.map-marker
// @version      1.3.0
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
        version: "1.3.0",
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
        enabled: true,
        observer: null,
        refreshTimer: 0,
        panel: null,
        launcher: null,
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
            state.enabled = saved.enabled !== false;
            setCoordinates(Array.isArray(saved.coords) ? saved.coords.map((item) => `${item.x}|${item.y}`) : []);
        } catch (_) {
            // Uma preferência inválida nunca deve impedir o carregamento do mapa.
        }
    }

    function save() {
        localStorage.setItem(storageKey, JSON.stringify({
            coords: [...state.coords.values()],
            color: state.color,
            showLabels: state.showLabels,
            enabled: state.enabled,
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

    function injectStyles() {
        const style = document.createElement("style");
        style.textContent = `
            #${APP.id}-launcher{position:fixed!important;top:432px!important;right:auto!important;left:16px!important;z-index:${APP.zIndex}!important;box-sizing:border-box!important;width:30px!important;min-width:30px!important;height:28px!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:0!important;overflow:hidden!important;cursor:pointer!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#b33a34,#8f2420 55%,#681611)!important;box-shadow:inset 0 1px 0 #ffffff59,inset 0 -1px 0 #00000059,0 2px 5px #00000073!important;color:#fff!important;font:700 12px Verdana,Arial,sans-serif!important;text-shadow:1px 1px 1px #000!important;white-space:nowrap!important;padding:0 6px!important;transition:width .18s ease,min-width .18s ease,padding .18s ease,gap .18s ease,background .18s ease!important}
            #${APP.id}-launcher:hover,#${APP.id}-launcher:focus-visible{width:390px!important;min-width:390px!important;gap:8px!important;padding:0 9px!important;background:linear-gradient(to bottom,#c4473e,#a02c27 55%,#7e1c17)!important}
            .${APP.id}-launcherIcon{width:16px!important;height:16px!important;flex:0 0 16px!important;border-radius:50%!important;background:url("${APP.launcherIcon}") center/contain no-repeat!important;box-shadow:inset 0 1px 1px #ffffff59,0 1px 1px #000!important}
            .${APP.id}-launcherLabel{display:inline-block!important;max-width:0!important;opacity:0!important;overflow:hidden!important;transform:translateX(-4px)!important;white-space:nowrap!important;transition:max-width .18s ease,opacity .14s ease,transform .18s ease!important}
            #${APP.id}-launcher:hover .${APP.id}-launcherLabel,#${APP.id}-launcher:focus-visible .${APP.id}-launcherLabel{max-width:345px!important;opacity:1!important;transform:translateX(0)!important}
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
            .${APP.id}-native{box-sizing:border-box;width:590px;max-width:calc(100vw - 70px);padding:6px 8px 10px;color:#32190d;font:13px Verdana,Arial,sans-serif}
            .${APP.id}-native textarea{width:100%;height:210px;resize:vertical;box-sizing:border-box;padding:8px;border:1px solid #804000;background:#fffdf6;font:13px Consolas,monospace}
            .${APP.id}-native .tp-row{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:10px 0}
            .${APP.id}-native .tp-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
            .${APP.id}-native button.tp-action{border:1px solid #653417;border-radius:3px;padding:6px 12px;background:linear-gradient(#9d6b3e,#70401f);color:#fff;font-weight:bold;cursor:pointer;text-shadow:1px 1px #000}
            .${APP.id}-native button.tp-secondary{background:linear-gradient(#fff6dd,#dfc99d);color:#43230f;text-shadow:none}
            .${APP.id}-native .tp-help{margin-bottom:5px;color:#67472f;font-size:11px;line-height:1.5}
            .${APP.id}-marked{overflow:visible!important;filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 4px var(--tp-marker-color))!important;outline:3px solid var(--tp-marker-color)!important;outline-offset:1px!important;border-radius:50%!important;z-index:20!important}
            .${APP.id}-badge{position:absolute;z-index:1000;pointer-events:none;transform:translate(-50%,-115%);padding:1px 3px;border-radius:2px;background:var(--tp-marker-color);color:#fff;text-shadow:0 1px #000;font:bold 9px Arial;white-space:nowrap;box-shadow:0 1px 2px #0008}
            .${APP.id}-minimapOverlay{position:absolute;inset:0;z-index:50;pointer-events:none;overflow:hidden}
            .${APP.id}-miniDot{position:absolute;width:6px;height:6px;transform:translate(-50%,-90%) rotate(-45deg);box-sizing:border-box;border:1px solid #5f1713;border-radius:50% 50% 50% 0;background:var(--tp-marker-color);box-shadow:0 1px 1px #0008}
            .${APP.id}-mainOverlay{z-index:100!important}
            .${APP.id}-mapPin{position:absolute;width:0;height:0;z-index:40;pointer-events:none;color:var(--tp-marker-color)}
            .${APP.id}-pinIcon{position:absolute;left:0;bottom:0;width:15px;height:15px;box-sizing:border-box;transform:translateX(-50%) rotate(-45deg);transform-origin:50% 50%;border:1px solid #5f1713;border-radius:50% 50% 50% 0;background:currentColor;box-shadow:0 1px 2px #0009}
            .${APP.id}-pinIcon::after{content:"";position:absolute;left:4px;top:4px;width:5px;height:5px;border-radius:50%;background:#f4dfb5;box-shadow:inset 0 0 0 1px #6a2b20}
            .${APP.id}-pinLabel{position:absolute;left:0;bottom:19px;transform:translateX(-50%);padding:2px 4px;border:1px solid #612019;border-radius:2px;background:var(--tp-marker-color);color:#fff;text-shadow:1px 1px #000;font:bold 10px Verdana;line-height:12px;white-space:nowrap;box-shadow:0 1px 2px #0008}
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
            <div class="tp-body">
                    <div class="tp-help">Cola coordenadas em qualquer texto. São aceites, por exemplo, <b>500|500</b>, <b>500 500</b> e <b>500,500</b>. Repetidas são removidas automaticamente.</div>
                    <textarea spellcheck="false" placeholder="500|500\n501|502\n498|507">${escapeHtml(coordinates)}</textarea>
                    <div class="tp-row">
                        <label>Cor <input class="tp-color" type="color" value="${state.color}"></label>
                        <label><input class="tp-labels" type="checkbox" ${state.showLabels ? "checked" : ""}> Mostrar coordenada no mapa</label>
                        <label><input class="tp-enabled" type="checkbox" ${state.enabled ? "checked" : ""}> Marcações ativas</label>
                        <strong class="tp-count">${state.coords.size} aldeia(s)</strong>
                    </div>
                    <div class="tp-actions"><button class="tp-action tp-secondary tp-clear">Limpar</button><button class="tp-action tp-save">Guardar e marcar</button></div>
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
        textarea.addEventListener("input", updateCount);
        panel.querySelector(".tp-clear").addEventListener("click", () => { textarea.value = ""; updateCount(); });
        panel.querySelector(".tp-save").addEventListener("click", () => {
            setCoordinates(textarea.value);
            state.color = panel.querySelector(".tp-color").value;
            state.showLabels = panel.querySelector(".tp-labels").checked;
            state.enabled = panel.querySelector(".tp-enabled").checked;
            save();
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
            observeMap();
            refreshMarkers();
            return;
        }
        setTimeout(() => waitForMap(attempt + 1), 250);
    }

    function observeMap() {
        state.observer?.disconnect();
        state.observer = new MutationObserver((mutations) => {
            const hasGameChange = mutations.some((mutation) => {
                if (mutation.type === "attributes") {
                    return !mutation.target.classList?.contains(`${APP.id}-marked`) &&
                        !mutation.target.classList?.contains(`${APP.id}-minimapOverlay`);
                }
                const changed = [...mutation.addedNodes, ...mutation.removedNodes];
                return changed.some((node) => node.nodeType !== 1 || !isOwnMarker(node));
            });
            if (hasGameChange) scheduleRefresh();
        });
        state.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "style"] });
        window.addEventListener("resize", scheduleRefresh, { passive: true });
        document.addEventListener("mouseup", scheduleRefresh, { passive: true });
    }

    function scheduleRefresh() {
        clearTimeout(state.refreshTimer);
        state.refreshTimer = setTimeout(refreshMarkers, 80);
    }

    function isOwnMarker(node) {
        return node.classList?.contains(`${APP.id}-badge`) ||
            node.classList?.contains(`${APP.id}-minimapOverlay`) ||
            node.classList?.contains(`${APP.id}-miniDot`) ||
            node.classList?.contains(`${APP.id}-mapPin`);
    }

    function refreshMarkers() {
        removeMarkers();
        if (!state.enabled || !state.coords.size) return;
        markMainMapAnchored();
        markPoliticalMap();
    }

    function markMainMapAnchored() {
        const twMap = window.TWMap;
        if (!twMap?.villages) return;
        for (const { x, y } of state.coords.values()) {
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
            marker.title = `${x}|${y}`;
            marker.style.setProperty("--tp-marker-color", state.color);
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
                if (!coord || !state.coords.has(`${coord[0]}|${coord[1]}`)) continue;
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

    function removeMarkers() {
        document.querySelectorAll(`.${APP.id}-marked`).forEach((el) => el.classList.remove(`${APP.id}-marked`));
        document.querySelectorAll(`.${APP.id}-badge,.${APP.id}-minimapOverlay,.${APP.id}-mapPin`).forEach((el) => el.remove());
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
            if (!state.coords.has(`${x}|${y}`)) return;
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
        for (const { x, y } of state.coords.values()) {
            if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
            const dot = document.createElement("span");
            dot.className = `${APP.id}-miniDot`;
            dot.title = `${x}|${y}`;
            dot.style.left = `${((x - bounds.minX) / (bounds.maxX - bounds.minX)) * 100}%`;
            dot.style.top = `${((y - bounds.minY) / (bounds.maxY - bounds.minY)) * 100}%`;
            overlay.appendChild(dot);
        }
        if (overlay.childElementCount) container.appendChild(overlay);
    }

    function markPoliticalMapByGrid(container) {
        const twMap = window.TWMap || {};
        const candidates = [twMap.minimap, twMap.pmap, twMap.politicalMap, twMap.pmapHandler?.map].filter(Boolean);
        for (const map of candidates) {
            if (!Array.isArray(map.pos) || typeof map.coordByPixel !== "function") continue;
            const width = container.clientWidth;
            const height = container.clientHeight;
            const found = new Map();
            // Amostragem de 2 px: os campos do minimapa têm normalmente 4–6 px.
            for (let py = 0; py <= height && found.size < state.coords.size; py += 2) {
                for (let px = 0; px <= width && found.size < state.coords.size; px += 2) {
                    const coord = map.coordByPixel(map.pos[0] + px, map.pos[1] + py);
                    const key = coord && `${coord[0]}|${coord[1]}`;
                    if (key && state.coords.has(key) && !found.has(key)) found.set(key, { px, py });
                }
            }
            if (!found.size) continue;
            if (getComputedStyle(container).position === "static") container.style.position = "relative";
            const overlay = document.createElement("div");
            overlay.className = `${APP.id}-minimapOverlay`;
            overlay.style.setProperty("--tp-marker-color", state.color);
            for (const [key, point] of found) {
                const dot = document.createElement("span");
                dot.className = `${APP.id}-miniDot`;
                dot.title = key;
                dot.style.left = `${point.px}px`;
                dot.style.top = `${point.py}px`;
                overlay.appendChild(dot);
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
