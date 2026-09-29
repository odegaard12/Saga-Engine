"""Runtime helpers for SAGA family-native minigames.

This module intentionally contains pure helpers only. FastAPI routes stay in
main.py for now; later PRs can move routers after contract tests exist.
"""

from backend.app.runtime.game_registry import (
    MINIGAME_SPECS as _REGISTRY_MINIGAME_SPECS,
    SUPPORTED_MINIGAME_TYPES as _REGISTRY_SUPPORTED_TYPES,
)
import base64
import hashlib
import random

MINIGAME_OK_CODE = "OK"

#: "Cuenta las señales" (owner-approved). Nº de preguntas por defecto/tope
#: -mínimo 2, máximo 5- que escribe el organizador al recorrer la ruta.
CUENTA_SENALES_MIN_QUESTIONS = 2
CUENTA_SENALES_MAX_QUESTIONS = 5
#: Penalización de tiempo tras 3 fallos, reutilizando la misma magnitud (30 s)
#: que el resto del anti-trampas usa como reinicio penalizado -no se inventa
#: un número nuevo-. El jugador nunca queda bloqueado: solo suma tiempo.
CUENTA_SENALES_PENALTY_MS = 30000
CUENTA_SENALES_MAX_ATTEMPTS = 3

#: "Trampa de palabras" (owner-approved): familia NUEVA "word_trap"
#: (presentación admin: "Desafío"), no un game_id dentro de una familia ya
#: existente. Varias rondas seguidas de preguntas trampa con 4 opciones
#: casi idénticas -para que dure más de 1 minuto, a diferencia del resto de
#: minijuegos (20-90 s)-. El admin escribe un BANCO de preguntas (puede ser
#: mayor que las rondas por partida) y cuántas rondas/segundos por pregunta
#: quiere; nunca se inventa un número universal -ver v5.34.0-.
WORD_TRAP_MIN_ROUNDS = 4
WORD_TRAP_MAX_ROUNDS = 12
WORD_TRAP_DEFAULT_ROUNDS = 8
WORD_TRAP_MIN_TIME_LIMIT_S = 4
WORD_TRAP_MAX_TIME_LIMIT_S = 30
WORD_TRAP_DEFAULT_TIME_LIMIT_S = 12
WORD_TRAP_MIN_BANK_QUESTIONS = 4
WORD_TRAP_MAX_BANK_QUESTIONS = 40
WORD_TRAP_OPTION_COUNT = 4
#: Misma magnitud de penalización que cuenta_senales: no se bloquea nunca,
#: fallar o agotar el tiempo solo suma 30 s y sigue a la siguiente ronda.
WORD_TRAP_PENALTY_MS = 30000
#: Cada fallo (o pregunta sin responder a tiempo) suma UNA ronda extra del
#: banco, hasta este tope. Sin esto quien lee rápido la acababa en menos de un
#: minuto pese a fallar: el fallo sólo costaba 30 s de penalización sobre el
#: reloj, no tiempo de juego. El tope evita que un mal día encadene rondas sin
#: fin (el juego nunca bloquea: ver `WORD_TRAP_PENALTY_MS`).
WORD_TRAP_MAX_EXTRA_ROUNDS = 4


def hash_word_trap_answer(option_index, salt):
    """sha256(salt + ':' + índice de opción elegido), la MISMA función que
    corre en el cliente (Web Crypto SubtleCrypto, ver
    WordTrapRuntimeScreen.tsx) para poder comprobar sin red qué opción
    eligió el jugador. Igual que hash_cuenta_senales_answer: no es una
    defensa fuerte -4 índices se fuerzan al instante-, solo evita que la
    opción correcta se lea a ojo en DevTools o en el payload de red.
    """
    texto = f"{_as_str(salt)}:{int(option_index)}"
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def _word_trap_salt(node_id, bank_index, round_index):
    return f"{_as_str(node_id)}:{int(bank_index)}:{int(round_index)}"


_WORD_TRAP_EXPLANATION_MAGIC = b"SAGA1:"


def _word_trap_keystream(key, length):
    """Flujo de bytes sha256(key || contador) — el mismo que calcula el móvil
    con Web Crypto (ver wordTrap/explicacion.ts)."""
    salida = b""
    contador = 0
    while len(salida) < length:
        salida += hashlib.sha256(key + contador.to_bytes(4, "big")).digest()
        contador += 1
    return salida[:length]


def _word_trap_explanation_key(salt, correct_index):
    return hashlib.sha256(f"{_as_str(salt)}:{int(correct_index)}:explicacion".encode("utf-8")).digest()


def encrypt_word_trap_explanation(explanation, salt, correct_index):
    """La explicación de una ronda, cifrada con la opción correcta como clave.

    Antes viajaba en claro en el paquete, con la ronda entera, ANTES de
    contestar: «la correcta es la B porque…» se leía en DevTools o en la
    pestaña de red. Ahora sólo se abre con el índice correcto (el móvil lo
    prueba con las 4 opciones cuando ya se ha contestado). Mismo nivel de
    defensa que `answer_hash`: 4 candidatos se fuerzan al instante, pero no
    se lee a ojo ni sale en una captura del paquete.
    """
    texto = _as_str(explanation).strip()
    if not texto:
        return ""
    datos = _WORD_TRAP_EXPLANATION_MAGIC + texto.encode("utf-8")
    flujo = _word_trap_keystream(_word_trap_explanation_key(salt, correct_index), len(datos))
    return base64.b64encode(bytes(a ^ b for a, b in zip(datos, flujo))).decode("ascii")


def decrypt_word_trap_explanation(cifrada, salt, option_index):
    """Inversa de `encrypt_word_trap_explanation`. `None` si la clave no vale."""
    if not cifrada:
        return None
    try:
        datos = base64.b64decode(cifrada)
    except (ValueError, TypeError):
        return None
    flujo = _word_trap_keystream(_word_trap_explanation_key(salt, option_index), len(datos))
    claro = bytes(a ^ b for a, b in zip(datos, flujo))
    if not claro.startswith(_WORD_TRAP_EXPLANATION_MAGIC):
        return None
    try:
        return claro[len(_WORD_TRAP_EXPLANATION_MAGIC):].decode("utf-8")
    except UnicodeDecodeError:
        return None


def _word_trap_shuffle_seed(node_id, player_id):
    texto = f"{_as_str(player_id)}:{_as_str(node_id)}:trampa_palabras"
    return int(hashlib.sha256(texto.encode("utf-8")).hexdigest(), 16)


