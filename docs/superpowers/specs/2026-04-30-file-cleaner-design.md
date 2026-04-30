# Design Spec — Agent Nettoyage de Fichiers
**Date:** 2026-04-30
**Branch:** feature/file-cleaner
**Status:** Approved

---

## Summary

Add a 7th agent to the Le Play Avocats cockpit: **"Nettoyer mes fichiers"**. The agent runs continuously in the background, scanning the Downloads folder and Desktop for files to organise, and monitoring Outlook for incoming emails with attachments. It generates proposals (rename / move / delete) that Errol reviews and approves before any file is touched. Nothing moves automatically.

---

## Goals

- Errol never has to manually hunt through Downloads or Desktop for documents
- Files end up in the right OneDrive folder with a standardised name, without Errol doing it himself
- Incoming emails with attachments are surfaced immediately via browser notification
- Zero risk of accidental data loss — every action requires explicit approval

---

## Non-Goals

- No automatic file moves or deletions — proposals only
- No indexing into the RAG system (separate agent)
- No email body reading — only attachment detection and filename capture
- No cloud processing — all AI analysis via local Ollama

---

## Architecture

### Background scheduler (server-side)

A scheduler thread starts with the FastAPI server and runs on a configurable interval (default: 60 minutes in production). Each cycle it:

1. Scans `~/Downloads` and `~/Desktop` for new or unprocessed files
2. For each file, calls Ollama to classify it (client name, document type, legal value flag)
3. Polls Outlook via Microsoft Graph API for emails with attachments received since the last scan
4. Generates proposals and writes them to `data/cleaner_proposals.json`
5. Pushes an SSE event to all connected browser clients

The scheduler uses `APScheduler` (BackgroundScheduler). The scan interval is stored in `.env` as `CLEANER_INTERVAL_MINUTES` (default: `60`). It can be overridden from the interface (stored in a local settings key, not a full server restart).

### SSE connection (frontend → server)

The frontend opens a persistent `EventSource` connection to `/api/cleaner/events` when the page loads. When the server pushes a `new_proposals` event, the frontend:

1. Increments the badge counter on the sidebar nav button
2. Fires a browser `Notification` (if permission granted)
3. Updates the proposal list if the cleaner view is currently open

The SSE endpoint streams events only — it does not block. If the tab is closed, the connection drops; the badge counter is re-populated from `data/cleaner_proposals.json` on next page load.

### Proposal store (`data/cleaner_proposals.json`)

Each proposal is a JSON object:

```json
{
  "id": "uuid",
  "detected_at": "2026-04-30T18:51:02",
  "source": "file" | "email",
  "status": "pending" | "approved" | "ignored" | "applied",
  "original_path": "/Users/errol/Downloads/doc(3)_final_v2.pdf",
  "proposed_name": "2026-04-30_Dupont_contrat.pdf",
  "proposed_destination": "/Users/errol/OneDrive/Clients/Dupont",
  "action": "rename_and_move" | "delete" | "email_flag" | "review_manually",
  "ai_reason": "Contient le nom Dupont, type contrat, valeur juridique confirmée"
}
```

`pending` proposals are shown in the triage panel. After Errol applies or ignores, status updates accordingly. The file is append-only for audit purposes — nothing is ever deleted from the JSON.

---

## Components

### Backend

| File | Purpose |
|---|---|
| `tools/file_cleaner.py` | Scan Downloads/Desktop, classify files via Ollama, return proposals |
| `tools/outlook_monitor.py` | Poll Outlook via Microsoft Graph API, return emails with attachments |
| `server.py` (additions) | APScheduler setup, `/api/cleaner/proposals` endpoints (GET, PATCH), `/api/cleaner/events` SSE, `/api/cleaner/apply` POST, `/api/cleaner/settings` GET/POST |
| `workflows/file_cleaner.md` | Workflow SOP for the agent |
| `data/cleaner_proposals.json` | Persistent proposal store (auto-created) |

### Frontend

| Addition | Purpose |
|---|---|
| Sidebar nav button | "Nettoyer mes fichiers" entry with red badge counter |
| `#agent-cleaner` section in `index.html` | Full agent view: monitor bar, countdown, activity log, triage cards, email list |
| SSE listener in `app.js` | Opens EventSource, handles `new_proposals` and `scan_complete` events, fires Notification API |
| Notification permission request | Asked once on first load of the cleaner view, stored in localStorage |

