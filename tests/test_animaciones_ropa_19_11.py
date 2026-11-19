"""19/11: animaciones de ropa y complementos (una vez, baratas, apagadas con reducir movimiento y con ahorro) y arreglos de
contraste/maquetación de la tienda. Pruebas de código fuente: miran que existan, que estén apagadas y que no creen materiales."""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MX = RAIZ / "frontend" / "src" / "player" / "avatares3d" / "mixamo"
PL = RAIZ / "frontend" / "src" / "player"


def leer(p: Path) -> str:
    return p.read_text(encoding="utf-8").replace("\r\n", "\n")


CSS = leer(MX / "tienda.css")
TSX = leer(MX / "TiendaDeRopa.tsx")
ESC = leer(MX / "escenaTienda.ts")
MOTOR = leer(MX / "motor" / "motor.ts")
AVATAR = leer(MX / "motor" / "avatar.ts")


def bloque(texto: str, inicio: str, fin: str) -> str:
    i = texto.index(inicio)
    return texto[i : texto.index(fin, i)]


def test_accesorio_con_sobreimpulso_solo_en_la_tienda():
    assert "export const sobreimpulso" in MOTOR and "this.rebote = false" in MOTOR
    assert "it.target === 1 && this.rebote ? sobreimpulso(it.t) : it.t" in MOTOR
    assert "av.rebote = anima" in ESC
    # el sobreimpulso es solo una cuenta: ni materiales ni geometrías
    assert "Material(" not in bloque(MOTOR, "export const sobreimpulso", "export const smooth")


def test_cruce_de_color_y_destello_sin_crear_materiales():
    ini = AVATAR.index("setLook(l) {")
    fin = AVATAR.index("ponerLook(l) {")
    region = AVATAR[ini:fin]
    assert "emissive" in region and "this.cruzando" in region
    assert "new THREE" not in region and "Material(" not in region and "needsUpdate" not in region
    assert "this.post = (dt) =>" in AVATAR and "pasoCruce(dt)" in AVATAR  # dentro del bucle existente
    assert "const dur = this.cruce > 0 ? this.cruce : 0" in AVATAR
    assert "av.cruce = anima ? 0.25 : 0" in ESC


def test_escena_apaga_las_animaciones_con_reducir_movimiento_y_ahorro():
    f = bloque(ESC, "const animacionesDePrenda", "let pulsoDeGiro")
    assert "prefers-reduced-motion: reduce" in f and "saga-ahorro" in f


def test_giro_corto_de_ida_y_vuelta_no_en_el_busto():
    assert "pulsoDeGiro" in ESC and "quiereFrente === null" in ESC
    assert "0.52 * Math.sin(Math.PI * fase)" in ESC  # ~30° y vuelve a su rotación


def test_rafaga_de_estrellas_una_vez_y_se_limpia():
    f = bloque(TSX, "function rafagaDeEstrellas", "function Muestra")
    assert "sinMovimiento()" in f and "a.onfinish = () => s.remove()" in f and "a.oncancel" in f
    assert "const N = 10" in f and "duration: 700" in f
    assert "rafagaDeEstrellas(origen ?? null, raizRef.current)" in TSX
    s = bloque(TSX, "const sinMovimiento", "/** Rebote")
    assert "prefers-reduced-motion: reduce" in s and "saga-ahorro" in s


def test_candado_que_se_abre_y_rebote_con_css():
    assert "saga-tienda-candado-abre" in TSX and "!sinMovimiento()" in TSX
    assert "animation: saga-tienda-candado-abre 400ms" in CSS
    assert "data-rebota" in TSX and "animation: saga-tienda-rebota 220ms" in CSS
    for sel in (".saga-tienda-candado-abre", "[data-rebota]", ".saga-tienda-chispa", ".saga-tienda-nuevo"):
        assert f"html.saga-ahorro {sel}" in CSS, sel
    rm = bloque(CSS, "@media (prefers-reduced-motion: reduce) {\n  .saga-tienda-candado-abre", "}\n}")
    assert "[data-rebota]" in rm and ".saga-tienda-chispa" in rm


def test_las_animaciones_nuevas_solo_mueven_transform_y_opacity():
    for k in ("saga-tienda-candado-abre", "saga-tienda-rebota", "saga-tienda-etiqueta"):
        cuerpo = bloque(CSS, f"@keyframes {k} {{", "\n}\n")
        props = set(re.findall(r"([a-z-]+):", cuerpo)) - {"opacity", "transform"}
        assert not props, (k, props)
    assert "transition: all" not in CSS.split("19/11: deshabilitado")[1][:600]


def test_deshabilitado_legible_en_los_tres_temas():
    b = bloque(CSS, ".saga-tienda-listo:disabled,\n.saga-tienda-vitrina", "}\n")
    assert "color-mix(in srgb, var(--theme-surface) 78%, var(--theme-text))" in b and "color: var(--theme-text)" in b
    assert "opacity" not in b
    assert "opacity: 0.55" not in bloque(CSS, ".saga-tienda-listo:disabled {", "}")
    assert "opacity: 0.5;" not in bloque(CSS, ".saga-tienda-compra-fila button:disabled {", "}")


def test_barra_de_compra_solo_en_pestanas_de_piezas():
    assert "pestana === 'pj' || pestana === 'ropa' || pestana === 'obj'" in TSX
    assert "disabled={guardando || tomado || sinGanar.length > 0}" in TSX  # guardar sigue sin permitirse con piezas sin ganar


def test_etiqueta_de_pestana_se_funde_y_la_tira_insinua_el_scroll():
    b = bloque(CSS, ".saga-tienda-pestana em {", "}\n")
    assert "animation: saga-tienda-etiqueta" in b
    assert "mask-image: linear-gradient(90deg, #000 calc(100% - 22px), transparent)" in CSS


def test_contrastes_con_tokens_del_tema():
    inv = leer(PL / "components" / "InventoryPanel.tsx")
    assert "color-mix(in srgb, var(--theme-text) 32%, transparent)" in inv  # huecos vacíos visibles en Día
    assert bloque(inv, "const headerCount", "}\n").count("var(--s-texto-2)") == 1
    assert "var(--s-texto-2)" in bloque(leer(PL / "components" / "CraftingPanel.tsx"), "const headerCount", "}\n")
    assert "var(--s-texto-2)" in bloque(leer(PL / "components" / "RankingSheet.tsx"), "const meta:", "\n")
    assert "--theme-info-soft" in bloque(leer(PL / "guia" / "AhoraDeLaGuia.tsx"), "const rotulo", "}\n")


def test_los_temas_no_fuerzan_el_acento_en_los_botones_deshabilitados():
    t = leer(PL.parent / "mobile-themes.css")
    assert "body.theme-dia .saga-tienda-listo:not(:disabled)" in t
    assert "body.theme-solpor .saga-tienda-listo:not(:disabled)" in t
    assert "button):not(:disabled)," in t


def test_signo_de_ayuda_de_la_mochila_es_texto_con_color_del_tema_y_44_px():
    inv = leer(PL / "components" / "InventoryPanel.tsx")
    assert "{showGuide ? '✕' : '?'}" in inv and "'❓'" not in inv
    b = bloque(inv, "const guideToggleBtn", "}\n")
    assert "color: 'var(--theme-text)'" in b and "minWidth: 44" in b and "minHeight: 44" in b