def pick_word_trap_bank_indices(node_id, player_id, bank_size, n_rounds):
    """`n_rounds` índices deterministas dentro de 0..bank_size-1, uno por
    ronda. Estable entre recargas/offline (no usa random real: la semilla
    sale de hash(player_id + node_id)) pero recorre el banco COMPLETO que
    escribió el organizador -no siempre las primeras `n_rounds`-, para que
    una partida no agote todo el banco si es mayor que las rondas por
    partida. Con un banco más pequeño que `n_rounds` se repite el ciclo ya
    barajado -nunca se inventa una pregunta que el organizador no escribió-.
    """
    if bank_size <= 0 or n_rounds <= 0:
        return []
    orden = list(range(bank_size))
    random.Random(_word_trap_shuffle_seed(node_id, player_id)).shuffle(orden)
    if n_rounds <= bank_size:
        return orden[:n_rounds]
    vueltas = []
    while len(vueltas) < n_rounds:
        vueltas.extend(orden)
    return vueltas[:n_rounds]


def _default_word_trap_question(index):
    return {
        "question": f"Pregunta trampa {index}: escribe el enunciado.",
        "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
        "correct_index": 0,
        "explanation": "",
    }


def _normalize_word_trap_questions(value):
    """Banco de preguntas trampa: texto, 4 opciones (decoys casi idénticos),
    índice de la correcta y explicación opcional. Igual que
    _normalize_cuenta_senales_questions: un banco a medio escribir no debe
    quedar sin preguntas jugables -se rellena hasta el mínimo-, y nunca se
    admiten más de WORD_TRAP_MAX_BANK_QUESTIONS.
    """
    raw_list = value if isinstance(value, list) else []
    questions = []
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        text = _as_str(item.get("question")).strip()[:300]
        if not text:
            continue
        raw_options = item.get("options") if isinstance(item.get("options"), list) else []
        options = [_as_str(opt).strip()[:120] for opt in raw_options][:WORD_TRAP_OPTION_COUNT]
        options = [opt or f"Opción {idx + 1}" for idx, opt in enumerate(options)]
        while len(options) < WORD_TRAP_OPTION_COUNT:
            options.append(f"Opción {len(options) + 1}")
        correct_index = _clamp_int(item.get("correct_index"), 0, 0, WORD_TRAP_OPTION_COUNT - 1)
        explanation = _as_str(item.get("explanation")).strip()[:400]
        questions.append(
            {
                "question": text,
                "options": options,
                "correct_index": correct_index,
                "explanation": explanation,
            }
        )

    questions = questions[:WORD_TRAP_MAX_BANK_QUESTIONS]

    idx = 1
    while len(questions) < WORD_TRAP_MIN_BANK_QUESTIONS:
        questions.append(_default_word_trap_question(idx))
        idx += 1

    return questions


def project_word_trap_for_player(config, node_id, player_id):
    """De la config completa (banco entero + respuestas en claro, tal y
    como la guarda el organizador) a lo que recibe UN jugador: solo las
    `n_rounds` rondas que le tocan (barajadas de forma estable a partir de
    hash(player_id + node_id), ver pick_word_trap_bank_indices), cada una
    con sus 4 opciones y la respuesta correcta sustituida por su hash
    salado. Nunca viaja `correct_index` en claro, ni la explicación (sólo
    cifrada: `explanation_enc`, ver encrypt_word_trap_explanation). Además de
    las rondas base van `extra_rounds`: una por cada fallo, con tope.
    """
    n_rounds = _clamp_int(
        config.get("n_rounds"), WORD_TRAP_DEFAULT_ROUNDS, WORD_TRAP_MIN_ROUNDS, WORD_TRAP_MAX_ROUNDS
    )
    time_limit_s = _clamp_int(
        config.get("time_limit_s"),
        WORD_TRAP_DEFAULT_TIME_LIMIT_S,
        WORD_TRAP_MIN_TIME_LIMIT_S,
        WORD_TRAP_MAX_TIME_LIMIT_S,
    )

    todas = word_trap_server_rounds(config, node_id, player_id)
    rounds = [_word_trap_public_round(ronda) for ronda in todas[:n_rounds]]
    extra_rounds = [_word_trap_public_round(ronda) for ronda in todas[n_rounds:]]

    return {
        "objective": "word_trap",
        "game_id": "trampa_palabras",
        "completion_method": "quiz",
        "rounds": rounds,
        # Rondas de repuesto: cada fallo del jugador consume la siguiente,
        # hasta WORD_TRAP_MAX_EXTRA_ROUNDS. Van ya proyectadas (respuesta
        # hasheada) para que el juego siga funcionando sin cobertura.
        "extra_rounds": extra_rounds,
        "n_rounds": n_rounds,
        "time_limit_s": time_limit_s,
        "penalty_ms": WORD_TRAP_PENALTY_MS,
    }


def word_trap_server_rounds(config, node_id, player_id):
    """Todas las rondas que puede jugar UN jugador -base + extras-, con la
    respuesta correcta EN CLARO. Sólo para el servidor: sirve tanto para
    proyectar lo que se manda al móvil como para revalidar la partida
    (ver runtime/evidencia.py). El orden es el mismo siempre.
    """
    questions = config.get("questions") if isinstance(config.get("questions"), list) else []
    if not questions:
        questions = [_default_word_trap_question(1)]

    n_rounds = _clamp_int(
        config.get("n_rounds"), WORD_TRAP_DEFAULT_ROUNDS, WORD_TRAP_MIN_ROUNDS, WORD_TRAP_MAX_ROUNDS
    )

    # Prefijo estable: pedir n_rounds+extras da las mismas n_rounds primeras.
    bank_indices = pick_word_trap_bank_indices(
        node_id, player_id, len(questions), n_rounds + WORD_TRAP_MAX_EXTRA_ROUNDS
    )

    rondas = []
    for round_index, bank_index in enumerate(bank_indices):
        question = questions[bank_index] if 0 <= bank_index < len(questions) else questions[0]
        options = question.get("options") if isinstance(question.get("options"), list) else []
        correct_index = _clamp_int(question.get("correct_index"), 0, 0, max(0, len(options) - 1))
        rondas.append(
            {
                "round_index": round_index,
                "bank_index": bank_index,
                "question": _as_str(question.get("question")).strip(),
                "options": [_as_str(opt).strip() for opt in options],
                "correct_index": correct_index,
                "salt": _word_trap_salt(node_id, bank_index, round_index),
                "explanation": _as_str(question.get("explanation")).strip(),
            }
        )
    return rondas


