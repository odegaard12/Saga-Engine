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
import math
from datetime import datetime

from backend.app.runtime.core_engine import _as_str, _positive_int, read_stage_item_requirement
from backend.app.runtime.entradas import entero_seguro

#: Más objetos que esto en una mochila no es una mochila, es un ataque.
MAX_OBJETOS_EN_MOCHILA = 200


def _valor_simple(valor, maximo_texto=300):
    """El valor si es un escalar JSON razonable; si no, None. `nan`/`inf` -> None."""
    if isinstance(valor, str):
        return valor[:maximo_texto]
    if isinstance(valor, bool) or valor is None:
        return valor
    if isinstance(valor, int):
        return valor
    if isinstance(valor, float):
        return valor if math.isfinite(valor) else None
    return None


def sanear_mochila(snapshot):
    """La mochila que sube el móvil (o escribe el organizador), con su forma.

    La copia del móvil llegaba tal cual y se guardaba sin mirar. Una marca
    `reset_at` con basura, un `items` que no era una lista o un objeto con
    `quantity: Infinity` abortaban `/api/events/sync` entero y tumbaban después
    `give_item`/`remove_item` del panel (caza de fallos S16). Se conservan las
    claves de texto/número del nivel superior y, de cada objeto, todas las suyas
    que sean escalares; `item_id`, `label`, `state` y `quantity` se fuerzan a su
    tipo.
    """
    if not isinstance(snapshot, dict):
        return {"items": []}

    limpia = {}
    for clave, valor in snapshot.items():
        if clave == "items" or not isinstance(clave, str):
            continue
        if clave == "reset_at":
            limpia[clave] = entero_seguro(valor, 0, minimo=0)
            continue
        simple = _valor_simple(valor)
        if simple is not None or valor is None:
            limpia[clave[:80]] = simple

    objetos = []
    brutos = snapshot.get("items")
    if isinstance(brutos, list):
        for bruto in brutos[:MAX_OBJETOS_EN_MOCHILA]:
            if not isinstance(bruto, dict):
                continue
            item_id = _as_str(bruto.get("item_id")).strip()[:120]
            if not item_id:
                continue
            objeto = {}
            for clave, valor in bruto.items():
                if isinstance(clave, str) and clave not in {"item_id", "label", "state", "quantity"}:
                    simple = _valor_simple(valor, 200)
                    if simple is not None:
                        objeto[clave[:80]] = simple
            objeto["item_id"] = item_id
            objeto["label"] = _as_str(bruto.get("label")).strip()[:160] or item_id
            objeto["state"] = _as_str(bruto.get("state")).strip()[:40] or "collected"
            objeto["quantity"] = entero_seguro(bruto.get("quantity"), 1, minimo=0, maximo=9999)
            objetos.append(objeto)

    limpia["items"] = objetos
    return limpia


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


def _iso_a_ms(valor):
    texto = _as_str(valor).strip()
    if not texto:
        return 0
    try:
        return int(datetime.fromisoformat(texto.replace("Z", "+00:00")).timestamp() * 1000)
    except (TypeError, ValueError, OverflowError, OSError):
        return 0


def momento_del_evento_ms(evento):
    """Cuándo PASÓ un evento: la hora del móvil al encolarlo, o la del servidor.

    Lo que se recoge sin cobertura llega al servidor mucho después; para saber
    si es de antes o de después de un reinicio cuenta cuándo se recogió.
    """
    payload = payload_del_evento(evento)
    return _iso_a_ms(payload.get("local_created_at")) or _iso_a_ms(
        evento.get("created_at") if isinstance(evento, dict) else None
    )


def clave_de_entrega(evento):
    """La clave de una entrega única (premio de un nodo, coleccionable, receta), o ''."""
    return _as_str(payload_del_evento(evento).get("grant_id")).strip()


