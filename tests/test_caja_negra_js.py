# -*- coding: utf-8 -*-
"""Revisión del 19/10/2026, lado del móvil: se EJECUTA la lógica TS (tests/js/caja_negra.cjs).

- Caja negra: sólo se olvida lo que el servidor aceptó; los fallos fuera de un reto no cuentan; la hora atrasada con
  la app fuera es sospecha y un móvil que sólo durmió no; el cierre inesperado trae su caída medida.
- Reloj del nodo: no salta con la hora del sistema y sí cuenta lo dormido con la pantalla bloqueada.
- Mochila: un reinicio la vacía UNA vez, aunque el reloj del móvil vaya atrasado.
- Tienda: una pieza sin ganar no borra el personaje.
- En partida no se baja el paquete de una misión cambiada; en la pantalla de carga, sí.

Sin Node o sin frontend/node_modules, se salta.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
ARNES = RAIZ / "tests" / "js" / "caja_negra.cjs"


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    proceso = subprocess.run(
        [node, str(ARNES)], capture_output=True, text=True, encoding="utf-8", timeout=240, cwd=str(RAIZ)
    )
    assert proceso.returncode == 0, proceso.stderr[-3000:]
    datos = json.loads(proceso.stdout)
    errores = {k: v["__error"] for k, v in datos.items() if isinstance(v, dict) and "__error" in v}
    assert not errores, errores
    return datos


def test_la_caja_negra_solo_olvida_lo_aceptado(js):
    r = js["cajaNegra"]
    assert r["enviados"] == ["inicio", "hoja", "reto_fallo"], "un fallo fuera de un reto no es un fallo del reto"
    assert r["quedan"] == 0


def test_hora_atrasada_fuera_es_sospecha_y_dormir_no(js):
    r = js["cajaNegra"]
    assert "reloj" in r["tiposA"]
    assert "reloj" not in r["tiposC"], "el móvil que sólo durmió no cambió la hora"


def test_el_cierre_inesperado_trae_su_caida(js):
    inicio = js["cajaNegra"]["inicioB"]
    assert inicio["previo"] == "cerrada_mal"
    assert 89_000 <= inicio["caida_ms"] <= 95_000


def test_el_reloj_del_nodo_no_salta_y_cuenta_lo_dormido(js):
    r = js["relojDelNodo"]
    assert r["unMinuto"] == 60_000
    assert r["trasSalto"] == 60_000, "un salto de la hora del sistema no suma"
    assert r["trasDormir"] == 360_000, "bloquear la pantalla no para el reloj"
    assert r["abierto"] is True and r["otro"] is False


def test_la_mochila_se_vacia_una_vez_por_reinicio(js):
    assert js["mochilaTrasReinicio"] == {"trasPrimera": 0, "trasSegunda": 1, "trasNuevo": 0}


def test_una_pieza_sin_ganar_no_borra_el_personaje(js):
    r = js["tienda"]
    assert r["okBloqueado"] is True and r["sigueLocal"] is True and r["pendienteTrasBloqueado"] is False
    assert r["trasOcupado"] is False, "si lo tiene otro, sí se suelta"


def test_en_partida_no_se_baja_el_paquete(js):
    r = js["paqueteEnPartida"]
    assert r["paquetesEnPartida"] == 0
    assert r["revisionEnPartida"] == "R1", "la revisión vieja deja el paquete marcado para la próxima carga"
    assert r["cambiada"] is True and r["conJuego"] is True
    assert r["bajoFuera"] is True


def test_con_el_teclado_abierto_se_da_el_hueco_visible(js):
    """20/10: la clave, el PIN y el código de respaldo quedaban DEBAJO del teclado en iPhone."""
    r = js["teclado"]
    assert r["cerrado"] is None and r["sinMedida"] is None, "sin teclado manda el diseño de siempre"
    assert r["barraDelNavegador"] is None, "la barra del navegador no es un teclado"
    assert r["abierto"] == {"alto": 508, "arriba": 0, "tapado": 336}
    assert r["corrido"]["arriba"] == 24 and r["corrido"]["alto"] == 508

