# -*- coding: utf-8 -*-
"""No mandar lo que no ha cambiado, ni leer lo que no se va a usar.

En el monte, cada petición que no hace falta es batería, es tiempo con la red
ocupada y es una oportunidad más de que algo se quede a medias. Y en la
Raspberry, cada lectura de más se multiplica por trece móviles.

Tres cosas que se hacían porque sí:

- La mochila se subía entera en CADA vuelta del ciclo, cambiara o no. Una
  mochila cambia al recoger o al forjar, un puñado de veces en toda la ruta;
  el resto eran 120 peticiones por hora y por móvil para contarle al servidor
  lo que ya sabía.
- El latido leía la tabla ENTERA de posiciones para tirar el resultado: 9 360
  lecturas completas por hora con trece jugadores.
- La configuración de la misión se pedía cada 30 s aunque no cambie mientras
  se camina.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"

LOCAL_FIRST = FRONT / "player" / "offline" / "localFirst.ts"
CONFIG_OFFLINE = FRONT / "shared" / "offlinePublicConfig.ts"
POSICIONES = RAIZ / "backend" / "app" / "storage" / "positions_store.py"


def sin_comentarios(fichero: Path) -> str:
    texto = fichero.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    texto = re.sub(r"//[^\n]*", "", texto)
    return re.sub(r'"""[\s\S]*?"""', "", texto)


def test_a_mochila_non_sobe_se_non_cambiou():
    codigo = sin_comentarios(LOCAL_FIRST)

    assert "mochilaYaSubida" in codigo
    assert "huellaDeLaMochila" in codigo


def test_pero_si_se_forza_cando_o_nodo_esixe_obxecto():
    """El servidor valida CON esa mochila: ahí no vale el atajo."""
    codigo = sin_comentarios(LOCAL_FIRST)

    assert "forzar" in codigo

    # Quien lo fuerza es el avance del nodo, que antes vivía en PlayerApp.tsx.
    avance = sin_comentarios(FRONT / "player" / "avance" / "enviarCodigo.ts")
    assert "forzar: true" in avance, (
        "al validar un nodo que exige objeto hay que subir la mochila sí o sí"
    )


def test_a_mochila_so_se_da_por_subida_se_o_servidor_di_que_si():
    """Con un fallo hay que reintentar, que es justo lo que pasa al forjar sin red."""
    codigo = sin_comentarios(LOCAL_FIRST)

    assert "respuesta.ok" in codigo


def test_o_latido_non_le_todas_as_posicions():
    codigo = sin_comentarios(POSICIONES)

    assert "def guardar_posicion_sin_leer_todas" in codigo

    inicio = codigo.index("def guardar_posicion_sin_leer_todas")
    cuerpo = codigo[inicio : inicio + 600]
    assert "load_sqlite_positions" not in cuerpo, (
        "leer la tabla entera en cada latido son 9 360 lecturas por hora con "
        "trece jugadores, y el resultado se tira"
    )


def test_a_configuracion_ten_vixencia():
    codigo = sin_comentarios(CONFIG_OFFLINE)

    assert "VIGENCIA_MS" in codigo
    assert "pedirConfigConCache" in codigo
