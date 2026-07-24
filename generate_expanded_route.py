import json
import math

def get_distance(a, b):
    earthRadius = 6371e3
    dLat = math.radians(b['lat'] - a['lat'])
    dLon = math.radians(b['lon'] - a['lon'])
    lat1 = math.radians(a['lat'])
    lat2 = math.radians(b['lat'])
    sinLat = math.sin(dLat / 2)
    sinLon = math.sin(dLon / 2)
    h = sinLat * sinLat + math.cos(lat1) * math.cos(lat2) * sinLon * sinLon
    return 2 * earthRadius * math.asin(math.sqrt(h))

nodes = [
    {'title': '1. O Vértice Inicial (Parking)', 'lat': 42.36390658474425, 'lon': -8.675606236105482, 'type': 'signal_hunt', 'content': 'Punto de partida.', 'config': {'objective': 'proximity_lock', 'source_radius_m': 50, 'lock_threshold': 80, 'hold_ms': 2000}},
    {'title': '2. Pista Este (O Camiño Novo)', 'lat': 42.3610, 'lon': -8.6670, 'type': 'sequence_code', 'content': 'Expansión de la ruta hacia el este.', 'config': {}},
    {'title': '3. Chan de Castiñeiras', 'lat': 42.35960729026636, 'lon': -8.672362750550617, 'type': 'qr_collectible', 'content': 'Chan de Castiñeiras.', 'config': {}},
    {'title': '4. O Eco dos Reis (Mámoa do Rei)', 'lat': 42.35841320822578, 'lon': -8.672592531294635, 'type': 'signal_hunt', 'content': 'Mámoa do Rei.', 'config': {'objective': 'proximity_lock', 'source_radius_m': 50, 'lock_threshold': 80, 'hold_ms': 2000}},
    {'title': '5. Frontera Sur (As Pistas Baixas)', 'lat': 42.3495, 'lon': -8.6705, 'type': 'place_mosaic', 'content': 'Expansión sur de la ruta.', 'config': {}},
    {'title': '6. A Visión (Mirador Pinga Pinga)', 'lat': 42.35206218310527, 'lon': -8.673549408404124, 'type': 'sequence_code', 'content': 'Mirador Pinga Pinga.', 'config': {}},
    {'title': '7. O Núcleo (Mirador de Cotorredondo)', 'lat': 42.353277450383224, 'lon': -8.6756736173489, 'type': 'signal_hunt', 'content': 'Mirador Cotorredondo.', 'config': {'objective': 'hot_cold', 'source_radius_m': 30}},
    {'title': '8. Sendero del Oeste (O Paso Escuro)', 'lat': 42.3555, 'lon': -8.6835, 'type': 'qr_collectible', 'content': 'Expansión oeste de la ruta.', 'config': {}},
    {'title': '9. A Pedra Antiga (Mámoa Penalonga)', 'lat': 42.35743149889827, 'lon': -8.67790937365922, 'type': 'place_mosaic', 'content': 'Mámoa Penalonga.', 'config': {}},
    {'title': '10. O Arsenal (Campo de Tiro)', 'lat': 42.3598416068983, 'lon': -8.680441378871944, 'type': 'signal_hunt', 'content': 'Campo de Tiro.', 'config': {'objective': 'hot_cold', 'source_radius_m': 40}},
    {'title': '11. Enlace Norte (A Senda Alta)', 'lat': 42.3665, 'lon': -8.6820, 'type': 'sequence_code', 'content': 'Expansión norte.', 'config': {}},
    {'title': '12. O Xardín (Botánico)', 'lat': 42.36118550155469, 'lon': -8.676474493468163, 'type': 'place_mosaic', 'content': 'Botánico.', 'config': {}},
    {'title': '13. O Prisma de Síntese (Mesa de Trabajo)', 'lat': 42.362085, 'lon': -8.675204, 'type': 'qr_collectible', 'content': 'Mesa de Trabajo.', 'config': {}},
    {'title': '14. O Peche (Meta en el Lago)', 'lat': 42.36296536346519, 'lon': -8.67393525063518, 'type': 'signal_hunt', 'content': 'Meta en el Lago.', 'config': {'objective': 'proximity_lock', 'source_radius_m': 50, 'lock_threshold': 80, 'hold_ms': 2000}}
]

total = 0
for i in range(len(nodes) - 1):
    total += get_distance(nodes[i], nodes[i+1])

print(f"Total straight-line distance: {total/1000:.2f} km")
print(f"Estimated walking distance: {(total*1.4)/1000:.2f} km")

for i, node in enumerate(nodes):
    node['id'] = i + 1
    node['enabled'] = True
    node['radius'] = 15

with open("cotorredondo_expanded_route.json", "w", encoding="utf-8") as f:
    json.dump(nodes, f, indent=2, ensure_ascii=False)
