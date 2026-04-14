# Interface Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a FastAPI server, dashboard, guided forms, generation history, saved templates, feedback, and Word/PDF export to the Le Play Avocats interface.

**Architecture:** Single FastAPI server on port 3000 serves static files and all `/api/*` endpoints. All Ollama calls move server-side (prompts built in `prompts.py`). Data persisted to three JSON files in `data/`. Frontend JS calls `/api/*` — never Ollama directly.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, httpx (async Ollama proxy), python-docx, reportlab, pytest + httpx (tests)

---

## File Map

| File | Role |
|---|---|
| `server.py` | FastAPI app: static files, Ollama proxy, all storage endpoints |
| `prompts.py` | Builds Ollama prompts from agent ID + input data |
| `interface/index.html` | Adds dashboard view, guided forms, template pills, history row, feedback row, export buttons |
| `interface/style.css` | Styles for all new components |
| `interface/app.js` | Refactored: calls `/api/*`, dashboard init, templates, history, feedback |
| `start.sh` | Runs `uvicorn server:app --host 0.0.0.0 --port 3000` |
| `requirements.txt` | All Python dependencies |
| `tests/test_server.py` | Endpoint tests |
| `data/history.json` | Empty array `[]` |
| `data/templates.json` | Empty array `[]` |
| `data/feedback.json` | Empty array `[]` |

---

## Task 1: Foundation — FastAPI server serving static files

Gets the server running and replaces the direct Ollama call in the browser with a server-side proxy. After this task the existing interface works exactly as before, just routed through FastAPI.

**Files:**
- Create: `requirements.txt`
- Create: `server.py`
- Create: `prompts.py`
- Create: `data/history.json`, `data/templates.json`, `data/feedback.json`
- Modify: `start.sh`
- Modify: `interface/app.js`
- Create: `tests/__init__.py`, `tests/test_server.py`

- [ ] **Step 1: Create `requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
httpx==0.27.2
python-docx==1.1.2
reportlab==4.2.2
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 2: Install dependencies**

Run: `pip install -r requirements.txt`
Expected: All packages install without error.

- [ ] **Step 3: Create empty data files**

`data/history.json`:
```json
[]
```

`data/templates.json`:
```json
[]
```

`data/feedback.json`:
```json
[]
```

- [ ] **Step 4: Create `prompts.py`**

```python
# Builds Ollama prompts server-side from agent ID and input data.
# All user-visible text (prompt content) stays in French.

AGENT_LABELS = {
    "rag":     "Interroger mes dossiers",
    "letter":  "Rédiger un courrier",
    "summary": "Résumer un document",
    "invoice": "Générer une facture",
    "hearing": "Préparer une audience",
    "content": "Créer du contenu",
}


def build_prompt(agent_id: str, body: dict) -> str:
    if agent_id == "rag":
        return (
            "Tu es l'assistant juridique du cabinet Le Play Avocats. "
            "Réponds en français à la question suivante en t'appuyant sur les documents disponibles. "
            "Cite les sources si possible.\n\n"
            f"Question : {body.get('input', '')}"
        )

    if agent_id == "letter":
        f = body.get("fields", {})
        return (
            "Tu es un avocat expert en droit des sociétés. "
            f"Rédige en français un courrier de type '{f.get('letter_type', '')}' "
            f"adressé à {f.get('recipient', '')}. "
            f"Objet : {f.get('subject', '')}. "
            f"Faits et éléments clés : {f.get('facts', '')}. "
            "Respecte les conventions formelles françaises (lieu, date, formules de politesse)."
        )

    if agent_id == "summary":
        return (
            "Tu es un assistant juridique. "
            "Résume le document suivant en français en 5 points clés structurés avec des titres clairs.\n\n"
            f"Document :\n{body.get('input', '')}"
        )

    if agent_id == "invoice":
        f = body.get("fields", {})
        hours = float(f.get("hours", 0) or 0)
        rate = float(f.get("rate", 0) or 0)
        total_ht = hours * rate
        tva = total_ht * 0.20
        total_ttc = total_ht + tva
        return (
            "Tu es l'assistant du cabinet Le Play Avocats. "
            "Génère une facture complète en français avec tous les champs légaux requis "
            "(numéro de facture, date, émetteur, destinataire, détail des prestations, montants, TVA, total TTC).\n\n"
            f"Client : {f.get('client', '')}\n"
            f"Date de la prestation : {f.get('date', '')}\n"
            f"Prestation : {f.get('description', '')}\n"
            f"Durée : {f.get('hours', '')}h à {f.get('rate', '')} €/h\n"
            f"Total HT : {total_ht:.2f} €\n"
            f"TVA 20 % : {tva:.2f} €\n"
            f"Total TTC : {total_ttc:.2f} €"
        )

    if agent_id == "hearing":
        f = body.get("fields", {})
        return (
            "Tu es un avocat préparant une audience. "
            "Rédige en français une fiche d'audience structurée avec : "
            "résumé du litige, arguments principaux, points de droit à soulever, "
            "réponses aux contre-arguments prévisibles.\n\n"
            f"Dossier : {f.get('case_name', '')}\n"
            f"Date d'audience : {f.get('hearing_date', '')}\n"
            f"Parties : {f.get('parties', '')}\n"
            f"Arguments et faits : {f.get('arguments', '')}"
        )

    if agent_id == "content":
        content_type = body.get("content_type", "linkedin")
        if content_type == "linkedin":
            return (
                "Tu es Errol Cohen, avocat spécialisé en sociétés à mission. "
                "Rédige en français un post LinkedIn engageant dans ton style : "
                "ton d'expert accessible, phrases courtes, appel à l'action final.\n\n"
                f"Sujet : {body.get('input', '')}"
            )
        return (
            "Tu es Errol Cohen, avocat spécialisé en sociétés à mission. "
            "Rédige en français un article juridique structuré "
            "(introduction, développement en 3 points, conclusion) sur le sujet suivant.\n\n"
            f"Sujet : {body.get('input', '')}"
        )

    return body.get("input", "")


def build_input_summary(agent_id: str, body: dict) -> str:
    """Returns a short human-readable summary of the request for history display."""
    f = body.get("fields", {})
    if agent_id == "invoice":
        return f"{f.get('description', '')} — {f.get('client', '')}"
    if agent_id == "letter":
        return f"{f.get('letter_type', '')} — {f.get('recipient', '')}"
    if agent_id == "hearing":
        return f.get("case_name", "")
    return (body.get("input") or "")[:200]
```

- [ ] **Step 5: Write failing tests for `prompts.py`**

Create `tests/__init__.py` (empty).

Create `tests/test_prompts.py`:
```python
from prompts import build_prompt, build_input_summary


