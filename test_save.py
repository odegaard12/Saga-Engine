import sys
import json
import sqlite3
sys.path.append('/app')
from backend.app.storage.runtime_store import save_stages
from main import STAGES_DB

with open('/app/data/stages.json', 'r') as f:
    current = json.load(f)

print("Current json length:", len(current))

with open('cotorredondo_expanded_route.json', 'r') as f:
    new_stages = json.load(f)

print("New stages length:", len(new_stages))

save_stages(STAGES_DB, new_stages)

conn = sqlite3.connect('/app/data/saga.sqlite3')
count = conn.execute('SELECT count(*) FROM stages').fetchone()[0]
print("After save, SQLite count:", count)
