# SAGA Engine v3.9.1 — Offline timers and UI Glassmorphism feedback

SAGA Engine v3.9.1 implementa el nuevo diseño visual unificado Glassmorphism y refactoriza la gestión del tiempo y controles de administrador.

## Diseño Visual (Glassmorphism)
- Aplicado el diseño de cristales translúcidos (Glassmorphism) a todas las interfaces.
- Interfaz flotante de "RESONANCIA COMPLETA" mostrada al superar los nodos interactivos.
- Reloj flotante permanente en el encabezado general (PlayerShell) mostrando el tiempo de juego acumulado.

## Refactorización del Cronómetro y Modo Offline
- El backend ya no suma ciegamente los deltas de tiempo. El cliente cuenta el tiempo activo real (se inicia solo cuando el nodo es jugable).
- En el modo Offline, el tiempo empleado (`time_spent_ms`) se guarda en la IndexedDB local y se envía al recuperar la conexión, garantizando que el ranking es milimétricamente preciso sin importar la cobertura.

## Herramientas de Administración
- Añadido un botón **"Restaurar Nodo"** en el panel React de jugadores, permitiendo a los administradores bajar 1 nivel a un jugador y eliminar el tiempo empleado asociado para ese reto específico.
- Al usar el avance manual de administrador (+1 nodo) o el "Código de respaldo" para saltar nodos, el sistema aplica automáticamente una penalización fija de 5 minutos al tiempo del jugador.
