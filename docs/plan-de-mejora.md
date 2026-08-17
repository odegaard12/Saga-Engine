# Plan continuo de mejora

Lo que queda por hacer, ordenado por lo que le pasa a alguien en el monte si no
se hace. No es una lista de deseos: cada punto dice **qué se mide primero**,
porque aquí ya nos ha pasado arreglar cosas que no estaban rotas y dar por
buenas otras sin comprobarlas.

Estado a 17 de agosto de 2026. Producción: 4.9.6.

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

**Decisión pendiente (es tuya, no mía):** tragarse los `info` parece a
propósito, para no llenar la pantalla de avisos. Las salidas razonables son
subir a `warn` sólo el aviso de avance sin cobertura, o dar a los `info` un
sitio propio y discreto —una línea en la barra en vez de un cartel—. Cambiar el
filtro entero haría aparecer de golpe todos los avisos que hoy están mudos.

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

### 1.2 Editor de nodos — **sin auditar**
Un nodo mal guardado desde el panel se convierte en un jugador delante de una
pantalla que no avanza. Sobre todo: `route_via`, los ids únicos y qué pasa al
borrar un nodo intermedio con gente ya pasada por él.

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

🔴 **Ya no es teórico: medido el 17 de agosto** (ver 0.3). Con la pestaña
oculta, servidor sano y red perfecta, la cola **no se vacía**; en cuanto pasa a
visible, sube sola. Servidor 0 / móvil 1 durante todo el rato.

**Medir primero:** cuánto tarda de media un jugador en volver a mirar el móvil
tras recuperar cobertura. Si son segundos, esto no merece el trabajo. Pero el
que acaba la ruta y guarda el móvil puede no mirarlo más en todo el día, y ahí
el ranking se queda mal para siempre.

### 2.2 Fotos pendientes
Ya hay un repaso, pero conviene un contador visible: «3 fotos sin subir». Ahora
mismo el jugador no tiene forma de saber que lleva cosas pendientes.

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

### 4.2 Lo que queda
- **Los minijuegos siguen con sus propias formas y colores**, al margen del
  tema. Son diez pantallas y es el trozo grande que falta.
- **Un tercer tema** para comprobar que el sistema aguanta: si añadir uno cuesta
  más de tocar dos bloques de variables, es que el sistema no está bien hecho.
- **Elegir el tema desde el panel** ya funciona, pero no hay forma de ver cómo
  queda sin entrar como jugador.

---

## 5. Recursos y salud de la máquina

La Raspberry tiene **1,8 GB de RAM**, y un build de Vite dentro de Docker la
tumbó (17 de agosto). Producción se cayó con ella.

- **Techo de memoria en el build — puesto, sin estrenar.** El Dockerfile ya
  lleva `NODE_OPTIONS=--max-old-space-size=640` en la etapa de construcción. La
  imagen 4.9.6 que corre ahora se construyó **antes** de ese commit, así que el
  techo no se ha probado todavía: el próximo build es el que lo estrena. Ojo al
  comprobarlo: `docker exec ... printenv NODE_OPTIONS` sale vacío y no significa
  nada, porque la variable vive en la etapa 1 y no en la de ejecución.
- **Parar el contenedor de ensayo antes de construir.** Ya se hace, pero a mano.
  (A 17 de agosto **no hay** contenedor de ensayo levantado: sólo producción.)
- **Construir fuera de la Pi.** Es lo que de verdad lo arregla: compilar el
  frontend en otra máquina y mandar sólo el `dist`. Traba conocida: **no hay
  Node en el Windows local**, así que hace falta decidir dónde se compila
  (contenedor en el portátil, o el CI de GitHub subiendo el `dist`).
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
