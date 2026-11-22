# -*- coding: utf-8 -*-
"""22/11: «Precalentar mapa para la partida» (panel → Cloudflare).

El panel pide los mismos lotes GET que un móvil sin nada guardado, por el dominio público y de 2 en 2. Antes pregunta
a /api/admin/mapa/precalentar: con la sesión del panel, fuera de 17:30-18:35 (Madrid), con el disco libre y lo que
ocupa dem_webp, la versión del mapa 3D y los nodos como los ve un jugador en el nivel 0.
"""
import json
import os
import shutil
import subprocess
import tempfile
from collections import namedtuple
from datetime import datetime
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-precalentar-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import admin as admin_router  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
FRONT = RAIZ / "frontend" / "src"
RUTA = "/api/admin/mapa/precalentar"
Uso = namedtuple("Uso", "total used free")
# Rutas inventadas (de ninguna misión real); el trazado en una variable, como en test_plan_de_teselas.
TRAZADO = [[41.5 + i * 0.001, -5.5 + i * 0.0013] for i in range(31)]
CLAVE_TRAZADO = "route_track"
NODOS = [
    {"id": 1, "title": "Uno", "lat": 41.5, "lon": -5.5, "radius": 30, "type": "checkpoint"},
    {"id": 2, "title": "Dos", "lat": 41.53, "lon": -5.46, "radius": 30, "type": "checkpoint", CLAVE_TRAZADO: TRAZADO},
]


@pytest.fixture
def panel(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(main, "get_runtime_stages", lambda: [dict(n) for n in NODOS])
    monkeypatch.setattr(admin_router, "_ahora_en_madrid", lambda: datetime(2026, 11, 22, 12, 0))
    monkeypatch.setattr(shutil, "disk_usage", lambda ruta: Uso(10_000 * 1048576, 0, 2_000 * 1048576))
    return monkeypatch, tmp_path


def test_sin_sesion_del_panel_no_responde(monkeypatch):
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: False)
    r = TestClient(main.app).post(RUTA, json={})
    assert r.status_code == 403
    assert "stages" not in r.json()


def test_da_disco_libre_dem_webp_y_los_nodos_del_nivel_cero(panel):
    _, datos = panel
    carpeta = datos / "dem_webp" / "14" / "1"
    carpeta.mkdir(parents=True)
    (carpeta / "2.bin").write_bytes(b"x" * 3 * 1048576)
    (carpeta / "2.ct").write_bytes(b"image/webp")

    r = TestClient(main.app).post(RUTA, json={})
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["libre_mb"] == 2000 and cuerpo["poco_disco"] is False
    assert cuerpo["libre_minimo_mb"] == 500
    assert cuerpo["dem_webp_mb"] == 3.0
    assert cuerpo["dem_webp_tope_mb"] == 256
    assert "mapa3d_version" in cuerpo
    # 22/11: y las que entran en la URL de los lotes, iguales que las de /api/config.
    config = TestClient(main.app).get("/api/config").json()
    assert cuerpo["teselas_version"] == config["teselas_version"] and cuerpo["relieve_version"] == config["relieve_version"]
    # Sólo la geometría que usa el plan del móvil, y la misma que le da /api/game a un jugador en el nivel 0.
    assert cuerpo["stages"] == [
        {"lat": 41.5, "lon": -5.5},
        {"lat": 41.53, "lon": -5.46, CLAVE_TRAZADO: TRAZADO},
    ]


def test_con_poco_disco_avisa(panel):
    monkeypatch, _ = panel
    monkeypatch.setattr(shutil, "disk_usage", lambda ruta: Uso(10_000 * 1048576, 0, 499 * 1048576))
    cuerpo = TestClient(main.app).post(RUTA, json={}).json()
    assert cuerpo["libre_mb"] == 499 and cuerpo["poco_disco"] is True


@pytest.mark.parametrize(
    "hora,vedada",
    [((17, 29), False), ((17, 30), True), ((18, 0), True), ((18, 34), True), ((18, 35), False), ((9, 0), False)],
)
def test_no_arranca_entre_las_17_30_y_las_18_35(panel, hora, vedada):
    monkeypatch, _ = panel
    monkeypatch.setattr(admin_router, "_ahora_en_madrid", lambda: datetime(2026, 11, 22, *hora))
    r = TestClient(main.app).post(RUTA, json={})
    if vedada:
        assert r.status_code == 409 and r.json()["bloqueado"] is True
        assert "stages" not in r.json()
    else:
        assert r.status_code == 200


def test_la_hora_es_la_de_madrid():
    assert str(admin_router._ahora_en_madrid().tzinfo) == "Europe/Madrid"


def _leer(ruta):
    return (FRONT / ruta).read_text(encoding="utf-8")


def test_el_panel_usa_la_misma_funcion_que_el_movil():
    panel = _leer("admin/components/PrecalentarMapa.tsx")
    mapa = _leer("player/offline/mapTileCache.ts")
    assert "urlsDeLotesDelPlan" in panel and "from '../../player/offline/mapTileCache'" in panel
    assert "fijarVersionDelMapa3d(datos.mapa3d_version, { relieve: datos.relieve_version, teselas: datos.teselas_version })" in panel
    # Ni una URL de lote escrita a mano en el panel: sale de urlDeLote, la misma que usa el móvil.
    assert "/api/teselas/lote/" not in panel
    assert "urlDeLote(opciones.versionLotes ?? '', lista)" in mapa
    assert "const lotes = lotesDeTeselas(faltan)" in mapa
    assert "lotesDeTeselas(plan.urls).map((lista) => urlDeLote(version, lista))" in mapa
    # Una sola plantilla de URL de lote en todo el frontend.
    plantillas = sum(p.read_text(encoding="utf-8").count("/api/teselas/lote/${") for p in FRONT.rglob("*.ts*"))
    assert plantillas == 1
    # De 2 en 2, por el dominio público (URL relativas) y sin cabeceras que pidan saltarse la caché.
    assert "const A_LA_VEZ = 2" in panel
    assert "cache: 'no-store'" in panel and "no-cache" not in panel.split("export default")[1]
    assert "<PrecalentarMapa />" in _leer("admin/components/SettingsPanel.tsx")


@pytest.mark.skipif(
    shutil.which("node") is None or not (RAIZ / "frontend" / "node_modules" / "typescript").exists(),
    reason="hace falta Node y las dependencias del frontend",
)
def test_las_urls_del_panel_son_las_que_pide_un_movil_nuevo():
    proceso = subprocess.run(
        ["node", str(RAIZ / "tests" / "js" / "lotes_precalentar.cjs")],
        input=json.dumps(NODOS), capture_output=True, text=True, encoding="utf-8", timeout=300, cwd=RAIZ,
    )
    assert proceso.returncode == 0, proceso.stderr[-2000:]
    salida = json.loads(proceso.stdout)
    assert len(salida["panel"]) > 3
    assert salida["panel"] == salida["movil"]
    assert all(u.endswith("&f=webp") for u in salida["panel"])
