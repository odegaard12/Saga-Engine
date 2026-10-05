# -*- coding: utf-8 -*-
"""Revisión de seguridad del backend (05/10/2026): lo que se arregló, probado
por comportamiento.

- CSRF por Origin/Referer, tope de cuerpo y ritmo por IP (security/peticiones.py);
- HTTPS detrás del túnel: cookies Secure y HSTS;
- bloqueo progresivo del login del panel;
- imágenes: sólo JPEG/PNG/WebP de verdad (firma + Pillow), nunca SVG/HTML;
- T1 «sin conexión» a los 10 min, T2 `is_self` de la sesión;
- códigos de respaldo con hash en el paquete del jugador;
- S1: avance y sincronización en hilos, sin cruzarse dentro de un jugador;
- WAL en la base de desbloqueos.
"""
import base64
import io
import os
import sqlite3
import tempfile
import threading
import time
from types import SimpleNamespace

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-owasp-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import mision  # noqa: E402
from backend.app.security import admin_auth, client_ip, imagenes, peticiones, player_session  # noqa: E402
from backend.app.storage import desbloqueos_store  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402


def _imagen(formato, lado=4):
    salida = io.BytesIO()
    Image.new("RGB", (lado, lado), (20, 120, 40)).save(salida, formato)
    return salida.getvalue()


def _uri(datos, tipo):
    return "data:%s;base64,%s" % (tipo, base64.b64encode(datos).decode("ascii"))


SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
HTML = b"<!doctype html><html><body><script>alert(1)</script></body></html>"


# --- Imágenes -------------------------------------------------------------------


def test_tipo_real_reconoce_las_imagenes_de_verdad():
    assert imagenes.tipo_real(_imagen("JPEG")) == "image/jpeg"
    assert imagenes.tipo_real(_imagen("PNG")) == "image/png"
    assert imagenes.tipo_real(_imagen("WEBP")) == "image/webp"


def test_tipo_real_rechaza_svg_html_y_firmas_falsas():
    assert imagenes.tipo_real(SVG) is None
    assert imagenes.tipo_real(HTML) is None
    assert imagenes.tipo_real(_imagen("GIF")) is None
    # Firma de JPEG pegada delante de un HTML: la firma pasa, Pillow no.
    assert imagenes.tipo_real(b"\xff\xd8\xff\xe0" + HTML) is None
    assert imagenes.decodificar_data_url_de_imagen(_uri(SVG, "image/png")) is None


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    c = TestClient(main.app)
    assert c.get("/api/game/PLAYER%201").status_code == 200
    return c


@pytest.mark.parametrize(
    "datos,tipo",
    [(SVG, "image/png"), (HTML, "image/jpeg"), (b"\xff\xd8\xff\xe0" + HTML, "image/jpeg"), (SVG, "image/svg+xml")],
)
def test_foto_de_campo_disfrazada_se_rechaza(cliente, datos, tipo):
    r = cliente.post(
        "/api/field-proofs",
        json={"user": "PLAYER 1", "lat": 40.5, "lon": -3.5, "image_data_url": _uri(datos, tipo)},
    )
    assert r.status_code == 400


def test_foto_de_campo_se_guarda_con_su_tipo_real(cliente):
    png = _imagen("PNG")
    # Declarada JPEG pero es PNG: se guarda y se sirve como PNG.
    r = cliente.post(
        "/api/field-proofs",
        json={"user": "PLAYER 1", "lat": 40.5, "lon": -3.5, "image_data_url": _uri(png, "image/jpeg")},
    )
    assert r.status_code == 200, r.text
    prueba = r.json()["proof"]
    imagen = cliente.get(f"/api/field-proofs/{prueba['id']}/image")
    assert imagen.headers["content-type"].startswith("image/png")


def test_foto_de_nodo_y_de_perfil_disfrazadas_no_se_sirven(cliente, monkeypatch):
    falsa = _uri(SVG, "image/png")
    main.save_stages(
        main.STAGES_DB,
        [{"id": 7, "title": "X", "lat": 40.5, "lon": -3.5, "radius": 20, "type": "signal_hunt",
          "config": {"game_id": "place_mosaic", "image_data_url": falsa}}],
    )
    r = cliente.get(f"/media/nodo/7/{main.huella_de_imagen(falsa)}.png")
    assert r.status_code == 404
    monkeypatch.setattr(main, "buscar_avatar_de", lambda pid: _uri(HTML, "text/html"))
    assert cliente.get("/api/player-avatar/PLAYER%201").status_code == 404


# --- CSRF, cuerpo y ritmo ----------------------------------------------------------


