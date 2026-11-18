# Offline Field Vault v1

SAGA must be explicitly prepared before field use.

The login screen must always expose a `Prepare offline` action.

It downloads and stores public mission config, player profiles, mission packs for every active player/team, PWA shell routes, static shell assets and an offline vault summary.

When online, SAGA refreshes server config and updates the local vault.

When offline, SAGA renders cached login data, lets the user pick a prepared player, loads that player mission pack and queues local events for later sync.

Consistency rule:

```text
offline view = latest downloaded server snapshot + pending local events
```

Do not mix server state and local state blindly.
