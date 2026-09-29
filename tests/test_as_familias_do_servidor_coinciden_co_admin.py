"""O mapa xogo→familia existe dúas veces: no admin (displayFamilies.ts) e no
servidor (GAME_ID_DISPLAY_FAMILY, para os contadores). Pulso de ferro
caía en «Movemento» no servidor e en «Desafío» no admin: as fichas contaban
mal. Cada xogo do admin ten que ter a mesma familia nos dous sitios."""
import re
from pathlib import Path

from backend.app.routers.admin import GAME_ID_DISPLAY_FAMILY

RAIZ = Path(__file__).resolve().parents[1]


def _mapa_do_admin():
    fonte = (RAIZ / "frontend/src/admin/lib/displayFamilies.ts").read_text(encoding="utf-8")
    bloque = fonte.split("DISPLAY_FAMILY_BY_GAME_ID", 1)[1].split("}", 1)[0]
    return dict(re.findall(r"^\s*(\w+):\s*'(\w+)'", bloque, re.MULTILINE))


def test_cada_xogo_do_admin_ten_a_mesma_familia_no_servidor():
    admin = _mapa_do_admin()
    assert len(admin) >= 20
    distintos = {x: (f, GAME_ID_DISPLAY_FAMILY.get(x)) for x, f in admin.items() if GAME_ID_DISPLAY_FAMILY.get(x) != f}
    assert not distintos, distintos
