"""Huellas de la misión: qué versión de los nodos tiene el panel y el móvil.

Dos huellas distintas, para dos preguntas distintas:

- `admin_stages_revision(nodos_crudos)`: la del PANEL. Sale de los nodos tal
  como están guardados (`/api/admin/stages`). El panel la manda de vuelta al
  guardar (`stages_revision`) y el servidor contesta 409 si entretanto otra
  pestaña u otro administrador cambió la misión: antes la última pestaña en
  guardar pisaba a la otra sin avisar (caza de fallos A7).

- `mission_revision(...)`: la del MÓVIL. Cambia cuando cambia CUALQUIER cosa que
  un jugador se baja para la misión: contenido y coordenadas de los nodos,
  la versión de la proyección por jugador, las fotos de los jugadores, el mapa
  (centro y zoom) y la red de caminos. La pantalla de carga la usa para decidir
  «misión cambiada, hay que volver a bajarla».

Y el cálculo del «qué pasaría» de un guardado (`calcular_afectados`): a qué
jugadores movería la reindexación si se guardaran estos nodos.
"""
from __future__ import annotations

import hashlib
import json
import os
from typing import Any

from backend.app.runtime import mision as _mision
from backend.app.runtime import mision_reindex as _mision_reindex


def admin_stages_revision(nodos_crudos: Any) -> str:
    """16 hex del sha256 del JSON canónico de los nodos guardados."""
    try:
        canonico = json.dumps(
            nodos_crudos if isinstance(nodos_crudos, list) else [],
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            default=str,
        )
    except (TypeError, ValueError):
        return ""
    return hashlib.sha256(canonico.encode("utf-8")).hexdigest()[:16]


def _huella_corta(texto: str) -> str:
    return hashlib.sha256((texto or "").encode("utf-8", errors="replace")).hexdigest()[:12]


def _firma_fichero(ruta: str) -> str:
    """Tamaño y fecha de un fichero, o '-' si no existe. Barato: sólo un stat."""
    try:
        estado = os.stat(ruta)
    except OSError:
        return "-"
    return f"{estado.st_size}:{int(estado.st_mtime)}"


def mission_revision(
    stages_rev: str,
    cfg: dict | None,
    perfiles: list | None,
    road_graph_path: str | None = None,
) -> str:
    """La huella de todo lo que el móvil se baja de la misión (ver arriba)."""
    cfg = cfg if isinstance(cfg, dict) else {}

    fotos = sorted(
        (str(p.get("id") or ""), _huella_corta(str(p.get("avatar_url") or "")))
        for p in (perfiles or [])
        if isinstance(p, dict)
    )

    partes = {
        "nodos": stages_rev or "",
        "proyeccion": _mision.PROYECCION_VERSION,
        "fotos_de_jugadores": fotos,
        "mapa": [cfg.get("map_center"), cfg.get("map_zoom")],
        "caminos": _firma_fichero(road_graph_path) if road_graph_path else "-",
    }
    serializado = json.dumps(partes, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(serializado.encode("utf-8")).hexdigest()[:16]


def _titulo_en(nodos: list, nivel: int) -> str | None:
    """Título del nodo que toca a quien va por `nivel`; None si ya acabó."""
    if 0 <= nivel < len(nodos) and isinstance(nodos[nivel], dict):
        return str(nodos[nivel].get("title") or nodos[nivel].get("id") or f"Nodo {nivel + 1}")
    return None


def _clave_del_nodo(nodos: list, nivel: int):
    """Identidad del nodo en `nivel` (su id, o su título si no tiene); None si ya acabó."""
    if not (0 <= nivel < len(nodos)):
        return None
    nodo = nodos[nivel]
    if nodo.get("id") is not None:
        return ("id", str(nodo.get("id")))
    return ("titulo", str(nodo.get("title") or ""))


def calcular_afectados(
    nodos_viejos: list,
    nodos_nuevos: list,
    niveles: dict[str, int],
    perfiles: list | None = None,
) -> list[dict[str, Any]]:
    """A quién movería guardar `nodos_nuevos` en lugar de `nodos_viejos`.

    Aplica exactamente la reindexación de verdad (`mision_reindex`) sin escribir
    nada. Un jugador cuenta como afectado cuando cambia EL NODO que le toca -no
    cuando sólo se desplaza su número de nivel-: un nodo pendiente movido o
    intercambiado, o uno hecho que se reordena y le hace rehacer otro (el aviso
    del panel comparaba con niveles obsoletos, A12).
    """
    viejos = [n for n in nodos_viejos if isinstance(n, dict)]
    nuevos = [n for n in nodos_nuevos if isinstance(n, dict)]

    reindexados = _mision_reindex.reindex_player_levels(viejos, nuevos, niveles)
    nombres = {
        str(p.get("id")): p.get("display_name") or p.get("id")
        for p in (perfiles or [])
        if isinstance(p, dict)
    }

    afectados = []
    for usuario, antes in niveles.items():
        try:
            antes_n = int(antes or 0)
        except (TypeError, ValueError, OverflowError):
            antes_n = 0
        despues = int(reindexados.get(usuario, antes_n))

        nodo_antes = _titulo_en(viejos, antes_n)
        nodo_despues = _titulo_en(nuevos, despues)
        id_antes = viejos[antes_n].get("id") if 0 <= antes_n < len(viejos) else None
        id_despues = nuevos[despues].get("id") if 0 <= despues < len(nuevos) else None
        clave_antes = _clave_del_nodo(viejos, antes_n)
        clave_despues = _clave_del_nodo(nuevos, despues)

        # Afectado = cambia el nodo que le toca (lo que de verdad nota el jugador).
        # Un simple desplazamiento del índice -se borró un nodo anterior y su
        # siguiente sigue siendo el mismo- no cambia nada de su partida, aunque el
        # número de nivel baje: eso lo cubre la marca `reset_at` que sube el guardado.
        if clave_antes == clave_despues:
            continue

        afectados.append(
            {
                "user": usuario,
                "display_name": nombres.get(str(usuario), usuario),
                "level_antes": antes_n,
                "level_despues": despues,
                "nodo_antes": nodo_antes,
                "nodo_despues": nodo_despues,
                "nodo_antes_id": id_antes,
                "nodo_despues_id": id_despues,
            }
        )

    afectados.sort(key=lambda a: str(a["display_name"]).lower())
    return afectados
