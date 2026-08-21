# Changelog

Lo que cambia en cada versión y por qué. Las entradas nuevas van arriba.

La versión que corre en producción está en `VERSION` y la sirve `/api/version`.

---

## 4.9.23

El vigilante de versión estaba escrito y **no lo llamaba nadie**.

Buscando por qué un despliegue no se veía, apareció esto: `versionGuard.ts`
compara la versión del bundle con la de `/api/version` y, si no coinciden, borra
la caché del armazón y recarga una vez. Está bien escrito —candado de una
recarga por versión, no toca el mapa ni las misiones guardadas—, tiene su
cabecera explicando para qué existe:

> «Ha pasado: se desplegaban arreglos, el servidor los servía, y en el móvil no.»

**Cero importaciones en todo el proyecto.** El mecanismo escrito para arreglar
ese problema exacto llevaba sin enchufar desde que se escribió, así que el
problema seguía pasando.

Es la **séptima** vez en dos días con el mismo patrón —mecanismo montado, pieza
sin enganchar, ningún error— y la más cara de todas: un móvil que abrió la
aplicación por la mañana se queda con ese código todo el día, y un arreglo
desplegado a media mañana no le llega nunca.

Ahora se llama al arrancar, que es el único momento en que una recarga no le
interrumpe un minijuego a nadie, y con `void`: sin cobertura `/api/version` no
contesta, y arrancar es justo lo que tiene que seguir funcionando en el monte.

Con tres pruebas: que alguien lo llame, que sea al arrancar, y que no bloquee el
arranque.

---

## 4.9.22

La hoja de Mochila y Herramientas, que era lo que dominaba la pantalla.

Con una captura delante por fin se vio: el panel grande que se abre —el de
Mochila y Herramientas, `SwipeableSheet`— **no llevaba ninguna clase**. Ni el
corte ni la brasa podían alcanzarlo, así que seguía redondeado y plano dijera lo
que dijera el tema.

Y es el elemento que **domina la vista** cuando está abierto. Mientras siguiera
así, cualquier cambio de dentro —la mesa, las fichas, las piezas— se leía como
«sigue el diseño antiguo», porque lo que se mira es el marco.

Van ya **seis** sitios con el mismo patrón esta semana: el mecanismo del tema
puesto y la pieza sin enganchar —variable a cero, variable sin declarar, número
clavado, degradado en un solo sitio, componente sin clase—. Ninguno da error.

---

## 4.9.21

La ayuda de la mesa, en voz baja.

Al mirar por fin el DOM de la mesa —que es lo que tenía que haber hecho tres
versiones antes— apareció la diferencia real entre lo que se ve y la maqueta, y
**no era la piel: era la densidad**.

La mesa lleva arriba una caja explicativa («⚒️ Combina objetos de tu mochila
para fabricar piezas más potentes…») con fondo, borde y esquinas. En una
pantalla de 375 px eso se come el sitio de lo único que importa ahí: la receta.
La maqueta no la tenía, y por eso la comparación salía «sigue igual» aunque el
corte, la brasa y el filo estuvieran aplicados.

Se queda el texto —hace falta la primera vez— pero sin caja: una línea callada,
para que mande la ficha.

---

## 4.9.20

Más hondo: la brasa sale de las barras y llega a los paneles.

«Es ligera, no un cambio tan profundo» — y tenía razón. Lo aplicado en 4.9.17-19
estaba bien pero se quedaba corto, y al mirar por qué apareció el dato:

**El degradado de brasa en diagonal estaba en DOS sitios de todo el CSS**: su
declaración y la regla de las tres barras. Los paneles de dentro —la mesa, los
minijuegos, la guía, la preparación— eran **planos**. Una de las tres ideas que
definen el diseño de 4.9.4 sólo la veía una parte de la pantalla, y por eso el
tema se seguía leyendo como un color de fondo en vez de como otro diseño.

Tres cambios, todos sobre mecanismos que ya existían:

