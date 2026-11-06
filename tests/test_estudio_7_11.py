# -*- coding: utf-8 -*-
"""7/11/2026 (aprobado por Óscar): el estudio 3D de la tienda se guarda al cerrarla y se reutiliza al reabrirla;
y el primer toque ya no se lleva el tirón de crear el AudioContext."""
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "frontend" / "src" / "player"


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8-sig")


def test_el_estudio_se_aparca_sin_dibujar_y_se_reanuda_en_el_contenedor_nuevo():
    e = leer("avatares3d/mixamo/escenaTienda.ts")
    aparcar = e.split("    aparcar() {", 1)[1][:300]
    assert "vivo = false" in aparcar and "cancelAnimationFrame(reloj)" in aparcar and "r.domElement.remove()" in aparcar
    reanudar = e.split("    reanudar(nuevo, nuevas) {", 1)[1][:500]
    assert "contenedor.appendChild(r.domElement)" in reanudar and "colocarCamara()" in reanudar
    assert "reloj = window.requestAnimationFrame(bucle)" in reanudar


def test_se_suelta_si_se_pierde_el_contexto_en_el_fondo_o_en_modo_ahorro():
    e = leer("avatares3d/mixamo/escenaTienda.ts")
    tomar = e.split("export function tomarEstudioGuardado()", 1)[1][:400]
    assert "if (e && e.perdida())" in tomar and "e.destruir()" in tomar
    assert "export const SOLTAR_EN_EL_FONDO_MS = 60_000" in e and "document.addEventListener('freeze', soltarGuardada)" in e
    assert "window.addEventListener('pagehide', soltarGuardada)" in e
    assert "return !ahorro && !(typeof memoria === 'number' && memoria <= 2)" in e


def test_la_tienda_toma_el_guardado_y_lo_guarda_al_cerrar_con_el_aspecto_actual():
    t = leer("avatares3d/mixamo/TiendaDeRopa.tsx")
    assert "const guardado = m.tomarEstudioGuardado()" in t
    assert "if (guardado) guardado.reanudar(contenedor, deEstaApertura)" in t
    assert "modulo.guardarEstudio(escena, ahorroActivo(window.localStorage))" in t
    # Al reabrir se vuelve a mostrar el aspecto de AHORA (no el de la última vez).
    assert t.index("const guardado = m.tomarEstudioGuardado()") < t.index("await escena.mostrar(aspectoRef.current)")


def test_el_audiocontext_se_crea_despues_del_primer_toque():
    h = leer("utils/haptics.ts")
    manejador = h.split("const unlockHandler = () => {", 1)[1][:250]
    assert "window.setTimeout(() => {" in manejador and "}, 450)" in h


def test_la_primera_apertura_compila_en_paralelo_sin_congelar():
    e = leer("avatares3d/mixamo/escenaTienda.ts")
    assert "r.debug.checkShaderErrors = false" in e
    assert "await r.compileAsync(escena, camara)" in e
    assert "if (!compilando) r.render(escena, camara)" in e
