# mixamo4: el motor de los avatares 3D (fuente)

Banco de pruebas y **fuente** del motor que usa la aplicación. Lo que se afina aquí se porta a la
app con `node frontend/scripts/portar-motor-mixamo.mjs` (genera `frontend/src/player/avatares3d/mixamo/motor/`,
que no se edita a mano).

| Fichero | Qué es |
|---|---|
| `motor.js` | Máquina de estados (idle/andar/correr), capas por grupos de huesos, giro en el sitio, gestos, objetos de mano con clips de agarre horneados |
| `clips.js` | Grupos de huesos y recorte de clips |
| `avatar.js` | Motor + aspecto (tinte) + complementos que no se agarran (casco, boina, sombrero, mochilas, zocas) |
| `look.js` | Tinte de ropa y pelo por shader |
| `acc.js` | Complementos procedurales (geometría de three.js, cero descargas) |
| `fusion.js` | Junta las piezas estáticas de un objeto por material (menos llamadas de dibujo) |
| `stage.js` | Escenario del banco y clonado de modelos |
| `optimizar_hold.mjs` | Aligera los `hold_<Ch>.glb` de Blender para el móvil |
| `blender/` | Autoría en Blender de los agarres: `author.py` hornea `hold_<Ch>.glb` (clips de brazo y dedos + objetos) |
| `index4.html`, `shoot4.mjs`, `serve4.mjs` | Páginas y capturas del banco (`mode=engine`, `objetos`, `avatar`, `clipview`) |

## Activos: NO están en el repositorio

Los personajes y animaciones son de **Mixamo (Adobe)** y su licencia no permite redistribuir los ficheros.
En el repo hay sólo código y el manifiesto con los **nombres** (`frontend/src/player/avatares3d/mixamo/manifiesto.json`).
Los GLB viven en `assets_privados/avatares/` (ignorada por git) y se despliegan con `scripts/desplegar_avatares.ps1`.
No se usa ninguna animación de otras fuentes sin licencia clara: sólo `lo__*` y `ge__*` de Mixamo.

## Cadena de preparación (en un equipo con los FBX descargados)

1. Convertir y optimizar los FBX a GLB (meshopt, texturas WebP 512; animaciones sin escala): `out/anims.glb`, `out/<Ch>_512.glb`.
2. `blender -b --python blender/author.py -- <carpeta> <Ch> <salida>` para cada personaje -> `hold_<Ch>.glb`.
3. `node optimizar_hold.mjs <carpeta m4> <carpeta m4/opt>`: deja en los `hold_*` sólo lo que usa el motor y los comprime (~285 KB cada uno).
4. `node frontend/scripts/preparar-avatares.mjs <carpeta>` copia todo a `assets_privados/avatares/` con la huella en el nombre y escribe el manifiesto.
5. Servidor local + `python scripts/hornear_avatares_mixamo.py` para los retratos; de nuevo `preparar-avatares.mjs` para el manifiesto.

El banco busca los activos en `MIXAMO_DIR` (por defecto `assets_privados/mixamo-trabajo`, con `out/` y `m4/`) y escribe las capturas en `SHOOT_OUT`.
