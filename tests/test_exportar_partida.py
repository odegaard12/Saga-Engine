# -*- coding: utf-8 -*-
"""«Exportar partida» y el registro para analizar (errores, auditoría del panel).

Una partida sintética de dos jugadores inventados: avances con red y sin red,
un código mal tecleado, una sospecha, errores del móvil y del servidor y cambios
del panel. Se exporta el ZIP y se comprueba lo que lleva, el anonimizado, la
purga y que sin sesión de administración no se baja nada.
"""
import io
import json
import os
import tempfile
import zipfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-exportar-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import exportar_partida  # noqa: E402
from backend.app.runtime import registro_analisis  # noqa: E402
from backend.app.storage import registro_analisis_store  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

UNO = "Xogadora Proba"
DOS = "Xogador Ficticio"
SESION_ADMIN = "sesion-admin-de-proba"

FICHEROS = {
    "resumen.json",
    "clasificacion.csv",
    "nodos_por_jugador.csv",
    "eventos.jsonl",
    "cola_eventos.jsonl",
    "sospechas.csv",
    "errores.jsonl",
    "auditoria_admin.jsonl",
    "desbloqueos.csv",
    "config_mision.json",
    "INFORME.md",
}


@pytest.fixture
def partida(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path, user=UNO)
    main.set_player_progress_level(DOS, 0)
    con_fecha = main.load_config
    monkeypatch.setattr(
        main,
        "load_config",
        lambda: {
            **con_fecha(),
            "site_name": "Ruta de proba",
            "mapbox_token": "pk.non-debe-saír",
            "players": [UNO, DOS],
            "player_profiles": [
                {"id": UNO, "display_name": UNO, "mode": "solo", "members": []},
                {"id": DOS, "display_name": DOS, "mode": "team", "members": ["Membro Inventado"]},
            ],
        },
    )
    monkeypatch.setattr(main, "REGISTRO_ANALISIS_DB", str(tmp_path / "registro_analisis.sqlite3"))
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    monkeypatch.setattr(
        main,
        "admin_request_authorized",
        lambda request, data=None: request.cookies.get(main.ADMIN_SESSION_COOKIE) == SESION_ADMIN,
    )
    registro_analisis.reiniciar_ritmo()
    return tmp_path


def _jugador(nombre):
    cliente = TestClient(main.app)
    main.clear_player_rate_limits()
    assert cliente.get(f"/api/game/{nombre.replace(' ', '%20')}").status_code == 200
    return cliente


def _admin():
    cliente = TestClient(main.app)
    cliente.cookies.set(main.ADMIN_SESSION_COOKIE, SESION_ADMIN)
    return cliente


def _jugar(tmp_path):
    """Lo que pasa en la partida sintética."""
    uno = _jugador(UNO)
    dos = _jugador(DOS)

    # UNO: con red, nodo 0 bien; luego un código mal tecleado en el nodo 1.
    assert uno.post("/api/advance", json={"user": UNO, "code": "OK", "level_before": 0, "time_spent_ms": 40_000}).json()["status"] == "ok"
    assert uno.post("/api/advance", json={"user": UNO, "code": "MAL", "level_before": 1}).json()["status"] == "fail"
    assert uno.post("/api/advance", json={"user": UNO, "code": "SAGA_QR_1", "level_before": 1, "time_spent_ms": 20_000}).json()["status"] == "ok"

    # DOS: sin red, dos nodos que llegan juntos media hora después.
    antes = datetime.now(timezone.utc) - timedelta(minutes=30)
    eventos = [
        {
            "client_event_id": f"cola-{i}",
            "type": "node_completed",
            "payload": {
                "code": codigo,
                "level_before": i,
                "time_spent_ms": 15_000,
                "local_created_at": (antes + timedelta(minutes=i * 5)).isoformat(),
                "offline_at_creation": True,
            },
        }
        for i, codigo in enumerate(["OK", "SAGA_QR_1"])
    ]
    respuesta = dos.post("/api/events/sync", json={"user": DOS, "events": eventos})
    assert [e["status"] for e in respuesta.json()["events"]] == ["synced", "synced"]

    # Una sospecha del antitrampas.
    main._anti_cheat.record_suspicion(
        main.ANTI_CHEAT_DB, DOS, "impossible_speed", {"node_id": "102", "from": {"lat": 40.12345, "lon": -3.54321}}
    )

    # Errores del móvil (con su sesión) y uno del servidor.
    respuesta = uno.post(
        "/api/client-errors",
        json={
            "user": UNO,
            "app_version": "9.9.9-proba",
            "errores": [
                {"tipo": "js", "mensaje": "TypeError: x is undefined", "ruta": "/player/x?token=SECRETO", "pila": "at f (app.js:1)"},
                {"tipo": "red", "mensaje": "Failed to fetch https://exemplo.invalid/api/advance?code=OK", "estado_http": 0},
            ],
        },
        headers={"user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1"},
    )
    assert respuesta.json()["aceptados"] == 2
    registro_analisis.registrar_error_servidor("GET", "/api/proba?x=1", ValueError("fallo de proba"))

    # Cambios del panel.
    admin = _admin()
    assert admin.post("/api/admin/profile-action", json={"profile_id": DOS, "action": "level_next"}).status_code == 200


