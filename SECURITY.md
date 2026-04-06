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
