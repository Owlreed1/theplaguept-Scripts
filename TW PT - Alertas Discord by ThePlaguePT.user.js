// ==UserScript==
// @name         TW PT - Alertas Discord ThePlaguePT
// @namespace    http://tampermonkey.net/
// @version      1.3.69
// @description  Notificacoes de ataques Tribal Wars -> Discord
// @author       ThePlaguePT
// @match        https://*.tribalwars.com.pt/game.php*
// @include      /^https:\/\/[a-z0-9-]+\.(tribalwars\.[^\/]+|die-staemme\.de|plemiona\.pl|divokekmeny\.cz|divoke-kmene\.sk|guerretribale\.fr|guerrastribales\.es|triburile\.ro|fyletikesmaxes\.gr|klanhaboru\.hu|klanlar\.org)\/game\.php(?:\?.*)?$/
// @homepageURL  https://github.com/ThePlaguePT/TribalWars-Scripts
// @supportURL   https://github.com/ThePlaguePT/TribalWars-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Alertas%20Discord%20by%20ThePlaguePT.user.js
// @downloadURL  https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Alertas%20Discord%20by%20ThePlaguePT.user.js
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      discord.com
// @connect      raw.githubusercontent.com
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_VERSION = '1.3.69';
    const SCRIPT_UPDATE_URL = 'https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW%20PT%20-%20Alertas%20Discord%20by%20ThePlaguePT.user.js';

    console.log(`[TW Discord Alerts] Versao ${SCRIPT_VERSION} carregada`);

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
    const VERIFICATION_ALERT_KEY = `${STORAGE_PREFIX}_verification_alert_last_sent`;
    const GENERIC_INCOMING_STATE_KEY = `${STORAGE_PREFIX}_generic_incoming_state`;
    const SCRIPT_UPDATE_LAST_CHECK_KEY = `${STORAGE_PREFIX}_script_update_last_check`;
    const SCRIPT_UPDATE_NOTICE_KEY = `${STORAGE_PREFIX}_script_update_notice`;

    const VERIFICATION_ALERT_COOLDOWN_MS = 1000 * 60 * 30;
    const HOUR_MS = 1000 * 60 * 60;
    const STARTUP_GRACE_MS = 1000 * 60 * 2;
    const SCRIPT_STARTED_AT = Date.now();
    const TROOP_SCAN_MIN_COVERAGE = 0.8;

    const DEFAULT_SUMMARY_INTERVAL_HOURS = 8;
    const DEFAULT_TROOPS_INTERVAL_HOURS = 8;
    const DEFAULT_ATTACK_FULLS_INTERVAL_HOURS = 8;
    const DEFAULT_NOBLE_COUNTER_INTERVAL_HOURS = 8;
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
        snob: '👑 Nobres'
    };

    const TROOP_DEFENSE_UNITS = ['spear', 'sword', 'archer', 'spy', 'heavy'];
    const TROOP_DEFENSE_DISPLAY_UNITS = ['spear', 'sword', 'archer', 'heavy', 'spy'];
    const TROOP_ATTACK_UNITS = ['axe', 'light', 'marcher', 'ram', 'catapult', 'snob'];
    const TROOP_UNIT_ORDER = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult', 'knight', 'snob'];
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
        combineAttackFullsAndNobles: true,
        notifyVerificationAlerts: false,
        summaryIntervalHours: DEFAULT_SUMMARY_INTERVAL_HOURS,
        summaryScheduleMode: SCHEDULE_MODE_INTERVAL,
        summaryDailyTime: DEFAULT_SUMMARY_DAILY_TIME,
        troopsScheduleMode: SCHEDULE_MODE_INTERVAL,
        troopsDailyTime: DEFAULT_TROOPS_DAILY_TIME,
        troopsIntervalHours: DEFAULT_TROOPS_INTERVAL_HOURS,
        troopsSummaryMode: TROOPS_SUMMARY_MODE_SIMPLE_DEFENSE,
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

    function resetScheduleAttempt(lastSentKey, dailySentKey) {
        localStorage.removeItem(lastSentKey);

        const todayKey = getLocalDateKey(new Date());
        if (localStorage.getItem(dailySentKey) === todayKey) {
            localStorage.removeItem(dailySentKey);
        }
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

    let cleanReadSequence = 0;

    function getCleanReadUrl(urlValue) {
        const url = new URL(urlValue, window.location.origin);
        cleanReadSequence += 1;
        url.searchParams.set('_tw_clean_read', `${Date.now()}_${cleanReadSequence}_${Math.random().toString(36).slice(2)}`);
        return url.toString();
    }

    function sanitizeFetchedDocument(doc) {
        if (!doc) return doc;

        Array.from(doc.querySelectorAll([
            'script',
            'style',
            'link[rel="stylesheet"]',
            '#tw-discord-alerts-ui',
            '#tw-discord-alerts-shared-bar',
            '[data-tw-discord-alerts-ui]',
            '[data-tw-script-button]'
        ].join(','))).forEach(element => element.remove());

        return doc;
    }

    async function fetchCleanText(urlValue) {
        const response = await fetch(getCleanReadUrl(urlValue), {
            credentials: 'include',
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, max-age=0',
                Pragma: 'no-cache'
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        return response.text();
    }

    async function fetchCleanDocument(urlValue, type = 'text/html') {
        const text = await fetchCleanText(urlValue);
        const doc = new DOMParser().parseFromString(text, type);

        return type === 'text/html'
            ? sanitizeFetchedDocument(doc)
            : doc;
    }

    function compareVersions(left, right) {
        const leftParts = String(left || '').split('.').map(part => Number(part) || 0);
        const rightParts = String(right || '').split('.').map(part => Number(part) || 0);
        const length = Math.max(leftParts.length, rightParts.length);

        for (let index = 0; index < length; index++) {
            const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
            if (diff !== 0) return diff > 0 ? 1 : -1;
        }

        return 0;
    }

    function fetchExternalText(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`,
                headers: {
                    'Cache-Control': 'no-cache'
                },
                onload: response => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.responseText || '');
                        return;
                    }

                    reject(new Error(`HTTP ${response.status}`));
                },
                onerror: reject
            });
        });
    }

    function getVersionFromUserScript(text) {
        const match = String(text || '').match(/@version\s+([^\s]+)/);
        return match ? cleanText(match[1]) : '';
    }

    function showScriptUpdateNotice(latestVersion) {
        localStorage.setItem(SCRIPT_UPDATE_NOTICE_KEY, latestVersion);

        let uiDoc = document;
        try {
            if (window.top && window.top.document) {
                uiDoc = window.top.document;
            }
        } catch (_) {}

        const status = uiDoc.querySelector('#tw-alerts-status');
        if (status) {
            status.textContent = `Nova versao ${latestVersion} disponivel no GitHub. Atualiza no Tampermonkey.`;
        }

        const launcher = uiDoc.querySelector('#tw-discord-alerts-toggle');
        if (launcher) {
            launcher.setAttribute('title', `Nova versao ${latestVersion} disponivel no GitHub`);
        }
    }

    async function checkScriptUpdate(force = false) {
        const now = Date.now();
        const lastCheck = Number(localStorage.getItem(SCRIPT_UPDATE_LAST_CHECK_KEY) || 0);

        if (!force && now - lastCheck < HOUR_MS) return;

        localStorage.setItem(SCRIPT_UPDATE_LAST_CHECK_KEY, String(now));

        try {
            const latestText = await fetchExternalText(SCRIPT_UPDATE_URL);
            const latestVersion = getVersionFromUserScript(latestText);

            if (latestVersion && compareVersions(latestVersion, SCRIPT_VERSION) > 0) {
                console.warn('[TW] Nova versao do script disponivel:', latestVersion, 'atual:', SCRIPT_VERSION);
                showScriptUpdateNotice(latestVersion);
                return;
            }

            localStorage.removeItem(SCRIPT_UPDATE_NOTICE_KEY);
            console.log('[TW] Script atualizado:', SCRIPT_VERSION);
        } catch (error) {
            console.warn('[TW] Erro ao verificar update do script:', error);
        }
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
            footer: { text: 'Tribal Wars' },
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
        return fetchCleanDocument(getIncomingAttacksUrl());
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
            const doc = await fetchCleanDocument('/interface.php?func=get_config', 'text/xml');
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
            footer: { text: 'Tribal Wars' },
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

    function isLoggedInGamePage() {
        try {
            const url = new URL(window.location.href);
            const player = getGameDataPlayer();

            return /\/game\.php$/i.test(url.pathname) &&
                Boolean(player && player.id && player.name);
        } catch (_) {
            return false;
        }
    }

    function removeSettingsUi() {
        let uiDoc = document;

        try {
            if (window.top && window.top.document) {
                uiDoc = window.top.document;
            }
        } catch (_) {}

        [
            'tw-discord-alerts-ui',
            'tw-discord-alerts-backdrop',
            'tw-discord-alerts-frame',
            'tp-theplaguept-script-bar-tooltip'
        ].forEach(id => {
            const element = uiDoc.getElementById(id);
            if (element) element.remove();
        });
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

    async function getPlayerTribe(playerUrl) {
        if (!playerUrl) return { name: 'Desconhecida', url: null };

        try {
            const doc = await fetchCleanDocument(playerUrl);
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
            footer: { text: 'Tribal Wars' },
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
            footer: { text: 'Tribal Wars' },
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
            footer: { text: 'Tribal Wars' },
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
        return Boolean(settings.notifyAttackFulls);
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

        if (settings.notifyAttackFulls && shouldSendAttackFullsSummary()) {
            try {
                const sent = await sendAttackFullsSummary();

                if (sent) {
                    markNobleCounterScheduleSynced();
                    console.log('[TW] Contador automatico de fulls de ataque e nobres enviado.');
                } else {
                    resetScheduleAttempt(ATTACK_FULLS_LAST_SENT_KEY, ATTACK_FULLS_DAILY_SENT_KEY);
                }
            } catch (error) {
                resetScheduleAttempt(ATTACK_FULLS_LAST_SENT_KEY, ATTACK_FULLS_DAILY_SENT_KEY);
                console.warn('[TW] Erro ao enviar contador automatico de fulls de ataque e nobres:', error);
            }

            return;
        }

        if (settings.notifyNobleCounter) {
            console.log('[TW] Contador de nobres separado ignorado; agora segue dentro dos fulls de ataque.');
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
                const genericSignal = detectGenericIncomingSignal(doc);

                maybeNotifyGenericIncoming(genericSignal);

                syncFallbackCountsToVisibleAttacks([]);
                saveAttackSummaryState([]);

                if (getSettings().notifyDefenseTroops && shouldSendTroopSummary()) {
                    try {
                        const sent = await sendTroopSummary();
                        if (sent) {
                            console.log('[TW] Defesa disponivel automatica enviada.');
                        } else {
                            resetScheduleAttempt(TROOPS_LAST_SENT_KEY, TROOPS_DAILY_SENT_KEY);
                        }
                    } catch (error) {
                        resetScheduleAttempt(TROOPS_LAST_SENT_KEY, TROOPS_DAILY_SENT_KEY);
                        console.warn('[TW] Erro ao enviar defesa disponivel automatica:', error);
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
                    const sent = await sendTroopSummary();
                    if (sent) {
                        console.log('[TW] Defesa disponivel automatica enviada.');
                    } else {
                        resetScheduleAttempt(TROOPS_LAST_SENT_KEY, TROOPS_DAILY_SENT_KEY);
                    }
                } catch (error) {
                    resetScheduleAttempt(TROOPS_LAST_SENT_KEY, TROOPS_DAILY_SENT_KEY);
                    console.warn('[TW] Erro ao enviar defesa disponivel automatica:', error);
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

    function getTroopsOverviewUrl(type) {
        const url = new URL(window.location.href);
        url.searchParams.set('screen', 'overview_villages');
        url.searchParams.set('mode', 'units');
        url.searchParams.set('page', '-1');
        url.searchParams.delete('type');
        url.searchParams.delete('group');

        if (type) {
            url.searchParams.set('type', String(type));
        }

        url.searchParams.delete('action');
        url.searchParams.delete('ajax');
        url.searchParams.delete('h');
        return url.toString();
    }

    function normalizeTroopsOverviewUrl(urlValue) {
        const url = new URL(urlValue || window.location.href, window.location.origin);

        url.searchParams.set('screen', 'overview_villages');
        url.searchParams.set('mode', 'units');
        url.searchParams.set('page', '-1');
        url.searchParams.delete('group');
        url.searchParams.delete('action');
        url.searchParams.delete('ajax');
        url.searchParams.delete('h');

        return url.toString();
    }

    function isSupportOverviewTabText(value) {
        const text = normalizeSearchText(value);

        return [
            'suporte',
            'support',
            'supports',
            'supporting',
            'apoio',
            'apoios',
            'apoyo',
            'apoyos',
            'soutien',
            'renfort',
            'rinforzo',
            'rinforzi',
            'wsparcie',
            'podpora',
            'sprijin',
            'suport'
        ].includes(text);
    }

    function findTroopsOverviewSupportUrl(doc) {
        const sources = [doc, document].filter(Boolean);

        for (const sourceDoc of sources) {
            const links = Array.from(sourceDoc.querySelectorAll('a[href*="screen=overview_villages"][href*="mode=units"]'));
            const supportLink = links.find(link => isSupportOverviewTabText(link.innerText || link.textContent || ''));

            if (supportLink) {
                return normalizeTroopsOverviewUrl(supportLink.getAttribute('href'));
            }
        }

        return getTroopsOverviewUrl('support');
    }

    async function fetchTroopsOverviewDocument(type) {
        return fetchCleanDocument(getTroopsOverviewUrl(type));
    }

    async function fetchTroopsSupportOverviewDocument(baseDoc) {
        return fetchCleanDocument(findTroopsOverviewSupportUrl(baseDoc));
    }

    function getPlaceUnitsUrl(villageId) {
        const url = new URL(window.location.href);
        url.searchParams.set('screen', 'place');
        url.searchParams.set('mode', 'units');

        if (villageId) {
            url.searchParams.set('village', String(villageId));
        }

        url.searchParams.delete('action');
        url.searchParams.delete('ajax');
        url.searchParams.delete('h');

        return url.toString();
    }

    async function fetchPlaceUnitsDocument(villageId) {
        return fetchCleanDocument(getPlaceUnitsUrl(villageId));
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
        return fetchCleanDocument(getVillagesOverviewUrl(mode));
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
        return fetchCleanDocument(getAcademyUrl(villageId));
    }

    function normalizeUnitHaystack(value) {
        return normalizeSearchText(value || '')
            .replace(/[_-]+/g, ' ');
    }

    function detectTroopUnitKeyFromTechnicalText(value) {
        const text = normalizeUnitHaystack(value);
        const technicalAliases = {
            spear: ['unit spear', 'unit item spear', 'spear.png', '/spear'],
            sword: ['unit sword', 'unit item sword', 'sword.png', '/sword'],
            axe: ['unit axe', 'unit item axe', 'axe.png', '/axe'],
            archer: ['unit archer', 'unit item archer', 'archer.png', '/archer'],
            spy: ['unit spy', 'unit item spy', 'spy.png', '/spy'],
            light: ['unit light', 'unit item light', 'light.png', '/light'],
            marcher: ['unit marcher', 'unit item marcher', 'marcher.png', '/marcher'],
            heavy: ['unit heavy', 'unit item heavy', 'heavy.png', '/heavy'],
            ram: ['unit ram', 'unit item ram', 'ram.png', '/ram'],
            catapult: ['unit catapult', 'unit item catapult', 'catapult.png', '/catapult'],
            knight: ['unit knight', 'unit item knight', 'knight.png', '/knight'],
            snob: ['unit snob', 'unit item snob', 'snob.png', '/snob']
        };

        return TROOP_UNIT_ORDER.find(key =>
            technicalAliases[key].some(alias => text.includes(alias))
        ) || null;
    }

    function detectTroopUnitKeyFromLabel(value) {
        const text = normalizeUnitHaystack(value);
        const labelAliases = [
            ['marcher', ['arqueiro a cavalo', 'arqueiros a cavalo', 'mounted archer', 'mounted archers']],
            ['light', ['cavalaria leve', 'light cavalry']],
            ['heavy', ['cavalaria pesada', 'heavy cavalry']],
            ['catapult', ['catapulta', 'catapult']],
            ['spear', ['lanceiro', 'lanceiros', 'spear fighter', 'spear fighters']],
            ['sword', ['espadachim', 'espadachins', 'swordsman', 'swordsmen']],
            ['axe', ['barbaro', 'barbaros', 'barbarian', 'barbarians', 'viking', 'vikings', 'axeman', 'axemen', 'machado', 'machados']],
            ['archer', ['arqueiro', 'arqueiros', 'archer', 'archers']],
            ['spy', ['explorador', 'exploradores', 'batedor', 'batedores', 'scout', 'scouts', 'spy']],
            ['ram', ['ariete', 'arietes', 'ram', 'rams']],
            ['knight', ['paladino', 'paladinos', 'paladin', 'knight']],
            ['snob', ['nobre', 'nobres', 'noble', 'nobles']]
        ];

        for (const [key, aliases] of labelAliases) {
            if (aliases.some(alias => text.includes(alias))) {
                return key;
            }
        }

        return null;
    }

    function detectTroopUnitKey(cell) {
        if (!cell) return null;

        const technicalParts = [
            cell.className || '',
            cell.getAttribute && (cell.getAttribute('data-unit') || '')
        ];

        Array.from(cell.querySelectorAll('img,[class*="unit"],[data-unit]')).forEach(element => {
            technicalParts.push(
                element.getAttribute('src') || '',
                element.getAttribute('class') || '',
                element.getAttribute('data-unit') || ''
            );
        });

        const technicalMatches = new Set(
            technicalParts
                .map(detectTroopUnitKeyFromTechnicalText)
                .filter(Boolean)
        );

        if (technicalMatches.size === 1) {
            return Array.from(technicalMatches)[0];
        }

        if (technicalMatches.size > 1) {
            return null;
        }

        const labelParts = [];
        Array.from(cell.querySelectorAll('img,[title],[alt]')).forEach(element => {
            labelParts.push(
                element.getAttribute('title') || '',
                element.getAttribute('alt') || ''
            );
        });

        labelParts.push(cell.getAttribute && (cell.getAttribute('title') || ''));

        const labelMatches = new Set(
            labelParts
                .map(detectTroopUnitKeyFromLabel)
                .filter(Boolean)
        );

        return labelMatches.size === 1
            ? Array.from(labelMatches)[0]
            : null;
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

    const troopTableGridCache = new WeakMap();

    function getTroopTableGridInfo(table) {
        if (!table) return null;
        if (troopTableGridCache.has(table)) return troopTableGridCache.get(table);

        const rows = getDirectTableRows(table);
        const grid = [];
        const rowIndexes = new WeakMap();

        rows.forEach((row, rowIndex) => {
            rowIndexes.set(row, rowIndex);
            if (!grid[rowIndex]) grid[rowIndex] = [];

            let columnIndex = 0;

            Array.from(row.children).forEach(cell => {
                while (grid[rowIndex][columnIndex]) {
                    columnIndex += 1;
                }

                const colspan = Math.max(1, Number(cell.getAttribute('colspan') || 1));
                const rowspan = Math.max(1, Number(cell.getAttribute('rowspan') || 1));

                for (let rowOffset = 0; rowOffset < rowspan; rowOffset++) {
                    const targetRow = rowIndex + rowOffset;
                    if (!grid[targetRow]) grid[targetRow] = [];

                    for (let columnOffset = 0; columnOffset < colspan; columnOffset++) {
                        grid[targetRow][columnIndex + columnOffset] = cell;
                    }
                }

                columnIndex += colspan;
            });
        });

        const info = { rows, grid, rowIndexes };
        troopTableGridCache.set(table, info);
        return info;
    }

    function getVirtualCellAtColumn(row, columnIndex) {
        const table = row ? row.closest('table') : null;
        const info = getTroopTableGridInfo(table);
        const rowIndex = info ? info.rowIndexes.get(row) : null;

        if (rowIndex === null || rowIndex === undefined) return null;

        return info.grid[rowIndex]
            ? info.grid[rowIndex][columnIndex] || null
            : null;
    }

    function getTroopColumns(table) {
        let bestColumns = [];
        let bestScore = -Infinity;
        const rows = getDirectTableRows(table);

        rows.forEach(row => {
            const columns = [];
            let columnIndex = 0;

            Array.from(row.children).forEach((cell, cellIndex) => {
                const unitKey = detectTroopUnitKey(cell);
                if (unitKey) {
                    columns.push({ index: columnIndex, cellIndex, key: unitKey });
                }

                columnIndex += Number(cell.getAttribute('colspan') || 1);
            });

            const uniqueKeys = new Set(columns.map(column => column.key));
            const duplicateCount = columns.length - uniqueKeys.size;
            const orderIndexes = columns.map(column => TROOP_UNIT_ORDER.indexOf(column.key));
            const orderedPairs = orderIndexes.slice(1).filter((index, pairIndex) =>
                index >= orderIndexes[pairIndex]
            ).length;
            const rowText = cleanText(row.innerText || row.textContent || '');
            const hasCoords = Boolean(parseCoords(rowText));
            const hasValueCells = Array.from(row.children).some(isLikelyTroopValueCell);
            const isHeaderLike = columns.length >= 3 && !hasCoords && !hasValueCells;
            const score =
                uniqueKeys.size * 10 +
                orderedPairs -
                duplicateCount * 25 +
                (isHeaderLike ? 100 : 0) -
                (hasCoords ? 100 : 0) -
                (hasValueCells ? 35 : 0);

            if (score > bestScore) {
                bestScore = score;
                bestColumns = columns.filter((column, index) =>
                    columns.findIndex(existing => existing.key === column.key) === index
                );
            }
        });

        return bestColumns.sort((a, b) => a.index - b.index);
    }

    function getVirtualCellRange(table, rowIndex, cell) {
        const info = getTroopTableGridInfo(table);
        const rowGrid = info && info.grid ? info.grid[rowIndex] : null;

        if (!rowGrid || !cell) return null;

        let start = -1;
        let end = -1;

        rowGrid.forEach((candidate, index) => {
            if (candidate !== cell) return;

            if (start === -1) start = index;
            end = index;
        });

        return start === -1 ? null : { start, end };
    }

    function getTroopColumnsInVirtualRange(table, start, end) {
        const info = getTroopTableGridInfo(table);
        let bestColumns = [];
        let bestScore = -Infinity;

        if (!info || !info.rows || !info.grid) return bestColumns;

        info.rows.forEach((row, rowIndex) => {
            const columns = [];
            const usedCells = new Set();

            for (let columnIndex = start; columnIndex <= end; columnIndex++) {
                const cell = info.grid[rowIndex] ? info.grid[rowIndex][columnIndex] : null;
                if (!cell || usedCells.has(cell)) continue;

                usedCells.add(cell);

                const unitKey = detectTroopUnitKey(cell);
                if (unitKey) {
                    columns.push({ index: columnIndex, key: unitKey });
                }
            }

            const uniqueKeys = new Set(columns.map(column => column.key));
            const duplicateCount = columns.length - uniqueKeys.size;
            const rowText = cleanText(row.innerText || row.textContent || '');
            const hasCoords = Boolean(parseCoords(rowText));
            const hasValueCells = Array.from(row.children).some(isLikelyTroopValueCell);
            const isHeaderLike = columns.length >= 2 && !hasCoords && !hasValueCells;
            const score =
                uniqueKeys.size * 10 -
                duplicateCount * 25 +
                (isHeaderLike ? 100 : 0) -
                (hasCoords ? 100 : 0) -
                (hasValueCells ? 35 : 0);

            if (score > bestScore) {
                bestScore = score;
                bestColumns = columns.filter((column, index) =>
                    columns.findIndex(existing => existing.key === column.key) === index
                );
            }
        });

        return bestColumns.sort((a, b) => a.index - b.index);
    }

    function getDirectTableRows(table) {
        return Array.from(table.querySelectorAll('tr'))
            .filter(row => row.closest('table') === table);
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
            const compact = String(token || '').replace(/[.\s]/g, '');

            if (!compact || compact.length > 8) return 0;

            const number = Number(compact) || 0;
            return number > TROOP_CELL_MAX_VALUE ? 0 : number;
        };
        const numericLines = lines.filter(line => /^\d[\d.\s]*$/.test(line));
        const sourceLines = numericLines.length ? numericLines : lines;
        const values = sourceLines
            .map(line => line.match(/\d{1,3}(?:\.\d{3})+|\d+/g) || [])
            .flat()
            .map(parseNumber)
            .filter(number => number > 0);

        return values.length ? Math.max(...values) : 0;
    }

    function getTroopColumnCell(row, column, columns) {
        const virtualCell = getVirtualCellAtColumn(row, column.index);

        if (virtualCell && !parseCoords(virtualCell.innerText || virtualCell.textContent || '')) {
            return virtualCell;
        }

        const physicalCell = typeof column.cellIndex === 'number'
            ? Array.from(row.children)[column.cellIndex]
            : null;

        return physicalCell && !parseCoords(physicalCell.innerText || physicalCell.textContent || '')
            ? physicalCell
            : null;
    }

    function parseTroopRowTotals(row, columns) {
        const rowTotals = createTroopTotals();

        columns.forEach(column => {
            const cell = getTroopColumnCell(row, column, columns);
            const value = parseSafeTroopCellNumber(cell ? (cell.innerText || cell.textContent || '') : '');

            if (value > 0) {
                rowTotals[column.key] += value;
            }
        });

        return rowTotals;
    }

    function parseTroopRowTotalsByUnitCells(row) {
        const rowTotals = createTroopTotals();
        const detectedUnits = new Set();

        Array.from(row ? row.children : []).forEach(cell => {
            const unitKey = detectTroopUnitKey(cell);
            if (!unitKey) return;

            detectedUnits.add(unitKey);

            const value = parseSafeTroopCellNumber(cell.innerText || cell.textContent || '');
            if (value > 0) {
                rowTotals[unitKey] += value;
            }
        });

        return {
            totals: rowTotals,
            detectedCount: detectedUnits.size
        };
    }

    function getDirectUnitCellMinCount(columns) {
        const columnCount = Number(columns && columns.length || 0);

        if (!columnCount) return 4;

        return Math.max(3, Math.min(6, Math.ceil(columnCount * 0.45)));
    }

    function isLikelyTroopValueCell(cell) {
        const text = cleanText(cell ? (cell.innerText || cell.textContent || '') : '');

        if (!text || parseCoords(text)) return false;
        if (/^[-—â€”]+$/.test(text)) return true;

        return /^\d[\d.\s]*$/.test(text);
    }

    function parseTroopRowTotalsFromRight(row, columns) {
        const rowTotals = createTroopTotals();
        const cells = Array.from(row ? row.children : []);

        if (!cells.length || !columns || !columns.length) return rowTotals;

        const valueCells = cells.filter(isLikelyTroopValueCell);
        const unitCells = valueCells.length >= columns.length
            ? valueCells.slice(0, columns.length)
            : cells.slice(Math.max(0, cells.length - columns.length));

        columns.slice(0, unitCells.length).forEach((column, index) => {
            const cell = unitCells[index];
            const value = parseSafeTroopCellNumber(cell ? (cell.innerText || cell.textContent || '') : '');

            if (value > 0) {
                rowTotals[column.key] += value;
            }
        });

        return rowTotals;
    }

    function parsePlaceTroopRowTotals(row, columns) {
        const normalTotals = parseTroopRowTotals(row, columns);
        if (hasTroopValues(normalTotals)) {
            return normalTotals;
        }

        const unitCellResult = parseTroopRowTotalsByUnitCells(row);
        if (
            unitCellResult.detectedCount >= getDirectUnitCellMinCount(columns) &&
            hasTroopValues(unitCellResult.totals)
        ) {
            return unitCellResult.totals;
        }

        const rightTotals = parseTroopRowTotalsFromRight(row, columns);

        if (hasTroopValues(rightTotals)) {
            return rightTotals;
        }

        return normalTotals;
    }

    function createTroopTotals() {
        const totals = {};

        Object.keys(TROOP_UNIT_LABELS).forEach(key => {
            totals[key] = 0;
        });

        return totals;
    }

    function addTroopTotals(target, source) {
        Object.keys(source || {}).forEach(unitKey => {
            const value = Number(source[unitKey] || 0);
            if (!value) return;

            target[unitKey] = Number(target[unitKey] || 0) + value;
        });
    }

    function cloneTroopTotals(source) {
        const totals = createTroopTotals();
        addTroopTotals(totals, source || {});
        return totals;
    }

    function maxTroopTotals(target, source) {
        Object.keys(source || {}).forEach(unitKey => {
            const value = Number(source[unitKey] || 0);
            if (!value) return;

            target[unitKey] = Math.max(Number(target[unitKey] || 0), value);
        });
    }

    function mergeTroopTotalsByMax(first, second) {
        const totals = cloneTroopTotals(first || {});
        maxTroopTotals(totals, second || {});
        return totals;
    }

    function filterTroopTotals(source, allowedUnits) {
        const totals = createTroopTotals();

        (allowedUnits || []).forEach(unitKey => {
            totals[unitKey] = Number(source && source[unitKey] || 0);
        });

        return totals;
    }

    function getDefenseTroopTotals(source) {
        return filterTroopTotals(source || {}, TROOP_DEFENSE_UNITS);
    }

    function mergeDefenseTroopTotalsByMax(first, second) {
        const totals = getDefenseTroopTotals(first || {});
        const otherTotals = getDefenseTroopTotals(second || {});

        TROOP_DEFENSE_UNITS.forEach(unitKey => {
            totals[unitKey] = Math.max(
                Number(totals[unitKey] || 0),
                Number(otherTotals[unitKey] || 0)
            );
        });

        return totals;
    }

    function subtractDefenseTroopTotals(baseTotals, ...subtractTotals) {
        const totals = getDefenseTroopTotals(baseTotals || {});

        TROOP_DEFENSE_UNITS.forEach(unitKey => {
            const subtraction = subtractTotals.reduce((sum, source) => {
                return sum + Number(source && source[unitKey] || 0);
            }, 0);

            totals[unitKey] = Math.max(0, Number(totals[unitKey] || 0) - subtraction);
        });

        return totals;
    }

    function updateAvailableDefenseTotals(summary) {
        summary.totalDefenseTotals = getDefenseTroopTotals(summary.defenseTotals || {});
        summary.supportDefenseTotals = getDefenseTroopTotals(summary.supportTotals || {});
        summary.supportStationedDefenseTotals = getDefenseTroopTotals(summary.supportStationedTotals || {});
        summary.supportTransitDefenseTotals = getDefenseTroopTotals(summary.supportTransitTotals || {});
        summary.scavengingDefenseTotals = getDefenseTroopTotals(summary.scavengingTotals || {});
        summary.availableDefenseTotals = subtractDefenseTroopTotals(
            summary.totalDefenseTotals,
            summary.supportDefenseTotals,
            summary.scavengingDefenseTotals
        );

        return summary;
    }

    function syncSupportTotalsFromBreakdown(summary) {
        const combinedSupportTotals = createTroopTotals();

        addTroopTotals(combinedSupportTotals, getDefenseTroopTotals(summary.supportStationedTotals || {}));
        addTroopTotals(combinedSupportTotals, getDefenseTroopTotals(summary.supportTransitTotals || {}));

        if (hasTroopValues(combinedSupportTotals)) {
            summary.supportTotals = combinedSupportTotals;
        }

        return summary;
    }

    function rowHasCoords(row) {
        return Boolean(parseCoords(row ? (row.innerText || row.textContent || '') : ''));
    }

    function isTotalTroopRow(rowText) {
        return [
            'total',
            'totals',
            'totais',
            'totales',
            'totaux',
            'totalt',
            'gesamt',
            'summe',
            'samlet',
            'i alt',
            'totaal',
            'totale',
            'totali',
            'razem',
            'suma',
            'celkem',
            'celkom',
            'osszesen',
            'toplam',
            'yhteensa',
            'ukupno',
            'skupaj',
            'sveukupno',
            'sucet',
            'souhrn',
            'συνολο',
            'итого',
            'всего',
            'общо'
        ].some(term => rowText.includes(term));
    }

    function isScavengingTroopOverviewRow(rowText) {
        return /busca\s+(fraca|humilde|inteligente|extrema)|scaveng|loot|haul|gather|collect|recolha|coleta|colecta|forrage|fourrage|plunder|beute|rohstoff|ressourcen|zbiorka|zbieractwo|rabunek|sber|zber|gyujt|forras|colectare|strangere|toplama|kaynak/.test(rowText);
    }

    function isKnownHomeTroopRow(rowText) {
        return [
            'desta aldeia',
            'esta aldeia',
            'this village',
            'from this village',
            'from here',
            'in this village',
            'aus diesem dorf',
            'in diesem dorf',
            'dit dorp',
            'ce village',
            'ceci village',
            'questo villaggio',
            'questo paese',
            'esta aldea',
            'esta vila',
            'z tej wioski',
            'v teto vesnici',
            'v tejto dedine',
            'din acest sat',
            'ebbol a falubol',
            'bu koyden',
            'bu koyden',
            'z tego miejsca',
            'z teto vesnice',
            'from own village',
            'own village'
        ].some(label => rowText.includes(label));
    }

    function isHomeAvailableTroopOverviewRow(rowText) {
        return isKnownHomeTroopRow(rowText) || [
            'na aldeia',
            'na vila',
            'nesta aldeia',
            'nesta vila',
            'in the village',
            'in village',
            'at home',
            'home village',
            'hier',
            'im dorf',
            'in diesem dorf',
            'in dit dorp',
            'dans ce village',
            'dans le village',
            'en esta aldea',
            'en este pueblo',
            'nel villaggio',
            'in questo villaggio',
            'w wiosce',
            'w tej wiosce',
            've vesnici',
            'v teto vesnici',
            'v dedine',
            'v tejto dedine',
            'in sat',
            'in acest sat',
            'a faluban',
            'ebben a faluban',
            'koyde',
            'bu koyde'
        ].some(label => rowText.includes(label));
    }

    function getPlaceTroopColumns(table) {
        return getTroopColumns(table);
    }

    function getPlaceTroopDataRows(table, columns) {
        return getDirectTableRows(table)
            .filter(row => !row.querySelector('th'))
            .map(row => ({
                row,
                text: getTroopOverviewRowText(row),
                totals: parsePlaceTroopRowTotals(row, columns)
            }))
            .filter(item => item.text && hasTroopValues(item.totals));
    }

    function getPlaceTroopTables(doc) {
        if (!doc || !doc.body) return [];

        return Array.from(doc.querySelectorAll('table.vis, table'))
            .map(table => ({
                table,
                columns: getPlaceTroopColumns(table)
            }))
            .filter(item => item.columns.length)
            .map(item => Object.assign(item, {
                rows: getPlaceTroopDataRows(item.table, item.columns)
            }))
            .filter(item => item.rows.length);
    }

    function isLikelyScavengingTroopTable(tableInfo) {
        const noCoordRows = tableInfo.rows.filter(item =>
            !rowHasCoords(item.row) &&
            !isTotalTroopRow(item.text) &&
            !isSupportTroopOverviewRow(item.text)
        );

        return noCoordRows.length >= 3 ||
            tableInfo.rows.some(item => isScavengingTroopOverviewRow(item.text));
    }

    function isLikelyTransitTroopTable(tableInfo) {
        return tableInfo.rows.some(item => rowHasCoords(item.row));
    }

    function getNextTableAfter(element) {
        let current = element;

        for (let i = 0; i < 8 && current; i++) {
            current = current.nextElementSibling;

            if (!current) break;
            if (current.matches && current.matches('table')) return current;

            const nestedTable = current.querySelector ? current.querySelector('table') : null;
            if (nestedTable) return nestedTable;
        }

        return null;
    }

    function getNearbyTableContextText(table) {
        const parts = [];
        let current = table ? table.previousElementSibling : null;

        for (let index = 0; index < 5 && current; index++) {
            if (current.matches && current.matches('table')) break;

            parts.push(current.innerText || current.textContent || '');
            current = current.previousElementSibling;
        }

        return normalizeSearchText(parts.reverse().join(' '));
    }

    function isTransitTroopSectionText(value) {
        const text = normalizeSearchText(value);

        return /tropas?\s+em\s+transito|em\s+transito|comandos?|commands?|in\s+transit|troops?\s+in\s+transit|bewegung|unterwegs|movimientos?|mouvements?|movimenti/.test(text);
    }

    function isSupportTransitTroopRow(rowText, row, tableContextText = '') {
        const text = normalizeSearchText(rowText);

        return isTransitTroopSectionText(tableContextText) ||
            isTransitTroopSectionText(text) ||
            /chegada|chega\s+em|chega\s+às|chega\s+as|arrives?|arrival|return|regresso|retorno|\d{1,2}:\d{2}:\d{2}/.test(text) ||
            (rowHasCoords(row) && /\b(comando|comandos|command|commands)\b/.test(text));
    }

    function findScavengingTroopTable(doc) {
        const tableInfo = getPlaceTroopTables(doc)
            .find(isLikelyScavengingTroopTable);

        return tableInfo ? tableInfo.table : null;
    }

    function findTransitTroopTable(doc) {
        const tableInfo = getPlaceTroopTables(doc)
            .find(isLikelyTransitTroopTable);

        return tableInfo ? tableInfo.table : null;
    }

    function tableHasDirectRow(table, matcher) {
        return getDirectTableRows(table).some(row => matcher(getTroopOverviewRowText(row), row));
    }

    function findHomeDefenseTroopTable(doc) {
        const tables = getPlaceTroopTables(doc);
        const knownHomeTable = tables.find(tableInfo =>
            tableInfo.rows.some(item => isKnownHomeTroopRow(item.text))
        );

        if (knownHomeTable) return knownHomeTable.table;

        const likelyHomeTable = tables.find(tableInfo =>
            !isLikelyTransitTroopTable(tableInfo) &&
            !isLikelyScavengingTroopTable(tableInfo) &&
            tableInfo.rows.some(item =>
                !rowHasCoords(item.row) &&
                !isTotalTroopRow(item.text) &&
                !isSupportTroopOverviewRow(item.text)
            )
        );

        return likelyHomeTable ? likelyHomeTable.table : null;
    }

    function parseHomeDefenseTroopTotals(doc) {
        const totals = createTroopTotals();
        const table = findHomeDefenseTroopTable(doc);

        if (!table) return totals;

        const columns = getTroopColumns(table);
        if (!columns.length) return totals;

        const rows = getDirectTableRows(table)
            .filter(row => !row.querySelector('th'));

        const homeRow = rows.find(row => {
            const rowText = getTroopOverviewRowText(row);

            return isKnownHomeTroopRow(rowText);
        }) || rows.find(row => {
            const rowText = getTroopOverviewRowText(row);

            return !rowHasCoords(row) &&
                !isTotalTroopRow(rowText) &&
                !isSupportTroopOverviewRow(rowText);
        });

        return homeRow ? parsePlaceTroopRowTotals(homeRow, columns) : totals;
    }

    function parseScavengingTroopTotals(doc) {
        const totals = createTroopTotals();

        getPlaceTroopTables(doc)
            .filter(tableInfo => tableInfo.rows.some(item => isScavengingTroopOverviewRow(item.text)))
            .forEach(tableInfo => {
                const totalRow = tableInfo.rows.find(item => isTotalTroopRow(item.text));

                if (totalRow) {
                    addTroopTotals(totals, parsePlaceTroopRowTotals(totalRow.row, tableInfo.columns));
                    return;
                }

                tableInfo.rows.forEach(item => {
                    if (!isScavengingTroopOverviewRow(item.text)) return;
                    if (rowHasCoords(item.row) || isSupportTroopOverviewRow(item.text)) return;

                    addTroopTotals(totals, item.totals);
                });
            });

        return totals;
    }

    function parseSupportTroopTotals(doc) {
        const totals = createTroopTotals();

        getPlaceTroopTables(doc)
            .filter(tableInfo => tableInfo.rows.some(item => isSupportTroopOverviewRow(item.text)))
            .forEach(tableInfo => {
                tableInfo.rows.forEach(item => {
                    if (!isSupportTroopOverviewRow(item.text)) return;
                    if (isIgnoredTroopOverviewRow(item.text)) return;
                    if (isTotalTroopRow(item.text)) return;
                    if (isScavengingTroopOverviewRow(item.text)) return;

                    addTroopTotals(totals, item.totals);
                });
            });

        return totals;
    }

    function parseSupportTroopBreakdown(doc) {
        const stationedTotals = createTroopTotals();
        const transitTotals = createTroopTotals();

        getPlaceTroopTables(doc)
            .filter(tableInfo => tableInfo.rows.some(item => isSupportTroopOverviewRow(item.text)))
            .forEach(tableInfo => {
                const tableContextText = getNearbyTableContextText(tableInfo.table);

                tableInfo.rows.forEach(item => {
                    if (!isSupportTroopOverviewRow(item.text)) return;
                    if (isIgnoredTroopOverviewRow(item.text)) return;
                    if (isTotalTroopRow(item.text)) return;
                    if (isScavengingTroopOverviewRow(item.text)) return;

                    addTroopTotals(
                        isSupportTransitTroopRow(item.text, item.row, tableContextText)
                            ? transitTotals
                            : stationedTotals,
                        item.totals
                    );
                });
            });

        return {
            stationedTotals,
            transitTotals
        };
    }

    function parseTransitTroopTotals(doc) {
        const totals = createTroopTotals();

        getPlaceTroopTables(doc)
            .filter(tableInfo => tableInfo.rows.some(item => rowHasCoords(item.row)))
            .forEach(tableInfo => {
                tableInfo.rows.forEach(item => {
                    if (!rowHasCoords(item.row)) return;
                    if (isIgnoredTroopOverviewRow(item.text)) return;
                    if (isTotalTroopRow(item.text)) return;
                    if (isSupportTroopOverviewRow(item.text)) return;
                    if (isScavengingTroopOverviewRow(item.text)) return;

                    addTroopTotals(totals, item.totals);
                });
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
        const coords = parseCoords(row ? (row.innerText || row.textContent || '') : '');
        return coords ? coords.text : '';
    }

    function getTroopOverviewRowText(row) {
        if (!row) return '';

        const imgTexts = Array.from(row.querySelectorAll('img'))
            .map(img => [
                img.getAttribute('src') || '',
                img.getAttribute('title') || '',
                img.getAttribute('alt') || '',
                img.className || ''
            ].join(' '))
            .join(' ');

        return normalizeSearchText([
            row.innerText || row.textContent || '',
            row.className || '',
            imgTexts
        ].join(' '));
    }

    function isIgnoredTroopOverviewRow(rowText) {
        return !rowText ||
            /\b(selecionar|seleccionar|select|auswahlen|auswaehlen|wybierz|vybrat|seleccionar|seleccion|selecteaza|kivalaszt|sec|secin)\b/.test(rowText);
    }

    function isSupportTroopOverviewRow(rowText) {
        return /\b(apoio|apoios|apoiar|apoiando|suporte|suportes|support|supports|supporting|reforco|reforcos|reinforcement|reinforcements|unterstutzung|unterstuetzung|verstarkung|verstaerkung|ondersteuning|soutien|renfort|apoyo|apoyos|rinforzo|rinforzi|wsparcie|posilky|podpora|sprijin|suport|tamogatas|erosites|stotte|stod|stöd|tuki|destek)\b/.test(rowText);
    }

    function isSupportDetailTroopRow(rowText, row) {
        if (!row || !row.querySelector('input[type="checkbox"]')) return false;
        if (isTotalTroopRow(rowText)) return false;
        if (isOwnTroopOverviewRow(rowText)) return false;
        if (isHomeAvailableTroopOverviewRow(rowText)) return false;
        if (isScavengingTroopOverviewRow(rowText)) return false;

        return rowHasCoords(row);
    }

    function getSupportSectionTroopColumns(table) {
        const info = getTroopTableGridInfo(table);
        let bestColumns = [];

        if (!info || !info.rows) return bestColumns;

        info.rows.forEach((row, rowIndex) => {
            Array.from(row.children).forEach(cell => {
                const cellText = getTroopOverviewRowText(cell);
                const range = getVirtualCellRange(table, rowIndex, cell);

                if (!range || range.end <= range.start) return;
                if (!isSupportTroopOverviewRow(cellText)) return;

                const columns = getTroopColumnsInVirtualRange(table, range.start, range.end);

                if (columns.length > bestColumns.length) {
                    bestColumns = columns;
                }
            });
        });

        return bestColumns;
    }

    function parseSupportSectionTroopTotalsFromTable(table) {
        const totals = createTroopTotals();
        const columns = getSupportSectionTroopColumns(table);

        if (!columns.length) return totals;

        const rows = getDirectTableRows(table)
            .filter(row => !row.querySelector('th'));

        rows.forEach(row => {
            const rowText = getTroopOverviewRowText(row);

            if (isIgnoredTroopOverviewRow(rowText)) return;
            if (!isTotalTroopRow(rowText)) return;

            addTroopTotals(totals, parseTroopRowTotals(row, columns));
        });

        return getDefenseTroopTotals(totals);
    }

    function getBestTroopTableAndColumns(doc) {
        const preferredTable = doc.querySelector('#units_table');
        const tables = preferredTable
            ? [preferredTable]
            : Array.from(doc.querySelectorAll('table.vis, table'));
        let bestTable = null;
        let bestColumns = [];

        tables.forEach(table => {
            const columns = getTroopColumns(table);
            if (columns.length > bestColumns.length) {
                bestTable = table;
                bestColumns = columns;
            }
        });

        return { bestTable, bestColumns };
    }

    function parseSupportOverviewStationedTroopTotals(doc) {
        const totals = createTroopTotals();
        const { bestTable, bestColumns } = getBestTroopTableAndColumns(doc);

        if (!bestTable || !bestColumns.length) return totals;

        getDirectTableRows(bestTable)
            .filter(row => !row.querySelector('th'))
            .forEach(row => {
                const rowText = getTroopOverviewRowText(row);

                if (isIgnoredTroopOverviewRow(rowText)) return;
                if (isTotalTroopRow(rowText)) return;
                if (isHomeAvailableTroopOverviewRow(rowText)) return;
                if (!row.querySelector('input[type="checkbox"]')) return;

                const rowTotals = parsePlaceTroopRowTotals(row, bestColumns);

                if (!hasTroopValues(rowTotals)) return;

                addTroopTotals(totals, getDefenseTroopTotals(rowTotals));
            });

        return getDefenseTroopTotals(totals);
    }

    function isOwnTroopOverviewRow(rowText) {
        return [
            'as suas proprias',
            'suas proprias',
            'tropas proprias',
            'proprias',
            'own troops',
            'your own',
            'own units',
            'eigene truppen',
            'eigene',
            'wlasne',
            'wlasnych',
            'vlastni',
            'vlastne',
            'propias',
            'proprie',
            'propres',
            'eigen troepen',
            'eigen',
            'sajat',
            'kendi'
        ].some(label => rowText.includes(label));
    }

    function hasTroopValues(rowTotals) {
        return Object.keys(rowTotals || {}).some(unitKey => Number(rowTotals[unitKey] || 0) > 0);
    }

    function getTroopScanExpectedVillageCount(summary, parsedCount) {
        return Math.max(
            Number(getPlayerVillageCount() || 0),
            Number(summary?.villageCount || 0),
            Number(parsedCount || 0)
        );
    }

    function getMinimumTroopScanCount(expectedCount) {
        const expected = Number(expectedCount || 0);

        if (expected <= 1) return Math.max(1, expected);
        if (expected <= 4) return expected;

        return Math.max(1, Math.ceil(expected * TROOP_SCAN_MIN_COVERAGE));
    }

    function hasReliableTroopCoverage(scannedCount, expectedCount) {
        const scanned = Number(scannedCount || 0);
        const expected = Number(expectedCount || 0);

        if (!expected) return scanned > 0;

        return scanned >= getMinimumTroopScanCount(expected);
    }

    function isTroopSummaryOverviewReliable(summary) {
        if (!summary || summary.overviewScanIncomplete) return false;

        const parsedCount = Number(summary.parsedVillageCount || summary.villages?.length || 0);
        const expectedCount = Number(summary.expectedVillageCount || summary.villageCount || parsedCount);

        return hasReliableTroopCoverage(parsedCount, expectedCount);
    }

    function isTroopSummaryDefenseReliable(summary) {
        return Boolean(
            isTroopSummaryOverviewReliable(summary) &&
            hasTroopValues(getDefenseTroopTotals(summary.defenseTotals || {}))
        );
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

    function getAcademyNobleNumberRows(doc) {
        if (!doc || !doc.body) return [];

        let bestRows = [];
        let bestScore = 0;
        let bestHasNobleContext = false;

        Array.from(doc.querySelectorAll('table')).forEach(table => {
            const tableText = normalizeSearchText([
                table.innerText || table.textContent || '',
                table.innerHTML || ''
            ].join(' '));
            const numericRows = Array.from(table.querySelectorAll('tr'))
                .map(row => {
                    const cells = Array.from(row.children);
                    if (cells.length < 2) return null;

                    const label = normalizeSearchText(cells[0].innerText || cells[0].textContent || '');
                    const valueText = cleanText(cells[cells.length - 1].innerText || cells[cells.length - 1].textContent || '');
                    const valueMatch = valueText.match(/\d[\d.\s]*/);

                    if (!label || !valueMatch) return null;

                    return {
                        label,
                        value: parseResourceNumber(valueMatch[0])
                    };
                })
                .filter(Boolean);

            if (numericRows.length < 4) return;

            const hasNobleContext = /\b(snob|noble|nobles|nobre|nobres|nobleman|noblemen|adel|adels|szlach|nobil|nobili)\b/.test(tableText);
            const score = numericRows.length + (hasNobleContext ? 10 : 0);

            if (
                (hasNobleContext && !bestHasNobleContext) ||
                (hasNobleContext === bestHasNobleContext && score > bestScore)
            ) {
                bestScore = score;
                bestHasNobleContext = hasNobleContext;
                bestRows = numericRows;
            }
        });

        return bestRows;
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

        const numericRows = getAcademyNobleNumberRows(doc);
        if (numericRows.length >= 4) {
            return numericRows[numericRows.length - 1].value;
        }

        return null;
    }

    function parseAcademyNumberByLabels(doc, labels) {
        if (!doc || !doc.body) return null;

        const rows = Array.from(doc.querySelectorAll('tr'));

        for (const row of rows) {
            const cells = Array.from(row.children);
            if (cells.length < 2) continue;

            const label = normalizeSearchText(cells[0].innerText || cells[0].textContent || '');
            if (!labels.some(item => label.includes(item))) continue;

            const valueText = cleanText(cells[cells.length - 1].innerText || cells[cells.length - 1].textContent || '');
            const valueMatch = valueText.match(/\d[\d.\s]*/);

            if (valueMatch) {
                return parseResourceNumber(valueMatch[0]);
            }
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
            nobleLimit: parseAcademyNumberByLabels(doc, ['limite de nobres', 'noble limit']),
            existingNobles: null,
            noblesInProduction: parseAcademyNumberByLabels(doc, ['nobres em producao', 'nobre em producao', 'nobles in production', 'noble in production']),
            conqueredVillages: parseAcademyNumberByLabels(doc, ['numero de aldeias conquistadas', 'aldeias conquistadas', 'conquered villages', 'conquered village']),
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

        if (counts.existingNobles === null) {
            const numericRows = getAcademyNobleNumberRows(doc);
            if (numericRows.length >= 2) {
                counts.existingNobles = numericRows[1].value;
            }
        }

        return counts;
    }

    function getPlausibleAcademyNobleCeiling(academyAvailability) {
        const nobleLimit = Number(academyAvailability?.nobleLimit);
        const conqueredVillages = Number(academyAvailability?.conqueredVillages);
        const existingNobles = Number(academyAvailability?.existingNobles);
        const noblesInProduction = Number(academyAvailability?.noblesInProduction || 0);
        const canMake = Number(academyAvailability?.canMake);

        if (Number.isFinite(nobleLimit) && nobleLimit > 0 && Number.isFinite(conqueredVillages) && conqueredVillages >= 0) {
            return Math.max(0, nobleLimit - conqueredVillages);
        }

        if (
            Number.isFinite(existingNobles) && existingNobles >= 0 &&
            Number.isFinite(canMake) && canMake >= 0
        ) {
            return existingNobles + noblesInProduction + canMake;
        }

        return null;
    }

    function getPlausibleTroopNobleCeiling(academyAvailability) {
        const academyCeiling = getPlausibleAcademyNobleCeiling(academyAvailability);
        const academyExisting = Number(academyAvailability?.existingNobles);

        if (academyCeiling !== null) {
            return Math.max(Number.isFinite(academyExisting) ? academyExisting : 0, academyCeiling);
        }

        const villageCount = Number(getPlayerVillageCount() || 0);

        if (Number.isFinite(villageCount) && villageCount > 0) {
            return Math.max(20, villageCount * 5);
        }

        return 500;
    }

    function getReliableCurrentNobles(academyAvailability, troopNobles) {
        const academyExisting = academyAvailability?.existingNobles;
        const troopCount = Number(troopNobles || 0);
        const troopCeiling = getPlausibleTroopNobleCeiling(academyAvailability);
        const hasPlausibleTroopCount =
            Number.isFinite(troopCount) &&
            troopCount > 0 &&
            troopCount <= troopCeiling;

        if (academyExisting !== null && academyExisting !== undefined) {
            const academyCount = Number(academyExisting || 0);

            if (hasPlausibleTroopCount && troopCount > academyCount) {
                return troopCount;
            }

            return academyCount;
        }

        return hasPlausibleTroopCount ? troopCount : null;
    }

    function getBestTroopNobleCount(troopsSummary, academyAvailability) {
        const troopCeiling = getPlausibleTroopNobleCeiling(academyAvailability);
        const candidates = [
            Number(troopsSummary?.attackTotals?.snob || 0),
            Number(troopsSummary?.totals?.snob || 0)
        ];

        (troopsSummary?.villages || []).forEach(village => {
            candidates.push(Number(village?.attackTotals?.snob || 0));
            candidates.push(Number(village?.totals?.snob || 0));
        });

        const plausible = candidates.filter(value =>
            Number.isFinite(value) &&
            value > 0 &&
            value <= troopCeiling
        );

        return plausible.length ? Math.max(...plausible) : 0;
    }

    function getReliableCanMakeNobles(academyAvailability) {
        const directCanMake = academyAvailability?.canMake;

        if (directCanMake !== null && directCanMake !== undefined) {
            return Number(directCanMake || 0);
        }

        const nobleLimit = Number(academyAvailability?.nobleLimit);
        const conqueredVillages = Number(academyAvailability?.conqueredVillages);
        const existingNobles = Number(academyAvailability?.existingNobles);
        const noblesInProduction = Number(academyAvailability?.noblesInProduction || 0);

        if (
            Number.isFinite(nobleLimit) &&
            Number.isFinite(conqueredVillages) &&
            Number.isFinite(existingNobles)
        ) {
            return Math.max(0, nobleLimit - conqueredVillages - existingNobles - noblesInProduction);
        }

        return null;
    }

    async function getAcademyNoblesAvailable() {
        try {
            const currentAcademyDoc = await fetchAcademyDocument();
            const currentCounts = parseAcademyNobleCounts(currentAcademyDoc);

            if (currentCounts.canMake !== null || currentCounts.existingNobles !== null) {
                return {
                    canMake: currentCounts.canMake,
                    existingNobles: currentCounts.existingNobles,
                    noblesInProduction: currentCounts.noblesInProduction,
                    nobleLimit: currentCounts.nobleLimit,
                    conqueredVillages: currentCounts.conqueredVillages,
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
                            noblesInProduction: counts.noblesInProduction,
                            nobleLimit: counts.nobleLimit,
                            conqueredVillages: counts.conqueredVillages,
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
                noblesInProduction: null,
                nobleLimit: null,
                conqueredVillages: null,
                academyVillageCount: academyVillageIds.length,
                source: 'Academia'
            };
        } catch (error) {
            console.warn('[TW] Erro ao procurar academias:', error);
        }

        return {
            canMake: null,
            existingNobles: null,
            noblesInProduction: null,
            nobleLimit: null,
            conqueredVillages: null,
            academyVillageCount: null,
            source: 'Academia'
        };
    }

    function parseTroopsOverview(doc) {
        const preferredTable = doc.querySelector('#units_table');
        const tables = preferredTable
            ? [preferredTable]
            : Array.from(doc.querySelectorAll('table.vis, table'));
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
        const attackTotals = createTroopTotals();
        const defenseTotals = createTroopTotals();
        const supportTotals = createTroopTotals();
        const supportStationedTotals = createTroopTotals();
        const supportTransitTotals = createTroopTotals();
        const scavengingTotals = createTroopTotals();
        const rows = getDirectTableRows(bestTable)
            .filter(row => !row.querySelector('th'));

        const villageKeys = new Set();
        const villagesByKey = new Map();
        let currentVillageKey = '';
        let currentVillageId = '';

        rows.forEach(row => {
            const detectedVillageKey = getRowCoordsKey(row);
            const detectedVillageId = detectedVillageKey ? getRowVillageId(row) : '';
            const rowText = getTroopOverviewRowText(row);

            if (isIgnoredTroopOverviewRow(rowText)) return;
            if (isSupportDetailTroopRow(rowText, row)) return;

            if (detectedVillageKey) {
                currentVillageKey = detectedVillageKey;
                currentVillageId = detectedVillageId || currentVillageId;
                villageKeys.add(detectedVillageKey);

                if (!villagesByKey.has(detectedVillageKey)) {
                    villagesByKey.set(detectedVillageKey, {
                        key: detectedVillageKey,
                        id: detectedVillageId,
                        totals: createTroopTotals(),
                        attackTotals: createTroopTotals(),
                        defenseTotals: createTroopTotals(),
                        fallbackTotals: createTroopTotals(),
                        hasAttackRow: false,
                        hasDefenseRow: false,
                        hasTotalRow: false
                    });
                } else if (detectedVillageId && !villagesByKey.get(detectedVillageKey).id) {
                    villagesByKey.get(detectedVillageKey).id = detectedVillageId;
                }
            }

            const villageKey = detectedVillageKey || currentVillageKey;
            const rowTotals = parsePlaceTroopRowTotals(row, bestColumns);

            if (!hasTroopValues(rowTotals)) return;

            if (isSupportTroopOverviewRow(rowText)) {
                addTroopTotals(supportTotals, getDefenseTroopTotals(rowTotals));
                addTroopTotals(
                    isSupportTransitTroopRow(rowText, row) ? supportTransitTotals : supportStationedTotals,
                    getDefenseTroopTotals(rowTotals)
                );
                return;
            }

            if (isScavengingTroopOverviewRow(rowText)) {
                addTroopTotals(scavengingTotals, getDefenseTroopTotals(rowTotals));
                return;
            }

            if (!villageKey) return;

            if (!villagesByKey.has(villageKey)) {
                villagesByKey.set(villageKey, {
                    key: villageKey,
                    id: detectedVillageId || currentVillageId,
                    totals: createTroopTotals(),
                    attackTotals: createTroopTotals(),
                    defenseTotals: createTroopTotals(),
                    fallbackTotals: createTroopTotals(),
                    hasAttackRow: false,
                    hasDefenseRow: false,
                    hasTotalRow: false
                });
            }

            const village = villagesByKey.get(villageKey);

            if (detectedVillageId && !village.id) {
                village.id = detectedVillageId;
            }

            if (isTotalTroopRow(rowText)) {
                village.totals = rowTotals;
                village.attackTotals = rowTotals;
                village.hasAttackRow = true;
                village.hasTotalRow = true;
                return;
            }

            if (!village.hasDefenseRow && isHomeAvailableTroopOverviewRow(rowText)) {
                village.defenseTotals = getDefenseTroopTotals(rowTotals);
                village.hasDefenseRow = true;
            }

            if (
                !village.hasAttackRow &&
                (detectedVillageKey || isOwnTroopOverviewRow(rowText))
            ) {
                village.attackTotals = rowTotals;
                village.hasAttackRow = true;
            }

            if (!village.hasTotalRow) {
                maxTroopTotals(village.fallbackTotals, rowTotals);
            }
        });

        const supportSectionTotals = parseSupportSectionTroopTotalsFromTable(bestTable);

        if (hasTroopValues(supportSectionTotals)) {
            maxTroopTotals(supportStationedTotals, supportSectionTotals);
        }

        const supportTotalsForSummary = createTroopTotals();
        addTroopTotals(supportTotalsForSummary, supportStationedTotals);
        addTroopTotals(supportTotalsForSummary, supportTransitTotals);

        const villages = Array.from(villagesByKey.values())
            .map(village => {
                if (!village.hasTotalRow && hasTroopValues(village.fallbackTotals)) {
                    village.totals = village.fallbackTotals;
                }

                if (!village.hasAttackRow || !hasTroopValues(village.attackTotals)) {
                    village.attackTotals = village.totals;
                }

                delete village.fallbackTotals;
                delete village.hasAttackRow;
                delete village.hasDefenseRow;
                delete village.hasTotalRow;

                addTroopTotals(totals, village.totals);
                addTroopTotals(attackTotals, village.attackTotals);
                addTroopTotals(defenseTotals, getDefenseTroopTotals(village.totals));
                return village;
            });

        const parsedVillageCount = villageKeys.size || villages.length;

        return {
            totals,
            attackTotals,
            defenseTotals,
            supportTotals: supportTotalsForSummary,
            supportStationedTotals,
            supportTransitTotals,
            scavengingTotals,
            villages,
            attackFullCounter: calculateAttackFullCounterByVillage(villages),
            villageCount: getPlayerVillageCount() || parsedVillageCount || rows.length,
            parsedVillageCount,
            expectedVillageCount: getTroopScanExpectedVillageCount(null, parsedVillageCount),
            troopColumns: bestColumns.map(column => column.key)
        };
    }

    async function enrichTroopsSummaryWithScavenging(summary) {
        if (!summary || !Array.isArray(summary.villages)) return summary;

        const seenVillageIds = new Set();
        const villages = summary.villages.filter(village => {
            const id = String(village && village.id || '');

            if (!id || seenVillageIds.has(id)) return false;

            seenVillageIds.add(id);
            return true;
        }).map(village => {
            return Object.assign({}, village, {
                totals: cloneTroopTotals(village.totals),
                attackTotals: cloneTroopTotals(village.attackTotals),
                defenseTotals: village.defenseTotals
                    ? cloneTroopTotals(village.defenseTotals)
                    : undefined
            });
        });

        const originalVillages = summary.villages.map(village => {
            return Object.assign({}, village, {
                totals: cloneTroopTotals(village.totals),
                attackTotals: cloneTroopTotals(village.attackTotals),
                defenseTotals: village.defenseTotals
                    ? cloneTroopTotals(village.defenseTotals)
                    : undefined
            });
        });
        const overviewDefenseTotals = getDefenseTroopTotals(summary.defenseTotals);
        const overviewSupportTotals = getDefenseTroopTotals(summary.supportTotals);
        const overviewSupportStationedTotals = getDefenseTroopTotals(summary.supportStationedTotals);
        const overviewSupportTransitTotals = getDefenseTroopTotals(summary.supportTransitTotals);
        const overviewScavengingTotals = getDefenseTroopTotals(summary.scavengingTotals);
        const hasOverviewDefenseTotals = hasTroopValues(overviewDefenseTotals);
        const expectedVillageCount = getTroopScanExpectedVillageCount(summary, originalVillages.length);

        summary.parsedVillageCount = originalVillages.length;
        summary.expectedVillageCount = expectedVillageCount;

        if (!hasReliableTroopCoverage(originalVillages.length, expectedVillageCount)) {
            summary.overviewScanIncomplete = true;
            summary.placeScanIncomplete = true;
            summary.defenseTotals = overviewDefenseTotals;
            summary.supportTotals = overviewSupportTotals;
            summary.supportStationedTotals = overviewSupportStationedTotals;
            summary.supportTransitTotals = overviewSupportTransitTotals;
            summary.scavengingTotals = overviewScavengingTotals;
            summary.placeVillageCount = 0;
            summary.scavengingVillageCount = 0;
            summary.attackFullCounter = calculateAttackFullCounterByVillage(originalVillages);
            console.warn('[TW] Leitura de tropas ignorada por estar incompleta:', originalVillages.length, '/', expectedVillageCount);
            return updateAvailableDefenseTotals(syncSupportTotalsFromBreakdown(summary));
        }

        const rebuiltTotals = createTroopTotals();
        const rebuiltAttackTotals = createTroopTotals();
        const rebuiltDefenseTotals = createTroopTotals();
        const rebuiltSupportTotals = createTroopTotals();
        const rebuiltSupportStationedTotals = createTroopTotals();
        const rebuiltSupportTransitTotals = createTroopTotals();
        const rebuiltScavengingTotals = createTroopTotals();
        const rebuiltVillages = [];
        let placeVillageCount = 0;
        let movementVillageCount = 0;

        for (const village of villages) {
            try {
                const doc = await fetchPlaceUnitsDocument(village.id);

                if (isTwVerificationPage(doc)) {
                    pauseForVerification('Praca de Reunioes');
                    break;
                }

                const homeTotals = parseHomeDefenseTroopTotals(doc);
                const homeDefenseTotals = getDefenseTroopTotals(homeTotals);
                const scavengingTotals = parseScavengingTroopTotals(doc);
                const scavengingDefenseTotals = getDefenseTroopTotals(scavengingTotals);
                const supportBreakdown = parseSupportTroopBreakdown(doc);
                const supportStationedDefenseTotals = getDefenseTroopTotals(supportBreakdown.stationedTotals);
                const supportTransitDefenseTotals = getDefenseTroopTotals(supportBreakdown.transitTotals);
                const supportTotals = createTroopTotals();
                addTroopTotals(supportTotals, supportStationedDefenseTotals);
                addTroopTotals(supportTotals, supportTransitDefenseTotals);
                const supportDefenseTotals = getDefenseTroopTotals(supportTotals);
                const transitTotals = parseTransitTroopTotals(doc);
                const placeTotals = createTroopTotals();
                const defenseTotals = createTroopTotals();
                const overviewAttackTotals = Object.assign(
                    createTroopTotals(),
                    village.attackTotals || village.totals || {}
                );

                addTroopTotals(defenseTotals, homeDefenseTotals);
                addTroopTotals(placeTotals, homeTotals);
                addTroopTotals(placeTotals, scavengingTotals);
                addTroopTotals(placeTotals, transitTotals);
                addTroopTotals(rebuiltSupportTotals, supportDefenseTotals);
                addTroopTotals(rebuiltSupportStationedTotals, supportStationedDefenseTotals);
                addTroopTotals(rebuiltSupportTransitTotals, supportTransitDefenseTotals);
                addTroopTotals(rebuiltScavengingTotals, scavengingDefenseTotals);

                const attackTotals = hasTroopValues(overviewAttackTotals)
                    ? overviewAttackTotals
                    : placeTotals;

                if (hasTroopValues(placeTotals)) {
                    village.totals = placeTotals;
                    village.attackTotals = attackTotals;
                    village.defenseTotals = defenseTotals;
                    rebuiltVillages.push(village);
                    addTroopTotals(rebuiltTotals, placeTotals);
                    addTroopTotals(rebuiltAttackTotals, attackTotals);
                    if (hasTroopValues(defenseTotals)) {
                        addTroopTotals(rebuiltDefenseTotals, defenseTotals);
                    }
                } else {
                    village.attackTotals = hasTroopValues(overviewAttackTotals)
                        ? overviewAttackTotals
                        : village.totals;
                    village.defenseTotals = defenseTotals;
                    rebuiltVillages.push(village);
                    addTroopTotals(rebuiltTotals, village.totals);
                    addTroopTotals(rebuiltAttackTotals, village.attackTotals);
                    if (hasTroopValues(defenseTotals)) {
                        addTroopTotals(rebuiltDefenseTotals, defenseTotals);
                    }
                }

                placeVillageCount += 1;

                if (hasTroopValues(scavengingTotals) || hasTroopValues(transitTotals)) {
                    movementVillageCount += 1;
                }
            } catch (error) {
                console.warn('[TW] Erro ao carregar tropas da Praca de Reunioes da aldeia:', village.id, error);
            }

            if (villages.length > 1) {
                await delay(150);
            }
        }

        const hasCompletePlaceScan =
            rebuiltVillages.length >= originalVillages.length &&
            hasReliableTroopCoverage(rebuiltVillages.length, expectedVillageCount);

        if (hasCompletePlaceScan) {
            summary.totals = rebuiltTotals;
            summary.attackTotals = rebuiltAttackTotals;
            summary.defenseTotals = hasOverviewDefenseTotals
                ? mergeDefenseTroopTotalsByMax(overviewDefenseTotals, rebuiltDefenseTotals)
                : getDefenseTroopTotals(rebuiltDefenseTotals);
            summary.supportTotals = hasTroopValues(rebuiltSupportTotals)
                ? mergeDefenseTroopTotalsByMax(overviewSupportTotals, rebuiltSupportTotals)
                : overviewSupportTotals;
            summary.supportStationedTotals = mergeDefenseTroopTotalsByMax(
                overviewSupportStationedTotals,
                rebuiltSupportStationedTotals
            );
            summary.supportTransitTotals = mergeDefenseTroopTotalsByMax(
                overviewSupportTransitTotals,
                rebuiltSupportTransitTotals
            );
            summary.scavengingTotals = hasTroopValues(rebuiltScavengingTotals)
                ? getDefenseTroopTotals(rebuiltScavengingTotals)
                : overviewScavengingTotals;
            summary.villages = rebuiltVillages;
            summary.placeScanIncomplete = false;
        } else {
            summary.totals = cloneTroopTotals(summary.totals);
            summary.attackTotals = cloneTroopTotals(summary.attackTotals);
            summary.defenseTotals = getDefenseTroopTotals(overviewDefenseTotals);
            summary.supportTotals = overviewSupportTotals;
            summary.supportStationedTotals = overviewSupportStationedTotals;
            summary.supportTransitTotals = overviewSupportTransitTotals;
            summary.scavengingTotals = overviewScavengingTotals;
            summary.villages = originalVillages;
            summary.placeScanIncomplete = true;
            console.warn('[TW] Leitura da Praca de Reunioes ignorada por estar incompleta:', rebuiltVillages.length, '/', expectedVillageCount);
        }

        summary.placeVillageCount = placeVillageCount;
        summary.scavengingVillageCount = movementVillageCount;
        summary.attackFullCounter = calculateAttackFullCounterByVillage(summary.villages);

        return updateAvailableDefenseTotals(syncSupportTotalsFromBreakdown(summary));
    }

    async function buildTroopsOverviewSummary() {
        const doc = await fetchTroopsOverviewDocument('complete');
        const summary = parseTroopsOverview(doc);

        if (!summary) return null;

        try {
            const supportUrl = findTroopsOverviewSupportUrl(doc);
            const supportDoc = await fetchCleanDocument(supportUrl);

            if (isTwVerificationPage(supportDoc)) {
                pauseForVerification('Visao de suporte');
                return null;
            }

            const supportStationedTotals = parseSupportOverviewStationedTroopTotals(supportDoc);

            console.log('[TW] Apoios estacionados lidos da visao de suporte:', {
                url: supportUrl,
                totais: supportStationedTotals
            });

            if (hasTroopValues(supportStationedTotals)) {
                summary.supportStationedTotals = mergeDefenseTroopTotalsByMax(
                    summary.supportStationedTotals,
                    supportStationedTotals
                );
                syncSupportTotalsFromBreakdown(summary);
            }
        } catch (error) {
            console.warn('[TW] Erro ao carregar visao de suporte:', error);
        }

        return enrichTroopsSummaryWithScavenging(summary);
    }

    function getNumberLocale() {
        try {
            if (navigator.languages && navigator.languages.length) {
                return navigator.languages[0];
            }

            return navigator.language || 'pt-PT';
        } catch (_) {
            return 'pt-PT';
        }
    }

    function formatTroopNumber(value) {
        return Number(value || 0).toLocaleString(getNumberLocale());
    }

    function formatOptionalTroopNumber(value) {
        if (value === null || value === undefined || value === '') {
            return 'N/A';
        }

        const number = Number(value);

        return Number.isFinite(number)
            ? formatTroopNumber(number)
            : 'N/A';
    }

    function sumTroopUnits(totals, units) {
        return units.reduce((sum, unit) => sum + Number(totals[unit] || 0), 0);
    }

    function calculateAttackFullCounter(villages) {
        return calculateAttackFullCounterByVillage(villages);
    }

    function getAttackFullTier(totals) {
        const vikings = Number(totals?.axe || 0);
        const light = Number(totals?.light || 0);

        if (!vikings || !light) return '';

        if (vikings >= ATTACK_FULL_AXE && light >= ATTACK_FULL_LIGHT) {
            return 'complete';
        }

        if (vikings >= ATTACK_HALF_AXE && light >= ATTACK_HALF_LIGHT) {
            return 'half';
        }

        return 'small';
    }

    function calculateAttackFullCounterByVillage(villages) {
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
            const totals = village.attackTotals || village.totals || {};
            const tier = getAttackFullTier(totals);

            if (!tier) return;
            counter.attackVillages += 1;

            if (tier === 'complete') {
                counter.completeFulls += 1;
                counter.completeVillages += 1;
                return;
            }

            if (tier === 'half') {
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

    function formatDefenseTroopLines(totals, options = {}) {
        const source = getDefenseTroopTotals(totals || {});
        const reference = getDefenseTroopTotals(options.referenceTotals || {});
        const includeZeroForReference = Boolean(options.includeZeroForReference);
        const lines = TROOP_DEFENSE_DISPLAY_UNITS
            .filter(unit => {
                if (Number(source[unit] || 0) > 0) return true;
                return includeZeroForReference && Number(reference[unit] || 0) > 0;
            })
            .map(unit => `${TROOP_UNIT_LABELS[unit]}: **${formatTroopNumber(source[unit])}**`);

        return lines.length ? lines.join('\n') : 'Sem tropas.';
    }

    function buildSimpleDefenseTroopSummaryEmbed(summary) {
        const totalDefense = getDefenseTroopTotals(summary.totalDefenseTotals || summary.defenseTotals || {});
        const supportDefense = getDefenseTroopTotals(summary.supportDefenseTotals || summary.supportTotals || {});
        const supportStationedDefense = getDefenseTroopTotals(summary.supportStationedDefenseTotals || summary.supportStationedTotals || {});
        const supportTransitDefense = getDefenseTroopTotals(summary.supportTransitDefenseTotals || summary.supportTransitTotals || {});
        const scavengingDefense = getDefenseTroopTotals(summary.scavengingDefenseTotals || summary.scavengingTotals || {});
        const availableDefense = getDefenseTroopTotals(
            summary.availableDefenseTotals || subtractDefenseTroopTotals(totalDefense, supportDefense, scavengingDefense)
        );

        return {
            title: '🛡️ ━━ DEFESA DISPONÍVEL ━━ 🛡️',
            color: 5763719,
            description: [
                '━━━━━━━━━━━━━━━━━━━━',
                '🛡️ **Jogador**',
                `**${getDefenderValue()}**`,
                `Tribo: ${formatTribe(summary.defenderTribe)}`,
                '',
                '🛡️ **Defesa Total**',
                formatDefenseTroopLines(totalDefense),
                '',
                '🤝 **Em Apoios - a apoiar**',
                formatDefenseTroopLines(supportStationedDefense),
                '',
                '🚚 **Em Apoios - a caminho**',
                formatDefenseTroopLines(supportTransitDefense),
                '',
                '🌾 **Em Coleta**',
                formatDefenseTroopLines(scavengingDefense),
                '',
                '✅ **Disponível**',
                formatDefenseTroopLines(availableDefense, {
                    referenceTotals: totalDefense,
                    includeZeroForReference: true
                })
            ].join('\n'),
            footer: { text: 'Tribal Wars' },
            timestamp: new Date().toISOString()
        };
    }

    async function buildNobleCounterSummary() {
        const troopsSummary = await buildTroopsOverviewSummary();

        if (!troopsSummary || !troopsSummary.villageCount || !isTroopSummaryOverviewReliable(troopsSummary)) {
            return null;
        }

        const academyAvailability = await getAcademyNoblesAvailable();
        const troopNobles = getBestTroopNobleCount(troopsSummary, academyAvailability);

        return {
            currentNobles: getReliableCurrentNobles(academyAvailability, troopNobles),
            villageCount: getPlayerVillageCount() || troopsSummary.villageCount,
            defenderTribe: await getPlayerTribe(getDefenderProfileUrl()),
            canMake: getReliableCanMakeNobles(academyAvailability),
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
                        `Nobres atuais: **${formatOptionalTroopNumber(summary.currentNobles)}**`,
                        `Nobres que ainda podem ser feitos: **${canMakeText}**`
                    ].join('\n'),
                    inline: false
                }
            ],
            footer: { text: 'Tribal Wars' },
            timestamp: new Date().toISOString()
        };
    }

    async function buildCombinedCountersSummary() {
        const troopsSummary = await buildTroopsOverviewSummary();

        if (!troopsSummary || !troopsSummary.villageCount || !isTroopSummaryOverviewReliable(troopsSummary)) {
            console.warn('[TW] Contador de fulls/nobres ignorado por leitura incompleta de tropas.');
            return null;
        }

        const [defenderTribe, academyAvailability] = await Promise.all([
            getPlayerTribe(getDefenderProfileUrl()),
            getAcademyNoblesAvailable()
        ]);

        troopsSummary.defenderTribe = defenderTribe;
        const troopNobles = getBestTroopNobleCount(troopsSummary, academyAvailability);

        return {
            attackFulls: troopsSummary,
            nobleCounter: {
                currentNobles: getReliableCurrentNobles(academyAvailability, troopNobles),
                villageCount: getPlayerVillageCount() || troopsSummary.villageCount,
                defenderTribe,
                canMake: getReliableCanMakeNobles(academyAvailability),
                academyVillageCount: academyAvailability.academyVillageCount,
                academySource: academyAvailability.source
            }
        };
    }

    function buildCombinedCountersEmbed(summary) {
        const attackFulls = summary.attackFulls || {};
        const nobleCounter = summary.nobleCounter || {};
        const counter = attackFulls.attackFullCounter || calculateAttackFullCounterByVillage(attackFulls.villages || []);
        const canMakeText = nobleCounter.canMake === null
            ? 'N/A'
            : formatTroopNumber(nobleCounter.canMake);

        return {
            title: '⚔️ ━━ FULLS DE ATAQUE E NOBRES ━━ 👑',
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
                        `Nobres atuais: **${formatOptionalTroopNumber(nobleCounter.currentNobles)}**`,
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
            footer: { text: 'Tribal Wars' },
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
        const summary = await buildCombinedCountersSummary();

        if (!summary) {
            console.log('[TW] Sem dados para contador de fulls de ataque e nobres.');
            return false;
        }

        queueDiscordEmbed(
            buildCombinedCountersEmbed(summary),
            'TW Attack Fulls',
            getCombinedCountersWebhook()
        );

        console.log('[TW] Contador de fulls de ataque e nobres enviado.');
        return true;
    }

    async function sendTroopSummary() {
        const summary = await buildTroopsOverviewSummary();

        if (!summary || !summary.villageCount || !isTroopSummaryDefenseReliable(summary)) {
            console.log('[TW] Sem defesa disponivel para enviar.');
            return false;
        }

        summary.defenderTribe = await getPlayerTribe(getDefenderProfileUrl());
        console.log('[TW] Defesa disponivel lida:', {
            fonte: summary.placeScanIncomplete
                ? 'Visao geral de tropas'
                : 'Visao geral de tropas + Praca de Reunioes',
            aldeiasVisaoGeral: summary.parsedVillageCount,
            aldeiasPraca: summary.placeVillageCount,
            colunas: summary.troopColumns,
            total: getDefenseTroopTotals(summary.totalDefenseTotals || summary.defenseTotals || {}),
            apoios: getDefenseTroopTotals(summary.supportDefenseTotals || summary.supportTotals || {}),
            apoiosAApoiar: getDefenseTroopTotals(summary.supportStationedDefenseTotals || summary.supportStationedTotals || {}),
            apoiosACaminho: getDefenseTroopTotals(summary.supportTransitDefenseTotals || summary.supportTransitTotals || {}),
            coleta: getDefenseTroopTotals(summary.scavengingDefenseTotals || summary.scavengingTotals || {}),
            disponivel: getDefenseTroopTotals(summary.availableDefenseTotals || {})
        });

        const embed = buildSimpleDefenseTroopSummaryEmbed(summary);

        queueDiscordEmbed(
            embed,
            'Tribos Defesa Bot',
            getTroopsWebhook()
        );

        console.log('[TW] Defesa disponivel enviada.');
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

    function ensureTpScriptBar(uiDoc = document) {
        if (!uiDoc || !uiDoc.body) return null;

        if (!uiDoc.getElementById('tp-theplaguept-script-bar-style')) {
            const style = uiDoc.createElement('style');
            style.id = 'tp-theplaguept-script-bar-style';
            style.textContent = `
#tp-theplaguept-script-bar {
    position: absolute !important;
    top: 8px !important;
    left: 414px !important;
    z-index: 2147483647 !important;
    width: 350px !important;
    height: 34px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 5px !important;
    padding: 0 8px !important;
    box-sizing: border-box !important;
    pointer-events: none !important;
}

#tp-theplaguept-script-bar > * {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    bottom: auto !important;
    transform: none !important;
    width: 30px !important;
    min-width: 30px !important;
    max-width: 30px !important;
    height: 28px !important;
    min-height: 28px !important;
    margin: 0 !important;
    flex: 0 0 30px !important;
    pointer-events: auto !important;
    overflow: visible !important;
}

#tp-theplaguept-script-bar > button,
#tp-theplaguept-script-bar > * > button {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    bottom: auto !important;
    transform: none !important;
    width: 30px !important;
    min-width: 30px !important;
    max-width: 30px !important;
    height: 28px !important;
    min-height: 28px !important;
    margin: 0 !important;
    padding: 0 !important;
    flex: 0 0 30px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 0 !important;
    overflow: hidden !important;
}

#tp-theplaguept-script-bar > button:hover,
#tp-theplaguept-script-bar > button:focus-visible,
#tp-theplaguept-script-bar > * > button:hover,
#tp-theplaguept-script-bar > * > button:focus-visible,
#tp-theplaguept-script-bar #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:hover,
#tp-theplaguept-script-bar #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:focus-visible {
    width: 30px !important;
    min-width: 30px !important;
    max-width: 30px !important;
    padding: 0 !important;
    gap: 0 !important;
}

