import json
import sqlite3
import urllib.parse
from datetime import datetime
import os

DB_PATH = '/app/data/saga.sqlite3'

def fix_config_encoding():
    print("Fixing config encoding...")
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute("SELECT value_json FROM app_documents WHERE key = 'config' LIMIT 1").fetchone()
    if row and row[0]:
        try:
            cfg = json.loads(row[0])
            cfg["login_subtitle"] = "Misión de Campo"
            cfg["site_name"] = "SAGA Engine"
            conn.execute("UPDATE app_documents SET value_json = ? WHERE key = 'config'", (json.dumps(cfg),))
            conn.commit()
            print("Config updated.")
        except Exception as e:
            print(f"Error parsing config: {e}")
    else:
        print("No config document found to fix.")
    conn.close()


def generate_nodes():
    print("Generating 10 nodes...")
    nodes = [
        {
            "title": "1. O Vértice Inicial (Parking)",
            "lat": 42.36390658474425,
            "lon": -8.675606236105482,
            "type": "info",
            "content": "Punto de partida y sincronización de equipos. Pulsa EMPEZAR para comenzar.",
            "config": None,
            "id": 1,
            "enabled": True,
            "radius": None
        },
        {
            "title": "2. Pista Este (O Camiño Novo)",
            "lat": 42.361000,
            "lon": -8.667000,
            "type": "circuit_matrix",
            "content": "Supera el circuito lógico para restaurar la energía.",
            "config": {
                "objective": "path_restore",
                "game_id": "logic_circuit",
                "completion_method": "puzzle",
                "grid_cols": 5,
                "grid_rows": 5,
                "difficulty": "normal",
                "pattern_mode": "random_each_game"
            },
            "id": 2,
            "enabled": True,
            "radius": 20
        },
        {
            "title": "3. Chan de Castiñeiras",
            "lat": 42.35960555353139,
            "lon": -8.672355447137351,
            "type": "signal_hunt",
            "content": "Has encontrado un objeto abandonado. Recógelo.",
            "config": {
                "objective": "physical_collectible",
                "completion_method": "inventory_only",
                "game_id": "simple_checkpoint"
            },
            "physical_node_kind": "collectible",
            "physical_item_id": "chip_encriptado",
            "id": 3,
            "enabled": True,
            "radius": 20
        },
        {
            "title": "4. O Eco dos Reis (Mámoa del Rey)",
            "lat": 42.35840656643265,
            "lon": -8.67258908389772,
            "type": "circuit_matrix",
            "content": "Descifra el código secuencial de la antena.",
            "config": {
                "objective": "sequence_order",
                "game_id": "sequence_code",
                "completion_method": "sequence",
                "difficulty": "hard",
                "pattern_mode": "random_each_game"
            },
            "id": 4,
            "enabled": True,
            "radius": 20
        },
        {
            "title": "5. O Xardín (Botánico)",
            "lat": 42.361185,
            "lon": -8.676474,
            "type": "signal_hunt",
            "content": "Has encontrado un objeto abandonado. Recógelo.",
            "config": {
                "objective": "physical_collectible",
                "completion_method": "inventory_only",
                "game_id": "simple_checkpoint"
            },
            "physical_node_kind": "collectible",
            "physical_item_id": "antena_frecuencia",
            "id": 5,
            "enabled": True,
            "radius": 20
        },
        {
            "title": "6. A Visión (Mirador Pinga Pinga)",
            "lat": 42.35206013317765,
            "lon": -8.67355081121013,
            "type": "circuit_matrix",
            "content": "Reconstruye el mosaico para despejar el camino.",
            "config": {
                "objective": "path_restore",
                "game_id": "place_mosaic",
                "completion_method": "puzzle",
                "difficulty": "normal",
                "pattern_mode": "random_each_game"
            },
            "id": 6,
            "enabled": True,
            "radius": 20
        },
        {
            "title": "7. O Núcleo (Mirador de Cotorredondo)",
            "lat": 42.3532789139366,
            "lon": -8.675665385750393,
            "type": "signal_hunt",
            "content": "Escanea el código QR escondido en el mirador.",
            "config": {
                "objective": "physical_collectible",
                "completion_method": "inventory_only",
                "game_id": "qr_collectible"
            },
            "physical_node_kind": "bonus",
            "physical_item_id": "pista_bonus",
            "entry_mode": "qr",
            "id": 7,
            "enabled": True,
            "radius": 20
        },
        {
            "title": "8. Sendero del Oeste (O Paso Escuro)",
            "lat": 42.355500,
            "lon": -8.683500,
            "type": "signal_hunt",
            "content": "Has encontrado un objeto abandonado. Recógelo.",
            "config": {
                "objective": "physical_collectible",
                "completion_method": "inventory_only",
                "game_id": "simple_checkpoint"
            },
            "physical_node_kind": "collectible",
            "physical_item_id": "bateria_litio",
            "id": 8,
            "enabled": True,
            "radius": 20
        },
        {
            "title": "9. A Pedra Antiga (Mámoa Penalonga)",
            "lat": 42.35742918809162,
            "lon": -8.677914867138097,
            "type": "motion_challenge",
            "content": "Inclina tu dispositivo para superar el laberinto físico.",
            "config": {
                "objective": "shake_charge",
                "game_id": "tilt_maze",
                "completion_method": "motion",
                "difficulty": "normal",
                "pattern_mode": "random_each_game"
            },
            "id": 9,
            "enabled": True,
            "radius": 20
        },
        {
            "title": "10. O Peche (Meta en el Lago)",
            "lat": 42.36296536346519,
            "lon": -8.67393525063518,
            "type": "signal_hunt",
            "content": "Escanea el QR de la puerta. (Requiere Decodificador Cuántico crafteado).",
            "config": {
                "objective": "physical_collectible",
                "completion_method": "inventory_only",
                "game_id": "qr_key_gate"
            },
            "physical_node_kind": "requirement",
            "physical_item_id": "decodificador_cuantico",
            "entry_mode": "qr",
            "id": 10,
            "enabled": True,
            "radius": 20
        }
    ]

    with open('/app/data/stages.json', 'w') as f:
        json.dump(nodes, f, indent=2)

    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM stages")
    now = datetime.now().isoformat()
    for index, stage in enumerate(nodes):
        conn.execute(
            "INSERT INTO stages (idx, stage_json, updated_at) VALUES (?, ?, ?)",
            (index, json.dumps(stage), now),
        )
    conn.commit()
    conn.close()
    print("Regenerated 10 nodes.")

if __name__ == '__main__':
    fix_config_encoding()
    generate_nodes()
