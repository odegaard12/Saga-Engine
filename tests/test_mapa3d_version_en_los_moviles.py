# -*- coding: utf-8 -*-
"""Volver a preparar el mapa 3D en el panel tiene que llegar a los móviles.

El service worker sirve el relieve primero de su caché, así que un relieve
rehecho en el panel no se veía nunca en los móviles que ya tenían el viejo. Ahora
la versión de la preparación (`mapa3d_version`) va en /api/config, en la URL de
/dem-tiles y /api/edificios (`?v=`) y en la firma del mapa guardado.

Lo del móvil se prueba ejecutando los módulos de verdad (ver
tests/js/carga_completa.cjs, escenarios `mapa3d` y `serviceWorker`).
"""
import struct

import main
import pytest
from fastapi.testclient import TestClient

from backend.app.runtime import mapa3d, teselas
from test_la_carga_completa import r  # noqa: F401  (fixture compartida)


def test_la_version_sale_de_la_ultima_preparacion(tmp_path):
    assert mapa3d.version(tmp_path) == "", "sin preparar no hay versión"
    mapa3d.escribir_json(tmp_path / mapa3d.FICHERO_ESTADO, {"built_at": "2026-10-01T10:00:00+0200"})
    primera = mapa3d.version(tmp_path)
    assert primera and primera == mapa3d.version(tmp_path), "estable mientras no se rehace"
    mapa3d.escribir_json(tmp_path / mapa3d.FICHERO_ESTADO, {"built_at": "2026-10-08T10:00:00+0200"})
    assert mapa3d.version(tmp_path) not in ("", primera), "rehacerla la cambia"