- **La brasa a los paneles** (`.saga-glass-panel`) y a las fichas de la mesa.
- **El corte, de 12 a 18 px.** En superficies anchas 12 no se lee.
- **Cada pieza de la mesa** con su corte pequeño y un filo encendido a la
  izquierda: el estado se cuenta con luz en el borde, no con un borde punteado
  igual para todo.

De paso se limpiaron dos reglas que se habían quedado con el selector partido en
dos declaraciones, que una prueba del proyecto prohíbe con razón.

---

## 4.9.19

Los alfileres, los puntos y la mesa. Lo que faltaba de verdad.

4.9.18 cambió la forma de las tres superficies grandes, y aun así seguía sin
verse el diseño nuevo: **los alfileres del mapa, los puntos de la barra y la
mesa de trabajo son elementos aparte, con su forma escrita a mano.**

**Los alfileres seguían siendo pelotas.** 4.9.4 decía que «dejan de ser pelotas
y pasan a ser chapas» y no era verdad en el código servido:

| | Antes |
|---|---|
| `.saga-mission-node-pin` | `border-radius: 999px` clavado |
| `.saga-mission-node-type-badge` | `border-radius: 50%` clavado |
| Puntos de la barra | `--theme-radius-pill`, que vale **999px en los dos temas** |

Tres formas redondas que ningún tema podía cambiar. Ahora salen de
`--theme-radius-dot`: 999px en cristal —exactamente lo que ya se veía— y 3px en
fuego. Va en variable propia y no reutilizando `--theme-radius-pill`, porque esa
la usan cosas que **sí** son píldoras (la de SOLO, la de la cuenta) y ahí el 999
es correcto.

**La posición del jugador se queda redonda a propósito:** un marcador de
posición redondo es lo convencional, y su aura es un degradado radial que
cuadrado se vería mal.

**Y la mesa de trabajo**, que era la pantalla que quedaba fuera de todo: no
lleva `.saga-glass-panel` ni las clases del HUD, así que ni el corte ni la brasa
le llegaban. Por dentro tenía **morado** (`rgba(167,139,250)`, `rgba(124,58,237)`)
y gris pizarra clavados, de otro tema. Ahora los colores salen del tema y las
fichas llevan clase propia con el corte, en una regla limitada a fuego —en
cristal la variable vale 0 y un polígono rectangular les borraría las esquinas
redondas—.

---

## 4.9.18

Ahora sí cambia de forma **lo que se ve**.

4.9.17 encendió el corte, y aun así el tema seguía leyéndose igual. Medido en el
navegador, en la pantalla principal:

| Elemento | Área | Forma |
|---|---|---|
| **Barra de arriba** | **97 767 px²** | píldora de 28 px, sin corte |
| Mochila / Herramientas | 28 691 px² | sin corte |
| Fila de iconos | 10 811 px² | sin corte |

El corte va en una regla de `.saga-glass-panel`, y en el mapa eso es **un solo
elemento**. Alcanzaba los minijuegos y el panel de preparación, no lo que se
mira el 90 % del tiempo.

**Y el segundo cero.** `PlayerShell.tsx` lee el radio con
`var(--theme-radius-shell, 28px)`… y **ningún tema declaraba esa variable**. El
arreglo de 4.9.4 enganchó la barra a una variable y nunca le dio valor, así que
siempre ganaba el respaldo — en fuego igual que en cristal. Mecanismo puesto,
valor nunca. Por segunda vez en dos días.

Ahora fuego declara `--theme-radius-shell: 4px` y el corte llega a las tres
superficies grandes (137 000 px² entre ellas). Cristal declara sus 28 px: **no
cambia ni un píxel**, pero deja de heredar en silencio un valor que nadie
eligió para él.

De paso se resolvió un choque entre dos pruebas del propio proyecto —una exige
que los dos temas declaren el mismo juego de variables, otra pedía que cristal
NO declarase ésta—. No podían cumplirse a la vez en cuanto fuego la declaró.

---

## 4.9.17

La esquina cortada del tema de fuego, encendida. Llevaba apagada por un cero.

