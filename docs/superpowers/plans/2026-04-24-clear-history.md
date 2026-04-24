# Clear History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the ability to delete individual history entries or clear all history from the dashboard.

**Architecture:** Two new FastAPI endpoints in `server.py` (DELETE single entry, DELETE all), a `deleteHistoryEntry(id)` function and a `clearAllHistory()` function in `app.js`, a ✕ button on each history row, and an "Effacer tout" button in the dashboard section header.

**Tech Stack:** Python/FastAPI (backend), Vanilla JS (frontend), pytest + FastAPI TestClient (tests).

---

## File Map

| File | Change |
|------|--------|
| `server.py` | Add 2 DELETE endpoints in the History section (lines 114–121) |
| `tests/test_server.py` | Add 3 new tests following the existing `test_delete_template` pattern |
| `interface/app.js` | Add `deleteHistoryEntry()` + `clearAllHistory()` functions; modify history row template in `loadDashboard()` |
| `interface/index.html` | Wrap "Dernières générations" heading to include "Effacer tout" button |

---

## Task 1: Backend — DELETE single history entry

**Files:**
- Modify: `server.py` (after line 121, inside the `# ─── History` section)
- Test: `tests/test_server.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_server.py`:

```python
def test_delete_history_entry(tmp_path, monkeypatch):
    monkeypatch.setattr("server.HISTORY_FILE", tmp_path / "history.json")
    (tmp_path / "history.json").write_text(json.dumps([
        {"id": "abc", "agent": "letter", "agent_label": "Rédiger un courrier", "input": "test", "output": "result", "created_at": "2026-01-01"},
        {"id": "xyz", "agent": "rag",    "agent_label": "Interroger mes dossiers", "input": "query", "output": "answer", "created_at": "2026-01-02"},
    ]))
    response = client.delete("/api/history/abc")
    assert response.status_code == 204
    remaining = json.loads((tmp_path / "history.json").read_text())
    assert len(remaining) == 1
    assert remaining[0]["id"] == "xyz"


def test_delete_history_entry_not_found(tmp_path, monkeypatch):
    monkeypatch.setattr("server.HISTORY_FILE", tmp_path / "history.json")
    (tmp_path / "history.json").write_text("[]")
    response = client.delete("/api/history/nonexistent")
    assert response.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/morganracon/Errol set of agent "
python -m pytest tests/test_server.py::test_delete_history_entry tests/test_server.py::test_delete_history_entry_not_found -v
```

