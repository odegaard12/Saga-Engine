# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, parte del jugador en el campo (J2, J5, J10,
J12, J16, J18 y S11 cliente).

Lo que se puede ejecutar SE EJECUTA: `tests/js/logica_jugador.cjs` carga en Node
los módulos TS que no dependen de React (el núcleo del anti-trampas, el gestor
del Wake Lock, la clasificación, las notas del Simón, los textos y el puente de
idioma con un DOM de mentira) y vuelca en JSON lo que hacen. Lo que sólo existe
dentro de un componente de React (que la hoja pase `open` al anti-trampas, que
el laberinto avise antes de pedir el permiso) no se puede ejecutar sin un
navegador, y se comprueba por el código, como el resto de pruebas del repo; un
E2E integrado lo cubre después.

Si no hay Node o no están instaladas las dependencias del frontend, las pruebas
de comportamiento se saltan, no fallan.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"
JUGADOR = FRONT / "player"
COMPONENTES = JUGADOR / "components"
HOOKS = JUGADOR / "hooks"
JUEGOS = JUGADOR / "minigames"
FAMILIAS = JUEGOS / "families"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


def sin_comentarios(ruta: Path) -> str:
    texto = leer(ruta)
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"(?m)^\s*//[^\n]*", "", texto)


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node para ejecutar la lógica del jugador")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    res = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "logica_jugador.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=180, cwd=str(RAIZ),
    )
    assert res.returncode == 0, res.stderr[-3000:]
    return json.loads(res.stdout)


# ---------------------------------------------------------------------------
# J5: el autobloqueo no es hacer trampa; el anti-trampas sigue vigilando lo demás
# ---------------------------------------------------------------------------


def test_un_movil_que_se_apaga_solo_no_cuenta_como_salida(js):
    s = js["salidas"]
    # Nadie tocaba la pantalla desde hacía 40 s: es el autobloqueo.
    assert s["autobloqueo"] is None
    # Quien tocó hace 2 s y se fue 5 s, sí: se sigue detectando el cambio de app.
    assert s["deliberada"] == {"motivo": "salio_app", "at": 5000}
    assert s["selectorApps"]["motivo"] == "selector_apps"


def test_la_ventana_de_interaccion_es_mas_corta_que_el_autobloqueo_mas_corto(js):
    s = js["salidas"]["constantes"]
    # Android permite 15 s de autobloqueo como mínimo: la ventana tiene que caber debajo.
    assert 3_000 <= s["ventanaMs"] < 15_000
    assert js["salidas"]["bordeVentanaDentro"] is not None
    assert js["salidas"]["bordeVentanaFuera"] is None


def test_se_mantiene_la_regla_de_1500_ms(js):
    s = js["salidas"]
    assert s["constantes"]["minimaMs"] == 1500
    assert s["cortaMenosDe1500"] is None
    assert s["justo1500"] is not None
    assert s["constantes"]["penalizacionMs"] == 30_000


def test_la_propia_app_pidiendo_un_permiso_no_cuenta(js):
    assert js["salidas"]["permisoPropio"] is None


def test_en_las_reglas_o_el_resultado_no_hay_nada_que_vigilar(js):
    s = js["salidas"]
    assert s["sinReto"] is None
    # Pero una salida que empezó con el reto delante se cuenta aunque el juego
    # pase a «fallado» mientras la página está oculta (lo hace el laberinto).
    assert s["cuentaAunqueElJuegoCambieDeFase"] is not None


def test_la_primera_senal_de_una_salida_manda(js):
    p = js["salidas"]["primeraSenalManda"]
    assert p["motivo"] == "selector_apps"
    assert p["segundoTerminar"] is None


def test_inclinar_el_movil_no_es_tocar_la_pantalla(js):
    i = js["interaccion"]
    assert "deviceorientation" not in i["tiposActivos"] and "devicemotion" not in i["tiposActivos"]
    assert {"pointerdown", "touchstart", "keydown", "click"} <= set(i["tiposActivos"])
    assert i["recienteSinToques"] is False
    assert i["recienteTrasToque"] is True
    assert i["recienteDiezSegundosDespues"] is False
    # Mover el móvil (sensor) no renueva la última pulsación.
    assert i["recientesTrasMoverElMovil"] is False


