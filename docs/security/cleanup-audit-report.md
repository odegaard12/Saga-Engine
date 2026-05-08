# Cleanup audit report

This report lists cleanup candidates found in tracked text files.

It intentionally records file paths, categories and line numbers only. It does not copy matched line content, so it avoids accidentally publishing secrets, local paths or operational details.

## Summary

- `cleanup_marker`: 3 hit(s)
- `json_only_persistence`: 5 hit(s)
- `obsolete_marker`: 8 hit(s)
- `old_route_reference`: 1 hit(s)

## Files

### `README.md`

- `obsolete_marker`: line(s) 208, 219

### `docs/security/audit-closeout-roadmap.md`

- `cleanup_marker`: line(s) 60
- `json_only_persistence`: line(s) 59
- `obsolete_marker`: line(s) 39, 61

### `docs/security/cleanup-checklist.md`

- `cleanup_marker`: line(s) 62
- `json_only_persistence`: line(s) 23, 61
- `obsolete_marker`: line(s) 19, 63

### `scripts/audit_cleanup_candidates.py`

- `cleanup_marker`: line(s) 58
- `json_only_persistence`: line(s) 54, 55
- `obsolete_marker`: line(s) 60, 167
- `old_route_reference`: line(s) 51

## Cleanup rule

Do not delete files or code solely because they appear in this report.

Review each candidate and remove only confirmed obsolete references in focused PRs.

Never modify `data/stages.json` from cleanup PRs.
