# Changelog

Lo que cambia en cada versión y por qué. Las entradas nuevas van arriba.

La versión que corre en producción está en `VERSION` y la sirve `/api/version`.

---

## 5.23.4

- La baldosa de red de caminos que falla **se parte en cuatro** y se vuelve
  a pedir (hasta 3 km de lado). El 504 de Overpass casi siempre es
  "demasiado para una petición" -una ciudad entera dentro de una baldosa de
  25 km-, no "no funciona"; reintentar la misma baldosa en tres espejos
  sólo la atascaba. Pausas más cortas.



- La red de caminos se construye **en segundo plano** en el servidor, y el
  panel enseña el progreso ("7 de 25 baldosas"). Con 40 km son cinco o seis
  minutos y una petición HTTP tan larga caducaba por el camino.
- Baldosas de 25 km con pausa entre ellas y espera antes de reintentar:
  Overpass concede pocas ranuras por IP y las peticiones encadenadas sin
  pausa acababan en 504 en todos los espejos.



- La red de caminos se descarga **por baldosas de 15 km** y con espejos de
  reserva. El servidor público de Overpass devolvía 504 con zonas de 30-40
  km de una vez; en trozos pequeños cada petición es liviana, se unen y se
  quitan los elementos repetidos. Con test de cobertura de las baldosas.

## 5.23.1

- La red de caminos admite un margen de hasta 45 km (por defecto 40): tiene
  que cubrir desde donde la gente LLEGA a la ruta, no sólo la ruta. Con
  12 km, quien probaba desde casa a 35 km veía la guía recta y creía que
  no funcionaba.
- El banco de mapa tiene un botón "ponerme lejos" (2,5 km del nodo) para
  ver la guía redirigir por caminos.



- **Red de caminos: fuera del trazado, la guía redirige por carreteras.**
  El mapa del panel dibuja las carreteras pero no las tiene como datos.
  Ahora el panel (Ajustes → "Red de caminos") descarga de OpenStreetMap las
  carreteras y caminos alrededor de la ruta (margen configurable, 12 km por
  defecto), los reduce a un grafo de cruces y tramos con su forma
  simplificada, y lo guarda. El grafo viaja en el paquete offline de cada
  móvil (`/api/road-graph`, misma caché que las teselas) y el móvil calcula
  el camino más corto con A*, sin cobertura. La guía, cuando estás a más de
  120 m del trazado, va por caminos reales hasta el punto más cercano de la
  ruta y desde ahí sigue el trazado. Sin red preparada, recta como antes.
  Se recalcula sólo cuando te mueves más de quince metros, por la batería.



- **La barra de carga cuenta lo que hace.** Con el paquete ya completo
  pasaba unos segundos "calculando" y saltaba de 0 a 100: parecía que no
  cargaba nada. Lo que hace es comprobar que las ~4.300 teselas están en
  el móvil, y ahora esa comprobación se ve avanzar con la cuenta real
  ("3.120 de 4.312 teselas en el móvil"). Lo que falte se baja después,
  con su propia barra, como siempre.
- **"Centrar en mí" antes de tener posición ya centra.** Se pulsaba, el
  navegador pedía el permiso, el jugador aceptaba… y la posición llegaba
  después de que el encuadre se hubiera dado por hecho: el mapa no se
  centraba nunca. Ahora el encuadre queda pendiente hasta que hay posición.
- El aviso de "fuera del trazado" se centra por márgenes, no por
  `transform`: en el móvil salía descentrado.



- **La guía de ti al nodo va por el camino.** Recta era mentira: cruzaba el
  monte por donde no se puede andar. Ahora es un tramito hasta el punto del
  trazado más cercano y, desde ahí, el trazado que queda hasta el nodo.
- **Aviso de "fuera del trazado"** a más de 500 m del camino, con los metros
  (o kilómetros) que faltan; se apaga por debajo de 400 m para no parpadear
  en el borde a cada aviso del GPS.
- **Seguirme sin tirones.** Cada aviso del GPS lanzaba una animación corta
  que cortaba la anterior: sacudidas. Ahora no se sigue con el mapa en la
  mano ni por menos de tres metros, y la animación es más larga que el
  intervalo entre avisos, así que una enlaza con la siguiente.
- **La tarjeta de permisos deja de salir con todo concedido.** En iPhone no
  se puede consultar si la cámara está concedida sin pedirla, y el
  movimiento exige un toque por sesión: la tarjeta salía SIEMPRE. Lo
  concedido una vez se recuerda en el móvil; la petición de movimiento que
  iOS exige desde un toque se cuela en el primer toque del jugador, ya
  concedida, sin preguntar nada.
- El botón de "ver la ruta" mantiene siempre el icono de brújula: cambiar
  de icono al activarse hacía creer que había un botón más. El estado lo
  dice el color.



- **La pantalla de carga vuelve a bajar lo que falta, y esta vez para
  siempre.** El resumen guardado en el móvil lleva ahora la FIRMA del plan
  (tope, niveles, relieve, radios): cuando cambia lo que lleva el paquete,
  el resumen viejo deja de valer solo. Tres versiones seguidas dejaron la
  barra al 100 % de golpe y el mapa cargando de la red al moverse porque
  el resumen seguía diciendo "completo"; ya no puede pasar.
- **Un solo botón para encuadrar y enderezar.** Fuera el botón flotante de
  norte: el botón de la barra de "ver la ruta / volver a mí" -que en el
  motor nuevo no hacía nada porque los encuadres estaban pendientes- ahora
  encuadra de verdad, siempre con el norte arriba, y su aguja gira con el
  mapa para avisar de que está girado.
- **Los tres encuadres y "seguirme" en el mapa 3D.** Ver la ruta entera,
  ver el nodo, volver a mí; y la cámara sigue al jugador, suave, hasta que
  toca el mapa con la mano.
- **Vuelve la animación entre el jugador y el nodo**: una línea a trazos de
  ti al nodo que toca, con los trazos avanzando hacia él. Recta a
  propósito: no dice por dónde ir -eso lo dice el trazado-, dice hacia
  dónde.
- El botón 2D/3D: el color va con la etiqueta. "3D" claro, "2D" oscuro.



- **La cuenta atrás de salida habría fallado dos horas, y ya no.** El
  contenedor corre en UTC y el móvil en hora local; la fecha del panel se
  guardaba sin zona, así que el servidor la leía como UTC (una salida a las
  09:00 era 11:00 en Galicia) mientras la cortina del móvil se levantaba a
  las 09:00: dos horas con la cortina fuera y `/api/advance` diciendo que
  no. Tres capas de arreglo: el panel guarda la fecha con la zona del
  organizador, el servidor asume Europe/Madrid si aun así llega sin ella,
  y el contenedor vive en Europe/Madrid. Con test.
