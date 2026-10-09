# Changelog

Lo que cambia en cada versión y por qué. Las entradas nuevas van arriba.

La versión que corre en producción está en `VERSION` y la sirve `/api/version`.

---

## 5.54.0

- **Mapa del iPhone como en la 5.51.1: satélite de Esri otra vez y relieve hasta z12.** Probado en WebKit (el motor de Safari) con perfil de iPhone (390×844, densidad 3), cámara quieta y siguiendo a un jugador con fixes de GPS cada 1,5 s, z16-z19, en 3D y 2D, contra la 5.51.1 y con cada conmutador: WebKit de escritorio NO deja el mapa más borroso que la 5.51.1 (misma nitidez quieto y en marcha, mismas teselas cargadas, hasta z19). Lo que sí se mide es la foto: a z18-z19, donde se juega, la PNOA de la zona sale más blanda y lavada que Esri (varianza del laplaciano 45/41 contra 66/53; energía de bordes 4,6/2,3 contra 5,4/2,8): sin tejados ni coches nítidos, «otro mapa». Por eso el satélite vuelve a Esri en todo el mapa (`PNOA_EN_EL_MAPA = False` en `runtime/teselas.py`; el camino de la PNOA sigue ahí y probado), sin el contraste/saturación que se le ponía a la PNOA, y la caché de teselas del móvil cambia de nombre (`…-v5.54-esri`, plan 7): quien tenía la PNOA guardada vuelve a bajar el mapa en la pantalla de carga. La forma del terreno vuelve a z12 (como en 5.51.1); el sombreado sigue con el MDT05 a z14, así que los taludes se siguen leyendo. Los créditos ya no citan la PNOA.
- **Casas en el iPhone.** Safari no da la memoria y da pocos núcleos, así que todo iPhone arrancaba en calidad «baja» y nunca veía las casas. Ahora un iPhone con muesca o isla (iOS, densidad 3 y lado largo de 812 px o más: del X en adelante) arranca en «media»: casas del Catastro y hasta seis cuerpos 3D. Los Plus viejos (736 px) siguen en «baja». Si el medidor de fotogramas de los avatares baja a «baja» jugando, el mapa apaga también las casas.

## 5.53.2

- **Pantalla de carga sin textos de sobra.** Una sola barra para todo (app, misión y mapa juntos; el mapa pesa más porque es lo que más tarda), con el porcentaje y, debajo, sólo el nombre de lo que baja ahora («Mapa») y el tiempo que queda cuando se sabe («Mapa · ≈ 2 min»). Fuera la explicación de arriba, las tres barras con sus detalles, los MB y la lista larga de lo que falta. La barra nunca retrocede. «Entrar igualmente» sigue igual de a mano, con una sola línea debajo («Sin cobertura no tendrás el mapa.»). «Reintentar» sólo sale si algo falló, y el error se sigue diciendo («Mapa: Faltan 45 teselas del mapa»). Los créditos del mapa, en letra pequeña al pie.
- **«Tiempo para la partida» con el diseño de la app.** Tarjeta como las del jugador (mismo fondo, borde, radio y sombra del tema), las próximas horas en una fila compacta (hora, cielo, temperatura y la probabilidad de lluvia sólo cuando pasa del 20 %), el viento de ahora arriba a la derecha y los avisos de lluvia, tormenta o viento como etiquetas pequeñas. Al pie, «por MeteoCatoira y Open-Meteo» (la previsión por horas es de Open-Meteo). Va debajo de la barra, y si no hay datos no sale. En español, gallego e inglés.
- **El chip del tiempo del mapa, a juego:** tarjeta sólida del tema en vez de cristal, temperatura más visible y el viento separado con una línea fina. El aviso grande (lluvia, tormenta, viento) usa también la tarjeta y el radio del tema.
- **Diagnóstico del mapa borroso en iPhone.** Conmutadores del estilo SÓLO por la dirección: `?mapa=esri,terreno12,sinterreno,sinsombra,sincontraste,fade,pr2,sinedificios` (satélite de Esri, relieve hasta z12 como en 5.51.1, sin terreno 3D, sin sombreado, sin contraste/saturación/brillo, fundido por defecto, pixelRatio con tope 2, sin casas). Se guardan en la sesión (sobreviven a la recarga de la PWA) y, mientras haya alguno, sale el panel con el botón «Normal» para quitarlos. `?depurar-mapa=1` suma una sección «Mapa» (zoom, inclinación, pixelRatio del mapa y del móvil, tamaño del lienzo, GPU y `maxTextureSize`, terreno y sus teselas, teselas cargadas/pendientes y su zoom máximo por fuente, versión de MapLibre) que también copia «Copiar», un botón por conmutador y «Ocultar» para ver el mapa sin el panel. Ruta nueva `/map-tiles/esri/{z}/{x}/{y}.png` (siempre Esri, misma zona y tope; el service worker no la guarda). Sin parámetros no cambia nada.

## 5.53.1

- **El porcentaje de la descarga avanza poco a poco.** Las teselas se piden en lotes de 30 (4 a la vez) en vez de 120 (3 a la vez): el porcentaje sólo sube al cerrar un lote, y con lotes grandes se quedaba minutos en 0 % y luego saltaba a 4 %, 7 %…

## 5.53.0

Arreglo del mapa de la 5.52 (borroso en el iPhone y carga eterna) y todas las mejoras pendientes.

- **Mapa nítido otra vez en el iPhone.** Fuera el tope de fotogramas que la 5.52 metía en calidad baja (la del iPhone) tocando una pieza interna de MapLibre; el relieve vuelve a z14.
- **Carga mucho más rápida con la caché de la Pi vacía.** Al preparar el mapa 3D, la Pi baja y guarda también la foto aérea de toda la zona (mismo plan que el móvil); los lotes aguantan más y ya no se cae a pedir miles de teselas sueltas.


- **El relieve rehecho en el panel llega a los móviles.** «Preparar mapa 3D de la zona» deja una versión (`mapa3d_version` en `/api/config`, huella de `mapa3d.json`) que va en la URL del relieve y de los edificios (`/dem-tiles/…png?v=…`, `/api/edificios?v=…`) y en la firma del mapa guardado: si cambia, la pantalla de carga vuelve a bajar SOLO el relieve y los edificios, y quita los de la versión vieja cuando el nuevo está entero. El service worker sirve primero la copia de esa versión; sin red, la de otra versión antes que un monte plano. El lote de teselas acepta y devuelve el `?v=`. Los edificios guardados ya no piden red mientras se juega.
- **Paquete offline más ligero: de ~3000 a ~1950 teselas y de 86 a 54 MB de mapa** (102 → 71 MB con la app; ruta de prueba de ~10 km). El relieve lejano (z11-z12) iba en toda la comarca (±110 km) y el entorno (±60 km): 41 MB. Ahora z11 llega a 40 km de la ruta (lo que pide el horizonte con la cámara inclinada) y z12 a 15 km: 7,4 MB. Región, comarca y entorno de imagen con menos lado (z8-z12: ~900 → 285 teselas), suficiente para desampliar sin huecos. La ruta, sus alrededores y el detalle de los nodos no cambian.
- **Pantalla de carga más clara.** Cada parte enseña los MB bajados y, en cuanto hay con qué estimarlo, el tiempo que falta («12,3 MB · ≈ 2 min para terminar»). «Entrar igualmente» dice qué falta de cada parte y qué pasará sin cobertura (el mapa en blanco o plano donde falte, los nodos sin poder jugarse…).
- **«Preparar mapa 3D de la zona» calienta también la caché de satélite de la Pi** (fase «satélite», o sola con `--solo satelite`): baja de antemano las teselas que pedirá la pantalla de carga de cada móvil, con el mismo plan que el cliente (`runtime/plan_teselas.py`, copia de `planificarTeselas` comprobada contra él en los tests), a la misma carpeta y con el mismo tope de caché que el proxy. 5 peticiones a la vez con pausa y reintentos; lo que ya está en disco no se pide. Calentar sólo el satélite no cambia la versión del mapa 3D: los móviles no vuelven a bajar el relieve.
- **Lotes de teselas que aguantan la caché fría:** el servidor atiende 16 teselas a la vez por lote (eran 8) y el móvil espera 0,75 s por tesela (90 s para un lote de 120; eran 30 s fijos). Con el IGN a ~3,7 s por tesela los lotes caducaban y el móvil repetía cientos de teselas de una en una.
- **Los nodos 3D ya no dan un salto al superar uno.** Al cambiar de nodo se rehacían todos con una fase al azar y el ritmo de cada uno dependía del reloj global: todas las bolas saltaban a la vez justo en la celebración. Ahora la fase sale del id del nodo y cada uno lleva su propio reloj.

- **El tiempo en el juego.** `/api/tiempo` da el tiempo en el centro de la zona de la misión: lo medido por una estación propia si se configura (`SAGA_TIEMPO_URL`, formato de MeteoCatoira) y la previsión por horas y por cuartos de hora de Open-Meteo. Caché de 12 min, 4 s de límite por fuente y, tras un fallo, 2 min sin volver a preguntar; si no contesta nadie se sirve lo último bueno con su hora. En el móvil: un chip discreto en el mapa (cielo, temperatura, viento y rachas), un aviso de lluvia fuerte, tormenta o viento fuerte en las próximas 2 h («Lluvia en 30 min: busca refugio», «Viento fuerte: cuidado en zonas altas») y la previsión de las próximas horas en la pantalla de carga. Sin red se enseña lo último guardado con su hora. En castellano, gallego e inglés.
- **Avisos al organizador por ntfy** (apagados por defecto; Ajustes → Avisos): jugador que termina, primer jugador en cada nodo, sospecha fuerte del antitrampas (3 en 15 min), jugador sin señal más de 30 min en plena partida y errores del servidor repetidos. Se agrupan en una notificación por minuto, cada cosa avisa una vez y hay un tope de 10 por hora. Servidor, tema y token sólo por entorno (`SAGA_NTFY_URL`, `SAGA_NTFY_TOPIC`, `SAGA_NTFY_TOKEN`). Botón «Enviar aviso de prueba».
- **Personajes con mirada.** En la tienda y en la ficha de un compañero la cabeza busca la cámara (giro suave del cuello y la cabeza, con tope; si la cámara queda detrás, vuelve al frente) y los ojos llevan córnea: un casquete que sólo suma el reflejo, así la luz deja su puntito de brillo en el ojo. Los ojos se localizan solos en la malla de cada personaje (los modelos no traen huesos ni morphs de ojos o párpados: parpadear no es posible). Luz de relleno suave a la altura de la cara.
- **Gestos: fuera los que no se veían.** Quedan siete: Saludar, Aplaudir, ¡Bien!, Por ahí, Encoger los hombros, Asentir y Negar (estos dos, con el giro de la cabeza exagerado para que se note en el mapa). Se quitan De acuerdo, Mirar, ¡Uf!, Pensar y Esperar: lo ya ganado pasa al gesto más parecido (De acuerdo → Asentir, Mirar → Por ahí, ¡Uf! y Esperar → Encoger los hombros, Pensar → Negar), una regla guardada que daba uno quitado da su sustituto y la regla de la primera foto da «Por ahí». Encoger los hombros pasa a ser libre.
- **Menú de gestos sin taparte.** Al abrirlo, el mapa sube lo que mide la hoja y tu muñeco se ve encima mientras eliges; al cerrarlo vuelve donde estaba.
- **Pies que ya no patinan.** El ritmo del paso se ajusta a lo que avanza de verdad cada animación (andar 1,55 m/s, correr 3,1 m/s): antes el pie apoyado se deslizaba hacia atrás andando y hacia delante corriendo.
- **Panel: el personaje de cada jugador** junto a su foto en la lista y en la ficha de Jugadores.
- **`/api/salud` para la monitorización:** versión, si la base de datos responde, disco libre del volumen de datos y si el mapa 3D está preparado. 200 si va bien, 503 si la base no responde o queda poco disco. Sin datos de jugadores.

## 5.52.2

Mantenimiento.

- **Dependencias al día (las seguras):** FastAPI 0.142.2, Starlette 1.7.0, Pydantic 2.13.5, Uvicorn 0.54.0, osmium 4.3.1; MapLibre 6.12, TanStack Query 5.104, JSZip 3.10.2, Zustand 5.0.15, Vite 8.3.2 y herramientas. Quedan para más adelante, porque piden revisar código, three 0.186, meshoptimizer 1.3 y ESLint 10.

## 5.52.1

Arreglos de la preparación del mapa 3D, encontrados al lanzarla en la Pi con la ruta real.

- **La zona de la misión ya no llega hasta Madrid.** El centro del mapa de la configuración, que suele quedarse en el valor de serie (Madrid), se sumaba a los nodos y estiraba la zona de una ruta gallega a media España. Ahora sólo cuenta si la misión no tiene nodos. También afecta al proxy de teselas, que servía esa zona enorme.
- **Relieve del IGN:** el servicio devuelve a veces la rejilla con `dx`/`dy` (celdas no cuadradas) en vez de `cellsize`; ya se lee bien.
- **Edificios del Catastro:** si en lugar del zip llega una página web, ya no se guarda como si fuera el zip ni rompe toda la preparación: ese municipio se salta y se avisa.

## 5.52.0

Jugadores, fotos, gestos y el vikingo (ronda 12).

- **Los demás ya no van «asociados» a ti.** El corro de 5.49 se abría en PANTALLA alrededor de TU icono, con un umbral
  del tamaño del muñeco (unos 20 m a z18), y el cuerpo 3D se recolocaba cada fotograma con `unproject` de ese punto
  de pantalla. Como la cámara te sigue, al andar tú cambiaba el sitio del compañero. Ahora tu posición no interviene:
  solo se abren en corro los compañeros que coinciden entre ellos (a menos de 3 m, y siguen juntos hasta 4,5 m). El
  apartado es de 2,2 m en el suelo, fijo por jugador, y a z19,5 baja al 70 %. Medido en el navegador: andando 50 m, el
  cuerpo de un compañero quieto no se mueve ni un centímetro, a z18 y a z19,5.
- **Cada compañero mira hacia donde apunta SU móvil.** El latido manda `heading`, que es el rumbo de tus fixes de GPS.
  El servidor lo guarda solo en memoria y caduca a los 20 s. Si no llega, el compañero mira hacia donde anda.
- **Las fotos de campo, encima de los jugadores.** Se suben por encima de los retratos y de los cuerpos 3D, y por
  debajo solo de la celebración. El toque que abre una foto ya no abre también la ficha del jugador que hay debajo.
- **Menú de gestos nuevo.** Tres grupos, un icono por gesto y fichas grandes en tres columnas. Tocar un gesto no
  cierra el menú: tu muñeco lo hace en el mapa, y su ficha se marca mientras dura. Los gestos bloqueados enseñan cómo
  se ganan.
- **El vikingo de Catoira.** Llega con un zurrón vikingo (cuero y piel de oveja) y un hacha barbuda. Además hay una
  maza de madera y vuelve el sacho. Los tres objetos de mano se hacen por código y usan el agarre del bordón,
  autorado en Blender. Se ha revisado de cerca, de frente, de lado y andando: la mano cierra sobre el mango.
  `item:sacho` y `item:mochila_vikinga` son libres. `item:hacha` e `item:maza` se ganan: la regla «Completar un nodo
  concreto» del nodo vikingo se pone desde su cajón.

Mapa 3D de la zona y batería.

- **Satélite PNOA del IGN.** Dentro de España, desde z11, la foto aérea es la ortofoto PNOA (IGN / Xunta, CC BY 4.0),
  que sí se puede guardar en el móvil para jugar sin cobertura. Lleva un toque de contraste y saturación, porque llega
  algo lavada. Esri queda solo de respaldo: a zoom bajo, fuera de España o si el IGN falla. Cada origen tiene su
  propia carpeta de caché en la Pi, y el servidor sigue sirviendo solo la zona de la misión.
- **Relieve de 5 m y casas en 3D.** Hay un botón nuevo en Ajustes, «Preparar mapa 3D de la zona», y también la orden
  `python -m backend.app.runtime.mapa3d`. Pide al IGN el MDT05 (y el MDT25 para z11-z13) de la caja de la misión, en
  bloques, con pausas y reintentos, y genera teselas terrain-RGB de z11 a z15 en `data/dem_ign`. También baja del
  Catastro los edificios de los municipios de la zona: los municipios se descubren por la caja, mediante el ATOM de
  INSPIRE. La altura de cada edificio es plantas × 3 m + 0,6. Todo corre en un proceso aparte, con su progreso en el
  panel, y no frena al servidor. `/dem-tiles` sirve primero lo preparado y, si falta, Terrarium. `/api/edificios`
  devuelve las casas recortadas a la misión, sin ninguna encima de un nodo y comprimidas con gzip. Nada de esto entra
  en el repositorio (`.gitignore`).
- **El mapa del jugador.** La forma del terreno llega hasta z14 (antes z12) y el sombreado hasta z15, con exageración
  0,55. Las casas salen desde z15, en color teja suave y con opacidad 0,85, por debajo de la ruta, los nodos y los
  jugadores. En móviles de calidad baja no salen. Los créditos (PNOA, MDT05, Catastro) están al pie de la pantalla de
  carga.
- **Offline.** La pantalla de carga baja también el relieve z15 de la zona de misión y del corredor y los edificios. La caché de teselas es
  nueva (`saga-route-tile-coverage-v5.52-pnoa`) y la firma del plan sube a 6, así que cada móvil vuelve a bajar el
  mapa una vez. El service worker sirve los edificios sin red.
- **Batería.** Las propiedades que laten (pulso del tramo, halo, moneda, guía) ya no llevan la transición de 300 ms:
  con ella, el mapa se repintaba unas 29 veces por segundo con la cámara quieta. En calidad baja, el mapa tiene un tope
  de 30 fps. Con la pestaña oculta, el latido se despierta cada 500 ms en vez de cada 100.

## 5.51.1

Corrección de una compañera que sólo se veía como retrato.

- **Los compañeros sin conexión ya se ven como muñeco 3D.** El mapa quitaba el aspecto a quien llevaba más de 10 minutos sin dar señales y sólo dibujaba su retrato, aunque se ampliara al máximo. Ahora todos los que tienen una posición conocida salen en 3D en su última posición, y su retrato sigue atenuado.

## 5.51.0

- **Los compañeros ya no se quedan en retrato sin avisar.** Si el móvil no tenía el modelo 3D de algún personaje (porque
  se entró «igualmente» o falló la red al bajarlo), el compañero se veía solo como icono por mucho que se ampliara. La
  pantalla de carga ya no da por buena la parte «App» si faltan modelos que el servidor sí tiene: enseña el fallo
  («Faltan N archivos de los personajes por bajar») y deja reintentar. Y si alguien entra igualmente, el mapa muestra un
  aviso pequeño, «Faltan personajes por descargar · Descargar»: al tocarlo se bajan con su barra y los muñecos aparecen
  al terminar. Sin conexión explica que se verán como retratos hasta tener red. Nada se baja solo mientras se juega.
- **Tienda: cada cosa en su pestaña.** El pelo pasa a «Personaje» (junto al personaje); «Ropa» queda con camiseta,
  pantalón y calzado, por ese orden; «Objetos» solo lleva lo que se lleva puesto. Los candados siguen igual.
- **Admin, Jugadores:** nuevo filtro «Sin actividad» (sin latido en más de 30 min y sin terminar) y cada filtro vacío dice
  lo suyo («Nadie ha terminado todavía», «Nadie está en vivo ahora»…) en vez de «Ningún jugador coincide».

---

## 5.50.0

- **Admin: la barra de nodos se lee bien.** Las tarjetas son más altas y enseñan número, nombre, tipo con su icono y un
  estado (completo, con aviso o incompleto); el nodo actual va muy marcado. Ya no hay barra de desplazamiento tapando el
  texto: se mueve con las flechas, la rueda, el arrastre o el dedo. Arriba pone «Nodo 2 de 10», cuántos están incompletos
  o con aviso, y hay botones claros de «Añadir nodo» e «Imprimir QRs». En el ordenador se reordena arrastrando el asa ⠿
  (las flechas ◀ ▶ siguen). La marca de versión ya no se solapa con la barra.
- **Admin: el editor de nodo se ha rehecho por secciones.** En vez de tres pestañas con una pila de campos, hay una
  cabecera fija (nombre, tipo, estado, «cambios sin guardar» y los botones Guardar, Cerrar y ⋯ con Cambiar tipo y
  Eliminar) y secciones que se pliegan y enseñan un resumen cerradas: Identidad y tipo, Dónde y acceso, Cómo se juega,
  Historia y pistas, Recompensas (con la recompensa de vestuario dentro) y Avanzado. Cada campo lleva su ayuda, los
  textos largos un contador, y a la derecha se ve una maqueta del móvil del jugador. Los avisos (falta nombre, posición,
  preguntas, un objeto que nadie entrega) salen en su sección. Ctrl+S guarda y Esc cierra. En el móvil es pantalla
  completa con barra de abajo. Los mismos campos, claves y validaciones de antes: sólo cambia el orden y la piel. Guardar
  sigue cerrando el editor al terminar, como antes.
- **Admin: Jugadores, Minijuegos y Ajustes más ordenados.** Jugadores es una lista con foto, tipo, estado en vivo,
  nodo y progreso, con búsqueda, filtros y un menú ⋯ por jugador; la ficha se abre en un panel lateral. Minijuegos
  muestra una tarjeta por juego agrupada por familia. Ajustes tiene buscador y atajos a cada sección. Todos los paneles
  comparten botones, tarjetas, tablas y avisos, con letra de 15 px, contraste alto, foco visible y objetivos de 44 px.

- **Los compañeros que no han elegido personaje ya se ven en 3D aunque el móvil vaya justo.** En el móvil, quien llegaba
  a «calidad baja» (se queda en 3 muñecos) contaba SU PROPIO cuerpo dentro del tope: tú y dos compañeros ocupabais todo
  y los demás se quedaban con su retrato por mucho zoom que hicieras (le pasó a una compañera sin personaje elegido).
  Ahora tu cuerpo no gasta plaza del tope, el reparto se hace por distancia en PANTALLA al centro del mapa, quien ya va
  en 3D no parpadea por una diferencia pequeña, y quien no tiene relieve cargado en su punto ya no ocupa plaza ni se
  queda sin cuerpo: pasado un segundo usa la cota del centro del mapa.
