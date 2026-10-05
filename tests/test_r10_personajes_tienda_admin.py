# -*- coding: utf-8 -*-
"""Ronda 10 (tras la 5.50.0): compañera que sólo se ve como retrato, orden de la tienda y filtros del panel admin.

Causa confirmada en local: con el modelo de su personaje (Ch01) ausente de la caché del móvil y la red cortándolo, el mapa
dice `sin_modelo` y pinta el retrato; la pantalla de carga daba la parte «App» por buena (los avatares eran «opcionales»)
y se entraba sin avisar. Ahora: la carga NO se da por buena si faltan modelos que el servidor sí tiene, y en el mapa sale
«Faltan personajes por descargar · Descargar». Nombres sintéticos, nada de datos reales.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src"
MIXAMO = SRC / "player" / "avatares3d" / "mixamo"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "r10_aviso_y_admin.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert r.returncode == 0, r.stderr[-3000:]
    return json.loads(r.stdout)


# ------------------------------------------------------------ A. aviso de personajes

def test_el_aviso_solo_sale_si_faltan_y_explica_la_falta_de_red(js):
    f = js["fases"]
    assert f["nada"] == "oculto"
    assert f["faltan"] == "faltan"
    assert f["sinRed"] == "sinRed" and f["sinRedYFallo"] == "sinRed"
    assert f["fallo"] == "fallo"
    assert f["bajando"] == "bajando" and f["bajandoSinRed"] == "bajando"
    assert "retratos" in js["textos"]["sinRed"] and "conexión" in js["textos"]["sinRed"]
    assert js["textos"]["bajando"] == "Descargando personajes 2 de 8"


def test_el_boton_es_voluntario_y_solo_con_red_y_sin_descarga_en_curso(js):
    assert js["botones"] == {"oculto": False, "faltan": True, "bajando": False, "sinRed": False, "fallo": True}


def test_bajar_personajes_pide_cada_fichero_una_vez_y_avisa_al_mapa_al_terminar(js):
    b = js["bajada"]
    assert b["rutasUnicas"] == ["/assets/avatares/anims.glb", "/assets/avatares/Ch01.glb", "/assets/avatares/Ch02.glb"]
    assert b["ok"] == {"fallo": False, "sinEspacio": False, "pedidos": 3}
    assert b["mal"]["fallo"] is True, "si alguna ruta no llegó se puede volver a pulsar"
    assert b["sinSitio"]["fallo"] is True and b["sinSitio"]["sinEspacio"] is True
    assert b["vacio"]["pedidos"] == 0
    assert b["terminado"] == 3, "alTerminar también tras un fallo (lo que sí llegó se pinta ya), pero no sin personajes"
    assert b["avances"][0] == [0, 3]


def test_la_pantalla_de_carga_no_da_por_buena_la_app_si_faltan_modelos_que_el_servidor_tiene():
    shell = leer(SRC / "player" / "offline" / "pwaShell.ts")
    assert "avataresSinBajar: faltan.filter((r) => esDeAvatar(r) && !ausentes.has(r))" in shell, "el 404 sigue siendo opcional"
    carga = leer(SRC / "player" / "offline" / "cargaCompleta.ts")
    assert "informe.avataresSinBajar.length > 0" in carga and "de los personajes por bajar" in carga
    # El fallo usa el mismo camino que cualquier otra parte: «Reintentar» / «Entrar igualmente», sin bucle propio.
    assert carga.count("while (algunaFallo(final)") == 1


def test_el_aviso_lo_instala_el_mapa_y_la_descarga_la_hace_una_persona():
    mapa = leer(SRC / "player" / "components" / "MapSurfaceGL.tsx")
    assert "<AvisoPersonajes comp={obtenerAvatares} />" in mapa
    aviso = leer(MIXAMO / "AvisoPersonajes.tsx")
    # Nada se baja solo: la descarga cuelga del onClick del botón.
    assert aviso.count("descargarRutasDeAvatares") == 2  # import + una sola llamada
    assert "onClick={() => void descargar()}" in aviso
    assert "alTerminarDeBajarModelos" in aviso
    capa = leer(MIXAMO / "capaAvatares.ts")
    assert "modelosPerdidos" in capa and "seIntentoCargar(mx)" in capa


def test_el_manifiesto_cubre_todos_los_personajes():
    cat = leer(MIXAMO / "catalogo.ts")
    ids = re.findall(r"'(Ch\d+)'", cat[cat.index("export const MX_IDS"):cat.index("export type MxId")])
    man = json.loads(leer(MIXAMO / "manifiesto.json"))
    assert len(ids) == 10
    for clave in ("personajes", "agarres", "caras"):
        assert set(ids) <= set(man[clave]), clave
    vite = leer(RAIZ / "frontend" / "vite.config.ts")
    assert "/assets/avatares/" in vite and "player-precache.json" in vite


# ------------------------------------------------------------ B. orden de la tienda

def test_pelo_en_personaje_y_ropa_en_orden_arriba_abajo_calzado():
    t = leer(MIXAMO / "TiendaDeRopa.tsx")
    pj = t[t.index("if (pestana === 'pj')"):t.index("if (pestana === 'ropa')")]
    ropa = t[t.index("if (pestana === 'ropa')"):t.index("if (pestana === 'con')")]
    obj = t[t.index("if (pestana === 'obj')"):t.index("{t.gestos}")]
    assert "t.pelo" in pj and "claveHair(i)" in pj and "cambiar({ hair: i })" in pj
    assert "t.pelo" not in ropa and "claveHair" not in ropa
    assert ropa.index("t.colorCamiseta") < ropa.index("t.colorPantalon") < ropa.index("h.clave === 'pies'")
    assert "h.clave !== 'pies'" in obj and "h.clave === 'pies'" not in obj, "Objetos: sin calzado"


def test_las_claves_de_catalogo_y_los_candados_no_cambian():
    cat = leer(MIXAMO / "catalogo.ts")
    assert "zocas:" in cat and "zapatillas:" in cat
    t = leer(MIXAMO / "TiendaDeRopa.tsx")
    for clave in ("claveHair(i)", "claveRopa(i)", "claveItem(c)"):
        assert clave in t
    assert t.count("<Marca d={desbloqueos} clave={claveHair(i)}") == 1


# ------------------------------------------------------------ C. admin, panel de jugadores

def test_sin_actividad_son_mas_de_30_minutos_sin_latido_y_sin_terminar(js):
    i = js["inactivo"]
    assert i == {"reciente": False, "viejo": True, "limite": False, "nunca": True, "terminadoViejo": False, "iso": True}


def test_cada_filtro_vacio_dice_lo_suyo(js):
    v = js["vacios"]
    assert v["fin"]["titulo"] == "Nadie ha terminado todavía"
    assert v["vivo"]["titulo"] == "Nadie está en vivo ahora"
    assert v["inactivo"]["titulo"] == "Nadie está sin actividad"
    assert js["conBusqueda"]["titulo"] == "Ningún jugador coincide"
    assert len({x["titulo"] for x in v.values()}) >= 5


def test_el_panel_tiene_el_filtro_sin_actividad():
    p = leer(SRC / "admin" / "components" / "PlayersPanel.tsx")
    assert "['inactivo', 'Sin actividad']" in p
    assert "estaSinActividad(vivo?.last_seen" in p
    assert "textoSinJugadores(filtro, busqueda.trim() !== '')" in p
