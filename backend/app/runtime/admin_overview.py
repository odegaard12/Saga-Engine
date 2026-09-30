"""El resumen que ve el panel: un nodo o un jugador, aplanados para la tabla.

`GET /api/admin/react-overview` necesita, por cada nodo y cada jugador, una
ficha ligera y ya normalizada -no el documento entero de la misión-. Movido
de main.py para seguir bajando sus símbolos de superficie (ver
docs/plan-de-mejora.md, «Deuda que no corre prisa»).

Puro por diseño: no lee ni escribe nada, sólo aplana lo que ya le pasan.
"""
from backend.app.runtime.core_engine import (
    normalize_stage,
    preserve_physical_stage_fields,
    stage_has_manual_fallback,
)
from backend.app.runtime.game_registry import GAMES, GAMES_BY_ID
from backend.app.runtime.minigames import (
    MINIGAME_SPECS,
    SUPPORTED_MINIGAME_TYPES,
    _as_str,
    normalize_minigame_config,
)

#: Campos del nodo (a nivel de nodo, no de config) que el editor necesita ver y
#: que la ficha normalizada tira: requisito de objeto, código de emergencia,
#: premio, tarjeta QR. Por nombre exacto o por prefijo.
_CAMPOS_DE_NODO_EXACTOS = (
    "requires_item",
    "consume_required_item",
    "requiredItemId",
    "success_code",
    "success_message",
    "fallback_code",
    "physical_fallback_code",
    "answer",
    "rune",
)
_PREFIJOS_DE_NODO = ("required_item_", "reward_item_", "qr_card_")


def _config_original(fuente):
    """La config que el editor guardó en el nodo, sin normalizar.

    Misma mezcla que `normalize_stage`: la copia de `minigame.config` como base y
    `config` (lo que edita el editor guiado) por encima.
    """
    minijuego = fuente.get("minigame") if isinstance(fuente.get("minigame"), dict) else {}
    base = minijuego.get("config") if isinstance(minijuego.get("config"), dict) else {}
    encima = fuente.get("config") if isinstance(fuente.get("config"), dict) else {}
    interaccion = fuente.get("interaction") if isinstance(fuente.get("interaction"), dict) else {}
    de_interaccion = interaccion.get("config") if isinstance(interaccion.get("config"), dict) else {}
    return {**base, **de_interaccion, **encima}


def _conservar_claves_desconocidas(normalizada, original, game_id):
    """Añade a la config normalizada las claves que el normalizador tiró.

    Es la política `keep_unknown` del registro de minijuegos (ver
    `shared/game_registry.json` → `config_policy` y `conservarClavesDesconocidas`
    en familyConfigs.ts): el panel CONSERVA las claves que no conoce, salvo las
    que el registro declara para OTRO juego de la misma familia y no para éste
    (restos de un cambio de juego). Sin esto la ficha del panel no llevaba
    `required_item_*`, `success_code`, `reward_item_*` ni `qr_card_*`, y el
    editor los enseñaba vacíos (caza de fallos A5).
    """
    juego = GAMES_BY_ID.get(game_id)
    politica = (juego or {}).get("config_policy") or "keep_unknown"
    if politica == "strict":
        return normalizada

    familiares = [
        otro for otro in GAMES
        if juego and otro.get("id") != juego.get("id") and otro.get("family") == juego.get("family")
    ]
    propias = set((juego or {}).get("config_keys") or [])

    salida = dict(normalizada)
    for clave, valor in original.items():
        if clave in salida or valor is None:
            continue
        if juego and clave not in propias:
            if any(clave in (otro.get("config_keys") or []) for otro in familiares):
                continue
        salida[clave] = valor
    return salida


def _tiene_respaldo(node):
    try:
        return bool(stage_has_manual_fallback(node))
    except (KeyError, TypeError, AttributeError):
        # Un nodo a medias (sin `success`), como los de algunas pruebas.
        return False


def _campos_de_nodo(original):
    salida = {}
    for clave, valor in original.items():
        if clave in _CAMPOS_DE_NODO_EXACTOS or clave.startswith(_PREFIJOS_DE_NODO):
            salida[clave] = valor
    return salida