- **`?depurar-mapa` enseña por qué cada jugador va en 3D o en retrato.** Con ese parámetro sale una tabla pequeña (nombre,
  si eligió personaje, qué modelo usa, 3D o retrato y el motivo: tope de calidad, sin modelo en el móvil, presencia
  antigua, zoom bajo, fuera de pantalla…), la calidad, el tope y los fps, con botón «Copiar» y «Bajar modelos» (pide a
  la red los modelos que falten, sólo cuando lo pulsas). Sin el parámetro no existe.
- **Fuera el botón «i» de créditos del mapa.** Los créditos de las fuentes (Esri, Terrain Tiles de Mapzen/AWS) siguen
  declarados en el mapa y ahora se leen, en pequeño y en es/gl/en, al pie de la pantalla de carga y en el README.

- **Corrige el bloque verde de 5.49.0 en el iPhone.** La 5.49.0 sacó la raíz del jugador del `fixed; inset: 0` de la
  5.48 (`.saga-raiz-movil` con `top`/`bottom`/`height` salidos de `--saga-vista-*` y `100lvh` en la PWA) y dejó el
  marco pintando `--theme-bg` (verde) debajo del contenido: cualquier desfase entre raíz y ventana enseñaba un bloque
  verde abajo. Vuelve el layout de la 5.48; html, body, `#root` y el marco pintan el casi-negro de la barra de abajo;
  `vistaTrasTeclado` ya no compensa con variables ni esconde `#root`, solo devuelve el scroll a (0, 0). Se mantienen la
  hoja de «Añadir nota» con blur explícito y `?depurar-vista`. Test nuevo contra el fondo del tema bajo la raíz.

## 5.49.0

- **Clave de misión con pantalla previa y generador.** El móvil no tenía pantalla para la clave (la API ya cerraba la
  lista de jugadores y las fotos, pero nadie llamaba a `unlockMission`): ahora `PuertaDeMision` envuelve el login y el
  enlace `/player/NOMBRE`, pide el código si `/api/config` dice `mission_unlocked: false` y recarga al acertar. Sin
  red (o si el servidor no contesta) NO pide nada: quien ya cargó la misión juega entera sin cobertura. La cookie
  `saga_mission` dura 180 días y cambiar la clave la invalida. Panel: «Generar clave» (8 caracteres sin ambigüedades),
  mostrar/ocultar y copiar; al guardar sale la clave en un aviso («anótala ahora: no se puede volver a ver») y al
  quitarla otro. La clave se compara sin espacios de los lados.
- **Proximidad en el panel y la exportación.** Casilla «Exigir proximidad en el servidor» en Ajustes
  (`require_server_proximity`, apagada por defecto; ahora `save-config` la guarda); columna «Proximidad» en Tiempos;
  `nodos_por_jugador.csv` con `proximidad` y `prueba` y una sección del INFORME.md con quién usó modo prueba, sin GPS o
  avanzó lejos del nodo (sólo informativo). Etiquetas es/gl/en de `proximity_*` en Actividad y Registro de partida.
- Imprimir QRs ya no usa `innerHTML` (el SVG se parsea y se importa como nodo).
- **Proximidad al nodo comprobada en el servidor.** `/api/advance` y la cola offline miran ahora si el jugador estaba
  cerca del nodo (sólo nodos con coordenadas y entrada por GPS), con las muestras de GPS de la evidencia y, en línea,
  la última posición del latido de < 5 min; sin cobertura, sólo con las muestras de la cola. Tolerancia: radio +
  precisión declarada (15-100 m, 50 si no la hay) + 40 m, la de «mapa mudo». **Por defecto sólo anota**: «lejos del
  nodo» como sospecha (con la distancia, sin coordenadas). El **modo prueba** y el **rescate sin GPS** pasan
  siempre y dejan una nota neutra por nodo (`proximity_test_mode`, `proximity_no_gps`) que se ve en el panel, en la
  revisión de tiempos (`nodos_modo_prueba`, `nodos_sin_gps`, `proximidad` por nodo) y en la exportación; no
  penalizan. Interruptor de misión `require_server_proximity` (apagado): rechaza **sólo** un avance con GPS real de
  precisión fiable (≤ 100 m) y lejos, con `reason: too_far_from_node` y un mensaje que el móvil enseña; en la cola
  es un rechazo definitivo con motivo. Ver `runtime/proximidad.py`.
- **Seguridad (revisión OWASP).** Escrituras a la API desde otra web rechazadas por `Origin`/`Referer` (CSRF);
  tope de cuerpo por `Content-Length` (2 MB jugador, 64 MB panel) y ritmo de 600 escrituras/min por IP
  (`security/peticiones.py`). Cookies `Secure` y HSTS también detrás del túnel (`X-Forwarded-Proto` de un proxy de
  confianza o `SAGA_FORCE_HTTPS=1`). Login del panel con **bloqueo progresivo** por IP (10 min, 20, 40… hasta 24 h).
  Fotos de campo, foto de nodo y foto de perfil: sólo **JPEG/PNG/WebP de verdad** (firma + Pillow), nunca SVG ni
  HTML con cabecera de imagen; se guardan y sirven con su tipo real. Los **códigos de respaldo** viajan con hash
  salado en `success.conditions` y sin copias en la config (`PROYECCION_VERSION` 4). Base de desbloqueos en WAL.
- **S1**: `/api/advance` y `/api/events/sync` corren en un hilo (antes `async def` con SQLite dentro), con un
  candado por jugador para que dos avances del mismo no se crucen. **T1**: sin latido en 10 min la presencia es
  `offline` también en el servidor. **T2**: `is_self` de la tabla de equipo sale de la sesión, no de la URL.

- **Panel: barras opacas, menú agrupado y barra de nodos (escritorio y móvil).** Las barras (lateral, de arriba,
  cifras de la ruta, paneles) pasan a fondo casi sólido, legible sobre el mapa. La barra lateral ya no repite
  Añadir/Guardar/Recargar (están arriba) y queda un único menú en cuatro grupos —Seguimiento, Contenido, Jugadores,
  Ajustes— que se usa igual en el móvil (barra inferior con Guardar + los grupos, cada uno abre una hoja con sus
  entradas: antes el móvil sólo llegaba a cuatro paneles). «Novedades» y «Copia de respaldo» pasan a Ajustes. La
  lista de nodos (que a 768 px de alto medía 0 px) es ahora una barra horizontal sobre el mapa: rueda del ratón,
  arrastre con inercia, flechas laterales, barra de desplazamiento visible, dedo con `pan-x` sin mover el mapa,
  «Nodo 3 de 6» y el nodo actual resaltado y centrado (también tras cerrar el editor). Los paneles ya no tapan la
  barra de arriba ni la de nodos, no hacen scroll dentro de otro scroll y respetan la zona segura del iPhone; con el
  teclado de iOS se reutiliza `vistaTrasTeclado.ts`. Táctil ≥44 px. CSS nuevo en `admin/styles/admin-r5.css`.
- **Exportar partida (panel y línea de comandos).** Seguimiento → «Exportar partida» baja un ZIP con
  `resumen.json`, `clasificacion.csv` (posición, desglose nodos + penalizaciones, empates), `nodos_por_jugador.csv`
  (declarado/observado/aplicado), `eventos.jsonl` (Registro de partida por orden de ocurrencia), `cola_eventos.jsonl`,
  `sospechas.csv`, `errores.jsonl`, `auditoria_admin.jsonl`, `desbloqueos.csv`, `fotos.csv` (sólo metadatos),
  `config_mision.json` (sin secretos ni imágenes) e `INFORME.md` con un análisis automático (podio, empates,
  declarado≠observado, sospechas, nodos de atasco, rechazos, errores frecuentes, jugadores con mucha cola sin
  cobertura, cambios del panel). Se genera en un fichero temporal, fila a fila, y se borra al enviarlo; siempre
  `Cache-Control: no-store`. «Anonimizar» cambia nombres por J01, J02… (también dentro de los textos), redondea
  posiciones a ~1 km y quita las fotos. `GET /api/admin/partida/exportar?anonimizar=0|1` con la cookie de admin
  para `curl` (el comando está en el propio INFORME.md, sin contraseña). Ver `runtime/exportar_partida.py`.
- **Registro para analizar: errores y auditoría.** Nuevo `registro_analisis.sqlite3` (tope de filas y de tamaño):
  errores del servidor sin capturar y del móvil (`POST /api/client-errors`: JS, promesas, ErrorBoundary, trozos de
  la app que no cargan y peticiones `/api/` con 5xx o sin respuesta teniendo red; ruta sin consulta, versión de la
  app y resumen del dispositivo, nunca el agente entero ni la IP; 20 por envío y por minuto, 120 por hora, 32 KB) y
  auditoría del panel (quién —huella de la sesión—, qué y cuándo: ajustes, nodos con su 409, acciones sobre
  jugadores, purga, simulación, vestuario, login, exportación). El Registro de partida anota ahora también los
  avances rechazados CON red (código mal, falta objeto, «voy por detrás», sin guardar el código tecleado), el
  dispositivo al abrir sesión y la versión de la app (`client_info`). La purga de datos personales borra también
  estos registros.
- **Panel: valores por defecto de los minijuegos = los del servidor.** El registro y el panel proponían números
  que el servidor no aplica (laberinto 9×9/75 s/3 vidas/360 ms → 11×11/90 s/1 vida/290 ms; circuito 5×5 → 6×6,
  2 errores, 420 ms; Caza-Señales 12 → 25; rumbo 270° → 90°; trampa 6 → 8 rondas; mosaico 2,5 s → 5 s), y se
  esconden campos que nadie lee (relevo: radio/umbral/espera; `difficulty` de pulso, circuito y Caza-Señales).
  Los nodos ya guardados no cambian. Test `tests/test_valores_por_defecto_coherentes.py`.
- **iPhone: la franja de abajo tras escribir la nota de la cámara.** Causa probable: iOS (sobre todo 26) deja el
  visual viewport corrido o ~24 px corto al cerrar el teclado, y en la PWA la ventana entera encoge con el primer
  teclado y no vuelve; lo `fixed` se queda descolocado y asoma el fondo de `html` (verde del tema). Además quitar
  del DOM un campo enfocado no lanza `focusout`. Cambios:
  - `vistaTrasTeclado.ts` ya no repone a 120/450/900 ms: al irse el teclado (salir del campo, campo quitado del
    DOM —con un MutationObserver mientras hay foco—, cierre pedido) VIGILA hasta 2,5 s en cada fotograma y en cada
    `resize`/`scroll` del visual viewport, devuelve la página a (0, 0) (`scrollingElement` incluido) hasta que la
    vista es la normal y, si no vuelve sola, la «sana» una vez (otra maquetación de `#root` + empujón de 1 px).
    Si el visual viewport sigue corrido sin teclado, publica `--saga-vista-top/bottom` para que la raíz cubra lo
    que se ve.
  - Raíz móvil `.saga-raiz-movil` (mobile-shell.css): `fixed` con top/bottom, sin vh; en la PWA de iOS `100lvh`
    (no cambia con el teclado). html/body/#root del jugador a `height: 100%` en vez de `100dvh`.
  - Fondo de html/body del jugador: el casi-negro del tema (`--theme-ink-deep`), no el verde de `--theme-bg`.
  - Cámara: la capa usa la raíz móvil (fuera `--saga-area-alto`); la nota va en una hoja ARRIBA que se abre con
    «Añadir nota» (el teclado no la tapa, así que iOS no desplaza la página) y todos sus cierres (Hecho, Intro,
    tocar fuera, X, guardar, cerrar desde fuera, desmontar) quitan el foco antes de reponer.
  - Modo `?depurar-vista`: recuadro con innerHeight/outerHeight/clientHeight, visualViewport, scrollY, raíz,
    safe-area, standalone y userAgent, registro con hora de focos, cambios y reposiciones, y botón «Copiar».
    Sólo con el parámetro (se recuerda en la pestaña; `=0` lo apaga).
  - Tests: `tests/test_vista_teclado_iphone.py` (+ `tests/js/vista_teclado.cjs`).
- **El tiempo de la clasificación lo decide el servidor.** Decide un premio de verdad, así que ya no vale sólo lo
  que declara el móvil: el tiempo de cada nodo es el MAYOR entre lo declarado y lo que el servidor vio pasar desde
  que el jugador abrió el nodo (`node_opened`) hasta el avance aceptado, con lo observado acotado a 30 min.
  Caminar entre nodos sigue sin contar. Sin cobertura se usa la hora del evento (la del móvil, corregida con
  `client_sent_at_ms`), nunca en el futuro ni antes del avance anterior; una apertura que llega en otra tanda
  recalcula el nodo. Las penalizaciones mínimas del servidor (código a mano 2 min, modo alternativo 1 min) se
  suman siempre. Ver `backend/app/runtime/tiempos_de_nodo.py`.
- **Desempate por la hora de fin.** `finished_at` viaja ya en el estado vivo (tabla de equipo y latido) y, si se
  acabó sin cobertura, es la hora en que pasó, no la de la subida. La clasificación y la pantalla final desempatan
  por ella; se quita la lectura de `score`/`points`, que el servidor no mandaba nunca.
- **Panel «Tiempos».** Por jugador y nodo: declarado, observado, aplicado, penalización, si llegó con red o sin
  ella y las sospechas, para revisar antes de dar el premio.
- **Vestuario desbloqueable (servidor y panel).** Interruptor global en la misión, APAGADO por defecto: con él
  apagado no cambia nada. Encendido: las piezas especiales se ganan jugando con reglas de tipos cerrados (primer
  nodo, un nodo por id, N nodos, minijuegos perfectos, rachas, mitad, final, final sin código de emergencia,
  primera foto, km con GPS real y regalo del organizador). Lo ganado es para siempre (tabla `desbloqueos` con
  clave jugador+pieza: la cola offline no duplica); con sospecha se concede igual (⚠) y en modo prueba no se gana
  nada. `GET /api/desbloqueos/{user}`, `POST /api/personaje` contesta 409 «bloqueado» con una pieza no ganada, y
  el estado viaja en el paquete de la misión para la tienda sin cobertura. Al encender, quien lleve algo que pasa a
  ganarse recibe una pieza libre parecida sin repetir la combinación de nadie y un aviso (sin «legado»). Panel
  «Desbloqueables» (catálogo, reglas con «¿quién lo recibiría?», matriz jugador×pieza, historial) y «Recompensa de
  vestuario» en el editor del nodo. Falta la UI de candados de la tienda y los cofres (fase 5).
- La purga de datos personales se lleva también los metros andados del vestuario.
- **Revisión del motor (05/10).** Arreglos de la revisión de offline, pantallas, configuraciones y bugs
  (informe local `2026-10-05-revision-motor.md`):
  - **Pantalla de carga atascada en «Faltan 1 archivos de la aplicación».** `player-precache.json` se escribía
    antes de que Vite quitase los trozos que sólo llevan CSS (`tienda-*.js`) y apuntaba a un fichero que no
    existe. El plugin corre ahora con `order: 'post'`; un test comprueba que cada fichero de la lista existe.
  - **Una posición de ayer ya no abre nodos.** La última posición guardada se sigue pintando al arrancar, pero
    sólo abren las lecturas de esta sesión de menos de 3 min (`posicionValeParaAbrir`), y el «dentro del radio»
    usa la misma posición que el desbloqueo.
  - **Punto de control:** recibe la posición de la app (con la del modo prueba ya se completa), descuenta el
    mismo margen de precisión que el mapa y lee `require_proximity` de `entry`, donde lo manda el servidor.
  - **Mosaico:** la respuesta de la pregunta final viaja con hash y sal, nunca en claro (proyección v3: los
    móviles vuelven a bajar la misión una vez). `validate_minigame_config` rechaza un mosaico sin solución.
  - **Trampa de palabras y Cargar antena:** el avance de ronda, el éxito y la sobrecarga ya no se deciden dentro
    de actualizadores de estado (React puede llamarlos dos veces: rondas saltadas).
  - **Reto de sonido:** el micrófono se suelta al superarlo y si el permiso llega con la hoja ya cerrada; sus
    dos ajustes (umbral y tiempo sostenido) se pueden tocar en el panel.
  - **Radio de nodo con tope** (1000 m) en el servidor y en el panel.
  - **Sin WebGL:** brújula de respaldo con distancia y rumbo al nodo, que el aviso del mapa ya prometía.
  - **Red de caminos:** si no llega a la primera, se reintenta (15 s, 45 s, 2 min y al volver la red) y avisa.
  - **Compañeros:** sin latido en 10 min salen «sin conexión», y la copia guardada del equipo ya no se renueva
    sola en cada latido fallido.
  - **Fotos:** borrar una foto borra también sus coordenadas y su nota (y las ya borradas se limpian); el zip se
    escribe en disco y no en memoria; el service worker sólo guarda miniatura y foto (no el zip), y las fotos
    borradas o purgadas salen de la caché del móvil.
  - **Servidor:** el proxy de teselas reutiliza un cliente HTTP y lee el disco en un hilo; la red de caminos se
    manda en trozos; `clear_live_position` borra sólo la fila del jugador.
  - **Textos:** guía del nodo en gl/es/en y sin el antiguo «captura la señal»; «Comezar a travesía» y
    «Progreso de Equipo» ya siguen el idioma; «Volver a bajar o mapa» → «Volver a bajar el mapa».
  - **Repositorio:** README reescrito para la 5.48 (arquitectura, offline, avatares privados, arranque, tests,
    despliegue genérico, licencias); fuera `create_release.py`, `RELEASE_NOTES.md` y `walkthrough.md` (v3);
    sin IPs ni rutas personales en `docs/`; `.gitignore` y `.dockerignore` ordenados; `.env.example` dice
    `sqlite`; la guarda de privacidad ignora los ficheros borrados pendientes de commit.
- **Pelo y barba sin dientes ni puntitos.** Las tarjetas de pelo de Mixamo se cortaban con un alfa duro a 0,5: lejos,
  los mechones finos se promediaban con el hueco y desaparecían a trozos (rizos y barba «pixelados»; a la escala del
  mapa, Ch08 se quedaba sin barba y Ch21/Ch26 casi sin pelo). Ahora el alfa de los mips lejanos se reescala, y con
  multimuestreo (el mapa pinta con 4-8 muestras; la tienda y la ficha, con antialias) el borde va por cobertura
  (*alpha to coverage*), afilado a un píxel. Sin multimuestreo, corte duro y opaco. El pelo se pinta en la pasada de
  transparentes pero escribe profundidad, sustituye el color y SUMA su alfa: la cara no se ve a través del borde (lo
  que se arregló en 5.47 sigue arreglado). El recorte bajo los tocados ya no es una escalera: se funde en un píxel.
  Pelo, barba, cejas y pestañas. Rejillas antes/después: `r4_pelo_*`.
- **Ficha del jugador.** Tocar a un compañero en el mapa (en 2D, en 3D o su retrato lejano) abre una hoja abajo con su
  muñeco 3D girando (se gira con el dedo; un solo contexto WebGL más, que se suelta al cerrar), su foto con el aro de
  su equipo (por `/api/player-avatar/`, la misma puerta), «En vivo» / «Hace N min» / «Sin conexión · visto hace…»,
  nodos hechos de N y su tiempo de la clasificación (`total_time_ms`). «Ir a él» deja de seguirte y centra el mapa en
  él; «Saludar» hace el gesto con TU avatar. En un grupo lejano, cada nombre de la lista abre su ficha. Sin
  cobertura enseña lo último que llegó y su muñeco sale de la caché (si no está, su retrato grande). Respeta la muesca
  y la barra de gestos; entra y sale con los tokens de movimiento (280/240 ms). Textos en es, gl y en. Tocarte a ti
  sigue abriendo tu menú de gestos. Antes el nivel y el tiempo de los compañeros se perdían camino del mapa
  (`teamMapPresence`): el popup decía «Nodo 1 · 0:00» de todos.
- **Jugadores juntos: nadie se oculta y nada se queda flotando.** El paso de 3D a retrato es sólo cosa del zoom (16) y
  de la inclinación, igual para todos; antes, al alejar, quien caía detrás de ti pasaba a retrato tapado por tu cuerpo
  y su aro asomaba. Los que caen juntos se abren en corro también en 3D (el mismo desplazamiento en pantalla que su
  retrato, con una línea fina a su punto real), y desde z16 ya no se funden en manchas. Cuerpo, retrato, aro y aura
  cambian en el MISMO fotograma: lo decide el estado de cada punto del mapa (`feature-state`), no datos que van por
  el worker y llegaban fotogramas tarde. Medido con eventos `render` del mapa alejando y acercando por z16: 669
  fotogramas, 4 cambios, 0 desajustes, todos a z15,96-16,03. El aro de un retrato abierto en corro ya no se queda en
  el punto real (era el halo sin jugador), y retrato y aro bajan de 3 m a 1 m sobre el suelo. Quien llega aparece
  creciendo; quien se va se encoge (0,2 s); quien pasa de retrato a 3D no salta. Capturas `r4_juntos_*`.
- **Coroza nueva.** Capas de junco en escalera que se abren hacia abajo, hebras onduladas y canto deshilachado, en
  tonos de junco seco; con holgura en la cintura para que la faja y la calabaza no la atraviesen.
- **Faixa pegada al cuerpo.** Sigue el contorno de la cintura arriba y abajo con 5 mm de holgura (antes 1 cm y un 4 %
  de bombeo: de lado parecía un flotador). Rejillas de combinaciones de espalda, cintura y manos: `r4_combos_*`.
- **Calzado nuevo y en «Ropa».** Zocas rehechas (suela de madera con canto de clavos y empeine de cuero cerrado) y
  zapatillas de monte nuevas (`item:zapatillas`: suela de goma, puntera y talonera, cordones). El calzado sale en la
  pestaña Ropa; la clave de catálogo no cambia (`item:zocas`).
- **Vestuario desbloqueable en la tienda.** Candado en lo que aún no es tuyo, con su pista («Se consigue: …») y una
  barra de progreso; se puede probar pero no guardar («Listo» dice qué quitar), y un 409 por candado ya no se
  confunde con «ese aspecto ya lo tiene otro». «Nuevo» en lo recién ganado hasta que se ve en la tienda. Aviso grande
  de «¡Desbloqueado!» (y de sustituciones) que espera a que el mapa esté libre: sin tienda, ficha, menú ni minijuego
  encima. Sin red, con la última copia del móvil. Con los desbloqueos apagados, ni un candado. El aspecto por
  defecto sólo sale del kit libre. El menú de gestos del mapa enseña con candado los que aún no tienes.
