# -*- coding: utf-8 -*-
"""14/11: cada operación de la base de fotos pendientes cierra su conexión de IndexedDB al acabar.

Medido en el navegador con la app quieta: +6 `IDBDatabase`/`IDBOpenDBRequest` vivos cada 100 s (≈ +10 listeners por sondeo, y las
conexiones abiertas bloquean una versión nueva de la base). Causa: `saveOfflinePhoto`, `getOfflinePhotos`, `updateOfflinePhoto` y
`deleteOfflinePhoto` abrían con `getPhotoDb()` y no cerraban nunca.
"""
import re
from pathlib import Path

LOCAL_FIRST = Path(__file__).resolve().parent.parent / "frontend" / "src" / "player" / "offline" / "localFirst.ts"


def test_toda_funcion_que_abre_la_base_de_fotos_la_cierra():
    texto = LOCAL_FIRST.read_text(encoding="utf-8")
    trozos = re.split(r"\n(?=(?:export )?(?:async )?function |const \w+ = new Set|/\*\*)", texto)
    usan = [t for t in trozos if "await getPhotoDb()" in t]
    assert len(usan) >= 4, "esperaba al menos las cuatro funciones de la base de fotos"
    for t in usan:
        nombre = re.search(r"function (\w+)", t).group(1)
        assert "db.close()" in t, f"{nombre} abre la base de fotos y no la cierra"
        assert "onabort" in t or nombre == "getOfflinePhotos" and "tx.onerror" in t, f"{nombre}: una transacción abortada también tiene que cerrar"
        assert t.count("db.close()") >= 2, f"{nombre}: cerrar al completar Y al fallar"
