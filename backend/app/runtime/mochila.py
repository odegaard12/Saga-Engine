"""La mochila del jugador: qué lleva y si le sirve para abrir un nodo.

Quinta tajada de sacar cosas de `main.py`.

Lo importante de este fichero, y lo que cuesta de entender cuando está mezclado
con lo demás: **la mochila no se guarda como una lista, se reconstruye**. Sale de
sumar los eventos —recogido, gastado— y de contrastarlos con la copia que sube
el móvil. Son dos fuentes, y ninguna sobra:

- Los **eventos** cubren lo que se recoge en un nodo, que el servidor sí ve.
- La **copia del móvil** cubre lo que se forja en la mesa de trabajo, que ocurre
  entero en el teléfono y no genera ningún evento.

Por eso se toma el mayor de los dos y luego se resta lo gastado, en vez de
sumarlos: sumarlos contaría dos veces un objeto que aparece en ambos.
"""
from backend.app.runtime.core_engine import _as_str, _positive_int, read_stage_item_requirement


def payload_del_evento(event):
    payload = event.get("payload") if isinstance(event, dict) else {}
    return payload if isinstance(payload, dict) else {}


def item_del_evento(event):
    """Qué objeto toca este evento.

    Se miran tres nombres porque cada parte del sistema lo ha ido guardando con
    el suyo: los eventos del servidor, los escaneos del móvil y la mochila local.
    """
    payload = payload_del_evento(event)
    return _as_str(
        payload.get("inventory_item_id") or payload.get("item_id") or payload.get("id")
    ).strip()


def cantidad_del_evento(event, defecto=1):
    payload = payload_del_evento(event)

    for clave in ("inventory_quantity", "quantity", "delta"):
        if clave in payload:
            return _positive_int(payload.get(clave), defecto)

    return defecto


def contar_objeto(eventos, inventario_del_movil, user, item_id):
    """Cuántas unidades de un objeto tiene alguien.

    `eventos` es el registro de ese jugador y `inventario_del_movil` la copia
    que subió. Se pasan de fuera para que esto no sepa nada de dónde están
    guardados.
    """
    user_key = _as_str(user).strip()
    item_key = _as_str(item_id).strip()

    if not user_key or not item_key:
        return 0

    recogidos = 0
    gastados = 0

    for evento in eventos or []:
        if item_del_evento(evento) != item_key:
            continue

        tipo = _as_str(evento.get("type")).strip()
        accion = _as_str(payload_del_evento(evento).get("inventory_action")).strip().lower()

        if tipo == "inventory_item_used" or accion in {"used", "spent", "consumed"}:
            gastados += cantidad_del_evento(evento, 1)
        elif tipo == "inventory_item_collected":
            recogidos += cantidad_del_evento(evento, 1)
        elif accion == "collected":
            # Los escaneos del jugador llegan como qr_scanned o nfc_url_opened
            # con inventory_action=collected dentro.
            recogidos += cantidad_del_evento(evento, 1)

    # Lo forjado en la mesa de trabajo ocurre entero en el móvil y no deja
    # evento: sólo aparece aquí.
    en_el_movil = 0
    copia = inventario_del_movil if isinstance(inventario_del_movil, dict) else {}
    objetos = copia.get("items")

    if isinstance(objetos, list):
        for objeto in objetos:
            if not isinstance(objeto, dict):
                continue
            if _as_str(objeto.get("item_id")).strip() != item_key:
                continue
            if _as_str(objeto.get("state")).strip().lower() == "used":
                continue
            en_el_movil += _positive_int(objeto.get("quantity"), 1)

    # El MAYOR de los dos, no la suma: un objeto que aparece en las dos fuentes
    # es el mismo objeto. Y después se descuenta lo gastado.
    return max(0, max(recogidos, en_el_movil) - gastados)


def evaluar_requisito(raw_stage, unidades_que_tiene):
    """¿Puede abrirse este nodo con lo que lleva encima?

    `unidades_que_tiene` se calcula fuera para que esto no dependa del registro
    de eventos y se pueda razonar de un vistazo.
    """
    requisito = read_stage_item_requirement(raw_stage)

    if not requisito:
        return {
            "required": False,
            "ok": True,
            "owned": 0,
            "required_quantity": 0,
            "item_id": "",
            "label": "",
            "consume": False,
        }

    # Con .get() en lugar de indexar: a un requisito al que le falte una clave
    # debe poder bloquear el nodo, nunca tumbar /api/advance con un 500. Un
    # error aquí es invisible para el jugador, porque el móvil cae a su copia
    # local y sigue como si nada mientras el servidor se queda atrás.
    item_id = str(requisito.get("item_id") or "").strip()
    hacen_falta = _positive_int(requisito.get("quantity"), 1)

    return {
        "required": True,
        "ok": unidades_que_tiene >= hacen_falta,
        "owned": unidades_que_tiene,
        "required_quantity": hacen_falta,
        "item_id": item_id,
        "label": str(requisito.get("label") or item_id),
        "consume": bool(requisito.get("consume", False)),
    }