- **Barra de pestañas de la tienda pegada abajo.** La zona segura del iPhone va dentro de cada pestaña (tocable y del
  color de la barra), no como una franja vacía debajo.
- **Mapa.** Créditos con una «i» plegable (Esri, Terrain Tiles) que no tapa nada; al recuperar el contexto WebGL (iOS
  al volver de la cámara) la capa 3D de nodos y avatares se vuelve a montar; los reintentos de la red de caminos
  llegan al mapa; el aviso sin WebGL ya no mezcla castellano y gallego.

## 5.48.0

Tercera revisión de los personajes 3D con el iPhone, la cámara y las fotos del mapa.

- **Jugadores bastante más grandes.** El muñeco 3D mide 80 px a z16, 90 a z17, 101 a z18, 113 a z19 y 126 a z20
  (antes 44/50/58/67/77; ahora entre 64 y 136 px): a z18-z19 mide lo que un nodo. El retrato redondo, la zona
  tocable, el aura y el aro del suelo crecen con la misma curva, así que al pasar de retrato a 3D no hay salto.
  Con 15 jugadores juntos siguen saliendo en 3D sólo los que no se pisan; el resto, en retrato y abiertos en corro.
- **Pies que patinan menos.** Como el muñeco se dibuja más grande, el paso se anima más pausado (mínimo 0,6 m/s y
  la velocidad dividida por la raíz del tamaño), y decidir si anda o está quieto lo marca la velocidad real: ya no
  se queda quieto deslizándose ni da el salto de pose al arrancar.
- **La cámara del iPhone ya no deja la barra verde abajo.** La tarjeta de la cámara medía `94vh`, que en Safari es
  la pantalla SIN sus barras: con el teclado (al escribir la nota) la página quedaba corrida y, al cerrar la cámara
  con la nota todavía enfocada, nadie la volvía a su sitio (en iOS quitar un campo con el foco no avisa de que el
  teclado se fue). Lo verde era el fondo de la página (tema salvia) asomando por debajo. Ahora la cámara se
  dimensiona con el área que de verdad se ve, respeta la zona segura, la tecla «Hecho» cierra el teclado y al
  cerrar la cámara (por la X, al guardar o desde fuera) la pantalla se repone a 120, 450 y 900 ms.
- **Fotos de los jugadores también al alejar el mapa.** En 3D, cuando el zoom lejano pasa a retrato, cada jugador
  (tú también) sale con SU foto de perfil —la que sube el admin— y no con la cara del personaje. Antes la foto sólo
  salía en la vista 2D. Sin foto o sin red, la cara del personaje como siempre.
- **Seis gestos nuevos** del paquete de gestos que ya teníamos y no se usaba: «Por ahí», «Encoger los hombros»,
  «¡Uf!», «Pensar», «Negar» y «Esperar» (doce en total). Ninguno es sentarse, saltar ni bailar, y no hay que copiar
  nada nuevo a las Pis: ya estaban dentro del fichero de animaciones.
- **Siete complementos nuevos, gallegos y de ruta**, hechos por código (sin descargas): monteira con vivo rojo y
  borla, pañuelo de cabeza anudado en la nuca, sueste amarillo de marinero, gorra de ruta, coroza de junco
  (esclavina y faldón de paja), faja roja con flecos y calabaza de peregrino colgada del cinto. Hay un hueco nuevo,
  **Cintura**. Ninguno va en la mano, así que no necesitan agarre de Blender. Cinco conjuntos nuevos
  (Mariñeiro de Catoira, Labrega con coroza, Gaiteiro de monteira, Peregrino con cabaza, De ruta).
  Cada objeto del catálogo lleva un `id` y una `categoria` estables (y un `tema`); no hay nada bloqueado.
- **El pelo ya no atraviesa gorros ni cascos, ni la cabeza el casco.** Cada tocado se encaja en la cabeza de cada
  personaje (se mide su piel y el tocado la envuelve con holgura) y el pelo que quedaría dentro no se pinta; el que
  asoma por debajo del ala (nuca, patillas, coletas) se sigue viendo. El casco ya no deja calvo a nadie.
  Revisado en los diez personajes con los siete tocados.
- **Nunca dos objetos en la misma mano.** Elegir un objeto para una mano ocupada sustituye al anterior (la gaita
  quita el bordón y la cesta; el paraguas, el bordón) y la tarjeta avisa de lo que va a quitar. Al cambiar, el
  objeto nuevo espera a que el anterior se haya guardado. El servidor sigue rechazando el choque al guardar y, al
  leer configuraciones viejas que lo tenían, las sanea (se queda lo de una mano) en vez de descartarlas.
- **Colores bien aplicados en todos.** La sudadera con pantalón corto de Antía es una sola prenda: ahora la parte
  de abajo lleva el color del pantalón. La camisa bajo la americana de Martiño conserva su color. Sin piel teñida.

Arreglos de la auditoría del 04/10 (mochila, avance, fotos y minijuegos):

- **El premio de un minijuego se entrega de verdad.** «¿Entrega algún objeto de regalo al superar el juego?» del
  editor no lo leía nadie (el servidor tiraba `reward_item_*` al normalizar el nodo) y la comprobación de la ruta lo
  daba por entregado: un nodo que lo pidiera dejaba la ruta imposible. Ahora el servidor lo lee del nodo y lo manda
  al móvil (`stage.reward`); el móvil lo mete en la mochila al superar el nodo, con o sin red, y enseña el mensaje
  del organizador; el servidor lo anota al aceptar el avance (`/api/advance` y la cola). Cada entrega lleva una
  clave (`reward:<nodo>`) y la mochila del servidor la cuenta una sola vez aunque llegue por los dos caminos.
- **La mochila no pierde nada por el camino.** Coleccionables, premios y lecturas de QR se entregan una vez por nodo
  o pegatina aunque el avance se reintente. Los eventos de recogida llevan sus unidades (antes, el total: dos
  recogidas de 1 contaban 3). Lo que se fabrica en la mesa de trabajo sube por la cola como gasto y recogida (los
  ingredientes ya no «resucitan»). Con la caché del navegador borrada, la sesión cerrada u otro móvil, el servidor
  devuelve lo recogido sacado de sus eventos. Subir la mochila ya no borra lo que el móvil no menciona. La cola
  numera en el orden en que se pide (la recogida va siempre antes que el avance del nodo que la exige) y, si el
  servidor todavía no ve un objeto que el móvil sí tiene, el nodo no se bloquea: se guarda en local y sube detrás de
  la recogida. Reiniciar a alguien vacía su mochila por eventos; quitarle UN objeto desde el panel ya no tira los
  demás ni sus nodos hechos sin red (marcas `progress_reset_at` e `inventory_reset_at` aparte de `reset_at`).
- **«Dar objeto» del panel.** Da las unidades que entrega el nodo de donde sale el objeto (o las que se pidan),
  conserva las mayúsculas del id, queda como evento (no se pierde cuando el móvil sube su copia) y llega al móvil
  aunque ya tuviera ese objeto. La lista ofrece también los premios de los minijuegos.
- **El validador del panel mira el orden.** Un nodo que pide un objeto que sólo da un nodo POSTERIOR, o más unidades
  de las que dan los anteriores (lo gastado por un requisito ya no cuenta), avisa al guardar. Un coleccionable de
  mapa ya no se cuenta dos veces.
- **Fotos de campo.** Sin GPS la foto ya no se tira: sube sin coordenadas (el servidor usa la última posición en
  vivo) o se guarda en la cola. La subida directa tiene 45 s (no 8) y cada subida de la cola su propio límite, así que
  el candado no se queda cogido. La cola deja de reintentar lo que el servidor no va a aceptar nunca (400/413/429:
  se marca fallida y se avisa al jugador, que puede quitarla del móvil), espera a la sesión renovada ante un 403 y
  reintenta lo demás con espera creciente (15 s… 30 min). Las dos subidas mandan el mismo `client_proof_id`, y en
  el servidor hay un índice único (jugador, `client_id`) con migración que no borra ninguna foto. Una foto sin
  posición conocida contesta 409 (reintentable) en vez de 400.
- **Simón y laberinto: un patrón por jugador.** La semilla de serie era la misma para todos («saga-simon»,
  «saga-maze»). Ahora el servidor da una por nodo y jugador; en el Simón cambia además en cada intento. Sólo una
  semilla escrita a propósito por el organizador fija el patrón para todos.
- **Modo táctil sólo sin sensor, y cuesta un minuto.** En «Carga por pulsos», «Pulso de hierro» y el rumbo (simple y
  doble) el modo táctil/deslizador sólo aparece si el sensor no existe, no manda datos o se deniega el permiso; si se
  usa, +60 s y `modo_alternativo` en la evidencia (el servidor impone el minuto). En la carga por pulsos, al menos
  120 ms entre toques.
- **Desafío de audio configurable.** Umbral de volumen y tiempo SEGUIDO por encima (por defecto 95 y 2,5 s), medido
  con el reloj y no por fotogramas, y llegan por fin a la pantalla: una racha de viento a golpes ya no llena la barra.
- **Relevo de equipo.** «Jugadores necesarios» cuenta a quien juega (2 = él y un compañero; mínimo 2). READMEs de
  teamRelay y sparkRadar al día (los dos están conectados).
- **Rescate del GPS.** Los 45 s sin posición abren el nodo también con el GPS denegado o sin señal (antes sólo con el
  GPS «disponible», que es justo cuando no hacía falta).
- **Avances de la cola por delante del servidor.** Si un nodo hecho sin red llega antes que el anterior, el servidor
  contesta «voy por detrás» y no lo aplica (antes daba por bueno un nodo que nadie había jugado); el móvil lo reenvía.
- **El código de respaldo cuesta siempre 2 minutos.** El servidor impone el mínimo con `manual: true`, por
  `/api/advance` y por la cola; antes bastaba con mandar `penalty_ms: 0`.


Motor de QR: que las pegatinas se generen bien y se lean bien en el móvil, con y sin cobertura.

- **Pegatinas de versión 2 y de 45 mm.** El código sale como mínimo en la versión 2 (25×25 módulos), que trae
  patrón de alineación: con la versión 1 —la que salía con los códigos cortos— jsQR, el lector del iPhone, no leía
  NINGUNA pegatina inclinada 20° o más en el banco; con la 2 lee el 100 % hasta 40°. El lado impreso pasa de 38 a
  45 mm (módulo de ~1,4 mm, el mismo de antes) y la marca «SAGA» sale en negro: en blanco y negro el verde salía gris.
- **Códigos al azar, no deducibles.** El panel proponía `SAGA1:ITEM:<id>:<título del nodo>` (tildes = código más
  denso, y el nombre del sitio legible por cualquiera) y el respaldo `SAGA-01`, `SAGA-02`…, que se adivinaba con el
  número del nodo. Ahora propone `SAGA` + 6 caracteres al azar (sin 0/O/1/I; ~10⁹ combinaciones), y avisa si un
  código existente se puede adivinar, es largo, lleva símbolos o parece llevar datos personales. Los códigos ya
  guardados NO se cambian solos: hay pegatinas impresas con ellos.
- **La hoja de impresión ya no inventa códigos.** Un nodo QR sin código guardado se imprimía con su título como
  código: una pegatina que el servidor no acepta. Ahora no se imprime y se avisa (sólo en pantalla, no en el papel).
- **Lector nuevo, fuera del hilo de la interfaz.** jsQR corre en un worker (va en la precarga: funciona sin red),
  una estrategia por fotograma rotando entre diez (suavizada, a resolución nativa, umbral global y local, contraste
  estirado, recortes completo/central/cerrado, reducida, enfocada e invertida) y el botón 📸 las prueba todas.
  Banco sintético (`frontend/scripts/medir-lectura-qr.mjs`, 12 tomas por caso), lector de antes sobre pegatinas de
  antes → lector nuevo en ~1 s de cámara sobre pegatinas nuevas: inclinada 20-40° 33 → 100 %, poca luz 33/0 → 100 %,
  ruido fuerte 8 → 100 %, impresa sin tóner 0 → 83 %, reflejo parcial 42 → 100 %, total 63 → 91 %. jsQR 1.4
  revienta con `onlyInvert`: se invierte a mano.
- **La cámara se apaga de verdad.** Cerrar el escáner mientras el móvil pedía permiso dejaba la cámara encendida
  detrás del mapa, y dos aperturas seguidas abrían dos cámaras. Ahora cada apertura es una sesión y lo que llega
  tarde se apaga; al cerrar se para cada pista, se suelta el vídeo (en iOS lo retenía) y se para el worker. Al
  volver de otra app la cámara se reabre (iOS la deja congelada) y la pantalla se repone.
- **Si el permiso llegaba antes que el visor, no leía nunca.** Con el permiso ya concedido la cámara contesta en
  milisegundos y el stream se quedaba sin `<video>`. Ahora se espera al visor y se vuelve a enchufar si falta.
- **La pegatina de otro nodo ya no «valida».** Antes cualquier QR que no fuera el del nodo se guardaba como objeto y
  salía «PEGATINA VALIDADA» aunque el nodo no avanzara. Ahora la de otro nodo dice cuál es (o que ya lo superaste),
  un QR que no es de SAGA lo dice, ninguno de los dos guarda nada y la cámara sigue.
- **Mensajes que se ven y que ayudan.** Los avisos del escáner se escribían y no se pintaban en ningún sitio. Ahora
  se ven, y a los 3 s sin leer dicen por qué: falta luz, imagen movida o acércate. Permiso denegado y cámara ocupada
  por otra app tienen su mensaje; el texto que hablaba de «pegatinas con logo» se fue. Linterna, enfoque continuo
  y zoom 2× donde el móvil los ofrece.
- **El estudio de tarjetas del panel lee como el móvil** (mismo worker y ritmo); antes leía la imagen completa en
  cada fotograma sin pausa, y también podía dejar la cámara encendida.
- Pruebas: `tests/test_motor_qr.py` (con `tests/js/lector_qr.mjs`) y la de punta a punta con cámara falsa
  `sim/playwright-bench/escaner_qr.py` (vídeo con `frontend/scripts/video-qr-falso.mjs`): nodo correcto avanza una
  vez, otro nodo no avanza, sin red valida y sincroniza al volver, y la cámara se apaga al cerrar.

## 5.47.0

Revisión de la 5.46.0 con el iPhone del dueño en la mano.

- **Fuera el halo de la cintura.** El aro del equipo y el aura eran símbolos del mapa colocados 3 m por
  encima del suelo; con el zoom cerca (z19) 3 m son más de la mitad del muñeco y el aro le quedaba a la cintura.
  Ahora quien va en 3D no lleva ni aro ni aura de símbolo: su aro de equipo es una pieza dentro de la escena 3D,
  **tumbada en el suelo bajo los pies** (se mide en metros del propio muñeco, así que crece con él). La sombra
  del suelo de los retratos es más suave (el centro oscuro se leía como un halo) y, en la vista 2D y quieto, ya
  no hay suelo bajo el pin (sólo si hay una flecha de rumbo que enseñar).
- **Un poco más grandes (+30 %).** 44 px a z16, 50 a z17, 58 a z18, 67 a z19 y 77 a z20 (antes 34/39/45/52/59;
  mínimo 39, máximo 88; sigue por debajo del nodo, ~92 px). El retrato 2D, el hueco tocable y el aro usan la
  misma curva, así que de retrato a 3D no hay salto.
- **Ya no se ven transparentes.** Ningún material del muñeco es translúcido (se comprobó en el motor); lo que
  daba esa impresión era el aro de símbolo, que quedaba dibujado ENCIMA del cuerpo a la altura de la cintura.
  Además, quien se vio hace poco (`recent`) ya no se pinta al 80 %: sólo se atenúa (al 70 %) al que está sin conexión.
- **Mapa 2D con la foto de cada jugador.** En la vista 2D cada jugador (tú también) se ve con su foto de
  perfil —la que ya tiene en el sistema— dentro del pin, con el aro de su equipo; el popup también la enseña.
  Sin foto, o si no llega, sale la cara de su personaje como antes. En la vista 3D sigue mandando el personaje.
  No hay ninguna dirección pública nueva: la foto se pide al mismo `/api/player-avatar/` de siempre (con su puerta
  de acceso, `Cache-Control: private`) y sólo se acepta esa ruta. Las fotos del grupo se guardan en la **pantalla
  de carga** (parte «App», con barra) y el service worker las sirve sin cobertura; una que falla no deja la carga
  pendiente para siempre (se reintenta a las 6 h).
- **Tienda de ropa.** El lienzo 3D empieza por debajo de la muesca (antes la cabeza podía quedar bajo la barra de
  estado) y el personaje se encuadra en lo que queda. La hoja es compacta: mide lo que mide su contenido (hasta el
  64 % de la pantalla), así que en «Personaje» no hay hueco vacío entre la rejilla y «Listo» y el personaje sale
  más grande; los 10 personajes caben en 2 filas de 5. En «Ropa», las tres paletas (camiseta, pantalón, pelo) son
  filas que se deslizan en horizontal y caben a la vez, sin desplazar la hoja.
- **Girar al personaje con el dedo.** Arrastrar en horizontal sobre el personaje lo gira, con inercia que se
  apaga hasta volver al giro lento de siempre. No interfiere con el scroll de la hoja (el lienzo captura su
  arrastre; el cuerpo de la hoja sigue desplazándose en vertical). Una pista «Desliza para girar» se va sola a los 5 s.
- **Personajes que ya lleva otro jugador.** `GET /api/personaje/{user}` devuelve ahora `en_uso` (`{"Ch01": 2}`):
  cuántos de los DEMÁS llevan cada personaje, sin ids ni nombres. En el selector, un punto con el número marca esos
  personajes; es sólo informativo y no bloquea (lo que no se puede repetir sigue siendo el aspecto entero).
- **iPhone: la pantalla ya vuelve a su sitio al cerrar el teclado.** Nuevo vigilante (`vistaTrasTeclado.ts`): al salir
  de un campo de texto, o cuando el visual viewport vuelve a su altura, si la pantalla se quedó desplazada se
  repone a (0, 0) y se avisa a quien mide (`resize`). La altura del teclado no entra en ningún diseño: la hoja de la
  tienda deja de medirse con `visualViewport` mientras haya teclado, y el marco de la pantalla del jugador en el móvil
  es `fixed; inset: 0` sin `100vw`/`100dvh` añadidos (podían discrepar de la ventana real y dejar una franja abajo).
  No se pudo probar en un iPhone real: ver «Qué no se probó» abajo.
- **Qué no se probó.** Safari/WebKit de verdad (no hay WebKit instalado para Playwright en este equipo): el teclado
  se simuló en Chromium con un `visualViewport` falso que se queda corrido al cerrar, y lo que no se puede saber sin
  el aparato es cuándo termina Safari de animar el teclado (por eso se reintenta a 120, 450 y 900 ms) y si cada
  versión de iOS deja el visual viewport corrido.

## 5.46.0

Revisión de la 5.45.0 con el móvil del dueño en la mano.

- **Dependabot: `brace-expansion` (alerta media) fuera.** `npm audit fix` sólo toca
  `frontend/package-lock.json` (1.1.21 / 5.0.12): `npm audit` da 0 vulnerabilidades y el build sale igual.
- **La tienda de ropa ya no se queda «debajo».** Antes era una capa `inset: 0` (la ventana de diseño, no
  lo que se ve): la barra de navegación de Android, la de direcciones o la pestaña de iOS tapaban «Listo»
  y las pestañas, y arriba el botón de cerrar caía bajo la muesca. Ahora la hoja se mide con el ÁREA
  VISIBLE (`visualViewport`, `areaVisible.ts`, con `100dvh` de repuesto), respeta los márgenes seguros de
  arriba y abajo (el cerrar y la etiqueta bajan de la muesca; las pestañas suben de la barra de gestos, con
  6 px de holgura mínima por si el móvil no declara su barra) y el escenario ya no se come el 40 % + 210 px
  mínimos: `clamp(190px, 36%, 400px)` (31 % en móviles bajos). El cuerpo sigue siendo la única zona que se
  desplaza. Lo mismo para el menú de gestos. Probado a 390×844, 360×800, 412×915, 375×667, apaisado y con
  muesca simulada; en un iPhone SE el cuerpo pasa de 268 a 328 px y caben los diez personajes.
- **Los avatares eran demasiado grandes.** Medían 94 px a z16, 105 a z17, 116 a z18 y 144 a z20 (más que un
  nodo, ~92 px). Ahora el 3D mide **34 px a z16, 39 a z17, 45 a z18, 52 a z19 y 59 a z20** (mínimo 30,
  máximo 84; de z21 en adelante, el tamaño real de 1,75 m si ya es mayor, sin salto) y es el mismo número
  para todas las latitudes (`alturaEnPantallaPx`). El retrato redondo (y el aro del suelo y el aura) usa la
  misma curva: 33 px a z12, 38 a z16, 66 a z20, así que de retrato a 3D no hay salto de tamaño. El 3D recién
  aparecido crece en 0,2 s en vez de aparecer de golpe. El cuerpo conserva el 20 % de los triángulos
  (antes 35 %): a 30-60 px no se nota y cuesta menos.
