# Universal offline fallback code v1

Every playable SAGA node has an emergency fallback code.

In the player interaction sheet, the normal game remains first. At the bottom there is a Fallback button. Pressing it opens a text input. If the player enters the preconfigured node code, the node completes locally, the mission pack advances, and a node_completed event is queued for later sync.

The admin editor exposes this as Codigo fallback, stored as success_code.

Recommended format:

- SAGA-01
- SAGA-02
- SAGA-03