- **El paquete offline ya no recorta el corredor.** El tope de 1500
  teselas se aplica por orden de llegada, y con los niveles de continente,
  país y región delante dejaba fuera justo lo último: el corredor por donde
  se camina y el detalle de los nodos. La barra llegaba al 100 % de golpe y
  cerca del nodo el mapa cargaba de la red. Tope a 8000.
- Relieve de z11 a z14 (comarca y zona de misión), ~1000 teselas, ~90 MB:
  la elevación pesa 90 KB por tesela y es lo que decide el tamaño del
  paquete. La fuente de elevación del mapa se queda en z14 -z15 sólo
  aportaba detalle que a pie no se aprecia y duplicaba el relieve del
  paquete-. Y un nivel de entorno a z12 (±58 km, sólo imagen) para lo que
  se ve al desampliar desde casa hacia la ruta.
- El botón 2D/3D: verde en 3D, apagado en 2D.



- **Relieve offline también para región y comarca** (z8-z11), no sólo
  para la zona de misión y el corredor. Son unos 50 MB más de paquete, y
  se decide a propósito: el enlace se da días antes de la salida, cada
  jugador entra en casa con wifi a bajar todo, y la cortina de cuenta
  atrás (`mission_launch_at`) bloquea jugar hasta la hora. A cambio, el
  monte es el mismo con o sin cobertura desde la vista de toda Galicia
  hasta el camino. Continente y país (z3-z7) siguen sin relieve: a ese
  zoom no se lee y la fuente no lo sirve por debajo de z8.



- **El paquete offline baja el mapa por niveles de calidad según la
  distancia.** Continente en calidad general (z3-z5, ±1850..3700 km), país
  algo mejor (z6-z7, ±700..925 km), región mejor (z8-z9, ±290..460 km),
  comarca mejor (z10-z11, ±115..175 km), y la máxima sólo donde se camina
  (zona de misión y corredor, como hasta ahora). Unos 780 teselas de
  contexto, 23 MB: al desampliar sin cobertura nunca aparece un hueco. Los
  niveles bajos existían, pero con presupuestos que a z3-z4 no llegaban y a
  z10-z11 se quedaban cortos.
- El relieve del paquete se limita a la zona de misión y al corredor. Una
  tesela de elevación pesa el triple que una de imagen; darle relieve a
  media Galicia eran 30 MB para un desnivel que a ese zoom apenas se lee.
  Donde se camina, el monte es el mismo con o sin cobertura.



- **El mapa se pinta debajo de la pantalla de carga.** El velo ya no se
  retira hasta que el mapa 3D avisa de que ha pintado su primera vista
  -estilo montado, teselas e imágenes cargadas, relieve construido-, con un
  tope de siete segundos por si el aviso no llega (sin paquete y sin
  cobertura, o con la app en segundo plano). Antes el velo se iba en cuanto
  había permisos y todo ese trabajo caía encima del jugador: "tuvo que
  renderizar todo mientras me movía".
- Las gemelas de relieve del paquete offline se calculan DESPUÉS del
  corredor: el bucle recorre lo que ya está en la lista, y puesto antes no
  veía las teselas de z15, las que el terreno pide al caminar.



- **Sin cobertura, el relieve.** El service worker servía desde la caché
  las teselas de imagen pero no las de elevación (`/dem-tiles/`): sin red
  el monte salía plano -"era otro mapa, no tenía el mismo desnivel"-. Ahora
  la elevación va por la misma caché que la imagen.
- **La pantalla de carga vuelve a bajar lo que falta.** Se saltaba la
  descarga porque el resumen guardado decía "completo" -de un paquete de
  antes de que entraran el relieve a z14-15 y el corredor por el trazado
  real-: la barra pasaba al 100 % al instante y lo nuevo no se bajaba
  nunca. Cambia la clave del resumen; lo que ya está en el móvil no se
  vuelve a pedir, sólo lo que falta.
- El botón 2D/3D tiene el mismo aspecto en los dos estados; cambia la
  etiqueta, que dice a qué modo vas. Cambiar de color al pasar a 2D se leía
  como avería.
- Botón de norte: aparece sólo cuando el mapa está girado, con la aguja
  girando con él; un toque lo devuelve al norte.



- **El trazado cuenta la partida.** Verde lo andado, azul el tramo en
  juego, claro y apagado lo que queda: cada tramo hereda el estado del
  nodo al que llega. Y sobre el tramo en juego, un pulso blanco que
  respira (opacidad animada diez veces por segundo, sólo con la pestaña
  visible): "por aquí, ahora", sin leer nada.
- **Tu avatar deja de saltar.** Era el último marcador del DOM que quedaba
  en el mapa 3D, y por eso el único que seguía descolocándose con el
  relieve al hacer zoom. Ahora es un símbolo del mapa como los nodos y las
  fotos: círculo con tu foto (o iniciales sobre tu color), anillo blanco y
  halo de tu color, dibujado en canvas y colocado por el motor en el mismo
  fotograma que el terreno.
- **El paquete offline baja lo que el mapa 3D pide de verdad.** El
  corredor de teselas seguía rectas entre nodos, y la ruta real da rodeos
  por caminos que se salían de él: ahora sigue el `route_track`. Y el
  relieve baja hasta z15 (antes z13): el terreno pide z14-15 en cuanto se
  camina, y sin ellas el monte se quedaba plano sin cobertura.



- **Las fotos de campo se quedan en su sitio.** Eran marcadores del DOM, y
  un marcador del DOM va un fotograma por detrás del terreno: con relieve y
  zoom "no se quedaban en su posición como los nodos". Ahora son símbolos
  del mapa, igual que las chinchetas: la miniatura se carga y se enmarca en
  un canvas bajo demanda (marco blanco, esquinas redondeadas, sombra en el
  suelo) y el motor la coloca en el mismo fotograma que todo lo demás. El
  toque sobre una foto lo resuelve el propio mapa y abre todas las de ese
  punto, como antes.
- **El mapa ya no da un tirón al terminar de cargar.** La pantalla del
  jugador abre el mapa sobre el nodo o el GPS, y al llegar los datos se
  saltaba OTRA VEZ al nodo: el mapa se movía y las teselas recién pintadas
  se borraban. El salto inicial sólo se hace cuando nadie dio un centro.
- Fuera el escalado por zoom de los marcadores del DOM: ya no queda ninguno
  que escalar; los símbolos escalan solos.
- El banco de mapa enseña cuántas fotos hay en la fuente del mapa.



