// ==UserScript==
// @name         TW PT - Alertas Discord by ThePlaguePT (Beta)
// @namespace    http://tampermonkey.net/
// @version      1.9.2
// @description  Notificacoes de ataques Tribal Wars PT -> Discord
// @match        https://*.tribalwars.com.pt/*
// @grant        GM_xmlhttpRequest
// @connect      discord.com
// @icon         https://e7.pngegg.com/pngimages/686/413/png-clipart-discord-computer-icons-android-android-smiley-online-chat-thumbnail.png
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    console.log('[TW Discord Alerts] Versao 1.9.2 carregada');

    const DEFAULT_WEBHOOK = 'COLOCA_O_WEBHOOK_AQUI';
    const DEFAULT_ATTACKS_WEBHOOK = 'COLOCA_O_WEBHOOK_AQUI';
    const DEFAULT_SUMMARY_WEBHOOK = 'COLOCA_O_WEBHOOK_AQUI';
    const DEFAULT_TROOPS_WEBHOOK = 'COLOCA_O_WEBHOOK_AQUI';
    const DEFAULT_VERIFICATION_WEBHOOK = 'COLOCA_O_WEBHOOK_AQUI';
    const CHECK_INTERVAL = 'normal';
    const MASTER_TTL = 15000;
    const SEND_EXISTING_ON_START = false;
    const DISCORD_SEND_DELAY = 1500;
    const NOBLE_TRAIN_DELAY = 2000;
    const AUTO_IDENTIFY_UNITS = true;
    const IDENTIFY_TOLERANCE_SECONDS = 300;
    const TAB_SESSION_KEY = 'tw_discord_attack_alerts_tab_id_v3';

    let storedTabId = sessionStorage.getItem(TAB_SESSION_KEY);

    if (!storedTabId) {
    storedTabId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(TAB_SESSION_KEY, storedTabId);
}

    const TAB_ID = storedTabId;

    const STORAGE_PREFIX = 'tw_pt_discord_attack_alerts_pro_v1';

    const MASTER_KEY = `${STORAGE_PREFIX}_master_tab`;
    const SENT_KEY = `${STORAGE_PREFIX}_sent_attack_ids`;
    const BOOTSTRAPPED_KEY = `${STORAGE_PREFIX}_bootstrapped`;
    const FALLBACK_COUNT_KEY = `${STORAGE_PREFIX}_fallback_counts`;
    const NOBLE_PENDING_KEY = `${STORAGE_PREFIX}_pending_noble_trains`;
    const NOBLE_SENT_KEY = `${STORAGE_PREFIX}_sent_noble_ids`;
    const SUMMARY_STATE_KEY = `${STORAGE_PREFIX}_attack_summary_state`;
    const TROOPS_LAST_SENT_KEY = `${STORAGE_PREFIX}_troops_summary_last_sent`;
    const TROOPS_INTERVAL_MS = 1000 * 60 * 60 * 8;
    const PLAYER_TRIBE_CACHE_KEY = `${STORAGE_PREFIX}_player_tribes`;
    const PLAYER_TRIBE_CACHE_MS = 1000 * 60 * 60 * 8;
    const SUMMARY_LAST_SENT_KEY = `${STORAGE_PREFIX}_attack_summary_last_sent`;
    const SUMMARY_INTERVAL_MS = 1000 * 60 * 60 * 8;
    const VERIFICATION_ALERT_KEY = `${STORAGE_PREFIX}_verification_alert_last_sent`;
    const VERIFICATION_ALERT_COOLDOWN_MS = 1000 * 60 * 30;

    const TROOP_UNIT_LABELS = {
    spear: '🛡️ Lanceiros',
    sword: '🗡️ Espadachins',
    axe: '🪓 Barbaros',
    archer: '🏹 Arqueiros',
    spy: '🕵️ Batedores',
    light: '🐎 Cavalaria Leve',
    marcher: '🏇 Arqueiros a Cavalo',
    heavy: '🐴 Cavalaria Pesada',
    ram: '🐏 Arietes',
    catapult: '🪨 Catapultas',
    knight: '⚜️ Paladino',
    snob: '👑 Nobres',
    militia: '🏘️ Milicia'
};

const TROOP_DEFENSE_UNITS = ['spear', 'sword', 'archer', 'heavy', 'knight', 'militia'];
const TROOP_ATTACK_UNITS = ['axe', 'spy', 'light', 'marcher', 'ram', 'catapult', 'snob'];

    const SETTINGS_KEY = `${STORAGE_PREFIX}_settings`;

    const DEFAULT_SETTINGS = {
    webhook: DEFAULT_ATTACKS_WEBHOOK,
    summaryWebhook: DEFAULT_SUMMARY_WEBHOOK,
    troopsWebhook: DEFAULT_TROOPS_WEBHOOK,
    verificationWebhook: DEFAULT_VERIFICATION_WEBHOOK,
    notifyNormalAttacks: false,
    notifyNobleAttacks: false,
    notifyAttackSummary: false,
    notifyDefenseTroops: false,
    notifyVerificationAlerts: false,
    checkInterval: CHECK_INTERVAL,
    nobleTrainDelay: NOBLE_TRAIN_DELAY
};

function getSettings() {
    return {
        ...DEFAULT_SETTINGS,
        ...readJson(SETTINGS_KEY, {})
    };
}

function saveSettings(settings) {
    writeJson(SETTINGS_KEY, {
        ...getSettings(),
        ...settings
    });
}

function randomBetweenMs(minMinutes, maxMinutes) {
    const min = minMinutes * 60 * 1000;
    const max = maxMinutes * 60 * 1000;

    return Math.floor(min + Math.random() * (max - min + 1));
}

function getCheckInterval() {
    const value = getSettings().checkInterval || CHECK_INTERVAL;

    if (String(value) === 'test' || Number(value) === 2000) {
        return 2000;
    }

    if (String(value) === 'safe' || Number(value) === 30000) {
        return randomBetweenMs(5, 15);
    }

    return randomBetweenMs(1, 5);
}

function getNobleTrainDelay() {
    return NOBLE_TRAIN_DELAY;
}

    let checking = false;
    let sending = false;
    let alreadySent = loadSet(SENT_KEY);
    let nobleAlreadySent = loadSet(NOBLE_SENT_KEY);
    let cachedUnitSpeed = null;
    let errorBackoff = 0;
    let verificationPaused = false;

    const discordQueue = [];
    const nobleTrains = new Map();

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function loadSet(key) {
        return new Set(readJson(key, []));
    }

    function saveSent() {
        const ids = Array.from(alreadySent).slice(-1000);
        alreadySent = new Set(ids);
        writeJson(SENT_KEY, ids);
    }

    function cleanText(value) {
        return (value || '').replace(/\s+/g, ' ').trim();
    }

function isTwVerificationPage(doc) {
    if (!doc || !doc.body) return false;

    const title = cleanText(doc.title || '').toLowerCase();
    const text = cleanText(doc.body.innerText || '').toLowerCase();
    const html = (doc.documentElement ? doc.documentElement.innerHTML : '').toLowerCase();

    const hasTwBotProtectionPage =
        text.includes('proteção contra bots') ||
        text.includes('protecao contra bots') ||
        text.includes('verificação de proteção de bots') ||
        text.includes('verificacao de protecao de bots') ||
        text.includes('inicia a verificação da proteção do bot') ||
        text.includes('inicia a verificacao da protecao do bot') ||
        text.includes('antes de poderes continuar a jogar');

    if (hasTwBotProtectionPage) {
        return true;
    }

    const hasCaptchaElement = Boolean(doc.querySelector([
        '.g-recaptcha',
        '.h-captcha',
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        'iframe[src*="hcaptcha.com"]',
        'iframe[title*="recaptcha"]',
        'iframe[title*="hcaptcha"]',
        'textarea[name="g-recaptcha-response"]',
        'textarea[name="h-captcha-response"]',
        '[data-sitekey]',
        '[data-hcaptcha-widget-id]'
    ].join(',')));

    const hasCaptchaCode =
        html.includes('hcaptcha.com') ||
        html.includes('h-captcha') ||
        html.includes('hcaptcha') ||
        html.includes('g-recaptcha') ||
        html.includes('recaptcha');

    const hasCaptchaText =
        text.includes('sou humano') ||
        text.includes('captcha') ||
        text.includes('não sou um robô') ||
        text.includes('nao sou um robo') ||
        text.includes('i\'m not a robot') ||
        text.includes('not a robot');

    return Boolean(hasCaptchaElement || hasCaptchaCode || hasCaptchaText);
}

    function getCurrentWorldValue() {
    const hostname = window.location.hostname;
    const world = hostname.split('.')[0].toUpperCase();
    const url = `https://${hostname}/game.php`;

    return `[${world}](${url})`;
}

    function getVerificationWebhook() {
    const settings = getSettings();
    const verificationWebhook = cleanText(settings.verificationWebhook);

    return verificationWebhook && verificationWebhook !== DEFAULT_VERIFICATION_WEBHOOK
        ? verificationWebhook
        : cleanText(settings.webhook);
}

