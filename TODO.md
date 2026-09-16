# Trabajo pendiente — Saga-Engine

> P0 bloquea el funcionamiento · P1 funcionalidad importante · P2 UX,
> rendimiento · P3 limpieza y documentación.
> No se cambia de prioridad por capricho. Se trabaja una sola a la vez.

## P0 — bloquea

_(vacío)_

## P1 — funcionalidad importante

- [ ] **Respaldo `.103` desfasado.** Comprobar versión y sincronizar tras cada
      despliegue a `.104`. Hoy no hay nada que avise si se queda atrás.
- [ ] **Túnel de Cloudflare apunta sólo a `.104`.** Si cae la titular, el
      dominio público cae con ella aunque `.103` esté sana.

## P2 — UX / rendimiento

- [ ] **Áreas de toque por debajo de 44px**: iconos del mapa (38px) y pestañas
      de la Mochila (36px). La auditoría los avisa. Decidir si se suben o se
      acepta el aviso con razón escrita.
- [ ] **Clasificación sin separar** "Terminados" de "En ruta": hoy es una
      lista sola y el podio manda sobre gente que aún camina.
- [ ] **Sensación de lentitud al gestualizar.** El intervalo del inventario
      se subió de 2s a 4s como candidato, no como prueba. Falta medir
      fotogramas perdidos durante un gesto real.
- [ ] **Icono de recarga del mapa** sigue siendo un emoji (`🗺️`) dentro de
      Ferramentas; el resto ya son SVG en línea.

## P3 — limpieza / documentación

- [ ] `docs/plan-de-mejora.md` va por §1.21; recoger en él el bloque 5.1.0.
- [x] `getOverlayStyle` estaba sin usar en `PlayerHud.tsx`: borrado.
- [x] `sagaLoginRise` **nunca existió como `@keyframes`**: las hojas pedían una
      animación que no estaba definida. Otra razón por la que no se movían.

## Hecho recientemente

- [x] 5.1.0 — Las tres causas del "todo de golpe" en las animaciones.
- [x] 5.1.0 — Barra inferior más baja, hojas apoyadas en el borde, alturas
      uniformes en la Mochila, aire sobre el título de Ferramentas.
- [x] 5.1.0 — Escenario `animaciones` en el banco.
- [x] 5.0.5 — La insignia "Preparado" salía a 8px.
