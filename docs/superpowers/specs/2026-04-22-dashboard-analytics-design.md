# Dashboard Analytics — Design Spec

**Date:** 2026-04-22
**Branch:** feature/interface-enhancements
**Scope:** Replace the dashboard's static tiles with per-agent usage cards and keep the history table.

---

## Context

The current dashboard shows 3 static KPI tiles (generation count, Ollama status, saved templates) and a recent-history table. Errol needs a visual, at-a-glance view of how he uses each agent — which ones he relies on most, when he last used them, and the overall activity level of the system.

---

## Design Decision

**Approach B — Agent Cards**, approved by Morgan on 2026-04-22.

Rejected alternatives:
- **A (Tiles + bar chart):** Keeps existing tiles but adds a separate bar chart section. Less integrated, harder to read at a glance.
- **C (Full analytics):** Donut + 7-day histogram. Richer but unnecessary complexity for a solo-lawyer cockpit.

Color scheme: **blue** (`#2563EB`) — consistent with the existing interface and the societeamission.com brand.

---

## Layout

```
┌─────────────────────────────────────────────────────┐
│  — Vue d'ensemble                                   │
│  Tableau de bord                                    │
│  Activité du système et statistiques d'utilisation. │
├──────────────┬──────────────┬──────────────────────┤
│ Générations  │ Ollama status│ Modèles sauvegardés  │
│ ce mois      │              │                      │
├──────────────┴──────────────┴──────────────────────┤
│  UTILISATION PAR AGENT                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ [icon]   │ │ [icon]   │ │ [icon]   │           │
│  │ Agent    │ │ Agent    │ │ Agent    │           │
│  │ 9        │ │ 6        │ │ 4        │           │
│  │ [bar]    │ │ [bar]    │ │ [bar]    │           │
│  │ il y a 2h│ │ hier     │ │ il y a 3j│           │
│  └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ ...      │ │ ...      │ │ ...      │           │
│  └──────────┘ └──────────┘ └──────────┘           │
├─────────────────────────────────────────────────────┤
│  DERNIÈRES GÉNÉRATIONS                              │
│  [badge] [input preview]              [time]        │
│  [badge] [input preview]              [time]        │
│  ...                                                │
└─────────────────────────────────────────────────────┘
```

---

## Agent Cards

**One card per agent** in a 3-column grid (6 cards total). Each card contains:

| Element | Detail |
|---|---|
| Icon | 28×28px blue-tinted square (`#EFF6FF` bg, blue SVG stroke), matching the sidebar icons |
| Name | Agent's French business name, bold, 11px |
| Count | Large number (26px, bold) — total uses all time |
| Label | "utilisations" in 9px gray |
| Progress bar | 5px height, relative width: `(agent_count / max_count) * 100%`. The most-used agent = 100%. Blue fill. |
| Last used | "Dernière utilisation : [relative time]" in 9px gray. Shows "Jamais utilisé" if count is 0. |

Cards are sorted by usage count descending (most-used first).

**Agent order** (may reorder dynamically at runtime):
1. Rédiger un courrier
2. Résumer un document
3. Interroger mes dossiers
4. Générer une facture
5. Préparer une audience
6. Créer du contenu

---

## KPI Tiles

Keep the 3 existing tiles unchanged:
- **Blue:** Total generations this month (computed from `history.json` filtered by current month)
- **Green:** Ollama status (existing logic)
- **Yellow:** Saved templates count (existing logic)

---

## Data Source

All usage data comes from `data/history.json` (already populated by existing agents). No new backend required.

Each entry has:
```json
{
  "id": "...",
  "agent": "summary",
  "agent_label": "Résumer un document",
  "created_at": "2026-04-21T18:37:00.109712"
}
```

**Computed values (client-side JS):**
- `agent_count` — count of entries where `entry.agent === agentKey`
- `last_used` — `max(created_at)` for entries matching the agent, formatted as relative time
- `max_count` — `max(agent_count)` across all agents, used to scale progress bars
- `monthly_count` — count of entries where `created_at` is within the current calendar month

---

## Implementation

All changes are **front-end only** (`interface/index.html`, `interface/style.css`, `interface/app.js`). No backend changes.

### CSS changes (`style.css`)
- Add `.agent-cards` grid (3 columns, gap 10px)
- Add `.agent-card` styles (white bg, border, border-radius 8px, padding 14px)
- Add `.agent-card-icon` (28×28px blue-tinted square)
- Add `.agent-card-count` (26px bold)
- Add `.agent-card-bar-track` and `.agent-card-bar-fill` (5px progress bar)
- Add `.agent-card-last` (9px gray text)

### JS changes (`app.js`)
- Add `getAgentStats(history)` — returns `{ [agentKey]: { count, lastUsed } }` from history array
- Update `renderDashboard()` to:
  1. Compute stats from history
  2. Render 6 agent cards sorted by count desc
  3. Keep existing tile logic (monthly count, Ollama status, templates)
  4. Keep existing history table

### HTML changes (`index.html`)
- Replace static `.dashboard-tiles` section with new structure:
  - Keep 3 KPI tiles
  - Add `<div class="section-heading">Utilisation par agent</div>`
  - Add `<div class="agent-cards" id="dashboard-agent-cards"></div>` (populated by JS)

---

## Relative Time Format (French)

| Delta | Display |
|---|---|
| < 1 hour | "il y a Xmin" |
| < 24 hours | "il y a Xh" |
| < 2 days | "hier" |
| < 7 days | "il y a Xj" |
| < 4 weeks | "il y a X sem." |
| older | "il y a X mois" |
| never used | "Jamais utilisé" |

---

## Out of Scope

- No click-to-navigate on agent cards (could be added later)
- No date range filter
- No export of analytics data
- No backend API changes
