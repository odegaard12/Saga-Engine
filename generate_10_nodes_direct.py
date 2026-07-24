import json
import sqlite3
from datetime import datetime

nodes = [
    {
        "title": "1. O Vértice Inicial (Parking)",
        "lat": 42.36390658474425,
        "lon": -8.675606236105482,
        "type": "signal_hunt",
        "content": "Punto de partida y sincronización de equipos.",
        "config": {
            "objective": "proximity_lock",
            "game_id": "simple_checkpoint",
            "source_radius_m": 50,
            "lock_threshold": 80,
            "hold_ms": 2000
        },
        "id": 1,
        "enabled": True,
        "radius": 15
    },
    {
        "title": "2. Pista Este (O Camiño Novo)",
        "lat": 42.361000,
        "lon": -8.667000,
        "type": "circuit_matrix",
        "content": "Supera el circuito lógico para obtener el primer componente de la receta secreta.",
        "config": {
            "objective": "path_restore",
            "game_id": "logic_circuit",
            "completion_method": "puzzle",
            "grid_cols": 5,
            "grid_rows": 5,
            "difficulty": "normal",
            "pattern_mode": "random_each_game"
        },
        "physical_node_kind": "collectible",
        "physical_item_id": "chip_encriptado",
        "id": 2,
        "enabled": True,
        "radius": 20
    },
    {
        "title": "3. Chan de Castiñeiras",
        "lat": 42.35960555353139,
        "lon": -8.672355447137351,
        "type": "signal_hunt",
        "content": "Busca y escanea el código QR escondido en los asadores para conseguir la antena.",
        "config": {
            "objective": "physical_collectible",
            "completion_method": "inventory_only",
            "game_id": "qr_collectible"
        },
        "physical_node_kind": "collectible",
        "physical_item_id": "antena_frecuencia",
        "entry_mode": "qr",
        "id": 3,
        "enabled": True,
        "radius": 20
    },
    {
        "title": "4. O Eco dos Reis (Mámoa del Rey)",
        "lat": 42.35840656643265,
        "lon": -8.67258908389772,
        "type": "audio_challenge",
        "content": "Sopla o canta en el micrófono para revelar la batería de litio.",
        "config": {
            "objective": "blow_charge",
            "game_id": "audio_challenge"
        },
        "physical_node_kind": "collectible",
        "physical_item_id": "bateria_litio",
        "id": 4,
        "enabled": True,
        "radius": 20
    },
    {
        "title": "5. Frontera Sur (As Pistas Baixas)",
        "lat": 42.349500,
        "lon": -8.670500,
        "type": "signal_hunt",
        "content": "Escanea el QR en el borde sur para un bonus oculto.",
        "config": {
            "objective": "physical_collectible",
            "completion_method": "inventory_only",
            "game_id": "qr_collectible"
        },
        "physical_node_kind": "bonus",
        "physical_item_id": "pista_bonus",
        "entry_mode": "qr",
        "id": 5,
        "enabled": True,
        "radius": 20
    },
    {
        "title": "6. A Visión (Mirador Pinga Pinga)",
        "lat": 42.35206013317765,
        "lon": -8.67355081121013,
        "type": "circuit_matrix",
        "content": "Descifra el código secuencial de la antena del mirador.",
        "config": {
            "objective": "path_restore",
            "game_id": "sequence_code",
            "completion_method": "puzzle",
            "difficulty": "hard",
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
        "type": "motion_challenge",
        "content": "Agita el dispositivo fuertemente para cargar la energía del núcleo.",
        "config": {
            "objective": "shake_charge",
            "game_id": "shake_antenna_charge",
            "difficulty": "normal",
            "energy_target": 100
        },
        "id": 7,
        "enabled": True,
        "radius": 20
    },
    {
        "title": "8. Sendero del Oeste (O Paso Escuro)",
        "lat": 42.355500,
        "lon": -8.683500,
        "type": "motion_challenge",
        "content": "Inclina tu dispositivo para superar el laberinto físico.",
        "config": {
            "objective": "shake_charge",
            "game_id": "tilt_maze",
            "completion_method": "motion",
            "difficulty": "normal",
            "pattern_mode": "random_each_game"
        },
        "id": 8,
        "enabled": True,
        "radius": 20
    },
    {
        "title": "9. A Pedra Antiga (Mámoa Penalonga)",
        "lat": 42.35742918809162,
        "lon": -8.677914867138097,
        "type": "circuit_matrix",
        "content": "Reconstruye el mosaico del lugar para despejar el camino.",
        "config": {
            "objective": "path_restore",
            "game_id": "place_mosaic",
            "completion_method": "puzzle",
            "difficulty": "normal",
            "pattern_mode": "random_each_game"
        },
        "id": 9,
        "enabled": True,
        "radius": 20
    },
    {
        "title": "10. O Arsenal (Campo de Tiro)",
        "lat": 42.35983803884877,
        "lon": -8.680437434053915,
        "type": "signal_hunt",
        "content": "Abre tu Mochila, craftea el Decodificador Cuántico y avanza a este nodo para terminar la misión.",
        "config": {
            "objective": "proximity_lock",
            "game_id": "simple_checkpoint",
            "source_radius_m": 60,
            "lock_threshold": 90,
            "hold_ms": 1000
        },
        "physical_node_kind": "requirement",
        "physical_item_id": "decodificador_cuantico",
        "id": 10,
        "enabled": True,
        "radius": 20
    }
]

with open('/app/data/stages.json', 'w') as f:
    json.dump(nodes, f, indent=2)

conn = sqlite3.connect('/app/data/saga.sqlite3')
conn.execute("DELETE FROM stages")
now = datetime.utcnow().isoformat()
for index, stage in enumerate(nodes):
    conn.execute(
        "INSERT INTO stages (idx, stage_json, updated_at) VALUES (?, ?, ?)",
        (index, json.dumps(stage), now),
    )
conn.commit()

count = conn.execute("SELECT count(*) FROM stages").fetchone()[0]
print("Updated SQLite to", count, "rows.")
