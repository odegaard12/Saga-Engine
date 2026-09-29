# -*- coding: utf-8 -*-
"""O servidor volve comprobar o que o móbil deu por bo.

O móbil segue validando en local -sen cobertura é a única comprobación que hai-,
pero antes mandaba «OK» e o servidor fiábase. Agora o nodo completado leva a
EVIDENCIA (respostas, roldas, GPS, QR lido) e o servidor cótexaa coa
configuración real. A política non muda: FLAG, non bloqueo. Se algo non cadra
queda unha sospeita con nome propio; o xogador avanza igual.

Proba comportamento: funcións puras e `/api/events/sync` con TestClient.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-evidencia-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime.core_engine import normalize_stage  # noqa: E402
from backend.app.runtime.evidencia import (  # noqa: E402
    sanitize_evidence,
    verificar_evidencia,
)
from backend.app.runtime.minigames import (  # noqa: E402
    cuenta_senales_accepted_values,
    word_trap_server_rounds,
)
from ruta_de_proba import LAT_MAPA_MUDO, LON_MAPA_MUDO, preparar_mision, ruta_de_seis_nodos  # noqa: E402

USUARIO = "PLAYER 1"


def _nodo(indice):
    return normalize_stage(ruta_de_seis_nodos()[indice])


def _motivos(hallazgos):
    return [h["reason"] for h in hallazgos]


# ---------------------------------------------------------------------------
# Cuenta as sinais
# ---------------------------------------------------------------------------

def test_cuenta_senales_resposta_boa_non_levanta_nada():
    nodo = _nodo(2)
    boa = cuenta_senales_accepted_values(nodo["interaction"]["config"], nodo["id"], USUARIO)[0]
    evidencia = {"v": 1, "answers": [99, boa]}
    assert verificar_evidencia(nodo, USUARIO, evidencia) == []


def test_cuenta_senales_resposta_que_non_cadra_e_sospeita_forte():
    nodo = _nodo(2)
    aceptadas = cuenta_senales_accepted_values(nodo["interaction"]["config"], nodo["id"], USUARIO)
    mala = max(aceptadas) + 7
    hallazgos = verificar_evidencia(nodo, USUARIO, {"v": 1, "answers": [mala]})
    assert _motivos(hallazgos) == ["evidence_answer_mismatch"]
    assert hallazgos[0]["severity"] == "suspicion"


def test_cuenta_senales_con_versao_pero_sen_corpo_e_sospeita_e_sen_nada_e_nota():
    nodo = _nodo(2)
    assert _motivos(verificar_evidencia(nodo, USUARIO, {"v": 1})) == ["evidence_missing"]

    antiga = verificar_evidencia(nodo, USUARIO, None)
    assert _motivos(antiga) == ["evidence_legacy_client"]
    assert antiga[0]["severity"] == "info", "unha app antiga non é unha acusación"


def test_o_codigo_de_respaldo_non_e_unha_partida_e_non_se_revisa():
    nodo = _nodo(2)
    assert verificar_evidencia(nodo, USUARIO, {"v": 1, "via": "manual_code"}, manual=True) == []


# ---------------------------------------------------------------------------
# Trampa de palabras
# ---------------------------------------------------------------------------

def _partida_de_trampa(nodo, fallar):
    """Unha partida coherente: `fallar` = índices de ronda nos que se falla."""
    config = nodo["interaction"]["config"]
    servidor = word_trap_server_rounds(config, nodo["id"], USUARIO)
    rondas, fallos, permitidas, extras = [], 0, config["n_rounds"], 0
    posicion = 0
    while posicion < permitidas:
        correcta = servidor[posicion]["correct_index"]
        falla = posicion in fallar
        rondas.append({"r": posicion, "c": (correcta + 1) % 4 if falla else correcta, "ms": 3_000})
        if falla:
            fallos += 1
            if extras < 4:
                extras += 1
                permitidas += 1
        posicion += 1
    return {"v": 1, "rondas": rondas, "fallos": fallos, "penalty_ms": fallos * 30_000}, fallos


def test_trampa_partida_coherente_con_fallos_non_levanta_nada():
    nodo = _nodo(3)
    evidencia, fallos = _partida_de_trampa(nodo, fallar={1, 4})
    assert fallos == 2
    assert len(evidencia["rondas"]) == nodo["interaction"]["config"]["n_rounds"] + 2
    assert verificar_evidencia(nodo, USUARIO, evidencia, penalty_ms=60_000) == []


def test_trampa_un_fallo_sen_ronda_extra_non_cadra():
    """Cada fallo suma unha ronda: quitala é o que permitía acabar en menos dun minuto."""
    nodo = _nodo(3)
    evidencia, _ = _partida_de_trampa(nodo, fallar={2})
    evidencia["rondas"] = evidencia["rondas"][:-1]
    assert "evidence_rounds_mismatch" in _motivos(verificar_evidencia(nodo, USUARIO, evidencia, penalty_ms=30_000))


def test_trampa_a_penalizacion_recortada_e_sospeita():
    nodo = _nodo(3)
    evidencia, _ = _partida_de_trampa(nodo, fallar={0, 1, 2})
    motivos = _motivos(verificar_evidencia(nodo, USUARIO, evidencia, penalty_ms=0))
    assert "evidence_penalty_short" in motivos


def test_trampa_fallos_declarados_que_non_son_os_reais():
    nodo = _nodo(3)
    evidencia, _ = _partida_de_trampa(nodo, fallar={1})
    evidencia["fallos"] = 0
    assert "evidence_rounds_mismatch" in _motivos(verificar_evidencia(nodo, USUARIO, evidencia, penalty_ms=30_000))


def test_trampa_roldas_contestadas_por_debaixo_do_humano():
    nodo = _nodo(3)
    evidencia, _ = _partida_de_trampa(nodo, fallar=set())
    for ronda in evidencia["rondas"]:
        ronda["ms"] = 40
    assert "evidence_too_fast" in _motivos(verificar_evidencia(nodo, USUARIO, evidencia))


# ---------------------------------------------------------------------------
# QR, pulso de ferro, mapa mudo
# ---------------------------------------------------------------------------

def test_qr_lido_distinto_do_do_nodo():
    nodo = _nodo(1)
    assert verificar_evidencia(nodo, USUARIO, {"v": 1, "via": "qr", "qr": {"raw": "saga_qr_1"}}) == []
    malo = verificar_evidencia(nodo, USUARIO, {"v": 1, "via": "qr", "qr": {"raw": "OUTRO_QR"}})
    assert _motivos(malo) == ["evidence_qr_mismatch"]


def test_pulso_de_ferro_con_menos_roldas_das_que_pide_o_nodo():
    nodo = _nodo(5)
    assert verificar_evidencia(nodo, USUARIO, {"v": 1, "rondas_ok": 6}) == []
    assert _motivos(verificar_evidencia(nodo, USUARIO, {"v": 1, "rondas_ok": 2})) == ["evidence_rounds_mismatch"]


def _mostra(lat, lon, src="real", acc=10):
    return {"t": 1_700_000_000_000, "lat": lat, "lon": lon, "acc": acc, "src": src}


def test_mapa_mudo_con_gps_no_punto_real_non_levanta_nada():
    nodo = _nodo(4)
    evidencia = {"v": 1, "gps": [_mostra(LAT_MAPA_MUDO + 0.00005, LON_MAPA_MUDO)]}
    assert verificar_evidencia(nodo, USUARIO, evidencia) == []


def test_mapa_mudo_con_todo_o_gps_lonxe_e_sospeita():
    nodo = _nodo(4)
    lonxe = _mostra(LAT_MAPA_MUDO + 0.004, LON_MAPA_MUDO)  # ~445 m
    hallazgos = verificar_evidencia(nodo, USUARIO, {"v": 1, "gps": [lonxe, lonxe]})
    assert _motivos(hallazgos) == ["evidence_gps_far_mapa_mudo"]
    assert hallazgos[0]["severity"] == "suspicion"


def test_mapa_mudo_sen_mostras_so_deixa_nota_neutra():
    nodo = _nodo(4)
    hallazgos = verificar_evidencia(nodo, USUARIO, {"v": 1})
    assert _motivos(hallazgos) == ["evidence_gps_missing"]
    assert hallazgos[0]["severity"] == "info"


def test_o_modo_proba_no_sitio_nunca_se_acusa():
    """Posición manual xusto no punto: o modo proba é lexítimo e sempre está aí."""
    nodo = _nodo(4)
    evidencia = {"v": 1, "gps": [_mostra(LAT_MAPA_MUDO, LON_MAPA_MUDO, src="manual")]}
    assert verificar_evidencia(nodo, USUARIO, evidencia) == []


def test_un_punto_de_control_normal_non_se_acusa_por_gps_lonxe():
    """O motor quitou a propósito a comprobación «nodo lonxe do seu sitio»."""
    nodo = _nodo(0)
    lonxe = _mostra(10.0, 10.0)
    assert verificar_evidencia(nodo, USUARIO, {"v": 1, "via": "juego", "gps": [lonxe]}) == []


def test_a_evidencia_hostil_recortase():
    enorme = {"v": 1, "gps": [{"lat": i, "lon": i} for i in range(500)], "lixo": "x" * 10_000}
    limpia = sanitize_evidence(enorme)
    assert len(limpia["gps"]) <= 60
    assert len(limpia["lixo"]) <= 200
    assert sanitize_evidence({"a": {"b": {"c": {"d": {"e": {"f": 1}}}}}}) is not None


# ---------------------------------------------------------------------------
# De punta a punta: /api/events/sync anota e avanza igual
# ---------------------------------------------------------------------------

def _sincronizar_avance(cliente, nivel, codigo, evidencia, **payload_extra):
    return cliente.post(
        "/api/events/sync",
        json={
            "user": USUARIO,
            "events": [
                {
                    "client_event_id": f"ev-{nivel}",
                    "type": "node_completed",
                    "payload": {
                        "code": codigo,
                        "level_before": nivel,
                        "time_spent_ms": 30_000,
                        "penalty_ms": 0,
                        "evidence": evidencia,
                        **payload_extra,
                    },
                }
            ],
        },
    ).json()


def _cliente_no_nodo(monkeypatch, tmp_path, nivel):
    preparar_mision(monkeypatch, tmp_path)
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    main.set_player_progress_level(USUARIO, nivel)
    return cliente


def test_evidencia_que_non_cadra_marca_sospeita_pero_o_xogador_avanza(monkeypatch, tmp_path):
    cliente = _cliente_no_nodo(monkeypatch, tmp_path, 2)
    nodo = _nodo(2)
    aceptadas = cuenta_senales_accepted_values(nodo["interaction"]["config"], nodo["id"], USUARIO)

    corpo = _sincronizar_avance(cliente, 2, "OK", {"v": 1, "answers": [max(aceptadas) + 9]})

    assert corpo["events"][0]["status"] == "synced"
    assert main.get_player_progress_level(USUARIO, 0) == 3, "flag, non bloqueo: o progreso queda"

    motivos = [s["reason"] for s in main.list_anti_cheat_suspicions(USUARIO)[USUARIO]]
    assert "evidence_answer_mismatch" in motivos

    fila = next(e for e in main.match_log_list_timeline(user=USUARIO) if e["type"] == "advance")
    assert fila["payload"]["sospechas"] == ["evidence_answer_mismatch"]
    assert any(e["type"] == "suspicion" for e in main.match_log_list_timeline(user=USUARIO))


def test_evidencia_boa_non_deixa_sospeita(monkeypatch, tmp_path):
    cliente = _cliente_no_nodo(monkeypatch, tmp_path, 2)
    nodo = _nodo(2)
    boa = cuenta_senales_accepted_values(nodo["interaction"]["config"], nodo["id"], USUARIO)[0]

    _sincronizar_avance(cliente, 2, "OK", {"v": 1, "answers": [boa]})

    sospeitas = main.list_anti_cheat_suspicions(USUARIO).get(USUARIO, [])
    assert [s for s in sospeitas if s["reason"].startswith("evidence_")] == []


def test_tamén_se_revisa_no_avance_con_cobertura(monkeypatch, tmp_path):
    cliente = _cliente_no_nodo(monkeypatch, tmp_path, 1)

    resposta = cliente.post(
        "/api/advance",
        json={
            "user": USUARIO,
            "code": "SAGA_QR_1",
            "level_before": 1,
            "time_spent_ms": 5000,
            "evidence": {"v": 1, "via": "qr", "qr": {"raw": "NON_E_ESTE"}},
        },
    )
    assert resposta.json()["status"] == "ok"
    assert main.get_player_progress_level(USUARIO, 0) == 2

    motivos = [s["reason"] for s in main.list_anti_cheat_suspicions(USUARIO)[USUARIO]]
    assert "evidence_qr_mismatch" in motivos