def test_rag_prompt_contains_question():
    result = build_prompt("rag", {"input": "Quelles sont les obligations ?"})
    assert "Quelles sont les obligations ?" in result
    assert "français" in result


def test_invoice_prompt_computes_totals():
    result = build_prompt("invoice", {"fields": {
        "client": "Société ABC", "date": "14/04/2026",
        "hours": "3", "rate": "350", "description": "Conseil"
    }})
    assert "1050.00 €" in result   # total HT
    assert "210.00 €" in result    # TVA
    assert "1260.00 €" in result   # TTC


def test_letter_prompt_includes_fields():
    result = build_prompt("letter", {"fields": {
        "recipient": "Société Martin",
        "letter_type": "mise en demeure",
        "subject": "Non-respect des statuts",
        "facts": "Réunion non tenue",
    }})
    assert "Société Martin" in result
    assert "mise en demeure" in result


def test_hearing_prompt_includes_case():
    result = build_prompt("hearing", {"fields": {
        "case_name": "Dossier Legrand",
        "hearing_date": "15/04/2026",
        "parties": "Legrand vs Martin",
        "arguments": "Clause nulle",
    }})
    assert "Dossier Legrand" in result


def test_content_linkedin_prompt():
    result = build_prompt("content", {"input": "Obligations 2025", "content_type": "linkedin"})
    assert "LinkedIn" in result
    assert "Obligations 2025" in result


def test_content_article_prompt():
    result = build_prompt("content", {"input": "Obligations 2025", "content_type": "article"})
    assert "article" in result.lower()


def test_build_input_summary_invoice():
    result = build_input_summary("invoice", {"fields": {"description": "Conseil", "client": "ABC"}})
    assert result == "Conseil — ABC"


def test_build_input_summary_freetext():
    result = build_input_summary("rag", {"input": "Ma question"})
    assert result == "Ma question"
```

- [ ] **Step 6: Run tests to verify they fail (prompts.py not imported yet)**

Run: `pytest tests/test_prompts.py -v`
Expected: PASS — `prompts.py` already exists from step 4.

- [ ] **Step 7: Create `server.py`**

```python
import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from prompts import build_prompt, build_input_summary, AGENT_LABELS

# ─── Config ───────────────────────────────────────────────────────────────────

OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:e4b")

DATA_DIR = Path("data")
HISTORY_FILE = DATA_DIR / "history.json"
TEMPLATES_FILE = DATA_DIR / "templates.json"
FEEDBACK_FILE = DATA_DIR / "feedback.json"

app = FastAPI()

# ─── JSON helpers ─────────────────────────────────────────────────────────────

def read_json(path: Path) -> list:
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: list) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

# ─── Status ───────────────────────────────────────────────────────────────────

@app.get("/api/status")
async def status():
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            if r.status_code == 200:
                return {"online": True, "model": OLLAMA_MODEL}
    except Exception:
        pass
    return {"online": False, "model": OLLAMA_MODEL}

# ─── Generate (Ollama proxy + streaming + auto-save to history) ───────────────

@app.post("/api/generate")
async def generate(request: Request):
    body = await request.json()
    agent_id = body.get("agent")
    if not agent_id:
        raise HTTPException(status_code=400, detail="agent is required")

    prompt = build_prompt(agent_id, body)

    async def stream_and_save() -> AsyncGenerator[bytes, None]:
        full_output: list[str] = []
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_URL}/api/generate",
                json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": True},
            ) as response:
                async for line in response.aiter_lines():
                    if line:
                        yield (line + "\n").encode()
                        try:
                            chunk = json.loads(line)
                            if chunk.get("response"):
                                full_output.append(chunk["response"])
                        except json.JSONDecodeError:
                            pass

        output_text = "".join(full_output)
        if output_text:
            history = read_json(HISTORY_FILE)
            history.insert(0, {
                "id": str(uuid.uuid4()),
                "agent": agent_id,
                "agent_label": AGENT_LABELS.get(agent_id, agent_id),
                "input": build_input_summary(agent_id, body),
                "output": output_text,
                "created_at": datetime.now().isoformat(),
            })
            write_json(HISTORY_FILE, history)

    return StreamingResponse(stream_and_save(), media_type="text/plain")

# ─── Static files (must come last so /api routes are matched first) ───────────

app.mount("/", StaticFiles(directory="interface", html=True), name="static")
```

- [ ] **Step 8: Write failing test for `/api/status`**

Add to `tests/test_server.py`:
```python
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)


def test_status_online():
    mock_response = AsyncMock()
    mock_response.status_code = 200

    with patch("server.httpx.AsyncClient") as mock_client_class:
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value.get = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_cm
        response = client.get("/api/status")

    assert response.status_code == 200
    assert response.json()["online"] is True
    assert "model" in response.json()


def test_status_offline():
    with patch("server.httpx.AsyncClient") as mock_client_class:
        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value.get = AsyncMock(side_effect=Exception("refused"))
        mock_client_class.return_value = mock_cm
        response = client.get("/api/status")

    assert response.status_code == 200
    assert response.json()["online"] is False
