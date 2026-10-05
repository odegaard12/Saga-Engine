# -*- coding: utf-8 -*-
"""Ronda 3 (5.48) de avatares, cámara y fotos en el mapa.

* Manos: dos objetos nunca en la misma mano (servidor: se rechaza al guardar y se SANEA al leer lo viejo;
  móvil: ver test_avatares_mixamo; motor: el que entra espera a que el rival se guarde).
* Complementos nuevos que no van en la mano (monteira, pano, sueste, gorra, coroza, faixa, cabaza) y el hueco
  `cintura`: el servidor los acepta igual que el móvil.
* Tocados encajados por personaje y el pelo recortado bajo ellos (no atraviesa gorros ni cascos).
* Ropa de dos partes en una malla (Ch02) con dos tintes; la camisa bajo la americana conserva su color.
* Cámara del iPhone: se mide con el área visible y repone la pantalla al cerrar con la nota enfocada.
* Retrato del mapa con la foto del jugador también en 3D lejos.

Lo que sólo existe dentro de three.js/React se comprueba por el código (como el resto de pruebas del repo); el
resultado se ve en las capturas `scratchpad/vista/r3_*`.
"""
import os
import re
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-r3-"))

import pytest  # noqa: E402

from backend.app.runtime import personajes as pj  # noqa: E402
from backend.app.storage.json_store import load_json, save_json  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src" / "player"
MIXAMO = SRC / "avatares3d" / "mixamo"
BANCO = RAIZ / "sim" / "playwright-bench" / "harness" / "mixamo4"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


def _parts(**kw):
    base = {"mx": "Ch01", "top": 0, "pants": 10, "hair": 4}
    base.update(kw)
    return {"character": "peregrino", "parts": base}


# ---------------------------------------------------------------- 9. manos (servidor)

def test_el_servidor_rechaza_dos_objetos_en_la_misma_mano_al_guardar():
    assert pj.normalizar_avatar(_parts(dos="gaita", manoD="bordon")) is None
    assert pj.normalizar_avatar(_parts(dos="gaita", manoI="cesta")) is None
    assert pj.normalizar_avatar(_parts(manoD="bordon", manoI="cesta")) is not None


def test_lo_guardado_con_el_choque_se_sanea_al_leer_y_no_se_pierde(tmp_path):
    ruta = str(tmp_path / "personajes.json")
    save_json(ruta, {
        "viejo": _parts(dos="gaita", manoD="bordon", cabeza="boina"),
        "otro": _parts(dos="gaita", manoI="cesta"),
        "bueno": _parts(dos="gaita"),
    })
    configs = pj.cargar_configs(ruta)
    assert configs["viejo"]["parts"] == {"mx": "Ch01", "top": 0, "pants": 10, "hair": 4, "manoD": "bordon", "cabeza": "boina"}
    assert "dos" not in configs["otro"]["parts"] and configs["otro"]["parts"]["manoI"] == "cesta"
    assert configs["bueno"]["parts"]["dos"] == "gaita", "sin choque no se toca"
    # La ficha del jugador lleva ya el aspecto saneado.
    ficha = pj.con_personaje({"id": "viejo"}, load_json(ruta, {}))
    assert ficha["avatar"]["parts"].get("dos") is None and ficha["character_chosen"] is True
    # Y quien lo tenía puede volver a guardar el mismo aspecto (ya saneado) sin chocar consigo mismo.
    pj.guardar_elegido(ruta, "viejo", _parts(manoD="bordon", cabeza="boina"))


def test_la_tienda_sustituye_en_vez_de_bloquear():
    t = leer(MIXAMO / "TiendaDeRopa.tsx")
    assert "conComplemento(a.items, c)" in t and "sustituidosPor(c, aspecto.items)" in t
    assert "disabled={Boolean(motivo)}" not in t, "elegir un objeto para una mano ocupada ya no está deshabilitado"
    assert "data-complemento={COMPLEMENTOS[c].id}" in t and "data-categoria={COMPLEMENTOS[c].categoria}" in t


def test_el_motor_no_deja_dos_objetos_a_la_vez_en_la_misma_mano():
    m = leer(BANCO / "motor.js")
    # El que entra espera a que el rival de su mano (que sale) se haya guardado; los pesos no se suman.
    assert "rivales(n) {" in m and "riv.some(r => r.target === 0 && r.k > 0.2)" in m
    assert "kk[n] / Math.max(1, suma)" in m, "el agarre pasa de un objeto a otro sin pasar de 1"
    assert "agarres() { for (const g of GROUP_NAMES) this.hwT[g] = Object.entries(this.items).some(" in m, \
        "quitar un objeto no suelta la mano del que entra"
    gen = leer(MIXAMO / "motor" / "motor.ts")
    assert "rivales(n) {" in gen, "el motor de la app está regenerado desde el banco"
    av = leer(MIXAMO / "avatar.ts")
    assert "av.fijarObjetos()" in av, "en el mapa aparece ya con sus objetos en la mano"


# ---------------------------------------------------------------- 5. complementos nuevos

NUEVOS = {"monteira": "cabeza", "pano": "cabeza", "sueste": "cabeza", "gorra": "cabeza",
          "coroza": "espalda", "faixa": "cintura", "cabaza": "cintura"}


@pytest.mark.parametrize("item,hueco", sorted(NUEVOS.items()))
def test_el_servidor_acepta_los_complementos_nuevos(item, hueco):
    assert item in pj.MIXAMO_COMPLEMENTOS[hueco]
    canon = pj.normalizar_avatar(_parts(**{hueco: item}))
    assert canon is not None and canon["parts"][hueco] == item
    assert pj.normalizar_avatar(_parts(**{hueco: "corona"})) is None


