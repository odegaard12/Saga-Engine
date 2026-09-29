# -*- coding: utf-8 -*-
"""«Pulso de hierro» (owner-approved): segundo game_id de la familia
motion_challenge, en el grupo de presentación "Movimiento" (no existe
todavía una familia "Desafío" en displayFamilies.ts -ver ese fichero-; si
llega a existir, este game_id sería candidato a mudarse ahí).

Pedido explícito del organizador: "que sea mas dificil.. la gente se queja
de que los juegos eran faciles" y "que dure mas de 1 minuto". El reto
combina DOS entradas/sensores independientes a la vez -sujetar el móvil
quieto (acelerómetro, motion_challenge invertido) mientras se repite una
secuencia Simón Dice creciente con la otra mano (dedo)-, algo que ningún
otro minijuego del catálogo hace.

Esto prueba, del lado servidor:

  - normalize_minigame_config produce los campos pulso_* para
    game_id=pulso_hierro y NO toca el motion_challenge de siempre
    (shake_charge).
  - cada número admin-configurable se recorta a un rango razonable
    (longitud inicial, rondas, crecimiento, varianza de estabilidad,
    ventana de toque).
  - el suelo de anti-trampas (_suelo_pulso_hierro) depende del nodo real
    (nº de toques totales x ventana de toque real), igual que el existente
    de rumbo_doble/sequence_code -no es un número adivinado, ver v5.34.0 en
    anti_cheat.py-.
  - con la configuración por defecto, el suelo físico -que es un MÍNIMO,
    nunca la duración esperada- ya queda claramente por encima de 60s: la
    partida real (que además suma tiempo de "ver" cada secuencia y algún
    reinicio por temblor de mano) dura más todavía.
  - catálogo/mapeo de familia de presentación incluyen pulso_hierro una vez.
  - el editor no necesita ningún componente propio (a diferencia de
    rumbo_doble/cuenta_senales): son números planos que el editor genérico
    ya sabe pintar.
"""
import os
import re
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-pulso-hierro-"))

from backend.app.runtime.minigames import normalize_minigame_config  # noqa: E402
from backend.app.runtime.core_engine import normalize_stage  # noqa: E402
from backend.app.runtime.anti_cheat import (  # noqa: E402
    MIN_PLAUSIBLE_STAGE_MS,
    MINIGAME_HARD_FLOOR_MS_BY_GAME,
    _umbral_fisico_ms,
)

RAIZ = Path(__file__).resolve().parent.parent
GAME_CATALOG = RAIZ / "frontend" / "src" / "admin" / "lib" / "gameCatalog.ts"
DISPLAY_FAMILIES = RAIZ / "frontend" / "src" / "admin" / "lib" / "displayFamilies.ts"
GUIDED_UTILS = RAIZ / "frontend" / "src" / "admin" / "components" / "guided-editor" / "guidedEditorUtils.ts"
FAMILY_CONFIGS = RAIZ / "frontend" / "src" / "admin" / "lib" / "familyConfigs.ts"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# normalize_minigame_config / normalize_stage
# ---------------------------------------------------------------------------


def test_pulso_hierro_normaliza_valores_por_defecto():
    config = normalize_minigame_config("motion_challenge", {"game_id": "pulso_hierro"})
    assert config["game_id"] == "pulso_hierro"
    assert config["objective"] == "pulso_hierro"
    assert config["pulso_start_length"] == 3
    assert config["pulso_target_rounds"] == 6
    assert config["pulso_growth_per_round"] == 1
    assert config["pulso_stability_variance_max"] == 0.9
    assert config["pulso_tap_window_ms"] == 2600
    assert config["pulso_pad_count"] == 4


