# Team presence cache

SAGA Engine targets outdoor games where connectivity can be weak or intermittent.

The player should not lose all team visibility just because one `/api/team/{user}` request fails.

## Current foundation

The frontend includes:

`frontend/src/player/offline/teamPresence.ts`

It provides:

- cached team presence payloads
- localStorage persistence
- cache age handling
- stale/offline normalization
- merge helper for live and cached profiles

`PlayerApp` now caches successful team status responses and falls back to cached profiles when team status loading fails.

## Behavior

When the network is healthy:

- `/api/team/{user}` returns live profiles
- profiles are cached locally
- the Team panel shows live/stale/offline presence from the backend

When the network fails:

- the player keeps the last cached team profiles
- previously live/stale players are shown as `stale`
- old or missing profiles are treated as offline
- the team list does not disappear immediately

## Limits

This does not provide real-time multiplayer without any network.

It gives the player a resilient last-known team view under poor coverage. True local real-time presence without the server would require a separate local transport layer such as Bluetooth, LAN/WebRTC, Meshtastic or another mesh layer.

## Safety

Cached team presence is gameplay runtime state.

Do not store secrets, admin passwords, private tokens or sensitive personal data in team presence payloads.
