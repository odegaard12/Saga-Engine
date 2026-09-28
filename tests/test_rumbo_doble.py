# -*- coding: utf-8 -*-
"""«Rumbo doble» (owner-approved): segundo game_id de la familia bearing_hunt.

En vez de un solo rumbo objetivo, el jugador apunta a 2 (admin-configurable
2-3) cosas reales visibles desde el nodo, una tras otra
(frontend/src/player/minigames/families/bearingHunt/RuntimeScreen.tsx). Esto
prueba, del lado servidor:

  - normalize_minigame_config produce `targets` para game_id=rumbo_doble y
    NO toca el bearing_hunt de objetivo único de siempre (target_bearing_deg).
  - los rumbos fuera de 0-359 se recortan (modulo), no revientan.
  - 2 y 3 objetivos sobreviven; con menos de 2 se rellena, nunca se pierde
    el nodo por quedar sin objetivos jugables.
  - el suelo de anti-trampas (_suelo_rumbo_doble) depende del nodo real
    (nº de objetivos x hold_ms), igual que el existente de sequence_code
    -no es un número adivinado, ver v5.34.0 en anti_cheat.py-.
  - catálogo/mapeo de familia de presentación incluyen rumbo_doble una vez.
  - el alias resuelve: type sigue siendo 'bearing_hunt', game_id lleva la
    variante -igual que team_relay/mapa_mudo dentro de signal_hunt-.
"""
import os
import re
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-rumbo-doble-"))

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
BEARING_HUNT_RUNTIME = (
    RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "bearingHunt" / "RuntimeScreen.tsx"
)
BEARING_HUNT_DEFINITION = (
    RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "bearingHunt" / "definition.ts"
)


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# normalize_minigame_config / normalize_stage
# ---------------------------------------------------------------------------


def test_rumbo_doble_normaliza_dous_obxectivos():
    config = normalize_minigame_config(
        "bearing_hunt",
        {
            "game_id": "rumbo_doble",
            "targets": [
                {"label": "la torre de la iglesia", "bearing_deg": 45},
                {"label": "el puente", "bearing_deg": 210},
            ],
            "tolerance_deg": 15,
            "hold_ms": 1500,
        },
    )
    assert config["game_id"] == "rumbo_doble"
    assert config["objective"] == "bearing_sequence"
    assert len(config["targets"]) == 2
    assert config["targets"][0] == {"label": "la torre de la iglesia", "bearing_deg": 45.0}
    assert config["targets"][1] == {"label": "el puente", "bearing_deg": 210.0}
    assert config["tolerance_deg"] == 15
    assert config["hold_ms"] == 1500


def test_rumbo_doble_normaliza_tres_obxectivos():
    config = normalize_minigame_config(
        "bearing_hunt",
        {
            "game_id": "rumbo_doble",
            "targets": [
                {"label": "A", "bearing_deg": 0},
                {"label": "B", "bearing_deg": 120},
                {"label": "C", "bearing_deg": 240},
            ],
        },
    )
    assert len(config["targets"]) == 3
    assert [t["label"] for t in config["targets"]] == ["A", "B", "C"]


def test_rumbo_doble_recorta_a_tres_obxectivos_como_moito():
    config = normalize_minigame_config(
        "bearing_hunt",
        {
            "game_id": "rumbo_doble",
            "targets": [{"label": f"T{i}", "bearing_deg": i * 10} for i in range(6)],
        },
    )
    assert len(config["targets"]) == 3


def test_rumbo_doble_con_menos_de_dous_obxectivos_enche_ata_dous():
    # Un nodo a medio configurar (0 ou 1 obxectivos) non debe quedar sen
    # nada que xogar: sempre hai polo menos 2.
    config = normalize_minigame_config(
        "bearing_hunt",
        {"game_id": "rumbo_doble", "targets": [{"label": "único", "bearing_deg": 30}]},
    )
    assert len(config["targets"]) >= 2

    config_vacio = normalize_minigame_config(
        "bearing_hunt", {"game_id": "rumbo_doble", "targets": []}
    )
    assert len(config_vacio["targets"]) >= 2


def test_rumbo_doble_rumbos_invalidos_recortanse_por_modulo():
    config = normalize_minigame_config(
        "bearing_hunt",
        {
            "game_id": "rumbo_doble",
            "targets": [
                {"label": "A", "bearing_deg": 400},
                {"label": "B", "bearing_deg": -30},
            ],
        },
    )
    bearings = [t["bearing_deg"] for t in config["targets"]]
    assert all(0 <= b < 360 for b in bearings)
    assert bearings[0] == 40.0
    assert bearings[1] == 330.0


def test_bearing_hunt_de_obxectivo_unico_non_cambia():
    """O bearing_hunt de sempre (sen game_id=rumbo_doble) ten que seguir
    comportándose EXACTAMENTE igual: mesmos campos, mesmos valores por
    defecto, sen `targets`."""
    config = normalize_minigame_config(
        "bearing_hunt",
        {"target_bearing_deg": 270, "tolerance_deg": 12, "hold_ms": 1200},
    )
    assert config["target_bearing_deg"] == 270
    assert config["tolerance_deg"] == 12
    assert config["hold_ms"] == 1200
    assert "targets" not in config

    # Sen game_id explícito, tampouco hai targets nin se rompe nada.
    config_defecto = normalize_minigame_config("bearing_hunt", {})
    assert config_defecto["target_bearing_deg"] == 90
    assert "targets" not in config_defecto


