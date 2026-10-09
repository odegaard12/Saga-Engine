"""El tiempo en la zona de la misión: lo que hace ahora, las próximas horas y avisos.

Dos fuentes, las dos opcionales:

- **Estación propia** (`SAGA_TIEMPO_URL`): un `/api/weather` con el formato de
  MeteoCatoira. Es lo MEDIDO (temperatura, viento, racha, intensidad de lluvia).
  Sólo tiene sentido si la estación está en la zona de la misión.
- **Open-Meteo** (encendido salvo `SAGA_TIEMPO_OPENMETEO=0`): previsión por horas
  y por cuartos de hora en el centro de la misión. Es lo que da «lluvia en 30 min».

Lo medido manda sobre lo previsto para «ahora». Si una fuente no contesta se usa
la otra; si no contesta ninguna se sirve lo último bueno con su hora; si nunca
hubo nada, `disponible: false` y el móvil no enseña nada.

Caché de 12 min por zona y, tras un fallo, 2 min sin volver a preguntar: con
quince móviles pidiendo, al servicio de fuera le llega una petición, no quince.
"""
from __future__ import annotations

import os
import threading
import time
from typing import Any

import httpx

TTL_S = 12 * 60
REINTENTO_S = 120
TIMEOUT_S = 4.0
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

#: Una estación que lleva más de media hora sin dato no dice lo que hace ahora.
ESTACION_VIEJA_S = 30 * 60
#: Lluvia fuerte: 4 mm/h (1 mm en un cuarto de hora). Ya empapa en minutos.
LLUVIA_FUERTE_MM_H = 4.0
#: Rachas que tiran a alguien en un collado o arrancan ramas.
RACHA_FUERTE_KMH = 50.0
#: Los avisos miran las próximas dos horas.
HORIZONTE_S = 2 * 3600
#: El viento, sólo la próxima hora: a más distancia el aviso no ayuda y cansa.
HORIZONTE_VIENTO_S = 3600
HORAS_DE_PREVISION = 6

_TORMENTA = {95, 96, 99}

_CERROJO = threading.Lock()
_CACHE: dict[str, Any] = {}


def cielo(codigo: Any) -> str | None:
    """Código WMO -> una palabra que el móvil traduce."""
    try:
        c = int(codigo)
    except (TypeError, ValueError):
        return None
    if c <= 1:
        return "despejado"
    if c <= 3:
        return "nubes"
    if c in (45, 48):
        return "niebla"
    if 51 <= c <= 57:
        return "llovizna"
    if 71 <= c <= 77 or c in (85, 86):
        return "nieve"
    if c in _TORMENTA:
        return "tormenta"
    if 61 <= c <= 82:
        return "lluvia"
    return None


def _num(valor: Any) -> float | None:
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return None
    return n if n == n else None  # fuera NaN


def de_la_estacion(datos: Any, ahora: float) -> dict | None:
    """Lo medido, de un `/api/weather` de MeteoCatoira. None si no vale."""
    if not isinstance(datos, dict):
        return None
    edad = _num(datos.get("data_age_sec"))
    if edad is not None and edad > ESTACION_VIEJA_S:
        return None
    temp = _num(datos.get("temp"))
    if temp is None:
        return None
    lluvia = _num(datos.get("rain_rate"))
    return {
        "temp": temp,
        "viento": _num(datos.get("wind")),
        "racha": _num(datos.get("gust")),
        "dir": _num(datos.get("wind_deg")),
        "lluvia_mm_h": lluvia,
        "cielo": "lluvia" if (lluvia or 0) > 0 else None,
    }


def _serie(bloque: dict, clave: str, n: int) -> list:
    valores = bloque.get(clave) if isinstance(bloque, dict) else None
    valores = list(valores) if isinstance(valores, list) else []
    return (valores + [None] * n)[:n]


def de_open_meteo(datos: Any, ahora: float) -> dict | None:
    """Ahora, próximas horas y avisos de una respuesta de Open-Meteo (`timeformat=unixtime`)."""
    if not isinstance(datos, dict):
        return None
    actual = datos.get("current") if isinstance(datos.get("current"), dict) else {}
    horario = datos.get("hourly") if isinstance(datos.get("hourly"), dict) else {}
    cuartos = datos.get("minutely_15") if isinstance(datos.get("minutely_15"), dict) else {}

    tiempos_h = [t for t in (horario.get("time") or []) if _num(t) is not None]
    n = len(tiempos_h)
    temps, codigos, lluvias, probs, rachas = (
        _serie(horario, k, n)
        for k in ("temperature_2m", "weather_code", "precipitation", "precipitation_probability", "wind_gusts_10m")
    )
    horas = []
    for i, t in enumerate(tiempos_h):
        # La lluvia horaria de Open-Meteo es la de la hora ANTERIOR a `t`.
        if t + 3600 <= ahora:
            continue
        horas.append({
            "hora": int(t) * 1000,
            "temp": _num(temps[i]),
            "cielo": cielo(codigos[i]),
            "prob_lluvia": _num(probs[i]),
            "lluvia_mm": _num(lluvias[i]),
            "racha": _num(rachas[i]),
        })

    ahora_modelo = None
    if _num(actual.get("temperature_2m")) is not None:
        ahora_modelo = {
            "temp": _num(actual.get("temperature_2m")),
            "viento": _num(actual.get("wind_speed_10m")),
            "racha": _num(actual.get("wind_gusts_10m")),
            "dir": _num(actual.get("wind_direction_10m")),
            "lluvia_mm_h": None,
            "cielo": cielo(actual.get("weather_code")),
        }

    tiempos_q = [t for t in (cuartos.get("time") or []) if _num(t) is not None]
    lluvia_q = _serie(cuartos, "precipitation", len(tiempos_q))
    return {
        "ahora": ahora_modelo,
        "horas": horas[:HORAS_DE_PREVISION],
        "cuartos": [(int(t), _num(mm)) for t, mm in zip(tiempos_q, lluvia_q)],
        "horas_todas": [
            (int(t), _num(codigos[i]), _num(lluvias[i]), _num(rachas[i])) for i, t in enumerate(tiempos_h)
        ],
    }


