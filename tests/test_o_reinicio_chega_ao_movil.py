# -*- coding: utf-8 -*-
"""Reiniciar a un jugador tiene que llegarle al móvil.

Medido en el banco de ensayo, con un jugador que iba por el nodo 2:

    servidor   nivel 1 -> 0     el reinicio se aplicó
    móvil      sigue en 2/10, IndexedDB con level 1

El organizador reinicia a alguien y esa persona sigue jugando como si nada. Y
no es un fallo del cliente: el móvil manda sobre su propio progreso a
propósito, porque en el monte avanza sin cobertura y no puede dejar que una
respuesta del servidor le borre lo que hizo en modo avión.

La única señal que le hace ceder es `reset_at` dentro del inventario. Y había
DOS reinicios en el servidor, que no hacían lo mismo:

    /api/admin/profile-action   nivel + relojes + mochila con reset_at + posición
    /api/reset                  sólo el nivel

Por el segundo no se sellaba nada, así que el móvil no se enteraba, los
cronómetros seguían corriendo desde la partida anterior y la última posición
del jugador seguía en el mapa de los demás.

Ahora los dos llaman a la misma función.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ADMIN = RAIZ / "backend" / "app" / "routers" / "admin.py"


def codigo() -> str:
    return ADMIN.read_text(encoding="utf-8")


def cuerpo_de(nombre: str) -> str:
    texto = codigo()
    inicio = texto.index(nombre)
    resto = texto[inicio + len(nombre) :]
    siguiente = resto.find("\n@router")
    return resto if siguiente == -1 else resto[:siguiente]


def test_existe_un_so_reinicio():
    assert "def reiniciar_jugador_por_completo" in codigo(), (
        "el reinicio tiene que estar en un solo sitio: con dos copias acaban "
        "diciendo cosas distintas, que es justo lo que pasó"
    )


def test_os_dous_camiños_usan_o_mesmo():
    texto = codigo()
    llamadas = len(re.findall(r"reiniciar_jugador_por_completo\(main,", texto))

    assert llamadas >= 2, (
        "sólo %d camino llama al reinicio completo; el otro se quedó con su "
        "versión corta" % llamadas
    )


def test_o_reinicio_curto_xa_non_existe():
    """`/api/reset` bajaba el nivel y nada más."""
    cuerpo = cuerpo_de('@router.post("/api/reset")')

    assert "reiniciar_jugador_por_completo" in cuerpo, (
        "/api/reset vuelve a reiniciar a medias: el móvil no se entera"
    )


def test_o_reinicio_sela_a_marca_que_le_o_movil():
    """Sin `reset_at` el móvil da por buena su copia y sigue jugando."""
    cuerpo = cuerpo_de("def reiniciar_jugador_por_completo")

    assert "reset_at" in cuerpo, (
        "sin reset_at no hay reinicio que valga: es la única señal que hace "
        "ceder al móvil"
    )
    assert "clear_all_player_timers" in cuerpo, (
        "sin parar los relojes, el jugador vuelve al nodo 1 con el cronómetro "
        "de la partida anterior corriendo"
    )
    assert "clear_live_position" in cuerpo, (
        "sin borrar la posición, sigue apareciendo en el mapa de los demás "
        "como si estuviera en la ruta"
    )
