# -*- coding: utf-8 -*-
"""Banco de carga de SAGA: cuánta gente aguanta, y dónde se ahoga.

Tres modos, y cada uno responde a una pregunta distinta:

    lectura    ¿qué pasa cuando N jugadores abren la aplicación a la vez?
    escritura  ¿qué pasa cuando N mandan latidos y avances a la vez?
    rafaga     ¿qué pasa cuando N recuperan cobertura a la vez y vuelcan su cola?

Ejemplos:

    python scripts/simular-carga.py lectura --jugadores 15 --segundos 30
    python scripts/simular-carga.py escritura --base http://127.0.0.1:8097
    python scripts/simular-carga.py rafaga --avances 6


LO QUE APRENDIMOS MIDIENDO, Y ESTÁ METIDO AQUÍ DENTRO
-----------------------------------------------------

1. **Cloudflare devuelve 403 al agente de urllib.** Sin cabecera `User-Agent`
   de navegador se mide su borde —90 ms, 403— y parece que todo vuela. Por eso
   siempre se manda una.

2. **El ritmo real del latido es 30 s.** Quince jugadores son 0,5 peticiones por
   segundo, y eso no ahoga nada. Un banco que mande 74/s sólo está midiendo el
   limitador (24 avances y 12 sincronizaciones por minuto y jugador). Con
   `--ritmo` se puede pedir el ritmo de verdad en vez de martillear.

3. **`/api/advance` exige pase de jugador**, que se consigue entrando en
   `/player/<nombre>`. Sin cookie todo son 403 y parece que el servidor está
   roto.

4. **El cuello no es la Raspberry.** Medido el 17 de agosto: con 15 jugadores la
   espera pasa de 0,5 s a 5,5 s mientras la Pi está al 0,18 % de CPU. Se mandan
   214 KB por jugador; el límite es el caudal, no el procesador.


⚠️ CONTRA PRODUCCIÓN, SÓLO LECTURAS
-----------------------------------
`/api/heartbeat` lleva lat/lon, así que un banco de escritura **planta
posiciones falsas en el mapa de jugadores reales**. Ya ha pasado dos veces. Los
modos `escritura` y `rafaga` se niegan a correr contra un servidor que no sea
local salvo que se les pase `--sí-sé-lo-que-hago`, y aun así hay que limpiar
después con `main.clear_live_position(<jugador>)`.

Para montar una instancia local con jugadores inventados:

    SAGA_DATA_DIR=/tmp/saga-pruebas SAGA_STORAGE_BACKEND=sqlite \\
      ALLOW_DEFAULT_ADMIN=1 python -m uvicorn main:app --port 8097
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import statistics
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

# Sin esto Cloudflare contesta 403 y se mide su borde, no la aplicación.
AGENTE = (
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120 Mobile Safari/537.36"
)

PUBLICO = "https://sagagia.es"


class Medidas:
    """Latencias y códigos de respuesta, con candado porque hay hilos."""

    def __init__(self) -> None:
        self.tiempos: dict[str, list[float]] = {}
        self.estados: dict[str, dict] = {}
        self.tamanos: list[int] = []
        self._candado = threading.Lock()

    def apunta(self, clase: str, segundos: float, estado, tamano: int = 0) -> None:
        with self._candado:
            self.tiempos.setdefault(clase, []).append(segundos)
            self.estados.setdefault(clase, {})
            self.estados[clase][estado] = self.estados[clase].get(estado, 0) + 1
            if tamano:
                self.tamanos.append(tamano)

    def resumen(self, clase: str) -> str:
        t = sorted(self.tiempos.get(clase, []))
        if not t:
            return f"{clase:<11} sin datos"

        def pct(q: float) -> float:
            return t[min(len(t) - 1, int(len(t) * q))]

        return (
            f"{clase:<11} n={len(t):<5} "
            f"p50={pct(.50) * 1000:7.0f} ms  p95={pct(.95) * 1000:7.0f} ms  "
            f"máx={t[-1] * 1000:7.0f} ms  {self.estados.get(clase, {})}"
        )


def abridor_con_pase(base: str, jugador: str):
    """Un abridor con el pase de jugador ya puesto.

    El pase se consigue entrando en `/player/<nombre>`. Sin él, `/api/advance`
    contesta 403 y parece que el servidor está roto.
    """
    tarro = http.cookiejar.CookieJar()
    abridor = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(tarro))
    abridor.addheaders = [("User-Agent", AGENTE)]
    try:
        abridor.open(f"{base}/player/{urllib.parse.quote(jugador)}", timeout=15).read()
    except Exception:
        pass  # sin pase se verá en los 403, que es información suficiente
    return abridor


def pedir(abridor, url: str, cuerpo: dict | None = None, timeout: int = 30):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    cabeceras = {"Accept": "application/json", "User-Agent": AGENTE}
    if datos is not None:
        cabeceras["Content-Type"] = "application/json"
    peticion = urllib.request.Request(url, data=datos, headers=cabeceras)
    with abridor.open(peticion, timeout=timeout) as respuesta:
        return respuesta.status, respuesta.read()


# --------------------------------------------------------------------- lectura


def modo_lectura(args, jugadores: list[str], medidas: Medidas) -> None:
    """N jugadores pidiendo el paquete completo. La petición cara."""
    parar = threading.Event()

    def trabajador(nombre: str) -> None:
        abridor = urllib.request.build_opener()
        abridor.addheaders = [("User-Agent", AGENTE)]
        while not parar.is_set():
            url = (
                f"{args.base}/api/game/{urllib.parse.quote(nombre)}"
                f"?offline_pack=true&t={time.time()}"
            )
            t0 = time.perf_counter()
            try:
                estado, cuerpo = pedir(abridor, url)
                medidas.apunta("lectura", time.perf_counter() - t0, estado, len(cuerpo))
            except Exception as e:  # noqa: BLE001
                medidas.apunta(
                    "lectura", time.perf_counter() - t0, getattr(e, "code", type(e).__name__)
                )
            if args.ritmo:
                time.sleep(args.ritmo)

    hilos = [threading.Thread(target=trabajador, args=(n,), daemon=True) for n in jugadores]
    for h in hilos:
        h.start()
    time.sleep(args.segundos)
    parar.set()
    for h in hilos:
        h.join(timeout=35)


# ------------------------------------------------------------------- escritura


def modo_escritura(args, jugadores: list[str], medidas: Medidas) -> None:
    """Latidos y avances. Al ritmo real salvo que se pida martillear."""
    parar = threading.Event()

    def trabajador(nombre: str, indice: int) -> None:
        abridor = abridor_con_pase(args.base, nombre)
        vuelta = 0
        while not parar.is_set():
            vuelta += 1
            t0 = time.perf_counter()
            try:
                estado, _ = pedir(
                    abridor,
                    f"{args.base}/api/heartbeat",
                    {"user": nombre, "lat": 42.36 + indice * 1e-4, "lon": -8.67, "accuracy": 12},
                )
                medidas.apunta("latido", time.perf_counter() - t0, estado)
            except Exception as e:  # noqa: BLE001
                medidas.apunta("latido", time.perf_counter() - t0, getattr(e, "code", type(e).__name__))

            if vuelta % 3 == 0:
                t0 = time.perf_counter()
                try:
                    estado, _ = pedir(
                        abridor,
                        f"{args.base}/api/advance",
                        {"user": nombre, "code": "OK", "time_spent_ms": 1000},
                    )
                    medidas.apunta("avance", time.perf_counter() - t0, estado)
                except Exception as e:  # noqa: BLE001
                    medidas.apunta("avance", time.perf_counter() - t0, getattr(e, "code", type(e).__name__))

            if args.ritmo:
                time.sleep(args.ritmo)

    hilos = [
        threading.Thread(target=trabajador, args=(n, i), daemon=True)
        for i, n in enumerate(jugadores)
    ]
    for h in hilos:
        h.start()
    time.sleep(args.segundos)
    parar.set()
    for h in hilos:
        h.join(timeout=35)


# ---------------------------------------------------------------------- ráfaga


def modo_rafaga(args, jugadores: list[str], medidas: Medidas) -> None:
    """Todos vuelcan su cola a la vez, como al salir del monte."""
    barrera = threading.Barrier(len(jugadores))

    def trabajador(nombre: str) -> None:
        abridor = abridor_con_pase(args.base, nombre)
        barrera.wait()  # que suelten todos en el mismo instante
        for _ in range(args.avances):
            t0 = time.perf_counter()
            try:
                estado, _ = pedir(
                    abridor,
                    f"{args.base}/api/advance",
                    {"user": nombre, "code": "OK", "time_spent_ms": 1000},
                )
                medidas.apunta("avance", time.perf_counter() - t0, estado)
            except Exception as e:  # noqa: BLE001
                medidas.apunta("avance", time.perf_counter() - t0, getattr(e, "code", type(e).__name__))

    hilos = [threading.Thread(target=trabajador, args=(n,)) for n in jugadores]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join(timeout=90)


# ------------------------------------------------------------------------ main


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("modo", choices=["lectura", "escritura", "rafaga"])
    p.add_argument("--base", default=PUBLICO, help="servidor contra el que medir")
    p.add_argument("--jugadores", type=int, default=15)
    p.add_argument("--segundos", type=float, default=30.0)
    p.add_argument("--avances", type=int, default=6, help="sólo en modo ráfaga")
    p.add_argument(
        "--ritmo",
        type=float,
        default=0.0,
        help="segundos de espera entre peticiones de cada jugador. El latido real "
        "va cada 30 s; sin esto se martillea y sólo se mide el limitador.",
    )
    p.add_argument("--nombres", default="", help="lista separada por comas")
    p.add_argument(
        "--si-se-lo-que-hago",
        action="store_true",
        help="permite escribir contra un servidor que no sea local",
    )
    args = p.parse_args()

    esLocal = "127.0.0.1" in args.base or "localhost" in args.base
    if args.modo in ("escritura", "rafaga") and not esLocal and not args.si_se_lo_que_hago:
        print(
            "PARADO: los modos de escritura plantan posiciones falsas en el mapa de\n"
            "jugadores reales, y ya ha pasado dos veces. Monta una instancia local\n"
            "con nombres inventados, o pasa --si-se-lo-que-hago y limpia después\n"
            "con main.clear_live_position(<jugador>).",
            file=sys.stderr,
        )
        return 2

    if args.nombres:
        jugadores = [n.strip() for n in args.nombres.split(",") if n.strip()]
    else:
        jugadores = [f"PROBA{i + 1:02d}" for i in range(args.jugadores)]
    jugadores = (jugadores * args.jugadores)[: args.jugadores]

    medidas = Medidas()
    print(f"modo={args.modo}  base={args.base}  jugadores={len(jugadores)}")
    if not args.ritmo and args.modo != "rafaga":
        print("aviso: sin --ritmo se martillea; el latido real va cada 30 s")

    inicio = time.time()
    {"lectura": modo_lectura, "escritura": modo_escritura, "rafaga": modo_rafaga}[args.modo](
        args, jugadores, medidas
    )
    duracion = time.time() - inicio

    total = sum(len(v) for v in medidas.tiempos.values())
    print(f"\nduración {duracion:.1f} s · {total} peticiones · {total / duracion:.1f}/s")
    for clase in medidas.tiempos:
        print("  " + medidas.resumen(clase))
    if medidas.tamanos:
        print(f"  tamaño medio de respuesta: {statistics.mean(medidas.tamanos) / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
