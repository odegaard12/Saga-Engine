# -*- coding: utf-8 -*-
"""Auditoría 25/10: reordenar la misión con gente jugando no regala nodos ni da la ruta por terminada."""
from backend.app.runtime.mision_reindex import reindex_player_levels


def _n(*ids):
    return [{"id": i} for i in ids]


def test_reordenar_no_da_por_terminada_la_ruta():
    # Lleva A y B; se reordena a A,C,D,B: le faltan C y D.
    assert reindex_player_levels(_n("A", "B", "C", "D"), _n("A", "C", "D", "B"), {"j": 2}) == {"j": 1}


def test_un_nodo_movido_delante_no_se_regala():
    # Sólo lleva A; B pasa delante: le toca B.
    assert reindex_player_levels(_n("A", "B", "C", "D"), _n("B", "A", "C", "D"), {"j": 1}) == {"j": 0}


def test_quien_termino_sigue_terminado():
    assert reindex_player_levels(_n("A", "B"), _n("A", "B", "C"), {"j": 2}) == {"j": 3}
