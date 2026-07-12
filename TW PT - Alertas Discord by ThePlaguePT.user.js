// ==UserScript==
// @name         TW PT - Alertas Discord ThePlaguePT
// @namespace    http://tampermonkey.net/
// @version      1.3.11
// @description  Notificacoes de ataques Tribal Wars PT -> Discord
// @author       ThePlaguePT
// @match        https://*.tribalwars.com.pt/*
// @homepageURL  https://github.com/ThePlaguePT/TribalWars-Scripts
// @supportURL   https://github.com/ThePlaguePT/TribalWars-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Alertas%20Discord%20by%20ThePlaguePT.user.js
// @downloadURL  https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Alertas%20Discord%20by%20ThePlaguePT.user.js
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      discord.com
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    console.log('[TW Discord Alerts] Versao 1.3.11 carregada');

    const DEFAULT_WEBHOOK = 'COLOCA_O_WEBHOOK_AQUI';
    const DEFAULT_ATTACKS_WEBHOOK = 'COLOCA_O_WEBHOOK_AQUI';
    const DEFAULT_NOBLES_WEBHOOK = 'COLOCA_O_WEBHOOK_AQUI';
    const DEFAULT_SUMMARY_WEBHOOK = 'COLOCA_O_WEBHOOK_AQUI';
    const DEFAULT_TROOPS_WEBHOOK = 'COLOCA_O_WEBHOOK_AQUI';
    const DEFAULT_ATTACK_FULLS_WEBHOOK = 'COLOCA_O_WEBHOOK_AQUI';
    const DEFAULT_NOBLE_COUNTER_WEBHOOK = 'COLOCA_O_WEBHOOK_AQUI';
    const DEFAULT_VERIFICATION_WEBHOOK = 'COLOCA_O_WEBHOOK_AQUI';

    const CHECK_INTERVAL = 'normal';
    const MASTER_TTL = 15000;
    const SEND_EXISTING_ON_START = false;
    const DISCORD_SEND_DELAY = 1500;
    const NOBLE_TRAIN_DELAY = 2000;
    const AUTO_IDENTIFY_UNITS = true;
    const IDENTIFY_TOLERANCE_SECONDS = 300;
    const TAB_SESSION_KEY = 'tw_discord_attack_alerts_tab_id_v3';

    const STORAGE_PREFIX = 'tw_pt_discord_attack_alerts_pro_v1';
    const MASTER_KEY = `${STORAGE_PREFIX}_master_tab`;
    const SENT_KEY = `${STORAGE_PREFIX}_sent_attack_ids`;
    const BOOTSTRAPPED_KEY = `${STORAGE_PREFIX}_bootstrapped`;
    const FALLBACK_COUNT_KEY = `${STORAGE_PREFIX}_fallback_counts`;
    const NOBLE_PENDING_KEY = `${STORAGE_PREFIX}_pending_noble_trains`;
    const NOBLE_SENT_KEY = `${STORAGE_PREFIX}_sent_noble_ids`;
    const SUMMARY_STATE_KEY = `${STORAGE_PREFIX}_attack_summary_state`;
    const SUMMARY_LAST_SENT_KEY = `${STORAGE_PREFIX}_attack_summary_last_sent`;
    const SUMMARY_DAILY_SENT_KEY = `${STORAGE_PREFIX}_attack_summary_daily_sent`;
    const TROOPS_LAST_SENT_KEY = `${STORAGE_PREFIX}_troops_summary_last_sent`;
    const TROOPS_DAILY_SENT_KEY = `${STORAGE_PREFIX}_troops_summary_daily_sent`;
    const ATTACK_FULLS_LAST_SENT_KEY = `${STORAGE_PREFIX}_attack_fulls_last_sent`;
    const ATTACK_FULLS_DAILY_SENT_KEY = `${STORAGE_PREFIX}_attack_fulls_daily_sent`;
    const NOBLE_COUNTER_LAST_SENT_KEY = `${STORAGE_PREFIX}_noble_counter_last_sent`;
    const NOBLE_COUNTER_DAILY_SENT_KEY = `${STORAGE_PREFIX}_noble_counter_daily_sent`;
    const PLAYER_TRIBE_CACHE_KEY = `${STORAGE_PREFIX}_player_tribes`;
    const VERIFICATION_ALERT_KEY = `${STORAGE_PREFIX}_verification_alert_last_sent`;
    const GENERIC_INCOMING_STATE_KEY = `${STORAGE_PREFIX}_generic_incoming_state`;

    const PLAYER_TRIBE_CACHE_MS = 1000 * 60 * 60 * 8;
    const VERIFICATION_ALERT_COOLDOWN_MS = 1000 * 60 * 30;
    const HOUR_MS = 1000 * 60 * 60;
    const STARTUP_GRACE_MS = 1000 * 60 * 2;
    const SCRIPT_STARTED_AT = Date.now();

    const DEFAULT_SUMMARY_INTERVAL_HOURS = 8;
    const DEFAULT_TROOPS_INTERVAL_HOURS = 8;
    const DEFAULT_ATTACK_FULLS_INTERVAL_HOURS = 8;
    const DEFAULT_NOBLE_COUNTER_INTERVAL_HOURS = 8;
    const TROOPS_SUMMARY_MODE_COMPLETE = 'complete';
    const TROOPS_SUMMARY_MODE_SIMPLE_DEFENSE = 'simple_defense';
    const SCHEDULE_MODE_INTERVAL = 'interval';
    const SCHEDULE_MODE_DAILY = 'daily';
    const VERIFICATION_SLOT_COUNT = 3;
    const DEFAULT_SUMMARY_DAILY_TIME = '00:00';
    const DEFAULT_TROOPS_DAILY_TIME = '00:00';
    const DEFAULT_ATTACK_FULLS_DAILY_TIME = '00:00';
    const DEFAULT_NOBLE_COUNTER_DAILY_TIME = '00:00';

    const TROOP_UNIT_LABELS = {
        spear: '🔱 Lanceiros',
        sword: '🗡️ Espadachins',
        axe: '🪓 Vikings',
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

    const TROOP_DEFENSE_UNITS = ['spear', 'sword', 'archer', 'spy', 'heavy', 'knight', 'militia'];
    const TROOP_ATTACK_UNITS = ['axe', 'light', 'marcher', 'ram', 'catapult', 'snob'];
    const ATTACK_FULL_AXE = 5000;
    const ATTACK_FULL_LIGHT = 2000;
    const ATTACK_HALF_AXE = 2500;
    const ATTACK_HALF_LIGHT = 1000;
    const TROOP_CELL_MAX_VALUE = 5000000;
    const SETTINGS_KEY = `${STORAGE_PREFIX}_settings`;

    const DEFAULT_SETTINGS = {
        webhook: DEFAULT_ATTACKS_WEBHOOK,
        noblesWebhook: DEFAULT_NOBLES_WEBHOOK,
        summaryWebhook: DEFAULT_SUMMARY_WEBHOOK,
        troopsWebhook: DEFAULT_TROOPS_WEBHOOK,
        attackFullsWebhook: DEFAULT_ATTACK_FULLS_WEBHOOK,
        nobleCounterWebhook: DEFAULT_NOBLE_COUNTER_WEBHOOK,
        verificationWebhook: DEFAULT_VERIFICATION_WEBHOOK,
        verificationMention: '',
        verificationMentionEnabled: false,
        verificationUserSlots: [],
        verificationCouncilTag: '',
        verificationCouncilTagEnabled: false,
        verificationCouncilSlots: [],
        notifyNormalAttacks: false,
        notifyNobleAttacks: false,
        notifyAttackSummary: false,
        notifyDefenseTroops: false,
        notifyAttackFulls: false,
        notifyNobleCounter: false,
        combineAttackFullsAndNobles: false,
        notifyVerificationAlerts: false,
        summaryIntervalHours: DEFAULT_SUMMARY_INTERVAL_HOURS,
        summaryScheduleMode: SCHEDULE_MODE_INTERVAL,
        summaryDailyTime: DEFAULT_SUMMARY_DAILY_TIME,
        troopsScheduleMode: SCHEDULE_MODE_INTERVAL,
        troopsDailyTime: DEFAULT_TROOPS_DAILY_TIME,
        troopsIntervalHours: DEFAULT_TROOPS_INTERVAL_HOURS,
        troopsSummaryMode: TROOPS_SUMMARY_MODE_COMPLETE,
        attackFullsScheduleMode: SCHEDULE_MODE_INTERVAL,
        attackFullsDailyTime: DEFAULT_ATTACK_FULLS_DAILY_TIME,
        attackFullsIntervalHours: DEFAULT_ATTACK_FULLS_INTERVAL_HOURS,
        nobleCounterScheduleMode: SCHEDULE_MODE_INTERVAL,
        nobleCounterDailyTime: DEFAULT_NOBLE_COUNTER_DAILY_TIME,
        nobleCounterIntervalHours: DEFAULT_NOBLE_COUNTER_INTERVAL_HOURS,
        checkInterval: CHECK_INTERVAL,
        nobleTrainDelay: NOBLE_TRAIN_DELAY
    };

    let storedTabId = sessionStorage.getItem(TAB_SESSION_KEY);
    if (!storedTabId) {
        storedTabId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem(TAB_SESSION_KEY, storedTabId);
    }

    const TAB_ID = storedTabId;

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

    function getSettings() {
        return Object.assign({}, DEFAULT_SETTINGS, readJson(SETTINGS_KEY, {}));
    }

    function saveSettings(settings) {
        writeJson(SETTINGS_KEY, Object.assign({}, getSettings(), settings));
    }

    function saveSent() {
        const ids = Array.from(alreadySent).slice(-1000);
        alreadySent = new Set(ids);
        writeJson(SENT_KEY, ids);
    }

    function saveNobleSent() {
        const ids = Array.from(nobleAlreadySent).slice(-1000);
        nobleAlreadySent = new Set(ids);
        writeJson(NOBLE_SENT_KEY, ids);
    }

    function cleanText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
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

    function getCurrentCheckInterval() {
        return getCheckInterval() + errorBackoff;
    }

    function normalizeIntervalHours(value, fallback) {
        const hours = Number(value);
        return hours === 8 || hours === 16 || hours === 24 ? hours : fallback;
    }

    function normalizeScheduleMode(value) {
        return value === SCHEDULE_MODE_DAILY ? SCHEDULE_MODE_DAILY : SCHEDULE_MODE_INTERVAL;
    }

    function normalizeDailyTime(value, fallback) {
        const text = String(value || '').trim();
        const match = text.match(/^(\d{2}):(\d{2})$/);

        if (!match) return fallback;

        const hour = Number(match[1]);
        const minute = Number(match[2]);

        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return fallback;
        }

        return text;
    }

    function normalizeTroopsSummaryMode(value) {
        return value === TROOPS_SUMMARY_MODE_SIMPLE_DEFENSE
            ? TROOPS_SUMMARY_MODE_SIMPLE_DEFENSE
            : TROOPS_SUMMARY_MODE_COMPLETE;
    }

    function getSummaryIntervalMs() {
        return normalizeIntervalHours(
            getSettings().summaryIntervalHours,
            DEFAULT_SUMMARY_INTERVAL_HOURS
        ) * HOUR_MS;
    }

    function getTroopsIntervalMs() {
        return normalizeIntervalHours(
            getSettings().troopsIntervalHours,
            DEFAULT_TROOPS_INTERVAL_HOURS
        ) * HOUR_MS;
    }

    function getAttackFullsIntervalMs() {
        return normalizeIntervalHours(
            getSettings().attackFullsIntervalHours,
            DEFAULT_ATTACK_FULLS_INTERVAL_HOURS
        ) * HOUR_MS;
    }

    function getNobleCounterIntervalMs() {
        return normalizeIntervalHours(
            getSettings().nobleCounterIntervalHours,
            DEFAULT_NOBLE_COUNTER_INTERVAL_HOURS
        ) * HOUR_MS;
    }

    function getNobleTrainDelay() {
        return Number(getSettings().nobleTrainDelay || NOBLE_TRAIN_DELAY);
    }

    function getLocalDateKey(date) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
    }

    function shouldSendBySchedule(lastSentKey, dailySentKey, scheduleMode, intervalMs, dailyTime, defaultDailyTime) {
        const mode = normalizeScheduleMode(scheduleMode);
        const nowDate = new Date();
        const now = nowDate.getTime();

        if (mode === SCHEDULE_MODE_DAILY) {
            const time = normalizeDailyTime(dailyTime, defaultDailyTime);
            const parts = time.split(':');
            const targetDate = new Date();
            targetDate.setHours(Number(parts[0]), Number(parts[1]), 0, 0);

            const todayKey = getLocalDateKey(nowDate);

            if (now < targetDate.getTime()) return false;
            if (localStorage.getItem(dailySentKey) === todayKey) return false;

            localStorage.setItem(dailySentKey, todayKey);
            localStorage.setItem(lastSentKey, String(now));
            return true;
        }

        const lastSent = Number(localStorage.getItem(lastSentKey) || 0);
        if (now - lastSent < intervalMs) return false;

        localStorage.setItem(lastSentKey, String(now));
        return true;
    }

    function getCurrentWorldValue() {
        const hostname = window.location.hostname;
        const world = hostname.split('.')[0].toUpperCase();
        const url = 'https://' + hostname + '/game.php';
        return '[' + world + '](' + url + ')';
    }

    function formatTribe(tribe) {
        if (!tribe || !tribe.name) return 'Sem tribo';
        return tribe.url ? '[' + tribe.name + '](' + tribe.url + ')' : tribe.name;
    }

    function getAbsoluteUrl(href) {
        if (!href) return null;
        return new URL(href, window.location.origin).toString();
    }

    function isTwVerificationPage(doc) {
        if (!doc || !doc.body) return false;

        const text = cleanText(doc.body.innerText || '').toLowerCase();
        const html = (doc.documentElement ? doc.documentElement.innerHTML : '').toLowerCase();
        const currentUrl = window.location.href;

        const isLoginOrPortalPage =
            !currentUrl.includes('/game.php') ||
            Boolean(doc.querySelector('input[type="password"], form[action*="login"]')) ||
            text.includes('iniciar sessão') ||
            text.includes('iniciar sessao') ||
            text.includes('palavra-passe') ||
            text.includes('password') ||
            text.includes('entrar no mundo');

        if (isLoginOrPortalPage) return false;

        const hasTwBotProtectionPage =
            text.includes('proteção contra bots') ||
            text.includes('protecao contra bots') ||
            text.includes('verificação de proteção de bots') ||
            text.includes('verificacao de protecao de bots') ||
            text.includes('inicia a verificação da proteção do bot') ||
            text.includes('inicia a verificacao da protecao do bot') ||
            text.includes('antes de poderes continuar a jogar');

        if (hasTwBotProtectionPage) return true;

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

        return Boolean((hasCaptchaElement || hasCaptchaCode) && hasCaptchaText);
    }

    function getVerificationWebhook() {
        const settings = getSettings();
        const verificationWebhook = cleanText(settings.verificationWebhook);

        return verificationWebhook && verificationWebhook !== DEFAULT_VERIFICATION_WEBHOOK
            ? verificationWebhook
            : cleanText(settings.webhook);
    }

    function getSummaryWebhook() {
        const settings = getSettings();
        const summaryWebhook = cleanText(settings.summaryWebhook);

        return summaryWebhook && summaryWebhook !== DEFAULT_SUMMARY_WEBHOOK
            ? summaryWebhook
            : cleanText(settings.webhook);
    }

    function getNoblesWebhook() {
        const settings = getSettings();
        const noblesWebhook = cleanText(settings.noblesWebhook);

        return noblesWebhook && noblesWebhook !== DEFAULT_NOBLES_WEBHOOK
            ? noblesWebhook
            : cleanText(settings.webhook);
    }

    function getTroopsWebhook() {
        const settings = getSettings();
        const troopsWebhook = cleanText(settings.troopsWebhook);

        return troopsWebhook && troopsWebhook !== DEFAULT_TROOPS_WEBHOOK
            ? troopsWebhook
            : cleanText(settings.webhook);
    }

    function getAttackFullsWebhook() {
        const settings = getSettings();
        const attackFullsWebhook = cleanText(settings.attackFullsWebhook);

        return attackFullsWebhook && attackFullsWebhook !== DEFAULT_ATTACK_FULLS_WEBHOOK
            ? attackFullsWebhook
            : cleanText(settings.webhook);
    }

    function getNobleCounterWebhook() {
        const settings = getSettings();
        const nobleCounterWebhook = cleanText(settings.nobleCounterWebhook);

        return nobleCounterWebhook && nobleCounterWebhook !== DEFAULT_NOBLE_COUNTER_WEBHOOK
            ? nobleCounterWebhook
            : cleanText(settings.webhook);
    }

    function getCombinedCountersWebhook() {
        const settings = getSettings();
        const attackFullsWebhook = cleanText(settings.attackFullsWebhook);
        const nobleCounterWebhook = cleanText(settings.nobleCounterWebhook);

        if (attackFullsWebhook && attackFullsWebhook !== DEFAULT_ATTACK_FULLS_WEBHOOK) {
            return attackFullsWebhook;
        }

        if (nobleCounterWebhook && nobleCounterWebhook !== DEFAULT_NOBLE_COUNTER_WEBHOOK) {
            return nobleCounterWebhook;
        }

        return cleanText(settings.webhook);
    }

    function uniqueList(values) {
        return Array.from(new Set(values.filter(Boolean)));
    }

    function normalizeVerificationSlots(settings, slotsKey, legacyValueKey, legacyEnabledKey) {
        const savedSlots = Array.isArray(settings[slotsKey]) ? settings[slotsKey] : [];
        const legacyValue = cleanText(settings[legacyValueKey] || '');
        const legacyEnabled = settings[legacyEnabledKey] !== false;
        const slots = [];

        for (let index = 0; index < VERIFICATION_SLOT_COUNT; index++) {
            const savedSlot = savedSlots[index] || {};
            const savedValue = cleanText(savedSlot.value || '');
            const hasSavedSlot = index < savedSlots.length;
            const fallbackValue = index === 0 ? legacyValue : '';

            slots.push({
                enabled: hasSavedSlot ? Boolean(savedSlot.enabled && savedValue) : Boolean(fallbackValue && legacyEnabled),
                value: savedValue || fallbackValue
            });
        }

        return slots;
    }

    function getEnabledVerificationSlots(settings, slotsKey, legacyValueKey, legacyEnabledKey) {
        return normalizeVerificationSlots(settings, slotsKey, legacyValueKey, legacyEnabledKey)
            .filter(slot => slot.enabled && cleanText(slot.value));
    }

    function getVerificationUserMention() {
        const settings = getSettings();
        const parts = [];

        getEnabledVerificationSlots(settings, 'verificationUserSlots', 'verificationMention', 'verificationMentionEnabled')
            .forEach(slot => {
                const value = cleanText(slot.value);

                if (value === '@everyone' || value === '@here') {
                    parts.push(value);
                    return;
                }

                const userIds = value.match(/\d{17,20}/g);

                if (userIds && userIds.length) {
                    userIds.forEach(id => parts.push(`<@${id}>`));
                }
            });

        return uniqueList(parts).join(' ');
    }

    function getVerificationCouncilTag() {
        const settings = getSettings();
        const parts = [];

        getEnabledVerificationSlots(settings, 'verificationCouncilSlots', 'verificationCouncilTag', 'verificationCouncilTagEnabled')
            .forEach(slot => {
                const value = cleanText(slot.value);

                if (!value) return;

                if (/<@&\d{17,20}>/.test(value)) {
                    parts.push(value);
                    return;
                }

                parts.push(value.replace(/\b(\d{17,20})\b/g, '<@&$1>'));
            });

        return uniqueList(parts).join(' ');
    }

    function getVerificationContent() {
        return [
            getVerificationUserMention(),
            getVerificationCouncilTag()
        ].filter(Boolean).join(' ');
    }

    function notifyVerificationPageDetected(source) {
        if (!getSettings().notifyVerificationAlerts) return;

        const now = Date.now();
        const lastSent = Number(localStorage.getItem(VERIFICATION_ALERT_KEY) || 0);
        if (now - lastSent < VERIFICATION_ALERT_COOLDOWN_MS) return;

        localStorage.setItem(VERIFICATION_ALERT_KEY, String(now));

        const mention = getVerificationContent();
        const allowedMentionTypes = [
            /(^|\s)@(everyone|here)(\s|$)/.test(mention) ? 'everyone' : '',
            /<@!?\d{17,20}>/.test(mention) ? 'users' : '',
            /<@&\d{17,20}>/.test(mention) ? 'roles' : ''
        ].filter(Boolean);

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
        }, 'TW Verification Alert', getVerificationWebhook(), {
            content: mention || undefined,
            allowed_mentions: {
                parse: allowedMentionTypes
            }
        });
    }

    function pauseForVerification(source) {
        verificationPaused = true;
        console.warn('[TW] Pagina de verificacao detetada. Script em pausa:', source);
        notifyVerificationPageDetected(source);
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

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        return new DOMParser().parseFromString(html, 'text/html');
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
            const attrs = [checkbox.name || '', checkbox.id || ''];

            for (const attr of attrs) {
                const match = attr.match(/(?:command|cmd)[^\d]*(\d{5,})/i);
                if (match) return `command_${match[1]}`;
            }
        }

        return null;
    }

    function getElementCellIndex(cells, element) {
        const cell = element ? element.closest('td') : null;
        return cell ? cells.indexOf(cell) : -1;
    }

    function getLikelyAttackerLink(row, cells, villageCells) {
        const links = Array.from(row.querySelectorAll('a[href*="screen=info_player"]'));
        if (!links.length) return null;

        const defenderName = normalizeSearchText(getDefenderName());
        const hasKnownDefenderName = defenderName && defenderName !== 'desconhecido';
        const commandCell = getCommandCell(row);
        const commandCellIndex = commandCell ? cells.indexOf(commandCell) : -1;
        const lastVillageCellIndex = villageCells.reduce((maxIndex, cell) => {
            return Math.max(maxIndex, cells.indexOf(cell));
        }, -1);

        const candidates = links
            .map(link => {
                const name = cleanText(link.innerText);
                return {
                    link,
                    name,
                    normalizedName: normalizeSearchText(name),
                    cellIndex: getElementCellIndex(cells, link)
                };
            })
            .filter(candidate => candidate.name);

        if (!candidates.length) return links[links.length - 1];

        const outsideCommand = candidates.filter(candidate => candidate.cellIndex !== commandCellIndex);
        const afterVillages = outsideCommand.filter(candidate => candidate.cellIndex > lastVillageCellIndex);
        const isNotDefender = candidate => !hasKnownDefenderName || candidate.normalizedName !== defenderName;

        return (
            afterVillages.find(isNotDefender) ||
            afterVillages[0] ||
            outsideCommand.find(isNotDefender) ||
            outsideCommand[outsideCommand.length - 1] ||
            candidates.find(isNotDefender) ||
            candidates[candidates.length - 1]
        ).link;
    }

    function getLinkedText(cell, screen) {
        const link = cell ? cell.querySelector(`a[href*="screen=${screen}"]`) : null;
        return link ? cleanText(link.innerText) : '';
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

    function getVillageName(village) {
        return village && village.name ? village.name : 'Desconhecida';
    }

    function getVillageLink(village) {
        if (!village || !village.url) return getVillageName(village);
        return '[' + getVillageName(village) + '](' + village.url + ')';
    }

    function getCoordLink(village) {
        if (!village || !village.coords) return '???';

        const label = village.coords.text + ' ' + village.coords.continent;
        const url = 'https://' + window.location.hostname + '/game.php?screen=map&x=' + village.coords.x + '&y=' + village.coords.y;
        return '[' + label + '](' + url + ')';
    }

    function calculateDistance(origin, target) {
        if (!origin.coords || !target.coords) return null;

        const dx = origin.coords.x - target.coords.x;
        const dy = origin.coords.y - target.coords.y;
        return Math.sqrt((dx * dx) + (dy * dy)).toFixed(2);
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

    function getPrimaryCommandName(commandName) {
        return cleanText(commandName)
            .split('|')[0]
            .replace(/\breturn\b.*$/i, '')
            .replace(/\borigem\b.*$/i, '')
            .replace(/\borigin\b.*$/i, '')
            .trim();
    }

    function getCommandCell(row) {
        const commandLink = getCommandLink(row);
        return commandLink ? commandLink.closest('td') : row.querySelector('td');
    }

    function detectUnit(row, commandName) {
        const commandCell = getCommandCell(row);
        const commandUnitName = getPrimaryCommandName(commandName);
        const imgTexts = Array.from(commandCell ? commandCell.querySelectorAll('img') : [])
            .map(img => [
                img.getAttribute('src') || '',
                img.getAttribute('title') || '',
                img.getAttribute('alt') || '',
                img.className || ''
            ].join(' '))
            .join(' ');

        const haystack = [
            commandUnitName || '',
            imgTexts
        ].join(' ').toLowerCase();

        const hasRam = haystack.includes('ram') || haystack.includes('ariete');
        const hasCatapult = haystack.includes('catapult') || haystack.includes('catapulta');
        const hasSpy = haystack.includes('spy') || haystack.includes('scout') || haystack.includes('explorador') || haystack.includes('batedor');
        const hasNoble = haystack.includes('snob') || haystack.includes('nobre') || haystack.includes('nobres') || haystack.includes('noble');

        if (hasNoble && !hasRam && !hasCatapult && !hasSpy) {
            return { key: 'noble', label: '👑 Nobre', color: 0xF1C40F };
        }

        if (hasRam) {
            return { key: 'ram', label: '🐏 Ariete', color: 0xE67E22 };
        }

        if (hasCatapult) {
            return { key: 'catapult', label: '🪨 Catapulta', color: 0xC0392B };
        }

        if (hasSpy) {
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
            const unitSpeedNode = doc.querySelector('unit_speed');
            const unitSpeedText = unitSpeedNode ? unitSpeedNode.textContent : '';
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
        if (match) return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);

        match = text.match(/^(\d+):(\d{2})$/);
        if (match) return Number(match[1]) * 60 + Number(match[2]);

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
                best = { unit, diff };
            }
        });

        if (!best || best.diff > IDENTIFY_TOLERANCE_SECONDS) return null;
        return best.unit;
    }

    function parseAttackRow(row) {
        const realId = getCommandId(row);
        const cells = Array.from(row.querySelectorAll('td'));
        const commandLink = getCommandLink(row);
        const commandUrl = commandLink ? getAbsoluteUrl(commandLink.getAttribute('href')) : null;
        const commandImg = row.querySelector('img[title], img[alt]');
        const commandName =
            cleanText(commandLink ? commandLink.innerText : '') ||
            cleanText(commandImg ? commandImg.getAttribute('title') : '') ||
            cleanText(commandImg ? commandImg.getAttribute('alt') : '') ||
            'Ataque';

        const villageCells = cells.filter(cell => parseCoords(cell.innerText));
        const playerLink = getLikelyAttackerLink(row, cells, villageCells);
        const attacker = playerLink ? cleanText(playerLink.innerText) : 'Desconhecido';
        const attackerUrl = playerLink ? getAbsoluteUrl(playerLink.getAttribute('href')) : null;
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

        if (!originCell || !targetCell) return null;

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
            if (inferredUnit) unit = inferredUnit;
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

    function parseFirstPositiveNumber(value) {
        const match = cleanText(value).match(/\d[\d.]*/);
        if (!match) return null;

        const number = Number(match[0].replace(/\./g, '')) || 0;
        return number > 0 ? number : null;
    }

    function detectGenericIncomingSignal(doc) {
        if (!doc || !doc.body) return null;

        const bodyText = normalizeSearchText(doc.body.innerText || '');
        const premiumLimited =
            bodyText.includes('premium') ||
            bodyText.includes('conta premium') ||
            bodyText.includes('funcao premium') ||
            bodyText.includes('funcao de premium') ||
            bodyText.includes('esta funcionalidade');
        const mentionsIncoming =
            bodyText.includes('ataque a chegar') ||
            bodyText.includes('ataques a chegar') ||
            bodyText.includes('comando a chegar') ||
            bodyText.includes('comandos a chegar');
        const isPremiumLimitedIncoming = premiumLimited && mentionsIncoming;

        const selectors = [
            '#incomings_amount',
            '#incomings_count',
            '#incomings_cell',
            'a[href*="mode=incomings"]',
            'a[href*="screen=overview_villages"][href*="mode=incomings"]',
            'a[href*="screen=overview"][href*="mode=incomings"]',
            '.incoming-count',
            '.command-incoming'
        ];

        for (const selector of selectors) {
            const elements = Array.from(doc.querySelectorAll(selector));

            for (const element of elements) {
                const textValues = [
                    element.innerText || '',
                    element.textContent || '',
                    element.getAttribute('title') || '',
                    element.getAttribute('alt') || ''
                ].map(cleanText).filter(Boolean);

                const count = textValues
                    .map(parseFirstPositiveNumber)
                    .find(value => value !== null);

                if (count !== null) {
                    return {
                        detected: true,
                        count,
                        source: isPremiumLimitedIncoming ? 'Vista sem Premium' : 'Indicador do jogo',
                        premiumLimited: isPremiumLimitedIncoming
                    };
                }
            }
        }

        const text = bodyText;
        const patterns = [
            /ataques?\s+a\s+chegar\D{0,40}(\d[\d.\s]*)/i,
            /(\d[\d.\s]*)\D{0,20}ataques?\s+a\s+chegar/i,
            /comandos?\s+a\s+chegar\D{0,40}(\d[\d.\s]*)/i,
            /(\d[\d.\s]*)\D{0,20}comandos?\s+a\s+chegar/i
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (!match) continue;

            const count = parseFirstPositiveNumber(match[1]);
            if (count !== null) {
                return {
                    detected: true,
                    count,
                    source: isPremiumLimitedIncoming ? 'Vista sem Premium' : 'Texto do jogo',
                    premiumLimited: isPremiumLimitedIncoming
                };
            }
        }

        if (isPremiumLimitedIncoming) {
            return {
                detected: true,
                count: null,
                source: 'Vista sem Premium',
                premiumLimited: true
            };
        }

        return null;
    }

    function getGenericIncomingWebhook() {
        const settings = getSettings();
        const attacksWebhook = cleanText(settings.webhook);

        if (
            attacksWebhook &&
            attacksWebhook !== DEFAULT_WEBHOOK &&
            attacksWebhook !== DEFAULT_ATTACKS_WEBHOOK
        ) {
            return attacksWebhook;
        }

        return getNoblesWebhook();
    }

    function normalizePremiumState(value) {
        if (value === true) return true;
        if (value === false || value === null) return false;

        if (typeof value === 'number') {
            if (value <= 0) return false;
            return value > Math.floor(Date.now() / 1000) || value === 1;
        }

        if (typeof value === 'string') {
            const text = value.trim().toLowerCase();
            if (!text || text === '0' || text === 'false' || text === 'no' || text === 'inactive') {
                return false;
            }

            if (text === '1' || text === 'true' || text === 'yes' || text === 'active') {
                return true;
            }

            const numeric = Number(text);
            if (!Number.isNaN(numeric)) {
                return normalizePremiumState(numeric);
            }
        }

        if (value && typeof value === 'object') {
            if ('active' in value) return normalizePremiumState(value.active);
            if ('enabled' in value) return normalizePremiumState(value.enabled);
            if ('expires' in value) return normalizePremiumState(value.expires);
            if ('until' in value) return normalizePremiumState(value.until);
        }

        return null;
    }

    function getGameData() {
        try {
            if (typeof game_data !== 'undefined' && game_data) {
                return game_data;
            }

            if (typeof unsafeWindow !== 'undefined' && unsafeWindow.game_data) {
                return unsafeWindow.game_data;
            }

            if (window.game_data) {
                return window.game_data;
            }
        } catch (_) {}

        return null;
    }

    function hasPremiumAccount() {
        const data = getGameData();
        if (!data) return null;

        const candidates = [
            data.features && data.features.Premium,
            data.features && data.features.premium,
            data.player && data.player.premium,
            data.player && data.player.premium_active,
            data.player && data.player.premium_account,
            data.player && data.player.premium_expires,
            data.player && data.player.premium_until
        ];

        for (const candidate of candidates) {
            const state = normalizePremiumState(candidate);
            if (state !== null) return state;
        }

        return null;
    }

    function shouldUseGenericIncomingFallback(signal) {
        if (!signal || !signal.detected) return false;

        if (signal.premiumLimited || signal.source === 'Vista sem Premium') {
            return true;
        }

        return hasPremiumAccount() === false;
    }

    function buildGenericIncomingEmbed(signal) {
        const countText = signal && signal.count
            ? `Ataques detetados: **${formatTroopNumber(signal.count)}**`
            : 'Ataques detetados: **1 ou mais**';

        return {
            title: '🚨 ━━━ ATAQUE A CHEGAR ━━━ 🚨',
            color: 15158332,
            fields: [
                {
                    name: '━━━━━━━━━━━━━━━━━━━━\n🛡️ Defensor',
                    value: [
                        `**${getDefenderValue()}**`,
                        countText
                    ].join('\n'),
                    inline: false
                },
                {
                    name: 'ℹ️ Informação',
                    value: [
                        'O jogo indica que existe ataque a chegar.',
                        'Não foi possível obter detalhes da aba de comandos nesta conta/página.',
                        'Abre o jogo para confirmar manualmente.'
                    ].join('\n'),
                    inline: false
                }
            ],
            footer: { text: 'Tribal Wars PT' },
            timestamp: new Date().toISOString()
        };
    }

    function readGenericIncomingState() {
        const raw = localStorage.getItem(GENERIC_INCOMING_STATE_KEY);

        if (!raw) {
            return {
                present: false,
                count: null
            };
        }

        try {
            const parsed = JSON.parse(raw);

            if (parsed && typeof parsed === 'object') {
                const count = parsed.count === null || typeof parsed.count === 'undefined'
                    ? null
                    : Number(parsed.count);

                return {
                    present: Boolean(parsed.present),
                    count: Number.isFinite(count) ? count : null
                };
            }
        } catch (_) {}

        if (raw.startsWith('count:')) {
            const count = Number(raw.slice(6));

            return {
                present: true,
                count: Number.isFinite(count) ? count : null
            };
        }

        return {
            present: raw === 'present',
            count: null
        };
    }

    function saveGenericIncomingState(signal) {
        writeJson(GENERIC_INCOMING_STATE_KEY, {
            present: Boolean(signal && signal.detected),
            count: signal && signal.count ? Number(signal.count) : null,
            time: Date.now()
        });
    }

    function maybeNotifyGenericIncoming(signal) {
        const settings = getSettings();

        if (!signal || !signal.detected) {
            localStorage.removeItem(GENERIC_INCOMING_STATE_KEY);
            return false;
        }

        if (!shouldUseGenericIncomingFallback(signal)) {
            localStorage.removeItem(GENERIC_INCOMING_STATE_KEY);
            console.log('[TW] Alerta generico ignorado porque a conta parece ter Premium ou o estado Premium nao foi confirmado.');
            return false;
        }

        if (!settings.notifyNormalAttacks && !settings.notifyNobleAttacks) {
            return false;
        }

        const previousState = readGenericIncomingState();
        const currentCount = signal.count ? Number(signal.count) : null;

        if (currentCount !== null && previousState.present && previousState.count !== null) {
            if (currentCount <= previousState.count) {
                saveGenericIncomingState(signal);
                console.log('[TW] Alerta generico ignorado porque o contador nao aumentou:', previousState.count, '->', currentCount);
                return false;
            }
        }

        if (currentCount !== null && previousState.present && previousState.count === null) {
            saveGenericIncomingState(signal);
            console.log('[TW] Alerta generico ignorado porque ja existia ataque sem contador confirmado.');
            return false;
        }

        if (currentCount === null && previousState.present) {
            return false;
        }

        saveGenericIncomingState(signal);
        queueDiscordEmbed(
            buildGenericIncomingEmbed(signal),
            'TribalWars Alerts',
            getGenericIncomingWebhook()
        );

        console.log('[TW] Alerta generico de ataque enviado:', currentCount === null ? 'present' : `count:${currentCount}`);
        return true;
    }

    function getFallbackCounts() {
        return readJson(FALLBACK_COUNT_KEY, {});
    }

    function saveFallbackCounts(counts) {
        writeJson(FALLBACK_COUNT_KEY, counts);
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
                if (!alreadySent.has(attack.id)) newAttacks.push(attack);
                return;
            }

            const baseId = attack.baseId || attack.id;
            if (!fallbackGroups.has(baseId)) fallbackGroups.set(baseId, []);
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

    function addWorldInfoToEmbed(embed) {
        if (!embed || typeof embed !== 'object') return embed;

        const worldValue = getCurrentWorldValue();
        const description = String(embed.description || '');
        const alreadyHasWorld =
            description.includes(worldValue) ||
            description.toLowerCase().includes('mundo') ||
            (Array.isArray(embed.fields) && embed.fields.some(field =>
                String(field.name || '').toLowerCase().includes('mundo') ||
                String(field.value || '').includes(worldValue)
            ));

        if (alreadyHasWorld) return embed;

        return Object.assign({}, embed, {
            description: [
                `🌍 Mundo: ${worldValue}`,
                description
            ].filter(Boolean).join('\n\n')
        });
    }

    function addWorldInfoToPayload(payload) {
        if (!payload || !Array.isArray(payload.embeds)) return payload;

        return Object.assign({}, payload, {
            embeds: payload.embeds.map(addWorldInfoToEmbed)
        });
    }

    function postDiscord(payload, webhookOverride) {
        return new Promise(resolve => {
            const webhook = cleanText(webhookOverride || getSettings().webhook);

            if (
                !webhook ||
                webhook === DEFAULT_WEBHOOK ||
                webhook === DEFAULT_ATTACKS_WEBHOOK ||
                webhook === DEFAULT_NOBLES_WEBHOOK ||
                webhook === DEFAULT_SUMMARY_WEBHOOK ||
                webhook === DEFAULT_TROOPS_WEBHOOK ||
                webhook === DEFAULT_ATTACK_FULLS_WEBHOOK ||
                webhook === DEFAULT_NOBLE_COUNTER_WEBHOOK ||
                webhook === DEFAULT_VERIFICATION_WEBHOOK
            ) {
                console.warn('[TW] Webhook Discord nao configurado.');
                resolve();
                return;
            }

            GM_xmlhttpRequest({
                method: 'POST',
                url: webhook,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(addWorldInfoToPayload(payload)),
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

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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

    function queueDiscordEmbed(embed, username, webhookOverride, options = {}) {
        discordQueue.push({
            webhook: webhookOverride || null,
            payload: {
                username: username || 'TribalWars Alerts',
                content: options.content || undefined,
                allowed_mentions: options.allowed_mentions || { parse: [] },
                embeds: [embed]
            }
        });

        processDiscordQueue();
    }

    function getAttackerValue(attack) {
        return attack.attackerUrl
            ? '[' + attack.attacker + '](' + attack.attackerUrl + ')'
            : attack.attacker;
    }

    function getCommandValue(attack) {
        const label = attack.unit ? attack.unit.label : attack.commandName;
        return attack.commandUrl ? '[' + label + '](' + attack.commandUrl + ')' : label;
    }

    function getGameDataPlayer() {
        try {
            const data = getGameData();
            return data && data.player ? data.player : null;
        } catch (_) {}

        return null;
    }

    function getDefenderName() {
        const player = getGameDataPlayer();

        if (player && player.name) {
            return cleanText(player.name);
        }

        return 'Desconhecido';
    }

    function getDefenderValue() {
        const name = getDefenderName();
        const player = getGameDataPlayer();

        try {
            if (player && player.id) {
                const url = new URL(window.location.href);
                url.searchParams.set('screen', 'info_player');
                url.searchParams.set('id', String(player.id));
                return '[' + name + '](' + url.toString() + ')';
            }
        } catch (_) {}

        return name;
    }

    function getPlayerVillageCount() {
        try {
            const player = getGameDataPlayer();
            const count = Number(player && player.villages);

            if (count > 0) {
                return count;
            }
        } catch (_) {}

        return null;
    }

    function formatArrivalText(value) {
        return cleanText(value).replace(/^hoje\b/i, 'Hoje');
    }

    function getDefenderProfileUrl() {
        try {
            const player = getGameDataPlayer();

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

    async function getPlayerTribe(playerUrl) {
        if (!playerUrl) return { name: 'Desconhecida', url: null };

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

            cache[cacheKey] = { tribe, time: Date.now() };
            writeJson(PLAYER_TRIBE_CACHE_KEY, cache);
            return tribe;
        } catch (error) {
            console.warn('[TW] Erro ao carregar tribo:', error);
            return { name: 'Desconhecida', url: null };
        }
    }

    async function enrichAttackWithTribes(attack) {
        const results = await Promise.all([
            getPlayerTribe(getDefenderProfileUrl()),
            getPlayerTribe(attack.attackerUrl)
        ]);

        attack.defenderTribe = results[0];
        attack.attackerTribe = results[1];
    }

    function buildAttackEmbed(attack, totalAttacks) {
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
                        `**${getDefenderValue()}**`,
                        `🏰 Tribo: ${formatTribe(attack.defenderTribe)}`,
                        '',
                        `🏘️ Aldeia: ${getVillageLink(attack.origin)}`,
                        `📍 Coordenadas: ${getCoordLink(attack.origin)}`,
                        '',
                        `🛡️ Unidade: ${getCommandValue(attack)}`,
                        `🕒 Chegada: **${formatArrivalText(attack.arrival)}**`,
                        `⌛ Restante: **${attack.remaining}**`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '━━━━━━━━━━━━━━━━━━━━\n⚔️ Atacante',
                    value: [
                        `**${getAttackerValue(attack)}**`,
                        `🏰 Tribo: ${formatTribe(attack.attackerTribe)}`,
                        '',
                        `🏠 Origem: ${getVillageLink(attack.target)}`,
                        `📌 Coordenadas: ${getCoordLink(attack.target)}`
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
            footer: { text: 'Tribal Wars PT' },
            timestamp: new Date().toISOString()
        };
    }

    function getNobleTrainKey(attack) {
        const target = attack.origin.coords ? attack.origin.coords.text : attack.origin.name;
        const attacker = attack.attacker || 'Desconhecido';
        return target + '|' + attacker;
    }

    function numberIcon(index) {
        const icons = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        return icons[index] || `${index + 1}.`;
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
        if (commandId) return `noble_command_${commandId}`;

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

    function hasExplicitNonNobleCommandName(commandName) {
        const commandUnitName = getPrimaryCommandName(commandName).toLowerCase();
        return commandUnitName.includes('ram') ||
            commandUnitName.includes('ariete') ||
            commandUnitName.includes('catapult') ||
            commandUnitName.includes('catapulta') ||
            commandUnitName.includes('spy') ||
            commandUnitName.includes('scout') ||
            commandUnitName.includes('explorador') ||
            commandUnitName.includes('batedor');
    }

    function filterFalseNobleAttacks(attacks) {
        return (attacks || []).filter(attack => !hasExplicitNonNobleCommandName(attack.commandName));
    }

    function addNobleToTrain(attack, totalAttacks) {
        if (hasExplicitNonNobleCommandName(attack.commandName)) {
            console.log('[TW] Nobre ignorado porque o comando indica outra unidade:', attack.commandName);
            return;
        }

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

            const validAttacks = filterFalseNobleAttacks(train.attacks);

            if (!validAttacks.length) {
                removePendingNobleTrain(key);
                console.log('[TW] Comboio pendente removido por unidade nao nobre:', key);
                return;
            }

            if (nobleTrains.has(key)) return;

            nobleTrains.set(key, {
                attacks: validAttacks,
                totalAttacks: train.totalAttacks || validAttacks.length,
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

        train.attacks = filterFalseNobleAttacks(train.attacks);

        if (!train.attacks.length) {
            nobleTrains.delete(key);
            removePendingNobleTrain(key);
            console.log('[TW] Comboio de nobres removido por unidade nao nobre:', key);
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
            queueDiscordEmbed(buildAttackEmbed(train.attacks[0], train.totalAttacks), 'TribalWars Alerts', getNoblesWebhook());
        } else {
            queueDiscordEmbed(buildNobleTrainEmbed(train), 'TW Noble Train', getNoblesWebhook());
        }

        train.attacks.forEach(markNobleAlertSent);
        nobleTrains.delete(key);
        removePendingNobleTrain(key);
        console.log('[TW] Comboio de nobres enviado:', key);
    }

    function buildNobleTrainEmbed(train) {
        const first = train.attacks[0];
        const arrivals = train.attacks
            .map((attack, index) => [
                `${numberIcon(index)} **${formatArrivalText(attack.arrival)}**`,
                `⌛ Restante: **${attack.remaining}**`
            ].join('\n'))
            .join('\n\n');

        return {
            title: `👑 ━━━ ${train.attacks.length} NOBRE${train.attacks.length === 1 ? '' : 'S'} ━━━ 👑`,
            url: first.commandUrl || undefined,
            color: 16753920,
            fields: [
                {
                    name: '━━━━━━━━━━━━━━━━━━━━\n🛡️ Defensor',
                    value: [
                        `**${getDefenderValue()}**`,
                        `🏰 Tribo: ${formatTribe(first.defenderTribe)}`,
                        '',
                        `🏘️ Aldeia: ${getVillageLink(first.origin)}`,
                        `📍 Coordenadas: ${getCoordLink(first.origin)}`,
                        '',
                        `🛡️ Unidade: 👑 Nobre`,
                        `🕒 Chegadas:\n${arrivals}`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '━━━━━━━━━━━━━━━━━━━━\n⚔️ Atacante',
                    value: [
                        `**${getAttackerValue(first)}**`,
                        `🏰 Tribo: ${formatTribe(first.attackerTribe)}`,
                        '',
                        `🏠 Origem: ${getVillageLink(first.target)}`,
                        `📌 Coordenadas: ${getCoordLink(first.target)}`
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
            footer: { text: 'Tribal Wars PT' },
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
            if (!groups[key]) groups[key] = { total: 0, nobles: 0 };

            groups[key].total += 1;
            if (attack.isNoble) groups[key].nobles += 1;
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

        const settings = getSettings();
        if (!shouldSendBySchedule(
            SUMMARY_LAST_SENT_KEY,
            SUMMARY_DAILY_SENT_KEY,
            settings.summaryScheduleMode,
            getSummaryIntervalMs(),
            settings.summaryDailyTime,
            DEFAULT_SUMMARY_DAILY_TIME
        )) {
            return false;
        }

        localStorage.setItem(SUMMARY_STATE_KEY, getAttackSummaryState(attacks));
        return true;
    }

    async function enrichSummaryWithDefenderTribe(attacks) {
        if (!attacks.length) return;
        attacks[0].defenderTribe = await getPlayerTribe(getDefenderProfileUrl());
    }

    function buildAttackSummaryEmbed(attacks) {
        const groups = new Map();

        attacks.forEach(attack => {
            const key = getTargetKey(attack);
            if (!groups.has(key)) {
                groups.set(key, { target: attack.origin, total: 0, nobles: 0 });
            }

            const group = groups.get(key);
            group.total += 1;
            if (attack.isNoble) group.nobles += 1;
        });

        const sortedGroups = Array.from(groups.values()).sort((a, b) => {
            if (b.nobles !== a.nobles) return b.nobles - a.nobles;
            return b.total - a.total;
        });

        const totalNobles = attacks.filter(attack => attack.isNoble).length;
        const villageLines = sortedGroups.map(group => {
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
                    `**${getDefenderValue()}**`,
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
            footer: { text: 'Tribal Wars PT' },
            timestamp: new Date().toISOString()
        };
    }

    function shouldSendTroopSummary() {
        const settings = getSettings();
        const nowDate = new Date();
        const now = nowDate.getTime();

        if (now - SCRIPT_STARTED_AT < STARTUP_GRACE_MS) {
            const mode = normalizeScheduleMode(settings.troopsScheduleMode);

            if (mode === SCHEDULE_MODE_DAILY) {
                const time = normalizeDailyTime(settings.troopsDailyTime, DEFAULT_TROOPS_DAILY_TIME);
                const parts = time.split(':');
                const targetDate = new Date();
                targetDate.setHours(Number(parts[0]), Number(parts[1]), 0, 0);

                if (now >= targetDate.getTime()) {
                    localStorage.setItem(TROOPS_DAILY_SENT_KEY, getLocalDateKey(nowDate));
                    localStorage.setItem(TROOPS_LAST_SENT_KEY, String(now));
                }
            } else {
                const lastSent = Number(localStorage.getItem(TROOPS_LAST_SENT_KEY) || 0);
                if (!lastSent || now - lastSent >= getTroopsIntervalMs()) {
                    localStorage.setItem(TROOPS_LAST_SENT_KEY, String(now));
                }
            }

            return false;
        }

        return shouldSendBySchedule(
            TROOPS_LAST_SENT_KEY,
            TROOPS_DAILY_SENT_KEY,
            settings.troopsScheduleMode,
            getTroopsIntervalMs(),
            settings.troopsDailyTime,
            DEFAULT_TROOPS_DAILY_TIME
        );
    }

    function shouldSendNobleCounterSummary() {
        const settings = getSettings();
        const nowDate = new Date();
        const now = nowDate.getTime();

        if (now - SCRIPT_STARTED_AT < STARTUP_GRACE_MS) {
            const mode = normalizeScheduleMode(settings.nobleCounterScheduleMode);

            if (mode === SCHEDULE_MODE_DAILY) {
                const time = normalizeDailyTime(settings.nobleCounterDailyTime, DEFAULT_NOBLE_COUNTER_DAILY_TIME);
                const parts = time.split(':');
                const targetDate = new Date();
                targetDate.setHours(Number(parts[0]), Number(parts[1]), 0, 0);

                if (now >= targetDate.getTime()) {
                    localStorage.setItem(NOBLE_COUNTER_DAILY_SENT_KEY, getLocalDateKey(nowDate));
                    localStorage.setItem(NOBLE_COUNTER_LAST_SENT_KEY, String(now));
                }
            } else {
                const lastSent = Number(localStorage.getItem(NOBLE_COUNTER_LAST_SENT_KEY) || 0);
                if (!lastSent || now - lastSent >= getNobleCounterIntervalMs()) {
                    localStorage.setItem(NOBLE_COUNTER_LAST_SENT_KEY, String(now));
                }
            }

            return false;
        }

        return shouldSendBySchedule(
            NOBLE_COUNTER_LAST_SENT_KEY,
            NOBLE_COUNTER_DAILY_SENT_KEY,
            settings.nobleCounterScheduleMode,
            getNobleCounterIntervalMs(),
            settings.nobleCounterDailyTime,
            DEFAULT_NOBLE_COUNTER_DAILY_TIME
        );
    }

    function shouldSendAttackFullsSummary() {
        const settings = getSettings();
        const nowDate = new Date();
        const now = nowDate.getTime();

        if (now - SCRIPT_STARTED_AT < STARTUP_GRACE_MS) {
            const mode = normalizeScheduleMode(settings.attackFullsScheduleMode);

            if (mode === SCHEDULE_MODE_DAILY) {
                const time = normalizeDailyTime(settings.attackFullsDailyTime, DEFAULT_ATTACK_FULLS_DAILY_TIME);
                const parts = time.split(':');
                const targetDate = new Date();
                targetDate.setHours(Number(parts[0]), Number(parts[1]), 0, 0);

                if (now >= targetDate.getTime()) {
                    localStorage.setItem(ATTACK_FULLS_DAILY_SENT_KEY, getLocalDateKey(nowDate));
                    localStorage.setItem(ATTACK_FULLS_LAST_SENT_KEY, String(now));
                }
            } else {
                const lastSent = Number(localStorage.getItem(ATTACK_FULLS_LAST_SENT_KEY) || 0);
                if (!lastSent || now - lastSent >= getAttackFullsIntervalMs()) {
                    localStorage.setItem(ATTACK_FULLS_LAST_SENT_KEY, String(now));
                }
            }

            return false;
        }

        return shouldSendBySchedule(
            ATTACK_FULLS_LAST_SENT_KEY,
            ATTACK_FULLS_DAILY_SENT_KEY,
            settings.attackFullsScheduleMode,
            getAttackFullsIntervalMs(),
            settings.attackFullsDailyTime,
            DEFAULT_ATTACK_FULLS_DAILY_TIME
        );
    }

    function shouldUseCombinedCounters(settings = getSettings()) {
        return Boolean(
            settings.combineAttackFullsAndNobles &&
            settings.notifyAttackFulls &&
            settings.notifyNobleCounter
        );
    }

    function markNobleCounterScheduleSynced() {
        const settings = getSettings();
        const nowDate = new Date();
        const now = nowDate.getTime();

        localStorage.setItem(NOBLE_COUNTER_LAST_SENT_KEY, String(now));

        if (normalizeScheduleMode(settings.nobleCounterScheduleMode) === SCHEDULE_MODE_DAILY) {
            const time = normalizeDailyTime(settings.nobleCounterDailyTime, DEFAULT_NOBLE_COUNTER_DAILY_TIME);
            const parts = time.split(':');
            const targetDate = new Date();
            targetDate.setHours(Number(parts[0]), Number(parts[1]), 0, 0);

            if (now >= targetDate.getTime()) {
                localStorage.setItem(NOBLE_COUNTER_DAILY_SENT_KEY, getLocalDateKey(nowDate));
            }
        }
    }

    async function sendAutomaticCounterSummaries() {
        const settings = getSettings();

        if (shouldUseCombinedCounters(settings)) {
            if (shouldSendAttackFullsSummary()) {
                try {
                    const sent = await sendCombinedCountersSummary();

                    if (sent) {
                        markNobleCounterScheduleSynced();
                        console.log('[TW] Contador automatico combinado de fulls e nobres enviado.');
                    }
                } catch (error) {
                    console.warn('[TW] Erro ao enviar contador automatico combinado de fulls e nobres:', error);
                }
            }

            return;
        }

        if (settings.notifyAttackFulls && shouldSendAttackFullsSummary()) {
            try {
                await sendAttackFullsSummary();
                console.log('[TW] Contador automatico de fulls de ataque enviado.');
            } catch (error) {
                console.warn('[TW] Erro ao enviar contador automatico de fulls de ataque:', error);
            }
        }

        if (settings.notifyNobleCounter && shouldSendNobleCounterSummary()) {
            try {
                await sendNobleCounterSummary();
                console.log('[TW] Contador automatico de nobres enviado.');
            } catch (error) {
                console.warn('[TW] Erro ao enviar contador automatico de nobres:', error);
            }
        }
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
                const genericSignal =
                    detectGenericIncomingSignal(doc) ||
                    detectGenericIncomingSignal(document);

                maybeNotifyGenericIncoming(genericSignal);

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

                await sendAutomaticCounterSummaries();

                return;
            }

            localStorage.removeItem(GENERIC_INCOMING_STATE_KEY);

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

            await sendAutomaticCounterSummaries();
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
            pauseForVerification('Página Atual do Jogo');
            return;
        }

        if (!isMasterTab()) return;
        await checkIncomingAttacks();
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

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        return new DOMParser().parseFromString(html, 'text/html');
    }

    function getVillagesOverviewUrl(mode) {
        const url = new URL(window.location.href);
        url.searchParams.set('screen', 'overview_villages');
        url.searchParams.set('mode', mode);
        url.searchParams.set('page', '-1');
        url.searchParams.delete('action');
        url.searchParams.delete('ajax');
        url.searchParams.delete('h');
        return url.toString();
    }

    async function fetchVillagesOverviewDocument(mode) {
        const response = await fetch(getVillagesOverviewUrl(mode), {
            credentials: 'include',
            cache: 'no-store'
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        return new DOMParser().parseFromString(html, 'text/html');
    }

    function getAcademyUrl(villageId) {
        const url = new URL(window.location.href);
        url.searchParams.set('screen', 'snob');

        if (villageId) {
            url.searchParams.set('village', String(villageId));
        }

        url.searchParams.delete('action');
        url.searchParams.delete('ajax');
        url.searchParams.delete('h');

        return url.toString();
    }

    async function fetchAcademyDocument(villageId) {
        const response = await fetch(getAcademyUrl(villageId), {
            credentials: 'include',
            cache: 'no-store'
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

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
            axe: ['unit_axe', 'unit-axe', 'unit-item-axe', 'axe.png', 'barbaro', 'bárbaro', 'viking', 'vikings', 'machado', 'machados'],
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

            Array.from(row.children).forEach((cell, cellIndex) => {
                const unitKey = detectTroopUnitKey(cell);
                if (unitKey) {
                    columns.push({ index: columnIndex, cellIndex, key: unitKey });
                }

                columnIndex += Number(cell.getAttribute('colspan') || 1);
            });

            if (columns.length > bestColumns.length) bestColumns = columns;
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
        if (!/^\d[\d.\s]*$/.test(text)) return 0;

        return Number(text.replace(/[.\s]/g, '')) || 0;
    }

    function parseTroopCellNumber(value) {
        const raw = String(value || '').replace(/\u00a0/g, ' ').trim();
        if (!raw || raw === '-' || raw === '—' || raw === 'â€”') return 0;

        const lines = raw
            .split(/\r?\n/)
            .map(cleanText)
            .filter(Boolean);

        const parseNumber = text => Number(String(text || '').replace(/\./g, '')) || 0;
        const numericLines = lines.filter(line => /^\d[\d.]*$/.test(line));
        const sourceLines = numericLines.length ? numericLines : lines;
        const values = sourceLines
            .map(line => line.match(/\d[\d.]*/g) || [])
            .flat()
            .map(parseNumber)
            .filter(number => number > 0);

        return values.length ? Math.max(...values) : 0;
    }

    function parseSafeTroopCellNumber(value) {
        const raw = String(value || '').replace(/\u00a0/g, ' ').trim();

        if (!raw || raw === '-' || raw === '—' || raw === 'â€”' || raw === 'Ã¢â‚¬â€') {
            return 0;
        }

        if (parseCoords(raw)) {
            return 0;
        }

        const lines = raw
            .split(/\r?\n/)
            .map(cleanText)
            .filter(Boolean);

        const parseNumber = token => {
            const compact = String(token || '').replace(/\./g, '');

            if (!compact || compact.length > 8) return 0;

            const number = Number(compact) || 0;
            return number > TROOP_CELL_MAX_VALUE ? 0 : number;
        };
        const numericLines = lines.filter(line => /^\d[\d.]*$/.test(line));
        const sourceLines = numericLines.length ? numericLines : lines;
        const values = sourceLines
            .map(line => line.match(/\d{1,3}(?:\.\d{3})+|\d+/g) || [])
            .flat()
            .map(parseNumber)
            .filter(number => number > 0);

        return values.length ? Math.max(...values) : 0;
    }

    function parseTroopRowTotals(row, columns) {
        const rowTotals = createTroopTotals();
        const directUnitKeys = new Set();

        Array.from(row.children).forEach(cell => {
            const unitKey = detectTroopUnitKey(cell);
            if (!unitKey) return;

            const value = parseSafeTroopCellNumber(cell.innerText || cell.textContent || '');
            directUnitKeys.add(unitKey);

            if (value > 0) {
                rowTotals[unitKey] += value;
            }
        });

        columns.forEach(column => {
            if (directUnitKeys.has(column.key) && rowTotals[column.key] > 0) {
                return;
            }

            const cell = getCellAtColumn(row, column.index);
            let value = parseSafeTroopCellNumber(cell ? (cell.innerText || cell.textContent || '') : '');

            if (!value && typeof column.cellIndex === 'number') {
                const physicalCell = row.children[column.cellIndex];
                value = parseSafeTroopCellNumber(physicalCell ? (physicalCell.innerText || physicalCell.textContent || '') : '');
            }

            if (value > 0) {
                rowTotals[column.key] += value;
            }
        });

        return rowTotals;
    }

    function createTroopTotals() {
        const totals = {};

        Object.keys(TROOP_UNIT_LABELS).forEach(key => {
            totals[key] = 0;
        });

        return totals;
    }

    function detectOverviewColumnKey(cell) {
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
            wood: ['wood', 'resource_wood', 'madeira'],
            clay: ['stone', 'clay', 'resource_stone', 'resource_clay', 'argila', 'barro'],
            iron: ['iron', 'resource_iron', 'ferro'],
            farm: ['farm', 'pop', 'population', 'quinta', 'fazenda'],
            academy: ['academy', 'main_buildlink_academy', 'academia']
        };

        return Object.keys(aliases).find(key =>
            aliases[key].some(alias => haystack.includes(alias))
        ) || null;
    }

    function getOverviewColumns(table, allowedKeys) {
        let bestColumns = [];

        Array.from(table.querySelectorAll('tr')).forEach(row => {
            const columns = [];
            let columnIndex = 0;

            Array.from(row.children).forEach(cell => {
                const key = detectOverviewColumnKey(cell);

                if (key && (!allowedKeys || allowedKeys.includes(key))) {
                    columns.push({ index: columnIndex, key });
                }

                columnIndex += Number(cell.getAttribute('colspan') || 1);
            });

            if (columns.length > bestColumns.length) bestColumns = columns;
        });

        return bestColumns;
    }

    function parseResourceNumber(value) {
        const text = cleanText(value).replace(/[^\d.\s]/g, '');
        return Number(text.replace(/[.\s]/g, '')) || 0;
    }

    function getRowCoordsKey(row) {
        const coords = parseCoords(row ? row.innerText : '');
        return coords ? coords.text : '';
    }

    function parseBuildingLevel(value) {
        const text = cleanText(value);
        if (!text || text === '-' || text === '0') return 0;

        const match = text.match(/\d+/);
        return match ? Number(match[0]) : 0;
    }

    function getRowVillageId(row) {
        if (!row) return '';

        const idMatch = String(row.id || '').match(/\d+/);
        if (idMatch) return idMatch[0];

        const links = Array.from(row.querySelectorAll('a[href*="village="]'));

        for (const link of links) {
            try {
                const id = new URL(link.getAttribute('href'), window.location.origin).searchParams.get('village');
                if (id) return id;
            } catch (_) {}
        }

        return '';
    }

    function parseAcademyVillages(doc) {
        const tables = Array.from(doc.querySelectorAll('table.vis, table'));
        let bestTable = null;
        let academyColumn = null;

        tables.forEach(table => {
            const columns = getOverviewColumns(table, ['academy']);
            const column = columns.find(item => item.key === 'academy');

            if (column && !academyColumn) {
                bestTable = table;
                academyColumn = column;
            }
        });

        if (!bestTable || !academyColumn) return null;

        const villages = new Set();
        const rows = Array.from(bestTable.querySelectorAll('tbody tr, tr'))
            .filter(row => /\d{3}\|\d{3}/.test(cleanText(row.innerText)));

        rows.forEach(row => {
            const key = getRowCoordsKey(row);
            const cell = getCellAtColumn(row, academyColumn.index);

            if (key && parseBuildingLevel(cell ? cell.innerText : '') > 0) {
                villages.add(key);
            }
        });

        return villages;
    }

    function parseAcademyVillageIds(doc) {
        const tables = Array.from(doc.querySelectorAll('table.vis, table'));
        let bestTable = null;
        let academyColumn = null;

        tables.forEach(table => {
            const columns = getOverviewColumns(table, ['academy']);
            const column = columns.find(item => item.key === 'academy');

            if (column && !academyColumn) {
                bestTable = table;
                academyColumn = column;
            }
        });

        if (!bestTable || !academyColumn) return [];

        return Array.from(bestTable.querySelectorAll('tbody tr, tr'))
            .filter(row => /\d{3}\|\d{3}/.test(cleanText(row.innerText)))
            .filter(row => {
                const cell = getCellAtColumn(row, academyColumn.index);
                return parseBuildingLevel(cell ? cell.innerText : '') > 0;
            })
            .map(getRowVillageId)
            .filter(Boolean);
    }

    function normalizeSearchText(value) {
        return cleanText(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function parseAcademyNoblesAvailable(doc) {
        if (!doc || !doc.body) return null;

        const rows = Array.from(doc.querySelectorAll('tr'));

        for (const row of rows) {
            const cells = Array.from(row.children);
            if (cells.length < 2) continue;

            const label = normalizeSearchText(cells[0].innerText || '');

            if (
                label.includes('ainda podem ser produzidos') ||
                label.includes('ainda pode ser produzido')
            ) {
                const valueText = cleanText(cells[cells.length - 1].innerText || '');
                const valueMatch = valueText.match(/\d[\d.\s]*/);

                if (valueMatch) {
                    return parseResourceNumber(valueMatch[0]);
                }
            }
        }

        const text = normalizeSearchText(doc.body.innerText || '');
        const patterns = [
            /ainda\s+podem\s+ser\s+produzidos?\D+(\d[\d.\s]*)/i,
            /ainda\s+pode\s+ser\s+produzido\D+(\d[\d.\s]*)/i,
            /nobres?\s+que\s+ainda\s+podem\s+ser\s+feitos?\D+(\d[\d.\s]*)/i,
            /nobres?\s+que\s+podem\s+ser\s+feitos?\D+(\d[\d.\s]*)/i,
            /nobres?\s+que\s+ainda\s+podes?\s+fazer\D+(\d[\d.\s]*)/i,
            /nobres?\s+disponiveis?\D+(\d[\d.\s]*)/i,
            /ainda\s+podem\s+ser\s+feitos?\D+(\d[\d.\s]*)\s+nobres?/i
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return parseResourceNumber(match[1]);
        }

        return null;
    }

    function parseAcademyNobleCounts(doc) {
        if (!doc || !doc.body) {
            return {
                existingNobles: null,
                canMake: null
            };
        }

        const counts = {
            existingNobles: null,
            canMake: parseAcademyNoblesAvailable(doc)
        };

        const rows = Array.from(doc.querySelectorAll('tr'));

        for (const row of rows) {
            const cells = Array.from(row.children);
            if (cells.length < 2) continue;

            const label = normalizeSearchText(cells[0].innerText || '');
            const valueText = cleanText(cells[cells.length - 1].innerText || '');
            const valueMatch = valueText.match(/\d[\d.\s]*/);

            if (!valueMatch) continue;

            if (
                label.includes('nobres existentes') ||
                label.includes('nobre existente')
            ) {
                counts.existingNobles = parseResourceNumber(valueMatch[0]);
            }
        }

        const text = normalizeSearchText(doc.body.innerText || '');
        const existingPatterns = [
            /nobres?\s+existentes?\D+(\d[\d.\s]*)/i,
            /nobres?\s+atuais?\D+(\d[\d.\s]*)/i
        ];

        if (counts.existingNobles === null) {
            for (const pattern of existingPatterns) {
                const match = text.match(pattern);
                if (match) {
                    counts.existingNobles = parseResourceNumber(match[1]);
                    break;
                }
            }
        }

        return counts;
    }

    async function getAcademyNoblesAvailable() {
        try {
            const currentAcademyDoc = await fetchAcademyDocument();
            const currentCounts = parseAcademyNobleCounts(currentAcademyDoc);

            if (currentCounts.canMake !== null || currentCounts.existingNobles !== null) {
                return {
                    canMake: currentCounts.canMake,
                    existingNobles: currentCounts.existingNobles,
                    academyVillageCount: null,
                    source: 'Academia atual'
                };
            }
        } catch (error) {
            console.warn('[TW] Erro ao carregar academia atual:', error);
        }

        try {
            const buildingsDoc = await fetchVillagesOverviewDocument('buildings');
            const academyVillageIds = parseAcademyVillageIds(buildingsDoc);

            for (const villageId of academyVillageIds.slice(0, 5)) {
                try {
                    const academyDoc = await fetchAcademyDocument(villageId);
                    const counts = parseAcademyNobleCounts(academyDoc);

                    if (counts.canMake !== null || counts.existingNobles !== null) {
                        return {
                            canMake: counts.canMake,
                            existingNobles: counts.existingNobles,
                            academyVillageCount: academyVillageIds.length,
                            source: 'Academia'
                        };
                    }
                } catch (error) {
                    console.warn('[TW] Erro ao carregar academia da aldeia:', villageId, error);
                }
            }

            return {
                canMake: null,
                existingNobles: null,
                academyVillageCount: academyVillageIds.length,
                source: 'Academia'
            };
        } catch (error) {
            console.warn('[TW] Erro ao procurar academias:', error);
        }

        return {
            canMake: null,
            existingNobles: null,
            academyVillageCount: null,
            source: 'Academia'
        };
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

        if (!bestTable || !bestColumns.length) return null;

        const totals = createTroopTotals();

        const rows = Array.from(bestTable.querySelectorAll('tbody tr, tr'));

        const villageKeys = new Set();
        const villagesByKey = new Map();
        let currentVillageKey = '';

        rows.forEach(row => {
            const detectedVillageKey = getRowCoordsKey(row);
            const rowText = normalizeSearchText(row.innerText || '');

            if (detectedVillageKey) {
                currentVillageKey = detectedVillageKey;
            }

            if (!detectedVillageKey && /total|selecionar|seleccionar/.test(rowText)) {
                return;
            }

            const villageKey = detectedVillageKey || currentVillageKey;

            if (!villageKey) return;

            if (villageKey) {
                villageKeys.add(villageKey);

                if (!villagesByKey.has(villageKey)) {
                    villagesByKey.set(villageKey, {
                        key: villageKey,
                        totals: createTroopTotals()
                    });
                }
            }

            const village = villageKey ? villagesByKey.get(villageKey) : null;

            const rowTotals = parseTroopRowTotals(row, bestColumns);

            Object.keys(rowTotals).forEach(unitKey => {
                const value = Number(rowTotals[unitKey] || 0);
                if (!value) return;

                totals[unitKey] += value;

                if (village) {
                    village.totals[unitKey] += value;
                }
            });
        });

        const villages = Array.from(villagesByKey.values());

        return {
            totals,
            villages,
            attackFullCounter: calculateAttackFullCounter(villages),
            villageCount: villageKeys.size || rows.length
        };
    }

    function formatTroopNumber(value) {
        return Number(value || 0).toLocaleString('pt-PT');
    }

    function sumTroopUnits(totals, units) {
        return units.reduce((sum, unit) => sum + Number(totals[unit] || 0), 0);
    }

    function calculateAttackFullCounter(villages) {
        const counter = {
            completeFulls: 0,
            halfFulls: 0,
            smallFulls: 0,
            attackVillages: 0,
            completeVillages: 0,
            halfVillages: 0,
            smallVillages: 0
        };

        (villages || []).forEach(village => {
            const totals = village.totals || {};
            const vikings = Number(totals.axe || 0);
            const light = Number(totals.light || 0);

            if (!vikings && !light) return;

            counter.attackVillages += 1;

            if (vikings >= ATTACK_FULL_AXE && light >= ATTACK_FULL_LIGHT) {
                counter.completeFulls += 1;
                counter.completeVillages += 1;
                return;
            }

            if (vikings >= ATTACK_HALF_AXE && light >= ATTACK_HALF_LIGHT) {
                counter.halfFulls += 1;
                counter.halfVillages += 1;
                return;
            }

            counter.smallFulls += 1;
            counter.smallVillages += 1;
        });

        return counter;
    }

    function formatTroopLines(totals, units) {
        const lines = units
            .filter(unit => Number(totals[unit] || 0) > 0)
            .map(unit => `${TROOP_UNIT_LABELS[unit]}: **${formatTroopNumber(totals[unit])}**`);

        return lines.length ? lines.join('\n') : 'Sem tropas detectadas.';
    }

    function getTroopsSummaryMode() {
        return normalizeTroopsSummaryMode(getSettings().troopsSummaryMode);
    }

    function buildSimpleDefenseTroopSummaryEmbed(summary) {
        const totals = summary.totals || {};
        const defenseTotal = sumTroopUnits(summary.totals, TROOP_DEFENSE_UNITS);
        const lines = [
            `🔱 Lanceiros: **${formatTroopNumber(totals.spear)}**`,
            `🗡️ Espadachins: **${formatTroopNumber(totals.sword)}**`
        ];

        if (Number(totals.archer || 0) > 0) lines.push(`🏹 Arqueiros: **${formatTroopNumber(totals.archer)}**`);
        if (Number(totals.heavy || 0) > 0) lines.push(`🐴 Cavalaria Pesada: **${formatTroopNumber(totals.heavy)}**`);
        if (Number(totals.knight || 0) > 0) lines.push(`⚜️ Paladino: **${formatTroopNumber(totals.knight)}**`);
        if (Number(totals.militia || 0) > 0) lines.push(`🏘️ Milicia: **${formatTroopNumber(totals.militia)}**`);

        if (Number(totals.spy || 0) > 0) lines.push(`${TROOP_UNIT_LABELS.spy}: **${formatTroopNumber(totals.spy)}**`);

        return {
            title: '📦 ━━ TROPAS MÓVEIS ━━ 📦',
            color: 5763719,
            description: [
                '━━━━━━━━━━━━━━━━━━━━',
                '🛡️ **Jogador**',
                `**${getDefenderValue()}**`,
                `Tribo: ${formatTribe(summary.defenderTribe)}`,
                '',
                '🛡️ **Defesa**',
                `Total: **${formatTroopNumber(defenseTotal)}**`,
                '',
                lines.join('\n')
            ].join('\n'),
            footer: { text: 'Tribal Wars PT' },
            timestamp: new Date().toISOString()
        };
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
            footer: { text: 'Tribal Wars PT' },
            timestamp: new Date().toISOString()
        };
    }

    async function buildAttackFullsSummary() {
        const troopsDoc = await fetchTroopsOverviewDocument();
        const troopsSummary = parseTroopsOverview(troopsDoc);

        if (!troopsSummary || !troopsSummary.villageCount) {
            return null;
        }

        troopsSummary.defenderTribe = await getPlayerTribe(getDefenderProfileUrl());

        return troopsSummary;
    }

    function buildAttackFullsEmbed(summary) {
        const counter = summary.attackFullCounter || calculateAttackFullCounter(summary.villages);

        return {
            title: '⚔️ ━━ CONTADOR DE FULLS DE ATAQUE ━━ ⚔️',
            color: 15158332,
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
                    name: '\u200B',
                    value: [
                        `🏆 **FULLS:** **${formatTroopNumber(counter.completeFulls)}**`,
                        `⚔️ **MEIOS FULLS:** **${formatTroopNumber(counter.halfFulls)}**`,
                        `🔸 **PEQUENOS FULLS:** **${formatTroopNumber(counter.smallFulls)}**`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '📏 Patamares dos Fulls',
                    value: [
                        `Full: **${formatTroopNumber(ATTACK_FULL_AXE)}+ Vikings + ${formatTroopNumber(ATTACK_FULL_LIGHT)}+ Cavalaria Leve**`,
                        `Meio Full: **${formatTroopNumber(ATTACK_HALF_AXE)}+ Vikings + ${formatTroopNumber(ATTACK_HALF_LIGHT)}+ Cavalaria Leve**`,
                        `Pequeno Full: abaixo de **${formatTroopNumber(ATTACK_HALF_AXE)} Vikings + ${formatTroopNumber(ATTACK_HALF_LIGHT)} Cavalaria Leve**`
                    ].join('\n'),
                    inline: false
                }
            ],
            footer: { text: 'Tribal Wars PT' },
            timestamp: new Date().toISOString()
        };
    }

    async function buildNobleCounterSummary() {
        const troopsDoc = await fetchTroopsOverviewDocument();
        const troopsSummary = parseTroopsOverview(troopsDoc);

        if (!troopsSummary || !troopsSummary.villageCount) {
            return null;
        }

        const academyAvailability = await getAcademyNoblesAvailable();
        const troopNobles = Number(troopsSummary.totals.snob || 0);

        return {
            currentNobles: academyAvailability.existingNobles !== null
                ? Math.max(Number(academyAvailability.existingNobles || 0), troopNobles)
                : troopNobles,
            villageCount: getPlayerVillageCount() || troopsSummary.villageCount,
            defenderTribe: await getPlayerTribe(getDefenderProfileUrl()),
            canMake: academyAvailability.canMake,
            academyVillageCount: academyAvailability.academyVillageCount,
            academySource: academyAvailability.source
        };
    }

    function buildNobleCounterEmbed(summary) {
        const canMakeText = summary.canMake === null
            ? 'N/A'
            : formatTroopNumber(summary.canMake);

        return {
            title: '👑 ━━ CONTADOR DE NOBRES ━━ 👑',
            color: 16753920,
            fields: [
                {
                    name: '━━━━━━━━━━━━━━━━━━━━\n🛡️ Jogador',
                    value: [
                        `**${getDefenderValue()}**`,
                        `Tribo: ${formatTribe(summary.defenderTribe)}`,
                        `Aldeias do jogador: **${formatTroopNumber(summary.villageCount)}**`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '👑 Nobres',
                    value: [
                        `Nobres atuais: **${formatTroopNumber(summary.currentNobles)}**`,
                        `Nobres que ainda podem ser feitos: **${canMakeText}**`
                    ].join('\n'),
                    inline: false
                }
            ],
            footer: { text: 'Tribal Wars PT' },
            timestamp: new Date().toISOString()
        };
    }

    async function buildCombinedCountersSummary() {
        const troopsDoc = await fetchTroopsOverviewDocument();
        const troopsSummary = parseTroopsOverview(troopsDoc);

        if (!troopsSummary || !troopsSummary.villageCount) {
            return null;
        }

        const [defenderTribe, academyAvailability] = await Promise.all([
            getPlayerTribe(getDefenderProfileUrl()),
            getAcademyNoblesAvailable()
        ]);

        troopsSummary.defenderTribe = defenderTribe;
        const troopNobles = Number(troopsSummary.totals.snob || 0);

        return {
            attackFulls: troopsSummary,
            nobleCounter: {
                currentNobles: academyAvailability.existingNobles !== null
                    ? Math.max(Number(academyAvailability.existingNobles || 0), troopNobles)
                    : troopNobles,
                villageCount: getPlayerVillageCount() || troopsSummary.villageCount,
                defenderTribe,
                canMake: academyAvailability.canMake,
                academyVillageCount: academyAvailability.academyVillageCount,
                academySource: academyAvailability.source
            }
        };
    }

    function buildCombinedCountersEmbed(summary) {
        const attackFulls = summary.attackFulls || {};
        const nobleCounter = summary.nobleCounter || {};
        const counter = attackFulls.attackFullCounter || calculateAttackFullCounter(attackFulls.villages);
        const canMakeText = nobleCounter.canMake === null
            ? 'N/A'
            : formatTroopNumber(nobleCounter.canMake);

        return {
            title: '📊 ━━ CONTADOR DE FULLS E NOBRES ━━ 📊',
            color: 16753920,
            fields: [
                {
                    name: '━━━━━━━━━━━━━━━━━━━━\n🛡️ Jogador',
                    value: [
                        `**${getDefenderValue()}**`,
                        `Tribo: ${formatTribe(nobleCounter.defenderTribe || attackFulls.defenderTribe)}`,
                        `Aldeias do jogador: **${formatTroopNumber(nobleCounter.villageCount || attackFulls.villageCount)}**`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '⚔️ Fulls de Ataque',
                    value: [
                        `🏆 **FULLS:** **${formatTroopNumber(counter.completeFulls)}**`,
                        `⚔️ **MEIOS FULLS:** **${formatTroopNumber(counter.halfFulls)}**`,
                        `🔸 **PEQUENOS FULLS:** **${formatTroopNumber(counter.smallFulls)}**`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '👑 Nobres',
                    value: [
                        `Nobres atuais: **${formatTroopNumber(nobleCounter.currentNobles)}**`,
                        `Nobres que ainda podem ser feitos: **${canMakeText}**`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '📏 Patamares dos Fulls',
                    value: [
                        `Full: **${formatTroopNumber(ATTACK_FULL_AXE)}+ Vikings + ${formatTroopNumber(ATTACK_FULL_LIGHT)}+ Cavalaria Leve**`,
                        `Meio Full: **${formatTroopNumber(ATTACK_HALF_AXE)}+ Vikings + ${formatTroopNumber(ATTACK_HALF_LIGHT)}+ Cavalaria Leve**`,
                        `Pequeno Full: abaixo de **${formatTroopNumber(ATTACK_HALF_AXE)} Vikings + ${formatTroopNumber(ATTACK_HALF_LIGHT)} Cavalaria Leve**`
                    ].join('\n'),
                    inline: false
                }
            ],
            footer: { text: 'Tribal Wars PT' },
            timestamp: new Date().toISOString()
        };
    }

    async function sendNobleCounterSummary() {
        const summary = await buildNobleCounterSummary();

        if (!summary) {
            console.log('[TW] Sem dados para contador de nobres.');
            return false;
        }

        queueDiscordEmbed(
            buildNobleCounterEmbed(summary),
            'TW Noble Counter',
            getNobleCounterWebhook()
        );

        console.log('[TW] Contador de nobres enviado.');
        return true;
    }

    async function sendCombinedCountersSummary() {
        const summary = await buildCombinedCountersSummary();

        if (!summary) {
            console.log('[TW] Sem dados para contador combinado de fulls e nobres.');
            return false;
        }

        queueDiscordEmbed(
            buildCombinedCountersEmbed(summary),
            'TW Counters',
            getCombinedCountersWebhook()
        );

        console.log('[TW] Contador combinado de fulls e nobres enviado.');
        return true;
    }

    async function sendAttackFullsSummary() {
        const summary = await buildAttackFullsSummary();

        if (!summary) {
            console.log('[TW] Sem dados para contador de fulls de ataque.');
            return false;
        }

        queueDiscordEmbed(
            buildAttackFullsEmbed(summary),
            'TW Attack Fulls',
            getAttackFullsWebhook()
        );

        console.log('[TW] Contador de fulls de ataque enviado.');
        return true;
    }

    async function sendTroopSummary() {
        const doc = await fetchTroopsOverviewDocument();
        const summary = parseTroopsOverview(doc);

        if (!summary || !summary.villageCount) {
            console.log('[TW] Sem tropas para enviar.');
            return false;
        }

        const simpleMode = getTroopsSummaryMode() === TROOPS_SUMMARY_MODE_SIMPLE_DEFENSE;
        summary.defenderTribe = await getPlayerTribe(getDefenderProfileUrl());

        const embed = simpleMode
            ? buildSimpleDefenseTroopSummaryEmbed(summary)
            : buildTroopSummaryEmbed(summary);

        queueDiscordEmbed(
            embed,
            simpleMode ? 'Tribos Defesa Bot' : 'TW Troop Summary',
            getTroopsWebhook()
        );

        console.log('[TW] Resumo total de tropas enviado.');
        return true;
    }

    async function sendAttackSummaryTest() {
        await loadWorldUnitSpeed();

        const doc = await fetchIncomingAttacksDocument();
        const rows = Array.from(doc.querySelectorAll('#incomings_table tbody tr'));
        const attacks = rows.map(parseAttackRow).filter(Boolean);

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
        let uiDoc = document;

        try {
            if (window.top && window.top.document) {
                uiDoc = window.top.document;
            }
        } catch (_) {}

        if (uiDoc.getElementById('tw-discord-alerts-ui')) return;

        const settings = getSettings();
        const style = uiDoc.createElement('style');
        style.textContent = `
#tw-discord-alerts-ui {
    position: fixed !important;
    top: 250px !important;
    right: auto !important;
    left: 16px !important;
    z-index: 2147483647 !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 5px !important;
    font-family: Verdana, Arial, sans-serif !important;
    color: #3b1607 !important;
}

#tw-discord-alerts-toggle {
    position: relative !important;
    z-index: 4 !important;
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
    font-size: 12px !important;
    font-weight: bold !important;
    text-shadow: 1px 1px 1px #000 !important;
    white-space: nowrap !important;
    padding: 0 6px !important;
    transition: width .18s ease, min-width .18s ease, padding .18s ease, gap .18s ease, background .18s ease !important;
}

#tw-discord-alerts-toggle:hover,
#tw-discord-alerts-toggle:focus-visible {
    width: 286px !important;
    min-width: 286px !important;
    gap: 8px !important;
    padding: 0 9px !important;
    background: linear-gradient(to bottom, #c4473e, #a02c27 55%, #7e1c17) !important;
}

#tw-discord-alerts-backdrop {
    display: none !important;
    position: fixed !important;
    inset: 0 !important;
    z-index: 1 !important;
    background: rgba(0,0,0,.58) !important;
}

#tw-discord-alerts-backdrop.tw-open {
    display: block !important;
}

.tw-alerts-eye {
    width: 16px !important;
    height: 16px !important;
    flex: 0 0 16px !important;
    border-radius: 50% !important;
    background: radial-gradient(circle at center, #f6f2e8 0 24%, #111 26% 52%, #d6a35a 55% 100%) !important;
    box-shadow: inset 0 1px 1px rgba(255,255,255,.35), 0 1px 1px #000 !important;
}

.tw-alerts-toggle-label {
    display: inline-block !important;
    max-width: 0 !important;
    opacity: 0 !important;
    overflow: hidden !important;
    transform: translateX(-4px) !important;
    white-space: nowrap !important;
    transition: max-width .18s ease, opacity .14s ease, transform .18s ease !important;
}

#tw-discord-alerts-toggle:hover .tw-alerts-toggle-label,
#tw-discord-alerts-toggle:focus-visible .tw-alerts-toggle-label {
    max-width: 242px !important;
    opacity: 1 !important;
    transform: translateX(0) !important;
}

#tw-discord-alerts-panel {
    display: none !important;
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    z-index: 3 !important;
    transform: translate(-50%, -50%) !important;
    width: 840px !important;
    max-width: calc(100vw - 28px) !important;
    max-height: calc(100vh - 104px) !important;
    overflow-y: auto !important;
    margin: 0 !important;
    padding: 15px 14px 14px !important;
    background: #f3dfaa !important;
    border: 1px solid #4c2a12 !important;
    border-radius: 3px !important;
    box-shadow: 0 0 0 2px #d8c79b, 0 0 0 4px #735027, 0 0 0 6px #cfc7aa, 0 0 0 8px #3d3428, 0 8px 26px rgba(0,0,0,.62) !important;
}

#tw-discord-alerts-panel.tw-open {
    display: block !important;
}

#tw-discord-alerts-panel::before {
    content: "" !important;
    position: absolute !important;
    inset: 7px !important;
    pointer-events: none !important;
    border: 2px solid #a7221e !important;
    border-radius: 2px !important;
    box-shadow: inset 0 0 0 1px rgba(255,245,205,.75) !important;
}

#tw-alerts-close {
    position: absolute !important;
    top: -13px !important;
    right: -13px !important;
    z-index: 3 !important;
    width: 20px !important;
    height: 20px !important;
    line-height: 18px !important;
    padding: 0 !important;
    cursor: pointer !important;
    border: 2px solid #4c2a12 !important;
    border-radius: 2px !important;
    background: #f6d28b !important;
    color: #1b0d07 !important;
    font-size: 18px !important;
    font-weight: bold !important;
    text-align: center !important;
    box-shadow: 0 1px 3px rgba(0,0,0,.5) !important;
}

.tw-alerts-frame {
    position: relative !important;
    z-index: 1 !important;
    border: 1px solid #c99545 !important;
    background: rgba(255,239,188,.38) !important;
}

.tw-alerts-header {
    margin: 0 !important;
    padding: 12px 14px 10px !important;
    background: linear-gradient(to bottom, #f8e8b8, #efd38c) !important;
    border-bottom: 1px solid #c8913e !important;
}

.tw-alerts-header h3 {
    margin: 0 !important;
    color: #9d1714 !important;
    font-size: 16px !important;
    font-weight: bold !important;
}

.tw-alerts-header span {
    display: block !important;
    margin-top: 3px !important;
    color: #5a250d !important;
    font-size: 11px !important;
}

.tw-alerts-body {
    padding: 0 !important;
}

.tw-alerts-section {
    display: grid !important;
    grid-template-columns: 240px minmax(0, 1fr) !important;
    gap: 12px !important;
    margin: 0 !important;
    padding: 11px 12px !important;
    background: transparent !important;
    border: 0 !important;
    border-bottom: 1px solid #caa45e !important;
    border-left: 4px solid #9b6a2f !important;
}

.tw-alerts-section:last-child {
    border-bottom: 0 !important;
}

.tw-alerts-attacks { border-left-color: #c72d2d !important; }
.tw-alerts-summary { border-left-color: #1f9ac5 !important; }
.tw-alerts-security { border-left-color: #e0a51d !important; }
.tw-alerts-system { border-left-color: #7b4fc2 !important; }
.tw-alerts-actions-section { border-left-color: #8a6424 !important; }

.tw-alerts-section-title {
    margin: 0 0 4px !important;
    color: #9d1714 !important;
    font-size: 14px !important;
    font-weight: bold !important;
    text-transform: uppercase !important;
}

.tw-alerts-section-desc {
    margin: 0 !important;
    color: #4f210b !important;
    font-size: 11px !important;
    line-height: 1.3 !important;
}

.tw-alerts-section-options {
    min-width: 0 !important;
}

.tw-alerts-subblock {
    display: grid !important;
    grid-template-columns: minmax(190px, .8fr) minmax(0, 1.2fr) !important;
    gap: 12px !important;
    align-items: start !important;
    padding: 8px 0 !important;
}

.tw-alerts-subblock:first-child {
    padding-top: 0 !important;
}

.tw-alerts-subblock:last-child {
    padding-bottom: 0 !important;
}

.tw-alerts-subblock + .tw-alerts-subblock {
    border-top: 1px solid rgba(158,112,45,.45) !important;
}

.tw-alerts-subblock-main,
.tw-alerts-subblock-fields,
.tw-alerts-field {
    min-width: 0 !important;
}

.tw-alerts-subblock-fields {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 8px !important;
}

.tw-alerts-subblock-fields.schedule-fields {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
}

.tw-alerts-subblock-fields.troops-schedule-fields {
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
}

.tw-alerts-subblock-fields.two-fields {
    grid-template-columns: minmax(0, 1.4fr) minmax(150px, .8fr) !important;
}

.tw-alerts-webhook-field {
    grid-column: 1 / -1 !important;
}

.tw-alerts-check-top {
    display: flex !important;
    align-items: center !important;
    gap: 7px !important;
    margin-bottom: 5px !important;
    color: #111 !important;
    font-size: 12px !important;
    font-weight: bold !important;
}

.tw-alerts-check-top input {
    width: 14px !important;
    height: 14px !important;
    margin: 0 !important;
    accent-color: #d9152f !important;
}

.tw-alerts-mini-desc {
    margin-left: 21px !important;
    color: #4f210b !important;
    font-size: 11px !important;
    line-height: 1.28 !important;
}

.tw-alerts-field label {
    display: flex !important;
    justify-content: space-between !important;
    gap: 8px !important;
    margin-bottom: 3px !important;
    color: #111 !important;
    font-size: 11px !important;
    font-weight: bold !important;
}

.tw-alerts-hint {
    color: #6f4a1e !important;
    font-size: 10px !important;
    font-weight: normal !important;
}

#tw-discord-alerts-panel input[type="text"],
#tw-discord-alerts-panel input[type="time"],
#tw-discord-alerts-panel select {
    width: 100% !important;
    height: 29px !important;
    box-sizing: border-box !important;
    padding: 5px 7px !important;
    background: #fff6d7 !important;
    border: 1px solid #b57d2e !important;
    border-radius: 2px !important;
    color: #241006 !important;
    font-size: 11px !important;
    box-shadow: inset 0 1px 2px rgba(0,0,0,.12) !important;
}

#tw-discord-alerts-panel input[type="text"]:focus,
#tw-discord-alerts-panel input[type="time"]:focus,
#tw-discord-alerts-panel select:focus {
    outline: 2px solid rgba(167,34,30,.25) !important;
    border-color: #a7221e !important;
}

.tw-alerts-actions {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
}

.tw-alerts-button,
.tw-alerts-actions button {
    min-height: 32px !important;
    cursor: pointer !important;
    border: 1px solid #681511 !important;
    border-radius: 3px !important;
    background: linear-gradient(to bottom, #b13a34, #922722 55%, #731914) !important;
    color: #fff !important;
    font-size: 11px !important;
    font-weight: bold !important;
    text-shadow: 1px 1px 1px #000 !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.25), inset 0 -1px 0 rgba(0,0,0,.3) !important;
}

.tw-alerts-button:hover,
.tw-alerts-actions button:hover {
    background: linear-gradient(to bottom, #c4473e, #a02c27 55%, #7e1c17) !important;
}

.tw-alerts-button-wide {
    width: 100% !important;
    margin-top: 8px !important;
}

.tw-alerts-button-secondary,
#tw-alerts-reset {
    background: linear-gradient(to bottom, #9b342f, #7e211d 55%, #5d1411) !important;
    border-color: #53100d !important;
}

#tw-alerts-status {
    min-height: 17px !important;
    margin-top: 9px !important;
    color: #5a250d !important;
    font-size: 11px !important;
}

/* Design compacto igual ao painel Defesa ThePlaguePT */
#tw-discord-alerts-panel {
    width: 850px !important;
    max-width: calc(100vw - 48px) !important;
    max-height: calc(100vh - 76px) !important;
    box-sizing: border-box !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    padding: 14px !important;
    background: linear-gradient(to bottom, #d8cbb0 0%, #b5a07a 100%) !important;
    border: 1px solid #2c2419 !important;
    border-radius: 5px !important;
    box-shadow:
        0 0 0 1px #efe3c3,
        0 0 0 2px #7f6d52,
        0 0 0 3px #d0c3a8,
        0 0 0 5px #5f513f,
        0 0 0 6px #b7ac98,
        0 0 0 8px #30291f,
        0 6px 18px rgba(0,0,0,.68) !important;
}

#tw-discord-alerts-panel *,
#tw-discord-alerts-panel *::before,
#tw-discord-alerts-panel *::after {
    box-sizing: border-box !important;
}

#tw-discord-alerts-panel::before {
    inset: 5px !important;
    border: 1px solid #f2e5c7 !important;
    border-radius: 4px !important;
    box-shadow:
        inset 0 0 0 1px #5f4d35,
        inset 0 0 0 2px #c9b895,
        inset 0 0 0 3px #8a7555 !important;
}

#tw-alerts-close {
    top: -12px !important;
    right: -12px !important;
    width: 19px !important;
    height: 19px !important;
    line-height: 15px !important;
    border: 2px solid #3b160f !important;
    border-radius: 3px !important;
    background: #f4e4b8 !important;
    color: #170704 !important;
    font-family: Arial, Verdana, sans-serif !important;
    font-size: 19px !important;
    box-shadow:
        inset 0 0 0 1px rgba(255,255,255,.55),
        0 1px 2px rgba(0,0,0,.6) !important;
}

.tw-alerts-frame {
    width: 100% !important;
    border: 1px solid #7e211c !important;
    border-radius: 4px !important;
    background: #f4e4b8 !important;
    color: #3b2508 !important;
    font-family: Arial, Verdana, sans-serif !important;
    overflow: hidden !important;
    box-shadow:
        0 0 0 1px #f8edc9,
        inset 0 0 0 1px rgba(255,250,224,.8) !important;
}

.tw-alerts-header {
    padding: 12px 14px 9px !important;
    border-bottom: 1px solid #c98c48 !important;
    background: linear-gradient(to bottom, #f7e8c1 0%, #edd49a 100%) !important;
}

.tw-alerts-header h3 {
    color: #8f2b25 !important;
    font-size: 16px !important;
    line-height: 20px !important;
}

.tw-alerts-header span {
    margin-top: 2px !important;
    color: #5e3b16 !important;
    font-size: 12px !important;
    line-height: 15px !important;
}

.tw-alerts-body {
    padding: 10px 12px 14px !important;
}

.tw-alerts-section {
    grid-template-columns: minmax(190px, 230px) minmax(0, 1fr) !important;
    gap: 10px 18px !important;
    padding: 11px 0 12px 10px !important;
    border-top: 1px solid #d5b579 !important;
    border-bottom: 0 !important;
    border-left-width: 4px !important;
}

.tw-alerts-section:first-child {
    border-top: 0 !important;
}

.tw-alerts-section-copy,
.tw-alerts-section-options {
    min-width: 0 !important;
}

.tw-alerts-section-title {
    color: #8f2b25 !important;
    font-size: 13px !important;
    line-height: 16px !important;
}

.tw-alerts-section-desc {
    margin-top: 3px !important;
    color: #5e3b16 !important;
    font-size: 11px !important;
    line-height: 14px !important;
}

.tw-alerts-section-options {
    display: grid !important;
    gap: 9px !important;
}

.tw-alerts-subblock {
    grid-template-columns: minmax(190px, .78fr) minmax(0, 1fr) !important;
    gap: 8px 14px !important;
    padding: 0 !important;
}

.tw-alerts-subblock + .tw-alerts-subblock {
    padding-top: 9px !important;
    border-top: 1px solid #d5b579 !important;
}

.tw-alerts-check-top {
    display: grid !important;
    grid-template-columns: 20px minmax(0, 1fr) !important;
    gap: 2px 6px !important;
    align-items: start !important;
    margin: 0 !important;
    color: #2b1b08 !important;
    font-size: 12px !important;
    line-height: 15px !important;
}

.tw-alerts-check-top input {
    margin-top: 1px !important;
}

.tw-alerts-mini-desc {
    margin: 2px 0 0 26px !important;
    color: #6f4b16 !important;
    font-size: 11px !important;
    line-height: 14px !important;
}

.tw-alerts-subblock-fields {
    gap: 7px !important;
    align-content: start !important;
}

.tw-alerts-subblock-fields.schedule-fields {
    grid-template-columns: minmax(0, 1.2fr) minmax(96px, .7fr) minmax(86px, .55fr) !important;
}

.tw-alerts-subblock-fields.troops-schedule-fields {
    grid-template-columns: minmax(0, 1.15fr) minmax(86px, .65fr) minmax(96px, .72fr) minmax(78px, .5fr) !important;
}

.tw-alerts-subblock-fields.two-fields {
    grid-template-columns: minmax(0, 1fr) minmax(140px, .7fr) !important;
}

.tw-alerts-field label {
    margin-bottom: 3px !important;
    color: #2b1b08 !important;
    font-size: 11px !important;
    line-height: 14px !important;
}

#tw-discord-alerts-panel input[type="text"],
#tw-discord-alerts-panel input[type="time"],
#tw-discord-alerts-panel select {
    min-width: 0 !important;
    height: 28px !important;
    padding: 4px 6px !important;
    background: #fff4c9 !important;
    border: 1px solid #b06b25 !important;
    border-radius: 2px !important;
    color: #2b1b08 !important;
    font-size: 11px !important;
    box-shadow: inset 1px 1px 2px rgba(60,35,8,.14) !important;
}

.tw-alerts-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
}

.tw-alerts-button,
.tw-alerts-actions button {
    min-height: 31px !important;
    border: 1px solid #5a1d18 !important;
    border-radius: 3px !important;
    background: linear-gradient(to bottom, #a73a33 0%, #842821 100%) !important;
    color: #fff7dd !important;
    font-size: 11px !important;
    font-weight: bold !important;
    text-shadow: 1px 1px 1px #2b0e0b !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.22) !important;
}

.tw-alerts-button:hover,
.tw-alerts-actions button:hover {
    background: linear-gradient(to bottom, #b8483f 0%, #932e27 100%) !important;
}

.tw-alerts-button-secondary,
#tw-alerts-reset {
    background: linear-gradient(to bottom, #70402b 0%, #512c20 100%) !important;
}

@media (max-width: 760px) {
    #tw-discord-alerts-panel {
        width: calc(100vw - 28px) !important;
        max-height: calc(100vh - 76px) !important;
    }

    .tw-alerts-section,
    .tw-alerts-subblock {
        grid-template-columns: 1fr !important;
    }

    .tw-alerts-subblock-fields.schedule-fields,
    .tw-alerts-subblock-fields.troops-schedule-fields,
    .tw-alerts-subblock-fields.two-fields {
        grid-template-columns: 1fr !important;
    }
}

/* v1.0.1 - reset final da janela para ficar como o modal Defesa ThePlaguePT */
#tw-discord-alerts-panel {
    width: 850px !important;
    max-width: calc(100vw - 42px) !important;
    max-height: calc(100vh - 72px) !important;
    padding: 8px !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    background: #9f9174 !important;
    border: 1px solid #2a2118 !important;
    border-radius: 4px !important;
    box-shadow:
        0 0 0 1px #efe3c5,
        0 0 0 3px #5c5141,
        0 0 0 4px #b9ad94,
        0 3px 12px rgba(0,0,0,.55) !important;
}

#tw-discord-alerts-panel::before {
    content: none !important;
}

#tw-alerts-close {
    top: -12px !important;
    right: -12px !important;
    width: 19px !important;
    height: 19px !important;
    line-height: 15px !important;
    padding: 0 !important;
    background: #f3dfaa !important;
    border: 2px solid #2a2118 !important;
    border-radius: 3px !important;
    color: #110705 !important;
    font-size: 18px !important;
    font-weight: bold !important;
    box-shadow: inset 0 0 0 1px #fff0c8, 0 1px 2px rgba(0,0,0,.55) !important;
}

.tw-alerts-frame {
    width: 820px !important;
    max-width: calc(100vw - 48px) !important;
    border: 2px solid #7e211c !important;
    border-radius: 4px !important;
    background: #f4e4b8 !important;
    color: #3b2508 !important;
    font-family: Arial, Verdana, sans-serif !important;
    box-sizing: border-box !important;
    box-shadow: none !important;
    overflow: hidden !important;
}

.tw-alerts-frame *,
.tw-alerts-frame *::before,
.tw-alerts-frame *::after {
    box-sizing: border-box !important;
}

.tw-alerts-header {
    padding: 12px 14px 9px !important;
    background: linear-gradient(to bottom, #f7e8c1 0%, #edd49a 100%) !important;
    border-bottom: 1px solid #c98c48 !important;
}

.tw-alerts-body {
    padding: 10px 12px 14px !important;
    background: #f4e4b8 !important;
}

.tw-alerts-section {
    display: grid !important;
    grid-template-columns: 230px minmax(0, 1fr) !important;
    gap: 10px 18px !important;
    padding: 11px 0 12px 10px !important;
    border-top: 1px solid #d5b579 !important;
    border-bottom: 0 !important;
    border-left-width: 4px !important;
}

.tw-alerts-section:first-child {
    border-top: 0 !important;
}

.tw-alerts-subblock {
    grid-template-columns: minmax(205px, .82fr) minmax(0, 1fr) !important;
    gap: 8px 14px !important;
    padding: 0 !important;
}

.tw-alerts-subblock + .tw-alerts-subblock {
    padding-top: 9px !important;
    border-top: 1px solid #d5b579 !important;
}

.tw-alerts-subblock-fields.schedule-fields {
    grid-template-columns: minmax(0, 1fr) 96px 84px !important;
}

.tw-alerts-subblock-fields.troops-schedule-fields {
    grid-template-columns: minmax(0, 1fr) 86px 96px 78px !important;
}

.tw-alerts-subblock-fields.two-fields {
    grid-template-columns: minmax(0, 1fr) 140px !important;
}

.tw-alerts-webhook-field {
    grid-column: 1 / -1 !important;
}

.tw-alerts-field label {
    display: block !important;
    margin-bottom: 3px !important;
}

#tw-discord-alerts-panel input[type="text"],
#tw-discord-alerts-panel input[type="time"],
#tw-discord-alerts-panel select,
.tw-alerts-frame input[type="text"],
.tw-alerts-frame input[type="time"],
.tw-alerts-frame select {
    width: 100% !important;
    min-width: 0 !important;
    height: 28px !important;
    padding: 4px 6px !important;
    background: #fff4c9 !important;
    border: 1px solid #b06b25 !important;
    border-radius: 2px !important;
    color: #2b1b08 !important;
    font-size: 11px !important;
    box-shadow: inset 1px 1px 2px rgba(60,35,8,.14) !important;
}

.tw-alerts-frame input[type="text"]:focus,
.tw-alerts-frame input[type="time"]:focus,
.tw-alerts-frame select:focus {
    outline: 2px solid rgba(167,34,30,.25) !important;
    border-color: #a7221e !important;
}

/* v1.0.7 - largura util, campos de mencao multiplos e botoes compactos */
#popup_box_twDiscordAlertsSettings,
#popup_box_twDiscordAlertsSettings .popup_box_content {
    width: auto !important;
    max-width: calc(100vw - 24px) !important;
}

#popup_box_twDiscordAlertsSettings .popup_box_content {
    overflow-x: hidden !important;
}

.tw-alerts-frame {
    width: 1280px !important;
    max-width: calc(100vw - 36px) !important;
}

.tw-alerts-body {
    padding: 9px 14px 12px !important;
}

.tw-alerts-section {
    grid-template-columns: 255px minmax(0, 1fr) !important;
    gap: 8px 22px !important;
    padding: 10px 0 10px 10px !important;
}

.tw-alerts-subblock {
    grid-template-columns: 245px minmax(0, 1fr) !important;
    gap: 7px 18px !important;
}

.tw-alerts-section-options {
    gap: 8px !important;
}

.tw-alerts-subblock-fields {
    gap: 6px 10px !important;
    width: 100% !important;
}

.tw-alerts-subblock-fields.schedule-fields {
    grid-template-columns: minmax(0, 1fr) minmax(170px, .42fr) minmax(110px, .28fr) !important;
}

.tw-alerts-subblock-fields.troops-schedule-fields {
    grid-template-columns: minmax(190px, 1.15fr) minmax(155px, .95fr) minmax(170px, .95fr) minmax(110px, .65fr) !important;
}

.tw-alerts-subblock-fields.two-fields {
    grid-template-columns: minmax(0, 1fr) 190px !important;
}

.tw-alerts-subblock-fields.verification-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
}

.tw-alerts-slot-group {
    min-width: 0 !important;
}

.tw-alerts-slot-title {
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    margin-bottom: 3px !important;
    color: #2b1b08 !important;
    font-size: 11px !important;
    line-height: 14px !important;
    font-weight: bold !important;
    white-space: nowrap !important;
}

.tw-alerts-slot-title .tw-alerts-hint {
    margin-left: auto !important;
}

.tw-alerts-slot-row {
    display: grid !important;
    grid-template-columns: 16px minmax(0, 1fr) !important;
    gap: 6px !important;
    align-items: center !important;
    margin-top: 3px !important;
}

.tw-alerts-slot-row input[type="checkbox"] {
    width: 13px !important;
    height: 13px !important;
    margin: 0 !important;
}

.tw-alerts-slot-row input[type="text"] {
    height: 24px !important;
}

.tw-alerts-field label {
    white-space: nowrap !important;
}

.tw-alerts-inline-check {
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
}

.tw-alerts-inline-check input[type="checkbox"] {
    width: 13px !important;
    height: 13px !important;
    margin: 0 !important;
}

.tw-alerts-inline-check .tw-alerts-hint {
    margin-left: auto !important;
}

.tw-alerts-field input[type="time"] {
    font-family: Consolas, "Courier New", monospace !important;
}

.tw-alerts-system .tw-alerts-check-top {
    display: block !important;
}

.tw-alerts-system .tw-alerts-mini-desc {
    margin-left: 0 !important;
}

.tw-alerts-actions {
    gap: 5px 8px !important;
}

.tw-alerts-button-wide {
    margin-top: 5px !important;
}

.tw-alerts-button,
.tw-alerts-actions button {
    min-height: 24px !important;
    padding: 2px 8px !important;
    font-size: 11px !important;
}

@media (max-width: 760px) {
    #tw-discord-alerts-panel {
        width: calc(100vw - 28px) !important;
        max-width: calc(100vw - 28px) !important;
        max-height: calc(100vh - 64px) !important;
    }

    .tw-alerts-section,
    .tw-alerts-subblock,
    .tw-alerts-subblock-fields.schedule-fields,
    .tw-alerts-subblock-fields.troops-schedule-fields,
    .tw-alerts-subblock-fields.two-fields,
    .tw-alerts-subblock-fields.verification-fields {
        grid-template-columns: 1fr !important;
    }
}

/* v1.0.9 - organizacao final do painel */
#popup_box_twDiscordAlertsSettings .popup_box_content {
    padding: 8px !important;
}

.tw-alerts-frame {
    width: 1260px !important;
    max-width: calc(100vw - 28px) !important;
}

.tw-alerts-body {
    padding: 8px 14px 10px !important;
}

.tw-alerts-section {
    grid-template-columns: 270px minmax(0, 1fr) !important;
    gap: 8px 18px !important;
    padding: 9px 0 9px 10px !important;
    align-items: start !important;
}

.tw-alerts-section-copy {
    padding-top: 2px !important;
}

.tw-alerts-section-title {
    margin-bottom: 5px !important;
    line-height: 16px !important;
}

.tw-alerts-section-desc {
    max-width: 240px !important;
    line-height: 14px !important;
}

.tw-alerts-section-options {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 7px !important;
    min-width: 0 !important;
}

.tw-alerts-subblock {
    grid-template-columns: 255px minmax(0, 1fr) !important;
    gap: 6px 16px !important;
    align-items: start !important;
}

.tw-alerts-subblock + .tw-alerts-subblock {
    padding-top: 8px !important;
}

.tw-alerts-check-top {
    margin-bottom: 3px !important;
    line-height: 15px !important;
}

.tw-alerts-mini-desc {
    line-height: 13px !important;
}

.tw-alerts-field {
    margin-bottom: 0 !important;
}

.tw-alerts-field label,
.tw-alerts-slot-title {
    height: 15px !important;
    line-height: 15px !important;
}

.tw-alerts-subblock-fields {
    gap: 5px 10px !important;
}

.tw-alerts-subblock-fields.schedule-fields {
    grid-template-columns: minmax(0, 1fr) minmax(160px, .38fr) 110px !important;
}

.tw-alerts-subblock-fields.troops-schedule-fields {
    grid-template-columns: minmax(190px, 1fr) minmax(150px, .75fr) minmax(160px, .8fr) 110px !important;
}

.tw-alerts-subblock-fields.verification-fields {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
    gap: 6px 14px !important;
}

.tw-alerts-combine-counters-field {
    grid-column: 1 / -1 !important;
    min-height: 22px !important;
    margin-top: -2px !important;
    font-weight: bold !important;
}

.tw-alerts-slot-row {
    grid-template-columns: 16px minmax(0, 1fr) !important;
    gap: 6px !important;
    margin-top: 3px !important;
}

.tw-alerts-slot-row input[type="text"] {
    height: 23px !important;
}

.tw-alerts-frame input[type="text"],
.tw-alerts-frame input[type="time"],
.tw-alerts-frame select {
    height: 27px !important;
}

.tw-alerts-actions-section .tw-alerts-section-options {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 6px 10px !important;
}

.tw-alerts-actions-section .tw-alerts-actions {
    display: contents !important;
}

.tw-alerts-actions-section .tw-alerts-button {
    width: 100% !important;
    min-height: 25px !important;
    margin-top: 0 !important;
}

.tw-alerts-actions-section #tw-alerts-reset,
.tw-alerts-actions-section #tw-alerts-status {
    grid-column: 1 / -1 !important;
}

@media (max-width: 960px) {
    .tw-alerts-section,
    .tw-alerts-subblock,
    .tw-alerts-subblock-fields.schedule-fields,
    .tw-alerts-subblock-fields.troops-schedule-fields,
    .tw-alerts-subblock-fields.verification-fields,
    .tw-alerts-actions-section .tw-alerts-section-options {
        grid-template-columns: 1fr !important;
    }

    .tw-alerts-section-desc {
        max-width: none !important;
    }
}

/* v1.0.15 - toolbar por grupos com reset abaixo do guardar */
.tw-alerts-actions-section .tw-alerts-section-options {
    display: grid !important;
    grid-template-columns: minmax(120px, .8fr) 58px minmax(120px, .9fr) minmax(120px, .9fr) 58px minmax(140px, 1fr) minmax(120px, .9fr) !important;
    gap: 6px 7px !important;
    align-items: center !important;
}

.tw-alerts-actions-section .tw-alerts-actions {
    display: contents !important;
}

.tw-alerts-actions-section .tw-alerts-button {
    min-height: 24px !important;
    height: 24px !important;
    padding: 1px 8px !important;
    margin: 0 !important;
    font-size: 11px !important;
    line-height: 14px !important;
}

.tw-alerts-actions-section #tw-alerts-save {
    grid-column: 1 !important;
    grid-row: 1 !important;
}

.tw-alerts-actions-section #tw-alerts-save::before {
    content: "" !important;
}

.tw-alerts-actions-section .tw-alerts-actions::before {
    content: "Testar:" !important;
    grid-column: 2 !important;
    grid-row: 1 !important;
    align-self: center !important;
    justify-self: end !important;
    color: #5f3315 !important;
    font-size: 11px !important;
    font-weight: bold !important;
}

.tw-alerts-actions-section #tw-alerts-test {
    grid-column: 3 !important;
    grid-row: 1 !important;
}

.tw-alerts-actions-section #tw-alerts-test-verification {
    grid-column: 4 !important;
    grid-row: 1 !important;
}

.tw-alerts-actions-section .tw-alerts-section-options::before {
    content: "Enviar:" !important;
    grid-column: 5 !important;
    grid-row: 1 !important;
    align-self: center !important;
    justify-self: end !important;
    color: #5f3315 !important;
    font-size: 11px !important;
    font-weight: bold !important;
}

.tw-alerts-actions-section #tw-alerts-test-summary {
    grid-column: 6 !important;
    grid-row: 1 !important;
}

.tw-alerts-actions-section #tw-alerts-troops {
    grid-column: 7 !important;
    grid-row: 1 !important;
}

.tw-alerts-actions-section #tw-alerts-attack-fulls-send {
    grid-column: 6 !important;
    grid-row: 2 !important;
}

.tw-alerts-actions-section #tw-alerts-noble-counter-send {
    grid-column: 7 !important;
    grid-row: 2 !important;
}

.tw-alerts-actions-section #tw-alerts-reset {
    grid-column: 1 !important;
    grid-row: 2 !important;
    justify-self: stretch !important;
    min-height: 24px !important;
    height: 24px !important;
    opacity: .92 !important;
}

.tw-alerts-actions-section #tw-alerts-status {
    grid-column: 1 / -1 !important;
    grid-row: 3 !important;
    margin-top: 0 !important;
}

@media (max-width: 960px) {
    .tw-alerts-actions-section .tw-alerts-section-options {
        grid-template-columns: 1fr !important;
    }

    .tw-alerts-actions-section #tw-alerts-save,
    .tw-alerts-actions-section #tw-alerts-test,
    .tw-alerts-actions-section #tw-alerts-test-verification,
    .tw-alerts-actions-section #tw-alerts-test-summary,
    .tw-alerts-actions-section #tw-alerts-troops,
    .tw-alerts-actions-section #tw-alerts-attack-fulls-send,
    .tw-alerts-actions-section #tw-alerts-noble-counter-send,
    .tw-alerts-actions-section #tw-alerts-reset,
    .tw-alerts-actions-section #tw-alerts-status {
        grid-column: 1 !important;
        grid-row: auto !important;
    }
}
`;

        (uiDoc.head || uiDoc.documentElement).appendChild(style);

        const verificationUserSlots = normalizeVerificationSlots(
            settings,
            'verificationUserSlots',
            'verificationMention',
            'verificationMentionEnabled'
        );
        const verificationCouncilSlots = normalizeVerificationSlots(
            settings,
            'verificationCouncilSlots',
            'verificationCouncilTag',
            'verificationCouncilTagEnabled'
        );

        function buildVerificationSlotRows(type, slots, placeholder) {
            return slots.map((slot, index) => `
                                <label class="tw-alerts-slot-row" data-tw-verification-slot="${type}">
                                    <input type="checkbox" ${slot.enabled ? 'checked' : ''}>
                                    <input type="text" value="${escapeHtml(slot.value || '')}" placeholder="${escapeHtml(placeholder)} ${index + 1}">
                                </label>
            `).join('');
        }

        const root = uiDoc.createElement('div');
        root.id = 'tw-discord-alerts-ui';
        root.innerHTML = `
<button id="tw-discord-alerts-toggle" type="button" title="TW PT - Alertas Discord ThePlaguePT" aria-label="TW PT - Alertas Discord ThePlaguePT">
    <span class="tw-alerts-eye"></span>
    <span class="tw-alerts-toggle-label">TW PT - Alertas Discord ThePlaguePT</span>
</button>

<div id="tw-discord-alerts-backdrop"></div>

<div id="tw-discord-alerts-panel">
    <button id="tw-alerts-close" type="button" title="Fechar">×</button>
    <div class="tw-alerts-frame" data-tw-alerts-settings="template">
        <div class="tw-alerts-header">
            <h3>TW PT - Alertas Discord ThePlaguePT</h3>
            <span>Alertas, resumos e segurança para Tribal Wars!</span>
        </div>

        <div class="tw-alerts-body">
            <div class="tw-alerts-section tw-alerts-attacks">
                <div class="tw-alerts-section-copy">
                    <div class="tw-alerts-section-title">⚔️ Ataques em Tempo Real</div>
                    <div class="tw-alerts-section-desc">Notificações imediatas quando aparecem ataques novos.</div>
                </div>

                <div class="tw-alerts-section-options">
                    <div class="tw-alerts-subblock">
                        <div class="tw-alerts-subblock-main">
                            <label class="tw-alerts-check-top">
                                <input id="tw-alerts-normal" type="checkbox" ${settings.notifyNormalAttacks ? 'checked' : ''}>
                                <span>Notificar ataques normais</span>
                            </label>
                            <div class="tw-alerts-mini-desc">Alertas imediatos para ataques sem nobre.</div>
                        </div>
                        <div class="tw-alerts-subblock-fields">
                            <div class="tw-alerts-field tw-alerts-webhook-field">
                                <label>Webhook - Ataques</label>
                                <input id="tw-alerts-webhook" type="text" value="${escapeHtml(settings.webhook || '')}">
                            </div>
                        </div>
                    </div>

                    <div class="tw-alerts-subblock">
                        <div class="tw-alerts-subblock-main">
                            <label class="tw-alerts-check-top">
                                <input id="tw-alerts-nobles" type="checkbox" ${settings.notifyNobleAttacks ? 'checked' : ''}>
                                <span>Notificar nobres e comboios</span>
                            </label>
                            <div class="tw-alerts-mini-desc">Agrupa nobres detetados na mesma aldeia.</div>
                        </div>
                        <div class="tw-alerts-subblock-fields">
                            <div class="tw-alerts-field tw-alerts-webhook-field">
                                <label>Webhook - Nobres</label>
                                <input id="tw-alerts-nobles-webhook" type="text" value="${escapeHtml(settings.noblesWebhook || '')}">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="tw-alerts-section tw-alerts-summary">
                <div class="tw-alerts-section-copy">
                    <div class="tw-alerts-section-title">📊 Resumos Automáticos</div>
                    <div class="tw-alerts-section-desc">Relatórios periódicos de ataques a chegar e tropas móveis.</div>
                </div>

                <div class="tw-alerts-section-options">
                    <div class="tw-alerts-subblock">
                        <div class="tw-alerts-subblock-main">
                            <label class="tw-alerts-check-top">
                                <input id="tw-alerts-summary" type="checkbox" ${settings.notifyAttackSummary ? 'checked' : ''}>
                                <span>Resumo de ataques a chegar</span>
                            </label>
                            <div class="tw-alerts-mini-desc">Relatório periódico das aldeias sob ataque.</div>
                        </div>
                        <div class="tw-alerts-subblock-fields schedule-fields">
                            <div class="tw-alerts-field tw-alerts-webhook-field">
                                <label>Webhook</label>
                                <input id="tw-alerts-summary-webhook" type="text" value="${escapeHtml(settings.summaryWebhook || '')}">
                            </div>
                            <div class="tw-alerts-field">
                                <label>Modo</label>
                                <select id="tw-alerts-summary-schedule-mode">
                                    <option value="interval" ${settings.summaryScheduleMode !== 'daily' ? 'selected' : ''}>Intervalo</option>
                                    <option value="daily" ${settings.summaryScheduleMode === 'daily' ? 'selected' : ''}>Hora fixa</option>
                                </select>
                            </div>
                            <div class="tw-alerts-field">
                                <label>Intervalo</label>
                                <select id="tw-alerts-summary-interval">
                                    <option value="8" ${Number(settings.summaryIntervalHours) === 8 ? 'selected' : ''}>De 8 em 8 horas</option>
                                    <option value="16" ${Number(settings.summaryIntervalHours) === 16 ? 'selected' : ''}>De 16 em 16 horas</option>
                                    <option value="24" ${Number(settings.summaryIntervalHours) === 24 ? 'selected' : ''}>De 24 em 24 horas</option>
                                </select>
                            </div>
                            <div class="tw-alerts-field">
                                <label>Hora</label>
                                <input id="tw-alerts-summary-daily-time" type="time" value="${escapeHtml(settings.summaryDailyTime || DEFAULT_SUMMARY_DAILY_TIME)}">
                            </div>
                        </div>
                    </div>

                    <div class="tw-alerts-subblock">
                        <div class="tw-alerts-subblock-main">
                            <label class="tw-alerts-check-top">
                                <input id="tw-alerts-defense-troops" type="checkbox" ${settings.notifyDefenseTroops ? 'checked' : ''}>
                                <span>Resumo de tropas móveis</span>
                            </label>
                            <div class="tw-alerts-mini-desc">Envia totais de tropas móveis por categoria.</div>
                        </div>
                        <div class="tw-alerts-subblock-fields schedule-fields troops-schedule-fields">
                            <div class="tw-alerts-field tw-alerts-webhook-field">
                                <label>Webhook</label>
                                <input id="tw-alerts-troops-webhook" type="text" value="${escapeHtml(settings.troopsWebhook || '')}">
                            </div>
                            <div class="tw-alerts-field">
                                <label>Tipo</label>
                                <select id="tw-alerts-troops-mode">
                                    <option value="complete" ${settings.troopsSummaryMode !== 'simple_defense' ? 'selected' : ''}>Completo</option>
                                    <option value="simple_defense" ${settings.troopsSummaryMode === 'simple_defense' ? 'selected' : ''}>Simples - Defesa</option>
                                </select>
                            </div>
                            <div class="tw-alerts-field">
                                <label>Modo</label>
                                <select id="tw-alerts-troops-schedule-mode">
                                    <option value="interval" ${settings.troopsScheduleMode !== 'daily' ? 'selected' : ''}>Intervalo</option>
                                    <option value="daily" ${settings.troopsScheduleMode === 'daily' ? 'selected' : ''}>Hora fixa</option>
                                </select>
                            </div>
                            <div class="tw-alerts-field">
                                <label>Intervalo</label>
                                <select id="tw-alerts-troops-interval">
                                    <option value="8" ${Number(settings.troopsIntervalHours) === 8 ? 'selected' : ''}>De 8 em 8 horas</option>
                                    <option value="16" ${Number(settings.troopsIntervalHours) === 16 ? 'selected' : ''}>De 16 em 16 horas</option>
                                    <option value="24" ${Number(settings.troopsIntervalHours) === 24 ? 'selected' : ''}>De 24 em 24 horas</option>
                                </select>
                            </div>
                            <div class="tw-alerts-field">
                                <label>Hora</label>
                                <input id="tw-alerts-troops-daily-time" type="time" value="${escapeHtml(settings.troopsDailyTime || DEFAULT_TROOPS_DAILY_TIME)}">
                            </div>
                        </div>
                    </div>

                    <div class="tw-alerts-subblock">
                        <div class="tw-alerts-subblock-main">
                            <label class="tw-alerts-check-top">
                                <input id="tw-alerts-attack-fulls" type="checkbox" ${settings.notifyAttackFulls ? 'checked' : ''}>
                                <span>Contador de fulls de ataque</span>
                            </label>
                            <div class="tw-alerts-mini-desc">Envia Fulls, Meios Fulls e Pequenos Fulls por patamar.</div>
                        </div>
                        <div class="tw-alerts-subblock-fields schedule-fields">
                            <div class="tw-alerts-field tw-alerts-webhook-field">
                                <label>Webhook</label>
                                <input id="tw-alerts-attack-fulls-webhook" type="text" value="${escapeHtml(settings.attackFullsWebhook || '')}">
                            </div>
                            <div class="tw-alerts-field">
                                <label>Modo</label>
                                <select id="tw-alerts-attack-fulls-schedule-mode">
                                    <option value="interval" ${settings.attackFullsScheduleMode !== 'daily' ? 'selected' : ''}>Intervalo</option>
                                    <option value="daily" ${settings.attackFullsScheduleMode === 'daily' ? 'selected' : ''}>Hora fixa</option>
                                </select>
                            </div>
                            <div class="tw-alerts-field">
                                <label>Intervalo</label>
                                <select id="tw-alerts-attack-fulls-interval">
                                    <option value="8" ${Number(settings.attackFullsIntervalHours) === 8 ? 'selected' : ''}>De 8 em 8 horas</option>
                                    <option value="16" ${Number(settings.attackFullsIntervalHours) === 16 ? 'selected' : ''}>De 16 em 16 horas</option>
                                    <option value="24" ${Number(settings.attackFullsIntervalHours) === 24 ? 'selected' : ''}>De 24 em 24 horas</option>
                                </select>
                            </div>
                            <div class="tw-alerts-field">
                                <label>Hora</label>
                                <input id="tw-alerts-attack-fulls-daily-time" type="time" value="${escapeHtml(settings.attackFullsDailyTime || DEFAULT_ATTACK_FULLS_DAILY_TIME)}">
                            </div>
                            <label class="tw-alerts-check tw-alerts-combine-counters-field">
                                <input id="tw-alerts-combine-counters" type="checkbox" ${settings.combineAttackFullsAndNobles ? 'checked' : ''}>
                                <span>Juntar Fulls + Nobres</span>
                            </label>
                        </div>
                    </div>

                    <div class="tw-alerts-subblock">
                        <div class="tw-alerts-subblock-main">
                            <label class="tw-alerts-check-top">
                                <input id="tw-alerts-noble-counter" type="checkbox" ${settings.notifyNobleCounter ? 'checked' : ''}>
                                <span>Contador de nobres</span>
                            </label>
                            <div class="tw-alerts-mini-desc">Envia nobres existentes e o valor indicado na Academia.</div>
                        </div>
                        <div class="tw-alerts-subblock-fields schedule-fields">
                            <div class="tw-alerts-field tw-alerts-webhook-field">
                                <label>Webhook</label>
                                <input id="tw-alerts-noble-counter-webhook" type="text" value="${escapeHtml(settings.nobleCounterWebhook || '')}">
                            </div>
                            <div class="tw-alerts-field">
                                <label>Modo</label>
                                <select id="tw-alerts-noble-counter-schedule-mode">
                                    <option value="interval" ${settings.nobleCounterScheduleMode !== 'daily' ? 'selected' : ''}>Intervalo</option>
                                    <option value="daily" ${settings.nobleCounterScheduleMode === 'daily' ? 'selected' : ''}>Hora fixa</option>
                                </select>
                            </div>
                            <div class="tw-alerts-field">
                                <label>Intervalo</label>
                                <select id="tw-alerts-noble-counter-interval">
                                    <option value="8" ${Number(settings.nobleCounterIntervalHours) === 8 ? 'selected' : ''}>De 8 em 8 horas</option>
                                    <option value="16" ${Number(settings.nobleCounterIntervalHours) === 16 ? 'selected' : ''}>De 16 em 16 horas</option>
                                    <option value="24" ${Number(settings.nobleCounterIntervalHours) === 24 ? 'selected' : ''}>De 24 em 24 horas</option>
                                </select>
                            </div>
                            <div class="tw-alerts-field">
                                <label>Hora</label>
                                <input id="tw-alerts-noble-counter-daily-time" type="time" value="${escapeHtml(settings.nobleCounterDailyTime || DEFAULT_NOBLE_COUNTER_DAILY_TIME)}">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="tw-alerts-section tw-alerts-security">
                <div class="tw-alerts-section-copy">
                    <div class="tw-alerts-section-title">⚠️ Captcha / Segurança</div>
                    <div class="tw-alerts-section-desc">Aviso quando o jogo pedir verificação manual.</div>
                </div>

                <div class="tw-alerts-section-options">
                    <div class="tw-alerts-subblock">
                        <div class="tw-alerts-subblock-main">
                            <label class="tw-alerts-check-top">
                                <input id="tw-alerts-verification" type="checkbox" ${settings.notifyVerificationAlerts ? 'checked' : ''}>
                                <span>Notificar verificação/captcha</span>
                            </label>
                            <div class="tw-alerts-mini-desc">Pausa o script e avisa no Discord.</div>
                        </div>
                        <div class="tw-alerts-subblock-fields verification-fields">
                            <div class="tw-alerts-field tw-alerts-webhook-field">
                                <label>Webhook</label>
                                <input id="tw-alerts-verification-webhook" type="text" value="${escapeHtml(settings.verificationWebhook || '')}">
                            </div>
                            <div class="tw-alerts-slot-group">
                                <div class="tw-alerts-slot-title">
                                    <span>IDs de Utilizador</span>
                                    <span class="tw-alerts-hint">@ID</span>
                                </div>
${buildVerificationSlotRows('user', verificationUserSlots, 'ID utilizador')}
                            </div>
                            <div class="tw-alerts-slot-group">
                                <div class="tw-alerts-slot-title">
                                    <span>ID de Cargo no Discord</span>
                                    <span class="tw-alerts-hint">@ID</span>
                                </div>
${buildVerificationSlotRows('council', verificationCouncilSlots, 'ID cargo')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="tw-alerts-section tw-alerts-system">
                <div class="tw-alerts-section-copy">
                    <div class="tw-alerts-section-title">🕒 Verificação do Script</div>
                    <div class="tw-alerts-section-desc">Define a frequência com que o script procura novidades.</div>
                </div>

                <div class="tw-alerts-section-options">
                    <div class="tw-alerts-subblock">
                        <div class="tw-alerts-subblock-main">
                            <div class="tw-alerts-check-top">
                                <span>Frequência de Procura</span>
                            </div>
                            <div class="tw-alerts-mini-desc">Controla quando o script procura novos dados.</div>
                        </div>
                        <div class="tw-alerts-subblock-fields">
                            <div class="tw-alerts-field">
                                <label>Modo de verificação</label>
                                <select id="tw-alerts-interval">
                                    <option value="test" ${String(settings.checkInterval) === 'test' || Number(settings.checkInterval) === 2000 ? 'selected' : ''}>Teste - 2 segundos</option>
                                    <option value="normal" ${String(settings.checkInterval) === 'normal' || Number(settings.checkInterval) === 10000 ? 'selected' : ''}>Normal - aleatório 1 a 5 minutos</option>
                                    <option value="safe" ${String(settings.checkInterval) === 'safe' || Number(settings.checkInterval) === 30000 ? 'selected' : ''}>Seguro - aleatório 5 a 15 minutos</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="tw-alerts-section tw-alerts-actions-section">
                <div class="tw-alerts-section-copy">
                    <div class="tw-alerts-section-title">🧪 Ações</div>
                    <div class="tw-alerts-section-desc">Guardar, testar e enviar relatórios manualmente.</div>
                </div>

                <div class="tw-alerts-section-options">
                    <div class="tw-alerts-actions">
                        <button id="tw-alerts-save" class="tw-alerts-button" type="button">Guardar</button>
                        <button id="tw-alerts-test" class="tw-alerts-button" type="button">Teste Simples</button>
                    </div>
                    <button id="tw-alerts-test-summary" class="tw-alerts-button tw-alerts-button-wide" type="button">Enviar Ataques a Chegar</button>
                    <button id="tw-alerts-troops" class="tw-alerts-button tw-alerts-button-wide" type="button">Enviar Tropas Móveis</button>
                    <button id="tw-alerts-attack-fulls-send" class="tw-alerts-button tw-alerts-button-wide" type="button">Enviar Fulls Ataque</button>
                    <button id="tw-alerts-noble-counter-send" class="tw-alerts-button tw-alerts-button-wide" type="button">Enviar Nobres</button>
                    <button id="tw-alerts-test-verification" class="tw-alerts-button tw-alerts-button-wide" type="button">Teste Captcha</button>
                    <button id="tw-alerts-reset" class="tw-alerts-button tw-alerts-button-wide tw-alerts-button-secondary" type="button">Reset Configurações</button>
                    <div id="tw-alerts-status"></div>
                </div>
            </div>
        </div>
    </div>
</div>
`;

        (uiDoc.body || uiDoc.documentElement).appendChild(root);

        const uiWindow = uiDoc.defaultView || window;
        const launcherWidth = 30;
        const launcherGap = 25;

        function positionLauncher() {
            const gameLayout =
                uiDoc.querySelector('#main_layout td.maincell') ||
                uiDoc.querySelector('td.maincell') ||
                uiDoc.querySelector('#contentContainer') ||
                uiDoc.querySelector('#content_value');

            if (gameLayout) {
                const layoutRect = gameLayout.getBoundingClientRect();

                if (layoutRect.width > 0) {
                    const left = Math.max(
                        4,
                        Math.round(layoutRect.left - launcherWidth - launcherGap)
                    );

                    root.style.setProperty('left', `${left}px`, 'important');
                }
            }
        }

        let launcherPositionFrame = 0;

        function scheduleLauncherPosition() {
            uiWindow.cancelAnimationFrame(launcherPositionFrame);
            launcherPositionFrame = uiWindow.requestAnimationFrame(positionLauncher);
        }

        positionLauncher();
        uiWindow.addEventListener('resize', scheduleLauncherPosition);
        uiWindow.addEventListener('orientationchange', scheduleLauncherPosition);

        if (typeof uiWindow.ResizeObserver === 'function') {
            const launcherResizeObserver = new uiWindow.ResizeObserver(scheduleLauncherPosition);
            const observedLayout =
                uiDoc.querySelector('#main_layout td.maincell') ||
                uiDoc.querySelector('td.maincell') ||
                uiDoc.querySelector('#contentContainer') ||
                uiDoc.querySelector('#content_value');
            if (observedLayout) launcherResizeObserver.observe(observedLayout);
        }

        uiWindow.setTimeout(positionLauncher, 250);
        uiWindow.setTimeout(positionLauncher, 1000);

        const panel = root.querySelector('#tw-discord-alerts-panel');
        const backdrop = root.querySelector('#tw-discord-alerts-backdrop');

        function setPanelOpen(open) {
            panel.classList.toggle('tw-open', open);
            backdrop.classList.toggle('tw-open', open);
        }

        function getNativeDialog() {
            const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            return pageWindow.Dialog || window.Dialog || null;
        }

        function closeNativeDialog() {
            const dialog = getNativeDialog();
            if (dialog && typeof dialog.close === 'function') {
                dialog.close('twDiscordAlertsSettings');
            }
        }

        function openSettingsPanel() {
            const dialog = getNativeDialog();
            const frame = panel.querySelector('.tw-alerts-frame');

            if (dialog && typeof dialog.show === 'function' && frame) {
                const html = frame.outerHTML.replace(
                    'data-tw-alerts-settings="template"',
                    'data-tw-alerts-settings="dialog"'
                );

                dialog.show('twDiscordAlertsSettings', html);

                const frames = uiDoc.querySelectorAll('[data-tw-alerts-settings="dialog"]');
                const dialogFrame = frames[frames.length - 1];

                if (dialogFrame) {
                    bindSettingsForm(dialogFrame);
                }

                return;
            }

            setPanelOpen(true);
        }

        root.querySelector('#tw-discord-alerts-toggle').addEventListener('click', () => {
            openSettingsPanel();
        });

        root.querySelector('#tw-alerts-close').addEventListener('click', () => {
            setPanelOpen(false);
        });

        backdrop.addEventListener('click', () => {
            setPanelOpen(false);
        });

        uiDoc.addEventListener('keydown', event => {
            if (event.key === 'Escape' && panel.classList.contains('tw-open')) {
                setPanelOpen(false);
            }
        });

        function readVerificationSlots(container, type) {
            return Array.from(container.querySelectorAll(`[data-tw-verification-slot="${type}"]`))
                .map(row => ({
                    enabled: Boolean(row.querySelector('input[type="checkbox"]')?.checked),
                    value: (row.querySelector('input[type="text"]')?.value || '').trim()
                }));
        }

        function applyVerificationSlots(container, type, slots) {
            Array.from(container.querySelectorAll(`[data-tw-verification-slot="${type}"]`))
                .forEach((row, index) => {
                    const slot = slots[index] || { enabled: false, value: '' };
                    const checkbox = row.querySelector('input[type="checkbox"]');
                    const input = row.querySelector('input[type="text"]');

                    if (checkbox) checkbox.checked = Boolean(slot.enabled);
                    if (input) input.value = slot.value || '';
                });
        }

        function getSlotText(slots) {
            return slots
                .map(slot => cleanText(slot.value))
                .filter(Boolean)
                .join(', ');
        }

        function hasEnabledSlot(slots) {
            return slots.some(slot => slot.enabled && cleanText(slot.value));
        }

        function readFormSettings(container) {
            const verificationUserSlots = readVerificationSlots(container, 'user');
            const verificationCouncilSlots = readVerificationSlots(container, 'council');

            return {
                webhook: container.querySelector('#tw-alerts-webhook').value.trim(),
                summaryWebhook: container.querySelector('#tw-alerts-summary-webhook').value.trim(),
                noblesWebhook: container.querySelector('#tw-alerts-nobles-webhook').value.trim(),
                troopsWebhook: container.querySelector('#tw-alerts-troops-webhook').value.trim(),
                attackFullsWebhook: container.querySelector('#tw-alerts-attack-fulls-webhook').value.trim(),
                nobleCounterWebhook: container.querySelector('#tw-alerts-noble-counter-webhook').value.trim(),
                verificationWebhook: container.querySelector('#tw-alerts-verification-webhook').value.trim(),
                verificationMention: getSlotText(verificationUserSlots),
                verificationMentionEnabled: hasEnabledSlot(verificationUserSlots),
                verificationUserSlots,
                verificationCouncilTag: getSlotText(verificationCouncilSlots),
                verificationCouncilTagEnabled: hasEnabledSlot(verificationCouncilSlots),
                verificationCouncilSlots,
                notifyNormalAttacks: container.querySelector('#tw-alerts-normal').checked,
                notifyNobleAttacks: container.querySelector('#tw-alerts-nobles').checked,
                notifyAttackSummary: container.querySelector('#tw-alerts-summary').checked,
                notifyDefenseTroops: container.querySelector('#tw-alerts-defense-troops').checked,
                notifyAttackFulls: container.querySelector('#tw-alerts-attack-fulls').checked,
                notifyNobleCounter: container.querySelector('#tw-alerts-noble-counter').checked,
                combineAttackFullsAndNobles: container.querySelector('#tw-alerts-combine-counters').checked,
                notifyVerificationAlerts: container.querySelector('#tw-alerts-verification').checked,
                summaryIntervalHours: Number(container.querySelector('#tw-alerts-summary-interval').value || 8),
                troopsIntervalHours: Number(container.querySelector('#tw-alerts-troops-interval').value || 8),
                attackFullsIntervalHours: Number(container.querySelector('#tw-alerts-attack-fulls-interval').value || 8),
                nobleCounterIntervalHours: Number(container.querySelector('#tw-alerts-noble-counter-interval').value || 8),
                checkInterval: container.querySelector('#tw-alerts-interval').value || CHECK_INTERVAL,
                troopsSummaryMode: container.querySelector('#tw-alerts-troops-mode').value || TROOPS_SUMMARY_MODE_COMPLETE,
                summaryScheduleMode: container.querySelector('#tw-alerts-summary-schedule-mode').value || SCHEDULE_MODE_INTERVAL,
                summaryDailyTime: container.querySelector('#tw-alerts-summary-daily-time').value || DEFAULT_SUMMARY_DAILY_TIME,
                troopsScheduleMode: container.querySelector('#tw-alerts-troops-schedule-mode').value || SCHEDULE_MODE_INTERVAL,
                troopsDailyTime: container.querySelector('#tw-alerts-troops-daily-time').value || DEFAULT_TROOPS_DAILY_TIME,
                attackFullsScheduleMode: container.querySelector('#tw-alerts-attack-fulls-schedule-mode').value || SCHEDULE_MODE_INTERVAL,
                attackFullsDailyTime: container.querySelector('#tw-alerts-attack-fulls-daily-time').value || DEFAULT_ATTACK_FULLS_DAILY_TIME,
                nobleCounterScheduleMode: container.querySelector('#tw-alerts-noble-counter-schedule-mode').value || SCHEDULE_MODE_INTERVAL,
                nobleCounterDailyTime: container.querySelector('#tw-alerts-noble-counter-daily-time').value || DEFAULT_NOBLE_COUNTER_DAILY_TIME,
                nobleTrainDelay: NOBLE_TRAIN_DELAY
            };
        }

        function applyFormSettings(nextSettings, container) {
            container.querySelector('#tw-alerts-webhook').value = nextSettings.webhook || '';
            container.querySelector('#tw-alerts-nobles-webhook').value = nextSettings.noblesWebhook || '';
            container.querySelector('#tw-alerts-summary-webhook').value = nextSettings.summaryWebhook || '';
            container.querySelector('#tw-alerts-troops-webhook').value = nextSettings.troopsWebhook || '';
            container.querySelector('#tw-alerts-attack-fulls-webhook').value = nextSettings.attackFullsWebhook || '';
            container.querySelector('#tw-alerts-noble-counter-webhook').value = nextSettings.nobleCounterWebhook || '';
            container.querySelector('#tw-alerts-verification-webhook').value = nextSettings.verificationWebhook || '';
            applyVerificationSlots(
                container,
                'user',
                normalizeVerificationSlots(nextSettings, 'verificationUserSlots', 'verificationMention', 'verificationMentionEnabled')
            );
            applyVerificationSlots(
                container,
                'council',
                normalizeVerificationSlots(nextSettings, 'verificationCouncilSlots', 'verificationCouncilTag', 'verificationCouncilTagEnabled')
            );
            container.querySelector('#tw-alerts-normal').checked = Boolean(nextSettings.notifyNormalAttacks);
            container.querySelector('#tw-alerts-nobles').checked = Boolean(nextSettings.notifyNobleAttacks);
            container.querySelector('#tw-alerts-summary').checked = Boolean(nextSettings.notifyAttackSummary);
            container.querySelector('#tw-alerts-defense-troops').checked = Boolean(nextSettings.notifyDefenseTroops);
            container.querySelector('#tw-alerts-attack-fulls').checked = Boolean(nextSettings.notifyAttackFulls);
            container.querySelector('#tw-alerts-noble-counter').checked = Boolean(nextSettings.notifyNobleCounter);
            container.querySelector('#tw-alerts-combine-counters').checked = Boolean(nextSettings.combineAttackFullsAndNobles);
            container.querySelector('#tw-alerts-verification').checked = Boolean(nextSettings.notifyVerificationAlerts);
            container.querySelector('#tw-alerts-interval').value = nextSettings.checkInterval || CHECK_INTERVAL;
            container.querySelector('#tw-alerts-summary-interval').value = String(normalizeIntervalHours(nextSettings.summaryIntervalHours, DEFAULT_SUMMARY_INTERVAL_HOURS));
            container.querySelector('#tw-alerts-troops-interval').value = String(normalizeIntervalHours(nextSettings.troopsIntervalHours, DEFAULT_TROOPS_INTERVAL_HOURS));
            container.querySelector('#tw-alerts-attack-fulls-interval').value = String(normalizeIntervalHours(nextSettings.attackFullsIntervalHours, DEFAULT_ATTACK_FULLS_INTERVAL_HOURS));
            container.querySelector('#tw-alerts-noble-counter-interval').value = String(normalizeIntervalHours(nextSettings.nobleCounterIntervalHours, DEFAULT_NOBLE_COUNTER_INTERVAL_HOURS));
            container.querySelector('#tw-alerts-troops-mode').value = normalizeTroopsSummaryMode(nextSettings.troopsSummaryMode);
            container.querySelector('#tw-alerts-summary-schedule-mode').value = normalizeScheduleMode(nextSettings.summaryScheduleMode);
            container.querySelector('#tw-alerts-summary-daily-time').value = normalizeDailyTime(nextSettings.summaryDailyTime, DEFAULT_SUMMARY_DAILY_TIME);
            container.querySelector('#tw-alerts-troops-schedule-mode').value = normalizeScheduleMode(nextSettings.troopsScheduleMode);
            container.querySelector('#tw-alerts-troops-daily-time').value = normalizeDailyTime(nextSettings.troopsDailyTime, DEFAULT_TROOPS_DAILY_TIME);
            container.querySelector('#tw-alerts-attack-fulls-schedule-mode').value = normalizeScheduleMode(nextSettings.attackFullsScheduleMode);
            container.querySelector('#tw-alerts-attack-fulls-daily-time').value = normalizeDailyTime(nextSettings.attackFullsDailyTime, DEFAULT_ATTACK_FULLS_DAILY_TIME);
            container.querySelector('#tw-alerts-noble-counter-schedule-mode').value = normalizeScheduleMode(nextSettings.nobleCounterScheduleMode);
            container.querySelector('#tw-alerts-noble-counter-daily-time').value = normalizeDailyTime(nextSettings.nobleCounterDailyTime, DEFAULT_NOBLE_COUNTER_DAILY_TIME);
        }

        function bindSettingsForm(container) {
            const status = container.querySelector('#tw-alerts-status');

            container.querySelector('#tw-alerts-save').addEventListener('click', () => {
                saveSettings(readFormSettings(container));
                status.textContent = 'Configuração guardada.';
            });

            container.querySelector('#tw-alerts-reset').addEventListener('click', () => {
                localStorage.removeItem(SETTINGS_KEY);
                applyFormSettings(DEFAULT_SETTINGS, container);
                status.textContent = 'Configurações repostas.';
                console.log('[TW] Configuracoes da UI repostas.');
            });

            container.querySelector('#tw-alerts-test').addEventListener('click', async () => {
                saveSettings(readFormSettings(container));
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

            container.querySelector('#tw-alerts-test-verification').addEventListener('click', () => {
                saveSettings(readFormSettings(container));
                localStorage.removeItem(VERIFICATION_ALERT_KEY);
                status.textContent = 'A enviar teste captcha...';
                notifyVerificationPageDetected('Teste Manual');
                status.textContent = 'Teste captcha enviado.';
            });

            container.querySelector('#tw-alerts-troops').addEventListener('click', async () => {
                saveSettings(readFormSettings(container));
                status.textContent = 'A enviar tropas...';

                try {
                    const sent = await sendTroopSummary();
                    status.textContent = sent ? 'Tropas enviadas.' : 'Sem tropas para enviar.';
                } catch (error) {
                    console.warn('[TW] Erro ao enviar tropas:', error);
                    status.textContent = 'Erro ao enviar tropas.';
                }
            });

            container.querySelector('#tw-alerts-attack-fulls-send').addEventListener('click', async () => {
                saveSettings(readFormSettings(container));
                const combinedCounters = shouldUseCombinedCounters(getSettings());
                status.textContent = combinedCounters
                    ? 'A enviar fulls e nobres...'
                    : 'A enviar fulls de ataque...';

                try {
                    const sent = combinedCounters
                        ? await sendCombinedCountersSummary()
                        : await sendAttackFullsSummary();

                    status.textContent = sent
                        ? (combinedCounters ? 'Fulls e nobres enviados.' : 'Fulls de ataque enviados.')
                        : (combinedCounters ? 'Sem dados para enviar.' : 'Sem dados de fulls para enviar.');
                } catch (error) {
                    console.warn('[TW] Erro ao enviar fulls de ataque:', error);
                    status.textContent = combinedCounters
                        ? 'Erro ao enviar fulls e nobres.'
                        : 'Erro ao enviar fulls de ataque.';
                }
            });

            container.querySelector('#tw-alerts-noble-counter-send').addEventListener('click', async () => {
                saveSettings(readFormSettings(container));
                status.textContent = 'A enviar contador de nobres...';

                try {
                    const sent = await sendNobleCounterSummary();
                    status.textContent = sent ? 'Contador de nobres enviado.' : 'Sem dados de nobres para enviar.';
                } catch (error) {
                    console.warn('[TW] Erro ao enviar contador de nobres:', error);
                    status.textContent = 'Erro ao enviar contador de nobres.';
                }
            });

            container.querySelector('#tw-alerts-test-summary').addEventListener('click', async () => {
                saveSettings(readFormSettings(container));
                status.textContent = 'A enviar resumo...';

                try {
                    const sent = await sendAttackSummaryTest();
                    status.textContent = sent ? 'Resumo enviado.' : 'Sem ataques para resumir.';
                } catch (error) {
                    console.warn('[TW] Erro ao testar resumo:', error);
                    status.textContent = 'Erro ao enviar resumo.';
                }
            });
        }

        bindSettingsForm(root);
    }

    function checkCurrentPageVerification() {
        if (isTwVerificationPage(document)) {
            pauseForVerification('pagina atual');
            return true;
        }

        return false;
    }

    async function scheduleCheckLoop() {
        restorePendingNobleTrains();
        await runCheckLoop();
        setTimeout(scheduleCheckLoop, getCurrentCheckInterval());
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

    createSettingsUi();
    restorePendingNobleTrains();
    checkCurrentPageVerification();
    setInterval(checkCurrentPageVerification, 5000);
    setTimeout(scheduleCheckLoop, Math.floor(Math.random() * 1000));
})();
