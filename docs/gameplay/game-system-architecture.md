# SAGA Game System Architecture v1

## Objetivo

SAGA debe pasar de ser un editor técnico de nodos a una herramienta para crear juegos reales de forma visual, reutilizable y segura.

La regla principal es:

- **Familia** = motor reutilizable.
- **Juego** = preset/variante editable dentro de una familia.
- **Completado** = cómo se supera el nodo.
- **Requisito** = qué necesita el jugador antes de abrir o superar el nodo.
- **Inventario** = objetos, llaves, pistas y bonus recogidos por el jugador.

No debemos crear un motor nuevo para cada juego si se puede resolver como variante visual/configurable de una familia.

## Regla offline obligatoria

SAGA debe diseñarse offline-first.

Ningún juego nuevo se considera terminado si no tiene camino offline. No se acepta `online_only` como estado final. Fotos, QR, códigos, secuencias y pruebas de equipo deben poder guardar evento local y sincronizar después.


## Estado actual

Motores runtime reales actuales:

| Familia runtime | Estado | Uso |
|---|---:|---|
| `signal_hunt` | real | GPS, radio, proximidad, señal |
| `bearing_hunt` | real | rumbo/brújula |
| `circuit_matrix` | real/parcial | puzzle lógico/circuito |

Catálogo admin actual:

- 13 juegos/presets visibles en admin.
- 4 plantillas de misión.
- Algunos juegos ya son runtime real.
- Otros son todavía presets admin y deben marcarse como tal hasta tener flujo player propio.

## Capas del sistema

### 1. Familia

Motor base que el player sabe ejecutar.

Ejemplos:

- GPS / exploración.
- Orientación / brújula.
- Puzzle / lógica.
- Físico / inventario.
- Foto / evidencia.
- Equipo / multijugador.

### 2. Juego

Preset editable que usa una familia.

Ejemplos:

- Frío/caliente.
- Foto del lugar.
- Palabra clave.
- Llave QR.
- Código secuencial.

### 3. Método de completado

Cómo se supera el nodo.

Valores recomendados:

| Método | Significado |
|---|---|
| `proximity` | llegar/estar dentro del radio |
| `hold` | mantenerse dentro durante X tiempo |
| `bearing` | orientar brújula al rumbo correcto |
| `puzzle` | resolver puzzle visual |
| `manual_code` | introducir palabra/código |
| `sequence` | introducir secuencia |
| `qr_complete` | escanear QR para completar nodo |
| `photo` | hacer foto dentro del radio |
| `inventory_only` | recoger objeto sin avanzar ruta |
| `team` | requiere condición de equipo |

### 4. Requisito

Condición necesaria para abrir o completar un nodo.

Ejemplos:

- tener llave QR;
- tener objeto;
- tener pista;
- haber completado nodo anterior;
- estar dentro del radio;
- estar con otro jugador.

### 5. Inventario

Objetos del jugador:

| Tipo | Uso |
|---|---|
| `collectible` | objeto opcional |
| `key` / `requirement` | llave para desbloquear |
| `clue` | pista visible en mochila |
| `bonus` | extra/recompensa |
| `proof` | evidencia/foto/manual |

## QR: separación correcta

QR no debe significar una sola cosa. Debe poder ser:

### QR coleccionable

Escanear guarda objeto en mochila. No necesariamente completa nodo.

### QR llave

Escanear guarda llave. Sirve como requisito de otro nodo.

### QR pista

Escanear guarda pista consultable.

### QR bonus

Escanear guarda recompensa opcional.

### QR de completado

Escanear completa el nodo. Debe ser explícito con `completion_method: qr_complete`.

## Familias recomendadas

## 1. GPS / exploración

Motor: posición, radio, distancia, permanencia, señal.

Juegos recomendados:

| Juego | Estado | Offline |
|---|---:|---:|
| Llegar al punto | runtime ready | sí |
| Frío/caliente | preset / planned | sí |
| Mantenerse dentro | planned | sí |
| Zona invisible | planned | sí |
| Ruta por checkpoints | planned | sí |
| Foto dentro del radio | planned/runtime próximo | parcial |
| Punto con pista contextual | preset | sí |
| Búsqueda amplia | planned | sí |

## 2. Orientación / brújula

Motor: rumbo, tolerancia, secuencia de direcciones.

Juegos recomendados:

| Juego | Estado | Offline |
|---|---:|---:|
| Rumbo único | runtime ready | sí |
| Mira al norte/sur/oeste | runtime ready | sí |
| Sigue el rumbo | planned | sí |
| Triangulación | preset / planned | sí |
| Brújula + distancia | planned | sí |
| Secuencia de rumbos | planned | sí |
| Orientación con pista textual | preset | sí |

## 3. Puzzle / lógica

Motor: código, secuencia, patrón, puzzle visual.

Juegos recomendados:

| Juego | Estado | Offline |
|---|---:|---:|
| Circuito lógico | runtime parcial | sí |
| Palabra clave | planned próximo | sí |
| Código numérico | planned próximo | sí |
| Secuencia de palabras | planned próximo | sí |
| Ordenar pistas | planned | sí |
| Matriz lógica | planned | sí |
| Candado multipista | planned | sí |
| Pregunta-respuesta | planned | sí |

## 4. Físico / inventario

