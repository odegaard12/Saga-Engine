"""
La red de caminos: de OpenStreetMap al grafo, sin red.

Dos vías que se cruzan tienen que dar cinco nodos (cuatro extremos y el
cruce) y cuatro tramos; y la forma de un tramo con un vértice inútil se
simplifica.
"""

from backend.app.runtime.road_graph import bbox_alrededor, construir_grafo, simplificar


def _nodo(i, lat, lon):
    return {"type": "node", "id": i, "lat": lat, "lon": lon}


def test_duas_vias_que_se_cruzan() -> None:
    elementos = [
        _nodo(1, 42.0000, -8.0000),
        _nodo(2, 42.0000, -8.0010),  # cruce
        _nodo(3, 42.0000, -8.0020),
        _nodo(4, 42.0010, -8.0010),
        _nodo(5, 41.9990, -8.0010),
        {"type": "way", "id": 10, "nodes": [1, 2, 3], "tags": {"highway": "track"}},
        {"type": "way", "id": 11, "nodes": [4, 2, 5], "tags": {"highway": "path"}},
    ]
    grafo = construir_grafo(elementos)
    assert len(grafo["nodos"]) == 5
    assert len(grafo["tramos"]) == 4
    for a, b, longitud, _forma in grafo["tramos"]:
        assert a != b and 60 < longitud < 130  # ~83 m entre puntos a 0,001º


def test_un_vertice_inutil_desaparece() -> None:
    recta = [(42.0, -8.0), (42.0000001, -8.0005), (42.0, -8.001)]
    assert simplificar(recta, 3.0) == [recta[0], recta[-1]]


def test_bbox_con_marxe() -> None:
    sur, oeste, norte, este = bbox_alrededor([(42.3, -8.7), (42.4, -8.6)], 10)
    assert sur < 42.3 and norte > 42.4 and oeste < -8.7 and este > -8.6