def test_los_oyentes_de_toques_se_cuentan_y_se_sueltan(js):
    i = js["interaccion"]
    assert i["oyentesTrasPrimero"] == i["oyentesTrasSegundo"] == i["oyentesTrasSoltarUno"] > 0
    assert i["oyentesTrasSoltarTodo"] == 0


def test_la_regla_de_salida_deliberada_junta_permiso_y_toque(js):
    i = js["interaccion"]
    assert i["deliberadaSiTodoBien"] is True
    assert i["noDeliberadaSinToque"] is False
    assert i["noDeliberadaEnPermiso"] is False


# ---------------------------------------------------------------------------
# J5: Wake Lock
# ---------------------------------------------------------------------------


def test_el_wake_lock_lleva_la_cuenta_del_mapa_y_de_la_hoja(js):
    c = js["wakeLock"]["cuenta"]
    assert c["trasDos"]["peticiones"] == 1 and c["trasDos"]["usos"] == 2 and c["trasDos"]["tipo"] == "screen"
    # Soltar uno de los dos no suelta la pantalla.
    assert c["trasSoltarUno"]["retenido"] is True and c["trasSoltarUno"]["soltados"] == 0
    assert c["alFinal"]["retenido"] is False and c["alFinal"]["soltados"] == 1
    assert c["oyentesAlFinal"] == 0


def test_el_wake_lock_se_vuelve_a_pedir_al_volver_a_la_app(js):
    o = js["wakeLock"]["ocultarYVolver"]
    assert o["estando"]["retenido"] is False and o["estando"]["peticiones"] == 1
    assert o["alVolver"]["retenido"] is True and o["alVolver"]["peticiones"] == 2
    p = js["wakeLock"]["pedirOculta"]
    assert p["alPedirOculta"] == 0 and p["alVolver"] == 1


def test_el_wake_lock_rechazado_no_rompe_y_se_reintenta_con_freno(js):
    r = js["wakeLock"]["rechazada"]
    assert r["trasRechazo"]["retenido"] is False and r["trasRechazo"]["pidiendo"] is False
    assert r["toqueDentroDelFreno"] == 1, "no debe insistir en cada toque"
    assert r["toqueTrasElFreno"] == 2


def test_sin_soporte_de_wake_lock_no_pasa_nada(js):
    s = js["wakeLock"]["sinSoporte"]
    assert s["soportado"] is False
    assert s["lanzoElQueNoLoSoporta"] is False and s["lanzoElQueLanza"] is False


def test_un_wake_lock_que_llega_tarde_se_suelta_solo(js):
    t = js["wakeLock"]["sueltoAntesDeLlegar"]
    assert t["soltadoAlLlegar"] == 1 and t["estado"]["retenido"] is False


# ---------------------------------------------------------------------------
# J10: el mapa no late con algo encima
# ---------------------------------------------------------------------------


def test_el_mapa_sabe_cuando_algo_lo_tapa(js):
    c = js["cobertura"]
    assert c["inicial"] is False and c["conDos"] is True
    # Soltar dos veces la misma no destapa la del otro.
    assert c["conUnoTrasSoltarDosVeces"] is True
    assert c["alFinal"] is False
    assert c["avisos"] == [True, False]
    assert c["avisosTrasDejarDeEscuchar"] == 2


def test_el_pulso_del_mapa_se_para_con_una_hoja_encima():
    mapa = sin_comentarios(COMPONENTES / "MapSurfaceGL.tsx")
    inicio = mapa.index("const latir = () => {")
    latir = mapa[inicio : inicio + 3500]
    assert "const cubierto = mapaCubierto()" in latir
    assert "!cubierto && document.visibilityState === 'visible'" in latir
    # Cubierto, mira cada medio segundo en vez de diez veces por segundo.
    assert "window.setTimeout(latir, cubierto ? 500 : 100)" in latir
    # La capa 3D de los nodos también se pausa, y la pantalla se mantiene encendida.
    assert "capaNodosRef.current?.pausar(" in mapa and "alCambiarCoberturaDelMapa(" in mapa
    assert "useWakeLock(true)" in mapa
    assert "dejarDeVigilarCobertura()" in mapa


