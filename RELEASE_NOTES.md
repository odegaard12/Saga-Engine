# SAGA Engine v1.0.1 — iOS Polish and Documentation update

SAGA Engine v1.0.1 addresses post-launch polish feedback, specifically targeting iOS Safari rendering artifacts and iPhone full-screen display issues, alongside documentation corrections.

## iOS Map Flickering Fixes
- Added `translate3d` and `translateZ(0)` hardware acceleration to Leaflet markers and overlays in `MapSurface.tsx`.
- Removed layout-thrashing CSS filters (`drop-shadow`) from animated route guides, replacing them with GPU-friendly offset animations.
- The map tile layer no longer repaints/blinks when CSS keyframes cycle.

## iPhone Display Edges
- Set the root `html` and `body` background colors to Slate 900 (`#020617`). This perfectly hides the top and bottom swipe safe-areas on edge-to-edge mobile devices (like iPhones), maintaining the immersive app feel.

## UI Transitions
- Upgraded `PlayerLayout.tsx` overlays to use 3D scaling and hardware hints (`will-change: transform, opacity`), ensuring 120 FPS capable UI pops and fade-ins.

## Documentation
- Cleared legacy "Tema de Juegos" mentions from `README.md`.
- Restricted the official Minigames list to the 4 confirmed stable families.
- Restricted the physical QR types strictly to Objeto QR, Llave QR, Pista QR, and Bonus Oculto.
