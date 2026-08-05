// ==UserScript==
// @name         TW PT - Marcador de Aldeias no Mapa ThePlaguePT
// @namespace    theplaguept.tw.map-marker
// @version      1.0.0
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
        version: "1.0.0",
        defaultColor: "#ff2d2d",
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
            #${APP.id}-launcher{position:fixed;right:12px;top:154px;z-index:60020;border:1px solid #5d2f16;border-radius:4px;padding:6px 9px;background:linear-gradient(#f5e4bd,#d9b778);color:#3b1d0d;font:bold 12px Verdana;cursor:pointer;box-shadow:0 2px 6px #0005}
            #${APP.id}-launcher:hover{filter:brightness(1.08)}
            #${APP.id}-panel{position:fixed;inset:0;z-index:60040;background:#0008;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
            #${APP.id}-panel.tp-hidden{display:none}
            #${APP.id}-panel .tp-card{width:min(580px,96vw);max-height:92vh;overflow:auto;border:2px solid #6c3b1e;border-radius:7px;background:#f4e4bc;color:#32190d;box-shadow:0 8px 32px #000a;font:13px Verdana}
            #${APP.id}-panel .tp-head{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:linear-gradient(#a16b3d,#75401f);color:#fff;font-weight:bold}
            #${APP.id}-panel .tp-close{border:0;background:transparent;color:#fff;font:bold 20px Arial;cursor:pointer}
            #${APP.id}-panel .tp-body{padding:12px}
            #${APP.id}-panel textarea{width:100%;height:210px;resize:vertical;box-sizing:border-box;padding:8px;border:1px solid #9b7652;background:#fffdf6;font:13px Consolas,monospace}
            #${APP.id}-panel .tp-row{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:10px 0}
            #${APP.id}-panel .tp-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
            #${APP.id}-panel button.tp-action{border:1px solid #653417;border-radius:3px;padding:6px 12px;background:#815026;color:#fff;font-weight:bold;cursor:pointer}
            #${APP.id}-panel button.tp-secondary{background:#eee0bd;color:#43230f}
            #${APP.id}-panel .tp-help{color:#67472f;font-size:11px;line-height:1.5}
            .${APP.id}-marked{overflow:visible!important;filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 4px var(--tp-marker-color))!important;outline:3px solid var(--tp-marker-color)!important;outline-offset:1px!important;border-radius:50%!important;z-index:20!important}
            .${APP.id}-badge{position:absolute;z-index:1000;pointer-events:none;transform:translate(-50%,-115%);padding:1px 3px;border-radius:2px;background:var(--tp-marker-color);color:#fff;text-shadow:0 1px #000;font:bold 9px Arial;white-space:nowrap;box-shadow:0 1px 2px #0008}
            .${APP.id}-minimapOverlay{position:absolute;inset:0;z-index:50;pointer-events:none;overflow:hidden}
            .${APP.id}-miniDot{position:absolute;width:8px;height:8px;transform:translate(-50%,-50%);box-sizing:border-box;border:2px solid #fff;border-radius:50%;background:var(--tp-marker-color);box-shadow:0 0 0 2px var(--tp-marker-color),0 0 5px #000}
        `;
        document.head.appendChild(style);
    }

    function createLauncher() {
        document.getElementById(`${APP.id}-launcher`)?.remove();
        const button = document.createElement("button");
        button.id = `${APP.id}-launcher`;
        button.type = "button";
        button.textContent = "📍 Aldeias";
        button.title = `${APP.title} v${APP.version}`;
        button.addEventListener("click", openPanel);
        document.body.appendChild(button);
    }

    function openPanel() {
        state.panel?.remove();
        const panel = document.createElement("div");
        panel.id = `${APP.id}-panel`;
        const coordinates = [...state.coords.values()].map(({ x, y }) => `${x}|${y}`).join("\n");
        panel.innerHTML = `
            <div class="tp-card" role="dialog" aria-modal="true" aria-labelledby="${APP.id}-title">
                <div class="tp-head"><span id="${APP.id}-title">📍 ${APP.title}</span><button class="tp-close" title="Fechar">×</button></div>
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
                </div>
            </div>`;
        document.body.appendChild(panel);
        state.panel = panel;
        const textarea = panel.querySelector("textarea");
        const updateCount = () => panel.querySelector(".tp-count").textContent = `${parseCoordinates(textarea.value).size} aldeia(s)`;
        textarea.addEventListener("input", updateCount);
        panel.querySelector(".tp-close").addEventListener("click", closePanel);
        panel.addEventListener("click", (event) => { if (event.target === panel) closePanel(); });
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
        state.panel?.remove();
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
            node.classList?.contains(`${APP.id}-miniDot`);
    }

    function refreshMarkers() {
        removeMarkers();
        if (!state.enabled || !state.coords.size) return;
        markVillageElements();
        markPoliticalMap();
    }

    function removeMarkers() {
        document.querySelectorAll(`.${APP.id}-marked`).forEach((el) => el.classList.remove(`${APP.id}-marked`));
        document.querySelectorAll(`.${APP.id}-badge,.${APP.id}-minimapOverlay`).forEach((el) => el.remove());
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
