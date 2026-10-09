"""El plan de teselas de SATÉLITE del paquete offline, el mismo que calcula el móvil.

Es una copia en Python de `planificarTeselas` (frontend/src/player/offline/
mapTileCache.ts), sin el relieve: lo usa «Preparar mapa 3D de la zona» para
llenar la caché de la Pi (fase «satélite», ver mapa3d.py) con justo las teselas
que la pantalla de carga de cada móvil va a pedir.

Por qué hace falta: la caché PNOA de la Pi empieza vacía y el IGN tarda ~3,7 s por
tesela. El primer móvil que entraba pedía ~3000 teselas en frío, los lotes no
llegaban a tiempo y la carga caía a pedirlas de una en una. Con la caché caliente
la Pi las sirve de su disco.

Si cambia el plan del cliente hay que cambiar éste: tests/test_plan_de_teselas.py
ejecuta los dos con la misma ruta y compara las listas.
"""
from __future__ import annotations

import math
from typing import Any, Iterable

MAX_TILE_URLS = 8000

#: (zoom, radio máximo en km, presupuesto de teselas). Igual que NIVELES del cliente.
NIVELES = [
    (3, 3000, 9),
    (4, 3000, 9),
    (5, 2000, 25),
    (6, 1000, 25),
    (7, 700, 49),
    (8, 400, 25),
    (9, 260, 49),
    (10, 180, 49),
    (11, 110, 81),
    (12, 60, 81),
]
MISSION_AREA_RADIUS_KM = 10
ROUTE_CORRIDOR_KM = 2
NODE_DETAIL_RADIUS_KM = 0.5

Punto = tuple[float, float]  # (lat, lon)


def _tesela(lat: float, lon: float, z: int) -> tuple[int, int]:
    n = 2**z
    lat_rad = math.radians(lat)
    return (
        math.floor((lon + 180) / 360 * n),
        math.floor((1 - math.asinh(math.tan(lat_rad)) / math.pi) / 2 * n),
    )


def _metros_por_tesela(lat: float, z: int) -> float:
    return (156543.03392 * math.cos(math.radians(lat)) / 2**z) * 256


