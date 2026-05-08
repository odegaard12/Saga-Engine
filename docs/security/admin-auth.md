# Admin authentication

SAGA Engine uses an HttpOnly admin session cookie for the React admin CMS.

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

## Security note

Do not enable legacy password payload authentication on public deployments unless there is a short-lived migration reason and access is otherwise protected.