def test_los_complementos_nuevos_estan_hechos_por_codigo_y_sin_descargas():
    acc = leer(BANCO / "acc.js")
    for item in NUEVOS:
        assert f"def('{item}'" in acc, item
    codigo = "\n".join(ln for ln in acc.splitlines() if not ln.lstrip().startswith("//"))
    assert not re.search(r"https?://|\.glb|\.fbx|\.png'|\.jpg'|load\(", codigo), "geometría de three.js, cero descargas"
    th = leer(MIXAMO / "escenaTienda.ts")
    for item in NUEVOS:
        assert re.search(rf"\b{item}: \[", th), f"miniatura de {item} en la tienda"


# ---------------------------------------------------------------- 6 y 8. tocados y pelo

def test_los_tocados_se_encajan_en_la_cabeza_de_cada_personaje():
    acc = leer(BANCO / "acc.js")
    assert "export function ajusteCabeza(Lm, caida" in acc
    for tocado in ("casco", "boina", "sombrero", "monteira", "pano", "sueste", "gorra"):
        bloque = acc.split(f"def('{tocado}'")[1].split("\ndef(")[0]
        assert "ajusteCabeza(Lm" in bloque and "return tocado(F, hg" in bloque, tocado
    av = leer(BANCO / "avatar.js")
    assert "Lm.headPts = Float32Array.from(nk)" in av, "se mide la piel de la cabeza de cada personaje"


def test_el_pelo_se_recorta_bajo_el_tocado_en_vez_de_atravesarlo():
    look = leer(BANCO / "look.js")
    assert "export function recortar(m, M, r)" in look and "discard;" in look
    av = leer(BANCO / "avatar.js")
    assert "this.post = () => this.actualizarRecorte()" in av, "el recorte sigue a la cabeza en cada fotograma"
    assert "/^hair$/i.test(p.key)" in av, "ni la barba, ni las cejas, ni las pestañas"
    assert "hide: ['hair']" not in leer(BANCO / "acc.js"), "el casco ya no deja calvo a nadie"


# ---------------------------------------------------------------- 7. colores

def test_la_prenda_de_dos_partes_lleva_dos_colores_y_la_camisa_bajo_la_americana_el_suyo():
    av = leer(BANCO / "avatar.js")
    assert "export const DOS_PRENDAS = { Ch02: { Cloth:" in av
    assert "const DEBAJO = { Ch23: ['Shirt'] }" in av
    look = leer(BANCO / "look.js")
    assert "attribute float aRopa;" in look and "export function lookDoble(m)" in look
    app = leer(MIXAMO / "avatar.ts")
    assert "f.setAttribute('aRopa', g.attributes.aRopa)" in app, "el mapa (índice propio) también lleva el segundo tinte"


# ---------------------------------------------------------------- 2. cámara del iPhone

def test_la_camara_no_se_mide_con_vh():
    # 5.49: ni vh ni el área visible (en iOS 26 el visual viewport queda corto tras el teclado). Ver
    # tests/test_vista_teclado_iphone.py.
    c = leer(SRC / "components" / "FieldCameraCapture.tsx")
    assert "height: 'min(94vh" not in c, "94vh en iOS es la ventana sin barras: la tarjeta seguía bajo el disparador"
    assert 'className="saga-raiz-movil"' in c and "env(safe-area-inset-bottom)" in c


def test_al_cerrar_la_camara_con_la_nota_enfocada_la_pantalla_vuelve_a_su_sitio():
    c = leer(SRC / "components" / "FieldCameraCapture.tsx")
    assert "onClick={cerrar}" in c and "function cerrar() {\n    cerrarNota()" in c
    assert "if (estabaAbierta.current && !open) reponerTrasTeclado()" in c, "también si la cierra otro"
    assert 'enterKeyHint="done"' in c and "onBlur={cerrarNota}" in c
    v = leer(SRC / "utils" / "vistaTrasTeclado.ts")
    assert "export function reponerTrasTeclado(): void" in v
    assert "vigilar('teclado-cerrado')" in v and "vigilar('campo-quitado')" in v, \
        "el teclado que se va sin que nadie suelte el foco (campo quitado del DOM) también repone"


# ---------------------------------------------------------------- 10. fotos en el retrato lejano

def test_la_foto_sale_en_el_retrato_tambien_en_3d_lejos():
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "if (base.foto && base.mx) propiedades.icono = idDeRetratoConFoto(" in mapa
    assert "const miFoto = urlDeFotoValida(miFotoRef.current) ? miFotoRef.current : null" in mapa
    # 5.49: la ficha del jugador (hoja inferior) también con su foto, por el mismo endpoint.
    ficha = leer(MIXAMO / "FichaDeJugador.tsx")
    assert "getPlayerAvatarUrl(jugador)" in ficha and "urlDeFotoValida(fotoUrl)" in ficha


# ---------------------------------------------------------------- 4. gestos

def test_los_gestos_nuevos_salen_del_paquete_ya_descargado():
    cat = leer(MIXAMO / "catalogo.ts")
    nuevos = ["ge__dismissing_gesture", "ge__being_cocky", "ge__relieved_sigh", "ge__thoughtful_head_shake",
              "ge__shaking_head_no", "ge__weight_shift"]
    for g in nuevos:
        assert f"clip: '{g}'" in cat, g
    assert not re.search(r"clip: 'ge__\w*(sit|jump|danc)", cat)
