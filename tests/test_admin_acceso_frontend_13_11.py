# -*- coding: utf-8 -*-
"""13/11: la entrada al panel, del lado del navegador (lógica pura + lo que tiene que estar cableado)."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
ADMIN = RAIZ / "frontend" / "src" / "admin"


@pytest.fixture(scope="module")
def datos():
    node = shutil.which("node")
    if not node:
        pytest.skip("node no está disponible")
    p = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "admin_acceso_13_11.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=120, cwd=str(RAIZ),
    )
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_que_cuenta_como_sesion_caducada(datos):
    c = datos["caducada"]
    assert c["s403_forbidden"] and c["s401_clave_de_mision"]
    # Un 403 de ORIGEN o de «cambia la contraseña» no devuelve al login; un 401 de contraseña mala tampoco.
    assert not (c["s403_origen"] or c["s403_cambiar_clave"] or c["s401_login"] or c["s500"])


def test_el_login_dice_cuantos_intentos_quedan_y_el_bloqueo(datos):
    m = datos["mensajes"]
    assert "Te quedan 4 intentos" in m["login_quedan_4"]
    assert "Te queda 1 intento" in m["login_queda_1"]
    assert "bloqueado" in m["login_bloqueado"] and "10 min" in m["login_bloqueado"]
    assert m["login_sin_cuerpo"] == "Contraseña incorrecta."


def test_cada_fallo_dice_lo_que_es(datos):
    m = datos["mensajes"]
    assert "bloqueado" in m["bloqueo_429"]
    assert "muchas peticiones" in m["ritmo_429"] and "bloqueado" not in m["ritmo_429"]
    assert "origen" in m["origen_403"] and "caducado" not in m["origen_403"]
    assert "caducado" in m["sesion_403"] and "caducado" in m["clave_mision_401"]
    assert "reiniciando" in m["cloudflare_502"] and m["cloudflare_502"] == m["cloudflare_504"]
    assert "HTTP 500" in m["fallo_500"]
    assert "dura una hora" not in " ".join(m.values())  # la sesión ya es deslizante


def test_solo_el_bloqueo_de_acceso_apaga_el_boton_de_entrar(datos):
    b = datos["bloqueo"]
    assert b["de_429"] == 120 and b["de_401_con_bloqueo"] == 30
    assert b["de_ritmo"] is None and b["de_401_sin_bloqueo"] is None and b["de_otro"] is None


def test_el_aviso_de_caducidad_sale_5_minutos_antes_y_distingue_el_tope(datos):
    a = datos["aviso"]
    assert a["lejos"] is None and a["caducada"] is None and a["sin_reloj"] is None
    assert a["a_cuatro_min"] == {"tipo": "inactividad", "segundos": 240}
    assert a["inactividad_a_un_min"]["tipo"] == "inactividad"
    assert a["tope_a_dos_min"]["tipo"] == "tope"  # renovar no sirve: el botón «Seguir conectado» no sale


def test_las_cabeceras_de_la_sesion_ponen_el_reloj(datos):
    assert datos["reloj_con_cabeceras"] == {"expiresAt": 12345, "absoluteAt": 99999}
    assert datos["reloj_sin_cabeceras_no_cambia"] == {"expiresAt": 12345, "absoluteAt": 99999}
    assert datos["oyentes"] == {"avisos": 1, "absoluto_se_conserva": 99999}


def test_lo_descartado_al_guardar_jugadores_se_dice(datos):
    d = datos["descartados"]
    assert d["nada"] is None and d["vacio"] is None
    assert "3 jugadores no se han guardado" in d["de_mas"]
    for trozo in ("sin foto", "A, B", "repetir el id", "ana", "mayúsculas", "Luis, luis"):
        assert trozo in d["todo"], trozo


# --- cableado ---

def _leer(ruta):
    return (RAIZ / ruta).read_text(encoding="utf-8")


def test_las_cabeceras_del_servidor_y_del_panel_se_llaman_igual():
    main = _leer("main.py")
    reloj = (ADMIN / "lib" / "adminSessionClock.ts").read_text(encoding="utf-8")
    for cab in ("X-Admin-Session-Expires", "X-Admin-Session-Absolute"):
        assert cab in main and cab.lower() in reloj


def test_el_panel_entra_solo_con_una_sesion_valida_y_el_login_es_comodo_en_el_movil():
    app = (ADMIN / "AdminApp.tsx").read_text(encoding="utf-8")
    # Prueba silenciosa al montar, antes de enseñar el login.
    assert re.search(r"useEffect\(\(\) => \{\s*installAdminFetchClock\(\)[\s\S]{0,400}fetchHydratedOverview\(\)", app)
    # 15/11: el login pide ya el arranque (una ronda menos con poca cobertura).
    assert "loginAdmin(typedPassword, rememberSession, arranqueDisponible)" in app
    for cosa in ('autoComplete="username"', 'enterKeyHint="go"', 'autoCapitalize="off"', "Mantener la sesión", "Seguir conectado"):
        assert cosa in app, cosa


def test_el_panel_se_baja_al_entrar_y_los_paneles_pesados_al_abrirlos():
    app = (ADMIN / "AdminApp.tsx").read_text(encoding="utf-8")
    # 15/11: el mismo import se puede lanzar antes (mientras se teclea la clave): `importarShell` + `lazy(importarShell)`.
    assert "const importarShell = () => import('./components/AdminMissionControlShell')" in app
    assert "lazy(importarShell)" in app
    assert "import AdminMissionControlShell from" not in app
    shell = (ADMIN / "components" / "AdminMissionControlShell.tsx").read_text(encoding="utf-8")
    for panel in ("MatchLogPanel", "SettingsPanel", "SimulationBenchPanel"):
        assert f"const {panel} = lazy(" in shell and f"import {panel} from" not in shell


def test_los_ajustes_usan_los_errores_del_panel_y_no_fetch_a_pelo():
    s = (ADMIN / "components" / "SettingsPanel.tsx").read_text(encoding="utf-8")
    assert s.count("throw await httpErrorFrom(res)") >= 5
    assert "HTTP ${res.status}`)" not in s.replace("datos.detail || `HTTP ${res.status}`", "")


def test_el_registro_de_partida_se_pagina_y_empieza_cerrado():
    m = (ADMIN / "components" / "MatchLogPanel.tsx").read_text(encoding="utf-8")
    assert "FILAS_POR_PAGINA = 200" in m and "más recientes" in m
    assert "<details key={`${nodo.clave}-${indice}`} open" not in m
