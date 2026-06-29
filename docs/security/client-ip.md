# Client IP and trusted proxy handling

SAGA Engine ignores proxy headers by default.

Proxy headers are only accepted when:

- `TRUST_PROXY_HEADERS=1`
- the direct client is listed in `TRUSTED_PROXY_IPS`, or
- the direct client is inside `TRUSTED_PROXY_CIDRS`

Accepted forwarded client headers, in order:

1. `CF-Connecting-IP`
2. `X-Forwarded-For`
3. `X-Real-IP`

Invalid forwarded IP values are ignored.

The implementation lives in:

`backend/app/security/client_ip.py`

`main.py` keeps small wrappers for compatibility with existing route code and tests.
