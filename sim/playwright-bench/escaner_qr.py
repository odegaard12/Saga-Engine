"""Prueba de punta a punta del escáner de pegatinas con una cámara FALSA.

Chromium usa como cámara un vídeo .y4m con la pegatina (ver
frontend/scripts/video-qr-falso.mjs). Contra un servidor local con datos de
prueba (nunca producción), con el jugador ya en un nodo de pegatina:

    python sim/playwright-bench/escaner_qr.py --base http://127.0.0.1:8796 \
        --video qr.y4m --modo bueno --lat 42.6 --lon -8.8 --vista carpeta

Modos:
  bueno    la pegatina del nodo activo: tiene que salir «PEGATINA VALIDADA»,
           avanzar el nodo UNA sola vez y apagar la cámara.
  otro     la pegatina de otro nodo: tiene que decirlo, NO avanzar y seguir
           con la cámara encendida; al cerrar, la cámara se apaga.
  sin-red  la pegatina buena sin conexión: se valida en el móvil, y al volver
           la red el avance llega al servidor.
  cerrar   cerrar el escáner mientras el móvil aún «pide permiso» (getUserMedia
           tarda): la cámara que llega tarde se apaga sola.

Imprime un JSON con lo medido y sale con código 1 si algo no cuadra.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time

from playwright.sync_api import sync_playwright

ESPIA = """
(() => {
  window.__qr = { streams: [], peticiones: [] };
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) return;
  const original = md.getUserMedia.bind(md);
  md.getUserMedia = async (c) => {
    if (window.__qrRetraso) await new Promise((r) => setTimeout(r, window.__qrRetraso));
    const s = await original(c);
    window.__qr.streams.push(s);
    return s;
  };
})();
"""

ESTADO = """() => ({
  vivas: window.__qr.streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length,
  pistas: window.__qr.streams.flatMap((s) => s.getTracks()).length,
  videosConStream: [...document.querySelectorAll('video')].filter((v) => v.srcObject).length,
  texto: document.body.innerText,
})"""


def entrar(p, base: str, usuario: str, esperar_app: bool = False) -> None:
    """Entra en la partida. Con `esperar_app`, no pulsa «Entrar igualmente» hasta
    que la app entera está guardada en el móvil (si no, sin red falta algún
    trozo de la app y el fallo sería de la prueba, no del escáner)."""
    p.goto(f"{base}/player/{usuario}", wait_until="domcontentloaded")
    for _ in range(300):
        r = p.evaluate(
            """(esperar) => { const bs=[...document.querySelectorAll('button')];
              const texto = document.body.innerText;
              const appLista = !/archivos de la aplicaci/.test(texto) || /(\d+) de \1 archivos/.test(texto);
              const x=bs.find(b=>/Seguir sin eso|Comezar|Empezar|^Listo$/.test(b.innerText.trim()) || (/Entrar igualmente/.test(b.innerText) && (!esperar || appLista)));
              if (x) { x.click(); return 'click' }
              return bs.some(b=>/Herramientas/.test(b.innerText||b.getAttribute('aria-label')||'')) ? 'listo' : 'nada' }""",
            esperar_app,
        )
        if r == "listo":
            break
        time.sleep(1)
    time.sleep(4)


def nivel_servidor(p, usuario: str):
    """El nodo en el que el SERVIDOR tiene al jugador (no lo que enseña el móvil)."""
    try:
        return p.evaluate(
            "(u) => fetch('/api/game/' + encodeURIComponent(u) + '?_=' + Date.now(), { cache: 'no-store' })"
            ".then((r) => r.json()).then((d) => (typeof d.level === 'number' ? d.level : null))",
            usuario,
        )
    except Exception:
        return None


def abrir_escaner(p) -> None:
    p.get_by_role("button", name=re.compile(r"^Abrir (QR|nodo)")).first.click(timeout=20000)


def esperar_texto(p, patron: str, segundos: float) -> bool:
    fin = time.time() + segundos
    while time.time() < fin:
        if p.evaluate("(re) => new RegExp(re, 'i').test(document.body.innerText)", patron):
            return True
        time.sleep(0.25)
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--video", required=True)
    ap.add_argument("--modo", choices=["bueno", "otro", "sin-red", "cerrar"], required=True)
    ap.add_argument("--usuario", default="prueba1")
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--vista", default=".")
    a = ap.parse_args()

    args = [
        "--mute-audio",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        f"--use-file-for-fake-video-capture={a.video}",
    ]
    r: dict = {"modo": a.modo}
    ok = True
    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True, args=args)
        ctx = b.new_context(
            viewport={"width": 412, "height": 860},
            is_mobile=True,
            has_touch=True,
            locale="es-ES",
            geolocation={"latitude": a.lat, "longitude": a.lon, "accuracy": 5},
            permissions=["geolocation", "camera"],
        )
        ctx.add_init_script(ESPIA)
        p = ctx.new_page()
        avances: list[tuple[str, int]] = []
        p.on(
            "response",
            lambda resp: avances.append((resp.request.url.split("?")[0][-40:], resp.status))
            if resp.request.method == "POST" and ("advance" in resp.request.url or "sync" in resp.request.url)
            else None,
        )
        errores: list[str] = []
        p.on("pageerror", lambda e: errores.append(str(e)[:300]))
        p.on("crash", lambda *_: errores.append("CRASH"))

        entrar(p, a.base, a.usuario, esperar_app=a.modo == "sin-red")
        r["nivel_inicial"] = nivel_servidor(p, a.usuario)

        desde_sin_red = 0
        if a.modo == "sin-red":
            time.sleep(3)  # que acaben las peticiones que ya estaban en vuelo
            ctx.set_offline(True)
            desde_sin_red = len(avances)

        if a.modo == "cerrar":
            p.evaluate("() => { window.__qrRetraso = 1500 }")
            abrir_escaner(p)
            time.sleep(0.3)
            p.get_by_role("button", name="Cerrar escáner QR").click()
            time.sleep(3)
            e = p.evaluate(ESTADO)
            r.update(vivas=e["vivas"], pistas=e["pistas"], videos=e["videosConStream"])
            ok = e["pistas"] >= 1 and e["vivas"] == 0 and e["videosConStream"] == 0
        else:
            t0 = time.time()
            abrir_escaner(p)
            if a.modo == "otro":
                visto = esperar_texto(p, r"es del nodo \d", 60)
                r["ms_hasta_aviso"] = round((time.time() - t0) * 1000)
                time.sleep(2)
                p.screenshot(path=f"{a.vista}/qr_otro_nodo.jpg", type="jpeg", quality=75)
                e = p.evaluate(ESTADO)
                r.update(aviso=visto, vivas_con_escaner=e["vivas"], validada="pegatina validada" in e["texto"].lower())
                p.get_by_role("button", name="Cerrar escáner QR").click()
                time.sleep(1.5)
                e2 = p.evaluate(ESTADO)
                r.update(vivas_tras_cerrar=e2["vivas"], videos_tras_cerrar=e2["videosConStream"], avances=avances)
                ok = visto and e["vivas"] >= 1 and not r["validada"] and e2["vivas"] == 0 and e2["videosConStream"] == 0 and not avances
            else:
                visto = esperar_texto(p, "PEGATINA VALIDADA", 60)
                r["ms_hasta_validar"] = round((time.time() - t0) * 1000)
                time.sleep(3)
                p.screenshot(path=f"{a.vista}/qr_{a.modo}_validada.jpg", type="jpeg", quality=75)
                e = p.evaluate(ESTADO)
                r.update(validada=visto, vivas_tras_leer=e["vivas"], videos_tras_leer=e["videosConStream"])
                nivel_antes = r.get("nivel_inicial")
                if a.modo == "sin-red":
                    r["avances_sin_red"] = avances[desde_sin_red:]
                    ctx.set_offline(False)
                    p.evaluate("() => window.dispatchEvent(new Event('online'))")
                fin = time.time() + 45
                while time.time() < fin:
                    r["nivel_final"] = nivel_servidor(p, a.usuario)
                    if r["nivel_final"] is not None and nivel_antes is not None and r["nivel_final"] > nivel_antes:
                        break
                    time.sleep(1)
                r["avances"] = avances
                buenos = [x for x in avances if x[1] < 400]
                p.get_by_role("button", name="Continuar").click(timeout=5000)
                time.sleep(2)
                p.screenshot(path=f"{a.vista}/qr_{a.modo}_continuar.jpg", type="jpeg", quality=75)
                ok = (
                    visto
                    and e["vivas"] == 0
                    and e["videosConStream"] == 0
                    and len(buenos) >= 1
                    # Una sola vez: exactamente un nodo más en el servidor.
                    and r.get("nivel_final") == (nivel_antes or 0) + 1
                )
                if a.modo == "sin-red":
                    ok = ok and not r["avances_sin_red"]
                if a.modo == "bueno":
                    adv = [x for x in buenos if "advance" in x[0]]
                    r["avances_buenos"] = len(adv)
                    ok = ok and len(adv) == 1

        r["errores"] = errores
        ok = ok and not any("CRASH" in x for x in errores)
        r["ok"] = ok
        b.close()
    print(json.dumps(r, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
