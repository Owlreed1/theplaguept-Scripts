// ==UserScript==
// @name           Defesa do diabo
// @description    Um conjunto de utilitários para defender (por exemplo, integridade da muralha, melhor visão geral de ataques)
// @version        1.3
// @include      **&screen=overview*
// @include      **t=*&screen=overview*
// @include      **&screen=settings*
// @include      **t=*&screen=settings*
// @include      **screen=overview_villages*
// @include      **t=*&screen=overview_villages*
// @include      **/*screen=place*
// @include      **t=*&screen=place*
// @include      **/*screen=map*
// @include      **t=*&screen=map*
// @include      **mode=view*
// @include      **t=*&screen=mail*mode=view*
// @include      **screen=memo*
// @include      **t=*&screen=memo*
// @include      **screen=forum*
// @include      **t=*&screen=forum*
// @include      **screen=info_village*
// @include      **t=*&screen=info_village*
// @include      **.tribalwars.com.pt/game.php?t=*&village=*&screen=overview_villages&mode=incomings*
// @updateURL      https://devilicious.dev/api/tw/scripts/user/devil_def_pack_public.user.js
// @downloadURL    https://devilicious.dev/api/tw/scripts/user/devil_def_pack_public.user.js
// @icon https://media.discordapp.net/attachments/1492266164901122118/1505372006290292857/ig_05a8886d4767d260016a0910bd3ce8819191596a40db1d6bcf.png?ex=6a0a626e&is=6a0910ee&hm=799782e75bc5c4f33de8e9f08695360176b4a0fc75a757946b21f00bd413ae20&=&format=webp&quality=lossless&width=350&height=350
// ==/UserScript==

/**
 Log de alterações
 * 0.1 - Script Inicial
 * 0.2 - Adicionar configurações de página para (e.g. Modo Noturno , valores de unidades )
 * 0.3 - Adicionar ataques a chegar de aldeias duplicada
 * 0.4 - Acelerador de performance: Adicionar total de Ataques a chegar OS (1 call) se não houver ataques a chegar
 * 0.5 - Adicionar visão geral de ataques a chegar melhorada + renomear para Devil's Def Pack, alguns arranjos VV
 * 0.6 - Adicionar 'Pedir OS' melhoradas
 * 0.7 - Adicionar tabela classificada para aldeias com OS + mostrar de as aldeias começam a ser atacadas
 * 0.8 - Adicionar suporte para renomear ataques achegar através do mapa
 * 0.9 - Adicionar botão de adicionar Pop retrabalhado -> Adicionar Pilha de Vida para o comando, adicionado muralhas < 20 na visão geral de Ataques a chegar, Adicionado reforços desligados configuráveis, arranjado o erro de quando a contagem ultrapassar 1000 ataques a chegar na visão geral não mostrar tudo. Adicionado botão de Encontrar Snipes.
 * 1.0 - Adicionar mais  funcionalidade de tela de chamada (Filtrar distancia vs Ataques a chegar)
 *     - Re-desenhado html de visão geral de ataques a chegar
 *     - Adicionado contador total de tropas na ferramenta de pilha de vida
 *     - Alguns pequenos melhoramentos QoL
 * 1.1 - Melhorada as configurações de Encontrar Snipes, Qol melhorias no renomeador de mapa.
 * 1.2 - Desviar em massa através do mapa implementado. QoL melhoria de visão de tropas para a praça de reunião e adicionado a seleção X aldeias no ecrã de mass suporte.
 *     - Novo opção de Encontrar Snipes: automaticamente preencher as tropas @ praça de reuniões.
 * 1.3 - Adicionado opção de agrupar a visão geral de ataques a chegar. + mass renomeador + reestruturar alguns códigos antigos.
* 1.4 - Adicionado suporte para mundos de sistema de nível tecnológico e limitado
 **/

if (typeof window.twLib === 'undefined') {
    window.twLib = {
        queues: null,
        init: function () {
            if (this.queues === null) {
                this.queues = this.queueLib.createQueues(5);
            }
        },
        queueLib: {
            maxAttempts: 3,
            Item: function (action, arg, promise = null) {
                this.action = action;
                this.arguments = arg;
                this.promise = promise;
                this.attempts = 0;
            },
            Queue: function () {
                this.list = [];
                this.working = false;
                this.length = 0;

                this.doNext = function () {
                    let item = this.dequeue();
                    let self = this;

                    if (item.action === 'openWindow') {
                        window.open(...item.arguments).addEventListener('DOMContentLoaded', function () {
                            self.start();
                        });
                    } else {
                        $[item.action](...item.arguments).done(function () {
                            item.promise.resolve.apply(null, arguments);
                            self.start();
                        }).fail(function () {
                            item.attempts += 1;
                            if (item.attempts < twLib.queueLib.maxAttempts) {
                                self.enqueue(item, true);
                            } else {
                                item.promise.reject.apply(null, arguments);
                            }

                            self.start();
                        });
                    }
                };

                this.start = function () {
                    if (this.length) {
                        this.working = true;
                        this.doNext();
                    } else {
                        this.working = false;
                    }
                };

                this.dequeue = function () {
                    this.length -= 1;
                    return this.list.shift();
                };

                this.enqueue = function (item, front = false) {
                    (front) ? this.list.unshift(item) : this.list.push(item);
                    this.length += 1;

                    if (!this.working) {
                        this.start();
                    }
                };
            },
            createQueues: function (amount) {
                let arr = [];

                for (let i = 0; i < amount; i++) {
                    arr[i] = new twLib.queueLib.Queue();
                }

                return arr;
            },
            addItem: function (item) {
                let leastBusyQueue = twLib.queues.map(q => q.length).reduce((next, curr) => (curr < next) ? curr : next, 0);
                twLib.queues[leastBusyQueue].enqueue(item);
            },
            orchestrator: function (type, arg) {
                let promise = $.Deferred();
                let item = new twLib.queueLib.Item(type, arg, promise);

                twLib.queueLib.addItem(item);

                return promise;
            }
        },
        ajax: function () {
            return twLib.queueLib.orchestrator('ajax', arguments);
        },
        get: function () {
            return twLib.queueLib.orchestrator('get', arguments);
        },
        post: function () {
            return twLib.queueLib.orchestrator('post', arguments);
        },
        openWindow: function () {
            let item = new twLib.queueLib.Item('openWindow', arguments);

            twLib.queueLib.addItem(item);
        }
    };

    twLib.init();
}

