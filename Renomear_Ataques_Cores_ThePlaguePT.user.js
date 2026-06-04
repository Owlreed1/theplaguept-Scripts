// ==UserScript==
// @name         Renomear Ataques Cores ThePlaguePT
// @version      2.2.3
// @description  Botoes rapidos para renomear e colorir ataques recebidos no Tribal Wars.
// @author       ThePlaguePT
// @namespace    https://github.com/ThePlaguePT
// @match        https://*.tribalwars.com.pt/game.php?*
// @match        https://*.tribalwars.co.uk/game.php?*
// @grant        none
// @run-at       document-idle
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// ==/UserScript==

(() => {
    "use strict";

    const SCRIPT_ID = "renomear-ataques-cores-theplaguept";
    const STYLE_ID = `${SCRIPT_ID}-style`;

    const CONFIG = {
        tamanhoLetraPx: 7,
        paginaDeAtaques: "coluna", // Modos: coluna, linha, nada
        mostrarBotoesNoMapa: false,
        intervaloFallbackMs: 2500,
        timeoutEdicaoMs: 1200,
        intervaloEsperaInputMs: 40,
        manterInfoAtacante: true,
        realcarTexto: true,
        realcarInformacoesTabela: true,
    };

    const CORES = {
        red: { top: "#e20606", bottom: "#ff0000" },
        green: { top: "#31c908", bottom: "#228c05" },
        blue: { top: "#0d83dd", bottom: "#0860a3" },
        yellow: { top: "#ffd91c", bottom: "#e8c30d" },
        orange: { top: "#ef8b10", bottom: "#d3790a" },
        lblue: { top: "#22e5db", bottom: "#0cd3c9" },
        lime: { top: "#ffd400", bottom: "#ffd400" },
        white: { top: "#ffffff", bottom: "#dbdbdb" },
        black: { top: "#000000", bottom: "#000000" },
        gray: { top: "#adb6c6", bottom: "#828891" },
        dorange: { top: "#9232a8", bottom: "#9232a8" },
        dark: { top: "#40434e", bottom: "#40434e" },
        pink: { top: "#ffc0cb", bottom: "#ffc0cb" },
        brown: { top: "#892929", bottom: "#892929" },
        dblue: { top: "#00007f", bottom: "#00007f" },
        dgreen: { top: "#004c00", bottom: "#004c00" },
        lgreen: { top: "#93cf82", bottom: "#93cf82" },
    };

    const COMANDOS = [
        { tag: "[Morto]", label: "M", corBotao: "green", corTexto: "white", modo: "substituir" },
        { tag: "[Desviado]", label: "D!", corBotao: "orange", corTexto: "white", modo: "substituir" },
        { tag: "[Desviar]", label: "D", corBotao: "dorange", corTexto: "white", modo: "substituir" },
        { tag: "[Reconquistar]", label: "R", corBotao: "gray", corTexto: "white", modo: "substituir" },
        { tag: "[Reconquistado]", label: "RR", corBotao: "white", corTexto: "black", modo: "substituir" },
        { tag: "[Snipado]", label: "S!", corBotao: "lblue", corTexto: "white", modo: "substituir" },
        { tag: "[Snipar]", label: "S", corBotao: "blue", corTexto: "white", modo: "substituir" },
        { tag: "[Fubar]", label: "FU", corBotao: "dgreen", corTexto: "white", modo: "substituir" },
        { tag: "[Snipe Cancel]", label: "SC", corBotao: "red", corTexto: "white", modo: "substituir" },
        { tag: "[Fake]", label: "FA", corBotao: "pink", corTexto: "black", modo: "substituir" },
        {
            tag: "[Poss\u00edvel Full]",
            aliases: ["[Possivel Full]", "[Poss\u00c3\u00advel Full]"],
            label: "PV",
            corBotao: "dblue",
            corTexto: "white",
            modo: "substituir",
        },
        {
            tag: "[Refor\u00e7ar]",
            aliases: ["[Reforcar]", "[Refor\u00c3\u00a7ar]"],
            label: "RF",
            corBotao: "black",
            corTexto: "white",
            modo: "substituir",
        },
        { tag: " | Retirar", label: "R!", corBotao: "dgreen", corTexto: "white", modo: "acrescentar" },
        { tag: " | Vigiar", label: "V!", corBotao: "yellow", corTexto: "black", modo: "acrescentar" },
        {
            tag: " | \u2713",
            aliases: [" | \u00e2\u0153\u201c"],
            label: "\u2713",
            corBotao: "lgreen",
            corTexto: "black",
            modo: "acrescentar",
        },
    ];

    const SELETORES = {
        linhasAtaques: "#incomings_table tr",
        linhasComandos: "#commands_incomings .command-row",
        quickedit: ".quickedit-content",
        etiquetaNome: ".quickedit-label",
        iconeRenomear: ".rename-icon",
        inputNome: 'input[type="text"]',
        areaEdicao: ".quickedit-edit",
        botoesGuardar: 'input[type="button"], input[type="submit"], button[type="submit"]',
        linkAldeia: 'a[href*="screen=info_village"]',
        linkJogador: 'a[href*="screen=info_player"]',
    };

    let execucaoAgendada = false;
    const mapasCabecalhoTabela = new WeakMap();

    function iniciar() {
        if (!document.body) {
            setTimeout(iniciar, 100);
            return;
        }

        aplicarEstilos();
        executar();

        const observer = new MutationObserver(agendarExecucao);
        observer.observe(document.body, { childList: true, subtree: true });

        setInterval(executar, CONFIG.intervaloFallbackMs);
        console.log("[Renomear Ataques TP] Script carregado:", location.href);
    }

    function agendarExecucao() {
        if (execucaoAgendada) return;

        execucaoAgendada = true;
        requestAnimationFrame(() => {
            execucaoAgendada = false;
            executar();
        });
    }

    function executar() {
        const contexto = obterContextoPagina();
        const linhas = obterLinhasValidas();

        linhas.forEach((linha) => {
            if (contexto.isMapa && !CONFIG.mostrarBotoesNoMapa) {
                removerBotoes(linha);
            } else {
                inserirBotoes(linha);
            }

            aplicarCorAtaque(linha);
            realcarTextoLinha(linha);
            realcarInformacoesLinha(linha);
        });
    }

    function obterContextoPagina() {
        const params = new URLSearchParams(location.search);
        const screen = params.get("screen") || "";

        return {
            isMapa: screen === "map" || location.href.includes("screen=map"),
        };
    }

    function obterLinhasValidas() {
        const linhas = [
            ...document.querySelectorAll(SELETORES.linhasAtaques),
            ...document.querySelectorAll(SELETORES.linhasComandos),
        ];

        return [...new Set(linhas)].filter((linha) => (
            linha.querySelector(SELETORES.etiquetaNome)
            && linha.querySelector(SELETORES.quickedit)
        ));
    }

    function inserirBotoes(linha) {
        const quickedit = linha.querySelector(SELETORES.quickedit);
        if (!quickedit || quickedit.querySelector(".ra-tp-botoes")) return;

        const container = document.createElement("span");
        container.className = "ra-tp-botoes";

        COMANDOS.forEach((comando, index) => {
            if (!comando.tag || !comando.label) return;

            const botao = criarBotao(comando.label, comando.tag.trim(), comando.corBotao, comando.corTexto);
            botao.dataset.comandoIndex = String(index);
            botao.addEventListener("click", (evento) => {
                evento.preventDefault();
                evento.stopPropagation();
                editarNomeLinha(linha, (valorAtual) => construirNome(valorAtual, comando, linha));
            });

            container.appendChild(botao);
        });

        const reset = criarBotao("RS", "Resetar etiquetas", "dark", "white");
        reset.classList.add("ra-tp-reset");
        reset.addEventListener("click", (evento) => {
            evento.preventDefault();
            evento.stopPropagation();
            editarNomeLinha(linha, (valorAtual) => limparEtiquetas(valorAtual, linha));
        });
        container.appendChild(reset);

        quickedit.appendChild(container);
    }

    function criarBotao(label, titulo, corBotao, corTexto) {
        const botao = document.createElement("button");
        const background = obterCor(corBotao, "brown");
        const texto = obterCor(corTexto, "white");

        botao.type = "button";
        botao.className = "btn ra-tp-botao";
        botao.title = titulo;
        botao.textContent = label;
        botao.style.fontSize = `${CONFIG.tamanhoLetraPx || 12}px`;
        botao.style.color = texto.top;
        botao.style.background = `linear-gradient(to bottom, ${background.top} 35%, ${background.bottom} 100%)`;

        return botao;
    }

    async function editarNomeLinha(linha, transformarNome) {
        if (linha.dataset.raTpEditando === "1") return;

        linha.dataset.raTpEditando = "1";

        try {
            const icone = linha.querySelector(SELETORES.iconeRenomear);
            if (!icone) return;

            icone.click();

            const input = await esperarPor(
                () => linha.querySelector(SELETORES.inputNome),
                CONFIG.timeoutEdicaoMs,
                CONFIG.intervaloEsperaInputMs,
            );

            if (!input) return;

            const novoNome = transformarNome(input.value);

            const botaoGuardar = obterBotaoGuardar(linha, input);
            if (novoNome !== input.value) {
                input.value = novoNome;
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
            }

            if (botaoGuardar) {
                botaoGuardar.click();
            } else if (input.form && typeof input.form.requestSubmit === "function") {
                input.form.requestSubmit();
            }

            refrescarLinhaDepois(linha);
        } finally {
            setTimeout(() => {
                delete linha.dataset.raTpEditando;
            }, 500);
        }
    }

    function obterBotaoGuardar(linha, input) {
        const areaEdicao = input.closest(SELETORES.areaEdicao);
        if (areaEdicao) {
            const botao = areaEdicao.querySelector(SELETORES.botoesGuardar);
            if (botao) return botao;
        }

        return linha.querySelector(`${SELETORES.areaEdicao} ${SELETORES.botoesGuardar}`);
    }

    function refrescarLinhaDepois(linha) {
        [250, 900].forEach((atraso) => {
            setTimeout(() => {
                removerBotoes(linha);
                inserirBotoes(linha);
                aplicarCorAtaque(linha);
            }, atraso);
        });
    }

    function construirNome(valorAtual, comando, linha) {
        const atual = prepararNomeParaInfoAtacante(valorAtual, linha);

        if (comando.modo === "acrescentar") {
            if (comandoExisteNoNome(atual, comando)) return aplicarInfoAtacante(atual, linha);
            return aplicarInfoAtacante(`${atual}${comando.tag}`, linha);
        }

        const sufixosAtivos = COMANDOS
            .filter((item) => item.modo === "acrescentar" && comandoExisteNoNome(atual, item))
            .map((item) => item.tag)
            .join("");
        const base = removerTags(atual, () => true);

        return aplicarInfoAtacante(`${base} ${comando.tag}${sufixosAtivos}`, linha);
    }

    function limparEtiquetas(valorAtual, linha) {
        const atual = prepararNomeParaInfoAtacante(valorAtual, linha);
        const limpo = removerTags(atual, () => true);

        return aplicarInfoAtacante(normalizarEspacos(limpo) || "Ataque", linha);
    }

    function prepararNomeParaInfoAtacante(nome, linha) {
        const normalizado = normalizarEspacos(nome);
        if (!construirSufixoInfoAtacante(linha)) return normalizado;

        return removerInfoAtacanteAuto(normalizado);
    }

    function aplicarInfoAtacante(nome, linha) {
        const base = normalizarEspacos(nome);
        const sufixo = construirSufixoInfoAtacante(linha);
        if (!sufixo) return base;

        return normalizarEspacos(`${removerInfoAtacanteAuto(base)}${sufixo}`);
    }

    function construirSufixoInfoAtacante(linha) {
        if (!CONFIG.manterInfoAtacante) return "";

        const info = obterInfoAtacante(linha);
        const partes = [];

        if (info.jogador) partes.push(`Atacante: ${info.jogador}`);
        if (info.aldeia) partes.push(`Origem: ${info.aldeia}`);

        return partes.length ? ` / ${partes.join(" / ")}` : "";
    }

    function removerInfoAtacanteAuto(nome) {
        return normalizarEspacos(
            String(nome || "")
                .replace(/\s*(?:\||\/)\s*Atacante:\s*.*?(?=\s*(?:\||\/)\s*(?:Atacante|Origem):|$)/gi, "")
                .replace(/\s*(?:\||\/)\s*Origem:\s*.*$/gi, ""),
        );
    }

    function obterInfoAtacante(linha) {
        return {
            jogador: obterTextoLink(obterLinkJogadorAtacante(linha)),
            aldeia: obterTextoLink(obterLinkAldeiaOrigem(linha)),
        };
    }

    function obterLinkJogadorAtacante(linha) {
        const celulaPreferida = linha.children[3];
        const linkPreferido = celulaPreferida?.querySelector(SELETORES.linkJogador);
        if (linkPreferido) return linkPreferido;

        return [...linha.querySelectorAll(SELETORES.linkJogador)]
            .find((link) => !link.closest(SELETORES.quickedit)) || null;
    }

    function obterLinkAldeiaOrigem(linha) {
        const celulaPreferida = linha.children[2];
        const linkPreferido = celulaPreferida?.querySelector(SELETORES.linkAldeia);
        if (linkPreferido) return linkPreferido;

        const linksAldeia = [...linha.querySelectorAll(SELETORES.linkAldeia)]
            .filter((link) => !link.closest(SELETORES.quickedit));
        const linksComCoordenadas = linksAldeia.filter((link) => /\b\d{3}\|\d{3}\b/.test(obterTextoLink(link)));

        if (linksComCoordenadas.length > 1) return linksComCoordenadas[1];
        if (linksComCoordenadas.length === 1) return linksComCoordenadas[0];

        return linksAldeia[1] || linksAldeia[0] || null;
    }

    function obterTextoLink(link) {
        return normalizarEspacos(link?.textContent || "");
    }

    function realcarTextoLinha(linha) {
        if (!CONFIG.realcarTexto) return;

        const label = linha.querySelector(SELETORES.etiquetaNome);
        if (!label) return;

        const texto = normalizarEspacos(label.textContent);
        if (!texto || label.dataset.raTpRealceTexto === texto) return;

        label.textContent = "";
        label.appendChild(criarFragmentoRealceTexto(texto));
        label.dataset.raTpRealceTexto = texto;
    }

    function criarFragmentoRealceTexto(texto) {
        const fragmento = document.createDocumentFragment();
        const regexInfo = /\/\s*(Atacante|Origem):\s*/gi;
        const marcadores = [...texto.matchAll(regexInfo)];

        if (!marcadores.length) {
            acrescentarTextoComTags(fragmento, texto);
            return fragmento;
        }

        let posicao = 0;
        marcadores.forEach((marcador, index) => {
            acrescentarTextoComTags(fragmento, texto.slice(posicao, marcador.index));

            const tipo = marcador[1].toLowerCase();
            const inicioValor = marcador.index + marcador[0].length;
            const fimValor = marcadores[index + 1]?.index ?? texto.length;

            acrescentarSpan(fragmento, marcador[0], tipo === "atacante" ? "infoLabelAtacante" : "infoLabelOrigem");
            if (tipo === "origem") {
                acrescentarValorOrigem(fragmento, texto.slice(inicioValor, fimValor));
            } else {
                acrescentarSpan(fragmento, texto.slice(inicioValor, fimValor), "infoValorAtacante");
            }

            posicao = fimValor;
        });

        acrescentarTextoComTags(fragmento, texto.slice(posicao));
        return fragmento;
    }

    function acrescentarTextoComTags(fragmento, texto) {
        const valor = String(texto || "");
        if (!valor) return;

        const tags = obterTagsParaRealce();
        const regexTags = new RegExp(tags.map((item) => escapeRegExp(item.tag)).join("|"), "g");
        let posicao = 0;
        let match;

        while ((match = regexTags.exec(valor)) !== null) {
            acrescentarSpan(fragmento, valor.slice(posicao, match.index), "base");
            acrescentarSpan(fragmento, match[0], "tag", tags.find((item) => item.tag === match[0])?.comando);
            posicao = match.index + match[0].length;
        }

        acrescentarSpan(fragmento, valor.slice(posicao), "base");
    }

    function acrescentarValorOrigem(fragmento, texto) {
        const valor = String(texto || "");
        if (!valor) return;

        const regexPartes = /(\b\d{3}\|\d{3}\b|\bK\d{1,3}\b)/g;
        let posicao = 0;
        let match;

        while ((match = regexPartes.exec(valor)) !== null) {
            acrescentarSpan(fragmento, valor.slice(posicao, match.index), "infoValorOrigem");
            acrescentarSpan(
                fragmento,
                match[0],
                match[0].startsWith("K") ? "infoContinente" : "infoCoordenadas",
            );
            posicao = match.index + match[0].length;
        }

        acrescentarSpan(fragmento, valor.slice(posicao), "infoValorOrigem");
    }

    function acrescentarSpan(fragmento, texto, tipo, comando) {
        if (!texto) return;

        const span = document.createElement("span");
        const estilo = obterEstiloRealce(tipo, comando);

        span.textContent = texto;
        span.dataset.raTpHighlight = tipo;
        span.style.setProperty("color", estilo.cor, "important");
        span.style.setProperty("font-weight", estilo.peso);
        span.style.setProperty("text-shadow", estilo.sombra, "important");

        fragmento.appendChild(span);
    }

    function obterTagsParaRealce() {
        return COMANDOS
            .flatMap((comando) => obterTagsComAliases(comando).map((tag) => ({ tag, comando })))
            .filter((item) => item.tag)
            .sort((a, b) => b.tag.length - a.tag.length);
    }

    function obterEstiloRealce(tipo, comando) {
        const sombraForte = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000";
        const sombraLeve = "0 1px 0 #000, 0 0 2px #000";

        if (tipo === "tag" && comando) {
            return {
                cor: obterCorTextoRealce(comando.corBotao),
                peso: "800",
                sombra: sombraForte,
            };
        }

        const infoLabel = { cor: "#ffe66d", peso: "800", sombra: sombraForte };
        const estilos = {
            infoLabelAtacante: infoLabel,
            infoValorAtacante: infoLabel,
            infoLabelOrigem: infoLabel,
            infoValorOrigem: infoLabel,
            infoCoordenadas: infoLabel,
            infoContinente: infoLabel,
            base: { cor: "#ffffff", peso: "700", sombra: sombraLeve },
        };

        return estilos[tipo] || estilos.base;
    }

    function obterCorTextoRealce(nomeCor) {
        const coresTexto = {
            red: "#ff4a4a",
            green: "#65ff65",
            blue: "#4db8ff",
            yellow: "#ffe66d",
            orange: "#ffb347",
            lblue: "#5ffff7",
            lime: "#eaff4d",
            white: "#ffffff",
            black: "#111111",
            gray: "#dce4f2",
            dorange: "#d47cff",
            dark: "#ffffff",
            pink: "#ff8ed8",
            brown: "#d98585",
            dblue: "#8fa8ff",
            dgreen: "#62e66b",
            lgreen: "#b9ff9f",
        };

        return coresTexto[String(nomeCor || "").toLowerCase()] || "#ffffff";
    }

    function realcarInformacoesLinha(linha) {
        if (!CONFIG.realcarInformacoesTabela) return;
        if (!linha.closest("#incomings_table")) return;

        const mapa = obterMapaCabecalhos(linha);
        const fallback = {
            destino: 1,
            origem: 2,
            jogador: 3,
            distancia: 4,
            chegada: 5,
            chegaEm: 6,
        };

        aplicarRealceCelulaInfo(linha.children[obterIndiceColuna(mapa, fallback, "destino")], "destino");
        aplicarRealceCelulaInfo(linha.children[obterIndiceColuna(mapa, fallback, "origem")], "origem");
        aplicarRealceCelulaInfo(linha.children[obterIndiceColuna(mapa, fallback, "jogador")], "jogador");
        aplicarRealceCelulaInfo(linha.children[obterIndiceColuna(mapa, fallback, "distancia")], "distancia");
        aplicarRealceCelulaInfo(linha.children[obterIndiceColuna(mapa, fallback, "chegada")], "chegada");

        const celulaTempo = linha.children[obterIndiceColuna(mapa, fallback, "chegaEm")];
        aplicarRealceCelulaInfo(celulaTempo, obterTipoTempoRestante(celulaTempo));
    }

    function obterMapaCabecalhos(linha) {
        const tabela = linha.closest("table");
        if (!tabela) return {};
        if (mapasCabecalhoTabela.has(tabela)) return mapasCabecalhoTabela.get(tabela);

        const mapa = {};
        const linhaCabecalho = [...tabela.querySelectorAll("tr")].find((tr) => {
            const texto = normalizarSemAcentos(tr.textContent);
            return texto.includes("destino")
                && texto.includes("origem")
                && texto.includes("jogador")
                && texto.includes("chegada");
        });

        if (linhaCabecalho) {
            [...linhaCabecalho.children].forEach((celula, index) => {
                const texto = normalizarSemAcentos(celula.textContent);

                if (texto.includes("destino")) mapa.destino = index;
                else if (texto.includes("origem")) mapa.origem = index;
                else if (texto.includes("jogador")) mapa.jogador = index;
                else if (texto.includes("distancia")) mapa.distancia = index;
                else if (texto.includes("chega em")) mapa.chegaEm = index;
                else if (texto.includes("chegada")) mapa.chegada = index;
            });
        }

        mapasCabecalhoTabela.set(tabela, mapa);
        return mapa;
    }

    function obterIndiceColuna(mapa, fallback, tipo) {
        return Number.isInteger(mapa[tipo]) ? mapa[tipo] : fallback[tipo];
    }

    function aplicarRealceCelulaInfo(celula, tipo) {
        if (!celula) return;

        const estilo = obterEstiloInfoTabela(tipo);
        celula.dataset.raTpInfoRealce = tipo;
        celula.style.setProperty("color", estilo.cor, "important");
        celula.style.setProperty("font-weight", estilo.peso);
        celula.style.setProperty("text-shadow", estilo.sombra, "important");

        celula.querySelectorAll("a, span").forEach((elemento) => {
            if (deveIgnorarRealceInfo(elemento)) return;

            elemento.style.setProperty("color", estilo.cor, "important");
            elemento.style.setProperty("font-weight", estilo.peso);
            elemento.style.setProperty("text-shadow", estilo.sombra, "important");
        });
    }

    function deveIgnorarRealceInfo(elemento) {
        return Boolean(elemento.closest(".ra-tp-botoes, button, input, select, textarea"));
    }

    function obterTipoTempoRestante(celula) {
        const segundos = obterSegundosDeTempo(celula?.textContent || "");
        if (segundos === null) return "chegaEm";
        if (segundos <= 5 * 60) return "tempoCritico";
        if (segundos <= 15 * 60) return "tempoAviso";

        return "tempoOk";
    }

    function obterSegundosDeTempo(texto) {
        const match = String(texto || "").match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
        if (!match) return null;

        return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]);
    }

    function obterEstiloInfoTabela(tipo) {
        const sombra = "0 1px 0 rgba(255, 255, 255, 0.75), 0 0 1px rgba(0, 0, 0, 0.35)";
        const infoPadrao = { cor: "#6b3500", peso: "800", sombra };
        const estilos = {
            destino: infoPadrao,
            origem: infoPadrao,
            jogador: infoPadrao,
            distancia: infoPadrao,
            chegada: infoPadrao,
            chegaEm: infoPadrao,
            tempoOk: infoPadrao,
            tempoAviso: { cor: "#a45200", peso: "900", sombra },
            tempoCritico: { cor: "#b00020", peso: "900", sombra },
        };

        return estilos[tipo] || estilos.chegaEm;
    }

    function aplicarCorAtaque(linha) {
        limparPintura(linha);

        if (CONFIG.paginaDeAtaques === "nada") return;

        if (isApoio(linha)) {
            pintarLinha(linha, obterCor("yellow", "yellow").bottom);
            return;
        }

        const nome = obterNomeLinha(linha);
        const comandosEncontrados = COMANDOS.filter((comando) => comandoExisteNoNome(nome, comando));

        if (comandosEncontrados.length >= 2) {
            const cor1 = obterCor(comandosEncontrados[0].corBotao, "red").top;
            const cor2 = obterCor(comandosEncontrados[1].corBotao, "red").top;
            pintarLinha(
                linha,
                `repeating-linear-gradient(45deg, ${cor1}, ${cor1} 10px, ${cor2} 10px, ${cor2} 20px)`,
            );
            return;
        }

        if (comandosEncontrados.length === 1) {
            pintarLinha(linha, obterCor(comandosEncontrados[0].corBotao, "red").top);
            return;
        }

        pintarLinha(linha, obterCor("red", "red").bottom);
    }

    function pintarLinha(linha, background) {
        const colunaNome = linha.querySelector(SELETORES.etiquetaNome)?.closest("td");
        if (!colunaNome) return;

        if (CONFIG.paginaDeAtaques === "linha") {
            linha.querySelectorAll("td").forEach((td) => aplicarFundo(td, background));
            linha.querySelectorAll("a, .quickedit-label").forEach(aplicarTextoAtaque);
            return;
        }

        if (CONFIG.paginaDeAtaques === "coluna") {
            aplicarFundo(colunaNome, background);
            colunaNome.querySelectorAll("a, .quickedit-label").forEach(aplicarTextoAtaque);
        }
    }

    function aplicarFundo(elemento, background) {
        elemento.dataset.raTpFundo = "1";
        elemento.style.setProperty("background", background, "important");
    }

    function aplicarTextoAtaque(elemento) {
        elemento.dataset.raTpTexto = "1";
        elemento.style.setProperty("color", "white", "important");
        elemento.style.setProperty(
            "text-shadow",
            "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
            "important",
        );
    }

    function limparPintura(linha) {
        linha.querySelectorAll("[data-ra-tp-fundo='1']").forEach((elemento) => {
            elemento.style.removeProperty("background");
            delete elemento.dataset.raTpFundo;
        });

        linha.querySelectorAll("[data-ra-tp-texto='1']").forEach((elemento) => {
            elemento.style.removeProperty("color");
            elemento.style.removeProperty("text-shadow");
            delete elemento.dataset.raTpTexto;
        });
    }

    function removerBotoes(linha) {
        linha.querySelectorAll(".ra-tp-botoes").forEach((elemento) => elemento.remove());
    }

    function obterNomeLinha(linha) {
        return normalizarEspacos(linha.querySelector(SELETORES.etiquetaNome)?.textContent || "");
    }

    function comandoExisteNoNome(nome, comando) {
        return obterTagsComAliases(comando).some((tag) => nome.includes(tag));
    }

    function removerTags(nome, filtroComando) {
        let resultado = normalizarEspacos(nome);

        COMANDOS.filter(filtroComando).forEach((comando) => {
            obterTagsComAliases(comando).forEach((tag) => {
                resultado = resultado.replace(new RegExp(escapeRegExp(tag), "g"), "");
            });
        });

        return normalizarEspacos(resultado);
    }

    function obterTagsComAliases(comando) {
        return [comando.tag, ...(comando.aliases || [])].filter(Boolean);
    }

    function isApoio(linha) {
        return [...linha.querySelectorAll("img")].some((img) => {
            const texto = `${img.src || ""} ${img.alt || ""} ${img.title || ""}`.toLowerCase();
            return texto.includes("support");
        });
    }

    function obterCor(nome, fallback) {
        return CORES[String(nome || "").toLowerCase()] || CORES[fallback] || CORES.white;
    }

    function normalizarEspacos(valor) {
        return String(valor || "").replace(/\s+/g, " ").trim();
    }

    function normalizarSemAcentos(valor) {
        return normalizarEspacos(valor)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
    }

    function escapeRegExp(valor) {
        return String(valor).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function esperarPor(obterValor, timeoutMs, intervaloMs) {
        const inicio = Date.now();

        return new Promise((resolve) => {
            const tick = () => {
                const valor = obterValor();
                if (valor) {
                    resolve(valor);
                    return;
                }

                if (Date.now() - inicio >= timeoutMs) {
                    resolve(null);
                    return;
                }

                setTimeout(tick, intervaloMs);
            };

            tick();
        });
    }

    function aplicarEstilos() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .ra-tp-botoes {
                float: right;
                display: inline-flex;
                flex-wrap: wrap;
                gap: 1px;
                align-items: center;
                justify-content: flex-end;
                margin-left: 4px;
                max-width: 100%;
                vertical-align: middle;
            }

            .ra-tp-botao {
                min-width: 16px;
                height: 17px;
                padding: 0 3px !important;
                border: 1px solid rgba(0, 0, 0, 0.35) !important;
                line-height: 1 !important;
                font-weight: 700;
                text-align: center;
                cursor: pointer;
                box-sizing: border-box;
            }

            .ra-tp-reset {
                margin-left: 3px !important;
            }
        `;

        document.head.appendChild(style);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }
})();
