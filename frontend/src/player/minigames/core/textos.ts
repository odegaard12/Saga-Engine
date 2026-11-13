import type { Locale } from '../../../i18n'

/**
 * Los textos del jugador dentro de la hoja del reto y de los minijuegos que
 * llevan avisos con datos (contadores, segundos, niveles).
 *
 * Por qué un diccionario propio y no el puente de idioma
 * (`i18n/legacySpanishBridge.ts`): el puente sólo traduce un texto ya pintado si
 * es IDÉNTICO a una clave suya, y un aviso como «Nivel 3 de 5. Observa...» lleva
 * el 3 y el 5 dentro. Ahí se quedaba en castellano en una misión en gallego, y
 * los que un día se escribieron directamente en gallego (`Saíches a media
 * proba…`) salían en gallego en una misión en castellano: pantallas con dos
 * idiomas a la vez.
 *
 * Aquí cada texto existe en los tres idiomas y el compilador lo obliga:
 * `gl` y `en` son del tipo de `es`, así que si falta una clave, o una función
 * cambia de parámetros, no compila. Sin `t()` y sin tocar `i18n/index.ts`, que
 * comparten varias manos.
 *
 * Los tres idiomas de la app son `es`, `gl` y `en`. En gallego se usan las
 * mismas palabras que el resto del juego (xogo, reto, nodo, obxecto, peza).
 */

