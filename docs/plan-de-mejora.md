# Plan continuo de mejora

Lo que queda por hacer, ordenado por lo que le pasa a alguien en el monte si no
se hace. No es una lista de deseos: cada punto dice **qué se mide primero**,
porque aquí ya nos ha pasado arreglar cosas que no estaban rotas y dar por
buenas otras sin comprobarlas.

Estado a 21 de agosto de 2026 (actualizado el 30 con 0.0). Producción: **4.9.37**.

---

## 0.0 El mapa podía reventar la aplicación entera — ✅ arreglado en 4.9.37

Reproducido el 27-30 de agosto con `scripts/banco-de-simulacion.js` +
`?debug=1`: un jugador con el GPS listo desde el primer render -el shim de
depuración, pero un móvil real con el permiso ya concedido haría lo mismo-
deja que el mapa intente centrarse (`flyTo`/`flyToBounds`) antes de que el
temporizador de 100 ms que ya arregla el contenedor a 0×0 en iOS Safari
llegue a correr. Con el mapa a 0×0, `map.getCenter()` no tiene centro real y
el cálculo revienta: `Invalid LatLng object: (NaN, NaN)`, capturado por el
ErrorBoundary y **la aplicación entera cae**, pantalla de «SAGA ENGINE NO
PUDO CARGARSE CORRECTAMENTE».

Se descartó primero una hipótesis más estrecha (nodo sin `route_track`): se
reproducía igual con `simple_checkpoint`, y una reproducción a mano con el
clic real de «Modo Prueba GPS» no lo disparaba -son dos caminos de código
distintos-. El de verdad sólo salía con el flujo de `?debug=1`, que es
exactamente el que usa un móvil con el permiso ya dado.

**Arreglo:** el efecto que centra el mapa ahora invalida el tamaño sin
animar en cuanto lo detecta a 0×0, antes de calcular ningún centro. Medido:
3 de 3 caídas antes, 0 de 2 después, mismo camino exacto.

## 1.7 El banco ya anda entre nodos — cierra el hueco que dejó anotado 1.6 — ✅ en 4.9.64

1.6 dejó anotado el hueco: "simular tiempo de camino entre nodos, no solo el
corte de cobertura". Sin eso, un jugador simulado con cobertura buena
mandaba heartbeat+advance de un nodo al siguiente en milisegundos -muy por
debajo de los 2 s mínimos entre latidos del mismo jugador-, así que salían
429 que no significaban nada: ningún jugador de carne y hueso tarda menos
de 2 s en andar de un nodo al siguiente.

**`backend/app/runtime/simulation_bench.py`:** `PASO_HUMANO_MPS = 1.3`
(~4.7 km/h, la media citada en literatura de movilidad peatonal para
adultos en llano) + `distancia_metros()` (haversine, misma fórmula que ya
usa el resto del proyecto). Antes de cada nodo con cobertura, el jugador
simulado espera la distancia real -coordenadas de verdad de la misión,
no inventadas- entre el último nodo en vivo y este, dividida por el paso
humano y comprimida por `factor_velocidad` (25x por defecto: un paseo real
de minutos se queda en segundos de banco). Los nodos EN CORTE no esperan
nada -ahí no se manda nada al servidor, así que no hay heartbeat que
proteger-, y `ruta_larga_caotica` -el perfil que pidió expresamente "que
lleve tiempo analizar"- trae su propio `factor_velocidad: 6.0`, mucho más
cercano al paseo real, para que la prueba larga dure de verdad minutos.

**Trampa encontrada al mismo tiempo:** los nodos de prueba de
`tests/test_o_banco_de_probas_do_panel.py` están a 0.01° de separación -más
de 1 km-, pensados solo para dar coordenadas distintas, no para representar
distancias reales. Con el paseo real activado, ese fichero solo (26 tests)
pasó a tardar minutos de verdad en vez de segundos. Arreglado con una
fixture `autouse` que sube `PASO_HUMANO_MPS` a un valor absurdo solo durante
los tests -el código que calcula la distancia y espera se sigue ejecutando
y probando igual, la espera en sí se queda en fracciones de milisegundo-.
Verificado: 26/26 en 59.58 s.

**`sim/playwright-bench/lib/devices.mjs`:** mismo ritmo (`PASO_HUMANO_MPS`,
misma haversine), llevado al navegador de verdad. `andarHasta(context,
desde, hasta, {factorVelocidad, pasosPorSegundo})` mueve la geolocalización
del contexto en varios pasos intermedios vía `setGeolocation()`, no de un
salto -lo que dejaba pendiente 0.7/1.2 desde que se montó el arnés de
Playwright-. Usado por el escenario nuevo (abajo); `team-relay-cobertura`
todavía teletransporta, sin retocar.

**Escenario nuevo, `offline-descargado-antes.mjs`:** la forma realista de
jugar sin cobertura -misión descargada CON wifi, como en casa antes de
salir, y LUEGO cero cobertura, sin fecha de vuelta-, algo que nunca se
había probado con un navegador de verdad. Comprueba: que la app recarga
desde caché ya sin cobertura (no una pantalla en blanco), que se completa
un nodo -código de respaldo, no el minijuego en sí, eso es otro proyecto-
con cero peticiones de red mientras dura el corte, y que al recuperar la
señal sincroniza sola. Construido leyendo el código fuente real de cada
botón y selector (`PlayerApp.tsx`, `InteractionSheet.tsx`, `PlayerHud.tsx`),
no adivinado. **Sin verificar en una corrida real** -no había a mano la
contraseña de admin vigente al escribirlo (`saga-admin-y-pruebas.md` ya
dejó anotado que caducaba)-: sintaxis comprobada (`node --check`), lógica
razonada contra el código fuente, pero pendiente de una corrida real antes
de fiarse del todo.

## 1.6 Ruta larga y caótica — y el banco nunca había mandado un heartbeat — ✅ en 4.9.63

"¿Por qué tan poca duración? Quiero un test más largo, todas las
casuísticas: cortes intermedios, empezar sin cobertura, GPS malo." Nuevo
perfil `ruta_larga_caotica`, todo a la vez -no una variable movida-:

