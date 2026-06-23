# Game Preset Review Checklist

Use this checklist before marking a game preset as playable.

## Basic checks

- The admin card explains what the player does.
- The node editor can configure the important fields.
- The player app shows a clear action.
- The completion rule is unambiguous.
- The offline behavior is known.
- The node does not auto-complete unexpectedly.
- Invalid QR/codes do not create progress.
- The game can be tested with a demo mission.

## Status labels

| Label | Meaning |
|---|---|
| Playable | Current runtime can complete it. |
| Partial | Foundation exists, but UX/rules need polish. |
| Template | Useful for mission design, but not fully enforced. |
| Planned | Design exists, runtime not ready. |

## QR/inventory rule

QR inventory games are offline-ready only when the QR belongs to the mission catalog.

Random QR codes must not be accepted as inventory items.

Route advancement should be explicit and predictable.