const es = {
  juego: {
    cargando: 'Cargando juego…',
    guardando: 'Guardando…',
    avanzando: 'Avanzando…',
    continuar: 'Continuar',
    continuarSiguienteNodo: 'Continuar al siguiente nodo',
    reintentar: 'Reintentar',
  },

  hoja: {
    cerrar: 'CERRAR',
    cerrarJuego: 'Cerrar juego',
    verHistoriaDelNodo: 'Ver historia del nodo',
    verHistoria: 'Ver historia',
    historia: 'Historia',
    guardando: 'Guardando...',
    recogerObjeto: '🎒 RECOGER OBJETO',
    objetoDeMision: 'Objeto de misión',
    coleccionable:
      '¡Has encontrado un objeto coleccionable en esta ubicación! Presiona el botón de abajo para recogerlo y guardarlo en tu mochila.',
    sinJuego:
      'Este nodo no tiene un juego configurado aún. El administrador debe asignarle un tipo de minijuego.',
    respaldoAbrir: '¿Atascado? Escribe el código de respaldo · +2 min',
    respaldoOcultar: 'Ocultar código de respaldo',
    respaldoPlaceholder: 'Escribe el código...',
    respaldoValidar: 'Validar (+2m)',
    envioFallido: 'No se pudo guardar tu avance. Revisa el aviso e inténtalo de nuevo.',
    juegoRoto: 'Este reto no se pudo mostrar. Reinténtalo o usa el código de respaldo de abajo.',
    reintentarEnvio: 'Reintentar',
  },

  /** El aviso que sale al volver de una salida contada. `segundos` = lo que se suma. */
  antiTrampas: {
    salioApp: (segundos: number) =>
      `Saliste de la aplicación durante el reto: empieza de nuevo y se suman ${segundos} s.`,
    selectorApps: (segundos: number) =>
      `Abriste el selector de apps durante el reto: empieza de nuevo y se suman ${segundos} s.`,
  },

  tilt: {
    sensorInicial: 'Botones táctiles disponibles',
    salioAMediaPartida: 'Saliste a media partida: has perdido el intento.',
    pared: 'Pared. Busca otra dirección.',
    objetoRecogido: 'Objeto recogido.',
    sinVidas: 'Has perdido todas las vidas.',
    cayoEnAgujero: 'Caíste en un agujero. Vuelves al inicio.',
    salidaCerrada: 'La salida está cerrada. Recoge todos los objetos.',
    seTerminoElTiempo: 'Se terminó el tiempo.',
    sensorCalibrado: 'Sensor calibrado',
    modoTactil: 'Modo táctil activo',
    calibrar: 'Mantén el móvil cómodo para calibrar',
    sensorNoDisponible: 'Sensor no disponible · usa botones',
    botonesActivos: 'Botones activos · sensor apagado',
    recalibrar: 'Mantén el móvil cómodo para recalibrar',
    bolaAlInicio: 'Bola devuelta al inicio.',
    titulo: 'Laberinto de equilibrio',
    instrucciones: 'Inclina el móvil o usa los botones para alcanzar la salida.',
    leyenda: 'Recoge los objetos ◆, evita los agujeros × y llega a la bandera ⚑.',
    iniciar: 'Iniciar laberinto',
    superado: 'Laberinto superado',
    superadoDetalle: 'Has recogido todos los objetos y alcanzado la salida.',
    intentoTerminado: 'Intento terminado',
    volverAIntentarlo: 'Volver a intentarlo',
    segundos: 'segundos',
    vidas: 'vidas',
    objetos: 'objetos',
    todosLosObjetos: 'Todos los objetos recogidos. Busca la salida.',
    inclinaSuavemente: 'Inclina suavemente el móvil o usa los botones.',
    arriba: 'Arriba',
    izquierda: 'Izquierda',
    abajo: 'Abajo',
    derecha: 'Derecha',
    usarBotones: '¿No responde al inclinar? Usar botones (+1 min)',
    recalibrarBoton: 'Recalibrar',
    volverAlInicio: 'Volver al inicio',
  },

  // 7/11: Simón ya no existe (es Eco rítmico); de sus textos sólo quedan los nombres de los colores, que usa Pulso.
  coloresDePulso: ['Verde', 'Rojo', 'Azul', 'Ámbar', 'Violeta', 'Cian'] as readonly string[],

  audio: {
    titulo: 'Desafío de audio',
    instrucciones: 'Sopla o haz ruido cerca del micrófono para cargar la barra.',
    activar: 'Activar micrófono',
    sinMicrofono: 'No se pudo acceder al micrófono. Asegúrate de dar permisos.',
  },

  pulso: {
    kicker: 'PULSO DE HIERRO',
    tituloPorDefecto: 'Pulso de hierro',
    instrucciones:
      'Sujeta el móvil lo más quieto posible con una mano. Con la otra, repite la secuencia de colores -crece cada ronda-. Moverte de más reinicia la ronda actual, no la partida.',
    empezar: '▶ Empezar',
    jugarSinSensor: 'Jugar sin sensor de movimiento (+1 min)',
    fallarCuesta: 'Cada fallo de la secuencia suma 5 s.',
    penalizacion: (s: number) => `Fallos: +${s} s`,
    reinicios: (n: number) => `Reinicios por movimiento: ${n}`,
    rondaSuperada: (ronda: number) => `¡Ronda ${ronda} superada!`,
    sinSensor: 'Sensor de movimiento no disponible.',
    modoTactil: 'Modo táctil',
    sinSensorUsaTactil: 'Sensor no disponible: se usa modo táctil.',
  },

  checkpoint: {
    puntoDeControl: '📍 Nodo',
    distancia: (metros: number) => `Distancia al punto · zona de ${metros} m`,
    sinCoordenadas: 'Este punto no tiene coordenadas. Puedes continuar.',
    informativo: 'Punto informativo. Lee el texto y continúa.',
    buscandoGps: 'Buscando tu posición GPS…',
    sinPermiso: 'Sin permiso de ubicación: no podemos comprobar que has llegado.',
    sinGps: 'Este navegador no permite GPS: no podemos comprobar que has llegado.',
    sinGpsCuesta: (coste: string) => `Puedes continuar, pero suma ${coste} a tu tiempo, como el código de emergencia.`,
    heLlegadoSinGps: (extra: string) => `✅ He llegado sin GPS · ${extra}`,
    llegaste: '¡Has llegado al punto de control!',
    acercate: 'Acércate al punto marcado en el mapa.',
    registrando: 'Registrando…',
    heLlegado: '✅ He llegado · Continuar',
    acercateBoton: '🚶 Acércate para continuar',
    gpsFalla: 'Si el GPS falla, pide al monitor el código de emergencia del nodo.',
  },

  motion: {
    titulo: 'Dinamo',
    brief: 'Baliza sin señal. Cárgala con pulsos para abrir el siguiente tramo.',
    interaccion: 'Interacción',
    listo: 'Pulsa iniciar. Quieto no carga.',
    completado: 'Nodo completado. Pulsa continuar.',
    sobrecarga: 'Sobrecarga. Pulsa más suave.',
    demasiadoFuerte: 'Demasiado fuerte. Carga poco.',
    pulsoValido: 'Pulso válido.',
    toqueValido: 'Toque válido.',
    sensorNoDisponibleTactil: 'Sensor no disponible. Usa táctil.',
    sensorNoDisponible: 'Sensor no disponible.',
    mueveElMovil: 'Pulsa el móvil en movimientos cortos y separados.',
    modoTactilToca: 'Modo táctil. Toca con ritmo.',
    muySeguido: 'Muy seguido. Separa los pulsos.',
    tiempoAgotado: 'Tiempo agotado. Faltaron pulsos válidos.',
    estadoCompletado: 'Nodo completado',
    estadoFallida: 'Carga fallida',
    estadoTactil: 'Modo táctil',
    estadoCargando: 'Cargando',
    estadoSinSensor: 'Sensor no disponible',
    estadoPreparado: 'Preparado',
    carga: 'Carga',
    calor: 'Calor',
    pulsosValidos: 'Pulsos válidos',
    reglaCortos: 'Pulsos cortos',
    reglaCortosDetalle: 'Golpes breves.',
    reglaMedioSegundo: 'Medio segundo',
    reglaMedioSegundoDetalle: 'Pausa entre pulsos.',
    reglaQuieto: 'Quieto no carga',
    reglaQuietoDetalle: 'No hay energía.',
    iniciar: 'Iniciar',
    reintentar: 'Reintentar',
    reiniciar: 'Reiniciar',
    tocar: 'Tocar',
    tactil: 'Táctil',
  },

  circuit: {
    aria: 'Matriz de circuitos',
    patronNoDisponible: 'Patrón fijo no disponible',
    patronRoto: 'El patrón guardado está incompleto o contiene saltos. Corrígelo en el administrador.',
    completado: 'Nodo completado',
    exitoConFallos: (n: number) =>
      `La corriente vuelve a su camino. ${n} ${n === 1 ? 'fallo' : 'fallos'}: +${n * 5}s a tu tiempo.`,
    exitoLimpio: 'La corriente vuelve a su camino, y sin un solo fallo.',
    bloqueada: 'Matriz bloqueada',
    bloqueadaDetalle: 'Has quemado demasiadas celdas. Reinicia y memoriza mejor la secuencia.',
    memoriza: 'Memoriza',
    tuTurno: 'Repite el trazado',
    alReves: 'Al revés: del último al primero',
    preparado: 'Preparado',
    fijate: 'Fíjate en el trazado. Al final se queda entero un momento.',
    marca: (quedan: number) =>
      `Marca las casillas del trazado, en el orden que quieras. ${quedan === 1 ? 'Te queda 1 intento' : `Te quedan ${quedan} intentos`}.`,
    marcaAlReves: (quedan: number) =>
      `Marca las casillas al revés, de la última a la primera. ${quedan === 1 ? 'Te queda 1 intento' : `Te quedan ${quedan} intentos`}.`,
    cuentaAtras: (n: number) => `Mira la matriz: la secuencia empieza en ${n}…`,
    tienes: (n: number) => (n === 1 ? 'Tienes 1 intento.' : `Tienes ${n} intentos.`),
    celda: (fila: number, columna: number) => `Celda ${fila}, ${columna}`,
    reiniciar: 'Reiniciar',
    empezarYa: (n: number) => `Empezar ya (${n})`,
    empezar: 'Empezar',
  },

  mosaic: {
    piezaSeleccionada: 'Pieza seleccionada. Toca otra para intercambiarlas.',
    noCoincide: 'No coincide. Observa el lugar real y prueba otra respuesta.',
    noConfigurado: 'Mosaico no configurado',
    noConfiguradoDetalle: 'El administrador debe subir una fotografía válida y revisar la pregunta final.',
    ariaMosaico: 'Mosaico del lugar',
    ariaVistaPrevia: 'Vista previa del mosaico',
    ariaImagenCompletada: 'Imagen completada',
    ariaMosaicoCompletado: 'Mosaico completado',
    ariaMosaicoNoCompletado: 'Mosaico no completado',
    ariaPregunta: 'Pregunta final del mosaico',
    observaElLugar: 'Observa el lugar',
    memorizaLaFoto: 'Memoriza la fotografía antes de que se convierta en piezas.',
    altFotoLugar: 'Fotografía del lugar',
    altFotoCompletada: 'Fotografía completada',
    referenciaRapida: 'Referencia rápida',
    memoriza: 'Memoriza',
    detalleRapido: 'Comprueba un detalle antes de volver al mosaico.',
    observaConCalma: 'Observa con calma las formas, los colores y los detalles principales.',
    volverAlMosaico: 'Volver al mosaico',
    empezarAhora: 'Empezar ahora',
    imagenCompletada: 'Imagen completada',
    todasColocadas: 'Todas las piezas están correctamente colocadas.',
    completado: 'Completado',
    quedaComprobacion: 'Queda una comprobación',
    observaElElemento: 'Observa ahora el elemento real antes de responder.',
    retoCompletado: 'Reto completado',
    yaPuedesContinuar: 'Ya puedes continuar al siguiente punto de la ruta.',
    ahoraResponde: 'Ahora responde a esta pregunta',
    lugarVerificado: 'Lugar verificado',
    lugarVerificadoDetalle: 'La imagen y la comprobación final son correctas. Puedes continuar la ruta.',
    sinMovimientos: 'Sin movimientos',
    sinMovimientosDetalle: 'Se agotó el límite configurado. Observa de nuevo el lugar y vuelve a intentarlo.',
    intentarDeNuevo: 'Intentarlo de nuevo',
    preguntaAyuda: 'Observa el elemento real y elige la respuesta correcta.',
    preguntaSelecciona: 'Selecciona la respuesta que puedas comprobar en el punto donde estás.',
    comprobar: 'Comprobar respuesta',
    descripcionPorDefecto: 'Reconstruye la fotografía observando el lugar real.',
    reconstruye: 'Reconstruye el lugar',
    movimientos: 'movimientos',
    restantes: 'restantes',
    ariaPiezaSeleccionada: (n: number) => `Pieza ${n} seleccionada`,
    ariaSeleccionarPieza: (n: number) => `Seleccionar pieza ${n}`,
    tocaUnaPieza: 'Toca una pieza',
    ahoraTocaOtra: 'Ahora toca otra',
    paraSeleccionarla: 'para seleccionarla.',
    paraIntercambiarlas: 'para intercambiarlas.',
    tocalaOtraVezParaGirar: 'Tócala otra vez para girarla.',
    ariaProgreso: (bien: number, total: number) => `${bien} de ${total} piezas bien colocadas`,
    piezasBien: 'Piezas bien colocadas',
    mezclar: 'Mezclar de nuevo',
    costeSegundos: (s: number) => ` · +${s} s`,
    penalizacionTotal: (s: number) => `Penalización de esta prueba: +${s} s`,
    soltarPieza: 'Soltar la pieza',
    demoGirar: 'Toca una pieza dos veces para girarla; «Soltar la pieza» la deja donde está.',
    verReferencia: 'Ver referencia · 1,4 s',
  },

  bearing: {
    activaOrientacion: 'Activa orientación',
    sensorBloqueado: 'Sensor bloqueado',
    buscandoHeading: 'Buscando heading',
    mantenEstable: 'Mantén estable',
    cercaDelVector: 'Cerca del vector',
    giraHaciaElVector: 'Gira hacia el vector',
    // Revisión 19/10: estas etiquetas estaban fijas en inglés en el juego.
    rumboCapturado: 'Rumbo capturado',
    etiquetaFijado: 'FIJADO',
    etiquetaListo: 'LISTO',
    etiquetaBuscando: 'BUSCANDO',
    etiquetaAguanta: 'AGUANTA',
    derecha: 'DCHA',
    izquierda: 'IZDA',
    cabecera: 'Fijar rumbo',
    necesitaToque: 'Safari iPhone necesita un toque para activar orientación real.',
    solicitando: 'Solicitando acceso al sensor.',
    buscando: 'Sensor activo. Esperando primera lectura estable.',
    activa: 'Orientación real activa.',
    silencioso: 'No llega heading. Puedes usar prueba manual discreta.',
    denegado: 'Permiso denegado. Revisa movimiento/orientación en Safari.',
    noSoportado: 'Este navegador no expone DeviceOrientation.',
    sinHttps: 'Abre el runtime desde HTTPS para usar sensores reales.',
    preparando: 'Preparando instrumento.',
    activarSensor: 'Activar sensor',
    pruebaManual: 'Prueba manual',
  },

  teamRelay: {
    titulo: 'Relevo de Equipo',
    juntos: (nombres: string, cuantos: number) =>
      `${nombres} está${cuantos === 1 ? '' : 'n'} aquí contigo.`,
    esperando: 'Esperando a que llegue alguien más del equipo a este punto...',
    companerosAqui: 'Jugadores aquí (contigo):',
    registrando: 'Registrando...',
    mantenPresionado: 'Mantén presionado...',
    validar: 'Validar Relevo',
    esperandoEquipo: 'Esperando equipo',
    sinRed:
      'Este reto necesita cobertura: el móvil tiene que ver dónde están tus compañeros. Si no la hay, usa el código de respaldo.',
  },

  cuentaSenales: {
    preguntaPorDefecto: '¿Cuánto cuentas?',
    buscandoGps: 'Buscando tu posición GPS…',
    miraAlrededor: 'Mira alrededor y responde con un número.',
    titulo: '🔢 Cuenta las señales',
    acercate: 'Acércate al punto real',
    zona: (distancia: string, metros: number) => `${distancia} · zona de ${metros} m`,
    altPista: 'Pista',
    penalizacionAcumulada: (segundos: number) => ` · penalización acumulada: ${segundos}s`,
    borrar: 'Borrar',
    comprobando: 'Comprobando…',
    registrando: 'Registrando…',
    responder: '✅ Responder',
    teQuedasCorto: 'Pista: te quedas corto, hay más.',
    bienSiguiente: (n: number, total: number) => `¡Bien! Ahora la pregunta ${n} de ${total}.`,
    preguntaDe: (n: number, total: number) => `Pregunta ${n} de ${total}`,
    tePasas: 'Pista: te pasas, hay menos.',
  },

  wordTrap: {
    titulo: '🧠 Trampa de palabras',
    leeConCalma: 'Lee con calma: hay opciones casi idénticas.',
    preparando: 'Preparando las preguntas trampa…',
  },

  spark: {
    hudSenales: 'SEÑALES',
    hudTiempo: '⏳ QUEDAN',
    hudEcos: 'ECOS',
    ariaSenal: 'Señal',
    ariaSenalFalsa: 'Señal falsa',
    titulo: 'Chispas',
    reglaAntes: 'Toca las chispas ',
    verdes: 'verdes',
    reglaEntre: '. Evita las ',
    rojas: 'rojas',
    reglaDespues: (segundos: number) =>
      `: son señales falsas. Cada roja y cada toque al aire suman ${segundos}s.`,
    objetivo: (aciertos: number, segundos: number) => `${aciertos} señales en ${segundos}s`,
    comenzar: 'Comenzar',
    recuperada: '✅ Señal recuperada',
    aciertosAntes: 'Aciertos: ',
    aciertosDespues: (toques: number) => `/${toques} toques.`,
    falsasAntes: (n: number) => `${n} ${n === 1 ? 'señal falsa' : 'señales falsas'}: `,
    falsasDespues: ' a tu tiempo.',
    sinFallos: 'Ni un solo fallo. Sin penalización.',
    tiempo: (segundos: string) => `Tiempo: ${segundos}s`,
    filaCazadas: 'Señales cazadas',
    filaFalsas: 'Falsas tocadas',
    filaPenalizacion: 'Penalización',
    ninguna: 'ninguna',
    guardando: 'Guardando…',
    continuar: 'Continuar',
    leeElResultado: 'Lee el resultado…',
    tiempoAgotado: '⏱ Tiempo agotado',
    llegaste: (aciertos: number, total: number) =>
      `Llegaste a ${aciertos} de ${total} señales. Inténtalo otra vez.`,
    reintentar: 'Reintentar',
  },
}

