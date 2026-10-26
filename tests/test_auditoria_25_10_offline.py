# -*- coding: utf-8 -*-
"""Auditoría 25/10 (sin red, versión nueva, ahorro, clasificación): lo que no puede volver atrás, leído del código."""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
F = RAIZ / "frontend"


def leer(*p):
    return (F.joinpath(*p)).read_text(encoding="utf-8")


def test_el_sw_no_guarda_un_html_sin_sus_paquetes():
    sw = leer("public", "sw.js")
    nav = sw[sw.index("async function navigationNetworkFirst("):]
    assert nav.index("paquetesQueFaltan(html)") < nav.index("await putCache(request, response)")
    assert "onupgradeneeded = () => peticion.transaction.abort()" in sw
    assert "fetchWithTimeout(request, 15000)" in sw[sw.index("async function cacheFirst("):]


def test_las_paginas_se_bajan_las_ultimas():
    pwa = leer("src", "player", "offline", "pwaShell.ts")
    assert "!paginas.has(r) || !faltaAlgoNoPagina()" in pwa


def test_partida_ligera_no_se_guarda_como_paquete():
    ms = leer("src", "player", "offline", "missionSync.ts")
    assert "soloEstado: !mismosNodos" in ms
    for f in (("src", "player", "hooks", "useLatidoYCola.ts"), ("src", "player", "PlayerApp.tsx")):
        assert "partida.soloEstado" in leer(*f) and "saveLocalProgressSnapshot(reconciliado)" in leer(*f)


def test_no_se_cambia_de_version_en_mitad_de_la_ruta():
    vg = leer("src", "shared", "versionGuard.ts")
    assert vg.index("if (malMomentoParaActualizar()) return") < vg.index("await prepararVersionNueva()")
    assert "/player-precache.json" in vg
    rs = leer("src", "player", "offline", "recargaSegura.ts")
    assert "if (malMomentoParaActualizar()) return false" in rs and "conexionAhorradora()" in rs
    assert "registrarEnRuta(" in leer("src", "player", "PlayerApp.tsx")


def test_la_partida_ligera_pide_las_fotos_por_url():
    ms = leer("src", "player", "offline", "missionSync.ts")
    assert "(await pedirPartidaLigera(user, guardado))" in ms
    assert "fetchPlayerGame(user, { fotosPorUrl: true })" in ms
    cc = leer("src", "player", "offline", "cargaCompleta.ts")
    assert "fetchPlayerGame(user)" not in cc and "pedirPartidaLigera(user, guardado)" in cc


def test_latido_sin_red_y_refresco_solo_si_el_servidor_va_delante():
    lt = leer("src", "player", "hooks", "useLatidoYCola.ts")
    assert "latidosSinRed % 4 !== 0" in lt
    assert "nivelServidor > nivelPintado" in lt and "diferencia !== ultimaDiferencia" in lt
    assert "await syncPendingOfflineEvents(user)" not in lt


def test_clasificacion_igual_que_el_servidor():
    cl = leer("src", "player", "components", "clasificacion.ts")
    assert ".localeCompare(" not in cl
    assert "return ordenarClasificacion(players)" in cl
    app = leer("src", "player", "PlayerApp.tsx")
    assert "? yoEnElEquipo.total_time_ms" in app and "finConfirmado=" in app
