# -*- coding: utf-8 -*-
"""14/11 (medición de arranque a 4G con «Entrar igualmente»): lo que cambia en el orden y el peso de lo que baja la app.

* Orden de la descarga de la pantalla de carga: el motor del mapa y lo propio del avatar ANTES que los 12 MB de modelos de los
  compañeros (iban antes por orden alfabético y el mapa salía 15 s después del HUD). La lista de ficheros NO cambia: solo el orden.
* `react-dom/server` (solo lo usa el panel para imprimir QR) en su propio paquete: fuera de `vendor-react` y de la precarga del jugador.
* Los iconos de 512 px y `-precomposed` salen de la instalación del service worker y van los últimos de la lista de la pantalla de carga.
* Los sondeos del mapa y del chip de cobertura se paran con la pantalla oculta.
"""
import json
import re
import subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"
SRC = FRONT / "src"


def leer(ruta):
    return Path(ruta).read_text(encoding="utf-8")


def _correr():
    p = subprocess.run(
        ["node", str(RAIZ / "tests" / "js" / "arranque_14_11.cjs")],
        cwd=str(RAIZ),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
    )
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout.strip().splitlines()[-1])


def test_la_descarga_va_primero_el_motor_del_mapa_y_lo_propio_y_la_lista_no_cambia():
    r = _correr()
    assert r["mismoConjunto"], "mismos ficheros, solo otro orden"
    o = r["orden"]
    nombres_motor = ("vendor-maplibre", "maplibre-gl-worker", "vendor-three", "cargador", "MapSurfaceGL")
    motor = [x for x in o if any(n in x for n in nombres_motor)]
    assert len(motor) == 5 and o[:5] == motor, o
    # Después, lo propio: animaciones, su personaje y su agarre
    assert sorted(o[5:8]) == sorted(
        [
            "/assets/avatares/anims.aaaaaaaa.glb",
            "/assets/avatares/Ch02.bbbbbbbb.glb",
            "/assets/avatares/hold-Ch02.cccccccc.glb",
        ]
    ), o
    # El resto de la app, antes que los modelos de los compañeros; los iconos grandes, los últimos
    i_resto = max(o.index(x) for x in o if x.startswith("/assets/") and "avatares" not in x)
    i_otros = min(o.index(x) for x in o if "Ch01." in x)
    assert i_resto < i_otros, "los modelos de los compañeros van después del resto de la aplicación"
    assert o[-2:] == ["/saga-app-icon-512.png", "/apple-touch-icon-precomposed.png"]
    # Sin primeros: sigue siendo estable y el motor va primero
    assert r["sinPrimeros"][:5] == motor
    assert r["prioridades"]["/assets/index-aaaaaaaa.js"] == 2
    assert r["prioridades"]["/assets/avatares/Ch01.dddddddd.glb"] == 3


def test_la_descarga_simulada_pide_en_ese_orden_y_guarda_todo():
    r = _correr()
    pedidos = r["pedidos"]
    assert r["informe"]["completo"] and not r["informe"]["faltan"] and not r["informe"]["sinEspacio"]
    pos = {x: i for i, x in enumerate(pedidos)}
    for motor in ("vendor-maplibre", "vendor-three"):
        m = next(x for x in pos if motor in x)
        assert pos[m] < pos["/assets/avatares/Ch01.dddddddd.glb"], f"{motor} antes que los modelos de los compañeros"
    assert pos["/assets/avatares/anims.aaaaaaaa.glb"] < pos["/assets/avatares/Ch01.dddddddd.glb"]
    assert len(r["guardados"]) >= 14, "se guardó toda la lista"
    # Los dos iconos grandes se piden los ÚLTIMOS y se guardan (la lista solo dejaba pasar /assets/ y los perdía)
    assert pedidos[-2:] == ["/saga-app-icon-512.png", "/apple-touch-icon-precomposed.png"], pedidos[-3:]
    assert "/saga-app-icon-512.png" in r["guardados"] and "/apple-touch-icon-precomposed.png" in r["guardados"]


def _regex_de(config, nombre):
    # test: /.../ del grupo, con la sintaxis de JS (idéntica para lo que usamos: clases, lookahead, alternancia)
    m = re.search(r"name: '%s', test: /(.+?)/, priority: (\d+)" % re.escape(nombre), config)
    assert m, nombre
    return re.compile(m.group(1).replace("\\\\", "\\")), int(m.group(2))