«El rojo no me convence, no veo cambio de diseño» — y no era gusto. El tema
define esta regla:

```css
body.theme-flame-red .saga-glass-panel {
  clip-path: polygon(var(--theme-panel-cut) 0, ...);
}
body.theme-flame-red { --theme-panel-cut: 0px; }
```

Con **0**, ese polígono es un rectángulo exacto: el corte no aparece nunca y el
CSS no da ningún error. El diseño de 4.9.4 dice que la esquina cortada es una de
sus **tres** ideas —con la brasa en diagonal y el filo encendido—; las otras dos
estaban puestas y ésta llevaba apagada desde entonces. Por eso el tema se leía
como el mismo diseño con otro color.

Es el fallo de siempre de este proyecto, pero **al revés**: aquí la regla del
tema está viva y es el *valor* el que la deja muerta.

Ahora vale 12 px, con un radio de panel de 14: se nota sin comerse la esquina.
Y alcanza más de lo que parece, porque `.saga-glass-panel` la llevan las
pantallas de los minijuegos —`circuitMatrix`, `placeMosaic`, `motionChallenge`,
`bearingHunt`, `audioChallenge`—, el panel de preparación y la de carga.

Cristal se queda en 0 a propósito: es el tema redondo. Hay una prueba para cada
cosa, incluida una que impide que alguien clave el número en la regla y deje la
variable muerta otra vez.

---

## 4.9.16

La foto sale del JSON. El paquete queda en unos 40 KB.

Último paso del recorte, y el que tenía el riesgo. Ahora el cliente pide
`?fotos_por_url=true`, el servidor manda sólo la URL, y **el móvil se baja la
foto aparte y la vuelve a meter en su paquete antes de guardarlo**.

Por qué así, y no simplemente dejando la URL en el paquete guardado: lo que se
guarda en IndexedDB es lo que hace que el mosaico se pueda jugar en modo avión.
Quedarse sin la foto ahí es el fallo más caro que ha tenido esto. Por el cable
viaja una vez y cacheada; en IndexedDB queda igual que siempre.

**Tres redes de seguridad**, porque este cambio se despliega con gente que
puede tener la aplicación vieja cacheada:

1. **Lo pide el cliente, no lo decide el servidor.** Mientras no se pida, la
   foto viaja dentro como siempre. Un móvil viejo no se entera de nada.
2. **Si una sola foto no se puede bajar, se tira el atajo** y se vuelve a pedir
   el paquete entero con las fotos dentro. Antes un arranque más lento que un
   paquete a medias: lo primero se nota en el aparcadoiro, lo segundo en el
   monte.
3. **El service worker la precachea** (`/media/nodo/…`), con el mismo trato que
   los avatares: la URL trae la huella, así que no caduca nunca y si la foto
   cambia se baja sola.

---

## 4.9.15

La foto se muda de `/api/` a `/media/`, que es lo que hace que Cloudflare la cachee.

Medido justo después de desplegar 4.9.14: sirviéndola en
`/api/stage-image/...`, Cloudflare contestaba **`CF-Cache-Status: DYNAMIC`**
aunque la respuesta pidiera caché de un año. Trata `/api/` como dinámico por
defecto y la cabecera sola no le hace cambiar de idea.

O sea que 4.9.14 tenía el endpoint bien y **no servía para nada**: la foto
seguía saliendo de la Raspberry en cada petición. Ahora va en
`/media/nodo/<nodo>/<huella>.webp`, con una ruta que parece lo que es.

Efecto secundario bueno: el service worker se salta `/api/` (`shouldBypass`),
así que desde `/media/` **sí** puede precacharla para jugar sin cobertura —que
es justo lo que hará falta en el paso siguiente, cuando se retire la copia de
dentro del JSON.

Hay una prueba que impide que vuelva a `/api/`.

---

## 4.9.14

La foto del mosaico ya tiene su propia URL. Todavía viaja también dentro.

