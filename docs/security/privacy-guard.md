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

## Private wordlist

Names of players, place names and node codes of a real mission are checked against a private wordlist that is never
committed. The guard reads it from two places and merges them:

- `.saga-privacidad-local.txt` in the repository root (ignored by git), one word per line;
- the `SAGA_PRIVACIDAD_PALABRAS` environment variable, words separated by newlines or commas. In GitHub Actions it is
  fed from the repository secret of the same name (`Settings → Secrets and variables → Actions`). Without the secret
  the step behaves as before: every other check runs, the wordlist check is skipped.

Matched words are never printed, only the file and line.

If a finding is a false positive, prefer a narrow code-level allowlist and explain it in the PR. Do not bypass privacy findings silently.

## Template exception

The repository may include `.env.example` as a public configuration template.

This exception only applies to the filename. The file content is still scanned for common secret/token patterns.
