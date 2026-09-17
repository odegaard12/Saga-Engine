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
| 2026-09-16 | Despliegue 5.1.1 en `.104` | bundle → build → run | ✅ |
| 2026-09-16 | Animaciones, 2ª pasada | `node run.mjs animaciones` | ⚠️ Clasificación arreglada (5/3), pero las salidas quedan en 2-4 |
| 2026-09-16 | Animaciones, 3ª pasada (5.1.2) | `node run.mjs animaciones` | ❌ **la prueba miente**: Mochila entrada = 0 con el código sin tocar, tras dar 7 y 6. Escenario reescrito sobre `transitionend`/`animationend` |
| 2026-09-16 | Animaciones por eventos (5.1.2) | `node run.mjs animaciones` | ⚠️ diagnóstico limpio: entradas 260ms exactos, **ninguna salida dispara evento** |
| 2026-09-16 | Animaciones por eventos (5.1.3) | `node run.mjs animaciones` | ✅ **0 fallos**. Velo 620ms · 0 fotogramas desnudos · "antes de salir" 260/260 · las tres hojas 260/260 · hueco 0px · pestañas 658/658/658 |
| 2026-09-16 | `.103` sincronizada | bundle → build → run | ✅ 5.0.3 → 5.1.2 → 5.1.3 |
| 2026-09-11 | Auditoría de interfaz, 3ª pasada | `node run.mjs auditoria-interfaz` | ✅ 0 avisos de texto pequeño (venía de 22 → 6 → 0) |
| 2026-09-11 | Álbum de diseño, 9 pantallas | `node run.mjs album-diseno` | ✅ capturas en `out/` |

## Qué mide `animaciones`

Le pregunta al navegador, no a un muestreo: escucha `transitionend` y
`animationend` y se queda con el `elapsedTime`. **Si no hay evento, no hubo
movimiento** — no existe aviso de final de algo que no ha empezado.

La primera versión contaba fotogramas intermedios con `requestAnimationFrame`
y hubo que tirarla: para el mismo código sin tocar dio 7, 6 y **0** en la
misma hoja. En Chromium sin ventana ese bucle va irregular y cada llamada del
guión le roba fotogramas. Un cero no significaba "no se movió" sino "no miré
mientras se movía". Es el caso de libro de una prueba que miente.

El muestreo por fotogramas se queda para una sola cosa, que no va de suavidad
sino de presencia: que entre que la pantalla de carga se va y el velo se pone
no quede **ni un** fotograma con el juego desnudo.

Nació porque el mismo fallo -"sale de golpe"- se dio por arreglado tres veces
seguidas mirando el CSS, que estaba bien las tres. Lo que fallaba no se ve
leyendo: un efecto pasivo que deja pintar un fotograma desnudo, una
transición sin cambio de valor, una `animation` que le gana a la `transform`
de al lado, un `return null` que desmonta la hoja antes de que pueda salir, y
un temporizador que corría la misma carrera que la transición y la ganaba
siempre.

## Notas

- `npx tsc` hay que lanzarlo **desde `frontend/`**. Desde la raíz del repo
  instala un paquete `tsc@2.0.4` que no es TypeScript y da errores falsos.
- El banco deja jugadores de simulación; los escenarios llaman a
  `stopBrowserSession()` y `cleanupTrace()` en su `finally`, pero si un
  escenario se corta a mano hay que limpiarlos desde el panel de admin.