def test_react_dom_server_va_en_su_propio_paquete_y_react_se_queda_en_vendor_react():
    config = leer(FRONT / "vite.config.ts")
    servidor, p_servidor = _regex_de(config, "vendor-react-server")
    react, p_react = _regex_de(config, "vendor-react")
    assert p_react > p_servidor, "react (núcleo) tiene que ganar al grupo del servidor o vendor-react-server arrastra a react y se vuelve crítico"
    for ruta in (
        "react-dom/server.browser.js",
        "react-dom/cjs/react-dom-server.browser.production.min.js",
        "react-dom/server.js",
    ):
        assert servidor.search("node_modules/" + ruta), ruta
        assert not react.search("node_modules/" + ruta), ruta + " no debe ir en vendor-react"
    for ruta in (
        "react/index.js",
        "react/cjs/react.production.min.js",
        "scheduler/index.js",
        "zustand/esm/index.mjs",
        "react-dom/index.js",
        "react-dom/client.js",
        "react-dom/cjs/react-dom.production.min.js",
    ):
        assert react.search("node_modules/" + ruta), ruta
        assert not servidor.search("node_modules/" + ruta), ruta
    assert "react-dom/server" in leer(SRC / "admin" / "utils" / "printQrs.tsx")
    for jugador in ("player", "shared", "login"):
        for f in (SRC / jugador).rglob("*.ts*"):
            assert "react-dom/server" not in leer(f), f"{f}: el jugador no debe importar react-dom/server"


def test_los_iconos_grandes_salen_de_la_instalacion_y_van_los_ultimos_de_la_lista():
    sw = leer(FRONT / "public" / "sw.js")
    core = re.search(r"const CORE_URLS = \[(.*?)\]", sw, re.S).group(1)
    assert "saga-app-icon-512.png" not in core and "apple-touch-icon-precomposed.png" not in core
    for sigue in ("saga-app-icon-180.png", "saga-app-icon-192.png", "apple-touch-icon.png", "/manifest.webmanifest"):
        assert sigue in core, sigue
    vite = leer(FRONT / "vite.config.ts")
    assert "iconosDeInstalacion = ['/saga-app-icon-512.png', '/apple-touch-icon-precomposed.png']" in vite
    assert "...iconosDeInstalacion" in vite
    pwa = leer(SRC / "player" / "offline" / "pwaShell.ts")
    assert "ICONOS_DE_INSTALACION" in pwa and "return 4" in pwa
    # El manifiesto sigue apuntando a ellos (el servidor los sirve)
    assert "saga-app-icon-512.png" in leer(FRONT / "public" / "manifest.webmanifest")


def test_el_orden_se_calcula_en_la_carga_con_los_modelos_propios_del_jugador():
    carga = leer(SRC / "player" / "offline" / "cargaCompleta.ts")
    assert "primeros: modelosPropios(ctx)" in carga
    assert "urlDeAnimaciones()" in carga and "urlDePersonaje(mx)" in carga and "urlDeAgarre(mx)" in carga
    pwa = leer(SRC / "player" / "offline" / "pwaShell.ts")
    assert "ordenarPendientes(" in pwa and "opciones.primeros" in pwa


def test_los_sondeos_del_mapa_y_del_chip_se_paran_con_la_pantalla_oculta():
    mapa = leer(SRC / "player" / "components" / "MapSurfaceGL.tsx")
    assert "cadaMientrasVisible(vigilarEstilo, 4000)" in mapa and "relojVigilante()" in mapa
    assert "const relojRumbo = cadaMientrasVisible(" in mapa and "relojRumbo()" in mapa
    assert "window.setInterval(vigilarEstilo" not in mapa and "window.clearInterval(relojRumbo)" not in mapa
    chip = leer(SRC / "player" / "components" / "ChipDeCobertura.tsx")
    assert "cadaMientrasVisible(() => void leer(), 6000)" in chip and "window.setInterval" not in chip
    # Todo el que la usa la importa (un build a medias dio «cadaMientrasVisible is not defined»)
    for f in SRC.rglob("*.ts*"):
        t = leer(f)
        if "cadaMientrasVisible(" in t and f.name != "cadaMientrasVisible.ts":
            assert re.search(r"import \{[^}]*cadaMientrasVisible[^}]*\} from", t), f"{f} usa cadaMientrasVisible sin importarla"
