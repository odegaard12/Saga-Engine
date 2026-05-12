# SQLite-only runtime

SAGA Engine uses SQLite as the production runtime source of truth.

Runtime database: saga.sqlite3

SQLite stores:
- admin auth
- mission stages
- app/config documents
- event log
- player progress
- live positions

Required Docker environment:
- DATA_DIR=/app_data
- SAGA_STORAGE_BACKEND=sqlite
- SAGA_SQLITE_DB=/app_data/saga.sqlite3

Active runtime JSON files must not exist in the mounted data directory:
- admin_auth.json
- config.json
- stages.json
- gamestate.json
- positions.json
- events.json

Strict check:
python scripts/check_sqlite_runtime_strict.py --data-dir /home/odegaard12/saga_engine_data --sqlite-db /home/odegaard12/saga_engine_data/saga.sqlite3
