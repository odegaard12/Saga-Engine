# Admin authentication

SAGA Engine uses an HttpOnly admin session cookie for the React admin CMS.

The implementation lives in:

`backend/app/security/admin_auth.py`

`main.py` keeps thin wrappers for route compatibility.

## Default behavior

Admin requests are authorized with the `saga_admin_session` cookie created by the admin login flow.

Legacy password-in-payload authentication is disabled by default.

## Legacy compatibility flag

For temporary compatibility only, legacy password payload authentication can be enabled explicitly:

`SAGA_ALLOW_LEGACY_ADMIN_PASSWORD_PAYLOAD=1`

When this flag is not set, admin requests without a valid session cookie are rejected even if they include fields such as:

- `password`
- `admin_password`
- `admin_pass`
- `admin_key`
- `key`

This keeps the React admin session model as the default and avoids sending the admin password on every request.

## Login protection

Failed admin logins are counted three ways (13/11/2026):

- **Unknown device** (no `saga_admin_dev` cookie, or a forged one): 5 failures per client IP in 10 minutes, then a
  progressive lock (10 min, 20, 40... capped at 24 h, as before).
- **Recognised device**: the phone that already logged in successfully carries a signed cookie, `saga_admin_dev`
  (HMAC with the session signing secret, 90 days). Its failures are counted apart: 10 per 10 minutes, with a short
  growing wait (1, 2, 4... up to 30 s) from the 4th failure and a lock capped at 1 hour. A user behind a shared IP (a
  group's wifi, CGNAT) is no longer locked out by somebody else's guesses.
- **IP ceiling** (60 failures per 10 minutes per IP, with or without the cookie): a bot that spreads its guesses over many
  cookies still hits it. The cookie never bypasses this ceiling.

`POST /api/admin/change-password` shares the same counters (a wrong current password counts as a failure).

A wrong password returns `401` with `remaining_attempts` and `retry_in`; a lock returns `429` with `retry in Ns`.

## Sessions

The session is sliding: every valid request renews it (the write to SQLite is at most once a minute), for 1 h of
inactivity (`ADMIN_SESSION_TTL_SECONDS`) or 6 h with "Mantener la sesión", and never beyond 12 h since login. The cookie
lasts the 12 h cap; the server decides when it really expires. `POST /api/admin/session/ping` renews it and returns
`session_expires_at`.

## Lost admin password: `ADMIN_RESET=1`

1. Stop or restart the container with `ADMIN_RESET=1` and `ADMIN_PASS=<a NEW temporary password>`.
2. On start the password is replaced, `must_change` is set if it is weak, **all open admin sessions are closed and the
   login lockouts are cleared**.
3. Log in with that temporary password and change it from the panel.
4. **Remove `ADMIN_RESET=1` from the environment** and restart.

The reset is applied once per `ADMIN_PASS` value (a salted PBKDF2 mark of the last one is stored in `admin_auth.json`): if
`ADMIN_RESET=1` is left set, a reboot of the Raspberry (a power cut) no longer overwrites the password chosen afterwards.
To apply a new reset, use a different `ADMIN_PASS` value.

## Security note

Do not enable legacy password payload authentication on public deployments unless there is a short-lived migration reason and access is otherwise protected.
