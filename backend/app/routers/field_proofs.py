from fastapi import APIRouter, Request, Response, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
import io
import zipfile
import base64
import os
import secrets
import sqlite3
import time
from pathlib import Path

from backend.app.storage.event_store import append_event
from backend.app.runtime.minigames import _as_str, _as_float

router = APIRouter()

FIELD_PROOF_ALLOWED_MEDIA_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
FIELD_PROOF_MAX_IMAGE_BYTES = 3_000_000


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


def init_field_proof_schema():
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
                status TEXT NOT NULL DEFAULT 'active'
            )
            """
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
        conn.commit()
    finally:
        conn.close()


def field_proof_image_url(proof_id):
    return f"/api/field-proofs/{proof_id}/image"


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
        "thumbnail_url": field_proof_image_url(row["id"]),
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
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return get_field_proof_record(record["id"])


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

    return media_type, payload


@router.get("/api/field-proofs")
async def get_field_proofs(request: Request, user: str = "", limit: int = 180):
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
async def download_field_proofs(request: Request, user: str = ""):
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
    buffer = io.BytesIO()
    manifest = []

    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
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

    if not manifest:
        raise HTTPException(status_code=404, detail="no field photos")

    buffer.seek(0)
    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())

    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="saga-field-photos-{stamp}.zip"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/api/field-proofs/{proof_id}/image")
async def get_field_proof_image(request: Request, proof_id: str):
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
async def delete_field_proof(proof_id: str, request: Request, user: str = ""):
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

        conn.execute(
            """
            UPDATE field_proofs
            SET status = 'deleted'
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

    return {
        "status": "ok",
        "id": safe_id,
    }


@router.post("/api/field-proofs")
async def create_field_proof(request: Request):
    from main import (
        resolve_known_player_profile,
        get_live_position,
        sanitize_event_text,
        require_player_session,
        EVENT_LOG_DB,
    )
    data = await request.json()

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
        raise HTTPException(status_code=400, detail="lat/lon required")
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        raise HTTPException(status_code=400, detail="invalid coordinates")

    media_type, image_bytes = decode_field_proof_image(data.get("image_data_url"))

    proof_id = f"proof_{secrets.token_urlsafe(12).replace('-', '').replace('_', '')}"
    created_at = int(time.time())
    ext = FIELD_PROOF_ALLOWED_MEDIA_TYPES[media_type]
    month_path = time.strftime("%Y/%m", time.gmtime(created_at))
    image_filename = f"{month_path}/{proof_id}.{ext}"

    target = resolve_field_proofs_dir() / image_filename
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(image_bytes)

    record = {
        "id": proof_id,
        "user": profile.get("id") or user,
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
    }

    proof = insert_field_proof_record(record)

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

    return {
        "status": "ok",
        "proof": proof,
    }
