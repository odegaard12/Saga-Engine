# -*- coding: utf-8 -*-
"""Revisión 30/10 de los juegos antiguos (jugados en el navegador a 360 px).

* Recargar a mitad borraba los fallos: la penalización volvía a cero y el nodo salía «perfecto» (Trampa, Cuenta las
  señales, Eco rítmico...). Ahora las partidas a medias van a localStorage y el reinicio de la partida las borra.
* Trampa de palabras: cerrar la hoja, salir o recargar a mitad de pregunta devolvía el tiempo entero de la ronda.
* Mastermind, Eco rítmico, Interrogatorio y Balanza: el reloj del nodo corría en la pantalla de reglas.
* Juegos de lógica: salir de la app en las reglas o ya resuelto costaba +30 s (no declaraban que no hay reto).
"""
import json
import os
import re
import tempfile
import shutil
import subprocess
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-juegos-antiguos-"))

import pytest  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
JUGADOR = RAIZ / "frontend" / "src" / "player"
FAMILIAS = JUGADOR / "minigames" / "families"


def _leer(ruta):
    return Path(ruta).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin Node o sin dependencias del frontend")
    r = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "partidas_guardadas.cjs")], capture_output=True, text=True, timeout=120, cwd=RAIZ
    )
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_la_partida_a_medias_sobrevive_a_recargar(js):
    assert js["trasRecargar"] == {"siguiente": 2, "penalty": 30000, "inicio": 123}
    assert js["otroJuego"] is None, "cada juego tiene sus claves"
    assert js["trasBorrar"] is None, "al ganar se borra"


def test_reiniciar_la_partida_borra_tambien_las_partidas_guardadas(js):
    assert js["trasReinicio"] == ["otra:cosa"]


@pytest.mark.parametrize(
    "fichero",
    [
        "wordTrap/RuntimeScreen.tsx",
        "signalHunt/CuentaSenalesRuntimeScreen.tsx",
        "sparkRadar/RuntimeScreen.tsx",
        "circuitMatrix/RuntimeScreen.tsx",
        "logica/comun.tsx",
    ],
)
def test_ningun_juego_guarda_los_fallos_solo_en_memoria(fichero):
    fuente = _leer(FAMILIAS / fichero)
    assert "partidasGuardadas<" in fuente
    assert not re.search(r"=\s*new Map<string, (PartidaGuardada|Partida|number)>\(\)", fuente)


def test_logica_guarda_cada_cambio():
    fuente = _leer(FAMILIAS / "logica" / "comun.tsx")
    assert "fn(partida)\n      partidas.set(clave, partida)" in fuente


def test_trampa_no_reinicia_el_tiempo_de_la_pregunta():
    fuente = _leer(FAMILIAS / "wordTrap" / "RuntimeScreen.tsx")
    assert "const startedAt = inicioRef.current" in fuente, "el contador parte del inicio guardado, no de ahora"
    assert "useRef(guardada?.inicio ?? Date.now())" in fuente
    assert "inicio: inicioRondaRef.current," in fuente, "la ronda se guarda al empezar, no al contestar"


def test_el_reloj_espera_a_empezar_en_los_juegos_con_reglas():
    hoja = _leer(JUGADOR / "components" / "InteractionSheet.tsx")
    lista = re.search(r"const XOGOS_QUE_AVISAN = \[(.*?)\]", hoja, re.S).group(1)
    for juego in ("mastermind", "sequence_code", "interrogatorio", "balanza"):
        assert f"'{juego}'" in lista, juego


@pytest.mark.parametrize("juego", ["Mastermind", "Interrogatorio", "Balanza"])
def test_salir_en_las_reglas_de_logica_no_cuenta(juego):
    fuente = _leer(FAMILIAS / "logica" / f"{juego}RuntimeScreen.tsx")
    assert "useSinRetoEnPantalla(!partida.empezado || partida.datos.resuelto === true)" in fuente


# --- Segunda tanda (30/10): Mosaico, Pulso, Laberinto, Chispas, Matriz y Mapa mudo. ---


