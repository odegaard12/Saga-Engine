# -*- coding: utf-8 -*-
"""La pantalla de carga baja TODO lo que hace falta para jugar sin cobertura, y nada más.

Regla del dueño: «la pantalla de carga era la idea siempre: bajar todo offline en
ella, no de fondo mientras se jugaba». Antes:

* al entrar sólo se bajaba el MAPA, y sólo si no estaba al 98 % (una ruta cambiada
  no se notaba);
* la aplicación (minijuegos, mapa, paneles) se bajaba en SEGUNDO PLANO, al instalarse
  el service worker y en cada arranque, sin pantalla;
* «Prepararse» bajaba la misión y la app pero no el mapa, y hacía retroceder a quien
  había jugado sin cobertura.

Ahora hay UNA comprobación al entrar (app, misión y mapa frente a lo último
publicado) y una pantalla con una barra por parte que baja solo lo que cambió. Con
todo al día se entra sin pantalla. Y nada baja de fondo mientras se juega.

Estas pruebas EJECUTAN los módulos TypeScript de verdad (tests/js/carga_completa.cjs
los transpila con el `typescript` de frontend/node_modules y los corre contra un
navegador y un servidor de mentira): comprueban qué se pide a la red, qué queda en
la caché y qué le pasa al jugador, no que el código «mencione» algo. Si no hay Node
o no están instaladas las dependencias del frontend, se saltan, no fallan.
"""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"
ARNES = RAIZ / "tests" / "js" / "carga_completa.cjs"

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None or not (FRONT / "node_modules" / "typescript").exists(),
    reason="hace falta Node y las dependencias del frontend (cd frontend && npm ci)",
)


