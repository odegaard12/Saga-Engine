# -*- coding: utf-8 -*-
"""25/10 (ahorro de datos): la tabla de equipo del latido va por DIFERENCIAS.

Cada latido (cada 30 s) mandaba la tabla entera aunque casi nadie hubiera cambiado. Ahora el móvil dice qué época y
revisión tiene y el servidor sólo contesta con lo que cambió. Lo que no puede cambiar: la tabla que arma el móvil
tiene que ser IDÉNTICA a la completa (clasificación y muñecos del mapa salen de ahí), y un móvil viejo sigue
recibiendo la tabla entera de siempre.
"""
import gzip
import json
import os
import shutil
import subprocess
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-delta-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers.game import construir_tabla_de_equipo  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOMBRES = ["PLAYER 1", "PLAYER 2", "PLAYER 3", "PLAYER 4", "PLAYER 5", "PLAYER 6"]


def _perfiles(nombres):
    return [{"id": n, "display_name": n, "color": "#22c55e"} for n in nombres]


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    estado = {"perfiles": _perfiles(NOMBRES)}
    original = main.load_config
    monkeypatch.setattr(main, "load_config", lambda: {**original(), "player_profiles": estado["perfiles"]})
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "exigir_ser_del_grupo", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    c = TestClient(main.app)
    c.estado = estado
    return c


def _latido(c, user, i, **extra):
    # Coordenadas inventadas, una por jugador y ronda.
    cuerpo = {"user": user, "lat": 40.4 + i * 1e-4, "lon": -3.6 - i * 1e-4, "accuracy": 6, "gps_status": "ok", "equipo": True}
    cuerpo.update(extra)
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    r = c.post("/api/heartbeat", json=cuerpo)
    assert r.status_code == 200, r.text
    return r


def _fusionar_en_node(user, rondas):
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    r = subprocess.run(
        [node, os.path.join(RAIZ, "tests", "js", "equipo_por_diferencias.cjs")],
        input=json.dumps({"user": user, "rondas": rondas}), capture_output=True, text=True, encoding="utf-8",
    )
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_a_tabla_fusionada_e_identica_a_completa_en_varias_rondas(cliente):
    """Rondas con gente que se mueve, que se queda quieta, que se borra y que aparece; el móvil acaba igual."""
    rondas, completas = [], []
    epoca, rev = "", 0
    for i in range(10):
        if i == 3:
            _latido(cliente, "PLAYER 2", i)
            _latido(cliente, "PLAYER 4", i)
        elif i == 6:  # el panel borra a PLAYER 3 y mete a uno nuevo al final
            cliente.estado["perfiles"] = _perfiles(["PLAYER 1", "PLAYER 2", "PLAYER 4", "PLAYER 5", "PLAYER 6", "PLAYER 7"])
        elif i == 8:  # y reordena
            cliente.estado["perfiles"] = _perfiles(["PLAYER 7", "PLAYER 1", "PLAYER 2", "PLAYER 4", "PLAYER 5", "PLAYER 6"])
        elif i == 9:
            _latido(cliente, "PLAYER 7", i)
        r = _latido(cliente, "PLAYER 1", i, equipo_epoca=epoca, equipo_rev=rev)
        team = r.json()["team"]
        epoca, rev = team["epoca"], team["rev"]
        rondas.append(team)
        completas.append(construir_tabla_de_equipo("PLAYER 1")["profiles"])

    salida = _fusionar_en_node("PLAYER 1", rondas)
    assert not any(salida["pidenCompleta"]), "una fusión no cuadró: el móvil habría pedido la tabla completa"
    for i, (fusionada, completa) in enumerate(zip(salida["tablas"], completas)):
        assert fusionada == completa, "ronda %d: la tabla fusionada no es la completa" % i
    # La primera es completa y la mayoría de las demás van casi vacías.
    assert rondas[0]["completo"] is True
    assert all(not t["completo"] for t in rondas[1:])
    assert len(rondas[1]["profiles"]) <= 1 and len(rondas[2]["profiles"]) <= 1
    assert "ids" not in rondas[1] and "ids" in rondas[6] and "ids" in rondas[8]


def test_otra_epoca_o_sin_revision_manda_la_tabla_completa(cliente):
    r1 = _latido(cliente, "PLAYER 1", 0, equipo_epoca="", equipo_rev=0).json()["team"]
    assert r1["completo"] and len(r1["profiles"]) == len(NOMBRES)
    ok = _latido(cliente, "PLAYER 1", 1, equipo_epoca=r1["epoca"], equipo_rev=r1["rev"]).json()["team"]
    assert not ok["completo"]
    otra = _latido(cliente, "PLAYER 1", 2, equipo_epoca="otra-pi", equipo_rev=r1["rev"]).json()["team"]
    assert otra["completo"] and len(otra["profiles"]) == len(NOMBRES)
    futura = _latido(cliente, "PLAYER 1", 3, equipo_epoca=r1["epoca"], equipo_rev=10 ** 9).json()["team"]
    assert futura["completo"]


def test_un_movil_viejo_sigue_recibiendo_la_tabla_entera_con_is_self(cliente):
    team = _latido(cliente, "PLAYER 1", 0).json()["team"]
    assert "epoca" not in team and "rev" not in team
    assert len(team["profiles"]) == len(NOMBRES)
    assert [p["user"] for p in team["profiles"] if p["is_self"]] == ["PLAYER 1"]
    assert all(isinstance(p["is_self"], bool) for p in team["profiles"])


