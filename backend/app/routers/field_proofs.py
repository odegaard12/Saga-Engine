from fastapi import APIRouter, Request, Response, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
import hashlib
import io
import json
import zipfile
import base64
import os
import secrets
import sqlite3
import tempfile
import time
import warnings
from pathlib import Path

try:  # Pillow es opcional: sin él no hay miniaturas y se sirve la original.
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

from backend.app.security import imagenes as _imagenes
from backend.app.runtime import descargas as _descargas
from backend.app.runtime import entradas as _entradas
from backend.app.storage import schema_cache
from backend.app.storage.event_store import append_event
from backend.app.runtime.minigames import _as_str, _as_float

router = APIRouter()

#: Tope de píxeles que se decodifican. Pillow, por defecto, acepta hasta ~179
#: Mpx: un PNG de 3 MB de un solo color puede declarar 170 Mpx y pedir 0,5-1 GB de
#: memoria al abrirlo, en el mismo proceso que atiende a todos los jugadores
#: (caza de fallos S10). Se fija UNA vez, al importar. Una foto de móvil de 48 Mpx
#: ya no pasa, y para una foto de campo sobra.
MAX_PIXELES_DE_FOTO = 40_000_000
if Image is not None:
    Image.MAX_IMAGE_PIXELS = MAX_PIXELES_DE_FOTO

FIELD_PROOF_ALLOWED_MEDIA_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
FIELD_PROOF_MAX_IMAGE_BYTES = 3_000_000
#: El cuerpo JSON lleva la foto en base64 (+33 %) y unos pocos campos más.
FIELD_PROOF_MAX_BODY_BYTES = int(FIELD_PROOF_MAX_IMAGE_BYTES * 1.4) + 64_000
#: Fotos activas que puede tener un mismo jugador. Una ruta entera son ~17 en
#: total; pasar de esto es un cliente roto o un abuso, no una partida.
FIELD_PROOF_MAX_PER_PLAYER = int(os.getenv("SAGA_MAX_PHOTOS_PER_PLAYER", "100") or "100")

#: Miniatura del mapa y de las listas. Era 360 px / calidad 82: en un móvil de 3x
#: la chincheta de foto se veía borrosa. 720 px pesa ~60-90 KB y va nítida.
LADO_MINIATURA_PX = 720
CALIDAD_MINIATURA = 86
CARPETA_DE_MINIATURAS = "thumbs"


def miniatura_de(base_dir, image_filename):
    """Dónde vive la miniatura de una foto: `proofs/thumbs/<nombre>.jpg`."""
    return Path(base_dir) / CARPETA_DE_MINIATURAS / (Path(_as_str(image_filename)).name + ".jpg")


def borrar_miniatura(base_dir, image_filename):
    """Borra la miniatura de una foto si existe. Devuelve True si borró algo."""
    try:
        miniatura = miniatura_de(base_dir, image_filename)
        if miniatura.is_file():
            miniatura.unlink()
            return True
    except OSError:
        pass
    return False


def generar_miniatura(origen, destino):
    """Escribe la miniatura JPEG (`LADO_MINIATURA_PX`) de `origen` en `destino`. True si pudo."""
    if Image is None:
        return False
    try:
        from PIL import ImageOps

        destino = Path(destino)
        destino.parent.mkdir(parents=True, exist_ok=True)
        temporal = destino.with_name(destino.name + ".tmp")
        with Image.open(origen) as imagen:
            imagen = ImageOps.exif_transpose(imagen)
            imagen = imagen.convert("RGB")
            imagen.thumbnail((LADO_MINIATURA_PX, LADO_MINIATURA_PX), Image.LANCZOS)
            imagen.save(temporal, "JPEG", quality=CALIDAD_MINIATURA, optimize=True)
        os.replace(temporal, destino)
        return True
    except Exception:
        return False


