# -*- coding: utf-8 -*-
"""Reagrupación del catálogo de minijuegos en 5 familias claras del admin
(«Llegar y escanear», «Puzles», «Movimiento», «Orientación», «Sonido»).

Es solo agrupación de PRESENTACIÓN: ningún id que viaje en datos de misión
cambia (interaction_type, game_id, family del runtime del jugador o del
anti-cheat). Estas pruebas leen el código fuente en vez de ejecutarlo -no hay
runner de tests de JS en este repo, ver frontend/package.json- siguiendo el
mismo patrón que tests/test_antitrampa_captura_de_patron.py.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
GAME_CATALOG = RAIZ / "frontend" / "src" / "admin" / "lib" / "gameCatalog.ts"
DISPLAY_FAMILIES = RAIZ / "frontend" / "src" / "admin" / "lib" / "displayFamilies.ts"
GUIDED_UTILS = RAIZ / "frontend" / "src" / "admin" / "components" / "guided-editor" / "guidedEditorUtils.ts"
RUNTIME_BRIDGE = RAIZ / "frontend" / "src" / "player" / "minigames" / "core" / "runtime-bridge.ts"
ADMIN_PY = RAIZ / "backend" / "app" / "routers" / "admin.py"

VALID_DISPLAY_FAMILIES = {
    "llegar_y_escanear",
    "puzles",
    "movimiento",
    "orientacion",
    "sonido",
    # Sexta familia de presentación (owner-approved "Trampa de palabras"):
    # primera familia TÉCNICA nueva desde v5.36 (word_trap/trampa_palabras).
    "desafio",
}


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


def extraer_ids_do_catalogo() -> list[str]:
    """Los ids de adminGameCatalog, en el orden en que aparecen."""
    codigo = leer(GAME_CATALOG)
    inicio = codigo.index("export const adminGameCatalog")
    fin = codigo.index("\n]\n", inicio)
    bloque = codigo[inicio:fin]
    return re.findall(r"^\s*id:\s*'([a-z_]+)'", bloque, flags=re.MULTILINE)


def extraer_mapa_de_familias() -> dict[str, str]:
    codigo = leer(DISPLAY_FAMILIES)
    inicio = codigo.index("DISPLAY_FAMILY_BY_GAME_ID")
    fin = codigo.index("\n}", inicio)
    bloque = codigo[inicio:fin]
    pares = re.findall(r"^\s*([a-z_]+):\s*'([a-z_]+)',?\s*$", bloque, flags=re.MULTILINE)
    return dict(pares)


def test_shake_antenna_charge_legacy_segue_resolvendo_a_logic_circuit():
    """El id legacy no tiene entrada propia en el catálogo a propósito -ver
    el comentario de AdminGameId en gameCatalog.ts-, pero runtime-bridge.ts
    tiene que seguir redirigiendo misiones viejas con ese game_id a
    circuit_matrix/logic_circuit para que sigan jugándose igual."""
    codigo = leer(RUNTIME_BRIDGE)
    idx = codigo.index("gameId === 'shake_antenna_charge'")
    fragmento = codigo[idx : idx + 300]
    assert "'circuit_matrix'" in fragmento, (
        "shake_antenna_charge ya no redirige a circuit_matrix: rompería misiones viejas"
    )


def test_backend_engade_as_5_familias_sen_quitar_as_de_antes():
    codigo = leer(ADMIN_PY)
    assert '"display_families": DISPLAY_FAMILIES' in codigo
    assert '"display_family_counts": display_family_counts' in codigo
    # Las claves viejas se mantienen por si alguien ya las lee.
    assert '"families": [' in codigo
    assert '"family_counts": family_counts,' in codigo


def test_display_family_for_stage_usa_game_id_e_ten_fallback_por_tipo():
    from backend.app.routers.admin import display_family_for_stage

    assert display_family_for_stage("circuit_matrix", "sequence_code") == "puzles"
    assert display_family_for_stage("circuit_matrix", "tilt_maze") == "movimiento"
    assert display_family_for_stage("motion_challenge", "shake_charge") == "movimiento"
    assert display_family_for_stage("bearing_hunt", None) == "orientacion"
    assert display_family_for_stage("audio_challenge", "") == "sonido"
    assert display_family_for_stage("word_trap", "trampa_palabras") == "desafio"
    assert display_family_for_stage("word_trap", None) == "desafio"
    # Nodo viejo sin game_id: cae por su family técnica, nunca revienta.
    assert display_family_for_stage("signal_hunt", None) == "llegar_y_escanear"
    assert display_family_for_stage("circuit_matrix", None) == "puzles"
    # Tipo desconocido: no debe reventar, cae al grupo por defecto.
    assert display_family_for_stage("algo_raro", "algo_raro") == "llegar_y_escanear"


# Las pruebas por subcadena de «el juego aparece en la lista X» (catálogo,
# familia de presentación, editor propio) se sustituyeron por la prueba
# parametrizada tests/test_registro_de_minijuegos.py (shared/game_registry.json).
