"""Nodos encima o demasiado pegados (26/10/2026).

Óscar: «nunca pueden estar encima o tan pegados; si no, en admin que salga aviso». Dos nodos en el mismo punto (un QR y
un juego) se dibujaban uno sobre otro en el mapa del jugador; y a menos del radio de apertura (35 m por defecto) llegar a
uno abre también el otro. El panel avisa por debajo de `MINIMO_M` y no guarda sin confirmación por debajo de `ENCIMA_M`.
"""
from __future__ import annotations

from backend.app.runtime.anti_cheat import haversine_m

#: Por debajo de esto dos nodos están «encima»: el guardado pide confirmación (`aceptar_nodos_encima`).
ENCIMA_M = 3.0
#: Por debajo de esto se avisa (en ámbar): con el radio de apertura, al llegar a uno se abriría también el otro.
MINIMO_M = 15.0


def _punto(nodo) -> tuple[float, float] | None:
    if not isinstance(nodo, dict):
        return None
    lat, lon = nodo.get("lat"), nodo.get("lon")
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) for v in (lat, lon)):
        return None
    return float(lat), float(lon)


def pares_cercanos(stages, minimo: float = MINIMO_M) -> list[dict]:
    """Cada par de nodos a menos de `minimo` metros: posiciones (0-based), ids, títulos, metros y si están encima."""
    puntos = [(i, n, p) for i, n in enumerate(stages or []) if (p := _punto(n))]
    pares = []
    # ponytail: O(n²), una ruta tiene decenas de nodos.
    for x, (i, a, pa) in enumerate(puntos):
        for j, b, pb in puntos[x + 1:]:
            metros = haversine_m(pa[0], pa[1], pb[0], pb[1])
            if metros < minimo:
                pares.append({
                    "a": i,
                    "b": j,
                    "a_id": a.get("id"),
                    "b_id": b.get("id"),
                    "a_titulo": str(a.get("title") or ""),
                    "b_titulo": str(b.get("title") or ""),
                    "metros": round(metros, 1),
                    "encima": metros < ENCIMA_M,
                })
    return pares


def _pares_encima(stages) -> set:
    return {frozenset((str(p["a_id"]), str(p["b_id"]))) for p in pares_cercanos(stages, ENCIMA_M) if p["a_id"] is not None and p["b_id"] is not None}


def encima_nuevos(viejos, nuevos) -> list[dict]:
    """Pares encima (<3 m) en `nuevos` que no lo estaban ya en `viejos` (o con un nodo sin id: recién creado).

    Sólo esos piden confirmación: una ruta que YA tenía nodos apilados se sigue pudiendo guardar (el panel la avisa
    en rojo igual), pero ningún guardado puede crear o mover un nodo encima de otro sin que el organizador lo acepte.
    """
    ya = _pares_encima(viejos)
    return [
        p for p in pares_cercanos(nuevos, ENCIMA_M)
        if p["a_id"] is None or p["b_id"] is None or frozenset((str(p["a_id"]), str(p["b_id"]))) not in ya
    ]