@pytest.mark.parametrize(
    "fichero, frase",
    [
        ("sparkRadar/RuntimeScreen.tsx", "tx.falsasAntes(fallosTotalesRef.current)"),
        ("circuitMatrix/RuntimeScreen.tsx", "t.exitoConFallos(fallosTotalesRef.current)"),
    ],
)
def test_el_resultado_ensena_la_penalizacion_que_se_cobra(fichero, frase):
    """Tras salir o recargar, el resultado decía «sin un solo fallo» y luego se cobraban los fallos de antes."""
    fuente = _leer(FAMILIAS / fichero)
    assert frase in fuente
    assert "exitoConFallos(errors)" not in fuente and "falsasAntes(misses)" not in fuente


def test_mosaico_no_pierde_la_penalizacion_de_la_pregunta_al_recargar():
    fuente = _leer(FAMILIAS / "placeMosaic" / "RuntimeScreen.tsx")
    assert "partidasGuardadas<number>('place_mosaic')" in fuente
    assert "useRef(penalPregunta.get(claveNodo) ?? 0)" in fuente
    assert "penalPregunta.set(claveNodo, penaltyPreguntaRef.current)" in fuente
    assert "if (superado !== false) penalPregunta.delete(claveNodo)" in fuente


def test_el_reloj_de_pulso_espera_a_empezar():
    hoja = _leer(JUGADOR / "components" / "InteractionSheet.tsx")
    assert "'pulso_hierro'" in re.search(r"const XOGOS_QUE_AVISAN = \[(.*?)\]", hoja, re.S).group(1)
    host = _leer(JUGADOR / "minigames" / "core" / "FamilyRuntimeHost.tsx")
    assert re.search(r"<PulsoHierroRuntimeScreen[^>]*onComezar=\{onComezar\}", host, re.S)
    pulso = _leer(FAMILIAS / "motionChallenge" / "PulsoHierroRuntimeScreen.tsx")
    assert pulso.count("onComezar?.()") == 2, "en «Empezar» y en el modo táctil"


def test_chispas_se_apagan_al_acabarse_el_tiempo():
    """Al perder por tiempo, las chispas seguían dibujadas detrás del cartel «Tiempo agotado»."""
    fuente = _leer(FAMILIAS / "sparkRadar" / "RuntimeScreen.tsx")
    assert re.search(r"if \(left <= 0\) \{[^}]*setSparks\(\[\]\)", fuente, re.S)


# --- Revisión 4/11 (6.2.3): los 14 juegos. ---


def test_dinamo_y_faros_no_cuentan_las_reglas():
    """El reloj del nodo corría en las reglas de Dinamo y Faros (00:02 → 00:05 sin pulsar nada)."""
    hoja = _leer(JUGADOR / "components" / "InteractionSheet.tsx")
    assert "'rumbo_doble'" in re.search(r"const XOGOS_QUE_AVISAN = \[(.*?)\]", hoja, re.S).group(1)
    # Dinamo: la misma regla con la que MotionChallengeRuntimeScreen decide jugarlo.
    assert "(cfgJuego.objective ?? 'shake_charge') === 'shake_charge'" in hoja
    assert "XOGOS_QUE_AVISAN.includes(idJuego) || esDinamo" in hoja
    movimiento = _leer(FAMILIAS / "motionChallenge" / "RuntimeScreen.tsx")
    assert "(props.resolved.config.objective ?? 'shake_charge') === 'shake_charge'" in movimiento
    host = _leer(JUGADOR / "minigames" / "core" / "FamilyRuntimeHost.tsx")
    for pantalla in ("MotionChallengeRuntimeScreen", "BearingHuntRuntimeScreen"):
        bloque = host[host.index(f"<{pantalla}") :]
        assert "onComezar={onComezar}" in bloque[: bloque.index("/>")], pantalla
    for fichero in ("motionChallenge/DinamoRuntimeScreen.tsx", "bearingHunt/FarosRuntimeScreen.tsx"):
        assert _leer(FAMILIAS / fichero).count("onComezar?.()") == 2, f"{fichero}: con sensor y sin él"


# --- 4/11 (6.2.4): «+1 ★» en modo prueba, N3 más largos y reglas más claras. ---

NIVELES = json.loads((RAIZ / "backend" / "app" / "runtime" / "niveles_minijuegos.json").read_text("utf-8"))["juegos"]


def _n(juego, nivel):
    return NIVELES[juego]["niveles"][str(nivel)]["params"]


