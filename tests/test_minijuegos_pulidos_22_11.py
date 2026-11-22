# -*- coding: utf-8 -*-
"""22/11/2026: repaso de los minijuegos sin auditar (Dinamo, Faros, Rumbo, Trampa, Mosaico, Eco, lógica, audio,
Cuenta las señales, Relevo). Cada test es un fallo arreglado; leen el código fuente, como el resto de la suite."""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
JUEGOS = RAIZ / "frontend" / "src" / "player" / "minigames" / "families"


def leer(rel: str) -> str:
    return (JUEGOS / rel).read_text(encoding="utf-8-sig")


# --- Dinamo ---------------------------------------------------------------------------------------------------------


def test_dinamo_la_luz_de_la_bici_se_mueve_seguida_y_barata():
    """22/11 (propuesta C): la escena es un lienzo a 60 fps que suaviza entre las lecturas del juego (20 Hz); antes, la
    aguja y el rotor del dial giraban con transform y una transición de un tic por lo mismo."""
    s = leer("motionChallenge/DinamoRuntimeScreen.tsx")
    e = leer("motionChallenge/escenaDinamo.ts")
    # Un fotograma por refresco, parado en las reglas, con movimiento reducido y con la pestaña oculta.
    assert "id = requestAnimationFrame(fotograma)" in s and "'visibilitychange'" in s
    assert "const animar = !reducido && fase !== 'reglas'" in s
    # Movimiento reducido: el del sistema EN VIVO; sin animar, la escena se repinta quieta con cada lectura.
    assert "usePrefiereMenosMovimiento()" in s and "MOVIMIENTO_REDUCIDO" not in s
    assert "if (!animar) escenaRef.current?.dibujar(performance.now(), 0, datosRef.current, false)" in s
    # La luz y la velocidad se acercan a lo leído en cada fotograma (no saltan de lectura en lectura).
    assert "luz += ((lleno ? 1 : alcanceLuz(e.carga)) - luz) * k(" in e
    assert "vel += ((e.activo ? velocidadCamino(e.rel) : 0) - vel) * k(0.35)" in e
    # Nada nuevo por fotograma: ni degradados, ni lienzos, ni objetos; lo fijo se pinta al cambiar de tamaño.
    fotograma = e.split("function dibujar(")[1].split("return { redimensionar, dibujar }")[0]
    for prohibido in ("create", "new ", "lienzo(", "[]", "{ "):
        assert prohibido not in fotograma.replace("${", ""), prohibido
    # El final de la luz se enmascara con destination-out (destination-in borraría el resto del lienzo).
    assert "cv.globalCompositeOperation = 'destination-out'" in e


def test_dinamo_doble_toque_en_empezar_no_pide_dos_permisos():
    s = leer("motionChallenge/DinamoRuntimeScreen.tsx")
    assert "if (empezandoRef.current) return" in s
    assert "await pedirPermiso().finally(() => (empezandoRef.current = false))" in s


# --- Faros y Rumbo ----------------------------------------------------------------------------------------------------


def test_faros_botones_de_giro_no_se_quedan_girando():
    s = leer("bearingHunt/FarosRuntimeScreen.tsx")
    # Un gesto que el navegador cancela (pointercancel, no pointerup) dejaba el haz girando solo.
    assert s.count("onPointerCancel={() => (giroBotonRef.current = 0)}") == 2
    assert s.count("onContextMenu={(e) => e.preventDefault()}") == 2
    assert "-webkit-touch-callout:none" in s


def test_faros_el_haz_barre_seguido_y_no_da_la_vuelta_al_pasar_por_el_norte():
    s = leer("bearingHunt/FarosRuntimeScreen.tsx")
    # 22/11 «Mirando al mar»: el horizonte se pinta a cada fotograma con el giro sin normalizar (paso más corto).
    assert "giroPintadoRef.current += delta(normalizar(giroPintadoRef.current), rumboRef.current) * k" in s
    assert "const x = enPanorama(rumbo, c.rumbo, CAMPO)" in s
    assert "requestAnimationFrame(paso)" in s and "cancelAnimationFrame(id)" in s
    assert "if (empezandoRef.current) return" in s


def test_rumbo_el_deslizador_manual_no_vuelve_hacia_atras():
    s = leer("bearingHunt/RuntimeScreen.tsx")
    # El deslizador pinta el rumbo que se le dio (no el suavizado, que va atrasado) y lo aplica sin suavizar.
    assert "value={Math.round(rawHeading ?? heading ?? targetBearing)}" in s
    assert "updateHeading(Number(event.target.value), true)" in s
    assert "previous === null || inmediato" in s


# --- Trampa de palabras ------------------------------------------------------------------------------------------------


def test_trampa_el_reloj_no_salta_a_lleno_al_contestar():
    s = leer("wordTrap/RuntimeScreen.tsx")
    assert "setRemainingMs(paused ? durationMs" not in s
    assert "    if (paused) return\n    setRemainingMs(Math.max(0, durationMs - (Date.now() - inicioRef.current)))" in s.replace(
        "\r\n", "\n"
    )
    # La barra con transform, no width.
    assert "style={{ transform: `scaleX(${barRatio})` }}" in s
    assert "transition: width" not in s


def test_trampa_la_pausa_final_no_gana_con_la_hoja_cerrada():
    s = leer("wordTrap/RuntimeScreen.tsx")
    assert "useEffect(() => () => window.clearTimeout(pausaRef.current), [])" in s
    assert "pausaRef.current = window.setTimeout(() => {" in s


