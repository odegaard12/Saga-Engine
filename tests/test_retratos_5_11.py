# -*- coding: utf-8 -*-
"""Retratos de los jugadores (5/11, Óscar: «debe aparecer la cara del jugador, no del personaje»).

Con foto de perfil, el retrato del mapa y de la ficha es SU FOTO, también el tuyo; sin foto (o mientras no llega), una
silueta en su color, igual para todos. Nunca la cara del personaje 3D.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RETRATO = RAIZ / "frontend" / "src" / "player" / "avatares" / "retratoDeMapa.ts"
MAPA = RAIZ / "frontend" / "src" / "player" / "components" / "MapSurfaceGL.tsx"


def test_el_retrato_del_mapa_es_la_foto_o_la_silueta_nunca_el_personaje():
    fuente = RETRATO.read_text(encoding="utf-8")
    assert "urlDeCara" not in fuente and "MX_NOMBRES" not in fuente, "ya no se pinta la cara ni la inicial del personaje"
    assert "pintar(nuevo.ctx, color, foto)" in fuente and "pintar(nuevo.ctx, color, null)" in fuente
    assert "// Sin foto: silueta en el color del jugador" in fuente and "ctx.fillStyle = color" in fuente


def test_la_ficha_y_la_clasificacion_tambien_foto_o_silueta():
    fuente = RETRATO.read_text(encoding="utf-8")
    dom = fuente[fuente.index("export function elementoDeRetrato(") :]
    assert "img.onerror = silueta" in dom and "if (!foto || !urlDeFotoValida(foto)) {" in dom
    assert 'style="fill:${color}"' in dom, "también con colores var(--…) de la clasificación"


def test_tu_retrato_usa_tu_foto_y_la_foto_no_se_pide_en_cada_latido():
    mapa = MAPA.read_text(encoding="utf-8")
    assert "idDeRetratoConFoto(miFoto, miAspectoRef.current.mx, miColorRef.current)" in mapa
    assert "precargarCaras" not in mapa and "reintentarCaras" not in mapa
    fuente = RETRATO.read_text(encoding="utf-8")
    # Una descarga por dirección: la imagen se guarda en `fotos` y se reutiliza en cada repintado.
    assert "const f = fotos.get(url)" in fuente and "fotos.set(url, img)" in fuente
