# -*- coding: utf-8 -*-
"""La insignia de versión del README tiene que decir la verdad.

Ya mintió una vez, y mucho: se quedó en 3.14.2 desde antes del reinicio de
historial de agosto, con el proyecto por la 5.5.0 — o sea, lo primero que
ve cualquiera que abra el repositorio era una versión de hacía meses.

Y volvió a pasar en la misma sesión en que se arregló: se subieron 5.7.1,
5.7.2 y 5.7.3 sin tocar la insignia, que se quedó en 5.6.0. No es
descuido de una persona concreta: es que son dos sitios que dicen el mismo
dato y nada los ataba.

Esto los ata. Si se sube VERSION y no el README, la suite lo canta antes
de que llegue al repositorio.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
VERSION = RAIZ / "VERSION"
README = RAIZ / "README.md"


def test_a_insignia_do_readme_coincide_coa_version():
    version = VERSION.read_text(encoding="utf-8").strip()
    readme = README.read_text(encoding="utf-8")

    hallado = re.search(r"img\.shields\.io/badge/version-([0-9][0-9.]*)-", readme)

    assert hallado, "el README ya no lleva insignia de versión: ¿se quitó a propósito?"

    insignia = hallado.group(1)

    assert insignia == version, (
        f"el README dice {insignia} y VERSION dice {version}. Son el mismo dato "
        "en dos sitios: al subir una versión hay que tocar los dos."
    )


def test_o_changelog_ten_entrada_para_a_version_actual():
    """Una versión sin entrada en el CHANGELOG es una versión sin explicar.

    El CHANGELOG es lo que se lee para saber qué cambió y por qué; si la
    versión que corre en producción no aparece en él, ese "por qué" solo
    existe en la cabeza de quien la subió.
    """
    version = VERSION.read_text(encoding="utf-8").strip()
    changelog = (RAIZ / "CHANGELOG.md").read_text(encoding="utf-8")

    assert re.search(rf"^##\s+{re.escape(version)}\s*$", changelog, re.MULTILINE), (
        f"no hay entrada '## {version}' en CHANGELOG.md"
    )
