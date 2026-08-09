# Admin language toggle

SAGA Engine includes a small EN/ES language toggle on `/admin-react`.

It uses the frontend i18n foundation:

- `getLocale()`
- `setLocale()`
- `t()`
- `localStorage`
- `saga:locale-change`

Scope:

- admin toggle only
- no backend changes
- no gameplay changes
- no service worker
- no changes to `data/stages.json`

This PR does not migrate all UI copy yet. Later PRs should move visible admin/player strings to `t()` gradually.
