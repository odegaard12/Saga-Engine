# Player requirements preview

This PR adds a frontend-only player preview for node item requirements.

## What it reads

The player reads optional node config metadata created by the admin editor:

- `required_item_id`
- `required_item_label`
- `required_item_quantity`
- `required_item_consume`

## What it shows

Inside the player Tools sheet, the UI can show:

- required item label
- required quantity
- local inventory amount
- whether the player currently has enough
- whether the item is marked as consumable

## Current behavior

This is a preview-only pass.

It does not block progression, consume items or grant rewards.

## Safety boundaries

- no backend changes
- no player progression changes
- no item consumption logic
- no reward granting logic
- no storage default changes
- no service worker
- no changes to `data/stages.json`
- no secrets, logs, backups or runtime data

## Follow-up

Backend validation for item requirements comes next.
