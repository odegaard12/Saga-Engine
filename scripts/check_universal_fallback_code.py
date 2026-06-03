from pathlib import Path

admin = Path("frontend/src/admin/components/NodeDetailDrawer.tsx").read_text(encoding="utf-8")
player = Path("frontend/src/player/components/InteractionSheet.tsx").read_text(encoding="utf-8")
hud = Path("frontend/src/player/components/PlayerHud.tsx").read_text(encoding="utf-8")
quickproof = Path("frontend/src/player/components/QuickProofPanel.tsx").read_text(encoding="utf-8")
mission = Path("frontend/src/player/offline/missionPack.ts").read_text(encoding="utf-8")
physical = Path("frontend/src/admin/components/NodePhysicalTypePanel.tsx").read_text(encoding="utf-8")

checks = {
    "admin": (admin, ["Código fallback", "success_code", "buildFallbackCodeForStage"]),
    "player": (player, ["Fallback", "Código de emergencia offline", "CÓDIGO FALLBACK", "Completar"]),
    "hud": (hud, ["Fallback de nodo", "CÓDIGO FALLBACK", "onSubmitCode", "handleToolsFallbackSubmit"]),
    "offline": (mission, ["advanceLocalProgress", "stageAcceptsLocalCode", "success_code", "node_completed"]),
    "physical": (physical, ["Código fallback", "buildFallbackCodeForPhysicalStage", "updatePhysicalFallbackCode", "success_code"]),
}

missing = []

for name, pair in checks.items():
    source, items = pair
    for item in items:
        if item not in source:
            missing.append(f"{name}:{item}")

if missing:
    raise SystemExit("Universal fallback guard failed: " + ", ".join(missing))

print("Universal fallback guard passed.")


if "data-saga-qr-fallback-top" in quickproof or "CÓDIGO FALLBACK" in quickproof or "Código fallback" in quickproof:
    raise SystemExit("QuickProofPanel must not contain fallback UI; fallback lives in Herramientas.")
