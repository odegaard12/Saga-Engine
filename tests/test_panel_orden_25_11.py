# -*- coding: utf-8 -*-
"""25/11/2026 (tarde): textos claros en el panel y la ropa comprobada de punta a punta.

- Los dos interruptores dicen lo que pasa al ENCENDERLOS, no el estado de ahora, y con las mismas palabras en «Más» del
  panel de campo y en Ajustes del editor. El de «Exigir estar cerca» se comprobó contra runtime/proximidad.py: sólo
  mira los nodos de GPS, el rescate sin GPS y el modo prueba de Herramientas pasan y quedan marcados, y apagado se pasa
  desde lejos con la sospecha «lejos del nodo».
- La ficha del jugador del editor tapaba «Guardar jugadores»: el nombre o la foto cambiados no se podían guardar sin
  cerrarla antes. Ahora la ficha trae su propio botón.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ADMIN = RAIZ / "frontend" / "src" / "admin"


def leer(*partes: str) -> str:
    return ADMIN.joinpath(*partes).read_text(encoding="utf-8-sig")


def test_los_interruptores_dicen_que_pasa_al_encenderlos_igual_en_el_movil_y_en_el_pc():
    textos = leer("lib", "textosDeAjustes.ts")
    assert "quita el satélite y las fotos y el panel se actualiza cada 45 s en vez de 15 s. No cambia nada a los jugadores." in textos
    assert "Encendido: nadie pasa un nodo de GPS si no está en él" in textos
    assert "el rescate sin GPS de Herramientas sigue funcionando y queda marcado" in textos
    assert "Apagado: se puede pasar desde lejos, pero te sale un aviso." in textos
    mas = leer("components", "campo", "MasDeCampo.tsx")
    assert "detalle={TEXTO_POCOS_DATOS}" in mas and "estado={encendidoApagado(p.pocos)" in mas
    assert "detalle={TEXTO_EXIGIR_CERCA} estado={encendidoApagado(p.exigirCerca)}" in mas
    ajustes = leer("components", "SettingsPanel.tsx")
    assert "<strong>Exigir estar cerca</strong>" in ajustes and "<span>{TEXTO_EXIGIR_CERCA}</span>" in ajustes
    assert "{encendidoApagado(missionDraft.require_server_proximity === 'true')}" in ajustes
    # Los textos de antes (el estado, no lo que hace) no vuelven.
    for viejo in ("El servidor rechaza avances lejos del nodo", "Lejos del nodo sólo se anota un aviso",
                  "Rechazar avances lejos del nodo (con GPS real)"):
        assert viejo not in mas + ajustes, viejo


def test_el_texto_de_exigir_estar_cerca_es_lo_que_hace_el_servidor():
    prox = (RAIZ / "backend" / "app" / "runtime" / "proximidad.py").read_text(encoding="utf-8")
    # Sólo nodos de GPS; el modo prueba y el rescate declarado pasan; apagado nada bloquea.
    assert 'if modo != "gps" or entrada.get("require_proximity") is False:' in prox
    assert re.search(r'"veredicto": MODO_PRUEBA,\s+"bloquea": False,', prox)
    assert '"bloquea": bool(exigir and fiable),' in prox
    assert "RAZON_RESCATE_SIN_GPS" in prox


def test_la_ficha_del_editor_guarda_sin_tener_que_cerrarla():
    jugadores = leer("components", "PlayersPanel.tsx")
    ficha = jugadores[jugadores.index('<summary>Datos del jugador</summary>'):jugadores.index("Eliminar jugador</strong>")]
    assert re.search(r'className="r8-boton primario"\s+onClick=\{onSavePlayers\}', ficha)
    assert "disabled={playerSaveState === 'saving'}" in ficha


GRUPOS_A = ["Partida en directo", "Ruta y nodos", "Juegos y objetos", "Personajes y tienda", "Historia y textos", "Ajustes"]


def test_menu_por_temas_igual_en_el_pc_y_en_mas_del_movil():
    """Propuesta A (elegida por el dueño el 25/11): mismos grupos y en el mismo orden; nada se quita."""
    shell = leer("components", "AdminMissionControlShell.tsx")
    menu = shell[shell.index("const gruposMenu"):shell.index("function pulsarEntrada")]
    assert re.findall(r"titulo: '([^']+)',\r?\n", menu) == GRUPOS_A
    mas = leer("components", "campo", "MasDeCampo.tsx")
    assert re.findall(r'<h3 className="campo-seccion">([^<]+)</h3>', mas) == GRUPOS_A
    # Los mismos nombres en los dos sitios.
    for nombre in ("Jugadores y equipos", "Plantillas de misión", "Personajes y tienda", "Identidad y prólogo",
                   "Ajustes de la misión", "Avisos al organizador", "Simular (pruebas)", "Exportar partida"):
        assert nombre in menu and nombre in mas, nombre
    # Todos los paneles de antes siguen en el menú del PC.
    for panel in ("players", "activity", "match-log", "tiempos", "exportar", "builder", "labels", "objects",
                  "desbloqueables", "mission", "avisos", "simulation"):
        assert f"panelEntrada('{panel}'" in menu, panel
    for accion in ("id: 'campo'", "id: 'add'", "id: 'heatmap'", "id: 'forma'", "id: 'pocos-datos'", "id: 'refresh'",
                   "id: 'copia'", "id: 'novedades'", "id: 'salir'"):
        assert accion in menu, accion
    # «＋ Añadir nodo» es el único nombre para crear nodos: la tira RUTA ya no lleva el suyo y Plantillas sólo enlaza.
    barra = shell[shell.index("<BarraDeNodos"):shell.index("/>", shell.index("<BarraDeNodos"))]
    assert "onCreateNode=" not in barra
    assert "Crear nodo suelto" not in leer("components", "MissionBuilderPanel.tsx")
    assert "onAnadirNodo={p.onAnadirNodo}" not in mas and "p.onAnadirNodo ? <Fila titulo=\"＋ Añadir nodo\"" in mas


def test_selector_de_tipo_de_nodo_legible_en_el_movil():
    """En el móvil los títulos salían en una tira de ~50 px cortada por la derecha y la caja se salía 16 px de la
    pantalla (medido a 360, 375, 390 y 430 px). El icono ocupa las dos filas y la caja mide lo que su hueco."""
    css = leer("styles", "admin-modern-shell.css")
    inicio = css.index("/* 25/11: el ancho es el del hueco")
    movil = css[inicio:re.search(r"\n\}\s*\n", css[inicio:]).start() + inicio]
    assert "width: 100% !important;" in movil and "calc(100vw - 12px)" not in movil
    assert "grid-template-columns: 2rem minmax(0, 1fr) !important;" in movil
    assert "grid-row: 1 / span 2 !important;" in movil
    assert re.search(r"button strong,\s+\.saga-type-chooser-v4-grid button small \{\s+grid-column: 2 !important;", movil)