Primer paso del recorte grande, y el que no arriesga nada. Ahora existe
`GET /api/stage-image/<nodo>/<huella>`, que sirve la foto en binario con
`Cache-Control: public, max-age=31536000, immutable`.

**Por qué la huella va en la URL:** para poder declarar la respuesta inmutable y
cachearla un año. Si la foto cambia, cambia la URL. Con una dirección fija y
contenido cambiante el navegador tendría que preguntar cada vez, que es justo el
viaje que se quiere ahorrar. Y con la huella vieja se contesta **404** en vez de
servir la nueva: quien la tuviera cacheada se quedaría con ella para siempre.

**Lo que esto va a arreglar:** dentro del JSON no la puede cachear nadie, porque
va en una respuesta distinta para cada jugador. Quince móviles abriendo a la vez
en el aparcadoiro tiran quince veces de la subida de la Raspberry, que es el
cuello (la Pi está al 0,18 % de CPU). Con una URL compartida, Cloudflare la
sirve desde su borde y la Pi la manda una vez.

**Lo que NO se ha hecho todavía, a propósito:** quitar la copia de dentro del
JSON. Un móvil con la aplicación vieja cacheada seguiría pidiendo la foto ahí, y
quitársela de golpe le dejaría el mosaico en blanco sin cobertura —el fallo más
caro que ha tenido esto—. Primero se anuncia la URL; retirar la copia es otro
paso, y sólo cuando el cliente sepa pedirla y guardarla en su paquete offline.

---

## 4.9.13

La foto del mosaico deja de viajar dos veces.

Medido contra producción: el paquete del jugador son **203 KB**, y **160 de esos
KB son UNA foto repetida** —el mosaico del nodo final, en `config` y en
`minigame.config`, byte a byte la misma—.

| Ruta | Tamaño |
|---|---|
| `stages[9].minigame.config.image_data_url` | 79,8 KB |
| `stages[9].config.image_data_url` | 79,8 KB (la misma) |

Por eso el paquete comprimía tan mal —200 KB a 136 KB, un 32 %, cuando un JSON
con esa duplicación debería bajar mucho más—: dentro va base64 de un WebP, que
ya está comprimido y no se deja.

Quitarla del `config` de arriba no cambia nada para el jugador: `configDelNodo`
mezcla las dos y **la del minijuego pisa a la del editor**, así que la foto le
llega igual. Se quita **sólo lo gordo** (más de 2 KB) y **sólo cuando es
idéntico**; `game_id` y todo lo que decide la identidad del nodo se lee de ahí
en varios sitios y no se toca.

Esto es el primer corte, el seguro. El bueno viene después: sacar la foto del
JSON y servirla por su propia URL, que además la haría cacheable por el
navegador y por Cloudflare. Eso toca el guardado sin cobertura, así que va
aparte.

---

## 4.9.12

Dos guardias en el editor de nodos, para que un guardado malo no llegue al monte.

**Ids repetidos.** El servidor aceptaba guardar dos nodos con el mismo id sin
decir nada. El editor del panel ya asignaba `max+1` al crear, pero no había red
por debajo. Con dos ids iguales se mezclan las configuraciones al guardar y un
nodo acaba con el minijuego de otro: ya pasó una vez.

**Moldeado de tramo fuera del planeta.** `route_via` pasaba tal cual al jugador
sin mirarlo. El cliente descarta lo que no sea un par de números finitos, así
que la basura evidente no rompe nada —el moldeado simplemente no se aplica, en
silencio—. Pero una coordenada fuera de rango sí pasa ese filtro (999 es un
número finito) y se dibuja: la línea verde que el jugador tiene que seguir sale
disparada fuera del mapa.

Las dos con pruebas de que **no se pasan de listas**: una misión buena se sigue
guardando, y un nodo sin moldeado también. Comprobado además contra la misión
real antes de desplegar: los 10 nodos llevan `route_via` vacío —el trazado viene
de `route_track`, el GPX de campo—, así que no se rechaza nada de lo que hay.