def test_los_perfiles_por_diferencias_no_llevan_is_self(cliente):
    team = _latido(cliente, "PLAYER 1", 0, equipo_epoca="", equipo_rev=0).json()["team"]
    assert all("is_self" not in p for p in team["profiles"])


def test_bytes_antes_y_despues_con_30_perfiles(cliente):
    """Medida (gzip) con 30 perfiles: la mayoría sin conexión, y con todos moviéndose. Se escribe en la salida."""
    nombres = ["P%02d" % i for i in range(30)]
    cliente.estado["perfiles"] = [
        {"id": n, "display_name": "Jugador %s %d" % (n, i * 7919 % 1000), "color": "#%06x" % (i * 2654435 % 0xFFFFFF)}
        for i, n in enumerate(nombres)
    ]
    # Los que no están conectados dieron su última posición hace una hora (como en producción).
    import time as _t
    for i, n in enumerate(nombres[4:]):
        main.upsert_live_position_for_user(
            n, {"lat": 40.3 + i * 1.7e-3, "lon": -3.7 + i * 1.3e-3, "accuracy": 7, "gps_status": "ok", "source": "player",
                "last_seen": int(_t.time()) - 3600 - i * 11, "pos_at": int(_t.time()) - 3600 - i * 11}
        )

    def gz(obj):
        return len(gzip.compress(json.dumps(obj, separators=(",", ":")).encode()))

    # 4 conectados de 30: los demás nunca dieron señal.
    for i, n in enumerate(["P00", "P01", "P02", "P03"]):
        _latido(cliente, n, i)
    r = _latido(cliente, "P00", 5, equipo_epoca="", equipo_rev=0).json()["team"]
    completa = gz(construir_tabla_de_equipo("P00"))
    epoca, rev = r["epoca"], r["rev"]
    sizes = []
    for ronda in range(1, 6):
        for i, n in enumerate(["P01", "P02", "P03"]):
            _latido(cliente, n, ronda * 10 + i)
        t = _latido(cliente, "P00", ronda * 10 + 5, equipo_epoca=epoca, equipo_rev=rev).json()["team"]
        epoca, rev = t["epoca"], t["rev"]
        sizes.append(gz(t))
    print("\nDELTA 30 perfiles, 4 conectados: completa %d B gzip; diferencias %s B" % (completa, sizes))
    assert max(sizes) < completa * 0.5

    # Los 30 moviéndose: nadie se libra, así que casi no hay ahorro (y no debe ser peor).
    for n in ["P%02d" % i for i in range(30)]:
        _latido(cliente, n, 99)
    t = _latido(cliente, "P00", 100, equipo_epoca=epoca, equipo_rev=rev).json()["team"]
    print("DELTA 30 perfiles, todos moviéndose: completa %d B; diferencias %d B" % (gz(construir_tabla_de_equipo("P00")), gz(t)))
    assert gz(t) <= gz(construir_tabla_de_equipo("P00")) * 1.05


def test_el_movil_manda_epoca_y_revision_y_olvida_la_copia_si_no_cuadra():
    ts = open(os.path.join(RAIZ, "frontend", "src", "player", "hooks", "useLatidoYCola.ts"), encoding="utf-8").read()
    assert "equipo_epoca: equipoRef.current?.epoca" in ts and "equipo_rev: equipoRef.current?.rev" in ts
    assert "fusionarEquipo(equipoRef.current, equipo)" in ts and "equipoRef.current = nuevo" in ts


def test_las_comprobaciones_periodicas_estan_espaciadas_y_no_corren_a_ciegas():
    """25/10: fotos de campo cada 2 min, el tiempo cada 20 y la versión cada 15; ninguna con la app oculta o sin cobertura."""
    src = os.path.join(RAIZ, "frontend", "src")

    def leer(*ruta):
        return open(os.path.join(src, *ruta), encoding="utf-8").read()

    fotos = leer("player", "hooks", "useFotosDeCampo.ts")
    assert "window.setInterval(cargar, 120000)" in fotos and "sinCoberturaAhora()" in fotos
    assert "addEventListener('visibilitychange', alVolver)" in fotos
    tiempo = leer("player", "components", "TiempoDelJuego.tsx")
    assert "const CADA_MS = 20 * 60_000" in tiempo and "sinCoberturaAhora()" in tiempo
    assert "document.visibilityState !== 'visible'" in tiempo
    version = leer("shared", "BuildInfoBadge.tsx")
    assert "15 * 60 * 1000" in version and "document.visibilityState !== 'visible'" in version
    assert "document.visibilityState === 'visible') void leer()" in leer("player", "components", "AvisosDeDatos.tsx")
    latido = leer("player", "hooks", "useLatidoYCola.ts")
    assert "(conexionAhorradora() ? 20 : 10) * 60_000" in latido
    # Sin cobertura el refresco pesado queda PENDIENTE (no se borra la marca) y sale en el primer ciclo con red.
    assert latido.index("sinCoberturaAhora()) return") < latido.index("heavyRefreshDueRef.current = false")
    # Y lo que avisa de un reinicio del panel o de un cambio de misión sigue entrando por el latido.
    assert "heavyRefreshDueRef.current = true" in latido
