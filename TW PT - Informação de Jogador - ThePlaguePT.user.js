// ==UserScript==
// @name         TW PT - Informação de Jogador - ThePlaguePT
// @namespace    theplaguept.tw.resumo24h-jogador
// @version      1.0.0
// @description  Painel com resumo das ultimas 24h de um jogador: pontos, aldeias, conquistas e OD.
// @author       ThePlaguePT
// @match        https://*.tribalwars.com.pt/game.php*
// @include      *://*.tribalwars.*/game.php*
// @homepageURL  https://github.com/ThePlaguePT/TribalWars-Scripts
// @supportURL   https://github.com/ThePlaguePT/TribalWars-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Informa%C3%A7%C3%A3o%20de%20Jogador%20-%20ThePlaguePT.user.js
// @downloadURL  https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Informa%C3%A7%C3%A3o%20de%20Jogador%20-%20ThePlaguePT.user.js
// @grant        none
// @run-at       document-idle
// @noframes
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// ==/UserScript==

(() => {
    "use strict";

    if (window.top !== window.self) return;
    if (!/tribalwars\./i.test(window.location.hostname)) return;

    const APP = {
        id: "tpResumo24h",
        version: "1.0.0",
        title: "Informação de Jogador",
        mapCacheMs: 50 * 60 * 1000,
        conquerCacheMs: 90 * 1000,
        minSnapshotGapMs: 10 * 60 * 1000,
        snapshotRetentionMs: 10 * 24 * 60 * 60 * 1000,
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
    };

    const nf = new Intl.NumberFormat("pt-PT");

    init();

    function init() {
        injectStyle();
        createLauncher();
        registerHubShortcut();

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && state.panel && !state.panel.classList.contains(`${APP.id}-hidden`)) {
                closePanel();
            }
        });

        window.TPResumo24hJogador = {
            open: openPanel,
            run: () => runSummary(false),
            version: APP.version,
        };
    }

    function createLauncher() {
        if (document.getElementById(`${APP.id}-launcher`)) return;

        const button = document.createElement("button");
        button.id = `${APP.id}-launcher`;
        button.type = "button";
        button.textContent = "24h";
        button.title = "Resumo 24h de jogador";
        button.addEventListener("click", openPanel);
        document.body.appendChild(button);
        state.launcher = button;
    }

    function registerHubShortcut() {
        const item = {
            id: "resumo-24h-jogador-theplaguept",
            label: "Resumo 24h",
            group: "Paineis",
            description: "Abre o resumo de pontos, aldeias e OD das ultimas 24h.",
            order: 35,
            run: openPanel,
        };
        window.TWHubQueue = window.TWHubQueue || [];
        window.TWHubQueue.push(item);
    }

    function openPanel() {
        if (!state.panel) createPanel();
        state.panel.classList.remove(`${APP.id}-hidden`);
        const guess = defaultPlayerQuery();
        if (guess && !state.controls.playerInput.value.trim()) {
            state.controls.playerInput.value = guess;
        }
        window.setTimeout(() => state.controls.playerInput.focus(), 20);
    }

    function closePanel() {
        if (state.panel) state.panel.classList.add(`${APP.id}-hidden`);
    }

    function createPanel() {
        const panel = document.createElement("div");
        panel.id = `${APP.id}-panel`;
        panel.innerHTML = `
            <div class="${APP.id}-head">
                <div>
                    <strong>${APP.title}</strong>
                    <span>Jogador</span>
                </div>
                <button type="button" class="${APP.id}-icon" data-action="close" title="Fechar">x</button>
            </div>
            <form class="${APP.id}-search">
                <input type="text" name="player" autocomplete="off" placeholder="Nome ou ID do jogador">
                <button type="submit">Resumo</button>
                <button type="button" data-action="force">Atualizar</button>
            </form>
            <div class="${APP.id}-status">Pronto.</div>
            <div class="${APP.id}-body">
                <div class="${APP.id}-empty">
                    Escreve um jogador para carregar o resumo.
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        state.panel = panel;
        state.controls.playerInput = panel.querySelector('input[name="player"]');
        state.controls.status = panel.querySelector(`.${APP.id}-status`);
        state.controls.body = panel.querySelector(`.${APP.id}-body`);
        state.controls.submit = panel.querySelector('button[type="submit"]');
        state.controls.force = panel.querySelector('[data-action="force"]');

        panel.querySelector('[data-action="close"]').addEventListener("click", closePanel);
        panel.querySelector("form").addEventListener("submit", (event) => {
            event.preventDefault();
            runSummary(false);
        });
        state.controls.force.addEventListener("click", () => runSummary(true));
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
            setStatus(`Atualizado: ${formatDateTime(new Date(result.generatedAt))}`);
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
        const since = Math.floor((now - APP.baselineTargetMs) / 1000);

        const playersText = await fetchCachedText("players", "/map/player.txt", APP.mapCacheMs, force);
        const players = parsePlayers(playersText);
        const player = findPlayer(players, query);
        if (!player) throw new Error("Jogador nao encontrado no player.txt.");

        const conquerPromise = fetchConquestsSince(since, force);
        const villagePromise = fetchCachedText("villages", "/map/village.txt", APP.mapCacheMs, force);
        const odPromise = loadOdEntries(player.id, force);

        const [conquerText, villagesText, od] = await Promise.all([
            conquerPromise,
            villagePromise,
            odPromise,
        ]);

        const villages = parseVillages(villagesText);
        const conquests = summarizeConquests(conquerText, villages, players.byId, player.id, since);

        const current = {
            ts: now,
            playerId: player.id,
            name: player.name,
            points: player.points,
            villages: player.villages,
            rank: player.rank,
            od,
        };

        const history = loadSnapshots(player.id);
        const baseline = chooseBaseline(history, now);
        const diffs = buildDiffs(current, baseline);
        saveSnapshot(current);

        return {
            generatedAt: now,
            since,
            player,
            current,
            baseline,
            diffs,
            conquests,
            odSupportAvailable: od.support !== null,
            supportSource: od.supportSource || "",
        };
    }

    async function fetchConquestsSince(since, force) {
        const recentPath = `/interface.php?func=get_conquer&since=${since}`;
        try {
            return await fetchCachedText("conquer24h", recentPath, APP.conquerCacheMs, force);
        } catch (error) {
            console.warn(`[${APP.id}] interface conquer falhou; a usar /map/conquer.txt`, error);
            return fetchCachedText("conquerFull", "/map/conquer.txt", APP.conquerCacheMs, force);
        }
    }

    async function loadOdEntries(playerId, force) {
        const [totalText, offText, defText, supportData] = await Promise.all([
            fetchFirstAvailable("odTotal", OD_FILES.total, APP.mapCacheMs, force, true),
            fetchFirstAvailable("odOff", OD_FILES.off, APP.mapCacheMs, force, true),
            fetchFirstAvailable("odDef", OD_FILES.def, APP.mapCacheMs, force, true),
            fetchFirstAvailable("odSupport", OD_FILES.support, APP.mapCacheMs, force, true),
        ]);

        return {
            total: findKillEntry(totalText.text, playerId),
            off: findKillEntry(offText.text, playerId),
            def: findKillEntry(defText.text, playerId),
            support: supportData.text ? findKillEntry(supportData.text, playerId) : null,
            supportSource: supportData.path || "",
        };
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

    function summarizeConquests(text, villages, playersById, playerId, since) {
        const gained = [];
        const lost = [];

        for (const line of splitLines(text)) {
            const cols = line.split(",");
            if (cols.length < 4) continue;

            const timestamp = toInt(cols[1]);
            if (timestamp < since) continue;

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

    function diffNumber(current, previous) {
        if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
        return current - previous;
    }

    function diffScore(current, previous) {
        if (!current || !previous) return null;
        if (!Number.isFinite(current.score) || !Number.isFinite(previous.score)) return null;
        return current.score - previous.score;
    }

    function chooseBaseline(history, now) {
        const target = now - APP.baselineTargetMs;
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

    function renderResult(result) {
        const baselineAge = result.baseline ? result.generatedAt - result.baseline.ts : null;
        const baselineText = result.baseline
            ? `${formatDuration(baselineAge)} atras`
            : "sem snapshot local perto de 24h";
        const baselineOk = result.baseline && Math.abs(baselineAge - APP.baselineTargetMs) <= APP.baselineToleranceMs;
        const supportNote = result.odSupportAvailable
            ? `Fonte apoio: ${escapeHTML(result.supportSource)}`
            : "OD apoio: ficheiro publico nao encontrado neste mundo.";

        state.controls.body.innerHTML = `
            <div class="${APP.id}-summaryHead">
                <div>
                    <a href="/game.php?screen=info_player&id=${result.player.id}" target="_blank" rel="noopener">${escapeHTML(result.player.name)}</a>
                    <span>#${result.player.id}</span>
                </div>
                <small>Base: ${escapeHTML(baselineText)}</small>
            </div>

            ${baselineOk ? "" : renderNotice("Os deltas de pontos e OD aparecem quando existir uma snapshot local entre 20h e 28h atras. Esta execucao guardou a snapshot atual.", "warn")}

            <div class="${APP.id}-grid">
                ${metricCard("Pontos", formatNumber(result.current.points), result.diffs.points)}
                ${metricCard("Aldeias", formatNumber(result.current.villages), result.diffs.villages)}
                ${metricCard("Rank", `#${formatNumber(result.current.rank)}`, result.diffs.rank, true)}
                ${metricCard("Ganhas / Perdidas", `${formatNumber(result.conquests.gained.length)} / ${formatNumber(result.conquests.lost.length)}`, result.conquests.net)}
            </div>

            <div class="${APP.id}-section">
                <h3>OD</h3>
                <div class="${APP.id}-odTable">
                    ${odRow("Total", result.current.od.total, result.diffs.od.total)}
                    ${odRow("Ofensivo", result.current.od.off, result.diffs.od.off)}
                    ${odRow("Defensivo", result.current.od.def, result.diffs.od.def)}
                    ${odRow("Apoio", result.current.od.support, result.diffs.od.support)}
                </div>
                <div class="${APP.id}-hint">${supportNote}</div>
            </div>

            <div class="${APP.id}-section ${APP.id}-split">
                <div>
                    <h3>Ganhas 24h <span>${formatNumber(result.conquests.gained.length)}</span></h3>
                    ${renderConquestList(result.conquests.gained, "gain")}
                </div>
                <div>
                    <h3>Perdidas 24h <span>${formatNumber(result.conquests.lost.length)}</span></h3>
                    ${renderConquestList(result.conquests.lost, "loss")}
                </div>
            </div>
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
        const deltaText = delta === null ? "N/D" : formatSigned(delta);
        return `
            <div class="${APP.id}-odRow">
                <span>${escapeHTML(label)}</span>
                <strong>${escapeHTML(score)}</strong>
                <small>${escapeHTML(rank)}</small>
                <em class="${deltaClass(delta, false)}">${escapeHTML(deltaText)}</em>
            </div>
        `;
    }

    function renderConquestList(rows, mode) {
        if (!rows.length) {
            return `<div class="${APP.id}-emptyList">Sem aldeias ${mode === "gain" ? "ganhas" : "perdidas"} nas ultimas 24h.</div>`;
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
        state.controls.body.innerHTML = renderNotice(message, type || "warn");
    }

    function setBusy(isBusy) {
        if (!state.controls.submit) return;
        state.controls.submit.disabled = isBusy;
        state.controls.force.disabled = isBusy;
        state.panel.classList.toggle(`${APP.id}-busy`, isBusy);
    }

    function setStatus(message) {
        if (state.controls.status) state.controls.status.textContent = message;
    }

    function defaultPlayerQuery() {
        const params = new URLSearchParams(window.location.search);
        if (params.get("screen") === "info_player" && params.get("id")) return params.get("id");

        const gameData = window.game_data || {};
        if (gameData.player && gameData.player.name) return gameData.player.name;
        if (gameData.player && gameData.player.id) return String(gameData.player.id);
        return "";
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
        `;
        document.head.appendChild(style);
    }
})();
