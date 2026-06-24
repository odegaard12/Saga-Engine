#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

REQUIRED_TABLES = {"schema_meta", "app_documents", "stages", "events", "game_state", "positions"}
ACTIVE_JSON = {"admin_auth.json", "config.json", "stages.json", "gamestate.json", "positions.json", "events.json"}

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--sqlite-db", default="")
    args = ap.parse_args()

    data_dir = Path(args.data_dir).expanduser().resolve()
    db = Path(args.sqlite_db).expanduser().resolve() if args.sqlite_db else data_dir / "saga.sqlite3"
    errors = []

    if not db.exists():
        errors.append(f"missing sqlite db: {db}")

    for name in sorted(ACTIVE_JSON):
        if (data_dir / name).exists():
            errors.append(f"active runtime JSON exists: {name}")

    if db.exists():
        with sqlite3.connect(db) as conn:
            tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            missing = sorted(REQUIRED_TABLES - tables)
            if missing:
                errors.append("missing tables: " + ", ".join(missing))
            if "stages" in tables and conn.execute("SELECT COUNT(*) FROM stages").fetchone()[0] <= 0:
                errors.append("stages table is empty")
            if "app_documents" in tables:
                keys = {r[0] for r in conn.execute("SELECT key FROM app_documents")}
                if "admin_auth" not in keys:
                    errors.append("app_documents missing admin_auth")

    if errors:
        print("SQLite runtime strict check failed:")
        for e in errors:
            print("-", e)
        return 1

    print("SQLite runtime strict check passed.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
