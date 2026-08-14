# -*- coding: utf-8 -*-
"""Las pegatinas QR tienen que poder leerse con un móvil cualquiera.

Las de la primera ruta no se podían: se imprimieron con el logo de SAGA encima
del código, y el recuadro central tapa módulos que llevan la información de
formato y las pautas de temporización. Medido con frontend/scripts/comprobar-qr.mjs
sobre un raster PERFECTO —el caso más fácil que existe—: un logo que cubra el
30 % del ancho ya deja SAGA_01 y SAGA_02 sin leerse. Una foto hecha en el monte,
movida y a contraluz, falla mucho antes.

De paso se corrige la zona de silencio, que iba a cero cuando la norma pide 4
módulos. Ojo: esa parte NO está demostrada como causa del fallo de campo —en el
raster de prueba el código se lee igual sin margen—. Importa cuando la pegatina
está sobre una piedra o un tronco, porque es lo que permite al decodificador
delimitar dónde acaba el código; pero no fue lo que rompió las de el monte.

Reconocer aquellas pegatinas costó meter un motor de visión de 11 MB en la
aplicación. Este test existe para que no vuelva a hacer falta: mira el código
fuente del generador, porque el fallo no estaba en la lógica sino en cómo se
dibujaba.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"

TARJETA = FRONT / "shared" / "qrCard.tsx"

# Todo sitio que dibuje un QR tiene que salir de la pieza compartida.
GENERADORES = [
    FRONT / "admin" / "utils" / "printQrs.tsx",
    FRONT / "admin" / "components" / "PhysicalQrCardsPanel.tsx",
    FRONT / "admin" / "components" / "AdminQrEditor.tsx",
    FRONT / "admin" / "components" / "QrCardStudio.tsx",
]


def test_a_peza_compartida_existe():
    assert TARJETA.exists(), "shared/qrCard.tsx es la única definición de tarjeta QR"


def test_a_zona_de_silencio_non_pode_ser_cero():
    """La norma pide 4 módulos y el generador trae 0 por defecto."""
    texto = TARJETA.read_text(encoding="utf-8")

    assert "marginSize={ZONA_DE_SILENCIO}" in texto
    assert re.search(r"ZONA_DE_SILENCIO\s*=\s*4", texto), "la norma pide 4 módulos"


def test_o_codigo_vai_negro_sobre_branco():
    texto = TARJETA.read_text(encoding="utf-8")

    assert 'fgColor="#000000"' in texto
    assert 'bgColor="#ffffff"' in texto


def test_ninguen_debuxa_un_qr_pola_sua_conta():
    """Cuatro sitios generaban el mismo código con ajustes distintos."""
    culpables = []

    for fichero in GENERADORES:
        if not fichero.exists():
            continue
        texto = fichero.read_text(encoding="utf-8")
        if "QRCodeSVG" in texto or "QRCodeCanvas" in texto:
            culpables.append(fichero.relative_to(RAIZ).as_posix())

    assert not culpables, (
        "Estos dibujan el QR por su cuenta en vez de usar shared/qrCard.tsx, "
        "así que lo que se imprime y lo que se ve pueden no ser el mismo "
        "código: %s" % culpables
    )


def test_non_queda_nada_encima_do_codigo():
    """Ni logos centrados ni imágenes incrustadas: eso fue lo que las rompió."""
    texto = TARJETA.read_text(encoding="utf-8")

    assert "imageSettings" not in texto, "una imagen incrustada tapa módulos"

    for fichero in [TARJETA] + [f for f in GENERADORES if f.exists()]:
        contenido = fichero.read_text(encoding="utf-8")
        # Un logo encima se hace SIEMPRE con posición absoluta y centrado.
        centrados = re.findall(
            r"position:\s*['\"]absolute['\"][^}]*translate\(-50%,\s*-50%\)",
            contenido,
            re.DOTALL,
        )
        assert not centrados, (
            "%s tiene un elemento centrado en posición absoluta: si cae sobre "
            "el código, la pegatina deja de leerse"
            % fichero.relative_to(RAIZ).as_posix()
        )


def test_o_motor_de_vision_xa_non_esta():
    """11 MB que había que copiar a mano y que impedían construir desde cero."""
    fuera = [
        FRONT / "player" / "offline" / "qrLogoRecovery.ts",
        FRONT / "player" / "offline" / "qrOpenCv.ts",
        FRONT / "player" / "offline" / "qrFinder.ts",
        FRONT / "player" / "offline" / "qrWorkerClient.ts",
        RAIZ / "frontend" / "public" / "qr-worker.js",
    ]

    quedan = [f.relative_to(RAIZ).as_posix() for f in fuera if f.exists()]
    assert not quedan, "esto ya no hace falta con pegatinas legibles: %s" % quedan

    dockerfile = (RAIZ / "Dockerfile").read_text(encoding="utf-8")
    assert "test -s public/opencv.js" not in dockerfile, (
        "la puerta del Dockerfile impedía construir el repositorio desde un "
        "clon limpio, porque opencv.js no está en git"
    )
