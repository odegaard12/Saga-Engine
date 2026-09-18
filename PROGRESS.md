# Estado del proyecto — Saga-Engine

> Este fichero se actualiza al cerrar cada bloque de trabajo. Se lee ANTES de
> tocar nada, para no volver a descubrir el proyecto desde cero.

**Última actualización:** 2026-09-18 · `.104` en **5.4.0** (`75eaf47`) ·
`.103` en 5.1.3, **pendiente de igualar** (bloqueado a la espera de que el
usuario confirme 5.4.0 antes de replicarla)

## Qué está funcionando

- Juego de campo completo: nodos, GPS, QR, minijuegos, mochila, mesa de
  trabajo, clasificación, misión offline.
- Alta disponibilidad: `.104` titular, `.103` respaldo, réplica por cron
  (ver [[saga-alta-disponibilidad]]).
- Público en https://sagagia.es (Cloudflare Tunnel → 192.168.68.104:8096).
- Banco de pruebas Playwright con 7 escenarios (`sim/playwright-bench`),
  incluido `animaciones` (mide `transitionend`/`animationend` reales, no
  fotogramas — ver DECISIONS.md) y `auditoria-interfaz`.
- Diseño "B" (tarjeta sólida) aplicado en las cinco superficies del jugador,
  ahora también en la Mesa de trabajo.
- Login con nombres escalonados, entrada instantánea (GPS ya no bloquea).
- Permisos (movimiento/cámara/mapa) pedidos DENTRO de la pantalla de carga,
  con fundido a negro real en el relevo carga→juego.

## Qué se acaba de cambiar (5.1.0 → 5.4.0, sesión del 16-18/09)

Pasada larga de pulido de animaciones y diseño a partir de feedback de voz
del usuario. Resumen por bloques (detalle completo en el historial de git,
cada commit lleva la causa raíz explicada):

1. **Animaciones del jugador** (5.1.x): tres causas distintas del "todo de
   golpe" — efecto pasivo que pintaba un fotograma desnudo, transición sin
   cambio de valor, `animation` de keyframes ganándole a `transform`. Banco
   `animaciones` creado y reescrito una vez (contar fotogramas mentía, ahora
   usa eventos reales del navegador).
2. **Permisos dentro de la carga** (5.2.x): "antes de salir" pasó de aparecer
   tras la carga (mapa en blanco de por medio) a vivir incrustado en la
   propia pantalla de carga. Alturas de hojas acotadas (no fijas) para
   quitar hueco vacío. Login escalonado.
3. **Cuatro brusquedades más** (5.3.x): las 4 filas de permisos ahora están
   siempre presentes (botón↔visto, sin saltos de altura), el cierre de la
   tarjeta va por `visible` (no un `?:` que la borra antes de fundir), la
   cámara tenía el mismo bug de `if (!open) return null` que ya se había
   corregido tres veces en otros sitios, el mapa no se movía al desampliar
   (`zoomDiff > 3` siempre cierto al volver de la vista de ruta).
4. **Fundido a negro real, Mesa rediseñada, scroll de Ferramentas** (5.4.0):
   - El relevo carga→juego ahora sostiene una capa negra opaca un instante
     (antes era un crossfade que dejaba asomar el mapa enseguida).
   - La Mesa de trabajo (crafting) tenía ficha sin fondo ni borde — ahora
     tarjeta sólida real con insignia redonda del tema.
   - Ferramentas no se podía desplazar: el contenedor de la hoja era
     `display: grid`, que rompe el `flex: 1` del hijo que rueda. Vuelto a
     `flex column` + `minHeight: 0` en el scroller.
   - Botones con borde pintado del MISMO color que su fondo (invisibles).
     Ahora usan `--theme-hairline`. Estados `disabled` sin señal visual,
     corregido con un estilo "apagado" explícito.
   - Zoom del mapa: `keepBuffer: 150` (miles de teselas vivas en el DOM) y
     `updateWhenZooming: true` (peticiones a mitad de gesto que llegaban
     tarde y se veían en blanco). Bajado a `keepBuffer: 4`,
     `updateWhenZooming: false` — las teselas se sirven igual desde la
     caché del service worker, no afecta al modo sin cobertura.

## Qué sigue roto / pendiente de medida

- **`.103` desfasada** (5.1.3, debería estar en 5.4.0). Sincronizar en
  cuanto el usuario confirme que 5.4.0 está bien — no antes, para no tener
  que revertir en las dos Pis si algo falla.
- Avisos de área de toque < 44px en la auditoría (iconos de 38px del mapa,
  pestañas de la Mochila de 36px). Decidido no tocar: cambiarlo altera un
  diseño ya aprobado; son avisos, no fallos duros.
- `auditoria-interfaz` no se ha vuelto a lanzar desde 5.0.5 (antes de todo
  este bloque). Falta una pasada limpia sobre 5.4.0.
- Icono de "Volver a bajar o mapa" en Ferramentas: ya es SVG (arreglado en
  5.3.0), confirmar que no ha quedado ningún emoji suelto en una nueva
  auditoría visual.
- No hay alerta automática si `.103` se queda atrás del despliegue.

## Qué se está haciendo ahora

Esperando feedback del usuario sobre 5.4.0 (fundido a negro, Mesa, scroll
de Ferramentas, botones con marco, zoom del mapa) antes de continuar.

## Siguiente paso concreto

1. Cuando el usuario confirme 5.4.0: sincronizar `.103` al mismo commit
   (`75eaf47`) con el flujo de bundle habitual (ver DECISIONS.md).
2. `node run.mjs auditoria-interfaz` y `node run.mjs animaciones` sobre
   5.4.0 para tener una medida limpia post-bloque.
3. Seguir con lo que quede en TODO.md bajo P2.
