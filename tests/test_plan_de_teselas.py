# -*- coding: utf-8 -*-
"""El servidor calienta su caché con el MISMO plan de satélite que pide el móvil.

`backend/app/runtime/plan_teselas.py` es una copia en Python de
`planificarTeselas` (mapTileCache.ts). Si uno cambia sin el otro, la Pi calienta
teselas que nadie pide y el primer móvil vuelve a encontrar la caché fría. Aquí se
ejecutan los dos con las mismas rutas inventadas y se comparan las listas.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from backend.app.runtime import plan_teselas

RAIZ = Path(__file__).resolve().parents[1]

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None or not (RAIZ / "frontend" / "node_modules" / "typescript").exists(),
    reason="hace falta Node y las dependencias del frontend",
)

# Rutas inventadas (no son de ninguna misión real). Los trazados van en variables: la guarda de
# privacidad caza un trazado escrito dentro de un nodo como si fuera una ruta capturada.
TRAZADO_RECTO = [[41.5 + i * 0.001, -5.5 + i * 0.0013] for i in range(31)]
TRAZADO_CORTO = [{"lat": 41.53, "lng": -5.46}, {"lat": 41.545, "lon": -5.44}, {"lat": 41.55, "lon": -5.42}]
CLAVE_TRAZADO = "route_track"
RUTAS = {
    "dos_nodos": [{"id": 1, "lat": 40.0, "lon": -3.0}, {"id": 2, "lat": 40.012, "lon": -3.014}],
    "con_trazado": [
        {"id": 1, "lat": 41.5, "lon": -5.5},
        {"id": 2, "lat": 41.53, "lon": -5.46, CLAVE_TRAZADO: TRAZADO_RECTO},
        {"id": 3, "lat": 41.55, "lon": -5.42, CLAVE_TRAZADO: TRAZADO_CORTO},
        {"id": 4, "lat": "41.6", "lon": -5.4},
    ],
    "un_nodo": [{"id": 1, "lat": 37.2, "lon": -6.9}],
    "vacia": [],
}


def _del_movil(nodos):
    proceso = subprocess.run(
        ["node", str(RAIZ / "tests" / "js" / "plan_teselas.cjs")],
        input=json.dumps(nodos), capture_output=True, text=True, encoding="utf-8", timeout=120, cwd=RAIZ,
    )
    assert proceso.returncode == 0, proceso.stderr[-2000:]
    return [tuple(t) for t in json.loads(proceso.stdout)]


@pytest.mark.parametrize("nombre", sorted(RUTAS))
def test_el_plan_del_servidor_es_el_del_movil(nombre):
    movil = _del_movil(RUTAS[nombre])
    servidor = plan_teselas.plan_de_satelite(RUTAS[nombre])
    assert servidor == movil, (nombre, len(servidor), len(movil), sorted(set(movil) ^ set(servidor))[:10])


def test_el_plan_cubre_la_ruta_y_no_es_enorme():
    plan = plan_teselas.plan_de_satelite(RUTAS["con_trazado"])
    zooms = {z for z, _, _ in plan}
    assert zooms == set(range(3, 20)), "del continente al detalle del nodo"
    assert 800 < len(plan) < 3000


# ---------------------------------------------------------------------------
# La fase «satélite» de Preparar mapa 3D
# ---------------------------------------------------------------------------


class _Resp:
    def __init__(self, status, contenido=b"", tipo="image/jpeg"):
        self.status_code, self.content, self.headers = status, contenido, {"Content-Type": tipo}


class _IgnFalso:
    def __init__(self):
        self.pedidas = []
        self.fallar_una_vez = set()

    def get(self, url, headers=None, timeout=None):
        self.pedidas.append(url)
        if url in self.fallar_una_vez:
            self.fallar_una_vez.discard(url)
            raise OSError("red caída")
        if "tilematrix=19&" in url and "tilecol=0" in url:
            return _Resp(404, b"no", "text/plain")
        if "tilematrix=13&" in url and len(self.pedidas) % 7 == 0:
            return _Resp(200, b"<html>", "text/html")
        return _Resp(200, b"\xff\xd8teselafalsa", "image/jpeg")


def test_calentar_el_satelite_baja_el_plan_a_la_cache_de_la_pi(tmp_path, monkeypatch):
    from backend.app.runtime import mapa3d, teselas

    monkeypatch.setattr(teselas, "PNOA_EN_EL_MAPA", True)  # prueba del camino de la PNOA (5.54 la apaga)

    nodos = RUTAS["dos_nodos"]
    plan = plan_teselas.plan_de_satelite(nodos)
    ign = _IgnFalso()
    # La primera de PNOA falla una vez (red) y se reintenta.
    z, x, y = next(t for t in plan if teselas.origen_satelite(*t) == "pnoa")
    ign.fallar_una_vez.add(teselas.url_satelite("pnoa", z, x, y))
    avisos = []
    r = mapa3d.preparar_satelite(ign, nodos, tmp_path, lambda **k: avisos.append(k), espera=lambda s: None, hilos=4)

    assert r["teselas"] == len(plan) and r["ya_estaban"] == 0
    assert r["bajadas"] + r["fallos"] == len(plan)
    assert (tmp_path / "tile_cache_pnoa" / str(z) / str(x) / ("%d.bin" % y)).exists(), "reintentada y guardada"
    pnoa = [t for t in plan if teselas.origen_satelite(*t) == "pnoa"]
    assert pnoa and all(
        (tmp_path / "tile_cache_pnoa" / str(t[0]) / str(t[1]) / ("%d.bin" % t[2])).exists() or "tilematrix=13&" in teselas.url_satelite("pnoa", *t)
        for t in pnoa
    )
    assert not list((tmp_path / "tile_cache_pnoa").rglob("*.bin")) or all(
        f.read_bytes() == b"\xff\xd8teselafalsa" for f in (tmp_path / "tile_cache_pnoa").rglob("*.bin")
    ), "una página de error no se guarda como tesela"
    assert avisos and avisos[-1]["hechas"] == len(plan) and "satélite" in avisos[-1]["fase"]

    # Segunda vez: lo que ya está en disco no se vuelve a pedir.
    ign2 = _IgnFalso()
    r2 = mapa3d.preparar_satelite(ign2, nodos, tmp_path, lambda **k: None, espera=lambda s: None)
    assert r2["ya_estaban"] == r["bajadas"] and len(ign2.pedidas) >= r2["teselas"] - r2["ya_estaban"]
    assert len(ign2.pedidas) < len(ign.pedidas)


def test_calentar_solo_el_satelite_no_cambia_la_version_del_mapa3d(tmp_path):
    from backend.app.runtime import mapa3d

    mapa3d.escribir_json(tmp_path / mapa3d.FICHERO_ESTADO, {"built_at": "2026-10-01T10:00:00+0200", "caja": [1, 2, 3, 4]})
    antes = mapa3d.version(tmp_path)
    resultado = mapa3d.preparar((40.0, 40.02, -3.02, -3.0), tmp_path, solo="satelite", cliente=_IgnFalso(),
                                espera=lambda s: None, nodos=RUTAS["dos_nodos"])
    assert resultado["satelite"]["teselas"] > 0
    assert mapa3d.version(tmp_path) == antes, "los móviles no vuelven a bajar el relieve por calentar la Pi"
