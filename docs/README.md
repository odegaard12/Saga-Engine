# Documentación de Saga-Engine

Índice por tema. Las carpetas están en inglés por historia; el contenido mezcla español e inglés.

## Empezar

- [como-anadir-un-minijuego.md](como-anadir-un-minijuego.md): pasos para añadir un minijuego nuevo.
- [banco-de-simulacion.md](banco-de-simulacion.md): el banco de simulación (`sim/`) y cómo medir con él.
- [plan-de-mejora.md](plan-de-mejora.md): plan continuo de mejora.

## Arquitectura (`architecture/`)

- [adr-001-player-frontend-migration.md](architecture/adr-001-player-frontend-migration.md): decisión de migrar el frontend del jugador.
- [frontend-migration-plan.md](architecture/frontend-migration-plan.md): plan de esa migración.
- [event-log-foundation.md](architecture/event-log-foundation.md): registro de eventos.
- [family-schema-contract.md](architecture/family-schema-contract.md): contrato del esquema de familias de juego.
- [sqlite-storage-foundation.md](architecture/sqlite-storage-foundation.md): almacenamiento SQLite.
- [offline-team-map-architecture.md](architecture/offline-team-map-architecture.md): arquitectura offline, equipo y mapa (documento vigente de referencia).

## Jugabilidad (`gameplay/`)

- [game-system-architecture.md](gameplay/game-system-architecture.md): sistema de juegos.
- [playable-game-templates-v1.md](gameplay/playable-game-templates-v1.md): plantillas jugables.
- [game-preset-review-checklist.md](gameplay/game-preset-review-checklist.md): revisión de presets.
- [admin-game-authoring-clarity-v1.md](gameplay/admin-game-authoring-clarity-v1.md): claridad al crear juegos desde el panel.
- [demo-gameplay-inventory-qr-nfc-v1.md](gameplay/demo-gameplay-inventory-qr-nfc-v1.md): demo de inventario, QR y NFC.
- [minigames-and-physical-interactions-audit.md](gameplay/minigames-and-physical-interactions-audit.md): auditoría de minijuegos e interacciones físicas.
- [player-collectibles-rewards-flow.md](gameplay/player-collectibles-rewards-flow.md): coleccionables y premios.
- [player-field-test-checklist.md](gameplay/player-field-test-checklist.md): lista de prueba en campo.

Inventario:

- [inventory-tools-panel.md](gameplay/inventory-tools-panel.md), [inventory-use-action.md](gameplay/inventory-use-action.md), [inventory-use-offline-event.md](gameplay/inventory-use-offline-event.md), [manual-inventory-collect.md](gameplay/manual-inventory-collect.md).

Offline y equipo (vigentes):

- [offline-local-first-player.md](gameplay/offline-local-first-player.md): núcleo offline del jugador.
- [offline-player-launch-invariant.md](gameplay/offline-player-launch-invariant.md): la app instalada no se queda en blanco sin cobertura.
- [physical-event-offline-queue.md](gameplay/physical-event-offline-queue.md): cola local de eventos físicos (QR, NFC, códigos).
- [team-map-stale-presence.md](gameplay/team-map-stale-presence.md), [team-presence-cache.md](gameplay/team-presence-cache.md): presencia de equipo en el mapa.

## Operaciones (`operations/`)

- [clean-docker-production-deploy.md](operations/clean-docker-production-deploy.md), [docker-runtime.md](operations/docker-runtime.md): Docker y despliegue.
- [sqlite-runtime-only.md](operations/sqlite-runtime-only.md), [sqlite-migration-dry-run.md](operations/sqlite-migration-dry-run.md): SQLite.
- [pwa-mobile-app-shell.md](operations/pwa-mobile-app-shell.md), [mobile-player-polish.md](operations/mobile-player-polish.md), [player-requirements-preview.md](operations/player-requirements-preview.md): PWA y móvil.
- [admin-language-toggle.md](operations/admin-language-toggle.md), [i18n-global-ui-fast.md](operations/i18n-global-ui-fast.md), [i18n-player-tools-cleanup.md](operations/i18n-player-tools-cleanup.md): idiomas.
- [node-editor-game-authoring-polish.md](operations/node-editor-game-authoring-polish.md): editor de nodos.

## Panel y frontend

- [admin/mission-control-polish-roadmap.md](admin/mission-control-polish-roadmap.md): pulido del panel de control.
- [frontend/ios-pwa-fullscreen-guardrails.md](frontend/ios-pwa-fullscreen-guardrails.md): pantalla completa en iOS.

## Seguridad y privacidad (`security/`)

- [admin-auth.md](security/admin-auth.md), [client-ip.md](security/client-ip.md): autenticación e IP del cliente.
- [privacy-guard.md](security/privacy-guard.md), [protected-files.md](security/protected-files.md): guardas del repositorio.
- [audit-closeout-roadmap.md](security/audit-closeout-roadmap.md), [cleanup-audit-report.md](security/cleanup-audit-report.md), [cleanup-checklist.md](security/cleanup-checklist.md): auditoría y limpieza.

## Histórico (`historico/`)

- [DECISIONS.md](historico/DECISIONS.md): decisiones ya tomadas.
- [TESTS.md](historico/TESTS.md): registro de pruebas.
- [auditar.md](historico/auditar.md): prompt de auditoría.
- [main-route-split-plan.md](historico/main-route-split-plan.md): plan de partir las rutas de `main.py`.

Documentos offline de la primera versión, archivados porque se solapan con los vigentes:

| Archivado | Sustituto vigente |
|---|---|
| [local-first-inventory.md](historico/offline/local-first-inventory.md) | [physical-event-offline-queue.md](gameplay/physical-event-offline-queue.md) |
| [manual-code-offline-fallback.md](historico/offline/manual-code-offline-fallback.md) | [offline-local-first-player.md](gameplay/offline-local-first-player.md) |
| [universal-offline-fallback-code-v1.md](historico/offline/universal-offline-fallback-code-v1.md) | [offline-local-first-player.md](gameplay/offline-local-first-player.md) |
| [offline-field-vault-v1.md](historico/offline/offline-field-vault-v1.md) | [offline-player-launch-invariant.md](gameplay/offline-player-launch-invariant.md) |
| [offline-sync-tools.md](historico/offline/offline-sync-tools.md) | [offline-local-first-player.md](gameplay/offline-local-first-player.md) |

Capturas del README: `capturas/`.
