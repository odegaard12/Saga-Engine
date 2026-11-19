"""6.12.0: moneda dorada al completar un nodo, contador que rueda, zonas táctiles de 44 y «?» legible (código fuente)."""
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "frontend" / "src" / "player"


def leer(ruta: str) -> str:
    return (SRC / ruta).read_text(encoding="utf-8").replace("\r\n", "\n")


def test_la_moneda_dorada_es_un_cambio_de_icono_y_vuelve():
    mapa = leer("components/MapSurfaceGL.tsx")
    assert "(hecho|actual|pendiente|oro)" in mapa and "(hecho|actual|siguiente|pendiente|oro)" in mapa
    assert "oroIconos" in mapa and "oroRef.current = plan.nodoHecho" in mapa
    assert "oroRef.current = -1" in mapa and "ORO_MONEDA_MS" in mapa
    # sin setPaintProperty en el retorno, sin rAF nuevo
    cuerpo = mapa.split("oroRef.current = plan.nodoHecho")[1].split("const { plan }")[0][:900]
    assert "setPaintProperty" not in cuerpo and "requestAnimationFrame" not in cuerpo
    # ahorro: sin destello DOM; reducido: sin destello (lo decide efectosDelMapa)
    assert "if (!ahorro) destelloDeMoneda" in mapa
    assert "plan.reducido || ahorro ? 1000 : ORO_MONEDA_MS" in mapa


def test_la_variante_oro_se_hornea_en_2d_y_3d_sin_cambiar_el_hecho():
    mapa = leer("components/MapSurfaceGL.tsx")
    assert "estado === 'oro' ? '#fbbf24' : estado === 'hecho' ? '#94a3b8'" in mapa  # el hecho sigue gris-plata
    bola = leer("components/bolaRenderizada.ts")
    assert "oro = false" in bola and "-oro" in bola and "new THREE.Color(0xfbbf24)" in bola
    assert "const GRIS_HECHO = '#9ca3af'" in bola


def test_destello_breve_y_de_un_solo_uso():
    fx = leer("components/efectosDelMapa.ts")
    assert "export const DESTELLO_MS = 700" in fx and "export const ORO_MONEDA_MS = 1600" in fx
    cuerpo = fx.split("export function destelloDeMoneda")[1].split("\n}\n")[0]
    assert "prefiereMenosMovimiento(matchMedia)) return false" in cuerpo
    assert "iterations" not in cuerpo and "Infinity" not in cuerpo
    assert "scale: '0.4'" in cuerpo and "scale: '1.8'" in cuerpo


def test_el_contador_rueda_solo_al_cambiar_y_se_apaga():
    shell = leer("components/PlayerShell.tsx")
    assert "saga-cuenta-rueda" in shell and "previo.current !== progress.current" in shell
    assert "{progress.current}</span>" in shell and "`/${progress.total}`" in shell
    css = leer("components/map-surface.css")
    bloque = css.split("@keyframes saga-cuenta-rueda")[1][:900]
    assert "infinite" not in bloque
    assert "prefers-reduced-motion: reduce" in bloque and "html.saga-ahorro .saga-cuenta-rueda" in bloque
    assert "transform: translateY" in bloque and "opacity" in bloque


def test_zonas_tactiles_de_44():
    hud = leer("components/PlayerHud.tsx")
    assert "minWidth: 44,\n  width: 44,\n  height: 44," in hud
    assert "width: 44,\n  height: 44,\n  display: 'flex'" in hud  # botón de la Guía
    est = leer("playerAppEstilos.ts")
    assert "width: 44,\n  height: 44,\n  minWidth: 44,\n  minHeight: 44," in est
    assert "width: 44,\n  height: 44," in leer("components/RankingSheet.tsx")


def test_el_interrogante_ya_no_es_el_emoji_rosa():
    hoja = leer("components/InteractionSheet.tsx")
    assert "❓" not in hoja.replace("el emoji ❓ salía", "")
