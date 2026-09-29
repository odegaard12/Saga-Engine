# -*- coding: utf-8 -*-
"""Una ruta de seis nodos de clases mezcladas, para las pruebas de la cola sin
cobertura y de la revisión de evidencia. Sólo fixtures en línea: no lee ni
escribe stages.json, *_route.json ni data/*.sqlite3 reales.

Nodos, por índice:
  0 punto de control            (código «OK»)
  1 QR                          (código SAGA_QR_1)
  2 cuenta las señales          (2 preguntas)
  3 trampa de palabras          (banco de 10)
  4 mapa mudo                   (punto real en 40.0, -3.0)
  5 pulso de hierro             (código «OK»)
"""
from pathlib import Path

import main

LAT_MAPA_MUDO = 40.0
LON_MAPA_MUDO = -3.0


def banco_de_trampa(n=10):
    return [
        {
            "question": f"Pregunta trampa {i}",
            "options": ["Casi igual A", "Casi igual B", "Casi igual C", "Casi igual D"],
            "correct_index": i % 4,
            "explanation": f"La buena es la {'ABCD'[i % 4]} porque sí ({i})",
        }
        for i in range(n)
    ]


def ruta_de_seis_nodos():
    base = {"lat": 40.5, "lon": -3.5, "radius": 25}
    return [
        {
            "id": 101,
            "title": "Paso",
            **base,
            "minigame": {"type": "checkpoint", "config": {}},
            "config": {},
        },
        {
            "id": 102,
            "title": "Pegatina",
            **base,
            "qr_payload": "SAGA_QR_1",
            "minigame": {"type": "signal_hunt", "config": {}},
            "config": {},
        },
        {
            "id": 103,
            "title": "Cuenta",
            **base,
            "minigame": {
                "type": "signal_hunt",
                "config": {
                    "game_id": "cuenta_senales",
                    "questions": [
                        {"question": "¿Bancos?", "answer": 3, "tolerance": 0},
                        {"question": "¿Ventanas?", "answer": 5, "tolerance": 1},
                    ],
                },
            },
            "config": {},
        },
        {
            "id": 104,
            "title": "Trampa",
            **base,
            "minigame": {
                "type": "word_trap",
                "config": {
                    "game_id": "trampa_palabras",
                    "n_rounds": 6,
                    "time_limit_s": 12,
                    "questions": banco_de_trampa(),
                },
            },
            "config": {},
        },
        {
            "id": 105,
            "title": "Mapa mudo",
            "lat": LAT_MAPA_MUDO,
            "lon": LON_MAPA_MUDO,
            "radius": 20,
            "minigame": {
                "type": "signal_hunt",
                "config": {"game_id": "mapa_mudo", "objective": "mapa_mudo", "search_radius_m": 250},
            },
            "config": {},
        },
        {
            "id": 106,
            "title": "Pulso",
            **base,
            "minigame": {"type": "motion_challenge", "config": {"game_id": "pulso_hierro"}},
            "config": {},
        },
    ]


def preparar_mision(monkeypatch, tmp_path: Path, launch_at="2020-01-01T00:00", user="PLAYER 1"):
    """La ruta en un directorio temporal y la misión ya en marcha."""
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(tmp_path / "saga.sqlite3"))
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    monkeypatch.setattr(main, "GAME_DB", str(tmp_path / "gamestate.json"))
    monkeypatch.setattr(main, "STAGES_DB", str(tmp_path / "stages.json"))
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(tmp_path / "events.json"))
    monkeypatch.setattr(main, "POSITIONS_DB", str(tmp_path / "positions.json"))
    # La mochila guarda la marca de reinicio (`reset_at`): compartida entre
    # pruebas, un reinicio de otra hacía que estos avances «anteriores al
    # reinicio» se ignorasen.
    monkeypatch.setattr(main, "INVENTORY_DB", str(tmp_path / "inventory.json"))
    monkeypatch.setattr(main, "TIMERS_DB", str(tmp_path / "timers.json"))
    monkeypatch.setattr(main, "ANTI_CHEAT_DB", str(tmp_path / "anti_cheat.json"))
    monkeypatch.setattr(main, "COMPLETION_TIME_SAMPLES_DB", str(tmp_path / "muestras.json"))
    monkeypatch.setattr(main, "SPEED_STREAK_DB", str(tmp_path / "racha.json"))
    monkeypatch.setattr(main, "MATCH_LOG_DB", str(tmp_path / "match_log.sqlite3"))

    main.save_stages(main.STAGES_DB, ruta_de_seis_nodos())
    main.set_player_progress_level(user, 0)

    original = main.load_config
    monkeypatch.setattr(main, "load_config", lambda: {**original(), "mission_launch_at": launch_at})
    main._match_log.reset_rate_state()
    main.clear_player_rate_limits()
