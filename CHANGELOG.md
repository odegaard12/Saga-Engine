# Changelog

Lo que cambia en cada versión y por qué. Las entradas nuevas van arriba.

La versión que corre en producción está en `VERSION` y la sirve `/api/version`.

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
