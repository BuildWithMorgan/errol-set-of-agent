# Design: Clear History Feature

**Date:** 2026-04-24
**Branch:** feature/interface-enhancements
**Status:** Approved

## Goal

Allow Errol to delete individual history entries or clear the entire history from the dashboard, so old agent usage does not accumulate indefinitely.

## Scope

- Delete a single history entry (by id)
- Clear all history at once (with confirmation)
- No restore/undo — deletion is permanent

## Backend — `server.py`

Two new endpoints, following the existing `DELETE /api/templates/{template_id}` pattern:

```
DELETE /api/history/{entry_id}   → 204 No Content
DELETE /api/history              → 204 No Content
```

Both use `_history_lock` for thread safety and the existing `read_json` / `write_json` helpers.

- `DELETE /api/history/{entry_id}`: reads `history.json`, filters out the entry with matching `id`, writes back
- `DELETE /api/history`: writes `[]` to `history.json`

## Frontend — `app.js` + `index.html`

### 1. "Effacer tout" button
Added in the dashboard section header next to "Dernières générations". Calls `window.confirm('Effacer tout l\'historique ?')` before firing `DELETE /api/history`. On success, re-renders the history table.

### 2. ✕ per-row button
Added inside each `.history-row` alongside the existing "Réutiliser →" button. Calls `deleteHistoryEntry(id)` which fires `DELETE /api/history/{id}`. On success, removes the row from the DOM and updates the count tile.

### 3. Confirmation
`window.confirm()` — native browser dialog. No new modal component or CSS.

## Styling

No new CSS classes. The ✕ button reuses the existing `.template-pill-delete` style. The "Effacer tout" button uses existing ghost button styles.

## Error Handling

- If a DELETE request fails, show a `window.alert()` with a French error message
- No silent failures

## Out of Scope

- Filtering history by agent before clearing
- Soft delete / archive / restore
- Pagination of history entries
