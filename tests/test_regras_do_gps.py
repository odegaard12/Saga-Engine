# -*- coding: utf-8 -*-
"""Las reglas de GPS del juego, que deciden quién puede abrir un nodo.

Estaban repartidas por PlayerApp.tsx como cuentas sueltas entre la interfaz y
los ciclos de red, sin una sola prueba. Son las que más se equivocan en campo, y
lo hacen de las dos maneras: si son estrictas, alguien que está encima del nodo
no puede entrar; si son laxas, se abre desde el coche.

El dato que manda todo esto, medido en Cotorredondo: **bajo arbolado la
precisión anda por los 30-80 metros**. Cualquier regla pensada para una calle de
ciudad falla ahí.

Se comprueban leyendo el fuente porque no hay Node en todas las máquinas donde
corren estos tests; lo que se fija son los números y la forma de las decisiones,
que es donde estaba el peligro.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DECISIONES = RAIZ / "frontend" / "src" / "player" / "gps" / "decisiones.ts"
JUGADOR = RAIZ / "frontend" / "src" / "player" / "PlayerApp.tsx"


def sin_comentarios(fichero: Path) -> str:
    texto = fichero.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def test_o_limite_de_precision_non_baixa_de_60_metros():
    """45 m descartaba la posición entera en el monte y el HUD se congelaba."""
    codigo = sin_comentarios(DECISIONES)

    limite = re.search(r"Math\.max\((\d+), radioDelNodo", codigo)
    assert limite, "no se encontró el suelo del límite de precisión"
    assert int(limite.group(1)) >= 60


def test_o_limite_sobe_co_radio_do_nodo():
    """Un nodo de 120 m de radio tolera lecturas peores que uno de 20."""
    codigo = sin_comentarios(DECISIONES)

    assert "radioDelNodo ?? 50" in codigo


def test_sen_dato_de_precision_aceptase():
    """El navegador no siempre lo da; descartar por no saber deja sin posición."""
    codigo = sin_comentarios(DECISIONES)

    assert re.search(r"if \(precision === null\) return true", codigo)


def test_o_margen_que_se_perdoa_ten_tope():
    """Sin tope se abriría un nodo desde doscientos metros."""
    codigo = sin_comentarios(DECISIONES)

    tope = re.search(r"Math\.min\(Math\.max\(precision \?\? 0, 0\), (\d+)\)", codigo)
    assert tope, "no se encontró el tope del margen"
    assert 20 <= int(tope.group(1)) <= 50


def test_a_posicion_simulada_manda():
    """El modo de pruebas tiene que poder abrir nodos desde el sofá."""
    codigo = sin_comentarios(DECISIONES)

    inicio = codigo.index("export function estadoDelGps")
    cuerpo = codigo[inicio : inicio + 400]

    assert cuerpo.index("simulada") < cuerpo.index("hayPosicion"), (
        "lo simulado se comprueba antes que todo lo demás"
    )


def test_distinguese_vella_de_imprecisa():
    """Decir "sin GPS" cuando lo que pasa es que estás bajo un pinar es mentir."""
    codigo = sin_comentarios(DECISIONES)

    assert "'stale'" in codigo
    assert "'searching'" in codigo


def test_sen_saber_a_distancia_non_se_di_que_esta_fóra():
    """`false` sería decir que está fuera, y no es lo mismo que no saberlo."""
    codigo = sin_comentarios(DECISIONES)

    inicio = codigo.index("export function estaDentro")
    cuerpo = codigo[inicio : inicio + 400]

    assert "return null" in cuerpo


def test_o_xogador_usa_esas_regras_e_non_as_súas():
    """La copia del margen estaba escrita tres veces en PlayerApp."""
    codigo = sin_comentarios(JUGADOR)

    assert "margenQueSePerdona" in codigo
    assert "precisionAceptable" in codigo
    assert "Math.min(Math.max(browserGpsAccuracy" not in codigo, (
        "queda una copia suelta de la regla del margen"
    )
