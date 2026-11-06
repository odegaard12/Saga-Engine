# -*- coding: utf-8 -*-
"""7/11 (Óscar, «haz todo esto»): fuera lo que sobra, un nombre y una regla por juego, textos sin repetir.

La ruta de producción usa simple_checkpoint, qr_collectible, tilt_maze, spark_radar, logic_circuit y place_mosaic:
ninguno de esos ids cambia ni deja de abrirse.
"""
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
F = RAIZ / "frontend"
J = F / "src" / "player"
REG = json.loads((RAIZ / "shared" / "game_registry.json").read_text(encoding="utf-8"))
JUEGOS = {g["id"]: g for g in REG["games"]}


def leer(p):
    return (F / p).read_text(encoding="utf-8")


def test_los_ids_de_produccion_siguen_en_el_registro():
    for gid in ("simple_checkpoint", "qr_collectible", "tilt_maze", "spark_radar", "logic_circuit", "place_mosaic"):
        assert gid in JUEGOS and not JUEGOS[gid].get("retired_for"), gid


def test_el_reto_de_movimiento_solo_es_dinamo_y_un_nodo_viejo_cae_en_el():
    motion = leer("src/player/minigames/families/motionChallenge/RuntimeScreen.tsx")
    assert "return <DinamoRuntimeScreen {...props} />" in motion and len(motion.splitlines()) < 60
    definicion = leer("src/player/minigames/families/motionChallenge/definition.ts")
    assert "objective: 'shake_charge'," in definicion and "merged.objective === 'figure_eight'" not in definicion


def test_fuera_las_fichas_planned_y_el_id_legacy_con_su_desvio():
    for gid in ("photo_scout", "manual_password", "shake_antenna_charge"):
        assert gid not in JUEGOS, gid
    puente = leer("src/player/minigames/core/runtime-bridge.ts")
    assert "if (gameId === 'shake_antenna_charge')" in puente and "game_id: 'logic_circuit'" in puente


def test_audio_y_relevo_fuera_del_panel_pero_vivos_en_nodos_viejos():
    assert JUEGOS["audio_challenge"]["retired_for"] and JUEGOS["team_relay"]["retired_for"] == "simple_checkpoint"
    host = leer("src/player/minigames/core/FamilyRuntimeHost.tsx")
    assert "AudioChallengeRuntime" in host and "TeamRelayRuntimeScreen" in host


def test_sin_react_query():
    assert "@tanstack/react-query" not in leer("package.json")
    assert "QueryClient" not in leer("src/main.tsx")


def test_sin_textos_de_simon():
    textos = leer("src/player/minigames/core/textos.ts")
    assert "\n  simon: {" not in textos and textos.count("coloresDePulso:") == 3
    assert "textos.coloresDePulso" in leer("src/player/minigames/families/motionChallenge/PulsoHierroRuntimeScreen.tsx")


def test_un_nombre_y_una_regla_por_juego_y_la_guia_los_lee():
    textos = leer("src/player/minigames/core/textos.ts")
    guia = leer("src/player/guia/guia.ts")
    assert "export const JUEGOS_EN_UNA_LINEA" in textos and "const JUEGOS = JUEGOS_EN_UNA_LINEA" in guia
    assert "\nconst JUEGOS: Record" not in guia
    assert "separados medio segundo" not in textos + guia
    assert "(lento, rápido, lento)" in textos.split("export const JUEGOS_EN_UNA_LINEA")[1]
    # Nombres del catálogo, iguales en la Guía y en la pantalla del juego.
    for gid, nombre in (("spark_radar", "Chispas"), ("shake_charge", "Dinamo"), ("rumbo_doble", "Faros"),
                        ("qr_collectible", "Pegatina QR"), ("simple_checkpoint", "Punto de control")):
        assert JUEGOS[gid]["title"] == nombre, gid
        assert f"'{nombre}'" in textos, nombre
    assert "Cargar antena" not in textos and "Caza-Señales" not in textos


def test_textos_sin_repetir():
    assert "lg-pie" not in leer("src/player/minigames/families/logica/MastermindRuntimeScreen.tsx")
    guia = leer("src/player/guia/guia.ts")
    assert "notas.push(t[1](n.estrellas))" not in guia and "¿Atascado? El código" not in guia
    assert "Has recorrido" not in leer("src/player/components/textosDePantallas.ts")
    assert "notas={[]}" in leer("src/player/guia/FichaDelJuego.tsx")
    hud = leer("src/player/components/PlayerHud.tsx")
    assert "t('player.backpack.button', locale)" in hud and "'Ferramentas'" not in hud and "'Mochila'}" not in hud
    assert leer("src/i18n/index.ts").count("backpack: { button:") == 3


def test_la_guia_sin_pestanas_de_mochila_y_el_personaje_en_la_tienda():
    hud = leer("src/player/components/PlayerHud.tsx")
    assert "const esGuia = backpackTab === 'requirements'" in hud and "onClick={abrirMochila}" in hud
    assert "'Abrir la tienda'" in hud and "'Cambiar de personaje'" not in hud


def test_las_pegatinas_qr_son_una_ficha_con_tipo_y_conservan_sus_ids():
    for gid in ("qr_key_gate", "clue_card", "bonus_cache"):
        assert JUEGOS[gid]["variant_of"] == "qr_collectible" and JUEGOS[gid]["title"].startswith("Pegatina QR · ")
    editor = leer("src/admin/components/AdminGameEditor.tsx")
    assert "🏷️ Pegatina QR · tipo" in editor and "applyQr(getAdminGame(event.target.value))" in editor


def test_jszip_fuera_de_la_cache_del_jugador():
    vite = leer("vite.config.ts")
    assert "const soloAlPulsar = /^assets\\/jszip[.-]/" in vite and "!soloAlPulsar.test(f)" in vite
    assert "(await import('jszip')).default" in leer("src/player/PlayerApp.tsx")
