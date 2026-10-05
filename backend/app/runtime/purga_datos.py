"""Purga de datos personales: contar lo que hay y borrarlo de verdad.

Lo que SAGA guarda de personas -nombres, fotos hechas por los jugadores,
retratos de las fichas, rastros GPS- se queda para siempre salvo que alguien lo
borre. La primera versión de la purga dejaba mucho por el camino (caza de
fallos del 30/09/2026, S3/A9):

- las miniaturas de `proofs/thumbs/` y cualquier fichero en subcarpetas
  (`proofs/AAAA/MM/`): sólo se miraba el primer nivel, así que el informe decía
  `ficheros_de_imagen: 0` con las fotos delante;
- los eventos `position_track` y las muestras de GPS / la evidencia que llevan
  otros eventos;
- las coordenadas (de dónde a dónde) de las sospechas de `anti_cheat.json`;
- los retratos de las fichas de jugador (`avatar_url` con la foto incrustada);
- y, al borrar filas, los bytes seguían dentro del fichero SQLite (páginas
  libres y WAL): ahora se hace checkpoint + VACUUM.

Todo lo que se cuenta aquí es lo que de verdad se borra: el informe sale de los
ficheros y filas que se quitaron, no de una suposición.

NO toca la misión (nodos, configuración, fichas sin la foto) ni los tiempos y el
progreso, que son el resultado del juego.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

CARPETA_DE_MINIATURAS = "thumbs"


def _fotos():
    from backend.app.routers import field_proofs as fotos

    return fotos


def _registro_analisis():
    from backend.app.runtime import registro_analisis

    return registro_analisis


def _archivos_de(base: Path) -> list[Path]:
    """Todos los ficheros bajo `base`, en cualquier nivel (sin seguir enlaces)."""
    if not base.exists():
        return []
    return [ruta for ruta in base.rglob("*") if ruta.is_file() and not ruta.is_symlink()]


def _es_miniatura(base: Path, ruta: Path) -> bool:
    try:
        return ruta.relative_to(base).parts[0] == CARPETA_DE_MINIATURAS
    except (ValueError, IndexError):
        return False


def _perfiles_con_foto(doc: Any) -> int:
    perfiles = doc.get("player_profiles") if isinstance(doc, dict) else None
    if not isinstance(perfiles, list):
        return 0
    return sum(
        1 for perfil in perfiles
        if isinstance(perfil, dict) and str(perfil.get("avatar_url") or "").startswith("data:")
    )


def _config_guardada():
    import main

    return main.load_document(main.resolve_config_db_path(), "config", {})


def contar() -> dict[str, int]:
    """Qué hay guardado de personas ahora mismo (sin tocar nada)."""
    import main
    from backend.app.storage import event_store

    fotos = _fotos()
    fotos.init_field_proof_schema()
    conn = fotos.connect_runtime_sqlite()
    try:
        total_fotos = conn.execute("SELECT COUNT(*) AS n FROM field_proofs").fetchone()["n"]
    finally:
        conn.close()

    posiciones = main.load_live_positions()
    n_posiciones = sum(
        1 for v in (posiciones or {}).values()
        if isinstance(v, dict) and (v.get("lat") is not None or v.get("lon") is not None)
    )

    base = fotos.resolve_field_proofs_dir()
    archivos = _archivos_de(base)
    eventos = event_store.count_personal_event_data(main.EVENT_LOG_DB)

    return {
        "fotos": int(total_fotos),
        "ficheros_de_imagen": len(archivos),
        "miniaturas": sum(1 for ruta in archivos if _es_miniatura(base, ruta)),
        "avatares": _perfiles_con_foto(_config_guardada()),
        "posiciones_gps": n_posiciones,
        "registro_de_partida": main.match_log_count(),
        "eventos_con_posiciones": eventos["eventos_con_posiciones"],
        "eventos_con_coordenadas": eventos["eventos_con_coordenadas"],
        "sospechas_con_coordenadas": main.anti_cheat_count_coordinates(),
        # Errores de los móviles y auditoría del panel (llevan nombres): ver registro_analisis.py.
        "errores_y_auditoria": sum(_registro_analisis().contar().values()),
    }


def _borrar_fotos() -> dict[str, int]:
    fotos = _fotos()
    fotos.init_field_proof_schema()
    conn = fotos.connect_runtime_sqlite()
    try:
        filas = conn.execute("DELETE FROM field_proofs").rowcount or 0
        conn.commit()
    finally:
        conn.close()

    base = fotos.resolve_field_proofs_dir().resolve()
    imagenes = 0
    miniaturas = 0
    for ruta in _archivos_de(base):
        try:
            era_miniatura = _es_miniatura(base, ruta)
            ruta.unlink()
        except OSError:
            continue
        if era_miniatura:
            miniaturas += 1
        else:
            imagenes += 1

    # Las carpetas vacías (AAAA/MM, thumbs) también sobran.
    carpetas = sorted((r for r in base.rglob("*") if r.is_dir()), key=lambda r: len(r.parts), reverse=True)
    for carpeta in carpetas:
        try:
            carpeta.rmdir()
        except OSError:
            pass

    return {"fotos": int(filas), "imagenes": imagenes, "miniaturas": miniaturas}


def _quitar_retratos() -> int:
    """Vacía `avatar_url` de las fichas que llevan la foto incrustada."""
    import main

    ruta = main.resolve_config_db_path()
    doc = main.load_document(ruta, "config", {})
    if not isinstance(doc, dict) or not isinstance(doc.get("player_profiles"), list):
        return 0

    quitados = 0
    perfiles = []
    for perfil in doc["player_profiles"]:
        if isinstance(perfil, dict) and str(perfil.get("avatar_url") or "").startswith("data:"):
            perfil = {**perfil, "avatar_url": ""}
            quitados += 1
        perfiles.append(perfil)

    if quitados:
        main.save_document(ruta, "config", {**doc, "player_profiles": perfiles})
    return quitados


def _borrar_posiciones() -> dict[str, int]:
    import main
    from backend.app.storage import event_store

    posiciones = main.load_live_positions() or {}
    n_posiciones = len(posiciones)
    main.save_live_positions({})

    # El Registro de partida guarda nombres y posiciones de cada jugador: es
    # justo el mismo tipo de dato, así que se va con ellos y no queda una copia
    # olvidada aparte.
    registro = main.match_log_purge()

    eventos = event_store.purge_personal_event_data(main.EVENT_LOG_DB)
    sospechas = main.anti_cheat_scrub_coordinates()

    # Los metros andados del vestuario (runtime/desbloqueos_glue.py) son rastro
    # de movimiento: se van con las posiciones. Lo ya ganado se queda.
    from backend.app.storage import desbloqueos_store

    metros = desbloqueos_store.borrar_contadores(main._desbloqueos_glue.db_path())

    # Lo nuevo del registro para analizar: errores (con el jugador) y la auditoría
    # del panel (a quién se le cambió qué). Se va entero y se compacta.
    analisis = _registro_analisis().purgar()
    main._desbloqueos_glue.olvidar_pendientes()

    return {
        "metros_andados": metros,
        "posiciones_gps": n_posiciones,
        "registro_de_partida": registro,
        "eventos_borrados": eventos["eventos_borrados"],
        "eventos_limpiados": eventos["eventos_limpiados"],
        "sospechas_limpiadas": sospechas,
        "errores_y_auditoria": sum(analisis.values()),
    }


def _compactar() -> bool:
    """Checkpoint del WAL y VACUUM de las bases SQLite que guardaron datos."""
    import main
    from backend.app.storage import event_store
    from backend.app.storage.sqlite_store import compact_sqlite

    fotos = _fotos()
    rutas = []
    for ruta in (
        fotos.resolve_runtime_sqlite_path(),
        event_store.resolve_event_db_path(main.EVENT_LOG_DB),
        main.MATCH_LOG_DB,
    ):
        if ruta not in rutas:
            rutas.append(ruta)

    resultados = [compact_sqlite(ruta) for ruta in rutas]
    return bool(resultados) and all(resultados)


def ejecutar(*, borrar_fotos: bool = True, borrar_posiciones: bool = True) -> dict[str, Any]:
    """Borra lo pedido y devuelve lo que REALMENTE se borró."""
    import main

    borrado: dict[str, Any] = {
        "fotos": 0,
        "imagenes": 0,
        "miniaturas": 0,
        "avatares": 0,
        "posiciones_gps": 0,
        "registro_de_partida": 0,
        "eventos_borrados": 0,
        "eventos_limpiados": 0,
        "sospechas_limpiadas": 0,
        "errores_y_auditoria": 0,
        "sqlite_compactado": False,
    }

    if borrar_fotos:
        borrado.update(_borrar_fotos())
        borrado["avatares"] = _quitar_retratos()

    if borrar_posiciones:
        borrado.update(_borrar_posiciones())

    main.append_event(
        main.EVENT_LOG_DB,
        {
            "type": "personal_data_purged",
            "status": "synced",
            "source": "admin",
            "user": "admin",
            "payload": {
                "fotos_borradas": borrado["fotos"],
                "imagenes_borradas": borrado["imagenes"],
                "miniaturas_borradas": borrado["miniaturas"],
                "avatares_quitados": borrado["avatares"],
                "posiciones_borradas": borrado["posiciones_gps"],
                "registro_de_partida_borrado": borrado["registro_de_partida"],
                "eventos_borrados": borrado["eventos_borrados"],
                "eventos_limpiados": borrado["eventos_limpiados"],
                "sospechas_limpiadas": borrado["sospechas_limpiadas"],
                "errores_y_auditoria_borrados": borrado["errores_y_auditoria"],
            },
        },
    )

    borrado["sqlite_compactado"] = _compactar()
    return borrado
