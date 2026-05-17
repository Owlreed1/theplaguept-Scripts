// ==UserScript==
// @name         Renomear Ataques Cores edit by ThePlaguePT & Sun Tzu
// @version      Release
// @match        https://*.tribalwars.com.pt/game.php?*
// @match        https://*.tribalwars.co.uk/game.php?*
// @grant        none
// @run-at       document-end
// @icon         https://cdn.discordapp.com/attachments/1492266164901122118/1505369754456686622/ig_05a8886d4767d260016a090e9a58048191ae5d6323277d87f0.png?ex=6a0a6055&is=6a090ed5&hm=d24c676b6815198985211a622d67ddb4baa3c88de962f1ebfb100498f5c80302&
// ==/UserScript==

console.log('[Renomear Ataques] Script carregado:', location.href);

////* Preferêcias do script *////
// O tamanho da letra influencia o tamanho do botao, caso seja 0 será utilizado o original do jogo, 12.
var tamanho_letra = 8;
var pagina_de_ataques = 'coluna'; //Modos: coluna, linha, nada
var mostrar_botoes_no_mapa = false;

// Para adicionar botões basta colocar os valores depois de uma virgula, o botÃ£o so aparece caso haja valor de nome de botÃ£o e nome de comando.
// Caso nÃ£o coloque a cor do botao ou cor do texto serÃ¡ utilizado o valor original do jogo (botao castanho e letra branca)
var settings = [
    ['[Morto]', '[Desviado]', '[Desviar]', '[Reconquistar]', '[Reconquistado]', '[Snipado]', '[Snipar]','[Fubar]', '[Snipe Cancel]', '[Fake]', '[Possível Full]', '[Reforçar]', ' | Retirar', ' | Vigiar', ' | ✓'], //Nome do comando
    ['M'      , 'D!'        , 'D'        , 'R'             , 'RR'             , 'S!'       , 'S'       , 'FU'    ,'SC'             , 'FA' , 'PV', 'RF', 'R!', 'V!', '✓'], //Nome do botÃ£o
    ['green'  , 'orange'    , 'dorange'  , 'gray'          , 'white'          , 'lblue'    , 'blue'    , 'dgreen','red'            , 'Pink', 'dblue', 'black', 'dgreen', 'yellow','lgreen' ], //Cor do botÃ£o
    ['white'  , 'white'     , 'white'    , 'white'         , 'black'          , 'white'    , 'white'   , 'white' ,'white'          , 'black', 'white', 'white', 'white' , 'black','black']
] //Cor do texto

// Para adicionar cores basta acrescentar os valores apÃ³s uma virgula.
var colors = [
    ['red', 'green', 'blue', 'yellow', 'orange', 'lblue', 'lime', 'white', 'black', 'gray', 'dorange', 'black', 'Pink', 'brown','dblue','dgreen','lgreen'], // Nomes das cores
    ['#e20606', '#31c908', '#0d83dd', '#ffd91c', '#ef8b10', '#22e5db', '#ffd400', '#ffffff', '#000000', '#adb6c6', '#9232a8', '#40434E', '#FFC0CB', '#892929','#00007f','#004c00','#93cf82'], // Cor de background de botÃ£o topo e letra
    ['#ff0000', '#228c05', '#0860a3', '#e8c30d', '#d3790a', '#0cd3c9', '#ffd400', '#dbdbdb', '#000000', '#828891', '#9232a8', '#40434E','#FFC0CB' , '#892929','#00007f','#004c00','#93cf82' ]
] // Cor de background de botÃ£o fundo

var world = String(location.href).split(/[/:.]+/)[1]
var world_number = Number(world.substring(2))

function iT(nr, linha) {
    var quickedit = $(linha).find('.quickedit-content:first');
    if (!quickedit.length || quickedit.find('.ra-buttons').length) return;

    var html = '<span class="ra-buttons" style="float: right;">';

settings[1].forEach(function(nome, num) {
    html += '<button type="button" class="btn ra-btn" data-num="' + num + '" title="' + settings[0][num] + '" style="color: ' + getFon(num) + '; font-size: ' + getSize() + 'px !important; background: linear-gradient(to bottom, ' + getTop(num) + ' 30%, ' + getBot(num) + ' 10%)">' + nome + '</button>';
});

html += '<button type="button" class="btn ra-reset-btn" title="Resetar" style="color: white; font-size: ' + getSize() + 'px !important; background: linear-gradient(to bottom, #666 30%, #222 10%)">RS</button>';

html += '</span>';
    quickedit.append(html);

    quickedit.find('.ra-btn').click(function() {
        var num = Number($(this).attr('data-num'));
        var comando = settings[0][num];

        $(linha).find('.rename-icon:first').click();

        setTimeout(function() {
            var input = $(linha).find('input[type=text]:first');
            var botaoGuardar = $(linha).find('input[type=button]:first');

            if (!input.length) return;

            if (comando.indexOf('|') === -1) {
                input.val(input.val().split(" ")[0] + ' ' + comando);
            } else {
                input.val(input.val() + comando);
            }

            botaoGuardar.click();

setTimeout(function() {
    $(linha).find('.ra-buttons').remove();
    iT(nr, linha);
    aplicarCorAtaque(linha);
}, 300);

setTimeout(function() {
    $(linha).find('.ra-buttons').remove();
    iT(nr, linha);
    aplicarCorAtaque(linha);
}, 900);
        }, 50);
});

    quickedit.find('.ra-reset-btn').click(function() {
    $(linha).find('.rename-icon:first').click();

    setTimeout(function() {
        var input = $(linha).find('input[type=text]:first');
        var botaoGuardar = $(linha).find('input[type=button]:first');

        if (!input.length) return;

        input.val(input.val().split(" ")[0]);
        botaoGuardar.click();

        setTimeout(function() {
            $(linha).find('.ra-buttons').remove();
            iT(nr, linha);
            aplicarCorAtaque(linha);
        }, 300);

        setTimeout(function() {
            $(linha).find('.ra-buttons').remove();
            iT(nr, linha);
            aplicarCorAtaque(linha);
        }, 900);
    }, 50);
});

}

