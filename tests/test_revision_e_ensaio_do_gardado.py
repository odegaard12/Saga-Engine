# -*- coding: utf-8 -*-
"""Contratos 1 y 2 con el panel: `stages_revision` y el ensayo (`dry_run`) del guardado.

- Dos administradores (o una pestaña vieja) guardaban la misión entera sin que
  nadie avisara de que pisaban el trabajo del otro (caza de fallos A7). El panel
  manda ahora la huella con la que cargó los nodos y el servidor contesta 409 si
  ya no es la actual.
- Borrar o reordenar nodos con gente en ruta movía a los jugadores; el aviso del
  panel comparaba con niveles obsoletos (A12). Con `dry_run` el servidor dice, sin
  escribir nada, a quién movería.
"""
import copy
import os
import re
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-revision-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import revisiones  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    main.set_player_progress_level("PLAYER 1", 3)  # ha superado 101, 102 y 103
    main.set_player_progress_level("PLAYER 2", 1)  # sólo 101
    return TestClient(main.app)


def _guardados():
    return main.load_stages(main.STAGES_DB)


def _revision(cliente):
    return cliente.post("/api/admin/react-overview", json={}).json()["stages_revision"]


# ---------------------------------------------------------------------------
# Contrato 1: stages_revision
# ---------------------------------------------------------------------------

def test_el_resumen_y_las_etapas_traen_la_misma_huella_de_16_hex(sitio):
    resumen = sitio.post("/api/admin/react-overview", json={}).json()
    etapas = sitio.post("/api/admin/stages", json={}).json()

    assert re.fullmatch(r"[0-9a-f]{16}", resumen["stages_revision"])
    assert etapas["stages_revision"] == resumen["stages_revision"]
    assert etapas["status"] == "ok" and len(etapas["stages"]) == 6
    assert etapas["stages_revision"] == revisiones.admin_stages_revision(_guardados())


def test_la_huella_es_estable_y_cambia_solo_si_cambian_los_nodos(sitio):
    inicial = _revision(sitio)
    assert _revision(sitio) == inicial

    nodos = _guardados()
    nodos[0]["title"] = "Otro titulo"
    main.save_stages(main.STAGES_DB, nodos)

    assert _revision(sitio) != inicial


def test_la_huella_no_depende_del_orden_de_las_claves():
    a = [{"id": 1, "title": "x", "lat": 1.0}]
    b = [{"lat": 1.0, "title": "x", "id": 1}]

    assert revisiones.admin_stages_revision(a) == revisiones.admin_stages_revision(b)
    assert revisiones.admin_stages_revision([]) == revisiones.admin_stages_revision("no es una lista")


def test_guardar_con_la_huella_actual_funciona_y_devuelve_la_nueva(sitio):
    actual = _revision(sitio)
    nodos = _guardados()
    nodos[0]["title"] = "Cambiado por el panel"

    resposta = sitio.post("/api/admin/save", json={"stages": nodos, "stages_revision": actual})

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "ok"
    assert corpo["stages_revision"] == _revision(sitio) != actual
    assert _guardados()[0]["title"] == "Cambiado por el panel"


def test_guardar_con_una_huella_vieja_da_409_y_no_escribe_nada(sitio):
    vieja = _revision(sitio)
    # Otro administrador guarda antes.
    otro = _guardados()
    otro[1]["title"] = "Trabajo del otro administrador"
    main.save_stages(main.STAGES_DB, otro)

    mio = copy.deepcopy(_guardados())
    mio[0]["title"] = "Mi cambio"
    resposta = sitio.post("/api/admin/save", json={"stages": mio, "stages_revision": vieja})

    assert resposta.status_code == 409
    assert resposta.json() == {
        "status": "conflict",
        "reason": "stages_changed",
        "current_revision": revisiones.admin_stages_revision(_guardados()),
    }
    assert _guardados()[0]["title"] != "Mi cambio", "el conflicto no debe guardar nada"
    assert _guardados()[1]["title"] == "Trabajo del otro administrador"


def test_sin_huella_se_guarda_como_siempre(sitio):
    nodos = _guardados()
    nodos[0]["title"] = "Sin huella"

    resposta = sitio.post("/api/admin/save", json={"stages": nodos})

    assert resposta.status_code == 200 and resposta.json()["status"] == "ok"
    assert _guardados()[0]["title"] == "Sin huella"


# ---------------------------------------------------------------------------
# Contrato 2: dry_run
# ---------------------------------------------------------------------------

