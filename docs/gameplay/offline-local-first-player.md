# Offline/local-first player core

SAGA Engine targets outdoor games where mobile coverage can be weak or intermittent.

The player must not depend on perfect connectivity.

## Current foundation

The frontend now includes a local-first helper module:

`frontend/src/player/offline/localFirst.ts`

It provides:

- cached game payloads
- local event queue
- sync status
- retry attempt metadata
- localStorage persistence
- event deduplication by `client_event_id`
- sync payload generation for `/api/events/sync`

## Coverage model

Offline/local-first does not mean real-time magic with no network.

When there is no network:

- the player can keep the last cached game payload
- local actions can be queued
- QR/NFC/manual events can be stored locally in future PRs
- the UI can show offline/cached state

When connectivity returns:

- queued events are sent to `/api/events/sync`
- backend storage persists the events
- team/player state can be refreshed

## Future work

Next gameplay PRs should wire this foundation into:

1. Player game loading.
2. Visible offline/syncing/cached status.
3. QR/NFC/manual event capture.
4. Team presence cache with stale/offline users.
5. Inventory/physical interactions.
6. PWA/service worker polish.

## Safety

Queued events are gameplay state, not credentials.

Do not store secrets, admin passwords, private tokens or personal data in offline event payloads.