def calcular_avisos(medido: dict | None, modelo: dict | None, ahora: float) -> list[dict]:
    """Un aviso por tipo (lluvia, tormenta, viento), el más cercano, en las próximas 2 h."""
    primero: dict[str, float] = {}

    def anotar(tipo: str, desde: float) -> None:
        en = max(0.0, desde - ahora)
        tope = HORIZONTE_VIENTO_S if tipo == "viento" else HORIZONTE_S
        if en <= tope and (tipo not in primero or en < primero[tipo]):
            primero[tipo] = en

    if medido:
        if (medido.get("lluvia_mm_h") or 0) >= LLUVIA_FUERTE_MM_H:
            anotar("lluvia", ahora)
        if (medido.get("racha") or 0) >= RACHA_FUERTE_KMH:
            anotar("viento", ahora)
    if modelo:
        for fin, mm in modelo.get("cuartos") or []:
            if fin > ahora and (mm or 0) * 4 >= LLUVIA_FUERTE_MM_H:
                anotar("lluvia", fin - 900)
        for t, codigo, mm, racha in modelo.get("horas_todas") or []:
            if t + 3600 <= ahora:
                continue
            if codigo in _TORMENTA:
                anotar("tormenta", t)
            if (mm or 0) >= LLUVIA_FUERTE_MM_H:
                anotar("lluvia", t - 3600)
            if (racha or 0) >= RACHA_FUERTE_KMH:
                anotar("viento", t)
        ahora_m = modelo.get("ahora") or {}
        if (ahora_m.get("racha") or 0) >= RACHA_FUERTE_KMH:
            anotar("viento", ahora)
    orden = ("tormenta", "lluvia", "viento")
    return [{"tipo": tipo, "en_min": int(round(primero[tipo] / 60))} for tipo in orden if tipo in primero]


def _pedir_json(cliente, url: str, params: dict | None = None) -> Any:
    try:
        respuesta = cliente.get(url, params=params)
        if respuesta.status_code != 200:
            return None
        return respuesta.json()
    except (httpx.HTTPError, ValueError):
        return None


def consultar(lat: float, lon: float, cliente=None, ahora: float | None = None) -> dict | None:
    """Pide a las fuentes configuradas y junta lo que haya. None si no contesta ninguna."""
    ahora = time.time() if ahora is None else ahora
    url_estacion = (os.getenv("SAGA_TIEMPO_URL") or "").strip()
    usar_modelo = (os.getenv("SAGA_TIEMPO_OPENMETEO") or "1").strip() != "0"
    url_modelo = (os.getenv("SAGA_TIEMPO_OPENMETEO_URL") or "").strip() or OPEN_METEO_URL

    propio = cliente is None
    if propio:
        cliente = httpx.Client(timeout=httpx.Timeout(TIMEOUT_S), follow_redirects=True)
    try:
        medido = de_la_estacion(_pedir_json(cliente, url_estacion), ahora) if url_estacion else None
        modelo = None
        if usar_modelo:
            modelo = de_open_meteo(
                _pedir_json(
                    cliente,
                    url_modelo,
                    {
                        "latitude": round(lat, 3),
                        "longitude": round(lon, 3),
                        "current": "temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m",
                        "hourly": "temperature_2m,weather_code,precipitation,precipitation_probability,wind_gusts_10m",
                        "minutely_15": "precipitation",
                        "forecast_hours": HORAS_DE_PREVISION + 1,
                        "forecast_minutely_15": 8,
                        "timeformat": "unixtime",
                    },
                ),
                ahora,
            )
    finally:
        if propio:
            cliente.close()

    ahora_modelo = (modelo or {}).get("ahora")
    if not medido and not ahora_modelo and not (modelo or {}).get("horas"):
        return None
    actual = dict(ahora_modelo or {})
    if medido:
        actual.update({k: v for k, v in medido.items() if v is not None})
        actual.setdefault("cielo", None)
    return {
        "disponible": True,
        "actualizado": int(ahora * 1000),
        "fuente": "estacion" if medido else "modelo",
        "ahora": actual or None,
        "horas": (modelo or {}).get("horas") or [],
        "avisos": calcular_avisos(medido, modelo, ahora),
    }


def tiempo_para(lat: float, lon: float, cliente=None, reloj=time.time) -> dict:
    """`consultar` con caché por zona. Sin nada que dar: `{"disponible": False}`."""
    clave = (round(lat, 2), round(lon, 2))
    # ponytail: un cerrojo global, la petición de fuera se hace con él cogido; con
    # una sola misión por servidor no hace falta uno por zona.
    with _CERROJO:
        ahora = reloj()
        guardado = _CACHE if _CACHE.get("clave") == clave else {}
        espera = TTL_S if guardado.get("ok") else REINTENTO_S
        if guardado and ahora - guardado["pedido"] < espera:
            return guardado.get("datos") or {"disponible": False}
        nuevo = consultar(lat, lon, cliente=cliente, ahora=ahora)
        datos = nuevo or guardado.get("datos")
        _CACHE.clear()
        _CACHE.update({"clave": clave, "pedido": ahora, "ok": nuevo is not None, "datos": datos})
        return datos or {"disponible": False}


def olvidar() -> None:
    with _CERROJO:
        _CACHE.clear()
