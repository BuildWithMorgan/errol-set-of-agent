# Workflow: File Cleaner Agent

## Objective
Continuously monitor Downloads and Desktop for files to organise, and Outlook for emails with attachments. Surface proposals to Errol for approval. Never move or delete anything without explicit user action.

## Trigger
Runs automatically on a configurable schedule (default: 60 minutes). Can also be triggered manually via the interface "Scanner maintenant" button.

## Required Inputs
- Configured scan folders (default: ~/Downloads, ~/Desktop)
- Ollama running at OLLAMA_BASE_URL (required for AI classification)
- ONEDRIVE_PATH (destination root for moved files)
- OUTLOOK_* env vars (optional — email monitoring silently disabled if absent)

## Steps

### 1. Scan folders
- Call `tools/file_cleaner.scan_folders(folders, max_age_days, known_paths)`
- `known_paths` = set of original_path values already in cleaner_proposals.json (any status)
- Returns list of new file proposals

### 2. Scan emails (if configured)
- Call `tools/outlook_monitor.scan_emails(since, known_ids)`
- `since` = detected_at of last email proposal (or None for first run)
- `known_ids` = set of original_path values of existing email proposals
- Returns list of new proposals (empty if credentials missing)

### 3. Persist proposals
- Append new proposals to data/cleaner_proposals.json
- Append only — never overwrite existing entries (provides full audit trail)

### 4. Notify connected clients
- Broadcast SSE event `{type: "new_proposals", count: N}` to all open browser tabs
- Browser fires Notification API popup if permission granted
- Badge counter on sidebar button shows pending count

### 5. Wait for user approval
- Errol opens "Nettoyer mes fichiers" in the cockpit
- Reviews triage cards, toggles off any unwanted actions
- Clicks "Appliquer la sélection"
- Server executes only approved actions via POST /api/cleaner/apply

## Outputs
- Updated data/cleaner_proposals.json (statuses updated to: applied / ignored)
- Files renamed and moved to OneDrive subfolders
- Deleted files removed from filesystem

## Error Handling
- Ollama offline: skip AI classification, mark files action=review_manually, still surface them
- Graph API failure: log warning, skip email scan for this cycle, file scan continues normally
- File moved/deleted before apply: catch FileNotFoundError, mark proposal stale, return error in API response
- OneDrive folder missing: create it with mkdir(parents=True) before moving

## Edge Cases
- File already processed: skipped via known_paths check
- Scan already in progress when interval fires: second invocation returns immediately (_scan_running guard)
- Empty Downloads/Desktop: scan completes with 0 proposals, logs "Scan terminé — aucun nouveau fichier"
- Duplicate filename at destination: Python's Path.rename() will overwrite — consider adding suffix logic if needed
