# Registro de pruebas — Saga-Engine

> Qué se probó, con qué comando y qué salió. No se repite una prueba que ya
> demostró lo mismo si el código no ha cambiado desde entonces.

Todos los escenarios del banco se lanzan desde `sim/playwright-bench` con:

```bash
SAGA_BASE_URL=http://192.168.68.104:8096 SAGA_ADMIN_PASS=... node run.mjs <escenario>
```

| Fecha | Prueba | Comando | Resultado |
|---|---|---|---|
| 2026-09-16 | Tipos del frontend tras el arreglo de animaciones | `cd frontend && npx tsc --noEmit` | ✅ sin errores |
| 2026-09-16 | Despliegue 5.1.0 en `.104` | bundle → `docker build` → `run` → `curl /api/version` | pendiente de anotar |
| 2026-09-16 | Animaciones fotograma a fotograma | `node run.mjs animaciones` | pendiente de anotar |
| 2026-09-11 | Auditoría de interfaz, 3ª pasada | `node run.mjs auditoria-interfaz` | ✅ 0 avisos de texto pequeño (venía de 22 → 6 → 0) |
| 2026-09-11 | Álbum de diseño, 9 pantallas | `node run.mjs album-diseno` | ✅ capturas en `out/` |

## Notas

- `npx tsc` hay que lanzarlo **desde `frontend/`**. Desde la raíz del repo
  instala un paquete `tsc@2.0.4` que no es TypeScript y da errores falsos.
- El banco deja jugadores de simulación; los escenarios llaman a
  `stopBrowserSession()` y `cleanupTrace()` en su `finally`, pero si un
  escenario se corta a mano hay que limpiarlos desde el panel de admin.
