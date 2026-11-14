# -*- coding: utf-8 -*-
"""Auditoría del 13/11: validación de coordenadas y ajustes en el servidor, constantes cliente/servidor, y textos."""
import math
import os
import re
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-auditoria-1311-"))

import pytest  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"


def _leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


# ---------------------------------------------------------------- 6: validate_stage
def _nodo(**extra):
    nodo = {
        "id": 1,
        "title": "Nodo de prueba",
        "type": "simple_checkpoint",
        "lat": 40.0,
        "lon": -3.0,
        "radius": 50,
    }
    nodo.update(extra)
    return nodo


def _campos(errores):
    return {e["field"] for e in errores}


def test_nodo_normal_valida():
    from backend.app.runtime.core_engine import validate_stage

    assert "lat" not in _campos(validate_stage(_nodo())) and "radius" not in _campos(validate_stage(_nodo()))


@pytest.mark.parametrize("malo", [float("nan"), float("inf"), -float("inf"), 91, -91, 999])
def test_latitud_no_finita_o_fuera_de_rango_no_se_guarda(malo):
    from backend.app.runtime.core_engine import validate_stage

    assert "lat" in _campos(validate_stage(_nodo(lat=malo)))


@pytest.mark.parametrize("malo", [float("nan"), float("inf"), 181, -181])
def test_longitud_no_finita_o_fuera_de_rango_no_se_guarda(malo):
    from backend.app.runtime.core_engine import validate_stage

    assert "lon" in _campos(validate_stage(_nodo(lon=malo)))


@pytest.mark.parametrize("malo", [float("nan"), float("inf")])
def test_radio_nan_o_inf_no_se_guarda(malo):
    from backend.app.runtime.core_engine import validate_stage

    assert "radius" in _campos(validate_stage(_nodo(radius=malo)))


def test_un_nodo_antiguo_fuera_de_rango_se_carga_sin_romper():
    # Al cargar sólo se normaliza: un valor viejo fuera de rango no debe levantar excepciones.
    from backend.app.runtime.core_engine import normalize_stage

    n = normalize_stage(_nodo(lat=999, lon=float("nan")))
    assert n["location"]["lat"] == 999 and math.isnan(n["location"]["lon"])


