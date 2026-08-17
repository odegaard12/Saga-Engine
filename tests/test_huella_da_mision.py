# -*- coding: utf-8 -*-
"""La huella del contenido de la misión.

Para jugar sin cobertura el móvil necesita los nodos enteros: el minijuego, su
configuración, la foto del mosaico del nodo final y el código que acepta. Sobre
la misión real eso son 205 KB, contra 28 KB del estado del jugador. Y el móvil
pedía las dos cosas juntas cada treinta segundos, al volver a la aplicación y al
recuperar la red: en el monte, tres horas bajando la misma foto.

Con la huella el móvil sabe si lo que ya tiene sigue valiendo. Tiene que cambiar
cuando cambian los nodos y no cambiar cuando no.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-huella-"))

import main  # noqa: E402


def test_a_mesma_mision_da_a_mesma_huella():
    stages = main.get_runtime_stages()
    assert main.stages_revision(stages) == main.stages_revision(stages)


def test_a_huella_cambia_se_cambia_un_nodo():
    stages = main.get_runtime_stages()
    if not stages:
        stages = [main.normalize_stage({"id": 1, "title": "Nodo"})]

    antes = main.stages_revision(stages)

    tocado = [dict(stage) for stage in stages]
    tocado[0]["presentation"] = {
        **(tocado[0].get("presentation") or {}),
        "title": "Otro título completamente distinto",
    }

    assert main.stages_revision(tocado) != antes


def test_a_huella_cambia_se_sobra_ou_falta_un_nodo():
    stages = main.get_runtime_stages()
    if len(stages) < 2:
        stages = [
            main.normalize_stage({"id": 1, "title": "Un"}),
            main.normalize_stage({"id": 2, "title": "Dos"}),
        ]

    assert main.stages_revision(stages[:-1]) != main.stages_revision(stages)


def test_unha_mision_sen_nodos_tamen_ten_huella():
    """Vacía es un estado legítimo, no un error: no puede devolver cadena vacía,
    que es lo que significa "no lo sé" y obliga al móvil a bajarlo todo."""
    assert main.stages_revision([]) != ""
