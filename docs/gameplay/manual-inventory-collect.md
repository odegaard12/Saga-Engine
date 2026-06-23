# Manual inventory collect

SAGA Engine now supports a small manual inventory collection panel inside the player Tools menu.

## Code format

The panel accepts local item codes:

- `ITEM:llave`
- `ITEM:llave:Llave azul`
- `ITEM:runa_agua:Runa de agua`

## Behavior

When a player submits a valid item code:

- the item is collected into the local-first inventory snapshot
- the item appears in the Inventory panel
- a compatible physical gameplay event is queued for later sync
- mission progression is not advanced automatically

## Why this matters

This gives the game a simple real-world loop:

physical code -> local item -> visible inventory -> later sync

It works even with weak or intermittent coverage because inventory is stored locally first.

## Limits

This PR does not add backend validation or mission item requirements.

Future PRs can add:

- QR/NFC item collection
- item requirements in mission schema
- item usage actions
- team/shared inventory
- backend inventory sync and validation

## Safety

Manual inventory codes are gameplay state only.

Do not encode secrets, credentials, private tokens, personal data or operational details into item codes.