def _zip(respuesta):
    assert respuesta.status_code == 200, respuesta.text[:300]
    assert respuesta.headers["content-type"].startswith("application/zip")
    assert "no-store" in respuesta.headers["cache-control"]
    return zipfile.ZipFile(io.BytesIO(respuesta.content))


def _jsonl(z, nombre):
    return [json.loads(linea) for linea in z.read(nombre).decode("utf-8").splitlines() if linea.strip()]


# ---------------------------------------------------------------------------
# Permisos
# ---------------------------------------------------------------------------

def test_sin_sesion_de_admin_no_se_baja_nada(partida):
    cliente = TestClient(main.app)
    for metodo, ruta in (
        ("post", "/api/admin/partida/exportar"),
        ("get", "/api/admin/partida/exportar?anonimizar=1"),
        ("post", "/api/admin/partida/resumen"),
    ):
        respuesta = getattr(cliente, metodo)(ruta, **({"json": {}} if metodo == "post" else {}))
        assert respuesta.status_code in (401, 403), (ruta, respuesta.status_code)
        assert not respuesta.content.startswith(b"PK")

    # Con una cookie de admin inventada, tampoco.
    cliente.cookies.set(main.ADMIN_SESSION_COOKIE, "otra-cosa")
    assert cliente.get("/api/admin/partida/exportar").status_code in (401, 403)


def test_una_sesion_de_jugador_no_es_de_admin(partida):
    jugador = _jugador(UNO)
    assert jugador.post("/api/admin/partida/exportar", json={}).status_code in (401, 403)


# ---------------------------------------------------------------------------
# Exportación completa
# ---------------------------------------------------------------------------

