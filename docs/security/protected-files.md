# Protected files guard

Some files are protected against accidental edits in audit, storage, CI and refactor PRs.

Currently protected:

- `data/stages.json`

This file contains production mission/stage content and must not be changed unless the PR is explicitly about mission or stage content.

The CI guard runs:

`python scripts/check_protected_files.py --base origin/main`

For an intentional stage-content PR only, the guard can be bypassed with:

`SAGA_ALLOW_PROTECTED_STAGES_CHANGE=1`

Do not use the bypass for security, storage, CI, backend refactor or documentation-only PRs.
