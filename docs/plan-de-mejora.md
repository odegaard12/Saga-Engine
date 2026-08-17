# Plan continuo de mejora

Lo que queda por hacer, ordenado por lo que le pasa a alguien en el monte si no
se hace. No es una lista de deseos: cada punto dice **qué se mide primero**,
porque aquí ya nos ha pasado arreglar cosas que no estaban rotas y dar por
buenas otras sin comprobarlas.

Estado a 17 de agosto de 2026. Producción: 4.9.5.

---

## 0. Lo que está sin demostrar ahora mismo

Va primero porque es lo único de esta lista que ya debería estar hecho.

| Cosa | Qué falta | Cómo se comprueba |
|---|---|---|
| **GPS** | No está probado que la aplicación reaccione a un cambio de posición | El atajo `?debug=1` coge la posición del **servidor**, no la simulada, así que no sirve. Hay que inyectar posiciones en `watchPosition` **antes** de que arranque la aplicación, o andar con el móvil |
| **Aviso de avance sin cobertura** | No se sabe si el jugador ve el mensaje «nodo superado sin conexión» | Cortar `/api/advance`, pulsar, y muestrear la pantalla cada 200 ms durante 4 s |
| **Panel de permisos** | Se ve «con diseño antiguo» pero mide 0 elementos fuera del tema | Comparar su forma (redondeo, disposición) con el resto, no su color |

---

## 1. Que nadie se quede tirado

Lo que puede dejar a una persona parada en el monte sin saber qué hacer.

### 1.1 Reinicio de jugador a mitad de partida — **sin auditar**
Nadie ha mirado qué pasa si se reinicia a alguien que ya lleva cinco nodos: si
se le borra el inventario, si la cola de eventos sin subir queda huérfana, si el
ranking cuenta dos veces. Es el camino más corto a un desastre en día de ruta.

**Medir primero:** avanzar tres nodos, reiniciar, y comparar servidor, pantalla
y cola de IndexedDB antes y después.

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

**Medir primero:** cuánto tarda de media un jugador en volver a mirar el móvil
tras recuperar cobertura. Si son segundos, esto no merece el trabajo.

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

- **Parar el contenedor de ensayo antes de construir.** Ya se hace, pero a mano.
- **Construir fuera de la Pi.** Es lo que de verdad lo arregla: compilar el
  frontend en otra máquina y mandar sólo el `dist`.
- **Limpiar imágenes viejas.** Hay 48. Con dejar las tres últimas basta.
- **Vigilancia:** un aviso si la memoria disponible baja de 200 MB.

---

## 6. Deuda que no corre prisa

Sólo si sobra tiempo. Nada de esto deja a nadie tirado:

- `main.py` expone 77 símbolos a los routers. Se estaba bajando de uno en uno
  para romper el import circular.
- El paquete del jugador pesa 0,9 MB en un solo trozo. Se puede partir, **pero
  no los minijuegos** (ver 2).
- El panel de administración tiene su propia paleta, al margen de los temas. Es
  a propósito, y así se queda mientras no se use en el monte.