@pytest.mark.parametrize(
    "fichero",
    [
        "InteractionSheet.tsx",
        "SwipeableSheet.tsx",
        "MissionCompleteScreen.tsx",
        "FieldCameraCapture.tsx",
        "FieldPhotoViewer.tsx",
        "StoryModal.tsx",
        "UseItemOverlay.tsx",
    ],
)
def test_lo_que_tapa_el_mapa_lo_declara(fichero):
    codigo = sin_comentarios(COMPONENTES / fichero)
    assert "useCubreElMapa(" in codigo, f"{fichero} tapa el mapa y no lo dice"


def test_el_diagnostico_de_pixeles_ya_no_corre_en_cada_fotograma():
    capa = sin_comentarios(COMPONENTES / "nodosTresD.ts")
    # gl.readPixels sólo se llama desde `leer`, y `leer` sólo hay con el diagnóstico encendido.
    assert capa.count("gl.readPixels(") == 1
    assert "const px = diagnostico && ultimoClip" in capa
    assert "const antes = px ? leer() : []" in capa
    assert "if (px) diagnosticoPixel =" in capa
    assert "if (diagnostico && piezas.length && piezas[0].grupo.visible)" in capa
    # Apagado de serie: sólo el asa de depuración lo enciende.
    assert "let diagnostico = false" in capa
    mapa = sin_comentarios(COMPONENTES / "MapSurfaceGL.tsx")
    asa = mapa[mapa.index("__sagaMapa = mapa") - 200 : mapa.index("__sagaMapa = mapa") + 500]
    assert "activarDiagnostico(true)" in asa
    assert "depurar-mapa" in mapa[mapa.index("__sagaMapa = mapa") - 1500 : mapa.index("__sagaMapa = mapa")]


def test_la_animacion_de_los_nodos_3d_respeta_la_pausa():
    capa = sin_comentarios(COMPONENTES / "nodosTresD.ts")
    assert "animar && !pausada && !repintadoProgramado" in capa
    assert "pausar(v)" in capa


# ---------------------------------------------------------------------------
# J10: el puente de idioma
# ---------------------------------------------------------------------------


def test_el_puente_no_recorre_la_pagina_entera_por_cada_cambio(js):
    p = js["puente"]
    # Arranque: un recorrido entero, un solo paso hasta asentarse.
    assert p["inicial"]["cerrar"] == "Pechar"
    assert p["inicial"]["walkers"] == 1 and p["inicial"]["recorridos"] >= 300
    # React cambia un texto: se revisa ESE texto y nada más.
    assert p["cambioDeReact"]["texto"] == "Gardar"
    assert p["cambioDeReact"]["walkers"] == 0 and p["cambioDeReact"]["recorridos"] == 0
    # Un reloj que cambia diez veces: cero recorridos de árbol.
    r = p["relojCadaFotograma"]
    assert r["walkers"] == 0 and r["recorridos"] == 0 and r["vueltas"] <= 12
    # Un elemento nuevo: sólo su rama, no las 300 filas de la lista.
    n = p["elementoNuevo"]
    assert n["walkers"] == 1 and n["raices"] == ["subarbol"] and n["recorridos"] <= 2
    assert n["texto"] == "Gardar" and n["titulo"] == "Pechar"


def test_el_puente_no_congela_lo_que_cambia_react(js):
    """El fallo de las pantallas «pidiendo…» que no se actualizaban."""
    p = js["puente"]
    assert p["cambioDeReact"]["texto"] == "Gardar"
    assert p["textoNuevoDeReact"] == "Hola de React", "el texto nuevo de React no se puede devolver al original"


