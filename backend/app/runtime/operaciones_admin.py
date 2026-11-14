"""Idempotencia de las acciones del panel sobre un jugador.

Con poca cobertura una petición del panel puede aplicarse en el servidor y perderse la RESPUESTA: el organizador
no ve el «hecho», pulsa otra vez (o el panel reintenta solo) y «+1 nodo» sube dos nodos, «sumar tiempo» suma dos
veces. Cada acción lleva un `op_id` que genera el panel UNA vez; el servidor anota el resultado y, si le llega el
mismo `op_id` de nuevo, devuelve ese resultado sin repetir nada.

Se guarda en `admin_ops.json` (diccionario `op_id -> {at, user, accion, resultado}`), con tope de tamaño y de
edad. Quien llama lo hace bajo el candado del jugador, así que dos reintentos a la vez no se cruzan.
"""
import re
import time

from backend.app.storage.json_store import load_json, update_json

#: Cuánto se recuerda una operación (un reintento llega en minutos, no en días).
EDAD_MAXIMA_S = 24 * 3600
#: Cuántas operaciones se guardan como mucho (las más recientes).
MAXIMO = 500

_ID_VALIDO = re.compile(r"^[A-Za-z0-9_.:-]{8,64}$")


class OperacionReutilizada(Exception):
    """El mismo `op_id` llegó para OTRA acción: un fallo del cliente, no un reintento. No se aplica ni se devuelve nada."""


def _clave(op_id: str, user: str) -> str:
    """Una operación es de UN jugador: el mismo `op_id` para otro jugador es otra operación (no se pisan)."""
    return f"{user}|{op_id}"


def id_valido(op_id) -> str:
    """El `op_id` limpio, o '' si no lo es (entonces la acción va sin idempotencia, como siempre)."""
    texto = str(op_id or "").strip()
    return texto if _ID_VALIDO.match(texto) else ""


def buscar(db, op_id: str, user: str, accion: str | None = None):
    """El resultado anotado de esta operación para este jugador, o None. Otro jugador con el mismo id no cuenta.

    Con `accion`, si el id ya se usó para una acción DISTINTA lanza `OperacionReutilizada`: repetir un id con otra acción
    no es un reintento y devolverle el resultado de la primera la daría por hecha sin aplicarla.
    """
    if not op_id:
        return None
    ops = load_json(db, {})
    entrada = ops.get(_clave(op_id, user)) if isinstance(ops, dict) else None
    if not isinstance(entrada, dict):
        return None
    if accion is not None and str(entrada.get("accion")) != str(accion)[:60]:
        raise OperacionReutilizada(op_id)
    resultado = entrada.get("resultado")
    return dict(resultado) if isinstance(resultado, dict) else None


def anotar(db, op_id: str, user: str, accion: str, resultado: dict, ahora_s: float | None = None) -> None:
    """Anota lo que dio una operación y poda las viejas o las que sobran."""
    if not op_id:
        return
    ahora = int(ahora_s if ahora_s is not None else time.time())

    def _actualizar(ops):
        ops = ops if isinstance(ops, dict) else {}
        ops[_clave(op_id, user)] = {"at": ahora, "user": str(user), "accion": str(accion)[:60], "resultado": resultado}
        for clave in [k for k, v in ops.items() if not isinstance(v, dict) or ahora - int(v.get("at") or 0) > EDAD_MAXIMA_S]:
            ops.pop(clave, None)
        if len(ops) > MAXIMO:
            for clave, _ in sorted(ops.items(), key=lambda kv: int((kv[1] or {}).get("at") or 0))[: len(ops) - MAXIMO]:
                ops.pop(clave, None)
        return ops

    update_json(db, {}, _actualizar)