def admin_stage_summary(stage, index, raw_stage=None):
    """La ficha de un nodo para la tabla del panel.

    `raw_stage` es el nodo TAL COMO ESTÁ GUARDADO (sin normalizar). `stage` suele
    ser el normalizado (`get_runtime_stages`), que ya no lleva las claves que el
    normalizador tira; con el original a mano se devuelven también.
    """
    raw = stage if isinstance(stage, dict) else {}
    original = raw_stage if isinstance(raw_stage, dict) else None

    # get_runtime_stages() returns normalized runtime nodes.
    # Raw admin stages may still come through in tests, so support both shapes.
    node = raw if isinstance(raw, dict) and raw.get("version") == 2 else normalize_stage(raw)

    if original is None and raw.get("version") != 2:
        original = raw

    presentation = node.get("presentation") if isinstance(node.get("presentation"), dict) else {}
    location = node.get("location") if isinstance(node.get("location"), dict) else {}
    entry = node.get("entry") if isinstance(node.get("entry"), dict) else {}
    interaction = node.get("interaction") if isinstance(node.get("interaction"), dict) else {}
    messages = node.get("messages") if isinstance(node.get("messages"), dict) else {}

    raw_minigame = raw.get("minigame") if isinstance(raw.get("minigame"), dict) else {}

    family_type = _as_str(
        interaction.get("type")
        or raw_minigame.get("type")
        or raw.get("type")
        or "signal_hunt"
    ).strip().lower() or "signal_hunt"

    raw_family_type = family_type
    type_fallback_reason = ""
    if family_type not in SUPPORTED_MINIGAME_TYPES:
        type_fallback_reason = f"unsupported_minigame_type:{family_type}"
        family_type = "signal_hunt"

    raw_config = (
        interaction.get("config")
        if isinstance(interaction.get("config"), dict)
        else raw_minigame.get("config")
        if isinstance(raw_minigame.get("config"), dict)
        else raw.get("config")
        if isinstance(raw.get("config"), dict)
        else {}
    )
    config = normalize_minigame_config(family_type, raw_config)
    if original is not None:
        config = _conservar_claves_desconocidas(
            config,
            _config_original(original),
            _as_str(config.get("game_id")).strip(),
        )

    label = (
        _as_str(raw_minigame.get("label")).strip()
        or MINIGAME_SPECS.get(family_type, {}).get("label")
        or family_type.replace("_", " ").title()
    )

    title = _as_str(
        presentation.get("title")
        or raw.get("title")
        or f"NODE {index + 1}"
    ).strip()

    content = _as_str(
        presentation.get("content")
        or raw.get("content")
        or ""
    ).strip()

    lat = location.get("lat")
    if lat is None:
        lat = raw.get("lat")

    lon = location.get("lon")
    if lon is None:
        lon = raw.get("lon")

    radius = location.get("radius_m")
    if radius is None:
        radius = raw.get("radius", 50)

    entry_mode = _as_str(
        entry.get("mode")
        or raw.get("entry_mode")
        or "gps"
    ).strip().lower() or "gps"

    require_proximity = entry.get("require_proximity")
    if require_proximity is None:
        require_proximity = raw.get("require_proximity", entry_mode != "free")

    hint = _as_str(
        messages.get("hint")
        or raw.get("hint")
        or ""
    ).strip()

    gps_unavailable = _as_str(
        messages.get("gps_unavailable")
        or raw.get("gps_unavailable_message")
        or ""
    ).strip()

    locked = _as_str(
        messages.get("locked")
        or raw.get("locked_message")
        or ""
    ).strip()

    summary = {
        "id": raw.get("id", index),
        "index": index,
        "title": title,
        "type": family_type,
        "raw_type": raw_family_type,
        "type_fallback_reason": type_fallback_reason,
        "label": label,
        "lat": lat,
        "lon": lon,
        "radius": radius,
        "entry_mode": entry_mode,
        "require_proximity": bool(require_proximity),
        "has_hint": bool(hint),
        # De las condiciones ya normalizadas: `raw` suele ser el nodo normalizado,
        # que no lleva `answer`/`rune` sueltos, y esto salía siempre en falso.
        "has_manual_fallback": _tiene_respaldo(node),
        "content": content,
        "objective": _as_str(config.get("objective") or "").strip(),
        "config_summary": sorted(str(key) for key in config.keys())[:12],
        "config": config,
        "messages": {
            "hint": hint,
            "gps_unavailable": gps_unavailable,
            "locked": locked,
        },
        # El requisito de objeto ya normalizado (el editor lo necesita para
        # enseñar «necesita X» aunque venga de los campos sueltos del nodo).
        "requirements": node.get("requirements") if isinstance(node.get("requirements"), dict) else {"items": []},
    }

    if original is not None:
        summary.update(_campos_de_nodo(original))

    return preserve_physical_stage_fields(stage, summary)


def admin_profile_summary(profile, gamestate, positions, inventory_state=None):
    if inventory_state is None:
        inventory_state = {}
    profile = profile or {}
    profile_id = str(profile.get("id") or profile.get("display_name") or "")
    raw_state = gamestate.get(profile_id, {}) if isinstance(gamestate, dict) else {}
    pos = positions.get(profile_id, {}) if isinstance(positions, dict) else {}

    if isinstance(raw_state, dict):
        state = raw_state
        level = state.get("level", 0)
        finished = bool(state.get("finished", False))
    else:
        state = {}
        try:
            level = int(raw_state)
        except Exception:
            level = 0
        finished = False

    if not isinstance(pos, dict):
        pos = {}

    return {
        "id": profile_id,
        "display_name": profile.get("display_name") or profile_id,
        "mode": profile.get("mode") or "solo",
        "status": profile.get("status") or "active",
        "level": level,
        "finished": finished,
        "presence": pos.get("presence") or state.get("presence") or "unknown",
        "gps_status": pos.get("gps_status") or state.get("gps_status") or "unknown",
        "lat": pos.get("lat"),
        "lon": pos.get("lon"),
        "last_seen": pos.get("last_seen") or pos.get("ts") or state.get("last_seen"),
        "inventory_snapshot": inventory_state.get(profile_id, {}),
    }
