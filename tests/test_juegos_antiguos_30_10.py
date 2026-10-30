# -*- coding: utf-8 -*-
"""Revisión 30/10 de los juegos antiguos (jugados en el navegador a 360 px).

* Recargar a mitad borraba los fallos: la penalización volvía a cero y el nodo salía «perfecto» (Trampa, Cuenta las
  señales, Eco rítmico...). Ahora las partidas a medias van a localStorage y el reinicio de la partida las borra.
* Trampa de palabras: cerrar la hoja, salir o recargar a mitad de pregunta devolvía el tiempo entero de la ronda.
* Mastermind, Eco rítmico, Interrogatorio y Balanza: el reloj del nodo corría en la pantalla de reglas.
* Juegos de lógica: salir de la app en las reglas o ya resuelto costaba +30 s (no declaraban que no hay reto).
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

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
