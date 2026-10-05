# -*- coding: utf-8 -*-
"""La franja de abajo tras escribir la nota de la cámara en el iPhone (5.49).

Comportamiento (tests/js/vista_teclado.cjs, módulos reales en un navegador de mentira):
  - cada forma de cerrar el teclado abre la vigilancia: salir del campo, quitar del DOM el campo enfocado (sin
    focusout, como iOS) y el cierre pedido por la cámara (X, guardar, Hecho), que quita el foco ANTES;
  - si iOS 26 deja el visual viewport corrido, SOLO se devuelve el scroll a (0, 0): jamás variables CSS ni tocar
    el DOM (la compensación de 5.49.0 dejó un bloque verde en iPhone y se quitó);
  - con el teclado abierto o pasando de campo a campo no se toca nada;
  - el modo `?depurar-vista` sólo existe con el parámetro.
Cableado (código fuente): la cámara usa todos los cierres y la raíz no depende de vh.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"
SRC = FRONT / "src" / "player"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    if not (FRONT / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    r = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "vista_teclado.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=60,
    )
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


# ---------------------------------------------------------------- comportamiento

def test_salir_del_campo_vigila_y_devuelve_la_vista(js):
    s = js["salir"]
    assert s["conTeclado"] == {"teclado": "abierto", "comp": []}, "con teclado no se compensa nada"
    assert s["fases"] == ["vigilar:salir-del-campo", "normal:salir-del-campo"]
    assert s["scrollY"] == 0 and s["resizes"] >= 1 and s["comp"] == []


def test_quitar_la_nota_enfocada_sin_focusout_tambien_repone(js):
    assert js["quitado"]["fases"] == ["vigilar:campo-quitado", "normal:campo-quitado"]
    assert js["quitado"]["scrollY"] == 0


def test_el_cierre_pedido_quita_el_foco_antes(js):
    p = js["pedido"]
    assert p["focoTras"] == "fuera", "reponerTrasTeclado() quita el foco del campo (blur explícito)"
    assert "vigilar:pedido" in p["fases"] and p["fases"][-1] == "normal:pedido"


def test_ios26_atascado_solo_reposiciona_el_scroll(js):
    a = js["atascado"]
    assert a["compDurante"] == {}, "no se escribe ninguna variable sobre la raíz"
    assert a["fases"] == ["vigilar:salir-del-campo", "sin-volver:salir-del-campo"]
    assert a["sanados"] == 0, "no se esconde ni se muestra #root"
    assert a["scrollY"] == 0 and a["compDespues"] == {}


def test_de_campo_a_campo_no_se_toca_nada(js):
    d = js["deCampoACampo"]
    assert d["llamadasScroll"] == 0 and d["scrollY"] == 40
    assert not any(f.startswith(("normal", "sanar", "sin-volver")) for f in d["fases"])


def test_desinstalar_limpia(js):
    assert js["limpio"] == {"comp": [], "marca": False}


def test_piezas_puras(js):
    p = js["puras"]
    assert p["normal"] is True and p["corta"] is False and p["encogida"] is False
    assert p["sinCompensacion"] is True, "ya no hay compensación dinámica de la raíz"

def test_el_modo_depuracion_solo_con_el_parametro(js):
    d = js["depurar"]
    assert d["sinNada"] is False and d["otroParametro"] is False and d["basura"] is False
    assert d["conParametro"] is True and d["conValor"] is True
    assert d["apagado"] is False, "?depurar-vista=0 lo apaga aunque estuviera recordado"
    assert d["recordado"] is True, "se recuerda en la pestaña si la app reescribe la dirección"
    assert d["activa"] == [False, True, True, False, False]
    assert d["registro"]["n"] == d["registro"]["max"], "el registro tiene tope"
    assert d["texto"].startswith("SAGA depurar-vista 5.49.0\nua: UA de prueba\nmodo: standalone\n")
    assert d["texto"].endswith("09:08:07.006 blur | vv 820@24")


# ---------------------------------------------------------------- cableado

def test_la_camara_cierra_la_nota_por_todos_los_caminos():
    c = leer(SRC / "components" / "FieldCameraCapture.tsx")
    cerrar = c.split("function cerrarNota() {")[1].split("}")[0]
    assert "notaRef.current?.blur()" in cerrar and "reponerTrasTeclado()" in cerrar, "blur explícito y reponer"
    assert cerrar.index("blur()") < cerrar.index("reponerTrasTeclado()")
    # X de la cámara y guardar
    assert "function cerrar() {\n    cerrarNota()" in c
    assert "if (!preview || busy) return\n    cerrarNota()" in c
    # Hecho, Intro, tocar fuera y la barra del teclado (blur)
    assert "onClick={cerrarNota}" in c and "onBlur={cerrarNota}" in c
    assert "if (event.key === 'Enter') {\n                    event.preventDefault()\n                    cerrarNota()" in c
    assert "if (event.target === event.currentTarget) cerrarNota()" in c
    # Desmontar con foco: quitar el foco en un efecto de maquetación (antes de que React quite el DOM)
    assert "useLayoutEffect(\n    () => () => {\n      const campo = notaRef.current" in c
    assert "if (campo && document.activeElement === campo) campo.blur()" in c
    # Cerrada desde fuera con la nota abierta
    assert "if (!open && editandoNota) {\n      notaRef.current?.blur()" in c
    assert "if (estabaAbierta.current && !open) reponerTrasTeclado()" in c
    # Se abre DENTRO del toque (iOS sólo saca el teclado así)
    assert "flushSync(() => setEditandoNota(true))" in c and "notaRef.current?.focus({ preventScroll: true })" in c


def test_la_camara_y_la_raiz_no_dependen_de_vh_ni_de_variables():
    c = leer(SRC / "components" / "FieldCameraCapture.tsx")
    assert "saga-raiz-movil" not in c
    assert "position: 'fixed',\n  inset: 0," in c, "la capa de la cámara es su propio fixed inset:0"
    assert "var(--saga-area-alto" not in c and "useAreaVisible" not in c and "94vh" not in c
    marco = leer(SRC / "components" / "PlayerLayout.tsx")
    assert "saga-raiz-movil" not in marco and "position: mobile ? 'fixed' : 'relative'," in marco
    assert "inset: mobile ? 0 : undefined," in marco
    assert "data-saga-raiz" in marco and "<DepuracionVista />" in marco
    css = leer(FRONT / "src" / "styles" / "mobile-shell.css")
    assert "saga-raiz-movil" not in css and "--saga-raiz" not in css and "--saga-vista" not in css
    assert "100lvh" not in css and "display-mode" not in css