def test_el_puente_no_da_vueltas_por_lo_que_escribe_el_mismo(js):
    """El bucle a 60 Hz: escribir un texto disparaba su propio observador."""
    e = js["puente"]["echoPendiente"]
    assert e["escrituras"] >= 1 and e["textoTraducido"] == "Pechar"
    assert e["eco"] >= 1
    assert e["framesTrasElEco"] == 0, "el eco de su propia escritura pidió otro fotograma"
    assert js["puente"]["inicial"]["framesPendientes"] == 0
    assert js["puente"]["cambioDeReact"]["framesPendientes"] == 0


def test_el_cambio_de_idioma_si_recorre_todo_y_vuelve_al_original(js):
    c = js["puente"]["cambioDeIdioma"]
    assert c["walkers"] == 1 and c["recorridosMinimos"] is True
    assert c["cerrar"] == "Cerrar" and c["tarjeta"] == "Guardar" and c["tituloTarjeta"] == "Cerrar"
    assert c["framesPendientes"] == 0


def test_el_puente_conserva_su_guarda_source_escrito():
    fonte = leer(FRONT / "i18n" / "legacySpanishBridge.ts")
    assert "{ source: string; escrito: string }" in fonte
    assert "if (!registro || current !== registro.escrito)" in fonte
    # Nada de MutationObserver(scheduleWalk) que recorre el body entero en cada mutación.
    assert "new MutationObserver(anotarMutaciones)" in fonte
    assert "new MutationObserver(scheduleWalk)" not in fonte


# ---------------------------------------------------------------------------
# S11 cliente: la clasificación
# ---------------------------------------------------------------------------


def test_un_tiempo_total_de_cero_no_gana_la_clasificacion_final(js):
    c = js["clasificacion"]
    assert c["finalConCero"] == ["Rapido", "Lento", "Cero", "Jugando"]
    assert c["finalConCeroAlReves"] == c["finalConCero"], "el orden no debe depender de cómo llegue la lista"
    # Sin número, con null, negativo o NaN: detrás de quien tiene tiempo, por nombre.
    assert c["finalSinNumeros"] == ["C", "A", "B", "D", "E"]
    assert c["tiempoConocido"] == [0, 0, 12, 0, 1500]


def test_los_empates_de_la_clasificacion_no_parpadean(js):
    c = js["clasificacion"]
    # last_seen cambia en cada latido: el orden no puede cambiar con él.
    assert all(orden == ["Ana", "Beatriz"] for orden in c["empateTresLatidos"])
    assert c["empateAlReves"] == ["Ana", "Beatriz"]
    # Mismo nombre: manda el identificador, que es único.
    assert c["mismoNombre"] == ["u1", "u2"]
    # La hora de fin sí desempata: no se mueve una vez puesta.
    assert c["porHoraDeFin"] == ["Pronto", "Tarde"]


def test_el_orden_general_de_la_clasificacion_se_mantiene(js):
    assert js["clasificacion"]["ordenGeneral"] == [
        "ConPuntos", "Terminado", "MasNodos", "ConTiempo", "SinTiempo",
    ]


def test_las_dos_pantallas_usan_el_mismo_orden():
    pantalla = sin_comentarios(COMPONENTES / "MissionCompleteScreen.tsx")
    hoja = sin_comentarios(COMPONENTES / "RankingSheet.tsx")
    assert "ordenarPorTiempoTotal(players)" in pantalla and "sortByTotalTime" in pantalla
    assert "ordenarClasificacion(players)" in hoja
    for codigo in (pantalla, hoja):
        assert "last_seen" not in codigo, "el desempate volvió a depender de last_seen"
    orden = sin_comentarios(COMPONENTES / "clasificacion.ts")
    assert "last_seen" not in orden and "updated_at" not in orden


# ---------------------------------------------------------------------------
# J18: Simon y Pulso de hierro con un solo AudioContext
# ---------------------------------------------------------------------------


