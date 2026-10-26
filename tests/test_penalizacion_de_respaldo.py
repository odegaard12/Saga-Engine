# -*- coding: utf-8 -*-
"""26/10: el código de respaldo cuesta lo que tardan los demás en ESE nodo (1-3 min), no 2 min fijos.

Con la ruta real un juego tarda de 27 a 102 s de mediana y la ruta entera unos 6 min: 2 min fijos eran de dos a cuatro
veces lo normal. Con pocos datos vale 1 min. El servidor lo cobra y además lo manda con cada nodo para que el botón
«Validar (+1m)» diga lo mismo que se cobra.
"""
import os
import re
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-respaldo-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import tiempos_de_nodo as tn  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
S = 1000


def test_con_pocos_datos_o_juegos_rapidos_vale_un_minuto():
    assert tn.penalizacion_de_respaldo([]) == 60 * S
    assert tn.penalizacion_de_respaldo([90 * S, 100 * S]) == 60 * S, "con menos de 3 jugadores no se fía de la mediana"
    assert tn.penalizacion_de_respaldo([27 * S, 30 * S, 31 * S]) == 60 * S, "un juego de 30 s no cuesta más de 1 min"


def test_un_juego_lento_cuesta_su_mediana_con_tope_de_tres_minutos():
    assert tn.penalizacion_de_respaldo([80 * S, 102 * S, 130 * S]) == 100 * S
    assert tn.penalizacion_de_respaldo([100 * S, 110 * S, 120 * S, 130 * S]) == 115 * S, "par: media de las dos centrales"
    assert tn.penalizacion_de_respaldo([400 * S, 500 * S, 600 * S]) == 180 * S


def test_basura_no_rompe_la_mediana():
    assert tn.penalizacion_de_respaldo([None, "x", True, -5, 0, 90 * S, 95 * S, 100 * S]) == 95 * S


def test_el_servidor_cobra_el_precio_del_nodo(monkeypatch):
    timers = {
        f"J{i}": {"nodos": {"0": {"node_id": "7", "applied_ms": ms, "manual": False}}}
        for i, ms in enumerate([90 * S, 100 * S, 110 * S])
    }
    # Los que usaron el respaldo o iban en modo prueba no marcan el precio.
    timers["X"] = {"nodos": {"0": {"node_id": "7", "applied_ms": 900 * S, "manual": True}}}
    timers["Y"] = {"nodos": {"0": {"node_id": "7", "applied_ms": 900 * S, "manual": False, "prueba": True}}}
    monkeypatch.setattr(main, "load_player_timers", lambda: timers)
    main._RESPALDO_CACHE["hasta"] = 0.0
    try:
        assert main.penalizacion_de_respaldo_ms("7") == 100 * S
        assert main.penalizacion_de_respaldo_ms(7) == 100 * S
        assert main.penalizacion_de_respaldo_ms("sin-datos") == main.PENALIZACION_CODIGO_A_MANO_MS == 60 * S
        assert main.penalizacion_minima(0, manual=True, node_id="7") == 100 * S
        assert main.penalizacion_minima(0, manual=True) == 60 * S, "sin nodo, el mínimo"
        assert main.penalizacion_minima(150 * S, manual=True, node_id="7") == 150 * S, "si el móvil pide más, se respeta"
        assert main.penalizacion_minima(0, manual=False, node_id="7") == 0
    finally:
        main._RESPALDO_CACHE["hasta"] = 0.0


def test_el_precio_viaja_con_cada_nodo(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main._RESPALDO_CACHE["hasta"] = 0.0
    cliente = TestClient(main.app)
    datos = cliente.get("/api/game/PLAYER%201").json()
    assert datos["current_stage"]["penalizacion_respaldo_ms"] == 60 * S
    assert all(isinstance(n.get("penalizacion_respaldo_ms"), int) for n in datos["stages"])


def test_el_cliente_ya_no_lleva_los_dos_minutos_clavados():
    for ruta in (
        "frontend/src/player/PlayerApp.tsx",
        "frontend/src/player/components/InteractionSheet.tsx",
        "frontend/src/player/components/PlayerHud.tsx",
    ):
        texto = (RAIZ / ruta).read_text(encoding="utf-8")
        assert not re.search(r"onSubmitCode\([^)]*120000|handleSubmitCode\([^)]*120000", texto), ruta
        assert "penalizacionDeRespaldo" in texto, ruta
