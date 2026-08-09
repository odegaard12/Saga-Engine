#!/usr/bin/env python3
"""Fotografía el comportamiento de cada ruta, para poder mover código sin miedo.

    python3 scripts/inventario-de-rutas.py > antes.json
    ...se mueve el código y se despliega...
    python3 scripts/inventario-de-rutas.py > despues.json
    python3 scripts/inventario-de-rutas.py --comparar antes.json despues.json

Se comprueba por COMPORTAMIENTO —se pide cada URL y se apunta qué contesta— y
no leyendo la tabla de rutas del framework. La introspección engaña: con la
versión de FastAPI de algunas máquinas, las rutas que añade `include_router` no
aparecen en `app.routes` aunque el servidor las sirva perfectamente. Eso ya nos
costó una tarde.

No mira el contenido entero a propósito: sólo el código de respuesta, el tipo y
el tamaño. Un despliegue cambia versiones y marcas de tiempo, y comparar el
cuerpo entero daría falsos positivos en cada ejecución.
"""
import json
import sys
import urllib.error
import urllib.request

BASE = "http://localhost:8096"

# Una URL por ruta que sirve el motor. Al añadir una ruta nueva, añádela aquí:
# lo que no está en esta lista no lo vigila nadie.
RUTAS = [
    ("GET", "/"),
    ("GET", "/player"),
    ("GET", "/player/"),
    ("GET", "/player/Odi"),
    ("GET", "/admin"),
    ("GET", "/admin-react"),
    ("GET", "/admin-react/algo"),
    ("GET", "/api/version"),
    ("GET", "/api/config"),
    ("GET", "/api/game/Odi"),
    ("GET", "/api/game/Odi?offline_pack=true"),
    ("GET", "/api/team/Odi"),
    ("GET", "/api/field-proofs"),
    ("GET", "/api/field-proofs/download"),
    ("GET", "/api/field-proofs/inventado/image"),
    ("GET", "/api/player-avatar/Odi"),
    ("GET", "/manifest.webmanifest"),
    ("GET", "/sw.js"),
    ("GET", "/service-worker.js"),
    ("GET", "/favicon.ico"),
    ("GET", "/saga-app-icon.svg"),
    ("GET", "/saga-app-icon-180.png"),
    ("GET", "/saga-app-icon-192.png"),
    ("GET", "/saga-app-icon-512.png"),
    ("GET", "/apple-touch-icon.png"),
    ("GET", "/apple-touch-icon-precomposed.png"),
    ("GET", "/saga-brand-final.svg"),
    ("GET", "/saga-header-mark.svg"),
    ("GET", "/map-tiles/16/31188/24244.png"),
    ("POST", "/api/advance"),
    ("POST", "/api/heartbeat"),
    ("POST", "/api/events/sync"),
    ("POST", "/api/field-proofs"),
    ("POST", "/api/admin/login"),
    ("POST", "/api/admin/logout"),
    ("POST", "/api/admin/change-password"),
    ("POST", "/api/admin/react-overview"),
    ("POST", "/api/admin/mission-status"),
    ("POST", "/api/admin/stages"),
    ("POST", "/api/admin/save"),
    ("POST", "/api/admin/save-config"),
    ("POST", "/api/admin/export"),
    ("POST", "/api/admin/events"),
    ("POST", "/api/admin/events/mark"),
    ("POST", "/api/admin/profile-action"),
    ("POST", "/api/admin/player/restore-node"),
    ("POST", "/api/admin/datos-personales"),
    ("POST", "/api/reset"),
    # Una que no existe, para saber cómo es un 404 de verdad aquí.
    ("GET", "/esta-ruta-no-existe"),
]


def probar(metodo, ruta):
    cuerpo = b"{}" if metodo == "POST" else None
    req = urllib.request.Request(
        BASE + ruta,
        data=cuerpo,
        method=metodo,
        headers={"Content-Type": "application/json"} if cuerpo else {},
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            datos = r.read()
            return {
                "estado": r.status,
                "tipo": (r.headers.get("Content-Type") or "").split(";")[0],
                # A la decena de KB: el tamaño exacto cambia con cada versión.
                "tamano_aprox": len(datos) // 10_000,
            }
    except urllib.error.HTTPError as e:
        return {"estado": e.code, "tipo": (e.headers.get("Content-Type") or "").split(";")[0], "tamano_aprox": 0}
    except Exception as e:
        return {"estado": 0, "error": type(e).__name__}


def comparar(a, b):
    antes = json.load(open(a, encoding="utf-8"))
    despues = json.load(open(b, encoding="utf-8"))

    cambios = []
    for clave in sorted(set(antes) | set(despues)):
        if antes.get(clave) != despues.get(clave):
            cambios.append((clave, antes.get(clave), despues.get(clave)))

    if not cambios:
        print("Ninguna ruta cambió de comportamiento. %d comprobadas." % len(antes))
        return 0

    print("CAMBIOS en %d rutas:" % len(cambios))
    for clave, x, y in cambios:
        print("  %-46s %s  ->  %s" % (clave, x, y))
    return 1


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--comparar":
        sys.exit(comparar(sys.argv[2], sys.argv[3]))

    print(json.dumps(
        {"%s %s" % (m, r): probar(m, r) for m, r in RUTAS},
        indent=2, sort_keys=True, ensure_ascii=False,
    ))
