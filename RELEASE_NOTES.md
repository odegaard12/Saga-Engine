# SAGA Engine v0.3.1 — Vite security update

This maintenance release updates the frontend build tooling from Vite 8.0.10 to Vite 8.0.16.

## Security fixes

- Resolves CVE-2026-53571: Vite `server.fs.deny` bypass through Windows alternate paths.
- Resolves CVE-2026-53632: NTLMv2 hash disclosure through UNC path handling in launch-editor.
- Removes the open high and moderate Vite advisories reported for v0.3.0.

## Scope

This release intentionally contains no gameplay or mission-authoring changes.

Production features remain:

- Circuit Matrix;
- Sequence Code;
- physical QR objects, keys, clues and bonuses;
- guided Mission Control;
- offline progress and synchronization foundations.

## Validation

- `npm audit` reports zero known vulnerabilities.
- Frontend TypeScript and Vite production build pass.
- Repository privacy and protected-files guards pass.
- Python compilation passes.
- SAGA runtime contracts pass.
- Candidate Docker deployment passes smoke checks.
- Existing SQLite runtime data is preserved.

## Upgrade

The deployment rebuilds the frontend and application image. Mission, player, inventory and progress data remain outside the image and are not modified.
