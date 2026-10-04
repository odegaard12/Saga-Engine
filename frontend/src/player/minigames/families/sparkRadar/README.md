# sparkRadar — Caza-Señales

Conectado. Es un `game_id` (`spark_radar`) dentro de la familia técnica
`circuit_matrix`, no una familia propia: por eso no tiene `definition.ts`. Lo
monta `core/FamilyRuntimeHost.tsx` cuando `config.game_id === 'spark_radar'`
(y `precargarJuego` baja su paquete), y está dado de alta en
`shared/game_registry.json` (estado `runtime_partial`, funciona sin conexión).

- `RuntimeScreen.tsx`: la pantalla y la lógica del juego.
- La configuración la normaliza el servidor en
  `backend/app/runtime/minigames.py` (rama `spark_radar` de `circuit_matrix`),
  con topes para que el panel no pueda dejar un reto injugable.
