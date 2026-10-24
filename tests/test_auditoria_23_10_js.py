# -*- coding: utf-8 -*-
"""Auditoría del 23/10/2026, app del jugador.

Se EJECUTA la lógica TS (tests/js/auditoria_23_10.cjs) para:
- La pantalla de error: «Limpiar caché» sólo borra el armazón y no desregistra el service worker; sin red no se
  ofrece (sólo «Recargar», explicando que hace falta cobertura); la pila sólo con ?debug=1.
- IndexedDB: una apertura que no contesta se corta, se reintenta una vez y suelta el candado de la cola.

Y sobre el código fuente lo que vive dentro de componentes:
- Ningún oyente se añade sobre un objeto y se quita de otro (se acumulaba con cada reto).
- Fronteras locales alrededor del mapa, del minijuego y de las hojas diferidas.
- El pulso del mapa no late sin parar; el reloj de la pegatina no re-pinta PlayerApp.

Sin Node o sin frontend/node_modules, lo que se ejecuta se salta.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src"
ARNES = RAIZ / "tests" / "js" / "auditoria_23_10.cjs"


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    proceso = subprocess.run(
        [node, str(ARNES)], capture_output=True, text=True, encoding="utf-8", timeout=240, cwd=str(RAIZ)
    )
    assert proceso.returncode == 0, proceso.stderr[-3000:]
    datos = json.loads(proceso.stdout)
    errores = {k: v["__error"] for k, v in datos.items() if isinstance(v, dict) and "__error" in v}
    assert not errores, errores
    return datos


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8")


# 1 -----------------------------------------------------------------------------------------------------------------


def test_limpiar_cache_solo_borra_el_armazon(js):
    r = js["pantallaDeError"]
    assert sorted(r["quedan"]) == ["saga-fotos", "saga-route-tile-coverage-1"], "teselas y fotos se quedan"
    assert r["desregistros"] == 0, "el service worker es quien sirve la app sin red: no se desregistra"


def test_sin_red_solo_se_ofrece_recargar(js):
    r = js["pantallaDeError"]
    assert r["conRedOfreceLimpiar"] is True
    assert r["puedeSinRed"] is False
    assert r["sinRedOfreceLimpiar"] is False and r["sinRedOfreceRecargar"] is True
    assert r["sinRedExplicaCobertura"] is True


def test_la_pila_no_la_ve_el_jugador(js):
    r = js["pantallaDeError"]
    assert r["pilaSinDebug"] is False and r["pilaConDebug"] is True
    assert "return true\n}" not in leer("shared/ErrorBoundary.tsx").split("mostrarDetallesTecnicos")[1][:200]


# 2 -----------------------------------------------------------------------------------------------------------------


def test_fronteras_locales_en_mapa_minijuego_y_hojas():
    app = leer("player/PlayerApp.tsx")
    assert re.search(r'<FronteraLocal\s+zona="mapa"[\s\S]{0,900}<BrujulaSinMapa[\s\S]{0,900}<MapSurfaceGL', app)
    hoja = leer("player/components/InteractionSheet.tsx")
    assert re.search(r'<FronteraLocal[\s\S]{0,200}zona="minijuego"[\s\S]{0,800}<FamilyRuntimeHost', hoja)
    assert "t.hoja.juegoRoto" in hoja
    diferidos = leer("player/components/panelesDiferidos.tsx")
    assert re.search(r'<FronteraLocal\s+zona="hoja"', diferidos)
    frontera = leer("shared/FronteraLocal.tsx")
    assert "reportarError(" in frontera and "getDerivedStateFromError" in frontera
    assert "this.setState({ fallo: false })" in frontera, "la frontera se puede reiniciar"


# 3 -----------------------------------------------------------------------------------------------------------------

OYENTE = re.compile(r"([\w.$\]\[?()]+?)\??\.(add|remove)EventListener\(\s*([^,]+?)\s*,\s*([\w.$]+)")


def test_cada_oyente_se_quita_del_mismo_objeto_en_que_se_puso():
    malos = []
    for fichero in sorted(SRC.rglob("*.ts*")):
        texto = fichero.read_text(encoding="utf-8")
        puestos, quitados = {}, {}
        for m in OYENTE.finditer(texto):
            destino = puestos if m.group(2) == "add" else quitados
            linea = texto.count("\n", 0, m.start()) + 1
            destino.setdefault((m.group(3), m.group(4)), []).append((m.group(1), linea))
        for clave, lista in quitados.items():
            objetos = {o for o, _ in puestos.get(clave, [])}
            if not objetos:
                continue
            for objeto, linea in lista:
                if objeto not in objetos:
                    malos.append(f"{fichero.relative_to(SRC)}:{linea} {clave} se quita de {objeto}, se puso en {objetos}")
    assert not malos, malos
    # El ciclo de refresco salió de PlayerApp a hooks/useLatidoYCola.ts.
    app = leer("player/hooks/useLatidoYCola.ts")
    assert "document.removeEventListener('visibilitychange', refresh)" in app


# 4 -----------------------------------------------------------------------------------------------------------------


def test_el_pulso_late_solo_un_rato_y_luego_no_repinta():
    mapa = leer("player/components/MapSurfaceGL.tsx")
    assert "const LATIDO_TRAS_CAMBIO_MS = 10_000" in mapa
    assert "performance.now() > pulsoHastaRef.current" in mapa
    assert "prefiereMenosMovimiento(" in mapa.split("const intensidad")[1][:600]
    # En reposo el valor ya está puesto y no se vuelve a tocar el estilo.
    assert "if (vivo.getPaintProperty(capa, propiedad) !== valor) vivo.setPaintProperty(" in mapa
    latir = mapa[mapa.index("const latir = () => {") :][:3500]
    assert "Math.sin" not in latir and "vivo.setPaintProperty(CAPA_RUTA_PULSO" not in latir
    # Se despierta con un toque, al volver al mapa y al cambiar de nodo.
    assert mapa.count("despertarPulso()") >= 2
    assert re.search(r"pulsoHastaRef\.current = performance\.now\(\) \+ LATIDO_TRAS_CAMBIO_MS\s*\}, \[currentLevel\]", mapa)


# 5 -----------------------------------------------------------------------------------------------------------------


def test_el_reloj_de_la_pegatina_no_repinta_playerapp():
    app = leer("player/PlayerApp.tsx")
    assert "qrMs" not in app and "setQrMs" not in app
    assert "<QrScanClock user={user} payload={qrPayloadActual} />" in app
    reloj = leer("player/components/QrScanClock.tsx")
    assert "window.setInterval(() => setMs(tempoDoQr(user, payload)), 500)" in reloj


# 6 -----------------------------------------------------------------------------------------------------------------


def test_una_apertura_que_no_contesta_se_corta_y_suelta_el_candado(js):
    r = js["aperturaColgada"]
    assert r["primera"] == "fallo", "colgada para siempre: tiene que acabar (fallando), no quedarse esperando"
    assert r["aperturasPrimera"] >= 2, "se reintenta una vez"
    assert r["segunda"] == "fallo" and r["aperturasSegunda"] > r["aperturasPrimera"], "el candado quedó suelto"


def test_el_reintento_salva_la_escritura(js):
    r = js["aperturaColgada"]
    assert r["reintento"] == "ok" and r["enCola"] == 1
    assert r["atiendeVersionchange"] is True
    pack = leer("player/offline/missionPack.ts")
    assert "request.onblocked" in pack and "db.onversionchange" in pack
    assert "abrirBaseConLimite('SagaOfflinePhotos', 1" in leer("player/offline/localFirst.ts")
