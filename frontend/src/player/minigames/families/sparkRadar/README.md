# sparkRadar — sin conectar

Esta carpeta contiene solo `RuntimeScreen.tsx`. Le falta `definition.ts` (y el
resto de piezas que sí tienen las 5 familias activas: `bearingHunt`,
`circuitMatrix`, `signalHunt`, `motionChallenge`, `audioChallenge`).

No está importada en `frontend/src/player/minigames/core/resolver.ts`
(`isNativeMinigameFamily` no la reconoce), así que ningún nodo puede
resolver a este minijuego. El tipo de backend `spark_radar` no tiene alias
en `core_engine.py` y cae en `signal_hunt` genérico.

Detalle completo: `docs/gameplay/minigames-and-physical-interactions-audit.md`
(sección "spark_radar").

No se borra este código porque puede servir de punto de partida, pero no se
debe cablear tal cual: hace falta completar `definition.ts`, probarlo y dar
de alta el tipo en el backend antes de exponerlo a jugadores reales.
