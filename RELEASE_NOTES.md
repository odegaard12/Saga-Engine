# SAGA Engine v0.4.0 — Place Mosaic production release

SAGA Engine adds its third production-ready reusable game:
**Place Mosaic**.

## Place Mosaic

- Reconstruct a photograph connected to the physical place.
- Use 2×2, 3×3 or 4×4 boards.
- Shuffle the pieces for each play session.
- Show the original photograph for four, five or six seconds.
- Exchange two pieces through a simple two-tap interaction.
- Show correctly positioned pieces, progress and remaining moves.
- Reopen a short reference view during the puzzle.
- Display the reconstructed photograph when the mosaic is complete.
- Optionally ask a final observation question about the real location.
- Advance exactly once after successful completion.

## Mission Control

- Dedicated visual Place Mosaic editor.
- Local image upload and automatic optimization.
- Photograph size and offline readiness feedback.
- Alternative text configuration.
- Board size, preview duration and movement-limit controls.
- Optional final question with two to four answers.
- Explicit correct-answer selection.
- Validation prevents incomplete puzzles from being saved as ready.

## Player experience

- Visual style aligned with Circuit Matrix and Sequence Code.
- No tile shrinking or distracting swap animation.
- Immediate tile exchange.
- Mobile haptic feedback where supported.
- Clear `Imagen completada` transition.
- Clear `Ahora responde a esta pregunta` step when configured.
- Final `Lugar verificado` confirmation before continuing.

## Offline and runtime

- Photograph and puzzle configuration are included in mission runtime data.
- Existing player offline foundations remain active.
- Completion uses the standard node-completion and synchronization flow.
- Runtime databases, mission data and player progress remain outside the image.

## Validation

- Repository privacy guard.
- Protected-files guard.
- Python compilation.
- TypeScript and Vite production build.
- Zero-vulnerability npm audit.
- Backend runtime contracts.
- Place Mosaic configuration normalization contracts.
- Candidate-first Docker deployment.
- Production smoke checks for `/`, `/admin-react` and the player route.

## Production support

| Feature | Status |
|---|---|
| Circuit Matrix | Production-ready |
| Sequence Code | Production-ready |
| Place Mosaic | Production-ready |
| QR objects, keys, clues and bonuses | Production-ready |
| Guided Mission Control | Production-ready |
| Offline progress and synchronization | Production-ready foundation |
| GPS signal and bearing games | Further field validation pending |
| Motion Challenge | Parked experimental prototype |

## Upgrade

The deployment rebuilds the application image while preserving the
external SQLite database and all mission, player, inventory and
progress data.