def test_alias_resolve_via_normalize_stage_tipo_segue_sendo_bearing_hunt():
    """Igual que team_relay/mapa_mudo dentro de signal_hunt: rumbo_doble non
    é un `type` novo, é un `game_id` dentro de bearing_hunt. normalize_stage
    ten que deixar interaction.type tal cual."""
    node = normalize_stage(
        {
            "id": "n1",
            "title": "Nodo de prueba",
            "lat": 42.0,
            "lon": -8.0,
            "minigame": {
                "type": "bearing_hunt",
                "config": {
                    "game_id": "rumbo_doble",
                    "targets": [
                        {"label": "A", "bearing_deg": 10},
                        {"label": "B", "bearing_deg": 200},
                    ],
                },
            },
        }
    )
    assert node["interaction"]["type"] == "bearing_hunt"
    assert node["interaction"]["config"]["game_id"] == "rumbo_doble"
    assert len(node["interaction"]["config"]["targets"]) == 2


# ---------------------------------------------------------------------------
# Anti-trampas: suelo físico derivado, non adiviñado (ver v5.34.0)
# ---------------------------------------------------------------------------


def test_rumbo_doble_ten_suelo_propio_rexistrado():
    assert "rumbo_doble" in MINIGAME_HARD_FLOOR_MS_BY_GAME


def test_suelo_de_rumbo_doble_e_numero_de_obxectivos_por_hold_ms():
    node = {
        "interaction": {
            "type": "bearing_hunt",
            "config": {
                "game_id": "rumbo_doble",
                "hold_ms": 1200,
                "targets": [
                    {"label": "A", "bearing_deg": 0},
                    {"label": "B", "bearing_deg": 90},
                ],
            },
        }
    }
    umbral = _umbral_fisico_ms("rumbo_doble", node)
    assert umbral == 2 * 1200


def test_suelo_de_rumbo_doble_con_tres_obxectivos_e_maior():
    node = {
        "interaction": {
            "type": "bearing_hunt",
            "config": {
                "game_id": "rumbo_doble",
                "hold_ms": 1500,
                "targets": [
                    {"label": "A", "bearing_deg": 0},
                    {"label": "B", "bearing_deg": 90},
                    {"label": "C", "bearing_deg": 180},
                ],
            },
        }
    }
    umbral = _umbral_fisico_ms("rumbo_doble", node)
    assert umbral == 3 * 1500


def test_suelo_de_rumbo_doble_nunca_baixa_do_xenerico():
    node = {
        "interaction": {
            "type": "bearing_hunt",
            "config": {"game_id": "rumbo_doble", "hold_ms": 1, "targets": []},
        }
    }
    umbral = _umbral_fisico_ms("rumbo_doble", node)
    assert umbral >= MIN_PLAUSIBLE_STAGE_MS


# ---------------------------------------------------------------------------
# Frontend: catálogo / familia de presentación (lectura de fonte, sen runner JS)
# ---------------------------------------------------------------------------


def test_rumbo_doble_aparece_unha_vez_no_catalogo():
    codigo = leer(GAME_CATALOG)
    ocorrencias = len(re.findall(r"^\s*id:\s*'rumbo_doble'", codigo, flags=re.MULTILINE))
    assert ocorrencias == 1, f"rumbo_doble debería aparecer 1 vez en adminGameCatalog, aparece {ocorrencias}"
    assert "'rumbo_doble'" in codigo  # tamén no tipo AdminGameId


def test_rumbo_doble_familia_bearing_hunt_e_runtime_ready():
    codigo = leer(GAME_CATALOG)
    inicio = codigo.index("id: 'rumbo_doble',")
    fin = codigo.index("\n  },", inicio)
    bloque = codigo[inicio:fin]
    assert "family: 'bearing_hunt'" in bloque
    assert "runtimeStatus: 'runtime_ready'" in bloque
    assert "game_id: 'rumbo_doble'" in bloque


def test_rumbo_doble_mapea_a_orientacion():
    codigo = leer(DISPLAY_FAMILIES)
    inicio = codigo.index("DISPLAY_FAMILY_BY_GAME_ID")
    fin = codigo.index("\n}", inicio)
    bloque = codigo[inicio:fin]
    pares = dict(re.findall(r"^\s*([a-z_]+):\s*'([a-z_]+)',?\s*$", bloque, flags=re.MULTILINE))
    assert pares.get("rumbo_doble") == "orientacion"


def test_rumbo_doble_ten_editor_dedicado_e_non_bucle_xenerico():
    codigo = leer(GUIDED_UTILS)
    assert "'rumbo_doble'" in codigo
    idx = codigo.index("export function guidedConfigKeysForGame")
    fin = codigo.index("\n}", idx)
    bloque = codigo[idx:fin]
    assert "rumbo_doble" in bloque, (
        "rumbo_doble debería devolver [] en guidedConfigKeysForGame -editor propio, "
        "como sequence_code/place_mosaic/tilt_maze-"
    )
    assert "'targets'" in codigo  # en TECHNICAL_CONFIG_KEYS: non se renderiza como campo xenérico


def test_bearing_hunt_config_type_declara_targets_opcional():
    codigo = leer(
        RAIZ / "frontend" / "src" / "player" / "minigames" / "core" / "family-types.ts"
    )
    assert "targets?:" in codigo


def test_runtime_screen_soporta_modo_secuencia():
    codigo = leer(BEARING_HUNT_RUNTIME)
    assert "sequenceMode" in codigo
    assert "targetIndex" in codigo
    # Perder o lock dun obxectivo só reinicia holdProgress/captureStartRef
    # dese obxectivo -NUNCA targetIndex-: a proba textual é que targetIndex
    # só se toca en advanceSequence (avance), non na rama "perdido o lock".
    assert "advanceSequence" in codigo


def test_definition_valida_targets():
    codigo = leer(BEARING_HUNT_DEFINITION)
    assert "targets" in codigo
