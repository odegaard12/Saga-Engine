# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, S14, S15 y A17: las descargas.

- `download_field_proofs` usaba `json` sin importarlo (latente: el front no la
  llamaba, pero cualquiera que pidiese el zip recibía un 500).
- `admin_match_log_export` ponía el nombre del jugador en `Content-Disposition`
  tal cual: una tilde daba 500 (las cabeceras van en latin-1) y una comilla la
  rompía.
- El CSV del Registro no llevaba BOM (Excel en castellano rompe las tildes) ni el
  separador que Excel en castellano espera.
"""
import io
import json
import os
import tempfile
import zipfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-descargas-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import field_proofs as fotos  # noqa: E402
from backend.app.runtime import descargas  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"


# ---------------------------------------------------------------------------
# Content-Disposition
# ---------------------------------------------------------------------------

def test_el_content_disposition_se_puede_codificar_en_latin1_siempre():
    for nombre in ('registro-de-partida-Ñusta "la ñ"', "registro\r\nSet-Cookie: x=1", "日本語", "a/b\\c", ""):
        cabecera = descargas.contenido_adjunto(nombre, "csv", "registro")

        cabecera.encode("latin-1")  # no lanza: eso era el 500
        assert "\r" not in cabecera and "\n" not in cabecera
        assert cabecera.startswith("attachment; filename=\"")
        assert "filename*=UTF-8''" in cabecera


def test_el_nombre_ascii_de_reserva_no_lleva_comillas_ni_barras():
    cabecera = descargas.contenido_adjunto('Ñusta "la ñ"/x', "csv")
    reserva = cabecera.split('filename="', 1)[1].split('"', 1)[0]

    assert reserva.isascii() and '"' not in reserva and "/" not in reserva and "\\" not in reserva
    assert reserva.endswith(".csv")
    # El nombre bueno, en UTF-8 codificado (RFC 5987).
    assert "%C3%91usta" in cabecera


def _cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    return TestClient(main.app)


def test_exportar_el_registro_de_un_jugador_con_tilde_y_comillas_no_da_500(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    nombre = 'Ñusta "la ñ"'
    main.match_log_record("session_open", nombre, active=True)

    for formato in ("csv", "json"):
        resposta = cliente.post("/api/admin/match-log/export", json={"user": nombre, "formato": formato})

        assert resposta.status_code == 200, (formato, resposta.text)
        cabecera = resposta.headers["content-disposition"]
        assert "filename*=UTF-8''" in cabecera
        assert cabecera.endswith("." + formato)


def test_el_csv_lleva_bom_y_separa_con_punto_y_coma_para_excel_en_castellano(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    main.match_log_record("session_open", USUARIO, payload={"nota": "canción, con coma"}, active=True)
    main.match_log_record("info_note", "=cmd|'/c calc'!A1", active=True)

    resposta = cliente.post("/api/admin/match-log/export", json={"formato": "csv"})

    crudo = resposta.content
    assert crudo.startswith(b"\xef\xbb\xbf"), "el BOM de UTF-8 hace que Excel lea las tildes"
    texto = crudo.decode("utf-8-sig")
    primera = texto.splitlines()[0]
    assert primera == "created_at;client_created_at;occurred_at;offline;sync_delay_ms;node_id;user;display_name;type;severity;payload"
    assert "canción" in texto
    # Y las fórmulas siguen desactivadas.
    assert "'=cmd|" in texto and ";=cmd|" not in texto


# ---------------------------------------------------------------------------
# S14: el zip de fotos
# ---------------------------------------------------------------------------

def test_descargar_las_fotos_en_zip_devuelve_el_manifiesto_y_no_un_500(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    fotos.init_field_proof_schema()
    conn = fotos.connect_runtime_sqlite()
    try:
        conn.execute(
            """
            INSERT INTO field_proofs
            (id, user, display_name, stage_id, stage_title, lat, lon, note, image_filename,
             media_type, created_at, visibility, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            ("proof_zip", USUARIO, USUARIO, "6", "el monte", 42.35, -8.66, "", "2026/09/proof_zip.jpg",
             "image/jpeg", 1770000000, "team", "active"),
        )
        conn.commit()
    finally:
        conn.close()
    destino = fotos.resolve_field_proofs_dir() / "2026" / "09" / "proof_zip.jpg"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(b"\xff\xd8 foto")

    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    resposta = cliente.get("/api/field-proofs/download")

    assert resposta.status_code == 200, resposta.text
    assert resposta.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(resposta.content)) as archivo:
        manifiesto = json.loads(archivo.read("manifest.json"))
        assert manifiesto["count"] == 1 and manifiesto["photos"][0]["id"] == "proof_zip"
        assert any(nombre.startswith("photos/") for nombre in archivo.namelist())