def test_pulso_hierro_recorta_valores_fora_de_rango():
    config = normalize_minigame_config(
        "motion_challenge",
        {
            "game_id": "pulso_hierro",
            "pulso_start_length": 999,
            "pulso_target_rounds": -5,
            "pulso_growth_per_round": 50,
            "pulso_stability_variance_max": 500,
            "pulso_tap_window_ms": 1,
            "pulso_pad_count": 0,
        },
    )
    assert 2 <= config["pulso_start_length"] <= 6
    assert 3 <= config["pulso_target_rounds"] <= 10
    assert 0 <= config["pulso_growth_per_round"] <= 3
    assert 0.2 <= config["pulso_stability_variance_max"] <= 3.0
    assert 1200 <= config["pulso_tap_window_ms"] <= 5000
    assert 3 <= config["pulso_pad_count"] <= 6


def test_motion_challenge_de_shake_charge_non_cambia():
    """O motion_challenge de sempre (sen game_id=pulso_hierro) segue igual."""
    config = normalize_minigame_config("motion_challenge", {})
    assert config["game_id"] == "shake_charge"
    assert config["objective"] == "shake_charge"
    assert "pulso_start_length" not in config

    config_shake = normalize_minigame_config(
        "motion_challenge", {"game_id": "shake_charge", "energy_target": 120}
    )
    assert config_shake["energy_target"] == 120
    assert "pulso_start_length" not in config_shake


def test_alias_resolve_via_normalize_stage_tipo_segue_sendo_motion_challenge():
    node = normalize_stage(
        {
            "id": "n1",
            "title": "Nodo de prueba",
            "lat": 42.0,
            "lon": -8.0,
            "minigame": {
                "type": "motion_challenge",
                "config": {"game_id": "pulso_hierro"},
            },
        }
    )
    assert node["interaction"]["type"] == "motion_challenge"
    assert node["interaction"]["config"]["game_id"] == "pulso_hierro"


# ---------------------------------------------------------------------------
# Anti-trampas: suelo físico derivado, non adiviñado (ver v5.34.0)
# ---------------------------------------------------------------------------


def test_pulso_hierro_ten_suelo_propio_rexistrado():
    assert "pulso_hierro" in MINIGAME_HARD_FLOOR_MS_BY_GAME


def test_suelo_de_pulso_hierro_e_toques_totais_por_ventana_de_toque():
    # 3 rondas: lonxitudes 3, 4, 5 -> 12 toques totais. Ventana 2000 ms.
    node = {
        "interaction": {
            "type": "motion_challenge",
            "config": {
                "game_id": "pulso_hierro",
                "pulso_start_length": 3,
                "pulso_target_rounds": 3,
                "pulso_growth_per_round": 1,
                "pulso_tap_window_ms": 2000,
            },
        }
    }
    umbral = _umbral_fisico_ms("pulso_hierro", node)
    assert umbral == 12 * 2000


def test_suelo_de_pulso_hierro_nunca_baixa_do_xenerico():
    node = {
        "interaction": {
            "type": "motion_challenge",
            "config": {
                "game_id": "pulso_hierro",
                "pulso_start_length": 1,
                "pulso_target_rounds": 1,
                "pulso_growth_per_round": 0,
                "pulso_tap_window_ms": 1,
            },
        }
    }
    umbral = _umbral_fisico_ms("pulso_hierro", node)
    assert umbral >= MIN_PLAUSIBLE_STAGE_MS


def test_configuracion_por_defecto_dura_moito_mais_de_60_segundos():
    """Requisito explícito do dono: "que dure mais de 1 minuto". O suelo
    físico -que xa é un MÍNIMO, nunca a duración esperada dunha partida
    real- ten que quedar claramente por riba de 60000 ms coa configuración
    por defecto (3, 4, 5, 6, 7, 8 toques = 33 toques x 2600 ms)."""
    config = normalize_minigame_config("motion_challenge", {"game_id": "pulso_hierro"})
    node = {"interaction": {"type": "motion_challenge", "config": config}}
    umbral = _umbral_fisico_ms("pulso_hierro", node)
    assert umbral == 33 * 2600
    assert umbral > 60000, "o suelo por defecto debería quedar claramente por riba de 60s"
    assert umbral > 80000, "moito máis de 60s, non só 'xusto por riba'"


