# -*- coding: utf-8 -*-
"""Integraciones con el ecosistema: tiempo en la zona, avisos por ntfy y salud.

Todo con servicios FALSOS: ni una petición sale a Open-Meteo, a una estación ni a
ningún ntfy. Ningún dato real (repo público): coordenadas inventadas, temas de
ntfy inventados y jugadores de ficción.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-integracions-"))

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import integraciones as router_integraciones  # noqa: E402
from backend.app.runtime import teselas  # noqa: E402
from backend.app.runtime.integraciones import avisos, tiempo  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

AHORA = 1_900_000_000.0
CAJA = (39.99, 40.01, -3.01, -2.99)
SESION_ADMIN = "sesion-admin-de-proba"


# ---------------------------------------------------------------------------
# Tiempo
# ---------------------------------------------------------------------------

class _Resp:
    def __init__(self, datos, status=200):
        self.status_code = status
        self._datos = datos

    def json(self):
        return self._datos


class _Cliente:
    """Contesta por URL. `None` en una fuente = se queda colgada (timeout)."""

    def __init__(self, estacion=None, modelo=None):
        self.estacion = estacion
        self.modelo = modelo
        self.llamadas = []

    def get(self, url, params=None):
        self.llamadas.append(url)
        datos = self.estacion if "estacion" in url else self.modelo
        if datos is None:
            raise httpx.ReadTimeout("colgada")
        return _Resp(datos)


def _open_meteo(lluvia_cuartos=(0, 0, 0, 0, 0, 0, 0, 0), racha_h=20, codigo_h=3):
    hora0 = int(AHORA // 3600 * 3600)
    return {
        "current": {
            "time": int(AHORA),
            "temperature_2m": 14.2,
            "weather_code": 3,
            "wind_speed_10m": 12.0,
            "wind_gusts_10m": 25.0,
            "wind_direction_10m": 225,
        },
        "hourly": {
            "time": [hora0 + 3600 * i for i in range(7)],
            "temperature_2m": [14, 14, 13, 13, 12, 12, 11],
            "weather_code": [codigo_h] * 7,
            "precipitation": [0] * 7,
            "precipitation_probability": [10, 20, 60, 70, 30, 10, 5],
            "wind_gusts_10m": [racha_h] * 7,
        },
        "minutely_15": {
            "time": [int(AHORA) + 900 * (i + 1) for i in range(8)],
            "precipitation": list(lluvia_cuartos),
        },
    }


ESTACION = {"temp": 16.3, "wind": 4.7, "gust": 7.2, "wind_deg": 58, "rain_rate": 0.0, "data_age_sec": 32}


@pytest.fixture
def entorno_tiempo(monkeypatch):
    monkeypatch.setenv("SAGA_TIEMPO_URL", "http://estacion.invalid/api/weather")
    monkeypatch.delenv("SAGA_TIEMPO_OPENMETEO", raising=False)
    tiempo.olvidar()
    yield
    tiempo.olvidar()


def test_lo_medido_manda_y_la_prevision_viene_del_modelo(entorno_tiempo):
    datos = tiempo.consultar(40.0, -3.0, cliente=_Cliente(ESTACION, _open_meteo()), ahora=AHORA)
    assert datos["disponible"] and datos["fuente"] == "estacion"
    assert datos["ahora"]["temp"] == 16.3 and datos["ahora"]["racha"] == 7.2
    assert datos["ahora"]["cielo"] == "nubes", "el cielo sale del modelo: la estación no lo mide"
    assert 1 <= len(datos["horas"]) <= tiempo.HORAS_DE_PREVISION
    assert datos["avisos"] == []


def test_lluvia_fuerte_en_media_hora_y_viento(entorno_tiempo):
    # 1,5 mm en el cuarto que acaba a los 45 min = 6 mm/h, empieza a los 30 min.
    modelo = _open_meteo(lluvia_cuartos=(0, 0, 1.5, 0, 0, 0, 0, 0), racha_h=62)
    datos = tiempo.consultar(40.0, -3.0, cliente=_Cliente(ESTACION, modelo), ahora=AHORA)
    avisos_ = {a["tipo"]: a["en_min"] for a in datos["avisos"]}
    assert avisos_["lluvia"] == 30
    assert "viento" in avisos_
    assert "tormenta" not in avisos_


def test_el_viento_solo_avisa_a_una_hora_vista():
    lejos = {"cuartos": [], "horas_todas": [(int(AHORA) + 90 * 60, 3, 0, 70)], "ahora": {"racha": 20}}
    cerca = {"cuartos": [], "horas_todas": [(int(AHORA) + 50 * 60, 3, 0, 70)], "ahora": {"racha": 20}}
    assert tiempo.calcular_avisos(None, lejos, AHORA) == []
    assert tiempo.calcular_avisos(None, cerca, AHORA) == [{"tipo": "viento", "en_min": 50}]


def test_tormenta_y_lluvia_medida_ahora(entorno_tiempo):
    medido = {**ESTACION, "rain_rate": 9.0}
    datos = tiempo.consultar(40.0, -3.0, cliente=_Cliente(medido, _open_meteo(codigo_h=95)), ahora=AHORA)
    avisos_ = {a["tipo"]: a["en_min"] for a in datos["avisos"]}
    assert avisos_["lluvia"] == 0 and "tormenta" in avisos_
    assert datos["avisos"][0]["tipo"] == "tormenta", "la tormenta va primero"


def test_cache_timeout_y_respaldo(entorno_tiempo):
    reloj = [AHORA]
    cliente = _Cliente(None, _open_meteo())  # la estación se cuelga
    primero = tiempo.tiempo_para(40.0, -3.0, cliente=cliente, reloj=lambda: reloj[0])
    assert primero["disponible"] and primero["fuente"] == "modelo", "sin estación, respaldo de Open-Meteo"
    assert primero["ahora"]["temp"] == 14.2

    # Dentro de la caché no se vuelve a preguntar.
    llamadas = len(cliente.llamadas)
    reloj[0] += 60
    assert tiempo.tiempo_para(40.0, -3.0, cliente=cliente, reloj=lambda: reloj[0]) == primero
    assert len(cliente.llamadas) == llamadas

    # Pasada la caché y sin ninguna fuente: lo último bueno, con SU hora.
    cliente.modelo = None
    reloj[0] += tiempo.TTL_S + 1
    viejo = tiempo.tiempo_para(40.0, -3.0, cliente=cliente, reloj=lambda: reloj[0])
    assert viejo["actualizado"] == primero["actualizado"]

    # Tras el fallo no se insiste hasta pasado REINTENTO_S.
    llamadas = len(cliente.llamadas)
    reloj[0] += tiempo.REINTENTO_S - 5
    tiempo.tiempo_para(40.0, -3.0, cliente=cliente, reloj=lambda: reloj[0])
    assert len(cliente.llamadas) == llamadas
    reloj[0] += 10
    tiempo.tiempo_para(40.0, -3.0, cliente=cliente, reloj=lambda: reloj[0])
    assert len(cliente.llamadas) > llamadas


def test_sin_fuentes_no_hay_tiempo(entorno_tiempo):
    assert tiempo.tiempo_para(40.0, -3.0, cliente=_Cliente(None, None), reloj=lambda: AHORA) == {"disponible": False}


def test_estacion_vieja_no_cuenta(entorno_tiempo):
    assert tiempo.de_la_estacion({**ESTACION, "data_age_sec": 4000}, AHORA) is None


def test_el_endpoint_usa_el_centro_de_la_mision(monkeypatch, entorno_tiempo):
    pedido = {}

    def falso(lat, lon):
        pedido["punto"] = (round(lat, 3), round(lon, 3))
        return {"disponible": True, "avisos": []}

    monkeypatch.setattr(teselas, "caja_de_la_mision", lambda: CAJA)
    monkeypatch.setattr(tiempo, "tiempo_para", falso)
    respuesta = TestClient(main.app).get("/api/tiempo")
    assert respuesta.status_code == 200 and respuesta.json()["disponible"] is True
    assert pedido["punto"] == (40.0, -3.0)

    monkeypatch.setattr(teselas, "caja_de_la_mision", lambda: None)
    assert TestClient(main.app).get("/api/tiempo").json() == {"disponible": False}


# ---------------------------------------------------------------------------
# Avisos por ntfy
# ---------------------------------------------------------------------------

@pytest.fixture
def ntfy(monkeypatch, tmp_path):
    monkeypatch.setenv("SAGA_NTFY_URL", "http://ntfy.invalid")
    monkeypatch.setenv("SAGA_NTFY_TOPIC", "tema-de-proba")
    monkeypatch.delenv("SAGA_NTFY_TOKEN", raising=False)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(avisos, "AGRUPAR_S", 3600.0)  # el temporizador no salta solo en la prueba
    enviados = []
    monkeypatch.setattr(avisos, "ENVIAR", lambda titulo, cuerpo, prioridad=3, etiquetas=None: enviados.append((titulo, cuerpo, prioridad)))
    avisos.reiniciar_estado()
    yield enviados
    avisos.reiniciar_estado()


def _encender(tmp_path, **tipos):
    avisos.guardar_config(tmp_path, {"activo": True, "tipos": tipos})


def test_apagado_por_defecto(ntfy, tmp_path):
    assert avisos.leer_config(tmp_path)["activo"] is False
    assert avisos.encendido(tmp_path, "fin") is False
    avisos.error_del_servidor("/api/x")
    avisos.error_del_servidor("/api/x")
    avisos.error_del_servidor("/api/x")
    assert avisos.vaciar() is False and ntfy == []


def test_sin_servidor_ntfy_no_hace_nada(monkeypatch, tmp_path):
    monkeypatch.delenv("SAGA_NTFY_URL", raising=False)
    monkeypatch.delenv("SAGA_NTFY_TOPIC", raising=False)
    _encender(tmp_path)
    assert avisos.configurado() is False
    assert avisos.prueba() == (False, "sin_configurar")


def test_se_agrupan_en_una_notificacion(ntfy):
    for i in range(3):
        assert avisos.encolar("fin", "Jugador %d ha terminado" % i, reloj=lambda: AHORA)
    assert avisos.vaciar(reloj=lambda: AHORA) is True
    assert len(ntfy) == 1
    titulo, cuerpo, _ = ntfy[0]
    assert titulo == "SAGA: 3 avisos" and cuerpo.count("\n") == 2


def test_lo_mismo_no_se_repite(ntfy):
    assert avisos.encolar("sin_senal", "A", clave="x", reloj=lambda: AHORA)
    assert not avisos.encolar("sin_senal", "A otra vez", clave="x", reloj=lambda: AHORA + 60)
    assert avisos.encolar("sin_senal", "A pasada la ventana", clave="x", reloj=lambda: AHORA + avisos.REPETIR_S + 1)


def test_limite_por_hora(ntfy):
    for i in range(avisos.MAX_POR_HORA):
        avisos.encolar("fin", "aviso %d" % i, reloj=lambda: AHORA)
        assert avisos.vaciar(reloj=lambda: AHORA + i)
    avisos.encolar("fin", "uno de más", reloj=lambda: AHORA)
    avisos.encolar("fin", "y otro", reloj=lambda: AHORA)
    assert avisos.vaciar(reloj=lambda: AHORA + 100) is False, "pasado el límite espera"
    assert len(ntfy) == avisos.MAX_POR_HORA
    assert avisos.vaciar(reloj=lambda: AHORA + 3601) is True
    assert "uno de más" in ntfy[-1][1] and "y otro" in ntfy[-1][1], "lo que esperó sale junto"


def test_primero_en_llegar_y_fin_desde_el_registro(ntfy, monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path, user="Xogadora Proba")
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    _encender(tmp_path)
    main.match_log_record("advance", "Xogadora Proba", payload={"node_id": 101, "level_after": 1})
    main.match_log_record("advance", "Xogador Ficticio", payload={"node_id": 101, "level_after": 1})
    main.match_log_record("advance", "Xogadora Proba", payload={"node_id": 106, "level_after": 6})
    avisos.vaciar()
    cuerpo = ntfy[0][1]
    assert "Xogadora Proba llega el primero a «Paso»" in cuerpo
    assert "Xogador Ficticio" not in cuerpo, "el segundo en llegar no avisa"
    assert "Xogadora Proba ha terminado la misión" in cuerpo
    # Tras reiniciar el servidor sigue sabiendo quién llegó primero.
    avisos.reiniciar_estado()
    main.match_log_record("advance", "Xogador Ficticio", payload={"node_id": 101, "level_after": 1})
    assert avisos.vaciar() is False


def test_tipo_apagado_no_avisa(ntfy, monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path, user="Xogadora Proba")
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    _encender(tmp_path, primero=False)
    main.match_log_record("advance", "Xogadora Proba", payload={"node_id": 101, "level_after": 1})
    assert avisos.vaciar() is False


def test_sospecha_fuerte_a_la_tercera(ntfy, tmp_path):
    _encender(tmp_path)
    for i in range(2):
        avisos.al_registrar("suspicion", "u1", "Xogadora Proba", {"reason": "impossible_travel_speed"}, "suspicion", reloj=lambda: AHORA + i)
    avisos.al_registrar("suspicion", "u1", "Xogadora Proba", {"reason": "nota"}, "info", reloj=lambda: AHORA + 3)
    assert avisos.vaciar() is False, "dos sospechas y una nota neutra no son fuertes"
    avisos.al_registrar("suspicion", "u1", "Xogadora Proba", {"reason": "impossible_travel_speed"}, "suspicion", reloj=lambda: AHORA + 5)
    assert avisos.vaciar() is True and "Sospecha fuerte: Xogadora Proba" in ntfy[0][1]


def test_errores_repetidos_del_servidor(ntfy, tmp_path):
    _encender(tmp_path)
    avisos.error_del_servidor("/api/a", reloj=lambda: AHORA)
    avisos.error_del_servidor("/api/b", reloj=lambda: AHORA + 1)
    assert avisos.vaciar() is False
    avisos.error_del_servidor("/api/c", reloj=lambda: AHORA + 2)
    avisos.error_del_servidor("/api/d", reloj=lambda: AHORA + 3)
    assert avisos.vaciar() is True and len(ntfy) == 1 and "3 veces" in ntfy[0][1]


def test_sin_senal_en_plena_partida(ntfy, monkeypatch, tmp_path):
    _encender(tmp_path)
    monkeypatch.setattr(main, "match_log_is_active", lambda cfg=None: True)
    monkeypatch.setattr(main, "load_live_positions", lambda: {
        "callado": {"last_seen": AHORA - 31 * 60},
        "acabado": {"last_seen": AHORA - 90 * 60},
        "con_senal": {"last_seen": AHORA - 60},
    })
    monkeypatch.setattr(main, "load_player_timers", lambda: {
        "callado": {"started_at": 1},
        "acabado": {"started_at": 1, "finished_at": 2},
        "con_senal": {"started_at": 1},
    })
    monkeypatch.setattr(main, "match_log_display_name", lambda user, profile=None: user)
    assert avisos.revisar_sin_senal(main, AHORA) == ["callado"]
    assert avisos.revisar_sin_senal(main, AHORA + 60) == [], "una vez por cada vez que se va"
    assert avisos.vaciar() and "callado lleva 31 min sin dar señal" in ntfy[0][1]
    monkeypatch.setattr(main, "match_log_is_active", lambda cfg=None: False)
    avisos.reiniciar_estado()
    assert avisos.revisar_sin_senal(main, AHORA) == [], "fuera de partida no se vigila"


def test_panel_de_avisos(ntfy, monkeypatch, tmp_path):
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    monkeypatch.setattr(
        main,
        "admin_request_authorized",
        lambda request, data=None: request.cookies.get(main.ADMIN_SESSION_COOKIE) == SESION_ADMIN,
    )
    anonimo = TestClient(main.app)
    assert anonimo.post("/api/admin/avisos", json={}).status_code == 403
    assert anonimo.post("/api/admin/avisos/prueba", json={}).status_code == 403

    admin = TestClient(main.app)
    admin.cookies.set(main.ADMIN_SESSION_COOKIE, SESION_ADMIN)
    estado = admin.post("/api/admin/avisos", json={}).json()
    assert estado["configurado"] is True and estado["activo"] is False
    assert "tema-de-proba" not in str(estado) and "ntfy.invalid" not in str(estado), "el panel no enseña el destino"

    guardado = admin.post("/api/admin/avisos/guardar", json={"activo": True, "tipos": {"primero": False}}).json()
    assert guardado["activo"] is True and guardado["tipos"]["primero"] is False and guardado["tipos"]["fin"] is True

    assert admin.post("/api/admin/avisos/prueba", json={}).json()["status"] == "ok"
    assert ntfy[-1][0] == "SAGA: aviso de prueba"


def test_enviar_ntfy_lleva_token_por_cabecera(monkeypatch):
    monkeypatch.setenv("SAGA_NTFY_URL", "http://ntfy.invalid/")
    monkeypatch.setenv("SAGA_NTFY_TOPIC", "tema-de-proba")
    monkeypatch.setenv("SAGA_NTFY_TOKEN", "token-de-proba")
    visto = {}

    def post(url, json=None, headers=None, timeout=None):
        visto.update(url=url, json=json, headers=headers)
        return httpx.Response(200, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", post)
    avisos.enviar_ntfy("Título con acentos", "cuerpo", 4)
    assert visto["url"] == "http://ntfy.invalid"
    assert visto["json"]["topic"] == "tema-de-proba" and visto["json"]["priority"] == 4
    assert visto["headers"] == {"Authorization": "Bearer token-de-proba"}


# ---------------------------------------------------------------------------
# Salud
# ---------------------------------------------------------------------------

def test_salud(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    respuesta = TestClient(main.app).get("/api/salud")
    assert respuesta.status_code == 200, respuesta.text
    datos = respuesta.json()
    assert datos["estado"] == "ok" and datos["base_de_datos"] is True
    assert datos["version"] and datos["disco"]["libre_mb"] > 0
    assert datos["mapa3d"] == {"preparado": False, "preparado_el": None}
    assert set(datos) == {"estado", "version", "base_de_datos", "disco", "disco_ok", "mapa3d", "hora"}, "nada de jugadores"
    assert respuesta.headers["Cache-Control"].startswith("no-store")


def test_salud_con_la_base_caida_da_503(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(router_integraciones, "_base_responde", lambda main: False)
    respuesta = TestClient(main.app).get("/api/salud")
    assert respuesta.status_code == 503 and respuesta.json()["estado"] == "mal"
