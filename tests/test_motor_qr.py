# -*- coding: utf-8 -*-
"""Motor de QR: lo que se imprime, lo que va dentro y cómo se lee.

Lo que se puede ejecutar SE EJECUTA: `tests/js/lector_qr.mjs` carga en Node el
núcleo del lector (`qrNucleo.ts`), la clasificación de lo leído
(`clasificarQr.ts`) y el generador de códigos (`shared/qrPayload.ts`), y vuelca
en JSON lo que hacen. Lo que sólo vive dentro del componente del escáner (la
cámara, el worker, la vuelta de otra app) se comprueba por el código; la prueba
de punta a punta con cámara falsa está en sim/playwright-bench/escaner_qr.py.

Si no hay Node o no están instaladas las dependencias del frontend, las pruebas
de comportamiento se saltan, no fallan.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"
SRC = FRONT / "src"
TARJETA = SRC / "shared" / "qrCard.tsx"
LECTOR = SRC / "player" / "offline" / "qrReader.ts"
NUCLEO = SRC / "player" / "offline" / "qrNucleo.ts"
TRABAJADOR = SRC / "player" / "offline" / "lectorQr.worker.ts"
ESCANER = SRC / "player" / "components" / "QuickProofPanel.tsx"
IMPRIMIR = SRC / "admin" / "utils" / "printQrs.tsx"
ESTUDIO = SRC / "admin" / "components" / "QrCardStudio.tsx"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


def sin_comentarios(ruta: Path) -> str:
    texto = leer(ruta)
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"(?m)^\s*//[^\n]*", "", texto)


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node para ejecutar el lector")
    if not (FRONT / "node_modules" / "jsqr").exists():
        pytest.skip("frontend/node_modules sin instalar")
    res = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "lector_qr.mjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=180, cwd=str(RAIZ),
    )
    assert res.returncode == 0, res.stderr[-3000:]
    return json.loads(res.stdout)


# ---------------------------------------------------------------------------
# Generación: la tarjeta
# ---------------------------------------------------------------------------


def test_la_tarjeta_pide_version_2_como_minimo():
    """La versión 1 no trae patrón de alineación: inclinada 20°, jsQR no la leía."""
    texto = leer(TARJETA)
    assert re.search(r"const VERSION_MINIMA = 2\b", texto)
    assert "minVersion={VERSION_MINIMA}" in texto


def test_tamano_impreso_razonable_para_20_a_40_cm():
    lado = int(re.search(r"const LADO_IMPRESO_MM = (\d+)", leer(TARJETA)).group(1))
    assert 40 <= lado <= 60, "por debajo no se lee a 40 cm; por encima no cabe en una piedra"


def test_la_marca_de_la_tarjeta_sale_negra_en_blanco_y_negro():
    texto = leer(TARJETA)
    assert "#00713f" not in texto, "el verde salía gris claro en una impresora en blanco y negro"


def test_la_hoja_de_impresion_no_inventa_codigos_con_el_titulo():
    """Sin código guardado no se imprime: el título no es un código que acepte el servidor."""
    codigo = sin_comentarios(IMPRIMIR)
    assert "slugify(label)" not in codigo
    assert "sinCodigo" in codigo
    assert "LADO_IMPRESO_MM" in codigo, "el aviso de tamaño sale del mismo número que la tarjeta"
    assert "revisarPayloadQr" in codigo
    assert "escaparHtml" in codigo, "los avisos llevan títulos de nodos: se escapan"


def test_generador_de_codigos(js):
    g = js["generador"]
    assert g["formatoOk"], "SAGA + 6 del alfabeto sin 0/O/1/I"
    assert g["distintos"] == 300
    assert g["sinAvisos"]
    assert g["determinista"] == "SAGA222222", "el azar se puede inyectar (y el índice no se sesga)"
    assert g["modulosDelCodigo"] == 25, "con los ajustes de la tarjeta sale versión 2"
    assert g["leeLimpio"]


def test_revisar_codigos_deducibles_o_raros(js):
    r = js["revisar"]
    assert "deducible" in r["numerado"]
    assert "deducible" in r["numeradoQr"]
    assert {"caracteres", "deducible"} <= set(r["conTitulo"])
    assert r["largo"] == ["largo"]
    assert "datos" in r["datos"]
    assert r["vacio"] == ["vacio"]
    assert r["bueno"] == []


def test_los_paneles_proponen_codigos_al_azar():
    for ruta in [
        SRC / "admin" / "components" / "NodePhysicalTypePanel.tsx",
        SRC / "admin" / "components" / "PhysicalQrCardsPanel.tsx",
        SRC / "admin" / "components" / "guided-editor" / "guidedEditorUtils.ts",
        SRC / "admin" / "lib" / "adminHelpers.tsx",
    ]:
        codigo = sin_comentarios(ruta)
        assert "generarPayloadQr" in codigo, ruta.name
        assert "SAGA1:ITEM:${" not in codigo, f"{ruta.name} metía el título del nodo en el código"
    nodo = sin_comentarios(SRC / "admin" / "components" / "NodePhysicalTypePanel.tsx")
    assert "`SAGA-${String(" not in nodo, "el respaldo SAGA-01, SAGA-02… se adivinaba"


# ---------------------------------------------------------------------------
# Lectura: núcleo y worker
# ---------------------------------------------------------------------------


def test_nucleo_lee_casos_dificiles(js):
    n = js["nucleo"]
    assert n["limpioPrimerFotograma"]
    assert n["invertidoSoloConInvertida"], "jsQR 1.4 revienta con onlyInvert: se invierte a mano"
    assert n["oscuroConTodas"]
    assert n["ruidosoConTodas"]
    assert n["imagenDegeneradaNoLanza"]
    assert set(n["rotacion"]) <= set(n["estrategias"])
    assert len(n["rotacion"]) >= 8


def test_consejos_al_jugador(js):
    n = js["nucleo"]
    assert n["consejoOscuro"] == "mas_luz"
    assert n["consejoBorroso"] == "sin_mover"
    assert n["consejoNormal"] == "acercate"


def test_el_nucleo_no_importa_nada():
    """Lo importa el banco desde Node tal cual: sin imports, sin DOM."""
    codigo = sin_comentarios(NUCLEO)
    assert not re.search(r"^\s*import\s", codigo, re.MULTILINE)
    assert "document." not in codigo and "window." not in codigo


def test_jsqr_va_en_un_worker_y_sin_red():
    lector = sin_comentarios(LECTOR)
    assert "new Worker(new URL('./lectorQr.worker.ts', import.meta.url)" in lector
    assert "transfer" in leer(LECTOR).lower() or "[imagen.data.buffer]" in lector
    assert "ESPERA_MAXIMA_MS" in lector, "un worker colgado no puede dejar el escáner esperando"
    trabajador = leer(TRABAJADOR)
    assert "from 'jsqr'" in trabajador
    assert "fetch(" not in trabajador


def test_el_worker_va_en_la_lista_de_precarga():
    lista = FRONT / "dist" / "player-precache.json"
    if not lista.exists():
        pytest.skip("sin compilar (npm run build)")
    ficheros = json.loads(lista.read_text(encoding="utf-8"))["files"]
    assert any("lectorQr.worker" in f for f in ficheros), "sin él, sin cobertura no se lee nada"


# ---------------------------------------------------------------------------
# El escáner
# ---------------------------------------------------------------------------


def test_clasificar_lo_leido(js):
    c = js["clasificar"]
    assert c["actual"] == {"tipo": "nodo_actual"}
    assert c["actualSinGuiones"] == {"tipo": "nodo_actual"}
    assert c["siguiente"] == {"tipo": "otro_nodo", "indice": 3, "superado": False}
    assert c["anterior"] == {"tipo": "otro_nodo", "indice": 0, "superado": True}
    assert c["objeto"] == {"tipo": "objeto"}
    assert c["ajeno"] == {"tipo": "ajeno"}
    assert c["vacio"] == {"tipo": "ajeno"}
    assert c["sinActivoPeroDelNodo"] == {"tipo": "nodo_actual"}
    assert c["payloadsDeNodo"] == ["SAGAX", "SAGAY", "SAGAZ"]


def test_otro_nodo_o_qr_ajeno_no_guardan_ni_avanzan():
    codigo = sin_comentarios(ESCANER)
    inicio = codigo.index("async function saveQrItem")
    cuerpo = codigo[inicio:]
    rechazo = cuerpo.index("clase.tipo === 'otro_nodo' || clase.tipo === 'ajeno'")
    entrega = cuerpo.index("entregarUnaVez(")
    assert rechazo < entrega, "el rechazo va ANTES de meter nada en la mochila"
    assert "const completesNode = clase.tipo === 'nodo_actual'" in cuerpo
    # La clave de entrega del otro agente se conserva tal cual.
    assert "grant_id: `qr:${parsed.raw}`" in cuerpo


def test_la_camara_no_se_queda_encendida():
    codigo = sin_comentarios(ESCANER)
    para = codigo[codigo.index("function stopCamera()"):]
    para = para[: para.index("\n  }\n")]
    assert "sesionRef.current += 1" in para
    assert "track.stop()" in para
    assert "srcObject = null" in para, "en iOS el vídeo retiene la cámara si conserva el stream"
    assert "cerrarLectorQr()" in para
    arranque = codigo[codigo.index("async function startQrScan"):]
    # El permiso que llega cuando el escáner ya se cerró apaga esa cámara.
    assert re.search(r"if \(sesion !== sesionRef\.current\) \{\s*stream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)", arranque)


def test_bucle_con_limite_y_sin_bloquear():
    codigo = sin_comentarios(ESCANER)
    assert "requestVideoFrameCallback" in codigo
    assert "INTERVALO_MINIMO_MS" in codigo
    assert "ocupado" in codigo, "nunca dos lecturas a la vez"
    assert "document.hidden" in codigo


def test_vuelta_de_otra_app_y_pantalla_en_su_sitio():
    codigo = sin_comentarios(ESCANER)
    assert "visibilitychange" in codigo
    assert "reponerTrasTeclado()" in codigo


def test_permisos_y_camara_trasera():
    codigo = sin_comentarios(ESCANER)
    assert "facingMode: { ideal: 'environment' }" in codigo
    assert "exact" not in re.sub(r"'[^']*'", "", codigo.split("async function startQrScan")[1].split("programar()")[0])
    assert "NotAllowedError" in codigo and "tx.permisoDenegado" in codigo
    assert "OverconstrainedError" in codigo, "sin las restricciones, la cámara que haya"
    assert "focusMode" in codigo and "zoom" in codigo


def test_el_mensaje_del_escaner_se_ve():
    """`message` se escribía y no se pintaba en ningún sitio."""
    codigo = sin_comentarios(ESCANER)
    assert "message || tx.pista" in codigo


def test_el_estudio_del_panel_lee_igual_que_el_movil():
    codigo = sin_comentarios(ESTUDIO)
    assert "leerFotograma" in codigo and "capturarCuadro" in codigo
    assert "sesionRef" in codigo
    assert "getImageData(0, 0, width, height)" not in codigo


def test_textos_nuevos_en_los_tres_idiomas():
    textos = leer(SRC / "player" / "components" / "textosDePantallas.ts")
    for clave in ["otroNodo", "nodoYaSuperado", "qrNoValido", "masLuz", "sinMover", "acercate", "permisoDenegado"]:
        assert textos.count(f"{clave}:") == 3, clave


# ---------------------------------------------------------------------------
# El banco de casos difíciles
# ---------------------------------------------------------------------------


def test_banco_inclinada_y_poca_luz(tmp_path):
    """Dos casos del banco, rápidos: los que el lector de antes no leía."""
    node = shutil.which("node")
    if not node or not (FRONT / "node_modules" / "jsqr").exists():
        pytest.skip("sin Node o sin dependencias")
    version = subprocess.run([node, "--version"], capture_output=True, text=True).stdout.strip()
    mayor, menor = (int(x) for x in version.lstrip("v").split(".")[:2])
    if (mayor, menor) < (22, 18):
        pytest.skip("el banco importa .ts directamente: Node 22.18 o más")
    salida = tmp_path / "banco.json"
    res = subprocess.run(
        [node, "scripts/medir-lectura-qr.mjs", "--tomas", "3", "--casos", "inclinado 30°|poca luz (8", "--json", str(salida)],
        capture_output=True, text=True, encoding="utf-8", timeout=600, cwd=str(FRONT),
    )
    assert res.returncode == 0, res.stdout[-2000:] + res.stderr[-2000:]
    datos = json.loads(salida.read_text(encoding="utf-8"))
    assert datos["ajustes"]["minVersion"] == 2
    assert len(datos["resultados"]) == 2
    for r in datos["resultados"]:
        assert r["unSegundo"] == r["tomas"], r
