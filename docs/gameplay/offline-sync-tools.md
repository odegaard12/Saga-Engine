# Offline sync tools

SAGA Engine now has a player-side offline queue for weak coverage.

This PR adds a small sync panel inside the player Tools menu.

## Behavior

The player attempts to sync queued offline events automatically:

- on player load
- every 20 seconds while the player is open
- when the browser comes back online

The player can also manually trigger sync from:

`Tools -> Offline sync -> Sync now`

## What gets synced

The sync panel uses the offline/local-first queue from:

`frontend/src/player/offline/localFirst.ts`

That queue can contain gameplay events such as:

- manual physical code attempts
- QR scan events
- NFC open events
- future physical/inventory gameplay events

## Limits

This does not validate mission progression locally.

If a manual code submit failed because the backend was unavailable, the physical proof event can be saved and synced later, but the backend still validates actual progression.

## Safety

The offline queue is for gameplay state only.

Do not store:

- admin credentials
- secrets
- private tokens
- unnecessary personal data
- private operational details
