import sqlite3
import json

conn = sqlite3.connect('/app/data/saga.sqlite3')
rows = conn.execute('SELECT stage_json FROM stages').fetchall()
print("ROWS in DB:", len(rows))

with open('/app/data/stages.json', 'r') as f:
    stages = json.load(f)
print("ROWS in JSON:", len(stages))
