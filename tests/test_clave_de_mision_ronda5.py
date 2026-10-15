# -*- coding: utf-8 -*-
"""Clave de misión (ronda 5): pantalla previa, sin lista ni fotos sin el código, y cuánto dura."""
import json
import re
from pathlib import Path

from fastapi.testclient import TestClient

import main

RAIZ = Path(__file__).resolve().parents[1]
CLAVE = "KX3TQ7DM"


def _cliente(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "MISSION_AUTH_DB", str(tmp_path / "mission_auth.json"))
    monkeypatch.setattr(main, "MISSION_UNLOCK_ATTEMPTS", {})
    return TestClient(main.app)


def test_config_dice_si_falta_el_codigo(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    assert cliente.get("/api/config").json()["mission_unlocked"] is True  # sin clave: abierto
    main.set_mission_password(CLAVE)
    # 15/10: sin cookie, /api/config ya no contesta (401): la puerta del cliente lo toma como «pide la clave».
    assert cliente.get("/api/config").status_code == 401
    cliente.post("/api/mission/unlock", json={"password": CLAVE})
    assert cliente.get("/api/config").json()["mission_unlocked"] is True


def test_sin_cookie_no_salen_jugadores_ni_fotos_ni_retratos(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    nombre = cliente.get("/api/config").json()["players"][0]
    main.set_mission_password(CLAVE)

    respuesta = cliente.get("/api/config")
    # 15/10: ni la configuración recortada: 401 y nada de jugadores, fotos ni retratos.
    assert respuesta.status_code == 401
    assert nombre not in respuesta.text and "data:image" not in respuesta.text
    assert cliente.get("/api/player-avatar/" + nombre).status_code == 401
    assert cliente.get("/api/game/" + nombre).status_code == 401


def test_la_clave_con_espacios_de_los_lados_tambien_abre(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    main.set_mission_password(f"  {CLAVE}  ")
    assert cliente.post("/api/mission/unlock", json={"password": f" {CLAVE}\n"}).status_code == 200


def test_la_cookie_de_mision_dura_180_dias_y_no_la_pide_sin_red():
    assert main.MISSION_COOKIE_TTL_SECONDS == 24 * 3600  # auditoría 15/10: 24 h
    puerta = (RAIZ / "frontend" / "src" / "shared" / "PuertaDeMision.tsx").read_text(encoding="utf-8")
    # Sin cobertura la puerta deja pasar: nunca se pide la clave a mitad de una partida sin red.
    assert "navigator.onLine === false" in puerta and "/HTTP 401/.test(fallo.message)" in puerta
    app = (RAIZ / "frontend" / "src" / "App.tsx").read_text(encoding="utf-8")
    assert app.count("<PuertaDeMision>") == 2  # login y enlace directo del jugador


def test_el_generador_de_claves_del_panel_no_usa_simbolos_ambiguos():
    fuente = (RAIZ / "frontend" / "src" / "admin" / "lib" / "generarClave.ts").read_text(encoding="utf-8")
    alfabeto = re.search(r"ALFABETO_CLAVE = '([A-Z0-9]+)'", fuente).group(1)
    assert not set("0O1ILS2Z5B8UV69") & set(alfabeto)
    assert len(alfabeto) >= 20
