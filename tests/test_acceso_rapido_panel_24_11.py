# -*- coding: utf-8 -*-
"""24/11: acceso rápido al panel con poca cobertura.

Con Slow 3G el formulario de entrada salía a los 12,7 s: cuatro idas y vueltas seguidas (307 de /admin, la página, el
código de arranque del jugador y, sólo después, AdminApp). Ahora:

1. `/admin` da la página del panel directamente (sin 307), con el mismo `Clear-Site-Data: "cache"` de antes.
2. La página del panel es `admin.html`: trae el formulario ya pintado, con la hoja de AdminApp, y su código en paralelo.
   Su script en línea manda el login al pulsar Entrar (comportamiento en tests/js/acceso_rapido_24_11.cjs).
3. La CSP deja pasar ese script por su huella.
4. La página del panel va con `no-cache` + ETag (304 sin cambios); la del jugador sigue `no-store`.
"""
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-acceso-rapido-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app import build_frontend  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"
SCRIPT_EN_LINEA = re.compile(r"<script(?![^>]*\ssrc=)[^>]*>(.*?)</script>", re.DOTALL)


def leer(rel: str) -> str:
    return (FRONT / rel).read_text(encoding="utf-8-sig").replace("\r\n", "\n")


def huella(cuerpo: str) -> str:
    return "'sha256-%s'" % base64.b64encode(hashlib.sha256(cuerpo.encode("utf-8")).digest()).decode()


@pytest.fixture
def dist(tmp_path, monkeypatch):
    """Un build de mentira: index.html (jugador) y admin.html (panel) con su script en línea."""
    (tmp_path / "index.html").write_text(
        '<!doctype html><html lang="es"><head><title>SAGA</title></head><body><div id="root">jugador</div></body></html>',
        encoding="utf-8")
    (tmp_path / "admin.html").write_text(leer("admin.html"), encoding="utf-8")
    monkeypatch.setattr(build_frontend, "REACT_INDEX_FILE", tmp_path / "index.html")
    return tmp_path


# --- 1 · /admin sin redirección -------------------------------------------------------------------------------------


def test_admin_da_la_pagina_del_panel_sin_redireccion_y_con_su_clear_site_data(dist):
    c = TestClient(main.app)
    r = c.get("/admin", follow_redirects=False)
    assert r.status_code == 200 and "saga-entrada-previa" in r.text
    assert r.headers.get("clear-site-data") == '"cache"' and "saga_csd=1" in r.headers.get("set-cookie", "")
    # Con la marca puesta (10 min) ya no se borra nada, y entonces sí vale el 304.
    r2 = c.get("/admin", headers={"cookie": "saga_csd=1", "if-none-match": r.headers["etag"]})
    assert r2.status_code == 304 and "clear-site-data" not in r2.headers
    # Mientras sale el Clear-Site-Data no hay 304 (apuntaría a la copia que esa cabecera borra).
    r3 = TestClient(main.app).get("/admin", headers={"if-none-match": r.headers["etag"]})
    assert r3.status_code == 200 and r3.headers.get("clear-site-data") == '"cache"'


def test_admin_react_y_sus_rutas_dan_la_misma_pagina_del_panel(dist):
    c = TestClient(main.app)
    for ruta in ("/admin-react", "/admin-react/editor"):
        r = c.get(ruta)
        assert r.status_code == 200 and "saga-entrada-previa" in r.text, ruta
        assert "clear-site-data" not in r.headers


def test_sin_admin_html_el_panel_cae_a_index_html(dist):
    (dist / "admin.html").unlink()
    r = TestClient(main.app).get("/admin-react")
    assert r.status_code == 200 and "jugador" in r.text
    # Y App.tsx reconoce /admin como panel, por si ese index.html se sirve en /admin.
    assert "currentPath === '/admin' ||" in leer("src/App.tsx")


# --- 4 · Caché de la página -----------------------------------------------------------------------------------------


def test_la_pagina_del_panel_va_con_etag_y_la_del_jugador_sin_guardar(dist):
    c = TestClient(main.app)
    r = c.get("/admin-react")
    assert r.headers["cache-control"] == "no-cache" and r.headers["etag"].startswith('"')
    assert r.headers.get("cdn-cache-control") == "no-store"
    assert c.get("/admin-react", headers={"if-none-match": "W/" + r.headers["etag"]}).status_code == 304
    assert c.get("/admin-react", headers={"if-none-match": '"otra"'}).status_code == 200
    j = c.get("/")
    assert "no-store" in j.headers["cache-control"] and "etag" not in j.headers


