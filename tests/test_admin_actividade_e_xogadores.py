"""Auditoría 2026-09-25: rutas de admin montadas que ningún botón llamaba.

Comprobaciones estáticas (sin levantar servidor, al estilo de
test_admin_menu_e_acceso.py) de que:

- "Actividad" (nuevo panel) lee /api/admin/events y puede marcar un evento
  con /api/admin/events/mark, y está enganchado al menú agrupado.
- El panel de Jugadores puede borrar datos personales
  (/api/admin/datos-personales) con confirmación real, sin exponer la clave.
- El editor de nodo (NodeDetailDrawer) se quedó sin la cabecera duplicada
  oculta por CSS ni el pie "Close" en inglés, también oculto.

/api/admin/player/restore-node se dejó sin usar a propósito: "Restaurar
Nodo" en PlayersPanel ya hace lo mismo llamando a /api/admin/profile-action
con action=restore_node.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / "frontend" / "src" / "admin"


def _leer(*partes: str) -> str:
    return (ADMIN / Path(*partes)).read_text(encoding="utf-8")


def test_panel_actividad_lee_e_marca_eventos() -> None:
    panel = _leer("components", "ActivityPanel.tsx")
    assert "fetchAdminEvents" in panel
    assert "markAdminEvent" in panel

    api = _leer("lib", "adminApi.ts")
    assert "'/api/admin/events'" in api
    assert "'/api/admin/events/mark'" in api


def test_actividade_enganchada_ao_menu_agrupado() -> None:
    shell = _leer("components", "AdminMissionControlShell.tsx")
    assert "import ActivityPanel from './ActivityPanel'" in shell
    assert "panel: 'activity'" in shell
    assert "<ActivityPanel />" in shell

    # Las dos copias del tipo CmsPanel (shell y AdminApp) tienen que ir a la
    # vez: si sólo una lleva 'activity', tsc rompe al pasar el setter entre
    # componentes (ya pasó al escribir esto).
    app = _leer("AdminApp.tsx")
    assert "'activity'" in shell.split("type CmsPanel")[1].split("\n")[0]
    assert "'activity'" in app.split("type CmsPanel")[1].split("\n")[0]


def test_datos_personales_esixe_confirmacion_sen_clave_na_chamada() -> None:
    api = _leer("lib", "adminApi.ts")
    assert "'/api/admin/datos-personales'" in api
    assert "confirmacion: 'BORRAR'" in api

    players = _leer("components", "PlayersPanel.tsx")
    assert "purgeDatosPersonales" in players
    assert "fetchDatosPersonales" in players
    # Acción destructiva sobre personas reales: hay que ESCRIBIR "BORRAR"
    # (un "Aceptar" por descuido no basta).
    bloque = players[players.index("async function borrarDatosPersonales") :]
    antes = bloque[: bloque.index("setCargandoPersonales(true)")]
    assert "window.prompt(" in antes and "!== 'BORRAR'" in antes


def test_restaurar_nodo_xa_usaba_profile_action_e_non_a_ruta_dedicada() -> None:
    """La ruta /api/admin/player/restore-node se deja sin usar a propósito."""
    players = _leer("components", "PlayersPanel.tsx")
    assert "onProfileAction(draft.id, 'restore_node'" in players
    assert "/api/admin/player/restore-node" not in players

    api = _leer("lib", "adminApi.ts")
    assert "/api/admin/player/restore-node" not in api


def test_node_detail_drawer_sen_cabeceira_duplicada_nin_close_en_ingles() -> None:
    drawer = _leer("components", "NodeDetailDrawer.tsx")
    assert "admin-node-editor-inline-topbar" not in drawer
    assert "admin-drawer-footer" not in drawer
    assert ">Close<" not in drawer
    assert "DrawerTab" not in drawer
    assert "renderActivationPanel" not in drawer
    # La cabecera que sí se ve (con "Cerrar ×") se queda.
    assert 'className="admin-drawer-head admin-drawer-head--modern admin-node-editor-topbar"' in drawer
    assert drawer.count("Cerrar ×") >= 1
