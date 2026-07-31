import json
import os

STAGES = [
    {
        "id": "node-1",
        "title": "Aparcamiento (Inicio)",
        "type": "checkpoint",
        "radius": 50,
        "lat": 42.36385557356727,
        "lon": -8.675671029319153,
        "enabled": True,
        "content": "¡Bienvenidos a Chan de Castiñeiras! Sincronizad vuestros dispositivos antes de comenzar el ascenso. La aventura hacia la leyenda comienza aquí.",
        "fallback_code": "START",
        "config": {
            "game_id": "simple_checkpoint"
        }
    },
    {
        "id": "node-2",
        "title": "Campo de Tiro",
        "type": "tilt_maze",
        "radius": 40,
        "lat": 42.359827579491224,
        "lon": -8.680027261195608,
        "enabled": True,
        "content": "Las antiguas piedras megalíticas resuenan. Un fuego fatuo debe ser guiado a través del laberinto para liberar la energía.",
        "fallback_code": "TIRO",
        "config": {
            "game_id": "tilt_maze",
            "objective": "Guía el fuego sagrado",
            "difficulty": "normal"
        }
    },
    {
        "id": "node-3",
        "title": "Mirador Cotorredondo",
        "type": "checkpoint",
        "radius": 50,
        "lat": 42.35315703679144,
        "lon": -8.675034729651735,
        "enabled": True,
        "content": "¡Coronáis la cima de Cotorredondo! Escanea el código QR físico SAGA_01 fijado en la estructura de la torre.",
        "fallback_code": "SAGA_01",
        "physical_node_kind": "qr",
        "physical_item_kind": "qr",
        "qr_payload": "SAGA1:ITEM:saga_01:SAGA_01",
        "physical_item_id": "saga_01",
        "physical_item_label": "SAGA_01",
        "success_code": "SAGA_01",
        "config": {
            "game_id": "qr_collectible",
            "objective": "physical_collectible",
            "completion_method": "inventory_only",
            "success_code": "SAGA_01"
        },
        "physical_qr": {
            "item_id": "saga_01",
            "label": "SAGA_01",
            "kind": "collectible",
            "payload": "SAGA1:ITEM:saga_01:SAGA_01",
            "card_text": "⭐ SAGA_01\nColeccionable\nEscanea esta tarjeta en SAGA."
        }
    },
    {
        "id": "node-4",
        "title": "Mirador Pinga Pinga",
        "type": "checkpoint",
        "radius": 40,
        "lat": 42.35199232091336,
        "lon": -8.674693315793858,
        "enabled": True,
        "content": "Encuentras un objeto oculto en la base del mirador. Recoge la Cinta Aislante para tu inventario.",
        "fallback_code": "PINGA",
        "inventory_item": "cinta_aislante",
        "physical_node_kind": "collectible",
        "physical_item_id": "cinta_aislante",
        "physical_item_label": "Cinta Aislante",
        "physical_item_kind": "collectible",
        "config": {
            "game_id": "simple_checkpoint"
        }
    },
    {
        "id": "node-5",
        "title": "Necrópole Chan de Castiñeiras",
        "type": "place_mosaic",
        "radius": 40,
        "lat": 42.35979465430785,
        "lon": -8.670919274118114,
        "enabled": True,
        "content": "Entre las sepulturas ancestrales yacen fragmentos de piedra. Reconstruye el mosaico para descifrar el mensaje.",
        "fallback_code": "NECROPOLE",
        "config": {
            "game_id": "place_mosaic",
            "objective": "Encaja las piezas de la estela",
            "difficulty": "normal",
            "image_url": "/media/losa_mosaic.jpg"
        }
    },
    {
        "id": "node-6",
        "title": "Mirador de Taaoira",
        "type": "checkpoint",
        "radius": 50,
        "lat": 42.3538127956757,
        "lon": -8.659568530496006,
        "enabled": True,
        "content": "En este impresionante mirador hacia la ría se ubica la baliza de Taaoira. Escanea el código QR físico SAGA_02 para validar este punto.",
        "fallback_code": "SAGA_02",
        "physical_node_kind": "qr",
        "physical_item_kind": "qr",
        "qr_payload": "SAGA1:ITEM:saga_02:SAGA_02",
        "physical_item_id": "saga_02",
        "physical_item_label": "SAGA_02",
        "success_code": "SAGA_02",
        "config": {
            "game_id": "qr_collectible",
            "objective": "physical_collectible",
            "completion_method": "inventory_only",
            "success_code": "SAGA_02"
        },
        "physical_qr": {
            "item_id": "saga_02",
            "label": "SAGA_02",
            "kind": "collectible",
            "payload": "SAGA1:ITEM:saga_02:SAGA_02",
            "card_text": "⭐ SAGA_02\nColeccionable\nEscanea esta tarjeta en SAGA."
        }
    },
    {
        "id": "node-7",
        "title": "Mámoa do Rei",
        "type": "sequence_code",
        "radius": 40,
        "lat": 42.358334419415435,
        "lon": -8.672795539875196,
        "enabled": True,
        "content": "Las marcas en las rocas del sur guardan una clave secreta. Introduce los glifos en el orden correcto.",
        "fallback_code": "MAMOA_REI",
        "config": {
            "game_id": "sequence_code",
            "objective": "Descifrar secuencia rúnica",
            "sequence": ["Sol", "Lúa", "Estrela"]
        }
    },
    {
        "id": "node-8",
        "title": "Necrópole megalítica de Chan de Castiñeiras",
        "type": "checkpoint",
        "radius": 40,
        "lat": 42.35965222138252,
        "lon": -8.672192938532133,
        "enabled": True,
        "content": "Entre los restos megalíticos encuentras un objeto brillante. Recoge la Llave Rota para tu inventario.",
        "fallback_code": "NECRO_LLAVE",
        "inventory_item": "llave_rota",
        "physical_node_kind": "collectible",
        "physical_item_id": "llave_rota",
        "physical_item_label": "Llave Rota",
        "physical_item_kind": "collectible",
        "config": {
            "game_id": "simple_checkpoint"
        }
    },
    {
        "id": "node-9",
        "title": "Lagoa Castiñeiras",
        "type": "circuit_matrix",
        "radius": 40,
        "lat": 42.363315573292326,
        "lon": -8.67451266508795,
        "enabled": True,
        "content": "El conducto del lago necesita vuestra ayuda. Reconecta los conductos del circuito de agua.",
        "fallback_code": "LAGOA",
        "config": {
            "game_id": "logic_circuit",
            "objective": "Reconstruir circuito de agua",
            "grid_cols": 4,
            "grid_rows": 4,
            "difficulty": "normal"
        }
    },
    {
        "id": "node-10",
        "title": "Botánico (Final)",
        "type": "checkpoint",
        "radius": 50,
        "lat": 42.36118830001845,
        "lon": -8.676303518832126,
        "enabled": True,
        "content": "¡Habéis llegado al final! Ahora abre la Mochila y usa la Mesa de Trabajo para combinar la Cinta Aislante y la Llave Rota para obtener la Llave Maestra. ¡Aquí acaba la historia!",
        "fallback_code": "FIN",
        "config": {
            "game_id": "simple_checkpoint"
        }
    }
]

def generate():
    os.makedirs("data", exist_ok=True)
    for idx, stage in enumerate(STAGES):
        stage["index"] = idx
        
    with open("data/stages.json", "w", encoding="utf-8") as f:
        json.dump(STAGES, f, indent=2, ensure_ascii=False)
    print(f"Ruta circular de {len(STAGES)} nodos generada correctamente en data/stages.json")

if __name__ == "__main__":
    generate()
