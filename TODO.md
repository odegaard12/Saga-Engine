# Trabajo pendiente — Saga-Engine

> P0 bloquea el funcionamiento · P1 funcionalidad importante · P2 UX,
> rendimiento · P3 limpieza y documentación.
> No se cambia de prioridad por capricho. Se trabaja una sola a la vez.

## P0 — bloquea

_(vacío)_

## P1 — funcionalidad importante

### Entrada al juego (bloque 1, lo más gordo)
- [ ] **Los permisos van DENTRO de la pantalla de carga.** Hoy "antes de
      salir" aparece *después* de que la carga se funda, y por eso se ve el
      mapa en blanco por detrás. Movimiento, cámara y brújula se piden en la
      propia pantalla de carga; al completar o pulsar "seguir", ESO es lo que
      se difumina, y detrás ya está el mapa guardado. Mata de raíz dos quejas
      a la vez: "sale muy rápido" y "la animación sale con el mapa en blanco".

### Hojas: hueco vacío (bloque 2)
- [ ] **Mochila · Guía**: muchísimo espacio vacío, todo pegado arriba.
- [ ] **Mochila · Obxectos**: igual.
- [ ] **Mochila · Mesa**: diseño viejo ("Forjar el Sello") y mucho hueco.
- [ ] **Clasificación**: la lista no llega abajo, queda una franja de tarjeta
      sin completar y hay que deslizar para ver jugadores que deberían verse.
- [ ] Causa común probable: el alto fijo de 78dvh que puse para igualar las
      tres pestañas dejó hueco cuando el contenido es corto. Hay que hacer
      que el contenido LLENE, no que la hoja encoja.

### Login (bloque 3)
- [ ] Los nombres aparecen de golpe: deben entrar escalonados, cayendo hacia
      abajo uno tras otro.
- [ ] Al pulsar un jugador no pasa nada visible durante ~1s. Hace falta
      respuesta inmediata al toque.

## P2 — UX / rendimiento

### Pulido (bloque 4)
- [ ] **Cámara**: diseño anticuado, y abre y cierra de golpe.
- [ ] **Mapa**: al desampliar la animación es brusca (ampliar está bien).
- [ ] **Ferramentas**: algunos botones quedan feos.
- [ ] **Barra inferior**: en Mochila y Ferramentas queda demasiado hueco
      abajo, y los textos de la barra piden más tamaño.

- [ ] **Áreas de toque restantes**: iconos del mapa (38px) y pestañas de la
      Mochila (36px). Son avisos, no fallos: subirlos cambia un diseño ya
      aprobado. Decidir con intención, no por el aviso.
- [ ] **Sensación de lentitud al gestualizar.** El intervalo del inventario
      se subió de 2s a 4s como candidato, no como prueba. Falta medir
      fotogramas perdidos durante un gesto real.
- [ ] **Icono de recarga del mapa** sigue siendo un emoji (`🗺️`) dentro de
      Ferramentas; el resto ya son SVG en línea.

### Infraestructura
- [ ] **Nada avisa si `.103` se queda atrás.** Hoy se sincroniza a mano tras
      cada despliegue. Falta la comprobación automática que lo cante.
- [ ] **Túnel de Cloudflare apunta sólo a `.104`.** Si cae la titular, el
      dominio público cae con ella aunque `.103` esté sana.

## P3 — limpieza / documentación

- [ ] `docs/plan-de-mejora.md` va por §1.21; recoger en él el bloque 5.1.0.
- [x] `getOverlayStyle` estaba sin usar en `PlayerHud.tsx`: borrado.
- [x] `sagaLoginRise` **nunca existió como `@keyframes`**: las hojas pedían una
      animación que no estaba definida. Otra razón por la que no se movían.

## Hecho recientemente

- [x] 5.1.3 — El temporizador que desmonta corría la misma carrera que la
      transición y la ganaba siempre: ahora manda `onTransitionEnd`.
- [x] 5.1.3 — El escenario `animaciones` reescrito sobre eventos del
      navegador, porque contando fotogramas mentía.
- [x] 5.1.1 — La Clasificación se desmontaba desde fuera de la hoja.
- [x] `.103` sincronizada a 5.1.3.
- [x] 5.1.0 — Las tres causas del "todo de golpe" en las animaciones.
- [x] 5.1.0 — Barra inferior más baja, hojas apoyadas en el borde, alturas
      uniformes en la Mochila, aire sobre el título de Ferramentas.
- [x] 5.1.0 — Escenario `animaciones` en el banco.
- [x] 5.0.5 — La insignia "Preparado" salía a 8px.

## Hecho recientemente (5.4.0)

- [x] Fundido a negro real en el relevo carga→juego (capa negra propia,
      no un crossfade rápido).
- [x] Mesa de trabajo con tarjeta sólida real, insignia redonda del tema.
- [x] Ferramentas no se podía desplazar: `display: grid` rompía el
      `flex: 1` del contenedor que rueda. Vuelto a `flex column`.
- [x] Botones "transparentes sin marco": el borde estaba pintado del
      mismo color que el fondo. Ahora usan `--theme-hairline`.
- [x] Botones sin estado visual al desactivarse (`disabled` sin CSS).
- [x] Zoom del mapa poco fluido y en blanco al desampliar: `keepBuffer`
      de 150 a 4, `updateWhenZooming` a false.
