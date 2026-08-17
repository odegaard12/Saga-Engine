# Changelog

Lo que cambia en cada versión y por qué. Las entradas nuevas van arriba.

La versión que corre en producción está en `VERSION` y la sirve `/api/version`.

---

## 4.0.0 — en curso

Reconstrucción posterior a la primera ruta de campo real («O Eco do Vixía»,
Cotorredondo). El motor aguantó y la gente terminó; lo que no aguantó fue la
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