- Empieza SIN cobertura desde el nodo 1 (antes solo existía "sin cobertura
  del todo" o "a mitad de ruta").
- Seis cortes más, sueltos, de duración distinta, repartidos SIN patrón por
  el resto de la ruta -`zonas_muertas_aleatorias()`, con semilla fija para
  poder repetir la misma prueba exacta-.
- GPS degradado todo el rato: a veces sin fix (`gps_status: unavailable`,
  el móvil manda el latido igual, sin coordenadas), a veces con 30-90 m de
  desviación real, no el punto exacto del nodo.
- `MAX_NODOS`: 15 → 40, para que quepa una ruta larga de verdad.

**Al montarla salió un bug real que llevaba escondido desde que se escribió
el banco:** `/api/heartbeat` nunca se había mandado, en NINGUNA prueba,
tampoco con cobertura buena -pese a que el docstring del módulo lo
prometía-. `get_runtime_stages()` -lo que usa esta simulación siempre-
devuelve las coordenadas anidadas en `stage["location"]["lat"/"lon"]`, no
en `stage["lat"]` a secas; el banco miraba el nombre plano, así que
`lat`/`lon` eran `None` siempre y el heartbeat se saltaba en silencio.
Arreglado leyendo `location` primero. Verificado con una prueba directa
contra `_jugador_simulado()`: antes, `{'advance'}`; después,
`{'advance', 'heartbeat'}`.

Con el heartbeat mandándose de verdad salió, de propina, algo que NO es un
bug: con cobertura "buena" (0-80 ms) un jugador simulado se mueve más
rápido que el límite real de `/api/heartbeat` -2 s entre latidos del mismo
jugador-, así que algunos vuelven 429. No rompe nada -el jugador no
camina de verdad entre nodos en el banco, así que esto es una diferencia
real de ritmo entre el banco y un jugador de carne y hueso, no del código-,
queda anotado como el siguiente hueco a cerrar: simular tiempo de camino
entre nodos, no solo el corte de cobertura.

**Prueba de verdad, 30 nodos, 15 jugadores, con el heartbeat ya
arreglado:**

- Duración: 30.5 s (antes 12-15 s en las pruebas cortas -esto sí lleva
  tiempo analizar-).
- 381 peticiones: 135 heartbeat (121 con 200, 14 con 429 -el límite de
  ritmo de arriba, esperado-), 135 advance, 90 lotes de sincronización, 21
  ecos.
- Latencia p50 236 ms, p95 981 ms.
- **Los 15 llegaron a nivel 30/30. Cero errores.**

Verificado: suite completa 542/542 (2 tests nuevos: la función de zonas
aleatorias, y la ruta larga caótica de 30 nodos), más el hallazgo del
heartbeat con su propia prueba dedicada. `tsc -b`/`vite build` limpios.

## 1.5 Orden del catálogo, tope de 20 jugadores, y prueba de carga real — ✅ en 4.9.62

Tres preguntas en una: "¿los 10 juegos están bien ordenados por grupo?",
"mejorar diseño del banco, más funciones, más optimización" y "lanza una
prueba de 15 jugadores en 10 nodos".

**El orden, arreglado sin tocar lo peligroso.** El catálogo real (el orden
del array en `gameCatalog.ts`) no se toca: ese orden es el que usa
`getAdminGameForStage()` para decidir a qué juego cae una misión vieja sin
`game_id` -tocarlo podía cambiar la identidad de nodos reales, ya se dejó
anotado como riesgo hace tiempo-. En su lugar, un `sortedByCategoryForDisplay()`
nuevo que ordena SOLO para mostrar (gps → compass → logic → motion → photo
→ physical → team), aplicado donde el orden se ve de verdad: el selector de
"añadir/cambiar juego" y el panel de familias. Cero riesgo para la
resolución de identidad, orden con sentido para quien mira la lista.

**De paso, un efecto secundario real de 4.9.51: `team_relay` había
desaparecido del selector de crear nodos.** El filtro exigía
`offlineStatus === 'offline_ready'` a secas; team_relay pasó a
`offline_partial` en 4.9.51 (cierto -necesita cobertura de los dos
jugadores-, pero no motivo para esconderlo). Seguía editable en nodos ya
creados, invisible para crear uno nuevo. Arreglado: el filtro ahora solo
excluye `offline_planned` (lo que de verdad no está listo).

**Tope de jugadores: 8 → 20.** "Con 15 jugadores ahoga el ancho de banda,
no la Pi" es un hallazgo real de este proyecto (memoria del 30 de agosto) -
el tope anterior ni dejaba LLEGAR a probar ese número-. Nuevo botón en el
panel, "📈 Prueba grande (15 · a saltos)", para lanzar ese escenario
concreto sin teclear nada -con cuidado de no repetir el mismo fallo de
cierre obsoleto que ya costó el audio_challenge en 4.9.60: `ejecutar()` ahora
acepta los valores como parámetros, no solo leídos del estado que el propio
clic acaba de cambiar-.

**La prueba de carga, hecha y con los cuatro números.** Misión de 10 nodos
variados (checkpoint, circuitos, rumbo, Simón, movimiento, equipo, mosaico,
laberinto, caza-señales, final), 15 jugadores, cuatro pasadas:

| Cobertura | Duración | Peticiones | p50 | p95 | Errores |
|---|---|---|---|---|---|
| corte (vaguada nodos 4-6) | 12.1 s | 128 | 89.6 ms | 749.6 ms | 0 |
| a_saltos (4 cortes por jugador) | 15.1 s | 167 | 581.4 ms | 1437.0 ms | 0 |
| sin_cobertura (todo en un lote) | 11.3 s | 15 | — | — | 0 |
| cliente_antiguo (sin level_before) | 13.0 s | — | — | — | 0 |

Los 15 jugadores llegaron a 10/10 en las cuatro pasadas, sin excepción.
Rastro limpiado y verificado después de cada una.

Verificado: suite completa 539/539, `tsc -b`/`vite build` limpios.

## 1.4 Banco de pruebas: cliente antiguo, y perfiles calibrados de verdad — ✅ en 4.9.61

Pedido explícito: buscar en foros/apps/repos ideas para mejorar el banco
antes de seguir a ciegas. Tres cosas concretas de esa búsqueda:

**Los perfiles de red ya no son números inventados.** "mala" ahora calca
"Slow 3G" de Chrome DevTools/Lighthouse -~150 ms de latencia base, ~2000 ms
por petición bajo carga: es el preset estándar de la industria, no un
número al azar-. "inestable" se queda deliberadamente peor que cualquier
preset con nombre -el tramo con vaguada y roca de por medio-.

**Cliente antiguo, el perfil de versión de app vieja que quedaba
pendiente.** El propio código de `game.py::advance` dice, en un
comentario: "los móviles viejos que no manden `level_before` siguen
funcionando igual que antes". Nuevo perfil `cliente_antiguo`: manda
`/api/advance` sin ese campo, exactamente como lo haría un móvil con el
service worker de hace meses. No se dio por buena la promesa del
comentario -se comprobó-: ruta de 5 nodos, 5 avances sin `level_before`,
los 5 con HTTP 200, nivel final correcto. La promesa era cierta.

**Investigado, no construido esta vez** -para no meter más en un solo
commit-: la simulación GPS actual (`sim/playwright-bench`) teletransporta
la posición de nodo a nodo. Las herramientas de la industria
(`geolocation-simulator`, simuladores de ruta GPX) interpolan el camino a
velocidad de paseo -~5 km/h- entre puntos, que es lo que haría falta para
probar de verdad cosas que reaccionan a la posición EN VIVO -bearing_hunt,
el latido de team_relay- en vez de solo al llegar. Y offline-descargado-
antes -jugar toda la ruta ya predescargada, desde el nodo 1- sigue sin
tener escenario propio en `sim/playwright-bench`: es la otra pieza
pendiente identificada, ninguna construida todavía.

Fuentes consultadas:
[Lighthouse throttling docs](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md),
[Playwright mobile/PWA testing](https://webscraping.ai/faq/playwright/can-i-use-playwright-to-test-progressive-web-apps-pwas),
[simulación de rutas GPS](https://github.com/russellsamora/geolocation-simulator).

Verificado: suite completa 539/539 (1 test nuevo), `tsc -b`/`vite build`
limpios.

## 1.3 Auditoría de las 7 familias que faltaban — ✅ en 4.9.60

"Sigue con todo, corrigiendo todos los errores en bancos, juegos, offline,
funcionamiento". Con las tres ya auditadas (team_relay, bearing_hunt,
motion_challenge), quedaban 7: circuit_matrix y sus cuatro variantes
(logic_circuit, sequence_code, place_mosaic, tilt_maze, spark_radar),
audio_challenge y checkpoint/signal_hunt. Mismo método que las anteriores:
leer cada campo de configuración que el editor deja tocar y comprobar que
el runtime lo lee con el mismo nombre exacto.

**Seis limpias.** logic_circuit, sequence_code (Simón), place_mosaic,
spark_radar y checkpoint: todos los campos del catálogo llegan al runtime
con el nombre correcto, sin sorpresas. tilt_maze igual, con una excepción
menor: `difficulty` aparece en su config y el editor lo deja tocar -entra
por la regla genérica de la categoría "motion"- pero el runtime nunca lo
lee (el laberinto ya tiene grid/agujeros/vidas/tiempo como mandos reales,
así que el impacto es bajo). Anotado, no arreglado esta vez.

**audio_challenge: un bug real, y de los serios -el juego no respondía
nunca al micrófono-.** `checkVolume()` es la función que se llama sola en
bucle (`requestAnimationFrame`) para leer el volumen. Se dispara la
PRIMERA vez justo después de `setActive(true)`, sin esperar al siguiente
render -React no aplica ese cambio hasta entonces-, así que esa primera
llamada seguía viendo `active=false` -el valor de antes del clic, atrapado
en el cierre de esa función- y se paraba en la primera línea. El bucle de
`requestAnimationFrame` nunca llegaba a arrancar: el micrófono SÍ estaba
escuchando de verdad, pero nada leía lo que oía. La barra se quedaba en 0%
para siempre, indistinguible a ojo de "no sopla lo bastante fuerte".

**Arreglo:** un `activeRef` que se pone a `true` en el mismo instante que
`setActive(true)`, sin esperar al render -exactamente el patrón que ya
usan motion_challenge (`completedRef`) y bearing_hunt (`completeSentRef`)
para lo mismo-. `checkVolume()` mira el ref, no el estado. Verificado con
`tsc -b` y `vite build` limpios; no se pudo montar una prueba en vivo con
micrófono falso esta vez (queda pendiente para `sim/playwright-bench`),
pero la causa -un cierre de JavaScript leyendo un valor de antes del
cambio- es inequívoca leyendo el código, sin margen de duda razonable.

Con esto, las 10 familias de minijuegos están auditadas. Antes de diseñar
los 10 juegos nuevos que se pidieron, el catálogo real -qué hay, qué
funciona, qué le falta- está claro por primera vez.

## 1.1b El "0%" de la precarga: encontrado y arreglado — ✅ en 4.9.59

Cierra 1.1. "Sigue con todo, corrigiendo todos los errores" -y este era el
más visible de los pendientes: lo primero que ve cualquier jugador nuevo-.

Diagnóstico en tres pasos, cada uno más fino que el anterior, todos con
`sim/playwright-bench` (no a ojo):
1. Se instrumentó `prefetchMissionMapTiles`'s `onProgress` con un log
   crudo: los números YA llegaban bien -`done` subía de 5 en 5, monótono,
   sin saltos atrás, `total` fijo en 908-.
2. Se instrumentó el punto de `PlayerApp.tsx` justo antes de pasarle
   `progress` a `<SplashScreen>`: el `ratio` calculado ahí también era
   correcto -3.85%, 4.4%, 4.95%... subiendo limpio-.
3. Se instrumentó `SplashScreen.tsx` por dentro: `pctFino` se calculaba
   bien EN CADA RENDER (visto en consola). Pero el `<div>{pctFino}%</div>`
   del DOM se quedaba clavado en el primer valor que le tocó -mientras la
   barra de progreso, la de al lado, SÍ seguía llenándose con los mismos
   datos-. React recalculaba el número correcto por dentro y no lo dejaba
   llegar a ese nodo del DOM.

**Arreglo:** `key={pctFino}` en ese `<div>`. En vez de pedirle a React que
parchee el texto de un nodo que ya existe -que es donde se atascaba, sea
cual sea la razón exacta-, la key fuerza a que trate cada valor nuevo como
un nodo distinto: lo tira y crea uno nuevo. Verificado con 7+ lecturas
reales seguidas cada 3 s, todas correctas y subiendo: 0.6% → 1.7% → 3.3% →
4.4% → 6.1% → 7.2% → 8.8%.

No se llegó a la causa última -por qué React se atascaba parcheando ESE
nodo en concreto y no la barra de al lado, que usa el mismo tipo de
actualización-, y queda dicho con esas palabras: el arreglo está verificado
en la práctica, no explicado del todo en la teoría. `diagnose-tiles.mjs`
se queda en el arnés -sondeando cada 3 s- para cualquier sospecha parecida
en el futuro.

## 1.2 Banco de pruebas: cobertura a saltos y "¿se guarda bien todo?" — ✅ en 4.9.58

Pedido explícito, dos de los cuatro perfiles nuevos que se pidieron para el
banco (versión de app vieja y offline-descargado-antes quedan para la
próxima, ver abajo):

**Cobertura "a saltos"**: no un tramo muerto -eso ya lo hacía "corte"-,
sino entrar y salir de cobertura VARIAS veces en la misma ruta -el camino
con árboles a un lado, sombra de antena a ratos-. Nuevo perfil
`patron_saltos: (3, 1)` -de cada 3 nodos, 1 sin cobertura-: resultó que la
lógica de vaciar la cola ya estaba escrita de forma genérica (se vacía
cada vez que se vuelve a cobertura, no solo la primera), así que solo hizo
falta enseñarle a `sin_cobertura_en` a mirar un patrón además de un tramo
único. Verificado con una ruta de 9 nodos: tres grupos separados
(`nodos_en_corte == [0, 3, 6]`), tres lotes de `events_sync` distintos, no
uno.

**"¿Se guarda bien todo?"**: la pregunta literal. Nueva función
`simular_partida_larga_con_pausa` -y botón "⏸️ Probar pausa y retomar" en
el panel-: un jugador de mentira juega hasta la mitad de la ruta, CIERRA
esa sesión -token tirado, como quien se queda sin batería y vuelve horas
después, no un reintento-, y retoma con una sesión nueva desde donde dice
el SERVIDOR que se quedó. Comprueba DOS niveles, no solo el final: el
intermedio (justo tras la pausa) y el final -si solo se mirara el final,
un fallo que se autocorrige en la segunda sesión podría dar el mismo
número sin que hubiera pasado nada bueno por en medio-.

**Encontró un bug real de infraestructura de pruebas al primer intento,
no del juego**: los tests de este fichero fallaban de forma intermitente y
con un nodo distinto cada vez, según qué otros tests hubieran corrido
antes. La pista: `PLAYER_RATE_LIMITS` -el limitador de `/api/advance`-
vive en memoria del proceso, no en `SAGA_DATA_DIR`, y ningún test lo
reseteaba. Con SIM_01 repitiéndose en cada test del fichero, los tests de
partida larga -los que más llamadas hacen, y los últimos del fichero-
acababan superando el límite y recibiendo un 429 que no tiene campo
`status` en el cuerpo. Arreglado en la fixture `estado_limpo`
(`main.clear_player_rate_limits()`), no en la lógica de la partida -que
nunca estuvo rota-.

Verificado: suite completa 538/538 (5 tests nuevos), y en vivo contra un
servidor real por `curl` (nivel tras la pausa y nivel final correctos,
limpieza de rastro después).

**Pendiente para la próxima** -no llegó esta vez-: perfiles de versión de
app vieja (simular un cliente con la forma de petición de una versión
anterior, para probar compatibilidad hacia atrás del servidor) y
offline-descargado-antes (jugar entero desde el nodo 1 con la misión
predescargada, que solo se puede probar de verdad con
`sim/playwright-bench` -navegador real, IndexedDB real-, no con el banco
httpx).

## 1.1 🔴 La precarga del mapa SÍ descarga teselas reales — el "0%" es el bug

Corrige lo dicho en 0.7 y en el cierre de 1.0: ahí se concluyó "el servidor
de pruebas no tiene teselas reales que servir" tras esperar 60 s sin ver
avanzar el número. Era una conclusión a ojo, sin medir lo suficiente -y
estaba mal-. Pedido directo: "debes crear sistema para que tengas teselas
reales... o hacer algo". Se construyó el "algo": un escenario de diagnóstico
(`sim/playwright-bench`, `diagnose-tiles.mjs`) que lee las peticiones de red
reales y el texto del DOM cada 15 s, en vez de adivinar desde una captura.

**Lo que mide de verdad:** `/map-tiles/{z}/{x}/{y}.png` es un proxy en vivo a
ArcGIS World Imagery (`backend/app/routers/public.py`), no una caché local -
y funciona perfectamente: 0 fallos en más de 300 peticiones seguidas,
~0.3-0.5 s cada una, tanto en directo (`curl` a ArcGIS) como a través del
proxy del propio servidor. El mapa SÍ se está descargando de verdad, tesela
a tesela, a buen ritmo.

**El bug real:** el porcentaje que ve el jugador no refleja ese progreso.
Medido con el mismo escenario: a los 15 s marcaba "3.9%" -un número real-,
a los 30 s había vuelto a "0%", y se quedó en "0%" el resto de la prueba
mientras las peticiones de red seguían subiendo sin parar (111 teselas
servidas a los 45 s). El indicador no solo se congela: puede **retroceder**.
Todo apunta a `PlayerApp.tsx` llamando a `guardarMapa()`/
`prefetchMissionMapTiles()` más de una vez para la misma carga -un remount
o una repetición del efecto reinicia `{done: 0, total: ...}` mientras la
descarga anterior sigue viva de fondo, sin cancelarse de verdad-, pero la
causa exacta del remount no está confirmada todavía: hace falta seguir
mirando `PlayerApp.tsx` alrededor del efecto con dependencia `[user]`
(líneas ~493-630) antes de tocar nada.

**No arreglado esta vez** -es un hallazgo nuevo, no estaba en el plan de
hoy, y merece su propia sesión con cuidado en vez de un parche a última
hora-. Impacto real: es la pantalla que ve TODO jugador nuevo la primera
vez, y le dice "esto no avanza" cuando sí está avanzando. Prioridad alta
para la próxima.

## 1.0 bearing_hunt y motion_challenge: auditados y dados de alta — ✅ en 4.9.57

Pedido explícito: auditar estas dos familias antes de diseñar minijuegos
nuevos. Las dos tenían motor, pantalla (bien construida en los dos casos:
permisos de sensor en iOS, reserva táctil/manual cuando el sensor no
responde) y hasta el editor sabía construir su config -pero **ninguna tenía
entrada en `adminGameCatalog`**, así que ningún organizador podía crear un
nodo de ese tipo desde el panel-. La auditoría encontró dos bugs reales,
además del hueco de catálogo:

**1. `shake_antenna_charge` (arrastraba desde 4.9.52, ver 0.5): confirmado y
arreglado.** Era el `game_id` por defecto de `motion_challenge`, pero esa
misma cadena la usa `runtime-bridge.ts` (jugador) para redirigir misiones
VIEJAS de `signal_hunt` a `circuit_matrix`/`logic_circuit` -una migración
real, de antes de que existiera esta familia-. Cualquier nodo
`motion_challenge` con el valor de siempre acababa mostrando un puzle de
circuitos en vez del reto de movimiento. Verificado que ningún dato real en
producción usaba esa cadena (`grep` sobre `saga.sqlite3`, 0 resultados)
antes de renombrar: `shake_charge`, sin colisión, en los 8 sitios que lo
usaban (frontend y backend). Los dos sitios que SÍ necesitaban seguir
diciendo `shake_antenna_charge` -el redirect legacy y su equivalente en el
admin- se quedan como estaban, documentados con comentarios para que no se
vuelvan a confundir.

**2. `bearing_hunt` nunca leía su propia configuración.** `RuntimeScreen.tsx`
busca el rumbo objetivo y la tolerancia con una lista de nombres de campo
alternativos (`targetBearing`, `target_bearing`, `tolerance`,
`toleranceDeg`...) que **no incluía los nombres reales**
(`target_bearing_deg`, `tolerance_deg`, ver `family-types.ts` y
`getDefaultAdminConfigForFamily`). Daba igual lo que configurara un
organizador: el juego siempre pedía apuntar a 90° con ±18°. Arreglado
añadiendo los nombres reales a la lista de búsqueda.

**3. `motion_challenge` ignoraba `difficulty`.** El editor ya dejaba
tocarlo -aparece en la lista de campos de cualquier juego de categoría
"motion"-, pero `RuntimeScreen.tsx` usaba constantes fijas
(pulsos objetivo, sensibilidad) sin mirar la config. Arreglado: fácil/normal/
difícil ahora escalan pulsos objetivo y sensibilidad de verdad. El resto de
números del formulario (energía objetivo, calor, ritmo de carga...) siguen
sin conectar -se ha quitado del catálogo lo que no hace nada, para no
prometer un control que no hay, y queda anotado en el `editorHint` de la
entrada-.

Dadas de alta en `adminGameCatalog`: `shake_charge` ("Cargar antena") y
`bearing_hunt` ("Caza de rumbo"), con su config real y honesta sobre qué
está conectado.

**Verificación parcial, dicho con todas las letras:** `tsc -b`, `vite
build` y la suite completa (533/533) pasan limpios, y el código se leyó con
cuidado -no a ojo, comparando nombre de campo contra nombre de campo-. Lo
que NO se pudo verificar en vivo esta vez: cómo se ve/juega cada nodo de
verdad en el navegador. El servidor de pruebas suelto tarda varios minutos
en la pantalla de precarga del mapa (0.7/0.9) porque no tiene teselas reales
que servir, y no llegó a completarse ni esperando 60 s. Pendiente para la
próxima sesión con `sim/playwright-bench`: un servidor con mapa ya
cacheado, o un perfil persistente de Playwright.

## 0.9 El icono no era "maskable" de verdad — ✅ en 4.9.56

Feedback sobre la 4.9.55: "el icono cuadrado sobre ese círculo redondo... o
mejor rediseñar ese icono". No era solo gusto: el `manifest.webmanifest`
marca el icono como `"purpose": "any maskable"` -Android (y quien lo pida)
le aplica SU PROPIA máscara encima, del launcher que sea, sea circular o lo
que sea-. Pero el icono tenía su propia esquina redondeada ya cocinada
(`rx="228"` en `saga-app-icon.svg`), y parte del dibujo -la punta de la
bandera del arrow, el pin de abajo- llegaba casi al borde. Cuando el sistema
le encima OTRA máscara, ahí nace de verdad el "cuadrado sobre círculo": no
era la pantalla de carga, era el propio icono el que no seguía la
especificación de iconos maskable (fondo a sangre completa, contenido
importante dentro del círculo de seguridad central).

**Arreglo, en el SVG fuente** (`frontend/public/saga-app-icon.svg`, el resto
son PNGs derivados): fondo sin `rx` -a los cuatro bordes-, todo el dibujo
(la S, la brújula, el pin, los anillos decorativos) reescalado al 78% y
recentrado para caber dentro del círculo de seguridad de 410 px que pide
`icon.spec.whatwg.org`. Regenerados `saga-app-icon-180/192/512.png` desde
ese SVG con Playwright (`sim/playwright-bench`, el mismo arnés del punto
0.7, ahora también sirve para renderizar assets), y en la pantalla de
carga, el `<img>` pasa a `border-radius: 50%` -ya no hay nada que recorte
mal, porque el dibujo ya vive a salvo del borde-. Versión de caché
(`?v=...`) subida en `index.html` y en el propio manifest, para que ni
Cloudflare ni el navegador sigan sirviendo el icono viejo.

Verificado con captura real antes/después. Suite completa 533/533 (cambio
solo de assets + frontend).

## 0.8 La pantalla de carga en fuego: tres geometrías compitiendo — ✅ en 4.9.55

Feedback directo con la primera captura real de esta sesión: "pantalla de
carga fea, sobre todo el icono cuadrado sobre ese círculo redondo". La
captura que se mandó resultó ser del tema por defecto (glass/classic) del
servidor de pruebas suelto, no de fuego -producción tiene `player_theme:
"flame-red"`, verificado contra la Pi antes de tocar nada, para no acabar
editando el tema que no se toca-. Con eso corregido, se repitió la captura
en fuego de verdad (`sim/playwright-bench`, escenario `solo-screenshot`
nuevo) y el problema seguía ahí, más claro incluso: el icono (que ya trae su
propio anillo redondo dibujado dentro) llevaba ADEMÁS un marco de esquina
cortada alrededor -pensado para reemplazar los aros girando de glass sin
meter otro círculo-, y las dos geometrías competían. Tres formas a la vez:
bastidor anguloso, panel cuadrado de esquinas redondeadas, círculo del
icono.

**Arreglo:** se quita el marco. En su lugar, un resplandor -sin bordes, sin
esquinas, un brillo de ascua difuminado detrás del icono que respira en vez
de girar o competir en forma-. El icono en sí no se toca -es el icono real
de la PWA, cambiarlo es una tarea de diseño de marca aparte, no una
corrección de CSS-.

Verificado con captura real antes/después contra el tema de producción, no
a ojo. Suite completa 533/533 (cambio solo de frontend).

## 0.7 Segundo banco de pruebas: navegadores de verdad (Playwright) — ✅ en 4.9.54

Pedido explícito: "¿puede incorporarse tecnologías punteras de simulaciones
que hagan que podamos simular varios teléfonos... android iphone cobertura
cortes juegos de varios a la vez?". El banco de pruebas del panel
(`simulation_bench.py`) es `httpx` puro: peticiones HTTP directas, sin
navegador, sin React, sin Service Worker. No podía responder a la pregunta
sobre `team_relay` -qué ve CADA jugador en SU pantalla, no lo que sabe el
servidor-.

Nuevo, en `sim/playwright-bench/` (herramienta de desarrollo, no se
despliega): N navegadores Chromium de verdad, cada uno con perfil de
dispositivo (iPhone/Android, vía los "devices" de Playwright) y su propia
condición de red por CDP -incluido un corte real, offline de verdad, no solo
lento-, autenticados como jugador de verdad (cookie `saga_player_session`
con un token firmado igual que el banco httpx) contra la misión real.

Dos endpoints nuevos para esto, mismo patrón de guardas que
`/api/admin/simulation/run`:
- `POST /api/admin/simulation/browser-session/start` — registra N SIM_XX
  como perfiles conocidos y devuelve un token de sesión por jugador, listo
  para meter como cookie en un navegador de verdad. No ejecuta nada -solo
  entrega las llaves-.
- `POST /api/admin/simulation/browser-session/stop` — deshace el registro.

**Ya encontró un bug de verdad la primera vez que se usó** (no a ojo): el
`required_members` de 4.9.53 se guardaba desde el editor, pero
`normalize_minigame_config` lo tiraba al leerlo de vuelta -no estaba en el
whitelist de campos de `signal_hunt`-, así que el jugador siempre veía 2,
nunca el número configurado. Arreglado en `backend/app/runtime/minigames.py`
junto con este mismo trabajo.

Verificado en vivo: login de admin real, token real, navegador real
cargando la pantalla de precarga de mapa CON EL TEMA REAL (capturas
guardadas, no simuladas) — la primera vez, en meses, que se ve una captura
de verdad de la app en esta sesión de trabajo, no una reconstrucción. El
escenario `team-relay-cobertura` quedó bloqueado en la pantalla de precarga
de teselas de un servidor de pruebas recién sembrado sin mapa cacheado -no
es un bug de esto, es la app protegiendo el juego offline de verdad-; ver
`sim/playwright-bench/README.md` para el detalle y el siguiente paso
(perfil persistente de Playwright, o correr contra un servidor con teselas).

Verificado: suite completa 533/533 (5 tests nuevos de los endpoints,
3 de `required_members`).

## 0.6 Relevo de equipo tenía el umbral de compañeros fijo en 2 — ✅ en 4.9.53

Pregunta directa tras 4.9.51: "¿por qué dos jugadores y ni más?". Aclaración
+ arreglo: NO había un tope de dos -`cercanos` en `TeamRelayRuntimeScreen`
ya recoge a TODOS los compañeros con latido `live` dentro del radio, sean 2,
5 u 8-. Lo que sí estaba fijo era el **mínimo** para desbloquear
(`requiredMembers = 2`, un número en el código, no en la configuración del
nodo), lo que no tiene sentido para un grupo grande donde el organizador
quiera exigir que se junten 3 o 4 de verdad.

**Arreglo:** nuevo campo `required_members` en la config de team_relay
(`SignalHuntConfig.required_members` en `family-types.ts`), editable por
nodo desde el editor guiado del admin ("Compañeros necesarios"), con 2 como
valor por defecto para no romper misiones ya guardadas sin el campo.

Verificado: `tsc -b` y `vite build` limpios, suite 525/525.

## 0.5 Limpieza: un sistema entero de "controllers" muerto, y familias fantasma en el catálogo — ✅ en 4.9.52

Pedido explícito: "borra familias antiguas, mal orden en juegos, organiza que no
haya duplicados o cosas raras". Auditoría de `frontend/src/player/minigames/core/`
y `frontend/src/admin/lib/gameCatalog.ts`, verificando cada hallazgo por nombre
de export (no solo por ruta de fichero, que puede esconder un re-export via
barrel) antes de tocar nada.

**Muerto de verdad, borrado:** `core/registry.ts` (el `MINIGAME_REGISTRY` y
`getRegisteredMinigame` no los importaba nadie, ni siquiera vía el barrel
`core/index.ts`) y el tipo `RegisteredMinigame` en `registry-types.ts`. Cada
`definition.ts` de familia (circuitMatrix, bearingHunt, signalHunt,
motionChallenge) tenía un `xxxController` construido solo para ese registro
muerto — se borra el wrapper, pero se dejan las funciones
`validateXConfig`/`runXPreflight` que hay debajo: son comprobaciones de
permisos/sensores reales, nunca conectadas al runtime, candidatas a usar
cuando se audite bearing_hunt/motion_challenge en profundidad. También caen
`MinigameController`, `MinigameCompletionPayload` y `MinigameRuntimeState` de
`core/types.ts`, sin ningún consumidor en todo el árbol.

**Catálogo del admin, dos hallazgos reales:**

1. `AdminGameId` tenía 4 ids -`gps_signal_lock`, `hot_cold_search`,
   `bearing_compass`, `three_bearing_triangle`- que no aparecían en
   `adminGameCatalog` ni en ningún otro sitio del repo: puro ruido de tipos.
   Borrados.
2. `shake_antenna_charge` sí es real -es el `game_id` por defecto de la
   familia `motion_challenge`, usado en tres sitios de `AdminApp.tsx`-, pero
   **no tiene entrada en `adminGameCatalog`**, así que `getAdminGame()` cae
   siempre al primer juego de la lista. Y en el jugador,
   `runtime-bridge.ts` redirige cualquier config con ese `game_id` a
   `circuit_matrix`/`logic_circuit` ANTES de mirar la familia real, mientras
   que `InteractionSheet.tsx` lo trata como confirmación de que SÍ es
   `motion_challenge`. Contradicción entre dos ficheros del mismo runtime:
   documentado con un comentario en el tipo, no arreglado todavía -toca
   decidir diseño de juego, no es limpieza mecánica-. Queda como el primer
   punto de la auditoría de `bearing_hunt`/`motion_challenge`.

`team_relay`: el `offlineNote` y `offlineStatus` del catálogo describían el
mecanismo Yjs que se borró en 4.9.51. Corregidos para decir lo que pasa de
verdad: necesita cobertura de los dos jugadores a la vez, no es
`offline_ready`, es `offline_partial`.

Verificado: `tsc -b` y `vite build` limpios (211 módulos, uno menos),
525/525 en la suite.

## 0.4 Relevo de Equipo (multijugador) nunca podía completarse — ✅ en 4.9.51

Auditando el catálogo de minijuegos tras pedir "unos 10 juegos nuevos, si
puede ser jugar entre varios" — antes de diseñar nada nuevo, comprobar si lo
ya construido funcionaba de verdad. `gameCatalog.ts` marcaba `team_relay`
como `runtime_ready`. No lo estaba.

`TeamRelayRuntimeScreen.tsx` exige `activeMembersCount >= 2` compañeros en el
mismo punto para desbloquear el botón. Sacaba esa cuenta de
`useTeamStore.ts`, un store aparte hecho con Yjs
(`new Y.Doc()` + `IndexeddbPersistence('saga-team-sync', ydoc)`) que sólo
persiste en el propio móvil — el comentario del propio archivo admitía que
faltaba "WebRTC o WS en el futuro" para sincronizar entre dispositivos. Cada
jugador veía sus propios cambios y nunca los de nadie más: el contador no
podía pasar de cero por vías legítimas, así que el juego nunca era
completable en el monte con gente de verdad, sólo en pruebas de un solo
móvil.

No hacía falta construir nada nuevo: `/api/heartbeat?equipo=1` ya manda,
cada pocos segundos, la posición de todo el equipo
(`construir_tabla_de_equipo()` en `game.py` — `lat`, `lon`, `presence`,
`gps_status`, `last_seen` de cada compañero), y esa respuesta ya llegaba a
`PlayerApp.tsx` (`aplicarEquipo()`) pero se quedaba en un `useState` local,
invisible para los minijuegos anidados.

**Arreglo:** ese estado pasa a `usePlayerStore` (compartido, no persistido
entre arranques — son datos de "ahora mismo"), y `TeamRelayRuntimeScreen`
calcula la proximidad real con la misma fórmula de distancia que usa el mapa
(`getDistanceMeters`), filtrando a compañeros con latido `live` (menos de 3
min) dentro del radio del nodo. Se borra `useTeamStore.ts` y las
dependencias `yjs`/`y-indexeddb` (sin más usos en el repo). Umbral de 2
compañeros sin tocar — lo roto era de dónde salían los datos, no las reglas
del juego.

Verificado: `tsc -b` y `vite build` limpios, suite completa 525/525. Falta
verificación en vivo con dos móviles reales caminando juntos — el banco de
simulación es sólo backend y no renderiza la pantalla de React, así que esa
prueba queda pendiente para la próxima salida de campo.

## 0.3 El banco de pruebas ya simula un corte de cobertura a mitad de ruta — ✅ en 4.9.50

Pedido explícito: "¿se puede simular cortes de cobertura, y qué pasaría al
completar juegos en una zona sin cobertura y al volver a tenerla?". Hasta
4.9.49 el banco sólo tenía perfiles de "todo o nada" -toda la ruta online o
toda offline-, que no prueba el caso real de una vaguada o un bosque
cerrado: un tramo muerto en medio de una ruta que por lo demás tiene
cobertura.

Perfil nuevo `corte`: los nodos del 35 % al 65 % de la ruta se juegan y se
completan en LOCAL -sin mandar nada-, y se suben de golpe, en un único lote
a `/api/events/sync`, en cuanto el siguiente nodo ya está fuera de la
franja. Antes y después del corte va con cobertura mala normal. El informe
de cada jugador dice exactamente qué nodos cayeron en la franja
(`nodos_en_corte`), para poder comprobar que el lote que sube es ése y no
otro.

Verificado en vivo contra una misión de 10 nodos: 4 avances directos, un
único lote con los nodos 5-6-7, y 3 avances directos más -nivel final 10/10,
cero errores-. El caso `sin_cobertura` de siempre no cambia de
comportamiento: es el mismo mecanismo con la franja puesta a toda la ruta
(0.0-1.0).

## 0.2 Un minijuego con premio se volvía ilegible al reabrirlo — ✅ en 4.9.49

Auditando el editor guiado de nodos (`AdminGameEditor.tsx` /
`guidedEditorUtils.ts`), no un bug reportado.

`isMapCollectibleStage(stage)` -la función que `GuidedNodeEditorFlow.tsx`
usa para decidir qué editor montar: `AdminCollectibleEditor`, `AdminQrEditor`
o `AdminGameEditor`- tenía como último recurso `return
Boolean(config.reward_item_id)`. Pero `reward_item_id` NO es exclusivo de
los coleccionables de mapa: es el mismo campo que pone el desplegable
"¿Entrega algún objeto de regalo al superar el juego?" en CUALQUIER
minijuego normal (circuit_matrix, tilt_maze, sequence_code...).

Efecto: un organizador monta un circuito, le pone de premio la Llave
Maestra, guarda. Al reabrir ese nodo para retocar el patrón,
`GuidedNodeEditorFlow` lo clasifica como coleccionable de mapa y monta
`AdminCollectibleEditor` -una pantalla de "recoger objeto por GPS" sin
ningún rastro del minijuego-. El circuito seguía guardado y jugable, pero
parecía haber desaparecido del panel; no había forma de volver a verlo ni
editarlo desde ahí.

**Arreglo:** `reward_item_id` sólo cuenta como coleccionable cuando NO hay
ya un `game_id` de un minijuego real detrás (`gameId && gameId !==
'qr_collectible'` corta antes). El fallback legado -nodos viejos con premio
y sin `game_id`- se mantiene igual que antes.

Comprobado contra los 10 nodos de producción: **ninguno estaba afectado
todavía** (0 con `reward_item_id` + `game_id` a la vez), así que es un
arreglo preventivo, no una incidencia activa. Verificado con 4 casos de
comportamiento (minijuego con premio, coleccionable real, fallback legado,
checkpoint con premio) ejecutados en Node contra la función extraída, y
`tsc -b` + `vite build` limpios.

## 0.1 Fecha y hora de inicio — ✅ en 4.9.47

Pedido explícito: dejar que la gente descargue la misión y conceda permisos
con días de antelación, pero que nadie pueda completar un nodo hasta la
fecha y hora que ponga el organizador.

**Config nueva:** `mission_launch_at` (panel → Ajustes → 🕒 Fecha y Hora de
Inicio). Vacío = sin bloqueo, se juega igual que siempre.

**El bloqueo de verdad es del SERVIDOR**, en los dos caminos por los que se
puede completar un nodo:
- `/api/advance` (con cobertura): rechaza con `{"status":"fail","reason":
  "mission_not_started_yet"}` sin ni mirar el código.
- `node_completed` en `/api/events/sync` (la cola offline): se rechaza con
  `status: "failed"`, pero **a propósito no se guarda** con ese
  `client_event_id` -si quedara escrito, el próximo reintento lo
  encontraría por `find_existing_player_client_event` y lo cerraría como
  duplicado sin volver a intentarlo NUNCA, ni siquiera después de que
  llegara la hora-. Sin guardar nada, cada ciclo de la cola vuelve a mirar
  el reloj desde cero. Ver `backend/app/runtime/mission_schedule.py`.

Se compara contra la hora del SERVIDOR (`server_time_ms`, nuevo en
`/api/config`), no la del móvil: cambiar el reloj del teléfono no adelanta
nada.

**La cortina del jugador** (`MissionLockScreen.tsx`) es sólo la parte
visual: se ve entre el login y el mapa, dice cuándo empieza con cuenta
atrás en vivo, y dentro tiene el mismo botón de "antes de salir" -descargar
la misión offline y pedir permisos-, que sigue funcionando esté bloqueada o
no. Al llegar la hora desaparece sola, sin recargar la página.

Encontrado de paso: `/api/admin/save-config` arma la respuesta campo a
campo -el mismo fallo que ya pasó una vez con `player_profiles`- y
`mission_launch_at` no estaba en la lista. Sin el arreglo, el panel guardaba
la fecha, el servidor contestaba "ok" y la descartaba en silencio.

11 pruebas nuevas, incluida la que demuestra el punto que más importa: un
intento rechazado antes de hora se reintenta solo y SÍ se aplica en cuanto
se desbloquea, con el mismo `client_event_id`.

## 0. Lo que está sin demostrar ahora mismo

Va primero porque es lo único de esta lista que ya debería estar hecho.

| Cosa | Qué falta | Cómo se comprueba |
|---|---|---|
| ~~**GPS**~~ | **Demostrado el 17 de agosto** (ver 0.1) | — |
| ~~**Aviso de avance sin cobertura**~~ | **Medido el 17 de agosto: NO lo ve.** Es un fallo, no una duda (ver 0.2) | — |
| **Panel de permisos** | Se ve «con diseño antiguo» pero mide 0 elementos fuera del tema | Comparar su forma (redondeo, disposición) con el resto, no su color |

### 0.1 El GPS reacciona — medido, no supuesto

Contra producción (4.9.6, sagagia.es), con el jugador de pruebas en el nodo 5
(`qr_collectible`, radio 50 m). Se eligió ese nodo **porque avanza escaneando un
QR y no por proximidad**: se puede simular la llegada sin que nadie avance de
verdad.

El truco que faltaba: el shim de `debugGeolocationShim.ts` pide la posición a
`/api/game/<user>?fresh=<ts>`, y **la app pide la suya sin ese `fresh=`**. Eso
permite interceptar `window.fetch` y reescribir sólo la llamada del shim, así
que el jugador se mueve y el nodo se queda quieto. Moviendo las dos, la
distancia no cambiaría nunca y la prueba no valdría nada.

Se inyectaron 77 posiciones (una cada 1,2 s) y la pantalla siguió a todas:

| Simulado | En pantalla |
|---|---|
| 500 m | `ACHÉGATE MÁIS · 500 M` + aviso «Saíches do camiño» |
| 400 m | `400 M` |
| 250 m | `250 M` |
| 120 m | `120 M` |
| 60 m | `60 M` — «Acércate para abrir este nodo» |
| **20 m** | **`ABRIR QR` — «Ya puedes abrir este nodo»** |
| 300 m / 900 m | `300 M` / `899 M` (también de vuelta) |

Cruzar el radio de 50 m cambia la pantalla solo. El nivel del jugador de pruebas siguió en 5:
no hubo ni un `/api/advance`.

**Dos cosas que salieron de rebote y no estaban en el plan:**

1. **El GPS no arranca hasta que alguien pulsa.** Al abrir, el panel «ANTES DE
   SALIR» dice «Faltan 2» y no hay ni una posición: `saga_last_gps_coords`
   está vacío hasta pulsar `ACTIVAR GPS`. Es defendible, pero significa que
   quien no pulse sale al monte sin flecha y sin línea al nodo.
2. **El latido ensucia el mapa y hay que limpiarlo a mano.** La prueba plantó a
   al jugador de pruebas a 500 m del camino en el mapa de los demás, y ahí se queda. Se limpió
   con `main.clear_live_position(<jugador de pruebas>)`. Mientras eso siga siendo manual,
   cualquier prueba deja rastro.
3. **La línea del radio está en castellano dentro de una pantalla en gallego**:
   «Radio 50 m. Acércate para abrir este nodo» junto a `ACHÉGATE MÁIS` y
   `Ferramentas`.

**Lo que esto NO demuestra:** que el chip GPS de un móvil de verdad alimente
bien esa misma tubería. Prueba las decisiones y el pintado, con posiciones
perfectas de 3 m de precisión. En el monte la precisión es de 30-80 m.

### 0.2 Quedarse sin cobertura es mudo — **fallo confirmado**

El mensaje «¡Nodo superado sin conexión!» **existe** (`avance/decisiones.ts:205`)
y **nunca llega a la pantalla**. No es que falte: se calcula, se pasa, y se tira.

`PlayerApp.tsx:993`:

```ts
function showNotice(message: string, tone: NoticeTone) {
  const normalizedTone = tone === 'success' ? 'info' : tone
  if (normalizedTone === 'info') return        // <- aquí muere
```

Y `avisoDeAvanceSinServidor` devuelve `tono: 'success'` justo en la rama de
«sin cobertura». La de «servidor caído» devuelve `'warn'`, que sí pasa.

Medido con el mismo nodo, el mismo botón y lo único distinto el tipo de fallo:

| Fallo | Tono | ¿Se ve? |
|---|---|---|
| `/api/advance` da 500 | `warn` | **Sí**, a los 101 ms, y dura 3,5 s |
| Red caída (sin cobertura) | `success` → `info` | **No.** Ni un cambio de pantalla |

O sea: el caso raro avisa y el caso normal del monte no. El jugador avanza, la
pantalla pasa al nodo siguiente en 60 ms y nada le dice que eso no ha salido
del móvil.

**Ojo, el mismo filtro se come más cosas.** Todo lo que se manda con tono
`'info'` o `'success'` es invisible hoy, y ahí hay al menos dos mensajes
pensados justo para tranquilizar sin cobertura:

- `PlayerApp.tsx:1592` «Sen cobertura: a foto xa se ve, e subirase soa. 📷»
- `PlayerApp.tsx:1539` «Sen cobertura: a foto borrarase no servidor ao volver a rede.»

**✅ ARREGLADO en 4.9.7 y verificado en producción.** Se eligió darles sitio
propio: `warn` sigue yendo al cartel de arriba (3 s) y todo lo demás va a una
línea discreta abajo (`QuietNotice`, 5 s). Nada se descarta ya.

Medido contra producción con el mismo nodo y el mismo botón, después de
desplegar:

| Momento | Estado |
|---|---|
| **48 ms** | **APARECE** «Nodo superado sin conexión» |
| 5 490 ms | desaparece |

Antes no aparecía nunca. Los 5,5 s confirman que sale por la línea callada y no
por el cartel viejo, que dura 3 s.

### 0.3 Caída de servidor y recuperación — **la cadena entera, medida**

Con el nodo 0 (`simple_checkpoint`, avanza por proximidad) y el jugador de pruebas reiniciado a 0:

1. **Servidor caído** → `/api/advance` falla a los 2 ms → el jugador **avanza
   igual** en local (1/10 → 2/10) y el evento queda en IndexedDB:
   `event_queue`, un solo registro, `status: pending`, `level_before: 0`,
   `level_after: 1`. Ni duplicados ni basura.
2. **Servidor de vuelta, pestaña oculta** → **no sube nada**. Ocho segundos con
   red perfecta y servidor sano: servidor 0, móvil 1.
3. **Pestaña visible** → la cola se vacía sola: servidor 0 → 1, registro a
   `status: synced`.

Los pasos 1 y 3 están bien. **El paso 2 es el punto 2.1 de este plan, y ya no
es teórico:** con el móvil en el bolsillo la reconciliación no ocurre, por
mucha cobertura que haya. Sube de prioridad.

**Otro hallazgo:** entrar en el radio **no** avanza solo. Aparece un botón
`ABRIR NODO`, y tras la historia otro `REXISTRAR O PASO`. Son dos pulsaciones
conscientes, no una llegada automática — bueno para no avanzar sin querer, pero
conviene saberlo al leer los tiempos.

**Cómo se activa el GPS, que no es evidente:** en el nodo 0 no hay botón
`ACTIVAR GPS`; hay que pulsar `COMEZAR A TRAVESÍA` y luego `Permitir` en el
panel «ANTES DE SALIR». En otros nodos sí sale `ACTIVAR GPS`. Dos caminos
distintos para lo mismo.

### 0.4 Quince jugadores a la vez — **el cuello no es la Pi**

Quince hilos pidiendo `GET /api/game/<user>?offline_pack=true`, que es la
petición cara. Sólo lecturas: no ensucia el mapa de nadie.

| | 1 jugador | 15 jugadores |
|---|---|---|
| Por Cloudflare | p50 458 ms | **p50 4 326 ms** · p95 5 276 · máx 8 727 |
| Directo a la Pi | p50 554 ms | **p50 5 557 ms** · p95 9 400 · máx 10 455 |

Y durante todo el ensayo, la Pi: **CPU 0,18 %, carga 0,13, 1 160 MB libres**.
El caudal apenas sube con la concurrencia (2,2 → 2,4 peticiones/s) mientras la
espera se multiplica por diez. Eso no es un servidor ahogado: es **ancho de
banda**. Se están mandando **214 KB por jugador**, y quince a la vez son 3,2 MB
por ronda.

Traducido al aparcamiento: trece personas abriendo la aplicación a la vez
esperan entre 5 y 10 segundos cada una, con cobertura buena. Con cobertura de
monte, más.

**Cloudflare no ayuda aquí** — va igual o peor que ir directo, así que el
paquete no se está cacheando en el borde.

**Lo que esto señala, por orden:**

✅ **Primer corte hecho en 4.9.13: 200 KB → 120 KB, y la espera de 4,3 s a
1,6 s.** El paquete estaba dominado por **una foto repetida**: el mosaico del
nodo final viajaba en `config` y en `minigame.config`, byte a byte la misma,
79,8 KB cada copia — 160 de los 203 KB totales. Por eso comprimía tan mal (32 %):
base64 de un WebP ya comprimido no se deja.

Medido con quince jugadores después del cambio:

| | Antes (200 KB) | Ahora (120 KB) |
|---|---|---|
| p50 | 4 326 ms | **1 639 ms** |
| p95 | 5 276 ms | 1 886 ms |
| caudal | 2,4 pet/s | **9,9 pet/s** |

Mejora más de lo que predice el recorte solo: al pesar menos caben más
peticiones a la vez por el mismo tubo.

**Lo que queda de aquí, por orden:**

1. **Sacar la foto del JSON — a medias (4.9.14 y 4.9.15).**

   ✅ Ya existe `GET /media/nodo/<nodo>/<huella>.webp`: sirve la foto en binario
   (**60 KB**, frente a 80 en base64) con caché de un año, y **Cloudflare la
   cachea de verdad** — comprobado: `MISS`, luego `HIT`, luego `HIT`. Con quince
   personas en el aparcadoiro la Pi la manda una vez y el borde reparte las
   otras catorce.

   ⚠️ **Y una lección de método:** 4.9.14 sirvió la foto desde
   `/api/stage-image/...` con la cabecera correcta, y Cloudflare contestaba
   `CF-Cache-Status: DYNAMIC`. Trata `/api/` como dinámico por defecto y la
   cabecera sola no le hace cambiar de idea. **Parecía hecho y no servía para
   nada.** Sólo se vio al medirlo. Hay una prueba que impide que la ruta vuelva
   a `/api/`.

   ✅ **Y el paso grande, hecho en 4.9.16.** El cliente pide
   `?fotos_por_url=true`, el servidor manda sólo la URL, y el móvil **se baja la
   foto aparte y la vuelve a meter en su paquete antes de guardarlo**: por el
   cable viaja una vez y cacheada, y en IndexedDB queda igual que siempre.

   Medido con quince jugadores, el recorrido entero:

   | | Original | Sin duplicado | Foto fuera |
   |---|---|---|---|
   | Paquete | 200 KB | 120 KB | **38 KB** |
   | p50 | 4 326 ms | 1 639 ms | **1 170 ms** |
   | Caudal | 2,4/s | 9,9/s | **12,4/s** |

   Verificado en el móvil, que era lo que daba miedo: el paquete guardado lleva
   los 10 nodos y **la foto dentro (80 KB)**, y además el service worker la tiene
   en su caché. Doble garantía de modo avión.

   Las tres redes que lo hacen seguro de desplegar: lo pide el cliente y no lo
   decide el servidor (un móvil viejo sigue recibiendo 120 KB con la foto
   dentro, comprobado); si una sola foto no se baja se pide el paquete entero; y
   el service worker la precachea.

   ~~**Falta el paso que da el ahorro grande:**~~ retirar la copia de dentro del
   JSON, que dejaría el paquete en ~40 KB. No se ha hecho a propósito: un móvil
   con la aplicación vieja cacheada seguiría pidiéndola ahí, y quitársela de
   golpe le dejaría el mosaico en blanco sin cobertura. Antes hace falta que el
   cliente sepa pedirla por la URL **y guardarla en su paquete offline**, y que
   el service worker la precache. Ahora se puede: desde `/media/` el service
   worker ya la ve, porque se salta `/api/`.
2. **El paquete de 214 KB es el problema, no la máquina.** Ya existe
   `stages_rev` (huella del contenido) precisamente para poder pedir lo ligero
   y reutilizar lo guardado. Habría que medir cuántos de esos 214 KB son
   contenido que el móvil ya tiene.
2. **Escalonar la entrada.** Si el arranque de todos coincide, no hay servidor
   que lo arregle: es el mismo caudal repartido entre más gente.
3. Subir CPU o RAM de la Pi **no cambiaría nada**. Está parada.

**Las escrituras concurrentes se probaron aparte**, en local y con quince
jugadores inventados: ver 0.5. Contra producción se dejaron fuera a propósito,
porque plantan posiciones falsas en el mapa de gente real.

### 0.5 Escrituras de quince a la vez — **en local, sin tocar producción**

Se montó una instancia local con quince jugadores **inventados**
(`PROBA01…PROBA15`) y datos de usar y tirar. Nada de esto va contra producción:
el error de plantar posiciones de gente real en el mapa ya se cometió dos veces.

Primero, un dato que corrige la intuición: **el latido real va cada 30 s**
(`PlayerApp.tsx`). Quince jugadores son **0,5 peticiones por segundo**. Eso no
ahoga nada, y cualquier banco que mande más rápido está midiendo un fantasma —
el primer intento mandaba 74/s y sólo medía el limitador.

Lo que sí puede coincidir de verdad es el volcado de colas: quince móviles
recuperan cobertura a la vez al salir del monte y sueltan todo de golpe.

| Ráfaga simultánea | Almacén | Resultado |
|---|---|---|
| 15 × 6 avances (90) | JSON | 90 OK · p50 **664 ms** · 5,1 s |
| 15 × 6 avances (90) | **SQLite** | 90 OK · p50 **1 542 ms** · máx 2 857 · 12,9 s |
| 15 × 20 avances (300) | SQLite | 270 OK + **30 × 429** · 16,5 s |

**Tres cosas que salen de aquí:**

1. **SQLite es 2,4× más lento que JSON** para escrituras concurrentes
   (p50 1 542 ms contra 664 ms). Y esto es en un portátil: la Pi tiene bastante
   menos músculo. Un volcado de quince colas a la vez no pierde nada, pero cada
   avance tarda segundo y medio.
2. **El limitador funciona exactamente como está escrito.** Los 30 rechazos no
   son un fallo: el límite es 24 avances por minuto y jugador, la ráfaga
   anterior ya había gastado 6, y 6 + 20 = 26. Sobran 2 por jugador × 15 = 30.
   Clavado.
3. **Las escrituras se serializan**: 300 peticiones en 16,5 s son 18/s, suba lo
   que suba la concurrencia.

**La velocidad lenta se probó aparte:** ver 0.6. Salió de ahí el fallo de los
doce segundos de silencio, arreglado en 4.9.9.

**Aviso para quien repita esto:** `/api/advance` exige pase de jugador, que se
consigue entrando en `/player/<nombre>`; sin cookie todo son 403 y parece que
el servidor está roto.

### 0.6 Red lenta — **doce segundos mirando una pantalla quieta**

Retardo de 3-10 s en cada petición y 30 % de pérdidas, contra producción, con el
nodo 0. Lo peor que sale no es la pérdida de datos: es el silencio.

| Momento | Qué pasa |
|---|---|
| 0 ms | El jugador pulsa `REXISTRAR O PASO` |
| 11 ms | Se cierra la historia y vuelve al mapa |
| 11 ms → 11 830 ms | **Nada. Ni un cambio en pantalla.** Ni rueda, ni «enviando», ni el botón deshabilitado a la vista |
| 11 830 ms | Por fin avanza a 2/10 |

Doce segundos es tiempo de sobra para pensar que no ha funcionado y volver a
pulsar. El indicador de `submitting` existe, pero vive dentro del panel de
interacción **que ya se ha cerrado**: en el mapa no queda ninguna señal.

**Y ojo al contraste con el modo avión**, que es lo que hace esto raro:

- Sin cobertura (el fallo es inmediato) → avanza en **60 ms**, se siente rápido.
- Con cobertura mala (la petición está en vuelo) → **espera 12 s**.

O sea que la red a medias se vive peor que no tener red. Es justo el caso del
monte.

**Lo que sí está bien, y se comprobó:**

- El avance llegó al servidor (nivel 1) **y además** quedó un evento `pending`
  en la cola del mismo avance `0->1`. Es el escenario clásico de doble conteo.
- Al volver la red normal, la cola subió y **el servidor se quedó en 1**, no en
  2. El guardián por `level_before` hace su trabajo. El evento pasó a `synced`.

✅ **Arreglado en 4.9.9 y verificado en producción.** La línea callada dice
«Rexistrando…» mientras el envío está en vuelo. Con 6 s de retardo inyectado:
aparece a los **5 ms** y desaparece a los **6 345 ms**, justo al resolverse, y
deja paso a «¡Nodo superado! ⚡». Los segundos de pantalla muerta son ahora
segundos de pantalla que habla.

**Otro dato de paso:** la primera visita se pasa **minutos** guardando el mapa
(«Primera vez: se guarda el mapa»). Con red de monte eso es mucho peor, y
conviene que nadie llegue al aparcadoiro sin haberlo hecho en casa.

---

## 1. Que nadie se quede tirado

Lo que puede dejar a una persona parada en el monte sin saber qué hacer.

### 1.1 Reinicio de jugador a mitad de partida — **medio hecho (4.9.6)**
Había **dos** reinicios en el servidor que no hacían lo mismo: el del panel de
perfiles sellaba `reset_at`, paraba los relojes, vaciaba la mochila y borraba la
posición; `/api/reset` sólo bajaba el nivel. Por ese segundo camino el móvil no
se enteraba. Ahora los dos llaman a la misma función.

**Lo que sigue sin mirarse:** la cola de eventos sin subir. Si alguien lleva
avances encolados en IndexedDB y le reinician, nadie ha comprobado si esa cola
queda huérfana y los sube después contra la partida nueva.

**Medir primero:** avanzar tres nodos sin cobertura, reiniciar, devolver la red
y ver si la cola sube avances de la partida anterior.

✅ **Aislado y arreglado en 4.9.8.** El síntoma: reiniciando al jugador de
pruebas a 0 con el móvil abierto, el servidor volvía **solo** a nivel 1 y el
móvil seguía marcando 2/10 incluso tras recargar. Sólo se recuperaba borrando
`localStorage` y las tres bases de IndexedDB.

**La causa no estaba en el cliente.** Los tres sitios que leen `reset_at`
(`PlayerApp.tsx` líneas ~512, ~696 y ~1488) llaman a `aplicarResetDeRelojes` y
vacían la cola. El agujero estaba en el servidor, y era de manual:

```python
if level_before is not None and level_before < current_level:   # duplicado
```

Ese candado protege contra avances **repetidos**, no contra avances **de otra
partida**. Después de reiniciar a 0, un evento viejo con `level_before: 0`
encaja perfectamente —el servidor está en 0, el evento dice que venía del 0— y
vuelve a avanzar al jugador.

El dato que los distingue **ya viajaba y nadie lo miraba**: el móvil manda
`payload.local_created_at`, y el servidor guarda `reset_at`. Anterior al
reinicio = partida borrada → `stale_before_reset`.

Tres pruebas: la del fallo, y dos que impiden pasarse de listo —perder un avance
hecho *después* del reinicio sería peor que el fallo original—.

**Verificado en producción** mandando eventos a mano contra `/api/events/sync`:

| Evento | Respuesta del servidor | Nivel |
|---|---|---|
| Creado **antes** del reinicio | `ignored` · `stale_before_reset` | se queda en **0** |
| Creado **después** del reinicio | `synced` | sube a **1** |

Un detalle al reproducirlo: si el móvil se entera del reinicio **antes** de
vaciar la cola, la borra él solo y el candado del servidor ni se ejercita. Por
eso la comprobación buena es mandar el evento a mano; con el navegador se está
midiendo quién gana la carrera, no si el candado funciona.

### 1.1.b Cinco avances encolados a la vez — **bien, y probado**

Todas las pruebas anteriores tenían **un solo** evento en la cola. Simulado el
20 de agosto con cinco de golpe, como quien hace media ruta en modo avión:

- Los cinco se aplicaron **en orden**, uno por nivel: 0 → 5. Sin saltos ni
  dobles.
- El servidor **ignoró el `node_id` que mandaba el cliente** y usó el suyo
  (devolvió 0, 12, 17, 11, 3 — los ids reales de la misión). Es lo correcto: la
  progresión la manda el servidor.

Este era el punto que faltaba por comprobar de la cola. Está bien.

### 1.1.c El código interno de «superado» lo acepta cualquier nodo — **decisión pendiente**

Salió de la simulación anterior, y conviene entenderlo antes de opinar.

Cada nodo lleva una condición interna `minigame_ok` con la que los minijuegos
avisan de que se han ganado, y **esa palabra la acepta cualquier nodo**. Es
deliberado: sin cobertura el móvil es la autoridad, juega el minijuego y dice
«superado», y el servidor no tiene forma de volver a comprobarlo.

La bandera `manual` existe para que esa palabra **no** valga escrita en la
casilla de respaldo (`stage_accepts_code`, `mision.py:92`). Eso protege al
jugador honesto de saltarse un nodo con la casilla de texto.

**Lo que la simulación enseña:** `manual` la manda el cliente, así que desde una
consola se omite. Con un pase de jugador —que se consigue entrando en
`/player/<nombre>`— se puede recorrer la ruta entera mandando `code: 'OK'` a
`/api/events/sync`. Comprobado: el jugador de pruebas pasó de 0 a 5 sin escanear
un QR ni jugar nada.

**No lo he tocado, y creo que no hay que tocarlo a la ligera.** Es la otra cara
de que el juego funcione sin cobertura, que es lo que hemos pasado toda la
semana protegiendo. Para trece amigos en el monte puede ser perfectamente
asumible. Las salidas, por orden de coste:

1. **Dejarlo y saberlo.** Es una gymkhana entre conocidos, no un examen.
2. **Cruzar con la última posición conocida.** El servidor tiene el nodo y el
   último latido: completar un nodo estando a kilómetros es sospechoso. Tiene
   que ser flojo, porque sin cobertura no hay latido.
3. Firmar los avances en el móvil. Mucho trabajo y se rompe fácil.

**Medir primero:** si alguna vez importa, mirar en el registro de eventos cuántos
avances llegan sin `time_spent_ms` plausible. Hoy nadie lo ha mirado.

### 1.2 Editor de nodos — **auditado el 20 de agosto**

Tres hallazgos, y la raíz de los dos peores es la misma: **el progreso de un
jugador se guarda como ÍNDICE en la lista de nodos, no como id del nodo.**

**✅ Ids repetidos — arreglado.** El servidor aceptaba guardar dos nodos con el
mismo id sin decir nada. El editor del panel ya asignaba `max+1` al crear, pero
no había red por debajo. Importa porque con dos ids iguales se mezclan las
configuraciones al guardar: un nodo acaba con el minijuego de otro. Ya pasó una
vez. Ahora `validate_stages` lo rechaza, con prueba.

**✅ Borrar un nodo anterior hace que el jugador se salte uno — arreglado en
4.9.43.** Medido: jugador en el nodo 5 de 10; el organizador borra el nodo 2; el
jugador seguía en «nivel 5», pero el nivel 5 pasaba a apuntar al nodo **6**. Se
saltaba un nodo entero y nadie se enteraba. Añadir un nodo antes hacía lo
simétrico: le obligaba a repetir uno.

**✅ Y si iba por el último, se le daba la misión por terminada — mismo
arreglo.** Medido: jugador en el nivel 9 de 10; se borraba cualquier nodo
anterior; quedaban 9 nodos, su nivel 9 ya no existía, y el servidor lo leía
como misión completa. Terminaba la ruta sin jugar el último nodo.

**El arreglo de fondo, no el parche.** Se descartó migrar el progreso a **id de
nodo** en todas partes -cliente, servidor, eventos, clasificación, cola
offline y ~30 pruebas ya asumen un índice numérico; es una migración de datos
completa, no una tarde-. En su lugar, `POST /api/admin/save` reindexa el nivel
de cada jugador EN EL SERVIDOR, en el mismo momento en que se guarda la
misión nueva (`backend/app/runtime/mision_reindex.py`,
`reindex_player_levels_on_save` en `main.py`): para cada jugador busca, yendo
hacia atrás desde su último nodo superado, el primero que siga existiendo en
la lista nueva, y recoloca su nivel justo después de ése. Si ninguno de sus
nodos superados sobrevive, vuelve al nodo 1 -nunca a «terminado» sin haber
jugado-. Quien ya había terminado la misión entera sigue terminado.

Es seguro sin tocar el cliente ni la cola offline: `apply_synced_player_event`
sólo rechaza un evento como duplicado cuando llega con un nivel MENOR que el
que el servidor ya tiene guardado; si no, siempre avanza desde el nivel que
el servidor considera actual. Cambiar ese nivel aquí, en el servidor, es
exactamente el caso que ese guardia ya sabía manejar -no hace falta que el
móvil se entere de nada-.

1. **No tocar la ruta con gente jugando** sigue siendo la norma de fondo: el
   reindexado corrige el número guardado, pero un jugador a mitad de camino
   entre dos GPS puede notar el hueco igualmente si el nodo que tenía delante
   desaparece.
2. **✅ Avisar en el panel antes de guardar — hecho en 4.9.31.** «Esto
   desplaza a N jugadores», con nombre y nivel de cada uno
   (`jugadoresDesprazadosPolGardado` en `adminStagePersistence.ts`). Sigue
   ahí: el aviso decide si se guarda, el reindexado decide qué pasa después de
   guardar.

**✅ `route_via` — auditado y con guardia (4.9.12).** El servidor lo pasaba al
jugador sin mirarlo: aceptaba textos, pares incompletos, nulos y coordenadas
imposibles.

El cliente resultó ser defensivo —descarta lo que no sea un par de números
finitos (`MapSurface.tsx`)—, así que la basura evidente no rompe nada. El fallo
silencioso era otro: el moldeado sencillamente no se aplicaba y nadie se
enteraba.

Pero un caso **sí** pasaba ese filtro: una coordenada fuera de rango. `999` es
un número finito, así que se dibujaba, y la línea verde que el jugador tiene que
seguir salía disparada fuera del mapa. Ahora se rechaza.

No se comprueba que los puntos estén **cerca** de la ruta, a propósito: mover un
tramo lejos puede ser legítimo mientras se diseña una misión nueva.

Comprobado contra la misión real antes de desplegar, que era el riesgo: los 10
nodos llevan `route_via` **vacío** —el trazado de verdad viene de `route_track`,
el GPX de campo—, así que la guardia no rechaza nada de lo que ya existe. Y
verificado dentro del contenedor después de desplegar.

### 1.3 Recorrido completo de una ruta — **parado en el nodo 3 de 10**
No se puede terminar sin un móvil de verdad: los minijuegos de movimiento
necesitan sensores. Sin esto, hay siete nodos cuyo camino nadie ha recorrido
entero.

**Alternativa barata:** simular los sensores (`devicemotion`,
`deviceorientation`) para poder pasar de largo y al menos comprobar las
transiciones entre nodos.

---

## 2. Sin cobertura

Lo que ya está comprobado y no hay que volver a tocar:

- Los diez minijuegos viajan **dentro** del paquete del jugador (0,9 MB) y hay
  **cero importaciones dinámicas**. Abrir un minijuego no pide nada a la red.
  → *No reintroducir carga perezosa. Es el fallo más caro que ha tenido esto.*
- La página guardada conserva la clase del tema y el color de la barra del
  móvil: sin cobertura se entra ya con los colores correctos.
- Un avance sin servidor se encola en IndexedDB y sube solo al volver la red
  (comprobado: servidor de 0 a 1).

### 2.1 La cola sólo se vacía con la pestaña visible
`syncPendingOfflineEvents` se salta si `visibilityState !== 'visible'`. Es
deliberado, pero significa que un móvil en el bolsillo con la pantalla apagada
no sube nada. Con la aplicación instalada como PWA se podría usar
**Background Sync** para que suba aunque esté cerrada.

✅ **Arreglado en 4.9.10.** El ciclo cortaba por visibilidad **antes** de
vaciar la cola, y ahí dentro hay dos cosas de precio muy distinto: el vaciado es
un POST diminuto y `pedirPartida` son 214 KB. Ahora lo barato se hace siempre y
lo caro sigue esperando a que alguien mire.

✅ **Y el caso duro, cerrado en 4.9.11.** El service worker escucha ya `sync`:
el navegador lo despierta cuando vuelve la red aunque la página no esté abierta,
y vacía la cola desde IndexedDB.

Lo que hizo que esto fuera seguro de construir —y no lo era antes— son los dos
candados del servidor, porque un vaciado en segundo plano es un **segundo**
camino hacia `/api/events/sync`:

| Candado | Qué para |
|---|---|
| `client_event_id` | duplicados → se contestan como duplicados |
| `stale_before_reset` | anterior a un reinicio → se ignora (4.9.8) |

**Alcance honesto:** Background Sync es de Chromium (Chrome y Edge en Android);
en iOS no existe. Por eso el ciclo de 30 s se queda donde está: esto se **suma**,
no sustituye.

**Verificado en producción con la pantalla oculta:** cola con un evento
pendiente, servidor en 0, móvil en 1, red devuelta y sin volver a mirar la
pantalla → **el servidor pasó a 1** y el evento a `synced`. Y la otra mitad
también: en toda la ventana observada, cada llamada a `/api/game/` llevaba
`fresh=` —o sea, el simulador de GPS—, así que el refresco de 214 KB **no** se
hizo. Lo barato siempre, lo caro cuando hay alguien delante.

**Medir primero:** cuánto tarda de media un jugador en volver a mirar el móvil
tras recuperar cobertura. Si son segundos, esto no merece el trabajo. Pero el
que acaba la ruta y guarda el móvil puede no mirarlo más en todo el día, y ahí
el ranking se queda mal para siempre.

### 2.3 Un minijuego a medias no sobrevive a que maten la pestaña — **sin arreglar**

Del repaso del 20 de agosto: **ninguno de los cinco minijuegos que se juegan
guarda su estado a medias** (0 usos de `localStorage` / IndexedDB en los cinco).

Un corte de cobertura NO los rompe —van dentro del paquete del jugador y no
piden nada a la red—, así que esto no es un problema de cobertura. El problema
es otro: si el navegador mata la pestaña a mitad de un laberinto (Android
liberando memoria, o un toque en recargar), **el jugador lo repite entero con el
reloj del nodo corriendo**. No se queda tirado, pero se le penaliza en tiempo
por algo que no hizo él.

**Medir primero:** cuánto tarda de media alguien en resolver los dos minijuegos
largos (`placeMosaic` y `circuitMatrix`). Si son dos minutos, esto es una
molestia; si son ocho, es una injusticia en la clasificación.

### 2.2 Fotos pendientes — ✅ hecho en 4.9.31
`fotos.pendientes` ya existía en `useFotosDeCampo` y `PlayerApp.tsx` incluso lo
nombraba (`fotosPendentes`), pero el número se calculaba y se tiraba. Ahora
sale un aviso junto al botón de descargar fotos, sólo cuando hay al menos una
pendiente (`PlayerHud.tsx`).

---

## 3. Sincronización entre móviles cercanos

Lo que pediste. Aquí hay que ser honesto con lo que un navegador permite:

| Vía | ¿Sirve? | Por qué |
|---|---|---|
| **QR entre pantallas** | **Sí, y es la buena** | Ya hay lector y generador en la aplicación. Un móvil enseña un QR con su delta de progreso y el otro lo lee. Cero infraestructura, cero permisos nuevos, funciona con el avión puesto |
| Wi-Fi Direct / punto de acceso | Con fricción | Requiere que alguien monte el punto de acceso a mano. Sirve para volcar contra el móvil del organizador |
| WebRTC en red local | No, en el monte | Necesita un servidor de señalización, o sea cobertura |
| Web Bluetooth | No | Los navegadores no dejan a dos páginas hablar entre sí; sólo página ↔ periférico |
| NFC (Web NFC) | Quizá | Sólo Chrome en Android, y hay que juntar los móviles. Bien para «pasar el testigo» de un relevo |

**La propuesta concreta: el testigo por QR.**

1. El móvil A genera un QR con lo que tiene sin subir (nodos, tiempos, ids de
   evento). Comprimido, porque un QR aguanta poco: unos 2 KB como mucho.
2. El móvil B lo lee y lo mete **en su propia cola**, marcado como ajeno.
3. Cuando B recupere cobertura, sube lo suyo y lo de A.

Esto convierte a cualquiera con cobertura en el mensajero del resto. Encaja con
lo que ya existe: los `client_event_id` evitan que algo se cuente dos veces, que
es la parte difícil y ya está resuelta.

**Medir primero:** cuántos bytes ocupa de verdad la cola de un jugador a mitad
de ruta. Si no cabe en un QR, hay que partirlo en varios y eso cambia el diseño.

---

## 4. Diseño

### 4.1 Lo aprendido, para no repetirlo
Van cuatro rondas de diseño y tres han acabado descartadas al verlas. Lo que
salió de ahí:

- 🔴 **La otra mitad de la trampa, encontrada seis veces en dos días: el
  mecanismo montado y la pieza sin enganchar.** No es la forma escrita en línea
  ganándole al tema — es el tema **sin nada que decir**, y no da ningún error:

  | Dónde | Qué faltaba |
  |---|---|
  | El corte de los paneles | `--theme-panel-cut` valía **0**, igual que cristal |
  | La barra de arriba | `--theme-radius-shell` **no la declaraba nadie** |
  | Los alfileres y los puntos | `border-radius` **clavado** en el componente |
  | La brasa en diagonal | el degradado, en **un solo sitio** de todo el CSS |
  | La mesa de trabajo | **sin clase** de tema |
  | La hoja de Mochila | **sin clase** de tema |

  Hay ya una guardia para las tres primeras
  (`test_o_lume_non_e_cristal_repintado.py`): **una variable que vale lo mismo en
  los dos temas es sospechosa**, con una lista corta de excepciones justificadas
  —los colores de los alfileres, que significan algo, y las píldoras de verdad—.
  Comprobado que caza el fallo original.

  Y la lección de método, que costó cuatro versiones: **pedir una captura**.
  Medir clases decía «alcanza los minijuegos y el panel de preparación» y era
  cierto; lo que domina la vista era otra cosa. Con la imagen delante se vio en
  treinta segundos.

- **El color se puede cambiar por variables; la forma no**, si el componente la
  lleva escrita en línea. Un `borderRadius` en línea gana siempre a la regla del
  tema, y la regla se queda muerta sin dar ningún error. Ha pasado **cuatro
  veces**: el alfiler del mapa, la barra de arriba, el filtro de los iconos y el
  fondo de la barra.
- **Los colores que significan algo no se tocan**: los alfileres del mapa
  (hecho / el que toca / pendiente), la escala de precisión del GPS y el visor
  del escáner. Cambiarlos obliga a reaprender el mapa.
- **El adorno no ha funcionado ninguna de las dos veces** (placas industriales,
  llamas en el filo). Lo que sí funciona: el degradado en diagonal y los tonos.

### 4.1.b Lo que dijo Óscar el 20 de agosto, con el rojo ya en producción

Palabras suyas: **«el rojo no me convence… no veo cambio de diseño»**, y lo que
pide es *«dejar menús y como la base de Mochila / Herramientas y tal, pero no me
veo un cambio que aparezca bien, otro diseño nuevo entero»*.

Eso es una crítica precisa, no un «no me gusta»: el tema de fuego **se lee como
un repintado**, no como otro diseño. Y marca el límite, que es lo útil:

- **La estructura se queda.** Menús, la base de Mochila / Herramientas, la
  disposición. No se toca.
- **Lo que tiene que cambiar es la piel**: formas, densidad, jerarquía, bordes,
  espaciado. Que al abrirlo se note que es otro diseño, no la misma pantalla
  pintada de rojo.

Pantallas señaladas como feas o sin pulir, por sus palabras: **«antes de salir»
(el panel de permisos), el HUD y las barras, y los minijuegos.** Son justo las
tres que ya estaban en esta lista, así que el orden no cambia — lo que cambia es
que el objetivo no es «que el tema alcance el color», que ya está, sino que la
forma cuente otra cosa.

⚠️ **Y aquí no se puede trabajar a ciegas.** Van tres rondas de diseño
descartadas al verlas. Cualquier intento nuevo tiene que mirarse en pantalla
antes de darlo por bueno: medir cuántos elementos quedan fuera del tema dice si
el tema *llega*, no si el diseño *vale*.

### 4.1.c Por qué el rojo se leía como un repintado — **encontrado y arreglado (4.9.17)**

No era gusto. El tema de fuego define esta regla:

```css
body.theme-flame-red .saga-glass-panel {
  clip-path: polygon(var(--theme-panel-cut) 0, ...);
}
body.theme-flame-red { --theme-panel-cut: 0px; }
```

Con **0**, ese polígono es un rectángulo exacto: el corte no aparece nunca, y el
CSS no da ningún error. El diseño de 4.9.4 dice que la esquina cortada es una de
sus **tres** ideas —con la brasa en diagonal y el filo encendido—. Las otras dos
estaban puestas; ésta llevaba apagada desde entonces.

**Es el fallo de siempre del proyecto, pero al revés:** aquí la regla del tema
está viva y es el *valor* el que la deja muerta. Añádelo a la lista de 4.1: no
sólo hay que vigilar que la forma no se escriba en línea, también que la
variable del tema no valga cero.

Ahora vale 12 px con un radio de panel de 14. Verificado en producción, en el
navegador: `polygon(12px 0px, 100% 0px, 100% calc(100% - 12px), …)`.

**Alcanza más de lo que parecía:** `.saga-glass-panel` la llevan las pantallas de
los minijuegos —`circuitMatrix`, `placeMosaic`, `motionChallenge`,
`bearingHunt`, `audioChallenge`—, el panel de preparación y la de carga. Justo
las que estaban señaladas como sin pulir.

**Y encender la variable NO bastó (4.9.18).** Medido en el navegador después de
desplegar 4.9.17, en la pantalla principal:

| Elemento | Área | Forma |
|---|---|---|
| **Barra de arriba** | **97 767 px²** | píldora de 28 px, sin corte |
| Mochila / Herramientas | 28 691 px² | sin corte |
| Fila de iconos | 10 811 px² | sin corte |

El corte vive en una regla de `.saga-glass-panel`, y en el mapa eso es **un solo
elemento**. Alcanzaba los minijuegos, no lo que se mira el 90 % del tiempo.

🔴 **Y apareció el segundo cero, el mismo fallo por segunda vez en dos días.**
`PlayerShell.tsx` lee el radio con `var(--theme-radius-shell, 28px)` y **ningún
tema declaraba esa variable**. El arreglo de 4.9.4 enganchó la barra a una
variable y nunca le dio valor, así que siempre ganaba el respaldo, en fuego
igual que en cristal. Mecanismo puesto, valor nunca.

Arreglado: fuego declara `--theme-radius-shell: 4px` y el corte llega a las tres
superficies grandes. Verificado en producción: barra a 4 px **con** corte, y las
otras dos con corte.

**Lección para la lista de 4.1:** no basta con vigilar que la forma no se
escriba en línea. Hay que comprobar que **la variable del tema tenga valor** —
dos veces ya se enganchó el mecanismo y se dejó el número sin poner, y el CSS no
da ningún error en ninguno de los dos casos.

**Dónde NO llega, y hay que decirlo:** la mesa de trabajo no lleva esa clase, así
que se queda igual. Y ojo con la tentación de aplicar la `clip-path` sin
limitarla al tema de fuego: en cristal la variable vale 0, y un polígono
rectangular **borraría las esquinas redondas** de cristal. Por eso la regla está
dentro de `body.theme-flame-red`.

### 4.2 Lo que queda
- **Los minijuegos siguen con sus propias formas y colores**, al margen del
  tema. **No son diez pantallas: son cinco** (medido el 17 de agosto).

  | Pantalla | Líneas | Colores literales | Formas en línea | Usa el tema |
  |---|---|---|---|---|
  | `circuitMatrix` (logic_circuit) | 910 | **127** | ~~16~~ 0 | **✅ 15 en 4.9.33** |
  | `placeMosaic` | 1 236 | 71 | ~~20~~ 1 sin tocar (a propósito) | **✅ 16 en 4.9.32** |
  | `tiltMaze` | 665 | 69 | ~~10~~ 1 (la bola, a propósito) | **✅ 9 en 4.9.34** |
  | `sparkRadar` | 668 | 54 | ~~8~~ 4 (el radar, a propósito) | **✅ 4 en 4.9.35** |
  | `signalHunt` (checkpoint) | 271 | 17 | 2 | 3 |
  | **En la misión** | **3 750** | **338** | **56** | **66** |
  | El resto (5 familias) | 2 498 | 177 | 42 | 19 |

  Las otras cinco familias —`bearingHunt` (1 051 líneas), `motionChallenge`,
  `sequenceCode`, `teamRelay`, `audioChallenge`— **no aparecen en «O Eco do
  Vixía»**. Un tercio del trabajo sería rediseñar pantallas que en esta ruta no
  ve nadie. Comprobado contra los `game_id` reales de los diez nodos.

  **Por dónde empezar, que es más barato de lo que parece:** de los 338 colores
  de las pantallas que sí se juegan, **112 son blanco, casi-blanco o negro**
  —`rgba(255,255,255…)` 68 veces, `rgba(244,244,245)`/`#f4f4f5` 29, `rgba(0,0,0)`
  15—. Eso es estructura (texto, bordes, sombras), no información: sale a
  variables sin discutir nada. Lo que hay que mirar con cuidado son los pocos
  que significan algo: el verde `#72df91` (29 usos), el rojo `rgba(239,68,68)` y
  el ámbar `#fbbf24`.

  **Y las 56 formas en línea son el bloqueo real**, no los colores. Un
  `borderRadius` escrito en el componente gana siempre a la regla del tema y la
  deja muerta sin dar ningún error: ya ha pasado cuatro veces. `placeMosaic` era
  el peor caso —20 formas en línea y **una sola** referencia al tema en 1 236
  líneas—.

  **✅ `sparkRadar` — 4.9.35, último de los cinco.** Aquí las formas viven en
  objetos `CSSProperties` de React, no en una plantilla CSS -mismo bloqueo,
  otra sintaxis-. Lo decorativo (tarjetas del HUD, barra de progreso, resumen,
  botón) pasa al tema. El radar, sus anillos, el barrido y el blip se dejan
  en `'50%'` a propósito: son un radar, tienen que leerse como un radar en
  cualquier tema.

  **Con esto, los cinco minijuegos que se juegan de verdad en la ruta ya
  responden al tema.** Quedan las cinco familias que no aparecen en «O Eco do
  Vixía» (`bearingHunt`, `motionChallenge`, `sequenceCode`, `teamRelay`,
  `audioChallenge`), y son las que menos urgen: nadie las ve en esta misión.

  **✅ `tiltMaze` — 4.9.34.** Igual, con una excepción a propósito: la bola
  (`.tilt-ball`) se deja en 999px fijo en cualquier tema -es información (el
  objeto que se mueve), no decoración, igual que los alfileres del mapa-,
  documentado en el propio CSS y con test que lo exige así.

  **✅ `circuitMatrix` — 4.9.33, limpiado del todo después.** Mismo
  tratamiento, con una complicación de más: cuatro selectores
  (`.circuit-shell`, `.circuit-board-wrap`, `.circuit-cell`,
  `.circuit-button`) estaban declarados dos veces en el mismo bloque -una
  simplificación añadida al final sin limpiar la versión original-, con la
  segunda ganando siempre por cascada. Las dos declaraciones de cada uno
  pasaron a la variable en 4.9.33, porque tocar sólo la que "se ve" no habría
  cambiado nada.

  Auditado después el JSX entero: la mitad "completa" del diseño -topbar,
  chip, título, mini-estadística, medidor, reglas- no la renderiza **nada**,
  0 apariciones en el componente real. No era sólo esos 4 selectores
  duplicados: era media hoja de estilos muerta detrás de un
  `display:none!important` que ocultaba clases que ni existían ya en el
  árbol. Se borraron ~10 reglas inalcanzables y se fusionaron los ~13
  selectores vivos que seguían duplicados (`.circuit-status`,
  `.circuit-body`, `.circuit-bottombar`, `.circuit-final` y las variantes de
  `.circuit-cell`/`.circuit-button`) en una sola declaración cada uno.
  Verificado con `getComputedStyle` antes y después: ningún valor cambia,
  sólo desaparece el texto muerto (el bundle final baja ~5 KB).

  **✅ `placeMosaic` — 4.9.32.** Las 15 formas que cuentan (contenedor,
  tarjetas, tablero, botones, píldoras e insignias) pasan a
  `var(--theme-radius-panel|card|pill, Npx)`, reutilizando las variables que ya
  existían en vez de inventar unas nuevas siempre-iguales. Verificado con
  `getComputedStyle` en un arnés con el CSS real de las dos pieles antes de
  darlo por bueno: contenedor 24px/2px, tarjetas 16px/2px, píldoras 999px/3px
  (cristal/fuego). Quedó fuera a propósito el radio de la ficha individual
  (5px) —y de paso salió un bug de especificidad ajeno a esto: esa regla nunca
  gana, la pisa siempre `.mosaic-shell button`—. Quedan las otras cuatro
  pantallas de la lista.
- **Un tercer tema** para comprobar que el sistema aguanta: si añadir uno cuesta
  más de tocar dos bloques de variables, es que el sistema no está bien hecho.
- **Elegir el tema desde el panel** ya funciona, pero no hay forma de ver cómo
  queda sin entrar como jugador.

---

## 5. Recursos y salud de la máquina

La Raspberry tiene **1,8 GB de RAM**, y un build de Vite dentro de Docker la
tumbó (17 de agosto). Producción se cayó con ella.

- ✅ **Techo de memoria en el build — estrenado y aguanta.** El Dockerfile lleva
  `NODE_OPTIONS=--max-old-space-size=640` en la etapa de construcción. Probado en
  **cuatro** despliegues seguidos (4.9.7 → 4.9.10) sin acercarse al umbral: la Pi
  entró con ~1 080 MB libres y salió con entre 1 004 y 1 143, y sagagia.es no se
  cayó ninguna vez. Ojo al comprobarlo: `docker exec ... printenv NODE_OPTIONS`
  sale vacío y **no significa nada**, porque la variable vive en la etapa 1 y no
  en la de ejecución.
- **Parar el contenedor de ensayo antes de construir.** Ya se hace, pero a mano.
  (A 17 de agosto **no hay** contenedor de ensayo levantado: sólo producción.)
- 🟢 **Construir fuera de la Pi — ya no hay excusa.** Es lo que de verdad lo
  arregla: compilar el frontend en otra máquina y mandar sólo el `dist`. La
  traba que lo bloqueaba era falsa: **sí hay Node en el Windows local (v26.7.0)**,
  comprobado el 20 de agosto. Con `npm install` en `frontend/`, `npx tsc -b`
  pasa limpio y `npx vite build` tarda **3 segundos**.

  Dos cosas que esto cambia de golpe: se puede **comprobar el TypeScript antes
  de desplegar** (hasta ahora se desplegaba a ciegas y se rezaba), y se puede
  quitar de la Pi la etapa que la tumbó dos veces.
- **Limpiar imágenes viejas.** Hay **50** (17 de agosto). Con dejar las tres
  últimas basta.
- **Vigilancia:** un aviso si la memoria disponible baja de 200 MB. Ahora mismo
  hay 1 161 MB libres con todo levantado.

---

## 6. Deuda que no corre prisa

Sólo si sobra tiempo. Nada de esto deja a nadie tirado:

- `main.py` expone 77 símbolos a los routers. Se estaba bajando de uno en uno
  para romper el import circular. Movidos hasta ahora, cada uno con su
  módulo en `backend/app/runtime/` y su prueba de que main.py sólo delega:
  el cronómetro y el progreso (`player_timers.py`, 4.9.41), los perfiles de
  jugador (`player_profiles.py`, 4.9.42), el latido y la posición en vivo
  (`live_positions.py`, 4.9.44), la parte pura de los eventos -sanear texto y
  payload, normalizar el evento- (`player_events.py`, 4.9.45), y el resumen
  de nodo/jugador para el panel (`admin_overview.py`, 4.9.46). Lo que SÍ muta
  el progreso de verdad (`apply_synced_player_event`,
  `find_existing_player_client_event`) se queda en main.py a propósito: es la
  parte más sensible de la sincronización offline. De paso, 4.9.46 quitó dos
  funciones muertas de main.py (`_now_ts`, `_safe_runtime_json_file`, sin
  ninguna llamada en todo el repositorio) y una de
  `backend/app/runtime/minigames.py` (`_normalize_sequence_tokens`,
  huérfana desde que `sequence_code` se validaba por otro camino). `main.py`
  bajó de 1791 a 1196 líneas.
- El paquete del jugador pesa 0,9 MB en un solo trozo. Se puede partir, **pero
  no los minijuegos** (ver 2).
- El panel de administración tiene su propia paleta, al margen de los temas. Es
  a propósito, y así se queda mientras no se use en el monte.
