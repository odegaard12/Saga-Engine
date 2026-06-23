# i18n player tools cleanup

This PR starts the i18n cleanup after the fast Spanish UI pass.

## Scope

- Expands the frontend i18n catalog with nested player Tools keys.
- Migrates visible PlayerHud / Tools shell copy to `t()`.
- Keeps Spanish as the default frontend locale.
- Keeps EN/ES persisted through `localStorage`.
- Keeps the temporary legacy Spanish bridge for remaining hardcoded copy.

## Safety boundaries

- no backend changes
- no gameplay rule changes
- no storage default changes
- no service worker
- no changes to `data/stages.json`
- no secrets, logs, backups or runtime data

## Rule

Only visible UI copy should move to `t()`.

Do not translate:

- function names
- type names
- imports
- CSS property names
- item ids
- family ids
- config keys
- mission content managed by the CMS
