# -*- coding: utf-8 -*-
"""24/11: clasificación ligera y fluida sin cobertura.

- El móvil pide la tabla por CAMPOS (`equipo_campos`): de cada perfil que cambió sólo viaja lo que cambió (quien se
  mueve: posición, rumbo y `last_seen`), y su propio estado sólo con nivel, si acabó y tiempo.
- Un latido sin cambios no trae tabla; un jugador parado no vuelve a viajar tras un cambio suyo (antes la huella se
  guardaba con la posición de antes y viajaba en cada latido, para siempre).
- La tabla fusionada es la misma que la completa, y el orden (empates incluidos) no cambia.
- La hoja no se repinta si no cambia lo que pinta, y sus filas van memorizadas.
Lógica de JS en tests/js/clasificacion_ligera_24_11.cjs.
"""
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-clasif-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers.game import construir_tabla_de_equipo  # noqa: E402
from backend.app.runtime import equipo_delta as ed  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
ARNES = RAIZ / "tests" / "js" / "clasificacion_ligera_24_11.cjs"
NOMBRES = ["PLAYER %d" % i for i in range(1, 7)]
M = 1 / 111_320.0


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    perfiles = [{"id": n, "display_name": n, "color": "#22c55e"} for n in NOMBRES]
    original = main.load_config
    monkeypatch.setattr(main, "load_config", lambda: {**original(), "player_profiles": perfiles})
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "exigir_ser_del_grupo", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    return TestClient(main.app)


def _latido(c, user, lat, **extra):
    cuerpo = {"user": user, "lat": lat, "lon": -3.6, "accuracy": 6, "gps_status": "ok", "equipo": True, **extra}
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    r = c.post("/api/heartbeat", json=cuerpo)
    assert r.status_code == 200, r.text
    return r.json()


def _js(entrada=None):
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    p = subprocess.run(
        [node, str(ARNES)], input=json.dumps(entrada) if entrada else "", capture_output=True, text=True,
        encoding="utf-8", timeout=240, cwd=str(RAIZ),
    )
    assert p.returncode == 0, p.stderr[-3000:]
    datos = json.loads(p.stdout)
    errores = {k: v["__error"] for k, v in datos.items() if isinstance(v, dict) and "__error" in v}
    assert not errores, errores
    return datos


@pytest.fixture(scope="module")
def js():
    return _js()


def test_por_campos_quien_se_mueve_solo_manda_lo_que_cambio(cliente):
    yo = "PLAYER 1"
    t = _latido(cliente, yo, 40.4, equipo_epoca="", equipo_rev=0, equipo_campos=True)
    assert set(t["live_status"]) == {"level", "finished", "total_time_ms"}, "el estado propio, sólo lo que lee el móvil"
    team = t["team"]
    assert team["completo"] and team["campos"] is True and len(team["profiles"]) == len(NOMBRES)
    assert all("display_name" in p and "is_self" not in p for p in team["profiles"]), "la completa va entera"
    _latido(cliente, "PLAYER 2", 40.4 + 50 * M)  # se mueve 50 m
    team = _latido(cliente, yo, 40.4, equipo_epoca=team["epoca"], equipo_rev=team["rev"], equipo_campos=True)["team"]
    assert not team["completo"]
    otro = [p for p in team["profiles"] if p["user"] == "PLAYER 2"]
    assert otro and set(otro[0]) <= {"user", "lat", "lon", "heading", "last_seen", "presence", "gps_status", "source"}
    assert "display_name" not in otro[0] and "avatar" not in otro[0] and "total_time_ms" not in otro[0]


def test_sin_cambios_no_hay_tabla_y_el_parado_no_vuelve_a_viajar(cliente):
    yo = "PLAYER 1"
    team = _latido(cliente, yo, 40.4, equipo_epoca="", equipo_rev=0, equipo_campos=True)["team"]
    epoca, rev = team["epoca"], team["rev"]
    # PLAYER 2 sube de nodo (un cambio de verdad) con el GPS bailando 2 m: viaja una vez...
    _latido(cliente, "PLAYER 2", 40.4)
    team = _latido(cliente, yo, 40.4, equipo_epoca=epoca, equipo_rev=rev, equipo_campos=True)["team"]
    rev = team["rev"]
    main.set_player_progress_level("PLAYER 2", 1)
    _latido(cliente, "PLAYER 2", 40.4 + 2 * M)
    team = _latido(cliente, yo, 40.4, equipo_epoca=epoca, equipo_rev=rev, equipo_campos=True)["team"]
    assert [p["user"] for p in team["profiles"]] == ["PLAYER 2"] and team["profiles"][0]["level"] == 1
    rev = team["rev"]
    # ...y luego, parado con el mismo baile, ya no (antes viajaba en CADA latido tras su cambio).
    for i in range(3):
        _latido(cliente, "PLAYER 2", 40.4 + (2 * M if i % 2 else 0))
        team = _latido(cliente, yo, 40.4, equipo_epoca=epoca, equipo_rev=rev, equipo_campos=True)["team"]
        assert team["profiles"] == [] and "ids" not in team, "ronda %d: un latido sin cambios no trae tabla" % i
        rev = team["rev"]


