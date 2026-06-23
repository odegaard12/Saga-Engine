# SAGA v0.1.1 — Validación juego 1: Señal GPS

## Decisión

Mantener el juego.

“Señal GPS” no es una chorrada: es el núcleo jugable mínimo de SAGA. Convierte un punto del mapa en una prueba real de campo: llegar al sitio, detectar señal, mantener posición y avanzar.

## Problemas detectados

1. El umbral configurado en catálogo era 65, pero el runtime lo reducía artificialmente a máximo 30.
2. El jugador veía comandos en inglés: WEAK, RISING, HOLD, LOCKED.
3. El botón Reintentar GPS limpiaba estado visual, pero no forzaba claramente un nuevo watcher GPS.

## Correcciones

- El runtime respeta `lock_threshold`.
- Textos principales del runtime pasan a español:
  - BUSCAR
  - DÉBIL
  - CERCA
  - MANTÉN
  - CAPTURA
- “Signal lock” pasa a “Captura GPS”.
- “Signal” pasa a “Señal”.
- Reintentar GPS limpia watcher anterior y lanza nuevo intento.
- Mensajes de GPS y falta de coordenadas son más claros.

## Criterio de juego

Con `source_radius_m = 75` y `lock_threshold = 65`, el jugador debe acercarse bastante al punto real antes de capturar.

No debe completar desde lejos.

## Test manual recomendado

1. Crear nodo Señal GPS.
2. Poner radio visible 50-75 m.
3. Abrir player en móvil.
4. Lejos del punto:
   - debe mostrar DÉBIL o CERCA;
   - no debe completar.
5. Cerca del punto:
   - debe mostrar MANTÉN;
   - tras 1-2 segundos debe completar.
6. Denegar GPS:
   - debe mostrar permiso bloqueado.
7. Pulsar Reintentar GPS:
   - debe pedir/usar posición de nuevo.
8. Confirmar avance al siguiente nodo.

## Próximo juego

Después de validar este, revisar “Rumbo con brújula”.
