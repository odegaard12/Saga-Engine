# -*- coding: utf-8 -*-
"""Salir de la aplicación en medio de un reto tiene consecuencia.

No había ninguna: nada miraba si el jugador se iba del juego, buscaba la
respuesta y volvía. Con un mosaico o un Simón delante, salir y volver era
gratis.

La parte que de verdad quita la ventaja no es el tiempo: es **reiniciar el
reto**. Al volver, el patrón es otro y lo memorizado fuera ya no vale. El
recargo de tiempo es el añadido.

⚠️ Esto no distingue una trampa de una llamada entrante, y nadie puede: el
navegador sólo dice que la página dejó de estar visible. Por eso la penalización
es moderada y las salidas muy cortas no cuentan, en vez de intentar adivinar
intenciones.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"

HOOK = FRONT / "player" / "hooks" / "useAntiTrampas.ts"
HOJA = FRONT / "player" / "components" / "InteractionSheet.tsx"


def sin_comentarios(fichero: Path) -> str:
    texto = fichero.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def test_detecta_que_se_sae_da_aplicacion():
    codigo = sin_comentarios(HOOK)

    assert "visibilitychange" in codigo
    # iOS no siempre dispara visibilitychange al cambiar de aplicación.
    assert "pagehide" in codigo


def test_o_reto_reiniciase_ao_volver():
    """Es lo que quita la ventaja; el tiempo es sólo el recargo."""
    codigo = sin_comentarios(HOJA)

    assert re.search(r"key=\{`reto-\$\{stageId\}-\$\{antiTrampas\.reinicios\}`\}", codigo), (
        "sin cambiar la key, React no rearma el juego y el patrón sigue siendo "
        "el mismo que se memorizó fuera"
    )


def test_o_tempo_de_castigo_suma_ao_total():
    codigo = sin_comentarios(HOJA)

    assert "antiTrampas.penalizacionMs" in codigo
    # Va con la penalización, no dentro del reloj del nodo: el servidor guarda
    # cada cosa en su sitio y meterlo dentro lo contaría dos veces.
    assert re.search(r"penaltyMs \|\| 0\)\) \+ antiTrampas\.penalizacionMs", codigo)


def test_as_saidas_moi_curtas_non_contan():
    """Bajar notificaciones o que se apague la pantalla no es hacer trampa."""
    codigo = sin_comentarios(HOOK)

    valor = re.search(r"SALIDA_MINIMA_MS = ([0-9_]+)", codigo)
    assert valor

    ms = int(valor.group(1).replace("_", ""))
    assert 500 <= ms <= 5000, "%s ms no es un umbral razonable" % ms


def test_so_se_vixia_mentres_hai_un_reto():
    """En un coleccionable no hay nada que memorizar fuera."""
    codigo = sin_comentarios(HOJA)

    assert "shouldRenderFamilyRuntime && !isStageCollectible(currentStage)" in codigo


def test_queda_constancia_para_o_panel():
    """En el marcador sólo se ve tiempo, y eso no distingue tardar de salir."""
    codigo = sin_comentarios(HOJA)

    assert "salidas_da_aplicacion" in codigo


def test_avisase_ao_xogador():
    """Un patrón que se reinicia solo, sin explicación, parece un fallo."""
    codigo = sin_comentarios(HOJA)

    assert "antiTrampas.acabaDeVolver" in codigo
