# Offline Player Launch Invariant

When SAGA is installed on a phone home screen, it must not blank out when there is no coverage.

Required behavior:

1. Opening the installed app at `/` must render the login shell.
2. The login shell must work with cached public config.
3. Player profiles must be visible offline after one online preparation.
4. Selecting a player must open that player's route.
5. Player payloads should be autosaved whenever the app can reach the backend.
6. Player progress must be stored locally and synced later when network returns.

This is required for field use: parades, mountains, rural routes, basements, parks and any mission with unreliable mobile coverage.

The player app should treat network as optional during field play once a mission has been prepared.
