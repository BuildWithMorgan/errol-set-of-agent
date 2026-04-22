# Dashboard Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static dashboard with per-agent usage cards showing count, relative progress bar, and last-used time — all computed client-side from the existing history data.

**Architecture:** Pure front-end change across 3 files. `app.js` gains a `getAgentStats()` helper and a `renderAgentCards()` renderer; `loadDashboard()` is updated to call them. `index.html` gets a new container div. `style.css` gets the card grid styles.

**Tech Stack:** Vanilla JS, CSS, HTML — no new dependencies. Data from `data/history.json` via existing `/api/history` endpoint.

---

## File Map

| File | Change |
|---|---|
| `interface/app.js` | Extend `relativeTime()`, add `AGENT_CONFIG`, `getAgentStats()`, `renderAgentCards()`, update `loadDashboard()` |
| `interface/index.html` | Add section heading + `#dashboard-agent-cards` container inside `#agent-dashboard` |
| `interface/style.css` | Add agent card grid and card component styles |

---

### Task 1: Extend `relativeTime()` to handle weeks and months

The current function stops at days (`il y a X jours`). The spec requires weeks (`il y a X sem.`) and months (`il y a X mois`). It also needs to handle the `days === 1` → `hier` case then fall through to `il y a Xj` for 2–6 days.

**Files:**
- Modify: `interface/app.js` — `relativeTime()` function at line 328

- [ ] **Step 1: Open `interface/app.js` and locate `relativeTime()` at line 328**

- [ ] **Step 2: Replace the function with the extended version**

Replace:
```js
function relativeTime(isoString) {
  const diff  = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return "à l'instant";
  if (mins < 60)  return `il y a ${mins} min`;
  if (hours < 24) return `il y a ${hours}h`;
  if (days === 1) return 'hier';
  return `il y a ${days} jours`;
}
```

With:
```js
function relativeTime(isoString) {
  const diff   = Date.now() - new Date(isoString).getTime();
  const mins   = Math.floor(diff / 60000);
  const hours  = Math.floor(diff / 3600000);
  const days   = Math.floor(diff / 86400000);
  const weeks  = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  if (mins < 1)    return "à l'instant";
  if (mins < 60)   return `il y a ${mins} min`;
  if (hours < 24)  return `il y a ${hours}h`;
  if (days === 1)  return 'hier';
  if (days < 7)    return `il y a ${days}j`;
  if (weeks < 4)   return `il y a ${weeks} sem.`;
  return `il y a ${months} mois`;
}
```

- [ ] **Step 3: Verify manually in browser console**

Open the app at http://localhost:3000, open DevTools console, and run:
```js
// Should return "il y a 3j"
relativeTime(new Date(Date.now() - 3 * 86400000).toISOString())
// Should return "il y a 2 sem."
relativeTime(new Date(Date.now() - 14 * 86400000).toISOString())
// Should return "il y a 2 mois"
relativeTime(new Date(Date.now() - 60 * 86400000).toISOString())
```

- [ ] **Step 4: Commit**

```bash
git add interface/app.js
git commit -m "fix: extend relativeTime to handle weeks and months"
```

---

### Task 2: Add `AGENT_CONFIG` and `getAgentStats()`

`AGENT_CONFIG` is the single source of truth for agent keys, French labels, and SVG paths. `getAgentStats()` takes the full history array and returns a sorted array of per-agent stats.

**Files:**
- Modify: `interface/app.js` — add after the `escapeHtml` function (around line 346)

- [ ] **Step 1: Add `AGENT_CONFIG` and `getAgentStats()` after `escapeHtml()`**

