# -*- coding: utf-8 -*-
"""Con la misión terminada, el móvil deja de mandar dónde está.

Medido sobre la misión real: de las 14 posiciones guardadas, **9 estaban a más
de 3 km de la ruta** —hasta 70 km—, y una de hace poco más de un día. La ruta se
jugó hace una semana. O sea que no eran posiciones de juego: eran casas y
trabajos.

La causa es que el latido sólo miraba si la partida estaba cargada:

    useEffect(() => {
      if (state.status !== 'ready') return
      ...
      intervalId = window.setInterval(publishHeartbeat, 30000)

Nada comprobaba si la misión ya había terminado. Alguien que acabó la ruta abre
la aplicación en su casa para ver la clasificación, y el servidor se queda con
las coordenadas de su casa.

Contra los datos de personas, lo que protege de verdad no es el permiso
firmado, sino no tener lo que no hace falta. Terminada la misión, la posición
no hace ninguna falta: la clasificación se sigue trayendo igual, sólo que sin
coordenadas.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
JUGADOR = RAIZ / "frontend" / "src" / "player" / "PlayerApp.tsx"


def codigo() -> str:
    texto = JUGADOR.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def test_rematada_a_mision_non_se_manda_posicion():
    c = codigo()

    assert re.search(r"finished\)\s*\n?\s*const effectivePosition\s*=\s*\w+\s*\?\s*null", c), (
        "con la misión terminada la posición del latido tiene que ser null: "
        "no se puede seguir guardando dónde está la gente cuando ya no juega"
    )


def test_a_clasificacion_segue_chegando():
    """Quitar la posición no puede llevarse por delante la tabla del grupo."""
    c = codigo()

    inicio = c.index("const respuesta = await sendHeartbeat")
    bloque = c[inicio : inicio + 420]

    assert "equipo: true" in bloque, (
        "el latido sigue trayendo la tabla: es lo que alimenta la clasificación"
    )


def test_a_posicion_do_latido_sae_dun_so_sitio():
    """Dos formas de calcular la posición del latido acabarían divergiendo."""
    c = codigo()

    assert c.count("heartbeatPositionRef.current =") == 1, (
        "la posición del latido se decide en un solo sitio"
    )
