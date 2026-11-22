/**
 * El estilo base del mapa, declarado en crudo y NO por URL (sacado tal cual de MapSurfaceGL.tsx). Los conmutadores de
 * diagnóstico se aplican encima en MapSurfaceGL (`estiloDelMapa`).
 */
import type * as maplibregl from 'maplibre-gl'
import { CENTRO_HALO_3D_PX, DESPLAZAMIENTO_ANCLA_PX } from '../bolaRenderizada'
import { sufijoDelRelieve, urlDeEdificios, ZOOM_MAXIMO_DESCARGADO } from '../../offline/mapTileCache'
import { DESPLAZAMIENTO_PIES_PX } from '../../avatares/retratoDeMapa'
import { FUENTE_TESELAS, CAPA_TESELAS, CAPA_FONDO, COLOR_FONDO_SIN_TESELA, FUENTE_RELIEVE, CAPA_SOMBRAS, FUENTE_RADIO, CAPA_RADIO_RELLENO, CAPA_RADIO_BORDE, FUENTE_RUTA, CAPA_RUTA, CAPA_RUTA_BORDE, FUENTE_NODOS_VOLUMEN, FUENTE_RELIEVE_SOMBRAS, FUENTE_EDIFICIOS, CAPA_EDIFICIOS, EDIFICIOS_EN_EL_MAPA, SIN_TRANSICION, FUENTE_NODOS_ICONOS, FUENTE_FOTOS, CAPA_RUTA_PULSO, FUENTE_JUGADOR, CAPA_JUGADOR, CAPA_AURA, CAPA_SUELO_JUGADOR, CAPA_SUELO_OTROS, CAPA_RUTA_FLECHAS, ICONO_FLECHA_RUTA, CAPA_RUTA_FLECHAS_LEJOS, ICONO_FLECHA_LEJOS, CAPA_GUIA_FLECHAS, CAPA_GUIA_SIN_CAMINO, FUENTE_CELEBRACION, CAPA_CELEB_ONDA, CAPA_CELEB_BRILLO, CAPA_CELEB_CHISPAS, CAPA_CELEB_INSIGNIA, ICONO_CELEB_ONDA, ICONO_CELEB_BRILLO, ICONO_CELEB_CHISPA, ICONO_CELEB_INSIGNIA, FUENTE_OTROS, FUENTE_OTROS_LINEAS, CAPA_OTROS_LINEAS, CAPA_OTROS, FUENTE_GUIA, CAPA_GUIA, CAPA_FOTOS, CAPA_NODOS_ICONOS, CAPA_NODOS_HALO, CAPA_NODOS_MONEDA, CAPA_NODOS_MONEDAS_2D, OPACIDAD_DEL_HALO, ICONO_HALO, ALTURA_SIMBOLOS_M, ALTURA_JUGADORES_M, ALTURA_NODOS_M, CAPA_NODOS_SUELO, CAPA_NODO_ENTRADA, TAMANO_ENTRADA, TAMANO_NODOS, TAMANO_FOTOS, TAMANO_JUGADOR, TAMANO_CELEBRACION, TAMANO_CHISPAS, OPACIDAD_SIN_TRES_D, CAPA_FOTOS_PILA, TAMANO_PILA, ZOOM_FOTOS_REPARTIDAS, DESPLAZAMIENTO_FOTOS, CAPA_NODOS_VOLUMEN, colorDeLaRuta, COLOR_RUTA_CONTORNO, COLOR_GUIA, COLOR_RADIO } from './capas'
import { COLECCION_VACIA } from './guia'

