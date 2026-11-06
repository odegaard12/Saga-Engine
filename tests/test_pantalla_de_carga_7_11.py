# -*- coding: utf-8 -*-
"""7/11/2026: la pantalla de carga ordenada (Óscar: «la pastilla Todo descargado sobra, tendría que estar en la barra»).

- «Todo descargado ✓ · N MB» y la cuenta atrás, en la línea de la barra; la barra llena en verde (--s-ok).
- Preparando el mapa: barra que se ve avanzar (pista visible, 8 px) y lo descargado en la línea de debajo.
- Logo siempre (salvo pantalla baja con la tarjeta de permisos), bloque más centrado, créditos pequeños.
- Sólo tokens --s-*: funciona en Pizarra, Día y Solpor.
"""
import re
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "frontend" / "src" / "player"


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8")


def test_la_pastilla_suelta_ya_no_existe_y_el_resumen_va_en_la_barra():
    app = leer("PlayerApp.tsx")
    assert "<ResumenDeDescarga" not in app
    c = leer("components/PantallaDeCarga.tsx")
    assert "const resumen = useResumenDeDescarga(listo && !fallo ? resumenDe : null)" in c
    assert "data-saga-resumen-descarga={resumen.estado}" in c and "data-saga-carga-cuenta" in c


def test_la_barra_llena_en_verde_cuando_esta_todo():
    c = leer("components/PantallaDeCarga.tsx")
    assert "background: fallo ? 'var(--s-aviso)' : completo ? 'var(--s-ok)' : 'var(--s-acento)'," in c


def test_preparando_el_mapa_la_barra_se_ve_y_lo_descargado_va_debajo():
    c = leer("components/PantallaDeCarga.tsx")
    assert "height: 8,\n  background: 'color-mix(in srgb, var(--s-texto) 16%, transparent)'," in c
    assert "mapaEnCurso && resumen\n                    ? [resumen.texto, resumen.cuentaAtras]" in c


def test_logo_solo_se_quita_con_permisos_y_creditos_pequenos():
    c = leer("components/PantallaDeCarga.tsx")
    assert "[data-continuar] img { display: none; }" not in c
    cred = c.split("const creditos: CSSProperties = {", 1)[1][:500]
    assert "fontSize: 10.5," in cred and "color: 'var(--s-texto-3)'," in cred and "opacity" not in cred
    assert "paddingTop: 'clamp(12px, 13vh, 130px)'," in c


def test_la_pantalla_de_carga_no_lleva_colores_a_mano():
    c = re.sub(r"/\*.*?\*/", "", leer("components/PantallaDeCarga.tsx"), flags=re.DOTALL)
    codigo = "\n".join(l for l in c.splitlines() if not l.strip().startswith("//"))
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d", codigo), "sólo tokens --s-*"
    assert "var(--s-superficie)" in codigo and "var(--s-fondo)" in codigo and "var(--s-texto)" in codigo


def test_las_tarjetas_del_tiempo_y_permisos_leen_el_texto_del_tema():
    # En Día salían blanco sobre blanco: sus textos, a tokens --s-*.
    for f in ("components/TiempoDelJuego.tsx", "components/FieldPrepPanel.tsx"):
        c = leer(f)
        lineas = [l for l in c.splitlines() if "no-tema" not in l]
        assert not any(re.search(r"color: '#(ffffff|f8fafc|f1f5f9|e2e8f0|fde68a)'", l) for l in lineas), f
        assert "var(--s-texto)" in c