# ---------------------------------------------------------------------------
# Frontend: catálogo / familia de presentación (lectura de fonte, sen runner JS)
# ---------------------------------------------------------------------------


def test_pulso_hierro_aparece_unha_vez_no_catalogo():
    codigo = leer(GAME_CATALOG)
    ocorrencias = len(re.findall(r"^\s*id:\s*'pulso_hierro'", codigo, flags=re.MULTILINE))
    assert ocorrencias == 1, f"pulso_hierro debería aparecer 1 vez en adminGameCatalog, aparece {ocorrencias}"
    assert "'pulso_hierro'" in codigo  # tamén no tipo AdminGameId


def test_pulso_hierro_familia_motion_challenge_e_runtime_ready():
    codigo = leer(GAME_CATALOG)
    inicio = codigo.index("id: 'pulso_hierro',")
    fin = codigo.index("\n  },", inicio)
    bloque = codigo[inicio:fin]
    assert "family: 'motion_challenge'" in bloque
    assert "runtimeStatus: 'runtime_ready'" in bloque
    assert "game_id: 'pulso_hierro'" in bloque


def test_pulso_hierro_mapea_a_desafio():
    codigo = leer(DISPLAY_FAMILIES)
    inicio = codigo.index("DISPLAY_FAMILY_BY_GAME_ID")
    fin = codigo.index("\n}", inicio)
    bloque = codigo[inicio:fin]
    pares = dict(re.findall(r"^\s*([a-z_]+):\s*'([a-z_]+)',?\s*$", bloque, flags=re.MULTILINE))
    assert pares.get("pulso_hierro") == "desafio"


def test_pulso_hierro_non_ten_editor_propio_son_knobs_xenericos():
    """A diferencia de rumbo_doble/cuenta_senales (listas -> editor propio),
    pulso_hierro son números planos: cero compoñente de admin dedicado."""
    codigo = leer(GUIDED_UTILS)
    assert "'pulso_hierro'" in codigo
    idx = codigo.index("export function guidedConfigKeysForGame")
    fin = codigo.index("\nexport function slugOf", idx)
    bloque = codigo[idx:fin]
    assert "pulso_hierro" in bloque
    assert "pulso_start_length" in bloque
    assert "pulso_target_rounds" in bloque

    idx_custom = codigo.index("CUSTOM_GAME_EDITOR_IDS")
    fin_custom = codigo.index("])", idx_custom)
    bloque_custom = codigo[idx_custom:fin_custom]
    assert "pulso_hierro" not in bloque_custom, (
        "pulso_hierro NON debería estar en CUSTOM_GAME_EDITOR_IDS: son knobs "
        "xenéricos, non precisa editor propio -é a ventaxe operativa deste deseño-"
    )


def test_familyconfigs_non_perde_os_campos_pulso_ao_normalizar():
    """Mesmo bug que rumbo_doble/cuenta_senales (ver comentario en
    familyConfigs.ts): a rama xenérica de motion_challenge devolve SEMPRE
    as súas claves fixas de shake_charge; a rama de pulso_hierro ten que ir
    ANTES para non perder os seus propios campos."""
    codigo = leer(FAMILY_CONFIGS)
    idx_fn = codigo.index("function _normalizeAdminConfigForFamilyRaw")
    idx_pulso = codigo.index("raw.game_id === 'pulso_hierro'", idx_fn)
    idx_generico = codigo.index("if (type === 'motion_challenge') {", idx_fn)
    assert idx_pulso < idx_generico, (
        "a rama de pulso_hierro en _normalizeAdminConfigForFamilyRaw ten que ir "
        "ANTES da rama xenérica de motion_challenge"
    )
    assert "pulso_start_length" in codigo
    assert "pulso_target_rounds" in codigo
    assert "pulso_stability_variance_max" in codigo
    assert "pulso_tap_window_ms" in codigo