```

- [ ] **Step 9: Run tests**

Run: `pytest tests/test_server.py tests/test_prompts.py -v`
Expected: All PASS.

- [ ] **Step 10: Update `start.sh`**

```bash
#!/bin/bash
cd "$(dirname "$0")"
echo "Démarrage du serveur Le Play Avocats..."
uvicorn server:app --host 0.0.0.0 --port 3000 --reload
```

Run: `chmod +x start.sh`

- [ ] **Step 11: Update `interface/app.js` — remove Ollama direct calls, call `/api/*`**

Replace the entire file with:
```javascript
// ─── Agent switching ──────────────────────────────────────────────────────────
document.querySelectorAll('.agent-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.agent;
    document.querySelectorAll('.agent-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.agent-view').forEach(v => v.classList.remove('active'));
    document.getElementById(`agent-${id}`).classList.add('active');
  });
});

// ─── Ollama status (via server) ───────────────────────────────────────────────
async function checkOllamaStatus() {
  const dot   = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.online) {
      dot.className     = 'status-dot online';
      label.textContent = 'Ollama actif';
    } else {
      throw new Error('offline');
    }
  } catch {
    dot.className     = 'status-dot offline';
    label.textContent = 'Ollama hors ligne';
  }
}

// ─── Collect input for each agent ────────────────────────────────────────────
function collectInput(agentId) {
  if (agentId === 'letter') {
    return {
      agent: 'letter',
      fields: {
        recipient:   document.getElementById('letter-recipient').value.trim(),
        letter_type: document.getElementById('letter-type').value,
        subject:     document.getElementById('letter-subject').value.trim(),
        facts:       document.getElementById('letter-facts').value.trim(),
      }
    };
  }
  if (agentId === 'invoice') {
    return {
      agent: 'invoice',
      fields: {
        client:      document.getElementById('invoice-client').value.trim(),
        date:        document.getElementById('invoice-date').value.trim(),
        hours:       document.getElementById('invoice-hours').value.trim(),
        rate:        document.getElementById('invoice-rate').value.trim(),
        description: document.getElementById('invoice-description').value.trim(),
      }
    };
  }
  if (agentId === 'hearing') {
    return {
      agent: 'hearing',
      fields: {
        case_name:    document.getElementById('hearing-case').value.trim(),
        hearing_date: document.getElementById('hearing-date').value.trim(),
        parties:      document.getElementById('hearing-parties').value.trim(),
        arguments:    document.getElementById('hearing-arguments').value.trim(),
      }
    };
  }
  if (agentId === 'content') {
    return {
      agent: 'content',
      input:        document.getElementById('content-input').value.trim(),
      content_type: document.querySelector('input[name="content-type"]:checked').value,
    };
  }
  return {
    agent: agentId,
    input: document.getElementById(`${agentId}-input`).value.trim(),
  };
}

// ─── Run agent ────────────────────────────────────────────────────────────────
async function runAgent(agentId) {
  const body       = collectInput(agentId);
  const resultBox  = document.getElementById(`${agentId}-result`);
  const resultText = document.getElementById(`${agentId}-result-text`);

  // Validate non-empty
  const hasInput = body.input
    ? body.input.length > 0
    : Object.values(body.fields || {}).some(v => v.length > 0);
  if (!hasInput) return;

  resultBox.style.display = 'block';
  resultText.textContent  = 'Génération en cours…';
  resultText.className    = 'result-text loading';

  const submitBtn = resultBox.previousElementSibling.querySelector('.btn-primary');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`Erreur serveur : ${response.status}`);

    resultText.textContent = '';
    resultText.className   = 'result-text';

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n').filter(l => l.trim())) {
        try {
          const data = JSON.parse(line);
          if (data.response) resultText.textContent += data.response;
        } catch { /* partial chunk */ }
      }
    }
  } catch (err) {
    resultText.textContent = `Erreur : impossible de contacter le serveur.\n\nDétail : ${err.message}`;
    resultText.className   = 'result-text';
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ─── Copy result ──────────────────────────────────────────────────────────────
function copyResult(elementId) {
  const el = document.getElementById(elementId);
  if (!el?.textContent) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    const btn = el.closest('.result-area').querySelector('.btn-copy');
    const original = btn.textContent;
    btn.textContent = 'Copié ✓';
    setTimeout(() => { btn.textContent = original; }, 2000);
  });
}

// ─── File drop / upload ───────────────────────────────────────────────────────
function handleDrop(event, agentId) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file) readFileToTextarea(file, agentId);
}
function handleFile(event, agentId) {
  const file = event.target.files[0];
  if (file) readFileToTextarea(file, agentId);
}
function readFileToTextarea(file, agentId) {
  const textarea = document.getElementById(`${agentId}-input`);
  if (file.type === 'text/plain') {
    const reader = new FileReader();
    reader.onload = e => { textarea.value = e.target.result; };
    reader.readAsText(file);
  } else {
    textarea.value = `[Fichier : ${file.name}]\n\nCollez le texte extrait ici.`;
  }
}

document.querySelectorAll('.drop-zone').forEach(zone => {
  zone.addEventListener('dragover',  () => zone.classList.add('drag-over'));
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop',      () => zone.classList.remove('drag-over'));
});

// ─── Init ─────────────────────────────────────────────────────────────────────
checkOllamaStatus();
setInterval(checkOllamaStatus, 30000);
```

- [ ] **Step 12: Start server and verify existing interface works**

Run: `uvicorn server:app --port 3000 --reload`
Open: http://localhost:3000
Expected: Interface loads, all 6 agents accessible, Ollama status shows in header.

- [ ] **Step 13: Commit**

```bash
git add requirements.txt server.py prompts.py start.sh data/history.json data/templates.json data/feedback.json tests/ interface/app.js
git commit -m "feat: add FastAPI server, migrate Ollama calls server-side"
```

---

## Task 2: History API + auto-save

History is already auto-saved in `stream_and_save()` from Task 1. This task adds the read endpoint and tests.

**Files:**
- Modify: `server.py`
- Modify: `tests/test_server.py`

- [ ] **Step 1: Add history endpoints to `server.py`**

Add after the `/api/generate` route (before the static mount):
```python
# ─── History ──────────────────────────────────────────────────────────────────

@app.get("/api/history")
def get_history(agent: str = None, limit: int = 20):
    history = read_json(HISTORY_FILE)
    if agent:
        history = [h for h in history if h["agent"] == agent]
    return history[:limit]
```

- [ ] **Step 2: Write failing test**

Add to `tests/test_server.py`:
```python
import json
from pathlib import Path


def test_get_history_empty(tmp_path, monkeypatch):
    monkeypatch.setattr("server.HISTORY_FILE", tmp_path / "history.json")
    (tmp_path / "history.json").write_text("[]")
    response = client.get("/api/history")
    assert response.status_code == 200
    assert response.json() == []


def test_get_history_filters_by_agent(tmp_path, monkeypatch):
    monkeypatch.setattr("server.HISTORY_FILE", tmp_path / "history.json")
    (tmp_path / "history.json").write_text(json.dumps([
        {"id": "1", "agent": "letter", "agent_label": "Rédiger", "input": "x", "output": "y", "created_at": "2026-01-01"},
        {"id": "2", "agent": "invoice", "agent_label": "Facture", "input": "a", "output": "b", "created_at": "2026-01-02"},
    ]))
    response = client.get("/api/history?agent=letter")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["agent"] == "letter"


def test_get_history_limit(tmp_path, monkeypatch):
    monkeypatch.setattr("server.HISTORY_FILE", tmp_path / "history.json")
    entries = [{"id": str(i), "agent": "rag", "agent_label": "RAG", "input": "q", "output": "a", "created_at": "2026-01-01"} for i in range(15)]
    (tmp_path / "history.json").write_text(json.dumps(entries))
    response = client.get("/api/history?limit=5")
    assert len(response.json()) == 5
```

- [ ] **Step 3: Run tests**

Run: `pytest tests/test_server.py -v -k "history"`
Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add server.py tests/test_server.py
git commit -m "feat: add history read endpoint"
```

---

## Task 3: Dashboard view

**Files:**
- Modify: `interface/index.html`
- Modify: `interface/style.css`
- Modify: `interface/app.js`

- [ ] **Step 1: Add dashboard section to `interface/index.html`**

