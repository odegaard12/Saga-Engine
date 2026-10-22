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
