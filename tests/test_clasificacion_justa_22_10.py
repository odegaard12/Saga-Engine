"""Revisión 22/10 de la clasificación («premio al primero, tiene que ser justo»).

1. Salto del panel deshecho: «+1 nodo» cobra 5 minutos; si el organizador lo
   deshace (vuelve atrás) y el jugador juega ese nodo, el salto no ocurrió. Los
   5 minutos se quedaban, y saltar otra vez cobraba 10.
2. Misión acortada desde el panel: el reindexado deja «terminado» a quien ya
   había superado todos los nodos que quedan, pero sin `finished_at`. Salía
   terminado y, a igual tiempo, último del desempate.
3. Exportación: dos terminados con el mismo tiempo salían los dos «1.º», aunque
   la regla (móvil y panel) es que gana quien acabó antes.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-clasif-"))

import main  # noqa: E402
from backend.app.runtime import exportar_partida, player_timers  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

CINCO_MINUTOS = 300_000


def test_deshacer_un_salto_del_panel_devuelve_sus_cinco_minutos(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main.record_player_stage_time("Saltador", 0, 30_000)
    main.set_player_progress_level("Saltador", 1, 0)

    main.set_player_progress_level("Saltador", 2, CINCO_MINUTOS, desde_admin=True)  # «+1 nodo»
    assert main.get_player_total_time_ms("Saltador") == 30_000 + CINCO_MINUTOS

    main.set_player_progress_level("Saltador", 1, desde_admin=True)  # el organizador lo deshace
    assert main.get_player_total_time_ms("Saltador") == 30_000, "el salto deshecho no cobra"

    main.set_player_progress_level("Saltador", 2, CINCO_MINUTOS, desde_admin=True)  # y lo vuelve a saltar
    assert main.get_player_total_time_ms("Saltador") == 30_000 + CINCO_MINUTOS, "cinco, no diez"


def test_volver_atras_sin_tocar_el_salto_lo_mantiene(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main.set_player_progress_level("Saltador2", 1, 0)
    main.set_player_progress_level("Saltador2", 2, CINCO_MINUTOS, desde_admin=True)  # salta el nodo 1
    main.set_player_progress_level("Saltador2", 4, 0)
    main.set_player_progress_level("Saltador2", 3, desde_admin=True)  # repite el 3, el 1 sigue saltado
    assert main.get_player_total_time_ms("Saltador2") == CINCO_MINUTOS


def test_sin_finished_at_la_hora_de_fin_es_la_de_su_ultimo_nodo():
    entrada = {
        "nodos": {
            "0": {"completed_at_ms": 1_000},
            "1": {"completed_at_ms": 5_000},
        },
        "last_advance_at_ms": 4_000,
    }
    assert player_timers.fin_de_la_entrada(entrada) == 5_000
    assert player_timers.fin_de_la_entrada({**entrada, "finished_at": 9_000}) == 9_000, "la de verdad manda"
    assert player_timers.fin_de_la_entrada({"last_advance_at_ms": 4_000}) == 4_000
    assert player_timers.fin_de_la_entrada({}) is None


def test_quien_termina_por_un_nodo_borrado_desempata_por_su_hora(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    total = main.count_runtime_stages()
    perfil = {"id": "Acortado"}
    timers = {"Acortado": {"stage_times_ms": {"0": 1_000}, "nodos": {"0": {"completed_at_ms": 7_000}}}}

    estado = main.project_live_profile_status(
        perfil, {}, 0, total_nodes=total, timers=timers, progress={"Acortado": total}
    )
    assert estado["finished"] is True
    assert estado["finished_at"] == 7_000, "terminado sin finished_at ya no va el último del desempate"


def test_la_exportacion_no_da_dos_primeros_si_uno_acabo_antes():
    jugadores = [
        {"user": "a", "finished": True, "level": 6, "total_time_ms": 60_000, "finished_at": 1_000},
        {"user": "b", "finished": True, "level": 6, "total_time_ms": 60_000, "finished_at": 2_000},
        {"user": "c", "finished": False, "level": 3, "total_time_ms": 10_000, "finished_at": None},
        {"user": "d", "finished": False, "level": 3, "total_time_ms": 10_000, "finished_at": None},
    ]
    filas = exportar_partida._con_posiciones(jugadores)
    assert [f["posicion"] for f in filas] == [1, 2, 3, 3]
    assert filas[0]["empate_con"] == ["b"], "el empate a tiempo se sigue avisando al organizador"


def test_al_borrar_un_nodo_su_tiempo_se_va_y_el_resto_se_recoloca(tmp_path):
    """El caso medido: A 10 s, B 50 s, C 20 s; se borra B y se juega D en 30 s."""
    from backend.app.runtime import mision_reindex
    from backend.app.storage.json_store import update_json

    relojes = str(tmp_path / "t.json")
    for nivel, (nodo, ms) in enumerate([("A", 10_000), ("B", 50_000), ("C", 20_000)]):
        player_timers.record_node_time(relojes, "p", nivel, nodo, ms, 1_000 * (nivel + 1), now_ms=10**13,
                                       extra={"penalty_ms": 120_000 if nodo == "B" else 0})
    player_timers.add_player_penalty(relojes, "p", 120_000)  # el código a mano de B
    viejos = [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}]
    nuevos = [{"id": "A"}, {"id": "C"}, {"id": "D"}]

    update_json(relojes, {}, lambda t: mision_reindex.reindexar_relojes(t, viejos, nuevos))
    entrada = player_timers.load_player_timers(relojes)["p"]
    assert entrada["stage_times_ms"] == {"0": 10_000, "1": 20_000}
    assert entrada["nodos"]["1"]["node_id"] == "C" and entrada["nodos"]["1"]["level"] == 1
    assert entrada.get("penalties_ms", 0) == 0, "la penalización del nodo borrado se va con él"

    player_timers.record_node_time(relojes, "p", 2, "D", 30_000, 9_000, now_ms=10**13)
    assert player_timers.get_player_total_time_ms(relojes, "p") == 60_000
