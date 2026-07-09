// ==UserScript==
// @name         TW PT - Informação de Jogador - ThePlaguePT
// @namespace    theplaguept.tw.resumo24h-jogador
// @version      1.0.6
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
        version: "1.0.6",
        title: "Informação de Jogador",
        displayTitle: "TW PT - Informação de Jogador - ThePlaguePT",
        githubUrl: "https://github.com/ThePlaguePT/TribalWars-Scripts",
        launcherIcon: "https://dspt.innogamescdn.com/asset/f441272cc5/graphic/welcome/player_points.webp",
        mapCacheMs: 50 * 60 * 1000,
        conquerCacheMs: 90 * 1000,
        conquerAllCacheMs: 5 * 60 * 1000,
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
        profileButton: null,
        launcherPositionFrame: 0,
        launcherResizeObserver: null,
    };

    const nf = new Intl.NumberFormat("pt-PT");

    init();

    function init() {
        injectStyle();
        createLauncher();
        ensureProfileStatsButton();
        registerHubShortcut();

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && state.panel && !state.panel.classList.contains(`${APP.id}-hidden`)) {
                closePanel();
            }
        });

        window.setInterval(ensureProfileStatsButton, 1500);

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

    function ensureProfileStatsButton() {
        const playerId = currentProfilePlayerId();
        const existing = document.getElementById(`${APP.id}-profileStats`);

        if (!playerId) {
            if (existing) existing.remove();
            state.profileButton = null;
            return;
        }

        if (existing && existing.dataset.playerId === String(playerId)) return;
        if (existing) existing.remove();

        const holder = createProfileStatsHolder(playerId);
        const archiveRow = findProfileArchiveRow();

        if (archiveRow && archiveRow.parentNode) {
            archiveRow.parentNode.insertBefore(holder, archiveRow.nextSibling);
        } else {
            const fallbackTarget = findVillageTable();
            const content = document.querySelector("#content_value") || document.querySelector("#contentContainer") || document.body;
            if (fallbackTarget && fallbackTarget.parentNode) {
                fallbackTarget.parentNode.insertBefore(holder, fallbackTarget);
            } else {
                content.appendChild(holder);
            }
        }

        state.profileButton = holder.querySelector("button");
        state.profileButton.addEventListener("click", () => openPlayerProfileStats(playerId));
    }

    function createProfileStatsHolder(playerId) {
        const archiveRow = findProfileArchiveRow();
        if (archiveRow) {
            const row = document.createElement("tr");
            const colSpan = Math.max(1, archiveRow.children.length || 1);
            row.id = `${APP.id}-profileStats`;
            row.dataset.playerId = String(playerId);
            row.className = `${APP.id}-profileStatsRow`;
            row.innerHTML = `
                <td class="${APP.id}-profileStatsCell" colspan="${colSpan}">
                    ${profileStatsButtonHTML()}
                </td>
            `;
            return row;
        }

        const wrap = document.createElement("div");
        wrap.id = `${APP.id}-profileStats`;
        wrap.dataset.playerId = String(playerId);
        wrap.className = `${APP.id}-profileStatsWrap`;
        wrap.innerHTML = profileStatsButtonHTML();
        return wrap;
    }

    function profileStatsButtonHTML() {
        return `<button type="button" class="${APP.id}-profileStatsButton">Info - Stats</button>`;
    }

    function openPlayerProfileStats(playerId) {
        openPanel();
        if (state.controls.playerInput) state.controls.playerInput.value = String(playerId);
        runSummary(false);
    }

    function currentProfilePlayerId() {
        const params = new URLSearchParams(window.location.search);
        if (params.get("screen") !== "info_player") return "";
        const id = params.get("id") || "";
        return /^\d+$/.test(id) ? id : "";
    }

    function findProfileArchiveRow() {
        const content = document.querySelector("#content_value") || document;
        return Array.from(content.querySelectorAll("tr")).find((row) => {
            const text = fold(row.textContent);
            return text.includes("arquivo de jogador") || text.includes("player archive");
        }) || null;
    }

    function findVillageTable() {
        const content = document.querySelector("#content_value") || document;
        const header = Array.from(content.querySelectorAll("th, td")).find((cell) => /^aldeias\s*\(/i.test(cleanText(cell.textContent)));
        return header ? header.closest("table") : null;
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
            <div class="${APP.id}-dialog" role="dialog" aria-modal="true" aria-label="${APP.title}">
                <button type="button" class="${APP.id}-close" data-action="close" title="Fechar">x</button>
                <div class="${APP.id}-shell">
                    <header class="${APP.id}-masthead">
                        <h2>${escapeHTML(APP.displayTitle)}</h2>
                        <p>Resumo das ultimas 24 horas do mundo atual. ${escapeHTML(worldLabel())}</p>
                    </header>

                    <form id="${APP.id}-form" class="${APP.id}-panelRow ${APP.id}-searchRow">
                        <aside class="${APP.id}-rowLabel">
                            <strong>JOGADOR</strong>
                            <span>Procura por nome ou ID para gerar o resumo.</span>
                        </aside>
                        <div class="${APP.id}-rowContent">
                            <div class="${APP.id}-controlsGrid">
                                <label>
                                    <span>Jogador</span>
                                    <input type="text" name="player" autocomplete="off" placeholder="Nome ou ID do jogador">
                                </label>
                                <label>
                                    <span>Periodo</span>
                                    <select disabled>
                                        <option>Ultimas 24 horas</option>
                                    </select>
                                </label>
                                <label>
                                    <span>Comparar</span>
                                    <select disabled>
                                        <option>Snapshot local ~24h</option>
                                    </select>
                                </label>
                            </div>
                        </div>
                    </form>

                    <div class="${APP.id}-body">
                        <section class="${APP.id}-panelRow ${APP.id}-summaryRow">
                            <aside class="${APP.id}-rowLabel">
                                <strong>RESUMO</strong>
                                <span>Totais e variação do jogador selecionado.</span>
                            </aside>
                            <div class="${APP.id}-rowContent">
                                <div class="${APP.id}-empty">Escreve um jogador para carregar o resumo.</div>
                            </div>
                        </section>
                    </div>

                    <section class="${APP.id}-panelRow ${APP.id}-actionsRow">
                        <aside class="${APP.id}-rowLabel">
                            <strong>ACOES</strong>
                            <span>Atualiza dados da vista atual.</span>
                        </aside>
                        <div class="${APP.id}-rowContent">
                            <div class="${APP.id}-actions">
                                <button type="submit" form="${APP.id}-form">Resumo</button>
                                <button type="button" data-action="force">Atualizar</button>
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
        state.controls.playerInput = panel.querySelector('input[name="player"]');
        state.controls.status = panel.querySelector(`.${APP.id}-status`);
        state.controls.body = panel.querySelector(`.${APP.id}-body`);
        state.controls.submit = panel.querySelector('button[type="submit"]');
        state.controls.force = panel.querySelector('[data-action="force"]');
        state.controls.clear = panel.querySelector('[data-action="clear"]');

        panel.querySelector('[data-action="close"]').addEventListener("click", closePanel);
        panel.querySelector("form").addEventListener("submit", (event) => {
            event.preventDefault();
            runSummary(false);
        });
        state.controls.force.addEventListener("click", () => runSummary(true));
        state.controls.clear.addEventListener("click", clearCache);
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
        const conquerAllPromise = fetchCachedText("conquerAll", "/map/conquer.txt", APP.conquerAllCacheMs, force);
        const villagePromise = fetchCachedText("villages", "/map/village.txt", APP.mapCacheMs, force);
        const odPromise = loadOdEntries(player.id, force);

        const [conquerText, conquerAllText, villagesText, od] = await Promise.all([
            conquerPromise,
            conquerAllPromise,
            villagePromise,
            odPromise,
        ]);

        const villages = parseVillages(villagesText);
        const conquests = summarizeConquests(conquerText, villages, players.byId, player.id, since);
        const allTime = summarizeAllTimeConquests(conquerAllText, villages, players.byId, player.id);
        const villagesSummary = summarizePlayerVillages(villages, player.id);

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
            allTime,
            villagesSummary,
            twstats: buildTwStatsLinks(player.id),
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

    function summarizeAllTimeConquests(text, villages, playersById, playerId) {
        const daily = new Map();
        const opponents = new Map();
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

            if (newOwnerId === playerId) {
                gained += 1;
                day.gained += 1;
                addOpponent(opponents, oldOwnerId, playersById, "from", village.points);
            }

            if (oldOwnerId === playerId) {
                lost += 1;
                day.lost += 1;
                addOpponent(opponents, newOwnerId, playersById, "to", village.points);
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
            opponents: Array.from(opponents.values())
                .sort((a, b) => (b.from + b.to) - (a.from + a.to))
                .slice(0, 8),
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
        const base = `https://www.twstats.com/${encodeURIComponent(world)}/`;
        const profileUrl = `${base}index.php?id=${encodeURIComponent(playerId)}&page=player`;
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
            graphs,
        };
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
        const summaryContent = `
            <div class="${APP.id}-playerHead">
                <div>
                    <a href="/game.php?screen=info_player&id=${result.player.id}" target="_blank" rel="noopener">${escapeHTML(result.player.name)}</a>
                    <span>#${result.player.id}</span>
                </div>
            </div>

            <div class="${APP.id}-grid">
                ${metricCard("Pontos", formatNumber(result.current.points), result.diffs.points)}
                ${metricCard("Aldeias", formatNumber(result.current.villages), result.diffs.villages)}
                ${metricCard("Rank", `#${formatNumber(result.current.rank)}`, result.diffs.rank, true)}
                ${metricCard("Ganhas / Perdidas", `${formatNumber(result.conquests.gained.length)} / ${formatNumber(result.conquests.lost.length)}`, result.conquests.net)}
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
                            <th>24H</th>
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
            ${panelRow("RESUMO", "Totais do filtro ativo para leitura rapida.", summaryContent, "summaryRow")}
            ${panelRow("ALDEIAS", "Coordenadas atuais do jogador, todas e por continente.", renderVillageCoordinates(result.villagesSummary), "villagesRow")}
            ${panelRow("MUNDO", "Stats desde o inicio do mundo pelo historico publico de conquistas.", renderAllTimeStats(result.allTime), "worldStatsRow")}
            ${panelRow("TWSTATS", "Graficos historicos externos, quando o mundo existe no TWStats.", renderTwStatsGraphs(result.twstats), "chartsRow")}
            ${panelRow("OD", "Pontos ofensivos, defensivos e apoio.", odContent, "odSectionRow")}
            ${panelRow("CONQUISTAS", "Aldeias ganhas e perdidas nas ultimas 24h.", renderConquestTable(result.conquests.gained, result.conquests.lost), "resultsRow")}
        `;
    }

    function panelRow(title, description, content, className) {
        return `
            <section class="${APP.id}-panelRow ${APP.id}-${className || "row"}">
                <aside class="${APP.id}-rowLabel">
                    <strong>${escapeHTML(title)}</strong>
                    <span>${escapeHTML(description)}</span>
                </aside>
                <div class="${APP.id}-rowContent">
                    ${content}
                </div>
            </section>
        `;
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

    function chartEmpty(title) {
        return `
            <div class="${APP.id}-chart">
                <h4>${escapeHTML(title)}</h4>
                <div class="${APP.id}-emptyList">Sem dados suficientes para grafico.</div>
            </div>
        `;
    }

    function renderConquestTable(gained, lost) {
        const rows = [
            ...gained.map((row) => ({ mode: "gain", row })),
            ...lost.map((row) => ({ mode: "loss", row })),
        ].sort((a, b) => b.row.timestamp - a.row.timestamp);

        if (!rows.length) {
            return `<div class="${APP.id}-emptyList">Sem aldeias ganhas ou perdidas nas ultimas 24h.</div>`;
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
        const deltaText = delta === null ? "N/D" : formatSigned(delta);
        return `
            <tr>
                <td>${escapeHTML(label)}</td>
                <td><strong>${escapeHTML(score)}</strong></td>
                <td>${escapeHTML(rank)}</td>
                <td><em class="${deltaClass(delta, false)}">${escapeHTML(deltaText)}</em></td>
            </tr>
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
        state.controls.body.innerHTML = panelRow(
            "RESUMO",
            "Estado da pesquisa atual.",
            renderNotice(message, type || "warn"),
            "summaryRow"
        );
    }

    function setBusy(isBusy) {
        if (!state.controls.submit) return;
        state.controls.submit.disabled = isBusy;
        state.controls.force.disabled = isBusy;
        state.controls.clear.disabled = isBusy;
        state.panel.classList.toggle(`${APP.id}-busy`, isBusy);
    }

    function setStatus(message) {
        if (state.controls.status) state.controls.status.textContent = message;
    }

    function clearCache() {
        state.memoryCache.clear();
        state.lastResult = null;

        try {
            const snapshotPrefix = `${APP.id}:snapshots:${window.location.host}:`;
            Object.keys(window.localStorage)
                .filter((key) => key.startsWith(snapshotPrefix))
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

        const gameData = window.game_data || {};
        if (gameData.player && gameData.player.name) return gameData.player.name;
        if (gameData.player && gameData.player.id) return String(gameData.player.id);
        return "";
    }

    function worldLabel() {
        const gameData = window.game_data || {};
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

    function pageGameData() {
        return window.game_data || {};
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

            .${APP.id}-profileStatsCell,
            .${APP.id}-profileStatsWrap {
                padding: 4px 0 !important;
                background: transparent !important;
            }

            .${APP.id}-profileStatsButton {
                min-width: 160px;
                height: 28px;
                border: 1px solid #7b201c;
                border-radius: 3px;
                background: linear-gradient(#b43a34, #8c1713);
                color: #fff8dc;
                cursor: pointer;
                font: 700 12px Verdana, Arial, sans-serif;
                text-shadow: 0 1px 0 #40100d;
                box-shadow: inset 0 1px 0 rgba(255,255,255,.28), 0 1px 2px rgba(0,0,0,.25);
            }

            .${APP.id}-profileStatsButton:hover {
                background: linear-gradient(#c64a43, #971d18);
            }

            #${APP.id}-panel {
                position: fixed;
                inset: 0;
                z-index: ${APP.zIndex + 1};
                width: auto;
                max-height: none;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                padding: 22px;
                border: 0;
                border-radius: 0;
                background: rgba(0, 0, 0, 0.42);
                box-shadow: none;
                color: #2f1809;
                box-sizing: border-box;
                font: 12px Verdana, Arial, sans-serif;
            }

            #${APP.id}-panel.${APP.id}-hidden {
                display: none;
            }

            .${APP.id}-dialog {
                position: relative;
                width: min(1260px, calc(100vw - 56px));
                max-height: calc(100vh - 56px);
                overflow-y: auto;
                overflow-x: hidden;
                padding: 15px 14px 14px;
                border: 1px solid #4c2a12;
                border-radius: 3px;
                background: #f3dfaa;
                box-shadow: 0 0 0 2px #d8c79b, 0 0 0 4px #735027, 0 0 0 6px #cfc7aa, 0 0 0 8px #3d3428, 0 8px 26px rgba(0, 0, 0, 0.62);
                box-sizing: border-box;
            }

            .${APP.id}-dialog::before {
                content: "";
                position: absolute;
                inset: 7px;
                pointer-events: none;
                border: 2px solid #a7221e;
                border-radius: 2px;
                box-shadow: inset 0 0 0 1px rgba(255, 245, 205, 0.75);
            }

            .${APP.id}-close {
                position: absolute;
                top: -13px;
                right: -13px;
                z-index: 3;
                width: 20px;
                height: 20px;
                line-height: 18px;
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
                min-height: 0;
                padding: 0;
                border: 1px solid #c99545;
                border-radius: 0;
                background: rgba(255, 239, 188, 0.38);
                box-sizing: border-box;
            }

            .${APP.id}-masthead {
                margin: 0;
                padding: 12px 14px 10px;
                border: 0;
                border-bottom: 1px solid #c8913e;
                border-radius: 0;
                background: linear-gradient(#f8e8b9, #efd28d);
            }

            .${APP.id}-masthead h2 {
                margin: 0;
                color: #8c1711;
                font-family: Georgia, "Times New Roman", serif;
                font-size: 20px;
                line-height: 1.15;
                letter-spacing: 0;
            }

            .${APP.id}-masthead p {
                margin: 3px 0 0;
                color: #4a240d;
                font-size: 12px;
            }

            .${APP.id}-panelRow {
                display: grid;
                grid-template-columns: 300px minmax(0, 1fr);
                border-top: 1px solid #d2b873;
                background: rgba(255, 255, 255, 0.08);
            }

            .${APP.id}-panelRow:first-of-type {
                border-top: 0;
            }

            .${APP.id}-rowLabel {
                min-height: 58px;
                padding: 12px 14px 10px 12px;
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
                display: block;
                color: #9f1d19;
                font-size: 14px;
                line-height: 1.15;
                text-transform: uppercase;
            }

            .${APP.id}-rowLabel span {
                display: block;
                margin-top: 4px;
                color: #4d250f;
                line-height: 1.25;
            }

            .${APP.id}-rowContent {
                min-width: 0;
                padding: 9px 14px 10px;
                box-sizing: border-box;
            }

            .${APP.id}-controlsGrid {
                display: grid;
                grid-template-columns: 1.35fr 1fr 1fr;
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
                overflow: visible;
                padding: 0;
            }

            .${APP.id}-playerHead {
                display: flex;
                align-items: flex-end;
                justify-content: space-between;
                gap: 16px;
                margin-bottom: 8px;
            }

            .${APP.id}-playerHead a {
                color: #2b1508;
                font-size: 17px;
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
                gap: 8px;
                margin: 0;
            }

            .${APP.id}-metric {
                min-height: 48px;
                padding: 7px 9px;
                border: 1px solid #c89042;
                border-radius: 2px;
                background: #fff6d7;
                box-sizing: border-box;
            }

            .${APP.id}-metric span {
                display: block;
                margin: 0 0 3px;
                color: #6a340f;
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
            }

            .${APP.id}-metric strong {
                display: block;
                color: #120b05;
                font-size: 17px;
                line-height: 1.15;
                overflow-wrap: anywhere;
            }

            .${APP.id}-metric em {
                display: block;
                margin-top: 3px;
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

            .${APP.id}-gain td:nth-child(2) strong {
                color: #16662a;
            }

            .${APP.id}-loss td:nth-child(2) strong {
                color: #9d211b;
            }

            .${APP.id}-actions {
                display: grid;
                grid-template-columns: repeat(3, minmax(140px, 1fr));
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
