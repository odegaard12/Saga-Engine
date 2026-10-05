# -*- coding: utf-8 -*-
"""Revisión del motor del 05/10/2026, lado del móvil: se EJECUTA la lógica TS
(tests/js/revision_motor.cjs, en el navegador de mentira de entorno_navegador.cjs).

- M4: la red de caminos se reintenta sola si no llega a la primera.
- F5: las fotos de campo borradas o purgadas salen de la caché del móvil.
- T1: un compañero sin latido hace rato sale «sin conexión», no «hace 120 min».
- GPS: la posición restaurada de la sesión anterior se pinta, pero no abre nodos.
- M2: la brújula de respaldo sin WebGL (rumbo, distancia, punto cardinal).
- Mosaico: el sha256 del móvil coincide con el del servidor.

Sin Node o sin frontend/node_modules, se salta.
"""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
ARNES = RAIZ / "tests" / "js" / "revision_motor.cjs"


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    proceso = subprocess.run(
        [node, str(ARNES)], capture_output=True, text=True, encoding="utf-8", timeout=240, cwd=str(RAIZ)
    )
    assert proceso.returncode == 0, proceso.stderr[-3000:]
    datos = json.loads(proceso.stdout)
    errores = {k: v["__error"] for k, v in datos.items() if isinstance(v, dict) and "__error" in v}
    assert not errores, errores
    return datos


def test_la_red_de_caminos_se_reintenta_y_avisa(js):
    r = js["redDeCaminos"]
    assert r["primera"] is False, "la primera vez no había red"
    assert r["listaDespues"] is True, "no se volvió a intentar: la guía iría recta toda la partida"
    assert r["avisos"] == 1
    assert r["trasCerrar"] == 1, "cerrada (mapa desmontado) no debe seguir pidiendo"
    assert r["sinRedNunca"] == 1 + len(r["esperas"]), "los reintentos tienen tope"


def test_las_fotos_retiradas_salen_de_la_cache(js):
    r = js["fotosRetiradas"]
    assert r["borradas"] == 3
    assert r["quedan"] == [
        "/api/field-proofs/viva/image",
        "/api/field-proofs/viva/thumb",
        "/api/player-avatar/p1",
        "/media/nodo/9/abc.webp",
    ]


def test_sin_latido_hace_rato_es_sin_conexion(js):
    r = dict(js["presencia"]["resultado"])
    assert r == {"a": "offline", "b": "stale", "c": "live", "d": "stale", "yo": "stale"}


def test_la_posicion_de_ayer_no_abre_nodos(js):
    r = js["posicionParaAbrir"]
    assert r["restaurada"] is False
    assert r["reciente"] is True
    assert r["vieja"] is False
    assert r["delFuturo"] is False


def test_la_brujula_sin_mapa(js):
    r = js["sinMapa"]
    assert (r["norte"], r["este"], r["sur"], r["oeste"]) == (0, 90, 180, 270)
    assert r["giro"] == 330 and r["giroSinBrujula"] == 90
    assert r["distancias"][:3] == ["85 m", "1,2 km", "1.2 km"]
    assert r["cardinales"] == ["N", "SO", "SW", "N"]


def test_el_hash_del_mosaico_es_el_del_servidor(js):
    assert js["hashDelMosaico"]["h"] == hashlib.sha256(b"9:mosaico:2").hexdigest()


def test_el_mosaico_compara_con_el_hash():
    codigo = (RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "placeMosaic" / "RuntimeScreen.tsx").read_text(encoding="utf-8")
    assert "sha256Hex(`${answerSalt}:${indice}`) === answerHash" in codigo
    assert "if (respuestaCorrecta(answerIndex))" in codigo


def test_los_juegos_no_deciden_dentro_de_un_actualizador_de_estado():
    """wordTrap y motionChallenge avanzaban de ronda / daban por ganado DENTRO de
    `setX((prev) => …)`; React puede llamar dos veces a esos actualizadores."""
    base = RAIZ / "frontend" / "src" / "player" / "minigames" / "families"
    palabras = (base / "wordTrap" / "RuntimeScreen.tsx").read_text(encoding="utf-8")
    assert "setPenaltyAccumMs((prev)" not in palabras
    assert "Preparando las preguntas trampa" not in palabras
    movimiento = (base / "motionChallenge" / "RuntimeScreen.tsx").read_text(encoding="utf-8")
    assert "setValidPulses((value)" not in movimiento
    assert "setHeat((value)" not in movimiento


def test_el_punto_de_control_usa_la_posicion_de_la_app_y_el_margen():
    base = RAIZ / "frontend" / "src" / "player" / "minigames"
    host = (base / "core" / "FamilyRuntimeHost.tsx").read_text(encoding="utf-8")
    trozo = host.split("<CheckpointRuntimeScreen", 1)[1].split("/>", 1)[0]
    assert "appPosition={appPosition}" in trozo and "appAccuracy={appAccuracy}" in trozo
    cp = (base / "families" / "signalHunt" / "CheckpointRuntimeScreen.tsx").read_text(encoding="utf-8")
    assert "entry?.require_proximity" in cp
    assert "distance - margen <= radius" in cp


def test_el_desbloqueo_no_usa_la_posicion_restaurada():
    app = (RAIZ / "frontend" / "src" / "player" / "PlayerApp.tsx").read_text(encoding="utf-8")
    assert "posicionValeParaAbrir(browserGpsCapturedAt) ? browserGpsPosition : null" in app
    assert "unlockDistanceMeters - accuracyMargin <= stageRadius" in app


def test_el_microfono_se_suelta_al_superar_el_reto_y_si_llega_tarde():
    audio = (RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "audioChallenge" / "AudioChallengeRuntime.tsx").read_text(encoding="utf-8")
    exito = audio.split("if (lectura.superado) {", 1)[1][:120]
    assert "soltarMicrofono()" in exito, "superado el reto, el micrófono seguía abierto"
    tras_permiso = audio.split("getUserMedia({ audio: true })", 1)[1][:200]
    assert "if (!montadoRef.current)" in tras_permiso and "track.stop()" in tras_permiso


def test_la_guia_del_nodo_no_describe_el_juego_que_ya_no_existe():
    guia = (RAIZ / "frontend" / "src" / "player" / "components" / "RequirementPreviewPanel.tsx").read_text(encoding="utf-8")
    assert "barra de descarga" not in guia
    assert "useI18n" in guia and "gl: {" in guia and "en: {" in guia
    hud = (RAIZ / "frontend" / "src" / "player" / "components" / "PlayerHud.tsx").read_text(encoding="utf-8")
    assert "bajar o mapa" not in hud
    app = (RAIZ / "frontend" / "src" / "player" / "PlayerApp.tsx").read_text(encoding="utf-8")
    assert 'buttonText="Comezar a travesía"' not in app and "title: 'Progreso de Equipo'" not in app
