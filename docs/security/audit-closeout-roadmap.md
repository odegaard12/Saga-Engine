# Audit closeout roadmap

This document tracks the remaining security/audit work before major gameplay work resumes.

## Closed

Major audit blockers are closed:

- Formal MIT license.
- Classic admin retired; React admin is the primary CMS/Mission Control.
- `/admin` redirects to `/admin-react`.
- Real frontend build validation in CI.
- Backend smoke tests and contract checks.
- HttpOnly admin session cookie flow.
- Legacy admin password payload disabled by default.
- Invalid admin login now returns a clean `401`.
- Trusted proxy handling is opt-in.
- Trusted proxy/client IP helpers extracted to `backend/app/security/client_ip.py`.
- Admin auth helpers extracted to `backend/app/security/admin_auth.py`.
- JSON storage helpers and transaction helper.
- Event log repository and optional SQLite event adapter.
- Game state repository and optional SQLite game state adapter.
- Live positions repository and optional SQLite positions adapter.
- Heartbeat writes routed through the positions adapter.
- Player progress routes routed through the game state adapter.
- Route-level SQLite tests added for event sync/admin event review.
- SQLite migration dry-run added.
- Backup, activation and rollback documentation added for optional SQLite.
- `data/stages.json` protected by CI.
- Repository privacy guard added.
- Cleanup audit report added.
- Main README refreshed with current architecture/security/storage status.

## Remaining before major gameplay features

Recommended remaining cleanup/refactor PRs:

1. Remove confirmed obsolete/legacy artifacts after reviewing the cleanup report.
2. Optionally test SQLite activation on copied runtime data before enabling it on a real deployment.

These are no longer blocking audit issues, but they improve maintainability before larger gameplay work.

## Rule for stage content

Do not modify `data/stages.json` in audit, storage, security, CI, cleanup or backend refactor PRs.

Stage content changes must be explicit mission/content PRs and must use:

`SAGA_ALLOW_PROTECTED_STAGES_CHANGE=1`

## Cleanup audit policy

The cleanup audit report is a review aid, not an automatic delete list.

It should focus on actionable stale references such as:

- old removed routes
- stale JSON-only wording
- TODO/FIXME cleanup markers
- confirmed obsolete/deprecated text

Intentional security documentation about retired/legacy compatibility boundaries should remain documented.

## Closed in route split PR

- FastAPI route handlers were split into health, player, events, admin and web route modules.
- The split is mechanical and keeps route paths/behavior stable.
- `main.py` remains the shared application state/helper entrypoint for now.
