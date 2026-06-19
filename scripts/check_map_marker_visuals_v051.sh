#!/usr/bin/env bash
set -Eeuo pipefail
M="frontend/src/player/components/MapSurface.tsx"
for token in "#22c55e" "#f4c95d" "#dc4c4c" "getPhysicalNodeTypeIconSvg" "const halo = state === 'current'" "router.project-osrm.org/route/v1/driving" "geometries=geojson" "ROAD_ROUTE_CACHE_PREFIX"; do grep -Fq "$token" "$M" || exit 1; done
for token in "saga-mission-node-state-badge" "const ghostRadius" "physicalVisual?.icon"; do ! grep -Fq "$token" "$M" || exit 1; done
[ "$(sed -n "s/^const PLAYER_SHELL_CACHE = '\([^']*\)'/\1/p" frontend/src/player/offline/pwaShell.ts)" = "saga-player-shell-v516-road-guide-tools" ]
[ "$(sed -n "s/^const CACHE_NAME = '\([^']*\)'/\1/p" frontend/public/sw.js)" = "saga-player-shell-v516-road-guide-tools" ]
echo "Marker semantics and road guide guard passed."
