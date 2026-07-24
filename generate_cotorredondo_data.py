import json

config = {
    "site_name": "SAGA Engine",
    "admin_title": "O Ocaso de Cristal",
    "admin_subtitle": "Control Místico de Misión",
    "ui_lang": "gl",
    "player_theme": "glassmorphism",
    "story_title": "O Ocaso de Cristal",
    "story_text": "Unha luz emerxe do interior da terra. Unha antiga maquinaria esperta. O Vixía clama por protección.",
    "prologue_title": "PRÓLOGO: A LUZ REVELADA",
    "prologue_subtitle": "O Camiño cara o Monte",
    "prologue_body": "O faro foi aceso, pero o seu raio desvelou un perigo maior: 'O Núcleo Selado'. Esta noite, deberedes percorrer o Monte Cotorredondo e recoller as luces dispersas antes de que a escuridade gane.\n\nPreparádevos para unha proba física e mental na ladeira leste.",
    "map_center": [42.3643, -8.6785],
    "map_zoom": 14,
    "mapbox_style": "",
    "players": ["PLAYER 1", "PLAYER 2", "PLAYER 3", "PLAYER 4"],
    "player_profiles": [
        {
            "id": "PLAYER 1",
            "display_name": "Explorador 1",
            "mode": "solo",
            "members": ["Explorador 1"],
            "status": "active"
        },
        {
            "id": "PLAYER 2",
            "display_name": "Explorador 2",
            "mode": "solo",
            "members": ["Explorador 2"],
            "status": "active"
        },
        {
            "id": "PLAYER 3",
            "display_name": "Explorador 3",
            "mode": "solo",
            "members": ["Explorador 3"],
            "status": "active"
        },
        {
            "id": "PLAYER 4",
            "display_name": "Explorador 4",
            "mode": "solo",
            "members": ["Explorador 4"],
            "status": "active"
        }
    ]
}

stages = [
    {
        "id": "node-1",
        "title": "O Vértice Inicial (Lago)",
        "type": "checkpoint",
        "radius": 40,
        "lat": 42.3585,
        "lon": -8.6740,
        "intro_title": "O Vértice Inicial",
        "intro_body": "Atopádesvos no Lago de Castiñeiras. A auga reflicte unha estraña luz no ceo. A misión comeza aquí.",
        "success_title": "Rexistro completado",
        "success_body": "O dispositivo está sincronizado. Seguid cara a Cotorredondo."
    },
    {
        "id": "node-2",
        "title": "A Orde Oculta",
        "type": "sequence_code",
        "radius": 40,
        "lat": 42.3600,
        "lon": -8.6720,
        "intro_body": "Atopades uns símbolos marcados nas árbores do camiño. Cal é a secuencia correcta?",
        "solution_sequence": ["Lúa", "Sol", "Estrela"],
        "success_body": "Secuencia correcta! O camiño ábrese."
    },
    {
        "id": "node-3",
        "title": "Pegadas Antigas (Mámoas)",
        "type": "checkpoint",
        "radius": 40,
        "lat": 42.3615,
        "lon": -8.6690,
        "intro_body": "Chegades a Chan de Armada. Aquí xacen os antigos, vixiando desde as sombras.",
        "success_body": "Sodes dignos de continuar."
    },
    {
        "id": "node-4",
        "title": "O Prisma de Síntese",
        "type": "circuit_matrix",
        "radius": 40,
        "lat": 42.3630,
        "lon": -8.6670,
        "intro_body": "Un panel de control ancestral bloquea a vosa ruta. Restaurade o fluxo de enerxía.",
        "grid_size": 4,
        "time_limit_ms": 300000,
        "success_body": "Enerxía restaurada! O panel ábrese."
    },
    {
        "id": "node-5",
        "title": "Mosaico da Memoria",
        "type": "image_puzzle",
        "radius": 40,
        "lat": 42.3650,
        "lon": -8.6660,
        "intro_body": "Unha lousa fragmentada contén a clave. Reconstruíde a imaxe.",
        "image_url": "/assets/placeholder.jpg",
        "grid_size": 3,
        "success_body": "Imaxe completada! A memoria foi restaurada."
    },
    {
        "id": "node-6",
        "title": "Ascenso Crítico",
        "type": "checkpoint",
        "radius": 40,
        "lat": 42.3670,
        "lon": -8.6655,
        "intro_body": "A pendente faise máis pronunciada. Estades a piques de alcanzar o cumio.",
        "success_body": "Continuade cara o Miradoiro."
    },
    {
        "id": "node-7",
        "title": "O Núcleo Selado (Miradoiro)",
        "type": "circuit_matrix",
        "radius": 40,
        "lat": 42.3695,
        "lon": -8.6650,
        "intro_body": "O Miradoiro de Cotorredondo. Aquí está o Núcleo Selado. Reparade o circuíto mestre para conter a luz.",
        "grid_size": 5,
        "time_limit_ms": 420000,
        "success_body": "O Núcleo está selado. A misión foi un éxito."
    },
    {
        "id": "node-8",
        "title": "Descenso Rápido",
        "type": "checkpoint",
        "radius": 40,
        "lat": 42.3680,
        "lon": -8.6680,
        "intro_body": "O aire vólvese frío. Debedes baixar rapidamente antes de que a neboa vos atrape.",
        "success_body": "Fuxides da neboa con éxito."
    },
    {
        "id": "node-9",
        "title": "A Derradeira Chave",
        "type": "sequence_code",
        "radius": 40,
        "lat": 42.3650,
        "lon": -8.6710,
        "intro_body": "O último obstáculo. Unha porta electrónica bloquea o camiño de volta.",
        "solution_sequence": ["Alpha", "Beta", "Omega"],
        "success_body": "Porta desbloqueada. Estades case fóra."
    },
    {
        "id": "node-10",
        "title": "Fin da Ruta",
        "type": "checkpoint",
        "radius": 40,
        "lat": 42.3605,
        "lon": -8.6745,
        "intro_body": "Regresades ao lago. A noite é tranquila e o ceo volve estar escuro.",
        "success_body": "Noraboa. Rematastes a aventura."
    }
]

with open("config.json", "w", encoding="utf-8") as f:
    json.dump(config, f, ensure_ascii=False, indent=2)

with open("stages.json", "w", encoding="utf-8") as f:
    json.dump(stages, f, ensure_ascii=False, indent=2)

print("Archivos generados correctamente.")
