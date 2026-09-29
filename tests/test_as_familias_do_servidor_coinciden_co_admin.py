"""O mapa xogo→familia xa non existe dúas veces: servidor e admin léenno de
shared/game_registry.json (antes Pulso de ferro caía en «Movemento» no
servidor e en «Desafío» no admin). Este teste comproba que ambos lados o len
igual: o do servidor directamente e o do admin executando o TS de verdade
(tests/js/registro_frontend.cjs). A cobertura por xogo está en
tests/test_registro_de_minijuegos.py."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from backend.app.routers.admin import GAME_ID_DISPLAY_FAMILY

RAIZ = Path(__file__).resolve().parents[1]


def test_o_servidor_le_a_familia_de_cada_xogo_do_rexistro():
    rexistro = json.loads((RAIZ / "shared" / "game_registry.json").read_text(encoding="utf-8"))
    esperado = {x["id"]: x["display_family"] for x in rexistro["games"]}
    assert GAME_ID_DISPLAY_FAMILY == esperado
    assert len(esperado) >= 20


def test_cada_xogo_do_admin_ten_a_mesma_familia_no_servidor():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sen Node ou sen dependencias do frontend")
    saida = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "registro_frontend.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=120, cwd=str(RAIZ),
    )
    assert saida.returncode == 0, saida.stderr[-1500:]
    admin = {x: v["familiaPresentacion"] for x, v in json.loads(saida.stdout)["juegos"].items()}
    distintos = {x: (f, GAME_ID_DISPLAY_FAMILY.get(x)) for x, f in admin.items() if GAME_ID_DISPLAY_FAMILY.get(x) != f}
    assert not distintos, distintos
    assert len(admin) >= 20
