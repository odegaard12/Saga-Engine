# -*- coding: utf-8 -*-
"""13/11 (decisión de Óscar): sin inglés. Sólo es y gl; un `en` guardado cae a `es` sin error ni pantalla en blanco."""
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-sin-ingles-"))

import pytest  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
SRC = RAIZ / "frontend" / "src"


def test_el_servidor_ya_no_acepta_en():
    import main

    assert main.SUPPORTED_UI_LANGS == {"gl", "es"}
    assert [main.normalize_ui_lang(v) for v in ("en", "EN-us", "gl", "gl-ES", "es", "", None, "fr")] == [
        "es", "es", "gl", "gl", "es", "es", "es", "es",
    ]


def test_el_html_de_partida_no_toma_en():
    # `build_frontend` cambia el `lang` del HTML según la misión: un `en` guardado se queda en `es`.
    codigo = (RAIZ / "backend" / "app" / "build_frontend.py").read_text(encoding="utf-8")
    assert 'if idioma in ("gl", "es"):' in codigo and '"en"' in codigo  # el «en» sólo aparece para caer a es
    assert 'if idioma in ("gl", "es", "en"):' not in codigo


def test_el_frontend_no_tiene_textos_en_ingles_por_idioma():
    quedan = []
    for ruta in SRC.rglob("*.ts*"):
        if "legacySpanishBridge" in ruta.name:  # traduce literales viejos, no es un idioma de la interfaz
            continue
        texto = ruta.read_text(encoding="utf-8")
        if re.search(r"(?m)(^[ \t]*|[,{]\s*)en\s*:\s*[{'\"\[`]", texto) or "'en'" in texto or '"en"' in texto:
            quedan.append(ruta.relative_to(SRC).as_posix())
    assert quedan == [], quedan


def test_los_textos_exigen_dos_idiomas_y_el_tipo_es_de_dos():
    index = (SRC / "i18n" / "index.ts").read_text(encoding="utf-8")
    assert "export type Locale = 'es' | 'gl'" in index
    assert not re.search(r"(?m)^  en: \{", index) and re.search(r"(?m)^  es: \{", index) and re.search(r"(?m)^  gl: \{", index)
    pantallas = (SRC / "player" / "components" / "textosDePantallas.ts").read_text(encoding="utf-8")
    assert "Record<Locale, TextosDePantallas> = { es, gl }" in pantallas


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "sin_ingles_13_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120)
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_un_en_guardado_cae_a_castellano_sin_error(js):
    en = js["en"]
    assert en["locale"] == "es"  # no se queda en inglés ni en blanco
    assert en["isLocale"] == [True, True, False, False]
    assert en["guardadoDespues"] is None  # la elección vieja se olvida
    assert en["traduce"]  # sigue traduciendo (no devuelve la clave vacía)
    assert en["sinLlaveEn"] == ["es", "gl"]
    assert js["gl"]["locale"] == "gl" and js["gl"]["guardadoDespues"] == "gl"
    assert js["vacio"]["locale"] == "es"


def test_la_mision_no_puede_imponer_ingles(js):
    assert js["misionEn"] == {"locale": "es", "avisos": 0}
    assert js["misionGl"]["locale"] == "gl"