# --- 3 · CSP --------------------------------------------------------------------------------------------------------


def test_la_csp_deja_pasar_el_script_de_admin_html(dist):
    scripts = [s for s in SCRIPT_EN_LINEA.findall(leer("admin.html")) if s.strip()]
    assert len(scripts) == 1
    assert huella(scripts[0]) in build_frontend.huellas_de_scripts_en_linea()
    csp = TestClient(main.app).get("/admin-react").headers["content-security-policy"]
    assert huella(scripts[0]) in csp.split("script-src", 1)[1].split(";", 1)[0]
    assert "'unsafe-inline'" not in csp.split("script-src", 1)[1].split(";", 1)[0]


# --- 2 · El formulario de la página es el de AdminApp ---------------------------------------------------------------


def test_el_formulario_de_la_pagina_es_el_de_adminapp():
    pagina, app = leer("admin.html"), leer("src/admin/AdminApp.tsx")
    for trozo in ("admin-login-minimal", "admin-login-orb admin-login-orb-a", "admin-login-card admin-login-card-minimal",
                  "SAGA ENGINE · ADMIN", "Control de misión", "Acceso protegido", "Contraseña de admin",
                  'id="admin-clave"', 'name="password"', 'autocomplete="current-password"',
                  "Mantener la sesión (hasta 6 h sin usarla)", "Sin entrar no se enseña ningún dato de la misión.",
                  "Entrada de jugadores"):
        assert trozo.lower() in pagina.lower(), trozo
        assert trozo.lower() in app.lower(), trozo
    # La hoja se mete al compilar (la misma `styles` que inyecta AdminApp) y las globales van al final del body.
    vite = leer("vite.config.ts")
    assert "<!--saga:estilos-del-panel-->" in pagina and "import { styles as estilosDelPanel }" in vite
    assert "admin: resolve(process.cwd(), 'admin.html')" in vite and "paginaDelPanel()" in vite
    assert 'fetchpriority="low"' in vite  # el panel de campo baja en paralelo mientras se teclea
    # La página del panel no viaja al móvil del jugador.
    assert r"[\\/]frontend[\\/]admin\.html$" in vite and "esDeAdmin" in vite


def test_adminapp_recoge_lo_tecleado_y_el_login_ya_mandado():
    app = leer("src/admin/AdminApp.tsx")
    assert "useState(leerEntradaPrevia)" in app
    assert "useState(entradaPrevia?.clave ?? '')" in app and "useState(entradaPrevia?.mantener ?? false)" in app
    assert "void loadOverview(entradaPrevia.clave, tomarLoginAdelantado())" in app
    assert "loginPrevio ?? loginAdmin(typedPassword, rememberSession, arranqueDisponible)" in app
    # Con el login ya mandado no se comprueba la sesión vieja (su 403 tardío echaba del panel).
    assert "if (entradaPrevia?.enviado && entradaPrevia.clave.trim()) return undefined" in app
    entrada = leer("src/admin/entrada.tsx")
    assert "import AdminApp from './AdminApp'" in entrada and "vixiarVersion" not in entrada.split("*/", 1)[1]


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "acceso_rapido_24_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout.strip().splitlines()[-1])


def test_entrar_antes_del_codigo_manda_un_login_y_no_navega(js):
    assert js["scripts"] == 1 and js["verMuestra"]
    assert js["prevenidos"] == 2  # los dos Enter se quedan en la página
    assert js["pedidos"] == [{"url": "/api/admin/login", "metodo": "POST", "cred": "same-origin",
                              "cuerpo": {"password": "prueba-1234", "remember": True, "arranque": True}}]
    assert js["enviado"] == "1" and js["soloLectura"] and js["boton"] == {"apagado": True, "texto": "Entrando…"}
    assert js["promesaGuardada"]
    assert js["vaciaPedidos"] == 0 and js["vaciaEnviado"] is None


def test_tomar_login_adelantado_una_vez_y_con_sus_errores(js):
    assert js["sinPrevio"] and js["segundaVez"]
    assert js["bueno"] == {"status": "ok", "session_expires_at": 9}
    assert js["error"] == {"status": 429, "detail": "locked:30"}