export function estiloBase(): maplibregl.StyleSpecification {
  return {
    version: 8,
      sources: {
        [FUENTE_TESELAS]: {
          type: 'raster',
          tiles: [`${window.location.origin}/map-tiles/{z}/{x}/{y}.png`],
          tileSize: 256,
          // 31/10: el zoom más alto del paquete offline; por encima MapLibre amplía ése (sin red, z19 salía en blanco).
          maxzoom: ZOOM_MAXIMO_DESCARGADO,
          // Esri, como en 5.51.1: la PNOA de 5.52 se veía borrosa en el iPhone (ver runtime/teselas.py).
          attribution: 'Imágenes &copy; Esri',
        },
        /**
         * Elevación del terreno. Esto es lo que hace que se vea el
         * DESNIVEL: inclinar la cámara sobre una foto plana no es 3D,
         * es la misma foto vista de lado.
         *
         * `maxzoom: 14`: Terrarium llega a 15, pero z15 sólo aporta detalle
         * que a pie no se aprecia y duplica el relieve del paquete offline
         * (90 KB por tesela). Con 14, al acercarse MapLibre amplía la de
         * z14, y el paquete cabe. Sin tope, pediría teselas que no existen
         * y el relieve desaparecería justo cuando más cerca estás.
         */
        /**
         * El radio y el trazado nacen aquí, vacíos.
         *
         * Declararlos en el estilo -y no añadirlos después- es lo que
         * mata de raíz el fallo que costó tres versiones: al añadirlos
         * al vuelo hay que esperar a que el estilo esté montado, y
         * ninguna de las dos señales de MapLibre sirve a ciegas. El
         * evento `style.load` YA ha ocurrido cuando enganchas el
         * escuchador, porque el estilo va en línea y se monta dentro del
         * constructor; e `isStyleLoaded()` es más estricto que el
         * evento, porque exige además que carguen todas las fuentes.
         * Entre las dos, el código se quedaba en tierra de nadie.
         *
         * Naciendo con el estilo, existen desde el primer fotograma.
         */
        [FUENTE_RADIO]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_RUTA]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_NODOS_VOLUMEN]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_NODOS_ICONOS]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_FOTOS]: { type: 'geojson', data: COLECCION_VACIA },
        // `fid` = la clave del jugador: su estado `tresD` (feature-state) enciende y apaga su retrato, su aro y su
        // aura SIN rehacer los datos (eso va por el worker y llegaba fotogramas tarde: el halo sin jugador).
        [FUENTE_JUGADOR]: { type: 'geojson', data: COLECCION_VACIA, promoteId: 'fid' },
        [FUENTE_OTROS]: { type: 'geojson', data: COLECCION_VACIA, promoteId: 'fid' },
        [FUENTE_OTROS_LINEAS]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_CELEBRACION]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_GUIA]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_RELIEVE]: {
          type: 'raster-dem',
          attribution:
            'Relieve: MDT05 &copy; IGN (CC BY 4.0) · Terrain Tiles (Mapzen, AWS Open Data)',
          tiles: [`${window.location.origin}/dem-tiles/{z}/{x}/{y}.png${sufijoDelRelieve()}`],
          tileSize: 256,
          /**
           * La FORMA del terreno, otra vez sólo hasta z12, como en 5.51.1. 5.52
           * la subió a z14 (MDT05: taludes, el cauce) y desde entonces el iPhone
           * del dueño ve el mapa borroso de cerca, «otro mapa». En WebKit de
           * escritorio no se reproduce (r20: misma nitidez que 5.51.1, quieto y
           * siguiendo al jugador), así que se vuelve a lo que se veía bien en el
           * iPhone. El detalle del MDT05 sigue en el sombreado (z14, abajo):
           * los taludes se leen, sólo que la malla no los levanta.
           */
          maxzoom: 12,
          // 31/10: el paquete offline no lleva relieve por debajo de z8 (ZOOMS_RELIEVE): al alejarse lo pedía y fallaba.
          minzoom: 8,
          encoding: 'terrarium',
        },
        [FUENTE_RELIEVE_SOMBRAS]: {
          type: 'raster-dem',
          tiles: [`${window.location.origin}/dem-tiles/{z}/{x}/{y}.png${sufijoDelRelieve()}`],
          tileSize: 256,
          // Hasta z14, como la forma: z15 (5.52) sumaba ~100 teselas al paquete y sin cobertura las pedía igual.
          maxzoom: 14,
          minzoom: 8,
          encoding: 'terrarium',
        },
        /**
         * Casas del Catastro (`/api/edificios`, recortadas a la zona de la
         * misión y sin ninguna encima de un nodo). Teselado del worker sólo
         * hasta z16: más allá MapLibre reescala, y una esquina de casa no
         * necesita más precisión que esa (centímetros).
         */
        ...(EDIFICIOS_EN_EL_MAPA
          ? {
              [FUENTE_EDIFICIOS]: {
                type: 'geojson' as const,
                data: `${window.location.origin}${urlDeEdificios()}`,
                maxzoom: 16,
                tolerance: 0.5,
                buffer: 32,
                attribution: 'Edificios &copy; Dirección General del Catastro',
              },
            }
          : {}),
      },
      layers: [
        { id: CAPA_FONDO, type: 'background', paint: { 'background-color': COLOR_FONDO_SIN_TESELA } },
        // Sin fundido: las teselas salen de la caché al instante, y el
        // fundido de 300 ms era lo que hacía parecer que el mapa cargaba.
        {
          id: CAPA_TESELAS,
          type: 'raster',
          source: FUENTE_TESELAS,
          paint: {
            'raster-fade-duration': 0,
          },
        },
        // Sombreado de laderas: marca el relieve aunque la foto satélite
        // sea plana. Sin esto el monte está ahí pero no se lee.
        {
          id: CAPA_SOMBRAS,
          type: 'hillshade',
          source: FUENTE_RELIEVE_SOMBRAS,
          /**
         * Sombreado fuerte a propósito.
         *
         * A la altura a la que se juega -zoom 17-18, unos cientos de
         * metros de ancho- el desnivel REAL de un valle son unos pocos
         * metros: geométricamente correcto e invisible. El sombreado de
         * laderas es lo que hace legible la forma del terreno a esa
         * escala, más que la propia malla.
         */
        paint: {
          /**
           * Luz de varias direcciones (`multidirectional`) en vez de una sola
           * a 315°: con una única luz, las laderas que miran a ella se
           * aplanan y las opuestas se ennegrecen; con cuatro, TODA ladera
           * tiene forma y las sombras son más suaves. Mismo coste: es un
           * paso de la GPU sobre la misma fuente de elevación.
           */
          'hillshade-method': 'multidirectional',
          // 0,55 (era 0,8 con Terrarium): el MDT05 trae diez veces más ribazos y, a 0,8, todo era sombra.
          'hillshade-exaggeration': 0.8,
          'hillshade-illumination-direction': [315, 45, 270, 0],
          'hillshade-illumination-altitude': [38, 30, 30, 26],
          /**
           * Sombra azulada y luz cálida, como en los mapas de montaña.
           *
           * Con los colores por defecto (gris sobre gris) el sombreado se
           * funde con la foto satélite y el monte se lee plano aunque la
           * malla esté levantada. El contraste de color es lo que hace
           * que una ladera "se vea" desde arriba.
           */
          // Sombras del TERRENO, no del tema: una ladera a la sombra es
          // azul oscura con cualquier piel de la app. (no-tema)
          'hillshade-shadow-color': ['#0d1b33', '#16223a', '#1a2540', '#0f172a'], // no-tema
          'hillshade-highlight-color': ['#fff1cf', '#ffe2a8', '#fdebc4', '#fff6dc'],
          'hillshade-accent-color': '#1e293b', // no-tema
        },
        },
        /**
         * Las casas, en volumen. De cerca el mapa se veía plano: el terreno
         * a esa escala son pocos metros, las casas no. Desde z15, por DEBAJO
         * de todo lo del juego (radio, ruta, nodos, fotos, jugadores van
         * después) y sin casas encima de los nodos (las quita el servidor).
         * Color teja suave y algo translúcidas: tapan el tejado de la foto,
         * y en beis parecían SimCity. Más claras cuanto más altas.
         */
        ...(EDIFICIOS_EN_EL_MAPA
          ? [
              {
                id: CAPA_EDIFICIOS,
                type: 'fill-extrusion' as const,
                source: FUENTE_EDIFICIOS,
                // Desde z14 (antes z15) y apareciendo poco a poco: al alejarse ya no desaparecen de golpe.
                minzoom: 14,
                paint: {
                  'fill-extrusion-color': [
                    'step',
                    ['get', 'h'],
                    '#c39a82',
                    7,
                    '#cdb8a6',
                    13,
                    '#d6d0c8',
                  ], // no-tema
                  'fill-extrusion-height': ['get', 'h'],
                  'fill-extrusion-base': 0,
                  'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.9],
                  'fill-extrusion-vertical-gradient': true,
                },
              } as maplibregl.LayerSpecification,
            ]
          : []),
        /**
         * Sin círculo del radio de entrada. Óscar: "cutre". La fuente
         * sigue existiendo por si vuelve a hacer falta; lo que marca el
         * nodo en juego es el brillo en el suelo del propio nodo.
         *
         * EXCEPCIÓN: mapa mudo. Ahí SÍ hace falta un círculo -es la única
         * pista visual que tiene el jugador, a propósito no hay pin-, así
         * que estas dos capas se reutilizan (rellenas y visibles) solo
         * mientras el nodo en juego es de kind 'mapa_mudo' (ver el efecto
         * "Radio del nodo actual" más abajo, que las enciende/apaga).
         */
        {
        id: CAPA_RADIO_RELLENO,
        type: 'fill',
        source: FUENTE_RADIO,
        layout: { visibility: 'none' },
        paint: {
          'fill-color': COLOR_RADIO,
          'fill-opacity': 0.14,
        },
        },
        {
        id: CAPA_RADIO_BORDE,
        type: 'line',
        source: FUENTE_RADIO,
        layout: { visibility: 'none' },
        paint: {
          'line-color': '#ffffff',
          'line-opacity': 0,
          'line-width': 0,
          // Sin trazos: las líneas a trazos tienen historial de no pintarse
          // bien sobre relieve en MapLibre, y aquí lo primero es que se vea.
        },
        },
        {
        id: CAPA_RUTA_BORDE,
        type: 'line',
        source: FUENTE_RUTA,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': COLOR_RUTA_CONTORNO,
          'line-opacity': 0.62,
          // Contorno generoso y con un punto de desenfoque: la traza se lee
          // sobre asfalto claro, arena y monte oscuro por igual.
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 7, 16, 12, 19, 19],
          'line-blur': 0.9,
        },
        },
        {
        /**
         * ESTO es 3D de verdad, y no un dibujo que lo imita.
         *
         * Los alfileres del DOM son calcomanías pegadas a la pantalla: no
         * se inclinan con la cámara, no los tapa una loma y al girar el
         * mapa siguen mirando de frente. Da igual cuánta sombra se les
         * pinte, nunca van a parecer parte del terreno.
         *
         * Un volumen extruido sí es geometría dentro del mapa: se levanta
         * del suelo, se inclina con la vista, lo esconde el monte que
         * tiene delante y crece en perspectiva al acercarse. El alfiler
         * con el número se queda encima, legible, que para leer un número
         * una calcomanía es justo lo que hace falta.
         */
        id: CAPA_NODOS_VOLUMEN,
        type: 'fill-extrusion',
        source: FUENTE_NODOS_VOLUMEN,
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'altura'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 0.92,
        },
      },
      {
        id: CAPA_RUTA,
        type: 'line',
        source: FUENTE_RUTA,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        /**
         * Grosor por zoom y no fijo.
         *
         * La ruta se dibuja sobre FOTO SATÉLITE: sobre asfalto claro o
         * sobre arena, un hilo blanco translúcido desaparece. De ahí que
         * antes "no se viera el trazado" aunque estuviera pintado.
         *
         * Va acompañada de una línea oscura por debajo (CAPA_RUTA_BORDE)
         * que hace de contorno; es el mismo truco que usan las apps de
         * senderismo para que la traza se lea sobre cualquier fondo.
         */
        paint: {
          /**
           * El color cuenta la partida: verde lo andado, azul el tramo
           * en juego, claro y apagado lo que queda. Cada tramo lleva el
           * estado del nodo al que llega.
           */
          'line-color': colorDeLaRuta(),
          'line-opacity': ['match', ['get', 'estado'], 'pendiente', 0.6, 'andado', 0.8, 'hecho', 0.8, 1],
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 7, 19, 12],
        },
      },
      {
        /**
         * Dirección: chevrones blancos que se repiten a lo largo de lo que
         * queda por andar, apuntando en el sentido de la marcha. Es una
         * línea con `line-pattern`, como el resto del trazado: va pegada al
         * terreno y no la entierra el relieve (un símbolo sobre la línea,
         * sí). Sólo de cerca: de lejos no caben.
         */
        id: CAPA_RUTA_FLECHAS,
        type: 'line',
        source: FUENTE_RUTA,
        minzoom: 16,
        filter: ['match', ['get', 'estado'], ['actual', 'pendiente'], true, false],
        layout: { 'line-cap': 'butt' },
        paint: {
          'line-pattern': ICONO_FLECHA_RUTA,
          'line-width': 12,
          'line-opacity': 0.92,
        },
      },
      {
        // 5/11: de lejos también hay sentido, pero una flecha cada tanto (de cerca, CAPA_RUTA_FLECHAS).
        id: CAPA_RUTA_FLECHAS_LEJOS,
        type: 'line',
        source: FUENTE_RUTA,
        minzoom: 13,
        maxzoom: 16,
        filter: ['match', ['get', 'estado'], ['actual', 'pendiente'], true, false],
        layout: { 'line-cap': 'butt' },
        paint: { 'line-pattern': ICONO_FLECHA_LEJOS, 'line-width': 10, 'line-opacity': 0.9 },
      },
      {
        /**
         * Pulso sobre el tramo en juego: una línea blanca más ancha cuya
         * opacidad respira (ver el bucle en el montaje). Es lo que dice
         * "por aquí, ahora" sin leer nada.
         */
        id: CAPA_RUTA_PULSO,
        type: 'line',
        source: FUENTE_RUTA,
        filter: ['==', ['get', 'estado'], 'actual'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-opacity': 0.4,
          // Sin transición: el pulso ya cambia 10 veces por segundo (ver SIN_TRANSICION).
          'line-opacity-transition': SIN_TRANSICION,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 6, 16, 11, 19, 18],
          'line-blur': 3,
        },
      },
      {
        /**
         * La guía: una línea a trazos de ti al nodo que toca, con los
         * trazos avanzando hacia él (ver el bucle del pulso). Es la
         * animación "entre el jugador y el nodo" que había en el motor de
         * siempre y que aquí faltaba. Recta a propósito: no dice por
         * dónde ir -eso lo dice el trazado-, dice hacia dónde.
         */
        id: CAPA_GUIA,
        type: 'line',
        source: FUENTE_GUIA,
        filter: ['!=', ['get', 'tipo'], 'sin_camino'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': COLOR_GUIA,
          'line-opacity': 0.9,
          'line-opacity-transition': SIN_TRANSICION,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 3.5, 19, 5],
          // 22/11 (Óscar): vuelve la guía de trazos de siempre; la continua con degradado de 6.12.4 «quedó fatal».
          // Trazo fijo: cambiarlo al vuelo recarga la fuente entera (ver `latir`).
          'line-dasharray': [2, 1.2],
        },
      },
      {
        // 5/11: chevrones espaciados sobre la guía a trazos: el sentido se lee también en una imagen quieta.
        id: CAPA_GUIA_FLECHAS,
        type: 'line',
        source: FUENTE_GUIA,
        minzoom: 13,
        filter: ['!=', ['get', 'tipo'], 'sin_camino'],
        layout: { 'line-cap': 'butt' },
        paint: { 'line-pattern': ICONO_FLECHA_LEJOS, 'line-width': 10, 'line-opacity': 0.9 },
      },
      {
        // 5/11: de ti a la red de caminos, cuando no hay camino conocido: punteado fino, no parece una calle más.
        id: CAPA_GUIA_SIN_CAMINO,
        type: 'line',
        source: FUENTE_GUIA,
        filter: ['==', ['get', 'tipo'], 'sin_camino'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': COLOR_GUIA,
          'line-opacity': 0.85,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 16, 2.5, 19, 3.5],
          'line-dasharray': [0.1, 2],
        },
      },
      {
        /**
         * El radio de entrada del nodo en juego, a su tamaño REAL, tumbado
         * en el mapa. El halo que marcaba el nodo en juego medía lo mismo en
         * pantalla a cualquier zoom: de lejos era "enorme, más grande que el
         * trazado". Éste es el círculo donde el juego te deja entrar.
         */
        id: CAPA_NODO_ENTRADA,
        type: 'symbol',
        source: FUENTE_NODOS_ICONOS,
        // Mapa mudo: nunca el aro de entrada exacto, solo el círculo difuso
        // (CAPA_RADIO_RELLENO/CAPA_RADIO_BORDE) mientras kind === 'mapa_mudo'.
        // 7/11: sólo el rasgo `entrada`, que va en el punto real del nodo (la moneda puede ir apartada en arco).
        filter: ['all', ['==', ['get', 'entrada'], true], ['!=', ['get', 'mapaMudo'], true]],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'iconoEntrada'],
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'map',
          'icon-rotation-alignment': 'map',
          'icon-size': TAMANO_ENTRADA,
        },
        paint: { 'icon-opacity': 0.9, 'icon-opacity-transition': SIN_TRANSICION },
      },
      {
        /**
         * El suelo de cada nodo: sombra y halo del color del tipo, TUMBADOS
         * sobre el mapa. Con la perspectiva real, en cualquier punto de la
         * pantalla y con cualquier inclinación, el nodo queda asentado.
         * Mismo ancla y mismo tamaño que el nodo: el poste cae en el centro.
         */
        id: CAPA_NODOS_SUELO,
        type: 'symbol',
        source: FUENTE_NODOS_ICONOS,
        // Mismo motivo que CAPA_NODO_ENTRADA: sin pin/halo sobre el nodo
        // mudo, ni siquiera el del suelo -solo el círculo difuso lo marca-.
        filter: ['all', ['!=', ['get', 'mapaMudo'], true], ['!=', ['get', 'entrada'], true]],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'iconoSuelo'],
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'map',
          'icon-rotation-alignment': 'map',
          'icon-size': TAMANO_NODOS,
          'symbol-sort-key': ['get', 'orden'],
          visibility: 'none',
        },
        paint: { 'icon-opacity': 1, 'icon-opacity-transition': SIN_TRANSICION },
      },
      {
        // Resplandor del nodo en juego: late por icon-opacity (ver `latir`).
        id: CAPA_NODOS_HALO,
        type: 'symbol',
        source: FUENTE_NODOS_ICONOS,
        // Mapa mudo: sin resplandor -marcaría el punto exacto igual que la
        // chincheta que este halo acompaña-. Se apaga con el mismo filtro
        // que CAPA_NODOS_ICONOS.
        filter: ['all', ['==', ['get', 'estado'], 'actual'], ['!=', ['get', 'mapaMudo'], true], ['!=', ['get', 'entrada'], true]],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ICONO_HALO,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_NODOS,
        },
        paint: {
          'icon-opacity': OPACIDAD_DEL_HALO,
          'icon-opacity-transition': SIN_TRANSICION,
          'icon-translate-transition': SIN_TRANSICION,
        },
      },
      {
        /**
         * Fotos de campo como símbolos del mapa, por lo mismo que los
         * nodos: un marcador del DOM va un fotograma por detrás del
         * terreno y "no se queda en su sitio" con relieve y zoom. La
         * miniatura se carga y se enmarca en un canvas bajo demanda (ver
         * `styleimagemissing`), y el motor la coloca en el mismo fotograma
         * que el resto del mapa.
         *
         * Va ENCIMA del suelo y del halo de los nodos, y debajo del nodo:
         * las de un nodo se reparten bajo su peana.
         */
        id: CAPA_FOTOS,
        type: 'symbol',
        source: FUENTE_FOTOS,
        // Las de los nodos van en su montón (CAPA_FOTOS_PILA).
        filter: ['!=', ['get', 'tipo'], 'pila'],
        layout: {
          'symbol-height-offset': ALTURA_SIMBOLOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono'],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_FOTOS,
          // Repartidas por grupo (ver `huecoDeFoto`): se pueden tocar una a una.
          /**
           * Repartidas SÓLO de muy cerca (zoom 18): de lejos, repartidas
           * "quedan fatal". Hasta ahí van juntas en su sitio y se ve una.
           */
          'icon-offset': ['step', ['zoom'], ['literal', [0, 0]], ZOOM_FOTOS_REPARTIDAS, DESPLAZAMIENTO_FOTOS],
          'symbol-sort-key': ['get', 'orden'],
        },
        // De lejos, sólo la primera de cada sitio; desde el zoom 18, todas repartidas.
        paint: {
          'icon-opacity': ['step', ['zoom'], ['case', ['==', ['get', 'orden'], 0], 1, 0], ZOOM_FOTOS_REPARTIDAS, 1],
        },
      },
      {
        /**
         * Los nodos como SÍMBOLOS del mapa, no como marcadores del DOM.
         *
         * Un marcador del DOM se coloca desde JavaScript, un fotograma
         * después de que el mapa se haya dibujado: con relieve y zoom, va
         * siempre por detrás del terreno -"se quedan mal y al soltar se
         * recolocan"-. Un símbolo lo pinta el propio motor, en el mismo
         * fotograma y sobre la altura correcta del terreno.
         *
         * La imagen de cada chincheta se dibuja en un canvas al vuelo, con
         * el número horneado dentro (ver `styleimagemissing`): así no hace
         * falta ninguna fuente de letras externa, que sería una petición
         * más que falla sin cobertura.
         */
        id: CAPA_NODOS_ICONOS,
        type: 'symbol',
        source: FUENTE_NODOS_ICONOS,
        // Mapa mudo: sin chincheta -ni 2D ni 3D- mientras kind === 'mapa_mudo'.
        // Es la pieza principal que había que ocultar: sin este filtro el
        // pin marcaba el punto exacto encima del círculo difuso, delatándolo.
        filter: ['all', ['!=', ['get', 'mapaMudo'], true], ['!=', ['get', 'entrada'], true]],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono'],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          // Billboard: siempre de frente, como una chincheta clavada que
          // miras desde cualquier lado. Pegarla al plano del mapa la
          // aplastaría con la inclinación.
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          /**
           * Crecen con el mapa al acercarse, como cualquier cosa del mundo.
           * Con una escala casi fija en píxeles, al ampliar el nodo parecía
           * cada vez más pequeño frente a las casas y los caminos, que sí
           * crecen: "cuanto más me acerco más pequeños se hacen". Base 1,5
           * por nivel de zoom: la mitad que el terreno (que dobla), para que
           * de cerca no tapen el mapa.
           */
          'icon-size': TAMANO_NODOS,
          // El nodo en juego se pinta el último: queda encima si se solapan.
          'symbol-sort-key': ['get', 'orden'],
        },
        paint: { 'icon-opacity': 1, 'icon-opacity-transition': SIN_TRANSICION },
      },
      {
        // 20/11: la moneda 2D, con diseño FIJO (ver `aplicarModo`). Mismo filtro, tamaño y orden que el poste.
        id: CAPA_NODOS_MONEDAS_2D,
        type: 'symbol',
        source: FUENTE_NODOS_ICONOS,
        filter: ['all', ['!=', ['get', 'mapaMudo'], true], ['!=', ['get', 'entrada'], true]],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono'],
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_NODOS,
          'symbol-sort-key': ['get', 'orden'],
        },
        paint: { 'icon-opacity': 1, 'icon-opacity-transition': SIN_TRANSICION },
      },
      {
        // Las fotos de cada nodo, en un montón al lado de su base (ver `dibujarPila`).
        id: CAPA_FOTOS_PILA,
        type: 'symbol',
        source: FUENTE_FOTOS,
        filter: ['==', ['get', 'tipo'], 'pila'],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono'],
          'icon-anchor': 'bottom-left',
          'icon-offset': [48, -4],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_PILA,
        },
      },
      {
        /**
         * La moneda de la poképarada, encima de su base. Mismo encuadre,
         * mismo ancla y mismo tamaño que la base, así que encajan exactas;
         * va aparte para que suba y baje sola (`icon-translate`, ver
         * `latir`). Sólo en 3D.
         */
        id: CAPA_NODOS_MONEDA,
        type: 'symbol',
        source: FUENTE_NODOS_ICONOS,
        // Mapa mudo: sin moneda flotante -es el marcador 3D que delataría el
        // punto exacto en modo 3D-, mismo filtro que CAPA_NODOS_ICONOS.
        filter: ['all', ['!=', ['get', 'mapaMudo'], true], ['!=', ['get', 'entrada'], true]],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono3dm'],
          'icon-anchor': 'bottom',
          'icon-offset': [0, DESPLAZAMIENTO_ANCLA_PX],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_NODOS,
          'symbol-sort-key': ['get', 'orden'],
          visibility: 'none',
        },
        paint: {
          'icon-translate': [0, 0],
          'icon-translate-transition': SIN_TRANSICION,
          'icon-translate-anchor': 'viewport',
          'icon-opacity': 1,
          'icon-opacity-transition': SIN_TRANSICION,
        },
      },
      {
        // 7/11: de cada retrato apartado en corona, una línea fina hasta donde está de verdad.
        id: CAPA_OTROS_LINEAS,
        type: 'line',
        source: FUENTE_OTROS_LINEAS,
        // 22/11: sólo hay líneas desde el zoom 19 (MapSurfaceGL): por debajo, la fuente vacía calculaba sus teselas en cada
        // fotograma igual que una llena (era la más cara de todas las fuentes). Oculta, MapLibre no la usa.
        minzoom: 19,
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-opacity': 0.8, 'line-width': 1.5 },
      },
      {
        // El suelo de cada compañero: aro del color de su equipo y flecha de rumbo, tumbados.
        id: CAPA_SUELO_OTROS,
        type: 'symbol',
        source: FUENTE_OTROS,
        filter: ['has', 'suelo'],
        layout: {
          'symbol-height-offset': ALTURA_JUGADORES_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'suelo'],
          'icon-rotate': ['number', ['get', 'rumbo'], 0],
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'map',
          'icon-rotation-alignment': 'map',
          'icon-size': TAMANO_JUGADOR,
        },
        paint: { 'icon-opacity': OPACIDAD_SIN_TRES_D },
      },
      {
        /**
         * Los RETRATOS de los compañeros (su círculo con su foto), como símbolos
         * del mapa y no como marcadores del DOM.
         *
         * Los marcadores del DOM (5.42-5.43) se colocan desde JavaScript un
         * fotograma después del terreno y, con relieve y zoom, "se iban a otras
         * zonas de Galicia". Un símbolo lo coloca el motor, en la posición REAL,
         * a cualquier zoom y a la altura del suelo, igual que los nodos. Mismo
         * ancla, misma altura y mismo tamaño compuesto que tu retrato.
         *
         * Los que se taparían van en racimo: su punto ya llega apartado (el
         * `corro` de `planDeJugadores`, en metros del suelo, medido en pantalla
         * contigo dentro). Va ANTES de tu capa: tú siempre quedas encima. Los
         * datos van por `pintarFuente` (sin `setData` repetido) y la opacidad por
         * presencia es un dato del punto, no un `setPaintProperty` (que repinta
         * el terreno entero).
         */
        id: CAPA_OTROS,
        type: 'symbol',
        source: FUENTE_OTROS,
        layout: {
          'symbol-height-offset': ALTURA_JUGADORES_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono'],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_JUGADOR,
          // Lo que hay que bajar la imagen para que el CENTRO del círculo caiga en la coordenada (11/11: sin punta).
          'icon-offset': [0, DESPLAZAMIENTO_PIES_PX],
          'symbol-sort-key': ['get', 'orden'],
        },
        paint: { 'icon-opacity': OPACIDAD_SIN_TRES_D },
      },
      {
        // Tu suelo: aro del color de tu equipo y flecha hacia donde caminas.
        id: CAPA_SUELO_JUGADOR,
        type: 'symbol',
        source: FUENTE_JUGADOR,
        filter: ['has', 'suelo'],
        layout: {
          'symbol-height-offset': ALTURA_JUGADORES_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'suelo'],
          'icon-rotate': ['number', ['get', 'rumbo'], 0],
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'map',
          'icon-rotation-alignment': 'map',
          'icon-size': TAMANO_JUGADOR,
        },
        paint: { 'icon-opacity': OPACIDAD_SIN_TRES_D },
      },
      {
        /**
         * Aura alrededor de ti: cian con GPS (`gps`), naranja en modo prueba
         * (`debug`). Radio fijo en píxeles, como en el mapa antiguo; no es la
         * precisión real en metros.
         */
        id: CAPA_AURA,
        type: 'circle',
        source: FUENTE_JUGADOR,
        // 11/11 (Óscar: «sin pico o halo»): con GPS ya no hay aura; sólo la naranja del modo prueba.
        filter: ['==', ['get', 'aura'], 'debug'],
        paint: {
          // Crece con el avatar (TAMANO_JUGADOR: 0,8 a 1,9): fijo en 27 px a zoom 12 se comía el muñeco.
          'circle-radius': ['interpolate', ['exponential', 1.25], ['zoom'], 12, 16, 20, 38],
          // Tumbada en el suelo, alrededor de los pies (ahora el muñeco apoya en el punto).
          'circle-pitch-alignment': 'map',
          'circle-color': ['match', ['get', 'aura'], 'debug', '#fb923c', '#22d3ee'],
          // En 3D no hay aura (lo dice el estado `tresD`, a la vez que se enciende el cuerpo).
          'circle-opacity': ['case', ['boolean', ['feature-state', 'tresD'], false], 0, 0.14],
          'circle-stroke-width': 2,
          'circle-stroke-color': ['match', ['get', 'aura'], 'debug', '#c2410c', '#0891b2'],
          'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'tresD'], false], 0, 0.6],
        },
      },
      {
        /**
         * TÚ, como símbolo del mapa y no como marcador del DOM.
         *
         * El avatar era el último marcador del DOM que quedaba, y por eso
         * era el único que seguía saltando con el relieve al hacer zoom.
         * La foto se enmarca en un canvas con tu color (ver
         * `styleimagemissing`) y el motor la coloca en el mismo fotograma
         * que el terreno, igual que los nodos y las fotos.
         */
        id: CAPA_JUGADOR,
        type: 'symbol',
        source: FUENTE_JUGADOR,
        layout: {
          'symbol-height-offset': ALTURA_JUGADORES_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono'],
          'icon-anchor': 'bottom',
          'icon-offset': [0, DESPLAZAMIENTO_PIES_PX],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_JUGADOR,
        },
        paint: { 'icon-opacity': OPACIDAD_SIN_TRES_D },
      },
      /**
       * La celebración de un nodo completado (ver avatares/celebracion.ts).
       * Sólo símbolos: no los «dibuja» el terreno, así que animarlos cambiando
       * los datos no repinta el relieve. `s` y `o` (escala y opacidad) son datos
       * del punto: un `icon-size` que depende de un dato NO tiene el tope de
       * zoom de las teselas, igual que los nodos.
       */
      {
        id: CAPA_CELEB_ONDA,
        type: 'symbol',
        source: FUENTE_CELEBRACION,
        filter: ['==', ['get', 'tipo'], 'onda'],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ICONO_CELEB_ONDA,
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'map',
          'icon-rotation-alignment': 'map',
          'icon-size': TAMANO_CELEBRACION,
        },
        paint: { 'icon-opacity': ['number', ['get', 'o'], 0] },
      },
      {
        id: CAPA_CELEB_BRILLO,
        type: 'symbol',
        source: FUENTE_CELEBRACION,
        filter: ['==', ['get', 'tipo'], 'brillo'],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ICONO_CELEB_BRILLO,
          'icon-anchor': 'bottom',
          'icon-offset': [0, DESPLAZAMIENTO_ANCLA_PX],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_CELEBRACION,
        },
        paint: { 'icon-opacity': ['number', ['get', 'o'], 0] },
      },
      {
        id: CAPA_CELEB_CHISPAS,
        type: 'symbol',
        source: FUENTE_CELEBRACION,
        filter: ['==', ['get', 'tipo'], 'chispa'],
        layout: {
          'symbol-height-offset': ALTURA_SIMBOLOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ICONO_CELEB_CHISPA,
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_CHISPAS,
        },
        paint: { 'icon-opacity': ['number', ['get', 'o'], 0] },
      },
      {
        id: CAPA_CELEB_INSIGNIA,
        type: 'symbol',
        source: FUENTE_CELEBRACION,
        filter: ['==', ['get', 'tipo'], 'insignia'],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ICONO_CELEB_INSIGNIA,
          'icon-anchor': 'bottom',
          // Encima de la moneda del nodo (la imagen del nodo mide ALTO_BOLA_PX y la moneda va arriba).
          'icon-offset': [0, DESPLAZAMIENTO_ANCLA_PX - CENTRO_HALO_3D_PX - 6],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_CELEBRACION,
        },
        paint: { 'icon-opacity': ['number', ['get', 'o'], 0] },
      },
    ],
      /**
       * Exageración 1.5: el desnivel real de la ruta es suave y a escala
       * exacta, desde el aire, casi no se aprecia. Subirlo más convierte
       * el monte en una sierra que no existe.
       */
      /**
       * Exageración 1,5 (era 2,2). Con 2,2, cerca de un monte la cámara -que
       * va unos 470 m por detrás de ti a zoom 17- quedaba DENTRO del relieve
       * y MapLibre le bajaba a la fuerza la inclinación y el zoom (medido: de
       * 55° a 15°), con saltos al ampliar y el centrado descolocado.
       */
      terrain: { source: FUENTE_RELIEVE, exaggeration: 1.5 },
      /**
       * Cielo y niebla del horizonte. Con la cámara inclinada el borde del
       * mapa era un corte seco contra el fondo; con esto el terreno lejano se
       * funde con el aire y el horizonte da profundidad. Es una sola pasada
       * en la parte alta de la pantalla y no toca las teselas.
       */
      sky: {
        'sky-color': '#5b9bd5', // no-tema: cielo del mapa
        'sky-horizon-blend': 0.55,
        'horizon-color': '#dbe8f3', // no-tema: cielo del mapa
        'horizon-fog-blend': 0.6,
        'fog-color': '#c7d6e3', // no-tema: cielo del mapa
        // 5.59: 1 (antes 0,22): la niebla empezaba a media pantalla y lavaba de azul todo el tercio de arriba
        // del mapa inclinado («ese degradado tiene que ser mapa»). Ahora sólo toca la línea del horizonte.
        'fog-ground-blend': 1,
      },
  }
}