def test_las_notas_comparten_un_solo_audiocontext(js):
    t = js["tonos"]
    assert t["antesDeCerrar"]["creados"] == 1, "cada nota crea su propio AudioContext"
    assert t["antesDeCerrar"]["osciladores"] == 14
    assert t["trasCerrar"]["cerrados"] == 1
    # Sin audio en el navegador se intenta una vez y ya.
    assert t["intentosSinAudio"] == 1 and t["lanzoSinAudio"] is False


@pytest.mark.parametrize(
    "ruta",
    ["sequenceCode/SimonRuntimeScreen.tsx", "motionChallenge/PulsoHierroRuntimeScreen.tsx"],
)
def test_ni_simon_ni_pulso_crean_un_contexto_por_nota(ruta):
    codigo = sin_comentarios(FAMILIAS / ruta)
    assert "new Ctx()" not in codigo and "new AudioContext" not in codigo
    assert "crearReproductorDeTonos()" in codigo and "tonos.tono(" in codigo
    # El audio se despierta en un toque del jugador.
    assert "tonos.preparar()" in codigo


# ---------------------------------------------------------------------------
# J16: los tres idiomas dicen lo mismo y no se mezclan
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bloque", ["minijuegos", "pantallas"])
def test_los_textos_existen_en_los_tres_idiomas(js, bloque):
    t = js["textos"][bloque]
    assert t["claves"] > 40, "el recorrido de textos no ha visto casi nada"
    for idioma in ("gl", "en"):
        assert t["diferencias"][idioma] == {"faltan": [], "sobran": []}, idioma
    assert t["vacios"] == {"es": [], "gl": [], "en": []}


@pytest.mark.parametrize("bloque", ["minijuegos", "pantallas"])
def test_ningun_idioma_lleva_palabras_de_otro(js, bloque):
    t = js["textos"][bloque]
    assert t["gallegoEnCastellano"] == []
    assert t["castellanoEnGallego"] == []


def test_los_plurales_y_los_numeros_salen_bien_en_cada_idioma(js):
    d = js["textos"]["conDatos"]
    assert d["es"]["circuitoQuedan1"].endswith("Te queda 1 intento.")
    assert d["es"]["circuitoQuedan3"].endswith("Te quedan 3 intentos.")
    assert d["gl"]["circuitoQuedan1"].endswith("Quédache 1 intento.")
    assert d["gl"]["circuitoQuedan3"].endswith("Quédanche 3 intentos.")
    p = js["textos"]["conDatosPantallas"]
    assert (p["es"]["jugadores1"], p["es"]["jugadores5"]) == ("1 jugador", "5 jugadores")
    assert (p["gl"]["jugadores1"], p["gl"]["jugadores5"]) == ("1 xogador", "5 xogadores")
    assert (p["en"]["jugadores1"], p["en"]["jugadores5"]) == ("1 player", "5 players")
    assert "1 tipo de" in p["es"]["guardado1"] and "3 tipos de" in p["es"]["guardado3"]
    assert "1 tipo de" in p["gl"]["guardado1"] and "3 tipos de" in p["gl"]["guardado3"]
    # La popup de un compañero ya no mezcla «Nodo … Tempo»: un idioma cada vez.
    assert p["es"]["nodoTiempo"] == "Nodo 3 / 10 · Tiempo 12:34"
    assert p["gl"]["nodoTiempo"] == "Nodo 3 / 10 · Tempo 12:34"
    assert p["es"]["hace"] == ["hace 5 s", "hace 3 min", "hace 2 h"]


def test_el_aviso_de_anti_trampas_sale_entero_en_un_idioma(js):
    d = js["textos"]["conDatos"]
    for idioma in ("es", "gl", "en"):
        assert "30 s" in d[idioma]["salioApp"] and "30 s" in d[idioma]["selectorApps"], idioma
    assert js["textos"]["idiomasDistintos"] == 3
    # Los dos motivos, en el mismo idioma: antes uno salía en castellano y el otro en gallego.
    assert d["es"]["salioApp"].startswith("Saliste") and d["es"]["selectorApps"].startswith("Abriste")
    assert d["gl"]["salioApp"].startswith("Saíches") and d["gl"]["selectorApps"].startswith("Abriches")