def marca_de_inventario(copia):
    """Desde cuándo cuentan los eventos de mochila (0 = desde siempre).

    `inventory_reset_at` la pone sólo el panel al reiniciar a alguien o vaciarle
    la mochila. Bases anteriores a separar las marcas: vale `reset_at`.
    """
    copia = copia if isinstance(copia, dict) else {}
    if "inventory_reset_at" in copia:
        return entero_seguro(copia.get("inventory_reset_at"), 0, minimo=0)
    return entero_seguro(copia.get("reset_at"), 0, minimo=0)


def eventos_vigentes(eventos, reset_at_ms=0):
    """Los eventos de la partida actual: los de antes del último reinicio sobran.

    Sin esto, un objeto recogido antes de un «Reset» del organizador seguía
    contando para abrir nodos en el servidor aunque el móvil lo hubiera tirado.
    Un evento sin hora legible se conserva: más vale contar de más que dejar a
    alguien sin un objeto que sí recogió.
    """
    reset = entero_seguro(reset_at_ms, 0, minimo=0)
    if not reset:
        return list(eventos or [])
    vigentes = []
    for evento in eventos or []:
        momento = momento_del_evento_ms(evento)
        if momento and momento < reset:
            continue
        vigentes.append(evento)
    return vigentes


def _es_gasto(evento):
    tipo = _as_str(evento.get("type")).strip()
    accion = _as_str(payload_del_evento(evento).get("inventory_action")).strip().lower()
    return tipo == "inventory_item_used" or accion in {"used", "spent", "consumed", "used_by_backend"}


def _es_recogida(evento):
    tipo = _as_str(evento.get("type")).strip()
    accion = _as_str(payload_del_evento(evento).get("inventory_action")).strip().lower()
    # Los escaneos del jugador llegan como qr_scanned o nfc_url_opened con
    # inventory_action=collected dentro.
    return tipo == "inventory_item_collected" or accion == "collected"


def _recuento_por_eventos(eventos, item_key):
    """(recogidos, gastados) de un objeto según el registro de eventos.

    Una entrega con `grant_id` (el premio de un minijuego, un coleccionable, lo
    gastado al fabricar) cuenta UNA vez aunque llegue repetida: el servidor la
    anota al aceptar el avance y el móvil la vuelve a mandar por su cola, y las
    dos son la misma.
    """
    recogidos = 0
    gastados = 0
    vistas = set()

    for evento in eventos or []:
        if not isinstance(evento, dict) or item_del_evento(evento) != item_key:
            continue

        gasto = _es_gasto(evento)
        if not gasto and not _es_recogida(evento):
            continue

        clave = clave_de_entrega(evento)
        if clave:
            marca = (clave, gasto)
            if marca in vistas:
                continue
            vistas.add(marca)

        if gasto:
            gastados += cantidad_del_evento(evento, 1)
        else:
            recogidos += cantidad_del_evento(evento, 1)

    return recogidos, gastados


def _unidades_en_la_copia(inventario_del_movil, item_key):
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
    return en_el_movil


def contar_objeto(eventos, inventario_del_movil, user, item_id):
    """Cuántas unidades de un objeto tiene alguien.

    `eventos` es el registro de ese jugador y `inventario_del_movil` la copia
    que subió. Se pasan de fuera para que esto no sepa nada de dónde están
    guardados. Los eventos de antes del último reinicio (`reset_at` de la
    copia) no cuentan.
    """
    user_key = _as_str(user).strip()
    item_key = _as_str(item_id).strip()

    if not user_key or not item_key:
        return 0

    copia = inventario_del_movil if isinstance(inventario_del_movil, dict) else {}
    vigentes = eventos_vigentes(eventos, marca_de_inventario(copia))
    recogidos, gastados = _recuento_por_eventos(vigentes, item_key)

    # Lo forjado en la mesa de trabajo por un móvil viejo no deja evento: sólo
    # aparece aquí.
    en_el_movil = _unidades_en_la_copia(copia, item_key)

    # El MAYOR de los dos, no la suma: un objeto que aparece en las dos fuentes
    # es el mismo objeto. Y después se descuenta lo gastado.
    return max(0, max(recogidos, en_el_movil) - gastados)