- **Andar con más naturalidad.**
  - El muñeco se desliza **a ritmo de fixes** (`Deslizador`): dura lo que tarda el siguiente fix (+10 %,
    entre 1 y 8 s, sin pasar de un trote). Antes eran 1,4 s fijos: 5,6 m en 1,4 s eran 4 m/s y luego 2,6 s
    parado. La cámara que te sigue dura lo mismo, así que van a la vez.
  - La **flecha de rumbo del suelo gira suave** (por el lado corto) en vez de saltar.
  - La velocidad de la animación ya no «anda en el sitio»: al llegar al último punto para en <0,8 s (antes
    seguía hasta 3 s), y un móvil quieto con ruido de ±2 m no echa a andar (histéresis 2,2 m para empezar,
    0,8 para seguir).
  - El ciclo del paso se anima a la velocidad que se **ve**, no a la real (`velocidadDePaso`): el muñeco se
    dibuja 2,5-17 veces mayor que una persona y a velocidad real los pies irían 17 veces más deprisa que
    el suelo a z16 (9,8 a z17, 5,6 a z18, 2,5 a z19,5, ya con el tamaño nuevo); con la velocidad de paso
    quedan en 11, 6,3, 3,6 y 1,8 (a z19,5 casi pisa firme). Con el motor (`motor.js` en el banco,
    regenerado): `setSpeed(v, vis)`. A zoom lejano el avatar sigue siendo mucho mayor que una persona: ahí
    se ve un paso lento y legible, no un patinaje exacto.
  - Redibujo de los iconos en 2D más fino de cerca (33 ms desde z18, 50 desde z16,5): a 15 dibujos por
    segundo el icono temblaba ~1 px contra la cámara.
  - Gestos: el mismo gesto mientras suena no se reinicia de golpe, y el ritmo de fotogramas sigue al gesto
    en curso (antes bajaba a los 4 s aunque el clip durara más).
- **Sin modelos no hay bucle.** Si un modelo no estaba en la caché del móvil no contaba como fallo y cada
  fotograma lo volvía a pedir (y a avisar por la consola). Ahora cuenta, y tampoco se reintenta
  sin las animaciones compartidas. Y se reintenta al volver la red y cada 90 s (`olvidarFallos` no se
  llamaba nunca: un fallo al arrancar dejaba al jugador en retratos hasta recargar).
- **Pruebas:** `tests/test_revision_avatares_y_tienda.py` + `tests/js/rev_avatares.cjs` (tamaños,
  deslizamiento, rumbo suave, velocidad de paso, área visible y cableado). Ajustados los tests de 5.45.0
  que fijaban 1,4 s, 46 m y el radio del aura.

---

## 5.45.0

- **Avatares 3D en el mapa (personajes de Mixamo) y tienda de ropa.** Cada jugador se ve como uno
  de los 10 personajes, con sus colores de camiseta, pantalón y pelo y complementos gallegos:
  gaita, bordón, paraguas, cesta (objetos de mano), boina, sombrero, casco, mochilas y zocas.
  Anda, corre o se queda quieto según su velocidad real (desplazamiento neto en 3,5 s, no el
  ruido del GPS), mira hacia donde camina, y el tuyo va siempre encima. Tocándote haces gestos
  (`ge__*`) y festejas los nodos completados. Es un complemento de la capa three.js de los nodos
  (`nodosTresD.ts`): mismo renderizador, escena y objetivo multimuestreado.
- **Motor nuevo (`sim/playwright-bench/harness/mixamo4/`).** Máquina de estados con capas por
  grupos de huesos, giro en el sitio y objetos de mano con clips de agarre **horneados en Blender**
  (`blender/author.py`, uno por personaje y objeto: ya no hay cinemática inversa en el móvil).
  `frontend/scripts/portar-motor-mixamo.mjs` lo porta a `avatares3d/mixamo/motor/` (generado, no se
  edita). Fuera el prototipo procedural (`avatares3d/` antiguo), los bancos viejos (`cc0*`,
  `mixamo`, `avatares3d`), el sacho y la pandeireta (no tienen agarre autorado) y las tablas de ajuste.
- **Se acabaron los muñecos dibujados.** Cuando un jugador no va en 3D (zoom lejano, mapa casi
  cenital, sin WebGL, sin el modelo en el móvil, o porque caería encima de otro cuerpo) se ve su
  **retrato redondo** con el aro del color de su equipo y una punta (`retratoDeMapa.ts`; sin la cara
  sale la inicial). Los grupos siguen agrupándose. Con muchos jugadores en el mismo sitio, los
  retratos se abren en **dos coronas** (16 huecos) y los cuerpos 3D que se pisarían ceden la plaza
  al retrato (`elegirEnTresD` con `solape`); el tuyo nunca cede. Quien eligió uno de los diez
  personajes 2D de la versión 5.44 pasa a su personaje 3D (`MX_DE_LEGACY`, el mismo pase en
  `personajes.py`) y compite con quien elija ese mismo aspecto.
- **Los activos NO van en git** (licencia de Mixamo/Adobe): `assets_privados/avatares/` (ignorada) con
  nombres con huella; en el repo sólo el manifiesto (`manifiesto.json`). El servidor los sirve en
  `/assets/avatares/<nombre>` desde `SAGA_AVATAR_DIR` (por defecto `<app>/avatares`, luego
  `<datos>/avatares`, luego `assets_privados/avatares`); en la Pi se montan con
  `-v /home/odegaard12/saga_avatares:/app/avatares:ro` y se copian con
  `scripts/desplegar_avatares.ps1`. Sin ellos el servidor da 404 y la app sigue con los retratos.
  No hay animaciones de Rokoko ni de Mocap Online.
- **Todo se baja en la pantalla de carga (parte «App»)**, nunca de fondo: 31 ficheros (~12 MB una
  vez) que la barra cuenta aparte («avatares x de 31»). Son opcionales: un 404 no bloquea la carga
  ni se reintenta. Durante la partida el mapa sólo lee de la caché del móvil, y los modelos se
  leen de uno en uno con pausa (diez a la vez dejaban el móvil sin fotogramas).
- **Rendimiento del mapa 3D.** Objetos y complementos con sus piezas fusionadas por material
  (45 → 21 llamadas de dibujo con casco y bastón); el cuerpo en el mapa con 35 % de los triángulos
  (meshopt, mismo esqueleto y texturas; la tienda lo ve entero): 60 000 → 31 000 triángulos por avatar;
  sólo se piden los que están en pantalla; la geometría de objetos se comparte entre avatares.
  Medido en Chromium con GPU, mapa 3D inclinado a zoom 19,3 con 15 jugadores en el mismo sitio:
  sin CPU limitada, mapa quieto 60 fps con y sin avatares, girando 56 (sólo retratos) y 44 (tres cuerpos
  3D + doce retratos) fps; con la CPU 4x más lenta, quieto 38 (sin jugadores) / 34 (retratos) / 24 (tres
  cuerpos) fps y girando 11 / 15 / 10 fps.
- **Tienda de ropa** (`TiendaDeRopa.tsx`): botón redondo de camiseta; sale ANTES de la pantalla de
  carga si aún no tienes avatar. Retratos de los objetos de mano sacados del propio agarre. Se guarda
  en el avatar de siempre: `{ character, parts }` con `mx`, `top`, `pants`, `hair` y un valor por
  hueco (`personajes.py` valida cada parte); la unicidad es el hash de la configuración entera.
- Arreglo: la ficha de los compañeros que traía el latido perdía su `avatar` (`teamMapPresence.ts`),
  así que los demás se veían siempre con el aspecto por defecto.
- Pruebas: `tests/test_avatares_mixamo.py` (catálogo servidor = móvil, manifiesto, servido de
  activos con 404 y rutas peligrosas, nada con licencia en git, motor regenerado).

---

## 5.44.1

- **El selector de personaje sale ANTES de la pantalla de carga.** En la 5.44.0
  se abría solo sobre el mapa, así que se colaba por encima de los permisos. Ahora
  `PlayerApp` pregunta al servidor (2,5 s como mucho, `GET /api/personaje/{user}`)
  si ya elegiste y, si no, enseña el selector a pantalla completa nada más entrar,
  antes de la carga y de los permisos. Quien ya eligió no lo vuelve a ver solo. Se
  puede cambiar después desde Herramientas («Cambiar de personaje») o tocándote en
  el mapa. Sin cobertura en el primer acceso se puede elegir igual (se sube luego)
  y nunca se bloquea la entrada.
- **Dos jugadores no pueden ser el mismo avatar.** El servidor guarda cada avatar
  como configuración (`{"character": ..., "parts": {...}}`, hoy sólo `character`;
  las piezas futuras caben sin tocar el formato) y compara por un hash de su
  forma canónica. `POST /api/personaje` responde 409 con mensaje en castellano si
  otro jugador ya tiene esa configuración; la comprobación y la escritura van en
  el mismo ciclo bloqueado de `update_json`, así que dos móviles eligiendo a la
  vez no pueden ganar los dos. El selector marca como «Ocupado» (y desactiva) lo
  que tienen los demás, sin nombres, y trata el 409 avisando y dejando elegir
  otro. El defecto de quien no ha elegido evita lo ya cogido y los defectos de
  otros. Los duplicados anteriores siguen funcionando: sólo se exige a las
  elecciones nuevas. `personajes.json` lee el formato viejo (el nombre a secas) y
  el nuevo.
- **Zoom extremo en el mapa.** A zoom bajo (< 17) los compañeros se agrupan por
  pantalla (30 px) y no por 120 m fijos: a zoom 11 dos compañeros a 600 m eran dos
  muñecos pegados y apartados de su sitio; ahora son un grupo. El aura de tu GPS
  crece con el avatar en vez de medir 27 px fijos desde zoom 12.

---

## 5.44.0

- **Personajes gallegos en el mapa.** Cada jugador es un muñeco dibujado en el
  propio móvil (explorador/a, vikingo/a, peregrino, bruxa, mariñeira, gaiteiro,
  can y raposo), con el aro del color de su equipo en el suelo y en el mismo estilo
  que los nodos 3D. Se elige en el selector del mapa; el servidor lo guarda en
  `data/personajes.json` (`POST /api/personaje`, con la sesión firmada del propio
  jugador y sólo valores de la lista) y lo devuelve como `character` /
  `character_chosen` en el perfil, el equipo y la configuración. Mientras no
  elige, le toca uno por defecto calculado igual en servidor y móvil (FNV-1a del
  id). Sin cobertura la elección queda pendiente y se reenvía al volver la red.
  Ninguna foto de cara en el mapa ni en el popup: el popup enseña el personaje.
- **Deslizamiento suave y flecha de rumbo.** Tu avatar y los compañeros se
  deslizan entre fixes de GPS (~15 dibujos/s, sólo mientras alguien se mueve), con
  una flecha de rumbo en el suelo que ignora el ruido del GPS. Los saltos de más
  de 150 m no se deslizan.
- **Celebración al completar un nodo (< 2,5 s).** Onda, brillo, chispas e insignia
  sobre el nodo y después vuelo suave al siguiente. Se corta al tocar el mapa,
  respeta «reducir movimiento» (sólo un destello quieto, sin vuelo) y con mapa mudo
  nunca vuela ni descubre la posición secreta.
- **Mapa más bonito.** Luz de relieve multidireccional, cielo y niebla de horizonte,
  y el trazado distingue lo ya andado (verde), el tramo en juego (azul con
  flechas y pulso) y lo pendiente.
- **Un solo sistema de movimiento en las pantallas.** Tokens de duración y curva
  (`--saga-dur-*`, `--saga-curva-*`) y un hook de presencia (`usePresencia`): hojas
  que suben y siguen el dedo para cerrarse, fondo con fundido, avisos que entran y se
  apilan, pantalla de carga que entra con un único fundido, y el minijuego se abre sin
  destello de «Cargando juego…» cuando ya está guardado (esqueleto que sólo se ve
  pasado un momento). Todo con `transform`/`opacity`, sin saltos de maquetación, y
  con `prefers-reduced-motion` sólo hay fundidos. El banco de animaciones suma el
  escenario `transiciones`.
- **Pruebas.** Los guardas de `MapSurfaceGL` apuntan a las nuevas piezas (personajes
  en vez de fotos, volcado por `dibujarMovil`) conservando las garantías: compañeros
  como símbolos WebGL en su posición real, sin marcadores del DOM, tú encima y popup
  oscuro legible. Nuevas: `test_personajes_y_movimiento.py`. Se quitan los
  `@keyframes` duplicados de `mobile-themes.css`.

## 5.43.2

- **La app del jugador ya no se puede ampliar.** Al enfocar «introduce código»
  de Herramientas, iOS Safari ampliaba la página entera: los campos de texto
  tenían 13-15 px y Safari amplía todo lo que baje de 16. Ahora todos los campos
  van a 16 px (en origen y con una regla de respaldo en `mobile-shell.css`), el
  `<meta viewport>` lleva `maximum-scale=1, user-scalable=no` (el panel de admin
  conserva su zoom), el pellizco de página queda apagado (`touch-action` y los
  gestos `gesture*` de Safari) y el mapa mantiene su propio pellizco.
- **Los compañeros, dibujados en el propio mapa como los nodos.** Eran
  marcadores del DOM con un desplazamiento en píxeles que se recalculaba al
  mover el mapa, y al hacer zoom acababan «en otras zonas de Galicia». Ahora son
  una capa de símbolos WebGL (`saga-otros-capa`) con la misma altura, ancla y
  tamaño compuesto que tu avatar: siempre en su posición real, a cualquier zoom.
  Si caen encima de ti o unos de otros se separan en pantalla con `icon-offset`
  (8 huecos), sin tocar sus coordenadas. Tu capa va después: quedas encima.
  Siguen la agrupación con número a zoom bajo y la tarjeta oscura al tocar (ahora
  anclada a la posición real). Fuera el camino de marcadores del DOM.
- **Fotos de campo con más calidad.** Se pide la cámara trasera hasta 4K, se usa
  `ImageCapture.takePhoto()` (foto a resolución completa) cuando el navegador lo
  ofrece, con el fotograma del vídeo como reserva, y se guarda a 2048 px de lado
  mayor, JPEG 0,85 (antes 1600 px, 0,9 sobre un fotograma de ~1080p). Si pasa de
  2,4 MB baja la calidad y luego el tamaño. Sigue reencodificándose en un canvas:
  el EXIF (ubicación, modelo) no viaja. La miniatura sube de 360 px/82 a 720
  px/86 y las antiguas se rehacen solas al pedirlas. El tope del servidor (3 MB)
  y el de 40 Mpx no cambian.

---

## 5.43.1

- **Arreglos tras probar la 5.43.0 en un móvil real.** (1) La pantalla de carga
  se quedaba al 75 % en «Comprobando los otros jugadores de este móvil»: la
  descarga de la misión refrescaba también las misiones de los demás perfiles
  del teléfono, una petición tras otra. Ahora al entrar NO se toca a nadie más;
  sólo «Prepararse» los repasa, con un tope de 8 s y sin lanzar nunca error
  (lo que no llegue se deja para otra vez). (2) El globo de un compañero salía
  blanco con letra clara (el CSS de maplibre-gl carga después del nuestro y
  ganaba): ahora usa las variables del tema y una tarjeta con avatar, nombre,
  estado, nodo, «A 40 m de ti», «Visto hace 2 min» y un botón de cerrar grande.
  (3) Fuera del trazado ya no hay un aro (el del GPS/modo prueba) en tu
  posición: sólo tu marcador y la línea. (4) A cualquier zoom, los compañeros
  que caen encima de tu marcador se apartan en pantalla (medido en píxeles y
  contando que tu avatar flota sobre el suelo). (5) El mapa se abre ya donde
  estás (GPS, modo prueba o última posición) en vez de en el nodo y deslizarse
  después; el modo prueba lanzaba dos animaciones a la vez; y los saltos de zoom
  del calentamiento del mapa ya no se ven aunque el velo de carga se haya ido.
  (6) «Prepararse» dice «Micrófono · No hace falta en esta ruta» cuando ningún
  nodo es un reto de audio (el micrófono sólo se pide ahí, no al entrar).

---

## 5.43.0

- **Arreglos del E2E en navegador de la 5.43.0.** (1) La comprobación del mapa
  guardado usaba `cache.match(..., {ignoreSearch:true})` sobre la caché de
  teselas (~2800 entradas): Chromium recorre toda la caché en cada consulta y la
  «comprobación de 1-2 s» tardaba ~45 s al reabrir sin cambios; ahora se busca la
  URL exacta (las teselas no llevan query) y entra en ~5 s. (2) El vigilante de
  versión, al preparar la página nueva, también refresca las variantes con query
  (`?user=…`) guardadas en la caché del armazón: sin red se servía la primera
  variante (vieja) y salía «Failed to fetch dynamically imported module».

- **Carga inicial más ligera para el jugador (sin cambiar cómo se juega).**
  Antes de ver el mapa el móvil bajaba ~246 KB (gzip) de JavaScript y CSS;
  ahora ~155 KB. El mapa (MapLibre) y el 3D (three.js) siguen bajándose al
  abrir el mapa, pero ya en paquetes propios y estables (`vendor-maplibre`,
  `vendor-three`, `vendor-react`, `vendor-jsqr`): tocar código de la app no
  cambia su hash y no se vuelven a bajar. Cada familia de minijuego, la hoja de
  retos, la clasificación, el visor y la cámara de fotos, la pantalla final, la
  mochila/mesa/herramientas, el lector QR (jsQR, 47 KB) y la pantalla de
  elegir jugador pasan a paquetes que se cargan al usarse. El panel de
  administración (con Leaflet) ya iba aparte y sigue sin llegar nunca al
  móvil del jugador.
- **Todo el juego, guardado antes de salir.** El service worker y la app sólo
  guardaban lo que estaba en el HTML; lo cargado con `import()` (mapa,
  minijuegos, paneles) quedaba en caché únicamente si ya se había usado con
  cobertura. El build escribe ahora `player-precache.json` (servido en
  `/player-precache.json`) con TODOS los paquetes del jugador y ninguno del
  administrador. La pantalla de carga lo baja (parte «App», de 4 en 4,
  reintentando, con su barra) al abrir con cobertura y al pulsar «Prepararse
  antes de saír» — el service worker ya NO lo baja en segundo plano al
  instalarse, ver la entrada de la pantalla de carga—, y la preparación sólo se
  da por lista cuando `verificarPaquetesDelJugador` comprueba en la caché, uno a
  uno, que están todos (si falta alguno, avisa en vez de decir «listo»). Sin red
  se comprueba contra la última copia de la lista. Prueba nueva:
  `tests/test_precache_cubre_los_paquetes_del_jugador.py`.
- **Ficheros gigantes partidos (sin cambios de lógica).** `AdminApp.tsx`
  3 860 → 1 385 líneas (hoja de estilos en `adminStyles*.ts`, funciones y
  tarjetas en `lib/adminHelpers.tsx`); `PlayerApp.tsx` 3 829 → ~3 560
  (`playerAppBase.ts`, `playerAppEstilos.ts`, `components/panelesDiferidos.tsx`);
  `main.py` 2 068 → ~1 430 (cuatro módulos `backend/app/runtime/*_glue.py`
  que leen el estado de `main` como `main.X` en cada llamada, y `main`
  re-exporta los nombres). `apply_synced_player_event` se queda en `main.py`
  a propósito (lo exige `test_os_eventos_viven_en_backend_app.py`).
  `PlayerApp` es un único componente de ~3 200 líneas con estado compartido:
  partirlo más exigiría rediseñar sus hooks y no se ha forzado.
- **El móvil que se apaga solo ya no es «trampa».** El anti-trampas
  (`useAntiTrampas`, `useRegenerarAoOcultar`) contaba +30 s, una «sospecha» y el
  reto reiniciado por CUALQUIER pérdida de visibilidad, también con el
  autobloqueo a los 30 s en pleno laberinto (que se juega inclinando, sin
  tocar) y también con la hoja CERRADA, caminando hacia un nodo con minijuego.
  Ahora sólo cuenta una salida si la hoja del reto está abierta, hay un reto
  delante (no en reglas, «has ganado» ni «has fallado»), el jugador tocó la
  pantalla en los 10 s anteriores, no es la propia app pidiendo un permiso y
  dura al menos 1,5 s. Inclinar el móvil (sensor) no cuenta como tocar. Las
  reglas viven en `hooks/salidasDeLaApp.ts` (sin React, ejecutadas en Node por
  `tests/js/logica_jugador.cjs`); cada juego declara cuándo no hay reto con
  `useSinRetoEnPantalla`. Se sigue detectando el cambio de app y el selector
  de aplicaciones cuando el jugador estaba tocando el móvil.
- **Pantalla siempre encendida mientras se juega (Screen Wake Lock).**
  `hooks/useWakeLock.ts`: un gestor con cuenta (el mapa y la hoja del reto
  piden a la vez), que vuelve a pedirlo al volver a la app, reintenta tras un
  rechazo sin insistir y no hace nada donde no hay soporte. No se usa como
  prueba en el anti-trampas: en iOS 16.4-18.3 con la app instalada acepta la
  petición y el móvil se apaga igual.
- **Los diálogos de permiso de la propia app no cuentan como irse.** El
  laberinto (`DeviceOrientationEvent.requestPermission`) y el reto de audio
  (`getUserMedia`) avisan con `avisarPeticionDePermisoPropia()` antes de pedir.
- **Un reto ganado ya no se queda muerto tras un fallo de envío.** Si
  `onSubmitCode` devuelve `false` (o lanza), la hoja suelta el candado y el
  «Avanzando…» del laberinto, del circuito, del mosaico, de Caza-Señales y del
  punto de control vuelve a ser «Continuar»; para el resto de juegos la hoja
  ofrece «Reintentar» con el mismo tiempo y penalización de cuando se ganó.
- **Mapa más ligero en móviles de gama baja.** Las lecturas `gl.readPixels` de
  diagnóstico de la capa 3D (dos por fotograma) sólo corren con
  `?depurar-mapa` o en `/banco-mapa`; el pulso del trazado, los halos, la
  moneda y la guía se paran mientras algo tapa el mapa (hoja de reto,
  clasificación, mochila, cámara, visor, pantalla final: `useCubreElMapa`); y
  el puente de idioma ya no recorre toda la página en cada mutación: sólo
  revisa el texto, el elemento o el atributo que cambió (el recorrido entero
  queda para el arranque y el cambio de idioma). Se conserva su guarda
  `{source, escrito}` y no se despierta con lo que escribe él mismo.
- **Tiempos del laberinto y de Caza-Señales de todos los intentos.** Mandaban
  el tiempo del ÚLTIMO intento (se reiniciaba en cada «Iniciar»); ahora vale el
  reloj del nodo, que arranca en el primer «Iniciar» y no se reinicia. Simón y
  Pulso de hierro usan un solo `AudioContext` (uno por nota dejaba de sonar a
  mitad de secuencia).
- **Clasificación: el tiempo 0 no gana y los empates no parpadean.**
  `player/components/clasificacion.ts`: en la pantalla final, `total_time_ms`
  0 o ausente va detrás de quien tiene tiempo; en la hoja de clasificación se
  desempata por hora de fin, nombre e id, no por `last_seen` (cambiaba en cada
  latido).
