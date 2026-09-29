# -*- coding: utf-8 -*-
"""El registro único de minijuegos (shared/game_registry.json) y TODAS las
capas que derivan de él.

Antes, añadir un juego tocaba 12-16 ficheros con una lista escrita a mano
cada uno, y las pruebas sólo comprobaban por subcadena de código fuente que
«el juego aparece en la lista X». Aquí una sola prueba parametrizada recorre
el registro y comprueba el COMPORTAMIENTO en cada capa:

* registro: forma, ids únicos, referencias válidas;
* servidor: familia de presentación, alias de tipo, tipos soportados,
  normalizador, suelo del antitrampas, `kind` del nodo;
* admin (frontend): catálogo, familia de presentación, editor propio,
  claves guiadas y, sobre todo, lo que se GUARDA (`normalizeAdminConfigForFamily`):
  ninguna clave del juego se pierde en silencio.

El frontend se ejecuta con tests/js/registro_frontend.cjs (transpila los TS
con el `typescript` de frontend/node_modules); si no hay Node o no están
instaladas las dependencias, esas pruebas se saltan, no fallan.
"""
import copy
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from backend.app.routers.admin import (
    DISPLAY_FAMILIES,
    GAME_ID_DISPLAY_FAMILY,
    TYPE_DISPLAY_FAMILY_FALLBACK,
    display_family_for_stage,
)
from backend.app.runtime import game_registry
from backend.app.runtime.anti_cheat import MINIGAME_HARD_FLOOR_MS_BY_GAME
from backend.app.runtime.core_engine import normalize_stage
from backend.app.runtime.minigames import (
    MINIGAME_SPECS,
    SUPPORTED_MINIGAME_TYPES,
    normalize_minigame_config,
)
from backend.app.runtime.mision import kind_del_nodo

RAIZ = Path(__file__).resolve().parent.parent
REGISTRO_JSON = RAIZ / "shared" / "game_registry.json"
REGISTRO = json.loads(REGISTRO_JSON.read_text(encoding="utf-8"))
JUEGOS = REGISTRO["games"]
JUEGOS_CON_FICHA = [g for g in JUEGOS if g.get("catalog", True) is not False]
IDS_FAMILIAS = [f["id"] for f in REGISTRO["families"]]
IDS_PRESENTACION = [f["id"] for f in REGISTRO["display_families"]]

RUNTIME_STATUS = {"runtime_ready", "runtime_partial", "preset_only", "planned"}
OFFLINE_STATUS = {"offline_ready", "offline_partial", "offline_planned"}
COMPLETION = {
    "proximity", "hold", "bearing", "puzzle", "manual_code", "sequence",
    "qr_complete", "photo", "inventory_only", "team", "motion", "quiz",
}
# Los ids que existían antes del registro: ninguno puede desaparecer ni
# cambiar de familia (hay una misión real en marcha con nodos guardados así).
IDS_HISTORICOS = {
    "simple_checkpoint": ("signal_hunt", "llegar_y_escanear"),
    "logic_circuit": ("circuit_matrix", "puzles"),
    "sequence_code": ("circuit_matrix", "puzles"),
    "place_mosaic": ("circuit_matrix", "puzles"),
    "tilt_maze": ("circuit_matrix", "movimiento"),
    "spark_radar": ("circuit_matrix", "movimiento"),
    "qr_collectible": ("signal_hunt", "llegar_y_escanear"),
    "qr_key_gate": ("signal_hunt", "llegar_y_escanear"),
    "clue_card": ("signal_hunt", "llegar_y_escanear"),
    "mapa_mudo": ("signal_hunt", "llegar_y_escanear"),
    "cuenta_senales": ("signal_hunt", "llegar_y_escanear"),
    "photo_scout": ("signal_hunt", "llegar_y_escanear"),
    "team_relay": ("signal_hunt", "llegar_y_escanear"),
    "manual_password": ("circuit_matrix", "puzles"),
    "bonus_cache": ("signal_hunt", "llegar_y_escanear"),
    "audio_challenge": ("audio_challenge", "sonido"),
    "shake_charge": ("motion_challenge", "movimiento"),
    "pulso_hierro": ("motion_challenge", "desafio"),
    "bearing_hunt": ("bearing_hunt", "orientacion"),
    "rumbo_doble": ("bearing_hunt", "orientacion"),
    "trampa_palabras": ("word_trap", "desafio"),
    "shake_antenna_charge": ("circuit_matrix", "puzles"),
}

# Los normalizadores copian tal cual estos campos: no sirven para probar
# «resto de otro juego».
_CAMPOS_GENERICOS = {"is_map_collectible", "game_id", "game_title", "completion_method", "objective"}


