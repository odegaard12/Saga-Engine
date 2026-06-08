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
