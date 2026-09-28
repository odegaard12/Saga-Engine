"""O editor guiado escribía `requires_proximity` (con s) e a persistencia lía
`require_proximity`: todo nodo novo gardábase sen esixir proximidade, e o
servidor abre a porta a calquera distancia cando ese campo vale false."""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ADMIN = RAIZ / "frontend" / "src" / "admin"


def test_ningun_ficheiro_do_admin_escribe_requires_proximity():
    for ficheiro in ADMIN.rglob("*.ts*"):
        assert "requires_proximity" not in ficheiro.read_text(encoding="utf-8"), ficheiro


def test_a_persistencia_le_o_mesmo_campo_que_escribe_o_editor():
    editor = (ADMIN / "components" / "AdminGameEditor.tsx").read_text(encoding="utf-8")
    persistencia = (ADMIN / "lib" / "adminStagePersistence.ts").read_text(encoding="utf-8")
    assert "require_proximity:" in editor
    assert "Boolean(stage.require_proximity)" in persistencia