In the sidebar `<nav class="agent-nav">`, add a dashboard button BEFORE the `<p class="nav-label">Agents</p>` line:
```html
<button class="agent-btn active" data-agent="dashboard" id="btn-dashboard">
  <span class="agent-icon">🏠</span>
  Tableau de bord
</button>
<div class="nav-divider"></div>
```

Remove the `active` class from the existing `data-agent="rag"` button (dashboard is now the default active).

Add the dashboard `<section>` as the FIRST agent view inside `<main class="main">`, with `active` class:
```html
<section class="agent-view active" id="agent-dashboard">
  <p class="agent-section-label">Vue d'ensemble</p>
  <h1 class="agent-title">Tableau de bord</h1>
  <p class="agent-desc">Statut du système et dernières activités.</p>

  <div class="dashboard-tiles">
    <div class="tile tile-blue">
      <div class="tile-value" id="tile-count">—</div>
      <div class="tile-label">Générations ce mois</div>
    </div>
    <div class="tile tile-green">
      <div class="tile-value" id="tile-status">●</div>
      <div class="tile-label" id="tile-status-label">Vérification…</div>
    </div>
    <div class="tile tile-yellow">
      <div class="tile-value" id="tile-templates">—</div>
      <div class="tile-label">Modèles sauvegardés</div>
    </div>
  </div>

  <div class="section-heading">Dernières générations</div>
  <div class="history-table" id="dashboard-history">
    <div class="history-empty">Aucune génération pour l'instant.</div>
  </div>
</section>
```

Remove the `active` class from the existing `<section class="agent-view active" id="agent-rag">`.

- [ ] **Step 2: Add dashboard CSS to `interface/style.css`**

Append to the end of `style.css`:
```css
/* ─── Nav divider ────────────────────────────────────────── */
.nav-divider {
  height: 1px;
  background: var(--gray-3);
  margin: 8px 16px;
}

/* ─── Dashboard tiles ────────────────────────────────────── */
.dashboard-tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 32px;
}

.tile {
  border-radius: var(--radius);
  padding: 20px;
  text-align: center;
  border: 1px solid transparent;
}
.tile-blue   { background: #EFF6FF; border-color: #BFDBFE; }
.tile-green  { background: #F0FDF4; border-color: #BBF7D0; }
.tile-yellow { background: #FEFCE8; border-color: #FEF08A; }

.tile-value {
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 4px;
  color: var(--black);
}
.tile-blue   .tile-value { color: #2563EB; }
.tile-green  .tile-value { color: #16A34A; }
.tile-yellow .tile-value { color: #CA8A04; }

.tile-label {
  font-size: 12px;
  color: var(--gray-5);
}

/* ─── Dashboard history table ────────────────────────────── */
.section-heading {
  font-size: 11px;
  font-weight: 600;
  color: var(--gray-4);
  text-transform: uppercase;
  letter-spacing: .08em;
  margin-bottom: 10px;
}

.history-table {
  background: var(--white);
  border: 1px solid var(--gray-3);
  border-radius: var(--radius);
  overflow: hidden;
}

.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
  border-bottom: 1px solid var(--gray-3);
  font-size: 13px;
}
.history-row:last-child { border-bottom: none; }

.history-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  color: var(--blue);
  background: var(--blue-lt);
  border-radius: 4px;
  padding: 2px 7px;
  margin-right: 10px;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.history-input {
  flex: 1;
  color: var(--black);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: 16px;
  flex-shrink: 0;
}

.history-time {
  font-size: 11px;
  color: var(--gray-4);
}

.history-reuse {
  font-size: 12px;
  color: var(--blue);
  cursor: pointer;
  background: none;
  border: none;
  font-family: var(--font);
  padding: 0;
}
.history-reuse:hover { text-decoration: underline; }

.history-empty {
  padding: 20px;
  text-align: center;
  font-size: 13px;
  color: var(--gray-4);
}
```

- [ ] **Step 3: Add dashboard init to `interface/app.js`**

Add these functions before the `// ─── Init` section:
```javascript
// ─── Dashboard ────────────────────────────────────────────────────────────────
function relativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return "à l'instant";
  if (mins < 60)  return `il y a ${mins} min`;
  if (hours < 24) return `il y a ${hours}h`;
  if (days === 1) return 'hier';
  return `il y a ${days} jours`;
}

async function loadDashboard() {
  try {
    const [historyRes, templatesRes, statusRes] = await Promise.all([
      fetch('/api/history?limit=10'),
      fetch('/api/templates'),
      fetch('/api/status'),
    ]);
    const history   = await historyRes.json();
    const templates = await templatesRes.json();
    const status    = await statusRes.json();

    // Tiles
    const now = new Date();
    const thisMonth = history.filter(h => {
      const d = new Date(h.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    document.getElementById('tile-count').textContent     = thisMonth.length;
    document.getElementById('tile-templates').textContent = templates.length;

    const statusDot   = document.getElementById('tile-status');
    const statusLabel = document.getElementById('tile-status-label');
    if (status.online) {
      statusDot.textContent   = '●';
      statusLabel.textContent = 'Ollama actif';
    } else {
      statusDot.textContent   = '●';
      statusDot.style.color   = '#EF4444';
      statusLabel.textContent = 'Ollama hors ligne';
    }

    // History table
    const container = document.getElementById('dashboard-history');
    if (history.length === 0) {
      container.innerHTML = '<div class="history-empty">Aucune génération pour l\'instant.</div>';
      return;
    }
    container.innerHTML = history.map(h => `
      <div class="history-row">
        <div class="history-input">
          <span class="history-badge">${h.agent_label.split(' ')[0].toUpperCase()}</span>
          ${escapeHtml(h.input)}
        </div>
        <div class="history-meta">
          <span class="history-time">${relativeTime(h.created_at)}</span>
          <button class="history-reuse" onclick="reuseHistory('${h.agent}', ${JSON.stringify(JSON.stringify(h.input))})">Réutiliser →</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function reuseHistory(agentId, inputJson) {
  const input = JSON.parse(inputJson);
  // Switch to agent
  document.querySelectorAll('.agent-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-agent="${agentId}"]`)?.classList.add('active');
  document.querySelectorAll('.agent-view').forEach(v => v.classList.remove('active'));
  document.getElementById(`agent-${agentId}`)?.classList.add('active');
  // Fill input (free-text agents only for now)
  const inputEl = document.getElementById(`${agentId}-input`);
  if (inputEl) inputEl.value = input;
}
```

Update the agent switching listener to reload the dashboard when it's selected:
```javascript
document.querySelectorAll('.agent-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.agent;
    document.querySelectorAll('.agent-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.agent-view').forEach(v => v.classList.remove('active'));
    document.getElementById(`agent-${id}`).classList.add('active');
    if (id === 'dashboard') loadDashboard();
  });
});
```

Update the `// ─── Init` section to call `loadDashboard()`:
```javascript
checkOllamaStatus();
setInterval(checkOllamaStatus, 30000);
loadDashboard();
```

