# Player field flow checklist

Use this checklist before adding NFC/QR/minigame features.

## Online preparation

- Open `/player/PLAYER%201` on the target phone.
- Confirm the top shell is not under the iPhone Dynamic Island / status bar.
- Confirm the bottom HUD is visible and not cut.
- Tap **Descargar misión**.
- Confirm the prep panel shows the mission as downloaded.
- Tap **Activar GPS**.
- Confirm the browser permission prompt appears after the tap.
- Accept location permission.
- Confirm the prep panel shows GPS active.
- Confirm the player marker appears on the map without debug mode.
- Confirm the HUD shows a real distance in meters.

## Movement / map stability

- Keep the player route open for at least 60 seconds.
- Confirm the map does not reload or flicker.
- Confirm the player marker moves/updates without disappearing.
- Confirm the map does not fly/recenter repeatedly.
- Tap map manually and confirm it stays usable.
- Use focus/player or follow only when intentionally requested.

## Range behavior

- Outside the node radius, confirm the HUD says the player is too far and shows meters.
- Inside the node radius, confirm the primary action opens the interaction.
- If GPS is missing, confirm the primary action says **Activar GPS**, not a dead locked state.

## Offline shell

- After downloading the mission, enable airplane mode / disable data.
- Fully close and reopen the installed PWA or browser tab.
- Confirm the player shell loads.
- Confirm the mission pack loads from IndexedDB.
- Confirm it does not fall back to login with a config/load error.
- Complete one local node if possible.
- Confirm pending sync count appears in Tools.

## Sync back online

- Restore data.
- Open Tools.
- Tap sync pending.
- Confirm `/api/events/sync` applies queued `node_completed` events.
- Confirm SQLite game_state/events reflect the progress.
