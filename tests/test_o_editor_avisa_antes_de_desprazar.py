# -*- coding: utf-8 -*-
"""Borrar un nodo puede saltar o rematar la misión a quien va detrás — y antes
de este cambio, nadie se enteraba hasta que ya estaba guardado.

De docs/plan-de-mejora.md, 1.2 «Editor de nodos»:

    El progreso de un jugador se guarda como ÍNDICE en la lista de nodos, no
    como id del nodo. Borrar un nodo anterior hace que el jugador se salte
    uno. Y si va por el último, se le da la misión por terminada.

Lo barato mientras tanto, tal como lo pedía el propio plan: «Avisar en el
panel antes de guardar: esto desplaza a N jugadores». El servidor -y aquí,
el propio panel, que ya tiene cargados los dos datos: los nodos de antes y el
nivel de cada jugador- puede calcularlo sin migrar nada.

Estado a 27 de agosto de 2026: el aviso vive en el cliente, en
`jugadoresDesprazadosPolGardado` (adminStagePersistence.ts), y se dispara
desde `saveLocalStages` antes de mandar nada al servidor.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ADMIN = RAIZ / "frontend" / "src" / "admin"
PERSISTENCE = ADMIN / "lib" / "adminStagePersistence.ts"
APP = ADMIN / "AdminApp.tsx"


def persistencia() -> str:
    return PERSISTENCE.read_text(encoding="utf-8")


def app() -> str:
    return APP.read_text(encoding="utf-8")


def cuerpo_da_funcion() -> str:
    texto = persistencia()
    inicio = texto.index("export function jugadoresDesprazadosPolGardado")
    fin = texto.index("\nexport function verifyPersistedStages", inicio)
    return texto[inicio:fin]


def test_a_comparacion_e_por_indice_non_por_id():
    """El fallo es de índice: comparar por id no lo detectaría."""
    cuerpo = cuerpo_da_funcion()

    assert "stagesAntes[level]" in cuerpo, "no compara contra el puesto que ocupaba antes"
    assert "stagesDespois[level]" in cuerpo, "no mira qué hay ahora en ese mismo puesto"
    assert "idDespois !== idAntes" in cuerpo, "el desplazamiento tiene que salir de comparar ids en el mismo índice"


def test_ignora_a_quen_xa_rematou():
    cuerpo = cuerpo_da_funcion()
    assert "if (profile.finished) continue" in cuerpo, (
        "un jugador que ya terminó no puede contar como desplazado"
    )


def test_o_gardado_calcula_o_impacto_antes_de_mandar_nada():
    texto = app()

    inicio = texto.index("async function saveLocalStages")
    fin = texto.index("\n  function ", inicio)
    cuerpo = texto[inicio:fin]

    llamada = cuerpo.index("jugadoresDesprazadosPolGardado(")
    envio = cuerpo.index("await saveAdminStages(")
    assert llamada < envio, (
        "el cálculo de desplazados tiene que pasar antes de mandar el guardado "
        "al servidor, no después"
    )


def test_cancelar_o_aviso_non_garda():
    texto = app()

    inicio_funcion = texto.index("async function saveLocalStages")
    fin_funcion = texto.index("\n  function ", inicio_funcion)
    cuerpo = texto[inicio_funcion:fin_funcion]

    inicio = cuerpo.index("window.confirm(")
    trozo = cuerpo[inicio : inicio + 550]

    assert "if (!continuar) {" in trozo
    assert "return" in trozo, "cancelar el aviso tiene que cortar el guardado, no seguir igual"
