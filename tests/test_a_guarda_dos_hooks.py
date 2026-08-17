# -*- coding: utf-8 -*-
"""La regla que caza el error 310 de React tiene que poder tumbar el lint.

El fallo más caro que ha tenido este frontend fue meter un hook por debajo de
un `return` temprano en `PlayerApp.tsx`: React tira la aplicación entera con el
error 310. Pasó, y llegó a producción.

Existe una regla que lo caza —`react-hooks/rules-of-hooks`— y estaba puesta en
`warn`. `eslint` termina con código 0 cuando sólo hay avisos, así que el
workflow de lint **no podía fallar nunca por eso**: la guarda estaba, pero
desconectada.

Medido antes de subirla: 275 avisos en total y **0** de esta regla. O sea que
ponerla en `error` no costaba arreglar nada; sólo dejaba la trampa armada.

Las demás siguen en `warn` a propósito: `no-unused-vars` tiene 134 y
`exhaustive-deps` 33, y un lint que falla por 275 cosas se acaba desactivando.
"""
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CONFIG = RAIZ / "frontend" / ".eslintrc.json"
WORKFLOW = RAIZ / ".github" / "workflows" / "lint.yml"


def reglas() -> dict:
    return json.loads(CONFIG.read_text(encoding="utf-8")).get("rules", {})


def test_a_regra_dos_hooks_e_erro():
    """En `warn` no tumba nada, y esto ya tiró la aplicación una vez."""
    assert reglas().get("react-hooks/rules-of-hooks") == "error", (
        "rules-of-hooks tiene que ser 'error': en 'warn' el lint sale con "
        "codigo 0 y la guarda no guarda nada"
    )


def test_as_demais_seguen_en_aviso():
    """Un lint que falla por 275 cosas se desactiva, y entonces no queda nada."""
    r = reglas()

    for regla in ("@typescript-eslint/no-unused-vars", "react-hooks/exhaustive-deps"):
        assert r.get(regla) == "warn", (
            f"{regla} tiene 134 y 33 avisos: ponerla en error rompe el lint hoy"
        )


def test_o_lint_corre_en_cada_empuxon():
    """Una regla en error no sirve de nada si nadie ejecuta eslint."""
    texto = WORKFLOW.read_text(encoding="utf-8")

    assert re.search(r"\beslint\b", texto), "el workflow no ejecuta eslint"
    assert "push" in texto, "el lint no corre al empujar"