function getTop(num) {
    var index = colors[0].indexOf(settings[2][num])
    if (settings[2][num]) {
        return colors[1][index];
    } else {
        return '#b69471';
    }
}

function getBot(num) {
    var index = colors[0].indexOf(settings[2][num])
    if (settings[2][num]) return colors[2][index];
    else return '#6c4d2d';
}

function getFon(num) {
    var index = colors[0].indexOf(settings[3][num])
    if (settings[3][num]) return colors[1][index];
    else return '#ffffff';
}

function getSize() {
    if (tamanho_letra) return tamanho_letra;
    else return 12;
}

var renomearAtaquesLastCount = -1;

function startRenomearAtaques() {
    if (typeof window.jQuery === 'undefined') {
        setTimeout(startRenomearAtaques, 300);
        return;
    }

    window.$ = window.jQuery;

    console.log('[Renomear Ataques] jQuery OK. A iniciar.');
    runRenomearAtaques();
    setInterval(runRenomearAtaques, 750);
}

function runRenomearAtaques() {
    var params = new URLSearchParams(location.search);
    var screen = params.get('screen');
    var mode = params.get('mode');
    var subtype = params.get('subtype');

    var isIncomingsPage =
        mode === 'incomings' ||
        subtype === 'attacks' ||
        location.href.indexOf('mode=incomings') !== -1 ||
        location.href.indexOf('subtype=attacks') !== -1;

    var isOverviewVillages =
        screen === 'overview_villages' ||
        location.href.indexOf('screen=overview_villages') !== -1;

    var isMapPage =
        screen === 'map' ||
        location.href.indexOf('screen=map') !== -1;

    if (!isIncomingsPage && !isOverviewVillages) {
        $('#commands_incomings .command-row').each(function(nr, linha) {
            if (!isMapPage || mostrar_botoes_no_mapa) {
                iT(nr, linha);
            } else {
                $(linha).find('.ra-buttons').remove();
            }
            aplicarCorAtaque(linha);
        });
        return;
    }

    var rows = $('#incomings_table tr').filter(function() {
        return $(this).find('.quickedit-label').length > 0;
    });

    if (rows.length !== renomearAtaquesLastCount) {
        renomearAtaquesLastCount = rows.length;
        console.log('[Renomear Ataques] Linhas encontradas:', rows.length);
    }

    rows.each(function(nr, linha) {
        iT(nr, linha);
        aplicarCorAtaque(linha);
    });
}

function aplicarCorAtaque(linha) {
    if (isSupport(linha)) {
        pintarLinha(linha, colors[2][colors[0].indexOf('yellow')]);
        return;
    }

    var name = $.trim($(linha).find('.quickedit-label:first').text());
    var dual = check(name);
    var code = getCodeByName(name);

    if (dual) {
        var code1 = check(name, 1);
        var code2 = check(name, 2);
        var color1 = colors[1][colors[0].indexOf(settings[2][code1])];
        var color2 = colors[1][colors[0].indexOf(settings[2][code2])];

        pintarLinha(linha, 'repeating-linear-gradient(45deg, ' + color1 + ', ' + color1 + ' 10px, ' + color2 + ' 10px, ' + color2 + ' 20px)');
    } else if (code !== -1) {
        var colorcode = settings[2][code];
        var color = colors[1][colors[0].indexOf(colorcode)];

        pintarLinha(linha, color);
    } else {
        pintarLinha(linha, colors[2][colors[0].indexOf('red')]);
    }
}

function getCodeByName(name) {
    for (var i = 0; i < settings[0].length; i++) {
        if (name.indexOf(settings[0][i]) !== -1) {
            return i;
        }
    }

    return -1;
}

function pintarLinha(linha, background) {
    var textStyle = 'color: white !important; text-shadow:-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;';
    var colunaComNome = $(linha).find('.quickedit-label:first').closest('td');

    if (pagina_de_ataques === 'linha') {
        $(linha).find('td').attr('style', 'background: ' + background + ' !important;');
        $(linha).find('a').attr('style', textStyle);
    } else if (pagina_de_ataques === 'coluna') {
        colunaComNome.attr('style', 'background: ' + background + ' !important;');
        colunaComNome.find('a, .quickedit-label').attr('style', textStyle);
    }
}

startRenomearAtaques();

function check(name, nr) {
    var i, j;
    for (i = 0; i < settings[0].length; i++) {
        for (j = 0; j < settings[0].length; j++) {
            if (name.indexOf(settings[0][i] + settings[0][j]) != -1) {
                if (nr == 1) return i;
                else if (nr == 2) return j;
                else return true;
            }
        }
    }
    return false;
}

function isSupport(linha) {
    var scr = $(linha).find('img[src*="support"]').attr('src');
    return !!scr;
}