function notifyVerificationPageDetected(source) {
    if (!getSettings().notifyVerificationAlerts) {
    return;
}
    const now = Date.now();
    const lastSent = Number(localStorage.getItem(VERIFICATION_ALERT_KEY) || 0);

    if (now - lastSent < VERIFICATION_ALERT_COOLDOWN_MS) {
        return;
    }

    localStorage.setItem(VERIFICATION_ALERT_KEY, String(now));

    queueDiscordEmbed({
        title: '⚠️ Verificação do Tribal Wars Captcha',
description: [
    `Foi detetada uma página de verificação no mundo ${getCurrentWorldValue()}.`,
    `Jogador: **${getDefenderValue()}**`,
    source ? `Origem: **${source}**.` : '',
    '',
    'O script ficou em pausa para evitar novos pedidos.',
    'Abre o jogo e valida manualmente.'
].join('\n'),
        color: 16776960,
        footer: { text: 'Tribal Wars PT' },
        timestamp: new Date().toISOString()
    }, 'TW Verification Alert', getVerificationWebhook());
}

function pauseForVerification(source) {
    verificationPaused = true;
    console.warn('[TW] Pagina de verificacao detetada. Script em pausa:', source);
    notifyVerificationPageDetected(source);
}

function getSummaryWebhook() {
    const settings = getSettings();
    const summaryWebhook = cleanText(settings.summaryWebhook);

    return summaryWebhook && summaryWebhook !== DEFAULT_SUMMARY_WEBHOOK
        ? summaryWebhook
        : cleanText(settings.webhook);
}

function getTroopsWebhook() {
    const settings = getSettings();
    const troopsWebhook = cleanText(settings.troopsWebhook);

    return troopsWebhook && troopsWebhook !== DEFAULT_TROOPS_WEBHOOK
        ? troopsWebhook
        : cleanText(settings.webhook);
}

    function extractStableArrival(row, timerText) {
    const rowText = cleanText(row.innerText).replace(timerText || '', ' ');

    const match = rowText.match(
        /((Hoje|Amanhã|Amanha|Ontem|\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)\s*)?(?:às\s*)?(\d{1,2}:\d{2}:\d{2}(?::\d{3})?)/i
    );

    if (!match) return '';

    const day = cleanText(match[1] || '');
    const time = cleanText(match[3] || '');

    return cleanText(`${day} ${time}`);
}

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function parseDurationMs(value) {
    const text = cleanText(value);

    let match = text.match(/^(\d+):(\d{2}):(\d{2})(?::\d{3})?$/);
    if (match) {
        return ((Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3])) * 1000;
    }

    match = text.match(/^(\d+):(\d{2})$/);
    if (match) {
        return ((Number(match[1]) * 60) + Number(match[2])) * 1000;
    }

    return 0;
}

function getEstimatedEndKey(timerText) {
    const durationMs = parseDurationMs(timerText);
    if (!durationMs) return '';

    return String(Math.round((Date.now() + durationMs) / 1000));
}

function getFallbackCounts() {
    return readJson(FALLBACK_COUNT_KEY, {});
}

    function syncFallbackCountsToVisibleAttacks(attacks) {
    const fallbackCounts = getFallbackCounts();
    const visibleCounts = {};

    attacks.forEach(attack => {
        if (attack.hasRealId) return;

        const baseId = attack.baseId || attack.id;
        visibleCounts[baseId] = (visibleCounts[baseId] || 0) + 1;
    });

    Object.keys(fallbackCounts).forEach(baseId => {
        const knownCount = Number(fallbackCounts[baseId] || 0);
        const visibleCount = Number(visibleCounts[baseId] || 0);

        if (visibleCount === 0) {
            delete fallbackCounts[baseId];
            return;
        }

        if (visibleCount < knownCount) {
            fallbackCounts[baseId] = visibleCount;
        }
    });

    saveFallbackCounts(fallbackCounts);
}

function saveFallbackCounts(counts) {
    writeJson(FALLBACK_COUNT_KEY, counts);
}

function rememberKnownAttacks(attacks) {
    const fallbackCounts = getFallbackCounts();
    const fallbackGroups = {};

    attacks.forEach(attack => {
        if (attack.hasRealId) {
            alreadySent.add(attack.id);
            return;
        }

        const baseId = attack.baseId || attack.id;
        fallbackGroups[baseId] = (fallbackGroups[baseId] || 0) + 1;
    });

    Object.entries(fallbackGroups).forEach(([baseId, count]) => {
        fallbackCounts[baseId] = Math.max(Number(fallbackCounts[baseId] || 0), count);

        for (let i = 1; i <= count; i++) {
            alreadySent.add(`${baseId}#${i}`);
        }
    });

    saveSent();
    saveFallbackCounts(fallbackCounts);
}