# ---------------------------------------------------------------- 7: ajustes del servidor
def test_ajustes_fuera_de_rango_dan_400(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    import main
    from ruta_de_proba import preparar_mision

    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    c = TestClient(main.app)
    for zoom in (99, 0, -3):
        r = c.post("/api/admin/save-config", json={"config": {"map_zoom": zoom}})
        assert r.status_code == 400 and r.json()["detail"] == "invalid_map_zoom", (zoom, r.text)
    for centro in ([999, 0], [0, 999], [-91, 0], ["nan", 0], [0, "inf"]):
        r = c.post("/api/admin/save-config", json={"config": {"map_center": centro}})
        assert r.status_code == 400 and r.json()["detail"] == "invalid_map_center", (centro, r.text)
    # Los valores buenos siguen guardándose.
    assert c.post("/api/admin/save-config", json={"config": {"map_zoom": 22}}).status_code == 200
    assert c.post("/api/admin/save-config", json={"config": {"map_zoom": 1}}).status_code == 200
    assert c.post("/api/admin/save-config", json={"config": {"map_center": [40.5, -3.7]}}).status_code == 200


# ---------------------------------------------------------------- 17: constantes cliente/servidor
def _numero(texto: str, patron: str) -> int:
    m = re.search(patron, texto)
    assert m, patron
    return int(m.group(1).replace("_", ""))


def test_penalizaciones_del_cliente_y_del_servidor_coinciden():
    main_py = _leer(RAIZ / "main.py")
    srv_a_mano = _numero(main_py, r"PENALIZACION_CODIGO_A_MANO_MS\s*=\s*([\d_]+)")
    srv_alt = _numero(main_py, r"PENALIZACION_MODO_ALTERNATIVO_MS\s*=\s*([\d_]+)")
    srv_salida = _numero(main_py, r"PENALIZACION_POR_SALIDA_MS\s*=\s*([\d_]+)")

    cli_a_mano = _numero(_leer(FRONT / "player/avance/decisiones.ts"), r"RESPALDO_POR_DEFECTO_MS\s*=\s*([\d_]+)")
    cli_alt = _numero(_leer(FRONT / "player/minigames/core/modoAlternativo.ts"), r"PENALIZACION_MODO_ALTERNATIVO_MS\s*=\s*([\d_]+)")
    cli_salida = _numero(_leer(FRONT / "player/hooks/salidasDeLaApp.ts"), r"PENALIZACION_POR_SALIDA_MS\s*=\s*([\d_]+)")

    assert (srv_a_mano, srv_alt, srv_salida) == (cli_a_mano, cli_alt, cli_salida)


def test_la_nota_del_codigo_de_respaldo_se_deja_reescribir():
    # QuickProofPanel cambia «2 minutos» por la duración real con esta expresión: si la redacción cambia, se rompe en silencio.
    textos = _leer(FRONT / "player/components/textosDePantallas.ts")
    notas = re.findall(r"respaldoNota:\s*'([^']*)'", textos)
    assert len(notas) == 2
    for nota in notas:
        assert re.search(r"2 minutos", nota), nota
    panel = _leer(FRONT / "player/components/QuickProofPanel.tsx")
    assert "/2 minutos/" in panel


def test_comentarios_ya_no_dicen_dos_minutos_para_el_codigo_a_mano():
    assert "2 min el código a mano" not in _leer(RAIZ / "main.py")


# ---------------------------------------------------------------- textos
def test_prologo_vacio_o_de_ejemplo_no_se_lanza():
    app = _leer(FRONT / "player/PlayerApp.tsx")
    assert "sinTextoReal(state.config?.prologue_body)" in app
    assert "toUpperCase().startsWith('PUT ')" in app


def test_error_de_carga_es_humano_y_tiene_reintentar():
    app = _leer(FRONT / "player/PlayerApp.tsx")
    assert 'title="Error de SAGA"' not in app and "body={state.message}" not in app
    assert "onReintentar" in app
    carga = _leer(FRONT / "player/hooks/useCargaDeMision.ts")
    assert "reportarError(" in carga  # el texto técnico va al registro


def test_textos_nuevos_existen_en_los_tres_idiomas_y_sin_restos_en_castellano():
    textos = _leer(FRONT / "player/components/textosDePantallas.ts")
    assert textos.count("mapaBotones: {") == 2 and textos.count("girarMovil:") == 2
    inventario = _leer(FRONT / "player/components/InventoryPanel.tsx")
    for resto in ("'obxecto'", "Cómo funciona la mochila", "Mochila vacía"):
        assert resto not in inventario, resto
    hud = _leer(FRONT / "player/components/PlayerHud.tsx")
    assert "INTRODUCE EL CÓDIGO (EJ" not in hud and 'aria-label="Cerrar mochila"' not in hud


def test_guia_y_boton_de_ahorro_se_llaman_igual():
    guia = _leer(FRONT / "player/guia/guia.ts")
    assert "Modo ahorro" not in guia and "Modo aforro" not in guia
    assert "Ahorro de batería:" in guia and "Aforro de batería:" in guia


def test_claves_muertas_de_i18n_borradas_y_paridad_de_idiomas():
    index = _leer(FRONT / "i18n/index.ts")
    for muerta in ("gameAuthoring", "enableDebug", "disableDebug", "switchPlayer", "hideDetails"):
        assert muerta not in index, muerta
    # Mismas claves de hoja en los tres idiomas.
    claves = []
    for bloque in re.split(r"\n  (?=(?:en|es|gl): \{)", index)[1:4]:
        claves.append(len(re.findall(r"\n\s+[A-Za-z0-9_]+: ", bloque)))
    assert len(set(claves)) == 1, claves
