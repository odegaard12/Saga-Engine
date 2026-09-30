# -*- coding: utf-8 -*-
"""El panel de administración no miente al guardar ni pierde trabajo.

Informe de la caza de fallos del 30/09/2026, sección 4 (A1-A18, lado cliente).
Cada prueba lleva el número del hallazgo que impide que vuelva.

Dos tipos de prueba:

* De COMPORTAMIENTO: `tests/js/admin_frontend.cjs` transpila los módulos puros de
  `frontend/src/admin/lib` con el `typescript` de frontend/node_modules y los
  ejecuta contra un servidor simulado (un `fetch` falso que apunta lo que
  recibe). Si no hay Node o faltan las dependencias, se saltan.
* De CABLEADO: el código de los componentes se comprueba por texto, para
  que un botón no vuelva a saltarse la validación o a decir «✓ Guardado» con un
  error. Esto no sustituye a la prueba de navegador, que se hace aparte.

Los contratos con el servidor que se simulan (los implementa el agente de backend):
1. `stages_revision` en la vista y en los nodos; `/api/admin/save` contesta 409
   `stages_changed` si no coincide.
2. `/api/admin/save` con `dry_run: true` contesta `afectados` y no guarda.
3. `/api/admin/save-config` exige `{"config": {...}}` (400 `missing_config`).
4. Bajar el nivel / vaciar la mochila sube `reset_at` para que el móvil lo adopte.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
ADMIN = RAIZ / "frontend" / "src" / "admin"


def leer(*partes: str) -> str:
    return (ADMIN / Path(*partes)).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def js() -> dict:
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node para ejecutar los módulos TS del admin")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")

    resultado = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "admin_frontend.cjs")],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180,
    )
    assert resultado.returncode == 0, resultado.stderr[-2000:]
    return json.loads(resultado.stdout)


# ---------------------------------------------------------------------------
# A1 · el reintento no duplica los nodos nuevos
# ---------------------------------------------------------------------------


def test_a1_si_falla_la_relectura_el_nodo_nuevo_no_se_duplica(js):
    a1 = js["A1"]

    assert a1["primer_resultado"]["kind"] == "error"
    assert a1["primer_resultado"]["postDone"] is True, "el servidor SÍ guardó: hay que saberlo"
    # En cuanto el servidor confirma, el id local pasa a ser el guardado.
    assert a1["ids_remapeados_en_el_panel"] == [0, 1, 2]
    # El segundo Guardar manda los MISMOS tres nodos, no cuatro.
    assert a1["numero_de_nodos_segundo"] == 3
    assert a1["ids_unicos"] is True


def test_a1_el_panel_cambia_los_ids_en_cuanto_el_servidor_confirma():
    app = leer("AdminApp.tsx")
    flujo = leer("lib", "adminSaveFlow.ts")

    assert "onPosted" in flujo and "deps.onPosted?.(persisted)" in flujo
    # Antes de releer o verificar nada.
    assert flujo.index("deps.onPosted?.(persisted)") < flujo.index("deps.fetchStages()", flujo.index("deps.onPosted"))
    assert "localIdMap(" in app and "applyLocalIdMap(" in app


# ---------------------------------------------------------------------------
# A2 · sin lectura de lo guardado no se guarda (nada de payload de respaldo)
# ---------------------------------------------------------------------------


def test_a2_si_no_se_pueden_leer_los_nodos_guardados_no_se_guarda_nada(js):
    a2 = js["A2"]

    assert a2["resultado"]["kind"] == "error"
    assert a2["resultado"]["postDone"] is False
    assert a2["posts"] == 0, "no se puede guardar sin haber leído lo guardado"
    assert "códigos de respaldo" in a2["resultado"]["message"]


def test_a2_ya_no_existe_el_guardado_con_payload_recortado():
    persistencia = leer("lib", "adminStagePersistence.ts")
    app = leer("AdminApp.tsx")

    assert "buildRawStagesFromOverview" not in persistencia
    assert "buildRawStagesFromOverview" not in app
    assert "usedFallback" not in app


# ---------------------------------------------------------------------------
# A3 · saveAdminConfig manda UNA petición con {config} y se relee
# ---------------------------------------------------------------------------


def test_a3_una_sola_peticion_con_config(js):
    a3 = js["A3"]

    assert a3["red_perdida"]["peticiones"] == 1, "una petición perdida no se 'arregla' probando otras formas"
    assert a3["red_perdida"]["claves_del_cuerpo"] == [["config"]]
    assert a3["red_perdida"]["resultado"]["status"] == "fail"
    assert a3["sin_config"]["peticiones"] == 1
    assert "missing_config" in a3["sin_config"]["resultado"]["message"]
    assert list(a3["bien"]["cuerpo"].keys()) == ["config"]


def test_a3_lo_guardado_se_relee_y_se_compara(js):
    v = js["A3"]["verificacion"]

    assert v["todo_igual"] == []
    assert v["nombre_distinto"] == ["site_name"]
    assert v["fecha_no_guardada"] == ["mission_launch_at"]
    assert v["fecha_igual_en_otra_zona"] == [], "la misma hora en otra zona horaria es la misma fecha"
    assert v["jugador_sin_guardar"], "un jugador que el servidor no guardó se detecta"


def test_a3_ya_no_hay_variantes_de_peticion():
    api = leer("lib", "adminApi.ts")

    assert "adminConfigPayloadVariants" not in api
    assert "adminPayloadVariantsResilient" not in api
    assert "{ data: config }" not in api and "{ ...config }" not in api

    app = leer("AdminApp.tsx")
    assert "verifyMissionSettingsSaved(" in app and "verifyPlayersSaved(" in app
    # Los ajustes y los jugadores mandan solo lo suyo, no la configuración entera.
    trozo = app[app.index("function buildPlayerConfigPayload"): app.index("async function runPlayerProfileAction")]
    assert "...base" not in trozo and "players: normalizedDrafts" in trozo


# ---------------------------------------------------------------------------
# A4 · indicadores honestos y todos los botones validan
# ---------------------------------------------------------------------------


def test_a4_la_validacion_de_la_mision_pasa_por_todos_los_botones():
    shell = leer("components", "AdminMissionControlShell.tsx")

    assert "onClick={onSaveStages}" not in shell, "un botón manda la misión sin validarla"
    assert shell.count("onClick={handleSaveStages}") >= 3  # lateral, barra de arriba, móvil
    # El aviso de «cambios sin guardar» también.
    inicio = shell.index('title="⚠️ Cambios sin guardar"')
    aviso = shell[inicio: shell.index("{saveConflict ? (", inicio)]
    assert "handleSaveStages()" in aviso and "onSaveStages()" not in aviso
    # Y la función que valida es la de la librería, no una copia dentro del componente.
    assert "validateStagesBeforeSave(stages)" in shell
    assert "function validateRouteDependencies" not in shell


def test_a4_un_error_de_guardado_no_se_disfraza_de_guardado():
    shell = leer("components", "AdminMissionControlShell.tsx")

    etiqueta = shell[shell.index("const saveLabel"): shell.index("return (", shell.index("const saveLabel"))]
    assert "'⚠️ Error, reintentar'" in etiqueta
    assert etiqueta.count("'✓ Guardado'") == 1
    # El mensaje real se pinta.
    assert "{saveError}" in shell


def test_a4_editar_en_el_cajon_marca_sin_guardar_y_el_navegador_avisa():
    app = leer("AdminApp.tsx")
    shell = leer("components", "AdminMissionControlShell.tsx")

    cuerpo = app[app.index("function syncLocalStage("): app.index("function applyMissionTemplate")]
    assert "markStagesEdited()" in cuerpo, "cambiar algo en el cajón dejaba el botón en «Guardado»"
    assert "if (hasUnsavedWork)" in shell and "beforeunload" in shell


def test_a4_la_validacion_de_requisitos_ve_los_de_config(js):
    a4 = js["A4"]

    assert "ningún nodo de la misión lo entrega" in a4["sin_entrega"]
    assert a4["con_entrega"] is None
    assert a4["requisito_en_config"], "los requisitos de las plantillas viven en config"
    assert a4["requisito_quitado"] is None


# ---------------------------------------------------------------------------
# A5 · los campos del editor se guardan
# ---------------------------------------------------------------------------


def test_a5_el_requisito_y_el_codigo_editados_llegan_al_nodo_guardado(js):
    c = js["A5"]["cambiado"]

    assert c["requisito_leido"] == {
        "item_id": "orbe_fuego",
        "quantity": 2,
        "consume": True,
        "label": "Orbe de Fuego Arcano",
    }
    # `requirements` manda sobre todo lo demás en el servidor: si se dejara, se ignoraría el cambio.
    assert c["tiene_requirements"] is False
    assert c["config_required_item_id"] == "orbe_fuego"
    assert c["minigame_config_required_item_id"] == "orbe_fuego"
    # Un `answer` heredado ganaba a `config.success_code`.
    assert c["answer"] == "NUEVO-1" and c["codigo_leido"] == "NUEVO-1"
    assert c["config_success_code"] == "NUEVO-1"


def test_a5_lo_que_no_se_toca_se_conserva_tal_cual(js):
    s = js["A5"]["sin_tocar"]

    assert s["requirements"]["items"][0]["item_id"] == "llave_maestra"
    assert s["answer"] == "LEGADO"
    assert s["requisito_leido"]["item_id"] == "llave_maestra"


def test_a5_el_resumen_del_servidor_no_puede_cambiar_lo_que_aplica_el_servidor(js):
    """El resumen copia sueltos los campos del nodo (`required_item_id`,
    `fallback_code`...), pero un `requirements` o un `answer` mandan sobre ellos.
    Guardar sin tocar nada no puede reescribirlos con el valor equivocado."""
    r = js["A5"]["resumen_con_valores_sueltos"]

    assert r["requisito_despues"] == r["requisito_antes"]
    assert r["codigo_despues"] == r["codigo_antes"] == "MANDA"
    # Y el editor enseña lo que el servidor aplica, no lo suelto.
    assert r["el_editor_ve"] == {"required_item_id": "manda", "required_item_quantity": 3, "fallback_code": "MANDA"}


def test_a5_solo_se_reescribe_lo_que_el_editor_toco(js):
    a5 = js["A5"]

    assert a5["marcas"]["sin_cambio_de_requisito"] == []
    assert a5["marcas"]["con_cambio_de_requisito"] == ["_edited_requirement"]
    assert a5["marcas"]["pegajosa"] == ["_edited_requirement"]
    # Las marcas son del panel: nunca viajan al servidor.
    assert a5["cambiado"]["lleva_marcas_al_servidor"] == []

    app = leer("AdminApp.tsx")
    cuerpo = app[app.index("function syncLocalStage("): app.index("function applyMissionTemplate")]
    assert "markEditedFields(" in cuerpo


def test_a5_quitar_el_requisito_o_el_codigo_se_puede(js):
    a5 = js["A5"]

    assert a5["quitado"]["requisito_leido"] is None
    assert a5["quitado"]["tiene_requirements"] is False
    assert a5["sin_codigo"] == {"codigo_leido": "", "answer": ""}


def test_a5_cambiar_de_familia_de_juego_no_pierde_el_requisito_ni_el_codigo(js):
    """Al cambiar de familia se descarta la config guardada: lo que solo vivía ahí
    (requisito, código) se reescribe desde lo que enseña el editor."""
    c = js["A5"]["cambio_de_familia"]

    assert c["tipo"] == "signal_hunt"
    assert c["requisito"]["item_id"] == "llave"
    assert c["codigo"] == "CODIGO-4"


def test_a5_el_requisito_de_una_plantilla_se_escribe_donde_lo_lee_el_servidor(js):
    d = js["A5"]["de_config"]

    assert d["requisito_leido"]["item_id"] == "cinta_aislante"
    assert d["config_required_item_id"] == "cinta_aislante"


def test_a5_el_editor_ve_lo_guardado_y_la_verificacion_caza_lo_perdido(js):
    a5 = js["A5"]

    # El código que enseña el editor es el suyo (`config.success_code`); el `answer`
    # heredado sigue en el nodo hasta que el organizador cambie el código.
    assert a5["hidratado"] == {
        "required_item_id": "llave_maestra",
        "requires_item": True,
        "fallback_code": "VIEJO",
    }
    assert a5["verificacion_caza_la_perdida"] == ["requisito de mochila del nodo 1"]


def test_a5_el_codigo_de_emergencia_no_enseña_uno_inventado(js):
    assert js["A5"]["codigo_guardado_o_vacio"] == {"con_codigo": "SAGA-05", "sin_codigo": ""}

    editor = leer("components", "AdminGameEditor.tsx")
    assert "value={fallbackCode(stage)}" not in editor, "enseña un SAGA-NN que no está guardado"
    assert "savedFallbackCode(stage)" in editor

    qr = leer("components", "AdminQrEditor.tsx")
    assert "SAGA-${String(stage.index + 1)" in qr  # solo como sugerencia (placeholder)
    assert "value={savedFallbackCode(stage)}" in qr


def test_a5_el_mensaje_de_exito_inerte_se_ha_quitado():
    editor = leer("components", "AdminGameEditor.tsx")
    colectable = leer("components", "AdminCollectibleEditor.tsx")

    assert "onPatch({ success_message" not in editor
    assert "stage.success_message" not in editor
    assert "target_node_id" not in colectable, "esa línea hacia otro nodo nunca se dibujó"


def test_a5_el_selector_de_requisito_guarda_id_nombre_y_cantidad():
    editor = leer("components", "AdminGameEditor.tsx")

    assert "required_item_label" in editor
    assert "required_item_quantity" in editor
    assert "consume_required_item" in editor


# ---------------------------------------------------------------------------
# A6 · el cajón no devuelve coordenadas viejas
# ---------------------------------------------------------------------------


def test_a6_un_cambio_en_el_cajon_conserva_lo_que_movio_el_mapa(js):
    a6 = js["A6"]
    editado = a6["tras_editar_el_titulo"]

    assert editado["title"] == "Fuente nueva"
    assert (editado["lat"], editado["lon"]) == (42.5, -8.5)
    assert editado["route_via"] == [[42.2, -8.2], [42.3, -8.3]]
    assert editado["route_track"] == [[1, 2], [3, 4]]
    # Lo que la persona teclea manda.
    assert a6["con_coordenadas_tecleadas"]["lat"] == 41
    assert a6["misma_geometria"] is True and a6["distinta_geometria"] is False


def test_a6_el_cajon_y_el_mapa_se_cablean_asi():
    cajon = leer("components", "NodeDetailDrawer.tsx")
    app = leer("AdminApp.tsx")

    assert "applyDraftPatch(" in cajon and "sameGeometry(" in cajon and "withMapGeometry(" in cajon
    assert "draftRef" in cajon and "liveRef" in cajon
    for funcion in ("function moveLocalStage", "function setLegViaLocal", "function setLegTrackLocal"):
        cuerpo = app[app.index(funcion): app.index("\n  }\n", app.index(funcion))]
        assert "patchLocalStage(" in cuerpo and "syncLocalStage(" not in cuerpo, funcion


# ---------------------------------------------------------------------------
# A7 · revisión de la misión y conflicto
# ---------------------------------------------------------------------------


def test_a7_el_guardado_lleva_la_revision_y_un_409_es_un_conflicto(js):
    a7 = js["A7"]

    assert a7["cuerpo_con_revision"] == ["stages", "stages_revision"]
    assert a7["revision_enviada"] == "abc123"
    assert a7["respuesta_409"]["status"] == "conflict"
    assert a7["respuesta_409"]["current_revision"] == "zzz"

    assert a7["flujo_409"]["kind"] == "conflict"
    assert "no se ha guardado nada" in a7["flujo_409"]["message"].lower()
    assert a7["conflicto_visto_al_leer"]["kind"] == "conflict"
    assert a7["conflicto_visto_al_leer"]["posts"] == 0, "si ya se ve que cambió, ni se intenta guardar"
    assert a7["guardado_normal"]["kind"] == "saved"
    assert a7["guardado_normal"]["stagesRevision"] == "r2", "se adopta la revisión nueva"


def test_a7_el_conflicto_ofrece_recargar_y_no_pierde_lo_editado_en_silencio():
    shell = leer("components", "AdminMissionControlShell.tsx")
    app = leer("AdminApp.tsx")

    assert "Recargar la misión" in shell
    assert "Descargar mis cambios" in shell and "Seguir editando" in shell
    # Recargar sin haber descargado pide confirmación.
    assert "conflictCopyDownloaded" in shell
    assert "setSaveConflict(true)" in app


# ---------------------------------------------------------------------------
# A11 · el panel no dice «aplicado» de lo que el móvil aún no tiene
# ---------------------------------------------------------------------------


def test_a11_las_acciones_dicen_que_el_movil_las_aplica_al_conectarse():
    jugadores = leer("components", "PlayersPanel.tsx")
    app = leer("AdminApp.tsx")

    assert "✓ Aplicado" not in jugadores
    assert "próxima conexión" in jugadores
    cuerpo = app[app.index("async function runPlayerProfileAction"): app.index("async function savePlayerProfiles")]
    assert "aplicado." not in cuerpo
    assert "El móvil lo aplicará en su próxima conexión" in cuerpo
    # Cada acción con su propio nombre (vaciar la mochila salía como «marcar como finalizado»).
    assert "vaciar la mochila" in cuerpo and "restaurar el nodo anterior" in cuerpo
    assert "`saved:${action}`" in cuerpo


# ---------------------------------------------------------------------------
# A12 · borrar o reordenar con gente en ruta
# ---------------------------------------------------------------------------


def test_a12_reordenar_con_gente_en_ruta_hace_un_ensayo_y_pide_confirmar(js):
    a12 = js["A12"]

    sin = a12["sin_confirmar"]
    assert sin["kind"] == "cancelled"
    assert sin["llamadas"] == [{"stagesRevision": "r1", "dryRun": True}], "sin confirmar solo se hizo el ensayo"
    assert "Ana" in sin["mensaje"] and "jugador(es)" in sin["mensaje"]

    con = a12["confirmando"]
    assert con["kind"] == "saved"
    assert [bool(x.get("dryRun")) for x in con["llamadas"]] == [True, False]

    assert a12["nadie_afectado"] == {"kind": "saved", "preguntas": 0}
    # Un servidor que no conoce el ensayo guarda de verdad: no se manda dos veces.
    assert a12["servidor_sin_ensayo"]["kind"] == "saved"
    assert len(a12["servidor_sin_ensayo"]["llamadas"]) == 1
    # Sin cambios de orden ni de nodos no hay ensayo.
    assert a12["sin_cambio_de_estructura"]["llamadas"] == [{"stagesRevision": "r1"}]


def test_a12_mover_un_nodo_ya_hecho_pide_confirmacion_explicita(js):
    aviso = js["A12"]["aviso_al_reordenar"]

    assert "Reordenar «Fuente»" in aviso["tres"] and "Ana" in aviso["tres"]
    assert "ha terminado la misión" in aviso["tres"]
    assert aviso["nadie"] == ""
    assert aviso["jugadores_pasados"] == ["ana", "cai"]

    app = leer("AdminApp.tsx")
    for funcion, cambio in (
        ("function deleteLocalStage", "'borrar'"),
        ("function reorderLocalStage", "'reordenar'"),
        ("function insertLocalNodeAt", "'insertar'"),
    ):
        cuerpo = app[app.index(funcion): app.index("\n  }\n", app.index(funcion))]
        assert f"confirmationForStructuralChange(" in cuerpo and cambio in cuerpo, funcion
        assert "window.confirm(aviso)" in cuerpo, funcion


# ---------------------------------------------------------------------------
# A13 · fecha de salida
# ---------------------------------------------------------------------------


def test_a13_una_fecha_futura_con_gente_jugando_pide_confirmar(js):
    a13 = js["A13"]

    assert a13["futura_con_gente"] == ["ana", "bea"]
    assert a13["pasada"] == [] and a13["sin_cambio"] == [] and a13["vacia"] == []

    app = leer("AdminApp.tsx")
    guardar = app[app.index("async function saveMissionSettings"): app.index("function updatePlayerDraft")]
    assert "playersBlockedByNewLaunch(" in guardar
    assert guardar.index("window.confirm") < guardar.index("await saveAdminConfig")


def test_a13_sin_fecha_el_panel_explica_que_no_se_anota_nada():
    ajustes = leer("components", "SettingsPanel.tsx")
    registro = leer("components", "MatchLogPanel.tsx")
    shell = leer("components", "AdminMissionControlShell.tsx")

    assert "rastros GPS" in ajustes and "APAGADOS" in ajustes
    assert "Registro de partida está apagado" in registro
    assert "missionLaunchAt" in shell and "<MatchLogPanel missionLaunchAt={missionLaunchAt} />" in shell


# ---------------------------------------------------------------------------
# A14 · fotos comprimidas
# ---------------------------------------------------------------------------


def test_a14_las_fotos_de_pista_se_comprimen_y_avisan_si_no_caben():
    senales = leer("components", "cuentaSenales", "CuentaSenalesEditor.tsx")
    juego = leer("components", "AdminGameEditor.tsx")
    mosaico = leer("components", "placeMosaic", "PlaceMosaicEditor.tsx")
    lib = leer("lib", "imageCompression.ts")

    for nombre, codigo in (("CuentaSenalesEditor", senales), ("AdminGameEditor", juego)):
        assert "compressImage(" in codigo, nombre
        assert "readAsDataURL" not in codigo, f"{nombre} vuelve a leer la foto sin comprimir"
        assert "describeImageError(" in codigo, f"{nombre} no avisa si la foto no cabe"

    # Mismo tope y misma función que el mosaico (no una copia).
    assert "MAX_IMAGE_LENGTH = 520_000" in lib and "squareImage(" in lib
    assert "compressImage" in mosaico and "squareImage" not in mosaico


# ---------------------------------------------------------------------------
# A15 · sesión: cerrar sesión, 403 sin perder trabajo, login en castellano
# ---------------------------------------------------------------------------


def test_a15_los_errores_de_entrada_salen_en_castellano_con_los_segundos(js):
    a15 = js["A15"]
    m = a15["mensajes"]

    assert m["contrasena_mala"] == "Contraseña incorrecta."
    assert "45 s" in m["bloqueo"] and "12 min 34 s" in m["bloqueo_largo"]
    assert "caducado" in m["sesion"]
    assert "cambiar la contraseña" in m["cambio_de_clave"]
    assert "Sin conexión" in m["sin_red"]
    assert "Nodo 3" in m["validacion"] and "título es obligatorio" in m["validacion"]
    for texto in m.values():
        assert "HTTP 4" not in texto and "Request failed" not in texto

    assert a15["segundos_de_bloqueo"] == 45 and a15["segundos_otro_error"] is None
    assert a15["login_lanza"] == {
        "es_admin_http": True,
        "status": 429,
        "detail": "too many failed attempts; retry in 30s",
        "segundos": 30,
    }


def test_a15_un_403_de_sesion_avisa_a_la_aplicacion_pero_los_demas_errores_no(js):
    a15 = js["A15"]

    assert [x["avisos"] for x in a15["aviso_de_sesion_caducada"]] == [1, 0, 0, 0]
    assert a15["guardado_403"]["avisos"] == 1 and a15["guardado_403"]["status"] == "fail"
    assert "caducado" in a15["guardado_403"]["mensaje"]


def test_a15_los_borradores_sobreviven_en_sessionstorage_y_nunca_revientan(js):
    b = js["A15"]["borradores"]

    assert b["guardo"] is True
    assert b["leido"]["stages"] == [{"id": 1}] and b["leido"]["players"] == [{"id": "ana"}]
    assert b["tras_borrar"] is None
    assert b["con_almacenamiento_roto"] == {"escribir": False, "leer": None}
    assert b["reciente"] is True and b["caducado"] is False
    assert b["edad"] == "hace 5 min"


def test_a15_hay_boton_de_cerrar_sesion_y_la_vuelta_al_login_guarda_el_trabajo():
    shell = leer("components", "AdminMissionControlShell.tsx")
    app = leer("AdminApp.tsx")

    assert "Cerrar sesión" in shell and "onLogout" in shell
    assert "logoutAdmin()" in app
    # 403: se guarda una copia ANTES de volver al login, y se ofrece al volver a entrar.
    manejador = app[app.index("function handleSessionExpired"): app.index("function downloadLocalChanges")]
    assert manejador.index("writeAdminDrafts(") < manejador.index("setOverviewState('locked')")
    assert "ADMIN_SESSION_EXPIRED_EVENT" in app
    assert "readAdminDrafts()" in app and "Hay cambios sin guardar de tu sesión anterior" in app
    # El login cuenta atrás el bloqueo y no dice «Request failed».
    assert "loginLockedSeconds" in app and "formatWait(loginLockedSeconds)" in app
    assert "Request failed" not in leer("lib", "adminApi.ts")


def test_a15_recargar_ya_no_cambia_el_panel_entero_por_la_pantalla_de_entrada():
    app = leer("AdminApp.tsx")

    assert "onRefresh={() => void refreshOverview()}" in app
    cuerpo = app[app.index("async function refreshOverview"): app.index("async function handleLogout")]
    assert "setOverviewState('loading')" not in cuerpo, "recargar sacaba al panel de la sesión"


def test_a15_la_clave_de_mision_no_se_guarda_en_el_navegador(js):
    assert js["A16"]["sin_clave_de_mision"] == {"site_name": "A"}


# ---------------------------------------------------------------------------
# A16 · borradores, jugadores, IDs
# ---------------------------------------------------------------------------


def test_a16_recargar_jugadores_o_ajustes_no_pisa_los_nodos_sin_guardar(js):
    f = js["A16"]["fusion"]

    assert f["titulo_del_nodo"] == "Movido sin guardar" and f["lat_del_nodo"] == 1.5
    assert f["revision"] == "base", "la huella con la que se cargaron los nodos no cambia"
    assert f["nivel_de_ana"] == 4 and f["ajustes"] == "Nuevo" and f["terminados"] == 1


def test_a16_los_borradores_no_se_reconstruyen_con_cada_cambio_de_la_vista():
    app = leer("AdminApp.tsx")

    assert "[overviewReady, overview, profiles, config]" not in app
    assert "setOverview(refreshed)" not in app, "la vista entera del servidor pisaba los nodos sin guardar"
    assert app.count("mergeServerPeople(") >= 4


def test_a16_ids_repetidos_huerfanos_y_cambios_de_id(js):
    a16 = js["A16"]

    assert a16["repetidos"] == ["ANA"]
    assert a16["huerfanos"] == ["Bea", "Cai"]
    assert a16["id_cambiado"] == {"cambiado": True, "igual": False, "nuevo": False}


def test_a16_borrar_un_jugador_y_cambiar_su_id_piden_confirmacion():
    app = leer("AdminApp.tsx")
    panel = leer("components", "PlayersPanel.tsx")

    borrar = app[app.index("function deletePlayerDraft"): app.index("function buildPlayerConfigPayload")]
    assert "window.confirm(" in borrar and borrar.index("window.confirm(") < borrar.index("setPlayerDrafts(")

    guardar = app[app.index("async function savePlayerProfiles"): app.index("function buildDraftBundle")]
    assert "findDuplicatePlayerIds(playerDrafts)" in guardar
    assert "findOrphanedPlayerIds(" in guardar and "window.confirm(" in guardar
    assert guardar.index("findDuplicatePlayerIds") < guardar.index("await saveAdminConfig")
    assert "isPlayerIdChanged(" in panel and "ID repetido" in panel


# ---------------------------------------------------------------------------
# A17 · «N pendientes»
# ---------------------------------------------------------------------------


def test_a17_los_pendientes_no_se_cortan_en_las_200_filas_cargadas(js):
    a17 = js["A17"]

    assert a17["tope"] == {"text": "200+", "exact": False}
    assert a17["total_del_servidor"] == {"text": "1234", "exact": True}
    assert a17["pocas"] == {"text": "3", "exact": True}
    assert a17["mezcla_bajo_tope"] == {"text": "1", "exact": True}


def test_a17_el_orden_lo_decide_la_fecha_no_el_orden_de_llegada(js):
    a17 = js["A17"]

    assert a17["orden_ascendente"] == ["b", "a"]
    assert a17["orden_descendente"] == ["b", "a"]
    assert ".reverse()" not in leer("components", "ActivityPanel.tsx")


# ---------------------------------------------------------------------------
# A18 · trampa de palabras, mapa vacío, HTML escapado
# ---------------------------------------------------------------------------


def test_a18_la_trampa_de_palabras_no_guarda_preguntas_de_relleno(js):
    a18 = js["A18"]

    assert a18["sin_relleno"] == {"preguntas": 0, "hay_relleno": False}
    assert a18["solo_las_escritas"] == ["Uno", "Dos"]
    assert a18["nodos_incompletos"] == [{"index": 0, "complete": 1}]
    assert "al menos 4 preguntas" in a18["mensaje"]
    assert a18["mision_completa_pasa"] is None


def test_a18_centro_y_zoom_vacios_no_se_guardan_como_cero(js):
    mapa = js["A18"]["mapa"]

    assert mapa["vacio"] == {}
    assert mapa["valido"] == {"center": [42.5, -8.6], "zoom": 13}
    assert "latitud Y longitud" in mapa["solo_la_latitud"]["error"]
    assert "-90 y 90" in mapa["latitud_absurda"]["error"]
    assert "entre 1 y 22" in mapa["zoom_absurdo"]["error"]
    assert mapa["cero_legitimo"] == {"center": [0, 0], "zoom": 5}, "0 escrito a propósito es un valor válido"


def test_a18_los_tooltips_del_mapa_escapan_los_nombres(js):
    assert "<" not in js["A18"]["escapado"] and "&lt;img" in js["A18"]["escapado"]

    mapa = leer("AdminMissionMap.tsx")
    for crudo in (
        "${fromNode?.title || 'Nodo A'}",
        "${toNode?.title || 'Nodo B'}",
        "${stage.title || 'Nodo'}",
        "🔧 Ingrediente: \"${itemId}\"",
    ):
        assert crudo not in mapa, f"tooltip sin escapar: {crudo}"
    assert "import { escapeHtml } from './lib/htmlEscape'" in mapa
    assert mapa.count("escapeHtml(") >= 15
    # El nombre del jugador entra escapado al HTML del punto y del tooltip.
    assert re.search(r"const name = escapeHtml\(", mapa)
    # Los QR que se imprimen tampoco pueden cerrar el <script> con un título.
    assert "replace(/</g, '\\\\u003c')" in leer("utils", "printQrs.tsx")


# ---------------------------------------------------------------------------
# Cosas de conjunto
# ---------------------------------------------------------------------------


def test_ningun_fichero_del_admin_mezcla_saltos_de_linea():
    """Un fichero mixto (LF y CRLF) hace que los diffs de git sean ilegibles."""
    culpables = []
    for ruta in list(ADMIN.rglob("*.ts")) + list(ADMIN.rglob("*.tsx")):
        datos = ruta.read_bytes()
        crlf = datos.count(b"\r\n")
        lf = datos.count(b"\n") - crlf
        if crlf and lf:
            culpables.append(f"{ruta.relative_to(RAIZ).as_posix()} (CRLF {crlf}, LF {lf})")
    assert not culpables, culpables
