# -*- coding: utf-8 -*-
"""5/11/2026: repaso de textos (es/gl), recorriendo la app en cada idioma a 360, y la sombra de los nodos.

Un test por arreglo.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src"


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8-sig")


def test_el_puente_respeta_la_caja_del_texto_de_la_pantalla():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "caja_puente_5_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    d = json.loads(p.stdout)
    assert d == {"frase": "Punto de control", "minus": "punto de control", "mayus": "PUNTO DE CONTROL",
                 "igual": "Ferramentas"}
    puente = leer("i18n/legacySpanishBridge.ts")
    assert puente.count("conSuCaja(normalized, ") == 3


def test_gallego_achegate_y_no_acercate():
    puente = leer("i18n/legacySpanishBridge.ts")
    for gl in ("'Achégate máis para abrir este nodo.'", "'Achégate para recoller este obxecto.'",
               "'Achégate ao nodo para desbloquealo.'", "Raio ${match[1]} m. Achégate máis"):
        assert gl in puente, gl
    assert ": 'Acércate máis para abrir este nodo.'" not in puente


def test_avanzado_guardar_y_sincronizar_en_gallego():
    puente = leer("i18n/legacySpanishBridge.ts")
    assert "'Avanzado: guardar y sincronizar': 'Avanzado: gardar e sincronizar'" in puente
    assert "Avanzado: gardar e sincronizar · ${match[1]} pendentes" in puente


def test_mision_sin_conexion_en_gallego():
    f = leer("player/components/FieldPrepPanel.tsx")
    gl = f.split("  gl: {", 1)[1]
    assert "misionOffline: 'Misión sen conexión'" in gl


def test_palabras_gallegas():
    assert "sobre as caselas" in leer("shared/PuertaDeMision.tsx")
    assert "Non se le soa: preme 📸" in leer("player/components/textosDePantallas.ts")


def test_glosario_ruta_no_travesia():
    for f in ("player/components/textosDePantallas.ts", "player/runtime.ts", "player/playerAppBase.ts",
              "i18n/legacySpanishBridge.ts"):
        assert "travesía'" not in leer(f) and "travesía.`" not in leer(f) and "travesía.'" not in leer(f), f
    assert "comenzarTravesia: 'Empezar la ruta'" in leer("player/playerAppBase.ts")


def test_la_guia_usa_el_nombre_del_juego_en_ingles():
    assert "'Iron pulse'" in leer("player/guia/guia.ts")


def test_la_sombra_de_contacto_llega_al_borde_de_la_peana():
    b = leer("player/components/bolaRenderizada.ts")
    suelo = b.split("export function dibujarSuelo", 1)[1][:1500]
    # 6/11: más pequeña y suave (se sumaba en una mancha negra con varios nodos juntos).
    assert "createRadialGradient(c, c, 0, c, c, r * 0.48)" in suelo
    assert "addColorStop(0, 'rgba(0,0,0,0.42)')" in suelo
