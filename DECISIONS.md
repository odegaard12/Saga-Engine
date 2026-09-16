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
