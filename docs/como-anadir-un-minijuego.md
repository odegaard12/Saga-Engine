# Cómo añadir un minijuego

Los metadatos de cada juego viven en **un solo sitio**: `shared/game_registry.json`.
Lo leen el servidor (`backend/app/runtime/game_registry.py`) y el admin
(`frontend/src/shared/gameRegistry.ts`). De ahí salen el catálogo del admin, las
familias de presentación, los tipos soportados, los alias de tipo viejo, el suelo
del antitrampas, los editores propios y las claves guiadas. No hay que tocar
`gameCatalog.ts`, `displayFamilies.ts`, `familyConfigs.ts`, `guidedEditorUtils.ts`,
ni las listas de `admin.py` / `minigames.py` / `core_engine.py`.

## Los 4 pasos

1. **Entrada en el registro** (`games[]` de `shared/game_registry.json`). Copia la
   de un juego parecido y cambia:
   - `id` (= `game_id`), `family` (familia técnica: `signal_hunt`, `bearing_hunt`,
     `circuit_matrix`, `motion_challenge`, `audio_challenge`, `word_trap`) y
     `display_family` (`llegar_y_escanear`, `puzles`, `movimiento`, `orientacion`,
     `sonido`, `desafio`).
   - Ficha del admin: `title`, `icon`, `category`, `difficulty`, `duration`,
     `runtime_status`, `offline_status`, `completion_method`, textos y `messages`.
   - `default_config`: lo que el admin escribe al elegir el juego (con `game_id`).
   - `config_keys`: **todas** las claves de config del juego (lo que declara el
     registro, más lo que lee el servidor). Sirve para descartar restos de otro
     juego de la misma familia; las claves que nadie declara se conservan.
   - `node_kind` (`minijuego`, `checkpoint`, `qr`, `mapa_mudo`): tiene que coincidir con
     lo que devuelve `kind_del_nodo`.
   - Opcionales: `custom_editor` + `hide_guided_keys` (editor propio),
     `extra_guided_keys` (campos planos para el editor genérico), `hard_floor`
     (suelo del antitrampas, ver paso 4), `qr_kind`, `display_note`.
   - Si el juego es de una **familia técnica nueva**: añádela a `families`,
     `family_card_order` y `supported_types`, y su `display_fallback`.

2. **Pantalla de juego** en el móvil: el componente en
   `frontend/src/player/minigames/families/...` y su montaje en `resolver.ts` /
   `FamilyRuntimeHost.tsx` (esto es código, no datos).

3. **Editor propio (opcional).** Si son números planos, no hace falta: pon
   `extra_guided_keys`. Si son listas (preguntas, objetivos...), crea el editor,
   márcalo con `"custom_editor": true, "hide_guided_keys": true` y añade UNA línea a
   `CUSTOM_EDITOR_COMPONENTS` en `AdminGameEditor.tsx`. Si el juego guarda campos
   con formato propio (recortes, rangos), añade su rama en
   `_normalizeAdminConfigForFamilyRaw` (`familyConfigs.ts`); si basta con
   guardarlos tal cual, no hace falta: el admin conserva las claves que no conoce.

4. **Servidor.** Su rama en `_normalize_minigame_config_raw` /
   `normalize_minigame_config` (`minigames.py`), la proyección por jugador si hay
   respuestas que no deben viajar en claro (`mision.py`, ver `cuenta_senales`), y,
   si tiene suelo propio, una estrategia en `_ESTRATEGIAS_DE_SUELO`
   (`anti_cheat.py`) referida desde `hard_floor` en el registro.

## Comprobaciones

`python -m pytest -q -o "addopts=" tests/test_registro_de_minijuegos.py` recorre el
registro y comprueba cada capa por comportamiento: familia igual en servidor y admin,
normalizador del servidor idempotente, catálogo del admin, `kind` del nodo, alias de
tipo, suelo del antitrampas y, sobre todo, que **guardar en el admin no pierde
ninguna clave** de `default_config`. Si tu juego falla ahí, falta algo en el
registro o en el normalizador del servidor.

Después: `cd frontend && npx tsc -b && npm run build`.

## Trampas conocidas

- Los ids no se renombran ni cambian de familia: hay nodos guardados con ellos.
- El orden de `games[]` es el orden del catálogo y el fallback de
  `getAdminGameForStage`: añade los juegos al final.
- El registro viaja en la imagen Docker (`/app/shared`) y el frontend lo importa
  al compilar: el `Dockerfile` copia `shared/` en las dos etapas.
- No hay nombres en gallego en el registro: los textos de la ficha del admin son en
  español; las cadenas es/gl del juego para el jugador siguen en `i18n/index.ts`.
