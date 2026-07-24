import sys
import json
import sqlite3
import os
sys.path.append('/app')
from backend.app.storage.runtime_store import save_stages
from main import STAGES_DB

print('STAGES_DB IS:', STAGES_DB)

with open('cotorredondo_expanded_route.json', 'r') as f:
    new_stages = json.load(f)

save_stages(STAGES_DB, new_stages)

with open('/app/data/stages.json', 'r') as f:
    updated = json.load(f)
print('JSON LENGTH AFTER SAVE:', len(updated))

conn = sqlite3.connect('/app/data/saga.sqlite3')
count = conn.execute('SELECT count(*) FROM stages').fetchone()[0]
print('SQLITE COUNT AFTER SAVE:', count)
