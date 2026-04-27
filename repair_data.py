import json
from pathlib import Path

DATA_DIR = Path("data")
STAGES_PATH = DATA_DIR / "stages.json"
GAMESTATE_PATH = DATA_DIR / "gamestate.json"
POSITIONS_PATH = DATA_DIR / "positions.json"

DEFAULT_STAGE = {
    "id": 0,
    "title": "SIGNAL HUNT TEST NODE",
    "lat": 40.42839425751665,
    "lon": -3.7320256233215336,
    "radius": 75,
    "type": "signal_hunt",
    "content": "Acércate a la fuente hasta bloquear la señal.",
    "config": {
        "objective": "proximity_lock",
        "source_lat": 40.42839425751665,
        "source_lon": -3.7320256233215336,
        "source_radius_m": 75,
        "lock_threshold": 65,
        "hold_ms": 1500,
        "max_signal": 100,
        "noise_floor": 4,
        "jitter": 2,
        "decay_curve": "smooth",
        "timeout_ms": None,
        "update_rate_ms": 500,
        "use_audio": False,
        "use_vibration": True,
        "use_direction_hint": False,
        "false_peaks": [],
        "dead_zones": [],
    },
    "answer": "",
    "rune": "",
    "minigame": {
        "type": "signal_hunt",
        "label": "Signal Hunt",
        "version": "v1",
        "config": {
            "objective": "proximity_lock",
            "source_lat": 40.42839425751665,
            "source_lon": -3.7320256233215336,
            "source_radius_m": 75,
            "lock_threshold": 65,
            "hold_ms": 1500,
            "max_signal": 100,
            "noise_floor": 4,
            "jitter": 2,
            "decay_curve": "smooth",
            "timeout_ms": None,
            "update_rate_ms": 500,
            "use_audio": False,
            "use_vibration": True,
            "use_direction_hint": False,
            "false_peaks": [],
            "dead_zones": [],
        },
    },
    "messages": {
        "locked": "Señal capturada.",
        "gps_unavailable": "GPS no disponible.",
        "hint": "Acércate a la fuente hasta bloquear la señal.",
    },
}


def write_json(path: Path, value: object) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    try:
        existing = json.loads(STAGES_PATH.read_text(encoding="utf-8")) if STAGES_PATH.exists() else None
    except Exception:
        existing = None

    if not isinstance(existing, list) or not existing:
        write_json(STAGES_PATH, [DEFAULT_STAGE])
        print(f"Repaired missing/invalid stages: {STAGES_PATH}")
    else:
        print(f"Stages already valid: {STAGES_PATH}")

    for path in (GAMESTATE_PATH, POSITIONS_PATH):
        if not path.exists():
            path.write_text("{}\n", encoding="utf-8")
            print(f"Created missing file: {path}")
        else:
            print(f"File already exists: {path}")


if __name__ == "__main__":
    main()
