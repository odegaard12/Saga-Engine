# -*- coding: utf-8 -*-
"""Auditoría 15/10/2026, fase 1: el código de la pegatina QR no llega en claro al móvil.

Va su hash salado en `qr_hashes` (también sin espacios ni guiones, que el escáner perdona). El móvil lo compara sin
red (offline/clasificarQr.ts y missionPack.ts) y el servidor sigue aceptando el código escaneado al sincronizar.
"""
import hashlib
import json

import main
from backend.app.runtime import mision

NODO = {
    "id": 7, "title": "Nodo de prueba", "lat": 40.0, "lon": -3.0, "radius": 30, "type": "checkpoint",
    "qr_payload": "SAGA_TEST7",
    "physical_qr": {"payload": "SAGA_TEST7", "kind": "checkpoint", "label": "SAGA_TEST7",
                    "card_text": "Escanea SAGA_TEST7 para seguir"},
    "physical_item_label": "SAGA_TEST7",
    "config": {"qr_payload": "SAGA_TEST7"},
}


def _h(codigo):
    return hashlib.sha256(f"7:codigo:{codigo}".encode("utf-8")).hexdigest()


def test_el_movil_recibe_hashes_y_nunca_el_codigo():
    for runtime in (False, True):
        salida = main.project_stage_for_player(dict(NODO), include_runtime=runtime, player_id="P")
        texto = json.dumps(salida)
        assert "SAGA_TEST7" not in texto and "SAGATEST7" not in texto, runtime
        assert "payload" not in salida.get("physical_qr", {}) and salida["physical_qr"]["kind"] == "checkpoint"
        assert set(salida["qr_hashes"]) == {_h("SAGA_TEST7"), _h("SAGATEST7")}


def test_un_nombre_de_objeto_de_verdad_se_queda():
    nodo = {**NODO, "physical_item_label": "Llave de hierro"}
    assert main.project_stage_for_player(nodo, include_runtime=True, player_id="P")["physical_item_label"] == "Llave de hierro"


def test_el_servidor_sigue_aceptando_el_codigo_escaneado():
    assert mision.stage_accepts_code(dict(NODO), "SAGA_TEST7") is True
    assert mision.stage_accepts_code(dict(NODO), "SAGA_OTRO") is False
