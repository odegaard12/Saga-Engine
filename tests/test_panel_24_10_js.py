# -*- coding: utf-8 -*-
"""Revisión del 24/10/2026 del panel del organizador (tests/js/panel_24_10.cjs).

- El mapa pedía la vista ENTERA del panel (nodos, ajustes y fotos de todos) cada 15 s para pintar a los jugadores,
  también con la pestaña oculta y sin red. Ahora hay un sondeo compartido y ligero (estadoEnVivo.ts) que se para
  con la pestaña oculta y espera cada vez más si falla. La lista de Jugadores lo usa: se mueve sola y marca a quien
  se ha atascado en un nodo.
- «+1 nodo» ponía 5 min de penalización sin preguntar; «Finalizar» tampoco decía que la pone.
- Jugadores sin PIN con los PIN puestos: se avisa al guardar.
- El álbum pedía 180 fotos y decía «180 fotos guardadas» aunque hubiera más.
- Textos en inglés del panel.

Sin Node o sin frontend/node_modules, lo de JS se salta.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
ADMIN = RAIZ / "frontend" / "src" / "admin"
ARNES = RAIZ / "tests" / "js" / "panel_24_10.cjs"


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    proceso = subprocess.run(
        [node, str(ARNES)], capture_output=True, text=True, encoding="utf-8", timeout=240, cwd=str(RAIZ)
    )
    assert proceso.returncode == 0, proceso.stderr[-3000:]
    datos = json.loads(proceso.stdout)
    errores = {k: v["__error"] for k, v in datos.items() if isinstance(v, dict) and "__error" in v}
    assert not errores, errores
    return datos


def _leer(relativo):
    return (ADMIN / relativo).read_text(encoding="utf-8")


def test_un_solo_sondeo_parado_con_la_pestana_oculta_y_con_espera_sin_red(js):
    r = js["sondeo"]
    assert r["trasSuscribirDos"] == 1, "dos que miran, una sola petición"
    assert r["dosRecibe"]
    assert r["conLaPestanaOculta"] == 0, "con la pestaña oculta no se pide"
    assert r["alVolver"] == 1, "al volver a la pestaña se pide en el acto"
    assert r["fallos"] == 1 and r["sigueElUltimoBueno"] == 2, "sin red se queda lo último bueno"
    assert r["serverTs"] == 5000
    assert r["oyentesDeVisibilidad"] == 1
    assert r["trasQuitarATodos"] == 0, "sin nadie mirando, se para"
    assert r["esperas"] == [15000, 30000, 60000, 120000, 120000]


def test_atascado_es_mucho_rato_en_el_mismo_nodo_dando_senales(js):
    r = js["atascos"]
    assert r["minutos"] == 25
    assert r["sinDato"] is None and r["sinHora"] is None and r["terminado"] is None
    assert (r["atascado"], r["reciente"], r["enElLimite"]) == (True, False, True)
    assert r["sinConexion"] is False, "sin conexión ya sale como tal, no como atascado"
    assert r["umbral"] == 20


def test_el_sondeo_no_devuelve_atras_lo_que_acaba_de_hacer_el_panel(js):
    r = js["progreso"]
    assert r["sinAcciones"]["level"] == 3
    assert r["pedidoAntesDeAcabar"]["level"] == 4
    assert r["enCurso"]["level"] == 4
    assert r["pedidoDespues"]["level"] == 3
    assert r["sinSondeo"]["level"] == 4


def test_mover_a_un_jugador_pregunta_y_dice_el_coste(js):
    r = js["confirmaciones"]
    assert "5 minutos de penalización" in r["avanzar"]
    assert "5 minutos de penalización" in r["finalizar"]
    assert "No se puede deshacer" in r["reiniciar"]
    assert r["retroceder"]
    # «Restaurar nodo» ya pregunta en la ficha; dar o quitar objetos, en su menú.
    assert r["restaurar"] is None and r["darObjeto"] is None
    assert r["vacioAtascado"]["titulo"] == "Nadie está atascado"

    app = _leer("AdminApp.tsx")
    assert "confirmacionDeAccion(accionBase, nombre)" in app
    assert "¿Seguro que quieres" not in app


def test_aviso_de_jugadores_sin_pin_y_texto_del_album(js):
    r = js["avisos"]
    assert r["nadie"] is None and r["sinDato"] is None
    assert "ANA" in r["uno"] and "Generar PIN para los que faltan" in r["uno"]
    assert "8 no tienen PIN" in r["muchos"] and "y 2 más" in r["muchos"]
    f = r["fotos"]
    assert (f["cero"], f["una"], f["pocas"]) == ("No hay fotos guardadas.", "1 foto guardada.", "12 fotos guardadas.")
    assert "puede haber más" in f["llenas"]
    assert f["limite"] == 400, "el máximo que da el servidor (list_field_proof_records)"

    app = _leer("AdminApp.tsx")
    assert "avisoJugadoresSinPin(saved.jugadoresSinPin)" in app
    ajustes = _leer("components/SettingsPanel.tsx")
    assert "limit=180" not in ajustes and "textoFotosGuardadas(pruebas.length)" in ajustes
    assert 'loading="lazy"' in ajustes
    assert "estado.sin_pin.join" in ajustes


def test_el_mapa_y_la_lista_usan_el_sondeo_ligero():
    mapa = _leer("AdminMissionMap.tsx")
    assert "fetchAdminReactOverview" not in mapa, "el mapa ya no pide la vista entera cada 15 s"
    assert "useEstadoEnVivo(showHeatmap)" in mapa
    assert "setInterval(() => {\n      if (showHeatmap)" not in mapa
    jugadores = _leer("components/PlayersPanel.tsx")
    assert "useEstadoEnVivo()" in jugadores
    assert "['atascado', 'Atascados']" in jugadores
    assert "'/api/admin/mission-status'" in _leer("lib/adminApi.ts")


def test_sin_textos_en_ingles_en_el_panel():
    ajustes = _leer("components/SettingsPanel.tsx")
    for ingles in ('placeholder="Map-first control panel"', 'placeholder="Protected access"', 'placeholder="Mission Control"'):
        assert ingles not in ajustes
    app = _leer("AdminApp.tsx")
    assert "'Unknown error'" not in app
    assert "«Display name»" not in app
