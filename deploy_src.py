import subprocess
import datetime
import pathlib
import sys

# Read version from VERSION file
version_file = pathlib.Path(__file__).parent / "VERSION"
version = version_file.read_text().strip() if version_file.exists() else "dev"

# Build timestamp (ISO-8601 UTC)
build_time = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

print(f"[deploy_src] SAGA Engine v{version} — build time: {build_time}")

# ── 1. Create the archive ────────────────────────────────────────────────────
print("[deploy_src] Creating archive...")
subprocess.run([
    "tar", "-czf", "deploy_src.tar.gz",
    "frontend/src", "frontend/public", "frontend/index.html",
    "frontend/package.json",
    "backend",
    "data/stages.json",
    "main.py",
    "VERSION",
], check=True)

# ── 2. SCP to Raspberry Pi ───────────────────────────────────────────────────
print("[deploy_src] Uploading archive to Pi...")
subprocess.run([
    "scp", "deploy_src.tar.gz",
    "odegaard12@192.168.68.104:/home/odegaard12/saga_engine/"
], check=True)

# ── 3. Remote deploy commands ────────────────────────────────────────────────
print("[deploy_src] Running deploy on Pi...")
remote_cmd = f"""set -e
cd /home/odegaard12/saga_engine
echo "[pi] Extracting archive..."
tar -xzf deploy_src.tar.gz

echo "[pi] Building frontend (Node)..."
docker run --rm \\
  -v /home/odegaard12/saga_engine/frontend:/app \\
  -w /app node:20-alpine \\
  sh -c "npm install && npm run build"

echo "[pi] Copying backend and data files into container..."
docker cp backend saga_engine_app:/app/
docker cp data/stages.json saga_engine_app:/app/data/stages.json
docker cp main.py saga_engine_app:/app/main.py
docker cp VERSION saga_engine_app:/app/VERSION

echo "[pi] Copying frontend build..."
docker cp frontend/dist saga_engine_app:/app/frontend/
docker cp frontend/public saga_engine_app:/app/frontend/
docker cp frontend/index.html saga_engine_app:/app/frontend/index.html
docker cp frontend/package.json saga_engine_app:/app/frontend/package.json

echo "[pi] Fixing /app/data permissions..."
docker exec -u 0 saga_engine_app chown -R app:app /app/data || true
docker exec -u 0 saga_engine_app chmod -R 777 /app/data || true

echo "[pi] Writing build-info env file inside container..."
docker exec saga_engine_app sh -c "echo 'SAGA_VERSION={version}' > /app/.saga_build_env && echo 'SAGA_BUILD_TIME={build_time}' >> /app/.saga_build_env"

echo "[pi] Syncing stages.json to SQLite database..."
docker exec saga_engine_app python -c "import json, sqlite3; stages=json.load(open('/app/data/stages.json')); conn=sqlite3.connect('/app/data/saga.sqlite3'); conn.execute('CREATE TABLE IF NOT EXISTS stages (idx INTEGER PRIMARY KEY, stage_json TEXT NOT NULL, updated_at TEXT NOT NULL)'); conn.execute('DELETE FROM stages'); [conn.execute('INSERT INTO stages (idx, stage_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', (i, json.dumps(s, ensure_ascii=False))) for i, s in enumerate(stages)]; conn.commit(); conn.close(); print('[pi] Synced', len(stages), 'stages to SQLite')"

echo "[pi] Restarting container..."
docker restart saga_engine_app

echo "[pi] Done — v{version} at {build_time}"
"""

result = subprocess.run(
    ["ssh", "odegaard12@192.168.68.104", remote_cmd],
    capture_output=False
)

if result.returncode != 0:
    print(f"[deploy_src] ERROR: remote deploy failed (exit code {result.returncode})", file=sys.stderr)
    sys.exit(result.returncode)

print(f"[deploy_src] OK. v{version} deployed at {build_time}")
