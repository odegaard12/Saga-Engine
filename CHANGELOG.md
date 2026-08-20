# Changelog

Lo que cambia en cada versión y por qué. Las entradas nuevas van arriba.

La versión que corre en producción está en `VERSION` y la sirve `/api/version`.

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
