# -*- coding: utf-8 -*-
"""24/11 (dueño): la entrada al panel se ve SIEMPRE: «Admin» en el login y en la bienvenida, «Panel admin» en
Herramientas. Todas van a `/admin-react` (no a `/admin`, que manda Clear-Site-Data) y el panel pide su contraseña."""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1] / "frontend" / "src"


def _leer(ruta):
    return (RAIZ / ruta).read_text(encoding="utf-8-sig")


def test_herramientas_tiene_el_panel_admin_siempre_visible():
    hud = _leer("player/components/PlayerHud.tsx")
    enlace = hud[hud.index("data-saga-panel-admin") - 200 : hud.index("data-saga-panel-admin") + 200]
    assert "href={adminHref}" in enlace and "t('player.tools.adminPanel', locale)" in hud
    # No depende del modo organizador: está fuera del bloque `{organizador ? (`.
    assert hud.index("data-saga-panel-admin") > hud.index("data-saga-organizador")
    assert "  adminHref,\r\n" in hud or "  adminHref,\n" in hud
    assert "const adminHref = '/admin-react'" in _leer("player/PlayerApp.tsx")


def test_login_y_bienvenida_llevan_al_panel_nuevo_y_no_a_admin():
    for ruta in ("login/LoginApp.tsx", "player/components/Bienvenida.tsx"):
        fuente = _leer(ruta)
        assert 'href="/admin-react"' in fuente and "data-saga-panel-admin" in fuente, ruta
        assert 'href="/admin"' not in fuente, ruta


def test_el_texto_esta_en_castellano_y_en_gallego():
    catalogo = _leer("i18n/index.ts")
    assert catalogo.count("adminPanel: 'Panel admin'") == 2
