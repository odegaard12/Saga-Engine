# Manual code offline fallback

SAGA Engine supports outdoor missions where connectivity can fail at the worst moment: when a player is trying to submit a physical code.

## Current behavior

`PlayerApp` still tries the normal online flow first:

1. The player submits a stage code.
2. The app calls the backend `advancePlayer()` flow.
3. If the backend accepts the code, the player progresses normally.

If the submit flow fails because sync/network is unavailable, the player now keeps a local proof event instead of losing the attempt.

## Offline fallback

When code submission fails in the catch path:

- the code is queued with `queueManualCode()`
- the event uses the existing offline queue
- the event is compatible with `/api/events/sync`
- the player gets a warning notice that the code was saved offline
- the stage is not advanced locally without backend validation

## Important limit

This PR does not fake successful progression offline.

The backend still needs to validate stage progression. The local fallback stores a physical/manual proof event so the attempt can be synced later.

## Safety

Manual code payloads are gameplay state only.

Do not store:

- admin credentials
- secrets
- private tokens
- unnecessary personal data
- private operational details

Payload text is trimmed and length-limited by the physical event queue helper.
