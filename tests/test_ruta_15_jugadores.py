# -*- coding: utf-8 -*-
"""Quince jugadores a la vez por la ruta entera, con la red y el servidor fallando (auditoría 24/11).

El arnés: cada `Movil` imita lo que hace el móvil de verdad (enviarCodigo.ts, la cola de missionPack.ts y el latido)
contra la aplicación entera por TestClient, quince en hilos a la vez. Cada uno con su avería:

  buena            cobertura buena todo el rato
  eco              la respuesta del avance se pierde y el móvil reenvía lo mismo (el servidor ya lo tenía)
  sin_cobertura    tres nodos en modo avión; al volver sube la cola, la tanda desordenada y repetida
  a_saltos         la red va y viene: nodo sí, nodo no
  cloudflare       un 502 de Cloudflare entre medias: lo que no llegó se reintenta
  dos_moviles      el mismo jugador con dos teléfonos, uno detrás del otro
  bolsillo         la cola sube con la pantalla apagada (sin latido), y al final se mira

Y averías de todo el servidor entre fases:
  reinicio         se pierde lo que vive en memoria (límites, llegadas anotadas)
  salto de VIP     la Pi de respaldo coge la .201 con la réplica de hace 5 min: los avances de la última fase NO están.
                   El móvil los repone desde sus recibos (`reponerRecibos` en missionPack.ts) y nadie se queda atrás.

Al final, de cada jugador: nivel = nodos de la ruta, terminado, un tiempo por nodo y ni un 500.

Para lanzarlo solo: `python -m pytest -q tests/test_ruta_15_jugadores.py`. `SAGA_RUTA_SEMILLA=n` cambia el azar.
"""
import io
import json
import os
import random
import shutil
import sqlite3
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-ruta-15-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

CODIGOS = ["OK", "SAGA_QR_1", "OK", "OK", "OK", "OK"]
NODOS = len(CODIGOS)
AVERIAS = ["buena", "eco", "sin_cobertura", "a_saltos", "cloudflare", "dos_moviles", "bolsillo"]
JUGADORES = [f"J{i:02d}" for i in range(1, 16)]


def _iso(ms_atras=0):
    return (datetime.now(timezone.utc) - timedelta(milliseconds=ms_atras)).isoformat().replace("+00:00", "Z")


