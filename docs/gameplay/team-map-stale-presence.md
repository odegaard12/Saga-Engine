# Team map stale presence

SAGA Engine should keep team awareness useful under weak coverage.

After the team presence cache foundation, the next step is map-ready teammate markers.

## Current foundation

The frontend includes:

`frontend/src/player/offline/teamMapPresence.ts`

It converts `TeamProfileLiveStatus[]` into map marker-friendly objects:

- user
- display name
- latitude
- longitude
- presence: `live`, `stale` or `offline`
- GPS status
- source
- last seen timestamp

## Coverage model

When the backend returns live team profiles:

- live teammates can be shown as live
- stale teammates can be shown as stale
- offline teammates with known position can still be shown as last-known position

When the team endpoint fails and cached profiles are used:

- cached live/stale teammates are normalized to stale
- expired cache is normalized toward offline
- the map can still show last-known teammate locations instead of going blank

## Limits

This does not provide live location updates without network.

It prepares the map layer for last-known and stale/offline teammate markers. True local real-time presence without the backend would need a separate local transport layer.

## Safety

Team map markers are gameplay runtime state.

Do not store secrets, admin credentials or sensitive personal data in presence payloads.
