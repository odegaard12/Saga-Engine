# Node editor game authoring polish

This PR improves the React node editor so it starts behaving more like a game authoring tool.

## Added to the Game tab

- How players complete this node
- Required item metadata
- Reward metadata
- Completion message metadata

## Current behavior

This is a foundation-only pass.

The editor stores metadata under the node `config`, but this PR does not enforce gameplay rules yet.

## Safety boundaries

- no backend validation changes
- no player progression changes
- no reward granting logic yet
- no storage default changes
- no service worker
- no changes to `data/stages.json`
- no secrets, logs, backups or runtime data
- no mission content hardcoded in the repo

## Follow-up order

- player requirements preview
- backend validation for item requirements
- QR/NFC real flow