# ---------------------------------------------------------------------------
# Frontend: se ejecuta una sola vez y se comparte
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def frontend():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node para ejecutar los módulos TS del admin")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    res = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "registro_frontend.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=120, cwd=str(RAIZ),
    )
    assert res.returncode == 0, res.stderr[-2000:]
    return json.loads(res.stdout)


# ---------------------------------------------------------------------------
# El propio registro
# ---------------------------------------------------------------------------


def test_los_ids_historicos_siguen_con_su_familia():
    """Misión real en marcha: ningún id se pierde ni cambia de familia."""
    por_id = {g["id"]: g for g in JUEGOS}
    for game_id, (tecnica, presentacion) in IDS_HISTORICOS.items():
        assert game_id in por_id, f"{game_id} desapareció del registro"
        assert por_id[game_id]["family"] == tecnica, game_id
        assert por_id[game_id]["display_family"] == presentacion, game_id


def test_ids_unicos_y_familias_de_presentacion_con_tarjeta():
    ids = [g["id"] for g in JUEGOS]
    assert len(ids) == len(set(ids)), "ids duplicados en el registro"
    assert len(IDS_PRESENTACION) == len(set(IDS_PRESENTACION))
    assert len(IDS_FAMILIAS) == len(set(IDS_FAMILIAS))
    assert set(REGISTRO["family_card_order"]) == set(IDS_FAMILIAS)
    # Toda familia de presentación tiene al menos un juego con ficha.
    for familia in IDS_PRESENTACION:
        assert any(g["display_family"] == familia for g in JUEGOS_CON_FICHA), familia


def test_tipos_soportados_incluyen_todas_las_familias_y_los_alias_apuntan_a_una_familia():
    assert set(IDS_FAMILIAS) <= set(REGISTRO["supported_types"])
    for tipo, destino in REGISTRO["type_aliases"].items():
        assert destino["type"] in IDS_FAMILIAS, tipo
        assert destino["game_id"] in {g["id"] for g in JUEGOS}, tipo
    for tipo in REGISTRO["legacy_type_display_fallback"]:
        assert tipo in REGISTRO["supported_types"]


@pytest.mark.parametrize("juego", JUEGOS, ids=lambda g: g["id"])
def test_forma_de_cada_entrada_del_registro(juego):
    assert juego["family"] in IDS_FAMILIAS
    assert juego["display_family"] in IDS_PRESENTACION
    if juego.get("catalog", True) is False:
        return
    assert juego["category"] in REGISTRO["category_order"]
    assert juego["runtime_status"] in RUNTIME_STATUS
    assert juego["offline_status"] in OFFLINE_STATUS
    assert juego["completion_method"] in COMPLETION
    for campo in ("title", "icon", "difficulty", "duration", "offline_note", "summary",
                  "player_goal", "editor_hint", "content"):
        assert isinstance(juego.get(campo), str) and juego[campo].strip(), f"{juego['id']}.{campo}"
    assert set(juego["messages"]) == {"hint", "gps_unavailable", "locked"}
    assert isinstance(juego["default_config"], dict)
    # `default_config` describe al juego a la vez que el guardado: ninguna
    # clave que el admin escribe por defecto puede faltar en config_keys.
    if juego["default_config"].get("game_id") is not None:
        assert juego["default_config"]["game_id"] == juego["id"]
    faltan = set(juego["default_config"]) - set(juego["config_keys"])
    assert not faltan, f"{juego['id']}: claves de default_config sin declarar en config_keys: {sorted(faltan)}"
    assert {"game_id"} <= set(juego["config_keys"])


@pytest.mark.parametrize("juego", JUEGOS_CON_FICHA, ids=lambda g: g["id"])
def test_hard_floor_declarado_existe_como_estrategia(juego):
    estrategia = juego.get("hard_floor")
    if estrategia is None:
        assert juego["id"] not in MINIGAME_HARD_FLOOR_MS_BY_GAME
    else:
        assert juego["id"] in MINIGAME_HARD_FLOOR_MS_BY_GAME


def test_solo_hay_suelos_para_juegos_del_registro():
    assert set(MINIGAME_HARD_FLOOR_MS_BY_GAME) <= {g["id"] for g in JUEGOS}


def test_los_juegos_no_listos_no_se_ofrecen_como_nuevos():
    """spark_radar/team_relay no están cableados de punta a punta y
    manual_password/photo_scout son «planned»: no deben ser runtime_ready."""
    por_id = {g["id"]: g for g in JUEGOS}
    for game_id in ("spark_radar", "team_relay"):
        assert por_id[game_id]["runtime_status"] != "runtime_ready", game_id
    for game_id in ("manual_password", "photo_scout"):
        assert por_id[game_id]["runtime_status"] == "planned", game_id


