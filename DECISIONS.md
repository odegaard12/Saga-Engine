# Decisiones ya tomadas — Saga-Engine

> No se reabren sin evidencia nueva. Si una decisión aquí resulta equivocada,
> se corrige la decisión Y se anota por qué.

## Arquitectura

- **La fuente de verdad del runtime es `saga.sqlite3`**, no `stages.json` ni
  `config.json`. Esos JSON son un espejo que se escribe al guardar; editarlos
  a mano no cambia nada.
- **Compilar el frontend fuera de la Pi** cuando se pueda: la Pi se queda sin
  memoria construyendo. Node 26 disponible en el Windows local, build de 3s.
- **Despliegue por `git bundle`**, nunca `git format-patch` (CRLF lo rompe).
  SSH a las Pis **sólo desde PowerShell** (la clave vive en el agente de
  Windows; Git Bash no lo ve).
- **`.104` titular, `.103` respaldo.** Papeles invertidos respecto a
  MeteoCatoira, que comparte las mismas dos máquinas.

## Diseño

- **Diseño "B": tarjeta sólida, no cristal.** Los translúcidos con degradado
  sobre el mapa daban "barro". Color plano + sombra real.
- **Antes de aceptar cualquier cambio visual, `grep` del selector buscando
  `!important`.** Ha matado estilos en línea cuatro veces (chincheta del mapa,
  radio de la barra superior, las tres superficies del juego, las hojas).
- **`--theme-radius-pill` vale 3px a propósito** en el tema de fuego (esquina
  cortada). No usarlo para caras ni para hojas: existe
  `--theme-radius-avatar: 999px`.
- **`--theme-blur` vale `none` en el tema de fuego.** Cualquier desenfoque que
  deba verse en los tres temas va con valor fijo, no con la variable.
- **Un solo movimiento por elemento, definido en un solo sitio.** Una
  `animation` de fotogramas clave le gana a la propiedad `transform` de al
  lado mientras corre: no se mezclan.
- **Fichas de tiempo compartidas:** `--saga-motion-entra` (260ms),
  `--saga-motion-sale` (220ms), `--saga-motion-curva`. Todo temporizador de
  JavaScript que desmonte algo tiene que llevar el mismo número que su
  transición.
- **Quien monta y desmonta un panel es el panel, nunca quien lo usa.** Un
  `if (!open) return null` por encima de un componente que tiene animación de
  salida la anula: el elemento desaparece antes de poder irse. Ha pasado tres
  veces (SwipeableSheet, FieldPrepPanel, y otra vez la Clasificación desde
  fuera).
- **Un efecto que monta algo visible va durante el render, no en un
  `useEffect`.** Los efectos pasivos corren DESPUÉS de pintar: lo que montan
  llega un fotograma tarde, y ese fotograma es el salto que se ve.
- **Los iconos son SVG en línea**, nunca una fuente de iconos: una aplicación
  que promete "juega sin cobertura" no puede depender de una fuente externa.

## Pruebas

- **Una prueba que miente es peor que no tenerla.** La primera auditoría daba
  falsos positivos buscando el carácter `×` literal; y el i18n reescribe los
  `aria-label` en caliente, así que las pruebas no pueden casar por ellos.
- **Si una prueba salta veinte veces por pantalla, se deja de leer.** Las
  etiquetas en versalitas con espaciado están exentas del aviso de texto
  pequeño.
- **Se mide, no se supone.** Consultar el DOM (estilos calculados, rectángulos,
  qué regla gana) encuentra lo que una captura no: un botón de 0×0, un
  `display:none` puesto por un barrido, un hueco de 16px que nadie escribió.
- **Pasar `python scripts/check_repo_privacy.py` antes de CADA push**: hay una
  prueba que caza nombres reales de jugadores.

## Higiene del repositorio

- **El árbol de trabajo se comparte con otra sesión.** NUNCA `git add -A`:
  siempre `git add <ficheros concretos>` y comprobar con
  `git diff --cached --stat` antes de commitear.
- `frontend/public/opencv.js` (11 MB) no está en git, vive en el disco de la
  Pi. El Dockerfile falla a propósito si falta.