- [ ] **Step 4: Add `/api/templates` stub to `server.py`** (needed for dashboard to load without error — full implementation in Task 4)

Add after `/api/history`:
```python
@app.get("/api/templates")
def get_templates(agent: str = None):
    templates = read_json(TEMPLATES_FILE)
    if agent:
        templates = [t for t in templates if t["agent"] == agent]
    return templates
```

- [ ] **Step 5: Verify in browser**

Run: `uvicorn server:app --port 3000 --reload`
Open: http://localhost:3000
Expected: Dashboard loads as default view, 3 tiles show, history table shows "Aucune génération pour l'instant."

- [ ] **Step 6: Commit**

```bash
git add server.py interface/index.html interface/style.css interface/app.js
git commit -m "feat: add dashboard view with tiles and history table"
```

---

## Task 4: Templates

**Files:**
- Modify: `server.py`
- Modify: `interface/index.html`
- Modify: `interface/style.css`
- Modify: `interface/app.js`
- Modify: `tests/test_server.py`

- [ ] **Step 1: Add template POST and DELETE endpoints to `server.py`**

Replace the stub `/api/templates` GET with full CRUD:
```python
# ─── Templates ────────────────────────────────────────────────────────────────

@app.get("/api/templates")
def get_templates(agent: str = None):
    templates = read_json(TEMPLATES_FILE)
    if agent:
        templates = [t for t in templates if t["agent"] == agent]
    return templates


@app.post("/api/templates", status_code=201)
async def create_template(request: Request):
    body = await request.json()
    agent = body.get("agent")
    label = body.get("label", "").strip()
    prompt = body.get("prompt", "").strip()
    if not agent or not label or not prompt:
        raise HTTPException(status_code=400, detail="agent, label and prompt are required")
    templates = read_json(TEMPLATES_FILE)
    entry = {
        "id": str(uuid.uuid4()),
        "agent": agent,
        "label": label,
        "prompt": prompt,
        "created_at": datetime.now().isoformat(),
    }
    templates.append(entry)
    write_json(TEMPLATES_FILE, templates)
    return entry


@app.delete("/api/templates/{template_id}", status_code=204)
def delete_template(template_id: str):
    templates = read_json(TEMPLATES_FILE)
    updated = [t for t in templates if t["id"] != template_id]
    if len(updated) == len(templates):
        raise HTTPException(status_code=404, detail="Template not found")
    write_json(TEMPLATES_FILE, updated)
```

- [ ] **Step 2: Write tests**

Add to `tests/test_server.py`:
```python
def test_create_template(tmp_path, monkeypatch):
    monkeypatch.setattr("server.TEMPLATES_FILE", tmp_path / "templates.json")
    (tmp_path / "templates.json").write_text("[]")
    response = client.post("/api/templates", json={
        "agent": "letter",
        "label": "Mise en demeure standard",
        "prompt": "Rédige une mise en demeure pour...",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["agent"] == "letter"
    assert "id" in data


def test_delete_template(tmp_path, monkeypatch):
    monkeypatch.setattr("server.TEMPLATES_FILE", tmp_path / "templates.json")
    (tmp_path / "templates.json").write_text(json.dumps([
        {"id": "abc", "agent": "letter", "label": "Test", "prompt": "...", "created_at": "2026-01-01"}
    ]))
    response = client.delete("/api/templates/abc")
    assert response.status_code == 204
    remaining = json.loads((tmp_path / "templates.json").read_text())
    assert remaining == []


def test_delete_template_not_found(tmp_path, monkeypatch):
    monkeypatch.setattr("server.TEMPLATES_FILE", tmp_path / "templates.json")
    (tmp_path / "templates.json").write_text("[]")
    response = client.delete("/api/templates/nonexistent")
    assert response.status_code == 404
```

- [ ] **Step 3: Run tests**

Run: `pytest tests/test_server.py -v -k "template"`
Expected: All PASS.

- [ ] **Step 4: Add template pills HTML to each agent view in `interface/index.html`**

For each of the 6 agent views (rag, letter, summary, invoice, hearing, content), add this block BEFORE the `<div class="input-card">`:
```html
<div class="template-pills" id="AGENTID-templates"></div>
```

Replace `AGENTID` with the actual agent ID (`rag`, `letter`, `summary`, `invoice`, `hearing`, `content`).

Also add a "Sauvegarder ce modèle" button to each result area footer. In each `<div class="result-area">`, after the `<div class="result-text">`, add:
```html
<div class="result-footer" id="AGENTID-result-footer" style="display:none">
  <button class="btn-save-template" onclick="promptSaveTemplate('AGENTID')">＋ Sauvegarder ce modèle</button>
</div>
```

- [ ] **Step 5: Add template CSS to `interface/style.css`**

Append:
```css
/* ─── Template pills ─────────────────────────────────────── */
.template-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  min-height: 0;
}
.template-pills:empty { display: none; }

.template-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--gray-3);
  border-radius: 20px;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--black);
  background: var(--white);
  cursor: pointer;
  transition: border-color .15s, background .15s;
}
.template-pill:hover { border-color: var(--blue); background: var(--blue-lt); }

.template-pill-delete {
  color: var(--gray-4);
  font-size: 14px;
  line-height: 1;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.template-pill-delete:hover { color: #EF4444; }

.btn-save-template {
  background: none;
  border: none;
  font-family: var(--font);
  font-size: 12px;
  color: var(--blue);
  cursor: pointer;
  padding: 10px 16px;
}
.btn-save-template:hover { text-decoration: underline; }

.result-footer {
  border-top: 1px solid var(--gray-3);
  padding: 6px 8px;
}
```

- [ ] **Step 6: Add template JS to `interface/app.js`**

