# Interface Enhancements — Le Play Avocats AI Platform
**Date:** 2026-04-14  
**Status:** Approved  

---

## Context

The base interface (sidebar + agent views, societeamission.com color palette) is built and working. This spec covers the next layer of features to make the interface genuinely usable day-to-day by a non-technical lawyer.

---

## Architecture

### Approach: Incremental FastAPI server (approved)

Replace the current static file setup with a single Python FastAPI server on port 3000 that:
- Serves `interface/` static files
- Exposes `/api/*` endpoints for all storage operations
- Proxies Ollama calls (moves them server-side, simplifies the frontend)

**Data storage: JSON files on disk** (approved)

```
data/
├── history.json    # all past generations
├── templates.json  # saved prompt templates
└── feedback.json   # thumbs up/down records
```

No SQLite for now — JSON files are inspectable, portable, and sufficient for a solo user.

**New file: `server.py`** at project root — replaces the need to open `index.html` directly. `start.sh` runs `uvicorn server:app`.

---

## Features

### 1. Dashboard (home screen)

**What:** A landing screen displayed before any agent is selected. Replaces the blank state.

**Content:**
- 3 stat tiles: generations this month, Ollama status (green/red dot), saved templates count
- "Dernières générations" table: agent type badge, prompt excerpt, relative timestamp, "Réutiliser" link

**Data source:** `data/history.json`

**Implementation notes:**
- Dashboard is the default view when no agent is selected (sidebar has no active item on load)
- Stats computed client-side from the history JSON fetched at load
- "Réutiliser" pre-fills the relevant agent's input and switches to that agent view

---

### 2. Guided forms per agent

**What:** Structured input fields replace the free-text textarea for agents where the input is predictable.

**Agents that get guided forms:**

| Agent | Fields |
|---|---|
| Générer une facture | Client name, date, hours, hourly rate, description |
| Rédiger un courrier | Recipient, letter type (dropdown: mise en demeure / notification / relance), subject, key facts |
| Préparer une audience | Case name, hearing date, parties, key arguments (textarea) |

**Agents that keep free-text textarea:** Interroger mes dossiers, Résumer un document, Créer du contenu — their inputs are inherently open-ended.

**Implementation:** The guided form fields are assembled into a structured prompt server-side before being sent to Ollama. The prompt templates live in `server.py` (or a dedicated `prompts.py`), not in the frontend.

---

### 3. Export Word / PDF

**What:** Download buttons added to every result panel.

**Buttons:** "↓ Word" (`.docx`) and "↓ PDF"

**Implementation:**
- Server-side generation via `python-docx` (Word) and `reportlab` (PDF) — both install cleanly on macOS with no system dependencies
- `POST /api/export` — accepts `{ content, agent, format }`, returns file download
- Documents include Le Play Avocats letterhead: name, date, agent type as document title
- No client data sent to external services — generation is fully local

---

### 4. Saved templates

**What:** Per-agent saved prompt shortcuts shown as pills above the input.

**UX:**
- Pills displayed above the input area for the active agent
- "＋ Sauvegarder ce modèle" button appears after a successful generation — saves current input as a template with an auto-generated name (editable)
- Click a pill → fills the input, user can edit before submitting
- Long-press or hover on a pill → shows delete (✕) button

**Storage:** `data/templates.json`
```json
[
  { "id": "uuid", "agent": "letter", "label": "Mise en demeure standard", "prompt": "...", "created_at": "..." }
]
```

**Endpoints:**
- `GET /api/templates?agent=letter`
- `POST /api/templates`
- `DELETE /api/templates/:id`

---

### 5. Generation history

**What:** Every completed generation is auto-saved. Accessible from the dashboard and from each agent view.

**What's saved per entry:**
```json
{
  "id": "uuid",
  "agent": "letter",
  "agent_label": "Rédiger un courrier",
  "input": "...",
  "output": "...",
  "created_at": "2026-04-14T14:32:00"
}
```

**UX:**
- In each agent view: a "Dernière utilisation" row below the input showing the most recent generation for that agent, with a "Réutiliser →" link
- In the dashboard: the last 10 generations across all agents
- History is never auto-deleted — Errol can always find what was generated

**Endpoints:**
- `GET /api/history?agent=letter&limit=10`
- `POST /api/history` (called automatically after each generation)

---

### 6. Feedback (👍 / 👎)

**What:** After each generation, a simple thumbs row appears below the result.

**UX:** "Cette réponse était-elle utile ? 👍 👎" — one click, no modal. Selected thumb turns blue. Can be changed.

**What's saved:**
```json
{ "id": "uuid", "history_id": "...", "agent": "letter", "rating": "up", "created_at": "..." }
```

**Purpose:** Errol can flag bad outputs. Morgan can review `feedback.json` to improve prompts over time.

**Endpoint:** `POST /api/feedback`

---

## File changes summary

| File | Change |
|---|---|
| `server.py` | New — FastAPI server, all endpoints, Ollama proxy, static file serving |
| `interface/index.html` | Add dashboard section, guided form variants, template pills, history row, feedback row |
| `interface/style.css` | Add styles for new components (tiles, pills, guided forms, feedback row) |
| `interface/app.js` | Refactor API calls to hit `/api/*`, add dashboard init, template/history/feedback logic |
| `start.sh` | Update to run `uvicorn server:app --port 3000` instead of opening index.html |
| `requirements.txt` | Add: `fastapi`, `uvicorn`, `python-docx`, `reportlab` |
| `data/history.json` | New empty file `[]` |
| `data/templates.json` | New empty file `[]` |
| `data/feedback.json` | New empty file `[]` |

---

## Out of scope

- User authentication (single user, local only)
- Multi-device sync (Cloudflare Tunnel handles remote access, no sync needed)
- RAG integration (separate project — `tools/query_documents.py` not built yet)
- PDF/Word file parsing for the summary agent (depends on RAG tooling)
