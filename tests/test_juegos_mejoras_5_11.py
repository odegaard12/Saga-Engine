# -*- coding: utf-8 -*-
"""Mejoras de juego del 5/11 (Óscar: «haz las seis, obvio» y mejora los flojos)."""
import json
import os
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-mejoras-"))

from backend.app.runtime import evidencia as ev  # noqa: E402
from backend.app.runtime import minigames as mg  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
FAM = RAIZ / "frontend" / "src" / "player" / "minigames" / "families"
NIV = json.loads((RAIZ / "backend" / "app" / "runtime" / "niveles_minijuegos.json").read_text("utf-8"))["juegos"]


def _leer(p):
    return Path(p).read_text(encoding="utf-8")


def _n(j, n):
    return NIV[j]["niveles"][str(n)]["params"]


TRES = {"questions": [{"question": "A", "answer": 3}, {"question": "B", "answer": 5, "tolerance": 1}, {"question": "C", "answer": 7}]}


def test_cuenta_varias_preguntas_por_jugador_y_una_si_solo_hay_una():
    assert len(mg.cuenta_senales_indices({**TRES, "preguntas_por_jugador": 3}, "n", "p")) == 3
    assert len(mg.cuenta_senales_indices({**TRES, "preguntas_por_jugador": 2}, "n", "p")) == 2
    una = {"questions": [{"question": "A", "answer": 3}, {"question": "Objetivo 2: ¿cuántos hay?", "answer": 1}], "preguntas_por_jugador": 3}
    assert mg.cuenta_senales_indices(una, "n", "p") == [0], "el relleno del normalizador no se pregunta"
    proy = mg.project_cuenta_senales_for_player({**TRES, "preguntas_por_jugador": 2}, "n", "p")
    assert len(proy["preguntas"]) == 2 and proy["answer_hashes"] == proy["preguntas"][0]["answer_hashes"]
    assert "answer" not in json.dumps(proy).replace("answer_hashes", "")
    assert [_n("cuenta_senales", n)["preguntas_por_jugador"] for n in (1, 2, 3)] == [1, 2, 3]


def test_cuenta_la_evidencia_revisa_cada_pregunta():
    nodo = {"id": "n", "interaction": {"config": {"game_id": "cuenta_senales", **TRES, "preguntas_por_jugador": 2}}}
    buenas = [lista[-1] for lista in mg.cuenta_senales_rondas_aceptadas(nodo["interaction"]["config"], "n", "p")]
    assert ev._revisar_cuenta_senales(nodo, "p", {"respuestas_por_pregunta": [[99, buenas[0]], [buenas[1]]]}) == []
    malo = ev._revisar_cuenta_senales(nodo, "p", {"respuestas_por_pregunta": [[buenas[0]], [99]]})
    assert malo and malo[0]["reason"] == "evidence_answer_mismatch" and malo[0]["evidence"]["pregunta"] == 2
    pantalla = _leer(FAM / "signalHunt" / "CuentaSenalesRuntimeScreen.tsx")
    assert "respuestas_por_pregunta: porPreguntaRef.current" in pantalla and "tx.preguntaDe(preguntaIdx + 1" in pantalla


def test_dinamo_tres_fases_cortas_lento_rapido_lento():
    assert (_n("shake_charge", 2)["dinamo_fases"], _n("shake_charge", 2)["dinamo_segundos"]) == (3, 15)
    assert (_n("shake_charge", 3)["dinamo_fases"], _n("shake_charge", 3)["dinamo_segundos"]) == (3, 18)
    assert "const centros = [0.7, 1.35, 0.7, 1.35, 0.7, 1.35]" in _leer(FAM / "motionChallenge" / "dinamo.ts")
    assert "actual.centro < 1 ? tx.ritmoLento : tx.ritmoRapido" in _leer(FAM / "motionChallenge" / "DinamoRuntimeScreen.tsx")


def test_pulso_fallar_cuesta_cinco_segundos_y_se_dice():
    fuente = _leer(FAM / "motionChallenge" / "PulsoHierroRuntimeScreen.tsx")
    assert "export const PULSO_PENALIZACION_POR_FALLO_MS = 5_000" in fuente
    assert "fallosRef.current += 1" in fuente and "penalizacionDelModo(true, porFallos)" in fuente
    assert "{pulso.fallarCuesta}" in fuente and "partidasGuardadas<number>('pulso_hierro')" in fuente


def test_mosaico_demostracion_de_girar():
    fuente = _leer(FAM / "placeMosaic" / "RuntimeScreen.tsx")
    assert "{girarPiezas && previewKind === 'intro' ? (" in fuente and "{t.demoGirar}" in fuente
    assert "animation: mosaic-demo-gira 1s cubic-bezier(.3,.7,.2,1) .4s 2 both;" in fuente, "dos giros y para: nada en bucle"


def test_interrogatorio_ejemplo_resuelto():
    assert "{t.ejemplo}" in _leer(FAM / "logica" / "InterrogatorioRuntimeScreen.tsx")
    assert _leer(FAM / "logica" / "textos.ts").count("    ejemplo:\n") == 2, "es y gl"


def test_balanza_muchas_bolas_seis_por_fila():
    assert "data-muchas={bolas > 12 ? '1' : undefined}" in _leer(FAM / "logica" / "BalanzaRuntimeScreen.tsx")
    assert ".lg-bolas[data-muchas='1'] {\n  grid-template-columns: repeat(6, 1fr);" in _leer(FAM / "logica" / "logica.css")


def test_mastermind_una_ronda_y_resultado_visible():
    assert [(_n("mastermind", n)["code_length"], _n("mastermind", n)["rounds"]) for n in (2, 3)] == [(5, 1), (5, 1)]
    fuente = _leer(FAM / "logica" / "MastermindRuntimeScreen.tsx")
    assert "texto: t.resultado(p.exactas, p.casi)" in fuente and "Number(cfg.rounds) || 1" in fuente


def test_matriz_al_reves_mas_lenta_y_feedback_por_casilla():
    assert _n("logic_circuit", 3)["preview_cell_ms"] == 420 and _n("logic_circuit", 3)["reverse"] is True
    fuente = _leer(FAM / "circuitMatrix" / "RuntimeScreen.tsx")
    assert "animation: circuitAcierto 360ms ease-out;" in fuente and "isWrong ? '✕'" in fuente

