# SAGA Engine v3.9.8 — Consolidación de QR físicos, Leaflet, rutas OSM y HUD

SAGA Engine v3.9.8 reúne en una sola release las mejoras y hotfixes recientes del editor admin para dejar ordenadas las notas: tarjetas QR físicas renovadas, rutas Leaflet estables a cualquier zoom, edición de nodos más precisa y HUD sincronizado en tiempo real.

## Cambios principales

### QR físicos, títulos y panel unificado
- Rediseño de tarjetas QR físicas con soporte claro para **Objeto QR**, **Llave QR**, **Pista QR** y **Bonus QR**.
- Los títulos de QR, coleccionables y nodos se editan desde los inputs principales del editor para evitar duplicidades.
- La impresión QR valida mejor los nodos físicos y alinea el payload impreso con las pegatinas reales.

### Leaflet, zoom y trazados OSM más robustos
- Correcciones de clipping para evitar que rutas, senderos y polilíneas desaparezcan al hacer zoom.
- Uso de renderer específico para líneas vectoriales y ajuste con `noClip` sin romper capas base ni trazados amarillos.
- Se añade basemap OSM estándar y refresco dinámico de rutas al desplazar el mapa.

### Edición de rutas y HUD en tiempo real
- El arrastre de líneas vuelve a insertar waypoints correctamente sin seleccionar puntos intermedios no deseados.
- El HUD recalcula al instante distancia y métricas mientras se mueven nodos.
- Nuevo playback de ruta con marcador animado sobre Leaflet.

### Robustez y contenido
- Restaurado perfil OSRM peatonal para cálculo de rutas.
- Añadido texto narrativo en gallego a los stages.
- Corregidos errores TypeScript en `printQrs` y en el scope del canvas renderer.