def ya_entregado(eventos, grant_id, reset_at_ms=0):
    """¿Esta entrega (`grant_id`) ya está anotada en la partida actual?"""
    clave = _as_str(grant_id).strip()
    if not clave:
        return False
    for evento in eventos_vigentes(eventos, reset_at_ms):
        if isinstance(evento, dict) and clave_de_entrega(evento) == clave and _es_recogida(evento):
            return True
    return False


def mochila_para_el_movil(copia, eventos):
    """La mochila que se le devuelve al móvil: su copia + lo que dicen los eventos.

    La copia del móvil vive en el `localStorage` del navegador. Si se borra la
    caché, se cambia de móvil o se cierra sesión, la copia del servidor puede no
    tener lo recogido sin cobertura que sí llegó por la cola de eventos. Aquí
    se completa: cada objeto con unidades según el recuento (eventos + copia -
    gastado) que falte o esté de menos en la copia se pone con esas unidades.
    El móvil (`hydrateInventoryFromServer`) sólo incorpora ids que no tenga, así
    que esto nunca pisa ni resucita lo que el jugador ya gastó en su móvil.
    """
    base = copia if isinstance(copia, dict) else {}
    resultado = dict(base)
    objetos = [dict(o) for o in base.get("items") or [] if isinstance(o, dict)]
    vigentes = eventos_vigentes(eventos, marca_de_inventario(base))

    ids = []
    etiquetas = {}
    for evento in vigentes:
        if not isinstance(evento, dict):
            continue
        item_id = item_del_evento(evento)
        if not item_id:
            continue
        if item_id not in etiquetas:
            ids.append(item_id)
            etiquetas[item_id] = item_id
        etiqueta = _as_str(payload_del_evento(evento).get("inventory_label")).strip()
        if etiqueta:
            etiquetas[item_id] = etiqueta[:160]

    for item_id in ids:
        recogidos, gastados = _recuento_por_eventos(vigentes, item_id)
        unidades = max(0, max(recogidos, _unidades_en_la_copia(base, item_id)) - gastados)
        if unidades <= 0:
            continue
        existente = next((o for o in objetos if _as_str(o.get("item_id")).strip() == item_id), None)
        if existente is None:
            if len(objetos) >= MAX_OBJETOS_EN_MOCHILA:
                break
            objetos.append({
                "item_id": item_id,
                "label": etiquetas.get(item_id) or item_id,
                "state": "collected",
                "quantity": unidades,
                "source": "system",
            })
        elif _as_str(existente.get("state")).strip().lower() == "used" or _positive_int(
            existente.get("quantity"), 1
        ) < unidades:
            existente["state"] = "collected"
            existente["quantity"] = unidades

    resultado["items"] = objetos

    # Las entregas únicas (premio, coleccionable, «Dar objeto» del panel) con su
    # clave: el móvil suma las que no tenga apuntadas aunque ya lleve ese objeto
    # (ver hydrateInventoryFromServer). Sólo ids y cantidades: nada personal.
    entregas = []
    vistas = set()
    for evento in vigentes:
        if not isinstance(evento, dict) or not _es_recogida(evento):
            continue
        clave = clave_de_entrega(evento)
        item_id = item_del_evento(evento)
        if not clave or not item_id or clave in vistas:
            continue
        vistas.add(clave)
        entregas.append({
            "grant_id": clave[:160],
            "item_id": item_id,
            "label": etiquetas.get(item_id) or item_id,
            "quantity": cantidad_del_evento(evento, 1),
        })
    resultado["grants"] = entregas[-MAX_OBJETOS_EN_MOCHILA:]
    return resultado


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
