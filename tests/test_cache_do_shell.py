# -*- coding: utf-8 -*-
"""Un despliegue no puede dejar a nadie sin aplicación.

El nombre de la caché del shell llevaba la versión dentro y el servidor se la
reescribía en cada despliegue. La intención era buena —que el jugador reciba lo
nuevo— pero el efecto era el contrario: al activarse, el service worker borraba
la caché anterior en el mismo instante en que estrenaba la nueva, vacía.

Con red no se nota, porque se vuelve a bajar todo. Sin red sí: un jugador que
abre la aplicación en el aparcamiento el día después de un despliegue se queda
literalmente sin nada, con la anterior ya borrada y la nueva sin llenar. En un
juego que existe para funcionar sin cobertura, eso es el peor fallo posible.

Ahora el nombre es fijo y los ficheros llevan su hash en la URL, así que dos
versiones conviven sin pisarse. Lo que quede de las cachés viejas se copia antes
de borrarlo, y si la copia falla no se borra nada.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SW = RAIZ / "frontend" / "public" / "sw.js"
PWA = RAIZ / "frontend" / "src" / "player" / "offline" / "pwaShell.ts"
PUBLIC = RAIZ / "backend" / "app" / "routers" / "public.py"


def test_o_nome_da_cache_do_shell_e_fixo():
    texto = SW.read_text(encoding="utf-8")

    nombre = re.search(r"const CACHE_NAME = '([^']+)'", texto)
    assert nombre, "no se encontró CACHE_NAME en sw.js"
    assert not re.search(r"-v[0-9]", nombre.group(1)), (
        "el nombre lleva versión: cada despliegue estrenaría caché vacía y "
        "tiraría la anterior, dejando sin aplicación a quien abra sin red"
    )


def test_a_app_e_o_service_worker_usan_o_mesmo_nome():
    """Si no coinciden, cada uno escribe en su sitio y nadie limpia el otro."""
    en_sw = re.search(r"const CACHE_NAME = '([^']+)'", SW.read_text(encoding="utf-8"))
    en_app = re.search(
        r"const PLAYER_SHELL_CACHE = '([^']+)'", PWA.read_text(encoding="utf-8")
    )

    assert en_sw and en_app
    assert en_sw.group(1) == en_app.group(1)


def test_o_servidor_xa_non_reescribe_o_nome():
    texto = PUBLIC.read_text(encoding="utf-8")
    codigo = "\n".join(
        linea for linea in texto.splitlines() if not linea.strip().startswith("#")
    )

    assert "re.sub" not in codigo, (
        "reescribir el nombre de la caché por versión es justo lo que dejaba "
        "sin aplicación a quien abriera sin red"
    )


def test_muda_antes_de_borrar():
    texto = SW.read_text(encoding="utf-8")

    assert "mudarCachesViejas" in texto
    # La copia va antes que el borrado, no al revés.
    assert texto.index("destino.put") < texto.index("caches.delete(nombre)")


def test_a_app_non_borra_as_caches_do_shell():
    """De mudarlas se encarga el service worker, copiando antes de borrar."""
    texto = PWA.read_text(encoding="utf-8")

    inicio = texto.index("export async function purgeStaleCaches")
    fin = texto.index("export async function registerPlayerServiceWorker")
    cuerpo = texto[inicio:fin]

    assert "saga-player-shell" in cuerpo
    assert "return false" in cuerpo, (
        "purgeStaleCaches tiene que dejar en paz las cachés del shell"
    )