---

## API Endpoints

```
GET  /api/cleaner/proposals          → list pending proposals
POST /api/cleaner/apply              → body: {ids: [...], action: "apply"|"ignore"}
GET  /api/cleaner/events             → SSE stream
GET  /api/cleaner/settings           → {interval_minutes, folders, outlook_enabled}
POST /api/cleaner/settings           → update settings
POST /api/cleaner/scan               → trigger immediate scan
```

---

## Ollama Classification Prompt

For each file, the prompt extracts:
- Client name (from filename or content if text-extractable)
- Document type (contrat, facture, jugement, capture d'écran, inconnu, etc.)
- Legal value (true/false)
- Suggested normalised filename (`YYYY-MM-DD_Client_Type.ext`)
- Suggested OneDrive subfolder (`Clients/NomClient` or `Divers`)

Files where Ollama cannot determine a client or type are flagged `action: review_manually` — no rename or move proposed, just surfaced for Errol to handle.

---

## Microsoft Graph API Setup (one-time)

Required environment variables in `.env`:

```bash
OUTLOOK_CLIENT_ID=...
OUTLOOK_CLIENT_SECRET=...
OUTLOOK_TENANT_ID=...
OUTLOOK_USER_EMAIL=errol@...
```

Setup steps (documented in README):
1. Register an app in Azure Active Directory
2. Grant `Mail.Read` permission (application permission)
3. Admin consent the permission
4. Copy client ID, secret, tenant ID to `.env`

If `OUTLOOK_CLIENT_ID` is not set, the email monitoring section is hidden in the UI and the scanner runs file-only mode without error.

---

## UI — Cleaner View

```
[ — ORGANISATION ]
Nettoyer mes fichiers
Surveillance continue · rien ne bouge sans votre accord

[ monitor bar: ● active · prochain scan dans 47 min   [interval dropdown] [Scanner maintenant] ]
[ thin progress bar — visible during active scan ]

[ activity log — last 20 entries, newest first ]

PROPOSITIONS DE NETTOYAGE — TÉLÉCHARGEMENTS
┌──────────────────────────────────────────────────────┐
│ PDF  doc(3)_final_v2.pdf              [toggle: Actif] │
│  ✏️ Renommer → 2026-04-30_Dupont_contrat.pdf          │
│  📁 Déplacer → OneDrive / Clients / Dupont            │
└──────────────────────────────────────────────────────┘
... (one card per file)

[ 3 actions sélectionnées ]    [ Tout ignorer ] [ Appliquer la sélection ]

EMAILS AVEC PIÈCES JOINTES — OUTLOOK
┌─────────────────────────────────────────────────────┐
│ ● Cabinet Lefebvre    Projet d'acte...   📎 2   09:47│
└─────────────────────────────────────────────────────┘
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Ollama offline during scan | Skip AI classification, log warning, still surface file names |
| Microsoft Graph auth failure | Log error, disable email section gracefully, show banner in UI |
| File moved/deleted between scan and apply | Catch `FileNotFoundError`, mark proposal `stale`, show inline warning |
| OneDrive destination folder missing | Create folder automatically before moving |
| Scan still running when next interval fires | Skip the cycle, log "scan already in progress" |

---

## Configuration Defaults

| Setting | Default | Notes |
|---|---|---|
| `CLEANER_INTERVAL_MINUTES` | `60` | Configurable from UI |
| `CLEANER_FOLDERS` | `~/Downloads,~/Desktop` | Comma-separated paths in `.env` |
| `CLEANER_MAX_FILE_AGE_DAYS` | `30` | Only scan files modified in last N days |
| Outlook polling | enabled if credentials present | Silently disabled otherwise |

---

## Testing

- Unit test: `tools/file_cleaner.py` with a temp folder of fixture files — verify proposals are generated correctly
- Unit test: `tools/outlook_monitor.py` with mocked Graph API response
- Integration test: POST `/api/cleaner/apply` with a temp file — verify rename/move happens and proposal status updates
- Manual: run with 10s interval in demo mode, verify SSE events arrive and badge updates

---

## Constraints

- All AI classification runs locally via Ollama — no file content sent externally
- Microsoft Graph API only reads email metadata and attachment filenames — no email body is sent to Ollama
- The proposal store is append-only — provides a full audit trail of every action taken
- Errol must explicitly approve every action — the agent has no write permissions on its own