def miniatura_es_antigua(miniatura, original):
    """True si la miniatura es de las de 360 px y la foto da para una mayor.

    Sólo se leen las cabeceras. Así las fotos hechas antes de subir a 720 px se
    rehacen solas la primera vez que se piden, sin script de migración.
    """
    if Image is None:
        return False
    try:
        with Image.open(miniatura) as m, Image.open(original) as o:
            return max(m.size) < LADO_MINIATURA_PX and max(o.size) > max(m.size)
    except Exception:
        return False


def resolve_field_proofs_dir():
    from main import DATA_DIR
    base = Path(DATA_DIR) / "proofs"
    base.mkdir(parents=True, exist_ok=True)
    return base


def resolve_runtime_sqlite_path():
    explicit = str(os.getenv("SAGA_SQLITE_DB") or "").strip()
    if explicit:
        return explicit
    from main import DATA_DIR
    return os.path.join(DATA_DIR, "saga.sqlite3")


def connect_runtime_sqlite():
    path = resolve_runtime_sqlite_path()
    parent = os.path.dirname(path) or "."
    os.makedirs(parent, exist_ok=True)

    conn = sqlite3.connect(path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


_ESQUEMA_FOTOS = "field_proofs"


def _asegurar_indice_unico_de_client_id(conn):
    """Una foto por (jugador, client_id): la subida repetida no puede duplicar.

    `find_existing_proof` ya lo miraba ANTES de insertar, pero dos subidas de la
    misma foto a la vez (la cola de fondo y el reintento a mano) pasaban las dos
    la comprobación y entraban las dos. El índice único lo cierra en la base.

    Migración segura en bases viejas: si ya hay repetidas, la más antigua se
    queda con el `client_id` y a las demás se les vacía (no se borra ninguna
    foto). Un `client_id` vacío -móviles viejos- queda fuera del índice.
    """
    conn.execute(
        """
        UPDATE field_proofs
        SET client_id = ''
        WHERE client_id <> ''
          AND rowid NOT IN (
              SELECT MIN(rowid) FROM field_proofs
              WHERE client_id <> ''
              GROUP BY user, client_id
          )
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_field_proofs_user_client_id
        ON field_proofs(user, client_id)
        WHERE client_id <> ''
        """
    )


def find_proof_by_client_id(user, client_id):
    """La foto de este jugador con ese client_id, en el estado que esté."""
    if not client_id:
        return None
    init_field_proof_schema()
    conn = connect_runtime_sqlite()
    try:
        fila = conn.execute(
            "SELECT * FROM field_proofs WHERE user = ? AND client_id = ? LIMIT 1",
            (user, client_id),
        ).fetchone()
    finally:
        conn.close()
    return row_to_field_proof(fila) if fila else None


def init_field_proof_schema():
    # Una vez por fichero y proceso (ver storage/schema_cache.py): cada consulta de
    # fotos empezaba abriendo una conexión y haciendo DDL con commit.
    ruta = resolve_runtime_sqlite_path()
    if schema_cache.esta_listo(_ESQUEMA_FOTOS, ruta):
        return

    conn = connect_runtime_sqlite()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS field_proofs (
                id TEXT PRIMARY KEY,
                user TEXT NOT NULL,
                display_name TEXT NOT NULL DEFAULT '',
                stage_id TEXT NOT NULL DEFAULT '',
                stage_title TEXT NOT NULL DEFAULT '',
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                image_filename TEXT NOT NULL,
                media_type TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                visibility TEXT NOT NULL DEFAULT 'team',
                status TEXT NOT NULL DEFAULT 'active',
                content_sha256 TEXT NOT NULL DEFAULT '',
                client_id TEXT NOT NULL DEFAULT ''
            )
            """
        )
        # Bases anteriores a la subida idempotente: ganan las dos columnas.
        columnas = {fila[1] for fila in conn.execute("PRAGMA table_info(field_proofs)").fetchall()}
        if "content_sha256" not in columnas:
            conn.execute("ALTER TABLE field_proofs ADD COLUMN content_sha256 TEXT NOT NULL DEFAULT ''")
        if "client_id" not in columnas:
            conn.execute("ALTER TABLE field_proofs ADD COLUMN client_id TEXT NOT NULL DEFAULT ''")
        # Fotos borradas antes de la 5.49: la fila guardaba aún dónde se hizo y
        # su nota. Se limpian una vez (después ya no queda ninguna así).
        conn.execute(
            "UPDATE field_proofs SET lat = 0, lon = 0, note = '' "
            "WHERE status = 'deleted' AND (lat != 0 OR lon != 0 OR note != '')"
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_field_proofs_created
            ON field_proofs(created_at DESC)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_field_proofs_stage
            ON field_proofs(stage_id, created_at DESC)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_field_proofs_user_hash
            ON field_proofs(user, content_sha256)
            """
        )
        _asegurar_indice_unico_de_client_id(conn)
        conn.commit()
    finally:
        conn.close()

    schema_cache.marcar_listo(_ESQUEMA_FOTOS, ruta)


