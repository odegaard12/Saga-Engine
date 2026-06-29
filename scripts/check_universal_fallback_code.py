from pathlib import Path

admin = Path("frontend/src/admin/components/NodeDetailDrawer.tsx").read_text(encoding="utf-8")
physical = Path("frontend/src/admin/components/NodePhysicalTypePanel.tsx").read_text(encoding="utf-8")
hud = Path("frontend/src/player/components/PlayerHud.tsx").read_text(encoding="utf-8")
quickproof = Path("frontend/src/player/components/QuickProofPanel.tsx").read_text(encoding="utf-8")
mission = Path("frontend/src/player/offline/missionPack.ts").read_text(encoding="utf-8")
map_surface = Path("frontend/src/player/components/MapSurface.tsx").read_text(encoding="utf-8")
player_app = Path("frontend/src/player/PlayerApp.tsx").read_text(encoding="utf-8")

checks = {
    "admin": (admin, ["Código fallback", "success_code", "buildFallbackCodeForStage"]),
    "physical": (physical, ["Código fallback", "buildFallbackCodeForPhysicalStage", "success_code"]),
    "hud": (hud, ["Fallback de nodo", "CÓDIGO FALLBACK", "onSubmitCode", "handleToolsFallbackSubmit"]),
    "offline": (mission, ["advanceLocalProgress", "stageAcceptsLocalCode", "success_code", "node_completed"]),
    "map": (map_surface, ["!debugSimulation", "onDebugSetPosition"]),
    "player_app": (player_app, ["normalizedTone", "if (nextState !== 'finish') return"]),
}

missing = []
for name, pair in checks.items():
    source, items = pair
    for item in items:
        if item not in source:
            missing.append(f"{name}:{item}")

if "CÓDIGO FALLBACK" in quickproof or "Código fallback" in quickproof or "onSubmitCode" in quickproof:
    missing.append("quickproof:must_not_have_fallback_ui")

if missing:
    raise SystemExit("Universal fallback guard failed: " + ", ".join(missing))

print("Universal fallback guard passed.")
