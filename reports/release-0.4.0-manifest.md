# SAGA Engine v0.4.0 release manifest

Date: 2026-06-16

## Source

- Source branch: `gameplay/place-mosaic-v040`
- Approved source commit: `6e9f678edf251da93c0f77f99ad6c74d9a970490`
- Approved short commit: `6e9f678`
- Base release: `v0.3.1`
- Target release: `v0.4.0`

## Product scope

- Place Mosaic editor in Mission Control.
- Place Mosaic player runtime.
- Photograph optimization and validation.
- 2×2, 3×3 and 4×4 configurations.
- Initial photograph preview.
- Immediate two-tap piece exchange.
- Progress and movement feedback.
- Optional final real-world question.
- Explicit completed-image screen.
- Offline-compatible runtime configuration.
- Backend normalization and contracts.

## Source commits

- `c42e1b3` — add offline Place Mosaic puzzle.
- `e714584` — polish Place Mosaic interaction and visual feedback.
- `6e9f678` — finalize Place Mosaic completion flow.

## Required validation

- Repository privacy guard.
- Protected-files guard.
- Python compilation.
- npm audit with zero vulnerabilities.
- Frontend production build.
- Runtime contract checks.
- Candidate Docker smoke tests.
- Production Docker smoke tests.
- Version endpoint matches the merged main commit.

## Runtime safety

Runtime state remains outside the repository and Docker image.
The mounted SQLite database and player progress are preserved.
