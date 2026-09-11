# -*- coding: utf-8 -*-
"""«SAGA ENGINE NO PUDO CARGARSE CORRECTAMENTE» — reproducido en local, no en
producción, y por eso no era del trabajo de tematizar los minijuegos (se
descartó esa hipótesis: pasaba igual con `simple_checkpoint`).

Reproducido de verdad con la propia herramienta del proyecto
(`scripts/banco-de-simulacion.js` + `?debug=1`): un jugador con el GPS listo
desde el primer render -el shim de depuración, pero un móvil real con permiso
ya concedido haría lo mismo- deja que `focusRequest` (centrar en el jugador,
la ruta o el nodo) se dispare ANTES de que el temporizador de 100 ms que ya
arregla el contenedor a 0×0 en iOS Safari llegue a correr. Con el mapa a 0×0,
`map.getCenter()` no tiene centro real, y el `flyTo`/`flyToBounds` siguiente
calcula posiciones intermedias con `unproject` sobre ese centro:
`Error: Invalid LatLng object: (NaN, NaN)`, capturado por el ErrorBoundary y
la aplicación entera caía. 3 de 3 veces en local antes del arreglo, 0 de 2
después.

La condición ya existía en el fichero -el comentario de iOS Safari de más
arriba lo dice-, sólo llegaba tarde para este caso.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MAP_SURFACE = RAIZ / "frontend" / "src" / "player" / "components" / "MapSurface.tsx"


def codigo() -> str:
    return MAP_SURFACE.read_text(encoding="utf-8")


def efecto_de_focusrequest() -> str:
    texto = codigo()
    inicio = texto.index("const flyToEndTimeRef = useRef")
    marca_fin = texto.index("\n  }, [\n    focusRequest,")
    return texto[inicio : texto.index("}", marca_fin) + 1]


def test_o_mapa_se_invalida_antes_de_calcular_o_centro():
    cuerpo = efecto_de_focusrequest()

    invalida = cuerpo.index("map.invalidateSize")
    primer_flyto_o_setview = min(
        (cuerpo.index(m) for m in ("map.flyTo(", "map.flyToBounds(", "map.setView(") if m in cuerpo)
    )

    assert invalida < primer_flyto_o_setview, (
        "el mapa tiene que invalidar su tamaño ANTES del primer flyTo/setView "
        "de este efecto, o vuelve el Invalid LatLng (NaN, NaN)"
    )


def test_a_invalidacion_non_anima():
    cuerpo = efecto_de_focusrequest()
    inicio = cuerpo.index("map.invalidateSize")
    trozo = cuerpo[inicio : inicio + 80]
    assert re.search(r"animate:\s*false", trozo), (
        "invalidateSize aquí tiene que ser instantáneo (animate: false); "
        "animarlo reintroduce la ventana de tamaño 0×0"
    )


def test_a_guardia_mira_o_tamano_de_verdade():
    cuerpo = efecto_de_focusrequest()
    assert "map.getSize()" in cuerpo, (
        "la guardia tiene que comprobar el tamaño real del mapa "
        "(map.getSize()), no suponerlo"
    )