def test_close_en_ingles_ya_no_esta_en_la_hoja(js):
    assert js["textos"]["cerrarEnLosTres"] == ["CERRAR", "PECHAR", "CLOSE"]
    hoja = sin_comentarios(COMPONENTES / "InteractionSheet.tsx")
    assert "CLOSE" not in hoja
    assert "{t.hoja.cerrar}" in hoja


def test_el_idioma_desconocido_cae_en_castellano(js):
    assert js["textos"]["desconocidoCaeEnEs"] is True
    assert js["textos"]["pantallasDesconocidoCaeEnEs"] is True


@pytest.mark.parametrize(
    "ruta, prohibidos",
    [
        ("QuickProofPanel.tsx", ("Non se le soa", "Rexistrando", "Gardado en", "No se ve bien", "Pegatina correcta")),
        ("RankingSheet.tsx", ("xogador", "Aínda non", "en liña", "Aparecerán")),
        ("MissionCompleteScreen.tsx", ("Percorriches", "Agardando", "Só conta", "Saír", "Misión Completada")),
        ("UseItemOverlay.tsx", ("A porta cede", "Encaixando", "Agora non", "Non o soltes")),
        ("jugadoresEnMapa.ts", ("Tempo", "Rematou", "sin actualizar", "Jugadores cerca")),
    ],
)
def test_las_pantallas_ya_no_llevan_un_idioma_escrito_a_pelo(ruta, prohibidos):
    codigo = sin_comentarios(COMPONENTES / ruta)
    for texto in prohibidos:
        assert texto not in codigo, f"{ruta}: «{texto}» sigue escrito a pelo"
    assert "textosDePantallas" in codigo.replace("useTextosDePantallas", "textosDePantallas")


def test_caza_senales_habla_el_idioma_del_jugador():
    codigo = sin_comentarios(FAMILIAS / "sparkRadar" / "RuntimeScreen.tsx")
    for texto in ("SINAIS", "Sinal recuperado", "Tempo esgotado", "Le o resultado", "ningunha"):
        assert texto not in codigo, texto
    # `onComezar` es el nombre de una prop; lo que no puede haber es el rótulo suelto.
    assert not re.search(r">\s*Comezar\s*<", codigo)
    assert "useTextos().spark" in codigo


def test_simon_y_el_laberinto_ya_no_llevan_textos_a_pelo():
    simon = sin_comentarios(FAMILIAS / "sequenceCode" / "SimonRuntimeScreen.tsx")
    laberinto = sin_comentarios(FAMILIAS / "tiltMaze" / "RuntimeScreen.tsx")
    for texto in ("Saíches", "Fallaste", "Tu turno", "Observando", "SIMÓN DICE"):
        assert texto not in simon, texto
    for texto in ("Saíches", "Pared.", "Caíste", "Iniciar laberinto", "Recalibrar</button>"):
        assert texto not in laberinto, texto
    assert "useTextos()" in simon and "useTextos()" in laberinto


# ---------------------------------------------------------------------------
# J2: un minijuego ganado tiene que poder completarse tras un fallo de envío
# ---------------------------------------------------------------------------


def _funcion(codigo: str, cabecera: str, largo: int = 4500) -> str:
    inicio = codigo.index(cabecera)
    return codigo[inicio : inicio + largo]


def test_la_hoja_suelta_el_candado_si_el_envio_no_se_acepta():
    hoja = sin_comentarios(COMPONENTES / "InteractionSheet.tsx")
    ganar = _funcion(hoja, "async function handleNativeWin(")
    assert "superado = await onSubmitCode('OK', tempo, castigo)" in ganar
    # Tanto si devuelve false como si lanza: `finally`.
    assert re.search(
        r"finally\s*\{\s*if \(!superado\) \{\s*winLockRef\.current = false\s*setIsCompleted\(false\)",
        ganar,
    ), "el candado tiene que soltarse cuando onSubmitCode no acepta el nodo"
    assert "return superado" in ganar
    # Una llamada ignorada por haber ya un envío no es un fallo.
    assert "return undefined" in ganar


