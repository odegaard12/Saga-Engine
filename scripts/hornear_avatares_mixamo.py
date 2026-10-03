"""Regenera los retratos de cara de los avatares 3D (los redondos del mapa y de la tienda).

Uso (con la app compilada, un servidor local en marcha que sirva los activos desde
`assets_privados/avatares/` y un jugador sin avatar elegido):

    python scripts/hornear_avatares_mixamo.py http://127.0.0.1:8799 prueba1
    node frontend/scripts/preparar-avatares.mjs        # actualiza manifiesto.json con los nombres nuevos

Abre la tienda con ?depurar-mapa, llama a window.__sagaAvataresDev.retratos (ver
avatares3d/mixamo/depuracion.ts) y escribe `cara-<Ch>.<huella>.webp` en `assets_privados/avatares/`
(los retratos NO van en git: salen de los modelos de Mixamo, ver LEEME.md del banco). Hay que repetirlo
si cambia un modelo de personaje.
"""
import base64
import hashlib
import os
import sys

from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "assets_privados", "avatares")

base, usuario = (sys.argv + ["http://127.0.0.1:8799", "prueba1"])[1:3]
os.makedirs(DESTINO, exist_ok=True)
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
    p = b.new_context(viewport={"width": 412, "height": 860}, is_mobile=True).new_page()
    p.set_default_timeout(0)
    p.goto(f"{base}/player/{usuario}?depurar-mapa=1")
    p.wait_for_function("() => !!window.__sagaAvataresDev", timeout=120000)
    for id_, url in p.evaluate("() => window.__sagaAvataresDev.retratos(192)").items():
        datos = base64.b64decode(url.split(",", 1)[1])
        for f in os.listdir(DESTINO):
            if f.startswith(f"cara-{id_}."):
                os.remove(os.path.join(DESTINO, f))
        nombre = f"cara-{id_}.{hashlib.sha1(datos).hexdigest()[:8]}.webp"
        open(os.path.join(DESTINO, nombre), "wb").write(datos)
    b.close()
print("listo: ahora `node frontend/scripts/preparar-avatares.mjs` para actualizar el manifiesto")
