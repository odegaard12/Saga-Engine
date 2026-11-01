# -*- coding: utf-8 -*-
"""Tanda de diseño del 31/10/2026 (aprobada por Óscar): seis propuestas de la revisión del 30/10 y la celebración del
nodo en el mapa, que no se veía.

Pizarra D1 y todo lo animado se apaga con «reducir movimiento». Sin tocar lógica, relojes ni onWin.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src"
COMP = SRC / "player" / "components"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


# 1 · Carga: fase propia mientras el mapa pinta su primera vista ---------------------------------------------------


def test_carga_no_se_queda_en_todo_listo_mientras_prepara_el_mapa():
    c = leer(COMP / "PantallaDeCarga.tsx")
    assert "tituloMapa: 'Preparando el mapa…'" in c and "tituloMapa: 'Preparando o mapa…'" in c
    assert "const mapaEnCurso = continuar && preparandoMapa && listo && !fallo" in c
    # Sin número: la barra pasa a indeterminada (se desliza) y con reducir movimiento queda quieta.
    assert "const pct = mapaEnCurso || real === null ? null" in c
    assert "data-indeterminada={pct === null ? '' : undefined}" in c
    assert "@media (prefers-reduced-motion: reduce)" in c and "[data-indeterminada] { animation: none" in c
    app = leer(SRC / "player" / "PlayerApp.tsx")
    assert "preparandoMapa={!mapaListo && !permisosPendientes && !payload.finished}" in app


# 2 · GPS: con una posición vieja, «Buscando señal…» -----------------------------------------------------------------


def test_posicion_vieja_dice_buscando_senal():
    hud = leer(COMP / "PlayerHud.tsx")
    assert "const buscandoSenal = !finished && primaryReason === 'gps_unavailable' && distanceMeters !== null" in hud
    assert "const etiqueta = buscandoSenal ? 'Buscando señal…' : primaryLabel" in hud
    assert "`${etiqueta} · ${distanceLabel}`" in hud and "`${primaryLabel} · ${distanceLabel}`" not in hud
    assert "'Buscando señal…': 'Buscando sinal…'" in leer(SRC / "i18n" / "legacySpanishBridge.ts")


# 3 y 4 · Trampa de palabras ---------------------------------------------------------------------------------------


def test_trampa_marca_la_buena_al_fallar_y_el_aviso_solo_en_la_ronda_fallada():
    w = leer(SRC / "player" / "minigames" / "families" / "wordTrap" / "RuntimeScreen.tsx")
    # La buena se busca con el mismo hash que la respuesta, y sólo tras fallar o agotar el tiempo.
    assert "if ((await sha256Hex(`${ronda.salt}:${i}`)) === ronda.answer_hash)" in w
    assert w.count("marcarBuena(round, roundIndex)") == 2
    assert "rondaEnPantallaRef.current === ronda0" in w, "si llega tarde no pinta la ronda siguiente"
    assert "revealed && (correctIndex === index || buenaIndex === index)" in w
    assert "setBuenaIndex(null)" in w
    assert "penaltyAccumMs > 0 && (result === 'wrong' || result === 'timeout')" in w
    assert ".wtp-option.wtp-option-correct { animation: none; }" in w
    # Lo que se cuenta no cambia: onWin con la penalización acumulada.
    assert "void onWin(nextPenaltyAccumMs)" in w


# 5 · Medallas de Misión completada --------------------------------------------------------------------------------


def test_medallas_grandes_con_brillo_y_entrada():
    m = leer(COMP / "MissionCompleteScreen.tsx")
    assert "idx < 3 ? 'saga-rank-pos saga-rank-pos--medalla' : 'saga-rank-pos'" in m
    assert "font-size: 26px;" in m and "drop-shadow(0 0 6px rgba(251, 191, 36, 0.75))" in m
    assert "@keyframes sagaMedallaEntra" in m and ".saga-rank-pos--medalla { animation: none; }" in m


# 6 · «¡Superado!» en la hoja, para todos los minijuegos -------------------------------------------------------------


def test_superado_en_la_envoltura_comun():
    hoja = leer(COMP / "InteractionSheet.tsx")
    assert "import { FESTEJO_EN_HOJA_MS, SuperadoEnHoja } from './SuperadoEnHoja'" in hoja
    assert "usePresencia((open && Boolean(currentStageProp)) || festejo !== null)" in hoja
    assert "useCubreElMapa(open || festejo !== null)" in hoja, "la celebración del mapa espera a que se vaya"
    gana = hoja.split("async function handleNativeWin(", 1)[1].split("function reintentarEnvio", 1)[0]
    # Sale antes de enviar (con el tiempo ya calculado) y se quita si el envío no se acepta.
    assert gana.index("const tempo =") < gana.index("setFestejo({ ms: tempo, pen: castigo })") < gana.index(
        "await onSubmitCode('OK', tempo, castigo)"
    )
    assert "setFestejo(null)" in gana.split("if (!superado) {", 1)[1]
    s = leer(COMP / "SuperadoEnHoja.tsx")
    assert "export const FESTEJO_EN_HOJA_MS = 1700" in s
    assert "¡Superado!" in s and "Tiempo del nodo" in s and "saga-superado-confeti" in s
    assert "@media (prefers-reduced-motion: reduce)" in s and ".saga-superado-anillo, .saga-superado-confeti { display: none; }" in s


# 7 · Celebración del nodo en el mapa -------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def efectos():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin Node o sin frontend/node_modules")
    p = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "clasificacion_y_efectos_24_10.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=240, cwd=str(RAIZ),
    )
    assert p.returncode == 0, p.stderr[-3000:]
    return json.loads(p.stdout)


def test_pulso_dorado_del_nodo_hecho(efectos):
    p = efectos["efectos"]["pulso"]
    assert p["pulsado"] is True and p["piezas"] == 4 and p["animaciones"] == 4, "3 anillos y el resplandor, en el suelo"
    assert p["oro"] is True and p["ms"] <= 1500
    r = efectos["efectosReducido"]["pulso"]
    assert r["pulsado"] is False and r["piezas"] == 0


def test_la_celebracion_usa_el_pulso_y_no_retrasa_el_vuelo():
    mapa = leer(COMP / "MapSurfaceGL.tsx")
    i = mapa.index("const sellado = sellarNodo(mapa, donde)")
    assert "const pulso = pulsoDorado(mapa, donde)" in mapa[i : i + 400]
    # Con pulso, la fuente ya no lleva onda, brillo ni chispas (se maquetaban con más retraso que el festejo).
    assert "if (!pulso) features.push(punto({ tipo: 'brillo'" in mapa
    assert "if (!plan.reducido && !pulso) {" in mapa
    # El vuelo sigue en su sitio: al pasar a la fase «vuelo», sin esperar a nada.
    assert "if (cambio && fase === 'vuelo') volar()" in mapa


# 8 · Editar jugador (admin) y ficha del jugador, a 390 y 360 -------------------------------------------------------


def test_la_ficha_del_admin_no_queda_encajada_en_el_panel():
    """Las entradas de los paneles con `fill: both` dejaban una animación de transform puesta, y eso hace del panel el
    bloque contenedor de lo que va en position: fixed: la ficha salía corrida a la izquierda, del alto del panel y sin
    poder bajar (3095 px de ficha en un hueco de 764)."""
    r5 = leer(SRC / "admin" / "styles" / "admin-r5.css")
    assert "animation: sagaR5PanelEntra 200ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;" in r5
    assert "sagaR5PanelEntra 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both" not in r5
    shell = leer(SRC / "admin" / "styles" / "admin-modern-shell.css")
    assert "animation: saga-admin-panel-in 180ms ease-out backwards;" in shell
    assert "saga-admin-panel-in 180ms ease-out both" not in shell
    r7 = leer(SRC / "admin" / "styles" / "admin-r7-paneles.css")
    assert "padding-bottom: calc(96px + var(--r5-seguro-abajo, 0px));" in r7, "lo último sube por encima de la barra"
    assert "font-size: 16px !important;" in r7 and "::file-selector-button" in r7
    assert ".admin-player-avatar-preview-row > div:last-child {" in r7, "«Foto guardada» y su tamaño, en dos líneas"


def test_la_foto_de_la_ficha_del_jugador_no_pisa_la_x_en_pantallas_bajas():
    f = leer(SRC / "player" / "avatares3d" / "mixamo" / "ficha.css")
    bloque = f.split("@media (max-height: 760px) {", 1)[1].split("\n}", 1)[0]
    assert "justify-content: flex-end;" in bloque and "width: min(100%, 128px);" in bloque


# 1/11 · El pulso nace en la base y no se va de su sitio --------------------------------------------------------------


def test_las_piezas_del_mapa_separan_posicion_y_dibujo():
    """La propiedad `scale` se aplica después del `transform` que coloca la pieza: con las dos en el mismo elemento, el
    anillo que crecía escalaba también su posición y acababa lejos del nodo. El dibujo va dentro de su contenedor."""
    e = leer(COMP / "efectosDelMapa.ts")
    cuerpo = e.split("function pieza(", 1)[1].split("\n}", 1)[0]
    assert "el.appendChild(dibujo)" in cuerpo and "return dibujo" in cuerpo
    assert "el.style.transform = `translate(" in cuerpo and "dibujo.style.cssText = estilo" in cuerpo
    pulso = e.split("export function pulsoDorado(", 1)[1].split("\n}", 1)[0]
    # Todo en el suelo (alzado 0): nada en la chincheta.
    assert ", 70" not in pulso and "translate:" not in pulso
