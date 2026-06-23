# SQLite migration dry-run

SAGA Engine currently keeps JSON as the default runtime storage backend.

Optional SQLite storage is available behind:

- `SAGA_STORAGE_BACKEND=sqlite`
- `SAGA_SQLITE_DB=/path/to/saga.sqlite3`

Do not enable SQLite on a live deployment without a backup.

## Dry-run command

Run from the repository root:

`python scripts/sqlite_migration_dry_run.py --data-dir data`

By default, the script writes to a temporary SQLite database and deletes it after the check.

To keep the test database:

`python scripts/sqlite_migration_dry_run.py --data-dir data --sqlite-db /tmp/saga-dry-run.sqlite3`

## What it checks

The dry-run reads:

- `gamestate.json`
- `positions.json`
- `events.json`

Then it writes equivalent records into SQLite using the SQLite storage helpers and compares counts.

It does not modify JSON files.

It does not enable SQLite for the running app.

## Backup checklist before real SQLite activation

Before enabling SQLite on a real deployment:

1. Stop or pause game/admin writes if possible.
2. Back up the data directory.
3. Back up:
   - `gamestate.json`
   - `positions.json`
   - `events.json`
   - `admin_auth.json`
   - `stages.json`
4. Run the dry-run against a copy of the data directory.
5. Inspect the generated SQLite DB with non-sensitive test data first.
6. Only then set:
   - `SAGA_STORAGE_BACKEND=sqlite`
   - `SAGA_SQLITE_DB=/absolute/path/to/saga.sqlite3`

## Rollback

To roll back before a full migration is declared complete:

1. Stop the app.
2. Remove or unset `SAGA_STORAGE_BACKEND=sqlite`.
3. Keep the SQLite DB for investigation.
4. Restore JSON files from backup if needed.
5. Start the app with JSON default storage.

## Current recommendation

Keep production on JSON until the SQLite migration has been tested with copied runtime data and a clear backup/rollback process.
