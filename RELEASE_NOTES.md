# SAGA Engine v0.5.3 — Offline GPS and field map release

SAGA Engine v0.5.3 hardens real-world field missions with a safer GPS startup, clearer node states, a cached road-following guide and a redesigned offline Tools experience.

## Highlights

- Starts from a fresh GPS reading and avoids initial centring on stale coordinates.
- Preserves free map exploration and the compass overview/follow cycle.
- Keeps completed nodes green, the next active node yellow with the only halo, and future locked nodes red.
- Keeps a visible number on every node.
- Uses one compact QR type badge for collectible, key/requirement, clue or bonus roles.
- Adds a high-contrast road-following guide when route geometry is available.
- Caches successful route geometry locally and avoids a misleading straight-line fallback.
- Reorganizes Tools around mission/map download, progress save, connection recovery and synchronization.
- Coordinates the PWA cache as `saga-player-shell-v516-road-guide-tools`.

## Validation

- Marker, routing, offline/GPS and Tools guards.
- Privacy and protected-files guards.
- Runtime contracts inside Docker.
- TypeScript and Vite production build.
- npm audit with zero known vulnerabilities.
- Candidate-first deployment and smoke checks for `/`, `/admin-react` and `/player/PLAYER%201`.

## Known follow-up work

- Field-test routing across urban, rural and mountain missions.
- Add selectable route profiles when supported.
- Store route geometry in downloadable mission packs.
- Continue tuning QR badges and node overlap on real phones.
- Split the large frontend bundle through dynamic imports.