def test_en_modo_prueba_el_superado_no_promete_estrellas(monkeypatch):
    """Los SIM y el GPS manual no ganan estrellas: el «+1 ★» lee `por_nodo`, que a ellos se les manda a 0."""
    import main
    from backend.app.runtime import desbloqueos as reglas
    from backend.app.runtime import desbloqueos_glue as glue

    activa = reglas.normalizar_config({"activos": True, "estrellas": {"por_nodo": 2}})
    monkeypatch.setattr(glue, "config", lambda cfg=None: activa)
    monkeypatch.setattr(main, "es_modo_prueba", lambda pid: str(pid).startswith("SIM_"))
    assert glue.estado_para_jugador("SIM_01", stages=[])["estrellas"]["por_nodo"] == 0
    assert glue.estado_para_jugador("JUGADORA", stages=[])["estrellas"]["por_nodo"] == 2


def test_n3_mas_largo_y_n2_igual():
    assert _n("place_mosaic", 3)["rotate_pieces"] is True and _n("place_mosaic", 2)["rotate_pieces"] is False
    assert _n("spark_radar", 3)["target_hits"] == 40 and _n("spark_radar", 3)["double_tap_ratio"] > 0
    assert _n("spark_radar", 2)["target_hits"] == 25 and _n("spark_radar", 2)["double_tap_ratio"] == 0
    assert _n("logic_circuit", 3)["reverse"] is True and _n("logic_circuit", 2)["reverse"] is False
    assert (_n("shake_charge", 3)["dinamo_fases"], _n("shake_charge", 3)["dinamo_segundos"]) == (3, 18)  # 5/11: lento, rápido, lento
    generado = _leer(JUGADOR / "minigames" / "core" / "niveles.generado.ts")
    assert '"double_tap_ratio": 0.15' in generado and '"dinamo_segundos": 18' in generado


def test_matriz_al_reves_no_dice_en_el_orden_que_quieras():
    assert "(alReves ? t.marcaAlReves : t.marca)(" in _leer(FAMILIAS / "circuitMatrix" / "RuntimeScreen.tsx")
    assert _leer(JUGADOR / "minigames" / "core" / "textos.ts").count("marcaAlReves:") == 3


@pytest.mark.parametrize(
    "fichero, frase",
    [
        ("tiltMaze/RuntimeScreen.tsx", "{t.avisoBotones}"),
        ("motionChallenge/PulsoHierroRuntimeScreen.tsx", "{pulso.avisoBotones}"),
        ("motionChallenge/DinamoRuntimeScreen.tsx", "{tx.avisoTactil}"),
        ("bearingHunt/FarosRuntimeScreen.tsx", "{tx.avisoBotones}"),
    ],
)
def test_las_reglas_dicen_que_sin_sensor_cuesta_un_minuto(fichero, frase):
    fuente = _leer(FAMILIAS / fichero)
    assert frase in fuente
    assert fuente.count("suma 1 min") + _leer(JUGADOR / "minigames" / "core" / "textos.ts").count("suma 1 min") >= 2


def test_faros_dice_los_segundos_de_su_nivel():
    fuente = _leer(FAMILIAS / "bearingHunt" / "FarosRuntimeScreen.tsx")
    assert "tx.reglas(total, Math.round(mantenerMs / 1000))" in fuente and "mantén el haz 3 s" not in fuente


def test_cuenta_las_senales_dice_si_te_quedas_corto_o_te_pasas():
    fuente = _leer(FAMILIAS / "signalHunt" / "CuentaSenalesRuntimeScreen.tsx")
    assert "void direccion(Number(digits)).then(setPista)" in fuente
    assert "return n > dicho ? 'corto' : 'largo'" in fuente
    textos = _leer(JUGADOR / "minigames" / "core" / "textos.ts")
    assert textos.count("teQuedasCorto:") == 3 and textos.count("tePasas:") == 3


def test_mosaico_girado_deja_soltar_la_pieza():
    """Con piezas giradas, tocar la elegida la gira y tocar otra las cambia: hacía falta poder soltarla."""
    fuente = _leer(FAMILIAS / "placeMosaic" / "RuntimeScreen.tsx")
    assert "{girarPiezas && selected !== null && phase === 'playing' ? (" in fuente
    assert "{t.soltarPieza}" in fuente
    assert _leer(JUGADOR / "minigames" / "core" / "textos.ts").count("soltarPieza:") == 3
