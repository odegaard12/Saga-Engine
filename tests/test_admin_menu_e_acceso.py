"""
El admin quedó abandonado y se repasó (5.29.0). Lo que no puede volver:

- "Crear" (asistente de plantillas) sólo existía en el menú del móvil.
- Si el servidor pedía cambiar la contraseña, el panel no tenía pantalla
  para hacerlo: se quedaba en "Access denied" sin salida.
- Un último intento de cargar la misión mandaba la contraseña EN LA
  DIRECCIÓN (?password=...) a una ruta que sólo acepta POST: siempre 405 y
  la clave en los registros del servidor.
- La barra de datos de la ruta iba fija a 75 px y tapaba la fila de botones.
"""
from pathlib import Path

ADMIN = Path(__file__).resolve().parents[1] / "frontend" / "src" / "admin"


def test_menu_agrupado_con_crear_en_escritorio() -> None:
    shell = (ADMIN / "components" / "AdminMissionControlShell.tsx").read_text(encoding="utf-8")
    assert 'className="saga-panel-switcher saga-menu-agrupado"' in shell
    # Un solo menú (ronda 5): la barra lateral del escritorio y la de abajo del
    # móvil salen de `gruposMenu`. Los paneles van con `panelEntrada`, que nunca
    # es «sólo móvil»: Crear está también en el escritorio.
    menu = shell[shell.index("const gruposMenu"):shell.index("function pulsarEntrada")]
    assert "panelEntrada('builder'" in menu, "Crear tiene que estar en el menú de escritorio"
    for panel in ("mission", "labels", "objects", "players", "simulation", "activity", "match-log", "tiempos", "exportar"):
        assert f"panelEntrada('{panel}'" in menu, panel
    for grupo in ("Seguimiento", "Contenido", "Jugadores", "Ajustes"):
        assert f"titulo: '{grupo}'" in menu
    # Y la lista de nodos ya no está en la barra lateral: es la barra horizontal.
    assert "<BarraDeNodos" in shell and "saga-route-list" not in shell


def test_cambio_de_clave_e_sen_clave_na_url() -> None:
    app = (ADMIN / "AdminApp.tsx").read_text(encoding="utf-8")
    api = (ADMIN / "lib" / "adminApi.ts").read_text(encoding="utf-8")
    assert "if (login.must_change)" in app and "payload.status === 'password_change_required'" in app
    assert "changeAdminPassword(actual, claveNueva.trim(), claveRepetida.trim())" in app
    assert "'/api/admin/change-password'" in api
    assert "?${key}=${encodeURIComponent(password)}" not in api, "la clave no puede ir en la dirección"


def test_barra_da_ruta_debaixo_dos_botons() -> None:
    shell = (ADMIN / "components" / "AdminMissionControlShell.tsx").read_text(encoding="utf-8")
    assert "top: posicionHud ? posicionHud.top : 75" in shell and "new ResizeObserver(medir)" in shell
