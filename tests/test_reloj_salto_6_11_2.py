# -*- coding: utf-8 -*-
"""6.11.2 (B1 del ensayo de caos): el reloj del móvil SALTA entre crear un evento y subirlo.

La tanda se corregía con UN solo desfase (el de `client_sent_at_ms`), así que un evento creado con otro reloj
quedaba desplazado y el tiempo del nodo se inflaba (hasta el tope de 30 min) o se perdía. Ahora el móvil sella cada
evento con `payload.clock_offset_at_creation_ms` (servidor - móvil al crearlo) y el servidor corrige por evento; sin el
sello, la tanda se corrige como siempre.
"""
import pytest

from backend.app.runtime import reloj_del_movil as reloj
from backend.app.runtime.tiempos_de_nodo import TOPE_OBSERVADO_MS
from test_tiempo_calculado_por_el_servidor import (  # noqa: F401  (sitio es una fixture)
    MIN, UNO, _abrir, _ahora, _completar, _registro, _sync, sitio,
)

DOS_H = 2 * 3600_000


def _sellar(evento, desfase):
    evento["payload"]["clock_offset_at_creation_ms"] = desfase
    return evento


def test_el_desfase_propio_manda_sobre_el_de_la_tanda():
    d = reloj.desfase_del_evento
    sellado = {"payload": {"clock_offset_at_creation_ms": DOS_H}}
    assert d(sellado, 0) == DOS_H and d(sellado, -DOS_H) == DOS_H
    assert d({"payload": {"clock_offset_at_creation_ms": 800}}, DOS_H) == 0, "sello de reloj en hora: no se toca"
    assert d({"payload": {}}, DOS_H) == DOS_H, "sin sello: el de la tanda (móviles viejos)"
    for basura in ("x", True, float("nan"), 10 ** 15, None):
        assert d({"payload": {"clock_offset_at_creation_ms": basura}}, DOS_H) == DOS_H
    assert d("no es un evento", 7) == 7


def test_salto_hacia_adelante_entre_la_apertura_y_el_avance(sitio):
    """Abierto con el móvil 2 h atrasado; el reloj se pone en hora; avance con el reloj bueno."""
    ahora = _ahora()
    ap = _sellar(_abrir("a-0", 101, ahora - 5 * MIN - DOS_H), DOS_H)
    ok = _sellar(_completar("c-0", 0, ahora - 1 * MIN, 1_000), 0)
    _sync(sitio, [ap, ok], client_sent_at_ms=ahora)
    assert _registro(0)["applied_ms"] == pytest.approx(4 * MIN, abs=3_000)


def test_salto_hacia_atras_entre_la_apertura_y_el_avance(sitio):
    """Abierto con el móvil 2 h adelantado; el reloj vuelve a la hora; avance con el reloj bueno."""
    ahora = _ahora()
    ap = _sellar(_abrir("a-0", 101, ahora - 5 * MIN + DOS_H), -DOS_H)
    ok = _sellar(_completar("c-0", 0, ahora - 1 * MIN, 1_000), 0)
    _sync(sitio, [ap, ok], client_sent_at_ms=ahora)
    assert _registro(0)["applied_ms"] == pytest.approx(4 * MIN, abs=3_000)


def test_sin_sello_el_efecto_del_salto_sigue_acotado_al_tope_de_un_nodo(sitio):
    """Móvil viejo (sin sello): se mantiene el comportamiento anterior y nunca pasa del tope por nodo."""
    ahora = _ahora()
    _sync(sitio, [_abrir("a-0", 101, ahora - 5 * MIN - DOS_H), _completar("c-0", 0, ahora - MIN, 1_000)], client_sent_at_ms=ahora)
    assert _registro(0)["applied_ms"] <= TOPE_OBSERVADO_MS


def test_un_reloj_constante_con_sello_da_lo_mismo_que_sin_sello(sitio):
    ahora = _ahora()
    _sync(sitio, [
        _sellar(_abrir("a-0", 101, ahora - 5 * MIN + DOS_H), -DOS_H),
        _sellar(_completar("c-0", 0, ahora - MIN + DOS_H, 1_000), -DOS_H),
    ], client_sent_at_ms=ahora + DOS_H)
    assert _registro(0)["applied_ms"] == pytest.approx(4 * MIN, abs=3_000)
