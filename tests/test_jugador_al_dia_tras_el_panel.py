# -*- coding: utf-8 -*-
"""24/11: lo que el organizador hace sobre un jugador desde el panel llega a su móvil en segundos.

Cada acción sube la revisión del jugador (runtime/cambios_del_jugador.py), que viaja en el latido (`rev`) y en la
escucha larga `GET /api/jugador/cambios`: 200 `{rev}` en cuanto cambia, 204 si no pasa nada o llega su latido.
"""
import os
import tempfile
import threading
import time

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-al-dia-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import cambios_del_jugador as cambios  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
LATIDO = {"user": USUARIO, "gps_status": "unavailable"}


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data=None: True)
    monkeypatch.setattr(cambios, "INTERVALO_MINIMO_S", 0.0)
    cambios.olvidar_todo()
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    cliente = TestClient(main.app)
    # La sesión firmada del jugador: la emite la entrada a su partida.
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _rev(cliente):
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    r = cliente.post("/api/heartbeat", json=LATIDO)
    assert r.status_code == 200, r.text
    return r.json()["rev"]


def _escuchar(cliente, desde):
    return cliente.get("/api/jugador/cambios", params={"user": USUARIO, "desde": desde})


@pytest.mark.parametrize(
    "ruta, cuerpo",
    [
        ("/api/admin/jugador/tiempo", {"profile_id": USUARIO, "segundos": 60}),
        ("/api/admin/profile-action", {"profile_id": USUARIO, "action": "level_next"}),
        ("/api/admin/profile-action", {"profile_id": USUARIO, "action": "level_prev"}),
        ("/api/admin/profile-action", {"profile_id": USUARIO, "action": "give_item:cuerda"}),
        ("/api/admin/profile-action", {"profile_id": USUARIO, "action": "mark_finished"}),
        ("/api/admin/player/restore-node", {"user": USUARIO}),
        ("/api/reset", {"user": USUARIO}),
    ],
)
def test_cada_accion_del_panel_sube_la_revision(sitio, ruta, cuerpo):
    main.set_player_progress_level(USUARIO, 2)
    antes = _rev(sitio)

    assert sitio.post(ruta, json=cuerpo).status_code == 200

    despues = _rev(sitio)
    assert despues != antes
    # Quien escuchaba con la revisión vieja se entera al momento, sin esperar.
    r = _escuchar(sitio, antes)
    assert r.status_code == 200 and r.json() == {"rev": despues}


def test_editar_la_ficha_sube_solo_la_del_jugador_tocado(sitio, monkeypatch):
    perfiles = [{"id": USUARIO, "display_name": USUARIO}, {"id": "PLAYER 2", "display_name": "PLAYER 2"}]
    guardado = {"player_profiles": perfiles}
    con_rutas = main.load_config
    monkeypatch.setattr(main, "load_config", lambda: {**con_rutas(), **guardado})
    monkeypatch.setattr(main, "save_config", lambda cfg: guardado.update(player_profiles=cfg["player_profiles"]))
    # Un primer guardado deja las fichas como las guarda el panel (normalizadas).
    assert sitio.post("/api/admin/save-config", json={"config": {"player_profiles": perfiles}}).status_code == 200
    yo, otro = cambios.rev(USUARIO), cambios.rev("PLAYER 2")

    nuevos = [{**perfiles[0], "display_name": "Capitana"}, perfiles[1]]
    r = sitio.post("/api/admin/save-config", json={"config": {"player_profiles": nuevos}})

    assert r.status_code == 200, r.text
    assert cambios.rev(USUARIO) != yo
    assert cambios.rev("PLAYER 2") == otro


def test_un_reintento_con_el_mismo_op_id_ni_suma_dos_veces_ni_sube_la_revision(sitio):
    cuerpo = {"profile_id": USUARIO, "segundos": 60, "op_id": "op-al-dia-0001"}
    primero = sitio.post("/api/admin/jugador/tiempo", json=cuerpo).json()
    rev = cambios.rev(USUARIO)

    segundo = sitio.post("/api/admin/jugador/tiempo", json=cuerpo).json()

    assert segundo.get("repetida") is True
    assert segundo["total_time_ms"] == primero["total_time_ms"]
    assert cambios.rev(USUARIO) == rev


def test_la_escucha_contesta_en_cuanto_el_panel_actua(sitio):
    rev = _rev(sitio)
    salida = {}

    def escuchar():
        inicio = time.monotonic()
        r = _escuchar(sitio, rev)
        salida.update(codigo=r.status_code, cuerpo=r.json(), s=time.monotonic() - inicio)

    hilo = threading.Thread(target=escuchar)
    hilo.start()
    time.sleep(0.5)
    assert sitio.post("/api/admin/jugador/tiempo", json={"profile_id": USUARIO, "segundos": 30}).status_code == 200
    hilo.join(10)

    assert salida["codigo"] == 200 and salida["cuerpo"]["rev"] != rev
    assert salida["s"] < 3


