# -*- coding: utf-8 -*-
"""23/11: dos fallos vistos en producción (6.12.16).

1. «En el login, mi perfil sale la cara de mi jugador, no la mía, al volver a entrar»: la bienvenida y la pantalla de
   carga enseñan SU FOTO de perfil (la del admin, `/api/player-avatar/…` o incrustada); sin foto, su inicial. Nunca la
   cara del personaje 3D (ni otra imagen cualquiera), aunque la ficha traiga su personaje.
2. «Si mueves alrededor la vista, los jugadores se recolocan; deberían quedarse en su ubicación»: el reparto de los
   jugadores y el apartado junto al poste dependían del CUADRANTE de la cámara (20/11): al orbitar y cambiar de
   cuadrante todos saltaban (medido: hasta 25 m; desde 6.12.14, con el reparto a zoom fijo, igual de grande a
   cualquier zoom). Ahora son geográficos: ni desplazar, ni inclinar, ni girar mueven a nadie.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src"


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def foto():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "foto_de_perfil_23_11.cjs")], capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_la_bienvenida_usa_su_foto_aunque_tenga_personaje(foto):
    # Antes de que llegue la partida: la foto de la copia guardada de la configuración, no la cara del personaje.
    assert foto["deLaCopia"] == foto["FOTO"]
    assert foto["ref"] == foto["FOTO"]
    assert foto["incrustada"].startswith("data:image/")


def test_sin_foto_la_inicial_y_nunca_otra_imagen(foto):
    assert foto["sinFoto"] is None and foto["nada"] is None
    assert foto["caraDelPersonaje"] is None and foto["externa"] is None and foto["svg"] is None


def test_ninguna_pantalla_de_entrada_pinta_la_cara_del_personaje():
    for relativo in ("player/components/Bienvenida.tsx", "player/components/PantallaDeCarga.tsx", "login/LoginApp.tsx"):
        s = leer(relativo)
        assert "urlDeCara" not in s and "avatares3d/mixamo/rutas" not in s, relativo
    app = leer("player/PlayerApp.tsx")
    assert "cara: fotoDePerfil(fichaBienvenida?.profile)" in app
    # 23/11 (arranque y mi foto): su copia en el móvil primero (ver test_arranque_y_mi_foto_23_11.py).
    assert "foto={fotoActual}" in leer("player/components/Bienvenida.tsx")
    assert "fotoDelJugador(d.cara)" in leer("player/components/Bienvenida.tsx")
    assert "fotoDelJugador(datosDeBienvenida().cara)" in leer("player/components/PantallaDeCarga.tsx")


def test_girar_la_camara_no_reparte_de_nuevo():
    mapa = leer("player/components/MapSurfaceGL.tsx")
    assert "cuadranteDeLaCamara" not in mapa and "rumboDelReparto" not in mapa and "rumboDelPlanRef" not in mapa
    # 23/11 (fuente única): el plan ya no recibe giro ni inclinación, y su firma no mira la cámara: girar no rehace nada.
    assert "inclinacion:" not in mapa.split("planDeJugadores(otrosAnclados", 1)[1][:500]
    assert "getBearing" not in mapa.split("const firma = JSON.stringify([", 1)[1].split("])", 1)[0]


def test_el_apartado_del_poste_es_geografico():
    capa = leer("player/avatares3d/mixamo/capaAvatares.ts")
    # 23/11: el cuerpo se pinta EXACTAMENTE donde dice la fuente de posición; la capa no aparta nada por su cuenta.
    assert "apartarDelPoste" not in capa and "postesDeNodos" not in capa and "const mc = real" in capa
    fuente = leer("player/posicion/fuentePosicion.ts")
    assert "export function apartadosDelMundo(" in fuente and "cuadranteDeLaCamara" not in fuente
