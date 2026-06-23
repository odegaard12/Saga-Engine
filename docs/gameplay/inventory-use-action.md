# Inventory use action

SAGA Engine now lets players use local-first inventory items from the Tools menu.

## Current behavior

The Inventory panel shows local items and adds a small `Use` action for collected items.

When a player uses an item:

- quantity is reduced by one
- if quantity reaches zero, item state becomes `used`
- inventory remains local-first
- no mission progression is granted automatically

## Why this matters

This enables basic physical gameplay loops:

- collect a key
- use a key
- collect a rune
- spend a rune
- track local props under weak coverage

## Limits

This PR does not add backend validation or mission item requirements.

Future PRs can add:

- stage requirements that check local/server inventory
- backend inventory sync
- admin schema fields for required items
- team/shared inventory

## Safety

Inventory use state is gameplay state only.

Do not store secrets, credentials, private tokens or unnecessary personal data in inventory metadata.
