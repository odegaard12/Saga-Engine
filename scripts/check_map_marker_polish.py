#!/usr/bin/env python3
from pathlib import Path
R=Path(__file__).resolve().parents[1]
player=(R/'frontend/src/player/PlayerApp.tsx').read_text(encoding="utf-8")
map_surface=(R/'frontend/src/player/components/MapSurface.tsx').read_text(encoding="utf-8")
hud=(R/'frontend/src/player/components/PlayerHud.tsx').read_text(encoding="utf-8")
offline=(R/'frontend/src/player/components/MissionPackPanel.tsx').read_text(encoding="utf-8")
pwa=(R/'frontend/src/player/offline/pwaShell.ts').read_text(encoding="utf-8"); sw=(R/'frontend/public/sw.js').read_text(encoding="utf-8")
a=player.find('function getBottomOverlayStyle('); b=player.find('\n}\n',a)
if a<0 or b<0 or 'bottom: mobile ? 0 : 12' not in player[a:b+2]: raise SystemExit('barra inferior')
for token in ["index < activeIndex","index === activeIndex","const halo = state === 'current'","getPhysicalNodeTypeIconSvg","router.project-osrm.org/route/v1/driving","writeRoadRouteCache"]:
    if token not in map_surface: raise SystemExit(f'falta {token}')
for token in ['saga-mission-node-state-badge','const ghostRadius',"icon: '\\u{1F512}"]:
    if token in map_surface: raise SystemExit(f'permanece {token}')
if 'Offline, fotos y ayuda' not in hud or 'CENTRO DE CAMPO' in hud: raise SystemExit('cabecera herramientas')
if 'Juego offline' not in offline or 'Preparar juego offline' not in offline or 'cacheFieldProofAssets' not in offline: raise SystemExit('offline')
cache='saga-player-shell-v550-rpg-viewfinder'
if cache not in pwa or cache not in sw: raise SystemExit('cache')
print('Bottom bar, node states, routing and tools guard passed.')
