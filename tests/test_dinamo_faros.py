# -*- coding: utf-8 -*-
"""30/10: Dinamo (sustituye la mecánica de «Agita para cargar») y Faros (la de «Rumbo doble»).

Mismos game_id que antes (shake_charge, rumbo_doble): las misiones existentes siguen valiendo. La lógica pura se
ejecuta en Node (tests/js/dinamo_faros.cjs); aquí, además, el servidor (claves, semilla, niveles, evidencia).
"""
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-dinamo-"))

from backend.app.runtime.minigames import normalize_minigame_config, project_seeds_for_player  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
FAMILIAS = RAIZ / "frontend" / "src" / "player" / "minigames" / "families"


def test_logica_pura_de_dinamo_y_faros():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    r = json.loads(subprocess.run([node, str(RAIZ / "tests" / "js" / "dinamo_faros.cjs")], capture_output=True,
                                  text=True, check=True, encoding="utf-8").stdout)
    d, f = r["dinamo"], r["faros"]
    assert d["bienFase"] == 3 and 59000 <= d["bienMs"] <= 62000, "siguiendo la zona: 3 fases × 20 s"
    assert d["quietoFase"] == 0 and d["bestiaFase"] == 0, "ni quieto ni agitando a lo bestia se carga"
    assert d["anchos"][0] > d["anchos"][-1], "la zona se estrecha"
    assert 0 < d["cargaTrasFuera"] < d["cargaDentro"], "fuera de zona se pierde poco, nunca bloquea"
    assert d["base"] == [1.2, 1.2, 4], "calibración con suelo"
    assert f["separados"] and f["lejosDelFrente"] and f["mismo"]
    assert f["distintos"] > f["total"] * 0.9, "cada jugador, sus faros"
    assert f["temps"] == ["ardiendo", "caliente", "templado", "frio"]
    assert f["delta"] == [20, -20, 180]
    assert f["cercano"] == {"indice": 0, "distancia": -10} and f["cercanoSinPrimero"]["indice"] == 1
    assert [round(x) if x is not None else None for x in f["giro"]] == [30, 45, None]
    assert f["barcosLejos"], "los barcos señuelo nunca tapan un faro"
    assert f["debiles"] == ["caliente", "templado", "templado", "frio"], "las pistas se debilitan con cada faro"


def test_servidor_guarda_las_claves_nuevas_y_da_semilla_por_jugador():
    m = normalize_minigame_config("motion_challenge", {"dinamo_fases": 99, "dinamo_segundos": 1, "dinamo_ancho": 9})
    assert (m["dinamo_fases"], m["dinamo_segundos"], m["dinamo_ancho"]) == (6, 5, 1.0)
    m0 = normalize_minigame_config("motion_challenge", {})
    assert (m0["dinamo_fases"], m0["dinamo_segundos"]) == (3, 25)

    r = normalize_minigame_config("bearing_hunt", {"game_id": "rumbo_doble", "faros": 1})
    assert r["game_id"] == "rumbo_doble" and r["faros"] == 3, "nunca menos faros que objetivos pide la evidencia"
    r0 = normalize_minigame_config("bearing_hunt", {"game_id": "rumbo_doble"})
    assert (r0["faros"], r0["hold_ms"], r0["senuelos"]) == (6, 3000, 2), "N2: 6 faros, mantener 3 s, 2 barcos"
    assert normalize_minigame_config("bearing_hunt", r) == r, "normalizar dos veces no cambia nada"

    a = project_seeds_for_player({"game_id": "rumbo_doble"}, "n1", "p1")["seed"]
    assert a == project_seeds_for_player({"game_id": "rumbo_doble"}, "n1", "p1")["seed"]
    assert a != project_seeds_for_player({"game_id": "rumbo_doble"}, "n1", "p2")["seed"]


def test_niveles_suben_la_dificultad():
    juegos = json.loads((RAIZ / "backend" / "app" / "runtime" / "niveles_minijuegos.json").read_text("utf-8"))["juegos"]
    din = [juegos["shake_charge"]["niveles"][str(n)]["params"] for n in range(1, 6)]
    far = [juegos["rumbo_doble"]["niveles"][str(n)]["params"] for n in range(1, 6)]
    assert [p["dinamo_fases"] * p["dinamo_segundos"] for p in din] == sorted(p["dinamo_fases"] * p["dinamo_segundos"] for p in din)
    assert din[1]["dinamo_fases"] == 3 and din[1]["dinamo_segundos"] == 25 and din[1]["dinamo_ancho"] == 0.5
    assert [p["faros"] for p in far] == [4, 6, 6, 6, 6]
    assert [p["hold_ms"] for p in far] == sorted(p["hold_ms"] for p in far) and far[1]["hold_ms"] == 3000
    assert [p["senuelos"] for p in far] == sorted(p["senuelos"] for p in far) and far[1]["senuelos"] == 2


def test_las_pantallas_de_siempre_mandan_a_dinamo_y_faros():
    motion = (FAMILIAS / "motionChallenge" / "RuntimeScreen.tsx").read_text("utf-8")
    rumbo = (FAMILIAS / "bearingHunt" / "RuntimeScreen.tsx").read_text("utf-8")
    assert "=== 'shake_charge') return <DinamoRuntimeScreen" in motion
    assert "return <FarosRuntimeScreen" in rumbo
    # La ruta de pruebas guardaba «Rumbo doble» como motion_challenge: también debe salir Faros, no Dinamo.
    assert motion.index("=== 'rumbo_doble'") < motion.index("=== 'shake_charge') return <DinamoRuntimeScreen")
    for f, juego in ((FAMILIAS / "bearingHunt" / "FarosRuntimeScreen.tsx", "rumbo_doble"),
                     (FAMILIAS / "motionChallenge" / "DinamoRuntimeScreen.tsx", "dinamo")):
        src = f.read_text("utf-8")
        assert "requestPermission" in src and "penalizacionDelModo" in src and "prefers-reduced-motion" in src
        assert f"game: '{juego}'" in src
    faros_src = (FAMILIAS / "bearingHunt" / "FarosRuntimeScreen.tsx").read_text("utf-8")
    assert "encendidosRef.current.indexOf(false)" in faros_src, "los faros van de uno en uno"
    assert "penalizacionRef.current" in faros_src and "BARCO_PENALIZACION_MS = 15000" in faros_src
    assert "objetivos_ok: faros.length" in (FAMILIAS / "bearingHunt" / "FarosRuntimeScreen.tsx").read_text("utf-8")