def field_proof_image_url(proof_id):
    return f"/api/field-proofs/{proof_id}/image"


def field_proof_thumb_url(proof_id):
    return f"/api/field-proofs/{proof_id}/thumb"


def row_to_field_proof(row):
    return {
        "id": row["id"],
        "user": row["user"],
        "display_name": row["display_name"],
        "stage_id": row["stage_id"],
        "stage_title": row["stage_title"],
        "lat": row["lat"],
        "lon": row["lon"],
        "note": row["note"],
        "media_type": row["media_type"],
        "created_at": row["created_at"],
        "visibility": row["visibility"],
        "status": row["status"],
        "image_url": field_proof_image_url(row["id"]),
        "thumbnail_url": field_proof_thumb_url(row["id"]),
    }


def list_field_proof_records(limit=180):
    init_field_proof_schema()
    try:
        limit = max(1, min(400, int(limit or 180)))
    except (TypeError, ValueError):
        limit = 180

    conn = connect_runtime_sqlite()
    try:
        rows = conn.execute(
            """
            SELECT *
            FROM field_proofs
            WHERE status = 'active' AND visibility = 'team'
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    finally:
        conn.close()

    return [row_to_field_proof(row) for row in rows]


def get_field_proof_record(proof_id):
    init_field_proof_schema()

    conn = connect_runtime_sqlite()
    try:
        row = conn.execute(
            """
            SELECT *
            FROM field_proofs
            WHERE id = ? AND status = 'active'
            """,
            (proof_id,),
        ).fetchone()
    finally:
        conn.close()

    return row_to_field_proof(row) if row else None


def insert_field_proof_record(record):
    init_field_proof_schema()

    conn = connect_runtime_sqlite()
    try:
        conn.execute(
            """
            INSERT INTO field_proofs (
                id,
                user,
                display_name,
                stage_id,
                stage_title,
                lat,
                lon,
                note,
                image_filename,
                media_type,
                created_at,
                visibility,
                status,
                content_sha256,
                client_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["id"],
                record["user"],
                record["display_name"],
                record.get("stage_id", ""),
                record.get("stage_title", ""),
                record["lat"],
                record["lon"],
                record.get("note", ""),
                record["image_filename"],
                record["media_type"],
                record["created_at"],
                record.get("visibility", "team"),
                record.get("status", "active"),
                record.get("content_sha256", ""),
                record.get("client_id", ""),
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return get_field_proof_record(record["id"])


def find_existing_proof(user, client_id, content_sha256):
    """La foto ACTIVA de este jugador que ya cubre esta subida, si la hay.

    Una subida que se reintenta (la respuesta se perdió, el móvil vuelve a
    mandar) llegaba dos veces y dejaba dos fotos iguales en el mapa. Se reconoce
    por el `client_id` que manda el móvil o, sin él, por el contenido exacto de la
    imagen (sha256) del mismo jugador y el mismo nodo (caza de fallos S10).
    """
    init_field_proof_schema()
    conn = connect_runtime_sqlite()
    try:
        if client_id:
            # En cualquier estado: si el jugador ya la borró, una subida
            # repetida de la misma foto no la resucita (y el índice único no
            # dejaría insertarla otra vez).
            fila = conn.execute(
                "SELECT * FROM field_proofs WHERE user = ? AND client_id = ? LIMIT 1",
                (user, client_id),
            ).fetchone()
            if fila:
                return row_to_field_proof(fila)
        if content_sha256:
            fila = conn.execute(
                "SELECT * FROM field_proofs WHERE user = ? AND content_sha256 = ? AND status = 'active' LIMIT 1",
                (user, content_sha256),
            ).fetchone()
            if fila:
                return row_to_field_proof(fila)
    finally:
        conn.close()
    return None


def count_active_proofs(user):
    init_field_proof_schema()
    conn = connect_runtime_sqlite()
    try:
        fila = conn.execute(
            "SELECT COUNT(*) AS n FROM field_proofs WHERE user = ? AND status = 'active'",
            (user,),
        ).fetchone()
    finally:
        conn.close()
    return int(fila["n"] or 0)


def decode_field_proof_image(data_url):
    raw = _as_str(data_url).strip()
    if not raw.startswith("data:") or "," not in raw:
        raise HTTPException(status_code=400, detail="image_data_url must be a data URL")

    header, encoded = raw.split(",", 1)
    header_lower = header.lower()
    media_type = header_lower[5:].split(";")[0].strip()

    if ";base64" not in header_lower:
        raise HTTPException(status_code=400, detail="image must be base64 encoded")
    if media_type not in FIELD_PROOF_ALLOWED_MEDIA_TYPES:
        raise HTTPException(status_code=400, detail="unsupported image type")

    try:
        payload = base64.b64decode(encoded, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid base64 image")

    if not payload:
        raise HTTPException(status_code=400, detail="empty image")
    if len(payload) > FIELD_PROOF_MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="image too large")

    # Manda el contenido, no la cabecera: un SVG o un HTML con la cabecera
    # `image/jpeg` se guardaba y se servía después desde el mismo origen que la
    # app. Firma (magic bytes) + Pillow; el tipo con el que se guarda y se sirve
    # es el REAL (ver security/imagenes.py).
    real = _imagenes.tipo_real(payload)
    if real is None or real not in FIELD_PROOF_ALLOWED_MEDIA_TYPES:
        raise HTTPException(status_code=400, detail="not a real image")

    return real, payload


@router.get("/api/field-proofs")
def get_field_proofs(request: Request, user: str = "", limit: int = 180):
    from main import exigir_ser_del_grupo, resolve_known_player_profile

    # Esto estaba abierto a internet: devolvía las fotos de la ruta con el
    # nombre de quien las hizo y sus coordenadas exactas, sin pedir nada.
    exigir_ser_del_grupo(request)

    user_text = _as_str(user).strip()

    if user_text and not resolve_known_player_profile(user_text):
        raise HTTPException(status_code=403, detail="unknown player")

    return {
        "status": "ok",
        "proofs": list_field_proof_records(limit=limit),
    }


@router.get("/api/field-proofs/download")
def download_field_proofs(request: Request, user: str = ""):
    from main import exigir_ser_del_grupo, resolve_known_player_profile

    # Un zip con TODAS las fotos de la ruta, que se servía a cualquiera.
    exigir_ser_del_grupo(request)

    user_text = _as_str(user).strip()

    if user_text and not resolve_known_player_profile(user_text):
        raise HTTPException(status_code=403, detail="unknown player")

    init_field_proof_schema()

    conn = connect_runtime_sqlite()
    try:
        rows = conn.execute(
            """
            SELECT *
            FROM field_proofs
            WHERE status = 'active' AND visibility = 'team'
            ORDER BY created_at ASC, id ASC
            """
        ).fetchall()
    finally:
        conn.close()

    base_dir = resolve_field_proofs_dir().resolve()
    manifest = []

    # El zip va a un fichero temporal, no a memoria: con las fotos de toda la
    # ruta eran decenas de megas en el mismo proceso que atiende a los
    # jugadores (en una Raspberry). Se borra al terminar de enviarlo.
    temporal = tempfile.NamedTemporaryFile(prefix="saga-fotos-", suffix=".zip", delete=False)
    temporal.close()
    ruta_zip = temporal.name

    try:
        _escribir_zip_de_fotos(ruta_zip, rows, base_dir, manifest)
    except Exception:
        _borrar_sin_error(ruta_zip)
        raise

    if not manifest:
        _borrar_sin_error(ruta_zip)
        raise HTTPException(status_code=404, detail="no field photos")

    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())

    return FileResponse(
        ruta_zip,
        media_type="application/zip",
        filename=f"saga-field-photos-{stamp}.zip",
        headers={"Cache-Control": "no-store"},
        background=BackgroundTask(_borrar_sin_error, ruta_zip),
    )


def _escribir_zip_de_fotos(ruta_zip, rows, base_dir, manifest):
    with zipfile.ZipFile(ruta_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for row in rows:
            proof_id = _as_str(row["id"]).strip()
            filename = _as_str(row["image_filename"]).strip()
            media_type = _as_str(row["media_type"] or "image/jpeg").strip() or "image/jpeg"
            created_at = int(row["created_at"] or 0)
            target = (base_dir / filename).resolve()

            if not target.is_relative_to(base_dir):
                continue
            if not target.exists() or not target.is_file():
                continue

            suffix = target.suffix or ".jpg"
            arcname = f"photos/{created_at}_{proof_id}{suffix}"
            archive.write(target, arcname)

            manifest.append({
                "id": proof_id,
                "file": arcname,
                "user": row["user"],
                "display_name": row["display_name"],
                "stage_id": row["stage_id"],
                "stage_title": row["stage_title"],
                "lat": row["lat"],
                "lon": row["lon"],
                "note": row["note"],
                "media_type": media_type,
                "created_at": created_at,
            })

        archive.writestr(
            "manifest.json",
            json.dumps(
                {
                    "status": "ok",
                    "generated_at": int(time.time()),
                    "count": len(manifest),
                    "photos": manifest,
                },
                ensure_ascii=False,
                indent=2,
            ),
        )


@router.get("/api/field-proofs/{proof_id}/thumb")
def get_field_proof_thumb(request: Request, proof_id: str):
    """
    Miniatura para el mapa: 720 px de lado mayor, JPEG.

    El mapa pedía la foto ENTERA para pintar una chincheta de 40 px. Con
    diecisiete fotos de móvil son decenas de megas que compiten con las
    teselas: en el monte "las fotos no aparecen". Se hace una vez, se guarda
    junto a la original y pesa unos 60-90 KB. Misma puerta que la foto entera.
    Sin Pillow (o con una foto que no se pueda leer), se sirve la original.
    """
    from main import exigir_ser_del_grupo

    exigir_ser_del_grupo(request)

    safe_id = _as_str(proof_id).strip()
    if not safe_id:
        raise HTTPException(status_code=404, detail="proof not found")

    init_field_proof_schema()
    conn = connect_runtime_sqlite()
    try:
        row = conn.execute(
            """
            SELECT image_filename, media_type
            FROM field_proofs
            WHERE id = ? AND status = 'active'
            """,
            (safe_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="proof not found")

    filename = _as_str(row["image_filename"]).strip()
    media_type = _as_str(row["media_type"] or "image/jpeg").strip() or "image/jpeg"
    base_dir = resolve_field_proofs_dir().resolve()
    target = (base_dir / filename).resolve()
    if not target.is_relative_to(base_dir):
        raise HTTPException(status_code=400, detail="invalid proof path")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="proof image not found")

    cabeceras = {"Cache-Control": "private, max-age=604800"}
    miniatura = miniatura_de(base_dir, target.name)
    # Normalmente ya la hizo la subida. Si no (fotos antiguas), se hace aquí, y
    # esta ruta es `def`: FastAPI la ejecuta en un hilo, no en el bucle.
    if miniatura.exists() and miniatura_es_antigua(miniatura, target):
        generar_miniatura(target, miniatura)
    if not miniatura.exists() and not generar_miniatura(target, miniatura):
        return FileResponse(target, media_type=media_type, headers=cabeceras)
    return FileResponse(miniatura, media_type="image/jpeg", headers=cabeceras)


@router.get("/api/field-proofs/{proof_id}/image")
def get_field_proof_image(request: Request, proof_id: str):
    from main import exigir_ser_del_grupo

    # La foto en sí. Se descargaba entera desde su URL sin pedir nada, así que
    # con la lista de arriba en la mano cualquiera se las llevaba todas.
    exigir_ser_del_grupo(request)

    safe_id = _as_str(proof_id).strip()
    if not safe_id:
        raise HTTPException(status_code=404, detail="proof not found")

    init_field_proof_schema()
    conn = connect_runtime_sqlite()
    try:
        row = conn.execute(
            """
            SELECT image_filename, media_type
            FROM field_proofs
            WHERE id = ? AND status = 'active'
            """,
            (safe_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="proof not found")

    filename = _as_str(row["image_filename"]).strip()
    media_type = _as_str(row["media_type"] or "image/jpeg").strip() or "image/jpeg"

    base_dir = resolve_field_proofs_dir().resolve()
    target = (base_dir / filename).resolve()

    if not target.is_relative_to(base_dir):
        raise HTTPException(status_code=400, detail="invalid proof path")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="proof image not found")

    return FileResponse(
        target,
        media_type=media_type,
        # `private`: es una foto de una persona, no un icono. Con `public`,
        # Cloudflare la guardaba en su borde y podía servirla sin volver a
        # preguntar aquí, que es justo saltarse la puerta que acabamos de poner.
        # El service worker del móvil la sigue cacheando igual.
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.delete("/api/field-proofs/{proof_id}")
def delete_field_proof(proof_id: str, request: Request, user: str = ""):
    from main import resolve_known_player_profile, require_player_session
    safe_id = _as_str(proof_id).strip()
    user_text = _as_str(user).strip()

    if not safe_id:
        raise HTTPException(status_code=404, detail="proof not found")
    if not user_text:
        raise HTTPException(status_code=400, detail="user required")

    # El `user` del body ya no basta: la sesión firmada tiene que ser la de ese
    # mismo jugador, si no cualquiera con un nombre y un proof_id borra fotos
    # ajenas.
    require_player_session(request, user_text)

    profile = resolve_known_player_profile(user_text)
    if not profile:
        raise HTTPException(status_code=403, detail="unknown player")

    profile_id = _as_str(profile.get("id") or user_text).strip()

    init_field_proof_schema()
    conn = connect_runtime_sqlite()
    try:
        row = conn.execute(
            """
            SELECT id, user, image_filename
            FROM field_proofs
            WHERE id = ? AND status = 'active'
            """,
            (safe_id,),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="proof not found")

        if _as_str(row["user"]).strip() != profile_id:
            raise HTTPException(status_code=403, detail="only the creator can delete this photo")

        # Borrar es borrar: además de ocultarla, fuera dónde se hizo y qué
        # decía. Antes la fila se quedaba con lat/lon/nota de una persona que
        # había pedido quitar su foto (auditoría F7). La fila se conserva (con
        # 0/0: las columnas no admiten NULL) para que una subida repetida de la
        # misma foto no la resucite.
        conn.execute(
            """
            UPDATE field_proofs
            SET status = 'deleted', lat = 0, lon = 0, note = ''
            WHERE id = ?
            """,
            (safe_id,),
        )
        conn.commit()

        filename = _as_str(row["image_filename"]).strip()
    finally:
        conn.close()

    if filename:
        base_dir = resolve_field_proofs_dir().resolve()
        target = (base_dir / filename).resolve()

        if target.is_relative_to(base_dir) and target.exists() and target.is_file():
            try:
                target.unlink()
            except OSError:
                pass

        # Y su miniatura: borrar la foto dejaba en `proofs/thumbs/` una copia
        # reducida de una persona que ya nadie podía ver ni borrar (caza de
        # fallos S3).
        borrar_miniatura(base_dir, filename)

    return {
        "status": "ok",
        "id": safe_id,
    }


def _comprobar_pixeles(datos):
    """Rechaza una imagen que declare más píxeles de los permitidos.

    Sólo se lee la cabecera (`Image.open` no decodifica): así una «bomba de
    descompresión» -un PNG de 3 MB que declara 170 Mpx- se corta aquí y no al
    intentar la miniatura. Una imagen que Pillow no sabe leer no se rechaza
    (se guardaba tal cual y se sigue guardando; sólo se queda sin miniatura).
    """
    if Image is None:
        return
    try:
        with warnings.catch_warnings():
            # Entre 1x y 2x del tope Pillow sólo avisa; aquí se decide por tamaño.
            warnings.simplefilter("ignore", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(datos)) as imagen:
                ancho, alto = imagen.size
    except Image.DecompressionBombError:
        raise HTTPException(status_code=400, detail="image has too many pixels")
    except Exception:
        return
    if ancho * alto > MAX_PIXELES_DE_FOTO:
        raise HTTPException(status_code=400, detail="image has too many pixels")


def _borrar_sin_error(ruta):
    try:
        Path(ruta).unlink()
    except OSError:
        pass


def _guardar_foto_y_miniatura(destino, datos, miniatura):
    """Escribe la foto (de forma atómica) y su miniatura. Corre en un hilo."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporal = destino.with_name(destino.name + ".tmp")
    temporal.write_bytes(datos)
    os.replace(temporal, destino)
    generar_miniatura(destino, miniatura)


@router.post("/api/field-proofs")
async def create_field_proof(request: Request):
    from main import (
        resolve_known_player_profile,
        get_live_position,
        sanitize_event_text,
        require_player_session,
        EVENT_LOG_DB,
    )
    # El tope se aplica ANTES de leer el cuerpo entero: `Content-Length` primero y,
    # si el cliente no lo declara, cortando la lectura al pasarse. Antes se leía
    # y se decodificaba todo para luego decir que era demasiado grande.
    data = await _entradas.leer_cuerpo_json(request, max_bytes=FIELD_PROOF_MAX_BODY_BYTES)

    user = _as_str(data.get("user")).strip()
    if not user:
        raise HTTPException(status_code=400, detail="user required")

    # Subir una foto exige la sesión firmada de ese jugador, no sólo saber su
    # nombre: si no, un extraño planta fotos a nombre de un menor y, omitiendo
    # lat/lon, sobre su posición GPS real.
    require_player_session(request, user)

    profile = resolve_known_player_profile(user)
    if not profile:
        raise HTTPException(status_code=403, detail="unknown player")

    lat = _as_float(data.get("lat"))
    lon = _as_float(data.get("lon"))

    if lat is None or lon is None:
        current = get_live_position(profile.get("id") or user)
        if isinstance(current, dict):
            lat = _as_float(current.get("lat"))
            lon = _as_float(current.get("lon"))

    if lat is None or lon is None:
        # Ni el móvil ni el servidor saben dónde está todavía. No es una foto
        # mala (un 400 la daría por perdida): 409 = «vuelve a intentarlo cuando
        # haya posición». La cola del móvil la reintenta con espera creciente.
        raise HTTPException(status_code=409, detail="position required")
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        raise HTTPException(status_code=400, detail="invalid coordinates")

    media_type, image_bytes = decode_field_proof_image(data.get("image_data_url"))
    await run_in_threadpool(_comprobar_pixeles, image_bytes)

    owner = profile.get("id") or user

    # Subida idempotente: si el móvil reintenta (se perdió la respuesta) NO se
    # duplica la foto; se devuelve la que ya estaba. Se reconoce por el
    # `client_id` que manda el móvil o, sin él, por el contenido exacto.
    huella = hashlib.sha256(image_bytes).hexdigest()
    client_id = _entradas.texto_seguro(data.get("client_id") or data.get("client_proof_id"), 120)
    ya_estaba = find_existing_proof(owner, client_id, huella)
    if ya_estaba:
        return {"status": "ok", "proof": ya_estaba, "duplicate": True}

    if count_active_proofs(owner) >= FIELD_PROOF_MAX_PER_PLAYER:
        raise HTTPException(status_code=429, detail="photo quota exceeded")

    proof_id = f"proof_{secrets.token_urlsafe(12).replace('-', '').replace('_', '')}"
    created_at = int(time.time())
    ext = FIELD_PROOF_ALLOWED_MEDIA_TYPES[media_type]
    month_path = time.strftime("%Y/%m", time.gmtime(created_at))
    image_filename = f"{month_path}/{proof_id}.{ext}"

    base_dir = resolve_field_proofs_dir()
    target = base_dir / image_filename
    # La foto y su miniatura se escriben en un hilo: decodificar y reducir una
    # imagen de móvil es CPU síncrona y no puede parar a los demás jugadores.
    await run_in_threadpool(
        _guardar_foto_y_miniatura, target, image_bytes, miniatura_de(base_dir, image_filename)
    )

    record = {
        "id": proof_id,
        "user": owner,
        "display_name": profile.get("display_name") or user,
        "stage_id": sanitize_event_text(data.get("stage_id"), 120),
        "stage_title": sanitize_event_text(data.get("stage_title"), 160),
        "lat": lat,
        "lon": lon,
        "note": sanitize_event_text(data.get("note"), 220),
        "image_filename": image_filename,
        "media_type": media_type,
        "created_at": created_at,
        "visibility": "team",
        "status": "active",
        "content_sha256": huella,
        "client_id": client_id,
    }

    try:
        proof = insert_field_proof_record(record)
    except sqlite3.IntegrityError:
        # Otra subida de la MISMA foto (mismo client_id) ganó la carrera: se
        # devuelve la que entró y se borra el fichero que sobra. Si el jugador
        # la había borrado ya, no se resucita.
        _borrar_sin_error(target)
        _borrar_sin_error(miniatura_de(base_dir, image_filename))
        ganadora = find_proof_by_client_id(owner, client_id)
        if ganadora:
            return {"status": "ok", "proof": ganadora, "duplicate": True}
        raise

    append_event(
        EVENT_LOG_DB,
        {
            "type": "team_proof_created",
            "status": "synced",
            "source": "player",
            "user": record["user"],
            "team_id": record["user"],
            "node_id": record["stage_id"],
            "payload": {
                "proof_id": proof_id,
                "stage_title": record["stage_title"],
                "note": record["note"],
            },
        },
    )

    # Vestuario: la primera foto puede ganar algo (ver runtime/desbloqueos.py).
    import main as _main

    nuevos = await run_in_threadpool(_main.desbloqueos_tras_evento, record["user"], f"foto:{proof_id}")

    return {
        "status": "ok",
        "proof": proof,
        **({"desbloqueos": nuevos} if nuevos else {}),
    }
