# Walkthrough: SAGA Engine v3.9.3 Bug Fixes

## 1. Corrección de Iconos y Nombres (Objeto QR vs Coleccionable)
- Se ha corregido la confusión de tipos de nodo. Ahora el "Coleccionable de mapa" (Minijuego coleccionable) muestra el nombre **Coleccionable** y su icono `⭐`.
- La tarjeta QR física vuelve a ser correctamente **Objeto QR** con su icono `🖨️`.

## 2. Checkpoint Pista retirado de la lista de minijuegos
- Se ha eliminado la duplicidad del **Checkpoint / Pista** en el panel de cambio de tipo de nodo. 
- Ahora, si pulsas "Minijuego o Desafío", el *Checkpoint* ya no aparece en la lista interna de minijuegos, dejando exclusivamente los minijuegos reales (Laberinto, Audio, etc.), y conservando su botón principal en el selector para cuando solo quieras texto/pista normal.

## 3. Líneas del Mapa (Zoom)
- Se ha corregido el error por el cual las líneas del sendero (Overpass) desaparecían al hacer zoom extremo.
- Leaflet ha sido configurado para renderizar los trazados internamente usando Canvas en lugar de SVG y evitar el clipping indeseado (`noClip: true` y `preferCanvas: true`). Ahora las líneas amarillas estarán visibles independientemente de la ampliación.

## 4. Despliegue en Raspberry Pi
- Se comprobó que el script de despliegue usado en la anterior ocasión (`deploy_frontend.py`) no incluía los archivos del Admin, por lo que tus cambios nunca llegaban a la Raspberry.
- Hemos lanzado el script completo (`deploy_src.py`) que reempaqueta todo el motor y el frontend, reconstruye en el contenedor de la Raspberry, e inyecta la versión actualizada.

> [!TIP]
> Por favor, entra al panel de administrador en la Raspberry y prueba hacer zoom en el mapa y comprueba los nombres y los selectores de los nodos.