export type Textos = typeof es

const gl: Textos = {
  juego: {
    cargando: 'Cargando xogo…',
    guardando: 'Gardando…',
    avanzando: 'Avanzando…',
    continuar: 'Continuar',
    continuarSiguienteNodo: 'Continuar ao seguinte nodo',
    reintentar: 'Reintentar',
  },

  hoja: {
    cerrar: 'PECHAR',
    cerrarJuego: 'Pechar o xogo',
    verHistoriaDelNodo: 'Ver a historia do nodo',
    verHistoria: 'Ver historia',
    historia: 'Historia',
    guardando: 'Gardando...',
    recogerObjeto: '🎒 RECOLLER OBXECTO',
    objetoDeMision: 'Obxecto de misión',
    coleccionable:
      'Atopaches un obxecto coleccionable neste lugar! Preme o botón de abaixo para recollelo e gardalo na túa mochila.',
    sinJuego:
      'Este nodo aínda non ten un xogo configurado. O administrador debe asignarlle un tipo de minixogo.',
    respaldoAbrir: 'Atascado? Escribe o código de respaldo · +2 min',
    respaldoOcultar: 'Agochar o código de respaldo',
    respaldoPlaceholder: 'Escribe o código...',
    respaldoValidar: 'Validar (+2m)',
    envioFallido: 'Non se puido gardar o teu avance. Revisa o aviso e volve tentalo.',
    juegoRoto: 'Este reto non se puido amosar. Tentao de novo ou usa o código de respaldo de abaixo.',
    reintentarEnvio: 'Reintentar',
  },

  antiTrampas: {
    salioApp: (segundos: number) =>
      `Saíches da aplicación durante o reto: comeza de novo e súmanse ${segundos} s.`,
    selectorApps: (segundos: number) =>
      `Abriches o selector de apps durante o reto: comeza de novo e súmanse ${segundos} s.`,
  },

  tilt: {
    sensorInicial: 'Botóns táctiles dispoñibles',
    salioAMediaPartida: 'Saíches a media partida: perdiches o intento.',
    pared: 'Parede. Busca outra dirección.',
    objetoRecogido: 'Obxecto recollido.',
    sinVidas: 'Perdiches todas as vidas.',
    cayoEnAgujero: 'Caíches nun burato. Volves ao inicio.',
    salidaCerrada: 'A saída está pechada. Recolle todos os obxectos.',
    seTerminoElTiempo: 'Rematou o tempo.',
    sensorCalibrado: 'Sensor calibrado',
    modoTactil: 'Modo táctil activo',
    calibrar: 'Mantén o móbil cómodo para calibrar',
    sensorNoDisponible: 'Sensor non dispoñible · usa botóns',
    botonesActivos: 'Botóns activos · sensor apagado',
    recalibrar: 'Mantén o móbil cómodo para recalibrar',
    bolaAlInicio: 'Bóla devolta ao inicio.',
    titulo: 'Labirinto de equilibrio',
    instrucciones: 'Inclina o móbil ou usa os botóns para chegar á saída.',
    leyenda: 'Recolle os obxectos ◆, evita os buratos × e chega á bandeira ⚑.',
    iniciar: 'Iniciar labirinto',
    superado: 'Labirinto superado',
    superadoDetalle: 'Recolliches todos os obxectos e chegaches á saída.',
    intentoTerminado: 'Intento rematado',
    volverAIntentarlo: 'Intentalo de novo',
    segundos: 'segundos',
    vidas: 'vidas',
    objetos: 'obxectos',
    todosLosObjetos: 'Todos os obxectos recollidos. Busca a saída.',
    inclinaSuavemente: 'Inclina suavemente o móbil ou usa os botóns.',
    arriba: 'Arriba',
    izquierda: 'Esquerda',
    abajo: 'Abaixo',
    derecha: 'Dereita',
    usarBotones: 'Non responde ao inclinar? Usar botóns (+1 min)',
    recalibrarBoton: 'Recalibrar',
    volverAlInicio: 'Volver ao inicio',
  },

  // 7/11: Simón ya no existe (es Eco rítmico); de sus textos sólo quedan los nombres de los colores, que usa Pulso.
  coloresDePulso: ['Verde', 'Vermello', 'Azul', 'Ámbar', 'Violeta', 'Cian'] as readonly string[],

  audio: {
    titulo: 'Reto de audio',
    instrucciones: 'Sopra ou fai ruído preto do micrófono para cargar a barra.',
    activar: 'Activar micrófono',
    sinMicrofono: 'Non se puido acceder ao micrófono. Asegúrate de dar os permisos.',
  },

  pulso: {
    kicker: 'PULSO DE FERRO',
    tituloPorDefecto: 'Pulso de ferro',
    instrucciones:
      'Suxeita o móbil o máis quieto posible cunha man. Coa outra, repite a secuencia de cores -crece cada rolda-. Moverte de máis reinicia a rolda actual, non a partida.',
    empezar: '▶ Comezar',
    jugarSinSensor: 'Xogar sen sensor de movemento (+1 min)',
    fallarCuesta: 'Cada fallo da secuencia suma 5 s.',
    penalizacion: (s: number) => `Fallos: +${s} s`,
    reinicios: (n: number) => `Reinicios por movemento: ${n}`,
    rondaSuperada: (ronda: number) => `Rolda ${ronda} superada!`,
    sinSensor: 'Sensor de movemento non dispoñible.',
    modoTactil: 'Modo táctil',
    sinSensorUsaTactil: 'Sensor non dispoñible: úsase o modo táctil.',
  },

  checkpoint: {
    puntoDeControl: '📍 Nodo',
    distancia: (metros: number) => `Distancia ao punto · zona de ${metros} m`,
    sinCoordenadas: 'Este punto non ten coordenadas. Podes continuar.',
    informativo: 'Punto informativo. Le o texto e continúa.',
    buscandoGps: 'Buscando a túa posición GPS…',
    sinPermiso: 'Sen permiso de ubicación: non podemos comprobar que chegaches.',
    sinGps: 'Este navegador non permite GPS: non podemos comprobar que chegaches.',
    sinGpsCuesta: (coste: string) => `Podes continuar, pero suma ${coste} ao teu tempo, como o código de emerxencia.`,
    heLlegadoSinGps: (extra: string) => `✅ Cheguei sen GPS · ${extra}`,
    llegaste: 'Chegaches ao punto de control!',
    acercate: 'Achégate ao punto marcado no mapa.',
    registrando: 'Rexistrando…',
    heLlegado: '✅ Cheguei · Continuar',
    acercateBoton: '🚶 Achégate para continuar',
    gpsFalla: 'Se o GPS falla, pídelle ao monitor o código de emerxencia do nodo.',
  },

  motion: {
    titulo: 'Dinamo',
    brief: 'Baliza sen sinal. Cárgaa con pulsos para abrir o seguinte treito.',
    interaccion: 'Interacción',
    listo: 'Preme iniciar. Quieto non carga.',
    completado: 'Nodo completado. Preme continuar.',
    sobrecarga: 'Sobrecarga. Preme máis suave.',
    demasiadoFuerte: 'Demasiado forte. Carga pouco.',
    pulsoValido: 'Pulso válido.',
    toqueValido: 'Toque válido.',
    sensorNoDisponibleTactil: 'Sensor non dispoñible. Usa o táctil.',
    sensorNoDisponible: 'Sensor non dispoñible.',
    mueveElMovil: 'Move o móbil con golpes curtos e separados.',
    modoTactilToca: 'Modo táctil. Toca co ritmo.',
    muySeguido: 'Moi seguido. Separa os pulsos.',
    tiempoAgotado: 'Tempo esgotado. Faltaron pulsos válidos.',
    estadoCompletado: 'Nodo completado',
    estadoFallida: 'Carga fallida',
    estadoTactil: 'Modo táctil',
    estadoCargando: 'Cargando',
    estadoSinSensor: 'Sensor non dispoñible',
    estadoPreparado: 'Preparado',
    carga: 'Carga',
    calor: 'Calor',
    pulsosValidos: 'Pulsos válidos',
    reglaCortos: 'Pulsos curtos',
    reglaCortosDetalle: 'Golpes breves.',
    reglaMedioSegundo: 'Medio segundo',
    reglaMedioSegundoDetalle: 'Pausa entre pulsos.',
    reglaQuieto: 'Quieto non carga',
    reglaQuietoDetalle: 'Non hai enerxía.',
    iniciar: 'Iniciar',
    reintentar: 'Reintentar',
    reiniciar: 'Reiniciar',
    tocar: 'Tocar',
    tactil: 'Táctil',
  },

  circuit: {
    aria: 'Matriz de circuítos',
    patronNoDisponible: 'Patrón fixo non dispoñible',
    patronRoto: 'O patrón gardado está incompleto ou contén saltos. Corríxeo no administrador.',
    completado: 'Nodo completado',
    exitoConFallos: (n: number) =>
      `A corrente volve ao seu camiño. ${n} ${n === 1 ? 'fallo' : 'fallos'}: +${n * 5}s ao teu tempo.`,
    exitoLimpio: 'A corrente volve ao seu camiño, e sen un só fallo.',
    bloqueada: 'Matriz bloqueada',
    bloqueadaDetalle: 'Queimaches demasiadas celas. Reinicia e memoriza mellor a secuencia.',
    memoriza: 'Memoriza',
    tuTurno: 'Repite o trazado',
    alReves: 'Ao revés: do último ao primeiro',
    preparado: 'Preparado',
    fijate: 'Fíxate no trazado. Ao final quédase enteiro un momento.',
    marca: (quedan: number) =>
      `Marca as casas do trazado, na orde que queiras. ${quedan === 1 ? 'Quédache 1 intento' : `Quédanche ${quedan} intentos`}.`,
    marcaAlReves: (quedan: number) =>
      `Marca as casas ao revés, da última á primeira. ${quedan === 1 ? 'Quédache 1 intento' : `Quédanche ${quedan} intentos`}.`,
    cuentaAtras: (n: number) => `Mira a matriz: a secuencia comeza en ${n}…`,
    tienes: (n: number) => (n === 1 ? 'Tes 1 intento.' : `Tes ${n} intentos.`),
    celda: (fila: number, columna: number) => `Cela ${fila}, ${columna}`,
    reiniciar: 'Reiniciar',
    empezarYa: (n: number) => `Comezar xa (${n})`,
    empezar: 'Comezar',
  },

  mosaic: {
    piezaSeleccionada: 'Peza seleccionada. Toca outra para intercambialas.',
    noCoincide: 'Non coincide. Observa o lugar real e proba outra resposta.',
    noConfigurado: 'Mosaico non configurado',
    noConfiguradoDetalle: 'O administrador debe subir unha fotografía válida e revisar a pregunta final.',
    ariaMosaico: 'Mosaico do lugar',
    ariaVistaPrevia: 'Vista previa do mosaico',
    ariaImagenCompletada: 'Imaxe completada',
    ariaMosaicoCompletado: 'Mosaico completado',
    ariaMosaicoNoCompletado: 'Mosaico non completado',
    ariaPregunta: 'Pregunta final do mosaico',
    observaElLugar: 'Observa o lugar',
    memorizaLaFoto: 'Memoriza a fotografía antes de que se converta en pezas.',
    altFotoLugar: 'Fotografía do lugar',
    altFotoCompletada: 'Fotografía completada',
    referenciaRapida: 'Referencia rápida',
    memoriza: 'Memoriza',
    detalleRapido: 'Comproba un detalle antes de volver ao mosaico.',
    observaConCalma: 'Observa con calma as formas, as cores e os detalles principais.',
    volverAlMosaico: 'Volver ao mosaico',
    empezarAhora: 'Comezar agora',
    imagenCompletada: 'Imaxe completada',
    todasColocadas: 'Todas as pezas están correctamente colocadas.',
    completado: 'Completado',
    quedaComprobacion: 'Queda unha comprobación',
    observaElElemento: 'Observa agora o elemento real antes de responder.',
    retoCompletado: 'Reto completado',
    yaPuedesContinuar: 'Xa podes continuar ao seguinte punto da ruta.',
    ahoraResponde: 'Agora responde a esta pregunta',
    lugarVerificado: 'Lugar verificado',
    lugarVerificadoDetalle: 'A imaxe e a comprobación final son correctas. Podes continuar a ruta.',
    sinMovimientos: 'Sen movementos',
    sinMovimientosDetalle: 'Esgotouse o límite configurado. Observa de novo o lugar e volve tentalo.',
    intentarDeNuevo: 'Intentalo de novo',
    preguntaAyuda: 'Observa o elemento real e escolle a resposta correcta.',
    preguntaSelecciona: 'Selecciona a resposta que poidas comprobar no punto onde estás.',
    comprobar: 'Comprobar resposta',
    descripcionPorDefecto: 'Reconstrúe a fotografía observando o lugar real.',
    reconstruye: 'Reconstrúe o lugar',
    movimientos: 'movementos',
    restantes: 'restantes',
    ariaPiezaSeleccionada: (n: number) => `Peza ${n} seleccionada`,
    ariaSeleccionarPieza: (n: number) => `Seleccionar peza ${n}`,
    tocaUnaPieza: 'Toca unha peza',
    ahoraTocaOtra: 'Agora toca outra',
    paraSeleccionarla: 'para seleccionala.',
    paraIntercambiarlas: 'para intercambialas.',
    tocalaOtraVezParaGirar: 'Tócaa outra vez para xirala.',
    ariaProgreso: (bien: number, total: number) => `${bien} de ${total} pezas ben colocadas`,
    piezasBien: 'Pezas ben colocadas',
    mezclar: 'Mesturar de novo',
    costeSegundos: (s: number) => ` · +${s} s`,
    penalizacionTotal: (s: number) => `Penalización desta proba: +${s} s`,
    soltarPieza: 'Soltar a peza',
    demoGirar: 'Toca unha peza dúas veces para xirala; «Soltar a peza» déixaa onde está.',
    verReferencia: 'Ver referencia · 1,4 s',
  },

  bearing: {
    activaOrientacion: 'Activa a orientación',
    sensorBloqueado: 'Sensor bloqueado',
    buscandoHeading: 'Buscando rumbo',
    mantenEstable: 'Mantén estable',
    cercaDelVector: 'Preto do vector',
    giraHaciaElVector: 'Xira cara ao vector',
    rumboCapturado: 'Rumbo capturado',
    etiquetaFijado: 'FIXADO',
    etiquetaListo: 'LISTO',
    etiquetaBuscando: 'BUSCANDO',
    etiquetaAguanta: 'AGUANTA',
    derecha: 'DTA',
    izquierda: 'ESQ',
    cabecera: 'Fixar rumbo',
    necesitaToque: 'Safari en iPhone precisa un toque para activar a orientación real.',
    solicitando: 'Solicitando acceso ao sensor.',
    buscando: 'Sensor activo. Agardando a primeira lectura estable.',
    activa: 'Orientación real activa.',
    silencioso: 'Non chega o rumbo. Podes usar a proba manual discreta.',
    denegado: 'Permiso denegado. Revisa movemento/orientación en Safari.',
    noSoportado: 'Este navegador non expón DeviceOrientation.',
    sinHttps: 'Abre o runtime desde HTTPS para usar sensores reais.',
    preparando: 'Preparando o instrumento.',
    activarSensor: 'Activar sensor',
    pruebaManual: 'Proba manual',
  },

  teamRelay: {
    titulo: 'Relevo de equipo',
    juntos: (nombres: string, cuantos: number) =>
      `${nombres} está${cuantos === 1 ? '' : 'n'} aquí contigo.`,
    esperando: 'Agardando a que chegue alguén máis do equipo a este punto...',
    companerosAqui: 'Xogadores aquí (contigo):',
    registrando: 'Rexistrando...',
    mantenPresionado: 'Mantén premido...',
    validar: 'Validar relevo',
    esperandoEquipo: 'Agardando polo equipo',
    sinRed:
      'Este reto precisa cobertura: o móbil ten que ver onde están os teus compañeiros. Se non a hai, usa o código de reserva.',
  },

  cuentaSenales: {
    preguntaPorDefecto: 'Cantas contas?',
    buscandoGps: 'Buscando a túa posición GPS…',
    miraAlrededor: 'Mira ao teu redor e responde cun número.',
    titulo: '🔢 Conta as sinais',
    acercate: 'Achégate ao punto real',
    zona: (distancia: string, metros: number) => `${distancia} · zona de ${metros} m`,
    altPista: 'Pista',
    penalizacionAcumulada: (segundos: number) => ` · penalización acumulada: ${segundos}s`,
    borrar: 'Borrar',
    comprobando: 'Comprobando…',
    registrando: 'Rexistrando…',
    responder: '✅ Responder',
    teQuedasCorto: 'Pista: quédaste curto, hai máis.',
    bienSiguiente: (n: number, total: number) => `Ben! Agora a pregunta ${n} de ${total}.`,
    preguntaDe: (n: number, total: number) => `Pregunta ${n} de ${total}`,
    tePasas: 'Pista: pásaste, hai menos.',
  },

  wordTrap: {
    titulo: '🧠 Trampa de palabras',
    leeConCalma: 'Le con calma: hai opcións case idénticas.',
    preparando: 'Preparando as preguntas trampa…',
  },

  spark: {
    hudSenales: 'SINAIS',
    hudTiempo: '⏳ QUEDAN',
    hudEcos: 'ECOS',
    ariaSenal: 'Sinal',
    ariaSenalFalsa: 'Sinal falsa',
    titulo: 'Chispas',
    reglaAntes: 'Toca as chispas ',
    verdes: 'verdes',
    reglaEntre: '. Evita as ',
    rojas: 'vermellas',
    reglaDespues: (segundos: number) =>
      `: son sinais falsas. Cada vermella e cada toque ao aire soman ${segundos}s.`,
    objetivo: (aciertos: number, segundos: number) => `${aciertos} sinais en ${segundos}s`,
    comenzar: 'Comezar',
    recuperada: '✅ Sinal recuperado',
    aciertosAntes: 'Acertos: ',
    aciertosDespues: (toques: number) => `/${toques} toques.`,
    falsasAntes: (n: number) => `${n} ${n === 1 ? 'sinal falsa' : 'sinais falsas'}: `,
    falsasDespues: ' ao teu tempo.',
    sinFallos: 'Sen un só fallo. Sen penalización.',
    tiempo: (segundos: string) => `Tempo: ${segundos}s`,
    filaCazadas: 'Sinais cazadas',
    filaFalsas: 'Falsas tocadas',
    filaPenalizacion: 'Penalización',
    ninguna: 'ningunha',
    guardando: 'Gardando…',
    continuar: 'Continuar',
    leeElResultado: 'Le o resultado…',
    tiempoAgotado: '⏱ Tempo esgotado',
    llegaste: (aciertos: number, total: number) =>
      `Chegaches a ${aciertos} de ${total} sinais. Próbao outra vez.`,
    reintentar: 'Reintentar',
  },
}