Sin arreglar, y escrito en el plan: borrar un nodo desplaza a los jugadores que
van por detrás, porque el progreso se guarda como índice y no como id de nodo.

---

## 4.9.11

El último eslabón: la cola sube aunque la aplicación esté cerrada.

Con la pantalla apagada y la página viva la cola ya subía (4.9.10). Pero si
Android **congela** la pestaña —la aplicación en segundo plano un rato largo—
ahí no corre nada: ni el ciclo de 30 s ni ningún temporizador. El jugador acaba
la ruta, guarda el móvil, y su último nodo podía no llegar nunca.

Ahora el service worker escucha `sync`: el navegador lo despierta cuando vuelve
la red, aunque la página no esté abierta, y vacía la cola desde IndexedDB.

**Por qué se puede hacer ahora y no antes.** Un vaciado en segundo plano es un
segundo camino hacia `/api/events/sync`, y eso sólo es seguro si el servidor
aguanta que le llegue lo mismo dos veces o lo de una partida ya borrada. Las dos
cosas están puestas y verificadas contra producción:

| Candado | Qué para |
|---|---|
| `client_event_id` | duplicados → se contestan como duplicados |
| `stale_before_reset` | anterior a un reinicio → se ignora (4.9.8) |

Sin esos dos, esto habría sido una forma nueva de contar dos veces.

Detalles que importan: no se marca nada como subido si el servidor no lo acepta
—marcarlo antes de tiempo perdería el avance para siempre—, y al fallar se lanza
para que el navegador reintente el sync solo. Los eventos van ordenados por
fecha, porque ese orden **es** el progreso del jugador.

**Alcance honesto:** Background Sync es de Chromium (Chrome y Edge en Android).
En iOS no existe. Cubre a la mayoría, no a todos, y por eso el ciclo de 30 s de
la aplicación se queda donde está: esto se **suma**, no sustituye.

---

## 4.9.10

Un móvil en el bolsillo ya sube lo que lleva pendiente.

Medido con la pestaña oculta, red perfecta y servidor sano: **ocho segundos y el
servidor seguía en 0 mientras el móvil marcaba 1**. En cuanto la pestaña pasaba
a visible, la cola subía sola. Quien acaba la ruta y guarda el móvil podía dejar
su tiempo sin registrar todo el día, con cobertura de sobra.

El ciclo de refresco se cortaba entero si la pantalla no estaba visible, y ahí
dentro van dos cosas de precio muy distinto:

| | Coste |
|---|---|
| `syncPendingOfflineEvents` + `flushOfflineEvents` | un POST diminuto; con la cola vacía, ni eso |
| `pedirPartida` | **214 KB** |

Saltarse el refresco pesado con la pantalla apagada está bien —no hay nadie
mirando—. Saltarse el vaciado de la cola no. Ahora lo barato se hace siempre y
lo caro sigue esperando a que alguien mire.

**Lo que esto NO arregla:** si el navegador *congela* la página —la aplicación
en segundo plano un rato largo en Android— aquí no corre nada, ni esto ni
ninguna otra cosa. Para ese caso hace falta Background Sync de verdad, con
service worker. Esto cubre la pantalla apagada con la página viva, que es el
caso corriente al guardarse el móvil un momento.

---

## 4.9.9

Se acabaron los doce segundos de silencio.

Medido con red lenta (retardo de 3-10 s):

       0 ms  el jugador pulsa REXISTRAR O PASO
      11 ms  se cierra la historia y vuelve al mapa
      11 ms → 11 830 ms   **nada, ni un cambio en pantalla**
   11 830 ms  por fin avanza

Doce segundos mirando una pantalla quieta es tiempo de sobra para pensar que no
ha funcionado y volver a pulsar. El indicador de `submitting` existía, pero vive
dentro del panel de interacción, que para entonces ya se ha cerrado: en el mapa
no quedaba ninguna señal.

Lo raro era el contraste: **sin cobertura el fallo es inmediato y el jugador
avanza en 60 ms; con cobertura mala espera doce segundos**. La red a medias se
vivía peor que no tener red, que es justo el caso del monte.

