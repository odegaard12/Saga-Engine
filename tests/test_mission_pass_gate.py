# -*- coding: utf-8 -*-
"""La contraseña de misión cierra la entrada de jugadores.

Sin clave guardada el motor público va exactamente como antes. Con ella puesta
(desde el panel), `/api/config` deja de repartir la lista de jugadores y
`/api/game` no entrega sesión hasta acertar la clave en `/api/mission/unlock`.
"""
from fastapi.testclient import TestClient

import main


def _client(monkeypatch, tmp_path):
    # Nunca escribir en el data/ real del repo.
    monkeypatch.setattr(main, "MISSION_AUTH_DB", str(tmp_path / "mission_auth.json"))
    monkeypatch.setattr(main, "MISSION_UNLOCK_ATTEMPTS", {})
    return TestClient(main.app)


def test_sin_clave_todo_sigue_abierto(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    cfg = client.get("/api/config").json()
    assert cfg["mission_pass_required"] is False
    assert cfg["players"]

    name = cfg["players"][0]
    assert client.get(f"/api/game/{name}").status_code == 200

    assert client.post("/api/mission/unlock", json={}).json() == {
        "status": "ok",
        "required": False,
    }


def test_con_clave_cierra_hasta_desbloquear(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    main.set_mission_password("Pelochito13")

    locked = client.get("/api/config").json()
    assert locked["mission_pass_required"] is True
    assert locked["players"] == []
    assert locked["player_profiles"] == []

    assert client.get("/api/game/PLAYER 1").status_code == 403
    assert client.post("/api/mission/unlock", json={"password": "mal"}).status_code == 403

    ok = client.post("/api/mission/unlock", json={"password": "Pelochito13"})
    assert ok.status_code == 200
    assert "saga_mission" in ok.headers.get("set-cookie", "")

    unlocked = client.get("/api/config").json()
    assert unlocked["players"]
    name = unlocked["players"][0]
    assert client.get(f"/api/game/{name}").status_code == 200


def test_cambiar_a_clave_invalida_a_cookie_vella(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    main.set_mission_password("Pelochito13")
    client.post("/api/mission/unlock", json={"password": "Pelochito13"})
    assert client.get("/api/game/PLAYER 1").status_code == 200

    main.set_mission_password("OutraClave99")
    assert client.get("/api/game/PLAYER 1").status_code == 403


def test_quitar_a_clave_reabre(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    main.set_mission_password("Pelochito13")
    assert client.get("/api/game/PLAYER 1").status_code == 403

    assert main.set_mission_password("") is False
    assert main.mission_gate_enabled() is False
    assert client.get("/api/game/PLAYER 1").status_code == 200


def test_o_freo_de_forza_bruta_do_unlock(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    main.set_mission_password("Pelochito13")

    for _ in range(main.MISSION_UNLOCK_MAX_ATTEMPTS):
        assert client.post("/api/mission/unlock", json={"password": "mal"}).status_code == 403

    bloqueado = client.post("/api/mission/unlock", json={"password": "Pelochito13"})
    assert bloqueado.status_code == 429


def test_admin_save_config_edita_a_clave(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "MISSION_AUTH_DB", str(tmp_path / "mission_auth.json"))
    monkeypatch.setattr(main, "MISSION_UNLOCK_ATTEMPTS", {})
    monkeypatch.setattr(main, "admin_request_authorized", lambda *a, **k: True)
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    # No escribir el config.json real del repo: sólo interesa el lado mission_pass.
    monkeypatch.setattr(main, "save_config", lambda *a, **k: None)
    client = TestClient(main.app)

    r = client.post("/api/admin/save-config", json={"config": {"mission_pass": "Pelochito13"}})
    assert r.status_code == 200
    assert r.json()["mission_pass_enabled"] is True
    assert main.mission_gate_enabled() is True

    # Un guardado normal (sin la llave) no la borra.
    r = client.post("/api/admin/save-config", json={"config": {"site_name": "Saga Gia"}})
    assert main.mission_gate_enabled() is True

    # Cadena vacía explícita = quitarla.
    r = client.post("/api/admin/save-config", json={"config": {"mission_pass": ""}})
    assert r.json()["mission_pass_enabled"] is False
    assert main.mission_gate_enabled() is False