def test_la_hoja_ofrece_reintentar_sin_volver_a_jugar():
    hoja = sin_comentarios(COMPONENTES / "InteractionSheet.tsx")
    assert "function reintentarEnvio()" in hoja
    assert "{envioFallido && !submitting ? (" in hoja
    assert "onClick={reintentarEnvio}" in hoja
    # El tiempo del reintento es el de ganar, no el de cuando se vuelve a pulsar.
    assert "ultimaVictoriaRef.current = { penaltyMs, tempoDaPartidaMs: tempo }" in hoja


@pytest.mark.parametrize(
    "ruta, lock",
    [
        ("tiltMaze/RuntimeScreen.tsx", "continueLockRef.current = false"),
        ("circuitMatrix/RuntimeScreen.tsx", "continueLockRef.current = false"),
        ("placeMosaic/RuntimeScreen.tsx", "continueLockRef.current = false"),
        ("sparkRadar/RuntimeScreen.tsx", "continuarLockRef.current = false"),
        ("signalHunt/CheckpointRuntimeScreen.tsx", "wonRef.current = false"),
    ],
)
def test_los_juegos_con_boton_continuar_lo_sueltan_si_no_se_acepto(ruta, lock):
    codigo = sin_comentarios(FAMILIAS / ruta)
    assert "Promise<void | boolean>" in codigo
    # `=== false` y no `!superado`: `undefined` es «había otro envío en marcha».
    bloque = re.search(r"if \(superado === false\)[^}]*" + re.escape(lock), codigo, flags=re.DOTALL)
    assert bloque, f"{ruta} no suelta su candado cuando onWin devuelve false"


def test_el_laberinto_no_se_queda_en_avanzando():
    lab = sin_comentarios(FAMILIAS / "tiltMaze" / "RuntimeScreen.tsx")
    seguir = _funcion(lab, "const continueRoute = useCallback(", 1600)
    assert "const superado = await onWin()" in seguir
    assert "setContinuing(false)" in seguir


def test_el_anfitrion_solo_da_el_resultado_a_quien_sabe_usarlo():
    host = sin_comentarios(JUEGOS / "core" / "FamilyRuntimeHost.tsx")
    assert "Promise<void | boolean>" in host
    for consciente in ("SparkRadarRuntimeScreen", "TiltMazeRuntimeScreen", "PlaceMosaicRuntimeScreen", "CheckpointRuntimeScreen"):
        bloque = _funcion(host, f"<{consciente}\n", 400)
        assert "onWin={onWin}" in bloque, consciente
    for ciego in ("SimonRuntimeScreen", "PulsoHierroRuntimeScreen", "WordTrapRuntimeScreen", "TeamRelayRuntimeScreen"):
        bloque = _funcion(host, f"<{ciego}\n", 400)
        assert "onWin={onWinSinResultado}" in bloque, ciego


# ---------------------------------------------------------------------------
# J5 / J18: el laberinto y el tiempo
# ---------------------------------------------------------------------------


def test_el_laberinto_manda_el_tiempo_de_todos_los_intentos():
    for ruta in ("tiltMaze/RuntimeScreen.tsx", "sparkRadar/RuntimeScreen.tsx"):
        codigo = sin_comentarios(FAMILIAS / ruta)
        assert "comezouRef" not in codigo, f"{ruta}: el tiempo de la partida se reinicia en cada intento"
        assert "daPartida" not in codigo, ruta
        # Sigue avisando de cuándo empieza, que es lo que arranca el reloj del nodo.
        assert "onComezar?.()" in codigo, ruta


def test_el_laberinto_no_pierde_el_intento_por_el_autobloqueo():
    """`useRegenerarAoOcultar` sólo actúa si el jugador SE FUE; el sensor no cuenta como toque."""
    hook = sin_comentarios(JUEGOS / "core" / "useRegenerarAoOcultar.ts")
    assert "document.visibilityState === 'hidden' && esSalidaDeliberada()" in hook
    assert "vigilarInteraccion()" in hook
    lab = sin_comentarios(FAMILIAS / "tiltMaze" / "RuntimeScreen.tsx")
    assert "useRegenerarAoOcultar(phase === 'playing'" in lab
    assert "useSinRetoEnPantalla(phase !== 'playing')" in lab


