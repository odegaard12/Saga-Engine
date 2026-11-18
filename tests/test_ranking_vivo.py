# -*- coding: utf-8 -*-
"""18/11/2026 (6.11.9): clasificación en directo. Lógica pura en tests/js/ranking_vivo_21.cjs; el resto, de código fuente.

- Reorden en directo con FLIP (no sólo al abrir), una sola cuenta para «al abrir» y «render anterior».
- Chips ▲/▼ de 6 s que se suman, se anulan y caducan; el chip de la apertura no reaparece tras uno en directo.
- Tu fila: degradado del acento, sin bordes ni esquinas, con la raya entre filas.
Sin Node o sin frontend/node_modules, lo de JS se salta.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
COMP = RAIZ / "frontend" / "src" / "player" / "components"
ARNES = RAIZ / "tests" / "js" / "ranking_vivo_21.cjs"


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    p = subprocess.run([node, str(ARNES)], capture_output=True, text=True, encoding="utf-8", timeout=240, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-3000:]
    datos = json.loads(p.stdout)
    errores = {k: v["__error"] for k, v in datos.items() if isinstance(v, dict) and "__error" in v}
    assert not errores, errores
    return datos


def _leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


def test_el_reorden_dice_quien_sube_y_quien_baja(js):
    r = js["reorden"]
    assert r["orden"] == ["C", "A", "B", "D"]
    assert [(m["user"], m["delta"]) for m in r["movs"]] == [("C", 2), ("A", -1), ("B", -1)]
    assert r["sinCambio"] == [] and r["nuloAntes"] == [], "sin cambio de orden no hay nada que animar"
    assert r["nuevo"] == [{"user": "A", "desde": 1, "hasta": 2, "delta": -1}], "quien entra ahora no tiene de dónde deslizarse"
    assert r["repetidos"] == [{"user": "A", "desde": 2, "hasta": 1, "delta": 1}], "la clave repetida cuenta una vez"
    assert r["firmaIgual"] is True, "un latido (last_seen) no es un reorden"
    assert r["firmaCambia"] is True


def test_lo_guardado_se_lee_sin_romper(js):
    g = js["guardados"]
    assert g["ok"] == {"A": 1, "B": 2}
    assert g["roto"] == g["nulo"] == g["lista"] == g["numero"] == {}
    assert g["basura"] == {"E": 3}, "sólo puestos enteros positivos"


def test_los_chips_se_suman_se_anulan_y_caducan(js):
    c = js["chips"]
    assert c["inicial"] == {"A": {"delta": 2, "marca": 1000}, "B": {"delta": -1, "marca": 1000}}
    assert c["suma"]["A"] == {"delta": 3, "marca": 3000}, "dos subidas seguidas suman y reinician los 6 s"
    assert "B" not in c["anula"], "▼1 y ▲1 se anulan"
    assert c["mismoObjetoSinCaducar"] is True, "sin caducidad no hay re-render"
    assert c["msChip"] == 6000
    assert "B" not in c["caduca"] and "A" in c["caduca"]


def test_el_chip_de_la_apertura_no_reaparece_tras_uno_en_directo(js):
    r = js["reorden"]
    assert r["fijos"] == {"C": 2, "A": -1, "B": -1}
    assert r["fijosTrasMover"] == {"Z": 1}, "C se movió en directo: su chip de la apertura ya no vale"
    assert r["fijosSinTocar"] is True


def test_claves_repetidas_se_quedan_con_la_primera(js):
    r = js["reorden"]
    assert r["repetidosFuera"] == [{"user": "A", "n": 1}, {"user": "B", "n": 2}]
    assert r["sinRepetidosMismo"] is True


def test_el_arranque_del_flip_continua_donde_se_ve_la_fila(js):
    a = js["animacion"]
    assert a["arranque"] == [168, -168, 0]
    assert a["continuaDesdeDondeSeVe"] == 86, "un 2.º reorden a mitad del 1.º suma lo que ya se ve"
    assert a["seAnula"] == 0
    assert a["escalon"] == [0, 35, 175, 350, 360, 360], "35 ms entre filas y tope de 360 (+240 = 600)"
    assert a["negativo"] == 0
    assert a["cuenta"] == [0, 87500, 100000, 100000, 0] and a["cuentaCero"] == 0
    assert a["topeFilas"] == 40


# --- Código fuente: lo que no se puede medir en Node -------------------------------------------------------------


def test_la_hoja_reordena_con_la_hoja_abierta_y_no_a_cada_latido():
    h = _leer(COMP / "RankingSheet.tsx")
    assert "function useReordenEnDirecto(" in h and "}, [firma])" in h, "el efecto cuelga de la firma del orden"
    assert "useDeslizarCambios" not in h, "el deslizado de sólo-al-abrir se unificó"
    assert "setInterval" not in h, "el tic de 1 s no leía nada y re-pintaba la hoja cada segundo"
    assert "sinRepetidos(ordenarClasificacion(players))" in h
    assert "key={selfUser || ''}" in h, "al cambiar de jugador la tabla relee lo guardado de ESE jugador"
    assert "style.willChange = 'transform'" in h and "style.willChange = ''" in h
    assert "prefiereMenosMovimiento(window.matchMedia" in h and "saga-ahorro" in h
    assert "a.cancel()" in h, "un reorden nuevo cancela el anterior"


def test_tu_fila_es_un_degradado_sin_bordes():
    css = _leer(COMP / "rankingVivo.css")
    yo = css.split(".saga-rk-yo {")[1].split("}")[0]
    assert "linear-gradient" in yo and "var(--theme-primary) var(--yo-a1, 26%)" in yo and "var(--theme-primary) var(--yo-a2, 10%)" in yo
    assert "border-radius" not in yo and "box-shadow" not in yo and "border" not in yo
    assert "margin: 0 -16px" in yo
    assert ".saga-rk-yo::after" in css, "la raya de la fila sigue, en el ancho de la lista"
    assert "--theme-on-primary" in css
    h = _leer(COMP / "RankingSheet.tsx")
    assert "filaYo" not in h and "inset 3px 0 0" not in h


def test_la_pantalla_final_y_los_temas_usan_el_mismo_degradado():
    fin = _leer(COMP / "MissionCompleteScreen.tsx")
    tema = _leer(RAIZ / "frontend" / "src" / "mobile-themes.css")
    for texto in (fin, tema):
        assert "color-mix(in srgb, var(--theme-primary) var(--yo-a1, 26%), transparent)" in texto
    assert ".saga-rank-row--self:not(.saga-rank-row--gana)" in fin
    assert "rgba(var(--theme-ok-soft), 0.22)" not in fin
    for nombre in ("dia", "solpor"):
        assert f"body.theme-{nombre} li.saga-rank-row--self:not(.saga-rank-row--gana)" in tema


def test_sin_animaciones_infinitas_y_con_reducir_movimiento():
    css = _leer(COMP / "rankingVivo.css")
    assert "infinite" not in css and "transition: all" not in css
    assert "@media (prefers-reduced-motion: reduce)" in css and "html.saga-ahorro" in css