- **Textos del jugador en un solo idioma.** `minigames/core/textos.ts` y
  `components/textosDePantallas.ts` (es, gl, en; `gl` y `en` son del tipo de
  `es`, así que si falta una clave no compila): el aviso de anti-trampas ya no
  mezcla castellano y gallego según el motivo, «CLOSE» de la hoja pasa a
  «CERRAR/PECHAR/CLOSE», Simón (mensajes en gallego dentro de una pantalla en
  castellano), el laberinto, el circuito, el mosaico, el punto de control, el
  reto de movimiento, Pulso de hierro, Caza-Señales (entero en gallego), el
  reto de audio, los avisos del escáner de pegatinas (mezclaban castellano y
  gallego), la clasificación, la pantalla final, «usar el objeto» y las
  ventanas de los compañeros en el mapa. `usePermisos` ofrece además
  `microfono` / `pedirMicrofono` para pedirlo en la preparación (falta que la
  tarjeta «Antes de salir» lo enseñe y que el servidor deje de mandar
  `Permissions-Policy: microphone=()`, que lo bloquea).
  Pruebas nuevas: `tests/test_logica_del_jugador.py` y
  `tests/js/logica_jugador.cjs`.

- **Panel de administración: el guardado de la misión ya no miente, no duplica
  nodos y no borra códigos.** (Caza de fallos A1-A4.) El orden del guardado vive
  ahora en `lib/adminSaveFlow.ts` (una sola función, probada con un servidor
  simulado). Si el servidor guarda pero falla la relectura, los nodos nuevos
  (`local-...`) toman su id guardado EN ESE MOMENTO, así que el segundo «Guardar»
  ya no los duplica. Si no se puede leer lo guardado, no se guarda nada: antes se
  seguía con un payload recortado que borraba `answer` y `rune` (los códigos de
  respaldo) de todos los nodos. El botón de la barra de arriba, el del móvil y
  el aviso de «cambios sin guardar» también pasan por la validación (antes solo
  el lateral); un error de guardado sale como error, con su motivo, y no como
  «✓ Guardado»; editar en el cajón marca «Sin guardar» y el navegador avisa al
  cerrar. Los ajustes se guardan con UNA petición `{config}` (antes tres formas
  distintas: la segunda «triunfaba» sin guardar nada) y se relee y compara lo
  guardado, igual que los jugadores. Las peticiones ya no se repiten quince veces
  con nombres de contraseña distintos.
- **Panel: dos administradores (o una pestaña vieja) ya no se pisan.** (A7.) El
  guardado manda la `stages_revision` con la que se cargaron los nodos; si el
  servidor contesta 409 se avisa en castellano, sin guardar, y se ofrece
  «Descargar mis cambios», «Recargar la misión» o seguir editando.
- **Panel: campos del editor que se «guardaban» y no se guardaban.** (A5.) El
  requisito de mochila (id, nombre, cantidad, consumir) y el código de emergencia
  se escriben ahora donde los lee el servidor (`requirements` manda sobre todo lo
  demás y un `answer` heredado ganaba a `config.success_code`: se reescriben de
  forma coherente y solo los nodos que se tocaron). El código de emergencia ya no
  enseña un `SAGA-NN` inventado que no estaba guardado: enseña el guardado, o vacío
  con la sugerencia aparte. Se quitan dos campos inertes: «Mensaje de éxito»
  (`success_message`) y «Conectar con otro nodo» (`target_node_id`). La
  verificación posterior al guardado también compara requisito y código.
- **Panel: el cajón de edición ya no devuelve coordenadas viejas.** (A6.) Si se
  arrastraba el nodo o se moldeaba el tramo con el cajón abierto, el siguiente
  cambio del cajón devolvía la posición y el moldeado de antes. El cajón toma la
  geometría de la vista viva, y el mapa cambia solo `lat/lon` o `route_*` sobre el
  nodo actual.
- **Panel: avisos antes de tocar la ruta con gente jugando.** (A12, A13.) Al
  reordenar, borrar o insertar un nodo por el que ya han pasado jugadores se
  pide confirmación explícita; al guardar un cambio de orden o de nodos se hace
  primero un ensayo (`dry_run`) y se enseña la lista exacta de jugadores
  afectados con los niveles de ese momento. Poner una fecha de salida futura con
  gente ya en partida pide confirmar, y el panel de Ajustes y el del Registro de
  partida explican que sin fecha de inicio NO se anota el registro ni los rastros
  GPS.
- **Panel: las acciones sobre un jugador ya no dicen «Aplicado».** (A11.) Vaciar
  la mochila, bajar de nivel, reiniciar... dicen «guardado en el servidor; el móvil
  lo aplicará en su próxima conexión». Cada acción tiene su nombre (vaciar la
  mochila salía como «marcar como finalizado») y bajar un nodo pide confirmación.
- **Panel: sesión de administración.** (A15.) Botón «Cerrar sesión». Si la sesión
  caduca (403) en cualquier panel, se vuelve al login guardando antes una copia del
  trabajo sin guardar en `sessionStorage`, que se ofrece recuperar al entrar. Los
  errores de entrada salen en castellano, con los segundos de bloqueo y una cuenta
  atrás. «Recargar» ya no cambia el panel por la pantalla de entrada. Tras cambiar
  la contraseña se entra con la nueva.
- **Panel: borradores de jugadores y ajustes.** (A16, A18.) Recargar la vista, pulsar
  «+1 nodo» o guardar jugadores/ajustes ya no pisa los nodos sin guardar ni los
  borradores. Borrar un jugador o cambiar su ID pide confirmación (su progreso
  queda sin dueño), y los IDs repetidos se avisan en vez de descartarse en
  silencio. Ajustes: centro y zoom vacíos ya no se guardan como `0`, la fecha de
  salida no se borra si no se pudo leer, y el texto de historia (que este panel no
  edita) ya no viaja vacío.
- **Panel: fotos de pista comprimidas.** (A14.) «Cuenta las señales» y «Mapa mudo»
  usan la misma reducción que el mosaico (cuadrado, ≤ 520 000 caracteres) y avisan
  si la foto no cabe. Antes viajaba la foto entera de varios MB y, en «Cuenta las
  señales», el servidor la blanqueaba en silencio pasando de 600 000.
- **Panel: pequeños arreglos.** (A17, A18.) «N pendientes» de Actividad dice
  «200+» cuando la lista está cortada (o el total del servidor si lo manda) y
  ordena por fecha; «Trampa de palabras» ya no rellena con «Pregunta trampa N» y
  avisa si hay menos de 4 preguntas completas; los títulos de nodo y los nombres de
  jugador van escapados en los tooltips del mapa (y en el HTML de impresión de
  QR). Pruebas nuevas: `tests/test_admin_guardado_honesto.py` (con
  `tests/js/admin_frontend.cjs`, que ejecuta la lógica del panel contra un
  servidor simulado).
- **Servidor: latidos sin escribir de más ni bloquear (caza de fallos S1).** Cada
  lectura de SQLite empezaba por «asegurar el esquema» (una escritura con fsync
  más once DDL) y `update_json` reescribía el fichero aunque no cambiase nada:
  un latido con la tabla del equipo hacía 14-15 commits y una reescritura de JSON,
  en el bucle de eventos. Ahora el esquema se crea una vez por fichero y proceso
  (`storage/schema_cache.py`, atento a que el fichero se borre y se recree),
  `update_json`/`save_json` no escriben si el texto resultante es idéntico,
  `verify_admin_session_token` no toca el disco sin cookie ni sin cambios, la racha
  de velocidad y la nota manual miran antes de bloquear, `load_stages` no relee
  `stages.json` cuando los nodos ya están en SQLite y el total de nodos sale de un
  `COUNT(*)` (`count_runtime_stages`). El latido, la tabla del equipo, `/api/game`,
  `/api/state`, `/api/config` y las lecturas del panel se atienden en hilos
  (`def`/`run_in_threadpool`); las rutas que escriben (avance, sincronización,
  guardados del panel) siguen en el bucle. Un latido con `?equipo=1` hace ahora
  como mucho 1-2 escrituras SQLite y ninguna de JSON.
- **Servidor: la cola de posiciones sin cobertura ya no congela nada (S2).**
  Volcar 50 eventos `position_track` tardaba ≈ 80 s con el bucle bloqueado
  (cada muestra abría su conexión, releía la configuración y el «¿ya está
  guardado?» decodificaba todos los eventos del jugador). Todas las muestras de un
  evento van en UNA transacción (`match_log_store.append_entries`), «¿está activo
  el Registro?» se mira una vez por tanda y `client_event_id` es una columna con
  índice `(user, client_event_id)` (las bases viejas la ganan y se rellena al
  abrirlas). Medido: 50 eventos × 60 muestras en ≈ 2,5 s. Prueba:
  `tests/test_a_cola_sen_cobertura_non_conxela_o_servidor.py`.
- **Servidor: la purga «BORRAR» borra de verdad y cuenta lo que borró (S3/A9).**
  Miniaturas (`proofs/thumbs/`), originales en cualquier subcarpeta, retratos
  incrustados en las fichas de jugador, eventos `position_track`, las muestras
  de GPS y la evidencia del resto de eventos (el evento se conserva, su
  `client_event_id` también), las coordenadas de `anti_cheat.json` y, al final,
  checkpoint del WAL + `VACUUM` de las bases SQLite para que los bytes borrados no
  queden dentro del fichero. El informe sale de lo que se quitó (`miniaturas`,
  `avatares`, `eventos_borrados`, `eventos_limpiados`, `sospechas_limpiadas`,
  `sqlite_compactado`) y `ficheros_de_imagen` cuenta todos los niveles. Borrar una
  foto (`DELETE /api/field-proofs/{id}`) borra también su miniatura. Ver
  `runtime/purga_datos.py`.
- **Servidor: el proxy de teselas ya no puede llenar el disco (S4).** `/map-tiles`,
  `/dem-tiles` y `/api/teselas/lote` sólo sirven la zona de la misión (caja de
  nodos + trazado + centro del mapa, con el mismo margen por zoom que el paquete
  offline; 404 fuera, salvo para el panel), la caché tiene tope
  (`SAGA_TILE_CACHE_MAX_MB`, 2048; `SAGA_DEM_CACHE_MAX_MB`, 256; se poda por uso),
  la escritura es atómica (tipo primero, `.tmp` + `os.replace`) y sólo se guarda
  lo que es una imagen no vacía. Ver `runtime/teselas.py`.
- **Servidor: la penalización del organizador ya cuenta (S5/A10).**
  `set_player_progress_level(..., penalty_ms, desde_admin=True)` la guardaba como
  tiempo del nodo y el «borrar tiempos >= nivel» la eliminaba; ahora va a
  `penalties_ms`. «+1 nodo» y «Finalizar» cuestan 5 min
  (`PENALIZACION_SALTAR_NODO_MS`; el `time_limit_ms` del que salía no existe) y
  sólo si de verdad se avanza.
- **Servidor: entradas absurdas dan 400/403, no 500 (S6/S16).** `Infinity`, `NaN`
  y `1e999` se leen como `null` (`runtime/entradas.py`), un cuerpo que no es un
  objeto es un 400, las cookies con tildes se comparan en bytes, `reset_at` con
  basura o `items` que no son una lista ya no abortan `/api/events/sync`
  (`mochila.sanear_mochila`) y `_iso_a_ms` aguanta un año 0001.
- **Servidor: `.lock` huérfanos y errores de escritura (S7).** Al arrancar se
  borran los `.lock` y los temporales viejos (con más de 3 s); en runtime un `.lock`
  con nuestro pid que este proceso no tiene cogido y lleva más de 2 s (el pid se
  repite tras cada reinicio en Docker), o cualquiera de más de 15 s, se recupera; los
  hilos esperan en un cerrojo en
  memoria y no durmiendo sobre el fichero; y el `TimeoutError` se registra
  (`storage_health()`, visible en `react-overview` → `storage`) y sube hasta un 503
  `storage_busy` en vez de tragarse.
- **Servidor: fuerza bruta y CPU (S8).** Los intentos fallidos de login de admin y
  de la clave de misión cuentan por /64 en IPv6, y PBKDF2 (login, cambio de
  contraseña, clave de misión) corre en un hilo.
- **Servidor: el retrato de un jugador tiene puerta (S9).** `/api/player-avatar`
  pasa por la misma puerta que la lista de jugadores de `/api/config` (cookie de
  misión con `MISSION_PASS`, o pase de jugador, o sesión del panel;
  `SAGA_AVATARS_REQUIRE_SESSION=1` exige siempre sesión) y se sirve `private`.
- **Servidor: subida de fotos (S10).** `Image.MAX_IMAGE_PIXELS` = 40 Mpx (además
  se rechaza por cabecera, sin decodificar), tope de bytes antes de leer el
  cuerpo (413), miniatura hecha al subir en un hilo, cuota por jugador
  (`SAGA_MAX_PHOTOS_PER_PLAYER`, 100) y subida idempotente: un reintento con el
  mismo `client_id` (o el mismo contenido) devuelve la foto que ya estaba con
  `duplicate: true`.
- **Servidor: sospecha por tiempo declarado imposible (S11, sólo aviso).** El
  servidor anota cuándo llega cada avance (`last_advance_at_ms`) y, si el
  `time_spent_ms` que declara el móvil no cabe entre el avance anterior y éste
  (holgura de 60 s o el 25 %), deja la sospecha `declared_time_exceeds_observed`.
  No bloquea nada ni cambia cómo se calcula la clasificación.
- **Servidor: Actividad y Registro de partida enseñan lo MÁS RECIENTE (S12/A8).**
  `ORDER BY ... DESC LIMIT n` y luego se reordena; el Registro guarda
  `occurred_at` normalizado (columna con índice) y `desde`/`hasta` filtran por
  cuándo pasó, no por cuándo se subió; «sólo sospechas» se filtra en la consulta;
  al pasar del tope de filas se podan primero las muestras de posición y nunca
  los avances ni las sospechas.
- **Servidor: descargas seguras (S14, S15, A17).** `download_field_proofs` ya
  importa `json`; `Content-Disposition` lleva un `filename` ASCII y un
  `filename*=UTF-8''...` (RFC 5987), así que un nombre con tildes o comillas no da
  500; el CSV del Registro lleva BOM UTF-8 y `;` como separador (Excel en
  castellano lo abre en columnas y con las tildes bien) y sigue escapando las
  fórmulas. **Cambio visible:** ya no empieza por `created_at,`.
- **Servidor: la clave de los pases de jugador es independiente del administrador
  (S18).** Sin `SECRET_KEY` (producción), los pases se firmaban con `sal:hash` de
  la contraseña del administrador: cambiarla cerraba a todos los jugadores. Ahora
  la clave vive en `data/session_key.json`, creada UNA vez con el valor que ya
  estaba en uso (los pases y cookies existentes siguen valiendo) y añadida al
  `.gitignore`.
- **Servidor: contratos con el panel y el jugador.** `stages_revision` (16 hex del
  sha256 del JSON canónico de los nodos) en `react-overview` y en
  `/api/admin/stages` (que ahora devuelve `{status, stages, stages_revision}`);
  `POST /api/admin/save` acepta `stages_revision` (409 `stages_changed` si ya no es
  la actual) y `dry_run: true` (`afectados`: quién cambiaría de nodo, sin
  escribir); `save-config` exige `{"config": {...}}` (400 `missing_config`); la
  ficha de nodo del panel devuelve `required_item_*`, `success_code`,
  `reward_item_*`, `qr_card_*` y demás claves que el normalizador tiraba (política
  `keep_unknown` del registro) y un nodo con `answer` antiguo acepta también
  `config.success_code`; `level_prev`, `restore_node`, quitar/vaciar objetos y una
  reindexación a la baja suben `reset_at` (`inventory_snapshot.reset_at`, ms) para
  que el móvil adopte el estado del servidor; `mission_revision` en `/api/config`
  y `/api/game/{user}`; cada evento de `/api/events/sync` lleva `stage_id` y un
  `motivo` en castellano si no se aplicó; y `client_sent_at_ms` corrige las horas
  del móvil (`stale_before_reset`, orden del Registro) con el desfase respecto al
  reloj del servidor (respuesta: `clock_offset_ms`, `server_time_ms`).
- **Servidor: sesiones y contraseña del administrador (A15).** Cambiar la
  contraseña cierra las demás sesiones abiertas (la propia se conserva) y las
  rutas de exportar, purgar, reiniciar, Registro de partida, eventos, red de
  caminos, etc. respetan `admin_password_change_required` (403).
  Pruebas nuevas de esta tanda: `tests/test_o_latido_non_escribe_de_mais.py`,
  `test_a_purga_borra_de_verdade.py`, `test_o_proxy_de_teselas_ten_limites.py`,
  `test_a_penalizacion_do_organizador_non_se_perde.py`,
  `test_entradas_absurdas_non_dan_500.py`, `test_locks_orfos_e_almacen_ocupado.py`,
  `test_forza_bruta_ipv6_e_pbkdf2.py`, `test_o_retrato_ten_porta.py`,
  `test_a_subida_de_fotos_e_idempotente.py`, `test_listados_devolven_o_mais_recente.py`,
  `test_descargas_seguras.py`, `test_o_reloxo_do_movil_non_manda.py`,
  `test_motivos_de_rexeitamento_e_tempo_declarado.py`,
  `test_a_clave_dos_pases_non_depende_do_admin.py`,
  `test_revision_e_ensaio_do_gardado.py`, `test_gardar_config_e_ficha_do_panel.py`,
  `test_acciones_do_panel_chegan_ao_movil.py`, `test_mission_revision.py` y
  `test_o_cambio_de_contrasinal_e_o_bloqueo_admin.py`.

- **Una sola pantalla de carga que lo baja TODO: App, Misión y Mapa, cada una con su
  barra.** Regla del dueño: «la pantalla de carga era la idea siempre: bajar todo
  offline en ella, no de fondo mientras se jugaba». Al abrir la aplicación con
  cobertura hay UNA comprobación de lo que tiene el móvil frente a lo último
  publicado: (a) la app, si cada paquete de `/player-precache.json` está en la
  caché; (b) la misión, comparando `mission_revision` (contrato 5, de
  `/api/config` y `/api/game/{user}`; sin ella, la huella `stages_rev`) con la del
  paquete guardado, y que el paquete tenga los nodos enteros y la foto del mosaico
  dentro; (c) el mapa, comparando la firma de la RUTA (coordenadas de los nodos y
  del trazado) con la del mapa guardado y mirando unas cuantas teselas de verdad.
  Si algo falta o cambió sale la pantalla de carga y baja SÓLO eso (un nodo movido
  o nuevo pide únicamente las teselas nuevas y la red de caminos otra vez); no se
  entra hasta tenerlo todo, y pasados unos segundos aparece «Entrar igualmente»,
  que avisa de qué no estará listo para jugar sin cobertura. Si un fallo deja algo
  a medias la pantalla se queda, con el error y «Reintentar» (sólo repite lo que
  falló). Si no cambió nada se entra en 1-2 s, sin pantalla y sin una sola descarga
  (3 peticiones). Sin cobertura se entra directo con lo guardado y un aviso dice
  qué está incompleto o es viejo (más de 3 días). Código: `offline/motorDeCarga.ts`
  (el motor, sin red), `offline/cargaCompleta.ts` (las tres partes),
  `offline/revisiones.ts` (las decisiones, puras), `components/PantallaDeCarga.tsx`
  y `components/ProgresoPorPartes.tsx`.
- **«Prepararse» es esa misma pantalla, con los permisos debajo.** Corre la misma
  comprobación y descarga (antes no bajaba el mapa ni la red de caminos y no miraba
  si la ruta había cambiado) y añade: el micrófono (que no se pedía en ningún
  sitio antes de salir; con la guarda anti-trampas de permisos propios),
  `navigator.storage.persist()` con el espacio usado y libre a la vista, la guía de
  «Añadir a pantalla de inicio» en iPhone sin instalar, «Pedir todos los permisos»
  (movimiento primero, que en iOS sólo vale dentro del toque) y la lista final
  App ✓ Misión ✓ Mapa ✓ Permisos ✓ Espacio ✓. Respeta la cola pendiente: quien
  jugó sin cobertura ya no retrocede ni rejuega nodos al bajar la misión (J9), ni
  en el paquete guardado. «Preparar juego offline» de Herramientas abre la misma
  pantalla en vez de tener su propia descarga.
- **Nada baja de fondo mientras se juega.** El service worker se instala con lo
  mínimo (ya no baja los paquetes al instalarse, ni a petición de la app); el
  repaso del mapa «por detrás» al entrar desaparece; las fotos de campo dejan de
  re-bajarse cada 15 s (J11: sólo en la carga y saltándose las ya guardadas); y el
  login ya no calienta los catorce perfiles con las fotos dentro del JSON en cada
  carga (J14): en la pantalla de carga sólo se refrescan los jugadores que ya
  tienen paquete en ESTE móvil, y se devuelve la sesión a quien juega (pedir la
  partida de otro cambia la cookie). Subir eventos y posiciones sigue igual.
- **Cortina de «aún no toca» con la hora del servidor de verdad (J1).** El desfase
  con el reloj del servidor se calculaba una vez y con la hora de pintar: con la
  configuración guardada de hace tres días, a las 12:05 de una salida a las 12:00
  seguía diciendo «2d 23h». Ahora la hora llega con el instante (del móvil) en que
  se recibió (`offline/relojDelServidor.ts`), una más nueva sustituye a la anterior,
  y si la última tiene más de 30 minutos (o el móvil cambió de hora) se usa el
  reloj del móvil. Los textos salen en castellano y gallego. `mission_not_started_yet`
  ya no se pinta como «Código incorrecto para este nodo».
- **«N nodos no aceptados — avisa al organizador» (J3).** Un rechazo definitivo del
  servidor (código que el organizador cambió, objeto que falta) dejaba al móvil
  adelantado y al arrancar volvía atrás sin decir por qué. Ahora se guarda con el
  nodo y el motivo (contrato 6; texto de reserva si el servidor no lo manda), se
  enseña en una lista que se puede descartar y desaparece sola cuando el jugador
  supera ese nodo. Los ecos (`already_advanced`) no cuentan. Y la mochila que sube
  con la cola devuelve lo que los nodos gastaron (`consumed_item`): un objeto
  FORJADO sin cobertura y gastado en un nodo ya no llega al servidor como «falta
  objeto» (rechazo definitivo y nodo perdido).
