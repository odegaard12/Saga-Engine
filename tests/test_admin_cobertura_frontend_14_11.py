# -*- coding: utf-8 -*-
"""14/11 (admin con poca cobertura, lado del panel): la cola de acciones con op_id, reintentos y espera guardada; sumar tiempo;
la vista ligera con fotos por URL. Pruebas de las piezas puras con un `fetch` falso y de texto sobre lo que necesita un
navegador."""
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
    p = subprocess.run([NODE, str(RAIZ / "tests" / "js" / "admin_cobertura_14_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_camino_feliz_una_peticion_con_op_id_y_la_cola_vacia(datos):
    r = datos["feliz"]
    assert r["estado"] == "hecha" and r["nivel"] == 1 and r["peticiones"] == 1 and r["conOpId"] is True
    assert r["cola"] == 0 and r["eventos"] == ["enviando:level_next", "hecha:level_next"]


def test_dos_fallos_de_red_se_reintentan_con_el_mismo_op_id_y_esperas_crecientes(datos):
    r = datos["reintento"]
    assert r["estado"] == "hecha" and r["peticiones"] == 3 and r["idsDistintos"] == 1
    assert r["esperas"] == [1500, 3000] and r["nivel"] == 1


def test_si_la_respuesta_se_pierde_tras_aplicarse_el_reintento_no_la_repite(datos):
    # EL fallo de verdad con poca cobertura: «+1 nodo» llega, la respuesta no. Sin op_id subía dos nodos.
    r = datos["respuestaPerdida"]
    assert r["nivel"] == 1 and r["repetida"] is True and r["peticiones"] == 2
    assert r["eventos"] == ["enviando:level_next", "hecha:level_next:repetida"]
    assert datos["cuerpoCortado"] == {"estado": "hecha", "repetida": True, "nivel": 1}
    assert datos["tiempo"]["repetida"] is True and datos["tiempo"]["mismoOp"] is True
    assert datos["tiempo"]["url"] == "/api/admin/jugador/tiempo" and datos["tiempo"]["segundos"] == 45


def test_sin_forma_de_enviar_queda_en_la_cola_guardada_y_sale_sola_una_vez(datos):
    r = datos["pendienteYVuelta"]
    assert r["antes"] == {"estado": "pendiente", "motivo": "sin_red", "guardadas": 1, "enCola": True, "intentos": 4, "nivel": 0}
    assert r["despues"]["cola"] == 0 and r["despues"]["nivel"] == 1  # sube UNA vez
    assert r["despues"]["eventos"] == ["enviando:level_next", "pendiente:level_next", "hecha:level_next"]


def test_la_cola_sobrevive_a_recargar_la_pagina(datos):
    r = datos["recarga"]
    assert r == {"leidas": 1, "trasEnviar": 0, "nivel": 1, "eventos": ["hecha:level_next"]}


def test_sin_red_desde_el_principio_ni_siquiera_se_intenta(datos):
    assert datos["sinRed"] == {"estado": "pendiente", "motivo": "sin_red", "peticiones": 0, "cola": 1}


def test_sesion_caducada_no_insiste_y_espera_a_volver_a_entrar(datos):
    r = datos["sesionCaducada"]
    assert r["estado"] == "pendiente" and r["motivo"] == "sesion" and r["peticionesTrasPrimera"] == 1
    assert r["enPausa"] is True and r["trasPrimeraCola"] == {"cola": 1, "nivel": 0}  # la cola NO se pierde
    assert r["pausaTrasReanudar"] is False and r["trasReanudar"] == {"cola": 0, "nivel": 1}


def test_un_rechazo_definitivo_no_se_reintenta_ni_se_queda(datos):
    r = datos["rechazo"]
    assert r["estado"] == "rechazada" and r["httpStatus"] == 404 and r["peticiones"] == 1 and r["cola"] == 0
    assert "jugador o nodo borrado" in r["texto"]


def test_servidor_reiniciando_y_respuesta_colgada(datos):
    assert datos["servidor502"] == {"estado": "pendiente", "motivo": "servidor", "peticiones": 4}
    assert datos["tiempoAgotado"] == {"estado": "hecha", "peticiones": 2, "nivel": 1}


def test_dos_cambios_del_mismo_jugador_se_envian_en_el_orden_en_que_se_hicieron(datos):
    r = datos["orden"]
    assert r["trasSegunda"] == {"estado": "pendiente", "peticionesNuevas": 0, "cola": ["level_next", "level_prev"]}
    assert r["enviadas"] == ["level_next", "level_prev"] and r["cola"] == 0 and r["nivel"] == 0


def test_descartar_y_almacenamiento_lleno(datos):
    assert datos["descartar"] == {"cola": 0, "nivel": 0}
    assert datos["almacenLleno"] == {"cola": 1, "noSePuedeGuardar": True}


def test_leer_segundos_etiquetas_y_fotos(datos):
    p = datos["puras"]
    assert p["leer"] == [45, -30, 90, 120, -45, None, None, None, None, 21600, 13]
    assert p["etiquetas"] == ["45 s", "1 min", "1 min 30 s", "1 h 2 min 5 s", "2 h"]
    assert p["ajustes"] == ["0 s", "+45 s", "−1 min", "+1 min 30 s"]
    assert "Restar 30 s al tiempo de Ana" in p["pregunta"] and "No le cambia el nodo" in p["pregunta"]
    assert p["foto"] == {"igual": True, "nuevaVuelveComoUrl": True, "nuevaTirada": False, "cambiaUrl": False, "quitada": False}


# --- lo que necesita un navegador: comprobado sobre el código --------------------------------------------------------

def test_el_panel_usa_la_cola_y_no_vuelve_a_pedir_la_vista_entera_tras_cada_accion():
    app = leer("admin", "AdminApp.tsx")
    ini = app.index("async function runPlayerProfileAction")
    fin = app.index("async function savePlayerProfiles")
    bloque = app[ini:fin]
    assert "lanzarOperacion(" in bloque and "nuevoOpId()" in bloque
    # Antes: cada pulsación terminaba con `fetchAdminReactOverview()` (decenas de KB y segundos con 3G).
    assert "fetchAdminReactOverview" not in bloque and "runAdminProfileAction(" not in bloque
    assert "suscribirOperaciones(" in app and "alOperacionRef.current = alOperacion" in app
    assert "reanudarCola()" in app


def test_la_ficha_tiene_sumar_tiempo_y_avisa_de_lo_pendiente():
    panel = leer("admin", "components", "PlayersPanel.tsx")
    assert "<AjusteDeTiempo" in panel and "onAjustarTiempo(draft.id" in panel
    assert "useOperacionesPendientes()" in panel and "cambios sin enviar" in panel
    # Lo pendiente no bloquea los botones (se pueden encolar más, en orden).
    assert "!raw.startsWith('pendiente')" in panel
    assert "onAjustarTiempo={onAjustarTiempo}" in leer("admin", "components", "AdminMissionControlShell.tsx")
    comp = leer("admin", "components", "AjusteDeTiempo.tsx")
    assert "Sumar tiempo" in comp and "Restar tiempo" in comp and "No le cambia" not in comp  # la pregunta vive en ajusteDeTiempo.ts


def test_la_vista_general_se_pide_ligera_y_la_api_manda_op_id():
    api = leer("admin", "lib", "adminApi.ts")
    assert "{ password, ligero: true } : { ligero: true }" in api
    assert "op_id: opId" in api and "/api/admin/jugador/tiempo" in api
    cola = leer("admin", "lib", "accionesDeJugador.ts")
    assert "op_id: op.opId" in cola and "AbortController" in cola and "saga-admin-cola-v1" in cola
    assert "motivo === 'sesion') pausadaPorSesion = true" in cola


def test_sin_colores_nuevos_a_mano_en_lo_nuevo():
    for fichero in (("admin", "components", "AjusteDeTiempo.tsx"), ("admin", "lib", "accionesDeJugador.ts"), ("admin", "lib", "ajusteDeTiempo.ts")):
        texto = leer(*fichero)
        import re

        assert not re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(", texto), fichero
