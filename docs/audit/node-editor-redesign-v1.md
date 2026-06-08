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