def test_escritura_desde_otra_web_se_rechaza(cliente):
    r = cliente.post("/api/advance", json={"user": "PLAYER 1", "code": "X"}, headers={"Origin": "https://malo.example"})
    assert r.status_code == 403 and "cross-site" in r.json()["detail"]
    r = cliente.post("/api/advance", json={"user": "PLAYER 1"}, headers={"Origin": "null"})
    assert r.status_code == 403
    r = cliente.post(
        "/api/admin/login", json={"password": "x"}, headers={"Referer": "https://malo.example/pagina"}
    )
    assert r.status_code == 403


def test_escritura_desde_la_propia_web_o_sin_origen_pasa(cliente):
    propio = cliente.post(
        "/api/advance", json={"user": "PLAYER 1", "code": "X"}, headers={"Origin": "http://testserver"}
    )
    assert propio.status_code != 403
    sin_origen = cliente.post("/api/advance", json={"user": "PLAYER 1", "code": "X"})
    assert sin_origen.status_code != 403


def test_desarrollo_en_localhost_pasa():
    pet = SimpleNamespace(
        method="POST",
        headers={"origin": "http://localhost:5173", "host": "127.0.0.1:8792"},
    )
    assert peticiones.origen_rechazado(pet) is None


def test_cuerpo_demasiado_grande_se_corta_antes_de_leerlo(cliente):
    r = cliente.post(
        "/api/advance",
        content=b"{}",
        headers={"Content-Type": "application/json", "Content-Length": str(peticiones.MAX_CUERPO_JUGADOR + 1)},
    )
    assert r.status_code == 413


def test_ritmo_por_ip(monkeypatch):
    peticiones.limpiar_ritmo()
    monkeypatch.setattr(peticiones, "LIMITE_ESCRITURAS_POR_MINUTO", 3)
    pet = SimpleNamespace(method="POST", url=SimpleNamespace(path="/api/advance"))
    ahora = 1000.0
    assert [peticiones.ritmo_excedido(pet, "203.0.113.9", ahora) for _ in range(3)] == [0, 0, 0]
    assert peticiones.ritmo_excedido(pet, "203.0.113.9", ahora) > 0
    assert peticiones.ritmo_excedido(pet, "203.0.113.10", ahora) == 0, "otra IP no comparte cupo"
    assert peticiones.ritmo_excedido(pet, "203.0.113.9", ahora + 61) == 0, "pasado el minuto vuelve"
    latido = SimpleNamespace(method="POST", url=SimpleNamespace(path="/api/heartbeat"))
    assert peticiones.ritmo_excedido(latido, "203.0.113.9", ahora) == 0
    peticiones.limpiar_ritmo()


# --- HTTPS detrás del túnel ---------------------------------------------------------


def _peticion(scheme="http", host="127.0.0.1", proto=None):
    cabeceras = {"x-forwarded-proto": proto} if proto else {}
    return SimpleNamespace(url=SimpleNamespace(scheme=scheme), client=SimpleNamespace(host=host), headers=cabeceras)


