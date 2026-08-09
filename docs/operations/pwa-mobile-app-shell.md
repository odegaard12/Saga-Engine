# PWA mobile app shell

SAGA Engine includes a small mobile app shell for iPhone and Android.

This adds:

- `frontend/public/manifest.webmanifest`
- a public SVG app icon
- mobile theme metadata
- Apple home-screen metadata
- `viewport-fit=cover`
- CSS safe-area variables for notches and dynamic island devices

This PR intentionally does not add a service worker.

Safety boundaries:

- no changes to `data/stages.json`
- no secrets
- no admin password documentation
- no runtime data
- no service worker
- no backend behavior changes
