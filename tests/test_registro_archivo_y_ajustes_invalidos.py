# -*- coding: utf-8 -*-
"""Registro en fichero que sobrevive a los despliegues + ajustes inválidos que avisan (02/11)."""
import logging
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-registro-archivo-"))

from backend.app.runtime import registro_archivo  # noqa: E402


def test_el_fichero_rotado_recibe_avisos_y_tiene_tope(tmp_path):
    raiz = logging.getLogger("saga")
    previos = list(raiz.handlers)
    for h in previos:
        if getattr(h, "_saga_archivo", False):
            raiz.removeHandler(h)
    h = registro_archivo.instalar(tmp_path)
    try:
        assert h is not None and h.maxBytes == registro_archivo.TOPE_BYTES and h.backupCount == registro_archivo.COPIAS
        assert registro_archivo.instalar(tmp_path) is None  # idempotente
        logging.getLogger("saga.antitrampas").warning("sospecha de ana: salida_de_app")
        logging.getLogger("saga.antitrampas").info("esto no se apunta")
        h.flush()
        texto = (tmp_path / "logs" / "saga-eventos.log").read_text(encoding="utf-8")
        assert "sospecha de ana: salida_de_app" in texto and "no se apunta" not in texto
    finally:
        raiz.removeHandler(h)
        h.close()


def test_las_sospechas_dejan_linea_en_el_registro(tmp_path, caplog):
    from backend.app.runtime import anti_cheat

    with caplog.at_level(logging.WARNING, logger="saga.antitrampas"):
        anti_cheat.record_suspicion(str(tmp_path / "ac.json"), "ana", "salida_de_app", {"lat": 1.0})
    assert any("ana" in r.getMessage() and "salida_de_app" in r.getMessage() for r in caplog.records)
    assert not any("1.0" in r.getMessage() for r in caplog.records)  # la evidencia no se vuelca


def test_map_zoom_invalido_da_400_y_no_dice_guardado(monkeypatch, tmp_path):
    import pytest  # noqa: F401
    from fastapi.testclient import TestClient

    import main
    from ruta_de_proba import preparar_mision

    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    c = TestClient(main.app)
    r = c.post("/api/admin/save-config", json={"config": {"map_zoom": "abc"}})
    assert r.status_code == 400 and r.json()["detail"] == "invalid_map_zoom", r.text
    r = c.post("/api/admin/save-config", json={"config": {"map_center": ["x", "y"]}})
    assert r.status_code == 400 and r.json()["detail"] == "invalid_map_center", r.text
    # Vacío = no tocar; un número vale.
    assert c.post("/api/admin/save-config", json={"config": {"map_zoom": ""}}).status_code == 200
    assert c.post("/api/admin/save-config", json={"config": {"map_zoom": "14"}}).status_code == 200
