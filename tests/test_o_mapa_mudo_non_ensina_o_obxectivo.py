# -*- coding: utf-8 -*-
"""mapa_mudo (owner-approved, familia "Llegar y escanear") nunca ensina o punto real.

Cubre catro cousas que non poden fallar:
  1. O alias legacy en core_engine.py resolve "mapa_mudo" cara a signal_hunt.
  2. kind_del_nodo devolve o seu propio kind ("mapa_mudo"), non "minijuego"
     -así o antitrampas non lle esixe un tempo mínimo de partida- nin
     "checkpoint" mentres está activo -así o mapa sabe que ten que ocultar
     o marcador-.
  3. project_stage_for_player oculta lat/lon/radius reais mentres non está
     completado, e amosa os reais -kind "checkpoint"- en canto se completa.
  4. fuzzy_search_circle é determinista e o punto real queda SEMPRE dentro
     do círculo devolto; hot_cold_band_es nunca devolve un número.

Non le nin escribe stages.json, *_route.json nin data/*.sqlite3 reais: as
stages desta proba son fixtures en liña.
"""
import math
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-mapa-mudo-"))

from backend.app.runtime.core_engine import normalize_stage  # noqa: E402
from backend.app.runtime.minigames import normalize_minigame_config  # noqa: E402
from backend.app.runtime.mision import (  # noqa: E402
    fuzzy_search_circle,
    hot_cold_band_es,
    kind_del_nodo,
    project_stage_for_player,
)


def _stage_mapa_mudo(lat=42.9, lon=-8.9, radius=20, search_radius_m=250, hot_cold=False):
    return {
        "id": "nodo-mapa-mudo-1",
        "version": 2,
        "enabled": True,
        "presentation": {"title": "Busca la zona", "content": "Contenido del nodo."},
        "location": {"lat": lat, "lon": lon, "radius_m": radius},
        "entry": {
            "mode": "gps",
            "require_proximity": True,
            "allow_debug_bypass": True,
            "allow_manual_fallback_without_gps": False,
        },
        "interaction": {
            "type": "signal_hunt",
            "config": {
                "game_id": "mapa_mudo",
                "objective": "mapa_mudo",
                "search_radius_m": search_radius_m,
                "hot_cold_hint": hot_cold,
                "clue_text": "Busca la fuente vieja.",
            },
        },
        "success": {"conditions": [{"kind": "minigame_ok", "value": "OK"}]},
        "messages": {"hint": "", "gps_unavailable": "", "locked": ""},
        "requirements": {"items": []},
    }


def test_alias_legacy_resolve_mapa_mudo_cara_a_signal_hunt():
    crudo = {"type": "mapa_mudo", "lat": 42.9, "lon": -8.9, "radius": 20}
    node = normalize_stage(crudo)
    assert node["interaction"]["type"] == "signal_hunt"
    assert node["interaction"]["config"]["game_id"] == "mapa_mudo"


def test_kind_do_nodo_e_mapa_mudo_non_minixogo_nin_checkpoint():
    node = _stage_mapa_mudo()
    kind = kind_del_nodo(node)
    assert kind == "mapa_mudo"
    assert kind != "minijuego"
    assert kind != "checkpoint"


def test_project_stage_oculta_o_punto_real_mentres_non_esta_completado():
    node = _stage_mapa_mudo(lat=42.9, lon=-8.9, radius=20, search_radius_m=250)
    proxectado = project_stage_for_player(node, include_runtime=True, completed=False)

    assert proxectado["kind"] == "mapa_mudo"
    assert proxectado["lat"] != node["location"]["lat"]
    assert proxectado["lon"] != node["location"]["lon"]
    assert proxectado["radius"] == 250
    assert proxectado["radius"] != node["location"]["radius_m"]


def test_project_stage_amosa_o_punto_real_en_canto_se_completa():
    node = _stage_mapa_mudo(lat=42.9, lon=-8.9, radius=20, search_radius_m=250)
    proxectado = project_stage_for_player(node, include_runtime=True, completed=True)

    assert proxectado["kind"] == "checkpoint"
    assert proxectado["lat"] == node["location"]["lat"]
    assert proxectado["lon"] == node["location"]["lon"]
    assert proxectado["radius"] == node["location"]["radius_m"]


def test_project_stage_quita_route_via_mentres_o_nodo_esta_oculto():
    node = _stage_mapa_mudo()
    node["route_via"] = [[42.901, -8.901]]
    proxectado = project_stage_for_player(node, include_runtime=True, completed=False)
    assert "route_via" not in proxectado

    proxectado_completado = project_stage_for_player(node, include_runtime=True, completed=True)
    assert proxectado_completado.get("route_via") == [[42.901, -8.901]]


def _distancia_haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def test_fuzzy_search_circle_e_deterministico_e_contem_sempre_o_punto_real():
    casos = [
        ("nodo-1", 42.9034, -8.8963, 250),
        ("nodo-2", 40.4168, -3.7038, 150),
        ("nodo-3", 60.1699, 24.9384, 400),
        ("outro-nodo-distinto", 42.9034, -8.8963, 200),
        ("nodo-radio-pequeno", 0.0, 0.0, 10),
    ]
    for node_id, lat, lon, radio in casos:
        circulo_1 = fuzzy_search_circle(node_id, lat, lon, radio)
        circulo_2 = fuzzy_search_circle(node_id, lat, lon, radio)
        assert circulo_1 == circulo_2  # determinista

        distancia = _distancia_haversine_m(circulo_1["lat"], circulo_1["lon"], lat, lon)
        assert distancia < circulo_1["radius_m"]
        assert circulo_1["radius_m"] >= 150  # nunca por debaixo do chan de seguridade


def test_fuzzy_search_circle_non_pon_o_centro_enriba_do_punto_real():
    circulo = fuzzy_search_circle("nodo-cualquera", 42.9, -8.9, 250)
    distancia = _distancia_haversine_m(circulo["lat"], circulo["lon"], 42.9, -8.9)
    assert distancia > 1.0  # non está pegado ao centro real


def test_hot_cold_band_es_nunca_ten_numeros():
    for distancia in [0, 1, 10, 50, 100, 249, 250, 500, 10000]:
        banda = hot_cold_band_es(distancia, 250)
        assert banda in {"frio", "templado", "caliente"}
        assert not any(caracter.isdigit() for caracter in banda)


def test_normalize_minigame_config_garda_os_campos_de_mapa_mudo():
    config = normalize_minigame_config(
        "signal_hunt",
        {
            "game_id": "mapa_mudo",
            "clue_text": "Busca la fuente vieja.",
            "search_radius_m": 999,
            "hot_cold_hint": True,
        },
    )
    assert config["clue_text"] == "Busca la fuente vieja."
    assert config["search_radius_m"] == 400  # recortado ao tope de 400
    assert config["hot_cold_hint"] is True


def test_normalize_minigame_config_non_engade_campos_de_mapa_mudo_a_outro_game_id():
    config = normalize_minigame_config(
        "signal_hunt",
        {"game_id": "simple_checkpoint", "clue_text": "non debería quedar"},
    )
    assert "clue_text" not in config
