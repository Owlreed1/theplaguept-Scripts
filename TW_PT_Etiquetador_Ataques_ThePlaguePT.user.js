// ==UserScript==
// @name         TW PT - Etiquetador de Ataques ThePlaguePT
// @version      1.0.16
// @description  Detecta, renomeia e etiqueta automaticamente ataques de entrada no Tribal Wars.
// @author       ThePlaguePT, baseado no script original de FunnyPocketBook
// @icon         https://i.imgur.com/JXzrSKy.jpeg
// @match        https://*/game.php*
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
        sons: {
            ataque: true,
            nobre: true,
            cancelado: true,
        },
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
    const MARGEM_CANCELAMENTO_MS = 15_000;

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
    let posicionamentoBotaoFrame = 0;
    let contextoAudio = null;
    let filaSons = [];
    const ultimoSomPorTipo = new Map();

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
            const comandosTratados = Array.isArray(guardado.comandosTratados)
                ? guardado.comandosTratados.map(String)
                : [];
            return {
                ultimoTotalIncomings: Number(guardado.ultimoTotalIncomings) || 0,
                ultimoTotalContador: Number(guardado.ultimoTotalContador) || 0,
                ultimaAssinatura: String(guardado.ultimaAssinatura || ""),
                processado: Boolean(guardado.processado),
                comandosTratados,
                comandosPendentes: Array.isArray(guardado.comandosPendentes)
                    ? guardado.comandosPendentes.map(String)
                    : [],
                comandosConhecidos: guardado.comandosConhecidos && typeof guardado.comandosConhecidos === "object"
                    ? guardado.comandosConhecidos
                    : {},
                comandosAvisadosAtaque: Array.isArray(guardado.comandosAvisadosAtaque)
                    ? guardado.comandosAvisadosAtaque.map(String)
                    : [...comandosTratados],
                comandosAvisadosNobre: Array.isArray(guardado.comandosAvisadosNobre)
                    ? guardado.comandosAvisadosNobre.map(String)
                    : [...comandosTratados],
            };
        } catch {
            return {
                ultimoTotalIncomings: 0,
                ultimoTotalContador: 0,
                ultimaAssinatura: "",
                processado: false,
                comandosTratados: [],
                comandosPendentes: [],
                comandosConhecidos: {},
                comandosAvisadosAtaque: [],
                comandosAvisadosNobre: [],
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

    function somAtivo(tipo) {
        return Boolean(config.sons?.[tipo]) && !config.modoTeste;
    }

    function obterContextoAudio() {
        if (contextoAudio) {
            return contextoAudio;
        }

        const AudioContexto = window.AudioContext || window.webkitAudioContext;
        if (!AudioContexto) {
            log("Este navegador nao suporta os alertas sonoros.");
            return null;
        }

        contextoAudio = new AudioContexto();
        return contextoAudio;
    }

    function obterPadraoSom(tipo) {
        const padroes = {
            ataque: [
                { frequencia: 440, inicio: 0, duracao: 0.12, onda: "square", volume: 0.13 },
                { frequencia: 660, inicio: 0.16, duracao: 0.16, onda: "square", volume: 0.13 },
            ],
            nobre: [
                { frequencia: 392, inicio: 0, duracao: 0.16, onda: "triangle", volume: 0.15 },
                { frequencia: 523.25, inicio: 0.18, duracao: 0.18, onda: "triangle", volume: 0.15 },
                { frequencia: 783.99, inicio: 0.38, duracao: 0.28, onda: "triangle", volume: 0.16 },
            ],
            cancelado: [
                { frequencia: 659.25, inicio: 0, duracao: 0.15, onda: "sawtooth", volume: 0.12 },
                { frequencia: 440, inicio: 0.18, duracao: 0.17, onda: "sawtooth", volume: 0.12 },
                { frequencia: 220, inicio: 0.38, duracao: 0.28, onda: "sawtooth", volume: 0.13 },
            ],
        };

        return padroes[tipo] || [];
    }

    function reproduzirSomLocal(tipo, atrasoMs = 0) {
        if (!somAtivo(tipo)) {
            return;
        }

        const agora = Date.now();
        if (agora - (ultimoSomPorTipo.get(tipo) || 0) < 1_200) {
            return;
        }

        const contexto = obterContextoAudio();
        if (!contexto) {
            return;
        }

        if (contexto.state !== "running") {
            if (!filaSons.some((item) => item.tipo === tipo)) {
                filaSons.push({ tipo, atrasoMs });
            }
            return;
        }

        ultimoSomPorTipo.set(tipo, agora);
        const inicioBase = contexto.currentTime + Math.max(0, atrasoMs) / 1000;

        obterPadraoSom(tipo).forEach((nota) => {
            const oscilador = contexto.createOscillator();
            const ganho = contexto.createGain();
            const inicio = inicioBase + nota.inicio;
            const fim = inicio + nota.duracao;

            oscilador.type = nota.onda;
            oscilador.frequency.setValueAtTime(nota.frequencia, inicio);
            ganho.gain.setValueAtTime(0.0001, inicio);
            ganho.gain.exponentialRampToValueAtTime(nota.volume, inicio + 0.015);
            ganho.gain.exponentialRampToValueAtTime(0.0001, fim);
            oscilador.connect(ganho);
            ganho.connect(contexto.destination);
            oscilador.start(inicio);
            oscilador.stop(fim + 0.02);
        });
    }

    function emitirSom(tipo, atrasoMs = 0) {
        if (!somAtivo(tipo)) {
            return;
        }

        if (estaEmFrame()) {
            window.parent.postMessage({
                tipo: "tag-incomings-pt-som",
                som: tipo,
                atrasoMs,
            }, window.location.origin);
            return;
        }

        reproduzirSomLocal(tipo, atrasoMs);
    }

    function instalarDesbloqueioAudio() {
        if (estaEmFrame()) {
            return;
        }

        const desbloquear = async () => {
            const contexto = obterContextoAudio();
            if (!contexto) {
                return;
            }

            try {
                await contexto.resume();
            } catch {
                return;
            }

            if (contexto.state !== "running") {
                return;
            }

            document.removeEventListener("pointerdown", desbloquear, true);
            document.removeEventListener("keydown", desbloquear, true);
            const pendentes = filaSons;
            filaSons = [];
            pendentes.forEach((item, indice) => {
                reproduzirSomLocal(item.tipo, item.atrasoMs + indice * 250);
            });
        };

        document.addEventListener("pointerdown", desbloquear, true);
        document.addEventListener("keydown", desbloquear, true);
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

    function obterLinhasTabela() {
        return [...document.querySelectorAll(SELETORES.linha)].filter((linha) => (
            linha.querySelector(SELETORES.nome)
            && linha.querySelector(SELETORES.aldeiaAtacante)
        ));
    }

    function obterCelulaJogador(linha) {
        const tabela = linha.closest("table");
        const cabecalhos = [...(tabela?.querySelectorAll("thead th, tr:first-child th") || [])];
        const indiceJogador = cabecalhos.findIndex((cabecalho) => (
            /^(jogador|player)$/i.test(cabecalho.textContent?.trim() || "")
        ));

        if (indiceJogador >= 0) {
            return linha.children[indiceJogador] || null;
        }

        return linha.querySelector("td:nth-child(4)");
    }

    function linhaDoProprioJogador(linha) {
        const celula = obterCelulaJogador(linha);
        if (!celula) {
            return false;
        }

        const jogadorAtual = window.game_data?.player || {};
        const idAtual = String(jogadorAtual.id || "");
        const nomeAtual = normalizar(jogadorAtual.name || "");
        const link = celula.querySelector('a[href*="screen=info_player"], a[href*="info_player"]');

        if (idAtual && link?.href) {
            try {
                const idLinha = new URL(link.href, window.location.href).searchParams.get("id");
                if (idLinha && String(idLinha) === idAtual) {
                    return true;
                }
            } catch {
                // O nome do jogador continua a servir como alternativa.
            }
        }

        return Boolean(nomeAtual && normalizar(celula.textContent) === nomeAtual);
    }

    function obterLinhasValidas() {
        return obterLinhasTabela().filter((linha) => !linhaDoProprioJogador(linha));
    }

    function obterIdComando(linha) {
        const link = linha.querySelector('a[href*="screen=info_command"][href*="id="]');
        if (link?.href) {
            try {
                const id = new URL(link.href, window.location.href).searchParams.get("id");
                if (id) {
                    return `command_${id}`;
                }
            } catch {
                // Continua com os dados da checkbox.
            }
        }

        const checkbox = linha.querySelector(SELETORES.checkboxComando);
        const textoCheckbox = [
            checkbox?.value,
            checkbox?.name,
            checkbox?.id,
        ].filter(Boolean).join("_");
        const idCheckbox = textoCheckbox.match(/\d{3,}/)?.[0];
        if (idCheckbox) {
            return `command_${idCheckbox}`;
        }

        return [
            obterAldeiaAtacante(linha),
            obterCelulaJogador(linha)?.textContent?.trim() || "",
            linha.children[4]?.textContent?.trim() || "",
            linha.children[5]?.textContent?.trim() || "",
        ].join("|");
    }

    function obterIndiceCabecalho(linha, termos) {
        const tabela = linha.closest("table");
        const cabecalhos = [...(tabela?.rows || [])]
            .find((linhaCabecalho) => linhaCabecalho.querySelector("th"))
            ?.querySelectorAll("th,td");
        if (!cabecalhos) {
            return -1;
        }

        return [...cabecalhos].findIndex((cabecalho) => {
            const texto = normalizar(cabecalho.textContent);
            return termos.some((termo) => texto === termo || texto.includes(termo));
        });
    }

    function obterCelulaChegada(linha) {
        const indice = obterIndiceCabecalho(linha, ["chegada", "arrival"]);
        return indice >= 0 ? linha.children[indice] : linha.children[5];
    }

    function obterCelulaTempoRestante(linha) {
        const indice = obterIndiceCabecalho(linha, ["chega em", "arrives in", "tempo restante"]);
        return indice >= 0 ? linha.children[indice] : linha.children[6];
    }

    function normalizarTimestamp(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) {
            return 0;
        }

        if (numero >= 1_000_000_000_000) {
            return numero;
        }

        if (numero >= 1_000_000_000) {
            return numero * 1000;
        }

        return 0;
    }

    function obterAgoraServidorMs() {
        try {
            const valor = window.Timing?.getCurrentServerTime?.();
            if (valor instanceof Date) {
                return valor.getTime();
            }

            const timestamp = normalizarTimestamp(valor);
            if (timestamp) {
                return timestamp;
            }
        } catch {
            // Usa o relogio local se a API do jogo nao estiver disponivel.
        }

        return Date.now();
    }

    function obterTimestampPorAtributo(linha) {
        const atributos = [
            "data-endtime",
            "data-end-time",
            "data-arrival",
            "data-arrival-time",
            "data-timestamp",
        ];
        const elementos = [linha, ...linha.querySelectorAll("*")];

        for (const elemento of elementos) {
            for (const atributo of atributos) {
                const timestamp = normalizarTimestamp(elemento.getAttribute?.(atributo));
                if (timestamp) {
                    return timestamp;
                }
            }
        }

        return 0;
    }

    function obterTimestampPorContagem(linha, agoraMs) {
        const texto = obterCelulaTempoRestante(linha)?.textContent?.trim() || "";
        const resultado = texto.match(/(\d+):(\d{2}):(\d{2})/);
        if (!resultado) {
            return 0;
        }

        const [, horas, minutos, segundos] = resultado.map(Number);
        return agoraMs + (((horas * 60 + minutos) * 60 + segundos) * 1000);
    }

    function obterTimestampPorTexto(linha, agoraMs) {
        const textoOriginal = obterCelulaChegada(linha)?.textContent?.trim() || "";
        const texto = normalizar(textoOriginal);
        const hora = texto.match(/(\d{1,2}):(\d{2}):(\d{2})/);
        if (!hora) {
            return 0;
        }

        const base = new Date(agoraMs);
        const data = texto.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
        if (data) {
            const anoCurto = Number(data[3] || base.getFullYear());
            const ano = anoCurto < 100 ? 2000 + anoCurto : anoCurto;
            base.setFullYear(ano, Number(data[2]) - 1, Number(data[1]));
        } else if (texto.includes("amanha") || texto.includes("tomorrow")) {
            base.setDate(base.getDate() + 1);
        }

        base.setHours(Number(hora[1]), Number(hora[2]), Number(hora[3]), 0);
        if (!data && !texto.includes("hoje") && !texto.includes("today") && base.getTime() < agoraMs - 60_000) {
            base.setDate(base.getDate() + 1);
        }

        return base.getTime();
    }

    function obterTimestampChegada(linha) {
        const agoraMs = obterAgoraServidorMs();
        return obterTimestampPorAtributo(linha)
            || obterTimestampPorContagem(linha, agoraMs)
            || obterTimestampPorTexto(linha, agoraMs);
    }

    function criarSnapshotComandos(linhas) {
        return Object.fromEntries(linhas.map((linha) => [
            obterIdComando(linha),
            {
                chegadaMs: obterTimestampChegada(linha),
            },
        ]).filter(([chave]) => Boolean(chave)));
    }

    function sincronizarComandosConhecidos(linhas) {
        const anteriores = estado.comandosConhecidos || {};
        const atuais = criarSnapshotComandos(linhas);
        const agoraMs = obterAgoraServidorMs();
        const cancelados = Object.entries(anteriores).filter(([chave, dados]) => (
            !atuais[chave]
            && Number(dados?.chegadaMs) > agoraMs + MARGEM_CANCELAMENTO_MS
        ));

        if (cancelados.length > 0) {
            emitirSom("cancelado");
            log(`${cancelados.length} ataque(s) cancelado(s) antes da chegada.`);
        }

        const chavesAtuais = new Set(Object.keys(atuais));
        estado.comandosConhecidos = atuais;
        estado.comandosAvisadosAtaque = (estado.comandosAvisadosAtaque || [])
            .filter((chave) => chavesAtuais.has(chave));
        estado.comandosAvisadosNobre = (estado.comandosAvisadosNobre || [])
            .filter((chave) => chavesAtuais.has(chave));
        guardarEstado();
        return cancelados.length;
    }

    function avisarNovosAtaques(linhas) {
        const avisadosAtaque = new Set(estado.comandosAvisadosAtaque || []);
        const avisadosNobre = new Set(estado.comandosAvisadosNobre || []);
        const porTratar = linhas.filter((linha) => !linhaJaEstaEtiquetada(linha));
        const novos = linhas.filter((linha) => !avisadosAtaque.has(obterIdComando(linha)));
        const novosNobres = porTratar.filter((linha) => (
            !avisadosNobre.has(obterIdComando(linha))
            && detectarUnidadeMaisLenta(linha)?.id === "snob"
        ));

        if (novos.length > 0) {
            emitirSom("ataque");
        }

        if (novosNobres.length > 0) {
            emitirSom("nobre", novos.length > 0 ? 650 : 0);
        }

        novos.forEach((linha) => avisadosAtaque.add(obterIdComando(linha)));
        novosNobres.forEach((linha) => avisadosNobre.add(obterIdComando(linha)));
        estado.comandosAvisadosAtaque = [...avisadosAtaque];
        estado.comandosAvisadosNobre = [...avisadosNobre];
        guardarEstado();
    }

    function assinaturaIncomings(linhas = obterLinhasValidas()) {
        return linhas.map((linha) => [
            obterIdComando(linha),
            obterAldeiaAtacante(linha),
            linha.children[3]?.textContent?.trim() || "",
            linha.children[4]?.textContent?.trim() || "",
        ].join("|")).join("||");
    }

    function atualizarEstadoIncomings(linhas = obterLinhasValidas()) {
        const chavesAtuais = new Set(linhas.map(obterIdComando).filter(Boolean));
        const tratados = new Set([
            ...(estado.comandosTratados || []),
            ...(estado.comandosPendentes || []),
        ]);

        linhas.forEach((linha) => {
            if (linhaJaTemEtiquetaNoNome(linha)) {
                tratados.add(obterIdComando(linha));
            }
        });

        estado.ultimoTotalIncomings = linhas.length;
        estado.ultimoTotalContador = obterLinhasTabela().length;
        estado.ultimaAssinatura = assinaturaIncomings(linhas);
        estado.processado = true;
        estado.comandosTratados = [...tratados].filter((chave) => chavesAtuais.has(chave));
        estado.comandosPendentes = [];
        guardarEstado();
        atualizarContadorBotao();
    }

    function atualizarEstadoSemIncomings() {
        if (
            estado.processado
            && estado.ultimoTotalIncomings === 0
            && estado.ultimoTotalContador === 0
            && !estado.ultimaAssinatura
            && (estado.comandosTratados || []).length === 0
            && (estado.comandosPendentes || []).length === 0
            && Object.keys(estado.comandosConhecidos || {}).length === 0
            && (estado.comandosAvisadosAtaque || []).length === 0
            && (estado.comandosAvisadosNobre || []).length === 0
        ) {
            return;
        }

        estado.ultimoTotalIncomings = 0;
        estado.ultimoTotalContador = 0;
        estado.ultimaAssinatura = "";
        estado.processado = true;
        estado.comandosTratados = [];
        estado.comandosPendentes = [];
        estado.comandosConhecidos = {};
        estado.comandosAvisadosAtaque = [];
        estado.comandosAvisadosNobre = [];
        guardarEstado();
        atualizarContadorBotao();
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
        const chave = obterIdComando(linha);
        const tratados = new Set(estado.comandosTratados || []);
        const pendentes = new Set(estado.comandosPendentes || []);
        if (chave && (tratados.has(chave) || pendentes.has(chave))) {
            return true;
        }

        return linhaJaTemEtiquetaNoNome(linha);
    }

    function linhaJaTemEtiquetaNoNome(linha) {
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

    function registarComandosPendentes(linhas) {
        const pendentes = new Set(estado.comandosPendentes || []);

        linhas.forEach((linha) => {
            const checkbox = linha.querySelector(SELETORES.checkboxComando);
            const chave = obterIdComando(linha);
            if (checkbox?.checked && chave) {
                pendentes.add(chave);
            }
        });

        estado.comandosPendentes = [...pendentes];
        guardarEstado();
    }

    function limparComandosPendentes() {
        estado.comandosPendentes = [];
        guardarEstado();
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
            () => document.querySelector(SELETORES.tabela) && obterLinhasTabela().length > 0,
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
            sincronizarEstado();
            await esperarTabelaIncomings();

            const tabela = document.querySelector(SELETORES.tabela);
            if (!tabela) {
                log("Tabela de incomings nao encontrada.");
                return;
            }

            const etiquetas = obterEtiquetasNormalizadas();
            obterLinhasTabela()
                .filter(linhaDoProprioJogador)
                .forEach(desmarcarParaNaoEtiquetar);
            const linhas = obterLinhasValidas();
            sincronizarComandosConhecidos(linhas);
            avisarNovosAtaques(linhas);
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
            if (selecionados > 0 && !config.modoTeste) {
                registarComandosPendentes(linhas);
            }
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
                    limparComandosPendentes();
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

    function obterTotalContadorBotao() {
        sincronizarEstado();

        if (paginaDeIncomings()) {
            return obterLinhasValidas().length;
        }

        return estado.processado
            ? Math.max(0, estado.ultimoTotalIncomings)
            : Math.max(0, obterContadorIncomings());
    }

    function atualizarContadorBotao() {
        const contador = document.querySelector("#tag-incomings-pt-panel .ti-counter-value");
        if (!contador) {
            return;
        }

        atualizarSimboloAtaques();

        const total = obterTotalContadorBotao();
        contador.textContent = total > 99 ? "99+" : (total > 0 ? String(total) : "");
        contador.hidden = total <= 0;

        const botao = contador.closest(".ti-toggle");
        botao?.setAttribute(
            "title",
            `${total} ataque(s) recebido(s) - abrir etiquetador`,
        );
        botao?.setAttribute(
            "aria-label",
            `${total} ataque(s) recebido(s). Abrir etiquetador de ataques`,
        );
    }

    function atualizarSimboloAtaques() {
        const destino = document.querySelector("#tag-incomings-pt-panel .ti-attack-symbol");
        if (!destino) {
            return;
        }

        const candidatos = [
            ...document.querySelectorAll(SELETORES.contadorIncomings),
            ...document.querySelectorAll(SELETORES.linkIncomings),
        ];
        const origem = candidatos
            .flatMap((elemento) => [
                elemento,
                ...elemento.querySelectorAll("span.icon, img"),
            ])
            .find((elemento) => {
                if (elemento.closest("#tag-incomings-pt-panel")) {
                    return false;
                }

                if (elemento.tagName === "IMG") {
                    return /attack|incoming|sword/i.test([
                        elemento.src,
                        elemento.alt,
                        elemento.title,
                        elemento.className,
                    ].join(" "));
                }

                const estilo = window.getComputedStyle(elemento);
                return /attack|incoming/i.test(String(elemento.className))
                    && estilo.backgroundImage !== "none";
            });

        if (!origem) {
            return;
        }

        if (origem.tagName === "IMG") {
            destino.style.backgroundImage = `url("${origem.src}")`;
            destino.style.backgroundPosition = "center";
            destino.style.backgroundRepeat = "no-repeat";
            destino.style.backgroundSize = "contain";
            return;
        }

        const estilo = window.getComputedStyle(origem);
        destino.style.backgroundImage = estilo.backgroundImage;
        destino.style.backgroundPosition = estilo.backgroundPosition;
        destino.style.backgroundRepeat = estilo.backgroundRepeat;
        destino.style.backgroundSize = estilo.backgroundSize;
    }

    function obterTotalAtualIncomings() {
        const totalTabela = paginaDeIncomings() ? obterLinhasValidas().length : 0;
        return Math.max(totalTabela, obterContadorIncomings());
    }

    function novoAtaqueDetectado() {
        sincronizarEstado();

        if (!paginaDeIncomings()) {
            const totalContador = obterContadorIncomings();
            if (totalContador <= 0) {
                sincronizarComandosConhecidos([]);
                atualizarEstadoSemIncomings();
                return false;
            }

            if (!estado.processado || totalContador > estado.ultimoTotalContador) {
                return true;
            }

            if (totalContador < estado.ultimoTotalContador) {
                return true;
            }

            return false;
        }

        const totalAtual = obterLinhasValidas().length;
        if (totalAtual <= 0) {
            sincronizarComandosConhecidos([]);
            atualizarEstadoIncomings([]);
            return false;
        }

        if (estado.ultimoTotalIncomings <= 0) {
            return true;
        }

        if (estado.ultimoTotalIncomings > 0 && totalAtual > estado.ultimoTotalIncomings) {
            return true;
        }

        if (totalAtual < estado.ultimoTotalIncomings) {
            return true;
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

        log("Alteracao nos ataques detetada. A processar incomings em fundo, sem redirecionar a pagina atual.");

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
            if (evento.origin !== window.location.origin) {
                return;
            }

            if (evento.data?.tipo === "tag-incomings-pt-som") {
                reproduzirSomLocal(evento.data.som, Number(evento.data.atrasoMs) || 0);
                return;
            }

            if (evento.data?.tipo !== "tag-incomings-pt-concluido") {
                return;
            }

            document.querySelector(`#${FRAME_FUNDO_ID}`)?.remove();
            sincronizarEstado();
            atualizarContadorBotao();
            log("Processamento em fundo concluido. Monitor parado ate aparecer novo ataque.");
        });

        window.addEventListener("storage", (evento) => {
            if (evento.key !== STATE_KEY) {
                return;
            }

            sincronizarEstado();
            atualizarContadorBotao();
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

    function lerBooleanoPainel(nome, raiz = document) {
        return Boolean(raiz.querySelector(`[data-ti-bool="${nome}"]`)?.checked);
    }

    function lerTextoPainel(nome, raiz = document) {
        return raiz.querySelector(`[data-ti-text="${nome}"]`)?.value?.trim() ?? "";
    }

    function lerNumeroPainel(nome, fallback, escala = 1, raiz = document) {
        const valor = Number(raiz.querySelector(`[data-ti-number="${nome}"]`)?.value);
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

    function guardarPainel(raiz = document) {
        config.ativo = lerBooleanoPainel("ativo", raiz);
        config.modoTeste = lerBooleanoPainel("modoTeste", raiz);
        config.recarregarAoTerminar = false;
        config.destacarLinhas = lerBooleanoPainel("destacarLinhas", raiz);
        config.sons.ataque = lerBooleanoPainel("somAtaque", raiz);
        config.sons.nobre = lerBooleanoPainel("somNobre", raiz);
        config.sons.cancelado = lerBooleanoPainel("somCancelado", raiz);
        config.etiquetas.ataque = lerTextoPainel("etiquetaAtaque", raiz) || CONFIG_PADRAO.etiquetas.ataque;
        config.etiquetas.apoio = lerTextoPainel("etiquetaApoio", raiz) || CONFIG_PADRAO.etiquetas.apoio;
        config.etiquetas.nobre = lerTextoPainel("etiquetaNobre", raiz) || CONFIG_PADRAO.etiquetas.nobre;
        config.formatoContagem = lerTextoPainel("formatoContagem", raiz) || CONFIG_PADRAO.formatoContagem;
        config.atrasoIncomingsMinMs = lerNumeroPainel("atrasoIncomingsMinMs", CONFIG_PADRAO.atrasoIncomingsMinMs, 1000, raiz);
        config.atrasoIncomingsMaxMs = lerNumeroPainel("atrasoIncomingsMaxMs", CONFIG_PADRAO.atrasoIncomingsMaxMs, 1000, raiz);
        config.atrasoGlobalMinMs = lerNumeroPainel("atrasoGlobalMinMs", CONFIG_PADRAO.atrasoGlobalMinMs, 1000, raiz);
        config.atrasoGlobalMaxMs = lerNumeroPainel("atrasoGlobalMaxMs", CONFIG_PADRAO.atrasoGlobalMaxMs, 1000, raiz);
        config.intervaloEdicaoMinMs = lerNumeroPainel("intervaloEdicaoMinMs", CONFIG_PADRAO.intervaloEdicaoMinMs, 1000, raiz);
        config.intervaloEdicaoMaxMs = lerNumeroPainel("intervaloEdicaoMaxMs", CONFIG_PADRAO.intervaloEdicaoMaxMs, 1000, raiz);

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

    function abrirConfiguracoesNativas(painel) {
        if (!window.Dialog || typeof window.Dialog.show !== "function") {
            return false;
        }

        const origem = painel.querySelector(".ti-config");
        const estilo = painel.querySelector("style");
        if (!origem || !estilo) {
            return false;
        }

        const dialogId = "twPtEtiquetadorAtaquesSettings";
        const cssDialogo = estilo.textContent.replaceAll(
            "#tag-incomings-pt-panel",
            "#tag-incomings-pt-dialog",
        );
        const html = `
            <div id="tag-incomings-pt-dialog">
                <style>
                    ${cssDialogo}
                    #tag-incomings-pt-dialog {
                        position: static !important;
                        font: 12px Arial, Verdana, sans-serif !important;
                    }
                    #tag-incomings-pt-dialog .ti-config {
                        position: static !important;
                        display: block !important;
                        width: min(820px, calc(100vw - 70px)) !important;
                        max-width: none !important;
                        max-height: calc(100vh - 90px) !important;
                        overflow: visible !important;
                        padding: 0 !important;
                        border: 0 !important;
                        border-radius: 0 !important;
                        background: transparent !important;
                        box-shadow: none !important;
                        transform: none !important;
                    }
                    #tag-incomings-pt-dialog .ti-content {
                        max-height: calc(100vh - 180px) !important;
                    }
                    #tag-incomings-pt-dialog .ti-backdrop,
                    #tag-incomings-pt-dialog .ti-close,
                    #tag-incomings-pt-dialog .ti-toggle {
                        display: none !important;
                    }
                </style>
                ${origem.outerHTML}
            </div>
        `;

        window.Dialog.show(dialogId, html);

        window.setTimeout(() => {
            const raiz = document.querySelector(`#popup_box_${dialogId} #tag-incomings-pt-dialog`)
                || document.querySelector("#tag-incomings-pt-dialog");
            if (!raiz || raiz.dataset.tiLigado === "1") {
                return;
            }

            raiz.dataset.tiLigado = "1";
            raiz.addEventListener("click", (evento) => {
                const acao = evento.target?.closest?.("[data-ti-action]")?.dataset?.tiAction;
                if (acao === "guardar") {
                    guardarPainel(raiz);
                }

                if (acao === "executar") {
                    guardarPainel(raiz);
                    if (paginaDeIncomings()) {
                        etiquetarIncomings();
                    } else {
                        verificarPaginaDoJogo();
                    }
                }
            });
        }, 0);

        return true;
    }

    function agendarPosicaoBotao() {
        if (posicionamentoBotaoFrame) {
            window.cancelAnimationFrame(posicionamentoBotaoFrame);
        }

        posicionamentoBotaoFrame = window.requestAnimationFrame(() => {
            posicionamentoBotaoFrame = 0;
            posicionarBotao();
        });
    }

    function posicionarBotao() {
        const painel = document.querySelector("#tag-incomings-pt-panel");
        if (!painel) {
            return;
        }

        const layout =
            document.querySelector("#main_layout td.maincell")
            || document.querySelector("td.maincell")
            || document.querySelector("#contentContainer")
            || document.querySelector("#content_value");
        let left = 12;
        const top = 280;

        if (layout) {
            const rectLayout = layout.getBoundingClientRect();
            if (rectLayout.width > 0) {
                left = Math.max(4, Math.round(rectLayout.left - 55));
            }
        }

        painel.style.setProperty("left", `${left}px`, "important");
        painel.style.setProperty("right", "auto", "important");
        painel.style.setProperty("top", `${top}px`, "important");
        painel.style.setProperty("bottom", "auto", "important");
    }

    function instalarPosicionamentoBotao() {
        window.addEventListener("resize", agendarPosicaoBotao);
        window.addEventListener("orientationchange", agendarPosicaoBotao);

        agendarPosicaoBotao();
        window.setTimeout(agendarPosicaoBotao, 250);
        window.setTimeout(agendarPosicaoBotao, 1_000);
        window.setTimeout(agendarPosicaoBotao, 3_000);
    }

    function criarPainel() {
        if (estaEmFrame() || !config.mostrarPainel || document.querySelector("#tag-incomings-pt-panel")) {
            return;
        }

        const painel = document.createElement("div");
        painel.id = "tag-incomings-pt-panel";
        painel.className = "";
        painel.innerHTML = `
            <style>
                #tag-incomings-pt-panel {
                    position: fixed !important;
                    left: 12px !important;
                    right: auto !important;
                    top: 280px !important;
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
                    position: relative !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    width: 16px !important;
                    min-width: 16px !important;
                    height: 16px !important;
                    flex: 0 0 16px !important;
                    box-sizing: border-box !important;
                    padding: 0 !important;
                    border: 0 !important;
                    background: transparent !important;
                    box-shadow: none !important;
                }
                #tag-incomings-pt-panel .ti-attack-symbol {
                    display: block !important;
                    width: 16px !important;
                    height: 16px !important;
                    flex: 0 0 16px !important;
                    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.85)) !important;
                }
                #tag-incomings-pt-panel .ti-counter-value {
                    position: absolute !important;
                    right: -5px !important;
                    bottom: -5px !important;
                    min-width: 10px !important;
                    height: 10px !important;
                    box-sizing: border-box !important;
                    padding: 0 2px !important;
                    border: 1px solid rgba(255, 255, 255, 0.65) !important;
                    border-radius: 5px !important;
                    background: rgba(32, 12, 8, 0.72) !important;
                    color: #fff !important;
                    font: bold 8px/9px Arial, sans-serif !important;
                    text-align: center !important;
                    text-shadow: 1px 1px 1px #000 !important;
                    pointer-events: none !important;
                }
                #tag-incomings-pt-panel .ti-counter-value[hidden] {
                    display: none !important;
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
                    position: fixed !important;
                    left: 50% !important;
                    top: 50% !important;
                    right: auto !important;
                    bottom: auto !important;
                    z-index: 4 !important;
                    display: none;
                    box-sizing: border-box !important;
                    width: min(900px, calc(100vw - 54px));
                    max-height: calc(100vh - 54px);
                    overflow: visible;
                    padding: 12px;
                    border: 1px solid #5b3b21;
                    border-radius: 2px;
                    background: #ead3a0;
                    color: #2b1d0e;
                    box-shadow:
                        0 0 0 2px #c7aa76,
                        0 0 0 4px #5b4026,
                        0 0 0 6px #d4bd8d,
                        0 0 0 7px #3d2a19,
                        inset 0 0 0 2px rgba(255, 248, 218, 0.7),
                        0 8px 30px rgba(0, 0, 0, 0.65);
                    transform: translate(-50%, -50%);
                }
                #tag-incomings-pt-panel.ti-open .ti-config {
                    display: block !important;
                }
                #tag-incomings-pt-panel .ti-backdrop {
                    position: fixed !important;
                    inset: 0 !important;
                    z-index: 3 !important;
                    display: none;
                    background: rgba(0, 0, 0, 0.58);
                }
                #tag-incomings-pt-panel.ti-open .ti-backdrop {
                    display: block !important;
                }
                #tag-incomings-pt-panel .ti-close {
                    position: absolute;
                    top: -17px;
                    right: -17px;
                    z-index: 5;
                    width: 22px;
                    height: 22px;
                    padding: 0;
                    cursor: pointer;
                    border: 2px solid #4c321d;
                    border-radius: 4px;
                    background: linear-gradient(to bottom, #fff4ce, #d8b873);
                    color: #28160a;
                    font: bold 19px/17px Arial, sans-serif;
                    box-shadow:
                        inset 0 1px 0 rgba(255, 255, 255, 0.75),
                        0 1px 4px rgba(0, 0, 0, 0.65);
                }
                #tag-incomings-pt-panel .ti-header {
                    padding: 12px 14px 9px;
                    border: 2px solid #9d1f18;
                    border-bottom: 1px solid #bd8d42;
                    border-radius: 3px 3px 0 0;
                    background: linear-gradient(to bottom, #f8e8bd 0%, #edd49a 100%);
                    color: #a52a22;
                }
                #tag-incomings-pt-panel .ti-header strong {
                    display: block;
                    margin-bottom: 3px;
                    font-size: 16px;
                }
                #tag-incomings-pt-panel .ti-status {
                    color: #70451f;
                    font-size: 11px;
                }
                #tag-incomings-pt-panel .ti-content {
                    border: 2px solid #9d1f18;
                    border-top: 0;
                    border-radius: 0 0 3px 3px;
                    max-height: calc(100vh - 160px);
                    overflow: auto;
                    background: #f4e4b8;
                }
                #tag-incomings-pt-panel .ti-section {
                    display: grid;
                    grid-template-columns: 185px minmax(0, 1fr);
                    gap: 18px;
                    padding: 14px;
                    border-bottom: 1px solid #d1ad65;
                    border-left: 4px solid var(--ti-section-color, #a52a22);
                }
                #tag-incomings-pt-panel .ti-section:last-child {
                    border-bottom: 0;
                }
                #tag-incomings-pt-panel .ti-section-heading {
                    color: #9d251e;
                    font-size: 13px;
                    line-height: 1.35;
                }
                #tag-incomings-pt-panel .ti-section-heading strong {
                    display: block;
                    margin-bottom: 4px;
                    text-transform: uppercase;
                }
                #tag-incomings-pt-panel .ti-section-heading small {
                    color: #5f3c1d;
                    font-size: 10px;
                }
                #tag-incomings-pt-panel .ti-fields {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 8px 18px;
                }
                #tag-incomings-pt-panel label {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px;
                    min-width: 0;
                    margin: 0;
                    font-weight: bold;
                }
                #tag-incomings-pt-panel input[type="text"],
                #tag-incomings-pt-panel input[type="number"],
                #tag-incomings-pt-panel input:not([type]) {
                    width: min(170px, 55%);
                    height: 27px;
                    box-sizing: border-box;
                    border: 1px solid #c27c24;
                    background: #fff9e6;
                    font-size: 12px;
                }
                #tag-incomings-pt-panel input[type="checkbox"] {
                    width: 14px;
                    height: 14px;
                    accent-color: #c62037;
                }
                #tag-incomings-pt-panel .ti-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                }
                #tag-incomings-pt-panel .ti-actions button {
                    min-width: 150px;
                    height: 28px;
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
                @media (max-width: 720px) {
                    #tag-incomings-pt-panel {
                        left: 5px !important;
                    }
                    #tag-incomings-pt-panel .ti-config {
                        width: calc(100vw - 24px);
                        max-height: calc(100vh - 24px);
                        padding: 8px;
                    }
                    #tag-incomings-pt-panel .ti-section {
                        grid-template-columns: 1fr;
                        gap: 10px;
                    }
                    #tag-incomings-pt-panel .ti-fields {
                        grid-template-columns: 1fr;
                    }
                    #tag-incomings-pt-panel .ti-actions {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                    }
                    #tag-incomings-pt-panel .ti-actions button {
                        min-width: 0;
                    }
                }
            </style>
            <div class="ti-backdrop" data-ti-action="fechar"></div>
            <div class="ti-config">
                <button class="ti-close" type="button" data-ti-action="fechar" title="Fechar" aria-label="Fechar">&times;</button>
                <div class="ti-header">
                    <strong>Etiquetador de ataques - ThePlaguePT</strong>
                    <div class="ti-status">${config.ativo ? "Monitor ativo" : "Monitor inativo"} - v1.0.16</div>
                </div>
                <div class="ti-content">
                    <section class="ti-section" style="--ti-section-color:#c92f2f">
                        <div class="ti-section-heading">
                            <strong>Estado</strong>
                            <small>Ativar o monitor e controlar o modo de execução.</small>
                        </div>
                        <div class="ti-fields">
                            ${criarCheckbox("Ativo", "ativo", config.ativo)}
                            ${criarCheckbox("Modo teste", "modoTeste", config.modoTeste)}
                            ${criarCheckbox("Destacar linhas", "destacarLinhas", config.destacarLinhas)}
                        </div>
                    </section>
                    <section class="ti-section" style="--ti-section-color:#d08a24">
                        <div class="ti-section-heading">
                            <strong>Sons</strong>
                            <small>Alertas distintos para novos ataques, Nobres e cancelamentos.</small>
                        </div>
                        <div class="ti-fields">
                            ${criarCheckbox("Novo ataque", "somAtaque", config.sons.ataque)}
                            ${criarCheckbox("Nobre detetado", "somNobre", config.sons.nobre)}
                            ${criarCheckbox("Ataque cancelado", "somCancelado", config.sons.cancelado)}
                        </div>
                    </section>
                    <section class="ti-section" style="--ti-section-color:#2588b8">
                        <div class="ti-section-heading">
                            <strong>Etiquetas</strong>
                            <small>Nomes utilizados para identificar cada tipo de comando.</small>
                        </div>
                        <div class="ti-fields">
                            ${criarCampoTexto("Ataque", "etiquetaAtaque", config.etiquetas.ataque)}
                            ${criarCampoTexto("Apoio", "etiquetaApoio", config.etiquetas.apoio)}
                            ${criarCampoTexto("Nobre", "etiquetaNobre", config.etiquetas.nobre)}
                            ${criarCampoTexto("Formato", "formatoContagem", config.formatoContagem)}
                        </div>
                    </section>
                    <section class="ti-section" style="--ti-section-color:#8a63a8">
                        <div class="ti-section-heading">
                            <strong>Verificação</strong>
                            <small>Intervalos aleatórios em segundos para reduzir pedidos ao servidor.</small>
                        </div>
                        <div class="ti-fields">
                            ${criarCampoNumero("Página min", "atrasoIncomingsMinMs", config.atrasoIncomingsMinMs)}
                            ${criarCampoNumero("Página max", "atrasoIncomingsMaxMs", config.atrasoIncomingsMaxMs)}
                            ${criarCampoNumero("Global min", "atrasoGlobalMinMs", config.atrasoGlobalMinMs)}
                            ${criarCampoNumero("Global max", "atrasoGlobalMaxMs", config.atrasoGlobalMaxMs)}
                            ${criarCampoNumero("Editar min", "intervaloEdicaoMinMs", config.intervaloEdicaoMinMs)}
                            ${criarCampoNumero("Editar max", "intervaloEdicaoMaxMs", config.intervaloEdicaoMaxMs)}
                        </div>
                    </section>
                    <section class="ti-section" style="--ti-section-color:#59a85b">
                        <div class="ti-section-heading">
                            <strong>Ações</strong>
                            <small>Guardar preferências ou executar imediatamente.</small>
                        </div>
                        <div class="ti-actions">
                            <button type="button" data-ti-action="guardar">Guardar</button>
                            <button type="button" data-ti-action="executar">Executar</button>
                        </div>
                    </section>
                </div>
            </div>
            <button class="ti-toggle" type="button" data-ti-action="toggle" title="${config.painelAberto ? "Fechar configuracoes" : "Configurar etiquetador"}" aria-label="Configurar etiquetador de ataques" aria-expanded="${config.painelAberto ? "true" : "false"}">
                <span class="ti-toggle-icon" aria-hidden="true">
                    <span class="icon header attack ti-attack-symbol"></span>
                    <span class="ti-counter-value" hidden></span>
                </span>
                <span class="ti-toggle-label">Etiquetador de ataques</span>
            </button>
        `;

        painel.addEventListener("click", (evento) => {
            const controlo = evento.target?.closest?.("[data-ti-action]");
            const acao = controlo?.dataset?.tiAction;
            if (acao === "toggle") {
                if (abrirConfiguracoesNativas(painel)) {
                    return;
                }

                config.painelAberto = !config.painelAberto;
                painel.classList.toggle("ti-open", config.painelAberto);
                controlo.setAttribute("aria-expanded", config.painelAberto ? "true" : "false");
                controlo.setAttribute("title", config.painelAberto ? "Fechar configuracoes" : "Configurar etiquetador");
                guardarConfig();
                return;
            }

            if (acao === "fechar") {
                config.painelAberto = false;
                painel.classList.remove("ti-open");
                const toggle = painel.querySelector('[data-ti-action="toggle"]');
                toggle?.setAttribute("aria-expanded", "false");
                toggle?.setAttribute("title", "Configurar etiquetador");
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
        instalarPosicionamentoBotao();
        atualizarContadorBotao();
    }

    function iniciar() {
        instalarListenerFrameFundo();
        instalarDesbloqueioAudio();
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
