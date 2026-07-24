import json
import sqlite3
import os
from datetime import datetime

# Read the correct 14 stages
with open('/app/cotorredondo_expanded_route.json', 'r') as f:
    new_stages = json.load(f)

# Update JSON
with open('/app/data/stages.json', 'w') as f:
    json.dump(new_stages, f, indent=2)
print("Updated JSON to", len(new_stages), "rows.")

# Update SQLite
conn = sqlite3.connect('/app/data/saga.sqlite3')
conn.execute("DELETE FROM stages")
now = datetime.utcnow().isoformat()
for index, stage in enumerate(new_stages):
    conn.execute(
        """
        INSERT INTO stages (idx, stage_json, updated_at)
        VALUES (?, ?, ?)
        """,
        (index, json.dumps(stage), now),
    )
conn.commit()

count = conn.execute("SELECT count(*) FROM stages").fetchone()[0]
print("Updated SQLite to", count, "rows.")
