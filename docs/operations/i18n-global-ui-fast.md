# i18n global UI fast pass

This pass improves Spanish UI support while keeping the real frontend i18n foundation.

## What changed

- Sets Spanish as the default frontend locale.
- Keeps language selection persisted in `localStorage`.
- Adds a player language selector inside the Tools sheet.
- Removes the floating language selector from the player route.
- Adds an admin language selector inside the Settings panel.
- Keeps login/player/admin copy translated through the existing i18n foundation plus a temporary legacy UI bridge.
- Translates key player Tools copy directly where needed.
- Keeps mission content editable from the admin/CMS.

## Why

SAGA Engine must be usable by Spanish-speaking families and admins without relying on one-off manual text replacements or an external translation API.

The long-term direction is still to migrate visible UI strings to `t()` component by component. This fast pass makes the current UI usable now while that migration continues.

## Safety boundaries

- no backend changes
- no gameplay rule changes
- no storage default changes
- no service worker
- no changes to `data/stages.json`
- no secrets, logs, backups or runtime data
- no admin password documentation