## Animaciones (sesión 16-18/09, 5.1.0 → 5.4.0)

- **Un panel monta/desmonta cuando `onTransitionEnd`/`onAnimationEnd` lo
  dice, nunca un `setTimeout` con la misma duración que su transición.**
  Esa carrera la gana siempre el timer -la transición arranca un fotograma
  después del cambio de estado-, así que un timer "exacto" corta el
  movimiento antes de que se vea. El timer se queda solo como red de
  seguridad, bastante más largo que la animación real (700ms+ para una
  transición de 260ms).
- **Medir animaciones con eventos del navegador, no contando fotogramas.**
  `requestAnimationFrame` en Chromium sin ventana va irregular y una prueba
  que cuenta fotogramas intermedios puede dar 7, 6 y 0 para el MISMO código
  sin tocar. `transitionend`/`animationend` con su `elapsedTime` no dependen
  de que nadie mire: si no hay evento, no hubo movimiento.
- **Un fundido a negro real necesita una capa negra que se SOSTENGA**, no
  solo un crossfade de opacidad entre dos capas — un crossfade dejaba
  asomar lo de abajo en cuanto la opacidad bajaba un poco, que se lee como
  un cruce, no como un fundido.
- **Los permisos (movimiento/cámara/mapa) se piden DENTRO de la pantalla de
  carga**, no después de que se funda: si se piden después, hay una ventana
  con el mapa en blanco y "antes de salir" apareciendo con retraso.

## Maquetación de las hojas (SwipeableSheet / PlayerHud)

- **El contenedor de una hoja con contenido scrolleable va en
  `display: flex; flex-direction: column`, nunca `display: grid`.**
  `flex: 1` en el hijo que rueda no hace nada dentro de un grid: la fila
  `auto` crece sin límite para caber todo el contenido, y si el padre tiene
  `overflow: hidden` + `maxHeight`, lo que sobra se CORTA en vez de quedar
  deslizable. Ya mordió una vez en Ferramentas (era la única hoja con
  contenido suficiente para notarlo).
- El hijo que rueda necesita `minHeight: 0` explícito además de `flex: 1`:
  el mínimo por defecto de un hijo flex es el tamaño de su contenido, así
  que sin esto tampoco encoge y tampoco hace falta desplazarse.
- **Alto ACOTADO (`minHeight`+`maxHeight`), nunca fijo ni libre del todo**
  en las hojas (Mochila/Ferramentas/Clasificación): fijo deja hueco vacío
  con contenido corto; libre devuelve el estirón al cambiar de pestaña.

## Estilos que se ven mal sin que el código "esté mal"

- **Un borde nunca se pinta del mismo color que el fondo que lo rodea.**
  Pasó dos veces con `border: 1px solid var(--theme-card-inset)` sobre un
  fondo que también usa esa variable: el borde existe en el código y es
  invisible en pantalla. Usar `--theme-hairline` para bordes que deben
  VERSE.
- **Un atributo `disabled` en un botón con estilos en línea no cambia nada
  visual por sí solo** — hace falta un estilo "apagado" explícito
  (`opacity` + `cursor`) aplicado condicionalmente, porque no hay forma de
  escribir `:disabled` en un objeto de estilos React.

## Mapa (Leaflet)

- **`keepBuffer` no se sube a lo bruto para "evitar recargas".** Un valor
  de 150 mantiene miles de teselas `<img>` vivas en el DOM que Leaflet
  reposiciona TODAS en cada gesto de zoom/arrastre — es la causa más
  probable de que un mapa "no fluya", no la red. Las recargas al alejar
  se sirven de todos modos desde la caché del service worker.
- **`updateWhenZooming: true` puede causar teselas en blanco durante el
  zoom**: pide teselas nuevas en cada fotograma intermedio de la animación,
  y en un pellizco rápido no da tiempo a que lleguen antes de que la
  animación acabe. Con `false`, Leaflet escala con la GPU lo ya cargado
  durante el gesto y solo pide teselas definitivas al asentarse el zoom.