Add before the `// ─── Init` section:
```javascript
// ─── Templates ────────────────────────────────────────────────────────────────
async function loadTemplates(agentId) {
  const container = document.getElementById(`${agentId}-templates`);
  if (!container) return;
  try {
    const res = await fetch(`/api/templates?agent=${agentId}`);
    const templates = await res.json();
    container.innerHTML = templates.map(t => `
      <span class="template-pill" onclick="applyTemplate('${agentId}', ${JSON.stringify(JSON.stringify(t.prompt))})">
        📌 ${escapeHtml(t.label)}
        <button class="template-pill-delete" onclick="deleteTemplate(event, '${t.id}', '${agentId}')">✕</button>
      </span>
    `).join('');
  } catch (e) {
    console.error('loadTemplates error:', e);
  }
}

function applyTemplate(agentId, promptJson) {
  const prompt = JSON.parse(promptJson);
  const inputEl = document.getElementById(`${agentId}-input`);
  if (inputEl) inputEl.value = prompt;
}

async function deleteTemplate(event, id, agentId) {
  event.stopPropagation();
  await fetch(`/api/templates/${id}`, { method: 'DELETE' });
  loadTemplates(agentId);
}

async function promptSaveTemplate(agentId) {
  const inputEl = document.getElementById(`${agentId}-input`);
  const prompt  = inputEl?.value?.trim();
  if (!prompt) return;
  const label = window.prompt('Nom du modèle :', prompt.slice(0, 40));
  if (!label) return;
  await fetch('/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: agentId, label, prompt }),
  });
  loadTemplates(agentId);
}
```

Update the agent switching listener to also load templates and the last history entry when switching:
```javascript
document.querySelectorAll('.agent-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.agent;
    document.querySelectorAll('.agent-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.agent-view').forEach(v => v.classList.remove('active'));
    document.getElementById(`agent-${id}`).classList.add('active');
    if (id === 'dashboard') loadDashboard();
    else loadTemplates(id);
  });
});
```

Update `runAgent()` — after the stream completes successfully, show the result footer. Add this line right before the `} catch` block:
```javascript
    // Show save template button after successful generation
    const footer = document.getElementById(`${agentId}-result-footer`);
    if (footer) footer.style.display = 'block';
```

- [ ] **Step 7: Verify in browser**

Open: http://localhost:3000 → select "Rédiger un courrier"
Expected: Empty template pills area (no pills yet). Run a generation. "＋ Sauvegarder ce modèle" button appears. Click it, enter a name. Pill appears. Click pill → fills input. Hover pill → ✕ appears. Click ✕ → pill removed.

- [ ] **Step 8: Commit**

```bash
git add server.py interface/index.html interface/style.css interface/app.js tests/test_server.py
git commit -m "feat: add saved templates with pill UI"
```

---

## Task 5: Feedback

**Files:**
- Modify: `server.py`
- Modify: `interface/index.html`
- Modify: `interface/style.css`
- Modify: `interface/app.js`
- Modify: `tests/test_server.py`

- [ ] **Step 1: Add feedback endpoint to `server.py`**

Add after the templates routes:
```python
# ─── Feedback ─────────────────────────────────────────────────────────────────

@app.post("/api/feedback", status_code=201)
async def post_feedback(request: Request):
    body = await request.json()
    agent  = body.get("agent")
    rating = body.get("rating")
    if agent not in AGENT_LABELS:
        raise HTTPException(status_code=400, detail="invalid agent")
    if rating not in ("up", "down"):
        raise HTTPException(status_code=400, detail="rating must be 'up' or 'down'")
    feedback = read_json(FEEDBACK_FILE)
    entry = {
        "id":         str(uuid.uuid4()),
        "history_id": body.get("history_id", ""),
        "agent":      agent,
        "rating":     rating,
        "created_at": datetime.now().isoformat(),
    }
    feedback.append(entry)
    write_json(FEEDBACK_FILE, feedback)
    return entry
```

- [ ] **Step 2: Write tests**

Add to `tests/test_server.py`:
```python
def test_post_feedback_up(tmp_path, monkeypatch):
    monkeypatch.setattr("server.FEEDBACK_FILE", tmp_path / "feedback.json")
    (tmp_path / "feedback.json").write_text("[]")
    response = client.post("/api/feedback", json={"agent": "letter", "rating": "up"})
    assert response.status_code == 201
    assert response.json()["rating"] == "up"


def test_post_feedback_invalid_rating(tmp_path, monkeypatch):
    monkeypatch.setattr("server.FEEDBACK_FILE", tmp_path / "feedback.json")
    (tmp_path / "feedback.json").write_text("[]")
    response = client.post("/api/feedback", json={"agent": "letter", "rating": "meh"})
    assert response.status_code == 400


def test_post_feedback_invalid_agent(tmp_path, monkeypatch):
    monkeypatch.setattr("server.FEEDBACK_FILE", tmp_path / "feedback.json")
    (tmp_path / "feedback.json").write_text("[]")
    response = client.post("/api/feedback", json={"agent": "unknown", "rating": "up"})
    assert response.status_code == 400
```

- [ ] **Step 3: Run tests**

Run: `pytest tests/test_server.py -v -k "feedback"`
Expected: All PASS.

- [ ] **Step 4: Add feedback row HTML to each agent result area in `interface/index.html`**

For each of the 6 agent views, add this block AFTER the `<div class="result-area">` (i.e., as a sibling, not inside it):
```html
<div class="feedback-row" id="AGENTID-feedback-row" style="display:none">
  <span class="feedback-question">Cette réponse était-elle utile ?</span>
  <button class="feedback-btn" id="AGENTID-thumb-up"   onclick="sendFeedback('AGENTID', 'up')">👍</button>
  <button class="feedback-btn" id="AGENTID-thumb-down" onclick="sendFeedback('AGENTID', 'down')">👎</button>
</div>
```

- [ ] **Step 5: Add feedback CSS to `interface/style.css`**

Append:
```css
/* ─── Feedback row ───────────────────────────────────────── */
.feedback-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: 13px;
  color: var(--gray-5);
}

.feedback-question { flex-shrink: 0; }

.feedback-btn {
  background: none;
  border: 1px solid var(--gray-3);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 16px;
  cursor: pointer;
  transition: border-color .15s, background .15s;
}
.feedback-btn:hover   { border-color: var(--blue); background: var(--blue-lt); }
.feedback-btn.active  { border-color: var(--blue); background: var(--blue-lt); }
```

- [ ] **Step 6: Add feedback JS to `interface/app.js`**

Add before `// ─── Init`:
```javascript
// ─── Feedback ─────────────────────────────────────────────────────────────────
async function sendFeedback(agentId, rating) {
  document.getElementById(`${agentId}-thumb-up`).classList.remove('active');
  document.getElementById(`${agentId}-thumb-down`).classList.remove('active');
  document.getElementById(`${agentId}-thumb-${rating === 'up' ? 'up' : 'down'}`).classList.add('active');
  try {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agentId, rating }),
    });
  } catch (e) {
    console.error('Feedback error:', e);
  }
}
```

In `runAgent()`, after the stream completes successfully (right before `} catch`), add:
```javascript
    // Show feedback row
    const feedbackRow = document.getElementById(`${agentId}-feedback-row`);
    if (feedbackRow) {
      feedbackRow.style.display = 'flex';
      // Reset thumbs
      document.getElementById(`${agentId}-thumb-up`)?.classList.remove('active');
      document.getElementById(`${agentId}-thumb-down`)?.classList.remove('active');
    }
```

