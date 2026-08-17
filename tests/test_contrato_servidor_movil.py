# -*- coding: utf-8 -*-
"""El servidor y el móvil tienen que creer lo mismo.

Ya mordió una vez: el servidor mandaba `level` y `duplicate` en la respuesta del
avance, dos campos que decidían si un nodo contaba, y el tipo del móvil no los
declaraba. Como para TypeScript no existían, nadie los leía y los nodos
completados se perdían en silencio. Nadie contrastaba las dos mitades.

Lo suyo sería generar los tipos del móvil a partir del esquema del servidor,
pero el servidor no lo publica: ningún endpoint declara `response_model`, así
que su OpenAPI trae las rutas y ninguna forma de respuesta. Ponerlos a todos es
un trabajo aparte y bastante grande.

Mientras tanto esto hace lo que de verdad hace falta: llama a los endpoints de
verdad y compara los campos que llegan con los que el móvil dice conocer.

⚠️ Sólo mira el primer nivel. Un campo anidado que cambie por dentro no lo caza.
"""
import json
import os
import re
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-contrato-"))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import game as game_router  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
TIPOS_JUGADOR = RAIZ / "frontend" / "src" / "types" / "player.ts"
TIPOS_API = RAIZ / "frontend" / "src" / "shared" / "api.ts"


def campos_declarados(fichero: Path, nombre: str) -> set[str]:
    """Los campos de primer nivel de un tipo de TypeScript.

    Se lee el fuente en vez de compilarlo porque no hay Node en todas las
    máquinas donde corren estos tests, y para comparar nombres de campo sobra.
    """
    texto = fichero.read_text(encoding="utf-8")

    inicio = re.search(
        r"(?:export\s+)?(?:interface|type)\s+%s\b[^{]*\{" % re.escape(nombre), texto
    )
    assert inicio, "no se encontró el tipo %s en %s" % (nombre, fichero.name)

    # Hasta la llave que cierra, contando anidamiento.
    profundidad = 0
    fin = inicio.end()
    for i in range(inicio.end() - 1, len(texto)):
        if texto[i] == "{":
            profundidad += 1
        elif texto[i] == "}":
            profundidad -= 1
            if profundidad == 0:
                fin = i
                break

    cuerpo = texto[inicio.end() : fin]

    # Fuera los bloques anidados: sólo interesa el primer nivel.
    plano = re.sub(r"\{[^{}]*\}", "", cuerpo)
    while "{" in plano:
        nuevo = re.sub(r"\{[^{}]*\}", "", plano)
        if nuevo == plano:
            break
        plano = nuevo

    # Y fuera los comentarios, que llevan dos puntos y despistan al patrón.
    plano = re.sub(r"/\*.*?\*/", "", plano, flags=re.DOTALL)
    plano = re.sub(r"//[^\n]*", "", plano)

    return {m.group(1) for m in re.finditer(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\??\s*:", plano, re.M)}


@pytest.fixture
def cliente(monkeypatch):
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()

    app = FastAPI()
    app.include_router(game_router.router)
    return TestClient(app)


def _un_jugador():
    perfiles = main.get_player_profiles(main.load_config())
    assert perfiles, "la misión de pruebas necesita al menos un jugador"
    return perfiles[0].get("id")


def comparar(respuesta: dict, declarados: set[str], etiqueta: str):
    llegan = set(respuesta.keys())

    ignorados = llegan - declarados
    assert not ignorados, (
        "%s: el servidor manda campos que el móvil no declara, así que los "
        "ignora en silencio. Es exactamente el fallo que perdía nodos "
        "completados: %s" % (etiqueta, sorted(ignorados))
    )


def test_a_partida_di_o_mesmo_nos_dous_lados(cliente):
    user = _un_jugador()
    respuesta = cliente.get("/api/game/%s" % user).json()

    comparar(respuesta, campos_declarados(TIPOS_JUGADOR, "PlayerGamePayload"), "/api/game")


def test_o_avance_di_o_mesmo_nos_dous_lados(cliente):
    """El que ya falló: `level` y `duplicate` llegaban y nadie los leía."""
    user = _un_jugador()
    main.set_player_progress_level(user, 0)
    main.set_player_progress_level(user, 2)

    declarados = campos_declarados(TIPOS_API, "AdvanceResponse")

    # Las tres formas de contestar del endpoint, no sólo la buena.
    eco = cliente.post(
        "/api/advance", json={"user": user, "code": "OK", "level_before": 1}
    ).json()
    por_diante = cliente.post(
        "/api/advance", json={"user": user, "code": "OK", "level_before": 7}
    ).json()
    fallo = cliente.post(
        "/api/advance", json={"user": user, "code": "NON_VALE", "level_before": 2}
    ).json()

    comparar(eco, declarados, "/api/advance (eco)")
    comparar(por_diante, declarados, "/api/advance (va por delante)")
    comparar(fallo, declarados, "/api/advance (código malo)")


def test_a_taboa_de_equipo_di_o_mesmo_nos_dous_lados(cliente):
    user = _un_jugador()
    respuesta = cliente.get("/api/team/%s" % user).json()

    comparar(respuesta, campos_declarados(TIPOS_JUGADOR, "TeamStatusPayload"), "/api/team")


def test_o_latido_di_o_mesmo_nos_dous_lados(cliente):
    user = _un_jugador()
    respuesta = cliente.post(
        "/api/heartbeat",
        json={"user": user, "lat": 42.4, "lon": -8.6, "gps_status": "ok", "equipo": True},
    ).json()

    comparar(respuesta, campos_declarados(TIPOS_API, "HeartbeatResponse"), "/api/heartbeat")


def test_o_lector_de_tipos_funciona():
    """Si el lector fallara callando, los tests de arriba pasarían siempre."""
    campos = campos_declarados(TIPOS_JUGADOR, "PlayerGamePayload")

    assert "level" in campos
    assert "stages" in campos
    assert "stages_rev" in campos
    assert len(campos) > 5, "algo va mal leyendo el tipo: salen muy pocos campos"
