# -*- coding: utf-8 -*-
"""Ningún nodo puede dejar al jugador sin salida.

Tres formas de quedarse encallado que había, y que en el monte no se distinguen
de "la aplicación no va":

- GPS. En el monte la precisión suele ser de 30 a 80 metros y a veces no llega
  ninguna posición: bajo pinar, en una vaguada, con el móvil frío. El nodo se
  quedaba en "LOCALIZANDO..." para siempre. Es un candidato claro a lo de "el
  el monte no me dejaba entrar".

- Configuración. Un nodo trae la configuración en dos sitios, `config` y
  `minigame.config`, y no llevan lo mismo. El botón de abrir miraba una y la
  comprobación del envío la otra, así que podían discrepar sobre el mismo nodo.

- El código de respaldo sin nodo activo. Se apuntaba y el mensaje decía que se
  sincronizaría al volver la red. No es verdad: el servidor sólo hace progresar
  con un nodo completado, y ahí no se sabe cuál sería.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"

RUNTIME = FRONT / "player" / "runtime.ts"
CONFIG_NODO = FRONT / "player" / "configDelNodo.ts"
REQUISITO = FRONT / "player" / "rewards" / "stageItemRequirement.ts"
PAQUETE = FRONT / "player" / "offline" / "missionPack.ts"
JUGADOR = FRONT / "player" / "PlayerApp.tsx"


def sin_comentarios(fichero: Path) -> str:
    texto = fichero.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def test_o_gps_ten_saida():
    codigo = sin_comentarios(RUNTIME)

    assert "ESPERA_MAXIMA_DE_GPS_MS" in codigo
    assert "gps_rendido" in codigo

    # Y al rendirse se ABRE el nodo, no se enseña otro cartel. Se busca el
    # return, no la primera aparición, que es la declaración del tipo.
    devuelve = re.search(
        r"canEnter:\s*true,\s*\n\s*reason:\s*'gps_rendido'", codigo
    )
    assert devuelve, "rendirse tiene que abrir el nodo, no cambiar el mensaje"


def test_a_espera_do_gps_e_razoable():
    """Poco tiempo abre nodos desde el coche; mucho es no tener salida."""
    codigo = sin_comentarios(RUNTIME)

    valor = re.search(r"ESPERA_MAXIMA_DE_GPS_MS = ([0-9_]+)", codigo)
    assert valor

    segundos = int(valor.group(1).replace("_", "")) / 1000
    assert 20 <= segundos <= 120, "%s segundos no es una espera razonable" % segundos


def test_pedir_gps_non_pisa_a_saida():
    """Si el nodo ya se abre, el botón no puede volver a pedir GPS."""
    codigo = sin_comentarios(JUGADOR)

    assert "runtime.reason !== 'gps_rendido'" in codigo


def test_a_config_do_nodo_lese_nun_so_sitio():
    assert CONFIG_NODO.exists()

    for fichero in (REQUISITO, PAQUETE):
        codigo = sin_comentarios(fichero)
        assert "configDelNodo" in codigo, (
            "%s tiene que leer la configuración por la función compartida"
            % fichero.name
        )


def test_manda_a_config_do_minixogo():
    """Es la que se le entrega al jugador y la que de verdad se juega."""
    codigo = sin_comentarios(CONFIG_NODO)

    assert codigo.index("raw.config") < codigo.index("raw.minigame")


def test_o_codigo_sen_nodo_non_promete_sincronizar():
    codigo = sin_comentarios(JUGADOR)

    assert "se sincronizará cuando vuelva la red" not in codigo, (
        "ese código no avanza a nadie: el servidor sólo progresa con un nodo "
        "completado, y ahí no se sabe cuál sería"
    )
