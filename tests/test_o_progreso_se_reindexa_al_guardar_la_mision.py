# -*- coding: utf-8 -*-
"""El nivel guardado es un índice en la lista de nodos, no un id. Borrar o
insertar un nodo desde el panel desplazaba ese índice sin que cambiara lo
que el jugador ya había superado de verdad -ver docs/plan-de-mejora.md
§1.2-. Hasta ahora sólo había un aviso ANTES de guardar
(`jugadoresDesprazadosPolGardado`, 4.9.31); esto es la corrección de
verdad, en `backend/app/runtime/mision_reindex.py`, enganchada en
`POST /api/admin/save`.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-reindex-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime.mision_reindex import reindex_player_levels  # noqa: E402


def _stages(*ids):
    return [{"id": id_} for id_ in ids]


# ---------------------------------------------------------------------------
# La función pura: reindex_player_levels
# ---------------------------------------------------------------------------

def test_sen_cambios_o_nivel_non_se_toca():
    antes = _stages("a", "b", "c")
    despois = _stages("a", "b", "c")
    assert reindex_player_levels(antes, despois, {"ALFA": 2}) == {"ALFA": 2}


def test_borrar_un_nodo_anterior_desprace_o_nivel_cara_atras():
    """Síntoma 1 del plan: borrar un nodo por delante saltaba al jugador un
    nodo entero -su "próximo pendiente" seguía siendo el índice 2, pero ese
    índice ahora es OTRO nodo-."""
    antes = _stages("a", "b", "c", "d")
    despois = _stages("a", "c", "d")  # se borró "b"

    # ALFA había superado "a" y "b" (nivel 2 = próximo pendiente es "c",
    # índice 2 en la lista vieja). "b" ya no existe: el último que sobrevive
    # es "a", en el índice 0 de la lista nueva -> próximo pendiente = 1.
    assert reindex_player_levels(antes, despois, {"ALFA": 2}) == {"ALFA": 1}


def test_borrar_nodos_de_sobra_non_marca_terminado_a_quen_non_termino():
    """Síntoma 2 del plan: borrar nodos por delante podía dar la misión por
    terminada sin que el jugador hubiera jugado nada de eso."""
    antes = _stages("a", "b", "c", "d", "e")
    despois = _stages("d", "e")  # se borraron "a", "b" y "c"

    # BETA sólo había superado "a" (nivel 1). Ninguno de sus nodos superados
    # sobrevive -> vuelve al nodo 1, NO a "terminado".
    resultado = reindex_player_levels(antes, despois, {"BETA": 1})
    assert resultado == {"BETA": 0}
    assert resultado["BETA"] < len(despois), "no puede marcarse terminado sin haber jugado nada"


def test_insertar_un_nodo_anterior_desprace_o_nivel_cara_adiante():
    antes = _stages("a", "b")
    despois = _stages("a", "x", "b")  # se insertó "x" entre medias

    # GAMMA había superado sólo "a" (nivel 1). "a" sigue en el índice 0 ->
    # próximo pendiente = 1, que ahora es "x", no "b": bien, porque "x" es
    # nuevo y toca jugarlo.
    assert reindex_player_levels(antes, despois, {"GAMMA": 1}) == {"GAMMA": 1}


def test_quen_xa_rematara_a_mision_segue_rematado():
    antes = _stages("a", "b", "c")
    despois = _stages("a", "b")  # se borró el último nodo

    # DELTA tenía nivel 3 = len(antes): había terminado la misión entera, no
    # hay "nodo actual" del que tirar. Sigue terminado, con el nuevo total.
    assert reindex_player_levels(antes, despois, {"DELTA": 3}) == {"DELTA": 2}


def test_quen_non_empezou_segue_sen_empezar():
    antes = _stages("a", "b")
    despois = _stages("x", "a", "b")
    assert reindex_player_levels(antes, despois, {"EPSILON": 0}) == {"EPSILON": 0}


def test_non_muta_o_diccionario_orixinal():
    antes = _stages("a", "b")
    despois = _stages("b")
    niveles = {"ALFA": 1}
    reindex_player_levels(antes, despois, niveles)
    assert niveles == {"ALFA": 1}, "no debe mutar el dict que se le pasa"


# ---------------------------------------------------------------------------
# Enganchado de verdad en POST /api/admin/save
# ---------------------------------------------------------------------------

def make_client():
    return TestClient(main.app)


def configurar(monkeypatch):
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    monkeypatch.setattr(main, "validate_stages", lambda stages: [])


def test_o_endpoint_reindexa_o_nivel_gardado_ao_borrar_un_nodo(monkeypatch):
    configurar(monkeypatch)
    client = make_client()

    main.save_stages(main.STAGES_DB, _stages("a", "b", "c", "d"))
    main.set_player_progress_level("ALFA", 2, desde_admin=True)
    assert main.get_player_progress_level("ALFA") == 2

    respuesta = client.post(
        "/api/admin/save",
        json={"stages": _stages("a", "c", "d")},
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["status"] == "ok"
    assert main.get_player_progress_level("ALFA") == 1


def test_o_endpoint_non_marca_terminado_a_quen_non_termino(monkeypatch):
    configurar(monkeypatch)
    client = make_client()

    main.save_stages(main.STAGES_DB, _stages("a", "b", "c", "d", "e"))
    main.set_player_progress_level("BETA", 1, desde_admin=True)
    assert main.get_player_progress_level("BETA") == 1

    respuesta = client.post(
        "/api/admin/save",
        json={"stages": _stages("d", "e")},
    )

    assert respuesta.status_code == 200
    nivel = main.get_player_progress_level("BETA")
    assert nivel == 0, "BETA no jugó nada de 'd' ni 'e': no puede salir terminado"