Ahora la línea callada de abajo —la que se estrenó en 4.9.7— dice
«Rexistrando…» mientras el envío está en vuelo, y al resolverse deja paso al
aviso que toque. Va como expresión de render y no como hook nuevo: `submitting`
ya existía, y un hook detrás de un `return` temprano tira esta pantalla entera
con el error 310.

---

## 4.9.8

Un reinicio que aguanta a la cola vieja del móvil, y los iconos recuperan su
dibujo.

### Reiniciar a alguien ya no se deshace solo

Visto en producción: se reinicia a un jugador a 0 con el móvil abierto y al rato
el servidor está otra vez en 1 él solo. El móvil seguía marcando 2/10 incluso
después de recargar, y sólo se recuperó borrando `localStorage` y las tres bases
de IndexedDB. En día de ruta eso deja al organizador sin forma de arreglar nada.

La causa no estaba en el cliente: los tres sitios que leen `reset_at` llaman a
`aplicarResetDeRelojes` y vacían la cola. El agujero estaba en el servidor.

El único candado que había era por nivel:

    if level_before is not None and level_before < current_level:  # duplicado

Protege contra avances repetidos, no contra avances **de otra partida**. Después
de reiniciar a 0, un evento viejo con `level_before: 0` encaja perfectamente —el
servidor está en 0, el evento dice que venía del 0— y vuelve a avanzarle.

El dato que los distingue ya viajaba y nadie lo miraba: el móvil manda
`payload.local_created_at` con la fecha en que encoló el avance, y el servidor
guarda `reset_at`. Si el evento es anterior al reinicio, es de la partida que se
acaba de borrar y se ignora (`stale_before_reset`).

Tres pruebas: la del fallo, y dos que impiden pasarse de listo —un avance hecho
DESPUÉS del reinicio sigue contando, y a quien nunca han reiniciado no le cambia
nada—.

### Los iconos recuperan su dibujo

Iban con `grayscale(1) brightness(2.4)`, y eso no los «pone en blanco»: les
borra el dibujo. Una cámara 📷 se quedaba en una mancha blanca sin detalle y
sobre la brasa había que adivinar cuál era cuál: feo y además incómodo de usar.

Un emoticono ya viene diseñado para leerse sobre cualquier fondo. Lo que
necesita sobre el rojo no es perder el color, sino despegarse del fondo, así que
ahora llevan una sombra corta y nada más. Va por `--theme-icon-filter`, con la
sombra como respaldo, para poder cambiarlo por tema sin tocar la regla.

---

## 4.9.7

Quedarse sin cobertura deja de ser mudo.

El mensaje «¡Nodo superado sin conexión!» existía, se calculaba, se pasaba... y
se tiraba. Había un solo destino para los avisos —el cartel— y como no se quería
llenar la pantalla de carteles, `showNotice` descartaba en silencio todo lo que
llegara con tono `info` o `success`:

    const normalizedTone = tone === 'success' ? 'info' : tone
    if (normalizedTone === 'info') return

Medido contra producción, mismo nodo y mismo botón, cambiando sólo el fallo:

| Fallo | Tono | ¿Se ve? |
|---|---|---|
| `/api/advance` da 500 | `warn` | Sí, a los 101 ms, dura 3,5 s |
| Red caída (sin cobertura) | `success` | **No. Nunca** |

O sea que el caso raro avisaba y el caso normal del monte no. El jugador
avanzaba, la pantalla pasaba al nodo siguiente en 60 ms y nada le decía que eso
no había salido del móvil.

La salida no es quitar el filtro y que todo grite igual. Ahora hay dos sitios:

- `warn` va al cartel de arriba, 3 s, como siempre.
- lo demás va a una línea discreta abajo, 5 s. No interrumpe, así que se le da
  más margen para que alguien la lea sin mirar aposta.

Con esto vuelven también los dos avisos de fotos sin cobertura, mudos desde el
mismo sitio: el de la foto que se sube sola y el del borrado aplazado.

