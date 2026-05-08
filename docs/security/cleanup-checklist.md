# Cleanup checklist

This checklist tracks cleanup work before major gameplay features resume.

## Do not remove without review

- `data/stages.json`
- admin React files
- minigame family runtime code
- storage adapters
- migration/dry-run scripts
- security/privacy guards
- tests that cover audit regressions

## Candidates for review

Review before deleting or changing:

- obsolete references to the classic admin
- old docs that describe removed admin flows
- duplicate setup instructions
- unused helper wrappers in `main.py`
- old comments about legacy JSON-only persistence
- stale screenshots/assets
- frontend bundle size warnings
- route code still living in `main.py`

## Cleanup process

1. Search first.
2. Confirm the file/code path is unused.
3. Keep PRs focused.
4. Run audit guards.
5. Run contract check.
6. Run full pytest.
7. Do not touch `data/stages.json`.

## Current priority

The next safe cleanup target is splitting `main.py` into route modules after the security helpers have been extracted.

## Cleanup audit report

Run the cleanup audit report before deleting legacy references:

`python scripts/audit_cleanup_candidates.py --write docs/security/cleanup-audit-report.md`

The report lists file paths, categories and line numbers only. It intentionally does not copy matching line contents.

Use the report to plan focused cleanup PRs.