(async () => {
        const settings = {
            version: '1.4',
            get script() {
                return `def_pack_AF_v${this.version}`;
            },
            general: {
                night: {
                    text: 'Bônus noturno',
                    id: 'defPackNightMode'
                },
                duplicateChecker: {
                    text: 'Encontrar Repetidos',
                    id: 'defPackDuplicatesChecker'
                },
                incomingsOverviewEnhancement: {
                    text: 'Complementar "A chegar"',
                    id: 'defPackIncomingsOverviewEnhancements'
                },
                requestOSOverviewEnhancement: {
                    text: 'Apoio em Massa',
                    id: 'defPackRequestOSEnhancements'
                },
                useSanguTaggerSettings: {
                    text: 'Usar configs de tags Sangu',
                    id: 'defPackUseSanguTaggerSettings'
                },
                showNextIncBrowserTab: {
                    text: 'Ver mais de 1000 Ataques',
                    id: 'defPackShowNextIncBrowserTab'
                },
                addStackHealthMap: {
                    text: 'Quantidades de tropas no mapa',
                    id: 'defPackAddStackHealthMap'
                }
            },
            boostData: {
                wall: {type: 'b_walleffectiveness'},
                unit_sword: {type: 'b_unitstat', description: 'defense_all'},
                unit_spear: {type: 'b_unitstat', description: 'defense_all'},
                unit_archer: {type: 'b_unitstat', description: 'defense_all'},
                unit_heavy: {type: 'b_unitstat', description: 'defense_all'},
                unit_axe: {type: 'b_unitstat', description: 'attack'},
                unit_light: {type: 'b_unitstat', description: 'attack'},
                unit_marcher: {type: 'b_unitstat', description: 'attack'},
                benefit_resist_demolition: {type: 'b_resistdemolition'}
            },
            standard: {
                stackData: {
                    OK: {
                        clears: 10,
                        color: 'darkgreen',
                        message: 'Bunkada',
                        population: 1100000,
                        bgColor: '#FF6347'
                    },
                    STACK_MORE: {
                        clears: 5,
                        color: 'darkblue',
                        message: 'Semi Bunkada!',
                        population: 60000,
                        bgColor: '#3CB371'
                    },
                    NOK: {
                        clears: 0,
                        color: 'red',
                        message: 'Escasso',
                        population: 0,
                        bgColor: '#DED3B9'
                    }
                },
                offBoosts: {axe: 30, light: 30, marcher: 8},
                offTechLevels: {axe: 3, light: 3, marcher: 3, ram: 3, catapult: 3},
            clear: {axe: 5700, spy: 30, light: 2900, marcher: 0, heavy: 0, ram: 300, catapult: 100},
            taggerData: {
                OK: {tag: '[OK]', message: 'Ok'},
                CHECK_STACK: {tag: '[Vigiar]', message: 'Ver'},
                DODGE: {tag: '[Desviar]', message: 'Desviar'},
                SNIPED: {tag: '[Apoiar]', message: 'Def.'},
                SNIPE_THIS: {tag: '[Snipar]', message: 'Snipar'}
                }
            },
            troopPop: {spear: 1, sword: 1, axe: 1, archer: 1, spy: 2, light: 4, marcher: 5, heavy: 4, ram: 5, catapult: 8, knight: 1},
            reservedWords: [ // Thank you Sangu!
                "Edel.", "Edelman",
                "Ram", "Kata.", "Katapult",
                "Zcav.", "Zware cavalerie",
                "Lcav.", "Lichte Cavalerie", "Bereden boog", "Bboog.",
                "Verk.", "Verkenner",
                "Bijl", "Zwaard", "Speer", "Boog",
                "Ridder"
            ],
            backend: 'https://devilicious.dev',
            images: {
                clear: `graphic/unit/att.png`,
                edit: `graphic/edit.png`,
                flag: (level) => `graphic/flags/small/${!level || level < 1 ? 1 : level}.png`,
                offBoost: `graphic/icons/benefit_resist_demolition.png`,
                techLevels: `graphic/overview/research.png`,
                get snipe() {
                    return `${settings.backend}/assets/img/snipe.png`;
                },
                settings: `graphic/icons/settings.png`,
                support: `/graphic/command/support.png`,
                get lucifer() {
                    return `${settings.backend}/assets/img/lucifer.png`;
                },
                OK: 'https://cdn2.iconfinder.com/data/icons/weby-interface-vol-1-1/512/s_Approved-check-checkbox-confirm-green-success-tick-512.png',
                NOK: 'https://cdn4.iconfinder.com/data/icons/icocentre-free-icons/114/f-cross_256-512.png',
                NO_TAG: 'https://cdn0.iconfinder.com/data/icons/shift-free/32/Block-512.png',
                snobs: {
                    get OK() {
                        return settings.images.OK;
                    },
                    CHECK: 'https://cdn0.iconfinder.com/data/icons/shopping-and-ecommerce-15/512/sale_lineal_color_cnvrt-18-256.png',
                    get NOK() {
                        return settings.images.NOK;
                    }
                }
            },
            commands1000Overflow: 'Nota: Mais de 1000 entradas; apenas as primeiras 1000 entradas serão mostradas.',
            incomingOverview: {
                nobleFilters: {
                    OK: '.quickedit-label:containsAnyWord(OK, SNIPED)',
                    CHECK: '.quickedit-label:containsAnyWord(CHECK)',
                    NOK: '.quickedit-label:not(:containsAnyWord(OK, SNIPED, CHECK))'
                }
            },
            maxAttackFlagPercentage: 10,
            maxOsBoost: 35,
            storageKeys: {
                config: `defPackConfig_${game_data.world}`,
                dateSelection: 'defPack_incomingsCustomDateSelection',
                defPackSettings: 'defPackSettings',
                selectVillages: 'defPack_selectVillages',
                snipeSettings: 'defPack_snipeSettings',
                supportTroopSettings: 'defPack_supportTroopSettings',
                techLevels: 'defPack_techLevels'
            },
            refreshPeriod: 24,
            tech: {
                LEVELS: 1,
                NORMAL: 2
            }
        };
        let userData = {};
        let snipeSettings = {};
        let config = {};
        let techLevels = {};
        Number.prototype.round = function (places) {
            return +(Math.round(this + "e+" + places) + "e-" + places);
        };
        $.expr[":"].contains = $.expr.createPseudo(function (arg) {
            return function (elem) {
                return $(elem).text().toUpperCase().indexOf(arg.toUpperCase()) >= 0;
            };
        });
        $.expr[":"].containsAnyWord = $.expr.createPseudo(function (arg) {
            return function (elem) {
                return arg.replace(/\s+/g, '').split(',').map((a) => containsWord($(elem).text().toUpperCase(), a.toUpperCase())).includes(true);
            };
        });
        String.prototype.toCoord = function (objectified) {
            let c = this.match(/\d{1,3}\|\d{1,3}/g).pop();
            return (objectified) ? {x: c.split('|')[0], y: c.split('|')[1]} : c;
        };
        String.prototype.getDateString = function () {
            let c = this.match(/(^|\W)hoje|amanhã|\d{1,2}\.\d{1,2}($|\W)/);
            return (c) ? c[0].trim() : null;
        };
        String.prototype.capitalize = function () {
            return this.charAt(0).toUpperCase() + this.slice(1)
        }

        window.convertToDate = (twDate) => {
            const t = twDate.match(/\d+:\d+:\d+.\d+/);
            const serverDate = $('#serverDate').text().replace(/\//g, '-').replace(/(\d{1,2})-(\d{1,2})-(\d{4})/g, '$3-$2-$1');
            let date = new Date(serverDate + ' ' + t);

            if (twDate.match('amanhã')) {
                date.setDate(date.getDate() + 1);
                return date;
            } else if (twDate.match(/\d+\.\d+/)) {
                let monthDate = twDate.match(/\d+\.\d+/)[0].split('.');
                return new Date(date.getFullYear() + '-' + monthDate[1] + '-' + monthDate[0] + ' ' + t);
            } else {
                return date;
            }
        }
        const coordToObject = (coords) => {
            let c = coords.match(/\d{1,3}\|\d{1,3}/g).pop();
            return {x: c.split('|')[0], y: c.split('|')[1]};
        };

        function containsWord(str, word) {
            return str.match(new RegExp("\\b" + word + "\\b", "i")) != null;
        }

        const loadSnipeSettings = () => {
            snipeSettings = JSON.parse(localStorage.getItem(settings.storageKeys.snipeSettings)) || {};
            if (snipeSettings.units === undefined) snipeSettings.units = Object.keys(config.unitSpeedSettings).map((u) => {
                return {unit: u, enabled: false, amount: 1}
            });
            localStorage.setItem(settings.storageKeys.snipeSettings, JSON.stringify(snipeSettings));
        }

        loadUserData();

        if (game_data.features.Premium.active) {
            if ($('#questlog').length < 1) {
                $('.maincell').prepend(`
        <div style="position:fixed;">
            <div id="questlog" class="questlog">
            </div>
        </div>`);
            }
            $("#questlog").append(
                `<div class="quest opened defPack_questSnipeFinder" style="background-image: url('${settings.images.snipe}');">
        <div class="quest_progress" style="width: 0%;"></div>
    </div>`).append(
                `<div class="quest opened defPack_settingsButton" style="background-size: 26px; background-image: url('${settings.images.lucifer}')">
        <div class="quest_progress" style="width: 0%;"></div>
    </div>`
            );
            $('.defPack_questSnipeFinder').click(() => {
                openSnipeInterface();
            });
            $('.defPack_settingsButton').click(() => {
                const html = `
                <div style="min-width: 600px; min-height: 260px">
                    <div style="display: flex; justify-content: space-around;">
                        <div style="flex-grow: 1;">
                            <img style="float: left" src='${settings.images.lucifer}'>
                        </div>
                        <div style="flex-grow: 1; text-align: center">
                            <h2 style="padding-top: 15px"></h2>
                        </div>
                        <div style="flex-grow: 1;">
                            <img style="float: right" src='${settings.images.lucifer}'>
                        </div>
                    </div>
                    <div>
                        <table style="width: 100%;">
                        <tbody>
                        <tr>
                            <td valign="top" style="border: 1px solid #7d510f; background-color: #f4e4bc; height: 200px">
                                <table class="vis modemenu" style="width: 215px;">
                                    <tbody>
                                        <tr><td style="cursor: pointer; background-color: #cdad6d; font-weight: bold" class="defPack_settingMenu" data-setting="general"><img src="${settings.images.settings}"> Configurações Gerais</td></tr>
                                        <tr><td style="cursor: pointer; background-color: #cdad6d; font-weight: bold" class="defPack_settingMenu" data-setting="clear"><img src="${settings.images.clear}"> Configurar Full</td></tr>
                                        <tr><td style="cursor: pointer; background-color: #cdad6d; font-weight: bold" class="defPack_settingMenu" data-setting="offBoost"><img src="${settings.images.offBoost}"> Boosts Atacante</td></tr>
                                        ${config.worldSettings.tech === settings.tech.LEVELS ?
                    `<tr><td style="cursor: pointer; background-color: #cdad6d; font-weight: bold" class="defPack_settingMenu" data-setting="techLevels"> <img src="${settings.images.techLevels}"> Nivel de Pesquisa</td></tr>`
                    : ''}
                                        <tr><td style="cursor: pointer; background-color: #cdad6d; font-weight: bold" class="defPack_settingMenu" data-setting="stackHealth"><img width="16px" src="${settings.images.OK}"> Configurar Bunkers</td></tr>
                                        <tr><td style="cursor: pointer; background-color: #cdad6d; font-weight: bold" class="defPack_settingMenu" data-setting="tagger"><img src="${settings.images.edit}"> Configurar tags</td></tr>
                                    </tbody>
                                </table>
                            </td>
                            <td valign="top" style="border: 1px solid #7d510f; background-color: #f4e4bc; width: 80%; height: 200px">
                                <table class="vis" style="width: 100%; height: 100%;" data-setting="general">
                                    <thead>
                                        <th colspan="2"><img src="${settings.images.settings}"> Configurações Gerais</th>
                                    </thead>
                                    <tbody>
                                        ${Object.keys(settings.general).map(setting =>
                    `<tr>
                                                <td>${settings.general[setting].text}</td>
                                                <td><input type="checkbox" id="${settings.general[setting].id}"></td>
                                            </tr>`).join('')}
                                    </tbody>
                                </table>
                                <table class="vis" style="width: 100%; height: 100%;display: none" data-setting="clear">
                                    <thead>
                                        <th><img src="${settings.images.clear}"> Configurar Full</th>
                                        <th><span class="icon header population"></span> <span class="defPack_settingsClearPop">${Object.keys(settings.standard.clear).reduce((a, b) => a + (userData.clear_data[b] * settings.troopPop[b]), 0)}</span></th>
                                    </thead>
                                    <tbody>
                                     ${Object.keys(settings.standard.clear).filter(unit => config.unitSpeedSettings[unit]).map(unit =>
                    `<tr>
                                            <td>
                                                <img src="graphic/unit/unit_${unit}.png" style="margin-right: 3px"><input type="input" id="defPack_${unit}" value="${userData.clear_data[unit]}">
                                            </td>
                                        </tr>`).join('')}
                                    </tbody>
                                </table>
                                <table class="vis" style="width: 100%;display: none" data-setting="offBoost">
                                    <thead>
                                        <th colspan="2"><img src="${settings.images.offBoost}"> Boosts Atacante</th>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>
                                            <img id="defPack_offFlag" width="16px" src="${settings.images.flag(userData.offFlag)}">
                                                <select id="defPack_offFlagBoostSelect">
                                                    ${[...Array(settings.maxAttackFlagPercentage)].map((_, percentage) => `
                                                    <option value="${percentage}">
                                                        ${percentage === 0 ? 'Sem Bandeira' : `+${percentage + 1}% Força de ataque`}
                                                    </option>`).join('')}
                                                </select>
                                            </td>
                                        </tr>
                                    ${Object.keys(settings.standard.offBoosts).filter(unit => config.unitSpeedSettings[unit]).map(unit =>
                    `<tr>
                                          <td style="height: 20px;">
                                            <img src="graphic/unit/unit_${unit}.png" style="margin-right: 3px"><input style="width: 10%" type="input" id="defPack_OffBoost_${unit}" value="${userData.offBoosts[unit]}">%
                                          </td>
                                        </tr>`).join('')}
                                    </tbody>
                                </table>
                                 ${config.worldSettings.tech === settings.tech.LEVELS ?
                    `<table class="vis" style="width: 100%; display: none" data-setting="techLevels">
                                    <thead>
                                         <th colspan="2"><img src="${settings.images.techLevels}"> Nivel de Pesquisa (0-3) Max:13</th>
                                    </thead>
                                    <tbody>
                                    ${Object.keys(settings.standard.offTechLevels).map(unit =>
                        `<tr>
                                                  <td width="20%">${unit}</td>
                                                  <td width="80%">
                                                      <img src="graphic/unit/unit_${unit}.png" style="margin-right: 3px"><input style="width: 10%" type="input" id="defPack_OffTechLevel_${unit}" value="${userData.offTechLevels[unit]}">
                                                  </td>
                                             </tr>`).join('')}
                                    </tbody>
                                </table>` : ''}
                                <table class="vis" style="width: 100%; display: none" data-setting="stackHealth">
                                    <thead>
                                        <th colspan="2"><img width="16px" src="${settings.images.OK}"> Configurar Bunkers</th>
                                    </thead>
                                    <tbody>
                                     ${Object.keys(settings.standard.stackData).filter(data => data !== 'NOK').map(data =>
                    `<tr>
                                            <td width="30%"><strong style="color: ${settings.standard.stackData[data].color}">${settings.standard.stackData[data].message}</strong></td>
                                            <td width="70%">
                                               Mais de <input type="input" class="defPackStackData_${data}" data-value="clears" value="${userData.stack_data[data].clears}"> Fulls
                                            </td>
                                        </tr>
                                        <tr>
                                            <td width="30%" style="background-color: ${settings.standard.stackData[data].bgColor}"><strong>Stack bg Color</strong></td>
                                            <td width="70%">
                                               Mais de <span class="icon header population"> </span> <input type="input" class="defPackStackData_${data}" data-value="population" value="${userData.stack_data[data].population}">
                                            </td>
                                        </tr>`).join('')}
                                    </tbody>
                                </table>
                                <table class="vis" style="width: 100%; display: none" data-setting="tagger">
                                    <thead>
                                        <th colspan="2"><img src="${settings.images.edit}"> Configurar tags</th>
                                    </thead>
                                    <tbody>
                                    ${Object.keys(settings.standard.taggerData).map(data =>
                    `<tr>
                                            <td width="20%">${settings.standard.taggerData[data].message}</td>
                                            <td width="80%">
                                               <input style="width: 98%;" type="input" id="defPackTaggerData_${data}" value="${userData.tagger_data[data].tag}">
                                            </td>
                                        </tr>`).join('')}
                                    </tbody>
                                </table>
                        </tr>
                        </tbody>
                    </table>
                    </div>
                </div>`;
                Dialog.show('defPackSettings', html);

                $('.defPack_settingMenu').click(function () {
                    $('table[data-setting]').hide();
                    $(`[data-setting=${$(this).data('setting')}]`).show();
                });
                $('#defPackNightMode').prop('checked', userData.nightEnabled);
                $('#defPackDuplicatesChecker').prop('checked', userData.duplicatesCheckerEnabled);
                $('#defPackIncomingsOverviewEnhancements').prop('checked', userData.incomingsOverviewEnhancementEnabled);
                $('#defPackRequestOSEnhancements').prop('checked', userData.requestOSEnhancementEnabled);
                $('#defPackUseSanguTaggerSettings').prop('checked', userData.useSanguTaggerSettings);
                $('#defPackShowNextIncBrowserTab').prop('checked', userData.showNextIncBrowserTab);
                $('#defPackAddStackHealthMap').prop('checked', userData.addStackHealthMap);
                $(`#defPack_offFlagBoostSelect option[value="${userData.offFlag}"]`).attr('selected', 'selected');

                addInputChangeListenersOnSettingsPage();
            });
        }

        const addSnipeButton = (el) => {
            const arrivalTimes = $(el).text().trim().match(/(\d+.\d+.\d+)\s+(\d+:\d+:\d+:\d+)/g);
            $(el).find('img[src*="attack"]').each((i, img) => {
                const targetSpan = $(img).prevAll('b:contains("Dorp:"):first').next('span');
                if (targetSpan.length) {
                    $(img).before(
                        `<img title="Snipe" class="defPack_snipePm" src="${settings.images.snipe}" style="cursor: pointer;" data-target=${targetSpan.data('id')} data-coords=${targetSpan.find('a:first').text().toCoord()} data-arrival-time="${arrivalTimes[i]}">`
                    );
                    $(img).before(
                        `<a style="margin-right: 2px; " target="_blank" href="${game_data.link_base_pure}place&mode=call&arrivalTime=${arrivalTimes[i]}&target=${targetSpan.data('id')}"><img title="Mass Support" src="${settings.images.support}" data-arrival-time="${arrivalTimes[i]}"></a>`
                    );
                }
            });
        }
        const addSnipeClickListener = () => {
            $('.defPack_snipePm').click(function () {
                openSnipeInterface($(this).data('coords'), $(this).data('arrival-time'), $(this).data('target'), true);
            })
        }
        const getIncomings = (villageId = game_data.village.id) => twLib.get({url: game_data.link_base_pure.replace(/village=\d+/, `village=${villageId}`) + 'overview'});
        const loadProductionOverview = (mode, group) => twLib.get({url: game_data.link_base_pure + 'overview_villages&mode=' + mode + '&group=' + (group || 0) + '&page=-1&'});
        const addWithdrawCheckboxSupportFunctionality = (id) => {
            const supportTroopSettings = JSON.parse(localStorage.getItem(settings.storageKeys.supportTroopSettings)) || game_data.units.map((u) => {
                return {unit: u, enabled: true}
            });
            const applyCheckboxProperties = () => {
                supportTroopSettings.forEach((s) => $(`.defPack_unitSelection[data-unit="${s.unit}"]`).prop('checked', s.enabled));
            }
            const applyZeroValuesToInputs = (checked, selector) => {
                if (checked) $('.defPack_unitSelection:checkbox:not(:checked)').map((_, u) => $(u).data('unit')).each((_, r) => $(selector).find(`.unit-item-${r} input`).val(0));
            }
            $(`#${id} .unit_link`).each((_, unit) => $(unit).after(`<input type="checkbox" class="defPack_unitSelection" data-unit=${$(unit).data('unit')}>`));
            applyCheckboxProperties();
            $('.defPack_unitSelection').change(function () {
                const unit = $(this).data('unit');
                const input = $(`.unit-item-${unit} input`);
                input.val(this.checked ? $(input).attr('max') : 0);
                supportTroopSettings.filter((u) => u.unit === unit)[0].enabled = this.checked;
                localStorage.setItem(settings.storageKeys.supportTroopSettings, JSON.stringify(supportTroopSettings));
            });
            $('.troop-request-selector').change(function () {
                applyZeroValuesToInputs(this.checked, $(this).closest('tr'));
            });
            $('.troop-request-selector-all').change(function () {
                applyCheckboxProperties();
                applyZeroValuesToInputs(this.checked, $(this).closest('tbody'));
            });
        }
        const getTotalIncomingOsData = async (villageId) => {
            return new Promise((resolve, reject) => {
                twLib.get({
                    url: `${game_data.link_base_pure.replace(/village=\d+/, `village=${villageId}`)}place&mode=call`,
                    success: function (html) {
                        resolve($(html).find('#support_sum')[0].outerHTML)
                    }, error: function (error) {
                        reject(error);
                    }
                })
            });
        }
        const getIncomingSupportDataFor = (command) => twLib.get({
            url: `${game_data.link_base_pure}info_command&ajax=details&id=${command}`,
            async: false
        }).then((response) => response.units);

        const cachePlayerTechLevels = (html = document) => {
            techLevels = {};
            const unitIndexes = game_data.units.map((u) => {
                return {unit: u, index: $(html).find('#techs_table tbody tr:first').find(`img[src*=${u}]`).closest('th').index()}
            }).filter((unit) => unit.index > -1);
            $(html).find('#techs_table .row_a,#techs_table .row_b').each((_, row) => {
                const villageId = $(row).find('.quickedit-vn').data('id');
                const unitTechLevels = {};
                unitIndexes.forEach((unit) => unitTechLevels[unit.unit] = parseInt($(row).find(`td:eq(${unit.index}) > span:first`).text()) || 0);
                techLevels[villageId] = unitTechLevels;
            });
            localStorage.setItem(settings.storageKeys.techLevels, JSON.stringify(techLevels));
        }

        switch (game_data.screen) {
            case 'info_village':
                $('#commands_outgoings tr:first th:last, #commands_incomings tr:first th:last').after('<th>Snipe</th>')
                $('.command-row').each((i, el) => {
                    $(el).find('td:last').after(`<td style="text-align: center"><img class="defPack_snipeFinder" style="cursor: pointer" src="${settings.images.snipe}"/></td>`);
                })

                $('.defPack_snipeFinder').click(function () {
                    const tr = $(this).closest('tr');
                    const villageToBeSniped = $('table.vis td:eq(2)').text().toCoord();
                    const targetId = $('#template_form a').attr('href').match(/target=(\d+)/).pop();
                    const twDate = tr.find('td:eq(1)').text().trim();

                    openSnipeInterface(villageToBeSniped, twDate, targetId, true);
                });
                addWithdrawCheckboxSupportFunctionality('withdraw_selected_units_village_info');
                break;
            case 'mail':
                if ('view' === game_data.mode) {
                    $('.text').each((i, el) => {
                        addSnipeButton(el);
                    });
                    addSnipeClickListener();
                }
                break;
            case 'memo':
                $('.memo_container:visible .show_row td').each((i, el) => {
                    addSnipeButton(el);
                });
                addSnipeClickListener();
                break;
            case 'forum':
                $('.text').each((i, el) => {
                    addSnipeButton(el);
                });
                addSnipeClickListener();
                break;
            case 'overview_villages':
                const searchParams = new URLSearchParams(window.location.search);
                if ('incomings' === game_data.mode && searchParams.get('subtype').toLowerCase() === 'attacks') {
                    if ($('#incomings_form').length && userData.incomingsOverviewEnhancementEnabled) {
                        $(document).ajaxComplete(function (event, xhr, settings) {
                            if (settings.url.indexOf('partial') > -1) {
                                addEnhancedIncomingsTable();
                            }
                        });
                        addEnhancedIncomingsTable();
                    }
                } else if ('tech' === game_data.mode && config?.worldSettings?.tech === settings.tech.LEVELS) {
                    cachePlayerTechLevels();
                }
                break;
            case 'overview':
                const wall = game_data.village.buildings.wall || 0;
                const stackCheckerSettings = {
                    initialWall: wall,
                    wallParam: `&def_wall=${wall}`
                };
                let simulationUrl = await buildSimulationUrl(document, stackCheckerSettings.wallParam, game_data.village.id);
                twLib.get({url: `${simulationUrl}`, dataType: 'html'}).then((response) => {
                    stackCheckerSettings.clearsNeeded = $(response).find('#content_value').find('p').css('font-style', 'italic').find('b').text();
                    stackCheckerSettings.postClear = parseInt($(response).find('th:contains("Schade door rammen:")').next().find('b:last-child').text())
                    stackCheckerSettings.totalPopFromSimulation = $(response).find('td:contains("Verdediger")').closest('tr').find('td:last').first().text();

                    const data = configureHealthCheckValues(stackCheckerSettings);
                    const html =
                        `<div id="defPack_stackChecker" class="vis moveable widget">
                <h4 class="head with-button">Resistência: <strong style="color: ${data.color}">${data.message}</strong></h4>
                <div class="widget_content" style="display: block">
                    <table style="width: 100%">
                        <tbody>
                            <tr><td><strong>${(stackCheckerSettings.clearsNeeded.indexOf('meer dan 100') !== -1 ? stackCheckerSettings.clearsNeeded : (data.clears))}</strong> Full(s)</td></tr>
                            <tr>
                                <td>
                                    <strong>1°</strong> Full <img style="vertical-align: bottom;" src="graphic/unit/unit_ram.png" title="" alt="" class="">
                                    <img src="graphic/buildings/wall.png" title="" alt="" class=""> <strong>${stackCheckerSettings.initialWall}</strong> -> <strong style="color: ${data.color}"> ${(isNaN(stackCheckerSettings.postClear) ? stackCheckerSettings.initialWall : stackCheckerSettings.postClear)}</strong>
                                </td>
                            </tr>
                            <tr><td><small><a href='${simulationUrl}' target="_blank">Simular</a></small></td></tr>
                            <tr>
                                <td style="border-top: 1px solid #85550d; background-color: ${data.stackColor}"><span class="icon header population"> </span> <strong><a style="color:black" href="${game_data.link_base_pure}place&mode=units">${stackCheckerSettings.totalPopFromSimulation}</a></strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>`;
                    $('#show_buildqueue').after(html);

                    const sanguActive = localStorage.getItem('sangu_sanguActive');
                    const incomingsTable = $('#commands_incomings');
                    let arrivalIndex = -1;
                    if (sanguActive === 'true' && $('#sangu_activator').length > 0) {
                        incomingsTable.find('tr:eq(1) th:last').after(`<th><a class="btn" title="Add Stack Health to command" id="defPackAddPopToCommand">Add <span class="icon header population"></span></a></th>`);
                        $('td[colspan="4"], td[colspan="5"]').attr('colspan', 6);
                        $('#slowestUnitCell').attr('colspan', 2);
                        arrivalIndex = $('th:contains("Aankomst")').index();
                    } else {
                        incomingsTable.find('tr:first th:last').after(`<th><a class="btn" title="Add Stack Health to command" id="defPackAddPopToCommand">Add <span class="icon header population"></span></a></th>`);
                        $('td[colspan="3"], td[colspan="4"], th[colspan="4"]').attr('colspan', 5);
                        arrivalIndex = $('th:contains("Aankomst")').index();
                    }
                    incomingsTable.find('tr.command-row.no_ignored_command').each(function () {
                        const arrivalTime = $(this).find(`td:eq('${arrivalIndex}')`).text().trim();
                        $(this).find('.quickedit').before(
                            `<img title="Snipe" class="defPack_snipePm" src="${settings.images.snipe}" style="margin-right: 5px; cursor: pointer;" data-target=${game_data.village.id} data-coords=${game_data.village.coord} data-arrival-time="${arrivalTime}" alt="">`
                        );
                        const lastTd = $(this).find('td:last');
                        if ($(this).find('span img[src*="attack"]').length > 0) {
                            $(lastTd).after(`
                        <td style="text-align: center">
                            <input type="checkbox" class="defPackAddPopToCommand" checked>
                        </td>`
                            );
                        } else {
                            $(lastTd).after(`<td></td>`);
                        }
                    });
                    addSnipeClickListener();

                    $('#defPackAddPopToCommand').click(function () {
                        let checkedInputs = $('.defPackAddPopToCommand:checked');
                        checkedInputs.each(function () {
                            let commandId = $(this).closest('tr').find('span img[src*="attack"]').parent().attr('data-command-id');
                            let commandMessage = $.trim($('span.quickedit[data-id="' + commandId + '"]').find('span.quickedit-label').text());
                            const incomingCommands = $('#commands_incomings tr.command-row.no_ignored_command');
                            let totalClears = incomingCommands.find('img[src*="attack"]').closest('tr').not(':has(img[src*="snob"])').length;
                            let totalSnobs = incomingCommands.find('img[src*="snob"]').length;

                            if (commandMessage.indexOf('(Stack = ') === -1) {
                                renameCommand(commandId, commandMessage + ' mata ' +recalculateClearsNeeded(stackCheckerSettings) +'F => ' + totalClears + 'F & ' + totalSnobs + 'N');
                            } else if (commandMessage.indexOf('(Stack = ') > -1) {
                                renameCommand(commandId, commandMessage.replace(commandMessage.split('Mata')[1], recalculateClearsNeeded(stackCheckerSettings) + 'Fulls => ' + totalClears + ' C/' + totalSnobs + ' N)'));
                            }
                        })
                    })
                });
                break;
            case 'place':
                if (game_data.mode === null && new URLSearchParams(window.location.search).get('type') === 'snipe') {
                    loadSnipeSettings();
                    Array.from(snipeSettings.units).filter((u) => u.enabled && u.amount > 0).forEach((t) => $(`#unit_input_${t.unit}`).val(t.amount));
                }
                if (game_data.mode === 'call' && userData.requestOSEnhancementEnabled) {
                    const searchParams = new URLSearchParams(window.location.search);
                    // OCD center everything!
                    $('#support_sum').css('text-align', 'center');
                    $('.call-village').each((i, r) => $(r).find('a').closest('td').prepend(`<strong>#${i + 1} | </strong>`));
                    $('.evt-button-fill').after(`
                | <input type="checkbox" id="defPack_selectVillagesCheckBox"/>
                Selecionar <input style="width: 10%" type="number" min="0" id="defPack_selectVillages" value="${localStorage.getItem(settings.storageKeys.selectVillages) || 0}"/> Aldeias
                | <input type="button" class="btn btn-default" style="${searchParams.get('sources') ? '' : 'display:none'}" id="defPack_selectVillagesFromUrl" value="Selecionar (${searchParams.get('sources')?.split(',').length}) Aldeias do desvio em Massa"/>
            `);
                    $('#defPack_selectVillagesCheckBox').off().on('click', function () {
                        const villagesToSelect = $('#defPack_selectVillages').val();
                        localStorage.setItem(settings.storageKeys.selectVillages, villagesToSelect);
                        $(`.troop-request-selector:lt(${villagesToSelect})`).prop('checked', this.checked).trigger('change');
                    });
                    $('#defPack_selectVillagesFromUrl').click(() => {
                        searchParams.get('sources').split(',').forEach((source) => $(`#call_village_${source} .troop-request-selector`).prop('checked', true).trigger('change'));
                    });
                    $(window).bind('load', function () {
                        $('.evt-button-fill').click(() => calculateSupportPopulationPreview());
                    });

                    const unitsInTable = $('#support_sum tbody tr:first td').map(function () {
                        return $(this).data('unit');
                    }).get();
                    const getCustomArrivalTime = (element) => {
                        // dd.mm.yyyy hh:MM:ss:SSS support
                        // Aankomsttijd: 27.11.20 20:09:32:959
                        const matchDateFormat = element.val().match(/(\d+.\d+.\d+)\s+(\d+:\d+:\d+:\d+)/);
                        let timeTobeSnipedAt = convertToDate(element.val());

                        if (matchDateFormat) {
                            const matchDateFormatElement = matchDateFormat[0];
                            // Check if date is formatted as dd.mm.yy not dd.mm.yyyy
                            if (matchDateFormatElement.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g)) {
                                timeTobeSnipedAt = new Date(matchDateFormatElement.replace(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g, '$3-$2-$1'));
                            } else {
                                timeTobeSnipedAt = new Date(new Date().getFullYear() + '-' + matchDateFormatElement.replace(/(\d{1,2})\.(\d{1,2})\.(\d{1,4})/g, '$2-$1'));
                            }
                        }
                        return timeTobeSnipedAt / 1000;
                    }

                    $('#place_call_form').before(`
                <div id="defPack_requestSupportEnhancements" class="vis" style="display: none">
                    <h3 style=" text-align: center;"> Preview OS - Selected <b>0</b> villages</h3>
                    <table id="defPack_requestOSTable" class="vis overview_table" width="100%" style="text-align: center;">
                        <thead>
                            <tr>
                                ${Object.keys(unitsInTable).map(unit =>
                        `<th style="text-align:center" width="35"><a href="#" class="unit_link" data-unit="${unitsInTable[unit]}"><img src="/graphic/unit/unit_${unitsInTable[unit]}.png"></a></th>`
                    ).join('')}
                                <th class="center" style="width: 35px" title="Bevolking">
                                    <span class="icon header population"> </span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                        </tbody>
                    </table>
            `);

                    $(document).on('change', '.troop-request-selector', function () {
                        const selectedVillagesLength = $("#village_troup_list tr:not(:first) input[type=checkbox]:checked").length;
                        $('#defPack_requestSupportEnhancements h3 b').text(`${selectedVillagesLength}`);
                        calculateSupportPopulationPreview();
                        if (selectedVillagesLength <= 0) $('#defPack_requestSupportEnhancements').hide(); else $('#defPack_requestSupportEnhancements').show();
                    });
                    $('#village_troup_list tbody tr td input').on('input', () => calculateSupportPopulationPreview());
                    $('.unit_checkbox').change(function () {
                        filterVillages(getSlowestUnit(), parseInt($('#defPack_incomingsSelection').val()) || getCustomArrivalTime($('#defPack_incomingsCustomDateSelection')));
                    });
                    $.when(getIncomings()).done(function (html) {
                        const validateInput = () => {
                            const snipeTime = $('#defPack_incomingsCustomDateSelection');

                            const invalidInputs = !snipeTime.val().match(/(\d+.\d+.\d+)\s+(\d+:\d+:\d+:\d+)/);
                            $('#defPack_incomingsCustomDateButton').prop('disabled', invalidInputs);
                        }

                        const rows = $(html).find('.no_ignored_command img[src*="attack"]').map(function () {
                            return $(this).closest('tr');
                        }).get();

                        const selectedVillageToOs = $('.village-name').text().toCoord();

                        $('#place_call_form table').before(`
                        <table id="defPack_callScreenTable" class="vis" width="100%">
                            <tbody>
                                <tr>
                                    <th width="75%" colspan="6">
                                        <input type="checkbox" id="defPack_callScreenFilterVillages" title="Filter all unusable villages">
                                        Ocultar aldeias depois de:
                                    </th>
                                </tr>
                            <tr></tr>
                            </tbody>
                        </table>`);

                        if (rows.length > 0 && selectedVillageToOs === game_data.village.coord) {
                            const selectOptions = createOptions(rows);

                            $('#defPack_callScreenTable th').append(`<select style="margin-left: 6px; display: none" id="defPack_incomingsSelection">${selectOptions}</select>`);
                            const incomingSelection = $('#defPack_incomingsSelection');
                            $('#defPack_callScreenFilterVillages').change(() => incomingSelection.toggle() && filterVillages(getSlowestUnit(), parseInt(incomingSelection.val())));
                            incomingSelection.change(() => filterVillages(getSlowestUnit(), parseInt(incomingSelection.val())));
                        } else {
                            $('#defPack_callScreenTable th').append(`
                        <input id="defPack_incomingsCustomDateSelection" value="${localStorage.getItem(settings.storageKeys.dateSelection) || ''}" style="margin-left: 6px; display: none; width: 200px" class="toggle-it" type="text" placeholder="dd.mm.yyyy hh:mm:ss:SSS"/>
                        <input id="defPack_incomingsCustomDateButton" style="display: none" class="btn toggle-it" value="Filter">
                    `);
                            validateInput();
                            $('#defPack_incomingsCustomDateSelection').on('keyup', validateInput);

                            $('#defPack_incomingsCustomDateButton').click(function () {
                                const dateInput = $('#defPack_incomingsCustomDateSelection');
                                localStorage.setItem(settings.storageKeys.dateSelection, dateInput.val());
                                filterVillages(getSlowestUnit(), getCustomArrivalTime(dateInput));
                            });

                            $('#defPack_callScreenFilterVillages').change(() => $('.toggle-it').toggle());
                        }

                        const searchParams = new URLSearchParams(window.location.search);
                        const arrivalTime = searchParams.get('arrivalTime');
                        if (arrivalTime) {
                            $('#defPack_incomingsCustomDateSelection').val(arrivalTime);
                            localStorage.setItem(settings.storageKeys.dateSelection, arrivalTime);
                            validateInput();
                            $('#defPack_callScreenFilterVillages, #defPack_incomingsCustomDateButton').click();
                        }
                    });
                } else if (game_data.mode === 'units') {
                    addWithdrawCheckboxSupportFunctionality('units_away');
                    $('#units_home tbody tr:nth-child(n+3):not(:nth-last-child(-n+2))').sort(function (a, b) {
                        return parseFloat($(a).find('td:eq(2)').text()) > parseFloat($(b).find('td:eq(2)').text()) ? 1 : -1;
                    }).appendTo('#units_home tbody');
                    // Append the last 2 rows of the original table
                    $('#units_home tbody tr:nth-child(n+3):nth-child(-n+4)').appendTo('#units_home tbody');

                    const villages = $('#units_home a[href*="screen=info_village"]').map(function () {
                        return $(this).attr('href').match(/id=(\d+)/)[1]
                    }).get();

                    if (villages.length > 0) {
                        $.when(loadProductionOverview('prod')).done(function (html) {
                            const villagesUnderAttack = $(html).find('#production_table img[src*="graphic/command/attack.png"]').map(function () {
                                return $(this).closest('*[data-id]').attr('data-id');
                            }).get();

                            villages
                                .filter(village => villagesUnderAttack.includes(village))
                                .forEach((vil) => $(`span[data-id="${vil}"] a:first`).prepend(`<img src="graphic/command/attack.png" alt="" title="Under Attack!"> `));
                        });
                    }
                }
                break;
            case 'map':
                const mapTaggerSettings = getTaggerSettings();

                const mapTaggerHtml =
                    `
                <table id="defPack_mapTaggerSettings" class="vis" style="width: 100%;">
                    <thead>
                        <tr><th colspan="3">Utilitários</th></tr>
                    </thead>
                    <tbody>
                        <tr><td><input type="checkbox" id="defPack_mapTagger"></td><td style="cursor:pointer;" colspan="2">Renomear</td></tr>
                        <tr class="defPack_mapTaggerTr" style="display: none">
                            <td>Villages</td>
                            <td>
                                <textarea id="defPack_mapTaggerTextArea" disabled rows="5" style="width: 97%;"></textarea>
                            </td>
                        </tr>
                        <tr class="defPack_mapTaggerTr" style="display: none">
                            <td>Tag</td>
                            <td>
                                <button data-rename-to="${mapTaggerSettings.ok}">OK</button>
                                <button data-rename-to="${mapTaggerSettings.checkStack}">Ver</button>
                                <button data-rename-to="${mapTaggerSettings.dodge}">Desviar</button>
                                <button data-rename-to="${mapTaggerSettings.sniped}"">Def.</button>
                                <button data-rename-to="${mapTaggerSettings.snipeThis}"">Snipar</button>
                                <br>
                                <input type="text" id="defPack_mapTaggerText" name="Tag">
                                <a id="defPack_mapTaggerBtn" class="btn">Tag!</a>
                                <div id="defPack_mapTaggingProgressBar" class="progress-bar live-progress-bar progress-bar-alive" style="display: none">
                                    <div></div>
                                    <span class="label"></span>
                                </div>
                            </td>
                        </tr>
                        <tr><td><input type="checkbox" id="defPack_mapMassSupport"></td><td style="cursor:pointer;" colspan="2">Desviar</td></tr>
                        <tr class="defPack_mapDodgerTr" style="display: none">
                            <td>Villages</td>
                            <td>
                                <textarea id="defPack_mapDodgerTextArea" disabled rows="5" style="width: 97%;"></textarea>
                            </td>
                        </tr>
                        <tr class="defPack_mapDodgerTr" style="display: none">
                            <td><img src="/graphic/buildings/place.png"></td>
                            <td>
                                <a id="defPack_mapMassSupportLink" href="#" target="_blank">Abrir Apoio em Massa</a>
                            </td>
                        </tr>
                    </tbody>
                </table>
            `;
                $('#map_search').before(mapTaggerHtml);

                $('#defPack_mapTagger').click(function () {
                    $('.defPack_mapTaggerTr').toggle();
                    commandsToRename.clear();
                    TWMap.reload();
                    refreshCoordList(new Set());
                });
                $('#defPack_mapMassSupport').click(function () {
                    $('.defPack_mapDodgerTr').toggle();
                    TWMap.reload();
                    refreshCoordList(new Set(), 'defPack_mapDodgerTextArea');
                });
                $('#defPack_mapTaggerBtn').click(function () {
                    renameCommandsWithProgressBar([...commandsToRename], 'mapTaggingProgressBar', 'mapTaggerText');

                    commandsToRename.clear();
                    TWMap.reload();
                });

                $('#defPack_mapTaggerSettings button').click(function () {
                    $('#defPack_mapTaggerText').val($(this).data('rename-to'));
                });

                let DS_Map = TWMap;
                DS_Map.map._DShandleClick = DS_Map.map._handleClick;

                let commandsToRename = new Set();
                let sources = new Set()
                TWMap.map._handleClick = function (e) {
                    if ($('#defPack_mapMassSupport').is(':checked')) {
                        const pos = this.coordByEvent(e);
                        const coord = pos.join("|");
                        const sourceId = TWMap.villages[(pos[0]) * 1000 + pos[1]].id;

                        if (Array.from(sources.values(), c => c.coords).includes(coord)) {
                            $('div').remove(`#defPack_villageOverLay_${sourceId}`);
                            sources.forEach(source => {
                                if (source.coords === coord) {
                                    sources.delete(source);
                                }
                            });
                        } else {
                            const mapVillageImage = $(`[id="map_village_${sourceId}"]`);
                            const mapVillageOverlay = {
                                id: 'defPack_villageOverLay_' + sourceId,
                                css: {
                                    'zIndex': '50',
                                    'position': 'absolute',
                                    'opacity': '0.3',
                                    'width': (TWMap.map.scale[0] - 1).toString() + 'px',
                                    'height': (TWMap.map.scale[1] - 1).toString() + 'px',
                                    'background': 'blue',
                                    'left': mapVillageImage.css('left'),
                                    'top': mapVillageImage.css('top')
                                }
                            };
                            mapVillageImage.after($("<div>", mapVillageOverlay));
                            sources.add({coords: coord, id: sourceId});
                        }
                        refreshCoordList(sources, 'defPack_mapDodgerTextArea');
                        return false;
                    } else if ($('#defPack_mapTagger').is(':checked')) {
                        const pos = this.coordByEvent(e);
                        const coord = pos.join("|");
                        const villageData = TWMap.villages[(pos[0]) * 1000 + pos[1]];

                        if (villageData) {
                            $.when(getIncomings(villageData.id)).done(function (html) {
                                const commands = $(html).find('.no_ignored_command img[src*="attack"]')
                                    .map((_, el) => {
                                        const row = $(el).closest('tr');
                                        return {
                                            id: $(row).find('[data-id]').data('id'),
                                            text: $(row).closest('td').find('.quickedit-label').text().trim(),
                                            coords: coord
                                        }
                                    }).get();

                                if (commands.length > 0) {
                                    if (Array.from(commandsToRename.values(), c => c.coords).includes(coord)) {
                                        $('div').remove('#defPack_villageOverLay_' + villageData.id);
                                        commandsToRename.forEach(command => {
                                            if (command.coords === coord) {
                                                commandsToRename.delete(command);
                                            }
                                        });
                                    } else {
                                        const mapVillageImage = $(`[id="map_village_${villageData.id}"]`);
                                        const mapVillageOverlay = {
                                            id: 'defPack_villageOverLay_' + villageData.id,
                                            css: {
                                                'zIndex': '50',
                                                'position': 'absolute',
                                                'opacity': '0.3',
                                                'width': (TWMap.map.scale[0] - 1).toString() + 'px',
                                                'height': (TWMap.map.scale[1] - 1).toString() + 'px',
                                                'background': 'blue',
                                                'left': mapVillageImage.css('left'),
                                                'top': mapVillageImage.css('top')
                                            }
                                        };
                                        mapVillageImage.after($("<div>", mapVillageOverlay));

                                        commands.forEach(command => commandsToRename.add(command));
                                    }
                                }
                                refreshCoordList(commandsToRename);
                            });
                        }
                        return false;
                    } else {
                        DS_Map.map._DShandleClick(e);
                        return false;
                    }
                };

                const cacheExtendedPopupData = async (id, cachedObject) => {
                    await twLib.get({url: `${game_data.link_base_pure.replace(/village=\d+/, `village=${id}`)}overview`}).then(async (html) => {
                        const incomings = $(html).find('#commands_incomings tbody tr.command-row.no_ignored_command');
                        const wall = cachedObject.buildings.wall || 0;
                        const stackCheckerSettings = {
                            initialWall: wall,
                            wallParam: `&def_wall=${wall}`
                        };

                        const simulationUrl = await buildSimulationUrl(html, stackCheckerSettings.wallParam, id);
                        await twLib.get({url: `${simulationUrl}`, dataType: 'html'}).then((response) => {
                            stackCheckerSettings.clearsNeeded = $(response).find('#content_value').find('p').css('font-style', 'italic').find('b').text();
                            stackCheckerSettings.postClear = parseInt($(response).find('th:contains("Schade door rammen:")').next().find('b:last-child').text())
                            stackCheckerSettings.totalPopFromSimulation = $(response).find('td:contains("Verdediger")').closest('tr').find('td:last').first().text();

                            const data = configureHealthCheckValues(stackCheckerSettings);
                            TWMap.popup.extendedMapPopupCache[id] = [
                                {
                                    header: 'A chegar',
                                    value: ['attack_small', 'attack_medium', 'attack_large', 'attack'].map((type) => `${incomings.find(`img[src*="graphic/command/${type}.png"]`).length} <img src="graphic/command/${type}.png">`).join(' ')
                                },
                                {
                                    header: ' Pop. Total',
                                    value: `<strong style="background-color: ${data.stackColor}"><span class="icon header population"></span> ${stackCheckerSettings.totalPopFromSimulation}</a></strong>`
                                },
                                {
                                    header: 'Resistência',
                                    value: `<strong style="color: ${data.color}">${data.message}</strong>`
                                },
                                {
                                    header: 'Fulls',
                                    value: `<strong>${(stackCheckerSettings.clearsNeeded.indexOf('meer dan 100') !== -1 ? stackCheckerSettings.clearsNeeded : (data.clears))}</strong> Fulls`
                                },
                                {
                                    header: 'Muralha',
                                    value: `<strong>1° Full</strong> <img style="vertical-align: bottom;" src="graphic/unit/unit_ram.png" title="" alt="" class="">
                                    <img src="graphic/buildings/wall.png" title="" alt="" class=""> <strong>${stackCheckerSettings.initialWall}</strong> -> <strong style="color: ${data.color}"> ${(isNaN(stackCheckerSettings.postClear) ? stackCheckerSettings.initialWall : stackCheckerSettings.postClear)}</strong>`
                                }
                            ];
                        });
                    })
                }
                const renderAdditionalInfo = async (village) => {
                    const mapStackHealth = () => (v) => `<tr class="defPack_mapExtendedInfo"><td>${v.header}</td><td>${v.value}</td></tr>`;

                    if (village && village.owner === game_data.player.id) {
                        const id = village.id;
                        const cachedObject = TWMap.popup._cache[id];
                        if (!TWMap.popup.extendedMapPopupCache[id] && cachedObject !== 'notanobject') {
                            await cacheExtendedPopupData(id, cachedObject);
                        }

                        $('.defPack_mapExtendedInfo').remove();
                        if (TWMap.popup.extendedMapPopupCache[id]) {
                            $('#map_popup #info_points_row').closest('tr').after(`${Object.values(TWMap.popup.extendedMapPopupCache[id]).map(mapStackHealth()).join('')}`);
                        }
                    }
                };
                const createDisplayForVillageHandler = () => async (e, a, t) => {
                    TWMap.popup._displayForVillage(e, a, t);

                    await renderAdditionalInfo(e);
                };

                if (userData.addStackHealthMap) {
                    TWMap.popup.extendedMapPopupCache = {};
                    TWMap.popup._displayForVillage = TWMap.popup.displayForVillage;
                    TWMap.popup.displayForVillage = createDisplayForVillageHandler();
                }
                break;
        }

        function getTaggerSettings() {
            const sanguActive = localStorage.getItem('sangu_sanguActive');
            const sanguSavedSettings = localStorage.getItem('sangu_sangusettings');
            const sanguSettings = sanguSavedSettings ? JSON.parse(sanguSavedSettings) : {};
            const useSanguSettings = sanguActive === 'true' && userData.useSanguTaggerSettings && sanguSettings.mainTagger2;
            return {
                ok: useSanguSettings ? sanguSettings.mainTagger2.defaultDescription : userData.tagger_data.OK.tag,
                dodge: useSanguSettings ? sanguSettings.mainTagger2.otherDescs[0].renameTo : userData.tagger_data.DODGE.tag,
                checkStack: useSanguSettings ? sanguSettings.mainTagger2.otherDescs[2].renameTo : userData.tagger_data.CHECK_STACK.tag,
                sniped: userData.tagger_data.SNIPED.tag,
                snipeThis: userData.tagger_data.SNIPE_THIS.tag
            };
        }

        function renameCommandsWithProgressBar(commands, progressBarElement, taggerTextElement, incomingRows) {
            let progressBar = $(`#defPack_${progressBarElement}`), size = commands.length, index = 1;
            UI.InitProgressBars();
            UI.updateProgressBar(progressBar, 0, size);
            $(progressBar).show();

            commands.forEach((command) => {
                const textFromTagger = $(`#defPack_${taggerTextElement}`).val();
                const unit = settings.reservedWords.filter(word => command.text.toUpperCase().indexOf(word.toUpperCase()) !== -1);
                let newCommand = textFromTagger;
                if (unit.length > 0) {
                    newCommand = `${unit[0]} ${textFromTagger}`;
                }
                renameCommand(command.id, newCommand, true).done(function () {
                    UI.updateProgressBar(progressBar, index, size);
                    $(progressBar).find('span:last').css('color', index / size > 0.6 ? 'white' : 'black');
                    index++;
                    if (incomingRows) $(incomingRows).find(`span.quickedit[data-id="${command.id}"]`).find('span.quickedit-label').text(newCommand);
                })
            });
        }

        function loadUserData() {
            if (userData.length === undefined) {
                const savedData = localStorage.getItem(settings.storageKeys.defPackSettings);
                if (savedData !== null) {
                    userData = $.extend(true, userData, JSON.parse(savedData));
                    // Force add new settings if the user had an older version with other settings
                    if (userData.duplicatesCheckerEnabled === undefined) userData.duplicatesCheckerEnabled = true;
                    if (userData.incomingsOverviewEnhancementEnabled === undefined) userData.incomingsOverviewEnhancementEnabled = true;
                    if (userData.requestOSEnhancementEnabled === undefined) userData.requestOSEnhancementEnabled = true;
                    if (userData.clear_data === undefined) userData.clear_data = settings.standard.clear;
                    if (userData.stack_data === undefined) userData.stack_data = settings.standard.stackData;
                    if (userData.stack_data["NOK"].bgColor === undefined) {
                        userData.stack_data = settings.standard.stackData;
                    }
                    if (userData.tagger_data === undefined) userData.tagger_data = settings.standard.taggerData;
                    if (userData.useSanguTaggerSettings === undefined) userData.useSanguTaggerSettings = true;
                    if (userData.showNextIncBrowserTab === undefined) userData.showNextIncBrowserTab = true;
                    if (userData.addStackHealthMap === undefined) userData.addStackHealthMap = true;
                    if (userData.offBoosts === undefined) userData.offBoosts = settings.standard.offBoosts;
                    if (userData.offTechLevels === undefined) userData.offTechLevels = settings.standard.offTechLevels;
                    if (userData.offFlag === undefined) userData.offFlag = 0;
                    localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
                } else {
                    setToDefaultSettings();
                }
            }
            config = JSON.parse(localStorage.getItem(settings.storageKeys.config)) || {};
            techLevels = JSON.parse(localStorage.getItem(settings.storageKeys.techLevels)) || {};
            if (!config || !config?.lastCheckedAt || Math.abs(new Date().getTime() - new Date(config.lastCheckedAt).getTime()) / 36e5 > settings.refreshPeriod) {
                console.log('caching');
                cacheEveryConfig();
            }
        }

        function setToDefaultSettings() {
            userData.clear_data = settings.standard.clear;
            userData.stack_data = settings.standard.stackData;
            userData.tagger_data = settings.standard.taggerData;
            userData.nightEnabled = false;
            userData.duplicatesCheckerEnabled = true;
            userData.incomingsOverviewEnhancementEnabled = true;
            userData.requestOSEnhancementEnabled = true;
            userData.useSanguTaggerSettings = true;
            userData.showNextIncBrowserTab = true;
            userData.addStackHealthMap = true;
            userData.offBoosts = settings.standard.offBoosts;
            userData.offTechLevels = settings.standard.offTechLevels;
            userData.offFlag = 0;
            localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
        }

        function cacheEveryConfig() {
            config.lastCheckedAt = new Date();
            let availableUnits = {};
            $.when(twLib.get('/interface.php?func=get_unit_info')).done(function (xml) {
                $(xml).find('config').children().each((index, unit) => availableUnits[$(unit).prop('nodeName')] = $(unit).find('speed').text());
                config.unitSpeedSettings = availableUnits;
                localStorage.setItem(settings.storageKeys.config, JSON.stringify(config));
            });
            $.when(twLib.get('/interface.php?func=get_config')).done((xml) => {
                config.worldSettings = {};
                ['fake_limit', 'farm_limit', 'tech'].forEach((setting) => config.worldSettings[setting] = parseInt($(xml).find(setting).text()));
                if (config.worldSettings.tech === settings.tech.LEVELS) {
                    $.when(twLib.get({url: `${game_data.link_base_pure}overview_villages&mode=tech`})).done(function (html) {
                        cachePlayerTechLevels(html);
                    });
                }
                localStorage.setItem(settings.storageKeys.config, JSON.stringify(config));
            });
        }

        function addInputChangeListenersOnSettingsPage() {
            $("#defPackNightMode").change(function () {
                userData.nightEnabled = $(this).is(":checked");
                localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
            });
            $("#defPackDuplicatesChecker").change(function () {
                userData.duplicatesCheckerEnabled = $(this).is(":checked");
                localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
            });
            $("#defPackIncomingsOverviewEnhancements").change(function () {
                userData.incomingsOverviewEnhancementEnabled = $(this).is(":checked");
                localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
            });
            $("#defPackRequestOSEnhancements").change(function () {
                userData.requestOSEnhancementEnabled = $(this).is(":checked");
                localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
            });
            $("#defPackUseSanguTaggerSettings").change(function () {
                userData.useSanguTaggerSettings = $(this).is(":checked");
                localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
            });
            $("#defPackShowNextIncBrowserTab").change(function () {
                userData.showNextIncBrowserTab = $(this).is(":checked");
                localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
            });
            $("#defPackAddStackHealthMap").change(function () {
                userData.addStackHealthMap = $(this).is(":checked");
                localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
            });
            for (let unit in settings.standard.clear) {
                $("#defPack_" + unit).change(function () {
                    userData.clear_data[unit] = this.value;
                    localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
                    $('.defPack_settingsClearPop').text(`${Object.keys(settings.standard.clear).reduce((a, b) => a + (userData.clear_data[b] * settings.troopPop[b]), 0)}`);
                });
            }
            for (let data in settings.standard.stackData) {
                $(".defPackStackData_" + data).change(function () {
                    userData.stack_data[data][$(this).data('value')] = this.value;
                    localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
                });
            }
            for (let data in settings.standard.taggerData) {
                $("#defPackTaggerData_" + data).change(function () {
                    userData.tagger_data[data].tag = this.value;
                    localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
                });
            }
            for (let data in settings.standard.offBoosts) {
                $("#defPack_OffBoost_" + data).change(function () {
                    userData.offBoosts[data] = this.value;
                    localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
                });
            }
            for (let data in settings.standard.offTechLevels) {
                $("#defPack_OffTechLevel_" + data).change(function () {
                    userData.offTechLevels[data] = this.value;
                    localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
                });
            }
            $('#defPack_offFlagBoostSelect').change(function () {
                $('#defPack_offFlag').attr('src', settings.images.flag(this.value));
                userData.offFlag = this.value;
                localStorage.setItem(settings.storageKeys.defPackSettings, JSON.stringify(userData));
            });
        }

        function addEnhancedIncomingsTable() {
            let incomings = {};
            const incomingRows = $('#incomings_table .row_a, #incomings_table .row_b');
            const source = $('#incomings_table th:contains("Herkomst")').index();
            const taggerSettings = getTaggerSettings();

            if (userData.showNextIncBrowserTab) {
                $(window.TribalWars).off().on("global_tick", function () {
                    const arrivalTimerIndex = $('#incomings_table').find('th:contains("Komt aan in")').index();
                    document.title = 'Next inc: ' + $('#incomings_table .row_a:visible, #incomings_table .row_b:visible').first().find(`td:eq(${arrivalTimerIndex})`).text();
                });
            }

            // Total Snobs
            incomings.snobs = $(incomingRows).find('img[src*="snob.png"]');
            // Possible Snob Spam Targets
            incomings.possibleSnobSpam = incomings.snobs
                .filter((_, row) => $(`#incomings_table a[href*="screen=info_village"]:contains("${$(row).closest('tr').find(`td:eq(${source}) a`).text().toCoord()}")`).length > 4).get();

            // Snobs
            addSnobIncomingsTableDetail(incomings, 'green', $(incomingRows).find('img[src*="graphic/command/attack_small.png"]'));
            addSnobIncomingsTableDetail(incomings, 'orange', $(incomingRows).find('img[src*="graphic/command/attack_medium.png"]'));
            addSnobIncomingsTableDetail(incomings, 'red', $(incomingRows).find('img[src*="graphic/command/attack_large.png"]'));
            addSnobIncomingsTableDetail(incomings, 'unknownS', $(incomingRows).find('img[src*="attack.png"]'));

            incomings.unknown = incomingRows.find('img[src*="graphic/command/attack.png"]');
            incomings.ok = incomingRows.find('td .quickedit-label:containsAnyWord(OK, SNIPED)').closest('tr');
            incomings.nok = incomingRows.find('td .quickedit-label:not(:containsAnyWord(OK, SNIPED))').closest('tr');
            incomings.noTag = incomingRows.find('td .quickedit-label:contains("Aanval")');

            const total = [...getUniquePlayers()].reduce((total, player) => player === 'Bolwerk'
                ? total + $('#incomings_table a[href*="id=0"]').closest('td').prev('td:visible').length
                : total + $(`#incomings_table a[href*="screen=info_player"]:contains("${player}")`).length, 0);

            const incomingsHtml = `<table width="100%" cellspacing="0" cellpadding="0">
                <tbody>
                    <tr>
                        <td width="50%" valign="top">
                            <div class="widget vis spaced">
                                <h4 class="ui-sortable-handle">Visão Detalhada</h4>
                                    <table id="defPackIncsDetailOverview" width="100%" class="vis">
                                        <tbody>
                                            <tr>
                                                <td width="25%"><strong><img src="graphic/unit/att.png" title="Apoio a chegar" style="vertical-align: -2px" alt="" class=""> Total</strong></td>
                                                <td colspan="4"><strong><a style="cursor: pointer;" id="defPackFilterReset">${total}</a></strong><br></td>
                                            </tr>
                                            <tr>
                                                <th><img src="graphic/command/attack_small.png" title="" alt="" class=""></th>
                                                <th><img src="graphic/command/attack_medium.png" title="" alt="" class=""></th>
                                                <th><img src="graphic/command/attack_large.png" title="" alt="" class=""></th>
                                                <th><span class="commandicon-wt"><img src="graphic/command/attack.png"></span></th>
                                            </tr>
                                            <tr>
                                                <td><strong style="color: darkgreen"><a style="cursor: pointer;" id="defPackFilter_green">${incomings.green.length}</a></strong><span> (${(incomings.green.length / total * 100).round(2)}%)</span><br></td>
                                                <td><strong style="color: darkorange"><a style="cursor: pointer;" id="defPackFilter_orange">${incomings.orange.length}</a></strong><span> (${(incomings.orange.length / total * 100).round(2)}%)</span><br></td>
                                                <td><strong style="color: darkred"><a style="cursor: pointer;" id="defPackFilter_red">${incomings.red.length}</a></strong><span> (${(incomings.red.length / total * 100).round(2)}%)</span><br></td>
                                                <td><strong><a style="cursor: pointer;" id="defPackFilter_unknown">${incomings.unknown.length}</a></strong><span> (${(incomings.unknown.length / total * 100).round(2)}%)</span><br></td>
                                            </tr>
                                            <tr>
                                                <th colspan="5">Tag Infos</th>
                                            </tr>
                                            <tr>
                                                <td><img width="16px" src="${settings.images.OK}" alt=""> 'OK' Tags</td>
                                                <td colspan="4"><strong><a style="cursor: pointer;" id="defPackFilter_ok">${incomings.ok.length || 0}</a></strong><span> (${((incomings.ok.length || 0) / total * 100).round(2)}%)</span> <small><a style="cursor: pointer;" id="defPackVillageCoordsOK">Copiar Coords</a></small></td>
                                            </tr>
                                            <tr>
                                                <td><img width="16px" src="${settings.images.NOK}" alt=""> TO DO</td>
                                                <td colspan="4"><strong><a style="cursor: pointer;" id="defPackFilter_nok">${incomings.nok.length || 0}</a></strong><span> (${((incomings.nok.length || 0) / total * 100).round(2)}%)</span> <small><a style="cursor: pointer;" id="defPackVillageCoordsNOK">Copiar Coords</a></small></td>
                                            </tr>
                                            <tr>
                                                <td><img width="16px" src="${settings.images.NO_TAG}" alt=""> Untagged</td>
                                                <td colspan="4"><strong><a style="cursor: pointer;" id="defPackFilter_noTag">${incomings.noTag.length || 0}</a></strong><span> (${((incomings.noTag.length || 0) / total * 100).round(2)}%)</span></td>
                                            </tr>
                                            <tr>
                                                <th colspan="5">Agrupar</th>
                                            </tr>
                                            <tr>
                                                <td colspan="5">
                                                    <input type="button" class="defPack_groupBy" data-group-by="target" value="Destino">
                                                    <input type="button" style="margin-left: 5px" class="defPack_groupBy" data-group-by="source" value="Origem">
                                                    <input type="button" style="margin-left: 5px" id="defPack_resetGroup" value="Reset">
                                                </td>
                                            </tr>
                                            <tr>
                                                <th colspan="5">Renomear</th>
                                            </tr>
                                            <tr>
                                                <td colspan="5" id="defPack_overviewTaggerSettings">
                                                    <div>
                                                        <input type="button" data-rename-to="${taggerSettings.ok}" value="OK"/>
                                                        <input type="button" data-rename-to="${taggerSettings.checkStack}" value="Ver"/>
                                                        <input type="button" data-rename-to="${taggerSettings.dodge}" value="Desviar"/>
                                                        <input type="button" data-rename-to="${taggerSettings.sniped}" value="Def."/>
                                                        <input type="button" data-rename-to="${taggerSettings.snipeThis}" value="Snipar"/>
                                                    </div>
                                                    <div class="float_left" style="width: 100%">
                                                        <input type="text" style="width: 70%" id="defPack_overviewTaggerText" name="Tag">
                                                        <a id="defPack_overviewTaggerBtn" style="margin-top: 5px" class="btn">Tag!</a>
                                                        <div id="defPack_overviewTaggingProgressBar" class="progress-bar live-progress-bar progress-bar-alive" style="display: none">
                                                            <div></div>
                                                            <span class="label"></span>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <th colspan="5" id="defPack_incsWallUnder20Header" style="cursor: pointer">N° de Muralhas <20</th>
                                            </tr>
                                            <tr id="defPack_incs_wallUnder20Content">
                                            </tr>
                                        </tbody>
                                    </table>
                            </div>
                        </td>
                        <td width="50%" valign="top">
                            <div class="am_widget vis spaced">
                                <h4 class="ui-sortable-handle">Nobres</h4>
                                <table width="100%" class="vis">
                                    <tbody>
                                        <tr>
                                            <td><img src="graphic/command/snob.png" alt=""> <strong>Total</strong></td>
                                            <td colspan="4"><strong><a style="cursor: pointer" id="defPackFilter_snobs">${incomings.snobs.length}</a></strong><br></td>
                                        </tr>
                                        <tr>
                                            <th style="width: 20%"></th>
                                            <th style="width: 20%"><img src="graphic/command/attack_small.png" title="" alt="" class=""> <img src="graphic/command/snob.png" alt=""></th>
                                            <th style="width: 20%"><img src="graphic/command/attack_medium.png" title="" alt="" class=""> <img src="graphic/command/snob.png" alt=""></th>
                                            <th style="width: 20%"><img src="graphic/command/attack_large.png" title="" alt="" class=""> <img src="graphic/command/snob.png" alt=""></th>
                                            <th style="width: 20%"><span class="commandicon-wt"><img src="graphic/command/attack.png"></span> <img src="graphic/command/snob.png" alt="">
                                        </th>
                                        <tr class="row_a">
                                            <td><img width="16px" style="cursor:pointer;" src="${settings.images.snobs.OK}" alt="" title="Nobles tagged with OK/SNIPED"> (${((incomings.greenSnobsOK.length + incomings.orangeSnobsOK.length + incomings.redSnobsOK.length + incomings.unknownSSnobsOK.length) / incomings.snobs.length * 100 || 0).round(2)}%)</td>
                                            <td><strong><a style="cursor: pointer" id="defPackFilter_greenSnobsOK">${incomings.greenSnobsOK.length}</a></strong><span> (${(incomings.greenSnobsOK.length / incomings.snobs.length * 100 || 0).round(2)}%)</span><br></td>
                                            <td><strong><a style="cursor: pointer" id="defPackFilter_orangeSnobsOK">${incomings.orangeSnobsOK.length}</a></strong><span> (${(incomings.orangeSnobsOK.length / incomings.snobs.length * 100 || 0).round(2)}%)</span><br></td>
                                            <td><strong><a style="cursor: pointer" id="defPackFilter_redSnobsOK">${incomings.redSnobsOK.length}</a></strong><span> (${(incomings.redSnobsOK.length / incomings.snobs.length * 100 || 0).round(2)}%)</span><br></td>
                                            <td><strong><a style="cursor: pointer" id="defPackFilter_unknownSSnobsOK">${incomings.unknownSSnobsOK.length}</a></strong><span> (${(incomings.unknownSSnobsOK.length / incomings.snobs.length * 100 || 0).round(2)}%)</span><br></td>
                                        </tr>
                                        <tr class="row_b">
                                            <td><img width="16px" style="cursor:pointer;" src="${settings.images.snobs.CHECK}" alt="" title="Nobles tagged with CHECK"> (${((incomings.greenSnobsCheck.length + incomings.orangeSnobsChecklength + incomings.redSnobsCheck.length + incomings.unknownSSnobsCheck.length) / incomings.snobs.length * 100 || 0).round(2)}%)</td>
                                            <td><strong><a style="cursor: pointer" id="defPackFilter_greenSnobsCheck">${incomings.greenSnobsCheck.length}</a></a></strong><span> (${(incomings.greenSnobsCheck.length / incomings.snobs.length * 100 || 0).round(2)}%)</span><br></td>
                                            <td><strong><a style="cursor: pointer" id="defPackFilter_orangeSnobsCheck">${incomings.orangeSnobsCheck.length}</a></strong><span> (${(incomings.orangeSnobsCheck.length / incomings.snobs.length * 100 || 0).round(2)}%)</span><br></td>
                                            <td><strong><a style="cursor: pointer" id="defPackFilter_redSnobsCheck">${incomings.redSnobsCheck.length}</a></strong><span> (${(incomings.redSnobsCheck.length / incomings.snobs.length * 100 || 0).round(2)}%)</span><br></td>
                                            <td><strong><a style="cursor: pointer" id="defPackFilter_unknownSSnobsCheck">${incomings.unknownSSnobsCheck.length}</a></strong><span> (${(incomings.unknownSSnobsCheck.length / incomings.snobs.length * 100 || 0).round(2)}%)</span><br></td>
                                        </tr>
                                        <tr class="row_a">
                                            <td><img width="16px" style="cursor:pointer;" src="${settings.images.snobs.NOK}" alt="" title="Nobles NOT tagged with OK/SNIPED"> (${((incomings.greenSnobsNOK.length + incomings.orangeSnobsNOK.length + incomings.redSnobsNOK.length + incomings.unknownSSnobsNOK.length) / incomings.snobs.length * 100 || 0).round(2)}%)</td>
                                            <td><strong><a style="cursor: pointer" id="defPackFilter_greenSnobsNOK">${incomings.greenSnobsNOK.length}</a></a></strong><span> (${(incomings.greenSnobsNOK.length / incomings.snobs.length * 100 || 0).round(2)}%)</span><br></td>
                                            <td><strong><a style="cursor: pointer" id="defPackFilter_orangeSnobsNOK">${incomings.orangeSnobsNOK.length}</a></strong><span> (${(incomings.orangeSnobsNOK.length / incomings.snobs.length * 100 || 0).round(2)}%)</span><br></td>
                                            <td><strong><a style="cursor: pointer" id="defPackFilter_redSnobsNOK">${incomings.redSnobsNOK.length}</a></strong><span> (${(incomings.redSnobsNOK.length / incomings.snobs.length * 100 || 0).round(2)}%)</span><br></td>
                                            <td><strong><a style="cursor: pointer" id="defPackFilter_unknownSSnobsNOK">${incomings.unknownSSnobsNOK.length}</a></strong><span> (${(incomings.unknownSSnobsNOK.length / incomings.snobs.length * 100 || 0).round(2)}%)</span><br></td>
                                        </tr>
                                        <tr class="row_b">
                                            <th colspan="5"><strong>Possível spam de nobres (5 ou mais nobres da mesma aldeia)</strong></th>
                                        </tr>
                                        <tr>
                                            <td><img src="graphic/command/snob.png" alt=""> <strong>Total</strong></td>
                                            <td colspan="4"><strong><a style="cursor: pointer" id="defPackFilter_possibleSnobSpam">${incomings.possibleSnobSpam.length}</a></strong><br></td>
                                        </th>
                                    </tbody>
                                </table>
                            </div>
                            <div class="am_widget vis spaced">
                                <h4 class="ui-sortable-handle">Ataques por Jogador</h4>
                                <div class="body">
                                    <table style="width:100%">
                                        <tbody id="defPack_incsPerPlayer">
                                        <tr>
                                            <th colspan="5">Ataques por Dia</th>
                                        </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </td>
                </tr>
                </tbody></table>`;

            $('.overview_filters').before(incomingsHtml);

            refreshIncsPerPlayer();

            const showCoordsPopup = () => {
                Dialog.show('Coords',
                    `<div width="350px">
                        <div class="info_box">Copy Coordinates</div>
                        <img width="16px" src="${settings.images.OK}" alt=""> 'OK' Tags
                        <textarea rows="5" style="width: 96%">${Array.from([...new Set(incomings.ok.find('td:eq(1)').map((_, el) => $(el).text().toCoord()).get())] || []).join(' ')}</textarea>
                        <img width="16px" src="${settings.images.NOK}" alt=""> TO DO
                        <textarea rows="5" style="width: 96%">${Array.from([...new Set(incomings.nok.find('td:eq(1)').map((_, el) => $(el).text().toCoord()).get())] || []).join(' ')}</textarea>
                    </div>`
                )
            }
            $('#defPackVillageCoordsOK, #defPackVillageCoordsNOK').click(() => showCoordsPopup());

            for (const incomingType in incomings) {
                $(`#defPackFilter_${incomingType}`).click(function () {
                    $('#defPack_resetGroup').click();
                    $('#incomings_table tr').not(':last').not(':first').hide();
                    incomings[$(this).attr('id').match('\_(.*)')[1]].closest('tr').show();

                    refreshIncsPerPlayer();
                })
            }

            $('#defPackFilterReset').click(function () {
                $('#defPack_resetGroup').click();
                $('#incomings_table tr').not(':last').not(':first').show();

                refreshIncsPerPlayer();
            });

            if ($(document).find(`b:contains("${settings.commands1000Overflow}")`).length > 0) {
                const isAllPagesSelected = $('#paged_view_content table').find('strong:contains("alle")');
                const pages = isAllPagesSelected.length > 0 ? isAllPagesSelected.closest('td').find('.paged-nav-item') : $('#loadNextPage').closest('td').find('.paged-nav-item :not(:last)');

                pages.each((index, page) => {
                    const urlToCall = $(page).attr('href');
                    twLib.get({
                        url: urlToCall,
                        dataType: 'html',
                        async: true,
                        success: function (html) {
                            loadNextPageIncomings(index === 0, html);
                        }
                    })
                })
            }

            if (userData.duplicatesCheckerEnabled) {
                $('#incomings_table').before(`<table><tbody>${$('#incomings_table tr:last').clone(true).html()}</tbody></table>`);
                $("#select_all, #selectAll").prop('onclick', null);
                $('#select_all:first, #selectAll:first').attr('id', 'select_all_duplicate');
                $('#select_all, #selectAll, #select_all_duplicate').off().on('change', function () {
                    $('#incomings_table tr:visible').not(':last').not(':first').find(':checkbox').prop('checked', this.checked);
                    $('#incomings_table tr:hidden').find(':checkbox').prop('checked', !this.checked).trigger('change');
                });

                $('input[name ="label"]').after('<input class="btn defPackMarkDuplicateIncs" value="Marcar Repetidos"/>').closest('th').attr('colspan', 8).attr('width', '100%');
                $('.defPackMarkDuplicateIncs').click(function () {
                    $('#incomings_table a[href*="screen=info_village"]').each(function () {
                        const coordinates = $(this).text().toCoord().toString();
                        const duplicateCount = $(`#incomings_table a[href*="screen=info_village"]:contains("${coordinates}")`).length;
                        if (duplicateCount > 1) {
                            $(this).css({'background-color': 'red', 'color': 'white'});
                            const id = $(this).closest('tr').find('td:first span.quickedit:first').attr('data-id');
                            const commandMessage = $.trim($(`span.quickedit[data-id="${id}"]`).find('span.quickedit-label').text());
                            let value = null;
                            if (!commandMessage.match(/#\d+/)) {
                                value = commandMessage + '#' + duplicateCount + '';
                            } else if (commandMessage.match(/#\d+/).toString() !== '#' + duplicateCount) {
                                value = commandMessage.replace(/#\d+/, '#' + duplicateCount);
                            }
                            if (value !== null) {
                                renameCommand(id, value);
                            }
                        } else {
                            $(this).css({"background-color": "", "color": ""});
                        }
                    });
                });
            }

            addSnipeFunctionalityToIncomingsTable(incomingRows);
            addGroupingFunctionalityToIncomingsTable(incomingRows);
        }

        function addSnipeFunctionalityToIncomingsTable(incomingRows) {
            $('#incomings_table tr:first th:last').after('<th>Snipe</th>')
            incomingRows.each((i, el) => {
                $(el).find('td:last').after(`<td style="text-align: center"><img class="defPack_snipeFinder" src="${settings.images.snipe}" style="cursor: pointer"/></td>`);
            })
            activateSnipeButtonClickFunction();
        }

        function activateSnipeButtonClickFunction() {
            $('.defPack_snipeFinder').click(function () {
                const tr = $(this).closest('tr');
                const villageToBeSniped = tr.find('td:eq(1)').text().toCoord();
                const targetId = tr.find('td:eq(1) a').attr('href').match(/\d+/g).pop();
                const twDate = tr.find('td:eq(5)').text().trim();

                openSnipeInterface(villageToBeSniped, twDate, targetId, true);
            });
        }

        function addGroupingFunctionalityToIncomingsTable(allFilteredIncomings) {
            let incomingRows = $('#incomings_table .row_a:visible, #incomings_table .row_b:visible');
            const target = $('#incomings_table th:contains("Doel")').index();
            const arrival = $('#incomings_table th:contains("Aankomst")').index();
            const source = $('#incomings_table th:contains("Herkomst")').index();
            const countdownTd = $('#incomings_table th:contains("Komt aan")').index();
            const activateCheckboxListener = () => $('#incomings_form input:checkbox').on('change', function () {
                const selectedInputs = $('#incomings_table input:checked:not(.defPack_select_all, #select_all, #selectAll, #select_all_duplicate)');
                $('#defPack_overviewTaggerBtn').text(`Tag ${this.id.indexOf('select') !== -1 ? this.checked ? incomingRows.filter((i, r) => $(r).is(':visible')).length : 0 : selectedInputs.length} commands!`);
            })
            const reactivateTimers = () => {
                Timing.tickHandlers.timers.handleTimerEnd = function () {
                    $(this).closest('tr').remove();
                    allFilteredIncomings = $(allFilteredIncomings).slice(1);
                    incomingRows = $(incomingRows).slice(1);
                };
                Timing.tickHandlers.timers.init();
            }
            activateCheckboxListener();

            $('#defPack_overviewTaggerSettings div:first input').click(function () {
                $('#defPack_overviewTaggerText').val($(this).data('rename-to'));
            });

            $('.defPack_groupBy').click(function () {
                incomingRows = $('#incomings_table .row_a:visible, #incomings_table .row_b:visible').not('.defPack_totalRow');
                $('#incomings_table tr.nowrap').remove();
                const mapCoords = (_, row) => {
                    const selector = `${'target' === $(this).data('group-by') ? target : source}`;
                    const countdown = convertToDate($(row).find(`td:eq(${arrival})`).text());
                    $(row).find(`td:eq(${countdownTd})`).replaceWith(`<td class="sendTime"><span class="timer" data-endtime="${countdown.getTime() / 1000}"></span></td>`);
                    return {
                        coords: $(row).find(`td:eq(${selector}) a`).text().toCoord(),
                        html: $(row)
                    };
                };

                const data = incomingRows.map(mapCoords).get().reduce((arr, obj) => ({
                    ...arr, [obj['coords']]: (arr[obj['coords']] || []).concat(obj)
                }), {})

                let mod = 0;
                const first = $('#incomings_table tbody tr:first');
                Object.entries(data).reverse().forEach(
                    ([key, value]) => {
                        $(first).after(`
                <tr align=right class="nowrap defPack_totalRow row_${mod % 2 === 0 ? 'a' : 'b'}">
                    <td align=left><input data-coords="${key}" type="checkbox" class="defPack_select_all"></td>
                    <td colspan="8">
                        <span style="float: left;"><input type="button" class="defPack_retrieveStackHealth" data-coords="${key}" value="Retrieve stack health"></span>
                        <strong>Aanvallen: ${value.length}</strong></td>
                </tr>`);
                        value.reverse().forEach((r) => $(first).after(`<tr data-coords="${key}" class="nowrap row_${mod % 2 === 0 ? 'a' : 'b'}">${r.html.html()}</tr>`) && ++mod);
                    }
                );
                reactivateTimers();
                activateCheckboxListener();
                $('.defPack_select_all').change(function () {
                    const coords = $(this).data('coords');
                    $(`[data-coords="${coords}"] input:not(#defPack_select_all):not([type=hidden])`).prop('checked', this.checked);
                    $('#defPack_overviewTaggerBtn').text(`Tag ${$('#incomings_table input:checked:not(.defPack_select_all, #select_all)').length} commands!`);
                });
                $('.defPack_retrieveStackHealth').click(async function () {
                    const element = $(this);
                    const coords = $(element).data('coords');
                    const villageId = $(`tr [data-coords="${coords}"]:first`).find(`td:eq(${target}) a`).attr('href').match(/village=(\d+)/).pop();
                    await twLib.get({url: `${game_data.link_base_pure.replace(/village=\d+/, `village=${villageId}`)}overview`}).then(async (html) => {
                        const incomings = $(html).find('#commands_incomings tbody tr.command-row.no_ignored_command');
                        const wall = parseInt($(html).find('.visual-label-wall').text().match(/\d+/)?.pop() || $(html).find('#l_wall td:eq(1)').text().match(/\d+/)?.pop()) || 0;
                        const stackCheckerSettings = {
                            initialWall: wall,
                            wallParam: `&def_wall=${wall}`
                        };
                        const simulationUrl = await buildSimulationUrl(html, stackCheckerSettings.wallParam, villageId);
                        twLib.get({url: `${simulationUrl}`, dataType: 'html'}).then((response) => {
                            stackCheckerSettings.clearsNeeded = $(response).find('#content_value').find('p').css('font-style', 'italic').find('b').text();
                            stackCheckerSettings.postClear = parseInt($(response).find('th:contains("Schade door rammen:")').next().find('b:last-child').text())
                            stackCheckerSettings.totalPopFromSimulation = $(response).find('td:contains("Verdediger")').closest('tr').find('td:last').first().text();

                            const data = configureHealthCheckValues(stackCheckerSettings);
                            const totalAttacks = ['attack_small', 'attack_medium', 'attack_large', 'attack'].map((type) => `${incomings.find(`img[src*="graphic/command/${type}.png"]`).length} <img src="graphic/command/${type}.png">`);

                            $(element).after(`
                                ${totalAttacks} |
                                Stack Health -  <strong style="color: ${data.color}">${data.message}</strong> |
                                Clears - <strong>${(stackCheckerSettings.clearsNeeded.indexOf('meer dan 100') !== -1 ? stackCheckerSettings.clearsNeeded : (data.clears))}</strong> clear(s) |
                                <strong style="background-color: ${data.stackColor}"><span class="icon header population"></span> ${stackCheckerSettings.totalPopFromSimulation}</a></strong> |
                                <strong>1st</strong> <img style="vertical-align: bottom;" src="graphic/unit/unit_ram.png" title="" alt="" class=""> clear
                                <img src="graphic/buildings/wall.png" title="" alt="" class=""> <strong>${stackCheckerSettings.initialWall}</strong> -> <strong style="color: ${data.color}"> ${(isNaN(stackCheckerSettings.postClear) ? stackCheckerSettings.initialWall : stackCheckerSettings.postClear)}</strong> |
                                <a href="${simulationUrl}" target="_blank">Simulator</a>
                            `);
                            $(element).remove();
                        })
                    });
                });
                activateSnipeButtonClickFunction();
            })

            $('#defPack_resetGroup').click(() => {
                $("input:checkbox").prop('checked', false);
                $('#defPack_overviewTaggerBtn').text(`Tag 0 commands!`);
                $('#incomings_table tr.nowrap').remove();
                $('#incomings_table tbody tr:first').after(allFilteredIncomings);
                $("#incomings_table tr:first th:first").text(`Comandos (${allFilteredIncomings.filter((i, r) => $(r).is(':visible')).length})`);

                reactivateTimers();
                activateSnipeButtonClickFunction();
                activateCheckboxListener();
            })

            $('#defPack_overviewTaggerBtn').click(function () {
                const allCheckedCommandIds = $('#incomings_table input:checked:not(.defPack_select_all, #select_all, #selectAll)').map((_, u) => {
                    const id = $(u).attr('name').match(/\d+/).pop();
                    return {
                        text: $(u).closest('tr').find(`span.quickedit[data-id="${id}"] span.quickedit-label`).text().trim(),
                        id: id
                    }
                }).get();

                renameCommandsWithProgressBar(allCheckedCommandIds, 'overviewTaggingProgressBar', 'overviewTaggerText', allFilteredIncomings);
            });
        }

        const applyDropDownSettings = (property, field, fieldToShow, propertyToSelect) => {
            const isEnabled = snipeSettings[property];
            $(`#${field}`).prop('checked', isEnabled);
            if (isEnabled && fieldToShow) $(`.${fieldToShow}`).show();
            if (propertyToSelect) {
                const selectedValue = parseFloat(snipeSettings[propertyToSelect]) || 0.2;
                $(`.${fieldToShow} option[value="${selectedValue}"]`).attr('selected', 'selected');
            }
        }

        const applySavedSnipeSettings = () => {
            if (snipeSettings) {
                applyDropDownSettings('os_boost_enabled', 'defPack_snipeFinderOsBoostEnabled', 'defPack_snipeFinderOsBoostMultiplier', 'os_boost');

                $(`#defPack_snipeFinderGroup option[value="${snipeSettings.group}"]`).attr('selected', 'selected');
                $('#defPack_ignoreVillagesWithIncsEnabled').prop('checked', snipeSettings.ignore_villages_with_incs);
                $('#defPack_snipeFinderAutomaticallyFillTroops').prop('checked', snipeSettings.automatically_fill_troops);
                Array.from(snipeSettings.units).forEach((u) => $(`.defPack_snipeUnitAmount[data-unit="${u.unit}"]`).css('display', u.enabled ? 'block' : 'none')
                    && $(`.defPack_snipeUnitCheckBox[data-unit="${u.unit}"]`).prop('checked', u.enabled));
            }
        }

        const saveSnipeSetting = (setting, value, index, property) => {
            if (!isNaN(index)) snipeSettings[setting][index][property] = value;
            else snipeSettings[setting] = value;
            localStorage.setItem(settings.storageKeys.snipeSettings, JSON.stringify(snipeSettings));
        }
        const getDistance = (origin, target) => Math.sqrt(Math.pow(origin.x - target.x, 2) + Math.pow(origin.y - target.y, 2));
        const getTravelTime = (distance, unitSpeed) => distance * unitSpeed;

        function openSnipeInterface(villageToBeSniped = '', twDate = '', targetId = '', disabled = false) {
            loadSnipeSettings();

            const resetTargetId = targetId.length < 1;

            TribalWars.get("groups", {ajax: "load_groups"}, function (groups) {
                Dialog.show('SnipeFinder', `
        <div id="defPack_snipePopup">
            <table class="vis" style="width: 100%">
                <tr>
                    <th colspan="2">Snipe</th>
                </tr>
                <tr>
                    <td>Usar Grupo:</td>
                    <td>
                        <select id="defPack_snipeFinderGroup" data-property="group">
                            ${Object.keys(groups.result).map(group => `
                                <option value="${groups.result[group].group_id}">
                                    ${groups.result[group].name}
                                </option>`).join('')}
                         </select>
                    </td>
                </tr>
                <tr>
                    <td>Snipe Coords <span style="color: darkblue">(xxx|xxx)</span></td>
                    <td>
                        <input id="defPack_snipeFinderVillageToSnipe" type="text" value="${villageToBeSniped}">
                    </td>
                </tr>
                <tr>
                    <td>Hora do Snipe</td>
                    <td>
                        <input id="defPack_snipeFinderTime" type="text" placeholder="dd.mm.yyyy hh:mm:ss:SSS" value="${twDate}" style="width: 99%"/>
                    </td>
                </tr>
                <tr>
                    <td colspan="2">
                        Formatos permitidos: <span style="color: darkblue">(dd.mm.yyyy hh:mm:ss:SSS /  hoje às hh:mm:ss:SSS)</span>
                    </td>
                </tr>
                <tr>
                    <td colspan="2">
                        <table class="vis table-responsive" width="100%">
                            <thead>
                                <tr>
                                ${Object.keys(config.unitSpeedSettings).filter((u) => !['militia'].includes(u)).map((unit, index) => `
                                    <th style="text-align: center;" width="35">
                                        <img src="/graphic/unit/unit_${unit}.png" title="${unit}"> <input class="defPack_snipeUnitCheckBox" data-unit="${unit}" data-index="${index}" type="checkbox">
                                    </th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${Array.from(snipeSettings.units).filter((u) => !['militia'].includes(u.unit)).map((u, index) => `
                                    <td style="text-align: center;">
                                        <input class="defPack_snipeUnitAmount" data-unit="${u.unit}" type="text" value="${u.amount}" data-index="${index}" size="4">
                                    </td>`).join('')}
                            </tbody>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td>Ignorar aldeias com Ataques a chegar</td>
                    <td>
                        <input id="defPack_ignoreVillagesWithIncsEnabled" type="checkbox">
                    </td>
                </tr>
                <tr>
                    <td>Boosts (Sigilia&Amizade)</td>
                    <td>
                        <input id="defPack_snipeFinderOsBoostEnabled" type="checkbox">
                        <select class="defPack_snipeFinderOsBoostMultiplier" data-property="os_boost" style="display: none">
                            ${[...Array(settings.maxOsBoost)].map((_, speed) => `
                                <option value="${(speed + 1) / 100}">
                                    ${speed + 1}%
                                </option>`).join('')}
                        </select>
                    </td>
                </tr>
                <tr>
                    <td>Preencher tropas automaticamente</td>
                    <td>
                        <input id="defPack_snipeFinderAutomaticallyFillTroops" type="checkbox">
                    </td>
                </tr>
                <tr>
                    <td>Formato</td>
                    <td>
                        <input id="defPack_snipeTimerFormat" name="snipeOutputFormat" type="radio" value="defPack_snipeTable" checked> Tempos
                        <input id="defPack_snipeOffPackFormat" name="snipeOutputFormat" value="defPack_snipeOffPackTextArea" type="radio"> Plano
                        <input id="defPack_snipeTwFormat" name="snipeOutputFormat" value="defPack_snipeTwLinkTextArea" type="radio"> Plano c/Link
                    </td>
                </tr>
            </table>
            <input type="button" class="btn" id="defPack_snipeFinderCalculate" value="Calcular Snipes" style="margin-top: 5px; margin-left: 6px; margin-bottom: 5px">
            </br>
            <table class="vis defPack_snipeTable" style="box-shadow: 2px 2px 2px darkgray; border: 2px solid #c1a264; margin-top: 5px;width:100%">
                <tr>
                    <th colspan="8">Calcular Snipes<span id="defPack_snipePossibilities"></span></th>
                </tr>
                <tr>
                    <th style="text-align: center">Início</th>
                    <th style="text-align: center">Alvo</th>
                    <th style="text-align: center">Unidades Disponíveis</th>
                    <th style="text-align: center">Tempo viagem (<span style="color: darkblue">Tempo envio</span>)</th>
                    <th style="text-align: center"><img src="graphic//buildings/place.png" alt="" title="VP"></th>
                </tr>
            </table>
            <textarea class="defPack_snipeOffPackTextArea" cols="100" rows="25" style="display:none; margin-top: 5px;" disabled></textarea>
            <textarea class="defPack_snipeTwLinkTextArea" cols="100" rows="25" style="display:none; margin-top: 5px;" disabled></textarea>
        </div>`);

                applySavedSnipeSettings();

                $('#popup_box_SnipeFinder').css('width', '41%');

                const validateInput = () => {
                    const villageToSnipe = $('#defPack_snipeFinderVillageToSnipe');
                    const snipeTime = $('#defPack_snipeFinderTime');

                    const isEmpty = villageToSnipe.val().trim() === '' || snipeTime.val().trim() === '';
                    const invalidInputs = villageToSnipe.val().match(/\d{1,3}\|\d{1,3}/g) === null
                        || (!snipeTime.val().match(/(\d+.\d+.\d+)\s+(\d+:\d+:\d+:\d+)/) && !snipeTime.val().match(/\d+:\d+:\d+:\d+/));
                    $('#defPack_snipeFinderCalculate').prop('disabled', isEmpty || invalidInputs);
                }

                if (!disabled) {
                    $('#defPack_snipeFinderCalculate').prop('disabled', true);
                    $('#defPack_snipeFinderVillageToSnipe, #defPack_snipeFinderTime').on('keyup', validateInput);
                }
                $('.defPack_snipeUnitCheckBox').click(function () {
                    saveSnipeSetting('units', this.checked, $(this).data('index'), 'enabled');
                    $(`.defPack_snipeUnitAmount[data-unit="${$(this).data('unit')}"]`).css('display', this.checked ? 'block' : 'none')
                });
                $('.defPack_snipeUnitAmount').change(function () {
                    saveSnipeSetting('units', parseInt($(this).val()), $(this).data('index'), 'amount');
                });
                $('#defPack_slowestUnitEnabled').click((event) => {
                    saveSnipeSetting('slowest_unit_enabled', event.target.checked);
                    $('.defPack_slowestUnit').toggle();
                });
                $('#defPack_snipeFinderOsBoostEnabled').change((event) => {
                    saveSnipeSetting('os_boost_enabled', event.target.checked)
                    $('.defPack_snipeFinderOsBoostMultiplier').toggle();
                });
                $('#defPack_ignoreVillagesWithIncsEnabled').change((event) => {
                    saveSnipeSetting('ignore_villages_with_incs', event.target.checked);
                });
                $('#defPack_snipeFinderAutomaticallyFillTroops').change((event) => {
                    saveSnipeSetting('automatically_fill_troops', event.target.checked);
                });
                $('.defPack_snipeFinderOsBoostMultiplier, #defPack_snipeFinderGroup').change(function () {
                    saveSnipeSetting($(this).data('property'), $(this).val());
                })
                $('#defPack_snipeFinderVillageToSnipe, #defPack_snipeFinderTime').prop('disabled', disabled);
                $('#defPack_snipeFinderCalculate').click(async () => {
                    const selectedGroup = $('#defPack_snipeFinderGroup').val();
                    villageToBeSniped = $('#defPack_snipeFinderVillageToSnipe').val();

                    if (targetId === '') {
                        targetId = await getTargetIdFromCoordinates(villageToBeSniped);
                    }

                    $.when(loadProductionOverview('combined', selectedGroup)).done(function (html) {
                        $('.defPack_snipeRow').remove();
                        twDate = $('#defPack_snipeFinderTime').val();
                        // dd.mm.yyyy hh:MM:ss:SSS support
                        const matchDateFormat = twDate.match(/(\d+.\d+.\d+)\s+(\d+:\d+:\d+:\d+)/);
                        let timeTobeSnipedAt = convertToDate(twDate);

                        if (matchDateFormat) {
                            const matchDateFormatElement = matchDateFormat[0];
                            // Check if date is formatted as dd.mm.yy not dd.mm.yyyy
                            if (matchDateFormatElement.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g)) {
                                timeTobeSnipedAt = new Date(matchDateFormatElement.replace(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g, '$3-$2-$1'));
                            } else {
                                timeTobeSnipedAt = new Date(new Date().getFullYear() + '-' + matchDateFormatElement.replace(/(\d{1,2})\.(\d{1,2})\.(\d{1,4})/g, '$2-$1'));
                            }
                        }
                        const osBoostEnabled = $('#defPack_snipeFinderOsBoostEnabled').is(':checked');
                        const ignoreVillagesWithIncs = $('#defPack_ignoreVillagesWithIncsEnabled').is(':checked');
                        const snipeUnits = Array.from(snipeSettings.units).filter((u) => u.enabled && u.amount > 0);
                        if (snipeUnits.length === 0) {
                            $('#defPack_snipePossibilities').text(`(0)`);
                            return;
                        }
                        const slowestSelectedUnit = snipeUnits.sort((a, b) => parseFloat(config.unitSpeedSettings[a.unit]) < parseFloat(config.unitSpeedSettings[b.unit]) ? 1 : -1)[0];

                        let villages = $(html).find('#combined_table .row_a, .row_b');
                        if (ignoreVillagesWithIncs) {
                            villages = $(villages).not(':has(img[src*="attack"])');
                        }
                        const headerRow = $(html).find(`#combined_table tr:first th`);
                        const unitIndexes = game_data.units.map((u) => {
                            return {
                                unit: u,
                                speed: parseFloat(config.unitSpeedSettings[u]),
                                index: $(headerRow).find(`img[src*=${u}]`).closest('th').index()
                            }
                        });
                        let offPackTextArea = new Set();
                        let twLinkFormatTextArea = new Set();

                        villages.sort(((a, b) => {
                            const distanceA = getDistance(coordToObject($(a).find('.quickedit-label').text()), coordToObject(villageToBeSniped));
                            const distanceB = getDistance(coordToObject($(b).find('.quickedit-label').text()), coordToObject(villageToBeSniped));
                            return distanceA > distanceB ? 1 : -1;
                        })).each(function () {
                            const villageId = $(this).find('.quickedit-vn').data('id');
                            const coordinates = $(this).find('.quickedit-label').text();
                            const distance = getDistance(coordToObject(coordinates), coordToObject(villageToBeSniped));

                            const snipeUnitShouldBeAvailableInCurrentVillage = (snipeUnit) => availableUnits.filter((availableUnit) => availableUnit.unit === snipeUnit.unit && availableUnit.available >= snipeUnit.amount).length > 0;
                            const unitSpeed = parseFloat(config.unitSpeedSettings[slowestSelectedUnit.unit]);
                            const availableUnits = unitIndexes.map((u) => {
                                return {
                                    ...u,
                                    available: parseInt($(this).find(`td:eq(${u.index})`).text())
                                }
                            }).filter((u) => u.available > 0 && u.speed <= unitSpeed);
                            if (!snipeUnits.every(snipeUnitShouldBeAvailableInCurrentVillage) || availableUnits.length < 1) return;

                            let travelTime = getTravelTime(distance, unitSpeed);
                            if (osBoostEnabled) {
                                travelTime /= 1 + parseFloat($('.defPack_snipeFinderOsBoostMultiplier').val()) || 0.2; //20% os boost

                            }
                            const dateTillLaunch = new Date(timeTobeSnipedAt.getTime() - travelTime * 60 * 1000);
                            const timeUntilLaunch = dateTillLaunch.getTime() - new Date().getTime();
                            if (timeUntilLaunch <= 0 || distance <= 0) return;

                            let targetUrl = `game.php?village=${villageId}&screen=place&target=${targetId}&arrivalTimestamp=${timeTobeSnipedAt.getTime()}&type=${snipeSettings.automatically_fill_troops ? 'snipe' : 'support'}`;
                            if (game_data.player.sitter > 0) {
                                targetUrl += `&t=${game_data.player.id}`;
                            }

                            offPackTextArea.add(
                                `${coordinates.toCoord()}->${villageToBeSniped.toCoord()},${distance.toFixed(2)},${slowestSelectedUnit.unit},Support,${formatTimes(new Date(timeTobeSnipedAt.getTime()))},${Format.timeSpan(60 * 1000 * travelTime, !0)},${formatTimes(new Date(dateTillLaunch))}`
                            );
                            twLinkFormatTextArea.add(
                                `${availableUnits.map((u) => `[unit]${u.unit}[/unit] ${u.available}`).join(' ')} | ${formatTimes(new Date(dateTillLaunch), true)} | ${formatTimes(new Date(timeTobeSnipedAt.getTime()))} | ${coordinates.toCoord()} -> ${villageToBeSniped.toCoord()} | [url=${targetUrl}][building]place[/building][/url]`
                            );
                            $('.defPack_snipeTable tr:eq(1)').after(
                                `<tr class="defPack_snipeRow">
                                    <td style="text-align: center"><a target="_blank" href="${game_data.link_base_pure}info_village&id=${villageId}">${coordinates.toCoord()}</a></td>
                                    <td style="text-align: center"><a target="_blank" href="${game_data.link_base_pure}info_village&id=${targetId}">${villageToBeSniped.toCoord()}</a></td>
                                    <td style="text-align: center">${availableUnits.map((u) => `<img src="/graphic/unit/unit_${u.unit}.png"> ${u.available}`).join(' ')}</td>
                                    <td style="text-align: center">${Format.timeSpan(60 * 1000 * travelTime, !0)} <b>(<span class="timer" style="color: darkblue" data-endtime="${dateTillLaunch.getTime() / 1000}"></span>)</b></td>
                                    <td style="text-align: center"><a target="_blank" href="${targetUrl}"><img src="graphic//buildings/place.png" alt="" title="VP"></td>
                                </tr>`
                            );
                        })
                        if (offPackTextArea.size < 1) {
                            UI.ErrorMessage('!!Snipe não encontrado!!');
                        }
                        Timing.tickHandlers.timers.handleTimerEnd = function () {
                            $(this).closest('tr').remove();
                        };
                        Timing.tickHandlers.timers.init();
                        $(window.TribalWars).off().on("global_tick", function () {
                            document.title = 'Next snipe: ' + $('.defPack_snipeTable').find('[data-endtime]:first').text();
                        });
                        $('#defPack_snipePossibilities').text(`(${offPackTextArea.size})`);
                        $('.defPack_snipeOffPackTextArea').text(Array.from(offPackTextArea).reverse().join('\n'));
                        $('.defPack_snipeTwLinkTextArea').text(Array.from(twLinkFormatTextArea).reverse().join('\n'));
                        if (resetTargetId) targetId = '';
                    });
                })

                $('input[name="snipeOutputFormat"]').change(function () {
                    $('.defPack_snipeTable, .defPack_snipeOffPackTextArea, .defPack_snipeTwLinkTextArea').hide();
                    $(`.${$(this).val()}`).show();
                });
            });
        }

        async function getTargetIdFromCoordinates(village) {
            return new Promise((resolve, reject) => {
                TribalWars.get("api", {
                    ajax: "target_selection",
                    async: true,
                    input: village.toCoord(),
                    limit: 1,
                    offset: 0,
                    request_id: 1,
                    type: "coord"
                }, function (target) {
                    resolve(target.villages[0].id);
                });
            })
        }

        function formatTimes(d, bold = false) {
            const pad = (num, size) => ('000' + num).slice(size * -1);

            let formattedTime = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + (d.getDate())).slice(-2) + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2) + "." + pad(d.getMilliseconds(), 3);
            return bold ? formattedTime.replace(/\d+:\d+:\d+.\d+/, '[b]$&[/b]') : formattedTime;
        }

        function convertToDate(twDate) {
            const t = twDate.match(/\d+:\d+:\d+.\d+/);
            const serverDate = $('#serverDate').text().replace(/\//g, '-').replace(/(\d{1,2})-(\d{1,2})-(\d{4})/g, '$3-$2-$1');
            let date = new Date(serverDate + ' ' + t);

            if (twDate.match('morgen')) {
                date.setDate(date.getDate() + 1);
                return date;
            } else if (twDate.match(/\d+\.\d+/)) {
                let monthDate = twDate.match(/\d+\.\d+/)[0].split('.');
                return new Date(date.getFullYear() + '-' + monthDate[1] + '-' + monthDate[0] + ' ' + t);
            } else {
                return date;
            }
        }

        function addSnobIncomingsTableDetail(incomings, type, row) {
            incomings[type] = row;
            const snobMainRow = row.parent().next().find('img[src*="snob.png"]');
            incomings[type + 'Snobs'] = snobMainRow;
            incomings[type + 'SnobsOK'] = snobMainRow.closest('td').find('.quickedit-label:containsAnyWord(OK, SNIPED)');
            incomings[type + 'SnobsCheck'] = snobMainRow.closest('td').find('.quickedit-label:containsAnyWord(CHECK)');
            incomings[type + 'SnobsNOK'] = snobMainRow.closest('td').find('.quickedit-label:not(:containsAnyWord(OK, SNIPED, CHECK))');
        }

        function getUniquePlayers() {
            let uniquePlayers = new Set();
            if ($('#incomings_table a[href*="id=0"]').closest('td').prev('td:visible').length > 0) {
                uniquePlayers.add('Bolwerk');
            }
            $('#incomings_table a[href*="screen=info_player"]:visible:not(a[href*="id=0"])').each(function () {
                uniquePlayers.add($(this).text().toString());
            });
            return uniquePlayers;
        }

        function refreshIncsPerPlayer() {
            let total = 0;
            let htmlRows = [];

            getUniquePlayers().forEach(function (player) {
                let incsByPlayerTotal = $(`#incomings_table a[href*="screen=info_player"]:visible:contains("${player}")`);
                let playerLink;
                if (player !== 'Bolwerk') {
                    playerLink = incsByPlayerTotal.first().attr('href').match(/id=(\d+)/)[1];
                } else {
                    incsByPlayerTotal = $('#incomings_table a[href*="id=0"]');
                }
                htmlRows.push(`<tr class="defPack_playerRow"><td width="40%"><a target="_blank" href="${window.location.origin}/game.php?screen=info_player&id=${playerLink}">${player}</a></td><td colspan="4"><a style="cursor: pointer" class="defPackFilterPlayer">${incsByPlayerTotal.length}</a><br></td></tr>`);
                total += incsByPlayerTotal.length;
            });

            let incsPerDayHtml = [];
            const arrivalTdIndex = $('#incomings_table th:contains("Chegada")').index();
            getUniqueDays().forEach(function (day) {
                let incsByDayTotal = $('#incomings_table tr').find(`td:eq(${arrivalTdIndex}):visible:contains("${day}")`).length;
                incsPerDayHtml.push(`<tr class="defPack_dayRow"><td data-day="${day}">${day}</td><td><a style="cursor: pointer" class="defPack_filterDay">${incsByDayTotal}</a><br></td></tr>`);
            });

            $('#defPack_incsWallUnder20Header').click(function () {
                $.when(loadProductionOverview('buildings')).done(function (html) {
                    let allIncomings = $('#incomings_table .row_a, #incomings_table .row_b').find('td:eq(1)').map(function () {
                        return $(this).text().match(/\d+\|\d+/)
                    }).get();
                    let incomingsWallUnder20 = $(html).find('.b_wall').filter(function () {
                        return parseInt($(this).text()) < 20
                    }).map(function () {
                        return $(this).parent().find('.quickedit-label').text().match(/\d+\|\d+/);
                    }).get();
                    const filtered = allIncomings.filter(village => incomingsWallUnder20.includes(village));
                    $('#defPack_incs_wallUnder20Content').replaceWith(
                        `<td><span class="icon header village"></span> Villages</td>
             <td colspan="4"><strong><a style="cursor: pointer;" id="defPackFilter_wallUnder20">${new Set(filtered).size}</a></td>
            `);
                    $('#defPackFilter_wallUnder20').click(function () {
                        $('#incomings_table tr').not(':last').not(':first').hide();
                        filtered.map((vil) => $('#incomings_table .row_a, #incomings_table .row_b').find('a:contains("' + vil + '")')).forEach((vil) => vil.closest('tr').show());
                        refreshIncsPerPlayer();
                    })
                });
            });
            $('.defPack_playerRow, .defPack_dayRow').remove();
            $('#defPack_incsPerPlayer').prepend(`${Object.keys(htmlRows).map(key => (htmlRows[key])).join('')}`);
            $('#defPack_incsPerPlayer').append(`${Object.keys(incsPerDayHtml).map(key => (incsPerDayHtml[key])).join('')}`);
            $("#incomings_table tr:first th:first").text(`Comandos (${total})`);
            $('.defPackFilterPlayer').click(function () {
                const player = $(this).closest('tr').find('td:first a[href*="screen=info_player"]').text();
                $('#incomings_table tr').not(':last').not(':first').hide();
                if (player === 'Bolwerk') {
                    $('#incomings_table a[href*="id=0"]').closest('tr').show();
                } else {
                    $(`#incomings_table a[href*="screen=info_player"]:contains("${player}")`).closest('tr').show();
                }

                refreshIncsPerPlayer();
            });

            $('.defPack_filterDay').click(function () {
                const day = $(this).closest('tr').find('td:first').data('day');
                $(`#incomings_table tr`).not(':last').not(':first').hide().find(`td:eq(5):contains("${day}")`).closest('tr').show();

                refreshIncsPerPlayer();
            })
        }

        function getUniqueDays() {
            return new Set($('#incomings_table td:nth-child(6):visible').map((_, element) => $(element).text().getDateString()).get());
        }

        function loadNextPageIncomings(firstRun, html) {
            const incomingRows = $(html).find('#incomings_table .row_a, #incomings_table .row_b');
            const snobs = $(html).find('#incomings_table img[src*="snob.png"]');

            const totalFilter = $('#defPackFilterReset');
            const newTotal = firstRun ? incomingRows.length : parseInt(totalFilter.text()) + incomingRows.length;
            totalFilter.text(newTotal);

            const snobsFilter = $('#defPackFilter_snobs');
            const newTotalSnobs = firstRun ? snobs.length : parseInt(snobsFilter.text()) + snobs.length || 0;
            snobsFilter.text(newTotalSnobs);

            const greenAttacks = $(incomingRows).find('img[src*="graphic/command/attack_small.png"]');
            recalculateNumbers(firstRun, $('#defPackFilter_green'), greenAttacks.length, newTotal)
            recalculateNumbers(firstRun, $('#defPackFilter_greenSnobs'), greenAttacks.parent().next().find('img[src*="snob.png"]').length, newTotalSnobs)
            recalculateNumbers(firstRun, $('#defPackFilter_greenSnobsOK'), greenAttacks.parent().next().find('img[src*="snob.png"]').closest('td').find('.quickedit-label:containsAnyWord(OK, SNIPED)').length, newTotalSnobs)
            recalculateNumbers(firstRun, $('#defPackFilter_greenSnobsCheck'), greenAttacks.parent().next().find('img[src*="snob.png"]').closest('td').find('.quickedit-label:containsAnyWord(CHECK)').length, newTotalSnobs)
            recalculateNumbers(firstRun, $('#defPackFilter_greenSnobsNOK'), greenAttacks.parent().next().find('img[src*="snob.png"]').closest('td').find('.quickedit-label:not(:containsAnyWord(OK, SNIPED, CHECK))').length, newTotalSnobs)

            const orangeAttacks = $(incomingRows).find('img[src*="graphic/command/attack_medium.png"]');
            recalculateNumbers(firstRun, $('#defPackFilter_orange'), $(incomingRows).find('img[src*="graphic/command/attack_medium.png"]').length, newTotal)
            recalculateNumbers(firstRun, $('#defPackFilter_orangeSnobs'), orangeAttacks.parent().next().find('img[src*="snob.png"]').length, newTotalSnobs)
            recalculateNumbers(firstRun, $('#defPackFilter_orangeSnobsOK'), orangeAttacks.parent().next().find('img[src*="snob.png"]').closest('td').find('.quickedit-label:containsAnyWord(OK, SNIPED)').length, newTotalSnobs)
            recalculateNumbers(firstRun, $('#defPackFilter_orangeSnobsCheck'), orangeAttacks.parent().next().find('img[src*="snob.png"]').closest('td').find('.quickedit-label:containsAnyWord(CHECK)').length, newTotalSnobs)
            recalculateNumbers(firstRun, $('#defPackFilter_orangeSnobsNOK'), orangeAttacks.parent().next().find('img[src*="snob.png"]').closest('td').find('.quickedit-label:not(:containsAnyWord(OK, SNIPED, CHECK))').length, newTotalSnobs)

            const redAttacks = $(incomingRows).find('img[src*="graphic/command/attack_large.png"]');
            recalculateNumbers(firstRun, $('#defPackFilter_red'), $(incomingRows).find('img[src*="graphic/command/attack_large.png"]').length, newTotal)
            recalculateNumbers(firstRun, $('#defPackFilter_redSnobs'), redAttacks.parent().next().find('img[src*="snob.png"]').length, newTotalSnobs)
            recalculateNumbers(firstRun, $('#defPackFilter_redSnobsOK'), redAttacks.parent().next().find('img[src*="snob.png"]').closest('td').find('.quickedit-label:containsAnyWord(OK, SNIPED)').length, newTotalSnobs)
            recalculateNumbers(firstRun, $('#defPackFilter_redSnobsCheck'), redAttacks.parent().next().find('img[src*="snob.png"]').closest('td').find('.quickedit-label:containsAnyWord(CHECK)').length, newTotalSnobs)
            recalculateNumbers(firstRun, $('#defPackFilter_redSnobsNOK'), redAttacks.parent().next().find('img[src*="snob.png"]').closest('td').find('.quickedit-label:not(:containsAnyWord(OK, SNIPED, CHECK))').length, newTotalSnobs)

            recalculateNumbers(firstRun, $('#defPackFilter_unknown'), $(incomingRows).find('img[src*="graphic/command/attack.png"]').length, newTotal)
            recalculateNumbers(firstRun, $('#defPackFilter_noTag'), incomingRows.find('td .quickedit-label:contains("Aanval")').length, newTotal)
            recalculateNumbers(firstRun, $('#defPackFilter_ok'), incomingRows.find('td .quickedit-label:containsAnyWord(OK, SNIPED)').length, newTotal)
            recalculateNumbers(firstRun, $('#defPackFilter_nok'), incomingRows.find('td .quickedit-label:not(:containsAnyWord(OK, SNIPED))').length, newTotal)
        }

        function recalculateNumbers(firstRun, oldValues, newValues, total) {
            newValues = firstRun ? newValues : parseInt(oldValues.text()) + newValues;
            oldValues.text(newValues);
            oldValues.parent().next('span').text(` (${(newValues / total * 100 || 0).round(2)}%)`)
        }

        function renameCommand(id, value, async) {
            return twLib.post({
                url: `${game_data.link_base_pure}info_command&ajaxaction=edit_other_comment&id=${id}&h=${game_data.csrf}`,
                async: async ? async : false,
                data: {text: value},
                success: function () {
                    $(`span.quickedit[data-id="${id}"]`).find('span.quickedit-label').text(value);
                }
            });
        }

        async function buildSimulationUrl(html, wallParam, villageId) {
            const troops = game_data.units.reduce((obj, unit) => {
                const selector = html === document ? 'visible' : 'first'; // Sangu fix
                obj[unit] = (parseInt($(html).find(`.all_unit [data-count="${unit}"]:${selector}`).text()) || 0) + (parseInt($(html).find(`#os_units\\+ [data-unit="${unit}"]`).closest('td').find('b').text().replace('.', '')) || 0);
                return obj;
            }, {});
            await addIncomingTroopsToSimulationData(html, troops, villageId);
            return `${game_data.link_base_pure}place${buildQueryParamsForSimulationCall(html, troops, wallParam)}`;
        }

        async function addIncomingTroopsToSimulationData(html, troops, villageId) {
            let showIncomingUnits = $(html).find('#show_incoming_units');
            if ($(html).find("#show_incoming_units [data-command-type=support]").length > 0) {
                const incomingsElement = $(html).find('#commands_incomings');
                const allRows = incomingsElement.find('tr.command-row.no_ignored_command');
                const incomingSupports = await getTotalIncomingOsData(villageId);

                showIncomingUnits.before(`<div id="incoming_os_sum_table" class="vis moveable widget"><h4 class="head with-button"><img src="graphic/command/support.png" alt=""> Apoio a chegar <img src="graphic/command/support.png" alt=""></h4><div class="widget_content" style="display: block">${incomingSupports}</div></div>`);
                $(html).find('#support_sum').css('text-align', 'center');

                const indexFirstAttack = $(allRows).find('img[src*="attack"]').closest('tr').first().index();
                const indexLastSupport = $(allRows).find('img[src*="support"]').closest('tr').last().index();
                const incomingSupportCommandsBeforeFirstAttack = $(incomingsElement)
                    .find(`tr:lt(${indexFirstAttack}).command-row.no_ignored_command img[src*="support"]`).closest('tr')
                    .map((_, el) => $(el).find('.command_hover_details').attr('data-command-id')).get();

                if (indexLastSupport < indexFirstAttack || indexFirstAttack === -1) {
                    $(incomingSupports).find('td').each((i, el) => troops[$(el).attr('data-unit')] += parseInt($(el).text()) || 0);
                } else {
                    for (const command of incomingSupportCommandsBeforeFirstAttack) {
                        Object.entries(await getIncomingSupportDataFor(command)).forEach(([key, value]) => troops[key] += parseInt(value.count))
                    }
                }
            }
        }

        function buildQueryParamsForSimulationCall(html, troops, wallParam) {
            let queryParams = `&mode=sim&simulate${wallParam}`;
            Object.entries(troops).forEach(([unit, amount]) => queryParams += `&def_${unit}=${amount}`);
            Object.entries(userData.clear_data).forEach(([unit, amount]) => queryParams += `&att_${unit}=${amount}`);

            // Nao preencher efeitos/modificadores automaticamente no simulador.
            // Mantem tropas e muralha, mas deixa bonus de atacante/defensor, noite,
            // crenca e bandeiras por preencher para poderes escolher manualmente.
            queryParams += "&def_benefits=" + encodeURIComponent(JSON.stringify([]));
            queryParams += "&att_benefits=" + encodeURIComponent(JSON.stringify([]));
            if (config.worldSettings?.farm_limit) {
                queryParams += `&def_farm=${game_data.village.buildings.farm}`;
            }
            if (config.worldSettings?.tech === settings.tech.LEVELS) {
                Object.entries(userData.offTechLevels).forEach(([unit, amount]) => queryParams += `&att_tech_${unit}=${amount}`);
                Object.entries(techLevels[game_data.village.id]).forEach(([unit, amount]) => queryParams += `&def_tech_${unit}=${amount}`);
            }
            return queryParams;
        }

        function addBoost(input, type, amount, unit, description) {
            let boost = {inputs: [], type: type};

            if (amount != null) boost.inputs.push(amount);
            if (unit != null) boost.inputs.push(unit);
            if (description != null) boost.inputs.push(description);

            input.push(boost);
        }

        function configureHealthCheckValues(stackCheckerSettings) {
            const pop = parseInt(stackCheckerSettings.totalPopFromSimulation.replace('.', '')) || 0;
            const clears = recalculateClearsNeeded(stackCheckerSettings);
            const stackHealth = Object.values(userData.stack_data).filter((data) => clears >= data.clears).shift();
            const stackColor = Object.values(userData.stack_data).filter((data) => pop >= data.population).shift() || userData.stack_data['NOK'];
            return {clears, color: stackHealth.color, message: stackHealth.message, stackColor: stackColor.bgColor};
        }

        function recalculateClearsNeeded(stackCheckerSettings) {
            let clears = stackCheckerSettings.clearsNeeded.indexOf('meer dan 100') !== -1 ? 100 : parseInt(stackCheckerSettings.clearsNeeded) || 0;
            if ((parseInt(stackCheckerSettings.totalPopFromSimulation.replace('.', '')) || 0) > 10000) {
                clears += 1;
            }
            return clears;
        }

        function calculateSupportPopulationPreview() {
            let totalPopulation = 0;
            let totalUnitPopAmount = {};
            const checkedVillages = $("#village_troup_list tr:not(:first) input[type=checkbox]:checked");
            const requestOsTable = $('#defPack_requestOSTable tbody');

            checkedVillages.each(function () {
                $(this).closest('tr').find('td').slice(2, -1).each(function () {
                    const input = $(this).find('input');
                    const unit = input.parent().attr('data-unit');
                    const amount = (parseInt(input.val()) || 0);
                    totalPopulation += amount * settings.troopPop[unit];
                    totalUnitPopAmount[unit] = amount + (totalUnitPopAmount[unit] || 0);
                });
            });

            requestOsTable.empty();
            requestOsTable.append(`<tr>${Object.keys(totalUnitPopAmount).map(unit => `<td data-unit="${unit}">${Format.number(totalUnitPopAmount[unit])}</td>`).join('')}<td>${Format.number(totalPopulation)}</td></tr>`);
        }

        function filterVillages(slowestUnit, arrivalTime) {
            let counter = 0;
            const checked = $('#defPack_callScreenFilterVillages').is(':checked');

            if (checked) {
                $('.call-village').each(function () {
                    const durationInMilliseconds = $(this).find(`[data-unit=${slowestUnit.unit}]`)
                        .prop('tooltipText')
                        .match(/\d+:\d+:\d+/).pop()
                        .split(':')
                        .reduce((acc, time) => (60 * acc) + +time) * 1000;
                    const dateTillLaunch = new Date((arrivalTime * 1000) - durationInMilliseconds);
                    const timeUntilLaunch = dateTillLaunch.getTime() - new Date().getTime();

                    if (timeUntilLaunch <= 0) {
                        ++counter;
                        $(this).find('td:last input').removeClass('troop-request-selector');
                        $(this).hide();
                    } else {
                        $(this).find('td:last input').addClass('troop-request-selector');
                        $(this).show();
                    }
                });

                $('#defPack_callScreenTable tr:eq(1)').replaceWith(`
                    <tr>
                        <td colspan="6">
                            <div class="info_box">
                                Removidas <strong>${counter}</strong> aldeias. Unidade + lenta <img style="vertical-align: sub;" src="graphic/unit/unit_${slowestUnit.unit}.png">. Até ao tempo selecionado<b>(<span style="color: darkblue" class="timer" data-endtime="${arrivalTime}"></span>)</b)
                            </div>
                        </td>
                    </tr>`
                );
            } else {
                $('.call-village').each((element) => $(element).find('td:last input').addClass('troop-request-selector') && $(element).show());
                $('#defPack_callScreenTable tr:eq(1)').hide();
            }
            Timing.tickHandlers.timers.init();
        }

        function getSlowestUnit() {
            return $('.unit_checkbox:checked').map(function () {
                const unitName = $(this).attr('id').split('checkbox_')[1];
                return {unit: unitName, speed: parseFloat(config.unitSpeedSettings[unitName])};
            }).get().sort(((a, b) => (a.speed > b.speed ? -1 : 1)))[0];
        }

        function createOptions(rows) {
            return rows.map((item) => {
                const arrivalTime = parseInt($(item).find('[data-endtime]').data('endtime'));
                const command = $(item).find('.quickedit-label').text().trim();
                return `<option value="${arrivalTime}">${command + " -> " + Format.date(arrivalTime, !0, !0, !0, !1)}</option>`;
            }).join('\n');
        }

        function refreshCoordList(coords, id = 'defPack_mapTaggerTextArea') {
            $('#defPack_mapMassSupportLink').attr('href', `${game_data.link_base_pure}place&mode=call&group=0&page=-1&sources=${Array.from(coords.values()).map((s) => s.id).join(',')}`)
            $(`#${id}`).text(
                Array.from(coords.values(), c => c.coords)
                    .filter((x, i, a) => a.indexOf(x) === i)
                    .join('\n')
            );
        }
    }

)
();
