# -*- coding: utf-8 -*-
"""Poner el tema no puede borrar las clases que pone el resto de la aplicación.

El tema llegó aplicándose así::

    document.body.className = `theme-${config.player_theme}`

Eso no añade una clase: **sustituye todas las del body**. Y el body no es sólo
del tema. El escáner de QR pone ``saga-qr-scanner-open``, y de esa clase cuelga
la regla que esconde la barra de abajo mientras se enfoca la pegatina::

    body.saga-qr-scanner-open [data-saga-player-hud="bottom"] {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

Como la asignación estaba en el cuerpo del componente, corría en CADA render, y
`PlayerApp` se repinta con cada lectura del GPS —segundos, caminando—. O sea:
abres el escáner, das dos pasos, y la barra de abajo vuelve a aparecer ENCIMA
del visor y además se vuelve a tragar los toques.

No es un detalle de estilo: medido contra la misión real, **5 de los 10 nodos
se completan leyendo un QR**.

Aquí se fija que el tema toca sólo lo suyo.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"

TEMA = FRONT / "shared" / "tema.ts"
JUGADOR = FRONT / "player" / "PlayerApp.tsx"
ENTRADA = FRONT / "login" / "LoginApp.tsx"
ESCANER = FRONT / "player" / "components" / "QuickProofPanel.tsx"


def sin_comentarios(fichero: Path) -> str:
    texto = fichero.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def test_ninguen_asigna_o_className_do_body_enteiro():
    """Asignar `className` entero borra lo que hayan puesto los demás."""
    culpables = []

    for fichero in FRONT.rglob("*"):
        if fichero.suffix not in (".ts", ".tsx") or not fichero.is_file():
            continue
        codigo = sin_comentarios(fichero)
        if re.search(r"document\.body\.className\s*=", codigo):
            culpables.append(fichero.relative_to(RAIZ).as_posix())

    assert not culpables, (
        "estos ficheros sustituyen todas las clases del body en vez de añadir "
        f"la suya: {culpables}"
    )


def test_o_tema_so_quita_clases_de_tema():
    codigo = sin_comentarios(TEMA)

    assert re.search(r"PREFIJO\s*=\s*'theme-'", codigo), "el prefijo del tema es 'theme-'"
    assert "startsWith(PREFIJO)" in codigo, (
        "sólo se quitan las clases del tema; las demás no son suyas"
    )
    assert "classList.add" in codigo
    assert "classList.remove" in codigo


def test_o_tema_ponse_unha_vez_ao_cargar_e_non_en_cada_render():
    """En el cuerpo del componente corría con cada lectura del GPS."""
    for fichero in (JUGADOR, ENTRADA):
        codigo = sin_comentarios(fichero)
        assert "aplicarTema" in codigo, f"{fichero.name} no usa la función del tema"

        # La llamada de arranque va fuera del componente: una vez, al cargar el
        # módulo, antes de que React pinte nada. Así no hay parpadeo Y no se
        # repite en cada render.
        antes = codigo.index("aplicarTema")
        assert antes < codigo.index("export default function"), (
            f"{fichero.name}: el tema de arranque tiene que ponerse al cargar el "
            "módulo, no dentro del componente"
        )


def test_sen_dato_hai_respaldo():
    """Un móvil que abre por primera vez no tiene configuración guardada.

    El respaldo sale del tema por defecto, no de un literal suelto: así no
    puede quedarse apuntando a un tema que dejó de existir, que es justo lo
    que pasó con `classic`.
    """
    codigo = sin_comentarios(TEMA)

    assert re.search(r"RESPALDO\s*=\s*`\$\{PREFIJO\}\$\{TEMA_POR_DEFECTO\}`", codigo), (
        "el respaldo tiene que derivar del tema por defecto"
    )

    defecto = re.search(r"TEMA_POR_DEFECTO:\s*IdDeTema\s*=\s*'([a-z0-9-]+)'", codigo)
    assert defecto, "no se encontró el tema por defecto"

    validos = set(re.findall(r"id:\s*'([a-z0-9-]+)'", codigo))
    assert defecto.group(1) in validos, (
        f"el tema por defecto ({defecto.group(1)}) no está entre los que existen: {sorted(validos)}"
    )


def test_o_contrato_do_escaner_segue_ahi():
    """Si esta clase desaparece, la prueba de arriba deja de proteger nada."""
    codigo = ESCANER.read_text(encoding="utf-8")

    assert "saga-qr-scanner-open" in codigo
    assert "body.saga-qr-scanner-open" in codigo


def test_o_tema_sae_da_configuracion_cargada_non_so_da_cache():
    """La primera visita no tiene nada guardado.

    El efecto que aplica el tema leía `getCachedPublicConfig()`, o sea la copia
    guardada en el móvil. Un jugador que abre la aplicación por primera vez no
    tiene esa copia todavía, así que se quedaba con el tema de respaldo aunque
    la misión dijera otro. Comprobado en el banco de ensayo, en una carga
    limpia: `body.className` salía `theme-glass` con la misión puesta en
    `flame-red`.

    La configuración recién traída del servidor está en `state.config`. Esa es
    la que manda; la copia guardada sólo vale como respaldo.
    """
    codigo = sin_comentarios(JUGADOR)

    assert "aplicarTema(state.config?.player_theme" in codigo, (
        "el tema tiene que salir de la configuración cargada, no sólo de la caché"
    )
    assert "getCachedPublicConfig()?.player_theme" in codigo, (
        "la copia guardada se queda como respaldo, para abrir sin cobertura"
    )


def test_o_tema_ponse_en_canto_chega_a_configuracion():
    """En la primera apertura, esperar a `ready` son MINUTOS.

    Medido en el banco de ensayo: la pantalla dice "Primera vez: se guarda el
    mapa. Tarda unos minutos", y durante toda esa descarga el estado no es
    `ready`. El efecto que pone el tema no corría hasta el final, así que el
    jugador se pasaba la primera apertura entera con el tema equivocado —a los
    77 % de las teselas seguía en `theme-glass` con la misión en `flame-red`.

    La configuración llega mucho antes que las teselas. El tema se pone ahí.
    """
    codigo = sin_comentarios(JUGADOR)

    inicio = codigo.index("cachePublicConfig(nextConfig)")
    bloque = codigo[inicio : inicio + 220]

    assert "aplicarTema" in bloque, (
        "el tema tiene que ponerse en cuanto se conoce la configuración, no al "
        "terminar de descargar el mapa"
    )