def _word_trap_public_round(ronda):
    """Lo de una ronda que sale hacia el móvil: nada en claro que delate la
    respuesta (ni `correct_index` ni la explicación)."""
    return {
        "question": ronda["question"],
        "options": list(ronda["options"]),
        "salt": ronda["salt"],
        "answer_hash": hash_word_trap_answer(ronda["correct_index"], ronda["salt"]),
        "explanation_enc": encrypt_word_trap_explanation(
            ronda["explanation"], ronda["salt"], ronda["correct_index"]
        ),
    }


def hash_cuenta_senales_answer(answer, salt):
    """sha256(salt + ':' + respuesta), la MISMA función que corre en el
    cliente (Web Crypto SubtleCrypto, ver CuentaSenalesRuntimeScreen.tsx)
    para poder comprobar sin red la respuesta del jugador.

    No es una defensa fuerte -un entero pequeño se fuerza por fuerza bruta
    en milisegundos-, es solo para que la respuesta no se lea a ojo en
    DevTools/el payload de red. El check real de "gana el punto" siempre ha
    sido responsabilidad del cliente en TODOS los minijuegos de SAGA (ver
    MINIGAME_OK_CODE: el servidor solo acepta el aviso de "completado", no
    revalida la partida) y el offline exige que el cliente pueda comprobar
    sin conexión, así que no hay vuelta atrás posible aquí sin romper el
    modo sin red.
    """
    texto = f"{_as_str(salt)}:{_as_str(answer).strip()}"
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def _cuenta_senales_salt(node_id, question_index):
    return f"{_as_str(node_id)}:{int(question_index)}"


def pick_cuenta_senales_question_index(node_id, player_id, question_count):
    """Índice determinista 0..question_count-1 a partir de hash(player_id +
    node_id). Estable entre recargas/offline -no usa random- y reparte a
    cada jugador una pregunta DISTINTA de las 2-5 que escribió el
    organizador, para que no puedan pasarse la respuesta entre ellos.
    """
    if question_count <= 0:
        return 0
    texto = f"{_as_str(player_id)}:{_as_str(node_id)}"
    digest = hashlib.sha256(texto.encode("utf-8")).hexdigest()
    return int(digest, 16) % int(question_count)


def project_cuenta_senales_for_player(config, node_id, player_id):
    """De la config completa (con las 2-5 preguntas y su respuesta en
    claro, tal y como la guarda el organizador) a lo que recibe UN jugador:
    solo SU pregunta asignada, y con la respuesta sustituida por su hash
    salado (salt = node_id + índice de la pregunta). Nunca viaja la
    respuesta en claro ni las preguntas de los demás jugadores.
    """
    questions = config.get("questions") if isinstance(config.get("questions"), list) else []
    if not questions:
        questions = [_default_cuenta_senales_question(1)]

    index = pick_cuenta_senales_question_index(node_id, player_id, len(questions))
    question = questions[index] if 0 <= index < len(questions) else questions[0]
    salt = _cuenta_senales_salt(node_id, index)

    tolerance = _clamp_int(question.get("tolerance"), 0, 0, 20)
    answer = _clamp_int(question.get("answer"), 0, 0, 999)
    # La tolerancia (±) no se puede aplicar a un hash con una simple resta:
    # un hash sólo compara igualdad exacta. Así que se hashea CADA valor
    # aceptable del rango -answer-tolerancia..answer+tolerancia-, no solo
    # el correcto. Con tolerancia 0 es una lista de un elemento: el mismo
    # comportamiento de siempre. Sigue siendo un puñado de enteros pequeños
    # -fuerza bruta trivial-, pero es el mismo trade-off ya aceptado para
    # `answer_hash`: nunca se lee la respuesta a ojo en DevTools/red.
    answer_hashes = [
        hash_cuenta_senales_answer(valor, salt)
        for valor in range(max(0, answer - tolerance), answer + tolerance + 1)
    ]

    return {
        "objective": "count_signals",
        "game_id": "cuenta_senales",
        "completion_method": "manual_code",
        "question": _as_str(question.get("question")).strip(),
        "hint_image_data_url": _as_str(question.get("hint_image_data_url")).strip(),
        "answer_hashes": answer_hashes,
        "salt": salt,
        "max_attempts": CUENTA_SENALES_MAX_ATTEMPTS,
        "penalty_ms": CUENTA_SENALES_PENALTY_MS,
    }

def cuenta_senales_accepted_values(config, node_id, player_id):
    """Los enteros que dan por buena la pregunta asignada a este jugador.

    Sólo para el servidor (revalidar la partida, ver runtime/evidencia.py):
    la misma pregunta y el mismo rango que salen hasheados hacia el móvil en
    `project_cuenta_senales_for_player`, pero en claro.
    """
    questions = config.get("questions") if isinstance(config.get("questions"), list) else []
    if not questions:
        questions = [_default_cuenta_senales_question(1)]
    index = pick_cuenta_senales_question_index(node_id, player_id, len(questions))
    question = questions[index] if 0 <= index < len(questions) else questions[0]
    tolerance = _clamp_int(question.get("tolerance"), 0, 0, 20)
    answer = _clamp_int(question.get("answer"), 0, 0, 999)
    return list(range(max(0, answer - tolerance), answer + tolerance + 1))


# Tipos soportados: `supported_types` de shared/game_registry.json (ver
# game_registry.py). Añadir una familia técnica nueva = una entrada allí.
SUPPORTED_MINIGAME_TYPES = set(_REGISTRY_SUPPORTED_TYPES)

import unicodedata

def _as_str(value, default=""):
    if value is None:
        return default
    s = str(value)
    return unicodedata.normalize("NFC", s)

def _clean_code(value):
    return _as_str(value).strip().upper()

def _as_float(value, default=None):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default

def _as_radius(value, default=0):
    num = _as_float(value, default)
    if num is None:
        return default
    if float(num).is_integer():
        return int(num)
    return num

def _as_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return default


MINIGAME_SPECS = dict(_REGISTRY_MINIGAME_SPECS)

def _clamp_int(value, default, minimum=None, maximum=None):
    num = _as_float(value, default)
    try:
        out = int(round(float(num)))
    except Exception:
        out = int(default)
    if minimum is not None:
        out = max(int(minimum), out)
    if maximum is not None:
        out = min(int(maximum), out)
    return out

def _clamp_ratio(value, default, minimum=0.0, maximum=1.0):
    """Proporción acotada, redondeada a dos decimales."""
    num = _as_float(value, default)
    try:
        out = float(num)
    except Exception:
        out = float(default)
    out = max(float(minimum), min(float(maximum), out))
    return round(out, 2)

