"""
El panel "Antes de salir" mezclaba idiomas: "Movemento" y "Seguir sen iso"
en gallego junto a "Lo denegaste. Ajustes del móvil › Safari" en castellano
(y Safari también en Android). Cada texto tiene que salir de su idioma.
"""
from pathlib import Path

PANEL = Path(__file__).resolve().parents[1] / "frontend" / "src" / "player" / "components" / "FieldPrepPanel.tsx"


def test_o_panel_de_permisos_fala_un_idioma_e_sabe_o_movil() -> None:
    fonte = PANEL.read_text(encoding="utf-8")
    uso = fonte[fonte.index("export function FieldPrepPanel({"):]
    # Nada escrito a mano en el cuerpo: todo del diccionario.
    for literal in ("'Movemento'", "'Seguir sen iso'", "Ajustes del móvil › Safari", "'Escanear as pegatinas QR'", ">ANTES DE SALIR<"):
        assert literal not in uso, literal
    assert "const tx = locale === 'gl' ? TEXTOS_PANEL.gl : TEXTOS_PANEL.es" in uso
    assert "esIos()" in uso and "tx.denegadoOtro" in uso