const TEXTOS: Record<Locale, Textos> = { es, gl }

/** Los textos de un idioma. Un idioma desconocido cae en castellano. */
export function textosDe(locale: string | null | undefined): Textos {
  return TEXTOS[(locale as Locale) in TEXTOS ? (locale as Locale) : 'es']
}

/** Para los tests y para quien necesite recorrerlos todos. */
export const TEXTOS_DEL_JUGADOR: Readonly<Record<Locale, Textos>> = TEXTOS

export type ClaveDeJuego =
  | 'mosaico'
  | 'trampa'
  | 'cuenta'
  | 'control'
  | 'pulso'
  | 'laberinto'
  | 'dinamo'
  | 'chispas'
  | 'eco'
  | 'matriz'
  | 'rumbo'
  | 'caza_rumbo'
  | 'mastermind'
  | 'balanza'
  | 'interrogatorio'
  | 'mapa_mudo'
  | 'relevo'
  | 'audio'
  | 'qr'
  | 'coleccionable'

/**
 * El nombre de cada juego (el del catálogo, shared/game_registry.json) y su regla en UNA frase.
 *
 * 7/11: un solo sitio. Lo lee la Guía (ficha del «?», línea «Ahora» mientras se juega y «Guía paso a paso»): antes
 * guia.ts tenía su propia copia y se desincronizaba (la de Dinamo seguía hablando de pulsos cada medio segundo).
 */
