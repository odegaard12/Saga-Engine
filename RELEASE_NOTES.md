# SAGA Engine v3.9.7 — Tarjetas QR físicas, rutas Leaflet estables y pulido del editor

SAGA Engine v3.9.7 consolida el rediseño de tarjetas QR físicas, mejora la estabilidad visual de las rutas y senderos en Leaflet, y pule la edición del panel de administración con métricas en tiempo real y títulos editables.

## Cambios principales

### Tarjetas QR físicas y edición de contenido
- Rediseño de tarjetas con soporte visual para **Objeto QR**, **Llave QR**, **Pista QR** y **Bonus QR**.
- Los títulos de QR y coleccionables ahora se editan desde los mismos campos principales del editor.
- Se añadieron textos narrativos en gallego a los stages para completar el contenido de la misión.

### Leaflet, rutas y HUD
- Correcciones de clipping y renderizado para evitar desapariciones de senderos y rutas al hacer zoom.
- Nueva animación de playback de ruta con marcador sobre Leaflet en el HUD de admin.
- Las métricas del HUD se sincronizan al instante al arrastrar nodos del mapa.

### Hotfixes agrupados de v3.9.7.1
- Inserción correcta de waypoints al arrastrar líneas y actualización dinámica de rutas al mover el mapa.
- Ajustes con renderer específico y `noClip` para mantener visibles las líneas sin afectar capas base o trazados amarillos.
- Correcciones en impresión y validación de QR físicos para que el payload y las comprobaciones coincidan con sus nodos reales.
- Resueltas incidencias TypeScript en `printQrs` y en el scope del canvas renderer.
