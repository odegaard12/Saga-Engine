# -*- coding: utf-8 -*-
"""15/11 (admin con poca cobertura, lado del panel): el arranque en una ida y vuelta, la calidad de la red y el sondeo en
vivo adaptativo. Piezas puras con un `fetch` falso, y comprobaciones de texto sobre lo que necesita un navegador."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
SRC = RAIZ / "frontend" / "src"
NODE = shutil.which("node")


def leer(*ruta):
    return SRC.joinpath(*ruta).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def datos():
    if not NODE:
        pytest.skip("sin node")
    p = subprocess.run([NODE, str(RAIZ / "tests" / "js" / "arranque_15_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_lo_recibido_se_recuerda_y_sin_cambios_se_rellena_con_una_copia(datos):
    r = datos["recuerda"]
    assert r.get("antes") is None and r["huellas"] == {"overview": "h-ov1", "stages": "h-st1", "config": "h-cf1"}
    assert r["primeraOk"] and r["segundaIgual"] and r["memoriaIntacta"] and r["segundaVivoNivel"] == 2


def test_sin_cambios_de_algo_que_no_tenemos_no_sirve(datos):
    o = datos["olvida"]
    assert o["huellas"] is True and o["sinCambiosSinMemoria"] is None
    assert o["noEsOk"] == [None, None, None] and o["sinNodos"] is None and o["sinVivo"] is None


def test_la_calidad_de_la_red_con_y_sin_navigator_connection(datos):
    r = datos["red"]
    assert r["conexion"] == ["buena", "media", "mala", "mala", "mala", None, None]
    assert r["recursos"] == ["buena", "mala", "media", "buena", "buena"]
    assert r["sinNada"] == "buena" and r["porNavegador"] == "mala"


def test_los_intervalos_del_sondeo_dependen_de_la_red_y_de_la_latencia(datos):
    i = datos["intervalos"]
    assert (i["buena"], i["media"], i["mala"]) == (15000, 25000, 45000)
    assert i["lenta"] == 80000 and i["muyLenta"] == 120000  # nunca más deprisa que 4 veces lo que tardó la última, tope 2 min
    assert i["trasFallos"] == [15000, 30000, 60000, 120000] and i["trasFallosMala"] == [45000, 90000, 120000]


def test_la_antiguedad_de_la_senal_y_su_texto(datos):
    a = datos["antiguedad"]
    assert (a["s"], a["ms"], a["nunca"], a["sinHora"], a["futuro"]) == (40, 40, None, None, 0)
    assert a["textos"] == ["ahora", "hace 40 s", "hace 2 min", "hace 10 min", "hace 2 h", ""] and a["umbral"] == 90


def test_el_sondeo_manda_la_huella_y_acepta_sin_cambios(datos):
    s = datos["sondeo"]
    assert s["cuerpos"] == [{}, {"etag": "E1"}, {"etag": "E1"}] and s["urls"] == ["/api/admin/mission-status"]
    assert [v["n"] for v in s["vistos"]] == [2, 2, 2] and [v["ts"] for v in s["vistos"]] == [100, 115, 130]
    assert [v["nivelA"] for v in s["vistos"]] == [1, 1, 3]  # sin cambios deja la lista; luego llega la nueva


def test_lo_sembrado_por_la_entrada_evita_pedir_otra_vez_enseguida(datos):
    assert datos["sembrado"] == {"peticionesAlSuscribir": 0, "cuerpoDespues": [{"etag": "S1"}]}
    assert datos["sembradoMalo"] == {"peticiones": 1}  # una respuesta que no sirve no siembra nada


def test_con_la_pestana_oculta_no_se_sondea_y_un_fallo_deja_lo_ultimo(datos):
    assert datos["oculta"] == {"peticiones": 0}
    assert [f["fallos"] for f in datos["fallo"]] == [1, 2]


# --- lo que necesita un navegador: comprobado sobre el código -----------------------------------------------------------

def test_el_panel_pide_el_arranque_y_cae_al_camino_de_siempre_si_el_servidor_no_lo_tiene():
    app = leer("admin", "AdminApp.tsx")
    assert "fetchAdminArranque(huellasConocidas())" in app
    assert "err.status === 404 || err.status === 405" in app and "arranqueDisponible = false" in app
    # El login trae ya el arranque y, si no sirve, se pide como siempre.
    assert "(arranqueDelLogin ? hidratarArranque(arranqueDelLogin, pedidoLoginMs) : null) ??" in app
    assert "await fetchHydratedOverview()" in app
    # La configuración pública ya no es una ronda más cuando el arranque la trajo.
    assert "publicaDeArranqueRef.current" in app and "function publicaTrasEntrar()" in app
    assert "olvidarArranque()" in app


def test_el_panel_se_baja_mientras_se_teclea_la_clave_salvo_con_red_mala():
    app = leer("admin", "AdminApp.tsx")
    assert "if (calidadDeRed() !== 'mala') precargarShell()" in app
    assert "precargarShell()" in app[app.index("async function loadOverview"):app.index("async function refreshOverview")]


def test_el_mapa_dice_hace_cuanto_y_apaga_la_posicion_vieja():
    mapa = leer("admin", "AdminMissionMap.tsx")
    assert "antiguedadDeLaSenalS(profile.last_seen, enVivo.serverTs)" in mapa and "SEGUNDOS_POSICION_VIEJA" in mapa
    assert "última señal" in mapa and "dashArray: vieja" in mapa


def test_sin_colores_nuevos_a_mano_en_lo_nuevo():
    import re

    for fichero in (("admin", "lib", "arranque.ts"), ("admin", "lib", "calidadDeRed.ts")):
        assert not re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(", leer(*fichero)), fichero