class Movil:
    """Lo que hace un teléfono, sin React: avance en línea o a la cola, recibos, subida de la cola y latido."""

    def __init__(self, user, averia, rnd, recibos=None):
        self.user = user
        self.averia = averia
        self.rnd = rnd
        self.http = TestClient(main.app)
        self.nivel = 0
        self.cola = []
        # Compartidos entre los dos teléfonos del mismo jugador NO: cada uno guarda los suyos (localStorage).
        self.recibos = recibos if recibos is not None else []
        self.repuestos = set()
        self.quinientos = []
        self.sin_red = False
        respuesta = self.http.get(f"/api/game/{self.user}")
        assert respuesta.status_code == 200, respuesta.text

    # -- red ---------------------------------------------------------------------------------------------------------
    def _post(self, ruta, cuerpo):
        if self.sin_red:
            return None
        if self.averia == "cloudflare" and self.rnd.random() < 0.25:
            return None  # 502 del túnel: no llegó a la Pi
        respuesta = self.http.post(ruta, json=cuerpo)
        if respuesta.status_code >= 500:
            self.quinientos.append((ruta, respuesta.status_code, respuesta.text[:200]))
            return None
        if respuesta.status_code == 429:
            return None
        assert respuesta.status_code == 200, (ruta, respuesta.status_code, respuesta.text)
        return respuesta.json()

    # -- recibos (missionPack.ts: guardarRecibo / reponerRecibos) ----------------------------------------------------
    def _guardar_recibo(self, evento):
        self.recibos.append(evento)

    def reponer_recibos(self, nivel_servidor):
        en_cola = {e["client_event_id"] for e in self.cola}
        n = 0
        for recibo in self.recibos:
            if recibo["payload"]["level_before"] < nivel_servidor or recibo["client_event_id"] in self.repuestos:
                continue
            if recibo["client_event_id"] in en_cola:
                continue
            self.repuestos.add(recibo["client_event_id"])
            self.cola.append(json.loads(json.dumps(recibo)))
            n += 1
        return n

    # -- cola --------------------------------------------------------------------------------------------------------
    def subir(self, desordenar=False, repetir=False):
        if not self.cola:
            return
        tanda = list(self.cola)
        if desordenar:
            self.rnd.shuffle(tanda)
        cuerpo = self._post("/api/events/sync", {"user": self.user, "events": tanda, "client_sent_at_ms": int(datetime.now().timestamp() * 1000)})
        if repetir and cuerpo is not None:
            # La respuesta de la primera se perdió: se manda la misma tanda otra vez.
            cuerpo = self._post("/api/events/sync", {"user": self.user, "events": tanda})
        if cuerpo is None:
            return
        por_id = {e.get("client_event_id"): e for e in cuerpo.get("events", [])}
        quedan = []
        detras = []
        for evento in self.cola:
            r = por_id.get(evento["client_event_id"]) or {}
            estado = r.get("status")
            if estado in ("synced", "ignored"):
                # También un duplicado «synced»: se aplicó en una subida cuya respuesta se perdió.
                if estado == "synced" and evento["type"] == "node_completed":
                    self._guardar_recibo(evento)
                continue
            if r.get("error") == "behind":
                detras.append(r.get("server_level"))
            if r.get("error") in ("invalid_completion_code", "missing_required_item", "after_rejected_node"):
                raise AssertionError(f"{self.user}: rechazo definitivo {r}")
            quedan.append(evento)
        self.cola = quedan
        niveles = [n for n in detras if isinstance(n, int)]
        if niveles:
            self.reponer_recibos(min(niveles))

    def _encolar(self, codigo, tiempo_ms):
        evento = {
            "client_event_id": f"{self.user}:node_completed:{uuid.uuid4().hex[:10]}",
            "type": "node_completed",
            "source": "offline_queue",
            "node_id": str(101 + self.nivel),
            "payload": {
                "code": codigo,
                "manual": False,
                "level_before": self.nivel,
                "level_after": self.nivel + 1,
                "time_spent_ms": tiempo_ms,
                "penalty_ms": 0,
                "local_created_at": _iso(),
                "evidence": {"v": 1, "via": "qr" if codigo != "OK" else "juego"},
            },
        }
        self.cola.append(evento)
        self.nivel += 1

    # -- un nodo (enviarCodigo.ts) -----------------------------------------------------------------------------------
    def completar(self):
        codigo = CODIGOS[self.nivel]
        tiempo_ms = self.rnd.randint(5_000, 60_000)
        if self.sin_red or any(e["type"] == "node_completed" for e in self.cola):
            self._encolar(codigo, tiempo_ms)
            self.subir()
            return
        cuerpo = {
            "user": self.user,
            "code": codigo,
            "time_spent_ms": tiempo_ms,
            "penalty_ms": 0,
            "manual": False,
            "level_before": self.nivel,
            "evidence": {"v": 1, "via": "qr" if codigo != "OK" else "juego"},
        }
        r = self._post("/api/advance", cuerpo)
        if self.averia == "eco" and r is not None:
            r = self._post("/api/advance", cuerpo)  # la primera respuesta no llegó
            assert r is None or r.get("duplicate") or r.get("status") == "behind", (self.user, r)
        if r is not None and r.get("status") == "behind":
            self.reponer_recibos(int(r["server_level"]))
            self.subir()
            r = self._post("/api/advance", cuerpo)
        if r is None or r.get("status") == "behind":
            self._encolar(codigo, tiempo_ms)
            return
        assert r["status"] == "ok", (self.user, r)
        self._guardar_recibo(
            {
                "client_event_id": f"recibo:{self.user}:{self.nivel}:{uuid.uuid4().hex[:8]}",
                "type": "node_completed",
                "source": "recibo",
                "node_id": str(101 + self.nivel),
                "payload": {**{k: cuerpo[k] for k in ("code", "manual", "time_spent_ms", "penalty_ms", "evidence")},
                            "level_before": self.nivel, "level_after": self.nivel + 1, "local_created_at": _iso()},
            }
        )
        self.nivel = max(self.nivel + 1, int(r.get("level") or 0))

    def latido(self):
        r = self._post("/api/heartbeat", {"user": self.user, "lat": 40.5, "lon": -3.5, "accuracy": 10, "gps_status": "ok"})
        if not r:
            return
        nivel = int((r.get("live_status") or {}).get("level") or 0)
        if nivel < self.nivel and self.reponer_recibos(nivel):
            self.subir()
        elif nivel > self.nivel and not self.cola:
            self.nivel = nivel  # el otro teléfono ya avanzó


def _jugar(moviles, desde, hasta):
    """Un jugador (uno o dos teléfonos) completa los nodos [desde, hasta)."""
    principal = moviles[0]
    for nodo in range(desde, hasta):
        averia = principal.averia
        principal.sin_red = (averia == "sin_cobertura" and 1 <= nodo <= 3) or (averia == "a_saltos" and nodo % 2 == 1)
        movil = moviles[nodo % len(moviles)]
        if movil is not principal:
            movil.latido()  # se entera de dónde va el jugador
            if movil.nivel <= nodo - 1:
                movil.nivel = principal.nivel
        if movil.nivel > nodo:
            continue
        movil.completar()
        if movil is not principal:
            principal.latido()
        if averia != "bolsillo":
            principal.latido()
    principal.sin_red = False
    for movil in moviles:
        movil.subir(desordenar=principal.averia == "sin_cobertura", repetir=principal.averia == "sin_cobertura")
        movil.subir()


def _foto(dirs):
    """La réplica de la .104 a la .103: los JSON copiados y SQLite con `.backup` (como replicar_saga_a_respaldo.sh)."""
    foto = {}
    for carpeta in dirs:
        for ruta in Path(carpeta).glob("*"):
            if ruta.suffix == ".json":
                foto[ruta] = ruta.read_bytes()
            elif ruta.suffix in (".sqlite3", ".db"):
                memoria = sqlite3.connect(":memory:")
                with sqlite3.connect(ruta) as origen:
                    origen.backup(memoria)
                foto[ruta] = memoria
    return foto


