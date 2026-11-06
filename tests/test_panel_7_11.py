# -*- coding: utf-8 -*-
"""7/11/2026: el panel de admin con la claridad de la propuesta B y el color de ahora, y los fallos de la revisión.

Un test por arreglo. El color no se toca: sólo variables --r5-* (otro trabajo prepara los temas).
"""
from pathlib import Path

ADMIN = Path(__file__).resolve().parent.parent / "frontend" / "src" / "admin"


def leer(relativo: str) -> str:
    return (ADMIN / relativo).read_text(encoding="utf-8-sig")


def sin_comentarios(texto: str) -> str:
    return chr(10).join(l for l in texto.splitlines() if not l.strip().startswith("//"))


def bloque_7_11() -> str:
    css = leer("styles/admin-r5.css")
    return css.split("/* 7/11 (Óscar): la claridad de la propuesta B con el color de ahora.", 1)[1]


def test_el_bloque_nuevo_no_mete_colores_a_mano():
    import re
    b = bloque_7_11()
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(", b), "sólo variables --r5-*"


def test_barra_lateral_en_una_columna_con_raya_en_la_activa():
    b = bloque_7_11()
    assert "flex-direction: column !important;" in b
    assert "border-left-color: var(--r5-acento) !important;" in b
    # «Desblo-queables» partido con guion.
    assert "hyphens: none !important;" in b and "white-space: nowrap !important;" in b


def test_panel_a_toda_la_altura_y_sin_barra_de_nodos():
    b = bloque_7_11()
    assert ".saga-admin-shell:has(.saga-floating-panel) .saga-barra-nodos" in b
    assert "bottom: calc(16px + var(--r5-seguro-abajo)) !important;" in b


def test_tablas_mas_apretadas_y_en_el_movil_se_desplazan_de_lado():
    b = bloque_7_11()
    assert ".saga-floating-body :is(td, th) {\n    padding: 6px 10px !important;" in b
    movil = b.split("@media (max-width: 860px)", 1)[1]
    assert "overflow-x: auto !important;" in movil and "white-space: nowrap !important;" in movil


def test_la_barra_de_la_ruta_no_corta_desnivel_en_el_movil():
    movil = bloque_7_11().split("@media (max-width: 860px)", 1)[1]
    assert "flex-wrap: wrap !important;" in movil and ".saga-hud-sep" in movil


def test_la_barra_de_guardar_es_un_pie_solido_y_la_insignia_no_pisa_el_boton():
    b = bloque_7_11()
    assert ".admin-panel-sticky-actions" in b and "background: var(--r5-fondo) !important;" in b
    assert "body:has(.saga-admin-shell .saga-floating-panel) .saga-build-info.saga-build-info--floating" in b


def test_novedades_con_la_version_real():
    n = leer("components/ReleaseNotesModal.tsx")
    assert "VERSIÓN ACTUAL" not in sin_comentarios(n)
    assert "fetchBuildInfo()" in n and "data-saga-version-publicada" in n


def test_jugador_sin_conexion_nunca_y_la_fila_no_se_descoloca():
    j = leer("components/PlayersPanel.tsx")
    assert "if (marca <= 0) return 'nunca'" in j
    assert "visto === 'nunca' ? 'nunca conectado'" in j
    assert '<span className="r7-jugador-caras">' in j
    css = leer("styles/admin-r7-paneles.css")
    assert "grid-template-columns: auto minmax(140px, 1.3fr) minmax(120px, 0.8fr) minmax(150px, 1fr);" in css
    assert ".r7-jugador-principal .r7-jugador-caras {\n    grid-area: avatar;" in css


def test_un_grupo_de_una_sola_entrada_va_directo():
    s = leer("components/AdminMissionControlShell.tsx")
    assert "grupo.entradas.length === 1\n                ? pulsarEntrada(grupo.entradas[0])" in s


def test_titulo_por_defecto_en_castellano():
    a = leer("AdminApp.tsx")
    assert "admin_title: missionDraft.admin_title || 'Control de misión'" in a
    assert "Mission editor" not in sin_comentarios(a) and "Map-first control panel" not in a


def test_chinchetas_en_singular_o_plural():
    o = leer("components/ObjectsPanel.tsx")
    assert "chincheta(s)" not in o
    assert "missingInputs.length === 1 ? 'chincheta' : 'chinchetas'" in o


def test_el_mapa_del_constructor_usa_el_del_jugador_y_no_carto():
    m = leer("AdminMissionMap.tsx")
    assert "cartocdn" not in m
    assert "/map-tiles/{z}/{x}/{y}.png" in m
    assert "'CAMIÑO'" not in leer("components/AdminMissionControlShell.tsx")


def test_la_copia_de_respaldo_baja_json_y_gpx():
    s = leer("components/AdminMissionControlShell.tsx")
    bloque = s.split("async function handleExportBackup()", 1)[1][:1800]
    assert "saga-copia-${marcaDeTiempo()}.json" in bloque and "saga-ruta-${marcaDeTiempo()}.gpx" in bloque