`QuietNotice` va sin un color clavado y con el radio saliendo del tema. El
primer intento se saltó el multiplicador `--theme-solid` y lo cazó una prueba
que ya existía: en fuego se habría visto el mapa a través de la línea.

---

## 4.9.6

Reiniciar a un jugador ahora le llega al movil.

Medido en el banco con alguien en el nodo 2: el servidor bajaba a 0 y el movil
seguia marcando 2/10. El organizador reiniciaba a alguien y esa persona seguia
jugando como si nada.

No era fallo del cliente -manda sobre su propio progreso a proposito, porque en
el monte avanza sin cobertura-. Habia DOS reinicios en el servidor y no hacian
lo mismo: el del panel de perfiles sellaba `reset_at`, paraba los relojes,
vaciaba la mochila y borraba la posicion; `/api/reset` solo bajaba el nivel.

Por ese segundo camino el movil no se enteraba, los cronometros seguian
corriendo desde la partida anterior y la ultima coordenada seguia en el mapa de
los demas. Ahora los dos llaman a la misma funcion.

Ademas, docs/plan-de-mejora.md con lo que queda por hacer y lo que hay que
medir en cada punto.

---

## 4.9.5

El rojo, de ladrillo apagado a brasa viva. Estaba oscuro y seco: 16 tonos
subidos hacia el naranja, con mas luz y mas calor, sin volver al rojo chillon
del primer intento. La disposicion no cambia.

Ademas, tres cosas que se veian mal y eran fallos, no gusto:

- La barra de progreso seguia VERDE en un tema rojo. Los puntos y las lineas
  iban con rgba(34,197,94,.88) clavado; ese verde se escapo de las barridas
  anteriores porque solo se busco el esmeralda (16,185,129). 108 valores mas al
  tema, en 18 ficheros.
- Los iconos ahora salen en blanco. Son emoticonos y su color viene de la
  fuente, asi que van con grayscale + brightness.
