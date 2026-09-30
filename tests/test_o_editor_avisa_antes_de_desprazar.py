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

Estado a 30 de septiembre de 2026 (informe A12): esa estimación usa los niveles
de cuando se cargó el panel, que pueden estar viejos. Ahora el orden del
guardado vive en `runStagesSave` (adminSaveFlow.ts): cuando cambian los ids o su
orden, primero pide al servidor un ensayo (`dry_run`) con la lista de afectados
de AHORA, pregunta, y solo entonces guarda. La estimación local queda de reserva
si el servidor no manda la lista.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ADMIN = RAIZ / "frontend" / "src" / "admin"
PERSISTENCE = ADMIN / "lib" / "adminStagePersistence.ts"
APP = ADMIN / "AdminApp.tsx"
FLUJO = ADMIN / "lib" / "adminSaveFlow.ts"


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


def flujo() -> str:
    return FLUJO.read_text(encoding="utf-8")


def cuerpo_do_gardado() -> str:
    texto = flujo()
    inicio = texto.index("export async function runStagesSave")
    return texto[inicio:]


def test_o_gardado_delega_no_fluxo_de_gardado():
    """El orden del guardado vive en adminSaveFlow.ts (se prueba con simulaciones
    en test_admin_guardado_honesto.py); AdminApp solo lo llama."""
    texto = app()

    inicio = texto.index("async function saveLocalStages")
    fin = texto.index("\n  function ", inicio)
    assert "runStagesSave(" in texto[inicio:fin]


def test_o_gardado_pregunta_a_quen_afecta_antes_de_mandar_nada():
    """Primero el ensayo (el servidor dice a quién le cambia el nodo con los niveles
    de AHORA), después la pregunta y, solo si se confirma, el guardado de verdad."""
    cuerpo = cuerpo_do_gardado()

    ensayo = cuerpo.index("dryRun: true")
    pregunta = cuerpo.index("deps.confirm(")
    envio = cuerpo.index("deps.saveStages(persisted, { stagesRevision })")
    assert ensayo < pregunta < envio, (
        "el cálculo de desplazados tiene que pasar antes de mandar el guardado "
        "al servidor, no después"
    )


def test_o_calculo_local_segue_de_reserva():
    """Si el servidor contesta el ensayo sin la lista de afectados, se usa la
    estimación local (jugadoresDesprazadosPolGardado)."""
    assert "jugadoresDesprazadosPolGardado(" in cuerpo_do_gardado()


def test_cancelar_o_aviso_non_garda():
    cuerpo = cuerpo_do_gardado()

    inicio = cuerpo.index("deps.confirm(")
    trozo = cuerpo[inicio : inicio + 400]

    assert "kind: 'cancelled'" in trozo
    assert "return" in trozo, "cancelar el aviso tiene que cortar el guardado, no seguir igual"