export const JUEGOS_EN_UNA_LINEA: Record<ClaveDeJuego, Record<Locale, [string, string]>> = {
  mosaico: {
    es: [
      'Mosaico del lugar',
      'Memoriza la foto antes de que se haga piezas; luego colócalas y responde lo que ves en el sitio.',
    ],
    gl: [
      'Mosaico do lugar',
      'Memoriza a foto antes de que se faga pezas; logo colócaas e responde o que ves no sitio.',
    ],
  },
  trampa: {
    es: ['Trampa de palabras', 'Lee con calma: hay opciones casi idénticas. Elige la buena.'],
    gl: ['Trampa de palabras', 'Le con calma: hai opcións case idénticas. Escolle a boa.'],
  },
  cuenta: {
    es: ['Cuenta las señales', 'Mira alrededor en el punto real y responde con un número.'],
    gl: ['Conta os sinais', 'Mira arredor no punto real e responde cun número.'],
  },
  control: {
    es: ['Punto de control', 'Llegar basta: dentro del radio, confírmalo y sigue.'],
    gl: ['Punto de control', 'Chegar abonda: dentro do radio, confírmao e segue.'],
  },
  pulso: {
    es: [
      'Pulso de hierro',
      'Sujeta el móvil quieto con una mano y repite con la otra la secuencia de colores.',
    ],
    gl: [
      'Pulso de ferro',
      'Suxeita o móbil quieto cunha man e repite coa outra a secuencia de cores.',
    ],
  },
  laberinto: {
    es: [
      'Laberinto de equilibrio',
      'Inclina el móvil o usa los botones: recoge ◆, evita × y llega a ⚑.',
    ],
    gl: [
      'Labirinto de equilibrio',
      'Inclina o móbil ou usa os botóns: recolle ◆, evita × e chega a ⚑.',
    ],
  },
  dinamo: {
    es: ['Dinamo', 'Cada fase pide un ritmo (lento, rápido, lento): agita el móvil para tener la aguja en la zona verde.'],
    gl: ['Dinamo', 'Cada fase pide un ritmo (lento, rápido, lento): axita o móbil para ter a agulla na zona verde.'],
  },
  chispas: {
    es: ['Chispas', 'Toca las chispas verdes y evita las rojas: cada roja suma tiempo.'],
    gl: ['Chispas', 'Toca as chispas verdes e evita as vermellas: cada vermella suma tempo.'],
  },
  eco: {
    es: ['Eco rítmico', 'Mira (y escucha) los golpes y repítelos en el mismo orden y ritmo.'],
    gl: ['Eco rítmico', 'Mira (e escoita) os golpes e repíteos na mesma orde e ritmo.'],
  },
  matriz: {
    es: [
      'Matriz de circuitos',
      'Fíjate en el trazado que se enciende y márcalo después; a veces, al revés. Cada fallo suma 5 s.',
    ],
    gl: [
      'Matriz de circuítos',
      'Fíxate no trazado que se acende e márcao despois; ás veces, ao revés. Cada fallo suma 5 s.',
    ],
  },
  rumbo: {
    es: ['Faros', 'Gira con el móvil y enciende los faros: mantén el haz sobre cada uno y evita las luces rojas.'],
    gl: ['Faros', 'Xira co móbil e acende os faros: mantén o feixe sobre cada un e evita as luces vermellas.'],
  },
  caza_rumbo: {
    es: ['Caza de rumbo', 'Gira despacio con el móvil hasta apuntar al rumbo y aguanta quieto.'],
    gl: ['Caza de rumbo', 'Xira amodo co móbil ata apuntar ao rumbo e aguanta quieto.'],
  },
  mastermind: {
    es: [
      'Mastermind',
      'Adivina el código: cada intento dice cuántos están bien colocados y cuántos en otro sitio.',
    ],
    gl: [
      'Mastermind',
      'Adiviña o código: cada intento di cantos están ben colocados e cantos noutro sitio.',
    ],
  },
  balanza: {
    es: ['Balanza', 'Una bola pesa más que las demás: encuéntrala con las pesadas que tienes.'],
    gl: ['Balanza', 'Unha bóla pesa máis cás demais: atópaa coas pesadas que tes.'],
  },
  interrogatorio: {
    es: [
      'Interrogatorio',
      'Los sospechosos hablan, pero no todos dicen la verdad: razona quién tiene la llave.',
    ],
    gl: [
      'Interrogatorio',
      'Os sospeitosos falan, pero non todos din a verdade: razoa quen ten a chave.',
    ],
  },
  mapa_mudo: {
    es: ['Mapa mudo', 'No hay punto en el mapa: sigue la pista y busca dentro de la zona.'],
    gl: ['Mapa mudo', 'Non hai punto no mapa: segue a pista e busca dentro da zona.'],
  },
  relevo: {
    es: [
      'Relevo de equipo',
      'Tenéis que estar dos o más del equipo en el mismo punto; luego, validad el relevo. Necesita cobertura.',
    ],
    gl: [
      'Relevo de equipo',
      'Tedes que estar dous ou máis do equipo no mesmo punto; logo, validade o relevo. Precisa cobertura.',
    ],
  },
  audio: {
    es: ['Desafío de audio', 'Sopla o haz ruido cerca del micrófono para cargar la barra.'],
    gl: ['Desafío de audio', 'Sopra ou fai ruído preto do micrófono para cargar a barra.'],
  },
  qr: {
    es: ['Pegatina QR', 'Busca la pegatina QR en el sitio y escanéala.'],
    gl: ['Pegatina QR', 'Busca a pegatina QR no sitio e escanéaa.'],
  },
  coleccionable: {
    es: ['Objeto para recoger', 'Se recoge con un toque y va a tu mochila. No suma tiempo.'],
    gl: ['Obxecto para recoller', 'Recóllese cun toque e vai á túa mochila. Non suma tempo.'],
  },
}