def test_exportacion_completa_de_una_partida_sintetica(partida):
    _jugar(partida)
    respuesta = _admin().post("/api/admin/partida/exportar", json={"anonimizar": False})
    z = _zip(respuesta)
    nombres = set(z.namelist())
    assert FICHEROS <= nombres
    assert "fotos.csv" in nombres
    assert "attachment" in respuesta.headers["content-disposition"]

    resumen = json.loads(z.read("resumen.json"))
    assert resumen["formato"] == "saga-partida" and resumen["anonimizado"] is False
    assert resumen["jugadores"] == 2 and resumen["nodos"] == 6
    assert resumen["registro_activo"] is True

    # Clasificación con desglose: UNO dos nodos con red, DOS dos sin red + uno saltado por el admin.
    clasif = z.read("clasificacion.csv").decode("utf-8-sig").splitlines()
    assert clasif[0].startswith("posicion;jugador;nombre;terminado")
    filas = {linea.split(";")[1]: linea.split(";") for linea in clasif[1:]}
    assert set(filas) == {UNO, DOS}
    assert filas[DOS][4] == "3"  # nodos superados (2 + el salto del panel)
    assert int(filas[DOS][9]) >= 300_000  # el salto cuesta 5 min de penalización

    nodos = z.read("nodos_por_jugador.csv").decode("utf-8-sig")
    assert "declarado_ms;observado_ms;aplicado_ms" in nodos
    assert "offline" in nodos and "online" in nodos
    assert "codigo_a_mano;proximidad;prueba;origen" in nodos

    eventos = _jsonl(z, "eventos.jsonl")
    tipos = [e["type"] for e in eventos]
    assert tipos.count("advance") >= 4
    rechazos = [e for e in eventos if e["type"] == "advance_rejected"]
    assert any(r["payload"]["via"] == "online" and r["payload"]["error"] == "invalid_completion_code" for r in rechazos)
    # El código tecleado no se guarda, sólo su largo.
    assert all("MAL" not in json.dumps(r) for r in rechazos)
    # Cola sin cobertura: cuándo pasó frente a cuándo llegó.
    sin_red = [e for e in eventos if e["type"] == "advance" and e["payload"].get("offline")]
    assert len(sin_red) == 2 and all(e["payload"].get("sync_delay_ms", 0) > 20 * 60_000 for e in sin_red)
    assert "offline_sync_batch" in tipos and "client_info" in tipos
    assert any(e["type"] == "session_open" and "dispositivo" in e["payload"] for e in eventos)
    # Por orden de ocurrencia.
    momentos = [e["occurred_at"] for e in eventos]
    assert momentos == sorted(momentos)

    assert "impossible_speed" in z.read("sospechas.csv").decode("utf-8-sig")

    errores = _jsonl(z, "errores.jsonl")
    assert {e["origen"] for e in errores} == {"cliente", "servidor"}
    cliente = [e for e in errores if e["origen"] == "cliente"]
    assert all(e["dispositivo"].startswith("iOS 17") for e in cliente)
    assert all(e["app_version"] == "9.9.9-proba" for e in cliente)
    texto_errores = json.dumps(errores)
    assert "SECRETO" not in texto_errores and "code=OK" not in texto_errores  # sin consultas de URL
    assert "Mozilla" not in texto_errores  # nunca el agente entero

    auditoria = _jsonl(z, "auditoria_admin.jsonl")
    acciones = [a["accion"] for a in auditoria]
    assert "jugador:level_next" in acciones
    salto = next(a for a in auditoria if a["accion"] == "jugador:level_next")
    assert salto["objetivo"] == DOS and salto["sesion"] and SESION_ADMIN not in json.dumps(salto)

    config = json.loads(z.read("config_mision.json"))
    assert "pk.non-debe-saír" not in json.dumps(config)
    assert len(config["nodos"]) == 6

    informe = z.read("INFORME.md").decode("utf-8")
    for seccion in ("Podio", "Empates", "Modo prueba, sin GPS y avances lejos del nodo", "Declarado frente a observado", "Sospechas por jugador",
                    "Nodos donde más se atascó", "Errores más frecuentes", "cola sin cobertura", "curl"):
        assert seccion in informe, seccion
    assert os.environ["ADMIN_PASS"] not in informe
    assert "$SAGA_ADMIN_PASS" in informe


def test_exportar_sin_partida_tambien_funciona(partida):
    z = _zip(_admin().get("/api/admin/partida/exportar"))
    assert FICHEROS <= set(z.namelist())
    assert _jsonl(z, "eventos.jsonl") == []
    assert "Podio" in z.read("INFORME.md").decode("utf-8")


def test_el_resumen_del_panel_cuenta_lo_registrado(partida):
    _jugar(partida)
    datos = _admin().post("/api/admin/partida/resumen", json={}).json()
    assert datos["jugadores"] == 2 and datos["nodos"] == 6
    assert datos["errores"] == 3 and datos["sospechas"] >= 1 and datos["auditoria"] >= 1
    assert datos["filas_registro"] > 0


def test_el_zip_temporal_no_se_queda_en_disco(partida, monkeypatch):
    creados = []
    original = tempfile.mkstemp

    def _vigilado(*args, **kwargs):
        resultado = original(*args, **kwargs)
        creados.append(resultado[1])
        return resultado

    monkeypatch.setattr(tempfile, "mkstemp", _vigilado)
    _zip(_admin().post("/api/admin/partida/exportar", json={}))
    assert creados and not any(os.path.exists(ruta) for ruta in creados)


# ---------------------------------------------------------------------------
# Anonimizar
# ---------------------------------------------------------------------------

def test_anonimizado_sin_nombres_ni_fotos_y_posiciones_redondeadas(partida):
    _jugar(partida)
    z = _zip(_admin().get("/api/admin/partida/exportar?anonimizar=1"))
    assert "fotos.csv" not in z.namelist()
    assert json.loads(z.read("resumen.json"))["anonimizado"] is True

    for nombre in z.namelist():
        texto = z.read(nombre).decode("utf-8", "replace")
        for persona in (UNO, DOS, "Membro Inventado", "Xogadora", "Ficticio"):
            assert persona not in texto, (nombre, persona)

    clasif = z.read("clasificacion.csv").decode("utf-8-sig")
    assert "J01" in clasif and "J02" in clasif

    sospechas = z.read("sospechas.csv").decode("utf-8-sig")
    assert "40.12345" not in sospechas and "40.12" in sospechas