function collectNewAttacks(attacks) {
    const fallbackCounts = getFallbackCounts();
    const fallbackGroups = new Map();
    const newAttacks = [];

    attacks.forEach(attack => {
        if (attack.hasRealId) {
            if (!alreadySent.has(attack.id)) {
                newAttacks.push(attack);
            }

            return;
        }

        const baseId = attack.baseId || attack.id;

        if (!fallbackGroups.has(baseId)) {
            fallbackGroups.set(baseId, []);
        }

        fallbackGroups.get(baseId).push(attack);
    });

    fallbackGroups.forEach((group, baseId) => {
        const knownCount = Number(fallbackCounts[baseId] || 0);
        const currentCount = group.length;

        if (currentCount > knownCount) {
            group.slice(knownCount).forEach((attack, index) => {
                attack.id = `${baseId}#${knownCount + index + 1}`;
                newAttacks.push(attack);
            });

            fallbackCounts[baseId] = currentCount;
        }
    });

    saveFallbackCounts(fallbackCounts);

    return newAttacks;
}

    function isMasterTab() {
        const now = Date.now();
        const master = readJson(MASTER_KEY, null);

        if (!master || !master.id || now - master.time > MASTER_TTL || master.id === TAB_ID) {
            writeJson(MASTER_KEY, { id: TAB_ID, time: now });
            const confirmed = readJson(MASTER_KEY, null);
            return confirmed && confirmed.id === TAB_ID;
        }

        return false;
    }

    setInterval(() => {
        if (isMasterTab()) {
            writeJson(MASTER_KEY, { id: TAB_ID, time: Date.now() });
        }
    }, 4000);

    window.addEventListener('beforeunload', () => {
    savePendingNobleTrains();

    const master = readJson(MASTER_KEY, null);
    if (master && master.id === TAB_ID) {
        localStorage.removeItem(MASTER_KEY);
    }
});

    function getIncomingAttacksUrl() {
        const url = new URL(window.location.href);

        url.searchParams.set('screen', 'overview_villages');
        url.searchParams.set('mode', 'incomings');
        url.searchParams.set('subtype', 'attacks');

        url.searchParams.delete('action');
        url.searchParams.delete('ajax');
        url.searchParams.delete('h');

        return url.toString();
    }

    async function fetchIncomingAttacksDocument() {
        const response = await fetch(getIncomingAttacksUrl(), {
            credentials: 'include',
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        return new DOMParser().parseFromString(html, 'text/html');
    }

    function getAbsoluteUrl(href) {
        if (!href) return null;
        return new URL(href, window.location.origin).toString();
    }

    function getCommandLink(root) {
        return root.querySelector('a[href*="screen=info_command"][href*="id="]');
    }

function getCommandId(row) {
    if (row.id && /command|cmd|incoming/i.test(row.id)) {
        const match = row.id.match(/\d{5,}/);
        if (match) return `command_${match[0]}`;
    }

    const commandLink = getCommandLink(row);

    if (commandLink) {
        const href = commandLink.getAttribute('href') || '';
        const id = new URL(href, window.location.origin).searchParams.get('id');
        if (id) return `command_${id}`;
    }

    const checkbox = row.querySelector('input[type="checkbox"]');

    if (checkbox) {
        const attrs = [
            checkbox.name || '',
            checkbox.id || ''
        ];

        for (const attr of attrs) {
            const match = attr.match(/(?:command|cmd)[^\d]*(\d{5,})/i);
            if (match) return `command_${match[1]}`;
        }
    }

    return null;
}

    function getLinkedText(cell, screen) {
        const link = cell ? cell.querySelector(`a[href*="screen=${screen}"]`) : null;
        return link ? cleanText(link.innerText) : '';
    }

    function getLinkedUrl(cell, screen) {
        const link = cell ? cell.querySelector(`a[href*="screen=${screen}"]`) : null;
        return link ? getAbsoluteUrl(link.getAttribute('href')) : null;
    }

    function parseCoords(text) {
        const match = cleanText(text).match(/(\d{3})\|(\d{3})/);
        if (!match) return null;

        return {
            x: Number(match[1]),
            y: Number(match[2]),
            text: `${match[1]}|${match[2]}`,
            continent: `K${match[2][0]}${match[1][0]}`
        };
    }

function parseVillage(cell) {
    const text = cleanText(cell ? cell.innerText : '');
    const coords = parseCoords(text);

    const villageLink = cell
        ? cell.querySelector('a[href*="screen=info_village"], a[href*="village="]')
        : null;

    const link = villageLink ? getAbsoluteUrl(villageLink.getAttribute('href')) : null;

    let name = villageLink ? cleanText(villageLink.innerText) : text;

    if (!name || /^\d{3}\|\d{3}/.test(name)) {
        name = getLinkedText(cell, 'info_village') || text;
    }

    name = name
        .replace(/\(?\d{3}\|\d{3}\)?/g, '')
        .replace(/\bK\d{2}\b/g, '')
        .replace(/^[\s\-*]+/g, '');

    return {
        name: cleanText(name) || 'Desconhecida',
        text,
        coords,
        url: link
    };
}

    function getCoordsText(village) {
        return village.coords ? `${village.coords.text} ${village.coords.continent}` : '???';
    }

    function getVillageName(village) {
        return village.name || 'Desconhecida';
    }

    function getVillageLink(village) {
        if (!village.url) return getVillageName(village);
        return `[${getVillageName(village)}](${village.url})`;
    }

    function getMapUrl(coords) {
        if (!coords) return null;

        const url = new URL(window.location.href);
        url.searchParams.set('screen', 'map');
        url.searchParams.set('x', String(coords.x));
        url.searchParams.set('y', String(coords.y));

        return url.toString();
    }

    function calculateDistance(origin, target) {
        if (!origin.coords || !target.coords) return null;

        const dx = origin.coords.x - target.coords.x;
        const dy = origin.coords.y - target.coords.y;

        return Math.sqrt((dx * dx) + (dy * dy)).toFixed(2);
    }

    function detectUnit(row, commandName) {
    const imgTexts = Array.from(row.querySelectorAll('img'))
        .map(img => [
            img.getAttribute('src') || '',
            img.getAttribute('title') || '',
            img.getAttribute('alt') || '',
            img.className || ''
        ].join(' '))
        .join(' ');

    const haystack = [
        row.innerText || '',
        row.innerHTML || '',
        commandName || '',
        imgTexts
    ].join(' ').toLowerCase();

    if (
        haystack.includes('snob') ||
        haystack.includes('nobre') ||
        haystack.includes('nobres') ||
        haystack.includes('noble')
    ) {
        return { key: 'noble', label: '👑 Nobre', color: 0xF1C40F };
    }

    if (
        haystack.includes('ram') ||
        haystack.includes('ariete')
    ) {
        return { key: 'ram', label: '🐏 Ariete', color: 0xE67E22 };
    }

    if (
        haystack.includes('catapult') ||
        haystack.includes('catapulta')
    ) {
        return { key: 'catapult', label: '🪨 Catapulta', color: 0xC0392B };
    }

    if (
        haystack.includes('spy') ||
        haystack.includes('scout') ||
        haystack.includes('explorador') ||
        haystack.includes('batedor')
    ) {
        return { key: 'spy', label: '🕵️ Batedor', color: 0x3498DB };
    }

    return { key: 'attack', label: '⚔️ Ataque', color: 0xE74C3C };
}

    async function loadWorldUnitSpeed() {
    if (cachedUnitSpeed !== null) return cachedUnitSpeed;

    try {
        const response = await fetch('/interface.php?func=get_config', {
            credentials: 'include',
            cache: 'no-store'
        });

        const xml = await response.text();
        const doc = new DOMParser().parseFromString(xml, 'text/xml');

        const unitSpeedText = doc.querySelector('unit_speed')?.textContent;
        const unitSpeed = Number(unitSpeedText);

        if (unitSpeed && !Number.isNaN(unitSpeed)) {
            cachedUnitSpeed = unitSpeed;
            console.log('[TW] Unit speed carregado:', cachedUnitSpeed);
            return cachedUnitSpeed;
        }
    } catch (error) {
        console.warn('[TW] Erro ao carregar unit_speed:', error);
    }

    cachedUnitSpeed = 1;
    return cachedUnitSpeed;
}

    function getWorldUnitSpeed() {
    return cachedUnitSpeed || 1;
}

    function parseRemainingSeconds(value) {
    const text = cleanText(value);

    let match = text.match(/^(\d+):(\d{2}):(\d{2})$/);
    if (match) {
        return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    }

    match = text.match(/^(\d+):(\d{2})$/);
    if (match) {
        return Number(match[1]) * 60 + Number(match[2]);
    }

    return null;
}

    function inferUnitFromTravelTime(distance, remainingText) {
    if (!AUTO_IDENTIFY_UNITS || !distance) return null;

    const remainingSeconds = parseRemainingSeconds(remainingText);
    if (!remainingSeconds) return null;

    const unitSpeed = getWorldUnitSpeed();

    const units = [
        { key: 'spy', label: '🕵️ Batedor', color: 0x3498DB, speed: 9 },
        { key: 'light', label: '🐎 Cavalaria Leve', color: 0x2ECC71, speed: 10 },
        { key: 'heavy', label: '🐴 Cavalaria Pesada', color: 0x1ABC9C, speed: 11 },
        { key: 'attack', label: '⚔️ Ataque', color: 0xE74C3C, speed: 18 },
        { key: 'sword', label: '🛡️ Espadachim', color: 0x95A5A6, speed: 22 },
        { key: 'siege', label: '🐏 Cerco', color: 0xE67E22, speed: 30 },
        { key: 'noble', label: '👑 Nobre', color: 0xF1C40F, speed: 35 }
    ];

    let best = null;

    units.forEach(unit => {
        const expectedSeconds = distance * unit.speed * 60 * unitSpeed;
        const diff = Math.abs(expectedSeconds - remainingSeconds);

        if (!best || diff < best.diff) {
            best = {
                unit,
                diff
            };
        }
    });

    if (!best || best.diff > IDENTIFY_TOLERANCE_SECONDS) {
        return null;
    }

    return best.unit;
}

    function parseAttackRow(row) {
    const realId = getCommandId(row);

    const cells = Array.from(row.querySelectorAll('td'));

    const commandLink = getCommandLink(row);
    const commandUrl = commandLink ? getAbsoluteUrl(commandLink.getAttribute('href')) : null;

    const playerLinks = Array.from(row.querySelectorAll('a[href*="screen=info_player"]'));
    const playerLink =
    playerLinks.find(link => cleanText(link.innerText) !== getDefenderName()) ||
    playerLinks[playerLinks.length - 1] ||
    null;

    const attacker = playerLink ? cleanText(playerLink.innerText) : 'Desconhecido';
    const attackerUrl = playerLink ? getAbsoluteUrl(playerLink.getAttribute('href')) : null;

    const commandImg = row.querySelector('img[title], img[alt]');
    const commandName =
        cleanText(commandLink ? commandLink.innerText : '') ||
        cleanText(commandImg ? commandImg.getAttribute('title') : '') ||
        cleanText(commandImg ? commandImg.getAttribute('alt') : '') ||
        'Ataque';

    const villageCells = cells.filter(cell => parseCoords(cell.innerText));

    const attackerCell = playerLink ? playerLink.closest('td') : null;
    const attackerCellIndex = attackerCell ? cells.indexOf(attackerCell) : -1;

    const villageCellsBeforeAttacker = attackerCellIndex >= 0
    ? villageCells.filter(cell => cells.indexOf(cell) < attackerCellIndex)
    : villageCells;

    const targetCell =
    villageCellsBeforeAttacker[villageCellsBeforeAttacker.length - 1] ||
    villageCells[1];

    const originCell =
    villageCellsBeforeAttacker[villageCellsBeforeAttacker.length - 2] ||
    villageCells[0];

    if (!originCell || !targetCell) {
    return null;
}

    const origin = parseVillage(originCell);
    const target = parseVillage(targetCell);

    const targetIndex = cells.indexOf(targetCell);
    const timerNode = row.querySelector('.timer, [data-endtime]');
    const timerText = timerNode ? cleanText(timerNode.innerText) : '';
    const endTime = timerNode ? (timerNode.getAttribute('data-endtime') || '') : '';
    const estimatedEndTime = getEstimatedEndKey(timerText);

    const timingTexts = cells
        .slice(targetIndex + 1)
        .map(cell => cleanText(cell.innerText))
        .filter(Boolean)
        .filter(text => text !== attacker)
        .filter(text => text !== origin.text)
        .filter(text => text !== target.text);

    const stableArrival = extractStableArrival(row, timerText);

    const arrival = stableArrival || timingTexts.find(text =>
    text !== timerText &&
    /hoje|amanh|ontem|às|\d{1,2}:\d{2}:\d{2}/i.test(text)
    ) || timingTexts[0] || 'N/A';

        const remaining = timerText || timingTexts.find(text => text !== arrival) || 'N/A';
        const distance = calculateDistance(origin, target);

        let unit = detectUnit(row, commandName);

        if (unit.key === 'attack') {
    const inferredUnit = inferUnitFromTravelTime(Number(distance), remaining);

    if (inferredUnit) {
        unit = inferredUnit;
    }
}

        const fallbackId = [
    'fallback',
    attacker,
    origin.coords ? origin.coords.text : origin.text,
    target.coords ? target.coords.text : target.text,
    cleanText(arrival) || endTime || estimatedEndTime
].join('|');

    return {
        id: realId || fallbackId,
        baseId: realId || fallbackId,
        hasRealId: Boolean(realId),
        commandName,
        commandUrl,
        attacker,
        attackerUrl,
        origin,
        target,
        arrival,
        remaining,
        distance,
        unit,
        isNoble: unit.key === 'noble',
        targetCount: 1
    };
}

function postDiscord(payload, webhookOverride) {
    return new Promise(resolve => {
        const webhook = cleanText(webhookOverride || getSettings().webhook);

        if (
            !webhook ||
            webhook === DEFAULT_WEBHOOK ||
            webhook === DEFAULT_ATTACKS_WEBHOOK ||
            webhook === DEFAULT_SUMMARY_WEBHOOK ||
            webhook === DEFAULT_TROOPS_WEBHOOK ||
            webhook === DEFAULT_VERIFICATION_WEBHOOK
        ) {
            console.warn('[TW] Webhook Discord nao configurado.');
            resolve();
            return;
        }

        GM_xmlhttpRequest({
            method: 'POST',
            url: webhook,
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(payload),
            onload: function (response) {
                console.log('[TW] Discord status:', response.status);
                resolve();
            },
            onerror: function (error) {
                console.warn('[TW] Erro Discord:', error);
                resolve();
            }
        });
    });
}

async function processDiscordQueue() {
    if (sending) return;
    sending = true;

    while (discordQueue.length) {
        const item = discordQueue.shift();

        if (item && item.payload) {
            await postDiscord(item.payload, item.webhook);
        } else {
            await postDiscord(item);
        }

        await delay(DISCORD_SEND_DELAY);
    }

    sending = false;
}

function queueDiscordEmbed(embed, username, webhookOverride) {
    discordQueue.push({
        webhook: webhookOverride || null,
        payload: {
            username: username || 'TribalWars Alerts',
            allowed_mentions: { parse: [] },
            embeds: [embed]
        }
    });

    processDiscordQueue();
}

    function getAttackerValue(attack) {
        return attack.attackerUrl
            ? `[${attack.attacker}](${attack.attackerUrl})`
            : attack.attacker;
    }

    function getCommandValue(attack) {
        const label = attack.unit ? attack.unit.label : attack.commandName;

        return attack.commandUrl
            ? `[${label}](${attack.commandUrl})`
            : label;
    }

    function getDefenderName() {
    try {
        if (typeof game_data !== 'undefined' && game_data.player && game_data.player.name) {
            return cleanText(game_data.player.name);
        }

        if (window.game_data && window.game_data.player && window.game_data.player.name) {
            return cleanText(window.game_data.player.name);
        }
    } catch (_) {}

    return 'Desconhecido';
}

    function getDefenderValue() {
    const name = getDefenderName();

    try {
        if (typeof game_data !== 'undefined' && game_data.player && game_data.player.id) {
            const url = new URL(window.location.href);
            url.searchParams.set('screen', 'info_player');
            url.searchParams.set('id', String(game_data.player.id));
            return `[${name}](${url.toString()})`;
        }

        if (window.game_data && window.game_data.player && window.game_data.player.id) {
            const url = new URL(window.location.href);
            url.searchParams.set('screen', 'info_player');
            url.searchParams.set('id', String(window.game_data.player.id));
            return `[${name}](${url.toString()})`;
        }
    } catch (_) {}

    return name;
}

function getCoordLink(village) {
    if (!village || !village.coords) {
        return '???';
    }

    const label = `${village.coords.text} ${village.coords.continent}`;
    const url = `https://${window.location.hostname}/game.php?screen=map&x=${village.coords.x}&y=${village.coords.y}`;

    return `[${label}](${url})`;
}

function formatArrivalText(value) {
    return cleanText(value).replace(/^hoje\b/i, 'Hoje');
}

    function getDefenderProfileUrl() {
    try {
        const player = typeof game_data !== 'undefined' ? game_data.player : window.game_data?.player;

        if (player && player.id) {
            return `https://${window.location.hostname}/game.php?screen=info_player&id=${player.id}`;
        }
    } catch (_) {}

    return null;
}

function getPlayerCacheKey(playerUrl) {
    try {
        return new URL(playerUrl).searchParams.get('id') || playerUrl;
    } catch (_) {
        return playerUrl || 'unknown';
    }
}

function formatTribe(tribe) {
    if (!tribe || !tribe.name) return 'Sem tribo';
    return tribe.url ? `[${tribe.name}](${tribe.url})` : tribe.name;
}

async function getPlayerTribe(playerUrl) {
    if (!playerUrl) {
        return { name: 'Desconhecida', url: null };
    }

    const cache = readJson(PLAYER_TRIBE_CACHE_KEY, {});
    const cacheKey = getPlayerCacheKey(playerUrl);
    const cached = cache[cacheKey];

    if (cached && Date.now() - cached.time < PLAYER_TRIBE_CACHE_MS) {
        return cached.tribe;
    }

    try {
        const response = await fetch(playerUrl, {
            credentials: 'include',
            cache: 'no-store'
        });

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const tribeLink = doc.querySelector('a[href*="screen=info_ally"][href*="id="]');

        const tribe = tribeLink
            ? {
                name: cleanText(tribeLink.innerText),
                url: getAbsoluteUrl(tribeLink.getAttribute('href'))
            }
            : {
                name: 'Sem tribo',
                url: null
            };

        cache[cacheKey] = {
            tribe,
            time: Date.now()
        };

        writeJson(PLAYER_TRIBE_CACHE_KEY, cache);

        return tribe;
    } catch (error) {
        console.warn('[TW] Erro ao carregar tribo:', error);
        return { name: 'Desconhecida', url: null };
    }
}

async function enrichAttackWithTribes(attack) {
    const [defenderTribe, attackerTribe] = await Promise.all([
        getPlayerTribe(getDefenderProfileUrl()),
        getPlayerTribe(attack.attackerUrl)
    ]);

    attack.defenderTribe = defenderTribe;
    attack.attackerTribe = attackerTribe;
}

    function buildAttackEmbed(attack, totalAttacks) {
    const defenderValue = getDefenderValue();
    const attackerValue = getAttackerValue(attack);
    const commandValue = getCommandValue(attack);

    const targetCoordsValue = getCoordLink(attack.origin);
    const originCoordsValue = getCoordLink(attack.target);

    const title = attack.isNoble
        ? '👑 ━━━ 1 NOBRE ━━━ 👑'
        : '🚨 ━━━ NOVO ATAQUE ━━━ 🚨';

    return {
        title,
        url: attack.commandUrl || undefined,
        color: attack.isNoble ? 16753920 : attack.unit.color,
        fields: [
{
    name: '━━━━━━━━━━━━━━━━━━━━\n🛡️ Defensor',
    value: [
        `**${defenderValue}**`,
        `🏰 Tribo: ${formatTribe(attack.defenderTribe)}`,
        '',
        `🏘️ Aldeia: ${getVillageLink(attack.origin)}`,
        `📍 Coordenadas: ${targetCoordsValue}`,
        '',
        `🛡️ Unidade: ${commandValue}`,
        `🕒 Chegada: **${formatArrivalText(attack.arrival)}**`,
        `⌛ Restante: **${attack.remaining}**`
    ].join('\n'),
    inline: false
},
{
    name: '━━━━━━━━━━━━━━━━━━━━\n⚔️ Atacante',
    value: [
        `**${attackerValue}**`,
        `🏰 Tribo: ${formatTribe(attack.attackerTribe)}`,
        '',
        `🏠 Origem: ${getVillageLink(attack.target)}`,
        `📌 Coordenadas: ${originCoordsValue}`
    ].join('\n'),
    inline: false
},
{
    name: '━━━━━━━━━━━━━━━━━━━━\n📊 Situação da Aldeia',
    value: [
        `Ataques neste alvo: **${attack.targetCount}**`,
        `Ataques totais: **${totalAttacks}**`
    ].join('\n'),
    inline: false
}
        ],
        footer: {
            text: 'Tribal Wars PT'
        },
        timestamp: new Date().toISOString()
    };
}

    function getNobleTrainKey(attack) {
    const target = attack.target.coords ? attack.target.coords.text : attack.target.name;
    const attacker = attack.attacker || 'Desconhecido';

    return `${target}|${attacker}`;
}

    function numberIcon(index) {
        const icons = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        return icons[index] || `${index + 1}.`;
    }

    function getNobleUniqueId(attack) {
    return [
        attack.id,
        attack.attacker,
        attack.origin.coords ? attack.origin.coords.text : attack.origin.text,
        attack.target.coords ? attack.target.coords.text : attack.target.text,
        attack.arrival,
        attack.commandUrl || ''
    ].join('|');
}

    function saveNobleSent() {
    const ids = Array.from(nobleAlreadySent).slice(-1000);
    nobleAlreadySent = new Set(ids);
    writeJson(NOBLE_SENT_KEY, ids);
}

function getCommandIdFromUrl(url) {
    if (!url) return '';

    try {
        return new URL(url, window.location.origin).searchParams.get('id') || '';
    } catch (_) {
        return '';
    }
}

function normalizeNobleKeyText(value) {
    return cleanText(value)
        .toLowerCase()
        .replace(/\bhoje\b/g, '')
        .replace(/\bamanhã\b/g, '')
        .replace(/\bamanha\b/g, '')
        .replace(/\bontem\b/g, '')
        .replace(/\bàs\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getNobleAlertKey(attack) {
    const commandId = getCommandIdFromUrl(attack.commandUrl);

    if (commandId) {
        return `noble_command_${commandId}`;
    }

    return [
        'noble',
        normalizeNobleKeyText(attack.attacker),
        attack.origin.coords ? attack.origin.coords.text : normalizeNobleKeyText(attack.origin.text),
        attack.target.coords ? attack.target.coords.text : normalizeNobleKeyText(attack.target.text),
        normalizeNobleKeyText(attack.arrival)
    ].join('|');
}

function wasNobleAlertSent(attack) {
    nobleAlreadySent = loadSet(NOBLE_SENT_KEY);
    return nobleAlreadySent.has(getNobleAlertKey(attack));
}

function markNobleAlertSent(attack) {
    nobleAlreadySent.add(getNobleAlertKey(attack));
    saveNobleSent();
}

    function addNobleToTrain(attack, totalAttacks) {
    const key = getNobleTrainKey(attack);
    const uniqueId = getNobleAlertKey(attack);

    let train = nobleTrains.get(key);

    if (!train) {
        train = {
            attacks: [],
            totalAttacks: totalAttacks || 1,
            flushAt: Date.now() + getNobleTrainDelay(),
            timer: null
        };

        nobleTrains.set(key, train);
    }

    const alreadyInTrain = train.attacks.some(existingAttack =>
        getNobleAlertKey(existingAttack) === uniqueId
    );

    if (alreadyInTrain) {
        console.log('[TW] Nobre duplicado ignorado no comboio:', uniqueId);
        return;
    }

    train.attacks.push(attack);
    train.totalAttacks = totalAttacks || train.totalAttacks || train.attacks.length;
    train.flushAt = Date.now() + getNobleTrainDelay();

    savePendingNobleTrains();
    scheduleNobleTrainFlush(key, getNobleTrainDelay());

    console.log('[TW] Nobre adicionado ao comboio:', key, train.attacks.length);
}

function savePendingNobleTrains() {
    const saved = {};

    nobleTrains.forEach((train, key) => {
        if (!train.attacks || !train.attacks.length) return;

        saved[key] = {
            attacks: train.attacks,
            totalAttacks: train.totalAttacks || train.attacks.length,
            flushAt: train.flushAt || Date.now() + getNobleTrainDelay()
        };
    });

    if (Object.keys(saved).length) {
        writeJson(NOBLE_PENDING_KEY, saved);
    } else {
        localStorage.removeItem(NOBLE_PENDING_KEY);
    }
}

function removePendingNobleTrain(key) {
    const saved = readJson(NOBLE_PENDING_KEY, {});
    delete saved[key];

    if (Object.keys(saved).length) {
        writeJson(NOBLE_PENDING_KEY, saved);
    } else {
        localStorage.removeItem(NOBLE_PENDING_KEY);
    }
}

function scheduleNobleTrainFlush(key, delayMs) {
    const train = nobleTrains.get(key);
    if (!train) return;

    clearTimeout(train.timer);

    train.timer = setTimeout(() => {
        flushNobleTrain(key).catch(error => {
            console.warn('[TW] Erro ao enviar comboio de nobres:', error);
        });
    }, Math.max(500, delayMs));
}

function restorePendingNobleTrains() {
    const saved = readJson(NOBLE_PENDING_KEY, {});

    Object.entries(saved).forEach(([key, train]) => {
        if (!train || !Array.isArray(train.attacks) || !train.attacks.length) {
            removePendingNobleTrain(key);
            return;
        }

        if (nobleTrains.has(key)) return;

        nobleTrains.set(key, {
            attacks: train.attacks,
            totalAttacks: train.totalAttacks || train.attacks.length,
            flushAt: train.flushAt || Date.now() + getNobleTrainDelay(),
            timer: null
        });

        const restoredTrain = nobleTrains.get(key);
        scheduleNobleTrainFlush(key, restoredTrain.flushAt - Date.now());
        console.log('[TW] Comboio de nobres restaurado:', key);
    });
}

async function flushNobleTrain(key) {
    const pending = readJson(NOBLE_PENDING_KEY, {});
    let train = nobleTrains.get(key);

    if (!train && pending[key]) {
        train = {
            attacks: pending[key].attacks || [],
            totalAttacks: pending[key].totalAttacks || 1,
            flushAt: pending[key].flushAt || Date.now(),
            timer: null
        };

        nobleTrains.set(key, train);
    }

    if (!train || !train.attacks || !train.attacks.length) {
        nobleTrains.delete(key);
        removePendingNobleTrain(key);
        return;
    }

    if (!isMasterTab()) {
        scheduleNobleTrainFlush(key, 1000);
        return;
    }

if (!getSettings().notifyNobleAttacks) {
    nobleTrains.delete(key);
    removePendingNobleTrain(key);
    console.log('[TW] Comboio de nobres ignorado por configuracao:', key);
    return;
}

nobleAlreadySent = loadSet(NOBLE_SENT_KEY);

train.attacks = train.attacks.filter(attack => !wasNobleAlertSent(attack));

if (!train.attacks.length) {
    nobleTrains.delete(key);
    removePendingNobleTrain(key);
    console.log('[TW] Comboio pendente removido porque ja tinha sido notificado:', key);
    return;
}

    train.attacks.sort((a, b) => String(a.arrival).localeCompare(String(b.arrival)));

    await enrichAttackWithTribes(train.attacks[0]);

    if (train.attacks.length === 1) {
        queueDiscordEmbed(buildAttackEmbed(train.attacks[0], train.totalAttacks), 'TribalWars Alerts');
    } else {
        queueDiscordEmbed(buildNobleTrainEmbed(train), 'TW Noble Train');
    }

    train.attacks.forEach(markNobleAlertSent);

    nobleTrains.delete(key);
    removePendingNobleTrain(key);

    console.log('[TW] Comboio de nobres enviado:', key);
}

    function buildNobleTrainEmbed(train) {
    const first = train.attacks[0];

    const defenderValue = getDefenderValue();
    const attackerValue = getAttackerValue(first);

    const targetCoordsValue = getCoordLink(first.origin);
    const originCoordsValue = getCoordLink(first.target);

    const arrivals = train.attacks
        .map((attack, index) => {
            return [
                `${numberIcon(index)} **${formatArrivalText(attack.arrival)}**`,
                `⌛ Restante: **${attack.remaining}**`
            ].join('\n');
        })
        .join('\n\n');

    return {
        title: `👑 ━━━ ${train.attacks.length} NOBRE${train.attacks.length === 1 ? '' : 'S'} ━━━ 👑`,
        url: first.commandUrl || undefined,
        color: 16753920,
        fields: [
            {
                name: '━━━━━━━━━━━━━━━━━━━━\n🛡️ Defensor',
                value: [
                    `**${defenderValue}**`,
                    `🏰 Tribo: ${formatTribe(first.defenderTribe)}`,
                    '',
                    `🏘️ Aldeia: ${getVillageLink(first.origin)}`,
                    `📍 Coordenadas: ${targetCoordsValue}`,
                    '',
                    `🛡️ Unidade: 👑 Nobre`,
                    `🕒 Chegadas:\n${arrivals}`
                ].join('\n'),
                inline: false
            },
            {
                name: '━━━━━━━━━━━━━━━━━━━━\n⚔️ Atacante',
                value: [
                    `**${attackerValue}**`,
                    `🏰 Tribo: ${formatTribe(first.attackerTribe)}`,
                    '',
                    `🏠 Origem: ${getVillageLink(first.target)}`,
                    `📌 Coordenadas: ${originCoordsValue}`
                ].join('\n'),
                inline: false
            },
            {
                name: '━━━━━━━━━━━━━━━━━━━━\n📊 Situação da Aldeia',
                value: [
                    `Nobres: **${train.attacks.length}**`,
                    `Ataques neste alvo: **${first.targetCount}**`,
                    `Ataques totais: **${train.totalAttacks}**`
                ].join('\n'),
                inline: false
            }
        ],
        footer: {
            text: 'Tribal Wars PT'
        },
        timestamp: new Date().toISOString()
    };
}

function getTargetKey(attack) {
    return attack.origin.coords ? attack.origin.coords.text : attack.origin.text;
}

    function getAttackSummaryState(attacks) {
    const groups = {};

    attacks.forEach(attack => {
        const key = getTargetKey(attack);

        if (!groups[key]) {
            groups[key] = {
                total: 0,
                nobles: 0
            };
        }

        groups[key].total += 1;

        if (attack.isNoble) {
            groups[key].nobles += 1;
        }
    });

    return Object.keys(groups)
        .sort()
        .map(key => `${key}:${groups[key].total}:${groups[key].nobles}`)
        .join('|');
}

function saveAttackSummaryState(attacks) {
    localStorage.setItem(SUMMARY_STATE_KEY, getAttackSummaryState(attacks));
}

function shouldSendAttackSummary(attacks) {
    if (!attacks.length) return false;

    const lastSent = Number(localStorage.getItem(SUMMARY_LAST_SENT_KEY) || 0);
    const now = Date.now();

    if (now - lastSent < SUMMARY_INTERVAL_MS) {
        return false;
    }

    localStorage.setItem(SUMMARY_LAST_SENT_KEY, String(now));
    localStorage.setItem(SUMMARY_STATE_KEY, getAttackSummaryState(attacks));

    return true;
}

async function enrichSummaryWithDefenderTribe(attacks) {
    if (!attacks.length) return;

    attacks[0].defenderTribe = await getPlayerTribe(getDefenderProfileUrl());
}

function splitSummaryLines(lines) {
    const chunks = [];

    for (let i = 0; i < lines.length; i += 8) {
        chunks.push(lines.slice(i, i + 8).join('\n'));
    }

    return chunks;
}

function buildAttackSummaryEmbed(attacks) {
    const defenderValue = getDefenderValue();
    const groups = new Map();

    attacks.forEach(attack => {
        const key = getTargetKey(attack);

        if (!groups.has(key)) {
            groups.set(key, {
    target: attack.origin,
    total: 0,
    nobles: 0
});
        }

        const group = groups.get(key);
        group.total += 1;

        if (attack.isNoble) {
            group.nobles += 1;
        }
    });

    const sortedGroups = Array.from(groups.values())
        .sort((a, b) => {
            if (b.nobles !== a.nobles) return b.nobles - a.nobles;
            return b.total - a.total;
        });

    const totalNobles = attacks.filter(attack => attack.isNoble).length;

    const villageLines = sortedGroups.map(group => {
        const villageName = cleanText(getVillageName(group.target)).slice(0, 24);
        const coords = group.target.coords
            ? `${group.target.coords.text} ${group.target.coords.continent}`
            : '???';
        const nobleText = group.nobles > 0 ? ` 👑${group.nobles}` : '';

        return `⚔️${group.total}${nobleText} ${getVillageLink(group.target)} | 📍 ${coords}`;
    });

    const chunks = [];

    for (let i = 0; i < villageLines.length; i += 6) {
        chunks.push(villageLines.slice(i, i + 6).join('\n'));
    }

    const fields = [
        {
            name: '━━━━━━━━━━━━━━━━━━━━\n🛡️ Defensor',
            value: [
                `**${defenderValue}**`,
                `Tribo: ${formatTribe(attacks[0].defenderTribe)}`,
                `Ataques: **${attacks.length}** | Aldeias: **${sortedGroups.length}** | Nobres: **${totalNobles}**`
            ].join('\n'),
            inline: false
        }
    ];

    chunks.forEach((chunk, index) => {
        fields.push({
            name: index === 0 ? '🏘️ Aldeias' : `🏘️ Aldeias ${index + 1}`,
            value: chunk,
            inline: false
        });
    });

    return {
        title: totalNobles > 0
    ? '👑 ━━━ ATAQUES A CHEGAR ━━━ 👑'
    : '📊 ━━━ ATAQUES A CHEGAR ━━━ 📊',
        color: totalNobles > 0 ? 16753920 : 16711680,
        fields,
        footer: {
            text: 'Tribal Wars PT'
        },
        timestamp: new Date().toISOString()
    };
}

    function shouldSendTroopSummary() {
    const lastSent = Number(localStorage.getItem(TROOPS_LAST_SENT_KEY) || 0);
    const now = Date.now();

    if (now - lastSent < TROOPS_INTERVAL_MS) {
        return false;
    }

    localStorage.setItem(TROOPS_LAST_SENT_KEY, String(now));
    return true;
}

async function checkIncomingAttacks() {
    if (checking) return;
    checking = true;

    try {
        alreadySent = loadSet(SENT_KEY);
        nobleAlreadySent = loadSet(NOBLE_SENT_KEY);

        await loadWorldUnitSpeed();

        const doc = await fetchIncomingAttacksDocument();
        if (isTwVerificationPage(doc)) {
    pauseForVerification('ataques a chegar');
    return;
}
        const rows = Array.from(doc.querySelectorAll('#incomings_table tbody tr'));
        errorBackoff = 0;

        const attacks = rows
            .map(parseAttackRow)
            .filter(Boolean);

        syncFallbackCountsToVisibleAttacks(attacks);

if (!attacks.length) {
    syncFallbackCountsToVisibleAttacks([]);
    saveAttackSummaryState([]);

    if (getSettings().notifyDefenseTroops && shouldSendTroopSummary()) {
        try {
            await sendTroopSummary();
            console.log('[TW] Resumo automatico de tropas enviado.');
        } catch (error) {
            console.warn('[TW] Erro ao enviar resumo automatico de tropas:', error);
        }
    }

    return;
}
        const targetCounts = {};

        attacks.forEach(attack => {
            const key = getTargetKey(attack);
            targetCounts[key] = (targetCounts[key] || 0) + 1;
        });

        attacks.forEach(attack => {
            attack.targetCount = targetCounts[getTargetKey(attack)] || 1;
        });

        const bootstrapped = localStorage.getItem(BOOTSTRAPPED_KEY) === '1';

        if (!bootstrapped && !SEND_EXISTING_ON_START) {
            rememberKnownAttacks(attacks);
            saveAttackSummaryState(attacks);

            if (!localStorage.getItem(SUMMARY_LAST_SENT_KEY)) {
                localStorage.setItem(SUMMARY_LAST_SENT_KEY, String(Date.now()));
            }

            localStorage.setItem(BOOTSTRAPPED_KEY, '1');
            console.log(`[TW] ${attacks.length} ataques existentes guardados sem enviar.`);
            return;
        }

        localStorage.setItem(BOOTSTRAPPED_KEY, '1');

        const newAttacks = collectNewAttacks(attacks);

        for (const attack of newAttacks.reverse()) {
            alreadySent.add(attack.id);
            saveSent();

            await enrichAttackWithTribes(attack);

            if (attack.isNoble) {
    if (!getSettings().notifyNobleAttacks) {
        console.log('[TW] Nobre ignorado por configuracao:', attack.id);
        continue;
    }

    if (wasNobleAlertSent(attack)) {
        console.log('[TW] Nobre ja notificado:', getNobleAlertKey(attack));
        continue;
    }

    console.log('[TW] Nobre detectado:', attack);
    addNobleToTrain(attack, attacks.length);
    continue;
}

                if (!getSettings().notifyNormalAttacks) {
                    console.log('[TW] Ataque ignorado por configuracao:', attack.id);
                    continue;
                }

                queueDiscordEmbed(buildAttackEmbed(attack, attacks.length), 'TribalWars Alerts');
                console.log('[TW] Novo ataque enviado para Discord:', attack.id);
            }

        if (getSettings().notifyAttackSummary && shouldSendAttackSummary(attacks)) {
            await enrichSummaryWithDefenderTribe(attacks);
            queueDiscordEmbed(buildAttackSummaryEmbed(attacks), 'TW Attack Summary', getSummaryWebhook());
            console.log('[TW] Resumo total de ataques enviado.');
        }
        if (getSettings().notifyDefenseTroops && shouldSendTroopSummary()) {
    try {
        await sendTroopSummary();
        console.log('[TW] Resumo automatico de tropas enviado.');
    } catch (error) {
        console.warn('[TW] Erro ao enviar resumo automatico de tropas:', error);
    }
}

    } catch (error) {
        errorBackoff = Math.min(errorBackoff + 5000, 60000);
        console.warn('[TW] Erro ao verificar ataques:', error, 'Backoff:', errorBackoff);
    } finally {
        checking = false;
    }
}

async function runCheckLoop() {
    if (verificationPaused) return;

    if (isTwVerificationPage(document)) {
        pauseForVerification('pagina atual');
        return;
    }

    if (!isMasterTab()) return;

    await checkIncomingAttacks();
}

    function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

    function getTroopsOverviewUrl() {
    const url = new URL(window.location.href);

    url.searchParams.set('screen', 'overview_villages');
    url.searchParams.set('mode', 'units');
    url.searchParams.set('page', '-1');

    url.searchParams.delete('action');
    url.searchParams.delete('ajax');
    url.searchParams.delete('h');

    return url.toString();
}

async function fetchTroopsOverviewDocument() {
    const response = await fetch(getTroopsOverviewUrl(), {
        credentials: 'include',
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    return new DOMParser().parseFromString(html, 'text/html');
}

function detectTroopUnitKey(cell) {
    const imgTexts = Array.from(cell.querySelectorAll('img'))
        .map(img => [
            img.getAttribute('src') || '',
            img.getAttribute('title') || '',
            img.getAttribute('alt') || '',
            img.className || ''
        ].join(' '))
        .join(' ');

    const haystack = [
        cell.innerText || '',
        cell.innerHTML || '',
        cell.className || '',
        imgTexts
    ].join(' ').toLowerCase();

    const aliases = {
        spear: ['unit_spear', 'unit-spear', 'unit-item-spear', 'spear.png', 'lanceiro'],
        sword: ['unit_sword', 'unit-sword', 'unit-item-sword', 'sword.png', 'espadachim'],
        axe: ['unit_axe', 'unit-axe', 'unit-item-axe', 'axe.png', 'barbaro', 'bárbaro'],
        archer: ['unit_archer', 'unit-archer', 'unit-item-archer', 'archer.png', 'arqueiro'],
        spy: ['unit_spy', 'unit-spy', 'unit-item-spy', 'spy.png', 'explorador', 'batedor'],
        light: ['unit_light', 'unit-light', 'unit-item-light', 'light.png', 'cavalaria leve'],
        marcher: ['unit_marcher', 'unit-marcher', 'unit-item-marcher', 'marcher.png', 'arqueiro a cavalo'],
        heavy: ['unit_heavy', 'unit-heavy', 'unit-item-heavy', 'heavy.png', 'cavalaria pesada'],
        ram: ['unit_ram', 'unit-ram', 'unit-item-ram', 'ram.png', 'ariete'],
        catapult: ['unit_catapult', 'unit-catapult', 'unit-item-catapult', 'catapult.png', 'catapulta'],
        knight: ['unit_knight', 'unit-knight', 'unit-item-knight', 'knight.png', 'paladino'],
        snob: ['unit_snob', 'unit-snob', 'unit-item-snob', 'snob.png', 'nobre'],
        militia: ['unit_militia', 'unit-militia', 'unit-item-militia', 'militia.png', 'milicia', 'milícia']
    };

    return Object.keys(aliases).find(key =>
        aliases[key].some(alias => haystack.includes(alias))
    ) || null;
}

function getCellAtColumn(row, columnIndex) {
    let currentIndex = 0;

    for (const cell of Array.from(row.children)) {
        const colspan = Number(cell.getAttribute('colspan') || 1);

        if (columnIndex >= currentIndex && columnIndex < currentIndex + colspan) {
            return cell;
        }

        currentIndex += colspan;
    }

    return null;
}

function getTroopColumns(table) {
    let bestColumns = [];

    Array.from(table.querySelectorAll('tr')).forEach(row => {
        const columns = [];
        let columnIndex = 0;

        Array.from(row.children).forEach(cell => {
            const unitKey = detectTroopUnitKey(cell);

            if (unitKey) {
                columns.push({
                    index: columnIndex,
                    key: unitKey
                });
            }

            columnIndex += Number(cell.getAttribute('colspan') || 1);
        });

        if (columns.length > bestColumns.length) {
            bestColumns = columns;
        }
    });

    return bestColumns;
}

function parseTroopNumber(value) {
    const raw = String(value || '').replace(/\u00a0/g, ' ').trim();

    if (!raw || raw === '-' || raw === '—') return 0;

    const lines = raw
        .split(/\r?\n/)
        .map(cleanText)
        .filter(Boolean);

    if (lines.length > 1) {
        const numericLines = lines.filter(line => /^\d[\d.\s]*$/.test(line));

        if (numericLines.length === 1) {
            return Number(numericLines[0].replace(/[.\s]/g, '')) || 0;
        }

        console.warn('[TW] Celula de tropas ignorada por conter varios valores:', raw);
        return 0;
    }

    const text = cleanText(raw);

    if (!/^\d[\d.\s]*$/.test(text)) {
        return 0;
    }

    return Number(text.replace(/[.\s]/g, '')) || 0;
}

function parseTroopsOverview(doc) {
    const tables = Array.from(doc.querySelectorAll('#units_table, table.vis, table'));
    let bestTable = null;
    let bestColumns = [];

    tables.forEach(table => {
        const columns = getTroopColumns(table);

        if (columns.length > bestColumns.length) {
            bestTable = table;
            bestColumns = columns;
        }
    });

    if (!bestTable || !bestColumns.length) {
        return null;
    }

    const totals = {};

    Object.keys(TROOP_UNIT_LABELS).forEach(key => {
        totals[key] = 0;
    });

    const rows = Array.from(bestTable.querySelectorAll('tbody tr, tr'))
        .filter(row => /\d{3}\|\d{3}/.test(cleanText(row.innerText)));

    rows.forEach(row => {
        bestColumns.forEach(column => {
            const cell = getCellAtColumn(row, column.index);
            totals[column.key] += parseTroopNumber(cell ? cell.innerText : '');
        });
    });

    return {
        totals,
        villageCount: rows.length
    };
}

function formatTroopNumber(value) {
    return Number(value || 0).toLocaleString('pt-PT');
}

function sumTroopUnits(totals, units) {
    return units.reduce((sum, unit) => sum + Number(totals[unit] || 0), 0);
}

function formatTroopLines(totals, units) {
    const lines = units
        .filter(unit => Number(totals[unit] || 0) > 0)
        .map(unit => `${TROOP_UNIT_LABELS[unit]}: **${formatTroopNumber(totals[unit])}**`);

    return lines.length ? lines.join('\n') : 'Sem tropas detectadas.';
}

function buildTroopSummaryEmbed(summary) {
    const defenseTotal = sumTroopUnits(summary.totals, TROOP_DEFENSE_UNITS);
    const attackTotal = sumTroopUnits(summary.totals, TROOP_ATTACK_UNITS);
    const totalTroops = defenseTotal + attackTotal;

    return {
        title: '📦 ━━ TROPAS MÓVEIS ━━ 📦',
        color: 5763719,
        fields: [
            {
                name: '━━━━━━━━━━━━━━━━━━━━\n🛡️ Jogador',
                value: [
                    `**${getDefenderValue()}**`,
                    `Tribo: ${formatTribe(summary.defenderTribe)}`
                ].join('\n'),
                inline: false
            },
            {
                name: '🛡️ Defesa',
                value: [
                    `Total: **${formatTroopNumber(defenseTotal)}**`,
                    '',
                    formatTroopLines(summary.totals, TROOP_DEFENSE_UNITS),
                    '',
                    '━━━━━━━━━━━━━━━━━━━━'
                ].join('\n'),
                inline: false
            },
{
    name: '⚔️ Ataque',
    value: [
        `Total: **${formatTroopNumber(attackTotal)}**`,
        '',
        formatTroopLines(summary.totals, TROOP_ATTACK_UNITS),
        '',
        '━━━━━━━━━━━━━━━━━━━━'
    ].join('\n'),
    inline: false
},
{
    name: '🏘️ Geral',
                value: [
                    `Aldeias analisadas: **${formatTroopNumber(summary.villageCount)}**`,
                    `Tropas totais: **${formatTroopNumber(totalTroops)}**`
                ].join('\n'),
                inline: false
            }
        ],
        footer: {
            text: 'Tribal Wars PT'
        },
        timestamp: new Date().toISOString()
    };
}

async function sendTroopSummary() {
    const doc = await fetchTroopsOverviewDocument();
    const summary = parseTroopsOverview(doc);

    if (!summary || !summary.villageCount) {
        console.log('[TW] Sem tropas para enviar.');
        return false;
    }

    summary.defenderTribe = await getPlayerTribe(getDefenderProfileUrl());

    queueDiscordEmbed(buildTroopSummaryEmbed(summary), 'TW Troop Summary', getTroopsWebhook());
    console.log('[TW] Resumo total de tropas enviado.');

    return true;
}

    async function sendAttackSummaryTest() {
        await loadWorldUnitSpeed();

    const doc = await fetchIncomingAttacksDocument();
    const rows = Array.from(doc.querySelectorAll('#incomings_table tbody tr'));

    const attacks = rows
        .map(parseAttackRow)
        .filter(Boolean);

    if (!attacks.length) {
        console.log('[TW] Sem ataques para testar resumo.');
        return false;
    }

    const targetCounts = {};

    attacks.forEach(attack => {
        const key = getTargetKey(attack);
        targetCounts[key] = (targetCounts[key] || 0) + 1;
    });

    attacks.forEach(attack => {
        attack.targetCount = targetCounts[getTargetKey(attack)] || 1;
    });

    await enrichSummaryWithDefenderTribe(attacks);

    queueDiscordEmbed(buildAttackSummaryEmbed(attacks), 'TW Attack Summary', getSummaryWebhook());

    console.log('[TW] Teste de resumo total enviado.');
    return true;
}

    function createSettingsUi() {
let uiWin = window;
let uiDoc = document;

try {
    if (window.top && window.top.document) {
        uiWin = window.top;
        uiDoc = window.top.document;
    }
} catch (_) {}

if (uiDoc.getElementById('tw-discord-alerts-ui')) return;

const settings = getSettings();

const style = uiDoc.createElement('style');

    style.textContent = `
#tw-discord-alerts-ui {
    position: absolute !important;
    top: 16px !important;
    right: 16px !important;
    z-index: 2147483647 !important;
    font-family: Arial, sans-serif;
}

#tw-discord-alerts-toggle {
    position: relative;
    min-width: 165px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    cursor: pointer;
    color: #fff;
    font-size: 12px;
    font-weight: bold;
    text-shadow: 1px 1px 1px #000;
    border: 1px solid #1b0d07;
    border-radius: 3px;
    background:
        linear-gradient(to bottom, rgba(255,255,255,.18), rgba(0,0,0,.18)),
        linear-gradient(to bottom, #8f2e1c 0%, #5f170f 48%, #2b0906 100%);
    box-shadow:
        inset 0 0 0 1px #d6a35a,
        inset 0 2px 2px rgba(255,255,255,.18),
        inset 0 -2px 2px rgba(0,0,0,.45),
        0 2px 5px rgba(0,0,0,.45);
    padding: 0 10px;
}

#tw-discord-alerts-toggle:hover {
    background:
        linear-gradient(to bottom, rgba(255,255,255,.22), rgba(0,0,0,.14)),
        linear-gradient(to bottom, #a63a24 0%, #711d12 48%, #35100a 100%);
}

#tw-discord-alerts-toggle:active {
    transform: translateY(1px);
}

.tw-alerts-eye {
    width: 18px;
    height: 18px;
    position: relative;
    flex: 0 0 18px;
    border-radius: 50%;
    background: radial-gradient(circle at center, #111 0%, #050505 68%, #7a4b24 70%, #d6a35a 100%);
    box-shadow: inset 0 1px 1px rgba(255,255,255,.35), 0 1px 1px #000;
}

.tw-alerts-eye::before {
    content: '';
    position: absolute;
    left: 4px;
    top: 6px;
    width: 10px;
    height: 6px;
    border-radius: 50%;
    background: #f2f2f2;
}

.tw-alerts-eye::after {
    content: '';
    position: absolute;
    left: 7px;
    top: 7px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #111;
}

#tw-discord-alerts-panel {
    display: none;
    width: 310px;
    margin-top: 8px;
            background: #f4e4bc;
            color: #2b1a0d;
            border: 2px solid #7b2d26;
            border-radius: 4px;
            padding: 10px;
            box-shadow: 0 4px 18px rgba(0,0,0,.45);
        }

        #tw-discord-alerts-panel.tw-open {
            display: block;
        }

        #tw-discord-alerts-panel h3 {
            margin: 0 0 8px;
            font-size: 14px;
            color: #7b2d26;
        }

        #tw-discord-alerts-panel label {
            display: block;
            margin: 7px 0 3px;
            font-weight: bold;
            font-size: 12px;
        }

#tw-discord-alerts-panel input[type="text"],
#tw-discord-alerts-panel input[type="number"],
#tw-discord-alerts-panel select {
    width: 100%;
    box-sizing: border-box;
    padding: 5px;
    border: 1px solid #b98b45;
    border-radius: 3px;
}

        .tw-alerts-check {
            display: flex;
            gap: 6px;
            align-items: center;
            margin: 7px 0;
            font-size: 12px;
        }

        .tw-alerts-buttons {
            display: flex;
            gap: 6px;
            margin-top: 10px;
        }

        .tw-alerts-buttons button {
            flex: 1;
            cursor: pointer;
            border: 1px solid #7b2d26;
            background: #7b2d26;
            color: #fff;
            padding: 6px;
            border-radius: 3px;
            font-weight: bold;
        }

        #tw-alerts-status {
            margin-top: 7px;
            font-size: 12px;
            color: #4b2c12;
        }
    `;
    (uiDoc.head || uiDoc.documentElement).appendChild(style);

    const root = uiDoc.createElement('div');
    root.id = 'tw-discord-alerts-ui';

    root.innerHTML = `
<button id="tw-discord-alerts-toggle" type="button">
    <span class="tw-alerts-eye"></span>
    <span>Alertas Discord</span>
</button>

        <div id="tw-discord-alerts-panel">
            <h3>TW Discord Alerts</h3>

<label>Webhook Discord - Ataques/Nobres</label>
<input id="tw-alerts-webhook" type="text" value="${escapeHtml(settings.webhook || '')}">

<label>Webhook Discord - Ataques a Chegar</label>
<input id="tw-alerts-summary-webhook" type="text" value="${escapeHtml(settings.summaryWebhook || '')}">

<label>Webhook Discord - Tropas Móveis</label>
<input id="tw-alerts-troops-webhook" type="text" value="${escapeHtml(settings.troopsWebhook || '')}">

<label>Webhook Discord - Verificação/Captcha</label>
<input id="tw-alerts-verification-webhook" type="text" value="${escapeHtml(settings.verificationWebhook || '')}">

            <div class="tw-alerts-check">
                <input id="tw-alerts-normal" type="checkbox" ${settings.notifyNormalAttacks ? 'checked' : ''}>
                <span>Notificar Ataques</span>
            </div>

            <div class="tw-alerts-check">
                <input id="tw-alerts-nobles" type="checkbox" ${settings.notifyNobleAttacks ? 'checked' : ''}>
                <span>Notificar Nobres</span>
            </div>

<div class="tw-alerts-check">
    <input id="tw-alerts-summary" type="checkbox" ${settings.notifyAttackSummary ? 'checked' : ''}>
    <span>Notificar Ataques a Chegar</span>
</div>

<div class="tw-alerts-check">
    <input id="tw-alerts-defense-troops" type="checkbox" ${settings.notifyDefenseTroops ? 'checked' : ''}>
    <span>Notificar Tropas Móveis</span>
</div>

<div class="tw-alerts-check">
    <input id="tw-alerts-verification" type="checkbox" ${settings.notifyVerificationAlerts ? 'checked' : ''}>
    <span>Notificar Verificação do Bot no Jogo (Em Teste)</span>
</div>

<label>Modo de verificação</label>
<select id="tw-alerts-interval">
    <option value="test" ${String(settings.checkInterval) === 'test' || Number(settings.checkInterval) === 2000 ? 'selected' : ''}>Teste - 2 segundos</option>
    <option value="normal" ${String(settings.checkInterval) === 'normal' || Number(settings.checkInterval) === 10000 ? 'selected' : ''}>Normal - aleatorio 1 a 5 minutos</option>
    <option value="safe" ${String(settings.checkInterval) === 'safe' || Number(settings.checkInterval) === 30000 ? 'selected' : ''}>Seguro - aleatorio 5 a 15 minutos</option>
</select>

<div class="tw-alerts-buttons">
    <button id="tw-alerts-save">Guardar</button>
    <button id="tw-alerts-test">Testar</button>
</div>

<div class="tw-alerts-buttons">
    <button id="tw-alerts-test-summary" type="button">Enviar Ataques a Chegar</button>
</div>

<div class="tw-alerts-buttons">
    <button id="tw-alerts-troops" type="button">Enviar Tropas Móveis</button>
</div>

            <div id="tw-alerts-status"></div>
        </div>
    `;

(uiDoc.body || uiDoc.documentElement).appendChild(root);

root.style.setProperty('position', 'absolute', 'important');
root.style.setProperty('top', '16px', 'important');
root.style.setProperty('right', '16px', 'important');
root.style.setProperty('left', 'auto', 'important');
root.style.setProperty('bottom', 'auto', 'important');
root.style.setProperty('margin', '0', 'important');
root.style.setProperty('z-index', '2147483647', 'important');
root.style.setProperty('transform', 'none', 'important');

    const panel = root.querySelector('#tw-discord-alerts-panel');
    const status = root.querySelector('#tw-alerts-status');

    root.querySelector('#tw-discord-alerts-toggle').addEventListener('click', () => {
        panel.classList.toggle('tw-open');
    });

    function readFormSettings() {
        return {
            webhook: root.querySelector('#tw-alerts-webhook').value.trim(),
            summaryWebhook: root.querySelector('#tw-alerts-summary-webhook').value.trim(),
            troopsWebhook: root.querySelector('#tw-alerts-troops-webhook').value.trim(),
            verificationWebhook: root.querySelector('#tw-alerts-verification-webhook').value.trim(),
            notifyNormalAttacks: root.querySelector('#tw-alerts-normal').checked,
            notifyNobleAttacks: root.querySelector('#tw-alerts-nobles').checked,
            notifyAttackSummary: root.querySelector('#tw-alerts-summary').checked,
            notifyDefenseTroops: root.querySelector('#tw-alerts-defense-troops').checked,
            notifyVerificationAlerts: root.querySelector('#tw-alerts-verification').checked,
            checkInterval: root.querySelector('#tw-alerts-interval').value || CHECK_INTERVAL,
            nobleTrainDelay: 2000
        };
    }

    root.querySelector('#tw-alerts-save').addEventListener('click', () => {
        saveSettings(readFormSettings());
        status.textContent = 'Configuracao guardada.';
    });

    root.querySelector('#tw-alerts-test').addEventListener('click', async () => {
    saveSettings(readFormSettings());
    status.textContent = 'A enviar teste...';

    await postDiscord({
            username: 'TribalWars Alerts',
            allowed_mentions: { parse: [] },
        embeds: [{
            title: '✅ Teste TW Discord Alerts',
            description: [
                'Webhook configurado corretamente.',
                '',
                `Jogador: **${getDefenderValue()}**`
            ].join('\n'),
            color: 5763719,
            footer: { text: 'Tribal Wars PT' },
            timestamp: new Date().toISOString()
        }]

        });

        status.textContent = 'Teste enviado.';
    });

    root.querySelector('#tw-alerts-troops').addEventListener('click', async () => {
    saveSettings(readFormSettings());
    status.textContent = 'A enviar tropas...';

    try {
        const sent = await sendTroopSummary();
        status.textContent = sent
            ? 'Tropas enviadas.'
            : 'Sem tropas para enviar.';
    } catch (error) {
        console.warn('[TW] Erro ao enviar tropas:', error);
        status.textContent = 'Erro ao enviar tropas.';
    }
});

    root.querySelector('#tw-alerts-test-summary').addEventListener('click', async () => {
    saveSettings(readFormSettings());
    status.textContent = 'A enviar resumo...';

    try {
        const sent = await sendAttackSummaryTest();
        status.textContent = sent
            ? 'Resumo enviado.'
            : 'Sem ataques para resumir.';
    } catch (error) {
        console.warn('[TW] Erro ao testar resumo:', error);
        status.textContent = 'Erro ao enviar resumo.';
    }
});
}

createSettingsUi();
restorePendingNobleTrains();

async function scheduleCheckLoop() {
    restorePendingNobleTrains();
    await runCheckLoop();
    setTimeout(scheduleCheckLoop, getCurrentCheckInterval());
}

function getCurrentCheckInterval() {
    return getCheckInterval() + errorBackoff;
}

    function checkCurrentPageVerification() {
    if (isTwVerificationPage(document)) {
        pauseForVerification('pagina atual');
        return true;
    }

    return false;
}

checkCurrentPageVerification();
setInterval(checkCurrentPageVerification, 5000);
setTimeout(scheduleCheckLoop, Math.floor(Math.random() * 1000));

})();
