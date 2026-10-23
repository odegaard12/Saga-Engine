# -*- coding: utf-8 -*-
"""Revisión del 23/10/2026: panel del organizador y entrada del jugador (tests/js/panel_y_entrada_23_10.cjs).

- PIN por jugador: un doble toque en «Generar» borraba de la pantalla los PIN recién dados (se ven UNA vez).
- Actividad: marcar un evento como leído no bajaba el contador de pendientes.
- Sesión caducada con PIN: el salto a la portada era `assign` y «atrás» rebotaba en un bucle; con nombres con
  tilde y espacio también.
- «Preparado el …» del mapa 3D y de la red de caminos salía en UTC y en crudo («…T08:00:00+0000»).
- Y lo que vive dentro de componentes (sin lógica aparte que ejecutar): se comprueba en el código.

Sin Node o sin frontend/node_modules, lo de JS se salta.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"
ARNES = RAIZ / "tests" / "js" / "panel_y_entrada_23_10.cjs"


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


def _leer(relativo):
    return (FRONT / relativo).read_text(encoding="utf-8")


def test_una_respuesta_vacia_no_borra_los_pin_que_se_ven(js):
    r = js["pines"]
    assert r["trasVacia"] == r["dados"], "el segundo toque («todos tienen ya su PIN») no los borra"
    assert r["trasOtro"] == {**r["dados"], "C": "333333"}
    assert r["trasRehacer"] == {"A": "999999", "B": "888888"}
    assert r["trasEstado"] == r["dados"]
    assert r["trasQuitar"] == {}


def test_marcar_leido_baja_el_contador(js):
    assert js["pendientes"] == {"leido": 4, "yaLeido": 5, "enCero": 0, "sinTotal": None, "reabierto": 6}


def test_la_sesion_caducada_va_al_pin_sin_atrapar_el_boton_de_atras(js):
    r = js["sesionCaducada"]
    assert r["estado"] == 403
    assert r["saltos"] == [["replace", "/?pin=Mart%C3%ADn%20G"]]


def test_la_hora_de_preparado_sale_en_la_de_espana(js):
    r = js["fechaDelServidor"]
    assert r["utc"] == r["conDosPuntos"] == r["madrid"] == "23/10/26, 10:00"
    assert r["raro"] == "ayer" and r["vacio"] == ""


def test_los_pin_del_panel_no_se_piden_dos_veces():
    codigo = _leer("admin/components/SettingsPanel.tsx")
    assert "if (ocupadoRef.current) return" in codigo
    assert "pinesAEnsenar(actuales, String(cuerpo.accion), datos.nuevos)" in codigo
    assert "setNuevos(datos.nuevos || {})" not in codigo


def test_borrar_una_foto_desde_el_panel_no_pierde_el_fallo():
    codigo = _leer("admin/components/SettingsPanel.tsx")
    trozo = codigo[codigo.index("async function borrar(p: Prueba)"):]
    trozo = trozo[: trozo.index("if (pruebas === null)")]
    assert "catch (error)" in trozo, "sin red, el fallo del fetch se perdía"
    assert "res.status !== 404" in trozo, "un 404 es que ya estaba borrada"


def test_el_avatar_vacia_el_campo_sin_reventar():
    codigo = _leer("admin/components/PlayersPanel.tsx")
    trozo = codigo[codigo.index("async function handleAvatarFile"):]
    trozo = trozo[: trozo.index("\n  }\n")]
    assert "const input = event.currentTarget" in trozo
    assert "event.currentTarget.value" not in trozo, "tras el await, currentTarget es null"


def test_los_avisos_vuelven_a_lo_guardado_si_falla():
    codigo = _leer("admin/components/AvisosPanel.tsx")
    trozo = codigo[codigo.index("async function guardar"):]
    trozo = trozo[: trozo.index("finally")]
    assert "const anterior = estado" in trozo and "setEstado(anterior)" in trozo


def test_el_pin_de_la_portada_se_manda_una_vez_y_limpia_la_direccion():
    codigo = _leer("login/LoginApp.tsx")
    assert "enviandoPinRef.current) return" in codigo
    assert "disabled={pin.length < 4 || enviandoPin}" in codigo
    assert "params.delete('pin')" in codigo and "window.history.replaceState" in codigo
    assert "onClick={() => setPinPara(null)}" not in codigo, "cancelar tiene que quitar también ?pin="
