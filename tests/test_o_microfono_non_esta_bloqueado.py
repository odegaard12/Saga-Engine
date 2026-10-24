# -*- coding: utf-8 -*-
"""`Permissions-Policy: microphone=()` bloqueaba el micrófono en toda la web: el
reto de sonido nunca pudo usarlo en producción. La propia web sí puede pedirlo;
las de fuera, no."""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-micro-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


def test_a_politica_deixa_o_microfono_a_propia_web():
    # Desde el 24/10 los JSON de la API ya no llevan Permissions-Policy (sólo vale en documentos): se mira fuera de /api.
    politica = TestClient(main.app).get("/robots.txt").headers.get("permissions-policy", "")
    assert "microphone=(self)" in politica
    assert "microphone=()" not in politica
