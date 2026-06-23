# Inventory use offline event

SAGA Engine now queues a compatible offline physical event when a player uses a local inventory item.

## Behavior

When a player taps `Use` in the Inventory panel:

1. The item quantity is reduced locally.
2. The item is marked as `used` when quantity reaches zero.
3. A physical gameplay event is queued locally.
4. The existing offline sync loop can send it later.

## Why this matters

This completes a stronger physical gameplay loop:

manual/QR/NFC item -> local inventory -> use item -> queued proof event -> later sync

It works under weak coverage because the item use is local-first and the sync is retried automatically.

## Limits

This does not grant mission progression automatically.

Future backend/gameplay rules can decide what a synced inventory-use event means.

## Safety

Inventory use events are gameplay state only.

Do not encode secrets, credentials, private tokens, personal data or operational details in item IDs or labels.
