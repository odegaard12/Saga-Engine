# Player collectibles and rewards flow

SAGA field collectibles follow an offline-first rule:

1. A collectible can only be used on a node if that node/activity explicitly requires it.
2. Future nodes can require objects earned before arriving there.
3. Mid-route reward points may exist between two nodes.
4. Mid-route rewards are collectible field objects, not free text uploads.
5. The mission pack must include the data required to render and validate the route offline.
6. If offline, collection/use actions should queue locally and sync later.

Privacy boundary:

- No private photos, exact sensitive coordinates, secrets, logs, or runtime databases in git.
- Generic assets are allowed.
- Real player images must be runtime/admin-managed, not committed.
