# Inventory Tools panel

SAGA Engine now has a local-first inventory foundation and a player Tools panel for viewing it.

## Current behavior

The player Tools menu includes an Inventory panel.

It shows:

- total local item count
- up to four recent local items
- quantity
- source/node/physical id summary when available
- local updated timestamp

## Coverage model

The inventory panel reads from the local-first inventory snapshot.

This means it stays available under weak coverage and can show items collected locally before backend sync rules exist.

## Limits

This PR only adds inventory visibility.

It does not yet add:

- item collection UI
- backend inventory validation
- mission item requirements
- team/shared inventory
- server-side inventory sync

## Safety

Inventory panel content is gameplay state only.

Do not store secrets, admin credentials, private tokens or unnecessary personal data in inventory metadata.