Insert this block immediately after the `escapeHtml` function:
```js
// ─── Agent config & stats ──────────────────────────────────────────────────────
const AGENT_CONFIG = [
  { key: 'rag',     label: 'Interroger mes dossiers', svgPath: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><circle cx="11" cy="13" r="2.5"/><path d="m14.5 16.5 2 2"/>' },
  { key: 'letter',  label: 'Rédiger un courrier',      svgPath: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><path d="M10 13h4M10 17h4M10 9h1"/>' },
  { key: 'summary', label: 'Résumer un document',      svgPath: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h6M8 17h4"/>' },
  { key: 'invoice', label: 'Générer une facture',      svgPath: '<path d="M6 2h12a1 1 0 0 1 1 1v18l-3-2-2 2-2-2-2 2-2-2-2 2V3a1 1 0 0 1 1-1z"/><path d="M9 7h6M9 11h6M9 15h4"/>' },
  { key: 'hearing', label: 'Préparer une audience',    svgPath: '<path d="M12 3v4M6.3 6.3l2.8 2.8M17.7 6.3l-2.8 2.8"/><path d="M3 12h18"/><path d="M5 12l2 5h10l2-5"/><path d="M12 17v4M10 21h4"/>' },
  { key: 'content', label: 'Créer du contenu',         svgPath: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>' },
];

function getAgentStats(history) {
  const counts = AGENT_CONFIG.map(({ key }) =>
    history.filter(h => h.agent === key).length
  );
  const maxCount = Math.max(1, ...counts);

  return AGENT_CONFIG.map(({ key, label, svgPath }) => {
    const entries = history
      .filter(h => h.agent === key)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const count    = entries.length;
    const lastUsed = entries[0]?.created_at ?? null;
    const barWidth = Math.round((count / maxCount) * 100);
    return { key, label, svgPath, count, lastUsed, barWidth };
  }).sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 2: Verify in browser console**

```js
// With the app running, paste a mock history and check output:
const mockHistory = [
  { agent: 'letter',  created_at: new Date(Date.now() - 3600000).toISOString() },
  { agent: 'letter',  created_at: new Date(Date.now() - 7200000).toISOString() },
  { agent: 'summary', created_at: new Date(Date.now() - 86400000).toISOString() },
];
const stats = getAgentStats(mockHistory);
// stats[0] should be { key: 'letter', count: 2, barWidth: 100, ... }
// stats[1] should be { key: 'summary', count: 1, barWidth: 50, ... }
// stats[2..5] should have count: 0, barWidth: 0
console.assert(stats[0].key === 'letter',  'letter is first');
console.assert(stats[0].barWidth === 100,  'letter bar is 100%');
console.assert(stats[1].barWidth === 50,   'summary bar is 50%');
console.assert(stats[2].count === 0,       'unused agent has count 0');
console.assert(stats[2].lastUsed === null, 'unused agent has null lastUsed');
```

- [ ] **Step 3: Commit**

```bash
git add interface/app.js
git commit -m "feat: add AGENT_CONFIG and getAgentStats helper"
```

---

### Task 3: Add `renderAgentCards()` and update `loadDashboard()`

`renderAgentCards()` takes the stats array from `getAgentStats()` and writes HTML into `#dashboard-agent-cards`. `loadDashboard()` needs to fetch full history (drop the `?limit=10`) and call both the new renderer and the existing history table renderer.

**Files:**
- Modify: `interface/app.js` — `loadDashboard()` at line 348

- [ ] **Step 1: Add `renderAgentCards()` immediately before `loadDashboard()`**

Insert this function right before the `loadDashboard` function definition:
```js
function renderAgentCards(stats) {
  const container = document.getElementById('dashboard-agent-cards');
  if (!container) return;
  container.innerHTML = stats.map(({ label, svgPath, count, lastUsed, barWidth }) => `
    <div class="agent-card">
      <div class="agent-card-header">
        <div class="agent-card-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">${svgPath}</svg>
        </div>
        <div class="agent-card-name">${escapeHtml(label)}</div>
      </div>
      <div class="agent-card-count">${count}</div>
      <div class="agent-card-count-label">utilisation${count !== 1 ? 's' : ''}</div>
      <div class="agent-card-bar-track">
        <div class="agent-card-bar-fill" style="width:${barWidth}%"></div>
      </div>
      <div class="agent-card-last">${lastUsed ? 'Dernière utilisation : ' + relativeTime(lastUsed) : 'Jamais utilisé'}</div>
    </div>
  `).join('');
}
```

- [ ] **Step 2: Update `loadDashboard()` — change history fetch and add card rendering**

In `loadDashboard()`, make these two changes:

