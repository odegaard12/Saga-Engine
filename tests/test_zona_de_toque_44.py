"""Zona de toque de 44 px en lo que se pulsa andando, sin cambiar el dibujo (22/10).

La auditoría del banco (sim/playwright-bench, `auditoria-interfaz`) medía las
burbujas del mapa en 38, la X de mochila/herramientas/clasificación en 36 y las
pestañas de la mochila en 35 de alto. Se agranda sólo lo que toca el dedo con una
capa invisible (`::after`) que crece hasta 44; el banco ya la cuenta al medir.
"""
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "frontend" / "src"


def test_la_capa_invisible_existe_y_crece_hasta_44():
    css = (SRC / "mobile-themes.css").read_text(encoding="utf-8")
    assert ".saga-hud-quick button::after,\n.saga-toque::after {" in css
    assert "top: min(0px, calc((100% - 44px) / 2));" in css


def test_la_llevan_las_x_y_las_pestanas():
    hud = (SRC / "player" / "components" / "PlayerHud.tsx").read_text(encoding="utf-8")
    assert hud.count('className="saga-toque"') >= 6, "dos X, tres pestañas y «Cambiar de jugador»"
    ranking = (SRC / "player" / "components" / "RankingSheet.tsx").read_text(encoding="utf-8")
    assert 'className="saga-toque" style={closeBtn}' in ranking


def test_cambiar_de_jugador_ya_no_sale_en_galego_en_castellano():
    hud = (SRC / "player" / "components" / "PlayerHud.tsx").read_text(encoding="utf-8")
    assert "'Cambiar de jugador'" in hud
    assert "\n              Cambiar de xogador\n" not in hud


def _bloque(fuente: str, nombre: str) -> str:
    """El cuerpo de `const <nombre>: CSSProperties = { ... }` hasta su llave de cierre."""
    inicio = fuente.index(f"const {nombre}: CSSProperties = {{")
    return fuente[inicio : fuente.index("\n}\n", inicio)]


def test_44_de_verdad_y_no_solo_con_la_capa_invisible():
    """23/10: «Permitir» medía 85x40, «Actualizar juego offline» 42 de alto y las
    pestañas de la mochila 103x35 (con la capa invisible el banco no las cantaba).
    Ahora la caja misma llega a 44."""
    comp = SRC / "player" / "components"
    casos = [
        ("FieldPrepPanel.tsx", "boton"),  # «Permitir» de «antes de salir»
        ("MissionPackPanel.tsx", "button"),  # «Actualizar juego offline»
        ("PlayerHud.tsx", "tabButton"),  # Guía / Objetos / Mesa
    ]
    for fichero, estilo in casos:
        cuerpo = _bloque((comp / fichero).read_text(encoding="utf-8"), estilo)
        assert "minHeight: 44," in cuerpo, f"{fichero}:{estilo} por debajo de 44"
