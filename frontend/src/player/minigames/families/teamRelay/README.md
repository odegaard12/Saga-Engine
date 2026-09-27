# teamRelay — prototipo huérfano, sin conectar

Esta carpeta contiene solo `RuntimeScreen.tsx`. No tiene `definition.ts` ni
ningún tipo de backend asociado, y no está importada en
`frontend/src/player/minigames/core/resolver.ts`
(`isNativeMinigameFamily` no la reconoce). No forma parte de los 10 tipos de
minijuego soportados hoy.

Detalle completo: `docs/gameplay/minigames-and-physical-interactions-audit.md`
(sección "families/teamRelay/").

No se borra este código porque puede servir de punto de partida (relevo de
equipo: dos o más jugadores juntos en el mismo punto), pero no se debe
cablear tal cual: hace falta `definition.ts`, un tipo de backend, y probarlo
antes de exponerlo a jugadores reales.
