// ==UserScript==
// @name         TW PT - Estimador de Tropas por OD - ThePlaguePT
// @namespace    theplaguept.tw.estimador-od
// @version      2.0.2
// @description  Analisa um relatorio de ataque e estima as baixas/forcas restantes do defensor a partir do aumento do OD ofensivo.
// @author       ThePlaguePT
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// @match        https://*.tribalwars.com.pt/game.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
    "use strict";

    if (window.top !== window.self || !window.game_data) return;

    const params = new URLSearchParams(location.search);
    const screen = params.get("screen") || game_data.screen || "";

    const APP = { id: "tp-od-est", version: "2.0.2" };
    const nf = new Intl.NumberFormat("pt-PT");
    const world = game_data.world || location.host;
    const playerId = Number(game_data.player?.id || 0);
    const reportId = params.get("view");
    const storageKey = `${APP.id}:${world}:snapshots:v1`;
    const markedKey = `${APP.id}:${world}:marked-attacks:v1`;

    // Pontos oficiais de adversarios derrotados enquanto atacante (ODA).
    const UNITS = {
        spear:    { label: "Lanceiros", oda: 4 },
        sword:    { label: "Espadachins", oda: 5 },
        axe:      { label: "Barbaros", oda: 1 },
        archer:   { label: "Arqueiros", oda: 5 },
        spy:      { label: "Exploradores", oda: 1 },
        light:    { label: "Cavalaria leve", oda: 5 },
        marcher:  { label: "Arqueiros a cavalo", oda: 6 },
        heavy:    { label: "Cavalaria pesada", oda: 23 },
        ram:      { label: "Aríetes", oda: 4 },
        catapult: { label: "Catapultas", oda: 12 },
        knight:   { label: "Paladino", oda: 40 },
        snob:     { label: "Nobres", oda: 200 },
        militia:  { label: "Milícia", oda: 4 },
    };
    const ORDER = Object.keys(UNITS);
    const COMBAT = {
        spear: { attack: 10, general: 15, cavalry: 45, archer: 20 }, sword: { attack: 25, general: 50, cavalry: 15, archer: 40 },
        axe: { attack: 40, general: 10, cavalry: 5, archer: 10 }, archer: { attack: 15, general: 50, cavalry: 40, archer: 5 },
        spy: { attack: 0, general: 2, cavalry: 1, archer: 2 }, light: { attack: 130, general: 30, cavalry: 40, archer: 30 },
        marcher: { attack: 120, general: 40, cavalry: 30, archer: 50 }, heavy: { attack: 150, general: 200, cavalry: 80, archer: 180 },
        ram: { attack: 2, general: 20, cavalry: 50, archer: 20 }, catapult: { attack: 100, general: 100, cavalry: 50, archer: 100 },
        knight: { attack: 150, general: 250, cavalry: 400, archer: 150 }, snob: { attack: 30, general: 100, cavalry: 50, archer: 100 },
        militia: { attack: 0, general: 80, cavalry: 50, archer: 80 },
    };
    const MODELS = [
        { name: "Defesa equilibrada", mix: { spear: 1, sword: 1 } },
        { name: "Equilibrada + CP", mix: { spear: 10, sword: 10, heavy: 0.6 } },
        { name: "Anti-cavalaria", mix: { spear: 3, sword: 1 } },
        { name: "Anti-infantaria", mix: { spear: 1, sword: 3 } },
        { name: "Defesa com arqueiros", mix: { spear: 1, sword: 1, archer: 1 } },
        { name: "Aldeia ofensiva", mix: { axe: 10, light: 4, ram: 0.5 } },
    ];

    injectStyles();
    installTopLauncher();
    installConfirmationObserver();
    findAttackConfirmationForms().forEach(form => enhanceAttackConfirmation(form));
    if (screen !== "report" || !params.get("view")) return;

    const report = parseReport();
    const nightState = { loaded: false, bonus: 0, label: "A detetar…", source: "" };
    const defenderState = { loaded: false, villages: null };
    const associatedMark = newestSubmittedMark(report.targetCoord);
    if (totalUnits(report.attackerAmount) < 1 && totalUnits(associatedMark?.units || {}) > 0) {
        report.attackerAmount = { ...associatedMark.units };
        report.attackerSurvived = ORDER.some(unit => (report.attackerAmount[unit] || 0) > (report.attackerLosses[unit] || 0));
    }
    const panel = buildPanel();
    insertPanel(panel);
    panel.hidden = true;
    if (associatedMark) insertReportResultsButton(associatedMark);
    void initialise();

    async function initialise() {
        const before = panel.querySelector('[name="odaBefore"]');
        const after = panel.querySelector('[name="odaAfter"]');
        const marked = newestSubmittedMark(report.targetCoord);
        const last = newestSnapshotBefore(Date.now());
        if (marked?.baseline !== undefined) {
            before.value = marked.baseline;
            setStatus(`Referência do ataque marcado: ${fmt(marked.baseline)} OD.`, "ok");
        } else if (last) before.value = last.score;
        render();

        setStatus("A consultar o OD ofensivo e a configuração do mundo…");
        const nightPromise = loadAutomaticNightBonus().then(result => {
            Object.assign(nightState, result, { loaded: true });
            updateNightDisplay();
            render();
        }).catch(error => {
            Object.assign(nightState, { loaded: true, bonus: 0, label: "Não detetado", source: error.message });
            updateNightDisplay();
            render();
        });
        const defenderPromise = loadDefenderVillageCount().then(villages => {
            defenderState.loaded = true;
            defenderState.villages = villages;
            updateDefenderDisplay();
            render();
        }).catch(() => {
            defenderState.loaded = true;
            defenderState.villages = null;
            updateDefenderDisplay();
        });
        try {
            const current = await fetchCurrentOda();
            after.value = current;
            rememberSnapshot(current, "consulta");
            setStatus(`OD atual consultado: ${fmt(current)}.`, "ok");
            render();
        } catch (error) {
            setStatus(`Não foi possível consultar automaticamente: ${error.message}. Introduz os dois valores.`, "warn");
        }
        await nightPromise;
        await defenderPromise;
    }

    function installTopLauncher() {
        if (document.getElementById(`${APP.id}-launcher`)) return;
        let bar = document.getElementById("tp-theplaguept-script-bar");
        if (!bar) {
            bar = document.createElement("div");
            bar.id = "tp-theplaguept-script-bar";
            document.body.appendChild(bar);
        }
        const button = document.createElement("button");
        button.id = `${APP.id}-launcher`;
        button.className = "tp-theplaguept-script-bar-item";
        button.type = "button";
        button.title = "Estimador de tropas por OD - ThePlaguePT";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("data-tp-title", button.title);
        button.innerHTML = `<span class="${APP.id}-launcherIcon">OD</span><span class="${APP.id}-launcherLabel">Estimador de tropas por OD</span>`;
        button.addEventListener("click", () => {
            const currentPanel = document.querySelector(`.${APP.id}-panel`);
            if (currentPanel) return toggleResultsPanel(currentPanel);
            const markBox = document.querySelector(`.${APP.id}-mark-box`);
            if (markBox) {
                markBox.scrollIntoView({ behavior: "smooth", block: "center" });
                markBox.classList.add(`${APP.id}-pulse`);
                setTimeout(() => markBox.classList.remove(`${APP.id}-pulse`), 1200);
                return;
            }
            showGameMessage("Abre a confirmação de um ataque para o marcar, ou um relatório marcado para ver a estimativa.", "info");
        });
        bar.appendChild(button);
    }

    function insertReportResultsButton(mark) {
        if (document.getElementById(`${APP.id}-report-open`)) return;
        const button = document.createElement("button");
        button.id = `${APP.id}-report-open`;
        button.type = "button";
        button.className = "btn";
        button.innerHTML = `<span>📊</span> Abrir estimativa por OD`;
        button.title = `Ataque marcado · OD inicial ${fmt(mark.baseline)}`;
        button.addEventListener("click", () => toggleResultsPanel(panel));
        const content = document.querySelector("#content_value");
        const heading = content?.querySelector("h2, h3");
        if (heading?.parentNode) heading.parentNode.insertBefore(button, heading.nextSibling);
        else content?.prepend(button);
    }

    function toggleResultsPanel(target) {
        target.hidden = !target.hidden;
        const reportButton = document.getElementById(`${APP.id}-report-open`);
        if (reportButton) reportButton.innerHTML = target.hidden ? `<span>📊</span> Abrir estimativa por OD` : `<span>📊</span> Fechar estimativa por OD`;
        if (!target.hidden) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function showGameMessage(message, type) {
        if (window.UI && typeof UI.InfoMessage === "function") UI.InfoMessage(message, 3500, type || "info");
        else console.info(`[${APP.id}] ${message}`);
    }

    function findAttackConfirmationForms(root = document) {
        const forms = [...root.querySelectorAll?.("form") || []];
        if (root.matches?.("form")) forms.unshift(root);
        return [...new Set(forms)].filter(form => {
            if (form.dataset.tpOdEstimatorEnhanced === "1") return false;
            const text = clean(form.innerText || form.textContent);
            const send = findAttackSendButton(form);
            return Boolean(send && /confirmar\s+ataque|enviar\s+ataque|send\s+attack|atacar\s+edif/i.test(text));
        });
    }

    function findAttackSendButton(form) {
        return [...form.querySelectorAll("button, input[type='submit'], input[type='button']")].find(node => /enviar\s+ataque|atacar|send\s+attack/i.test(clean(node.value || node.textContent || node.title))) || null;
    }

    function installConfirmationObserver() {
        const observer = new MutationObserver(records => {
            const forms = [];
            records.forEach(record => record.addedNodes.forEach(node => {
                if (!(node instanceof Element)) return;
                forms.push(...findAttackConfirmationForms(node));
            }));
            [...new Set(forms)].forEach(form => enhanceAttackConfirmation(form));
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function enhanceAttackConfirmation(form) {
        if (!form || form.dataset.tpOdEstimatorEnhanced === "1") return;
        form.dataset.tpOdEstimatorEnhanced = "1";
        const box = document.createElement("div");
        box.id = `${APP.id}-mark-box-${Date.now()}`;
        box.className = `${APP.id}-mark-box`;
        box.innerHTML = `<button type="button" class="btn" data-mark>Marcar para estimativa OD</button><span data-mark-status>Não monitorizado</span>`;
        const submit = findAttackSendButton(form);
        if (submit?.parentNode) submit.insertAdjacentElement("afterend", box);
        else form.appendChild(box);

        const button = box.querySelector("[data-mark]");
        const status = box.querySelector("[data-mark-status]");
        let armedId = "";
        let releasingSubmit = false;
        button.addEventListener("click", () => {
            button.disabled = true;
            armedId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            saveMarkedAttack(buildAttackMark(form, armedId));
            button.textContent = "Ataque marcado ✓";
            status.textContent = "OD será guardado ao enviar";
            box.classList.add(`${APP.id}-armed`);
        });

        async function captureBaselineAndRelease(submitter, release) {
            status.textContent = "A guardar OD no momento do envio…";
            if (submitter) submitter.disabled = true;
            try {
                const baseline = await fetchCurrentOda();
                const submittedAt = Date.now();
                updateMarkedAttack(armedId, { baseline, status: "submitted", submittedAt });
                rememberSnapshot(baseline, "ataque-enviado");
                status.textContent = `OD ${fmt(baseline)} guardado. A enviar…`;
            } catch (error) {
                updateMarkedAttack(armedId, { status: "submit-error", submittedAt: Date.now(), error: String(error.message || error) });
                status.textContent = "Não foi possível guardar o OD; a enviar na mesma…";
            }
            releasingSubmit = true;
            if (submitter) submitter.disabled = false;
            release();
        }

        if (submit && String(submit.type).toLowerCase() === "button") {
            submit.addEventListener("click", async event => {
                if (!armedId || releasingSubmit) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                await captureBaselineAndRelease(submit, () => submit.click());
            }, true);
        }

        form.addEventListener("submit", async event => {
            if (!armedId || releasingSubmit) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const submitter = event.submitter || submit;
            await captureBaselineAndRelease(submitter, () => releaseFormSubmission(form, submitter));
        }, true);
    }

    function releaseFormSubmission(form, submitter) {
        if (typeof form.requestSubmit === "function") {
            form.requestSubmit(submitter && submitter.form === form ? submitter : undefined);
            return;
        }
        if (submitter?.name && !form.querySelector(`input[type="hidden"][data-${APP.id}-submitter]`)) {
            const hidden = document.createElement("input");
            hidden.type = "hidden";
            hidden.name = submitter.name;
            hidden.value = submitter.value || "1";
            hidden.setAttribute(`data-${APP.id}-submitter`, "1");
            form.appendChild(hidden);
        }
        HTMLFormElement.prototype.submit.call(form);
    }

    function buildAttackMark(form, id) {
        const text = clean(document.querySelector("#content_value")?.innerText || form.innerText);
        const coords = [...text.matchAll(/\b(\d{1,3}\|\d{1,3})\b/g)].map(match => match[1]);
        const originMatch = text.match(/(?:Origem|Origin)[\s\S]{0,100}?\b(\d{1,3}\|\d{1,3})\b/i);
        const targetMatch = text.match(/(?:Destino|Alvo|Target|Destination)[\s\S]{0,120}?\b(\d{1,3}\|\d{1,3})\b/i);
        const unitTable = [...form.querySelectorAll("table")].find(table => table.querySelector('img[src*="unit_"]'));
        const tableUnits = unitTable ? (parseUnitTable(unitTable)?.amount || {}) : {};
        const formUnits = {};
        ORDER.forEach(unit => {
            const input = form.querySelector(`[name="${unit}"], [name="units[${unit}]"]`);
            const value = parseNumber(input?.value);
            if (Number.isFinite(value) && value > 0) formUnits[unit] = value;
        });
        const units = totalUnits(formUnits) > 0 ? formUnits : tableUnits;
        return { id, baseline: null, status: "armed", markedAt: Date.now(), submittedAt: null, origin: originMatch?.[1] || coords[0] || "", target: targetMatch?.[1] || coords[1] || coords[0] || "", units };
    }

    function loadMarkedAttacks() {
        try { return JSON.parse(localStorage.getItem(markedKey) || "[]"); } catch { return []; }
    }

    function saveMarkedAttack(mark) {
        const rows = loadMarkedAttacks();
        rows.push(mark);
        localStorage.setItem(markedKey, JSON.stringify(rows.slice(-80)));
    }

    function updateMarkedAttack(id, changes) {
        const rows = loadMarkedAttacks();
        const index = rows.findIndex(row => row.id === id);
        if (index < 0) return;
        rows[index] = { ...rows[index], ...changes };
        localStorage.setItem(markedKey, JSON.stringify(rows));
    }

    function newestSubmittedMark(targetCoord = "") {
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const rows = loadMarkedAttacks().filter(row => row.status === "submitted" && row.submittedAt >= cutoff);
        const matching = targetCoord ? rows.filter(row => row.target === targetCoord) : rows;
        return matching.sort((a, b) => b.submittedAt - a.submittedAt)[0] || null;
    }

    function buildPanel() {
        const el = document.createElement("section");
        el.className = `${APP.id}-panel`;
        el.innerHTML = `
            <div class="${APP.id}-head">
                <div><h2>Estimador de tropas por OD</h2><p>Relatório ${escapeHtml(reportId)} · ThePlaguePT</p></div>
                <button type="button" class="${APP.id}-toggle" title="Recolher painel">−</button>
            </div>
            <div class="${APP.id}-body">
                <div class="${APP.id}-inputs">
                    <label>OD ofensivo antes<input name="odaBefore" inputmode="numeric" placeholder="Ex.: 1 250 000"></label>
                    <label>OD ofensivo depois<input name="odaAfter" inputmode="numeric" placeholder="Ex.: 1 270 500"></label>
                    <button type="button" class="btn" data-action="current">Atualizar OD</button>
                    <button type="button" class="btn" data-action="baseline">Usar atual como “antes”</button>
                </div>
                <div class="${APP.id}-inputs ${APP.id}-combat-inputs">
                    <label>Muralha no combate<input name="wall" inputmode="numeric" value="${report.wall ?? 0}"></label>
                    <label>Sorte atacante (%)<input name="luck" inputmode="decimal" value="${report.luck ?? 0}"></label>
                    <label>Moral (%)<input name="morale" inputmode="decimal" value="${report.morale ?? 100}"></label>
                    <div class="${APP.id}-auto-field"><span>Bónus noturno</span><strong data-night-value>A detetar…</strong><small data-night-detail>Configuração do mundo</small></div>
                    <div class="${APP.id}-auto-field"><span>Aldeias do defensor</span><strong data-defender-villages>A detetar…</strong><small data-militia-detail>A validar milícia</small></div>
                </div>
                <div class="${APP.id}-status"></div>
                <div class="${APP.id}-result"></div>
                <details><summary>Como interpretar</summary><p>O delta do OD mede pontos das <b>baixas inimigas</b>, não as tropas sobreviventes. Se houve outros ataques entre as duas leituras, o delta não pertence apenas a este relatório. Atualizações do ranking também podem chegar atrasadas.</p></details>
            </div>`;

        el.querySelectorAll("input").forEach(input => input.addEventListener("input", render));
        el.querySelector(`.${APP.id}-toggle`).addEventListener("click", event => {
            const body = el.querySelector(`.${APP.id}-body`);
            body.hidden = !body.hidden;
            event.currentTarget.textContent = body.hidden ? "+" : "−";
        });
        el.querySelector('[data-action="current"]').addEventListener("click", async event => {
            event.currentTarget.disabled = true;
            try {
                const score = await fetchCurrentOda(true);
                el.querySelector('[name="odaAfter"]').value = score;
                rememberSnapshot(score, "manual");
                setStatus(`OD atualizado: ${fmt(score)}.`, "ok");
                render();
            } catch (error) {
                setStatus(error.message, "warn");
            } finally {
                event.currentTarget.disabled = false;
            }
        });
        el.querySelector('[data-action="baseline"]').addEventListener("click", () => {
            const score = parseNumber(el.querySelector('[name="odaAfter"]').value);
            if (!Number.isFinite(score)) return setStatus("Consulta ou introduz primeiro o OD atual.", "warn");
            el.querySelector('[name="odaBefore"]').value = score;
            rememberSnapshot(score, "base");
            setStatus("Leitura atual guardada como referência para o próximo ataque.", "ok");
            render();
        });
        return el;
    }

    function render() {
        const before = parseNumber(panel.querySelector('[name="odaBefore"]').value);
        const after = parseNumber(panel.querySelector('[name="odaAfter"]').value);
        const delta = Number.isFinite(before) && Number.isFinite(after) ? after - before : null;
        const out = panel.querySelector(`.${APP.id}-result`);
        const visiblePoints = scoreUnits(report.defenderLosses);
        const remaining = subtractUnits(report.defenderAmount, report.defenderLosses);
        const hasAmount = totalUnits(report.defenderAmount) > 0;
        const hasLosses = totalUnits(report.defenderLosses) > 0;

        let html = `<div class="${APP.id}-cards">
            ${card("Delta OD", delta === null ? "—" : fmtSigned(delta), delta === null ? "Introduz as duas leituras" : delta < 0 ? "Valores invertidos" : "Pontos ODA no intervalo")}
            ${card("Baixas visíveis", hasLosses ? fmt(totalUnits(report.defenderLosses)) : "Ocultas", hasLosses ? `${fmt(visiblePoints)} pontos ODA` : "Sem composição no relatório")}
            ${card("Defensores restantes", hasAmount ? fmt(totalUnits(remaining)) : report.attackerSurvived ? "0 no combate*" : "Indeterminável", hasAmount ? "Calculado pelo relatório" : report.attackerSurvived ? "O atacante sobreviveu" : "OD não mede sobreviventes")}
        </div>`;

        if (delta !== null && delta >= 0) {
            if (hasLosses) {
                const difference = delta - visiblePoints;
                const isolated = difference === 0;
                html += notice(isolated ? "ok" : "warn", isolated
                    ? `Correspondência exata: o delta de ${fmt(delta)} coincide com as baixas defensoras deste relatório.`
                    : `O relatório vale ${fmt(visiblePoints)} pontos, mas o delta é ${fmt(delta)} (${fmtSigned(difference)}). O intervalo inclui atraso ou outros combates.`);
            } else if (delta > 0) {
                const simulations = simulateHiddenDefenders(delta);
                html += `<h4>Simulação</h4>`;
                if (simulations.length) {
                    const min = Math.min(...simulations.map(row => row.survivors));
                    const max = Math.max(...simulations.map(row => row.survivors));
                    const recommended = simulations.find(row => row.name === "Equilibrada + CP") || simulations[0];
                    html += `<div class="${APP.id}-estimate"><strong>${fmt(min)} – ${fmt(max)}</strong><span>defensores sobreviventes, conforme a composição provável</span></div>
                        ${renderRecommendedSimulation(recommended, delta)}
                        <h4>Outras composições possíveis</h4>
                        <div class="${APP.id}-scroll"><table><thead><tr><th>Modelo</th><th>Composição inicial</th><th>Baixas simuladas</th><th>Tropas restantes</th><th>OD sim.</th><th>Diferença</th></tr></thead><tbody>
                        ${simulations.map(row => `<tr class="${row === recommended ? `${APP.id}-recommended-row` : ""}"><td>${escapeHtml(row.name)}</td><td>${formatUnitCompact(row.initialUnits)}</td><td>${formatUnitCompact(row.killedUnits)}</td><td><b>${formatUnitCompact(row.remainingUnits)}</b><small>${fmt(row.survivors)} unidades</small></td><td>${fmt(row.score)}</td><td>${fmtSigned(row.score - delta)}</td></tr>`).join("")}
                        </tbody></table></div>
                        ${notice("warn", "Estimativa inversa: assume que este delta pertence apenas ao relatório e que não existiam bónus ocultos. A composição real pode ficar fora do intervalo.")}`;
                } else {
                    const missingAttack = totalUnits(report.attackerAmount) < 1;
                    html += notice("warn", missingAttack
                        ? "Não foi possível recuperar as tropas atacantes deste relatório nem da marca guardada. Marca o ataque antes de o enviar para criar a simulação."
                        : report.attackerSurvived
                            ? "O atacante teve sobreviventes; nesse caso as forças que participaram na defesa foram eliminadas e não há guarnição restante para reconstruir."
                            : "Não foi encontrada uma composição compatível com este OD e os parâmetros do combate. Confirma a muralha, sorte, moral e se o delta pertence apenas a este ataque.");
                }
                const possibleUnits = ORDER.filter(unit => unit !== "militia" || defenderState.villages === 1);
                html += `<h4>Equivalências se todo o delta pertencer a este ataque</h4><div class="${APP.id}-equiv">${possibleUnits.map(unit => {
                    const amount = Math.floor(delta / UNITS[unit].oda);
                    const rest = delta % UNITS[unit].oda;
                    return `<span><b>${escapeHtml(UNITS[unit].label)}</b>${fmt(amount)}${rest ? ` + ${rest} pt` : ""}</span>`;
                }).join("")}</div>`;
                html += notice("warn", "Estas são equivalências extremas, não uma composição identificada. Muitas combinações diferentes produzem exatamente o mesmo OD.");
            }
        }

        if (hasAmount) html += unitTable(report.defenderAmount, report.defenderLosses, remaining);
        html += `<p class="${APP.id}-foot">* Refere-se às forças que participaram no combate. Tropas fora da aldeia ou chegadas depois não podem ser inferidas.</p>`;
        out.innerHTML = html;
    }

    function parseReport() {
        const tables = [...document.querySelectorAll("#content_value table, table")]
            .filter(table => table.querySelector('img[src*="unit_"]'))
            .filter(table => ![...table.querySelectorAll(":scope > tbody > tr > td table, :scope > tr > td table")].some(nested => nested.querySelector('img[src*="unit_"]')));
        const parsed = tables.map(parseUnitTable).filter(Boolean);
        const defender = parsed.length > 1 ? parsed[parsed.length - 1] : null;
        const attacker = parsed.length ? parsed[0] : null;
        const text = clean(document.querySelector("#content_value")?.innerText || document.body.innerText);
        return {
            attackerAmount: attacker?.amount || {},
            attackerLosses: attacker?.losses || {},
            defenderAmount: defender?.amount || {},
            defenderLosses: defender?.losses || {},
            attackerSurvived: attacker ? ORDER.some(unit => (attacker.amount[unit] || 0) > (attacker.losses[unit] || 0)) : false,
            wall: firstMatchNumber(text, /muralha[^\d]{0,30}(?:n[ií]vel\s*)?(\d+)/i),
            wallAfter: firstMatchNumber(text, /muralha[\s\S]{0,80}?(?:de|do\s+n[ií]vel)\s*\d+[\s\S]{0,35}?(?:para|ao)\s+(?:o\s+n[ií]vel\s*)?(\d+)/i),
            luck: firstMatchNumber(text, /sorte[^-+\d]{0,30}([+-]?\d+(?:[.,]\d+)?)\s*%/i),
            morale: firstMatchNumber(text, /moral[^\d]{0,30}(\d+(?:[.,]\d+)?)\s*%/i),
            nightBonus: detectNightBonus(text),
            reportTimeMinutes: extractReportTimeMinutes(text),
            targetCoord: (text.match(/(?:Destino|Defensor)[\s\S]{0,160}?\b(\d{1,3}\|\d{1,3})\b/i) || [])[1] || "",
            defenderPlayerId: extractDefenderPlayerId(),
        };
    }

    function simulateHiddenDefenders(targetScore) {
        if (!targetScore || totalUnits(report.attackerAmount) < 1 || report.attackerSurvived) return [];
        const wall = clamp(parseNumber(panel.querySelector('[name="wall"]').value), 0, 30);
        const luck = clamp(parseDecimal(panel.querySelector('[name="luck"]').value), -50, 50);
        const morale = clamp(parseDecimal(panel.querySelector('[name="morale"]').value), 1, 100);
        const nightBonus = clamp(nightState.bonus, 0, 500);
        const attackModifier = (1 + luck / 100) * (morale / 100);
        const defenseModifier = 1 + nightBonus / 100;
        const groups = attackGroups(report.attackerAmount);
        const totalAttack = groups.general + groups.cavalry + groups.archer;
        if (totalAttack <= 0) return [];

        return MODELS.filter(model => defenderState.villages === 1 || !model.mix.militia).map(model => {
            // Procuramos apenas o ramo em que o defensor venceu (o atacante foi eliminado).
            let low = 1;
            while (low < 1000000 && evaluateModel(model, low, groups, wall, attackModifier, defenseModifier).strengthRatio >= 1) low *= 2;
            let high = low;
            while (high < 2000000 && evaluateModel(model, high, groups, wall, attackModifier, defenseModifier).score > targetScore) high *= 2;
            for (let step = 0; step < 38; step++) {
                const scale = (low + high) / 2;
                const trial = evaluateModel(model, scale, groups, wall, attackModifier, defenseModifier);
                // No ramo vencedor, mais defesa implica menos unidades mortas pelo ataque fixo.
                if (trial.score > targetScore) low = scale;
                else high = scale;
            }
            const candidates = [low, high, (low + high) / 2].map(scale => evaluateModel(model, scale, groups, wall, attackModifier, defenseModifier));
            const best = candidates.sort((a, b) => Math.abs(a.score - targetScore) - Math.abs(b.score - targetScore))[0];
            return { ...best, name: model.name };
        }).filter(row => row.initial > 0 && row.killed > 0 && Math.abs(row.score - targetScore) <= Math.max(50, targetScore * 0.08));
    }

    function evaluateModel(model, scale, attack, wall, attackModifier, defenseModifier) {
        const initial = {};
        Object.entries(model.mix).forEach(([unit, ratio]) => initial[unit] = Math.max(0, Math.round(scale * ratio)));
        const defense = effectiveDefense(initial, attack);
        const wallFactor = Math.pow(1.037, wall);
        const attackStrength = (attack.general + attack.cavalry + attack.archer) * attackModifier;
        const ratio = defense > 0 ? attackStrength / (defense * wallFactor * defenseModifier) : 10;
        // Regra de baixas do vencedor: relação de forças elevada a 1,5.
        const lossFraction = clamp(Math.pow(ratio, 1.5), 0, 1);
        const killedUnits = Object.fromEntries(Object.entries(initial).map(([unit, count]) => [unit, Math.min(count, Math.round(count * lossFraction))]));
        const remainingUnits = subtractUnits(initial, killedUnits);
        const initialTotal = totalUnits(initial);
        const killed = totalUnits(killedUnits);
        return { initial: initialTotal, killed, survivors: initialTotal - killed, lossPct: initialTotal ? killed * 100 / initialTotal : 0, score: scoreUnits(killedUnits), strengthRatio: ratio, initialUnits: initial, killedUnits, remainingUnits };
    }

    function renderRecommendedSimulation(row, targetScore) {
        if (!row) return "";
        const common = ["spear", "sword", "axe", "spy", "light", "heavy", "ram", "catapult", "knight", "snob"];
        if ((report.attackerAmount.archer || 0) + (row.initialUnits.archer || 0) > 0) common.splice(3, 0, "archer");
        if ((report.attackerAmount.marcher || 0) + (row.initialUnits.marcher || 0) > 0) common.splice(common.indexOf("heavy"), 0, "marcher");
        if (defenderState.villages === 1) common.push("militia");
        const units = [...new Set(common)];
        const attackerRemaining = subtractUnits(report.attackerAmount, report.attackerLosses);
        const wallAfter = Number.isFinite(report.wallAfter) ? report.wallAfter : report.wall;
        return `<div class="${APP.id}-sim-wrap">
            <div class="${APP.id}-sim-title"><img src="/graphic/buildings/place.png" alt=""><span>Simulação por OD ofensivo - Tropas estimadas</span></div>
            <div class="${APP.id}-sim-meta">OD observado: ${fmt(targetScore)}; modelo: ${escapeHtml(row.name)}. Nível de muralha antes: ${fmt(report.wall)}/20.</div>
            <div class="${APP.id}-sim-scroll"><table class="${APP.id}-sim-table">
                <tr><th colspan="2"></th>${units.map(unit => `<th><img src="/graphic/unit/unit_${escapeHtml(unit)}.png" title="${escapeHtml(UNITS[unit]?.label || unit)}" alt="${escapeHtml(shortUnitLabel(unit))}"></th>`).join("")}</tr>
                ${renderSimulationRows("Atacante", report.attackerAmount, report.attackerLosses, attackerRemaining, units, false)}
                ${renderSimulationRows("Defensor", row.initialUnits, row.killedUnits, row.remainingUnits, units, true)}
            </table></div>
            <div class="${APP.id}-sim-wall">Dano na muralha: foi danificada do nível ${fmt(report.wall)} para o nível ${fmt(wallAfter)}.</div>
            <div class="${APP.id}-match"><span>OD observado: <b>${fmt(targetScore)}</b></span><span>OD simulado: <b>${fmt(row.score)}</b></span><span>Diferença: <b>${fmtSigned(row.score - targetScore)}</b></span><span>Restam: <b>${fmt(row.survivors)}</b></span></div>
        </div>`;
    }

    function renderSimulationRows(side, amount, losses, remaining, units, showRemaining) {
        return `<tr><td rowspan="${showRemaining ? 3 : 2}" class="${APP.id}-sim-side">${escapeHtml(side)}</td><td class="${APP.id}-sim-label">Unidades:</td>${renderSimulationCells(amount, units, "")}</tr>
            <tr><td class="${APP.id}-sim-label">Baixas:</td>${renderSimulationCells(losses, units, `${APP.id}-sim-loss`)}</tr>
            ${showRemaining ? `<tr><td class="${APP.id}-sim-label">Restam:</td>${renderSimulationCells(remaining, units, `${APP.id}-sim-remaining`)}</tr>` : ""}`;
    }

    function renderSimulationCells(amounts, units, className) {
        return units.map(unit => `<td class="${className}">${fmt(amounts?.[unit] || 0)}</td>`).join("");
    }

    function formatUnitCompact(units) {
        const text = ORDER.filter(unit => (units[unit] || 0) > 0).map(unit => `${shortUnitLabel(unit)} ${fmt(units[unit])}`).join(" · ");
        return escapeHtml(text || "—");
    }

    function shortUnitLabel(unit) {
        return ({ spear: "Lanc", sword: "Esp", axe: "Barb", archer: "Arq", spy: "Exp", light: "CL", marcher: "ArqC", heavy: "CP", ram: "Ari", catapult: "Cat", knight: "Pal", snob: "Nobre", militia: "Mil" })[unit] || unit;
    }

    function attackGroups(units) {
        const result = { general: 0, cavalry: 0, archer: 0 };
        ORDER.forEach(unit => {
            const count = units[unit] || 0;
            const value = (COMBAT[unit]?.attack || 0) * count;
            if (unit === "light" || unit === "heavy" || unit === "spy" || unit === "knight") result.cavalry += value;
            else if (unit === "archer" || unit === "marcher") result.archer += value;
            else result.general += value;
        });
        return result;
    }

    function effectiveDefense(units, attack) {
        const totalAttack = attack.general + attack.cavalry + attack.archer || 1;
        return ORDER.reduce((sum, unit) => {
            const stats = COMBAT[unit];
            if (!stats) return sum;
            const weighted = (stats.general * attack.general + stats.cavalry * attack.cavalry + stats.archer * attack.archer) / totalAttack;
            return sum + (units[unit] || 0) * weighted;
        }, 0);
    }

    function parseUnitTable(table) {
        const units = [...table.querySelectorAll('img[src*="unit_"]')].map(img => {
            const match = (img.getAttribute("src") || "").match(/unit_([a-z]+)(?:\.|_)/i);
            return match?.[1] || "";
        }).filter(unit => UNITS[unit]);
        const unique = [...new Set(units)];
        if (unique.length < 2) return null;
        const result = { amount: {}, losses: {} };
        [...table.querySelectorAll("tr")].forEach(row => {
            if (row.querySelector('img[src*="unit_"]')) return;
            const cells = [...row.querySelectorAll("td,th")];
            const label = clean(cells[0]?.textContent).toLowerCase();
            const type = /baixas|perdas|loss|verluste|pertes/.test(label) ? "losses" : /quantidade|tropas|amount|anzahl|nombre/.test(label) ? "amount" : null;
            if (!type) return;
            const values = cells.slice(-unique.length).map(cell => parseNumber(cell.textContent));
            unique.forEach((unit, index) => { if (Number.isFinite(values[index])) result[type][unit] = values[index]; });
        });
        return result;
    }

    async function fetchCurrentOda() {
        if (!playerId) throw new Error("ID do jogador indisponível");
        const response = await fetch(`/map/kill_att.txt?_=${Date.now()}`, { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error(`consulta devolveu HTTP ${response.status}`);
        const text = await response.text();
        for (const line of text.split(/\r?\n/)) {
            const cols = line.trim().split(",");
            // Formato: posicao,id_jogador,pontos.
            if (Number(cols[1]) === playerId) {
                const score = Number(cols[2]);
                if (Number.isFinite(score)) return score;
            }
        }
        throw new Error("jogador não encontrado no ranking de OD ofensivo");
    }

    function rememberSnapshot(score, source) {
        const rows = loadSnapshots();
        rows.push({ score, time: Date.now(), source, reportId });
        localStorage.setItem(storageKey, JSON.stringify(rows.slice(-60)));
    }

    function newestSnapshotBefore(time) {
        return loadSnapshots().filter(row => Number.isFinite(row.score) && row.time < time - 1000).sort((a, b) => b.time - a.time)[0] || null;
    }

    function loadSnapshots() {
        try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; }
    }

    function unitTable(amount, losses, remaining) {
        const rows = ORDER.filter(unit => (amount[unit] || 0) + (losses[unit] || 0) > 0).map(unit => `<tr><td>${escapeHtml(UNITS[unit].label)}</td><td>${fmt(amount[unit] || 0)}</td><td>${fmt(losses[unit] || 0)}</td><td>${fmt(remaining[unit] || 0)}</td><td>${fmt((losses[unit] || 0) * UNITS[unit].oda)}</td></tr>`).join("");
        return `<h4>Leitura exata do relatório</h4><div class="${APP.id}-scroll"><table class="vis"><thead><tr><th>Unidade</th><th>Antes</th><th>Baixas</th><th>Restam</th><th>ODA</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    function card(label, value, detail) { return `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><span>${escapeHtml(detail)}</span></div>`; }
    function notice(type, text) { return `<div class="${APP.id}-notice ${type}">${escapeHtml(text)}</div>`; }
    function setStatus(text, type = "") { panel.querySelector(`.${APP.id}-status`).className = `${APP.id}-status ${type}`; panel.querySelector(`.${APP.id}-status`).textContent = text; }
    function subtractUnits(a, b) { return Object.fromEntries(ORDER.map(unit => [unit, Math.max(0, (a[unit] || 0) - (b[unit] || 0))])); }
    function totalUnits(units) { return ORDER.reduce((sum, unit) => sum + (units[unit] || 0), 0); }
    function scoreUnits(units) { return ORDER.reduce((sum, unit) => sum + (units[unit] || 0) * UNITS[unit].oda, 0); }
    function parseNumber(value) { const text = String(value ?? "").replace(/[^\d-]/g, ""); return text && text !== "-" ? Number(text) : NaN; }
    function parseDecimal(value) { const number = Number(String(value ?? "").replace(",", ".").replace(/[^\d.+-]/g, "")); return Number.isFinite(number) ? number : 0; }
    function firstMatchNumber(text, pattern) { const match = String(text || "").match(pattern); return match ? parseDecimal(match[1]) : null; }
    function detectNightBonus(text) {
        const source = String(text || "");
        const explicit = source.match(/b[oó]nus\s+noturno[^\d]{0,30}(\d+(?:[.,]\d+)?)\s*%/i);
        if (explicit) return parseDecimal(explicit[1]);
        return /b[oó]nus\s+noturno|prote[cç][aã]o\s+noturna|night\s+bonus/i.test(source) ? 100 : 0;
    }

    async function loadAutomaticNightBonus() {
        const response = await fetch(`/interface.php?func=get_config&_=${Date.now()}`, { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error(`Configuração HTTP ${response.status}`);
        const xml = new DOMParser().parseFromString(await response.text(), "text/xml");
        if (xml.querySelector("parsererror")) throw new Error("Configuração do mundo inválida");
        const night = xml.querySelector("config > night, night");
        if (!night) return { bonus: 0, label: "Desativado", source: "O mundo não tem Bónus Noturno" };

        const activeText = nodeValue(night, ["active", "enabled"]);
        const active = /^(1|true|on|active)$/i.test(activeText || "");
        if (!active) return { bonus: 0, label: "Desativado", source: "Desativado na configuração do mundo" };

        const start = parseTimeMinutes(nodeValue(night, ["start_hour", "start", "from", "begin"]));
        const end = parseTimeMinutes(nodeValue(night, ["end_hour", "end", "to", "finish"]));
        const combatTime = report.reportTimeMinutes;
        const configured = parseDecimal(nodeValue(night, ["defense_bonus", "defence_bonus", "bonus", "def_factor", "factor", "modifier"]));
        const bonus = configured > 0 ? (configured <= 10 ? Math.max(0, (configured - 1) * 100) : configured) : 100;

        if (combatTime === null) {
            const fromReport = report.nightBonus > 0;
            return fromReport
                ? { bonus, label: `Ativo · +${fmt(bonus)}%`, source: "Indicado no relatório; hora não identificada" }
                : { bonus: 0, label: "Hora desconhecida", source: "Não foi possível validar a hora do combate" };
        }
        if (start === null || end === null) {
            return report.nightBonus > 0
                ? { bonus, label: `Ativo · +${fmt(bonus)}%`, source: "Indicado no relatório" }
                : { bonus: 0, label: "Horário indisponível", source: "O mundo não publicou início/fim" };
        }

        const applies = isTimeInsideRange(combatTime, start, end);
        const range = `${formatMinutes(start)}–${formatMinutes(end)}`;
        return applies
            ? { bonus, label: `Ativo · +${fmt(bonus)}%`, source: `Combate ${formatMinutes(combatTime)} · horário ${range}` }
            : { bonus: 0, label: "Inativo · +0%", source: `Combate ${formatMinutes(combatTime)} · horário ${range}` };
    }

    function updateNightDisplay() {
        const value = panel.querySelector("[data-night-value]");
        const detail = panel.querySelector("[data-night-detail]");
        if (value) value.textContent = nightState.label;
        if (detail) detail.textContent = nightState.source || "Configuração do mundo";
    }

    async function loadDefenderVillageCount() {
        if (!report.defenderPlayerId) return null;
        const response = await fetch(`/map/player.txt?_=${Date.now()}`, { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error(`Jogadores HTTP ${response.status}`);
        const text = await response.text();
        for (const line of text.split(/\r?\n/)) {
            const cols = line.split(",");
            if (Number(cols[0]) === report.defenderPlayerId) {
                const villages = Number(cols[3]);
                return Number.isFinite(villages) ? villages : null;
            }
        }
        return null;
    }

    function extractDefenderPlayerId() {
        const links = [...document.querySelectorAll('#content_value a[href*="screen=info_player"][href*="id="]')];
        const link = links[links.length - 1];
        if (!link) return null;
        const id = Number(new URL(link.getAttribute("href") || "", location.href).searchParams.get("id"));
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    function updateDefenderDisplay() {
        const value = panel.querySelector("[data-defender-villages]");
        const detail = panel.querySelector("[data-militia-detail]");
        if (!value || !detail) return;
        if (Number.isFinite(defenderState.villages)) {
            value.textContent = `${fmt(defenderState.villages)} ${defenderState.villages === 1 ? "aldeia" : "aldeias"}`;
            detail.textContent = defenderState.villages === 1 ? "Milícia incluída nos cenários" : "Milícia excluída dos cenários";
        } else {
            value.textContent = "Desconhecido";
            detail.textContent = "Milícia excluída por segurança";
        }
    }

    function nodeValue(root, names) {
        for (const name of names) {
            const node = root.querySelector(name);
            const value = clean(node?.textContent);
            if (value) return value;
        }
        return "";
    }

    function extractReportTimeMinutes(text) {
        const dateNodeText = clean(document.querySelector(".report_date, #report_date, #content_value .date")?.textContent || "");
        const candidates = [dateNodeText, String(text || "")];
        for (const candidate of candidates) {
            const matches = [...candidate.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/g)];
            if (matches.length) {
                const match = matches[0];
                return Number(match[1]) * 60 + Number(match[2]);
            }
        }
        return null;
    }

    function parseTimeMinutes(value) {
        if (value === undefined || value === null || value === "") return null;
        if (typeof value === "number" || /^\d+(?:\.\d+)?$/.test(String(value).trim())) {
            const number = Number(value);
            if (number >= 0 && number <= 24) return Math.round(number * 60) % 1440;
            if (number >= 0 && number < 1440) return Math.round(number);
        }
        const match = String(value).match(/\b(\d{1,2})(?::(\d{2}))?\b/);
        if (!match) return null;
        const hours = Number(match[1]), minutes = Number(match[2] || 0);
        return hours <= 24 && minutes <= 59 ? ((hours % 24) * 60 + minutes) % 1440 : null;
    }

    function isTimeInsideRange(value, start, end) {
        if (start === end) return false;
        return start < end ? value >= start && value < end : value >= start || value < end;
    }

    function formatMinutes(value) { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
    function clamp(value, min, max) { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)); }
    function fmt(value) { return nf.format(Number(value) || 0); }
    function fmtSigned(value) { return `${value > 0 ? "+" : ""}${nf.format(value)}`; }
    function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
    function escapeHtml(value) { const div = document.createElement("div"); div.textContent = String(value ?? ""); return div.innerHTML; }

    function insertPanel(el) {
        const content = document.querySelector("#content_value");
        const title = content?.querySelector("h2, h3");
        if (title?.parentNode) title.parentNode.insertBefore(el, title.nextSibling);
        else (content || document.body).prepend(el);
    }

    function injectStyles() {
        const style = document.createElement("style");
        style.textContent = `
            .${APP.id}-panel{margin:9px 0 13px;border:2px solid #7e211c;border-radius:4px;background:#f4e4b8;color:#3b2508;box-shadow:0 0 0 1px #d8c99b,0 2px 6px #0005;font:12px Verdana,Arial,sans-serif;overflow:hidden}
            .${APP.id}-head{display:flex;justify-content:space-between;align-items:center;padding:9px 12px 8px;border-bottom:1px solid #c8913e;background:linear-gradient(to bottom,#f7e8c1 0%,#edd49a 100%);text-shadow:none}. ${APP.id}-head h2{margin:0;color:#9d1714;font:700 16px/20px Verdana,Arial,sans-serif}
            .${APP.id}-head p{margin:3px 0 0;color:#4a240d;font-size:12px}. ${APP.id}-toggle{width:22px;height:22px;padding:0;border:2px solid #4c2a12!important;border-radius:2px;background:#f6d28b!important;color:#1b0d07!important;font:bold 16px/16px Verdana,Arial,sans-serif;text-shadow:none!important;box-shadow:0 1px 3px #0006;cursor:pointer}
            .${APP.id}-body{padding:10px}. ${APP.id}-inputs{display:flex;gap:8px;align-items:end;flex-wrap:wrap}. ${APP.id}-inputs label{display:grid;gap:3px;color:#5e3b16;font-weight:bold}. ${APP.id}-inputs input{box-sizing:border-box;width:150px;padding:4px 5px;border:1px solid #7d510f!important;border-radius:2px;background:#fff9df!important;color:#000;box-shadow:inset 1px 1px 2px #3c230824}
            .${APP.id}-panel .btn,.${APP.id}-mark-box .btn,#${APP.id}-report-open{min-height:22px;padding:2px 8px;border:1px solid #2d1606!important;border-radius:3px;background:linear-gradient(to bottom,#8b5d2d 0%,#5b3417 100%)!important;color:#fff!important;font:bold 11px Verdana,Arial,sans-serif;text-shadow:1px 1px 1px #000;box-shadow:inset 0 1px 0 #ffffff38;cursor:pointer;text-decoration:none!important}. ${APP.id}-panel .btn:hover,.${APP.id}-mark-box .btn:hover,#${APP.id}-report-open:hover{background:linear-gradient(to bottom,#9a6a36 0%,#6a3d1c 100%)!important}. ${APP.id}-panel .btn:disabled,.${APP.id}-mark-box .btn:disabled{opacity:.55;cursor:wait}
            .${APP.id}-status{min-height:16px;margin:7px 0;color:#6c541f}. ${APP.id}-status.ok{color:#28732f}. ${APP.id}-status.warn{color:#a04618}
            .${APP.id}-cards{display:grid;grid-template-columns:repeat(3,minmax(135px,1fr));gap:6px}. ${APP.id}-cards>div{display:grid;gap:3px;padding:7px;background:#f8e8bd;border:1px solid #d5b579;border-radius:2px}. ${APP.id}-cards small{color:#5e3b16;font-weight:bold}. ${APP.id}-cards strong{font-size:17px;color:#9d1714}. ${APP.id}-cards span{color:#725f3e}
            .${APP.id}-notice{margin-top:8px;padding:7px 9px;border:1px solid #d5b579;border-left:4px solid #ad7d2f;background:#fff9de}. ${APP.id}-notice.ok{border-left-color:#42964a}. ${APP.id}-notice.warn{border-left-color:#b33a34}
            .${APP.id}-equiv{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:3px}. ${APP.id}-equiv span{display:flex;justify-content:space-between;padding:5px;background:#f8e8bd;border:1px solid #d5b579}
            .${APP.id}-combat-inputs{margin-top:7px;padding-top:7px;border-top:1px dashed #b9985f}. ${APP.id}-combat-inputs input{width:112px}. ${APP.id}-estimate{display:flex;gap:10px;align-items:baseline;padding:8px;margin-bottom:6px;background:#f8e8bd;border:1px solid #d5b579}. ${APP.id}-estimate strong{font-size:19px;color:#9d1714}
            .${APP.id}-auto-field{display:grid;gap:3px;min-width:190px;padding:4px 6px;border:1px solid #d5b579;border-radius:2px;background:#f8e8bd}. ${APP.id}-auto-field>span{color:#5e3b16;font-weight:bold}. ${APP.id}-auto-field>strong{color:#9d1714}. ${APP.id}-auto-field>small{color:#735f3c;font-weight:normal}
            .${APP.id}-recommended{margin:7px 0 10px;border:2px solid #7e211c;background:#f4e4b8}. ${APP.id}-recommended-head{display:flex;justify-content:space-between;gap:12px;padding:7px 9px;background:linear-gradient(to bottom,#f7e8c1,#edd49a);border-bottom:1px solid #c8913e}. ${APP.id}-recommended-head>div{display:grid;gap:2px}. ${APP.id}-recommended-head span{color:#5e3b16;font-size:11px}. ${APP.id}-recommended-head strong{color:#9d1714;font-size:15px}. ${APP.id}-match{display:flex;gap:16px;flex-wrap:wrap;padding:6px 8px;border-top:1px solid #d5b579;background:#f1dca7}. ${APP.id}-total td{background:#ead196!important;font-weight:bold}. ${APP.id}-recommended-row td{background:#f3e5b5!important}. ${APP.id}-scroll td small{display:block;margin-top:2px;color:#735f3c}
            .${APP.id}-sim-wrap{margin:7px 0 10px;overflow:hidden}. ${APP.id}-sim-title{display:flex;align-items:center;gap:4px;padding:3px 5px;border:1px solid #d7bd74;background:linear-gradient(to bottom,#d7bd74 0%,#c49b4b 100%);color:#3b2508;font-weight:bold;font-style:italic}. ${APP.id}-sim-title img,.${APP.id}-sim-table img{width:16px;height:16px}. ${APP.id}-sim-title span{flex:1}. ${APP.id}-sim-meta{padding:5px 1px;color:#5e3b16}. ${APP.id}-sim-scroll{overflow-x:auto}. ${APP.id}-sim-table{width:100%;border-collapse:collapse;background:#f7e6bb}. ${APP.id}-sim-table th,.${APP.id}-sim-table td{padding:3px 3px;border:1px solid #d5b579;text-align:center;vertical-align:middle;white-space:nowrap;font-size:11px}. ${APP.id}-sim-table th{background:#ecd08a}. ${APP.id}-sim-side,.${APP.id}-sim-label{text-align:left!important;font-weight:bold}. ${APP.id}-sim-side{width:54px}. ${APP.id}-sim-label{width:58px}. ${APP.id}-sim-loss{color:#9b6f1b}. ${APP.id}-sim-remaining{color:#237a3b;font-weight:bold}. ${APP.id}-sim-wall{margin-top:3px;padding:3px 5px;border:1px solid #d5b579;background:#f7e6bb;font-weight:bold}
            .${APP.id}-mark-box{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 5px;padding:3px 5px;border:1px solid #7e211c;border-radius:3px;background:linear-gradient(to bottom,#f7e8c1,#edd49a);color:#3b2508;font:11px Verdana,Arial,sans-serif;box-shadow:0 1px 3px #0004;vertical-align:middle}. ${APP.id}-mark-box>[data-mark-status]{color:#5e3b16;font-weight:bold}. ${APP.id}-mark-box.${APP.id}-armed{border-color:#477328;background:linear-gradient(to bottom,#f2ebc8,#dce3ad)}
            #${APP.id}-report-open{display:block;margin:7px 0 9px;padding:5px 10px!important}
            #tp-theplaguept-script-bar {
                position: fixed !important;
                top: 8px !important;
                left: 414px !important;
                right: auto !important;
                bottom: auto !important;
                z-index: 2147483647 !important;
                width: auto !important;
                min-width: 0 !important;
                height: 34px !important;
                display: flex !important;
                flex-direction: row !important;
                align-items: center !important;
                justify-content: flex-start !important;
                gap: 5px !important;
                padding: 0 8px !important;
                box-sizing: border-box !important;
                pointer-events: none !important;
                overflow: visible !important;
                transform: none !important;
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
                overflow: visible !important;
            }
            
            #tp-theplaguept-script-bar > button:hover,
            #tp-theplaguept-script-bar > button:focus-visible,
            #tp-theplaguept-script-bar > * > button:hover,
            #tp-theplaguept-script-bar > * > button:focus-visible,
            #tp-theplaguept-script-bar #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:hover,
            #tp-theplaguept-script-bar #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:focus-visible,
            #tp-theplaguept-script-bar > #tp-od-est-launcher:hover,
            #tp-theplaguept-script-bar > #tp-od-est-launcher:focus-visible {
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
            #tp-theplaguept-script-bar #twp-troop-summary-launcher { order: 85 !important; }
            #tp-theplaguept-script-bar #auto-farm-a-toggle { order: 90 !important; }
            #tp-theplaguept-script-bar #tp-od-est-launcher { order: 92 !important; }
            #tp-theplaguept-script-bar #script-coleta-toggle { order: 94 !important; }
            
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
            
            @media (max-width: 1919px) {
                #tp-theplaguept-script-bar {
                    top: 50vh !important;
                    left: max(12px, calc((100vw - 1220px) / 2 + 8px)) !important;
                    right: auto !important;
                    bottom: auto !important;
                    width: 34px !important;
                    min-width: 34px !important;
                    height: auto !important;
                    min-height: 0 !important;
                    max-height: calc(100vh - 118px) !important;
                    flex-direction: column !important;
                    align-items: center !important;
                    justify-content: center !important;
                    gap: 5px !important;
                    padding: 8px 2px !important;
                    transform: translateY(-50%) !important;
                }
            
                #tp-theplaguept-script-bar > #auto-farm-a-toggle::after,
                #tp-theplaguept-script-bar > #script-coleta-toggle::after,
                #tp-theplaguept-script-bar > .tp-theplaguept-script-bar-item[data-tp-title]::after {
                    top: 50% !important;
                    left: 38px !important;
                    transform: translateY(-50%) !important;
                }
            
                #tp-theplaguept-script-bar [data-auto-farm-countdown],
                #tp-theplaguept-script-bar [data-script-coleta-countdown] {
                    top: 50% !important;
                    left: 38px !important;
                    transform: translateY(-50%) !important;
                }
            }
            #tp-theplaguept-script-bar>#${APP.id}-launcher{order:92!important;position:relative!important;width:30px!important;min-width:30px!important;max-width:30px!important;height:28px!important;margin:0!important;padding:0!important;display:inline-flex!important;align-items:center!important;justify-content:flex-start!important;gap:0!important;overflow:hidden!important;pointer-events:auto!important;cursor:pointer!important;border:1px solid #4f120f!important;border-radius:2px!important;background:linear-gradient(to bottom,#b33a34,#8f2420 55%,#681611)!important;box-shadow:inset 0 1px 0 #ffffff59,inset 0 -1px 0 #00000059,0 2px 5px #00000073!important;color:#fff!important;font:700 11px Verdana,Arial,sans-serif!important;text-shadow:1px 1px 1px #000!important;transition:width .18s ease,max-width .18s ease,gap .18s ease!important}
            #tp-theplaguept-script-bar>#${APP.id}-launcher:hover,#tp-theplaguept-script-bar>#${APP.id}-launcher:focus-visible{width:30px!important;max-width:30px!important;gap:0!important;background:linear-gradient(to bottom,#c4473e,#a02c27 55%,#7e1c17)!important}
            .${APP.id}-launcherIcon{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:17px!important;height:17px!important;min-width:17px!important;border-radius:50%!important;background:#f1d18a!important;color:#6d1712!important;font:bold 8px Arial,sans-serif!important;text-shadow:none!important;box-shadow:inset 0 1px 1px #fff8,0 1px 1px #000!important}. ${APP.id}-launcherLabel{max-width:0;opacity:0;overflow:hidden;white-space:nowrap;transition:max-width .18s ease,opacity .14s ease}. #${APP.id}-launcher:hover .${APP.id}-launcherLabel,#${APP.id}-launcher:focus-visible .${APP.id}-launcherLabel{max-width:210px;opacity:1}
            .${APP.id}-pulse{animation:${APP.id}-pulse 1.2s ease}. @keyframes ${APP.id}-pulse{0%,100%{box-shadow:0 1px 4px #0004}50%{box-shadow:0 0 0 4px #c43b3477,0 1px 4px #0004}}
            .${APP.id}-scroll{overflow-x:auto}. ${APP.id}-scroll table{width:100%;border-collapse:collapse;background:#f8e8bd}. ${APP.id}-scroll th,.${APP.id}-scroll td{padding:5px;border:1px solid #d5b579;text-align:right}. ${APP.id}-scroll th{background:#ead196;color:#3b2508}. ${APP.id}-scroll tr:nth-child(even) td{background:#f1dca7}. ${APP.id}-scroll th:first-child,.${APP.id}-scroll td:first-child{text-align:left}
            .${APP.id}-foot{font-size:11px;color:#735f3c} .${APP.id}-panel details{margin-top:8px;padding:6px;border:1px solid #d5b579;background:#f8e8bd}. ${APP.id}-panel summary{color:#5e3b16;font-weight:bold;cursor:pointer}. ${APP.id}-panel h4{margin:10px 0 5px;padding:3px 5px;border-bottom:1px solid #804000;background:linear-gradient(to bottom,#d7bd74 0%,#b98b3a 100%);color:#000;font-style:italic}
            @media(max-width:650px){.${APP.id}-cards{grid-template-columns:1fr}. ${APP.id}-inputs label,.${APP.id}-inputs input{width:100%}}
        `.replace(/\. /g, ".");
        document.head.appendChild(style);
    }
})();
