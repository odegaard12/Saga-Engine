# -*- coding: utf-8 -*-
"""La configuración del lint, en el formato que acepta el eslint de ahora.

Estaba en `.eslintrc.json`, el formato viejo, y el workflow ejecutaba
`eslint src --ext .ts,.tsx,.js,.jsx`. ESLint 10 quitó **las dos cosas**: el
formato y la bandera. Mientras siguiera así, cualquier actualización de eslint
rompía el lint por dos sitios a la vez, y el aviso de dependencias se quedaba
abierto para siempre sin poder entrar.

La migración se pagó sola en el primer intento: al heredar de verdad
`eslint:recommended` aparecio un `no-redeclare` que el montaje viejo no daba, y
era real —`StageMinigameRuntime` estaba declarada dos veces, identica, en
`types/player.ts`—. TypeScript funde interfaces iguales en silencio, asi que
compilaba y nadie lo veia.

Lo que NO puede cambiar es la unica regla que tumba el lint.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CONFIG = RAIZ / "frontend" / "eslint.config.js"
VIEJA = RAIZ / "frontend" / ".eslintrc.json"
WORKFLOW = RAIZ / ".github" / "workflows" / "lint.yml"
TIPOS = RAIZ / "frontend" / "src" / "types" / "player.ts"


def test_non_queda_a_configuracion_vella():
    """Con las dos, eslint elige una y la otra engaña a quien la lea."""
    assert not VIEJA.exists(), ".eslintrc.json ya no lo lee eslint: sobra"


def test_a_configuracion_e_plana():
    assert CONFIG.exists(), "falta eslint.config.js"
    codigo = CONFIG.read_text(encoding="utf-8")

    assert "export default [" in codigo, "el formato plano es una lista exportada"


def test_a_regra_dos_hooks_segue_sendo_erro():
    """Es la que caza el error 310, que ya llego a produccion una vez."""
    codigo = CONFIG.read_text(encoding="utf-8")

    assert re.search(r"'react-hooks/rules-of-hooks':\s*'error'", codigo), (
        "en 'warn' el lint sale con codigo 0 y la guarda no guarda nada"
    )


def test_as_demais_seguen_en_aviso():
    """213 avisos vivos: un lint que falla por todo se acaba desactivando."""
    codigo = CONFIG.read_text(encoding="utf-8")

    for regla in ("@typescript-eslint/no-unused-vars", "react-hooks/exhaustive-deps"):
        assert re.search(rf"'{re.escape(regla)}':\s*'warn'", codigo), f"{regla} deberia ser warn"


def test_o_workflow_xa_non_usa_ext():
    """`--ext` no existe desde eslint 9: el comando fallaria antes de mirar nada."""
    texto = WORKFLOW.read_text(encoding="utf-8")

    assert "--ext" not in texto
    assert re.search(r"run:\s*npx eslint src\s*$", texto, re.MULTILINE), (
        "el workflow tiene que ejecutar eslint sin banderas que ya no existen"
    )


def test_o_tipo_duplicado_non_volve():
    """Dos interfaces iguales se funden en silencio; si divergen, ya no."""
    codigo = TIPOS.read_text(encoding="utf-8")

    assert codigo.count("export interface StageMinigameRuntime") == 1