def test_la_hoja_solo_vigila_con_la_hoja_abierta_y_un_reto_delante():
    hoja = sin_comentarios(COMPONENTES / "InteractionSheet.tsx")
    llamada = _funcion(hoja, "const antiTrampas = useAntiTrampas(", 400)
    assert "open && shouldRenderFamilyRuntime && !isStageCollectible(currentStage)" in llamada
    assert "sinReto" in llamada, "la pantalla de reglas y la de resultado no se vigilan"
    assert "useWakeLock(open)" in hoja
    assert "<SinRetoContext.Provider value={setSinReto}>" in hoja


def test_el_cambio_de_nodo_no_pisa_lo_que_declara_el_juego():
    """Un efecto del padre corre después que los de sus hijos: `setSinReto(false)`
    en el efecto de `[stageId]` borraba lo que el juego nuevo acababa de declarar."""
    hoja = sin_comentarios(COMPONENTES / "InteractionSheet.tsx")
    inicio = hoja.index("setFallbackOpen(isQrCameraStage(currentStage))")
    efecto = hoja[inicio : hoja.index("[stageId])", inicio)]
    assert "winLockRef.current = false" in efecto, "no se ha encontrado el efecto de cambio de nodo"
    assert "setSinReto(" not in efecto
    contexto = sin_comentarios(HOOKS / "useSinRetoEnPantalla.ts")
    assert "return () => declarar(false)" in contexto


@pytest.mark.parametrize(
    "ruta",
    [
        "tiltMaze/RuntimeScreen.tsx",
        "sparkRadar/RuntimeScreen.tsx",
        "circuitMatrix/RuntimeScreen.tsx",
        "placeMosaic/RuntimeScreen.tsx",
        "sequenceCode/SimonRuntimeScreen.tsx",
        "motionChallenge/PulsoHierroRuntimeScreen.tsx",
        "motionChallenge/RuntimeScreen.tsx",
        "audioChallenge/AudioChallengeRuntime.tsx",
    ],
)
def test_los_juegos_con_pantalla_de_reglas_lo_declaran(ruta):
    codigo = sin_comentarios(FAMILIAS / ruta)
    assert "useSinRetoEnPantalla(" in codigo, f"{ruta} no declara cuándo no hay reto en pantalla"


# ---------------------------------------------------------------------------
# J12: los diálogos de permiso de la propia app no cuentan como irse
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "ruta, peticion",
    [
        ("tiltMaze/RuntimeScreen.tsx", "Orientation.requestPermission()"),
        ("audioChallenge/AudioChallengeRuntime.tsx", "navigator.mediaDevices.getUserMedia({ audio: true })"),
    ],
)
def test_el_permiso_se_avisa_antes_de_pedirlo(ruta, peticion):
    codigo = sin_comentarios(FAMILIAS / ruta)
    assert "import { avisarPeticionDePermisoPropia }" in codigo
    assert codigo.count("avisarPeticionDePermisoPropia()") == 1
    assert codigo.index("avisarPeticionDePermisoPropia()") < codigo.index(peticion), (
        f"{ruta}: hay que avisar ANTES de pedir el permiso, no después"
    )


def test_todo_lo_que_pide_un_permiso_del_sistema_avisa():
    """Cámara, movimiento y micrófono: cualquiera que abra un diálogo del sistema."""
    pendientes = []
    for ruta in list(FAMILIAS.rglob("*.ts*")) + list(HOOKS.glob("*.ts")):
        codigo = sin_comentarios(ruta)
        pide = re.search(r"requestPermission\(\)|getUserMedia\(", codigo)
        if pide and "avisarPeticionDePermisoPropia" not in codigo:
            pendientes.append(ruta.relative_to(FRONT).as_posix())
    assert not pendientes, f"piden un permiso sin avisar al anti-trampas: {pendientes}"
