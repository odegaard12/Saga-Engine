# Estado del proyecto — Saga-Engine

> Este fichero se actualiza al cerrar cada bloque de trabajo. Se lee ANTES de
> tocar nada, para no volver a descubrir el proyecto desde cero.

**Última actualización:** 2026-09-16 · `.104` en **5.1.3** (`237309d`) ·
`.103` igualada

## Qué está funcionando

- Juego de campo completo: nodos, GPS, QR, minijuegos, mochila, mesa de
  trabajo, clasificación, misión offline.
- Alta disponibilidad: `.104` titular, `.103` respaldo, réplica por cron.
- Público en https://sagagia.es (Cloudflare Tunnel → 192.168.68.104:8096).
- Banco de pruebas Playwright con 6 escenarios (`sim/playwright-bench`).
- Diseño "B" (tarjeta sólida) aplicado en las cinco superficies del jugador.

## Qué se acaba de cambiar (5.1.0 → 5.1.3)

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

Y dos cosas más que sólo salieron cuando el banco dejó de mentir:

4. La primera versión del escenario `animaciones` contaba fotogramas
   intermedios, y para el mismo código sin tocar daba 7, 6 y 0 en la misma
   hoja: en Chromium sin ventana el bucle de `requestAnimationFrame` va
   irregular. Ahora pregunta por `transitionend` / `animationend`, que trae
   `elapsedTime` y no depende de que nadie mire.
5. Con la medida limpia: todas las entradas duraban 260ms exactos y **ninguna
   salida disparaba evento**. El temporizador que desmonta duraba lo mismo que
   la transición, y esa carrera la gana siempre el temporizador —la transición
   arranca un fotograma más tarde, cuando React ha repintado—. La hoja se
   borraba con el movimiento a medias. Ahora manda `onTransitionEnd`.

También: la Clasificación hacía `if (!open) return null` por encima de la
hoja, desmontándola antes de que pudiera salir.

## Qué sigue roto / pendiente de medida

- Avisos de área de toque < 44px en la auditoría (iconos de 38px, pestañas de
  36px). Decidido no tocar hasta tener medida de fallos reales de pulsación.
- La Clasificación no separa "Terminados" de "En ruta".
- `.103` se sincroniza a mano después de cada despliegue a `.104`. No hay
  nada que avise si se queda atrás.

## Qué se está haciendo ahora

`animaciones` pasa con **0 fallos** en 5.1.3. Toca volver a
`auditoria-interfaz`, que no se lanza desde 5.0.5 y por tanto no ha visto
ninguno de los cambios de maquetación de esta tanda (hojas apoyadas en el
borde, alto fijo, cabeceras pegajosas).

## Siguiente paso concreto

1. `node run.mjs auditoria-interfaz` contra `.104`.
2. `node run.mjs album-diseno` para tener las nueve capturas al día.