- [ ] **Step 7: Verify in browser**

Run a generation → feedback row appears below the result. Click 👍 → button turns blue. Click 👎 → 👎 turns blue, 👍 resets. Check `data/feedback.json` → entry saved.

- [ ] **Step 8: Commit**

```bash
git add server.py interface/index.html interface/style.css interface/app.js tests/test_server.py
git commit -m "feat: add 👍/👎 feedback with server persistence"
```

---

## Task 6: Guided forms

Replaces free-text textareas in the invoice, letter, and hearing agents with structured fields.

**Files:**
- Modify: `interface/index.html`
- Modify: `interface/style.css`

- [ ] **Step 1: Replace invoice agent HTML in `interface/index.html`**

Replace the `<div class="input-card">` inside `#agent-invoice` with:
```html
<div class="input-card">
  <div class="guided-form">
    <div class="form-row">
      <div class="form-field">
        <label class="form-label">Nom du client *</label>
        <input class="form-input" id="invoice-client" type="text" placeholder="Société ABC" />
      </div>
      <div class="form-field">
        <label class="form-label">Date de la prestation *</label>
        <input class="form-input" id="invoice-date" type="text" placeholder="14/04/2026" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-field">
        <label class="form-label">Nombre d'heures *</label>
        <input class="form-input" id="invoice-hours" type="number" min="0" step="0.5" placeholder="3" />
      </div>
      <div class="form-field">
        <label class="form-label">Taux horaire (€) *</label>
        <input class="form-input" id="invoice-rate" type="number" min="0" placeholder="350" />
      </div>
    </div>
    <div class="form-field">
      <label class="form-label">Description de la prestation</label>
      <input class="form-input" id="invoice-description" type="text" placeholder="Conseil en transformation société à mission" />
    </div>
  </div>
  <button class="btn-primary" onclick="runAgent('invoice')">Générer</button>
</div>
```

- [ ] **Step 2: Replace letter agent HTML in `interface/index.html`**

Replace the `<div class="input-card">` inside `#agent-letter` with:
```html
<div class="input-card">
  <div class="guided-form">
    <div class="form-row">
      <div class="form-field">
        <label class="form-label">Destinataire *</label>
        <input class="form-input" id="letter-recipient" type="text" placeholder="Société Martin" />
      </div>
      <div class="form-field">
        <label class="form-label">Type de courrier *</label>
        <select class="form-input" id="letter-type">
          <option value="mise en demeure">Mise en demeure</option>
          <option value="notification">Notification</option>
          <option value="relance">Relance</option>
          <option value="information">Courrier d'information</option>
        </select>
      </div>
    </div>
    <div class="form-field">
      <label class="form-label">Objet *</label>
      <input class="form-input" id="letter-subject" type="text" placeholder="Non-respect des statuts de la société à mission" />
    </div>
    <div class="form-field">
      <label class="form-label">Faits et éléments clés</label>
      <textarea class="form-input" id="letter-facts" rows="3" placeholder="Décrivez les faits, dates, obligations non respectées…"></textarea>
    </div>
  </div>
  <button class="btn-primary" onclick="runAgent('letter')">Rédiger</button>
</div>
```

- [ ] **Step 3: Replace hearing agent HTML in `interface/index.html`**

Replace the `<div class="input-card">` inside `#agent-hearing` with:
```html
<div class="input-card">
  <div class="guided-form">
    <div class="form-row">
      <div class="form-field">
        <label class="form-label">Nom du dossier *</label>
        <input class="form-input" id="hearing-case" type="text" placeholder="Dossier Legrand" />
      </div>
      <div class="form-field">
        <label class="form-label">Date d'audience *</label>
        <input class="form-input" id="hearing-date" type="text" placeholder="15/04/2026" />
      </div>
    </div>
    <div class="form-field">
      <label class="form-label">Parties</label>
      <input class="form-input" id="hearing-parties" type="text" placeholder="Legrand vs Martin" />
    </div>
    <div class="form-field">
      <label class="form-label">Arguments et faits principaux *</label>
      <textarea class="form-input" id="hearing-arguments" rows="4" placeholder="Décrivez les arguments, les faits, les points de droit…"></textarea>
    </div>
  </div>
  <button class="btn-primary" onclick="runAgent('hearing')">Préparer</button>
</div>
```

- [ ] **Step 4: Add guided form CSS to `interface/style.css`**

Append:
```css
/* ─── Guided forms ───────────────────────────────────────── */
.guided-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--gray-5);
}

.form-input {
  padding: 10px 12px;
  border: 1px solid var(--gray-3);
  border-radius: 6px;
  font-family: var(--font);
  font-size: 14px;
  color: var(--black);
  background: var(--gray-1);
  outline: none;
  transition: border-color .2s, background .2s;
  width: 100%;
}
.form-input:focus {
  border-color: var(--blue);
  background: var(--white);
}
.form-input::placeholder { color: var(--gray-4); }

select.form-input { cursor: pointer; }
textarea.form-input { resize: vertical; }
```

- [ ] **Step 5: Verify in browser**

Open each of the 3 guided-form agents. Expected: Structured fields instead of blank textarea. Fill in fields and generate → result appears correctly.

- [ ] **Step 6: Commit**

```bash
git add interface/index.html interface/style.css
git commit -m "feat: replace textareas with guided forms for invoice, letter, hearing"
```

---

## Task 7: Export Word / PDF

**Files:**
- Modify: `server.py`
- Modify: `interface/index.html`
- Modify: `interface/style.css`
- Modify: `interface/app.js`
- Modify: `tests/test_server.py`

- [ ] **Step 1: Add export endpoint to `server.py`**

Add the following imports at the top of `server.py`:
```python
import io
from docx import Document
from docx.shared import Pt, RGBColor
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from fastapi.responses import Response
```

