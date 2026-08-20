# -*- coding: utf-8 -*-
"""El moldeado de un tramo no puede mandar la línea al otro lado del mundo.

`route_via` guarda los puntos con los que se dobla el tramo entre dos nodos, y
vive en el nodo DESTINO. El servidor lo pasaba tal cual al jugador, sin mirarlo.

El cliente es defensivo y descarta lo que no sea un par de números finitos
(`MapSurface.tsx`), así que basura evidente no rompe nada: simplemente el
moldeado no se aplica, en silencio. Pero una coordenada **fuera de rango** sí
pasa ese filtro —999 es un número finito— y se dibuja: la línea verde que el
jugador tiene que seguir sale disparada fuera del mapa.

Aquí se comprueba lo mínimo: que sean pares de números y que estén dentro del
planeta. No se comprueba que estén cerca de la ruta a propósito: mover un tramo
lejos puede ser legítimo mientras se diseña una misión nueva.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-via-"))

from backend.app.runtime.mision import validate_stages  # noqa: E402


def nodo(route_via):
    return {
        "id": 0, "title": "N", "lat": 42.36, "lon": -8.67, "radius": 50,
        "type": "checkpoint",
        "config": {"game_id": "simple_checkpoint"},
        "success": {"code": "OK"},
        "route_via": route_via,
    }


def test_coordenadas_fora_do_planeta_rexeitanse():
    errores = validate_stages([nodo([[999, -999]])])
    assert errores, "una coordenada imposible se guarda y dibuja la línea fuera del mapa"


def test_pares_incompletos_rexeitanse():
    assert validate_stages([nodo([[42.36]])]), "un punto con una sola coordenada"


def test_texto_no_sitio_dun_par_rexeitase():
    assert validate_stages([nodo(["ay"])]), "un punto que no es un par"


def test_un_moldeado_bo_gardase():
    """La guardia no puede pasarse de lista: esto es un tramo legítimo."""
    assert validate_stages([nodo([[42.361, -8.671], [42.362, -8.672]])]) == []


def test_sen_moldeado_tamen_vale():
    """La mayoría de los tramos no llevan moldeado."""
    n = nodo(None)
    del n["route_via"]
    assert validate_stages([n]) == []
