from __future__ import annotations

import re
from pathlib import Path

src = Path("frontend/src/admin/lib/gameCatalog.ts").read_text(encoding="utf-8")

planned_games = set()

for match in re.finditer(r"\{\s*id:\s*'([^']+)'[\s\S]*?runtimeStatus:\s*'([^']+)'[\s\S]*?offlineStatus:\s*'([^']+)'[\s\S]*?\n\s*\}", src):
    game_id, runtime_status, offline_status = match.groups()
    if runtime_status == "planned" or offline_status == "offline_planned":
        planned_games.add(game_id)

templates_start = src.find("export const missionTemplates")
if templates_start < 0:
    raise SystemExit("missionTemplates not found")

templates_src = src[templates_start:]
used_games = re.findall(r"gameId:\s*'([^']+)'", templates_src)

bad = [game_id for game_id in used_games if game_id in planned_games]

if bad:
    raise SystemExit(
        "Templates reference planned games: " + ", ".join(sorted(set(bad)))
    )

print(f"Playable template guard passed ({len(used_games)} template stages checked).")