def _sin_el(nodos, id_):
    return [n for n in nodos if n["id"] != id_]


def test_el_ensayo_no_escribe_nada(sitio):
    antes_nodos = copy.deepcopy(_guardados())
    antes_niveles = dict(main.load_player_progress())
    antes_marca = {j: main.player_reset_at(j) for j in ("PLAYER 1", "PLAYER 2")}

    resposta = sitio.post(
        "/api/admin/save", json={"stages": _sin_el(_guardados(), 102), "dry_run": True}
    )

    assert resposta.status_code == 200
    assert resposta.json()["dry_run"] is True and resposta.json()["status"] == "ok"
    assert _guardados() == antes_nodos
    assert dict(main.load_player_progress()) == antes_niveles
    assert {j: main.player_reset_at(j) for j in ("PLAYER 1", "PLAYER 2")} == antes_marca


def test_el_ensayo_lista_a_quien_cambiaria_de_nodo_con_los_campos_del_contrato(sitio):
    resposta = sitio.post(
        "/api/admin/save", json={"stages": _sin_el(_guardados(), 102), "dry_run": True}
    ).json()

    (afectado,) = resposta["afectados"]  # PLAYER 2 tenía por delante el 102, que se borra
    assert afectado["user"] == "PLAYER 2"
    assert {"user", "display_name", "level_antes", "level_despues", "nodo_antes", "nodo_despues"} <= set(afectado)
    assert afectado["level_antes"] == 1 and afectado["level_despues"] == 1
    assert afectado["nodo_antes"] == "Pegatina", "el nodo que iba a hacer"
    assert afectado["nodo_despues"] == "Cuenta", "el que le tocaría después del guardado"


def test_quien_solo_ve_desplazado_su_indice_no_es_un_afectado(sitio):
    """PLAYER 1 sigue teniendo por delante el mismo nodo (104) aunque su nivel baje."""
    resposta = sitio.post(
        "/api/admin/save", json={"stages": _sin_el(_guardados(), 102), "dry_run": True}
    ).json()

    assert "PLAYER 1" not in {a["user"] for a in resposta["afectados"]}


def test_intercambiar_dos_nodos_hechos_hace_rehacer_uno_y_el_ensayo_lo_dice(sitio):
    nodos = _guardados()
    nodos[1], nodos[2] = nodos[2], nodos[1]  # 102 y 103, ambos ya hechos por PLAYER 1

    resposta = sitio.post("/api/admin/save", json={"stages": nodos, "dry_run": True}).json()

    afectado = next(a for a in resposta["afectados"] if a["user"] == "PLAYER 1")
    assert afectado["level_antes"] == 3 and afectado["level_despues"] == 2
    assert afectado["nodo_despues"] == "Pegatina", "tendría que rehacer un nodo que ya había hecho"


def test_un_nodo_nuevo_antes_del_pendiente_afecta_a_quien_lo_tenia_por_delante(sitio):
    nodos = _guardados()
    nuevo = copy.deepcopy(nodos[0])
    nuevo["id"] = 999
    nuevo["title"] = "Nodo nuevo"
    nodos.insert(3, nuevo)  # justo antes del 104, que es lo que le tocaba a PLAYER 1

    resposta = sitio.post("/api/admin/save", json={"stages": nodos, "dry_run": True}).json()

    afectado = next(a for a in resposta["afectados"] if a["user"] == "PLAYER 1")
    assert afectado["nodo_antes"] == "Trampa" and afectado["nodo_despues"] == "Nodo nuevo"


def test_el_ensayo_coincide_con_lo_que_pasa_al_guardar_de_verdad(sitio):
    nodos = _sin_el(_guardados(), 102)
    prevision = sitio.post("/api/admin/save", json={"stages": nodos, "dry_run": True}).json()["afectados"]

    assert sitio.post("/api/admin/save", json={"stages": nodos}).json()["status"] == "ok"

    for afectado in prevision:
        assert main.get_player_progress_level(afectado["user"], 0) == afectado["level_despues"]


def test_el_ensayo_tambien_valida_los_nodos_y_respeta_la_huella(sitio):
    invalido = sitio.post("/api/admin/save", json={"stages": [{"id": 1}], "dry_run": True})
    assert invalido.status_code == 400 and invalido.json()["detail"] == "invalid stages"

    viejo = sitio.post(
        "/api/admin/save",
        json={"stages": _guardados(), "dry_run": True, "stages_revision": "0000000000000000"},
    )
    assert viejo.status_code == 409 and viejo.json()["reason"] == "stages_changed"
