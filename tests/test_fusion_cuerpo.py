"""23/11 «personajes con menos dibujos»: las mallas de un cuerpo (cuerpo, pantalón, camisa, zapatos, pelo, pestañas...) se
juntan en pocas llamadas de dibujo y UN esqueleto, sin cambiar cómo se ve. La lógica corre en Node sobre un cuerpo de juguete
con el mismo problema que los GLB reales (tests/js/fusion_cuerpo.cjs) y usa el look.ts REAL del motor."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
MIXAMO = RAIZ / "frontend" / "src" / "player" / "avatares3d" / "mixamo"


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "fusion_cuerpo.cjs")], capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_nueve_mallas_se_quedan_en_dos_mas_la_de_otra_textura(js):
    assert js["esqueletosAntes"] == 9
    assert js["nuevas"] == ["ChT_cuerpo", "ChT_Otra", "ChT_pelo"]
    # las absorbidas salen de la escena
    assert js["meshesDespues"] == ["ChT_cuerpo", "ChT_Otra", "ChT_pelo"]
    assert js["hijosDelModelo"] == ["ChT_cuerpo", "ChT_Otra", "ChT_pelo"]
    # la de otra textura no se junta con las demás, pero conserva su material y entra en el esqueleto común
    assert js["otraTextura"] == {"conservaMaterial": True, "esqueletoComun": True, "vertices": 3, "sinAtributosNuevos": True}
    assert js["registros"] == [
        {"vertices": 15, "partes": 5, "desp": [0, 3, 6, 9, 12]},
        {"vertices": 3, "partes": 1, "desp": [0]},
        {"vertices": 9, "partes": 3, "desp": [0, 3, 6]},
    ]


def test_un_solo_esqueleto_por_cuerpo(js):
    assert js["mismoEsqueletoLasNuevas"] is True
    assert js["esqueletosDespues"] == 1


def test_los_vertices_quedan_donde_estaban(js):
    # cada parte traía su cuantización metida en sus matrices inversas: en las coordenadas del esqueleto común
    # el vértice skineado cae donde caía con el suyo
    assert js["maxDifPosicion"] < 1e-6
    assert js["verticesComprobados"] == 24
    assert js["tipoPosicion"] == "Float32Array"
    assert js["indiceCuerpo"] == list(range(15))
    assert js["atributosCuerpo"] == ["aSlot", "normal", "position", "skinIndex", "skinWeight", "uv"]
    assert js["atributosPelo"] == ["aHair", "normal", "position", "skinIndex", "skinWeight", "uv"]
    assert js["sinARopaEnLoFusionado"] is True


def test_cada_vertice_sabe_su_tinte(js):
    # cuerpo 0 (sin tinte), pantalón 1, camisa 2, zapatos 3, sudadera de dos partes 4 + su mezcla (aRopa 0, .5, 1)
    assert js["aSlot"] == [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4.5, 5]
    # pelo de la cabeza 2 (tinte y recorte), cejas 1 (tinte), pestañas 0 (nada)
    assert js["aHair"] == [2, 2, 2, 1, 1, 1, 0, 0, 0]


def test_los_uniformes_del_tinte_son_los_de_las_partes_originales(js):
    assert all(js["cuerpoComparteUniformes"].values())
    assert js["peloUniformesDelMotor"] is True
    # lo que el motor escribe en el material original lo ve la malla fusionada, sin copiar nada
    assert js["uniformeVivo"] == 1.25
    assert js["recorteVivo"] == 1


def test_el_sombreador_del_cuerpo(js):
    g = js["cuerpoGlsl"]
    assert g["funciones"] == 5 and g["seleccion"] and g["atributo"]
    assert g["antesDeMain"] and g["tintesAntesDelMapa"]
    assert g["llavesIguales"] and g["parentesisIguales"]
    assert js["claveDeProgramaCuerpo"] == "fcuerpo5"


def test_el_pelo_conserva_el_sombreador_del_motor_con_el_parche(js):
    p = js["peloGlsl"]
    assert p["recorteSoloCabeza"] and p["tinteSoloPelo"] and p["atributo"] and p["conserva"]
    assert js["peloDefines"]["RC_PELO"] == 1 and js["peloDefines"]["RC_A2C"] == 1
    assert js["peloClave"].startswith("fpelo")


def test_si_el_motor_cambia_el_texto_que_se_parchea_no_se_fusiona_el_pelo(js):
    assert js["sePuedeParchear"] == {"motor": True, "sinMotor": False}


def test_es_idempotente_y_las_firmas_distinguen(js):
    assert js["segundaLlamada"] == 0
    assert js["firmas"] == {"igual": True, "otraTextura": True, "conDefineDeDosPartes": True, "pelo": True}
    assert js["concatenar"] == [0, 1, 2, 10, 12, 11]
    assert js["glslN"] == {"uno": 1, "seis": 6, "uniformes": True, "plano": True, "claveLisa": "fcuerpo1f"}


def test_solo_se_juntan_esqueletos_equivalentes(js):
    t = js["transformacion"]
    assert t["propio"] is True and t["escala"] is True
    assert t["giro"] is None and t["noUniforme"] is None and t["otrosHuesos"] is None and t["distintaPorHueso"] is None


def test_el_avatar_del_mapa_usa_la_fusion_y_las_dos_pasadas_van_despues():
    avatar = (MIXAMO / "avatar.ts").read_text(encoding="utf-8")
    espejar = avatar[avatar.index("export function espejar"):avatar.index("export function dibujosDe")]
    assert espejar.index("fusionarCuerpo(") < espejar.index("dosPasadas(piel)")
    assert "SIN_FUSION" in espejar and "sin-fusion=1" in avatar
    # la versión barata de lo fusionado sale de la barata de cada parte (mismos triángulos que antes)
    assert "barataFusionada" in avatar and "deFusion.get(f)" in avatar
    assert "deFusionPropios" in avatar.split("export function liberarAvatar")[1]
