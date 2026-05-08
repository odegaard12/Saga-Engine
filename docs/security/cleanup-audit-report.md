# Cleanup audit report

This report lists cleanup candidates found in tracked text files.

It intentionally records file paths, categories and line numbers only. It does not copy matched line content, so it avoids accidentally publishing secrets, local paths or operational details.

## Summary

- `classic_admin`: 5 hit(s)
- `deprecated_marker`: 7 hit(s)
- `json_only_persistence`: 1 hit(s)
- `legacy_admin`: 8 hit(s)

## Files

### `README.md`

- `classic_admin`: line(s) 26, 60, 186
- `deprecated_marker`: line(s) 26, 186, 208, 219
- `legacy_admin`: line(s) 110, 191

### `docs/architecture/sqlite-storage-foundation.md`

- `legacy_admin`: line(s) 165, 167

### `docs/security/admin-auth.md`

- `legacy_admin`: line(s) 15, 19, 41

### `docs/security/audit-closeout-roadmap.md`

- `classic_admin`: line(s) 8
- `deprecated_marker`: line(s) 8, 63
- `legacy_admin`: line(s) 12

### `docs/security/cleanup-checklist.md`

- `classic_admin`: line(s) 19
- `deprecated_marker`: line(s) 19
- `json_only_persistence`: line(s) 23

## Cleanup rule

Do not delete files or code solely because they appear in this report.

Review each candidate and remove only confirmed obsolete references in focused PRs.

Never modify `data/stages.json` from cleanup PRs.