**Change 1** — fetch full history (remove `?limit=10`):
```js
// Before:
const [historyRes, templatesRes, statusRes] = await Promise.all([
  fetch('/api/history?limit=10'),
  fetch('/api/templates'),
  fetch('/api/status'),
]);

// After:
const [historyRes, templatesRes, statusRes] = await Promise.all([
  fetch('/api/history'),
  fetch('/api/templates'),
  fetch('/api/status'),
]);
```

**Change 2** — add card rendering right after tiles are updated (after `statusLabel.textContent = ...` block), before the history table block:
```js
// Agent cards
renderAgentCards(getAgentStats(history));
```

**Change 3** — slice history to 10 rows for the table (since we now fetch all):
```js
// Before:
container.innerHTML = history.map(h => `

// After:
container.innerHTML = history.slice(0, 10).map(h => `
```

- [ ] **Step 3: Commit**

```bash
git add interface/app.js
git commit -m "feat: add renderAgentCards and update loadDashboard"
```

---

### Task 4: Add agent cards container to HTML

**Files:**
- Modify: `interface/index.html` — inside `#agent-dashboard` section

- [ ] **Step 1: Find the dashboard section in `index.html`**

Locate the block that ends with `</div>` closing `.dashboard-tiles` (around line 87). It looks like:
```html
        </div>

        <div class="section-heading">Dernières générations</div>
```

- [ ] **Step 2: Insert the agent cards section between tiles and history**

Replace:
```html
        </div>

        <div class="section-heading">Dernières générations</div>
```

With:
```html
        </div>

        <div class="section-heading">Utilisation par agent</div>
        <div class="agent-cards" id="dashboard-agent-cards"></div>

        <div class="section-heading">Dernières générations</div>
```

- [ ] **Step 3: Commit**

```bash
git add interface/index.html
git commit -m "feat: add agent cards container to dashboard HTML"
```

---

### Task 5: Add CSS for agent cards

**Files:**
- Modify: `interface/style.css` — append after the last rule (line 679)

- [ ] **Step 1: Append agent card styles to `style.css`**

Add to the end of the file:
```css
/* ─── Agent cards grid ───────────────────────────────────── */
.agent-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 28px;
}

.agent-card {
  background: var(--white);
  border: 1px solid var(--gray-3);
  border-radius: var(--radius);
  padding: 14px;
}

.agent-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.agent-card-icon {
  width: 28px;
  height: 28px;
  background: var(--blue-lt);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.agent-card-icon svg {
  width: 14px;
  height: 14px;
  stroke: var(--blue);
  fill: none;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.agent-card-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--black);
  line-height: 1.3;
}

.agent-card-count {
  font-size: 26px;
  font-weight: 700;
  color: var(--black);
  line-height: 1;
}

.agent-card-count-label {
  font-size: 9px;
  color: var(--gray-4);
  margin-top: 1px;
  margin-bottom: 8px;
}

.agent-card-bar-track {
  background: var(--gray-3);
  border-radius: 3px;
  height: 5px;
  margin-bottom: 6px;
}

.agent-card-bar-fill {
  background: var(--blue);
  border-radius: 3px;
  height: 5px;
  transition: width 0.4s ease;
}

.agent-card-last {
  font-size: 9px;
  color: var(--gray-4);
}
```

- [ ] **Step 2: Commit**

```bash
git add interface/style.css
git commit -m "feat: add agent card grid and component styles"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Start the app and open http://localhost:3000**

- [ ] **Step 2: Check the dashboard loads correctly**

Verify:
- 3 KPI tiles are visible at the top
- 6 agent cards appear in a 3-column grid below
- Each card shows: icon (blue tint), name, count, progress bar, last-used text
- The most-used agent has a 100% wide bar; others scale proportionally
- An agent with 0 uses shows "Jamais utilisé"
- The history table still appears below the cards

- [ ] **Step 3: Use one agent and return to dashboard**

Run any agent (e.g. "Résumer un document"), then click "Tableau de bord" in the sidebar. Verify the card for that agent updated its count and last-used time.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix: dashboard analytics end-to-end corrections"
```