def _restaurar(foto):
    for ruta, contenido in foto.items():
        if isinstance(contenido, bytes):
            ruta.write_bytes(contenido)
        else:
            with sqlite3.connect(ruta) as destino:
                contenido.backup(destino)
    _reinicio()


def _reinicio():
    """Arranca otro proceso: lo que vivía sólo en memoria se pierde."""
    main.clear_player_rate_limits()
    getattr(main, "_LLEGADAS_ANOTADAS", {}).clear()


@pytest.fixture
def ruta(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    original = main.load_config
    monkeypatch.setattr(main, "load_config", lambda: {**original(), "players": list(JUGADORES)})
    for jugador in JUGADORES:
        main.set_player_progress_level(jugador, 0)
    # Que el límite de peticiones no sea quien decida: en la ruta de verdad pasan minutos entre nodo y nodo.
    monkeypatch.setattr(main, "ADVANCE_RATE_LIMIT_MAX", 10_000)
    monkeypatch.setattr(main, "EVENT_SYNC_RATE_LIMIT_MAX", 10_000)
    monkeypatch.setattr(main, "HEARTBEAT_MIN_INTERVAL_SECONDS", 0)
    return [str(tmp_path), os.environ["SAGA_DATA_DIR"]]


def test_quince_jugadores_con_averias_y_salto_de_vip_acaban_todos(ruta):
    semilla = int(os.environ.get("SAGA_RUTA_SEMILLA", "24112026"))
    rnd = random.Random(semilla)
    grupo = {}
    for i, jugador in enumerate(JUGADORES):
        averia = AVERIAS[i % len(AVERIAS)]
        propios = random.Random(rnd.random())
        moviles = [Movil(jugador, averia, propios)]
        if averia == "dos_moviles":
            moviles.append(Movil(jugador, averia, propios))
        grupo[jugador] = moviles

    def fase(desde, hasta):
        with ThreadPoolExecutor(max_workers=len(grupo)) as hilos:
            list(hilos.map(lambda m: _jugar(m, desde, hasta), grupo.values()))

    fase(0, 2)
    _reinicio()
    replica = _foto(ruta)  # la última réplica antes del salto (cron cada 5 min)
    fase(2, 4)
    niveles_antes = {j: main.get_player_progress_level(j, 0) for j in JUGADORES}
    assert all(n == 4 for n in niveles_antes.values()), json.dumps({j: [n, grupo[j][0].averia, grupo[j][0].nivel, [e["payload"]["level_before"] for e in grupo[j][0].cola]] for j, n in niveles_antes.items()})
    _restaurar(replica)  # se cae la .104: la .103 sirve con la réplica de antes
    assert all(main.get_player_progress_level(j, 0) == 2 for j in JUGADORES), "la réplica no se restauró"
    fase(4, NODOS)
    # Un rato después: un latido más de cada teléfono (el que acabó en la titular justo antes del salto).
    for _ciclo in range(6):  # el ciclo de 30 s del móvil, unas cuantas vueltas
        for moviles in grupo.values():
            for movil in moviles:
                movil.latido()
                movil.subir()

    timers = main.load_player_timers()
    fallos = {}
    for jugador, moviles in grupo.items():
        problemas = []
        nivel = main.get_player_progress_level(jugador, 0)
        if nivel != NODOS:
            problemas.append(f"nivel {nivel}/{NODOS}")
        entrada = timers.get(jugador) or {}
        if not entrada.get("finished_at"):
            problemas.append("sin hora de fin")
        nodos = sorted((entrada.get("nodos") or {}).keys())
        if len(nodos) != NODOS:
            problemas.append(f"tiempos de nodo {nodos}")
        for movil in moviles:
            if movil.quinientos:
                problemas.append(f"500: {movil.quinientos[:2]}")
            if any(e["type"] == "node_completed" for e in movil.cola):
                problemas.append(f"cola atascada: {[e['payload']['level_before'] for e in movil.cola]}")
        if problemas:
            fallos[f"{jugador} ({moviles[0].averia})"] = problemas
    assert not fallos, json.dumps(fallos, ensure_ascii=False, indent=1)


def test_sin_recibos_el_salto_de_vip_deja_al_jugador_atras(ruta):
    """La prueba de que el arnés ve el fallo: sin reponer los recibos, el que avanzó en la titular se queda atascado."""
    movil = Movil("J01", "buena", random.Random(1))
    movil.reponer_recibos = lambda nivel: 0
    _jugar([movil], 0, 2)
    replica = _foto(ruta)
    _jugar([movil], 2, 4)
    _restaurar(replica)
    _jugar([movil], 4, NODOS)
    assert main.get_player_progress_level("J01", 0) == 2
    assert [e["payload"]["level_before"] for e in movil.cola] == [4, 5], "los dos últimos nodos, atascados en la cola"
