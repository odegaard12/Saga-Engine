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

Cloudflare tunnel (22/11/2026): with `TRUST_PROXY_HEADERS=0`, `CF-Connecting-IP` (and no other
header) is still used when the direct client is inside `SAGA_CLOUDFLARED_CIDRS` (default
`127.0.0.0/8,::1/128`: loopback, where cloudflared connects from). From any other address the
header is ignored. Set `SAGA_CLOUDFLARED_CIDRS=` (empty) to turn it off.

Docker networks (`172.16.0.0/12`) are opt-in since the 22/11 audit: a LAN client reaching the
published port through Docker's hairpin/userland proxy shows up as a 172.x address and could
send its own `CF-Connecting-IP` to dodge rate limits and the admin login lockout. In production
uvicorn already applies cloudflared's `X-Forwarded-For`, so `request.client.host` is usually the
public IP anyway. If cloudflared runs in another container, add its network explicitly, e.g.
`SAGA_CLOUDFLARED_CIDRS=127.0.0.0/8,::1/128,172.16.0.0/12`.

The implementation lives in:

`backend/app/security/client_ip.py`

`main.py` keeps small wrappers for compatibility with existing route code and tests.