- **5.16.1 no bastaba: el worker importa a su vez otro fichero.**
  `maplibre-gl-worker.mjs` hace `import "./maplibre-gl-shared.mjs"`, y con
  `?url` Vite sólo copiaba el primero; el segundo daba 404 y el módulo
  moría igual de callado. Medido: fichero servido con 200 y `text/javascript`,
  y aun así cero respuestas del worker. Ahora se importa con `?worker&url`,
  que empaqueta el worker CON sus dependencias en un único fichero con hash.



- **EL fallo de toda la migración al mapa 3D, y el más silencioso.**
  MapLibre v6 hace su trabajo pesado en un web worker que carga como módulo
  desde una URL calculada al lado de su propio chunk
  (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`). Vite no copia
  ese fichero porque nadie lo importa, así que devolvía 404 -los dos 404
  sin explicar de cada carga- y el worker moría sin decir una palabra.
  Todo lo que pasa por el worker estuvo muerto desde 5.10: las fuentes
  GeoJSON (trazado, radio, extrusión, símbolos) y la decodificación del
  relieve. Las teselas satélite y los marcadores del DOM no lo usan, y por
  eso eran lo único que se veía. Tuvo pinta de bug de datos, de eventos,
  de posición y del móvil, y no era ninguno. Medido: worker vivo, cero
  respuestas a una carga GeoJSON.
  Ahora el worker se importa con `?url`, Vite lo emite con hash en
  `/assets/` y se le da a MapLibre la dirección real.
- El banco de mapa lleva una fila **worker (GeoJSON)** que mide justo este
  síntoma: si dice MUDO, nada de lo que pase por el worker se va a ver.



- **Los nodos pasan a ser símbolos del mapa, no marcadores del DOM.** Un
  marcador del DOM se coloca desde JavaScript un fotograma después de que
  el mapa se haya dibujado: con relieve y zoom va siempre por detrás del
  terreno -"al ampliar quedan mal y al soltar se recolocan"-. Un símbolo lo
  pinta el propio motor, en el mismo fotograma y a la altura correcta del
  terreno. La chincheta se dibuja en un canvas al vuelo, con el número
  horneado dentro: cabeza con luz, borde oscuro, punta y sombra en el
  suelo. Sin fuentes de letras externas, que serían una petición más que
  falla sin cobertura. Bajo cada una, un disco de metro y medio pegado al
  relieve que la ancla al terreno sin taparla.
- **El vigilante del estilo rehacía mapas sanos.** Comprobaba
  `isStyleLoaded()`, que es `false` cada vez que hay una tesela cargando
  -o sea, en cada zoom-, y rehacía el estilo entero hasta cinco veces:
  vaciaba fuentes, recargaba teselas y descolocaba marcadores. Eso era el
  "carga raro". Ahora sólo actúa si el estilo no tiene capas.
- Trazado un poco más grueso y radio de entrada con borde continuo y
  relleno más presente: las líneas a trazos tienen historial de pintarse
  mal sobre relieve en MapLibre, y lo primero es que se vea.



- La guarda de colores del tema cazaba las sombras del terreno de 5.15.0.
  Son colores del monte, no de la piel de la app: una ladera a la sombra es
  azul oscura con cualquier tema. Quedan marcados como tales.



- **Chinchetas 3D de verdad: poste fino y cabeza ancha, en metros.** Un
  cilindro solo se leía como un depósito de agua. Poste estrecho más cabeza
  gorda encima es la silueta de una chincheta clavada, y esa silueta la
  reconoce cualquiera desde cualquier ángulo. Son dos volúmenes extruidos
  por nodo: crecen, se inclinan y se tapan con la perspectiva, sin
  simulaciones. El nodo en juego es más alto.
- **Relieve que se lee, como en los mapas de montaña.** Sombra azulada y luz
  cálida en el sombreado de laderas: con los grises por defecto se fundía
  con la foto satélite y el monte parecía plano aunque la malla estuviera
  levantada. Y el sombreado pasa a una fuente de elevación propia, porque
  MapLibre avisa de que compartirla con el terreno baja la calidad del
  dibujo (mismas teselas, misma caché; sólo cambia el nombre).
- El banco de mapa lee las fuentes por `serialize()`, que es API pública.
  Leía un campo interno que ya no existe y decía 0 con los datos puestos.
  Medido: radio 1, trazado 9, volumen 10 -el volcado de 5.14.2 funciona-.



- El asa de depuración expone también el estilo del mapa. En una pestaña
  que no pinta MapLibre nunca monta el estilo -espera un fotograma-, y sin
  eso no había forma de medir las capas de datos. Ahora se puede forzar el
  montaje desde fuera y comprobar trazado, radio y volumen sin que nadie
  tenga que estar mirando.



- **Los nodos por fin se quedan en su sitio.** Salían apilados en columna
  y sólo "iban a su ubicación" al ampliar, y a escala de toda Galicia los
  diez formaban una fila perfecta y equiespaciada -cosa que ninguna
  geografía produce-. La causa: el elemento de la chincheta llevaba
  `position: relative` en línea, y el estilo en línea gana a la clase de
  MapLibre (`position: absolute`). Los diez nodos estaban en flujo de
  documento desde la esquina del mapa, y MapLibre sólo les sumaba el
  desplazamiento. Medido en el navegador: regla `absolute`, cálculo
  `relative`. Cinco versiones persiguiendo esto. Hay test que lo blinda
  para todos los marcadores.



- El banco de mapa cuenta sus propios montajes y enseña qué respondió la
  API (código, nodos, nivel). Se vio "nodos 0" con nueve chinchetas en el
  mapa, y en vez de deducir por qué, que lo diga él.
- Botón **nodos de prueba**: tres nodos inventados cerca de Catoira, con
  trazado y radio. Prueban el trazado, el radio y el volumen 3D sin depender
  de la API ni de la sesión: si con ellos se ve, el motor está bien y lo que
  falla es de dónde salen los datos; y al revés.



- **El banco de pruebas mentía, que es peor que no tenerlo.** Comprobaba la
  fuente de teselas por un nombre que no existe -siempre decía que no había
  teselas aunque el mapa las estuviera pintando- y tenía un candado que
  impedía repetir la petición de la partida: si el componente se montaba
  dos veces, la segunda se quedaba sin nodos para siempre y el panel decía
  "nodos 0" mientras el mapa tenía diez marcadores puestos.
- El banco muestra también cuántas fotos cargó y lleva un botón para volver
  a pedir los datos sin recargar la página.



- **Encontrado el fallo que se llevó media docena de versiones: el trazado,
  el radio y los volúmenes 3D nunca recibían sus datos.** La línea que los
  pintaba era `fuente?.setData(datos)`. Si el estilo del mapa todavía no
  había terminado de montarse, `getSource` no devolvía nada, la
  interrogación se tragaba la llamada en silencio y no se reintentaba
  jamás. Los nodos llegan de la API en bastante menos de lo que tarda el
  estilo, así que se perdían casi siempre.
  El síntoma engañaba y por eso costó tanto: se veían las teselas y el
  relieve -van declarados en el estilo, nadie tiene que rellenarlos- y se
  veían los nodos y las fotos -son marcadores del DOM-. Faltaba
  exactamente lo que hay que rellenar después. Sin un solo error.
  Ahora lo último de cada fuente se guarda siempre y se vuelca en cuanto el
  estilo está en condiciones.
- Los volúmenes de los nodos suben a 28 m, y 45 m el nodo en juego, con
  seis metros de radio. A zoom 16-17 un poste bajo lo aplasta la
  perspectiva contra el suelo y no se lee como volumen: lo que hace que un
  nodo parezca plantado en el monte es verle el costado.
- La chincheta del número se hace más pequeña, porque ya no es ella la que
  marca el sitio.



- El banco de mapa ya no necesitaba recargarse para mostrar los números. Se
  pedía el asa del mapa por parámetro en la dirección, y llegaba tarde: los
  efectos del hijo corren antes que los del padre, así que el mapa miraba la
  dirección antes de que el banco hubiera podido escribir el parámetro.



- **Banco de pruebas del mapa en `/banco-mapa?user=NOMBRE`.** El mapa no se
  podía mirar, y ese era el problema de fondo: la pantalla del jugador sólo
  se abre en vertical -en un escritorio enseña el aviso de girar el móvil y
  el mapa ni llega a montarse-, exige elegir jugador, pide permisos y se
  pasa cuarenta y cinco segundos descargando la misión antes de pintar
  nada. Con todo eso delante, cada cambio del mapa se corregía a ciegas y
  se daba por bueno sin verlo, que es exactamente como se colaron los
  últimos fallos.
  El banco abre el mapa solo, a pantalla completa, con los datos de verdad
  y con los números a la vista: si el estilo montó, si hay teselas, con
  cuánto relieve, cuántos vértices tiene el radio, cuántos tramos el
  trazado y cuántos nodos tienen volumen. Nada de eso se puede deducir
  mirando una captura.



- **Los nodos pasan a ser 3D de verdad, no un dibujo que lo imita.** Cada
  nodo levanta un volumen extruido desde el suelo, con altura en METROS: se
  inclina con la cámara, lo tapa el monte que tiene delante y crece en
  perspectiva al acercarse. Un marcador del DOM nunca podía hacer eso -es
  una calcomanía pegada a la pantalla- por mucha sombra que se le pintara.
  El nodo en juego se levanta más que los demás, para localizarlo de lejos.
- **Fuera el volcado falso de las fotos.** Se les había puesto un `rotateX`
  en CSS para que parecieran tumbadas sobre el terreno. Es mentira y se
  nota: un giro de CSS no sigue a la cámara, así que al desplazar o girar
  el mapa quedaban inclinadas hacia un lado que no correspondía a nada.
- **Al abrir, el mapa va al nodo actual, no a la ruta entera.** Encuadrar
  los diez nodos de golpe sonaba bien y quedó peor: a zoom 13 los
  alfileres, que miden lo mismo en píxeles a cualquier escala, se amontonan
  en una fila de chinchetas sobre medio mapa de Galicia.



- **El mapa podía quedarse EN BLANCO, y esto explica el "está todo mal".**
  MapLibre v6 monta el estilo dentro de un `requestAnimationFrame`, y un
  navegador no ejecuta fotogramas en una pestaña que no se está pintando.
  Si el mapa nace con la pantalla bloqueada o con la app en segundo plano
  -normalísimo durante los segundos que tarda la descarga offline- ese
  fotograma no llega nunca: no hay teselas, no hay relieve, no hay radio ni
  trazado. Y encima los nodos SÍ se ven, porque son marcadores del DOM, así
  que parece que el mapa casi funciona en vez de estar sin estilo. Sin un
  solo error en consola. Ahora hay un vigilante que vuelve a aplicar el
  estilo al recuperar visibilidad, con tope de cinco intentos.
- **La ruta se encuadra al entrar** cuando todavía no hay GPS. Abriendo
  siempre a zoom 16 sobre un punto, los diez nodos de una ruta de
  kilómetros caen fuera de la pantalla o salen alineados contra un borde.



- **El radio y el trazado, por fin.** 5.13.1 y 5.13.3 no lo arreglaron, y
  las dos veces se dio por bueno sin comprobarlo en la página. El estilo se
  declara en línea, así que MapLibre lo monta dentro del constructor: el
  evento `style.load` ya ha ocurrido cuando se engancha el escuchador, y
  `isStyleLoaded()` no vale de red porque es más estricto que el evento
  -exige además que carguen todas las fuentes-. Entre las dos señales, el
  código se quedaba en tierra de nadie y no pintaba nunca.
  Ahora las dos fuentes y sus cuatro capas **nacen declaradas en el
  estilo**, así que existen desde el primer fotograma y no hay nada que
  esperar. El estado de "estilo listo" desaparece.



- **El radio y el trazado seguían sin pintarse, y ahora se sabe por qué.**
  En 5.13.1 se cambió `load` por `style.load` dando por hecho que era el
  evento correcto. Lo es, pero llega tarde: el estilo se declara EN LÍNEA
  -no por URL- y MapLibre lo monta de forma síncrona dentro del
  constructor, así que para cuando se engancha el escuchador el evento ya
  ocurrió y no vuelve a ocurrir. Ahora se pregunta con `isStyleLoaded()`
  antes de escuchar. Se cazó porque el asa de depuración de 5.13.2 no
  aparecía en la página, que es exactamente para lo que se puso.



- **Tu posición vuelve a ser tu avatar, no una chincheta.** En el motor
  nuevo había quedado el marcador por defecto de MapLibre, y eso no es un
  detalle estético: en un mapa lleno de chinchetas numeradas, una chincheta
  más no dice "este eres tú". Ahora va tu foto, con tu color de halo, como
  en el motor de siempre.
- **Relieve más marcado.** A la altura a la que se juega -zoom 17-18, unos
  cientos de metros de ancho- el desnivel real de un valle son unos pocos
  metros: geométricamente correcto e invisible. El sombreado de laderas
  pasa de 0,5 a 0,85 y la exageración del terreno de 1,5 a 2,2, que es lo
  que hace legible la FORMA del terreno a esa escala.
- Asa de depuración del mapa con `?depurar-mapa=1`. Sin ella no había modo
  de comprobar desde fuera si el terreno estaba puesto o qué capas había, y
  se estaba verificando a ojo -que es justo como se colaron los fallos de
  esta pantalla-. No se expone nunca por defecto.

## 5.13.1

Tres cosas del mapa 3D que no se veían, y ninguna daba error: el mapa se
mostraba perfecto y simplemente faltaban capas encima.

- **El trazado y el radio de entrada no se pintaban nunca.** Los dos
  esperaban al evento `load` de MapLibre, que con el relieve activado no
  dispara hasta que carga el terreno. Los nodos y las fotos sí aparecían
  porque son marcadores del DOM y no esperan a nada, y por eso el síntoma
  despistaba tanto: faltaban justo las dos capas de datos. Ahora se
  enganchan a `style.load`, que es lo único que hace falta para poder
  añadir fuentes.
- **Las chinchetas se veían como bolas.** El giro que les da forma de gota
  estaba puesto en el propio elemento del marcador, y MapLibre reescribe
  ese `transform` en cada fotograma para colocarlo en pantalla. La forma
  vive ahora en un hijo, donde sobrevive.
- **El trazado era ilegible aunque se pintara**: una línea blanca de 3 px
  al 55 % sobre FOTO SATÉLITE desaparece sobre asfalto o arena. Lleva
  contorno oscuro por debajo y grosor según el zoom, como las apps de
  senderismo.

Y de paso, volumen donde antes había calcomanías:

- Radio de entrada con borde a trazos, para que no se confunda con una
  rotonda o un depósito de la propia imagen aérea.
- Chinchetas con degradado y sombra en el suelo: se leen como clavadas en
  el terreno, no pegadas al cristal de la pantalla. Fotos volcadas hacia
  atrás por el mismo motivo.
- Chinchetas y fotos crecen al acercar el zoom. Un tamaño fijo obliga a
  elegir entre tapar media ruta de lejos o no distinguir nada de cerca.

## 5.13.0

Cuatro cosas que faltaban en el mapa 3D, dichas mirándolo en el móvil.

- **Chinchetas, no puntos planos.** Un círculo suelto sobre la foto aérea
  no dice DÓNDE toca el suelo: con la cámara inclinada parece flotar. La
  forma de gota con la punta abajo, anclada por la punta, se clava en el
  sitio exacto aunque el mapa se incline. Con el número dentro, derecho
  (el giro es de la chincheta, no del texto).
- **El radio del nodo ahora se ve**: el borde era azul de 2 px y se perdía
  sobre foto aérea con sol. Blanco de 3 px. Ese círculo dice a qué
  distancia entras en el nodo; si no se ve, no sirve de nada.
- **Trazado real de vuelta.** No la línea recta que se quitó por mentir,
  sino el `route_track` que guarda administración en cada nodo — el mismo
  que dibuja el motor de Leaflet, leído del mismo sitio y con el mismo
  lector.
- **Fotos de campo** sobre el mapa, y al tocarlas se abre el visor con
  todas las de ese punto. Marcadores del DOM por lo mismo que los nodos:
  una capa de MapLibre quedaría enterrada bajo el relieve, y una foto ES
  una miniatura.

Quedan: avatares del grupo, los tres encuadres, el aura de GPS, el cono de
orientación y el modo depuración.

## 5.12.1

Los nodos no se veían en el mapa 3D. Y no daba ningún error, que es lo que
lo hizo difícil de encontrar: **se dibujaban por debajo del monte**.

Con el relieve activado, una capa de círculos de MapLibre queda enterrada
bajo la malla del terreno. El mapa se veía perfecto y los nodos no
aparecían por ningún lado.

Ahora van como marcadores del DOM: van por encima del lienzo siempre, lo
tape lo que lo tape, y además llevan el número dentro, como en el motor de
Leaflet. Son diez, no diez mil, así que tenerlos en el DOM no cuesta nada
aquí.

## 5.12.0

El relieve se baja en la pantalla de carga, y la vista 3D pasa a ser la de
por defecto.

- **Relieve en la descarga previa.** Antes la elevación se pedía al entrar
  al mapa, y eso era la tardanza que se notaba en el móvil. Ahora baja
  donde ya se está esperando a propósito: la pantalla de carga.
- **Sin recalcular nada**: el relieve usa el mismo esquema z/x/y que el
  satélite -las dos son XYZ en Web Mercator de 256 px-, así que cada
  tesela de relieve cubre justo el mismo trozo que su gemela de satélite.
  El plan coge las teselas ya planificadas y añade sus gemelas.
- **Zooms 8 a 13 para el relieve**, no hasta 15. MapLibre estira la
  elevación de un zoom bajo al acercarte, y la FORMA del monte no gana
  nada con más detalle. Hasta 13 cuesta unos pocos megas; hasta 15 serían
  cientos, cargados en la mochila de cada móvil.
- **Vista 3D por defecto**, e inclinada ya al abrir -no basculando desde
  plano, que se veía como un tirón en cada entrada-. El botón queda
  encendido en 3D y apagado en 2D.

## 5.11.0

Relieve de verdad en el mapa 3D, y el botón donde tiene que estar.

- **Desnivel real.** Hasta ahora "3D" era inclinar la cámara sobre una
  foto plana: perspectiva, no relieve. Ahora hay origen de elevación
  (Terrarium de AWS, abierto y sin clave) más sombreado de laderas. El
  monte se ve Y se lee.
- **Proxy propio para la elevación** (`/dem-tiles/...`) con caché en
  disco, igual que el satélite, y no directo desde el móvil: mismo origen
  (sin CORS), una descarga por zona para todos los jugadores en vez de
  una por móvil, y sobre todo que el service worker pueda guardarlas para
  el monte. Un origen externo directo no se puede cachear para jugar sin
  cobertura, que aquí es innegociable.
- **Tope de zoom 15 en la elevación**: es hasta donde llega Terrarium. Sin
  ese tope, al acercarse MapLibre pide teselas que no existen y el relieve
  desaparece justo cuando más cerca estás.
- **El botón 2D/3D sube a la fila de iconos**, con la cámara, la
  clasificación y el resto. Flotando suelto sobre el mapa se veía
  descolgado del diseño. Solo aparece con el motor WebGL: Leaflet no sabe
  inclinar la cámara.
- **Nodos más visibles**: 7 px se perdían sobre la foto aérea, más aún con
  la cámara inclinada. 10 con borde de 3.

Pendiente y sabido: la primera carga tarda porque la elevación y las
teselas se piden al entrar. La descarga previa hay que ampliarla para que
cubra también el relieve.

## 5.10.2

Dos cosas vistas por fin en una captura del móvil de Óscar, no leyendo
código.

- **El aviso de HTTP ocupaba un cuarto de la pantalla** y le hablaba a un
  programador: `ngrok`, `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
  Encima del mapa, a un jugador que está en el monte. Ahora es una línea:
  "esta dirección no es segura, el navegador no deja usar el GPS, avisa a
  quien monta la misión". El detalle técnico vive donde sirve, en la
  documentación de despliegue.
- **La barra de abajo no se leía.** "Activar GPS" parecía desactivado y
  Mochila/Ferramentas salían lavados. Regresión del paso a cristal
  (5.6.0): contra el azul noche de antes no se notaba, contra una foto
  aérea con sol sí. Arreglado con un velo de tinta DEBAJO del tinte de
  cristal: asegura el contraste sin perder el aspecto, y como ninguna
  capa es opaca el desenfoque del mapa se sigue viendo.

## 5.10.1

Fuera la línea recta entre nodos del motor WebGL.

Probada en el móvil y descartada: no es "el trazado a medias", es
información falsa. Cruza el monte por donde no se puede andar, y quien la
mire caminando se fía de ella. El motor de Leaflet traza por caminos
reales; hasta que eso esté portado, el motor nuevo no pinta ninguna ruta.

Mejor no pintar nada que pintar una ruta que miente.

## 5.10.0

Segunda capa del motor WebGL: radio del nodo, trazado de la ruta, nodos por
estado, y botón 2D/3D.

- **Radio del nodo como polígono**, no como círculo de MapLibre: el radio
  de un círculo va en píxeles, así que al alejarse seguiría midiendo lo
  mismo en pantalla y dejaría de significar "50 metros a la redonda", que
  es lo único que ese círculo tiene que decir. Un polígono en coordenadas
  sí escala, porque está en el terreno y no en la pantalla.
- **Nodos por estado** (hecho / el que toca / pendiente) con los mismos
  colores que Leaflet. No siguen al tema, igual que allí: ahí el color es
  información, y cambiarla por tema obligaría a reaprender el mapa.
- **Trazado** entre nodos. De momento en línea recta; el trazado por
  caminos reales queda en la lista de pendientes.
- **Botón 2D/3D**: inclinar la cámara. Es la misma escena con otra matriz
  -no pide ni un dato más-, así que funciona igual sin cobertura.
- Las capas se crean vacías UNA vez y después solo se les cambian los
  datos. Crear y destruir capas en cada cambio de props es lo que hace
  parpadear a un mapa de WebGL.
- Guarda contra el error clásico de MapLibre: tocar fuentes o capas antes
  de que el estilo termine de cargar lanza, y los datos llegan por props
  cuando quieren, no cuando el mapa está listo. Todo espera a `load`.

Sigue mandando Leaflet por defecto.

## 5.9.0

El interruptor entre los dos motores de mapa, para poder compararlos en un
móvil de verdad.

- `map_engine` en la configuración de la misión: `leaflet` (por defecto, el
  motor completo) o `maplibre` (WebGL, en migración). Un valor desconocido
  cae en Leaflet a propósito: un nombre mal escrito no puede dejar a nadie
  en el monte con un mapa a medio portar.
- Viaja en `/api/config`, así que se cambia por misión sin tocar código.
- El motor WebGL se carga con `lazy`, no con un import normal: `maplibre-gl`
  son ~800 kB y con un import normal se los tragaría también quien juega con
  Leaflet, que es todo el mundo mientras dure la migración. Comprobado en el
  build: queda en su propio chunk (1 MB) y el bundle principal no crece.

Sigue mandando Leaflet por defecto. Esto solo abre la puerta a comparar.

## 5.8.0

Primera capa del motor de mapa en WebGL (MapLibre GL), en paralelo y
apagada.

Leaflet tiene tres límites que no son fallos sueltos sino su forma de
dibujar -mosaico de `<img>` reposicionado con `transform`-: el zoom va
por niveles enteros, las teselas contiguas dejan costuras de subpíxel al
escalar, y cada nivel nuevo pide un juego de imágenes distinto (blanco
mientras llegan). Toda la serie 5.7.x fueron parches a síntomas de eso, y
uno (5.7.2) tiró la aplicación en producción.

- `MapSurfaceGL.tsx`: teselas + posición del jugador + nodos. Usa **las
  mismas teselas** que Leaflet (`/map-tiles/{z}/{x}/{y}.png`), así que el
  modo sin cobertura sigue valiendo tal cual, sin migrar datos.
- El estilo va declarado en crudo, no por URL: una URL de estilo sería
  una petición más que falla sin cobertura.
- `mapSurfaceContract.ts`: contrato común de los dos motores y **lista
  explícita de las capas que al nuevo le faltan** (radio del nodo,
  trazado, grupo, fotos, encuadres, depuración…). Cuando esa lista quede
  vacía, y no antes, el motor nuevo pasa a ser el de por defecto.

No lo importa nadie todavía: el bundle solo crece 1,6 kB y lo que juega
la gente sigue siendo Leaflet, intacto. Al cablearlo habrá que cargar
`maplibre-gl` con import dinámico (~800 kB).

**Además, dos guardianes nuevos** tras comprobar que la insignia de
versión del README llevaba meses mintiendo (decía 3.14.2 con el proyecto
en la 5.5.0) y que volvió a quedarse atrás en 5.7.x: ahora la suite exige
que README, VERSION y CHANGELOG digan lo mismo.

## 5.7.2

Líneas blancas de un instante al hacer zoom en el mapa. No es un hueco de
datos -la misión offline baja las teselas de zoom 5 a 18 completo-: es la
costura clásica de Leaflet, redondeo de subpíxel al escalar teselas
contiguas por separado durante la animación de zoom. Arreglo estándar:
cada tesela un pixel más ancha/alta, para que solape con la de al lado en
vez de dejar hueco.

552/552 tests en verde.

## 5.7.1

El botón de "ver toda la ruta" (desampliar desde tu posición para ver
dónde están los nodos) iba a saltos y parpadeaba -reportado por Óscar-.
Causa documentada en el propio código desde hace tiempo, pero solo
arreglada para "volver al nodo": `flyToBounds` anima calculando
posiciones intermedias, y en cada una pide/suelta teselas del mapa. Este
botón es el peor caso posible -de tu posición junto a un nodo (zoom alto)
a toda la ruta (zoom bajo)- y nunca tuvo la salida rápida que sí tiene el
resto de movimientos del mapa. Mismo arreglo que ya funcionaba ahí:
saltos largos o de zoom grande se PLANTAN sin animar (sin teselas
intermedias que pedir), solo el ajuste fino se anima.

552/552 tests en verde.

## 5.7.0

Antitrampas: captura el patrón, sal de la app, resuélvelo con calma. Hueco
real señalado por Óscar en un minijuego de patrón (circuitMatrix y sus
variantes) — sin nada que lo detecte, hacer una captura de pantalla y
resolver fuera de la app, sin presión de tiempo, era trivial.

Nuevo hook compartido `useRegenerarAoOcultar`
(frontend/src/player/minigames/core/): detecta cuándo la pestaña pasa a
segundo plano mientras hay un patrón activo en pantalla, y dispara una
reacción -no un descuento de tiempo aparte, el reloj del nodo sigue
corriendo igual-:

- **circuitMatrix, placeMosaic**: el patrón es aleatorio por partida →
  vuelve a la pantalla de "Comenzar" con un patrón NUEVO. La captura vieja
  deja de servir.
- **tiltMaze**: sin forma de regenerar el trazado en marcha → cuenta como
  perder todas las vidas de golpe, se pierde el intento entero.
- **sequenceCode (Simón Dice)**: su secuencia es fija A PROPÓSITO -se
  aprende por ensayo y error, es el diseño del reto-, así que regenerarla
  rompería su propia mecánica. Aquí salir cuenta como un fallo normal
  -vuelta al nivel 1-, cerrando la "pausa gratis para apuntarla" sin tocar
  el diseño.

Verificado con un test que confirma que las cuatro pantallas llaman al
hook con las fases correctas, y que sequenceCode específicamente NO
regenera su patrón (sería un error, no una mejora, para ese juego).

552/552 tests en verde.

## 5.6.2

Asimetría cerrada: la píldora del contador (1/2, 2/2) tenía fondo oscuro
forzado SOLO en fuego; en cristal y musgo se quedaba sin ningún fondo
propio, leyéndose a medias sobre lo que hubiera detrás en el mapa -el
mismo síntoma que ya se había arreglado, pero solo para un tema-. Misma
regla, generalizada a los tres.

## 5.6.1

El check de lint fallaba en cada push desde 5.6.0: unas comillas sin escapar
en el aviso nuevo de minijuego sin runtime (`AdminApp.tsx`). Arreglado
(`&quot;` en vez de `"` dentro del JSX). De paso, 126 releases de GitHub que
faltaban (v4.1.0 a v5.6.0 — el workflow que las creaba automáticamente,
`release.yml`, se borró del repo hace meses sin que nadie se diera cuenta)
creadas a mano con `gh release create` desde `.103`, que tiene sesión de
GitHub autenticada.

## 5.6.0

Puerta de contraseña de misión, caché de teselas en disco, tema Musgo, y el
mapa deja de saltar.

- **Puerta de misión**: contraseña única compartida por el grupo, cierra la
  entrada hasta desbloquearla; se gestiona desde el panel admin.
- **Mapa fluido de verdad**: cada tesela era un proxy en vivo a Esri sin
  caché en el servidor -cada jugador pagaba el viaje Pi→Esri por cada
  tesela, cada vez-. Ahora se cachea en disco: la primera visita a una zona
  paga el viaje, las siguientes se sirven local. Y el marcador de jugador
  ya no salta entre fijas de GPS: desliza con interpolación real
  (`requestAnimationFrame`), verificado con un banco que ejecuta la función
  de verdad y mide, no solo lee el código
  (`sim/playwright-bench/scenarios/verificar-deslizamiento-gps.mjs`).
- **Tema Musgo**: tercer tema de jugador, verde relajado, junto a Cristal y
  Fuego.
- **Barras de cristal**: la barra superior e inferior del jugador vuelven a
  ser translúcidas (con `backdrop-filter`, no el velo plano que ya falló
  una vez antes).
- Arreglado el fundido a negro que dejaba asomar el mapa un instante al
  salir de la pantalla de permisos.
- Aviso visible en el panel admin cuando un nodo usa un tipo de minijuego
  sin runtime propio.
- Refresco pesado de misión (214 KB) ya no se pide a ciegas cada 30s: el
  latido, que ya viaja cada 30s, avisa si el nivel cambió de verdad.
- `js-yaml` (dependencia de desarrollo, vía eslint) actualizada: cerraba
  una alerta de seguridad de GitHub (DoS por CPU, severidad alta).
- `TRUST_PROXY_HEADERS`/`TRUSTED_PROXY_IPS` activados en el despliegue de
  producción: sin ellos, cinco fallos de login admin desde cualquier IP
  -todas llegan como la del túnel- bloqueaban al admin real.

## 4.9.30

El hueco de la cabecera de la Mochila era el tirador, no las pestañas.

Medido: por encima de la palabra «Guía» había **54&nbsp;px**, y 35 eran aire
muerto alrededor de un tirador de 5&nbsp;px de alto — 14 de relleno superior de
la hoja, 16 de relleno del tirador y 10 de hueco de rejilla, sumados uno detrás
de otro porque cada capa ponía el suyo sin mirar la de al lado.

Ahora **el relleno del tirador es el único aire de arriba**: la hoja no pone
ninguno y el hueco de rejilla se va. Quedan 36&nbsp;px, y el tirador sigue
teniendo 27&nbsp;px de zona de arrastre.

## 4.9.29

Los avisos ya no se esconden detrás de la barra, y las pestañas llenan su fila.

**Los avisos estaban tapados.** La línea callada se pintaba a 148&nbsp;px del
borde y la barra de iconos está a 138 con `zIndex: 1600`: cualquier aviso salía
**detrás**. Se veían a medias —«Solicitando…» asomando por los lados— y parecían
un fallo de pintado. Ahora va a 208 (138 de la barra + sus 58 de alto + 12 de
aire) y con capa por delante.

Es un fallo que me llevé puesto desde 4.9.7, cuando le di sitio propio a los
avisos: elegí una altura sin comprobar qué había ya ahí.

**Las pestañas dejaban medio ancho muerto.** Tres palabras cortas alineadas a la
izquierda y un vacío hasta el botón de cerrar. Ahora **cada una se lleva su
tercio**, el subrayado ocupa su tramo y se leen como pestañas y no como tres
enlaces sueltos.

**Y la línea de distancia deja de ser un pastillón blanco** del ancho entero
para dos datos de servicio. Ahora es una línea y ya.

---

## 4.9.28

Los tres rediseños de la propuesta, montados.

### El progreso ES el filo de la barra

El `6/10` dice en qué nodo vas; no enseña **cuánto llevas**. La tira de puntos sí
lo hacía y se comía el tercio inferior de la barra. Ahora lo cuenta una regla de
**3 px pegada al borde de abajo**, partida en tantos tramos como nodos y
encendida hasta donde estás. A sangre, con márgenes negativos: **un filo no es
una fila** y no ocupa alto propio.

### La barra de abajo pierde las cápsulas

Cada icono llevaba borde, fondo y un radio de 18 clavado **dentro** de otro
marco con los suyos: tres bordes por botón en una barra de cinco. Ahora el icono
va suelto y lo que separa es una línea fina. El área de toque se queda en
44×40&nbsp;px — es lo mínimo para el dedo y no depende de que se vea un
recuadro.

El botón activo se marca con un **filo encendido abajo**, no devolviéndole el
recuadro. Y de paso sale un azul cielo (`#bae6fd`) que quedaba de cristal.

### La hoja: fuera la cabecera, las pestañas son cintas

- **La cabecera se va.** «MOCHILA / Guía, objetos y respaldo» ocupaba dos líneas
  para decir lo que las pestañas ya dicen. El botón de cerrar se queda, en la
  misma fila que ellas.
- **Las pestañas dejan de ser cajas.** Eran tres cajas dentro de otra caja con
  su fondo y su borde: cuatro marcos para elegir entre tres cosas. Ahora son
  texto con un subrayado encendido en la activa.

Entre las dos, la hoja gana unos 90&nbsp;px de altura para lo que se usa.

**Lo que NO se movió:** la línea de distancia y radio se queda como fila propia.
En la maqueta iba junto a las pestañas, pero lleva el indicador de cobertura
—una barra de señal dibujada— y meterlo ahí era más riesgo que ganancia.

---

## 4.9.27

Las fotos se apartan del nodo, no sólo se meten debajo.

En 4.9.26 les bajé la capa y no bastaba: seguían viéndose a medias detrás del
alfiler. Había ya un desplazamiento para no taparle la flecha al jugador —a
35&nbsp;m—, pero **ninguno para los nodos**, y las fotos se hacen justo junto a
un nodo, así que acaban clavadas encima.

Ahora una foto a menos de 40&nbsp;m de un nodo se aparta 34&nbsp;m **en
dirección contraria al nodo**, para no cruzarse ni con el camino ni con el
alfiler siguiente. Si está exactamente encima no hay dirección que calcular y se
manda al este.

Y una dependencia que faltaba en el efecto: sin `missionStages`, el
desplazamiento no se recalculaba al cambiar los nodos.

---

## 4.9.26

Tres correcciones sobre 4.9.25, todas de mirar capturas.

**La barra era una caja grande y vacía.** Le quité el título y la tira de puntos
pero le dejé el relleno de 16&nbsp;px y una sola fila dentro: quedó peor que
antes. Ahora es una línea fina de verdad —relleno de 8/9&nbsp;px— con todo en
la misma fila: nombre, nodo, reloj y cuenta. El nombre del nodo se queda con el
sitio que sobre y se corta con puntos suspensivos antes que empujar al reloj
fuera de la pantalla.

**La etiqueta colgada del alfiler, retirada.** La idea era buena sobre el papel
y no sobrevivió al mapa de verdad, por dos motivos: se solapaba con las fotos de
campo y con los alfileres vecinos —que en esta ruta van a menos de 100&nbsp;m
unos de otros—, y el texto que tenía a mano no era el nombre del nodo sino su
etiqueta de accesibilidad («Coleccionable · Nodo 6 · siguiente nodo»). El nombre
vuelve a la barra, que ahora tiene sitio.

**Las fotos tapaban los alfileres.** Iban a `zIndexOffset: 600` y los nodos a
540/560, así que un nodo con una foto cerca desaparecía debajo. Invertido: las
fotos a 510. Los nodos son a dónde hay que ir; las fotos son recuerdos.

---

## 4.9.25

Barra C y Mesa C. El rediseño de verdad, no la piel.

Ocho versiones cambiando colores, radios y cortes sin que se notara, porque
**eso era la piel**. Esto cambia qué se ve, cuánto ocupa y en qué orden se lee.

### La barra: dos piezas

Arriba queda **sólo una línea de estado** —nombre, reloj, 6/10—. Se van dos
cosas:

- **El nombre del nodo**, que vivía a media pantalla del punto al que se
  refiere. Ahora **cuelga de su propio alfiler en el mapa**, y sólo el del nodo
  actual: ponérselo a los diez llenaría el mapa de texto y taparía el camino.
- **La tira de puntos.** El mapa ya cuenta qué nodo está hecho con el color de
  cada alfiler; la tira repetía esa información ocupando el tercio inferior de
  la barra. Queda la cuenta 6/10, que es el resumen que sí hacía falta.

De paso se fueron **doce estilos y tres variables** que quedaron sin uso, y una
prop que el componente ya no necesita.

### La mesa: sin ficha

Era una tarjeta dentro de una hoja dentro de un panel — tres marcos para un
contenido, en 375 px de ancho. Ahora:

- La receta es una **sección plana**.
- Cada pieza es una **fila a todo el ancho** con su filo de estado a la
  izquierda: se leen en vertical de un vistazo y se distinguen con guantes. En
  horizontal se envolvían y quedaban a medias.
- **ENSAMBLAR está siempre**, apagado mientras faltan piezas. Antes sólo
  aparecía al completar la receta, así que mientras juntabas no había nada que
  te dijera hacia dónde ibas.

Y otro color de otro tema que quedaba: el botón era **morado**
(`#a78bfa → #7c3aed`) en un tema rojo.

---

## 4.9.24

Cuadrado de verdad. Llevaba siete versiones cortando esquinas **encima** de
esquinas redondeadas.

Con la captura de la mesa delante se vio el error de bulto: el tema de fuego
tenía los radios en **14 y 11 px** (cristal tiene 24 y 16), y once píxeles
**siguen siendo redondos**. Yo iba añadiendo `clip-path` que corta dos esquinas
y las otras dos seguían curvas — así que la pantalla se leía igual por mucho
corte que pusiera.

| | Antes | Ahora |
|---|---|---|
| `--theme-radius-panel` | 14 px | **2 px** |
| `--theme-radius-card` | 11 px | **2 px** |
| `--theme-radius-pill` | 999 px | **3 px** |

**El corte y el redondeo son la misma decisión y tienen que ir juntos:** si el
tema corta esquinas, no puede redondear las demás.

La píldora sale además de la lista de «variables que pueden valer lo mismo en
los dos temas». La llevan el reloj, la de SOLO, la cuenta 6/10 y el FALTAN de la
mesa: era lo último que quedaba redondo en la pantalla, y en un tema de esquinas
duras una gragea perfecta canta.

Las pestañas de la mochila (GUÍA / OBXECTOS / MESA) se cuadran solas: ya salían
de `--theme-radius-card`.

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