- **Teselas y espacio (J7, J6).** Sólo se guarda una tesela que sea un éxito con
  imagen: antes un 502 o un 429 del proxy quedaba como tesela buena para siempre
  (se pedía con `no-cors`, sin mirar el estado), y lo mismo en el service worker.
  Los huecos se reintentan en tres vueltas (lote, una a una, otra tras una pausa);
  un 404 se apunta como «no existe» y no deja el mapa incompleto para siempre; el
  resumen guarda `completo`, `faltan` y la firma de la ruta. La red de caminos la
  guarda la propia descarga (dependía de que el service worker estuviera ya al
  mando). Un paquete de la app se rechaza si llega como HTML (la salida de la SPA).
  Los fallos de cuota ya no se tragan: la parte queda en error, con «Sin espacio en
  el móvil», y no se dice «listo». Todas las descargas de la carga tienen límite de
  tiempo.
- **La configuración de respaldo no pisa a la buena (J8).** Si `/api/config` no
  contestaba en 7 s se guardaba encima del paquete una configuración pelada (sin
  fecha de inicio: la cortina desaparecía antes de hora; sin prólogo, tema ni
  idioma). Ahora se sigue con la última buena, y el respaldo se usa para pintar
  pero no se guarda.
- **Reinicio del organizador para el nivel Y la mochila (contrato 4).** Una sola
  función (`aplicarResetDelServidor`) para el arranque, el refresco de fondo y el de
  después de un nodo: obedece `reset_at` (baja el nivel, tira la cola de nodos sin
  subir y los relojes de nodo) y vacía la mochila local anterior a la marca. El
  refresco de fondo no tocaba la mochila; ahora además incorpora los objetos que el
  organizador entrega a mano en plena partida.
- **Una versión nueva no deja al jugador sin app ni le corta un juego (J4, J13).**
  El vigilante de versión borraba todo el armazón (incluida la lista de paquetes) y
  recargaba a ciegas: con la red a medias salía «SAGA offline shell is not cached
  yet». Ahora baja la página nueva y sus paquetes de arranque, comprueba que no
  sean HTML, y SÓLO entonces la guarda y recarga; si algo falla no se cambia nada y
  se reintenta al siguiente arranque. Y la recarga por un service worker nuevo (que
  se disparaba en todos los móviles abiertos a la vez, a mitad de minijuego) espera
  a que la aplicación pase a segundo plano y no haya hoja, reto, cámara ni envío
  abiertos; si no llega ese momento, se aplica en el siguiente arranque
  (`offline/recargaSegura.ts`).
- **Avatares que se refrescan (J15) y `client_sent_at_ms` (contrato 7).** El service
  worker guardaba `/api/player-avatar/` con `ignoreSearch` aunque la versión va en
  `?v=`: una foto cambiada nunca se refrescaba. Y cada llamada a
  `/api/events/sync` (la cola, la mochila suelta y la cola del service worker con la
  app cerrada) lleva la hora del móvil al enviar.
- **Pruebas de comportamiento de la carga offline.** `tests/test_la_carga_completa.py`
  (75 pruebas) ejecuta los módulos TypeScript de verdad (y pinta las pantallas con react-dom/server) con
  `tests/js/carga_completa.cjs`, un navegador de mentira (`entorno_navegador.cjs`:
  localStorage, Cache Storage, IndexedDB, fetch, service worker) y un servidor de
  mentira (`servidor_falso.cjs`): comprueban qué se pide a la red y qué queda en la
  caché en cada caso. Se actualizan las pruebas que fijaban el diseño anterior
  (instalación del service worker que bajaba los paquetes, repaso del mapa de fondo).

## 5.42.0

- **Un solo registro de minijuegos (`shared/game_registry.json`).** Añadir un
  juego tocaba 12-16 ficheros, cada uno con su lista a mano, y el admin
  llegó a tirar en silencio la configuración de juegos nuevos al guardar
  (`rumbo_doble`, `cuenta_senales`, `pulso_hierro`...). Ahora el catálogo, las
  familias de presentación, los tipos soportados, los alias de tipo, el suelo
  del antitrampas, el editor propio y las claves guiadas salen de un JSON que
  leen el servidor y el admin (y la imagen Docker lo lleva en `/app/shared`).
  Añadir un juego pasa a ser: una entrada en el registro + su pantalla + (si
  quiere) su editor + su normalizador. Ver `docs/como-anadir-un-minijuego.md`.
  Mismos ids, misma normalización del servidor y mismo catálogo que antes
  (comprobado con una foto antes/después de cada juego). Único cambio
  intencionado: al guardar, el admin **conserva** las claves de config que no
  conoce (antes las tiraba). Con ello dejan de perderse `required_members`
  (relevo de equipo), `clue_text`/`search_radius_m`/`hot_cold_hint` (mapa
  mudo), los campos de Caza-Señales (`target_hits`...), `expected_code`
  (contraseña manual) y los ajustes propios de Simón Dice. Un resto de otro
  juego de la misma familia (p. ej. `targets` en un nodo que pasó de
  `rumbo_doble` a `bearing_hunt`) se sigue descartando.


- El mapa 3D (MapLibre) es ahora el único mapa del jugador, sea cual sea el `map_engine` de la misión (la clave se sigue leyendo, sin efecto). Se retira `MapSurface.tsx` (Leaflet, ~2 800 líneas); Leaflet queda sólo en el mapa de administración.
- Portado al mapa 3D lo que sólo tenía Leaflet: los compañeros del grupo (con agrupación por cercanía y globo al tocarlos), el aura del GPS / modo prueba, el toque en el mapa para colocarte en modo prueba y el toque sobre el nodo actual.
- Sin WebGL el mapa no se queda en blanco: aparece un aviso en castellano y gallego, la pantalla de carga no se queda esperando y el juego sigue (brújula, lista de nodos, QR y modo prueba, con un botón para colocarte en el nodo).
- Arreglo: el círculo difuso del mapa mudo podía quedarse oculto si los datos llegaban antes de que el estilo montase las capas.
- Pruebas: se retiran las que leían el CSS/JS de Leaflet y se añaden guardas del mapa 3D único, el modo prueba y el aviso sin WebGL.

---

## 5.41.0

- **Sin suelo inventado en Pulso de hierro y Trampa de palabras.** Su tiempo
  mínimo antitrampas multiplicaba por la ventana MÁXIMA del juego (ms por
  toque, segundos por pregunta): todo jugador honesto y rápido salía como
  "más rápido de lo posible", el mismo error que v5.34.0. Quedan en el suelo
  genérico + la mediana + las pruebas de evidencia.

- **Jugar sin cobertura 5 nodos o más, con todo registrado.** La cola de
  eventos ordena por un número de secuencia (no por la hora del móvil, que se
  corrige al volver la red), sube en tandas de 50 (el servidor rechazaba con
  400 colas de más de 100 y se atascaban), recupera los eventos que quedaron
  en «subiendo» si la app se cerró a mitad, lleva la mochila en la misma
  llamada y el servidor reordena los avances por nivel. Sin cobertura conocida
  el nodo se guarda en el móvil sin esperar el corte de 8 s. Los avances de la
  cola ahora aplican penalización, arrancan el reloj de la ruta y lo paran en
  el último nodo (antes sólo lo hacía /api/advance). El service worker ya no
  da por subidos eventos que el servidor no aceptó.
- **El servidor revisa la evidencia** (`runtime/evidencia.py`): cuenta las
  señales (respuestas), trampa de palabras (rondas, fallos, penalización,
  tiempos), pulso de hierro y rumbo doble (rondas/objetivos), QR leído y GPS
  de mapa mudo. Motivos nuevos `evidence_*` en el panel; sólo anotan.
- **Mapa mudo** se completa ahora en el radio REAL, también sin cobertura: el
  servidor manda celdas de 8 m con hash salado, no el punto. Límite: nivel de
  defensa del hash de respuestas. La pista frío/caliente sigue necesitando red.
- **Trampa de palabras**: la explicación viaja cifrada y cada fallo suma una
  ronda extra (máx. 4).
- **Registro de partida**: hora del móvil, retraso, marca sin cobertura,
  nodo/tipo/juego, rechazos, rastro de posiciones sin cobertura; panel por
  jugador y nodo con filtros. La huella de la misión incluye la versión de la
  proyección, así que los móviles bajarán el paquete nuevo.

---

## 5.40.0

- **Familia "Desafío" con los dos retos largos.** Pulso de hierro pasa de
  "Movimiento" a "Desafío", junto a Trampa de palabras. El servidor contaba
  las familias con su propia lista y la tenía distinta a la del admin (Pulso
  de hierro salía en "Movimiento"): ahora coinciden, y
  `test_as_familias_do_servidor_coinciden_co_admin.py` compara las dos listas
  juego a juego. Trampa de palabras sube a 8 rondas por defecto (máx. 12):
  con 6, quien lee rápido la acababa en menos de un minuto.

- **Suite de pruebas más rápida, sin perder cobertura.** Nueva marca `slow`
  (`pytest.ini`) para las 5 pruebas de más de 3 s (banco de simulación y
  fuerza bruta del unlock) y `pytest-xdist` en paralelo por defecto:
  `python -m pytest -q` (~30 s) corre lo rápido y `python -m pytest -q -m ""`
  corre todo (~1,5 min, antes ~3 min en serie). La guarda de privacidad
  (9 s → 1,4 s, filtro previo por subcadena y lista local leída una vez) y
  la prueba de acentos rotos (poda de `node_modules`/`.git`) detectan lo mismo.
  Cómo ejecutar cada modo: README, sección Tests.

- **Seguridad: Pillow 11.3.0 → 12.3.0.** Las 18 alertas de Dependabot (13
  altas) eran todas de Pillow, la librería que procesa las fotos que suben
  los jugadores: escrituras fuera de memoria y "bombas de descompresión"
  con imágenes o fuentes manipuladas. `pip-audit` sobre `requirements.txt`
  y `npm audit` del frontend quedan sin ninguna vulnerabilidad conocida.

- **Nuevo minijuego "Trampa de palabras" (`trampa_palabras`), sexta familia
  técnica nueva `word_trap` / grupo de presentación "Desafío".** Pedido
  explícito del organizador: los minijuegos anteriores eran fáciles y
  demasiado cortos, y esta vez el encargo era "que dure más de 1 minuto".
  A diferencia del resto (20-90 s), reúne varias rondas seguidas (4-8,
  admin-configurable) de preguntas trampa con 4 opciones deliberadamente
  casi idénticas -una palabra cambiada, una negación escondida, un número
  distinto- y un temporizador corto por pregunta (4-30 s,
  admin-configurable) que castiga tanto leer demasiado rápido (te comes el
  truco) como pensar demasiado (se acaba el tiempo). Fallar una ronda o
  agotar el tiempo NUNCA bloquea: suma una penalización de 30 s -mismo
  mecanismo que `cuenta_senales`- y sigue a la ronda siguiente. El
  organizador escribe un BANCO de preguntas mayor que las rondas por
  partida; el servidor elige, por jugador, un subconjunto barajado de forma
  estable (hash de player_id+node_id+ronda) para que no sea memorizable con
  una sola partida ni cambie entre recargas/offline. Igual que
  `cuenta_senales`, el jugador solo recibe SUS rondas asignadas con la
  opción correcta ya sustituida por un hash salado -nunca `correct_index`
  en claro, ver `project_word_trap_for_player` en
  `backend/app/runtime/minigames.py`-. Suelo de anti-trampas derivado del
  propio nodo (`_suelo_trampa_palabras`,
  `backend/app/runtime/anti_cheat.py`: nº de rondas × segundos por pregunta
  reales), igual que `rumbo_doble`/`sequence_code` -nunca un número
  adivinado, ver v5.34.0-; con la configuración por defecto (6 rondas × 12 s)
  ya supera los 72 s. Familia técnica nueva cableada de punta a punta
  -primera desde v5.36-: `frontend/src/player/minigames/core/types.ts`
  (`MinigameFamily`), `family-types.ts`, `resolver.ts`,
  `FamilyRuntimeHost.tsx`, `frontend/src/admin/lib/gameCatalog.ts`
  (`AdminGameId`, catálogo, categoría `quiz`), `familyConfigs.ts`
  (`FamilyId`, default config y normalización -con su propia rama para no
  repetir el bug de `familyConfigs.ts` que clobbereaba `targets`/`questions`
  de `rumbo_doble`/`cuenta_senales`-), `displayFamilies.ts` (familia
  "Desafío"), `guidedEditorUtils.ts`, `backend/app/runtime/core_engine.py`,
  `backend/app/runtime/minigames.py` y `backend/app/routers/admin.py`
  (`family_counts`/`families`/`DISPLAY_FAMILIES`). Editor dedicado
  `frontend/src/admin/components/trampaPalabras/TrampaPalabrasEditor.tsx`
  para gestionar el banco (añadir/quitar/editar cada pregunta, rondas por
  partida y segundos por pregunta), con la guía "Escribe preguntas con
  truco: una opción casi igual a la correcta, una negación escondida, un
  número cambiado." Tests: `tests/test_trampa_palabras.py`.

- **Nuevo minijuego "Pulso de hierro" (`pulso_hierro`), familia
  `motion_challenge` / grupo "Movimiento".** Pedido explícito del
  organizador: los minijuegos anteriores eran fáciles y demasiado cortos.
  Combina DOS entradas/sensores independientes a la vez -algo que ningún
  otro juego del catálogo hace-: una mano sujeta el móvil lo más quieto
  posible (ventana estrecha de varianza del acelerómetro, motionChallenge
  invertido: quietud en vez de sacudida) mientras la otra repite una
  secuencia Simón Dice que crece cada ronda (adaptado de
  sequenceCode/SimonRuntimeScreen.tsx). Perder la quietud en cualquier
  momento reinicia solo la ronda de toques en curso -nunca la partida
  entera-, así que unos pocos reinicios por temblor natural de la mano son
  parte esperada del diseño. Con la configuración por defecto (6 rondas,
  secuencia inicial de 3 pasos +1 por ronda, ventana de 2,6 s por toque) el
  suelo físico de anti-trampas ya supera los 85 s -bastante por encima del
  minuto pedido-, y la partida real (memorización + algún reinicio) dura
  más todavía. Todo admin-configurable con números planos, sin editor
  dedicado (`guidedEditorUtils.ts`): dar de alta un nodo no exige tocar
  ningún componente nuevo de admin. Inmune por construcción al modo
  prueba/spoofing de GPS: no usa posición en absoluto. Suelo de
  anti-trampas derivado del propio nodo (`_suelo_pulso_hierro`,
  `backend/app/runtime/anti_cheat.py`: nº de toques totales × ventana de
  toque real), igual que `rumbo_doble`/`sequence_code` -nunca un número
  adivinado, ver v5.34.0-. Tests: `tests/test_pulso_hierro.py`.

## 5.39.1

- **Fix: el escáner de campo podía registrar la misma pegatina QR dos veces.**
  Revisión completa del motor QR (generación y escaneo): la tarjeta
  compartida (`frontend/src/shared/qrCard.tsx`), la zona de silencio, el
  nivel de corrección de errores, el auto-test de impresión
  (`frontend/scripts/comprobar-qr.mjs`) y la validación con cámara antes de
  descargar en `QrCardStudio.tsx` ya estaban bien -es el trabajo que dejó el
  bug de el monte-. El único fallo real encontrado: `QuickProofPanel.tsx`
  tiene dos caminos que pueden leer la misma pegatina -el análisis continuo
  de fotogramas y el botón "📸 Hacer foto y validar"- y ninguno sabía del
  otro. Pulsar la foto justo cuando el análisis continuo acababa de leer la
  misma pegatina disparaba `saveQrItem` dos veces: objeto duplicado en la
  mochila y, lo que importa, dos llamadas a `onQrValidated` (avance de nodo
  y tiempo de prueba). Se añade un candado compartido (`processingRef`) que
  se cierra al entrar en `saveQrItem`, se reabre al fallar la lectura o el
  guardado, y se reabre también al arrancar una cámara nueva. Test de
  regresión: `tests/test_escaneo_qr_non_dispara_dobre.py`.

## 5.39.0

- **Nuevo juego "Cuenta las señales" (`cuenta_senales`), grupo "Llegar y
  escanear".** Otro `game_id` de `signal_hunt` (no un `type`/family nuevo,
  igual que `team_relay`/`mapa_mudo`/`rumbo_doble`): el jugador tiene que
  estar en el punto real (`entry_mode: gps`, `require_proximity: true`) y
  contar algo que se ve desde ahí -bancos, ventanas, farolas...- y teclear
  el número en un teclado grande, pensado para usarse con una mano y a pleno
  sol. El organizador escribe 2-5 preguntas por nodo al recorrer la ruta
  (texto, respuesta entera, tolerancia ± opcional, foto de pista opcional);
  cada jugador recibe SOLO una, siempre la misma (hash(player_id + node_id),
  estable entre recargas/offline), para que no se puedan pasar la respuesta
  entre ellos.
  - **Protección de la respuesta:** el servidor nunca manda la respuesta en
    claro ni la lista completa de preguntas. `project_cuenta_senales_for_player`
    (`backend/app/runtime/minigames.py`) sustituye la respuesta por un hash
    salado (`salt = node_id:índice_de_pregunta`) justo antes de que el nodo
    salga hacia el jugador; la tolerancia se traduce en varios hashes
    aceptables (uno por valor del rango), porque un hash solo compara
    igualdad exacta. La comprobación corre en el cliente con Web Crypto
    (SubtleCrypto, sin red) porque el juego tiene que funcionar offline y
    ningún minijuego de SAGA revalida su partida en el servidor (el servidor
    solo acepta el aviso de "completado"). Es una defensa deliberadamente
    débil -un entero pequeño se fuerza por fuerza bruta en milisegundos-,
    pensada solo para que la respuesta no se lea a ojo en DevTools o en el
    payload de red.
  - Tras 3 intentos fallidos no se revela nada: se suma una penalización de
    tiempo (30 s, la misma magnitud que el reinicio penalizado del
    anti-trampas) y se deja reintentar sin límite -nunca bloquea el
    progreso-.
  - Anti-trampas: se apoya en el suelo genérico de 2 s + mediana de red, sin
    entrada propia adivinada en `MINIGAME_HARD_FLOOR_MS_BY_GAME` (ver
    v5.34.0).
  - Editor dedicado (`CuentaSenalesEditor.tsx`, como `RumboDobleEditor.tsx`):
    añade/quita preguntas (2-5), con su respuesta, tolerancia y foto de
    pista opcional, reutilizando la subida de foto de nodo ya existente.
  - Tests: `tests/test_cuenta_senales.py`.

## 5.38.0

- **Los nodos nuevos del editor guiado no exigían estar cerca.** El editor
  escribía `requires_proximity` (con s) y la persistencia leía
  `require_proximity`: todo nodo creado desde el editor se guardaba con
  `false`, y el servidor abre la puerta a cualquier distancia en ese caso.
  Los nodos de la misión real no estaban afectados (comprobado: todos con
  proximidad exigida). Test: `test_o_editor_garda_a_proximidade.py`.

- **Nuevo juego "Rumbo doble" (`rumbo_doble`), familia "Orientación".**
  Segundo `game_id` de `bearing_hunt` (no un `type`/family nuevo, igual que
  `team_relay`/`mapa_mudo` dentro de `signal_hunt`): el jugador apunta el
  móvil, uno tras otro, a 2 (admin-configurable 2-3) objetivos reales
  visibles desde el nodo -cada uno con una pista de texto que escribe el
  organizador, p.ej. "la torre de la iglesia", y su propio rumbo- y
  mantiene el lock `hold_ms` en cada uno. Progreso visible (1/2, 2/2).
  Perder el lock de un objetivo solo reinicia SU hold, nunca la secuencia
  entera. `bearing_hunt` de objetivo único sigue exactamente igual -mismos
  campos, mismo runtime- para cualquier nodo existente.
  - Backend: `normalize_minigame_config` (`backend/app/runtime/minigames.py`)
    añade la rama `game_id == "rumbo_doble"` dentro de `bearing_hunt`, con su
    propia lista `targets` (label + bearing_deg, 2-3 elementos, rumbos
    recortados por módulo 360).
  - Anti-trampas: suelo físico propio `_suelo_rumbo_doble`
    (`backend/app/runtime/anti_cheat.py`), derivado del propio nodo (nº de
    objetivos × `hold_ms` reales) igual que el de `sequence_code` -nunca un
    número adivinado, ver el porqué de v5.34.0 en el mismo archivo-.
  - Admin: entrada en `adminGameCatalog` (`gameCatalog.ts`), familia de
    presentación "Orientación" (`displayFamilies.ts`) y editor dedicado
    `RumboDobleEditor.tsx` (lista de objetivos, tolerancia, tiempo de espera).
  - Jugador: `RuntimeScreen.tsx` de `bearingHunt` gana modo secuencia
    (`sequenceMode`/`targetIndex`) reutilizando el mismo motor de brújula;
    textos de progreso/lock en `i18n/index.ts` (en/es/gl).

## 5.37.0

- **Nuevo juego "Mapa mudo" (`mapa_mudo`), familia "Llegar y escanear".** El
  jugador recibe una pista (texto y, si el organizador sube una, foto) y un
  círculo de búsqueda grande (150-400 m, configurable) en vez del punto
  exacto del nodo: el centro del círculo sale de un desplazamiento
  determinista por hash de `node_id` (`fuzzy_search_circle` en
  `backend/app/runtime/mision.py`), no de una posición al azar en cada
  petición, y el punto real siempre queda dentro. Un chip opcional
  frío/templado/caliente (`hot_cold_band_es`) da una pista relativa sin
  números ni distancia. Se completa por GPS dentro del radio de entrada real
  -como un punto de control-, así que su `kind` NO es `minijuego`: el
  anti-trampas de tiempo mínimo no le aplica. Una vez completado, el nodo se
  ve y comporta como un punto de control normal (posición real, sin círculo
  difuso).