def test_la_config_publica_lleva_la_version(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    cliente = TestClient(main.app)
    assert cliente.get("/api/config").json()["mapa3d_version"] == ""
    mapa3d.escribir_json(tmp_path / mapa3d.FICHERO_ESTADO, {"built_at": "2026-10-08T10:00:00+0200"})
    assert cliente.get("/api/config").json()["mapa3d_version"] == mapa3d.version(tmp_path)


def test_el_lote_acepta_el_relieve_con_version_y_lo_devuelve_con_ella(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(main, "_HTTPX_AVAILABLE", False)
    monkeypatch.setattr(teselas, "caja_de_la_mision", lambda: (39.9, 40.1, -3.1, -2.9))
    x, y = teselas.tesela_de(40.0, -3.0, 14)
    propia = tmp_path / "dem_ign" / "14" / str(x) / ("%d.png" % y)
    propia.parent.mkdir(parents=True)
    propia.write_bytes(b"\x89PNGign")
    con_version = "/dem-tiles/14/%d/%d.png?v=abc123" % (x, y)
    rara = "/dem-tiles/14/%d/%d.png?v=<x>" % (x, y)

    cuerpo = TestClient(main.app).post("/api/teselas/lote", json={"teselas": [con_version, rara]}).content

    assert cuerpo[:4] == b"SAGT" and struct.unpack_from("<I", cuerpo, 4)[0] == 1
    (largo,) = struct.unpack_from("<H", cuerpo, 8)
    assert cuerpo[10 : 10 + largo].decode() == con_version, "la ruta vuelve con su ?v= (es la clave en el móvil)"


def test_el_movil_baja_otra_vez_solo_el_relieve_y_quita_el_viejo(r):  # noqa: F811
    m = r["mapa3d"]
    assert m["primera"]["completo"] and m["primera"]["relieveConVersion"]
    assert m["primera"]["edificios"] == ["/api/edificios?v=aaa"]
    assert m["mismaVersion"]["estado"] == "ok", "con la misma versión no hay nada que bajar"
    assert not m["rehecho"]["resumenVale"] and m["rehecho"]["estado"] != "ok"
    assert m["rehecho"]["faltan"] == m["rehecho"]["relieveA"], "faltan justo las de relieve"
    assert m["rebajado"]["completo"] and m["rebajado"]["pedidasDeImagen"] == 0
    assert m["rebajado"]["quedanViejas"] == 0, "el relieve de la versión vieja se quita"
    assert m["rebajado"]["edificios"] == ["/api/edificios?v=bbb"]
    assert m["versionRara"] == "", "un valor raro no entra en la URL"
    assert m["servidorViejo"] == "?v=ccc", "un servidor sin el campo no borra la versión conocida"


def test_el_relieve_lejano_solo_alrededor_de_la_ruta(r):  # noqa: F811
    p = r["mapa3d"]["plan"]
    assert p["sat11"] == 81 and p["sat12"] == 81, "comarca y entorno: 9x9 teselas (eran 17x17)"
    assert 0 < p["dem11"] <= 64 and 0 < p["dem12"] <= 49, p
    assert p["dem11"] + p["dem12"] < 120, "el relieve lejano era 578 teselas (41 MB)"
    assert p["dem11DentroDeLaCaja"]
    assert p["dem14"] > 100, "la zona de la misión sigue con su relieve"


def test_el_service_worker_respeta_la_version_y_sin_red_tira_de_la_vieja(r):  # noqa: F811
    v = r["serviceWorker"]["versionado"]
    assert v["mismaVersionSinRed"], "la misma versión sale de la caché, sin pedir red"
    assert v["versionNuevaALaRed"] and v["nuevaDevuelve"] == 200
    assert v["sinRedOtraVersion"] == 200, "sin red, el relieve de otra versión antes que un monte plano"
    assert v["edificiosSinRed"] == 200
    assert v["edificiosGuardadosSinPedir"], "los edificios guardados no piden red mientras se juega"


@pytest.mark.parametrize("ruta", ["/dem-tiles/14/1/1.png?v=a b", "/dem-tiles/14/1/1.png?x=1"])
def test_el_lote_no_acepta_otras_queries(ruta):
    from backend.app.routers import public

    assert not public._RE_TESELA_LOTE.match(ruta)


# ---------------------------------------------------------------------------
# Pantalla de carga: tiempo estimado y porcentaje general
# ---------------------------------------------------------------------------


def test_el_tiempo_estimado_no_miente_al_principio(r):  # noqa: F811
    e = r["ritmo"]["estimaciones"]
    assert e["pronto"] is None and e["pocoAvance"] is None, "los primeros segundos no se estima"
    assert e["mitad"] == 10000, "a mitad en 10 s quedan 10 s"
    assert e["acabado"] is None and e["sinTotal"] is None


def test_los_textos_de_megas_y_tiempo(r):  # noqa: F811
    t = r["ritmo"]["textos"]
    assert (t["s"], t["min"], t["h"], t["nulo"]) == ("≈ 45 s", "≈ 3 min", "≈ 1 h 15 min", "")


def test_el_motor_cuenta_bytes_y_tiempo_y_lo_limpia_al_acabar(r):  # noqa: F811
    m = r["ritmo"]["motor"]
    assert m["bytes"] == 5 * 1048576
    assert m["restante"] and 2500 < m["restante"] < 4500
    assert m["alAcabarSinRestante"]


def test_el_porcentaje_general_solo_cuenta_lo_que_se_baja(r):  # noqa: F811
    g = r["ritmo"]["general"]
    assert g["comprobando"] is None, "mientras se comprueba, barra sin número"
    assert g["todoAlDia"] == 100
    assert g["soloMapa"] == 40, "lo que ya estaba al día no estira la barra"
    assert g["mapaPesaMas"] == 40, "app y misión listas, mapa a cero: 2 de 5"
    assert g["enCurso"] == "mapa"


def test_los_nodos_no_saltan_al_superar_uno():
    """Al superar un nodo se rehacen todas las piezas: la fase del vaivén sale del id
    (no al azar) y cada nodo integra su propio reloj (no `t * v`, que saltaba al
    pasar de pendiente a actual)."""
    from pathlib import Path

    fuente = (
        Path(__file__).resolve().parents[1] / "frontend" / "src" / "player" / "components" / "nodosTresD.ts"
    ).read_text(encoding="utf-8")
    assert "fase: Math.random()" not in fuente
    assert "fase: faseDeNodo(nodo.id)" in fuente and "tiempo: relojDeNodos.get(nodo.id) ?? 0" in fuente
    assert "Math.sin(p.tiempo * 1.1 + p.fase)" in fuente and "t * 1.1 * v" not in fuente


def test_un_lote_en_frio_tiene_tiempo_de_llegar(r):  # noqa: F811
    """Con la caché de la Pi fría (IGN ~3,7 s por tesela) un lote de 120 tardaba casi
    un minuto: con 30 s fijos se daba por fallido y se repetía tesela a tesela."""
    from pathlib import Path

    assert r["mapa3d"]["tiempoDelLote"] == [30000, 30000, 90000, 120000]
    public = (Path(__file__).resolve().parents[1] / "backend" / "app" / "routers" / "public.py").read_text(encoding="utf-8")
    assert "semaforo = asyncio.Semaphore(16)" in public
