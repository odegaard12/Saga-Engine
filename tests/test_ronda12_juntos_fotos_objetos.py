# -*- coding: utf-8 -*-
"""5.52 (ronda 12): lo que pidió el dueño tras probar en su iPhone.

1. «Al ampliar mucho, los otros jugadores están como asociados a mí»: el corro ya no va en pantalla ni respecto
   a ti (ver también tests/test_jugadores_zoom_camara_30_09.py, que lo EJECUTA), y cada compañero mira hacia donde
   apunta SU móvil (`heading` del latido).
"""
import os
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-r12-"))

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


# ---------------------------------------------------------------- 1. rumbo del móvil

def test_el_rumbo_del_movil_caduca_y_descarta_basura():
    from backend.app.runtime import live_positions as lp

    lp.anotar_rumbo("r12-a", 370, 1000.0)
    assert lp.rumbo_vigente("r12-a", 1005.0) == 10.0
    assert lp.rumbo_vigente("r12-a", 1000.0 + lp.RUMBO_VIGENTE_SECONDS + 1) is None
    for basura in ("norte", None, float("nan"), float("inf")):
        lp.anotar_rumbo("r12-b", basura, 1000.0)
    assert lp.rumbo_vigente("r12-b", 1000.0) is None


def test_el_latido_lleva_el_rumbo_y_la_tabla_del_equipo_lo_devuelve():
    import time

    import main
    from backend.app.runtime import live_positions as lp

    lp.anotar_rumbo("r12-c", 123.4, time.time())
    estado = main.project_live_profile_status({"id": "r12-c"}, {"lat": 42.6, "lon": -8.8, "last_seen": int(time.time())},
                                              total_nodes=0, timers={}, progress={})
    assert estado["heading"] == 123.4
    juego = leer(RAIZ / "backend" / "app" / "routers" / "game.py")
    assert '_live_positions.anotar_rumbo(profile_id, data.get("heading"), now)' in juego
    app = leer(FRONT / "player" / "PlayerApp.tsx")
    assert "heading: rumboParaLatido(performance.now())" in app
    mapa = leer(FRONT / "player" / "components" / "MapSurfaceGL.tsx")
    assert "anotarRumboPropio(yo.rumbo(ahora), ahora)" in mapa
    # El cuerpo 3D y la flecha del suelo usan SU rumbo; sin él, el de cómo se mueve.
    assert "rumbo: base.rumboMovil ?? d?.rumbo(ahora) ?? null" in mapa
    assert "const rumbo = base.rumboMovil ?? d?.rumboSuave(ahora) ?? null" in mapa
    presencia = leer(FRONT / "player" / "offline" / "teamMapPresence.ts")
    assert "heading: typeof profile.heading === 'number'" in presencia


# ---------------------------------------------------------------- 2. fotos encima de los jugadores

def test_las_fotos_van_encima_de_los_jugadores_y_su_toque_gana():
    mapa = leer(FRONT / "player" / "components" / "MapSurfaceGL.tsx")
    assert "const subirFotos = (vivo: maplibregl.Map) =>" in mapa
    assert "vivo.moveLayer(id, CAPA_CELEB_ONDA)" in mapa and "for (const id of [CAPA_FOTOS_PILA, CAPA_FOTOS])" in mapa
    # Se suben al montar el estilo y otra vez cuando entra la capa 3D (los cuerpos).
    assert mapa.count("subirFotos(vivo)") == 2
    # El toque que abre una foto no abre además la ficha del jugador de debajo.
    assert mapa.count("if (toqueDeFoto !== null && toqueDeFoto === evento.originalEvent) return") == 3


# ---------------------------------------------------------------- 3. menú de gestos

def test_el_menu_de_gestos_agrupa_cada_gesto_y_no_se_cierra_al_probar():
    import re

    menu = leer(FRONT / "player" / "avatares3d" / "mixamo" / "MenuDeGestos.tsx")
    catalogo = leer(FRONT / "player" / "avatares3d" / "mixamo" / "catalogo.ts")
    gestos = re.findall(r"clip: '(ge__\w+)'", catalogo)
    assert len(gestos) == 12 and all(f"{g}: {{ grupo:" in menu for g in gestos), "cada gesto con grupo e icono"
    assert "saga-gestos-ficha-sonando" in menu and "saga-gestos-pista" in menu
    app = leer(FRONT / "player" / "PlayerApp.tsx")
    bloque = app[app.index("<MenuDeGestos"):app.index("alTienda={() => {", app.index("<MenuDeGestos"))]
    assert "setMenuDeGestos(false)" not in bloque, "probar un gesto deja el menú abierto (la vista previa es tu muñeco)"


# ---------------------------------------------------------------- 5. vikingo: zurrón, hacha, maza y sacho

def test_los_objetos_nuevos_estan_en_movil_servidor_y_desbloqueables():
    from backend.app.runtime import desbloqueables_catalogo as dc
    from backend.app.runtime import personajes as pj

    assert "mochila_vikinga" in pj.MIXAMO_COMPLEMENTOS["espalda"]
    assert {"sacho", "hacha", "maza"} <= set(pj.MIXAMO_COMPLEMENTOS["manoD"])
    for clave in ("item:mochila_vikinga", "item:maza", "item:hacha", "item:sacho"):
        assert clave in dc.CLAVES and dc.nombre_de(clave) != clave
    assert "item:sacho" in dc.KIT_LIBRE and "item:mochila_vikinga" in dc.KIT_LIBRE
    assert "item:hacha" in dc.BLOQUEADAS_POR_DEFECTO and "item:maza" in dc.BLOQUEADAS_POR_DEFECTO
    # Una mano, un objeto: con el hacha en la derecha, la gaita (las dos manos) se va.
    limpio = pj.normalizar_avatar({"character": "vikingo", "parts": {"mx": "Ch31", "manoD": "hacha", "dos": "gaita"}}, sanear=True)
    assert limpio["parts"].get("manoD") == "hacha" and "dos" not in limpio["parts"]
    cat = leer(FRONT / "player" / "avatares3d" / "mixamo" / "catalogo.ts")
    assert "items: ['casco', 'mochila_vikinga', 'hacha']" in cat


def test_los_objetos_hechos_por_codigo_usan_un_agarre_horneado():
    banco = RAIZ / "sim" / "playwright-bench" / "harness" / "mixamo4"
    motor, acc = leer(banco / "motor.js"), leer(banco / "acc.js")
    assert "sacho: { agarre: 'bordon'" in acc and "hacha: { agarre: 'bordon'" in acc and "maza: { agarre: 'bordon'" in acc
    assert "const H = this.hold, P = MANO_PROCEDURAL[n], de = P ? P.agarre : n" in motor
    assert "sacho: ['armR'], hacha: ['armR'], maza: ['armR']" in motor
    generado = leer(FRONT / "player" / "avatares3d" / "mixamo" / "motor" / "motor.ts")
    assert "MANO_PROCEDURAL[n]" in generado, "el motor de la app se regenera del banco"
