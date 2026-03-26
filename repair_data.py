import json
import os

demo_stages = [
  {
    "id": 0,
    "title": "PUT NODE TITLE HERE",
    "lat": 40.4168,
    "lon": -3.7038,
    "radius": 50,
    "type": "circuit_hack",
    "content": "PUT NODE TEXT HERE",
    "config": {"grid": 4},
    "answer": "",
    "rune": ""
  }
]

try:
    os.makedirs("data", exist_ok=True)
    with open("data/stages.json", "w", encoding="utf-8") as f:
        json.dump(demo_stages, f, indent=2, ensure_ascii=False)
    print("stages.json regenerated")
except Exception as e:
    print(f"error: {e}")

if not os.path.exists("data/gamestate.json"):
    with open("data/gamestate.json", "w", encoding="utf-8") as f:
        f.write("{}")
    print("gamestate.json created")

if not os.path.exists("data/positions.json"):
    with open("data/positions.json", "w", encoding="utf-8") as f:
        f.write("{}")
    print("positions.json created")
