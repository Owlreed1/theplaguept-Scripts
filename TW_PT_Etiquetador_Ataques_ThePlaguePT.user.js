// ==UserScript==
// @name         TW_PT_Etiquetador_Ataques_ThePlaguePT
// @version      1.0.0
// @description  Detecta, renomeia e etiqueta automaticamente ataques de entrada no Tribal Wars.
// @author       ThePlaguePT, baseado no script original de FunnyPocketBook
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// @match        https://*/game.php*
// @homepageURL  https://github.com/ThePlaguePT/TribalWars-Scripts
// @supportURL   https://github.com/ThePlaguePT/TribalWars-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW_PT_Etiquetador_Ataques_ThePlaguePT.user.js
// @downloadURL  https://raw.githubusercontent.com/ThePlaguePT/TribalWars-Scripts/main/TW_PT_Etiquetador_Ataques_ThePlaguePT.user.js
// @grant        none
// @run-at       document-idle
// @namespace    https://greasyfork.org/users/theplaguept
// ==/UserScript==

(() => {
    "use strict";

    const STORAGE_KEY = "tag_incomings_pt_melhorado_config_v1";
    const STATE_KEY = "tag_incomings_pt_melhorado_state_v1";

    const CONFIG_PADRAO = {
        ativo: true,
        modoTeste: false,
        mostrarPainel: true,
        painelAberto: false,
        mostrarResumo: true,
        recarregarAoTerminar: false,
        destacarLinhas: true,
        etiquetas: {
            ataque: "ataque",
            apoio: "apoio",
            nobre: "nobre",
        },
        etiquetasNativasIgnorar: ["morto"],
        formatoContagem: "{nome} [{grupo} {pos}/{total}]",
        atrasoIncomingsMinMs: 1_000,
        atrasoIncomingsMaxMs: 3_000,
        atrasoGlobalMinMs: 60_000,
        atrasoGlobalMaxMs: 180_000,
        intervaloEdicaoMinMs: 800,
        intervaloEdicaoMaxMs: 2_000,
        pausaLoteQuantidade: 8,
        pausaLoteMinMs: 60_000,
        pausaLoteMaxMs: 180_000,
        timeoutConfirmacaoMs: 8_000,
        verificacaoEtiquetaMinMs: 5_000,
        verificacaoEtiquetaMaxMs: 9_000,
    };

    const SELETORES = {
        tabela: "#incomings_table",
        linha: "#incomings_table > tbody > tr",
        nome: "td:nth-child(1) .quickedit-label",
        aldeiaAtacante: "td:nth-child(3) a",
        botaoEditar: "td:nth-child(1) a.rename-icon",
        inputNome: 'td:nth-child(1) .quickedit-edit input[type="text"]',
        botaoGuardar: 'td:nth-child(1) .quickedit-edit input.btn, td:nth-child(1) .quickedit-edit input[type="button"], td:nth-child(1) .quickedit-edit input[type="submit"]',
        checkboxComando: 'td:nth-child(1) input[type="checkbox"][name^="id_"], td:nth-child(1) input[type="checkbox"][name="id[]"], td:nth-child(1) input[type="checkbox"]',
        botaoEtiquetar: '[name="label"], input[value="Etiqueta"], input[value="Etiquetar"], button[value="Etiqueta"], button[value="Etiquetar"]',
        contadorIncomings: "#incomings_amount, #incoming_amount, #attack_counter, .incomings_amount, .incoming_amount",
        linkIncomings: 'a[href*="mode=incomings"], a[href*="screen=overview_villages"][href*="incomings"]',
    };

    const FRAME_FUNDO_ID = "tag-incomings-pt-frame-fundo";

    const CORES_GRUPO = [
        "#e6194b",
        "#3cb44b",
        "#4363d8",
        "#f58231",
        "#911eb4",
        "#008080",
        "#f032e6",
        "#808000",
        "#9a6324",
        "#000075",
        "#800000",
        "#469990",
        "#dcbeff",
        "#aaffc3",
        "#ffd8b1",
        "#fffac8",
    ];

    const UNIDADES = [
        {
            id: "snob",
            etiqueta: "nobre",
            velocidadePadrao: 35,
            termos: ["snob", "nobre", "nobres", "noble"],
        },
        {
            id: "catapult",
            etiqueta: "Catapulta",
            velocidadePadrao: 30,
            termos: ["catapult", "catapulta", "catapultas"],
        },
        {
            id: "ram",
            etiqueta: "Ariete",
            velocidadePadrao: 30,
            termos: ["ram", "ariete", "arietes"],
        },
        {
            id: "sword",
            etiqueta: "Espada",
            velocidadePadrao: 22,
            termos: ["sword", "espada", "espadachim"],
        },
        {
            id: "spear",
            etiqueta: "Lanceiro",
            velocidadePadrao: 18,
            termos: ["spear", "lance", "lanceiro", "lanceiros"],
        },
        {
            id: "archer",
            etiqueta: "Arqueiro",
            velocidadePadrao: 18,
            termos: ["archer", "arqueiro", "arqueiros"],
        },
        {
            id: "axe",
            etiqueta: "Machado",
            velocidadePadrao: 18,
            termos: ["axe", "machado", "machados"],
        },
        {
            id: "heavy",
            etiqueta: "Cavalaria pesada",
            velocidadePadrao: 11,
            termos: ["heavy", "cavalaria pesada", "pesada"],
        },
        {
            id: "marcher",
            etiqueta: "Arqueiro a cavalo",
            velocidadePadrao: 10,
            termos: ["marcher", "mounted_archer", "arqueiro a cavalo"],
        },
        {
            id: "light",
            etiqueta: "Cavalaria leve",
            velocidadePadrao: 10,
            termos: ["light", "cavalaria leve", "leve"],
        },
        {
            id: "knight",
            etiqueta: "Paladino",
            velocidadePadrao: 10,
            termos: ["knight", "paladin", "paladino"],
        },
        {
            id: "spy",
            etiqueta: "Batedor",
            velocidadePadrao: 9,
            termos: ["spy", "scout", "batedor", "explorador"],
        },
    ];

    let config = carregarConfig();
    let estado = carregarEstado();
    let execucaoEmCurso = false;
    let verificacaoAgendada = false;

    const esperar = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    function carregarConfig() {
        try {
            const guardado = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            const carregado = juntarConfig(CONFIG_PADRAO, guardado);
            if (carregado.formatoContagem === "{nome} {total}") {
                carregado.formatoContagem = CONFIG_PADRAO.formatoContagem;
            }

            if (carregado.intervaloEdicaoMinMs === 4_000 && carregado.intervaloEdicaoMaxMs === 12_000) {
                carregado.intervaloEdicaoMinMs = CONFIG_PADRAO.intervaloEdicaoMinMs;
                carregado.intervaloEdicaoMaxMs = CONFIG_PADRAO.intervaloEdicaoMaxMs;
            }

            carregado.recarregarAoTerminar = false;

            return carregado;
        } catch (erro) {
            log("Nao foi possivel carregar configuracao guardada.", erro);
            return juntarConfig(CONFIG_PADRAO, {});
        }
    }

    function guardarConfig() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }

    function carregarEstado() {
        try {
            const guardado = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
            return {
                ultimoTotalIncomings: Number(guardado.ultimoTotalIncomings) || 0,
                ultimaAssinatura: String(guardado.ultimaAssinatura || ""),
            };
        } catch {
            return {
                ultimoTotalIncomings: 0,
                ultimaAssinatura: "",
            };
        }
    }

    function guardarEstado() {
        localStorage.setItem(STATE_KEY, JSON.stringify(estado));
    }

    function sincronizarEstado() {
        estado = carregarEstado();
    }

    function juntarConfig(base, extra) {
        const resultado = { ...base };

        for (const [chave, valor] of Object.entries(extra || {})) {
            if (
                valor
                && typeof valor === "object"
                && !Array.isArray(valor)
                && base[chave]
                && typeof base[chave] === "object"
                && !Array.isArray(base[chave])
            ) {
                resultado[chave] = juntarConfig(base[chave], valor);
            } else if (valor !== undefined) {
                resultado[chave] = valor;
            }
        }

        return resultado;
    }

    function normalizar(texto) {
        return String(texto ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function randomEntre(minimo, maximo) {
        const min = Number(minimo) || 0;
        const max = Math.max(Number(maximo) || min, min);
        return Math.floor(min + Math.random() * (max - min + 1));
    }

    function randomGlobal() {
        return randomEntre(config.atrasoGlobalMinMs, config.atrasoGlobalMaxMs);
    }

    function randomPaginaIncomings() {
        return randomEntre(config.atrasoIncomingsMinMs, config.atrasoIncomingsMaxMs);
    }

    function randomEdicao() {
        return randomEntre(config.intervaloEdicaoMinMs, config.intervaloEdicaoMaxMs);
    }

    function randomPausaLote() {
        return randomEntre(config.pausaLoteMinMs, config.pausaLoteMaxMs);
    }

    function formatarTempo(ms) {
        const segundos = Math.round(ms / 1000);
        if (segundos < 60) {
            return `${segundos}s`;
        }

        const minutos = Math.floor(segundos / 60);
        const resto = segundos % 60;
        return resto ? `${minutos}m ${resto}s` : `${minutos}m`;
    }

    function log(...args) {
        console.info("[Etiquetador de Ataques]", ...args);
    }

    function estaEmFrame() {
        return window.self !== window.top;
    }

    function obterEtiquetasNormalizadas() {
        return Object.fromEntries(
            Object.entries(config.etiquetas).map(([chave, valor]) => [chave, normalizar(valor)]),
        );
    }

    function paginaDeIncomings() {
        return /[?&]mode=incomings(?:&|$)/.test(window.location.search)
            || Boolean(document.querySelector(SELETORES.tabela));
    }

    function obterLinhasValidas() {
        return [...document.querySelectorAll(SELETORES.linha)].filter((linha) => (
            linha.querySelector(SELETORES.nome)
            && linha.querySelector(SELETORES.aldeiaAtacante)
        ));
    }

    function obterIdComando(linha) {
        const checkbox = linha.querySelector(SELETORES.checkboxComando);
        return checkbox?.value || checkbox?.name || "";
    }

    function assinaturaIncomings(linhas = obterLinhasValidas()) {
        return linhas.map((linha) => [
            obterIdComando(linha),
            obterNome(linha),
            obterAldeiaAtacante(linha),
            linha.children[3]?.textContent?.trim() || "",
            linha.children[4]?.textContent?.trim() || "",
        ].join("|")).join("||");
    }

    function atualizarEstadoIncomings(linhas = obterLinhasValidas()) {
        estado.ultimoTotalIncomings = linhas.length;
        estado.ultimaAssinatura = assinaturaIncomings(linhas);
        guardarEstado();
    }

    function atualizarEstadoSemIncomings() {
        if (estado.ultimoTotalIncomings === 0 && !estado.ultimaAssinatura) {
            return;
        }

        estado.ultimoTotalIncomings = 0;
        estado.ultimaAssinatura = "";
        guardarEstado();
    }

    function obterNome(linha) {
        return linha.querySelector(SELETORES.nome)?.textContent?.trim() ?? "";
    }

    function obterCelulaComando(linha) {
        return linha.querySelector("td:nth-child(1)") || linha;
    }

    function obterTextoTecnicoDaLinha(linha) {
        const celula = obterCelulaComando(linha);
        const partes = [celula.textContent, celula.innerHTML];

        celula.querySelectorAll("img, span, a, div, td, th").forEach((elemento) => {
            if (typeof elemento.getAttributeNames === "function") {
                elemento.getAttributeNames().forEach((nomeAtributo) => {
                    partes.push(elemento.getAttribute(nomeAtributo));
                });
            }
        });

        return normalizar(partes.filter(Boolean).join(" "));
    }

    function obterAtributosTooltip(linha) {
        const atributos = [];
        obterCelulaComando(linha).querySelectorAll("*").forEach((elemento) => {
            ["title", "data-title", "data-tooltip", "data-content", "aria-label"].forEach((nome) => {
                const valor = elemento.getAttribute(nome);
                if (valor) {
                    atributos.push(valor);
                }
            });
        });

        return atributos;
    }

    function unidadePorTextoDeIcone(texto) {
        const alvo = normalizar(texto);
        return UNIDADES.find((unidade) => unidade.termos.some((termo) => {
            const termoNormalizado = normalizar(termo);
            return alvo.includes(`unit_sprite_${termoNormalizado}`)
                || alvo.includes(`unit-sprite-${termoNormalizado}`)
                || alvo.includes(`unit_${termoNormalizado}`)
                || alvo.includes(`unit-${termoNormalizado}`)
                || alvo.includes(`sprite_${termoNormalizado}`)
                || alvo.includes(`sprite-${termoNormalizado}`)
                || alvo.includes(`/unit/${termoNormalizado}`)
                || alvo.includes(`/units/${termoNormalizado}`)
                || alvo.includes(`/${termoNormalizado}.png`)
                || alvo.includes(`${termoNormalizado}.png`);
        })) || null;
    }

    function parseQuantidade(texto) {
        const limpo = String(texto ?? "").replace(/\./g, "").replace(/\s+/g, " ").trim();
        const resultado = limpo.match(/-?\d+/);
        return resultado ? Math.max(0, Number(resultado[0])) : 0;
    }

    function juntarUnidade(contagem, unidadeId, quantidade) {
        if (!unidadeId || quantidade <= 0) {
            return;
        }

        contagem.set(unidadeId, (contagem.get(unidadeId) || 0) + quantidade);
    }

    function obterCelulaPorIndice(linha, indice) {
        if (!linha?.children) {
            return null;
        }

        return [...linha.children].filter((filho) => /^(TD|TH)$/i.test(filho.tagName))[indice] || null;
    }

    function quantidadeDaImagemNoTooltip(imagem) {
        const celula = imagem.closest("td,th");
        const linha = imagem.closest("tr");
        if (!celula || !linha) {
            return 0;
        }

        const indice = [...linha.children].filter((filho) => /^(TD|TH)$/i.test(filho.tagName)).indexOf(celula);
        const candidatos = [
            celula.textContent,
            obterCelulaPorIndice(linha.nextElementSibling || {}, indice)?.textContent,
            obterCelulaPorIndice(linha.previousElementSibling || {}, indice)?.textContent,
        ];

        for (const candidato of candidatos) {
            const quantidade = parseQuantidade(candidato);
            if (quantidade > 0) {
                return quantidade;
            }
        }

        return 0;
    }

    function textoTecnicoDoElemento(elemento) {
        const partes = [
            elemento.tagName,
            elemento.id,
            elemento.getAttribute("class"),
            elemento.getAttribute("style"),
        ];

        if (typeof elemento.getAttributeNames === "function") {
            elemento.getAttributeNames().forEach((nomeAtributo) => {
                partes.push(elemento.getAttribute(nomeAtributo));
            });
        }

        try {
            partes.push(window.getComputedStyle(elemento).backgroundImage);
        } catch {
            // Estilos podem falhar em elementos removidos durante edicoes rapidas.
        }

        return partes.filter(Boolean).join(" ");
    }

    function extrairUnidadesDeHtml(html) {
        const contagem = new Map();
        if (!html || !/<img|unit_|sprite/i.test(html)) {
            return contagem;
        }

        const doc = new DOMParser().parseFromString(String(html), "text/html");
        doc.querySelectorAll("img, span, i, b, em, a, div").forEach((elemento) => {
            const unidade = unidadePorTextoDeIcone(textoTecnicoDoElemento(elemento));
            if (!unidade) {
                return;
            }

            let quantidade = quantidadeDaImagemNoTooltip(elemento);
            if (quantidade <= 0) {
                quantidade = 1;
            }

            juntarUnidade(contagem, unidade.id, quantidade);
        });

        return contagem;
    }

    function extrairUnidadesDaLinha(linha) {
        const contagem = new Map();
        const celula = obterCelulaComando(linha);

        obterAtributosTooltip(linha).forEach((html) => {
            extrairUnidadesDeHtml(html).forEach((quantidade, unidadeId) => {
                juntarUnidade(contagem, unidadeId, quantidade);
            });
        });

        celula.querySelectorAll("img, span, i, b, em, a, div").forEach((elemento) => {
            const unidade = unidadePorTextoDeIcone(textoTecnicoDoElemento(elemento));
            if (!unidade) {
                return;
            }

            const quantidade = quantidadeDaImagemNoTooltip(elemento) || 1;
            if (quantidade > 0) {
                juntarUnidade(contagem, unidade.id, quantidade);
            }
        });

        return contagem;
    }

    function obterVelocidadeMundo(unidade) {
        const fontes = [
            window.unitConfig,
            window.unit_info,
            window.unitInfo,
            window.UnitConfig,
            window.UnitSettings,
            window.Config?.units,
            window.game_data?.unit_info,
            window.game_data?.unitInfo,
            window.game_data?.unitConfig,
            window.game_data?.units_info,
            window.game_data?.units,
        ];

        for (const fonte of fontes) {
            if (!fonte) {
                continue;
            }

            const entrada = fonte[unidade.id] || fonte[unidade.id.toLowerCase()];
            if (typeof entrada === "number") {
                return entrada;
            }

            if (entrada && typeof entrada === "object") {
                const valor = entrada.speed ?? entrada.Speed ?? entrada.walk_time ?? entrada.walkTime ?? entrada.minutes_per_field ?? entrada.minutesPerField;
                if (Number.isFinite(Number(valor))) {
                    return Number(valor);
                }
            }
        }

        return unidade.velocidadePadrao;
    }

    function detectarUnidadeMaisLenta(linha) {
        const contagem = extrairUnidadesDaLinha(linha);
        let escolhida = null;
        let velocidadeEscolhida = -Infinity;

        contagem.forEach((quantidade, unidadeId) => {
            if (quantidade <= 0) {
                return;
            }

            const unidade = UNIDADES.find((item) => item.id === unidadeId);
            if (!unidade) {
                return;
            }

            const velocidade = obterVelocidadeMundo(unidade);
            if (velocidade > velocidadeEscolhida) {
                escolhida = unidade;
                velocidadeEscolhida = velocidade;
            }
        });

        if (!escolhida) {
            log("Unidade lenta nao detectada para:", obterNome(linha), obterTextoTecnicoDaLinha(linha).slice(0, 220));
        }

        return escolhida;
    }

    function detectarTipoComando(linha) {
        const alvo = obterTextoTecnicoDaLinha(linha);
        if (alvo.includes("command/support") || alvo.includes("support") || alvo.includes("apoio")) {
            return "apoio";
        }

        return "ataque";
    }

    function obterEtiquetaBaseDaLinha(linha) {
        const unidade = detectarUnidadeMaisLenta(linha);
        if (unidade) {
            if (unidade.id === "snob") {
                return config.etiquetas.nobre;
            }

            return unidade.etiqueta;
        }

        return detectarTipoComando(linha) === "apoio" ? config.etiquetas.apoio : "";
    }

    function obterLinkAldeiaAtacante(linha) {
        return linha.querySelector(SELETORES.aldeiaAtacante);
    }

    function obterAldeiaAtacante(linha) {
        return obterLinkAldeiaAtacante(linha)?.textContent?.trim() ?? "";
    }

    function obterChaveAldeiaAtacante(linha) {
        const link = obterLinkAldeiaAtacante(linha);
        const texto = link?.textContent?.trim() ?? "";
        const coordenadas = texto.match(/\b\d{3}\|\d{3}\b/)?.[0];

        if (link?.href) {
            try {
                const url = new URL(link.href, window.location.href);
                const id = url.searchParams.get("id");
                if (id) {
                    return `id:${id}`;
                }
            } catch {
                // Ignora hrefs estranhos e usa o texto como fallback.
            }
        }

        if (coordenadas) {
            return `coord:${coordenadas}`;
        }

        return `nome:${normalizar(texto)}`;
    }

    function temIconeDeNobre(linha) {
        if (detectarUnidadeMaisLenta(linha)?.id === "snob") {
            return true;
        }

        return [...linha.querySelectorAll("td:nth-child(1) img")].some((imagem) => {
            const alvo = normalizar([
                imagem.getAttribute("src"),
                imagem.getAttribute("alt"),
                imagem.getAttribute("title"),
                imagem.className,
            ].join(" "));

            return alvo.includes("snob") || alvo.includes("nobre");
        });
    }

    function criarEtiquetaGrupo(indice) {
        let numero = indice;
        let etiqueta = "";

        while (numero > 0) {
            numero -= 1;
            etiqueta = String.fromCharCode(65 + (numero % 26)) + etiqueta;
            numero = Math.floor(numero / 26);
        }

        return etiqueta || "A";
    }

    function obterCorGrupo(indice) {
        return CORES_GRUPO[(indice - 1) % CORES_GRUPO.length];
    }

    function criarGruposPorAldeia(linhas) {
        const gruposBrutos = new Map();

        for (const linha of linhas) {
            const chave = obterChaveAldeiaAtacante(linha);
            if (!chave || chave === "nome:") {
                continue;
            }

            if (!gruposBrutos.has(chave)) {
                gruposBrutos.set(chave, {
                    chave,
                    aldeia: obterAldeiaAtacante(linha),
                    linhas: [],
                });
            }

            gruposBrutos.get(chave).linhas.push(linha);
        }

        const porLinha = new Map();
        const grupos = [];
        let indice = 0;

        for (const grupo of gruposBrutos.values()) {
            if (grupo.linhas.length < 2) {
                continue;
            }

            indice += 1;
            grupo.indice = indice;
            grupo.etiqueta = criarEtiquetaGrupo(indice);
            grupo.cor = obterCorGrupo(indice);
            grupo.total = grupo.linhas.length;
            grupos.push(grupo);

            grupo.linhas.forEach((linha, posicaoZero) => {
                porLinha.set(linha, {
                    grupo,
                    posicao: posicaoZero + 1,
                });
            });
        }

        return { grupos, porLinha };
    }

    function selecionarParaEtiquetar(linha) {
        const checkbox = linha.querySelector(SELETORES.checkboxComando);
        if (!checkbox || checkbox.disabled) {
            return false;
        }

        if (checkbox.checked) {
            destacarLinha(linha, "etiqueta");
            return true;
        }

        if (config.modoTeste) {
            destacarLinha(linha, "teste");
            log("[teste] Selecionaria para etiquetar:", obterNome(linha));
            return true;
        }

        checkbox.click();
        destacarLinha(linha, "etiqueta");
        return true;
    }

    function desmarcarParaNaoEtiquetar(linha) {
        const checkbox = linha.querySelector(SELETORES.checkboxComando);
        if (!checkbox || checkbox.disabled || !checkbox.checked) {
            return;
        }

        if (!config.modoTeste) {
            checkbox.click();
        }
    }

    function elementoDepoisDoNome(elemento, nomeEl) {
        return Boolean(
            nomeEl
            && elemento.compareDocumentPosition(nomeEl) & Node.DOCUMENT_POSITION_PRECEDING,
        );
    }

    function pareceBadgeEtiqueta(elemento, nomeEl) {
        if (!elementoDepoisDoNome(elemento, nomeEl)) {
            return false;
        }

        if (
            elemento.closest(".quickedit-edit")
            || elemento.closest(".quickedit-label")
            || elemento.closest(".rename-icon")
            || elemento.matches("input, button, img")
        ) {
            return false;
        }

        const texto = elemento.textContent?.trim() || "";
        if (!texto || texto.length > 4) {
            return false;
        }

        const estilo = window.getComputedStyle(elemento);
        const fundo = estilo.backgroundColor || "";
        const classe = elemento.className ? String(elemento.className) : "";

        return (
            /rgb|#|hsl/i.test(fundo)
            && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)|transparent/i.test(fundo)
        )
            || /label|tag|badge|marker|command/i.test(classe);
    }

    function linhaTemEtiquetaVisual(linha) {
        const celula = obterCelulaComando(linha);
        const nomeEl = celula.querySelector(SELETORES.nome);
        if (!nomeEl) {
            return false;
        }

        return [...celula.querySelectorAll("span, a, b, em, strong, div")]
            .some((elemento) => pareceBadgeEtiqueta(elemento, nomeEl));
    }

    function linhaJaEstaEtiquetada(linha) {
        const nome = obterNome(linha);
        return temEtiquetaNativa(nome) || temEtiquetaAutomaticaTw(nome);
    }

    function temEtiquetaAutomaticaTw(nome) {
        const alvo = normalizar(nome);
        return /\|\s*(player|jogador)\b/.test(alvo) && /\|\s*(origin|origem)\b/.test(alvo);
    }

    function nomePermiteEtiqueta(linha, etiquetas) {
        if (linhaJaEstaEtiquetada(linha)) {
            return false;
        }

        const nome = obterNome(linha);
        const nomeNormalizado = normalizar(nome);
        return contemEtiqueta(nomeNormalizado, etiquetas.ataque)
            || contemEtiqueta(nomeNormalizado, etiquetas.apoio)
            || contemEtiqueta(nomeNormalizado, etiquetas.nobre)
            || UNIDADES.some((unidade) => contemEtiqueta(nomeNormalizado, normalizar(unidade.etiqueta)));
    }

    function selecionarLinhasParaEtiquetar(linhas, etiquetas) {
        let selecionados = 0;

        for (const linha of linhas) {
            if (!nomePermiteEtiqueta(linha, etiquetas)) {
                desmarcarParaNaoEtiquetar(linha);
                continue;
            }

            if (selecionarParaEtiquetar(linha)) {
                selecionados += 1;
            }
        }

        return selecionados;
    }

    async function esperarPor(condicao, timeoutMs, intervaloMs = 150) {
        const inicio = Date.now();

        while (Date.now() - inicio < timeoutMs) {
            if (condicao()) {
                return true;
            }

            await esperar(intervaloMs);
        }

        return false;
    }

    async function esperarTabelaIncomings() {
        await esperarPor(
            () => document.querySelector(SELETORES.tabela) && obterLinhasValidas().length > 0,
            10_000,
            250,
        );
    }

    async function renomearComando(linha, novoNome, tipo) {
        const nomeAtual = obterNome(linha);
        if (!novoNome || nomeAtual === novoNome) {
            return false;
        }

        if (config.modoTeste) {
            destacarLinha(linha, "teste");
            log(`[teste] Renomearia "${nomeAtual}" para "${novoNome}".`);
            return true;
        }

        const botaoEditar = linha.querySelector(SELETORES.botaoEditar);
        if (!botaoEditar) {
            destacarLinha(linha, "erro");
            log("Botao de editar nao encontrado:", nomeAtual);
            return false;
        }

        botaoEditar.click();

        const inputDisponivel = await esperarPor(
            () => linha.querySelector(SELETORES.inputNome) && linha.querySelector(SELETORES.botaoGuardar),
            2_000,
        );
        if (!inputDisponivel) {
            destacarLinha(linha, "erro");
            log("Editor nao abriu:", nomeAtual);
            return false;
        }

        const inputNome = linha.querySelector(SELETORES.inputNome);
        const botaoGuardar = linha.querySelector(SELETORES.botaoGuardar);
        inputNome.value = novoNome;
        inputNome.dispatchEvent(new Event("input", { bubbles: true }));
        inputNome.dispatchEvent(new Event("change", { bubbles: true }));
        botaoGuardar.click();

        const confirmado = await esperarPor(
            () => normalizar(obterNome(linha)) === normalizar(novoNome),
            config.timeoutConfirmacaoMs,
        );

        destacarLinha(linha, confirmado ? tipo : "erro");
        if (!confirmado) {
            log("Rename enviado, mas sem confirmacao visual:", nomeAtual, "->", novoNome);
        }

        return true;
    }

    function removerNumeroFinal(nome) {
        return nome.replace(/\s+\d+$/, "").trim();
    }

    function obterMarcadores(nome) {
        return String(nome ?? "").match(/\[[^\]]+\]/g) || [];
    }

    function marcadorDeGrupo(marcador) {
        return /^\[[A-Z]{1,3}\s+\d+\/\d+\]$/i.test(String(marcador ?? "").trim());
    }

    function removerMarcadores(nome) {
        return String(nome ?? "").replace(/\s*\[[^\]]+\]\s*/g, " ").replace(/\s+/g, " ").trim();
    }

    function removerMarcacaoGrupo(nome) {
        return removerNumeroFinal(
            nome
                .replace(/\s*\[[A-Z]{1,3}\s+\d+\/\d+\]\s*$/i, "")
                .replace(/\s+[A-Z]{1,3}\s+\d+\/\d+\s*$/i, ""),
        );
    }

    function criarNomeBasePorUnidade(nome, etiquetaBase) {
        const semGrupo = removerMarcacaoGrupo(nome);
        const marcadores = obterMarcadores(semGrupo).filter((marcador) => {
            if (marcadorDeGrupo(marcador)) {
                return false;
            }

            const texto = normalizar(marcador.replace(/^\[|\]$/g, ""));
            return (config.etiquetasNativasIgnorar || []).map(normalizar).includes(texto);
        });
        const partes = [etiquetaBase, ...marcadores].filter(Boolean);
        return partes.join(" ").replace(/\s+/g, " ").trim();
    }

    function criarNomeComContagem(nome, infoGrupo, etiquetaBase) {
        const base = criarNomeBasePorUnidade(nome, etiquetaBase);
        return config.formatoContagem
            .replace(/\{nome\}/g, base)
            .replace(/\{grupo\}/g, infoGrupo.grupo.etiqueta)
            .replace(/\{pos\}/g, String(infoGrupo.posicao))
            .replace(/\{total\}/g, String(infoGrupo.grupo.total))
            .replace(/\{aldeia\}/g, infoGrupo.grupo.aldeia)
            .trim();
    }

    function temMarcacaoGrupoCorreta(nome, infoGrupo, etiquetaBase) {
        return normalizar(nome) === normalizar(criarNomeComContagem(nome, infoGrupo, etiquetaBase));
    }

    function temEtiquetaNativa(nome) {
        const ignorar = (config.etiquetasNativasIgnorar || []).map(normalizar);
        return obterMarcadores(nome).some((marcador) => {
            if (marcadorDeGrupo(marcador)) {
                return false;
            }

            const texto = normalizar(marcador.replace(/^\[|\]$/g, ""));
            return ignorar.includes(texto);
        });
    }

    function contemEtiqueta(nomeNormalizado, etiquetaNormalizada) {
        return Boolean(etiquetaNormalizada) && nomeNormalizado.includes(etiquetaNormalizada);
    }

    function destacarLinha(linha, tipo) {
        if (!config.destacarLinhas || !linha) {
            return;
        }

        const cores = {
            nobre: "#ffd7d7",
            etiqueta: "#dcecff",
            contagem: "#fff1bd",
            teste: "#e7e0ff",
            erro: "#ffbdbd",
        };

        linha.style.boxShadow = `inset 4px 0 0 ${cores[tipo] || "#ddd"}`;
        linha.style.transition = "box-shadow 0.2s ease";
    }

    function destacarGrupo(linha, infoGrupo) {
        if (!config.destacarLinhas || !linha || !infoGrupo) {
            return;
        }

        const celula = linha.querySelector("td:first-child") || linha;
        const { grupo, posicao } = infoGrupo;
        celula.style.boxShadow = `inset 7px 0 0 ${grupo.cor}`;
        celula.style.backgroundImage = `linear-gradient(90deg, ${grupo.cor}55, rgba(255,255,255,0) 38%)`;
        celula.title = `${grupo.etiqueta}: ${grupo.aldeia} (${posicao}/${grupo.total})`;
    }

    function encontrarBotaoEtiquetar() {
        const candidatos = [
            ...document.querySelectorAll(SELETORES.botaoEtiquetar),
            ...document.querySelectorAll('input[type="submit"], input[type="button"], button'),
        ];

        return candidatos.find((botao) => {
            const texto = normalizar([
                botao.getAttribute("name"),
                botao.getAttribute("value"),
                botao.textContent,
                botao.getAttribute("title"),
            ].join(" "));

            return texto.includes("etiqueta") && !texto.includes("configura");
        }) || null;
    }

    function submeterFormularioEtiqueta(botao) {
        const formulario = botao?.closest("form")
            || document.querySelector(`${SELETORES.tabela}`)?.closest("form")
            || document.querySelector('form[action*="incomings"], form[action*="overview_villages"]');

        if (!formulario) {
            return false;
        }

        if (typeof formulario.requestSubmit === "function" && botao) {
            try {
                formulario.requestSubmit(botao);
                return true;
            } catch {
                // Alguns botoes do TW parecem botoes normais; nesse caso cai no submit manual.
            }
        }

        if (botao?.name) {
            const hidden = document.createElement("input");
            hidden.type = "hidden";
            hidden.name = botao.name;
            hidden.value = botao.value || botao.textContent || "Etiqueta";
            formulario.appendChild(hidden);
        }

        formulario.submit();
        return true;
    }

    function clicarBotaoEtiquetar(selecionados) {
        if (selecionados <= 0) {
            log("Sem comandos selecionados para etiquetar.");
            return false;
        }

        if (config.modoTeste) {
            log(`[teste] Clicaria no botao de etiquetar para ${selecionados} comando(s).`);
            return false;
        }

        const botao = encontrarBotaoEtiquetar();
        if (!botao) {
            log("Botao Etiqueta nao encontrado.");
            return false;
        }

        log(`A etiquetar ${selecionados} comando(s).`);
        if (submeterFormularioEtiqueta(botao)) {
            return true;
        }

        botao.click();
        return true;
    }

    function mostrarResumo({ renomeados, selecionados, total, grupos = 0, fullsNobre = 0 }) {
        if (!config.mostrarResumo) {
            return;
        }

        const prefixo = config.modoTeste ? "[TESTE] " : "";
        const detalheGrupos = grupos ? `, ${grupos} grupo(s)` : "";
        const detalheFulls = fullsNobre ? `, ${fullsNobre} full(s) por comboio de nobres` : "";
        const mensagem = `${prefixo}Etiquetador: ${renomeados} renomeado(s), ${selecionados} selecionado(s), ${total} entrada(s)${detalheGrupos}${detalheFulls}.`;
        mostrarMensagem(mensagem);
    }

    function mostrarMensagem(mensagem) {
        if (window.UI?.SuccessMessage) {
            window.UI.SuccessMessage(mensagem, 4500);
            return;
        }

        log(mensagem);
    }

    function agendarVerificacaoEtiquetas() {
        log("Verificacao por reload desativada; a etiqueta e confirmada pela propria tabela.");
    }

    async function talvezPausarLote(totalEdicoes) {
        if (config.modoTeste) {
            return;
        }

        if (
            config.pausaLoteQuantidade <= 0
            || totalEdicoes <= 0
            || totalEdicoes % config.pausaLoteQuantidade !== 0
        ) {
            await esperar(randomEdicao());
            return;
        }

        const pausa = randomPausaLote();
        log(`Pausa aleatoria de lote: ${formatarTempo(pausa)}.`);
        await esperar(pausa);
    }

    function contarFullsPorComboioDeNobres(grupos) {
        return grupos.filter((grupo) => grupo.linhas.filter((linha) => temIconeDeNobre(linha)).length >= 2).length;
    }

    async function etiquetarIncomings() {
        if (execucaoEmCurso) {
            return;
        }

        execucaoEmCurso = true;

        try {
            await esperarTabelaIncomings();

            const tabela = document.querySelector(SELETORES.tabela);
            if (!tabela) {
                log("Tabela de incomings nao encontrada.");
                return;
            }

            const etiquetas = obterEtiquetasNormalizadas();
            const linhas = obterLinhasValidas();
            const gruposRepetidos = criarGruposPorAldeia(linhas);
            const fullsNobre = contarFullsPorComboioDeNobres(gruposRepetidos.grupos);
            let renomeados = 0;
            let selecionados = selecionarLinhasParaEtiquetar(linhas, etiquetas);
            let edicoesServidor = 0;

            for (const linha of linhas) {
                const nomeAtual = obterNome(linha);
                const infoGrupo = gruposRepetidos.porLinha.get(linha);

                if (infoGrupo) {
                    destacarGrupo(linha, infoGrupo);
                }

                if (linhaJaEstaEtiquetada(linha)) {
                    desmarcarParaNaoEtiquetar(linha);
                    continue;
                }

                const etiquetaBase = obterEtiquetaBaseDaLinha(linha);
                if (!etiquetaBase) {
                    desmarcarParaNaoEtiquetar(linha);
                    continue;
                }

                const novoNome = infoGrupo
                    ? criarNomeComContagem(nomeAtual, infoGrupo, etiquetaBase)
                    : criarNomeBasePorUnidade(nomeAtual, etiquetaBase);

                if (normalizar(nomeAtual) === normalizar(novoNome)) {
                    continue;
                }

                const tipoDestaque = detectarUnidadeMaisLenta(linha)?.id === "snob" ? "nobre" : "contagem";
                if (await renomearComando(linha, novoNome, tipoDestaque)) {
                    renomeados += 1;
                    edicoesServidor += 1;
                    if (infoGrupo) {
                        destacarGrupo(linha, infoGrupo);
                    }
                    await talvezPausarLote(edicoesServidor);
                }
            }

            selecionados = selecionarLinhasParaEtiquetar(linhas, etiquetas);
            const etiquetaEnviada = clicarBotaoEtiquetar(selecionados);
            mostrarResumo({
                renomeados,
                selecionados,
                total: linhas.length,
                grupos: gruposRepetidos.grupos.length,
                fullsNobre,
            });
            if (selecionados > 0) {
                if (!etiquetaEnviada) {
                    log("Nao foi possivel submeter a etiqueta automaticamente.");
                    if (!estaEmFrame()) {
                        agendarVerificacaoGlobal();
                    }
                }
                return;
            } else {
                atualizarEstadoIncomings(linhas);
                log("Todos os comandos conhecidos parecem etiquetados. Refresh parado ate haver novo ataque.");
                notificarProcessamentoConcluido();
                if (!estaEmFrame()) {
                    agendarVerificacaoGlobal();
                }
            }
        } finally {
            execucaoEmCurso = false;
        }
    }

    function extrairNumero(texto) {
        const resultado = String(texto ?? "").match(/\d+/);
        return resultado ? Number(resultado[0]) : 0;
    }

    function obterContadorIncomings() {
        const candidatos = [
            ...document.querySelectorAll(SELETORES.contadorIncomings),
            ...document.querySelectorAll(SELETORES.linkIncomings),
        ];

        return candidatos.reduce((maior, elemento) => {
            const texto = elemento.textContent || elemento.getAttribute("title") || elemento.getAttribute("aria-label") || "";
            return Math.max(maior, extrairNumero(texto));
        }, 0);
    }

    function obterTotalAtualIncomings() {
        const totalTabela = paginaDeIncomings() ? obterLinhasValidas().length : 0;
        return Math.max(totalTabela, obterContadorIncomings());
    }

    function novoAtaqueDetectado() {
        sincronizarEstado();

        const totalAtual = obterTotalAtualIncomings();
        if (totalAtual <= 0) {
            atualizarEstadoSemIncomings();
            return false;
        }

        if (estado.ultimoTotalIncomings <= 0) {
            return true;
        }

        if (estado.ultimoTotalIncomings > 0 && totalAtual > estado.ultimoTotalIncomings) {
            return true;
        }

        if (!paginaDeIncomings()) {
            return false;
        }

        const assinaturaAtual = assinaturaIncomings();
        return Boolean(
            estado.ultimaAssinatura
            && assinaturaAtual
            && assinaturaAtual !== estado.ultimaAssinatura
            && totalAtual >= estado.ultimoTotalIncomings,
        );
    }

    function verificarPaginaDoJogo() {
        if (!config.ativo || paginaDeIncomings()) {
            return;
        }

        if (obterContadorIncomings() <= 0) {
            atualizarEstadoSemIncomings();
            log("Sem incomings detectados nesta pagina.");
            return;
        }

        if (novoAtaqueDetectado()) {
            processarIncomingsEmFundo();
            return;
        }

        log("Incomings conhecidos; monitor continua sem mexer na pagina.");
    }

    function obterUrlIncomings() {
        const link = document.querySelector(SELETORES.linkIncomings);
        if (link?.href) {
            return link.href;
        }

        const url = new URL(window.location.href);
        url.searchParams.set("screen", "overview_villages");
        url.searchParams.set("mode", "incomings");
        return url.toString();
    }

    function processarIncomingsEmFundo() {
        if (paginaDeIncomings()) {
            etiquetarIncomings();
            return;
        }

        if (estaEmFrame()) {
            return;
        }

        const existente = document.querySelector(`#${FRAME_FUNDO_ID}`);
        if (existente) {
            log("Processamento em fundo ja esta aberto.");
            return;
        }

        const iframe = document.createElement("iframe");
        iframe.id = FRAME_FUNDO_ID;
        iframe.src = obterUrlIncomings();
        iframe.title = "Etiquetador de ataques";
        iframe.style.cssText = [
            "position:absolute",
            "left:-9999px",
            "top:-9999px",
            "width:1px",
            "height:1px",
            "opacity:0",
            "pointer-events:none",
            "border:0",
        ].join(";");
        document.body.appendChild(iframe);

        log("Novo ataque detectado. A processar incomings em fundo, sem redirecionar a pagina atual.");

        window.setTimeout(() => {
            iframe.remove();
        }, 240_000);
    }

    function notificarProcessamentoConcluido() {
        if (!estaEmFrame()) {
            return;
        }

        window.parent.postMessage({ tipo: "tag-incomings-pt-concluido" }, window.location.origin);
    }

    function instalarListenerFrameFundo() {
        if (estaEmFrame()) {
            return;
        }

        window.addEventListener("message", (evento) => {
            if (evento.origin !== window.location.origin || evento.data?.tipo !== "tag-incomings-pt-concluido") {
                return;
            }

            document.querySelector(`#${FRAME_FUNDO_ID}`)?.remove();
            sincronizarEstado();
            log("Processamento em fundo concluido. Monitor parado ate aparecer novo ataque.");
        });
    }

    function agendarVerificacaoGlobal() {
        if (verificacaoAgendada) {
            return;
        }

        verificacaoAgendada = true;
        const atraso = randomGlobal();
        log(`Monitor de novos ataques em ${formatarTempo(atraso)}.`);

        window.setTimeout(() => {
            verificacaoAgendada = false;
            if (novoAtaqueDetectado()) {
                if (paginaDeIncomings()) {
                    log("Novo ataque detectado. A processar a pagina de incomings.");
                    etiquetarIncomings();
                    return;
                }

                processarIncomingsEmFundo();
            } else {
                verificarPaginaDoJogo();
            }

            agendarVerificacaoGlobal();
        }, atraso);
    }

    function lerBooleanoPainel(nome) {
        return Boolean(document.querySelector(`[data-ti-bool="${nome}"]`)?.checked);
    }

    function lerTextoPainel(nome) {
        return document.querySelector(`[data-ti-text="${nome}"]`)?.value?.trim() ?? "";
    }

    function lerNumeroPainel(nome, fallback, escala = 1) {
        const valor = Number(document.querySelector(`[data-ti-number="${nome}"]`)?.value);
        if (!Number.isFinite(valor)) {
            return fallback;
        }

        return Math.max(0, Math.round(valor * escala));
    }

    function criarCampoTexto(rotulo, chave, valor) {
        return `<label>${rotulo}<input data-ti-text="${chave}" type="text" value="${escaparHtml(valor)}"></label>`;
    }

    function criarCampoNumero(rotulo, chave, valorMs) {
        return `<label>${rotulo}<input data-ti-number="${chave}" type="number" min="0" step="1" value="${Math.round(valorMs / 1000)}"></label>`;
    }

    function criarCheckbox(rotulo, chave, valor) {
        return `<label><input data-ti-bool="${chave}" type="checkbox" ${valor ? "checked" : ""}>${rotulo}</label>`;
    }

    function escaparHtml(texto) {
        return String(texto)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function guardarPainel() {
        config.ativo = lerBooleanoPainel("ativo");
        config.modoTeste = lerBooleanoPainel("modoTeste");
        config.recarregarAoTerminar = false;
        config.destacarLinhas = lerBooleanoPainel("destacarLinhas");
        config.etiquetas.ataque = lerTextoPainel("etiquetaAtaque") || CONFIG_PADRAO.etiquetas.ataque;
        config.etiquetas.apoio = lerTextoPainel("etiquetaApoio") || CONFIG_PADRAO.etiquetas.apoio;
        config.etiquetas.nobre = lerTextoPainel("etiquetaNobre") || CONFIG_PADRAO.etiquetas.nobre;
        config.formatoContagem = lerTextoPainel("formatoContagem") || CONFIG_PADRAO.formatoContagem;
        config.atrasoIncomingsMinMs = lerNumeroPainel("atrasoIncomingsMinMs", CONFIG_PADRAO.atrasoIncomingsMinMs, 1000);
        config.atrasoIncomingsMaxMs = lerNumeroPainel("atrasoIncomingsMaxMs", CONFIG_PADRAO.atrasoIncomingsMaxMs, 1000);
        config.atrasoGlobalMinMs = lerNumeroPainel("atrasoGlobalMinMs", CONFIG_PADRAO.atrasoGlobalMinMs, 1000);
        config.atrasoGlobalMaxMs = lerNumeroPainel("atrasoGlobalMaxMs", CONFIG_PADRAO.atrasoGlobalMaxMs, 1000);
        config.intervaloEdicaoMinMs = lerNumeroPainel("intervaloEdicaoMinMs", CONFIG_PADRAO.intervaloEdicaoMinMs, 1000);
        config.intervaloEdicaoMaxMs = lerNumeroPainel("intervaloEdicaoMaxMs", CONFIG_PADRAO.intervaloEdicaoMaxMs, 1000);

        if (config.atrasoIncomingsMaxMs < config.atrasoIncomingsMinMs) {
            config.atrasoIncomingsMaxMs = config.atrasoIncomingsMinMs;
        }

        if (config.atrasoGlobalMaxMs < config.atrasoGlobalMinMs) {
            config.atrasoGlobalMaxMs = config.atrasoGlobalMinMs;
        }

        if (config.intervaloEdicaoMaxMs < config.intervaloEdicaoMinMs) {
            config.intervaloEdicaoMaxMs = config.intervaloEdicaoMinMs;
        }

        guardarConfig();
        mostrarMensagem("Configuracao guardada.");
    }

    function criarPainel() {
        if (estaEmFrame() || !config.mostrarPainel || document.querySelector("#tag-incomings-pt-panel")) {
            return;
        }

        const painel = document.createElement("div");
        painel.id = "tag-incomings-pt-panel";
        painel.className = config.painelAberto ? "ti-open" : "";
        painel.innerHTML = `
            <style>
                #tag-incomings-pt-panel {
                    position: fixed !important;
                    left: 12px !important;
                    right: auto !important;
                    top: 139px !important;
                    bottom: auto !important;
                    z-index: 2147483647 !important;
                    font: 12px Verdana, Arial, sans-serif !important;
                }
                #tag-incomings-pt-panel .ti-toggle {
                    position: relative !important;
                    z-index: 2 !important;
                    box-sizing: border-box !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: flex-start !important;
                    gap: 0 !important;
                    width: 30px !important;
                    min-width: 30px !important;
                    height: 28px !important;
                    overflow: hidden !important;
                    padding: 0 6px !important;
                    cursor: pointer !important;
                    border: 1px solid #4f120f !important;
                    border-radius: 2px !important;
                    background: linear-gradient(to bottom, #b33a34, #8f2420 55%, #681611) !important;
                    box-shadow:
                        inset 0 1px 0 rgba(255, 255, 255, 0.35),
                        inset 0 -1px 0 rgba(0, 0, 0, 0.35),
                        0 2px 5px rgba(0, 0, 0, 0.45) !important;
                    color: #fff !important;
                    font: bold 12px Verdana, Arial, sans-serif !important;
                    line-height: 1 !important;
                    text-align: left !important;
                    text-shadow: 1px 1px 1px #000 !important;
                    white-space: nowrap !important;
                    transition:
                        width 180ms ease,
                        min-width 180ms ease,
                        padding 180ms ease,
                        gap 180ms ease,
                        background 180ms ease !important;
                }
                #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:hover,
                #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:focus-visible {
                    width: 205px !important;
                    min-width: 205px !important;
                    gap: 8px !important;
                    padding: 0 9px !important;
                    background: linear-gradient(to bottom, #c4473e, #a02c27 55%, #7e1c17) !important;
                }
                #tag-incomings-pt-panel .ti-toggle-icon {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    width: 16px !important;
                    height: 16px !important;
                    flex: 0 0 16px !important;
                }
                #tag-incomings-pt-panel .ti-toggle-icon img {
                    display: block !important;
                    width: 16px !important;
                    height: 16px !important;
                    filter: drop-shadow(0 1px 1px #000);
                }
                #tag-incomings-pt-panel .ti-toggle-label {
                    display: inline-block !important;
                    max-width: 0 !important;
                    opacity: 0 !important;
                    overflow: hidden !important;
                    color: #fff !important;
                    white-space: nowrap !important;
                    transform: translateX(-4px);
                    transition:
                        max-width 180ms ease,
                        opacity 140ms ease,
                        transform 180ms ease !important;
                }
                #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:hover .ti-toggle-label,
                #tag-incomings-pt-panel:not(.ti-open) .ti-toggle:focus-visible .ti-toggle-label {
                    max-width: 165px !important;
                    opacity: 1 !important;
                    transform: translateX(0);
                }
                #tag-incomings-pt-panel .ti-config {
                    position: absolute !important;
                    left: 36px !important;
                    right: auto !important;
                    top: 0 !important;
                    display: none;
                    box-sizing: border-box !important;
                    width: 270px;
                    max-width: calc(100vw - 60px);
                    max-height: calc(100vh - 150px);
                    overflow: auto;
                    padding: 10px;
                    background: #f4e4bc;
                    color: #2b1d0e;
                    border: 1px solid #7d510f;
                    border-radius: 3px;
                    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.4);
                }
                #tag-incomings-pt-panel.ti-open .ti-config {
                    display: block !important;
                }
                #tag-incomings-pt-panel strong {
                    display: block;
                    margin-bottom: 4px;
                    font-size: 13px;
                }
                #tag-incomings-pt-panel .ti-status {
                    margin-bottom: 8px;
                    color: #5b421f;
                    font-size: 11px;
                }
                #tag-incomings-pt-panel label {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px;
                    margin: 5px 0;
                }
                #tag-incomings-pt-panel input[type="text"],
                #tag-incomings-pt-panel input[type="number"],
                #tag-incomings-pt-panel input:not([type]) {
                    width: 118px;
                    box-sizing: border-box;
                    font-size: 12px;
                }
                #tag-incomings-pt-panel .ti-grid {
                    border-top: 1px solid rgba(125, 81, 15, 0.45);
                    margin-top: 8px;
                    padding-top: 8px;
                }
                #tag-incomings-pt-panel .ti-actions {
                    display: flex;
                    gap: 6px;
                    margin-top: 8px;
                }
                #tag-incomings-pt-panel .ti-actions button {
                    flex: 1;
                    cursor: pointer;
                    border: 1px solid #4f120f;
                    border-radius: 2px;
                    background: linear-gradient(to bottom, #b33a34, #8f2420 55%, #681611);
                    color: #fff;
                    font-weight: bold;
                    text-shadow: 1px 1px 1px #000;
                    font-size: 12px;
                }
                #tag-incomings-pt-panel .ti-actions button:hover {
                    background: linear-gradient(to bottom, #c4473e, #a02c27 55%, #7e1c17);
                }
                @media (max-width: 520px) {
                    #tag-incomings-pt-panel {
                        left: 5px !important;
                    }
                    #tag-incomings-pt-panel .ti-config {
                        left: 34px !important;
                        width: min(270px, calc(100vw - 44px));
                    }
                }
            </style>
            <div class="ti-config">
                <strong>Etiquetador de ataques</strong>
                <div class="ti-status">${config.ativo ? "Monitor ativo" : "Monitor inativo"} - v1.0.0</div>
                ${criarCheckbox("Ativo", "ativo", config.ativo)}
                ${criarCheckbox("Modo teste", "modoTeste", config.modoTeste)}
                ${criarCheckbox("Destacar linhas", "destacarLinhas", config.destacarLinhas)}
                <div class="ti-grid">
                    ${criarCampoTexto("Ataque", "etiquetaAtaque", config.etiquetas.ataque)}
                    ${criarCampoTexto("Apoio", "etiquetaApoio", config.etiquetas.apoio)}
                    ${criarCampoTexto("Nobre", "etiquetaNobre", config.etiquetas.nobre)}
                    ${criarCampoTexto("Formato", "formatoContagem", config.formatoContagem)}
                </div>
                <div class="ti-grid">
                    ${criarCampoNumero("Pagina min", "atrasoIncomingsMinMs", config.atrasoIncomingsMinMs)}
                    ${criarCampoNumero("Pagina max", "atrasoIncomingsMaxMs", config.atrasoIncomingsMaxMs)}
                    ${criarCampoNumero("Global min", "atrasoGlobalMinMs", config.atrasoGlobalMinMs)}
                    ${criarCampoNumero("Global max", "atrasoGlobalMaxMs", config.atrasoGlobalMaxMs)}
                    ${criarCampoNumero("Editar min", "intervaloEdicaoMinMs", config.intervaloEdicaoMinMs)}
                    ${criarCampoNumero("Editar max", "intervaloEdicaoMaxMs", config.intervaloEdicaoMaxMs)}
                </div>
                <div class="ti-actions">
                    <button type="button" data-ti-action="guardar">Guardar</button>
                    <button type="button" data-ti-action="executar">Executar</button>
                </div>
            </div>
            <button class="ti-toggle" type="button" data-ti-action="toggle" title="${config.painelAberto ? "Fechar configuracoes" : "Configurar etiquetador"}" aria-label="Configurar etiquetador de ataques" aria-expanded="${config.painelAberto ? "true" : "false"}">
                <span class="ti-toggle-icon" aria-hidden="true"><img src="/graphic/command/attack.png" alt=""></span>
                <span class="ti-toggle-label">Etiquetador de ataques</span>
            </button>
        `;

        painel.addEventListener("click", (evento) => {
            const controlo = evento.target?.closest?.("[data-ti-action]");
            const acao = controlo?.dataset?.tiAction;
            if (acao === "toggle") {
                config.painelAberto = !config.painelAberto;
                painel.classList.toggle("ti-open", config.painelAberto);
                controlo.setAttribute("aria-expanded", config.painelAberto ? "true" : "false");
                controlo.setAttribute("title", config.painelAberto ? "Fechar configuracoes" : "Configurar etiquetador");
                guardarConfig();
                return;
            }

            if (acao === "guardar") {
                guardarPainel();
            }

            if (acao === "executar") {
                guardarPainel();
                if (paginaDeIncomings()) {
                    etiquetarIncomings();
                } else {
                    verificarPaginaDoJogo();
                }
            }
        });

        document.body.appendChild(painel);
    }

    function iniciar() {
        instalarListenerFrameFundo();
        criarPainel();

        if (!config.ativo) {
            log("Script inativo por configuracao.");
            return;
        }

        if (paginaDeIncomings()) {
            const atraso = randomPaginaIncomings();
            log(`Pagina de incomings detectada. Execucao em ${formatarTempo(atraso)}.`);
            window.setTimeout(etiquetarIncomings, atraso);
            return;
        }

        if (estaEmFrame()) {
            return;
        }

        agendarVerificacaoGlobal();
    }

    iniciar();
})();
