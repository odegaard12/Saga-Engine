# -*- coding: utf-8 -*-
"""11/11/2026: arreglos de la auditoría en el cliente (entrada, laberinto, Caza-Señales, GPS, apertura del nodo).

La lógica pura se ejecuta en tests/js/auditoria_11_11.cjs; lo que vive dentro de un componente o del service worker
se comprueba en el código fuente. El servidor tiene sus pruebas aparte: test_cookie_de_mision_caduca_11_11.py,
test_ok_exige_entrada_11_11.py y test_mapa3d_zona.py.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"
SRC = FRONT / "src"


def leer(*partes):
    return (FRONT.joinpath(*partes)).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def datos():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "auditoria_11_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


# --- 4 · Entrada («crítico»: nunca «PIN incorrecto» si el fallo no es el PIN) --------------------------------------


def test_solo_un_403_wrong_es_incorrecto(datos):
    e = datos["entrada"]
    assert e["pinMal"] == ["incorrecto", None] and e["claveMal"] == ["incorrecto", None]
    # Todo lo demás NO culpa al PIN ni a la clave.
    assert e["origen"][0] == "rechazada" and e["sinDetalle403"][0] == "rechazada" and e["otro"][0] == "rechazada"
    assert e["claveCaducada"][0] == "clave-de-mision"
    assert e["caido502"][0] == "sin-red" and e["caido530"][0] == "sin-red"


def test_el_429_dice_cuanto_hay_que_esperar(datos):
    e = datos["entrada"]
    assert e["pinBloqueado"] == ["demasiados", 420]  # «retry in 420s» del bloqueo del PIN
    assert e["limitador"] == ["demasiados", 7]  # cabecera Retry-After del limitador general
    assert e["sinSegundos"] == ["demasiados", None]
    assert e["espera"] == ["7 s", "89 s", "7 min"]


def test_entrar_de_punta_a_punta(datos):
    assert datos["entradaPuntaAPunta"] == {
        "ok": "dentro", "pinMal": "incorrecto", "caido": "sin-red", "clave": "clave-de-mision", "sinRed": "sin-red",
    }


def test_la_pantalla_de_entrada_usa_esos_motivos_y_tiene_limite_de_tiempo():
    api = leer("src", "shared", "api.ts")
    cuerpo = api[api.index("async function pedirEntrada"):api.index("export function entrarComoJugador")]
    assert "withTimeoutSignal(8000)" in cuerpo and "signal: timeout.signal" in cuerpo
    login = leer("src", "login", "LoginApp.tsx")
    entrar = login[login.index("async function entrarConPin"):login.index("return (", login.index("async function entrarConPin"))]
    # «PIN incorrecto» sólo con el motivo `incorrecto`; ya no es el cajón de sastre.
    assert entrar.count("copy.pinWrong") == 1 and "f?.motivo === 'incorrecto' ? copy.pinWrong" in entrar
    assert "copy.pinClave" in entrar and "copy.pinRechazado" in entrar and "copy.pinLockedEspera" in entrar
    assert "f?.motivo === 'sin-red' ? ''" in entrar  # sin red o servidor caído: se entra con lo guardado
    for texto in ("pinClave", "pinRechazado", "pinLockedEspera"):
        assert login.count(texto + ":") == 2, texto  # es y gl
    puerta = leer("src", "shared", "PuertaDeMision.tsx")
    assert "f?.motivo === 'incorrecto'" in puerta and puerta.count("muchosEspera: (espera)") == 2


# --- 5 · Laberinto ---------------------------------------------------------------------------------------------


def test_los_niveles_4_y_5_ya_son_de_15_y_17(datos):
    por_lado = {}
    for lab in datos["laberintos"]:
        por_lado.setdefault(lab["pedido"], []).append(lab)
    for lado in (9, 11, 13, 15, 17):
        assert all(l["filas"] == lado and l["cols"] == lado for l in por_lado[lado]), lado
    assert all(l["filas"] == 17 for l in por_lado[25])  # tope: 17, como el servidor y la pantalla
    assert all(l["meta"] and l["objetos"] for l in datos["laberintos"]), "todos se pueden terminar"
    # La tabla de niveles pide de verdad esos tamaños.
    niveles = leer("src", "player", "minigames", "core", "niveles.generado.ts")
    trozo = niveles[niveles.index('"tilt_maze"'):][:3000]
    assert re.findall(r'"grid_rows": (\d+),\s*"grid_cols": (\d+)', trozo) == [
        ("9", "9"), ("11", "11"), ("13", "13"), ("15", "15"), ("17", "17")]


def test_la_bola_no_se_desliza_al_volver_al_inicio(datos):
    assert datos["vecinas"] == [True, True, False, False, True]
    pantalla = leer("src", "player", "minigames", "families", "tiltMaze", "RuntimeScreen.tsx")
    assert "transition: esSalto ? 'none' : undefined" in pantalla


# --- 9 y 10 · Caza-Señales -----------------------------------------------------------------------------------------


def test_caza_senales_respeta_el_cero_y_perdona_el_toque_tardio(datos):
    r = datos["radar"]
    assert r["cero"] == [0, 0], "«sin señales falsas» y «sin penalización» se respetan"
    assert r["falta"] == [0.28, 0.28, 0.28] and r["basura"] == [0.28, 0.28] and r["valor"] == 0.4
    assert r["reciente"] is True and r["tarde"] is False and r["lejos"] is False and r["vacio"] is False
    assert 150 <= r["gracia"] <= 400
    pantalla = leer("src", "player", "minigames", "families", "sparkRadar", "RuntimeScreen.tsx")
    assert "readNumberOCero(config, 'echo_ratio', 0.28)" in pantalla
    assert "readNumberOCero(config, 'echo_penalty_s', 2)" in pantalla
    vacio = pantalla[pantalla.index("function tapVacio"):pantalla.index("function tapSpark")]
    assert vacio.index("tocaSenalRecienApagada") < vacio.index("sumarFallo()")
    assert "s.kind === 'signal'" in pantalla  # sólo se perdona una señal REAL, no una falsa


# --- 7 · GPS ---------------------------------------------------------------------------------------------------


def test_gps_la_lectura_barata_no_pisa_a_la_de_satelite(datos):
    g = datos["gps"]
    assert g["barataTrasBuena"] is True and g["barataTrasUnMinuto"] is False
    assert g["baileNormal"] == [False, False] and g["malaTrasMala"] is False
    assert g["sinPrecision"] == [False, False, False]


def test_gps_sube_a_preciso_con_una_lectura_fiable_cerca(datos):
    g = datos["gps"]
    assert g["subir"] is True and g["subirEnElBorde"] is True
    assert g["lejos"] is False and g["pocoFiable"] is False and g["sinDatos"] == [False, False]
    assert g["yaPreciso"] is False and g["porRed"] is False
    gancho = leer("src", "player", "hooks", "useGpsDelJugador.ts")
    exito = gancho[gancho.index("function onSuccess"):gancho.index("function cambiarAModoPorRed")]
    assert "!esLecturaMuchoPeor(previo, nextAccuracy, ahoraFix)" in exito
    assert "debeSubirAPreciso(gpsModoRef.current, distanciaAlNodoRef.current" in exito


# --- 1 · La apertura del nodo viaja con el avance ----------------------------------------------------------------


def test_la_apertura_del_nodo_va_en_la_evidencia(datos):
    assert datos["apertura"] == {"sin": False, "con": True, "estable": True, "otroNodo": False, "vacia": False}
    app = leer("src", "player", "PlayerApp.tsx")
    entrar = app[app.index("function proceedToInteraction"):]
    # Antes de CUALQUIER rama (coleccionable, historia, punto de control, hoja).
    assert entrar.index("marcarApertura(currentStage?.id)") < entrar.index("if (isMapCollectible)")
    decisiones = leer("src", "player", "avance", "decisiones.ts")
    assert "'invalid_completion_code:not_opened'" in decisiones
    # Los móviles (también con la aplicación vieja) lo tratan como rechazo definitivo: no reintentan en bucle.
    pack = leer("src", "player", "offline", "missionPack.ts")
    assert "'invalid_completion_code'," in pack[pack.index("const RECHAZOS_DEFINITIVOS"):][:400]


# --- 6 · Modo ahorro en caliente -----------------------------------------------------------------------------------


def test_el_latido_rehace_su_intervalo_al_cambiar_el_ahorro():
    latido = leer("src", "player", "hooks", "useLatidoYCola.ts")
    assert "window.addEventListener(EVENTO_AHORRO, programarLatido)" in latido
    assert "window.removeEventListener(EVENTO_AHORRO, programarLatido)" in latido
    programar = latido[latido.index("const programarLatido"):][:400]
    assert "window.clearInterval(intervalId)" in programar and "ahorroActivo(window.localStorage)" in programar
    conmutadores = leer("src", "player", "components", "conmutadoresMapa.ts")
    vigilar = conmutadores[conmutadores.index("export function vigilarBateria"):]
    assert "avisarCambioDeAhorro()" in vigilar  # la batería que cruza el 20 % avisa
    hud = leer("src", "player", "components", "PlayerHud.tsx")
    boton = hud[hud.index("window.localStorage.setItem(CLAVE_AHORRO, siguiente)"):][:900]
    assert "avisarCambioDeAhorro()" in boton
    assert "al volver a abrirlo" in hud  # el botón dice cuándo se nota


# --- 8 y 12 · Service worker y fotos guardadas ---------------------------------------------------------------------


def test_el_sw_no_guarda_la_tesela_en_blanco_de_fuera_de_zona():
    sw = leer("public", "sw.js")
    valida = sw[sw.index("function esTeselaValida"):sw.index("function esJsonValido")]
    assert "response.headers.get('X-Saga-Tesela') !== 'fuera-de-zona'" in valida
    servidor = (RAIZ / "backend" / "app" / "routers" / "public.py").read_text(encoding="utf-8")
    assert '"X-Saga-Tesela": "fuera-de-zona"' in servidor  # la cabecera que mira existe


def test_las_fotos_guardadas_se_quitan_solo_si_el_servidor_niega_el_acceso():
    gancho = leer("src", "player", "hooks", "useFotosDeCampo.ts")
    cargar = gancho[gancho.index("async function cargar"):gancho.index("void cargar()")]
    # Sin red (o sin cobertura) se sale ANTES de pedir nada: las fotos guardadas se siguen viendo.
    assert cargar.index("navigator.onLine === false") < cargar.index("fetchFieldProofs(user)")
    # 13/11: sólo 401, o 403 con el motivo de sesión (un filtro de origen o el WAF también dan 403).
    assert "status === 401 || (status === 403 &&" in cargar
    assert cargar.index("status === 401 || (status === 403 &&") < cargar.index("olvidarFotosPersonales()")
    cache = leer("src", "player", "offline", "fieldProofCache.ts")
    olvidar = cache[cache.index("export async function olvidarFotosPersonales"):][:900]
    assert "'/api/field-proofs/'" in olvidar and "'/api/player-avatar/'" in olvidar
    assert "node-photo" not in olvidar and "stage" not in olvidar  # las fotos de los nodos se quedan
    api = leer("src", "shared", "api.ts")
    lista = api[api.index("export async function fetchFieldProofs"):][:900]
    assert "status: res.status," in lista and "detail: typeof cuerpo?.detail" in lista  # 13/11: con el motivo


# --- 11 · Patrón de luces: nada arranca con la app oculta ---------------------------------------------------------


def test_el_patron_no_se_ensena_con_la_app_oculta():
    pantalla = leer("src", "player", "minigames", "families", "circuitMatrix", "RuntimeScreen.tsx")
    cuenta = pantalla[pantalla.index("setCuentaAtras((valor) => {"):][:400]
    assert "document.visibilityState === 'hidden') return valor" in cuenta
    previa = pantalla[pantalla.index("if (phase !== 'preview') return undefined"):][:500]
    assert previa.index("document.visibilityState === 'hidden'") < previa.index("const alCambiar")


# --- 14 · Barras con transform -------------------------------------------------------------------------------------


def test_las_barras_de_los_juegos_animan_transform():
    radar = leer("src", "player", "minigames", "families", "sparkRadar", "RuntimeScreen.tsx")
    assert "transform: `scaleX(${progress})`" in radar and "transition: 'width" not in radar
    mosaico = leer("src", "player", "minigames", "families", "placeMosaic", "RuntimeScreen.tsx")
    vista = mosaico[mosaico.index(".mosaic-preview-progress i {"):][:400]
    assert "transition: transform .1s linear" in vista and "transform-origin: left" in vista
    assert "transform: `scaleX(${previewProgress / 100})`" in mosaico
