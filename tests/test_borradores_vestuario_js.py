"""Panel de desbloqueables: guardar una sección no borra los borradores de las otras.

`cargar()` tiraba los tres borradores (catálogo, reglas, estrellas) tras CUALQUIER
guardado: poner precios, guardar las reglas y los precios sin guardar se perdían.
Ahora se tira sólo el de lo que manda el cuerpo del guardado (`seccionesGuardadas`).
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def js() -> dict:
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node para ejecutar los módulos TS del admin")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "borradores_vestuario.cjs")],
                       capture_output=True, text=True, encoding="utf-8", timeout=120)
    assert r.returncode == 0, r.stderr[-2000:]
    return json.loads(r.stdout)


def test_solo_se_tira_el_borrador_de_lo_guardado(js):
    assert js["catalogo"] == {"bloqueados": True, "reglas": False, "estrellas": False}
    assert js["reglas"] == {"bloqueados": False, "reglas": True, "estrellas": False}
    assert js["estrellas"] == {"bloqueados": False, "reglas": False, "estrellas": True}
    assert js["interruptor"] == {"bloqueados": False, "reglas": False, "estrellas": False}
    assert js["recargaSola"] == {"bloqueados": False, "reglas": False, "estrellas": False}


def test_el_panel_recarga_con_lo_guardado():
    panel = (RAIZ / "frontend/src/admin/components/vestuario/DesbloqueablesPanel.tsx").read_text(encoding="utf-8")
    assert "await cargar(cuerpo)" in panel
    assert "const tirar = seccionesGuardadas(guardado)" in panel
