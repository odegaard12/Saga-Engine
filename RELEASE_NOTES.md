# SAGA Engine v3.9.3 — Correcciones criticas de timer e infraestructura de build

SAGA Engine v3.9.3 corrige el bug del cronometro que mostraba tiempos residuales de sesiones anteriores, añade un panel de version con timestamp de despliegue en el panel de administracion, y refina la prioridad de variables de entorno en el contenedor Docker.

## Bug Correcciones

### Timer de nodo (InteractionSheet) — Re-render infinito eliminado
- **Bug:** El useEffect del cronometro de nodo individual tenia ctiveMs en su array de dependencias. Esto hacia que el efecto se re-ejecutara cada 100 ms, cancelando y reiniciando el setTimeout de 300 ms antes de que pudiera arrancar — el timer nunca contaba bien.
- **Fix:** Introducido 	imerStartRef para almacenar el instante de inicio. Eliminado ctiveMs de las dependencias del efecto. El cronometro ahora arranca exactamente 300 ms despues de abrir el minijuego y cuenta sin interrupciones.

### Timer global — Limpieza completa al resetear perfil
- eset_profile ahora llama explicitamente a clear_all_player_timers() antes de volver el nivel a 0, eliminando cualquier tiempo acumulado de sesiones anteriores. Corrige el escenario donde el marcador mostraba 65:00 al empezar en el nodo 0.
- ecord_player_stage_time usa max(existing, new) en lugar de acumulacion directa, evitando inflacion infinita del tiempo al reintentar un nodo.

### Badge de version y timestamp de despliegue
- BuildInfoBadge en el panel de admin muestra la version y la hora del ultimo despliegue, con auto-refresco cada 5 minutos.
- deploy_src.py inyecta SAGA_VERSION y SAGA_BUILD_TIME en el archivo .saga_build_env dentro del contenedor en cada despliegue.
- .saga_build_env tiene prioridad sobre las variables de entorno cacheadas del contenedor Docker.

---

# SAGA Engine v3.9.2 — Sincronizacion de timer, radio offline y limpieza de tests

## Cambios

### Mapa offline — Radio de precarga optimizado
- mapTileCache.ts: ajustado el radio de descarga de tiles para centrarse en la ruta activa.
- Descarga prioriza el nodo actual y los dos siguientes, el resto en segundo plano.

### Nodos — Radio de proximidad actualizado
- RankingSheet.tsx: correccion de ordenamiento por nivel + tiempo.
- Radios de proximidad mas permisivos para GPS de precision media.

### Scripts de test rotos eliminados
- Eliminados 	est_save.py y 	est_save2.py que dependian de rutas absolutas /app/data/stages.json inexistentes en entorno local, causando FileNotFoundError en pytest.

---

# SAGA Engine v3.9.1 — Auto-sync SQLite, timer offline y controles de administrador

## Cambios

### Backend — Auto-sync SQLite
- Migracion automatica de progreso de jugadores a SQLite con fallback a JSON.
- Resueltos conflictos de escritura concurrente en entornos multi-worker.
- Lectura y escritura de stages ahora atomica en untime_store.py.

### Timer offline
- El cliente cuenta el tiempo activo real del nodo.
- 	ime_spent_ms se persiste en IndexedDB y se sincroniza al recuperar la conexion.
- El backend ya no suma deltas acumulados.

### Panel de administracion
- Nuevo boton **Restaurar Nodo**: baja 1 nivel y elimina el tiempo del nodo restaurado.
- Avance manual (+1 nodo) y uso de codigo de respaldo aplican penalizacion de 5 minutos.
- PlayersPanel muestra nivel, tiempo acumulado y presencia en tiempo real.
