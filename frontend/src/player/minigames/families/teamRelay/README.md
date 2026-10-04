# teamRelay — Relevo de equipo

Conectado. Es un `game_id` (`team_relay`) dentro de la familia técnica
`signal_hunt`, no una familia propia: por eso no tiene `definition.ts` ni
entrada propia en `core/resolver.ts`. Lo monta `core/FamilyRuntimeHost.tsx`
cuando `config.game_id === 'team_relay'`, y está dado de alta en
`shared/game_registry.json` (estado `runtime_partial`).

- `RuntimeScreen.tsx`: la pantalla. Lee la posición del grupo de
  `usePlayerStore().teamProfiles` (lo trae el latido) y cuenta a los
  compañeros en directo (`presence === 'live'`) dentro del radio del nodo.
  Se confirma manteniendo pulsado 1,5 s.
- `presencia.ts`: la cuenta. `required_members` es el TOTAL de jugadores en
  el punto **contando a quien juega** (2 = él y un compañero; mínimo 2, máximo
  20; por defecto 2). El servidor lo recorta igual (`minigames.py`).

Necesita cobertura de todos a la vez: sin latido no se ve a los demás.
