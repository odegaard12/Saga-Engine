# Contribuir a Saga-Engine

## Tests

```bash
python -m pytest -q                       # rápido: en paralelo y sin los `slow`
python -m pytest -q -n0 tests/test_x.py   # uno solo, sin paralelo
python -m pytest -q -m ""                 # completo, como en la integración continua
```

Los tests de `tests/js/*.cjs` se lanzan desde pytest y necesitan Node y `cd frontend && npm ci`.
Más detalle en el [README](README.md) y el índice de [docs/](docs/README.md).

## Commits y versiones

Un commit por versión, con el prefijo de la versión: `vX.Y.Z: mensaje en español`.
Cada versión nueva sube `VERSION`, actualiza la versión del README y añade su sección
`## X.Y.Z` arriba del `CHANGELOG.md` (hay tests que lo comprueban).

## Privacidad

El repositorio es público y el motor no lleva datos de ninguna partida real. No subas:

- datos personales, nombres de jugadores ni capturas donde salgan;
- coordenadas reales de la ruta, ficheros `.gpx`, `stages.json` ni fotos de campo;
- claves, `.env`, bases de datos locales o el guion de la misión (`HISTORIA_*.md`).

`python scripts/check_repo_privacy.py` revisa los ficheros rastreados; pásalo antes de cada push
(también lo ejecuta la integración continua). Más en [docs/security/privacy-guard.md](docs/security/privacy-guard.md)
y [SECURITY.md](SECURITY.md).
