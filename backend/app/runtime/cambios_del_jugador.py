"""«El organizador ha tocado tu partida»: una revisión por jugador y una escucha larga para enterarse en segundos.

Antes el móvil sólo se enteraba de un «+1 min», un «+1 nodo» o un «retroceder» en su siguiente latido (30-90 s), y
del tiempo sumado, en el refresco de seguridad de 10 min. Ahora:

- Cada acción del panel sobre un jugador sube su revisión (`marcar`). Va en memoria con una ÉPOCA aleatoria por
  arranque: tras un reinicio o un salto de la VIP a la otra Pi la revisión es otra, y el móvil vuelve a pedir su
  estado una vez (unos 2 KB) en vez de fiarse de una cifra que la otra Pi no conoce. Nada que replicar entre Pis.
- El latido devuelve la revisión (`rev`): sin escucha (pantalla apagada, iPhone en segundo plano) llega igual.
- Con la app a la vista, `GET /api/jugador/cambios?desde=<rev>` se queda esperando hasta `ESPERA_MAXIMA_S`:
  contesta 200 `{rev}` en cuanto cambia y 204 (sin cuerpo) si no pasa nada. El LATIDO del jugador también la suelta
  con un 204 (`soltar`): así la escucha se renueva en la misma ventana de radio que el latido y no despierta el móvil
  por su cuenta mientras juega (latido cada 30 s < espera de 55 s).

Un solo proceso de uvicorn (ver Dockerfile): todo esto vive en memoria de ese proceso. Una escucha por jugador: la
nueva suelta a la anterior, así un móvil con dos pestañas o un reintento no apila esperas.
"""
import asyncio
import secrets
import threading
import time

#: Lo que se sostiene una escucha. Cloudflare corta a los 100 s sin respuesta; 55 s deja margen de sobra.
ESPERA_MAXIMA_S = 55.0
#: Entre dos escuchas del mismo jugador y la misma IP, como poco (un bucle roto en el móvil no tumba la Pi).
INTERVALO_MINIMO_S = 1.0

EPOCA = secrets.token_hex(3)
_revisiones: dict[str, int] = {}
_esperas: dict[str, tuple[asyncio.AbstractEventLoop, asyncio.Event]] = {}
_ultima_escucha: dict[str, float] = {}
_cerrojo = threading.Lock()


def _clave(perfil_id) -> str:
    return str(perfil_id or "").strip().casefold()


def _rev_de(clave: str) -> str:
    return f"{EPOCA}.{_revisiones.get(clave, 0)}"


def _despertar(clave: str) -> None:
    """Con el cerrojo tomado: suelta la escucha de ese jugador, si hay."""
    espera = _esperas.pop(clave, None)
    if espera is not None:
        bucle, evento = espera
        try:
            bucle.call_soon_threadsafe(evento.set)
        except RuntimeError:  # bucle ya cerrado (fin de pruebas)
            pass


def rev(perfil_id) -> str:
    with _cerrojo:
        return _rev_de(_clave(perfil_id))


def marcar(perfil_id) -> str:
    """El panel cambió algo de este jugador. Seguro desde cualquier hilo."""
    clave = _clave(perfil_id)
    with _cerrojo:
        _revisiones[clave] = _revisiones.get(clave, 0) + 1
        _despertar(clave)
        return _rev_de(clave)


def soltar(perfil_id) -> None:
    """Su latido acaba de llegar: la escucha contesta 204 y el móvil la renueva con la radio ya despierta."""
    with _cerrojo:
        _despertar(_clave(perfil_id))


def ritmo(clave_ip: str, ahora: float | None = None) -> int:
    """Segundos a esperar si esta IP+jugador abre escuchas demasiado seguidas; 0 si puede."""
    ahora = time.monotonic() if ahora is None else ahora
    with _cerrojo:
        ultima = _ultima_escucha.get(clave_ip)
        if ultima is not None and ahora - ultima < INTERVALO_MINIMO_S:
            return 2
        _ultima_escucha[clave_ip] = ahora
        if len(_ultima_escucha) > 5000:
            for vieja in [k for k, v in _ultima_escucha.items() if ahora - v > 600]:
                _ultima_escucha.pop(vieja, None)
    return 0


async def esperar(perfil_id, desde: str, espera_s: float | None = None) -> str | None:
    """La revisión nueva si es distinta de `desde` (al momento o en cuanto cambie); None si se agotó o la soltaron."""
    clave = _clave(perfil_id)
    evento = asyncio.Event()
    with _cerrojo:
        actual = _rev_de(clave)
        if desde != actual:
            return actual
        _despertar(clave)
        _esperas[clave] = (asyncio.get_running_loop(), evento)
    try:
        await asyncio.wait_for(evento.wait(), espera_s or ESPERA_MAXIMA_S)
    except asyncio.TimeoutError:
        pass
    finally:
        with _cerrojo:
            if _esperas.get(clave, (None, None))[1] is evento:
                _esperas.pop(clave, None)
    nueva = rev(perfil_id)
    return nueva if nueva != desde else None


def olvidar_todo() -> None:
    """Para las pruebas."""
    with _cerrojo:
        _revisiones.clear()
        _esperas.clear()
        _ultima_escucha.clear()
