"""r16 (personajes): gestos sutiles quitados sin romper lo guardado, caras de cerca y menú de gestos.

Lo quitado (de lejos no se distinguía de estar quieto) se pasa a su sustituto en TODOS los sitios donde puede
estar guardado: lo ganado (SQLite), las reglas de la misión, la copia del móvil y un gesto pedido por nombre.
"""
from __future__ import annotations

import json
import shutil
import sqlite3
import subprocess
from pathlib import Path

import pytest

from backend.app.runtime import desbloqueables_catalogo as cat
from backend.app.runtime import desbloqueos as reglas_mod
from backend.app.storage import desbloqueos_store as store

RAIZ = Path(__file__).resolve().parents[1]
MIXAMO = RAIZ / "frontend" / "src" / "player" / "avatares3d" / "mixamo"
QUITADOS = {"ge__acknowledging", "ge__look_away_gesture", "ge__relieved_sigh", "ge__thoughtful_head_shake", "ge__weight_shift"}


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "r16_personajes.cjs")], capture_output=True, text=True,
                       timeout=120, encoding="utf-8")
    assert r.returncode == 0, r.stderr[-3000:]
    return json.loads(r.stdout)


def test_los_sutiles_ya_no_estan_y_cada_uno_tiene_sustituto_vigente(js):
    assert not QUITADOS & set(cat.GESTOS) and set(cat.GESTOS_RETIRADOS) == QUITADOS
    assert all(nuevo in cat.GESTOS for nuevo in cat.GESTOS_RETIRADOS.values())
    # El móvil y el servidor dicen lo mismo.
    assert js["gestos"] == list(cat.GESTOS) and js["retirados"] == cat.GESTOS_RETIRADOS
    assert len(cat.GESTOS) == 7


def test_un_gesto_quitado_pedido_por_nombre_hace_su_sustituto(js):
    for viejo, nuevo in cat.GESTOS_RETIRADOS.items():
        assert js["vigente"][viejo] == nuevo
    assert js["vigente"]["ge__salute"] == "ge__salute"
    assert js["vigente"]["ge__inventado"] is None and js["vigente"]["42"] is None


def test_la_copia_vieja_del_movil_no_rompe_y_lo_ganado_pasa_al_sustituto(js):
    c = js["copiaVieja"]
    assert c["mios"] == ["gesto:ge__dismissing_gesture", "item:casco"], "sin duplicar el que ya tenía"
    assert c["nuevos"] == ["gesto:ge__head_nod_yes"]
    # Un bloqueo o un libre de un gesto quitado no se traslada (no bloquea a su sustituto).
    assert c["bloqueados"] == ["gesto:ge__clapping"] and c["libres"] == ["gesto:ge__salute"]
    assert js["bloqueadoSustituto"] is False
    assert js["nombreViejo"] == "Encoger los hombros"


def test_una_regla_guardada_que_daba_un_gesto_quitado_da_su_sustituto():
    regla, error = reglas_mod.normalizar_regla(
        {"id": "r", "cuando": {"tipo": "primer_nodo"}, "da": ["gesto:ge__weight_shift", "gesto:ge__relieved_sigh", "item:zocas"]})
    assert error is None and regla["da"] == ["gesto:ge__being_cocky", "item:zocas"]
    assert cat.clave_vigente("gesto:ge__acknowledging") == "gesto:ge__head_nod_yes"
    assert cat.clave_vigente("item:casco") == "item:casco"
    # Bloquear un gesto quitado no hace nada (ni bloquea a su sustituto).
    assert cat.bloqueadas_efectivas(["gesto:ge__weight_shift"]) == frozenset()
    # La propuesta inicial ya no reparte gestos quitados.
    assert not any(c[6:] in QUITADOS for r in reglas_mod.propuesta_de_reglas() for c in r["da"])


def test_lo_ganado_en_la_base_pasa_al_sustituto_al_abrirla(tmp_path):
    ruta = str(tmp_path / "saga.sqlite3")
    store.init_schema(ruta)
    ahora = 1
    with sqlite3.connect(ruta) as conn:
        filas = [("A", "gesto:ge__relieved_sigh", 5), ("A", "gesto:ge__weight_shift", None),
                 ("B", "gesto:ge__acknowledging", None), ("B", "gesto:ge__head_nod_yes", 7), ("B", "item:casco", None)]
        conn.executemany("INSERT INTO desbloqueos (jugador, clave, fuente, concedido_ms, visto_ms) VALUES (?, ?, 'x', ?, ?)",
                         [(j, k, ahora, v) for j, k, v in filas])
    # Otro proceso (o el arranque siguiente) abre la base: se migra.
    store.schema_cache._LISTOS.clear()
    assert sorted(store.claves_de(ruta, "A")) == ["gesto:ge__being_cocky"]
    assert sorted(store.claves_de(ruta, "B")) == ["gesto:ge__head_nod_yes", "item:casco"]
    # Lo visto se conserva (no vuelve a salir el punto rojo de algo que ya vio).
    assert [f["visto_ms"] for f in store.listar(ruta, "A")] == [5]


def test_caras_y_menu_cableados():
    tienda = (MIXAMO / "escenaTienda.ts").read_text(encoding="utf-8")
    assert "ponerCorneas(av)" in tienda and "mirarA(av, camara.position, dt)" in tienda
    cara = (MIXAMO / "cara.ts").read_text(encoding="utf-8")
    assert "AdditiveBlending" in cara and "LIMITE_YAW" in cara
    menu = (MIXAMO / "MenuDeGestos.tsx").read_text(encoding="utf-8")
    assert "EVENTO_HOJA_DE_GESTOS" in menu and "avisar(0)" in menu
    mapa = (RAIZ / "frontend" / "src" / "player" / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    assert "window.addEventListener(EVENTO_HOJA_DE_GESTOS, alHoja)" in mapa and "padding: antes" in mapa
    motor = (RAIZ / "sim" / "playwright-bench" / "harness" / "mixamo4" / "motor.js").read_text(encoding="utf-8")
    assert "ZANCADA = { walk: 1.55, run: 3.1 }" in motor and "ge__shaking_head_no: 2" in motor
