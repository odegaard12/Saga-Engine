# -*- coding: utf-8 -*-
"""Cinco nodos seguidos sen cobertura: chegan todos, en orde, sen duplicarse.

O móbil completa nodos sen rede, déixaos na súa cola e, ao volver a cobertura,
sóbeos a `/api/events/sync`. O que non pode pasar:

  - que un avance chegue antes que o anterior e se perda (o servidor valida
    cada avance contra o nodo no que está o xogador),
  - que unha subida repetida conte dúas veces (a cola vólvese mandar se o
    móbil non ve a resposta),
  - que se perdan as penalizacións ou o cronómetro da ruta (só o `/api/advance`
    os aplicaba),
  - que o Rexistro de partida quede sen a hora ORIXINAL do móbil.

Proba comportamento (TestClient e funcións puras), non o texto do código.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-cinco-nodos-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers.game import MAX_EVENTS_PER_SYNC, ordenar_avances_de_la_tanda  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"

# Código con el que se supera cada nodo de la ruta de proba.
CODIGOS = ["OK", "SAGA_QR_1", "OK", "OK", "OK", "OK"]


def _cliente():
    cliente = TestClient(main.app)
    main.clear_player_rate_limits()
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _hai(minutos_atras: float) -> str:
    momento = datetime.now(timezone.utc) - timedelta(minutes=minutos_atras)
    return momento.isoformat().replace("+00:00", "Z")


def _avance(nivel: int, minutos_atras: float, **extra):
    """Un node_completed tal e como o encola o móbil en modo avión."""
    payload = {
        "code": CODIGOS[nivel],
        "level_before": nivel,
        "level_after": nivel + 1,
        "time_spent_ms": 20_000,
        "penalty_ms": 0,
        "local_created_at": _hai(minutos_atras),
        "offline_at_creation": True,
        "seq": nivel + 1,
        "evidence": {"v": 1, "via": "qr" if nivel == 1 else "juego"},
        **extra,
    }
    return {
        "client_event_id": f"cola-{nivel}",
        "type": "node_completed",
        "source": "offline_queue",
        "payload": payload,
    }


def _sincronizar(cliente, eventos):
    resposta = cliente.post("/api/events/sync", json={"user": USUARIO, "events": eventos})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def test_cinco_avances_da_cola_deixan_o_xogador_no_nodo_cinco(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = _cliente()

    eventos = [_avance(n, minutos_atras=30 - n * 5) for n in range(5)]
    corpo = _sincronizar(cliente, eventos)

    assert [e["status"] for e in corpo["events"]] == ["synced"] * 5
    assert main.get_player_progress_level(USUARIO, 0) == 5


def test_a_cola_chega_en_orde_aínda_que_a_tanda_veña_mesturada(monkeypatch, tmp_path):
    """Un reloxo corrixido a media ruta ou un reintento poden mesturar a cola."""
    preparar_mision(monkeypatch, tmp_path)
    cliente = _cliente()

    eventos = [_avance(n, minutos_atras=30 - n * 5) for n in range(5)]
    mesturados = [eventos[2], eventos[0], eventos[4], eventos[1], eventos[3]]
    corpo = _sincronizar(cliente, mesturados)

    # Ningún se rexeita por «código inválido»: chegaron ao servidor en orde.
    assert all(e["status"] == "synced" for e in corpo["events"]), corpo
    assert main.get_player_progress_level(USUARIO, 0) == 5


def test_subir_a_cola_dúas_veces_non_conta_dúas(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = _cliente()

    eventos = [_avance(n, minutos_atras=20 - n * 3) for n in range(5)]
    _sincronizar(cliente, eventos)
    segunda = _sincronizar(cliente, eventos)

    assert all(e["duplicate"] for e in segunda["events"])
    assert main.get_player_progress_level(USUARIO, 0) == 5

    sincronizados = [
        e for e in main.list_events(main.EVENT_LOG_DB, user=USUARIO, event_type="node_completed")
        if e.get("status") == "synced"
    ]
    assert len(sincronizados) == 5


def test_o_avance_de_cola_aplica_penalizacion_e_arranca_o_reloxo(monkeypatch, tmp_path):
    """Antes só o /api/advance facía isto: o offline perdía castigo e cronómetro."""
    preparar_mision(monkeypatch, tmp_path)
    cliente = _cliente()

    _sincronizar(cliente, [_avance(0, 10, penalty_ms=120_000)])

    tempos = main.load_player_timers()[USUARIO]
    assert tempos["penalties_ms"] == 120_000
    assert tempos.get("started_at"), "o reloxo da ruta ten que arrancar co primeiro nodo"


def test_acabar_a_ruta_sen_cobertura_para_o_cronometro(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = _cliente()

    eventos = [_avance(n, minutos_atras=40 - n * 5) for n in range(6)]
    _sincronizar(cliente, eventos)

    assert main.get_player_progress_level(USUARIO, 0) == 6
    assert main.load_player_timers()[USUARIO].get("finished_at"), (
        "o último nodo feito sen cobertura tamén ten que parar o cronómetro"
    )


def test_o_rexistro_garda_a_hora_do_móbil_o_atraso_e_a_marca_sen_cobertura(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = _cliente()

    _sincronizar(cliente, [_avance(n, minutos_atras=30 - n * 5) for n in range(3)])

    entradas = [e for e in main.match_log_list_timeline(user=USUARIO) if e["type"] == "advance"]
    assert len(entradas) == 3

    for n, entrada in enumerate(entradas):
        assert entrada["client_created_at"], "falta a hora orixinal do móbil"
        assert entrada["payload"]["offline"] is True
        assert entrada["payload"]["node_index"] == n
        # Chegaron 25, 20 e 15 min despois de suceder.
        assert entrada["payload"]["sync_delay_ms"] > (25 - n * 5) * 60_000 - 5_000
        assert entrada["payload"]["kind"]
        # `via` es por dónde LLEGÓ; cómo se ganó va aparte y no lo pisa.
        assert entrada["payload"]["via"] == "offline_queue"
        assert entrada["payload"]["gano_por"] == ("qr" if n == 1 else "juego")


def test_a_tanda_de_avances_e_a_orde_do_nivel_non_a_do_reloxo():
    eventos = [
        {"type": "qr_scanned", "payload": {}},
        {"type": "node_completed", "payload": {"level_before": 2}},
        {"type": "inventory_item_collected", "payload": {}},
        {"type": "node_completed", "payload": {"level_before": 0}},
        {"type": "node_completed", "payload": {"level_before": 1}},
    ]
    orde = ordenar_avances_de_la_tanda(eventos)

    # Os que non son avances non se moven; os avances ocupan os mesmos ocos.
    assert [e["type"] for e in orde] == [e["type"] for e in eventos]
    assert [e["payload"].get("level_before") for e in orde if e["type"] == "node_completed"] == [0, 1, 2]


def test_unha_cola_longa_de_ate_200_eventos_non_se_rexeita(monkeypatch, tmp_path):
    """Con tope de 100 un tramo longo sen cobertura atascaba a cola cun 400 para sempre."""
    preparar_mision(monkeypatch, tmp_path)
    cliente = _cliente()

    assert MAX_EVENTS_PER_SYNC >= 200
    eventos = [
        {
            "client_event_id": f"pos-{i}",
            "type": "position_track",
            "payload": {"samples": [{"t": 1_700_000_000_000 + i, "lat": 40.0, "lon": -3.0, "src": "real"}]},
        }
        for i in range(150)
    ]
    resposta = cliente.post("/api/events/sync", json={"user": USUARIO, "events": eventos})
    assert resposta.status_code == 200
    assert resposta.json()["accepted"] == 150

    demasiados = cliente.post("/api/events/sync", json={"user": USUARIO, "events": eventos + eventos})
    assert demasiados.status_code == 400


def test_o_rastro_sen_cobertura_entra_no_rexistro_coa_hora_de_cada_mostra(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = _cliente()

    ao_pasar = int((datetime.now(timezone.utc) - timedelta(minutes=12)).timestamp() * 1000)
    _sincronizar(
        cliente,
        [
            {
                "client_event_id": "rastro-1",
                "type": "position_track",
                "payload": {
                    "local_created_at": _hai(10),
                    "offline_at_creation": True,
                    "samples": [
                        {"t": ao_pasar, "lat": 40.001, "lon": -3.001, "acc": 12, "src": "real"},
                        {"t": ao_pasar + 30_000, "lat": 40.002, "lon": -3.002, "acc": 9, "src": "manual"},
                    ],
                },
            }
        ],
    )

    posicions = [e for e in main.match_log_list_timeline(user=USUARIO) if e["type"] == "position_sample"]
    assert len(posicions) == 2
    assert all(p["client_created_at"] for p in posicions)
    assert all(p["payload"]["offline"] is True for p in posicions)
    assert posicions[1]["payload"]["source"] == "manual"