- Mapa 3D del jugador (`MapSurfaceGL.tsx`): mientras un nodo "mapa mudo" está
  activo y sin completar, se ocultan su chincheta (2D y 3D), el resplandor
  del nodo en juego, la moneda flotante en 3D y el disco de suelo -las
  únicas pistas visuales son el círculo difuso relleno y su pista/chip en el
  HUD-. También se quita la línea guía y el trazado (`route_via`/
  `route_track`) hacia ese nodo mientras está oculto.
- `PlayerHud.tsx` muestra la tarjeta de pista (texto + foto opcional) y el
  chip frío/templado/caliente cuando el nodo activo es "mapa mudo"; nuevas
  claves de idioma en `frontend/src/i18n/index.ts` (`player.mapaMudo.*`,
  es/gl/en).
- Editor guiado de administración (`AdminGameEditor.tsx`): pista de texto,
  radio de búsqueda (150-400 m) y subida de foto opcional para `mapa_mudo`,
  reutilizando el mismo campo `image_data_url` que el resto de nodos.

## 5.36.0

- **Reagrupa el catálogo de minijuegos del admin en 5 familias claras en
  español** ("Llegar y escanear", "Puzles", "Movimiento", "Orientación",
  "Sonido") en vez de las 5 familias técnicas del runtime, que mezclaban
  motor interno con lo que ve el organizador. Es solo una capa de
  presentación (`frontend/src/admin/lib/displayFamilies.ts`): ningún
  `interaction_type`, `game_id` ni family del runtime del jugador cambia, así
  que las misiones existentes cargan y se juegan exactamente igual. El
  selector de juego del editor guiado (`AdminGameEditor.tsx`) y las tarjetas
  de familia (`FamiliesPanel.tsx`) ahora muestran esas 5 familias; el backend
  (`/api/admin/react-overview`) añade `display_family_counts` y
  `display_families` sin quitar las claves técnicas de siempre.
- **`spark_radar` y `team_relay` dejan de ofrecerse para un nodo nuevo.**
  Ninguno de los dos está probado de punta a punta con jugadores reales -sus
  README (`frontend/src/player/minigames/families/sparkRadar` y
  `.../teamRelay`) los describen como trabajo a medias o prototipo huérfano-,
  así que se marcan `runtimeStatus: 'runtime_partial'` en lugar del
  `'runtime_ready'` optimista que tenían. Un nodo antiguo que ya los use
  sigue abriéndose y editándose con normalidad -con un aviso en el editor-,
  y el organizador puede seguir eligiéndolos a mano con "Mostrar
  experimentales" si quiere probarlos.
- Actualizado `docs/gameplay/minigames-and-physical-interactions-audit.md`
  con la reagrupación y una nota sobre una contradicción encontrada en el
  propio código: `FamilyRuntimeHost.tsx` ya tiene ramas para `spark_radar` y
  `team_relay` que sus README dicen que no existen. Pendiente de que alguien
  lo confirme de punta a punta antes de reabrirlos en el selector.

---

## 5.35.1

- **Corrige inyección de fórmulas (CSV injection) en la exportación del
  Registro de partida.** `/api/admin/match-log/export?formato=csv` escribía
  `user`, `display_name` y `payload` tal cual: un nombre de jugador o un
  texto libre del payload que empezara por `=`, `+`, `-` o `@` se abre como
  fórmula, no como texto, en Excel/Sheets/LibreOffice -el vector clásico de
  CSV injection (OWASP)-. `backend/app/runtime/match_log.py::to_csv` ahora
  antepone una comilla simple a cualquier celda que empiece por uno de esos
  caracteres (o por tabulador/retorno de carro). Revisadas el resto de capas
  del motor antitrampas (cliente, transporte offline, motor de servidor,
  almacenamiento JSON/SQLite y panel de administración): sin más hallazgos
  que corregir.

## 5.35.0

- **Nuevo: Registro de partida.** Bitácora por jugador para revisar después
  de la ruta y detectar trampas: sesión abierta, muestras de posición de
  heartbeat (máx. una cada 30 s, con precisión y origen real/manual),
  nodo abierto, avance/completado (con o sin cobertura), QR, mochila,
  minijuegos, sincronización de la cola offline (cuántos eventos y con
  cuánto retraso) y las sospechas/notas del motor antitrampas. Sólo se
  escribe mientras la misión está PROGRAMADA (`mission_launch_at` puesta) y
  ACTIVA -fuera de esa ventana no se anota nada-. Almacén SQLite propio
  (`data/match_log.sqlite3`, fuera del repo) con tope de tamaño y poda de
  lo más antiguo. Incluido en la purga de "Datos personales". Panel nuevo
  en el admin ("Registro de partida", grupo Seguimiento): línea de tiempo
  filtrable por jugador y fechas, con sospechas resaltadas, y exportación a
  JSON y CSV.

## 5.34.1

- **Corrige el mínimo de tiempo de minijuego (regresión de 5.34.0).** La
  tabla por familia derivaba el umbral de la duración "típica" del catálogo
  del organizador (p.ej. team_relay ≈66 s), pero con datos reales los
  circuitos se completaban en ~17 s y otros minijuegos en ~1 s: flagueaba a
  jugadores honestos. Se sustituye por un suelo único y conservador de 2 s
  (`MIN_PLAUSIBLE_STAGE_MS`), sin mínimos "por duración típica"; sólo
  `sequence_code` conserva un suelo propio, y calculado de un límite físico
  real (nº de pasos de la secuencia del nodo), no de una media. Se añade una
  red de seguridad basada en datos: con 5 o más partidas ya vistas de ese
  minijuego en esta misión, sólo se flaguea si el tiempo está por debajo del
  20 % de la mediana observada, así que un récord rápido pero cercano a
  otros tiempos reales nunca queda marcado. Se quitan las entradas de
  `spark_radar` y `team_relay` (prototipos sin cablear en la ruta real).
  Ningún registro se invalida: sigue siendo FLAG, no bloqueo.

## 5.34.0