# ---------------------------------------------------------------------------
# Purga, ritmo y retención
# ---------------------------------------------------------------------------

def test_la_purga_de_datos_personales_borra_errores_y_auditoria(partida):
    _jugar(partida)
    assert sum(registro_analisis.contar().values()) > 0

    admin = _admin()
    cuenta = admin.post("/api/admin/datos-personales", json={}).json()
    assert cuenta["datos"]["errores_y_auditoria"] > 0
    borrado = admin.post("/api/admin/datos-personales", json={"confirmacion": "BORRAR"}).json()
    assert borrado["borrado"]["errores_y_auditoria"] > 0

    # Sólo queda la constancia de la propia purga (sin datos de nadie).
    assert registro_analisis.contar()["errores"] == 0
    filas = list(registro_analisis_store.iterar(registro_analisis.ruta_db(), "auditoria"))
    assert [f["accion"] for f in filas] == ["purga_datos_personales"]

    z = _zip(admin.post("/api/admin/partida/exportar", json={}))
    assert _jsonl(z, "errores.jsonl") == [] and _jsonl(z, "eventos.jsonl") == []


def test_errores_del_movil_con_limite_de_ritmo_y_tamano(partida):
    cliente = TestClient(main.app)
    lote = [{"tipo": "js", "mensaje": f"error {i}"} for i in range(30)]
    primera = cliente.post("/api/client-errors", json={"errores": lote}).json()
    assert primera["aceptados"] == registro_analisis.MAX_POR_ENVIO
    segunda = cliente.post("/api/client-errors", json={"errores": lote}).json()
    assert segunda["aceptados"] == 0  # 20 por minuto como mucho

    grande = {"errores": [{"tipo": "js", "mensaje": "x" * 40_000}]}
    assert cliente.post("/api/client-errors", json=grande).status_code == 413
    assert cliente.post("/api/client-errors", content=b"[1,2]", headers={"content-type": "application/json"}).status_code == 400


def test_sin_sesion_no_se_puede_firmar_un_error_a_nombre_de_otro(partida):
    cliente = TestClient(main.app)
    assert cliente.post("/api/client-errors", json={"user": UNO, "errores": [{"tipo": "js", "mensaje": "x"}]}).json()["aceptados"] == 1
    filas = list(registro_analisis_store.iterar(registro_analisis.ruta_db(), "errores"))
    assert filas[-1]["usuario"] == ""


def test_retencion_tope_de_filas(partida, monkeypatch):
    monkeypatch.setitem(registro_analisis_store._TABLAS, "errores", 5)
    ruta = registro_analisis.ruta_db()
    for i in range(12):
        registro_analisis_store.anadir_errores(ruta, [{"origen": "servidor", "mensaje": f"n{i}"}])
    filas = list(registro_analisis_store.iterar(ruta, "errores"))
    assert len(filas) == 5
    assert filas[-1]["mensaje"] == "n11"


def test_la_auditoria_anota_guardados_y_conflictos_409(partida):
    admin = _admin()
    nodos = main.load_stages(main.STAGES_DB)
    assert admin.post("/api/admin/save", json={"stages": nodos, "stages_revision": "vieja"}).status_code == 409
    assert admin.post("/api/admin/save", json={"stages": nodos}).status_code == 200
    filas = [f for f in registro_analisis_store.iterar(registro_analisis.ruta_db(), "auditoria") if f["accion"] == "guardar_nodos"]
    assert [f["resultado"] for f in filas] == ["conflicto_409", "ok"]
    assert filas[-1]["detalle"]["nodos"] == 6


def test_resumen_del_agente_no_guarda_el_agente_entero():
    assert registro_analisis.resumir_agente(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36"
    ) == "Android 14 · Chrome · móvil"
    assert registro_analisis.resumir_agente("") == ""


def test_anonimizador_no_toca_palabras_que_contienen_un_nombre():
    anon = exportar_partida.Anonimizador(True, [{"id": "Ana", "display_name": "Ana"}])
    assert anon.texto("Ana pasó por la ventana") == "J01 pasó por la ventana"
    assert anon.valor({"lat": 42.123456, "user": "Ana", "avatar_url": "data:x"}) == {"lat": 42.12, "user": "J01"}
