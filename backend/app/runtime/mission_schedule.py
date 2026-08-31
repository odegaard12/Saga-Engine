"""Cuándo puede EMPEZAR a jugarse la misión.

Un valor opcional en la configuración -`mission_launch_at`, ISO 8601- que
deja a la gente descargar la misión offline y conceder permisos con días de
antelación (eso no toca nada de aquí: sigue funcionando siempre), pero no
completar nodos hasta que llegue esa fecha.

Se mira en DOS caminos de avance -`/api/advance`, el de con cobertura, y
`node_completed` en la cola offline, el de sin ella- y los dos tienen que
estar de acuerdo en la misma respuesta: por eso vive aquí y no duplicado en
cada uno.

Se compara contra la hora del SERVIDOR, no la del móvil: el reloj de un
teléfono se cambia en dos toques, y ese es justo el hueco que esto tiene que
cerrar. `/api/config` manda su propia hora (`server_time_ms`) para que el
cliente pueda pintar la cuenta atrás sin fiarse del reloj del aparato.
"""
from datetime import datetime, timezone


def parse_launch_at(value):
    """La fecha de la config, como datetime con zona -o None si no hay o no vale."""
    text = str(value or "").strip()
    if not text:
        return None

    # datetime.fromisoformat no entiende el "Z" de UTC hasta Python 3.11;
    # admitirlo a mano cubre lo que manda un <input type="datetime-local">
    # y lo que devuelve JSON.stringify(new Date()) por igual.
    normalizado = text[:-1] + "+00:00" if text.endswith("Z") else text

    try:
        momento = datetime.fromisoformat(normalizado)
    except ValueError:
        return None

    if momento.tzinfo is None:
        # Sin zona: es lo que manda el <input type="datetime-local"> del
        # panel, en la hora LOCAL de quien lo escribió. Se asume la del
        # servidor -no hay otra referencia razonable- para no comparar horas
        # de dos husos distintos sin saberlo.
        momento = momento.astimezone()

    return momento


def mission_is_locked(launch_at_raw, now=None):
    """¿Toca esperar todavía para completar nodos?"""
    momento = parse_launch_at(launch_at_raw)
    if momento is None:
        return False

    ahora = now or datetime.now(timezone.utc)
    return ahora < momento
