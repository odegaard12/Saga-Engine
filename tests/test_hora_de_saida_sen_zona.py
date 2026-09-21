"""
Una fecha de salida SIN zona es hora de España, no del contenedor.

El contenedor corre en UTC. Con `astimezone()` una salida escrita en el
panel como 09:00 se leía como 09:00 UTC -11:00 en Galicia en verano-
mientras el móvil la leía como 09:00 local: la cortina se levantaba y
/api/advance seguía diciendo que no durante dos horas.
"""

from datetime import datetime, timezone

from backend.app.runtime.mission_schedule import mission_is_locked, parse_launch_at


def test_sen_zona_e_hora_de_espana() -> None:
    momento = parse_launch_at("2026-02-14T09:00")
    assert momento is not None
    # 09:00 en Madrid en febrero es 08:00 UTC.
    assert momento.astimezone(timezone.utc).hour == 8


def test_con_zona_respeitase() -> None:
    momento = parse_launch_at("2026-02-14T09:00:00+01:00")
    assert momento is not None and momento.astimezone(timezone.utc).hour == 8
    momento_z = parse_launch_at("2026-02-14T08:00:00Z")
    assert momento_z is not None and momento_z.astimezone(timezone.utc).hour == 8


def test_bloqueo_levantase_a_hora_de_espana() -> None:
    ahora_antes = datetime(2026, 2, 14, 7, 59, tzinfo=timezone.utc)
    ahora_despois = datetime(2026, 2, 14, 8, 1, tzinfo=timezone.utc)
    assert mission_is_locked("2026-02-14T09:00", now=ahora_antes) is True
    assert mission_is_locked("2026-02-14T09:00", now=ahora_despois) is False