def test_trampa_la_ronda_nueva_entra_fundida():
    s = leer("wordTrap/RuntimeScreen.tsx")
    assert '<div className="wtp-ronda" key={roundIndex}>' in s
    assert "@keyframes wtp-entra" in s and "prefers-reduced-motion" in s


# --- Mosaico ----------------------------------------------------------------------------------------------------------


def test_mosaico_las_piezas_giran_con_ellas_y_sin_vuelta_atras():
    s = leer("placeMosaic/RuntimeScreen.tsx")
    # Cuartos de vuelta acumulados (derecha = múltiplo de 4) y la pieza como clave.
    assert "nextGiros[pieza] = nextGiros[pieza] + 1" in s and "% 4\n" not in s.replace("\r\n", "\n")
    assert "!((giros?.[value] ?? 0) % 4)" in s
    assert "!(giros[originalPiece] % 4)" in s
    assert "key={`${intento}-${originalPiece}`}" in s
    assert "key={`position-${position}`}" not in s


def test_mosaico_las_pantallas_entran_fundidas():
    s = leer("placeMosaic/RuntimeScreen.tsx")
    assert s.count('<section key={phase} className="mosaic-shell saga-glass-panel"') == 7
    assert "@keyframes mosaic-entra" in s


# --- Eco rítmico y juegos de lógica ---------------------------------------------------------------------------------


def test_reabrir_un_juego_resuelto_y_rechazado_ofrece_reintentar():
    # Cerrar la hoja con el envío rechazado (o a medias) dejaba «¡Resuelto!» sin botón, también tras recargar.
    for juego in (
        "sequenceCode/EcoRitmicoRuntimeScreen.tsx",
        "logica/MastermindRuntimeScreen.tsx",
        "logica/BalanzaRuntimeScreen.tsx",
        "logica/InterrogatorioRuntimeScreen.tsx",
    ):
        s = leer(juego)
        assert "const [rechazado, setRechazado] = useState(() => partida.datos.resuelto === true)" in s, juego
        assert "useState(false)\n" not in s.split("const [rechazado")[1][:40], juego


def test_eco_los_golpes_rapidos_no_se_pisan():
    s = leer("sequenceCode/EcoRitmicoRuntimeScreen.tsx")
    assert "const i = toquesRef.current.length" in s
    assert "if (i >= actual.fichas.length) return" in s
    assert "const i = toques.length" not in s


def test_balanza_sin_pesadas_no_pinta_un_cero():
    s = leer("logica/BalanzaRuntimeScreen.tsx")
    assert "!eligiendo && quedan > 0 &&" in s
    assert "!eligiendo && quedan &&" not in s


# --- Audio, Cuenta las señales, Relevo ----------------------------------------------------------------------------------


def test_audio_sin_reservar_memoria_en_cada_fotograma():
    s = leer("audioChallenge/AudioChallengeRuntime.tsx")
    assert "new Uint8Array(analyserRef.current.frequencyBinCount)" not in s
    assert "if (bufferRef.current?.length !== bins) bufferRef.current = new Uint8Array(bins)" in s
    assert "transform: `scaleX(${level / 100})`" in s and "width: `${level}%`" not in s


def test_cuenta_la_pregunta_no_baila_con_el_gps_en_el_borde():
    s = leer("signalHunt/CuentaSenalesRuntimeScreen.tsx")
    assert "if (inRange) setLlegado(true)" in s
    assert "const atNode = !requireProximity || !hasSource || inRange || llegado || gpsBroken" in s
    assert "if (submitting || checking || wonRef.current) return" in s


def test_relevo_mantener_pulsado_no_saca_el_menu_de_ios():
    s = leer("teamRelay/RuntimeScreen.tsx")
    assert "onContextMenu={(e) => e.preventDefault()}" in s
    assert "WebkitTouchCallout: 'none'" in s and "touchAction: 'none'" in s


# --- Lo que salió en las capturas a 360 x 640 (Pizarra y Día) ---------------------------------------------------------


def test_dinamo_el_chip_no_parte_la_cabecera_al_empezar():
    s = leer("motionChallenge/DinamoRuntimeScreen.tsx")
    assert "white-space:nowrap; }" in s.split(".dn-chip {")[1].split("\n")[0]
    assert "{fase === 'reglas' ? tx.nFases(fases.length) : tx.fase(faseVista, fases.length)}" in s
    # Con el permiso denegado no se dice además que el móvil no da el movimiento.
    assert "{sensor !== 'denegado' ? <p className=\"dn-aviso\">{tx.sinSensor}</p> : null}" in s


def test_toques_de_44_en_rumbo_y_eco():
    r = leer("bearingHunt/RuntimeScreen.tsx")
    boton = r.split(".bh-button {")[1].split("}")[0]
    assert "min-height: 44px;" in boton
    assert "min-height: 44px;" in r.split(".bh-range {")[1].split("}")[0]
    e = leer("sequenceCode/eco.css")
    assert ".eco-sonido::after" in e and "inset: -6px 0;" in e


def test_eco_la_pista_se_lee_en_dia():
    # 22/11 (punto y raya): la pista pasó a ser la línea de marcas, con los tonos del tema (se leen en Pizarra y Día).
    e = leer("sequenceCode/eco.css")
    assert ".eco-linea .eco-marca.bien {\n  background: var(--mg-good);" in e
    assert ".eco-linea .eco-marca.mal {\n  background: var(--mg-bad);" in e
    assert ".eco-hueco.ahora .eco-marca.vacia {\n  background: var(--theme-primary);" in e