def test_https_por_proxy_de_confianza(monkeypatch):
    monkeypatch.delenv("SAGA_FORCE_HTTPS", raising=False)
    monkeypatch.setattr(client_ip, "TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(client_ip, "TRUSTED_PROXY_IPS", {"127.0.0.1"})
    assert peticiones.es_https(_peticion(proto="https")) is True
    assert peticiones.es_https(_peticion(host="198.51.100.7", proto="https")) is False, "cabecera de un desconocido"
    assert player_session.player_cookie_settings(_peticion(proto="https"), 60)["secure"] is True
    assert admin_auth.admin_cookie_settings(_peticion(proto="https"), 60)["secure"] is True
    monkeypatch.setattr(client_ip, "TRUST_PROXY_HEADERS", False)
    assert peticiones.es_https(_peticion(proto="https")) is False


def test_https_forzado_y_hsts(monkeypatch):
    monkeypatch.setenv("SAGA_FORCE_HTTPS", "1")
    assert peticiones.es_https(_peticion()) is True
    respuesta = SimpleNamespace(headers={})
    main.apply_security_headers(respuesta, _peticion())
    assert "max-age=31536000" in respuesta.headers["Strict-Transport-Security"]
    assert respuesta.headers["X-Content-Type-Options"] == "nosniff"
    assert "camera=(self)" in respuesta.headers["Permissions-Policy"]


# --- Login del panel: bloqueo progresivo -------------------------------------------


def test_bloqueo_progresivo_por_ip():
    intentos = {}
    ahora = 10_000.0

    def fallar(n, t):
        for _ in range(n):
            admin_auth.register_admin_login_failure(
                intentos, "203.0.113.5", max_attempts=5, window_seconds=600, lock_seconds=600, now=t
            )

    fallar(5, ahora)
    primero = admin_auth.get_admin_lock_remaining_seconds(intentos, "203.0.113.5", window_seconds=600, now=ahora)
    assert 590 <= primero <= 600
    # Pasado el primer bloqueo, otros 5 fallos: el doble.
    ahora += 601
    fallar(5, ahora)
    segundo = admin_auth.get_admin_lock_remaining_seconds(intentos, "203.0.113.5", window_seconds=600, now=ahora)
    assert 1190 <= segundo <= 1200
    # Al día siguiente se olvida.
    ahora += 2 * 86_400
    admin_auth.prune_admin_login_attempts(intentos, window_seconds=600, now=ahora)
    fallar(5, ahora)
    tercero = admin_auth.get_admin_lock_remaining_seconds(intentos, "203.0.113.5", window_seconds=600, now=ahora)
    assert 590 <= tercero <= 600


def test_el_bloqueo_tiene_tope():
    intentos = {"ip": {"attempts": [], "locked_until": 0, "strikes": 40, "last_lock_at": 1.0}}
    admin_auth.register_admin_login_failure(intentos, "ip", max_attempts=1, window_seconds=600, lock_seconds=600, now=2.0)
    assert intentos["ip"]["locked_until"] - 2.0 == admin_auth.MAX_LOCK_SECONDS


# --- T1 / T2 ------------------------------------------------------------------------


def test_t1_sin_latido_en_10_min_es_sin_conexion():
    perfil = {"id": "PLAYER 1"}
    ahora = int(time.time())

    def presencia(hace_s):
        return main.project_live_profile_status(
            perfil, {"last_seen": ahora - hace_s}, ahora, total_nodes=1, timers={}, progress={}
        )["presence"]

    assert presencia(30) == "live"
    assert presencia(5 * 60) == "stale"
    assert presencia(11 * 60) == "offline"


def test_t2_is_self_sale_de_la_sesion_no_de_la_url(cliente):
    tabla = cliente.get("/api/team/PLAYER%202").json()
    propios = [p["user"] for p in tabla["profiles"] if p["is_self"]]
    assert propios == ["PLAYER 1"], "la sesión es de PLAYER 1 aunque la URL diga PLAYER 2"


# --- Códigos de respaldo con hash ---------------------------------------------------


def test_el_paquete_del_jugador_no_lleva_los_codigos_en_claro():
    nodo = {
        "id": 31,
        "title": "Con código",
        "lat": 40.5,
        "lon": -3.5,
        "radius": 20,
        "rune": "RUNA9",
        "type": "signal_hunt",
        "config": {"game_id": "spark_radar", "success_code": "Secreto42", "fallback_code": "SECRETO42", "accepted_codes": ["SECRETO42"]},
    }
    proyectado = mision.project_stage_for_player(nodo, include_runtime=True, player_id="PLAYER 1")
    texto = repr(proyectado).upper()
    assert "SECRETO42" not in texto and "RUNA9" not in texto
    condiciones = proyectado["success"]["conditions"]
    assert {"kind": "minigame_ok", "value": "OK"} in condiciones
    hashes = {c["hash"] for c in condiciones if c["kind"] != "minigame_ok"}
    sal = mision.sal_de_codigo(31)
    assert mision.hash_codigo_de_nodo("secreto42 ", sal) in hashes
    assert mision.hash_codigo_de_nodo("RUNA9", sal) in hashes
    # El servidor sigue aceptando el código de verdad.
    assert mision.stage_accepts_code(nodo, "secreto42", manual=True)


# --- S1: en hilos, pero sin cruzarse dentro de un jugador ---------------------------


def test_dos_avances_a_la_vez_del_mismo_jugador_avanzan_uno(cliente):
    resultados = []
    barrera = threading.Barrier(4)

    def avanzar():
        barrera.wait()
        resultados.append(
            cliente.post(
                "/api/advance",
                json={"user": "PLAYER 1", "code": "OK", "level_before": 0, "time_spent_ms": 9000},
            ).json()
        )

    hilos = [threading.Thread(target=avanzar) for _ in range(4)]
    for hilo in hilos:
        hilo.start()
    for hilo in hilos:
        hilo.join()

    assert main.get_player_progress_level("PLAYER 1", 0) == 1, "un solo nodo, aunque lleguen cuatro a la vez"
    assert sum(1 for r in resultados if r.get("status") == "ok" and not r.get("duplicate")) == 1


def test_avance_y_sync_no_son_async_con_e_s_dentro():
    import inspect

    from backend.app.routers import game

    assert not inspect.iscoroutinefunction(game._procesar_avance)
    assert not inspect.iscoroutinefunction(game._procesar_sync)


# --- SQLite ---------------------------------------------------------------------------


def test_la_base_de_desbloqueos_va_en_wal(tmp_path):
    ruta = str(tmp_path / "desbloqueos.sqlite3")
    desbloqueos_store.init_schema(ruta)
    with sqlite3.connect(ruta) as conn:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