# ---------------------------------------------------------------------------
# Servidor
# ---------------------------------------------------------------------------


def test_servidor_carga_el_mismo_registro():
    assert game_registry.REGISTRY == REGISTRO
    assert [f["id"] for f in DISPLAY_FAMILIES] == IDS_PRESENTACION
    assert set(SUPPORTED_MINIGAME_TYPES) == set(REGISTRO["supported_types"])
    assert set(MINIGAME_SPECS) == set(IDS_FAMILIAS)
    assert set(TYPE_DISPLAY_FAMILY_FALLBACK) >= set(IDS_FAMILIAS)


@pytest.mark.parametrize("juego", JUEGOS, ids=lambda g: g["id"])
def test_servidor_familia_de_presentacion_por_juego(juego):
    assert GAME_ID_DISPLAY_FAMILY[juego["id"]] == juego["display_family"]
    assert display_family_for_stage(juego["family"], juego["id"]) == juego["display_family"]
    # game_id con mayúsculas/espacios (nodos escritos a mano) tampoco cambia.
    assert display_family_for_stage(juego["family"], f" {juego['id'].upper()} ") == juego["display_family"]


@pytest.mark.parametrize("familia", IDS_FAMILIAS)
def test_servidor_nodo_viejo_sin_game_id_cae_por_su_familia_tecnica(familia):
    esperado = next(f["display_fallback"] for f in REGISTRO["families"] if f["id"] == familia)
    assert display_family_for_stage(familia, None) == esperado


@pytest.mark.parametrize("juego", JUEGOS_CON_FICHA, ids=lambda g: g["id"])
def test_servidor_normaliza_la_config_por_defecto_sin_perder_el_juego(juego):
    config = copy.deepcopy(juego["default_config"])
    config["game_id"] = juego["id"]
    normalizada = normalize_minigame_config(juego["family"], config)
    assert normalizada["game_id"] == juego["id"]
    json.dumps(normalizada)  # serializable: es lo que se guarda y se manda al móvil
    # Idempotente: normalizar lo ya normalizado no lo cambia.
    assert normalize_minigame_config(juego["family"], copy.deepcopy(normalizada)) == normalizada


@pytest.mark.parametrize("juego", JUEGOS_CON_FICHA, ids=lambda g: g["id"])
def test_servidor_normalize_stage_conserva_familia_y_juego(juego):
    nodo = normalize_stage({
        "id": 1, "type": juego["family"], "title": "x", "lat": 1.0, "lon": 2.0, "radius": 30,
        "config": copy.deepcopy(juego["default_config"]),
    })
    assert nodo["interaction"]["type"] == juego["family"]
    assert nodo["interaction"]["config"]["game_id"] == juego["id"]


@pytest.mark.parametrize("tipo,destino", sorted(REGISTRO["type_aliases"].items()))
def test_servidor_alias_de_tipo_viejo(tipo, destino):
    nodo = normalize_stage({"id": 1, "type": tipo, "title": "x", "lat": 1.0, "lon": 2.0, "radius": 30})
    assert nodo["interaction"]["type"] == destino["type"]
    assert nodo["interaction"]["config"]["game_id"] == destino["game_id"]
    # Con game_id propio, el alias no lo pisa.
    nodo = normalize_stage({"id": 1, "type": tipo, "title": "x", "lat": 1.0, "lon": 2.0, "radius": 30,
                            "config": {"game_id": "rumbo_doble"}})
    assert nodo["interaction"]["type"] == destino["type"]


@pytest.mark.parametrize("juego", JUEGOS_CON_FICHA, ids=lambda g: g["id"])
def test_kind_del_nodo_coincide_con_el_registro(juego):
    nodo = {"type": juego["family"], "config": {"game_id": juego["id"]}}
    assert kind_del_nodo(nodo) == juego["node_kind"]


# ---------------------------------------------------------------------------
# Admin (frontend), ejecutado de verdad
# ---------------------------------------------------------------------------


def test_admin_tarjetas_y_orden_salen_del_registro(frontend):
    assert [t["id"] for t in frontend["tarjetas"]] == IDS_PRESENTACION
    assert [t["id"] for t in frontend["tarjetasFamilia"]] == REGISTRO["family_card_order"]
    assert frontend["ordenCatalogo"] == [g["id"] for g in JUEGOS_CON_FICHA]
    assert set(frontend["qrPorTipo"].values()) == {"qr_collectible", "qr_key_gate", "clue_card", "bonus_cache"}


