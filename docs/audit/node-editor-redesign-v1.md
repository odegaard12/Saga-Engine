# #234 — Node editor redesign v1

Goal: make the node editor feel like a guided creation workspace instead of a dense technical form.

## Implemented in v1

CSS-only first pass:

- Wider editor drawer.
- Cleaner visual hierarchy in the node editor header.
- More readable tab/chip layout.
- Full labels instead of cramped truncation where possible.
- Card-like sections for editing blocks.
- Cleaner inputs, textareas and selects.
- QR physical editor topbar aligned with the same visual language.
- Mobile full-width editor with horizontal chips.

## Product direction

Games should feel like editable templates:

1. choose a game/template family;
2. SAGA creates a sensible editable base;
3. admin edits only the relevant fields;
4. advanced/danger actions should not be hidden in random tabs.

## Not included yet

- Deep JSX reorder of normal node fields.
- Deep JSX reorder of QR physical editor fields.
- Dedicated visual game-template picker.
- Frontend tests.

## v2 — normal node editor cleanup

Manual test showed v1 helped the QR editor, but the normal node editor still had:

- chips/tabs with old cramped behavior;
- too many nested card backgrounds;
- Location tab wasting vertical space;
- Messages tab still showing English copy.

Implemented v2:

- removed the broad direct-div card styling introduced in v1;
- made real tabs/chips use full labels and horizontal scroll on mobile;
- added compact responsive form grids for location/common form areas;
- reduced textarea/input vertical waste;
- translated visible English copy in node editor defaults and status messages;
- kept the QR physical editor styling that tested well.

## v3 — real normal node editor targeting

Manual testing showed v2 still barely changed the normal node editor because the CSS was too broad and did not target the actual NodeDetailDrawer sections.

Implemented v3:

- added `admin-node-editor-redesign` to the real normal node drawer;
- added specific panel classes for basics, location, game, requirement and messages;
- rebuilt normal editor tabs as a real segmented control;
- removed nested card-on-card styling inside the normal editor;
- made Location compact and grid-based;
- made Messages clearer and translated;
- repaired UI strings and i18n keys affected by earlier aggressive translation attempts;
- kept QR physical editor styling unchanged because it tested well.

## v4b — remove Location tab safely

Manual testing showed the Location tab was redundant because coordinates are already visible in the header and map movement is the preferred way to reposition nodes.

Implemented v4b:

- removed the `Ubicación` tab from the normal node editor;
- removed the active location content block safely;
- left a compact `Activación` note inside `Básico`;
- kept coordinates in the node header;
- kept legacy GPS/locked messages visually translated;
- avoided risky TSX field relocation until the game-template editor is redesigned.

## v4b — remove Location tab safely

Manual testing showed the Location tab was redundant because coordinates are already visible in the header and map movement is the preferred way to reposition nodes.

Implemented v4b:

- removed the `Ubicación` tab from the normal node editor;
- removed the active location content block safely;
- left a compact `Activación` note inside `Básico`;
- kept coordinates in the node header;
- kept legacy GPS/locked messages visually translated;
- avoided risky TSX field relocation until the game-template editor is redesigned.

## v5c — fix activation updater

The first v5b attempt inserted activation controls but used `patchStage`, which belongs to the QR physical editor pattern and is not available inside `NodeDetailDrawer`.

Implemented v5c:

- detects the local `draft` setter inside `NodeDetailDrawer`;
- adds `patchActivationStage`;
- wires activation controls to the normal node editor draft state;
- translates remaining visible `Save`/`Unsaved` copy.

## v5d — responsive containment

Manual screenshot after v5c showed content clipping inside the normal editor:

- activation card right column was cut;
- section helper text was truncated;
- footer status overlapped with the close button;
- some grids still assumed too much horizontal space.

Implemented v5d:

- global `box-sizing` containment inside normal editor;
- fluid activation grid using `auto-fit`;
- wrapped section helper text;
- checkbox label wraps instead of clipping;
- footer uses `grid-template-columns: minmax(0, 1fr) auto`;
- narrow screens stack or scroll instead of cutting content.

## v6b — safe Basics cleanup

The first v6 attempt tried to remove the duplicated game JSX from `Básico` and broke the drawer markup.

Implemented v6b safely:

- restored the broken TSX;
- hides duplicated game selector/preview in `Básico` using scoped CSS only;
- keeps the real game selector/configuration in the `Juego` tab;
- explains `Texto principal del nodo` as player-facing instruction/clue text;
- avoids deleting JSX blocks until the normal node editor is refactored into smaller components.

## v6c — mark real duplicate game field

Manual testing showed v6b CSS did not target the actual duplicated `Juego` field inside `Básico`.

Implemented v6c:

- marks the real duplicated `Juego` label in `Básico` with `admin-basic-game-duplicate`;
- hides that marked field and its immediate preview via scoped CSS;
- marks the real main-copy label with `admin-node-main-copy-field`;
- replaces `Contenido del nodo` with `Texto principal del nodo` plus help text;
- keeps the real game selector/configuration in the `Juego` tab.

## v7 — remove repeated drawer footer note

Manual testing showed the drawer footer note was redundant:

- `Sin guardar / Cambios locales solamente` already appears in the main admin shell;
- the node drawer only needs a clear close action;
- the long note consumed space and distracted from editing.

Implemented v7:

- removed the repeated “Vista local en vivo…” pill from the node drawer footer;
- kept the close button;
- removed/hidden the advanced manual requirement ID editor from the UI;
- requirement editing stays focused on normal route/order/physical-object logic.
