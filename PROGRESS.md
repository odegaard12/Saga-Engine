# Estado del proyecto — Saga-Engine

> Este fichero se actualiza al cerrar cada bloque de trabajo. Se lee ANTES de
> tocar nada, para no volver a descubrir el proyecto desde cero.

**Última actualización:** 2026-09-16 · versión desplegada **5.1.0** (`8b834ec`)

## Qué está funcionando

- Juego de campo completo: nodos, GPS, QR, minijuegos, mochila, mesa de
  trabajo, clasificación, misión offline.
- Alta disponibilidad: `.104` titular, `.103` respaldo, réplica por cron.
- Público en https://sagagia.es (Cloudflare Tunnel → 192.168.68.104:8096).
- Banco de pruebas Playwright con 6 escenarios (`sim/playwright-bench`).
- Diseño "B" (tarjeta sólida) aplicado en las cinco superficies del jugador.

## Qué se acaba de cambiar (5.1.0)

Las animaciones del jugador, reportadas como "todo de golpe" tres veces
seguidas. Tres causas distintas, todas invisibles leyendo el CSS:

1. El velo de salida de la carga se montaba en un `useEffect` (pasivo →
   corre después de pintar), así que el navegador pintaba el juego desnudo
   antes de que el velo existiera. Ahora se decide durante el render.
2. El velo era sólo el degradado: el logo y el porcentaje desaparecían en
   seco. Ahora el velo lleva dentro la propia pantalla de carga.
3. El fondo de "antes de salir" tenía una `transition` pero ningún cambio de
   valor. Una transición sin cambio no transiciona. Ahora entra con
   `sagaCapaEntra`.

Además: las tres hojas entran y salen con un solo movimiento (antes la
Clasificación no tenía ninguno y las otras dos tenían una `animation` que le
ganaba a la `transform`); barra inferior más baja; hojas apoyadas en el borde
con curva sólo arriba; alto fijo en las tres pestañas de la Mochila; aire
sobre el título de Ferramentas.

## Qué sigue roto / pendiente de medida

- Avisos de área de toque < 44px en la auditoría (iconos de 38px, pestañas de
  36px). Decidido no tocar hasta tener medida de fallos reales de pulsación.
- La Clasificación no separa "Terminados" de "En ruta".
- `.103` (respaldo) puede estar por detrás de `.104`; comprobar tras deploy.

## Qué se está haciendo ahora

Verificar 5.1.0 con el escenario `animaciones` del banco (recién creado) y
con `auditoria-interfaz`.

## Siguiente paso concreto

`node run.mjs animaciones` contra la Pi y corregir lo que salga en rojo.