- **Motor antitrampas SAGA Engine: posición manual/debug excluida.** Un
  latido con `source: "manual"` (modo prueba, ver `PlayerApp.tsx`
  `handleDebugSetPosition`) ya no puede disparar "velocidad imposible": el
  salto real→manual→real es justo lo que se espera de ese modo. Se anota,
  como mucho una vez por sesión de uso manual, una nota NEUTRA ("usó
  posición manual") separada de las sospechas en el panel.
- **Mínimo de tiempo de minijuego, por familia.** El suelo único de 5 s pasa
  a ser un suelo por `game_id` (≈20-25 % de la duración mínima real de cada
  minijuego, ver `gameCatalog.ts`), nunca por debajo de 5 s. Checkpoint, QR
  y coleccionables siguen exentos, como antes.
- **Rebranding: "Motor antitrampas SAGA Engine".** Un único módulo
  (`backend/app/runtime/anti_cheat.py`) con toda la política y los
  umbrales documentados, y el panel de admin ahora separa sospechas de
  notas neutras (con su recuento por jugador) bajo esa cabecera.
- Doc: se deja explícito que un `blur` sin `hidden` más corto que
  `SALIDA_MINIMA_MS` (1,5 s) -como deslizar el Centro de Control en iOS- no
  penaliza, con el mismo umbral que ya usaba Android.

---

## 5.33.1

- **Antitrampas del servidor, revisado.** Velocidad imposible sólo se mira
  ENTRE NODOS -no en el trayecto de casa al primer nodo, que puede ser en
  coche- y sólo si se sostiene en 2 tramos consecutivos: un salto suelto de
  GPS ya no se flaguea. Se quita del todo "nodo completado lejos de su
  sitio": el GPS en el monte falla demasiado a menudo y acusaba a jugadores
  honestos. El tiempo mínimo de reto sólo se comprueba en minijuegos -no en
  checkpoints, QR ni coleccionables, que no tienen partida que jugar- y sube
  a 5 s.
- **Antitrampas del cliente, más señales.** `useAntiTrampas.ts` distingue
  salir de la app (`visibilitychange`/`pagehide`) de abrir el selector de
  apps sin soltar la pestaña (`blur` sin `hidden`), ignora los avisos de
  permiso que pide la propia app (cámara, movimiento, GPS), y reporta cada
  salida al servidor por la misma cola offline-first de siempre para que
  salga en el panel, en "Sospechas de trampa".

## 5.33.0

- **Antitrampas en el servidor.** Hasta ahora sólo existía en el móvil
  (salir de la app durante un minijuego). Ahora el servidor MARCA, sin
  bloquear nunca a nadie: velocidades imposibles entre posiciones (más de
  40 km/h descontando la precisión del GPS), completar un nodo lejos de
  él, completar un nodo en menos de 1,5 s y eventos sin cobertura con la
  hora en el futuro. Las sospechas se ven en el admin, en Actividad ›
  "Sospechas de trampa". Un jugador honrado con el GPS poco preciso no sale
  marcado (hay test para eso).
- El latido del jugador envía también la precisión del GPS, que es lo que
  permite no castigar a quien tiene mala señal.
- Revisados carga, cobertura, sincronización y clasificación: sin fallos
  nuevos reproducibles.



- **Sincronización sin cobertura que se caía entera.** Si un solo evento de
  la cola traía el tiempo del nodo corrupto (un texto en vez de un número),
  el servidor daba error 500 y NO se sincronizaba ninguno de los hasta 100
  eventos de la tanda, aunque los demás estuvieran bien. Lo mismo al
  avanzar nodo con conexión. Ahora ese tiempo se ignora y el resto sigue.



- **Traducción al gallego del jugador.** Unos 70 textos salían en el idioma
  equivocado: avisos con números dentro (el puente de idioma no podía
  traducirlos), algunos fijos en inglés ("Centered on node.") y otros fijos
  en gallego que veía también quien jugaba en castellano ("Saíches do
  camiño", "Sen cobertura…"). Ahora salen en el idioma de la misión.
- TODO.md: el acceso escalonado ya estaba hecho (lo decía PROGRESS.md).
- Los minijuegos sparkRadar y teamRelay llevan un README: son prototipos
  sin terminar y sin conectar al juego.



- Misión en gallego: el aviso "Activa GPS para obtener una posición…"
  salía en castellano; ya tiene su traducción.



- **Panel "Antes de salir" en un solo idioma.** Mezclaba gallego
  ("Movemento", "Seguir sen iso") y castellano ("Lo denegaste…"). Ahora
  cada texto sale en el idioma de la misión.
- **El aviso de permiso denegado dice qué tocar según el móvil**: en
  iPhone, Ajustes › Safari; en Android, el candado de la barra de
  direcciones › Permisos. Antes decía Safari a todo el mundo.



Admin: funciones del servidor que el panel no usaba.

- **Actividad** (menú "Seguimiento"): el registro de eventos del servidor
  (latidos, QR escaneados, acciones de admin), con filtro por estado y
  "marcar como leído".
- **Datos personales** (en Jugadores): ver cuántas fotos de campo y
  posiciones GPS hay guardadas y borrarlas. La misión, los nodos y el
  progreso no se tocan. Borra datos de personas reales sin vuelta atrás,
  así que hay que escribir BORRAR para confirmarlo.
- Editor de nodos: fuera 120 líneas muertas (pestañas que nunca se
  conectaron, un panel sin usar y una cabecera duplicada oculta).



- **Sin halos en los nodos completados ni en los pendientes.** Su halo de
  color en el suelo "quedaba fatal sobre el terreno". Ahora sólo llevan la
  sombra de contacto, y el único halo es el del nodo que toca: su radio
  real de entrada.



- **Primera carga del mapa mucho más rápida.** El paquete offline (unas
  3.000 teselas) se bajaba tesela a tesela, y cada una tardaba ~0,7 s en ir
  y volver por el túnel de Cloudflare aunque la Pi la sirviera de su disco
  en 60 ms: medido en un móvil nuevo, más de 20 minutos. Ahora se baja por
  lotes de 120 (nueva ruta /api/teselas/lote), tres a la vez; si el
  servidor no sabe dar lotes, se vuelve a la descarga de una en una.
- **Relieve de cerca sin cobertura.** El paquete apenas traía el relieve
  z12 (3 teselas), que es el que usa la forma del terreno: sin cobertura
  el monte de cerca salía plano. Ahora entra el de toda la zona de misión.
- **Relieve menos exagerado (×1,5, era ×2,2).** Con 2,2, cerca de un monte
  la cámara quedaba dentro del relieve y MapLibre le bajaba a la fuerza la
  inclinación y el zoom: saltos al ampliar y centrado descolocado.



- **Las fotos de cada nodo, en un montón al lado de su base.** No se veían
  hasta ampliar mucho (zoom 18) y entonces salían en fila, pequeñas y encima
  del camino. Ahora cada nodo con fotos lleva un montón con la primera y
  cuántas hay, que crece con el nodo y se ve desde lejos; al tocarlo se
  abren todas en grande. Las fotos sueltas por el campo, como antes.



- **Centrado exacto también al volver de "ver la ruta".** Medido con un
  móvil simulado en la ruta real: tras ver la ruta (centro en un alto) y
  volver a ti, el centro del mapa estaba en tus coordenadas pero tú salías
  100 px más abajo, porque MapLibre dejaba la cámara con la altura del
  terreno del sitio anterior. Al acabar cada movimiento se iguala la altura
  del centro con la del terreno.



- **"Centrar en mí" ya centra.** El precalentado de la pantalla de carga
  (pasa por varios zooms y vuelve) seguía moviendo la cámara si la carga se
  quitaba por tope antes de acabar, y al terminar devolvía la cámara a
  donde estaba al empezar: pisaba el centrado y el seguimiento del GPS, y
  al entrar el jugador podía quedar fuera de la pantalla. Ahora se para en
  cuanto tocas el mapa, pides encuadrar o el GPS te sigue, y no restaura
  nada.



Repaso del panel de administración, que estaba abandonado:

- **Menú por grupos**: Misión (Crear, Ajustes) · Contenido (Juegos,
  Objetos) · Personas y pruebas (Jugadores, Simular). "Crear" (el asistente
  de plantillas) sólo existía en el menú del móvil; ahora también en
  escritorio. "Familias" pasa a llamarse "Juegos".
- **Cambio de contraseña**: si el servidor pide cambiarla, el panel ya
  tiene pantalla para hacerlo (antes se quedaba en "Access denied" sin
  salida). Pantalla de acceso en castellano y centrada.
- **Seguridad**: fuera un último intento de carga que mandaba la
  contraseña en la dirección (?password=…) a una ruta que ni existía.
- **Barra de datos de la ruta** (distancia, tiempo, desnivel, PLAY): tapaba
  la fila de botones cuando éstos ocupaban dos líneas y se metía bajo el
  menú. Ahora se coloca debajo, midiendo la barra de verdad.
- Las cinco familias de juego en los recuentos del servidor (contaba tres)
  y sus nombres en castellano (Reto de movimiento, Caza de rumbo, Matriz de
  circuitos, Reto de sonido).



- **Textos que no se actualizaban, en toda la app.** El puente de idioma
  (traduce los textos de la página por detrás de React) guardaba el texto
  de la primera vez y, cuando React lo cambiaba, lo devolvía a aquel: un
  estado, un contador o la etiqueta de un botón que alterna se quedaban
  congelados con el primer valor. Ahora acepta el texto nuevo.
- **Un bucle que no paraba.** El mismo puente reescribía cada texto aunque
  fuera igual, eso volvía a dispararlo y recorría la página entera en cada
  fotograma, siempre. Ahora sólo escribe si cambia: menos trabajo para el
  móvil y más fluidez.



- **Fotos de los nodos, sólo de cerca.** De lejos quedaban apiladas y
  clavadas en el poste del nodo. Ahora no se ven hasta el zoom 18, donde
  salen repartidas bajo el nodo; tocar el nodo de lejos ya no las abre.
  Las fotos en campo abierto siguen viéndose (una por sitio).



- **El nodo en juego marca su radio de entrada real.** Su halo medía lo
  mismo en pantalla a cualquier zoom y de lejos quedaba enorme, más grande
  que el trazado. Ahora es el círculo donde el juego te deja entrar, a su
  tamaño de verdad sobre el mapa: velo suave y un anillo que late en el
  borde, del color del tipo.
- **Fotos juntas de lejos.** Repartidas a cualquier zoom quedaban fatal.
  Ahora se ve una por sitio hasta el zoom 18 y sólo de muy cerca se
  reparten bajo el nodo para poder tocarlas. Tocar la de lejos abre todas.



- **Los nodos ya no "se recargan" más grandes al ampliar.** MapLibre topaba
  el tamaño de cada símbolo en el del zoom siguiente a su tesela: ampliando
  deprisa, el nodo se quedaba quieto hasta que llegaba la tesela y pegaba
  el salto. Ahora el tamaño crece sin escalones (nodos, fotos y jugador),
  con la misma curva.
- **Fotos de los nodos, que se pueden tocar.** Estaban todas en el mismo
  punto, apiladas y debajo del nodo: al ampliar no se separaban. Ahora las
  de cada sitio se reparten en filas bajo la peana del nodo, por encima del
  halo, y al tocar una se abre el visor con todas empezando por esa.
- **La guía por caminos se guarda.** Al volver a abrir la app en el mismo
  sitio sale al instante, sin esperar a que se cargue la red y se calcule.
- **Centrar en mí** encuadra una sola vez: el punto nuevo del GPS ya no
  vuelve a mover el mapa con otro encuadre.



- **El mapa no se vuelve a cargar al desampliar.** Guarda en memoria ocho
  niveles de zoom en vez de cinco, pide 32 teselas a la vez en vez de 16
  (salen de la caché, no de la red) y las enseña sin fundido. La pantalla
  de carga pasa por cada nivel de zoom hacia fuera, no a saltos.
- **Botones de posición.** "Centrar en mí" centra al momento con la
  última posición. Antes pedía el GPS de nuevo cada vez: reiniciaba la
  escucha, avisaba "Solicitando permiso de ubicación…" aunque funcionara y
  no centraba hasta el punto siguiente. Si el punto es viejo, se pide otro
  en silencio. "Ver la ruta" ya no pide GPS: no lo necesita.
- Quieto más de 45 s ya no desapareces del mapa: se te pinta en tu última
  posición de esta sesión. Para abrir nodos sigue haciendo falta un punto
  reciente.



- **Zoom y arrastre más fluidos.** Las animaciones del mapa (pulso del
  trazado, moneda que flota, halo, guía) se pausan mientras el mapa se
  mueve. Cada una cambia el estilo, y con relieve MapLibre repinta
  entonces todas las texturas del terreno: diez veces por segundo en pleno
  pellizco eran tirones.
- **Nodos y fotos que aparecían y desaparecían.** Con cada cambio de
  estilo -diez por segundo, por las animaciones- se volvían a cargar todos
  los datos del mapa: trazado, nodos, fotos y guía se recortaban y
  recolocaban sin parar. Ahora sólo se cargan cuando cambian de verdad.
- La guía late en opacidad con un trazo fijo. Su "trazo que crece"
  cambiaba `line-dasharray` cada 160 ms, y esa propiedad obliga a
  recargar la fuente entera cada vez.



- **Sin saltos al ampliar y desampliar.** La forma del relieve se queda
  en una sola resolución desde el zoom 12: el dato es de ~30 m y los
  niveles 13 y 14 eran ese mismo dato remuestreado, distinto en cada uno;
  con la exageración, al cruzar de zoom el suelo y los nodos saltaban.
  De cerca, además, el relieve sale más suave. El sombreado sigue a z14.
- **Nodos asentados.** El halo y la sombra de cada nodo van tumbados
  sobre el mapa, con su perspectiva real en cualquier punto de la
  pantalla, y los nodos van a 2 m del suelo en vez de 3.
- **Check integrado.** Es una chapa verde en 3D pegada al canto de la
  moneda: gira, flota y se ilumina con ella. Antes era una pegatina plana.



- **La pantalla de carga deja el mapa preparado.** Antes de quitarse
  hornea todos los nodos (salían tarde, al llegar a la zona, y el mapa se
  trababa mientras) y pasa por dos zooms más lejanos y por la ruta entera,
  así que al desampliar ya no se queda en blanco 2-3 segundos.
- Nodos y fotos sin fundido al cambiar de zoom: ya no desaparecen y
  aparecen al desampliar. Las teselas pedidas no se cancelan a mitad del
  pellizco.
- Nodos más grandes a zoom medio (de 15 a 17), sin cambiar el de cerca.
- Halo del suelo más ancho, y el trazado cosido a sus nodos: la línea del
  camino llega hasta el nodo aunque el track se grabara a unos metros.



- Los nodos, un 30 % más grandes, con la peana y el aro de la base más
  anchos.
- Los completados, en gris del todo (poste, cubo, moneda y brillo del
  suelo) y con el check verde más grande. A medio apagar quedaban raros.



- **Los nodos son poképaradas** (boceto A, elegido por Óscar). Base blanca
  con aro, poste, cubo con el icono del tipo y una moneda con el número
  grande que flota subiendo y bajando. Como en Pokémon GO, el color es el
  tipo: verde checkpoint (bandera), azul QR, dorado coleccionable (cofre),
  magenta jugable (mando). El que toca es más grande y brilla; el hecho
  sale apagado con un check verde, como una poképarada visitada. La vista
  2D usa los mismos colores.



- **Los nodos crecen al acercarse.** Con una escala casi fija en píxeles,
  al ampliar parecían cada vez más pequeños frente a las casas y los
  caminos, que sí crecen. Ahora su tamaño sube un 50 % por nivel de zoom.



- El código QR ocupa el cartel entero: la geometría biselada repartía la
  textura por coordenadas del mundo y el código salía diminuto en el
  centro. Ahora va en un plano pegado a la cara.



- **Nodos rediseñados del todo, con objetos reconocibles.** Bandera a
  cuadros ondeando en un poste alto el checkpoint; cartel blanco con un
  código QR de verdad (localizadores, líneas de tiempo, datos) el QR;
  cofre del tesoro abierto, de madera y oro, con luz dentro y destello,
  el coleccionable; mando de juego con cruceta, botones y palancas el
  jugable. Cantos redondeados y biselados. El estado va en el poste, en el
  brillo del suelo y en el cartel del número, que va encima.



- **Cada tipo de nodo tiene su objeto.** Bandera en mástil alto el
  checkpoint; panel cuadrado con un código QR en la cara el QR; gema
  facetada flotando, con destello, el coleccionable; dado con sus puntos
  el minijuego. El color sigue siendo el estado, y el cartel del número
  va encima del objeto. La silueta se distingue de lejos.
- **El servidor clasificaba mal los nodos.** El motor normaliza los tipos
  al cargar (checkpoint pasa a signal_hunt con game_id simple_checkpoint;
  qr_collectible a circuit_matrix con game_id qr_collectible), y la
  clasificación miraba sólo el tipo: en la ruta real los diez salían como
  minijuego o coleccionable. Ahora mira el juego de verdad: un checkpoint,
  dos QR, tres coleccionables (los QR que dejan objeto en el mapa) y cuatro
  jugables.



- **La guía desde lejos ya no tarda un minuto.** Quien ya tenía el mapa
  guardado se saltaba la pantalla de carga, y la red de caminos se bajaba
  entonces por detrás mientras jugaba, dos veces a la vez (la pasada de
  fondo del paquete y el worker de la guía). Ahora el paquete se vuelve a
  comprobar una vez (rápido) y baja la red en la pantalla de carga; la
  pasada de fondo no la toca, y no se baja si ya está guardada.
- **Una forma por tipo de nodo.** Salían todos iguales porque sólo los
  distinguía la chapa pequeña. Bola lisa el checkpoint, dado de veinte
  caras el minijuego, gema el coleccionable, cubo el QR. Sólidos, sin
  partes finas.
- **Los nodos, un 40 % más grandes.** Eran demasiado pequeños para leer
  el número.
- **Fuera el círculo del radio de entrada.** El nodo en juego se marca
  con su propio brillo en el suelo.



- **La guía va por carretera cuando estás lejos.** El servidor guarda
  ahora la clase de cada vía (autovía, primaria, secundaria, terciaria,
  calle, servicio, pista, senda) y el móvil pondera: a menos de 3 km del
  trazado valen las pistas; a partir de 8 km una pista cuesta tres veces y
  media su longitud y una senda cinco, así que desde casa la línea sigue
  la carretera y no "un camino raro por el monte". Hay que reconstruir la
  red de caminos en el panel para que lleve la clase.
- **El trazado y las fotos dejan de aparecer "mucho después".** La red de
  caminos (21 MB) se analizaba en el hilo principal nada más entrar y
  dejaba el mapa congelado unos segundos, además de competir con las
  teselas y las fotos por la conexión. Ahora se descarga en la pantalla
  de carga, como fase propia, y se analiza y se calcula en un worker.
- **Las fotos aparecen y no desaparecen.** Dos causas: el mapa pedía la
  foto ENTERA para una chincheta de 40 px (decenas de megas), y con
  relieve MapLibre esconde un símbolo cuyo anclaje queda por debajo de la
  malla basta del terreno. Ahora hay miniaturas de 360 px hechas en el
  servidor, y las fotos, los nodos y tú vais tres metros por encima del
  suelo.
- **Los nodos 3D son objetos renderizados una vez, no dibujados en vivo.**
  Dentro del lienzo del mapa salían serrados y parpadeaban al girar. Ahora
  la bola se renderiza con three.js una vez, con luz, sombra y brillo, a
  tres veces la resolución y con sobremuestreo, en un lienzo propio con
  antialiasing, y el mapa la coloca como símbolo en el mismo fotograma
  que el terreno. Una bola sobre un mástil se ve igual desde cualquier
  lado, así que no cambia nada al girar.



- **Fuera la peana negra de los nodos.** En cuesta salía medio enterrada
  o flotando por un lado. En el suelo queda sólo el brillo difuminado; la
  forma del tipo sigue en la chapa del cartel.
- **El mástil ya no se transparenta.** Con 10 cm de radio era un píxel a
  la distancia de juego y el suavizado lo dejaba translúcido. Ahora tiene
  22 cm y se ve sólido.
- El suavizado usa todas las muestras que dé el móvil (4 u 8).



- **Fuera el aro dentado alrededor de la bola.** Eran el halo transparente
  y el anillo del nodo en juego: dos superficies finas que en el móvil
  salían como un aro con píxeles y que ningún suavizado arregla del todo.
  La bola queda sola, lisa; el nodo en juego se distingue por el pulso en
  el suelo y por respirar más.



- **Vuelven los nodos con volumen, y sin dientes de sierra.** La escena
  3D se pinta ahora en un objetivo propio con cuatro muestras por píxel y
  se vuelca al lienzo del mapa como una textura ya suavizada: el
  antialiasing es nuestro y el mapa no se entera, así que las fotos no se
  ven afectadas. En 3D, los modelos; en 2D, las bolas horneadas como
  símbolos.



- **Los nodos salen del lienzo 3D.** Dibujarlos con three.js dentro del
  lienzo de MapLibre daba dientes de sierra en el móvil (sin antialiasing
  de contexto, y activarlo rompía las fotos) y temblores al mover. Ahora
  son símbolos del propio mapa con la bola horneada en la imagen, a tres
  veces la resolución de pantalla: luz, sombra, brillo, número, chapa del
  tipo y peana con la forma del tipo. MapLibre los pinta en el mismo
  fotograma que el terreno y a su altura exacta; nítidos a cualquier
  zoom, sin nada que parpadee, en 2D y en 3D. El nodo en juego lleva un
  resplandor que late.



- **Las fotos del mapa dejan de aparecer y desaparecer.** Era el
  antialiasing de contexto de la 5.25.24: con relieve, MapLibre decide qué
  símbolos tapa el terreno leyendo profundidad, y con el lienzo
  multimuestreado eso se rompía. Fuera; en el móvil no se notaba de todos
  modos.
- **Tope de zoom en 19,5.** La foto aérea no tiene más detalle que z19 y
  por encima el mapa estira píxeles: eso era la pixelación al ampliar
  mucho, y no la arregla ningún antialiasing.
- La bola lleva más caras, y la animación va a treinta fotogramas por
  segundo: repintar sin parar hacía parpadear a las fotos.



- **El aro del suelo es un brillo difuminado, no una línea.** Era un
  anillo de geometría que a la distancia de juego medía dos píxeles: se
  veía serrado con o sin antialiasing y temblaba al mover el mapa. Un
  degradado con transparencia no tiene canto que serrar, y en cuesta se
  lee como luz sobre el suelo. El pulso del nodo en juego, igual.
- **Se acaban los saltos al mover el mapa.** La cota del terreno bajo cada
  nodo se consultaba en cada fotograma mientras el mapa se movía, y al
  cambiar de tesela devolvía un valor distinto cada vez: el nodo subía y
  bajaba a tirones. Ahora se toma con el mapa quieto, cada medio segundo.



- **Los nodos 3D se dibujan con antialiasing.** MapLibre crea el contexto
  WebGL sin él, y las bolas, los aros y la peana salían con dientes de
  sierra. Se activa el MSAA del contexto, la opción que MapLibre documenta
  para las capas personalizadas.
- **La animación va al ritmo de la pantalla**, no a veinte fotogramas por
  segundo: la bola flotaba a tirones.
- El cartel del número se pinta a 512 px para verse nítido de cerca.



- **Los nodos son bolas.** Una esfera del color del estado flotando sobre
  un mástil fino, con el número en un cartel redondo delante y la chapa del
  tipo en su esquina; la peana del suelo lleva la forma del tipo y un aro
  de color. Una esfera se ve igual desde cualquier lado: ni se deforma al
  girar ni al acercarse. Más grandes que el monolito, y crecen un poco al
  acercarse en vez de parecer cada vez más pequeñas frente a las casas.
- **El radio de entrada deja de ser una mancha oscura** sobre el terreno:
  relleno al 10 % y borde más fino.
- **El paquete offline guarda lo que el mapa pide de verdad.** Con
  teselas de 256 px el mapa pide un nivel más que el zoom que enseña: al
  desampliar hasta ver todos los nodos pedía z15 en toda la zona y sólo
  estaba el corredor; junto a un nodo pedía z19 y no había nada. Se añaden
  la zona de misión a z15-z16 y el detalle de nodo a z19; el paquete se
  vuelve a comprobar solo.
- **La barra de la pantalla de carga se recoloca con animación** cuando se
  recoge la tarjeta de permisos, en vez de saltar de arriba al medio.



- **Barra de carga: porcentaje sólo cuando descarga de verdad.** La escala
  única repartida entre fases acababa mintiendo ("avanzó 3, 5 % y de golpe
  pasó a 100"). Ahora sólo la descarga de teselas lleva número, y nunca
  retrocede; conectar, calcular y comprobar van con la barra en movimiento
  y sin cifra.
- **Los nodos 3D dejan de cambiar de tamaño al girar.** El tamaño se medía
  por nodo y por fotograma con la perspectiva, así que al girar el mapa
  cada nodo cambiaba de tamaño a su aire: parpadeo. Ahora el tamaño depende
  sólo del zoom, igual para todos, y el cercano se ve mayor que el lejano
  como todo lo demás del mapa.
- La cota del terreno bajo el nodo se toma al instante, sin arrastre: el
  suavizado hacía que el modelo subiera y bajara despacio al hacer zoom.



- **El tamaño del nodo ya no se queda clavado al acercarse.** El factor
  partía del fotograma anterior: un modelo que de lejos medía 600 m tenía
  la punta detrás de la cámara al acercarse, la medida fallaba y se
  quedaba en 600 m con la cámara encima (medido: 618 m a zoom 19,4). Era
  el "se corta" de cerca. Ahora se parte siempre de una sonda de un metro.



- **Los nodos 3D dejan de "buguearse" de cerca y al mover la cámara.** La
  malla del terreno es basta vista de cerca y su superficie queda metros
  por encima o por debajo del suelo real: al respetar su profundidad se
  comía trozos del modelo, y como eso depende del ángulo, los trozos iban
  y venían al mover la cámara. El cuerpo se pinta entero, siempre. La cota
  del terreno se suaviza en unos fotogramas para que el modelo no brinque
  al cambiar de nivel de tesela.
- Las cuatro franjas de luz sueltas, que de cerca flotaban separadas del
  cuerpo, son ahora dos bandas con la misma forma del cuerpo que lo
  abrazan.
- **En 3D no hay chinchetas planas a ningún zoom.** Los modelos menguan de
  lejos y con eso basta.
- **La guía hasta el nodo está desde el principio.** La red de caminos se
  pide al arrancar, no después de pintar el mapa: el juego empezaba sin
  esa línea y aparecía segundos después.
- La barra de carga avanza despacio mientras espera al servidor, en vez
  de quedarse clavada en el 3 % y saltar luego.



- **Vuelven los nodos 3D.** El relevo a la chincheta plana estaba puesto en
  zoom 16,5 y el mapa del jugador vive en 16: no se veía un solo modelo,
  sólo chinchetas dentro de una vista 3D. El relevo baja a 14,5 y el tope
  de 120 m desaparece, que era lo que dejaba el nodo en treinta píxeles.
- **El tamaño se mide en la pantalla, no en el suelo.** Con el mapa
  inclinado, un metro de suelo ocupa muchos más píxeles al pie de la
  pantalla que arriba: por eso un nodo cercano llegaba a taparla entera al
  girar. Ahora se proyectan el pie y la punta del modelo con la matriz del
  mapa y se ajusta el alto real en píxeles.
- **Los permisos vuelven a pedirse antes de salir.** Lo concedido se
  recordaba para siempre, así que la tarjeta no salía nunca y se entraba al
  juego sin que nadie pidiera nada; si el sistema había retirado la cámara,
  se descubría en el monte. Ahora la memoria dura lo que dura la sesión, y
  si el navegador dice que la cámara no está concedida se olvida.
- **La barra de carga, una sola y sin parpadeos.** Cada fase mandaba su
  propia cuenta y entre medias había tramos sin total, que la ponían en
  modo indeterminado. Ahora cada fase ocupa su trozo, el valor no retrocede
  y lo que queda se recorre andando, no de un brinco.
- **La guía deja de pintar una recta mientras carga la red de caminos.**
  Fuera del trazado dibujaba el tramo recto y lo recolocaba al terminar la
  descarga. Mientras no hay red, ese tramo no se pinta.



- Las franjas de color se ven en los cuatro tipos: iban por dentro del
  cuerpo hexagonal del coleccionable, que salía blanco liso y sin estado.
- El coleccionable remata en punta, como la gema de su icono. De lejos la
  silueta distingue más que la forma de la base.



- **Los nodos se meten en el terreno.** El monolito se pintaba siempre por
  delante de todo, también de un monte que estuviera en medio: parecía
  pegado al cristal. Ahora se pinta en dos pasadas: el cuerpo respeta la
  profundidad del relieve y el cartel del número va siempre encima, así
  que un nodo detrás de una loma se sigue sabiendo dónde está.
- **El icono del tipo va dentro del cartel**, como una chapa en la
  esquina del número. Suelto medía 1,2 m pegado al cuerpo y a la
  distancia a la que se juega no se leía.
- La cota del terreno bajo cada nodo se vuelve a medir en cada fotograma
  mientras el mapa se mueve. Con medio segundo de retraso, al girar o al
  ampliar el modelo se quedaba flotando o hundido.



- **Los nodos dejan de crecer al desampliar.** El tamaño en pantalla era
  constante sin tope: a zoom 12 el factor pasaba de 800 y el monolito era
  un pilar de kilómetros atravesando los montes. Ahora el modelo no pasa
  de 120 m en el mundo y por debajo de zoom 16,5 no se pinta: de lejos
  manda la chincheta plana del mapa, de cerca el modelo.
- **Cada clase de nodo tiene su forma.** Los diez nodos de la ruta salían
  iguales porque el servidor los mandaba todos como "minijuego": cinco de
  ellos llevan algo que recoger y eso no llegaba al mapa. Se añade la
  clase `coleccionable` —base hexagonal e icono de gema— junto a las de
  siempre: redonda el checkpoint, cuadrada el QR, triangular el
  minijuego. El coleccionable va antes que el QR: lo que importa es que
  ahí hay algo que recoger, aunque se recoja escaneando.



- Nodos 3D: el cuerpo sale blanco de verdad. Las caras laterales reciben
  mitad cielo y mitad suelo de la luz hemisférica; con el suelo verde
  oscuro quedaban grises. Suelo claro y más luz ambiental.



- **Nodos 3D: se ven el número, el icono y los anillos.** En Mercator la
  y crece hacia el sur; la matriz del modelo tiene determinante negativo
  y three.js pasaba a `frontFace(CW)`, pero la proyección de MapLibre no
  espeja: WebGL descartaba las caras delanteras. Los planos de una sola
  cara (número, icono, anillos del suelo) no se pintaban nunca y de los
  sólidos se veía el interior. Se invierte el índice de caras de cada
  geometría al construir el nodo, sin tocar normales. Además se apaga el
  recorte por frustum de three.js, que con esa matriz descartaba 71 de
  las 102 mallas aunque estuvieran en pantalla.



- Diagnóstico de la capa 3D: `__sagaCapa3D()` en el banco da acceso a la
  escena viva.



- Diagnóstico de la capa 3D: el asa expone la escena viva (solo en el
  banco) para tocar materiales sin redesplegar. Se investiga por qué el
  cartel del número y el anillo del suelo, los únicos con transparencia,
  no aparecen.



- **Nodos 3D: luz y proporciones.** Las luces apuntaban al +y de three.js,
  pero en Mercator el cielo está en +z: el cuerpo blanco salía gris oscuro.
  Ahora la hemisférica y el sol vienen de arriba de verdad. El cuerpo es
  más ancho (0,85 m de radio), el zócalo y el anillo crecen a juego y el
  cartel del número pasa de 1,9 a 3,2 m, para leerse desde cualquier
  distancia (118 px el nodo actual, 92 los demás, 76 los pendientes).



- **Los nodos 3D se ven: tenían tamaño real, no de pantalla.** El
  diagnóstico de 5.25.9 lo dejó claro: se pintaban en el lienzo, en el
  sitio correcto, pero un monolito de 4,6 m mide 2 píxeles a zoom 17
  (0,49 px por metro medidos). Ahora cada nodo se escala cada fotograma
  para medir un tamaño fijo en pantalla (92 px el actual, 70 los demás,
  58 los pendientes), como un pin, y nunca por debajo de su tamaño real.



- Diagnóstico de la capa 3D: framebuffer enlazado al entrar y color del
  píxel del nodo antes y después de pintar, para saber si no se dibuja o
  si se dibuja y algo lo pisa.



- **Los nodos 3D se pintan encima del terreno.** Con la proyección medida
  y correcta seguían sin verse: MapLibre deja puestos su viewport, su
  recorte y el búfer de profundidad del terreno al llamar a la capa. Ahora
  la capa fija el viewport entero, quita el recorte y limpia la
  profundidad antes de pintar. Un señalizador debe verse siempre, también
  detrás de una loma.



- **La altura de los nodos 3D vuelve a ser absoluta.** Medido proyectando a
  mano con la matriz que pasa MapLibre: con la elevación absoluta el nodo
  cae exactamente donde el mapa lo pinta; relativa al objetivo de la
  cámara (5.25.4) se iba fuera de plano. Aquel cambio fue un error; los
  fallos reales eran los dos anteriores (matriz de MapLibre 6 y matriz de
  mundo de three.js), ya corregidos.



- Diagnóstico de la capa 3D: el asa expone también lo último que MapLibre
  pasa a `render()` (matrices y coordenadas de tesela), para averiguar en
  qué sistema de coordenadas espera los modelos.



- Diagnóstico de la capa 3D: el asa de depuración enseña dónde cae el primer
  nodo en el espacio de recorte y en pantalla, para comprobar la
  convención de la matriz sin ver la pantalla.



- **Los nodos 3D estaban en el cielo.** Con relieve, MapLibre expresa las
  alturas de las capas 3D relativas a la altura del terreno bajo el
  objetivo de la cámara, no absolutas. Con la absoluta, un nodo a 892 m se
  dibujaba 892 m por encima del suelo, fuera de plano. Medido en el banco
  (elevación del nodo 892, del objetivo 892, nada en pantalla). Ahora la
  altura es la diferencia.



- **El mapa nunca estaba "idle", y de idle colgaba casi todo.** El pulso del
  trazado (5.18.0) cambia una propiedad del estilo diez veces por segundo,
  así que el mapa no está ocioso nunca: el aviso de "mapa pintado" al velo
  de carga, la carga de la red de caminos y la animación de los nodos 3D
  no se ejecutaban jamás. De ahí la guía recta, el velo esperando su tope
  y los modelos invisibles (se quedaban a cota 0, bajo el monte, porque su
  altura sólo se refresca al animar). Ahora "pintado" es "capas y teselas
  cargadas", preguntado cada cuarto de segundo con tope de ocho.
- Con relieve, un nodo 3D no se pinta hasta conocer la altura del terreno
  bajo él: a cota 0 quedaba enterrado.



- **Los nodos 3D seguían sin verse: estaban en el origen del mundo.** Con
  `matrixAutoUpdate` apagado, three.js no recalcula la matriz de mundo
  aunque cambie `matrix`; había que marcarla. Los monolitos se quedaban en
  lat 85° N, lon -180°, sin un solo error.
- El banco de mapa enseña las estadísticas de la capa 3D (piezas,
  fotogramas pintados, último error) para poder diagnosticarla desde una
  captura.



- **Los nodos 3D no se dibujaban.** MapLibre 6 pasa a la capa un objeto con
  la matriz dentro (`defaultProjectionData.mainMatrix`); se leía "a la
  antigua" y la proyección salía inválida, sin un solo error. Ahora se lee
  de donde está, y el asa de depuración enseña cuántos fotogramas pintó la
  capa y su último error.
- **La guía fuera del trazado volvía a salir recta.** La capa 3D pedía
  repintados sin parar desde el primer fotograma, así que el mapa nunca
  llegaba a "idle", y de idle dependían el aviso de "mapa pintado" y la
  carga de la red de caminos. La animación arranca ahora DESPUÉS del
  primer idle.



- **Nodos 3D de verdad dentro del mapa.** Una capa personalizada de MapLibre
  dibuja con three.js sobre el mismo lienzo, con la matriz de proyección
  del mapa: los modelos viven en metros sobre el relieve y se inclinan, se
  tapan y se escalan con él. Diseño acordado: monolito blanco sobrio; la
  base y la tapa con la forma del tipo (redonda checkpoint, cuadrada QR,
  triangular minijuego); el color es el estado (verde hecho, azul en juego,
  rojo pendiente) en una franja de luz, la tapa y un disco en el suelo; el
  número grande siempre de frente e icono pequeño del tipo. Animación
  mínima: la luz respira; el nodo en juego, un anillo fino girando y un
  pulso en el suelo. En cuesta, el zócalo se hunde 30 cm y muerde la
  ladera en vez de flotar. A ~20 fotogramas por segundo y sólo con la
  pestaña visible, por la batería. En 2D siguen las chinchetas planas.
- El servidor manda siempre `kind` (checkpoint / qr / minijuego) en cada
  nodo: sólo dice qué clase de sitio es, nada del contenido.



- **La barra de carga ya no se queda en 0 % ni en 100 %.** El grafo de
  caminos (21 MB) había entrado en el paquete como "una tesela más": la
  barra cuenta teselas, las 4 000 ya estaban (0 → 100 de golpe) y luego se
  quedaba en 100 % minutos esperando ese único fichero, compitiendo con la
  carga del mapa. Sale del paquete: el mapa lo pide después de pintar y el
  service worker lo guarda al pasar, para el modo sin cobertura.



- La imagen instala `libexpat1`: `pyosmium` la carga en tiempo de ejecución
  y la imagen slim no la trae, así que `import osmium` moría y la red de
  caminos caía a Overpass (bloqueado). Medido en el contenedor.



- **La red de caminos sale del extracto de OpenStreetMap de Galicia, no de
  Overpass.** Overpass es un servicio público y compartido: con zonas
  grandes devolvía 504 y, tras varias peticiones pesadas, bloqueó la IP del
  servidor (406 hasta a su página de estado). Ahora el servidor baja UNA
  vez el extracto de Geofabrik (~250 MB, se queda en `data/osm/` y se
  renueva a los 60 días), lo lee en local con `pyosmium`, recorta los
  caminos del rectángulo de la ruta y construye el grafo. Sin límites, sin
  bloqueos, reproducible. Overpass queda sólo de reserva si el extracto
  no se puede bajar. El panel enseña la fase (descargando, leyendo nodos,
  leyendo caminos, construyendo) y el porcentaje.



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
