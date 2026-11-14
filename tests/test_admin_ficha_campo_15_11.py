# -*- coding: utf-8 -*-
"""15/11: ficha de campo + lista con prioridad del panel de Jugadores (frontend). Piezas puras con node y comprobaciones de
texto sobre lo que necesita un navegador (la parte visual se miró con capturas)."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
SRC = RAIZ / "frontend" / "src" / "admin"
NODE = shutil.which("node")


def leer(*ruta):
    return SRC.joinpath(*ruta).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def datos():
    if not NODE:
        pytest.skip("sin node")
    p = subprocess.run([NODE, str(RAIZ / "tests" / "js" / "ficha_campo_15_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_el_nodo_se_dice_con_nombre_y_numero(datos):
    assert datos["nodo"] == ["Nodo 5 de 13 · Pulso de hierro", "Nodo 5 de 13", "Terminó los 13 nodos"]


def test_la_presencia_dice_hace_cuanto(datos):
    vivo, recien, vieja, off, off_nunca = datos["presencia"]
    assert vivo["texto"] == "En vivo · hace 45 s" and vivo["tono"] == "ok"
    assert recien["texto"] == "En vivo"
    assert vieja["texto"].startswith("Señal vieja · hace 4 min") and vieja["tono"] == "aviso"
    assert off["texto"].startswith("Sin conexión · hace") and off["tono"] == "error"
    assert off_nunca["texto"] == "Sin conexión"  # last_seen 0: nunca «hace 20763 d»


def test_quien_necesita_atencion_y_en_que_orden(datos):
    a = datos["atencion"]
    assert a == {"normal": "normal", "offline": "sin_conexion", "gps": "senal_floja", "vieja": "senal_floja",
                 "terminado": "terminado", "sinDatos": "normal", "atascado": "atascado"}
    # sin conexión, atascado, normales (en su orden) y los que terminaron, al final
    assert datos["orden"] == ["off", "atasc", "ok1", "ok2", "fin"]
    assert datos["resumen"] == {"jugando": 2, "atencion": 1, "sinConexion": 1, "terminados": 1}


def test_los_chips_de_la_ficha(datos):
    assert datos["chips"] == ["presencia:ok:En vivo · hace 45 s", "nodo:neutro:7 min en este nodo", "gps:ok:GPS ±8 m",
                              "tiempo:neutro:Tiempo 6 min 48 s", "estrellas:neutro:★ 3"]
    assert datos["chipGpsFloja"]["tono"] == "aviso"
    assert datos["chipsFilaTerminado"] == ["Terminó"]


def test_lo_que_se_entrega_al_pasar_de_nodo(datos):
    assert datos["entrega"] == ["Llave vieja"]
    assert datos["entregaSinNodo"] == []


def test_mensajes_con_nombre_nodo_y_sin_ids(datos):
    m = datos["mensajes"]
    assert m["avanza"].startswith("Marta Rivas pasa del nodo 4 al 5.")
    assert "Se le da: Llave vieja." in m["avanza"] and m["avanza"].endswith("Lo verá en su móvil al reconectar.")
    assert "+5 min de tiempo" in m["conTiempo"]
    assert "El servidor ya lo tenía aplicado" in m["repetida"]
    assert "Pasa del nodo 4 al 5" in m["dar"]
    assert m["pendiente"].startswith("Sin cobertura:") and "Marta Rivas" in m["pendiente"]
    assert m["opIdReusado"].startswith("Esa acción ya se había enviado")
    assert "invalid" not in m["itemInvalido"].lower()
    assert m["desconocido"] is None
    assert m["tiempoElegido"] == ["sin tiempo", "con el tiempo del código de respaldo", "+5 min"]


def test_la_ficha_aplica_con_deshacer_y_confirma_con_hoja():
    ficha = leer("components", "FichaDeCampo.tsx")
    assert "retenerMs: PLAZO_DESHACER_MS" in ficha and "PLAZO_DESHACER_MS = 6000" in ficha
    assert "HojaDeConfirmacion" in ficha and "lazy(() => import('./HojaDar'))" in ficha
    # nada de window.confirm en la ficha: las hojas dicen qué se entrega y el tiempo
    assert "window.confirm(" not in ficha
    hoja = leer("components", "HojaDeConfirmacion.tsx")
    for texto in ("Ninguno", "El del código de respaldo", "Una cifra"):
        assert texto in hoja
    assert "role=\"dialog\"" in hoja and "aria-modal" in hoja and "Escape" in hoja


def test_la_lista_se_ordena_por_atencion_y_tiene_resumen():
    j = leer("components", "PlayersPanel.tsx")
    assert "ordenarPorAtencion(" in j and "resumenDeLista(" in j and "filasOrdenadas.map(" in j
    for etiqueta in ("jugando", "necesitan atención", "sin conexión", "terminados"):
        assert f"<span>{etiqueta}</span>" in j
    assert "Sumar 1 minuto a" in j  # +1 min rápido en cada fila


def test_las_acciones_de_vestuario_van_por_la_cola_con_op_id():
    v = leer("lib", "accionesDeVestuario.ts")
    for tipo in ("tipo: 'conceder'", "tipo: 'retirar'", "tipo: 'estrellas'"):
        assert tipo in v
    p = leer("components", "vestuario", "DesbloqueablesPanel.tsx")
    assert "regalarEstrellas" not in p and "concederDesbloqueo" not in p and "retirarDesbloqueo" not in p
    assert "darEstrellasPorCola(" in p and "quitarPieza(" in p


def test_el_mapa_del_admin_abre_ficha_al_tocar():
    mapa = leer("AdminMissionMap.tsx")
    assert "circle.bindPopup(" in mapa


def test_la_ficha_sin_colores_a_mano():
    css = leer("styles", "admin-r8-ficha.css")
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(", css)
    assert "prefers-reduced-motion" in css
