"""23/11: «personajes planos NUNCA». Con `SIEMPRE_EN_TRES_D` todos los disponibles van en 3D real; el tope de la calidad
sólo reparte cuerpos COMPLETOS y BARATOS (menos ritmo de pose, pose congelada si están quietos, malla de pocos triángulos).
La lógica pura corre en Node (tests/js/siempre_tres_d.cjs)."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
CAPA = RAIZ / "frontend" / "src" / "player" / "avatares3d" / "mixamo" / "capaAvatares.ts"


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "siempre_tres_d.cjs")], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_los_quince_van_en_tres_d_en_cualquier_calidad(js):
    assert js["constante"] is True
    for cal, n in (("baja", 3), ("media", 6), ("alta", 10)):
        q = js["quince"][cal]
        assert q["tresD"] == 15 and q["porTope"] == 0
        assert q["completos"] == n and q["baratos"] == 14 - n


def test_el_modo_antiguo_sigue_para_comparar(js):
    assert js["viejo"] == {"tresD": 4, "porTope": 11, "baratos": 0}


def test_sin_modelo_no_ocupa_plaza_y_quien_anda_gana(js):
    assert js["sinModelo"] == ["b"]
    assert js["andaGana"][0] == "anda"
    assert js["baratos"][0] == "j3" and "j2" not in js["baratos"]


def test_el_trato_baja_en_orden_ritmo_pose_congelada_malla(js):
    t = js["trato"]
    assert t["yo"] == {"cada": 1, "malla": "completa"}
    assert t["primero"]["cada"] == 1 and t["completoAndando"]["malla"] == "completa"
    assert t["baratoAndando"] == {"cada": 2, "malla": "baja"}
    assert t["baratoParado"] == {"cada": None, "malla": "baja"}
    assert t["baratoBaja"]["cada"] >= t["baratoAndando"]["cada"]


def test_el_recorte_por_tareas_largas_nunca_deja_a_nadie_plano_y_vuelve_rapido(js):
    assert min(js["largas"]) >= 1 and js["largas"][-1] > js["largas"][3]


def test_la_capa_no_hornea_cartel_con_la_constante_puesta():
    capa = CAPA.read_text(encoding="utf-8")
    assert "for (const clave of sel.porTope)" in capa  # el camino antiguo, sólo vivo con SIEMPRE_EN_TRES_D = false
    assert "tratoDelCuerpo(" in capa and "ponerMalla(av, trato.malla)" in capa
