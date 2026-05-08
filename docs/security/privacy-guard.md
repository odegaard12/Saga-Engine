# Repository privacy guard

SAGA Engine is a public repository. Runtime state, secrets and local operational files must not be committed.

The privacy guard blocks common accidental leaks, including:

- environment files
- local SQLite/database files
- logs, backups and temporary artifacts
- private keys or certificate bundles
- common token formats
- runtime state files such as `gamestate.json`, `positions.json`, `events.json` and `admin_auth.json`

Run locally:

`python scripts/check_repo_privacy.py`

Run the combined audit guard suite:

`python scripts/check_audit_guards.py --base origin/main`

If a finding is a false positive, prefer a narrow code-level allowlist and explain it in the PR. Do not bypass privacy findings silently.

## Template exception

The repository may include `.env.example` as a public configuration template.

This exception only applies to the filename. The file content is still scanned for common secret/token patterns.