- El reloj de la barra iba en azul palido (#e0f2fe) dentro de una barra roja.

Y dos verdes que NO se movieron, cazados por una prueba que ya existia: la
escala de precision del GPS y el visor del escaner. Ahi el color es
informacion, como en los alfileres del mapa.

Fuera el adorno de llamas: quedaba raro en las barras.

---

## 4.9.4

Fuego deja de ser cristal pintado de rojo.

Para rediseniar algo, el tema primero tiene que poder agarrarlo, y medido en el
banco la barra de arriba, la fila de iconos del mapa y la de Mochila /
Herramientas no tenian ninguna clase: iban con estilos en linea, fuera del
alcance de cualquier regla. Se podian cambiar los colores pero no las formas.
Ahora tienen nombre y el disenio vive en un solo sitio.

Tres ideas, repetidas por toda la pantalla:

- La brasa va en diagonal (135 grados, tres paradas: tizon, brasa, ceniza) en
  vez del degradado vertical y plano de cristal.
- Nada redondo, pero tampoco un cuadrado a secas: la esquina cortada de los
  paneles se repite en barras, botones, alfileres del mapa e insignias.
- Un filo de brasa encendido marca el borde de cada superficie.

La barra de arriba llevaba ademas el radio clavado en el componente, y un
numero en linea gana a la regla del tema: seguia redonda. Ahora sale del tema
con el valor de siempre como respaldo, asi que cristal no cambia.

---

## 4.9.3

Las barras de arriba y de abajo tapan de verdad en el tema de fuego.

Subir `--theme-glass` no bastaba: las barras no usan esa variable, llevan su
propio degradado con la opacidad escrita en cada sitio (.72, .52, .46, .34).
Se veia el mapa a traves de todas. Y no son iguales entre si a proposito, asi
que igualarlas habria cambiado cristal.

Ahora cada opacidad se multiplica por `--theme-solid`: 1 en cristal -el mismo
numero exacto de antes- y 2.8 en fuego. Solo lo que tapa; los brillos y los
tintes se quedan como estaban.

Medido: la barra de arriba queda `rgb(104,50,44)` a `rgb(128,62,54)`, opaca del
todo, y la de abajo `rgb(122,58,52)` a `rgba(88,40,36,.953)`.

---

## 4.9.2

El tema deja de ser una capa de pintura y pasa a ser un diseño entero.

Medido en el banco, con el tema de fuego puesto y ordenando por área lo que
tapaba la pantalla del jugador, salían 66 elementos con colores de otro tema:
un barniz gris pizarra encima de cada panel, el botón de empezar en verde
esmeralda y los de permisos en azul cielo. El tema teñía el fondo y el barniz
lo volvía a tapar; por eso «se veía todo glass» dijera lo que dijera la misión.
Ahora son 0.

- 318 colores clavados pasan a variables del tema. Cristal conserva los valores
  exactos de antes -hay pruebas que los anclan uno a uno-.
- La pantalla de carga sale del tema desde el primer píxel, y en fuego no gira
  ningún aro: queda un marco quieto con la esquina cortada de los paneles.
- La barra del navegador en Android (`theme-color`) la reescribe el servidor.
  Estaba clavada en verde: una misión roja se abría con una franja verde.
- La flecha del jugador iba dibujada dentro de un `data:` URI, donde las
  variables no existen; habría salido negra sin dar ningún aviso. Va por
  máscara.
- El alfiler del nodo tenía dos verdades -una regla de CSS y un estilo en línea
  que la pisaba- y no decían lo mismo. Queda una sola, la que se veía.
- La lista de la entrada, dos por fila fijas.
- El tema de fuego es casi opaco: es una placa, no un cristal.

---

## 4.0.0 — en curso

Reconstrucción posterior a la primera ruta de campo real («O Eco do Vixía»,
el monte). El motor aguantó y la gente terminó; lo que no aguantó fue la
cobertura mala del monte. Esta versión ataca eso.

### Que la mala cobertura no mande a repetir juegos

Había dos verdades sobre en qué nodo estaba un jugador —la del móvil, que avanza
sin cobertura, y la del servidor, que sólo se entera al sincronizar— y nadie las
reconciliaba.

- `/api/advance` distingue por fin **ir por detrás** de **ir por delante**. Por
  detrás es el eco de una petición que sí llegó, y se contesta `ok`. Por delante
  significa que al móvil le faltan avances por subir: antes se contestaba `ok`
  igual, el móvil lo daba por bueno y el nodo no quedaba anotado en ninguna
  parte. Ahora contesta `behind`, el móvil vacía su cola y lo reintenta.
- El nivel del servidor va en **todas** las respuestas, también en los fallos.
- El nivel del jugador ya no baja por una respuesta de red. Sólo baja al abrir
  la aplicación con la cola vacía, o cuando llega un reseteo desde
  administración —que es la única vez que el servidor puede mandar un nivel más
  bajo y tener razón.
- Abrir la aplicación ya no pisa el progreso ganado en modo avión.
- El refresco que corre justo después de superar un nodo pide la partida con el
  paquete offline completo. Sin eso, completar un nodo con cobertura dejaba sin
  contenido jugable a todos los nodos siguientes: sin red no cargaba el
  minijuego ni se aceptaba el código de respaldo.
- Las dos colas de sincronización dejan de correr a la vez contra el mismo
  endpoint. Primero los nodos completados, y de una en una.
- Los eventos que el servidor rechaza de forma definitiva salen de la cola. Los
  rechazos se cuentan aparte de los intentos: quedarse sin red no significa que
  el evento esté mal.

### Repositorio

- Historia reiniciada. Los 112 commits y las 111 etiquetas anteriores eran
  registros de despliegue, no de decisiones.
- Fuera 28 000 líneas de peso muerto: dos copias sin usar de la hoja de estilos
  de administración, un prefetch de teselas que descargaba a una caché que nadie
  leía, diez scripts de comprobación de un solo uso y los informes de versiones
  que ya no existen.
