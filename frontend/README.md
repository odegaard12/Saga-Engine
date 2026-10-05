# SAGA Engine — frontend

React 18 + TypeScript + Vite. Tres aplicaciones en un mismo build:

- `src/login/`: elección de jugador.
- `src/player/`: el jugador (mapa MapLibre 3D, HUD, hojas, minijuegos, modo sin cobertura, avatares).
- `src/admin/`: el panel de administración.

```bash
npm ci
npm run dev      # http://localhost:5173, con proxy al servidor (SAGA_DEV_BACKEND_URL, por defecto 127.0.0.1:8097)
npm run build    # tsc -b + vite build → dist/ (incluye dist/player-precache.json)
npx eslint src
```

El service worker está en `public/sw.js`. La arquitectura, el modo sin cobertura y cómo arrancar el
servidor están en el [README principal](../README.md).