def test_lo_que_desaparece_viaja_en_quitar():
    ed._perfiles.clear()
    ed._posiciones.clear()
    ed._ids, ed._ids_rev = (), 0
    p = {"user": "A", "presence": "stale", "pos_at": 50, "last_seen": 100, "lat": 40.0, "lon": -3.0, "level": 1}
    t = ed.a_diferencias([p], None, None, True)
    vivo = {k: v for k, v in p.items() if k != "pos_at"}
    vivo.update(presence="live", last_seen=130)
    t2 = ed.a_diferencias([vivo], t["epoca"], t["rev"], True)
    assert t2["profiles"] == [{"user": "A", "presence": "live", "last_seen": 130, "quitar": ["pos_at"]}]


def test_la_tabla_fusionada_por_campos_es_la_completa(cliente):
    """Rondas con gente que se mueve, que sube de nodo, que se borra y que aparece: el móvil acaba con la misma tabla."""
    rondas, completas = [], []
    epoca, rev = "", 0
    for i in range(8):
        if i in (2, 5):
            main.set_player_progress_level("PLAYER 3", i)
        for n in NOMBRES[1:4]:
            _latido(cliente, n, 40.4 + i * 20 * M)
        t = _latido(cliente, "PLAYER 1", 40.4 + i * 20 * M, equipo_epoca=epoca, equipo_rev=rev, equipo_campos=True)
        team = t["team"]
        epoca, rev = team["epoca"], team["rev"]
        rondas.append(team)
        completas.append(construir_tabla_de_equipo("PLAYER 1")["profiles"])
    salida = _js({"user": "PLAYER 1", "rondas": rondas})
    assert not any(salida["pidenCompleta"])
    for i, (fusionada, completa) in enumerate(zip(salida["tablas"], completas)):
        assert fusionada == completa, "ronda %d: la tabla fusionada no es la completa" % i


def test_fusion_por_campos_conserva_lo_que_no_cambio(js):
    f = js["fusion"]
    assert f["b"]["lat"] == 40.001 and f["b"]["display_name"] == "B" and f["b"]["last_seen"] == 130
    assert "pos_at" not in f["c"] and f["c"]["presence"] == "live" and "quitar" not in f["c"]
    assert f["aMismoObjeto"] and f["conYoMismoA"] and f["conYoNuevoB"], "lo que no cambió, el MISMO objeto"
    assert f["isSelf"] == [True, False, False]
    assert f["viejoB"] == {"user": "B", "lat": 1}, "sin `campos`, la entrada sustituye entera (servidor viejo)"
    assert f["tardeMismo"]


def test_la_hoja_no_se_repinta_por_moverse(js):
    f = js["firma"]
    assert f["igualAlMoverse"], "posición, rumbo y last_seen no se pintan en la hoja"
    assert f["cambiaConElTiempo"] and f["cambiaConLaPresencia"] and f["cambiaConLaFoto"] and f["mismaListaMismaCadena"]


def test_tu_fila_sin_cobertura_sigue_al_dia_y_el_servidor_la_corrige(js):
    s = js["sinCobertura"]
    assert s["sinRed"] == [160000, 3, "live", "peregrino"], "sin red: tu tiempo del móvil y tu nodo"
    assert s["conRed"] == 158000, "con el mismo nodo, manda el servidor"
    assert s["sinLatido"] == [160000, 4]
    assert s["ordenSinRed"] == ["R2", "R1", "YO"] and s["ordenConRed"] == ["R2", "YO", "R1"]


def test_los_empates_no_cambian_con_la_fusion(js):
    assert js["empates"]["antes"] == ["C", "A", "B", "D"] == js["empates"]["despues"]


def test_la_hoja_va_memorizada_y_el_latido_pide_campos():
    front = RAIZ / "frontend" / "src" / "player"
    hoja = (front / "components" / "RankingSheet.tsx").read_text(encoding="utf-8")
    assert "export const RankingSheet = memo(" in hoja and "firmaDeLaHoja(a.players) === firmaDeLaHoja(b.players)" in hoja
    assert "const Fila = memo(function Fila(" in hoja
    assert "tx.sinConexion" in hoja and "sinRedAhora()" in hoja
    latido = (front / "hooks" / "useLatidoYCola.ts").read_text(encoding="utf-8")
    assert "equipo_campos: true" in latido
    assert "profiles.every((p, i) => p === ultimo[i])) return" in latido, "un latido sin cambios no repinta la partida"