def test_sin_cambios_la_suelta_su_latido_con_un_204_sin_cuerpo(sitio):
    rev = _rev(sitio)
    salida = {}

    def escuchar():
        r = _escuchar(sitio, rev)
        salida.update(codigo=r.status_code, bytes=len(r.content))

    hilo = threading.Thread(target=escuchar)
    hilo.start()
    time.sleep(0.5)
    _rev(sitio)  # el latido
    hilo.join(10)

    assert salida == {"codigo": 204, "bytes": 0}


def test_se_agota_con_204(sitio, monkeypatch):
    monkeypatch.setattr(cambios, "ESPERA_MAXIMA_S", 0.3)
    r = _escuchar(sitio, _rev(sitio))
    assert r.status_code == 204 and not r.content
    assert "set-cookie" not in r.headers, "la cookie de misión la renueva el latido, no cada vuelta de la escucha"


def test_otra_epoca_otra_pi_o_un_reinicio_contesta_al_momento(sitio):
    r = _escuchar(sitio, "otra-pi.7")
    assert r.status_code == 200 and r.json()["rev"].startswith(cambios.EPOCA + ".")


def test_sin_sesion_del_jugador_no_escucha(sitio):
    ajeno = TestClient(main.app)
    assert _escuchar(ajeno, "x").status_code == 403


def test_jugador_desconocido_no_escucha(sitio, monkeypatch):
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    assert sitio.get("/api/jugador/cambios", params={"user": "NADIE", "desde": "x"}).status_code == 404


def test_con_la_clave_de_mision_sin_desbloquear_no_escucha(sitio, monkeypatch):
    monkeypatch.setattr(main, "mission_gate_enabled", lambda: True)
    monkeypatch.setattr(main, "mission_unlocked", lambda request: False)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data=None: False)
    assert _escuchar(sitio, "x").status_code == 401


def test_escuchas_demasiado_seguidas_dan_429(sitio, monkeypatch):
    monkeypatch.setattr(cambios, "INTERVALO_MINIMO_S", 30.0)
    assert _escuchar(sitio, "otra-pi.1").status_code == 200
    r = _escuchar(sitio, "otra-pi.1")
    assert r.status_code == 429 and int(r.headers["retry-after"]) >= 1


def test_una_escucha_nueva_suelta_la_anterior(sitio):
    """Dos pestañas o un reintento no apilan esperas: queda una por jugador."""
    rev = _rev(sitio)
    salida = {}

    def escuchar():
        salida["codigo"] = _escuchar(sitio, rev).status_code

    hilo = threading.Thread(target=escuchar)
    hilo.start()
    time.sleep(0.5)
    segunda = threading.Thread(target=lambda: _escuchar(sitio, rev))
    segunda.start()
    hilo.join(10)
    assert salida["codigo"] == 204
    cambios.soltar(USUARIO)
    segunda.join(10)
    assert len(cambios._esperas) == 0


def test_el_chip_del_organizador_no_repinta_sin_fin():
    """Medido en Chromium el 24/11: con un objeto nuevo en cada pintada, `useValorCongelado` hacía setState en cada
    render y la app entera se caía al primer aviso (sin latidos después). Tiene que ser una constante."""
    from pathlib import Path

    chip = (Path(__file__).resolve().parents[1] / "frontend/src/player/components/ChipDeCobertura.tsx").read_text("utf-8")
    assert "ajuste ? AJUSTE_DEL_PANEL : null" in chip
    assert "const AJUSTE_DEL_PANEL: EstadoDeCobertura = { tipo: 'ajuste_panel', n: 0 }" in chip


def test_la_escucha_del_movil_y_el_freno_del_chip():
    """La lógica del móvil (offline/cambiosDelPanel.ts), en node: ver tests/js/cambios_del_panel.cjs."""
    import json
    import shutil
    import subprocess
    from pathlib import Path

    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    guion = Path(__file__).resolve().parent / "js" / "cambios_del_panel.cjs"
    r = subprocess.run([node, str(guion)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert r.returncode == 0, r.stderr
    j = json.loads(r.stdout)
    assert j["sinLatidoNoEscucha"] == 0, "sin un latido no se sabe desde qué revisión escuchar"
    assert j["primerLatido"]["cambios"][0] == ["a.1", "escucha"], "el primer latido apunta la revisión sin avisar"
    assert j["primerLatido"]["pedidas"] == ["a.0", "a.0", "a.0", "a.1"], "tras un 204 se renueva; tras un cambio, con la nueva"
    assert j["mismaRevisionNoDobla"] == {"cambios": 1, "pedidas": 4}, "un latido con la misma revisión no abre otra escucha"
    assert j["cambioPorLatido"] == ["b.0", "latido"]
    assert j["sinRedSePara"] == 1 and j["rearmadaPorLatido"] == 2, "sin red no reintenta sola: la rearma el latido"
    assert j["ocultaNoEscucha"] == 0
    assert j["tras429Sigue"] == [["a.1", "escucha"]]
    assert j["pararCorta"] == 1
    assert all(j["huellas"].values())
    assert j["avisar"] == {"sinCambioVisible": False, "conCambio": True, "frenado": False, "trasElFreno": True}