Motor: QR/NFC/manual, mochila, requisitos.

Juegos recomendados:

| Juego | Estado | Offline |
|---|---:|---:|
| Recoger objeto QR | runtime ready | offline ready |
| Recoger llave QR | runtime ready | offline ready |
| Pista QR | runtime ready | offline ready |
| Bonus QR | runtime ready | offline ready |
| Nodo bloqueado por llave | runtime ready | sí |
| Entregar/consumir objeto | runtime ready | sí |
| Combinar objetos | planned | parcial |
| Pista opcional | planned | sí |

## 5. Foto / evidencia

Motor: cámara, ubicación, foto asociada a nodo/mapa.

Juegos recomendados:

| Juego | Estado | Offline |
|---|---:|---:|
| Foto libre en mapa | runtime parcial | offline parcial / cola local |
| Foto de exploración | planned próximo | offline planned / cola local obligatoria |
| Foto de equipo | planned | offline planned / modo capitán |
| Foto de objeto | planned | offline planned / cola local |
| Álbum de ruta | runtime parcial | offline partial / sincronización pendiente |
| Foto como pista compartida | planned | offline planned / sincronización posterior |
| Foto antes/después | planned | offline planned / cola local |

## 6. Equipo / multijugador

Motor: presencia, roles, estado compartido.

Juegos recomendados:

| Juego | Estado | Offline |
|---|---:|---:|
| Relevo simple | planned | capitán |
| Dos jugadores en zonas distintas | planned | offline planned / modo capitán primero |
| Capitán/equipo | planned | capitán |
| Jugador A da pista a jugador B | planned | offline planned / modo capitán primero |
| Votación | planned | offline planned / evento local |
| Prueba simultánea | planned | offline planned / no realtime todavía |
| Carrera cooperativa | planned | parcial |

Esta familia debe ir después. Es la más delicada.

## Offline

### Nivel 1: offline individual

Prioridad alta.

- Descargar misión.
- Completar nodos localmente.
- Guardar eventos.
- Sincronizar después.

### Nivel 2: equipo con capitán

Prioridad media.

- Un móvil actúa como capitán.
- El equipo juega físicamente junto.
- Solo un dispositivo sincroniza progreso.

### Nivel 3: multi-móvil offline real

Prioridad baja.

Requiere sincronización local entre dispositivos: Bluetooth, WebRTC, LAN o similar. No hacerlo ahora.

## Estados de juego

Cada juego del catálogo debe tener un estado explícito:

| Estado | Significado |
|---|---|
| `runtime_ready` | se puede jugar y completar en player |
| `runtime_partial` | existe mecánica, pero falta pulido |
| `preset_only` | visible en admin, no runtime propio |
| `planned` | diseñado, todavía no implementado |
| `hidden` | no mostrar al usuario final |

## Reglas de admin

El admin debe mostrar siempre:

- qué hace el jugador;
- cómo se completa;
- si requiere GPS;
- si usa QR/foto/código;
- si funciona offline;
- si es plantilla o runtime real.

No debe prometer como juego completo algo que solo es preset.

## Reglas de player

El player debe decidir por `completion_method` y `game_id`, no solo por familia.

Ejemplos:

- `completion_method: photo` abre cámara.
- `completion_method: manual_code` abre input de palabra/código.
- `completion_method: qr_complete` abre escáner QR y completa.
- `completion_method: inventory_only` guarda objeto sin avanzar.
- `completion_method: proximity` usa radio/GPS.
- `completion_method: puzzle` abre runtime de puzzle.

## Próximos PRs recomendados

### PR 207: estado real del catálogo

Añadir metadata a cada juego:

- `runtime_status`;
- `offline_status`;
- `completion_method`;
- `family`;
- `admin_help`;
- `player_help`.

Objetivo: que el admin no confunda preset con juego real.

### PR 208: foto de exploración runtime

Hacer que `photo_scout` complete nodo al hacer foto dentro del radio.

### PR 209: palabra clave y código secuencial runtime

Hacer que `manual_password` y `sequence_code` tengan UI directa y validación clara.

### PR 210: QR completado vs QR inventario

Separar claramente:

- QR que completa nodo.
- QR que guarda objeto.
- QR que guarda llave.
- QR que guarda pista.
- QR bonus.

### PR 211: limpieza UX admin

Reorganizar editor para que sea visual:

- pestaña Juego;
- pestaña Completado;
- pestaña Requisitos;
- pestaña Mochila/QR;
- pestaña Textos.

## Decisión

Antes de crear más juegos, hay que ordenar el sistema.

La prioridad no es tener 30 juegos, sino tener 6 familias buenas con 5-10 variantes editables y que el admin explique claramente cuáles son jugables ya.


### QR offline

Los QR de inventario son offline-ready.

El admin puede crear tarjetas QR, exportarlas y el player puede leerlas sin consultar al servidor. La validación en campo se hace contra la misión descargada y la mochila local:

- QR de objeto: guarda objeto en mochila.
- QR de llave: guarda llave para requisitos.
- QR de pista: guarda pista consultable.
- QR bonus: guarda recompensa.
- QR de completado: será un método separado, `qr_complete`.

El servidor solo hace sincronización/auditoría posterior. No debe ser necesario para leer y validar el QR durante la partida.
