# -*- coding: utf-8 -*-
"""24/11/2026 (Óscar: «los jugadores deben moverse por el mapa con fluidez y con sentido: si alguien se mueve 5 o 10 metros, no
se puede poner a correr; gasta lo mínimo, pero que no quede feo»).

Lo que se vio midiendo (banco con el motor Mixamo de verdad, scratchpad movimiento): un compañero que llevaba más de 95 s quieto
(o acababa de aparecer) no tenía ritmo de latido y usaba el de un GPS (1,3 s), así que cruzaba su banda muerta de 12-40 m a 3,2
m/s; un salto de 200 m se deslizaba un minuto a 3,2 m/s; y el clip salía de la velocidad que se ve (dividida por el tamaño del
muñeco): a z17,5 nadie corría nunca, y de muy cerca cualquier puesta al día era correr.

Reglas: sin ritmo visto, el de un latido (30 s); un tramo nunca más lento que 0,6 m/s; teleport (fundido) sólo si salta más de
150 m y a pie no se llega desde su fix anterior (o tras 95 s sin señal); el clip por la velocidad REAL: quieto < ~0,3-0,5 m/s
(histéresis de la ventana), andar, y correr sólo a >= 2,5 m/s sostenidos 6 s (deja de correr por debajo de 2); con «reducir
movimiento», nunca corre. Lógica en Node (tests/js/movimiento_24_11.cjs) y estáticos del camino.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src" / "player"


@pytest.fixture(scope="module")
def d():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "movimiento_24_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def leer(rel):
    return (SRC / rel).read_text(encoding="utf-8-sig")


# ---------------------------------------------------------------- 1. lógica

def test_correr_solo_sostenido_y_sin_parpadeo(d):
    m = d["marcha"]
    assert m["andar"] == ["andar"], m
    # A 3 m/s corre a los 6 s; sigue a 2,2 (histéresis), anda a 1,9 y queda quieto a 0: tres cambios, ni uno más.
    assert m["primeraCorridaS"] == 6 and m["sigueCorriendoA22"] == "correr" and m["dejaDeCorrerA19"] == "andar", m
    assert m["quietoA0"] == "quieto" and m["cambiosCorrer"] == 3, m
    # Ponerse al día 10 m a 3,2 m/s es andar; bailar entre 2,4 y 2,6 no es correr; con «reducir movimiento», nunca.
    assert "correr" not in m["ponerseAlDia"] and m["baile"] == ["andar"] and m["reducido"] == ["andar"], m


def test_el_paso_nunca_mezcla_correr_andando(d):
    p = d["paso"]
    assert p["quieto"] == 0 and p["andarLento"] == 0.6, p
    # Andando, por debajo de donde el motor empieza a mezclar el correr (1,8); corriendo, el clip de correr (>= 3,2).
    assert p["andarDeCercaRapido"] == 1.7 and p["correrDeLejos"] == 3.2 and p["correrDeCerca"] == 4, p


def test_echa_a_andar_desde_medio_metro_por_segundo(d):
    v = d["ventana"]
    assert v["a06"] == 0.6 and v["a02"] == 0 and v["a13"] == 1.3, v


def test_un_companero_que_estaba_quieto_no_echa_a_correr(d):
    c = d["compa"]
    # 39 m tras 150 s quieto: antes 3,2 m/s en 12 s; ahora al ritmo de un latido (33 s, ~1,2 m/s).
    assert c["m39"]["vMax"] <= 1.3 and c["m39"]["llegaEnS"] >= 30 and c["m39"]["fundido"] == 1, c["m39"]
    # Con latido de 90 s, 30 m: a 0,6 m/s (anda despacio) en ~50 s, no 89 s patinando quieto.
    assert 0.55 <= c["lento"]["vMax"] <= 0.65 and 45 <= c["lento"]["llegaEnS"] <= 55, c["lento"]


def test_saltos_que_a_pie_no_se_hacen_se_funden(d):
    c = d["compa"]
    assert c["m200"]["fundido"] == 0 and c["m200"]["vMax"] == 0, c["m200"]       # 200 m en 30 s
    # 10 min sin señal y 300 m (24/11, tarde): a pie se hace, así que se pone al día deslizándose, sin fundido.
    assert c["offline"]["fundido"] == 1 and c["offline"]["vMax"] <= 5.5, c["offline"]
    # 180 m en 60 s (corriendo 3 m/s): se desliza, sin fundido y sin pasar de un trote.
    assert c["m180"]["fundido"] == 1 and 2.5 <= c["m180"]["vMax"] <= 3.2, c["m180"]


def test_andando_un_fix_suelto_que_retrocede_no_te_para(d):
    # Antes el primero que no avanzaba paraba el ancla: andando con ruido, tu muñeco iba a tirones (5 s clavado, 4 s a 3,2 m/s).
    assert d["anclas"] == {"unoAtras": 16, "dosAtras": 13.5}, d["anclas"]


# ---------------------------------------------------------------- 2. el camino

def test_el_cuerpo_elige_el_clip_con_la_velocidad_real():
    capa = leer("avatares3d/mixamo/capaAvatares.ts")
    # 24/11 (tarde): con la velocidad de VERDAD si su punto se mueve (tu filtro, o un compañero poniéndose al día).
    assert "const marcha = elegirMarcha(e.marcha, vm, ctx.ahora, reducido)" in capa
    assert "av.setSpeed(vm, pasoDeMarcha(marcha, vm, k))" in capa
    assert "marcha: { marcha: 'quieto', rapidaDesde: Number.NaN }" in capa, "el estado vive en la entrada: nada por fotograma"


def test_los_companeros_deslizan_con_ritmo_de_latido():
    fuente = leer("posicion/fuentePosicion.ts")
    assert "ritmoInicialMs: 30000" in fuente and "velocidadMinima: 0.6" in fuente and "saltoM: 150" in fuente
    suave = leer("avatares/movimientoSuave.ts")
    assert "const imposible = tramo / Math.max(1e-3, pasaron / 1000) > VELOCIDAD_MAX_DESLIZ_MS" in suave
    assert "duracionDeTramo(salto, this.ritmoMs, this.maxMs, this.velocidadMinima)" in suave
