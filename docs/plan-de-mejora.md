# Plan continuo de mejora

Lo que queda por hacer, ordenado por lo que le pasa a alguien en el monte si no
se hace. No es una lista de deseos: cada punto dice **qué se mide primero**,
porque aquí ya nos ha pasado arreglar cosas que no estaban rotas y dar por
buenas otras sin comprobarlas.

Estado a 21 de agosto de 2026. Producción: **4.9.22**.

---

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

**🔴 Borrar un nodo anterior hace que el jugador se salte uno — sin arreglar.**
Medido: jugador en el nodo 5 de 10; el organizador borra el nodo 2; el jugador
sigue en «nivel 5», pero ahora el nivel 5 apunta al nodo **6**. Se ha saltado un
nodo entero y nadie se entera. Añadir un nodo antes hace lo simétrico: le obliga
a repetir uno.

**🔴 Y si va por el último, se le da la misión por terminada.** Medido: jugador
en el nivel 9 de 10; se borra cualquier nodo anterior; quedan 9 nodos, su nivel
9 ya no existe, y el servidor lo lee como misión completa. Termina la ruta sin
jugar el último nodo.

**Lo que costaría arreglarlo de verdad:** guardar el progreso por **id de nodo**
en vez de por índice. Es una migración de datos y toca el cliente, el servidor y
la cola offline — no es un parche de una tarde.

**Lo barato mientras tanto**, por orden:

1. **No tocar la ruta con gente jugando.** Es una norma, no código, pero es la
   que de verdad evita esto.
2. **✅ Avisar en el panel antes de guardar — hecho en 4.9.31.** «Esto
   desplaza a N jugadores», con nombre y nivel de cada uno, calculado en el
   cliente comparando por índice el nodo de antes y el de después
   (`jugadoresDesprazadosPolGardado` en `adminStagePersistence.ts`). Cancelar
   el aviso corta el guardado. No migra nada: el índice sigue siendo el
   índice, esto sólo avisa antes de pisarlo.
3. Al borrar un nodo, ajustar el nivel de quien estuviera por detrás. Suena
   bien y es traicionero: hay que hacerlo también en la cola del móvil, que
   manda sobre su propio progreso. **Sigue sin hacerse** — el aviso del punto
   2 es la barrera, no el arreglo de fondo.

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
  | `circuitMatrix` (logic_circuit) | 910 | **127** | 16 | 30 |
  | `placeMosaic` | 1 236 | 71 | ~~20~~ 1 sin tocar (a propósito) | **✅ 16 en 4.9.32** |
  | `tiltMaze` | 665 | 69 | 10 | 13 |
  | `sparkRadar` | 668 | 54 | 8 | 19 |
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
  para romper el import circular.
- El paquete del jugador pesa 0,9 MB en un solo trozo. Se puede partir, **pero
  no los minijuegos** (ver 2).
- El panel de administración tiene su propia paleta, al margen de los temas. Es
  a propósito, y así se queda mientras no se use en el monte.
