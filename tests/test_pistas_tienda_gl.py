"""La pista de la tienda («Se consigue: …», «Cuesta N estrellas») también en galego.

El servidor sólo la escribía en castellano y la tienda en galego la enseñaba tal
cual. Ahora `estado` manda `pistas` (castellano, como siempre) y `pistas_gl`.
"""
from backend.app.runtime import desbloqueos as reglas
from backend.app.runtime import desbloqueos_glue as glue

REGLAS = [
    {"id": "tres", "cuando": {"tipo": "nodos", "n": 3}, "da": ["item:sueste"]},
    {"id": "fin", "cuando": {"tipo": "final_mision"}, "da": ["item:sueste"]},
    {"id": "nodo", "cuando": {"tipo": "nodo", "nodo": "7"}, "da": ["ropa:9"]},
]


def test_pistas_en_galego_y_castellano_sin_mezclar():
    es = reglas.pistas(REGLAS, ["item:sueste", "ropa:9", "hair:7"], {"7": "A ponte"})
    gl = reglas.pistas(REGLAS, ["item:sueste", "ropa:9", "hair:7"], {"7": "A ponte"}, "gl")
    assert es["item:sueste"] == "Se consigue: Completa 3 nodos · Termina la misión"
    assert gl["item:sueste"] == "Conséguese: Completa 3 nodos · Remata a misión"
    assert gl["ropa:9"] == "Conséguese: Completa o nodo «A ponte»"
    assert gl["hair:7"] == "Agasállao a organización"
    assert es["hair:7"] == "Lo regala la organización"


def test_el_precio_se_dice_en_el_idioma_de_la_pista():
    precios = {"item:sueste": 2, "hair:7": 1}
    es = glue._pistas_con_precio(reglas.pistas(REGLAS, ["item:sueste", "hair:7"]), precios)
    gl = glue._pistas_con_precio(reglas.pistas(REGLAS, ["item:sueste", "hair:7"], None, "gl"), precios, "gl")
    assert es["item:sueste"].endswith(" · o 2 estrellas") and es["hair:7"] == "Cuesta 1 estrella"
    assert gl["item:sueste"].endswith(" · ou 2 estrelas") and gl["hair:7"] == "Custa 1 estrela"
    assert "estrella" not in " ".join(gl.values()), "nada de castellano en la tienda en galego"


def test_todas_las_reglas_tienen_texto_en_galego():
    tipos = ["primer_nodo", "nodo", "nodos", "minijuego_perfecto", "racha_perfecta", "mitad_mision",
             "final_mision", "final_sin_emergencia", "primera_foto", "km", "regalo_admin", "raro"]
    for tipo in tipos:
        regla = {"cuando": {"tipo": tipo, "n": 2, "km": 3}}
        es, gl = reglas.texto_de_regla(regla), reglas.texto_de_regla(regla, None, "gl")
        assert es and gl, tipo
        if tipo not in ("nodos", "km"):  # «Completa 2 nodos» / «Anda 3 km…» casi coinciden
            assert es != gl, tipo
