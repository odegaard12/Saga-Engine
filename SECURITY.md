# Security Policy

## Reporting a Vulnerability

If you discover a security issue affecting this project, please do not publish full exploit details immediately.

Please report it privately to the maintainer first so the issue can be reviewed and fixed before public disclosure.

Recommended report content:

- affected version / commit
- clear description of the issue
- reproduction steps
- expected impact
- suggested fix if available

## Scope

The most security-sensitive areas of this project are:

- `/admin` authentication and password-reset flows
- public API payload exposure
- runtime node normalization / validation
- deployment and environment configuration


## Reporting guidance

No incluyas secretos, contraseñas, tokens, datos reales de misión, coordenadas privadas ni datos personales en issues públicos. Para reportes sensibles, contacta al mantenedor por un canal privado antes de publicar detalles técnicos.

## Public repository guard checklist

Before opening or merging a public PR, verify that it does not include:

- real admin passwords, API tokens, cookies or secrets
- `.env` files or local override files
- real live mission data, private coordinates or private backups
- `admin_auth.json`, `gamestate.json` or `positions.json`
- local IP topology beyond generic development examples
- personal emails, phone numbers or private participant data
- generated local backup folders such as `_backups/`

Public examples should stay generic. Real runtime data should live outside the repository, preferably through `SAGA_DATA_DIR`.