Add the export endpoint after the feedback route:
```python
# ─── Export ───────────────────────────────────────────────────────────────────

AGENT_LABELS_SHORT = {
    "rag":     "Consultation dossiers",
    "letter":  "Courrier juridique",
    "summary": "Résumé de document",
    "invoice": "Facture",
    "hearing": "Fiche d'audience",
    "content": "Contenu",
}


def _make_docx(content: str, agent: str) -> bytes:
    doc = Document()
    # Letterhead
    heading = doc.add_heading("Le Play Avocats", level=1)
    heading.runs[0].font.color.rgb = RGBColor(0x0D, 0x0D, 0x0D)
    doc.add_paragraph(
        f"{AGENT_LABELS_SHORT.get(agent, agent)}  —  {datetime.now().strftime('%d/%m/%Y')}"
    ).runs[0].font.size = Pt(10)
    doc.add_paragraph("─" * 60)
    # Body
    for line in content.split("\n"):
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _make_pdf(content: str, agent: str) -> bytes:
    buf = io.BytesIO()
    doc_pdf = SimpleDocTemplate(buf, pagesize=A4,
                                leftMargin=2.5*cm, rightMargin=2.5*cm,
                                topMargin=2.5*cm, bottomMargin=2.5*cm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Heading1"],
                                 fontSize=16, spaceAfter=4)
    meta_style  = ParagraphStyle("meta",  parent=styles["Normal"],
                                 fontSize=9, textColor=(0.4, 0.4, 0.4), spaceAfter=12)
    body_style  = ParagraphStyle("body",  parent=styles["Normal"],
                                 fontSize=11, leading=16)

    story = [
        Paragraph("Le Play Avocats", title_style),
        Paragraph(
            f"{AGENT_LABELS_SHORT.get(agent, agent)} &mdash; {datetime.now().strftime('%d/%m/%Y')}",
            meta_style,
        ),
        Spacer(1, 0.3*cm),
    ]
    for line in content.split("\n"):
        story.append(Paragraph(line.replace("&", "&amp;") or "&nbsp;", body_style))
    doc_pdf.build(story)
    return buf.getvalue()


@app.post("/api/export")
async def export_document(request: Request):
    body = await request.json()
    content = body.get("content", "").strip()
    agent   = body.get("agent", "")
    fmt     = body.get("format", "pdf")

    if not content:
        raise HTTPException(status_code=400, detail="content is required")
    if fmt not in ("pdf", "docx"):
        raise HTTPException(status_code=400, detail="format must be 'pdf' or 'docx'")

    date_str  = datetime.now().strftime("%Y%m%d")
    label     = AGENT_LABELS_SHORT.get(agent, "document").replace(" ", "-").lower()
    filename  = f"leplay-{label}-{date_str}.{fmt}"

    if fmt == "docx":
        file_bytes   = _make_docx(content, agent)
        content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        file_bytes   = _make_pdf(content, agent)
        content_type = "application/pdf"

    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

- [ ] **Step 2: Write tests**

Add to `tests/test_server.py`:
```python
def test_export_pdf():
    response = client.post("/api/export", json={
        "content": "Ceci est un test de génération PDF.",
        "agent": "letter",
        "format": "pdf",
    })
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert b"%PDF" in response.content


def test_export_docx():
    response = client.post("/api/export", json={
        "content": "Ceci est un test de génération Word.",
        "agent": "invoice",
        "format": "docx",
    })
    assert response.status_code == 200
    assert "wordprocessingml" in response.headers["content-type"]
    # DOCX files start with PK (zip magic bytes)
    assert response.content[:2] == b"PK"


def test_export_missing_content():
    response = client.post("/api/export", json={"agent": "letter", "format": "pdf"})
    assert response.status_code == 400


def test_export_invalid_format():
    response = client.post("/api/export", json={"content": "test", "agent": "letter", "format": "txt"})
    assert response.status_code == 400
```

- [ ] **Step 3: Run tests**

Run: `pytest tests/test_server.py -v -k "export"`
Expected: All PASS.

- [ ] **Step 4: Add export buttons to each result area header in `interface/index.html`**

For each of the 6 agent views, replace the `<div class="result-header">` inside the result area with:
```html
<div class="result-header">
  <span>LABEL ICI</span>
  <div class="result-actions">
    <button class="btn-copy"   onclick="copyResult('AGENTID-result-text')">Copier</button>
    <button class="btn-export" onclick="exportResult('AGENTID', 'docx')">↓ Word</button>
    <button class="btn-export btn-export-pdf" onclick="exportResult('AGENTID', 'pdf')">↓ PDF</button>
  </div>
</div>
```

Use these labels:
- rag → `Réponse`
- letter → `Courrier généré`
- summary → `Résumé`
- invoice → `Facture générée`
- hearing → `Fiche d'audience`
- content → `Contenu généré`

- [ ] **Step 5: Add export CSS to `interface/style.css`**

Append:
```css
/* ─── Export buttons ─────────────────────────────────────── */
.result-actions {
  display: flex;
  gap: 6px;
}

.btn-export {
  padding: 5px 12px;
  background: none;
  border: 1px solid var(--blue);
  border-radius: 6px;
  font-family: var(--font);
  font-size: 12px;
  color: var(--blue);
  cursor: pointer;
  transition: background .15s;
}
.btn-export:hover { background: var(--blue-lt); }

.btn-export-pdf {
  background: var(--blue);
  color: var(--white);
}
.btn-export-pdf:hover { background: var(--blue-dark); }
```

- [ ] **Step 6: Add export JS to `interface/app.js`**

Add before `// ─── Init`:
```javascript
// ─── Export ───────────────────────────────────────────────────────────────────
async function exportResult(agentId, format) {
  const content = document.getElementById(`${agentId}-result-text`)?.textContent?.trim();
  if (!content) return;

  try {
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, agent: agentId, format }),
    });
    if (!response.ok) throw new Error(`Export error: ${response.status}`);

    const blob     = await response.blob();
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
                     || `leplay-export.${format}`;
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(`Erreur lors de l'export : ${e.message}`);
  }
}
```

- [ ] **Step 7: Full test run**

Run: `pytest tests/ -v`
Expected: All tests PASS.

- [ ] **Step 8: Verify in browser**

Generate a letter. Click "↓ Word" → `.docx` file downloads. Open in Word → Le Play Avocats header, date, content. Click "↓ PDF" → PDF downloads. Open in Preview → same layout.

- [ ] **Step 9: Final commit**

```bash
git add server.py interface/index.html interface/style.css interface/app.js tests/test_server.py
git commit -m "feat: add Word and PDF export with Le Play Avocats letterhead"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ FastAPI server with all endpoints
- ✅ Dashboard: 3 tiles + history table + "Réutiliser" link
- ✅ Guided forms: invoice, letter, hearing — fields match spec exactly
- ✅ Export: Word + PDF, letterhead, server-side, no external services
- ✅ Templates: GET/POST/DELETE, pills UI, save button after generation
- ✅ History: auto-saved in stream_and_save, GET with agent filter and limit
- ✅ Feedback: 👍/👎, persisted, appears after generation
- ✅ `start.sh` updated
- ✅ `data/*.json` files initialized

**Type consistency:** `AGENT_LABELS` dict defined once in `prompts.py`, imported in `server.py`. `AGENT_LABELS_SHORT` for export filenames defined in `server.py` (different purpose, different dict).

**No placeholders:** All code is complete and runnable.