@pytest.mark.parametrize("juego", JUEGOS, ids=lambda g: g["id"])
def test_admin_catalogo_y_familia_de_presentacion(frontend, juego):
    item = frontend["juegos"][juego["id"]]
    assert item["familiaPresentacion"] == juego["display_family"]
    # Servidor y admin: la MISMA familia (antes discrepaban con pulso_hierro).
    assert item["familiaPresentacion"] == GAME_ID_DISPLAY_FAMILY[juego["id"]]
    if juego.get("catalog", True) is False:
        assert item["ficha"] is None
        return
    ficha = item["ficha"]
    assert ficha["family"] == juego["family"]
    assert ficha["category"] == juego["category"]
    assert ficha["runtimeStatus"] == juego["runtime_status"]
    assert ficha["offlineStatus"] == juego["offline_status"]
    assert ficha["completionMethod"] == juego["completion_method"]
    assert ficha["config"] == juego["default_config"]
    assert item["editorPropio"] == bool(juego.get("custom_editor"))
    if juego.get("hide_guided_keys"):
        assert item["clavesGuiadas"] == []


@pytest.mark.parametrize("juego", JUEGOS_CON_FICHA, ids=lambda g: g["id"])
def test_admin_guardar_no_pierde_ninguna_clave_del_juego(frontend, juego):
    """LA prueba del bug que se repitió tres veces: al guardar, el admin
    tiraba en silencio los campos de un juego nuevo. Ahora, todo lo que trae
    el juego por defecto sobrevive al guardado (salvo lo que el normalizador
    de su familia reescribe a propósito, que sigue presente)."""
    item = frontend["juegos"][juego["id"]]
    guardado = item["guardado"]
    perdidas = [k for k in juego["default_config"] if k not in guardado]
    assert not perdidas, f"{juego['id']}: el guardado del admin pierde {perdidas}"
    assert guardado["game_id"] == juego["id"]
    # Estable: guardar lo ya guardado no cambia nada.
    assert item["guardadoDeNuevo"] == guardado


@pytest.mark.parametrize("juego", JUEGOS_CON_FICHA, ids=lambda g: g["id"])
def test_admin_conserva_claves_desconocidas_por_defecto(frontend, juego):
    """Una clave que ningún juego declara (p. ej. la de un juego futuro) se
    CONSERVA al guardar; antes se tiraba en silencio."""
    item = frontend["juegos"][juego["id"]]
    assert item["guardadoConDesconocida"].get("clave_de_futuro_xyz") == 7


@pytest.mark.parametrize("juego", JUEGOS_CON_FICHA, ids=lambda g: g["id"])
def test_admin_descarta_restos_de_otro_juego_de_la_misma_familia(frontend, juego):
    item = frontend["juegos"][juego["id"]]
    ajena = item.get("claveAjena")
    if not ajena:
        pytest.skip("ningún otro juego de su familia declara claves propias")
    assert ajena not in item["guardadoConAjena"], (
        f"{juego['id']}: {ajena!r} es de otro juego de la familia y no debería guardarse"
    )


def test_admin_config_de_juegos_con_editor_de_listas_sobrevive_completa(frontend):
    """Los tres juegos cuyo guardado se perdió: la config escrita por el
    organizador (listas incluidas) llega entera al servidor."""
    for game_id, claves in {
        "rumbo_doble": ["targets", "tolerance_deg", "hold_ms"],
        "cuenta_senales": ["questions"],
        "trampa_palabras": ["questions", "n_rounds", "time_limit_s"],
        "pulso_hierro": ["pulso_start_length", "pulso_target_rounds", "pulso_pad_count"],
        "mapa_mudo": ["clue_text", "search_radius_m", "hot_cold_hint"],
        "team_relay": ["required_members"],
        "spark_radar": ["target_hits", "time_limit_s", "spawn_interval_ms"],
    }.items():
        guardado = frontend["juegos"][game_id]["guardado"]
        for clave in claves:
            assert clave in guardado, f"{game_id}: se pierde {clave}"


def test_admin_juegos_con_editor_propio_estan_cableados_en_admingameeditor():
    """Único punto de fuente que se lee como texto: el cableado JSX de los
    editores (un componente por juego) vive en AdminGameEditor.tsx."""
    codigo = (RAIZ / "frontend" / "src" / "admin" / "components" / "AdminGameEditor.tsx").read_text(encoding="utf-8")
    bloque = codigo[codigo.index("CUSTOM_EDITOR_COMPONENTS"):]
    bloque = bloque[: bloque.index("}\n")]
    cableados = set(re.findall(r"^\s*([a-z_]+):", bloque, flags=re.MULTILINE))
    for juego in JUEGOS_CON_FICHA:
        if juego.get("custom_editor"):
            assert juego["id"] in cableados, f"{juego['id']} declara custom_editor pero no hay componente"
