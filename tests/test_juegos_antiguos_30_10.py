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