#tp-theplaguept-script-bar .tpdef-launcher-text,
#tp-theplaguept-script-bar .tw-alerts-toggle-label,
#tp-theplaguept-script-bar .ti-toggle-label,
#tp-theplaguept-script-bar .ra-tp-config-button-label,
#tp-theplaguept-script-bar [class$="-launcherLabel"],
#tp-theplaguept-script-bar [class$="-launcher-text"] {
    display: none !important;
    max-width: 0 !important;
    opacity: 0 !important;
}

#tp-theplaguept-script-bar #twHubTp-launcher { order: 10 !important; }
#tp-theplaguept-script-bar #tw-discord-alerts-ui { order: 20 !important; }
#tp-theplaguept-script-bar #tpDefLauncher { order: 30 !important; }
#tp-theplaguept-script-bar #tag-incomings-pt-panel { order: 40 !important; }
#tp-theplaguept-script-bar #tpMapMarker-launcher { order: 50 !important; }
#tp-theplaguept-script-bar #renomear-ataques-cores-theplaguept-config-button { order: 60 !important; }
#tp-theplaguept-script-bar #tpResumo24h-launcher { order: 70 !important; }
#tp-theplaguept-script-bar #tpconq-launcher { order: 80 !important; }
#tp-theplaguept-script-bar > .tp-theplaguept-script-bar-item[data-tp-title]::after {
    content: attr(data-tp-title) !important;
    position: absolute !important;
    left: 50% !important;
    top: 33px !important;
    transform: translateX(-50%) !important;
    display: none !important;
    white-space: nowrap !important;
    max-width: 360px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    padding: 4px 8px !important;
    border: 1px solid #4f120f !important;
    border-radius: 2px !important;
    background: linear-gradient(to bottom, #f6dfaa, #d2a05a) !important;
    color: #2b1509 !important;
    font: bold 11px Verdana, Arial, sans-serif !important;
    text-shadow: 0 1px #fff !important;
    box-shadow: 0 2px 6px rgba(0,0,0,.55) !important;
    pointer-events: none !important;
    z-index: 2147483647 !important;
}

