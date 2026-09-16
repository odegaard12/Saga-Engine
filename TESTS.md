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
| 2026-09-16 | Despliegue 5.1.0 en `.104` | bundle → `docker build` → `run` → `curl /api/version` | ✅ `{"version":"5.1.0"}` |
| 2026-09-16 | Animaciones fotograma a fotograma, 1ª pasada | `node run.mjs animaciones` | ⚠️ 2 fallos — la Clasificación con 0 fotogramas intermedios al abrir y al cerrar. El resto verde: relevo de la carga 13 fotogramas de fundido y 0 desnudos, "antes de salir" 7 al entrar / 5 al salir, Mochila 7/4, Ferramentas 6/4, hueco inferior 0px en las tres, pestañas de la Mochila 658/658/658 px |
| 2026-09-16 | Tipos tras quitar `if (!open) return null` de RankingSheet | `cd frontend && npx tsc --noEmit` | ✅ sin errores |
| 2026-09-16 | Despliegue 5.1.1 en `.104` | bundle → build → run | pendiente de anotar |
| 2026-09-16 | Animaciones, 2ª pasada (comprueba la Clasificación) | `node run.mjs animaciones` | pendiente de anotar |
| 2026-09-11 | Auditoría de interfaz, 3ª pasada | `node run.mjs auditoria-interfaz` | ✅ 0 avisos de texto pequeño (venía de 22 → 6 → 0) |
| 2026-09-11 | Álbum de diseño, 9 pantallas | `node run.mjs album-diseno` | ✅ capturas en `out/` |

## Qué mide `animaciones`

Graba con `requestAnimationFrame` la opacidad y el `translateY` REALES
-calculados por el navegador- de cada superficie que se mueve, y después
pregunta lo único que importa: **¿hubo valores intermedios?** Un elemento que
va de 0 a 1 sin pasar por en medio no se ha movido, ha aparecido, diga lo que
diga la hoja de estilos. Exige 4 fotogramas intermedios como mínimo.

Nació porque el mismo fallo -"sale de golpe"- se dio por arreglado tres veces
seguidas mirando el CSS, que estaba bien las tres. Lo que fallaba no se ve
leyendo: un efecto pasivo que deja pintar un fotograma desnudo, una
transición sin cambio de valor, una `animation` que le gana a la `transform`
de al lado, y un `return null` que desmonta la hoja antes de que pueda salir.

## Notas

- `npx tsc` hay que lanzarlo **desde `frontend/`**. Desde la raíz del repo
  instala un paquete `tsc@2.0.4` que no es TypeScript y da errores falsos.
- El banco deja jugadores de simulación; los escenarios llaman a
  `stopBrowserSession()` y `cleanupTrace()` en su `finally`, pero si un
  escenario se corta a mano hay que limpiarlos desde el panel de admin.