def _distancia_m(a: Punto, b: Punto) -> float:
    d_lat = math.radians(b[0] - a[0])
    d_lon = math.radians(b[1] - a[1])
    h = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(d_lon / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def _numero(valor: Any) -> float | None:
    try:
        n = float(valor)
    except (TypeError, ValueError, OverflowError):
        return None
    return n if math.isfinite(n) else None


def _puntos_del_track(nodo: dict) -> list[Punto]:
    bruto = nodo.get("route_track")
    if not isinstance(bruto, list):
        return []
    puntos: list[Punto] = []
    for entrada in bruto:
        if isinstance(entrada, (list, tuple)) and len(entrada) >= 2:
            lat, lon = _numero(entrada[0]), _numero(entrada[1])
        elif isinstance(entrada, dict):
            lat, lon = _numero(entrada.get("lat")), _numero(entrada.get("lon", entrada.get("lng")))
        else:
            continue
        if lat is not None and lon is not None:
            puntos.append((lat, lon))
    return puntos


def puntos_de_la_ruta(nodos: Iterable[Any]) -> list[Punto]:
    """Nodos y su trazado muestreado, sin repetidos (`uniqueStagePoints`)."""
    vistos: set[str] = set()
    puntos: list[Punto] = []

    def anadir(lat: float, lon: float) -> None:
        clave = "%.4f:%.4f" % (lat, lon)
        if clave in vistos:
            return
        vistos.add(clave)
        puntos.append((lat, lon))

    for nodo in nodos or []:
        # El cliente sólo mira números de verdad (`typeof === 'number'`).
        if not isinstance(nodo, dict):
            continue
        lat, lon = nodo.get("lat"), nodo.get("lon")
        if isinstance(lat, bool) or isinstance(lon, bool) or not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            continue
        anadir(float(lat), float(lon))
        track = _puntos_del_track(nodo)
        paso = max(1, len(track) // 40)
        for i in range(0, len(track), paso):
            anadir(*track[i])
    return puntos


class _Plan:
    def __init__(self) -> None:
        self.urls: dict[tuple[int, int, int], None] = {}

    def anadir(self, z: int, x: int, y: int) -> None:
        if len(self.urls) >= MAX_TILE_URLS:
            return
        n = 2**z
        clave = (z, ((x % n) + n) % n, max(0, min(n - 1, y)))
        self.urls.setdefault(clave, None)

    def cuadrado(self, punto: Punto, z: int, radio_km: float, presupuesto: int) -> None:
        cx, cy = _tesela(punto[0], punto[1], z)
        metros = max(80, _metros_por_tesela(punto[0], z))
        r = max(0, math.ceil(radio_km * 1000 / metros))
        while (r * 2 + 1) ** 2 > presupuesto and r > 0:
            r -= 1
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                self.anadir(z, cx + dx, cy + dy)

    def caja(self, puntos: list[Punto], z: int, margen_km: float, presupuesto: int) -> None:
        lat_media = sum(p[0] for p in puntos) / len(puntos)
        margen = margen_km * 1000
        while margen >= 500:
            d_lat = margen / 111320
            d_lon = margen / (111320 * max(0.25, math.cos(math.radians(lat_media))))
            nw = _tesela(max(p[0] for p in puntos) + d_lat, min(p[1] for p in puntos) - d_lon, z)
            se = _tesela(min(p[0] for p in puntos) - d_lat, max(p[1] for p in puntos) + d_lon, z)
            x0, x1 = min(nw[0], se[0]), max(nw[0], se[0])
            y0, y1 = min(nw[1], se[1]), max(nw[1], se[1])
            if (x1 - x0 + 1) * (y1 - y0 + 1) <= presupuesto:
                for x in range(x0, x1 + 1):
                    for y in range(y0, y1 + 1):
                        self.anadir(z, x, y)
                return
            margen *= 0.72

    def corredor(self, puntos: list[Punto], z: int, ancho_km: float, paso_m: float, max_nuevas: int) -> None:
        antes = len(self.urls)
        for p in _muestras(puntos, paso_m):
            if len(self.urls) - antes >= max_nuevas:
                return
            metros = max(80, _metros_por_tesela(p[0], z))
            r = max(0, math.ceil(ancho_km * 1000 / metros))
            while (r * 2 + 1) ** 2 > 49 and r > 1:
                r -= 1
            cx, cy = _tesela(p[0], p[1], z)
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    if len(self.urls) - antes >= max_nuevas:
                        return
                    self.anadir(z, cx + dx, cy + dy)


def _muestras(puntos: list[Punto], paso_m: float) -> list[Punto]:
    if len(puntos) <= 1:
        return list(puntos)
    salida = [puntos[0]]
    for a, b in zip(puntos, puntos[1:]):
        pasos = max(1, math.ceil(_distancia_m(a, b) / paso_m))
        for i in range(1, pasos + 1):
            t = i / pasos
            salida.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return salida


def plan_de_satelite(nodos: Iterable[Any]) -> list[tuple[int, int, int]]:
    """Las teselas (z, x, y) de satélite que pedirá la pantalla de carga, en su orden."""
    puntos = puntos_de_la_ruta(nodos)
    plan = _Plan()
    if not puntos:
        return []
    centro = (sum(p[0] for p in puntos) / len(puntos), sum(p[1] for p in puntos) / len(puntos))
    for z, radio, presupuesto in NIVELES:
        plan.cuadrado(centro, z, radio, presupuesto)
    plan.caja(puntos, 12, MISSION_AREA_RADIUS_KM, 200)
    plan.caja(puntos, 13, MISSION_AREA_RADIUS_KM, 260)
    plan.caja(puntos, 14, min(MISSION_AREA_RADIUS_KM, 25), 280)
    plan.caja(puntos, 15, min(MISSION_AREA_RADIUS_KM, 3), 360)
    plan.caja(puntos, 16, min(MISSION_AREA_RADIUS_KM, 1.8), 560)
    plan.corredor(puntos, 15, ROUTE_CORRIDOR_KM, 1600, 280)
    plan.corredor(puntos, 16, min(ROUTE_CORRIDOR_KM, 4), 1100, 340)
    plan.corredor(puntos, 17, min(ROUTE_CORRIDOR_KM, 2.2), 850, 340)
    # (Aquí el cliente pone las gemelas de relieve: no son satélite. El tope de
    # 8000 no llega a contar con ellas en ninguna ruta real: ~2000 teselas.)
    for p in puntos:
        plan.cuadrado(p, 18, NODE_DETAIL_RADIUS_KM, 25)
        plan.cuadrado(p, 19, min(NODE_DETAIL_RADIUS_KM, 0.15), 36)
    return list(plan.urls)