#tp-theplaguept-script-bar > .tp-theplaguept-script-bar-item[data-tp-title]:hover::after,
#tp-theplaguept-script-bar > .tp-theplaguept-script-bar-item[data-tp-title]:focus-within::after {
    display: block !important;
}
`;
            (uiDoc.head || uiDoc.documentElement).appendChild(style);
        }

        let bar = uiDoc.getElementById('tp-theplaguept-script-bar');
        if (!bar) {
            bar = uiDoc.createElement('div');
            bar.id = 'tp-theplaguept-script-bar';
            bar.setAttribute('aria-label', 'Botoes ThePlaguePT');
            (uiDoc.body || uiDoc.documentElement).appendChild(bar);
        }

        return bar;
    }

    function attachToTpScriptBar(element, uiDoc = document) {
        const bar = ensureTpScriptBar(uiDoc);
        if (!bar || !element) return;

        element.classList.add('tp-theplaguept-script-bar-item');
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
        const orders = {
            'twHubTp-launcher': 10,
            'tw-discord-alerts-ui': 20,
            tpDefLauncher: 30,
            'tag-incomings-pt-panel': 40,
            'tpMapMarker-launcher': 50,
            'renomear-ataques-cores-theplaguept-config-button': 60,
            'tpResumo24h-launcher': 70,
            'tpconq-launcher': 80
        };
        const applyCompactButtonStyle = node => {
            if (!node || !node.style) return;
            node.style.setProperty('position', 'relative', 'important');
            node.style.setProperty('top', 'auto', 'important');
            node.style.setProperty('left', 'auto', 'important');
            node.style.setProperty('right', 'auto', 'important');
            node.style.setProperty('bottom', 'auto', 'important');
            node.style.setProperty('transform', 'none', 'important');
            node.style.setProperty('width', '30px', 'important');
            node.style.setProperty('min-width', '30px', 'important');
            node.style.setProperty('max-width', '30px', 'important');
            node.style.setProperty('height', '28px', 'important');
            node.style.setProperty('min-height', '28px', 'important');
            node.style.setProperty('margin', '0', 'important');
            node.style.setProperty('flex', '0 0 30px', 'important');
        };

        applyCompactButtonStyle(element);
        if (orders[element.id]) {
            element.style.setProperty('order', String(orders[element.id]), 'important');
        }
        Array.from(element.children || [])
            .filter(child => child.matches && child.matches('button'))
            .forEach(applyCompactButtonStyle);
        element.querySelectorAll('.tpdef-launcher-text,.tw-alerts-toggle-label,.ti-toggle-label,.ra-tp-config-button-label,[class$="-launcherLabel"],[class$="-launcher-text"]').forEach(label => {
            label.style.setProperty('display', 'none', 'important');
            label.style.setProperty('max-width', '0', 'important');
            label.style.setProperty('opacity', '0', 'important');
        });

        if (element.parentElement !== bar) {
            bar.appendChild(element);
        }
    }

    function createSettingsUi() {
        if (!isLoggedInGamePage()) {
            removeSettingsUi();
            return;
        }

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
<button id="tw-discord-alerts-toggle" type="button" title="Alertas Discord - ThePlaguePT" aria-label="Alertas Discord - ThePlaguePT">
    <span class="tw-alerts-eye"></span>
    <span class="tw-alerts-toggle-label">Alertas Discord - ThePlaguePT</span>
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
                            <div class="tw-alerts-section-desc">Relatórios periódicos de ataques a chegar e defesa disponível.</div>
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
                                <span>Defesa disponível</span>
                            </label>
                            <div class="tw-alerts-mini-desc">Envia as tropas defensivas disponíveis por categoria.</div>
                        </div>
                        <div class="tw-alerts-subblock-fields schedule-fields">
                            <div class="tw-alerts-field tw-alerts-webhook-field">
                                <label>Webhook</label>
                                <input id="tw-alerts-troops-webhook" type="text" value="${escapeHtml(settings.troopsWebhook || '')}">
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
                                <span>Fulls de ataque + nobres</span>
                            </label>
                            <div class="tw-alerts-mini-desc">Envia Fulls, Meios Fulls, Pequenos Fulls e Nobres no mesmo embed.</div>
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
                            <input id="tw-alerts-combine-counters" type="hidden" value="1">
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
                    <button id="tw-alerts-troops" class="tw-alerts-button tw-alerts-button-wide" type="button">Enviar Defesa Disponível</button>
                    <button id="tw-alerts-attack-fulls-send" class="tw-alerts-button tw-alerts-button-wide" type="button">Enviar Fulls + Nobres</button>
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
        attachToTpScriptBar(root, uiDoc);

        const uiWindow = uiDoc.defaultView || window;
        const launcherWidth = 30;
        const launcherGap = 25;

        function positionLauncher() {
            if (root.closest('#tp-theplaguept-script-bar')) {
                root.style.setProperty('left', 'auto', 'important');
                root.style.setProperty('right', 'auto', 'important');
                root.style.setProperty('top', 'auto', 'important');
                root.style.setProperty('bottom', 'auto', 'important');
                return;
            }

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
                nobleCounterWebhook: getSettings().nobleCounterWebhook || DEFAULT_NOBLE_COUNTER_WEBHOOK,
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
                notifyNobleCounter: false,
                combineAttackFullsAndNobles: true,
                notifyVerificationAlerts: container.querySelector('#tw-alerts-verification').checked,
                summaryIntervalHours: Number(container.querySelector('#tw-alerts-summary-interval').value || 8),
                troopsIntervalHours: Number(container.querySelector('#tw-alerts-troops-interval').value || 8),
                attackFullsIntervalHours: Number(container.querySelector('#tw-alerts-attack-fulls-interval').value || 8),
                nobleCounterIntervalHours: DEFAULT_NOBLE_COUNTER_INTERVAL_HOURS,
                checkInterval: container.querySelector('#tw-alerts-interval').value || CHECK_INTERVAL,
                troopsSummaryMode: TROOPS_SUMMARY_MODE_SIMPLE_DEFENSE,
                summaryScheduleMode: container.querySelector('#tw-alerts-summary-schedule-mode').value || SCHEDULE_MODE_INTERVAL,
                summaryDailyTime: container.querySelector('#tw-alerts-summary-daily-time').value || DEFAULT_SUMMARY_DAILY_TIME,
                troopsScheduleMode: container.querySelector('#tw-alerts-troops-schedule-mode').value || SCHEDULE_MODE_INTERVAL,
                troopsDailyTime: container.querySelector('#tw-alerts-troops-daily-time').value || DEFAULT_TROOPS_DAILY_TIME,
                attackFullsScheduleMode: container.querySelector('#tw-alerts-attack-fulls-schedule-mode').value || SCHEDULE_MODE_INTERVAL,
                attackFullsDailyTime: container.querySelector('#tw-alerts-attack-fulls-daily-time').value || DEFAULT_ATTACK_FULLS_DAILY_TIME,
                nobleCounterScheduleMode: SCHEDULE_MODE_INTERVAL,
                nobleCounterDailyTime: DEFAULT_NOBLE_COUNTER_DAILY_TIME,
                nobleTrainDelay: NOBLE_TRAIN_DELAY
            };
        }

        function applyFormSettings(nextSettings, container) {
            container.querySelector('#tw-alerts-webhook').value = nextSettings.webhook || '';
            container.querySelector('#tw-alerts-nobles-webhook').value = nextSettings.noblesWebhook || '';
            container.querySelector('#tw-alerts-summary-webhook').value = nextSettings.summaryWebhook || '';
            container.querySelector('#tw-alerts-troops-webhook').value = nextSettings.troopsWebhook || '';
            container.querySelector('#tw-alerts-attack-fulls-webhook').value = nextSettings.attackFullsWebhook || '';
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
            container.querySelector('#tw-alerts-combine-counters').value = '1';
            container.querySelector('#tw-alerts-verification').checked = Boolean(nextSettings.notifyVerificationAlerts);
            container.querySelector('#tw-alerts-interval').value = nextSettings.checkInterval || CHECK_INTERVAL;
            container.querySelector('#tw-alerts-summary-interval').value = String(normalizeIntervalHours(nextSettings.summaryIntervalHours, DEFAULT_SUMMARY_INTERVAL_HOURS));
            container.querySelector('#tw-alerts-troops-interval').value = String(normalizeIntervalHours(nextSettings.troopsIntervalHours, DEFAULT_TROOPS_INTERVAL_HOURS));
            container.querySelector('#tw-alerts-attack-fulls-interval').value = String(normalizeIntervalHours(nextSettings.attackFullsIntervalHours, DEFAULT_ATTACK_FULLS_INTERVAL_HOURS));
            container.querySelector('#tw-alerts-summary-schedule-mode').value = normalizeScheduleMode(nextSettings.summaryScheduleMode);
            container.querySelector('#tw-alerts-summary-daily-time').value = normalizeDailyTime(nextSettings.summaryDailyTime, DEFAULT_SUMMARY_DAILY_TIME);
            container.querySelector('#tw-alerts-troops-schedule-mode').value = normalizeScheduleMode(nextSettings.troopsScheduleMode);
            container.querySelector('#tw-alerts-troops-daily-time').value = normalizeDailyTime(nextSettings.troopsDailyTime, DEFAULT_TROOPS_DAILY_TIME);
            container.querySelector('#tw-alerts-attack-fulls-schedule-mode').value = normalizeScheduleMode(nextSettings.attackFullsScheduleMode);
            container.querySelector('#tw-alerts-attack-fulls-daily-time').value = normalizeDailyTime(nextSettings.attackFullsDailyTime, DEFAULT_ATTACK_FULLS_DAILY_TIME);
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
                        footer: { text: 'Tribal Wars' },
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
                status.textContent = 'A enviar defesa disponivel...';

                try {
                    const sent = await sendTroopSummary();
                    status.textContent = sent ? 'Defesa disponivel enviada.' : 'Sem defesa disponivel para enviar.';
                } catch (error) {
                    console.warn('[TW] Erro ao enviar defesa disponivel:', error);
                    status.textContent = 'Erro ao enviar defesa disponivel.';
                }
            });

            container.querySelector('#tw-alerts-attack-fulls-send').addEventListener('click', async () => {
                saveSettings(readFormSettings(container));
                status.textContent = 'A enviar fulls de ataque e nobres...';

                try {
                    const sent = await sendAttackFullsSummary();

                    status.textContent = sent
                        ? 'Fulls de ataque e nobres enviados.'
                        : 'Sem dados de fulls e nobres para enviar.';
                } catch (error) {
                    console.warn('[TW] Erro ao enviar fulls de ataque e nobres:', error);
                    status.textContent = 'Erro ao enviar fulls de ataque e nobres.';
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

    if (!isLoggedInGamePage()) {
        removeSettingsUi();
        return;
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
    setTimeout(() => {
        checkScriptUpdate().catch(error => {
            console.warn('[TW] Verificacao de update falhou:', error);
        });
    }, 4000);
    restorePendingNobleTrains();
    checkCurrentPageVerification();
    setInterval(checkCurrentPageVerification, 5000);
    setTimeout(scheduleCheckLoop, Math.floor(Math.random() * 1000));
})();
