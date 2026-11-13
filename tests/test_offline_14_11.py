# -*- coding: utf-8 -*-
"""14/11 (prueba empírica offline con un móvil emulado): navegación con la respuesta cortada, portada instalada sin red,
chip que parpadeaba con la red muerta, copias viejas de la portada tras un despliegue, textos de cuota y página sin copia,
y los contadores de avances pendientes. Piezas ejecutadas en Node (tests/js/offline_14_11.cjs) y texto del código."""
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-offline-1411-"))

RAIZ = Path(__file__).resolve().parents[1]
SRC = RAIZ / "frontend" / "src"
NODE = shutil.which("node")


def leer(*ruta):
    return SRC.joinpath(*ruta).read_text(encoding="utf-8")


SW = (RAIZ / "frontend" / "public" / "sw.js").read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def datos():
    if not NODE:
        pytest.skip("sin node")
    p = subprocess.run([NODE, str(RAIZ / "tests" / "js" / "offline_14_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_una_navegacion_cortada_cae_a_la_copia_guardada(datos):
    s = datos["sw"]
    assert "COPIA" in s["cortadaConCopia"]["cuerpo"], s["cortadaConCopia"]
    # También si las cabeceras llegan y el cuerpo se cuelga: tope de tiempo, no espera eterna.
    assert "COPIA" in s["colgadaConCopia"], s["colgadaConCopia"]
    assert "COPIA" in s["e502"]


def test_el_caso_normal_sigue_guardando_la_pagina_nueva(datos):
    n = datos["sw"]["normal"]
    assert n == {"estado": 200, "cuerpo": True, "guardada": True}


def test_sin_copia_y_sin_red_sale_una_pagina_en_castellano_o_gallego_con_boton(datos):
    for idioma, boton in (("es", "Reintentar"), ("gl", "Tentar de novo")):
        r = datos["sw"]["cortadaSinCopia_" + idioma]
        assert r["estado"] == 503 and r["tipo"].startswith("text/html")
        assert r["boton"] and r["reintentar"] == boton and not r["ingles"], r
    assert "SAGA offline shell" not in SW and "Prepare offline" not in SW


def test_el_service_worker_lee_el_cuerpo_sin_tragar_el_error():
    assert "leerCuerpoConTope(response.clone(), 8000)" in SW
    assert ".text().catch(() => '')" not in SW


def test_una_sola_copia_por_ruta_y_la_vieja_no_se_tira_si_la_nueva_no_cupo(datos):
    s = datos["sw"]
    assert s["variantes"] == {"claves": ["/player/ANA?user=ANA"], "sinQuerySirve": True}
    assert s["cuotaLlena"]["claves"] == ["/player/ANA"] and s["cuotaLlena"]["devuelve"]
    assert s["otraRuta"] == ["/player/ANA?user=ANA", "/player/LUIS"]


def test_el_chip_aguanta_el_mayor_reintento_de_la_cola(datos):
    c = datos["chip"]
    assert c["ventana"] == 90000 and c["ventana"] > 60_000
    # A los 60 s la ventana de 45 s ya había soltado el chip (parpadeaba); la larga no.
    assert c["a60sCorta"] is False and c["a60sLarga"] is True
    assert c["reintentoRenueva"] is True and c["pasadaLaVentana"] is False and c["conExito"] is False
    chip = leer("player", "components", "ChipDeCobertura.tsx")
    assert "sinCoberturaAhora(VENTANA_SIN_RED_LARGA_MS)" in chip
    rep = leer("shared", "reportarErrores.ts")
    assert "!sinCoberturaAhora(VENTANA_SIN_RED_LARGA_MS)" in rep


def test_la_portada_instalada_sin_red_mira_el_paquete_guardado(datos):
    d = datos["datosSinRed"]
    assert d["conPaquete"] is True and d["sinPaquete"] is False and d["lanza"] is False
    assert d["cuelga"] is False and d["cuelgaMs"] < 1500 and d["pideElId"] == "Luis"
    assert d["decide"] == {"sinRedConDatos": "entrar", "sinRedSinDatos": "lista"}
    jr = leer("shared", "jugadorRecordado.ts")
    assert "offlineVault" not in jr and "getStoredMissionPack" in jr
    login = leer("login", "LoginApp.tsx")
    assert "await tieneDatosSinRed(recordado)" in login


def test_la_guia_y_el_chip_cuentan_lo_mismo():
    u = leer("player", "guia", "useSinRed.ts")
    assert "contarAvancesPendentes" in u and "contarPendientes" not in u
    assert "evento.type === 'node_completed'" in u


def test_el_texto_del_fallo_de_envio_ya_no_manda_a_un_aviso_que_no_esta():
    t = leer("player", "minigames", "core", "textos.ts")
    assert "Revisa el aviso" not in t and "Revisa o aviso" not in t
    assert "Si el móvil no tiene espacio, libera algo y pulsa Reintentar." in t
    assert "Se o móbil non ten espazo, libera algo e preme Reintentar." in t


def test_la_pagina_sin_copia_no_usa_colores_escritos_a_mano():
    pagina = re.search(r"function respuestaSinCopia[\s\S]*?\n}\n", SW).group(0)
    assert not re.search(r"#[0-9a-fA-F]{3,6}\b|rgb\(|rgba\(|hsl\(", pagina)
