# -*- coding: utf-8 -*-
"""Dar un nodo por superado: la decisión más cara del juego.

Vivía en `handleSubmitCode`, 341 líneas en medio de `PlayerApp.tsx`, mezcladas
con los avisos, el reloj del nodo, la mochila y dos ciclos de red. Es lo que
decide si un jugador avanza o se queda parado en el monte, y no tenía una sola
prueba porque no había por dónde cogerla.

Casi todo lo que se fija aquí salió de un fallo de campo, no de leer el código:

  - el marcador en 00:00 después de superar un nodo,
  - un error del servidor que el móvil contaba como "sin cobertura" y que así
    se escondió durante una partida entera,
  - un "se sincronizará cuando vuelva la red" que era mentira, con el jugador
    esperando algo que no iba a pasar,
  - un 'OK' aceptado dos veces en el mismo tick que completaba varios nodos
    seguidos.

Se comprueba leyendo el fuente porque no hay Node en todas las máquinas donde
corren estos tests. Eso no ejecuta nada: lo que fija son los números y la forma
de las decisiones, que es donde estaba el peligro. La prueba que de verdad vale
sigue siendo caminar la ruta.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
AVANCE = RAIZ / "frontend" / "src" / "player" / "avance"
DECISIONES = AVANCE / "decisiones.ts"
ENVIAR = AVANCE / "enviarCodigo.ts"
JUGADOR = RAIZ / "frontend" / "src" / "player" / "PlayerApp.tsx"


def sin_comentarios(fichero: Path) -> str:
    texto = fichero.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def cuerpo(codigo: str, firma: str, largo: int = 900) -> str:
    """El trozo que empieza en `firma`, sin colarse en lo siguiente.

    Sin el corte, una ventana de más leía la función de al lado y la prueba
    pasaba por lo que dice otra: exactamente el fallo que buscan estas pruebas.
    """
    inicio = codigo.index(firma)
    trozo = codigo[inicio + len(firma) : inicio + largo]

    siguiente = re.search(r"\nexport (function|type|const|interface) ", trozo)
    if siguiente:
        trozo = trozo[: siguiente.start()]

    return firma + trozo


# --- Lo que se le suma al reloj -------------------------------------------


def test_o_tempo_nunca_resta():
    """Un reloj que va hacia atrás bajaría el total del jugador.

    Los dos sumandos vienen de fuera: el tiempo lo mide el minijuego y la
    penalización la pone el anti-trampas. Ninguno puede restar.
    """
    codigo = sin_comentarios(DECISIONES)
    suma = cuerpo(codigo, "export function tiempoQueSuma", 400)

    assert suma.count("Math.max(0, Math.round(") == 2, (
        "los dos sumandos tienen que estar protegidos, no sólo uno"
    )


def test_o_marcador_sobe_antes_de_preguntar_a_ninguen():
    """El nodo superado con 00:00 fue un fallo de campo, no una teoría.

    El servidor ya tiene el tiempo anotado cuando contesta, pero volver a
    preguntárselo es un viaje más y sin cobertura no vuelve.
    """
    codigo = sin_comentarios(ENVIAR)
    envio = cuerpo(codigo, "const sumado = tiempoQueSuma", 300)

    assert envio.index("sumarAlMarcador") < envio.index("refrescarPartida"), (
        "el marcador se pinta antes de pedirle la partida al servidor"
    )


def test_hai_un_segundo_repaso():
    """La primera lectura llega mientras el servidor aún anota el tiempo.

    Traía el total de ANTES —00:00 en el primer nodo— y no se corregía hasta el
    refresco de los treinta segundos.
    """
    codigo = sin_comentarios(ENVIAR)

    repaso = re.search(r"SEGUNDO_REPASO_MS = (\d+)", codigo)
    assert repaso, "no se encontró el segundo repaso"
    assert 500 <= int(repaso.group(1)) <= 3000
    assert "window.setTimeout" in codigo


def test_sen_cobertura_o_total_previo_sae_do_que_esta_en_pantalla():
    """La partida que calcula el móvil trae el último total del servidor.

    Sumarle encima el tiempo del nodo contaría dos veces lo mismo en cuanto
    volviese la cobertura.
    """
    codigo = sin_comentarios(ENVIAR)

    assert "totalPrevio(payload)" in codigo
    assert "totalPrevio(localResult.payload)" not in codigo


# --- Cuando el servidor dice que no ---------------------------------------


def test_behind_non_se_da_por_bo():
    """`behind` es "no he avanzado": el servidor va por detrás del móvil.

    Antes llegaba como `ok` y aquí sólo se miraba `status`, así que el nodo se
    perdía sin que nadie se enterase.
    """
    codigo = sin_comentarios(ENVIAR)
    rama = cuerpo(codigo, "if (result.status === 'behind')", 300)

    assert "throw" in rama, "seguir adelante con un `behind` es perder el nodo"


def test_un_estado_distinto_de_ok_non_avanza():
    codigo = sin_comentarios(ENVIAR)
    rama = cuerpo(codigo, "if (result.status !== 'ok')", 300)

    assert "return false" in rama


# --- Un servidor roto no es el monte sin antena ---------------------------


def test_distinguese_o_servidor_roto_do_monte_sen_antena():
    """Todo caía junto y el jugador leía siempre "sin conexión".

    Así se escondió un error de backend durante una partida entera: en el móvil
    todo iba bien y en el servidor no existía.
    """
    codigo = sin_comentarios(DECISIONES)
    culpa = cuerpo(codigo, "export function culparDelFallo", 600)

    assert ">= 500" in culpa
    assert "=== 401" in culpa and "=== 403" in culpa


def test_sen_numero_de_estado_non_se_acusa_ao_servidor():
    """Un `fetch` que no llega no trae respuesta, y eso sí es el monte."""
    codigo = sin_comentarios(DECISIONES)
    culpa = cuerpo(codigo, "export function culparDelFallo", 600)

    assert "typeof estado === 'number'" in culpa


def test_o_aviso_conta_o_que_pasou_de_verdade():
    """Lo primero se arregla caminando; lo segundo hay que mirarlo."""
    codigo = sin_comentarios(DECISIONES)
    aviso = cuerpo(codigo, "export function avisoDeAvanceSinServidor", 1200)

    assert "El servidor ha fallado" in aviso
    assert "Se ha renovado el pase" in aviso
    assert "sin conexión" in aviso

    assert "tono: 'warn'" in aviso, "un servidor caído no se cuenta en verde"


# --- El callejón sin salida -----------------------------------------------


def test_sen_nodo_activo_o_codigo_apuntase_pero_non_avanza_a_ninguen():
    """El servidor sólo hace progresar con un nodo completado.

    El mensaje decía "se sincronizará cuando vuelva la red", que es mentira y
    de las caras: el jugador se queda tranquilo esperando algo que no va a
    pasar en vez de volver a intentarlo.
    """
    codigo = sin_comentarios(DECISIONES)
    rechazo = cuerpo(codigo, "export function rechazoLocal", 1400)

    assert "apuntarCodigo: true" in rechazo
    assert rechazo.count("apuntarCodigo: false") == 2, (
        "sólo el caso sin nodo activo deja constancia del código"
    )
    assert "queda anotado para el organizador" in rechazo
    assert "sincroniza" not in rechazo.lower(), (
        "no se promete una sincronización que no va a ocurrir"
    )


def test_so_se_apunta_o_codigo_cando_non_hai_onde_aplicalo():
    codigo = sin_comentarios(ENVIAR)
    rama = cuerpo(codigo, "if (rechazo.apuntarCodigo)", 500)

    assert "queueManualCode" in rama


# --- Dos envíos a la vez ---------------------------------------------------


def test_o_candado_espera_en_vez_de_descartar():
    """Descartar era perder la lectura del QR; el envío dura décimas."""
    codigo = sin_comentarios(ENVIAR)

    espera = re.search(r"ESPERA_MAXIMA_MS = (\d+)", codigo)
    assert espera, "no se encontró la espera del candado"
    assert 2000 <= int(espera.group(1)) <= 8000

    assert "while (candado.current && Date.now() < hasta)" in codigo
    assert "if (candado.current) return false" in codigo


def test_o_candado_solta_sempre():
    """Si se queda cogido, el jugador no vuelve a poder enviar nada."""
    codigo = sin_comentarios(ENVIAR)
    final = cuerpo(codigo, "} finally {", 300)

    assert "candado.current = false" in final
    assert "setSubmitting(false)" in final


# --- El nodo coleccionable -------------------------------------------------


def test_a_cantidade_recollida_ten_tope():
    """La cantidad sale del editor: un dedo de más pone 1 000 gemas."""
    codigo = sin_comentarios(DECISIONES)
    objeto = cuerpo(codigo, "export function objetoDelNodo", 800)

    tope = re.search(r"Math\.max\(1, Math\.min\((\d+), Number\(rawQuantity\)", objeto)
    assert tope, "no se encontró el tope de la cantidad"
    assert 1 < int(tope.group(1)) <= 99


def test_so_se_recolle_co_codigo_do_nodo_coleccionable():
    codigo = sin_comentarios(ENVIAR)

    assert "entorno.esColeccionable && currentStage && code === 'OK'" in codigo


# --- La mochila antes de validar ------------------------------------------


def test_a_mochila_sobe_antes_de_que_o_servidor_valide():
    """El servidor validaba con un inventario viejo y respondía que faltaba un
    objeto que el jugador acababa de fabricar. La partida avanzaba sólo en el
    móvil: clasificación y panel se quedaban en el nodo anterior.
    """
    codigo = sin_comentarios(ENVIAR)

    assert codigo.index("syncInventoryToServer") < codigo.index("await advancePlayer(")
    assert "forzar: true" in codigo, (
        "el atajo de 'no ha cambiado' no vale: el servidor valida con esta mochila"
    )


# --- El reloj del nodo -----------------------------------------------------


def test_o_reloxo_do_nodo_pechase_haia_ou_non_servidor():
    """Un reloj abierto se arrastra al nodo siguiente."""
    codigo = sin_comentarios(ENVIAR)

    assert codigo.count("cerrarNodo(payload.user, entorno.claveDelNodo)") == 2, (
        "con servidor y sin servidor: los dos caminos cierran el nodo"
    )


# --- Que no vuelva a crecer dentro de PlayerApp ---------------------------


def test_playerapp_xa_non_ten_a_copia():
    """Si vuelve a llamar al avance por su cuenta, vuelve a haber dos verdades."""
    codigo = sin_comentarios(JUGADOR)

    assert "enviarCodigo(" in codigo
    for suelto in ("advancePlayer(", "advanceLocalProgress(", "queueManualCode("):
        assert suelto not in codigo, f"{suelto} tiene que decidirse en avance/"


def test_handlesubmitcode_e_so_cableado():
    """Eran 341 líneas. Lo que quede aquí sólo puede ser conectar cables."""
    codigo = JUGADOR.read_text(encoding="utf-8")

    inicio = codigo.index("async function handleSubmitCode(")
    resto = codigo[inicio:]
    fin = resto.index("\n  }\n")
    lineas = resto[:fin].count("\n")

    assert lineas < 70, f"handleSubmitCode ha vuelto a crecer: {lineas} líneas"


def test_a_partida_sen_servidor_repinta_o_mapa():
    """El nodo cambia de sitio en el mapa aunque no haya red."""
    codigo = sin_comentarios(JUGADOR)
    cable = cuerpo(codigo, "ponerPartidaSinServidor:", 700)

    assert "setMapRefreshToken" in cable
