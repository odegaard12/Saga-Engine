# -*- coding: utf-8 -*-
"""Sin red, el jugador tiene que poder abrir CUALQUIER nodo.

El mapa, cada familia de minijuego y los paneles pesados van en paquetes
aparte que se cargan con import(). El service worker sólo veía los <script> del
HTML, así que esos paquetes se guardaban únicamente si ya se habían usado con
cobertura: un minijuego aún no abierto no cargaba en el monte.

El build escribe ahora `player-precache.json` con todo lo alcanzable desde la
entrada del jugador (sin el panel de administración) y `pwaShell.ts` lo guarda.
Esta prueba comprueba, sobre el build real, que la lista cubre todos los
paquetes que el jugador puede pedir, siguiendo los imports uno a uno.
"""
import json
import re
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
DIST = RAIZ / "frontend" / "dist"
ASSETS = DIST / "assets"
PWA = RAIZ / "frontend" / "src" / "player" / "offline" / "pwaShell.ts"
SW = RAIZ / "frontend" / "public" / "sw.js"
ROUTER = RAIZ / "backend" / "app" / "routers" / "assets.py"

# Lo que solo se abre desde /admin-react o /banco-mapa.
SOLO_ADMIN = ("AdminApp-", "BancoMapa-", "vendor-leaflet-")

requiere_build = pytest.mark.skipif(
    not (DIST / "player-precache.json").exists(),
    reason="falta compilar el frontend (cd frontend && npm run build)",
)


def _lista():
    return set(json.loads((DIST / "player-precache.json").read_text(encoding="utf-8"))["files"])


def _referencias(fichero: Path, existentes: set[str]) -> set[str]:
    """Nombres de otros ficheros de assets que menciona este (imports, workers, css)."""
    texto = fichero.read_text(encoding="utf-8", errors="ignore")
    return {n for n in re.findall(r"[A-Za-z0-9_.\-]+\.(?:js|css)", texto) if n in existentes}


def _alcanzables_desde_el_html() -> set[str]:
    existentes = {p.name for p in ASSETS.iterdir() if p.is_file()}
    html = (DIST / "index.html").read_text(encoding="utf-8")
    pendientes = [n for n in re.findall(r"/assets/([A-Za-z0-9_.\-]+\.(?:js|css))", html)]
    vistos: set[str] = set()
    while pendientes:
        nombre = pendientes.pop()
        if nombre in vistos or nombre.startswith(SOLO_ADMIN):
            continue
        vistos.add(nombre)
        if nombre.endswith(".js"):
            pendientes.extend(_referencias(ASSETS / nombre, existentes))
    return vistos


@requiere_build
def test_la_lista_cubre_todos_los_paquetes_que_el_jugador_puede_pedir():
    lista = _lista()
    alcanzables = _alcanzables_desde_el_html()

    assert alcanzables, "no se encontró ningún paquete desde index.html"
    faltan = sorted(n for n in alcanzables if "/assets/" + n not in lista)
    assert not faltan, "paquetes del jugador fuera del precache: %s" % faltan


@requiere_build
def test_los_minijuegos_y_el_mapa_estan_en_la_lista():
    lista = " ".join(sorted(_lista()))
    for pieza in ("MapSurfaceGL-", "vendor-maplibre-", "vendor-three-", "maplibre-gl-worker-",
                  "InteractionSheet-", "RankingSheet-", "vendor-jsqr-", "SimonRuntimeScreen-",
                  "CuentaSenalesRuntimeScreen-", "PulsoHierroRuntimeScreen-", "CheckpointRuntimeScreen-"):
        assert pieza in lista, "%s no está en player-precache.json" % pieza


@requiere_build
def test_la_lista_no_arrastra_el_panel_de_administracion():
    sobran = [f for f in _lista() if any(f.startswith("/assets/" + p) for p in SOLO_ADMIN)]
    assert not sobran, "el móvil del jugador no debe bajarse: %s" % sobran


@requiere_build
def test_todo_lo_de_la_lista_existe_en_el_build():
    for f in _lista():
        assert (DIST / f.lstrip("/")).is_file(), "%s está en la lista pero no en dist" % f


def test_la_app_lee_la_lista_y_el_servidor_la_sirve():
    assert "/player-precache.json" in PWA.read_text(encoding="utf-8")
    assert '"/player-precache.json"' in ROUTER.read_text(encoding="utf-8")


def test_el_service_worker_no_sirve_la_lista_desde_cache():
    """Si la interceptase de la caché, un despliegue nuevo vería la lista vieja."""
    texto = SW.read_text(encoding="utf-8")
    manejador_fetch = texto[texto.index("self.addEventListener('fetch'"):]
    assert "player-precache" not in manejador_fetch


def test_el_service_worker_no_baja_paquetes_de_fondo_al_instalarse():
    """La descarga de la app vive en la pantalla de carga, con su barra.

    Antes el worker bajaba TODOS los paquetes del jugador al instalarse, en
    segundo plano y sin que nadie lo viera (y un worker nuevo se instala en plena
    partida). Regla del dueño: «la pantalla de carga era la idea siempre: bajar
    todo offline en ella, no de fondo mientras se jugaba». La instalación se queda
    en lo mínimo para que la aplicación abra.
    """
    texto = SW.read_text(encoding="utf-8")
    instalacion = texto[texto.index("self.addEventListener('install'"):]
    instalacion = instalacion[: instalacion.index("})" + chr(10) + chr(10)) + 3]

    assert "precargarPaquetesDelJugador" not in texto
    assert "player-precache" not in instalacion
    assert "fetch(" not in instalacion
    assert "CORE_URLS" in instalacion and "skipWaiting" in instalacion
    # Y el worker ya no baja nada a petición de la app: la app lo baja ella.
    assert "cacheUrls" not in texto


def test_la_preparacion_solo_esta_lista_si_los_paquetes_estan_comprobados():
    """La pantalla de carga y «Prepararse» no pueden decir listo sin los paquetes."""
    pwa = PWA.read_text(encoding="utf-8")
    assert "export async function verificarPaquetesDelJugador" in pwa
    assert "cache.match(ruta" in pwa  # comprueba contra la caché, uno a uno
    assert "export async function descargarPaquetesDelJugador" in pwa
    assert "asegurarPaquetesDelJugador" in pwa

    carga = (RAIZ / "frontend" / "src" / "player" / "offline" / "cargaCompleta.ts").read_text(encoding="utf-8")
    # La parte «App» comprueba con la caché de verdad y baja con progreso.
    assert "verificarPaquetesDelJugador(ctx.playerUrl)" in carga
    assert "descargarPaquetesDelJugador(ctx.playerUrl" in carga

    app = (RAIZ / "frontend" / "src" / "player" / "PlayerApp.tsx").read_text(encoding="utf-8")
    # Sólo se da la misión offline por buena si TODAS las partes quedaron listas.
    assert "resultado.faltan.length === 0" in app
    assert "cargarTodo(" in app