def _ejecutar() -> dict:
    proceso = subprocess.run(
        ["node", str(ARNES)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=300,
        cwd=RAIZ,
    )
    assert proceso.returncode == 0, proceso.stderr[-3000:]
    datos = json.loads(proceso.stdout)
    for nombre, valor in datos.items():
        assert not (isinstance(valor, dict) and "__error" in valor), f"{nombre}: {valor['__error']}"
    return datos


@pytest.fixture(scope="session")
def r(tmp_path_factory):
    """Los resultados de todos los escenarios: se calculan UNA vez, no una por worker.

    Con pytest-xdist cada worker tendría su propia sesión y ejecutaría Node por su
    cuenta; se comparte el resultado entre ellos con un candado, y solo dentro de la
    MISMA ejecución (`PYTEST_XDIST_TESTRUNUID`): un resultado de otra ejecución
    sería de otro código.
    """
    ejecucion = os.environ.get("PYTEST_XDIST_TESTRUNUID")
    if not ejecucion:
        return _ejecutar()

    try:
        from filelock import FileLock
    except ImportError:  # pragma: no cover
        return _ejecutar()

    compartido = tmp_path_factory.getbasetemp().parent
    with FileLock(str(compartido / f"carga_completa_{ejecucion}.lock")):
        fichero = compartido / f"carga_completa_{ejecucion}.json"
        if fichero.exists():
            return json.loads(fichero.read_text(encoding="utf-8"))
        datos = _ejecutar()
        fichero.write_text(json.dumps(datos), encoding="utf-8")
        return datos


def _fuente(*partes: str) -> str:
    return (FRONT.joinpath(*partes)).read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# 1. UNA comprobación al entrar, parte por parte
# ---------------------------------------------------------------------------


def test_la_primera_vez_se_baja_todo_con_pantalla_de_carga(r):
    v = r["cargaEntera"]["primeraVez"]

    assert v["cobertura"] is True
    assert v["pantalla"] is True, "hay que bajar cosas: la pantalla de carga tiene que verse"
    assert v["estados"] == {"app": "listo", "mision": "listo", "mapa": "listo"}
    assert v["motivos"] == {"app": "primera_vez", "mision": "primera_vez", "mapa": "primera_vez"}
    assert v["faltan"] == []

    # Lo que se bajó de verdad: paquetes de la app, la misión entera, teselas en lote y la red de caminos.
    assert v["archivosDeApp"] == 3
    assert v["paquetes"] == 1
    assert v["lotes"] > 0
    assert v["fotosDeCampo"] > 0

    # Y lo que quedó guardado: misión con su revisión y la foto del mosaico DENTRO, mapa completo con la firma de la ruta.
    assert v["paqueteGuardado"] == {
        "revision": "R1",
        "nodos": 2,
        "conFotoDentro": True,
        "tieneConfigRecibidaEn": True,
    }
    assert v["mapa"]["completo"] is True
    assert v["mapa"]["faltan"] == 0
    assert v["mapa"]["grafo"] == "ok"
    assert v["mapa"]["conFirmaDeRuta"] is True


def test_si_no_cambio_nada_se_entra_sin_pantalla_y_sin_bajar_nada(r):
    """Nada cambió → entrar en 1-2 s, sin pantalla y sin una sola descarga."""
    v = r["cargaEntera"]["sinCambios"]

    assert v["huboPantalla"] is False
    assert v["pantalla"] is False
    assert v["estados"] == {"app": "al_dia", "mision": "al_dia", "mapa": "al_dia"}
    assert v["archivosDeApp"] == 0
    assert v["teselas"] == 0
    assert v["lotes"] == 0
    assert v["paquetes"] == 0
    assert v["grafoBajado"] == 0
    assert v["fotosDeCampo"] == 0
    # Sólo lo mínimo para comprobar: la partida ligera, la configuración y la lista de paquetes.
    assert v["peticionesTotales"] <= 4


def test_una_mision_cambiada_baja_solo_la_mision(r):
    """`mission_revision` distinta → la parte Misión; ni la app ni el mapa se tocan."""
    v = r["cargaEntera"]["misionCambiada"]

    assert v["estados"] == {"app": "al_dia", "mision": "listo", "mapa": "al_dia"}
    assert v["motivos"]["mision"] == "mision_cambiada"
    assert v["pantalla"] is True
    assert v["paquetes"] == 1
    assert v["archivosDeApp"] == 0
    assert v["teselas"] == 0 and v["lotes"] == 0
    assert v["revisionGuardada"] == "R2"


def test_un_nodo_movido_rehace_el_mapa_pero_solo_pide_las_teselas_nuevas(r):
    """La firma del mapa incluye las coordenadas de los nodos (J7)."""
    v = r["cargaEntera"]["nodoMovido"]

    assert v["motivos"]["mapa"] == "ruta_cambiada"
    assert v["firmaDeRutaCambio"] is True
    assert v["estados"]["mapa"] == "listo"
    assert v["pantalla"] is True
    # No se vuelve a pedir la app, y del mapa sólo lo que no estaba: muy por debajo del paquete entero.
    assert v["archivosDeApp"] == 0
    assert 0 < v["lotes"] < 15
    assert v["pedidasAhora"] > r["cargaEntera"]["totalDeTeselas"]
    assert v["completo"] is True
    # Y la red de caminos se vuelve a bajar: la ruta es otra.
    assert v["grafoVueltoABajar"] >= 1


def test_un_nodo_nuevo_tambien_rehace_el_mapa(r):
    v = r["cargaEntera"]["nodoAnadido"]

    assert v["motivos"]["mapa"] == "ruta_cambiada"
    assert v["mapaBajado"] is True
    assert v["nodosGuardados"] == 3
    assert v["faltan"] == []


def test_una_app_nueva_baja_solo_el_paquete_nuevo(r):
    v = r["cargaEntera"]["appNueva"]

    assert v["motivos"]["app"] == "version_nueva"
    assert v["archivosBajados"] == ["/assets/Nuevo-zzz.js"]
    assert v["estados"] == {"app": "listo", "mision": "al_dia", "mapa": "al_dia"}
    assert v["teselas"] == 0 and v["paquetes"] == 0


def test_si_el_navegador_vacia_las_teselas_se_rehace_el_mapa(r):
    """iOS borra la caché sin avisar: el resumen dice «todo guardado» y no es verdad."""
    v = r["cargaEntera"]["cacheVaciada"]

    assert v["motivos"]["mapa"] == "incompleto"
    assert v["lotes"] > 0
    assert v["completo"] is True
    assert v["archivosDeApp"] == 0


def test_sin_cobertura_se_entra_con_lo_guardado_y_se_dice_que_le_pasa(r):
    """Sin red: directo con lo guardado, sin bajar nada, avisando de QUÉ está viejo o incompleto."""
    v = r["cargaEntera"]["sinCobertura"]

    assert v["cobertura"] is False
    assert v["hayPayload"] is True
    assert v["pantalla"] is False
    assert v["peticionesAlServidorConDatos"] == 0
    assert v["loGuardado"]["paqueteViejo"] is True
    assert v["loGuardado"]["edadDias"] == 4
    assert v["loGuardado"]["todoEnOrden"] is False


def test_sin_cobertura_y_sin_nada_guardado_no_hay_con_que_entrar(r):
    assert r["cargaEntera"]["sinNadaDeNada"]["lanzaError"] is True


def test_el_aviso_de_sin_cobertura_dice_que_falta(r):
    ev = r["revisiones"]["loGuardado"]
    assert ev["reciente"]["todoEnOrden"] is True
    assert ev["viejo"]["paqueteViejo"] and ev["viejo"]["edadDias"] == 4
    assert ev["faltanArchivos"]["archivosDeAppQueFaltan"] == 3
    assert ev["mapaIncompleto"]["mapaIncompleto"] is True
    assert ev["paqueteLigero"]["paqueteIncompleto"] is True
    assert ev["sinPaquete"]["sinPaquete"] is True

    frases = r["avisos"]
    assert len(frases["frasesEs"]) == 4 and len(frases["frasesGl"]) == 4
    assert any("hace 4 días" in f for f in frases["frasesEs"])
    assert any("3 archivos" in f for f in frases["frasesEs"])
    assert frases["frasesTodoBien"] == []


# ---------------------------------------------------------------------------
# 2. Cómo se decide cada parte
# ---------------------------------------------------------------------------


def test_la_mision_se_compara_por_revision_y_si_no_hay_por_huella(r):
    m = r["revisiones"]["mision"]

    assert m["sinPaquete"]["estado"] == "falta"
    assert m["igual"]["estado"] == "ok"
    assert m["otraRevision"]["estado"] == "cambio"
    # Un paquete guardado antes de las revisiones se baja una vez.
    assert m["sinRevisionGuardada"]["estado"] == "cambio"
    # Servidor sin `mission_revision`: la huella de los nodos, como siempre.
    assert m["servidorSinRevisionMismaHuella"]["estado"] == "ok"
    assert m["servidorSinRevisionOtraHuella"]["estado"] == "cambio"
    # Sin ninguna de las dos no se puede saber: nunca quedarse con nodos viejos en silencio.
    assert m["servidorSinNingunaHuella"]["estado"] == "cambio"
    # La revisión también puede venir en /api/config.
    assert m["revisionDeLaConfig"]["estado"] == "ok"
    assert m["otroNumeroDeNodos"]["estado"] == "cambio"


def test_un_paquete_ligero_o_sin_su_foto_no_cuenta_como_completo(r):
    m = r["revisiones"]["mision"]

    assert m["paqueteLigero"]["estado"] == "incompleto"
    assert m["faltaLaFoto"]["estado"] == "incompleto"
    assert m["conLaFoto"]["estado"] == "ok"


def test_la_firma_de_la_ruta_cambia_con_un_nodo_movido_o_nuevo_y_no_con_el_ruido(r):
    f = r["revisiones"]["firmas"]

    assert f["base"] == f["igual"] == f["ruidoDeComa"]
    assert f["movido10m"] != f["base"]
    assert f["anadido"] != f["base"]


def test_el_mapa_por_resumen(r):
    m = r["revisiones"]["mapa"]

    assert m["sinResumen"] == {"estado": "falta", "motivo": "primera_vez"}
    assert m["igual"]["estado"] == "ok"
    assert m["otraRuta"] == {"estado": "cambio", "motivo": "ruta_cambiada"}
    # Un resumen anterior a la firma de ruta no vale: no se sabe con qué ruta se hizo.
    assert m["sinFirmaDeRuta"]["motivo"] == "ruta_cambiada"
    assert m["incompleto"]["motivo"] == "incompleto"


def test_la_muestra_de_teselas_reparte_y_siempre_incluye_el_detalle_de_los_nodos(r):
    t = r["revisiones"]["teselas"]
    assert t["n"] == 24 and t["incluyeLaUltima"] and t["incluyeLaPrimera"]
    assert t["pocas"] == 2


# ---------------------------------------------------------------------------
# 3. El motor: qué baja, en qué orden y qué pasa si falla
# ---------------------------------------------------------------------------


def test_el_motor_no_baja_lo_que_esta_al_dia(r):
    m = r["motor"]

    assert m["nadaPendiente"] == {"hayQueBajar": False, "todoListo": True}
    assert m["descargasSinNada"] == 0
    assert m["soloLaApp"]["inicios"] == ["inicio:app"]
    assert m["soloLaApp"]["estados"] == {"app": "listo", "mision": "al_dia", "mapa": "al_dia"}
    assert m["soloLaApp"]["progresoDeLaApp"] == {"hecho": 2, "total": 2}


def test_el_mapa_espera_a_la_mision_y_la_app_no_espera_a_nadie(r):
    """Si la ruta cambió, el mapa necesita los nodos nuevos para saber qué teselas pedir."""
    o = r["motor"]["ordenMisionMapa"]
    assert o["finMision_antes_de_inicioMapa"] is True
    assert o["appNoEspera"] is True


def test_un_fallo_se_ve_como_fallo_y_reintentar_solo_reabre_lo_fallido(r):
    f = r["motor"]["fallo"]

    assert f["estado"] == "error" and f["error"] == "fallo de mapa"
    assert f["algunaFallo"] is True
    assert f["sinCompletar"] == ["mapa"]
    assert f["reabierta"] == "pendiente"
    assert f["alDiaNoSeToca"] == "al_dia"


def test_una_comprobacion_rota_no_da_la_parte_por_buena(r):
    c = r["motor"]["comprobacionRota"]
    assert c == {"estado": "pendiente", "hayQueBajar": True}


def test_entrar_igualmente_no_espera_a_una_descarga_larga(r):
    assert r["motor"]["cancelar"]["esperoMenosDe200ms"] is True


def test_el_porcentaje_solo_existe_si_se_sabe_cuanto_queda(r):
    p = r["motor"]["porcentaje"]
    assert p == {"sinTotal": None, "mitad": 50, "alDia": 100}


def test_la_lista_final_solo_es_todo_bien_si_de_verdad_lo_esta(r):
    lista = r["motor"]["lista"]

    assert lista["todoBien"] == ["app:true", "mision:true", "mapa:true", "permisos:true", "espacio:true"]
    assert lista["completa"] is True
    assert "permisos:null" in lista["faltaElMicro"], "falta el micrófono: los permisos no están ✓"
    assert "espacio:false" in lista["espacioAviso"]
    assert lista["incompletaConFallo"] is False
    assert lista["sinPartes"][:3] == ["app:null", "mision:null", "mapa:null"]


# ---------------------------------------------------------------------------
# 4. Fallos al bajar: no se entra a medias (o se entra igualmente, avisando)
# ---------------------------------------------------------------------------


def test_entrar_igualmente_deja_pasar_y_dice_que_falta(r):
    v = r["fallosAlBajar"]["entrarIgualmente"]

    assert v["entroIgualmente"] is True
    assert v["faltan"] == ["mapa"]
    assert v["appListo"] == "listo" and v["misionLista"] == "listo"
    assert v["hayPayload"] is True


def test_reintentar_completa_solo_lo_que_fallo(r):
    v = r["fallosAlBajar"]["reintentar"]

    assert v["entroIgualmente"] is False
    assert v["faltan"] == []
    assert v["mapa"] == "listo"
    assert v["appNoSeRepitio"] == 1


def test_sin_espacio_no_se_dice_listo(r):
    """J6: los fallos de cuota se tragaban y el panel decía «listo»."""
    v = r["fallosAlBajar"]["sinEspacio"]
    assert v["sinEspacioEnApp"] is True
    assert v["appEstado"] == "error"
    assert set(v["faltan"]) == {"app", "mision", "mapa"}

    p = r["fallosAlBajar"]["paqueteSinEspacio"]
    assert p["misionEstado"] == "error" and p["misionSinEspacio"] is True

    g = r["guardarPaquete"]["sinEspacio"]
    assert g["lanza"] is True and g["error"]["nombre"] == "QuotaExceededError"


def test_el_almacenamiento_reconoce_la_cuota_y_pide_persistir(r):
    a = r["almacenamiento"]
    assert a["cuota"]["nombre"] and a["cuota"]["firefox"] and a["cuota"]["codigo22"] and a["cuota"]["mensaje"]
    assert not a["cuota"]["otro"] and not a["cuota"]["nulo"]
    assert a["espacio"] == {"justo": "justo", "sobra": "ok", "desconocido": "desconocido"}
    assert a["formato"]["mb"] == "143 MB" and a["formato"]["gb"] == "2,1 GB"

    p = r["persistencia"]
    assert p["concedido"] == "persistente" and p["llamadas"] == ["persist"]
    assert p["estado"]["usoBytes"] == 200 * 1024 * 1024
    assert p["denegado"] == "no_concedido"
    assert p["sinSoporte"] == "no_soportado"

    e = r["espacioDeLaLista"]
    assert e["protegido"] == "ok" and e["sinPedir"] == "pendiente"
    assert e["noConcedido"] == "aviso" and e["poco"] == "aviso" and e["fallosDeCuota"] == "aviso"
    assert e["noSoportadoConSitio"] == "ok"


# ---------------------------------------------------------------------------
# 5. «Prepararse»: la misma comprobación, respetando la cola (J9)
# ---------------------------------------------------------------------------


def test_prepararse_baja_la_mision_y_no_hace_retroceder_con_nodos_sin_subir(r):
    """J9: el jugador tenía dos nodos hechos sin cobertura; bajar la misión no los deshace."""
    v = r["preparacionConCola"]["conColaPendiente"]

    assert v["nivelServidor"] == 0
    assert v["nivelDevuelto"] == 2
    assert v["nivelGuardado"] == 2, "el paquete guardado tampoco retrocede"
    assert v["pendientes"] == 2, "la cola sigue intacta"
    assert v["misionBajada"] is True
    assert v["faltan"] == []
    assert v["seMostroPorPartes"] is True, "la misma pantalla de carga, con una barra por parte"


def test_con_la_cola_vacia_manda_el_servidor_al_abrir_pero_no_en_plena_partida(r):
    p = r["preparacionConCola"]
    assert p["colaVacia_enJuego"] == {"nivelDevuelto": 2, "pendientes": 0}
    assert p["colaVacia_alArrancar"]["nivelDevuelto"] == 1


def test_las_reglas_del_nivel(r):
    n = r["revisiones"]["niveles"]

    assert n["conColaPendienteManda_elMovil"] == 4
    assert n["respuestaVieja_noBaja"] == 4
    assert n["reseteo_baja"] == 0
    assert n["sube"] == 3
    assert n["reconc_colaPendiente"] == {"base": 4, "permitirBajar": False}
    assert n["reconc_colaYSinPantalla"] == {"base": 3, "permitirBajar": False}
    assert n["reconc_arranqueSinCola"] == {"base": None, "permitirBajar": True}
    assert n["reconc_enJuegoSinCola"] == {"base": 4, "permitirBajar": False}
    assert n["reconc_reseteo"] == {"base": None, "permitirBajar": True}


def test_prepararse_sin_red_no_inventa_nada(r):
    v = r["preparacionSinRed"]
    assert v["cobertura"] is False and v["payload"] is None


# ---------------------------------------------------------------------------
# 6. Lo que YA NO baja de fondo
# ---------------------------------------------------------------------------


def test_el_service_worker_se_instala_sin_bajar_paquetes(r):
    sw = r["serviceWorker"]["instalacion"]

    assert sw["listaDePaquetes"] is False
    assert sw["assets"] is False
    assert sw["cacheDelShell"] is True
    assert sw["saltaAlControl"] == 1
    assert r["serviceWorker"]["mensajeDeBajarShell"] == {"peticionesTrasElMensaje": 0}


def test_las_fotos_de_campo_solo_se_bajan_en_la_carga_y_saltandose_las_que_ya_estan(r):
    """J11: cacheFieldProofAssets se llamaba cada 15 s y re-bajaba todas."""
    f = r["fotosDeCampo"]

    assert f["primera"] == {"total": 4, "nuevas": 4, "peticiones": 4}
    assert f["segunda"] == {"total": 4, "nuevas": 0, "peticiones": 0}
    assert f["tercera"] == {"nuevas": 2, "peticiones": 2}
    assert f["sinEspacio"]["sinEspacio"] is True
    assert f["hookSinDescargas"] is True, "el ciclo de 15 s de useFotosDeCampo no debe bajar fotos"


def test_no_se_bajan_los_catorce_perfiles_del_login_sino_los_de_este_movil(r):
    """J14: warmOfflineProfiles bajaba todos los perfiles en cada carga del login."""
    o = r["otrosJugadores"]

    assert o["nadieMasBajado"] is True
    assert o["perfilesEnElMovil"] == ["OTRO", "TEST"]
    # Al entrar NO se toca a OTRO (esa espera dejaba la barra parada al 75 %); sólo «Prepararse» lo refresca.
    assert o["peticionesDeJuego"] == ["TEST:ligero", "TEST:pesado"]
    assert o["laSesionAcabaSiendoDeQuienJuega"] is True
    assert o["otroSinTocarEnLaEntrada"] == "R0"
    assert o["preparacionRefrescaAOtro"] == "R1"
    assert o["preparacionPidioPesadoDeOtro"] is True
    # Un perfil que no responde nunca no cuelga la carga.
    assert o["otroColgado"] == {"entrada": "termino", "preparacion": "termino"}
    # Sin cambios no se le toca; en «Prepararse» se le mira pero no se le baja el paquete si está al día.
    assert o["sinCambios_noPideAOtro"] is True
    assert o["preparacion"] == {
        "revisaAOtro": True,
        "noBajaSuPaquete": True,
        "laSesionVuelveAQuienJuega": True,
    }


def test_el_codigo_ya_no_baja_nada_de_fondo():
    """Lo que sólo se puede comprobar leyendo: no queda ningún camino de descarga en juego."""
    app = _fuente("src", "player", "PlayerApp.tsx")
    login = _fuente("src", "login", "LoginApp.tsx")
    sw = _fuente("public", "sw.js")
    pwa = _fuente("src", "player", "offline", "pwaShell.ts")

    # PlayerApp: la carga la hace cargarTodo; ya no hay repaso del mapa "por detrás" ni cachePlayerShell.
    assert "cachePlayerShell" not in app
    assert "guardarMapa(false)" not in app
    assert "void guardarMapa" not in app
    assert "cargarTodo(" in app
    # La única llamada a prefetchMissionMapTiles que queda es «Volver a bajar el mapa», a mano, con pantalla.
    assert app.count("prefetchMissionMapTiles(") == 1
    assert "handleRedownloadMap" in app

    # Login: ya no calienta perfiles ni baja la app.
    assert "warmOfflineProfiles(" not in login
    assert "cachePlayerShell" not in login
    assert "cacheFieldProofAssets" not in login

    # Service worker: nada de precarga ni de bajar a petición.
    assert "precargarPaquetesDelJugador" not in sw
    assert "data.type !== 'SAGA_CACHE_PLAYER_SHELL'" not in sw
    assert "cacheUrls" not in sw

    assert "export async function cachePlayerShell" not in pwa


# ---------------------------------------------------------------------------
# 7. J7: teselas buenas y huecos que se reintentan
# ---------------------------------------------------------------------------


def test_una_respuesta_de_tesela_tiene_que_ser_un_exito_con_imagen(r):
    v = r["teselas"]["validacion"]
    assert v["ok"] is True and v["binario"] is True
    assert v["error502"] is False and v["html"] is False and v["sinTipo"] is False and v["vacia"] is False
    assert v["json"] is False, "un JSON de error no es una tesela"


def test_una_tesela_con_error_no_se_guarda_como_buena_y_el_hueco_se_rellena(r):
    t = r["teselas"]

    con_fallos = t["conFallos"]
    assert con_fallos["guardadas502"] == 0, "un 502 quedaba como tesela permanente"
    assert con_fallos["completo"] is False
    assert con_fallos["faltan"] == 100

    rellenado = t["huecosRellenados"]
    assert rellenado["completo"] is True and rellenado["faltan"] == 0
    assert rellenado["solicitadasEnLote"] == 100, "solo se piden los huecos"
    assert rellenado["guardadasAhora"] == t["plan"]["n"]


def test_las_teselas_que_el_origen_no_tiene_no_dejan_el_mapa_incompleto_para_siempre(r):
    v = r["teselas"]["inexistentes"]
    assert v["completo"] is True
    assert v["inexistentes"] == 50
    assert v["segundaVuelta_peticionesDeTeselas"] == 0


def test_sin_lote_se_baja_de_una_en_una(r):
    v = r["teselas"]["sinLote"]
    assert v["completo"] is True and v["guardadas"] == v["pedidas"]


def test_sin_espacio_el_mapa_no_se_da_por_listo(r):
    v = r["teselas"]["sinEspacio"]
    assert v == {"completo": False, "sinEspacio": True, "faltan": True}


def test_sin_red_de_caminos_en_el_servidor_no_es_un_fallo_y_la_que_hay_se_guarda_sola(r):
    assert r["teselas"]["sinGrafo"] == {"completo": True, "grafo": "no_disponible"}
    assert r["teselas"]["grafoGuardado"]["presente"] is True


def test_el_service_worker_no_guarda_teselas_malas(r):
    t = r["serviceWorker"]["teselas"]

    assert t["malaDevuelve"] == 502 and t["malaGuardada"] is False
    assert t["buenaDevuelve"] == 200 and t["buenaGuardada"] is True
    assert t["relieveGuardado"] is True
    assert t["htmlDevuelve"] == 200 and t["htmlGuardado"] is False
    assert t["segundaVezSinRed"] is True

    g = r["serviceWorker"]["grafo"]
    assert g["noHayDevuelve"] == 404 and g["noHayGuardado"] == 0 and g["buenoGuardado"] is True


def test_la_app_solo_guarda_lo_que_es_lo_que_dice_su_nombre(r):
    a = r["app"]

    assert a["tipos"]["js"] and a["tipos"]["css"] and a["tipos"]["pagina"] and a["tipos"]["manifiesto"]
    # El tipo exacto varía según el servidor: lo único que no puede ser es una página.
    assert a["tipos"]["jsTextoPlano"] and a["tipos"]["jsTextJavascript"]
    assert not a["tipos"]["jsPorHtml"] and not a["tipos"]["cssPorHtml"] and not a["tipos"]["fuentePorHtml"]

    malo = a["paqueteMalo"]
    assert malo["completo"] is False
    assert malo["faltan"] == ["/assets/MapSurfaceGL-bbb.js"]
    assert malo["guardado"] is False, "un HTML servido como JS quedaba guardado como paquete"
    assert malo["progresoMonotono"] is True

    assert a["arreglado"]["completo"] is True
    assert a["arreglado"]["archivosPedidos"] == ["/assets/MapSurfaceGL-bbb.js"], "solo el que faltaba"
    assert a["arreglado"]["conLaListaGuardada"] is True
    assert a["verificar"] == {"completo": True, "guardados": 6, "total": 6, "archivosPedidos": 0}
    assert a["sinEspacio"] == {"completo": False, "sinEspacio": True}


# ---------------------------------------------------------------------------
# 8. J8: la configuración de respaldo no pisa a la buena
# ---------------------------------------------------------------------------


def test_la_configuracion_de_respaldo_no_pisa_a_la_buena(r):
    c = r["configuracion"]

    assert c["configCaida"]["configFresca"] is False
    assert c["configCaida"]["temaConservado"] == "flame-red"
    assert c["configCaida"]["guardadaConservaElTema"] == "flame-red"
    assert c["configCaida"]["guardadaConservaElTexto"] == "Una ruta a pie con pruebas."
    assert c["configCaida"]["esLaDeRespaldo"] is False
    assert c["guardarRespaldo"] == {"tema": "flame-red", "revisionConservada": "R1"}

    # Sin nada bueno en ningún sitio se usa el respaldo para pintar, pero NO se guarda.
    assert c["sinNadaBueno"] == {"usaRespaldo": True, "seGuardoElRespaldo": False}

    cfg = r["revisiones"]["config"]
    assert cfg["respaldoEsRespaldo"] and cfg["vaciaEsRespaldo"] and cfg["nullEsRespaldo"]
    assert cfg["buenaNoEsRespaldo"] is False
    assert cfg["respaldoNoPisaLaBuena"] and cfg["laBuenaGana"] and cfg["sinNadaBueno"]


def test_guardar_el_paquete_conserva_la_revision_y_empareja_la_hora_con_su_configuracion(r):
    g = r["guardarPaquete"]

    assert g["primero"] == {"revision": "R7", "recibida": 5555}
    assert g["soloNivel"] == {"revision": "R7", "nivel": 2, "recibida": 5555}
    assert g["conRespaldo"] == {"tema": "flame-red", "recibida": 5555}
    # Otra configuración sin decir cuándo llegó: no se inventa la hora (la de guardar no es la de recibir).
    assert g["otraConfigSinHora"] == {"recibida": None}


# ---------------------------------------------------------------------------
# 9. J1: la cortina de inicio no se queda con una hora caducada
# ---------------------------------------------------------------------------


def test_un_paquete_de_hace_tres_dias_no_atrasa_la_cuenta_atras(r):
    """A las 12:05 de una salida a las 12:00 la cortina seguía diciendo «2d 23h»."""
    v = r["reloj"]

    assert v["faltabaAntes"] == 3 * 24 * 3600 * 1000, "así fallaba: la cuenta iba tres días atrasada"
    assert v["tresDiasDespues"]["fuente"] == "movil", "un dato caducado se sustituye por el reloj del móvil"
    assert v["faltaAhora"] <= 0, "ya son las 12:05: tiene que abrir"


def test_una_hora_fresca_se_mide_con_su_instante_de_recepcion_no_con_el_de_pintar(r):
    v = r["reloj"]

    assert v["fresca1min"]["fuente"] == "servidor"
    assert v["fresca1min"]["ms"] == v["fresca1min"]["esperado"]
    # Móvil 2 minutos por detrás del servidor: la cuenta va con el servidor.
    assert v["conElMovilDesviado"] == {"fuente": "servidor", "adelantoSobreElMovil": 120000}
    # Si el móvil cambió de hora desde que llegó el dato, no se fía de él.
    assert v["movilQueRetrocede"] == "movil"
    assert v["sinMuestra"] == "movil"


def test_una_hora_mas_fresca_sustituye_a_la_anterior_y_una_vieja_no_la_pisa(r):
    reg = r["reloj"]["registro"]
    assert reg["primera"] == 1_800_000_100_000
    assert reg["mas_nueva_sustituye"] == 1_800_000_200_000
    assert reg["mas_vieja_no_pisa"] == 1_800_000_200_000
    assert reg["guardada"] == 1_800_000_200_000
    assert r["reloj"]["horaInvalida"] is True


def test_la_cortina_lee_el_reloj_en_cada_tick_y_no_calcula_el_desfase_una_vez():
    fuente = _fuente("src", "player", "components", "MissionLockScreen.tsx")
    cuerpo = fuente[fuente.index("export function MissionLockScreen("):]

    assert "offsetRef" not in fuente, "el desfase se calculaba una sola vez, con la hora de pintar"
    assert "horaDelServidorAhora(leerMuestraDeReloj(), ahora)" in cuerpo
    assert "registrarHoraDelServidor" in cuerpo
    assert "serverTimeRecibidoEnMs" in fuente
    # Los textos ya no son sólo gallego.
    assert "TEXTOS.es" in fuente and "TEXTOS.gl" in fuente


def test_mission_not_started_yet_no_se_pinta_como_codigo_incorrecto(r):
    v = r["avisos"]["mission_not_started_yet"]

    assert v["esCodigoIncorrecto"] is False
    assert "todavía no ha empezado" in v["error"]
    assert r["avisos"]["codigoMalo"]["error"].startswith("Código incorrecto")
    assert "objeto" in r["avisos"]["objeto"]["error"]


# ---------------------------------------------------------------------------
# 10. J3: nodos no aceptados, visibles; mochila forjada, subida entera
# ---------------------------------------------------------------------------


def test_un_nodo_que_el_servidor_rechaza_de_forma_definitiva_queda_a_la_vista(r):
    """El móvil quedaba adelantado y al arrancar volvía atrás sin que nadie supiera por qué."""
    c = r["cola"]

    assert c["envio"]["resultado"] == {"attempted": 3, "synced": 2, "failed": 1}
    assert c["envio"]["pendientesDespues"] == 0, "un rechazo definitivo no se reintenta eternamente"
    assert c["rechazos"] == [
        {"nodo": "1", "titulo": "Primero", "motivo": "El organizador cambió el código de «Primero»."}
    ], "el eco `already_advanced` NO cuenta como nodo no aceptado"
    assert c["tras_entendido"] == 0
    # Servidor sin el contrato 6: texto de reserva en castellano.
    assert c["sinMotivoDelServidor"] == [{"nodo": "4", "motivo": "El servidor no vio el objeto que pide este nodo."}]
    assert c["pasajero"] == {"sigueEnCola": True, "noSeEnseña": True}


def test_los_rechazos_solo_valen_mientras_el_nodo_este_por_delante(r):
    a = r["avisos"]
    assert a["vigentes_nivel0"] == ["a", "b", "c"]
    assert a["vigentes_nivel2"] == ["b", "c"], "el jugador ya pasó el nodo 1"
    assert a["vigentes_nivel3"] == ["c"]


def test_el_aviso_de_nodos_no_aceptados_esta_en_pantalla():
    app = _fuente("src", "player", "PlayerApp.tsx")
    aviso = _fuente("src", "player", "components", "AvisosDeDatos.tsx")

    assert "<AvisoDeNodosNoAceptados" in app
    assert "avisa al organizador" in aviso and "avisa ao organizador" in aviso


def test_un_objeto_forjado_y_gastado_sin_cobertura_llega_al_servidor_para_validar_el_nodo(r):
    """Caso B de J3: el nodo consume el objeto; la mochila que subía ya no lo tenía."""
    m = r["mochilaForjada"]

    assert m["enviada"] == {"llevaMochila": True, "selloCantidad": 1, "selloEstado": "collected"}
    assert m["local"] == ["sello:0:used"], "la mochila del móvil sigue gastada; sólo la que ve el servidor se reconstruye"
    assert m["sinGastos"] == ["a:2"]
    assert m["dosNodos"] == ["x:3", "y:1"]


# ---------------------------------------------------------------------------
# 11. Contrato 7: client_sent_at_ms en cada lote
# ---------------------------------------------------------------------------


def test_cada_lote_de_sincronizacion_lleva_la_hora_del_movil(r):
    c = r["cola"]

    assert c["cuerpo"] == {"client_sent_at_ms": 1234, "sinMochila": True}
    assert c["cuerpoConMochila"] == {"tieneMochila": True, "hora": "number"}
    assert c["envio"]["client_sent_at_ms_es_hora_del_movil"] is True
    # También la cola que sube el service worker con la aplicación cerrada.
    assert r["serviceWorker"]["sync"] == {"hayCuerpo": True, "client_sent_at_ms": True, "eventos": 1}


def test_la_mochila_suelta_tambien_lleva_client_sent_at_ms():
    fuente = _fuente("src", "player", "offline", "localFirst.ts")
    assert "cuerpoDeSincronizacion({ user, events: [], mochila: inventorySnapshot })" in fuente


# ---------------------------------------------------------------------------
# 12. Contrato 4: reset_at para el nivel Y para la mochila
# ---------------------------------------------------------------------------


def test_un_reinicio_del_organizador_baja_el_nivel_vacia_la_mochila_y_tira_la_cola(r):
    v = r["reinicio"]

    assert v["marca"] == {"conMarca": 1_800_000_000_000, "sinMarca": 0, "basura": 0, "sinNada": 0}
    assert v["primerReinicio"] == {
        "huboReset": True,
        "mochilaLocal": 0,
        "relojDelNodoLimpio": True,
        "colaPendiente": 0,
    }
    assert v["mismaMarca"]["huboReset"] is False, "la misma marca no es un reinicio nuevo"
    assert v["segundoReinicio"] == {"huboReset": True, "objetos": ["pala"], "colaPendiente": 0}


def test_un_objeto_que_el_organizador_entrega_en_plena_partida_llega_sin_reiniciar(r):
    v = r["reinicio"]["regaloEnPartida"]
    assert v["huboReset"] is False
    assert v["objetos"] == ["pala", "regalo"]


def test_el_refresco_de_fondo_y_el_de_despues_de_un_nodo_aplican_el_mismo_reinicio():
    app = _fuente("src", "player", "PlayerApp.tsx")
    assert app.count("aplicarResetDelServidor(") >= 2, "el refresco de 30 s y refreshPayload"
    assert "aplicarResetDeRelojes" not in app
    assert "hydrateInventoryFromServer" not in app


# ---------------------------------------------------------------------------
# 13. J4 y J13: una versión nueva no deja al jugador sin app ni le corta un juego
# ---------------------------------------------------------------------------


def test_el_vigilante_de_version_no_borra_el_armazon(r):
    v = r["vigilanteDeVersion"]

    assert v["mismaVersion"] == {"peticiones": ["/api/version"], "recargas": 0}

    # La página nueva no llega: no se borra NADA y no se recarga.
    assert v["paginaNoLlega"]["recargas"] == 0
    assert v["paginaNoLlega"]["cachesBorradas"] == []
    assert v["paginaNoLlega"]["cacheIntacta"] == ["/", "/assets/index-vieja.js", "/player-precache.json"]
    assert v["paginaNoLlega"]["guardiaMarcada"] is None, "se reintenta al siguiente arranque"

    # Un paquete de arranque llega como HTML: se aborta y se conserva lo que había.
    assert v["paqueteMalo"]["recargas"] == 0
    assert v["paqueteMalo"]["guardaLaPaginaVieja"] is True
    assert v["paqueteMalo"]["cachesBorradas"] == []
    assert v["paqueteMalo"]["nuevoGuardado"] is False


def test_solo_se_cambia_de_version_con_la_pagina_nueva_y_sus_paquetes_guardados(r):
    v = r["vigilanteDeVersion"]["todoLlega"]

    assert v["cachesBorradas"] == []
    assert v["paginaNueva"] is True
    assert "/assets/index-nuevo.js" in v["contenido"] and "/assets/index-nuevo.css" in v["contenido"]
    assert v["viejaSigueEnCache"] is True, "las dos versiones conviven"
    assert "/player-precache.json" in v["contenido"], "la lista de paquetes no se borra"
    assert v["recargas"] == 1
    assert v["guardiaMarcada"] == "2.0.0"


def test_una_sola_recarga_por_version_y_ninguna_si_no_hay_novedad(r):
    v = r["vigilanteDeVersion"]
    assert v["unaSolaVez"] == {"primera": 1, "despues": 1}
    assert v["sinNovedad"]["recargas"] == 0


def test_no_se_recarga_con_un_minijuego_abierto(r):
    v = r["vigilanteDeVersion"]["esperaAQueSeCierre"]
    assert v == {"conMinijuego": 0, "alCerrar": 1}


def test_las_rutas_de_arranque_de_la_pagina_nueva(r):
    assert r["vigilanteDeVersion"]["rutasDeArranque"] == [
        "/assets/index-Abc123.js",
        "/assets/vendor-react-x.js",
        "/assets/index-q.css",
    ]


def test_un_service_worker_nuevo_no_recarga_en_plena_partida(r):
    """J13: al desplegar, todos los móviles abiertos se recargaban a la vez, a mitad de minijuego."""
    v = r["recargaSegura"]

    assert v["alMomento"] == 1
    assert v["swNuevo"] == {"conLaPantallaPuesta": 0, "alPasarASegundoPlano": 1}
    assert v["conHojaAbierta"] == {"conHoja": 0, "alCerrar": 1}
    assert v["unaVez"] == 1

    pwa = _fuente("src", "player", "offline", "pwaShell.ts")
    cuerpo = pwa[pwa.index("'controllerchange'"):][:1800]
    assert "window.location.reload()" not in cuerpo
    assert "recargarCuandoSeaSeguro({ soloOculta: true })" in cuerpo

    app = _fuente("src", "player", "PlayerApp.tsx")
    assert "registrarQuienPuedeRecargar(" in app
    assert "algoAbiertoRef.current" in app


# ---------------------------------------------------------------------------
# 14. J15: la foto de un avatar cambiada se refresca
# ---------------------------------------------------------------------------


def test_cada_version_de_un_avatar_es_su_entrada_en_la_cache(r):
    a = r["serviceWorker"]["avatares"]

    assert a["mismaVersionVaALaCache"] is True
    assert a["versionNuevaVaALaRed"] is True, "con ignoreSearch la foto cambiada nunca se refrescaba"
    assert a["entradas"] == ["/api/player-avatar/TEST?v=aaa", "/api/player-avatar/TEST?v=bbb"]
    assert r["serviceWorker"]["fotosDeNodo"]["segundaVezSinRed"] is True


# ---------------------------------------------------------------------------
# 15. «Prepararse»: permisos (incluido el micrófono), espacio y guía de instalar
# ---------------------------------------------------------------------------


def test_prepararse_pide_el_microfono_con_la_guarda_anti_trampas():
    hook = _fuente("src", "player", "offline", "usePreparacion.ts")

    assert "getUserMedia({ audio: true })" in hook
    assert hook.index("avisarPeticionDePermisoPropia()") < hook.index("getUserMedia({ audio: true })")
    assert "pedirAlmacenamientoPersistente" in hook and "estadoDelAlmacenamiento" in hook
    assert "estaInstalada()" in hook
    # Se suelta el micrófono en el acto: solo se quería el permiso.
    assert "pista.stop()" in hook


def test_prepararse_es_la_misma_pantalla_que_la_carga_con_los_permisos_debajo():
    app = _fuente("src", "player", "PlayerApp.tsx")

    assert 'modo="preparacion"' in app
    assert "<PantallaDeCarga" in app and "<FieldPrepPanel" in app
    assert "preparacion={{" in app
    # Las cinco cosas de la lista final.
    panel = _fuente("src", "player", "components", "FieldPrepPanel.tsx")
    for clave in ("app:", "mision:", "mapa:", "permisos:", "espacio:"):
        assert clave in panel
    assert "instalarTitulo" in panel and "esIos()" in panel
    # Movimiento primero al pedirlo todo: en iPhone solo vale dentro del toque.
    orden = app[app.index("async function pedirTodosLosPermisos()"):][:700]
    assert orden.index("pedirMovimiento()") < orden.index("pedirCamara()") < orden.index("preparacion.pedirMicrofono()")


def test_la_pantalla_de_carga_tiene_su_boton_de_entrar_igualmente_con_aviso():
    carga = _fuente("src", "player", "components", "PantallaDeCarga.tsx")

    assert "RETRASO_ENTRAR_IGUALMENTE_MS" in carga
    assert "Entrar igualmente" in carga
    assert "no estará listo para jugar sin cobertura" in carga
    # La barra por parte.
    barras = _fuente("src", "player", "components", "ProgresoPorPartes.tsx")
    assert "PARTES.map" in barras
    for parte in ("app: 'App'", "mision: 'Misión'", "mapa: 'Mapa'"):
        assert parte in barras


def test_todas_las_descargas_de_la_carga_tienen_limite_de_tiempo():
    """Con la cobertura del monte una conexión no falla: se cuelga."""
    for fichero in (("offline", "mapTileCache.ts"), ("offline", "pwaShell.ts"), ("offline", "fieldProofCache.ts")):
        assert "fetchConLimite(" in _fuente("src", "player", *fichero), fichero


# ---------------------------------------------------------------------------
# 16. Las pantallas se pintan de verdad (react-dom/server) y dicen lo que deben
# ---------------------------------------------------------------------------


def test_las_tres_barras_se_pintan_con_su_estado_y_su_porcentaje(r):
    v = r["renderizado"]["barras"]

    assert v["tresFilas"] == 3
    assert v["estados"] == ["app:listo", "mision:descargando", "mapa:pendiente"]
    assert all(v["etiquetas"])
    assert v["porcentajeDeLaMision"] and v["detalleMision"] and v["appHecha"]
    assert v["motivoYDetalleMapa"], "el motivo (la ruta cambió) sale junto al detalle"


def test_la_pantalla_de_carga_con_un_fallo_ofrece_reintentar_y_entrar_avisando(r):
    f = r["renderizado"]["pantallaConFallo"]
    assert f == {
        "titulo": True,
        "error": True,
        "reintentar": True,
        "entrarIgualmente": True,
        "avisoDeLoQueFalta": True,
    }

    m = r["renderizado"]["pantallaEnMarcha"]
    assert m["entrarIgualmente"] is False, "recién abierta todavía no se ofrece la salida"
    assert m["porcentaje"] is True and m["titulo"] is True

    assert r["renderizado"]["sinCobertura"] == {"aviso": True, "sinBarras": True}


def test_prepararse_pinta_micro_espacio_guia_ios_y_lista_final(r):
    p = r["renderizado"]["prepararse"]

    assert p["microfono"] and p["espacio"] and p["espacioSinProteger"]
    assert p["guiaIos"], "iPhone sin instalar: la guía de «Añadir a pantalla de inicio»"
    assert p["pedirTodos"]
    assert p["sinFilaDeMision"], "la misión ya está en las barras de arriba"
    assert p["lista"] == ["app", "mision", "mapa", "permisos", "espacio"]
    assert p["appOk"] and p["permisosPendientes"] and p["espacioMal"]
    assert p["sinX"], "dentro de la pantalla de carga sólo hay una salida"

    i = r["renderizado"]["prepararseInstalada"]
    assert i == {"sinGuia": True, "protegido": True, "usoYCuota": True}
    assert r["renderizado"]["prepararseConFallo"] == {"reintentar": True}


def test_la_tarjeta_de_permisos_de_la_entrada_sigue_siendo_la_de_siempre(r):
    t = r["renderizado"]["tarjetaDeEntrada"]
    assert t == {"filaDeMision": True, "sinMicrofono": True, "sinListaFinal": True, "filas": True}


def test_la_cortina_cuenta_con_la_hora_del_servidor_y_no_se_atrasa(r):
    c = r["renderizado"]["cortina"]

    assert c["titulo"] and c["boton"]
    assert c["sinMuestra"] and c["esperaConLaHoraDelMovil"]
    # El servidor 10 minutos por delante: lo tiene en cuenta y no avisa de «hora del móvil».
    assert c["muestraFresca"] == {"cuenta": True, "sinAvisoDeMovil": True}
    # Una hora de hace tres días no atrasa la cuenta atrás: se usa el reloj del móvil, y se dice.
    assert c["muestraVieja"] == {"cuenta": True, "conAvisoDeMovil": True}
    assert c["gallego"] == {"titulo": True, "boton": True}
    assert c["sinFecha"] is True


def test_el_aviso_de_lo_guardado_se_pinta(r):
    a = r["renderizado"]["avisoDeLoGuardado"]
    assert all(a.values()), a