def _coerce_binary_flag(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(int(value))
    text = _as_str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return None

def _normalize_string_list(value, fallback, allowed=None, min_items=1, max_items=None, uppercase=True):
    if not isinstance(value, list):
        return list(fallback)
    allowed_set = set(allowed) if allowed else None
    items = []
    for item in value:
        text = _as_str(item).strip()
        if uppercase:
            text = text.upper()
        if not text:
            continue
        if allowed_set and text not in allowed_set:
            continue
        items.append(text)
    if max_items is not None:
        items = items[:max_items]
    if len(items) < min_items:
        return list(fallback)
    return items

def _normalize_frequency_label(value, default="104.6"):
    text = _as_str(value).strip().lower().replace("mhz", "").strip()
    num = _as_float(text, None)
    if num is None:
        num = _as_float(default, 104.6)
    return f"{float(num):.1f}"

def _normalize_degree_label(value, default="135°"):
    text = _as_str(value).strip().upper().replace("°", "").strip()
    num = _as_float(text, None)
    if num is None:
        text = _as_str(default).strip().upper().replace("°", "").strip()
        num = _as_float(text, 135)
    return f"{int(round(float(num))) % 360}°"

def get_minigame_spec(minigame_type):
    normalized = _as_str(minigame_type).strip().lower()
    if normalized not in MINIGAME_SPECS:
        normalized = "signal_hunt"
    return MINIGAME_SPECS[normalized]


CIRCUIT_OBJECTIVES = {
    "path_restore",
    "power_balance",
    "switch_logic",
    "signal_route",
}

CIRCUIT_PATTERN_MODES = {
    "random_each_game",
    "fixed",
}

CIRCUIT_DIFFICULTIES = {
    "easy",
    "normal",
    "hard",
}


def _normalize_circuit_difficulty(value):
    if isinstance(value, str):
        text = value.strip().lower()

        if text in CIRCUIT_DIFFICULTIES:
            return text

    return _clamp_int(value, 2, 1, 5)


def _normalize_circuit_path_cells(value, rows, cols):
    if not isinstance(value, list):
        return []

    if len(value) < 4:
        return []

    cells = []
    seen = set()
    previous = None
    maximum = max(1, int(rows) * int(cols))

    if len(value) > maximum:
        return []

    for item in value:
        text = _as_str(item).strip()
        parts = text.split(":")

        if len(parts) != 2:
            return []

        try:
            row = int(parts[0])
            col = int(parts[1])
        except (TypeError, ValueError):
            return []

        if row < 0 or row >= rows:
            return []

        if col < 0 or col >= cols:
            return []

        cell = f"{row}:{col}"

        if cell in seen:
            return []

        if previous is not None:
            distance = (
                abs(row - previous[0])
                + abs(col - previous[1])
            )

            if distance != 1:
                return []

        cells.append(cell)
        seen.add(cell)
        previous = (row, col)

    return cells



def _default_cuenta_senales_question(index):
    return {
        "question": f"Objetivo {index}: ¿cuántos hay?",
        "answer": 1,
        "tolerance": 0,
        "hint_image_data_url": "",
    }


def _normalize_cuenta_senales_questions(value):
    """2-5 preguntas: texto, respuesta entera, tolerancia (± admin) y foto
    de pista opcional. Igual que rumbo_doble con `targets`, un nodo a medio
    escribir no debe quedarse sin preguntas jugables -se rellena hasta el
    mínimo de 2-, y nunca se admiten más de 5 (el enunciado del juego pide
    2-5 preguntas, una por jugador).
    """
    raw_list = value if isinstance(value, list) else []
    questions = []
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        text = _as_str(item.get("question")).strip()[:240]
        answer = _clamp_int(item.get("answer"), 0, 0, 999)
        tolerance = _clamp_int(item.get("tolerance"), 0, 0, 20)
        hint = _as_str(item.get("hint_image_data_url")).strip()
        valid_hint = (
            len(hint) <= 600000
            and (
                hint.startswith("data:image/jpeg;base64,")
                or hint.startswith("data:image/png;base64,")
                or hint.startswith("data:image/webp;base64,")
            )
        )
        if not text:
            continue
        questions.append(
            {
                "question": text,
                "answer": answer,
                "tolerance": tolerance,
                "hint_image_data_url": hint if valid_hint else "",
            }
        )

    questions = questions[:CUENTA_SENALES_MAX_QUESTIONS]

    idx = 1
    while len(questions) < CUENTA_SENALES_MIN_QUESTIONS:
        questions.append(_default_cuenta_senales_question(idx))
        idx += 1

    return questions


def _normalize_mosaic_choices(value):
    if not isinstance(value, list):
        return [
            "Puerta",
            "Escudo",
            "Campana",
        ]

    choices = []

    for item in value:
        text = _as_str(item).strip()[:60]

        if text:
            choices.append(text)

    choices = choices[:4]

    if len(choices) < 2:
        return [
            "Puerta",
            "Escudo",
            "Campana",
        ]

    return choices


def normalize_minigame_config(minigame_type, raw_cfg):
    raw = raw_cfg if isinstance(raw_cfg, dict) else {}
    out = _normalize_minigame_config_raw(minigame_type, raw)
    if not isinstance(out, dict):
        out = {}
    for field in ["is_map_collectible", "game_id", "game_title", "completion_method"]:
        if field in raw:
            if field == "is_map_collectible":
                out[field] = _as_bool(raw[field])
            else:
                out[field] = _as_str(raw[field]).strip()
    # required_members: solo lo usa team_relay (un game_id de signal_hunt,
    # no un campo real de esa familia -ver frontend/.../family-types.ts-),
    # así que va aquí, junto a game_id, y no en el whitelist de campos de
    # signal_hunt de _normalize_minigame_config_raw. Sin esto, admin.py
    # guardaba el número pero normalize_stage lo tiraba al leer: el jugador
    # nunca veía el umbral que puso el organizador, siempre el 2 de
    # siempre. Encontrado con sim/playwright-bench, no a ojo.
    if "required_members" in raw:
        out["required_members"] = _clamp_int(raw.get("required_members"), 2, 1, 20)
    # clue_text/search_radius_m/hot_cold_hint: solo los usa mapa_mudo (otro
    # game_id de signal_hunt, igual que required_members de team_relay justo
    # arriba), no son campos reales de esa familia. La foto de la pista
    # reutiliza el mismo `image_data_url` genérico que ya sirve
    # `_minigame_con_url_de_foto` (mision.py) para cualquier minijuego -no
    # se inventa un nombre de campo nuevo-.
    juego_id = _as_str(out.get("game_id") or raw.get("game_id")).strip()
    if juego_id == "mapa_mudo":
        out["clue_text"] = _as_str(raw.get("clue_text")).strip()[:400]
        out["search_radius_m"] = _clamp_int(raw.get("search_radius_m"), 250, 150, 400)
        out["hot_cold_hint"] = _as_bool(raw.get("hot_cold_hint"), False)
        dato_foto = raw.get("image_data_url")
        if isinstance(dato_foto, str) and dato_foto.startswith("data:"):
            out["image_data_url"] = dato_foto
    # questions: solo lo usa cuenta_senales (otro game_id de signal_hunt,
    # igual que mapa_mudo/team_relay arriba). Aquí SÍ va la respuesta en
    # claro -esto es lo que guarda el organizador en admin, nunca lo que
    # recibe el jugador: ver project_cuenta_senales_for_player, que es
    # quien sustituye `questions` por la pregunta+hash de UN jugador antes
    # de que el payload salga hacia el móvil-.
    if juego_id == "cuenta_senales":
        out["questions"] = _normalize_cuenta_senales_questions(raw.get("questions"))
    # word_trap: familia técnica propia (no un game_id compartido), pero
    # las mismas 3 claves -banco completo en claro, rondas por partida y
    # segundos por pregunta- se validan aquí igual que el resto de campos
    # "solo de un juego concreto", nunca en _normalize_minigame_config_raw.
    if juego_id == "trampa_palabras":
        out["questions"] = _normalize_word_trap_questions(raw.get("questions"))
        out["n_rounds"] = _clamp_int(
            raw.get("n_rounds"), WORD_TRAP_DEFAULT_ROUNDS, WORD_TRAP_MIN_ROUNDS, WORD_TRAP_MAX_ROUNDS
        )
        out["time_limit_s"] = _clamp_int(
            raw.get("time_limit_s"),
            WORD_TRAP_DEFAULT_TIME_LIMIT_S,
            WORD_TRAP_MIN_TIME_LIMIT_S,
            WORD_TRAP_MAX_TIME_LIMIT_S,
        )
    return out


def _normalize_minigame_config_raw(minigame_type, raw_cfg):
    raw = raw_cfg if isinstance(raw_cfg, dict) else {}
    normalized_type = _as_str(minigame_type).strip().lower()
    if normalized_type not in SUPPORTED_MINIGAME_TYPES:
        normalized_type = "signal_hunt"

    if normalized_type == "audio_challenge":
        return {
            "objective": _as_str(raw.get("objective") or "blow_charge").strip().lower() or "blow_charge",
            "game_id": _as_str(raw.get("game_id") or "audio_challenge").strip() or "audio_challenge",
        }

    if normalized_type == "word_trap":
        # Un único game_id en toda la familia -a diferencia de circuit_matrix
        # (logic_circuit/sequence_code/place_mosaic/tilt_maze/spark_radar)-,
        # así que no hace falta bifurcar por game_id aquí. `questions` /
        # `n_rounds` / `time_limit_s` los añade normalize_minigame_config
        # (arriba), igual que `questions` de cuenta_senales.
        return {
            "objective": "word_trap",
            "game_id": "trampa_palabras",
            "completion_method": "quiz",
        }

    if normalized_type == "circuit_matrix":
        game_id = (
            _as_str(
                raw.get("game_id")
                or "logic_circuit"
            )
            .strip()
            or "logic_circuit"
        )

        if game_id == "spark_radar":
            # Caza-Señales. Los topes evitan configuraciones injugables desde
            # admin: 60 señales en 5 segundos, o chispas que se apagan antes de
            # que al jugador le dé tiempo a verlas.
            return {
                "objective": "spark_radar",
                "game_id": "spark_radar",
                "completion_method": "motion",
                # Veinticinco, no doce: con doce se ganaba de carrerilla y el
                # nodo se pasaba sin despeinarse.
                "target_hits": _clamp_int(raw.get("target_hits"), 25, 3, 40),
                "time_limit_s": _clamp_int(raw.get("time_limit_s"), 45, 15, 180),
                "spawn_interval_ms": _clamp_int(raw.get("spawn_interval_ms"), 700, 250, 2500),
                "spark_life_ms": _clamp_int(raw.get("spark_life_ms"), 1600, 600, 4000),
                "echo_ratio": _clamp_ratio(raw.get("echo_ratio"), 0.28, 0.0, 0.6),
                "echo_penalty_s": _clamp_int(raw.get("echo_penalty_s"), 2, 0, 10),
            }

        if game_id == "tilt_maze":
            difficulty = (
                _as_str(
                    raw.get("difficulty")
                    or "normal"
                )
                .strip()
                .lower()
                or "normal"
            )

            if difficulty not in CIRCUIT_DIFFICULTIES:
                difficulty = "normal"

            # Once por once en el normal, que con nueve el tablero se cruzaba
            # en pocos movimientos y no daba tiempo a equivocarse.
            fallback_size = (
                7
                if difficulty == "easy"
                else 13
                if difficulty == "hard"
                else 11
            )

            pattern_mode = (
                "random_each_game"
                if (
                    _as_str(
                        raw.get("pattern_mode")
                    )
                    .strip()
                    .lower()
                    == "random_each_game"
                )
                else "fixed"
            )

            return {
                "objective": "balance_maze",
                "game_id": "tilt_maze",
                "completion_method": "motion",
                "difficulty": difficulty,
                "grid_rows": _clamp_int(
                    raw.get("grid_rows"),
                    fallback_size,
                    5,
                    13,
                ),
                "grid_cols": _clamp_int(
                    raw.get("grid_cols"),
                    fallback_size,
                    5,
                    13,
                ),
                "pattern_mode": pattern_mode,
                "maze_seed": (
                    _as_str(
                        raw.get("maze_seed")
                        or "saga-maze"
                    )
                    .strip()[:80]
                    or "saga-maze"
                ),
                # Noventa segundos: el tablero es mas grande y hay que dar
                # rodeos, y perder por reloj en vez de por pulso no distingue a
                # nadie. La dificultad esta en el pulso, no en las prisas.
                "time_limit_s": _clamp_int(
                    raw.get("time_limit_s"),
                    90,
                    20,
                    180,
                ),
                # Una sola vida. Aqui esta lo que hacia el laberinto un paseo:
                # con vidas de sobra se cruzaba a lo bruto y el agujero solo
                # costaba repetir un trozo. Con una, caer significa volver a la
                # salida, y de golpe hay que mirar donde se pisa.
                "lives": _clamp_int(
                    raw.get("lives"),
                    1,
                    1,
                    5,
                ),
                # Catorce agujeros: con diez en once por once seguia habiendo
                # hueco de sobra para ir a ojo.
                "hole_count": _clamp_int(
                    raw.get("hole_count"),
                    14,
                    0,
                    18,
                ),
                # Tres cosas que recoger en vez de dos. Se colocan sobre la ruta
                # buena, asi que no son un rodeo: son tres paradas mas donde hay
                # que clavar la bola, y con los agujeros al lado eso se nota.
                "collectible_count": _clamp_int(
                    raw.get(
                        "collectible_count"
                    ),
                    3,
                    0,
                    6,
                ),
                "sensor_enabled": _as_bool(
                    raw.get("sensor_enabled"),
                    True,
                ),
                "tilt_threshold": _clamp_int(
                    raw.get("tilt_threshold"),
                    12,
                    6,
                    30,
                ),
                # La bola responde mas rapido, asi que cuesta mas pararla justo
                # al borde de un agujero.
                "step_cooldown_ms": _clamp_int(
                    raw.get(
                        "step_cooldown_ms"
                    ),
                    290,
                    180,
                    800,
                ),
            }

        if game_id == "place_mosaic":
            image_data_url = (
                _as_str(
                    raw.get("image_data_url")
                )
                .strip()
            )

            valid_image = (
                len(image_data_url) <= 600000
                and (
                    image_data_url.startswith(
                        "data:image/jpeg;base64,"
                    )
                    or image_data_url.startswith(
                        "data:image/png;base64,"
                    )
                    or image_data_url.startswith(
                        "data:image/webp;base64,"
                    )
                )
            )

            if not valid_image:
                image_data_url = ""

            grid_size = _clamp_int(
                (
                    raw.get("grid_size")
                    if raw.get("grid_size") is not None
                    else raw.get("grid_cols")
                ),
                3,
                2,
                4,
            )

            choices = (
                _normalize_mosaic_choices(
                    raw.get("final_choices")
                )
            )

            correct_index = _clamp_int(
                raw.get("final_correct_index"),
                0,
                0,
                len(choices) - 1,
            )

            return {
                "objective": "image_mosaic",
                "game_id": "place_mosaic",
                "completion_method": "puzzle",
                "image_data_url": image_data_url,
                "image_alt": (
                    _as_str(
                        raw.get("image_alt")
                    )
                    .strip()[:120]
                ),
                "grid_size": grid_size,
                "grid_cols": grid_size,
                "grid_rows": grid_size,
                "preview_ms": _clamp_int(
                    raw.get("preview_ms"),
                    2500,
                    0,
                    6000,
                ),
                "max_moves": _clamp_int(
                    raw.get("max_moves"),
                    0,
                    0,
                    500,
                ),
                "require_final_question": (
                    _as_bool(
                        raw.get(
                            "require_final_question"
                        ),
                        False,
                    )
                ),
                "final_question": (
                    _as_str(
                        raw.get("final_question")
                        or (
                            "¿Qué detalle aparece "
                            "en el lugar real?"
                        )
                    )
                    .strip()[:180]
                ),
                "final_choices": choices,
                "final_correct_index": (
                    correct_index
                ),
            }

        if game_id == "sequence_code":
            # Simón Dice. La config anterior describía un puzle de ORDENAR
            # fichas ("sequence", "shuffle_choices") que no era lo que jugaba
            # nadie: el runtime siempre fue de colores. Se guardan los ajustes
            # que el juego usa de verdad.
            return {
                "objective": "sequence_order",
                "game_id": "sequence_code",
                "completion_method": "sequence",
                "levels": _clamp_int(raw.get("levels"), 5, 3, 8),
                "pad_count": _clamp_int(raw.get("pad_count"), 4, 3, 6),
                "step_ms": _clamp_int(raw.get("step_ms"), 620, 260, 1200),
                "sound_enabled": raw.get("sound_enabled") is not False,
                "seed": (_as_str(raw.get("seed") or raw.get("maze_seed")).strip()[:40]
                         or "saga-simon"),
            }

        # Seis por seis en vez de cinco por cinco: mas sitio donde esconder el
        # recorrido, y el patron deja de caber de un vistazo.
        rows = _clamp_int(
            raw.get("grid_rows"),
            6,
            4,
            6,
        )

        cols = _clamp_int(
            raw.get("grid_cols"),
            6,
            4,
            6,
        )

        objective = (
            _as_str(
                raw.get("objective")
                or "path_restore"
            )
            .strip()
            .lower()
        )

        if objective not in CIRCUIT_OBJECTIVES:
            objective = "path_restore"

        path_cells = _normalize_circuit_path_cells(
            raw.get("path_cells"),
            rows,
            cols,
        )

        raw_pattern_mode = (
            _as_str(raw.get("pattern_mode"))
            .strip()
            .lower()
        )

        if raw_pattern_mode in CIRCUIT_PATTERN_MODES:
            pattern_mode = raw_pattern_mode
        elif len(path_cells) >= 4:
            pattern_mode = "fixed"
        else:
            pattern_mode = "random_each_game"

        if pattern_mode != "fixed":
            path_cells = []

        if pattern_mode == "fixed" and path_cells:
            path_length = len(path_cells)
        else:
            # Once celdas. Trece con el camino en diagonal se paso de vueltas:
            # el reto es acordarse, no que sea imposible.
            path_length = _clamp_int(
                raw.get("path_length"),
                11,
                4,
                rows * cols,
            )

        out = {
            "objective": objective,
            "game_id": (
                _as_str(
                    raw.get("game_id")
                    or "logic_circuit"
                )
                .strip()
                or "logic_circuit"
            ),
            "completion_method": "puzzle",
            "grid_cols": cols,
            "grid_rows": rows,
            "difficulty": (
                _normalize_circuit_difficulty(
                    raw.get("difficulty")
                )
            ),
            # Dos fallos. Con uno solo, un despiste al principio mandaba a
            # repetir el nodo entero y eso no mide memoria, mide suerte.
            "max_errors": _clamp_int(
                raw.get("max_errors"),
                2,
                1,
                6,
            ),
            # 420 ms por celda: a 250 el destello iba disparado y no daba
            # tiempo ni a seguirlo con la vista.
            "preview_cell_ms": _clamp_int(
                raw.get("preview_cell_ms"),
                420,
                200,
                900,
            ),
            "path_length": path_length,
            "pattern_mode": pattern_mode,
            "path_cells": path_cells,
            "max_moves": (
                _clamp_int(
                    raw.get("max_moves"),
                    0,
                    0,
                )
                or None
            ),
            "max_time_ms": (
                _clamp_int(
                    raw.get("max_time_ms"),
                    0,
                    0,
                )
                or None
            ),
            "allow_rotate": _as_bool(
                raw.get("allow_rotate"),
                True,
            ),
            "allow_toggle": _as_bool(
                raw.get("allow_toggle"),
                True,
            ),
            "allow_swap": _as_bool(
                raw.get("allow_swap"),
                False,
            ),
            "start_nodes": (
                raw.get("start_nodes")
                if isinstance(
                    raw.get("start_nodes"),
                    list,
                )
                else []
            ),
            "end_nodes": (
                raw.get("end_nodes")
                if isinstance(
                    raw.get("end_nodes"),
                    list,
                )
                else []
            ),
            "target_pattern": (
                raw.get("target_pattern")
                if isinstance(
                    raw.get("target_pattern"),
                    list,
                )
                else []
            ),
            "blocked_cells": (
                raw.get("blocked_cells")
                if isinstance(
                    raw.get("blocked_cells"),
                    list,
                )
                else []
            ),
            "hint_mode": (
                _as_str(
                    raw.get("hint_mode")
                    or "light"
                )
                .strip()
                .lower()
                or "light"
            ),
            "auto_check": _as_bool(
                raw.get("auto_check"),
                True,
            ),
            "success_animation": (
                _as_str(
                    raw.get("success_animation")
                    or "restore"
                )
                .strip()
                .lower()
                or "restore"
            ),
        }

        out["seed"] = (
            _as_str(raw.get("seed"))
            .strip()
        )

        return out

    if normalized_type == "bearing_hunt":
        game_id = _as_str(raw.get("game_id")).strip().lower()

        if game_id == "rumbo_doble":
            # "Rumbo doble": 2 (admin-configurable 2-3) objetivos reales,
            # cada uno con su etiqueta libre (lo que escribe el organizador,
            # p.ej. "la torre de la iglesia") y su propio rumbo. A
            # diferencia del bearing_hunt de objetivo único de abajo, aquí
            # no hay target_bearing_deg suelto: la lista `targets` es la
            # fuente de verdad, y el runtime del jugador (RuntimeScreen.tsx)
            # avanza de uno a otro sin resetear la secuencia si se pierde el
            # lock de uno solo.
            raw_targets = raw.get("targets")
            targets = []
            if isinstance(raw_targets, list):
                for item in raw_targets:
                    if not isinstance(item, dict):
                        continue
                    label = _as_str(item.get("label")).strip()[:120]
                    bearing = _as_float(item.get("bearing_deg"), 0) % 360
                    targets.append({"label": label, "bearing_deg": bearing})

            # Defensivo: un nodo a medio configurar no debe quedar sin
            # objetivos jugables. 2 es el mínimo real del juego.
            fallback_targets = [
                {"label": "Objetivo 1", "bearing_deg": 0.0},
                {"label": "Objetivo 2", "bearing_deg": 90.0},
                {"label": "Objetivo 3", "bearing_deg": 180.0},
            ]
            idx = 0
            while len(targets) < 2 and idx < len(fallback_targets):
                targets.append(fallback_targets[idx])
                idx += 1

            targets = targets[:3]

            return {
                "objective": "bearing_sequence",
                "game_id": "rumbo_doble",
                "targets": targets,
                "tolerance_deg": _clamp_int(raw.get("tolerance_deg"), 12, 1, 90),
                "hold_ms": _clamp_int(raw.get("hold_ms"), 1200, 100),
                "show_numeric_bearing": _as_bool(raw.get("show_numeric_bearing"), False),
                "show_compass_ring": _as_bool(raw.get("show_compass_ring"), True),
                "allow_recenter": _as_bool(raw.get("allow_recenter"), True),
            }

        target_sequence = raw.get("target_sequence_deg")
        false_targets = raw.get("false_targets")

        out = {
            "objective": _as_str(raw.get("objective") or "single_lock").strip().lower() or "single_lock",
            "target_bearing_deg": _as_float(raw.get("target_bearing_deg"), 90),
            "target_sequence_deg": target_sequence if isinstance(target_sequence, list) else [],
            "sector_start_deg": _as_float(raw.get("sector_start_deg"), None),
            "sector_end_deg": _as_float(raw.get("sector_end_deg"), None),
            "tolerance_deg": _clamp_int(raw.get("tolerance_deg"), 12, 1, 90),
            "hold_ms": _clamp_int(raw.get("hold_ms"), 1200, 100),
            "phases": _clamp_int(raw.get("phases"), 1, 1, 10),
            "timeout_ms": _clamp_int(raw.get("timeout_ms"), 0, 0) or None,
            "require_stable_orientation": _as_bool(raw.get("require_stable_orientation"), True),
            "stability_window_ms": _clamp_int(raw.get("stability_window_ms"), 800, 100),
            "feedback_mode": _as_str(raw.get("feedback_mode") or "mixed").strip().lower() or "mixed",
            "noise_level": _clamp_int(raw.get("noise_level"), 1, 0, 3),
            "false_targets": false_targets if isinstance(false_targets, list) else [],
            "show_numeric_bearing": _as_bool(raw.get("show_numeric_bearing"), False),
            "show_compass_ring": _as_bool(raw.get("show_compass_ring"), True),
            "allow_recenter": _as_bool(raw.get("allow_recenter"), True),
        }
        return out


    if normalized_type == "motion_challenge":
        game_id_mc = _as_str(raw.get("game_id")).strip().lower()

        if game_id_mc == "pulso_hierro":
            # "Pulso de hierro" (owner-approved): dos manos a la vez, cada
            # una con su propio sensor/entrada -no hay otro minijuego del
            # catálogo que combine dos streams independientes-. Una mano
            # sujeta el móvil lo más quieto posible (ventana estrecha de
            # varianza del acelerómetro, motionChallenge invertido: quietud
            # en vez de sacudida); la otra repite una secuencia Simón Dice
            # que crece cada ronda. Perder la quietud en CUALQUIER momento
            # resetea solo la ronda de toques en curso (no la partida
            # entera): hay que re-estabilizar antes de seguir. Ver
            # PulsoHierroRuntimeScreen.tsx (motor) y
            # _suelo_pulso_hierro/MINIGAME_HARD_FLOOR_MS_BY_GAME en
            # anti_cheat.py (suelo derivado de estos mismos números, no
            # adivinado).
            return {
                "objective": "pulso_hierro",
                "game_id": "pulso_hierro",
                "difficulty": _as_str(raw.get("difficulty") or "hard").strip().lower() or "hard",
                "allow_touch_fallback": _as_bool(raw.get("allow_touch_fallback"), True),
                "pulso_start_length": _clamp_int(raw.get("pulso_start_length"), 3, 2, 6),
                "pulso_target_rounds": _clamp_int(raw.get("pulso_target_rounds"), 6, 3, 10),
                "pulso_growth_per_round": _clamp_int(raw.get("pulso_growth_per_round"), 1, 0, 3),
                "pulso_stability_variance_max": max(
                    0.2, min(3.0, _as_float(raw.get("pulso_stability_variance_max"), 0.9) or 0.9)
                ),
                "pulso_tap_window_ms": _clamp_int(raw.get("pulso_tap_window_ms"), 2600, 1200, 5000),
                "pulso_pad_count": _clamp_int(raw.get("pulso_pad_count"), 4, 3, 6),
                "use_vibration": _as_bool(raw.get("use_vibration"), True),
            }

        difficulty = _as_str(raw.get("difficulty") or "normal").strip().lower() or "normal"
        if difficulty not in {"easy", "normal", "hard"}:
            difficulty = "normal"

        duration_mode = _as_str(raw.get("duration_mode") or "normal").strip().lower() or "normal"
        if duration_mode not in {"short", "normal", "long"}:
            duration_mode = "normal"

        penalty_mode = _as_str(raw.get("penalty_mode") or "normal").strip().lower() or "normal"
        if penalty_mode not in {"soft", "normal", "hard"}:
            penalty_mode = "normal"

        out = {
            "objective": _as_str(raw.get("objective") or "shake_charge").strip().lower() or "shake_charge",
            # No "shake_antenna_charge": esa cadena la usa runtime-bridge.ts
            # (React, jugador) para redirigir misiones VIEJAS de signal_hunt
            # a circuit_matrix/logic_circuit -una migracion real, de antes de
            # que existiera este objetivo-. motion_challenge la reutilizaba
            # por accidente como su propio game_id por defecto: cualquier
            # nodo motion_challenge con el valor de siempre acababa
            # mostrando un puzle de circuitos en vez del reto de movimiento.
            # Verificado que ningun dato real en produccion usa
            # "shake_antenna_charge" (grep sobre saga.sqlite3, 0 resultados)
            # antes de renombrar: no hace falta migrar nada.
            "game_id": _as_str(raw.get("game_id") or "shake_charge").strip() or "shake_charge",
            "difficulty": difficulty,
            "duration_mode": duration_mode,
            "penalty_mode": penalty_mode,
            "allow_touch_fallback": _as_bool(raw.get("allow_touch_fallback"), True),
            "energy_target": _clamp_int(raw.get("energy_target"), 100, 40, 300),
            "time_limit_ms": _clamp_int(raw.get("time_limit_ms"), 35000, 12000, 120000),
            "stabilize_ms": _clamp_int(raw.get("stabilize_ms"), 2000, 600, 8000),
            "calibration_ms": _clamp_int(raw.get("calibration_ms"), 1000, 400, 3000),
            "good_min": _as_float(raw.get("good_min"), 1.2),
            "good_max": _as_float(raw.get("good_max"), 3.8),
            "overcharge_threshold": _as_float(raw.get("overcharge_threshold"), 5.4),
            "idle_decay": _as_float(raw.get("idle_decay"), 0.15),
            "charge_rate": _as_float(raw.get("charge_rate"), 2.4),
            "stability_min": _clamp_int(raw.get("stability_min"), 35, 0, 100),
            "use_vibration": _as_bool(raw.get("use_vibration"), True),
        }
        return out

    if normalized_type == "signal_hunt":
        false_peaks = raw.get("false_peaks")
        dead_zones = raw.get("dead_zones")

        out = {
            "objective": _as_str(raw.get("objective") or "proximity_lock").strip().lower() or "proximity_lock",
            "source_lat": _as_float(raw.get("source_lat"), None),
            "source_lon": _as_float(raw.get("source_lon"), None),
            "source_radius_m": _as_float(raw.get("source_radius_m"), 20),
            "lock_threshold": _clamp_int(raw.get("lock_threshold"), 85, 1, 100),
            "hold_ms": _clamp_int(raw.get("hold_ms"), 1500, 100),
            "max_signal": _clamp_int(raw.get("max_signal"), 100, 1, 100),
            "noise_floor": _clamp_int(raw.get("noise_floor"), 4, 0, 100),
            "jitter": _clamp_int(raw.get("jitter"), 1, 0, 100),
            "decay_curve": _as_str(raw.get("decay_curve") or "smooth").strip().lower() or "smooth",
            "timeout_ms": _clamp_int(raw.get("timeout_ms"), 0, 0) or None,
            "update_rate_ms": _clamp_int(raw.get("update_rate_ms"), 500, 100),
            "use_audio": _as_bool(raw.get("use_audio"), False),
            "use_vibration": _as_bool(raw.get("use_vibration"), True),
            "use_direction_hint": _as_bool(raw.get("use_direction_hint"), False),
            "false_peaks": false_peaks if isinstance(false_peaks, list) else [],
            "dead_zones": dead_zones if isinstance(dead_zones, list) else [],
        }
        return out

    return {}

def validate_minigame_config(minigame_type, raw_cfg):
    raw = raw_cfg if isinstance(raw_cfg, dict) else {}
    normalized_type = _as_str(minigame_type).strip().lower()
    errors = []

    def add(field, detail):
        errors.append((field, detail))

    return errors

def build_stage_minigame_runtime(node):
    interaction = node.get("interaction") or {}
    minigame_type = _as_str(interaction.get("type") or "signal_hunt").strip().lower() or "signal_hunt"
    if minigame_type not in SUPPORTED_MINIGAME_TYPES:
        minigame_type = "signal_hunt"
    spec = get_minigame_spec(minigame_type)
    config = normalize_minigame_config(minigame_type, interaction.get("config") or {})

    label = (
        spec.get("label")
        or minigame_type.replace("_", " ").title()
    )

    if (
        minigame_type == "circuit_matrix"
        and config.get("game_id") == "sequence_code"
    ):
        label = "Simón Dice"

    if (
        minigame_type == "circuit_matrix"
        and config.get("game_id") == "place_mosaic"
    ):
        label = "Mosaico del lugar"

    if minigame_type == "audio_challenge":
        label = "Desafío de audio"

    return {
        "type": minigame_type,
        "label": label,
        "version": "v1",
        "config": config,
    }