Expected: FAIL — `405 Method Not Allowed` (endpoint doesn't exist yet).

- [ ] **Step 3: Implement the endpoint**

In `server.py`, after the `get_history` function (after line 121), add:

```python
@app.delete("/api/history/{entry_id}", status_code=204)
async def delete_history_entry(entry_id: str):
    async with _history_lock:
        history = read_json(HISTORY_FILE)
        updated = [h for h in history if h["id"] != entry_id]
        if len(updated) == len(history):
            raise HTTPException(status_code=404, detail="History entry not found")
        write_json(HISTORY_FILE, updated)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/test_server.py::test_delete_history_entry tests/test_server.py::test_delete_history_entry_not_found -v
```

Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
cd "/Users/morganracon/Errol set of agent "
git add server.py tests/test_server.py
git commit -m "feat: add DELETE /api/history/{entry_id} endpoint"
```

---

## Task 2: Backend — DELETE all history

**Files:**
- Modify: `server.py` (after the endpoint added in Task 1)
- Test: `tests/test_server.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_server.py`:

```python
def test_clear_history(tmp_path, monkeypatch):
    monkeypatch.setattr("server.HISTORY_FILE", tmp_path / "history.json")
    (tmp_path / "history.json").write_text(json.dumps([
        {"id": "1", "agent": "rag", "agent_label": "Interroger mes dossiers", "input": "q", "output": "a", "created_at": "2026-01-01"},
        {"id": "2", "agent": "letter", "agent_label": "Rédiger un courrier", "input": "x", "output": "y", "created_at": "2026-01-02"},
    ]))
    response = client.delete("/api/history")
    assert response.status_code == 204
    remaining = json.loads((tmp_path / "history.json").read_text())
    assert remaining == []
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/morganracon/Errol set of agent "
python -m pytest tests/test_server.py::test_clear_history -v
```

Expected: FAIL — `405 Method Not Allowed`.

- [ ] **Step 3: Implement the endpoint**

In `server.py`, after the `delete_history_entry` endpoint added in Task 1, add:

```python
@app.delete("/api/history", status_code=204)
async def clear_history():
    async with _history_lock:
        write_json(HISTORY_FILE, [])
```

Place this endpoint immediately after `delete_history_entry` in the History section.

- [ ] **Step 4: Run all history tests**

```bash
cd "/Users/morganracon/Errol set of agent "
python -m pytest tests/test_server.py -v
```

Expected: ALL PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
cd "/Users/morganracon/Errol set of agent "
git add server.py tests/test_server.py
git commit -m "feat: add DELETE /api/history endpoint to clear all history"
```

---

## Task 3: Frontend — ✕ delete button per history row

**Files:**
- Modify: `interface/app.js` (the `loadDashboard` function, around line 439, and add new function after it)

- [ ] **Step 1: Add the `deleteHistoryEntry` function**

In `app.js`, after the closing `}` of `loadDashboard` (around line 453), add:

```javascript
async function deleteHistoryEntry(id) {
  const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    alert('Erreur lors de la suppression de cette entrée.');
    return;
  }
  await loadDashboard();
}
```

- [ ] **Step 2: Add ✕ button to each history row**

In `loadDashboard`, find the history row template (around line 439). Replace:

```javascript
    container.innerHTML = history.slice(0, 10).map(h => `
      <div class="history-row">
        <div class="history-input">
          <span class="history-badge">${escapeHtml(h.agent_label.split(' ')[0].toUpperCase())}</span>${escapeHtml(h.input)}
        </div>
        <div class="history-meta">
          <span class="history-time">${relativeTime(h.created_at)}</span>
          <button class="history-reuse" onclick="reuseHistory('${escapeHtml(h.agent)}', ${JSON.stringify(JSON.stringify({ input: h.input, fields: h.fields || null }))})">Réutiliser →</button>
        </div>
      </div>
    `).join('');
```

With:

```javascript
    container.innerHTML = history.slice(0, 10).map(h => `
      <div class="history-row">
        <div class="history-input">
          <span class="history-badge">${escapeHtml(h.agent_label.split(' ')[0].toUpperCase())}</span>${escapeHtml(h.input)}
        </div>
        <div class="history-meta">
          <span class="history-time">${relativeTime(h.created_at)}</span>
          <button class="history-reuse" onclick="reuseHistory('${escapeHtml(h.agent)}', ${JSON.stringify(JSON.stringify({ input: h.input, fields: h.fields || null }))})">Réutiliser →</button>
          <button class="template-pill-delete" onclick="deleteHistoryEntry('${escapeHtml(h.id)}')">✕</button>
        </div>
      </div>
    `).join('');
```

- [ ] **Step 3: Verify manually**

Start the server and open the dashboard in a browser:

```bash
cd "/Users/morganracon/Errol set of agent "
uvicorn server:app --reload --port 3000
```

Open `http://localhost:3000`. Navigate to the dashboard. Each history row should show a ✕ button alongside "Réutiliser →". Click ✕ on one entry — it should disappear and the list should refresh. Confirm the entry is gone from `data/history.json`.

- [ ] **Step 4: Commit**

```bash
cd "/Users/morganracon/Errol set of agent "
git add interface/app.js
git commit -m "feat: add per-row delete button to history table"
```

---

## Task 4: Frontend — "Effacer tout" button in section header

**Files:**
- Modify: `interface/index.html` (the "Dernières générations" section heading, around line 92)
- Modify: `interface/app.js` (add `clearAllHistory` function after `deleteHistoryEntry`)

- [ ] **Step 1: Add `clearAllHistory` function to `app.js`**

In `app.js`, after `deleteHistoryEntry`, add:

```javascript
async function clearAllHistory() {
  if (!window.confirm('Effacer tout l\'historique ?')) return;
  const res = await fetch('/api/history', { method: 'DELETE' });
  if (!res.ok) {
    alert('Erreur lors de la suppression de l\'historique.');
    return;
  }
  await loadDashboard();
}
```

- [ ] **Step 2: Update the section heading in `index.html`**

In `index.html`, find (around line 92):

```html
        <div class="section-heading">Dernières générations</div>
```

Replace with:

```html
        <div class="section-heading" style="display:flex;align-items:center;justify-content:space-between;">
          Dernières générations
          <button class="btn-copy" onclick="clearAllHistory()" style="font-size:12px;">Effacer tout</button>
        </div>
```

- [ ] **Step 3: Verify manually**

Open `http://localhost:3000` (server already running from Task 3, or restart with `uvicorn server:app --reload --port 3000`).

Navigate to the dashboard. The "Dernières générations" heading should show an "Effacer tout" button on the right. Click it — a native browser confirmation dialog should appear asking "Effacer tout l'historique ?". Click Cancel — nothing happens. Click OK — all entries disappear and the history table shows "Aucune génération pour l'instant." Confirm `data/history.json` contains `[]`.

- [ ] **Step 4: Commit**

```bash
cd "/Users/morganracon/Errol set of agent "
git add interface/index.html interface/app.js
git commit -m "feat: add clear-all history button to dashboard"
```

---

## Task 5: Full test run and final verification

- [ ] **Step 1: Run the full test suite**

```bash
cd "/Users/morganracon/Errol set of agent "
python -m pytest tests/ -v
```

Expected: ALL PASS. If any test fails, fix before proceeding.

- [ ] **Step 2: Smoke test in browser**

With the server running:
1. Generate at least one output from any agent so history is non-empty
2. Go to dashboard — history row shows "Réutiliser →" and ✕
3. Click ✕ on one row — row disappears, dashboard refreshes
4. Click "Effacer tout" → Cancel — nothing happens
5. Click "Effacer tout" → OK — history clears, "Aucune génération" message appears
6. "Générations ce mois" tile updates to 0

- [ ] **Step 3: Done**

Feature is complete. The branch is ready for `git push` and review when Errol is ready to pull.
