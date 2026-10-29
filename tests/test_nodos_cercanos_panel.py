# -*- coding: utf-8 -*-
"""26/10: dos nodos no pueden quedar encima o demasiado pegados sin que el panel lo avise (Óscar).

El ensayo y el guardado devuelven los pares a menos de 15 m; dejar a menos de 3 m nodos que antes no lo estaban no se
guarda sin `aceptar_nodos_encima`. Una ruta que ya los tenía apilados se sigue pudiendo guardar. Coordenadas inventadas.
"""
import os
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-cercanos-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import nodos_cercanos as nc  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
# Un grado de latitud son ~111 km: 1e-5 ≈ 1,1 m.
LAT, LON = 40.4153, -3.6842


def _nodo(id_, dlat_m, titulo=None):
    return {"id": id_, "title": titulo or "N%s" % id_, "lat": LAT + dlat_m / 111320.0, "lon": LON, "radius": 35,
            "minigame": {"type": "checkpoint", "config": {}}, "config": {}}


def test_la_cuenta_de_pares():
    pares = nc.pares_cercanos([_nodo(1, 0), _nodo(2, 1), _nodo(3, 10), _nodo(4, 200)])
    por_par = {(p["a_id"], p["b_id"]): p for p in pares}
    assert por_par[(1, 2)]["encima"] is True and por_par[(1, 2)]["metros"] == 1.0
    assert por_par[(1, 3)]["encima"] is False and por_par[(2, 3)]["encima"] is False
    assert all(4 not in k for k in por_par), "a 200 m no hay aviso"


def test_solo_los_pares_encima_nuevos_piden_confirmacion():
    viejos = [_nodo(1, 0), _nodo(2, 0.5), _nodo(3, 100)]
    assert nc.encima_nuevos(viejos, viejos) == [], "lo que ya estaba apilado no bloquea"
    movido = [_nodo(1, 0), _nodo(2, 0.5), _nodo(3, 1)]
    assert {(p["a_id"], p["b_id"]) for p in nc.encima_nuevos(viejos, movido)} == {(1, 3), (2, 3)}
    nuevo_sin_id = viejos + [{**_nodo(None, 0.2)}]
    assert nc.encima_nuevos(viejos, nuevo_sin_id), "un nodo recién creado encima también pide confirmación"


@pytest.fixture
def panel(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    main.save_stages(main.STAGES_DB, [_nodo(1, 0), _nodo(2, 100), _nodo(3, 300)])
    return TestClient(main.app)


def test_mover_un_nodo_encima_de_otro_no_se_guarda_sin_aceptarlo(panel):
    nodos = [_nodo(1, 0), _nodo(2, 1), _nodo(3, 300)]
    r = panel.post("/api/admin/save", json={"stages": nodos})
    assert r.status_code == 422 and r.json()["status"] == "nodos_encima"
    assert r.json()["nodos_cercanos"][0]["encima"] is True
    assert main.load_stages(main.STAGES_DB)[1]["lat"] != nodos[1]["lat"], "no se guardó"

    r = panel.post("/api/admin/save", json={"stages": nodos, "aceptar_nodos_encima": True})
    assert r.status_code == 200 and r.json()["status"] == "ok"
    assert r.json()["nodos_cercanos"][0]["encima"] is True


def test_pegados_pero_no_encima_se_guarda_con_aviso(panel):
    nodos = [_nodo(1, 0), _nodo(2, 10), _nodo(3, 300)]
    r = panel.post("/api/admin/save", json={"stages": nodos})
    assert r.status_code == 200 and r.json()["status"] == "ok"
    assert [(p["a_id"], p["b_id"], p["encima"]) for p in r.json()["nodos_cercanos"]] == [(1, 2, False)]


def test_el_ensayo_tambien_los_devuelve(panel):
    r = panel.post("/api/admin/save", json={"stages": [_nodo(1, 0), _nodo(2, 1), _nodo(3, 300)], "dry_run": True})
    assert r.status_code == 200 and r.json()["dry_run"] is True
    assert r.json()["nodos_cercanos"][0]["encima"] is True


def test_el_panel_avisa_y_pregunta_antes_de_guardar_encima():
    flujo = (RAIZ / "frontend/src/admin/lib/adminSaveFlow.ts").read_text(encoding="utf-8")
    assert "guardado.status === 'nodos_encima'" in flujo and "aceptarNodosEncima: true" in flujo
    assert "describirNodosEncima(" in flujo
    api = (RAIZ / "frontend/src/admin/lib/adminApi.ts").read_text(encoding="utf-8")
    assert "aceptar_nodos_encima: true" in api and "rawStatus === 'nodos_encima'" in api
    shell = (RAIZ / "frontend/src/admin/components/AdminMissionControlShell.tsx").read_text(encoding="utf-8")
    assert "<AvisoNodosCercanos" in shell
    cliente = (RAIZ / "frontend/src/admin/lib/nodosCercanos.ts").read_text(encoding="utf-8")
    assert "export const ENCIMA_M = 3" in cliente and "export const MINIMO_M = 15" in cliente
    assert nc.ENCIMA_M == 3.0 and nc.MINIMO_M == 15.0, "las mismas cifras en servidor y panel"
