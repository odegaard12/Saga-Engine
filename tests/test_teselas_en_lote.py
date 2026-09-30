"""
El paquete offline se baja por lotes (/api/teselas/lote): tesela a tesela
por el túnel de Cloudflare, la primera carga en un móvil nuevo pasaba de 20
minutos. El formato es binario y lo lee mapTileCache.ts; si cambia uno sin
el otro, el paquete se queda vacío sin un solo error.
"""
import struct
from pathlib import Path

from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parents[1]


def _cliente() -> TestClient:
    import main

    return TestClient(main.app)


def _leer(cuerpo: bytes) -> list[tuple[str, str, int]]:
    assert cuerpo[:4] == b"SAGT"
    (cuantas,) = struct.unpack_from("<I", cuerpo, 4)
    o, salida = 8, []
    for _ in range(cuantas):
        (lr,) = struct.unpack_from("<H", cuerpo, o)
        ruta = cuerpo[o + 2 : o + 2 + lr].decode()
        o += 2 + lr
        (lt,) = struct.unpack_from("<H", cuerpo, o)
        tipo = cuerpo[o + 2 : o + 2 + lt].decode()
        o += 2 + lt
        (ld,) = struct.unpack_from("<I", cuerpo, o)
        o += 4 + ld
        salida.append((ruta, tipo, ld))
    assert o == len(cuerpo)
    return salida


def test_o_lote_serve_da_cache_do_disco_e_ignora_rutas_raras(tmp_path, monkeypatch) -> None:
    import main
    from backend.app.routers import public
    from backend.app.runtime import teselas

    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(main, "_HTTPX_AVAILABLE", False)  # nada de red en el test
    # La misión de la prueba: una caja pequeña. Sólo se sirve lo que cae dentro.
    monkeypatch.setattr(teselas, "caja_de_la_mision", lambda: (39.9, 40.1, -3.1, -2.9))
    x, y = teselas.tesela_de(40.0, -3.0, 16)
    binario, tipo = public._tile_cache_paths(16, x, y)
    binario.parent.mkdir(parents=True)
    binario.write_bytes(b"\xff\xd8teselafalsa")
    tipo.write_text("image/jpeg", encoding="utf-8")

    ruta_buena = "/map-tiles/16/%d/%d.png" % (x, y)
    ruta_sen_cache = "/map-tiles/16/%d/%d.png" % (x + 1, y)
    lonxe = "/map-tiles/16/9/9.png"  # fóra da zona da misión

    r = _cliente().post(
        "/api/teselas/lote",
        json={"teselas": [ruta_buena, ruta_sen_cache, lonxe, "/etc/passwd", "../../x"]},
    )
    assert r.status_code == 200
    assert _leer(r.content) == [(ruta_buena, "image/jpeg", 13), (ruta_sen_cache, "", 0), (lonxe, "", 0)]


def test_o_lote_ten_tope() -> None:
    r = _cliente().post("/api/teselas/lote", json={"teselas": ["/map-tiles/1/0/0.png"] * 201})
    assert r.status_code == 400


def test_o_cliente_le_o_mesmo_formato() -> None:
    fonte = (RAIZ / "frontend" / "src" / "player" / "offline" / "mapTileCache.ts").read_text(encoding="utf-8")
    assert "'/api/teselas/lote'" in fonte and "!== 'SAGT'" in fonte
    assert "vista.getUint32(4, true)" in fonte and "vista.getUint16(o, true)" in fonte
    # Si el servidor no sabe dar lotes, de una en una: nunca un paquete vacío.
    # (`unLote` devuelve null cuando el lote no sirve y esas teselas pasan a la
    # vuelta de una en una; tests/test_la_carga_completa.py lo ejecuta de verdad.)
    assert "restantes === null ? lote : restantes" in fonte
